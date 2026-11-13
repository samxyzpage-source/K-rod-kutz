--[[
	HallOfFame
	The team Hall of Fame & Museum on the campus, east of the Team HQ, in
	Config.Layout.Zones.hall_of_fame (X[120, 270] Z[200, 320], max height 40). The entrance faces
	the campus road (-Z); the buy button (195, 193) stays clear on the pavement in front of it.

	A classical museum on a marble podium. Its centre line (x = 195) runs from the road up the
	front steps, through the 14-wide doorway, down the nave to the Ring of Honor on the back wall.
	Inside: a nave between two rows of columns and a gallery on each side.

	Steps (Items.lua):
	  1 Building        podium + front steps, limestone walls with marble pilasters and tall dark
	                    windows, "<TEAM> HALL OF FAME" carved in the frieze, a pediment with a team
	                    medallion and a copper gable roof behind it, a rotunda topped by a giant football standing on end (laces
	                    facing the road), nave columns, ceiling lights and a team medallion in the
	                    floor under the dome
	  2 Trophy Cases    four lit glass display cases in the galleries: championship trophies,
	                    game balls, championship rings and MVP awards
	  3 Jersey Wall     the Ring of Honor on the back wall: ten framed home/away jerseys with
	                    numbers and names under a lit header
	  4 Player Statues  four bronze players on marble plinths lining the nave (QB throwing,
	                    receiver catch, running back stiff-arm, trophy pose)
	  5 Gold Entrance   a gold colonnade + canopy carrying the glowing HALL OF FAME sign, a gold
	                    door frame with the gold doors standing open, a red carpet from the road to
	                    the Ring of Honor, velvet rope lines and team banners on the facade

	Small footballs (game balls, trophy tops, the statues' balls) are single ball parts stretched
	into an ellipsoid by a sphere SpecialMesh, so the offline previews draw them as round balls.
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)

local HallOfFame = {}

---------------------------------------------------------------------------------------------
-- Layout (plot-local studs)
---------------------------------------------------------------------------------------------

local CX = 195 -- centre line: button, carpet, doorway, dome, Ring of Honor
local OUTER = { MinX = 145, MaxX = 245, MinZ = 226, MaxZ = 306 } -- outer faces of the walls
local WALL_T = 2
local INNER = { MinX = OUTER.MinX + WALL_T, MaxX = OUTER.MaxX - WALL_T, MinZ = OUTER.MinZ + WALL_T, MaxZ = OUTER.MaxZ - WALL_T }
local PODIUM = { MinX = 143, MaxX = 247, MinZ = 215, MaxZ = 308 }
local STAIRS = { MinX = 167, MaxX = 223, Front = 207 } -- two steps up to the podium
local FLOOR = 1.2 -- podium top = museum floor
local WALL_TOP = 22
local ATTIC_TOP = 25.5
local CORNICE_TOP = 26.5
local DOOR_MIN_X, DOOR_MAX_X = CX - 7, CX + 7
local DOOR_TOP = FLOOR + 16
local DOME_Z = 266
local MEDALLION_D = 14 -- floor medallion under the dome

local PILASTER_X = { 150, 166, 182, 208, 224, 240 }
local FRONT_WINDOW_X = { 158, 174, 216, 232 }
local SIDE_WINDOW_Z = { 246, 266, 286 }
local NAVE_COLUMN_X = { 181, 209 }
local NAVE_COLUMN_Z = { 242, 266, 290 }
local GALLERY_X = { 164, 226 } -- centre lines of the west / east galleries (cases + lights)
local CASE_Z = { 248, 284 }
local CASE_BASE_H = 3

local GOLD_COLUMN_X = { 176, 184, 206, 214 }
local COLONNADE_Z = 219
local CARPET_HALF = 4

local PAINT = { CanCollide = false, CastShadow = false }
local GOLD_SHINE = { Reflectance = 0.25 }
local BRONZE_SHINE = { Reflectance = 0.08 }

local WHITE = Color3.fromRGB(248, 248, 248)
local INK = Color3.fromRGB(22, 22, 26)
local LIMESTONE = Color3.fromRGB(224, 214, 194)
local MARBLE = Color3.fromRGB(240, 238, 232)
local STEP_STONE = Color3.fromRGB(212, 208, 200)
local CORNICE_STONE = Color3.fromRGB(236, 230, 216)
local COPPER_ROOF = Color3.fromRGB(82, 136, 118)
local PLINTH_STONE = Color3.fromRGB(46, 46, 52)
local CARVED = Color3.fromRGB(84, 64, 42)
local WINDOW_GLASS = Color3.fromRGB(50, 72, 98)
local LEATHER = Color3.fromRGB(124, 66, 36)
local LAMP = Color3.fromRGB(255, 248, 232)
local WARM_LIGHT = Color3.fromRGB(255, 236, 200)
local CASE_GLASS = Color3.fromRGB(205, 232, 248)
local CUSHION = Color3.fromRGB(30, 30, 36)
local BRONZE = Color3.fromRGB(163, 108, 58)
local BRONZE_DARK = Color3.fromRGB(92, 60, 32)
local CARPET_RED = Color3.fromRGB(178, 20, 34)
local VELVET_RED = Color3.fromRGB(140, 14, 28)
local SIGN_DARK = Color3.fromRGB(30, 24, 18)
local GLOW_GOLD = Color3.fromRGB(255, 214, 90)

local JERSEYS = {
	{ "7", "CARTER" },
	{ "12", "HAYES" },
	{ "21", "BROOKS" },
	{ "34", "WALKER" },
	{ "56", "REED" },
	{ "80", "MORGAN" },
	{ "88", "PRICE" },
	{ "92", "TURNER" },
	{ "10", "BENNETT" },
	{ "25", "COLE" },
}

---------------------------------------------------------------------------------------------
-- Helpers
---------------------------------------------------------------------------------------------

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

local function contrastRatio(a, b)
	local la, lb = luminance(a), luminance(b)
	if la < lb then
		la, lb = lb, la
	end
	return (la + 0.05) / (lb + 0.05)
end

-- First candidate that reads well on `background`, else whichever of white / ink reads best.
local function textColorOn(background, candidates)
	for _, candidate in ipairs(candidates) do
		if contrastRatio(background, candidate) >= 3 then
			return candidate
		end
	end
	if contrastRatio(background, WHITE) >= contrastRatio(background, INK) then
		return WHITE
	end
	return INK
end

local function shade(color, factor)
	return Color3.new(math.clamp(color.R * factor, 0, 1), math.clamp(color.G * factor, 0, 1), math.clamp(color.B * factor, 0, 1))
end

--[[
	Writes `text` on each face in `faces` of `part`, coloured to read well on `background`.
	opts: TextColor3, Font, PixelsPerStud, LightInfluence, Wrap, InsetX / InsetY (fraction of the
	      face left empty around the text, default 0.06 / 0.12), Rect = { x, y, w, h } (fractions;
	      overrides the insets)
]]
local function sign(part, faces, text, background, team, opts)
	opts = opts or {}
	local color = opts.TextColor3 or textColorOn(background, { team.Trim, team.Primary, team.Secondary })
	local insetX = opts.InsetX or 0.06
	local insetY = opts.InsetY or 0.12
	local rect = opts.Rect or { insetX, insetY, 1 - 2 * insetX, 1 - 2 * insetY }
	for _, face in ipairs(faces) do
		local _, label = BuildUtil.SurfaceText(part, face, text, {
			LabelName = part.Name .. face.Name,
			TextColor3 = color,
			Font = opts.Font or Enum.Font.GothamBlack,
			PixelsPerStud = opts.PixelsPerStud or 20,
			LightInfluence = opts.LightInfluence,
		})
		label.Position = UDim2.new(rect[1], 0, rect[2], 0)
		label.Size = UDim2.new(rect[3], 0, rect[4], 0)
		if opts.Wrap then
			label.TextWrapped = true
		end
	end
end

-- Axis-aligned block between two corners (plot-local).
local function slab(ctx, name, x0, x1, y0, y1, z0, z1, color, material, extra)
	return BuildUtil.Box(
		ctx,
		name,
		Vector3.new(x1 - x0, y1 - y0, z1 - z0),
		Vector3.new((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
		color,
		material,
		extra
	)
end

-- Block with a local CFrame (centre).
local function block(ctx, name, size, cframe, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Size = size
	props.CFrame = cframe
	props.Color = color
	props.Material = material
	return BuildUtil.Part(ctx, props)
end

local function cyl(ctx, name, position, height, diameter, axis, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Position = position
	props.Height = height
	props.Diameter = diameter
	props.Axis = axis
	props.Color = color
	props.Material = material
	return BuildUtil.Cylinder(ctx, props)
end

local function ball(ctx, name, cframe, diameter, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.CFrame = cframe
	props.Diameter = diameter
	props.Color = color
	props.Material = material
	return BuildUtil.Ball(ctx, props)
end

-- A football: one ball part shown as an ellipsoid (a sphere mesh stretched along the local X axis
-- of `cframe`). The offline previews draw it as a plain ball.
local function football(ctx, name, cframe, length, diameter, color, material, extra)
	local part = ball(ctx, name, cframe, diameter, color, material, extra)
	local mesh = Instance.new("SpecialMesh")
	mesh.Name = "FootballShape"
	mesh.MeshType = Enum.MeshType.Sphere
	mesh.Scale = Vector3.new(length / diameter, 1, 1)
	mesh.Parent = part
	return part
end

---------------------------------------------------------------------------------------------
-- Step 1: the building
---------------------------------------------------------------------------------------------

-- The rotunda on the roof: a drum carrying a giant football standing on end, laces to the road.
local function footballDome(ctx)
	local dome = BuildUtil.Child(ctx, "Rotunda")
	local s = 1.8 -- football scale (11 studs long, 6.4 thick at scale 1)
	local yc = 29.9 -- centre of the (buried) football; its tip ends just under the 40-stud limit
	local radius = 3.2 * s
	cyl(dome, "RoofDrum", Vector3.new(CX, CORNICE_TOP + 1, DOME_Z), 2, 16, "Y", CORNICE_STONE, Enum.Material.Marble)
	cyl(
		dome,
		"RoofDomeBody",
		Vector3.new(CX, (28.4 + yc + 1.5 * s) / 2, DOME_Z),
		yc + 1.5 * s - 28.4,
		2 * radius,
		"Y",
		LEATHER,
		Enum.Material.Leather
	)
	for _, tip in ipairs({ { 1.5, 6.4 }, { 3.0, 4.6 }, { 4.2, 2.6 } }) do
		ball(dome, "RoofDomeTip", CFrame.new(CX, yc + tip[1] * s, DOME_Z), tip[2] * s, LEATHER, Enum.Material.Leather)
	end
	cyl(dome, "RoofDomeStripe", Vector3.new(CX, yc + 3.2 * s, DOME_Z), 0.45 * s, 10.4, "Y", WHITE, Enum.Material.SmoothPlastic)
	-- laces down the road-facing side
	local laceZ = DOME_Z - radius - 0.05
	slab(dome, "RoofDomeLace", CX - 0.3, CX + 0.3, 28.8, 33.8, laceZ - 0.25, laceZ + 0.25, WHITE, Enum.Material.SmoothPlastic)
	for _, y in ipairs({ 30.2, 32.2 }) do
		slab(dome, "RoofDomeStitch", CX - 1.1, CX + 1.1, y - 0.18, y + 0.18, laceZ - 0.25, laceZ + 0.25, WHITE, Enum.Material.SmoothPlastic)
	end
end

local function buildBuilding(ctx)
	local team = ctx.colors
	local teamName = ctx.teamName or ""
	BuildUtil.Stage(ctx, 1)
	local b = BuildUtil.Child(ctx, "Building")

	-- marble podium (= the museum floor) and two wide steps up from the road side
	slab(b, "Podium", PODIUM.MinX, PODIUM.MaxX, 0, FLOOR, PODIUM.MinZ, PODIUM.MaxZ, MARBLE, Enum.Material.Marble)
	local stepDepth = (PODIUM.MinZ - STAIRS.Front) / 2
	for i = 1, 2 do
		local z0 = STAIRS.Front + (i - 1) * stepDepth
		slab(b, "FrontStep", STAIRS.MinX, STAIRS.MaxX, 0, i * 0.4, z0, z0 + stepDepth, STEP_STONE, Enum.Material.Marble)
	end

	-- limestone walls: the side walls run the full depth, the front wall has the big doorway
	local stone = Enum.Material.Limestone
	slab(b, "WestWall", OUTER.MinX, INNER.MinX, FLOOR, WALL_TOP, OUTER.MinZ, OUTER.MaxZ, LIMESTONE, stone)
	slab(b, "EastWall", INNER.MaxX, OUTER.MaxX, FLOOR, WALL_TOP, OUTER.MinZ, OUTER.MaxZ, LIMESTONE, stone)
	slab(b, "BackWall", INNER.MinX, INNER.MaxX, FLOOR, WALL_TOP, INNER.MaxZ, OUTER.MaxZ, LIMESTONE, stone)
	slab(b, "FrontWall", INNER.MinX, DOOR_MIN_X, FLOOR, WALL_TOP, OUTER.MinZ, INNER.MinZ, LIMESTONE, stone)
	slab(b, "FrontWall", DOOR_MAX_X, INNER.MaxX, FLOOR, WALL_TOP, OUTER.MinZ, INNER.MinZ, LIMESTONE, stone)
	slab(b, "DoorLintel", DOOR_MIN_X, DOOR_MAX_X, DOOR_TOP, WALL_TOP, OUTER.MinZ, INNER.MinZ, LIMESTONE, stone)

	-- tall dark windows: one glass block through the wall shows on both faces
	local windowExtra = { Reflectance = 0.2 }
	for _, x in ipairs(FRONT_WINDOW_X) do
		slab(b, "Window", x - 3, x + 3, 5, 17, OUTER.MinZ - 0.1, INNER.MinZ + 0.1, WINDOW_GLASS, Enum.Material.Glass, windowExtra)
	end
	for _, z in ipairs(SIDE_WINDOW_Z) do
		slab(b, "Window", OUTER.MinX - 0.1, INNER.MinX + 0.1, 5, 17, z - 3, z + 3, WINDOW_GLASS, Enum.Material.Glass, windowExtra)
		slab(b, "Window", INNER.MaxX - 0.1, OUTER.MaxX + 0.1, 5, 17, z - 3, z + 3, WINDOW_GLASS, Enum.Material.Glass, windowExtra)
	end
	-- marble pilasters on the facade
	for _, x in ipairs(PILASTER_X) do
		slab(b, "Pilaster", x - 1.2, x + 1.2, FLOOR, WALL_TOP, OUTER.MinZ - 0.8, OUTER.MinZ, MARBLE, Enum.Material.Marble)
	end

	-- frieze (the attic, with the carved name), cornice and the pediment over the entrance
	local attic =
		slab(b, "RoofAttic", OUTER.MinX - 0.5, OUTER.MaxX + 0.5, WALL_TOP, ATTIC_TOP, OUTER.MinZ - 0.5, OUTER.MaxZ + 0.5, LIMESTONE, stone)
	local frieze = teamName ~= "" and (teamName .. " HALL OF FAME") or "HALL OF FAME"
	sign(attic, { Enum.NormalId.Front }, frieze, LIMESTONE, team, {
		TextColor3 = CARVED,
		Font = Enum.Font.Garamond,
		PixelsPerStud = 12,
		Rect = { 0.12, 0.08, 0.76, 0.84 },
	})
	slab(
		b,
		"RoofCornice",
		OUTER.MinX - 1.5,
		OUTER.MaxX + 1.5,
		ATTIC_TOP,
		CORNICE_TOP,
		OUTER.MinZ - 1.5,
		OUTER.MaxZ + 1.5,
		CORNICE_STONE,
		Enum.Material.Marble
	)
	slab(
		b,
		"Roof",
		OUTER.MinX + 1,
		OUTER.MaxX - 1,
		CORNICE_TOP,
		CORNICE_TOP + 0.3,
		OUTER.MinZ + 2,
		OUTER.MaxZ - 1,
		COPPER_ROOF,
		Enum.Material.Slate
	)
	local pedimentZ = OUTER.MinZ - 1 -- front face; the cornice edge sits 0.5 further out
	local gableBackZ = pedimentZ + 23 -- the copper gable roof behind the pediment ends here
	for _, s in ipairs({ -1, 1 }) do
		-- each half slopes down away from the centre line (wedge slope = local -Z); the stone
		-- pediment in front and a copper gable roof behind it share the same profile
		local turn = CFrame.Angles(0, -s * math.pi / 2, 0)
		BuildUtil.Wedge(b, {
			Name = "Pediment",
			Size = Vector3.new(3, 6, 22),
			CFrame = CFrame.new(CX + s * 11, CORNICE_TOP + 3, pedimentZ + 1.5) * turn,
			Color = LIMESTONE,
			Material = stone,
		})
		BuildUtil.Wedge(b, {
			Name = "RoofGable",
			Size = Vector3.new(gableBackZ - pedimentZ - 3, 6, 22),
			CFrame = CFrame.new(CX + s * 11, CORNICE_TOP + 3, (pedimentZ + 3 + gableBackZ) / 2) * turn,
			Color = COPPER_ROOF,
			Material = Enum.Material.Slate,
		})
	end
	cyl(
		b,
		"PedimentMedallion",
		Vector3.new(CX, CORNICE_TOP + 2.2, pedimentZ - 0.15),
		0.3,
		3.8,
		"Z",
		ctx.config.Colors.Gold,
		Enum.Material.Metal,
		GOLD_SHINE
	)
	cyl(
		b,
		"PedimentMedallionCentre",
		Vector3.new(CX, CORNICE_TOP + 2.2, pedimentZ - 0.3),
		0.3,
		2.6,
		"Z",
		team.Primary,
		Enum.Material.SmoothPlastic
	)

	footballDome(b)

	-- inside: two rows of marble columns frame the nave
	for _, x in ipairs(NAVE_COLUMN_X) do
		for _, z in ipairs(NAVE_COLUMN_Z) do
			cyl(b, "NaveColumn", Vector3.new(x, (FLOOR + WALL_TOP) / 2, z), WALL_TOP - FLOOR, 2.6, "Y", MARBLE, Enum.Material.Marble)
		end
	end
	-- light panels over the galleries and a glowing oculus under the dome
	for _, x in ipairs(GALLERY_X) do
		local panel = slab(b, "CeilingLight", x - 1.5, x + 1.5, WALL_TOP - 0.2, WALL_TOP, 236, 296, LAMP, Enum.Material.Neon, PAINT)
		BuildUtil.Light(panel, "PointLight", { Name = "GalleryLight", Range = 60, Brightness = 1.2, Color = WARM_LIGHT })
	end
	local oculus = cyl(b, "CeilingOculus", Vector3.new(CX, WALL_TOP - 0.1, DOME_Z), 0.2, 12, "Y", LAMP, Enum.Material.Neon, PAINT)
	BuildUtil.Light(oculus, "PointLight", { Name = "NaveLight", Range = 50, Brightness = 1.3, Color = WARM_LIGHT })

	-- team medallion in the floor under the dome (reads from the doorway)
	-- (paint layers 0.05 apart: ring top FLOOR + 0.05, disc top FLOOR + 0.1, text carrier above)
	cyl(
		b,
		"FloorMedallionRing",
		Vector3.new(CX, FLOOR + 0.025, DOME_Z),
		0.05,
		MEDALLION_D,
		"Y",
		team.Secondary,
		Enum.Material.Marble,
		PAINT
	)
	cyl(b, "FloorMedallion", Vector3.new(CX, FLOOR + 0.05, DOME_Z), 0.1, MEDALLION_D - 2, "Y", team.Primary, Enum.Material.Marble, PAINT)
	local medallionText = BuildUtil.Part(b, {
		Name = "FloorMedallionName",
		Size = Vector3.new(MEDALLION_D - 4, 0.02, 3),
		CFrame = CFrame.new(CX, FLOOR + 0.14, DOME_Z) * CFrame.Angles(0, math.pi, 0),
		Transparency = 1,
		CanCollide = false,
		CastShadow = false,
	})
	sign(medallionText, { Enum.NormalId.Top }, teamName ~= "" and teamName or "HALL OF FAME", team.Primary, team, {
		InsetX = 0.02,
		InsetY = 0.05,
		PixelsPerStud = 12,
	})
end

---------------------------------------------------------------------------------------------
-- Step 2: trophy cases
---------------------------------------------------------------------------------------------

-- A lit glass case standing in a gallery, 6 wide (x) and 16 long (z); its label faces both ways.
local function displayCase(ctx, name, cx, cz, label, fill)
	local team = ctx.colors
	local C = ctx.config.Colors
	local case = BuildUtil.Child(ctx, name)
	local top = FLOOR + CASE_BASE_H
	local base = slab(case, "CaseBase", cx - 3, cx + 3, FLOOR, top, cz - 8, cz + 8, team.Primary, Enum.Material.Fabric)
	sign(base, { Enum.NormalId.Left, Enum.NormalId.Right }, label, team.Primary, team, {
		TextColor3 = textColorOn(team.Primary, { C.Gold, team.Trim }),
		InsetX = 0.08,
		InsetY = 0.22,
	})
	slab(
		case,
		"CaseGlass",
		cx - 2.9,
		cx + 2.9,
		top + 0.02,
		top + 5.3,
		cz - 7.9,
		cz + 7.9,
		CASE_GLASS,
		Enum.Material.Glass,
		{ Transparency = 0.72 }
	)
	local lamp = slab(case, "CaseLamp", cx - 3.1, cx + 3.1, top + 5.32, top + 5.9, cz - 8.1, cz + 8.1, LAMP, Enum.Material.Neon)
	BuildUtil.Light(lamp, "PointLight", { Name = "CaseLight", Range = 14, Brightness = 1.6, Color = WARM_LIGHT })
	fill(case, cx, cz, top)
end

local function buildTrophyCases(ctx)
	local C = ctx.config.Colors
	local team = ctx.colors
	local gold, metal = C.Gold, Enum.Material.Metal
	BuildUtil.Stage(ctx, 2)
	local cases = BuildUtil.Child(ctx, "TrophyCases")

	-- West gallery, front: a big championship cup between two football-topped trophies
	displayCase(cases, "ChampionshipCase", GALLERY_X[1], CASE_Z[1], "CHAMPIONSHIPS", function(c, cx, cz, top)
		-- the cup: a round bowl whose upper half hides in a rim of the same width
		cyl(c, "CupStem", Vector3.new(cx, top + 0.9, cz), 1.8, 0.9, "Y", gold, metal, GOLD_SHINE)
		ball(c, "CupBowl", CFrame.new(cx, top + 3.2, cz), 3.2, gold, metal, GOLD_SHINE)
		cyl(c, "CupRim", Vector3.new(cx, top + 4, cz), 1.6, 3.2, "Y", gold, metal, GOLD_SHINE)
		for _, dz in ipairs({ -5.2, 5.2 }) do
			cyl(c, "TrophyStem", Vector3.new(cx, top + 1.5, cz + dz), 3, 0.6, "Y", gold, metal, GOLD_SHINE)
			local tilt = CFrame.new(cx, top + 3.5, cz + dz) * CFrame.Angles(0, math.pi / 2, math.rad(30))
			football(c, "TrophyBall", tilt, 2.4, 1.4, gold, metal, GOLD_SHINE)
		end
	end)

	-- East gallery, front: game balls (a golden one in the middle)
	displayCase(cases, "GameBallCase", GALLERY_X[2], CASE_Z[1], "GAME BALLS", function(c, cx, cz, top)
		for i, dz in ipairs({ -5, 0, 5 }) do
			local golden = i == 2
			local along = CFrame.new(cx, top + 0.9, cz + dz) * CFrame.Angles(0, math.pi / 2, 0)
			if golden then
				football(c, "GoldenBall", along, 3, 1.8, gold, metal, GOLD_SHINE)
			else
				football(c, "GameBall", along, 3, 1.8, LEATHER, Enum.Material.Leather)
				slab(
					c,
					"GameBallLaces",
					cx - 0.12,
					cx + 0.12,
					top + 1.72,
					top + 1.88,
					cz + dz - 0.6,
					cz + dz + 0.6,
					WHITE,
					Enum.Material.SmoothPlastic
				)
			end
		end
	end)

	-- West gallery, back: championship rings on a black cushion
	displayCase(cases, "RingCase", GALLERY_X[1], CASE_Z[2], "CHAMPIONSHIP RINGS", function(c, cx, cz, top)
		slab(c, "RingCushion", cx - 0.9, cx + 0.9, top, top + 0.7, cz - 6.5, cz + 6.5, CUSHION, Enum.Material.Fabric)
		for _, dz in ipairs({ -4.5, 0, 4.5 }) do
			local ringY = top + 0.7 + 1.25
			cyl(c, "Ring", Vector3.new(cx, ringY, cz + dz), 0.6, 2.5, "X", gold, metal, GOLD_SHINE)
			ball(c, "RingGem", CFrame.new(cx, ringY + 1.3, cz + dz), 1.1, team.Secondary, Enum.Material.Neon)
		end
	end)

	-- East gallery, back: a gold helmet between two MVP plaques
	displayCase(cases, "AwardCase", GALLERY_X[2], CASE_Z[2], "MVP AWARDS", function(c, cx, cz, top)
		ball(c, "GoldHelmet", CFrame.new(cx, top + 1.5, cz), 3, gold, metal, GOLD_SHINE)
		-- the face mask looks toward the nave (-X)
		slab(c, "GoldHelmetMask", cx - 1.6, cx - 1.15, top + 0.5, top + 1.6, cz - 0.85, cz + 0.85, gold, metal, GOLD_SHINE)
		for i, dz in ipairs({ -5, 5 }) do
			slab(c, "PlaqueStand", cx - 0.5, cx + 0.5, top, top + 0.4, cz + dz - 1.2, cz + dz + 1.2, CUSHION, Enum.Material.Wood)
			local plaque =
				slab(c, "Plaque", cx - 0.12, cx + 0.12, top + 0.4, top + 3, cz + dz - 1.1, cz + dz + 1.1, gold, metal, GOLD_SHINE)
			sign(plaque, { Enum.NormalId.Left, Enum.NormalId.Right }, i == 1 and "MVP" or "ALL\nPRO", gold, team, {
				TextColor3 = INK,
				InsetX = 0.12,
				InsetY = 0.18,
			})
		end
	end)
end

---------------------------------------------------------------------------------------------
-- Step 3: the jersey wall (Ring of Honor on the back wall, facing the doorway)
---------------------------------------------------------------------------------------------

local function buildJerseyWall(ctx)
	local C = ctx.config.Colors
	local team = ctx.colors
	local teamName = ctx.teamName or ""
	BuildUtil.Stage(ctx, 3)
	local wall = BuildUtil.Child(ctx, "JerseyWall")
	local face = INNER.MaxZ -- inner face of the back wall (the wall faces -Z)

	local panelColor = shade(team.Primary, 0.6)
	slab(wall, "RingOfHonorPanel", CX - 32, CX + 32, FLOOR + 1, 20.6, face - 0.3, face, panelColor, Enum.Material.SmoothPlastic)
	local header =
		slab(wall, "RingOfHonorHeader", CX - 24, CX + 24, 17.4, 20, face - 0.6, face - 0.3, C.Gold, Enum.Material.Metal, GOLD_SHINE)
	sign(header, { Enum.NormalId.Front }, teamName ~= "" and (teamName .. " RING OF HONOR") or "RING OF HONOR", C.Gold, team, {
		TextColor3 = INK,
		InsetX = 0.05,
		InsetY = 0.14,
	})
	local lightBar = slab(wall, "RingOfHonorLight", CX - 28, CX + 28, 20.9, 21.3, face - 1.2, face, LAMP, Enum.Material.Neon)
	BuildUtil.Light(lightBar, "SpotLight", {
		Name = "JerseyWallLight",
		Face = Enum.NormalId.Bottom,
		Angle = 120,
		Range = 26,
		Brightness = 2,
		Color = WARM_LIGHT,
	})

	-- two rows of five framed jerseys: home (team colour) and away (white) alternate
	local homeNumber = textColorOn(team.Primary, { team.Secondary, team.Trim })
	local awayNumber = textColorOn(WHITE, { team.Primary, team.Secondary })
	for index, jersey in ipairs(JERSEYS) do
		local col = (index - 1) % 5
		local row = math.floor((index - 1) / 5)
		local x = CX + (col - 2) * 11.5
		local y = row == 0 and 13 or 6.2
		local home = (index % 2 == 1)
		local color = home and team.Primary or WHITE
		local frame =
			slab(wall, "JerseyFrame", x - 4.2, x + 4.2, y - 3.2, y + 3.2, face - 0.5, face - 0.3, C.Gold, Enum.Material.Metal, GOLD_SHINE)
		-- the player's name on the strip of frame under the jersey
		sign(frame, { Enum.NormalId.Front }, jersey[2], C.Gold, team, {
			TextColor3 = INK,
			Font = Enum.Font.GothamBold,
			Rect = { 0.15, 0.885, 0.7, 0.1 },
		})
		slab(wall, "JerseySleeves", x - 3.1, x + 3.1, y + 0.9, y + 2.4, face - 0.75, face - 0.5, color, Enum.Material.Fabric)
		local body = slab(wall, "Jersey", x - 1.9, x + 1.9, y - 2.4, y + 2.4, face - 0.85, face - 0.55, color, Enum.Material.Fabric)
		sign(body, { Enum.NormalId.Front }, jersey[1], color, team, {
			TextColor3 = home and homeNumber or awayNumber,
			InsetX = 0.12,
			InsetY = 0.18,
		})
	end
end

---------------------------------------------------------------------------------------------
-- Step 4: bronze player statues
---------------------------------------------------------------------------------------------

local LEG = Vector3.new(1.25, 3.8, 1.35)
local ARM = Vector3.new(1, 3.4, 1.05)
local TORSO = Vector3.new(3, 3.3, 1.7)
local PADS = Vector3.new(4.2, 1, 2.1)
local HIP_X, SHOULDER_X, SHOULDER_Y = 0.68, 2.05, 3.05
local PLINTH = Vector3.new(5, 4.2, 5)

--[[
	A blocky bronze player on a marble plinth. `base` is a plot-local CFrame on the floor at the
	plinth centre, its LookVector the way the player faces.
	pose: Legs = { left, right } swing in degrees (+ = forward), Plant = largest swing of a leg
	      that stands on the plinth, Lean (degrees forward), Arms = { left, right } as
	      { swing, raise } in degrees (swing 180 = straight up, raise = away from the body),
	      Ball = "Left" | "Right" | "Overhead", BallAtTip (the ball sits beyond the fingertips)
]]
local function statue(ctx, name, base, pose, plaque)
	local team = ctx.colors
	local st = BuildUtil.Child(ctx, name)
	local plinth = block(st, "Plinth", PLINTH, base * CFrame.new(0, PLINTH.Y / 2, 0), PLINTH_STONE, Enum.Material.Marble)
	sign(plinth, { Enum.NormalId.Front }, plaque, PLINTH_STONE, team, {
		TextColor3 = ctx.config.Colors.Gold,
		Font = Enum.Font.Garamond,
		Wrap = true,
		InsetX = 0.08,
		InsetY = 0.22,
	})
	BuildUtil.Light(plinth, "SpotLight", {
		Name = "StatueLight",
		Face = Enum.NormalId.Top,
		Angle = 70,
		Range = 16,
		Brightness = 1.5,
		Color = WARM_LIGHT,
	})

	local metal = Enum.Material.Metal
	local feet = base * CFrame.new(0, PLINTH.Y, 0)
	local hip = LEG.Y * math.cos(math.rad(pose.Plant or 0))
	for i, side in ipairs({ -1, 1 }) do
		block(
			st,
			"Leg",
			LEG,
			feet * CFrame.new(side * HIP_X, hip, 0) * CFrame.Angles(math.rad(pose.Legs[i]), 0, 0) * CFrame.new(0, -LEG.Y / 2, 0),
			BRONZE,
			metal,
			BRONZE_SHINE
		)
	end
	local upper = feet * CFrame.new(0, hip, 0) * CFrame.Angles(-math.rad(pose.Lean or 0), 0, 0)
	block(st, "Torso", TORSO, upper * CFrame.new(0, TORSO.Y / 2, 0), BRONZE, metal, BRONZE_SHINE)
	block(st, "ShoulderPads", PADS, upper * CFrame.new(0, 3.15, 0), BRONZE, metal, BRONZE_SHINE)
	ball(st, "Helmet", upper * CFrame.new(0, 4.6, 0), 2.3, BRONZE, metal, BRONZE_SHINE)
	block(st, "FaceMask", Vector3.new(1.5, 0.9, 0.35), upper * CFrame.new(0, 4.25, -1.1), BRONZE_DARK, metal, BRONZE_SHINE)

	local hands = {}
	for i, side in ipairs({ -1, 1 }) do
		local arm = pose.Arms[i]
		local shoulder = upper * CFrame.new(side * SHOULDER_X, SHOULDER_Y, 0) * CFrame.Angles(math.rad(arm[1]), 0, math.rad(side * arm[2]))
		block(st, "Arm", ARM, shoulder * CFrame.new(0, -ARM.Y / 2, 0), BRONZE, metal, BRONZE_SHINE)
		hands[i] = shoulder * CFrame.new(0, -ARM.Y, 0)
	end
	local ballCFrame
	if pose.Ball == "Overhead" then
		ballCFrame = upper * CFrame.new(0, SHOULDER_Y + ARM.Y + 0.15, -0.6)
	else
		-- in the hand, pointing the way the hand faces
		local hand = hands[pose.Ball == "Left" and 1 or 2]
		local grip = pose.BallAtTip and CFrame.new(0, -0.45, 0) or CFrame.new(0, 0.1, -0.35)
		ballCFrame = hand * grip * CFrame.Angles(0, math.pi / 2, 0)
	end
	football(st, "Football", ballCFrame, 2.1, 1.25, BRONZE_DARK, metal, BRONZE_SHINE)
end

local function buildStatues(ctx)
	BuildUtil.Stage(ctx, 4)
	local hall = BuildUtil.Child(ctx, "Statues")
	-- west statues face into the nave and toward the doorway (yaw < 0 turns them to +X)
	local function base(x, z, yawDeg)
		return CFrame.new(x, FLOOR, z) * CFrame.Angles(0, math.rad(yawDeg), 0)
	end
	statue(hall, "QuarterbackStatue", base(CX - 10.5, 252, -50), {
		Legs = { 22, -22 },
		Plant = 22,
		Lean = -4,
		Arms = { { 80, 8 }, { 205, 10 } },
		Ball = "Right",
		BallAtTip = true,
	}, "#12\nCANNON ARM")
	statue(hall, "ReceiverStatue", base(CX + 10.5, 252, 50), {
		Legs = { 35, -5 },
		Plant = 5,
		Lean = -6,
		Arms = { { 170, -8 }, { 170, -8 } },
		Ball = "Overhead",
	}, "#81\nHANDS OF GLUE")
	statue(hall, "RunningBackStatue", base(CX - 10.5, 280, -60), {
		Legs = { 30, -30 },
		Plant = 30,
		Lean = 12,
		Arms = { { 25, 4 }, { 85, -4 } },
		Ball = "Left",
	}, "#28\nTHE BULLDOZER")
	statue(hall, "LegendStatue", base(CX + 10.5, 280, 60), {
		Legs = { 62, 0 },
		Plant = 0,
		Lean = 6,
		Arms = { { 28, 4 }, { 90, 0 } },
		Ball = "Left",
	}, "#21\nTHE LEGEND")
end

---------------------------------------------------------------------------------------------
-- Step 5: the gold entrance
---------------------------------------------------------------------------------------------

local function buildGoldEntrance(ctx)
	local C = ctx.config.Colors
	local team = ctx.colors
	local gold, metal = C.Gold, Enum.Material.Metal
	BuildUtil.Stage(ctx, 5)
	local entrance = BuildUtil.Child(ctx, "GoldEntrance")

	-- gold colonnade on the terrace carrying a beam and a canopy back to the facade
	local capitalTop = 18.4
	for _, x in ipairs(GOLD_COLUMN_X) do
		cyl(
			entrance,
			"GoldColumn",
			Vector3.new(x, (FLOOR + capitalTop - 1) / 2, COLONNADE_Z),
			capitalTop - 1 - FLOOR,
			2.4,
			"Y",
			gold,
			metal,
			GOLD_SHINE
		)
		slab(
			entrance,
			"GoldCapital",
			x - 1.6,
			x + 1.6,
			capitalTop - 1,
			capitalTop,
			COLONNADE_Z - 1.6,
			COLONNADE_Z + 1.6,
			gold,
			metal,
			GOLD_SHINE
		)
	end
	local beamMinX, beamMaxX = GOLD_COLUMN_X[1] - 3.5, GOLD_COLUMN_X[#GOLD_COLUMN_X] + 3.5
	local beamFront = COLONNADE_Z - 1.6
	slab(entrance, "GoldBeam", beamMinX, beamMaxX, capitalTop, capitalTop + 2.4, beamFront, COLONNADE_Z + 1.6, gold, metal, GOLD_SHINE)
	slab(entrance, "EntranceCanopy", beamMinX, beamMaxX, capitalTop + 2.4, capitalTop + 3, beamFront, OUTER.MinZ, gold, metal, GOLD_SHINE)

	-- the glowing sign on the front of the beam, edged with neon
	local signBoard = slab(
		entrance,
		"HallOfFameSign",
		CX - 15,
		CX + 15,
		capitalTop + 0.2,
		capitalTop + 2.2,
		beamFront - 0.4,
		beamFront,
		SIGN_DARK,
		Enum.Material.SmoothPlastic
	)
	sign(signBoard, { Enum.NormalId.Front }, "HALL OF FAME", SIGN_DARK, team, {
		TextColor3 = GLOW_GOLD,
		LightInfluence = 0,
		InsetX = 0.05,
		InsetY = 0.1,
	})
	BuildUtil.Light(signBoard, "SurfaceLight", {
		Name = "SignGlow",
		Face = Enum.NormalId.Front,
		Angle = 120,
		Range = 14,
		Brightness = 2,
		Color = GLOW_GOLD,
	})
	for _, y in ipairs({ capitalTop, capitalTop + 2.2 }) do
		slab(entrance, "SignNeon", CX - 15.4, CX + 15.4, y, y + 0.2, beamFront - 0.5, beamFront, GLOW_GOLD, Enum.Material.Neon)
	end

	-- gold frame around the doorway
	local frameZ0, frameZ1 = OUTER.MinZ - 0.4, OUTER.MinZ
	slab(entrance, "GoldDoorFrame", DOOR_MIN_X - 1.2, DOOR_MIN_X, FLOOR, DOOR_TOP, frameZ0, frameZ1, gold, metal, GOLD_SHINE)
	slab(entrance, "GoldDoorFrame", DOOR_MAX_X, DOOR_MAX_X + 1.2, FLOOR, DOOR_TOP, frameZ0, frameZ1, gold, metal, GOLD_SHINE)
	slab(entrance, "GoldDoorFrame", DOOR_MIN_X - 1.2, DOOR_MAX_X + 1.2, DOOR_TOP, DOOR_TOP + 1.4, frameZ0, frameZ1, gold, metal, GOLD_SHINE)
	-- the two gold door leaves stand wide open against the doorway sides, inside the hall
	local leafDepth = (DOOR_MAX_X - DOOR_MIN_X) / 2 - 1
	slab(
		entrance,
		"GoldDoor",
		DOOR_MIN_X,
		DOOR_MIN_X + 0.4,
		FLOOR,
		DOOR_TOP - 0.3,
		INNER.MinZ,
		INNER.MinZ + leafDepth,
		gold,
		metal,
		GOLD_SHINE
	)
	slab(
		entrance,
		"GoldDoor",
		DOOR_MAX_X - 0.4,
		DOOR_MAX_X,
		FLOOR,
		DOOR_TOP - 0.3,
		INNER.MinZ,
		INNER.MinZ + leafDepth,
		gold,
		metal,
		GOLD_SHINE
	)

	-- red carpet: from the road, up both steps, through the doorway to the Ring of Honor
	-- (it parts around the floor medallion under the dome)
	local carpet = Enum.Material.Carpet
	local x0, x1 = CX - CARPET_HALF, CX + CARPET_HALF
	local stepDepth = (PODIUM.MinZ - STAIRS.Front) / 2
	slab(entrance, "RedCarpet", x0, x1, 0, 0.06, 200, STAIRS.Front, CARPET_RED, carpet, PAINT)
	for i = 1, 2 do
		local z0 = STAIRS.Front + (i - 1) * stepDepth
		slab(entrance, "RedCarpet", x0, x1, i * 0.4, i * 0.4 + 0.06, z0, z0 + stepDepth, CARPET_RED, carpet, PAINT)
	end
	local medallionEdge = MEDALLION_D / 2 + 0.5
	slab(entrance, "RedCarpet", x0, x1, FLOOR, FLOOR + 0.06, PODIUM.MinZ, DOME_Z - medallionEdge, CARPET_RED, carpet, PAINT)
	slab(entrance, "RedCarpet", x0, x1, FLOOR, FLOOR + 0.06, DOME_Z + medallionEdge, INNER.MaxZ - 1.5, CARPET_RED, carpet, PAINT)

	-- velvet rope lines along the carpet in front of the steps
	local ropeZ = { 200.8, STAIRS.Front - 0.6 }
	for _, side in ipairs({ -1, 1 }) do
		local px = CX + side * (CARPET_HALF + 1.6)
		for _, z in ipairs(ropeZ) do
			cyl(entrance, "RopePost", Vector3.new(px, 1.5, z), 3, 0.5, "Y", gold, metal, GOLD_SHINE)
		end
		cyl(
			entrance,
			"VelvetRope",
			Vector3.new(px, 2.6, (ropeZ[1] + ropeZ[2]) / 2),
			ropeZ[2] - ropeZ[1],
			0.32,
			"Z",
			VELVET_RED,
			Enum.Material.Fabric,
			{
				CanCollide = false,
			}
		)
	end

	-- team banners hanging on the outer pilasters
	local words = { "LEGENDS", "GLORY", "HONOR", "PRIDE" }
	for i, x in ipairs({ PILASTER_X[1], PILASTER_X[2], PILASTER_X[5], PILASTER_X[6] }) do
		local color = (i % 2 == 1) and team.Primary or team.Secondary
		local banner =
			slab(entrance, "Banner", x - 1.7, x + 1.7, 9.5, 20, OUTER.MinZ - 1.12, OUTER.MinZ - 0.92, color, Enum.Material.Fabric)
		local stacked = string.sub(string.gsub(words[i], "(.)", "%1\n"), 1, -2) -- one letter per line
		sign(banner, { Enum.NormalId.Front }, stacked, color, team, { InsetX = 0.2, InsetY = 0.06 })
	end
end

---------------------------------------------------------------------------------------------
-- Builder
---------------------------------------------------------------------------------------------

function HallOfFame.hall_of_fame(ctx)
	buildBuilding(ctx)
	buildTrophyCases(ctx)
	buildJerseyWall(ctx)
	buildStatues(ctx)
	buildGoldEntrance(ctx)
end

return HallOfFame
