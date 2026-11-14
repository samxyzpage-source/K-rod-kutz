--[[
	Interact (client)
	The player's side of the "Interact" prompts (see TycoonShared.Interact):
	  * look cards: "Press E to look" shows a card with a description, plus live info from the
	    plot owner's team (record, roster names on lockers, titles...)
	  * TV camera seats: sitting in a press box / broadcast booth seat switches to a TV-style
	    camera with a LIVE badge and a score bug; jump to stand up
	  * mini-games: lift weights, arcade "Pigskin Catch", ping-pong rally, press conference
	    (results go to the server through the UseResult remote)
	  * a fade when you ride an elevator
]]

local ContextActionService = game:GetService("ContextActionService")
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ProximityPromptService = game:GetService("ProximityPromptService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local Workspace = game:GetService("Workspace")

local player = Players.LocalPlayer
local Shared = ReplicatedStorage:WaitForChild("TycoonShared")
local Format = require(Shared:WaitForChild("Format"))
local Interact = require(Shared:WaitForChild("Interact"))
local remotes = ReplicatedStorage:WaitForChild("TycoonRemotes")
local useResult = remotes:WaitForChild("UseResult")
local transition = remotes:WaitForChild("Transition")

local DARK = Color3.fromRGB(18, 22, 30)
local GOLD = Color3.fromRGB(255, 196, 37)
local WHITE = Color3.new(1, 1, 1)
local RED = Color3.fromRGB(220, 40, 40)
local CARD_SECONDS = 12
local CARD_DISTANCE = 18 -- the card closes when you walk this far away
local GAME_DISTANCE = 20 -- mini-games end when you walk this far away
local GAME_ACTION = "TycoonMiniGame"

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

local function text(props)
	props.BackgroundTransparency = props.BackgroundTransparency or 1
	props.Font = props.Font or Enum.Font.GothamBold
	props.TextColor3 = props.TextColor3 or WHITE
	props.TextScaled = true
	props.TextWrapped = true
	return create("TextLabel", props)
end

local function decode(json)
	if type(json) ~= "string" or json == "" then
		return {}
	end
	local ok, result = pcall(function()
		return HttpService:JSONDecode(json)
	end)
	return ok and type(result) == "table" and result or {}
end

local function clock(seconds)
	seconds = math.max(0, math.floor(seconds))
	return ("%d:%02d"):format(math.floor(seconds / 60), seconds % 60)
end

local screen = create("ScreenGui", {
	Name = "InteractUI",
	ResetOnSpawn = false,
	DisplayOrder = 5,
	ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
	Parent = player:WaitForChild("PlayerGui"),
})

---------------------------------------------------------------------------------------------
-- Plot + owner lookups
---------------------------------------------------------------------------------------------

local function plotModelOf(instance)
	local node = instance
	while node and node ~= Workspace and node ~= game do
		if node:GetAttribute("PlotIndex") ~= nil then
			return node
		end
		node = node.Parent
	end
	return nil
end

local function ownerOf(model)
	local userId = model and model:GetAttribute("OwnerUserId")
	return userId and Players:GetPlayerByUserId(userId) or nil
end

local function hostPart(prompt)
	local host = prompt.Parent
	if host and host:IsA("Attachment") then
		host = host.Parent
	end
	return host and host:IsA("BasePart") and host or nil
end

local function rootPosition()
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	return root and root.CFrame.Position or nil
end

local function distanceTo(part)
	local position = rootPosition()
	if not position or not part or part.Parent == nil then
		return math.huge
	end
	return (part.CFrame.Position - position).Magnitude
end

-- Live info for a LookKey (from the plot owner's attributes).
local function lookText(key, model)
	local owner = ownerOf(model)
	if key == "team" then
		local team = model and model:GetAttribute("TeamName")
		return team and ("Team: " .. team) or "No team has claimed this franchise yet."
	end
	if not owner then
		return "This franchise has no owner yet - claim it at the gold gate!"
	end
	local function get(name, default)
		local value = owner:GetAttribute(name)
		if value == nil then
			return default
		end
		return value
	end
	if key == "record" then
		return ("Record: %s   |   %s"):format(get("Record", "0-0"), get("Season", ""))
	elseif key == "season" then
		return get("Season", "Season 1")
	elseif key == "titles" then
		local titles = get("Titles", 0)
		if titles == 0 then
			return "No championships yet - win the playoffs to fill this case!"
		end
		return ("Championships won: %d"):format(titles)
	elseif key == "rating" then
		return ("Team rating: %d"):format(get("TeamRating", 0))
	elseif key == "owner" then
		return "Owner: " .. owner.DisplayName
	elseif key == "draft" then
		if get("DraftUnlocked", false) then
			return ("Next draft pick: %s  -  open the ROSTER screen."):format(Format.MoneyExact(get("DraftCost", 0)))
		end
		return "Finish the Draft Board step to unlock the draft."
	elseif key == "quests" then
		return ("Quests done: %d / %d"):format(get("QuestsDone", 0), get("QuestsTotal", 0))
	end
	local pos = key:match("^roster:(%u+)$")
	if pos then
		for _, entry in ipairs(decode(get("Roster", ""))) do
			if entry.Pos == pos and type(entry.Name) == "string" and entry.Name ~= "" then
				return ("Starting %s: %s (rating %d)"):format(pos, entry.Name, tonumber(entry.Rating) or 0)
			end
		end
		return ("No starting %s yet - draft one from the ROSTER screen!"):format(pos)
	end
	local n = tonumber(key:match("^locker:(%d+)$"))
	if n then
		local entry = decode(get("RosterAll", ""))[n]
		if type(entry) == "table" and type(entry.Name) == "string" then
			return ("%s's locker  -  %s, rating %d"):format(entry.Name, tostring(entry.Pos), tonumber(entry.Rating) or 0)
		end
		return "An empty locker. Draft more players to fill it!"
	end
	return nil
end

---------------------------------------------------------------------------------------------
-- Look cards
---------------------------------------------------------------------------------------------

local card = create("Frame", {
	Name = "LookCard",
	AnchorPoint = Vector2.new(0.5, 1),
	Position = UDim2.new(0.5, 0, 0.74, 0),
	Size = UDim2.new(0.92, 0, 0, 150),
	BackgroundColor3 = DARK,
	BackgroundTransparency = 0.08,
	Visible = false,
	Parent = screen,
}, {
	corner(14),
	create("UISizeConstraint", { MaxSize = Vector2.new(480, 150) }),
	create("UIStroke", { Color = GOLD, Thickness = 2 }),
})
local cardTitle = text({
	Name = "Title",
	Position = UDim2.new(0, 14, 0, 8),
	Size = UDim2.new(1, -64, 0, 28),
	Font = Enum.Font.GothamBlack,
	TextColor3 = GOLD,
	TextXAlignment = Enum.TextXAlignment.Left,
	Text = "",
	Parent = card,
})
local cardInfo = text({
	Name = "Info",
	Position = UDim2.new(0, 14, 0, 40),
	Size = UDim2.new(1, -28, 0, 66),
	Font = Enum.Font.Gotham,
	TextXAlignment = Enum.TextXAlignment.Left,
	TextYAlignment = Enum.TextYAlignment.Top,
	Text = "",
	Parent = card,
})
local cardLive = text({
	Name = "Live",
	Position = UDim2.new(0, 14, 1, -38),
	Size = UDim2.new(1, -28, 0, 26),
	TextColor3 = Color3.fromRGB(130, 230, 160),
	TextXAlignment = Enum.TextXAlignment.Left,
	Text = "",
	Parent = card,
})
local cardClose = create("TextButton", {
	Name = "Close",
	AnchorPoint = Vector2.new(1, 0),
	Position = UDim2.new(1, -8, 0, 8),
	Size = UDim2.new(0, 36, 0, 30),
	BackgroundColor3 = Color3.fromRGB(190, 52, 52),
	Font = Enum.Font.GothamBlack,
	TextColor3 = WHITE,
	TextScaled = true,
	Text = "X",
	Parent = card,
}, { corner(8) })

local cardState = { token = 0, host = nil }

local function hideCard()
	cardState.token += 1
	cardState.host = nil
	card.Visible = false
end
cardClose.Activated:Connect(hideCard)

local function showCard(prompt)
	local title = prompt:GetAttribute("Title")
	if type(title) ~= "string" or title == "" then
		title = prompt.ObjectText
	end
	local info = prompt:GetAttribute("Info")
	info = type(info) == "string" and info or ""
	local key = prompt:GetAttribute("LookKey")
	local live = Interact.IsLookKey(key) and lookText(key, plotModelOf(prompt)) or nil
	if info == "" and not live then
		return false
	end
	cardTitle.Text = title ~= "" and title or "Look"
	cardInfo.Text = info
	cardLive.Text = live or ""
	cardLive.Visible = live ~= nil
	cardInfo.Size = UDim2.new(1, -28, 0, live and 66 or 96)
	card.Visible = true
	cardState.token += 1
	cardState.host = hostPart(prompt)
	local token = cardState.token
	task.delay(CARD_SECONDS, function()
		if cardState.token == token then
			hideCard()
		end
	end)
	return true
end

---------------------------------------------------------------------------------------------
-- Camera override (TV seats, press conference)
---------------------------------------------------------------------------------------------

local cameraOverride = nil -- { cframe, fov, started }
local savedCamera = nil -- { type, fov }

local function setCamera(cframe, fov)
	local camera = Workspace.CurrentCamera
	if not camera then
		return
	end
	if not savedCamera then
		savedCamera = { type = camera.CameraType, fov = camera.FieldOfView }
	end
	cameraOverride = { cframe = cframe, fov = fov or 50, started = os.clock() }
	camera.CameraType = Enum.CameraType.Scriptable
	camera.FieldOfView = cameraOverride.fov
	camera.CFrame = cframe
end

local function clearCamera()
	cameraOverride = nil
	local camera = Workspace.CurrentCamera
	if camera and savedCamera then
		camera.CameraType = savedCamera.type
		camera.FieldOfView = savedCamera.fov
	end
	savedCamera = nil
end

---------------------------------------------------------------------------------------------
-- TV camera seats
---------------------------------------------------------------------------------------------

local tv = create("Frame", {
	Name = "TVOverlay",
	Size = UDim2.new(1, 0, 1, 0),
	BackgroundTransparency = 1,
	Visible = false,
	Parent = screen,
})
local liveBadge = text({
	Name = "LiveBadge",
	Position = UDim2.new(0, 16, 0, 60),
	Size = UDim2.new(0, 260, 0, 34),
	BackgroundTransparency = 0,
	BackgroundColor3 = RED,
	Font = Enum.Font.GothamBlack,
	Text = "LIVE",
	Parent = tv,
})
corner(6).Parent = liveBadge
local scoreBug = text({
	Name = "ScoreBug",
	AnchorPoint = Vector2.new(0.5, 1),
	Position = UDim2.new(0.5, 0, 1, -24),
	Size = UDim2.new(0.9, 0, 0, 44),
	BackgroundTransparency = 0.1,
	BackgroundColor3 = DARK,
	Font = Enum.Font.GothamBlack,
	Text = "",
	Parent = tv,
})
corner(8).Parent = scoreBug
create("UISizeConstraint", { MaxSize = Vector2.new(620, 44), Parent = scoreBug })
text({
	Name = "Hint",
	AnchorPoint = Vector2.new(0.5, 1),
	Position = UDim2.new(0.5, 0, 1, -74),
	Size = UDim2.new(0.6, 0, 0, 22),
	TextColor3 = Color3.fromRGB(220, 220, 225),
	TextStrokeTransparency = 0.4,
	Text = "Jump (Space) to stand up",
	Parent = tv,
})

local tvSeat = nil

local function scoreBugText(seat)
	local model = plotModelOf(seat)
	local team = model and model:GetAttribute("TeamName") or "HOME"
	local home = model and model:GetAttribute("HomeScore") or 0
	local away = model and model:GetAttribute("AwayScore") or 0
	-- this plot's own game day (GameDay.lua keeps it on the plot model; the owner starts it)
	local status = ""
	local gameStatus = model and model:GetAttribute("GameDayStatus")
	local now = Workspace:GetServerTimeNow()
	if gameStatus == "active" then
		status = "GAME DAY  " .. clock((model:GetAttribute("GameDayEndsAt") or now) - now)
	elseif gameStatus == "cooldown" then
		status = "NEXT GAME " .. clock((model:GetAttribute("NextGameReadyAt") or now) - now)
	elseif gameStatus == "ready" then
		status = "READY FOR KICK-OFF"
	end
	return ("%s  %d   -   %d  VISITORS      %s"):format(team, home, away, status)
end

-- (prompts are hidden in the TV view: their bubbles would float in the middle of the shot)
local function enterTV(seat)
	tvSeat = seat
	liveBadge.Text = "LIVE  |  " .. tostring(seat:GetAttribute("CameraLabel") or "TV")
	scoreBug.Text = scoreBugText(seat)
	tv.Visible = true
	ProximityPromptService.Enabled = false
	setCamera(seat:GetAttribute("CameraCFrame"), seat:GetAttribute("CameraFov") or 40)
end

local function exitTV()
	tvSeat = nil
	tv.Visible = false
	ProximityPromptService.Enabled = true
	clearCamera()
end

local function watchCharacter(character)
	local humanoid = character:WaitForChild("Humanoid", 10)
	if not humanoid then
		return
	end
	local function onSeat()
		local seat = humanoid.SeatPart
		if seat and typeof(seat:GetAttribute("CameraCFrame")) == "CFrame" then
			enterTV(seat)
		elseif tvSeat then
			exitTV()
		end
	end
	humanoid:GetPropertyChangedSignal("SeatPart"):Connect(onSeat)
	onSeat()
end

---------------------------------------------------------------------------------------------
-- Mini-games
---------------------------------------------------------------------------------------------

local panel = create("Frame", {
	Name = "MiniGame",
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.new(0.5, 0, 0.5, 0),
	Size = UDim2.new(0.92, 0, 0.72, 0),
	BackgroundColor3 = DARK,
	BackgroundTransparency = 0.05,
	Visible = false,
	Parent = screen,
}, {
	corner(16),
	create("UISizeConstraint", { MaxSize = Vector2.new(540, 400) }),
	create("UIStroke", { Color = GOLD, Thickness = 2 }),
})
local gameTitle = text({
	Name = "Title",
	Position = UDim2.new(0, 16, 0, 10),
	Size = UDim2.new(1, -80, 0, 30),
	Font = Enum.Font.GothamBlack,
	TextColor3 = GOLD,
	TextXAlignment = Enum.TextXAlignment.Left,
	Text = "",
	Parent = panel,
})
local gameInfo = text({
	Name = "Instruction",
	Position = UDim2.new(0, 16, 0, 42),
	Size = UDim2.new(1, -32, 0, 22),
	Text = "",
	Parent = panel,
})
local gameScore = text({
	Name = "Score",
	AnchorPoint = Vector2.new(0, 1),
	Position = UDim2.new(0, 16, 1, -10),
	Size = UDim2.new(1, -32, 0, 26),
	Font = Enum.Font.GothamBlack,
	Text = "",
	Parent = panel,
})
local arena = create("TextButton", {
	Name = "Arena",
	Position = UDim2.new(0, 16, 0, 72),
	Size = UDim2.new(1, -32, 1, -116),
	BackgroundColor3 = Color3.fromRGB(32, 38, 50),
	AutoButtonColor = false,
	Text = "",
	ClipsDescendants = true,
	Parent = panel,
}, { corner(10) })
local gameClose = create("TextButton", {
	Name = "Close",
	AnchorPoint = Vector2.new(1, 0),
	Position = UDim2.new(1, -10, 0, 10),
	Size = UDim2.new(0, 40, 0, 32),
	BackgroundColor3 = Color3.fromRGB(190, 52, 52),
	Font = Enum.Font.GothamBlack,
	TextColor3 = WHITE,
	TextScaled = true,
	Text = "X",
	Parent = panel,
}, { corner(8) })

local current = nil -- the running game: { kind, prompt, host, onPress, onStep, onMove, finished }

-- A prompt can shorten / lengthen a mini-game with a "Duration" attribute (seconds).
local function duration(g, default)
	local value = g.prompt:GetAttribute("Duration")
	return type(value) == "number" and value > 0 and value or default
end

local function box(name, props)
	props.Name = name
	props.BorderSizePixel = 0
	props.Parent = props.Parent or arena
	return create("Frame", props)
end

local function finishGame(score, send)
	local game_ = current
	if not game_ or game_.finished then
		return
	end
	game_.finished = true
	ContextActionService:UnbindAction(GAME_ACTION)
	if send and score then
		useResult:FireServer(game_.prompt, score)
	end
	if game_.kind == "podium" then
		clearCamera()
	end
	task.delay(send and 1.4 or 0, function()
		if current == game_ then
			current = nil
			panel.Visible = false
			for _, child in ipairs(arena:GetChildren()) do
				if not child:IsA("UICorner") then
					child:Destroy()
				end
			end
		end
	end)
end
gameClose.Activated:Connect(function()
	finishGame(nil, false)
end)

local function press()
	if current and not current.finished and current.onPress then
		current.onPress()
	end
end
arena.Activated:Connect(press)

-- LIFT: tap fast to push the bar up; every full push is a rep.
local function startLift(g)
	gameTitle.Text = "WEIGHT ROOM"
	gameInfo.Text = "Tap SPACE / E / the screen as fast as you can to lift!"
	local track = box("Track", {
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0.08, 0),
		Size = UDim2.new(0, 26, 0.84, 0),
		BackgroundColor3 = Color3.fromRGB(60, 64, 75),
	})
	corner(8).Parent = track
	local fill = box("Fill", {
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.new(0, 0, 1, 0),
		Size = UDim2.new(1, 0, 0, 0),
		BackgroundColor3 = Color3.fromRGB(90, 220, 120),
		Parent = track,
	})
	corner(8).Parent = fill
	local bar = box("Barbell", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.new(0.5, 0, 0.85, 0),
		Size = UDim2.new(0.7, 0, 0, 8),
		BackgroundColor3 = Color3.fromRGB(200, 200, 205),
	})
	for _, x in ipairs({ 0, 1 }) do
		box("Plate", {
			AnchorPoint = Vector2.new(0.5, 0.5),
			Position = UDim2.new(x, 0, 0.5, 0),
			Size = UDim2.new(0, 16, 0, 46),
			BackgroundColor3 = GOLD,
			Parent = bar,
		})
	end
	g.power, g.reps = 0, 0
	g.duration = duration(g, 12)
	g.onPress = function()
		g.power += 0.17
		if g.power >= 1 then
			g.reps += 1
			g.power = 0.15
		end
	end
	g.onStep = function(dt, elapsed)
		g.power = math.max(0, g.power - dt * 0.35)
		fill.Size = UDim2.new(1, 0, g.power, 0)
		bar.Position = UDim2.new(0.5, 0, 0.85 - g.power * 0.7, 0)
		gameScore.Text = ("REPS: %d      TIME: %d"):format(g.reps, math.ceil(g.duration - elapsed))
		if elapsed >= g.duration then
			gameInfo.Text = ("Done! %d reps."):format(g.reps)
			finishGame(g.reps, true)
		end
	end
end

-- ARCADE: Pigskin Catch - move the basket under the falling footballs.
local function startArcade(g)
	gameTitle.Text = "PIGSKIN CATCH"
	gameInfo.Text = "Move the mouse / drag / use A-D or arrows to catch footballs!"
	local basket = box("Basket", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.new(0.5, 0, 0.92, 0),
		Size = UDim2.new(0.18, 0, 0, 14),
		BackgroundColor3 = GOLD,
	})
	corner(6).Parent = basket
	g.x, g.caught, g.balls, g.nextBall, g.steer = 0.5, 0, {}, 0, 0
	g.duration = duration(g, 20)
	g.onMove = function(position)
		local size = arena.AbsoluteSize
		if size.X > 0 then
			g.x = math.clamp((position.X - arena.AbsolutePosition.X) / size.X, 0.09, 0.91)
		end
	end
	g.onStep = function(dt, elapsed)
		g.x = math.clamp(g.x + g.steer * dt * 1.4, 0.09, 0.91)
		basket.Position = UDim2.new(g.x, 0, 0.92, 0)
		if elapsed >= g.nextBall and elapsed < g.duration - 1 then
			g.nextBall = elapsed + math.max(0.35, 0.9 - elapsed * 0.025)
			local ball = box("Football", {
				AnchorPoint = Vector2.new(0.5, 0.5),
				Position = UDim2.new(math.random() * 0.8 + 0.1, 0, 0, 0),
				Size = UDim2.new(0, 22, 0, 14),
				BackgroundColor3 = Color3.fromRGB(130, 75, 40),
			})
			corner(7).Parent = ball
			table.insert(g.balls, { frame = ball, y = 0, speed = 0.35 + elapsed * 0.012 })
		end
		for index = #g.balls, 1, -1 do
			local b = g.balls[index]
			b.y += b.speed * dt
			b.frame.Position = UDim2.new(b.frame.Position.X.Scale, 0, b.y, 0)
			if b.y >= 0.88 and b.y <= 0.96 and math.abs(b.frame.Position.X.Scale - g.x) < 0.11 then
				g.caught += 1
				b.frame:Destroy()
				table.remove(g.balls, index)
			elseif b.y > 1.02 then
				b.frame:Destroy()
				table.remove(g.balls, index)
			end
		end
		gameScore.Text = ("CAUGHT: %d      TIME: %d"):format(g.caught, math.ceil(math.max(0, g.duration - elapsed)))
		if elapsed >= g.duration then
			gameInfo.Text = ("Final score: %d!"):format(g.caught)
			finishGame(g.caught, true)
		end
	end
end

-- PING-PONG: hit the ball back when it reaches your paddle (the green zone).
local function startPingPong(g)
	gameTitle.Text = "PING-PONG RALLY"
	gameInfo.Text = "Press SPACE / E / tap when the ball is in the green zone!"
	box(
		"Net",
		{ AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 0), Size = UDim2.new(0, 4, 1, 0), BackgroundColor3 = WHITE }
	)
	box("Zone", {
		Position = UDim2.new(0.8, 0, 0, 0),
		Size = UDim2.new(0.17, 0, 1, 0),
		BackgroundColor3 = Color3.fromRGB(70, 210, 110),
		BackgroundTransparency = 0.6,
	})
	box("Paddle", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.new(0.95, 0, 0.5, 0),
		Size = UDim2.new(0, 10, 0.3, 0),
		BackgroundColor3 = RED,
	})
	box("Opponent", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.new(0.05, 0, 0.5, 0),
		Size = UDim2.new(0, 10, 0.3, 0),
		BackgroundColor3 = Color3.fromRGB(60, 140, 230),
	})
	local ball = box("Ball", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.new(0.5, 0, 0.5, 0),
		Size = UDim2.new(0, 16, 0, 16),
		BackgroundColor3 = WHITE,
	})
	corner(8).Parent = ball
	g.bx, g.dir, g.speed, g.hits = 0.5, 1, 0.55, 0
	g.duration = duration(g, 90)
	g.onPress = function()
		if g.dir == 1 and g.bx >= 0.8 and g.bx <= 0.97 then
			g.hits += 1
			g.dir = -1
			g.speed = math.min(2.2, g.speed * 1.07)
		elseif g.dir == 1 and g.bx > 0.55 then
			gameInfo.Text = ("Too early! Rally: %d"):format(g.hits)
			finishGame(g.hits, true)
		end
	end
	g.onStep = function(dt, elapsed)
		g.bx += g.dir * g.speed * dt
		if g.dir == -1 and g.bx <= 0.07 then
			g.dir = 1
		end
		local y = 0.5 + math.sin(elapsed * 3.1) * 0.3
		ball.Position = UDim2.new(g.bx, 0, y, 0)
		gameScore.Text = ("RALLY: %d"):format(g.hits)
		if g.bx > 1.0 then
			gameInfo.Text = ("Missed it! Rally: %d"):format(g.hits)
			finishGame(g.hits, true)
		elseif elapsed >= g.duration then
			finishGame(g.hits, true)
		end
	end
end

-- PODIUM: answer a reporter's question.
local QUESTIONS = {
	{
		Q = "Coach, how does the team bounce back after a tough loss?",
		A = { "We get back in the weight room tomorrow.", "We learn from the film and move on.", "Next question!" },
	},
	{
		Q = "Big game coming up. Any message for the fans?",
		A = { "Get loud - we feed off your energy!", "Bring your foam fingers!", "We'll leave it all on the field." },
	},
	{
		Q = "Your stadium keeps growing. What's next?",
		A = { "More seats for more fans!", "A trophy for the Hall of Fame.", "You'll have to wait and see!" },
	},
	{
		Q = "What's the secret to your team's rating?",
		A = { "Great coaches and hard work.", "The smoothies in our cafeteria.", "Our draft board never sleeps." },
	},
}

-- Pre-game speeches (a podium whose Title mentions "speech", e.g. in the locker room)
local SPEECHES = {
	{
		Q = "The whole team is looking at you. What do you tell them?",
		A = { "Play for each other out there!", "Leave it all on the field!", "This is OUR house - defend it!" },
	},
	{
		Q = "It's the last game day speech before kickoff. Make it count!",
		A = { "Nobody believed in us. Prove them wrong!", "Have fun and play fast!", "One play at a time. Let's go!" },
	},
}

local function startPodium(g, prompt)
	local title = prompt:GetAttribute("Title")
	local speech = type(title) == "string" and title:lower():find("speech") ~= nil
	gameTitle.Text = speech and string.upper(title) or "PRESS CONFERENCE"
	local camera = prompt:GetAttribute("CameraCFrame")
	if typeof(camera) == "CFrame" then
		setCamera(camera, prompt:GetAttribute("CameraFov") or 45)
	end
	local pool = speech and SPEECHES or QUESTIONS
	local question = pool[math.random(1, #pool)]
	gameInfo.Text = speech and "The locker room goes quiet..." or "A reporter asks:"
	text({
		Name = "Question",
		Position = UDim2.new(0.04, 0, 0.04, 0),
		Size = UDim2.new(0.92, 0, 0.26, 0),
		Font = Enum.Font.GothamBlack,
		Text = '"' .. question.Q .. '"',
		Parent = arena,
	})
	for index, answer in ipairs(question.A) do
		local option = create("TextButton", {
			Name = "Answer" .. index,
			Position = UDim2.new(0.06, 0, 0.34 + (index - 1) * 0.21, 0),
			Size = UDim2.new(0.88, 0, 0.18, 0),
			BackgroundColor3 = Color3.fromRGB(40, 110, 190),
			Font = Enum.Font.GothamBold,
			TextColor3 = WHITE,
			TextScaled = true,
			Text = answer,
			Parent = arena,
		}, { corner(8) })
		option.Activated:Connect(function()
			if g.finished then
				return
			end
			gameInfo.Text = speech and "The team goes wild - they're fired up!" or "Camera flashes everywhere - the reporters loved it!"
			local flash = box("Flash", { Size = UDim2.new(1, 0, 1, 0), BackgroundColor3 = WHITE, BackgroundTransparency = 0.2 })
			flash.ZIndex = 5
			finishGame(index, true)
		end)
	end
	gameScore.Text = "Pick your answer"
end

local GAMES = { lift = startLift, arcade = startArcade, pingpong = startPingPong, podium = startPodium }

local function startGame(kind, prompt)
	if current or not GAMES[kind] then
		return
	end
	hideCard()
	local g = { kind = kind, prompt = prompt, host = hostPart(prompt), started = os.clock(), finished = false }
	current = g
	panel.Visible = true
	gameScore.Text = ""
	GAMES[kind](g, prompt)
	ContextActionService:BindActionAtPriority(
		GAME_ACTION,
		function(_, state, input)
			if state == Enum.UserInputState.Begin then
				local key = input.KeyCode
				if key == Enum.KeyCode.A or key == Enum.KeyCode.Left then
					g.steer = -1
				elseif key == Enum.KeyCode.D or key == Enum.KeyCode.Right then
					g.steer = 1
				else
					press()
				end
			elseif state == Enum.UserInputState.End then
				g.steer = 0
			end
			return Enum.ContextActionResult.Sink
		end,
		false,
		3000,
		Enum.KeyCode.Space,
		Enum.KeyCode.E,
		Enum.KeyCode.ButtonA,
		Enum.KeyCode.A,
		Enum.KeyCode.D,
		Enum.KeyCode.Left,
		Enum.KeyCode.Right
	)
end

UserInputService.InputChanged:Connect(function(input)
	if
		current
		and current.onMove
		and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch)
	then
		current.onMove(input.Position)
	end
end)

---------------------------------------------------------------------------------------------
-- Elevator fade
---------------------------------------------------------------------------------------------

local fade = create("Frame", {
	Name = "Fade",
	Size = UDim2.new(1, 0, 1, 0),
	BackgroundColor3 = Color3.new(0, 0, 0),
	BackgroundTransparency = 1,
	Visible = false,
	ZIndex = 10,
	Parent = screen,
})
local fadeLabel = text({
	Name = "Label",
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.new(0.5, 0, 0.5, 0),
	Size = UDim2.new(0.6, 0, 0, 40),
	Font = Enum.Font.GothamBlack,
	TextColor3 = GOLD,
	TextTransparency = 1,
	ZIndex = 11,
	Text = "",
	Parent = fade,
})
local fadeToken = 0

transition.OnClientEvent:Connect(function(label)
	fadeToken += 1
	local token = fadeToken
	fade.Visible = true
	fadeLabel.Text = type(label) == "string" and label or ""
	local started = os.clock()
	task.spawn(function()
		while fadeToken == token do
			local t = os.clock() - started
			local alpha
			if t < 0.3 then
				alpha = t / 0.3
			elseif t < 0.8 then
				alpha = 1
			elseif t < 1.2 then
				alpha = 1 - (t - 0.8) / 0.4
			else
				fade.Visible = false
				break
			end
			fade.BackgroundTransparency = 1 - alpha
			fadeLabel.TextTransparency = 1 - alpha
			task.wait()
		end
	end)
end)

---------------------------------------------------------------------------------------------
-- Wiring
---------------------------------------------------------------------------------------------

ProximityPromptService.PromptTriggered:Connect(function(prompt)
	if prompt.Name ~= Interact.PromptName then
		return
	end
	local kind = prompt:GetAttribute("Kind")
	if kind == "use" then
		local spec = Interact.Uses[prompt:GetAttribute("Use")]
		if spec and spec.Game then
			startGame(spec.Game, prompt)
			return
		end
	end
	if kind ~= "seat" and kind ~= "elevator" then
		showCard(prompt)
	end
end)

RunService.RenderStepped:Connect(function(dt)
	if cameraOverride then
		local camera = Workspace.CurrentCamera
		if camera then
			local t = os.clock() - cameraOverride.started
			-- a gentle broadcast-camera drift
			camera.CFrame = cameraOverride.cframe * CFrame.Angles(math.sin(t * 0.3) * 0.01, math.sin(t * 0.21) * 0.02, 0)
		end
	end
	if current and not current.finished then
		if current.host and distanceTo(current.host) > GAME_DISTANCE then
			finishGame(nil, false)
		elseif current.onStep then
			current.onStep(math.min(dt, 0.1), os.clock() - current.started)
		end
	end
	if card.Visible and cardState.host and distanceTo(cardState.host) > CARD_DISTANCE then
		hideCard()
	end
end)

task.spawn(function()
	while true do
		task.wait(0.5)
		if tvSeat then
			scoreBug.Text = scoreBugText(tvSeat)
		end
	end
end)

player.CharacterAdded:Connect(function(character)
	if tvSeat then
		exitTV()
	end
	watchCharacter(character)
end)
if player.Character then
	task.spawn(watchCharacter, player.Character)
end
