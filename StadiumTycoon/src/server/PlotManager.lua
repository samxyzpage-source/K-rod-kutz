--[[
	PlotManager
	Owns every stadium plot: claiming, buy buttons, purchases, building pieces, the vault /
	collect pad, and the live displays (scoreboard, jumbotron, flood lights).

	Player attributes set here (read by the HUD):
	  PlotIndex   number of the plot the player owns (nil = none yet)
	  Income      cash per second the player's stadium earns
	  Built       how many stadium pieces the player owns
	  NextGoal    item id of the cheapest buy button showing (the client draws a guide beam to it)

	The Tycoons folder gets a "FreePlots" attribute (how many plots nobody owns) for the HUD.
]]

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local Shared = ReplicatedStorage:WaitForChild("TycoonShared")
local Config = require(Shared:WaitForChild("Config"))
local Items = require(Shared:WaitForChild("Items"))
local Format = require(Shared:WaitForChild("Format"))

local BuildUtil = require(script.Parent.BuildUtil)
local Builders = require(script.Parent.Builders)
local GameDay = require(script.Parent.GameDay)
local PlayerData = require(script.Parent.PlayerData)
local World = require(script.Parent.World)

local PlotManager = {}

local plots = {} -- array of plot tables
local plotByPlayer = {} -- [Player] = plot
local claiming = {} -- [Player] = true while waiting for their data
local cooldowns = {} -- [Player] = { [key] = os.clock() }
local notifyRemote = nil
local isNight = false
local incomeBoost = 1 -- multiplier while a game day is on
local gameDayActive = false
local rng = Random.new()

local tycoonsFolder = nil
local UNCLAIMED_TRIGGER_TRANSPARENCY = 0.55
local BUTTON_TAG = "TycoonBuyButton" -- Effects.client.lua makes these pulse
local ANIMATION_TIME = 0.55
local ANIMATION_MAX_DELAY = 0.5

---------------------------------------------------------------------------------------------
-- Helpers
---------------------------------------------------------------------------------------------

local function notify(player, message, kind)
	if notifyRemote and player and player.Parent then
		notifyRemote:FireClient(player, message, kind or "info")
	end
end

-- Returns true (and starts the cooldown) if `key` hasn't fired for this player in `seconds`.
local function cooldownReady(player, key, seconds)
	local now = os.clock()
	local map = cooldowns[player]
	if not map then
		map = {}
		cooldowns[player] = map
	end
	if map[key] and now - map[key] < seconds then
		return false
	end
	map[key] = now
	return true
end

-- The living player whose character touched `hit`, or nil.
local function playerFromHit(hit)
	local character = hit:FindFirstAncestorOfClass("Model")
	if not character then
		return nil
	end
	local player = Players:GetPlayerFromCharacter(character)
	if not player then
		return nil
	end
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	if not humanoid or humanoid.Health <= 0 then
		return nil
	end
	return player
end

-- "Sam_The-Builder 99" -> "SAMTHEBUILDER9" (letters/digits only, max 14 chars)
local function makeTeamName(player)
	local name = string.upper(player.DisplayName):gsub("[^%w]", "")
	if #name == 0 then
		name = string.upper(player.Name):gsub("[^%w]", "")
	end
	if #name == 0 then
		name = "HOME"
	end
	return string.sub(name, 1, 14)
end

local function countOwned(plot)
	local count = 0
	for _ in pairs(plot.Owned) do
		count += 1
	end
	return count
end

---------------------------------------------------------------------------------------------
-- Displays
---------------------------------------------------------------------------------------------

local function findLabel(plot, itemId, labelName)
	local model = plot.ItemModels[itemId]
	if not model then
		return nil
	end
	local label = model:FindFirstChild(labelName, true)
	if label and label:IsA("TextLabel") then
		return label
	end
	return nil
end

local function updateVault(plot)
	local label = plot.Refs.VaultLabel
	if plot.Owner then
		label.Text = Format.MoneyExact(math.floor(plot.Vault))
	else
		label.Text = "$0"
	end
end

local function attendance(plot)
	return plot.Income * Config.AttendancePerIncome
end

local function updateScoreboard(plot)
	local title = findLabel(plot, "scoreboard", "ScoreboardTitle")
	if title then
		title.Text = plot.TeamName .. " STADIUM"
	end
	local score = findLabel(plot, "scoreboard", "ScoreboardScore")
	if score then
		score.Text = ("HOME %d  -  AWAY %d"):format(plot.HomeScore, plot.AwayScore)
	end
	local crowd = findLabel(plot, "scoreboard", "ScoreboardAttendance")
	if crowd then
		crowd.Text = "ATTENDANCE " .. Format.Commas(attendance(plot))
	end
end

local function applyLights(plot)
	local model = plot.ItemModels.lights
	if not model then
		return
	end
	for _, descendant in ipairs(model:GetDescendants()) do
		if descendant:IsA("SpotLight") or descendant:IsA("PointLight") or descendant:IsA("SurfaceLight") then
			if descendant.Name == "FloodLight" then
				descendant.Enabled = isNight
			end
		elseif descendant:IsA("BasePart") and descendant.Name == "FloodPanel" then
			descendant.Material = isNight and Enum.Material.Neon or Enum.Material.SmoothPlastic
		end
	end
end

local function updateButtonColors(plot)
	if not plot.Owner then
		return
	end
	local cash = PlayerData.GetCash(plot.Owner)
	for itemId, button in pairs(plot.Buttons) do
		local item = Items.ById[itemId]
		button.Color = (cash >= item.Cost) and Config.Colors.ButtonAffordable or Config.Colors.ButtonTooExpensive
	end
end

local function updateOwnerAttributes(plot)
	local owner = plot.Owner
	if owner then
		owner:SetAttribute("Income", plot.Income * Config.IncomeMultiplier * incomeBoost)
		owner:SetAttribute("Built", countOwned(plot))
	end
end

local function recalcIncome(plot)
	plot.Income = Items.TotalIncome(plot.Owned)
	updateOwnerAttributes(plot)
	updateScoreboard(plot)
end

---------------------------------------------------------------------------------------------
-- Building pieces
---------------------------------------------------------------------------------------------

-- Parts start below their final spot and invisible, then rise into place. Text, lights and
-- collisions are switched off while the piece rises and switched back on when it lands.
local function animateIn(model)
	local parts = {}
	local hidden = {} -- { instance, property, originalValue }
	for _, descendant in ipairs(model:GetDescendants()) do
		if descendant:IsA("BasePart") then
			table.insert(parts, descendant)
			if descendant.CanCollide then
				table.insert(hidden, { descendant, "CanCollide", true })
				descendant.CanCollide = false
			end
		elseif descendant:IsA("LayerCollector") or (descendant:IsA("Light") and descendant.Name ~= "FloodLight") then
			-- SurfaceGui / BillboardGui / lights (flood lights are handled by the night logic)
			if descendant.Enabled then
				table.insert(hidden, { descendant, "Enabled", true })
				descendant.Enabled = false
			end
		end
	end
	if #hidden > 0 then
		task.delay(ANIMATION_TIME + ANIMATION_MAX_DELAY + 0.05, function()
			for _, entry in ipairs(hidden) do
				local instance, property, value = entry[1], entry[2], entry[3]
				if instance.Parent then
					instance[property] = value
				end
			end
		end)
	end
	if #parts == 0 then
		return
	end
	local minY, maxY = math.huge, -math.huge
	for _, part in ipairs(parts) do
		local y = part.CFrame.Position.Y
		minY = math.min(minY, y)
		maxY = math.max(maxY, y)
	end
	local heightRange = math.max(maxY - minY, 1)
	for _, part in ipairs(parts) do
		local targetCFrame = part.CFrame
		local targetTransparency = part.Transparency
		local delayTime = (targetCFrame.Position.Y - minY) / heightRange * ANIMATION_MAX_DELAY
		part.CFrame = targetCFrame - Vector3.new(0, 6, 0)
		part.Transparency = 1
		local tween = TweenService:Create(
			part,
			TweenInfo.new(ANIMATION_TIME, Enum.EasingStyle.Back, Enum.EasingDirection.Out, 0, false, delayTime),
			{ CFrame = targetCFrame, Transparency = targetTransparency }
		)
		tween:Play()
	end
end

local function buildItem(plot, item, animate)
	local builder = Builders[item.Id]
	if not builder then
		warn("[PlotManager] No builder for item " .. item.Id)
		return
	end
	local model = Instance.new("Model")
	model.Name = item.Id
	local ctx = BuildUtil.NewContext(plot.Origin, model, plot.Palette, plot.TeamName, Config)
	local ok, err = pcall(builder, ctx)
	if not ok then
		warn(("[PlotManager] Builder '%s' failed: %s"):format(item.Id, tostring(err)))
	end
	model.Parent = plot.ItemsFolder
	plot.ItemModels[item.Id] = model
	if animate and Config.BuildAnimation then
		local animated, animationError = pcall(animateIn, model)
		if not animated then
			warn("[PlotManager] Build animation failed: " .. tostring(animationError))
		end
	end

	if item.Id == "lights" then
		applyLights(plot)
	elseif item.Id == "scoreboard" then
		updateScoreboard(plot)
	elseif item.Id == "jumbotron" then
		local screen = findLabel(plot, "jumbotron", "JumbotronText")
		if screen then
			screen.Text = plot.TeamName
		end
	end
end

---------------------------------------------------------------------------------------------
-- Buttons
---------------------------------------------------------------------------------------------

local onButtonTouched -- forward declaration

local function createButton(plot, item)
	local pad = Instance.new("Part")
	pad.Name = "Buy_" .. item.Id
	pad.Anchored = true
	pad.CanCollide = true
	pad.Size = Vector3.new(6, 0.6, 6)
	pad.CFrame = plot.Origin * CFrame.new(item.Button.X, item.Button.Y + 0.3, item.Button.Z)
	pad.Material = Enum.Material.Neon
	pad.Color = Config.Colors.ButtonTooExpensive
	pad.TopSurface = Enum.SurfaceType.Smooth
	pad.BottomSurface = Enum.SurfaceType.Smooth

	local gui = Instance.new("BillboardGui")
	gui.Name = "Info"
	gui.Size = UDim2.new(11, 0, 4, 0)
	gui.StudsOffset = Vector3.new(0, 4.5, 0)
	gui.MaxDistance = 160
	gui.LightInfluence = 0
	gui.Parent = pad

	local nameLabel = Instance.new("TextLabel")
	nameLabel.Name = "ItemName"
	nameLabel.Size = UDim2.new(1, 0, 0.55, 0)
	nameLabel.BackgroundTransparency = 1
	nameLabel.Font = Enum.Font.GothamBlack
	nameLabel.TextScaled = true
	nameLabel.TextColor3 = Color3.new(1, 1, 1)
	nameLabel.TextStrokeTransparency = 0.3
	nameLabel.Text = item.Name
	nameLabel.Parent = gui

	local priceLabel = Instance.new("TextLabel")
	priceLabel.Name = "Price"
	priceLabel.Position = UDim2.new(0, 0, 0.55, 0)
	priceLabel.Size = UDim2.new(1, 0, 0.45, 0)
	priceLabel.BackgroundTransparency = 1
	priceLabel.Font = Enum.Font.GothamBold
	priceLabel.TextScaled = true
	priceLabel.TextColor3 = Color3.fromRGB(255, 225, 90)
	priceLabel.TextStrokeTransparency = 0.3
	local price = item.Cost == 0 and "FREE" or Format.MoneyExact(item.Cost)
	priceLabel.Text = ("%s   +%s/s"):format(price, Format.Short(item.Income * Config.IncomeMultiplier))
	priceLabel.Parent = gui

	pad:SetAttribute("ItemId", item.Id)
	CollectionService:AddTag(pad, BUTTON_TAG)
	pad.Touched:Connect(function(hit)
		onButtonTouched(plot, item, hit)
	end)
	pad.Parent = plot.ButtonsFolder
	plot.Buttons[item.Id] = pad
end

-- Shows exactly the buttons for pieces that are unlocked but not yet owned.
-- Returns the list of items whose buttons just appeared.
local function refreshButtons(plot)
	local added = {}
	for _, item in ipairs(Items.List) do
		local shouldShow = plot.Owner ~= nil and not plot.Owned[item.Id] and Items.IsUnlocked(item, plot.Owned)
		local existing = plot.Buttons[item.Id]
		if shouldShow and not existing then
			createButton(plot, item)
			table.insert(added, item)
		elseif not shouldShow and existing then
			existing:Destroy()
			plot.Buttons[item.Id] = nil
		end
	end
	updateButtonColors(plot)

	-- the cheapest button showing is the player's "next goal" (guide beam)
	if plot.Owner then
		local goal = nil
		for itemId in pairs(plot.Buttons) do
			if goal == nil or Items.ById[itemId].Cost < Items.ById[goal].Cost then
				goal = itemId
			end
		end
		plot.Owner:SetAttribute("NextGoal", goal)
	end
	return added
end

function PlotManager.Purchase(plot, item)
	local player = plot.Owner
	if not player or plot.Owned[item.Id] or not Items.IsUnlocked(item, plot.Owned) then
		return false
	end
	if not PlayerData.TrySpend(player, item.Cost) then
		if cooldownReady(player, "cash_" .. item.Id, 2) then
			local cash = PlayerData.GetCash(player)
			local missing = item.Cost - cash
			local waiting = math.floor(plot.Vault)
			if waiting > 0 and cash + waiting >= item.Cost then
				notify(
					player,
					("You need %s more - your VAULT has %s! Step on the green pad to collect it."):format(
						Format.MoneyExact(missing),
						Format.MoneyExact(waiting)
					),
					"info"
				)
			else
				notify(player, ("You need %s more for %s"):format(Format.MoneyExact(missing), item.Name), "error")
			end
		end
		return false
	end
	PlayerData.SetOwned(player, item.Id) -- plot.Owned is the same table as the profile's Owned
	buildItem(plot, item, true)
	recalcIncome(plot)
	local unlocked = refreshButtons(plot)
	local message = ("Built %s!  +%s/s"):format(item.Name, Format.Short(item.Income * Config.IncomeMultiplier))
	if #unlocked > 0 then
		local names = {}
		for _, newItem in ipairs(unlocked) do
			table.insert(names, newItem.Name)
		end
		message ..= "  Unlocked: " .. table.concat(names, ", ")
	end
	notify(player, message, "success")
	if countOwned(plot) >= #Items.List then
		notify(player, "Your stadium is complete. You're a champion!", "success")
	end
	return true
end

local function countFreePlots()
	local free = 0
	for _, plot in ipairs(plots) do
		if not plot.Owner then
			free += 1
		end
	end
	return free
end

local function updateFreePlots()
	if tycoonsFolder then
		tycoonsFolder:SetAttribute("FreePlots", countFreePlots())
	end
end

-- Tells a player without a stadium why they can't use this one.
local function explainTaken(plot, player)
	if plotByPlayer[player] or not cooldownReady(player, "gate_taken", 4) then
		return
	end
	if countFreePlots() > 0 then
		local ownerName = plot.Owner and plot.Owner.DisplayName or "someone"
		notify(player, ("This is %s's stadium. Find a gate that's still glowing gold!"):format(ownerName), "error")
	else
		notify(player, "All stadiums are taken right now. One opens up when a player leaves!", "error")
	end
end

onButtonTouched = function(plot, item, hit)
	local player = playerFromHit(hit)
	if not player then
		return
	end
	if player ~= plot.Owner then
		if plotByPlayer[player] then
			if cooldownReady(player, "not_owner", 3) then
				notify(player, "This isn't your stadium! Build at your own one.", "error")
			end
		else
			explainTaken(plot, player)
		end
		return
	end
	if plot.Buttons[item.Id] == nil then
		return
	end
	PlotManager.Purchase(plot, item)
end

---------------------------------------------------------------------------------------------
-- Claiming / releasing
---------------------------------------------------------------------------------------------

local function setGateClaimed(plot, player)
	local refs = plot.Refs
	if player then
		refs.ClaimTrigger.Transparency = 1
		refs.GateSignLabel.Text = string.upper(player.DisplayName) .. "'S STADIUM"
		refs.GateBackLabel.Text = plot.TeamName .. " STADIUM"
	else
		refs.ClaimTrigger.Transparency = UNCLAIMED_TRIGGER_TRANSPARENCY
		refs.GateSignLabel.Text = "CLAIM THIS STADIUM"
		refs.GateBackLabel.Text = "GRIDIRON STADIUM"
	end
end

function PlotManager.Claim(plot, player, profile)
	plot.Owner = player
	plot.Owned = profile.Owned
	plot.TeamName = makeTeamName(player)
	plot.Vault = 0
	plot.HomeScore, plot.AwayScore = 0, 0
	plotByPlayer[player] = plot
	setGateClaimed(plot, player)

	for _, item in ipairs(Items.List) do
		if plot.Owned[item.Id] then
			buildItem(plot, item, false)
		end
	end
	recalcIncome(plot)
	refreshButtons(plot)
	updateVault(plot)
	player:SetAttribute("PlotIndex", plot.Index)

	updateFreePlots()

	local built = countOwned(plot)
	if built > 0 then
		notify(player, ("Welcome back! Your stadium has %d of %d pieces."):format(built, #Items.List), "success")
	else
		notify(player, "Stadium claimed! Step on the glowing button to start building.", "success")
		notify(player, "Your money piles up in the VAULT by the gate - step on the green pad to collect it.", "info")
	end
	GameDay.OnPlotClaimed(plot)
end

local function onClaimTouched(plot, hit)
	local player = playerFromHit(hit)
	if not player then
		return
	end
	if plot.Owner then
		if plot.Owner ~= player then
			explainTaken(plot, player)
		end
		return
	end
	local ownedPlot = plotByPlayer[player]
	if ownedPlot then
		if ownedPlot ~= plot and cooldownReady(player, "already_owner", 4) then
			notify(player, "You already own a stadium!", "error")
		end
		return
	end
	if claiming[player] then
		return
	end
	claiming[player] = true
	local profile = PlayerData.GetProfile(player)
	if not profile then
		notify(player, "Loading your saved stadium...", "info")
		profile = PlayerData.WaitForProfile(player, 45)
	end
	claiming[player] = nil
	if not profile or player.Parent == nil then
		if player.Parent then
			notify(player, "Couldn't load your data yet. Try the gate again in a moment.", "error")
		end
		return
	end
	if plot.Owner or plotByPlayer[player] then
		-- someone else claimed it while we waited, or the player claimed another plot
		if plot.Owner and not plotByPlayer[player] then
			explainTaken(plot, player)
		end
		return
	end
	PlotManager.Claim(plot, player, profile)
end

-- Frees the player's plot (their vault is paid out to them first so nothing is lost).
function PlotManager.Release(player)
	claiming[player] = nil
	cooldowns[player] = nil
	local plot = plotByPlayer[player]
	if not plot then
		return
	end
	local payout = math.floor(plot.Vault)
	if payout > 0 then
		PlayerData.AddCash(player, payout)
	end
	plotByPlayer[player] = nil
	plot.Owner = nil
	plot.Owned = {}
	plot.Income = 0
	plot.Vault = 0
	plot.TeamName = ""
	plot.ItemsFolder:ClearAllChildren()
	plot.ItemModels = {}
	for _, button in pairs(plot.Buttons) do
		button:Destroy()
	end
	plot.Buttons = {}
	setGateClaimed(plot, nil)
	GameDay.ClearCrowd(plot)
	updateVault(plot)
	updateFreePlots()
	for _, other in ipairs(Players:GetPlayers()) do
		if other ~= player and not plotByPlayer[other] then
			notify(other, "A stadium just opened up - walk through the glowing gold gate!", "info")
		end
	end
end

-- Pays every vault out to its owner (used right before the server shuts down).
function PlotManager.DepositAllVaults()
	for _, plot in ipairs(plots) do
		if plot.Owner then
			local payout = math.floor(plot.Vault)
			if payout > 0 and PlayerData.AddCash(plot.Owner, payout) then
				plot.Vault -= payout
				updateVault(plot)
			end
		end
	end
end

---------------------------------------------------------------------------------------------
-- Vault + collect pad
---------------------------------------------------------------------------------------------

-- `silent` = no pop-up (used for the every-second auto-collect while standing on the pad)
local function collect(plot, silent)
	local player = plot.Owner
	local amount = math.floor(plot.Vault)
	if not player or amount <= 0 then
		return
	end
	if PlayerData.AddCash(player, amount) then
		plot.Vault -= amount
		updateVault(plot)
		updateButtonColors(plot)
		if not silent then
			notify(player, "+" .. Format.MoneyExact(amount), "cash")
		end
	end
end

local function onCollectTouched(plot, hit)
	local player = playerFromHit(hit)
	if player and player == plot.Owner and cooldownReady(player, "collect", 0.5) then
		collect(plot)
	end
end

-- True if the owner is standing on their collect pad right now.
local function ownerIsOnPad(plot)
	local character = plot.Owner and plot.Owner.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if not root then
		return false
	end
	local offset = plot.Refs.CollectPad.CFrame:PointToObjectSpace(root.CFrame.Position)
	return math.abs(offset.X) <= 4.5 and math.abs(offset.Z) <= 4.5 and offset.Y > -1 and offset.Y < 8
end

---------------------------------------------------------------------------------------------
-- Night lights, game simulation and jumbotron
---------------------------------------------------------------------------------------------

function PlotManager.SetNight(night)
	isNight = night
	for _, plot in ipairs(plots) do
		applyLights(plot)
	end
end

local function jumbotronMessages(plot)
	if gameDayActive then
		return {
			{ "GAME DAY!", Color3.fromRGB(255, 196, 37) },
			{ plot.TeamName, plot.Palette.Primary },
			{ "MAKE SOME NOISE!", plot.Palette.Secondary },
			{ ("%dX CASH!"):format(incomeBoost), Color3.fromRGB(34, 150, 80) },
			{ ("HOME %d - AWAY %d"):format(plot.HomeScore, plot.AwayScore), Color3.fromRGB(15, 15, 20) },
		}
	end
	return {
		{ plot.TeamName, plot.Palette.Primary },
		{ "MAKE SOME NOISE!", plot.Palette.Secondary },
		{ "ATTENDANCE " .. Format.Commas(attendance(plot)), Color3.fromRGB(15, 15, 20) },
		{ "GO " .. plot.TeamName .. "!", plot.Palette.Primary },
		{ ("HOME %d - AWAY %d"):format(plot.HomeScore, plot.AwayScore), Color3.fromRGB(15, 15, 20) },
	}
end

local function showOnJumbotron(plot, text, color)
	local screen = findLabel(plot, "jumbotron", "JumbotronText")
	if screen then
		screen.Text = text
		screen.BackgroundColor3 = color
		screen.TextColor3 = plot.Palette.Trim
	end
end

-- Every so often one of the teams scores, so the scoreboard and jumbotron feel alive.
local function simulateGame(plot)
	if not plot.ItemModels.scoreboard then
		return
	end
	local homeScores = rng:NextNumber() < 0.6
	local points = rng:NextNumber() < 0.7 and 7 or 3
	if homeScores then
		plot.HomeScore += points
	else
		plot.AwayScore += points
	end
	if plot.HomeScore >= 49 or plot.AwayScore >= 49 then
		plot.HomeScore, plot.AwayScore = 0, 0
	end
	updateScoreboard(plot)
	if homeScores and plot.ItemModels.jumbotron then
		plot.JumbotronHoldUntil = os.clock() + 4
		showOnJumbotron(plot, points == 7 and "TOUCHDOWN!" or "FIELD GOAL!", Color3.fromRGB(255, 196, 37))
	end
end

---------------------------------------------------------------------------------------------
-- Setup
---------------------------------------------------------------------------------------------

function PlotManager.Init(parentFolder, remote)
	notifyRemote = remote
	tycoonsFolder = parentFolder
	for index, origin in ipairs(World.GetPlotOrigins(Config)) do
		local palette = Config.TeamColors[(index - 1) % #Config.TeamColors + 1]

		local model = Instance.new("Model")
		model.Name = "Plot" .. index
		model:SetAttribute("PlotIndex", index)
		local baseFolder = Instance.new("Folder")
		baseFolder.Name = "Base"
		baseFolder.Parent = model
		local itemsFolder = Instance.new("Folder")
		itemsFolder.Name = "Items"
		itemsFolder.Parent = model
		local buttonsFolder = Instance.new("Folder")
		buttonsFolder.Name = "Buttons"
		buttonsFolder.Parent = model

		local ctx = BuildUtil.NewContext(origin, baseFolder, palette, "", Config)
		local refs = Builders.PlotBase(ctx)

		local plot = {
			Index = index,
			Origin = origin,
			Palette = palette,
			Model = model,
			Refs = refs,
			ItemsFolder = itemsFolder,
			ButtonsFolder = buttonsFolder,
			Owner = nil,
			Owned = {},
			ItemModels = {},
			Buttons = {},
			Income = 0,
			Vault = 0,
			TeamName = "",
			HomeScore = 0,
			AwayScore = 0,
			JumbotronStep = 0,
			JumbotronHoldUntil = 0,
		}
		plots[index] = plot
		model.Parent = parentFolder

		refs.ClaimTrigger.Touched:Connect(function(hit)
			onClaimTouched(plot, hit)
		end)
		refs.CollectPad.Touched:Connect(function(hit)
			onCollectTouched(plot, hit)
		end)
	end
	updateFreePlots()
end

-- Respawn owners at their own stadium.
function PlotManager.OnPlayerAdded(player)
	player.CharacterAdded:Connect(function(character)
		if not Config.RespawnAtPlot then
			return
		end
		local plot = plotByPlayer[player]
		if not plot then
			return
		end
		local root = character:WaitForChild("HumanoidRootPart", 10)
		task.wait(0.1)
		if root and character.Parent and plotByPlayer[player] == plot then
			character:PivotTo(plot.Refs.SpawnCFrame)
		end
	end)
end

function PlotManager.GetPlot(player)
	return plotByPlayer[player]
end

-- Starts the income loop and the display loops.
function PlotManager.Start()
	-- income -> vault (+ auto-collect while the owner stands on the pad)
	task.spawn(function()
		while true do
			task.wait(Config.IncomeTickSeconds)
			for _, plot in ipairs(plots) do
				if plot.Owner then
					plot.Vault += plot.Income * Config.IncomeMultiplier * incomeBoost * Config.IncomeTickSeconds
					if ownerIsOnPad(plot) then
						collect(plot, true)
					else
						updateVault(plot)
					end
					updateButtonColors(plot)
				end
			end
		end
	end)

	-- jumbotron slideshow
	task.spawn(function()
		while true do
			task.wait(3)
			for _, plot in ipairs(plots) do
				if plot.Owner and plot.ItemModels.jumbotron and os.clock() >= plot.JumbotronHoldUntil then
					local messages = jumbotronMessages(plot)
					plot.JumbotronStep = plot.JumbotronStep % #messages + 1
					local message = messages[plot.JumbotronStep]
					showOnJumbotron(plot, message[1], message[2])
				end
			end
		end
	end)

	-- pretend football game (scores much more often on game days)
	task.spawn(function()
		local elapsed = 0
		while true do
			task.wait(1)
			elapsed += 1
			if elapsed >= (gameDayActive and 8 or 25) then
				elapsed = 0
				for _, plot in ipairs(plots) do
					if plot.Owner then
						simulateGame(plot)
					end
				end
			end
		end
	end)
end

function PlotManager.GetPlots()
	return plots
end

-- Called by GameDay when a game day starts (active = true) or ends.
function PlotManager.SetGameDay(active, multiplier)
	gameDayActive = active
	incomeBoost = active and multiplier or 1
	for _, plot in ipairs(plots) do
		if plot.Owner then
			updateOwnerAttributes(plot)
			if active then
				notify(plot.Owner, ("GAME DAY! Fans are pouring in - %dX CASH!"):format(incomeBoost), "success")
				if plot.ItemModels.jumbotron then
					plot.JumbotronHoldUntil = os.clock() + 4
					showOnJumbotron(plot, "GAME DAY!", Color3.fromRGB(255, 196, 37))
				end
			else
				notify(plot.Owner, "That's the final whistle! The next game day starts soon.", "info")
			end
		end
	end
end

return PlotManager
