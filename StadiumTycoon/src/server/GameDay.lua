--[[
	GameDay
	Every few minutes a GAME DAY starts for the whole server:
	  * fans walk in through every claimed stadium's gate and fill the stands its owner built
	    (one stadium after the other, Config.GameDay.FansPerFrame fans per frame, so neither the
	    server nor the clients make a whole crowd in one frame; they leave the same way)
	  * income is multiplied (Config.GameDay.IncomeMultiplier) while it lasts
	  * the jumbotron / scoreboard get excited and the HUD shows a countdown

	Attributes on Workspace.Tycoons (read by the HUD):
	  GameDayActive   true while a game day is on
	  GameDayEndsAt   server time (workspace:GetServerTimeNow()) when it ends
	  NextGameDayAt   server time when the next one starts
]]

local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("TycoonShared")
local Config = require(Shared:WaitForChild("Config"))

local BuildUtil = require(script.Parent.BuildUtil)
local Crowd = require(script.Parent.Crowd)

local GameDay = {}

local FAN_TAG = "TycoonFan" -- Effects.client.lua makes these cheer (a seated fan's jersey block)
local WALKER_TAG = "TycoonWalker" -- Effects.client.lua walks these in from the gate
local CROWD_FOLDER = "GameDayFans"
local WALK_SPEED = 12 -- studs per second
local PLAN_SECONDS_PER_FRAME = 0.004 -- planning a full bowl's seats takes a while: at most this much per frame

local settings = Config.GameDay
local tycoonsFolder = nil
local plotManager = nil
local active = false
local endedHooks = {} -- fn() after every game day
local rng = Random.new()

local function serverNow()
	return Workspace:GetServerTimeNow()
end

function GameDay.IsActive()
	return active
end

local function fansPerFrame()
	return math.max(1, math.floor(settings.FansPerFrame or 150))
end

-- A fn() for Crowd.PlanSeats that waits for the next frame once PLAN_SECONDS_PER_FRAME of work
-- has been done since the last wait.
local function framePacer()
	local since = os.clock()
	return function()
		if os.clock() - since >= PLAN_SECONDS_PER_FRAME then
			task.wait()
			since = os.clock()
		end
	end
end

-- Removes a plot's game-day crowd (also used when a plot is released).
function GameDay.ClearCrowd(plot)
	local folder = plot.Model:FindFirstChild(CROWD_FOLDER)
	if folder then
		folder:Destroy()
	end
end

-- Walking fans are created here but MOVED by each client (Effects.client.lua lerps the root
-- from WalkFrom to WalkTo), so the parade is smooth and costs no network traffic.
local function spawnWalkers(plot, folder, ctx)
	local L = Config.Layout
	for index = 1, settings.WalkingFans do
		task.delay((index - 1) * 0.9, function()
			if not active or folder.Parent == nil then
				return
			end
			local x = rng:NextNumber(-L.WalkwayHalfWidth + 2, L.WalkwayHalfWidth - 2)
			local facingStadium = CFrame.Angles(0, math.pi, 0) -- local +Z
			local start = CFrame.new(x, 0, L.GateZ + 3) * facingStadium
			local finish = CFrame.new(x * 0.6, 0, L.StadiumFrontZ - 2) * facingStadium -- Gate A
			local jersey = (rng:NextNumber() < 0.6) and plot.Palette.Primary or plot.Palette.Secondary
			local skin = Crowd.SkinTones[rng:NextInteger(1, #Crowd.SkinTones)]
			-- build into an unparented holder so the attributes arrive together with the parts
			local holder = Instance.new("Folder")
			local holderCtx = table.clone(ctx)
			holderCtx.parent = holder
			local model, root = Crowd.Walker(holderCtx, start, jersey, skin, index)
			local duration = (finish.Position - start.Position).Magnitude / WALK_SPEED
			root:SetAttribute("WalkFrom", plot.Origin * start * CFrame.new(0, 3, 0))
			root:SetAttribute("WalkTo", plot.Origin * finish * CFrame.new(0, 3, 0))
			root:SetAttribute("WalkStart", serverNow())
			root:SetAttribute("WalkDuration", duration)
			CollectionService:AddTag(model, WALKER_TAG)
			model.Parent = folder
			holder:Destroy()
			task.delay(duration + 0.5, function()
				model:Destroy()
			end)
		end)
	end
end

--[[
	Fills a plot's stands. The seats are planned first (no instances, a few ms per frame), then
	the fans arrive fansPerFrame() per frame: each one is built in an unparented holder, tagged
	and only then moved into the crowd folder, so it replicates in one piece. YIELDS; stops early
	when the game day ends or the crowd is cleared (plot released) meanwhile.
	Returns how many seated fans arrived.
]]
local function spawnCrowd(plot)
	local owner = plot.Owner
	local folder = Instance.new("Folder")
	folder.Name = CROWD_FOLDER
	local ctx = BuildUtil.NewContext(plot.Origin, folder, plot.Palette, plot.TeamName, Config)
	local seats = Crowd.PlanSeats(ctx, plot.Owned, settings.SeatedFans, rng, framePacer())
	if not active or plot.Owner ~= owner then
		return 0 -- the game day ended (or the plot changed hands) while the seats were planned
	end
	GameDay.ClearCrowd(plot)
	folder.Parent = plot.Model
	spawnWalkers(plot, folder, ctx)
	local holder = Instance.new("Folder")
	local holderCtx = table.clone(ctx)
	holderCtx.parent = holder
	local perFrame = fansPerFrame()
	local arrived = 0
	for _, seat in ipairs(seats) do
		if arrived % perFrame == 0 then
			task.wait()
		end
		if not active or folder.Parent ~= plot.Model then
			break -- the game day ended (or the plot was released) while the fans were arriving
		end
		local fan = Crowd.SeatedFan(holderCtx, seat)
		CollectionService:AddTag(fan, FAN_TAG)
		fan.Parent = folder
		arrived += 1
	end
	holder:Destroy()
	return arrived
end

local function trySpawnCrowd(plot)
	local ok, err = pcall(spawnCrowd, plot)
	if not ok then
		warn("[GameDay] Couldn't spawn the crowd: " .. tostring(err))
	end
end

local function beginGameDay()
	active = true
	tycoonsFolder:SetAttribute("GameDayEndsAt", serverNow() + settings.DurationSeconds)
	tycoonsFolder:SetAttribute("GameDayActive", true)
	plotManager.SetGameDay(true, settings.IncomeMultiplier)
	-- the stadiums fill one after the other (each over several frames), never in the same frame
	local plots = plotManager.GetPlots()
	task.spawn(function()
		for _, plot in ipairs(plots) do
			if not active then
				return
			end
			if plot.Owner then
				trySpawnCrowd(plot)
				task.wait()
			end
		end
	end)
end

-- The fans leave the way they came: fansPerFrame() per frame, one stadium after the other, so
-- clients don't remove thousands of parts in one frame. (GameDay.ClearCrowd removes a crowd at
-- once, e.g. when its plot is released.)
local function dismissCrowds(folders)
	local perFrame = fansPerFrame()
	for _, folder in ipairs(folders) do
		for index, child in ipairs(folder:GetChildren()) do
			if folder.Parent == nil then
				break -- cleared meanwhile
			end
			child:Destroy()
			if index % perFrame == 0 then
				task.wait()
			end
		end
		folder:Destroy()
		task.wait()
	end
end

local function endGameDay()
	for _, hook in ipairs(endedHooks) do
		local ok, err = pcall(hook)
		if not ok then
			warn("[GameDay] end hook failed: " .. tostring(err))
		end
	end
	active = false
	tycoonsFolder:SetAttribute("GameDayActive", false)
	plotManager.SetGameDay(false, 1)
	local folders = {}
	for _, plot in ipairs(plotManager.GetPlots()) do
		local folder = plot.Model:FindFirstChild(CROWD_FOLDER)
		if folder then
			table.insert(folders, folder)
		end
	end
	task.spawn(dismissCrowds, folders)
end

-- A plot claimed in the middle of a game day gets its crowd straight away.
function GameDay.OnPlotClaimed(plot)
	if active then
		task.spawn(trySpawnCrowd, plot)
	end
end

-- fn() runs when a game day ends (before the crowd leaves), e.g. to decide wins/losses.
function GameDay.OnEnded(fn)
	table.insert(endedHooks, fn)
end

function GameDay.Init(folder, manager)
	tycoonsFolder = folder
	plotManager = manager
	tycoonsFolder:SetAttribute("GameDayActive", false)
end

function GameDay.Start()
	if not settings.Enabled then
		return
	end
	task.spawn(function()
		-- a game day STARTS every IntervalSeconds (the first one after IntervalSeconds)
		local wait = settings.IntervalSeconds
		while true do
			tycoonsFolder:SetAttribute("NextGameDayAt", serverNow() + wait)
			task.wait(wait)
			local ok, err = pcall(beginGameDay)
			if not ok then
				warn("[GameDay] Couldn't start the game day: " .. tostring(err))
			end
			task.wait(settings.DurationSeconds)
			pcall(endGameDay)
			wait = math.max(settings.IntervalSeconds - settings.DurationSeconds, 1)
		end
	end)
end

return GameDay
