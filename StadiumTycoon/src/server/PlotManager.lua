--[[
	PlotManager
	Owns every stadium plot: claiming, buy buttons, purchases, building pieces, the vault /
	collect pad, and the live displays (scoreboard, jumbotron, flood lights).

	Player attributes set here (read by the HUD):
	  PlotIndex   number of the plot the player owns (nil = none yet)
	  Income      cash per second the player's stadium earns
	  Built       how many stadium pieces the player owns
	  NextGoal    item id of the buy button to go for next: the cheapest one in the part of the plot
	              the owner is in, unless one elsewhere is much cheaper (Config.GuideGoal; the
	              client draws a guide beam to it)

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

-- Other modules can react when a step of a piece is built (e.g. golf carts): [pieceId] = fn(plot, item)
local pieceHooks = {}
local releaseHooks = {} -- fn(plot) when a plot is released
local purchaseHooks = {} -- fn(player, plot, item) after a step is bought
local collectHooks = {} -- fn(player, amount) after vault money is collected
local teamHooks = {} -- fn(plot) after a plot's team colours / name change
local builtHooks = {} -- fn(plot, item, model) after ANY step is built (incl. rebuilds)
local rebuiltHooks = {} -- fn(plot) after a whole plot was (re)built (claim or team change)
local teamProvider = nil -- fn(player, profile) -> palette, teamName (Franchise.lua)
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

-- Finds a named TextLabel anywhere in the plot's built pieces (label names are unique per plot).
local function findLabel(plot, labelName)
	local label = plot.ItemsFolder:FindFirstChild(labelName, true)
	if label and label:IsA("TextLabel") then
		return label
	end
	return nil
end

local function updateVault(plot)
	local text = plot.Owner and Format.MoneyExact(math.floor(plot.Vault)) or "$0"
	plot.Refs.VaultLabel.Text = text
	if plot.Refs.CampusVaultLabel then
		plot.Refs.CampusVaultLabel.Text = text -- the campus "team safe" shows the same vault
	end
	if plot.Refs.FieldVaultLabel then
		plot.Refs.FieldVaultLabel.Text = text -- and so does the collect pad on the field
	end
end

local function attendance(plot)
	return plot.Income * Config.AttendancePerIncome
end

-- Plot model attributes: clients read these for live info (look cards, TV score bugs).
local function publishPlot(plot)
	local model = plot.Model
	model:SetAttribute("OwnerUserId", plot.Owner and plot.Owner.UserId or nil)
	model:SetAttribute("OwnerName", plot.Owner and plot.Owner.DisplayName or nil)
	model:SetAttribute("TeamName", plot.TeamName ~= "" and plot.TeamName or nil)
	model:SetAttribute("HomeScore", plot.HomeScore)
	model:SetAttribute("AwayScore", plot.AwayScore)
end

local function updateScoreboard(plot)
	publishPlot(plot)
	local title = findLabel(plot, "ScoreboardTitle")
	if title then
		title.Text = plot.TeamName .. " STADIUM"
	end
	local score = findLabel(plot, "ScoreboardScore")
	if score then
		score.Text = ("HOME %d  -  AWAY %d"):format(plot.HomeScore, plot.AwayScore)
	end
	local crowd = findLabel(plot, "ScoreboardAttendance")
	if crowd then
		crowd.Text = "ATTENDANCE " .. Format.Commas(attendance(plot))
	end
end

-- The always-present plot base (gate, borders, bus stops, vault roof, the HQ building) is built
-- once, in the plot's own palette. Its team-coloured parts carry the palette key they use
-- (TeamRole) and its labels TeamTextRole / TeamBackRole, so it can be repainted in place.
local function findTeamPainted(baseFolder)
	local list = {}
	for _, inst in ipairs(baseFolder:GetDescendants()) do
		if inst:GetAttribute("TeamRole") or inst:GetAttribute("TeamTextRole") or inst:GetAttribute("TeamBackRole") then
			table.insert(list, inst)
		end
	end
	return list
end

-- Repaints the plot base in plot.Palette (claim, team change, release).
local function paintBase(plot)
	local palette = plot.Palette
	local function color(role)
		local value = role and palette[role]
		return typeof(value) == "Color3" and value or nil
	end
	for _, inst in ipairs(plot.TeamPainted) do
		local partColor = color(inst:GetAttribute("TeamRole"))
		if partColor and (inst:IsA("BasePart") or inst:IsA("Light")) then
			inst.Color = partColor
		end
		local textColor = color(inst:GetAttribute("TeamTextRole"))
		if textColor and (inst:IsA("TextLabel") or inst:IsA("TextButton") or inst:IsA("TextBox")) then
			inst.TextColor3 = textColor
		end
		local backColor = color(inst:GetAttribute("TeamBackRole"))
		if backColor and inst:IsA("GuiObject") then
			inst.BackgroundColor3 = backColor
		end
	end
end

-- Flood lights live on the light towers and under the canopy roof.
local LIGHT_PIECES = { lights = true, canopy = true }

local function applyLights(plot)
	for itemId, model in pairs(plot.ItemModels) do
		local item = Items.ById[itemId]
		if item and LIGHT_PIECES[item.PieceId] then
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
	end
end

-- Green = the owner can buy it now (buttons spend the vault too, see PlotManager.Purchase).
local function updateButtonColors(plot)
	if not plot.Owner then
		return
	end
	local cash = PlayerData.GetCash(plot.Owner) + math.floor(plot.Vault)
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
		elseif
			descendant:IsA("LayerCollector")
			or descendant:IsA("ProximityPrompt")
			or (descendant:IsA("Light") and descendant.Name ~= "FloodLight")
		then
			-- SurfaceGui / BillboardGui / lights (flood lights are handled by the night logic) /
			-- prompts (a door opened mid-animation would cancel the fade-in tween)
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

-- Pieces whose surface text is read from across the bowl (field paint, ribbon boards, video
-- boards, fascias) keep their SurfaceGuis visible from any distance.
local FAR_TEXT_PIECES = {
	turf = true,
	yardlines = true,
	endzones = true,
	midfield = true,
	scoreboard = true,
	jumbotron = true,
	canopy = true,
	facade = true,
	gates = true,
	lower_home = true,
	lower_visitor = true,
	lower_ends = true,
	lower_corners = true,
	club_seats = true,
	upper_home = true,
	upper_visitor = true,
	upper_ends = true,
}

-- Gives every SurfaceGui on a part a draw distance that suits the size of its face, so clients
-- skip the thousands of signs and screens that are too far away to read: 60 studs per stud of
-- the face's shorter side plus half its longer side, between 150 and 1000 studs.
local function limitGuiDistance(root)
	for _, gui in ipairs(root:GetDescendants()) do
		if gui:IsA("SurfaceGui") and gui.MaxDistance == 0 then
			local part = gui.Adornee or gui.Parent
			if part and part:IsA("BasePart") then
				local size, face = part.Size, gui.Face
				local a, b
				if face == Enum.NormalId.Front or face == Enum.NormalId.Back then
					a, b = size.X, size.Y
				elseif face == Enum.NormalId.Left or face == Enum.NormalId.Right then
					a, b = size.Z, size.Y
				else
					a, b = size.X, size.Z
				end
				gui.MaxDistance = math.clamp(60 * math.min(a, b) + 0.5 * math.max(a, b), 150, 1000)
			end
		end
	end
end

-- Builds one STEP of a piece (the piece's builder runs with ctx.onlyStage = step).
local function buildItem(plot, item, animate)
	local builder = Builders[item.PieceId]
	if not builder then
		warn("[PlotManager] No builder for piece " .. item.PieceId)
		for _, hook in ipairs(pieceHooks[item.PieceId] or {}) do
			task.spawn(hook, plot, item) -- gameplay (e.g. golf carts) doesn't depend on the geometry
		end
		return
	end
	local model = Instance.new("Model")
	model.Name = item.Id
	-- pieces are built in their area's frame (e.g. the campus sits further back, see Items.lua)
	local origin = plot.Origin * CFrame.new(item.AreaOffset or Vector3.new())
	local ctx = BuildUtil.NewContext(origin, model, plot.Palette, plot.TeamName, Config, item.Stage)
	local ok, err = pcall(builder, ctx)
	if not ok then
		warn(("[PlotManager] Builder '%s' (step %d) failed: %s"):format(item.PieceId, item.Stage, tostring(err)))
	end
	BuildUtil.PruneEmpty(model)
	if not FAR_TEXT_PIECES[item.PieceId] then
		limitGuiDistance(model) -- (before the model is parented, so it replicates with the limits)
	end
	model.Parent = plot.ItemsFolder
	plot.ItemModels[item.Id] = model
	if animate and Config.BuildAnimation then
		local animated, animationError = pcall(animateIn, model)
		if not animated then
			warn("[PlotManager] Build animation failed: " .. tostring(animationError))
		end
	end

	local pieceId = item.PieceId
	if LIGHT_PIECES[pieceId] then
		applyLights(plot)
	elseif pieceId == "scoreboard" then
		updateScoreboard(plot)
	elseif pieceId == "jumbotron" then
		local screen = findLabel(plot, "JumbotronText")
		if screen then
			screen.Text = plot.TeamName
		end
	end
	for _, hook in ipairs(pieceHooks[pieceId] or {}) do
		task.spawn(hook, plot, item)
	end
	for _, hook in ipairs(builtHooks) do
		task.spawn(hook, plot, item, model)
	end
end

-- Builds every owned step of a plot, a few steps per frame: a returning owner's franchise is
-- thousands of parts, and building it in one frame would stall the server and flood every
-- client. Once this frame's Config.BuildFrameBudget is used up it waits for the next frame.
-- `swap` = the steps already have models (a team change): each step's new model is built
-- first and its old one destroyed right after, so the plot never exists twice and nobody
-- standing on a floor falls through. plot.Building is true while it runs (purchases wait).
-- A newer build or Release changes plot.BuildToken, which stops this one.
-- Returns true when every step was built.
local function buildOwnedSteps(plot, swap)
	local owner = plot.Owner
	plot.BuildToken += 1
	local token = plot.BuildToken
	plot.Building = true
	local sliceStart = os.clock()
	for _, item in ipairs(Items.List) do
		if plot.Owned[item.Id] then
			if os.clock() - sliceStart > Config.BuildFrameBudget then
				task.wait()
				if plot.BuildToken ~= token or plot.Owner ~= owner then
					return false -- the owner left (the plot was released) while it was being built
				end
				sliceStart = os.clock()
			end
			local old = swap and plot.ItemModels[item.Id] or nil
			buildItem(plot, item, false)
			if old and old ~= plot.ItemModels[item.Id] then
				old:Destroy()
			end
		end
	end
	plot.Building = false
	return true
end

-- After a whole plot was (re)built: run the hooks (e.g. live screens refresh once), then apply
-- a team change that was asked for while the build was running.
local function finishBuild(plot)
	for _, hook in ipairs(rebuiltHooks) do
		task.spawn(hook, plot)
	end
	local pending = plot.PendingTeam
	plot.PendingTeam = nil
	if pending and plot.Owner then
		PlotManager.ApplyTeam(plot.Owner, pending.Palette, pending.TeamName)
	end
end

---------------------------------------------------------------------------------------------
-- Buttons
---------------------------------------------------------------------------------------------

local onButtonTouched -- forward declaration
local collect -- forward declaration (Vault + collect pads)

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
	gui.Size = UDim2.new(12, 0, 5, 0)
	gui.StudsOffset = Vector3.new(0, 4.5, 0)
	gui.MaxDistance = 160
	gui.LightInfluence = 0
	gui.Parent = pad

	local nameLabel = Instance.new("TextLabel")
	nameLabel.Name = "ItemName"
	nameLabel.Size = UDim2.new(1, 0, 0.42, 0)
	nameLabel.BackgroundTransparency = 1
	nameLabel.Font = Enum.Font.GothamBlack
	nameLabel.TextScaled = true
	nameLabel.TextColor3 = Color3.new(1, 1, 1)
	nameLabel.TextStrokeTransparency = 0.3
	nameLabel.Text = item.PieceName
	nameLabel.Parent = gui

	local stepLabel = Instance.new("TextLabel")
	stepLabel.Name = "Step"
	stepLabel.Position = UDim2.new(0, 0, 0.42, 0)
	stepLabel.Size = UDim2.new(1, 0, 0.28, 0)
	stepLabel.BackgroundTransparency = 1
	stepLabel.Font = Enum.Font.GothamBold
	stepLabel.TextScaled = true
	stepLabel.TextColor3 = Color3.fromRGB(190, 230, 255)
	stepLabel.TextStrokeTransparency = 0.3
	stepLabel.Text = ("Step %d/%d: %s"):format(item.Stage, item.StageCount, item.StageName)
	stepLabel.Parent = gui

	local priceLabel = Instance.new("TextLabel")
	priceLabel.Name = "Price"
	priceLabel.Position = UDim2.new(0, 0, 0.7, 0)
	priceLabel.Size = UDim2.new(1, 0, 0.3, 0)
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

-- Which part of the plot a plot-local position is in, for the guide beam: "hq" (the HQ building,
-- both floors; its shell sticks out a little past Layout.HQ), "campus" (outdoors behind the
-- stadium), "plaza", "fanzone" or "stadium".
local function guideZone(position)
	local L = Config.Layout
	local campus, hq = L.Areas.campus, L.HQ
	if
		position.X >= campus.X + hq.MinX - 12
		and position.X <= campus.X + hq.MaxX + 18
		and position.Z >= campus.Z + hq.MinZ - 12
		and position.Z <= campus.Z + hq.MaxZ + 12
	then
		return "hq"
	elseif position.Z > L.StadiumBackZ then
		return "campus"
	elseif position.Z < L.StadiumFrontZ then
		return "plaza"
	elseif position.X > L.StadiumHalfX + 5 then
		return "fanzone"
	end
	return "stadium"
end

local function cheaper(item, other)
	return other == nil or item.Cost < other.Cost or (item.Cost == other.Cost and item.Order < other.Order)
end

-- The button the guide beam should point at: the cheapest one in the part of the plot the owner
-- is in, while it costs at most Config.GuideGoal.ZoneCostFactor x the cheapest one anywhere
-- (then that one), so the beam doesn't send them across the plot for every step.
local function pickGoal(plot)
	local character = plot.Owner.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	local zone = root and guideZone(plot.Origin:PointToObjectSpace(root.CFrame.Position))
	local cheapest, cheapestHere = nil, nil
	for itemId in pairs(plot.Buttons) do
		local item = Items.ById[itemId]
		if cheaper(item, cheapest) then
			cheapest = item
		end
		if zone and guideZone(item.Button) == zone and cheaper(item, cheapestHere) then
			cheapestHere = item
		end
	end
	if cheapestHere and cheapestHere.Cost <= cheapest.Cost * Config.GuideGoal.ZoneCostFactor then
		return cheapestHere.Id
	end
	return cheapest and cheapest.Id
end

-- Points the guide beam (the owner's NextGoal attribute) at pickGoal's button. While the current
-- button still shows, another one has to win two checks in a row (so the beam doesn't flicker
-- while the owner walks along the edge of a zone).
local function updateGoal(plot)
	local owner = plot.Owner
	if not owner then
		return
	end
	local pick = pickGoal(plot)
	local current = owner:GetAttribute("NextGoal")
	if pick ~= current and current ~= nil and plot.Buttons[current] and plot.GoalChallenger ~= pick then
		plot.GoalChallenger = pick -- first win: check again before moving the beam
		return
	end
	plot.GoalChallenger = nil
	if pick ~= current then
		owner:SetAttribute("NextGoal", pick)
	end
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
	updateGoal(plot) -- the player's "next goal" (guide beam)
	return added
end

function PlotManager.Purchase(plot, item)
	local player = plot.Owner
	if not player or plot.Owned[item.Id] or not Items.IsUnlocked(item, plot.Owned) then
		return false
	end
	if plot.Building then
		-- the whole franchise is still being rebuilt (just claimed, or new team colours)
		if cooldownReady(player, "building", 2) then
			notify(player, "Hold on - your franchise is still being built. Try again in a moment!", "info")
		end
		return false
	end
	if PlayerData.GetCash(player) < item.Cost and plot.Vault >= 1 then
		collect(plot, true) -- buttons spend the vault too: it is collected first
	end
	if not PlayerData.TrySpend(player, item.Cost) then
		if cooldownReady(player, "cash_" .. item.Id, 2) then
			local missing = item.Cost - PlayerData.GetCash(player)
			local income = plot.Income * Config.IncomeMultiplier * incomeBoost
			local soon = ""
			if income > 0 then
				local seconds = math.ceil(missing / income)
				soon = seconds < 90 and (" (about %d s)"):format(seconds) or (" (about %d min)"):format(math.ceil(seconds / 60))
			end
			notify(
				player,
				("You need %s more for %s%s. Buttons use your vault too - collect pads: HQ lobby, gold gate, field."):format(
					Format.MoneyExact(missing),
					item.Name,
					soon
				),
				"error"
			)
		end
		return false
	end
	PlayerData.SetOwned(player, item.Id) -- plot.Owned is the same table as the profile's Owned
	buildItem(plot, item, true)
	recalcIncome(plot)
	local unlocked = refreshButtons(plot)
	for _, hook in ipairs(purchaseHooks) do
		task.spawn(hook, player, plot, item)
	end
	local message = ("Built %s!  +%s/s"):format(item.Name, Format.Short(item.Income * Config.IncomeMultiplier))
	local names = {}
	for _, newItem in ipairs(unlocked) do
		if newItem.Stage == 1 then
			table.insert(names, newItem.PieceName)
		end
	end
	if #names > 0 then
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
	local chosenPalette, chosenName = nil, nil
	if teamProvider then
		chosenPalette, chosenName = teamProvider(player, profile)
	end
	plot.Palette = chosenPalette or plot.BasePalette
	plot.TeamName = chosenName or makeTeamName(player)
	plot.Vault = 0
	plot.HomeScore, plot.AwayScore = 0, 0
	plotByPlayer[player] = plot
	setGateClaimed(plot, player)
	publishPlot(plot)
	paintBase(plot) -- (a returning owner's saved team colours)
	updateVault(plot)
	player:SetAttribute("PlotIndex", plot.Index)

	updateFreePlots()

	-- take the new owner into their Team HQ first (the HQ building is part of the plot base)
	local character = player.Character
	if character then
		character:PivotTo(plot.Refs.SpawnCFrame)
	end

	local built = countOwned(plot)
	if built > 0 then
		notify(player, ("Welcome back to your Team HQ! %d of %d steps built."):format(built, #Items.List), "success")
	else
		notify(player, "Welcome to your Team HQ! Step on the glowing button to start building.", "success")
		notify(
			player,
			"Your money piles up in the TEAM SAFE - buy buttons spend it, or step on the green pad in the lobby to collect it.",
			"info"
		)
	end

	-- then rebuild everything they own (a few steps per frame)
	if not buildOwnedSteps(plot, false) then
		return -- they left before it was finished
	end
	recalcIncome(plot)
	refreshButtons(plot)
	updateVault(plot)
	GameDay.OnPlotClaimed(plot)
	finishBuild(plot)
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
	plot.Palette = plot.BasePalette
	paintBase(plot)
	plot.BuildToken += 1 -- stops a (re)build that is still running
	plot.Building = false
	plot.PendingTeam = nil
	plot.GoalChallenger = nil
	plot.ItemsFolder:ClearAllChildren()
	plot.ItemModels = {}
	for _, button in pairs(plot.Buttons) do
		button:Destroy()
	end
	plot.Buttons = {}
	setGateClaimed(plot, nil)
	plot.HomeScore, plot.AwayScore = 0, 0
	publishPlot(plot)
	GameDay.ClearCrowd(plot)
	for _, hook in ipairs(releaseHooks) do
		task.spawn(hook, plot)
	end
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

-- `silent` = no pop-up (used for the every-second auto-collect while standing on the pad, and
-- when a buy button spends the vault)
collect = function(plot, silent)
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
		for _, hook in ipairs(collectHooks) do
			task.spawn(hook, player, amount)
		end
	end
end

local function onCollectTouched(plot, hit)
	local player = playerFromHit(hit)
	if player and player == plot.Owner and cooldownReady(player, "collect", 0.5) then
		collect(plot)
	end
end

-- True if the owner is standing on one of their collect pads right now.
local function ownerIsOnPad(plot)
	local character = plot.Owner and plot.Owner.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if not root then
		return false
	end
	for _, pad in ipairs({ plot.Refs.CollectPad, plot.Refs.CampusCollectPad, plot.Refs.FieldCollectPad }) do
		local offset = pad.CFrame:PointToObjectSpace(root.CFrame.Position)
		if math.abs(offset.X) <= 4.5 and math.abs(offset.Z) <= 4.5 and offset.Y > -1 and offset.Y < 8 then
			return true
		end
	end
	return false
end

-- Team bus: touching one stop takes you to the other (plaza <-> practice campus).
local function onBusTouched(hit, destination)
	local player = playerFromHit(hit)
	if not player or not cooldownReady(player, "bus", 2) then
		return
	end
	local character = player.Character
	if not character then
		return
	end
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	if humanoid and humanoid.SeatPart then
		return -- driving a golf cart (or sitting) over the pad: no bus ride
	end
	character:PivotTo(destination)
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
	local screen = findLabel(plot, "JumbotronText")
	if screen then
		screen.Text = text
		screen.BackgroundColor3 = color
		screen.TextColor3 = plot.Palette.Trim
	end
end

-- Every so often one of the teams scores, so the scoreboard and jumbotron feel alive.
local function simulateGame(plot)
	if not findLabel(plot, "ScoreboardScore") then
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
	if homeScores and findLabel(plot, "JumbotronText") then
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
		limitGuiDistance(baseFolder)

		local plot = {
			Index = index,
			Origin = origin,
			Palette = palette,
			BasePalette = palette,
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
			GoalChallenger = nil, -- a button that beat the guide beam's one once (see updateGoal)
			Building = false, -- true while the owned steps are being (re)built over several frames
			BuildToken = 0, -- changes when a new build starts or the plot is released
			PendingTeam = nil, -- { Palette, TeamName } asked for while a build was running
			TeamPainted = findTeamPainted(baseFolder), -- base parts/labels in the team colours
		}
		plots[index] = plot
		model.Parent = parentFolder

		refs.ClaimTrigger.Touched:Connect(function(hit)
			onClaimTouched(plot, hit)
		end)
		refs.CollectPad.Touched:Connect(function(hit)
			onCollectTouched(plot, hit)
		end)
		for _, pad in ipairs({ refs.CampusCollectPad, refs.FieldCollectPad }) do
			pad.Touched:Connect(function(hit)
				onCollectTouched(plot, hit)
			end)
		end
		if refs.BusStopPlaza and refs.BusStopCampus then
			refs.BusStopPlaza.Touched:Connect(function(hit)
				onBusTouched(hit, refs.BusArriveCampus)
			end)
			refs.BusStopCampus.Touched:Connect(function(hit)
				onBusTouched(hit, refs.BusArrivePlaza)
			end)
		end
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

	-- the guide beam follows the owner around the plot (see updateGoal)
	task.spawn(function()
		while true do
			task.wait(Config.GuideGoal.RecheckSeconds)
			for _, plot in ipairs(plots) do
				local ok, err = pcall(updateGoal, plot)
				if not ok then
					warn("[PlotManager] guide goal: " .. tostring(err))
				end
			end
		end
	end)

	-- jumbotron slideshow
	task.spawn(function()
		while true do
			task.wait(3)
			for _, plot in ipairs(plots) do
				if plot.Owner and os.clock() >= plot.JumbotronHoldUntil and findLabel(plot, "JumbotronText") then
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

-- fn(plot, item) is called (in its own thread) whenever a step of `pieceId` is built,
-- including when a returning player's plot is rebuilt.
function PlotManager.OnPieceBuilt(pieceId, fn)
	pieceHooks[pieceId] = pieceHooks[pieceId] or {}
	table.insert(pieceHooks[pieceId], fn)
end

-- Puts a final score on the plot's scoreboard / jumbotron.
function PlotManager.SetScore(plot, home, away)
	plot.HomeScore, plot.AwayScore = home, away
	updateScoreboard(plot)
end

-- fn(player, plot, item) is called after a player buys a step.
function PlotManager.OnPurchase(fn)
	table.insert(purchaseHooks, fn)
end

-- fn(player, amount) is called after a player collects vault money.
function PlotManager.OnCollect(fn)
	table.insert(collectHooks, fn)
end

-- fn(player, profile) -> palette, teamName decides a new owner's team colours and name.
function PlotManager.SetTeamProvider(fn)
	teamProvider = fn
end

-- The player's income per second right now (including multipliers).
function PlotManager.GetIncome(player)
	local plot = plotByPlayer[player]
	return plot and plot.Income * Config.IncomeMultiplier * incomeBoost or 0
end

-- The player's income per second WITHOUT the game-day boost (for prices and rewards, so they
-- don't jump when a game day starts or ends).
function PlotManager.GetBaseIncome(player)
	local plot = plotByPlayer[player]
	return plot and plot.Income * Config.IncomeMultiplier or 0
end

-- Re-colours / re-names a player's whole franchise: every owned step is rebuilt in the
-- background, a few steps per frame, swapping each step's model for its new one.
-- Returns true when the change was made (or will be, once a running build is done).
function PlotManager.ApplyTeam(player, palette, teamName)
	local plot = plotByPlayer[player]
	if not plot then
		return false
	end
	palette = palette or plot.Palette
	teamName = teamName or plot.TeamName
	if plot.Building then
		-- the plot is still being (re)built: repaint it as soon as that is done
		plot.PendingTeam = { Palette = palette, TeamName = teamName }
		return true
	end
	if palette == plot.Palette and teamName == plot.TeamName then
		return false -- nothing changes, so don't rebuild
	end
	plot.Palette = palette
	plot.TeamName = teamName
	paintBase(plot) -- the HQ building, gate, borders and bus stops are repainted in place
	setGateClaimed(plot, player)
	updateScoreboard(plot)
	task.spawn(function()
		if not buildOwnedSteps(plot, true) then
			return -- the owner left
		end
		updateScoreboard(plot)
		applyLights(plot)
		for _, hook in ipairs(teamHooks) do
			task.spawn(hook, plot)
		end
		finishBuild(plot)
	end)
	return true
end

-- fn(plot, item, model) runs after any step of any piece is built (also when a plot is
-- rebuilt for a returning player or a new team), e.g. to find live screens and prompts.
function PlotManager.OnAnyBuilt(fn)
	table.insert(builtHooks, fn)
end

-- fn(plot) runs after ApplyTeam re-coloured a plot (e.g. to repaint the golf carts).
function PlotManager.OnTeamApplied(fn)
	table.insert(teamHooks, fn)
end

-- fn(plot) runs after a whole plot was (re)built over several frames (a claim or a team
-- change). While that build runs, plot.Building is true.
function PlotManager.OnRebuilt(fn)
	table.insert(rebuiltHooks, fn)
end

-- fn(plot) is called when a plot is released (its owner left).
function PlotManager.OnPlotReleased(fn)
	table.insert(releaseHooks, fn)
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
				if findLabel(plot, "JumbotronText") then
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
