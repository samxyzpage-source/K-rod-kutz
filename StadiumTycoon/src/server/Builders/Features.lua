--[[
	Features (V5)
	The "big league" pieces around and above the V5 bowl (docs/V5-LAYOUT.md, Server/Bowl.lua). Every
	piece is bought in STEPS (Items.lua); BuildUtil.Stage(ctx, n) marks the parts of step n.

	  scoreboard  the EAST end-zone video board (its screens face -X, the field)
	                1 Support Legs   two steel pylons at x 312..320 (behind the Gate C plaza, either side
	                                 of the gate), the truss + X-braces between them, the arms reaching
	                                 over the facade, crew landings + the service catwalk behind the
	                                 board (y 128), and a service lift in the south pylon
	                2 Board Frame    the team-coloured housing (104 x 36) over the back rows of the east
	                                 upper deck, crown, wings, face plate, lettering on the back, a
	                                 service hatch and the operator's booth (VIDEO BOARD CAM seat)
	                3 Screens        title / score / attendance screens, live record, season, game day
	                                 and titles panels, play clock, down & distance, LED power racks
	  lights      four lattice flood-light towers (platform at y 140, banks up to ~165) at
	              Layout.LightTowerPositions, ONE per step, every bank aimed at the field centre; a lift
	              rides up to each tower's top platform (TOWER CAM seat). Lights reach 60 studs at most,
	              so each tower also adds invisible field-level fixtures (FieldLight) that light its
	              quarter of the turf
	  jumbotron   the WEST end-zone video board (its screen faces +X)
	                1 Support Tower  two concrete towers (x -320..-308) flanking the board like goalposts,
	                                 joined by a bridge (the Gate B plaza stays open between them), the
	                                 walk-in Video Control Room at the foot of the south tower, the
	                                 screen deck behind the board (y 128) + a lift in the north tower
	                2 Screen Frame   housing, crown, wings, face plate, lettering, JUMBOTRON CAM seat
	                3 Video Screen & Speakers  the big screen (JumbotronText), a live score ribbon,
	                                 record / season / game day / titles panels, speaker stacks, the amp
	                                 rack and the control room's gear (live monitors, switcher, SKYCAM
	                                 seat, replay server, crew fridge)
	  canopy      a ring roof over the upper deck (offsets 70..167, deck y 116..117), open over the
	              field and notched at both ends where the video boards stand
	                1 Roof Supports  20 masts outside the facade (sides at +-30 / 90 / 150, ends at +-82,
	                                 corners outside the corner ramps) carrying cantilever girders on
	                                 top of the roof line, tie rods, the inner + outer ring beams
	                2 Sideline Roofs glass (inner) + metal (outer) decks over the home and visitor sides,
	                                 lettered fascias, a rain downpipe
	                3 End Roofs      the end and corner decks + fascias, the bands along the notches
	                4 Roof Lights    light bars (FloodPanel / FloodLight) under the inner edge and the
	                                 lighting catwalk (two halves), each with a Roof Tour lift from the
	                                 ground and a ROOF CAM seat

	Runtime contracts (PlotManager finds these by name; do not rename them):
	  scoreboard      TextLabels "ScoreboardTitle", "ScoreboardScore", "ScoreboardAttendance" (step 3)
	  jumbotron       TextLabel "JumbotronText" (step 3)
	  lights, canopy  SpotLights "FloodLight" (Enabled = false) and Parts "FloodPanel" (SmoothPlastic
	                  warm white; the server switches them to Neon at night)

	Coordinates are plot coordinates (stadium area). The roof is built per bowl segment (Bowl.Segment
	at offset 0): x runs along the segment, y is up and o = offset; a point is seg.base * (x, y, -o),
	and the Back face (+Z) of an unrotated part in that frame looks at the field.
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)
local Bowl = require(script.Parent.Parent.Bowl)

local M = {}

---------------------------------------------------------------------------------------------
-- Colours
---------------------------------------------------------------------------------------------
local SCREEN_BLACK = Color3.fromRGB(10, 10, 14)
local FACE_DARK = Color3.fromRGB(30, 30, 36)
local STEEL = Color3.fromRGB(78, 84, 94)
local STEEL_PALE = Color3.fromRGB(206, 210, 216)
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
local CONCRETE = Color3.fromRGB(190, 188, 182)

local NO_COLLIDE = { CanCollide = false }
local GLOW = { CanCollide = false, CastShadow = false }
local GUARD = { Transparency = 0.35 } -- see-through steel mesh guards on catwalks / landings

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

-- The owner's team name (upper case), or `fallback` when it is empty.
local function teamText(ctx, fallback)
	local name = ctx.teamName or ""
	if name:match("%S") then
		return name
	end
	return fallback
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
	local part = BuildUtil.Box(ctx, name, size, position, SCREEN_BLACK, Enum.Material.SmoothPlastic, NO_COLLIDE)
	local textOpts = {
		LabelName = opts.LabelName,
		Text = text,
		TextColor3 = opts.TextColor3,
		BackgroundColor3 = opts.BackgroundColor3 or SCREEN_BLACK,
		BackgroundTransparency = 0,
		LightInfluence = 0,
		Font = opts.Font or Enum.Font.GothamBlack,
		PixelsPerStud = opts.PixelsPerStud or 12,
		TextStrokeTransparency = opts.TextStrokeTransparency,
	}
	if opts.Live then
		BuildUtil.LiveText(part, face, opts.Live, textOpts)
	else
		BuildUtil.SurfaceText(part, face, text, textOpts)
	end
	return part
end

--[[
	Several text labels side by side (or stacked) on one face of a part.
	list = { { text, from = 0..1, to = 0..1, top = 0..1?, bottom = 0..1?, color?, font?, live? } }
	from/to are fractions of the face width (left to right as seen from the face), top/bottom
	optional fractions of its height (default the full height). live = a LiveText kind (the label
	then gets a dark LED background). glow = true: the text ignores the lighting.
]]
local function labels(part, face, list, textColor, pixelsPerStud, glow)
	for index, entry in ipairs(list) do
		local opts = {
			LabelName = part.Name .. "Text" .. index,
			TextColor3 = entry.color or textColor,
			PixelsPerStud = pixelsPerStud or 16,
			Font = entry.font or Enum.Font.GothamBlack,
			LightInfluence = (glow or entry.live) and 0 or nil,
		}
		local label
		if entry.live then
			opts.Text = entry.text
			opts.BackgroundColor3 = SCREEN_BLACK
			opts.BackgroundTransparency = 0
			label = select(2, BuildUtil.LiveText(part, face, entry.live, opts))
		else
			label = select(2, BuildUtil.SurfaceText(part, face, entry.text, opts))
		end
		local top, bottom = entry.top or 0, entry.bottom or 1
		label.Position = UDim2.new(entry.from, 0, top, 0)
		label.Size = UDim2.new(entry.to - entry.from, 0, bottom - top, 0)
	end
end

-- A see-through steel guard panel (catwalks, landings, decks) from y up 3.4 studs.
local function guard(ctx, x0, x1, y, z0, z1)
	return span(ctx, "SafetyGuard", x0, x1, y, y + 3.4, z0, z1, STEEL, Enum.Material.Metal, GUARD)
end

---------------------------------------------------------------------------------------------
-- Video boards (shared layout)
--
-- Both boards hang above the back rows of their end's upper deck (the top row is at offset
-- 148..152 = x +-283..287, y 104; the end parapet reaches y 108), centred on the field (z 30),
-- facing it. Their support structures stand outside the facade (x beyond +-295), behind the
-- board, so the roof's end notch (|z - 30| < 54) holds the board, its arms and its supports.
---------------------------------------------------------------------------------------------
local BOARD = {
	faceX = 278, -- the field-facing face (offset 143)
	backX = 286, -- the back of the housing (just inside the rear parapet at 286.2)
	bottom = 112, -- 8 above the top row, 4 above the end parapet
	top = 147.8,
	crownTop = 149.6, -- (zone MaxY 150)
	z0 = -22,
	z1 = 82,
	zc = 30,
	supportZ = { -14, 74 }, -- the scoreboard pylons and the arms of both boards (z), clear of Gates B / C
	deckY = 128, -- crew deck / catwalk floor behind the board (above the facade top at 112)
	armLow = { 113, 116 },
	armHigh = { 141.6, 145.6 },
}

local function faceNormal(s)
	return s > 0 and Enum.NormalId.Left or Enum.NormalId.Right
end

local function backNormal(s)
	return s > 0 and Enum.NormalId.Right or Enum.NormalId.Left
end

-- A screen on the face of the board on side s (+1 east, -1 west). u runs across the face from
-- the viewer's left to right as seen from the field (0 = the board's centre, +-51 the edges).
local function faceScreen(ctx, s, name, u0, u1, y0, y1, text, opts)
	local za, zb = BOARD.zc + s * u0, BOARD.zc + s * u1
	local size = Vector3.new(0.3, y1 - y0, math.abs(zb - za))
	local position = Vector3.new(s * (BOARD.faceX - 0.35), (y0 + y1) / 2, (za + zb) / 2)
	return screen(ctx, name, size, position, faceNormal(s), text, opts)
end

-- Step "frame" of either board: housing, crown, skirt, wings, the dark face plate and big
-- lettering on the back (seen from the crew deck and from outside). Returns the housing.
local function boardFrame(ctx, s, backText)
	local B = BOARD
	local team = ctx.colors
	local housing = span(ctx, "BoardHousing", s * B.faceX, s * B.backX, B.bottom, B.top, B.z0, B.z1, team.Primary)
	local front = s * (B.faceX - 0.8)
	span(ctx, "BoardCrown", front, s * B.backX, B.top, B.crownTop, B.z0 - 1, B.z1 + 1, team.Secondary)
	span(ctx, "BoardSkirt", front, s * B.backX, B.bottom - 0.6, B.bottom, B.z0 - 0.6, B.z1 + 0.6, team.Secondary)
	span(ctx, "BoardWing", front, s * B.backX, B.bottom, B.top, B.z0 - 0.6, B.z0, team.Secondary)
	span(ctx, "BoardWing", front, s * B.backX, B.bottom, B.top, B.z1, B.z1 + 0.6, team.Secondary)
	span(ctx, "FacePlate", s * (B.faceX - 0.2), s * B.faceX, B.bottom + 0.4, B.top - 0.4, B.z0 + 0.3, B.z1 - 0.3, FACE_DARK)
	local _, label = BuildUtil.SurfaceText(housing, backNormal(s), backText, {
		LabelName = "BoardBackText",
		TextColor3 = readable(team.Primary, team.Trim),
		PixelsPerStud = 8,
	})
	label.Position = UDim2.new(0.05, 0, 0.04, 0)
	label.Size = UDim2.new(0.9, 0, 0.36, 0)
	return housing
end

---------------------------------------------------------------------------------------------
-- Scoreboard: the east end-zone video board
---------------------------------------------------------------------------------------------

function M.scoreboard(ctx)
	local C = ctx.config.Colors
	local team = ctx.colors
	local B = BOARD
	local s = 1
	local name = teamText(ctx, "")
	-- pylon column lines (x) and column size: the pylons stand at the zone's outer edge, behind the
	-- Gate C plaza (Exterior.lua dresses it with a canopy, tents and flags up to x 312)
	local frontX, backX, col = 312, 320, 2.4
	local south, north = B.supportZ[1], B.supportZ[2]
	local deckY = B.deckY
	local walkX = B.backX + 5 -- outer edge of the catwalk behind the board (x 286.2..291, 4.2 clear)

	-------------------------------------------------------------------------- 1 Support Legs
	BuildUtil.Stage(ctx, 1)
	local support = BuildUtil.Child(ctx, "BoardSupport")
	local lookColumn
	for _, zc in ipairs(B.supportZ) do
		span(support, "PylonFooting", frontX - 0.4, backX + 0.4, 0, 0.8, zc - 6, zc + 6, C.ConcreteDark, Enum.Material.Concrete)
		for _, cx in ipairs({ { frontX, frontX + col }, { backX - col, backX } }) do
			for _, cz in ipairs({ { zc - 5, zc - 5 + col }, { zc + 5 - col, zc + 5 } }) do
				local column = span(support, "PylonColumn", cx[1], cx[2], 0.8, B.top, cz[1], cz[2], STEEL, Enum.Material.Metal)
				if zc == north and cx[1] == frontX and cz[1] < zc then
					lookColumn = column
				end
			end
		end
		span(support, "PylonCap", frontX - 0.4, backX + 0.4, B.top, B.top + 1.4, zc - 5.4, zc + 5.4, team.Secondary)
		-- ties across both side faces + a beam across the front (it carries the lower arm)
		for _, y in ipairs({ 30, 60, 90 }) do
			for _, z in ipairs({ zc - 5, zc + 4.4 }) do
				span(support, "PylonTie", frontX + col, backX - col, y - 0.6, y + 0.6, z, z + 0.6, STEEL, Enum.Material.Metal)
			end
		end
		span(support, "PylonBeam", frontX, frontX + col, 110, 113, zc - 5 + col, zc + 5 - col, STEEL, Enum.Material.Metal)
		span(support, "PylonBeam", backX - col, backX, 110, 113, zc - 5 + col, zc + 5 - col, STEEL, Enum.Material.Metal)
		-- the crew landing (y 128) runs through the pylon from the catwalk to the back columns
		span(
			support,
			"CrewLanding",
			B.backX + 0.2,
			backX - 0.1,
			deckY - 0.4,
			deckY,
			zc - 4.95,
			zc + 4.95,
			STEEL,
			Enum.Material.DiamondPlate
		)
		guard(support, walkX, backX - 0.1, deckY, zc < 30 and zc + 4.65 or zc - 4.95, zc < 30 and zc + 4.95 or zc - 4.65) -- catwalk side
		guard(support, B.backX + 0.5, backX - 0.1, deckY, zc < 30 and zc - 4.95 or zc + 4.65, zc < 30 and zc - 4.65 or zc + 4.95) -- outer side
		guard(support, backX - 0.4, backX - 0.1, deckY, zc - 5 + col, zc + 5 - col)
	end
	-- arms from the pylons (and the truss in the middle) over the facade to the board's back
	for _, z in ipairs({ south, B.zc, north }) do
		span(support, "BoardArm", B.backX, frontX, B.armLow[1], B.armLow[2], z - 1.2, z + 1.2, STEEL, Enum.Material.Metal)
		span(support, "BoardArm", B.backX, frontX, B.armHigh[1], B.armHigh[2], z - 1.2, z + 1.2, STEEL, Enum.Material.Metal)
	end
	-- the truss between the pylons: top + bottom chords and a big X (high above Gate C)
	span(support, "TrussChord", frontX, frontX + col, 144.6, B.top, south + 5, north - 5, STEEL, Enum.Material.Metal)
	span(support, "TrussChord", frontX, frontX + col, 110, 113, south + 5, north - 5, STEEL, Enum.Material.Metal)
	local braceX = frontX + col / 2
	strut(support, "TrussBrace", Vector3.new(braceX, 22, south + 5), Vector3.new(braceX, 110, north - 5), 1.2, STEEL)
	strut(support, "TrussBrace", Vector3.new(braceX, 22, north - 5), Vector3.new(braceX, 110, south + 5), 1.2, STEEL)

	-- the service catwalk behind the board (between the landings), with its guards + hangers
	span(support, "CatwalkFloor", B.backX + 0.2, walkX, deckY - 0.4, deckY, south + 4.95, north - 4.95, STEEL, Enum.Material.DiamondPlate)
	guard(support, B.backX + 0.2, B.backX + 0.5, deckY, south - 5, north + 5) -- board side (the housing stands right in front)
	guard(support, walkX - 0.3, walkX, deckY, south + 5, north - 5)
	post(support, "CatwalkHanger", walkX - 0.15, B.zc, deckY + 3.4, B.armHigh[1], 0.35, STEEL, Enum.Material.Metal, NO_COLLIDE)
	span(
		support,
		"CatwalkStrut",
		B.backX + 1.6,
		B.backX + 2.4,
		B.armLow[2],
		deckY - 0.4,
		B.zc - 0.4,
		B.zc + 0.4,
		STEEL,
		Enum.Material.Metal
	)

	BuildUtil.Look(
		lookColumn,
		"Video Board Pylons",
		"Two steel pylons, taller than a 12-storey building, hold the video board out over the top row of seats. Gate C is right between them!",
		{ LookKey = "record", At = atPoint(ctx, lookColumn, Vector3.new(frontX + col / 2, 4, north - 5.2)) }
	)

	-- the service lift in the south pylon (glass shaft, car at the bottom)
	span(
		support,
		"LiftShaft",
		frontX + col + 0.2,
		backX - col - 0.2,
		0.8,
		deckY - 0.4,
		south - 1.6,
		south + 1.6,
		C.Glass,
		Enum.Material.Glass,
		{ Transparency = 0.55, CanCollide = false }
	)
	local liftX = (frontX + backX) / 2
	span(support, "LiftCar", liftX - 1.2, liftX + 1.2, 0.8, 8.6, south - 1.4, south + 1.4, CABINET_GREY, Enum.Material.Metal, NO_COLLIDE)
	local callBox =
		span(support, "LiftCallBox", liftX - 0.8, liftX + 0.8, 0.8, 4.8, south + 5.2, south + 5.8, CABINET_GREY, Enum.Material.Metal)
	local _, callLabel = BuildUtil.SurfaceText(callBox, Enum.NormalId.Back, "LIFT", {
		LabelName = "LiftCallText",
		TextColor3 = INK,
		BackgroundColor3 = SAFETY_YELLOW,
		BackgroundTransparency = 0,
		PixelsPerStud = 30,
	})
	callLabel.Size = UDim2.new(1, 0, 0.25, 0)
	BuildUtil.Elevator(
		ctx,
		callBox,
		CFrame.lookAt(Vector3.new(294, deckY, south), Vector3.new(280, deckY, south)),
		{ Action = "Ride the service lift", Object = "Video Board Lift", Label = "VIDEO BOARD CATWALK", At = Vector3.new(0, 0, 0.6) }
	)
	local liftButton = span(
		support,
		"LiftButton",
		frontX - 0.6,
		frontX - 0.2,
		deckY,
		deckY + 4.2,
		south - 0.6,
		south + 0.6,
		CABINET_GREY,
		Enum.Material.Metal
	)
	BuildUtil.Elevator(
		ctx,
		liftButton,
		CFrame.lookAt(Vector3.new(liftX, 0, south + 9.5), Vector3.new(liftX, 0, B.zc)),
		{ Action = "Ride down", Object = "Video Board Lift", Label = "GATE C", At = Vector3.new(-0.4, 0.6, 0) }
	)

	-- the control box beside the north pylon
	local controlBox =
		span(support, "ControlBox", liftX - 1.5, liftX + 1.5, 0, 4.6, north + 6.2, north + 7.4, CABINET_GREY, Enum.Material.Metal)
	span(support, "ControlBoxLamp", liftX - 0.6, liftX + 0.6, 3.6, 4.1, north + 7.4, north + 7.6, LED_GREEN, Enum.Material.Neon, GLOW)
	BuildUtil.Look(
		controlBox,
		"Video Board Control Box",
		"Cables from the press box plug in here. When the crew types in a new score, it flashes up on the board a split second later.",
		{ Distance = 8 }
	)

	-------------------------------------------------------------------------- 2 Board Frame
	BuildUtil.Stage(ctx, 2)
	boardFrame(ctx, s, name ~= "" and name or "VIDEO BOARD")
	local hatch = span(ctx, "ServiceHatch", B.backX, B.backX + 0.15, deckY + 1, deckY + 6.6, B.zc - 9, B.zc - 3, DESK_DARK, nil, NO_COLLIDE)
	BuildUtil.Look(
		hatch,
		"Service Hatch",
		"Behind this hatch: thousands of LED lights and the fans that keep them cool on hot game days.",
		{ Distance = 8 }
	)
	-- the operator's booth on the north landing: desk, live score monitor and a TV camera seat
	span(ctx, "OperatorDesk", B.backX + 0.6, B.backX + 2.2, deckY, deckY + 2.8, north - 2.5, north + 2.5, CABINET_GREY, Enum.Material.Metal)
	local monitor = span(
		ctx,
		"OperatorMonitor",
		B.backX + 0.7,
		B.backX + 0.9,
		deckY + 3.1,
		deckY + 5.7,
		north - 1.9,
		north + 1.9,
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
		CFrame = CFrame.lookAt(Vector3.new(B.backX + 4.4, deckY + 0.6, north), Vector3.new(B.backX, deckY + 0.6, north)),
		Size = Vector3.new(2, 1.2, 2),
		Color = team.Secondary,
		Object = "Video Board Operator's Seat",
		Camera = { From = Vector3.new(272, 152, B.zc), To = Vector3.new(0, 0, B.zc), Fov = 55, Label = "VIDEO BOARD CAM" },
	})

	-------------------------------------------------------------------------- 3 Screens
	BuildUtil.Stage(ctx, 3)
	local trim = readable(SCREEN_BLACK, team.Trim)
	faceScreen(ctx, s, "TitleScreen", -50.4, 50.4, 141.6, 146.8, name ~= "" and (name .. " STADIUM") or "STADIUM", {
		LabelName = "ScoreboardTitle",
		TextColor3 = trim,
		PixelsPerStud = 10,
	})
	faceScreen(ctx, s, "ScoreScreen", -30, 30, 125, 141, "HOME 0  -  AWAY 0", {
		LabelName = "ScoreboardScore",
		TextColor3 = LED_AMBER,
		Font = Enum.Font.Arcade,
		PixelsPerStud = 12,
	})
	faceScreen(ctx, s, "AttendanceScreen", -50.4, -0.3, 118.8, 124.4, "ATTENDANCE 0", {
		LabelName = "ScoreboardAttendance",
		TextColor3 = LED_GREEN,
		Font = Enum.Font.GothamBold,
		PixelsPerStud = 12,
	})
	faceScreen(ctx, s, "GameDayScreen", 0.3, 50.4, 118.8, 124.4, "NEXT GAME SOON", {
		LabelName = "ScoreboardGameDay",
		Live = "gameday",
		TextColor3 = LED_AMBER,
		Font = Enum.Font.Arcade,
		PixelsPerStud = 12,
	})
	faceScreen(ctx, s, "RecordScreen", -50.4, -30.6, 125, 133, "RECORD 0-0", {
		LabelName = "ScoreboardRecord",
		Live = "record",
		TextColor3 = LED_WHITE,
		Font = Enum.Font.GothamBold,
		PixelsPerStud = 16,
	})
	faceScreen(ctx, s, "SeasonScreen", 30.6, 50.4, 125, 133, "SEASON 1 - WEEK 1", {
		LabelName = "ScoreboardSeason",
		Live = "season",
		TextColor3 = LED_CYAN,
		Font = Enum.Font.GothamBold,
		PixelsPerStud = 16,
	})
	faceScreen(ctx, s, "TitlesRibbon", -50.4, 50.4, 113, 118.2, "CHAMPIONSHIPS: 0", {
		LabelName = "ScoreboardTitles",
		Live = "titles",
		TextColor3 = readable(SCREEN_BLACK, team.Secondary),
		Font = Enum.Font.GothamBlack,
		PixelsPerStud = 10,
	})
	-- play clock (left as seen from the field) and down & distance (right)
	local clock = faceScreen(ctx, s, "PlayClock", -50.4, -30.6, 133.6, 141, "", { LabelName = "PlayClockBack" })
	labels(clock, faceNormal(s), {
		{ text = "PLAY CLOCK", from = 0.06, to = 0.94, top = 0.04, bottom = 0.26, color = LED_WHITE },
		{ text = ":40", from = 0.06, to = 0.94, top = 0.28, bottom = 0.76, color = LED_RED, font = Enum.Font.Arcade },
		{ text = "QTR 2", from = 0.06, to = 0.94, top = 0.78, bottom = 0.96, color = LED_AMBER },
	}, LED_WHITE, 16, true)
	local downs = faceScreen(ctx, s, "DownDistance", 30.6, 50.4, 133.6, 141, "", { LabelName = "DownDistanceBack" })
	labels(downs, faceNormal(s), {
		{ text = "DOWN", from = 0.06, to = 0.94, top = 0.04, bottom = 0.26, color = LED_WHITE },
		{ text = "1ST & 10", from = 0.06, to = 0.94, top = 0.3, bottom = 0.66, color = LED_AMBER, font = Enum.Font.Arcade },
		{ text = "BALL ON 35", from = 0.06, to = 0.94, top = 0.74, bottom = 0.94, color = LED_GREEN },
	}, LED_WHITE, 16, true)
	-- LED power racks on the north landing (they hum when the board is on)
	local rack = span(ctx, "LedPowerRack", 293.4, 296.6, deckY, deckY + 5, north + 2.9, north + 4.6, DESK_DARK, Enum.Material.Metal)
	span(ctx, "RackLights", 293.8, 296.2, deckY + 1, deckY + 4.4, north + 2.75, north + 2.9, LED_GREEN, Enum.Material.Neon, GLOW)
	BuildUtil.Look(
		rack,
		"LED Power Racks",
		"These racks feed power to every screen on the video board. Together the screens are brighter than 10,000 light bulbs!",
		{ Distance = 8 }
	)
end

---------------------------------------------------------------------------------------------
-- Light towers (outside the four diagonal corners of the facade)
---------------------------------------------------------------------------------------------
local TOWER = {
	footHalf = 13, -- the footing pad is 26 x 26
	footY = 0.8,
	baseHalf = 9, -- lattice leg distance from the tower axis at the foot...
	topHalf = 2.6, -- ...and at the top platform
	platformY = 140,
	rings = { 36, 72, 108 },
	bankY = 156, -- centre of the flood-light bank
	camY = 225, -- the TOWER CAM (high enough to see over the roof's inner edge into the bowl)
}

-- How far the lattice legs are from the tower axis at height y.
local function legOffset(y)
	local t = (y - TOWER.footY) / (TOWER.platformY - TOWER.footY)
	return TOWER.baseHalf + (TOWER.topHalf - TOWER.baseHalf) * t
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

--[[
	Field-level fixtures for one tower's quarter of the field (sx, sz = the tower's side in X / Z).
	Roblox lights reach 60 studs at most, so the banks high up on the towers can't light the turf
	themselves: these invisible fixtures throw their light onto it. Two stand on the field wall of
	the tower's sideline and one on its end line (just above the wall's cap, facing the turf, tilted
	15 degrees down), and one hangs over the middle of the field (the walls are more than 60 studs
	from it). They all face away from the stands, so no light leaks into the rooms under the bowl.
	They are SpotLights named "FloodLight" (Enabled = false): the night logic switches them.
]]
local FIELD_LIGHT_TILT = math.rad(15)

local function fieldLights(ctx, L, sx, sz)
	local inset = 0.6 -- in front of the field wall's padded face (offset -0.35)
	local sideZ = sz > 0 and L.SurfaceMaxZ - inset or L.SurfaceMinZ + inset
	local endX = sx * (L.SurfaceHalfX - inset)
	local tilt = math.sin(FIELD_LIGHT_TILT)
	local level = math.cos(FIELD_LIGHT_TILT)
	local fixtures = {
		{ Vector3.new(sx * 30, 5, sideZ), Vector3.new(0, -tilt, -sz * level) },
		{ Vector3.new(sx * 90, 5, sideZ), Vector3.new(0, -tilt, -sz * level) },
		{ Vector3.new(endX, 5, L.FieldCenterZ + sz * 32), Vector3.new(-sx * level, -tilt, 0) },
		-- over the middle band: the home-side tower takes the inner half, the visitor-side one the
		-- outer half of its end of the field
		{ Vector3.new(sx * (sz > 0 and 35 or 100), 30, L.FieldCenterZ), Vector3.new(0, -1, 0) },
	}
	for _, spec in ipairs(fixtures) do
		local position, direction = spec[1], spec[2]
		local up = math.abs(direction.Y) > 0.99 and Vector3.new(0, 0, 1) or Vector3.new(0, 1, 0)
		local fixture = BuildUtil.Part(ctx, {
			Name = "FieldLight",
			Size = Vector3.new(1, 1, 1),
			CFrame = CFrame.lookAt(position, position + direction, up),
			Transparency = 1,
			CanCollide = false,
			CastShadow = false,
		})
		fixture.CanTouch = false
		fixture.CanQuery = false
		BuildUtil.Light(fixture, "SpotLight", {
			Name = "FloodLight",
			Enabled = false,
			Face = Enum.NormalId.Front,
			Range = 60,
			Angle = 120,
			Brightness = 2.5,
			Color = WARM_WHITE,
		})
	end
end

local function lightTower(ctx, number, base, target)
	local C = ctx.config.Colors
	local team = ctx.colors
	local tower = BuildUtil.Child(ctx, "LightTower" .. number)
	local bx, bz = base.X, base.Z
	local sx = bx >= target.X and 1 or -1 -- the tower's outer side in X (away from the field)
	local sz = bz >= target.Z and 1 or -1 -- ...and in Z
	local toField = Vector3.new(target.X - bx, 0, target.Z - bz).Unit
	local footY, topY = TOWER.footY, TOWER.platformY

	BuildUtil.Block(
		tower,
		"TowerFooting",
		Vector3.new(TOWER.footHalf * 2, footY, TOWER.footHalf * 2),
		Vector3.new(bx, 0, bz),
		C.ConcreteDark,
		Enum.Material.Concrete
	)
	-- four tapered lattice legs, three brace rings and a zigzag diagonal on every face of each bay
	for _, dx in ipairs({ -1, 1 }) do
		for _, dz in ipairs({ -1, 1 }) do
			strut(
				tower,
				"TowerLeg",
				Vector3.new(bx + dx * TOWER.baseHalf, footY, bz + dz * TOWER.baseHalf),
				Vector3.new(bx + dx * TOWER.topHalf, topY - 0.5, bz + dz * TOWER.topHalf),
				1.4,
				C.Metal
			)
		end
	end
	for _, y in ipairs(TOWER.rings) do
		local o = legOffset(y)
		for _, side in ipairs({ -1, 1 }) do
			BuildUtil.Box(
				tower,
				"TowerBrace",
				Vector3.new(2 * o, 0.7, 0.7),
				Vector3.new(bx, y, bz + side * o),
				C.Metal,
				Enum.Material.Metal
			)
			BuildUtil.Box(
				tower,
				"TowerBrace",
				Vector3.new(0.7, 0.7, 2 * o - 0.7),
				Vector3.new(bx + side * o, y, bz),
				C.Metal,
				Enum.Material.Metal
			)
		end
	end
	local levels = { footY + 0.4, TOWER.rings[1], TOWER.rings[2], TOWER.rings[3] }
	for i = 1, #levels - 1 do
		local y0, y1 = levels[i], levels[i + 1]
		local o0, o1 = legOffset(y0), legOffset(y1)
		local flip = (i % 2 == 0) and -1 or 1
		for _, side in ipairs({ -1, 1 }) do
			strut(
				tower,
				"TowerDiagonal",
				Vector3.new(bx + side * o0, y0, bz - flip * o0),
				Vector3.new(bx + side * o1, y1, bz + flip * o1),
				0.5,
				C.Metal
			)
			strut(
				tower,
				"TowerDiagonal",
				Vector3.new(bx - flip * o0, y0, bz + side * o0),
				Vector3.new(bx + flip * o1, y1, bz + side * o1),
				0.5,
				C.Metal
			)
		end
	end

	-- the top platform (grating + see-through guards on all four sides)
	local platformHalf = 9
	BuildUtil.Box(
		tower,
		"TowerPlatform",
		Vector3.new(platformHalf * 2, 0.5, platformHalf * 2),
		Vector3.new(bx, topY - 0.25, bz),
		team.Secondary,
		Enum.Material.DiamondPlate
	)
	for _, side in ipairs({ -1, 1 }) do
		guard(tower, bx - platformHalf, bx + platformHalf, topY, bz + side * platformHalf - 0.15, bz + side * platformHalf + 0.15)
		guard(
			tower,
			bx + side * platformHalf - 0.15,
			bx + side * platformHalf + 0.15,
			topY,
			bz - platformHalf + 0.15,
			bz + platformHalf - 0.15
		)
	end

	-- the main bank on top, aimed at the field centre, carried by a mast + cross-arm
	local headPosition = Vector3.new(bx, TOWER.bankY, bz) + toField * 2.4
	local head = CFrame.lookAt(headPosition, target)
	local plateWidth, plateHeight, panelCount = floodBank(tower, head, 5, 3, Vector3.new(3.8, 3.8, 0.5), {
		{ 2, 2, 70, 5 },
		{ 4, 2, 70, 5 },
		{ 3, 1, 80, 5 },
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
	local armTop = (head * CFrame.new(0, -plateHeight / 2, 0.4)).Position.Y
	local armCentre = Vector3.new(bx, armTop - 0.5, bz)
	BuildUtil.Part(tower, {
		Name = "HeadCrossArm",
		Size = Vector3.new(plateWidth - 3, 1, 2.4),
		CFrame = CFrame.lookAt(armCentre, armCentre + toField),
		Color = STEEL,
		Material = Enum.Material.Metal,
	})
	post(tower, "TowerMast", bx, bz, topY, armTop - 0.5, 2.2, C.Metal)

	-- the lift: a glass shaft inside the lattice, the car at the bottom, a call box on the footing
	local shaftX = bx + sx * 4
	span(tower, "LiftShaft", shaftX - 1.6, shaftX + 1.6, footY, topY - 0.5, bz - 1.6, bz + 1.6, C.Glass, Enum.Material.Glass, {
		Transparency = 0.55,
		CanCollide = false,
	})
	span(
		tower,
		"LiftCar",
		shaftX - 1.4,
		shaftX + 1.4,
		footY,
		footY + 7.6,
		bz - 1.4,
		bz + 1.4,
		CABINET_GREY,
		Enum.Material.Metal,
		NO_COLLIDE
	)
	local liftHead = span(tower, "LiftHead", shaftX - 1.6, shaftX + 1.6, topY, topY + 7, bz - 1.6, bz + 1.6, C.Glass, Enum.Material.Glass, {
		Transparency = 0.45,
		CanCollide = false,
	})
	local callX = bx + sx * 11.6
	local callBox = span(
		tower,
		"LiftCallBox",
		callX - 0.4,
		callX + 0.4,
		footY,
		footY + 3.8,
		bz - sz * 3.8,
		bz - sz * 2.2,
		CABINET_GREY,
		Enum.Material.Metal
	)
	BuildUtil.Elevator(
		ctx,
		callBox,
		CFrame.lookAt(Vector3.new(bx, topY, bz + sz * 5), Vector3.new(target.X, topY, target.Z)),
		{ Action = "Ride the tower lift", Object = "Light Tower " .. number, Label = "LIGHT TOWER " .. number .. " - TOP" }
	)
	BuildUtil.Elevator(
		ctx,
		liftHead,
		CFrame.lookAt(Vector3.new(callX, footY, bz + sz * 3), Vector3.new(callX + sx * 10, footY, bz + sz * 3)),
		{ Action = "Ride down", Object = "Tower Lift", Label = "GROUND LEVEL", At = Vector3.new(-sx * 1.7, -1.5, 0) }
	)
	-- a crew seat on the platform with a camera high above the bank: the roof hides the field from
	-- the bank itself, so the camera rises until it looks over the roof into the whole bowl
	local seatPosition = Vector3.new(bx - sx * 5, topY + 0.6, bz - sz * 5)
	BuildUtil.Seat(tower, {
		Name = "TowerCamSeat",
		CFrame = CFrame.lookAt(seatPosition, Vector3.new(target.X, seatPosition.Y, target.Z)),
		Size = Vector3.new(2, 1.2, 2),
		Color = team.Primary,
		Object = "Light Crew Seat",
		Camera = {
			From = Vector3.new(bx, TOWER.camY, bz) + toField * 10,
			To = Vector3.new(target.X, 0, target.Z),
			Fov = 50,
			Label = "LIGHT TOWER " .. number .. " CAM",
		},
	})

	-- power box on the outer side of the footing, with the tower's number
	local boxPosition = Vector3.new(bx - sx * 3, footY + 1.6, bz + sz * 11.6)
	local powerBox = BuildUtil.Part(tower, {
		Name = "PowerBox",
		Size = Vector3.new(2.4, 3.2, 1.2),
		CFrame = CFrame.lookAt(boxPosition, boxPosition + Vector3.new(0, 0, sz)),
		Color = CABINET_GREY,
		Material = Enum.Material.Metal,
	})
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
		("This tower is %d studs tall and its %d flood lights point right at the middle of the field. They switch on by themselves at night!"):format(
			math.floor(TOWER.bankY),
			panelCount
		),
		{ Distance = 8 }
	)

	-- its quarter of the field lights up at night
	fieldLights(tower, ctx.config.Layout, sx, sz)
end

function M.lights(ctx)
	local L = ctx.config.Layout
	local target = Vector3.new(0, 0, L.FieldCenterZ)
	-- one complete tower per step, in the order of Layout.LightTowerPositions
	for index, base in ipairs(L.LightTowerPositions) do
		BuildUtil.Stage(ctx, index)
		lightTower(ctx, index, base, target)
	end
end

---------------------------------------------------------------------------------------------
-- Jumbotron: the west end-zone video board
---------------------------------------------------------------------------------------------

function M.jumbotron(ctx)
	local C = ctx.config.Colors
	local team = ctx.colors
	local B = BOARD
	local s = -1
	local name = teamText(ctx, "")
	-- the towers (x): at the zone's outer edge, behind the Gate B plaza's flag line (offset 172)
	local x0, x1 = -320, -308
	-- the towers flank the board (z -22..82) like goalposts, clear of the Gate B plaza between them
	-- (Exterior.lua dresses it with tents and flags at z -9..74)
	local south = { B.z0 - 16, B.z0 } -- south tower (z -38..-22): the Video Control Room is at its foot
	local north = { B.z1, B.z1 + 16 } -- north tower (z 82..98): the lift to the screen deck
	local deckY = B.deckY
	local concrete, concreteMat = CONCRETE, Enum.Material.Concrete

	-- the Video Control Room inside the south tower (door on its +Z side, facing Gate B)
	local rx0, rx1 = x0 + 1, x1 - 1 -- -319 .. -309
	local rz0, rz1 = south[1] + 1, south[2] - 1 -- -21 .. -7
	local roomTop = 10.4
	local doorX0, doorX1, doorTop = (rx0 + rx1) / 2 - 3, (rx0 + rx1) / 2 + 3, 8.6
	local midZ = (rz0 + rz1) / 2 -- -14

	-------------------------------------------------------------------------- 1 Support Tower
	BuildUtil.Stage(ctx, 1)
	span(ctx, "TowerWall", x0, rx0, 0, roomTop, south[1], south[2], concrete, concreteMat)
	span(ctx, "TowerWall", rx1, x1, 0, roomTop, south[1], south[2], concrete, concreteMat)
	span(ctx, "TowerWall", rx0, rx1, 0, roomTop, south[1], rz0, concrete, concreteMat)
	span(ctx, "TowerWall", rx0, doorX0, 0, roomTop, rz1, south[2], concrete, concreteMat)
	span(ctx, "TowerWall", doorX1, rx1, 0, roomTop, rz1, south[2], concrete, concreteMat)
	span(ctx, "TowerWall", doorX0, doorX1, doorTop, roomTop, rz1, south[2], concrete, concreteMat)
	span(ctx, "TowerShaft", x0, x1, roomTop, B.top, south[1], south[2], concrete, concreteMat)
	span(ctx, "TowerShaft", x0, x1, 0, B.top, north[1], north[2], concrete, concreteMat)
	local bridge = span(ctx, "TowerBridge", x0, x1, 140, B.top, south[2], north[1], concrete, concreteMat)
	BuildUtil.SurfaceText(bridge, Enum.NormalId.Left, name ~= "" and name or "JUMBOTRON", {
		LabelName = "BridgeText",
		TextColor3 = team.Primary,
		PixelsPerStud = 6,
	})
	span(ctx, "TowerCap", x0 - 0.4, x1, B.top, B.top + 1.4, south[1] - 0.4, north[2] + 0.4, team.Primary)
	-- team-coloured bands round both towers at the top of the control room
	for _, zs in ipairs({ south, north }) do
		span(ctx, "TowerBand", x0 - 0.3, x1 + 0.3, 12, 14, zs[1] - 0.3, zs[2] + 0.3, team.Primary, nil, NO_COLLIDE)
		-- a tall team-coloured stripe up the outer (west) face
		local zm = (zs[1] + zs[2]) / 2
		span(ctx, "TowerStripe", x0 - 0.3, x0, 16, 138, zm - 1.6, zm + 1.6, team.Secondary, nil, NO_COLLIDE)
	end
	-- the beam under the screen deck + the arms over the facade to the board's back
	span(ctx, "LowerBeam", x1 - 2.4, x1, 110, B.armLow[2], south[2], north[1], STEEL, Enum.Material.Metal)
	for _, z in ipairs({ B.supportZ[1], B.zc, B.supportZ[2] }) do
		span(ctx, "BoardArm", x1, -B.backX, B.armLow[1], B.armLow[2], z - 1.2, z + 1.2, STEEL, Enum.Material.Metal)
		span(ctx, "BoardArm", x1, -B.backX, B.armHigh[1], B.armHigh[2], z - 1.2, z + 1.2, STEEL, Enum.Material.Metal)
	end

	-- the screen deck behind the board (y 128), guarded on its open sides
	span(ctx, "ScreenDeck", x1, -(B.backX + 0.2), deckY - 0.4, deckY, south[1], north[2], STEEL, Enum.Material.DiamondPlate)
	guard(ctx, -(B.backX + 0.5), -(B.backX + 0.2), deckY, south[1], north[2])
	guard(ctx, x1, x1 + 0.3, deckY, south[2], north[1])
	guard(ctx, x1 + 0.3, -(B.backX + 0.5), deckY, south[1], south[1] + 0.3)
	guard(ctx, x1 + 0.3, -(B.backX + 0.5), deckY, north[2] - 0.3, north[2])

	-- the room: floor, ceiling, lamp, a sign over the door and the door itself
	span(ctx, "ControlRoomFloor", rx0, rx1, 0, 0.2, rz0, rz1, FLOOR_DARK)
	span(ctx, "ControlRoomRug", rx0 + 3.5, rx0 + 8.5, 0.2, 0.25, rz1 - 3.8, rz1 - 0.6, team.Primary, Enum.Material.Fabric, NO_COLLIDE)
	span(ctx, "WallStripe", rx0, rx0 + 0.1, 3.4, 4, rz0, rz1, team.Secondary, nil, NO_COLLIDE)
	span(ctx, "WallStripe", rx0, rx1, 3.4, 4, rz0, rz0 + 0.1, team.Secondary, nil, NO_COLLIDE)
	span(ctx, "ControlRoomCeiling", rx0, rx1, roomTop - 0.4, roomTop, rz0, rz1, CEILING_WHITE)
	for _, z in ipairs({ midZ - 3.5, midZ + 3.5 }) do
		local lamp = span(
			ctx,
			"ControlRoomLamp",
			rx0 + 3,
			rx1 - 3,
			roomTop - 0.6,
			roomTop - 0.4,
			z - 0.6,
			z + 0.6,
			WARM_WHITE,
			Enum.Material.Neon,
			GLOW
		)
		BuildUtil.Light(lamp, "PointLight", { Name = "RoomLight", Range = 16, Brightness = 1.2, Color = WARM_WHITE })
	end
	local doorSign = span(
		ctx,
		"ControlRoomSign",
		doorX0 - 1,
		doorX1 + 1,
		doorTop + 0.3,
		roomTop + 1.2,
		south[2],
		south[2] + 0.3,
		team.Secondary,
		nil,
		NO_COLLIDE
	)
	BuildUtil.SurfaceText(doorSign, Enum.NormalId.Back, "VIDEO CONTROL", {
		LabelName = "ControlRoomSignText",
		TextColor3 = readable(team.Secondary, team.Primary),
		PixelsPerStud = 20,
	})
	local doorHeight = doorTop - 0.3
	local doorCentre = Vector3.new((doorX0 + doorX1) / 2, 0.2 + doorHeight / 2, south[2] - 0.5)
	BuildUtil.Door(ctx, {
		Name = "ControlRoomDoor",
		Size = Vector3.new(doorX1 - doorX0, doorHeight, 0.4),
		CFrame = CFrame.lookAt(doorCentre, doorCentre + Vector3.new(0, 0, -1)),
		Double = true,
		Window = true,
		Color = DESK_DARK,
		Material = Enum.Material.Metal,
		Object = "Video Control Room",
		Title = "Video Control Room",
		Info = "The jumbotron crew works in here: replays, crowd cams and the giant TOUCHDOWN! graphics.",
		Distance = 8,
	})

	-- the lift in the north tower: doors at its foot (facing Gate B) and onto the screen deck
	local liftX = x0 + 3.4 -- the lift door's centre (x)
	span(ctx, "LiftDoor", liftX - 2, liftX + 2, 0, 8.4, north[1] - 0.2, north[1], STEEL_PALE, Enum.Material.Metal, NO_COLLIDE)
	span(ctx, "LiftGlass", liftX - 2, liftX + 2, 9.4, 138, north[1] - 0.1, north[1], C.Glass, Enum.Material.Glass, {
		Transparency = 0.3,
		CanCollide = false,
	})
	local callPanel =
		span(ctx, "LiftCallPanel", liftX + 2.8, liftX + 4, 3, 5.6, north[1] - 0.4, north[1], CABINET_GREY, Enum.Material.Metal)
	BuildUtil.Elevator(
		ctx,
		callPanel,
		CFrame.lookAt(Vector3.new(-292, deckY, north[1] + 4), Vector3.new(-292, deckY, B.zc)),
		{ Action = "Ride the tower lift", Object = "Jumbotron Lift", Label = "SCREEN DECK" }
	)
	local topDoor =
		span(ctx, "LiftDoorTop", x1, x1 + 0.2, deckY, deckY + 8.4, north[1] + 6, north[1] + 10, STEEL_PALE, Enum.Material.Metal, NO_COLLIDE)
	BuildUtil.Elevator(
		ctx,
		topDoor,
		CFrame.lookAt(Vector3.new(liftX, 0, north[1] - 5), Vector3.new(liftX, 0, B.zc)),
		{ Action = "Ride down", Object = "Jumbotron Lift", Label = "GATE B", At = Vector3.new(0, -1, 0) }
	)
	local plaque = span(ctx, "TowerPlaque", x1 - 2.8, x1 - 0.4, 3, 6.2, north[1] - 0.3, north[1], team.Secondary, nil, NO_COLLIDE)
	BuildUtil.Look(
		plaque,
		"Jumbotron Towers",
		"These two concrete towers hold the biggest screen in your stadium high above the end zone. The lift rides up to the screen deck right behind it!",
		{ LookKey = "team", Distance = 8 }
	)

	-------------------------------------------------------------------------- 2 Screen Frame
	BuildUtil.Stage(ctx, 2)
	local housing = boardFrame(ctx, s, name ~= "" and name or "JUMBOTRON")
	BuildUtil.Look(
		housing,
		"Jumbotron Frame",
		"This steel frame is as wide as a football field is tall... well, almost! It weighs as much as 30 school buses.",
		{ At = atPoint(ctx, housing, Vector3.new(-B.backX, deckY + 3.5, B.zc - 18)), Distance = 8 }
	)
	BuildUtil.Seat(ctx, {
		Name = "JumbotronCamSeat",
		CFrame = CFrame.lookAt(Vector3.new(-291, deckY + 0.6, B.zc + 10), Vector3.new(-280, deckY + 0.6, B.zc + 10)),
		Size = Vector3.new(2, 1.2, 2),
		Color = team.Secondary,
		Object = "Screen Crew Seat",
		Camera = { From = Vector3.new(-272, 152, B.zc), To = Vector3.new(0, 0, B.zc), Fov = 55, Label = "JUMBOTRON CAM" },
	})

	-------------------------------------------------------------------------- 3 Video Screen & Speakers
	BuildUtil.Stage(ctx, 3)
	faceScreen(ctx, s, "VideoScreen", -30.8, 30.8, 121, 146.8, name ~= "" and name or "WELCOME!", {
		LabelName = "JumbotronText",
		TextColor3 = team.Trim,
		BackgroundColor3 = team.Primary,
		TextStrokeTransparency = 0.3,
		PixelsPerStud = 10,
	})
	faceScreen(ctx, s, "ScoreRibbon", -30.8, 30.8, 113.2, 120.4, "HOME 0 - 0 VISITORS", {
		LabelName = "JumbotronScore",
		Live = "score",
		TextColor3 = LED_AMBER,
		Font = Enum.Font.Arcade,
		PixelsPerStud = 10,
	})
	faceScreen(ctx, s, "RecordPanel", -42.6, -31.4, 130.6, 146.8, "RECORD 0-0", {
		LabelName = "JumbotronRecord",
		Live = "record",
		TextColor3 = LED_WHITE,
		Font = Enum.Font.GothamBold,
		PixelsPerStud = 16,
	})
	faceScreen(ctx, s, "GameDayPanel", -42.6, -31.4, 113.2, 130, "NEXT GAME SOON", {
		LabelName = "JumbotronGameDay",
		Live = "gameday",
		TextColor3 = LED_AMBER,
		Font = Enum.Font.GothamBold,
		PixelsPerStud = 16,
	})
	faceScreen(ctx, s, "SeasonPanel", 31.4, 42.6, 130.6, 146.8, "SEASON 1 - WEEK 1", {
		LabelName = "JumbotronSeason",
		Live = "season",
		TextColor3 = LED_CYAN,
		Font = Enum.Font.GothamBold,
		PixelsPerStud = 16,
	})
	faceScreen(ctx, s, "TitlesPanel", 31.4, 42.6, 113.2, 130, "CHAMPIONSHIPS: 0", {
		LabelName = "JumbotronTitles",
		Live = "titles",
		TextColor3 = LED_GREEN,
		Font = Enum.Font.GothamBold,
		PixelsPerStud = 16,
	})
	-- speaker stacks either side of the screens, every box aimed at the field
	for _, u in ipairs({ -46.9, 46.9 }) do
		local z = B.zc + s * u
		for k = 0, 3 do
			local centre = Vector3.new(s * (B.faceX - 1.9), 117.4 + k * 8.4, z)
			local boxCFrame = CFrame.lookAt(centre, Vector3.new(0, 30 - k * 12, B.zc))
			BuildUtil.Part(ctx, {
				Name = "SpeakerBox",
				Size = Vector3.new(7, 8, 3.2),
				CFrame = boxCFrame,
				Color = SPEAKER_GREY,
				Material = Enum.Material.Fabric,
				CanCollide = false,
			})
			BuildUtil.Part(ctx, {
				Name = "SpeakerCone",
				Shape = Enum.PartType.Cylinder,
				Size = Vector3.new(0.3, 5, 5),
				CFrame = boxCFrame * CFrame.new(0, 0, -1.65) * CFrame.Angles(0, math.pi / 2, 0),
				Color = CONE_GREY,
				Material = Enum.Material.SmoothPlastic,
				CanCollide = false,
			})
		end
	end
	-- the amp rack on the screen deck
	local amps = span(ctx, "AmpRack", x1 + 0.3, x1 + 2.1, deckY, deckY + 5.2, B.zc + 22, B.zc + 26, DESK_DARK, Enum.Material.Metal)
	span(ctx, "AmpLights", x1 + 2.1, x1 + 2.2, deckY + 1, deckY + 4.6, B.zc + 22.4, B.zc + 25.6, LED_CYAN, Enum.Material.Neon, GLOW)
	BuildUtil.Look(
		amps,
		"Speaker Amps",
		"These amplifiers power the speaker stacks on the jumbotron. When your team scores, the whole stadium shakes!",
		{ Distance = 8 }
	)

	-- The control room's gear: a monitor wall on the field-side wall (live screens), the desk
	-- with the video switcher, the director's chair, a replay server and the crew fridge
	local monitorX = rx1 - 0.3
	span(ctx, "MonitorWall", monitorX, rx1, 2.6, 8.8, rz0 + 0.6, rz1 - 0.6, FACE_DARK)
	local function monitorScreen(screenName, live, placeholder, y0, y1, za, zb, color)
		return screen(
			ctx,
			screenName,
			Vector3.new(0.2, y1 - y0, zb - za),
			Vector3.new(monitorX - 0.1, (y0 + y1) / 2, (za + zb) / 2),
			Enum.NormalId.Left,
			placeholder,
			{ LabelName = screenName .. "Text", Live = live, TextColor3 = color, Font = Enum.Font.GothamBold, PixelsPerStud = 40 }
		)
	end
	local mainMonitor = monitorScreen("MonitorMain", "summary", "HOME 0 - AWAY 0", 3.6, 8.4, midZ - 2.8, midZ + 2.8, LED_WHITE)
	monitorScreen("MonitorScore", "score", "HOME 0 - AWAY 0", 5.8, 8.4, rz0 + 0.8, midZ - 3.4, LED_AMBER)
	monitorScreen("MonitorSeason", "season", "SEASON 1", 3, 5.4, rz0 + 0.8, midZ - 3.4, LED_CYAN)
	monitorScreen("MonitorGameDay", "gameday", "NEXT GAME SOON", 5.8, 8.4, midZ + 3.4, rz1 - 0.8, LED_GREEN)
	monitorScreen("MonitorRecord", "record", "RECORD 0-0", 3, 5.4, midZ + 3.4, rz1 - 0.8, LED_WHITE)
	BuildUtil.Light(
		mainMonitor,
		"SurfaceLight",
		{ Name = "MonitorGlow", Face = Enum.NormalId.Left, Range = 10, Brightness = 0.6, Color = LED_CYAN }
	)
	local onAir = span(ctx, "OnAirLight", monitorX - 0.3, rx1, 9, 9.7, midZ - 1.6, midZ + 1.6, ON_AIR_RED, Enum.Material.Neon, GLOW)
	BuildUtil.SurfaceText(
		onAir,
		Enum.NormalId.Left,
		"ON AIR",
		{ LabelName = "OnAirText", TextColor3 = LED_WHITE, LightInfluence = 0, PixelsPerStud = 30 }
	)

	local deskX0, deskX1 = rx1 - 3.4, rx1 - 1
	span(ctx, "ControlDesk", deskX0, deskX1, 0.2, 3.2, rz0 + 2, rz1 - 4, DESK_DARK) -- (clear of the open door leaf)
	local switcher = span(ctx, "VideoSwitcher", deskX0 + 0.3, deskX1 - 0.3, 3.2, 3.5, midZ - 3, midZ + 3, SCREEN_BLACK)
	span(ctx, "SwitcherButtons", deskX0 + 0.6, deskX0 + 0.9, 3.5, 3.6, midZ - 2.5, midZ + 2.5, LED_RED, Enum.Material.Neon, GLOW)
	span(ctx, "SwitcherButtons", deskX0 + 1.2, deskX0 + 1.5, 3.5, 3.6, midZ - 2.5, midZ + 2.5, LED_GREEN, Enum.Material.Neon, GLOW)
	BuildUtil.Look(
		switcher,
		"Video Switcher",
		"Push a button and the jumbotron cuts to another camera: replay, crowd cam or the dance cam!",
		-- (just above the buttons, so the prompt is in plain sight and hides behind the tower walls)
		{ At = atPoint(ctx, switcher, Vector3.new((deskX0 + deskX1) / 2, 3.9, midZ + 2.4)), Distance = 7 }
	)
	local chairX = deskX0 - 2.2
	BuildUtil.Seat(ctx, {
		Name = "DirectorChair",
		CFrame = CFrame.lookAt(Vector3.new(chairX, 1.6, midZ - 1), Vector3.new(chairX + 5, 1.6, midZ - 1)),
		Size = Vector3.new(2, 1, 2),
		Color = team.Primary,
		Object = "Director's Chair",
		Camera = { From = Vector3.new(0, 175, -80), To = Vector3.new(0, 0, 40), Fov = 60, Label = "SKYCAM" },
	})
	post(ctx, "ChairBase", chairX, midZ - 1, 0.2, 1.1, 0.6, STEEL, Enum.Material.Metal, NO_COLLIDE)
	span(ctx, "ChairBack", chairX - 1.2, chairX - 0.9, 2.1, 4.4, midZ - 2, midZ, team.Primary, nil, NO_COLLIDE)

	local rack = span(ctx, "ReplayServer", rx0 + 0.2, rx0 + 2, 0.2, 6.2, rz0 + 0.2, rz0 + 2.2, DESK_DARK)
	span(ctx, "ServerLights", rx0 + 2, rx0 + 2.1, 1, 5.6, rz0 + 0.6, rz0 + 0.9, LED_GREEN, Enum.Material.Neon, GLOW)
	BuildUtil.Look(
		rack,
		"Replay Server",
		"Every big play is saved in here, ready for an instant replay on the big screen.",
		{ Distance = 7 }
	)
	local fridge = span(ctx, "CrewFridge", rx0 + 0.2, rx0 + 1.8, 0.2, 3.4, midZ + 2, midZ + 3.6, FRIDGE_WHITE)
	span(ctx, "FridgeHandle", rx0 + 1.8, rx0 + 1.95, 1.6, 3, midZ + 3.2, midZ + 3.4, STEEL, Enum.Material.Metal, NO_COLLIDE)
	BuildUtil.Use(ctx, fridge, "soda", { Object = "Crew Fridge", Distance = 7 })
end

---------------------------------------------------------------------------------------------
-- Stadium canopy: a ring roof over the upper deck, open over the field, notched at the ends
---------------------------------------------------------------------------------------------
local K = math.sqrt(2) - 1 -- how much each half of a segment grows per stud of offset
local TOWARD_FIELD = Enum.NormalId.Back
local AWAY_FROM_FIELD = Enum.NormalId.Front
local TURN = CFrame.Angles(0, math.pi, 0) -- turns a segment-space CFrame round to face the field

local ROOF = {
	inner = 70, -- the inner edge (over the club seats, 10 in front of the upper deck)
	seam = 112, -- glass (inner) / metal (outer) seam
	outer = 167, -- outer edge of the deck (inside face of the outer fascia)
	deckBottom = 116,
	deckTop = 117,
	mast = 169.5, -- masts stand just outside the facade (offset 160): 168..171
	mastDiameter = 3,
	mastTop = 135,
	girderBottom = 116.3, -- (inside the deck)
	girderTop = 128.6,
	notch = 70, -- the end roofs stop at |along| = 70 (z -40 / 100): the boards + their supports stand in between
	walkIn = 72, -- the lighting catwalk (offsets 72..76.8, 4.2 clear between its guards; floor top y 110)
	walkOut = 76.8,
	walkY = 110,
}

-- girder / mast positions (along each segment) and the masts' offset. Exterior.lua lays out the
-- Gate A / D plazas around the sideline masts at +-30 (tent at 36..48, flags at -40 / -52), the
-- corner masts stand outside its corner ramps (offsets 162..179) and the end masts beside the
-- video boards' notches.
local SIDE_GIRDERS = { -150, -90, -30, 30, 90, 150 }
local END_GIRDERS = { -82, 82 }
local CORNER_MAST = 183.5
local GIRDERS = {
	{ "visitor", SIDE_GIRDERS },
	{ "corner_ve", { 0 }, CORNER_MAST },
	{ "east", END_GIRDERS },
	{ "corner_he", { 0 }, CORNER_MAST },
	{ "home", SIDE_GIRDERS },
	{ "corner_hw", { 0 }, CORNER_MAST },
	{ "west", END_GIRDERS },
	{ "corner_vw", { 0 }, CORNER_MAST },
}

local function roofSegment(L, name)
	local seg = Bowl.Segment(L, name, 0, 0)
	return { name = name, kind = seg.kind, base = seg.cframe }
end

-- Half-length of a segment at offset o (the corner lines meet there).
local function halfLength(L, seg, o)
	if seg.kind == "side" then
		return L.SurfaceHalfX + K * o
	elseif seg.kind == "end" then
		return (L.SurfaceMaxZ - L.SurfaceMinZ) / 2 + K * o
	end
	return K * o
end

-- Segment space -> plot CFrame
local function at(seg, x, y, o)
	return seg.base * CFrame.new(x, y, -o)
end

-- A block in segment space: x0..x1 along, y0..y1 up, o0..o1 outward.
local function segBlock(ctx, seg, name, x0, x1, y0, y1, o0, o1, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Size = Vector3.new(math.abs(x1 - x0), y1 - y0, math.abs(o1 - o0))
	props.CFrame = at(seg, (x0 + x1) / 2, (y0 + y1) / 2, (o0 + o1) / 2)
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Part(ctx, props)
end

-- The triangle that completes a band (o0..o1) at the corner line on the `sign` end: a flat wedge
-- with its right angle at (sign * halfLength(o0), o1).
local function mitreWedge(ctx, L, seg, name, sign, o0, o1, y0, y1, color, material, extra)
	local depth = o1 - o0
	local run = K * depth
	local h0 = halfLength(L, seg, o0)
	local centre = at(seg, sign * (h0 + run / 2), (y0 + y1) / 2, (o0 + o1) / 2).Position
	local along = seg.base:VectorToWorldSpace(Vector3.new(sign, 0, 0))
	local outward = seg.base:VectorToWorldSpace(Vector3.new(0, 0, -1))
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Size = Vector3.new(y1 - y0, run, depth)
	props.CFrame = CFrame.fromMatrix(centre, along:Cross(outward), along, outward)
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Wedge(ctx, props)
end

-- A horizontal band of one roof piece between offsets o0..o1: a block from the piece's start to
-- its end plus a wedge at every end that follows a corner line ("mitre").
local function roofBand(ctx, L, piece, name, o0, o1, y0, y1, color, material, extra)
	local seg = piece.seg
	local h0 = halfLength(L, seg, o0)
	local xa = piece.from == "mitre" and -h0 or piece.from
	local xb = piece.to == "mitre" and h0 or piece.to
	local main = segBlock(ctx, seg, name, xa, xb, y0, y1, o0, o1, color, material, extra)
	if piece.from == "mitre" then
		mitreWedge(ctx, L, seg, name, -1, o0, o1, y0, y1, color, material, extra)
	end
	if piece.to == "mitre" then
		mitreWedge(ctx, L, seg, name, 1, o0, o1, y0, y1, color, material, extra)
	end
	return main
end

-- A thin band along one roof piece (fascias, ring beams), as long as the piece at offset `o`.
local function roofEdge(ctx, L, piece, name, o, o0, o1, y0, y1, color, material, extra)
	local h = halfLength(L, piece.seg, o)
	local xa = piece.from == "mitre" and -h or piece.from
	local xb = piece.to == "mitre" and h or piece.to
	return segBlock(ctx, piece.seg, name, xa, xb, y0, y1, o0, o1, color, material, extra)
end

-- The pieces of the ring: the two sides and four corners run corner line to corner line, the
-- ends are split by the notch in front of the video boards. half = which catwalk half it is on.
local function roofPieces(L)
	local function piece(name, from, to, half)
		return { seg = roofSegment(L, name), from = from, to = to, half = half }
	end
	local n = ROOF.notch
	return {
		sides = {
			piece("visitor", "mitre", "mitre", "front"),
			piece("home", "mitre", "mitre", "back"),
		},
		ends = {
			-- east: along = +Z (negative along = the visitor/front half); west: along = -Z
			piece("east", "mitre", -n, "front"),
			piece("east", n, "mitre", "back"),
			piece("west", "mitre", -n, "back"),
			piece("west", n, "mitre", "front"),
		},
		corners = {
			piece("corner_vw", "mitre", "mitre", "front"),
			piece("corner_ve", "mitre", "mitre", "front"),
			piece("corner_hw", "mitre", "mitre", "back"),
			piece("corner_he", "mitre", "mitre", "back"),
		},
	}
end

-- Height of the top of a roof girder (rooted at offset `root`) at offset o.
local function girderTopAt(o, root)
	local t = (o - ROOF.inner) / (root - ROOF.inner)
	return ROOF.girderBottom + (ROOF.girderTop - ROOF.girderBottom) * t
end

-- One mast with its girder (step 1): footing, round mast, aviation beacon, the tapered girder on
-- top of the roof line and a tie rod from the mast head to the girder. Returns the mast.
local function mastAndGirder(ctx, seg, x, C, mastO)
	local root = mastO - ROOF.mastDiameter / 2
	local foot = at(seg, x, 0, mastO)
	BuildUtil.Part(ctx, {
		Name = "MastFooting",
		Size = Vector3.new(6.5, 0.8, 6.5),
		CFrame = foot * CFrame.new(0, 0.4, 0),
		Color = C.ConcreteDark,
		Material = Enum.Material.Concrete,
	})
	local p = foot.Position
	local mast = post(ctx, "RoofMast", p.X, p.Z, 0.8, ROOF.mastTop, ROOF.mastDiameter, STEEL_PALE, Enum.Material.Metal)
	BuildUtil.Ball(ctx, {
		Name = "MastBeacon",
		Position = Vector3.new(p.X, ROOF.mastTop + 0.5, p.Z),
		Diameter = 1.2,
		Color = BEACON_RED,
		Material = Enum.Material.Neon,
		CanCollide = false,
	})
	local length = root - ROOF.inner
	local height = ROOF.girderTop - ROOF.girderBottom
	local centre = at(seg, x, ROOF.girderBottom + height / 2, (root + ROOF.inner) / 2)
	-- wedge: tall face (+Z) at the mast, the slope running down to the inner edge
	BuildUtil.Wedge(ctx, {
		Name = "RoofGirder",
		Size = Vector3.new(1.6, height, length),
		CFrame = centre * CFrame.fromMatrix(Vector3.new(), Vector3.new(-1, 0, 0), Vector3.new(0, 1, 0), Vector3.new(0, 0, -1)),
		Color = STEEL_PALE,
		Material = Enum.Material.Metal,
	})
	local tieO = 108
	strut(ctx, "RoofTie", Vector3.new(p.X, ROOF.mastTop - 1.5, p.Z), at(seg, x, girderTopAt(tieO, root) - 0.3, tieO).Position, 0.45, STEEL)
	return mast
end

-- One run of the lighting catwalk (step 4) along a roof piece. bay = along-position of a lift
-- landing bay on the outer side (nil = none).
local function catwalkRun(ctx, L, piece, bay)
	local seg = piece.seg
	local o0, o1, y = ROOF.walkIn, ROOF.walkOut, ROOF.walkY
	local sink = seg.kind == "corner" and 0.03 or 0 -- (corner floors overlap the straight ones a bit)
	local hOut, hIn = halfLength(L, seg, o1), halfLength(L, seg, o0)
	local stop = 2 -- the runs on the ends stop 2 studs short of the notch
	local function ends(h)
		local xa = piece.from == "mitre" and -h or piece.from + stop
		local xb = piece.to == "mitre" and h or piece.to - stop
		return xa, xb
	end
	local xa, xb = ends(hOut)
	segBlock(ctx, seg, "CatwalkFloor", xa, xb, y - 0.4 - sink, y - sink, o0, o1, STEEL, Enum.Material.DiamondPlate)
	local ia, ib = ends(hIn)
	segBlock(ctx, seg, "CatwalkGuard", ia, ib, y, y + 3.4, o0, o0 + 0.3, STEEL, Enum.Material.Metal, GUARD)
	if bay then
		segBlock(ctx, seg, "CatwalkGuard", xa, bay - 6, y, y + 3.4, o1 - 0.3, o1, STEEL, Enum.Material.Metal, GUARD)
		segBlock(ctx, seg, "CatwalkGuard", bay + 6, xb, y, y + 3.4, o1 - 0.3, o1, STEEL, Enum.Material.Metal, GUARD)
	else
		segBlock(ctx, seg, "CatwalkGuard", xa, xb, y, y + 3.4, o1 - 0.3, o1, STEEL, Enum.Material.Metal, GUARD)
	end
	if piece.from ~= "mitre" then
		segBlock(ctx, seg, "CatwalkEndGuard", xa, xa + 0.3, y, y + 3.4, o0 + 0.3, o1 - 0.3, STEEL, Enum.Material.Metal, GUARD)
	end
	if piece.to ~= "mitre" then
		segBlock(ctx, seg, "CatwalkEndGuard", xb - 0.3, xb, y, y + 3.4, o0 + 0.3, o1 - 0.3, STEEL, Enum.Material.Metal, GUARD)
	end
	-- a hanger from the roof down to the outer guard (clear of the bay)
	local hx = bay and (xa + bay - 6) / 2 or (xa + xb) / 2
	local p = at(seg, hx, 0, o1 - 0.15).Position
	post(ctx, "CatwalkHanger", p.X, p.Z, y + 3.4, ROOF.deckBottom, 0.35, STEEL, Enum.Material.Metal, NO_COLLIDE)
end

-- A light bar hanging under the inner fascia, tilted down toward the field (step 4). From up here
-- its light (Range 60) reaches the upper deck; the light towers' field lights light the turf.
local function lightBar(ctx, seg, x, length)
	local cframe = at(seg, x, 111.6, ROOF.inner + 0.8) * TURN * CFrame.Angles(math.rad(-40), 0, 0)
	local panel = BuildUtil.Part(ctx, {
		Name = "FloodPanel",
		Size = Vector3.new(length, 1.4, 0.5),
		CFrame = cframe,
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
	return panel
end

-- The Roof Tour lift at a mast (step 4): a glass cabin at its foot, a glass shaft up the mast, a
-- sign and the call panel; plus the landing bay on the catwalk with its own lift panel and a
-- ROOF CAM seat. mastX = the mast's along-position, bay = the bay's along-position.
local function roofLift(ctx, seg, mastX, bay, label)
	local team = ctx.colors
	local C = ctx.config.Colors
	local y = ROOF.walkY
	-- ground station (outside the mast)
	segBlock(ctx, seg, "RoofLiftShaft", mastX - 1.6, mastX + 1.6, 9, ROOF.deckBottom, 171.2, 174.4, C.Glass, Enum.Material.Glass, {
		Transparency = 0.6,
		CanCollide = false,
	})
	segBlock(ctx, seg, "RoofLiftCabin", mastX - 2.6, mastX + 2.6, 0, 9, 171.2, 176.4, C.Glass, Enum.Material.Glass, {
		Transparency = 0.45,
		CanCollide = false,
	})
	local sign = segBlock(ctx, seg, "RoofLiftSign", mastX - 2.6, mastX + 2.6, 9, 10.8, 176.4, 176.6, team.Secondary, nil, NO_COLLIDE)
	BuildUtil.SurfaceText(sign, AWAY_FROM_FIELD, "ROOF TOUR", {
		LabelName = "RoofLiftSignText",
		TextColor3 = readable(team.Secondary, team.Primary),
		PixelsPerStud = 20,
	})
	local call = segBlock(ctx, seg, "RoofLiftCall", mastX + 3.2, mastX + 4.4, 0, 4.4, 176.4, 177, CABINET_GREY, Enum.Material.Metal)
	BuildUtil.Elevator(
		ctx,
		call,
		at(seg, bay + 3, y, 78.5) * TURN,
		{ Action = "Ride the Roof Tour lift", Object = "Roof Tour", Label = label, At = Vector3.new(0, 0, -0.5) }
	)
	-- the landing bay on the outer side of the catwalk (offsets 76..82)
	segBlock(ctx, seg, "CatwalkBay", bay - 6, bay + 6, y - 0.4, y, ROOF.walkOut, 82, STEEL, Enum.Material.DiamondPlate)
	segBlock(ctx, seg, "CatwalkGuard", bay - 6, bay + 6, y, y + 3.4, 81.7, 82, STEEL, Enum.Material.Metal, GUARD)
	segBlock(ctx, seg, "CatwalkGuard", bay - 6, bay - 5.7, y, y + 3.4, ROOF.walkOut, 81.7, STEEL, Enum.Material.Metal, GUARD)
	segBlock(ctx, seg, "CatwalkGuard", bay + 5.7, bay + 6, y, y + 3.4, ROOF.walkOut, 81.7, STEEL, Enum.Material.Metal, GUARD)
	local panel = segBlock(ctx, seg, "RoofLiftPanel", bay + 2.4, bay + 3.6, y, y + 4.2, 81.3, 81.7, CABINET_GREY, Enum.Material.Metal)
	BuildUtil.Elevator(
		ctx,
		panel,
		at(seg, mastX + 8, 0, 178) * TURN,
		{ Action = "Ride down", Object = "Roof Tour", Label = "STADIUM GROUND", At = Vector3.new(0, -0.6, 0.6) }
	)
	local eye = at(seg, bay, 106, 66).Position
	BuildUtil.Seat(ctx, {
		Name = "RoofCamSeat",
		CFrame = at(seg, bay - 2.5, y + 0.6, 79.5) * TURN,
		Size = Vector3.new(2, 1.2, 2),
		Color = team.Primary,
		Object = "Roof Catwalk Seat",
		Camera = { From = eye, To = Vector3.new(0, 0, 30), Fov = 60, Label = "ROOF CAM" },
	})
end

function M.canopy(ctx)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local team = ctx.colors
	local cheer = teamText(ctx, "TEAM")
	local hasName = teamText(ctx, "") ~= ""
	local stadiumName = hasName and (cheer .. " STADIUM") or "WELCOME FANS"
	local homeOf = hasName and ("HOME OF THE " .. cheer) or "HOME SWEET HOME"
	local textColor = readable(team.Primary, team.Trim)
	local pieces = roofPieces(L)
	local all = {}
	for _, group in ipairs({ pieces.sides, pieces.ends, pieces.corners }) do
		for _, piece in ipairs(group) do
			table.insert(all, piece)
		end
	end
	local glassExtra = { Transparency = 0.45 }

	-------------------------------------------------------------------------- 1 Roof Supports
	BuildUtil.Stage(ctx, 1)
	local structure = BuildUtil.Child(ctx, "RoofStructure")
	local lookMast
	for _, entry in ipairs(GIRDERS) do
		local name, list = entry[1], entry[2]
		local seg = roofSegment(L, name)
		for _, x in ipairs(list) do
			local mast = mastAndGirder(structure, seg, x, C, entry[3] or ROOF.mast)
			if name == "visitor" and x == -30 then
				lookMast = mast
			end
		end
	end
	for _, piece in ipairs(all) do
		roofEdge(structure, L, piece, "OuterRingBeam", 167, 165, 167, 113, 116.4, STEEL, Enum.Material.Metal)
		roofEdge(structure, L, piece, "InnerRingBeam", 71.6, ROOF.inner, 71.6, 114.6, 116.4, STEEL, Enum.Material.Metal)
	end
	local lookSeg = roofSegment(L, "visitor")
	BuildUtil.Look(
		lookMast,
		"Roof Mast",
		"20 giant masts stand around the stadium. Each one holds a steel girder that reaches almost 100 studs out over the seats!",
		{ At = atPoint(ctx, lookMast, at(lookSeg, -30, 4, ROOF.mast - 1.7).Position) }
	)

	-------------------------------------------------------------------------- 2 Sideline Roofs
	BuildUtil.Stage(ctx, 2)
	local sideRoof = BuildUtil.Child(ctx, "SidelineRoofs")
	for _, piece in ipairs(pieces.sides) do
		roofBand(
			sideRoof,
			L,
			piece,
			"RoofGlass",
			ROOF.inner,
			ROOF.seam,
			ROOF.deckBottom + 0.1,
			ROOF.deckTop - 0.1,
			C.Glass,
			Enum.Material.Glass,
			glassExtra
		)
		roofBand(sideRoof, L, piece, "RoofPanel", ROOF.seam, ROOF.outer, ROOF.deckBottom, ROOF.deckTop, ROOF_WHITE, Enum.Material.Metal)
		local inner = roofEdge(sideRoof, L, piece, "InnerFascia", ROOF.inner, ROOF.inner - 0.6, ROOF.inner, 112.5, 117.6, team.Primary)
		local outer = roofEdge(sideRoof, L, piece, "OuterFascia", 167.6, ROOF.outer, 167.6, 112.5, 119.5, team.Primary)
		roofEdge(
			sideRoof,
			L,
			piece,
			"RoofStripe",
			ROOF.seam,
			ROOF.seam - 1,
			ROOF.seam + 1,
			ROOF.deckTop,
			ROOF.deckTop + 0.15,
			team.Secondary,
			nil,
			GLOW
		)
		if piece.seg.name == "visitor" then
			labels(inner, TOWARD_FIELD, {
				{ text = "GO " .. cheer .. "!", from = 0.05, to = 0.27, top = 0.12, bottom = 0.88 },
				{ text = stadiumName, from = 0.37, to = 0.63, top = 0.12, bottom = 0.88 },
				{ text = "DE-FENSE!", from = 0.73, to = 0.95, top = 0.12, bottom = 0.88 },
			}, textColor, 8)
			labels(outer, AWAY_FROM_FIELD, { { text = stadiumName, from = 0.3, to = 0.7, top = 0.1, bottom = 0.9 } }, textColor, 8)
		else
			labels(inner, TOWARD_FIELD, {
				{ text = "MAKE SOME NOISE!", from = 0.05, to = 0.27, top = 0.12, bottom = 0.88 },
				{ text = cheer, from = 0.4, to = 0.6, top = 0.1, bottom = 0.9, live = "team" },
				{ text = "LET'S GO " .. cheer .. "!", from = 0.73, to = 0.95, top = 0.12, bottom = 0.88 },
			}, textColor, 8)
			labels(outer, AWAY_FROM_FIELD, { { text = homeOf, from = 0.3, to = 0.7, top = 0.1, bottom = 0.9 } }, textColor, 8)
		end
	end
	-- a rain downpipe down the +x side of a visitor-side mast
	local pipeSeg = roofSegment(L, "visitor")
	local pipeFoot = at(pipeSeg, 30 - ROOF.mastDiameter / 2 - 0.4, 0, ROOF.mast).Position
	local pipe = post(sideRoof, "RainDownpipe", pipeFoot.X, pipeFoot.Z, 0.8, ROOF.deckBottom, 0.7, C.Metal, Enum.Material.Metal, NO_COLLIDE)
	BuildUtil.Look(
		pipe,
		"Sideline Roof",
		"The roof over the sidelines keeps the upper deck dry. Rain runs off into the gutter and down this pipe - any footballs kicked up there stay up there!",
		{ At = atPoint(ctx, pipe, Vector3.new(pipeFoot.X, 4, pipeFoot.Z)) }
	)

	-------------------------------------------------------------------------- 3 End Roofs
	BuildUtil.Stage(ctx, 3)
	local endRoof = BuildUtil.Child(ctx, "EndRoofs")
	local endWords = { "TOUCHDOWN!", cheer .. "!", "LET'S GO!", "MAKE SOME NOISE!" }
	for index, piece in ipairs(pieces.ends) do
		roofBand(
			endRoof,
			L,
			piece,
			"RoofGlass",
			ROOF.inner,
			ROOF.seam,
			ROOF.deckBottom + 0.1,
			ROOF.deckTop - 0.1,
			C.Glass,
			Enum.Material.Glass,
			glassExtra
		)
		roofBand(endRoof, L, piece, "RoofPanel", ROOF.seam, ROOF.outer, ROOF.deckBottom, ROOF.deckTop, ROOF_WHITE, Enum.Material.Metal)
		local inner = roofEdge(endRoof, L, piece, "InnerFascia", ROOF.inner, ROOF.inner - 0.6, ROOF.inner, 112.5, 117.6, team.Primary)
		labels(inner, TOWARD_FIELD, { { text = endWords[index], from = 0.06, to = 0.94, top = 0.12, bottom = 0.88 } }, textColor, 8)
		roofEdge(endRoof, L, piece, "OuterFascia", 167.6, ROOF.outer, 167.6, 112.5, 119.5, team.Primary)
		roofEdge(
			endRoof,
			L,
			piece,
			"RoofStripe",
			ROOF.seam,
			ROOF.seam - 1,
			ROOF.seam + 1,
			ROOF.deckTop,
			ROOF.deckTop + 0.15,
			team.Secondary,
			nil,
			GLOW
		)
		-- a band along the notch edge (0.2 proud of the deck's end so the faces never z-fight)
		local nx = piece.from == "mitre" and piece.to or piece.from
		local dir = piece.from == "mitre" and 1 or -1 -- toward the notch
		segBlock(endRoof, piece.seg, "NotchBand", nx - dir * 0.4, nx + dir * 0.2, 112.5, 117.6, ROOF.inner - 0.6, 167.6, team.Primary)
	end
	for _, piece in ipairs(pieces.corners) do
		roofBand(
			endRoof,
			L,
			piece,
			"RoofGlass",
			ROOF.inner,
			ROOF.seam,
			ROOF.deckBottom + 0.1,
			ROOF.deckTop - 0.1,
			C.Glass,
			Enum.Material.Glass,
			glassExtra
		)
		roofBand(endRoof, L, piece, "RoofPanel", ROOF.seam, ROOF.outer, ROOF.deckBottom, ROOF.deckTop, ROOF_WHITE, Enum.Material.Metal)
		roofEdge(endRoof, L, piece, "InnerFascia", ROOF.inner, ROOF.inner - 0.6, ROOF.inner, 112.5, 117.6, team.Primary)
		roofEdge(endRoof, L, piece, "OuterFascia", 167.6, ROOF.outer, 167.6, 112.5, 119.5, team.Primary)
		roofEdge(
			endRoof,
			L,
			piece,
			"RoofStripe",
			ROOF.seam,
			ROOF.seam - 1,
			ROOF.seam + 1,
			ROOF.deckTop,
			ROOF.deckTop + 0.15,
			team.Secondary,
			nil,
			GLOW
		)
	end
	-- a downpipe down an east-end mast
	local eastSeg = roofSegment(L, "east")
	local endFoot = at(eastSeg, -82 - ROOF.mastDiameter / 2 - 0.4, 0, ROOF.mast).Position
	local endPipe = post(endRoof, "RainDownpipe", endFoot.X, endFoot.Z, 0.8, ROOF.deckBottom, 0.7, C.Metal, Enum.Material.Metal, NO_COLLIDE)
	BuildUtil.Look(
		endPipe,
		"End Roof",
		"The end roofs stop right beside the video boards, so every fan in the stadium can still see the big screens.",
		{ At = atPoint(ctx, endPipe, Vector3.new(endFoot.X, 4, endFoot.Z)) }
	)

	-------------------------------------------------------------------------- 4 Roof Lights
	BuildUtil.Stage(ctx, 4)
	local lightsCtx = BuildUtil.Child(ctx, "RoofLights")
	local barCount = 0
	local lookBar
	for _, piece in ipairs(pieces.sides) do
		for _, x in ipairs({ -120, -60, 0, 60, 120 }) do
			local bar = lightBar(lightsCtx, piece.seg, x, 24)
			barCount += 1
			if piece.seg.name == "visitor" and x == -60 then
				lookBar = bar
			end
		end
	end
	for _, piece in ipairs(pieces.ends) do
		local x = piece.from == "mitre" and -82 or 82
		lightBar(lightsCtx, piece.seg, x, 18)
		barCount += 1
	end
	for _, piece in ipairs(pieces.corners) do
		lightBar(lightsCtx, piece.seg, 0, 24)
		barCount += 1
	end
	BuildUtil.Look(
		lookBar,
		"Roof Lights",
		("%d light bars hang under the edge of the roof. At night they switch on with the light towers and the whole field glows!"):format(
			barCount
		),
		{ Distance = 9 }
	)

	-- the lighting catwalk: two halves (front + back), split by the video boards' notches
	local walk = BuildUtil.Child(ctx, "LightingCatwalk")
	local BAY = -60
	for _, piece in ipairs(all) do
		local hasBay = piece.seg.kind == "side"
		catwalkRun(walk, L, piece, hasBay and BAY or nil)
	end
	for _, piece in ipairs(pieces.sides) do
		roofLift(walk, piece.seg, -90, BAY, piece.half == "front" and "ROOF CATWALK - VISITOR SIDE" or "ROOF CATWALK - HOME SIDE")
	end
end

return M
