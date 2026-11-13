--[[
	Plaza
	The buildings in the entrance plaza, between the street (-Z) and the front stands.

	  ticketbooth  box office beside the gate: ticket window + counter facing the walkway (+X),
	               striped awning and a "TICKETS" sign box on the roof
	  concessions  food stand: counter, awning and menu board facing the walkway (+X),
	               "CONCESSIONS" sign and a giant hot dog + soda cup on the roof
	  parking      fan parking lot: asphalt, painted stalls, parked cars, lamp posts, "P" sign
	  teamstore    glass-fronted shop facing the walkway (-X) that players can walk into,
	               big "TEAM STORE" sign and a giant football on the roof
	  trophy       championship trophy monument: stepped stone plinth, gold cup with a
	               football on top, "<TEAM> - CHAMPIONS" plaques and team flags

	Every building stays inside its reserved footprint (the tables below). The walkway
	(X in [-12, 12]) runs between the west half (booth, stand, parking) and the east half
	(store, trophy) of the plaza, so the booth and stand face +X and the store faces -X.
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)

local Plaza = {}

-- Reserved footprints (plot-local studs; Config.Layout has no values for these)
local BOOTH = { MinX = -42, MaxX = -30, MinZ = -188, MaxZ = -176 }
local STAND = { MinX = -70, MaxX = -50, MinZ = -134, MaxZ = -122 }
local LOT = { MinX = -200, MaxX = -100, MinZ = -192, MaxZ = -96 }
local STORE = { MinX = 54, MaxX = 90, MinZ = -142, MaxZ = -118 }
local MONUMENT = { CenterX = 150, CenterZ = -140, HalfSize = 15 }

local PAINT = { CanCollide = false, CastShadow = false }
local NO_COLLIDE = { CanCollide = false }

local WHITE = Color3.fromRGB(248, 248, 248)
local INK = Color3.fromRGB(22, 22, 26)
local DARK_WINDOW = Color3.fromRGB(26, 30, 38)
local CHALKBOARD = Color3.fromRGB(34, 40, 37)
local MENU_TEXT = Color3.fromRGB(255, 226, 140)
local WARM_LIGHT = Color3.fromRGB(255, 236, 200)
local DARK_METAL = Color3.fromRGB(62, 64, 70)
local STORE_WALL = Color3.fromRGB(228, 224, 216)
local STORE_FLOOR = Color3.fromRGB(222, 219, 212)
local STONE_DARK = Color3.fromRGB(96, 96, 102)
local STONE_LIGHT = Color3.fromRGB(236, 233, 226)
local TROPHY_BASE = Color3.fromRGB(30, 30, 34)
local PALE_GOLD = Color3.fromRGB(255, 228, 150)
local LEATHER = Color3.fromRGB(124, 66, 36)
local BUN = Color3.fromRGB(226, 172, 102)
local SAUSAGE = Color3.fromRGB(176, 72, 46)
local MUSTARD = Color3.fromRGB(255, 205, 20)
local BUSH = Color3.fromRGB(56, 122, 62)
local TIRE = Color3.fromRGB(28, 28, 30)
local CAR_GLASS = Color3.fromRGB(46, 58, 74)

local CAR_COLORS = {
	Red = Color3.fromRGB(196, 38, 40),
	Blue = Color3.fromRGB(38, 88, 196),
	White = Color3.fromRGB(236, 236, 238),
	Silver = Color3.fromRGB(168, 172, 178),
	Yellow = Color3.fromRGB(240, 188, 36),
	Black = Color3.fromRGB(34, 34, 38),
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

--[[
	Writes `text` on each face in `faces` of `part`, coloured to read well on `background`.
	opts: TextColor3, Font, PixelsPerStud, Wrap (bool), InsetX / InsetY (fraction of the face
	      left empty around the text, default 0.06 / 0.12), LabelName
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
		})
		label.Size = UDim2.new(1 - 2 * insetX, 0, 1 - 2 * insetY, 0)
		label.Position = UDim2.new(insetX, 0, insetY, 0)
		if opts.Wrap then
			label.TextWrapped = true
		end
	end
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

---------------------------------------------------------------------------------------------
-- Ticket booth
---------------------------------------------------------------------------------------------

function Plaza.ticketbooth(ctx)
	local C = ctx.config.Colors
	local team = ctx.colors

	local cx = (BOOTH.MinX + BOOTH.MaxX) / 2
	local cz = (BOOTH.MinZ + BOOTH.MaxZ) / 2
	local frontX = BOOTH.MaxX - 4 -- the ticket-window wall, facing +X (the walkway)
	local backX = BOOTH.MinX + 0.5
	local bodyX = (frontX + backX) / 2
	local bodyW = frontX - backX
	local bodyD = 10
	local padTop = 0.25
	local wallTop = 8
	local bandTop = 9
	local roofTop = 9.8

	BuildUtil.Box(
		ctx,
		"Pad",
		Vector3.new(BOOTH.MaxX - BOOTH.MinX, padTop, BOOTH.MaxZ - BOOTH.MinZ),
		Vector3.new(cx, padTop / 2, cz),
		C.ConcreteDark,
		Enum.Material.Concrete
	)

	-- Booth body: concrete plinth, team-coloured walls, trim band, roof
	local bodyPos = Vector3.new(bodyX, 0, cz)
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
	local band = BuildUtil.Block(
		ctx,
		"Band",
		Vector3.new(bodyW + 0.2, bandTop - wallTop, bodyD + 0.2),
		bodyPos,
		team.Trim,
		Enum.Material.SmoothPlastic,
		nil,
		wallTop
	)
	sign(band, { Enum.NormalId.Right }, "BOX OFFICE", team.Trim, team, { InsetY = 0.08 })
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

	-- Ticket window (frame, dark booth interior, glass) above the counter
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
	BuildUtil.Box(
		ctx,
		"WindowGlass",
		Vector3.new(0.1, 3.5, 6),
		Vector3.new(frontX + 0.27, windowY, cz),
		C.Glass,
		Enum.Material.Glass,
		{ Transparency = 0.55 }
	)

	-- Counter
	BuildUtil.Block(
		ctx,
		"Counter",
		Vector3.new(1.8, 3.55 - padTop, 7.2),
		Vector3.new(frontX + 0.9, 0, cz),
		team.Secondary,
		Enum.Material.SmoothPlastic,
		nil,
		padTop
	)
	local counterTop = BuildUtil.Block(
		ctx,
		"CounterTop",
		Vector3.new(2.3, 0.25, 7.6),
		Vector3.new(frontX + 1.15, 0, cz),
		C.Metal,
		Enum.Material.Metal,
		nil,
		3.55
	)
	BuildUtil.Light(counterTop, "PointLight", { Name = "CounterLight", Range = 12, Brightness = 1, Color = WARM_LIGHT })

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

	-- Back door and an "ADMIT ONE" ticket poster facing the street
	BuildUtil.Block(
		ctx,
		"Door",
		Vector3.new(0.2, 6.2, 3),
		Vector3.new(backX - 0.2, 0, cz + 2.5),
		C.Wood,
		Enum.Material.WoodPlanks,
		nil,
		1.05
	)
	local poster = BuildUtil.Box(
		ctx,
		"TicketPoster",
		Vector3.new(5, 2.6, 0.15),
		Vector3.new(bodyX, 5.2, cz - bodyD / 2 - 0.075),
		team.Secondary,
		Enum.Material.SmoothPlastic
	)
	sign(poster, { Enum.NormalId.Front }, "ADMIT ONE", team.Secondary, team)

	-- Roof sign on two short posts: a box reading TICKETS on all four sides (walkway, street,
	-- parking lot, stadium), with a neon cap
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
		Vector3.new(6.4, signHeight, 9.2),
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
		Vector3.new(6.7, 0.3, 9.5),
		bodyPos,
		team.Secondary,
		Enum.Material.Neon,
		nil,
		roofTop + postHeight + signHeight
	)
end

---------------------------------------------------------------------------------------------
-- Concession stand
---------------------------------------------------------------------------------------------

function Plaza.concessions(ctx)
	local C = ctx.config.Colors
	local team = ctx.colors

	local cx = (STAND.MinX + STAND.MaxX) / 2
	local cz = (STAND.MinZ + STAND.MaxZ) / 2
	local frontX = STAND.MaxX - 7 -- serving side, faces +X (the walkway)
	local backX = STAND.MinX + 1
	local bodyX = (frontX + backX) / 2
	local bodyW = frontX - backX
	local bodyD = 10.8
	local padTop = 0.25
	local wallTop = 9
	local roofTop = wallTop + 0.8

	BuildUtil.Box(
		ctx,
		"Patio",
		Vector3.new(STAND.MaxX - STAND.MinX, padTop, STAND.MaxZ - STAND.MinZ),
		Vector3.new(cx, padTop / 2, cz),
		C.Walkway,
		Enum.Material.Pavement
	)

	-- Stand body
	local bodyPos = Vector3.new(bodyX, 0, cz)
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
		Vector3.new(0.2, 6.2, 3),
		Vector3.new(backX - 0.2, 0, cz + 2),
		C.Wood,
		Enum.Material.WoodPlanks,
		nil,
		padTop
	)

	-- Street-facing side panel
	local sidePanel = BuildUtil.Box(
		ctx,
		"SidePanel",
		Vector3.new(8.5, 2.6, 0.15),
		Vector3.new(bodyX, 5.4, cz - bodyD / 2 - 0.075),
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	sign(sidePanel, { Enum.NormalId.Front }, "GAME DAY EATS", team.Primary, team)

	-- Serving window (south part of the +X wall) and menu board (north part)
	local openingY = 5.7
	local windowZ = cz - 2.2
	local menuZ = cz + 3.1
	BuildUtil.Box(
		ctx,
		"WindowFrame",
		Vector3.new(0.12, 3.7, 6.3),
		Vector3.new(frontX + 0.06, openingY, windowZ),
		team.Trim,
		Enum.Material.SmoothPlastic
	)
	BuildUtil.Box(
		ctx,
		"WindowInside",
		Vector3.new(0.1, 3.3, 5.8),
		Vector3.new(frontX + 0.17, openingY, windowZ),
		DARK_WINDOW,
		Enum.Material.SmoothPlastic
	)
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
	sign(menu, { Enum.NormalId.Right }, "HOT DOGS\nNACHOS\nSODA", CHALKBOARD, team, {
		TextColor3 = MENU_TEXT,
		Font = Enum.Font.Oswald,
		InsetX = 0.08,
		InsetY = 0.08,
		PixelsPerStud = 30,
	})

	-- Counter with a couple of drinks and a napkin box
	BuildUtil.Block(
		ctx,
		"Counter",
		Vector3.new(2.4, 3.55 - padTop, 10.4),
		Vector3.new(frontX + 1.2, 0, cz),
		team.Trim,
		Enum.Material.SmoothPlastic,
		nil,
		padTop
	)
	local counterTop = BuildUtil.Block(
		ctx,
		"CounterTop",
		Vector3.new(2.8, 0.25, 10.8),
		Vector3.new(frontX + 1.4, 0, cz),
		C.Metal,
		Enum.Material.Metal,
		nil,
		3.55
	)
	BuildUtil.Light(counterTop, "PointLight", { Name = "CounterLight", Range = 14, Brightness = 1.2, Color = WARM_LIGHT })
	BuildUtil.Cylinder(ctx, {
		Name = "CounterCup",
		Position = Vector3.new(frontX + 1.6, 4.3, windowZ - 1.5),
		Height = 1,
		Diameter = 0.7,
		Color = team.Primary,
	})
	BuildUtil.Cylinder(ctx, {
		Name = "CounterCup",
		Position = Vector3.new(frontX + 1.6, 4.3, windowZ - 0.6),
		Height = 1,
		Diameter = 0.7,
		Color = team.Secondary,
	})
	BuildUtil.Block(
		ctx,
		"NapkinBox",
		Vector3.new(0.6, 0.8, 0.9),
		Vector3.new(frontX + 1.5, 0, windowZ + 1.8),
		C.Metal,
		Enum.Material.Metal,
		nil,
		3.8
	)

	stripedAwning(ctx, {
		Name = "Awning",
		WallX = frontX,
		Reach = 5.4,
		TopY = 7.85,
		Drop = 1.5,
		MinZ = STAND.MinZ + 0.3,
		MaxZ = STAND.MaxZ - 0.3,
		Strips = 5,
		Colors = { team.Primary, team.Trim },
	})

	-- CONCESSIONS sign above the awning, with a neon strip on top
	local title = BuildUtil.Box(
		ctx,
		"ConcessionsSign",
		Vector3.new(0.3, 2.5, 11.4),
		Vector3.new(frontX + 0.15, 9.2, cz),
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	sign(title, { Enum.NormalId.Right }, "CONCESSIONS", team.Primary, team, { InsetY = 0.1 })
	BuildUtil.Box(
		ctx,
		"ConcessionsSignGlow",
		Vector3.new(0.32, 0.2, 11.4),
		Vector3.new(frontX + 0.15, 10.55, cz),
		team.Secondary,
		Enum.Material.Neon
	)

	-- Trash can on the patio
	BuildUtil.Cylinder(ctx, {
		Name = "TrashCan",
		Position = Vector3.new(STAND.MaxX - 1.6, padTop + 1.3, STAND.MinZ + 1),
		Height = 2.6,
		Diameter = 1.6,
		Color = DARK_METAL,
		Material = Enum.Material.Metal,
	})
	BuildUtil.Cylinder(ctx, {
		Name = "TrashCanLid",
		Position = Vector3.new(STAND.MaxX - 1.6, padTop + 2.75, STAND.MinZ + 1),
		Height = 0.3,
		Diameter = 1.8,
		Color = team.Primary,
		Material = Enum.Material.Metal,
	})

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
local STALL_WIDTH = 7
local STALL_DEPTH = 10
local STALL_COUNT = 12

-- Simple blocky car standing on the asphalt; it faces local -Z before `yaw` is applied.
local function car(ctx, name, x, z, yaw, color)
	local base = CFrame.new(x, LOT_TOP, z) * CFrame.Angles(0, yaw, 0)
	BuildUtil.Part(ctx, {
		Name = name .. "Body",
		Size = Vector3.new(4.6, 1.7, 9.2),
		CFrame = base * CFrame.new(0, 1.4, 0),
		Color = color,
		Material = Enum.Material.SmoothPlastic,
	})
	BuildUtil.Part(ctx, {
		Name = name .. "Cabin",
		Size = Vector3.new(4, 1.5, 4.8),
		CFrame = base * CFrame.new(0, 3, 0.5),
		Color = CAR_GLASS,
		Material = Enum.Material.Glass,
	})
	for _, sx in ipairs({ -1, 1 }) do
		for _, sz in ipairs({ -1, 1 }) do
			cylinderAt(ctx, name .. "Wheel", base * CFrame.new(sx * 2.15, 1, sz * 3), 0.9, 2, TIRE, Enum.Material.Rubber)
		end
	end
end

function Plaza.parking(ctx)
	local C = ctx.config.Colors
	local team = ctx.colors

	local lotX = (LOT.MinX + LOT.MaxX) / 2
	local lotZ = (LOT.MinZ + LOT.MaxZ) / 2
	BuildUtil.Box(
		ctx,
		"Asphalt",
		Vector3.new(LOT.MaxX - LOT.MinX, LOT_TOP, LOT.MaxZ - LOT.MinZ),
		Vector3.new(lotX, LOT_TOP / 2, lotZ),
		C.Asphalt,
		Enum.Material.Asphalt
	)

	-- Two double rows of stalls (12 stalls each side), divided by a centre line
	local firstX = LOT.MinX + 6
	local rowLength = STALL_WIDTH * STALL_COUNT
	local rowCenters = { lotZ - 22, lotZ + 22 }
	local stripes = BuildUtil.Child(ctx, "Stripes")
	local function paint(name, sizeX, sizeZ, x, z)
		BuildUtil.Box(
			stripes,
			name,
			Vector3.new(sizeX, 0.04, sizeZ),
			Vector3.new(x, LOT_TOP + 0.02, z),
			C.Line,
			Enum.Material.SmoothPlastic,
			PAINT
		)
	end
	for row, zc in ipairs(rowCenters) do
		for i = 0, STALL_COUNT do
			paint("StallLine" .. row .. "_" .. i, 0.4, STALL_DEPTH * 2, firstX + i * STALL_WIDTH, zc)
		end
		paint("CentreLine" .. row, rowLength + 0.4, 0.4, firstX + rowLength / 2, zc)
	end

	-- Team-coloured "FAN PARKING" panel painted in the middle aisle. Top-face text reads upright
	-- from the part's +Z side, so the part is turned around to read from the street (-Z).
	local aislePanel = BuildUtil.Part(ctx, {
		Name = "AislePaint",
		Size = Vector3.new(44, 0.04, 9),
		CFrame = CFrame.new(firstX + rowLength / 2, LOT_TOP + 0.02, lotZ) * CFrame.Angles(0, math.pi, 0),
		Color = team.Primary,
		Material = Enum.Material.SmoothPlastic,
		CanCollide = false,
		CastShadow = false,
	})
	sign(aislePanel, { Enum.NormalId.Top }, "FAN PARKING", team.Primary, team, { InsetX = 0.05, InsetY = 0.12, PixelsPerStud = 10 })

	-- Lamp posts at both ends of each double row
	local lamps = BuildUtil.Child(ctx, "Lamps")
	for _, zc in ipairs(rowCenters) do
		for _, x in ipairs({ firstX - 3, firstX + rowLength + 3 }) do
			BuildUtil.Cylinder(lamps, {
				Name = "LampPole",
				Position = Vector3.new(x, LOT_TOP + 8.5, zc),
				Height = 17,
				Diameter = 0.7,
				Color = DARK_METAL,
				Material = Enum.Material.Metal,
			})
			BuildUtil.Box(
				lamps,
				"LampHead",
				Vector3.new(1.2, 0.6, 5.2),
				Vector3.new(x, LOT_TOP + 17.3, zc),
				team.Primary,
				Enum.Material.Metal
			)
			local lamp = BuildUtil.Box(
				lamps,
				"LampGlow",
				Vector3.new(0.9, 0.15, 4.6),
				Vector3.new(x, LOT_TOP + 16.925, zc),
				WARM_LIGHT,
				Enum.Material.Neon,
				NO_COLLIDE
			)
			BuildUtil.Light(lamp, "SpotLight", {
				Name = "LotLight",
				Face = Enum.NormalId.Bottom,
				Range = 40,
				Angle = 110,
				Brightness = 1.5,
				Color = WARM_LIGHT,
			})
		end
	end

	-- Parked cars: { double row, stall, half (-1 = south, 1 = north), nose in?, colour }
	local cars = BuildUtil.Child(ctx, "Cars")
	local parked = {
		{ 1, 3, -1, true, CAR_COLORS.Red },
		{ 1, 11, -1, true, team.Primary },
		{ 1, 6, 1, true, CAR_COLORS.White },
		{ 1, 12, 1, false, CAR_COLORS.Silver },
		{ 2, 2, -1, true, CAR_COLORS.Blue },
		{ 2, 9, -1, false, CAR_COLORS.Yellow },
		{ 2, 7, 1, true, CAR_COLORS.Black },
	}
	for index, spec in ipairs(parked) do
		local row, stall, half, noseIn, color = spec[1], spec[2], spec[3], spec[4], spec[5]
		local x = firstX + (stall - 0.5) * STALL_WIDTH
		local z = rowCenters[row] + half * STALL_DEPTH / 2
		-- a car faces -Z at yaw 0; nose-in cars point at the centre line
		local facesPlusZ = (half == -1) == noseIn
		car(cars, "Car" .. index, x, z, facesPlusZ and math.pi or 0, color)
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
	local board = BuildUtil.Box(
		ctx,
		"ParkingBoard",
		Vector3.new(0.3, 1.6, 6.4),
		Vector3.new(signX, 11.6, signZ),
		team.Trim,
		Enum.Material.SmoothPlastic
	)
	sign(board, { Enum.NormalId.Right, Enum.NormalId.Left }, "FAN PARKING", team.Trim, team, { InsetY = 0.1 })
end

---------------------------------------------------------------------------------------------
-- Team store
---------------------------------------------------------------------------------------------

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
	local doorTop = 7.75
	local openMinZ, openMaxZ = southZ + 4, northZ - 4 -- storefront opening between the corner piers
	local openWidth = openMaxZ - openMinZ
	local glassX = frontX + 0.5

	-- Shell: floor, three plaster walls, team-coloured corner piers + header, roof
	BuildUtil.Box(
		ctx,
		"Floor",
		Vector3.new(length, floorTop, depth),
		Vector3.new(midX, floorTop / 2, cz),
		STORE_FLOOR,
		Enum.Material.Marble
	)
	BuildUtil.Block(ctx, "BackWall", Vector3.new(1, wallH, depth), Vector3.new(backX - 0.5, 0, cz), STORE_WALL, Enum.Material.Plaster)
	BuildUtil.Block(ctx, "SouthWall", Vector3.new(length, wallH, 1), Vector3.new(midX, 0, southZ + 0.5), STORE_WALL, Enum.Material.Plaster)
	BuildUtil.Block(ctx, "NorthWall", Vector3.new(length, wallH, 1), Vector3.new(midX, 0, northZ - 0.5), STORE_WALL, Enum.Material.Plaster)
	for _, z in ipairs({ southZ + 2, northZ - 2 }) do
		BuildUtil.Block(ctx, "Pier", Vector3.new(1, wallH, 4), Vector3.new(glassX, 0, z), team.Primary, Enum.Material.SmoothPlastic)
	end
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

	-- Glass storefront: two big panes, walk-through doors with a transom above, metal mullions
	local storefront = BuildUtil.Child(ctx, "Storefront")
	local doorMinZ, doorMaxZ = cz - 2, cz + 2
	local paneHeight = glassTop - floorTop
	local glassProps = { Transparency = 0.45 }
	for _, range in ipairs({ { openMinZ, doorMinZ }, { doorMaxZ, openMaxZ } }) do
		BuildUtil.Box(
			storefront,
			"Window",
			Vector3.new(0.3, paneHeight, range[2] - range[1]),
			Vector3.new(glassX, floorTop + paneHeight / 2, (range[1] + range[2]) / 2),
			C.Glass,
			Enum.Material.Glass,
			glassProps
		)
	end
	BuildUtil.Box(
		storefront,
		"Transom",
		Vector3.new(0.3, glassTop - doorTop, doorMaxZ - doorMinZ),
		Vector3.new(glassX, (doorTop + glassTop) / 2, cz),
		C.Glass,
		Enum.Material.Glass,
		glassProps
	)
	for _, side in ipairs({ -1, 1 }) do
		BuildUtil.Box(
			storefront,
			"Door",
			Vector3.new(0.25, doorTop - floorTop, 1.95),
			Vector3.new(glassX, (floorTop + doorTop) / 2, cz + side),
			C.Glass,
			Enum.Material.Glass,
			{ Transparency = 0.5, CanCollide = false }
		)
		BuildUtil.Box(
			storefront,
			"DoorHandle",
			Vector3.new(0.15, 2.4, 0.2),
			Vector3.new(glassX - 0.2, 4.2, cz + side * 0.35),
			C.Metal,
			Enum.Material.Metal,
			NO_COLLIDE
		)
	end
	for _, z in ipairs({ (openMinZ + doorMinZ) / 2, doorMinZ, doorMaxZ, (doorMaxZ + openMaxZ) / 2 }) do
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
		Vector3.new(0.4, 0.3, openWidth),
		Vector3.new(glassX, doorTop + 0.15, cz),
		DARK_METAL,
		Enum.Material.Metal
	)

	-- Entrance canopy, welcome mat and planters
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
		Vector3.new(2.6, 0.05, 4.6),
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
	BuildUtil.Box(
		ctx,
		"SideWindow",
		Vector3.new(20, 4, 0.2),
		Vector3.new(midX + 2, 5, southZ - 0.1),
		C.Glass,
		Enum.Material.Glass,
		{ Transparency = 0.2 }
	)
	local nameSign = BuildUtil.Box(
		ctx,
		"NameSign",
		Vector3.new(16, 3, 0.2),
		Vector3.new(midX + 2, 9.4, southZ - 0.1),
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	-- wraps onto two lines when the owner's name is long
	sign(nameSign, { Enum.NormalId.Front }, ctx.teamName .. " FAN SHOP", team.Primary, team, { InsetY = 0.1, Wrap = true })

	-- Interior: jerseys on the back wall, display tables, checkout counter, ceiling light
	local interior = BuildUtil.Child(ctx, "Interior")
	local jerseyX = backX - 1 - 0.15
	local jerseys = {
		{ cz - 6, team.Primary, "1" },
		{ cz, WHITE, "12" },
		{ cz + 6, team.Secondary, "99" },
	}
	for _, jersey in ipairs(jerseys) do
		local z, color, number = jersey[1], jersey[2], jersey[3]
		local torso =
			BuildUtil.Box(interior, "Jersey", Vector3.new(0.3, 4.2, 3.4), Vector3.new(jerseyX, 6.2, z), color, Enum.Material.Fabric)
		sign(torso, { Enum.NormalId.Left }, number, color, team, { InsetX = 0.2, InsetY = 0.22 })
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
	local tableX = frontX + 12
	local tableA, tableB = cz - 5.5, cz + 5.5
	BuildUtil.Block(
		interior,
		"DisplayTable",
		Vector3.new(5, 2.6, 3.2),
		Vector3.new(tableX, 0, tableA),
		C.Wood,
		Enum.Material.WoodPlanks,
		nil,
		floorTop
	)
	BuildUtil.Block(
		interior,
		"DisplayTable",
		Vector3.new(5, 2.6, 3.2),
		Vector3.new(tableX, 0, tableB),
		C.Wood,
		Enum.Material.WoodPlanks,
		nil,
		floorTop
	)
	local shirtTop = floorTop + 2.6
	BuildUtil.Block(
		interior,
		"FoldedShirts",
		Vector3.new(1.6, 0.6, 1.4),
		Vector3.new(tableX - 1.2, 0, tableA),
		team.Primary,
		Enum.Material.Fabric,
		nil,
		shirtTop
	)
	BuildUtil.Block(
		interior,
		"FoldedShirts",
		Vector3.new(1.6, 0.6, 1.4),
		Vector3.new(tableX + 1.2, 0, tableA),
		team.Secondary,
		Enum.Material.Fabric,
		nil,
		shirtTop
	)
	for _, offset in ipairs({ -1.2, 1.2 }) do
		local helmetPos = Vector3.new(tableX + offset, shirtTop + 0.9, tableB)
		BuildUtil.Ball(interior, { Name = "Helmet", Position = helmetPos, Diameter = 1.8, Color = team.Primary })
		BuildUtil.Box(
			interior,
			"Facemask",
			Vector3.new(0.25, 0.8, 1.3),
			helmetPos + Vector3.new(-0.85, -0.25, 0),
			team.Trim,
			Enum.Material.Metal
		)
	end
	BuildUtil.Block(
		interior,
		"Checkout",
		Vector3.new(6, 3.4, 2.2),
		Vector3.new(frontX + 8, 0, northZ - 2.6),
		C.Wood,
		Enum.Material.WoodPlanks,
		nil,
		floorTop
	)
	BuildUtil.Block(
		interior,
		"Register",
		Vector3.new(1.2, 0.9, 1),
		Vector3.new(frontX + 8, 0, northZ - 2.6),
		DARK_METAL,
		Enum.Material.Metal,
		nil,
		floorTop + 3.4
	)
	local ceiling = BuildUtil.Box(
		interior,
		"CeilingLight",
		Vector3.new(18, 0.15, 3),
		Vector3.new(midX, wallH - 0.1, cz),
		WARM_LIGHT,
		Enum.Material.Neon,
		NO_COLLIDE
	)
	BuildUtil.Light(ceiling, "PointLight", { Name = "StoreLight", Range = 28, Brightness = 1.2, Color = WARM_LIGHT })

	-- Giant football resting on a cradle on the roof, laces tipped toward the walkway
	local roofTop = wallH + 0.8
	local ballX = frontX + 10
	local scale = 0.9 -- 9.9 long; with the cradle the top stays under the 20-stud height limit
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

function Plaza.trophy(ctx)
	local C = ctx.config.Colors
	local team = ctx.colors
	local cx, cz = MONUMENT.CenterX, MONUMENT.CenterZ
	local center = Vector3.new(cx, 0, cz)
	local gold = { Reflectance = 0.2 }

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
	local pedestalTop = 13
	local half = 4.5
	BuildUtil.Block(ctx, "Pedestal", Vector3.new(half * 2, pedestalTop - y, half * 2), center, STONE_LIGHT, Enum.Material.Marble, nil, y)
	BuildUtil.Block(ctx, "PedestalCap", Vector3.new(9.8, 0.6, 9.8), center, C.Gold, Enum.Material.Metal, gold, pedestalTop)

	-- Plaques facing the walkway (-X) and the street (-Z)
	local plaqueY = 8.4
	local plaqueText = ctx.teamName .. " - CHAMPIONS"
	local plaqueTextColor = textColorOn(team.Primary, { C.Gold, team.Trim })
	local plaques = {
		{ Enum.NormalId.Left, Vector3.new(-1, 0, 0), Vector3.new(0.15, 4, 7.4), Vector3.new(0.15, 3.4, 6.8) },
		{ Enum.NormalId.Front, Vector3.new(0, 0, -1), Vector3.new(7.4, 4, 0.15), Vector3.new(6.8, 3.4, 0.15) },
	}
	for _, plaque in ipairs(plaques) do
		local face, normal = plaque[1], plaque[2]
		local surface = Vector3.new(cx, plaqueY, cz) + normal * half
		BuildUtil.Box(ctx, "PlaqueFrame", plaque[3], surface + normal * 0.075, C.Gold, Enum.Material.Metal, gold)
		local plate = BuildUtil.Box(ctx, "Plaque", plaque[4], surface + normal * 0.225, team.Primary, Enum.Material.Metal)
		sign(plate, { face }, plaqueText, team.Primary, team, { TextColor3 = plaqueTextColor, Wrap = true, InsetX = 0.08, InsetY = 0.12 })
	end

	-- The trophy: black base, gold foot, stem with a knob, cup with handles, football on top
	local trophy = BuildUtil.Child(ctx, "Trophy")
	local base = pedestalTop + 0.6
	local goldPart = { Color = C.Gold, Material = Enum.Material.Metal, Reflectance = 0.2 }
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
	BuildUtil.Block(trophy, "TrophyBase", Vector3.new(6.4, 1.6, 6.4), center, TROPHY_BASE, Enum.Material.Marble, nil, base)
	goldCylinder("Foot", base + 2.1, 1, 5.2)
	goldCylinder("Stem", base + 6.1, 7, 1.8)
	goldBall("Knob", base + 5.8, 3)
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

	-- Team flags on the corners of the bottom step
	local flagYaw = CFrame.Angles(0, math.rad(45), 0)
	local flagAxis = Vector3.new(1, 0, -1).Unit
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
		-- flags fly along the diagonal, away from the trophy
		local outward = (corner[1] - corner[2] >= 0) and 1 or -1
		local flagCenter = Vector3.new(px, 11.6, pz) + flagAxis * outward * 2.3
		BuildUtil.Part(ctx, {
			Name = "Flag",
			Size = Vector3.new(4.2, 2.8, 0.15),
			CFrame = CFrame.new(flagCenter) * flagYaw,
			Color = (i % 2 == 1) and team.Primary or team.Secondary,
			Material = Enum.Material.Fabric,
			CanCollide = false,
		})
	end
end

return Plaza
