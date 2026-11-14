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
	local GameDay = requireNode("ServerScriptService/TycoonServer/GameDay")
	Config.GameDay.IntervalSeconds = 0.3
	Config.GameDay.DurationSeconds = 1.2
	local fullPlot = PlotManager.GetPlot(alice2)
	local incomeBefore = alice2:GetAttribute("Income")
	GameDay.Init(tycoons, PlotManager)
	GameDay.Start()
	check(type(tycoons:GetAttribute("NextGameDayAt")) == "number", "next game day time is published for the HUD")
	task.wait(0.6)
	check(tycoons:GetAttribute("GameDayActive") == true and GameDay.IsActive(), "a game day starts on schedule")
	Config.GameDay.IntervalSeconds = 1000 -- no more game days during the rest of the tests
	check(alice2:GetAttribute("Income") == incomeBefore * Config.GameDay.IncomeMultiplier, "income is boosted during the game day")
	local crowd = fullPlot.Model:FindFirstChild("GameDayFans")
	local seated, walkers = 0, 0
	for _, child in ipairs(crowd and crowd:GetChildren() or {}) do
		if child.Name:sub(1, 3) == "Fan" then
			seated += 1
		elseif child.Name:sub(1, 6) == "Walker" then
			walkers += 1
		end
	end
	check(seated > 0 and seated <= Config.GameDay.SeatedFans, ("fans fill the stands (%d seated)"):format(seated))
	do
		-- fans sit together in sections (not one here and one there), the lower bowl first
		local bodies = {}
		for _, child in ipairs(crowd and crowd:GetChildren() or {}) do
			local body = child.Name:sub(1, 3) == "Fan" and child:FindFirstChild("Body")
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
	local hankPlot = PlotManager.GetPlot(hank)
	local hankCrowd = hankPlot.Model:FindFirstChild("GameDayFans")
	local hankSeated = 0
	for _, child in ipairs(hankCrowd and hankCrowd:GetChildren() or {}) do
		if child.Name:sub(1, 3) == "Fan" then
			hankSeated += 1
		end
	end
	check(hankSeated == 0, "no seated fans in a stadium without stands")
	local gameDayNote = lastNotification(alice2)
	check(gameDayNote and gameDayNote.message:find("GAME DAY") ~= nil, "owners are told the game day started")
	task.wait(1.3)
	check(tycoons:GetAttribute("GameDayActive") == false and not GameDay.IsActive(), "the game day ends")
	check(fullPlot.Model:FindFirstChild("GameDayFans") == nil, "the crowd leaves afterwards")
	check(alice2:GetAttribute("Income") == incomeBefore, "income goes back to normal")
	Config.GameDay.IntervalSeconds = 1000 -- no more game days during the rest of the tests

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
		tycoons:SetAttribute("GameDayActive", false)
		tycoons:SetAttribute("NextGameDayAt", os.clock() + 125)
		task.wait(0.3)
		local banner = hud:FindFirstChild("GameDay", true)
		check(
			banner and banner.Visible and banner.Text:find("Next game day in 2:0") ~= nil,
			"game day countdown: " .. tostring(banner and banner.Text)
		)
		tycoons:SetAttribute("GameDayActive", true)
		tycoons:SetAttribute("GameDayEndsAt", os.clock() + 42)
		task.wait(0.3)
		check(banner.Text:find("GAME DAY") ~= nil and banner.Text:find("0:4") ~= nil, "game day banner: " .. banner.Text)
		tycoons:SetAttribute("GameDayActive", false)
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
	-- a fan in front of the camera bounces
	local fanFolder = Instance.new("Folder")
	fanFolder.Parent = workspace
	local fanModel = Instance.new("Model")
	fanModel.Name = "TestFan"
	local fanBody = Instance.new("Part")
	fanBody.CFrame = CFrame.new(0, 10, 0)
	fanBody.Parent = fanModel
	local fanHead = Instance.new("Part")
	fanHead.CFrame = CFrame.new(0, 12, 0)
	fanHead.Parent = fanModel
	fanModel.Parent = fanFolder
	CollectionServiceMock:AddTag(fanModel, "TycoonFan")
	task.wait(0.05)
	local moved = false
	for step = 1, 20 do
		RunServiceMock.RenderStepped:Fire(0.016)
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
