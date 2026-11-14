--[[
	KickGame (client)
	Field goal meter. When you step on a kick spot the server fires KickStart; this shows
	  1. AIM   - a needle sweeps left/right, press to lock it (stop it in the green zone)
	  2. POWER - a bar fills up and down, press to lock it (past the gold line)
	then sends KickAttempt(spotIndex, aim, power). The server judges the kick (KickGame.lua).
	Press = Space or E, left click / tap the KICK button, or gamepad A. Walking away cancels.
	While the meter is open (also while "Here it goes..." shows after a kick) Space and A only
	kick: they don't also jump, on foot or on the hoverboard (landing back on the kick spot would
	count as stepping on it again).
]]

local ContextActionService = game:GetService("ContextActionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local player = Players.LocalPlayer
local Shared = ReplicatedStorage:WaitForChild("TycoonShared")
local Config = require(Shared:WaitForChild("Config"))
local remotes = ReplicatedStorage:WaitForChild("TycoonRemotes")
local kickStart = remotes:WaitForChild("KickStart")
local kickAttempt = remotes:WaitForChild("KickAttempt")

local settings = Config.KickGame
local DARK = Color3.fromRGB(18, 22, 30)
local GOLD = Color3.fromRGB(255, 196, 37)
local GREEN = Color3.fromRGB(70, 210, 110)
local CANCEL_DISTANCE = 14
local TIMEOUT_SECONDS = settings.MeterTimeoutSeconds or 15
local KICK_ACTION = "TycoonKickMeter" -- Space / E / gamepad A while the meter is open

local function create(className, props, children)
	local instance = Instance.new(className)
	for key, value in pairs(props) do
		if key ~= "Parent" then
			instance[key] = value
		end
	end
	for _, child in ipairs(children or {}) do
		child.Parent = instance
	end
	instance.Parent = props.Parent
	return instance
end

local function corner(radius)
	return create("UICorner", { CornerRadius = UDim.new(0, radius) })
end

local function requirements(yards)
	local aimTolerance = math.max(settings.AimMin, settings.AimBase - yards * settings.AimPerYard)
	local powerNeeded = math.min(settings.PowerMax, settings.PowerBase + yards * settings.PowerPerYard)
	return aimTolerance, powerNeeded
end

-- 0 -> 1 -> 0 over `period` seconds (a steady sweep, fairer than a sine)
local function triangle(t, period)
	local phase = (t / period) % 1
	return phase < 0.5 and phase * 2 or (1 - phase) * 2
end

local screen = create("ScreenGui", {
	Name = "KickMeter",
	ResetOnSpawn = false,
	Enabled = false,
	Parent = player:WaitForChild("PlayerGui"),
})
local panel = create("Frame", {
	Name = "Panel",
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.new(0.5, 0, 0.6, 0),
	Size = UDim2.new(0.8, 0, 0, 190),
	BackgroundColor3 = DARK,
	BackgroundTransparency = 0.1,
	Parent = screen,
}, {
	corner(14),
	create("UISizeConstraint", { MaxSize = Vector2.new(460, 190) }),
	create("UIStroke", { Color = GOLD, Thickness = 2 }),
})
local title = create("TextLabel", {
	Name = "Title",
	Position = UDim2.new(0, 12, 0, 8),
	Size = UDim2.new(1, -24, 0, 28),
	BackgroundTransparency = 1,
	Font = Enum.Font.GothamBlack,
	TextScaled = true,
	TextColor3 = GOLD,
	Text = "",
	Parent = panel,
})
local instruction = create("TextLabel", {
	Name = "Instruction",
	Position = UDim2.new(0, 12, 0, 38),
	Size = UDim2.new(1, -24, 0, 20),
	BackgroundTransparency = 1,
	Font = Enum.Font.GothamBold,
	TextScaled = true,
	TextColor3 = Color3.new(1, 1, 1),
	Text = "",
	Parent = panel,
})

-- aim bar: needle across a horizontal track with a green centre zone
local aimTrack = create("Frame", {
	Name = "AimTrack",
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 66),
	Size = UDim2.new(1, -40, 0, 26),
	BackgroundColor3 = Color3.fromRGB(150, 55, 55),
	Parent = panel,
}, { corner(6) })
local aimZone = create("Frame", {
	Name = "Zone",
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 0),
	BackgroundColor3 = GREEN,
	BorderSizePixel = 0,
	Parent = aimTrack,
})
local aimNeedle = create("Frame", {
	Name = "Needle",
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.new(0.5, 0, 0.5, 0),
	Size = UDim2.new(0, 6, 1, 10),
	BackgroundColor3 = Color3.new(1, 1, 1),
	BorderSizePixel = 0,
	Parent = aimTrack,
})

-- power bar: fill grows left to right, gold line marks the power needed
local powerTrack = create("Frame", {
	Name = "PowerTrack",
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 102),
	Size = UDim2.new(1, -40, 0, 22),
	BackgroundColor3 = Color3.fromRGB(55, 60, 72),
	Parent = panel,
}, { corner(6) })
local powerFill = create("Frame", {
	Name = "Fill",
	Size = UDim2.new(0, 0, 1, 0),
	BackgroundColor3 = Color3.fromRGB(240, 120, 30),
	BorderSizePixel = 0,
	Parent = powerTrack,
}, { corner(6) })
local powerMark = create("Frame", {
	Name = "Needed",
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.new(0.6, 0, 0.5, 0),
	Size = UDim2.new(0, 4, 1, 8),
	BackgroundColor3 = GOLD,
	BorderSizePixel = 0,
	Parent = powerTrack,
})

local kickButton = create("TextButton", {
	Name = "Kick",
	AnchorPoint = Vector2.new(0.5, 1),
	Position = UDim2.new(0.5, 0, 1, -10),
	Size = UDim2.new(0.5, 0, 0, 44),
	BackgroundColor3 = Color3.fromRGB(34, 150, 80),
	Font = Enum.Font.GothamBlack,
	TextScaled = true,
	TextColor3 = Color3.new(1, 1, 1),
	Text = "KICK!",
	Parent = panel,
}, { corner(10) })

---------------------------------------------------------------------------------------------
local current = nil -- { spot, yards, phase = "aim"|"power", started, aim, origin, lastPress }
local closing = nil -- after a kick: the token of its delayed close (a newer meter clears it)
local renderConnection = nil

local function rootPosition()
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	return root and root.CFrame.Position
end

local function finish()
	current = nil
	closing = nil
	screen.Enabled = false
	ContextActionService:UnbindAction(KICK_ACTION)
	if renderConnection then
		renderConnection:Disconnect()
		renderConnection = nil
	end
end

local function aimAt(t)
	return triangle(t, settings.MeterSeconds * 2) * 2 - 1
end

local function powerAt(t)
	return triangle(t, settings.MeterSeconds * 1.6)
end

local function step()
	if not current then
		return
	end
	local now = os.clock()
	local position = rootPosition()
	if not position or (position - current.origin).Magnitude > CANCEL_DISTANCE or now - current.opened > TIMEOUT_SECONDS then
		finish()
		return
	end
	local t = now - current.started
	if current.phase == "aim" then
		aimNeedle.Position = UDim2.new((aimAt(t) + 1) / 2, 0, 0.5, 0)
	else
		powerFill.Size = UDim2.new(powerAt(t), 0, 1, 0)
	end
end

local function press()
	if not current or os.clock() - current.lastPress < 0.15 then
		return
	end
	local now = os.clock()
	current.lastPress = now
	local t = now - current.started
	if current.phase == "aim" then
		current.aim = aimAt(t)
		aimNeedle.Position = UDim2.new((current.aim + 1) / 2, 0, 0.5, 0)
		current.phase = "power"
		current.started = now
		instruction.Text = "Now POWER - stop it past the gold line!"
		kickButton.Text = "KICK!"
	else
		local power = powerAt(t)
		powerFill.Size = UDim2.new(power, 0, 1, 0)
		kickAttempt:FireServer(current.spot, current.aim, power)
		current = nil
		instruction.Text = "Here it goes..."
		-- the panel stays up (and the keys sunk) while the ball flies; this kick's close never
		-- closes a newer meter (stepping back onto the spot opens one at once)
		local token = {}
		closing = token
		task.delay(1.2, function()
			if closing == token then
				finish()
			end
		end)
	end
end

kickStart.OnClientEvent:Connect(function(spotIndex, yards, name)
	if current then
		return
	end
	local origin = rootPosition()
	if not origin then
		return
	end
	local aimTolerance, powerNeeded = requirements(yards)
	aimZone.Size = UDim2.new(aimTolerance, 0, 1, 0) -- the track spans -1..1, so tolerance*2 / 2
	powerMark.Position = UDim2.new(powerNeeded, 0, 0.5, 0)
	powerFill.Size = UDim2.new(0, 0, 1, 0)
	title.Text = ("FIELD GOAL - %s (%d YARDS)"):format(tostring(name), yards)
	instruction.Text = "AIM - stop the needle in the green!"
	kickButton.Text = "LOCK AIM"
	local now = os.clock()
	current = {
		spot = spotIndex,
		yards = yards,
		phase = "aim",
		started = now,
		opened = now,
		lastPress = now,
		origin = origin,
	}
	closing = nil
	screen.Enabled = true
	if not renderConnection then
		renderConnection = RunService.RenderStepped:Connect(step)
	end
	-- the keys are sunk while the meter is open (finish() unbinds them), so they don't jump too:
	-- High is above the character's jump (Medium) and the hoverboard's charged jump (Medium + 500)
	ContextActionService:BindActionAtPriority(KICK_ACTION, function(_, state)
		if state == Enum.UserInputState.Begin then
			press()
		end
		return Enum.ContextActionResult.Sink
	end, false, Enum.ContextActionPriority.High.Value, Enum.KeyCode.Space, Enum.KeyCode.E, Enum.KeyCode.ButtonA)
end)

kickButton.Activated:Connect(press)
