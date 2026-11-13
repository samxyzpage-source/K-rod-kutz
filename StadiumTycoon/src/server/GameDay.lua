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
local TweenService = game:GetService("TweenService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("TycoonShared")
local Config = require(Shared:WaitForChild("Config"))

local BuildUtil = require(script.Parent.BuildUtil)
local Crowd = require(script.Parent.Crowd)

local GameDay = {}

local FAN_TAG = "TycoonFan" -- Effects.client.lua makes these cheer
local CROWD_FOLDER = "GameDayFans"
local WALK_SPEED = 12 -- studs per second

local settings = Config.GameDay
local tycoonsFolder = nil
local plotManager = nil
local active = false
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
			local model, root = Crowd.Walker(ctx, start, jersey, skin, index)
			local distance = (finish.Position - start.Position).Magnitude
			local tween = TweenService:Create(
				root,
				TweenInfo.new(distance / WALK_SPEED, Enum.EasingStyle.Linear),
				{ CFrame = plot.Origin * finish * CFrame.new(0, 3, 0) }
			)
			tween.Completed:Connect(function()
				model:Destroy()
			end)
			tween:Play()
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
		while true do
			tycoonsFolder:SetAttribute("NextGameDayAt", serverNow() + settings.IntervalSeconds)
			task.wait(settings.IntervalSeconds)
			beginGameDay()
			task.wait(settings.DurationSeconds)
			endGameDay()
		end
	end)
end

return GameDay
