--[[
	Hoverboard (client)
	While the local player rides their hoverboard (the "Hoverboard" Tool from the hotbar; the
	server builds the board under their feet, sets the speed and switches the normal jump off,
	see the server's Hoverboard.lua):
	  * CHARGED JUMP: hold Space, gamepad A or the JUMP button (phones and tablets: it sits where
	    the normal jump button was) to charge, let go to jump. A quick tap is a normal jump
	    (Config.Hoverboard.MinJumpHeight); holding for ChargeSeconds jumps MaxJumpMultiplier times
	    as high. A bar above the hotbar fills up while you charge. A jump only starts from the
	    ground (no jumping again in the air).
	  * the walk / run animation stops: you stand on the board (it comes back when you step off)
	  * every board on this screen bobs and leans a little (drawn here only: no network traffic)
	StarterPlayerScripts don't restart on respawn, so all of this follows the current character.
]]

local ContextActionService = game:GetService("ContextActionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local Workspace = game:GetService("Workspace")

local player = Players.LocalPlayer
local Shared = ReplicatedStorage:WaitForChild("TycoonShared")
local Config = require(Shared:WaitForChild("Config"))

local settings = Config.Hoverboard
local JUMP_ACTION = "TycoonHoverboardJump"
-- above the normal jump (the character controls bind Space / A at Medium) and below the kick
-- meter and the mini-games (High), which still get Space / A while they are open
local JUMP_PRIORITY = Enum.ContextActionPriority.Medium.Value + 500
local LAUNCH_TIMEOUT = 0.5 -- a charged jump that hasn't left the ground by then is given up
local DARK = Color3.fromRGB(18, 22, 30)
local GREEN = Color3.fromRGB(70, 210, 110)
local GOLD = Color3.fromRGB(255, 196, 37)
local BOB_HEIGHT = 0.07 -- studs
local BOB_SPEED = 2.4 -- radians per second
local MAX_PITCH = math.rad(4) -- the nose lifts a little at full speed...
local MAX_ROLL = math.rad(7) -- ...and the board leans into turns

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

-- the charge bar, above the hotbar
local screen = create("ScreenGui", {
	Name = "HoverboardUI",
	ResetOnSpawn = false,
	Parent = player:WaitForChild("PlayerGui"),
})
local bar = create("Frame", {
	Name = "ChargeBar",
	AnchorPoint = Vector2.new(0.5, 1),
	Position = UDim2.new(0.5, 0, 1, -100),
	Size = UDim2.new(0, 240, 0, 14),
	BackgroundColor3 = DARK,
	BackgroundTransparency = 0.2,
	Visible = false,
	Parent = screen,
}, {
	corner(7),
	create("UIStroke", { Color = Color3.new(1, 1, 1), Thickness = 1.5, Transparency = 0.35 }),
})
local fill = create("Frame", {
	Name = "Fill",
	Size = UDim2.new(0, 0, 1, 0),
	BackgroundColor3 = GREEN,
	BorderSizePixel = 0,
	Parent = bar,
}, { corner(7) })
local label = create("TextLabel", {
	Name = "Label",
	AnchorPoint = Vector2.new(0.5, 1),
	Position = UDim2.new(0.5, 0, 0, -3),
	Size = UDim2.new(1, 0, 0, 20),
	BackgroundTransparency = 1,
	Font = Enum.Font.GothamBlack,
	TextScaled = true,
	TextColor3 = Color3.new(1, 1, 1),
	TextStrokeTransparency = 0.4,
	Text = "",
	Parent = bar,
})

---------------------------------------------------------------------------------------------
local riding = nil -- { character, humanoid, root, tool } while the local player rides
local chargeStarted = nil -- os.clock() when the jump button went down (while it is held)
local launch = nil -- a charged jump on its way (see updateLaunch)
local stance = nil -- { character, humanoid, animate, track }: the animations paused while riding
local motion = setmetatable({}, { __mode = "k" }) -- [BoardWeld] = { pitch, roll, position, yaw, phase }

-- The board Tool the character holds (rides), or nil.
local function equippedBoard(character)
	for _, child in ipairs(character:GetChildren()) do
		if child:IsA("Tool") and child:GetAttribute("Hoverboard") == true then
			return child
		end
	end
	return nil
end

-- 0..1: how far the jump is charged (a short tap stays at 0: a normal jump).
local function chargeFraction()
	if not chargeStarted then
		return 0
	end
	local tap = settings.TapSeconds or 0
	local full = math.max(settings.ChargeSeconds - tap, 0.01)
	return math.clamp((os.clock() - chargeStarted - tap) / full, 0, 1)
end

-- Jump height (studs) for a charge of 0..1: a normal jump, up to MaxJumpMultiplier times as high.
local function jumpHeight(fraction)
	return settings.MinJumpHeight * (1 + (settings.MaxJumpMultiplier - 1) * fraction)
end

-- A jump only starts from the ground.
local function canJumpNow(humanoid)
	if humanoid.Health <= 0 or humanoid.FloorMaterial == Enum.Material.Air then
		return false
	end
	local state = humanoid:GetState()
	return state ~= Enum.HumanoidStateType.Jumping
		and state ~= Enum.HumanoidStateType.Freefall
		and state ~= Enum.HumanoidStateType.Seated
		and state ~= Enum.HumanoidStateType.Dead
end

-- Jumps `height` studs: the humanoid's own jump, with its jump set to that height for a moment
-- (the server keeps it at 0 while riding, so the normal jump does nothing).
local function startLaunch(humanoid, root, height)
	local speed = math.sqrt(2 * Workspace.Gravity * height)
	local usePower = humanoid.UseJumpPower
	local record = {
		humanoid = humanoid,
		root = root,
		speed = speed,
		started = os.clock(),
		usePower = usePower,
		before = usePower and humanoid.JumpPower or humanoid.JumpHeight,
	}
	if usePower then
		humanoid.JumpPower = speed
		record.value = humanoid.JumpPower
	else
		humanoid.JumpHeight = height
		record.value = humanoid.JumpHeight
	end
	launch = record
	humanoid:ChangeState(Enum.HumanoidStateType.Jumping)
end

-- The frames after a charged jump: once it is in the air, make sure it left at the right speed,
-- then put the jump setting back (unless the server changed it in the meantime).
local function updateLaunch()
	local record = launch
	if not record then
		return
	end
	local humanoid, root = record.humanoid, record.root
	local elapsed = os.clock() - record.started
	local state = humanoid.Parent and humanoid:GetState()
	local airborne = state == Enum.HumanoidStateType.Jumping or state == Enum.HumanoidStateType.Freefall
	if not airborne and humanoid.Parent and elapsed < LAUNCH_TIMEOUT then
		return -- (the jump starts in the next physics step)
	end
	launch = nil
	if airborne and root.Parent then
		local velocity = root.AssemblyLinearVelocity
		local expected = record.speed - Workspace.Gravity * elapsed
		if expected > 0 and velocity.Y < expected * 0.5 then
			root.AssemblyLinearVelocity = Vector3.new(velocity.X, expected, velocity.Z)
		end
	end
	if record.usePower then
		if humanoid.JumpPower == record.value then
			humanoid.JumpPower = record.before
		end
	elseif humanoid.JumpHeight == record.value then
		humanoid.JumpHeight = record.before
	end
end

local function showCharge()
	local fraction = chargeFraction()
	bar.Visible = chargeStarted ~= nil
	fill.Size = UDim2.new(fraction, 0, 1, 0)
	fill.BackgroundColor3 = GREEN:Lerp(GOLD, fraction)
	if fraction >= 1 then
		label.Text = ("MAX JUMP x%d!"):format(settings.MaxJumpMultiplier)
	else
		label.Text = ("JUMP x%.1f"):format(jumpHeight(fraction) / settings.MinJumpHeight)
	end
end

local function cancelCharge()
	chargeStarted = nil
	bar.Visible = false
end

-- Space / gamepad A / the JUMP touch button: press to charge, let go to jump. Always sunk, so the
-- normal jump never fires as well.
local function onJumpAction(_, inputState)
	if inputState == Enum.UserInputState.Begin then
		if riding and not chargeStarted then
			chargeStarted = os.clock()
			showCharge()
		end
	elseif inputState == Enum.UserInputState.End then
		local charging = chargeStarted ~= nil
		local fraction = chargeFraction()
		cancelCharge()
		if charging and riding and not launch and canJumpNow(riding.humanoid) then
			startLaunch(riding.humanoid, riding.root, jumpHeight(fraction))
		end
	elseif inputState == Enum.UserInputState.Cancel then
		cancelCharge()
	end
	return Enum.ContextActionResult.Sink
end

-- Phones and tablets: the JUMP button goes where the normal jump button sits (that one hides
-- while riding, because the normal jump is 0).
local function placeTouchButton()
	if not UserInputService.TouchEnabled then
		return
	end
	local ok, viewport = pcall(function()
		return Workspace.CurrentCamera.ViewportSize
	end)
	if not ok or typeof(viewport) ~= "Vector2" or viewport.X <= 1 then
		viewport = Vector2.new(1024, 768) -- (the camera isn't ready yet)
	end
	local small = math.min(viewport.X, viewport.Y) <= 500
	local size = small and 70 or 120
	ContextActionService:SetTitle(JUMP_ACTION, "JUMP")
	ContextActionService:SetPosition(JUMP_ACTION, UDim2.new(1, -(size * 1.5 - 10), 1, small and -size - 20 or -size * 1.75))
	local button = ContextActionService:GetButton(JUMP_ACTION)
	if button then
		button.Size = UDim2.new(0, size, 0, size)
	end
end

-- Stops the walk / run animations (the default Animate script pauses) so the rider stands on
-- the board, playing the character's own idle animation over everything else.
local function pauseAnimations(character, humanoid)
	local record = { character = character, humanoid = humanoid }
	stance = record
	local animate = character:FindFirstChild("Animate")
	if animate and animate:IsA("BaseScript") and animate.Enabled then
		animate.Enabled = false
		record.animate = animate
	end
	local animator = humanoid:FindFirstChildOfClass("Animator")
	if not animator then
		return
	end
	for _, track in ipairs(animator:GetPlayingAnimationTracks()) do
		track:Stop(0.15)
	end
	local idle = animate and animate:FindFirstChild("idle")
	local animation = idle and idle:FindFirstChildWhichIsA("Animation")
	if animation then
		local ok, track = pcall(function()
			return animator:LoadAnimation(animation)
		end)
		if ok and track then
			track.Priority = Enum.AnimationPriority.Action
			track.Looped = true
			track:Play(0.2)
			record.track = track
		end
	end
end

local function resumeAnimations()
	local record = stance
	stance = nil
	if not record then
		return
	end
	if record.track then
		record.track:Stop(0.2)
	end
	local animate = record.animate
	if animate and animate.Parent == record.character and record.humanoid.Health > 0 then
		animate.Enabled = true -- (it starts again from the top: idle, walk, run...)
	end
end

local function startRiding(character, humanoid, root, tool)
	riding = { character = character, humanoid = humanoid, root = root, tool = tool }
	ContextActionService:BindActionAtPriority(
		JUMP_ACTION,
		onJumpAction,
		true, -- (a JUMP button on touch screens)
		JUMP_PRIORITY,
		Enum.KeyCode.Space,
		Enum.KeyCode.ButtonA
	)
	pauseAnimations(character, humanoid)
	placeTouchButton()
end

local function stopRiding()
	riding = nil
	cancelCharge()
	ContextActionService:UnbindAction(JUMP_ACTION)
	resumeAnimations()
end

-- Every board on this screen bobs gently and leans a little: the nose lifts with speed and the
-- board leans into turns (around the server's weld offset, the BoardWeld's BaseC0 attribute).
local function animateBoards(dt)
	if dt <= 0 then
		return
	end
	local now = os.clock()
	local blend = 1 - math.exp(-dt * 6)
	for _, other in ipairs(Players:GetPlayers()) do
		local character = other.Character
		local tool = character and equippedBoard(character)
		local deck = tool and tool:FindFirstChild("BoardDeck")
		local joint = deck and deck:FindFirstChild("BoardWeld")
		local base = joint and joint:GetAttribute("BaseC0")
		local root = joint and joint.Part0
		if typeof(base) == "CFrame" and root then
			local cframe = root.CFrame
			local look = cframe.LookVector
			local yaw = math.atan2(-look.X, -look.Z)
			local state = motion[joint]
			if not state then
				state = { pitch = 0, roll = 0, position = cframe.Position, yaw = yaw, phase = math.random() * math.pi * 2 }
				motion[joint] = state
			end
			local moved = cframe.Position - state.position
			local speed = Vector3.new(moved.X, 0, moved.Z).Magnitude / dt
			local turn = (yaw - state.yaw + math.pi) % (2 * math.pi) - math.pi
			state.position, state.yaw = cframe.Position, yaw
			local pitch = MAX_PITCH * math.clamp(speed / settings.Speed, 0, 1)
			local roll = MAX_ROLL * math.clamp(turn / dt * 0.08, -1, 1)
			state.pitch += (pitch - state.pitch) * blend
			state.roll += (roll - state.roll) * blend
			local bob = math.sin(now * BOB_SPEED + state.phase) * BOB_HEIGHT
			joint.C0 = base * CFrame.new(0, bob, 0) * CFrame.Angles(state.pitch, 0, state.roll)
		end
	end
end

local function update(dt)
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	local root = character and character:FindFirstChild("HumanoidRootPart")
	local tool = character and equippedBoard(character)
	local alive = humanoid ~= nil and humanoid.Health > 0
	if tool and alive and humanoid.SeatPart then
		humanoid:UnequipTools() -- (sitting down puts the board away; the server does it too)
		tool = nil
	end
	local ride = riding
	if ride and (ride.character ~= character or ride.tool ~= tool or not alive) then
		stopRiding()
	end
	if tool and alive and root and not riding then
		startRiding(character, humanoid, root, tool)
	end
	updateLaunch()
	if chargeStarted then
		showCharge()
	end
	animateBoards(dt)
end

RunService.RenderStepped:Connect(function(dt)
	local ok, err = pcall(update, dt)
	if not ok then
		warn("[Hoverboard] " .. tostring(err))
	end
end)
