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
	                    medallion and a copper gable roof behind it, a rotunda topped by a giant
	                    football standing on end (laces facing the road), nave columns, ceiling
	                    lights and a team medallion in the floor under the dome.
	                    Walk-in: bronze double doors (they swing into the hall), the museum desk +
	                    gift shop (free foam finger), four leather benches (one is a Ring of Honor
	                    TV camera seat), the Franchise History timeline and three team photos
	  2 Trophy Cases    four lit glass display cases in the galleries: championship trophies,
	                    game balls, championship rings and MVP awards (each one a "look"), and the
	                    live CHAMPIONSHIPS screen on the east wall
	  3 Jersey Wall     the Ring of Honor on the back wall: ten framed home/away jerseys with
	                    numbers and names under a lit header (each a legend to "look" at), six
	                    bronze legend plaques on the west wall and the live RECORD screen
	  4 Player Statues  four bronze players on marble plinths lining the nave (QB throwing,
	                    receiver catch, running back stiff-arm, trophy pose), each with a bio
	  5 Gold Entrance   a gold colonnade + canopy carrying the glowing HALL OF FAME sign, a gold
	                    door frame and dedication plaque, a red carpet from the road to the Ring of
	                    Honor, velvet rope lines and team banners on the facade

	All the legends (names, numbers, stories) are invented for this game.

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

local SCREEN_DARK = Color3.fromRGB(12, 14, 22)
local DARK_WOOD = Color3.fromRGB(70, 46, 30)
local PHOTO_SKY = Color3.fromRGB(150, 196, 230)
local PHOTO_GRASS = Color3.fromRGB(70, 132, 62)
local SEPIA_LIGHT = Color3.fromRGB(214, 192, 150)
local SEPIA_DARK = Color3.fromRGB(120, 92, 60)
local SKIN = Color3.fromRGB(200, 150, 110)

-- The franchise legends (all invented). Retired jerseys on the Ring of Honor:
-- { number, name on the frame, full name, nickname, position, years, one fun line }
local JERSEYS = {
	{
		"7",
		"CARTER",
		"Dash Carter",
		"The Cheetah",
		"Kick Returner",
		"1979-1988",
		"Ran back 14 kicks for touchdowns. Fans swore he was part cheetah.",
	},
	{
		"12",
		"HAYES",
		"Boone Hayes",
		"Cannon Arm",
		"Quarterback",
		"1968-1981",
		"Threw a ball so far in practice that it landed in the parking lot.",
	},
	{
		"21",
		"BROOKS",
		"Otis Brooks",
		"The Legend",
		"Running Back & Safety",
		"1950-1962",
		"Played offense AND defense in every game, then led the post-game dance.",
	},
	{
		"34",
		"WALKER",
		"Moe Walker",
		"The Bulldozer",
		"Fullback",
		"1955-1966",
		"Once carried three tacklers into the end zone on his back.",
	},
	{
		"56",
		"REED",
		"Hank Reed",
		"Tank",
		"Linebacker",
		"1983-1995",
		"Made so many tackles that runners checked if he was playing before kick-off.",
	},
	{ "80", "MORGAN", "Felix Morgan", "Silk", "Wide Receiver", "1990-2003", "Ran routes so smooth the defenders called him Silk." },
	{
		"88",
		"PRICE",
		"Danny Price",
		"Hands of Glue",
		"Tight End",
		"1972-1984",
		"Dropped one pass in his whole career - and he still talks about it.",
	},
	{
		"92",
		"TURNER",
		"Rex Turner",
		"The Storm",
		"Defensive End",
		"1996-2008",
		"Sacked quarterbacks 140 times and helped every one of them back up.",
	},
	{
		"10",
		"BENNETT",
		"Sal Bennett",
		"Mr. Automatic",
		"Kicker",
		"1985-1999",
		"Never missed an extra point in 15 seasons, not even in a snowstorm.",
	},
	{
		"25",
		"COLE",
		"Jojo Cole",
		"Ballhawk",
		"Cornerback",
		"2001-2012",
		"Intercepted 61 passes and did a brand-new victory dance after every one.",
	},
}

-- Bronze plaques on the west gallery wall: { plaque text, title, info }
local LEGEND_PLAQUES = {
	{
		"NELLIE\nASHFORD\nFOUNDER\n1950",
		"Nellie Ashford",
		"Founder, 1950. Started the team with one borrowed ball and nine friends from her bakery.",
	},
	{
		"GUS\nHALLORAN\nHEAD COACH\n1966-1989",
		"Coach Gus Halloran",
		"Head Coach, 1966-1989. Won five titles in the same lucky sweater - nobody knows if he ever washed it.",
	},
	{
		"ABE\nOKAFOR\nCENTER\n1974-1986",
		'Abe "Big Bear" Okafor',
		"Center, 1974-1986. Snapped the ball 9,000 times without a fumble, then ate 40 pancakes to celebrate.",
	},
	{
		"PETE\nLINDQVIST\nPUNTER\n1981-1996",
		'Pete "Boomer" Lindqvist',
		"Punter, 1981-1996. His longest punt bounced all the way to the ticket booth.",
	},
	{
		"TITO\nVANCE\nSAFETY\n1993-2004",
		'Tito "The Eraser" Vance',
		"Safety, 1993-2004. Wiped receivers right off the highlight reel with 54 interceptions.",
	},
	{
		"ROSA\nDELGADO\nHEAD TRAINER\n1988-2015",
		'Rosa "Doc" Delgado',
		"Head Trainer, 1988-2015. Taped over 50,000 ankles and always had an ice pack ready.",
	},
}

-- Framed team photos in the east corner of the back wall
local TEAM_PHOTOS = {
	{
		caption = "1950 - THE FIRST TEAM",
		title = "The First Team (1950)",
		info = "The very first squad in borrowed helmets. That's founder Nellie Ashford holding the ball!",
		sepia = true,
	},
	{
		caption = "CHAMPIONSHIP PARADE",
		title = "Championship Parade",
		info = "Confetti, an open-top bus and a whole city cheering. Win a title and the next parade is yours!",
		lookKey = "titles",
	},
	{
		caption = "THIS SEASON'S SQUAD",
		title = "This Season's Squad",
		info = "Your current team on photo day, all smiles before the first kick-off of the season.",
		lookKey = "record",
	},
}

-- Franchise History timeline: { year, event } (the last one shows the owner's team name)
local MILESTONES = {
	{ "1950", "FOUNDED" },
	{ "1958", "FIRST PLAYOFFS" },
	{ "1966", "COACH HALLORAN" },
	{ "1972", "FIRST TITLE" },
	{ "1999", "NEW STADIUM" },
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

-- A dark LED screen whose text the server keeps up to date (BuildUtil.LiveText).
local function liveScreen(part, face, live, placeholder, textColor)
	local _, label = BuildUtil.LiveText(part, face, live, {
		LabelName = "Live_" .. live,
		Text = placeholder,
		TextColor3 = textColor,
		BackgroundColor3 = SCREEN_DARK,
		BackgroundTransparency = 0,
		LightInfluence = 0,
		Font = Enum.Font.GothamBlack,
		PixelsPerStud = 20,
	})
	label.TextWrapped = true
	local pad = Instance.new("UIPadding")
	local inset = UDim.new(0.08, 0)
	pad.PaddingLeft, pad.PaddingRight, pad.PaddingTop, pad.PaddingBottom = inset, inset, inset, inset
	pad.Parent = label
	return label
end

-- GUI rectangle (scale units) used to draw photos and the timeline on a SurfaceGui.
local function guiBox(parent, x, y, w, h, color, round)
	local frame = Instance.new("Frame")
	frame.Position = UDim2.new(x, 0, y, 0)
	frame.Size = UDim2.new(w, 0, h, 0)
	frame.BackgroundColor3 = color
	frame.BorderSizePixel = 0
	frame.Parent = parent
	if round then
		local corner = Instance.new("UICorner")
		corner.CornerRadius = UDim.new(0.5, 0)
		corner.Parent = frame
	end
	return frame
end

local function guiText(parent, x, y, w, h, text, color, font)
	local label = Instance.new("TextLabel")
	label.Position = UDim2.new(x, 0, y, 0)
	label.Size = UDim2.new(w, 0, h, 0)
	label.BackgroundTransparency = 1
	label.Font = font or Enum.Font.GothamBold
	label.Text = text
	label.TextColor3 = color
	label.TextScaled = true
	label.TextWrapped = true
	label.Parent = parent
	return label
end

-- A framed team photo drawn on one face of `part`: a row of players on the grass and a caption.
local function teamPhoto(part, face, team, opts)
	local gui = Instance.new("SurfaceGui")
	gui.Name = "PhotoGui"
	gui.Face = face
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 30
	gui.Parent = part
	local sky = opts.sepia and SEPIA_LIGHT or PHOTO_SKY
	local grass = opts.sepia and SEPIA_DARK or PHOTO_GRASS
	local border = guiBox(gui, 0, 0, 1, 1, DARK_WOOD)
	local photo = guiBox(border, 0.06, 0.07, 0.88, 0.66, sky)
	guiBox(photo, 0, 0.62, 1, 0.38, grass)
	for i = 1, 6 do
		local jersey = opts.sepia and SEPIA_DARK or ((i % 2 == 1) and team.Primary or team.Secondary)
		local x = 0.05 + (i - 1) * 0.155
		guiBox(photo, x, 0.42, 0.13, 0.4, jersey)
		guiBox(photo, x + 0.025, 0.2, 0.08, 0.22, opts.sepia and SEPIA_DARK or SKIN, true)
	end
	guiText(border, 0.06, 0.76, 0.88, 0.18, opts.caption, GLOW_GOLD, Enum.Font.Garamond)
	return gui
end

-- A museum bench (one leather block you can sit on). The sitter faces `yawDeg` (0 = -Z,
-- 180 = +Z, 90 = -X, -90 = +X); the bench runs `length` studs across that direction.
local function bench(ctx, x, z, yawDeg, length, opts)
	opts = opts or {}
	return BuildUtil.Seat(ctx, {
		Name = "MuseumBench",
		Size = Vector3.new(length, 1.7, 2.2),
		CFrame = CFrame.new(x, FLOOR + 0.85, z) * CFrame.Angles(0, math.rad(yawDeg), 0),
		Color = LEATHER,
		Material = Enum.Material.Leather,
		Object = opts.Object or "Museum Bench",
		Camera = opts.Camera,
	})
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
-- Step 1 (inside): doors, museum desk + gift shop, benches, timeline, team photos
---------------------------------------------------------------------------------------------

local function buildMuseumFloor(ctx)
	local C = ctx.config.Colors
	local team = ctx.colors
	local teamName = ctx.teamName or ""
	BuildUtil.Stage(ctx, 1)
	local hall = BuildUtil.Child(ctx, "MuseumFloor")

	-- the big bronze entrance doors fill the doorway and swing INTO the hall (the door frame is
	-- turned around so its front, the side the leaves swing to, faces +Z)
	local doorH = DOOR_TOP - FLOOR
	BuildUtil.Door(hall, {
		Name = "EntranceDoors",
		Size = Vector3.new(DOOR_MAX_X - DOOR_MIN_X, doorH, 0.6),
		CFrame = CFrame.new(CX, FLOOR + doorH / 2, (OUTER.MinZ + INNER.MinZ) / 2) * CFrame.Angles(0, math.pi, 0),
		Double = true,
		Swing = 90,
		Color = BRONZE_DARK,
		Material = Enum.Material.Metal,
		Window = true,
		Object = "Hall of Fame",
		Title = "Hall of Fame & Museum",
		Info = "Trophies, retired jerseys, bronze statues and the legends who built this franchise. Admission is free!",
	})

	-- museum desk + gift shop in the west front corner (the shop keeper stands by the wall)
	local deskZ0, deskZ1 = 230.5, 239.5
	local desk = slab(hall, "GiftCounter", 151, 153.4, FLOOR, 4.6, deskZ0, deskZ1, team.Primary, Enum.Material.Wood)
	sign(desk, { Enum.NormalId.Right }, "TICKETS & GIFTS", team.Primary, team, { InsetX = 0.08, InsetY = 0.3 })
	BuildUtil.Look(
		desk,
		"Museum Desk",
		"Free maps and audio tours start here. The shelf is full of souvenirs: snow globes, mini helmets and plush mascots.",
		{ At = Vector3.new(1.6, 1.4, -3), Distance = 8 }
	)
	slab(hall, "GiftCounterTop", 150.8, 153.7, 4.6, 4.85, deskZ0 - 0.2, deskZ1 + 0.2, MARBLE, Enum.Material.Marble)
	local shelf = slab(hall, "GiftShelf", INNER.MinX, INNER.MinX + 1.4, FLOOR, 9, deskZ0, deskZ1, DARK_WOOD, Enum.Material.Wood)
	sign(shelf, { Enum.NormalId.Right }, "SOUVENIRS", DARK_WOOD, team, {
		TextColor3 = C.Gold,
		Font = Enum.Font.Garamond,
		Rect = { 0.1, 0.04, 0.8, 0.14 },
	})
	local bin = slab(hall, "FoamFingerBin", 151.3, 153.3, 4.85, 6.1, 237.2, 239.2, team.Secondary, Enum.Material.Foil)
	sign(bin, { Enum.NormalId.Right }, "#1", team.Secondary, team, { InsetX = 0.15, InsetY = 0.1 })
	BuildUtil.Use(hall, bin, "foamfinger", {
		Object = "Gift Shop",
		Title = "Souvenir Foam Finger",
		Info = "A free souvenir from the museum gift shop. Point it at the Ring of Honor!",
		Distance = 8,
	})

	-- benches: two in the nave facing the Ring of Honor (one is a TV camera seat) and one in
	-- each gallery, facing the legend plaques (west) and the big screens (east)
	-- (the camera stands between the back statues, so all ten jerseys and the header fit the shot)
	local ringCam = { From = Vector3.new(CX, 9.5, 276), To = Vector3.new(CX, 11, INNER.MaxZ), Fov = 62, Label = "RING OF HONOR" }
	bench(hall, CX - 10, 296, 180, 7, { Object = "Ring of Honor Bench", Camera = ringCam })
	bench(hall, CX + 10, 296, 180, 7)
	bench(hall, 158, 266, 90, 8)
	bench(hall, 232, 266, -90, 8)

	-- Franchise History timeline in the west corner of the back wall
	local face = INNER.MaxZ
	local timeline = slab(hall, "HistoryTimeline", 148.5, 161.5, 4, 13.5, face - 0.3, face, DARK_WOOD, Enum.Material.Wood)
	local gui = Instance.new("SurfaceGui")
	gui.Name = "TimelineGui"
	gui.Face = Enum.NormalId.Front
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 24
	gui.Parent = timeline
	guiText(gui, 0.05, 0.03, 0.9, 0.17, "FRANCHISE HISTORY", C.Gold, Enum.Font.Garamond)
	local events = table.clone(MILESTONES)
	table.insert(events, { "TODAY", teamName ~= "" and teamName or "YOUR TEAM" })
	for i, event in ipairs(events) do
		local col = (i - 1) % 3
		local above = i <= 3
		local x = 0.03 + col * 0.32
		local y = above and 0.24 or 0.56
		guiText(gui, x, y, 0.3, 0.09, event[1], C.Gold, Enum.Font.GothamBlack)
		guiText(gui, x, y + 0.1, 0.3, 0.1, event[2], WHITE, Enum.Font.GothamBold)
	end
	slab(hall, "TimelineBar", 149, 161, 8.6, 9, face - 0.5, face - 0.3, C.Gold, Enum.Material.Metal, GOLD_SHINE)
	BuildUtil.Look(
		timeline,
		"Franchise History",
		"From one borrowed ball in 1950 to the team you run today: every big moment in the franchise's story.",
		{ LookKey = "season", At = Vector3.new(0, 2, 0) } -- (on the board above the gold timeline bar)
	)

	-- three framed team photos in the east corner of the back wall
	for i, photo in ipairs(TEAM_PHOTOS) do
		local x = 230 + (i - 1) * 5
		local frame = slab(hall, "TeamPhoto", x - 2.3, x + 2.3, 5.4, 9, face - 0.25, face, DARK_WOOD, Enum.Material.Wood)
		teamPhoto(frame, Enum.NormalId.Front, team, photo)
		BuildUtil.Look(frame, photo.title, photo.info, { LookKey = photo.lookKey, Distance = 8 })
	end
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
	return base
end

local function buildTrophyCases(ctx)
	local C = ctx.config.Colors
	local team = ctx.colors
	local gold, metal = C.Gold, Enum.Material.Metal
	BuildUtil.Stage(ctx, 2)
	local cases = BuildUtil.Child(ctx, "TrophyCases")

	-- West gallery, front: a big championship cup between two football-topped trophies
	local championships = displayCase(cases, "ChampionshipCase", GALLERY_X[1], CASE_Z[1], "CHAMPIONSHIPS", function(c, cx, cz, top)
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
	local gameBalls = displayCase(cases, "GameBallCase", GALLERY_X[2], CASE_Z[1], "GAME BALLS", function(c, cx, cz, top)
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
	local rings = displayCase(cases, "RingCase", GALLERY_X[1], CASE_Z[2], "CHAMPIONSHIP RINGS", function(c, cx, cz, top)
		slab(c, "RingCushion", cx - 0.9, cx + 0.9, top, top + 0.7, cz - 6.5, cz + 6.5, CUSHION, Enum.Material.Fabric)
		for _, dz in ipairs({ -4.5, 0, 4.5 }) do
			local ringY = top + 0.7 + 1.25
			cyl(c, "Ring", Vector3.new(cx, ringY, cz + dz), 0.6, 2.5, "X", gold, metal, GOLD_SHINE)
			ball(c, "RingGem", CFrame.new(cx, ringY + 1.3, cz + dz), 1.1, team.Secondary, Enum.Material.Neon)
		end
	end)

	-- East gallery, back: a gold helmet between two MVP plaques
	local awards = displayCase(cases, "AwardCase", GALLERY_X[2], CASE_Z[2], "MVP AWARDS", function(c, cx, cz, top)
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

	-- what's in each case (the championship case shows how many titles the owner has won)
	BuildUtil.Look(championships, "Championship Trophies", "Every title this franchise wins earns a golden trophy in this case.", {
		LookKey = "titles",
	})
	BuildUtil.Look(
		gameBalls,
		"Game Balls",
		"Signed balls from the biggest wins in team history. The golden one is from the first championship game in 1972."
	)
	BuildUtil.Look(rings, "Championship Rings", "One gold ring for every champion. Players only wear them on very special days.")
	BuildUtil.Look(
		awards,
		"MVP Awards",
		"The golden helmet goes to the season's Most Valuable Player, the plaques to the All-Pro stars.",
		{ LookKey = "rating" }
	)

	-- the championship counter on the east gallery wall, between the windows
	local screen =
		slab(cases, "TitlesScreen", INNER.MaxX - 0.35, INNER.MaxX, 6, 12.6, 250.5, 261.5, SCREEN_DARK, Enum.Material.SmoothPlastic)
	liveScreen(screen, Enum.NormalId.Left, "titles", "CHAMPIONSHIPS", C.Gold)
	BuildUtil.Look(screen, "Championship Counter", "Every title your team wins in the playoffs is added to this screen.", {
		LookKey = "titles",
		At = Vector3.new(-0.6, -3.6, 0),
	})
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
		-- the bottom row is read up close; the top row's prompt sits under its jersey and reaches
		-- further, so stepping back from the wall picks the top row
		local title = ("#%s %s"):format(jersey[1], jersey[3])
		local info = ('"%s" - %s, %s. %s'):format(jersey[4], jersey[5], jersey[6], jersey[7])
		if row == 0 then
			BuildUtil.Look(body, title, info, { At = Vector3.new(0, -3, -0.4), Distance = 12 })
		else
			BuildUtil.Look(body, title, info, { Distance = 7 })
		end
	end

	-- six bronze legend plaques on the west gallery wall, three on each side of the middle window
	for i, plaque in ipairs(LEGEND_PLAQUES) do
		local z = (i <= 3 and 251.5 or 271.5) + ((i - 1) % 3) * 4.5
		local plate =
			slab(wall, "LegendPlaque", INNER.MinX, INNER.MinX + 0.3, 4.4, 8.8, z - 1.7, z + 1.7, BRONZE, Enum.Material.Metal, BRONZE_SHINE)
		sign(plate, { Enum.NormalId.Right }, plaque[1], BRONZE, team, {
			TextColor3 = INK,
			Font = Enum.Font.Garamond,
			InsetX = 0.1,
			InsetY = 0.08,
		})
		BuildUtil.Look(plate, plaque[2], plaque[3], { Distance = 8 })
	end

	-- the season tracker on the east gallery wall
	local screen =
		slab(wall, "RecordScreen", INNER.MaxX - 0.35, INNER.MaxX, 6, 12.6, 270.5, 281.5, SCREEN_DARK, Enum.Material.SmoothPlastic)
	liveScreen(screen, Enum.NormalId.Left, "record", "RECORD", textColorOn(SCREEN_DARK, { team.Secondary, team.Trim, C.Gold }))
	BuildUtil.Look(screen, "Season Tracker", "Every win and loss of your team's season, counted up live.", {
		LookKey = "record",
		At = Vector3.new(-0.6, -3.6, 0),
	})
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
local function statue(ctx, name, base, pose, plaque, look)
	local team = ctx.colors
	local st = BuildUtil.Child(ctx, name)
	local plinth = block(st, "Plinth", PLINTH, base * CFrame.new(0, PLINTH.Y / 2, 0), PLINTH_STONE, Enum.Material.Marble)
	BuildUtil.Look(plinth, look[1], look[2])
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
	statue(
		hall,
		"QuarterbackStatue",
		base(CX - 10.5, 252, -50),
		{
			Legs = { 22, -22 },
			Plant = 22,
			Lean = -4,
			Arms = { { 80, 8 }, { 205, 10 } },
			Ball = "Right",
			BallAtTip = true,
		},
		"#12\nCANNON ARM",
		{
			"Statue: Boone Hayes",
			'"Cannon Arm" frozen mid-throw. His last-second bomb won the franchise\'s first title in 1972.',
		}
	)
	statue(
		hall,
		"ReceiverStatue",
		base(CX + 10.5, 252, 50),
		{
			Legs = { 35, -5 },
			Plant = 5,
			Lean = -6,
			Arms = { { 170, -8 }, { 170, -8 } },
			Ball = "Overhead",
		},
		"#88\nHANDS OF GLUE",
		{
			"Statue: Danny Price",
			"The famous one-handed catch from the 1977 playoffs, high above two defenders.",
		}
	)
	statue(
		hall,
		"RunningBackStatue",
		base(CX - 10.5, 280, -60),
		{
			Legs = { 30, -30 },
			Plant = 30,
			Lean = 12,
			Arms = { { 25, 4 }, { 85, -4 } },
			Ball = "Left",
		},
		"#34\nTHE BULLDOZER",
		{
			"Statue: Moe Walker",
			'"The Bulldozer" ran right through tacklers. Rub his helmet for luck before a game day!',
		}
	)
	statue(
		hall,
		"LegendStatue",
		base(CX + 10.5, 280, 60),
		{
			Legs = { 62, 0 },
			Plant = 0,
			Lean = 6,
			Arms = { { 28, 4 }, { 90, 0 } },
			Ball = "Left",
		},
		"#21\nTHE LEGEND",
		{
			"Statue: Otis Brooks",
			"A star of the very first team in 1950 who played offense AND defense. That's why they call him The Legend.",
		}
	)
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
	-- a gold dedication plaque beside the doorway (shows the owner's name)
	local dedication = slab(entrance, "DedicationPlaque", 203.7, 206.3, 4, 7.4, OUTER.MinZ - 0.25, OUTER.MinZ, gold, metal, GOLD_SHINE)
	sign(dedication, { Enum.NormalId.Front }, "DEDICATED\nTO THE\nFANS", gold, team, {
		TextColor3 = INK,
		Font = Enum.Font.Garamond,
		InsetX = 0.1,
		InsetY = 0.12,
	})
	BuildUtil.Look(
		dedication,
		"Dedication Plaque",
		"This Hall of Fame honours every player, coach and fan who ever wore the team colours. It was built by the team's owner.",
		{ LookKey = "owner", Distance = 8 }
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
	buildMuseumFloor(ctx)
	buildTrophyCases(ctx)
	buildJerseyWall(ctx)
	buildStatues(ctx)
	buildGoldEntrance(ctx)
end

return HallOfFame
