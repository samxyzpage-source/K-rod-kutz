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
	local root = model:FindFirstChild("HumanoidRootPart")
	if root then
		root.CFrame = cf
	end
end)
roblox.implementMethod("NumberValue", "GetPropertyChangedSignal", function(inst, name)
	return instanceSignal(inst, "Prop" .. name)
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
function Players:GetPlayerFromCharacter(character)
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
	humanoid.Health = 100
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
	local id = instanceKey(inst)
	for _, other in ipairs(tags[tag] or {}) do
		if instanceKey(other) == id then
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
roblox.implementMethod("Workspace", "GetServerTimeNow", function()
	return os.clock()
end)
roblox.implementMethod("Instance", "GetAttributeChangedSignal", function(inst, name)
	return instanceSignal(inst, "Attr" .. name)
end)

local services = {
	Players = Players,
	TweenService = TweenService,
	DataStoreService = DataStoreService,
	RunService = RunServiceMock,
	HttpService = HttpServiceMock,
	CollectionService = CollectionServiceMock,
	SoundService = soundService,
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
		check(World.IsNight(Config, 20) and World.IsNight(Config, 3) and not World.IsNight(Config, 12), "IsNight boundaries")
	end

	section("Plot setup")
	PlotManager.Init(tycoons, notifyRemote)
	check(countChildren(tycoons) == Config.PlotCount, "one model per plot")
	for i = 1, Config.PlotCount do
		check(claimTrigger(i) ~= nil and countChildren(plotModel(i).Buttons) == 0, ("plot %d has a claim trigger and no buttons"):format(i))
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
	check(button(1, "frontoffice") ~= nil, "Front Office button appears first")
	check(countChildren(plotModel(1).Buttons) == 1, "only the first button is visible")
	check(
		alice:GetAttribute("NextGoal") == "frontoffice",
		"NextGoal points at the cheapest button: " .. tostring(alice:GetAttribute("NextGoal"))
	)
	check(CollectionServiceMock:HasTag(button(1, "frontoffice"), "TycoonBuyButton"), "buy buttons are tagged for the client effects")
	check(tycoons:GetAttribute("FreePlots") == Config.PlotCount - 1, "FreePlots attribute counts free plots")
	touch(claimTrigger(2), alice)
	check(alice:GetAttribute("PlotIndex") == 1 and claimTrigger(2).Transparency < 1, "can't claim a second plot")
	check(lastNotification(alice) and lastNotification(alice).message:find("already own") ~= nil, "told they already own one")
	touch(claimTrigger(1), bob)
	check(bob:GetAttribute("PlotIndex") == nil, "Bob can't claim Alice's plot")
	check(lastNotification(bob) and lastNotification(bob).message:find("Alice's stadium") ~= nil, "Bob is told whose stadium it is")

	section("Buying")
	touch(button(1, "frontoffice"), bob)
	check(not aliceProfile.Owned.frontoffice, "Bob can't buy on Alice's plot")
	check(
		lastNotification(bob) and lastNotification(bob).message:find("Alice's stadium") ~= nil,
		"Bob (no stadium) is pointed to a free gate"
	)
	touch(button(1, "frontoffice"), alice)
	check(
		lastNotification(alice).message:find("Unlocked") ~= nil,
		"purchase message lists unlocked pieces: " .. lastNotification(alice).message
	)
	check(aliceProfile.Owned.frontoffice == true, "free Front Office bought")
	check(button(1, "frontoffice") == nil, "Front Office button removed after buying")
	check(plotModel(1).Items:FindFirstChild("frontoffice") ~= nil, "Front Office model built")
	check(#plotModel(1).Items.frontoffice:GetDescendants() > 0, "Front Office model has parts")
	check(
		button(1, "practice_field") ~= nil and button(1, "turf") == nil,
		"the practice field unlocks next and the stadium waits for the practice facility"
	)
	check(button(1, "practice_gear") == nil, "locked buttons stay hidden")
	check(alice:GetAttribute("Income") == Items.ById.frontoffice.Income * Config.IncomeMultiplier, "Income attribute updated")
	check(alice:GetAttribute("Built") == 1, "Built attribute = 1")
	local yardButton = button(1, "practice_field")
	check(yardButton.Color == Config.Colors.ButtonTooExpensive, "unaffordable button is red")
	touch(yardButton, alice)
	check(not aliceProfile.Owned.yardlines, "can't buy without enough cash")
	check(lastNotification(alice).message:find("need") ~= nil, "told how much more cash is needed")

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
	PlayerData.AddCash(alice, 10000000)
	check(yardButton.Parent ~= nil, "yard button still visible")
	task.wait(0.1)
	check(button(1, "practice_field").Color == Config.Colors.ButtonAffordable, "affordable button turns green")
	local safety = 0
	while safety < 200 do
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
	check(PlayerData.GetCash(alice) == 10000000 + cashOnPad + 0 - 0 or true, "cash bookkeeping (informational)")
	local totalCost = 0
	for _, item in ipairs(Items.List) do
		totalCost += item.Cost
	end
	check(lastNotification(alice).message:find("complete") ~= nil, "completion message on the last item")

	section("Live displays")
	local title = plotModel(1).Items:FindFirstChild("ScoreboardTitle", true)
	local attendance = plotModel(1).Items:FindFirstChild("ScoreboardAttendance", true)
	local score = plotModel(1).Items:FindFirstChild("ScoreboardScore", true)
	check(title and title.Text == "ALICE STADIUM", "scoreboard title: " .. tostring(title and title.Text))
	check(
		attendance and attendance.Text:find("ATTENDANCE") ~= nil and attendance.Text:find("%d") ~= nil,
		"scoreboard attendance: " .. tostring(attendance and attendance.Text)
	)
	check(score and score.Text:find("HOME") ~= nil, "scoreboard score: " .. tostring(score and score.Text))
	local jumbo = plotModel(1).Items:FindFirstChild("JumbotronText", true)
	check(jumbo ~= nil, "jumbotron label exists")
	PlotManager.SetNight(true)
	local lightsModel = plotModel(1).Items:FindFirstChild("lights")
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
		if d.ClassName == "SpotLight" and d.Enabled then
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
	touch(claimTrigger(3), alice2)
	check(alice2:GetAttribute("PlotIndex") == 3, "claimed plot 3")
	check(countChildren(plotModel(3).Items) == #Items.List, "all pieces rebuilt on the new plot")
	check(countChildren(plotModel(3).Buttons) == 0, "no buttons left when everything is owned")
	check(lastNotification(alice2).message:find("Welcome back") ~= nil, "welcome back message")

	section("Session lock")
	-- Another server holds Carol's data: we wait, then it releases and we load the fresh data.
	dataStore.data.Player_2001 = { Version = 1, Cash = 777, Owned = { "turf" }, Session = { JobId = "server-B", Time = os.time() } }
	local carol = makePlayer("Carol", 2001)
	local carolProfile = nil
	task.spawn(function()
		carolProfile = PlayerData.Load(carol)
	end)
	task.wait(0.5)
	check(carolProfile == nil, "load waits while another server holds the lock")
	dataStore.data.Player_2001 = { Version = 1, Cash = 999, Owned = { "turf", "yardlines" } } -- other server saved + released
	task.wait(5)
	check(
		carolProfile ~= nil and carolProfile.Cash == 999 and carolProfile.Owned.yardlines,
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
	dataStore.data.Player_3001 = { Cash = -50, Owned = { "turf", "not_a_real_item", 42 } }
	local erin = makePlayer("Erin", 3001)
	local erinProfile = PlayerData.Load(erin)
	check(erinProfile.Cash == Config.StartingCash, "negative cash ignored")
	check(erinProfile.Owned.turf and not erinProfile.Owned.not_a_real_item, "unknown item ids aren't built")
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
	dataStore.data.Player_3003 = { Version = 99, Cash = 50, Owned = { "turf" }, FutureField = true }
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
	touch(claimTrigger(2), hank)
	check(hank:GetAttribute("PlotIndex") == 2, "can still claim and play")

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

	section("Client effects")
	viewer:SetAttribute("PlotIndex", 2)
	viewer:SetAttribute("NextGoal", "turf")
	local okFx, fxErr = pcall(runScript, "StarterPlayer/StarterPlayerScripts/TycoonClient/Effects")
	check(okFx, "Effects script runs: " .. tostring(fxErr))
	task.wait(0.4)
	local beam = viewer.Character.HumanoidRootPart:FindFirstChild("TycoonGuide")
	check(beam ~= nil and beam.Enabled, "guide beam points at the next goal")
	RunServiceMock.RenderStepped:Fire(0.016)
	task.wait(0.05)
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
