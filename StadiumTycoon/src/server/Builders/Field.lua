--[[
	Field
	The playing surface and everything painted on (or standing on) it. Every piece is bought in
	steps (see Items.lua); BuildUtil.Stage(ctx, n) marks the parts of step n.

	  turf       1 Field Base      crushed-stone base, herringbone drains, drainage gutter + grates
	             2 Grass           one solid grass surface inside the gutter (top y = 0.2)
	             3 Mowing Stripes  darker 5-yard mowing bands laid over the grass
	  yardlines  1 Sidelines & End Lines   boundary + goal lines
	             2 Yard Lines              every 5-yard line + the try marks, and the chain crew's
	                                       stakes, 10-yard chain and down marker on the visitors' sideline
	             3 Numbers & Hash Marks    yard numbers, direction arrows, 1-yard hash ticks
	  endzones   1 End Zone Paint  team paint with a pinstripe border
	             2 Team Name       the owner's name + two initial medallions per end zone
	             3 Pylons          4 orange pylons per end zone (team cap + band; the goal-line
	                               pylons hide a little TV camera)
	  goalposts  1 Posts & Padding        footing, padded base post (rubber collar, the team's
	                                      initial on the pad), gooseneck
	             2 Crossbars & Uprights   crossbar + uprights
	             3 Wind Ribbons           wavy ribbons on top of the uprights
	  midfield   1 Logo Ring   a two-colour ring around the 50 (the field shows through it)
	             2 Team Logo   logo disk, the owner's name, a football and FOOTBALL CLUB
	  benches    1 Sideline Mats            rubber mats with team borders, a TEAM AREA stencil and
	                                        the coaching-box line
	             2 Benches                  team benches with an end panel, helmets and towels
	             3 Coolers & Medical Tent   drinks table (sponsor skirt, cooler taps), misting fan,
	                                        medical tent, heaters, kicking net, gear, the tablet cart
	                                        and an exercise bike
	             4 Sideline Boards          team boards behind the benches, framed by posts

	Interactions (BuildUtil.Look / Seat / Use): a drain grate (turf 1), the home sideline
	(yardlines 1), the down marker (yardlines 2), a pylon per end zone (endzones 3), both goal
	posts (the east one explains the field goal game), the midfield logo (LookKey "team"), three
	seat cushions per bench (the west middle one is the SIDELINE CAM seat), the sports drink cooler
	(use), the misting fan, the kicking net, the medical tent, the sideline tablets (LookKey
	"roster:QB"), the exercise bike (a seat; its console explains it) and the home sideline board
	(LookKey "record").

	Layers (tops, y). The plot slab top is 0; paint bottoms sit on the grass top 0.2. Overlapping
	flat layers are at least 0.04 apart so they never z-fight, even far away:
	  base 0.1 (drains 0.14 / 0.18, grates 0.12, basins 0.17) | grass 0.2 | stripes 0.24 |
	  bench mats 0.28 (edges 0.32) | end zones 0.29 | end zone border + medallion ring 0.33 |
	  lines 0.33 | medallion 0.37 | number + hash carriers 0.37 | end zone name carriers 0.41 |
	  midfield: disk 0.38, name carriers 0.43, bars + football 0.42, laces 0.46, ring 0.40 .. 0.46
	  (the kick game's LONG spot pad, y 0.32 .. 0.52, lies on the logo and stays on top of it)
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)

local Field = {}

local TURF_TOP = 0.2
local BASE_TOP = 0.1
local STRIPE_TOP = 0.24
local ENDZONE_TOP = 0.29
local LINE_TOP = 0.33
local BORDER_TOP = 0.33 -- end zone pinstripe + medallion ring
local MEDALLION_TOP = 0.37
local CARRIER_Y = 0.36 -- centre of the yard number / hash carriers (top 0.37)
local ZONE_NAME_Y = 0.4 -- centre of the end zone name carriers (top 0.41)
local GUTTER = 1 -- drainage channel between the grass and the stands
local STRIPE_WIDTH = 10 -- mowing stripes line up with the 5-yard lines

local LINE_WIDTH = 0.6
local GOAL_LINE_WIDTH = 1 -- goal lines are twice as bold as yard lines (8" vs 4")
local BOUNDARY_WIDTH = 1 -- sidelines and end lines are a little bolder than the yard lines
local LINE_THICKNESS = LINE_TOP - TURF_TOP
local ENDZONE_THICKNESS = ENDZONE_TOP - TURF_TOP

local NUMBER_INSET = 12 -- distance from a sideline to the centre of its row of yard numbers
local NUMBER_HEIGHT = 6 -- studs, along Z
local NUMBER_PPS = 16
local NUMBER_TEXT_SIZE = 80 -- pixels (TextSize is capped at 100) -> 5 studs
local DIGIT_WIDTH = 3.2
local DIGIT_GAP = 1.2 -- the yard line runs through this gap, like a real field
local ARROW_LENGTH = 1.8
local ARROW_HALF_WIDTH = 0.8

local HASH_LENGTH = 1.4 -- 2 ft, along Z
local HASH_WIDTH = 0.4
local HASH_PPS = 10
local HASH_INNER = 6.2 -- inbound hash marks: inner ends 18'6" apart (half of that from the centre)
local HASH_SIDELINE_GAP = 0.2 -- sideline ticks start this far inside the sideline

local CROSSBAR_HEIGHT = 7 -- 10 ft
local UPRIGHT_HALF_GAP = 6.2 -- 18'6" between the uprights
local UPRIGHT_HEIGHT = 22 -- above the crossbar
local POST_SETBACK = 5.5 -- base post sits this far behind the uprights
local PAD_HEIGHT = 4

local PAINT = { CanCollide = false, CastShadow = false }
local UP = Vector3.new(0, 1, 0)

-- TV view of the west bench's camera seat: a sideline camera on the field pointed back at the
-- bench, so whoever sits there sees themselves on TV
local SIDELINE_CAM_FROM = Vector3.new(-6, 9, 58)
local SIDELINE_CAM_TO = Vector3.new(-31, 3.5, 88)

local BASE_DIRT = Color3.fromRGB(126, 102, 78)
local DRAIN_GRAVEL = Color3.fromRGB(178, 172, 160)
local GRATE_GREY = Color3.fromRGB(72, 74, 80)
local BASIN_GREY = Color3.fromRGB(44, 46, 52)
local CONCRETE_FOOTING = Color3.fromRGB(128, 128, 134)
local PYLON_ORANGE = Color3.fromRGB(255, 112, 20)
local RIBBON_RED = Color3.fromRGB(240, 70, 30)
local COOLER_ORANGE = Color3.fromRGB(247, 128, 10)
local WHITE = Color3.fromRGB(245, 245, 245)
local MEDICAL_BLUE = Color3.fromRGB(36, 92, 196)
local MEDICAL_RED = Color3.fromRGB(215, 30, 40)
local MAT_GREY = Color3.fromRGB(58, 60, 66)
local HEATER_GREY = Color3.fromRGB(44, 45, 50)
local HEATER_GLOW = Color3.fromRGB(255, 120, 30)
local COACH_YELLOW = Color3.fromRGB(255, 214, 40)
local FOOTBALL_BROWN = Color3.fromRGB(122, 64, 30)
local NET_WHITE = Color3.fromRGB(235, 235, 235)
local BAG_GREY = Color3.fromRGB(40, 42, 48)
local FACEMASK_GREY = Color3.fromRGB(70, 72, 78)
local CHAIN_GREY = Color3.fromRGB(96, 98, 104)
local INK_BLACK = Color3.fromRGB(20, 20, 24)
local SCREEN_DARK = Color3.fromRGB(16, 18, 22)
local LED_AMBER = Color3.fromRGB(255, 196, 40)
local LED_CYAN = Color3.fromRGB(90, 220, 255)
local TENT_FLAP = Color3.fromRGB(24, 64, 150)

---------------------------------------------------------------------------------------------
-- Helpers
---------------------------------------------------------------------------------------------

-- Flat paint strip lying on the turf (bottom at TURF_TOP).
local function paint(ctx, name, sizeX, sizeZ, x, z, thickness, color, material)
	return BuildUtil.Box(
		ctx,
		name,
		Vector3.new(sizeX, thickness, sizeZ),
		Vector3.new(x, TURF_TOP + thickness / 2, z),
		color,
		material or Enum.Material.SmoothPlastic,
		PAINT
	)
end

-- Flat disk lying on the turf from TURF_TOP up to `top`.
local function disk(ctx, name, x, z, diameter, top, color, material)
	return BuildUtil.Cylinder(ctx, {
		Name = name,
		Axis = "Y",
		Position = Vector3.new(x, (TURF_TOP + top) / 2, z),
		Height = top - TURF_TOP,
		Diameter = diameter,
		Color = color,
		Material = material or Enum.Material.SmoothPlastic,
		CanCollide = false,
		CastShadow = false,
	})
end

-- Invisible flat part that only carries a SurfaceGui on its Top face.
local function carrier(ctx, name, size, cframe)
	return BuildUtil.Part(ctx, {
		Name = name,
		Size = size,
		CFrame = cframe,
		Transparency = 1,
		CanCollide = false,
		CastShadow = false,
	})
end

-- Box of the given size from point a to point b (its length runs along a -> b).
local function strut(ctx, name, a, b, width, depth, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Size = Vector3.new(width, depth, (b - a).Magnitude)
	props.CFrame = CFrame.lookAt((a + b) / 2, b)
	props.Color = color
	props.Material = material
	return BuildUtil.Part(ctx, props)
end

-- Relative luminance / contrast ratio (WCAG) so text stays readable for every team palette.
local function luminance(color)
	local function channel(v)
		if v <= 0.03928 then
			return v / 12.92
		end
		return ((v + 0.055) / 1.055) ^ 2.4
	end
	return 0.2126 * channel(color.R) + 0.7152 * channel(color.G) + 0.0722 * channel(color.B)
end

local function contrast(a, b)
	local la, lb = luminance(a), luminance(b)
	if la < lb then
		la, lb = lb, la
	end
	return (la + 0.05) / (lb + 0.05)
end

-- Returns (textColor, outlineColor) from the team palette for text on `background`:
-- the most readable team colour for the letters, then the best of the other two for the outline.
local function teamTextColors(background, colors)
	local candidates = { colors.Trim, colors.Secondary, colors.Primary }
	table.sort(candidates, function(a, b)
		return contrast(a, background) > contrast(b, background)
	end)
	return candidates[1], candidates[2]
end

-- Big team-coloured text on one face of a part, inset by a fraction of the face on each side.
local function teamText(part, face, text, background, colors, pixelsPerStud, insetX, insetY, labelName, outline)
	local textColor, outlineColor = teamTextColors(background, colors)
	local _, label = BuildUtil.SurfaceText(part, face, text, {
		LabelName = labelName,
		TextColor3 = textColor,
		PixelsPerStud = pixelsPerStud,
		Font = Enum.Font.GothamBlack,
	})
	label.Size = UDim2.new(1 - 2 * insetX, 0, 1 - 2 * insetY, 0)
	label.Position = UDim2.new(insetX, 0, insetY, 0)
	local stroke = Instance.new("UIStroke")
	stroke.Name = "Outline"
	stroke.Color = outlineColor
	stroke.Thickness = outline or 3
	stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Contextual
	stroke.Parent = label
	return label
end

-- The owner's name, or a generic one while the plot has no name.
local function displayName(ctx)
	if ctx.teamName and ctx.teamName ~= "" then
		return ctx.teamName
	end
	return "HOME TEAM"
end

-- Half of a flat isosceles triangle: a WedgePart lying on its side so its triangular face is on top.
-- `corner` is the right-angle corner (middle of the shape's base, y ignored), `dir` the horizontal unit
-- vector toward the tip, `side` the horizontal unit vector toward the base corner of this half.
-- The wedge spans y from TURF_TOP to TURF_TOP + thickness.
local function flatHalfTriangle(ctx, name, corner, dir, side, length, halfWidth, thickness, color)
	-- Wedge local frame: X = thickness (up), right angle at local (y = -h/2, z = +d/2),
	-- legs along local +Y and local -Z. Pick whichever assignment is right-handed.
	local axisY, axisZ, h, d
	if (side + UP:Cross(dir)).Magnitude < 1e-3 then
		axisY, axisZ, h, d = dir, -side, length, halfWidth
	else
		axisY, axisZ, h, d = side, -dir, halfWidth, length
	end
	local base = Vector3.new(corner.X, TURF_TOP + thickness / 2, corner.Z)
	local center = base + axisY * (h / 2) - axisZ * (d / 2)
	return BuildUtil.Wedge(ctx, {
		Name = name,
		Size = Vector3.new(thickness, h, d),
		CFrame = CFrame.fromMatrix(center, UP, axisY, axisZ),
		Color = color,
		Material = Enum.Material.SmoothPlastic,
		CanCollide = false,
		CastShadow = false,
	})
end

-- Cylinder from point a to point b. Both points must share the same Z (the rod lies in an XY plane).
local function rod(ctx, name, a, b, diameter, color, material)
	local delta = b - a
	return BuildUtil.Part(ctx, {
		Name = name,
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(delta.Magnitude, diameter, diameter),
		CFrame = CFrame.new((a + b) / 2) * CFrame.Angles(0, 0, math.atan2(delta.Y, delta.X)),
		Color = color,
		Material = material,
	})
end

local function newSurfaceGui(part, face, pixelsPerStud, name)
	local gui = Instance.new("SurfaceGui")
	gui.Name = name
	gui.Face = face
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = pixelsPerStud
	gui.LightInfluence = 1
	gui.Parent = part
	return gui
end

local function digitLabel(gui, text, xPixels, widthPixels, alignment, color)
	local label = Instance.new("TextLabel")
	label.Name = "Digit"
	label.BackgroundTransparency = 1
	label.BorderSizePixel = 0
	label.Position = UDim2.new(0, xPixels, 0, 0)
	label.Size = UDim2.new(0, widthPixels, 1, 0)
	label.Font = Enum.Font.GothamBlack
	label.Text = text
	label.TextColor3 = color
	label.TextSize = NUMBER_TEXT_SIZE
	label.TextXAlignment = alignment
	label.Parent = gui
	return label
end

-- A row of 1-yard hash ticks between the goal lines, drawn as GUI frames on ONE invisible carrier
-- (80 ticks for the price of one part). Ticks at the 5-yard lines are left out (the line is there).
local function hashRow(ctx, name, z, color)
	local L = ctx.config.Layout
	local length = 2 * L.GoalLineX
	local part = carrier(ctx, name, Vector3.new(length, 0.02, HASH_LENGTH), CFrame.new(0, CARRIER_Y, z))
	local gui = newSurfaceGui(part, Enum.NormalId.Top, HASH_PPS, name .. "Gui")
	local yards = math.floor(length / L.Yard + 0.5)
	local tickPixels = HASH_WIDTH * HASH_PPS
	for yard = 1, yards - 1 do
		if yard % 5 ~= 0 then
			-- Top-face GUI x runs along the part's +X
			local fraction = yard * L.Yard / length
			local tick = Instance.new("Frame")
			tick.Name = "Tick"
			tick.BorderSizePixel = 0
			tick.BackgroundColor3 = color
			tick.Position = UDim2.new(fraction, -tickPixels / 2, 0, 0)
			tick.Size = UDim2.new(0, tickPixels, 1, 0)
			tick.Parent = gui
		end
	end
	return part
end

---------------------------------------------------------------------------------------------
-- turf: base -> grass -> mowing stripes (grass top at y = 0.2)
---------------------------------------------------------------------------------------------
function Field.turf(ctx)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local halfX = L.SurfaceHalfX
	local minZ, maxZ = L.SurfaceMinZ, L.SurfaceMaxZ
	local centerZ = (minZ + maxZ) / 2
	local grassHalfX = halfX - GUTTER
	local grassMinZ, grassMaxZ = minZ + GUTTER, maxZ - GUTTER
	local grassDepth = grassMaxZ - grassMinZ
	local crownZ = L.FieldCenterZ

	-- Step 1: Field Base ---------------------------------------------------------------------
	BuildUtil.Stage(ctx, 1)
	-- the base stops 0.05 short of the stand faces so no side shares their plane
	BuildUtil.Box(
		ctx,
		"FieldBase",
		Vector3.new(2 * halfX - 0.1, BASE_TOP, (maxZ - minZ) - 0.1),
		Vector3.new(0, BASE_TOP / 2, centerZ),
		BASE_DIRT,
		Enum.Material.Ground
	)
	-- herringbone drains: a collector along the crown of the field, laterals running out to both
	-- sidelines in a chevron (they disappear under the grass in step 2)
	BuildUtil.Box(
		ctx,
		"DrainSpine",
		Vector3.new(2 * grassHalfX - 4, 0.08, 1.2),
		Vector3.new(0, BASE_TOP + 0.04, crownZ),
		DRAIN_GRAVEL,
		Enum.Material.Pebble,
		PAINT
	)
	for k = 0, 4 do
		for _, sx in ipairs({ -1, 1 }) do
			local x0 = sx * (10 + 22 * k)
			for _, edgeZ in ipairs({ grassMinZ + 1.5, grassMaxZ - 1.5 }) do
				local a = Vector3.new(x0, BASE_TOP + 0.02, crownZ)
				local b = Vector3.new(x0 + sx * 18, BASE_TOP + 0.02, edgeZ)
				strut(ctx, "DrainLateral", a, b, 0.6, 0.04, DRAIN_GRAVEL, Enum.Material.Pebble, PAINT)
			end
		end
	end
	-- drainage gutter at the foot of the stands: steel grates + catch basins
	local grateTop = 0.12
	for _, z in ipairs({ minZ + (GUTTER + 0.05) / 2, maxZ - (GUTTER + 0.05) / 2 }) do
		BuildUtil.Box(
			ctx,
			"GutterGrate",
			Vector3.new(2 * halfX - 0.1, grateTop, GUTTER - 0.05),
			Vector3.new(0, grateTop / 2, z),
			GRATE_GREY,
			Enum.Material.DiamondPlate
		)
	end
	for _, sx in ipairs({ -1, 1 }) do
		BuildUtil.Box(
			ctx,
			"GutterGrate",
			Vector3.new(GUTTER - 0.05, grateTop, grassDepth),
			Vector3.new(sx * (halfX - (GUTTER + 0.05) / 2), grateTop / 2, centerZ),
			GRATE_GREY,
			Enum.Material.DiamondPlate
		)
	end
	local basinTop = 0.17
	local basins = {
		{ x = 0, z = minZ + GUTTER / 2, alongX = true },
		{ x = -70, z = minZ + GUTTER / 2, alongX = true },
		{ x = 70, z = minZ + GUTTER / 2, alongX = true },
		{ x = 0, z = maxZ - GUTTER / 2, alongX = true },
		{ x = -70, z = maxZ - GUTTER / 2, alongX = true },
		{ x = 70, z = maxZ - GUTTER / 2, alongX = true },
		{ x = -(halfX - GUTTER / 2), z = crownZ, alongX = false },
		{ x = halfX - GUTTER / 2, z = crownZ, alongX = false },
	}
	for index, basin in ipairs(basins) do
		local size = basin.alongX and Vector3.new(4, basinTop, GUTTER - 0.2) or Vector3.new(GUTTER - 0.2, basinTop, 4)
		local part = BuildUtil.Box(ctx, "CatchBasin", size, Vector3.new(basin.x, basinTop / 2, basin.z), BASIN_GREY, Enum.Material.Metal)
		if index == 2 then
			-- (front sideline, west of every buy button)
			BuildUtil.Look(
				part,
				"Drain Grate",
				"Rain runs off the field into these grates and the drain pipes under the grass, so the turf never turns into a mud pit.",
				{ At = Vector3.new(0, 2.5, 0), Distance = 8 }
			)
		end
	end

	-- Step 2: Grass --------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 2)
	BuildUtil.Box(
		ctx,
		"Grass",
		Vector3.new(2 * grassHalfX, TURF_TOP - BASE_TOP, grassDepth),
		Vector3.new(0, (BASE_TOP + TURF_TOP) / 2, centerZ),
		C.Grass,
		Enum.Material.Grass
	)

	-- Step 3: Mowing Stripes -----------------------------------------------------------------
	-- the margin behind each end line, then 10-stud bands lined up with the 5-yard lines;
	-- every second band is mowed the other way (a darker overlay)
	BuildUtil.Stage(ctx, 3)
	local edges = { -grassHalfX }
	for x = -L.FieldHalfLength, L.FieldHalfLength, STRIPE_WIDTH do
		table.insert(edges, x)
	end
	table.insert(edges, grassHalfX)
	for i = 2, #edges - 1, 2 do
		local x0, x1 = edges[i], edges[i + 1]
		BuildUtil.Box(
			ctx,
			"MowingStripe",
			Vector3.new(x1 - x0, STRIPE_TOP - TURF_TOP, grassDepth),
			Vector3.new((x0 + x1) / 2, (TURF_TOP + STRIPE_TOP) / 2, centerZ),
			C.GrassDark,
			Enum.Material.Grass,
			PAINT
		)
	end
end

--[[
	The chain crew's gear on the visitors' sideline (opposite the press box, like the real league):
	the two stakes with the 10-yard chain between them and the down marker showing "1", on the 35
	(the video board says 1ST & 10, BALL ON 35). It stands in the strip between the sideline and
	the buy buttons (z -26..-24) and never collides, so it can't block a button or trap anyone.
]]
local CHAIN_Z = -25.4 -- the stakes (the down marker stands nearer the field)
local DOWN_Z = -24.6

local function chainCrew(ctx, L)
	local gear = BuildUtil.Child(ctx, "ChainCrew")
	local rearX = L.GoalLineX - 35 * L.Yard -- the 35-yard line (x 30)
	local frontX = rearX + 10 * L.Yard -- 10 yards on (x 50)
	local ghost = { CanCollide = false }
	for _, x in ipairs({ rearX, frontX }) do
		BuildUtil.Block(gear, "ChainStake", Vector3.new(0.25, 5.4, 0.25), Vector3.new(x, 0, CHAIN_Z), PYLON_ORANGE, nil, ghost, TURF_TOP)
		BuildUtil.Block(
			gear,
			"ChainPaddle",
			Vector3.new(1.1, 0.75, 0.12),
			Vector3.new(x, 0, CHAIN_Z),
			PYLON_ORANGE,
			Enum.Material.SmoothPlastic,
			ghost,
			TURF_TOP + 5.4
		)
	end
	-- the chain, pulled tight between the stakes at knee height
	BuildUtil.Box(
		gear,
		"Chain",
		Vector3.new(frontX - rearX, 0.12, 0.12),
		Vector3.new((rearX + frontX) / 2, TURF_TOP + 0.9, CHAIN_Z),
		CHAIN_GREY,
		Enum.Material.Metal,
		ghost
	)
	-- (the down marker's box rides higher than the stake's paddle behind it, so the "1" reads clearly)
	BuildUtil.Block(gear, "DownMarkerPole", Vector3.new(0.25, 6.4, 0.25), Vector3.new(rearX, 0, DOWN_Z), WHITE, nil, ghost, TURF_TOP)
	local box = BuildUtil.Block(
		gear,
		"DownMarker",
		Vector3.new(0.95, 0.95, 0.95),
		Vector3.new(rearX, 0, DOWN_Z),
		PYLON_ORANGE,
		Enum.Material.SmoothPlastic,
		ghost,
		TURF_TOP + 6.4
	)
	for _, face in ipairs({ Enum.NormalId.Front, Enum.NormalId.Back, Enum.NormalId.Left, Enum.NormalId.Right }) do
		BuildUtil.SurfaceText(box, face, "1", { LabelName = "DownNumber", TextColor3 = INK_BLACK, PixelsPerStud = 40 })
	end
	BuildUtil.Look(
		box,
		"Down Marker",
		"The chain crew carries this marker and the 10-yard chain along the sideline. Get the ball past the far stake for a FIRST DOWN! The number on top shows the down: 1ST & 10.",
		{ Distance = 9 }
	)
end

---------------------------------------------------------------------------------------------
-- yardlines: boundary -> 5-yard lines -> numbers, arrows and hash marks
---------------------------------------------------------------------------------------------
function Field.yardlines(ctx)
	local L = ctx.config.Layout
	local lineColor = ctx.config.Colors.Line
	local front, back = L.FieldFrontZ, L.FieldBackZ
	local width = back - front
	local centerZ = L.FieldCenterZ
	local half = L.FieldHalfLength

	-- Step 1: Sidelines & End Lines ------------------------------------------------------------
	-- the boundary sits just outside the field of play; the goal lines are twice as bold
	BuildUtil.Stage(ctx, 1)
	local outerLength = (half + BOUNDARY_WIDTH) * 2
	paint(ctx, "SidelineFront", outerLength, BOUNDARY_WIDTH, 0, front - BOUNDARY_WIDTH / 2, LINE_THICKNESS, lineColor)
	local sidelineBack = paint(ctx, "SidelineBack", outerLength, BOUNDARY_WIDTH, 0, back + BOUNDARY_WIDTH / 2, LINE_THICKNESS, lineColor)
	-- (beside the home bench area, west of it)
	BuildUtil.Look(
		sidelineBack,
		"Sideline",
		"Step on this white line with the ball and you're out of bounds! The field is 100 yards from goal line to goal line.",
		{ At = Vector3.new(-80, 2.5, 0), Distance = 8 }
	)
	paint(ctx, "EndLineWest", BOUNDARY_WIDTH, width, -(half + BOUNDARY_WIDTH / 2), centerZ, LINE_THICKNESS, lineColor)
	paint(ctx, "EndLineEast", BOUNDARY_WIDTH, width, half + BOUNDARY_WIDTH / 2, centerZ, LINE_THICKNESS, lineColor)
	for _, s in ipairs({ -1, 1 }) do
		paint(ctx, "GoalLine", GOAL_LINE_WIDTH, width, s * L.GoalLineX, centerZ, LINE_THICKNESS, lineColor)
	end

	-- Step 2: Yard Lines -----------------------------------------------------------------------
	BuildUtil.Stage(ctx, 2)
	local step = 5 * L.Yard
	for x = -L.GoalLineX + step, L.GoalLineX - step, step do
		local name = "YardLine" .. math.floor((L.GoalLineX - math.abs(x)) / L.Yard + 0.5)
		paint(ctx, name, LINE_WIDTH, width, x, centerZ, LINE_THICKNESS, lineColor)
	end
	-- try (extra point) marks on the 2-yard lines
	for _, s in ipairs({ -1, 1 }) do
		paint(ctx, "TryLine", LINE_WIDTH, L.Yard, s * (L.GoalLineX - 2 * L.Yard), centerZ, LINE_THICKNESS, lineColor)
	end
	chainCrew(ctx, L)

	-- Step 3: Numbers & Hash Marks ---------------------------------------------------------------
	BuildUtil.Stage(ctx, 3)
	-- 1-yard ticks along both sidelines and the two rows of inbound hash marks
	local tick = HASH_LENGTH / 2
	hashRow(ctx, "SidelineTicksFront", front + HASH_SIDELINE_GAP + tick, lineColor)
	hashRow(ctx, "SidelineTicksBack", back - HASH_SIDELINE_GAP - tick, lineColor)
	hashRow(ctx, "HashMarksFront", centerZ - HASH_INNER - tick, lineColor)
	hashRow(ctx, "HashMarksBack", centerZ + HASH_INNER + tick, lineColor)

	-- Yard numbers: one invisible carrier part per row, digits drawn with a SurfaceGui on its Top face.
	-- Top-face text is upright when read from the part's +Z side, so the front row is turned 180 degrees:
	-- each row then reads upright from its own sideline (tops of the numbers point to the middle of the field).
	local span = 2 * (L.GoalLineX - 5 * L.Yard) -- numbers + arrows live between the 5-yard lines
	local rows = {
		{ name = "NumbersFront", z = front + NUMBER_INSET, flip = true, topDir = 1 },
		{ name = "NumbersBack", z = back - NUMBER_INSET, flip = false, topDir = -1 },
	}
	local digitPixels = DIGIT_WIDTH * NUMBER_PPS
	local gapPixels = DIGIT_GAP / 2 * NUMBER_PPS
	for _, row in ipairs(rows) do
		local numbers = carrier(
			ctx,
			row.name,
			Vector3.new(span, 0.02, NUMBER_HEIGHT),
			CFrame.new(0, CARRIER_Y, row.z) * CFrame.Angles(0, row.flip and math.pi or 0, 0)
		)
		local gui = newSurfaceGui(numbers, Enum.NormalId.Top, NUMBER_PPS, "YardNumbersGui")

		for x = -(L.GoalLineX - 10 * L.Yard), L.GoalLineX - 10 * L.Yard, 10 * L.Yard do
			local yards = math.floor((L.GoalLineX - math.abs(x)) / L.Yard + 0.5)
			local text = tostring(yards)
			local localX = row.flip and -x or x
			local centerPixels = (localX + span / 2) * NUMBER_PPS
			digitLabel(gui, text:sub(1, 1), centerPixels - gapPixels - digitPixels, digitPixels, Enum.TextXAlignment.Right, lineColor)
			digitLabel(gui, text:sub(2, 2), centerPixels + gapPixels, digitPixels, Enum.TextXAlignment.Left, lineColor)

			-- direction arrow beside the number, pointing at the nearest goal line
			if x ~= 0 then
				local dir = Vector3.new(x < 0 and -1 or 1, 0, 0)
				local baseX = x + dir.X * (DIGIT_GAP / 2 + DIGIT_WIDTH + 0.7)
				local corner = Vector3.new(baseX, 0, row.z + row.topDir * 1.2)
				for _, sz in ipairs({ -1, 1 }) do
					flatHalfTriangle(
						ctx,
						"Arrow",
						corner,
						dir,
						Vector3.new(0, 0, sz),
						ARROW_LENGTH,
						ARROW_HALF_WIDTH,
						LINE_THICKNESS,
						lineColor
					)
				end
			end
		end
	end
end

---------------------------------------------------------------------------------------------
-- endzones: team paint -> the owner's name -> orange pylons on the corners
---------------------------------------------------------------------------------------------
function Field.endzones(ctx)
	local L = ctx.config.Layout
	local team = ctx.colors
	local front, back = L.FieldFrontZ, L.FieldBackZ
	local zc = L.FieldCenterZ
	local inner = L.GoalLineX + LINE_WIDTH / 2 -- paint starts right behind the goal line
	local outer = L.FieldHalfLength
	local depth = outer - inner
	local width = back - front
	local name = displayName(ctx)
	local initial = name:sub(1, 1)
	local BORDER_INSET, BORDER_W = 1.4, 0.6
	local MEDALLION_OFFSET = 42 -- along Z from the centre of the end zone

	for _, s in ipairs({ -1, 1 }) do
		local sideName = s < 0 and "West" or "East"
		local midX = s * (inner + outer) / 2
		-- Part X runs along the field width (Z) so text runs across the end zone; turned so the letters
		-- read upright for someone standing behind the end line (tops toward the goal line).
		local turn = CFrame.Angles(0, s * math.rad(90), 0)

		-- Step 1: End Zone Paint -------------------------------------------------------------
		BuildUtil.Stage(ctx, 1)
		BuildUtil.Part(ctx, {
			Name = "EndZone" .. sideName,
			Size = Vector3.new(width, ENDZONE_THICKNESS, depth),
			CFrame = CFrame.new(midX, TURF_TOP + ENDZONE_THICKNESS / 2, zc) * turn,
			Color = team.Primary,
			Material = Enum.Material.SmoothPlastic,
			CanCollide = false,
			CastShadow = false,
		})
		-- pinstripe border just inside the end zone (the X strips run between the Z strips)
		local x0, x1 = inner + BORDER_INSET, outer - BORDER_INSET
		local z0, z1 = front + BORDER_INSET, back - BORDER_INSET
		local borderThickness = BORDER_TOP - TURF_TOP
		for _, bx in ipairs({ x0 + BORDER_W / 2, x1 - BORDER_W / 2 }) do
			paint(ctx, "EndZoneBorder", BORDER_W, z1 - z0, s * bx, zc, borderThickness, team.Secondary)
		end
		for _, bz in ipairs({ z0 + BORDER_W / 2, z1 - BORDER_W / 2 }) do
			paint(ctx, "EndZoneBorder", x1 - x0 - 2 * BORDER_W, BORDER_W, midX, bz, borderThickness, team.Secondary)
		end

		-- Step 2: Team Name ----------------------------------------------------------------
		BuildUtil.Stage(ctx, 2)
		local nameCarrier = carrier(
			ctx,
			"EndZoneName" .. sideName,
			Vector3.new(2 * MEDALLION_OFFSET - 13, 0.02, depth - 5),
			CFrame.new(midX, ZONE_NAME_Y, zc) * turn
		)
		teamText(nameCarrier, Enum.NormalId.Top, name, team.Primary, team, 6, 0, 0.06, "EndZoneName", 4)
		-- a medallion with the team's initial on both sides of the name
		for _, side in ipairs({ -1, 1 }) do
			local mz = zc + side * MEDALLION_OFFSET
			disk(ctx, "MedallionRing", midX, mz, 10, BORDER_TOP, team.Trim)
			disk(ctx, "Medallion", midX, mz, 8.6, MEDALLION_TOP, team.Secondary)
			local letter = carrier(ctx, "MedallionLetter", Vector3.new(7, 0.02, 7), CFrame.new(midX, ZONE_NAME_Y, mz) * turn)
			teamText(letter, Enum.NormalId.Top, initial, team.Secondary, team, 10, 0.12, 0.12, "MedallionLetter", 3)
		end

		-- Step 3: Pylons --------------------------------------------------------------------
		-- where the goal line and the end line meet each sideline: team cap + base band, and the
		-- goal-line pylons carry a tiny TV camera looking along the goal line into the field
		BuildUtil.Stage(ctx, 3)
		for pi, px in ipairs({ s * L.GoalLineX, s * (outer + BOUNDARY_WIDTH / 2) }) do
			for zi, pz in ipairs({ front - 0.4, back + 0.4 }) do
				local pylon = BuildUtil.Block(
					ctx,
					"Pylon",
					Vector3.new(0.66, 1.5, 0.66),
					Vector3.new(px, 0, pz),
					PYLON_ORANGE,
					Enum.Material.SmoothPlastic,
					PAINT,
					TURF_TOP
				)
				if pi == 1 and zi == 1 then
					-- one per end zone: the goal-line pylon on the front sideline
					BuildUtil.Look(
						pylon,
						"End Zone Pylon",
						"Soft orange pylons mark the corners of the end zone. Reach the ball past one and it's a TOUCHDOWN! The goal-line pylons even hide tiny TV cameras.",
						{ At = Vector3.new(0, 1.5, 0), Distance = 8 }
					)
				end
				BuildUtil.Block(
					ctx,
					"PylonCap",
					Vector3.new(0.72, 0.16, 0.72),
					Vector3.new(px, 0, pz),
					team.Primary,
					Enum.Material.SmoothPlastic,
					PAINT,
					TURF_TOP + 1.5
				)
				BuildUtil.Block(
					ctx,
					"PylonBand",
					Vector3.new(0.7, 0.18, 0.7),
					Vector3.new(px, 0, pz),
					team.Trim,
					Enum.Material.SmoothPlastic,
					PAINT,
					TURF_TOP + 0.24
				)
				if pi == 1 then
					-- the pylon cam's lens on the side facing the field
					local inward = zi == 1 and 1 or -1
					BuildUtil.Box(
						ctx,
						"PylonCamLens",
						Vector3.new(0.28, 0.28, 0.06),
						Vector3.new(px, TURF_TOP + 1.12, pz + inward * 0.35),
						SCREEN_DARK,
						Enum.Material.Glass,
						PAINT
					)
				end
			end
		end
	end
end

---------------------------------------------------------------------------------------------
-- goalposts: single-post "slingshot" goals above both end lines
---------------------------------------------------------------------------------------------
function Field.goalposts(ctx)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local team = ctx.colors
	local zc = L.FieldCenterZ
	local postColor = C.GoalPost
	local metal = Enum.Material.Metal

	for _, s in ipairs({ -1, 1 }) do
		local goal = BuildUtil.Child(ctx, s < 0 and "WestGoalPost" or "EastGoalPost")
		local planeX = s * (L.FieldHalfLength + BOUNDARY_WIDTH / 2) -- uprights stand right above the end line
		local baseX = planeX + s * POST_SETBACK
		local padTop = TURF_TOP + PAD_HEIGHT

		-- Step 1: Posts & Padding -----------------------------------------------------------
		BuildUtil.Stage(goal, 1)
		disk(goal, "Footing", baseX, zc, 3.6, TURF_TOP + 0.08, CONCRETE_FOOTING, Enum.Material.Concrete)
		local padding = BuildUtil.Cylinder(goal, {
			Name = "Padding",
			Position = Vector3.new(baseX, TURF_TOP + PAD_HEIGHT / 2, zc),
			Height = PAD_HEIGHT,
			Diameter = 2.2,
			Color = team.Primary,
			Material = Enum.Material.Fabric,
		})
		if s > 0 then
			-- the kick game (KickGame.lua) kicks at the east goal
			BuildUtil.Look(
				padding,
				"Field Goal Posts",
				"Field goals: step on a kick spot on the field, then time your aim and power to split the uprights! The kick spots appear when the goal posts are finished.",
				{ Distance = 8 }
			)
		else
			BuildUtil.Look(
				padding,
				"Goal Post",
				"One padded post bends up to the crossbar like a slingshot, so nobody runs into two poles. Kick it between the yellow uprights for 3 points!",
				{ Distance = 8 }
			)
		end
		BuildUtil.Cylinder(goal, {
			Name = "PaddingBand",
			Position = Vector3.new(baseX, padTop - 0.6, zc),
			Height = 0.5,
			Diameter = 2.3,
			Color = team.Secondary,
			Material = Enum.Material.Fabric,
		})
		BuildUtil.Cylinder(goal, {
			Name = "PaddingBand",
			Position = Vector3.new(baseX, TURF_TOP + 0.6, zc),
			Height = 0.4,
			Diameter = 2.3,
			Color = team.Trim,
			Material = Enum.Material.Fabric,
		})
		-- a rubber collar where the post leaves the pad, and the team's initial on the pad's
		-- field side (on a see-through carrier that touches the round pad)
		BuildUtil.Cylinder(goal, {
			Name = "PaddingCap",
			Position = Vector3.new(baseX, padTop + 0.1, zc),
			Height = 0.2,
			Diameter = 1.5,
			Color = FACEMASK_GREY,
			Material = Enum.Material.SmoothPlastic,
		})
		local logoCentre = Vector3.new(baseX - s * 1.12, TURF_TOP + 2.05, zc)
		local padLogo = BuildUtil.Part(goal, {
			Name = "PadLogo",
			Size = Vector3.new(1.3, 1.7, 0.05),
			CFrame = CFrame.lookAt(logoCentre, logoCentre - Vector3.new(s, 0, 0)),
			Transparency = 1,
			CanCollide = false,
			CastShadow = false,
		})
		padLogo.CanQuery = false -- (it stands in front of the pad's Look prompt)
		padLogo.CanTouch = false
		teamText(padLogo, Enum.NormalId.Front, displayName(ctx):sub(1, 1), team.Primary, team, 40, 0.06, 0.04, "PadLogoText", 2)

		-- gooseneck: quarter circle from the top of the pad bending toward the field, then a short arm
		local radius = CROSSBAR_HEIGHT - padTop
		local bendCenter = Vector3.new(baseX - s * radius, padTop, zc)
		local points = {}
		for i = 0, 3 do
			local angle = math.rad(30 * i)
			points[i] = bendCenter + Vector3.new(s * radius * math.cos(angle), radius * math.sin(angle), 0)
		end
		for i = 1, 3 do
			rod(goal, "Gooseneck", points[i - 1], points[i], 0.9, postColor, metal)
			BuildUtil.Ball(goal, { Name = "GooseneckJoint", Position = points[i], Diameter = 0.9, Color = postColor, Material = metal })
		end
		rod(goal, "Arm", points[3], Vector3.new(planeX, CROSSBAR_HEIGHT, zc), 0.9, postColor, metal)

		-- Step 2: Crossbars & Uprights -----------------------------------------------------
		BuildUtil.Stage(goal, 2)
		BuildUtil.Cylinder(goal, {
			Name = "Crossbar",
			Axis = "Z",
			Position = Vector3.new(planeX, CROSSBAR_HEIGHT, zc),
			Height = UPRIGHT_HALF_GAP * 2 + 0.5,
			Diameter = 0.6,
			Color = postColor,
			Material = metal,
		})
		BuildUtil.Ball(goal, {
			Name = "CrossbarHub",
			Position = Vector3.new(planeX, CROSSBAR_HEIGHT, zc),
			Diameter = 1.05,
			Color = postColor,
			Material = metal,
		})
		local uprightBottom = CROSSBAR_HEIGHT - 0.3
		local uprightLength = UPRIGHT_HEIGHT + 0.3
		local topY = uprightBottom + uprightLength
		for _, side in ipairs({ -1, 1 }) do
			local uz = zc + side * UPRIGHT_HALF_GAP
			BuildUtil.Cylinder(goal, {
				Name = "Upright",
				Position = Vector3.new(planeX, uprightBottom + uprightLength / 2, uz),
				Height = uprightLength,
				Diameter = 0.45,
				Color = postColor,
				Material = metal,
			})
			BuildUtil.Ball(goal, {
				Name = "CrossbarElbow",
				Position = Vector3.new(planeX, CROSSBAR_HEIGHT, uz),
				Diameter = 0.65,
				Color = postColor,
				Material = metal,
			})
		end

		-- Step 3: Wind Ribbons -------------------------------------------------------------
		-- two segments per ribbon, fluttering toward +Z so kickers can read the wind
		BuildUtil.Stage(goal, 3)
		for _, side in ipairs({ -1, 1 }) do
			local uz = zc + side * UPRIGHT_HALF_GAP
			local p0 = Vector3.new(planeX, topY - 0.25, uz)
			local d1 = Vector3.new(0, -0.22, 1).Unit
			local d2 = Vector3.new(s * 0.3, -0.5, 1).Unit
			local p1 = p0 + d1 * 1.6
			local p2 = p1 + d2 * 1.6
			local ribbon = { Transparency = 0, CanCollide = false, CastShadow = false }
			strut(goal, "WindRibbon", p0, p1, 0.06, 0.5, RIBBON_RED, Enum.Material.Fabric, ribbon)
			strut(goal, "WindRibbon", p1, p2, 0.06, 0.42, RIBBON_RED, Enum.Material.Fabric, ribbon)
			BuildUtil.Cylinder(goal, {
				Name = "RibbonClip",
				Position = Vector3.new(planeX, topY - 0.25, uz),
				Height = 0.3,
				Diameter = 0.55,
				Color = WHITE,
				Material = Enum.Material.SmoothPlastic,
				CanCollide = false,
			})
		end
	end
end

---------------------------------------------------------------------------------------------
-- midfield: ring -> team logo at the 50 (covers the 50-yard line, like most NFL fields)
---------------------------------------------------------------------------------------------

-- A flat ring made of `segments` boxes around (0, z); alternating tops avoid z-fighting where
-- neighbouring segments overlap.
local function polygonRing(ctx, name, z, rIn, rOut, segments, topA, topB, color)
	local mid = (rIn + rOut) / 2
	local length = 2 * rOut * math.tan(math.pi / segments) + 0.02
	for i = 0, segments - 1 do
		local top = (i % 2 == 0) and topA or topB
		local h = top - TURF_TOP
		BuildUtil.Part(ctx, {
			Name = name,
			Size = Vector3.new(length, h, rOut - rIn),
			CFrame = CFrame.new(0, TURF_TOP + h / 2, z) * CFrame.Angles(0, (i + 0.5) * 2 * math.pi / segments, 0) * CFrame.new(0, 0, -mid),
			Color = color,
			Material = Enum.Material.SmoothPlastic,
			CanCollide = false,
			CastShadow = false,
		})
	end
end

function Field.midfield(ctx)
	local L = ctx.config.Layout
	local team = ctx.colors
	local zc = L.FieldCenterZ
	local RING_IN, RING_MID, RING_OUT = 11.6, 13, 14

	-- Step 1: Logo Ring ----------------------------------------------------------------------
	BuildUtil.Stage(ctx, 1)
	polygonRing(ctx, "LogoOuterRing", zc, RING_MID, RING_OUT, 28, 0.4, 0.42, team.Trim)
	polygonRing(ctx, "LogoRing", zc, RING_IN, RING_MID, 28, 0.44, 0.46, team.Secondary)

	-- Step 2: Team Logo ----------------------------------------------------------------------
	BuildUtil.Stage(ctx, 2)
	-- the disk slips under the inside edge of the ring
	local logoDisk = disk(ctx, "LogoDisk", 0, zc, 2 * (RING_IN + 0.4), 0.38, team.Primary)
	BuildUtil.Look(
		logoDisk,
		"Midfield Logo",
		"Your team's logo on the 50-yard line, the most famous spot on the field. The TV cameras show it before every kickoff!",
		{ LookKey = "team", Distance = 9 }
	)

	-- two bars framing the name
	for _, side in ipairs({ -1, 1 }) do
		paint(ctx, "LogoBar", 15, 0.7, 0, zc + side * 4.6, 0.42 - TURF_TOP, team.Secondary)
	end

	-- a football above the name (the name reads from the front sideline, so "above" is +Z)
	local ballZ = zc + 7.4
	local ballCenter = Vector3.new(0, 0, ballZ)
	local ballHalf, ballHalfWidth = 4, 1.6
	for _, dx in ipairs({ -1, 1 }) do
		for _, dz in ipairs({ -1, 1 }) do
			flatHalfTriangle(
				ctx,
				"Football",
				ballCenter,
				Vector3.new(dx, 0, 0),
				Vector3.new(0, 0, dz),
				ballHalf,
				ballHalfWidth,
				0.42 - TURF_TOP,
				FOOTBALL_BROWN
			)
		end
	end
	local laceThickness = 0.46 - TURF_TOP
	paint(ctx, "FootballLace", 2.6, 0.3, 0, ballZ, laceThickness, WHITE)
	for _, lx in ipairs({ -0.9, 0, 0.9 }) do
		paint(ctx, "FootballLace", 0.22, 1, lx, ballZ, laceThickness, WHITE)
	end
	for _, sx in ipairs({ -1, 1 }) do
		-- the white stripes near the tips (width of the diamond there, minus a little)
		local stripeX = sx * 2.7
		local stripeW = 2 * ballHalfWidth * (1 - math.abs(stripeX) / ballHalf) - 0.1
		paint(ctx, "FootballStripe", 0.3, stripeW, stripeX, ballZ, laceThickness, WHITE)
	end

	-- the owner's name + FOOTBALL CLUB, readable from the front sideline (where the players walk in)
	local flip = CFrame.Angles(0, math.pi, 0)
	local nameCarrier = carrier(ctx, "LogoName", Vector3.new(20, 0.02, 7), CFrame.new(0, 0.42, zc) * flip)
	teamText(nameCarrier, Enum.NormalId.Top, displayName(ctx), team.Primary, team, 13, 0, 0.05, "MidfieldName")
	local clubCarrier = carrier(ctx, "LogoSubtitle", Vector3.new(13, 0.02, 2.2), CFrame.new(0, 0.42, zc - 7.2) * flip)
	local subtitleColor = teamTextColors(team.Primary, team)
	BuildUtil.SurfaceText(clubCarrier, Enum.NormalId.Top, "FOOTBALL CLUB", {
		LabelName = "MidfieldSubtitle",
		TextColor3 = subtitleColor,
		PixelsPerStud = 20,
		Font = Enum.Font.GothamBold,
	})
end

---------------------------------------------------------------------------------------------
-- benches: home team area on the back sideline (|x| in [16, 58], Z[85, 94], height <= 7)
---------------------------------------------------------------------------------------------

-- A team helmet sitting on a surface at height `y`, its face mask toward -Z (the field).
local function helmet(ctx, x, y, z, team)
	local d = 1.3
	BuildUtil.Ball(ctx, {
		Name = "Helmet",
		Position = Vector3.new(x, y + d / 2, z),
		Diameter = d,
		Color = team.Primary,
		Material = Enum.Material.SmoothPlastic,
		Reflectance = 0.1,
	})
	-- centre stripe front to back over the crown
	BuildUtil.Cylinder(ctx, {
		Name = "HelmetStripe",
		Axis = "X",
		Position = Vector3.new(x, y + d / 2, z),
		Height = 0.22,
		Diameter = d + 0.04,
		Color = team.Secondary,
		Material = Enum.Material.SmoothPlastic,
	})
	BuildUtil.Box(
		ctx,
		"Facemask",
		Vector3.new(0.85, 0.6, 0.22),
		Vector3.new(x, y + 0.42, z - d / 2 + 0.05),
		FACEMASK_GREY,
		Enum.Material.Metal
	)
end

-- A stationary exercise bike standing on the mat (top at `baseY`), its front at z = frontZ and
-- the rider facing -Z (the field). The seat is a real seat, and the console explains the bike.
local function exerciseBike(ctx, x, frontZ, baseY, team)
	local metal = Enum.Material.Metal
	BuildUtil.Block(ctx, "BikeBase", Vector3.new(1, 0.3, 3.2), Vector3.new(x, 0, frontZ + 1.7), BAG_GREY, metal, nil, baseY)
	local console = BuildUtil.Block(
		ctx,
		"BikeConsole",
		Vector3.new(0.5, 3.1, 0.6),
		Vector3.new(x, 0, frontZ + 0.6),
		team.Primary,
		Enum.Material.SmoothPlastic,
		nil,
		baseY + 0.3
	)
	BuildUtil.Cylinder(ctx, {
		Name = "BikeFlywheel",
		Axis = "X",
		Position = Vector3.new(x, baseY + 1.2, frontZ + 1.15),
		Height = 0.3,
		Diameter = 1.5,
		Color = MAT_GREY,
		Material = metal,
	})
	BuildUtil.Box(ctx, "BikeHandlebar", Vector3.new(1.3, 0.18, 0.3), Vector3.new(x, baseY + 3.3, frontZ + 0.75), HEATER_GREY, metal)
	BuildUtil.Block(ctx, "BikeSeatPost", Vector3.new(0.25, 1.75, 0.25), Vector3.new(x, 0, frontZ + 2.6), MAT_GREY, metal, nil, baseY + 0.3)
	BuildUtil.Seat(ctx, {
		Name = "BikeSeat",
		Size = Vector3.new(0.9, 0.3, 1.1),
		CFrame = CFrame.new(x, baseY + 2.2, frontZ + 2.6),
		Color = team.Secondary,
		Material = Enum.Material.Fabric,
		Object = "Exercise Bike",
	})
	BuildUtil.Look(
		console,
		"Sideline Bike",
		"Players pedal this bike between plays to keep their legs warm and loose. Hop on and spin!",
		{ At = Vector3.new(0, 1.1, -0.35), Distance = 8 }
	)
end

function Field.benches(ctx)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local team = ctx.colors
	local areaFront = L.FieldBackZ + 2 -- 85
	local areaBack = L.SurfaceMaxZ - 1 -- 94
	local matTop = STRIPE_TOP + 0.04

	-- The bench area is split in two halves so the home team tunnel (behind the middle of the
	-- sideline) has a clear lane onto the field: |x| < BENCH_LANE stays empty.
	local BENCH_LANE = L.BackTunnelHalfWidth + 2 -- 16
	local MAT_WIDTH = 42
	local matX = BENCH_LANE + MAT_WIDTH / 2 -- 37
	local matDepth = areaBack - areaFront
	local matZ = (areaFront + areaBack) / 2

	local BENCH_X, BENCH_LEN = 31, 22 -- benches span |x| 20..42
	local seatZ = areaFront + 3.5
	local seatTop = matTop + 2
	local backrestTop = seatTop + 1.8

	-- Step 1: Sideline Mats ------------------------------------------------------------------
	BuildUtil.Stage(ctx, 1)
	for _, side in ipairs({ -1, 1 }) do
		-- (turned round: Top-face lettering reads upright from the part's +Z side, here the field)
		local mat = BuildUtil.Part(ctx, {
			Name = "SidelineMat",
			Size = Vector3.new(MAT_WIDTH, matTop - TURF_TOP, matDepth),
			CFrame = CFrame.new(side * matX, (TURF_TOP + matTop) / 2, matZ) * CFrame.Angles(0, math.pi, 0),
			Color = MAT_GREY,
			Material = Enum.Material.Fabric,
			CanCollide = false,
			CastShadow = false,
		})
		-- "TEAM AREA" stencilled on the mat in front of the bench (world x / z -> the face's fractions)
		local function fx(x)
			return (side * matX + MAT_WIDTH / 2 - x) / MAT_WIDTH
		end
		local function fz(z)
			return (matZ + matDepth / 2 - z) / matDepth
		end
		local stencil = teamText(mat, Enum.NormalId.Top, "TEAM AREA", MAT_GREY, team, 12, 0, 0, "MatStencil", 1)
		local a, b = fx(side * (BENCH_X - BENCH_LEN / 2 + 1)), fx(side * (BENCH_X + BENCH_LEN / 2 - 1))
		stencil.Position = UDim2.new(math.min(a, b), 0, fz(areaFront + 2.3), 0)
		stencil.Size = UDim2.new(math.abs(b - a), 0, fz(areaFront + 0.5) - fz(areaFront + 2.3), 0)
		-- team border all round (the end strips run between the front and back strips)
		local edgeThickness = matTop + 0.04 - TURF_TOP
		for _, ez in ipairs({ areaFront + 0.25, areaBack - 0.25 }) do
			paint(ctx, "MatEdge", MAT_WIDTH, 0.5, side * matX, ez, edgeThickness, team.Secondary)
		end
		for _, ex in ipairs({ BENCH_LANE + 0.25, BENCH_LANE + MAT_WIDTH - 0.25 }) do
			paint(ctx, "MatEdge", 0.5, matDepth - 1, side * ex, matZ, edgeThickness, team.Secondary)
		end
		-- yellow coaching-box line between the sideline and the team area
		paint(ctx, "CoachingBoxLine", MAT_WIDTH, 0.3, side * matX, areaFront - 0.5, LINE_THICKNESS, COACH_YELLOW)
	end

	-- Step 2: Benches -------------------------------------------------------------------------
	-- long team benches facing the field (-Z): metal legs, team seat + backrest, helmets and towels
	BuildUtil.Stage(ctx, 2)
	for _, s in ipairs({ -1, 1 }) do
		local bench = BuildUtil.Child(ctx, s < 0 and "BenchWest" or "BenchEast")
		local bx = s * BENCH_X
		for _, offset in ipairs({ -9.6, -3.2, 3.2, 9.6 }) do
			BuildUtil.Block(
				bench,
				"Leg",
				Vector3.new(0.4, 1.6, 1.8),
				Vector3.new(bx + offset, 0, seatZ + 0.1),
				C.Metal,
				Enum.Material.Metal,
				nil,
				matTop
			)
		end
		BuildUtil.Block(
			bench,
			"BenchPlank",
			Vector3.new(BENCH_LEN, 0.4, 2),
			Vector3.new(bx, 0, seatZ),
			team.Primary,
			Enum.Material.SmoothPlastic,
			nil,
			seatTop - 0.4
		)
		local backrest = BuildUtil.Block(
			bench,
			"Backrest",
			Vector3.new(BENCH_LEN, 1.8, 0.4),
			Vector3.new(bx, 0, seatZ + 0.8),
			team.Primary,
			Enum.Material.SmoothPlastic,
			nil,
			seatTop
		)
		teamText(backrest, Enum.NormalId.Front, displayName(ctx), team.Primary, team, 20, 0.27, 0.14, "BenchText", 2)
		BuildUtil.Block(
			bench,
			"BackrestStripe",
			Vector3.new(BENCH_LEN + 0.1, 0.4, 0.46),
			Vector3.new(bx, 0, seatZ + 0.8),
			team.Secondary,
			Enum.Material.SmoothPlastic,
			nil,
			seatTop + 1.5
		)
		-- a team-coloured end panel (armrest) closes off the outer end of the bench (the heater
		-- stands at the inner end, its glowing grille aimed along the seat)
		BuildUtil.Block(
			bench,
			"BenchEnd",
			Vector3.new(0.3, seatTop + 0.6 - matTop, 2.3),
			Vector3.new(bx + s * (BENCH_LEN / 2 + 0.15), 0, seatZ + 0.05),
			team.Secondary,
			Enum.Material.SmoothPlastic,
			nil,
			matTop
		)
		-- three team cushions players can sit on, facing the field (the middle one has the prompt;
		-- touching any of them seats you). The west bench's middle seat is a TV camera seat.
		for _, offset in ipairs({ -3.4, 0, 3.4 }) do
			local camera = nil
			if s < 0 and offset == 0 then
				camera = { From = SIDELINE_CAM_FROM, To = SIDELINE_CAM_TO, Fov = 50, Label = "SIDELINE CAM" }
			end
			BuildUtil.Seat(bench, {
				Name = "BenchSeat",
				Size = Vector3.new(2.6, 0.2, 1.5),
				CFrame = CFrame.new(bx + offset, seatTop + 0.1, seatZ - 0.2),
				Color = team.Secondary,
				Material = Enum.Material.Fabric,
				Object = "Team Bench",
				NoPrompt = offset ~= 0,
				Camera = camera,
			})
		end
		-- helmets resting on the seat, a towel over the backrest (all clear of the lettering)
		for _, offset in ipairs({ -9, -6.8, 7.2 }) do
			helmet(bench, bx + offset, seatTop, seatZ - 0.15, team)
		end
		for _, offset in ipairs({ 9.6 }) do
			BuildUtil.Block(
				bench,
				"Towel",
				Vector3.new(1.3, 1.5, 0.62),
				Vector3.new(bx + offset, 0, seatZ + 0.8),
				WHITE,
				Enum.Material.Fabric,
				nil,
				backrestTop + 0.3 - 1.5
			)
		end
	end

	-- Step 3: Coolers & Medical Tent ------------------------------------------------------------
	BuildUtil.Stage(ctx, 3)

	-- drinks table with two orange coolers at the west end of the benches
	local drinks = BuildUtil.Child(ctx, "DrinksTable")
	local drinksX = -46
	local tableHeight = 2
	local tableTop = matTop + tableHeight
	local drinksTable = BuildUtil.Block(
		drinks,
		"Table",
		Vector3.new(5, tableHeight, 2.2),
		Vector3.new(drinksX, 0, seatZ),
		team.Primary,
		Enum.Material.Fabric,
		nil,
		matTop
	)
	-- the table skirt carries the (made-up) drink sponsor's name toward the field
	teamText(drinksTable, Enum.NormalId.Front, "SPIRAL SPORTS DRINK", team.Primary, team, 30, 0.05, 0.3, "TableSkirtText", 1)
	for _, s in ipairs({ -1, 1 }) do
		local cooler = BuildUtil.Cylinder(drinks, {
			Name = "Cooler",
			Position = Vector3.new(drinksX + s * 1.2, tableTop + 0.8, seatZ + 0.2),
			Height = 1.6,
			Diameter = 1.6,
			Color = COOLER_ORANGE,
			Material = Enum.Material.SmoothPlastic,
		})
		if s < 0 then
			BuildUtil.Use(ctx, cooler, "sportsdrink", {
				Object = "Sports Drink Cooler",
				Title = "Sideline Cooler",
				Info = "Ice-cold sports drink keeps the players going all four quarters. Take a cup!",
				Distance = 7,
			})
		end
		BuildUtil.Cylinder(drinks, {
			Name = "CoolerLid",
			Position = Vector3.new(drinksX + s * 1.2, tableTop + 1.75, seatZ + 0.2),
			Height = 0.3,
			Diameter = 1.75,
			Color = WHITE,
			Material = Enum.Material.SmoothPlastic,
		})
		-- the tap at the bottom of the cooler, over the table's edge
		BuildUtil.Box(
			drinks,
			"CoolerTap",
			Vector3.new(0.24, 0.24, 0.3),
			Vector3.new(drinksX + s * 1.2, tableTop + 0.3, seatZ + 0.2 - 0.9),
			WHITE,
			Enum.Material.SmoothPlastic,
			{ CanCollide = false }
		)
	end
	BuildUtil.Cylinder(drinks, {
		Name = "CupStack",
		Position = Vector3.new(drinksX, tableTop + 0.6, seatZ - 0.6),
		Height = 1.2,
		Diameter = 0.55,
		Color = WHITE,
		Material = Enum.Material.SmoothPlastic,
	})
	-- squeeze-bottle carrier in front of the table, bin behind it
	local crateZ = areaFront + 1.3
	BuildUtil.Block(
		drinks,
		"BottleCarrier",
		Vector3.new(2.4, 0.7, 1),
		Vector3.new(drinksX, 0, crateZ),
		team.Secondary,
		Enum.Material.SmoothPlastic,
		nil,
		matTop
	)
	for _, bx in ipairs({ -0.75, 0, 0.75 }) do
		BuildUtil.Cylinder(drinks, {
			Name = "SqueezeBottle",
			Position = Vector3.new(drinksX + bx, matTop + 0.7 + 0.45, crateZ),
			Height = 0.9,
			Diameter = 0.4,
			Color = team.Primary,
			Material = Enum.Material.SmoothPlastic,
		})
	end
	BuildUtil.Cylinder(drinks, {
		Name = "TrashBin",
		Position = Vector3.new(drinksX + 1.5, matTop + 0.9, areaBack - 1.6),
		Height = 1.8,
		Diameter = 1.4,
		Color = HEATER_GREY,
		Material = Enum.Material.Metal,
	})
	-- a big misting fan behind the table, aimed along the bench (cool air on hot game days)
	local fanX, fanZ = drinksX - 0.6, areaBack - 2.6
	BuildUtil.Block(
		drinks,
		"FanStand",
		Vector3.new(1.4, 2.6, 1.2),
		Vector3.new(fanX, 0, fanZ),
		HEATER_GREY,
		Enum.Material.Metal,
		nil,
		matTop
	)
	local fan = BuildUtil.Cylinder(drinks, {
		Name = "MistingFan",
		Axis = "X",
		Position = Vector3.new(fanX + 0.2, matTop + 4, fanZ),
		Height = 0.9,
		Diameter = 3,
		Color = team.Primary,
		Material = Enum.Material.SmoothPlastic,
	})
	BuildUtil.Cylinder(drinks, {
		Name = "FanGrille",
		Axis = "X",
		Position = Vector3.new(fanX + 0.7, matTop + 4, fanZ),
		Height = 0.12,
		Diameter = 2.6,
		Color = FACEMASK_GREY,
		Material = Enum.Material.DiamondPlate,
		CanCollide = false,
	})
	BuildUtil.Look(
		fan,
		"Misting Fan",
		"On hot game days this giant fan blows a cool mist along the bench, so the players stay fresh for the fourth quarter.",
		{ At = Vector3.new(0.75, 0, 0), Distance = 8 }
	)

	-- kicking net at the far west end: frame, net, braces + a ball on a tee in front of it
	local net = BuildUtil.Child(ctx, "KickingNet")
	local netX0, netX1 = -57.4, -50.2
	local netCX = (netX0 + netX1) / 2
	local netZ, netH = areaBack - 2.6, 5.6
	for _, px in ipairs({ netX0, netX1 }) do
		BuildUtil.Block(net, "NetPost", Vector3.new(0.3, netH, 0.3), Vector3.new(px, 0, netZ), C.Metal, Enum.Material.Metal, nil, matTop)
		strut(
			net,
			"NetBrace",
			Vector3.new(px, matTop + netH - 0.2, netZ + 0.1),
			Vector3.new(px, matTop + 0.1, areaBack - 0.4),
			0.24,
			0.24,
			C.Metal,
			Enum.Material.Metal
		)
	end
	BuildUtil.Block(
		net,
		"NetTopBar",
		Vector3.new(netX1 - netX0 + 0.3, 0.3, 0.3),
		Vector3.new(netCX, 0, netZ),
		C.Metal,
		Enum.Material.Metal,
		nil,
		matTop + netH
	)
	local netPart = BuildUtil.Block(
		net,
		"Net",
		Vector3.new(netX1 - netX0 - 0.3, netH - 0.4, 0.08),
		Vector3.new(netCX, 0, netZ),
		NET_WHITE,
		Enum.Material.Fabric,
		{ Transparency = 0.45, CastShadow = false },
		matTop + 0.2
	)
	BuildUtil.Look(
		netPart,
		"Kicking Net",
		"The kicker warms up here, booting balls into the net so they don't fly into the crowd. Hit the white target!",
		{ Distance = 8 }
	)
	BuildUtil.Block(
		net,
		"NetTargetFrame",
		Vector3.new(2.2, 2.2, 0.06),
		Vector3.new(netCX, 0, netZ - 0.07),
		team.Secondary,
		Enum.Material.SmoothPlastic,
		PAINT,
		matTop + 2.6
	)
	BuildUtil.Block(
		net,
		"NetTarget",
		Vector3.new(1.6, 1.6, 0.06),
		Vector3.new(netCX, 0, netZ - 0.1),
		NET_WHITE,
		Enum.Material.SmoothPlastic,
		PAINT,
		matTop + 2.9
	)
	BuildUtil.Cylinder(net, {
		Name = "KickingTee",
		Position = Vector3.new(netCX, matTop + 0.15, areaFront + 1.6),
		Height = 0.3,
		Diameter = 0.7,
		Color = PYLON_ORANGE,
		Material = Enum.Material.SmoothPlastic,
	})
	BuildUtil.Ball(net, {
		Name = "Football",
		Position = Vector3.new(netCX, matTop + 0.3 + 0.4, areaFront + 1.6),
		Diameter = 0.8,
		Color = FOOTBALL_BROWN,
		Material = Enum.Material.SmoothPlastic,
	})

	-- blue medical tent near the east end (the exercise bike stands beside it; the walk between the
	-- tent and the gear stays open)
	local tent = BuildUtil.Child(ctx, "MedicalTent")
	local tentX, tentZ = 52.5, areaFront + 3.6
	local tentW, tentD, tentH, roofH = 6, 5.4, 4, 1.6
	local tentBody = BuildUtil.Block(
		tent,
		"TentBody",
		Vector3.new(tentW, tentH, tentD),
		Vector3.new(tentX, 0, tentZ),
		MEDICAL_BLUE,
		Enum.Material.Fabric,
		nil,
		matTop
	)
	BuildUtil.Look(
		tentBody,
		"Medical Tent",
		"When a player gets hurt, the team doctors check him in here, away from the TV cameras. Most players are back in the game in minutes!",
		{ At = Vector3.new(0, 0, -tentD / 2 - 0.6), Distance = 8 }
	)
	for _, s in ipairs({ -1, 1 }) do
		-- gable roof: tall face of each wedge meets at the ridge (along Z)
		BuildUtil.Wedge(tent, {
			Name = "TentRoof",
			Size = Vector3.new(tentD + 0.6, roofH, tentW / 2 + 0.3),
			CFrame = CFrame.new(tentX + s * (tentW / 4 + 0.15), matTop + tentH + roofH / 2, tentZ) * CFrame.Angles(0, -s * math.rad(90), 0),
			Color = MEDICAL_BLUE,
			Material = Enum.Material.Fabric,
		})
	end
	local tentFrontZ = tentZ - tentD / 2
	local crossY = matTop + tentH / 2 + 0.3
	BuildUtil.Box(
		tent,
		"CrossPanel",
		Vector3.new(2.6, 2.6, 0.1),
		Vector3.new(tentX, crossY, tentFrontZ - 0.05),
		WHITE,
		Enum.Material.SmoothPlastic
	)
	BuildUtil.Box(
		tent,
		"CrossH",
		Vector3.new(1.9, 0.6, 0.14),
		Vector3.new(tentX, crossY, tentFrontZ - 0.07),
		MEDICAL_RED,
		Enum.Material.SmoothPlastic
	)
	BuildUtil.Box(
		tent,
		"CrossV",
		Vector3.new(0.6, 1.9, 0.14),
		Vector3.new(tentX, crossY, tentFrontZ - 0.07),
		MEDICAL_RED,
		Enum.Material.SmoothPlastic
	)
	-- the zipped door flap beside the cross and a white ridge cap along the roof
	BuildUtil.Box(
		tent,
		"TentFlap",
		Vector3.new(1.3, tentH - 0.4, 0.08),
		Vector3.new(tentX - tentW / 2 + 1, matTop + (tentH - 0.4) / 2, tentFrontZ - 0.04),
		TENT_FLAP,
		Enum.Material.Fabric,
		{ CanCollide = false }
	)
	BuildUtil.Box(
		tent,
		"TentRidge",
		Vector3.new(0.5, 0.25, tentD + 0.8),
		Vector3.new(tentX, matTop + tentH + roofH, tentZ),
		WHITE,
		Enum.Material.Fabric,
		{ CanCollide = false }
	)

	-- equipment trunk and a bag of footballs between the east bench and the tent
	local gear = BuildUtil.Child(ctx, "Gear")
	local gearX = 45.6
	local trunk = BuildUtil.Block(
		gear,
		"EquipmentTrunk",
		Vector3.new(3, 1.5, 1.6),
		Vector3.new(gearX, 0, areaBack - 1.6),
		team.Primary,
		Enum.Material.WoodPlanks,
		nil,
		matTop
	)
	teamText(trunk, Enum.NormalId.Front, "EQUIPMENT", team.Primary, team, 30, 0.08, 0.25, "TrunkText", 1)
	BuildUtil.Block(
		gear,
		"TrunkLid",
		Vector3.new(3.1, 0.3, 1.7),
		Vector3.new(gearX, 0, areaBack - 1.6),
		team.Secondary,
		Enum.Material.SmoothPlastic,
		nil,
		matTop + 1.5
	)
	local bagZ = areaFront + 2
	BuildUtil.Block(gear, "BallBag", Vector3.new(1.8, 1.2, 1.4), Vector3.new(gearX, 0, bagZ), BAG_GREY, Enum.Material.Fabric, nil, matTop)
	for _, b in ipairs({ { -0.45, -0.2 }, { 0.45, 0.15 }, { 0, 0.1 } }) do
		BuildUtil.Ball(gear, {
			Name = "Football",
			Position = Vector3.new(gearX + b[1], matTop + 1.2 + (b[1] == 0 and 0.35 or 0.15), bagZ + b[2]),
			Diameter = 0.75,
			Color = FOOTBALL_BROWN,
			Material = Enum.Material.SmoothPlastic,
		})
	end

	-- the sideline tablet cart between the ball bag and the trunk: two tablets on top show the
	-- starters and the score (players study photos of the last play on them)
	local cartX, cartZ = gearX + 0.15, areaFront + 4.5
	local cart = BuildUtil.Block(
		gear,
		"TabletCart",
		Vector3.new(2.5, 2.3, 2.2),
		Vector3.new(cartX, 0, cartZ),
		BAG_GREY,
		Enum.Material.Metal,
		nil,
		matTop
	)
	BuildUtil.Look(
		cart,
		"Sideline Tablets",
		"After every drive the players crowd round these tablets to see photos of the last play. Your starting quarterback checks them first!",
		{ LookKey = "roster:QB", At = Vector3.new(0, 1.05, -1.15), Distance = 8 }
	)
	BuildUtil.Block(
		gear,
		"TabletCartTop",
		Vector3.new(2.7, 0.2, 2.4),
		Vector3.new(cartX, 0, cartZ),
		team.Primary,
		Enum.Material.SmoothPlastic,
		nil,
		matTop + 2.3
	)
	for index, spec in ipairs({ { -0.62, "roster", LED_AMBER }, { 0.62, "summary", LED_CYAN } }) do
		-- leaning back 20 degrees, the screen facing the field
		local tablet = BuildUtil.Part(gear, {
			Name = "Tablet",
			Size = Vector3.new(1.1, 0.8, 0.08),
			CFrame = CFrame.new(cartX + spec[1], matTop + 2.5 + 0.4, cartZ - 0.3) * CFrame.Angles(math.rad(20), 0, 0),
			Color = SCREEN_DARK,
			Material = Enum.Material.SmoothPlastic,
			CanCollide = false,
		})
		BuildUtil.LiveText(tablet, Enum.NormalId.Front, spec[2], {
			LabelName = "TabletScreen" .. index,
			Text = spec[2] == "roster" and "STARTERS" or "HOME 0 - AWAY 0",
			TextColor3 = spec[3],
			BackgroundColor3 = SCREEN_DARK,
			BackgroundTransparency = 0,
			LightInfluence = 0,
			Font = Enum.Font.GothamBold,
			PixelsPerStud = 80,
		})
	end

	-- an exercise bike at the east end of the mat, beside the tent: players pedal to keep their legs warm
	exerciseBike(BuildUtil.Child(ctx, "ExerciseBike"), 57.05, areaFront + 1, matTop, team)

	-- sideline heaters at the inner end of both benches, glowing grilles aimed at the bench
	for _, s in ipairs({ -1, 1 }) do
		local heater = BuildUtil.Child(ctx, s < 0 and "HeaterWest" or "HeaterEast")
		local hx, hz = s * (BENCH_LANE + 1.6), seatZ
		BuildUtil.Block(
			heater,
			"HeaterBody",
			Vector3.new(2.4, 3.2, 2.4),
			Vector3.new(hx, 0, hz),
			HEATER_GREY,
			Enum.Material.Metal,
			nil,
			matTop
		)
		BuildUtil.Block(
			heater,
			"HeaterCap",
			Vector3.new(2.6, 0.3, 2.6),
			Vector3.new(hx, 0, hz),
			team.Primary,
			Enum.Material.SmoothPlastic,
			nil,
			matTop + 3.2
		)
		local grille = BuildUtil.Box(
			heater,
			"HeaterGrille",
			Vector3.new(0.1, 1.8, 1.8),
			Vector3.new(hx + s * 1.25, matTop + 1.8, hz),
			HEATER_GLOW,
			Enum.Material.Neon,
			{ CastShadow = false }
		)
		BuildUtil.Light(grille, "PointLight", { Name = "HeaterGlow", Color = HEATER_GLOW, Range = 8, Brightness = 1 })
	end

	-- Step 4: Sideline Boards -----------------------------------------------------------------
	-- team boards right behind the benches. The field-side lettering sits in a band ABOVE the bench
	-- backrests (otherwise the benches hide it from the field and the front stands); the back
	-- carries full-height lettering for the home stands.
	BuildUtil.Stage(ctx, 4)
	local boardZ = areaBack - 0.8
	local boardWidth = BENCH_LEN + 2
	local boardHeight = 6.3 -- cap top = 6.86, inside the 7-stud height limit
	local boardTop = matTop + boardHeight
	local bandBottom = backrestTop + 0.55 -- clear of the towels too
	local bandTopInset = 0.12
	local panels = {
		{ x = -BENCH_X, text = (ctx.teamName and ctx.teamName ~= "") and ctx.teamName or "GRIDIRON" },
		{ x = BENCH_X, text = "HOME TEAM" },
	}
	for _, info in ipairs(panels) do
		local board = BuildUtil.Child(ctx, "SidelineBoard")
		local panel = BuildUtil.Block(
			board,
			"SidelineBoard",
			Vector3.new(boardWidth, boardHeight, 0.5),
			Vector3.new(info.x, 0, boardZ),
			team.Secondary,
			Enum.Material.SmoothPlastic,
			nil,
			matTop
		)
		if info.x > 0 then
			BuildUtil.Look(
				panel,
				"Sideline Board",
				"Your team's colours behind the bench. Every TV shot of the sideline shows it, so the whole league knows your record!",
				{ LookKey = "record", Distance = 9 }
			)
		end
		local front = teamText(panel, Enum.NormalId.Front, info.text, team.Secondary, team, 30, 0, 0, "BoardText", 3)
		front.Position = UDim2.new(0.03, 0, bandTopInset / boardHeight, 0)
		front.Size = UDim2.new(0.94, 0, (boardTop - bandTopInset - bandBottom) / boardHeight, 0)
		teamText(panel, Enum.NormalId.Back, info.text, team.Secondary, team, 20, 0.06, 0.16, "BoardBackText", 3)
		BuildUtil.Block(
			board,
			"SidelineBoardCap",
			Vector3.new(boardWidth + 0.2, 0.3, 0.7),
			Vector3.new(info.x, 0, boardZ),
			team.Primary,
			Enum.Material.SmoothPlastic,
			nil,
			boardTop
		)
		-- glowing LED strip under the lettering band + feet behind the board
		BuildUtil.Box(
			board,
			"BoardLED",
			Vector3.new(boardWidth - 0.4, 0.18, 0.06),
			Vector3.new(info.x, bandBottom - 0.15, boardZ - 0.28),
			team.Trim,
			Enum.Material.Neon,
			PAINT
		)
		for _, fx in ipairs({ -boardWidth / 2 + 1.5, boardWidth / 2 - 1.5 }) do
			BuildUtil.Block(
				board,
				"BoardFoot",
				Vector3.new(0.6, 0.8, 0.5),
				Vector3.new(info.x + fx, 0, boardZ + 0.5),
				C.Metal,
				Enum.Material.Metal,
				nil,
				matTop
			)
		end
		-- team-coloured posts frame both ends of the board
		for _, e in ipairs({ -1, 1 }) do
			BuildUtil.Block(
				board,
				"BoardPost",
				Vector3.new(0.5, boardHeight + 0.4, 0.8), -- (top 6.98: the 7-stud height limit)
				Vector3.new(info.x + e * (boardWidth / 2 + 0.2), 0, boardZ),
				team.Primary,
				Enum.Material.SmoothPlastic,
				nil,
				matTop
			)
		end
	end
end

return Field
