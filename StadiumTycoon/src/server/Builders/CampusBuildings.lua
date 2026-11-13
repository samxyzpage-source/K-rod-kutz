--[[
	CampusBuildings
	The franchise's own buildings: the Front Office HQ in the plaza (the first, free piece) and
	the four practice-facility buildings that line the north side of the campus road.

	  frontoffice          3-storey glass HQ beside the entrance. Entrance, canopy and a big
	                       FRONT OFFICE sign face the walkway (-X); the team name crowns the roof
	                       and reads from the street (-Z). Lobby: reception desk, trophy case and a
	                       team wall; behind it the GM's corner office (desk, chairs, draft board).
	                       Three team flags and a FRONT OFFICE monument stand out front.
	  practice_lockerroom  red-brick locker room: team-colour locker stalls with jerseys in a U,
	                       benches and the team logo on the floor
	  weightroom           gym with a glass front: power racks, bench presses, a dumbbell rack,
	                       mirror wall and kettlebells
	  trainingroom         white rehab clinic with a red cross on the roof: treatment tables, a cold
	                       tub with ice and a steaming hot tub, bike, treadmill, first-aid cabinet
	  filmroom             theatre: tiered seats facing a big dark screen, projector + light beam,
	                       a coach's lectern, a popcorn machine and a lit marquee

	The four campus buildings share one shell (campusShell): an open doorway and big windows in
	the front wall facing the campus road (-Z) so players can walk in or look in, a team-coloured
	band under the roof and a sign over the door. Each door lines up with the building's buy
	button (Items.lua, z = 190), which stays clear in front of the building.
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)

local CampusBuildings = {}

-- Reserved footprints (plot-local studs; Config.Layout has no values for these)
local FRONT_OFFICE = { MinX = 50, MaxX = 104, MinZ = -195, MaxZ = -158 }
local PRACTICE_LOCKER = { MinX = -200, MaxX = -150, MinZ = 195, MaxZ = 245 }
local WEIGHT_ROOM = { MinX = -140, MaxX = -90, MinZ = 195, MaxZ = 245 }
local TRAINING_ROOM = { MinX = -80, MaxX = -30, MinZ = 195, MaxZ = 245 }
local FILM_ROOM = { MinX = 30, MaxX = 80, MinZ = 195, MaxZ = 245 }

local CAMPUS_INSET = 2 -- campus buildings stand this far inside their footprint (room for the step)
local FLOOR_TOP = 0.3

local PAINT = { CanCollide = false, CastShadow = false }

local WHITE = Color3.fromRGB(248, 248, 248)
local INK = Color3.fromRGB(22, 22, 26)
local DARK_METAL = Color3.fromRGB(62, 64, 70)
local IRON = Color3.fromRGB(44, 44, 50)
local CHROME = Color3.fromRGB(200, 204, 210)
local WARM_LIGHT = Color3.fromRGB(255, 236, 200)
local LAMP = Color3.fromRGB(255, 248, 232)
local CEILING = Color3.fromRGB(226, 226, 222)
local SCREEN_BLACK = Color3.fromRGB(12, 14, 20)
local LEATHER_BLACK = Color3.fromRGB(32, 32, 36)
local LEATHER = Color3.fromRGB(124, 66, 36)
local DARK_WOOD = Color3.fromRGB(92, 62, 40)
local BUSH = Color3.fromRGB(56, 122, 62)
local GOLD_TEXT = Color3.fromRGB(255, 214, 90)
local CROSS_RED = Color3.fromRGB(214, 30, 40)

-- Front office
local HQ_GLASS = Color3.fromRGB(110, 168, 200)
local SLAB_WHITE = Color3.fromRGB(236, 236, 232)
local LOBBY_FLOOR = Color3.fromRGB(232, 230, 224)
local PAVING = Color3.fromRGB(212, 206, 194)
local STONE = Color3.fromRGB(120, 120, 126)
local CORE_GREY = Color3.fromRGB(188, 188, 192)
local SOFA_GREY = Color3.fromRGB(96, 100, 110)

-- Campus buildings
local BRICK = Color3.fromRGB(150, 68, 52)
local LOCKER_FLOOR = Color3.fromRGB(58, 60, 66)
local GYM_WALL = Color3.fromRGB(66, 70, 80)
local RUBBER_FLOOR = Color3.fromRGB(34, 34, 38)
local PLATFORM_WOOD = Color3.fromRGB(176, 128, 78)
local MIRROR = Color3.fromRGB(208, 218, 226)
local CLINIC_WHITE = Color3.fromRGB(236, 238, 240)
local CLINIC_FLOOR = Color3.fromRGB(206, 216, 222)
local CURTAIN = Color3.fromRGB(150, 200, 196)
local COLD_WATER = Color3.fromRGB(120, 196, 245)
local HOT_WATER = Color3.fromRGB(60, 150, 220)
local ICE_BLUE = Color3.fromRGB(220, 240, 255)
local COLD_SIGN = Color3.fromRGB(40, 110, 200)
local THEATRE_WALL = Color3.fromRGB(46, 48, 56)
local THEATRE_STEP = Color3.fromRGB(36, 38, 46)
local MARQUEE_BLACK = Color3.fromRGB(24, 24, 30)
local MARQUEE_GLOW = Color3.fromRGB(255, 214, 90)
local BEAM_WHITE = Color3.fromRGB(255, 250, 222)
local POPCORN_RED = Color3.fromRGB(200, 40, 40)
local POPCORN = Color3.fromRGB(255, 236, 160)

local JERSEY_NUMBERS = { "1", "7", "12", "22", "34", "44", "52", "88", "9", "21", "55", "80" }

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

--[[
	Writes `text` on each face in `faces` of `part`, coloured to read well on `background`.
	opts: TextColor3, Font, PixelsPerStud, Wrap, InsetX / InsetY (fraction of the face left
	      empty around the text, default 0.06 / 0.12), Top (fraction from the top where the text
	      block starts, overrides InsetY), Height (fraction of the face the text block fills)
]]
local function sign(part, faces, text, background, team, opts)
	opts = opts or {}
	local color = opts.TextColor3 or textColorOn(background, { team.Trim, team.Primary, team.Secondary })
	local insetX = opts.InsetX or 0.06
	local insetY = opts.InsetY or 0.12
	local top = opts.Top or insetY
	local height = opts.Height or (1 - 2 * insetY)
	for _, face in ipairs(faces) do
		local _, label = BuildUtil.SurfaceText(part, face, text, {
			LabelName = part.Name .. face.Name,
			TextColor3 = color,
			Font = opts.Font or Enum.Font.GothamBlack,
			PixelsPerStud = opts.PixelsPerStud or 20,
		})
		label.Size = UDim2.new(1 - 2 * insetX, 0, height, 0)
		label.Position = UDim2.new(insetX, 0, top, 0)
		if opts.Wrap then
			label.TextWrapped = true
		end
	end
end

local function shade(color, factor)
	return Color3.new(math.clamp(color.R * factor, 0, 1), math.clamp(color.G * factor, 0, 1), math.clamp(color.B * factor, 0, 1))
end

local function inset(box, amount)
	return { MinX = box.MinX + amount, MaxX = box.MaxX - amount, MinZ = box.MinZ + amount, MaxZ = box.MaxZ - amount }
end

-- Block in a local `frame`: bottom at local height y0, centred on local (x, z).
local function lblock(ctx, frame, name, size, x, y0, z, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Size = size
	props.CFrame = frame * CFrame.new(x, y0 + size.Y / 2, z)
	props.Color = color
	props.Material = material
	return BuildUtil.Part(ctx, props)
end

--[[
	One-storey building shell. `frame` is a plot-local CFrame at ground level in the middle of the
	front wall's OUTER face, its LookVector pointing out of the building (so every part's Front
	face is the street side). The building spans local x in [-Width/2, Width/2], z in [0, Depth].
	o: Width, Depth, WallH, Thickness, WallColor, WallMaterial, FloorColor, FloorMaterial,
	   OpeningTop, Openings = { { From, To, Bottom, Mullions } } (local x, sorted; Bottom = 0 is
	   an open doorway, otherwise a window with a sill), GlassColor, GlassTransparency,
	   BandColor, BandH, RoofColor, CeilingColor, LightBrightness
	Returns the team-coloured roof band (its Front face is a good place for the team name).
]]
local function campusShell(ctx, frame, o)
	local C = ctx.config.Colors
	local W, D, H = o.Width, o.Depth, o.WallH
	local t = o.Thickness or 1
	local top = o.OpeningTop
	local wallColor, wallMaterial = o.WallColor, o.WallMaterial
	local glassProps = { Transparency = o.GlassTransparency or 0.4 }

	-- the floor stops 0.05 inside the outer wall faces so its edges never share their plane
	lblock(ctx, frame, "Floor", Vector3.new(W - 0.1, FLOOR_TOP, D - 0.1), 0, 0, D / 2, o.FloorColor, o.FloorMaterial)
	lblock(ctx, frame, "BackWall", Vector3.new(W, H, t), 0, 0, D - t / 2, wallColor, wallMaterial)
	for _, s in ipairs({ -1, 1 }) do
		lblock(ctx, frame, "SideWall", Vector3.new(t, H, D - 2 * t), s * (W / 2 - t / 2), 0, D / 2, wallColor, wallMaterial)
	end

	-- front wall: a lintel over all openings, piers between them, sill + glass under each window
	lblock(ctx, frame, "Lintel", Vector3.new(W, H - top, t), 0, top, t / 2, wallColor, wallMaterial)
	local function pier(a, b)
		if b - a > 0.01 then
			lblock(ctx, frame, "Pier", Vector3.new(b - a, top, t), (a + b) / 2, 0, t / 2, wallColor, wallMaterial)
		end
	end
	local x = -W / 2
	for _, op in ipairs(o.Openings) do
		pier(x, op.From)
		local w = op.To - op.From
		local mid = (op.From + op.To) / 2
		if op.Bottom > 0 then
			lblock(ctx, frame, "Sill", Vector3.new(w, op.Bottom, t), mid, 0, t / 2, wallColor, wallMaterial)
			lblock(
				ctx,
				frame,
				"Window",
				Vector3.new(w, top - op.Bottom, 0.3),
				mid,
				op.Bottom,
				t / 2,
				o.GlassColor or C.Glass,
				Enum.Material.Glass,
				glassProps
			)
			local n = op.Mullions or 0
			for m = 1, n do
				lblock(
					ctx,
					frame,
					"Mullion",
					Vector3.new(0.3, top - op.Bottom, t * 0.6),
					op.From + m * w / (n + 1),
					op.Bottom,
					t / 2,
					DARK_METAL,
					Enum.Material.Metal
				)
			end
		end
		x = op.To
	end
	pier(x, W / 2)

	-- roof: team band (also the ceiling inside), concrete cap, one big ceiling light
	local bandH = o.BandH or 1.6
	local band = lblock(ctx, frame, "RoofBand", Vector3.new(W + 0.6, bandH, D + 0.6), 0, H, D / 2, o.BandColor, Enum.Material.SmoothPlastic)
	lblock(
		ctx,
		frame,
		"Roof",
		Vector3.new(W + 1.2, 0.6, D + 1.2),
		0,
		H + bandH,
		D / 2,
		o.RoofColor or C.ConcreteDark,
		Enum.Material.Concrete
	)
	-- a plain ceiling just under the band (so the room isn't roofed in team colour) + light panel
	lblock(
		ctx,
		frame,
		"Ceiling",
		Vector3.new(W - 2 * t, 0.2, D - 2 * t),
		0,
		H - 0.25,
		D / 2,
		o.CeilingColor or CEILING,
		Enum.Material.SmoothPlastic
	)
	local lamp = lblock(ctx, frame, "CeilingLight", Vector3.new(W * 0.4, 0.2, D * 0.3), 0, H - 0.45, D / 2, LAMP, Enum.Material.Neon, PAINT)
	BuildUtil.Light(lamp, "PointLight", {
		Name = "RoomLight",
		Range = math.min(math.max(W, D) * 0.8, 60),
		Brightness = o.LightBrightness or 1.2,
		Color = WARM_LIGHT,
	})
	return band
end

-- Concrete step in front of a doorway centred on local x = doorX (outside the front wall).
local function frontStep(ctx, frame, doorX, doorWidth)
	local C = ctx.config.Colors
	lblock(ctx, frame, "FrontStep", Vector3.new(doorWidth + 2, FLOOR_TOP, 2), doorX, 0, -1, C.Concrete, Enum.Material.Concrete)
end

--[[
	A bank of open locker stalls against a wall. `frame` is a plot-local CFrame at floor level on
	the wall face in the middle of the bank, its LookVector pointing into the room.
	o: Name, Length, Stalls, Height, Depth, BackColor, FrameColor, ShelfColor, SeatColor,
	   Jerseys (colours, cycled), Numbers (cycled), NumberColor, EndPanels, HelmetEvery,
	   HelmetColor, Team
]]
local function lockerBank(ctx, frame, o)
	local bank = BuildUtil.Child(ctx, o.Name)
	local n, len, H, D = o.Stalls, o.Length, o.Height, o.Depth
	local w = len / n
	local inner = D - 0.4 -- depth in front of the back panel
	lblock(bank, frame, "LockerBack", Vector3.new(len, H, 0.4), 0, 0, -0.2, o.BackColor, Enum.Material.Wood)
	lblock(bank, frame, "LockerSeat", Vector3.new(len, 1.6, inner), 0, 0, -0.4 - inner / 2, o.SeatColor, Enum.Material.Fabric)
	lblock(
		bank,
		frame,
		"LockerShelf",
		Vector3.new(len, 1.2, inner),
		0,
		H - 1.2,
		-0.4 - inner / 2,
		o.ShelfColor,
		Enum.Material.SmoothPlastic
	)
	-- dividers stand 0.15 proud of the seat + shelf fronts and stop 0.1 under the shelf top;
	-- end panels poke 0.05 past the bank ends (no shared planes with the back/seat/shelf)
	local first, last = 1, n - 1
	if o.EndPanels then
		first, last = 0, n
	end
	for i = first, last do
		local x = -len / 2 + i * w
		if i == 0 then
			x = -len / 2 + 0.1
		elseif i == n then
			x = len / 2 - 0.1
		end
		lblock(
			bank,
			frame,
			"LockerDivider",
			Vector3.new(0.3, H - 0.1, inner + 0.15),
			x,
			0,
			-0.4 - (inner + 0.15) / 2,
			o.FrameColor,
			Enum.Material.Wood
		)
	end
	for i = 1, n do
		local x = -len / 2 + (i - 0.5) * w
		local color = o.Jerseys[(i - 1) % #o.Jerseys + 1]
		local jersey =
			lblock(bank, frame, "Jersey", Vector3.new(math.min(w - 1.4, 2.8), 3, 0.25), x, 3.3, -0.75, color, Enum.Material.Fabric)
		local number = o.Numbers[(i - 1) % #o.Numbers + 1]
		sign(jersey, { Enum.NormalId.Front }, number, color, o.Team, { InsetX = 0.22, InsetY = 0.18, TextColor3 = o.NumberColor })
		if o.HelmetEvery and i % o.HelmetEvery == 0 then
			BuildUtil.Ball(bank, {
				Name = "Helmet",
				CFrame = frame * CFrame.new(x, H + 0.85, -0.4 - inner / 2),
				Diameter = 1.7,
				Color = o.HelmetColor,
				Material = Enum.Material.SmoothPlastic,
				Reflectance = 0.1,
			})
		end
	end
end

-- Team logo painted on a floor: Secondary ring, Primary disc and the team name on top.
-- `rotation` turns the name so it reads upright from the entrance (Top-face text reads upright
-- from the carrier's +Z side).
local function floorLogo(ctx, center, diameter, rotation, team, text)
	BuildUtil.Cylinder(ctx, {
		Name = "LogoRing",
		Position = Vector3.new(center.X, FLOOR_TOP + 0.02, center.Z),
		Height = 0.04,
		Diameter = diameter,
		Axis = "Y",
		Color = team.Secondary,
		Material = Enum.Material.SmoothPlastic,
		CanCollide = false,
		CastShadow = false,
	})
	BuildUtil.Cylinder(ctx, {
		Name = "LogoDisc",
		Position = Vector3.new(center.X, FLOOR_TOP + 0.04, center.Z),
		Height = 0.08,
		Diameter = diameter - 1.6,
		Axis = "Y",
		Color = team.Primary,
		Material = Enum.Material.SmoothPlastic,
		CanCollide = false,
		CastShadow = false,
	})
	local carrier = BuildUtil.Part(ctx, {
		Name = "LogoName",
		Size = Vector3.new(diameter * 0.72, 0.02, diameter * 0.3),
		CFrame = CFrame.new(center.X, FLOOR_TOP + 0.1, center.Z) * rotation,
		Transparency = 1,
		CanCollide = false,
		CastShadow = false,
	})
	sign(carrier, { Enum.NormalId.Top }, text, team.Primary, team, { InsetX = 0.02, InsetY = 0.05, PixelsPerStud = 12 })
end

-- Weight plate / roller / barbell: a cylinder along X.
local function xCylinder(ctx, name, position, length, diameter, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Position = position
	props.Height = length
	props.Diameter = diameter
	props.Axis = "X"
	props.Color = color
	props.Material = material
	return BuildUtil.Cylinder(ctx, props)
end

---------------------------------------------------------------------------------------------
-- Front Office (plaza, east of the walkway)
---------------------------------------------------------------------------------------------

function CampusBuildings.frontoffice(ctx)
	local C = ctx.config.Colors
	local team = ctx.colors
	local fp = FRONT_OFFICE

	-- Glass line of the HQ. The forecourt (x 50..58) in front of the entrance holds the flags.
	local x0, x1 = fp.MinX + 8, fp.MaxX - 2 -- 58, 102
	local z0, z1 = fp.MinZ + 3, fp.MaxZ - 3 -- -192, -161
	local cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
	local width, depth = x1 - x0, z1 - z0
	local floor2, floor3, roofY = 9.5, 17.6, 25.4 -- bottoms of the two floor slabs and the crown
	local slabT = 0.6
	local crownTop = 29
	-- the door sits north of the vault (z -187..-177) so the walkway sees it and its sign
	local doorZ = z1 - 11 -- -172
	local doorHalf = 4
	local doorTop = 8

	local shellModel = BuildUtil.Child(ctx, "Building")

	-- Ground floor slab + forecourt paving + a team carpet runner to the door
	BuildUtil.Box(
		shellModel,
		"Floor",
		Vector3.new(width - 0.4, FLOOR_TOP, depth - 0.4),
		Vector3.new(cx, FLOOR_TOP / 2, cz),
		LOBBY_FLOOR,
		Enum.Material.Marble
	)
	local courtMinX = fp.MinX + 0.2
	BuildUtil.Box(
		shellModel,
		"Forecourt",
		Vector3.new(x0 - 0.2 - courtMinX, 0.12, depth + 1.2),
		Vector3.new((courtMinX + x0 - 0.2) / 2, 0.06, cz),
		PAVING,
		Enum.Material.Pavement,
		PAINT
	)
	BuildUtil.Box(
		shellModel,
		"EntranceRunner",
		Vector3.new(x0 + 0.2 - courtMinX, 0.05, doorHalf * 2 - 1),
		Vector3.new((courtMinX + x0 + 0.2) / 2, 0.145, doorZ),
		team.Primary,
		Enum.Material.Fabric,
		PAINT
	)

	-- Floor slabs (stick 0.4 out of the glass as white bands) and the team-coloured crown
	for i, y in ipairs({ floor2, floor3 }) do
		BuildUtil.Box(
			shellModel,
			"Slab" .. (i + 1),
			Vector3.new(width + 0.8, slabT, depth + 0.8),
			Vector3.new(cx, y + slabT / 2, cz),
			SLAB_WHITE,
			Enum.Material.SmoothPlastic
		)
	end
	local crown = BuildUtil.Box(
		shellModel,
		"Crown",
		Vector3.new(width + 1.6, crownTop - roofY, depth + 1.6),
		Vector3.new(cx, (roofY + crownTop) / 2, cz),
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	sign(crown, { Enum.NormalId.Front }, ctx.teamName .. "  FRONT OFFICE", team.Primary, team, { InsetX = 0.03, InsetY = 0.14 })
	sign(crown, { Enum.NormalId.Left, Enum.NormalId.Back }, ctx.teamName, team.Primary, team, { InsetX = 0.05, InsetY = 0.14 })

	-- Curtain walls: tinted glass on the two office floors, clear glass in the lobby (south +
	-- west, with the doorway), solid walls on the north + east sides of the lobby
	local upperBottom = floor2 + slabT
	local upperH = roofY - upperBottom
	local upperGlass = { Transparency = 0.35, Reflectance = 0.15 }
	local lobbyGlass = { Transparency = 0.5 }
	local glass = BuildUtil.Child(shellModel, "Glass")
	for _, x in ipairs({ x0, x1 }) do
		BuildUtil.Box(
			glass,
			"UpperGlass",
			Vector3.new(0.3, upperH, depth - 1.2),
			Vector3.new(x, upperBottom + upperH / 2, cz),
			HQ_GLASS,
			Enum.Material.Glass,
			upperGlass
		)
	end
	for _, z in ipairs({ z0, z1 }) do
		BuildUtil.Box(
			glass,
			"UpperGlass",
			Vector3.new(width - 1.2, upperH, 0.3),
			Vector3.new(cx, upperBottom + upperH / 2, z),
			HQ_GLASS,
			Enum.Material.Glass,
			upperGlass
		)
	end
	BuildUtil.Box(
		glass,
		"LobbyGlass",
		Vector3.new(width - 1.2, floor2, 0.3),
		Vector3.new(cx, floor2 / 2, z0),
		C.Glass,
		Enum.Material.Glass,
		lobbyGlass
	)
	local doorMinZ, doorMaxZ = doorZ - doorHalf, doorZ + doorHalf
	for _, range in ipairs({ { z0 + 0.6, doorMinZ }, { doorMaxZ, z1 - 0.6 } }) do
		BuildUtil.Box(
			glass,
			"LobbyGlass",
			Vector3.new(0.3, floor2, range[2] - range[1]),
			Vector3.new(x0, floor2 / 2, (range[1] + range[2]) / 2),
			C.Glass,
			Enum.Material.Glass,
			lobbyGlass
		)
	end
	BuildUtil.Box(
		glass,
		"Transom",
		Vector3.new(0.3, floor2 - doorTop, doorHalf * 2),
		Vector3.new(x0, (doorTop + floor2) / 2, doorZ),
		C.Glass,
		Enum.Material.Glass,
		lobbyGlass
	)
	BuildUtil.Box(
		shellModel,
		"LobbyWall",
		Vector3.new(width - 1.2, floor2, 0.6),
		Vector3.new(cx, floor2 / 2, z1),
		WHITE,
		Enum.Material.Plaster
	)
	BuildUtil.Box(
		shellModel,
		"LobbyWall",
		Vector3.new(0.6, floor2, depth - 1.2),
		Vector3.new(x1, floor2 / 2, cz),
		WHITE,
		Enum.Material.Plaster
	)

	-- Dark steel corner columns and vertical fins
	local steel = BuildUtil.Child(shellModel, "Steel")
	for _, corner in ipairs({ { x0, z0 }, { x1, z0 }, { x0, z1 }, { x1, z1 } }) do
		BuildUtil.Block(
			steel,
			"CornerColumn",
			Vector3.new(1.2, roofY, 1.2),
			Vector3.new(corner[1], 0, corner[2]),
			DARK_METAL,
			Enum.Material.Metal
		)
	end
	for k = 1, 4 do
		BuildUtil.Block(
			steel,
			"Fin",
			Vector3.new(0.4, roofY, 1),
			Vector3.new(x0 + k * width / 5, 0, z0 - 0.5),
			DARK_METAL,
			Enum.Material.Metal
		)
	end
	for _, z in ipairs({ z0 + 8, z1 - 4 }) do
		BuildUtil.Block(steel, "Fin", Vector3.new(1, roofY, 0.4), Vector3.new(x0 - 0.5, 0, z), DARK_METAL, Enum.Material.Metal)
	end
	for _, x in ipairs({ cx - 7, cx + 7 }) do
		BuildUtil.Block(steel, "Fin", Vector3.new(0.4, roofY, 1), Vector3.new(x, 0, z1 + 0.5), DARK_METAL, Enum.Material.Metal)
	end
	for _, z in ipairs({ cz - 6, cz + 6 }) do
		BuildUtil.Block(steel, "Fin", Vector3.new(1, roofY, 0.4), Vector3.new(x1 + 0.5, 0, z), DARK_METAL, Enum.Material.Metal)
	end

	-- Lift core in the north-east corner (visible through every floor) with its doors
	local coreMinX, coreMaxX = x1 - 8, x1 - 0.6
	local coreMinZ, coreMaxZ = z1 - 8, z1 - 0.6
	BuildUtil.Block(
		shellModel,
		"LiftCore",
		Vector3.new(coreMaxX - coreMinX, roofY - FLOOR_TOP, coreMaxZ - coreMinZ),
		Vector3.new((coreMinX + coreMaxX) / 2, 0, (coreMinZ + coreMaxZ) / 2),
		CORE_GREY,
		Enum.Material.Concrete,
		nil,
		FLOOR_TOP
	)
	BuildUtil.Block(
		shellModel,
		"LiftDoors",
		Vector3.new(0.15, 7, 3.2),
		Vector3.new(coreMinX - 0.075, 0, (coreMinZ + coreMaxZ) / 2),
		CHROME,
		Enum.Material.Metal,
		nil,
		FLOOR_TOP
	)

	-- Lobby ceiling light
	local lamp = BuildUtil.Box(
		shellModel,
		"CeilingLight",
		Vector3.new(14, 0.2, 9),
		Vector3.new(x0 + 14, floor2 - 0.1, doorZ - 2),
		LAMP,
		Enum.Material.Neon,
		PAINT
	)
	BuildUtil.Light(lamp, "PointLight", { Name = "LobbyLight", Range = 30, Brightness = 1.4, Color = WARM_LIGHT })

	-- Entrance: canopy with the big FRONT OFFICE sign standing on it, facing the walkway (-X)
	local entrance = BuildUtil.Child(ctx, "Entrance")
	local canopyTop = doorTop + 0.8
	BuildUtil.Box(
		entrance,
		"Canopy",
		Vector3.new(6, 0.5, 16),
		Vector3.new(x0 - 3, canopyTop - 0.25, doorZ),
		team.Secondary,
		Enum.Material.SmoothPlastic
	)
	local signBox = BuildUtil.Block(
		entrance,
		"FrontOfficeSign",
		Vector3.new(0.8, 3.6, 15),
		Vector3.new(x0 - 4.2, 0, doorZ),
		team.Primary,
		Enum.Material.SmoothPlastic,
		nil,
		canopyTop
	)
	sign(signBox, { Enum.NormalId.Left }, "FRONT OFFICE", team.Primary, team, { InsetX = 0.04, InsetY = 0.14 })
	for _, z in ipairs({ doorMinZ - 6, doorMaxZ + 5.5 }) do
		BuildUtil.Block(entrance, "Planter", Vector3.new(2.4, 1.6, 2.4), Vector3.new(x0 - 2.4, 0, z), STONE, Enum.Material.Concrete)
		BuildUtil.Ball(entrance, {
			Name = "Shrub",
			Position = Vector3.new(x0 - 2.4, 2.6, z),
			Diameter = 2.6,
			Color = BUSH,
			Material = Enum.Material.Grass,
		})
	end

	-- Street monument (reads from the street, -Z)
	BuildUtil.Block(
		entrance,
		"MonumentBase",
		Vector3.new(7, 0.8, 1.6),
		Vector3.new(fp.MinX + 4, 0, fp.MinZ + 1),
		STONE,
		Enum.Material.Granite
	)
	local monument = BuildUtil.Block(
		entrance,
		"Monument",
		Vector3.new(6.4, 2.6, 0.8),
		Vector3.new(fp.MinX + 4, 0, fp.MinZ + 1),
		team.Primary,
		Enum.Material.SmoothPlastic,
		nil,
		0.8
	)
	sign(monument, { Enum.NormalId.Front }, "FRONT OFFICE", team.Primary, team, { InsetX = 0.08, InsetY = 0.22 })

	-- Three team flags on the forecourt, flying toward the walkway + stadium (diagonal -X/+Z)
	local flags = BuildUtil.Child(ctx, "Flags")
	local flagColors = { team.Primary, team.Trim, team.Secondary }
	local flyDir = Vector3.new(-1, 0, 1).Unit
	for i, z in ipairs({ z0 + 0.5, z0 + 4, z0 + 7.5 }) do
		local px = x0 - 4.5
		local h = (i == 2) and 19 or 17
		BuildUtil.Cylinder(flags, {
			Name = "FlagPole",
			Position = Vector3.new(px, h / 2, z),
			Height = h,
			Diameter = 0.35,
			Axis = "Y",
			Color = CHROME,
			Material = Enum.Material.Metal,
		})
		BuildUtil.Ball(
			flags,
			{ Name = "FlagFinial", Position = Vector3.new(px, h + 0.3, z), Diameter = 0.7, Color = C.Gold, Material = Enum.Material.Metal }
		)
		local center = Vector3.new(px, h - 1.6, z) + flyDir * 2.3
		BuildUtil.Part(flags, {
			Name = "Flag",
			Size = Vector3.new(4.2, 2.6, 0.12),
			CFrame = CFrame.new(center) * CFrame.Angles(0, math.atan2(-flyDir.Z, flyDir.X), 0),
			Color = flagColors[i],
			Material = Enum.Material.Fabric,
			CanCollide = false,
		})
	end

	-- Lobby: reception desk facing the door, team wall behind it, trophy case on the north wall
	local lobby = BuildUtil.Child(ctx, "Lobby")
	local deskX = x0 + 9.5
	local desk = BuildUtil.Block(
		lobby,
		"ReceptionDesk",
		Vector3.new(3, 3.2, 9),
		Vector3.new(deskX, 0, doorZ),
		team.Primary,
		Enum.Material.SmoothPlastic,
		nil,
		FLOOR_TOP
	)
	sign(desk, { Enum.NormalId.Left }, "WELCOME", team.Primary, team, { InsetX = 0.12, InsetY = 0.3 })
	BuildUtil.Block(
		lobby,
		"ReceptionTop",
		Vector3.new(3.6, 0.3, 9.6),
		Vector3.new(deskX, 0, doorZ),
		WHITE,
		Enum.Material.Marble,
		nil,
		FLOOR_TOP + 3.2
	)
	BuildUtil.Block(
		lobby,
		"ReceptionScreen",
		Vector3.new(0.2, 1.4, 2),
		Vector3.new(deskX + 1, 0, doorZ + 2),
		SCREEN_BLACK,
		Enum.Material.SmoothPlastic,
		nil,
		FLOOR_TOP + 3.5
	)
	BuildUtil.Block(
		lobby,
		"ReceptionChair",
		Vector3.new(1.8, 2, 1.8),
		Vector3.new(deskX + 3.6, 0, doorZ - 1),
		LEATHER_BLACK,
		Enum.Material.Leather,
		nil,
		FLOOR_TOP
	)
	BuildUtil.Block(
		lobby,
		"ReceptionChairBack",
		Vector3.new(0.4, 2.6, 1.8),
		Vector3.new(deskX + 4.7, 0, doorZ - 1),
		LEATHER_BLACK,
		Enum.Material.Leather,
		nil,
		FLOOR_TOP + 2
	)

	local wallX = cx -- the team wall splits the lobby from the GM's office
	local teamWall = BuildUtil.Block(
		lobby,
		"TeamWall",
		Vector3.new(1, floor2 - FLOOR_TOP, 13),
		Vector3.new(wallX, 0, doorZ),
		team.Primary,
		Enum.Material.SmoothPlastic,
		nil,
		FLOOR_TOP
	)
	-- team name across the lower half, a gold badge above it
	sign(teamWall, { Enum.NormalId.Left }, ctx.teamName, team.Primary, team, { InsetX = 0.06, Top = 0.48, Height = 0.3 })
	BuildUtil.Cylinder(lobby, {
		Name = "TeamBadge",
		Position = Vector3.new(wallX - 0.65, 7.2, doorZ),
		Height = 0.3,
		Diameter = 3.4,
		Axis = "X",
		Color = C.Gold,
		Material = Enum.Material.Metal,
		Reflectance = 0.15,
	})

	local caseX = x0 + 11
	local caseBackZ = z1 - 0.3 -- inner face of the north lobby wall
	local caseZ = caseBackZ - 1.25
	BuildUtil.Block(
		lobby,
		"TrophyCaseBase",
		Vector3.new(14, 3, 2.5),
		Vector3.new(caseX, 0, caseZ),
		DARK_WOOD,
		Enum.Material.Wood,
		nil,
		FLOOR_TOP
	)
	BuildUtil.Block(
		lobby,
		"TrophyCaseBack",
		Vector3.new(13.6, 4.8, 0.2),
		Vector3.new(caseX, 0, caseBackZ - 0.27),
		team.Primary,
		Enum.Material.SmoothPlastic,
		nil,
		FLOOR_TOP + 3.1
	)
	BuildUtil.Block(
		lobby,
		"TrophyCaseGlass",
		Vector3.new(14, 5, 2.4),
		Vector3.new(caseX, 0, caseZ - 0.05),
		C.Glass,
		Enum.Material.Glass,
		{ Transparency = 0.7 },
		FLOOR_TOP + 3
	)
	local header = BuildUtil.Block(
		lobby,
		"TrophyCaseHeader",
		Vector3.new(14, 1, 2.5),
		Vector3.new(caseX, 0, caseZ),
		team.Secondary,
		Enum.Material.SmoothPlastic,
		nil,
		FLOOR_TOP + 8
	)
	sign(header, { Enum.NormalId.Front }, "CHAMPIONSHIPS", team.Secondary, team, { InsetX = 0.1, InsetY = 0.15 })
	local shelfY = FLOOR_TOP + 3
	for i, dx in ipairs({ -4, 0, 4 }) do
		local tx = caseX + dx
		BuildUtil.Cylinder(lobby, {
			Name = "TrophyStem",
			Position = Vector3.new(tx, shelfY + 1.1, caseZ - 0.1),
			Height = 2.2,
			Diameter = 0.5,
			Axis = "Y",
			Color = C.Gold,
			Material = Enum.Material.Metal,
			Reflectance = 0.2,
		})
		if i == 2 then
			BuildUtil.Cylinder(lobby, {
				Name = "TrophyCup",
				Position = Vector3.new(tx, shelfY + 3, caseZ - 0.1),
				Height = 1.6,
				Diameter = 1.8,
				Axis = "Y",
				Color = C.Gold,
				Material = Enum.Material.Metal,
				Reflectance = 0.2,
			})
		else
			BuildUtil.Ball(lobby, {
				Name = "TrophyBall",
				Position = Vector3.new(tx, shelfY + 2.8, caseZ - 0.1),
				Diameter = 1.5,
				Color = CHROME,
				Material = Enum.Material.Metal,
				Reflectance = 0.2,
			})
		end
	end

	-- Lobby sofa + coffee table along the street window
	BuildUtil.Block(
		lobby,
		"Sofa",
		Vector3.new(8, 1.6, 2.4),
		Vector3.new(x0 + 7, 0, z0 + 2),
		SOFA_GREY,
		Enum.Material.Fabric,
		nil,
		FLOOR_TOP
	)
	BuildUtil.Block(
		lobby,
		"SofaBack",
		Vector3.new(8, 1.8, 0.7),
		Vector3.new(x0 + 7, 0, z0 + 0.95),
		SOFA_GREY,
		Enum.Material.Fabric,
		nil,
		FLOOR_TOP + 1.6
	)
	BuildUtil.Block(
		lobby,
		"CoffeeTable",
		Vector3.new(4, 1.2, 2),
		Vector3.new(x0 + 7, 0, z0 + 5.5),
		DARK_WOOD,
		Enum.Material.Wood,
		nil,
		FLOOR_TOP
	)

	-- GM's corner office (south-east, behind the team wall; seen from the street through the glass)
	local gm = BuildUtil.Child(ctx, "GMOffice")
	local gmX, gmZ = cx + 12, z0 + 8
	BuildUtil.Box(
		gm,
		"GMRug",
		Vector3.new(14, 0.04, 12),
		Vector3.new(gmX + 0.5, FLOOR_TOP + 0.02, gmZ),
		team.Primary,
		Enum.Material.Carpet,
		PAINT
	)
	BuildUtil.Block(gm, "GMDesk", Vector3.new(2.4, 2.6, 6), Vector3.new(gmX, 0, gmZ), DARK_WOOD, Enum.Material.Wood, nil, FLOOR_TOP)
	BuildUtil.Block(gm, "GMDeskTop", Vector3.new(3.4, 0.3, 7.2), Vector3.new(gmX, 0, gmZ), C.Wood, Enum.Material.Wood, nil, FLOOR_TOP + 2.6)
	local deskTop = FLOOR_TOP + 2.9
	BuildUtil.Block(
		gm,
		"GMScreen",
		Vector3.new(0.2, 1.5, 2.4),
		Vector3.new(gmX + 0.8, 0, gmZ),
		SCREEN_BLACK,
		Enum.Material.SmoothPlastic,
		nil,
		deskTop
	)
	local plate = BuildUtil.Block(
		gm,
		"GMNameplate",
		Vector3.new(0.3, 0.6, 2.8),
		Vector3.new(gmX - 1.2, 0, gmZ),
		C.Gold,
		Enum.Material.Metal,
		nil,
		deskTop
	)
	sign(plate, { Enum.NormalId.Left }, "GENERAL MANAGER", C.Gold, team, { TextColor3 = INK, InsetX = 0.04, InsetY = 0.15 })
	BuildUtil.Ball(gm, {
		Name = "GMFootball",
		Position = Vector3.new(gmX, deskTop + 0.45, gmZ - 2.5),
		Diameter = 0.9,
		Color = LEATHER,
		Material = Enum.Material.Leather,
	})
	BuildUtil.Block(
		gm,
		"GMChair",
		Vector3.new(1.8, 2, 1.8),
		Vector3.new(gmX + 3.2, 0, gmZ),
		LEATHER_BLACK,
		Enum.Material.Leather,
		nil,
		FLOOR_TOP
	)
	BuildUtil.Block(
		gm,
		"GMChairBack",
		Vector3.new(0.4, 3.2, 1.8),
		Vector3.new(gmX + 4.3, 0, gmZ),
		LEATHER_BLACK,
		Enum.Material.Leather,
		nil,
		FLOOR_TOP + 2
	)
	for _, dz in ipairs({ -2.5, 2.5 }) do
		BuildUtil.Block(
			gm,
			"GuestChair",
			Vector3.new(1.6, 1.8, 1.6),
			Vector3.new(gmX - 3.6, 0, gmZ + dz),
			team.Secondary,
			Enum.Material.Leather,
			nil,
			FLOOR_TOP
		)
		BuildUtil.Block(
			gm,
			"GuestChairBack",
			Vector3.new(0.35, 2, 1.6),
			Vector3.new(gmX - 4.6, 0, gmZ + dz),
			team.Secondary,
			Enum.Material.Leather,
			nil,
			FLOOR_TOP + 1.8
		)
	end
	local board =
		BuildUtil.Box(gm, "DraftBoard", Vector3.new(0.2, 5, 9), Vector3.new(x1 - 0.4, 5.5, z0 + 6.5), WHITE, Enum.Material.SmoothPlastic)
	sign(board, { Enum.NormalId.Left }, "DRAFT BOARD\nRD 1 - QB\nRD 2 - WR\nRD 3 - LB", WHITE, team, {
		TextColor3 = INK,
		Font = Enum.Font.GothamBold,
		InsetX = 0.08,
		InsetY = 0.08,
	})

	-- Office floors: desks + a boardroom table, seen as silhouettes through the tinted glass
	local offices = BuildUtil.Child(ctx, "Offices")
	for _, x in ipairs({ x0 + 12, x0 + 30 }) do
		BuildUtil.Block(
			offices,
			"OfficeDesk",
			Vector3.new(7, 2.6, 2.6),
			Vector3.new(x, 0, z0 + 3.5),
			WHITE,
			Enum.Material.SmoothPlastic,
			nil,
			upperBottom
		)
	end
	BuildUtil.Block(
		offices,
		"BoardroomTable",
		Vector3.new(12, 2.6, 4),
		Vector3.new(cx, 0, z0 + 6),
		DARK_WOOD,
		Enum.Material.Wood,
		nil,
		floor3 + slabT
	)
end

---------------------------------------------------------------------------------------------
-- Practice Locker Room
---------------------------------------------------------------------------------------------

function CampusBuildings.practice_lockerroom(ctx)
	local team = ctx.colors
	local b = inset(PRACTICE_LOCKER, CAMPUS_INSET)
	local cx = (b.MinX + b.MaxX) / 2
	local W, D = b.MaxX - b.MinX, b.MaxZ - b.MinZ
	local frame = CFrame.new(cx, 0, b.MinZ)
	local H, top = 13, 9.5
	local doorHalf = 5

	local band = campusShell(ctx, frame, {
		Width = W,
		Depth = D,
		WallH = H,
		OpeningTop = top,
		WallColor = BRICK,
		WallMaterial = Enum.Material.Brick,
		FloorColor = LOCKER_FLOOR,
		FloorMaterial = Enum.Material.Carpet,
		Openings = {
			{ From = -W / 2 + 4, To = -W / 2 + 14, Bottom = 3, Mullions = 1 },
			{ From = -doorHalf, To = doorHalf, Bottom = 0 },
			{ From = W / 2 - 14, To = W / 2 - 4, Bottom = 3, Mullions = 1 },
		},
		BandColor = team.Primary,
		BandH = 1.8,
	})
	sign(band, { Enum.NormalId.Front }, ctx.teamName, team.Primary, team, { InsetY = 0.1 })
	frontStep(ctx, frame, 0, doorHalf * 2)
	lblock(ctx, frame, "DoorCanopy", Vector3.new(doorHalf * 2 + 4, 0.4, 2), 0, top, -1, team.Secondary, Enum.Material.SmoothPlastic)
	local board = lblock(ctx, frame, "Sign", Vector3.new(24, 2.6, 0.4), 0, top + 0.6, -0.2, team.Trim, Enum.Material.SmoothPlastic)
	sign(board, { Enum.NormalId.Front }, "LOCKER ROOM", team.Trim, team, { InsetX = 0.05, InsetY = 0.12 })

	-- U of team-colour lockers: along the back wall and both side walls
	local innerMinX, innerMaxX = b.MinX + 1, b.MaxX - 1
	local innerMaxZ = b.MaxZ - 1
	local lockerH, lockerD = 8.5, 2.8
	local function lockerOpts(name, length, stalls, extra)
		local o = {
			Name = name,
			Length = length,
			Stalls = stalls,
			Height = lockerH,
			Depth = lockerD,
			BackColor = shade(team.Primary, 0.35),
			FrameColor = team.Primary,
			ShelfColor = team.Secondary,
			SeatColor = shade(team.Primary, 0.7),
			Jerseys = { team.Primary, team.Trim },
			Numbers = JERSEY_NUMBERS,
			HelmetColor = team.Primary,
			Team = team,
		}
		for k, v in pairs(extra or {}) do
			o[k] = v
		end
		return o
	end
	lockerBank(ctx, CFrame.new(cx, FLOOR_TOP, innerMaxZ), lockerOpts("BackLockers", innerMaxX - innerMinX, 8, { HelmetEvery = 2 }))
	local sideStart, sideEnd = b.MinZ + 8, innerMaxZ - lockerD
	local sideZ = (sideStart + sideEnd) / 2
	lockerBank(
		ctx,
		CFrame.new(innerMinX, FLOOR_TOP, sideZ) * CFrame.Angles(0, -math.pi / 2, 0),
		lockerOpts("WestLockers", sideEnd - sideStart, 6, { EndPanels = true })
	)
	lockerBank(
		ctx,
		CFrame.new(innerMaxX, FLOOR_TOP, sideZ) * CFrame.Angles(0, math.pi / 2, 0),
		lockerOpts("EastLockers", sideEnd - sideStart, 6, { EndPanels = true })
	)

	-- Benches either side of the logo, banner over the back lockers
	local C = ctx.config.Colors
	local benchZ, benchLen = b.MinZ + 24, 24
	for _, s in ipairs({ -1, 1 }) do
		BuildUtil.Block(
			ctx,
			"BenchBase",
			Vector3.new(1, 1.2, benchLen - 3),
			Vector3.new(cx + s * 9, 0, benchZ),
			DARK_METAL,
			Enum.Material.Metal,
			nil,
			FLOOR_TOP
		)
		BuildUtil.Block(
			ctx,
			"BenchSeat",
			Vector3.new(1.8, 0.5, benchLen),
			Vector3.new(cx + s * 9, 0, benchZ),
			C.Wood,
			Enum.Material.WoodPlanks,
			nil,
			FLOOR_TOP + 1.2
		)
	end
	floorLogo(ctx, Vector3.new(cx, 0, benchZ), 13, CFrame.Angles(0, math.pi, 0), team, ctx.teamName)
	local banner =
		BuildUtil.Box(ctx, "Banner", Vector3.new(30, 2, 0.2), Vector3.new(cx, 11.6, innerMaxZ - 0.1), team.Secondary, Enum.Material.Fabric)
	sign(banner, { Enum.NormalId.Front }, "PRACTICE LIKE CHAMPIONS", team.Secondary, team, { InsetX = 0.04, InsetY = 0.14 })
end

---------------------------------------------------------------------------------------------
-- Weight Room
---------------------------------------------------------------------------------------------

function CampusBuildings.weightroom(ctx)
	local team = ctx.colors
	local b = inset(WEIGHT_ROOM, CAMPUS_INSET)
	local cx = (b.MinX + b.MaxX) / 2
	local W, D = b.MaxX - b.MinX, b.MaxZ - b.MinZ
	local frame = CFrame.new(cx, 0, b.MinZ)
	local H, top = 14, 10.5
	local doorHalf = 3

	local band = campusShell(ctx, frame, {
		Width = W,
		Depth = D,
		WallH = H,
		OpeningTop = top,
		WallColor = GYM_WALL,
		WallMaterial = Enum.Material.Metal,
		FloorColor = RUBBER_FLOOR,
		FloorMaterial = Enum.Material.Rubber,
		Openings = {
			{ From = -W / 2 + 2, To = -doorHalf - 1, Bottom = 1.2, Mullions = 2 },
			{ From = -doorHalf, To = doorHalf, Bottom = 0 },
			{ From = doorHalf + 1, To = W / 2 - 2, Bottom = 1.2, Mullions = 2 },
		},
		GlassTransparency = 0.3,
		BandColor = team.Primary,
		BandH = 1.8,
		LightBrightness = 1.5,
	})
	sign(band, { Enum.NormalId.Front }, ctx.teamName, team.Primary, team, { InsetY = 0.1 })
	frontStep(ctx, frame, 0, doorHalf * 2)
	local board = lblock(ctx, frame, "Sign", Vector3.new(26, 2.6, 0.4), 0, top + 0.4, -0.2, team.Secondary, Enum.Material.SmoothPlastic)
	sign(board, { Enum.NormalId.Front }, "WEIGHT ROOM", team.Secondary, team, { InsetX = 0.05, InsetY = 0.12 })

	local innerMinX, innerMaxX = b.MinX + 1, b.MaxX - 1
	local innerMaxZ = b.MaxZ - 1

	-- Three power racks on lifting platforms along the back wall, loaded with team bumper plates
	local racks = BuildUtil.Child(ctx, "PowerRacks")
	local rackZ = innerMaxZ - 6
	local barY = 4.6
	for _, dx in ipairs({ -14, 0, 14 }) do
		local rx = cx + dx
		BuildUtil.Box(
			racks,
			"Platform",
			Vector3.new(8, 0.06, 8),
			Vector3.new(rx, FLOOR_TOP + 0.03, rackZ),
			PLATFORM_WOOD,
			Enum.Material.WoodPlanks,
			PAINT
		)
		for _, s in ipairs({ -1, 1 }) do
			BuildUtil.Block(
				racks,
				"Upright",
				Vector3.new(0.5, 8, 0.5),
				Vector3.new(rx + s * 3, 0, rackZ),
				IRON,
				Enum.Material.Metal,
				nil,
				FLOOR_TOP
			)
			xCylinder(racks, "BumperPlate", Vector3.new(rx + s * 3.9, barY, rackZ - 0.6), 0.5, 2.8, team.Primary, Enum.Material.Rubber)
		end
		BuildUtil.Block(
			racks,
			"Crossbar",
			Vector3.new(6.5, 0.5, 0.5),
			Vector3.new(rx, 0, rackZ),
			IRON,
			Enum.Material.Metal,
			nil,
			FLOOR_TOP + 8
		)
		xCylinder(racks, "Barbell", Vector3.new(rx, barY, rackZ - 0.6), 9, 0.3, CHROME, Enum.Material.Metal)
	end

	-- Two bench presses in the middle (head toward the back wall)
	local benches = BuildUtil.Child(ctx, "BenchPresses")
	local benchZ = b.MinZ + 22
	for _, dx in ipairs({ -12, 12 }) do
		local bx = cx + dx
		BuildUtil.Block(
			benches,
			"BenchBase",
			Vector3.new(0.9, 1.4, 4.4),
			Vector3.new(bx, 0, benchZ),
			IRON,
			Enum.Material.Metal,
			nil,
			FLOOR_TOP
		)
		BuildUtil.Block(
			benches,
			"BenchPad",
			Vector3.new(1.5, 0.5, 5.4),
			Vector3.new(bx, 0, benchZ),
			team.Primary,
			Enum.Material.Leather,
			nil,
			FLOOR_TOP + 1.4
		)
		local headZ = benchZ + 3
		for _, s in ipairs({ -1, 1 }) do
			BuildUtil.Block(
				benches,
				"BenchUpright",
				Vector3.new(0.4, 4.2, 0.4),
				Vector3.new(bx + s * 1.7, 0, headZ),
				IRON,
				Enum.Material.Metal,
				nil,
				FLOOR_TOP
			)
			xCylinder(benches, "Plate", Vector3.new(bx + s * 2.9, 4.35, headZ), 0.5, 2.4, IRON, Enum.Material.Metal)
		end
		xCylinder(benches, "Barbell", Vector3.new(bx, 4.35, headZ), 7.5, 0.3, CHROME, Enum.Material.Metal)
	end

	-- Dumbbell rack along the west wall
	local dumbbells = BuildUtil.Child(ctx, "Dumbbells")
	local rackX = innerMinX + 1.2
	local dbStart, dbLen = b.MinZ + 8, 16
	BuildUtil.Block(
		dumbbells,
		"DumbbellRack",
		Vector3.new(2.4, 2.6, dbLen),
		Vector3.new(rackX, 0, dbStart + dbLen / 2),
		DARK_METAL,
		Enum.Material.Metal,
		nil,
		FLOOR_TOP
	)
	local headY = FLOOR_TOP + 2.6 + 0.55
	for i = 1, 6 do
		local z = dbStart + 1.5 + (i - 1) * 2.6
		for _, s in ipairs({ -1, 1 }) do
			xCylinder(dumbbells, "DumbbellHead", Vector3.new(rackX + s * 0.6, headY, z), 0.55, 1.1, IRON, Enum.Material.Metal)
		end
	end

	-- Mirror wall (east), motivation banner over the racks, kettlebells
	BuildUtil.Box(
		ctx,
		"Mirror",
		Vector3.new(0.2, 6.5, 26),
		Vector3.new(innerMaxX - 0.1, FLOOR_TOP + 1 + 3.25, b.MinZ + 21),
		MIRROR,
		Enum.Material.SmoothPlastic,
		{ Reflectance = 0.5 }
	)
	local banner =
		BuildUtil.Box(ctx, "Banner", Vector3.new(30, 2.2, 0.2), Vector3.new(cx, 11.5, innerMaxZ - 0.1), team.Primary, Enum.Material.Fabric)
	sign(banner, { Enum.NormalId.Front }, "NO DAYS OFF", team.Primary, team, { InsetX = 0.08, InsetY = 0.14 })
	for i = 1, 3 do
		BuildUtil.Ball(ctx, {
			Name = "Kettlebell",
			Position = Vector3.new(innerMaxX - 3, FLOOR_TOP + 0.7, b.MinZ + 25 + i * 2),
			Diameter = 1.4,
			Color = team.Secondary,
			Material = Enum.Material.Metal,
		})
	end
end

---------------------------------------------------------------------------------------------
-- Training Room
---------------------------------------------------------------------------------------------

function CampusBuildings.trainingroom(ctx)
	local C = ctx.config.Colors
	local team = ctx.colors
	local b = inset(TRAINING_ROOM, CAMPUS_INSET)
	local cx = (b.MinX + b.MaxX) / 2
	local W, D = b.MaxX - b.MinX, b.MaxZ - b.MinZ
	local frame = CFrame.new(cx, 0, b.MinZ)
	local H, top, bandH = 14, 10, 1.6
	local doorHalf = 3

	local band = campusShell(ctx, frame, {
		Width = W,
		Depth = D,
		WallH = H,
		OpeningTop = top,
		WallColor = CLINIC_WHITE,
		WallMaterial = Enum.Material.Plaster,
		FloorColor = CLINIC_FLOOR,
		FloorMaterial = Enum.Material.CeramicTiles,
		Openings = {
			{ From = -W / 2 + 2, To = -doorHalf - 1, Bottom = 2.5, Mullions = 1 },
			{ From = -doorHalf, To = doorHalf, Bottom = 0 },
			{ From = doorHalf + 1, To = W / 2 - 2, Bottom = 2.5, Mullions = 1 },
		},
		BandColor = team.Primary,
		BandH = bandH,
		LightBrightness = 1.6,
	})
	sign(band, { Enum.NormalId.Front }, ctx.teamName, team.Primary, team, { InsetY = 0.1 })
	frontStep(ctx, frame, 0, doorHalf * 2)
	lblock(ctx, frame, "SignBacking", Vector3.new(24.6, 3.2, 0.2), 0, top + 0.3, -0.1, CROSS_RED, Enum.Material.SmoothPlastic)
	local board = lblock(ctx, frame, "Sign", Vector3.new(24, 2.6, 0.4), 0, top + 0.6, -0.4, WHITE, Enum.Material.SmoothPlastic)
	sign(board, { Enum.NormalId.Front }, "TRAINING ROOM", WHITE, team, { TextColor3 = CROSS_RED, InsetX = 0.05, InsetY = 0.12 })

	-- Red cross on the roof, above the door (lit, readable from both sides)
	local roofTop = H + bandH + 0.6
	local crossZ = b.MinZ + 1.5
	BuildUtil.Block(
		ctx,
		"CrossPlate",
		Vector3.new(5.4, 5.4, 0.6),
		Vector3.new(cx, 0, crossZ),
		WHITE,
		Enum.Material.SmoothPlastic,
		nil,
		roofTop
	)
	local crossY = roofTop + 2.7
	BuildUtil.Box(ctx, "CrossVertical", Vector3.new(1.5, 4.2, 0.8), Vector3.new(cx, crossY, crossZ), CROSS_RED, Enum.Material.Neon)
	BuildUtil.Box(ctx, "CrossHorizontal", Vector3.new(4.2, 1.5, 0.78), Vector3.new(cx, crossY, crossZ), CROSS_RED, Enum.Material.Neon)

	local innerMinX, innerMaxX = b.MinX + 1, b.MaxX - 1
	local innerMaxZ = b.MaxZ - 1

	-- Treatment tables with curtains between them along the back
	local tables = BuildUtil.Child(ctx, "TreatmentTables")
	local tableZ = innerMaxZ - 9
	for i, dx in ipairs({ -17, -9, -1 }) do
		local tx = cx + dx
		BuildUtil.Block(
			tables,
			"TableBase",
			Vector3.new(1, 2.2, 5),
			Vector3.new(tx, 0, tableZ),
			CHROME,
			Enum.Material.Metal,
			nil,
			FLOOR_TOP
		)
		BuildUtil.Block(
			tables,
			"TablePad",
			Vector3.new(2.6, 0.6, 6.5),
			Vector3.new(tx, 0, tableZ),
			team.Primary,
			Enum.Material.Leather,
			nil,
			FLOOR_TOP + 2.2
		)
		BuildUtil.Block(
			tables,
			"Pillow",
			Vector3.new(2, 0.35, 1.3),
			Vector3.new(tx, 0, tableZ + 2.3),
			WHITE,
			Enum.Material.Fabric,
			nil,
			FLOOR_TOP + 2.8
		)
		if i < 3 then
			BuildUtil.Block(
				tables,
				"Curtain",
				Vector3.new(0.15, 7, 6.5),
				Vector3.new(tx + 4, 0, tableZ),
				CURTAIN,
				Enum.Material.Fabric,
				nil,
				FLOOR_TOP + 1
			)
		end
	end

	-- Cold tub (with ice) and hot tub (with steam) along the east wall, labelled on the wall
	local tubs = BuildUtil.Child(ctx, "Tubs")
	local tubX = innerMaxX - 6.5
	local rimTop = FLOOR_TOP + 2.8
	local tubSpecs = {
		{
			z = b.MinZ + 13,
			rim = CHROME,
			rimMaterial = Enum.Material.Metal,
			water = COLD_WATER,
			label = "COLD TUB",
			labelColor = COLD_SIGN,
		},
		{
			z = b.MinZ + 25,
			rim = C.Wood,
			rimMaterial = Enum.Material.WoodPlanks,
			water = HOT_WATER,
			label = "HOT TUB",
			labelColor = CROSS_RED,
		},
	}
	for i, spec in ipairs(tubSpecs) do
		BuildUtil.Cylinder(tubs, {
			Name = "TubRim",
			Position = Vector3.new(tubX, FLOOR_TOP + 1.4, spec.z),
			Height = 2.8,
			Diameter = 7,
			Axis = "Y",
			Color = spec.rim,
			Material = spec.rimMaterial,
		})
		BuildUtil.Cylinder(tubs, {
			Name = "TubWater",
			Position = Vector3.new(tubX, rimTop + 0.06, spec.z),
			Height = 0.12,
			Diameter = 6.2,
			Axis = "Y",
			Color = spec.water,
			Material = Enum.Material.Glass,
			Transparency = 0.25,
			CanCollide = false,
			CastShadow = false,
		})
		BuildUtil.Block(
			tubs,
			"TubStep",
			Vector3.new(2.4, 1.4, 3),
			Vector3.new(tubX - 4.7, 0, spec.z),
			CHROME,
			Enum.Material.DiamondPlate,
			nil,
			FLOOR_TOP
		)
		local label = BuildUtil.Box(
			tubs,
			"TubSign",
			Vector3.new(0.2, 1.6, 6),
			Vector3.new(innerMaxX - 0.1, 6.5, spec.z),
			spec.labelColor,
			Enum.Material.SmoothPlastic
		)
		sign(label, { Enum.NormalId.Left }, spec.label, spec.labelColor, team, { TextColor3 = WHITE, InsetX = 0.08, InsetY = 0.15 })
		if i == 1 then
			for k, offset in ipairs({ Vector3.new(-1.3, 0, -1), Vector3.new(1, 0, 1.2), Vector3.new(1.4, 0, -1.4) }) do
				BuildUtil.Part(tubs, {
					Name = "IceCube",
					Size = Vector3.new(0.8, 0.8, 0.8),
					CFrame = CFrame.new(tubX + offset.X, rimTop + 0.4, spec.z + offset.Z)
						* CFrame.Angles(0, math.rad(25 * k), math.rad(10)),
					Color = ICE_BLUE,
					Material = Enum.Material.Ice,
					Transparency = 0.2,
					CanCollide = false,
				})
			end
		else
			for k, offset in ipairs({ Vector3.new(-0.5, 1.3, -0.5), Vector3.new(0.9, 2.4, 0.7) }) do
				BuildUtil.Ball(tubs, {
					Name = "Steam",
					Position = Vector3.new(tubX + offset.X, rimTop + offset.Y, spec.z + offset.Z),
					Diameter = 1.8 - 0.4 * k,
					Color = WHITE,
					Material = Enum.Material.SmoothPlastic,
					Transparency = 0.6,
					CanCollide = false,
					CastShadow = false,
				})
			end
		end
	end

	-- Rehab corner by the windows: exercise bike, treadmill, exercise ball, foam rollers
	local rehab = BuildUtil.Child(ctx, "Rehab")
	local bikeX, bikeZ = cx - 15, b.MinZ + 11
	BuildUtil.Block(
		rehab,
		"BikeFrame",
		Vector3.new(1, 2, 3.6),
		Vector3.new(bikeX, 0, bikeZ),
		DARK_METAL,
		Enum.Material.Metal,
		nil,
		FLOOR_TOP
	)
	xCylinder(rehab, "BikeFlywheel", Vector3.new(bikeX, FLOOR_TOP + 1.2, bikeZ - 1.4), 0.6, 2.2, team.Primary, Enum.Material.Metal)
	BuildUtil.Block(
		rehab,
		"BikeSeat",
		Vector3.new(1.1, 1.3, 1.3),
		Vector3.new(bikeX, 0, bikeZ + 1.1),
		LEATHER_BLACK,
		Enum.Material.Leather,
		nil,
		FLOOR_TOP + 2
	)
	BuildUtil.Block(
		rehab,
		"BikeHandles",
		Vector3.new(1.8, 2.2, 0.35),
		Vector3.new(bikeX, 0, bikeZ - 1.6),
		DARK_METAL,
		Enum.Material.Metal,
		nil,
		FLOOR_TOP + 2
	)
	local millX = cx - 7
	BuildUtil.Block(
		rehab,
		"TreadmillDeck",
		Vector3.new(2.8, 0.6, 6),
		Vector3.new(millX, 0, bikeZ + 1),
		RUBBER_FLOOR,
		Enum.Material.Rubber,
		nil,
		FLOOR_TOP
	)
	BuildUtil.Block(
		rehab,
		"TreadmillConsole",
		Vector3.new(2.8, 3.6, 0.4),
		Vector3.new(millX, 0, bikeZ - 1.8),
		DARK_METAL,
		Enum.Material.Metal,
		nil,
		FLOOR_TOP + 0.6
	)
	BuildUtil.Ball(rehab, {
		Name = "ExerciseBall",
		Position = Vector3.new(cx - 11, FLOOR_TOP + 1.3, b.MinZ + 20),
		Diameter = 2.6,
		Color = team.Secondary,
		Material = Enum.Material.Rubber,
	})
	for k = 1, 2 do
		xCylinder(
			rehab,
			"FoamRoller",
			Vector3.new(cx + 5, FLOOR_TOP + 0.45, b.MinZ + 17 + k * 1.2),
			3,
			0.9,
			(k == 1) and team.Primary or team.Secondary,
			Enum.Material.Foil
		)
	end

	-- First-aid cabinet on the west wall and an ice machine in the back corner
	local cabinetX = innerMinX + 0.8
	local cabinetZ = b.MinZ + 25
	BuildUtil.Block(
		ctx,
		"FirstAidCabinet",
		Vector3.new(1.6, 6, 6),
		Vector3.new(cabinetX, 0, cabinetZ),
		WHITE,
		Enum.Material.SmoothPlastic,
		nil,
		FLOOR_TOP
	)
	BuildUtil.Box(
		ctx,
		"CabinetCross",
		Vector3.new(0.1, 2.6, 0.8),
		Vector3.new(cabinetX + 0.85, FLOOR_TOP + 4.2, cabinetZ),
		CROSS_RED,
		Enum.Material.SmoothPlastic
	)
	BuildUtil.Box(
		ctx,
		"CabinetCross",
		Vector3.new(0.08, 0.8, 2.6),
		Vector3.new(cabinetX + 0.84, FLOOR_TOP + 4.2, cabinetZ),
		CROSS_RED,
		Enum.Material.SmoothPlastic
	)
	local iceMachine = BuildUtil.Block(
		ctx,
		"IceMachine",
		Vector3.new(3, 5, 2.4),
		Vector3.new(innerMaxX - 12, 0, innerMaxZ - 1.25),
		CHROME,
		Enum.Material.Metal,
		nil,
		FLOOR_TOP
	)
	sign(iceMachine, { Enum.NormalId.Front }, "ICE", CHROME, team, { TextColor3 = COLD_SIGN, InsetX = 0.2, InsetY = 0.35 })
end

---------------------------------------------------------------------------------------------
-- Film Room
---------------------------------------------------------------------------------------------

function CampusBuildings.filmroom(ctx)
	local team = ctx.colors
	local b = inset(FILM_ROOM, CAMPUS_INSET)
	local cx = (b.MinX + b.MaxX) / 2
	local W, D = b.MaxX - b.MinX, b.MaxZ - b.MinZ
	local frame = CFrame.new(cx, 0, b.MinZ)
	local H, top = 17, 10
	-- the door opens into the space in front of the screen (east), the windows look at the tiers
	local doorFrom, doorTo = 7, 13

	local band = campusShell(ctx, frame, {
		Width = W,
		Depth = D,
		WallH = H,
		OpeningTop = top,
		WallColor = THEATRE_WALL,
		WallMaterial = Enum.Material.SmoothPlastic,
		FloorColor = shade(team.Primary, 0.4),
		FloorMaterial = Enum.Material.Carpet,
		Openings = {
			{ From = -W / 2 + 2, To = -8, Bottom = 3, Mullions = 1 },
			{ From = -6, To = 5, Bottom = 3, Mullions = 1 },
			{ From = doorFrom, To = doorTo, Bottom = 0 },
		},
		BandColor = team.Primary,
		BandH = 1.6,
		CeilingColor = THEATRE_STEP,
		LightBrightness = 0.6,
	})
	sign(band, { Enum.NormalId.Front }, ctx.teamName, team.Primary, team, { InsetY = 0.1 })
	frontStep(ctx, frame, (doorFrom + doorTo) / 2, doorTo - doorFrom)

	-- Lit marquee over the front: a glowing box with a black sign in front of it
	lblock(ctx, frame, "MarqueeGlow", Vector3.new(26, 3.6, 1.2), 0, top + 1.2, -0.6, MARQUEE_GLOW, Enum.Material.Neon)
	local marquee = lblock(ctx, frame, "Marquee", Vector3.new(25.2, 3, 1.4), 0, top + 1.5, -0.7, MARQUEE_BLACK, Enum.Material.SmoothPlastic)
	sign(marquee, { Enum.NormalId.Front }, "FILM ROOM", MARQUEE_BLACK, team, { InsetX = 0.05, InsetY = 0.12 })
	-- "now showing" poster case on the wide pier beside the door
	local posterX = (doorTo + W / 2) / 2
	lblock(ctx, frame, "PosterFrame", Vector3.new(5.6, 7.6, 0.2), posterX, 1.4, -0.1, MARQUEE_GLOW, Enum.Material.Neon)
	local poster = lblock(ctx, frame, "Poster", Vector3.new(5, 7, 0.3), posterX, 1.7, -0.35, team.Primary, Enum.Material.SmoothPlastic)
	sign(poster, { Enum.NormalId.Front }, "NOW SHOWING\n\nGAME FILM\n\nWEEK 1", team.Primary, team, { InsetX = 0.1, InsetY = 0.12 })

	-- Stepped seating: 6 rows facing the screen on the east wall, rising to the west; the strip
	-- along the south end of every row (z from the aisle to seatMinZ) is the way up
	local seating = BuildUtil.Child(ctx, "Seating")
	local innerMinX, innerMaxX = b.MinX + 1, b.MaxX - 1
	local innerMaxZ = b.MaxZ - 1
	local tierMinZ = b.MinZ + 7 -- the aisle in front of the windows is floor level
	local seatMinZ = tierMinZ + 3
	local rowDepth, rise = 4, 1.2
	local firstFront = innerMaxX - 13 -- front edge of row 1 (13 studs from the screen)
	local seatColor = team.Primary
	local backColor = shade(team.Primary, 0.75)
	for row = 1, 6 do
		local front = firstFront - (row - 1) * rowDepth
		local back = (row == 6) and innerMinX or (front - rowDepth)
		local rowTop = FLOOR_TOP + (row - 1) * rise
		if row > 1 then
			BuildUtil.Block(
				seating,
				"Tier" .. row,
				Vector3.new(front - back, rowTop, innerMaxZ - tierMinZ),
				Vector3.new((front + back) / 2, 0, (tierMinZ + innerMaxZ) / 2),
				THEATRE_STEP,
				Enum.Material.Carpet
			)
			BuildUtil.Box(
				seating,
				"StepLight",
				Vector3.new(0.3, 0.06, 2.6),
				Vector3.new(front - 0.25, rowTop + 0.03, tierMinZ + 1.5),
				MARQUEE_GLOW,
				Enum.Material.Neon,
				PAINT
			)
		end
		if row < 6 then
			local seatLen = innerMaxZ - seatMinZ
			BuildUtil.Block(
				seating,
				"SeatCushions",
				Vector3.new(1.8, 1.3, seatLen),
				Vector3.new(front - 1.9, 0, seatMinZ + seatLen / 2),
				seatColor,
				Enum.Material.Fabric,
				nil,
				rowTop
			)
			local backs = 5
			local pitch = seatLen / backs
			for k = 1, backs do
				BuildUtil.Block(
					seating,
					"SeatBack",
					Vector3.new(0.6, 3, pitch - 0.6),
					Vector3.new(front - 3.1, 0, seatMinZ + (k - 0.5) * pitch),
					backColor,
					Enum.Material.Fabric,
					nil,
					rowTop
				)
			end
		end
	end

	-- Big dark screen on the east wall
	local screenZ = (seatMinZ - 1 + innerMaxZ) / 2
	BuildUtil.Block(
		seating,
		"ScreenFrame",
		Vector3.new(0.4, 12, 34),
		Vector3.new(innerMaxX - 0.2, 0, screenZ),
		team.Primary,
		Enum.Material.SmoothPlastic,
		nil,
		3
	)
	local screen = BuildUtil.Box(
		seating,
		"Screen",
		Vector3.new(0.3, 11, 33),
		Vector3.new(innerMaxX - 0.55, 9, screenZ),
		SCREEN_BLACK,
		Enum.Material.SmoothPlastic
	)
	sign(screen, { Enum.NormalId.Left }, "GAME FILM  -  WEEK 1", SCREEN_BLACK, team, {
		TextColor3 = Color3.fromRGB(78, 86, 104),
		Font = Enum.Font.GothamBold,
		InsetX = 0.3,
		Top = 0.82,
		Height = 0.1,
	})
	BuildUtil.Light(
		screen,
		"SurfaceLight",
		{ Name = "ScreenGlow", Face = Enum.NormalId.Left, Range = 16, Brightness = 0.5, Angle = 90, Color = Color3.fromRGB(140, 170, 255) }
	)

	-- Projector on the back platform with its beam to the screen
	local platformTop = FLOOR_TOP + 5 * rise
	local projX = innerMinX + 4
	BuildUtil.Block(
		seating,
		"ProjectorStand",
		Vector3.new(1.2, 2.6, 1.2),
		Vector3.new(projX, 0, screenZ),
		DARK_METAL,
		Enum.Material.Metal,
		nil,
		platformTop
	)
	BuildUtil.Block(
		seating,
		"Projector",
		Vector3.new(2.6, 1.4, 2.2),
		Vector3.new(projX + 0.4, 0, screenZ),
		INK,
		Enum.Material.SmoothPlastic,
		nil,
		platformTop + 2.6
	)
	local lensY = platformTop + 3.3
	local lensX = projX + 2.0
	xCylinder(seating, "ProjectorLens", Vector3.new(lensX, lensY, screenZ), 0.6, 0.9, CHROME, Enum.Material.Glass)
	local beamFrom = Vector3.new(lensX + 0.3, lensY, screenZ)
	local beamTo = Vector3.new(innerMaxX - 0.75, 9, screenZ)
	BuildUtil.Part(seating, {
		Name = "ProjectorBeam",
		Size = Vector3.new(1.2, 1.2, (beamTo - beamFrom).Magnitude),
		CFrame = CFrame.lookAt((beamFrom + beamTo) / 2, beamTo),
		Color = BEAM_WHITE,
		Material = Enum.Material.Neon,
		Transparency = 0.85,
		CanCollide = false,
		CastShadow = false,
	})

	-- Coach's lectern in front of the screen
	local lecternX, lecternZ = innerMaxX - 5, seatMinZ + 2
	local lectern = BuildUtil.Block(
		ctx,
		"Lectern",
		Vector3.new(1.6, 3.6, 2),
		Vector3.new(lecternX, 0, lecternZ),
		DARK_WOOD,
		Enum.Material.Wood,
		nil,
		FLOOR_TOP
	)
	BuildUtil.Block(
		ctx,
		"LecternTop",
		Vector3.new(2.2, 0.3, 2.6),
		Vector3.new(lecternX, 0, lecternZ),
		DARK_WOOD,
		Enum.Material.Wood,
		nil,
		FLOOR_TOP + 3.6
	)
	sign(lectern, { Enum.NormalId.Left }, "COACH", DARK_WOOD, team, { TextColor3 = GOLD_TEXT, InsetX = 0.1, InsetY = 0.38 })

	-- Popcorn machine by the front windows
	local popX, popZ = innerMinX + 3, b.MinZ + 4
	local cart = BuildUtil.Block(
		ctx,
		"PopcornCart",
		Vector3.new(2.4, 3, 2.4),
		Vector3.new(popX, 0, popZ),
		POPCORN_RED,
		Enum.Material.SmoothPlastic,
		nil,
		FLOOR_TOP
	)
	sign(cart, { Enum.NormalId.Front }, "POPCORN", POPCORN_RED, team, { TextColor3 = POPCORN, InsetX = 0.08, InsetY = 0.35 })
	BuildUtil.Block(ctx, "Popcorn", Vector3.new(1.9, 1.1, 1.9), Vector3.new(popX, 0, popZ), POPCORN, Enum.Material.Sand, nil, FLOOR_TOP + 3)
	BuildUtil.Block(
		ctx,
		"PopcornGlass",
		Vector3.new(2.2, 2.4, 2.2),
		Vector3.new(popX, 0, popZ),
		Color3.fromRGB(230, 240, 245),
		Enum.Material.Glass,
		{ Transparency = 0.5 },
		FLOOR_TOP + 3
	)
end

return CampusBuildings
