--[[
	Features
	The "big league" upgrades that sit around and above the seating bowl.

	  scoreboard  east, behind the east end-zone stands; three LED panels face the field (-X)
	  lights      four flood-light towers in the open corners of the bowl, aimed at the field
	  jumbotron   west, behind the west end-zone stands; one giant screen faces the field (+X)
	  pressbox    glass box on columns behind the back (home) upper deck, windows face the field
	  suites      two glass-fronted luxury suite levels behind the front (visitor) upper deck
	  canopy      cantilevered roofs over both sideline upper decks, masts on the outer side

	Runtime contracts (the PlotManager finds these by name, do not rename them):
	  scoreboard  TextLabels "ScoreboardTitle", "ScoreboardScore", "ScoreboardAttendance"
	  lights      SpotLights named "FloodLight" (start disabled) and Parts named "FloodPanel"
	              (SmoothPlastic by day, the server switches them to Neon at night)
	  jumbotron   TextLabel "JumbotronText"
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
local DOOR_DARK = Color3.fromRGB(32, 32, 38)

local NO_COLLIDE = { CanCollide = false }

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

-- A sign board with team-coloured text on one face.
local function sign(ctx, name, size, cframe, background, face, text, textColor, pixelsPerStud)
	local part = BuildUtil.Part(ctx, {
		Name = name,
		Size = size,
		CFrame = cframe,
		Color = background,
		Material = Enum.Material.SmoothPlastic,
	})
	BuildUtil.SurfaceText(part, face, text, {
		LabelName = name .. "Text",
		TextColor3 = readable(background, textColor),
		PixelsPerStud = pixelsPerStud or 16,
		Font = Enum.Font.GothamBlack,
	})
	return part
end

-- Concrete footing + pylon pair holding up a display board (scoreboard / jumbotron).
-- `centre` is the footprint centre of the pylon, the pylon top is at `topY`.
local function pylon(ctx, centre, topY, size, C)
	BuildUtil.Block(ctx, "Footing", Vector3.new(size + 2.5, 1, size + 2.5), centre, C.ConcreteDark, Enum.Material.Concrete)
	BuildUtil.Block(ctx, "Pylon", Vector3.new(size, topY - 1, size), centre, C.Concrete, Enum.Material.Concrete, nil, 1)
end

---------------------------------------------------------------------------------------------
-- Scoreboard (east)
---------------------------------------------------------------------------------------------

function Features.scoreboard(ctx)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local team = ctx.colors

	local centreZ = L.FieldCenterZ
	local faceX = L.EndLowerOuterX + 9 -- 168: the field-facing (-X) face of the housing
	local depth = 4
	local midX = faceX + depth / 2
	local width = 46 -- along Z
	local bottom, top = 18, 44
	local girderBottom = bottom - 1.5

	-- Supports: two concrete pylons, a steel girder, a service catwalk and a ladder
	for _, dz in ipairs({ -17, 17 }) do
		pylon(ctx, Vector3.new(midX + 0.5, 0, centreZ + dz), girderBottom, 3.5, C)
	end
	BuildUtil.Box(
		ctx,
		"Girder",
		Vector3.new(3, 1.5, width - 4),
		Vector3.new(midX, girderBottom + 0.75, centreZ),
		STEEL,
		Enum.Material.Metal
	)
	BuildUtil.Box(
		ctx,
		"Catwalk",
		Vector3.new(2.4, 0.3, width),
		Vector3.new(faceX - 1.2, bottom - 0.15, centreZ),
		STEEL,
		Enum.Material.DiamondPlate
	)
	BuildUtil.Box(
		ctx,
		"Ladder",
		Vector3.new(0.3, girderBottom - 1, 1.6),
		Vector3.new(midX + 0.5 - 1.9, 1 + (girderBottom - 1) / 2, centreZ - 17),
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
		Vector3.new(0.4, 5.4, panelWidth),
		Vector3.new(screenX, 39.9, centreZ),
		Enum.NormalId.Left,
		ctx.teamName .. " STADIUM",
		{
			LabelName = "ScoreboardTitle",
			TextColor3 = team.Trim,
			PixelsPerStud = 20,
		}
	)
	screen(
		ctx,
		"ScoreScreen",
		Vector3.new(0.4, 9.6, panelWidth),
		Vector3.new(screenX, 31.2, centreZ),
		Enum.NormalId.Left,
		"HOME 0  -  AWAY 0",
		{
			LabelName = "ScoreboardScore",
			TextColor3 = LED_AMBER,
			Font = Enum.Font.Arcade,
			PixelsPerStud = 20,
		}
	)
	screen(
		ctx,
		"AttendanceScreen",
		Vector3.new(0.4, 5, panelWidth),
		Vector3.new(screenX, 22.7, centreZ),
		Enum.NormalId.Left,
		"ATTENDANCE 0",
		{
			LabelName = "ScoreboardAttendance",
			TextColor3 = LED_GREEN,
			Font = Enum.Font.GothamBold,
			PixelsPerStud = 20,
		}
	)
	BuildUtil.Box(
		ctx,
		"LedStrip",
		Vector3.new(0.3, 0.6, panelWidth),
		Vector3.new(faceX - 0.15, 19.1, centreZ),
		team.Secondary,
		Enum.Material.Neon,
		NO_COLLIDE
	)
end

---------------------------------------------------------------------------------------------
-- Light towers (four corners)
---------------------------------------------------------------------------------------------

local MAST_TOP = 63 -- the main light bank is centred here
local LEG_TOP = 40 -- the four lattice legs meet the mast here
local LOW_BANK_Y = 33 -- a smaller second bank low enough for its lights to reach the field

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
			local panel = BuildUtil.Part(ctx, {
				Name = "FloodPanel",
				Size = panelSize,
				CFrame = cframe * CFrame.new(x, y, -panelSize.Z / 2),
				Color = WARM_WHITE,
				Material = Enum.Material.SmoothPlastic,
				CastShadow = false,
			})
			panels[column .. "," .. row] = panel
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

local function lightTower(ctx, name, base, target)
	local C = ctx.config.Colors
	local team = ctx.colors
	local tower = BuildUtil.Child(ctx, name)
	local toField = Vector3.new(target.X - base.X, 0, target.Z - base.Z).Unit

	BuildUtil.Block(tower, "TowerFooting", Vector3.new(8, 1.2, 8), base, C.ConcreteDark, Enum.Material.Concrete)
	BuildUtil.Cylinder(tower, {
		Name = "TowerMast",
		Position = Vector3.new(base.X, (1.2 + MAST_TOP) / 2, base.Z),
		Height = MAST_TOP - 1.2,
		Diameter = 2.2,
		Axis = "Y",
		Color = C.Metal,
		Material = Enum.Material.Metal,
	})
	-- tapered lattice legs from a wide base up to the service platform
	for _, sx in ipairs({ -1, 1 }) do
		for _, sz in ipairs({ -1, 1 }) do
			strut(
				tower,
				"TowerLeg",
				Vector3.new(base.X + sx * 3.2, 1.2, base.Z + sz * 3.2),
				Vector3.new(base.X + sx * 1, LEG_TOP, base.Z + sz * 1),
				0.8,
				C.Metal
			)
		end
	end
	BuildUtil.Box(
		tower,
		"TowerPlatform",
		Vector3.new(5.5, 0.5, 5.5),
		Vector3.new(base.X, LEG_TOP + 0.25, base.Z),
		team.Secondary,
		Enum.Material.DiamondPlate
	)

	-- main light bank on top, its back resting against the mast, aimed at the field centre
	local headPosition = Vector3.new(base.X, MAST_TOP, base.Z) + toField * 1.9
	local head = CFrame.lookAt(headPosition, target)
	local plateWidth, plateHeight = floodBank(tower, head, 3, 2, Vector3.new(5.4, 4.6, 0.5), {
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

	-- a smaller bank lower down (the main bank is too high for a 60 stud light to reach the turf)
	local lowPosition = Vector3.new(base.X, LOW_BANK_Y, base.Z) + toField * 2
	floodBank(tower, CFrame.lookAt(lowPosition, target), 2, 1, Vector3.new(3.8, 3.2, 0.5), {
		{ 1, 1, 80, 3 },
	})
end

function Features.lights(ctx)
	local L = ctx.config.Layout
	local target = Vector3.new(0, 0, L.FieldCenterZ)
	local x = L.EndLowerOuterX - 17 -- 142: centre of the open corner between the stands
	local frontZ = L.FrontLowerOuterZ + 7 -- -52
	local backZ = L.BackLowerOuterZ - 7 -- 112
	lightTower(ctx, "TowerFrontWest", Vector3.new(-x, 0, frontZ), target)
	lightTower(ctx, "TowerFrontEast", Vector3.new(x, 0, frontZ), target)
	lightTower(ctx, "TowerBackWest", Vector3.new(-x, 0, backZ), target)
	lightTower(ctx, "TowerBackEast", Vector3.new(x, 0, backZ), target)
end

---------------------------------------------------------------------------------------------
-- Jumbotron (west)
---------------------------------------------------------------------------------------------

function Features.jumbotron(ctx)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local team = ctx.colors

	local centreZ = L.FieldCenterZ
	local faceX = -(L.EndLowerOuterX + 12) -- -171: the field-facing (+X) face of the housing
	local depth = 5
	local midX = faceX - depth / 2
	local width = 48 -- along Z
	local bottom, top = 20, 52
	local girderBottom = bottom - 2

	-- Supports
	for _, dz in ipairs({ -16, 16 }) do
		pylon(ctx, Vector3.new(midX, 0, centreZ + dz), girderBottom, 4, C)
	end
	BuildUtil.Box(ctx, "Girder", Vector3.new(3.5, 2, width - 4), Vector3.new(midX, girderBottom + 1, centreZ), STEEL, Enum.Material.Metal)
	BuildUtil.Box(
		ctx,
		"Catwalk",
		Vector3.new(2.4, 0.3, width),
		Vector3.new(faceX + 1.2, bottom - 0.15, centreZ),
		STEEL,
		Enum.Material.DiamondPlate
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
		Vector3.new(0.2, top - bottom - 2, width - 2),
		Vector3.new(faceX + 0.1, (bottom + top) / 2, centreZ),
		team.Secondary,
		Enum.Material.SmoothPlastic
	)

	-- The screen (unrotated part: +X is the Right face)
	screen(ctx, "Screen", Vector3.new(0.4, 27, width - 6), Vector3.new(faceX + 0.4, 36, centreZ), Enum.NormalId.Right, ctx.teamName, {
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
		Vector3.new(faceX + 0.35, bottom + 1.7, centreZ),
		team.Trim,
		Enum.Material.Neon,
		NO_COLLIDE
	)

	-- Speaker stacks hanging off both sides
	for _, side in ipairs({ -1, 1 }) do
		local z = centreZ + side * (width / 2 + 2)
		BuildUtil.Box(ctx, "Speaker", Vector3.new(4, 14, 4), Vector3.new(faceX - 2, 35, z), SPEAKER_GREY, Enum.Material.Fabric)
		for _, y in ipairs({ 31.5, 38.5 }) do
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

---------------------------------------------------------------------------------------------
-- Press box (behind the back upper deck)
---------------------------------------------------------------------------------------------

function Features.pressbox(ctx)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local team = ctx.colors

	-- Footprint X[-40, 40], Z[143, 158]. The roof covers all of it; the walls sit inside so the
	-- roof overhangs 2.5 studs on the field side (and 2 at each end).
	local deckBack = L.BackUpperOuterZ -- 143: outside wall of the upper deck (its bands reach 143.7)
	local slabFront = deckBack + 1 -- 144
	local z0 = deckBack + 2.5 -- 145.5: window wall
	local z1 = deckBack + 14 -- 157: inside of the back wall
	local roofFront = deckBack + 0.4 -- the fascia sign hangs in front of this, inside the footprint
	local halfX = 38
	local roofHalfX = 40
	local floorY = L.UpperTopHeight -- level with the top row of the upper deck
	local ceilingY = floorY + 9
	local zMid = (z0 + z1) / 2
	local slabBottom = floorY - 1.6
	local glassBottom, glassTop = floorY + 0.8, ceilingY - 1.2

	-- Supports: two stair cores with doors and two round columns (clear of GATE F at x = 0)
	for _, side in ipairs({ -1, 1 }) do
		BuildUtil.Block(
			ctx,
			"StairCore",
			Vector3.new(8, slabBottom, 10),
			Vector3.new(side * 31, 0, zMid),
			C.Concrete,
			Enum.Material.Concrete
		)
		BuildUtil.Block(
			ctx,
			"CoreDoor",
			Vector3.new(3.5, 7, 0.2),
			Vector3.new(side * 31, 0, zMid + 5.1),
			DOOR_DARK,
			Enum.Material.SmoothPlastic
		)
		BuildUtil.Cylinder(ctx, {
			Name = "Column",
			Position = Vector3.new(side * 14, slabBottom / 2, zMid),
			Height = slabBottom,
			Diameter = 2.4,
			Axis = "Y",
			Color = C.Concrete,
			Material = Enum.Material.Concrete,
		})
	end

	-- Shell
	BuildUtil.Box(
		ctx,
		"FloorSlab",
		Vector3.new(halfX * 2, 1.6, z1 + 1 - slabFront),
		Vector3.new(0, floorY - 0.8, (slabFront + z1 + 1) / 2),
		C.ConcreteDark,
		Enum.Material.Concrete
	)
	local backWall = BuildUtil.Box(
		ctx,
		"BackWall",
		Vector3.new(halfX * 2, ceilingY - floorY, 1),
		Vector3.new(0, (floorY + ceilingY) / 2, z1 + 0.5),
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	BuildUtil.SurfaceText(backWall, Enum.NormalId.Back, ctx.teamName .. " MEDIA CENTER", {
		LabelName = "MediaCenterText",
		TextColor3 = readable(team.Primary, team.Trim),
		PixelsPerStud = 8,
	})
	for _, side in ipairs({ -1, 1 }) do
		BuildUtil.Box(
			ctx,
			"SideWall",
			Vector3.new(1, ceilingY - floorY, z1 - z0),
			Vector3.new(side * (halfX - 0.5), (floorY + ceilingY) / 2, zMid),
			team.Primary,
			Enum.Material.SmoothPlastic
		)
	end

	-- Field-facing window wall
	local frontZ = z0 + 0.4
	BuildUtil.Box(
		ctx,
		"Sill",
		Vector3.new(halfX * 2 - 2, glassBottom - floorY, 0.8),
		Vector3.new(0, (floorY + glassBottom) / 2, frontZ),
		team.Secondary,
		Enum.Material.SmoothPlastic
	)
	BuildUtil.Box(
		ctx,
		"Windows",
		Vector3.new(halfX * 2 - 2, glassTop - glassBottom, 0.3),
		Vector3.new(0, (glassBottom + glassTop) / 2, frontZ),
		C.Glass,
		Enum.Material.Glass,
		{ Transparency = 0.4 }
	)
	BuildUtil.Box(
		ctx,
		"Header",
		Vector3.new(halfX * 2 - 2, ceilingY - glassTop, 0.8),
		Vector3.new(0, (glassTop + ceilingY) / 2, frontZ),
		team.Secondary,
		Enum.Material.SmoothPlastic
	)
	for _, x in ipairs({ -26, -13, 0, 13, 26 }) do
		BuildUtil.Box(
			ctx,
			"Mullion",
			Vector3.new(0.5, glassTop - glassBottom, 0.5),
			Vector3.new(x, (glassBottom + glassTop) / 2, frontZ),
			STEEL,
			Enum.Material.Metal
		)
	end

	-- Roof with an overhang toward the field and the sign on its fascia
	BuildUtil.Box(
		ctx,
		"Roof",
		Vector3.new(roofHalfX * 2, 0.8, z1 + 1 - roofFront),
		Vector3.new(0, ceilingY + 0.4, (roofFront + z1 + 1) / 2),
		C.Concrete,
		Enum.Material.Concrete
	)
	sign(
		ctx,
		"PressSign",
		Vector3.new(roofHalfX * 2, 2.4, 0.4),
		CFrame.new(0, ceilingY + 0.4, roofFront - 0.2),
		team.Primary,
		Enum.NormalId.Front,
		"PRESS BOX  |  " .. ctx.teamName .. " MEDIA",
		team.Trim,
		16
	)

	-- Inside: a long desk with monitors (seen through the glass)
	BuildUtil.Box(ctx, "Desk", Vector3.new(halfX * 2 - 4, 3, 2), Vector3.new(0, floorY + 1.5, z0 + 3), C.Wood, Enum.Material.WoodPlanks)
	for _, x in ipairs({ -24, -8, 8, 24 }) do
		BuildUtil.Box(
			ctx,
			"Monitor",
			Vector3.new(3, 2, 0.3),
			Vector3.new(x, floorY + 4, z0 + 3.4),
			SCREEN_BLACK,
			Enum.Material.SmoothPlastic
		)
	end

	-- Roof gear (behind the canopy's rear edge): broadcast dish + antenna
	local roofTop = ceilingY + 0.8
	local dishBase = Vector3.new(28, roofTop, z1 - 1.5)
	BuildUtil.Cylinder(ctx, {
		Name = "DishStand",
		Position = dishBase + Vector3.new(0, 0.8, 0),
		Height = 1.6,
		Diameter = 0.6,
		Axis = "Y",
		Color = STEEL,
		Material = Enum.Material.Metal,
	})
	local dishCentre = dishBase + Vector3.new(0, 2.6, 0)
	BuildUtil.Part(ctx, {
		Name = "Dish",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(0.4, 4, 4),
		-- cylinder axis (local X) aimed up toward the field
		CFrame = CFrame.lookAt(dishCentre, dishCentre + Vector3.new(0, 1, -1)) * CFrame.Angles(0, math.rad(90), 0),
		Color = C.Line,
		Material = Enum.Material.SmoothPlastic,
	})
	BuildUtil.Cylinder(ctx, {
		Name = "Antenna",
		Position = Vector3.new(-28, roofTop + 3.5, z1 - 1.5),
		Height = 7,
		Diameter = 0.3,
		Axis = "Y",
		Color = C.Metal,
		Material = Enum.Material.Metal,
	})
end

---------------------------------------------------------------------------------------------
-- Luxury suites (behind the front upper deck)
---------------------------------------------------------------------------------------------

-- distances from the centre line; clear of the plaza gates at |x| = 41 and 93
local SUITE_COLUMNS = { 20, 55, 79, 117 }

function Features.suites(ctx)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local team = ctx.colors

	local zFront = L.FrontUpperOuterZ - 0.5 -- -83.5: just clear of the upper deck's outside wall
	local zBack = L.FrontUpperOuterZ - 12.6 -- -95.6 (the plaza sign + roof edge stay inside z >= -96)
	local inner = L.TunnelHalfWidth + 2 -- 16
	local outer = L.SidelineStandsHalfLength -- 120
	local floorY = L.UpperTopHeight - 1 -- 25: the glass looks out over the top row
	local ceilingY = floorY + 9
	local length = outer - inner
	local depth = zFront - zBack
	local zMid = (zFront + zBack) / 2
	local slabBottom = floorY - 1.6
	local glassBottom, glassTop = floorY + 0.8, ceilingY - 2

	for _, side in ipairs({ -1, 1 }) do
		local section = BuildUtil.Child(ctx, side < 0 and "WestSuites" or "EastSuites")
		local cx = side * (inner + outer) / 2

		for _, x in ipairs(SUITE_COLUMNS) do
			BuildUtil.Cylinder(section, {
				Name = "SuiteColumn",
				Position = Vector3.new(side * x, slabBottom / 2, zBack + 3),
				Height = slabBottom,
				Diameter = 2.4,
				Axis = "Y",
				Color = C.Concrete,
				Material = Enum.Material.Concrete,
			})
		end

		-- Shell
		BuildUtil.Box(
			section,
			"SuiteSlab",
			Vector3.new(length, 1.6, depth),
			Vector3.new(cx, floorY - 0.8, zMid),
			team.Primary,
			Enum.Material.SmoothPlastic
		)
		BuildUtil.Box(
			section,
			"SuiteBackWall",
			Vector3.new(length, ceilingY - floorY, 0.8),
			Vector3.new(cx, (floorY + ceilingY) / 2, zBack + 0.4),
			C.Concrete,
			Enum.Material.Concrete
		)
		sign(
			section,
			"SuiteBackSign",
			Vector3.new(34, 3.2, 0.3),
			-- centred between the canopy masts at |x| = 28 and 67 so they never hide it
			CFrame.new(side * 47.5, floorY + 5, zBack - 0.15),
			team.Primary,
			Enum.NormalId.Front,
			"LUXURY SUITES",
			team.Trim,
			16
		)
		for _, x in ipairs({ inner + 0.4, outer - 0.4 }) do
			BuildUtil.Box(
				section,
				"SuiteEndWall",
				-- 0.1 proud of the window wall so the sill/header ends don't z-fight with it
				Vector3.new(0.8, ceilingY - floorY, depth + 0.1),
				Vector3.new(side * x, (floorY + ceilingY) / 2, zMid + 0.05),
				team.Primary,
				Enum.Material.SmoothPlastic
			)
		end
		BuildUtil.Box(
			section,
			"SuiteRoof",
			Vector3.new(length, 0.8, depth + 0.5),
			Vector3.new(cx, ceilingY + 0.4, zMid + 0.05),
			C.Concrete,
			Enum.Material.Concrete
		)

		-- Field-facing glass wall
		local frontZ = zFront - 0.3
		BuildUtil.Box(
			section,
			"SuiteSill",
			Vector3.new(length, glassBottom - floorY, 0.6),
			Vector3.new(cx, (floorY + glassBottom) / 2, frontZ),
			team.Secondary,
			Enum.Material.SmoothPlastic
		)
		BuildUtil.Box(
			section,
			"SuiteGlass",
			Vector3.new(length - 1.6, glassTop - glassBottom, 0.3),
			Vector3.new(cx, (glassBottom + glassTop) / 2, frontZ),
			C.Glass,
			Enum.Material.Glass,
			{ Transparency = 0.35 }
		)
		sign(
			section,
			"SuiteHeader",
			Vector3.new(length, ceilingY - glassTop, 0.6),
			CFrame.new(cx, (glassTop + ceilingY) / 2, frontZ),
			team.Secondary,
			Enum.NormalId.Back,
			ctx.teamName .. " CLUB SUITES",
			team.Primary,
			16
		)

		-- Interior: suite dividers, a drink rail, a row of padded seats and a ceiling light
		local inside = depth - 2.4 -- small gaps to the back wall and the glass (no coplanar faces)
		for k = 1, 7 do
			BuildUtil.Box(
				section,
				"SuiteDivider",
				Vector3.new(0.4, ceilingY - floorY - 0.1, inside),
				Vector3.new(side * (inner + 13 * k), (floorY + ceilingY - 0.1) / 2, zBack + 0.9 + inside / 2),
				team.Trim,
				Enum.Material.SmoothPlastic
			)
		end
		BuildUtil.Box(
			section,
			"DrinkRail",
			Vector3.new(length - 2, 0.3, 1),
			Vector3.new(cx, floorY + 3.2, zFront - 1.2),
			C.Wood,
			Enum.Material.WoodPlanks
		)
		BuildUtil.Box(
			section,
			"SuiteSeats",
			Vector3.new(length - 2, 1.6, 1.4),
			Vector3.new(cx, floorY + 0.8, zFront - 3.2),
			team.Primary,
			Enum.Material.Fabric
		)
		BuildUtil.Box(
			section,
			"CeilingLight",
			Vector3.new(length - 2, 0.2, 1.2),
			Vector3.new(cx, ceilingY - 0.1, zMid),
			WARM_WHITE,
			Enum.Material.Neon,
			{ CanCollide = false, CastShadow = false }
		)
	end
end

---------------------------------------------------------------------------------------------
-- Canopy roofs over the sideline upper decks
---------------------------------------------------------------------------------------------

local FIN_HEIGHT = 5
local GLASS_DEPTH = 10

--[[
	One cantilevered roof. Built in "roof space": a frame at the rear edge (x = 0) looking at the
	leading edge, so local -Z runs toward the field and the panel rises slightly toward it.
	spec:
	  rear, front   plot-local points (x = 0) on the panel's centre line at the rear / leading edge
	  halfWidth     half the roof length along X
	  masts         world X of the masts at the rear edge
	  fins          roof-space X of the tapered fins on top of the panel (symmetric lists)
	  braceY        optional: height on the masts where knee braces start (to the panel underside)
	  text          sign on the leading-edge fascia (faces the field)
]]
local function canopyRoof(ctx, spec)
	local C = ctx.config.Colors
	local team = ctx.colors
	local frame = CFrame.lookAt(spec.rear, spec.front)
	local length = (spec.front - spec.rear).Magnitude
	local width = spec.halfWidth * 2
	local metalLength = length - GLASS_DEPTH
	local function at(x, y, d)
		return frame * CFrame.new(x, y, -d)
	end

	-- Panels: metal over the seats, translucent glass along the leading edge
	BuildUtil.Part(ctx, {
		Name = "RoofPanel",
		Size = Vector3.new(width, 0.6, metalLength),
		CFrame = at(0, 0, metalLength / 2),
		Color = ROOF_WHITE,
		Material = Enum.Material.Metal,
	})
	BuildUtil.Part(ctx, {
		Name = "RoofGlass",
		Size = Vector3.new(width, 0.4, GLASS_DEPTH),
		CFrame = at(0, 0, metalLength + GLASS_DEPTH / 2),
		Color = C.Glass,
		Material = Enum.Material.Glass,
		Transparency = 0.45,
	})

	-- Leading edge: team fascia, centre sign and a light strip underneath
	BuildUtil.Part(ctx, {
		Name = "Fascia",
		Size = Vector3.new(width + 1, 2.6, 0.5),
		CFrame = at(0, -0.7, length + 0.25),
		Color = team.Primary,
		Material = Enum.Material.SmoothPlastic,
	})
	sign(
		ctx,
		"CanopySign",
		Vector3.new(80, 2.2, 0.2),
		at(0, -0.7, length + 0.6),
		team.Secondary,
		Enum.NormalId.Front,
		spec.text,
		team.Primary,
		16
	)
	BuildUtil.Part(ctx, {
		Name = "CanopyLightStrip",
		Size = Vector3.new(width - 4, 0.25, 0.8),
		CFrame = at(0, -0.35, length - 1.5),
		Color = WARM_WHITE,
		Material = Enum.Material.Neon,
		CanCollide = false,
		CastShadow = false,
	})

	-- Structure: rear spine beam, tapered fins on top, masts down to the ground
	BuildUtil.Part(ctx, {
		Name = "Spine",
		Size = Vector3.new(width, 2.2, 2.2),
		CFrame = at(0, -1.4, 1.1),
		Color = STEEL,
		Material = Enum.Material.Metal,
	})
	for _, x in ipairs(spec.fins) do
		-- wedge: tall face at local +Z (the rear), slope runs down toward the field
		BuildUtil.Wedge(ctx, {
			Name = "Fin",
			Size = Vector3.new(1.2, FIN_HEIGHT, metalLength),
			CFrame = at(x, 0.3 + FIN_HEIGHT / 2, metalLength / 2),
			Color = team.Primary,
			Material = Enum.Material.SmoothPlastic,
		})
	end
	local mastTop = at(0, -2.5, 1.1).Position
	for _, x in ipairs(spec.masts) do
		local foot = Vector3.new(x, 0, mastTop.Z)
		BuildUtil.Block(ctx, "MastFooting", Vector3.new(3, 0.6, 3), foot, C.ConcreteDark, Enum.Material.Concrete)
		BuildUtil.Block(ctx, "Mast", Vector3.new(2.2, mastTop.Y + 0.6, 2.2), foot, STEEL, Enum.Material.Metal)
		if spec.braceY then
			local reach = at(0, -0.3, spec.braceDistance).Position
			strut(ctx, "KneeBrace", Vector3.new(x, spec.braceY, mastTop.Z), Vector3.new(x, reach.Y, reach.Z), 1.2, STEEL)
		end
	end
end

function Features.canopy(ctx)
	local L = ctx.config.Layout
	local name = ctx.teamName
	local halfWidth = L.SidelineStandsHalfLength + 5

	-- Back (home) roof: masts behind the upper deck, clear of the press box (|x| <= 40),
	-- the concourse gates (x = +-80) and the flags on the deck (x = +-70, +-110)
	local backCtx = BuildUtil.Child(ctx, "BackRoof")
	canopyRoof(backCtx, {
		rear = Vector3.new(0, 40, L.BackUpperOuterZ + 7),
		front = Vector3.new(0, 44, L.BackLowerOuterZ - 14),
		halfWidth = halfWidth,
		masts = { -100, -55, 55, 100 },
		fins = { -124, -100, -55, 0, 55, 100, 124 },
		braceY = 24,
		braceDistance = 22,
		text = "HOME OF THE " .. name,
	})

	-- Front (visitor) roof: masts in the plaza just behind the suites, clear of the walkway,
	-- the plaza gates (x = +-41, +-93) and the parking lot (x <= -100)
	local frontCtx = BuildUtil.Child(ctx, "FrontRoof")
	canopyRoof(frontCtx, {
		rear = Vector3.new(0, 37.5, L.FrontUpperOuterZ - 16),
		front = Vector3.new(0, 42, L.FrontLowerOuterZ + 1),
		halfWidth = halfWidth,
		masts = { -98.5, -67, -28, 28, 67, 98.5 },
		fins = { -124, -98.5, -67, -28, 0, 28, 67, 98.5, 124 },
		text = "GO " .. name .. "!",
	})
end

return Features
