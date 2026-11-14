--[[
	Plaza
	The buildings in the entrance plaza, between the street (-Z) and the front stands.
	Every piece is bought in STEPS (see Items.lua); BuildUtil.Stage(ctx, n) marks the parts of step n.

	  ticketbooth  1 Booth            booth body with corner trim, roof, back door, an AC unit and a
	                                  security camera (look) watching the queue
	               2 Window & Awning  ticket window (look: next game day) + speaker grille, counter,
	                                  striped awning and chrome queue posts with team-coloured belts,
	                                  a bench for the people waiting (against the north wall) and two
	                                  flower pots
	               3 Signs            BOX OFFICE panel, TICKETS roof sign, a live game-day countdown
	                                  screen for the street, OPEN + NOW SERVING signs, giant ADMIT ONE
	                                  ticket, two self-serve ticket kiosks (look: the prices)
	  concessions  1 Stand            food stand on a patio, serving hatch, roof exhaust
	               2 Counter & Awning counter with sauces, cups (get a soda), the hatch (get a hot
	                                  dog) and a popcorn machine (get popcorn), awning, picnic tables
	                                  with umbrellas and benches you can sit on, trash + recycling bins,
	                                  a FIXIN'S counter on the north wall (look) and two high-top tables
	               3 Menu & Giant Hot Dog  chalkboard menu (look), CONCESSIONS sign, drinks vending
	                                  machine (get a sports drink), giant hot dog + soda cup on the roof,
	                                  ORDER HERE / DRINKS signs, the day's special on a chalkboard
	                                  A-frame (look), the employee of the month (look), string lights
	  parking      1 Asphalt          asphalt, curbs, tree islands, "P" sign, a pay station (look)
	               2 Parking Lines    stalls, accessible bays, arrows, crosswalk, bus bay, FAN PARKING,
	                                  yellow curb ends at the car entrance
	               3 Lamp Posts       six double lamp posts with LOT A / LOT B team banners
	               4 Cars             sedans, SUVs, pickups, a van, a hatchback and the team bus (the
	                                  owner's car, a tailgate truck, a super fan's car and the bus have
	                                  looks), a tailgate grill (look) with two camp chairs you can sit
	                                  in, and a bike rack with a bike (look) by the walk to the plaza
	  teamstore    1 Building         walls, piers, roof with AC units, two lit ceiling panels; the
	                                  front is open between the piers, so it is walk-in from step 1
	               2 Glass Front & Doors  glass storefront with sliding glass double doors (7 wide),
	                                  canopy, mat, planters, OPEN sign, opening hours, and a display
	                                  case on the side wall
	               3 Merch & Sign     TEAM STORE sign, live team-name LED board, mannequins, jersey
	                                  racks, a giant foam finger (grab one), display table, checkout +
	                                  till, best-selling jersey wall, fitting bench + mirror, a shelf of
	                                  mini helmets, a barrel of souvenir footballs (look), a NEW SEASON
	                                  GEAR banner on two wires, the side case's jerseys, helmet and ball
	                                  round a GAME-WORN GEAR card, roof football
	  trophy       1 Plinth           stepped stone plinth, pedestal, corner flags and a viewing bench
	                                  (TV camera seat on the trophy), two park benches, four planters
	               2 Trophy Base      black marble base with gold bands + team name, gold foot
	               3 Golden Trophy    stem, cup, handles and a golden football (look)
	               4 Champions Plaque plaques on all sides (look: titles won), a lit neon ring and four
	                                  confetti cannons, the Walk of Champions (bronze plaques in the
	                                  bottom step, look: titles) and a lectern with the trophy's facts

	Every building stays inside its reserved footprint (the tables below; the concession patio
	runs 6 studs further toward the street for the picnic tables). Small things stand just outside
	them: the booth's kiosks (street side), bench and pots (stadium side), the stand's fixings
	counter and high-tops (north) and specials board (walkway side), the lot's pay station and bike
	rack, the store's display case (south wall) and the trophy's benches, planters and lectern.
	The walkway (X in [-12, 12]) runs between the west half (booth, stand, parking) and the east
	half (store, trophy) of the plaza, so the booth and stand face +X and the store faces -X.
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)

local Plaza = {}

-- Reserved footprints (plot-local studs; Config.Layout has no values for these)
local BOOTH = { MinX = -42, MaxX = -30, MinZ = -188, MaxZ = -176 }
local STAND = { MinX = -70, MaxX = -50, MinZ = -134, MaxZ = -122 }
local PATIO_MIN_Z = STAND.MinZ - 6 -- the concession patio runs 6 studs toward the street for the picnic tables
local LOT = { MinX = -200, MaxX = -100, MinZ = -192, MaxZ = -96 }
local STORE = { MinX = 54, MaxX = 90, MinZ = -142, MaxZ = -118 }
local MONUMENT = { CenterX = 150, CenterZ = -140, HalfSize = 15 }

local PAINT = { CanCollide = false, CastShadow = false }
local NO_COLLIDE = { CanCollide = false }

local WHITE = Color3.fromRGB(248, 248, 248)
local INK = Color3.fromRGB(22, 22, 26)
local DARK_WINDOW = Color3.fromRGB(26, 30, 38)
local SCREEN = Color3.fromRGB(14, 18, 30)
local CHALKBOARD = Color3.fromRGB(34, 40, 37)
local MENU_TEXT = Color3.fromRGB(255, 226, 140)
local WARM_LIGHT = Color3.fromRGB(255, 236, 200)
local DARK_METAL = Color3.fromRGB(62, 64, 70)
local CHROME = Color3.fromRGB(205, 210, 216)
local STORE_WALL = Color3.fromRGB(228, 224, 216)
local STORE_FLOOR = Color3.fromRGB(222, 219, 212)
local MANNEQUIN = Color3.fromRGB(238, 234, 226)
local STONE_DARK = Color3.fromRGB(96, 96, 102)
local STONE_LIGHT = Color3.fromRGB(236, 233, 226)
local TROPHY_BASE = Color3.fromRGB(30, 30, 34)
local PALE_GOLD = Color3.fromRGB(255, 228, 150)
local LEATHER = Color3.fromRGB(124, 66, 36)
local BUN = Color3.fromRGB(226, 172, 102)
local SAUSAGE = Color3.fromRGB(176, 72, 46)
local MUSTARD = Color3.fromRGB(255, 205, 20)
local KETCHUP = Color3.fromRGB(200, 30, 30)
local POPCORN = Color3.fromRGB(255, 236, 160)
local BUSH = Color3.fromRGB(56, 122, 62)
local TREE_TRUNK = Color3.fromRGB(110, 78, 50)
local TIRE = Color3.fromRGB(28, 28, 30)
local CAR_GLASS = Color3.fromRGB(46, 58, 74)
local TAIL_RED = Color3.fromRGB(220, 30, 30)
local OPEN_RED = Color3.fromRGB(235, 40, 50)
local LINE_YELLOW = Color3.fromRGB(250, 204, 40)
local ACCESSIBLE_BLUE = Color3.fromRGB(30, 90, 190)
local CONFETTI_PINK = Color3.fromRGB(255, 90, 170)
local CONFETTI_CYAN = Color3.fromRGB(60, 210, 240)
local TERRACOTTA = Color3.fromRGB(176, 92, 58)
local FLOWER_PINK = Color3.fromRGB(226, 84, 140)
local FLOWER_RED = Color3.fromRGB(214, 52, 60)
local FLOWER_PURPLE = Color3.fromRGB(150, 90, 200)
local FLOWER_GOLD = Color3.fromRGB(246, 186, 52)
local BRONZE = Color3.fromRGB(160, 110, 62)

local CAR_COLORS = {
	Red = Color3.fromRGB(196, 38, 40),
	Blue = Color3.fromRGB(38, 88, 196),
	White = Color3.fromRGB(236, 236, 238),
	Silver = Color3.fromRGB(168, 172, 178),
	Yellow = Color3.fromRGB(240, 188, 36),
	Black = Color3.fromRGB(34, 34, 38),
	Green = Color3.fromRGB(40, 120, 70),
	Steel = Color3.fromRGB(78, 112, 150),
	Teal = Color3.fromRGB(32, 150, 150),
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

-- The owner's name followed by `suffix`, or `fallback` when the plot has no name yet.
local function teamText(ctx, suffix, fallback)
	local name = ctx.teamName
	if name == nil or name == "" then
		return fallback
	end
	return name .. suffix
end

--[[
	Writes `text` on each face in `faces` of `part`, coloured to read well on `background`.
	opts: TextColor3, Font, PixelsPerStud, Wrap (bool), InsetX / InsetY (fraction of the face
	      left empty around the text, default 0.06 / 0.12), LabelName, Glow (ignores lighting,
	      for screens and neon signs)
]]
local function sign(part, faces, text, background, team, opts)
	opts = opts or {}
	local color = opts.TextColor3 or textColorOn(background, { team.Trim, team.Primary, team.Secondary })
	local insetX = opts.InsetX or 0.06
	local insetY = opts.InsetY or 0.12
	for _, face in ipairs(faces) do
		local _, label = BuildUtil.SurfaceText(part, face, text, {
			LabelName = (opts.LabelName or part.Name) .. face.Name,
			TextColor3 = color,
			Font = opts.Font or Enum.Font.GothamBlack,
			PixelsPerStud = opts.PixelsPerStud or 20,
			LightInfluence = opts.Glow and 0 or 1,
		})
		label.Size = UDim2.new(1 - 2 * insetX, 0, 1 - 2 * insetY, 0)
		label.Position = UDim2.new(insetX, 0, insetY, 0)
		if opts.Wrap then
			label.TextWrapped = true
		end
	end
end

-- A dark LED screen whose text the server keeps up to date (BuildUtil.LiveText).
local function liveScreen(part, face, live, placeholder, textColor)
	local _, label = BuildUtil.LiveText(part, face, live, {
		LabelName = "Live_" .. live,
		Text = placeholder,
		TextColor3 = textColor,
		BackgroundColor3 = SCREEN,
		BackgroundTransparency = 0,
		LightInfluence = 0,
		Font = Enum.Font.GothamBlack,
		PixelsPerStud = 24,
	})
	label.TextWrapped = true
	local pad = Instance.new("UIPadding")
	local inset = UDim.new(0.08, 0)
	pad.PaddingLeft, pad.PaddingRight, pad.PaddingTop, pad.PaddingBottom = inset, inset, inset, inset
	pad.Parent = label
	return label
end

-- A bright team colour for neon strips and glowing panels (a near-black secondary can't glow).
local function accent(team)
	if luminance(team.Secondary) >= 0.12 then
		return team.Secondary
	end
	return team.Trim
end

-- Two colours for awning stripes that are clearly different from each other.
local function stripeColors(team)
	if contrastRatio(team.Secondary, team.Trim) >= 1.6 then
		return { team.Secondary, team.Trim }
	end
	return { team.Primary, team.Trim }
end

-- Cylinder along the local X axis of `cframe` (local to the plot).
local function cylinderAt(ctx, name, cframe, length, diameter, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Shape = Enum.PartType.Cylinder
	props.Size = Vector3.new(length, diameter, diameter)
	props.CFrame = cframe
	props.Color = color
	props.Material = material
	return BuildUtil.Part(ctx, props)
end

-- Block placed by a CFrame (local to the plot).
local function boxAt(ctx, name, size, cframe, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Size = size
	props.CFrame = cframe
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Part(ctx, props)
end

--[[
	Striped fabric awning hanging off a wall that faces +X (opts.Dir = 1) or -X (opts.Dir = -1).
	opts: Name, WallX, Reach (horizontal depth), TopY (height at the wall), Drop (fall to the
	      outer edge), MinZ, MaxZ, Strips, Colors { a, b }
]]
local function stripedAwning(ctx, opts)
	local dir = opts.Dir or 1
	local length = math.sqrt(opts.Reach ^ 2 + opts.Drop ^ 2)
	local angle = math.atan2(opts.Drop, opts.Reach)
	local stripWidth = (opts.MaxZ - opts.MinZ) / opts.Strips
	local centerX = opts.WallX + dir * opts.Reach / 2
	local centerY = opts.TopY - opts.Drop / 2
	for i = 1, opts.Strips do
		BuildUtil.Part(ctx, {
			Name = opts.Name .. "Stripe" .. i,
			Size = Vector3.new(length, 0.2, stripWidth),
			CFrame = CFrame.new(centerX, centerY, opts.MinZ + (i - 0.5) * stripWidth) * CFrame.Angles(0, 0, -dir * angle),
			Color = opts.Colors[(i - 1) % 2 + 1],
			Material = Enum.Material.Fabric,
		})
	end
	-- flat valance hanging from the outer edge
	BuildUtil.Box(
		ctx,
		opts.Name .. "Valance",
		Vector3.new(0.15, 0.7, opts.MaxZ - opts.MinZ),
		Vector3.new(opts.WallX + dir * opts.Reach, opts.TopY - opts.Drop - 0.3, (opts.MinZ + opts.MaxZ) / 2),
		opts.Colors[1],
		Enum.Material.Fabric
	)
end

--[[
	An (American) football built from parts along the local X axis of `cframe`, laces on local +Y.
	A Ball part is always round, so the body is a short cylinder plus three pairs of shrinking
	balls toward the tips. At scale 1 it is 11 studs long and 6.4 studs thick.
	colors: { Body, Stripe, Lace }   style: { Material, Reflectance }
]]
local FOOTBALL_TIPS = { { 1.5, 6.4 }, { 3.0, 4.6 }, { 4.2, 2.6 } } -- { offset along axis, diameter }

local function football(ctx, name, cframe, scale, colors, style)
	local s = scale
	local extra = { Reflectance = style.Reflectance }
	cylinderAt(ctx, name .. "Body", cframe, 3 * s, 6.4 * s, colors.Body, style.Material, extra)
	for _, tip in ipairs(FOOTBALL_TIPS) do
		for _, side in ipairs({ -1, 1 }) do
			BuildUtil.Ball(ctx, {
				Name = name .. "Tip",
				CFrame = cframe * CFrame.new(side * tip[1] * s, 0, 0),
				Diameter = tip[2] * s,
				Color = colors.Body,
				Material = style.Material,
				Reflectance = style.Reflectance,
			})
		end
	end
	-- a painted band near each tip (slightly wider than the ball there)
	for _, side in ipairs({ -1, 1 }) do
		cylinderAt(
			ctx,
			name .. "Stripe",
			cframe * CFrame.new(side * 3.2 * s, 0, 0),
			0.45 * s,
			5.56 * s,
			colors.Stripe,
			style.Material,
			extra
		)
	end
	-- laces: one long lace and four stitches across it
	BuildUtil.Part(ctx, {
		Name = name .. "Lace",
		Size = Vector3.new(3 * s, 0.3 * s, 0.4 * s),
		CFrame = cframe * CFrame.new(0, 3.25 * s, 0),
		Color = colors.Lace,
		Material = style.Material,
		Reflectance = style.Reflectance,
	})
	for i = -1.5, 1.5 do
		BuildUtil.Part(ctx, {
			Name = name .. "Stitch",
			Size = Vector3.new(0.28 * s, 0.3 * s, 1.3 * s),
			CFrame = cframe * CFrame.new(i * 0.7 * s, 3.2 * s, 0),
			Color = colors.Lace,
			Material = style.Material,
			Reflectance = style.Reflectance,
		})
	end
end

-- The team colour for new little lights and LED bits: never white or yellow (they glow too
-- harshly) and bright enough to glow - the secondary, else the primary, else the trim.
local function ledColor(team)
	for _, c in ipairs({ team.Secondary, team.Primary, team.Trim }) do
		local whiteish = math.min(c.R, c.G, c.B) >= 0.6
		local yellow = c.R >= 0.8 and c.G >= 0.6 and c.B <= 0.5
		if math.max(c.R, c.G, c.B) >= 0.3 and not whiteish and not yellow then
			return c
		end
	end
	return team.Primary
end

--[[
	A park bench you can sit on: wooden seat and back on a dark base. frame = a plot CFrame at the
	foot of the bench's middle; the sitter faces its -Z (the back is on its +Z side).
]]
local function parkBench(ctx, name, frame, length, base, color)
	BuildUtil.Part(ctx, {
		Name = name .. "Base",
		Size = Vector3.new(length - 0.8, 1.45, 0.9),
		CFrame = frame * CFrame.new(0, base + 0.725, 0),
		Color = DARK_METAL,
		Material = Enum.Material.Metal,
	})
	BuildUtil.Seat(ctx, {
		Name = name,
		Size = Vector3.new(length, 0.3, 1.3),
		CFrame = frame * CFrame.new(0, base + 1.6, 0),
		Color = color,
		Material = Enum.Material.WoodPlanks,
		Object = "Bench",
	})
	BuildUtil.Part(ctx, {
		Name = name .. "Back",
		Size = Vector3.new(length, 1.5, 0.25),
		CFrame = frame * CFrame.new(0, base + 2.55, 0.8),
		Color = color,
		Material = Enum.Material.WoodPlanks,
	})
end

-- A round pot (or planter) with a dome of flowers.
local function flowerPot(ctx, name, x, z, base, diameter, height, potColor, flowerColor)
	BuildUtil.Cylinder(ctx, {
		Name = name,
		Position = Vector3.new(x, base + height / 2, z),
		Height = height,
		Diameter = diameter,
		Color = potColor,
		Material = Enum.Material.Concrete,
	})
	BuildUtil.Ball(ctx, {
		Name = name .. "Flowers",
		Position = Vector3.new(x, base + height + diameter * 0.15, z),
		Diameter = diameter * 0.9,
		Color = flowerColor,
		Material = Enum.Material.Grass,
	})
end

---------------------------------------------------------------------------------------------
-- Ticket booth
---------------------------------------------------------------------------------------------

function Plaza.ticketbooth(ctx)
	local C = ctx.config.Colors
	local team = ctx.colors

	local cx = (BOOTH.MinX + BOOTH.MaxX) / 2
	local cz = (BOOTH.MinZ + BOOTH.MaxZ) / 2
	local frontX = BOOTH.MaxX - 5.5 -- the ticket-window wall, facing +X (the walkway)
	local backX = BOOTH.MinX + 0.5
	local bodyX = (frontX + backX) / 2
	local bodyW = frontX - backX
	local bodyD = 10
	local southZ, northZ = cz - bodyD / 2, cz + bodyD / 2
	local padTop = 0.25
	local wallTop = 8
	local bandTop = 9
	local roofTop = 9.8
	local bodyPos = Vector3.new(bodyX, 0, cz)

	---------------------------------------------------------------- step 1: the booth
	BuildUtil.Stage(ctx, 1)
	BuildUtil.Box(
		ctx,
		"Pad",
		Vector3.new(BOOTH.MaxX - BOOTH.MinX, padTop, BOOTH.MaxZ - BOOTH.MinZ),
		Vector3.new(cx, padTop / 2, cz),
		C.ConcreteDark,
		Enum.Material.Concrete
	)
	BuildUtil.Block(ctx, "Plinth", Vector3.new(bodyW + 0.2, 0.8, bodyD + 0.2), bodyPos, C.Concrete, Enum.Material.Concrete, nil, padTop)
	BuildUtil.Block(
		ctx,
		"Body",
		Vector3.new(bodyW, wallTop - padTop, bodyD),
		bodyPos,
		team.Primary,
		Enum.Material.SmoothPlastic,
		nil,
		padTop
	)
	-- trim-coloured corner pilasters (stand 0.1 proud of both walls)
	for _, x in ipairs({ backX + 0.15, frontX - 0.15 }) do
		for _, z in ipairs({ southZ + 0.15, northZ - 0.15 }) do
			BuildUtil.Block(
				ctx,
				"CornerTrim",
				Vector3.new(0.5, wallTop - padTop - 0.8, 0.5),
				Vector3.new(x, 0, z),
				team.Trim,
				Enum.Material.SmoothPlastic,
				nil,
				padTop + 0.8
			)
		end
	end
	BuildUtil.Block(
		ctx,
		"Band",
		Vector3.new(bodyW + 0.2, bandTop - wallTop, bodyD + 0.2),
		bodyPos,
		team.Trim,
		Enum.Material.SmoothPlastic,
		nil,
		wallTop
	)
	BuildUtil.Block(
		ctx,
		"Roof",
		Vector3.new(bodyW + 1, roofTop - bandTop, bodyD + 1.2),
		bodyPos,
		team.Secondary,
		Enum.Material.SmoothPlastic,
		nil,
		bandTop
	)
	-- back door (set 0.05 into the wall) with a push bar, and an AC unit hanging on the back wall
	BuildUtil.Block(
		ctx,
		"Door",
		Vector3.new(0.3, 6.2, 3),
		Vector3.new(backX - 0.1, 0, cz + 2.5),
		C.Wood,
		Enum.Material.WoodPlanks,
		nil,
		1.05
	)
	BuildUtil.Box(
		ctx,
		"DoorHandle",
		Vector3.new(0.2, 0.25, 1.8),
		Vector3.new(backX - 0.35, 4, cz + 2.5),
		C.Metal,
		Enum.Material.Metal,
		NO_COLLIDE
	)
	BuildUtil.Box(ctx, "ACUnit", Vector3.new(0.5, 1.6, 2.4), Vector3.new(backX - 0.25, 6.6, cz - 2.3), C.Metal, Enum.Material.DiamondPlate)
	cylinderAt(ctx, "ACFan", CFrame.new(backX - 0.52, 6.6, cz - 2.3), 0.06, 1.2, DARK_METAL, Enum.Material.Metal, NO_COLLIDE)
	-- a security camera on an arm off the north wall, watching the window and the queue
	BuildUtil.Box(
		ctx,
		"CameraArm",
		Vector3.new(0.25, 0.25, 0.9),
		Vector3.new(frontX - 0.4, 7.4, northZ + 0.45),
		DARK_METAL,
		Enum.Material.Metal
	)
	local camera = BuildUtil.Part(ctx, {
		Name = "SecurityCamera",
		Size = Vector3.new(1.2, 0.55, 0.6),
		CFrame = CFrame.new(frontX - 0.1, 7.15, northZ + 0.95) * CFrame.Angles(0, math.rad(30), 0) * CFrame.Angles(0, 0, math.rad(-15)),
		Color = CHROME,
		Material = Enum.Material.Metal,
	})
	BuildUtil.Look(
		camera,
		"Box Office Camera",
		"Smile! This camera keeps an eye on the ticket line - and catches the best happy dances when fans get their tickets.",
		{ Distance = 10 }
	)

	---------------------------------------------------------------- step 2: window, counter, awning, queue
	BuildUtil.Stage(ctx, 2)
	local windowY = 5.85
	BuildUtil.Box(
		ctx,
		"WindowFrame",
		Vector3.new(0.12, 4, 6.6),
		Vector3.new(frontX + 0.06, windowY, cz),
		team.Trim,
		Enum.Material.SmoothPlastic
	)
	BuildUtil.Box(
		ctx,
		"WindowInside",
		Vector3.new(0.1, 3.5, 6),
		Vector3.new(frontX + 0.17, windowY, cz),
		DARK_WINDOW,
		Enum.Material.SmoothPlastic
	)
	local windowGlass = BuildUtil.Box(
		ctx,
		"WindowGlass",
		Vector3.new(0.1, 3.5, 6),
		Vector3.new(frontX + 0.27, windowY, cz),
		C.Glass,
		Enum.Material.Glass,
		{ Transparency = 0.55 }
	)
	BuildUtil.Look(
		windowGlass,
		"Ticket Window",
		"Tickets for the next game day are sold right here. The more stands you build, the more fans fill your stadium!",
		{ LookKey = "season", At = Vector3.new(0.9, -1, 0), Distance = 8 }
	)
	-- round speak-through grille in the glass
	cylinderAt(
		ctx,
		"SpeakerGrille",
		CFrame.new(frontX + 0.34, windowY + 0.2, cz - 1.6),
		0.06,
		1,
		CHROME,
		Enum.Material.DiamondPlate,
		NO_COLLIDE
	)

	local counterDepth = 1.4
	BuildUtil.Block(
		ctx,
		"Counter",
		Vector3.new(counterDepth, 3.55 - padTop, 7.2),
		Vector3.new(frontX + counterDepth / 2, 0, cz),
		team.Secondary,
		Enum.Material.SmoothPlastic,
		nil,
		padTop
	)
	local counterTop = BuildUtil.Block(
		ctx,
		"CounterTop",
		Vector3.new(counterDepth + 0.4, 0.25, 7.6),
		Vector3.new(frontX + (counterDepth + 0.4) / 2, 0, cz),
		C.Metal,
		Enum.Material.Metal,
		nil,
		3.55
	)
	BuildUtil.Light(counterTop, "PointLight", { Name = "CounterLight", Range = 12, Brightness = 1, Color = WARM_LIGHT })
	-- ticket tray + a little stack of tickets under the window
	BuildUtil.Block(
		ctx,
		"TicketTray",
		Vector3.new(0.9, 0.2, 1.6),
		Vector3.new(frontX + 0.75, 0, cz + 0.4),
		DARK_METAL,
		Enum.Material.Metal,
		NO_COLLIDE,
		3.8
	)
	BuildUtil.Block(
		ctx,
		"Tickets",
		Vector3.new(0.5, 0.12, 0.9),
		Vector3.new(frontX + 0.75, 0, cz + 0.4),
		team.Secondary,
		Enum.Material.SmoothPlastic,
		PAINT,
		4
	)

	stripedAwning(ctx, {
		Name = "Awning",
		WallX = frontX,
		Reach = 3.6,
		TopY = 7.95,
		Drop = 1.2,
		MinZ = cz - 5.5,
		MaxZ = cz + 5.5,
		Strips = 5,
		Colors = stripeColors(team),
	})

	-- Queue: chrome posts with team-coloured belts make a lane along the counter
	local queueX = BOOTH.MaxX - 0.6
	local postZs = { southZ - 0.2, southZ + 3.2, northZ - 3.2, northZ + 0.2 }
	for i, z in ipairs(postZs) do
		BuildUtil.Cylinder(ctx, {
			Name = "QueueBase",
			Position = Vector3.new(queueX, padTop + 0.075, z),
			Height = 0.15,
			Diameter = 1.2,
			Color = CHROME,
			Material = Enum.Material.Metal,
		})
		BuildUtil.Cylinder(ctx, {
			Name = "QueuePost",
			Position = Vector3.new(queueX, padTop + 1.7, z),
			Height = 3.4,
			Diameter = 0.35,
			Color = CHROME,
			Material = Enum.Material.Metal,
			Reflectance = 0.2,
		})
		local nextZ = postZs[i + 1]
		if nextZ then
			BuildUtil.Box(
				ctx,
				"QueueBelt",
				Vector3.new(0.08, 0.4, nextZ - z - 0.3),
				Vector3.new(queueX, padTop + 3.05, (z + nextZ) / 2),
				team.Primary,
				Enum.Material.Fabric
			)
		end
	end
	-- a bench for the people waiting (on the stadium side, under the giant ticket; its back against
	-- the wall, so there is no narrow slot behind it) and two flower pots at the far end of the
	-- queue lane
	parkBench(ctx, "WaitingBench", CFrame.new(bodyX, 0, northZ + 0.95) * CFrame.Angles(0, math.pi, 0), 4.6, 0, C.Wood)
	flowerPot(ctx, "FlowerPot", frontX + 0.9, northZ + 1.8, 0, 1.6, 1.4, TERRACOTTA, FLOWER_PINK)
	flowerPot(ctx, "FlowerPot", queueX + 1.2, northZ + 1.8, 0, 1.6, 1.4, TERRACOTTA, FLOWER_RED)

	---------------------------------------------------------------- step 3: signs
	BuildUtil.Stage(ctx, 3)
	local boxOffice = BuildUtil.Box(
		ctx,
		"BoxOfficeSign",
		Vector3.new(0.12, 0.8, bodyD - 0.8),
		Vector3.new(frontX + 0.16, (wallTop + bandTop) / 2, cz),
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	sign(boxOffice, { Enum.NormalId.Right }, "BOX OFFICE", team.Primary, team, { InsetY = 0.1 })

	-- neon OPEN sign in the top corner of the window
	local openSign = BuildUtil.Box(
		ctx,
		"OpenSign",
		Vector3.new(0.08, 0.75, 1.8),
		Vector3.new(frontX + 0.36, windowY + 1.1, cz + 1.9),
		OPEN_RED,
		Enum.Material.Neon,
		NO_COLLIDE
	)
	sign(openSign, { Enum.NormalId.Right }, "OPEN", OPEN_RED, team, { TextColor3 = WHITE, Glow = true, InsetY = 0.1 })

	-- "LINE STARTS HERE" card on top of the first queue post, facing the gate
	local lineCard = BuildUtil.Box(
		ctx,
		"LineCard",
		Vector3.new(1.9, 1.1, 0.1),
		Vector3.new(queueX, padTop + 4, postZs[1]),
		team.Trim,
		Enum.Material.SmoothPlastic,
		NO_COLLIDE
	)
	sign(lineCard, { Enum.NormalId.Front }, "LINE STARTS HERE", team.Trim, team, { Wrap = true, InsetX = 0.08, InsetY = 0.08 })

	-- glowing GAME DAY TICKETS screen on the street side, with a scrolling-ticker strip
	local screenY = 5.4
	BuildUtil.Box(
		ctx,
		"ScreenBezel",
		Vector3.new(5.2, 3.3, 0.2),
		Vector3.new(bodyX, screenY, southZ - 0.1),
		DARK_METAL,
		Enum.Material.Metal
	)
	local screen = BuildUtil.Box(
		ctx,
		"TicketScreen",
		Vector3.new(4.8, 2.9, 0.1),
		Vector3.new(bodyX, screenY, southZ - 0.25),
		SCREEN,
		Enum.Material.SmoothPlastic
	)
	-- the server keeps it counting down: "NEXT GAME IN 2:15" / "GAME DAY! 0:42 LEFT"
	liveScreen(screen, Enum.NormalId.Front, "gameday", "GAME DAY\nTICKETS", textColorOn(SCREEN, { team.Secondary, team.Trim, C.Gold }))
	local ticker = BuildUtil.Box(
		ctx,
		"TickerStrip",
		Vector3.new(4.8, 0.7, 0.1),
		Vector3.new(bodyX, screenY - 2.15, southZ - 0.06),
		accent(team),
		Enum.Material.Neon
	)
	sign(ticker, { Enum.NormalId.Front }, "ON SALE NOW", accent(team), team, { Glow = true, InsetY = 0.08 })
	BuildUtil.Light(screen, "SurfaceLight", { Name = "ScreenGlow", Face = Enum.NormalId.Front, Range = 10, Brightness = 1, Angle = 70 })

	-- giant ADMIT ONE ticket stub on the stadium side, with a dashed tear line
	local ticket = BuildUtil.Box(
		ctx,
		"GiantTicket",
		Vector3.new(4.8, 2.4, 0.15),
		Vector3.new(bodyX + 0.1, 5, northZ + 0.075),
		team.Secondary,
		Enum.Material.SmoothPlastic
	)
	sign(ticket, { Enum.NormalId.Back }, "ADMIT ONE", team.Secondary, team, { InsetX = 0.2, InsetY = 0.18 })
	BuildUtil.Box(
		ctx,
		"TicketTearLine",
		Vector3.new(0.15, 2.1, 0.05),
		Vector3.new(bodyX - 1.5, 5, northZ + 0.17),
		team.Trim,
		Enum.Material.SmoothPlastic,
		NO_COLLIDE
	)

	-- Roof sign on two short posts: a box reading TICKETS on all four sides, with a neon cap
	local postHeight = 0.8
	local signHeight = 2.8
	for _, side in ipairs({ -1, 1 }) do
		BuildUtil.Block(
			ctx,
			"SignPost",
			Vector3.new(0.6, postHeight, 0.6),
			Vector3.new(bodyX, 0, cz + side * 3.2),
			DARK_METAL,
			Enum.Material.Metal,
			nil,
			roofTop
		)
	end
	local signBox = BuildUtil.Block(
		ctx,
		"TicketsSign",
		Vector3.new(bodyW + 0.4, signHeight, 9.2),
		bodyPos,
		team.Trim,
		Enum.Material.SmoothPlastic,
		nil,
		roofTop + postHeight
	)
	sign(
		signBox,
		{ Enum.NormalId.Front, Enum.NormalId.Right, Enum.NormalId.Back, Enum.NormalId.Left },
		"TICKETS",
		team.Trim,
		team,
		{ InsetY = 0.1 }
	)
	BuildUtil.Block(
		ctx,
		"TicketsSignCap",
		Vector3.new(bodyW + 0.7, 0.3, 9.5),
		bodyPos,
		accent(team),
		Enum.Material.Neon,
		nil,
		roofTop + postHeight + signHeight
	)

	-- NOW SERVING display in the other top corner of the window (red LED digits)
	local serving = BuildUtil.Box(
		ctx,
		"NowServing",
		Vector3.new(0.08, 0.75, 1.8),
		Vector3.new(frontX + 0.36, windowY + 1.1, cz - 1.9),
		SCREEN,
		Enum.Material.SmoothPlastic,
		NO_COLLIDE
	)
	sign(serving, { Enum.NormalId.Right }, "NOW SERVING  07", SCREEN, team, { TextColor3 = OPEN_RED, Glow = true, InsetY = 0.12 })

	-- two self-serve ticket kiosks south of the queue, facing the walkway (a walkable 2.6 apart): a
	-- team-colour pedestal, a tilted touch screen and a TICKETS header
	for index, z in ipairs({ southZ - 3.4, southZ - 8.2 }) do
		local x = queueX + 3
		BuildUtil.Block(ctx, "Kiosk", Vector3.new(1.4, 4.4, 2.2), Vector3.new(x, 0, z), team.Primary, Enum.Material.SmoothPlastic)
		local touch = BuildUtil.Part(ctx, {
			Name = "KioskScreen",
			Size = Vector3.new(0.12, 1.5, 1.8),
			CFrame = CFrame.new(x + 0.78, 3.35, z) * CFrame.Angles(0, 0, math.rad(18)),
			Color = SCREEN,
		})
		local _, label = BuildUtil.SurfaceText(touch, Enum.NormalId.Right, "TAP FOR\nTICKETS", {
			LabelName = "KioskText",
			TextColor3 = textColorOn(SCREEN, { team.Secondary, team.Trim, C.Gold }),
			BackgroundColor3 = SCREEN,
			BackgroundTransparency = 0,
			LightInfluence = 0,
			PixelsPerStud = 40,
		})
		label.TextWrapped = true
		local header = BuildUtil.Block(
			ctx,
			"KioskHeader",
			Vector3.new(1.6, 0.8, 2.4),
			Vector3.new(x, 0, z),
			team.Secondary,
			Enum.Material.SmoothPlastic,
			nil,
			4.4
		)
		sign(header, { Enum.NormalId.Right, Enum.NormalId.Front }, "TICKETS", team.Secondary, team, { InsetY = 0.14 })
		if index == 1 then
			BuildUtil.Look(
				touch,
				"Ticket Kiosk",
				"Skip the line! Pick your seats and print your tickets: lower bowl $45, club seats $120, upper deck $25. Kids get in for half price!",
				{ Distance = 7 }
			)
		end
	end
end

---------------------------------------------------------------------------------------------
-- Concession stand
---------------------------------------------------------------------------------------------

-- Picnic table (long side along X) with a team umbrella through the middle.
local function picnicTable(ctx, name, x, z, base, woodColor, umbrellaColor, umbrellaTop)
	local top = base + 2.55
	BuildUtil.Block(ctx, name .. "Top", Vector3.new(5, 0.3, 2.4), Vector3.new(x, 0, z), woodColor, Enum.Material.WoodPlanks, nil, top)
	for _, side in ipairs({ -1, 1 }) do
		-- benches you can sit on, both facing the table (a seated player faces the seat's -Z)
		BuildUtil.Seat(ctx, {
			Name = name .. "Bench",
			Size = Vector3.new(5, 0.3, 0.9),
			CFrame = CFrame.new(x, base + 1.35, z + side * 1.75) * CFrame.Angles(0, side == 1 and 0 or math.pi, 0),
			Color = woodColor,
			Material = Enum.Material.WoodPlanks,
			Object = "Picnic Bench",
		})
		BuildUtil.Block(
			ctx,
			name .. "Leg",
			Vector3.new(0.4, 2.55, 0.4),
			Vector3.new(x + side * 2, 0, z),
			DARK_METAL,
			Enum.Material.Metal,
			nil,
			base
		)
		BuildUtil.Block(
			ctx,
			name .. "Crossbar",
			Vector3.new(0.3, 0.3, 4.3),
			Vector3.new(x + side * 2, 0, z),
			DARK_METAL,
			Enum.Material.Metal,
			nil,
			base + 0.9
		)
	end
	local poleTop = umbrellaTop - 0.3
	BuildUtil.Cylinder(ctx, {
		Name = name .. "UmbrellaPole",
		Position = Vector3.new(x, (top + poleTop) / 2, z),
		Height = poleTop - top,
		Diameter = 0.25,
		Color = WHITE,
		Material = Enum.Material.Metal,
	})
	BuildUtil.Cylinder(ctx, {
		Name = name .. "Umbrella",
		Position = Vector3.new(x, poleTop + 0.15, z),
		Height = 0.3,
		Diameter = 5.6,
		Color = umbrellaColor,
		Material = Enum.Material.Fabric,
	})
	BuildUtil.Cylinder(ctx, {
		Name = name .. "UmbrellaTop",
		Position = Vector3.new(x, poleTop + 0.5, z),
		Height = 0.4,
		Diameter = 2.6,
		Color = umbrellaColor,
		Material = Enum.Material.Fabric,
	})
	BuildUtil.Ball(ctx, { Name = name .. "UmbrellaFinial", Position = Vector3.new(x, poleTop + 0.85, z), Diameter = 0.5, Color = WHITE })
end

-- Round bin with a coloured lid.
local function bin(ctx, name, x, z, base, lidColor)
	BuildUtil.Cylinder(ctx, {
		Name = name,
		Position = Vector3.new(x, base + 1.3, z),
		Height = 2.6,
		Diameter = 1.6,
		Color = DARK_METAL,
		Material = Enum.Material.Metal,
	})
	BuildUtil.Cylinder(ctx, {
		Name = name .. "Lid",
		Position = Vector3.new(x, base + 2.75, z),
		Height = 0.3,
		Diameter = 1.8,
		Color = lidColor,
		Material = Enum.Material.Metal,
	})
end

function Plaza.concessions(ctx)
	local C = ctx.config.Colors
	local team = ctx.colors

	local cz = (STAND.MinZ + STAND.MaxZ) / 2
	local frontX = STAND.MaxX - 9 -- serving side, faces +X (the walkway)
	local backX = STAND.MinX + 1
	local bodyX = (frontX + backX) / 2
	local bodyW = frontX - backX
	local bodyD = 10.8
	local southZ, northZ = cz - bodyD / 2, cz + bodyD / 2
	local padTop = 0.25
	local wallTop = 9
	local roofTop = wallTop + 0.8
	local bodyPos = Vector3.new(bodyX, 0, cz)
	local openingY = 5.7
	local windowZ = cz - 2.1
	local windowW = 5.4
	local menuZ = cz + 3

	---------------------------------------------------------------- step 1: the stand
	BuildUtil.Stage(ctx, 1)
	BuildUtil.Box(
		ctx,
		"Patio",
		Vector3.new(STAND.MaxX - STAND.MinX, padTop, STAND.MaxZ - PATIO_MIN_Z),
		Vector3.new((STAND.MinX + STAND.MaxX) / 2, padTop / 2, (PATIO_MIN_Z + STAND.MaxZ) / 2),
		C.Walkway,
		Enum.Material.Pavement
	)
	BuildUtil.Block(
		ctx,
		"Body",
		Vector3.new(bodyW, wallTop - padTop, bodyD),
		bodyPos,
		team.Secondary,
		Enum.Material.SmoothPlastic,
		nil,
		padTop
	)
	BuildUtil.Block(
		ctx,
		"BaseBand",
		Vector3.new(bodyW + 0.2, 1.2, bodyD + 0.2),
		bodyPos,
		team.Primary,
		Enum.Material.SmoothPlastic,
		nil,
		padTop
	)
	-- corner posts in the team colour (stand 0.15 proud of both walls)
	for _, x in ipairs({ backX + 0.1, frontX - 0.1 }) do
		for _, z in ipairs({ southZ + 0.1, northZ - 0.1 }) do
			BuildUtil.Block(
				ctx,
				"CornerPost",
				Vector3.new(0.5, wallTop - padTop - 1.2, 0.5),
				Vector3.new(x, 0, z),
				team.Primary,
				Enum.Material.SmoothPlastic,
				nil,
				padTop + 1.2
			)
		end
	end
	BuildUtil.Block(
		ctx,
		"Roof",
		Vector3.new(bodyW + 0.6, roofTop - wallTop, bodyD + 0.8),
		Vector3.new(bodyX - 0.3, 0, cz),
		team.Primary,
		Enum.Material.SmoothPlastic,
		nil,
		wallTop
	)
	BuildUtil.Block(
		ctx,
		"BackDoor",
		Vector3.new(0.3, 6.2, 3),
		Vector3.new(backX - 0.1, 0, cz + 2),
		C.Wood,
		Enum.Material.WoodPlanks,
		nil,
		padTop
	)
	-- serving hatch (dark kitchen behind it) in the +X wall
	BuildUtil.Box(
		ctx,
		"WindowFrame",
		Vector3.new(0.12, 3.7, windowW + 0.4),
		Vector3.new(frontX + 0.06, openingY, windowZ),
		team.Trim,
		Enum.Material.SmoothPlastic
	)
	BuildUtil.Box(
		ctx,
		"WindowInside",
		Vector3.new(0.1, 3.3, windowW),
		Vector3.new(frontX + 0.17, openingY, windowZ),
		DARK_WINDOW,
		Enum.Material.SmoothPlastic
	)
	-- kitchen exhaust hood + chimney on the roof
	BuildUtil.Block(
		ctx,
		"ExhaustHood",
		Vector3.new(2.4, 1, 2.4),
		Vector3.new(backX + 2, 0, cz + 1.4),
		C.Metal,
		Enum.Material.DiamondPlate,
		nil,
		roofTop
	)
	BuildUtil.Cylinder(ctx, {
		Name = "ExhaustPipe",
		Position = Vector3.new(backX + 2, roofTop + 2, cz + 1.4),
		Height = 2,
		Diameter = 1,
		Color = DARK_METAL,
		Material = Enum.Material.Metal,
	})

	---------------------------------------------------------------- step 2: counter, awning, seating
	BuildUtil.Stage(ctx, 2)
	BuildUtil.Block(
		ctx,
		"Counter",
		Vector3.new(2.4, 3.55 - padTop, bodyD - 0.4),
		Vector3.new(frontX + 1.2, 0, cz),
		team.Trim,
		Enum.Material.SmoothPlastic,
		nil,
		padTop
	)
	local counterTop = BuildUtil.Block(
		ctx,
		"CounterTop",
		Vector3.new(2.8, 0.25, bodyD),
		Vector3.new(frontX + 1.4, 0, cz),
		C.Metal,
		Enum.Material.Metal,
		nil,
		3.55
	)
	BuildUtil.Light(counterTop, "PointLight", { Name = "CounterLight", Range = 14, Brightness = 1.2, Color = WARM_LIGHT })
	-- hot dogs are handed out of the serving hatch (prompt over the counter in front of it)
	BuildUtil.Use(ctx, counterTop, "hotdog", {
		Object = "Hot Dog Stand",
		Title = "Game Day Hot Dog",
		Info = "Grilled, in a soft bun, with ketchup and mustard. The most popular snack in the stadium!",
		At = Vector3.new(0.2, 0.9, windowZ + 1.2 - cz),
		Distance = 6,
	})
	local counterY = 3.8
	local itemX = frontX + 1.6
	for i, color in ipairs({ KETCHUP, MUSTARD }) do
		BuildUtil.Cylinder(ctx, {
			Name = "SauceBottle",
			Position = Vector3.new(itemX + 0.3, counterY + 0.6, windowZ - 0.6 + i * 0.55),
			Height = 1.2,
			Diameter = 0.45,
			Color = color,
		})
	end
	BuildUtil.Block(
		ctx,
		"NapkinBox",
		Vector3.new(0.6, 0.8, 0.9),
		Vector3.new(itemX, 0, windowZ + 2.9),
		C.Metal,
		Enum.Material.Metal,
		nil,
		counterY
	)
	-- the drinks end of the counter: a stack of team cups (prompt for a soda)
	local cups = {}
	for i, color in ipairs({ team.Primary, team.Secondary }) do
		cups[i] = BuildUtil.Cylinder(ctx, {
			Name = "CounterCup",
			Position = Vector3.new(itemX, counterY + 0.5, cz + 2.9 + i * 0.85),
			Height = 1,
			Diameter = 0.7,
			Color = color,
		})
	end
	BuildUtil.Use(ctx, cups[1], "soda", {
		Object = "Drinks",
		Title = "Fountain Soda",
		Info = "Ice cold and fizzy, served in a cup with your team's colours on it.",
		Distance = 6,
	})
	-- popcorn machine at the south end of the counter
	local popX, popZ = frontX + 1.3, windowZ - 2
	BuildUtil.Block(
		ctx,
		"PopcornCart",
		Vector3.new(1.6, 0.5, 1.6),
		Vector3.new(popX, 0, popZ),
		OPEN_RED,
		Enum.Material.SmoothPlastic,
		nil,
		counterY
	)
	local popcornGlass = BuildUtil.Block(
		ctx,
		"PopcornGlass",
		Vector3.new(1.5, 1.6, 1.5),
		Vector3.new(popX, 0, popZ),
		C.Glass,
		Enum.Material.Glass,
		{ Transparency = 0.5 },
		counterY + 0.5
	)
	BuildUtil.Use(ctx, popcornGlass, "popcorn", {
		Object = "Popcorn Machine",
		Title = "Fresh Popcorn",
		Info = "Popped right here on the counter. Smell that butter!",
		Distance = 6,
	})
	BuildUtil.Block(
		ctx,
		"Popcorn",
		Vector3.new(1.3, 0.8, 1.3),
		Vector3.new(popX, 0, popZ),
		POPCORN,
		Enum.Material.Pebble,
		nil,
		counterY + 0.55
	)
	BuildUtil.Block(
		ctx,
		"PopcornLid",
		Vector3.new(1.7, 0.3, 1.7),
		Vector3.new(popX, 0, popZ),
		OPEN_RED,
		Enum.Material.SmoothPlastic,
		nil,
		counterY + 2.1
	)

	-- The awning only covers the serving window (a full-width one hid the menu board)
	stripedAwning(ctx, {
		Name = "Awning",
		WallX = frontX,
		Reach = 5.4,
		TopY = 7.85,
		Drop = 1.5,
		MinZ = windowZ - 3.2,
		MaxZ = windowZ + 3.2,
		Strips = 5,
		Colors = { team.Primary, team.Trim },
	})

	-- picnic tables with team umbrellas on the patio, bins at the corners
	-- picnic tables with team umbrellas on the street side of the stand, bins by the counter
	local tableZ = PATIO_MIN_Z + 2.6
	picnicTable(ctx, "PicnicWest", STAND.MinX + 4.5, tableZ, padTop, C.Wood, team.Primary, 8)
	picnicTable(ctx, "PicnicEast", STAND.MinX + 12, tableZ, padTop, C.Wood, team.Secondary, 8)
	bin(ctx, "TrashCan", STAND.MaxX - 0.9, STAND.MinZ - 1.1, padTop, team.Primary)
	bin(ctx, "RecycleBin", STAND.MaxX - 0.9, STAND.MaxZ - 0.9, padTop, Color3.fromRGB(40, 140, 70))

	-- a fixings counter against the stand's north wall (ketchup, mustard and relish pumps under a
	-- FIXIN'S sign) and two high-top tables beside it
	local fixX = bodyX - 1
	local fixings = BuildUtil.Block(
		ctx,
		"FixingsCounter",
		Vector3.new(4.4, 3.2, 1.3),
		Vector3.new(fixX, 0, northZ + 0.65),
		C.Metal,
		Enum.Material.DiamondPlate
	)
	for i, color in ipairs({ KETCHUP, MUSTARD, Color3.fromRGB(70, 150, 60) }) do
		BuildUtil.Cylinder(ctx, {
			Name = "FixingsPump",
			Position = Vector3.new(fixX + (i - 2) * 1.3, 3.7, northZ + 0.6),
			Height = 1,
			Diameter = 0.55,
			Color = color,
		})
	end
	local fixSign = BuildUtil.Box(
		ctx,
		"FixingsSign",
		Vector3.new(4, 1, 0.12),
		Vector3.new(fixX, 5.6, northZ + 0.06),
		team.Trim,
		Enum.Material.SmoothPlastic,
		NO_COLLIDE
	)
	sign(fixSign, { Enum.NormalId.Back }, "FIXIN'S", team.Trim, team, { InsetY = 0.1 })
	BuildUtil.Look(
		fixings,
		"Fixin's Station",
		"Ketchup, mustard and relish - pump as much as you like. Real fans put all three on!",
		{ At = Vector3.new(0, 0.6, 0.9), Distance = 8 }
	)
	for _, x in ipairs({ STAND.MaxX - 6.5, STAND.MaxX - 2.5 }) do
		BuildUtil.Cylinder(ctx, {
			Name = "HighTopLeg",
			Position = Vector3.new(x, 1.65, STAND.MaxZ + 2.4),
			Height = 3.3,
			Diameter = 0.35,
			Color = DARK_METAL,
			Material = Enum.Material.Metal,
		})
		BuildUtil.Cylinder(ctx, {
			Name = "HighTopTable",
			Position = Vector3.new(x, 3.4, STAND.MaxZ + 2.4),
			Height = 0.2,
			Diameter = 2.2,
			Color = C.Wood,
			Material = Enum.Material.WoodPlanks,
		})
	end

	---------------------------------------------------------------- step 3: menu, signs, soda machine, giant food
	BuildUtil.Stage(ctx, 3)
	BuildUtil.Box(
		ctx,
		"MenuFrame",
		Vector3.new(0.12, 3.7, 4),
		Vector3.new(frontX + 0.06, openingY, menuZ),
		team.Trim,
		Enum.Material.SmoothPlastic
	)
	local menu = BuildUtil.Box(
		ctx,
		"MenuBoard",
		Vector3.new(0.1, 3.3, 3.6),
		Vector3.new(frontX + 0.17, openingY, menuZ),
		CHALKBOARD,
		Enum.Material.Slate
	)
	sign(menu, { Enum.NormalId.Right }, "HOT DOG  $5\nNACHOS  $6\nPOPCORN $4\nSODA  $3", CHALKBOARD, team, {
		TextColor3 = MENU_TEXT,
		Font = Enum.Font.Oswald,
		InsetX = 0.08,
		InsetY = 0.08,
		PixelsPerStud = 30,
	})
	BuildUtil.Look(
		menu,
		"Menu Board",
		"Hot dogs, nachos, popcorn and soda. Today's special: the Touchdown Dog with extra mustard!",
		{ At = Vector3.new(0.4, 1.3, -1.3), Distance = 6 }
	)

	-- Street-facing side panel
	local sidePanel = BuildUtil.Box(
		ctx,
		"SidePanel",
		Vector3.new(bodyW - 1.5, 2.6, 0.15),
		Vector3.new(bodyX, 5.4, southZ - 0.075),
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	sign(sidePanel, { Enum.NormalId.Front }, "GAME DAY EATS", team.Primary, team)

	-- CONCESSIONS sign above the awning, with a neon strip on top
	local title = BuildUtil.Box(
		ctx,
		"ConcessionsSign",
		Vector3.new(0.3, 2.5, bodyD + 0.6),
		Vector3.new(frontX + 0.15, 9.2, cz),
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	sign(title, { Enum.NormalId.Right }, "CONCESSIONS", team.Primary, team, { InsetY = 0.1 })
	BuildUtil.Box(
		ctx,
		"ConcessionsSignGlow",
		Vector3.new(0.32, 0.2, bodyD + 0.6),
		Vector3.new(frontX + 0.15, 10.55, cz),
		accent(team),
		Enum.Material.Neon
	)

	-- Soda vending machine on the corner of the patio, facing the walkway
	local sodaX, sodaZ = STAND.MaxX - 1.2, PATIO_MIN_Z + 1.5
	local sodaFront = sodaX + 1.2
	local drinksMachine = BuildUtil.Block(
		ctx,
		"SodaMachine",
		Vector3.new(2.4, 6.2, 2.6),
		Vector3.new(sodaX, 0, sodaZ),
		OPEN_RED,
		Enum.Material.SmoothPlastic,
		nil,
		padTop
	)
	local sodaPanel = BuildUtil.Box(
		ctx,
		"SodaPanel",
		Vector3.new(0.1, 3.6, 1.7),
		Vector3.new(sodaFront + 0.05, padTop + 3.9, sodaZ - 0.3),
		accent(team),
		Enum.Material.Neon
	)
	sign(
		sodaPanel,
		{ Enum.NormalId.Right },
		"ICE\nCOLD\nDRINKS",
		accent(team),
		team,
		{ Glow = true, Wrap = true, InsetX = 0.1, InsetY = 0.08 }
	)
	BuildUtil.Use(ctx, drinksMachine, "sportsdrink", {
		Object = "Drinks Machine",
		Title = "Sports Drink",
		Info = "The same drink the players have on the sideline. Cold, fruity and full of energy!",
		At = Vector3.new(1.6, 0.6, 0),
		Distance = 8,
	})
	BuildUtil.Light(sodaPanel, "PointLight", { Name = "SodaGlow", Range = 8, Brightness = 0.8, Color = WARM_LIGHT })
	BuildUtil.Box(
		ctx,
		"SodaButtons",
		Vector3.new(0.1, 2.6, 0.5),
		Vector3.new(sodaFront + 0.05, padTop + 4.3, sodaZ + 0.85),
		DARK_METAL,
		Enum.Material.Metal
	)
	BuildUtil.Box(
		ctx,
		"SodaSlot",
		Vector3.new(0.14, 0.7, 1.6),
		Vector3.new(sodaFront + 0.07, padTop + 1.2, sodaZ - 0.2),
		INK,
		Enum.Material.SmoothPlastic
	)

	-- ORDER HERE (under the hatch) and DRINKS (under the menu) on the counter's front
	for _, spec in ipairs({ { windowZ, "ORDER HERE" }, { menuZ + 0.4, "DRINKS" } }) do
		local panel = BuildUtil.Box(
			ctx,
			"CounterSign",
			Vector3.new(0.1, 1.2, 3.6),
			Vector3.new(frontX + 2.45, 2.1, spec[1]),
			team.Primary,
			Enum.Material.SmoothPlastic,
			NO_COLLIDE
		)
		sign(panel, { Enum.NormalId.Right }, spec[2], team.Primary, team, { InsetY = 0.14 })
	end

	-- the day's special on a chalkboard A-frame by the patio, facing the walkway
	local tilt = math.rad(13)
	-- (beside the trash can with room to walk between them, out of the way to the hatch; the
	-- boards' lower edges stand on the plaza)
	local boardX, boardZ = STAND.MaxX + 2.8, cz - 5.6
	local boardY = math.cos(tilt) * 1.5 + math.sin(tilt) * 0.075 - 0.02
	local special = BuildUtil.Part(ctx, {
		Name = "SpecialsBoard",
		Size = Vector3.new(0.15, 3, 2.2),
		CFrame = CFrame.new(boardX + 0.42, boardY, boardZ) * CFrame.Angles(0, 0, tilt),
		Color = CHALKBOARD,
		Material = Enum.Material.Slate,
	})
	BuildUtil.Part(ctx, {
		Name = "SpecialsBoardBack",
		Size = Vector3.new(0.15, 3, 2.2),
		CFrame = CFrame.new(boardX - 0.42, boardY, boardZ) * CFrame.Angles(0, 0, -tilt),
		Color = C.Wood,
		Material = Enum.Material.WoodPlanks,
	})
	sign(special, { Enum.NormalId.Right }, "TODAY'S\nSPECIAL\nTOUCHDOWN\nDOG  $6", CHALKBOARD, team, {
		TextColor3 = MENU_TEXT,
		Font = Enum.Font.Oswald,
		Wrap = true,
		InsetX = 0.1,
		InsetY = 0.08,
		PixelsPerStud = 30,
	})
	BuildUtil.Look(
		special,
		"Today's Special",
		"The Touchdown Dog: a foot-long hot dog with double mustard and crunchy onions. Six bucks - and worth every penny!",
		{ Distance = 8 }
	)

	-- the employee of the month on the back wall
	local poster = BuildUtil.Box(
		ctx,
		"EmployeePoster",
		Vector3.new(0.1, 2.4, 1.8),
		Vector3.new(backX - 0.05, 5, cz - 3),
		WHITE,
		Enum.Material.SmoothPlastic,
		NO_COLLIDE
	)
	sign(poster, { Enum.NormalId.Left }, "EMPLOYEE OF THE MONTH\nHOT DOG HANK", WHITE, team, {
		TextColor3 = INK,
		Wrap = true,
		InsetX = 0.1,
		InsetY = 0.1,
	})
	BuildUtil.Look(
		poster,
		"Employee of the Month",
		"Hot Dog Hank grilled 4,000 hot dogs last season and never dropped a single one. Legend!",
		{ Distance = 8 }
	)

	-- a string of team-colour lights from the roof's front corner to a pole at the patio's corner
	local poleX, poleZ = STAND.MinX + 0.5, PATIO_MIN_Z + 0.5
	BuildUtil.Cylinder(ctx, {
		Name = "LightPole",
		Position = Vector3.new(poleX, (padTop + 9.6) / 2, poleZ),
		Height = 9.6 - padTop,
		Diameter = 0.3,
		Color = DARK_METAL,
		Material = Enum.Material.Metal,
	})
	local from = Vector3.new(frontX + 0.3, 9.6, cz - (bodyD + 0.6) / 2) -- (the CONCESSIONS sign's corner)
	local to = Vector3.new(poleX, 9.5, poleZ)
	BuildUtil.Part(ctx, {
		Name = "LightString",
		Size = Vector3.new(0.08, 0.08, (to - from).Magnitude),
		CFrame = CFrame.lookAt((from + to) / 2, to),
		Color = INK,
		CanCollide = false,
		CastShadow = false,
	})
	local bulbColors = { ledColor(team), OPEN_RED, Color3.fromRGB(60, 190, 90), Color3.fromRGB(70, 140, 235) }
	for i = 1, 5 do
		local t = i / 6
		local bulb = BuildUtil.Ball(ctx, {
			Name = "StringBulb",
			Position = from:Lerp(to, t) - Vector3.new(0, 0.3, 0),
			Diameter = 0.45,
			Color = bulbColors[(i - 1) % #bulbColors + 1],
			Material = Enum.Material.Neon,
			CanCollide = false,
			CastShadow = false,
		})
		if i == 3 then
			BuildUtil.Light(bulb, "PointLight", { Name = "PatioLight", Range = 12, Brightness = 0.6, Color = WARM_LIGHT })
		end
	end

	-- Giant hot dog on the roof (lying along Z so the walkway sees it side-on)
	local props = BuildUtil.Child(ctx, "RoofProps")
	local dogX = frontX - 3.6
	local dogZ = cz - 1.9
	BuildUtil.Block(
		props,
		"HotDogMount",
		Vector3.new(2.8, 0.4, 6.4),
		Vector3.new(dogX, 0, dogZ),
		team.Trim,
		Enum.Material.SmoothPlastic,
		nil,
		roofTop
	)
	local bunY = roofTop + 0.4 + 0.9
	for _, side in ipairs({ -1, 1 }) do
		BuildUtil.Cylinder(props, {
			Name = "Bun",
			Position = Vector3.new(dogX + side * 0.7, bunY, dogZ),
			Axis = "Z",
			Height = 6.2,
			Diameter = 1.8,
			Color = BUN,
		})
	end
	local sausageY = bunY + 0.75
	BuildUtil.Cylinder(props, {
		Name = "Sausage",
		Position = Vector3.new(dogX, sausageY, dogZ),
		Axis = "Z",
		Height = 6.8,
		Diameter = 1.3,
		Color = SAUSAGE,
	})
	for _, side in ipairs({ -1, 1 }) do
		BuildUtil.Ball(props, {
			Name = "SausageEnd",
			Position = Vector3.new(dogX, sausageY, dogZ + side * 3.4),
			Diameter = 1.3,
			Color = SAUSAGE,
		})
	end
	-- mustard zig-zag
	for i = 1, 3 do
		local yaw = (i % 2 == 1) and 20 or -20
		BuildUtil.Part(props, {
			Name = "Mustard",
			Size = Vector3.new(0.28, 0.18, 2),
			CFrame = CFrame.new(dogX, sausageY + 0.63, dogZ + (i - 2) * 1.88) * CFrame.Angles(0, math.rad(yaw), 0),
			Color = MUSTARD,
			CanCollide = false,
		})
	end

	-- Giant soda cup next to it
	local cupX, cupZ = frontX - 4, STAND.MaxZ - 2
	local cupHeight = 2.9
	BuildUtil.Cylinder(props, {
		Name = "SodaCup",
		Position = Vector3.new(cupX, roofTop + cupHeight / 2, cupZ),
		Height = cupHeight,
		Diameter = 3,
		Color = team.Primary,
	})
	BuildUtil.Cylinder(props, {
		Name = "SodaCupBand",
		Position = Vector3.new(cupX, roofTop + 1.6, cupZ),
		Height = 0.8,
		Diameter = 3.08,
		Color = team.Trim,
	})
	BuildUtil.Cylinder(props, {
		Name = "SodaLid",
		Position = Vector3.new(cupX, roofTop + cupHeight + 0.15, cupZ),
		Height = 0.3,
		Diameter = 3.2,
		Color = WHITE,
	})
	cylinderAt(
		props,
		"Straw",
		CFrame.new(cupX + 0.25, roofTop + cupHeight + 0.1, cupZ) * CFrame.Angles(0, 0, math.rad(75)),
		2,
		0.35,
		team.Secondary,
		Enum.Material.SmoothPlastic
	)
end

---------------------------------------------------------------------------------------------
-- Parking lot
---------------------------------------------------------------------------------------------

local LOT_TOP = 0.12
local PAINT_Y = LOT_TOP + 0.02 -- centre of 0.04 thick paint (top at 0.16)
local STALL_WIDTH = 7
local STALL_DEPTH = 10
local STALL_COUNT = 12

-- Painted arrow lying flat, pointing along the local +X of `frame` (a CFrame at the arrow's centre
-- on the asphalt). Shaft + a triangular head made of two mirrored wedges.
local ARROW_UP = { 0, 0, -1, -1, 0, 0, 0, 1, 0 } -- wedge: thickness down, triangle toward +Z
local ARROW_DOWN = { 0, 0, -1, 1, 0, 0, 0, -1, 0 } -- mirrored: triangle toward -Z

local function paintedArrow(ctx, name, frame, color)
	local shaft, headLength, headHalfWidth = 6, 3, 2.4
	local tip = (shaft + headLength) / 2
	local headBase = tip - headLength
	BuildUtil.Part(ctx, {
		Name = name .. "Shaft",
		Size = Vector3.new(shaft + 0.1, 0.04, 1.2),
		CFrame = frame * CFrame.new(headBase - shaft / 2 + 0.05, 0, 0),
		Color = color,
		CanCollide = false,
		CastShadow = false,
	})
	for _, half in ipairs({ { 1, ARROW_UP }, { -1, ARROW_DOWN } }) do
		local r = half[2]
		BuildUtil.Wedge(ctx, {
			Name = name .. "Head",
			Size = Vector3.new(0.04, headHalfWidth, headLength),
			CFrame = frame
				* CFrame.new(tip - headLength / 2, 0, half[1] * headHalfWidth / 2, r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9]),
			Color = color,
			CanCollide = false,
			CastShadow = false,
		})
	end
end

-- Wheels as one cylinder per axle (reads as two tyres from the side).
local function axle(ctx, name, frame, z, width, diameter)
	cylinderAt(ctx, name .. "Wheels", frame * CFrame.new(0, diameter / 2, z), width + 0.1, diameter, TIRE, Enum.Material.Rubber)
end

local function carLights(ctx, name, frame, width, y, length)
	boxAt(
		ctx,
		name .. "HeadLights",
		Vector3.new(width - 0.8, 0.35, 0.1),
		frame * CFrame.new(0, y, -length / 2 - 0.05),
		WARM_LIGHT,
		Enum.Material.Neon
	)
	boxAt(
		ctx,
		name .. "TailLights",
		Vector3.new(width - 0.8, 0.35, 0.1),
		frame * CFrame.new(0, y, length / 2 + 0.05),
		TAIL_RED,
		Enum.Material.Neon
	)
end

-- Vehicles stand on the asphalt and face local -Z of `frame`; each returns its body part.
local VEHICLES = {}

function VEHICLES.Sedan(ctx, name, frame, color)
	local w, l = 4.6, 9.2
	local body = boxAt(ctx, name .. "Body", Vector3.new(w, 1.6, l), frame * CFrame.new(0, 1.4, 0), color)
	boxAt(ctx, name .. "Cabin", Vector3.new(w - 0.4, 1.3, 4.6), frame * CFrame.new(0, 2.85, 0.4), CAR_GLASS, Enum.Material.Glass)
	boxAt(ctx, name .. "Roof", Vector3.new(w - 0.3, 0.25, 3.8), frame * CFrame.new(0, 3.625, 0.6), color)
	axle(ctx, name, frame, -3, w, 2)
	axle(ctx, name, frame, 3, w, 2)
	carLights(ctx, name, frame, w, 1.8, l)
	return body
end

function VEHICLES.SUV(ctx, name, frame, color)
	local w, l = 4.8, 9.6
	local body = boxAt(ctx, name .. "Body", Vector3.new(w, 1.9, l), frame * CFrame.new(0, 1.85, 0), color)
	boxAt(ctx, name .. "Cabin", Vector3.new(w - 0.3, 1.5, 6.4), frame * CFrame.new(0, 3.55, 1), CAR_GLASS, Enum.Material.Glass)
	boxAt(ctx, name .. "Roof", Vector3.new(w - 0.2, 0.25, 6), frame * CFrame.new(0, 4.425, 1.2), color)
	boxAt(ctx, name .. "RoofRack", Vector3.new(w - 1, 0.25, 4.4), frame * CFrame.new(0, 4.675, 1.2), DARK_METAL, Enum.Material.Metal)
	axle(ctx, name, frame, -3.1, w, 2.4)
	axle(ctx, name, frame, 3.1, w, 2.4)
	carLights(ctx, name, frame, w, 2.3, l)
	return body
end

function VEHICLES.Pickup(ctx, name, frame, color, cargoColor)
	local w, l = 4.8, 10
	local body = boxAt(ctx, name .. "Body", Vector3.new(w, 1.5, l), frame * CFrame.new(0, 1.75, 0), color)
	boxAt(ctx, name .. "Cab", Vector3.new(w - 0.3, 1.5, 3.4), frame * CFrame.new(0, 3.25, -0.9), CAR_GLASS, Enum.Material.Glass)
	boxAt(ctx, name .. "CabRoof", Vector3.new(w - 0.2, 0.3, 3.2), frame * CFrame.new(0, 4.15, -0.8), color)
	-- open bed: two side walls and a tailgate on top of the body
	for _, side in ipairs({ -1, 1 }) do
		boxAt(ctx, name .. "BedSide", Vector3.new(0.3, 1, 4.2), frame * CFrame.new(side * (w / 2 - 0.15), 3, 2.9), color)
	end
	boxAt(ctx, name .. "Tailgate", Vector3.new(w, 1, 0.3), frame * CFrame.new(0, 3, l / 2 - 0.15), color)
	if cargoColor then
		-- a tailgating cooler in the bed
		boxAt(ctx, name .. "Cooler", Vector3.new(2, 1.1, 1.3), frame * CFrame.new(0, 3.05, 2.2), cargoColor)
	end
	axle(ctx, name, frame, -3.2, w, 2.4)
	axle(ctx, name, frame, 3.2, w, 2.4)
	carLights(ctx, name, frame, w, 2.1, l)
	return body
end

-- A small two-box car: short bonnet, the cabin running to the tail.
function VEHICLES.Hatchback(ctx, name, frame, color)
	local w, l = 4.4, 8
	local body = boxAt(ctx, name .. "Body", Vector3.new(w, 1.5, l), frame * CFrame.new(0, 1.3, 0), color)
	boxAt(ctx, name .. "Cabin", Vector3.new(w - 0.4, 1.3, 4.6), frame * CFrame.new(0, 2.7, 1.1), CAR_GLASS, Enum.Material.Glass)
	boxAt(ctx, name .. "Roof", Vector3.new(w - 0.3, 0.25, 4.3), frame * CFrame.new(0, 3.475, 1.25), color)
	axle(ctx, name, frame, -2.6, w, 1.9)
	axle(ctx, name, frame, 2.6, w, 1.9)
	carLights(ctx, name, frame, w, 1.6, l)
	return body
end

-- A tall boxy family van with a long window band.
function VEHICLES.Van(ctx, name, frame, color)
	local w, l = 5, 10.4
	local body = boxAt(ctx, name .. "Body", Vector3.new(w, 3.4, l), frame * CFrame.new(0, 2.8, 0), color)
	boxAt(ctx, name .. "Windows", Vector3.new(w + 0.1, 1.1, l - 3), frame * CFrame.new(0, 3.75, 0.6), CAR_GLASS, Enum.Material.Glass)
	boxAt(
		ctx,
		name .. "Windshield",
		Vector3.new(w - 0.6, 1.2, 0.1),
		frame * CFrame.new(0, 3.7, -l / 2 - 0.05),
		CAR_GLASS,
		Enum.Material.Glass
	)
	boxAt(ctx, name .. "Roof", Vector3.new(w - 0.3, 0.2, l - 1), frame * CFrame.new(0, 4.6, 0.2), color)
	axle(ctx, name, frame, -3.4, w, 2.2)
	axle(ctx, name, frame, 3.4, w, 2.2)
	carLights(ctx, name, frame, w, 2, l)
	return body
end

-- The team bus: team-coloured body, window band, white roof, name stripe on both sides.
function VEHICLES.Bus(ctx, name, frame, team, label)
	local w, l = 6.6, 26
	local body = boxAt(ctx, name .. "Body", Vector3.new(w, 6.4, l), frame * CFrame.new(0, 4.4, 0), team.Primary)
	boxAt(ctx, name .. "Windows", Vector3.new(w + 0.1, 2.2, l - 1.6), frame * CFrame.new(0, 5.9, 0.4), CAR_GLASS, Enum.Material.Glass)
	boxAt(ctx, name .. "Roof", Vector3.new(w - 0.4, 0.5, l - 0.6), frame * CFrame.new(0, 7.85, 0), team.Trim)
	boxAt(
		ctx,
		name .. "Windshield",
		Vector3.new(w - 0.6, 2.9, 0.1),
		frame * CFrame.new(0, 5.4, -l / 2 - 0.05),
		CAR_GLASS,
		Enum.Material.Glass
	)
	local destination = boxAt(
		ctx,
		name .. "DestinationSign",
		Vector3.new(w - 1, 0.6, 0.12),
		frame * CFrame.new(0, 7.25, -l / 2 - 0.06),
		INK,
		Enum.Material.SmoothPlastic
	)
	sign(destination, { Enum.NormalId.Front }, "GAME DAY", INK, team, { TextColor3 = LINE_YELLOW, Glow = true, InsetY = 0.05 })
	local stripe = boxAt(ctx, name .. "Stripe", Vector3.new(w + 0.14, 1.6, l - 6), frame * CFrame.new(0, 3, 1), team.Secondary)
	sign(stripe, { Enum.NormalId.Left, Enum.NormalId.Right }, label, team.Secondary, team, { InsetX = 0.04, InsetY = 0.08 })
	boxAt(
		ctx,
		name .. "Door",
		Vector3.new(0.08, 4.4, 2.4),
		frame * CFrame.new(w / 2 + 0.06, 3.6, -l / 2 + 1.6),
		CAR_GLASS,
		Enum.Material.Glass
	)
	axle(ctx, name, frame, -l / 2 + 4.5, w, 2.4)
	axle(ctx, name, frame, l / 2 - 6.6, w, 2.4)
	axle(ctx, name, frame, l / 2 - 3.9, w, 2.4)
	boxAt(
		ctx,
		name .. "HeadLights",
		Vector3.new(w - 1.2, 0.5, 0.1),
		frame * CFrame.new(0, 2, -l / 2 - 0.05),
		WARM_LIGHT,
		Enum.Material.Neon
	)
	boxAt(ctx, name .. "TailLights", Vector3.new(w - 1.2, 0.5, 0.1), frame * CFrame.new(0, 2, l / 2 + 0.05), TAIL_RED, Enum.Material.Neon)
	return body
end

function Plaza.parking(ctx)
	local C = ctx.config.Colors
	local team = ctx.colors

	local lotX = (LOT.MinX + LOT.MaxX) / 2
	local lotZ = (LOT.MinZ + LOT.MaxZ) / 2
	local firstX = LOT.MinX + 6
	local rowLength = STALL_WIDTH * STALL_COUNT
	local lastX = firstX + rowLength
	local rowCenters = { lotZ - 22, lotZ + 22 }
	local midAisleZ = lotZ
	local exitMinZ, exitMaxZ = lotZ - 6, lotZ + 6 -- pedestrian exit toward the plaza (east side)
	local entryMinX, entryMaxX = LOT.MaxX - 24, LOT.MaxX - 10 -- car entrance from the street (south side)
	local islandX = (LOT.MinX + 0.8 + firstX - 1) / 2
	local busZ = LOT.MinZ + 8
	local busBay = { MinX = LOT.MinX + 3, MaxX = LOT.MinX + 43, MinZ = busZ - 4.6, MaxZ = busZ + 4.6 }

	---------------------------------------------------------------- step 1: asphalt, curbs, islands, P sign
	BuildUtil.Stage(ctx, 1)
	BuildUtil.Box(
		ctx,
		"Asphalt",
		Vector3.new(LOT.MaxX - LOT.MinX, LOT_TOP, LOT.MaxZ - LOT.MinZ),
		Vector3.new(lotX, LOT_TOP / 2, lotZ),
		C.Asphalt,
		Enum.Material.Asphalt
	)
	-- low curbs around the lot (gaps for the car entrance and the walk to the plaza); 0.4 tall at most,
	-- so golf carts can still roll over them
	local curbH, curbW = 0.4, 0.8
	local function curb(minX, maxX, minZ, maxZ)
		BuildUtil.Block(
			ctx,
			"Curb",
			Vector3.new(maxX - minX, curbH, maxZ - minZ),
			Vector3.new((minX + maxX) / 2, 0, (minZ + maxZ) / 2),
			C.Concrete,
			Enum.Material.Concrete
		)
	end
	curb(LOT.MinX, LOT.MaxX, LOT.MaxZ - curbW, LOT.MaxZ)
	curb(LOT.MinX, LOT.MinX + curbW, LOT.MinZ, LOT.MaxZ - curbW)
	curb(LOT.MinX + curbW, entryMinX, LOT.MinZ, LOT.MinZ + curbW)
	curb(entryMaxX, LOT.MaxX, LOT.MinZ, LOT.MinZ + curbW)
	curb(LOT.MaxX - curbW, LOT.MaxX, LOT.MinZ + curbW, exitMinZ)
	curb(LOT.MaxX - curbW, LOT.MaxX, exitMaxZ, LOT.MaxZ - curbW)
	-- planted islands with a tree at the west end of each double row
	for _, zc in ipairs(rowCenters) do
		BuildUtil.Block(
			ctx,
			"IslandCurb",
			Vector3.new(firstX - 1 - (LOT.MinX + curbW), curbH, 19),
			Vector3.new(islandX, 0, zc),
			C.Concrete,
			Enum.Material.Concrete
		)
		BuildUtil.Block(
			ctx,
			"IslandGrass",
			Vector3.new(3.4, 0.08, 18.2),
			Vector3.new(islandX, 0, zc),
			C.Grass,
			Enum.Material.Grass,
			nil,
			curbH
		)
		BuildUtil.Cylinder(ctx, {
			Name = "TreeTrunk",
			Position = Vector3.new(islandX, curbH + 2.6, zc - 5),
			Height = 5.2,
			Diameter = 0.8,
			Color = TREE_TRUNK,
			Material = Enum.Material.Wood,
		})
		BuildUtil.Ball(ctx, {
			Name = "TreeCrown",
			Position = Vector3.new(islandX, 7.4, zc - 5),
			Diameter = 5.2,
			Color = BUSH,
			Material = Enum.Material.Grass,
		})
		BuildUtil.Ball(ctx, {
			Name = "TreeCrown",
			Position = Vector3.new(islandX + 0.6, 9.3, zc - 4.4),
			Diameter = 3.4,
			Color = C.GrassDark,
			Material = Enum.Material.Grass,
		})
	end
	-- "P" sign at the street corner nearest the plaza
	local signX, signZ = LOT.MaxX - 3.5, LOT.MinZ + 3.5
	BuildUtil.Cylinder(ctx, {
		Name = "SignPole",
		Position = Vector3.new(signX, LOT_TOP + 6.5, signZ),
		Height = 13,
		Diameter = 0.6,
		Color = DARK_METAL,
		Material = Enum.Material.Metal,
	})
	local cube = BuildUtil.Block(
		ctx,
		"ParkingSign",
		Vector3.new(4.4, 4.4, 4.4),
		Vector3.new(signX, 0, signZ),
		team.Primary,
		Enum.Material.SmoothPlastic,
		nil,
		13
	)
	sign(
		cube,
		{ Enum.NormalId.Front, Enum.NormalId.Right, Enum.NormalId.Back, Enum.NormalId.Left },
		"P",
		team.Primary,
		team,
		{ InsetY = 0.08 }
	)
	-- thicker than the 0.6 pole, so the pole doesn't poke through the middle of the text
	local board = BuildUtil.Box(
		ctx,
		"ParkingBoard",
		Vector3.new(0.9, 1.6, 6.4),
		Vector3.new(signX, 11.6, signZ),
		team.Trim,
		Enum.Material.SmoothPlastic
	)
	sign(board, { Enum.NormalId.Right, Enum.NormalId.Left }, "FAN PARKING", team.Trim, team, { InsetY = 0.1 })
	-- the pay station beside the car entrance
	local payX, payZ = entryMinX - 1.6, LOT.MinZ - 1.6
	local pay = BuildUtil.Block(ctx, "PayStation", Vector3.new(1.2, 4.2, 1.2), Vector3.new(payX, 0, payZ), DARK_METAL, Enum.Material.Metal)
	local payTop = BuildUtil.Block(
		ctx,
		"PayStationSign",
		Vector3.new(1.6, 1, 1.6),
		Vector3.new(payX, 0, payZ),
		team.Primary,
		Enum.Material.SmoothPlastic,
		nil,
		4.2
	)
	sign(payTop, { Enum.NormalId.Front, Enum.NormalId.Right, Enum.NormalId.Back, Enum.NormalId.Left }, "PAY", team.Primary, team)
	BuildUtil.Look(
		pay,
		"Parking Pay Station",
		"Parking on game day costs $20 - or ride the Team Bus from the HQ for free! It even takes high fives.",
		{ Distance = 8 }
	)
	-- (built with the cars) a bike rack - two hoops - with a bike, by the walk to the plaza
	local function bikeRack()
		local rackX, rackZ = LOT.MaxX + 2.5, exitMaxZ + 7
		for _, dz in ipairs({ -1.5, 1.5 }) do
			for _, dx in ipairs({ -0.85, 0.85 }) do
				BuildUtil.Cylinder(ctx, {
					Name = "BikeHoopLeg",
					Position = Vector3.new(rackX + dx, 1.2, rackZ + dz),
					Height = 2.4,
					Diameter = 0.3,
					Color = CHROME,
					Material = Enum.Material.Metal,
				})
			end
			BuildUtil.Cylinder(ctx, {
				Name = "BikeHoop",
				Position = Vector3.new(rackX, 2.4, rackZ + dz),
				Height = 2,
				Diameter = 0.3,
				Axis = "X",
				Color = CHROME,
				Material = Enum.Material.Metal,
			})
		end
		local bikeZ = rackZ - 0.75
		for _, dx in ipairs({ -1.1, 1.1 }) do
			BuildUtil.Cylinder(ctx, {
				Name = "BikeWheel",
				Position = Vector3.new(rackX + dx, 1, bikeZ),
				Height = 0.15,
				Diameter = 2,
				Axis = "Z",
				Color = TIRE,
				Material = Enum.Material.Rubber,
			})
		end
		local bikeFrame = BuildUtil.Box(
			ctx,
			"BikeFrame",
			Vector3.new(2.3, 0.2, 0.2),
			Vector3.new(rackX, 1.65, bikeZ),
			team.Secondary,
			Enum.Material.Metal
		)
		-- a saddle on its post, and the handlebar across the stem (resting against the hoop)
		BuildUtil.Box(ctx, "BikeSeatPost", Vector3.new(0.15, 0.7, 0.15), Vector3.new(rackX - 0.6, 2, bikeZ), INK, Enum.Material.Metal)
		BuildUtil.Box(ctx, "BikeSeat", Vector3.new(0.8, 0.18, 0.4), Vector3.new(rackX - 0.6, 2.44, bikeZ), INK)
		BuildUtil.Box(ctx, "BikeStem", Vector3.new(0.15, 0.75, 0.15), Vector3.new(rackX + 0.9, 2.02, bikeZ), INK, Enum.Material.Metal)
		BuildUtil.Box(ctx, "BikeHandlebar", Vector3.new(0.15, 0.15, 1.2), Vector3.new(rackX + 0.9, 2.47, bikeZ), INK)
		BuildUtil.Look(
			bikeFrame,
			"Bike Rack",
			"Some fans pedal to the game! Bikes park for free right by the lot - just lock them to the rack.",
			{ Distance = 8 }
		)
	end

	---------------------------------------------------------------- step 2: painted lines
	BuildUtil.Stage(ctx, 2)
	local stripes = BuildUtil.Child(ctx, "Stripes")
	local function paint(name, sizeX, sizeZ, x, z, color)
		return BuildUtil.Box(
			stripes,
			name,
			Vector3.new(sizeX, 0.04, sizeZ),
			Vector3.new(x, PAINT_Y, z),
			color or C.Line,
			Enum.Material.SmoothPlastic,
			PAINT
		)
	end
	-- Two double rows of stalls (12 stalls each side), divided by a centre line
	for row, zc in ipairs(rowCenters) do
		for i = 0, STALL_COUNT do
			paint("StallLine" .. row .. "_" .. i, 0.4, STALL_DEPTH * 2, firstX + i * STALL_WIDTH, zc)
		end
		paint("CentreLine" .. row, rowLength + 0.4, 0.4, firstX + rowLength / 2, zc)
	end
	-- accessible bays next to the walk to the plaza (blue fill sits under the white lines)
	for _, bay in ipairs({ { rowCenters[1], 1 }, { rowCenters[2], -1 } }) do
		BuildUtil.Box(
			stripes,
			"AccessibleBay",
			Vector3.new(STALL_WIDTH - 0.4, 0.03, STALL_DEPTH - 0.4),
			Vector3.new(lastX - STALL_WIDTH / 2, LOT_TOP + 0.015, bay[1] + bay[2] * STALL_DEPTH / 2),
			ACCESSIBLE_BLUE,
			Enum.Material.SmoothPlastic,
			PAINT
		)
	end
	-- Team-coloured "FAN PARKING" panel painted in the middle aisle. Top-face text reads upright
	-- from the part's +Z side, so the part is turned around to read from the street (-Z).
	local aislePanel = BuildUtil.Part(stripes, {
		Name = "AislePaint",
		Size = Vector3.new(44, 0.04, 9),
		CFrame = CFrame.new(firstX + rowLength / 2, PAINT_Y, midAisleZ) * CFrame.Angles(0, math.pi, 0),
		Color = team.Primary,
		Material = Enum.Material.SmoothPlastic,
		CanCollide = false,
		CastShadow = false,
	})
	sign(aislePanel, { Enum.NormalId.Top }, "FAN PARKING", team.Primary, team, { InsetX = 0.05, InsetY = 0.12, PixelsPerStud = 10 })
	-- one-way arrows: in along the outer aisles, out along the middle aisle toward the plaza
	local arrows = {
		{ LOT.MinX + 16, midAisleZ, 0 },
		{ lastX - 10, midAisleZ, 0 },
		{ lotX + 8, LOT.MaxZ - 8, math.pi },
		{ lotX + 14, busZ, math.pi },
	}
	for i, spec in ipairs(arrows) do
		paintedArrow(stripes, "Arrow" .. i, CFrame.new(spec[1], PAINT_Y, spec[2]) * CFrame.Angles(0, spec[3], 0), C.Line)
	end
	-- zebra crosswalk over the east aisle, at the walk to the plaza
	local crossX = (lastX + LOT.MaxX - curbW) / 2
	for i = 0, 4 do
		paint("Crosswalk", LOT.MaxX - curbW - lastX - 1, 1.2, crossX, exitMinZ + 1.2 + i * 2.4)
	end
	-- team bus bay (yellow box) with BUS ONLY painted in front of the bus
	local bayW = busBay.MaxX - busBay.MinX
	local bayD = busBay.MaxZ - busBay.MinZ
	local bayX = (busBay.MinX + busBay.MaxX) / 2
	for _, z in ipairs({ busBay.MinZ, busBay.MaxZ }) do
		paint("BusBayLine", bayW, 0.4, bayX, z, LINE_YELLOW)
	end
	for _, x in ipairs({ busBay.MinX, busBay.MaxX }) do
		paint("BusBayLine", 0.4, bayD, x, busZ, LINE_YELLOW)
	end
	local busText = BuildUtil.Part(stripes, {
		Name = "BusOnlyPaint",
		Size = Vector3.new(7, 0.04, 8.4),
		CFrame = CFrame.new(busBay.MaxX - 4.6, PAINT_Y, busZ) * CFrame.Angles(0, math.pi / 2, 0),
		Color = C.Asphalt,
		Material = Enum.Material.SmoothPlastic,
		CanCollide = false,
		CastShadow = false,
	})
	sign(busText, { Enum.NormalId.Top }, "BUS\nONLY", C.Asphalt, team, { TextColor3 = LINE_YELLOW, Wrap = true, PixelsPerStud = 10 })
	-- yellow paint on the curb ends either side of the car entrance
	for _, x in ipairs({ entryMinX - 1, entryMaxX + 1 }) do
		BuildUtil.Box(
			stripes,
			"CurbPaint",
			Vector3.new(2, 0.04, curbW),
			Vector3.new(x, curbH + 0.02, LOT.MinZ + curbW / 2),
			LINE_YELLOW,
			Enum.Material.SmoothPlastic,
			PAINT
		)
	end

	---------------------------------------------------------------- step 3: lamp posts
	BuildUtil.Stage(ctx, 3)
	local lamps = BuildUtil.Child(ctx, "Lamps")
	local lampXs = { islandX, firstX + rowLength / 2, lastX + 4 }
	for _, zc in ipairs(rowCenters) do
		for i, x in ipairs(lampXs) do
			local inIsland = x == islandX -- island lamps stand in the planted islands: no base, no banner
			-- (their poles stand on the island grass, whose top is curbH + 0.08; the others on the
			-- concrete base)
			local poleBottom = inIsland and (curbH + 0.08) or 1.6
			if not inIsland then
				BuildUtil.Cylinder(lamps, {
					Name = "LampBase",
					Position = Vector3.new(x, 0.8, zc),
					Height = 1.6,
					Diameter = 1.4,
					Color = C.Concrete,
					Material = Enum.Material.Concrete,
				})
			end
			BuildUtil.Cylinder(lamps, {
				Name = "LampPole",
				Position = Vector3.new(x, (poleBottom + 17.6) / 2, zc),
				Height = 17.6 - poleBottom,
				Diameter = 0.6,
				Color = DARK_METAL,
				Material = Enum.Material.Metal,
			})
			BuildUtil.Box(lamps, "LampHead", Vector3.new(1.2, 0.6, 5.6), Vector3.new(x, 17.9, zc), team.Primary, Enum.Material.Metal)
			local glow = BuildUtil.Box(
				lamps,
				"LampGlow",
				Vector3.new(0.9, 0.15, 5),
				Vector3.new(x, 17.525, zc),
				WARM_LIGHT,
				Enum.Material.Neon,
				NO_COLLIDE
			)
			BuildUtil.Light(glow, "SpotLight", {
				Name = "LotLight",
				Face = Enum.NormalId.Bottom,
				Range = 40,
				Angle = 110,
				Brightness = 1.5,
				Color = WARM_LIGHT,
			})
			-- team banner hanging off the pole, naming the row (LOT A = the street side, LOT B)
			if not inIsland then
				local bannerColor = (i % 2 == 1) and team.Primary or team.Secondary
				local banner = BuildUtil.Box(
					lamps,
					"LampBanner",
					Vector3.new(0.12, 3.2, 1.6),
					Vector3.new(x, 12, zc + 1.1),
					bannerColor,
					Enum.Material.Fabric,
					NO_COLLIDE
				)
				local lot = zc < lotZ and "LOT\nA" or "LOT\nB"
				sign(banner, { Enum.NormalId.Left, Enum.NormalId.Right }, lot, bannerColor, team, { Wrap = true, InsetX = 0.12 })
			end
		end
	end

	---------------------------------------------------------------- step 4: cars
	BuildUtil.Stage(ctx, 4)
	local cars = BuildUtil.Child(ctx, "Cars")
	-- { double row, stall, half (-1 = south, 1 = north), nose in?, kind, colour, cargo }
	local parked = {
		{ 1, 2, -1, true, "Sedan", CAR_COLORS.Red },
		{ 1, 5, -1, true, "SUV", team.Primary },
		{ 1, 9, -1, true, "Pickup", CAR_COLORS.White, team.Secondary },
		{ 1, 4, 1, true, "Sedan", CAR_COLORS.Silver },
		{ 2, 3, -1, true, "Pickup", CAR_COLORS.Blue },
		{ 2, 8, -1, false, "Sedan", CAR_COLORS.Yellow },
		{ 2, 6, 1, true, "SUV", CAR_COLORS.Green },
		{ 1, 11, 1, true, "Van", CAR_COLORS.Steel },
		{ 2, 10, 1, true, "Hatchback", CAR_COLORS.Teal },
	}
	-- "look" cards for a few of them: [index in `parked`] = { title, info, LookKey }
	local looks = {
		[2] = { "The Owner's Car", "Painted in the team colours, parked in the best spot, and always first in the lot.", "owner" },
		[3] = { "Tailgate Truck", "A cooler full of snacks in the back: these fans arrived four hours before kick-off!" },
		[6] = { "Super Fan's Car", "Backed in so the trunk faces the party. It has 27 team stickers on the bumper." },
	}
	for index, spec in ipairs(parked) do
		local row, stall, half, noseIn, kind = spec[1], spec[2], spec[3], spec[4], spec[5]
		local x = firstX + (stall - 0.5) * STALL_WIDTH
		local z = rowCenters[row] + half * STALL_DEPTH / 2
		-- a vehicle faces -Z at yaw 0; nose-in vehicles point at the centre line
		local facesPlusZ = (half == -1) == noseIn
		local frame = CFrame.new(x, LOT_TOP, z) * CFrame.Angles(0, facesPlusZ and math.pi or 0, 0)
		local body = VEHICLES[kind](cars, kind .. index, frame, spec[6], spec[7])
		local look = looks[index]
		if look then
			-- (no line of sight: the prompt sits in the body, under its own cab / bed / roof, and the
			-- cars stand in the open lot)
			BuildUtil.Look(body, look[1], look[2], { LookKey = look[3], LineOfSight = false })
		end
	end
	-- the tailgate truck's crew took the empty stall next to it: a kettle grill and two camp chairs
	-- facing it (in team colours)
	local tailX, tailZ = firstX + 9.5 * STALL_WIDTH, rowCenters[1] - STALL_DEPTH / 2
	BuildUtil.Cylinder(cars, {
		Name = "GrillStand",
		Position = Vector3.new(tailX, LOT_TOP + 0.95, tailZ + 2),
		Height = 1.9,
		Diameter = 0.3,
		Color = INK,
		Material = Enum.Material.Metal,
	})
	BuildUtil.Cylinder(cars, {
		Name = "GrillBowl",
		Position = Vector3.new(tailX, LOT_TOP + 2.35, tailZ + 2),
		Height = 0.9,
		Diameter = 2,
		Color = INK,
		Material = Enum.Material.Metal,
	})
	local grill = BuildUtil.Ball(cars, {
		Name = "GrillLid",
		Position = Vector3.new(tailX, LOT_TOP + 2.75, tailZ + 2),
		Diameter = 2,
		Color = DARK_METAL,
		Material = Enum.Material.Metal,
	})
	BuildUtil.Look(
		grill,
		"Tailgate Grill",
		"Burgers and brats sizzling hours before kickoff. The tailgate party is half the fun of game day!",
		{ Distance = 8 }
	)
	for index, dx in ipairs({ -1.8, 1.8 }) do
		local chair = CFrame.new(tailX + dx, LOT_TOP, tailZ - 1.8) * CFrame.Angles(0, math.pi, 0) -- (facing the grill)
		local color = index == 1 and team.Primary or team.Secondary
		BuildUtil.Seat(cars, {
			Name = "CampChair",
			Size = Vector3.new(1.5, 1, 1.4),
			CFrame = chair * CFrame.new(0, 0.5, 0),
			Color = color,
			Material = Enum.Material.Fabric,
			Object = "Camp Chair",
		})
		BuildUtil.Part(cars, {
			Name = "CampChairBack",
			Size = Vector3.new(1.5, 1.5, 0.15),
			CFrame = chair * CFrame.new(0, 1.65, 0.72) * CFrame.Angles(math.rad(12), 0, 0),
			Color = color,
			Material = Enum.Material.Fabric,
		})
	end
	bikeRack()

	-- the team bus waits in its bay, nose toward the exit (+X)
	local busFrame = CFrame.new(busBay.MinX + 15, LOT_TOP, busZ) * CFrame.Angles(0, -math.pi / 2, 0)
	local bus = VEHICLES.Bus(cars, "TeamBus", busFrame, team, teamText(ctx, " TEAM BUS", "TEAM BUS"))
	BuildUtil.Look(
		bus,
		"Team Bus",
		"Takes the players to every away game. Comfy seats, a snack fridge and the loudest horn in the league.",
		{ LookKey = "team", At = Vector3.new(0, -2, 0) }
	)
end

---------------------------------------------------------------------------------------------
-- Team store
---------------------------------------------------------------------------------------------

-- Shop mannequin on a round stand, facing -X. headwear: "helmet" | "cap". Returns the jersey.
local function mannequin(ctx, name, x, z, floorTop, team, jerseyColor, number, headwear)
	BuildUtil.Cylinder(ctx, {
		Name = name .. "Stand",
		Position = Vector3.new(x, floorTop + 0.1, z),
		Height = 0.2,
		Diameter = 2,
		Color = DARK_METAL,
		Material = Enum.Material.Metal,
	})
	local legBase = floorTop + 0.2
	for _, side in ipairs({ -1, 1 }) do
		BuildUtil.Block(
			ctx,
			name .. "Leg",
			Vector3.new(0.8, 2.6, 0.8),
			Vector3.new(x, 0, z + side * 0.45),
			team.Trim,
			Enum.Material.Fabric,
			nil,
			legBase
		)
	end
	local torsoBase = legBase + 2.6
	local torso = BuildUtil.Block(
		ctx,
		name .. "Jersey",
		Vector3.new(1.1, 2.4, 2.2),
		Vector3.new(x, 0, z),
		jerseyColor,
		Enum.Material.Fabric,
		nil,
		torsoBase
	)
	sign(torso, { Enum.NormalId.Left }, number, jerseyColor, team, { InsetX = 0.22, InsetY = 0.18 })
	for _, side in ipairs({ -1, 1 }) do
		BuildUtil.Part(ctx, {
			Name = name .. "Arm",
			Size = Vector3.new(0.7, 2.3, 0.6),
			CFrame = CFrame.new(x, torsoBase + 1.2, z + side * 1.45) * CFrame.Angles(side * math.rad(8), 0, 0),
			Color = jerseyColor,
			Material = Enum.Material.Fabric,
		})
	end
	local headY = torsoBase + 2.4 + 0.75
	if headwear == "helmet" then
		BuildUtil.Ball(
			ctx,
			{ Name = name .. "Helmet", Position = Vector3.new(x, headY, z), Diameter = 1.7, Color = team.Primary, Reflectance = 0.1 }
		)
		BuildUtil.Box(
			ctx,
			name .. "Facemask",
			Vector3.new(0.25, 0.8, 1.2),
			Vector3.new(x - 0.8, headY - 0.25, z),
			team.Trim,
			Enum.Material.Metal
		)
	else
		BuildUtil.Ball(ctx, { Name = name .. "Head", Position = Vector3.new(x, headY, z), Diameter = 1.3, Color = MANNEQUIN })
		BuildUtil.Cylinder(ctx, {
			Name = name .. "Cap",
			Position = Vector3.new(x, headY + 0.45, z),
			Height = 0.45,
			Diameter = 1.4,
			Color = team.Secondary,
		})
		BuildUtil.Box(
			ctx,
			name .. "CapBrim",
			Vector3.new(0.9, 0.1, 1.1),
			Vector3.new(x - 0.9, headY + 0.27, z),
			team.Secondary,
			Enum.Material.SmoothPlastic
		)
	end
	return torso
end

-- Rolling clothes rack along X with jerseys hanging off the rail. Returns the rail.
local function jerseyRack(ctx, name, x, z, floorTop, colors)
	local length = 5
	BuildUtil.Block(
		ctx,
		name .. "Base",
		Vector3.new(length, 0.25, 1.4),
		Vector3.new(x, 0, z),
		DARK_METAL,
		Enum.Material.Metal,
		nil,
		floorTop
	)
	for _, side in ipairs({ -1, 1 }) do
		BuildUtil.Block(
			ctx,
			name .. "Upright",
			Vector3.new(0.25, 4.9, 0.25),
			Vector3.new(x + side * (length / 2 - 0.15), 0, z),
			CHROME,
			Enum.Material.Metal,
			nil,
			floorTop + 0.25
		)
	end
	local railY = floorTop + 5
	local rail = BuildUtil.Cylinder(ctx, {
		Name = name .. "Rail",
		Position = Vector3.new(x, railY, z),
		Axis = "X",
		Height = length,
		Diameter = 0.2,
		Color = CHROME,
		Material = Enum.Material.Metal,
	})
	for i, color in ipairs(colors) do
		local offset = (i - (#colors + 1) / 2) * 1.05
		BuildUtil.Box(
			ctx,
			name .. "Jersey",
			Vector3.new(0.25, 2.6, 2),
			Vector3.new(x + offset, railY - 1.45, z),
			color,
			Enum.Material.Fabric,
			NO_COLLIDE
		)
	end
	return rail
end

-- Giant foam "#1" finger on a round plinth, facing -X. Returns the hand.
local function foamFinger(ctx, name, x, z, floorTop, team)
	BuildUtil.Cylinder(ctx, {
		Name = name .. "Plinth",
		Position = Vector3.new(x, floorTop + 0.5, z),
		Height = 1,
		Diameter = 3,
		Color = team.Primary,
		Material = Enum.Material.SmoothPlastic,
	})
	local foam = team.Secondary
	if contrastRatio(foam, STORE_WALL) < 1.5 then
		foam = team.Primary -- a pale foam finger would vanish against the store walls
	end
	local cuffBase = floorTop + 1
	BuildUtil.Block(ctx, name .. "Cuff", Vector3.new(1.5, 1.2, 2.6), Vector3.new(x, 0, z), team.Trim, Enum.Material.Fabric, nil, cuffBase)
	local palmBase = cuffBase + 1.2
	local palm =
		BuildUtil.Block(ctx, name .. "Hand", Vector3.new(1.8, 2.8, 3.6), Vector3.new(x, 0, z), foam, Enum.Material.Foil, nil, palmBase)
	sign(palm, { Enum.NormalId.Left }, "#1", foam, team, { InsetX = 0.1, InsetY = 0.1 })
	local fingerBase = palmBase + 2.8
	BuildUtil.Block(
		ctx,
		name .. "Finger",
		Vector3.new(1.4, 2.8, 1.3),
		Vector3.new(x, 0, z - 0.9),
		foam,
		Enum.Material.Foil,
		nil,
		fingerBase
	)
	BuildUtil.Ball(ctx, {
		Name = name .. "FingerTip",
		Position = Vector3.new(x, fingerBase + 2.8, z - 0.9),
		Diameter = 1.4,
		Color = foam,
		Material = Enum.Material.Foil,
	})
	BuildUtil.Part(ctx, {
		Name = name .. "Thumb",
		Size = Vector3.new(1.2, 1.6, 0.9),
		CFrame = CFrame.new(x, palmBase + 2, z + 2.1) * CFrame.Angles(math.rad(-25), 0, 0),
		Color = foam,
		Material = Enum.Material.Foil,
	})
	return palm
end

function Plaza.teamstore(ctx)
	local C = ctx.config.Colors
	local team = ctx.colors

	local cz = (STORE.MinZ + STORE.MaxZ) / 2
	local frontX = STORE.MinX + 4 -- storefront plane, facing -X (the walkway)
	local backX = STORE.MaxX - 0.5
	local southZ, northZ = STORE.MinZ + 0.5, STORE.MaxZ - 0.5
	local length = backX - frontX
	local depth = northZ - southZ
	local midX = (frontX + backX) / 2
	local wallH = 12
	local floorTop = 0.25
	local glassTop = 9
	local doorTop = 8.4 -- the doorway is 8.15 tall and 7 wide
	local openMinZ, openMaxZ = southZ + 4, northZ - 4 -- storefront opening between the corner piers
	local openWidth = openMaxZ - openMinZ
	local glassX = frontX + 0.5
	local pierBackX = glassX + 0.6
	local roofTop = wallH + 0.8

	---------------------------------------------------------------- step 1: the building
	BuildUtil.Stage(ctx, 1)
	-- The floor stops just inside the walls and the piers stand 0.1 proud of the walls, so no
	-- two differently coloured faces share a plane (that z-fought along the storefront corners).
	BuildUtil.Box(
		ctx,
		"Floor",
		Vector3.new(length - 0.05, floorTop, depth - 0.1),
		Vector3.new(midX - 0.025, floorTop / 2, cz),
		STORE_FLOOR,
		Enum.Material.Marble
	)
	BuildUtil.Block(ctx, "BackWall", Vector3.new(1, wallH, depth), Vector3.new(backX - 0.5, 0, cz), STORE_WALL, Enum.Material.Plaster)
	BuildUtil.Block(ctx, "SouthWall", Vector3.new(length, wallH, 1), Vector3.new(midX, 0, southZ + 0.5), STORE_WALL, Enum.Material.Plaster)
	BuildUtil.Block(ctx, "NorthWall", Vector3.new(length, wallH, 1), Vector3.new(midX, 0, northZ - 0.5), STORE_WALL, Enum.Material.Plaster)
	for _, z in ipairs({ southZ + 1.95, northZ - 1.95 }) do
		BuildUtil.Block(ctx, "Pier", Vector3.new(1.2, wallH, 4.1), Vector3.new(glassX, 0, z), team.Primary, Enum.Material.SmoothPlastic)
	end
	-- team-coloured band along the top of the side and back walls (stands 0.15 proud of them)
	local bandH = 1
	local bandLength = backX + 0.15 - pierBackX
	for _, z in ipairs({ southZ - 0.05, northZ + 0.05 }) do
		BuildUtil.Block(
			ctx,
			"WallBand",
			Vector3.new(bandLength, bandH, 0.2),
			Vector3.new(pierBackX + bandLength / 2, 0, z),
			team.Primary,
			Enum.Material.SmoothPlastic,
			nil,
			wallH - bandH
		)
	end
	BuildUtil.Block(
		ctx,
		"WallBand",
		Vector3.new(0.2, bandH, depth + 0.3),
		Vector3.new(backX + 0.05, 0, cz),
		team.Primary,
		Enum.Material.SmoothPlastic,
		nil,
		wallH - bandH
	)
	BuildUtil.Box(
		ctx,
		"Header",
		Vector3.new(1, wallH - glassTop, openWidth),
		Vector3.new(glassX, (glassTop + wallH) / 2, cz),
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	-- (no overhang at the front, so the TEAM STORE sign can rise above the roof line)
	BuildUtil.Block(
		ctx,
		"Roof",
		Vector3.new(length + 0.5, 0.8, depth + 1),
		Vector3.new(midX + 0.25, 0, cz),
		C.ConcreteDark,
		Enum.Material.Concrete,
		nil,
		wallH
	)
	-- two rooftop AC units behind the sign
	for _, z in ipairs({ cz - 6, cz + 6 }) do
		BuildUtil.Block(
			ctx,
			"RoofACUnit",
			Vector3.new(3, 1.6, 2.6),
			Vector3.new(backX - 4, 0, z),
			C.Metal,
			Enum.Material.DiamondPlate,
			nil,
			roofTop
		)
		BuildUtil.Cylinder(ctx, {
			Name = "RoofACFan",
			Position = Vector3.new(backX - 4, roofTop + 1.65, z),
			Height = 0.1,
			Diameter = 2,
			Color = DARK_METAL,
			Material = Enum.Material.Metal,
		})
	end
	-- two light panels in the ceiling: the sales floor by the doors and the racks at the back
	for i, x in ipairs({ midX - 6, midX + 8 }) do
		local ceiling = BuildUtil.Box(
			ctx,
			"CeilingLight",
			Vector3.new(10, 0.15, 3),
			Vector3.new(x, wallH - 0.1, cz),
			WARM_LIGHT,
			Enum.Material.Neon,
			NO_COLLIDE
		)
		BuildUtil.Light(ceiling, "PointLight", { Name = "StoreLight" .. i, Range = 22, Brightness = 1.2, Color = WARM_LIGHT })
	end

	---------------------------------------------------------------- step 2: glass front and doors
	BuildUtil.Stage(ctx, 2)
	local storefront = BuildUtil.Child(ctx, "Storefront")
	local doorMinZ, doorMaxZ = cz - 3.5, cz + 3.5
	local paneHeight = glassTop - floorTop
	local glassProps = { Transparency = 0.45 }
	for index, range in ipairs({ { openMinZ, doorMinZ }, { doorMaxZ, openMaxZ } }) do
		local pane = BuildUtil.Box(
			storefront,
			"Window",
			Vector3.new(0.3, paneHeight, range[2] - range[1]),
			Vector3.new(glassX, floorTop + paneHeight / 2, (range[1] + range[2]) / 2),
			C.Glass,
			Enum.Material.Glass,
			glassProps
		)
		-- shop-window lettering along the bottom of the pane (under the displays)
		local _, lettering = BuildUtil.SurfaceText(pane, Enum.NormalId.Left, index == 1 and "JERSEYS - CAPS" or "FOAM FINGERS", {
			LabelName = "WindowLettering",
			TextColor3 = WHITE,
			Font = Enum.Font.GothamBold,
			PixelsPerStud = 30,
			TextStrokeTransparency = 0.5,
		})
		lettering.Position = UDim2.new(0.08, 0, 0.86, 0)
		lettering.Size = UDim2.new(0.84, 0, 0.08, 0)
	end
	-- sliding glass doors (press E; they close again by themselves): they slide open behind the
	-- window panes, just inside the glass line
	BuildUtil.Door(storefront, {
		Name = "StoreDoors",
		Size = Vector3.new(doorMaxZ - doorMinZ, doorTop - floorTop, 0.2),
		CFrame = CFrame.new(glassX + 0.4, (floorTop + doorTop) / 2, cz) * CFrame.Angles(0, math.pi / 2, 0),
		Double = true,
		Slide = true,
		Color = C.Glass,
		Material = Enum.Material.Glass,
		Transparency = 0.5,
		Object = "Team Store",
		Title = "Team Store",
		Info = "Jerseys, caps, helmets and giant foam fingers. Come in and gear up for game day!",
		Distance = 8,
	})
	for _, z in ipairs({ doorMinZ, doorMaxZ }) do
		BuildUtil.Box(
			storefront,
			"Mullion",
			Vector3.new(0.4, paneHeight, 0.35),
			Vector3.new(glassX, floorTop + paneHeight / 2, z),
			DARK_METAL,
			Enum.Material.Metal
		)
	end
	BuildUtil.Box(
		storefront,
		"TransomBar",
		Vector3.new(0.4, glassTop - doorTop, openWidth),
		Vector3.new(glassX, (doorTop + glassTop) / 2, cz),
		DARK_METAL,
		Enum.Material.Metal
	)

	-- Entrance canopy, welcome mat, planters and the side display window
	BuildUtil.Box(
		ctx,
		"Canopy",
		Vector3.new(3.2, 0.4, 7.5),
		Vector3.new(frontX - 1.6, 9.1, cz),
		team.Secondary,
		Enum.Material.SmoothPlastic
	)
	BuildUtil.Box(
		ctx,
		"WelcomeMat",
		Vector3.new(2.6, 0.05, 6.6),
		Vector3.new(frontX - 1.4, 0.025, cz),
		team.Primary,
		Enum.Material.Fabric,
		PAINT
	)
	for _, z in ipairs({ southZ + 1.5, northZ - 1.5 }) do
		BuildUtil.Block(ctx, "Planter", Vector3.new(2, 1.6, 2), Vector3.new(frontX - 1.6, 0, z), C.ConcreteDark, Enum.Material.Concrete)
		BuildUtil.Ball(
			ctx,
			{ Name = "Shrub", Position = Vector3.new(frontX - 1.6, 2.6, z), Diameter = 2.4, Color = BUSH, Material = Enum.Material.Grass }
		)
	end
	local sideMidX = (pierBackX + backX) / 2 -- middle of the plaster part of the south wall
	-- the side window is a shallow display case on the south wall (the merch goes in with step 3):
	-- a dark frame round a glass front 1.4 out from the wall
	local caseOut = southZ - 1.6
	BuildUtil.Box(
		ctx,
		"SideWindow",
		Vector3.new(20, 4, 0.15),
		Vector3.new(sideMidX, 5, caseOut + 0.15),
		C.Glass,
		Enum.Material.Glass,
		{ Transparency = 0.45 }
	)
	for _, y in ipairs({ 2.8, 7.2 }) do
		BuildUtil.Box(
			ctx,
			"DisplayCaseFrame",
			Vector3.new(20.8, 0.4, southZ - caseOut),
			Vector3.new(sideMidX, y, (southZ + caseOut) / 2),
			DARK_METAL,
			Enum.Material.Metal
		)
	end
	for _, side in ipairs({ -1, 1 }) do
		BuildUtil.Box(
			ctx,
			"DisplayCaseFrame",
			Vector3.new(0.4, 4, southZ - caseOut),
			Vector3.new(sideMidX + side * 10.2, 5, (southZ + caseOut) / 2),
			DARK_METAL,
			Enum.Material.Metal
		)
	end
	-- a red OPEN sign high in the north pane and the opening hours on the south pier
	local openSign = BuildUtil.Box(
		storefront,
		"OpenSign",
		Vector3.new(0.08, 0.8, 2.2),
		Vector3.new(glassX + 0.25, 7.9, (doorMaxZ + openMaxZ) / 2),
		OPEN_RED,
		Enum.Material.Neon,
		NO_COLLIDE
	)
	sign(openSign, { Enum.NormalId.Left }, "OPEN", OPEN_RED, team, { TextColor3 = WHITE, Glow = true, InsetY = 0.1 })
	local hours = BuildUtil.Box(
		storefront,
		"HoursPlaque",
		Vector3.new(0.1, 1.6, 1.4),
		Vector3.new(glassX - 0.65, 4.8, southZ + 2),
		WHITE,
		Enum.Material.SmoothPlastic,
		NO_COLLIDE
	)
	sign(hours, { Enum.NormalId.Left }, "OPEN 9 - 9\nGAME DAYS\nTILL LATE", WHITE, team, {
		TextColor3 = INK,
		Font = Enum.Font.GothamBold,
		Wrap = true,
		InsetX = 0.1,
		InsetY = 0.1,
	})

	---------------------------------------------------------------- step 3: merch and signs
	BuildUtil.Stage(ctx, 3)
	-- TEAM STORE sign over the entrance (sticks up above the roof line), team name on the plaza side
	BuildUtil.Box(ctx, "SignFrame", Vector3.new(0.2, 4, 17.6), Vector3.new(frontX - 0.1, 11.5, cz), team.Trim, Enum.Material.SmoothPlastic)
	local storeSign = BuildUtil.Box(
		ctx,
		"StoreSign",
		Vector3.new(0.2, 3.4, 17),
		Vector3.new(frontX - 0.3, 11.5, cz),
		team.Secondary,
		Enum.Material.SmoothPlastic
	)
	sign(storeSign, { Enum.NormalId.Left }, "TEAM STORE", team.Secondary, team, { InsetY = 0.1 })
	local nameSign = BuildUtil.Box(
		ctx,
		"NameSign",
		Vector3.new(16, 2.8, 0.2),
		Vector3.new(sideMidX, 9.4, southZ - 0.1),
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	-- wraps onto two lines when the owner's name is long
	sign(
		nameSign,
		{ Enum.NormalId.Front },
		teamText(ctx, " FAN SHOP", "OFFICIAL FAN SHOP"),
		team.Primary,
		team,
		{ InsetY = 0.1, Wrap = true }
	)

	local interior = BuildUtil.Child(ctx, "Interior")
	-- jersey wall at the back with an OFFICIAL GEAR banner above it
	local jerseyX = backX - 1 - 0.15
	-- the third jersey colour: the secondary, unless it is almost white (then the trim colour)
	local altJersey = contrastRatio(team.Secondary, WHITE) < 1.3 and team.Trim or team.Secondary
	for _, jersey in ipairs({ { cz - 6, team.Primary, "1" }, { cz, WHITE, "12" }, { cz + 6, altJersey, "99" } }) do
		local z, color, number = jersey[1], jersey[2], jersey[3]
		local torso =
			BuildUtil.Box(interior, "Jersey", Vector3.new(0.3, 4.2, 3.4), Vector3.new(jerseyX, 6.2, z), color, Enum.Material.Fabric)
		sign(torso, { Enum.NormalId.Left }, number, color, team, { InsetX = 0.2, InsetY = 0.22 })
		if z == cz then
			BuildUtil.Look(
				torso,
				"Best-Selling Jersey",
				"Everybody wants the starting quarterback's number. This wall gets restocked twice a day!",
				{ LookKey = "roster:QB", At = Vector3.new(-0.8, -1.5, 0), Distance = 8 }
			)
		end
		for _, side in ipairs({ -1, 1 }) do
			BuildUtil.Part(interior, {
				Name = "JerseySleeve",
				Size = Vector3.new(0.3, 1.4, 1.6),
				CFrame = CFrame.new(jerseyX, 7.55, z + side * 2.2) * CFrame.Angles(side * math.rad(30), 0, 0),
				Color = color,
				Material = Enum.Material.Fabric,
			})
		end
	end
	-- LED sign over the jersey wall: the server keeps the owner's team name on it
	local teamBoard =
		BuildUtil.Box(interior, "TeamBoard", Vector3.new(0.2, 1.8, 15), Vector3.new(jerseyX, 9.7, cz), SCREEN, Enum.Material.SmoothPlastic)
	liveScreen(
		teamBoard,
		Enum.NormalId.Left,
		"team",
		teamText(ctx, "", "TEAM STORE"),
		textColorOn(SCREEN, { team.Secondary, team.Trim, C.Gold })
	)

	-- window displays: a giant foam finger in the south pane, a mannequin in the north pane
	local hand = foamFinger(interior, "FoamFinger", glassX + 3.6, (openMinZ + doorMinZ) / 2, floorTop, team)
	BuildUtil.Use(interior, hand, "foamfinger", {
		Object = "Foam Finger Stand",
		Title = "Giant Foam Finger",
		Info = "The number one souvenir in the store. Wave it in the stands and the TV cameras will find you!",
		At = Vector3.new(1.2, 0, 0),
		Distance = 8,
	})
	local windowTorso =
		mannequin(interior, "WindowMannequin", glassX + 2.6, (doorMaxZ + openMaxZ) / 2, floorTop, team, team.Primary, "12", "helmet")
	BuildUtil.Look(
		windowTorso,
		"Window Display",
		"This season's home kit: helmet, shoulder pads and the #12 jersey. Players get theirs for free, fans buy them here!",
		{ At = Vector3.new(1, 0, 0), Distance = 8 }
	)
	mannequin(interior, "ShopMannequin", frontX + 11, southZ + 2.9, floorTop, team, WHITE, "7", "cap")

	-- display table straight ahead of the doors: folded shirts and two helmets
	local tableX = frontX + 13
	BuildUtil.Block(
		interior,
		"DisplayTable",
		Vector3.new(5, 2.6, 3.2),
		Vector3.new(tableX, 0, cz),
		C.Wood,
		Enum.Material.WoodPlanks,
		nil,
		floorTop
	)
	local shirtTop = floorTop + 2.6
	for i, color in ipairs({ team.Primary, team.Secondary }) do
		BuildUtil.Block(
			interior,
			"FoldedShirts",
			Vector3.new(1.6, 0.6, 1.2),
			Vector3.new(tableX - 1.2, 0, cz + (i - 1.5) * 1.4),
			color,
			Enum.Material.Fabric,
			nil,
			shirtTop
		)
	end
	local helmetPos = Vector3.new(tableX + 1.3, shirtTop + 0.9, cz)
	local helmet =
		BuildUtil.Ball(interior, { Name = "Helmet", Position = helmetPos, Diameter = 1.8, Color = team.Primary, Reflectance = 0.1 })
	BuildUtil.Look(
		helmet,
		"Replica Helmet",
		"A full-size copy of the team helmet, signed by the whole roster. Folded fan shirts are on the table next to it.",
		{ Distance = 8 }
	)
	BuildUtil.Box(
		interior,
		"Facemask",
		Vector3.new(0.25, 0.8, 1.3),
		helmetPos + Vector3.new(-0.85, -0.25, 0),
		team.Trim,
		Enum.Material.Metal
	)

	-- two jersey racks toward the back
	local rackX = backX - 9.5
	-- (their prompts hang just in front of the jerseys, on the side of the aisle between the racks)
	local southRack = jerseyRack(interior, "RackSouth", rackX, southZ + 4.5, floorTop, { team.Primary, WHITE, team.Primary, altJersey })
	BuildUtil.Look(southRack, "Jersey Rack", "Home and away jerseys in every size, from tiny tots to offensive linemen.", {
		At = Vector3.new(0, -1.5, 1.35),
		Distance = 8,
	})
	local northRack = jerseyRack(interior, "RackNorth", rackX, northZ - 4.5, floorTop, { altJersey, team.Primary, WHITE, altJersey })
	BuildUtil.Look(northRack, "Throwback Rack", "Retro jerseys from the team's early years. The old colours are back in style!", {
		At = Vector3.new(0, -1.5, -1.35),
		Distance = 8,
	})
	-- a bench to try on new sneakers, between the south rack and the back wall (facing the room)
	BuildUtil.Seat(interior, {
		Name = "FittingBench",
		Size = Vector3.new(4, 1.6, 1.4),
		CFrame = CFrame.new(backX - 4.5, floorTop + 0.8, southZ + 1.9) * CFrame.Angles(0, math.pi, 0),
		Color = team.Primary,
		Material = Enum.Material.Fabric,
		Object = "Fitting Bench",
	})

	-- checkout counter along the north wall with the till (register, screen, card reader)
	local checkoutX = frontX + 11.5
	local checkoutZ = northZ - 3.6
	local counterTop = floorTop + 3.4
	BuildUtil.Block(
		interior,
		"Checkout",
		Vector3.new(6, 3.4, 2),
		Vector3.new(checkoutX, 0, checkoutZ),
		C.Wood,
		Enum.Material.WoodPlanks,
		nil,
		floorTop
	)
	BuildUtil.Block(
		interior,
		"CheckoutTop",
		Vector3.new(6.3, 0.2, 2.3),
		Vector3.new(checkoutX, 0, checkoutZ),
		team.Primary,
		Enum.Material.SmoothPlastic,
		nil,
		counterTop
	)
	local till = BuildUtil.Block(
		interior,
		"Till",
		Vector3.new(1.4, 0.8, 1.2),
		Vector3.new(checkoutX + 1, 0, checkoutZ),
		DARK_METAL,
		Enum.Material.Metal,
		nil,
		counterTop + 0.2
	)
	BuildUtil.Look(
		till,
		"Till",
		"Every jersey, cap and foam finger sold here helps pay for your next upgrade. Ka-ching!",
		{ At = Vector3.new(0, 0, -1.4), Distance = 8 }
	)
	BuildUtil.Part(interior, {
		Name = "TillScreen",
		Size = Vector3.new(1.2, 0.9, 0.12),
		CFrame = CFrame.new(checkoutX + 1, counterTop + 1.5, checkoutZ + 0.2) * CFrame.Angles(math.rad(-15), 0, 0),
		Color = Color3.fromRGB(70, 150, 230),
		Material = Enum.Material.Neon,
	})
	BuildUtil.Block(
		interior,
		"CardReader",
		Vector3.new(0.5, 0.3, 0.7),
		Vector3.new(checkoutX - 1, 0, checkoutZ - 0.4),
		INK,
		Enum.Material.SmoothPlastic,
		nil,
		counterTop + 0.2
	)
	local checkoutSign = BuildUtil.Box(
		interior,
		"CheckoutSign",
		Vector3.new(4.4, 1.2, 0.15),
		Vector3.new(checkoutX, wallH - 0.6, checkoutZ),
		team.Secondary,
		Enum.Material.SmoothPlastic,
		NO_COLLIDE
	)
	sign(checkoutSign, { Enum.NormalId.Front }, "CHECKOUT", team.Secondary, team, { InsetY = 0.12 })

	-- a shelf of mini helmets on the north wall, between the checkout and the throwback rack
	BuildUtil.Box(
		interior,
		"HelmetShelf",
		Vector3.new(4.8, 0.25, 0.9),
		Vector3.new(75.25, 6.6, northZ - 1.45),
		C.Wood,
		Enum.Material.WoodPlanks
	)
	for i = 1, 4 do
		BuildUtil.Ball(interior, {
			Name = "MiniHelmet",
			Position = Vector3.new(73.5 + (i - 1) * 1.17, 7.15, northZ - 1.45),
			Diameter = 0.85,
			Color = (i % 2 == 1) and team.Primary or altJersey,
			Reflectance = 0.1,
		})
	end
	-- a barrel of souvenir footballs by the display table
	local barrelX, barrelZ = tableX - 4.5, cz - 4.4
	BuildUtil.Cylinder(interior, {
		Name = "FootballBarrel",
		Position = Vector3.new(barrelX, floorTop + 1.1, barrelZ),
		Height = 2.2,
		Diameter = 2,
		Color = C.Wood,
		Material = Enum.Material.WoodPlanks,
	})
	local pile = BuildUtil.Ball(interior, {
		Name = "BarrelFootballs",
		Position = Vector3.new(barrelX, floorTop + 2.2, barrelZ),
		Diameter = 1.9,
		Color = LEATHER,
		Material = Enum.Material.Leather,
	})
	BuildUtil.Look(
		pile,
		"Souvenir Footballs",
		"Mini footballs with the team colours on them - perfect for practising your spiral out in the plaza!",
		{ At = Vector3.new(0, 1.2, 0), Distance = 8 }
	)
	-- a full-length mirror on the back wall beside the fitting bench
	BuildUtil.Box(
		interior,
		"Mirror",
		Vector3.new(0.12, 5, 2.2),
		Vector3.new(backX - 1.06, floorTop + 3.7, southZ + 2.2),
		Color3.fromRGB(196, 214, 226),
		Enum.Material.Glass,
		{ Reflectance = 0.3 }
	)
	-- the jersey printing station in the back corner: a counter with a heat press, lid open
	local press = BuildUtil.Block(
		interior,
		"PrintCounter",
		Vector3.new(3.2, 3, 1.8),
		Vector3.new(backX - 3.9, 0, northZ - 1.9),
		C.Wood,
		Enum.Material.WoodPlanks,
		nil,
		floorTop
	)
	BuildUtil.Block(
		interior,
		"HeatPress",
		Vector3.new(1.6, 0.5, 1.2),
		Vector3.new(backX - 3.9, 0, northZ - 2),
		DARK_METAL,
		Enum.Material.Metal,
		nil,
		floorTop + 3
	)
	BuildUtil.Part(interior, {
		Name = "HeatPressLid",
		Size = Vector3.new(1.6, 0.25, 1.2),
		CFrame = CFrame.new(backX - 3.9, floorTop + 4.05, northZ - 1.55) * CFrame.Angles(math.rad(50), 0, 0),
		Color = CHROME,
		Material = Enum.Material.Metal,
	})
	BuildUtil.Look(
		press,
		"Jersey Printing",
		"Pick a name and a number and the heat press prints them on your jersey in a minute. The most popular name?",
		{ LookKey = "owner", At = Vector3.new(0, 0.4, -1.3), Distance = 8 }
	)

	-- NEW SEASON GEAR hangs over the display table, facing the doors
	local hanging = BuildUtil.Box(
		interior,
		"NewSeasonBanner",
		Vector3.new(0.12, 1.4, 7),
		Vector3.new(tableX, 10.3, cz),
		team.Secondary,
		Enum.Material.Fabric,
		NO_COLLIDE
	)
	sign(hanging, { Enum.NormalId.Left }, "NEW SEASON GEAR", team.Secondary, team, { InsetY = 0.14 })
	-- (on two thin wires from the ceiling, clear of the light panel)
	for _, dz in ipairs({ -3.1, 3.1 }) do
		BuildUtil.Box(
			interior,
			"BannerWire",
			Vector3.new(0.06, wallH - 11, 0.06),
			Vector3.new(tableX, (11 + wallH) / 2, cz + dz),
			DARK_METAL,
			Enum.Material.Metal,
			NO_COLLIDE
		)
	end

	-- the side display case (built with the glass front): two jerseys, a helmet and a football
	-- round a GAME-WORN GEAR card
	local caseZ = southZ - 0.7 -- (the glass front's inner face is at southZ - 1.375)
	local card = BuildUtil.Box(
		ctx,
		"CaseCard",
		Vector3.new(3.4, 0.9, 0.05),
		Vector3.new(sideMidX, 6.35, southZ - 0.045),
		WHITE,
		Enum.Material.SmoothPlastic,
		NO_COLLIDE
	)
	sign(card, { Enum.NormalId.Front }, "GAME-WORN GEAR", WHITE, team, { TextColor3 = INK, InsetX = 0.08, InsetY = 0.16 })
	for index, spec in ipairs({ { -6, team.Primary, "12" }, { 6, altJersey, "88" } }) do
		local shirt = BuildUtil.Box(
			ctx,
			"CaseJersey",
			Vector3.new(1.9, 2.4, 0.15),
			Vector3.new(sideMidX + spec[1], 5, southZ - 0.3 - index * 0.05),
			spec[2],
			Enum.Material.Fabric
		)
		sign(shirt, { Enum.NormalId.Front }, spec[3], spec[2], team, { InsetX = 0.2, InsetY = 0.2 })
	end
	BuildUtil.Ball(ctx, {
		Name = "CaseHelmet",
		Position = Vector3.new(sideMidX - 1.2, 3.6, caseZ),
		Diameter = 1.2,
		Color = team.Primary,
		Reflectance = 0.1,
	})
	-- (turned a little, clear of both the wall and the glass)
	cylinderAt(
		ctx,
		"CaseFootball",
		CFrame.new(sideMidX + 1.6, 3.38, caseZ) * CFrame.Angles(0, math.rad(15), 0),
		1.3,
		0.75,
		LEATHER,
		Enum.Material.Leather
	)

	-- Giant football resting on a cradle on the roof, laces tipped toward the walkway
	local ballX = frontX + 10
	local scale = 0.9 -- 9.9 long; with the cradle the top stays under 20 studs
	local cradleHeight = 0.6
	for _, side in ipairs({ -1, 1 }) do
		BuildUtil.Block(
			ctx,
			"FootballCradle",
			Vector3.new(2.4, cradleHeight, 1.6),
			Vector3.new(ballX, 0, cz + side * 2.4),
			team.Secondary,
			Enum.Material.SmoothPlastic,
			nil,
			roofTop
		)
	end
	-- the ball is 2.68 thick (radius) above each cradle; it sinks 0.15 into them
	local ballY = roofTop + cradleHeight + 2.53
	local ballCFrame = CFrame.new(ballX, ballY, cz) * CFrame.Angles(0, math.rad(90), 0) * CFrame.Angles(math.rad(-30), 0, 0)
	football(
		BuildUtil.Child(ctx, "RoofFootball"),
		"Football",
		ballCFrame,
		scale,
		{ Body = LEATHER, Stripe = WHITE, Lace = WHITE },
		{ Material = Enum.Material.Leather }
	)
end

---------------------------------------------------------------------------------------------
-- Championship trophy
---------------------------------------------------------------------------------------------

-- Confetti frozen mid-burst above each cannon, in the barrel's frame:
-- { along the barrel, spread 1, spread 2, size X, size Z, tilt in degrees }
local CONFETTI = {
	{ 3.8, 0.6, -0.8, 1, 0.6, 25 },
	{ 4.4, -0.9, 0.7, 0.9, 0.6, -40 },
	{ 5.2, 1.2, 1.1, 1, 0.6, 60 },
	{ 5.8, -0.5, -1.5, 0.8, 0.8, -15 },
	{ 6.6, 0.3, 1.8, 0.9, 0.6, 75 },
	{ 7.2, -1.4, 0.2, 1, 0.6, -65 },
	{ 6.4, 1.7, -0.4, 0.2, 2.6, 35 },
	{ 5.0, -1.8, -0.6, 0.2, 2.4, -55 },
}

function Plaza.trophy(ctx)
	local C = ctx.config.Colors
	local team = ctx.colors
	local cx, cz = MONUMENT.CenterX, MONUMENT.CenterZ
	local center = Vector3.new(cx, 0, cz)
	local gold = { Reflectance = 0.2 }
	local goldPart = { Color = C.Gold, Material = Enum.Material.Metal, Reflectance = 0.2 }
	local pedestalTop = 13
	local half = 4.5
	local base = pedestalTop + 0.6

	---------------------------------------------------------------- step 1: plinth
	BuildUtil.Stage(ctx, 1)
	-- Stepped stone plinth (the middle step in the team colour)
	local tiers = {
		{ MONUMENT.HalfSize * 2 - 2, STONE_DARK, Enum.Material.Granite },
		{ 22, team.Primary, Enum.Material.Slate },
		{ 16, STONE_DARK, Enum.Material.Granite },
	}
	local y = 0
	for i, tier in ipairs(tiers) do
		BuildUtil.Block(ctx, "Step" .. i, Vector3.new(tier[1], 1.2, tier[1]), center, tier[2], tier[3], nil, y)
		y += 1.2
	end
	local stepsTop = y
	BuildUtil.Block(ctx, "Pedestal", Vector3.new(half * 2, pedestalTop - y, half * 2), center, STONE_LIGHT, Enum.Material.Marble, nil, y)
	BuildUtil.Block(ctx, "PedestalCap", Vector3.new(9.8, 0.6, 9.8), center, C.Gold, Enum.Material.Metal, gold, pedestalTop)
	-- a stone viewing bench on the front edge of the bottom step (street side), far enough from
	-- the middle step that a sitter's legs stay clear of it: a TV camera seat on the trophy
	BuildUtil.Seat(ctx, {
		Name = "ViewingBench",
		Size = Vector3.new(8, 1.4, 1.8),
		CFrame = CFrame.new(cx, 1.2 + 0.7, cz - 13) * CFrame.Angles(0, math.pi, 0),
		Color = STONE_LIGHT,
		Material = Enum.Material.Marble,
		Object = "Viewing Bench",
		Camera = { From = Vector3.new(cx - 16, 9, cz - 38), To = Vector3.new(cx, 19, cz), Fov = 50, Label = "TROPHY CAM" },
	})

	-- two park benches on the stadium side, facing the trophy, and flower planters at the corners
	for _, dx in ipairs({ -7, 7 }) do
		parkBench(ctx, "PlazaBench", CFrame.new(cx + dx, 0, cz + MONUMENT.HalfSize + 2.5), 5, 0, C.Wood)
	end
	local flowers = { FLOWER_PINK, FLOWER_GOLD, FLOWER_PURPLE, FLOWER_RED }
	for i, corner in ipairs({ { -1, -1 }, { 1, -1 }, { 1, 1 }, { -1, 1 } }) do
		local d = MONUMENT.HalfSize + 1.5
		flowerPot(ctx, "TrophyPlanter", cx + corner[1] * d, cz + corner[2] * d, 0, 3, 1.4, STONE_LIGHT, flowers[i])
	end

	-- Team flags on the corners of the bottom step
	local poleInset = 11.5
	for i, corner in ipairs({ { -1, -1 }, { 1, -1 }, { 1, 1 }, { -1, 1 } }) do
		local px, pz = cx + corner[1] * poleInset, cz + corner[2] * poleInset
		BuildUtil.Cylinder(ctx, {
			Name = "FlagPole",
			Position = Vector3.new(px, 1.2 + 6, pz),
			Height = 12,
			Diameter = 0.4,
			Color = C.Metal,
			Material = Enum.Material.Metal,
		})
		BuildUtil.Ball(
			ctx,
			{ Name = "FlagFinial", Position = Vector3.new(px, 13.45, pz), Diameter = 0.9, Color = C.Gold, Material = Enum.Material.Metal }
		)
		-- each flag flies along its own corner's diagonal, away from the trophy
		-- (a part's local +X points along (cos a, 0, -sin a) after a yaw of a)
		local outward = Vector3.new(corner[1], 0, corner[2]).Unit
		local flagCenter = Vector3.new(px, 11.6, pz) + outward * 2.3
		BuildUtil.Part(ctx, {
			Name = "Flag",
			Size = Vector3.new(4.2, 2.8, 0.15),
			CFrame = CFrame.new(flagCenter) * CFrame.Angles(0, math.atan2(-corner[2], corner[1]), 0),
			Color = (i % 2 == 1) and team.Primary or team.Secondary,
			Material = Enum.Material.Fabric,
			CanCollide = false,
		})
	end

	---------------------------------------------------------------- step 2: trophy base
	BuildUtil.Stage(ctx, 2)
	local trophy = BuildUtil.Child(ctx, "Trophy")
	local trophyBase =
		BuildUtil.Block(trophy, "TrophyBase", Vector3.new(6.4, 1.6, 6.4), center, TROPHY_BASE, Enum.Material.Marble, nil, base)
	local baseName = teamText(ctx, "", "")
	if baseName ~= "" then
		-- engraved team name, between the two gold bands
		sign(
			trophyBase,
			{ Enum.NormalId.Front, Enum.NormalId.Right, Enum.NormalId.Back, Enum.NormalId.Left },
			baseName,
			TROPHY_BASE,
			team,
			{ TextColor3 = C.Gold, InsetX = 0.06, InsetY = 0.3, Font = Enum.Font.Garamond }
		)
	end
	for _, bandY in ipairs({ base, base + 1.3 }) do
		BuildUtil.Block(trophy, "BaseBand", Vector3.new(6.6, 0.3, 6.6), center, C.Gold, Enum.Material.Metal, gold, bandY)
	end
	for _, corner in ipairs({ { -1, -1 }, { 1, -1 }, { 1, 1 }, { -1, 1 } }) do
		local props = table.clone(goldPart)
		props.Name = "BaseCornerKnob"
		props.Position = Vector3.new(cx + corner[1] * 2.9, base + 1.9, cz + corner[2] * 2.9)
		props.Diameter = 0.8
		BuildUtil.Ball(trophy, props)
	end
	local function goldCylinder(name, posY, height, diameter)
		local props = table.clone(goldPart)
		props.Name = name
		props.Position = Vector3.new(cx, posY, cz)
		props.Height = height
		props.Diameter = diameter
		return BuildUtil.Cylinder(trophy, props)
	end
	local function goldBall(name, posY, diameter)
		local props = table.clone(goldPart)
		props.Name = name
		props.Position = Vector3.new(cx, posY, cz)
		props.Diameter = diameter
		return BuildUtil.Ball(trophy, props)
	end
	goldCylinder("Foot", base + 2.1, 1, 5.2)

	---------------------------------------------------------------- step 3: the golden trophy
	BuildUtil.Stage(ctx, 3)
	goldCylinder("Stem", base + 6.1, 7, 1.8)
	local knob = goldBall("Knob", base + 5.8, 3)
	-- (the prompt hangs at eye level in front of the street side of the pedestal; it reaches 12
	-- studs so it also shows from the pavement in front of the steps)
	BuildUtil.Look(
		knob,
		"Championship Trophy",
		"Solid gold and taller than a giraffe! Win the championship game and your team's name joins the legends.",
		{ LookKey = "season", At = Vector3.new(0, -12.4, -5.6), Distance = 12 }
	)
	goldBall("Bowl", base + 13.4, 9)
	local cup = goldCylinder("Cup", base + 15.9, 5, 9)
	goldCylinder("Rim", base + 18.7, 0.6, 9.8)
	BuildUtil.Light(cup, "PointLight", { Name = "TrophyGlow", Range = 18, Brightness = 1.5, Color = Color3.fromRGB(255, 220, 140) })

	-- Handles on the diagonal, so they show on both sides when seen from the walkway or the street
	local handleFrame = CFrame.new(cx, 0, cz) * CFrame.Angles(0, math.rad(45), 0)
	for _, side in ipairs({ -1, 1 }) do
		for _, piece in ipairs({
			{ "HandleTop", Vector3.new(2.4, 0.8, 0.8), Vector3.new(side * 5.4, base + 17, 0) },
			{ "HandleSide", Vector3.new(0.8, 5.4, 0.8), Vector3.new(side * 6.4, base + 14.7, 0) },
			{ "HandleBottom", Vector3.new(2.4, 0.8, 0.8), Vector3.new(side * 5.4, base + 12.4, 0) },
		}) do
			local props = table.clone(goldPart)
			props.Name = piece[1]
			props.Size = piece[2]
			props.CFrame = handleFrame * CFrame.new(piece[3])
			BuildUtil.Part(trophy, props)
		end
	end

	-- the football rests on the rim, tipped up 20 degrees (top stays below 40 studs)
	local ballCFrame = CFrame.new(cx, base + 21.2, cz) * CFrame.Angles(0, math.rad(45), 0) * CFrame.Angles(0, 0, math.rad(20))
	football(
		trophy,
		"GoldFootball",
		ballCFrame,
		0.95,
		{ Body = C.Gold, Stripe = PALE_GOLD, Lace = PALE_GOLD },
		{ Material = Enum.Material.Metal, Reflectance = 0.2 }
	)

	---------------------------------------------------------------- step 4: plaques, lit ring, confetti cannons
	BuildUtil.Stage(ctx, 4)
	local plaqueY = 8.4
	local plaqueText = teamText(ctx, " - CHAMPIONS", "CHAMPIONS")
	local plaqueTextColor = textColorOn(team.Primary, { C.Gold, team.Trim })
	local plaques = {
		{ Enum.NormalId.Left, Vector3.new(-1, 0, 0) },
		{ Enum.NormalId.Front, Vector3.new(0, 0, -1) },
		{ Enum.NormalId.Right, Vector3.new(1, 0, 0) },
		{ Enum.NormalId.Back, Vector3.new(0, 0, 1) },
	}
	for _, plaque in ipairs(plaques) do
		local face, normal = plaque[1], plaque[2]
		local across = Vector3.new(math.abs(normal.Z), 0, math.abs(normal.X)) -- along the pedestal face
		local surface = Vector3.new(cx, plaqueY, cz) + normal * half
		local frameSize = across * 7.4 + Vector3.new(0, 4, 0) + Vector3.new(math.abs(normal.X), 0, math.abs(normal.Z)) * 0.15
		local plateSize = across * 6.8 + Vector3.new(0, 3.4, 0) + Vector3.new(math.abs(normal.X), 0, math.abs(normal.Z)) * 0.15
		BuildUtil.Box(ctx, "PlaqueFrame", frameSize, surface + normal * 0.075, C.Gold, Enum.Material.Metal, gold)
		local plate = BuildUtil.Box(ctx, "Plaque", plateSize, surface + normal * 0.225, team.Primary, Enum.Material.Metal)
		sign(plate, { face }, plaqueText, team.Primary, team, { TextColor3 = plaqueTextColor, Wrap = true, InsetX = 0.08, InsetY = 0.12 })
		if normal.X < 0 then
			-- the plaque facing the walkway
			BuildUtil.Look(plate, "Champions Plaque", "Every championship this franchise wins is engraved here in gold letters.", {
				LookKey = "titles",
				At = normal * 0.6,
				Distance = 12,
			})
		end
	end

	-- the Walk of Champions: three bronze plaques set into the bottom step on the walkway side (the
	-- middle one counts the titles, kept up to date by the server)
	for i, text in ipairs({ "WALK OF CHAMPIONS", "", "EVERY TITLE EARNS A STAR" }) do
		local plate = BuildUtil.Part(ctx, {
			Name = "ChampionsWalkPlaque",
			Size = Vector3.new(2.2, 0.05, 2.4),
			-- (turned so the lettering reads upright from the walkway side, -X)
			CFrame = CFrame.new(cx - MONUMENT.HalfSize + 2.5, 1.225, cz + (i - 2) * 4) * CFrame.Angles(0, -math.pi / 2, 0),
			Color = BRONZE,
			Material = Enum.Material.Metal,
			Reflectance = 0.1,
			CanCollide = false,
			CastShadow = false,
		})
		local engraved = Color3.fromRGB(58, 34, 14)
		if text ~= "" then
			sign(plate, { Enum.NormalId.Top }, text, BRONZE, team, { TextColor3 = engraved, Wrap = true, InsetX = 0.1 })
		else
			local _, label = BuildUtil.LiveText(plate, Enum.NormalId.Top, "titles", {
				LabelName = "Live_titles",
				Text = "CHAMPIONSHIPS: 0",
				TextColor3 = engraved,
				PixelsPerStud = 20,
			})
			label.TextWrapped = true
			BuildUtil.Look(
				plate,
				"Walk of Champions",
				"Every championship your team wins earns a bronze star on this walk. Fans step on it for luck!",
				{ LookKey = "titles", At = Vector3.new(0, 2, 0), Distance = 10 }
			)
		end
	end
	-- a reading lectern with the trophy's facts, facing the walkway
	local lecternX = cx - MONUMENT.HalfSize - 3
	BuildUtil.Block(ctx, "LecternPost", Vector3.new(0.5, 3.1, 0.5), Vector3.new(lecternX, 0, cz), DARK_METAL, Enum.Material.Metal)
	local facts = BuildUtil.Part(ctx, {
		Name = "TrophyFacts",
		Size = Vector3.new(0.15, 1.6, 2.4),
		CFrame = CFrame.new(lecternX, 3.45, cz) * CFrame.Angles(0, 0, math.rad(-35)),
		Color = BRONZE,
		Material = Enum.Material.Metal,
		Reflectance = 0.1,
	})
	sign(facts, { Enum.NormalId.Left }, "THE CHAMPIONSHIP TROPHY", BRONZE, team, {
		TextColor3 = Color3.fromRGB(58, 34, 14),
		Wrap = true,
		InsetX = 0.1,
		InsetY = 0.16,
	})
	BuildUtil.Look(
		facts,
		"Trophy Facts",
		"Taller than a giraffe and shinier than a brand-new helmet. Win the championship game and your team's name joins the legends on the plaques!",
		{ Distance = 8 }
	)

	-- lit neon ring set into the top step around the pedestal, with uplights on the trophy
	local ringRadius = 6.9
	local segments = 12
	local segmentLength = 2 * ringRadius * math.sin(math.pi / segments) + 0.15
	for i = 0, segments - 1 do
		local angle = i * 2 * math.pi / segments
		local segment = BuildUtil.Part(ctx, {
			Name = "LitRing",
			Size = Vector3.new(segmentLength, 0.12, 0.6),
			CFrame = CFrame.new(cx + ringRadius * math.cos(angle), stepsTop + 0.06, cz + ringRadius * math.sin(angle))
				* CFrame.Angles(0, math.pi / 2 - angle, 0),
			Color = accent(team),
			Material = Enum.Material.Neon,
			CanCollide = false,
		})
		if i % 3 == 0 then
			BuildUtil.Light(segment, "SpotLight", {
				Name = "TrophyUplight",
				Face = Enum.NormalId.Top,
				Range = 32,
				Angle = 45,
				Brightness = 2,
				Color = Color3.fromRGB(255, 236, 190),
			})
		end
	end

	-- confetti cannons on the corners of the middle step, frozen mid-blast
	local confettiColors = { team.Primary, team.Secondary, C.Gold, CONFETTI_PINK, CONFETTI_CYAN, team.Trim }
	local cannonInset = 9.5
	local cannonBase = 1.2 * 2
	for c, corner in ipairs({ { -1, -1 }, { 1, -1 }, { 1, 1 }, { -1, 1 } }) do
		local px, pz = cx + corner[1] * cannonInset, cz + corner[2] * cannonInset
		BuildUtil.Block(
			ctx,
			"CannonBase",
			Vector3.new(1.8, 0.8, 1.8),
			Vector3.new(px, 0, pz),
			DARK_METAL,
			Enum.Material.Metal,
			nil,
			cannonBase
		)
		-- barrel: local X along the barrel, pointing up and leaning a little toward the trophy
		local yaw = math.atan2(corner[2], -corner[1])
		local aim = CFrame.new(px, cannonBase + 0.8, pz) * CFrame.Angles(0, yaw, 0) * CFrame.Angles(0, 0, math.rad(74))
		cylinderAt(ctx, "CannonBarrel", aim * CFrame.new(1.5, 0, 0), 3.4, 1.4, accent(team), Enum.Material.Metal)
		cylinderAt(ctx, "CannonMuzzle", aim * CFrame.new(3.15, 0, 0), 0.35, 1.75, C.Gold, Enum.Material.Metal, gold)
		for k, bit in ipairs(CONFETTI) do
			BuildUtil.Part(ctx, {
				Name = "Confetti",
				Size = Vector3.new(bit[4], 0.08, bit[5]),
				CFrame = aim
					* CFrame.new(bit[1], bit[2], bit[3])
					* CFrame.Angles(math.rad(bit[6]), math.rad(bit[6] * 0.7), math.rad(-bit[6])),
				Color = confettiColors[(k + c) % #confettiColors + 1],
				Material = Enum.Material.SmoothPlastic,
				CanCollide = false,
				CastShadow = false,
			})
		end
	end
end

return Plaza
