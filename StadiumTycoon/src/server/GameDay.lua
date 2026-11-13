--[[
	GameDay
	Every few minutes a GAME DAY starts for the whole server:
	  * fans walk in through every claimed stadium's gate and fill the stands its owner built
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

local FAN_TAG = "TycoonFan" -- Effects.client.lua makes these cheer
local WALKER_TAG = "TycoonWalker" -- Effects.client.lua walks these in from the gate
local CROWD_FOLDER = "GameDayFans"
local WALK_SPEED = 12 -- studs per second

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
			local finish = CFrame.new(x * 0.6, 0, L.SurfaceMinZ - 2) * facingStadium
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

local function spawnCrowd(plot)
	GameDay.ClearCrowd(plot)
	local folder = Instance.new("Folder")
	folder.Name = CROWD_FOLDER
	local ctx = BuildUtil.NewContext(plot.Origin, folder, plot.Palette, plot.TeamName, Config)
	local fans = Crowd.SeatedFans(ctx, plot.Owned, settings.SeatedFans, rng)
	for _, fan in ipairs(fans) do
		CollectionService:AddTag(fan, FAN_TAG)
	end
	folder.Parent = plot.Model
	spawnWalkers(plot, folder, ctx)
	return #fans
end

local function beginGameDay()
	active = true
	tycoonsFolder:SetAttribute("GameDayEndsAt", serverNow() + settings.DurationSeconds)
	tycoonsFolder:SetAttribute("GameDayActive", true)
	plotManager.SetGameDay(true, settings.IncomeMultiplier)
	for _, plot in ipairs(plotManager.GetPlots()) do
		if plot.Owner then
			local ok, err = pcall(spawnCrowd, plot)
			if not ok then
				warn("[GameDay] Couldn't spawn the crowd: " .. tostring(err))
			end
		end
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
	for _, plot in ipairs(plotManager.GetPlots()) do
		GameDay.ClearCrowd(plot)
	end
end

-- A plot claimed in the middle of a game day gets its crowd straight away.
function GameDay.OnPlotClaimed(plot)
	if active then
		pcall(spawnCrowd, plot)
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
