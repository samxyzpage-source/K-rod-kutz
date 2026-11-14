--[[
	Interactions
	Server side of the "Interact" ProximityPrompts that builders put all over the franchise
	(see ReplicatedStorage.TycoonShared.Interact and BuildUtil.Look/Door/Seat/Elevator/Use):

	  door      swings / slides the door open, closes it again after a few seconds
	  seat      sits the player down (TV camera seats are handled by Interact.client.lua)
	  elevator  fades the player's screen and moves them to the other level
	  use       items (Snacks.lua) and coaching gear (Gear.lua) are handed out here and the
	            coaches' wardrobe changes outfits (Gear.lua); mini-games run on the client and
	            send their result back through the UseResult remote
	  look      client only

	Remotes (in ReplicatedStorage.TycoonRemotes):
	  Transition  server -> client  (label)            fade for an elevator ride
	  UseResult   client -> server  (prompt, score)    a finished mini-game
]]

local Players = game:GetService("Players")
local ProximityPromptService = game:GetService("ProximityPromptService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("TycoonShared")
local Format = require(Shared:WaitForChild("Format"))
local Interact = require(Shared:WaitForChild("Interact"))

local Gear = require(script.Parent.Gear)
local PlayerData = require(script.Parent.PlayerData)
local Snacks = require(script.Parent.Snacks)

local Interactions = {}

local DOOR_SECONDS = 0.6
local RIDE_FADE_SECONDS = 0.35
local USE_DISTANCE = 25 -- how close you must still be to the thing when a mini-game ends
-- Games that always run to the end (seconds; a prompt's "Duration" attribute overrides it).
-- A result that arrives much sooner than that after the prompt was triggered is ignored.
local GAME_LENGTH = { lift = 12, arcade = 20 }
-- The fastest anyone can score (per second); higher scores are cut down to this.
local SCORE_RATE = { lift = 2, arcade = 3, pingpong = 1.6, podium = 100 }
local REWARD_COOLDOWN = 60 -- seconds between cash rewards for the same activity
local GEAR_SLACK = 6 -- gear / wardrobe requests from further than a prompt's reach + this are refused
local GEAR_COOLDOWN = 0.8 -- seconds between two pieces of gear
local OUTFIT_COOLDOWN = 1.5 -- seconds between two outfit changes

local plotManager = nil
local franchise = nil
local notifyRemote = nil
local transitionRemote = nil
local doorTokens = setmetatable({}, { __mode = "k" }) -- [door model] = number
local cooldowns = {} -- [player] = { [key] = os.clock() }
local sessions = {} -- [player] = { prompt, started } - the mini-game the player really started

local function notify(player, message, kind)
	if notifyRemote and player.Parent then
		notifyRemote:FireClient(player, message, kind or "info")
	end
end

local function cooldownLeft(player, key, seconds)
	local last = cooldowns[player] and cooldowns[player][key]
	return last and math.max(0, seconds - (os.clock() - last)) or 0
end

local function cooldownReady(player, key, seconds)
	local now = os.clock()
	cooldowns[player] = cooldowns[player] or {}
	local last = cooldowns[player][key]
	if last and now - last < seconds then
		return false
	end
	cooldowns[player][key] = now
	return true
end

-- The part a prompt sits on (prompts can also sit on an Attachment of a part).
local function hostPart(prompt)
	local host = prompt.Parent
	if host and host:IsA("Attachment") then
		host = host.Parent
	end
	if host and host:IsA("BasePart") then
		return host
	end
	return nil
end

-- The plot (PlotManager record) that an instance belongs to.
local function plotOf(instance)
	local node = instance
	while node and node ~= Workspace do
		if node:GetAttribute("PlotIndex") ~= nil then
			for _, plot in ipairs(plotManager.GetPlots()) do
				if plot.Model == node then
					return plot
				end
			end
			return nil
		end
		node = node.Parent
	end
	return nil
end

local function characterParts(player)
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if not root or not humanoid or humanoid.Health <= 0 then
		return nil
	end
	return character, root, humanoid
end

---------------------------------------------------------------------------------------------
-- Doors
---------------------------------------------------------------------------------------------

local function moveDoor(model, open)
	for _, part in ipairs(model:GetDescendants()) do
		if part:IsA("BasePart") then
			local leaf = part:GetAttribute("Leaf")
			local closed = part:GetAttribute("ClosedCFrame")
			if leaf and typeof(closed) == "CFrame" then
				local goal = closed
				if open then
					local pivot = model:GetAttribute("Pivot" .. leaf)
					local offset = model:GetAttribute("Open" .. leaf)
					if typeof(pivot) == "CFrame" and typeof(offset) == "CFrame" then
						goal = pivot * offset * pivot:ToObjectSpace(closed)
					end
				end
				TweenService:Create(part, TweenInfo.new(DOOR_SECONDS, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { CFrame = goal })
					:Play()
			end
		end
	end
end

local function setDoor(model, prompt, open)
	model:SetAttribute("IsOpen", open)
	prompt.ActionText = open and "Close" or "Open"
	moveDoor(model, open)
	local token = (doorTokens[model] or 0) + 1
	doorTokens[model] = token
	local autoClose = model:GetAttribute("AutoClose") or 6
	if open and autoClose > 0 then
		task.delay(autoClose, function()
			if model.Parent and doorTokens[model] == token and model:GetAttribute("IsOpen") then
				setDoor(model, prompt, false)
			end
		end)
	end
end

-- Anyone can open a door (or keep it open); only the plot's owner can close it early, so
-- visitors can't hold someone else's doors shut.
function Interactions.ToggleDoor(prompt, player)
	local marker = hostPart(prompt)
	local model = marker and marker.Parent
	if not model or not model:GetAttribute("Leaves") then
		return
	end
	local open = not model:GetAttribute("IsOpen")
	if not open and player then
		local plot = plotOf(model)
		if plot and plot.Owner and plot.Owner ~= player then
			open = true -- a visitor pressing E on an open door just keeps it open a bit longer
		end
	end
	setDoor(model, prompt, open)
end

---------------------------------------------------------------------------------------------
-- Seats and elevators
---------------------------------------------------------------------------------------------

local function sit(prompt, player)
	local seat = hostPart(prompt)
	local _, _, humanoid = characterParts(player)
	if not seat or not seat:IsA("Seat") or not humanoid then
		return
	end
	if seat.Occupant or humanoid.SeatPart then
		return
	end
	seat:Sit(humanoid)
end

local function ride(prompt, player)
	local target = prompt:GetAttribute("Target")
	local character, _, humanoid = characterParts(player)
	if typeof(target) ~= "CFrame" or not character then
		return
	end
	if humanoid.SeatPart or not cooldownReady(player, "ride", 1.5) then
		return
	end
	if transitionRemote then
		transitionRemote:FireClient(player, prompt:GetAttribute("Label") or "")
	end
	task.wait(RIDE_FADE_SECONDS)
	-- (sat down during the fade, e.g. in a golf cart: moving them would drag the seat along)
	if character.Parent == nil or player.Character ~= character or humanoid.SeatPart then
		return
	end
	character:PivotTo(target * CFrame.new(0, 3, 0))
end

---------------------------------------------------------------------------------------------
-- Use: items + mini-game results
---------------------------------------------------------------------------------------------

-- Coaching gear and the coaches' wardrobe (Gear.lua): only from a prompt on a plot, for a living
-- player who stands next to it, and not too often.
local function gearUse(prompt, player, spec)
	local host = hostPart(prompt)
	local plot = host and plotOf(prompt)
	local _, root = characterParts(player)
	if not plot or not root then
		return
	end
	local spot = host.CFrame.Position
	if prompt.Parent:IsA("Attachment") then
		spot = host.CFrame:PointToWorldSpace(prompt.Parent.Position)
	end
	if (root.CFrame.Position - spot).Magnitude > prompt.MaxActivationDistance + GEAR_SLACK then
		return
	end
	local ok, message
	if spec.Gear then
		if not cooldownReady(player, "gear", GEAR_COOLDOWN) then
			return
		end
		ok, message = Gear.Give(player, spec.Gear, plot.Palette)
	else
		if not cooldownReady(player, "outfit", OUTFIT_COOLDOWN) then
			return
		end
		if spec.ChangeBack then
			ok, message = Gear.ChangeBack(player)
		else
			ok, message = Gear.Wear(player, spec.Outfit, plot)
		end
	end
	notify(player, message, ok and "success" or "info")
end

local function use(prompt, player)
	local spec = Interact.Uses[prompt:GetAttribute("Use")]
	if spec and (spec.Gear or spec.Outfit or spec.ChangeBack) then
		gearUse(prompt, player, spec)
		return
	end
	if spec and spec.Game then
		-- the client runs the game (it gets the same trigger); remember that it really started
		if hostPart(prompt) and plotOf(prompt) then
			sessions[player] = { prompt = prompt, started = os.clock() }
		end
		return
	end
	if not spec or not spec.Tool then
		return
	end
	if not cooldownReady(player, "give", 0.8) then
		return
	end
	local plot = plotOf(prompt)
	local ok, message = Snacks.Give(player, spec.Tool, plot and plot.Palette)
	notify(player, message, ok and "success" or "info")
end

-- Pays `amount` unless this activity paid in the last minute. Returns paid, secondsToWait.
local function reward(player, kind, amount)
	if amount <= 0 then
		return 0, nil
	end
	local key = "reward:" .. kind
	if not cooldownReady(player, key, REWARD_COOLDOWN) then
		return 0, math.ceil(cooldownLeft(player, key, REWARD_COOLDOWN))
	end
	PlayerData.AddCash(player, amount)
	return amount, nil
end

local function onUseResult(player, prompt, score)
	if typeof(prompt) ~= "Instance" or not prompt:IsA("ProximityPrompt") or prompt.Name ~= Interact.PromptName then
		return
	end
	local kind = prompt:GetAttribute("Use")
	local spec = Interact.Uses[kind]
	if not spec or not spec.Game or type(score) ~= "number" or score ~= score then
		return
	end
	-- only the game the player really started (by triggering this prompt), once
	local session = sessions[player]
	if not session or session.prompt ~= prompt then
		return
	end
	sessions[player] = nil
	local elapsed = os.clock() - session.started
	local length = GAME_LENGTH[kind]
	if length then
		local custom = prompt:GetAttribute("Duration")
		if type(custom) == "number" and custom > 0 then
			length = custom
		end
		if elapsed < length * 0.9 then
			return -- this game always runs to the end
		end
	end
	score = math.clamp(math.floor(score), 0, Interact.MaxScores[kind] or 0)
	score = math.min(score, math.floor((SCORE_RATE[kind] or 1) * elapsed) + 2)
	local host = hostPart(prompt)
	local _, root = characterParts(player)
	if not host or not root or (root.CFrame.Position - host.CFrame.Position).Magnitude > USE_DISTANCE then
		return
	end
	local plot = plotOf(prompt)
	if not plot then
		return
	end
	local model = plot.Model
	-- records anyone can set on any plot (shown on the arcade marquee / ping-pong board)
	if kind == "arcade" and score > (model:GetAttribute("ArcadeHigh") or 0) then
		model:SetAttribute("ArcadeHigh", score)
		model:SetAttribute("ArcadeHighName", player.DisplayName)
		notify(player, ("NEW HIGH SCORE: %d!"):format(score), "success")
	elseif kind == "pingpong" and score > (model:GetAttribute("RallyBest") or 0) then
		model:SetAttribute("RallyBest", score)
		model:SetAttribute("RallyBestName", player.DisplayName)
		notify(player, ("LONGEST RALLY EVER: %d!"):format(score), "success")
	end
	-- using your OWN facility helps your franchise
	if plot.Owner ~= player then
		return
	end
	local income = plotManager.GetBaseIncome(player)
	local note = franchise and franchise.RecordActivity(player, kind, score)
	local paid, wait = 0, nil
	if kind == "lift" and score >= 8 then
		paid, wait = reward(player, kind, math.max(50, math.floor(income * 10)))
	elseif (kind == "arcade" or kind == "pingpong") and score >= 5 then
		paid, wait = reward(player, kind, math.max(25, math.floor(income * math.min(score, 30) / 3)))
	elseif kind == "podium" then
		paid, wait = reward(player, kind, math.max(100, math.floor(income * 15)))
	end
	local parts = {}
	if kind == "lift" then
		table.insert(parts, ("%d reps!"):format(score))
	end
	if note then
		table.insert(parts, note)
	end
	if paid > 0 then
		table.insert(parts, "+" .. Format.MoneyExact(paid))
	elseif wait then
		table.insert(parts, ("(next cash reward in %ds)"):format(wait))
	end
	if #parts > 0 then
		notify(player, table.concat(parts, "  "), "success")
	end
end

---------------------------------------------------------------------------------------------
-- Setup
---------------------------------------------------------------------------------------------

-- True if the prompt's spot lies inside one of `parts` (other than its own part): a stripe round
-- a bus, the popcorn in its machine, the post through a plate... Roblox's line-of-sight test only
-- leaves out the prompt's own part, so such a prompt would never show.
local function buried(prompt, parts)
	local host = hostPart(prompt)
	if not host then
		return false
	end
	local point = host.CFrame.Position
	if prompt.Parent:IsA("Attachment") then
		point = host.CFrame:PointToWorldSpace(prompt.Parent.Position)
	end
	for _, part in ipairs(parts) do
		if part ~= host and part.CanQuery then
			local offset = part.CFrame:PointToObjectSpace(point)
			local size = part.Size
			if math.abs(offset.X) < size.X / 2 and math.abs(offset.Y) < size.Y / 2 and math.abs(offset.Z) < size.Z / 2 then
				return true
			end
		end
	end
	return false
end

-- Gets a built piece's prompts ready: fills in default texts from the registry (builders may leave
-- them empty), drops line of sight where the prompt's spot is buried in another part of the piece,
-- and hides a seat's "Sit" prompt while someone sits in it.
function Interactions.Decorate(model)
	local parts = nil
	for _, prompt in ipairs(model:GetDescendants()) do
		if prompt:IsA("ProximityPrompt") and prompt.Name == Interact.PromptName then
			local spec = Interact.Uses[prompt:GetAttribute("Use")]
			if spec then
				if prompt.ActionText == "" then
					prompt.ActionText = spec.Action
				end
				if prompt.ObjectText == "" and spec.Title then
					prompt.ObjectText = spec.Title
				end
			end
			if prompt.ActionText == "" then
				prompt.ActionText = "Interact"
			end
			if prompt.RequiresLineOfSight then
				if not parts then
					parts = {}
					for _, part in ipairs(model:GetDescendants()) do
						if part:IsA("BasePart") then
							table.insert(parts, part)
						end
					end
				end
				if buried(prompt, parts) then
					prompt.RequiresLineOfSight = false
				end
			end
			-- (only on a change: PlotManager hides prompts while a new piece rises into place)
			local seat = prompt:GetAttribute("Kind") == "seat" and hostPart(prompt)
			if seat and seat:IsA("Seat") then
				seat:GetPropertyChangedSignal("Occupant"):Connect(function()
					prompt.Enabled = seat.Occupant == nil
				end)
			end
		end
	end
end

function Interactions.OnPromptTriggered(prompt, player)
	if prompt.Name ~= Interact.PromptName then
		return
	end
	local kind = prompt:GetAttribute("Kind")
	if kind == "door" then
		if cooldownReady(player, "door", 0.4) then
			Interactions.ToggleDoor(prompt, player)
		end
	elseif kind == "seat" then
		sit(prompt, player)
	elseif kind == "elevator" then
		ride(prompt, player)
	elseif kind == "use" then
		use(prompt, player)
	end
end

function Interactions.Init(manager, remoteFolder, notify, franchiseModule)
	plotManager = manager
	notifyRemote = notify
	franchise = franchiseModule

	transitionRemote = Instance.new("RemoteEvent")
	transitionRemote.Name = "Transition"
	transitionRemote.Parent = remoteFolder
	local useResult = Instance.new("RemoteEvent")
	useResult.Name = "UseResult"
	useResult.OnServerEvent:Connect(onUseResult)
	useResult.Parent = remoteFolder

	plotManager.OnAnyBuilt(function(_plot, _item, model)
		Interactions.Decorate(model)
	end)
	for _, plot in ipairs(plotManager.GetPlots()) do
		local base = plot.Model:FindFirstChild("Base") -- the plot's own buildings (HQ shell, bus stops...)
		if base then
			Interactions.Decorate(base)
		end
	end
	ProximityPromptService.PromptTriggered:Connect(Interactions.OnPromptTriggered)
	Players.PlayerRemoving:Connect(function(player)
		cooldowns[player] = nil
		sessions[player] = nil
	end)
end

-- exposed for tests
Interactions._onUseResult = onUseResult
Interactions._resetCooldowns = function(player)
	cooldowns[player] = nil
end
Interactions._backdateSession = function(player, seconds)
	if sessions[player] then
		sessions[player].started -= seconds
	end
end

return Interactions
