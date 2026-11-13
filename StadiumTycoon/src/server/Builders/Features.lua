--[[
	Features
	The "big league" upgrades that sit around and above the full seating bowl. Every piece is
	bought in STEPS (see Items.lua); BuildUtil.Stage(ctx, n) marks the parts of step n.

	  scoreboard  east, outside the bowl, its LED face toward the field (-X)
	                1 Support Legs   two braced steel legs + girder, a control box at their feet
	                2 Board Frame    team-coloured housing with a dark LED frame, a rear service
	                                 catwalk (the maintenance ladder rides you up and down) with
	                                 the operator's seat (SCOREBOARD CAM)
	                3 Screens        title / score / attendance screens, play clock, down &
	                                 distance, live record + season panels, LED strip
	  lights      four lattice flood-light towers outside the bowl corners, ONE per step, in the
	              order of Layout.LightTowerPositions (power box + ladder look prompts at the base)
	  jumbotron   west, outside the bowl, its screen toward the field (+X)
	                1 Support Tower  a concrete tower core (the walk-in Video Control Room is at its
	                                 foot, with a working door), two steel legs, the girder
	                2 Screen Frame   housing, bezel and the dark LED face
	                3 Video Screen & Speakers  the screen, a live "game day" LED ribbon, hanging
	                                 speaker arrays, and the control room's gear: monitor wall
	                                 (live), video switcher, director's SKYCAM seat, crew fridge
	  canopy      one ring roof over the upper ring, cantilevered from columns on the top row
	                1 Roof Supports  columns, tapered ribs and the ring truss round the outer edge
	                2 Sideline Roofs front + back roof, bands, fascias, downpipes
	                3 End Roofs      end roofs (notched in front of the boards) + corners
	                4 Roof Lights    light bars under the inner edge + the lighting catwalk

	(pressbox, suites and broadcast_booth live in PressLevel.lua.)

	Runtime contracts (the PlotManager finds these by name, do not rename them):
	  scoreboard  TextLabels "ScoreboardTitle", "ScoreboardScore", "ScoreboardAttendance" (step 3)
	  lights      SpotLights named "FloodLight" (start disabled) and Parts named "FloodPanel"
	              (SmoothPlastic by day, the server switches them to Neon at night)
	  jumbotron   TextLabel "JumbotronText" (step 3)
	  canopy      the same FloodLight / FloodPanel names for its roof-edge light bars (step 4)
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)

local Features = {}

local SCREEN_BLACK = Color3.fromRGB(10, 10, 14)
local FACE_DARK = Color3.fromRGB(30, 30, 36)
local STEEL = Color3.fromRGB(78, 84, 94)
local CABINET_GREY = Color3.fromRGB(104, 110, 118)
local SPEAKER_GREY = Color3.fromRGB(38, 38, 44)
local CONE_GREY = Color3.fromRGB(70, 70, 78)
local WARM_WHITE = Color3.fromRGB(255, 243, 214)
local ROOF_WHITE = Color3.fromRGB(232, 235, 240)
local CEILING_WHITE = Color3.fromRGB(226, 228, 232)
local FLOOR_DARK = Color3.fromRGB(64, 66, 74)
local DESK_DARK = Color3.fromRGB(44, 46, 52)
local FRIDGE_WHITE = Color3.fromRGB(236, 238, 240)
local SAFETY_YELLOW = Color3.fromRGB(250, 196, 28)
local INK = Color3.fromRGB(20, 20, 24)
local LED_AMBER = Color3.fromRGB(255, 196, 40)
local LED_GREEN = Color3.fromRGB(110, 255, 140)
local LED_RED = Color3.fromRGB(255, 72, 56)
local LED_WHITE = Color3.fromRGB(236, 242, 255)
local LED_CYAN = Color3.fromRGB(90, 220, 255)
local BEACON_RED = Color3.fromRGB(255, 40, 40)
local ON_AIR_RED = Color3.fromRGB(220, 24, 30)

local NO_COLLIDE = { CanCollide = false }
local GLOW = { CanCollide = false, CastShadow = false }

---------------------------------------------------------------------------------------------
-- Helpers
---------------------------------------------------------------------------------------------

local function luminance(color)
	return 0.299 * color.R + 0.587 * color.G + 0.114 * color.B
end

-- Returns `preferred` when it reads well on `background`, otherwise near-white or near-black.
local function readable(background, preferred)
	if math.abs(luminance(background) - luminance(preferred)) >= 0.3 then
		return preferred
	end
	if luminance(background) > 0.55 then
		return Color3.fromRGB(20, 20, 26)
	end
	return Color3.fromRGB(250, 250, 250)
end

-- Axis-aligned block between two corners (plot-local; each pair may be given in either order).
local function span(ctx, name, x0, x1, y0, y1, z0, z1, color, material, extra)
	x0, x1 = math.min(x0, x1), math.max(x0, x1)
	z0, z1 = math.min(z0, z1), math.max(z0, z1)
	return BuildUtil.Box(
		ctx,
		name,
		Vector3.new(x1 - x0, y1 - y0, z1 - z0),
		Vector3.new((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
		color,
		material or Enum.Material.SmoothPlastic,
		extra
	)
end

-- A square-section bar running from local point `a` to local point `b`.
local function strut(ctx, name, a, b, width, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Size = Vector3.new(width, width, (b - a).Magnitude)
	props.CFrame = CFrame.lookAt((a + b) / 2, b)
	props.Color = color
	props.Material = material or Enum.Material.Metal
	return BuildUtil.Part(ctx, props)
end

-- A vertical round post from y0 to y1.
local function post(ctx, name, x, z, y0, y1, diameter, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Position = Vector3.new(x, (y0 + y1) / 2, z)
	props.Height = y1 - y0
	props.Diameter = diameter
	props.Axis = "Y"
	props.Color = color
	props.Material = material or Enum.Material.Metal
	return BuildUtil.Cylinder(ctx, props)
end

-- The `At` offset (in `part`'s own space) that puts a prompt at plot-local `point`.
local function atPoint(ctx, part, point)
	return ctx.origin:ToObjectSpace(part.CFrame):PointToObjectSpace(point)
end

-- A thin, self-lit display panel with one TextLabel covering `face`.
-- opts: LabelName, TextColor3, BackgroundColor3, Font, PixelsPerStud, TextStrokeTransparency,
--       Live (a BuildUtil.LiveText kind: the server keeps the text up to date)
local function screen(ctx, name, size, position, face, text, opts)
	local part = BuildUtil.Box(ctx, name, size, position, SCREEN_BLACK, Enum.Material.SmoothPlastic)
	local textOpts = {
		LabelName = opts.LabelName,
		Text = text,
		TextColor3 = opts.TextColor3,
		BackgroundColor3 = opts.BackgroundColor3 or SCREEN_BLACK,
		BackgroundTransparency = 0,
		LightInfluence = 0,
		Font = opts.Font or Enum.Font.GothamBlack,
		PixelsPerStud = opts.PixelsPerStud or 16,
		TextStrokeTransparency = opts.TextStrokeTransparency,
	}
	if opts.Live then
		local _, liveLabel = BuildUtil.LiveText(part, face, opts.Live, textOpts)
		return part, liveLabel
	end
	local _, label = BuildUtil.SurfaceText(part, face, text, textOpts)
	return part, label
end

--[[
	Several text labels side by side (or stacked) on one face of a part.
	list = { { text = "...", from = 0..1, to = 0..1, top = 0..1?, bottom = 0..1?, color?, font? } }
	from/to are fractions of the face width (left to right as seen from the face),
	top/bottom optional fractions of its height (default the full height).
	glow = true: the text ignores the lighting (LED panels).
]]
local function labels(part, face, list, textColor, pixelsPerStud, glow)
	for index, entry in ipairs(list) do
		local _, label = BuildUtil.SurfaceText(part, face, entry.text, {
			LabelName = part.Name .. "Text" .. index,
			TextColor3 = entry.color or textColor,
			PixelsPerStud = pixelsPerStud or 16,
			Font = entry.font or Enum.Font.GothamBlack,
			LightInfluence = glow and 0 or nil,
		})
		local top, bottom = entry.top or 0, entry.bottom or 1
		label.Position = UDim2.new(entry.from, 0, top, 0)
		label.Size = UDim2.new(entry.to - entry.from, 0, bottom - top, 0)
	end
end

-- Steel leg with a concrete footing, from the ground up to `topY` (scoreboard / jumbotron).
-- Returns the leg.
local function boardLeg(ctx, x, z, topY, size, C)
	BuildUtil.Block(ctx, "LegFooting", Vector3.new(size + 2.4, 1, size + 2.4), Vector3.new(x, 0, z), C.ConcreteDark, Enum.Material.Concrete)
	return BuildUtil.Block(ctx, "Leg", Vector3.new(size, topY - 1, size), Vector3.new(x, 0, z), STEEL, Enum.Material.Metal, nil, 1)
end

---------------------------------------------------------------------------------------------
-- Scoreboard (east, outside the bowl)
---------------------------------------------------------------------------------------------

function Features.scoreboard(ctx)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local team = ctx.colors
	local teamName = ctx.teamName or ""

	local centreZ = L.FieldCenterZ -- 30
	local faceX = L.EndUpperOuterX + 5 -- 188: the field-facing (-X) face of the housing
	local depth = 5
	local backX = faceX + depth -- 193: the back of the housing (the catwalk side)
	local midX = faceX + depth / 2
	local width = 46 -- along Z: z 7..53
	local z0, z1 = centreZ - width / 2, centreZ + width / 2
	-- bottom clears the end upper deck's rail (y 28) as seen from the field; the top stays low
	-- enough to be seen under the canopy's notch edge from most of the field
	local bottom, top = 30, 56.6
	local girderBottom = bottom - 1.6 -- 28.4: also the floor level of the rear catwalk
	local legSize = 3
	local legZ = { centreZ - 15, centreZ + 15 }
	local legBackX = midX + legSize / 2 -- 192

	-------------------------------------------------------------------------- 1 Support Legs
	BuildUtil.Stage(ctx, 1)
	local legs = {}
	for index, z in ipairs(legZ) do
		legs[index] = boardLeg(ctx, midX, z, girderBottom, legSize, C)
	end
	local inner0, inner1 = legZ[1] + legSize / 2, legZ[2] - legSize / 2
	BuildUtil.Box(ctx, "CrossBeam", Vector3.new(1.6, 1.6, inner1 - inner0), Vector3.new(midX, 15, centreZ), STEEL, Enum.Material.Metal)
	-- X bracing in the two bays between the legs
	for _, bay in ipairs({ { 2, 14.2 }, { 15.8, girderBottom - 0.6 } }) do
		strut(ctx, "Brace", Vector3.new(midX, bay[1], inner0), Vector3.new(midX, bay[2], inner1), 0.7, STEEL)
		strut(ctx, "Brace", Vector3.new(midX, bay[1], inner1), Vector3.new(midX, bay[2], inner0), 0.7, STEEL)
	end
	BuildUtil.Box(
		ctx,
		"Girder",
		Vector3.new(depth - 1, 1.6, width - 6),
		Vector3.new(midX, girderBottom + 0.8, centreZ),
		STEEL,
		Enum.Material.Metal
	)
	BuildUtil.Look(
		legs[1],
		"Scoreboard",
		"These steel legs carry your scoreboard. Once its screens are on, it shows the score, the play clock and your team's record live.",
		{ LookKey = "record", At = atPoint(ctx, legs[1], Vector3.new(midX - legSize / 2 - 0.3, 4, legZ[1])) }
	)
	-- control box behind the second leg, a cable conduit up the leg and a status lamp
	local boxX = midX + (legSize + 2.4) / 2 + 1.2 -- just behind the footing
	local controlBox =
		BuildUtil.Block(ctx, "ControlBox", Vector3.new(1.8, 3.6, 4), Vector3.new(boxX, 0, legZ[2]), CABINET_GREY, Enum.Material.Metal)
	BuildUtil.Box(ctx, "ControlBoxLamp", Vector3.new(0.2, 0.5, 1.4), Vector3.new(boxX + 1, 3, legZ[2]), LED_GREEN, Enum.Material.Neon, GLOW)
	span(ctx, "Conduit", legBackX, legBackX + 0.5, 1, girderBottom, legZ[2] + 0.6, legZ[2] + 1.1, STEEL, Enum.Material.Metal, NO_COLLIDE)
	span(ctx, "Conduit", legBackX + 0.5, boxX - 0.9, 2.6, 3.1, legZ[2] + 0.6, legZ[2] + 1.1, STEEL, Enum.Material.Metal, NO_COLLIDE)
	BuildUtil.Look(
		controlBox,
		"Scoreboard Control Box",
		"Cables from the press box plug in here. When the crew types in a new score, it flashes up on the board a split second later.",
		{ Distance = 8 }
	)

	-------------------------------------------------------------------------- 2 Board Frame
	BuildUtil.Stage(ctx, 2)
	local housing = BuildUtil.Box(
		ctx,
		"Housing",
		Vector3.new(depth, top - bottom, width),
		Vector3.new(midX, (bottom + top) / 2, centreZ),
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	-- the team name across the upper half of the back (the catwalk gear sits below it)
	local _, backLabel = BuildUtil.SurfaceText(housing, Enum.NormalId.Right, teamName ~= "" and teamName or "SCOREBOARD", {
		LabelName = "ScoreboardBackText",
		TextColor3 = readable(team.Primary, team.Trim),
		PixelsPerStud = 6,
	})
	backLabel.Position = UDim2.new(0.05, 0, 0.06, 0)
	backLabel.Size = UDim2.new(0.9, 0, 0.42, 0)
	BuildUtil.Box(
		ctx,
		"Crown",
		Vector3.new(depth + 1, 1.6, width + 2),
		Vector3.new(midX, top + 0.8, centreZ),
		team.Secondary,
		Enum.Material.SmoothPlastic
	)
	for _, side in ipairs({ -1, 1 }) do
		BuildUtil.Box(
			ctx,
			"Wing",
			Vector3.new(depth + 0.6, top - bottom - 4, 1.2),
			Vector3.new(midX, (bottom + top) / 2, centreZ + side * (width / 2 + 0.6)),
			team.Secondary,
			Enum.Material.SmoothPlastic
		)
	end
	-- the LED frame: a dark face with team-coloured dividers between the screen rows
	span(ctx, "FacePlate", faceX - 0.2, faceX, bottom + 1, top - 1, z0 + 1, z1 - 1, FACE_DARK)
	local barX0, barX1 = faceX - 0.6, faceX - 0.2
	for _, y in ipairs({ 51.6, 42.4, 37.8 }) do
		span(ctx, "FrameBar", barX0, barX1, y - 0.2, y + 0.2, z0 + 1, z1 - 1, team.Secondary)
	end
	for _, z in ipairs({ 16.2, 43.8 }) do
		span(ctx, "FrameBar", barX0, barX1, 42.6, 51.4, z - 0.2, z + 0.2, team.Secondary)
	end
	span(ctx, "FrameBar", barX0, barX1, 33.2, 37.6, 22, 22.4, team.Secondary)

	-- Rear service catwalk along the back of the board (floor level with the girder bottom)
	local floorTop = girderBottom
	local walkX1 = backX + 4.4
	local walkZ0, walkZ1 = z0 - 1, z1 + 1
	span(ctx, "CatwalkFloor", backX, walkX1, floorTop - 0.4, floorTop, walkZ0, walkZ1, STEEL, Enum.Material.DiamondPlate)
	span(ctx, "CatwalkRail", walkX1 - 0.3, walkX1, floorTop + 3.1, floorTop + 3.4, walkZ0, walkZ1, SAFETY_YELLOW, Enum.Material.Metal)
	span(ctx, "CatwalkMidRail", walkX1 - 0.3, walkX1, floorTop + 1.5, floorTop + 1.75, walkZ0, walkZ1, SAFETY_YELLOW, Enum.Material.Metal)
	for _, z in ipairs({ walkZ0 + 0.15, centreZ, walkZ1 - 0.15 }) do
		span(ctx, "CatwalkPost", walkX1 - 0.3, walkX1, floorTop, floorTop + 3.1, z - 0.15, z + 0.15, SAFETY_YELLOW, Enum.Material.Metal)
	end
	for _, z in ipairs({ walkZ0, walkZ1 - 0.3 }) do
		span(ctx, "CatwalkEndRail", backX, walkX1 - 0.3, floorTop + 3.1, floorTop + 3.4, z, z + 0.3, SAFETY_YELLOW, Enum.Material.Metal)
	end
	for _, z in ipairs({ legZ[1] + 1.1, legZ[2] }) do
		strut(ctx, "CatwalkBracket", Vector3.new(legBackX, 21, z), Vector3.new(walkX1 - 0.4, floorTop - 0.5, z), 0.6, STEEL)
	end

	-- Maintenance ladder up the back of the first leg (the prompt rides you up / down)
	local ladderX = legBackX + 0.4
	local ladderZ = legZ[1] - 0.6
	for _, dz in ipairs({ -0.7, 0.7 }) do
		span(
			ctx,
			"LadderRail",
			ladderX - 0.12,
			ladderX + 0.12,
			1,
			bottom,
			ladderZ + dz - 0.12,
			ladderZ + dz + 0.12,
			SAFETY_YELLOW,
			Enum.Material.Metal,
			NO_COLLIDE
		)
	end
	for y = 2.2, girderBottom - 0.4, 2.4 do
		span(
			ctx,
			"LadderRung",
			ladderX - 0.1,
			ladderX + 0.1,
			y - 0.1,
			y + 0.1,
			ladderZ - 0.7,
			ladderZ + 0.7,
			SAFETY_YELLOW,
			Enum.Material.Metal,
			NO_COLLIDE
		)
	end
	local ladderSign =
		span(ctx, "LadderSign", ladderX + 0.2, ladderX + 0.3, 4.2, 5.6, ladderZ - 0.8, ladderZ + 0.8, SAFETY_YELLOW, nil, NO_COLLIDE)
	BuildUtil.SurfaceText(
		ladderSign,
		Enum.NormalId.Right,
		"CREW ONLY",
		{ LabelName = "LadderSignText", TextColor3 = INK, PixelsPerStud = 30 }
	)
	BuildUtil.Elevator(
		ctx,
		ladderSign,
		CFrame.lookAt(Vector3.new(backX + 2.2, floorTop, ladderZ + 4.6), Vector3.new(backX + 2.2, floorTop, centreZ + 4.6)),
		{ Action = "Climb the ladder", Object = "Maintenance Ladder", Label = "SCOREBOARD CATWALK" }
	)
	local ladderTop = span(
		ctx,
		"LadderTopPost",
		backX,
		backX + 0.4,
		floorTop,
		floorTop + 3.4,
		ladderZ - 0.2,
		ladderZ + 0.2,
		SAFETY_YELLOW,
		Enum.Material.Metal
	)
	BuildUtil.Elevator(
		ctx,
		ladderTop,
		CFrame.lookAt(Vector3.new(backX + 3, 0, ladderZ - 2.5), Vector3.new(faceX - 4, 0, ladderZ - 2.5)),
		{ Action = "Climb down", Object = "Maintenance Ladder", Label = "GROUND LEVEL" }
	)

	-- Behind the LEDs: a service hatch, and (at the far end of the catwalk, so the seat never
	-- blocks the walk) the operator's desk with a live score monitor
	local hatch = span(ctx, "ServiceHatch", backX, backX + 0.15, bottom + 0.3, bottom + 6.4, centreZ - 8, centreZ - 5, DESK_DARK)
	BuildUtil.Look(
		hatch,
		"Service Hatch",
		"Behind this hatch: thousands of LED bulbs and the fans that keep them cool on hot game days.",
		{ Distance = 8 }
	)
	local deskZ = walkZ1 - 3.6
	span(ctx, "OperatorDesk", backX, backX + 1.4, floorTop, floorTop + 2.8, deskZ - 2.2, deskZ + 2.2, CABINET_GREY, Enum.Material.Metal)
	local monitor = span(
		ctx,
		"OperatorMonitor",
		backX,
		backX + 0.2,
		floorTop + 3.3,
		floorTop + 5.9,
		deskZ - 1.8,
		deskZ + 1.8,
		SCREEN_BLACK,
		nil,
		NO_COLLIDE
	)
	BuildUtil.LiveText(monitor, Enum.NormalId.Right, "score", {
		LabelName = "OperatorMonitorText",
		Text = "HOME 0 - AWAY 0",
		TextColor3 = LED_AMBER,
		BackgroundColor3 = SCREEN_BLACK,
		BackgroundTransparency = 0,
		LightInfluence = 0,
		Font = Enum.Font.Arcade,
		PixelsPerStud = 24,
	})
	BuildUtil.Seat(ctx, {
		Name = "OperatorSeat",
		CFrame = CFrame.lookAt(Vector3.new(backX + 2.6, floorTop + 0.6, deskZ), Vector3.new(backX, floorTop + 0.6, deskZ)),
		Size = Vector3.new(2, 1.2, 2),
		Color = team.Secondary,
		Object = "Scoreboard Operator's Seat",
		Camera = { From = Vector3.new(176, 47, centreZ), To = Vector3.new(0, 2, centreZ), Fov = 50, Label = "SCOREBOARD CAM" },
	})

	-------------------------------------------------------------------------- 3 Screens
	BuildUtil.Stage(ctx, 3)
	-- every screen is 0.2 thick, its back against the face plate (x 187.6..187.8); the text is
	-- on the -X (Left) face of these unrotated parts
	local screenX = faceX - 0.3
	local function cell(y0, y1, za, zb)
		return Vector3.new(0.2, y1 - y0, zb - za), Vector3.new(screenX, (y0 + y1) / 2, (za + zb) / 2)
	end
	local size, position = cell(51.8, 55.6, z0 + 1, z1 - 1)
	screen(ctx, "TitleScreen", size, position, Enum.NormalId.Left, teamName ~= "" and (teamName .. " STADIUM") or "STADIUM", {
		LabelName = "ScoreboardTitle",
		TextColor3 = readable(SCREEN_BLACK, team.Trim),
		PixelsPerStud = 20,
	})
	size, position = cell(42.6, 51.4, 16.4, 43.6)
	screen(ctx, "ScoreScreen", size, position, Enum.NormalId.Left, "HOME 0  -  AWAY 0", {
		LabelName = "ScoreboardScore",
		TextColor3 = LED_AMBER,
		Font = Enum.Font.Arcade,
		PixelsPerStud = 20,
	})
	size, position = cell(38, 42.2, z0 + 1, z1 - 1)
	screen(ctx, "AttendanceScreen", size, position, Enum.NormalId.Left, "ATTENDANCE 0", {
		LabelName = "ScoreboardAttendance",
		TextColor3 = LED_GREEN,
		Font = Enum.Font.GothamBold,
		PixelsPerStud = 20,
	})
	size, position = cell(33.2, 37.6, z0 + 1, 22)
	screen(ctx, "RecordScreen", size, position, Enum.NormalId.Left, "RECORD 0-0", {
		LabelName = "ScoreboardRecord",
		Live = "record",
		TextColor3 = LED_WHITE,
		Font = Enum.Font.GothamBold,
		PixelsPerStud = 20,
	})
	size, position = cell(33.2, 37.6, 22.4, z1 - 1)
	screen(ctx, "SeasonScreen", size, position, Enum.NormalId.Left, "SEASON 1 - WEEK 1", {
		LabelName = "ScoreboardSeason",
		Live = "season",
		TextColor3 = LED_CYAN,
		Font = Enum.Font.GothamBold,
		PixelsPerStud = 20,
	})
	-- play clock (left as seen from the field) and down & distance (right)
	size, position = cell(42.6, 51.4, z0 + 1, 16)
	local clock = BuildUtil.Box(ctx, "PlayClock", size, position, SCREEN_BLACK, Enum.Material.SmoothPlastic)
	labels(clock, Enum.NormalId.Left, {
		{ text = "PLAY CLOCK", from = 0.06, to = 0.94, top = 0.06, bottom = 0.22, color = LED_WHITE },
		{ text = ":40", from = 0.06, to = 0.94, top = 0.26, bottom = 0.74, color = LED_RED, font = Enum.Font.Arcade },
		{ text = "QTR 2", from = 0.06, to = 0.94, top = 0.78, bottom = 0.94, color = LED_AMBER },
	}, LED_WHITE, 20, true)
	size, position = cell(42.6, 51.4, 44, z1 - 1)
	local downs = BuildUtil.Box(ctx, "DownDistance", size, position, SCREEN_BLACK, Enum.Material.SmoothPlastic)
	labels(downs, Enum.NormalId.Left, {
		{ text = "DOWN", from = 0.06, to = 0.94, top = 0.06, bottom = 0.22, color = LED_WHITE },
		{ text = "1ST & 10", from = 0.06, to = 0.94, top = 0.3, bottom = 0.62, color = LED_AMBER, font = Enum.Font.Arcade },
		{ text = "BALL ON 35", from = 0.06, to = 0.94, top = 0.74, bottom = 0.92, color = LED_GREEN },
	}, LED_WHITE, 20, true)
	span(
		ctx,
		"LedStrip",
		screenX - 0.1,
		screenX + 0.1,
		bottom + 1.6,
		bottom + 2.4,
		z0 + 1,
		z1 - 1,
		team.Secondary,
		Enum.Material.Neon,
		GLOW
	)
end

---------------------------------------------------------------------------------------------
-- Light towers (outside the four bowl corners)
---------------------------------------------------------------------------------------------

local LEG_TOP = 58 -- the four lattice legs meet the mast here
local LEG_FOOT = 1.2 -- top of the footing
local FOOT_OFFSET, TOP_OFFSET = 3.2, 1.2 -- leg distance from the tower axis at the foot / top
local MID_PLATFORM_Y = 41 -- service platform carrying the mid bank
local MAIN_BANK_Y = 78 -- centre of the big bank on top (its beacon stays below 90)
local MID_BANK_Y = 44.5 -- centre of the smaller bank aimed at the nearby stands

-- How far the lattice legs are from the tower axis at height y.
local function legOffset(y)
	return FOOT_OFFSET + (TOP_OFFSET - FOOT_OFFSET) * (y - LEG_FOOT) / (LEG_TOP - LEG_FOOT)
end

-- A grid of FloodPanels on a dark back plate. `cframe` faces the target (Front face = -Z).
-- lit = list of { column, row, angle, brightness } panels that carry a FloodLight SpotLight.
-- Returns the plate size and the number of panels.
local function floodBank(ctx, cframe, columns, rows, panelSize, lit)
	local gap = 0.4
	local plateWidth = columns * (panelSize.X + gap) + gap
	local plateHeight = rows * (panelSize.Y + gap) + gap
	BuildUtil.Part(ctx, {
		Name = "LightBankPlate",
		Size = Vector3.new(plateWidth, plateHeight, 0.8),
		CFrame = cframe * CFrame.new(0, 0, 0.4),
		Color = STEEL,
		Material = Enum.Material.Metal,
	})
	local panels = {}
	for column = 1, columns do
		for row = 1, rows do
			local x = (column - (columns + 1) / 2) * (panelSize.X + gap)
			local y = (row - (rows + 1) / 2) * (panelSize.Y + gap)
			panels[column .. "," .. row] = BuildUtil.Part(ctx, {
				Name = "FloodPanel",
				Size = panelSize,
				CFrame = cframe * CFrame.new(x, y, -panelSize.Z / 2),
				Color = WARM_WHITE,
				Material = Enum.Material.SmoothPlastic,
				CastShadow = false,
			})
		end
	end
	for _, spec in ipairs(lit) do
		BuildUtil.Light(panels[spec[1] .. "," .. spec[2]], "SpotLight", {
			Name = "FloodLight",
			Enabled = false,
			Face = Enum.NormalId.Front,
			Range = 60,
			Angle = spec[3],
			Brightness = spec[4],
			Color = WARM_WHITE,
		})
	end
	return plateWidth, plateHeight, columns * rows
end

local function lightTower(ctx, name, number, base, fieldTarget, standTarget)
	local C = ctx.config.Colors
	local team = ctx.colors
	local tower = BuildUtil.Child(ctx, name)
	local toField = Vector3.new(fieldTarget.X - base.X, 0, fieldTarget.Z - base.Z).Unit
	local toStand = Vector3.new(standTarget.X - base.X, 0, standTarget.Z - base.Z).Unit
	local across = Vector3.new(-toField.Z, 0, toField.X) -- horizontal, square to toField

	BuildUtil.Block(tower, "TowerFooting", Vector3.new(8, LEG_FOOT, 8), base, C.ConcreteDark, Enum.Material.Concrete)
	-- tapered lattice legs from the wide footing up to the top platform
	for _, sx in ipairs({ -1, 1 }) do
		for _, sz in ipairs({ -1, 1 }) do
			strut(
				tower,
				"TowerLeg",
				Vector3.new(base.X + sx * FOOT_OFFSET, LEG_FOOT, base.Z + sz * FOOT_OFFSET),
				Vector3.new(base.X + sx * TOP_OFFSET, LEG_TOP, base.Z + sz * TOP_OFFSET),
				1,
				C.Metal
			)
		end
	end
	-- two square brace rings and a diagonal on every face of the bottom bay
	for _, y in ipairs({ 16, 30 }) do
		local o = legOffset(y)
		for _, s in ipairs({ -1, 1 }) do
			BuildUtil.Box(
				tower,
				"TowerBrace",
				Vector3.new(2 * o, 0.6, 0.6),
				Vector3.new(base.X, y, base.Z + s * o),
				C.Metal,
				Enum.Material.Metal
			)
			BuildUtil.Box(
				tower,
				"TowerBrace",
				Vector3.new(0.6, 0.6, 2 * o - 0.6),
				Vector3.new(base.X + s * o, y, base.Z),
				C.Metal,
				Enum.Material.Metal
			)
		end
	end
	local o16, f = legOffset(16), FOOT_OFFSET
	for _, corners in ipairs({
		{ -f, f, o16, o16 },
		{ f, -f, -o16, -o16 },
		{ f, f, o16, -o16 },
		{ -f, -f, -o16, o16 },
	}) do
		strut(
			tower,
			"TowerDiagonal",
			Vector3.new(base.X + corners[1], LEG_FOOT + 0.3, base.Z + corners[2]),
			Vector3.new(base.X + corners[3], 16, base.Z + corners[4]),
			0.5,
			C.Metal
		)
	end
	BuildUtil.Box(
		tower,
		"TowerPlatform",
		Vector3.new(5.4, 0.5, 5.4),
		Vector3.new(base.X, LEG_TOP + 0.25, base.Z),
		team.Secondary,
		Enum.Material.DiamondPlate
	)
	-- service platform part-way up (the legs pass through it), carrying the mid bank
	BuildUtil.Box(
		tower,
		"ServicePlatform",
		Vector3.new(8, 0.5, 8),
		Vector3.new(base.X, MID_PLATFORM_Y, base.Z) + toStand * 0.8,
		team.Primary,
		Enum.Material.DiamondPlate
	)

	-- main bank on top, its back resting against the mast, aimed at the field centre
	local headPosition = Vector3.new(base.X, MAIN_BANK_Y, base.Z) + toField * 1.9
	local head = CFrame.lookAt(headPosition, fieldTarget)
	local plateWidth, plateHeight, mainPanels = floodBank(tower, head, 3, 2, Vector3.new(6.4, 5.2, 0.5), {
		{ 2, 1, 60, 5 },
		{ 2, 2, 60, 5 },
	})
	BuildUtil.Part(tower, {
		Name = "LightBankVisor",
		Size = Vector3.new(plateWidth + 0.6, 0.4, 2.8),
		CFrame = head * CFrame.new(0, plateHeight / 2 + 0.2, -0.6),
		Color = team.Primary,
		Material = Enum.Material.SmoothPlastic,
	})
	BuildUtil.Ball(tower, {
		Name = "AviationBeacon",
		Position = (head * CFrame.new(0, plateHeight / 2 + 1, 0.4)).Position,
		Diameter = 1.2,
		Color = BEACON_RED,
		Material = Enum.Material.Neon,
	})

	-- The bank leans toward the field, so its lower edge ends up right over the mast. A cross-arm
	-- there carries it and the mast stops under the arm (instead of poking through the panels).
	local armTop = (head * CFrame.new(0, -plateHeight / 2, 0.4)).Position.Y
	local armCentre = Vector3.new(base.X, armTop - 0.5, base.Z)
	BuildUtil.Part(tower, {
		Name = "HeadCrossArm",
		Size = Vector3.new(plateWidth - 3, 1, 2.4),
		CFrame = CFrame.lookAt(armCentre, armCentre + toField),
		Color = STEEL,
		Material = Enum.Material.Metal,
	})
	post(tower, "TowerMast", base.X, base.Z, LEG_TOP + 0.5, armTop - 0.5, 2.2, C.Metal)

	-- Smaller bank on the service platform. A 60 stud light from the top bank can't reach the
	-- seats, so this one is aimed at the corner of the upper deck right next to the tower.
	local midPosition = Vector3.new(base.X, MID_BANK_Y, base.Z) + toStand * 3.6
	local _, _, midPanels = floodBank(tower, CFrame.lookAt(midPosition, standTarget), 2, 1, Vector3.new(3.8, 3.2, 0.5), {
		{ 1, 1, 90, 3 },
		{ 2, 1, 90, 3 },
	})

	-- Service ladder up the middle of the lattice, through the service platform to the top
	local ladderBase = Vector3.new(base.X, 0, base.Z) - toField * 1.1
	for _, s in ipairs({ -1, 1 }) do
		local p = ladderBase + across * (s * 0.7)
		post(tower, "LadderRail", p.X, p.Z, LEG_FOOT, LEG_TOP, 0.25, SAFETY_YELLOW, Enum.Material.Metal, NO_COLLIDE)
	end
	local firstRung
	for step = 0, 10 do
		local centre = Vector3.new(ladderBase.X, 3 + step * 5.3, ladderBase.Z) -- y 3 .. 56
		local rung = BuildUtil.Part(tower, {
			Name = "LadderRung",
			Size = Vector3.new(0.2, 0.2, 1.4),
			CFrame = CFrame.lookAt(centre, centre + across),
			Color = SAFETY_YELLOW,
			Material = Enum.Material.Metal,
			CanCollide = false,
		})
		firstRung = firstRung or rung
	end
	BuildUtil.Look(
		firstRung,
		"Tower Ladder",
		("A long climb: %d studs up to the top platform! Crews go up here to swap the flood light bulbs."):format(LEG_TOP),
		{ Distance = 8 }
	)

	-- Power box on the outer side of the footing
	local boxPosition = Vector3.new(base.X, 1.6, base.Z) - toField * 6.2
	local powerBox = BuildUtil.Part(tower, {
		Name = "PowerBox",
		Size = Vector3.new(2.4, 3.2, 1.2),
		CFrame = CFrame.lookAt(boxPosition, boxPosition - toField),
		Color = CABINET_GREY,
		Material = Enum.Material.Metal,
	})
	-- a yellow tower-number plate across the top of its door (faces away from the field)
	local _, plate = BuildUtil.SurfaceText(powerBox, Enum.NormalId.Front, "TOWER " .. number, {
		LabelName = "PowerBoxLabel",
		TextColor3 = INK,
		BackgroundColor3 = SAFETY_YELLOW,
		BackgroundTransparency = 0,
		PixelsPerStud = 30,
	})
	plate.Position = UDim2.new(0, 0, 0.08, 0)
	plate.Size = UDim2.new(1, 0, 0.24, 0)
	BuildUtil.Look(
		powerBox,
		"Light Tower " .. number,
		("This tower has %d flood lights and a red warning beacon on top. They switch on by themselves at night, so the game can go on after dark."):format(
			mainPanels + midPanels
		),
		{ Distance = 8 }
	)
end

function Features.lights(ctx)
	local L = ctx.config.Layout
	local fieldTarget = Vector3.new(0, 0, L.FieldCenterZ)
	-- one complete tower per step, in the order of Layout.LightTowerPositions
	for index, base in ipairs(L.LightTowerPositions) do
		BuildUtil.Stage(ctx, index)
		local front = base.Z < L.FieldCenterZ
		local sx = base.X < 0 and -1 or 1
		-- a point a few rows into the upper deck at the corner nearest to the tower
		local standTarget =
			Vector3.new(sx * (L.EndLowerOuterX + 8), L.UpperStartHeight, front and (L.FrontLowerOuterZ - 8) or (L.BackLowerOuterZ + 8))
		local name = ("Tower%s%s"):format(front and "Front" or "Back", sx < 0 and "West" or "East")
		lightTower(ctx, name, index, base, fieldTarget, standTarget)
	end
end

---------------------------------------------------------------------------------------------
-- Jumbotron (west, outside the bowl)
---------------------------------------------------------------------------------------------

function Features.jumbotron(ctx)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local team = ctx.colors
	local teamName = ctx.teamName or ""

	local centreZ = L.FieldCenterZ -- 30
	local faceX = -(L.EndUpperOuterX + 5) -- -188: the field-facing (+X) face of the housing
	local depth = 5
	local midX = faceX - depth / 2
	local width = 52 -- along Z: z 4..56
	-- bottom clears the end upper deck's rail as seen from the field; the screen top stays under
	-- the sight line past the canopy's notch edge (about y 57-59 from the field)
	local bottom, top = 30, 58.6
	local girderBottom = bottom - 2 -- 28: the top of the tower core
	local legZ = { centreZ - 17, centreZ + 17 }
	local legSize = 3.5

	-- The tower core: concrete walls round the Video Control Room, door on the west (-X) side
	local wall = 1
	local coreX0, coreX1 = faceX - 13, faceX -- -201 .. -188
	local coreZ0, coreZ1 = centreZ - 8, centreZ + 8 -- 22 .. 38
	local rx0, rx1 = coreX0 + wall, coreX1 - wall -- room inside: x -200 .. -189
	local rz0, rz1 = coreZ0 + wall, coreZ1 - wall -- z 23 .. 37
	local roomTop = 10 -- ceiling underside
	local doorHalf, doorTop = 3, 8.6
	local coreTop = girderBottom - 0.6 -- walls stop under the cap

	-------------------------------------------------------------------------- 1 Support Tower
	BuildUtil.Stage(ctx, 1)
	local legs = {}
	for index, z in ipairs(legZ) do
		legs[index] = boardLeg(ctx, midX, z, girderBottom, legSize, C)
	end
	-- tie beams from the legs into the core
	for _, y in ipairs({ 14, 22 }) do
		span(ctx, "TieBeam", midX - 0.8, midX + 0.8, y - 0.8, y + 0.8, legZ[1] + legSize / 2, coreZ0, STEEL, Enum.Material.Metal)
		span(ctx, "TieBeam", midX - 0.8, midX + 0.8, y - 0.8, y + 0.8, coreZ1, legZ[2] - legSize / 2, STEEL, Enum.Material.Metal)
	end
	BuildUtil.Box(
		ctx,
		"Girder",
		Vector3.new(depth - 1, 2, width - 6),
		Vector3.new(midX, girderBottom + 1, centreZ),
		STEEL,
		Enum.Material.Metal
	)
	local concrete, concreteMat = C.Concrete, Enum.Material.Concrete
	span(ctx, "CoreWall", rx1, coreX1, 0, coreTop, coreZ0, coreZ1, concrete, concreteMat) -- field side
	span(ctx, "CoreWall", coreX0, rx1, 0, coreTop, coreZ0, rz0, concrete, concreteMat)
	span(ctx, "CoreWall", coreX0, rx1, 0, coreTop, rz1, coreZ1, concrete, concreteMat)
	span(ctx, "CoreWall", coreX0, rx0, 0, coreTop, rz0, centreZ - doorHalf, concrete, concreteMat)
	span(ctx, "CoreWall", coreX0, rx0, 0, coreTop, centreZ + doorHalf, rz1, concrete, concreteMat)
	span(ctx, "CoreWall", coreX0, rx0, doorTop, coreTop, centreZ - doorHalf, centreZ + doorHalf, concrete, concreteMat)
	span(ctx, "CoreRoof", coreX0 - 0.2, coreX1, coreTop, girderBottom, coreZ0 - 0.2, coreZ1 + 0.2, C.ConcreteDark, concreteMat)
	-- a team-coloured band round the core and a sign over the door
	span(ctx, "CoreBand", coreX0 - 0.15, coreX0, 12, 14, coreZ0, coreZ1, team.Primary, nil, NO_COLLIDE)
	for _, z in ipairs({ coreZ0 - 0.15, coreZ1 }) do
		span(ctx, "CoreBand", coreX0 - 0.15, coreX1, 12, 14, z, z + 0.15, team.Primary, nil, NO_COLLIDE)
	end
	local doorSign = span(
		ctx,
		"ControlRoomSign",
		coreX0 - 0.3,
		coreX0,
		doorTop + 0.6,
		doorTop + 2.6,
		centreZ - 5,
		centreZ + 5,
		team.Secondary,
		nil,
		NO_COLLIDE
	)
	BuildUtil.SurfaceText(doorSign, Enum.NormalId.Left, "VIDEO CONTROL", {
		LabelName = "ControlRoomSignText",
		TextColor3 = readable(team.Secondary, team.Primary),
		PixelsPerStud = 20,
	})

	-- the room: floor, ceiling and light (the gear arrives with the video screen in step 3), a
	-- team-coloured stripe round the side walls and a team rug inside the door
	span(ctx, "ControlRoomFloor", rx0, rx1, 0, 0.2, rz0, rz1, FLOOR_DARK)
	span(
		ctx,
		"ControlRoomRug",
		rx0 + 0.6,
		rx0 + 6.4,
		0.2,
		0.25,
		centreZ - 3.5,
		centreZ + 3.5,
		team.Primary,
		Enum.Material.Fabric,
		NO_COLLIDE
	)
	for _, z in ipairs({ rz0, rz1 - 0.1 }) do
		span(ctx, "WallStripe", rx0, rx1 - 0.3, 3.4, 4, z, z + 0.1, team.Secondary, nil, NO_COLLIDE)
	end
	span(ctx, "ControlRoomCeiling", rx0, rx1, roomTop, roomTop + 0.4, rz0, rz1, CEILING_WHITE)
	local roomLamp = span(
		ctx,
		"ControlRoomLamp",
		rx0 + 3,
		rx1 - 3,
		roomTop - 0.2,
		roomTop,
		centreZ - 1.5,
		centreZ + 1.5,
		WARM_WHITE,
		Enum.Material.Neon,
		GLOW
	)
	BuildUtil.Light(roomLamp, "PointLight", { Name = "RoomLight", Range = 22, Brightness = 1.5, Color = WARM_WHITE })
	-- the door swings into the room (+X)
	local doorHeight = doorTop - 0.1
	local doorCentre = Vector3.new(coreX0 + wall / 2, 0.05 + doorHeight / 2, centreZ)
	BuildUtil.Door(ctx, {
		Name = "ControlRoomDoor",
		Size = Vector3.new(doorHalf * 2, doorHeight, 0.4),
		CFrame = CFrame.lookAt(doorCentre, doorCentre + Vector3.new(1, 0, 0)),
		Double = true,
		Window = true,
		Color = DESK_DARK,
		Material = Enum.Material.Metal,
		Object = "Video Control Room",
		Title = "Video Control Room",
		Info = "The jumbotron crew works in here: replays, crowd cams and the giant TOUCHDOWN! graphics.",
		Distance = 8,
	})
	BuildUtil.Look(
		legs[2],
		"Jumbotron Tower",
		"This tower carries the biggest screen in your stadium. The video crew works in the control room at its foot.",
		{ At = atPoint(ctx, legs[2], Vector3.new(midX - legSize / 2 - 0.3, 4, legZ[2])) }
	)

	-------------------------------------------------------------------------- 2 Screen Frame
	BuildUtil.Stage(ctx, 2)
	local housing = BuildUtil.Box(
		ctx,
		"Housing",
		Vector3.new(depth, top - bottom, width),
		Vector3.new(midX, (bottom + top) / 2, centreZ),
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	BuildUtil.SurfaceText(housing, Enum.NormalId.Left, teamName ~= "" and teamName or "JUMBOTRON", {
		LabelName = "JumbotronBackText",
		TextColor3 = readable(team.Primary, team.Trim),
		PixelsPerStud = 6,
	})
	BuildUtil.Box(
		ctx,
		"Crown",
		Vector3.new(depth + 1, 2, width + 2),
		Vector3.new(midX, top + 1, centreZ),
		team.Secondary,
		Enum.Material.SmoothPlastic
	)
	span(ctx, "Bezel", faceX, faceX + 0.2, bottom + 0.7, top - 0.7, centreZ - width / 2 + 1, centreZ + width / 2 - 1, team.Secondary)
	span(ctx, "FacePlate", faceX + 0.2, faceX + 0.4, bottom + 1, top - 1.2, centreZ - width / 2 + 2, centreZ + width / 2 - 2, FACE_DARK)

	-------------------------------------------------------------------------- 3 Video Screen & Speakers
	BuildUtil.Stage(ctx, 3)
	-- the screen and the LED ribbon under it (unrotated parts: +X is the Right face)
	local screenX = faceX + 0.55
	local screenWidth = width - 6
	local welcome = teamName ~= "" and teamName or "WELCOME!"
	screen(ctx, "Screen", Vector3.new(0.3, 22.6, screenWidth), Vector3.new(screenX, 45.7, centreZ), Enum.NormalId.Right, welcome, {
		LabelName = "JumbotronText",
		TextColor3 = team.Trim,
		BackgroundColor3 = team.Primary,
		TextStrokeTransparency = 0.3,
		PixelsPerStud = 12,
	})
	screen(
		ctx,
		"LedRibbon",
		Vector3.new(0.3, 2.6, screenWidth),
		Vector3.new(screenX, 32.7, centreZ),
		Enum.NormalId.Right,
		"NEXT GAME SOON",
		{
			LabelName = "JumbotronRibbon",
			Live = "gameday",
			TextColor3 = LED_AMBER,
			Font = Enum.Font.Arcade,
			PixelsPerStud = 16,
		}
	)

	-- hanging speaker arrays either side of the screen, each box angled a bit more toward the field
	for _, side in ipairs({ -1, 1 }) do
		local arrayZ = centreZ + side * (width / 2 + 3)
		local arrayX = faceX - 1.2
		local crownEnd = centreZ + side * (width / 2 + 1)
		span(ctx, "SpeakerArm", arrayX - 0.8, arrayX + 0.8, top + 0.6, top + 1.6, crownEnd, arrayZ + side * 0.8, STEEL, Enum.Material.Metal)
		span(
			ctx,
			"SpeakerHanger",
			arrayX - 0.15,
			arrayX + 0.15,
			top - 0.8,
			top + 0.6,
			arrayZ - 0.15,
			arrayZ + 0.15,
			STEEL,
			Enum.Material.Metal
		)
		for k = 0, 3 do
			local boxCFrame = CFrame.new(arrayX, top - 2.3 - k * 3, arrayZ) * CFrame.Angles(0, 0, -math.rad(4 + k * 5))
			BuildUtil.Part(ctx, {
				Name = "SpeakerBox",
				Size = Vector3.new(3.2, 2.8, 3.4),
				CFrame = boxCFrame,
				Color = SPEAKER_GREY,
				Material = Enum.Material.Fabric,
			})
			BuildUtil.Part(ctx, {
				Name = "SpeakerCone",
				Shape = Enum.PartType.Cylinder,
				Size = Vector3.new(0.3, 2.2, 2.2),
				CFrame = boxCFrame * CFrame.new(1.65, 0, 0),
				Color = CONE_GREY,
				Material = Enum.Material.SmoothPlastic,
			})
		end
	end

	-- The control room's gear: a monitor wall on the field-side wall (live screens), the desk
	-- with the video switcher, the director's chair, a replay server and the crew fridge
	local monitorX = rx1 - 0.3
	span(ctx, "MonitorWall", monitorX, rx1, 2.6, 8.8, rz0 + 1, rz1 - 1, FACE_DARK)
	local function monitorScreen(name, live, placeholder, y0, y1, za, zb, color)
		return screen(
			ctx,
			name,
			Vector3.new(0.2, y1 - y0, zb - za),
			Vector3.new(monitorX - 0.1, (y0 + y1) / 2, (za + zb) / 2),
			Enum.NormalId.Left,
			placeholder,
			{ LabelName = name .. "Text", Live = live, TextColor3 = color, Font = Enum.Font.GothamBold, PixelsPerStud = 40 }
		)
	end
	local mainMonitor = monitorScreen("MonitorMain", "summary", "HOME 0 - AWAY 0", 3.8, 8.4, centreZ - 2.8, centreZ + 2.8, LED_WHITE)
	monitorScreen("MonitorScore", "score", "HOME 0 - AWAY 0", 5.6, 8.2, rz0 + 1.4, centreZ - 3.4, LED_AMBER)
	monitorScreen("MonitorSeason", "season", "SEASON 1", 3, 5.2, rz0 + 1.4, centreZ - 3.4, LED_CYAN)
	monitorScreen("MonitorGameDay", "gameday", "NEXT GAME SOON", 5.6, 8.2, centreZ + 3.4, rz1 - 1.4, LED_GREEN)
	monitorScreen("MonitorRecord", "record", "RECORD 0-0", 3, 5.2, centreZ + 3.4, rz1 - 1.4, LED_WHITE)
	BuildUtil.Light(
		mainMonitor,
		"SurfaceLight",
		{ Name = "MonitorGlow", Face = Enum.NormalId.Left, Range = 10, Brightness = 0.6, Color = LED_CYAN }
	)
	local onAir = span(ctx, "OnAirLight", monitorX - 0.3, rx1, 9, 9.7, centreZ - 1.6, centreZ + 1.6, ON_AIR_RED, Enum.Material.Neon, GLOW)
	BuildUtil.SurfaceText(
		onAir,
		Enum.NormalId.Left,
		"ON AIR",
		{ LabelName = "OnAirText", TextColor3 = LED_WHITE, LightInfluence = 0, PixelsPerStud = 30 }
	)

	local deskX0, deskX1 = rx1 - 3, rx1 - 0.8
	span(ctx, "ControlDesk", deskX0, deskX1, 0.2, 3.2, rz0 + 2.5, rz1 - 2.5, DESK_DARK)
	local switcher = span(ctx, "VideoSwitcher", deskX0 + 0.3, deskX1 - 0.3, 3.2, 3.5, centreZ - 3, centreZ + 3, SCREEN_BLACK)
	span(ctx, "SwitcherButtons", deskX0 + 0.6, deskX0 + 0.9, 3.5, 3.6, centreZ - 2.5, centreZ + 2.5, LED_RED, Enum.Material.Neon, GLOW)
	span(ctx, "SwitcherButtons", deskX0 + 1.2, deskX0 + 1.5, 3.5, 3.6, centreZ - 2.5, centreZ + 2.5, LED_GREEN, Enum.Material.Neon, GLOW)
	BuildUtil.Look(
		switcher,
		"Video Switcher",
		"Push a button and the jumbotron cuts to another camera: replay, crowd cam or the dance cam!",
		{ At = atPoint(ctx, switcher, Vector3.new((deskX0 + deskX1) / 2, 3.5, centreZ + 2.4)), Distance = 7 }
	)
	local chairX = deskX0 - 2
	BuildUtil.Seat(ctx, {
		Name = "DirectorChair",
		CFrame = CFrame.lookAt(Vector3.new(chairX, 1.6, centreZ), Vector3.new(chairX + 5, 1.6, centreZ)),
		Size = Vector3.new(2, 1, 2),
		Color = team.Primary,
		Object = "Director's Chair",
		Camera = { From = Vector3.new(0, 72, -44), To = Vector3.new(0, 0, 36), Fov = 60, Label = "SKYCAM" },
	})
	post(ctx, "ChairBase", chairX, centreZ, 0.2, 1.1, 0.6, STEEL, Enum.Material.Metal, NO_COLLIDE)
	span(ctx, "ChairBack", chairX - 1.2, chairX - 0.9, 2.1, 4.4, centreZ - 1, centreZ + 1, team.Primary, nil, NO_COLLIDE)

	local rack = span(ctx, "ReplayServer", rx0 + 0.2, rx0 + 2, 0.2, 6.2, rz0 + 0.2, rz0 + 2.2, DESK_DARK)
	span(ctx, "ServerLights", rx0 + 2, rx0 + 2.1, 1, 5.6, rz0 + 0.6, rz0 + 0.9, LED_GREEN, Enum.Material.Neon, GLOW)
	BuildUtil.Look(
		rack,
		"Replay Server",
		"Every big play is saved in here, ready for an instant replay on the big screen.",
		{ Distance = 7 }
	)
	local fridge = span(ctx, "CrewFridge", rx0 + 0.2, rx0 + 1.8, 0.2, 3.4, rz1 - 1.8, rz1 - 0.2, FRIDGE_WHITE)
	span(ctx, "FridgeHandle", rx0 + 1.8, rx0 + 1.95, 1.6, 3, rz1 - 1.6, rz1 - 1.4, STEEL, Enum.Material.Metal, NO_COLLIDE)
	BuildUtil.Use(ctx, fridge, "soda", { Object = "Crew Fridge", Distance = 7 })
end

---------------------------------------------------------------------------------------------
-- Stadium canopy (ring roof over the upper deck)
---------------------------------------------------------------------------------------------
local RING_DEPTH = 36
local METAL_DEPTH = 24
local DECK_BOTTOM = 52.8
local DECK_THICKNESS = 0.8
local RIB_DEPTH = 6
local BAND_BOTTOM = 50.6
local BAND_TOP = 54
local COLUMN_INSET = 2.5 -- column centres sit this far inside the outer edge (clear of the rail)
-- The scoreboard / jumbotron stand just outside the ends (z 0..60). A full-depth roof there would
-- hide their upper half from the field, so the ends keep only the inner NOTCH_DEPTH studs of roof
-- in front of them (a notch in the outer edge, NOTCH_HALF studs either side of the field centre).
local NOTCH_DEPTH = 18
local NOTCH_HALF = 34
local NOTCH_BAND_BOTTOM = 52.4 -- slimmer edge band along the notch (keeps the sight lines open)
-- Ring truss round the outer edge (under the outer band): chord centre line, heights
local TRUSS_INSET = 1.6
local TRUSS_TOP = DECK_BOTTOM - 0.4
local TRUSS_BOTTOM = 42
-- Lighting catwalk just behind the inner edge
local WALK_INSET = 2.5 -- centre line, studs outside the inner edge
local WALK_HALF = 1.2
local WALK_FLOOR = 47.6 -- underside of the walkway (it hangs just below the fascias)

-- A tapered rib under the deck from `outerPoint` (deepest, at the column) to `innerPoint`.
-- Points are plot-local x/z (their Y is ignored). Returns the rib's length.
local function roofRib(ctx, outerPoint, innerPoint)
	local flat = Vector3.new(innerPoint.X - outerPoint.X, 0, innerPoint.Z - outerPoint.Z)
	local length = flat.Magnitude
	local centre = Vector3.new((outerPoint.X + innerPoint.X) / 2, DECK_BOTTOM - RIB_DEPTH / 2, (outerPoint.Z + innerPoint.Z) / 2)
	BuildUtil.Wedge(ctx, {
		Name = "RoofRib",
		Size = Vector3.new(1.2, RIB_DEPTH, length),
		-- the wedge's tall face is at local +Z (outer end); turned upside down so the flat face
		-- is against the deck and the sloped face rises toward the field
		CFrame = CFrame.lookAt(centre, centre + flat) * CFrame.Angles(0, 0, math.pi),
		Color = STEEL,
		Material = Enum.Material.Metal,
	})
	return length
end

-- How far below the deck a rib from `outerPoint` (length `ribLength`) reaches at `point`.
local function ribBottomAt(outerPoint, ribLength, point)
	local fromOuter = Vector3.new(point.X - outerPoint.X, 0, point.Z - outerPoint.Z).Magnitude
	return DECK_BOTTOM - RIB_DEPTH * (1 - fromOuter / ribLength)
end

-- One FloodPanel bar hanging just inside the roof's inner edge, tilted down toward the field.
-- `edge` is the point on the inner edge, `inward` the horizontal unit vector toward the field.
local function roofLightBar(ctx, edge, inward, length)
	local centre = Vector3.new(edge.X, BAND_BOTTOM - 0.7, edge.Z) + inward * 1
	local panel = BuildUtil.Part(ctx, {
		Name = "FloodPanel",
		Size = Vector3.new(length, 1.2, 0.4),
		CFrame = CFrame.lookAt(centre, centre + inward) * CFrame.Angles(math.rad(-40), 0, 0),
		Color = WARM_WHITE,
		Material = Enum.Material.SmoothPlastic,
		CanCollide = false,
		CastShadow = false,
	})
	BuildUtil.Light(panel, "SpotLight", {
		Name = "FloodLight",
		Enabled = false,
		Face = Enum.NormalId.Front,
		Range = 60,
		Angle = 100,
		Brightness = 3,
		Color = WARM_WHITE,
	})
end

-- Diagonals of the ring truss between `from` and `to` (coordinates along one side): `count`
-- members zigzagging between the bottom and the top chord. pointAt(t, y) gives the 3D point.
local function trussWeb(ctx, from, to, count, startLow, pointAt)
	local step = (to - from) / count
	for i = 0, count - 1 do
		local low = (i % 2 == 0) == startLow
		local a = pointAt(from + i * step, low and TRUSS_BOTTOM or TRUSS_TOP)
		local b = pointAt(from + (i + 1) * step, low and TRUSS_TOP or TRUSS_BOTTOM)
		strut(ctx, "TrussDiagonal", a, b, 0.6, STEEL)
	end
end

function Features.canopy(ctx)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local team = ctx.colors
	local teamName = ctx.teamName or ""
	local hasName = teamName ~= ""
	local cheerName = hasName and teamName or "TEAM"
	local stadiumName = hasName and (teamName .. " STADIUM") or "WELCOME FANS"
	local homeOf = hasName and ("HOME OF THE " .. teamName) or "HOME SWEET HOME"

	local outerX = L.EndUpperOuterX -- 183
	local frontZ = L.FrontUpperOuterZ -- -83
	local backZ = L.BackUpperOuterZ -- 143
	local innerX = outerX - RING_DEPTH -- 147
	local innerFrontZ = frontZ + RING_DEPTH -- -47
	local innerBackZ = backZ - RING_DEPTH -- 107
	local seamX = outerX - METAL_DEPTH -- 159: metal / glass seam
	local seamFrontZ = frontZ + METAL_DEPTH -- -59
	local seamBackZ = backZ - METAL_DEPTH -- 119
	local deckTop = DECK_BOTTOM + DECK_THICKNESS
	local topRow = L.UpperTopHeight -- 26: the columns stand on the top row of the upper ring
	local glassExtra = { Transparency = 0.45 }
	local notchX = innerX + NOTCH_DEPTH -- 165: the notch runs from here to the outer edge
	local notchZ0, notchZ1 = L.FieldCenterZ - NOTCH_HALF, L.FieldCenterZ + NOTCH_HALF -- -4 .. 64
	local textColor = readable(team.Primary, team.Trim)

	-- Every rib with its column(s). Sideline columns avoid the broadcast booth (|x| <= 22) and the
	-- press box (|x| <= 44); end columns avoid the scoreboard / jumbotron sight lines (z 0..60).
	-- Corners get a diagonal rib from the outer corner to the inner corner. The corner aisle of
	-- the upper ring climbs along that diagonal, so instead of one column on top of the stairs
	-- there are two, one either side of the aisle, reaching straight up to the deck.
	local SIDELINE_X = { -145, -100, -55, 55, 100, 145 }
	local END_Z = { -30, 90 }
	local bays = {}
	for _, x in ipairs(SIDELINE_X) do
		table.insert(bays, {
			kind = "side",
			outer = Vector3.new(x, 0, frontZ + 1),
			inner = Vector3.new(x, 0, innerFrontZ),
			columns = { Vector3.new(x, 0, frontZ + COLUMN_INSET) },
		})
		table.insert(bays, {
			kind = "side",
			outer = Vector3.new(x, 0, backZ - 1),
			inner = Vector3.new(x, 0, innerBackZ),
			columns = { Vector3.new(x, 0, backZ - COLUMN_INSET) },
		})
	end
	for _, side in ipairs({ -1, 1 }) do
		for _, z in ipairs(END_Z) do
			table.insert(bays, {
				kind = "end",
				outer = Vector3.new(side * (outerX - 1), 0, z),
				inner = Vector3.new(side * innerX, 0, z),
				columns = { Vector3.new(side * (outerX - COLUMN_INSET), 0, z) },
			})
		end
		for _, corner in ipairs({ { frontZ, innerFrontZ, 1 }, { backZ, innerBackZ, -1 } }) do
			local oz, iz, dz = corner[1], corner[2], corner[3]
			table.insert(bays, {
				kind = "corner",
				outer = Vector3.new(side * (outerX - 1), 0, oz + dz * 1),
				inner = Vector3.new(side * innerX, 0, iz),
				columns = {
					Vector3.new(side * (outerX - COLUMN_INSET), 0, oz + dz * 7),
					Vector3.new(side * (outerX - 7), 0, oz + dz * COLUMN_INSET),
				},
			})
		end
	end

	-------------------------------------------------------------------------- 1 Roof Supports
	BuildUtil.Stage(ctx, 1)
	local structure = BuildUtil.Child(ctx, "Structure")
	local lookColumn
	for _, bay in ipairs(bays) do
		bay.length = roofRib(structure, bay.outer, bay.inner)
		for _, column in ipairs(bay.columns) do
			-- corner columns reach the deck; the others stop under their rib
			local topY = bay.kind == "corner" and DECK_BOTTOM or ribBottomAt(bay.outer, bay.length, column)
			local part = post(structure, "RoofColumn", column.X, column.Z, topRow, topY + 0.3, 2, STEEL)
			if bay.kind == "side" and column.X == -55 and column.Z < 0 then
				lookColumn = part
			end
		end
	end
	BuildUtil.Look(
		lookColumn,
		"Roof Column",
		"Each column holds up a steel rib that reaches 36 studs out over the seats, so the fans up here stay dry when it rains.",
		{ At = atPoint(ctx, lookColumn, Vector3.new(-55, topRow + 3, frontZ + COLUMN_INSET + 1.1)) }
	)

	-- Ring truss round the outer edge: top chord under the deck, bottom chord lower down and
	-- diagonals between them. The middle sideline bays (over the press box / TV booth) and the
	-- notches in front of the boards keep only the top chord.
	local truss = BuildUtil.Child(ctx, "RingTruss")
	local tx = outerX - TRUSS_INSET -- 181.4
	local corners = {}
	for _, zs in ipairs({ frontZ + TRUSS_INSET, backZ - TRUSS_INSET }) do
		local function along(x, y)
			return Vector3.new(x, y, zs)
		end
		table.insert(corners, zs)
		strut(truss, "TrussChord", along(-tx, TRUSS_TOP), along(tx, TRUSS_TOP), 0.8, STEEL)
		for _, side in ipairs({ -1, 1 }) do
			strut(truss, "TrussChord", along(side * tx, TRUSS_BOTTOM), along(side * 55, TRUSS_BOTTOM), 0.8, STEEL)
			local nodes = { tx, 145, 100, 55 }
			for i = 1, #nodes - 1 do
				trussWeb(truss, side * nodes[i], side * nodes[i + 1], 2, true, along)
			end
		end
	end
	for _, side in ipairs({ -1, 1 }) do
		local function along(z, y)
			return Vector3.new(side * tx, y, z)
		end
		-- the end chords butt against the sideline chords
		local zFront, zBack = corners[1] + 0.4, corners[2] - 0.4
		strut(truss, "TrussChord", along(zFront, TRUSS_TOP), along(notchZ0 - 1, TRUSS_TOP), 0.8, STEEL)
		strut(truss, "TrussChord", along(notchZ1 + 1, TRUSS_TOP), along(zBack, TRUSS_TOP), 0.8, STEEL)
		strut(truss, "TrussChord", along(zFront, TRUSS_BOTTOM), along(END_Z[1], TRUSS_BOTTOM), 0.8, STEEL)
		strut(truss, "TrussChord", along(END_Z[2], TRUSS_BOTTOM), along(zBack, TRUSS_BOTTOM), 0.8, STEEL)
		trussWeb(truss, corners[1], END_Z[1], 2, true, along)
		trussWeb(truss, END_Z[1], notchZ0 - 1, 1, true, along)
		trussWeb(truss, notchZ1 + 1, END_Z[2], 1, false, along)
		trussWeb(truss, END_Z[2], corners[2], 2, true, along)
	end

	-- a team-coloured stripe on top of the deck above every rib (gives the roof its rhythm)
	local stripeTop = deckTop + 0.2
	local function stripes(stripeCtx, kinds)
		for _, bay in ipairs(bays) do
			if kinds[bay.kind] then
				local flat = Vector3.new(bay.inner.X - bay.outer.X, 0, bay.inner.Z - bay.outer.Z)
				local centre = Vector3.new((bay.outer.X + bay.inner.X) / 2, deckTop + 0.1, (bay.outer.Z + bay.inner.Z) / 2)
				BuildUtil.Part(stripeCtx, {
					Name = "RoofStripe",
					Size = Vector3.new(1.6, stripeTop - deckTop, flat.Magnitude),
					CFrame = CFrame.lookAt(centre, centre + flat),
					Color = team.Secondary,
					Material = Enum.Material.SmoothPlastic,
					CanCollide = false,
					CastShadow = false,
				})
			end
		end
	end
	-- a rain downpipe hugging a column (clear of the seat strips and the back rail), from the
	-- deck's drain down to the top row
	local function downpipe(pipeCtx, x, z)
		return post(pipeCtx, "RainDownpipe", x, z, topRow, DECK_BOTTOM, 0.6, C.Metal, Enum.Material.Metal, NO_COLLIDE)
	end

	-------------------------------------------------------------------------- 2 Sideline Roofs
	BuildUtil.Stage(ctx, 2)
	local deck = BuildUtil.Child(ctx, "Deck")
	-- metal bands front / back (full width, including the corners), then the inner glass strips;
	-- the metal stops half a stud inside the outer band so its edges are never coplanar with it
	local deckX = outerX - 0.5
	span(deck, "RoofPanel", -deckX, deckX, DECK_BOTTOM, deckTop, frontZ + 0.5, seamFrontZ, ROOF_WHITE, Enum.Material.Metal)
	span(deck, "RoofPanel", -deckX, deckX, DECK_BOTTOM, deckTop, seamBackZ, backZ - 0.5, ROOF_WHITE, Enum.Material.Metal)
	span(
		deck,
		"RoofGlass",
		-innerX,
		innerX,
		DECK_BOTTOM + 0.1,
		deckTop - 0.1,
		seamFrontZ,
		innerFrontZ,
		C.Glass,
		Enum.Material.Glass,
		glassExtra
	)
	span(
		deck,
		"RoofGlass",
		-innerX,
		innerX,
		DECK_BOTTOM + 0.1,
		deckTop - 0.1,
		innerBackZ,
		seamBackZ,
		C.Glass,
		Enum.Material.Glass,
		glassExtra
	)
	stripes(deck, { side = true })

	-- team-coloured outer bands (lettered toward the plaza and the campus) + field-side fascias
	local edge = BuildUtil.Child(ctx, "Edges")
	local outerFront = span(edge, "OuterBand", -outerX, outerX, BAND_BOTTOM, BAND_TOP, frontZ, frontZ + 1, team.Primary)
	labels(outerFront, Enum.NormalId.Front, {
		{ text = stadiumName, from = 0.32, to = 0.68, top = 0.08, bottom = 0.92 },
	}, textColor, 10)
	local outerBack = span(edge, "OuterBand", -outerX, outerX, BAND_BOTTOM, BAND_TOP, backZ - 1, backZ, team.Primary)
	labels(outerBack, Enum.NormalId.Back, {
		{ text = homeOf, from = 0.3, to = 0.7, top = 0.08, bottom = 0.92 },
	}, textColor, 10)
	local frontFascia =
		span(edge, "Fascia", -innerX - 0.4, innerX + 0.4, BAND_BOTTOM, BAND_TOP, innerFrontZ - 0.4, innerFrontZ + 0.4, team.Primary)
	labels(frontFascia, Enum.NormalId.Back, {
		{ text = "GO " .. cheerName .. "!", from = 0.06, to = 0.3, top = 0.1, bottom = 0.9 },
		{ text = stadiumName, from = 0.37, to = 0.63, top = 0.1, bottom = 0.9 },
		{ text = "DE-FENSE!", from = 0.7, to = 0.94, top = 0.1, bottom = 0.9 },
	}, textColor, 10)
	local backFascia =
		span(edge, "Fascia", -innerX - 0.4, innerX + 0.4, BAND_BOTTOM, BAND_TOP, innerBackZ - 0.4, innerBackZ + 0.4, team.Primary)
	labels(backFascia, Enum.NormalId.Front, {
		{ text = cheerName, from = 0.06, to = 0.3, top = 0.1, bottom = 0.9 },
		{ text = homeOf, from = 0.35, to = 0.65, top = 0.1, bottom = 0.9 },
		{ text = cheerName, from = 0.7, to = 0.94, top = 0.1, bottom = 0.9 },
	}, textColor, 10)
	-- a downpipe hugging the -X side of a front column
	local sidePipeX, sidePipeZ = -100 - 1.35, frontZ + COLUMN_INSET
	local sidePipe = downpipe(edge, sidePipeX, sidePipeZ)
	BuildUtil.Look(
		sidePipe,
		"Rain Downpipe",
		"Rain runs off the roof into the gutter and down this pipe. Any footballs kicked up onto the roof stay up there!",
		{ At = atPoint(ctx, sidePipe, Vector3.new(sidePipeX, topRow + 3, sidePipeZ)) }
	)

	-------------------------------------------------------------------------- 3 End Roofs
	BuildUtil.Stage(ctx, 3)
	local endDeck = BuildUtil.Child(ctx, "EndDeck")
	for _, side in ipairs({ -1, 1 }) do
		-- end metal: full depth either side of the notch, a narrow strip in front of the boards
		span(
			endDeck,
			"RoofPanel",
			side * seamX,
			side * deckX,
			DECK_BOTTOM,
			deckTop,
			seamFrontZ,
			notchZ0 - 0.5,
			ROOF_WHITE,
			Enum.Material.Metal
		)
		span(
			endDeck,
			"RoofPanel",
			side * seamX,
			side * deckX,
			DECK_BOTTOM,
			deckTop,
			notchZ1 + 0.5,
			seamBackZ,
			ROOF_WHITE,
			Enum.Material.Metal
		)
		span(
			endDeck,
			"RoofPanel",
			side * seamX,
			side * (notchX - 0.5),
			DECK_BOTTOM,
			deckTop,
			notchZ0 - 0.5,
			notchZ1 + 0.5,
			ROOF_WHITE,
			Enum.Material.Metal
		)
		span(
			endDeck,
			"RoofGlass",
			side * innerX,
			side * seamX,
			DECK_BOTTOM + 0.1,
			deckTop - 0.1,
			seamFrontZ,
			seamBackZ,
			C.Glass,
			Enum.Material.Glass,
			glassExtra
		)
	end
	stripes(endDeck, { ["end"] = true, corner = true })

	local endEdge = BuildUtil.Child(ctx, "EndEdges")
	for _, side in ipairs({ -1, 1 }) do
		span(endEdge, "OuterBand", side * (outerX - 1), side * outerX, BAND_BOTTOM, BAND_TOP, frontZ + 1, notchZ0, team.Primary)
		span(endEdge, "OuterBand", side * (outerX - 1), side * outerX, BAND_BOTTOM, BAND_TOP, notchZ1, backZ - 1, team.Primary)
		-- the band follows the notch round: two returns and a slim edge along its inner side
		span(endEdge, "OuterBand", side * notchX, side * (outerX - 1), BAND_BOTTOM, BAND_TOP, notchZ0 - 1, notchZ0, team.Primary)
		span(endEdge, "OuterBand", side * notchX, side * (outerX - 1), BAND_BOTTOM, BAND_TOP, notchZ1, notchZ1 + 1, team.Primary)
		span(endEdge, "NotchBand", side * (notchX - 1), side * notchX, NOTCH_BAND_BOTTOM, BAND_TOP, notchZ0 - 1, notchZ1 + 1, team.Primary)
	end
	-- End fascias: full height either side of the boards, slim in front of them (the notch range)
	-- so the fans in the upper ring see the top of the scoreboard / jumbotron over it. Seen from
	-- the field the -Z piece is on the left at the east end and on the right at the west end.
	for _, side in ipairs({ -1, 1 }) do
		local face = side > 0 and Enum.NormalId.Left or Enum.NormalId.Right
		local words = side > 0 and { "TOUCHDOWN", cheerName .. "!" } or { cheerName .. "!", "LET'S GO" }
		for index, zs in ipairs({ { innerFrontZ + 0.4, notchZ0 }, { notchZ1, innerBackZ - 0.4 } }) do
			local piece =
				span(endEdge, "Fascia", side * (innerX - 0.4), side * (innerX + 0.4), BAND_BOTTOM, BAND_TOP, zs[1], zs[2], team.Primary)
			labels(piece, face, { { text = words[index], from = 0.08, to = 0.92, top = 0.1, bottom = 0.9 } }, textColor, 10)
		end
		span(endEdge, "Fascia", side * (innerX - 0.4), side * (innerX + 0.4), NOTCH_BAND_BOTTOM, BAND_TOP, notchZ0, notchZ1, team.Primary)
	end
	-- a downpipe hugging the -Z side of an east end column
	local endPipeX, endPipeZ = outerX - COLUMN_INSET, END_Z[1] - 1.35
	local endPipe = downpipe(endEdge, endPipeX, endPipeZ)
	BuildUtil.Look(
		endPipe,
		"End Roof",
		"The end roofs stop short in front of the scoreboard and the jumbotron, so every fan can still see the big screens.",
		{ At = atPoint(ctx, endPipe, Vector3.new(endPipeX, topRow + 3, endPipeZ)) }
	)

	-------------------------------------------------------------------------- 4 Roof Lights
	BuildUtil.Stage(ctx, 4)
	-- Ring of light bars just inside the inner edge (FloodPanel / FloodLight like the towers)
	local lightsCtx = BuildUtil.Child(ctx, "RoofLights")
	local barCount = 0
	for _, x in ipairs({ -110, -40, 40, 110 }) do
		roofLightBar(lightsCtx, Vector3.new(x, 0, innerFrontZ), Vector3.new(0, 0, 1), 28)
		roofLightBar(lightsCtx, Vector3.new(x, 0, innerBackZ), Vector3.new(0, 0, -1), 28)
		barCount += 2
	end
	for _, side in ipairs({ -1, 1 }) do
		-- under the full-height end fascias, either side of the boards
		for _, z in ipairs({ (innerFrontZ + notchZ0) / 2, (notchZ1 + innerBackZ) / 2 }) do
			roofLightBar(lightsCtx, Vector3.new(side * innerX, 0, z), Vector3.new(-side, 0, 0), 28)
			barCount += 1
		end
	end

	-- The lighting catwalk behind the light bars, hung from the ribs: a run along each sideline
	-- and, at the ends, runs that stop where the roof narrows in front of the boards (so they
	-- never hide the scoreboard / jumbotron). One rail on the outer side; the bars are inboard.
	local walk = BuildUtil.Child(ctx, "LightingCatwalk")
	local wx = innerX + WALK_INSET -- 149.5
	local wzF, wzB = innerFrontZ - WALK_INSET, innerBackZ + WALK_INSET -- -49.5, 109.5
	local h = WALK_HALF
	local floorTop = WALK_FLOOR + 0.4
	local railY0, railY1 = floorTop + 1.1, floorTop + 1.35
	local walkMaterial = Enum.Material.DiamondPlate
	for _, run in ipairs({ { wzF, -1 }, { wzB, 1 } }) do
		local z, out = run[1], run[2]
		span(walk, "CatwalkFloor", -wx - h, wx + h, WALK_FLOOR, floorTop, z - h, z + h, STEEL, walkMaterial)
		local railZ = z + out * (h - 0.15)
		span(walk, "CatwalkRail", -wx - h, wx + h, railY0, railY1, railZ - 0.12, railZ + 0.12, SAFETY_YELLOW)
	end
	for _, side in ipairs({ -1, 1 }) do
		local railX = side * (wx + h - 0.15)
		for _, zs in ipairs({ { wzF + h, notchZ0 - 1 }, { notchZ1 + 1, wzB - h } }) do
			span(walk, "CatwalkFloor", side * (wx - h), side * (wx + h), WALK_FLOOR, floorTop, zs[1], zs[2], STEEL, walkMaterial)
			span(walk, "CatwalkRail", railX - 0.12, railX + 0.12, railY0, railY1, zs[1], zs[2], SAFETY_YELLOW)
		end
	end
	-- hangers from the outer rail up into the ribs
	for _, bay in ipairs(bays) do
		if bay.kind ~= "corner" then
			local dir = Vector3.new(bay.inner.X - bay.outer.X, 0, bay.inner.Z - bay.outer.Z).Unit
			local p = bay.inner - dir * (WALK_INSET + h - 0.15)
			local ribBottom = ribBottomAt(bay.outer, bay.length, p)
			post(walk, "CatwalkHanger", p.X, p.Z, floorTop, ribBottom + 0.2, 0.3, STEEL, Enum.Material.Metal, NO_COLLIDE)
		end
	end
	-- the roof lights' switch box on a front column (reachable from the top row)
	local switchBox = span(
		walk,
		"RoofLightSwitch",
		54.2,
		55.8,
		topRow + 1.6,
		topRow + 3.8,
		frontZ + COLUMN_INSET + 1,
		frontZ + COLUMN_INSET + 1.7,
		CABINET_GREY,
		Enum.Material.Metal,
		NO_COLLIDE
	)
	span(
		walk,
		"RoofLightSwitchLamp",
		54.6,
		55.4,
		topRow + 3.2,
		topRow + 3.5,
		frontZ + COLUMN_INSET + 1.7,
		frontZ + COLUMN_INSET + 1.8,
		LED_AMBER,
		Enum.Material.Neon,
		GLOW
	)
	BuildUtil.Look(
		switchBox,
		"Roof Lights",
		("%d light bars hang under the roof's inner edge, with a catwalk behind them for the crew. They switch on with the light towers at night."):format(
			barCount
		),
		{ Distance = 8 }
	)
end

return Features
