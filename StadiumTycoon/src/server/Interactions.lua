--[[
	Interactions
	Server side of the "Interact" ProximityPrompts that builders put all over the franchise
	(see ReplicatedStorage.TycoonShared.Interact and BuildUtil.Look/Door/Seat/Elevator/Use):

	  door      swings / slides the door open, closes it again after a few seconds
	  seat      sits the player down (TV camera seats are handled by Interact.client.lua)
	  elevator  fades the player's screen and moves them to the other level
	  use       items (Snacks.lua) are handed out here; mini-games run on the client and send
	            their result back through the UseResult remote
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

local PlayerData = require(script.Parent.PlayerData)
local Snacks = require(script.Parent.Snacks)

local Interactions = {}

local DOOR_SECONDS = 0.6
local RIDE_FADE_SECONDS = 0.35
local USE_DISTANCE = 25 -- how close you must still be to the thing when a mini-game ends
-- shortest believable time for one mini-game (results arriving faster are ignored)
local GAME_SECONDS = { lift = 4, arcade = 12, pingpong = 2, podium = 2 }
local REWARD_COOLDOWN = 60 -- seconds between cash rewards for the same activity

local plotManager = nil
local franchise = nil
local notifyRemote = nil
local transitionRemote = nil
local doorTokens = setmetatable({}, { __mode = "k" }) -- [door model] = number
local cooldowns = {} -- [player] = { [key] = os.clock() }

local function notify(player, message, kind)
	if notifyRemote and player.Parent then
		notifyRemote:FireClient(player, message, kind or "info")
	end
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

function Interactions.ToggleDoor(prompt)
	local marker = hostPart(prompt)
	local model = marker and marker.Parent
	if not model or not model:GetAttribute("Leaves") then
		return
	end
	setDoor(model, prompt, not model:GetAttribute("IsOpen"))
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
	if character.Parent == nil or player.Character ~= character then
		return
	end
	character:PivotTo(target * CFrame.new(0, 3, 0))
end

---------------------------------------------------------------------------------------------
-- Use: items + mini-game results
---------------------------------------------------------------------------------------------

local function use(prompt, player)
	local spec = Interact.Uses[prompt:GetAttribute("Use")]
	if not spec or not spec.Tool then
		return -- mini-games are started by the client (it gets the same trigger)
	end
	if not cooldownReady(player, "give", 0.8) then
		return
	end
	local plot = plotOf(prompt)
	local ok, message = Snacks.Give(player, spec.Tool, plot and plot.Palette)
	notify(player, message, ok and "success" or "info")
end

local function reward(player, kind, amount)
	if amount <= 0 or not cooldownReady(player, "reward:" .. kind, REWARD_COOLDOWN) then
		return 0
	end
	PlayerData.AddCash(player, amount)
	return amount
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
	score = math.clamp(math.floor(score), 0, Interact.MaxScores[kind] or 0)
	local host = hostPart(prompt)
	local _, root = characterParts(player)
	if not host or not root or (root.CFrame.Position - host.CFrame.Position).Magnitude > USE_DISTANCE then
		return
	end
	if not cooldownReady(player, "game:" .. kind, GAME_SECONDS[kind] or 2) then
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
	local income = plotManager.GetIncome(player)
	local note = franchise and franchise.RecordActivity(player, kind, score)
	local paid = 0
	if kind == "lift" and score >= 8 then
		paid = reward(player, kind, math.max(50, math.floor(income * 10)))
	elseif (kind == "arcade" or kind == "pingpong") and score >= 5 then
		paid = reward(player, kind, math.max(25, math.floor(income * math.min(score, 30) / 3)))
	elseif kind == "podium" then
		paid = reward(player, kind, math.max(100, math.floor(income * 15)))
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
	end
	if #parts > 0 then
		notify(player, table.concat(parts, "  "), "success")
	end
end

---------------------------------------------------------------------------------------------
-- Setup
---------------------------------------------------------------------------------------------

-- Fills in default prompt texts from the registry (builders may leave them empty).
function Interactions.Decorate(model)
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
			Interactions.ToggleDoor(prompt)
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
	ProximityPromptService.PromptTriggered:Connect(Interactions.OnPromptTriggered)
	Players.PlayerRemoving:Connect(function(player)
		cooldowns[player] = nil
	end)
end

-- exposed for tests
Interactions._onUseResult = onUseResult
Interactions._resetCooldowns = function(player)
	cooldowns[player] = nil
end

return Interactions
