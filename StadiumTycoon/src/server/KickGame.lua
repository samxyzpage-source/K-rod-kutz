--[[
	KickGame
	Field goal challenge on your own stadium field. Once the Goal Posts are fully built, three
	kick spots appear (SHORT / MEDIUM / LONG, see Config.KickGame.Spots). Step on one as the
	owner and KickGame.client.lua shows an aim + power meter; the result comes back here, the
	server decides whether it's good, flies the ball and pays a reward.

	Remotes (in ReplicatedStorage.TycoonRemotes):
	  KickStart   server -> client  (spotIndex, yards, name)
	  KickAttempt client -> server  (spotIndex, aim -1..1, power 0..1)
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local Shared = ReplicatedStorage:WaitForChild("TycoonShared")
local Config = require(Shared:WaitForChild("Config"))
local Format = require(Shared:WaitForChild("Format"))

local PlayerData = require(script.Parent.PlayerData)

local KickGame = {}

local GOAL_X = 120 -- plot-local x of the goal post plane the kicks aim at (east end zone)
local CROSSBAR_HEIGHT = 7.5
local UPRIGHT_HALF_GAP = 6.2

local plotManager = nil
local franchise = nil
local notifyRemote = nil
local kickStart = nil
local spotsByPlot = {} -- [plot] = { [index] = pad }
local lastKick = {} -- [player] = os.clock()
local pending = {} -- [player] = spotIndex (the spot they were offered)
local offeredAt = {} -- [player] = os.clock() when the kick meter was opened
local lastReward = {} -- [player] = os.clock() of the last paid kick

local function notify(player, message, kind)
	if notifyRemote and player.Parent then
		notifyRemote:FireClient(player, message, kind or "info")
	end
end

-- How accurate (aim) and strong (power) a kick from `yards` has to be.
-- (KickGame.client.lua uses the same formula to draw the target zones.)
function KickGame.Requirements(yards)
	local k = Config.KickGame
	local aimTolerance = math.max(k.AimMin, k.AimBase - yards * k.AimPerYard) -- 25y: 0.23, 55y: 0.13
	local powerNeeded = math.min(k.PowerMax, k.PowerBase + yards * k.PowerPerYard) -- 25y: 0.61, 55y: 0.93
	return aimTolerance, powerNeeded
end

-- Decides the kick. Returns made, reason.
function KickGame.Judge(yards, aim, power)
	local aimTolerance, powerNeeded = KickGame.Requirements(yards)
	if power < powerNeeded then
		return false, "short"
	end
	if aim < -aimTolerance then
		return false, "wide left"
	end
	if aim > aimTolerance then
		return false, "wide right"
	end
	return true, "good"
end

function KickGame.Reward(player, yards)
	local income = plotManager.GetBaseIncome(player) -- (no game-day boost)
	return math.max(150, math.floor(yards * 8 + income * yards * Config.KickGame.RewardIncomeSecondsPerYard))
end

local function flyBall(plot, spot, aim, power, made)
	local ball = Instance.new("Part")
	ball.Name = "KickedBall"
	ball.Shape = Enum.PartType.Ball
	ball.Size = Vector3.new(1.4, 1.4, 1.4)
	ball.Color = Color3.fromRGB(130, 75, 40)
	ball.Material = Enum.Material.SmoothPlastic
	ball.Anchored = true
	ball.CanCollide = false
	ball.CanTouch = false
	local origin = plot.Origin
	local start = spot.Position + Vector3.new(0, 1, 0)
	-- where the ball crosses the goal line plane: sideways by aim, height by power
	local crossZ = spot.Position.Z + aim * UPRIGHT_HALF_GAP * 2.2
	local crossY = made and (CROSSBAR_HEIGHT + 4 + power * 6) or (power < 0.5 and 2 or CROSSBAR_HEIGHT + power * 5)
	local apex = Vector3.new((start.X + GOAL_X) / 2, crossY + 6 + power * 8, (start.Z + crossZ) / 2)
	local finish = Vector3.new(GOAL_X + 10, 1, crossZ)
	ball.CFrame = origin * CFrame.new(start)
	ball.Parent = plot.Model
	local first = TweenService:Create(
		ball,
		TweenInfo.new(0.7, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
		{ CFrame = origin * CFrame.new(apex) }
	)
	first.Completed:Connect(function()
		local second = TweenService:Create(
			ball,
			TweenInfo.new(0.7, Enum.EasingStyle.Quad, Enum.EasingDirection.In),
			{ CFrame = origin * CFrame.new(finish) }
		)
		second.Completed:Connect(function()
			task.delay(1.5, function()
				ball:Destroy()
			end)
		end)
		second:Play()
	end)
	first:Play()
end

local function onAttempt(player, spotIndex, aim, power)
	if pending[player] ~= spotIndex then
		return -- only the spot we offered
	end
	pending[player] = nil
	local elapsed = os.clock() - (offeredAt[player] or math.huge)
	offeredAt[player] = nil
	if elapsed < Config.KickGame.MinMeterSeconds then
		return -- nobody can aim and power a kick that fast
	end
	if type(aim) ~= "number" or type(power) ~= "number" or aim ~= aim or power ~= power then
		return
	end
	aim = math.clamp(aim, -1, 1)
	power = math.clamp(power, 0, 1)
	local plot = plotManager.GetPlot(player)
	local spots = plot and spotsByPlot[plot]
	local pad = spots and spots[spotIndex]
	local spot = Config.KickGame.Spots[spotIndex]
	if not pad or not spot then
		return
	end
	-- must still be standing near the kick spot
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if not root or (root.CFrame.Position - pad.CFrame.Position).Magnitude > 16 then
		return
	end
	local made, reason = KickGame.Judge(spot.Yards, aim, power)
	flyBall(plot, spot, aim, power, made)
	if made then
		local now = os.clock()
		local cooldown = Config.KickGame.RewardCooldownSeconds
		if not lastReward[player] or now - lastReward[player] >= cooldown then
			lastReward[player] = now
			local reward = KickGame.Reward(player, spot.Yards)
			PlayerData.AddCash(player, reward)
			notify(player, ("IT'S GOOD! %d-yard field goal!  +%s"):format(spot.Yards, Format.MoneyExact(reward)), "success")
		else
			local wait = math.ceil(cooldown - (now - lastReward[player]))
			notify(player, ("IT'S GOOD! %d yards. (Practice kick - the next reward is in %ds)"):format(spot.Yards, wait), "success")
		end
	else
		notify(player, ("No good - %s! Try again."):format(reason), "error")
	end
	if franchise then
		franchise.RecordKick(player, spot.Yards, made)
	end
end

local function onPadTouched(plot, index, hit)
	local character = hit:FindFirstAncestorOfClass("Model")
	local player = character and Players:GetPlayerFromCharacter(character)
	if not player or player ~= plot.Owner then
		return
	end
	local now = os.clock()
	if lastKick[player] and now - lastKick[player] < Config.KickGame.CooldownSeconds then
		return
	end
	lastKick[player] = now
	-- Stepping back onto the spot that is already offered (a jump landing, a shuffle) keeps the
	-- offer time while its meter can still be open: a fresh time would make the kick that is
	-- already on its way look instant (MinMeterSeconds) and it would be dropped.
	local live = pending[player] == index
		and offeredAt[player] ~= nil
		and now - offeredAt[player] <= Config.KickGame.MeterTimeoutSeconds + 1
	if not live then
		offeredAt[player] = now
	end
	pending[player] = index
	local spot = Config.KickGame.Spots[index]
	kickStart:FireClient(player, index, spot.Yards, spot.Name)
end

local function makePads(plot)
	if spotsByPlot[plot] then
		return
	end
	local folder = Instance.new("Folder")
	folder.Name = "KickSpots"
	local pads = {}
	for index, spot in ipairs(Config.KickGame.Spots) do
		local pad = Instance.new("Part")
		pad.Name = "KickSpot" .. index
		pad.Anchored = true
		pad.CanCollide = false
		pad.Size = Vector3.new(6, 0.2, 6)
		pad.CFrame = plot.Origin * CFrame.new(spot.Position + Vector3.new(0, 0.42, 0))
		pad.Color = Color3.fromRGB(255, 196, 37)
		pad.Material = Enum.Material.Neon
		pad.Transparency = 0.25
		pad.TopSurface = Enum.SurfaceType.Smooth
		local tee = Instance.new("Part")
		tee.Name = "Tee"
		tee.Anchored = true
		tee.CanCollide = false
		tee.Size = Vector3.new(0.6, 0.6, 0.6)
		tee.CFrame = pad.CFrame * CFrame.new(0, 0.4, 0)
		tee.Color = Color3.fromRGB(240, 120, 30)
		tee.Parent = pad
		local gui = Instance.new("BillboardGui")
		gui.Size = UDim2.new(10, 0, 2.6, 0)
		gui.StudsOffset = Vector3.new(0, 4, 0)
		gui.MaxDistance = 140
		gui.LightInfluence = 0
		local label = Instance.new("TextLabel")
		label.Size = UDim2.new(1, 0, 1, 0)
		label.BackgroundTransparency = 1
		label.Font = Enum.Font.GothamBlack
		label.TextScaled = true
		label.TextColor3 = Color3.fromRGB(255, 230, 120)
		label.TextStrokeTransparency = 0.3
		label.Text = ("FIELD GOAL\n%s - %d YDS"):format(spot.Name, spot.Yards)
		label.Parent = gui
		gui.Parent = pad
		pad.Touched:Connect(function(hit)
			onPadTouched(plot, index, hit)
		end)
		pad.Parent = folder
		pads[index] = pad
	end
	folder.Parent = plot.Model
	spotsByPlot[plot] = pads
end

local function removePads(plot)
	local pads = spotsByPlot[plot]
	if pads then
		local folder = pads[1] and pads[1].Parent
		if folder then
			folder:Destroy()
		end
	end
	spotsByPlot[plot] = nil
end

function KickGame.GetPads(plot)
	return spotsByPlot[plot]
end

function KickGame.Init(manager, remoteFolder, notify, franchiseModule)
	plotManager = manager
	notifyRemote = notify
	franchise = franchiseModule
	kickStart = Instance.new("RemoteEvent")
	kickStart.Name = "KickStart"
	kickStart.Parent = remoteFolder
	local kickAttempt = Instance.new("RemoteEvent")
	kickAttempt.Name = "KickAttempt"
	kickAttempt.OnServerEvent:Connect(onAttempt)
	kickAttempt.Parent = remoteFolder

	plotManager.OnPieceBuilt("goalposts", function(plot, item)
		if item.Stage >= item.StageCount then
			makePads(plot)
		end
	end)
	plotManager.OnPlotReleased(removePads)
	Players.PlayerRemoving:Connect(function(player)
		lastKick[player] = nil
		pending[player] = nil
		offeredAt[player] = nil
		lastReward[player] = nil
	end)
end

-- exposed for tests
KickGame._onAttempt = onAttempt
KickGame._onPadTouched = onPadTouched

return KickGame
