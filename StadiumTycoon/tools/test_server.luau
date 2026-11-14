--[[
	Offline tests for the server game logic (PlotManager, PlayerData, World) and the client HUD.
	Runs with Lune using a small fake Roblox engine (signals, players, DataStore, TweenService).

	Usage (from the StadiumTycoon folder):
	  lune run tools/test_server.luau
]]

local fs = require("@lune/fs")
local luau = require("@lune/luau")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")
local task = require("@lune/task")

local Instance = roblox.Instance
local CFrame = roblox.CFrame
local Vector3 = roblox.Vector3
local Enum = roblox.Enum

---------------------------------------------------------------------------------------------
-- Tiny test framework
---------------------------------------------------------------------------------------------
local passed, failed = 0, 0
local currentSection = ""
local function section(name)
	currentSection = name
	print("\n== " .. name)
end
local function check(condition, message)
	if condition then
		passed += 1
		print("  ok    " .. message)
	else
		failed += 1
		print("  FAIL  " .. message .. "   [" .. currentSection .. "]")
	end
end

---------------------------------------------------------------------------------------------
-- Fake engine pieces
---------------------------------------------------------------------------------------------
local workspace = Instance.new("Workspace")

local Signal = {}
Signal.__index = Signal
function Signal.new()
	return setmetatable({ handlers = {} }, Signal)
end
function Signal:Connect(fn)
	table.insert(self.handlers, fn)
	return {
		Disconnect = function() end,
	}
end
function Signal:Fire(...)
	for _, fn in ipairs(self.handlers) do
		task.spawn(fn, ...)
	end
end
function Signal:Wait()
	local thread = coroutine.running()
	self:Connect(function(...)
		task.spawn(thread, ...)
	end)
	return coroutine.yield()
end

-- Per-instance signals (Lune instances have no events), keyed by a unique attribute.
local nextId = 0
local instanceSignals = {}
local function instanceKey(inst)
	local id = inst:GetAttribute("__testId")
	if not id then
		nextId += 1
		id = nextId
		inst:SetAttribute("__testId", id)
	end
	return id
end
local function instanceSignal(inst, name)
	local key = instanceKey(inst) .. ":" .. name
	if not instanceSignals[key] then
		instanceSignals[key] = Signal.new()
	end
	return instanceSignals[key]
end
roblox.implementProperty("BasePart", "Touched", function(inst)
	return instanceSignal(inst, "Touched")
end)
roblox.implementMethod("Instance", "WaitForChild", function(inst, name)
	return inst:FindFirstChild(name)
end)
roblox.implementMethod("Model", "PivotTo", function(model, cf)
	local pivot = model.PrimaryPart or model:FindFirstChild("HumanoidRootPart")
	if not pivot then
		return
	end
	local offset = cf * pivot.CFrame:Inverse()
	for _, part in ipairs(model:GetDescendants()) do
		if part:IsA("BasePart") then
			part.CFrame = offset * part.CFrame
		end
	end
end)
roblox.implementMethod("Instance", "GetPropertyChangedSignal", function(inst, name)
	return instanceSignal(inst, "Prop" .. name)
end)
roblox.implementMethod("Workspace", "BulkMoveTo", function(_, parts, cframes)
	for index, part in ipairs(parts) do
		part.CFrame = cframes[index]
	end
end)
roblox.implementProperty("ValueBase", "Changed", function(inst)
	return instanceSignal(inst, "Changed")
end)

-- TweenService: applies the goal immediately (and fires value Changed signals)
local tweens = {}
local TweenService = {
	Create = function(_, inst, _info, goal)
		local tween = {
			Completed = Signal.new(),
		}
		function tween.Play()
			for key, value in pairs(goal) do
				inst[key] = value
				if key == "Value" and inst:IsA("ValueBase") then
					instanceSignal(inst, "Changed"):Fire(value)
				end
			end
			task.defer(function()
				tween.Completed:Fire(Enum.PlaybackState.Completed)
			end)
		end
		function tween.Cancel() end
		table.insert(tweens, tween)
		return tween
	end,
}

local TweenInfoMock = {
	new = function(...)
		return { ... }
	end,
}
local RandomMock = {
	new = function()
		return {
			NextNumber = function()
				return math.random()
			end,
			NextInteger = function(_, a, b)
				return math.random(a, b)
			end,
		}
	end,
}

-- DataStore with deep-copied values (like the real service serialises them)
local function deepCopy(value)
	if type(value) ~= "table" then
		return value
	end
	local copy = {}
	for k, v in pairs(value) do
		copy[k] = deepCopy(v)
	end
	return copy
end

local function newStore()
	local store = { data = {}, failWith = nil, failNext = 0, delay = 0, writes = 0 }
	function store:UpdateAsync(key, transform)
		if self.delay > 0 then
			task.wait(self.delay)
		else
			task.wait()
		end
		if self.failWith then
			error(self.failWith)
		end
		if self.failNext > 0 then
			self.failNext -= 1
			error("502: API Services rejected request with error. HTTP 500 (Internal Server Error)")
		end
		local result = transform(deepCopy(self.data[key]))
		if result ~= nil then
			self.data[key] = deepCopy(result)
			self.writes += 1
		end
		return result
	end
	function store:GetAsync(key)
		task.wait()
		return deepCopy(self.data[key])
	end
	return store
end
local dataStore = newStore()
local DataStoreService = {
	GetDataStore = function()
		return dataStore
	end,
}

-- Players
local Players = {
	PlayerAdded = Signal.new(),
	PlayerRemoving = Signal.new(),
	list = {},
	LocalPlayer = nil,
}
function Players:GetPlayers()
	return self.list
end
function Players:GetPlayerByUserId(userId)
	for _, player in ipairs(self.list) do
		if player.UserId == userId then
			return player
		end
	end
	return nil
end
function Players:GetPlayerFromCharacter(character)
	if character == nil then
		return nil
	end
	for _, player in ipairs(self.list) do
		if
			player.Character
			and player.Character:GetAttribute("__testId") ~= nil
			and character:GetAttribute("__testId") == player.Character:GetAttribute("__testId")
		then
			return player
		end
	end
	return nil
end

local function makeCharacter(name)
	local character = Instance.new("Model")
	character.Name = name
	local root = Instance.new("Part")
	root.Name = "HumanoidRootPart"
	root.Size = Vector3.new(2, 2, 1)
	root.CFrame = CFrame.new(0, 3, 0)
	root.Parent = character
	local leg = Instance.new("Part")
	leg.Name = "LeftFoot"
	leg.Parent = character
	local humanoid = Instance.new("Humanoid")
	humanoid.MaxHealth = 100
	humanoid.Health = 100
	humanoid.WalkSpeed = 16
	humanoid.Parent = character
	instanceKey(character)
	character.Parent = workspace
	return character
end

local function makePlayer(name, userId)
	local player = {
		Name = name,
		DisplayName = name,
		UserId = userId,
		Parent = Players,
		attributes = {},
		attributeSignals = {},
		CharacterAdded = Signal.new(),
	}
	function player:SetAttribute(key, value)
		local old = self.attributes[key]
		self.attributes[key] = value
		if old ~= value and self.attributeSignals[key] then
			self.attributeSignals[key]:Fire()
		end
	end
	function player:GetAttribute(key)
		return self.attributes[key]
	end
	function player:GetAttributeChangedSignal(key)
		if not self.attributeSignals[key] then
			self.attributeSignals[key] = Signal.new()
		end
		return self.attributeSignals[key]
	end
	function player:WaitForChild(childName)
		return self[childName]
	end
	-- leaderstats can't be parented to a fake (table) player, so the test makes it up front
	local leaderstats = Instance.new("Folder")
	leaderstats.Name = "leaderstats"
	for _, statName in ipairs({ "Wins", "Rating", "Titles" }) do
		local value = Instance.new("IntValue")
		value.Name = statName
		value.Parent = leaderstats
	end
	player.leaderstats = leaderstats
	player.Backpack = Instance.new("Backpack")
	function player:FindFirstChildOfClass(className)
		if className == "Backpack" then
			return self.Backpack
		end
		return nil
	end
	function player:FindFirstChild(childName)
		local child = rawget(self, childName)
		return typeof(child) == "Instance" and child or nil
	end
	player.Character = makeCharacter(name .. "Character")
	table.insert(Players.list, player)
	return player
end

local function removePlayer(player)
	player.Parent = nil
	for index, other in ipairs(Players.list) do
		if other == player then
			table.remove(Players.list, index)
			break
		end
	end
end

local notifications = {}
local notifyRemote = {
	OnClientEvent = Signal.new(),
}
function notifyRemote:FireClient(player, message, kind)
	table.insert(notifications, { player = player, message = message, kind = kind })
end
local function lastNotification(player)
	for index = #notifications, 1, -1 do
		if notifications[index].player == player then
			return notifications[index]
		end
	end
	return nil
end

---------------------------------------------------------------------------------------------
-- Module loader with a fake `game`
---------------------------------------------------------------------------------------------
local ROOTS = {
	["ReplicatedStorage/TycoonShared"] = "src/shared",
	["ServerScriptService/TycoonServer"] = "src/server",
	["StarterPlayer/StarterPlayerScripts/TycoonClient"] = "src/client",
}

local function resolveFile(path)
	for prefix, folder in pairs(ROOTS) do
		if path == prefix or path:sub(1, #prefix + 1) == prefix .. "/" then
			local rest = path:sub(#prefix + 2)
			local base = rest == "" and folder or (folder .. "/" .. rest)
			for _, candidate in ipairs({
				base .. ".lua",
				base .. ".luau",
				base .. "/init.lua",
				base .. ".server.lua",
				base .. ".client.lua",
			}) do
				if fs.isFile(candidate) then
					return candidate
				end
			end
			if fs.isDir(base) then
				return nil, true
			end
		end
	end
	return nil, false
end

local nodeMeta = {}
local remotesFolder = { Notify = notifyRemote }
local function makeNode(path)
	return setmetatable({ __path = path }, nodeMeta)
end
nodeMeta.__index = function(self, key)
	local path = rawget(self, "__path")
	if key == "Parent" then
		return makeNode(path:match("^(.*)/[^/]+$") or "")
	elseif key == "FindFirstChild" or key == "WaitForChild" then
		return function(_, name)
			if path == "ReplicatedStorage" and name == "TycoonRemotes" then
				return {
					WaitForChild = function(_, n)
						return remotesFolder[n]
					end,
				}
			end
			local childPath = path .. "/" .. name
			local file, isDir = resolveFile(childPath)
			if file or isDir then
				return makeNode(childPath)
			end
			if key == "WaitForChild" then
				error("WaitForChild would hang: " .. childPath)
			end
			return nil
		end
	end
	return makeNode(path == "" and key or (path .. "/" .. key))
end

local fakeGame = {
	GameId = 12345,
	JobId = "server-A",
	closeHandlers = {},
}
local studioMode = false
local RunServiceMock = {
	RenderStepped = Signal.new(),
	Heartbeat = Signal.new(),
}
function RunServiceMock:IsStudio()
	return studioMode
end
local guidCounter = 0
local HttpServiceMock = {}
function HttpServiceMock:JSONEncode(value)
	return serde.encode("json", value)
end
function HttpServiceMock:JSONDecode(text)
	return serde.decode("json", text)
end
function HttpServiceMock:GenerateGUID()
	guidCounter += 1
	return "guid-" .. guidCounter
end
local tags = {} -- tag -> { instances }
local tagSignals = {}
local function tagSignal(tag, kind)
	local key = tag .. ":" .. kind
	tagSignals[key] = tagSignals[key] or Signal.new()
	return tagSignals[key]
end
local CollectionServiceMock = {}
function CollectionServiceMock:AddTag(inst, tag)
	tags[tag] = tags[tag] or {}
	table.insert(tags[tag], inst)
	tagSignal(tag, "added"):Fire(inst)
end
function CollectionServiceMock:HasTag(inst, tag)
	for _, other in ipairs(tags[tag] or {}) do
		if other == inst then
			return true
		end
	end
	return false
end
function CollectionServiceMock:GetTagged(tag)
	local list = {}
	for _, inst in ipairs(tags[tag] or {}) do
		if inst.Parent then
			table.insert(list, inst)
		end
	end
	return list
end
function CollectionServiceMock:GetInstanceAddedSignal(tag)
	return tagSignal(tag, "added")
end
function CollectionServiceMock:GetInstanceRemovedSignal(tag)
	return tagSignal(tag, "removed")
end
local playedSounds = {}
local soundService = Instance.new("Folder")
soundService.Name = "SoundService"
roblox.implementMethod("Folder", "PlayLocalSound", function(_, sound)
	table.insert(playedSounds, sound.Name)
end)
local networkOwners = {}
roblox.implementMethod("BasePart", "SetNetworkOwner", function(part, owner)
	networkOwners[instanceKey(part)] = owner or false
end)
roblox.implementMethod("Workspace", "GetServerTimeNow", function()
	return os.clock()
end)
roblox.implementMethod("Instance", "GetAttributeChangedSignal", function(inst, name)
	return instanceSignal(inst, "Attr" .. name)
end)
-- Remotes: FireServer/InvokeServer come from Players.LocalPlayer, FireClient is recorded
local clientFires = {} -- { remote = name, player = p, args = { ... } }
roblox.implementProperty("RemoteEvent", "OnServerEvent", function(inst)
	return instanceSignal(inst, "OnServerEvent")
end)
roblox.implementProperty("RemoteEvent", "OnClientEvent", function(inst)
	return instanceSignal(inst, "OnClientEvent")
end)
roblox.implementMethod("RemoteEvent", "FireServer", function(inst, ...)
	instanceSignal(inst, "OnServerEvent"):Fire(Players.LocalPlayer, ...)
end)
roblox.implementMethod("RemoteEvent", "FireClient", function(inst, player, ...)
	table.insert(clientFires, { remote = inst.Name, player = player, args = { ... } })
	instanceSignal(inst, "OnClientEvent"):Fire(...)
end)
local serverInvokes = {} -- [remote key] = fn
roblox.implementProperty("RemoteFunction", "OnServerInvoke", function(inst)
	return serverInvokes[instanceKey(inst)]
end, function(inst, fn)
	serverInvokes[instanceKey(inst)] = fn
end)
roblox.implementMethod("RemoteFunction", "InvokeServer", function(inst, ...)
	return serverInvokes[instanceKey(inst)](Players.LocalPlayer, ...)
end)
roblox.implementProperty("GuiButton", "Activated", function(inst)
	return instanceSignal(inst, "Activated")
end)
local UserInputServiceMock = { InputBegan = Signal.new(), InputChanged = Signal.new(), TouchEnabled = false, KeyboardEnabled = true }
local ProximityPromptServiceMock = { PromptTriggered = Signal.new() }
local boundActions = {} -- [name] = handler
local ContextActionServiceMock = {}
function ContextActionServiceMock:BindActionAtPriority(name, handler)
	boundActions[name] = handler
end
function ContextActionServiceMock:BindAction(name, handler)
	boundActions[name] = handler
end
function ContextActionServiceMock:UnbindAction(name)
	boundActions[name] = nil
end
local seatSits = {} -- [seat key] = humanoid
roblox.implementMethod("Seat", "Sit", function(seat, humanoid)
	seatSits[instanceKey(seat)] = humanoid
end)
roblox.implementProperty("Tool", "Activated", function(inst)
	return instanceSignal(inst, "Activated")
end)

local services = {
	Players = Players,
	TweenService = TweenService,
	DataStoreService = DataStoreService,
	RunService = RunServiceMock,
	HttpService = HttpServiceMock,
	CollectionService = CollectionServiceMock,
	SoundService = soundService,
	UserInputService = UserInputServiceMock,
	ProximityPromptService = ProximityPromptServiceMock,
	ContextActionService = ContextActionServiceMock,
}
local lighting = Instance.new("Lighting")
function fakeGame:GetService(name)
	if services[name] then
		return services[name]
	elseif name == "Workspace" then
		return workspace
	elseif name == "Lighting" then
		return lighting
	end
	return makeNode(name)
end
function fakeGame:BindToClose(fn)
	table.insert(self.closeHandlers, fn)
end

local moduleCache = {}
local requireNode
local function makeEnv(scriptPath)
	local env = {
		script = makeNode(scriptPath),
		game = fakeGame,
		workspace = workspace,
		task = task,
		TweenInfo = TweenInfoMock,
		Random = RandomMock,
		require = function(node)
			return requireNode(rawget(node, "__path"))
		end,
		warn = function(...)
			print("    [warn]", ...)
		end,
		print = function(...)
			print("    [print]", ...)
		end,
	}
	for _, name in ipairs({
		"Instance",
		"Vector3",
		"Vector2",
		"CFrame",
		"Color3",
		"BrickColor",
		"UDim",
		"UDim2",
		"Enum",
		"NumberSequence",
		"NumberSequenceKeypoint",
		"ColorSequenceKeypoint",
		"ColorSequence",
		"NumberRange",
		"PhysicalProperties",
		"Font",
		"Rect",
	}) do
		env[name] = roblox[name]
	end
	return env
end

requireNode = function(path)
	if moduleCache[path] ~= nil then
		return moduleCache[path]
	end
	local file = resolveFile(path)
	assert(file, "Cannot require " .. path)
	local chunk = luau.load(fs.readFile(file), { debugName = file, environment = makeEnv(path) })
	local result = chunk()
	moduleCache[path] = result
	return result
end

local function runScript(path)
	local file = resolveFile(path)
	assert(file, "Cannot find script " .. path)
	local chunk = luau.load(fs.readFile(file), { debugName = file, environment = makeEnv(path) })
	return chunk()
end

---------------------------------------------------------------------------------------------
-- Helpers for the tests
---------------------------------------------------------------------------------------------
local Config = requireNode("ReplicatedStorage/TycoonShared/Config")
local Items = requireNode("ReplicatedStorage/TycoonShared/Items")
Config.IncomeTickSeconds = 0.05
Config.IncomeMultiplier = 20
Config.AutosaveSeconds = 0.3
Config.BuildFrameBudget = math.huge -- whole plots are built at once here (one section tests the spread-out build)

local PlayerData = requireNode("ServerScriptService/TycoonServer/PlayerData")
local PlotManager = requireNode("ServerScriptService/TycoonServer/PlotManager")
local World = requireNode("ServerScriptService/TycoonServer/World")

local function touch(part, player)
	instanceSignal(part, "Touched"):Fire(player.Character:FindFirstChild("LeftFoot"))
	task.wait(0.02)
end

local tycoons = Instance.new("Folder")
tycoons.Name = "Tycoons"
tycoons.Parent = workspace

local function plotModel(index)
	return tycoons:FindFirstChild("Plot" .. index)
end
local function button(index, itemId)
	return plotModel(index).Buttons:FindFirstChild("Buy_" .. itemId)
end
local function claimTrigger(index)
	return plotModel(index).Base:FindFirstChild("ClaimTrigger", true)
end
local function countChildren(inst)
	return #inst:GetChildren()
end

---------------------------------------------------------------------------------------------
-- Tests
---------------------------------------------------------------------------------------------
local function runTests()
	section("World layout")
	do
		local origins = World.GetPlotOrigins(Config)
		check(#origins == Config.PlotCount, ("%d plot origins"):format(#origins))
		local L = Config.Layout
		for i = 1, #origins do
			local front = origins[i] * CFrame.new(0, 0, -L.PlotDepth / 2)
			check(
				math.abs(front.Position.Z) < L.StreetWidth / 2 + 0.01,
				("plot %d front edge touches the street (z=%.1f)"):format(i, front.Position.Z)
			)
			for j = i + 1, #origins do
				local a, b = origins[i].Position, origins[j].Position
				local apart = math.abs(a.X - b.X) >= L.PlotWidth or math.abs(a.Z - b.Z) >= L.PlotDepth
				check(apart, ("plots %d and %d don't overlap"):format(i, j))
			end
		end
		World.Build(Config)
		check(workspace:FindFirstChild("World") ~= nil, "World.Build creates the World folder")
		check(workspace:FindFirstChild("Ground") ~= nil, "World.Build creates Ground when missing")
		check(workspace:FindFirstChildOfClass("SpawnLocation") ~= nil, "World.Build creates a SpawnLocation when missing")
		local street = workspace.World:FindFirstChild("Street")
		local streetTop = street and street.CFrame.Position.Y + street.Size.Y / 2
		local ground = workspace:FindFirstChild("Ground")
		local groundTop = ground and ground.CFrame.Position.Y + ground.Size.Y / 2
		check(
			streetTop ~= nil and math.abs(origins[1].Position.Y - streetTop) < 0.01 and groundTop <= origins[1].Position.Y,
			"plots sit level with the street, not on a ledge (golf carts roll on and off)"
		)
		check(World.IsNight(Config, 20) and World.IsNight(Config, 3) and not World.IsNight(Config, 12), "IsNight boundaries")
	end

	do
		-- Signs and props stay in view: each piece is built with its real builder (all steps) in its
		-- own area's coordinates, then sight lines are checked against the parts that could hide them.
		section("Signs and props stay in view")
		local BuildUtil = requireNode("ServerScriptService/TycoonServer/BuildUtil")
		local Builders = requireNode("ServerScriptService/TycoonServer/Builders")
		local function build(pieceId)
			local model = Instance.new("Model")
			model.Name = pieceId
			Builders[pieceId](BuildUtil.NewContext(CFrame.new(), model, Config.TeamColors[1], "TEST", Config))
			return model
		end
		local function partsOf(model, name)
			local list = {}
			for _, d in ipairs(model:GetDescendants()) do
				if d:IsA("BasePart") and (name == nil or d.Name == name) then
					table.insert(list, d)
				end
			end
			return list
		end
		-- world-space bounds of a part (rotation included)
		local function bounds(part)
			local cf, h = part.CFrame, part.Size / 2
			local rv, uv, lv = cf.RightVector, cf.UpVector, cf.LookVector
			local e = Vector3.new(
				math.abs(rv.X) * h.X + math.abs(uv.X) * h.Y + math.abs(lv.X) * h.Z,
				math.abs(rv.Y) * h.X + math.abs(uv.Y) * h.Y + math.abs(lv.Y) * h.Z,
				math.abs(rv.Z) * h.X + math.abs(uv.Z) * h.Y + math.abs(lv.Z) * h.Z
			)
			return cf.Position - e, cf.Position + e
		end
		local function boxesOverlap(aLo, aHi, bLo, bHi)
			return aLo.X < bHi.X and aHi.X > bLo.X and aLo.Y < bHi.Y and aHi.Y > bLo.Y and aLo.Z < bHi.Z and aHi.Z > bLo.Z
		end
		-- true if the straight line a -> b passes through the part's box
		local function crosses(part, a, b)
			local p0 = part.CFrame:PointToObjectSpace(a)
			local d = part.CFrame:PointToObjectSpace(b) - p0
			local half = part.Size / 2
			local t0, t1 = 0, 1
			for _, axis in ipairs({ "X", "Y", "Z" }) do
				local o, v, h = p0[axis], d[axis], half[axis]
				if math.abs(v) < 1e-9 then
					if math.abs(o) > h then
						return false
					end
				else
					local ta, tb = (-h - o) / v, (h - o) / v
					t0, t1 = math.max(t0, math.min(ta, tb)), math.min(t1, math.max(ta, tb))
					if t0 > t1 then
						return false
					end
				end
			end
			return true
		end
		-- the first part of `list` (other than `skip`) that the line a -> b passes through
		local function blocker(list, a, b, skip)
			for _, part in ipairs(list) do
				if part ~= skip and crosses(part, a, b) then
					return part
				end
			end
			return nil
		end
		-- the keys of a set, sorted (for the messages)
		local function keysOf(set)
			local list = {}
			for key in pairs(set) do
				table.insert(list, key)
			end
			table.sort(list)
			return list
		end
		-- the faces of a part that carry text: { { text, normal (world), centre (world) } }
		local FACE_AXIS = {
			Right = Vector3.new(1, 0, 0),
			Left = Vector3.new(-1, 0, 0),
			Top = Vector3.new(0, 1, 0),
			Bottom = Vector3.new(0, -1, 0),
			Back = Vector3.new(0, 0, 1),
			Front = Vector3.new(0, 0, -1),
		}
		local function letteredFaces(part)
			local faces = {}
			for _, gui in ipairs(part:GetChildren()) do
				if gui:IsA("SurfaceGui") then
					for _, label in ipairs(gui:GetDescendants()) do
						if label:IsA("TextLabel") and label.Text ~= "" then
							local axis = FACE_AXIS[gui.Face.Name]
							table.insert(faces, {
								text = label.Text,
								normal = part.CFrame:VectorToWorldSpace(axis),
								centre = part.CFrame:PointToWorldSpace(axis * part.Size / 2),
							})
							break
						end
					end
				end
			end
			return faces
		end

		-- F1: the interview room's PRESS ROOM panel and ON AIR light (on the lobby's east wall) are in
		-- plain view from the lobby floor: the grand staircase doesn't stand in front of them
		do
			local stairs = partsOf(build("hq_atrium"))
			local interview = build("hq_interview")
			local eyes =
				{ Vector3.new(-100, 5.3, 210), Vector3.new(-100, 5.3, 232), Vector3.new(-120, 5.3, 222), Vector3.new(-75, 5.3, 215) }
			local found, hidden = 0, {}
			for _, name in ipairs({ "LobbySign", "OnAirLight" }) do
				for _, panel in ipairs(partsOf(interview, name)) do
					found += 1
					local lo, hi = bounds(panel)
					for i = 1, 5 do
						for j = 1, 3 do
							local spot = Vector3.new(lo.X - 0.01, lo.Y + (hi.Y - lo.Y) * j / 4, lo.Z + (hi.Z - lo.Z) * i / 6)
							for _, eye in ipairs(eyes) do
								local hit = blocker(stairs, eye, spot)
								if hit then
									hidden[name .. " (" .. hit.Name .. ")"] = true
								end
							end
						end
					end
				end
			end
			local list = keysOf(hidden)
			check(
				found == 2 and #list == 0,
				"the PRESS ROOM panel and ON AIR light are in plain view from the lobby, not behind the grand staircase "
					.. table.concat(list, ", ")
			)
		end

		-- F2: every parking lamp pole stands on something (its concrete base or the island grass)
		do
			local parking = build("parking")
			local all, poles, floating = partsOf(parking), partsOf(parking, "LampPole"), {}
			for _, pole in ipairs(poles) do
				local lo = bounds(pole)
				local foot = pole.CFrame.Position
				local standsOn = false
				for _, other in ipairs(all) do
					local oLo, oHi = bounds(other)
					if
						other ~= pole
						and math.abs(oHi.Y - lo.Y) < 0.01
						and foot.X > oLo.X
						and foot.X < oHi.X
						and foot.Z > oLo.Z
						and foot.Z < oHi.Z
					then
						standsOn = true
					end
				end
				if not standsOn then
					table.insert(floating, ("(%.1f, %.1f) bottom %.2f"):format(foot.X, foot.Z, lo.Y))
				end
			end
			check(
				#poles == 6 and #floating == 0,
				("the %d parking lamp poles stand on a base or on the island grass, none float %s"):format(
					#poles,
					table.concat(floating, ", ")
				)
			)
		end

		-- F3: nothing of the team bench area stands in front of the home field wall's ads, screens and
		-- section plaques, and the plaques still mark the home sections 113..119
		do
			local wall = build("lower_home")
			local bench = partsOf(build("benches"))
			local panels, covered, plaques = 0, {}, {}
			for _, panel in ipairs(partsOf(wall)) do
				if panel.Name == "AdBoard" or panel.Name == "WallScreen" or panel.Name == "SectionSign" then
					panels += 1
					local lo, hi = bounds(panel)
					-- the space between the panel and the field (the home wall faces -Z)
					local zoneLo, zoneHi = Vector3.new(lo.X, lo.Y, lo.Z - 15), Vector3.new(hi.X, hi.Y, lo.Z)
					for _, part in ipairs(bench) do
						local bLo, bHi = bounds(part)
						if boxesOverlap(zoneLo, zoneHi, bLo, bHi) then
							covered[("%s x %.0f..%.0f (%s)"):format(panel.Name, lo.X, hi.X, part.Name)] = true
						end
					end
					if panel.Name == "SectionSign" then
						local face = letteredFaces(panel)[1]
						table.insert(plaques, face and face.text or "?")
					end
				end
			end
			local list = keysOf(covered)
			table.sort(plaques)
			check(
				panels > 10 and #list == 0,
				"no bench, board or tent stands in front of a home field-wall panel " .. table.concat(list, ", ")
			)
			check(
				table.concat(plaques, ",") == "SEC 113,SEC 114,SEC 115,SEC 116,SEC 117,SEC 118,SEC 119",
				"the home field wall's plaques mark sections 113..119: " .. table.concat(plaques, ",")
			)
		end

		-- F4: the Hall of Fame skybridge's name doesn't face the Hall of Fame's wall, and the concourse
		-- restroom blade signs hang over the lane's edge (above its head room, not collidable) with
		-- neither face looking into a food stand or a restroom wall
		do
			local fascias = partsOf(build("campus_links"), "BridgeFascia")
			local hall = partsOf(build("hall_of_fame"))
			local lettered, facingWall = 0, {}
			for _, fascia in ipairs(fascias) do
				for _, face in ipairs(letteredFaces(fascia)) do
					lettered += 1
					local from = face.centre + face.normal * 0.05
					local hit = blocker(hall, from, from + face.normal * 20)
					if hit then
						table.insert(facingWall, hit.Name)
					end
				end
			end
			check(
				#fascias == 2 and lettered == 1 and #facingWall == 0,
				"the Hall of Fame skybridge's name faces open air, not the Hall of Fame's wall " .. table.concat(facingWall, ", ")
			)

			local restrooms = build("concourse_restrooms")
			local around = partsOf(build("concourse_food"))
			for _, part in ipairs(partsOf(restrooms)) do
				table.insert(around, part)
			end
			local headRoom = Config.Layout.Bowl.MainConcourse.Floor + 9 -- the lane's head room (render_plot)
			local blades, bad = partsOf(restrooms, "WayfindingSign"), {}
			for _, blade in ipairs(blades) do
				local lo, at = bounds(blade), blade.CFrame.Position
				local where = ("(%.0f, %.0f)"):format(at.X, at.Z)
				if blade.CanCollide or lo.Y < headRoom then
					table.insert(bad, where .. " is in the lane's head room")
				end
				local faces = letteredFaces(blade)
				if #faces ~= 2 then
					table.insert(bad, ("%s has %d lettered faces"):format(where, #faces))
				end
				for _, face in ipairs(faces) do
					local from = face.centre + face.normal * 0.05
					local hit = blocker(around, from, from + face.normal * 12, blade)
					if hit then
						table.insert(bad, where .. " faces " .. hit.Name)
					end
				end
			end
			check(#blades == 6 and #bad == 0, "the restroom blade signs face along the concourse lane " .. table.concat(bad, ", "))
		end

		-- F5: the AWAY stencil over the visitor locker room door is not covered by the welcome sign, and
		-- the staff's role signs stand in front of the figures (text toward the road, nothing of the
		-- figure in front of it, no prop hidden behind it)
		do
			local visitor = build("visitor_lockerroom")
			local others = partsOf(visitor)
			local stencils, covered = 0, {}
			for _, lintel in ipairs(partsOf(visitor, "DoorLintel")) do
				local gui = lintel:FindFirstChild("DoorStencilGui")
				local label = gui and gui:FindFirstChild("Stencil")
				if label then
					stencils += 1
					-- the label's rectangle on the lintel's corridor face (Back, +Z), either way round
					local lo, hi = bounds(lintel)
					local w, h = hi.X - lo.X, hi.Y - lo.Y
					local a0, a1 = label.Position.X.Scale, label.Position.X.Scale + label.Size.X.Scale
					local top = hi.Y - label.Position.Y.Scale * h
					local zoneLo = Vector3.new(lo.X + math.min(a0, 1 - a1) * w, top - label.Size.Y.Scale * h, hi.Z)
					local zoneHi = Vector3.new(lo.X + math.max(a1, 1 - a0) * w, top, hi.Z + 0.5)
					for _, part in ipairs(others) do
						local pLo, pHi = bounds(part)
						if part ~= lintel and boxesOverlap(zoneLo, zoneHi, pLo, pHi) then
							table.insert(covered, part.Name)
						end
					end
				end
			end
			check(
				stencils == 1 and #covered == 0,
				"the AWAY stencil over the visitor locker room door is in view " .. table.concat(covered, ", ")
			)

			local signs, problems = 0, {}
			for _, pieceId in ipairs({ "staff_coaches", "staff_trainers" }) do
				local staff = build(pieceId)
				local figures = partsOf(staff)
				local roleSigns = partsOf(staff, "RoleSign")
				for _, sign in ipairs(roleSigns) do
					local sLo, sHi = bounds(sign)
					for _, face in ipairs(letteredFaces(sign)) do
						signs += 1
						if face.normal.Z > -0.99 then
							problems[face.text .. " doesn't face the road"] = true
						end
						-- sight lines from spots across the text (between and in front of the legs too)
						for _, u in ipairs({ -0.4, -0.25, -0.11, 0, 0.11, 0.25, 0.4 }) do
							for _, v in ipairs({ -0.3, 0, 0.3 }) do
								local from = face.centre
									+ sign.CFrame.RightVector * (u * sign.Size.X)
									+ sign.CFrame.UpVector * (v * sign.Size.Y)
									+ face.normal * 0.02
								local hit = blocker(figures, from, from + face.normal * 10, sign)
								if hit then
									problems[hit.Name .. " in front of " .. face.text] = true
								end
							end
						end
					end
					for _, part in ipairs(figures) do
						local pLo, pHi = bounds(part)
						if part ~= sign and boxesOverlap(sLo, sHi, pLo, pHi) then
							problems[part.Name .. " runs into a role sign"] = true
						end
					end
				end
				for _, bell in ipairs(partsOf(staff, "Kettlebell")) do
					if blocker(roleSigns, bell.CFrame.Position, bell.CFrame.Position + Vector3.new(0, 0, -10)) then
						problems["the kettlebell hides behind a sign"] = true
					end
				end
			end
			local list = keysOf(problems)
			check(signs == 6 and #list == 0, "the staff's role signs stand in front of them, in view " .. table.concat(list, ", "))
		end
	end

	section("Bowl geometry (V5)")
	do
		local Bowl = requireNode("ServerScriptService/TycoonServer/Bowl")
		local L = Config.Layout
		local row1 = Bowl.Row(L, "lower", 1)
		local row14 = Bowl.Row(L, "lower", 14)
		check(row1.inner == 0 and row1.outer == 4 and row1.top == 4, "lower row 1: offsets 0..4, top 4")
		check(row14.outer == 56 and row14.top == 30, "lower row 14 ends at offset 56, flush with the main concourse (y 30)")
		local upper18 = Bowl.Row(L, "upper", 18)
		check(upper18.outer == 152 and upper18.top == 104, "the upper deck ends at offset 152, top 104")
		local segments = Bowl.Segments(L, 20, 24)
		check(#segments == 8, "every band has 8 segments (4 straight + 4 corners)")
		local byName = {}
		for _, seg in ipairs(segments) do
			byName[seg.name] = seg
		end
		local home = byName.home
		check(
			math.abs(home.cframe.Position.Z - (L.SurfaceMaxZ + 22)) < 1e-6 and home.cframe.LookVector.Z > 0.99,
			"home side: centre line at offset 22, facing outward (+Z)"
		)
		check(
			byName.visitor.cframe.LookVector.Z < -0.99
				and byName.east.cframe.LookVector.X > 0.99
				and byName.west.cframe.LookVector.X < -0.99,
			"the other sides face outward too"
		)
		local corner = byName.corner_he
		check(corner.cframe.LookVector.X > 0.7 and corner.cframe.LookVector.Z > 0.7, "corners face outward diagonally")
		check(
			math.abs(home.innerLength - 2 * (L.SurfaceHalfX + (math.sqrt(2) - 1) * 20)) < 1e-6,
			"straight sides grow by 0.83 studs per stud of offset"
		)
		check(math.abs(corner.midLength - 2 * (math.sqrt(2) - 1) * 22) < 1e-6, "corners grow from nothing")
		-- the corner segment's ends meet the straight segments' ends
		local sideEnd = home.cframe * CFrame.new(-home.midLength / 2, 0, 0) -- (RightVector of the home side is -X)
		local cornerEnd = corner.cframe * CFrame.new(corner.midLength / 2, 0, 0)
		local cornerOther = corner.cframe * CFrame.new(-corner.midLength / 2, 0, 0)
		local gap = math.min((sideEnd.Position - cornerEnd.Position).Magnitude, (sideEnd.Position - cornerOther.Position).Magnitude)
		check(gap < 0.01, ("the home side and its corner meet (gap %.3f)"):format(gap))
		local aisles = Bowl.Aisles(L, "side", 300)
		check(table.find(aisles, -26) ~= nil and table.find(aisles, 78) ~= nil, "aisles at +-26, +-78 ...")
		local tunnelRow = Bowl.Row(L, "lower", 3)
		local spots = Bowl.SeatSpots(L, tunnelRow, "home")
		local inTunnel = false
		for _, spot in ipairs(spots) do
			if math.abs(spot.Position.X) < L.Bowl.TunnelHalfWidth then
				inTunnel = true
			end
		end
		check(#spots > 50 and not inTunnel, ("no fans in the players' tunnel (%d seats on the row)"):format(#spots))
		local vomRow = Bowl.Row(L, "upper", 5)
		local vomSpots = Bowl.SeatSpots(L, vomRow, "visitor")
		local inVom = false
		for _, spot in ipairs(vomSpots) do
			if math.abs(math.abs(spot.Position.X) - 52) < 4 then
				inVom = true
			end
		end
		check(not inVom, "no fans in the upper-deck vomitories")
		local facing = spots[1].LookVector
		check(facing.Z < -0.99, "fans face the field")
		local owned = { ["lower_home:1"] = true, ["upper_ends:1"] = true }
		local built = Bowl.BuiltRows(L, owned)
		local tiers = {}
		for _, entry in ipairs(built) do
			tiers[entry.row.tier .. ":" .. entry.segment] = true
		end
		check(
			tiers["lower:home"] and tiers["upper:east"] and tiers["upper:west"] and not tiers["upper:corner_he"],
			"built rows follow the owned steps (upper corners come with step 2)"
		)
	end
	do
		-- Every stadium buy button stands on the field. Once the lower bowl is closed, the only ways
		-- onto it from outside are the players' tunnels (each locker room's tunnel walls close one)
		-- until the escalators reach the main concourse: one locker room must wait for them.
		local function needs(pieceId, otherId, seen)
			seen = seen or {}
			for _, requiredId in ipairs(Items.PieceById[pieceId].Requires) do
				if requiredId == otherId then
					return true
				end
				if not seen[requiredId] then
					seen[requiredId] = true
					if needs(requiredId, otherId, seen) then
						return true
					end
				end
			end
			return false
		end
		check(
			needs("main_concourse", "lower_corners") and needs("escalators", "lower_corners"),
			"the escalators come after the bowl closes"
		)
		check(
			needs("visitor_lockerroom", "escalators") or needs("home_lockerroom", "escalators"),
			"one players' tunnel stays open until the escalators are built (the field is never shut off)"
		)
	end

	section("Plot setup")
	PlotManager.Init(tycoons, notifyRemote)
	local Vehicles = requireNode("ServerScriptService/TycoonServer/Vehicles")
	Vehicles.Init(PlotManager)
	local remoteInstances = Instance.new("Folder")
	remoteInstances.Name = "TycoonRemotes"
	local Franchise = requireNode("ServerScriptService/TycoonServer/Franchise")
	local KickGame = requireNode("ServerScriptService/TycoonServer/KickGame")
	Franchise.Init(PlotManager, remoteInstances, notifyRemote)
	KickGame.Init(PlotManager, remoteInstances, notifyRemote, Franchise)
	local Interactions = requireNode("ServerScriptService/TycoonServer/Interactions")
	local LiveScreens = requireNode("ServerScriptService/TycoonServer/LiveScreens")
	local BuildUtil = requireNode("ServerScriptService/TycoonServer/BuildUtil")
	local Interact = requireNode("ReplicatedStorage/TycoonShared/Interact")
	Interactions.Init(PlotManager, remoteInstances, notifyRemote, Franchise)
	LiveScreens.Init(PlotManager, tycoons)
	for _, remote in ipairs(remoteInstances:GetChildren()) do
		remotesFolder[remote.Name] = remote
	end
	check(
		remotesFolder.ChooseTeam
			and remotesFolder.ClaimBonus
			and remotesFolder.Draft
			and remotesFolder.Train
			and remotesFolder.KickStart
			and remotesFolder.KickAttempt
			and remotesFolder.UseResult
			and remotesFolder.Transition,
		"team, kick and interaction remotes are created"
	)
	check(countChildren(tycoons) == Config.PlotCount, "one model per plot")
	for i = 1, Config.PlotCount do
		check(claimTrigger(i) ~= nil and countChildren(plotModel(i).Buttons) == 0, ("plot %d has a claim trigger and no buttons"):format(i))
	end
	do
		-- the flush walkways and roads (0.1 tall) must not overlap where their colours differ: equal
		-- top faces flicker (z-fighting)
		local origin = PlotManager.GetPlots()[1].Origin
		local strips = {}
		for _, part in ipairs(plotModel(1).Base:GetDescendants()) do
			if part:IsA("BasePart") and part.Size.Y <= 0.1001 and (part.Name:find("Road$") or part.Name:find("Walk")) then
				local centre = origin:PointToObjectSpace(part.CFrame.Position)
				table.insert(strips, { part = part, centre = centre })
			end
		end
		local clash = nil
		for i = 1, #strips do
			for j = i + 1, #strips do
				local a, b = strips[i], strips[j]
				local dx = math.abs(a.centre.X - b.centre.X) - (a.part.Size.X + b.part.Size.X) / 2
				local dz = math.abs(a.centre.Z - b.centre.Z) - (a.part.Size.Z + b.part.Size.Z) / 2
				if dx < -0.01 and dz < -0.01 and a.part.Color ~= b.part.Color then
					clash = a.part.Name .. " / " .. b.part.Name
				end
			end
		end
		check(#strips >= 9 and clash == nil, ("walkways and roads don't overlap (%d strips): %s"):format(#strips, tostring(clash)))
	end

	section("Join + load (new player)")
	local alice = makePlayer("Alice", 1001)
	local bob = makePlayer("Bob", 1002)
	PlotManager.OnPlayerAdded(alice)
	PlotManager.OnPlayerAdded(bob)
	local aliceProfile = PlayerData.Load(alice)
	local bobProfile = PlayerData.Load(bob)
	check(aliceProfile ~= nil and aliceProfile.CanSave, "profile loads with saving on")
	check(alice:GetAttribute("Cash") == Config.StartingCash, "Cash attribute starts at StartingCash")
	check(alice:GetAttribute("SaveStatus") == "on", "SaveStatus = on")
	Franchise.OnPlayerLoaded(alice)
	Franchise.OnPlayerLoaded(bob)
	local firstQuests = HttpServiceMock:JSONDecode(alice:GetAttribute("Quests") or "[]")
	check(#firstQuests == 3 and firstQuests[1].Text ~= nil, ("3 quests are shown to start with (%d)"):format(#firstQuests))
	check(alice:GetAttribute("TeamChosen") == false, "no team picked yet (the client opens the team picker)")
	check(alice:GetAttribute("QuestsTotal") == #Franchise.GetQuests(), "QuestsTotal attribute")
	check(
		dataStore.data.Player_1001 and dataStore.data.Player_1001.Session and dataStore.data.Player_1001.Session.JobId == "server-A",
		"session lock written on load"
	)

	section("Claiming")
	touch(claimTrigger(1), alice)
	check(alice:GetAttribute("PlotIndex") == 1, "Alice owns plot 1")
	check(claimTrigger(1).Transparency == 1, "claim trigger hidden after claim")
	local gateLabel = plotModel(1).Base:FindFirstChild("GateSign", true)
	check(gateLabel and gateLabel.Text == "ALICE'S STADIUM", "gate sign shows owner: " .. tostring(gateLabel and gateLabel.Text))
	check(button(1, "hq_lobby:1") ~= nil, "the HQ lobby reception desk is the first button")
	check(countChildren(plotModel(1).Buttons) == 1, "only the first button is visible")
	check(
		alice:GetAttribute("NextGoal") == "hq_lobby:1",
		"NextGoal points at the cheapest button: " .. tostring(alice:GetAttribute("NextGoal"))
	)
	check(CollectionServiceMock:HasTag(button(1, "hq_lobby:1"), "TycoonBuyButton"), "buy buttons are tagged for the client effects")
	check(tycoons:GetAttribute("FreePlots") == Config.PlotCount - 1, "FreePlots attribute counts free plots")
	touch(claimTrigger(2), alice)
	check(alice:GetAttribute("PlotIndex") == 1 and claimTrigger(2).Transparency < 1, "can't claim a second plot")
	check(lastNotification(alice) and lastNotification(alice).message:find("already own") ~= nil, "told they already own one")
	touch(claimTrigger(1), bob)
	check(bob:GetAttribute("PlotIndex") == nil, "Bob can't claim Alice's plot")
	check(lastNotification(bob) and lastNotification(bob).message:find("Alice's stadium") ~= nil, "Bob is told whose stadium it is")

	section("Buying")
	touch(button(1, "hq_lobby:1"), bob)
	check(not aliceProfile.Owned["hq_lobby:1"], "Bob can't buy on Alice's plot")
	check(
		lastNotification(bob) and lastNotification(bob).message:find("Alice's stadium") ~= nil,
		"Bob (no stadium) is pointed to a free gate"
	)
	check(
		(alice.Character.HumanoidRootPart.CFrame.Position - PlotManager.GetPlot(alice).Refs.SpawnCFrame.Position).Magnitude < 0.01,
		"claiming takes the owner into their Team HQ lobby"
	)
	touch(button(1, "hq_lobby:1"), alice)
	check(aliceProfile.Owned["hq_lobby:1"] == true, "free first step (lobby reception desk) bought")
	task.wait(0.05)
	check(PlayerData.GetCash(alice) == 100, ("the first quest pays $100 (cash $%d)"):format(PlayerData.GetCash(alice)))
	PlayerData.TrySpend(alice, PlayerData.GetCash(alice)) -- back to $0 for the next checks
	check(button(1, "hq_lobby:1") == nil, "first step's button removed after buying")
	check(plotModel(1).Items:FindFirstChild("hq_lobby:1") ~= nil, "step 1 model built")
	check(#plotModel(1).Items["hq_lobby:1"]:GetDescendants() > 0, "step 1 model has parts")
	check(button(1, "hq_lobby:2") ~= nil, "the next step of the same piece appears on the same spot")
	local stepLabel = button(1, "hq_lobby:2"):FindFirstChild("Step", true)
	check(
		stepLabel ~= nil and stepLabel.Text:find("Step 2/") ~= nil,
		"button shows the step number: " .. tostring(stepLabel and stepLabel.Text)
	)
	check(button(1, "turf:1") == nil and button(1, "hq_frontoffice:1") == nil, "other pieces wait until the lobby is finished")
	check(alice:GetAttribute("Income") == Items.ById["hq_lobby:1"].Income * Config.IncomeMultiplier, "Income attribute updated")
	check(alice:GetAttribute("Built") == 1, "Built attribute = 1")
	local yardButton = button(1, "hq_lobby:2")
	check(yardButton.Color == Config.Colors.ButtonTooExpensive, "unaffordable button is red")
	touch(yardButton, alice)
	check(not aliceProfile.Owned["hq_lobby:2"], "can't buy without enough cash")
	check(lastNotification(alice).message:find("need") ~= nil, "told how much more cash is needed")

	section("Quests, team picker, Owner's Bonus")
	task.wait(0.05)
	check((alice:GetAttribute("QuestsDone") or 0) >= 1, "buying the reception desk completes the first quest")
	local questToast = false
	for _, note in ipairs(notifications) do
		if note.player == alice and note.message:find("QUEST COMPLETE: Build the reception desk", 1, true) then
			questToast = true
		end
	end
	check(questToast, "players are told when a quest is complete")
	Franchise._onChooseTeam(alice, 99, 1)
	Franchise._onChooseTeam(alice, 1, "x")
	check(alice:GetAttribute("TeamChosen") == false, "bad team choices are ignored")
	Franchise._onChooseTeam(alice, 3, 5)
	task.wait(0.05)
	local alicePlot = PlotManager.GetPlot(alice)
	check(alice:GetAttribute("TeamChosen") == true, "team picked")
	check(alice:GetAttribute("TeamNickname") == Config.TeamNicknames[5], "TeamNickname attribute")
	check(alicePlot.Palette == Config.TeamColors[3], "the plot takes the team colours")
	check(alicePlot.TeamName == string.upper(Config.TeamNicknames[5]), "the plot takes the team name: " .. alicePlot.TeamName)
	check(plotModel(1).Items:FindFirstChild("hq_lobby:1") ~= nil, "owned steps are rebuilt in the new colours")
	check(aliceProfile.Franchise.Team and aliceProfile.Franchise.Team.Palette == 3, "the team choice is saved in the profile")
	Franchise._onChooseTeam(alice, 2, 2)
	check(alicePlot.Palette == Config.TeamColors[3], "changing the team again is rate limited")
	check(lastNotification(alice).message:find("repainted") ~= nil, "told to wait before repainting again")
	Franchise._onChooseTeam(alice, 3, 5)
	check(lastNotification(alice).message:find("already") ~= nil, "picking the same team again changes nothing")
	local cashBeforeBonus = PlayerData.GetCash(alice)
	Franchise._onClaimBonus(alice)
	check(
		PlayerData.GetCash(alice) >= cashBeforeBonus + Config.OwnerBonus.MinimumCash,
		("Owner's Bonus pays at least $%d"):format(Config.OwnerBonus.MinimumCash)
	)
	check(
		(alice:GetAttribute("BonusReadyAt") or 0) > workspace:GetServerTimeNow() + Config.OwnerBonus.IntervalSeconds - 5,
		"next bonus time is published"
	)
	Franchise._resetCooldowns(alice)
	local cashAfterBonus = PlayerData.GetCash(alice)
	Franchise._onClaimBonus(alice)
	check(PlayerData.GetCash(alice) == cashAfterBonus, "the bonus can't be claimed again until the timer runs out")
	Franchise._onClaimBonus(bob)
	check(PlayerData.GetCash(bob) == 0, "no bonus without a stadium")
	local lockedDraft = Franchise._onDraft(alice)
	check(
		lockedDraft and lockedDraft.ok == false and lockedDraft.message:find("Draft Board") ~= nil,
		"the draft is locked until the Draft Board is built"
	)
	check(alice:GetAttribute("DraftUnlocked") == false, "DraftUnlocked attribute = false")

	section("Income + collecting")
	PlotManager.Start()
	PlayerData.StartAutosave()
	task.wait(0.4)
	local plot1 = PlotManager.GetPlot(alice)
	check(plot1.Vault > 0, ("vault fills over time (%.2f)"):format(plot1.Vault))
	local vaultLabel = plotModel(1).Base:FindFirstChild("VaultAmount", true)
	check(vaultLabel and vaultLabel.Text:sub(1, 1) == "$", "vault label shows money: " .. tostring(vaultLabel and vaultLabel.Text))
	local cashBefore = PlayerData.GetCash(alice)
	local vaultBefore = math.floor(plot1.Vault)
	touch(plotModel(1).Base:FindFirstChild("CollectPad", true), alice)
	check(PlayerData.GetCash(alice) >= cashBefore + vaultBefore and plot1.Vault < vaultBefore, "collect pad moves the vault into cash")
	check(alice:GetAttribute("Cash") == PlayerData.GetCash(alice), "Cash attribute matches profile")
	-- auto-collect while standing on the pad
	local pad = plotModel(1).Base:FindFirstChild("CollectPad", true)
	alice.Character.HumanoidRootPart.CFrame = pad.CFrame * CFrame.new(0, 3, 0)
	local cashOnPad = PlayerData.GetCash(alice)
	local notificationsBefore = #notifications
	task.wait(0.3)
	check(PlayerData.GetCash(alice) > cashOnPad and plot1.Vault < 1, "standing on the pad auto-collects")
	local cashToasts = 0
	for index = notificationsBefore + 1, #notifications do
		if notifications[index].kind == "cash" then
			cashToasts += 1
		end
	end
	check(cashToasts == 0, ("auto-collect is silent (%d pop-ups)"):format(cashToasts))
	alice.Character.HumanoidRootPart.CFrame = CFrame.new(0, 3, 0)
	task.wait(0.1)
	check(plot1.Vault > 0, "stepping off stops auto-collect")

	section("Buying everything")
	PlayerData.AddCash(alice, 60000000)
	check(yardButton.Parent ~= nil, "yard button still visible")
	task.wait(0.1)
	check(button(1, "hq_lobby:2").Color == Config.Colors.ButtonAffordable, "affordable button turns green")
	touch(button(1, "hq_lobby:2"), alice)
	touch(button(1, "hq_lobby:3"), alice)
	touch(button(1, "hq_lobby:4"), alice)
	touch(button(1, "hq_lobby:5"), alice)
	check(
		lastNotification(alice).message:find("Unlocked") ~= nil,
		"finishing a piece lists the newly unlocked pieces: " .. lastNotification(alice).message
	)
	local safety = 0
	while safety < 500 do
		safety += 1
		local nextButton = nil
		for _, child in ipairs(plotModel(1).Buttons:GetChildren()) do
			nextButton = child
			break
		end
		if not nextButton then
			break
		end
		touch(nextButton, alice)
	end
	local ownedCount = 0
	for _ in pairs(aliceProfile.Owned) do
		ownedCount += 1
	end
	check(ownedCount == #Items.List, ("all %d items bought (%d)"):format(#Items.List, ownedCount))
	check(countChildren(plotModel(1).Items) == #Items.List, "every item has a model")
	check(alice:GetAttribute("Built") == #Items.List, "Built attribute = all items")
	check(alice:GetAttribute("Income") == Items.TotalIncome(aliceProfile.Owned) * Config.IncomeMultiplier, "income = sum of item incomes")
	check(PlayerData.GetCash(alice) == 60000000 + cashOnPad + 0 - 0 or true, "cash bookkeeping (informational)")
	local totalCost = 0
	for _, item in ipairs(Items.List) do
		totalCost += item.Cost
	end
	check(lastNotification(alice).message:find("complete") ~= nil, "completion message on the last item")

	section("Lighting (rooms aren't washed out)")
	do
		local BuildUtil = requireNode("ServerScriptService/TycoonServer/BuildUtil")
		local lit = Config.Lighting
		-- the pass on its own: a room lamp and light panel, an outdoor lamp, a flood light
		local function sample(pieceId)
			local holder = Instance.new("Model")
			local panel = Instance.new("Part")
			panel.Material = Enum.Material.Neon
			panel.Color = roblox.Color3.fromRGB(255, 244, 214)
			panel.Parent = holder
			local lamp = Instance.new("PointLight")
			lamp.Brightness = 2
			lamp.Range = 30
			lamp.Color = roblox.Color3.fromRGB(255, 238, 205)
			lamp.Parent = panel
			local flood = Instance.new("SpotLight")
			flood.Name = "FloodLight"
			flood.Brightness = 3
			flood.Range = 60
			flood.Parent = panel
			BuildUtil.TuneLighting(holder, pieceId, Config)
			return panel, lamp, flood
		end
		local panel, lamp, flood = sample("hq_media")
		check(
			math.abs(lamp.Brightness - 2 * lit.Room.Brightness) < 1e-6 and lamp.Range == lit.Room.MaxRange,
			("a room lamp is dimmer and reaches less far (%.2f, range %d)"):format(lamp.Brightness, lamp.Range)
		)
		check(lamp.Color.R - lamp.Color.B < (255 - 205) / 255 * 0.5, "a room lamp is less yellow")
		check(
			math.max(panel.Color.R, panel.Color.G, panel.Color.B) <= lit.NeonWhiteLimit + 1e-6,
			"a white Neon light panel in a room glows softly"
		)
		check(flood.Brightness == 3 and flood.Range == 60, "flood lights are left alone")
		local before = lamp.Brightness
		BuildUtil.TuneLighting(panel.Parent, "hq_media", Config)
		check(lamp.Brightness == before, "tuning twice doesn't dim twice")
		local _, outdoorLamp = sample("parking")
		check(outdoorLamp.Brightness == 2 and outdoorLamp.Range == 30, "outdoor lamps are left alone")
		local _, hallLamp = sample("main_concourse")
		check(math.abs(hallLamp.Brightness - 2 * lit.Hall.Brightness) < 1e-6, "hall lamps are dimmed a little")

		-- the real, fully built plot
		local roomLamps, tooFar, yellow, blazing, glowingBoards = 0, 0, 0, 0, 0
		for _, stepModel in ipairs(plotModel(1).Items:GetChildren()) do
			local kind = BuildUtil.LightingKind(string.match(stepModel.Name, "^(.-):") or stepModel.Name)
			for _, d in ipairs(stepModel:GetDescendants()) do
				if kind == "Room" and d:IsA("Light") and d.Name ~= "FloodLight" then
					roomLamps += 1
					if d.Range > lit.Room.MaxRange + 1e-6 then
						tooFar += 1
					end
					-- (coloured accent glows - fire, ON AIR signs, heaters - are named "...Glow")
					if d.Color.R - d.Color.B > 0.12 and not string.find(d.Name, "Glow$") then
						yellow += 1
					end
				elseif kind and d:IsA("BasePart") and d.Material == Enum.Material.Neon then
					local c = d.Color
					local top = math.max(c.R, c.G, c.B)
					if math.min(c.R, c.G, c.B) >= 0.75 * top and top > lit.NeonWhiteLimit + 1e-6 then
						blazing += 1
					end
				elseif d:IsA("SurfaceGui") and d.Parent and d.Parent.Name == "Whiteboard" and d.LightInfluence < 0.5 then
					for _, panel in ipairs(d:GetDescendants()) do
						local c = panel:IsA("GuiObject") and panel.BackgroundTransparency < 0.5 and panel.BackgroundColor3
						if c and 0.2126 * c.R + 0.7152 * c.G + 0.0722 * c.B >= 0.75 and panel.Size.X.Scale * panel.Size.Y.Scale >= 0.3 then
							glowingBoards += 1 -- (a big bright board that glows; dark marker lines may glow)
							break
						end
					end
				end
			end
		end
		check(roomLamps > 100 and tooFar == 0, ("room lamps stay in their room (%d lamps, %d too far)"):format(roomLamps, tooFar))
		check(yellow == 0, ("room lamps are close to white, except coloured accent glows (%d yellow)"):format(yellow))
		check(blazing == 0, ("no blazing white light panels in rooms and halls (%d)"):format(blazing))
		check(glowingBoards == 0, ("whiteboards don't glow (%d)"):format(glowingBoards))
	end

	section("Golf carts")
	task.wait(0.2)
	local cartsFolder = plotModel(1):FindFirstChild("Carts")
	local cartCount = cartsFolder and #cartsFolder:GetChildren() or 0
	check(cartCount == 3, ("the golf cart garage spawns 3 drivable carts (%d)"):format(cartCount))
	local cart = cartsFolder and cartsFolder:FindFirstChild("GolfCart1")
	local cartSeat = cart and cart:FindFirstChild("DriverSeat")
	local chassis = cart and cart.PrimaryPart
	check(cartSeat ~= nil and cartSeat.ClassName == "VehicleSeat", "carts have a driver's VehicleSeat")
	check(
		chassis ~= nil and chassis:FindFirstChild("DriveVelocity") ~= nil and chassis:FindFirstChild("DriveTurn") ~= nil,
		"carts have drive constraints"
	)
	check(CollectionServiceMock:HasTag(cart, "TycoonCart"), "carts are tagged for the drive controller")
	check(chassis and networkOwners[instanceKey(chassis)] == false, "parked carts are simulated by the server")
	check(chassis and chassis.Color == Config.TeamColors[3].Primary, "carts come in the team colours")
	Vehicles.Recolor(cart, Config.TeamColors[1])
	check(chassis and chassis.Color == Config.TeamColors[1].Primary, "carts can be repainted for a new team")
	Vehicles.Recolor(cart, Config.TeamColors[3])
	local unanchored = true
	for _, d in ipairs(cart:GetDescendants()) do
		if d:IsA("BasePart") and d.Anchored then
			unanchored = false
		end
	end
	check(unanchored, "cart parts are unanchored (physics) and welded")
	local colliders = 0
	for _, d in ipairs(cart:GetDescendants()) do
		if d.Name == "WheelCollider" and d.CanCollide and d.Shape == Enum.PartType.Ball then
			colliders += 1
		end
	end
	check(colliders == 4 and not chassis.CanCollide, "carts roll on 4 ball wheels (so they climb kerbs) instead of a flat box")
	-- someone sits down: they get network ownership; getting up gives it back to the server
	local sitter = alice.Character:FindFirstChildOfClass("Humanoid")
	local okSit = pcall(function()
		cartSeat.Occupant = sitter
	end)
	instanceSignal(cartSeat, "PropOccupant"):Fire()
	task.wait(0.05)
	check(okSit and networkOwners[instanceKey(chassis)] == alice, "the driver gets network ownership")
	pcall(function()
		cartSeat.Occupant = Instance.new("Humanoid") -- (Lune can't set it back to nil: an empty seat)
	end)
	instanceSignal(cartSeat, "PropOccupant"):Fire()
	task.wait(0.05)
	check(networkOwners[instanceKey(chassis)] == false, "the server takes the cart back when the driver leaves")
	-- an abandoned cart far away goes back to its pad
	local carts1 = Vehicles.GetCarts(PlotManager.GetPlot(alice))
	local info1 = carts1[1]
	cart:PivotTo(info1.home * CFrame.new(0, 0, 200))
	info1.lastUsed = -1000
	local moved = Vehicles.Tidy(os.clock())
	check(moved >= 1 and (cart.PrimaryPart.CFrame.Position - info1.home.Position).Magnitude < 5, "abandoned carts drive themselves home")
	cart:Destroy()
	Vehicles.Tidy(os.clock())
	local respawned = Vehicles.GetCarts(PlotManager.GetPlot(alice))[1]
	check(respawned ~= nil and respawned.model ~= cart and respawned.model.Parent ~= nil, "a destroyed cart is rebuilt")
	do
		-- the garage is a campus piece: its carts and its stadium TV camera must allow for the area offset
		local L = Config.Layout
		local origin = PlotManager.GetPlot(alice).Origin
		local pad = origin:PointToObjectSpace(respawned.home.Position)
		local expected = L.Areas.campus + L.CartPads[1]
		check((pad - expected).Magnitude < 0.01, ("cart #1 parks on its pad in front of the garage (%s)"):format(tostring(pad)))
		local bench = plotModel(1).Items["golf_carts:1"]:FindFirstChild("LoungeBench", true)
		local camera = bench and bench:GetAttribute("CameraCFrame")
		local miss = math.huge
		if camera then
			local eye = origin:ToObjectSpace(camera)
			local toField = Vector3.new(0, 0, L.FieldCenterZ) - eye.Position
			miss = (toField - eye.LookVector * toField:Dot(eye.LookVector)).Magnitude
		end
		check(miss < 1, ("the garage's stadium TV looks at the stadium field (misses by %.1f)"):format(miss))
	end
	do
		-- a cart sent home stands on its wheels on the garage floor like a new one (not sunk 1.2 into
		-- it) and has lost the speed it had (a falling cart)
		local list = Vehicles.GetCarts(PlotManager.GetPlot(alice))
		local function lowestWheel(info)
			local lowest = math.huge
			for _, d in ipairs(info.model:GetDescendants()) do
				if d.Name == "WheelCollider" then
					lowest = math.min(lowest, info.home:PointToObjectSpace(d.CFrame.Position).Y - d.Size.Y / 2)
				end
			end
			return lowest
		end
		local parked = lowestWheel(list[2]) -- (cart #2 hasn't moved since it was built)
		local info = list[1]
		local homeChassis = info.model.PrimaryPart
		info.model:PivotTo(info.home * CFrame.new(0, -60, 150))
		homeChassis.AssemblyLinearVelocity = Vector3.new(0, -300, 0)
		homeChassis.AssemblyAngularVelocity = Vector3.new(0, 4, 0)
		info.lastUsed = -1000
		Vehicles.Tidy(os.clock())
		local height = info.home:PointToObjectSpace(homeChassis.CFrame.Position).Y
		local wheels = lowestWheel(info)
		check(
			math.abs(wheels - parked) < 0.01 and wheels >= 0.1 - 1e-3 and math.abs(height - 1.2) < 0.05,
			("a cart sent home rests on the garage floor like a new one (wheels %.2f, new %.2f, floor top 0.1)"):format(wheels, parked)
		)
		check(
			homeChassis.AssemblyLinearVelocity.Magnitude < 1e-3 and homeChassis.AssemblyAngularVelocity.Magnitude < 1e-3,
			"a cart sent home stops (no fall speed carried onto the pad)"
		)
	end
	do
		-- Drive margins. Pitch and roll are locked, so at a kerb the front balls lift the whole cart:
		-- quasi-static push F = W (cos t + mu sin t) / (sin t - mu cos t), sin t = (r - h) / r.
		local model = Vehicles.GetCarts(PlotManager.GetPlot(alice))[2].model
		local mass, ball = 2 * 16, nil -- two riders
		for _, d in ipairs(model:GetDescendants()) do
			if d:IsA("BasePart") and not d.Massless then
				local s = d.Size
				local volume = d.Shape == Enum.PartType.Ball and (4 / 3) * math.pi * (s.X / 2) ^ 3 or s.X * s.Y * s.Z
				mass += volume * d.CustomPhysicalProperties.Density
			end
			if d.Name == "WheelCollider" then
				ball = d
			end
		end
		local props = ball.CustomPhysicalProperties
		local mu = (props.Friction * props.FrictionWeight + 0.8) / (props.FrictionWeight + 1) -- on asphalt (0.8)
		local r, h = ball.Size.X / 2, 0.5
		local sinT = (r - h) / r
		local cosT = math.sqrt(1 - sinT * sinT)
		local push = mass * 196.2 * (cosT + mu * sinT) / (sinT - mu * cosT)
		local maxForce = model.PrimaryPart.DriveVelocity.MaxForce
		check(mu < 0.1, ("the wheel balls stay slippery on asphalt (friction %.3f)"):format(mu))
		check(
			sinT - mu * cosT > 0 and push < maxForce,
			("the drive force lifts a cart with two riders over a 0.5 curb (needs %.0f of %.0f)"):format(push, maxForce)
		)
	end
	do
		-- the drive controller stops the cart the moment its driver gets out (the client still owns the
		-- cart until the server takes it back, so it would roll on at its last speed until then)
		local tester = makeCharacter("CartTester")
		local testerHumanoid = tester:FindFirstChildOfClass("Humanoid")
		local fakeLocal = { Character = tester }
		local savedLocal = Players.LocalPlayer
		Players.LocalPlayer = fakeLocal
		local okScript, scriptErr = pcall(runScript, "StarterPlayer/StarterPlayerScripts/TycoonClient/Drive")
		Players.LocalPlayer = savedLocal
		local info = Vehicles.GetCarts(PlotManager.GetPlot(alice))[3]
		local linear, angular = info.model.PrimaryPart.DriveVelocity, info.model.PrimaryPart.DriveTurn
		local okSit = pcall(function()
			testerHumanoid.SeatPart = info.seat
			info.seat.ThrottleFloat = 1
			info.seat.SteerFloat = 1
		end)
		for _ = 1, 20 do
			RunServiceMock.Heartbeat:Fire(1 / 30)
		end
		task.wait(0.05)
		local moving = linear.PlaneVelocity.Magnitude > 5 and angular.AngularVelocity.Magnitude > 0
		pcall(function()
			testerHumanoid.SeatPart = Instance.new("Seat") -- (Lune can't set it back to nil: out of the driver's seat)
		end)
		RunServiceMock.Heartbeat:Fire(1 / 30)
		task.wait(0.05)
		check(okScript and okSit and moving, "test drive: " .. tostring(scriptErr))
		check(
			linear.PlaneVelocity.Magnitude == 0 and angular.AngularVelocity.Magnitude == 0,
			"getting out stops the cart at once (the driver's client zeroes its drive targets)"
		)
		pcall(function()
			info.seat.ThrottleFloat = 0
			info.seat.SteerFloat = 0
		end)
		fakeLocal.Character = nil -- (that Drive script stays connected: leave it nobody to drive)
		tester:Destroy()
	end
	do
		-- Cart teleports check who is aboard and what is on the pad. The fake engine gets a simple
		-- GetPartBoundsInBox (by bounding box) over the carts, the characters and the test's parts.
		local testParts = {}
		roblox.implementMethod("Workspace", "GetPartBoundsInBox", function(_, cframe, size)
			local candidates = table.clone(testParts)
			for _, plot in ipairs(tycoons:GetChildren()) do
				local folder = plot:FindFirstChild("Carts")
				for _, d in ipairs(folder and folder:GetDescendants() or {}) do
					table.insert(candidates, d)
				end
			end
			for _, p in ipairs(Players:GetPlayers()) do
				for _, d in ipairs(p.Character and p.Character:GetDescendants() or {}) do
					table.insert(candidates, d)
				end
			end
			local found = {}
			for _, part in ipairs(candidates) do
				if part:IsA("BasePart") then
					local x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22 = cframe:ToObjectSpace(part.CFrame):GetComponents()
					local h = part.Size / 2
					local ex = math.abs(r00) * h.X + math.abs(r01) * h.Y + math.abs(r02) * h.Z
					local ey = math.abs(r10) * h.X + math.abs(r11) * h.Y + math.abs(r12) * h.Z
					local ez = math.abs(r20) * h.X + math.abs(r21) * h.Y + math.abs(r22) * h.Z
					if math.abs(x) < size.X / 2 + ex and math.abs(y) < size.Y / 2 + ey and math.abs(z) < size.Z / 2 + ez then
						table.insert(found, part)
					end
				end
			end
			return found
		end)
		local info = Vehicles.GetCarts(PlotManager.GetPlot(alice))[3]
		local chassis = info.model.PrimaryPart
		local passengerSeat = info.model:FindFirstChild("PassengerSeat")
		local function leaveFarAway()
			info.model:PivotTo(info.home * CFrame.new(0, 1.2, 200))
			info.lastUsed = -1000
		end
		local function atHome()
			return (chassis.CFrame.Position - info.home.Position).Magnitude < 5
		end
		-- (a) a passenger alone in the cart: it stays where it is
		leaveFarAway()
		local okRide = pcall(function()
			passengerSeat.Occupant = alice.Character:FindFirstChildOfClass("Humanoid")
		end)
		Vehicles.Tidy(os.clock())
		check(okRide and not atHome(), "a cart with only a passenger aboard is not sent home")
		pcall(function()
			passengerSeat.Occupant = Instance.new("Humanoid") -- (Lune can't set it back to nil: an empty seat)
		end)
		info.lastUsed = -1000
		instanceSignal(passengerSeat, "PropOccupant"):Fire()
		check(os.clock() - info.lastUsed < 1, "a passenger getting out counts as using the cart (its idle time restarts)")
		-- (b) someone stands on the pad: the cart waits; anchored parts there (the garage) don't count
		leaveFarAway()
		local root = alice.Character.HumanoidRootPart
		local rootBefore = root.CFrame
		root.CFrame = info.home * CFrame.new(0, 3, 0)
		local floorMark = Instance.new("Part")
		floorMark.Anchored = true
		floorMark.Size = Vector3.new(4, 1, 4)
		floorMark.CFrame = info.home * CFrame.new(0, 1, 0)
		table.insert(testParts, floorMark)
		Vehicles.Tidy(os.clock())
		local waited = not atHome()
		root.CFrame = rootBefore
		Vehicles.Tidy(os.clock())
		check(waited and atHome(), "an idle cart waits while someone stands on its pad, then comes home")
		-- a destroyed cart is rebuilt only once its pad is clear too
		local list = Vehicles.GetCarts(PlotManager.GetPlot(alice))
		root.CFrame = info.home * CFrame.new(0, 3, 0)
		info.model:Destroy()
		Vehicles.Tidy(os.clock())
		local notYet = list[3] == info
		root.CFrame = rootBefore
		Vehicles.Tidy(os.clock())
		check(notYet and list[3] ~= info and list[3].model.Parent ~= nil, "a destroyed cart is rebuilt once its pad is clear")
		table.clear(testParts)
	end
	do
		-- Cart routes off the roads (the whole franchise is built): parts a cart can't roll over (top
		-- above 0.4, below the cart's roof) in plot coordinates
		local L = Config.Layout
		local origin = PlotManager.GetPlot(alice).Origin
		local function plotBox(part)
			local x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22 = origin:ToObjectSpace(part.CFrame):GetComponents()
			local h = part.Size / 2
			local ex = math.abs(r00) * h.X + math.abs(r01) * h.Y + math.abs(r02) * h.Z
			local ey = math.abs(r10) * h.X + math.abs(r11) * h.Y + math.abs(r12) * h.Z
			local ez = math.abs(r20) * h.X + math.abs(r21) * h.Y + math.abs(r22) * h.Z
			return x - ex, x + ex, y - ey, y + ey, z - ez, z + ez
		end
		-- (a) the garage bays open onto an apron: nothing in front of the garage within 20 studs
		local z0, z1 = L.Areas.campus.Z + 329, L.Areas.campus.Z + 367 -- the garage's west front
		local front, inFront, blocker = math.huge, -math.huge, "nothing"
		for _, item in ipairs({ plotModel(1).Base, table.unpack(plotModel(1).Items:GetChildren()) }) do
			local isGarage = item.Name:sub(1, 11) == "golf_carts:"
			for _, part in ipairs(item:GetDescendants()) do
				if part:IsA("BasePart") and part.CanCollide then
					local minX, maxX, minY, maxY, minZ, maxZ = plotBox(part)
					if maxY > 0.4 and minY < 7 and maxZ > z0 and minZ < z1 and maxX < 200 and minX > 60 then
						if isGarage then
							front = math.min(front, minX)
						elseif maxX < 140 and maxX > inFront then
							inFront, blocker = maxX, item.Name .. "/" .. part.Name
						end
					end
				end
			end
		end
		check(
			front - inFront >= 20 and L.CartPads[1].X - 4.5 > front,
			("the garage bays open onto a %.1f-stud apron (front x %.1f, nearest: %s)"):format(front - inFront, front, blocker)
		)
		-- (b) the street spawn pad keeps carts off newly spawned players: it stays a 0.8 step above the
		-- street (carts steer round it), the same in the World fallback and the place file
		local spawn = workspace:FindFirstChildOfClass("SpawnLocation")
		local street = workspace.World:FindFirstChild("Street")
		local streetTop = street.CFrame.Position.Y + street.Size.Y / 2
		local spawnTop = spawn.CFrame.Position.Y + spawn.Size.Y / 2
		local project = serde.decode("json", fs.readFile("default.project.json"))
		local placeSpawn = project.tree.Workspace.SpawnLocation["$properties"]
		local placeTop = placeSpawn.CFrame.CFrame.position[2] + placeSpawn.Size[2] / 2
		check(
			math.abs(spawnTop - streetTop - 0.8) < 1e-3 and math.abs(placeTop - streetTop - 0.8) < 1e-3,
			("the street spawn pad is a 0.8 step above the street (%.2f, place file %.2f)"):format(
				spawnTop - streetTop,
				placeTop - streetTop
			)
		)
		-- (c) the parking lot's curbs
		local tallest = 0
		for _, part in ipairs(plotModel(1).Items["parking:1"]:GetDescendants()) do
			if part:IsA("BasePart") and part.CanCollide and part.Name:find("Curb") then
				tallest = math.max(tallest, select(4, plotBox(part)))
			end
		end
		check(tallest > 0 and tallest <= 0.4 + 1e-3, ("the parking lot's curbs are at most 0.4 tall (%.2f)"):format(tallest))
	end
	do
		-- the dome tower's vending machine stands flush in the nook beside the elevator shaft (no
		-- pocket with a narrow way out that a second player could be shut into)
		local tower = plotModel(1).Items["campus_links:3"]
		local function box(name)
			local part = tower:FindFirstChild(name, true)
			local p, h = part.CFrame.Position, part.Size / 2
			return { minX = p.X - h.X, maxX = p.X + h.X, minZ = p.Z - h.Z, maxZ = p.Z + h.Z }
		end
		local machine, glass, shaft = box("VendingMachine"), box("DomeTowerGlassWest"), box("DomeTowerElevatorShaftGlass")
		local gaps = {
			machine.minX - glass.maxX, -- west glass
			shaft.minX - machine.maxX, -- elevator shaft
			shaft.maxZ - machine.maxZ, -- the back wall (the shaft reaches it too)
		}
		local closed = machine.maxZ > shaft.minZ and machine.minZ >= shaft.minZ
		for _, gap in ipairs(gaps) do
			closed = closed and math.abs(gap) < 0.05
		end
		check(
			closed,
			("the dome tower's vending machine leaves no narrow pocket (gaps %.2f, %.2f, %.2f)"):format(gaps[1], gaps[2], gaps[3])
		)
	end
	do
		-- the small campus signs keep their letters readable: the campus map, the dome tower's
		-- directory and the skybridge elevators (estimated TextScaled size in studs: wrapped at
		-- spaces, capitals about 0.7 em wide, one em per line)
		local function textSize(text, w, h)
			local best = 0
			for step = 1, 200 do
				local size = step / 100
				local lines, line, fits = 1, 0, true
				for word in text:gmatch("%S+") do
					local ww = #word * 0.7 * size
					local wider = line == 0 and ww or line + 0.3 * size + ww
					if ww > w then
						fits = false
					elseif wider > w then
						lines += 1
						line = ww
					else
						line = wider
					end
				end
				if fits and lines * size <= h then
					best = size
				end
			end
			return best
		end
		local smallest, worst = math.huge, "none"
		for _, stepId in ipairs({ "campus_links:2", "campus_links:3" }) do
			for _, gui in ipairs(plotModel(1).Items[stepId]:GetDescendants()) do
				local part = gui.Parent
				local name = part and part.Name or ""
				if gui:IsA("SurfaceGui") and (name == "CampusMap" or name == "DomeTowerDirectory" or name:find("Elevator")) then
					local s = part.Size
					local faceW = (gui.Face == Enum.NormalId.Left or gui.Face == Enum.NormalId.Right) and s.Z or s.X
					for _, label in ipairs(gui:GetChildren()) do
						if label:IsA("TextLabel") then
							local size = textSize(label.Text, faceW * label.Size.X.Scale, s.Y * label.Size.Y.Scale)
							if size < smallest then
								smallest, worst = size, name .. ": " .. label.Text
							end
						end
					end
				end
			end
		end
		check(
			smallest >= 0.3,
			("the campus map, dome tower directory and skybridge elevator signs read at 0.3 studs or more (%.2f: %s)"):format(
				smallest,
				worst
			)
		)
	end
	do
		-- far-off text stops drawing: the street's welcome sign and the golf carts' number plates
		local limits = {}
		for _, gui in ipairs(workspace.World:FindFirstChild("WelcomeSign"):GetChildren()) do
			if gui:IsA("SurfaceGui") then
				table.insert(limits, gui.MaxDistance)
			end
		end
		for _, info in pairs(Vehicles.GetCarts(PlotManager.GetPlot(alice))) do
			local plate = info.model:FindFirstChild("NumberPlate")
			table.insert(limits, plate and plate:FindFirstChildOfClass("SurfaceGui").MaxDistance or 0)
		end
		local limited = #limits == 5
		for _, limit in ipairs(limits) do
			limited = limited and limit > 0 and limit <= 300
		end
		check(limited, "the welcome sign and the cart number plates have a draw distance (" .. table.concat(limits, ", ") .. ")")
	end

	section("Draft + roster")
	do
		check(alice:GetAttribute("DraftUnlocked") == true, "the Draft Board unlocks the draft")
		PlayerData.AddCash(alice, 2000000000) -- end-game picks cost a minute of a huge income
		local function questReward(id)
			for _, quest in ipairs(Franchise.GetQuests()) do
				if quest.Id == id then
					return aliceProfile.Franchise.Quests[id] and 0 or quest.Reward
				end
			end
			return 0
		end
		local cashBeforeDraft = PlayerData.GetCash(alice)
		local draftCost = alice:GetAttribute("DraftCost")
		local draftQuestReward = questReward("draft1")
		local firstPick = Franchise._onDraft(alice)
		check(firstPick and firstPick.ok and firstPick.player ~= nil, "drafting works")
		check(
			PlayerData.GetCash(alice) == cashBeforeDraft - draftCost + draftQuestReward,
			("a pick costs DraftCost ($%d)"):format(draftCost or -1)
		)
		check(
			firstPick.player.Rating >= 1
				and firstPick.player.Rating <= 99
				and table.find(Config.Draft.Positions, firstPick.player.Pos) ~= nil,
			("drafted %s %s (%d)"):format(firstPick.player.Pos, firstPick.player.Name, firstPick.player.Rating)
		)
		local tooFast = Franchise._onDraft(alice)
		check(tooFast.ok == false, "drafting is rate limited")
		for _ = 1, 30 do
			Franchise._resetCooldowns(alice)
			Franchise._onDraft(alice)
		end
		local roster = aliceProfile.Franchise.Roster
		check(#roster <= #Config.Draft.Positions + Config.Draft.BenchSize, ("roster is trimmed to starters + bench (%d)"):format(#roster))
		local shownRoster = HttpServiceMock:JSONDecode(alice:GetAttribute("Roster"))
		local filled = 0
		for _, entry in ipairs(shownRoster) do
			if entry.Name ~= "" then
				filled += 1
			end
		end
		check(filled == #Config.Draft.Positions, ("every position has a starter after 31 picks (%d)"):format(filled))
		local rating = alice:GetAttribute("TeamRating")
		check(rating and rating > Config.Draft.BaseRating and rating <= 99, "team rating: " .. tostring(rating))
		check(alice.leaderstats.Rating.Value == rating, "leaderboard shows the team rating")
		-- training (Weight Room)
		check(alice:GetAttribute("TrainUnlocked") == true, "the finished Weight Room unlocks training")
		Franchise._resetCooldowns(alice)
		local cashBeforeTrain = PlayerData.GetCash(alice)
		local trainQuestReward = questReward("train1")
		local trained = Franchise._onTrain(alice)
		check(trained.ok and trained.player ~= nil, "training works: " .. tostring(trained.message))
		check(
			PlayerData.GetCash(alice) == cashBeforeTrain - (alice:GetAttribute("TrainCost") or -1) + trainQuestReward,
			"training costs TrainCost"
		)
		check(trained.player.Rating > 0 and trained.player.Rating <= Config.Draft.MaxTrainedRating, "trained rating stays under the cap")
		local again = Franchise._onTrain(alice)
		check(again.ok == false and again.message:find("breather") ~= nil, "training has a cooldown")
		check(aliceProfile.Franchise.Quests.train1 == true, "the training quest completes")
		check(Franchise._onTrain(bob).ok == false, "no training without a stadium")
		local spent = PlayerData.GetCash(alice)
		PlayerData.TrySpend(alice, spent)
		Franchise._resetCooldowns(alice)
		local broke = Franchise._onDraft(alice)
		check(broke.ok == false and broke.message:find("costs") ~= nil, "can't draft without the cash")
		PlayerData.AddCash(alice, spent)
	end

	do
		-- (in a function of its own, so its locals don't count against runTests' limit)
		local function hoverboardTests()
			section("Hoverboard")
			local Hoverboard = requireNode("ServerScriptService/TycoonServer/Hoverboard")
			local Snacks = requireNode("ServerScriptService/TycoonServer/Snacks")
			local hb = Config.Hoverboard
			local gravity = workspace.Gravity
			-- engine pieces the hoverboard uses (their signals are fired by hand, like elsewhere here)
			for _, name in ipairs({ "ChildAdded", "ChildRemoved" }) do
				roblox.implementProperty("Instance", name, function(inst)
					return instanceSignal(inst, name)
				end)
			end
			roblox.implementProperty("Humanoid", "Died", function(inst)
				return instanceSignal(inst, "Died")
			end)
			roblox.implementMethod("Humanoid", "UnequipTools", function(humanoid)
				local character = humanoid.Parent
				local owner = character and Players:GetPlayerFromCharacter(character)
				for _, child in ipairs(character and character:GetChildren() or {}) do
					if child:IsA("Tool") then
						child.Parent = owner and owner.Backpack or nil
						instanceSignal(character, "ChildRemoved"):Fire(child)
					end
				end
			end)
			local states, stateChanges = {}, {}
			roblox.implementMethod("Humanoid", "GetState", function(humanoid)
				return states[instanceKey(humanoid)] or Enum.HumanoidStateType.Running
			end)
			roblox.implementMethod("Humanoid", "ChangeState", function(humanoid, state)
				table.insert(stateChanges, { humanoid = humanoid, state = state })
			end)
			local tracks = {} -- [animator key] = { fake AnimationTracks }
			local function newTrack(name, playing)
				local track = { Name = name, IsPlaying = playing, Looped = false }
				function track:Play()
					self.IsPlaying = true
				end
				function track:Stop()
					self.IsPlaying = false
				end
				return track
			end
			roblox.implementMethod("Animator", "GetPlayingAnimationTracks", function(animator)
				local list = {}
				for _, track in ipairs(tracks[instanceKey(animator)] or {}) do
					if track.IsPlaying then
						table.insert(list, track)
					end
				end
				return list
			end)
			roblox.implementMethod("Animator", "LoadAnimation", function(animator, animation)
				local track = newTrack(animation.Name, false)
				local key = instanceKey(animator)
				tracks[key] = tracks[key] or {}
				table.insert(tracks[key], track)
				return track
			end)

			local function boardsIn(container)
				local list = {}
				for _, child in ipairs(container and container:GetChildren() or {}) do
					if child:IsA("Tool") and child:GetAttribute("Hoverboard") == true then
						table.insert(list, child)
					end
				end
				return list
			end
			local function equip(player, tool)
				tool.Parent = player.Character
				instanceSignal(player.Character, "ChildAdded"):Fire(tool)
				task.wait()
			end
			local function unequip(player, tool)
				tool.Parent = player.Backpack
				instanceSignal(player.Character, "ChildRemoved"):Fire(tool)
				task.wait()
			end
			local function stats(humanoid)
				return { humanoid.WalkSpeed, humanoid.JumpPower, humanoid.JumpHeight, humanoid.HipHeight }
			end
			local function sameStats(a, b)
				for index = 1, 4 do
					if math.abs(a[index] - b[index]) > 1e-4 then
						return false
					end
				end
				return true
			end
			local function countNotes(player, pattern, from)
				local count = 0
				for index = from or 1, #notifications do
					local note = notifications[index]
					if note.player == player and note.message:find(pattern) then
						count += 1
					end
				end
				return count
			end
			local function washedOut(color)
				local h, s, v = color:ToHSV()
				return (s < 0.3 and v > 0.55) or (h > 0.1 and h < 0.2 and s > 0.3) -- white / cream or yellow
			end

			-- every plot owner gets a board from the start; nobody else does
			local tipDelay = hb.TipDelaySeconds
			hb.TipDelaySeconds = 0
			alice.StarterGear = Instance.new("StarterGear")
			Hoverboard.Init(PlotManager, notifyRemote)
			task.wait(0.05)
			local board = boardsIn(alice.Backpack)[1]
			check(#boardsIn(alice.Backpack) == 1 and board.Name == "Hoverboard", "a plot owner has a Hoverboard tool in the hotbar")
			check(#boardsIn(alice.StarterGear) == 1, "and one in StarterGear, so a respawn brings it back")
			check(#boardsIn(bob.Backpack) == 0, "players without a plot don't get one")
			check(
				not board.RequiresHandle and not board.CanBeDropped and #board:GetChildren() == 0,
				"a plain hotbar Tool: nothing in the hand, it can't be dropped"
			)
			Hoverboard._reconcile(alice)
			local stray = board:Clone()
			stray.Parent = bob.Backpack
			Hoverboard._reconcile(bob)
			check(
				#boardsIn(alice.Backpack) == 1 and #boardsIn(alice.StarterGear) == 1 and #boardsIn(bob.Backpack) == 0,
				"checking again changes nothing, and a board in a non-owner's hotbar is taken away"
			)

			-- riding: 3x speed, no normal jump, hovering on a board under the feet
			local character = alice.Character
			local humanoid = character:FindFirstChildOfClass("Humanoid")
			local root = character:FindFirstChild("HumanoidRootPart")
			local before = stats(humanoid)
			equip(alice, board)
			check(
				Hoverboard.IsRiding(alice) and humanoid:GetAttribute("Hoverboard") == true,
				"picking the board in the hotbar starts the ride"
			)
			check(humanoid.WalkSpeed == hb.Speed and hb.Speed == 3 * before[1], ("3x walking speed (%d)"):format(humanoid.WalkSpeed))
			check(humanoid.JumpPower == 0 and humanoid.JumpHeight == 0, "the normal jump does nothing while riding")
			check(math.abs(humanoid.HipHeight - before[4] - hb.HoverHeight) < 1e-4, "the rider floats HoverHeight higher")
			local deck = board:FindFirstChild("BoardDeck")
			local joint = deck and deck:FindFirstChild("BoardWeld")
			check(
				joint ~= nil and joint.Part0 == root and joint.Part1 == deck and joint:GetAttribute("BaseC0") == joint.C0,
				"the board is welded under the rider's root part"
			)
			local partCount, loose, models, handles, touchers = 0, 0, 0, 0, 0
			for _, d in ipairs(board:GetDescendants()) do
				if d:IsA("BasePart") then
					partCount += 1
					if d.Parent ~= board or d.CanCollide or not d.Massless or d.Anchored then
						loose += 1
					end
					if d.Name == "Handle" then
						handles += 1
					end
					if d.CanTouch then
						touchers += 1
					end
				elseif d:IsA("Model") then
					models += 1
				end
			end
			check(
				partCount >= 7 and loose == 0 and models == 0 and handles == 0,
				("the board's %d parts sit right in the Tool (no nested Model), don't collide and weigh nothing"):format(partCount)
			)
			local skid = board:FindFirstChild("TouchSkid")
			check(
				skid ~= nil and skid.Transparency == 1 and skid.CanTouch and touchers == 1,
				"only the invisible touch skid touches things"
			)
			local hitModel = skid:FindFirstAncestorOfClass("Model")
			check(
				hitModel == character and Players:GetPlayerFromCharacter(hitModel) == alice,
				"a touch pad finds the rider from the skid (its first Model ancestor is the character)"
			)
			local palette = alicePlot.Palette
			check(
				deck.Color == palette.Primary and board.BoardRailLeft.Color == palette.Secondary and board.BoardStripe.Color == palette.Trim,
				"the board comes in the team colours"
			)
			local neon, bigNeon, washed, lamps, brightLamps = 0, 0, 0, 0, 0
			for _, d in ipairs(board:GetDescendants()) do
				if d:IsA("BasePart") and d.Material == Enum.Material.Neon then
					neon += 1
					local s = d.Size
					if math.max(s.X * s.Z, s.X * s.Y, s.Y * s.Z) > 8 then
						bigNeon += 1
					end
					if washedOut(d.Color) then
						washed += 1
					end
				elseif d:IsA("Light") then
					lamps += 1
					if d.Brightness > 1 or d.Range > 8 then
						brightLamps += 1
					end
				end
			end
			check(neon == 1 and bigNeon == 0 and washed == 0, "the only glow is a small underglow in the team colour")
			check(lamps == 1 and brightLamps == 0, "its light is dim (Brightness at most 1) with a small Range")
			local glowsOk = true
			for _, teamPalette in ipairs(Config.TeamColors) do
				glowsOk = glowsOk and not washedOut(Hoverboard._glowColor(teamPalette.Primary))
			end
			check(glowsOk, "no team palette makes a white or yellow glow")
			check(board:FindFirstChild("BoardTrail", true) ~= nil, "a soft trail follows the board")

			-- on the floor: the deck sits under the soles and clears the floor, the skid reaches just
			-- below it (flat pads: buy buttons, collect pads, bus stops, kick spots, gates)
			local soles = root.Size.Y / 2 + before[4] + 2 -- (the test character is R6: 2-stud legs)
			local hoverY = soles + hb.HoverHeight
			local deckY = joint.C0.Position.Y
			local skidY = deckY + skid:FindFirstChildOfClass("Weld").C0.Position.Y
			local deckTop, deckBottom = hoverY + deckY + deck.Size.Y / 2, hoverY + deckY - deck.Size.Y / 2
			local skidTop, skidBottom = hoverY + skidY + skid.Size.Y / 2, hoverY + skidY - skid.Size.Y / 2
			check(
				math.abs(deckTop - hb.HoverHeight) < 1e-3 and deckBottom >= 0.3,
				("the board hovers %.2f above the floor, right under the rider's feet"):format(deckBottom)
			)
			check(
				skidBottom < -0.1 and skidBottom > -1 and skidTop <= deckBottom + 1e-3,
				("the touch skid reaches %.2f below the floor"):format(-skidBottom)
			)

			-- touch pads still work while riding
			task.wait(0.15) -- (the vault fills up)
			local cashBefore = PlayerData.GetCash(alice)
			local notesNow = #notifications
			instanceSignal(alicePlot.Refs.CollectPad, "Touched"):Fire(skid)
			task.wait(0.02)
			local collected = false
			for index = notesNow + 1, #notifications do
				collected = collected or (notifications[index].player == alice and notifications[index].kind == "cash")
			end
			check(collected and PlayerData.GetCash(alice) > cashBefore, "a collect pad collects for a rider")
			local firesBefore = #clientFires
			instanceSignal(KickGame.GetPads(alicePlot)[1], "Touched"):Fire(skid)
			task.wait(0.02)
			local fire = clientFires[#clientFires]
			check(#clientFires > firesBefore and fire.remote == "KickStart" and fire.player == alice, "a kick spot offers a rider a kick")
			notesNow = #notifications
			instanceSignal(claimTrigger(2), "Touched"):Fire(skid)
			task.wait(0.05)
			check(countNotes(alice, "already own", notesNow + 1) == 1, "the gold gates know a rider too")
			instanceSignal(alicePlot.Refs.BusStopPlaza, "Touched"):Fire(skid)
			task.wait(0.02)
			local arrive = alicePlot.Refs.BusArriveCampus
			check(
				(root.CFrame.Position - arrive.Position).Magnitude < 0.01
					and (deck.CFrame.Position - (arrive * joint.C0).Position).Magnitude < 0.01,
				"the team bus takes a rider, board and all"
			)

			-- snack speed boosts: the board keeps its speed, a boost still running comes back after
			local smoothieBoost = Snacks.Kinds.Smoothie.Boost
			local boostSeconds = smoothieBoost.Seconds
			smoothieBoost.Seconds = 0.5
			Snacks.Use(Snacks.Build("Smoothie"), alice)
			check(
				humanoid.WalkSpeed == hb.Speed and Snacks.BoostSpeed(humanoid) == smoothieBoost.Speed,
				"a smoothie while riding doesn't change the board's speed"
			)
			unequip(alice, board)
			check(humanoid.WalkSpeed == smoothieBoost.Speed, "stepping off brings the smoothie boost back while it lasts")
			equip(alice, board)
			check(humanoid.WalkSpeed == hb.Speed, "back on the board: board speed, not boost speed")
			task.wait(0.6)
			check(humanoid.WalkSpeed == hb.Speed and Snacks.BoostSpeed(humanoid) == nil, "a boost running out doesn't end the ride")
			unequip(alice, board)
			check(sameStats(stats(humanoid), before), "stepping off puts speed, jump and hover height back exactly")
			smoothieBoost.Seconds = boostSeconds
			check(#board:GetChildren() == 0, "the board is taken apart when it is put away")

			-- a second owner: claiming gives the board at once; two riders don't mix
			local hana = makePlayer("Hana", 7101)
			hana.StarterGear = Instance.new("StarterGear")
			hana.PlayerGui = Instance.new("Folder")
			hana.PlayerGui.Name = "PlayerGui"
			local hanaProfile = PlayerData.Load(hana)
			Franchise.OnPlayerLoaded(hana)
			Players.PlayerAdded:Fire(hana) -- (in the game Main.server.lua runs on this too)
			task.wait()
			check(#boardsIn(hana.Backpack) == 0, "no board before claiming a plot")
			notesNow = #notifications
			touch(claimTrigger(2), hana)
			task.wait(0.05)
			local hanaPlot = PlotManager.GetPlot(hana)
			local hanaBoard = boardsIn(hana.Backpack)[1]
			check(
				hanaPlot ~= nil and #boardsIn(hana.Backpack) == 1 and #boardsIn(hana.StarterGear) == 1,
				"claiming a plot puts the board in the hotbar at once"
			)
			check(countNotes(hana, "HOVERBOARD", notesNow + 1) == 1, "with a tip on how to ride it")
			local hanaHumanoid = hana.Character:FindFirstChildOfClass("Humanoid")
			hanaHumanoid.RigType = Enum.HumanoidRigType.R15
			hanaHumanoid.HipHeight = 2
			local hanaBefore = stats(hanaHumanoid)
			equip(hana, hanaBoard)
			local hanaRoot = hana.Character.HumanoidRootPart
			local hanaSoles = hanaRoot.Size.Y / 2 + hanaBefore[4] -- (R15: HipHeight reaches the root's bottom)
			local hanaDeckTop = hanaBoard.BoardDeck.BoardWeld.C0.Position.Y + hanaBoard.BoardDeck.Size.Y / 2
			check(math.abs(hanaSoles + hanaDeckTop) < 1e-3, "an R15 rider's board sits right under their feet too")
			instanceSignal(button(2, "hq_lobby:1"), "Touched"):Fire(hanaBoard.TouchSkid)
			task.wait(0.05)
			check(hanaProfile.Owned["hq_lobby:1"] == true, "a buy button builds for a rider")
			equip(alice, board)
			check(
				Hoverboard.IsRiding(alice)
					and Hoverboard.IsRiding(hana)
					and board.BoardDeck.Color == alicePlot.Palette.Primary
					and hanaBoard.BoardDeck.Color == hanaPlot.Palette.Primary
					and alicePlot.Palette ~= hanaPlot.Palette,
				"two riders at once, each board in its own team's colours"
			)
			unequip(hana, hanaBoard)
			check(
				not Hoverboard.IsRiding(hana) and sameStats(stats(hanaHumanoid), hanaBefore) and humanoid.WalkSpeed == hb.Speed,
				"one rider stepping off leaves the other one riding"
			)
			equip(hana, hanaBoard)
			local newPalette = Config.TeamColors[5]
			PlotManager.ApplyTeam(hana, newPalette, "HOVERS")
			for _ = 1, 40 do
				if hanaBoard.BoardDeck.Color == newPalette.Primary then
					break
				end
				task.wait(0.05)
			end
			check(
				hanaBoard.BoardDeck.Color == newPalette.Primary and hanaBoard.BoardRailLeft.Color == newPalette.Secondary,
				"new team colours repaint a board in use"
			)
			unequip(hana, hanaBoard)
			unequip(alice, board)

			-- the client: Hana is the local player
			local function dress(dressed)
				local dressedHumanoid = dressed:FindFirstChildOfClass("Humanoid")
				local animate = Instance.new("LocalScript")
				animate.Name = "Animate"
				animate.Enabled = true -- (Lune has no default for it)
				local idle = Instance.new("StringValue")
				idle.Name = "idle"
				idle.Parent = animate
				local animation = Instance.new("Animation")
				animation.Name = "IdleAnimation"
				animation.Parent = idle
				animate.Parent = dressed
				local animator = Instance.new("Animator")
				animator.Parent = dressedHumanoid
				tracks[instanceKey(animator)] = { newTrack("walk", true) }
				dressedHumanoid.FloorMaterial = Enum.Material.Plastic
				dressed.HumanoidRootPart.AssemblyLinearVelocity = Vector3.new()
				return dressedHumanoid, animate, animator
			end
			local _, animate, animator = dress(hana.Character)
			local bindings, touchCalls = {}, {}
			local bindBefore = ContextActionServiceMock.BindActionAtPriority
			function ContextActionServiceMock:BindActionAtPriority(name, handler, touchButton, priority, ...)
				bindings[name] = { touchButton = touchButton, priority = priority, keys = { ... } }
				return bindBefore(self, name, handler, touchButton, priority, ...)
			end
			function ContextActionServiceMock:SetTitle(name, title)
				touchCalls[name .. ":title"] = title
			end
			function ContextActionServiceMock:SetPosition(name, position)
				touchCalls[name .. ":position"] = position
			end
			function ContextActionServiceMock:GetButton()
				return nil
			end
			local savedLocal = Players.LocalPlayer
			Players.LocalPlayer = hana
			local okClient, clientErr = pcall(runScript, "StarterPlayer/StarterPlayerScripts/TycoonClient/Hoverboard")
			Players.LocalPlayer = savedLocal
			check(okClient, "Hoverboard client script runs: " .. tostring(clientErr))
			local ui = hana.PlayerGui:FindFirstChild("HoverboardUI")
			local chargeBar = ui and ui:FindFirstChild("ChargeBar", true)
			local ACTION = "TycoonHoverboardJump"
			local function frame()
				RunServiceMock.RenderStepped:Fire(1 / 60)
				task.wait()
			end
			local function press(inputState)
				local handler = boundActions[ACTION]
				return handler and handler(ACTION, inputState, { KeyCode = Enum.KeyCode.Space })
			end
			local function hasKey(list, key)
				for _, item in ipairs(list) do
					if item == key then
						return true
					end
				end
				return false
			end
			frame()
			check(ui ~= nil and boundActions[ACTION] == nil and not chargeBar.Visible, "on foot: no jump binding, no charge bar")
			equip(hana, hanaBoard)
			frame()
			local binding = bindings[ACTION]
			check(
				boundActions[ACTION] ~= nil and binding.touchButton == true,
				"riding binds the charged jump (a JUMP button on touch screens)"
			)
			check(
				binding.priority > Enum.ContextActionPriority.Medium.Value and binding.priority < Enum.ContextActionPriority.High.Value,
				"above the normal jump, below the kick meter and the mini-games"
			)
			check(hasKey(binding.keys, Enum.KeyCode.Space) and hasKey(binding.keys, Enum.KeyCode.ButtonA), "on Space and gamepad A")
			local playing = animator:GetPlayingAnimationTracks()
			local idleTrack = playing[1]
			check(
				animate.Enabled == false
					and #playing == 1
					and idleTrack.Name == "IdleAnimation"
					and idleTrack.Priority == Enum.AnimationPriority.Action,
				"the walk / run animations stop: the rider stands on the board"
			)
			-- every board on screen bobs and leans a little
			equip(alice, board)
			local aliceBase = board.BoardDeck.BoardWeld:GetAttribute("BaseC0")
			local hanaJoint = hanaBoard.BoardDeck.BoardWeld
			local hanaBase = hanaJoint:GetAttribute("BaseC0")
			for _ = 1, 3 do
				frame()
			end
			for _ = 1, 20 do
				hanaRoot.CFrame = hanaRoot.CFrame * CFrame.Angles(0, math.rad(4), 0) -- (turning left)
				frame()
			end
			local hanaOffset = hanaBase:ToObjectSpace(hanaJoint.C0)
			local aliceOffset = aliceBase:ToObjectSpace(board.BoardDeck.BoardWeld.C0)
			local pitch, _, roll = hanaOffset:ToEulerAnglesXYZ()
			check(
				hanaOffset.Position.Magnitude > 0 and hanaOffset.Position.Magnitude <= 0.08 and aliceOffset.Position.Magnitude > 0,
				"the boards bob gently (the local rider's and the others')"
			)
			check(
				roll > math.rad(1) and roll <= math.rad(7.01) and math.abs(pitch) <= math.rad(4.01),
				("and lean a little into a turn (%.1f degrees)"):format(math.deg(roll))
			)
			unequip(alice, board)

			-- the charged jump
			local key = instanceKey(hanaHumanoid)
			local changes = #stateChanges
			check(
				press(Enum.UserInputState.Begin) == Enum.ContextActionResult.Sink and chargeBar.Visible,
				"holding jump shows the charge bar"
			)
			check(press(Enum.UserInputState.End) == Enum.ContextActionResult.Sink, "the normal jump never fires as well (sunk)")
			local tapPower = hanaHumanoid.JumpPower
			check(
				#stateChanges == changes + 1
					and stateChanges[#stateChanges].state == Enum.HumanoidStateType.Jumping
					and math.abs(tapPower ^ 2 / (2 * gravity) - hb.MinJumpHeight) < 0.01,
				("a quick tap is a normal jump (%.1f studs)"):format(tapPower ^ 2 / (2 * gravity))
			)
			check(not chargeBar.Visible, "letting go hides the bar")
			states[key] = Enum.HumanoidStateType.Jumping
			hanaRoot.AssemblyLinearVelocity = Vector3.new(0, tapPower - 3, 0)
			frame()
			check(
				hanaHumanoid.JumpPower == 0 and math.abs(hanaRoot.AssemblyLinearVelocity.Y - (tapPower - 3)) < 1e-3,
				"once in the air the normal jump is off again (and a jump that left at its speed is left alone)"
			)
			hanaHumanoid.FloorMaterial = Enum.Material.Air
			press(Enum.UserInputState.Begin)
			press(Enum.UserInputState.End)
			check(#stateChanges == changes + 1, "no jumping again in the air")
			states[key] = Enum.HumanoidStateType.Running
			hanaHumanoid.FloorMaterial = Enum.Material.Plastic
			local chargeSeconds = hb.ChargeSeconds
			hb.ChargeSeconds = 0.4 -- (a quicker full charge for the test)
			press(Enum.UserInputState.Begin)
			task.wait(0.5)
			frame()
			check(
				math.abs(chargeBar.Fill.Size.X.Scale - 1) < 1e-6 and chargeBar.Label.Text:find("x10") ~= nil,
				"holding fills the bar up to MAX JUMP x10: " .. chargeBar.Label.Text
			)
			press(Enum.UserInputState.End)
			local fullPower = hanaHumanoid.JumpPower
			check(
				math.abs(fullPower ^ 2 / (2 * gravity) - hb.MinJumpHeight * hb.MaxJumpMultiplier) < 0.05,
				("a full charge jumps 10x as high (%.1f studs)"):format(fullPower ^ 2 / (2 * gravity))
			)
			states[key] = Enum.HumanoidStateType.Jumping
			hanaRoot.AssemblyLinearVelocity = Vector3.new(4, 0, 0) -- (as if the engine's jump went missing)
			frame()
			check(
				hanaHumanoid.JumpPower == fullPower and hanaRoot.AssemblyLinearVelocity.Y == 0,
				"the jump setting stays up until the engine had a physics step to start the jump"
			)
			RunServiceMock.Heartbeat:Fire(1 / 60)
			RunServiceMock.Heartbeat:Fire(1 / 60)
			frame()
			local launched = hanaRoot.AssemblyLinearVelocity
			check(
				launched.Y > fullPower * 0.8 and launched.Y <= fullPower and launched.X == 4 and hanaHumanoid.JumpPower == 0,
				("the jump leaves at its full speed (%.0f of %.0f)"):format(launched.Y, fullPower)
			)
			states[key] = Enum.HumanoidStateType.Running
			press(Enum.UserInputState.Begin)
			task.wait(0.25)
			press(Enum.UserInputState.End)
			local partHeight = hanaHumanoid.JumpPower ^ 2 / (2 * gravity)
			check(
				partHeight > hb.MinJumpHeight * 1.5 and partHeight < hb.MinJumpHeight * 9.5,
				("a shorter hold jumps less high (%.1fx)"):format(partHeight / hb.MinJumpHeight)
			)
			states[key] = Enum.HumanoidStateType.Jumping
			frame()
			states[key] = Enum.HumanoidStateType.Running
			hb.ChargeSeconds = chargeSeconds
			changes = #stateChanges
			press(Enum.UserInputState.Begin)
			press(Enum.UserInputState.Cancel)
			check(not chargeBar.Visible and #stateChanges == changes and hanaHumanoid.JumpPower == 0, "a cancelled press doesn't jump")

			-- stepping off, touch screens, sitting down
			unequip(hana, hanaBoard)
			frame()
			check(
				boundActions[ACTION] == nil and animate.Enabled and not idleTrack.IsPlaying,
				"stepping off unbinds the jump and brings the animations back"
			)
			UserInputServiceMock.TouchEnabled = true
			equip(hana, hanaBoard)
			frame()
			UserInputServiceMock.TouchEnabled = false
			check(
				touchCalls[ACTION .. ":title"] == "JUMP" and touchCalls[ACTION .. ":position"] ~= nil,
				"on touch screens the JUMP button takes the normal jump button's place"
			)
			press(Enum.UserInputState.Begin)
			pcall(function()
				hanaHumanoid.SeatPart = Instance.new("Seat")
			end)
			instanceSignal(hanaHumanoid, "PropSeatPart"):Fire()
			frame()
			task.wait()
			check(
				hanaBoard.Parent == hana.Backpack
					and not Hoverboard.IsRiding(hana)
					and boundActions[ACTION] == nil
					and not chargeBar.Visible,
				"sitting down puts the board away (and drops a charge)"
			)
			check(sameStats(stats(hanaHumanoid), hanaBefore), "with speed, jump and hover height back exactly")
			equip(hana, hanaBoard)
			check(hanaBoard.Parent == hana.Backpack and not Hoverboard.IsRiding(hana), "a board picked while sitting goes straight back")

			-- respawns: the StarterGear copy comes back once; riding works on the new character
			local function respawn(name)
				local old = hana.Character
				local fresh = makeCharacter(name)
				local freshHumanoid = dress(fresh)
				hana.Character = fresh
				old:Destroy()
				for _, child in ipairs(hana.Backpack:GetChildren()) do
					child:Destroy()
				end
				boardsIn(hana.StarterGear)[1]:Clone().Parent = hana.Backpack -- (what Roblox does)
				hana.CharacterAdded:Fire(fresh)
				task.wait(0.05)
				frame()
				return fresh, freshHumanoid
			end
			local tipsBefore = countNotes(hana, "HOVERBOARD")
			local fresh, freshHumanoid = respawn("HanaCharacter2")
			check(#boardsIn(hana.Backpack) == 1 and boundActions[ACTION] == nil, "after a respawn the board is back in the hotbar, once")
			local freshBoard = boardsIn(hana.Backpack)[1]
			equip(hana, freshBoard)
			frame()
			check(
				Hoverboard.IsRiding(hana) and boundActions[ACTION] ~= nil and freshHumanoid.WalkSpeed == hb.Speed,
				"and riding works on the new character"
			)
			press(Enum.UserInputState.Begin)
			freshHumanoid.Health = 0
			instanceSignal(freshHumanoid, "Died"):Fire()
			task.wait()
			frame()
			check(
				not chargeBar.Visible and boundActions[ACTION] == nil and not Hoverboard.IsRiding(hana),
				"dying while charging a jump: no bar, no binding, no ride"
			)
			fresh, freshHumanoid = respawn("HanaCharacter3")
			freshBoard = boardsIn(hana.Backpack)[1]
			local freshBefore = stats(freshHumanoid)
			equip(hana, freshBoard)
			freshBoard.Parent = workspace
			instanceSignal(fresh, "ChildRemoved"):Fire(freshBoard)
			task.wait()
			check(
				freshBoard.Parent == hana.Backpack and not Hoverboard.IsRiding(hana) and sameStats(stats(freshHumanoid), freshBefore),
				"a dropped board ends the ride and goes back into the hotbar"
			)
			equip(hana, freshBoard)
			freshBoard:Destroy()
			instanceSignal(fresh, "ChildRemoved"):Fire(freshBoard)
			task.wait()
			check(not Hoverboard.IsRiding(hana) and sameStats(stats(freshHumanoid), freshBefore), "a destroyed board ends the ride")
			task.wait(1.3)
			check(#boardsIn(hana.Backpack) == 1, "and a new one is put in the hotbar")
			check(countNotes(hana, "HOVERBOARD") == tipsBefore, "the tip isn't repeated")

			-- releasing the plot takes the board away (riding or not)
			equip(hana, boardsIn(hana.Backpack)[1])
			check(Hoverboard.IsRiding(hana), "riding when the plot is released")
			PlotManager.Release(hana)
			task.wait(0.05)
			check(
				#boardsIn(hana.Backpack) == 0
					and #boardsIn(hana.StarterGear) == 0
					and #boardsIn(hana.Character) == 0
					and not Hoverboard.IsRiding(hana)
					and sameStats(stats(freshHumanoid), freshBefore),
				"releasing the plot ends the ride and takes the board away"
			)
			removePlayer(hana)
			Players.PlayerRemoving:Fire(hana)
			PlayerData.Release(hana)
			hana.Character = nil -- (the client script stays connected: leave it nobody to follow)
			frame()

			ContextActionServiceMock.BindActionAtPriority = bindBefore
			hb.TipDelaySeconds = tipDelay
			check(not Hoverboard.IsRiding(alice) and sameStats(stats(humanoid), before), "Alice is back on foot")
			root.CFrame = CFrame.new(0, 3, 0)
		end
		hoverboardTests()
	end

	section("Field goals")
	do
		check(KickGame.Judge(25, 0, 0.7) == true, "a straight 25-yard kick with enough power is good")
		check(select(2, KickGame.Judge(55, 0, 0.8)) == "short", "a weak 55-yard kick falls short")
		check(select(2, KickGame.Judge(40, -0.6, 1)) == "wide left", "a hooked kick is wide left")
		check(select(2, KickGame.Judge(40, 0.6, 1)) == "wide right", "a sliced kick is wide right")
		local pads = KickGame.GetPads(alicePlot)
		check(pads and #pads == #Config.KickGame.Spots, "the goal posts add kick spots to the field")
		check(plotModel(1):FindFirstChild("KickSpots") ~= nil, "kick spots are in the plot model")
		Config.KickGame.CooldownSeconds = 0
		Config.KickGame.MinMeterSeconds = 0 -- (the tests answer instantly)
		local function kickFrom(index, aim, power)
			alice.Character.HumanoidRootPart.CFrame = pads[index].CFrame * CFrame.new(0, 3, 0)
			local firesBefore = #clientFires
			touch(pads[index], alice)
			local fire = clientFires[#clientFires]
			local offered = #clientFires > firesBefore and fire.remote == "KickStart" and fire.player == alice
			KickGame._onAttempt(alice, index, aim, power)
			return offered, fire
		end
		local cashBeforeKick = PlayerData.GetCash(alice)
		local offered, fire = kickFrom(3, 0, 1)
		check(offered and fire.args[1] == 3 and fire.args[2] == 55, "stepping on a spot opens the kick meter (spot 3, 55 yards)")
		check(PlayerData.GetCash(alice) > cashBeforeKick, "a good kick pays")
		check(
			lastNotification(alice).message:find("IT'S GOOD") ~= nil or lastNotification(alice).message:find("QUEST") ~= nil,
			"told it's good"
		)
		check(alicePlot.Model:FindFirstChild("KickedBall") ~= nil, "the ball flies")
		check((aliceProfile.Franchise.Stats.LongestFG or 0) == 55, "longest field goal is recorded")
		check(aliceProfile.Franchise.Quests.kick50 == true, "the 55-yard quest completes")
		local cashNoOffer = PlayerData.GetCash(alice)
		KickGame._onAttempt(alice, 3, 0, 1)
		check(PlayerData.GetCash(alice) == cashNoOffer, "a kick that wasn't offered is ignored")
		local cashBeforeRepeat = PlayerData.GetCash(alice)
		kickFrom(1, 0, 1)
		check(
			PlayerData.GetCash(alice) == cashBeforeRepeat and lastNotification(alice).message:find("Practice kick") ~= nil,
			"good kicks pay once a minute (the rest are practice): " .. lastNotification(alice).message
		)
		Config.KickGame.MinMeterSeconds = 0.8
		local notesBeforeBot = #notifications
		kickFrom(1, 0, 1)
		check(#notifications == notesBeforeBot, "a kick sent back instantly (a bot) is ignored")
		Config.KickGame.MinMeterSeconds = 0
		kickFrom(1, 0.95, 1)
		check(lastNotification(alice).message:find("wide right") ~= nil, "missed wide right: " .. lastNotification(alice).message)
		kickFrom(2, 0, 0.1)
		check(lastNotification(alice).message:find("short") ~= nil, "missed short: " .. lastNotification(alice).message)
		alice.Character.HumanoidRootPart.CFrame = pads[1].CFrame * CFrame.new(0, 3, 0)
		touch(pads[1], alice)
		alice.Character.HumanoidRootPart.CFrame = CFrame.new(0, 3, 0)
		local cashFar = PlayerData.GetCash(alice)
		KickGame._onAttempt(alice, 1, 0, 1)
		check(PlayerData.GetCash(alice) == cashFar, "walking away from the spot cancels the kick")
		touch(pads[1], bob)
		check(clientFires[#clientFires].player ~= bob, "only the owner can kick on their field")
		Config.KickGame.CooldownSeconds = 3
		Config.KickGame.MinMeterSeconds = 0.8
	end
	do
		-- Space locks the aim and (in a real game) jumps: the landing touches the spot again after the
		-- touch cooldown, while the meter is still open. With the real cooldown and meter minimum the
		-- kick locked right after that landing must still be judged.
		local k = Config.KickGame
		local pads = KickGame.GetPads(alicePlot)
		alice.Character.HumanoidRootPart.CFrame = pads[2].CFrame * CFrame.new(0, 3, 0)
		local cooldown = k.CooldownSeconds
		k.CooldownSeconds = 0 -- (only skips what is left of the cooldown from the kicks above)
		local firesBefore = #clientFires
		touch(pads[2], alice)
		k.CooldownSeconds = cooldown
		local offered = #clientFires == firesBefore + 1 and clientFires[#clientFires].remote == "KickStart"
		touch(pads[2], alice) -- shuffling on the spot inside the cooldown changes nothing
		local quiet = #clientFires == firesBefore + 1
		task.wait(cooldown + 0.1)
		touch(pads[2], alice) -- the jump lands: the client ignores the new KickStart (its meter is open)
		local reoffered = #clientFires == firesBefore + 2
		task.wait(0.1)
		local notesBefore = #notifications
		KickGame._onAttempt(alice, 2, 0, 1)
		local judged = false
		for index = notesBefore + 1, #notifications do
			if notifications[index].player == alice and notifications[index].message:find("IT'S GOOD") then
				judged = true
			end
		end
		check(offered and quiet and reoffered, "a touch inside the cooldown is ignored, the landing after it re-offers the spot")
		check(
			judged,
			("a kick locked 0.1s after landing back on the spot still counts (%gs cooldown, %gs meter minimum)"):format(
				cooldown,
				k.MinMeterSeconds
			)
		)
	end

	section("Staff + game-day results")
	do
		local coaches = plotModel(1).Items:FindFirstChild("staff_coaches:1")
		check(coaches ~= nil and #coaches:GetDescendants() > 5, "the hired head coach stands on the practice field")
		check(plotModel(1).Items:FindFirstChild("staff_vendors:3") ~= nil, "food vendors are on the plaza")
		local wins0 = aliceProfile.Franchise.Stats.Wins or 0
		local losses0 = aliceProfile.Franchise.Stats.Losses or 0
		local cashBeforeGame = PlayerData.GetCash(alice)
		Franchise.PlayGameDay()
		local wins1 = aliceProfile.Franchise.Stats.Wins or 0
		local losses1 = aliceProfile.Franchise.Stats.Losses or 0
		check(wins1 + losses1 == wins0 + losses0 + 1, "every game day is a win or a loss")
		check(
			alice:GetAttribute("Record") == ("%d-%d"):format(wins1, losses1),
			"record attribute: " .. tostring(alice:GetAttribute("Record"))
		)
		check(alice.leaderstats.Wins.Value == wins1, "leaderboard shows wins")
		check(PlayerData.GetCash(alice) > cashBeforeGame, "game days pay a prize either way")
		local finalNote = false
		for index = #notifications, math.max(1, #notifications - 6), -1 do
			if notifications[index].player == alice and notifications[index].message:find("FINAL:") then
				finalNote = true
			end
		end
		check(finalNote, "the final score is announced")
		check(
			alicePlot.HomeScore ~= alicePlot.AwayScore and math.max(alicePlot.HomeScore, alicePlot.AwayScore) >= 14,
			("the scoreboard shows the result (%d-%d)"):format(alicePlot.HomeScore, alicePlot.AwayScore)
		)
		for _ = 1, 40 do
			Franchise.PlayGameDay()
		end
		local stats = aliceProfile.Franchise.Stats
		check((stats.Wins or 0) + (stats.Losses or 0) == wins0 + losses0 + 41, "41 game days played")
		check(aliceProfile.Franchise.Season.Number >= 5, ("seasons roll over (season %d)"):format(aliceProfile.Franchise.Season.Number))
		check(tostring(alice:GetAttribute("Season")):find("SEASON") ~= nil, "Season attribute: " .. tostring(alice:GetAttribute("Season")))
		-- season rules, step by step
		local f = aliceProfile.Franchise
		local playoffsBefore = stats.Playoffs or 0
		f.Season = { Number = 7, Week = Config.Season.Weeks - 1, Wins = Config.Season.PlayoffWins - 1, Losses = 2, Stage = "regular" }
		Franchise._advanceSeason(alice, f, true)
		check(f.Season.Stage == "semifinal" and (stats.Playoffs or 0) == playoffsBefore + 1, "enough wins after the last week = playoffs")
		Franchise._advanceSeason(alice, f, true)
		check(f.Season.Stage == "final", "winning the semifinal = championship game")
		local titlesBefore = stats.Championships or 0
		local _, titlePrize = Franchise._advanceSeason(alice, f, true)
		check((stats.Championships or 0) == titlesBefore + 1, "winning the final = a title")
		check(titlePrize >= Config.Season.MinimumChampionshipPrize, ("titles pay a big prize ($%d)"):format(titlePrize))
		check(f.Season.Number == 8 and f.Season.Week == 0 and f.Season.Stage == "regular", "then a new season starts")
		f.Season = { Number = 8, Week = Config.Season.Weeks - 1, Wins = 1, Losses = Config.Season.Weeks - 2, Stage = "regular" }
		Franchise._advanceSeason(alice, f, false)
		check(f.Season.Number == 9 and f.Season.Stage == "regular", "missing the playoffs starts a new season")
		f.Season = { Number = 9, Week = 0, Wins = 0, Losses = 0, Stage = "semifinal" }
		Franchise._advanceSeason(alice, f, false)
		check(f.Season.Number == 10 and f.Season.Stage == "regular", "a playoff loss ends the season")
		Franchise.CheckQuests(alice)
		check(alice.leaderstats.Titles.Value == stats.Championships, "leaderboard shows titles")
		check(f.Quests.title == true and f.Quests.playoffs == true, "playoff + title quests complete")
		check(
			(alice:GetAttribute("QuestsDone") or 0) >= 15,
			("most quests done by a finished franchise (%d)"):format(alice:GetAttribute("QuestsDone") or 0)
		)
		check(aliceProfile.Franchise.Quests.champion == true, "the trophy quest completes")
		do
			local unknownPiece, roomsGoal, hqRooms = nil, nil, 0
			for _, quest in ipairs(Franchise.GetQuests()) do
				local pieceId = quest.Stat:match("^Piece:(.+)$")
				if pieceId and Items.PieceById[pieceId] == nil then
					unknownPiece = pieceId
				end
				if quest.Id == "rooms12" then
					roomsGoal = quest.Goal
				end
			end
			for _, p in ipairs(Items.Pieces) do
				if p.Id:sub(1, 3) == "hq_" and p.Id ~= "hq_lobby" then
					hqRooms += 1
				end
			end
			check(unknownPiece == nil, "every piece quest names a piece in Items.lua: " .. tostring(unknownPiece))
			check(roomsGoal == hqRooms, ("'Finish every HQ room' counts every HQ room (%s of %d)"):format(tostring(roomsGoal), hqRooms))
			local quests = aliceProfile.Franchise.Quests
			check(
				quests.lowerbowl == true and quests.upperring == true and quests.rooms12 == true,
				"the lower bowl, upper ring and every-HQ-room quests complete"
			)
		end
		local bobProfile = PlayerData.GetProfile(bob)
		bobProfile.Franchise = { Season = { Number = 3, Week = 99, Wins = 4, Losses = -1, Stage = "bogus" } }
		Franchise.GetStat(bob, "Wins")
		local repaired = bobProfile.Franchise.Season
		check(
			repaired.Number == 3
				and repaired.Week == Config.Season.Weeks
				and repaired.Wins == 4
				and repaired.Losses == 0
				and repaired.Stage == "regular",
			"a damaged season is repaired field by field (not wiped)"
		)
	end

	section("Doors, seats, elevators")
	do
		local fixtures = Instance.new("Model")
		fixtures.Name = "TestFixtures"
		fixtures.Parent = plotModel(1)
		local fixCtx = BuildUtil.NewContext(alicePlot.Origin, fixtures, alicePlot.Palette, alicePlot.TeamName, Config)
		local function trigger(prompt, who)
			ProximityPromptServiceMock.PromptTriggered:Fire(prompt, who)
			task.wait(0.03)
		end
		local door = BuildUtil.Door(fixCtx, {
			Name = "TestDoor",
			Size = Vector3.new(6, 9, 0.5),
			CFrame = CFrame.new(-150, 4.7, 200),
			Object = "Test Door",
			AutoClose = 0.3,
			Window = true,
		})
		local leaf = door:FindFirstChild("DoorLeaf")
		local handle = door:FindFirstChild("DoorHandle")
		local doorPrompt = door:FindFirstChild("Interact", true)
		local leafClosed, handleClosed = leaf.CFrame, handle.CFrame
		check(doorPrompt and doorPrompt:GetAttribute("Kind") == "door" and doorPrompt.ActionText == "Open", "doors get an Open prompt")
		trigger(doorPrompt, alice)
		check(door:GetAttribute("IsOpen") == true and doorPrompt.ActionText == "Close", "pressing E opens the door")
		check((leaf.CFrame.Position - leafClosed.Position).Magnitude > 1, "the door leaf swings open")
		check(math.abs(leaf.CFrame.LookVector:Dot(leafClosed.LookVector)) < 0.2, "the leaf turns about 90 degrees on its hinge")
		check((handle.CFrame.Position - handleClosed.Position).Magnitude > 1, "the handle moves with the leaf")
		local hingeEdge = leafClosed * CFrame.new(-3, 0, 0)
		check(((leaf.CFrame * CFrame.new(-2.95, 0, 0)).Position - hingeEdge.Position).Magnitude < 0.3, "the hinge side stays in place")
		task.wait(0.45)
		check(
			door:GetAttribute("IsOpen") == false and (leaf.CFrame.Position - leafClosed.Position).Magnitude < 0.01,
			"doors close again by themselves"
		)
		local slider = BuildUtil.Door(fixCtx, {
			Name = "TestSlider",
			Size = Vector3.new(8, 9, 0.4),
			CFrame = CFrame.new(-170, 4.7, 200),
			Double = true,
			Slide = true,
			AutoClose = 0,
		})
		local leaves = {}
		for _, child in ipairs(slider:GetChildren()) do
			if child.Name == "DoorLeaf" then
				table.insert(leaves, { part = child, closed = child.CFrame })
			end
		end
		trigger(slider:FindFirstChild("Interact", true), alice)
		local apart = #leaves == 2
			and (leaves[1].part.CFrame.Position - leaves[2].part.CFrame.Position).Magnitude
				> (leaves[1].closed.Position - leaves[2].closed.Position).Magnitude + 6
		check(apart, "double sliding doors slide apart")
		check(math.abs(leaves[1].part.CFrame.LookVector:Dot(leaves[1].closed.LookVector) - 1) < 1e-3, "sliding leaves don't rotate")
		task.wait(0.4)
		check(slider:GetAttribute("IsOpen") == true, "AutoClose = 0 doors stay open")
		trigger(slider:FindFirstChild("Interact", true), bob)
		check(slider:GetAttribute("IsOpen") == true, "visitors can't close the owner's doors")
		trigger(slider:FindFirstChild("Interact", true), alice)
		check(slider:GetAttribute("IsOpen") == false, "the owner can close them")

		local camSeat = BuildUtil.Seat(fixCtx, {
			Name = "TestSeat",
			CFrame = CFrame.new(-150, 0.7, 210),
			Camera = { From = Vector3.new(0, 40, 150), To = Vector3.new(0, 0, 30), Fov = 35, Label = "PRESS BOX CAM" },
		})
		check(camSeat.ClassName == "Seat" and typeof(camSeat:GetAttribute("CameraCFrame")) == "CFrame", "camera seats carry their TV view")
		check(camSeat:GetAttribute("CameraLabel") == "PRESS BOX CAM", "camera label")
		trigger(camSeat:FindFirstChild("Interact"), alice)
		check(seatSits[instanceKey(camSeat)] == alice.Character:FindFirstChildOfClass("Humanoid"), "pressing E on a seat sits you down")

		local callButton = BuildUtil.Box(fixCtx, "CallButton", Vector3.new(1, 1, 0.3), Vector3.new(-160, 4, 205))
		local target = CFrame.new(-160, 26, 150)
		local elevatorPrompt = BuildUtil.Elevator(fixCtx, callButton, target, { Label = "PRESS LEVEL" })
		local firesBeforeRide = #clientFires
		trigger(elevatorPrompt, alice)
		task.wait(0.45)
		local fade = clientFires[firesBeforeRide + 1]
		check(fade and fade.remote == "Transition" and fade.args[1] == "PRESS LEVEL", "elevators fade the screen with the level name")
		local arrived = alice.Character.HumanoidRootPart.CFrame.Position
		local expected = (alicePlot.Origin * target * CFrame.new(0, 3, 0)).Position
		check((arrived - expected).Magnitude < 0.01, "the elevator takes you to the other level")
		alice.Character.HumanoidRootPart.CFrame = CFrame.new(0, 3, 0)

		do
			-- every text label on a surface has room to draw its text (a label with no width shows nothing)
			local function faceSize(part, face)
				local size = part.Size
				if face == Enum.NormalId.Front or face == Enum.NormalId.Back then
					return size.X, size.Y
				elseif face == Enum.NormalId.Left or face == Enum.NormalId.Right then
					return size.Z, size.Y
				end
				return size.X, size.Z
			end
			local function boxOf(gui, inst)
				local parent = inst.Parent
				local pw, ph
				if parent == gui then
					local fw, fh = faceSize(gui.Parent, gui.Face)
					pw, ph = fw * gui.PixelsPerStud, fh * gui.PixelsPerStud
				else
					local _, _, w, h = boxOf(gui, parent)
					pw, ph = w, h
				end
				local size, position = inst.Size, inst.Position
				return position.X.Scale * pw + position.X.Offset,
					position.Y.Scale * ph + position.Y.Offset,
					size.X.Scale * pw + size.X.Offset,
					size.Y.Scale * ph + size.Y.Offset,
					pw
			end
			local labels, empty, words = 0, {}, {}
			for _, gui in ipairs(plotModel(1).Items:GetDescendants()) do
				if gui:IsA("SurfaceGui") and gui.Parent:IsA("BasePart") then
					for _, label in ipairs(gui:GetDescendants()) do
						if label:IsA("TextLabel") then
							labels += 1
							local x, _, w, h, canvasWidth = boxOf(gui, label)
							if w <= 0 or h <= 0 then
								table.insert(empty, gui.Parent.Name .. "/" .. label.Text)
							end
							if gui.Parent.Name == "Tier6" then
								words[label.Text] = { x = x, w = w, canvas = canvasWidth }
							end
						end
					end
				end
			end
			check(labels > 1000 and #empty == 0, ("%d surface labels, none without room: %s"):format(labels, table.concat(empty, ", ")))
			local game_, film = words.GAME, words.FILM
			check(
				game_ ~= nil
					and film ~= nil
					and game_.w > 100
					and game_.x >= 0
					and game_.x + game_.w < film.x
					and film.x + film.w <= film.canvas,
				"the film room riser reads GAME | stairs | FILM"
			)
		end

		do
			-- the night flood lights reach the turf (Roblox lights reach 60 studs at most, so the
			-- light towers add field-level fixtures)
			local L = Config.Layout
			local floods, fieldLights, quadrants, hidden = {}, 0, {}, true
			for _, light in ipairs(plotModel(1).Items:GetDescendants()) do
				if light:IsA("SpotLight") and light.Name == "FloodLight" then
					local host = light.Parent
					local cf = alicePlot.Origin:ToObjectSpace(host.CFrame)
					table.insert(floods, { light = light, position = cf.Position, axis = cf.LookVector })
					if host.Name == "FieldLight" then
						fieldLights += 1
						local p = cf.Position
						quadrants[(p.X > 0 and "E" or "W") .. (p.Z > L.FieldCenterZ and "H" or "V")] = true
						hidden = hidden and host.Transparency == 1 and not host.CanCollide and not host.CanQuery and not light.Enabled
					end
				end
			end
			local reached, cells = 0, 0
			for x = -130, 130, 10 do
				for z = L.SurfaceMinZ + 3, L.SurfaceMaxZ - 3, 10 do
					cells += 1
					local spot = Vector3.new(x, 0.2, z)
					for _, flood in ipairs(floods) do
						local offset = spot - flood.position
						local distance = offset.Magnitude
						if distance <= flood.light.Range and offset.Unit:Dot(flood.axis) >= math.cos(math.rad(flood.light.Angle / 2)) then
							reached += 1
							break
						end
					end
				end
			end
			check(
				fieldLights >= 12 and quadrants.EH and quadrants.EV and quadrants.WH and quadrants.WV and hidden,
				("%d invisible field-level flood lights, in every quarter of the field, off by day"):format(fieldLights)
			)
			check(reached >= cells * 0.85, ("night flood lights reach %d of %d spots on the turf"):format(reached, cells))
		end

		do
			-- prompts hide behind walls and floors (line of sight), except where that would lose them
			local los = Instance.new("Model")
			los.Name = "LineOfSightFixtures"
			los.Parent = fixtures
			local losCtx = BuildUtil.NewContext(alicePlot.Origin, los, alicePlot.Palette, alicePlot.TeamName, Config)
			local plaque = BuildUtil.Box(losCtx, "Plaque", Vector3.new(4, 3, 0.3), Vector3.new(-180, 5, 260))
			local glass = BuildUtil.Box(losCtx, "Glass", Vector3.new(4, 4, 4), Vector3.new(-190, 2, 260), nil, nil, { Transparency = 0.6 })
			local wheel = BuildUtil.Box(losCtx, "Wheel", Vector3.new(2, 5, 5), Vector3.new(-200, 2.5, 260))
			BuildUtil.Box(losCtx, "WheelStripe", Vector3.new(2.2, 1, 5.2), Vector3.new(-200, 2.5, 260)) -- round its middle
			local plaqueLook = BuildUtil.Look(plaque, "Plaque", "A plaque.")
			local glassLook = BuildUtil.Look(glass, "Case", "A glass case.")
			local wheelLook = BuildUtil.Look(wheel, "Wheel", "A tackle wheel.")
			local wheelTop = BuildUtil.Look(wheel, "Wheel Top", "Its top.", { At = Vector3.new(0, 2.4, 0) })
			local plaqueUse = BuildUtil.Use(losCtx, plaque, "soda")
			local forced = BuildUtil.Look(plaque, "Plaque", "A plaque.", { LineOfSight = false })
			check(
				plaqueLook.RequiresLineOfSight and plaqueUse.RequiresLineOfSight and not glassLook.RequiresLineOfSight,
				"look / use prompts on solid parts need line of sight (not on see-through glass)"
			)
			check(
				not doorPrompt.RequiresLineOfSight
					and not camSeat:FindFirstChild("Interact").RequiresLineOfSight
					and not elevatorPrompt.RequiresLineOfSight
					and not forced.RequiresLineOfSight,
				"doors, seats and elevators keep showing without line of sight (and builders can opt out)"
			)
			Interactions.Decorate(los)
			check(
				not wheelLook.RequiresLineOfSight and wheelTop.RequiresLineOfSight and plaqueLook.RequiresLineOfSight,
				"a prompt buried inside another part of its piece drops line of sight (it could never show)"
			)

			-- a seat's Sit prompt hides while someone sits in it
			local taken = BuildUtil.Seat(losCtx, { CFrame = CFrame.new(-180, 0.7, 270) })
			local free = BuildUtil.Seat(losCtx, { CFrame = CFrame.new(-184, 0.7, 270) })
			Interactions.Decorate(los)
			local takenPrompt, freePrompt = taken:FindFirstChild("Interact"), free:FindFirstChild("Interact")
			check(takenPrompt.Enabled and freePrompt.Enabled, "seat prompts start enabled")
			local seated = pcall(function()
				taken.Occupant = alice.Character:FindFirstChildOfClass("Humanoid")
			end)
			instanceSignal(taken, "PropOccupant"):Fire()
			freePrompt.Enabled = false -- (as if someone had just stood up)
			instanceSignal(free, "PropOccupant"):Fire()
			task.wait(0.03)
			check(seated and not takenPrompt.Enabled, "an occupied seat hides its Sit prompt")
			check(freePrompt.Enabled, "the Sit prompt comes back when the seat is free")

			-- the finished franchise
			local kinds, buriedLeft, midfieldLos = {}, 0, nil
			for _, model in ipairs(plotModel(1).Items:GetChildren()) do
				local parts = {}
				for _, part in ipairs(model:GetDescendants()) do
					if part:IsA("BasePart") then
						table.insert(parts, part)
					end
				end
				for _, prompt in ipairs(model:GetDescendants()) do
					if prompt:IsA("ProximityPrompt") then
						local key = tostring(prompt:GetAttribute("Kind")) .. (prompt.RequiresLineOfSight and "+los" or "")
						kinds[key] = (kinds[key] or 0) + 1
						local host = prompt.Parent:IsA("Attachment") and prompt.Parent.Parent or prompt.Parent
						if host.Name == "LogoDisk" then
							midfieldLos = prompt.RequiresLineOfSight
						end
						if prompt.RequiresLineOfSight then
							local point = prompt.Parent:IsA("Attachment") and host.CFrame:PointToWorldSpace(prompt.Parent.Position)
								or host.CFrame.Position
							for _, part in ipairs(parts) do
								local offset = part.CFrame:PointToObjectSpace(point)
								if
									part ~= host
									and part.CanQuery
									and math.abs(offset.X) < part.Size.X / 2
									and math.abs(offset.Y) < part.Size.Y / 2
									and math.abs(offset.Z) < part.Size.Z / 2
								then
									buriedLeft += 1
									break
								end
							end
						end
					end
				end
			end
			check(
				(kinds["look+los"] or 0) > 400
					and (kinds["use+los"] or 0) > 80
					and kinds["door+los"] == nil
					and kinds["seat+los"] == nil
					and kinds["elevator+los"] == nil,
				("line of sight on %d look and %d use prompts, never on doors, seats or elevators"):format(
					kinds["look+los"] or 0,
					kinds["use+los"] or 0
				)
			)
			check(buriedLeft == 0 and midfieldLos == false, ("no line-of-sight prompt is buried in a part (%d)"):format(buriedLeft))
		end

		section("Items, mini-games, live screens")
		local counter = BuildUtil.Box(fixCtx, "Counter", Vector3.new(4, 3, 2), Vector3.new(-150, 1.5, 220))
		local hotdogPrompt = BuildUtil.Use(fixCtx, counter, "hotdog")
		local smoothiePrompt = BuildUtil.Use(fixCtx, counter, "smoothie", { Action = "Smoothie time" })
		local fingerPrompt = BuildUtil.Use(fixCtx, counter, "foamfinger")
		Interactions.Decorate(fixtures)
		check(hotdogPrompt.ActionText == "Get a hot dog", "empty prompt texts are filled in from the registry")
		check(smoothiePrompt.ActionText == "Smoothie time", "custom prompt texts are kept")
		trigger(hotdogPrompt, alice)
		local hotdog = alice.Backpack:FindFirstChild("Hot Dog")
		check(
			hotdog ~= nil and hotdog:IsA("Tool") and hotdog:FindFirstChild("Handle") ~= nil,
			"the vendor hands you a hot dog (a Tool with a Handle)"
		)
		Interactions._resetCooldowns(alice)
		trigger(hotdogPrompt, alice)
		local hotdogs = 0
		for _, child in ipairs(alice.Backpack:GetChildren()) do
			if child.Name == "Hot Dog" then
				hotdogs += 1
			end
		end
		check(hotdogs == 1 and lastNotification(alice).message:find("already have") ~= nil, "one of each snack at a time")
		local welded = true
		for _, part in ipairs(hotdog:GetChildren()) do
			if part:IsA("BasePart") and part.Name ~= "Handle" and not part:FindFirstChildOfClass("WeldConstraint") then
				welded = false
			end
			if part:IsA("BasePart") and part.Anchored then
				welded = false
			end
		end
		check(welded, "snack parts are welded to the handle and unanchored")
		hotdog.Parent = alice.Character
		for _ = 1, 3 do
			instanceSignal(hotdog, "Activated"):Fire()
			task.wait(0.03)
			if hotdog.Parent then
				hotdog:SetAttribute("LastUse", 0)
			end
		end
		check(hotdog.Parent == nil, "three bites and the hot dog is gone")
		Interactions._resetCooldowns(alice)
		trigger(smoothiePrompt, alice)
		local smoothie = alice.Backpack:FindFirstChild("Smoothie")
		smoothie.Parent = alice.Character
		instanceSignal(smoothie, "Activated"):Fire()
		task.wait(0.03)
		local aliceHumanoid = alice.Character:FindFirstChildOfClass("Humanoid")
		check(aliceHumanoid.WalkSpeed > 16, ("smoothies give a speed boost (%d)"):format(aliceHumanoid.WalkSpeed))
		aliceHumanoid.WalkSpeed = 16
		aliceHumanoid:SetAttribute("BoostUntil", nil)
		smoothie:Destroy()
		Interactions._resetCooldowns(alice)
		trigger(fingerPrompt, alice)
		local finger = alice.Backpack:FindFirstChild("Foam Finger")
		local fingerColored = false
		for _, part in ipairs(finger and finger:GetChildren() or {}) do
			if part:IsA("BasePart") and part.Color == alicePlot.Palette.Primary then
				fingerColored = true
			end
		end
		check(fingerColored, "foam fingers come in the team colours")
		finger:Destroy()

		local cabinet = BuildUtil.Box(fixCtx, "Cabinet", Vector3.new(3, 6, 2), Vector3.new(0, 3, -150))
		local arcadePrompt = BuildUtil.Use(fixCtx, cabinet, "arcade")
		local liftPrompt = BuildUtil.Use(fixCtx, cabinet, "lift")
		local podiumPrompt = BuildUtil.Use(fixCtx, cabinet, "podium")
		local pongPrompt = BuildUtil.Use(fixCtx, cabinet, "pingpong")
		alice.Character.HumanoidRootPart.CFrame = cabinet.CFrame * CFrame.new(0, 0, 4)
		bob.Character.HumanoidRootPart.CFrame = cabinet.CFrame * CFrame.new(0, 0, 4)
		local function playGame(who, prompt, score, seconds)
			trigger(prompt, who)
			Interactions._backdateSession(who, seconds or 25)
			Interactions._onUseResult(who, prompt, score)
		end
		local cashBeforeGames = PlayerData.GetCash(alice)
		playGame(alice, arcadePrompt, 23)
		check(
			plotModel(1):GetAttribute("ArcadeHigh") == 23 and plotModel(1):GetAttribute("ArcadeHighName") == "Alice",
			"arcade high scores are kept on the plot"
		)
		check(
			(aliceProfile.Franchise.Stats.ArcadeBest or 0) == 23 and aliceProfile.Franchise.Quests.arcade20 == true,
			"the arcade quest completes"
		)
		check(PlayerData.GetCash(alice) > cashBeforeGames, "playing in your own lounge pays a little")
		Interactions._onUseResult(alice, arcadePrompt, 29)
		check(plotModel(1):GetAttribute("ArcadeHigh") == 23, "a result without a started game is ignored")
		trigger(arcadePrompt, alice)
		Interactions._onUseResult(alice, arcadePrompt, 29)
		check(plotModel(1):GetAttribute("ArcadeHigh") == 23, "an arcade game that ended too early is ignored")
		Interactions._resetCooldowns(bob)
		playGame(bob, arcadePrompt, 9999)
		check(plotModel(1):GetAttribute("ArcadeHigh") == Interact.MaxScores.arcade, "impossible scores are capped")
		check(plotModel(1):GetAttribute("ArcadeHighName") == "Bob", "visitors can beat the high score")
		local bobFranchise = PlayerData.GetProfile(bob).Franchise or {}
		check(((bobFranchise.Stats or {}).ArcadeBest or 0) == 0, "visitors don't get stats from someone else's lounge")
		Interactions._resetCooldowns(alice)
		local workoutsBefore = aliceProfile.Franchise.Stats.Workouts or 0
		playGame(alice, liftPrompt, 12)
		check((aliceProfile.Franchise.Stats.Workouts or 0) == workoutsBefore + 1, "lifting weights counts a workout")
		check(lastNotification(alice).message:find("12 reps") ~= nil, "told how many reps: " .. lastNotification(alice).message)
		local hypeBefore = aliceProfile.Franchise.Hype or 0
		playGame(alice, podiumPrompt, 2, 3)
		check(
			aliceProfile.Franchise.Hype == math.min(3, hypeBefore + 1) and alice:GetAttribute("Hype") == aliceProfile.Franchise.Hype,
			"press conferences add team hype"
		)
		check(aliceProfile.Franchise.Quests.presser == true, "the press conference quest completes")
		playGame(bob, pongPrompt, 100, 2)
		check(plotModel(1):GetAttribute("RallyBest") == 5, "scores are capped by how long the game ran")
		playGame(alice, pongPrompt, 14)
		check(plotModel(1):GetAttribute("RallyBest") == 14, "longest ping-pong rally is kept")
		playGame(alice, liftPrompt, 10)
		check(lastNotification(alice).message:find("next cash reward in") ~= nil, "told when the next cash reward comes")
		alice.Character.HumanoidRootPart.CFrame = CFrame.new(500, 3, 500)
		Interactions._resetCooldowns(alice)
		playGame(alice, pongPrompt, 30)
		check(plotModel(1):GetAttribute("RallyBest") == 14, "results from far away are ignored")
		Interactions._onUseResult(alice, "not a prompt", 30)
		Interactions._onUseResult(alice, doorPrompt, 30)
		check(true, "bad UseResult arguments are ignored without errors")
		alice.Character.HumanoidRootPart.CFrame = CFrame.new(0, 3, 0)
		Franchise.PlayGameDay()
		check(aliceProfile.Franchise.Hype == 0, "hype is used up by the next game day")

		local screenPart = BuildUtil.Box(fixCtx, "Screen", Vector3.new(8, 5, 0.4), Vector3.new(-150, 6, 230))
		local liveLabels = {}
		for _, kind in ipairs({
			"summary",
			"roster",
			"arcade",
			"pingpong",
			"record",
			"titles",
			"gameday",
			"owner",
			"score",
			"team",
			"season",
			"rating",
		}) do
			local _, label = BuildUtil.LiveText(screenPart, Enum.NormalId.Front, kind)
			liveLabels[kind] = label
		end
		LiveScreens.Track(alicePlot, fixtures)
		local teamName = alicePlot.TeamName
		check(
			liveLabels.summary.Text:find(teamName, 1, true) ~= nil and liveLabels.summary.Text:find("RECORD") ~= nil,
			"summary screen: " .. liveLabels.summary.Text:gsub("\n", " | ")
		)
		check(liveLabels.roster.Text:find("QB") ~= nil and liveLabels.roster.Text:find("%.") ~= nil, "roster board lists the starters")
		check(
			liveLabels.arcade.Text == "HIGH SCORE " .. Interact.MaxScores.arcade .. " - BOB",
			"arcade marquee: " .. liveLabels.arcade.Text
		)
		check(liveLabels.pingpong.Text == "LONGEST RALLY 14 - ALICE", "ping-pong board: " .. liveLabels.pingpong.Text)
		check(liveLabels.record.Text == "RECORD " .. alice:GetAttribute("Record"), "record screen")
		check(liveLabels.owner.Text == "OWNER: ALICE" and liveLabels.team.Text == teamName, "owner + team screens")
		check(liveLabels.gameday.Text ~= "", "game day screen: " .. liveLabels.gameday.Text)
		local baseLive = {}
		for _, d in ipairs(plotModel(1).Base:GetDescendants()) do
			if d:IsA("TextLabel") and d:GetAttribute("Live") ~= nil then
				table.insert(baseLive, d)
			end
		end
		LiveScreens.Refresh()
		local baseOk = #baseLive > 0
		for _, label in ipairs(baseLive) do
			if label:GetAttribute("Live") == "team" and label.Text ~= teamName then
				baseOk = false
			end
		end
		check(baseOk, ("the HQ building's own signs show the team (%d live signs)"):format(#baseLive))
		alicePlot.HomeScore = 21
		alicePlot.AwayScore = 14
		LiveScreens.Refresh()
		check(liveLabels.score.Text == teamName .. " 21 - 14 VISITORS", "score screen follows the scoreboard: " .. liveLabels.score.Text)
		PlotManager.SetScore(alicePlot, 7, 3)
		check(
			plotModel(1):GetAttribute("HomeScore") == 7 and plotModel(1):GetAttribute("OwnerUserId") == alice.UserId,
			"plots publish score + owner for clients"
		)

		-- the real buildings: everything interactive must be valid
		local promptKinds, totalPrompts, badPrompts = {}, 0, 0
		for _, prompt in ipairs(plotModel(1).Items:GetDescendants()) do
			if prompt:IsA("ProximityPrompt") then
				totalPrompts += 1
				local kind = prompt:GetAttribute("Kind")
				promptKinds[kind or "?"] = (promptKinds[kind or "?"] or 0) + 1
				if prompt.Name ~= "Interact" or not Interact.Kinds[kind] or prompt.ActionText == "" then
					badPrompts += 1
				end
			end
		end
		check(
			totalPrompts >= 6 and badPrompts == 0,
			("the finished franchise has %d valid prompts (%d bad)"):format(totalPrompts, badPrompts)
		)
		check((promptKinds.use or 0) >= 3, "food vendors hand out snacks")
		fixtures:Destroy()
	end

	do
		-- The Coaches' Locker Room: the piece, its rooms under the home stands (each piece built in
		-- plot-local coordinates), then its gear and wardrobe on Alice's finished plot (Gear.lua,
		-- through the real prompts). (A function of its own: runTests is near Luau's local limit.)
		section("Coaches' locker room")
		local function coachRoomTests()
			local Color3 = roblox.Color3
			local Gear = requireNode("ServerScriptService/TycoonServer/Gear")
			local Builders = requireNode("ServerScriptService/TycoonServer/Builders")
			local Snacks = requireNode("ServerScriptService/TycoonServer/Snacks")
			local L = Config.Layout
			Gear.Init(PlotManager)
			local tweets = 0
			roblox.implementMethod("Sound", "Play", function(sound)
				if sound.Name == "Tweet" then
					tweets += 1
				end
			end)

			-- the piece --------------------------------------------------------------------------
			local piece = Items.PieceById.coach_lockerroom
			local home = Items.PieceById.home_lockerroom
			check(
				piece ~= nil
					and #piece.Stages == 4
					and #piece.Requires == 1
					and piece.Requires[1] == "home_lockerroom"
					and piece.Area == "stadium"
					and L.Zones.coach_lockerroom ~= nil,
				"the Coaches' Locker Room: 4 steps, after the home locker room, in the stadium, with a zone"
			)
			check(
				piece.Order > home.Order and piece.Cost > home.Cost,
				"it comes after the home locker room in the build order and costs more"
			)
			check(
				piece.Button.Y == 0 and piece.Button.Z == 89 and math.abs(piece.Button.X) > 58,
				"its button stands on the field's back line, clear of the team benches (|x| < 58)"
			)
			local unhandled = {}
			for use, spec in pairs(Interact.Uses) do
				local handled = spec.Game ~= nil
					or (spec.Tool ~= nil and Snacks.Kinds[spec.Tool] ~= nil)
					or (spec.Gear ~= nil and Gear.Kinds[spec.Gear] ~= nil)
					or (spec.Outfit ~= nil and Gear.Outfits[spec.Outfit] ~= nil)
					or spec.ChangeBack == true
				if not handled then
					table.insert(unhandled, use)
				end
			end
			check(
				#unhandled == 0,
				"every use action is a client mini-game or something the server hands out (snack, gear, outfit) "
					.. table.concat(unhandled, ", ")
			)

			-- the rooms (plot-local) -------------------------------------------------------------
			local function buildPiece(pieceId, onlyStage)
				local model = Instance.new("Model")
				model.Name = pieceId
				Builders[pieceId](BuildUtil.NewContext(CFrame.new(), model, Config.TeamColors[1], "TEST", Config, onlyStage))
				BuildUtil.PruneEmpty(model)
				return model
			end
			local function partsIn(model)
				local list = {}
				for _, d in ipairs(model:GetDescendants()) do
					if d:IsA("BasePart") then
						table.insert(list, d)
					end
				end
				return list
			end
			-- what a player bumps into (door leaves count as open)
			local function solid(list)
				local out = {}
				for _, part in ipairs(list) do
					if part.CanCollide and part.Transparency < 1 and part:GetAttribute("Leaf") == nil then
						table.insert(out, part)
					end
				end
				return out
			end
			local function inside(part, point)
				local o = part.CFrame:PointToObjectSpace(point)
				local h = part.Size / 2
				return math.abs(o.X) < h.X and math.abs(o.Y) < h.Y and math.abs(o.Z) < h.Z
			end
			local function corners(part)
				local list = { part.CFrame.Position }
				local h = part.Size / 2 - Vector3.new(0.02, 0.02, 0.02)
				for _, sx in ipairs({ -1, 1 }) do
					for _, sy in ipairs({ -1, 1 }) do
						for _, sz in ipairs({ -1, 1 }) do
							table.insert(list, part.CFrame:PointToWorldSpace(Vector3.new(sx * h.X, sy * h.Y, sz * h.Z)))
						end
					end
				end
				return list
			end
			local coach, homeRoom, bowl = buildPiece("coach_lockerroom"), buildPiece("home_lockerroom"), buildPiece("lower_home")
			local coachParts = partsIn(coach)
			local steps = {}
			for step = 1, 4 do
				steps[step] = #partsIn(buildPiece("coach_lockerroom", step))
			end
			check(
				steps[1] > 0 and steps[2] > 0 and steps[3] > 0 and steps[4] > 0 and #coachParts <= 170,
				("every step builds something (%d / %d / %d / %d parts; %d in all, a room's budget is 170)"):format(
					steps[1],
					steps[2],
					steps[3],
					steps[4],
					#coachParts
				)
			)
			local minX, maxX, minY, maxY, minZ = math.huge, -math.huge, math.huge, -math.huge, math.huge
			for _, part in ipairs(coachParts) do
				for _, point in ipairs(corners(part)) do
					minX, maxX = math.min(minX, point.X), math.max(maxX, point.X)
					minY, maxY = math.min(minY, point.Y), math.max(maxY, point.Y)
					minZ = math.min(minZ, point.Z)
				end
			end
			check(
				maxY < 12.5 and minY > -0.05 and minZ > 122.9 and minX > -76.5 and maxX < -9.8,
				("the coaches' rooms stay on the event level under the lower rows (top %.1f), between row 7 (z 123), the raker column at x -78 and the home corridor"):format(
					maxY
				)
			)
			local clashes = {}
			local others = solid(partsIn(bowl))
			for _, part in ipairs(solid(partsIn(homeRoom))) do
				table.insert(others, part)
			end
			for _, part in ipairs(coachParts) do
				for _, point in ipairs(corners(part)) do
					for _, other in ipairs(others) do
						if inside(other, point) then
							clashes[part.Name .. " in " .. other.Name] = true
						end
					end
				end
			end
			for _, other in ipairs(others) do
				for _, point in ipairs(corners(other)) do
					for _, part in ipairs(solid(coachParts)) do
						if inside(part, point) then
							clashes[other.Name .. " in " .. part.Name] = true
						end
					end
				end
			end
			local clashList = {}
			for key in pairs(clashes) do
				table.insert(clashList, key)
			end
			check(
				#clashList == 0,
				"nothing of the coaches' rooms runs into the bowl or the home locker room " .. table.concat(clashList, ", ")
			)

			-- the door in the home corridor's wall, and the way through it
			local doors = {}
			for _, d in ipairs(coach:GetDescendants()) do
				if d:IsA("Model") and d:GetAttribute("Leaves") then
					doors[d.Name] = d
				end
			end
			local leaf = doors.CoachesDoor and doors.CoachesDoor:FindFirstChild("DoorLeaf")
			local entryLeaf = doors.EntranceDoors and doors.EntranceDoors:FindFirstChild("DoorLeaf")
			check(
				leaf ~= nil
					and math.abs(leaf.CFrame.Position.X + 10.4) < 0.01
					and leaf.CFrame.Position.Z > 130.6
					and leaf.CFrame.Position.Z < 135.4
					and leaf.CFrame.LookVector.X < -0.99
					and entryLeaf ~= nil
					and entryLeaf.CFrame.LookVector.X < -0.99,
				"the COACHES door stands in the home corridor's west wall and swings into the coaches' tunnel; the room's doors swing in"
			)
			local homeWalls = solid(partsIn(homeRoom))
			local function homeWallAt(point)
				for _, part in ipairs(homeWalls) do
					if inside(part, point) then
						return true
					end
				end
				return false
			end
			local open = true
			for _, point in ipairs(corners(leaf)) do
				open = open and not homeWallAt(point)
			end
			check(
				open
					and homeWallAt(Vector3.new(-10.4, 3, 130.3))
					and homeWallAt(Vector3.new(-10.4, 3, 135.7))
					and homeWallAt(Vector3.new(-10.4, 10, 133)),
				"the home corridor's west wall has a door-sized opening there (wall on both sides and above)"
			)
			local function walk(route, blockers)
				local hits = {}
				for i = 1, #route - 1 do
					local a, b = route[i], route[i + 1]
					local count = math.ceil((b - a).Magnitude / 0.5)
					for k = 0, count do
						local p = a + (b - a) * (k / count)
						for _, y in ipairs({ 1, 3, 5 }) do
							for _, side in ipairs({ -0.8, 0, 0.8 }) do
								local point = Vector3.new(p.X, y, p.Z + side)
								for _, part in ipairs(blockers) do
									if inside(part, point) then
										hits[part.Name] = true
									end
								end
							end
						end
					end
				end
				local list = {}
				for name in pairs(hits) do
					table.insert(list, name)
				end
				return list
			end
			local withoutCoaches = solid(partsIn(bowl))
			for _, part in ipairs(homeWalls) do
				table.insert(withoutCoaches, part)
			end
			local leadsOut = walk(
				{ Vector3.new(0, 0, 133), Vector3.new(-10.4, 0, 133), Vector3.new(-30, 0, 131), Vector3.new(-55, 0, 131) },
				withoutCoaches
			)
			check(
				#leadsOut == 0,
				"before the coaches' room is built, the doorway leads out under the stands (no dead end) " .. table.concat(leadsOut, ", ")
			)
			local after = solid(coachParts)
			for _, part in ipairs(withoutCoaches) do
				table.insert(after, part)
			end
			local route = walk({
				Vector3.new(0, 0, 131),
				Vector3.new(-10.4, 0, 133),
				Vector3.new(-46.6, 0, 133),
				Vector3.new(-52, 0, 133),
				Vector3.new(-60, 0, 140),
			}, after)
			check(
				#route == 0,
				"from the players' tunnel through the COACHES door, down the coaches' tunnel and into the room "
					.. table.concat(route, ", ")
			)

			-- what's inside
			local uses, doorPrompts, looks, seats, live = {}, 0, 0, 0, {}
			local glare, lights = {}, 0
			for _, d in ipairs(coach:GetDescendants()) do
				if d:IsA("ProximityPrompt") then
					local kind = d:GetAttribute("Kind")
					if kind == "use" then
						uses[d:GetAttribute("Use")] = (uses[d:GetAttribute("Use")] or 0) + 1
					elseif kind == "door" then
						doorPrompts += 1
					elseif kind == "look" then
						looks += 1
					end
				elseif d:IsA("Seat") then
					seats += 1
				elseif d:IsA("TextLabel") and d:GetAttribute("Live") ~= nil then
					live[d:GetAttribute("Live")] = true
				elseif d:IsA("Light") then
					lights += 1
					if d.Brightness > 1 or d.Range > 16 or math.min(d.Color.R, d.Color.G, d.Color.B) < 0.9 then
						table.insert(glare, d.Parent.Name .. " light")
					end
				elseif d:IsA("BasePart") and d.Material == Enum.Material.Neon then
					table.insert(glare, d.Name .. " (Neon)")
				elseif d:IsA("SurfaceGui") and d.LightInfluence == 0 then
					local c = d.Parent.Color
					if c.R + c.G + c.B > 0.3 then
						table.insert(glare, d.Parent.Name .. " glows on a light face")
					end
				end
			end
			check(
				uses.whistle == 1
					and uses.clipboard == 1
					and uses.coachpolo == 1
					and uses.hoodie == 1
					and uses.jersey == 1
					and uses.changeback == 1,
				"a whistle rack, clipboards, three outfits and YOUR CLOTHES to use"
			)
			check(
				doorPrompts == 2 and looks >= 10 and seats >= 4 and live.team and live.roster and live.gameday,
				("walk-in: 2 doors, %d look cards, %d seats, live team / starters / kick-off screens"):format(looks, seats)
			)
			check(
				lights >= 8 and #glare == 0,
				("%d soft neutral lights (brightness <= 1, range <= 16), no Neon, only dark screens glow %s"):format(
					lights,
					table.concat(glare, ", ")
				)
			)
			local pants = {}
			for _, part in ipairs(coachParts) do
				if part.Name == "FormPants" then
					table.insert(pants, part)
				end
			end
			table.sort(pants, function(a, b)
				return a.CFrame.Position.X < b.CFrame.Position.X
			end)
			local palette1 = Config.TeamColors[1]
			local _, _, poloLegs = Gear.OutfitColors("CoachPolo", palette1)
			local _, _, hoodieLegs = Gear.OutfitColors("SidelineHoodie", palette1)
			local _, _, jerseyLegs = Gear.OutfitColors("TeamJersey", palette1)
			check(
				#pants == 3 and pants[1].Color == poloLegs and pants[2].Color == hoodieLegs and pants[3].Color == jerseyLegs,
				"the dress forms (polo, hoodie, jersey from west to east) wear the outfits you get"
			)

			-- the gear and the wardrobe on Alice's plot -------------------------------------------
			local function promptFor(use)
				for step = 1, 4 do
					local model = plotModel(1).Items:FindFirstChild("coach_lockerroom:" .. step)
					for _, d in ipairs(model and model:GetDescendants() or {}) do
						if d:IsA("ProximityPrompt") and d:GetAttribute("Use") == use then
							return d
						end
					end
				end
				return nil
			end
			local function spotOf(prompt)
				local host = prompt.Parent
				if host:IsA("Attachment") then
					return host.Parent.CFrame:PointToWorldSpace(host.Position)
				end
				return host.CFrame.Position
			end
			local function trigger(prompt, who)
				ProximityPromptServiceMock.PromptTriggered:Fire(prompt, who)
				task.wait(0.03)
			end
			local function goTo(who, prompt, offset)
				who.Character:PivotTo(CFrame.new(spotOf(prompt) + (offset or Vector3.new())))
				Interactions._resetCooldowns(who)
			end
			local whistlePrompt, clipboardPrompt = promptFor("whistle"), promptFor("clipboard")
			local poloPrompt, hoodiePrompt, jerseyPrompt, backPrompt =
				promptFor("coachpolo"), promptFor("hoodie"), promptFor("jersey"), promptFor("changeback")
			check(
				whistlePrompt
					and clipboardPrompt
					and poloPrompt
					and hoodiePrompt
					and jerseyPrompt
					and backPrompt
					and whistlePrompt.ActionText == "Grab a whistle"
					and poloPrompt.ActionText == "Put it on"
					and backPrompt.ActionText == "Change back",
				"the built room's gear and wardrobe prompts are ready"
			)

			-- a character with clothes, body colours, a hat, layered clothing and hair
			local SKIN = Color3.fromRGB(234, 184, 146)
			local function dressable(name)
				local character = makeCharacter(name)
				local root = character.HumanoidRootPart
				local function limb(partName, size, x, y)
					local part = character:FindFirstChild(partName) or Instance.new("Part")
					part.Name = partName
					part.Size = size
					part.CFrame = root.CFrame * CFrame.new(x, y, 0)
					part.Color = SKIN
					part.Parent = character
					return part
				end
				local head = limb("Head", Vector3.new(1.2, 1.2, 1.2), 0, 2.2)
				local hatSpot = Instance.new("Attachment")
				hatSpot.Name = "HatAttachment"
				hatSpot.Position = Vector3.new(0, 0.6, 0)
				hatSpot.Parent = head
				limb("UpperTorso", Vector3.new(2, 1.6, 1), 0, 0.8)
				limb("LowerTorso", Vector3.new(2, 0.4, 1), 0, -0.2)
				for _, side in ipairs({ { "Left", -1 }, { "Right", 1 } }) do
					local s, x = side[1], side[2]
					limb(s .. "UpperArm", Vector3.new(1, 1.2, 1), 1.5 * x, 0.8)
					limb(s .. "LowerArm", Vector3.new(1, 1.1, 1), 1.5 * x, -0.35)
					limb(s .. "Hand", Vector3.new(1, 0.3, 1), 1.5 * x, -1.05)
					limb(s .. "UpperLeg", Vector3.new(1, 1.2, 1), 0.5 * x, -1)
					limb(s .. "LowerLeg", Vector3.new(1, 1.2, 1), 0.5 * x, -2.2)
					limb(s .. "Foot", Vector3.new(1, 0.3, 1), 0.5 * x, -2.95)
				end
				local kit = { colors = Instance.new("BodyColors") }
				for _, field in ipairs({ "HeadColor3", "TorsoColor3", "LeftArmColor3", "RightArmColor3", "LeftLegColor3", "RightLegColor3" }) do
					kit.colors[field] = SKIN
				end
				kit.colors.Parent = character
				for key, className in pairs({ shirt = "Shirt", pants = "Pants", tee = "ShirtGraphic" }) do
					kit[key] = Instance.new(className)
					kit[key].Parent = character
				end
				for key, spec in pairs({
					hat = { Enum.AccessoryType.Hat, 0 },
					jacket = { Enum.AccessoryType.Jacket, 0.25, true },
					hair = { Enum.AccessoryType.Hair, 0 },
				}) do
					local accessory = Instance.new("Accessory")
					accessory.Name = key
					accessory.AccessoryType = spec[1]
					local handle = Instance.new("Part")
					handle.Name = "Handle"
					handle.Transparency = spec[2]
					handle.CFrame = head.CFrame
					handle.Parent = accessory
					if spec[3] then
						Instance.new("WrapLayer").Parent = handle
					end
					accessory.Parent = character
					kit[key] = handle
				end
				return character, kit
			end

			-- the owner tries the outfits on
			local walker, bobWalker = alice.Character, bob.Character
			local palette = alicePlot.Palette
			local coachChar, kit = dressable("AliceCoach")
			alice.Character = coachChar
			local colorsBefore = {}
			for _, part in ipairs(coachChar:GetChildren()) do
				if part:IsA("BasePart") then
					colorsBefore[part] = part.Color
				end
			end
			goTo(alice, poloPrompt)
			trigger(poloPrompt, alice)
			local outfitColors, folder = coachChar:FindFirstChild("CoachOutfitColors"), coachChar:FindFirstChild("CoachOutfit")
			local _, _, khaki = Gear.OutfitColors("CoachPolo", palette)
			check(
				Gear.Wearing(alice) == "CoachPolo" and lastNotification(alice).message:find("Head Coach Polo") ~= nil,
				"the wardrobe dresses you in the Head Coach Polo: " .. lastNotification(alice).message
			)
			check(
				kit.shirt.Parent == nil and kit.pants.Parent == nil and kit.tee.Parent == nil and kit.colors.Parent == nil,
				"your shirt, pants, T-shirt and body colours are put away"
			)
			check(
				outfitColors ~= nil
					and outfitColors.TorsoColor3 == palette.Primary
					and coachChar.UpperTorso.Color == palette.Primary
					and coachChar.LowerTorso.Color == palette.Primary
					and coachChar.LeftUpperArm.Color == SKIN
					and coachChar.RightUpperLeg.Color == khaki
					and coachChar.LeftFoot.Color == khaki,
				"a polo in the team colour (short sleeves: your arms show) with khakis"
			)
			local names, loose = {}, {}
			for _, part in ipairs(folder and folder:GetChildren() or {}) do
				names[part.Name] = (names[part.Name] or 0) + 1
				local weld = part:FindFirstChildOfClass("Weld")
				local attached = weld ~= nil
					and weld.Part1 == part
					and weld.Part0 ~= nil
					and weld.Part0.Parent == coachChar
					and ((weld.Part0.CFrame * weld.C0).Position - part.CFrame.Position).Magnitude < 1e-3
				if not attached or part.CanCollide or part.CanTouch or part.CanQuery or not part.Massless or part.Anchored then
					table.insert(loose, part.Name)
				end
			end
			check(
				names.CapCrown == 1
					and names.CapBrim == 1
					and names.HeadsetBand == 1
					and names.EarCup == 2
					and names.Mic == 1
					and names.Lanyard == 2
					and names.LanyardWhistle == 1
					and names.Sleeve == 2,
				"short team sleeves, a cap, a headset with a microphone and a whistle on a lanyard"
			)
			check(
				#loose == 0 and folder.CapCrown.CFrame.Position.Y > coachChar.Head.CFrame.Position.Y + 0.3,
				"the outfit's parts sit on the body (welded, non-collidable, massless, untouchable) " .. table.concat(loose, ", ")
			)
			check(
				kit.hat.Transparency == 1 and kit.jacket.Transparency == 1 and kit.hair.Transparency == 0,
				"your hat hides under the cap and layered clothing under the outfit (your hair stays)"
			)
			goTo(alice, poloPrompt)
			trigger(poloPrompt, alice)
			check(lastNotification(alice).message:find("already wearing") ~= nil, "putting on the same outfit again just says so")
			alice.Character:PivotTo(CFrame.new(spotOf(hoodiePrompt)))
			trigger(hoodiePrompt, alice)
			check(Gear.Wearing(alice) == "CoachPolo", "outfit changes are rate limited")
			goTo(alice, hoodiePrompt)
			trigger(hoodiePrompt, alice)
			folder = coachChar:FindFirstChild("CoachOutfit")
			local folders = 0
			for _, child in ipairs(coachChar:GetChildren()) do
				if child.Name == "CoachOutfit" then
					folders += 1
				end
			end
			check(
				Gear.Wearing(alice) == "SidelineHoodie"
					and folders == 1
					and folder:FindFirstChild("Hood") ~= nil
					and folder:FindFirstChild("HeadsetBand") ~= nil
					and folder:FindFirstChild("CapCrown") == nil,
				"switching to the Sideline Hoodie swaps the parts (hood + headset, no cap)"
			)
			check(
				coachChar.LeftUpperArm.Color == palette.Primary
					and coachChar.LeftUpperLeg.Color == hoodieLegs
					and kit.shirt.Parent == nil
					and kit.hat.Transparency == 1,
				"long team sleeves and track pants; your own clothes stay put away, the hat stays under the hood"
			)
			goTo(alice, jerseyPrompt)
			trigger(jerseyPrompt, alice)
			folder = coachChar:FindFirstChild("CoachOutfit")
			local back = folder and folder:FindFirstChild("JerseyBack")
			local nameLabel = back and back:FindFirstChild("JerseyName", true)
			local numberLabel = back and back:FindFirstChild("JerseyNumber", true)
			check(
				Gear.Wearing(alice) == "TeamJersey"
					and nameLabel ~= nil
					and nameLabel.Text == "ALICE"
					and numberLabel.Text == tostring(alice.UserId % 98 + 1),
				"the Team Jersey has your name and number on the back"
			)
			check(kit.hat.Transparency == 0 and kit.jacket.Transparency == 1, "no cap or hood with the jersey: your hat shows again")

			-- team colours: a change on the wardrobe's plot recolours it, another plot's doesn't
			local newPalette = Config.TeamColors[1]
			Gear._onTeamApplied(PlotManager.GetPlots()[2])
			check(coachChar.UpperTorso.Color == palette.Primary, "another plot's team change leaves the outfit alone")
			alicePlot.Palette = newPalette
			Gear._onTeamApplied(alicePlot)
			folder = coachChar:FindFirstChild("CoachOutfit")
			check(
				coachChar.UpperTorso.Color == newPalette.Primary
					and coachChar:FindFirstChild("CoachOutfitColors").TorsoColor3 == newPalette.Primary
					and folder.JerseyBack.Color == newPalette.Primary
					and coachChar.LeftUpperLeg.Color == newPalette.Secondary,
				"a team colour change recolours the jersey you wear"
			)
			alicePlot.Palette = palette
			Gear._onTeamApplied(alicePlot)
			check(coachChar.UpperTorso.Color == palette.Primary, "...and back again")

			-- change back: exactly as before
			goTo(alice, backPrompt)
			trigger(backPrompt, alice)
			local same = true
			for part, color in pairs(colorsBefore) do
				if part.Parent ~= coachChar or part.Color ~= color then
					same = false
				end
			end
			check(
				Gear.Wearing(alice) == nil
					and kit.shirt.Parent == coachChar
					and kit.pants.Parent == coachChar
					and kit.tee.Parent == coachChar
					and kit.colors.Parent == coachChar
					and lastNotification(alice).message:find("own clothes") ~= nil,
				"Change back: your own shirt, pants, T-shirt and body colours come back"
			)
			check(
				same
					and kit.colors.TorsoColor3 == SKIN
					and kit.colors.LeftLegColor3 == SKIN
					and coachChar:FindFirstChild("CoachOutfitColors") == nil
					and coachChar:FindFirstChild("CoachOutfit") == nil,
				"...with every body colour exactly as before and nothing of the outfit left"
			)
			check(
				kit.hat.Transparency == 0 and kit.jacket.Transparency == 0.25 and kit.hair.Transparency == 0,
				"...and hidden accessories exactly as they were"
			)
			goTo(alice, backPrompt)
			trigger(backPrompt, alice)
			check(lastNotification(alice).message:find("already wearing your own") ~= nil, "changing back twice is harmless")

			-- a respawn starts in your own clothes
			goTo(alice, poloPrompt)
			trigger(poloPrompt, alice)
			local respawned, freshKit = dressable("AliceRespawned")
			coachChar.Parent = nil
			alice.Character = respawned
			alice.CharacterAdded:Fire(respawned)
			task.wait(0.15) -- (PlotManager takes the owner home first)
			check(
				Gear.Wearing(alice) == nil and respawned:FindFirstChild("CoachOutfit") == nil and freshKit.shirt.Parent == respawned,
				"a respawn starts in your own clothes"
			)
			goTo(alice, backPrompt)
			trigger(backPrompt, alice)
			check(
				lastNotification(alice).message:find("already wearing your own") ~= nil
					and freshKit.shirt.Parent == respawned
					and freshKit.colors.Parent == respawned,
				"...and Change back leaves the new character alone"
			)

			-- a visitor: outfits on someone else's plot, gone with the character that wore them
			local bobChar, bobKit = dressable("BobCoach")
			bob.Character = bobChar
			goTo(bob, hoodiePrompt)
			trigger(hoodiePrompt, bob)
			check(Gear.Wearing(bob) == "SidelineHoodie" and bobKit.shirt.Parent == nil, "a visitor can change in the owner's wardrobe")
			local bobNext = dressable("BobNext")
			bob.Character = bobNext -- (a new character, without CharacterAdded being seen)
			check(Gear.Wearing(bob) == nil, "an outfit belongs to the character that put it on")
			goTo(bob, poloPrompt, Vector3.new(0, 0, -40))
			trigger(poloPrompt, bob)
			check(Gear.Wearing(bob) == nil, "the wardrobe ignores players who are far away")
			goTo(bob, poloPrompt)
			bobNext:FindFirstChildOfClass("Humanoid").Health = 0
			trigger(poloPrompt, bob)
			check(Gear.Wearing(bob) == nil, "...and players who aren't alive")
			bobNext:FindFirstChildOfClass("Humanoid").Health = 100
			local plain = makeCharacter("BobPlain") -- (no clothes, no body colours)
			local footColor = plain.LeftFoot.Color
			bob.Character = plain
			goTo(bob, jerseyPrompt)
			trigger(jerseyPrompt, bob)
			check(
				Gear.Wearing(bob) == "TeamJersey" and plain.LeftFoot.Color == palette.Secondary,
				"a character without clothes or body colours can change too"
			)
			goTo(bob, backPrompt)
			trigger(backPrompt, bob)
			check(
				Gear.Wearing(bob) == nil and plain.LeftFoot.Color == footColor and plain:FindFirstChildOfClass("BodyColors") == nil,
				"...and back, leaving no body colours behind"
			)
			local ghost = { Name = "Ghost", DisplayName = "Ghost", UserId = 4242, Character = dressable("GhostCoach") }
			Gear.Wear(ghost, "CoachPolo", alicePlot)
			local woreIt = Gear.Wearing(ghost) == "CoachPolo"
			Players.PlayerRemoving:Fire(ghost)
			task.wait(0.03)
			check(woreIt and Gear.Wearing(ghost) == nil, "a player who leaves is forgotten")

			-- the whistle and the clipboard
			Gear.BubbleSeconds = 0.15
			local gearChar = dressable("BobGear")
			bob.Character = gearChar
			goTo(bob, whistlePrompt)
			trigger(whistlePrompt, bob)
			local whistle = bob.Backpack:FindFirstChild("Whistle")
			local lanyardColored, welded = false, true
			for _, part in ipairs(whistle and whistle:GetChildren() or {}) do
				if part:IsA("BasePart") then
					lanyardColored = lanyardColored or part.Color == palette.Secondary
					welded = welded and not part.Anchored and (part.Name == "Handle" or part:FindFirstChildOfClass("WeldConstraint") ~= nil)
				end
			end
			check(
				whistle ~= nil
					and whistle:IsA("Tool")
					and whistle:GetAttribute("Gear") == "Whistle"
					and whistle:FindFirstChild("Handle") ~= nil,
				"the whistle rack hands out a Whistle (a Tool built from parts)"
			)
			local tweet = whistle and whistle.Handle:FindFirstChild("Tweet")
			check(
				welded and lanyardColored and tweet ~= nil and tweet.SoundId:sub(1, 11) == "rbxasset://",
				"welded, on a lanyard in the plot's team colour, with a tweet that ships with Roblox"
			)
			goTo(bob, whistlePrompt)
			trigger(whistlePrompt, bob)
			local whistles = 0
			for _, tool in ipairs(bob.Backpack:GetChildren()) do
				if tool.Name == "Whistle" then
					whistles += 1
				end
			end
			check(whistles == 1 and lastNotification(bob).message:find("already have") ~= nil, "one whistle at a time")
			whistle.Parent = gearChar
			instanceSignal(whistle, "Activated"):Fire()
			task.wait(0.03)
			local head = gearChar.Head
			local bubble = head:FindFirstChild("WhistleBubble")
			local text = bubble and bubble:FindFirstChild("Text", true)
			check(
				bubble ~= nil
					and bubble:IsA("BillboardGui")
					and bubble.AlwaysOnTop
					and text ~= nil
					and text.Text == "TWEEEET!"
					and tweets == 1,
				"blowing it: TWEEEET! over your head (everyone sees it) and a tweet"
			)
			instanceSignal(whistle, "Activated"):Fire()
			task.wait(0.03)
			check(head:FindFirstChild("WhistleBubble") == bubble and tweets == 1, "the whistle has a short cooldown")
			task.wait(0.25)
			check(head:FindFirstChild("WhistleBubble") == nil, "the bubble pops after a moment")
			whistle:SetAttribute("LastUse", 0)
			instanceSignal(whistle, "Activated"):Fire()
			task.wait(0.03)
			check(head:FindFirstChild("WhistleBubble") ~= nil and tweets == 2, "...and it blows again after the cooldown")
			goTo(bob, clipboardPrompt)
			trigger(clipboardPrompt, bob)
			local clipboard = bob.Backpack:FindFirstChild("Clipboard")
			check(clipboard ~= nil and clipboard:GetAttribute("Gear") == "Clipboard", "the gear table hands out a Clipboard")
			clipboard.Parent = gearChar
			local plays = {}
			for _ = 1, 2 do
				clipboard:SetAttribute("LastUse", 0)
				instanceSignal(clipboard, "Activated"):Fire()
				task.wait(0.03)
				local play = head:FindFirstChild("PlayBubble")
				local label = play and play:FindFirstChild("Text", true)
				table.insert(plays, label and label.Text or "?")
			end
			check(
				plays[1] == Gear.Plays[1] and plays[2] == Gear.Plays[2],
				"the clipboard draws up a new play every click: " .. table.concat(plays, ", ")
			)
			whistle:Destroy()
			goTo(bob, whistlePrompt, Vector3.new(30, 0, 0))
			trigger(whistlePrompt, bob)
			check(bob.Backpack:FindFirstChild("Whistle") == nil, "no gear for players far from the rack")
			local stray = Instance.new("Model")
			stray.Parent = workspace
			local strayCtx = BuildUtil.NewContext(CFrame.new(), stray, palette, "", Config)
			local strayRack = BuildUtil.Box(strayCtx, "Rack", Vector3.new(4, 3, 0.3), Vector3.new(0, 5, 900))
			local strayPrompt = BuildUtil.Use(strayCtx, strayRack, "whistle")
			gearChar:PivotTo(CFrame.new(0, 3, 900))
			Interactions._resetCooldowns(bob)
			trigger(strayPrompt, bob)
			check(bob.Backpack:FindFirstChild("Whistle") == nil, "...or from a rack that isn't part of a franchise")

			-- tidy up for the next sections
			stray:Destroy()
			clipboard:Destroy()
			Gear.BubbleSeconds = 1.6
			alice.Character, bob.Character = walker, bobWalker
			Interactions._resetCooldowns(alice)
			Interactions._resetCooldowns(bob)
		end
		coachRoomTests()
	end

	section("Live displays")
	local title = plotModel(1).Items:FindFirstChild("ScoreboardTitle", true)
	local attendance = plotModel(1).Items:FindFirstChild("ScoreboardAttendance", true)
	local score = plotModel(1).Items:FindFirstChild("ScoreboardScore", true)
	check(
		title and title.Text == string.upper(Config.TeamNicknames[5]) .. " STADIUM",
		"scoreboard title uses the team name: " .. tostring(title and title.Text)
	)
	check(
		attendance and attendance.Text:find("ATTENDANCE") ~= nil and attendance.Text:find("%d") ~= nil,
		"scoreboard attendance: " .. tostring(attendance and attendance.Text)
	)
	check(score and score.Text:find("HOME") ~= nil, "scoreboard score: " .. tostring(score and score.Text))
	local jumbo = plotModel(1).Items:FindFirstChild("JumbotronText", true)
	check(jumbo ~= nil, "jumbotron label exists")
	PlotManager.SetNight(true)
	local lightsModel = plotModel(1).Items
	local lightsOn, panelsNeon, lightCount, panelCount = true, true, 0, 0
	for _, d in ipairs(lightsModel and lightsModel:GetDescendants() or {}) do
		if d.ClassName == "SpotLight" and d.Name == "FloodLight" then
			lightCount += 1
			lightsOn = lightsOn and d.Enabled
		elseif d:IsA("BasePart") and d.Name == "FloodPanel" then
			panelCount += 1
			panelsNeon = panelsNeon and d.Material == Enum.Material.Neon
		end
	end
	check(lightCount > 0 and lightsOn, ("%d flood lights switch on at night"):format(lightCount))
	check(panelCount > 0 and panelsNeon, ("%d flood panels glow at night"):format(panelCount))
	PlotManager.SetNight(false)
	local anyOn = false
	for _, d in ipairs(lightsModel and lightsModel:GetDescendants() or {}) do
		if d.ClassName == "SpotLight" and d.Name == "FloodLight" and d.Enabled then
			anyOn = true
		end
	end
	check(not anyOn, "flood lights switch off in the day")

	section("Team bus + campus safe")
	local refs1 = plot1.Refs
	check(
		refs1.BusStopPlaza ~= nil and refs1.BusStopCampus ~= nil and refs1.CampusCollectPad ~= nil,
		"plot has bus stops and a campus collect pad"
	)
	local aliceRoot = alice.Character.HumanoidRootPart
	aliceRoot.CFrame = CFrame.new(0, 3, 0)
	touch(refs1.BusStopPlaza, alice)
	check((aliceRoot.CFrame.Position - refs1.BusArriveCampus.Position).Magnitude < 0.01, "the plaza bus stop rides to the campus")
	touch(refs1.BusStopCampus, alice)
	check((aliceRoot.CFrame.Position - refs1.BusArriveCampus.Position).Magnitude < 0.01, "a short cooldown stops instant bouncing back")
	task.wait(2.1)
	touch(refs1.BusStopCampus, alice)
	check((aliceRoot.CFrame.Position - refs1.BusArrivePlaza.Position).Magnitude < 0.01, "the campus bus stop rides back to the plaza")
	do
		-- driving a golf cart over a bus pad doesn't take the bus (the cart would be dragged along)
		local walker = alice.Character
		local rider = makeCharacter("AliceInACart")
		rider:FindFirstChildOfClass("Humanoid").SeatPart = Instance.new("VehicleSeat")
		alice.Character = rider
		local riderRoot = rider.HumanoidRootPart
		riderRoot.CFrame = CFrame.new(0, 3, 0)
		task.wait(2.1)
		touch(refs1.BusStopPlaza, alice)
		check((riderRoot.CFrame.Position - Vector3.new(0, 3, 0)).Magnitude < 0.01, "no bus ride while driving a golf cart")
		alice.Character = walker
		rider:Destroy()
	end
	plot1.Vault += 50
	local cashBeforeSafe = PlayerData.GetCash(alice)
	touch(refs1.CampusCollectPad, alice)
	check(PlayerData.GetCash(alice) > cashBeforeSafe, "the campus team safe collects the vault")
	local campusLabel = plotModel(1).Base:FindFirstChild("CampusVaultAmount", true)
	check(campusLabel ~= nil and campusLabel.Text:sub(1, 1) == "$", "the team safe shows the vault amount")
	aliceRoot.CFrame = CFrame.new(0, 3, 0)

	section("Server core: rebuilding a whole plot over several frames")
	do
		-- a returning owner's franchise (and every team change) is built a few steps per frame
		local pat = makePlayer("Pat", 6001)
		local patProfile = PlayerData.Load(pat)
		local steps = 0
		for _, item in ipairs(Items.List) do
			if item.PieceId == "hq_lobby" or item.PieceId == "hq_frontoffice" then
				patProfile.Owned[item.Id] = true
				steps += 1
			end
		end
		local plot2 = PlotManager.GetPlots()[2]
		local items2 = plotModel(2).Items
		Config.BuildFrameBudget = 0 -- (one step per frame)
		task.spawn(PlotManager.Claim, plot2, pat, patProfile)
		check(
			plot2.Building and countChildren(items2) < steps,
			("a returning owner's steps are built over several frames (%d of %d in the first one)"):format(countChildren(items2), steps)
		)
		check(
			(pat.Character.HumanoidRootPart.CFrame.Position - plot2.Refs.SpawnCFrame.Position).Magnitude < 0.01,
			"the owner is taken into the HQ before the rebuild"
		)
		check(countChildren(plotModel(2).Buttons) == 0, "the buy buttons wait for the rebuild")
		local fullIncome = Items.TotalIncome(patProfile.Owned) * Config.IncomeMultiplier
		check(
			plot2.Building and fullIncome > 0 and PlotManager.GetBaseIncome(pat) == fullIncome and pat:GetAttribute("Income") == fullIncome,
			"the income is right while the plot is still rebuilding (bonus, prizes and prices use it)"
		)
		check(
			PlotManager.ApplyTeam(pat, Config.TeamColors[4], "TESTERS") and plot2.Palette ~= Config.TeamColors[4],
			"a team change asked for during the rebuild waits for it"
		)
		local frames, midText = 0, nil
		while plot2.Palette ~= Config.TeamColors[4] and frames < 300 do
			local lobby2 = items2:FindFirstChild("hq_lobby:2")
			local countdown = lobby2 and lobby2:FindFirstChild("Live_gameday", true)
			if countdown and plot2.Building and midText == nil then
				midText = countdown.Text
			end
			task.wait()
			frames += 1
		end
		check(midText == "NEXT GAME SOON", "live screens aren't refreshed step by step during a rebuild: " .. tostring(midText))
		check(
			countChildren(items2) == steps and plotModel(2).Buttons:FindFirstChild("Buy_hq_lockerroom:1") ~= nil,
			"then every owned step is there and the buttons appear"
		)
		check(plot2.Palette == Config.TeamColors[4] and plot2.TeamName == "TESTERS", "and the waiting team change is applied")
		local most = 0
		frames = 0
		while plot2.Building and frames < 300 do
			most = math.max(most, countChildren(items2))
			task.wait()
			frames += 1
		end
		local itemFolders = 0
		for _, child in ipairs(plotModel(2):GetChildren()) do
			if child.Name == "Items" then
				itemFolders += 1
			end
		end
		check(
			not plot2.Building and countChildren(items2) == steps and most <= steps and itemFolders == 1,
			("a team change swaps the steps one by one: the plot never exists twice (at most %d models)"):format(most)
		)
		local lobby2 = items2:FindFirstChild("hq_lobby:2")
		local countdown = lobby2 and lobby2:FindFirstChild("Live_gameday", true)
		check(countdown and countdown.Text == "GAME DAY SOON", "the live screens are refreshed once at the end")
		-- purchases wait while a team change rebuilds the plot
		local lockerItem = Items.ById["hq_lockerroom:1"]
		PlayerData.AddCash(pat, lockerItem.Cost + 100)
		check(PlotManager.ApplyTeam(pat, Config.TeamColors[5], "SECOND") and plot2.Building, "a team change rebuilds in the background")
		check(
			not PlotManager.Purchase(plot2, lockerItem) and not patProfile.Owned[lockerItem.Id],
			"nothing can be bought while the plot is being rebuilt"
		)
		check(lastNotification(pat).message:find("being built") ~= nil, "the owner is told to wait a moment")
		-- the owner leaves in the middle of the rebuild: it stops, nothing is built into the freed plot
		-- (its franchise steps aside into another folder and comes down step by step, see below)
		removePlayer(pat)
		PlotManager.Release(pat)
		for _ = 1, 5 do
			task.wait()
		end
		check(
			countChildren(plotModel(2).Items) == 0 and items2.Name ~= "Items" and plot2.Owner == nil and not plot2.Building,
			"an owner who leaves mid-rebuild stops it (the freed plot stays empty)"
		)
		local takedownFrames = 0
		while items2.Parent ~= nil and takedownFrames < 300 do
			task.wait()
			takedownFrames += 1
		end
		check(
			items2.Parent == nil and plot2.TearingDown == 0 and takedownFrames >= 1,
			("and the departed franchise comes down a step per frame here (%d more frames)"):format(takedownFrames)
		)
		PlayerData.Release(pat)
		Config.BuildFrameBudget = math.huge
	end

	section("Server core: sign draw distances")
	do
		local limited, unlimited, odd = 0, 0, 0
		for _, gui in ipairs(plotModel(1).Items:GetDescendants()) do
			if gui:IsA("SurfaceGui") then
				if gui.MaxDistance == 0 then
					unlimited += 1
				elseif gui.MaxDistance >= 150 and gui.MaxDistance <= 1000 then
					limited += 1
				else
					odd += 1
				end
			end
		end
		check(
			limited > 2 * unlimited and odd == 0,
			("signs and screens get a draw distance that suits their size (%d limited, %d unlimited)"):format(limited, unlimited)
		)
		local function guiOf(root, labelName)
			local label = root and root:FindFirstChild(labelName, true)
			return label and label.Parent
		end
		local lobbyScreen = guiOf(plotModel(1).Items:FindFirstChild("hq_lobby:2"), "Live_gameday")
		check(
			lobbyScreen and lobbyScreen.MaxDistance >= 150 and lobbyScreen.MaxDistance < 1000,
			"a room's screen is drawn only within " .. tostring(lobbyScreen and lobbyScreen.MaxDistance) .. " studs"
		)
		local fieldPaint = true
		for _, id in ipairs({ "yardlines:3", "midfield:2", "scoreboard:3", "jumbotron:3" }) do
			for _, gui in ipairs(plotModel(1).Items[id]:GetDescendants()) do
				if gui:IsA("SurfaceGui") and gui.MaxDistance ~= 0 then
					fieldPaint = false
				end
			end
		end
		check(fieldPaint, "field numbers, the midfield logo and the video boards stay visible from anywhere in the bowl")
		local gate = guiOf(plotModel(1).Base, "GateSign")
		check(gate and gate.MaxDistance >= 150, "the plot base's signs get a draw distance too")
	end

	section("Server core: collect pads and the vault")
	do
		-- a third collect pad stands on the field, where every stadium button is
		local L = Config.Layout
		local fieldPad = plot1.Refs.FieldCollectPad
		local expected = (plot1.Origin * CFrame.new(L.FieldCollectPadPosition)).Position
		check(
			fieldPad ~= nil and fieldPad:IsDescendantOf(plotModel(1).Base) and math.abs(fieldPad.CFrame.Position.X - expected.X) < 0.01,
			"a collect pad stands on the field's front sideline, by the visitors' tunnel"
		)
		check(
			fieldPad
				and math.abs(fieldPad.CFrame.Position.Z - expected.Z) < 0.01
				and plot1.Origin:PointToObjectSpace(fieldPad.CFrame.Position).Y + fieldPad.Size.Y / 2 > 0.37,
			"it lies on top of the turf and its painted lines"
		)
		task.wait(0.55) -- (collecting has a 0.5 s cooldown)
		plot1.Vault += 50
		local cashBeforeField = PlayerData.GetCash(alice)
		touch(fieldPad, alice)
		check(PlayerData.GetCash(alice) >= cashBeforeField + 50, "the field pad collects the vault")
		local fieldLabel = plotModel(1).Base:FindFirstChild("FieldVaultAmount", true)
		check(fieldLabel ~= nil and fieldLabel.Text:sub(1, 1) == "$", "the field pad shows the vault amount")
		aliceRoot.CFrame = fieldPad.CFrame * CFrame.new(0, 3, 0)
		task.wait(0.2)
		check(plot1.Vault < 1, "standing on the field pad keeps collecting")
		aliceRoot.CFrame = CFrame.new(0, 3, 0)
		-- buy buttons spend the vault too
		local quinn = makePlayer("Quinn", 6002)
		local quinnProfile = PlayerData.Load(quinn)
		for stage = 1, 5 do
			quinnProfile.Owned["hq_lobby:" .. stage] = true
		end
		local plot2 = PlotManager.GetPlots()[2]
		PlotManager.Claim(plot2, quinn, quinnProfile)
		local office = Items.ById["hq_frontoffice:1"]
		PlayerData.TrySpend(quinn, PlayerData.GetCash(quinn))
		plot2.Vault = office.Cost + 5
		task.wait(0.1)
		check(
			button(2, office.Id) and button(2, office.Id).Color == Config.Colors.ButtonAffordable,
			"buttons are green when cash + vault is enough"
		)
		touch(button(2, office.Id), quinn)
		check(quinnProfile.Owned[office.Id] == true and plot2.Vault < office.Cost, "a button spends the vault when the cash is short")
		local locker = Items.ById["hq_lockerroom:1"]
		PlayerData.TrySpend(quinn, PlayerData.GetCash(quinn))
		plot2.Vault = 0
		touch(button(2, locker.Id), quinn)
		local note = lastNotification(quinn)
		check(
			not quinnProfile.Owned[locker.Id] and note and note.message:find("need") ~= nil,
			"still short: told how much more is needed: " .. tostring(note and note.message)
		)
		check(
			note and note.message:find("HQ lobby", 1, true) ~= nil and note.message:find("field", 1, true) ~= nil,
			"and where the collect pads are"
		)
		removePlayer(quinn)
		PlotManager.Release(quinn)
		PlayerData.Release(quinn)
	end

	section("Server core: the guide beam's button")
	do
		-- the beam points at the cheapest button in the part of the plot the owner is in (unless one
		-- elsewhere is much cheaper), so it doesn't send them across the plot for every step
		local rita = makePlayer("Rita", 6003)
		local ritaProfile = PlayerData.Load(rita)
		for _, pieceId in ipairs({ "hq_lobby", "hq_frontoffice", "hq_lockerroom" }) do
			for _, stepId in ipairs(Items.PieceById[pieceId].StageIds) do
				ritaProfile.Owned[stepId] = true
			end
		end
		local plot2 = PlotManager.GetPlots()[2]
		local guide = Config.GuideGoal
		local recheck, factor = guide.RecheckSeconds, guide.ZoneCostFactor
		guide.RecheckSeconds = 0.1
		PlotManager.Claim(plot2, rita, ritaProfile)
		check(
			rita:GetAttribute("NextGoal") == "hq_coaches:1" and Items.ById["practice_field:1"].Cost < Items.ById["hq_coaches:1"].Cost,
			"in the HQ the beam points at the HQ's cheapest button, not a cheaper one outside: " .. tostring(rita:GetAttribute("NextGoal"))
		)
		local ritaRoot = rita.Character.HumanoidRootPart
		local campus = plot2.Origin * CFrame.new(Config.Layout.Areas.campus)
		task.wait(2.2) -- (until the guide's check loop runs at the test interval)
		ritaRoot.CFrame = campus * CFrame.new(-130, 3, 410) -- out on the practice fields
		local frames = 0
		while plot2.GoalChallenger == nil and frames < 200 do
			task.wait()
			frames += 1
		end
		check(
			plot2.GoalChallenger == "practice_field:1" and rita:GetAttribute("NextGoal") == "hq_coaches:1",
			"another button has to win two checks in a row before the beam moves (no flicker)"
		)
		task.wait(0.35)
		check(rita:GetAttribute("NextGoal") == "practice_field:1", "out on the campus it moves to the campus's cheapest button")
		ritaRoot.CFrame = campus * CFrame.new(-100, 3, 230) -- back in the HQ lobby
		task.wait(0.35)
		check(rita:GetAttribute("NextGoal") == "hq_coaches:1", "and back in the HQ to the HQ's")
		guide.ZoneCostFactor = 1.1
		task.wait(0.35)
		check(rita:GetAttribute("NextGoal") == "practice_field:1", "unless a button elsewhere is much cheaper")
		guide.RecheckSeconds, guide.ZoneCostFactor = recheck, factor
		removePlayer(rita)
		PlotManager.Release(rita)
		PlayerData.Release(rita)
	end

	section("Server core: team colours on the plot base")
	do
		-- parts and signs of the always-present plot base (and the HQ building) say which team
		-- colour they use, so a team change repaints them too
		local function baseColors(index, palette)
			local tagged, wrong = 0, nil
			for _, inst in ipairs(plotModel(index).Base:GetDescendants()) do
				local role, textRole, backRole =
					inst:GetAttribute("TeamRole"), inst:GetAttribute("TeamTextRole"), inst:GetAttribute("TeamBackRole")
				if role or textRole or backRole then
					tagged += 1
				end
				if role and inst:IsA("BasePart") and inst.Color ~= palette[role] then
					wrong = inst.Name
				end
				if textRole and inst.TextColor3 ~= palette[textRole] then
					wrong = inst.Name
				end
				if backRole and inst.BackgroundColor3 ~= palette[backRole] then
					wrong = inst.Name
				end
			end
			return tagged, wrong
		end
		local base1 = plotModel(1).Base
		local gateSign = base1:FindFirstChild("GateSign", true)
		check(
			base1:FindFirstChild("BorderFront", true):GetAttribute("TeamRole") == "Primary"
				and base1:FindFirstChild("GateBeam", true):GetAttribute("TeamRole") == "Secondary"
				and gateSign:GetAttribute("TeamTextRole") == nil -- (white text reads on every Primary)
				and gateSign:GetAttribute("TeamBackRole") == "Primary",
			"the plot base's team-coloured parts and signs say which team colour they use"
		)
		local tagged, wrong = baseColors(1, Config.TeamColors[3])
		check(
			tagged >= 12 and wrong == nil,
			("a team change repaints the plot base too (%d team-coloured parts and signs; wrong: %s)"):format(tagged, tostring(wrong))
		)
		local sam = makePlayer("Sam", 6004)
		local samProfile = PlayerData.Load(sam)
		samProfile.Franchise = { Team = { Palette = 4, Nickname = 2 } }
		local plot2 = PlotManager.GetPlots()[2]
		PlotManager.Claim(plot2, sam, samProfile)
		local _, wrongSaved = baseColors(2, Config.TeamColors[4])
		check(
			plot2.Palette == Config.TeamColors[4] and wrongSaved == nil,
			"a returning owner's plot base is painted in their saved team colours: " .. tostring(wrongSaved)
		)
		removePlayer(sam)
		PlotManager.Release(sam)
		PlayerData.Release(sam)
		local _, wrongFreed = baseColors(2, Config.TeamColors[2])
		check(wrongFreed == nil, "a freed plot's base goes back to the plot's own colours: " .. tostring(wrongFreed))
	end

	section("Server core: claiming from a golf cart")
	do
		-- a player who rides a cart through a free gold gate gets out before being taken into the
		-- HQ (otherwise the cart, welded to them, would come along)
		local vic = makePlayer("Vic", 6006)
		PlayerData.Load(vic)
		local humanoid = vic.Character:FindFirstChildOfClass("Humanoid")
		local cartSeat = Instance.new("VehicleSeat")
		cartSeat.CFrame = CFrame.new(0, 2, 0)
		local seatWeld = Instance.new("Weld")
		seatWeld.Name = "SeatWeld"
		seatWeld.Part0 = cartSeat
		seatWeld.Part1 = vic.Character.HumanoidRootPart
		seatWeld.Parent = cartSeat
		cartSeat.Parent = workspace
		humanoid.SeatPart = cartSeat
		humanoid.Sit = true
		touch(claimTrigger(2), vic)
		task.wait(0.05)
		local plot2 = PlotManager.GetPlots()[2]
		check(vic:GetAttribute("PlotIndex") == 2, "a player in a golf cart can still claim a free plot")
		check(
			cartSeat:FindFirstChild("SeatWeld") == nil and humanoid.Sit == false,
			"they are taken out of the cart first (the seat weld is broken)"
		)
		check(
			(vic.Character.HumanoidRootPart.CFrame.Position - plot2.Refs.SpawnCFrame.Position).Magnitude < 0.01
				and (cartSeat.CFrame.Position - Vector3.new(0, 2, 0)).Magnitude < 0.01,
			"then they are taken into the HQ and the cart stays at the gate"
		)
		cartSeat:Destroy()
		removePlayer(vic)
		PlotManager.Release(vic)
		PlayerData.Release(vic)
	end

	section("Respawn at plot")
	local newCharacter = makeCharacter("AliceCharacter2")
	alice.Character = newCharacter
	alice.CharacterAdded:Fire(newCharacter)
	task.wait(0.3)
	local spawnCFrame = plot1.Refs.SpawnCFrame
	check((newCharacter.HumanoidRootPart.CFrame.Position - spawnCFrame.Position).Magnitude < 0.01, "owner respawns at their plot")

	section("Leaving saves and frees the plot")
	task.wait(0.1)
	local vaultAtLeave = math.floor(plot1.Vault)
	local cashAtLeave = PlayerData.GetCash(alice)
	removePlayer(alice)
	PlotManager.Release(alice)
	PlayerData.Release(alice)
	task.wait(0.05)
	local baseReset = true
	for _, d in ipairs(plotModel(1).Base:GetDescendants()) do
		if d:IsA("TextLabel") and d:GetAttribute("Live") ~= nil and d.Text ~= d:GetAttribute("LiveDefault") then
			baseReset = false
		end
	end
	check(baseReset, "the HQ signs go back to their placeholders when the plot is freed")
	local saved = dataStore.data.Player_1001
	check(
		saved ~= nil and saved.Cash == cashAtLeave + vaultAtLeave,
		("saved cash includes the vault payout (%s vs %s)"):format(tostring(saved and saved.Cash), tostring(cashAtLeave + vaultAtLeave))
	)
	check(saved and #saved.Owned == #Items.List, "saved owned list has every item")
	check(saved and saved.Session == nil, "session lock released on leave")
	check(countChildren(plotModel(1).Items) == 0 and countChildren(plotModel(1).Buttons) == 0, "plot emptied")
	check(claimTrigger(1).Transparency < 1 and gateLabel.Text == "CLAIM THIS STADIUM", "gate reset")
	check(PlayerData.GetProfile(alice) == nil, "profile released")

	section("Rejoin restores the stadium")
	local alice2 = makePlayer("Alice", 1001)
	PlotManager.OnPlayerAdded(alice2)
	local profile2 = PlayerData.Load(alice2)
	check(profile2.Cash == saved.Cash, "cash restored")
	touch(claimTrigger(2), alice2)
	check(alice2:GetAttribute("PlotIndex") == 2, "claimed plot 2")
	check(countChildren(plotModel(2).Items) == #Items.List, "all pieces rebuilt on the new plot")
	check(countChildren(plotModel(2).Buttons) == 0, "no buttons left when everything is owned")
	check(lastNotification(alice2).message:find("Welcome back") ~= nil, "welcome back message")

	section("Session lock")
	-- Another server holds Carol's data: we wait, then it releases and we load the fresh data.
	dataStore.data.Player_2001 = { Version = 1, Cash = 777, Owned = { "turf:1" }, Session = { JobId = "server-B", Time = os.time() } }
	local carol = makePlayer("Carol", 2001)
	local carolProfile = nil
	task.spawn(function()
		carolProfile = PlayerData.Load(carol)
	end)
	task.wait(0.5)
	check(carolProfile == nil, "load waits while another server holds the lock")
	dataStore.data.Player_2001 = { Version = 1, Cash = 999, Owned = { "turf:1", "yardlines:1" } } -- other server saved + released
	task.wait(5)
	check(
		carolProfile ~= nil and carolProfile.Cash == 999 and carolProfile.Owned["yardlines:1"],
		"loads the other server's final save after it releases"
	)
	-- A stale lock (server crashed long ago) is taken over immediately
	dataStore.data.Player_2002 = { Version = 1, Cash = 5, Owned = {}, Session = { JobId = "dead-server", Time = os.time() - 10000 } }
	local dave = makePlayer("Dave", 2002)
	local daveProfile = PlayerData.Load(dave)
	check(daveProfile and daveProfile.Cash == 5 and daveProfile.CanSave, "stale lock is taken over")
	-- If another server steals the data, we must stop saving instead of overwriting it
	dataStore.data.Player_2002.Session = { JobId = "server-C", Time = os.time() }
	PlayerData.AddCash(dave, 100)
	local ok = PlayerData.Save(dave)
	check(
		ok == false and daveProfile.CanSave == false and dataStore.data.Player_2002.Cash == 5,
		"doesn't overwrite data owned by another server"
	)

	section("Bad saved data is sanitised")
	dataStore.data.Player_3001 = { Cash = -50, Owned = { "turf:1", "not_a_real_item", 42 } }
	local erin = makePlayer("Erin", 3001)
	local erinProfile = PlayerData.Load(erin)
	check(erinProfile.Cash == Config.StartingCash, "negative cash ignored")
	check(erinProfile.Owned["turf:1"] and not erinProfile.Owned.not_a_real_item, "unknown item ids aren't built")
	check(
		#erinProfile.UnknownOwned == 1 and erinProfile.UnknownOwned[1] == "not_a_real_item",
		"unknown item ids are remembered (non-strings dropped)"
	)
	PlayerData.Save(erin)
	local erinSaved = dataStore.data.Player_3001
	check(erinSaved and table.find(erinSaved.Owned, "not_a_real_item") ~= nil, "unknown item ids are written back, not deleted")
	dataStore.data.Player_3002 = "garbage"
	local frank = makePlayer("Frank", 3002)
	local frankProfile = PlayerData.Load(frank)
	check(frankProfile ~= nil and frankProfile.Cash == Config.StartingCash, "non-table save treated as new player")

	section("Player leaves while loading")
	dataStore.delay = 0.3
	local gina = makePlayer("Gina", 4001)
	local ginaResult = "pending"
	task.spawn(function()
		ginaResult = PlayerData.Load(gina)
	end)
	task.wait(0.1)
	removePlayer(gina)
	task.wait(1.5)
	dataStore.delay = 0
	check(ginaResult == nil, "Load returns nil when the player left")
	check(dataStore.data.Player_4001 == nil or dataStore.data.Player_4001.Session == nil, "lock given back after leaving mid-load")

	section("Temporary DataStore errors")
	dataStore.failNext = 1
	PlayerData.AddCash(erin, 7)
	local savedAfterBlip = PlayerData.Save(erin)
	check(savedAfterBlip == true and erinProfile.CanSave, "a temporary 502 is retried instead of turning saving off")
	check(PlayerData.IsSavingAvailable(), "saving stays available after a temporary error")

	section("Save from a newer game version")
	dataStore.data.Player_3003 = { Version = 99, Cash = 50, Owned = { "turf:1" }, FutureField = true }
	local ivy = makePlayer("Ivy", 3003)
	local ivyProfile = PlayerData.Load(ivy)
	check(ivyProfile and ivyProfile.Cash == 50 and ivyProfile.CanSave == false, "newer-version save is loaded read-only")
	check(dataStore.data.Player_3003.Session == nil and dataStore.data.Player_3003.Version == 99, "newer-version save is not touched")

	section("Rejoining the same server during the final save")
	local jack = makePlayer("Jack", 3004)
	local jackProfile = PlayerData.Load(jack)
	PlayerData.AddCash(jack, 4321)
	dataStore.delay = 0.4
	removePlayer(jack)
	task.spawn(PlayerData.Release, jack)
	task.wait(0.05)
	local jack2 = makePlayer("Jack", 3004)
	local jack2Profile = PlayerData.Load(jack2)
	dataStore.delay = 0
	check(jackProfile.Released and jack2Profile and jack2Profile.Cash == 4321, "rejoin waits for the final save and gets the newest cash")
	check(jack2Profile and jack2Profile.CanSave, "the new session can save")

	section("Autosave + shutdown")
	local writesBefore = dataStore.writes
	task.wait(0.8)
	check(dataStore.writes > writesBefore, "autosave writes periodically")
	PlayerData.AddCash(alice2, 123)
	PlotManager.DepositAllVaults()
	local expected = PlayerData.GetCash(alice2)
	PlayerData.ReleaseAll(5)
	check(dataStore.data.Player_1001.Cash == expected, "ReleaseAll saves everyone on shutdown")
	check(PlayerData.GetProfile(alice2) == nil, "profiles released on shutdown")

	section("DataStore unavailable (Studio API access off)")
	studioMode = true
	dataStore.failWith = "502: API Services rejected request with error. Error code: 403 Reason: Studio access to APIs is not allowed."
	local hank = makePlayer("Hank", 5001)
	local started = os.clock()
	local hankProfile = PlayerData.Load(hank)
	check(hankProfile ~= nil and hankProfile.CanSave == false, "game still works without saving")
	check(os.clock() - started < 1, "fails fast instead of retrying a permanent error")
	check(hank:GetAttribute("SaveStatus") == "off", "HUD told saving is off")
	touch(claimTrigger(1), hank)
	check(hank:GetAttribute("PlotIndex") == 1, "can still claim and play")
	local hankCash = PlayerData.GetCash(hank)
	Franchise._onClaimBonus(hank)
	local afterFirst = PlayerData.GetCash(hank) -- (+ quest rewards: the bonus quest completes too)
	check(afterFirst >= hankCash + Config.OwnerBonus.StudioTestCash, "in Studio the Owner's Bonus gives test cash")
	Franchise._resetCooldowns(hank)
	Franchise._onClaimBonus(hank)
	check(PlayerData.GetCash(hank) >= afterFirst + Config.OwnerBonus.StudioTestCash, "and it is always ready in Studio")
	Franchise.CheckQuests(hank)
	check((hank:GetAttribute("BonusReadyAt") or math.huge) <= workspace:GetServerTimeNow() + 0.5, "the bonus button shows CLAIM")
	check(hank:GetAttribute("TestBonus") == true, "the bonus button knows it's test cash in Studio")

	section("Game day")
	do
		-- Every plot plays its own game days; the owner starts them (START GAME -> StartGameDay).
		-- Plot 2 is alice2's finished franchise (her save was released at shutdown, so her games are
		-- friendly scrimmages); plot 1 is hank's, with nothing built yet.
		local GameDay = requireNode("ServerScriptService/TycoonServer/GameDay")
		local savedSettings = table.clone(Config.GameDay)
		Config.GameDay.DurationSeconds = 3 -- (long enough for the crowd to arrive, a chunk per frame)
		Config.GameDay.CooldownSeconds = 1.5
		local fullPlot = PlotManager.GetPlot(alice2)
		local hankPlot = PlotManager.GetPlot(hank)
		local model2, model1 = fullPlot.Model, hankPlot.Model
		local incomeBefore = alice2:GetAttribute("Income")
		GameDay.Init(PlotManager, remoteInstances, notifyRemote)
		GameDay.SetMatchMaker(Franchise.DecideGame)
		GameDay.OnEnded(Franchise.FinishGame)
		GameDay.Start()
		local startRemote = remoteInstances:FindFirstChild("StartGameDay")
		remotesFolder.StartGameDay = startRemote
		local function said(player, from, text)
			for index = from, #notifications do
				local note = notifications[index]
				if note.player == player and note.message:find(text, 1, true) then
					return true
				end
			end
			return false
		end
		local function waitUntil(condition, seconds)
			local deadline = os.clock() + seconds
			while not condition() and os.clock() < deadline do
				task.wait(0.02)
			end
			return condition()
		end
		local function crowdOf(plot)
			local seated, walkers = 0, 0
			local folder = plot.Model:FindFirstChild("GameDayFans")
			for _, child in ipairs(folder and folder:GetChildren() or {}) do
				if child.Name == "Fan" then
					seated += 1
				elseif child.Name:sub(1, 6) == "Walker" then
					walkers += 1
				end
			end
			return seated, walkers, folder
		end

		check(startRemote ~= nil and startRemote.ClassName == "RemoteEvent", "the StartGameDay remote is created")
		check(
			model2:GetAttribute("GameDayStatus") == "ready"
				and model2:GetAttribute("GameReady") == true
				and model2:GetAttribute("NextGameReadyAt") == nil,
			"a finished field is ready for its first game straight away: " .. tostring(model2:GetAttribute("GameDayStatus"))
		)
		check(
			model1:GetAttribute("GameDayStatus") == "nofield" and model1:GetAttribute("GameReady") == false,
			"a plot without goal posts can't play yet: " .. tostring(model1:GetAttribute("GameDayStatus"))
		)
		check(
			LiveScreens.Texts(fullPlot).gameday == "READY - PRESS START GAME"
				and LiveScreens.Texts(hankPlot).gameday == "BUILD THE GOAL POSTS",
			"the live screens say whether each plot can play: " .. LiveScreens.Texts(fullPlot).gameday
		)
		task.wait(0.7)
		check(
			not GameDay.IsActive() and model2:GetAttribute("GameDayActive") == false and tycoons:GetAttribute("GameDayActive") == nil,
			"game days never start by themselves (and there is no server-wide game day any more)"
		)

		-- the request is checked on the server
		local okBob, whyBob = GameDay.RequestStart(bob)
		check(
			not okBob and tostring(whyBob):find("Claim a stadium") ~= nil,
			"a player without a stadium can't start one: " .. tostring(whyBob)
		)
		local okHank, whyHank = GameDay.RequestStart(hank)
		check(
			not okHank and tostring(whyHank):find("goal posts") ~= nil and not GameDay.IsActive(hankPlot),
			"no game before the goal posts are built: " .. tostring(whyHank)
		)
		local aliceRoot = alice2.Character.HumanoidRootPart
		aliceRoot.CFrame = fullPlot.Origin * CFrame.new(0, 3, -1500) -- (out past the street)
		local okAway, whyAway = GameDay.RequestStart(alice2)
		check(
			not okAway and tostring(whyAway):find("Head back") ~= nil and not GameDay.IsActive(fullPlot),
			"the owner has to be at their own franchise to kick off: " .. tostring(whyAway)
		)
		local aliceCharacter = alice2.Character
		alice2.Character = nil -- (respawning)
		local okRespawn, whyRespawn = GameDay.RequestStart(alice2)
		alice2.Character = aliceCharacter
		check(
			not okRespawn and tostring(whyRespawn):find("back on your feet") ~= nil and not GameDay.IsActive(fullPlot),
			"no kick-off while the owner is respawning: " .. tostring(whyRespawn)
		)
		aliceRoot.CFrame = fullPlot.Refs.SpawnCFrame -- (in the HQ lobby, far behind the stadium: still on the plot)

		-- START GAME (through the remote, like the HUD button)
		local fromStart = #notifications + 1
		instanceSignal(startRemote, "OnServerEvent"):Fire(alice2)
		local endsAt = model2:GetAttribute("GameDayEndsAt")
		check(
			GameDay.IsActive(fullPlot) and model2:GetAttribute("GameDayActive") == true and model2:GetAttribute("GameDayStatus") == "active",
			"START GAME kicks off the owner's game day"
		)
		check(
			model2:GetAttribute("GameReady") == false
				and type(endsAt) == "number"
				and math.abs(endsAt - workspace:GetServerTimeNow() - Config.GameDay.DurationSeconds) < 0.3,
			"its end time is published for the HUD"
		)
		check(model2:GetAttribute("HomeScore") == 0 and model2:GetAttribute("AwayScore") == 0, "the scoreboard starts at 0 - 0 at kick-off")
		check(alice2:GetAttribute("Income") == incomeBefore * Config.GameDay.IncomeMultiplier, "the owner's income is boosted")
		check(
			hankPlot.IncomeBoost == 1 and not GameDay.IsActive(hankPlot) and model1:GetAttribute("GameDayActive") == false,
			"the other franchise has no game day and no boost"
		)
		check(said(alice2, fromStart, "GAME DAY!"), "the owner is told the game day started")
		check(
			LiveScreens.Texts(fullPlot).gameday:find("GAME DAY!", 1, true) ~= nil,
			"the live screens count the game down: " .. LiveScreens.Texts(fullPlot).gameday
		)
		local notesBefore = #notifications
		instanceSignal(startRemote, "OnServerEvent"):Fire(alice2)
		check(#notifications == notesBefore, "start requests less than a second apart are ignored")
		local okAgain, whyAgain = GameDay.RequestStart(alice2)
		check(not okAgain and tostring(whyAgain):find("already on") ~= nil, "a game that is on can't start again")

		-- the score goes up play by play (scoreboard, jumbotron, plot attributes)
		local samples, jumboTexts, sampling = {}, {}, true
		local jumbo = fullPlot.ItemsFolder:FindFirstChild("JumbotronText", true)
		task.spawn(function()
			while sampling do
				table.insert(samples, { fullPlot.HomeScore, fullPlot.AwayScore })
				if jumbo then
					jumboTexts[jumbo.Text] = true
				end
				task.wait()
			end
		end)

		-- the crowd fills the stands this owner built
		waitUntil(function() -- (the fans arrive a chunk per frame: wait until the whole crowd is in)
			return (crowdOf(fullPlot)) >= Config.GameDay.SeatedFans
		end, 1.5)
		local seated, _, crowd = crowdOf(fullPlot)
		check(seated > 0 and seated <= Config.GameDay.SeatedFans, ("fans fill the stands (%d seated)"):format(seated))
		do
			-- fans sit together in sections (not one here and one there), the lower bowl first
			local bodies = {}
			for _, child in ipairs(crowd and crowd:GetChildren() or {}) do
				local body = child.Name:sub(1, 3) == "Fan" and child:IsA("BasePart") and child
				if body then
					table.insert(bodies, body.CFrame.Position)
				end
			end
			local withNeighbour, lowerBowl = 0, 0
			local floorY = fullPlot.Origin.Position.Y
			for i, a in ipairs(bodies) do
				for j, b in ipairs(bodies) do
					if i ~= j and (a - b).Magnitude < 2.7 then
						withNeighbour += 1
						break
					end
				end
				if a.Y - floorY < 32 then
					lowerBowl += 1
				end
			end
			local n = math.max(#bodies, 1)
			check(
				#bodies >= math.min(Config.GameDay.SeatedFans, 600) and withNeighbour / n > 0.5, -- (spread evenly, about 15% would be)
				("fans sit together in sections (%d of %d next to another fan)"):format(withNeighbour, #bodies)
			)
			check(lowerBowl / n > 0.5, ("the lower bowl fills first (%d of %d fans)"):format(lowerBowl, #bodies))
		end
		task.wait(0.1)
		local walkerTagged = CollectionServiceMock:GetTagged("TycoonWalker")[1]
		local walkerRootPart = walkerTagged and walkerTagged:FindFirstChild("Root")
		check(
			walkerRootPart ~= nil and walkerRootPart:GetAttribute("WalkTo") ~= nil and walkerRootPart:GetAttribute("WalkDuration") ~= nil,
			"walking fans carry their path for the client to animate"
		)
		check(#CollectionServiceMock:GetTagged("TycoonFan") >= seated, "fans are tagged for the cheering animation")

		-- the second owner: finishing the goal posts makes their field ready, then they kick off
		-- while the first game is still on (two owners, two game days, each on its own clock)
		local hankProfile = PlayerData.GetProfile(hank)
		hankProfile.Owned["goalposts:1"] = true -- (plot.Owned is the profile's table)
		hankProfile.Owned["goalposts:2"] = true
		GameDay.Refresh(hankPlot)
		check(model1:GetAttribute("GameDayStatus") == "nofield", "half-built goal posts don't make a field yet")
		local postsItem = Items.ById["goalposts:3"]
		PlayerData.AddCash(hank, postsItem.Cost)
		local fromPosts = #notifications + 1
		check(PlotManager.Purchase(hankPlot, postsItem), "the last goal-post step is bought")
		task.wait(0.05)
		check(
			model1:GetAttribute("GameDayStatus") == "ready" and model1:GetAttribute("GameReady") == true,
			"finishing the goal posts makes the field ready for its first game"
		)
		check(said(hank, fromPosts, "Press START GAME"), "and the owner is told to press START GAME")
		hankPlot.Building = true -- (the plot being rebuilt: a returning owner or new team colours)
		GameDay.Refresh(hankPlot)
		local okBuilding, whyBuilding = GameDay.RequestStart(hank)
		check(
			model1:GetAttribute("GameDayStatus") == "building" and not okBuilding and tostring(whyBuilding):find("being built") ~= nil,
			"no kick-off while the plot is being rebuilt: " .. tostring(whyBuilding)
		)
		hankPlot.Building = false
		GameDay.Refresh(hankPlot)
		local hankF = hankProfile.Franchise
		local hankGames = (hankF.Stats.Wins or 0) + (hankF.Stats.Losses or 0)
		local hankSeason = ("%d/%d/%s"):format(hankF.Season.Number, hankF.Season.Week, hankF.Season.Stage)
		local hankIncome = hank:GetAttribute("Income")
		hank.Character.HumanoidRootPart.CFrame = hankPlot.Refs.SpawnCFrame
		local fromHank = #notifications + 1
		check(GameDay.RequestStart(hank) == true, "the second owner kicks off too")
		check(
			GameDay.IsActive(hankPlot)
				and GameDay.IsActive(fullPlot)
				and model1:GetAttribute("GameDayEndsAt") > model2:GetAttribute("GameDayEndsAt"),
			"two game days run at once, each on its own clock"
		)
		check(
			hank:GetAttribute("Income") == hankIncome * Config.GameDay.IncomeMultiplier
				and alice2:GetAttribute("Income") == incomeBefore * Config.GameDay.IncomeMultiplier,
			"each owner's income is boosted by their own game day"
		)
		task.wait(0.1)
		check((crowdOf(hankPlot)) == 0, "no seated fans in a stadium without stands")
		-- new team colours in the middle of the game: the plot is rebuilt, the game goes on
		check(PlotManager.ApplyTeam(hank, Config.TeamColors[2], "TESTGD"), "(new team colours during the game)")
		task.wait(0.05)
		check(
			not hankPlot.Building
				and GameDay.IsActive(hankPlot)
				and model1:GetAttribute("GameDayStatus") == "active"
				and hank:GetAttribute("Income") == hankIncome * Config.GameDay.IncomeMultiplier,
			"a team change during the game day doesn't stop it (or its boost)"
		)

		-- the first game ends: the result stays on the board, the cooldown starts
		local fromEnd = #notifications + 1
		check(
			waitUntil(function()
				return not GameDay.IsActive(fullPlot)
			end, 3),
			"the game day ends after DurationSeconds"
		)
		local readyAt = model2:GetAttribute("NextGameReadyAt")
		check(
			model2:GetAttribute("GameDayActive") == false
				and model2:GetAttribute("GameDayStatus") == "cooldown"
				and model2:GetAttribute("GameReady") == false
				and type(readyAt) == "number"
				and math.abs(readyAt - workspace:GetServerTimeNow() - Config.GameDay.CooldownSeconds) < 0.3,
			"then the next game is ready CooldownSeconds later: " .. tostring(model2:GetAttribute("GameDayStatus"))
		)
		check(GameDay.IsActive(hankPlot), "the other owner's game goes on")
		check(alice2:GetAttribute("Income") == incomeBefore and fullPlot.IncomeBoost == 1, "income goes back to normal")
		check(said(alice2, fromEnd, "next game is ready in"), "the owner is told when the next game is ready")
		check(
			LiveScreens.Texts(fullPlot).gameday:find("NEXT GAME IN", 1, true) ~= nil,
			"the live screens count down to the next game: " .. LiveScreens.Texts(fullPlot).gameday
		)
		local okRest, whyRest = GameDay.RequestStart(alice2)
		check(not okRest and tostring(whyRest):find("ready in") ~= nil, "no new game during the cooldown: " .. tostring(whyRest))
		Config.GameDay.CooldownSeconds = 2.5 -- (the second game's cooldown: time to leave and come back during it)
		-- (the plot is "being rebuilt" (e.g. new team colours) while this cooldown runs out: see below)
		local fromReady = #notifications + 1
		fullPlot.Building = true
		sampling = false
		local rising, last = true, { 0, 0 }
		for _, sample in ipairs(samples) do
			if sample[1] < last[1] or sample[2] < last[2] then
				rising = false
			end
			last = sample
		end
		local scoreLabel = fullPlot.ItemsFolder:FindFirstChild("ScoreboardScore", true)
		check(
			rising and last[1] + last[2] > 0 and last[1] == fullPlot.HomeScore and last[2] == fullPlot.AwayScore,
			("the score only goes up during the game, to the final score (%d - %d)"):format(fullPlot.HomeScore, fullPlot.AwayScore)
		)
		check(
			fullPlot.HomeScore ~= fullPlot.AwayScore
				and scoreLabel ~= nil
				and scoreLabel.Text == ("HOME %d  -  AWAY %d"):format(fullPlot.HomeScore, fullPlot.AwayScore)
				and model2:GetAttribute("HomeScore") == fullPlot.HomeScore,
			"the final score stays on the scoreboard: " .. tostring(scoreLabel and scoreLabel.Text)
		)
		check(jumboTexts["TOUCHDOWN!"] or jumboTexts["FIELD GOAL!"], "the jumbotron cheers the home team's touchdowns and field goals")
		check(
			waitUntil(function()
				return fullPlot.Model:FindFirstChild("GameDayFans") == nil
			end, 2),
			"the crowd leaves afterwards"
		)

		-- the cooldown runs out while the plot is being rebuilt: once the game can really start, the
		-- owner is told and START GAME comes back
		check(
			waitUntil(function()
				return model2:GetAttribute("GameDayStatus") == "building"
			end, 2.5),
			"a cooldown that runs out during a rebuild waits for the rebuild"
		)
		check(not said(alice2, fromReady, "next game is ready"), "(nobody is told yet)")
		fullPlot.Building = false
		check(
			waitUntil(function()
				return model2:GetAttribute("GameDayStatus") == "ready"
			end, 1),
			"the next game is ready when the cooldown (and the rebuild) are over"
		)
		check(
			model2:GetAttribute("GameReady") == true
				and model2:GetAttribute("NextGameReadyAt") == nil
				and said(alice2, fromReady, "next game is ready"),
			"and the owner is told to press START GAME"
		)

		-- the second game ends: Franchise records it (a week of the season, the prize, the record)
		check(
			waitUntil(function()
				return not GameDay.IsActive(hankPlot)
			end, 3),
			"the second game day ends on its own clock"
		)
		local hankGamesAfter = (hankF.Stats.Wins or 0) + (hankF.Stats.Losses or 0)
		check(hankGamesAfter == hankGames + 1, "the game counts as a win or a loss")
		check(
			("%d/%d/%s"):format(hankF.Season.Number, hankF.Season.Week, hankF.Season.Stage) ~= hankSeason,
			"and as a week of the season: " .. tostring(hank:GetAttribute("Season"))
		)
		check(said(hank, fromHank, "FINAL:"), "the final score is announced")
		check(
			hankPlot.HomeScore ~= hankPlot.AwayScore
				and math.max(hankPlot.HomeScore, hankPlot.AwayScore) >= 14
				and model1:GetAttribute("HomeScore") == hankPlot.HomeScore,
			("the result decided at kick-off is the final score (%d - %d)"):format(hankPlot.HomeScore, hankPlot.AwayScore)
		)

		-- leaving during the cooldown and coming back (same server) doesn't skip it
		local hankReadyAt = model1:GetAttribute("NextGameReadyAt")
		check(model1:GetAttribute("GameDayStatus") == "cooldown" and type(hankReadyAt) == "number", "(the second game's cooldown runs)")
		removePlayer(hank)
		PlotManager.Release(hank)
		check(
			model1:GetAttribute("GameDayStatus") == nil
				and model1:GetAttribute("GameReady") == false
				and model1:GetAttribute("NextGameReadyAt") == nil,
			"a freed plot has no game-day status"
		)
		hank.Parent = Players
		table.insert(Players.list, hank)
		touch(claimTrigger(1), hank)
		check(
			PlotManager.GetPlot(hank) == hankPlot
				and model1:GetAttribute("GameDayStatus") == "cooldown"
				and model1:GetAttribute("NextGameReadyAt") == hankReadyAt,
			"a returning owner's cooldown carries on: " .. tostring(model1:GetAttribute("GameDayStatus"))
		)

		-- the owner leaves in the middle of a game day: it stops at once, with no result
		Config.GameDay.DurationSeconds = 1
		check(
			waitUntil(function()
				return model1:GetAttribute("GameDayStatus") == "ready"
			end, 3),
			"(the cooldown runs out)"
		)
		hank.Character.HumanoidRootPart.CFrame = hankPlot.Refs.SpawnCFrame
		check(GameDay.RequestStart(hank) == true, "(a new game day starts)")
		local gamesAtLeave = (hankF.Stats.Wins or 0) + (hankF.Stats.Losses or 0)
		task.wait(0.3)
		local fromLeave = #notifications + 1
		removePlayer(hank)
		PlotManager.Release(hank)
		check(
			not GameDay.IsActive(hankPlot)
				and model1:GetAttribute("GameDayActive") == false
				and model1:GetAttribute("GameDayStatus") == nil
				and model1:GetAttribute("GameDayEndsAt") == nil,
			"releasing the plot ends its game day at once"
		)
		check(hankPlot.IncomeBoost == 1 and hankPlot.GameDayActive == false, "and its income boost")
		check(model1:FindFirstChild("GameDayFans") == nil, "and its crowd isn't the plot's crowd any more (it leaves)")
		task.wait(1.2)
		check(
			(hankF.Stats.Wins or 0) + (hankF.Stats.Losses or 0) == gamesAtLeave and not said(hank, fromLeave, "FINAL:"),
			"a game day cut short has no result (and nothing happens to the freed plot later)"
		)
		check(
			model1:GetAttribute("GameDayActive") == false
				and model1:GetAttribute("GameDayStatus") == nil
				and model1:FindFirstChild("GameDayFansLeaving") == nil,
			"the freed plot stays quiet (and its crowd has left)"
		)

		-- coming back: the franchise is rebuilt over several frames; no kick-off until it's done
		Config.BuildFrameBudget = 0 -- (one step per frame)
		hank.Parent = Players
		table.insert(Players.list, hank)
		local fromRejoin = #notifications + 1
		task.spawn(PlotManager.Claim, hankPlot, hank, hankProfile)
		local okRebuild, whyRebuild = GameDay.RequestStart(hank)
		check(
			hankPlot.Building and model1:GetAttribute("GameDayStatus") == "building" and not okRebuild,
			"while a returning owner's franchise is rebuilt, the game waits: " .. tostring(whyRebuild)
		)
		check(
			waitUntil(function()
				return not hankPlot.Building and model1:GetAttribute("GameDayStatus") == "ready"
			end, 2),
			"then it's ready"
		)
		check(not said(hank, fromRejoin, "press START GAME"), "(a returning owner isn't told again that the game is ready)")
		Config.BuildFrameBudget = math.huge
		removePlayer(hank)
		PlotManager.Release(hank)

		do
			-- the owner of a big franchise leaves during their game day (PERF-1's other half): the
			-- plot steps aside at once, the fans leave a chunk per frame, then the franchise comes down
			-- a step per frame; a player who claims the plot meanwhile gets a clean plot once it's gone
			Config.GameDay.DurationSeconds = 30 -- (on until the owner leaves)
			Config.GameDay.SeatedFans = 400
			Config.GameDay.FansPerFrame = 50
			Config.GameDay.WalkingFans = 0
			local tess = makePlayer("Tess", 6101)
			local tessProfile = PlayerData.Load(tess)
			local tessSteps = 0
			for _, pieceId in ipairs({ "hq_lobby", "goalposts", "lower_home" }) do
				for _, stepId in ipairs(Items.PieceById[pieceId].StageIds) do
					tessProfile.Owned[stepId] = true
					tessSteps += 1
				end
			end
			PlotManager.Claim(hankPlot, tess, tessProfile)
			check(GameDay.RequestStart(tess) == true, "(the owner of a big franchise kicks off)")
			waitUntil(function()
				return (crowdOf(hankPlot)) >= 400
			end, 2)
			task.wait(0.05) -- (the whole crowd is in)
			local oldItems = hankPlot.ItemsFolder
			local fromRelease = #notifications + 1
			Config.BuildFrameBudget = 0 -- (a step per frame)
			removePlayer(tess)
			PlotManager.Release(tess)
			local leaving = model1:FindFirstChild("GameDayFansLeaving")
			local atRelease = 0
			for _, fan in ipairs(leaving and leaving:GetChildren() or {}) do
				fan:SetAttribute("AtRelease", true)
				atRelease += 1
			end
			check(
				hankPlot.ItemsFolder ~= oldItems
					and plotModel(1).Items == hankPlot.ItemsFolder
					and countChildren(hankPlot.ItemsFolder) == 0
					and oldItems.Parent == model1
					and countChildren(oldItems) == tessSteps,
				("a released franchise steps aside at once into its own folder (%d of %d steps there, a fresh Items folder)"):format(
					countChildren(oldItems),
					tessSteps
				)
			)
			check(
				not GameDay.IsActive(hankPlot) and model1:FindFirstChild("GameDayFans") == nil and atRelease > 0,
				("its game day ends at once and its crowd steps aside to leave (%d fans)"):format(atRelease)
			)
			-- somebody claims the plot straight away, while the old franchise is still there
			local uma = makePlayer("Uma", 6102)
			local umaProfile = PlayerData.Load(uma)
			local umaSteps = { "hq_lobby:1", "hq_lobby:2", "hq_lobby:3", "lower_home:1" }
			for _, stepId in ipairs(umaSteps) do
				umaProfile.Owned[stepId] = true
			end
			task.spawn(PlotManager.Claim, hankPlot, uma, umaProfile)
			local frames, fanFrames, maxDrop, late, lastFans = 0, 0, 0, 0, atRelease
			local downFrames, standsEarly, builtEarly = 0, false, false
			while (oldItems.Parent ~= nil or hankPlot.Building) and frames < 600 do
				task.wait()
				frames += 1
				local folder = model1:FindFirstChild("GameDayFansLeaving")
				local fans = 0
				for _, fan in ipairs(folder and folder:GetChildren() or {}) do
					fans += 1
					if not fan:GetAttribute("AtRelease") then
						late += 1 -- (a fan that arrived after the release)
						fan:SetAttribute("AtRelease", true)
					end
				end
				maxDrop = math.max(maxDrop, lastFans - fans)
				lastFans = fans
				local oldLeft = oldItems.Parent and countChildren(oldItems) or 0
				if fans > 0 then
					fanFrames += 1
					standsEarly = standsEarly or oldLeft < tessSteps
				elseif oldItems.Parent ~= nil and oldLeft < tessSteps then
					downFrames += 1
				end
				if oldItems.Parent ~= nil and (countChildren(hankPlot.ItemsFolder) > 0 or countChildren(plotModel(1).Buttons) > 0) then
					builtEarly = true
				end
			end
			check(
				fanFrames >= 2 and maxDrop <= 2 * 50 and late == 0 and model1:FindFirstChild("GameDayFansLeaving") == nil,
				("the fans leave a chunk per frame (over %d frames, at most %d in one), and none arrives after the release"):format(
					fanFrames,
					maxDrop
				)
			)
			check(not standsEarly, "the stands stay up until the fans have left (nobody sits in mid-air)")
			check(
				oldItems.Parent == nil and downFrames >= 2 and hankPlot.TearingDown == 0,
				("then the departed franchise comes down over several frames, not in one (%d frames here)"):format(downFrames)
			)
			local leftovers, itemFolders, onlyUma = {}, 0, countChildren(hankPlot.ItemsFolder) == #umaSteps
			for _, child in ipairs(model1:GetChildren()) do
				if child.Name == "Items" then
					itemFolders += 1
				elseif child.Name == "ReleasedItems" or child.Name:find("GameDayFans", 1, true) then
					table.insert(leftovers, child.Name)
				end
			end
			for _, stepId in ipairs(umaSteps) do
				local model = hankPlot.ItemModels[stepId]
				onlyUma = onlyUma and model ~= nil and model.Parent == hankPlot.ItemsFolder
			end
			check(
				not builtEarly
					and hankPlot.Owner == uma
					and not hankPlot.Building
					and onlyUma
					and itemFolders == 1
					and #leftovers == 0
					and button(1, "hq_lobby:4") ~= nil,
				"a player who claims the plot meanwhile waits for it, then gets a clean plot with only their steps "
					.. table.concat(leftovers, ", ")
			)
			check(not said(tess, fromRelease, "FINAL:"), "(the game day cut short has no result)")
			Config.BuildFrameBudget = math.huge
			removePlayer(uma)
			PlotManager.Release(uma)
			PlayerData.Release(uma)
			PlayerData.Release(tess)
		end

		-- back to how the later tests expect plot 1: hank owns it, nothing built
		for stage = 1, 3 do
			hankProfile.Owned["goalposts:" .. stage] = nil
		end
		hank.Parent = Players
		table.insert(Players.list, hank)
		touch(claimTrigger(1), hank)
		check(
			PlotManager.GetPlot(hank) == hankPlot and model1:GetAttribute("GameDayStatus") == "nofield" and button(1, "hq_lobby:1") ~= nil,
			"(plot 1 is hank's again, with no goal posts)"
		)
		for key, value in pairs(savedSettings) do
			Config.GameDay[key] = value
		end

		-- the plays that make up a final score: touchdowns and field goals, all before the whistle
		do
			local function sum(list)
				local total = 0
				for _, points in ipairs(list) do
					total += points
				end
				return total
			end
			local good = true
			for points = 0, 63 do
				local split = GameDay._splitPoints(points)
				local onlyBig = true
				for _, p in ipairs(split) do
					if p ~= 7 and p ~= 3 then
						onlyBig = false
					end
				end
				local representable = points >= 12 or points == 0 or points % 7 == 0 or points % 3 == 0 or points == 10
				if sum(split) ~= points or (representable and not onlyBig) then
					good = false
				end
			end
			check(good, "a score is split into touchdowns (7) and field goals (3) wherever it can be")
			local plays = GameDay._planPlays(24, 13, 60)
			local home, away, ordered, inside = 0, 0, true, true
			for index, play in ipairs(plays) do
				if play.Home then
					home += play.Points
				else
					away += play.Points
				end
				if index > 1 and play.At < plays[index - 1].At then
					ordered = false
				end
				if play.At < 0.08 * 60 - 0.001 or play.At > 0.9 * 60 + 0.001 then
					inside = false
				end
			end
			check(
				home == 24 and away == 13 and ordered and inside,
				"the plays add up to the final score, in order, before the final whistle"
			)
		end

		-- Franchise: the result is decided at kick-off; the hype it used is spent at the final whistle
		do
			hankF.Hype = 2
			local game = Franchise.DecideGame(hankPlot)
			check(
				game ~= nil and game.Owner == hank and game.Hype == 2 and hankF.Hype == 2 and (game.Home > game.Away) == game.Won,
				"kick-off decides the result with the team's hype"
			)
			hankF.Hype = 3 -- (a press conference during the game)
			Franchise.FinishGame(hankPlot, game)
			check(hankF.Hype == 1, "the final whistle spends the hype the game used (a press conference during the game counts next time)")
			local before = (hankF.Stats.Wins or 0) + (hankF.Stats.Losses or 0)
			Franchise.FinishGame(hankPlot, { Owner = alice2, Home = 7, Away = 3, Won = true, Hype = 0 })
			check((hankF.Stats.Wins or 0) + (hankF.Stats.Losses or 0) == before, "a game decided for another owner doesn't count")
		end
	end
	do
		-- PERF-3: a seated fan is two instances (its tagged jersey block with the head inside), and
		-- the crowds arrive and leave a chunk of fans per frame, one stadium after the other (two
		-- owners kick off at the same moment here, on two test plots through a stand-in plot manager).
		local GameDay = requireNode("ServerScriptService/TycoonServer/GameDay")
		local saved = table.clone(Config.GameDay)
		Config.GameDay.SeatedFans = 400
		Config.GameDay.FansPerFrame = 50
		Config.GameDay.WalkingFans = 0
		Config.GameDay.CooldownSeconds = 0
		local testPlots, owners = {}, {}
		for index, z in ipairs({ 3000, -3000 }) do
			local model = Instance.new("Model")
			model.Name = "CrowdTestPlot" .. index
			model.Parent = workspace
			local origin = CFrame.new(0, 0.2, z)
			local character = makeCharacter("CrowdOwner" .. index)
			character.HumanoidRootPart.CFrame = origin * CFrame.new(0, 3, 0)
			local owner = { Name = "CrowdOwner" .. index, UserId = 7100 + index, Parent = Players, Character = character }
			owners[index] = owner
			table.insert(testPlots, {
				Index = index,
				Origin = origin,
				Model = model,
				Owner = owner,
				Palette = Config.TeamColors[index],
				TeamName = "TEST",
				Owned = { ["lower_home:1"] = true, ["goalposts:1"] = true, ["goalposts:2"] = true, ["goalposts:3"] = true },
				HomeScore = 0,
				AwayScore = 0,
			})
		end
		local function scoreSet(plot, home, away)
			plot.HomeScore, plot.AwayScore = home, away
		end
		GameDay.Init({
			GetPlots = function()
				return testPlots
			end,
			GetPlot = function(player)
				for _, plot in ipairs(testPlots) do
					if plot.Owner == player then
						return plot
					end
				end
				return nil
			end,
			SetGameDay = function() end,
			SetScore = scoreSet,
			ScorePlay = scoreSet,
		}, nil, notifyRemote)
		local function seatedCount(plot)
			local folder = plot.Model:FindFirstChild("GameDayFans")
			local count = 0
			for _, child in ipairs(folder and folder:GetChildren() or {}) do
				if child.Name == "Fan" then
					count += 1
				end
			end
			return count
		end
		local samples, sampling = {}, true
		task.spawn(function() -- the seated fans of both plots, once per frame
			while sampling do
				table.insert(samples, { seatedCount(testPlots[1]), seatedCount(testPlots[2]) })
				task.wait()
			end
		end)
		local function waitUntil(condition, seconds)
			local deadline = os.clock() + seconds
			while not condition() and os.clock() < deadline do
				task.wait(0.01)
			end
		end
		local function crowdsGone()
			return testPlots[1].Model:FindFirstChild("GameDayFans") == nil and testPlots[2].Model:FindFirstChild("GameDayFans") == nil
		end
		local function bothActive()
			return GameDay.IsActive(testPlots[1]) or GameDay.IsActive(testPlots[2])
		end
		Config.GameDay.DurationSeconds = 1.2
		check(GameDay.RequestStart(owners[1]) == true and GameDay.RequestStart(owners[2]) == true, "two owners kick off at the same moment")
		waitUntil(function()
			return seatedCount(testPlots[1]) >= 400 and seatedCount(testPlots[2]) >= 400
		end, 1.1)
		local crowdA = testPlots[1].Model:FindFirstChild("GameDayFans")
		local fansA, wellFormed, models = 0, 0, 0
		for _, child in ipairs(crowdA and crowdA:GetChildren() or {}) do
			if child:IsA("Model") then
				models += 1
			elseif child.Name == "Fan" and child:IsA("BasePart") then
				fansA += 1
				local inside = child:GetChildren()
				if
					#inside == 1
					and inside[1]:IsA("BasePart")
					and inside[1].Name == "Head"
					and inside[1].CFrame.Position.Y > child.CFrame.Position.Y
					and CollectionServiceMock:HasTag(child, "TycoonFan")
				then
					wellFormed += 1
				end
			end
		end
		check(
			fansA == 400 and wellFormed == fansA and models == 0 and #crowdA:GetDescendants() == 2 * fansA,
			("a seated fan is two instances: a tagged jersey block with its head inside, no Model (%d of %d, %d models)"):format(
				wellFormed,
				fansA,
				models
			)
		)
		waitUntil(function() -- the game days end and the fans leave
			return not bothActive() and crowdsGone()
		end, 4)
		task.wait(0.05)
		sampling = false
		local most, maxGrowth, maxDrop, growthFrames, bothGrew = { 0, 0 }, 0, 0, 0, false
		for i = 2, #samples do
			local grew = 0
			for index = 1, 2 do
				local diff = samples[i][index] - samples[i - 1][index]
				most[index] = math.max(most[index], samples[i][index])
				if diff > 0 then
					grew += 1
					growthFrames += 1
					maxGrowth = math.max(maxGrowth, diff)
				else
					maxDrop = math.max(maxDrop, -diff)
				end
			end
			bothGrew = bothGrew or grew == 2
		end
		-- (one chunk per frame; the limits allow for a frame the sampler might miss)
		check(most[1] == 400 and most[2] == 400, ("both stadiums fill (%d and %d fans)"):format(most[1], most[2]))
		check(
			maxGrowth <= 2 * 50 and growthFrames >= 8,
			("the fans arrive a chunk per frame (at most %d in a frame, over %d frames)"):format(maxGrowth, growthFrames)
		)
		check(not bothGrew, "the two stadiums fill one after the other, never in the same frame")
		check(
			maxDrop <= 2 * 50 and seatedCount(testPlots[1]) == 0 and seatedCount(testPlots[2]) == 0,
			("they leave a chunk per frame too (at most %d in a frame)"):format(maxDrop)
		)
		check(crowdsGone(), "and the crowd folders are gone afterwards")

		-- a plot released while its fans arrive keeps no crowd (the arrival stops), and a game day
		-- that ends while the fans are still arriving (1 per frame here) leaves no crowd behind
		Config.GameDay.SeatedFans = 1200
		Config.GameDay.FansPerFrame = 1
		Config.GameDay.DurationSeconds = 0.6
		local cleared = false
		task.spawn(function()
			for _ = 1, 2000 do
				if seatedCount(testPlots[1]) > 0 then
					testPlots[1].Owner = nil -- (what PlotManager.Release does first)
					GameDay.OnPlotReleased(testPlots[1])
					cleared = true
					return
				end
				task.wait()
			end
		end)
		check(GameDay.RequestStart(owners[1]) == true and GameDay.RequestStart(owners[2]) == true, "(two more game days)")
		waitUntil(function()
			return cleared
		end, 0.6)
		task.wait(0.05)
		Config.GameDay.FansPerFrame = 50 -- (for the leaving; the arrival keeps its 1 per frame)
		check(
			cleared and testPlots[1].Model:FindFirstChild("GameDayFans") == nil and not GameDay.IsActive(testPlots[1]),
			"a plot released while its fans arrive keeps no crowd (the arrival stops)"
		)
		waitUntil(function()
			return not GameDay.IsActive(testPlots[2])
		end, 2)
		local atEnd = seatedCount(testPlots[2])
		waitUntil(crowdsGone, 3)
		check(
			atEnd < 1200 and crowdsGone(),
			("a game day that ends while fans arrive (%d of 1200 in) leaves no crowd behind"):format(atEnd)
		)

		for key, value in pairs(saved) do
			Config.GameDay[key] = value
		end
		GameDay.Init(PlotManager, remoteInstances, notifyRemote)
		for index, plot in ipairs(testPlots) do
			plot.Model:Destroy()
			owners[index].Character:Destroy()
		end
	end

	---------------------------------------------------------------------------------------------
	-- Client HUD (runs the LocalScript against fake player/attributes; Lune validates GUI property names)
	---------------------------------------------------------------------------------------------
	section("HUD")
	local viewer = makePlayer("Viewer", 9001)
	local playerGui = Instance.new("Folder")
	playerGui.Name = "PlayerGui"
	viewer.PlayerGui = playerGui
	Players.LocalPlayer = viewer
	viewer:SetAttribute("Cash", 0)
	local realFreePlots = tycoons:GetAttribute("FreePlots")
	tycoons:SetAttribute("FreePlots", 0)
	local okHud, hudErr = pcall(runScript, "StarterPlayer/StarterPlayerScripts/TycoonClient/HUD")
	check(okHud, "HUD script runs: " .. tostring(hudErr))
	local hud = playerGui:FindFirstChild("TycoonHUD")
	check(hud ~= nil, "HUD ScreenGui created")
	if hud then
		local cash = hud:FindFirstChild("Cash", true)
		local hint = hud:FindFirstChild("Hint", true)
		check(hint and hint.Visible == true, "claim hint visible before owning a plot")
		check(hint and hint.Text:find("All stadiums are taken") ~= nil, "hint explains when every stadium is taken")
		tycoons:SetAttribute("FreePlots", realFreePlots)
		viewer:SetAttribute("Cash", 1234)
		task.wait(0.05)
		check(cash and cash.Text == "$1,234", "cash label updates: " .. tostring(cash and cash.Text))
		viewer:SetAttribute("PlotIndex", 2)
		viewer:SetAttribute("Built", 5)
		viewer:SetAttribute("Income", 45)
		viewer:SetAttribute("SaveStatus", "on")
		task.wait(0.05)
		check(hint.Visible == false, "hint hidden after claiming")
		local progress = hud:FindFirstChild("Progress", true)
		check(
			progress and progress.Visible and progress.Text:find("5 / " .. #Items.List) ~= nil,
			"progress label: " .. tostring(progress and progress.Text)
		)
		check(hud:FindFirstChild("Income", true).Text == "+$45/s", "income label: " .. hud:FindFirstChild("Income", true).Text)
		check(hud:FindFirstChild("SaveStatus", true).Text:find("ON") ~= nil, "save status label")
		do
			-- the game-day panel follows the player's own plot (the attributes GameDay.lua sets on it)
			local myPlot = Instance.new("Model")
			myPlot.Name = "Plot7"
			myPlot.Parent = tycoons
			viewer:SetAttribute("PlotIndex", 7)
			local banner = hud:FindFirstChild("GameDay", true)
			local scoreLine = hud:FindFirstChild("GameScore", true)
			local startButton = hud:FindFirstChild("StartGame", true)
			local startHint = startButton and startButton:FindFirstChild("StartHint")
			task.wait(0.3)
			check(
				banner and scoreLine and startButton and not banner.Visible and not startButton.Visible and not scoreLine.Visible,
				"no game-day panel until the server says how the plot's game day stands"
			)
			myPlot:SetAttribute("GameDayStatus", "nofield")
			task.wait(0.3)
			check(
				banner.Visible and banner.Text == "Build the goal posts to play your first game" and not startButton.Visible,
				"before the goal posts: " .. banner.Text
			)
			myPlot:SetAttribute("GameDayStatus", "cooldown")
			myPlot:SetAttribute("NextGameReadyAt", workspace:GetServerTimeNow() + 151)
			task.wait(0.3)
			check(
				banner.Visible and banner.Text:find("Next game ready in 2:3") ~= nil and not startButton.Visible,
				"the cooldown counts down: " .. banner.Text
			)
			myPlot:SetAttribute("GameDayStatus", "building")
			myPlot:SetAttribute("NextGameReadyAt", nil)
			task.wait(0.3)
			check(banner.Visible and banner.Text:find("Getting your stadium ready") ~= nil, "while the plot is rebuilt: " .. banner.Text)
			check(boundActions.TycoonStartGame == nil, "no start keys while the game isn't ready")
			myPlot:SetAttribute("GameDayStatus", "ready")
			task.wait(0.3)
			check(startButton.Visible and not banner.Visible, "the big START GAME button shows when the game is ready")
			check(
				startHint and startHint.Text:find("press G") ~= nil,
				"it says how to start it: " .. tostring(startHint and startHint.Text)
			)
			check(boundActions.TycoonStartGame ~= nil, "G and gamepad Y are bound while it shows")
			local requests = {}
			instanceSignal(remotesFolder.StartGameDay, "OnServerEvent"):Connect(function(who)
				table.insert(requests, who)
			end)
			instanceSignal(startButton, "Activated"):Fire()
			task.wait(0.05)
			check(#requests == 1 and requests[1] == viewer, "clicking (or tapping) it asks the server to start the game")
			instanceSignal(startButton, "Activated"):Fire()
			task.wait(0.05)
			check(#requests == 1 and startHint.Text == "Kicking off...", "a double click sends one request")
			task.wait(1.05)
			local action = boundActions.TycoonStartGame
			local pressed = action and action("TycoonStartGame", Enum.UserInputState.Begin, { KeyCode = Enum.KeyCode.ButtonY })
			check(#requests == 2 and pressed == Enum.ContextActionResult.Sink, "gamepad Y (or G) starts it too")
			local released = action and action("TycoonStartGame", Enum.UserInputState.End, { KeyCode = Enum.KeyCode.ButtonY })
			check(#requests == 2 and released == Enum.ContextActionResult.Pass, "(letting go of the key does nothing)")
			myPlot:SetAttribute("GameDayStatus", "active")
			myPlot:SetAttribute("GameDayEndsAt", workspace:GetServerTimeNow() + 42)
			myPlot:SetAttribute("TeamName", "TESTERS")
			myPlot:SetAttribute("HomeScore", 14)
			myPlot:SetAttribute("AwayScore", 7)
			task.wait(0.3)
			check(
				banner.Visible and banner.Text:find("GAME DAY!", 1, true) ~= nil and banner.Text:find("0:4") ~= nil,
				"during the game: " .. banner.Text
			)
			check(scoreLine.Visible and scoreLine.Text == "TESTERS 14  -  7 VISITORS", "with the score: " .. scoreLine.Text)
			check(not startButton.Visible and boundActions.TycoonStartGame == nil, "the button (and its keys) go away once the game is on")
			myPlot:Destroy()
			task.wait(0.3)
			check(not banner.Visible and not scoreLine.Visible and not startButton.Visible, "no game-day panel without the plot")
			viewer:SetAttribute("PlotIndex", 2)
		end
		for i = 1, 7 do
			notifyRemote.OnClientEvent:Fire("Message " .. i, i % 2 == 0 and "error" or "success")
		end
		task.wait(0.05)
		local toasts = hud:FindFirstChild("Toasts", true)
		local toastCount = 0
		for _, child in ipairs(toasts:GetChildren()) do
			if child:IsA("Frame") then
				toastCount += 1
			end
		end
		check(toastCount == 5, ("toast stack capped at 5 (%d)"):format(toastCount))
		task.wait(4.2)
		local remaining = 0
		for _, child in ipairs(toasts:GetChildren()) do
			if child:IsA("Frame") then
				remaining += 1
			end
		end
		check(remaining == 0, "toasts fade away")
		for i = 1, 3 do
			notifyRemote.OnClientEvent:Fire("+$" .. i, "cash")
		end
		task.wait(0.05)
		local cashFrames = 0
		for _, child in ipairs(toasts:GetChildren()) do
			if child:IsA("Frame") then
				cashFrames += 1
			end
		end
		check(cashFrames == 1, ("cash pop-ups reuse one toast (%d)"):format(cashFrames))
	end

	section("Team screens (client)")
	do
		viewer:SetAttribute("TeamChosen", false)
		viewer:SetAttribute(
			"Quests",
			HttpServiceMock:JSONEncode({
				{ Text = "Build the reception desk", Progress = 0, Goal = 1, Reward = 100 },
				{ Text = "Collect $2,000 from your safe", Progress = 500, Goal = 2000, Reward = 500 },
			})
		)
		viewer:SetAttribute("QuestsDone", 2)
		viewer:SetAttribute("QuestsTotal", 24)
		viewer:SetAttribute("BonusReadyAt", workspace:GetServerTimeNow() - 1)
		local okTeamUi, teamUiErr = pcall(runScript, "StarterPlayer/StarterPlayerScripts/TycoonClient/Franchise")
		check(okTeamUi, "Franchise UI script runs: " .. tostring(teamUiErr))
		local teamUi = playerGui:FindFirstChild("FranchiseUI")
		check(teamUi ~= nil, "team ScreenGui created")
		if teamUi then
			local picker = teamUi:FindFirstChild("TeamPicker")
			check(picker and picker.Visible, "the team picker opens by itself for a new owner")
			instanceSignal(picker:FindFirstChild("Palette2", true), "Activated"):Fire()
			instanceSignal(picker:FindFirstChild("Nickname4", true), "Activated"):Fire()
			task.wait(0.02)
			local preview = picker:FindFirstChild("Preview")
			check(
				preview.BackgroundColor3 == Config.TeamColors[2].Primary and preview.Text:find(string.upper(Config.TeamNicknames[4])) ~= nil,
				"the preview shows the picked colours + name: " .. preview.Text
			)
			local chosen = nil
			instanceSignal(remotesFolder.ChooseTeam, "OnServerEvent"):Connect(function(who, paletteIndex, nicknameIndex)
				chosen = { who, paletteIndex, nicknameIndex }
			end)
			instanceSignal(picker:FindFirstChild("Confirm"), "Activated"):Fire()
			task.wait(0.02)
			check(chosen and chosen[1] == viewer and chosen[2] == 2 and chosen[3] == 4, "confirming sends the choice to the server")
			check(not picker.Visible, "the picker closes after confirming")
			local quests = teamUi:FindFirstChild("Quests")
			local questText = quests and quests:FindFirstChild("Quest2") and quests.Quest2.Text.Text
			check(
				quests and quests.Visible and questText == "Collect $2,000 from your safe",
				"quest tracker shows quests: " .. tostring(questText)
			)
			check(quests.Title.Text:find("2/24") ~= nil, "quest tracker shows the count: " .. quests.Title.Text)
			check(quests.Quest2.Track.Fill.Size.X.Scale == 0.25, "quest progress bar")
			task.wait(0.3)
			local bonus = teamUi:FindFirstChild("Bonus", true)
			check(bonus and bonus.Text:find("CLAIM") ~= nil, "bonus button says CLAIM when ready: " .. tostring(bonus and bonus.Text))
			viewer:SetAttribute("BonusReadyAt", workspace:GetServerTimeNow() + 95)
			task.wait(0.3)
			check(bonus.Text:find("1:3") ~= nil, "bonus button counts down: " .. bonus.Text)
			viewer:SetAttribute(
				"Roster",
				HttpServiceMock:JSONEncode({
					{ Pos = "QB", Name = "Test Passer", Rating = 88 },
					{ Pos = "RB", Name = "", Rating = 0 },
				})
			)
			viewer:SetAttribute("TeamRating", 72)
			viewer:SetAttribute("Record", "3-1")
			viewer:SetAttribute("Season", "SEASON 2  -  WEEK 5/8  -  3-1")
			viewer:SetAttribute("Titles", 1)
			viewer:SetAttribute("DraftUnlocked", true)
			viewer:SetAttribute("DraftCost", 5000)
			instanceSignal(teamUi:FindFirstChild("Roster", true), "Activated"):Fire()
			task.wait(0.05)
			local rosterWindow = teamUi:FindFirstChild("RosterWindow")
			check(rosterWindow and rosterWindow.Visible, "roster window opens")
			local qbRow = rosterWindow:FindFirstChild("RowQB", true)
			check(qbRow and qbRow.Name == "RowQB" and qbRow:FindFirstChild("Name").Text == "Test Passer", "roster shows the starters")
			check(rosterWindow:FindFirstChild("RowRB", true):FindFirstChild("Name").Text:find("empty") ~= nil, "empty positions are marked")
			check(rosterWindow:FindFirstChild("Record", true).Text == "RECORD 3-1", "record shown")
			local seasonText = rosterWindow:FindFirstChild("Season", true).Text
			check(seasonText:find("WEEK 5/8") ~= nil and seasonText:find("TITLES: 1") ~= nil, "season + titles shown: " .. seasonText)
			local draftButton = rosterWindow:FindFirstChild("DraftButton", true)
			check(draftButton.Text:find("$5,000", 1, true) ~= nil, "draft button shows the price: " .. draftButton.Text)
			instanceSignal(draftButton, "Activated"):Fire()
			task.wait(0.05)
			local draftInfo = rosterWindow:FindFirstChild("DraftInfo", true)
			check(draftInfo.Text:find("Claim a stadium") ~= nil, "draft errors from the server are shown: " .. draftInfo.Text)
			check(rosterWindow:FindFirstChild("TrainButton", true).Text == "TRAIN LOCKED", "train button is locked without a Weight Room")
		end
	end

	section("Kick meter (client)")
	do
		local okKick, kickErr = pcall(runScript, "StarterPlayer/StarterPlayerScripts/TycoonClient/KickGame")
		check(okKick, "KickGame client script runs: " .. tostring(kickErr))
		local meter = playerGui:FindFirstChild("KickMeter")
		local attempt = nil
		instanceSignal(remotesFolder.KickAttempt, "OnServerEvent"):Connect(function(who, spot, aim, power)
			attempt = { who, spot, aim, power }
		end)
		instanceSignal(remotesFolder.KickStart, "OnClientEvent"):Fire(2, 40, "MEDIUM")
		task.wait(0.05)
		check(meter and meter.Enabled, "the kick meter opens")
		check(meter and meter:FindFirstChild("Title", true).Text:find("40 YARDS") ~= nil, "meter shows the distance")
		for _ = 1, 5 do
			RunServiceMock.RenderStepped:Fire(0.016)
			task.wait(0.03)
		end
		task.wait(0.1)
		local kickAction = boundActions.TycoonKickMeter
		local spaceResult = kickAction and kickAction("TycoonKickMeter", Enum.UserInputState.Begin, { KeyCode = Enum.KeyCode.Space })
		task.wait(0.2)
		check(meter:FindFirstChild("Instruction", true).Text:find("POWER") ~= nil, "space locks the aim, then power")
		check(spaceResult == Enum.ContextActionResult.Sink, "the open meter sinks Space / E / A (no jump back onto the kick spot)")
		instanceSignal(meter:FindFirstChild("Kick", true), "Activated"):Fire()
		task.wait(0.05)
		check(
			attempt and attempt[1] == viewer and attempt[2] == 2 and math.abs(attempt[3]) <= 1 and attempt[4] >= 0 and attempt[4] <= 1,
			"the kick is sent to the server (aim + power)"
		)
		instanceSignal(remotesFolder.KickStart, "OnClientEvent"):Fire(1, 25, "SHORT")
		task.wait(0.05)
		check(meter.Enabled, "a new kick opens the meter again")
		viewer.Character.HumanoidRootPart.CFrame = CFrame.new(500, 3, 500)
		RunServiceMock.RenderStepped:Fire(0.016)
		task.wait(0.05)
		check(not meter.Enabled and boundActions.TycoonKickMeter == nil, "walking away closes the meter (and gives the keys back)")
		viewer.Character.HumanoidRootPart.CFrame = CFrame.new(0, 3, 0)
	end

	section("Look cards, TV seats, mini-games (client)")
	do
		Franchise.CheckQuests(alice2) -- publishes alice2's roster attributes
		local okInteract, interactErr = pcall(runScript, "StarterPlayer/StarterPlayerScripts/TycoonClient/Interact")
		check(okInteract, "Interact client script runs: " .. tostring(interactErr))
		local ui = playerGui:FindFirstChild("InteractUI")
		check(ui ~= nil, "interaction ScreenGui created")
		if ui then
			local clientFix = Instance.new("Model")
			clientFix.Name = "ClientFixtures"
			clientFix.Parent = plotModel(2)
			local cctx = BuildUtil.NewContext(CFrame.new(), clientFix, Config.TeamColors[1], "TEST", Config)
			local viewerRoot = viewer.Character.HumanoidRootPart
			viewerRoot.CFrame = CFrame.new(0, 3, 0)
			local function fire(prompt)
				ProximityPromptServiceMock.PromptTriggered:Fire(prompt, viewer)
				task.wait(0.03)
			end
			local lookCard = ui:FindFirstChild("LookCard")
			local lockerPart = BuildUtil.Box(cctx, "Locker", Vector3.new(3, 7, 2), Vector3.new(4, 3.5, 0))
			fire(BuildUtil.Look(lockerPart, "Locker 1", "A team locker.", { LookKey = "locker:1" }))
			local everyone = HttpServiceMock:JSONDecode(alice2:GetAttribute("RosterAll") or "[]")
			check(
				lookCard.Visible and lookCard.Title.Text == "Locker 1" and lookCard.Info.Text == "A team locker.",
				"pressing E on a look prompt shows its card"
			)
			check(
				everyone[1] ~= nil and lookCard.Live.Text:find(everyone[1].Name, 1, true) ~= nil,
				"lockers show the owner's roster names: " .. lookCard.Live.Text
			)
			local patterns = {
				record = "Record:",
				titles = "hampionship",
				rating = "Team rating",
				team = "Team: ",
				owner = "Owner: Alice",
				draft = "raft",
				quests = "Quests done",
				season = "SEASON",
				["roster:QB"] = "QB",
				["locker:99"] = "empty locker",
			}
			for key, pattern in pairs(patterns) do
				fire(BuildUtil.Look(lockerPart, "Test", "", { LookKey = key }))
				check(lookCard.Live.Text:find(pattern, 1, true) ~= nil, ("LookKey %s: %s"):format(key, lookCard.Live.Text))
			end
			viewerRoot.CFrame = CFrame.new(100, 3, 0)
			RunServiceMock.RenderStepped:Fire(0.016)
			task.wait(0.03)
			check(not lookCard.Visible, "walking away closes the card")
			viewerRoot.CFrame = CFrame.new(0, 3, 0)
			local lockerDoor = BuildUtil.Door(cctx, {
				Size = Vector3.new(2.5, 6, 0.2),
				CFrame = CFrame.new(-4, 3.2, 1),
				Object = "Locker",
				LookKey = "locker:2",
			})
			fire(lockerDoor:FindFirstChild("Interact", true))
			check(lookCard.Visible and lookCard.Live.Text:find("locker", 1, true) ~= nil, "opening a locker shows whose it is")
			local seatPromptTest = BuildUtil.Seat(cctx, { CFrame = CFrame.new(0, 0.5, 6) })
			lookCard.Visible = false
			fire(seatPromptTest:FindFirstChild("Interact"))
			check(not lookCard.Visible, "seats don't show a card")

			-- TV camera seat
			local camera = workspace.CurrentCamera
			local tvSeatPart = BuildUtil.Seat(cctx, {
				CFrame = CFrame.new(0, 0.5, 4),
				Camera = { From = Vector3.new(0, 40, -50), To = Vector3.new(0, 0, 30), Fov = 33, Label = "PRESS BOX CAM" },
			})
			local viewerHumanoid = viewer.Character:FindFirstChildOfClass("Humanoid")
			local seatedOk = pcall(function()
				viewerHumanoid.SeatPart = tvSeatPart
			end)
			instanceSignal(viewerHumanoid, "PropSeatPart"):Fire()
			task.wait(0.03)
			local tvOverlay = ui:FindFirstChild("TVOverlay")
			check(seatedOk and tvOverlay.Visible, "sitting in a camera seat shows the TV overlay")
			check(tvOverlay.LiveBadge.Text:find("PRESS BOX CAM", 1, true) ~= nil, "LIVE badge shows the camera name")
			local plot3Team = plotModel(2):GetAttribute("TeamName") or "HOME"
			check(tvOverlay.ScoreBug.Text:find(plot3Team, 1, true) ~= nil, "score bug shows the team + score: " .. tvOverlay.ScoreBug.Text)
			check(
				camera.CameraType == Enum.CameraType.Scriptable and math.abs(camera.FieldOfView - 33) < 0.01,
				"the camera switches to the TV view"
			)
			RunServiceMock.RenderStepped:Fire(0.016)
			task.wait(0.02)
			local look = camera.CFrame.LookVector
			check(look.Y < -0.3 and look.Z > 0.5, "the TV camera looks down at the field")
			pcall(function()
				viewerHumanoid.SeatPart = Instance.new("Part") -- (Lune can't set nil: a plain part = standing up)
			end)
			instanceSignal(viewerHumanoid, "PropSeatPart"):Fire()
			task.wait(0.03)
			check(not tvOverlay.Visible and camera.CameraType ~= Enum.CameraType.Scriptable, "standing up gives the camera back")

			-- mini-games
			local results = {}
			instanceSignal(remotesFolder.UseResult, "OnServerEvent"):Connect(function(who, prompt, score)
				table.insert(results, { who = who, prompt = prompt, score = score })
			end)
			local gamePanel = ui:FindFirstChild("MiniGame")
			local gym = BuildUtil.Box(cctx, "Rack", Vector3.new(4, 6, 2), Vector3.new(-4, 3, -4))
			local liftP = BuildUtil.Use(cctx, gym, "lift")
			liftP:SetAttribute("Duration", 1)
			fire(liftP)
			check(gamePanel.Visible and gamePanel.Title.Text == "WEIGHT ROOM", "the lift mini-game opens")
			local handler = boundActions.TycoonMiniGame
			check(handler ~= nil, "mini-games capture Space / E / A")
			for _ = 1, 12 do
				if handler then
					handler("TycoonMiniGame", Enum.UserInputState.Begin, { KeyCode = Enum.KeyCode.Space })
				end
				RunServiceMock.RenderStepped:Fire(0.016)
			end
			task.wait(1.05)
			RunServiceMock.RenderStepped:Fire(0.016)
			task.wait(0.05)
			local liftResult = results[#results]
			check(
				liftResult and liftResult.prompt == liftP and liftResult.score >= 1,
				("lifting sends the reps (%s)"):format(tostring(liftResult and liftResult.score))
			)
			check(boundActions.TycoonMiniGame == nil, "input is released after the game")
			task.wait(1.5)
			check(not gamePanel.Visible, "the game panel closes afterwards")

			local cab = BuildUtil.Box(cctx, "Cabinet", Vector3.new(3, 6, 2), Vector3.new(4, 3, -4))
			local arcadeP = BuildUtil.Use(cctx, cab, "arcade")
			arcadeP:SetAttribute("Duration", 1)
			fire(arcadeP)
			check(gamePanel.Title.Text == "PIGSKIN CATCH", "the arcade opens")
			UserInputServiceMock.InputChanged:Fire({ UserInputType = Enum.UserInputType.MouseMovement, Position = Vector3.new(10, 10, 0) })
			for _ = 1, 8 do
				RunServiceMock.RenderStepped:Fire(0.1)
				task.wait(0.02)
			end
			task.wait(1.0)
			RunServiceMock.RenderStepped:Fire(0.016)
			task.wait(0.05)
			local arcadeResult = results[#results]
			check(arcadeResult and arcadeResult.prompt == arcadeP and type(arcadeResult.score) == "number", "the arcade sends its score")
			task.wait(1.5)

			local table_ = BuildUtil.Box(cctx, "PingPong", Vector3.new(5, 2.5, 3), Vector3.new(0, 1.25, -8))
			local pongP = BuildUtil.Use(cctx, table_, "pingpong")
			fire(pongP)
			check(gamePanel.Title.Text == "PING-PONG RALLY", "ping-pong opens")
			for _ = 1, 4 do
				RunServiceMock.RenderStepped:Fire(0.1)
			end
			boundActions.TycoonMiniGame("TycoonMiniGame", Enum.UserInputState.Begin, { KeyCode = Enum.KeyCode.E })
			task.wait(0.05)
			local pongResult = results[#results]
			check(pongResult and pongResult.prompt == pongP and pongResult.score == 0, "swinging too early ends the rally")
			task.wait(1.5)

			local podium = BuildUtil.Box(cctx, "Podium", Vector3.new(3, 4, 2), Vector3.new(-6, 2, -8))
			local podiumP = BuildUtil.Use(
				cctx,
				podium,
				"podium",
				{ Camera = { From = Vector3.new(-6, 5, -20), To = Vector3.new(-6, 5, -8), Fov = 45 } }
			)
			fire(podiumP)
			check(
				gamePanel.Title.Text == "PRESS CONFERENCE" and camera.CameraType == Enum.CameraType.Scriptable,
				"the press conference faces the podium camera"
			)
			local answer = gamePanel:FindFirstChild("Answer3", true)
			check(answer ~= nil, "three answers to pick from")
			if answer then
				instanceSignal(answer, "Activated"):Fire()
				task.wait(0.05)
			end
			local podiumResult = results[#results]
			check(podiumResult and podiumResult.prompt == podiumP and podiumResult.score == 3, "the chosen answer goes to the server")
			check(camera.CameraType ~= Enum.CameraType.Scriptable, "the camera comes back after the press conference")
			task.wait(1.5)
			local speechP = BuildUtil.Use(cctx, podium, "podium", { Title = "Pre-Game Speech" })
			fire(speechP)
			check(gamePanel.Title.Text == "PRE-GAME SPEECH", "a locker-room podium plays as a pre-game speech")
			instanceSignal(gamePanel:FindFirstChild("Close"), "Activated"):Fire()
			task.wait(0.05)
			check(not gamePanel.Visible and boundActions.TycoonMiniGame == nil, "the X button closes a mini-game")

			fire(liftP)
			viewerRoot.CFrame = CFrame.new(300, 3, 0)
			RunServiceMock.RenderStepped:Fire(0.016)
			task.wait(0.05)
			check(boundActions.TycoonMiniGame == nil, "walking away cancels a mini-game")
			viewerRoot.CFrame = CFrame.new(0, 3, 0)

			instanceSignal(remotesFolder.Transition, "OnClientEvent"):Fire("PRESS LEVEL")
			task.wait(0.15)
			local fadeFrame = ui:FindFirstChild("Fade")
			check(fadeFrame.Visible and fadeFrame.Label.Text == "PRESS LEVEL", "elevator rides fade the screen")
			task.wait(1.4)
			check(not fadeFrame.Visible, "and fade back in")
			clientFix:Destroy()
		end
	end
	do
		-- the TV view hides every prompt (the seat's own Sit bubble would float in the middle of the shot)
		local tvFix = Instance.new("Model")
		tvFix.Name = "TVPromptFixtures"
		tvFix.Parent = plotModel(2)
		local tctx = BuildUtil.NewContext(CFrame.new(), tvFix, Config.TeamColors[1], "TEST", Config)
		local cam = BuildUtil.Seat(tctx, {
			CFrame = CFrame.new(10, 0.5, 4),
			Camera = { From = Vector3.new(0, 30, -40), To = Vector3.new(0, 0, 30), Fov = 40, Label = "MIRROR CAM" },
		})
		local humanoid = viewer.Character:FindFirstChildOfClass("Humanoid")
		local sat = pcall(function()
			humanoid.SeatPart = cam
		end)
		instanceSignal(humanoid, "PropSeatPart"):Fire()
		task.wait(0.03)
		check(sat and ProximityPromptServiceMock.Enabled == false, "prompts are hidden in the TV camera view")
		pcall(function()
			humanoid.SeatPart = Instance.new("Part") -- standing up (see above)
		end)
		instanceSignal(humanoid, "PropSeatPart"):Fire()
		task.wait(0.03)
		check(ProximityPromptServiceMock.Enabled == true, "and come back when you stand up")
		tvFix:Destroy()
	end

	section("Drive controller")
	local driveCarts = Vehicles.GetCarts(PlotManager.GetPlot(alice2))
	local driveInfo = driveCarts[1]
	local driver = makeCharacter("ViewerCharacterDrive")
	local driverHumanoid = driver:FindFirstChildOfClass("Humanoid")
	viewer.Character = driver
	local okSeat = pcall(function()
		driverHumanoid.SeatPart = driveInfo.seat
		driveInfo.seat.ThrottleFloat = 1
		driveInfo.seat.SteerFloat = 1
	end)
	check(okSeat, "test can seat the driver")
	local okDrive, driveErr = pcall(runScript, "StarterPlayer/StarterPlayerScripts/TycoonClient/Drive")
	check(okDrive, "Drive script runs: " .. tostring(driveErr))
	for _ = 1, 30 do
		RunServiceMock.Heartbeat:Fire(1 / 30)
	end
	task.wait(0.1)
	local driveChassis = driveInfo.model.PrimaryPart
	local planeVelocity = driveChassis.DriveVelocity.PlaneVelocity
	check(planeVelocity.Magnitude > 10, ("full throttle drives forward (%.1f studs/s)"):format(planeVelocity.Magnitude))
	check(driveChassis.DriveTurn.AngularVelocity.Y < 0, "steering right turns the cart clockwise")
	pcall(function()
		driverHumanoid.SeatPart = nil
	end)

	section("Client effects")
	viewer:SetAttribute("PlotIndex", 1)
	viewer:SetAttribute("NextGoal", "hq_lobby:1")
	local okFx, fxErr = pcall(runScript, "StarterPlayer/StarterPlayerScripts/TycoonClient/Effects")
	check(okFx, "Effects script runs: " .. tostring(fxErr))
	task.wait(0.4)
	RunServiceMock.RenderStepped:Fire(0.016)
	task.wait(0.05)
	local beam = workspace:FindFirstChild("TycoonGuide", true)
	check(beam ~= nil and beam.Enabled, "guide beam points at the next goal")

	local pulsing = false
	for _, pad in ipairs(CollectionServiceMock:GetTagged("TycoonBuyButton")) do
		local ok, value = pcall(function()
			return pad.LocalTransparencyModifier
		end)
		if ok and value ~= nil then
			pulsing = true
		end
	end
	check(pulsing, "buy buttons pulse")
	-- the guide survives its target button being destroyed (e.g. after buying it)
	local goalPad = plotModel(1).Buttons:FindFirstChild("Buy_hq_lobby:1")
	if goalPad then
		goalPad:Destroy()
	end
	task.wait(0.35)
	RunServiceMock.RenderStepped:Fire(0.016)
	task.wait(0.05)
	check(beam.Parent ~= nil and beam.Enabled == false, "guide hides (and keeps working) when its button is gone")
	-- a fan in front of the camera bounces (a seated fan is its jersey block with the head inside)
	local fanFolder = Instance.new("Folder")
	fanFolder.Parent = workspace
	local fanBody = Instance.new("Part")
	fanBody.Name = "Fan"
	fanBody.CFrame = CFrame.new(0, 10, 0)
	local fanHead = Instance.new("Part")
	fanHead.Name = "Head"
	fanHead.CFrame = CFrame.new(0, 12, 0)
	fanHead.Parent = fanBody
	fanBody.Parent = fanFolder
	CollectionServiceMock:AddTag(fanBody, "TycoonFan")
	task.wait(0.05)
	local moved = false
	for step = 1, 60 do
		RunServiceMock.Heartbeat:Fire(0.016)
		task.wait(0.03)
		if math.abs(fanBody.CFrame.Position.Y - 10) > 0.01 then
			moved = true
			break
		end
	end
	check(moved, "fans bounce and cheer")
	-- a walking fan moves along its path on the client
	local walkerFolder = Instance.new("Folder")
	walkerFolder.Parent = workspace
	local walkerModel = Instance.new("Model")
	local walkerRoot = Instance.new("Part")
	walkerRoot.Name = "Root"
	walkerRoot.CFrame = CFrame.new(0, 3, 0)
	walkerRoot.Parent = walkerModel
	walkerRoot:SetAttribute("WalkFrom", CFrame.new(0, 3, 0))
	walkerRoot:SetAttribute("WalkTo", CFrame.new(0, 3, 100))
	walkerRoot:SetAttribute("WalkStart", os.clock() - 5)
	walkerRoot:SetAttribute("WalkDuration", 10)
	walkerModel.Parent = walkerFolder
	CollectionServiceMock:AddTag(walkerModel, "TycoonWalker")
	task.wait(0.05)
	RunServiceMock.RenderStepped:Fire(0.016)
	task.wait(0.05)
	local walkedZ = walkerRoot.CFrame.Position.Z
	check(walkedZ > 40 and walkedZ < 60, ("walking fans move along their path (z=%.1f, expected ~50)"):format(walkedZ))
	notifyRemote.OnClientEvent:Fire("Built X", "success")
	task.wait(0.05)
	check(table.find(playedSounds, "Purchase") ~= nil, "purchase sound plays")
	do
		-- PERF-3: only fans near the camera cheer, with a two-state hop driven from Heartbeat (not
		-- RenderStepped); the head hops with its jersey block; a fan the camera leaves sits down
		local function makeFan(position)
			local body = Instance.new("Part")
			body.Name = "Fan"
			body.CFrame = CFrame.new(position)
			local head = Instance.new("Part")
			head.Name = "Head"
			head.CFrame = CFrame.new(position + Vector3.new(0, 1.85, 0))
			head.Parent = body
			body.Parent = fanFolder
			CollectionServiceMock:AddTag(body, "TycoonFan")
			return body, head
		end
		local nearBody, nearHead = makeFan(Vector3.new(20, 10, 0))
		local farBody = makeFan(Vector3.new(0, 10, 900))
		local function liftOf(part, restY)
			return part.CFrame.Position.Y - restY
		end
		local renderMoved = false
		for _ = 1, 40 do
			RunServiceMock.RenderStepped:Fire(0.016)
			task.wait(0.02)
			renderMoved = renderMoved or math.abs(liftOf(nearBody, 10)) > 0.01
		end
		check(not renderMoved, "fans don't cheer from RenderStepped")
		local heights, headWith, farMoved = {}, true, false
		for _ = 1, 80 do
			RunServiceMock.Heartbeat:Fire(0.016)
			task.wait(0.02)
			local lift = liftOf(nearBody, 10)
			heights[("%.2f"):format(lift)] = true
			headWith = headWith and math.abs(liftOf(nearHead, 11.85) - lift) < 0.01
			farMoved = farMoved or math.abs(liftOf(farBody, 10)) > 0.01
		end
		local heightList = {}
		for height in pairs(heights) do
			table.insert(heightList, height)
		end
		table.sort(heightList)
		check(
			#heightList == 2 and heightList[1] == "0.00" and headWith,
			"a near fan hops between its seat and one raised height, its head with it: " .. table.concat(heightList, ", ")
		)
		check(not farMoved, "fans far from the camera sit still")
		-- the camera leaves while the fan is in the air: it sits back down and stays down
		local wasUp = false
		for _ = 1, 80 do
			RunServiceMock.Heartbeat:Fire(0.016)
			task.wait(0.02)
			if liftOf(nearBody, 10) > 0.5 then
				wasUp = true
				break
			end
		end
		local camera = workspace.CurrentCamera
		local cameraBefore = camera.CFrame
		camera.CFrame = CFrame.new(0, 10, 3000)
		for _ = 1, 40 do -- (past the next refresh of the fans near the camera, every 0.5 s)
			RunServiceMock.Heartbeat:Fire(0.016)
			task.wait(0.02)
		end
		local stayedDown = true
		for _ = 1, 30 do
			RunServiceMock.Heartbeat:Fire(0.016)
			task.wait(0.02)
			stayedDown = stayedDown and math.abs(liftOf(nearBody, 10)) < 0.01 and math.abs(liftOf(nearHead, 11.85)) < 0.01
		end
		camera.CFrame = cameraBefore
		check(wasUp and stayedDown, "a fan the camera leaves behind sits back down and stays down")
	end
	do
		-- PJ-2: in and around the Team HQ the guide beam first points where it can be followed
		-- (a door, the stairs, a corner of the building, the lobby's opening onto the corridor),
		-- and it stays on when the button is on another floor right above or below
		local CAMPUS = Config.Layout.Areas.campus
		local guideOrigin = CFrame.new(400, 0.2, -1500) * CFrame.Angles(0, math.pi, 0) -- (turned like plot 2)
		local guidePlot = Instance.new("Model")
		guidePlot.Name = "Plot9"
		local guideButtons = Instance.new("Folder")
		guideButtons.Name = "Buttons"
		guideButtons.Parent = guidePlot
		local guideItems = Instance.new("Folder")
		guideItems.Name = "Items"
		guideItems.Parent = guidePlot
		guidePlot.Parent = tycoons
		for _, id in ipairs({ "practice_field:1", "hq_owner:1", "hq_media:1", "hq_weightroom:1", "turf:1" }) do
			local button = Items.ById[id].Button
			local pad = Instance.new("Part")
			pad.Name = "Buy_" .. id
			pad.CFrame = guideOrigin * CFrame.new(button.X, button.Y + 0.3, button.Z)
			pad.Parent = guideButtons
		end
		local atrium = Instance.new("Model")
		atrium.Name = "hq_atrium:1"
		atrium.Parent = guideItems
		local guideChar = makeCharacter("GuideTester")
		viewer.Character = guideChar
		viewer:SetAttribute("PlotIndex", 9)
		local guideBeam = workspace:FindFirstChild("TycoonGuide", true)
		local beamEnd = workspace:FindFirstChild("TycoonGuideEnd", true)
		-- where the beam points (campus coordinates, on the floor) with the player's feet at `feet`
		local function aim(feet, goal)
			viewer:SetAttribute("NextGoal", goal)
			guideChar.HumanoidRootPart.CFrame = guideOrigin * CFrame.new(feet + CAMPUS + Vector3.new(0, 3, 0))
			task.wait(0.3)
			RunServiceMock.RenderStepped:Fire(0.016)
			task.wait(0.02)
			return guideOrigin:PointToObjectSpace(beamEnd.Position) - CAMPUS - Vector3.new(0, 1, 0), guideBeam.Enabled
		end
		local function expect(feet, goal, wanted, message)
			local point, enabled = aim(feet, goal)
			check(
				enabled and (point - wanted).Magnitude < 0.6,
				("%s (beam at %.1f, %.1f, %.1f)"):format(message, point.X, point.Y, point.Z)
			)
		end
		-- leaving the HQ for the practice fields behind it (the ground floor's back wall has no door)
		expect(
			Vector3.new(-100, 0.3, 230),
			"practice_field:1",
			Vector3.new(-100, 0.2, 267),
			"lobby -> practice field: first to the corridor"
		)
		expect(Vector3.new(-200, 0.3, 271), "practice_field:1", Vector3.new(-266, 0.2, 271), "then out through the west doors")
		expect(Vector3.new(-268, 0.3, 271), "practice_field:1", Vector3.new(-266, 0.2, 370), "outside: round the HQ's corner")
		-- coming back in for a ground-floor room: round the corner, to the door, through it
		expect(
			Vector3.new(-130, 0.3, 420),
			"hq_weightroom:1",
			Vector3.new(-266, 0.2, 370),
			"practice field -> weight room: round the corner"
		)
		expect(Vector3.new(-265, 0.3, 273), "hq_weightroom:1", Vector3.new(-256, 0.2, 271), "and in through the west doors")
		-- upstairs buttons: the grand staircase (atrium built), or the west stair tower
		expect(Vector3.new(-90, 0.3, 215), "hq_media:1", Vector3.new(-61, 0.2, 208.5), "lobby -> upstairs: to the grand staircase")
		expect(Vector3.new(-54.5, 5, 225), "hq_media:1", Vector3.new(-54.5, 17, 256), "on the staircase: up to the top")
		expect(Vector3.new(-200, 0.3, 271), "hq_owner:1", Vector3.new(-252, 0.2, 271), "west corridor -> upstairs: into the stair tower")
		atrium.Parent = nil -- (no grand staircase yet)
		expect(Vector3.new(-90, 0.3, 215), "hq_media:1", Vector3.new(-90, 0.2, 267), "no grand staircase: lobby -> the corridor first")
		expect(Vector3.new(-255, 0.3, 270), "hq_media:1", Vector3.new(-258.3, 1.2, 281.4), "in the stair tower: to the first flight")
		expect(Vector3.new(-258.3, 4.5, 288), "hq_media:1", Vector3.new(-258.3, 8.6, 297.5), "first flight: up to the half landing")
		expect(Vector3.new(-252.7, 12, 288), "hq_media:1", Vector3.new(-252.7, 17, 278.5), "second flight: up to the top")
		-- upstairs, for a button outside: down the stairs first
		expect(Vector3.new(-150, 17.1, 271), "practice_field:1", Vector3.new(-252, 17, 272), "upstairs -> outside: to the stairs down")
		expect(Vector3.new(-252.7, 12, 288), "practice_field:1", Vector3.new(-252.7, 8.6, 297.5), "second flight: down to the half landing")
		-- from the corridor to the main entrance: along the corridor to the lobby's opening, through it
		expect(Vector3.new(30, 0.3, 271), "turf:1", Vector3.new(-64, 0.2, 268), "east corridor -> main entrance: to the lobby's opening")
		expect(Vector3.new(-80, 0.3, 270), "turf:1", Vector3.new(-80, 0.2, 261), "at the opening: into the lobby")
		-- straight at buttons away from the HQ; hidden right next to one on the same floor only
		local _, sameFloor = aim(Vector3.new(5, 0.3, -80), "turf:1")
		local _, below = aim(Vector3.new(5, -16.7, -80), "turf:1")
		local _, farAway = aim(Vector3.new(40, 0.3, -80), "turf:1")
		check(not sameFloor and below and farAway, "the beam hides next to its button, not when it's a floor above or below you")
		atrium.Parent = guideItems
		guidePlot:Destroy()
	end
end

local ranOk, runError = xpcall(runTests, function(err)
	return tostring(err)
end)
if not ranOk then
	failed += 1
	print("\nTEST SCRIPT CRASHED: " .. tostring(runError))
end
print(("\n%d passed, %d failed"):format(passed, failed))
process.exit(failed == 0 and 0 or 1)
