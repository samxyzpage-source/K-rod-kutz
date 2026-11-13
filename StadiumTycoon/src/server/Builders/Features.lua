--[[
	Features
	The "big league" upgrades that sit around and above the full seating bowl.

	  scoreboard       east, outside the bowl on two steel legs; three LED panels face the field (-X)
	  lights           four lattice flood-light towers outside the bowl corners: a big bank on top
	                   aimed at the field centre and a smaller mid bank aimed at the nearby stands
	  jumbotron        west, outside the bowl on two steel legs; one giant screen faces the field (+X)
	  pressbox         two-level glass press box behind the top of the home (back) upper deck,
	                   on stair cores + columns, rooftop "PRESS BOX" sign, TV camera platforms
	  suites           two glass-fronted luxury suite levels behind the front (visitor) upper deck
	  broadcast_booth  glass TV booth bridging the front players' tunnel on top of the visitor
	                   upper deck, "ON AIR" box, satellite dish and camera on the roof
	  canopy           one ring roof over the whole upper ring, cantilevered from columns that
	                   stand on the upper decks' top row; the middle above the field stays open

	Runtime contracts (the PlotManager finds these by name, do not rename them):
	  scoreboard  TextLabels "ScoreboardTitle", "ScoreboardScore", "ScoreboardAttendance"
	  lights      SpotLights named "FloodLight" (start disabled) and Parts named "FloodPanel"
	              (SmoothPlastic by day, the server switches them to Neon at night)
	  jumbotron   TextLabel "JumbotronText"
	  canopy      uses the same FloodLight / FloodPanel names for its ring of roof-edge lights
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)

local Features = {}

local SCREEN_BLACK = Color3.fromRGB(10, 10, 14)
local STEEL = Color3.fromRGB(78, 84, 94)
local SPEAKER_GREY = Color3.fromRGB(38, 38, 44)
local CONE_GREY = Color3.fromRGB(70, 70, 78)
local WARM_WHITE = Color3.fromRGB(255, 243, 214)
local ROOF_WHITE = Color3.fromRGB(232, 235, 240)
local LED_AMBER = Color3.fromRGB(255, 196, 40)
local LED_GREEN = Color3.fromRGB(110, 255, 140)
local BEACON_RED = Color3.fromRGB(255, 40, 40)

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
local function strut(ctx, name, a, b, width, color, material)
	return BuildUtil.Part(ctx, {
		Name = name,
		Size = Vector3.new(width, width, (b - a).Magnitude),
		CFrame = CFrame.lookAt((a + b) / 2, b),
		Color = color,
		Material = material or Enum.Material.Metal,
	})
end

-- A vertical round post from y0 to y1.
local function post(ctx, name, x, z, y0, y1, diameter, color, material)
	return BuildUtil.Cylinder(ctx, {
		Name = name,
		Position = Vector3.new(x, (y0 + y1) / 2, z),
		Height = y1 - y0,
		Diameter = diameter,
		Axis = "Y",
		Color = color,
		Material = material or Enum.Material.Metal,
	})
end

-- A thin, self-lit display panel with one TextLabel covering `face`.
local function screen(ctx, name, size, position, face, text, opts)
	local part = BuildUtil.Box(ctx, name, size, position, SCREEN_BLACK, Enum.Material.SmoothPlastic)
	local _, label = BuildUtil.SurfaceText(part, face, text, {
		LabelName = opts.LabelName,
		TextColor3 = opts.TextColor3,
		BackgroundColor3 = opts.BackgroundColor3 or SCREEN_BLACK,
		BackgroundTransparency = 0,
		LightInfluence = 0,
		Font = opts.Font or Enum.Font.GothamBlack,
		PixelsPerStud = opts.PixelsPerStud or 16,
		TextStrokeTransparency = opts.TextStrokeTransparency,
	})
	return part, label
end

--[[
	Several text labels side by side (or stacked) on one face of a part.
	list = { { text = "...", from = 0..1, to = 0..1, top = 0..1?, bottom = 0..1? }, ... }
	from/to are fractions of the face width (left to right as seen from the face),
	top/bottom optional fractions of its height (default the full height).
]]
local function labels(part, face, list, textColor, pixelsPerStud)
	for index, entry in ipairs(list) do
		local _, label = BuildUtil.SurfaceText(part, face, entry.text, {
			LabelName = part.Name .. "Text" .. index,
			TextColor3 = textColor,
			PixelsPerStud = pixelsPerStud or 16,
			Font = Enum.Font.GothamBlack,
		})
		local top, bottom = entry.top or 0, entry.bottom or 1
		label.Position = UDim2.new(entry.from, 0, top, 0)
		label.Size = UDim2.new(entry.to - entry.from, 0, bottom - top, 0)
	end
end

-- Steel leg with a concrete footing, from the ground up to `topY` (scoreboard / jumbotron).
local function boardLeg(ctx, x, z, topY, size, C)
	BuildUtil.Block(ctx, "LegFooting", Vector3.new(size + 2.4, 1, size + 2.4), Vector3.new(x, 0, z), C.ConcreteDark, Enum.Material.Concrete)
	BuildUtil.Block(ctx, "Leg", Vector3.new(size, topY - 1, size), Vector3.new(x, 0, z), STEEL, Enum.Material.Metal, nil, 1)
end

---------------------------------------------------------------------------------------------
-- Scoreboard (east, outside the bowl)
---------------------------------------------------------------------------------------------

function Features.scoreboard(ctx)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local team = ctx.colors

	local centreZ = L.FieldCenterZ -- 30
	local faceX = L.EndUpperOuterX + 5 -- 188: the field-facing (-X) face of the housing
	local depth = 5
	local midX = faceX + depth / 2
	local width = 46 -- along Z: z 7..53
	-- bottom clears the end upper deck's rail (y 28) as seen from the field; the top stays low
	-- enough to be seen under the canopy's inner edge from most of the field
	local bottom, top = 30, 56
	local girderBottom = bottom - 1.6

	-- Two steel legs from the ground, a cross beam, a girder under the housing and a ladder
	for _, dz in ipairs({ -15, 15 }) do
		boardLeg(ctx, midX, centreZ + dz, girderBottom, 3, C)
	end
	BuildUtil.Box(ctx, "CrossBeam", Vector3.new(1.6, 1.6, 27), Vector3.new(midX, 15, centreZ), STEEL, Enum.Material.Metal)
	BuildUtil.Box(
		ctx,
		"Girder",
		Vector3.new(depth - 1, 1.6, width - 6),
		Vector3.new(midX, girderBottom + 0.8, centreZ),
		STEEL,
		Enum.Material.Metal
	)
	BuildUtil.Box(
		ctx,
		"Ladder",
		Vector3.new(1.6, girderBottom - 1, 0.3),
		Vector3.new(midX, 1 + (girderBottom - 1) / 2, centreZ - 15 - 1.65),
		STEEL,
		Enum.Material.Metal,
		NO_COLLIDE
	)

	-- Housing in team colours with a crown and side wings
	local housing = BuildUtil.Box(
		ctx,
		"Housing",
		Vector3.new(depth, top - bottom, width),
		Vector3.new(midX, (bottom + top) / 2, centreZ),
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	BuildUtil.SurfaceText(housing, Enum.NormalId.Right, ctx.teamName, {
		LabelName = "ScoreboardBackText",
		TextColor3 = readable(team.Primary, team.Trim),
		PixelsPerStud = 6,
	})
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

	-- Three LED panels on the field-facing face (unrotated parts: -X is the Left face)
	local screenX = faceX - 0.2
	local panelWidth = width - 4
	screen(
		ctx,
		"TitleScreen",
		Vector3.new(0.4, 4.6, panelWidth),
		Vector3.new(screenX, 52.6, centreZ),
		Enum.NormalId.Left,
		ctx.teamName .. " STADIUM",
		{ LabelName = "ScoreboardTitle", TextColor3 = team.Trim, PixelsPerStud = 20 }
	)
	screen(
		ctx,
		"ScoreScreen",
		Vector3.new(0.4, 9.6, panelWidth),
		Vector3.new(screenX, 44.4, centreZ),
		Enum.NormalId.Left,
		"HOME 0  -  AWAY 0",
		{ LabelName = "ScoreboardScore", TextColor3 = LED_AMBER, Font = Enum.Font.Arcade, PixelsPerStud = 20 }
	)
	screen(
		ctx,
		"AttendanceScreen",
		Vector3.new(0.4, 5, panelWidth),
		Vector3.new(screenX, 35.9, centreZ),
		Enum.NormalId.Left,
		"ATTENDANCE 0",
		{ LabelName = "ScoreboardAttendance", TextColor3 = LED_GREEN, Font = Enum.Font.GothamBold, PixelsPerStud = 20 }
	)
	BuildUtil.Box(
		ctx,
		"LedStrip",
		Vector3.new(0.3, 0.6, panelWidth),
		Vector3.new(faceX - 0.15, bottom + 1.4, centreZ),
		team.Secondary,
		Enum.Material.Neon,
		GLOW
	)
end

---------------------------------------------------------------------------------------------
-- Light towers (outside the four bowl corners)
---------------------------------------------------------------------------------------------

local LEG_TOP = 58 -- the four lattice legs meet the mast here
local MID_PLATFORM_Y = 41 -- service platform carrying the mid bank
local MAIN_BANK_Y = 78 -- centre of the big bank on top (its beacon stays below 90)
local MID_BANK_Y = 44.5 -- centre of the smaller bank aimed at the nearby stands

-- A grid of FloodPanels on a dark back plate. `cframe` faces the target (Front face = -Z).
-- lit = list of { column, row, angle, brightness } panels that carry a FloodLight SpotLight.
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
	return plateWidth, plateHeight
end

local function lightTower(ctx, name, base, fieldTarget, standTarget)
	local C = ctx.config.Colors
	local team = ctx.colors
	local tower = BuildUtil.Child(ctx, name)
	local toField = Vector3.new(fieldTarget.X - base.X, 0, fieldTarget.Z - base.Z).Unit
	local toStand = Vector3.new(standTarget.X - base.X, 0, standTarget.Z - base.Z).Unit

	BuildUtil.Block(tower, "TowerFooting", Vector3.new(8, 1.2, 8), base, C.ConcreteDark, Enum.Material.Concrete)
	-- tapered lattice legs from the wide footing up to the top platform
	local footOffset, topOffset = 3.2, 1.2
	for _, sx in ipairs({ -1, 1 }) do
		for _, sz in ipairs({ -1, 1 }) do
			strut(
				tower,
				"TowerLeg",
				Vector3.new(base.X + sx * footOffset, 1.2, base.Z + sz * footOffset),
				Vector3.new(base.X + sx * topOffset, LEG_TOP, base.Z + sz * topOffset),
				1,
				C.Metal
			)
		end
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
	local plateWidth, plateHeight = floodBank(tower, head, 3, 2, Vector3.new(6.4, 5.2, 0.5), {
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
	floodBank(tower, CFrame.lookAt(midPosition, standTarget), 2, 1, Vector3.new(3.8, 3.2, 0.5), {
		{ 1, 1, 90, 3 },
		{ 2, 1, 90, 3 },
	})
end

function Features.lights(ctx)
	local L = ctx.config.Layout
	local fieldTarget = Vector3.new(0, 0, L.FieldCenterZ)
	for _, base in ipairs(L.LightTowerPositions) do
		local front = base.Z < L.FieldCenterZ
		local sx = base.X < 0 and -1 or 1
		-- a point a few rows into the upper deck at the corner nearest to the tower
		local standTarget =
			Vector3.new(sx * (L.EndLowerOuterX + 8), L.UpperStartHeight, front and (L.FrontLowerOuterZ - 8) or (L.BackLowerOuterZ + 8))
		local name = ("Tower%s%s"):format(front and "Front" or "Back", sx < 0 and "West" or "East")
		lightTower(ctx, name, base, fieldTarget, standTarget)
	end
end

---------------------------------------------------------------------------------------------
-- Jumbotron (west, outside the bowl)
---------------------------------------------------------------------------------------------

function Features.jumbotron(ctx)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local team = ctx.colors

	local centreZ = L.FieldCenterZ -- 30
	local faceX = -(L.EndUpperOuterX + 5) -- -188: the field-facing (+X) face of the housing
	local depth = 5
	local midX = faceX - depth / 2
	local width = 52 -- along Z: z 4..56
	-- bottom clears the end upper deck's rail as seen from the field; the screen top stays under
	-- the sight line past the canopy's notch edge (about y 57-59 from the field)
	local bottom, top = 30, 58.6
	local girderBottom = bottom - 2

	-- Supports
	for _, dz in ipairs({ -17, 17 }) do
		boardLeg(ctx, midX, centreZ + dz, girderBottom, 3.5, C)
	end
	BuildUtil.Box(ctx, "CrossBeam", Vector3.new(1.8, 1.8, 31), Vector3.new(midX, 14, centreZ), STEEL, Enum.Material.Metal)
	BuildUtil.Box(
		ctx,
		"Girder",
		Vector3.new(depth - 1, 2, width - 6),
		Vector3.new(midX, girderBottom + 1, centreZ),
		STEEL,
		Enum.Material.Metal
	)

	-- Housing, crown and a team-coloured bezel around the screen
	local housing = BuildUtil.Box(
		ctx,
		"Housing",
		Vector3.new(depth, top - bottom, width),
		Vector3.new(midX, (bottom + top) / 2, centreZ),
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	BuildUtil.SurfaceText(housing, Enum.NormalId.Left, ctx.teamName, {
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
	BuildUtil.Box(
		ctx,
		"Bezel",
		Vector3.new(0.2, top - bottom - 1.4, width - 2),
		Vector3.new(faceX + 0.1, (bottom + top) / 2, centreZ),
		team.Secondary,
		Enum.Material.SmoothPlastic
	)

	-- The screen (unrotated part: +X is the Right face)
	screen(ctx, "Screen", Vector3.new(0.4, 24, width - 6), Vector3.new(faceX + 0.4, 45.4, centreZ), Enum.NormalId.Right, ctx.teamName, {
		LabelName = "JumbotronText",
		TextColor3 = team.Trim,
		BackgroundColor3 = team.Primary,
		TextStrokeTransparency = 0.3,
		PixelsPerStud = 12,
	})
	BuildUtil.Box(
		ctx,
		"LedStrip",
		Vector3.new(0.3, 0.6, width - 6),
		Vector3.new(faceX + 0.35, bottom + 1.8, centreZ),
		team.Trim,
		Enum.Material.Neon,
		GLOW
	)

	-- Speaker stacks on both sides of the housing
	for _, side in ipairs({ -1, 1 }) do
		local z = centreZ + side * (width / 2 + 2)
		BuildUtil.Box(ctx, "Speaker", Vector3.new(4, 14, 4), Vector3.new(faceX - 2, 45, z), SPEAKER_GREY, Enum.Material.Fabric)
		for _, y in ipairs({ 41.5, 48.5 }) do
			BuildUtil.Cylinder(ctx, {
				Name = "SpeakerCone",
				Position = Vector3.new(faceX + 0.2, y, z),
				Height = 0.4,
				Diameter = 3,
				Axis = "X",
				Color = CONE_GREY,
				Material = Enum.Material.SmoothPlastic,
			})
		end
	end
end

-- (pressbox, suites and broadcast_booth moved to PressLevel.lua; the old versions are in
-- tools/reference/Features_v3.lua)

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

-- A column on the top row at `column` (x/z) holding up the rib that starts at `outerPoint`.
local function roofColumn(ctx, column, outerPoint, ribLength, baseY)
	local fromOuter = Vector3.new(column.X - outerPoint.X, 0, column.Z - outerPoint.Z).Magnitude
	local ribBottom = DECK_BOTTOM - RIB_DEPTH * (1 - fromOuter / ribLength)
	post(ctx, "RoofColumn", column.X, column.Z, baseY, ribBottom + 0.3, 2, STEEL)
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

function Features.canopy(ctx)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local team = ctx.colors
	local name = ctx.teamName

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

	-- Deck: two full-width metal bands (front / back, including the corners) and two end bands
	-- between them, then the inner glass strip the same way
	local deck = BuildUtil.Child(ctx, "Deck")
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
	-- end metal: full depth either side of the notch, a narrow strip in front of the boards
	local notchX = innerX + NOTCH_DEPTH -- 165: the notch runs from here to the outer edge
	local notchZ0, notchZ1 = L.FieldCenterZ - NOTCH_HALF, L.FieldCenterZ + NOTCH_HALF -- -4 .. 64
	for _, side in ipairs({ -1, 1 }) do
		span(
			deck,
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
		span(deck, "RoofPanel", side * seamX, side * deckX, DECK_BOTTOM, deckTop, notchZ1 + 0.5, seamBackZ, ROOF_WHITE, Enum.Material.Metal)
		span(
			deck,
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
			deck,
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

	-- Team-coloured band around the outer edge (lettered toward the plaza and the campus)
	local edge = BuildUtil.Child(ctx, "Edges")
	local outerFront = span(edge, "OuterBand", -outerX, outerX, BAND_BOTTOM, BAND_TOP, frontZ, frontZ + 1, team.Primary)
	labels(outerFront, Enum.NormalId.Front, {
		{ text = name .. " STADIUM", from = 0.32, to = 0.68, top = 0.08, bottom = 0.92 },
	}, readable(team.Primary, team.Trim), 10)
	local outerBack = span(edge, "OuterBand", -outerX, outerX, BAND_BOTTOM, BAND_TOP, backZ - 1, backZ, team.Primary)
	labels(outerBack, Enum.NormalId.Back, {
		{ text = "HOME OF THE " .. name, from = 0.3, to = 0.7, top = 0.08, bottom = 0.92 },
	}, readable(team.Primary, team.Trim), 10)
	for _, side in ipairs({ -1, 1 }) do
		span(edge, "OuterBand", side * (outerX - 1), side * outerX, BAND_BOTTOM, BAND_TOP, frontZ + 1, notchZ0, team.Primary)
		span(edge, "OuterBand", side * (outerX - 1), side * outerX, BAND_BOTTOM, BAND_TOP, notchZ1, backZ - 1, team.Primary)
		-- the band follows the notch round: two returns and a slim edge along its inner side
		span(edge, "OuterBand", side * notchX, side * (outerX - 1), BAND_BOTTOM, BAND_TOP, notchZ0 - 1, notchZ0, team.Primary)
		span(edge, "OuterBand", side * notchX, side * (outerX - 1), BAND_BOTTOM, BAND_TOP, notchZ1, notchZ1 + 1, team.Primary)
		span(edge, "NotchBand", side * (notchX - 1), side * notchX, NOTCH_BAND_BOTTOM, BAND_TOP, notchZ0 - 1, notchZ1 + 1, team.Primary)
	end

	-- Fascia around the inner edge, lettered toward the field
	local textColor = readable(team.Primary, team.Trim)
	local frontFascia =
		span(edge, "Fascia", -innerX - 0.4, innerX + 0.4, BAND_BOTTOM, BAND_TOP, innerFrontZ - 0.4, innerFrontZ + 0.4, team.Primary)
	labels(frontFascia, Enum.NormalId.Back, {
		{ text = "GO " .. name .. "!", from = 0.06, to = 0.3, top = 0.1, bottom = 0.9 },
		{ text = name .. " STADIUM", from = 0.37, to = 0.63, top = 0.1, bottom = 0.9 },
		{ text = "DE-FENSE!", from = 0.7, to = 0.94, top = 0.1, bottom = 0.9 },
	}, textColor, 10)
	local backFascia =
		span(edge, "Fascia", -innerX - 0.4, innerX + 0.4, BAND_BOTTOM, BAND_TOP, innerBackZ - 0.4, innerBackZ + 0.4, team.Primary)
	labels(backFascia, Enum.NormalId.Front, {
		{ text = name, from = 0.06, to = 0.3, top = 0.1, bottom = 0.9 },
		{ text = "HOME OF THE " .. name, from = 0.35, to = 0.65, top = 0.1, bottom = 0.9 },
		{ text = name, from = 0.7, to = 0.94, top = 0.1, bottom = 0.9 },
	}, textColor, 10)
	-- End fascias: full height either side of the boards, slim in front of them (the notch range)
	-- so the fans in the upper ring see the top of the scoreboard / jumbotron over it. Seen from
	-- the field the -Z piece is on the left at the east end and on the right at the west end.
	for _, side in ipairs({ -1, 1 }) do
		local face = side > 0 and Enum.NormalId.Left or Enum.NormalId.Right
		local words = side > 0 and { "TOUCHDOWN", name .. "!" } or { name .. "!", "LET'S GO" }
		for index, zs in ipairs({ { innerFrontZ + 0.4, notchZ0 }, { notchZ1, innerBackZ - 0.4 } }) do
			local piece =
				span(edge, "Fascia", side * (innerX - 0.4), side * (innerX + 0.4), BAND_BOTTOM, BAND_TOP, zs[1], zs[2], team.Primary)
			labels(piece, face, { { text = words[index], from = 0.08, to = 0.92, top = 0.1, bottom = 0.9 } }, textColor, 10)
		end
		span(edge, "Fascia", side * (innerX - 0.4), side * (innerX + 0.4), NOTCH_BAND_BOTTOM, BAND_TOP, notchZ0, notchZ1, team.Primary)
	end

	-- Columns + ribs. Sideline columns avoid the broadcast booth (|x| <= 22) and the press box
	-- (|x| <= 44); end columns avoid the scoreboard / jumbotron sight lines (z 0..60).
	local structure = BuildUtil.Child(ctx, "Structure")
	local stripeTop = deckTop + 0.2
	-- a team-coloured stripe on top of the deck above every rib (gives the roof its rhythm)
	local function stripe(outerPoint, innerPoint)
		local flat = Vector3.new(innerPoint.X - outerPoint.X, 0, innerPoint.Z - outerPoint.Z)
		local centre = Vector3.new((outerPoint.X + innerPoint.X) / 2, deckTop + 0.1, (outerPoint.Z + innerPoint.Z) / 2)
		BuildUtil.Part(structure, {
			Name = "RoofStripe",
			Size = Vector3.new(1.6, stripeTop - deckTop, flat.Magnitude),
			CFrame = CFrame.lookAt(centre, centre + flat),
			Color = team.Secondary,
			Material = Enum.Material.SmoothPlastic,
			CanCollide = false,
			CastShadow = false,
		})
	end
	local function bay(column, outerPoint, innerPoint)
		local length = roofRib(structure, outerPoint, innerPoint)
		roofColumn(structure, column, outerPoint, length, topRow)
		stripe(outerPoint, innerPoint)
	end
	for _, x in ipairs({ -145, -100, -55, 55, 100, 145 }) do
		bay(Vector3.new(x, 0, frontZ + COLUMN_INSET), Vector3.new(x, 0, frontZ + 1), Vector3.new(x, 0, innerFrontZ))
		bay(Vector3.new(x, 0, backZ - COLUMN_INSET), Vector3.new(x, 0, backZ - 1), Vector3.new(x, 0, innerBackZ))
	end
	for _, side in ipairs({ -1, 1 }) do
		for _, z in ipairs({ -30, 90 }) do
			bay(Vector3.new(side * (outerX - COLUMN_INSET), 0, z), Vector3.new(side * (outerX - 1), 0, z), Vector3.new(side * innerX, 0, z))
		end
		-- Corners: a diagonal rib from the outer corner to the inner corner. The corner aisle of the
		-- upper ring climbs along that diagonal, so instead of one column on top of the stairs
		-- there are two, one either side of the aisle, reaching straight up to the deck.
		for _, corner in ipairs({ { frontZ, innerFrontZ, 1 }, { backZ, innerBackZ, -1 } }) do
			local oz, iz, dz = corner[1], corner[2], corner[3]
			local outerPoint = Vector3.new(side * (outerX - 1), 0, oz + dz * 1)
			local innerPoint = Vector3.new(side * innerX, 0, iz)
			roofRib(structure, outerPoint, innerPoint)
			stripe(outerPoint, innerPoint)
			local inset = COLUMN_INSET
			for _, offset in ipairs({ { inset, 7 }, { 7, inset } }) do
				local cx, cz = side * (outerX - offset[1]), oz + dz * offset[2]
				post(structure, "RoofColumn", cx, cz, topRow, DECK_BOTTOM + 0.3, 2, STEEL)
			end
		end
	end

	-- Ring of light bars just inside the inner edge (FloodPanel / FloodLight like the towers)
	local lightsCtx = BuildUtil.Child(ctx, "RoofLights")
	for _, x in ipairs({ -110, -40, 40, 110 }) do
		roofLightBar(lightsCtx, Vector3.new(x, 0, innerFrontZ), Vector3.new(0, 0, 1), 28)
		roofLightBar(lightsCtx, Vector3.new(x, 0, innerBackZ), Vector3.new(0, 0, -1), 28)
	end
	for _, side in ipairs({ -1, 1 }) do
		-- under the full-height end fascias, either side of the boards
		for _, z in ipairs({ (innerFrontZ + notchZ0) / 2, (notchZ1 + innerBackZ) / 2 }) do
			roofLightBar(lightsCtx, Vector3.new(side * innerX, 0, z), Vector3.new(-side, 0, 0), 28)
		end
	end
end

return Features
