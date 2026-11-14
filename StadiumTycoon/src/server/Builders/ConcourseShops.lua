--[[
	ConcourseShops
	Food stands, drink bars, restrooms and the pro shop on the OUTER side of the main concourse
	(docs/V5-LAYOUT.md). Everything stands in the band between the walking lane (offsets 66..76,
	kept clear) and the concourse outer wall (offset 83, Concourse.lua), on the concourse floor
	(y 30) under its ceiling (bottom y 41.3). Positions use the bowl's segments (Bowl.Segments):
	x runs along a segment from its middle, "o" is the offset outward from the turf edge.

	Bays: the outer side is split into bays by the concourse columns on the aisle lines (sides
	x = +-26/+-78/+-130, ends +-26/+-78, corners 0; each column has a TV in front of it, so bays
	keep 3.5 clear of the line) and the 16-wide escalator openings on the gate axes (bays keep
	|x| >= 10). Every stand / room uses its own bay range (tables below), so pieces never overlap.

	A stand (all steps of concourse_food): side walls in the stand kind's own colours (hot dogs red,
	pizza green, bars slate, BBQ wood, desserts pink; stands in the same bay share a wall), a
	team-colour fascia with the stand's name (+ a 3D food icon, + on some a live screen), a counter
	(Use) set back from the lane so a short queue alcove with a steel rail divider fits in front of
	it, a cash register right behind the order spot (its lit TAP TO PAY display faces the queue),
	its own back wall (tiles, brick or a dark bar wall over the grey concourse wall), a steel back
	counter with the cooking gear and a lit menu board on the back wall (Look).

	  concourse_food       (4 stands per step: a sideline each, plus the ends or two corners)
	    1 Hot Dog Stands     roller grills, giant hot dog icons, ketchup + mustard on the counter
	                         (Use hotdog); a condiment station (look) across the lane from every hot
	                         dog stand, against the portal wall on Concourse.lua's "food" spots
	    2 Pizza & Nachos     brick pizza ovens, a pizza and a tray of nachos on the counter, a stack
	                         of pizza boxes, pizza-slice icons (Use tray)
	    3 Drink Bars         soda fountains + drink fridges, a bar counter with 3 stools (cushion
	                         on a post; the first is a "CONCOURSE BAR TV" camera seat) and a stack
	                         of team cups, live screens (Use soda / sportsdrink)
	    4 Grill & BBQ        smokers with smoke stacks, glowing grills, a burger basket on the
	                         counter, flame icons (Use tray)
	    5 Desserts & Snacks  popcorn machines, milkshake machines (Use popcorn / smoothie) or soft
	                         serve machines, waffle cones on the counter
	    (one stand per step has a live GAME DAY screen in its fascia; three bars show the score)
	  concourse_restrooms
	    1 Restrooms          4 blocks (both sidelines + both ends): a women's and a men's room each,
	                         tiled floor + back wall (with a team-colour tile stripe), doors swinging
	                         into the rooms (the sinks and hand dryers stay out of their swing),
	                         stalls, urinals with a divider, sinks, mirrors (Look), hand dryers,
	                         ceiling lights, a team-colour kick band along the front wall and a lit
	                         WOMEN | RESTROOMS | MEN sign band (Look)
	    2 Family Restrooms   2 single rooms on the sidelines (door at one end opening flat against
	                         the side wall, toilet, sink, mirror, paper towels, baby changing table
	                         (Look))
	    3 Water Fountains    a fountain (Look) with a bottle filler above it (its little screen counts
	      & Signs            the bottles saved) beside every restroom (in front of the next column,
	                         or against the wall by the family rooms) + a hanging two-sided blade
	                         sign on the nearest column line, over the lane's outer edge (offsets
	                         72.7..76, y 39.6+: above the lane's head room, non-collidable) where
	                         fans walking along the lane see it
	  concourse_merch
	    1 Pro Shop           a walk-in shop next to Gate A (white back wall, wood floor): glass
	                         storefront + sliding glass doors,
	                         jersey wall (star QB jersey, Look roster:QB), cap wall, hoodie rack,
	                         foam finger bin (Use foamfinger) under a shelf of footballs, checkout
	                         counter (Look) with a card reader, a shopping bag and mini helmets on
	                         the wall behind it, window mannequins, a signed game ball in a glass
	                         case (Look), felt pennants on the side walls, a live "starting
	                         lineup" screen, lit ceiling panels
	    2 Jersey Kiosks      4 kiosks beside the gates: canopy, counter with a till and a football,
	                         jerseys (Look roster:WR / RB / DEF / K)
	    3 Foam Finger Carts  8 carts with umbrellas, a giant foam finger (Use foamfinger) and a stack
	                         of rally towels: one in a bay of every straight + a team-colour "GAME
	                         DAY GEAR" cart right inside every gate, across from its jersey kiosk

	Flat layers: floor paint (tiles, pro shop floor) 30.00..30.04, only inside the shops/rooms.
	Collidable parts stay at offsets >= 76.2 (the lane ends at 76) - except the condiment stations,
	which stand against the portal wall (offsets 57..58.6) on the far side of the lane; food icons
	that stick out a little toward the lane and the restroom blade signs over its edge hang above
	head height (y > 37.5) and don't collide.
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)
local Bowl = require(script.Parent.Parent.Bowl)

local ConcourseShops = {}

-- Segment frames: local +Z points toward the field (the lane), -Z outward, +X along the ring.
local INWARD = Enum.NormalId.Back -- faces the lane
local OUTWARD = Enum.NormalId.Front -- faces the lane from the portal side (condiment stations)
local TOWARD_PLUS_X = Enum.NormalId.Right
local TOWARD_MINUS_X = Enum.NormalId.Left

local PAINT = { CanCollide = false, CastShadow = false }
local NO_COLLIDE = { CanCollide = false }

local WHITE = Color3.fromRGB(248, 248, 248)
local INK = Color3.fromRGB(22, 22, 26)
local STAND_DARK = Color3.fromRGB(44, 46, 54)
local STEEL = Color3.fromRGB(200, 204, 210)
local DARK_METAL = Color3.fromRGB(58, 60, 66)
local SIGN_DARK = Color3.fromRGB(20, 24, 34)
local SCREEN = Color3.fromRGB(12, 14, 20)
local SCREEN_TEXT = Color3.fromRGB(255, 226, 120)
local MENU_TEXT = Color3.fromRGB(255, 236, 170)
local LIGHT_COLOR = Color3.fromRGB(255, 244, 222)
local NEON = Color3.fromRGB(255, 249, 232)
local TILE = Color3.fromRGB(206, 218, 226)
local TILE_WALL = Color3.fromRGB(222, 232, 238)
local PORCELAIN = Color3.fromRGB(244, 244, 246)
local MIRROR = Color3.fromRGB(196, 214, 228)
local GLASS = Color3.fromRGB(170, 215, 240)
local SHOP_FLOOR = Color3.fromRGB(168, 124, 82)
local SHOP_WALL = Color3.fromRGB(240, 238, 232)
local BUN = Color3.fromRGB(222, 180, 110)
local FRANK = Color3.fromRGB(176, 72, 50)
local CHEESE = Color3.fromRGB(255, 196, 64)
local BRICK = Color3.fromRGB(150, 70, 48)
local GLOW_ORANGE = Color3.fromRGB(255, 120, 40)
local GLOW_YELLOW = Color3.fromRGB(255, 214, 80)
local POPCORN = Color3.fromRGB(255, 224, 120)
local POPCORN_RED = Color3.fromRGB(196, 36, 40)
local PINK = Color3.fromRGB(246, 150, 190)
local CONE = Color3.fromRGB(214, 160, 92)
local CUP_RED = Color3.fromRGB(214, 40, 44)
local SKIN = Color3.fromRGB(226, 226, 222) -- mannequins
local HEATHER = Color3.fromRGB(150, 154, 162) -- grey hoodies
local KETCHUP = Color3.fromRGB(200, 30, 30)
local MUSTARD = Color3.fromRGB(255, 205, 20)
local CARDBOARD = Color3.fromRGB(196, 160, 112)
local LEATHER = Color3.fromRGB(122, 64, 36) -- footballs
local TILL_TEXT = Color3.fromRGB(120, 220, 160)
local FILLER_TEXT = Color3.fromRGB(110, 210, 255)

-- The main concourse band (Config.Layout.Bowl.MainConcourse: offsets 56..84, floor 30)
local FRONT = 76.2 -- shop fronts: the walking lane (66..76) stays clear
local BACK = 83 -- the inner face of the concourse outer wall (Concourse.lua: 83..84.1)
local FASCIA_Y = 37.6 -- bottom of the stand name signs
local PORTAL_WALL = 57 -- the concourse face of the portal wall across the lane (Concourse.lua)

---------------------------------------------------------------------------------------------
-- Colour + text helpers (same rules as Concourse.lua so signs match)
---------------------------------------------------------------------------------------------

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

-- A team colour that reads well on `background`, else white or ink.
local function ink(background, team)
	for _, candidate in ipairs({ team.Trim, team.Secondary, team.Primary }) do
		if contrast(background, candidate) >= 3 then
			return candidate
		end
	end
	if contrast(background, WHITE) >= contrast(background, INK) then
		return WHITE
	end
	return INK
end

-- Two colours that are hard to tell apart side by side (close in every channel, whatever the hue).
local function similar(a, b)
	local dr, dg, db = a.R - b.R, a.G - b.G, a.B - b.B
	return dr * dr + dg * dg + db * db < 0.09
end

-- White or ink, whichever reads better on `background`.
local function plain(background)
	if contrast(background, WHITE) >= contrast(background, INK) then
		return WHITE
	end
	return INK
end

-- The team's second colour, unless it is too close to Primary (then Trim).
local function accent(team)
	if contrast(team.Secondary, team.Primary) >= contrast(team.Trim, team.Primary) or contrast(team.Secondary, team.Primary) >= 3 then
		return team.Secondary
	end
	return team.Trim
end

local function teamLabel(ctx)
	local name = ctx.teamName
	if type(name) ~= "string" or name == "" then
		return "HOME TEAM"
	end
	return name
end

--[[
	Text on one face of a part. opts: Top / Height / Left / Width (fractions of the face), Font,
	PPS (pixels per stud), Glow (LightInfluence 0: lit signs), Name
]]
local function write(part, face, text, color, opts)
	opts = opts or {}
	local _, label = BuildUtil.SurfaceText(part, face, text, {
		LabelName = opts.Name,
		TextColor3 = color,
		Font = opts.Font or Enum.Font.GothamBlack,
		PixelsPerStud = opts.PPS or 16,
		LightInfluence = opts.Glow and 0 or 1,
	})
	label.Position = UDim2.new(opts.Left or 0.05, 0, opts.Top or 0.1, 0)
	label.Size = UDim2.new(opts.Width or 0.9, 0, opts.Height or 0.8, 0)
	return label
end

-- Another line of text on the same SurfaceGui as `label` (saves a GUI).
local function addLine(label, text, left, top, width, height, font, color)
	local line = label:Clone()
	line.Name = label.Name .. "Line"
	line.Text = text
	line.Position = UDim2.new(left, 0, top, 0)
	line.Size = UDim2.new(width, 0, height, 0)
	line.Font = font or label.Font
	line.TextColor3 = color or label.TextColor3
	line.Parent = label.Parent
	return line
end

-- A live screen (dark LED background, bright text) the server keeps up to date.
local function liveScreen(part, face, live, placeholder)
	local _, label = BuildUtil.LiveText(part, face, live, {
		LabelName = "Live_" .. live,
		Text = placeholder,
		TextColor3 = SCREEN_TEXT,
		BackgroundColor3 = SCREEN,
		BackgroundTransparency = 0,
		LightInfluence = 0,
		Font = Enum.Font.GothamBold,
		PixelsPerStud = 24,
	})
	local pad = Instance.new("UIPadding")
	local px, py = UDim.new(0.05, 0), UDim.new(0.1, 0)
	pad.PaddingLeft, pad.PaddingRight, pad.PaddingTop, pad.PaddingBottom = px, px, py, py
	pad.Parent = label
	return label
end

local LIVE_PLACEHOLDER = {
	gameday = "NEXT GAME SOON",
	score = "HOME 0 - 0 VISITORS",
	roster = "QB\nRB\nWR\nOL\nDEF\nK",
}

local function lamp(part, range, brightness)
	BuildUtil.Light(part, "PointLight", {
		Range = range or 14,
		Brightness = brightness or 1.1,
		Color = LIGHT_COLOR,
		Shadows = false,
	})
end

---------------------------------------------------------------------------------------------
-- Ring geometry (segment-local: x along the segment, o = offset outward, y = height)
---------------------------------------------------------------------------------------------

local function ringSegments(L)
	local byName = {}
	for _, s in ipairs(Bowl.Segments(L, 0, 0)) do
		byName[s.name] = { name = s.name, kind = s.kind, base = s.cframe }
	end
	return byName
end

local function at(seg, x, y, o)
	return seg.base * CFrame.new(x, y, -o)
end

-- Block from x0..x1 along the segment, offsets o0..o1, heights y0..y1 (local axes = segment axes).
local function span(ctx, seg, name, x0, x1, o0, o1, y0, y1, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Size = Vector3.new(x1 - x0, y1 - y0, o1 - o0)
	props.CFrame = at(seg, (x0 + x1) / 2, (y0 + y1) / 2, (o0 + o1) / 2)
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Part(ctx, props)
end

local AXIS = {
	x = CFrame.new(), -- along the segment
	y = CFrame.Angles(0, 0, math.pi / 2), -- vertical
	o = CFrame.Angles(0, math.pi / 2, 0), -- pointing at the lane
}

-- Cylinder centred at (x, y, o) along `axis` ("x" | "y" | "o").
local function cyl(ctx, seg, name, x, y, o, length, diameter, axis, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Shape = Enum.PartType.Cylinder
	props.Size = Vector3.new(length, diameter, diameter)
	props.CFrame = at(seg, x, y, o) * AXIS[axis]
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Part(ctx, props)
end

local function ball(ctx, seg, name, x, y, o, diameter, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Shape = Enum.PartType.Ball
	props.Size = Vector3.new(diameter, diameter, diameter)
	props.CFrame = at(seg, x, y, o)
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Part(ctx, props)
end

-- The point (x, y, o) of a segment in `part`'s own space (for prompt positions).
local function localPoint(ctx, part, seg, x, y, o)
	return part.CFrame:PointToObjectSpace((ctx.origin * at(seg, x, y, o)).Position)
end

-- A football lying along the segment (a ball stretched by a sphere mesh).
local function football(ctx, seg, name, x, y, o, length, diameter, extra)
	local part = ball(ctx, seg, name, x, y, o, diameter, LEATHER, nil, extra)
	local mesh = Instance.new("SpecialMesh")
	mesh.Name = "FootballShape"
	mesh.MeshType = Enum.MeshType.Sphere
	mesh.Scale = Vector3.new(length / diameter, 1, 1)
	mesh.Parent = part
	return part
end

-- A cash register on a counter (bottom at y = top, x0..x1 / o0..o1): its little lit display faces
-- the customers (the lane).
local function till(ctx, seg, x0, x1, o0, o1, top)
	local part = span(ctx, seg, "CashRegister", x0, x1, o0, o1, top, top + 0.9, DARK_METAL)
	local _, label = BuildUtil.SurfaceText(part, INWARD, "TAP TO PAY", {
		LabelName = "TillDisplay",
		TextColor3 = TILL_TEXT,
		BackgroundColor3 = SCREEN,
		BackgroundTransparency = 0,
		Font = Enum.Font.Code,
		PixelsPerStud = 32,
		LightInfluence = 0,
	})
	label.Position = UDim2.new(0.1, 0, 0.12, 0)
	label.Size = UDim2.new(0.8, 0, 0.42, 0)
	return part
end

---------------------------------------------------------------------------------------------
-- Small props shared by the pieces
---------------------------------------------------------------------------------------------

-- A jersey hanging flat on a wall (a T: body + sleeves). oFront = the offset of its front face
-- (the side that faces the lane); it is 0.2 thick. Returns the body (which carries the number).
local function jersey(ctx, seg, x, yTop, oFront, scale, color, number, team)
	local bodyW, bodyH = 2.6 * scale, 3.2 * scale
	local sleeveW, sleeveH = 4.6 * scale, 1.1 * scale
	local body =
		span(ctx, seg, "Jersey", x - bodyW / 2, x + bodyW / 2, oFront, oFront + 0.2, yTop - bodyH, yTop, color, Enum.Material.Fabric)
	-- (the sleeves sit 0.05 behind the body: no shared front faces)
	span(
		ctx,
		seg,
		"JerseySleeves",
		x - sleeveW / 2,
		x + sleeveW / 2,
		oFront + 0.05,
		oFront + 0.25,
		yTop - sleeveH,
		yTop,
		color,
		Enum.Material.Fabric
	)
	write(body, INWARD, number, ink(color, team), { Top = 0.38, Height = 0.5, Left = 0.12, Width = 0.76 })
	return body
end

---------------------------------------------------------------------------------------------
-- CONCOURSE FOOD
---------------------------------------------------------------------------------------------

-- Stand styles: counter colour, the Use at the counter, the 3D icon on the fascia, the gear.
-- (each kind has its own "brand" colours on the side walls + counter; the fascia is team colour)
local STYLES = {
	hotdog = {
		wall = Color3.fromRGB(196, 44, 40),
		back = Color3.fromRGB(252, 234, 196), -- mustard-cream tiles
		counter = Color3.fromRGB(250, 196, 40),
		use = "hotdog",
		icon = "hotdog",
		gear = "roller",
	},
	pizza = {
		wall = Color3.fromRGB(34, 112, 60),
		back = Color3.fromRGB(236, 244, 228), -- pale green tiles
		counter = Color3.fromRGB(240, 232, 214),
		use = "tray",
		action = "Get pizza & nachos",
		icon = "pizza",
		gear = "oven",
	},
	bar = {
		wall = Color3.fromRGB(48, 52, 64),
		back = Color3.fromRGB(28, 30, 38), -- a dark bar back wall (the fountain + fridge glow)
		counter = Color3.fromRGB(120, 80, 50),
		counterMaterial = Enum.Material.WoodPlanks,
		use = "soda",
		icon = "cup",
		gear = "fountain",
		bar = true,
	},
	grill = {
		wall = Color3.fromRGB(92, 58, 36),
		wallMaterial = Enum.Material.WoodPlanks,
		back = BRICK, -- a smokehouse brick wall
		backMaterial = Enum.Material.Brick,
		counter = Color3.fromRGB(40, 40, 44),
		use = "tray",
		action = "Grab a BBQ plate",
		icon = "flame",
		gear = "smoker",
	},
	dessert = {
		wall = Color3.fromRGB(240, 140, 184),
		back = Color3.fromRGB(255, 230, 240), -- light pink tiles
		counter = Color3.fromRGB(150, 220, 205),
		use = "popcorn",
		icon = "cone",
		gear = "popcorn",
	},
}

--[[
	The 20 stands: step, style, segment, bay range (x0..x1 along the segment), title (shown on the
	fascia and the cards), menu lines, a fun fact for the menu card, and optional extras:
	screen = live kind in the fascia, shake = a milkshake machine (Use smoothie), use = override,
	shareLeft = the stand to its left (ending at x0) already built the wall between them.
]]
local STANDS = {
	-- 1 HOT DOG STANDS
	{
		step = 1,
		style = "hotdog",
		seg = "visitor",
		x0 = -126.5,
		x1 = -104,
		title = "Touchdown Dogs",
		menu = "HOT DOG ......... $5\nCHILI DOG ....... $7\nFOOTLONG ........ $8",
		info = "The classic stadium hot dog. Ketchup, mustard or both - you make the call, rookie!",
		screen = "gameday",
	},
	{
		step = 1,
		style = "hotdog",
		seg = "home",
		x0 = 81.5,
		x1 = 104,
		title = "Blitz Franks",
		menu = "JUMBO FRANK ..... $6\nCHEESE DOG ...... $7\nSOFT PRETZEL .... $4",
		info = "Jumbo franks served faster than a linebacker blitz. Grab one before the kickoff!",
	},
	{
		step = 1,
		style = "hotdog",
		seg = "west",
		x0 = -74.5,
		x1 = -52,
		title = "End Zone Dogs",
		menu = "CORN DOG ........ $5\nFOOTLONG ........ $8\nNACHO DOG ....... $7",
		info = "Corn dogs and footlongs right behind the end zone. Every bite is a score!",
	},
	{
		step = 1,
		style = "hotdog",
		seg = "east",
		x0 = -74.5,
		x1 = -52,
		title = "First Down Franks",
		menu = "HOT DOG ......... $5\nBRATWURST ....... $7\nCHILI CUP ....... $4",
		info = "Grab a dog and move the chains! The bratwurst here is a fan favourite.",
	},
	-- 2 PIZZA & NACHOS
	{
		step = 2,
		style = "pizza",
		seg = "visitor",
		x0 = -104,
		x1 = -81.5,
		shareLeft = true,
		title = "Pigskin Pizza",
		menu = "CHEESE SLICE .... $6\nPEPPERONI ....... $7\nNACHOS .......... $6",
		info = "Hot pizza straight from the brick oven. Every slice is as big as a football!",
		screen = "gameday",
	},
	{
		step = 2,
		style = "pizza",
		seg = "home",
		x0 = 29.5,
		x1 = 52,
		title = "Nacho Huddle",
		menu = "NACHOS .......... $6\nSUPER NACHOS .... $9\nCHEESE SLICE .... $6",
		info = "Nachos piled high with melty cheese. Huddle up and share with your whole row!",
	},
	{
		step = 2,
		style = "pizza",
		seg = "corner_vw",
		x0 = 4,
		x1 = 26.5,
		title = "Goal Line Pizza",
		menu = "PEPPERONI ....... $7\nVEGGIE SLICE .... $6\nGARLIC KNOTS .... $5",
		info = "So close to the goal line you can smell it. Pepperoni is the house special.",
	},
	{
		step = 2,
		style = "pizza",
		seg = "corner_he",
		x0 = 4,
		x1 = 26.5,
		title = "Gridiron Pizza Co.",
		menu = "SUPREME SLICE ... $8\nCHEESE SLICE .... $6\nCHIPS & SALSA ... $4",
		info = "Supreme slices loaded with toppings - the offensive line of pizzas.",
	},
	-- 3 DRINK BARS
	{
		step = 3,
		style = "bar",
		seg = "visitor",
		x0 = -74.5,
		x1 = -49.5,
		title = "Fizz Bar",
		menu = "SODA ............ $3\nLEMONADE ........ $4\nSLUSHIE ......... $4",
		info = "Ice-cold sodas and slushies. Pull up a stool and watch the game on the bar TV!",
		screen = "score",
	},
	{
		step = 3,
		style = "bar",
		seg = "home",
		x0 = -74.5,
		x1 = -49.5,
		title = "Sideline Sips",
		menu = "SPORTS DRINK .... $3\nWATER ........... $2\nICED TEA ........ $3",
		info = "The same sports drink the players chug on the sideline. Stay hydrated, fan!",
		use = "sportsdrink",
		screen = "score",
	},
	{
		step = 3,
		style = "bar",
		seg = "corner_ve",
		x0 = -29.5,
		x1 = -4.5,
		title = "Overtime Soda Bar",
		menu = "ROOT BEER ....... $3\nCHERRY FIZZ ..... $3\nFLOAT ........... $5",
		info = "Root beer floats so good they should go to overtime.",
		screen = "score",
	},
	{
		step = 3,
		style = "bar",
		seg = "corner_hw",
		x0 = -29.5,
		x1 = -4.5,
		title = "Two-Minute Refill",
		menu = "SODA ............ $3\nBIG GULP ........ $5\nREFILL .......... $1",
		info = "Refills in under two minutes - faster than a hurry-up offense!",
		screen = "gameday",
	},
	-- 4 GRILL & BBQ
	{
		step = 4,
		style = "grill",
		seg = "visitor",
		x0 = 81.5,
		x1 = 104,
		title = "Smokehouse 50",
		menu = "BBQ SANDWICH .... $9\nBURGER .......... $8\nCHICKEN TENDERS . $7",
		info = "Slow-smoked BBQ right on the 50-yard line of the concourse. Smell that smoke!",
		screen = "gameday",
	},
	{
		step = 4,
		style = "grill",
		seg = "home",
		x0 = -126.5,
		x1 = -104,
		title = "Tailgate Grill",
		menu = "CHEESEBURGER .... $8\nBBQ RIBS ........ $11\nCORN ON COB ..... $4",
		info = "A real tailgate grill inside the stadium. The ribs fall right off the bone!",
	},
	{
		step = 4,
		style = "grill",
		seg = "west",
		x0 = -52,
		x1 = -29.5,
		shareLeft = true,
		title = "Block & Tackle BBQ",
		menu = "PULLED PORK ..... $9\nBRISKET ......... $10\nMAC & CHEESE .... $5",
		info = "Brisket smoked for 12 hours - longer than a triple-overtime game.",
	},
	{
		step = 4,
		style = "grill",
		seg = "east",
		x0 = -52,
		x1 = -29.5,
		shareLeft = true,
		title = "Kickoff Burgers",
		menu = "DOUBLE BURGER ... $9\nVEGGIE BURGER ... $8\nFRIES ........... $4",
		info = "Burgers flipped higher than a coin toss. Try the double!",
	},
	-- 5 DESSERTS & SNACKS
	{
		step = 5,
		style = "dessert",
		seg = "visitor",
		x0 = 104,
		x1 = 126.5,
		shareLeft = true,
		title = "Sweet Spot",
		menu = "POPCORN ......... $4\nICE CREAM ....... $5\nMILKSHAKE ....... $6",
		info = "Popcorn, ice cream and the thickest milkshakes in the stadium.",
		screen = "gameday",
		shake = true,
	},
	{
		step = 5,
		style = "dessert",
		seg = "home",
		x0 = 52,
		x1 = 74.5,
		shareLeft = true,
		title = "The Scoop Zone",
		menu = "SUNDAE .......... $6\nCOTTON CANDY .... $4\nCARAMEL CORN .... $5",
		info = "Sundaes with sprinkles in team colours. Every scoop is a touchdown!",
		shake = true,
	},
	{
		step = 5,
		style = "dessert",
		seg = "corner_vw",
		x0 = -26.5,
		x1 = -4,
		title = "Popcorn Power",
		menu = "POPCORN ......... $4\nKETTLE CORN ..... $5\nCANDY BAG ....... $3",
		info = "Fresh popcorn popping all game long. Kettle corn is sweet AND salty!",
	},
	{
		step = 5,
		style = "dessert",
		seg = "corner_he",
		x0 = -26.5,
		x1 = -4,
		title = "Crunch Time Snacks",
		menu = "PRETZEL BITES ... $5\nCHURRO ......... $4\nCOOKIE .......... $3",
		info = "When the game gets tight, it's crunch time - churros and pretzel bites!",
	},
}

-- The 3D food icon at the left end of a stand's fascia (2 parts, no collisions, above head height).
local function standIcon(ctx, seg, kind, x)
	local y = (FASCIA_Y + 41.3) / 2
	local o = FRONT - 0.45
	if kind == "hotdog" then
		cyl(ctx, seg, "IconBun", x, y - 0.1, o, 4.2, 1.5, "x", BUN, nil, NO_COLLIDE)
		cyl(ctx, seg, "IconFrank", x, y + 0.35, o - 0.35, 5.2, 0.9, "x", FRANK, nil, NO_COLLIDE)
	elseif kind == "pizza" then
		-- a slice: a flat wedge (crust edge on top, tip at the bottom right) + the crust
		BuildUtil.Wedge(ctx, {
			Name = "IconPizzaSlice",
			Size = Vector3.new(0.3, 2.6, 3),
			CFrame = seg.base * CFrame.fromMatrix(Vector3.new(x, y - 0.25, -o), Vector3.new(0, 0, 1), Vector3.new(0, -1, 0)),
			Color = CHEESE,
			CanCollide = false,
		})
		span(ctx, seg, "IconPizzaCrust", x - 1.7, x + 1.7, o - 0.25, o + 0.25, y + 1.05, y + 1.65, BUN, nil, NO_COLLIDE)
	elseif kind == "cup" then
		cyl(ctx, seg, "IconCup", x, y - 0.3, o, 2.6, 1.8, "y", CUP_RED, nil, NO_COLLIDE)
		span(ctx, seg, "IconStraw", x + 0.2, x + 0.5, o - 0.15, o + 0.15, y + 0.9, y + 1.8, WHITE, nil, NO_COLLIDE)
	elseif kind == "flame" then
		ball(ctx, seg, "IconFlame", x, y, o, 2.2, GLOW_ORANGE, Enum.Material.Neon, NO_COLLIDE)
		ball(ctx, seg, "IconFlameCore", x, y - 0.3, o - 0.7, 1.2, GLOW_YELLOW, Enum.Material.Neon, NO_COLLIDE)
	else -- ice cream cone: a pink scoop on a diamond-shaped cone
		ball(ctx, seg, "IconScoop", x, y + 0.6, o, 1.9, PINK, nil, NO_COLLIDE)
		BuildUtil.Part(ctx, {
			Name = "IconCone",
			Size = Vector3.new(1.3, 1.3, 0.4),
			CFrame = at(seg, x, y - 0.6, o) * CFrame.Angles(0, 0, math.pi / 4),
			Color = CONE,
			CanCollide = false,
		})
	end
end

-- Cooking gear on the back counter (top at y 33.4): `gx` = centre of the gear zone at one end of
-- the stand, `other` = centre of the zone at the other end.
local function standGear(ctx, seg, spec, style, gx, other, team)
	local top = 33.4
	if style.gear == "roller" then
		span(ctx, seg, "RollerGrill", gx - 1.8, gx + 1.8, 81.8, 82.9, top, top + 0.9, DARK_METAL, Enum.Material.Metal)
		span(ctx, seg, "HotDogRow", gx - 1.6, gx + 1.6, 81.9, 82.8, top + 0.9, top + 1.2, FRANK)
	elseif style.gear == "oven" then
		span(ctx, seg, "PizzaOven", gx - 2.1, gx + 2.1, 81.5, 83, top, top + 4, BRICK, Enum.Material.Brick)
		span(ctx, seg, "OvenMouth", gx - 1.2, gx + 1.2, 81.4, 81.5, top + 0.6, top + 2, GLOW_ORANGE, Enum.Material.Neon, NO_COLLIDE)
		-- a fresh pizza on the counter, a stack of boxes ready to go behind it
		cyl(ctx, seg, "CounterPizza", other, 33.8, 79.6, 0.2, 2.6, "y", CHEESE)
		local boxes = span(ctx, seg, "PizzaBoxes", other - 1.3, other + 1.3, 81.75, 82.9, top, top + 1.2, CARDBOARD)
		write(boxes, INWARD, "HOT PIZZA", KETCHUP, { Top = 0.2, Height = 0.6, Font = Enum.Font.GothamBold, PPS = 24 })
	elseif style.gear == "fountain" then
		local fountain = span(ctx, seg, "SodaFountain", gx - 2, gx + 2, 81.8, 83, top, top + 3.6, team.Primary)
		write(fountain, INWARD, "ICE COLD", ink(team.Primary, team), { Top = 0.08, Height = 0.3 })
		span(ctx, seg, "DrinkFridge", other - 1.6, other + 1.6, 81.7, 83, top, top + 3.8, MIRROR, Enum.Material.Glass, {
			Transparency = 0.3,
		})
	elseif style.gear == "smoker" then
		cyl(ctx, seg, "Smoker", gx, top + 1.2, 81.8, 4.4, 2.2, "x", DARK_METAL, Enum.Material.Metal)
		cyl(ctx, seg, "SmokeStack", gx + 1.6, top + 3.3, 82.4, 2.6, 0.5, "y", DARK_METAL, Enum.Material.Metal)
		span(ctx, seg, "GrillGlow", other - 1.7, other + 1.7, 81.8, 82.9, top, top + 0.25, GLOW_ORANGE, Enum.Material.Neon)
	else -- desserts: popcorn machine behind the counter's Use (+ a milkshake machine)
		span(ctx, seg, "PopcornCart", other - 1.7, other + 1.7, 81.7, 83, top, top + 1.2, POPCORN_RED)
		span(ctx, seg, "PopcornGlass", other - 1.6, other + 1.6, 81.8, 82.9, top + 1.2, top + 3.8, POPCORN, Enum.Material.Glass, {
			Transparency = 0.15,
		})
		if spec.shake then
			local shaker = span(ctx, seg, "MilkshakeMachine", gx - 1.3, gx + 1.3, 81.8, 83, top, top + 3.2, PORCELAIN)
			write(shaker, INWARD, "SHAKES", PINK, { Top = 0.06, Height = 0.26 })
			BuildUtil.Use(ctx, shaker, "smoothie", {
				Action = "Get a milkshake",
				Object = spec.title,
				At = localPoint(ctx, shaker, seg, gx, 34.8, 80.2),
			})
		else
			-- (the stands without shakes swirl soft serve instead)
			local machine = span(ctx, seg, "SoftServeMachine", gx - 1.3, gx + 1.3, 81.8, 83, top, top + 3, PORCELAIN)
			write(machine, INWARD, "SOFT SERVE", PINK, { Top = 0.06, Height = 0.24 })
		end
	end
end

-- The stand kind's own touch at the +x end of its counter (top y 33.7; `x1` = the counter's end).
local function counterExtras(ctx, seg, style, x1, counterIn, team)
	local o = counterIn + 0.7
	if style.gear == "roller" then
		cyl(ctx, seg, "SauceBottle", x1 - 1, 34.3, o, 1.2, 0.45, "y", KETCHUP)
		cyl(ctx, seg, "SauceBottle", x1 - 1.6, 34.3, o, 1.2, 0.45, "y", MUSTARD)
	elseif style.gear == "oven" then
		-- a tray of nachos under a mound of melty cheese
		span(ctx, seg, "NachoTray", x1 - 2.4, x1 - 0.8, o - 0.55, o + 0.55, 33.7, 33.9, INK)
		cyl(ctx, seg, "NachoCheese", x1 - 1.6, 34.05, o, 0.3, 1.2, "y", CHEESE)
	elseif style.gear == "fountain" then
		cyl(ctx, seg, "CupStack", x1 - 1.2, 34.6, o, 1.8, 0.8, "y", team.Primary)
	elseif style.gear == "smoker" then
		span(ctx, seg, "BurgerBasket", x1 - 2.4, x1 - 0.8, o - 0.55, o + 0.55, 33.7, 34, CUP_RED)
		cyl(ctx, seg, "Burger", x1 - 1.6, 34.3, o, 0.6, 1, "y", BUN)
	elseif style.gear == "popcorn" then
		span(ctx, seg, "WaffleCones", x1 - 2, x1 - 0.6, o - 0.5, o + 0.5, 33.7, 34.5, CONE)
	end
end

--[[
	A condiment station against the portal wall across the lane from a hot dog stand (on one of
	Concourse.lua's "food" spots): a steel cabinet with napkins, ketchup + mustard pumps (look).
]]
local CONDIMENT_STATIONS = {
	{ seg = "visitor", x = -112 },
	{ seg = "home", x = 96 },
	{ seg = "west", x = -60 },
	{ seg = "east", x = -60 },
}

local function condimentStation(ctx, seg, x, team)
	local cabinet =
		span(ctx, seg, "CondimentStation", x - 1.4, x + 1.4, PORTAL_WALL, PORTAL_WALL + 1.6, 30, 33.2, STEEL, Enum.Material.Metal)
	local title = write(cabinet, OUTWARD, "CONDIMENTS", ink(STEEL, team), { Top = 0.08, Height = 0.16, Font = Enum.Font.GothamBold })
	addLine(title, "NAPKINS  -  STRAWS  -  LIDS", 0.1, 0.3, 0.8, 0.1, Enum.Font.GothamBold, INK)
	for index, color in ipairs({ KETCHUP, MUSTARD }) do
		cyl(ctx, seg, "CondimentPump", x + (index == 1 and -0.6 or 0.6), 33.85, PORTAL_WALL + 0.8, 1.3, 0.6, "y", color)
	end
	BuildUtil.Look(cabinet, "Condiment Station", "Ketchup, mustard, relish and onions. Build the ultimate stadium hot dog!", {
		At = localPoint(ctx, cabinet, seg, x, 33.8, PORTAL_WALL + 2.4),
	})
end

local function foodStand(ctx, seg, spec, team, cameraFrom)
	local style = STYLES[spec.style]
	local x0, x1 = spec.x0, spec.x1
	local cx, width = (x0 + x1) / 2, x1 - x0
	local title = spec.title:upper()
	local inner0, inner1 = spec.shareLeft and x0 or x0 + 0.6, x1 - 0.6
	local ceiling = 41.3

	-- housing: side walls in the stand's colours up to the ceiling
	if not spec.shareLeft then
		span(ctx, seg, "StandWall", x0, inner0, FRONT, BACK, 30, ceiling, style.wall, style.wallMaterial)
	end
	span(ctx, seg, "StandWall", inner1, x1, FRONT, BACK, 30, ceiling, style.wall, style.wallMaterial)

	-- fascia (team colour) with the name; some stands have a live screen at its right end
	local signEnd = spec.screen and (inner1 - 6.4) or inner1
	local fascia = span(ctx, seg, "StandSign", inner0, signEnd, FRONT, FRONT + 0.8, FASCIA_Y, ceiling, team.Primary)
	local iconSpace = 4.6 / (signEnd - inner0)
	write(fascia, INWARD, title, ink(team.Primary, team), {
		Glow = true,
		Left = iconSpace,
		Width = 1 - iconSpace - 0.03,
		Top = 0.16,
		Height = 0.68,
	})
	standIcon(ctx, seg, style.icon, inner0 + 2.4)
	if spec.screen then
		local screen = span(ctx, seg, "StandScreen", signEnd, inner1, FRONT, FRONT + 0.8, FASCIA_Y, ceiling, SCREEN)
		liveScreen(screen, INWARD, spec.screen, LIVE_PLACEHOLDER[spec.screen])
	end

	-- counter (Use) with a steel top; bars stand further forward with stools in front
	local counterIn = style.bar and 78.4 or 79
	local counter = span(
		ctx,
		seg,
		style.bar and "BarCounter" or "Counter",
		inner0,
		inner1,
		counterIn,
		counterIn + 1.4,
		30,
		33.4,
		style.counter,
		style.counterMaterial
	)
	write(counter, INWARD, style.bar and "PULL UP A STOOL" or "ORDER HERE", plain(style.counter), {
		Top = 0.18,
		Height = 0.3,
		Left = 0.3,
		Width = 0.4,
		Font = Enum.Font.GothamBold,
	})
	span(ctx, seg, "CounterTop", inner0, inner1, counterIn - 0.25, counterIn + 1.5, 33.4, 33.7, STEEL, Enum.Material.Metal)
	local useX = cx - width / 4
	if style.bar then
		useX = cx + width / 4 + 1
	end
	BuildUtil.Use(ctx, counter, spec.use or style.use, {
		Action = style.action,
		Object = spec.title,
		At = localPoint(ctx, counter, seg, useX, 34.6, counterIn - 0.6),
	})
	-- the register right behind the order spot (beside it toward the middle: clear of the counter
	-- pizza and the bar's cups), the kind's own touch at the counter's +x end
	local tillX = style.bar and useX - 0.6 or useX + 0.6
	till(ctx, seg, tillX - 0.7, tillX + 0.7, counterIn + 0.25, counterIn + 1.15, 33.7)
	counterExtras(ctx, seg, style, inner1, counterIn, team)

	-- the stand's own back wall (tiles / brick / dark bar wall over the concourse wall), the steel
	-- back counter + gear at both ends, menu board in the middle of the back wall
	span(ctx, seg, "StandBackWall", inner0, inner1, BACK - 0.1, BACK, 30, ceiling, style.back, style.backMaterial)
	span(ctx, seg, "BackCounter", inner0, inner1, 81.6, BACK, 30, 33.4, STEEL, Enum.Material.Metal)
	local zone = (inner1 - inner0) / 2 - 3.2 -- gear zone centres, from cx
	standGear(ctx, seg, spec, style, cx + zone, cx - zone, team)
	local menuHalf = math.min(5.6, zone - 2.4)
	local menu = span(ctx, seg, "MenuBoard", cx - menuHalf, cx + menuHalf, 82.7, BACK, 34.4, 37.8, SIGN_DARK)
	local heading = write(menu, INWARD, "- MENU -", ink(SIGN_DARK, team), { Glow = true, Top = 0.05, Height = 0.2 })
	addLine(heading, spec.menu, 0.05, 0.3, 0.9, 0.64, Enum.Font.Code, MENU_TEXT)
	BuildUtil.Look(menu, spec.title .. " Menu", spec.info, {
		At = localPoint(ctx, menu, seg, cx + (style.bar and 0 or 2.5), 35, 80.6),
	})
	lamp(menu, 16, 1.2)

	if style.bar then
		-- three bar stools facing the bar; the first one shows the game like a TV
		for index, dx in ipairs({ -8.5, -5.2, -1.9 }) do
			cyl(ctx, seg, "BarStoolPost", cx + dx, 31.15, 77.2, 2.3, 0.45, "y", DARK_METAL, Enum.Material.Metal)
			BuildUtil.Seat(ctx, {
				Name = "BarStool",
				Size = Vector3.new(1.6, 0.5, 1.6),
				CFrame = at(seg, cx + dx, 32.55, 77.2),
				Color = team.Primary,
				Object = index == 1 and "Bar TV Stool" or "Bar Stool",
				Camera = index == 1 and {
					From = cameraFrom,
					To = Vector3.new(0, 4, 30),
					Fov = 55,
					Label = "CONCOURSE BAR TV",
				} or nil,
			})
		end
	else
		-- a steel queue rail down the middle of the alcove (two lines)
		span(ctx, seg, "QueueRail", cx - 0.1, cx + 0.1, FRONT + 0.2, counterIn - 0.3, 30, 33.2, STEEL, Enum.Material.Metal)
	end
end

function ConcourseShops.concourse_food(ctx)
	local L = ctx.config.Layout
	local team = ctx.colors
	local segs = ringSegments(L)
	for step = 1, 5 do
		BuildUtil.Stage(ctx, step)
		for _, spec in ipairs(STANDS) do
			if spec.step == step then
				local seg = segs[spec.seg]
				-- the bar TV: a broadcast view from above this side of the bowl
				local cameraFrom = at(seg, 0, 70, 30).Position
				foodStand(ctx, seg, spec, team, cameraFrom)
			end
		end
		if step == 1 then
			for _, spot in ipairs(CONDIMENT_STATIONS) do
				condimentStation(ctx, segs[spot.seg], spot.x, team)
			end
		end
	end
end

---------------------------------------------------------------------------------------------
-- CONCOURSE RESTROOMS
---------------------------------------------------------------------------------------------

-- fountain = x of the drinking fountain (+ fountainBack: the offset it stands against: a column
-- face 80.6 or the outer wall 83), sign = x of the hanging blade sign (over a column line)
local RESTROOM_BLOCKS = {
	{ seg = "visitor", x = 149.5, fountain = 130, fountainBack = 80.6, sign = 130 },
	{ seg = "home", x = 149.5, fountain = 130, fountainBack = 80.6, sign = 130 },
	{ seg = "west", x = 45.6, fountain = 26, fountainBack = 80.6, sign = 26 },
	{ seg = "east", x = 45.6, fountain = 26, fountainBack = 80.6, sign = 26 },
}
-- (the family fountains stand against the wall beside the room: the column at -130 already has
-- the concourse TV's look prompt)
local FAMILY_ROOMS = {
	{ seg = "visitor", x = -159.1, fountain = -150.4, fountainBack = 83, sign = -130 },
	{ seg = "home", x = -159.1, fountain = -150.4, fountainBack = 83, sign = -130 },
}

local ROOM_WALL_IN = FRONT + 0.6 -- front walls 76.2..76.8
local ROOM_HEAD_Y = 38.2 -- door heads (doors 8 tall) / bottom of the sign bands

-- One room of a restroom block. s = -1 (women, toward -x) or 1 (men, toward +x); a = distance
-- from the block's middle wall.
local function restroomRoom(ctx, seg, cx, s, men)
	local function u(a)
		return cx + s * a
	end
	local function spanU(name, a0, a1, o0, o1, y0, y1, color, material, extra)
		return span(ctx, seg, name, math.min(u(a0), u(a1)), math.max(u(a0), u(a1)), o0, o1, y0, y1, color, material, extra)
	end
	-- stalls along the back wall next to the middle wall (simple: dividers + toilets)
	spanU("StallDivider", 3.8, 4, 80.6, BACK, 30.6, 37.4, STEEL, Enum.Material.Metal)
	spanU("StallDivider", 7.5, 7.7, 80.6, BACK, 30.6, 37.4, STEEL, Enum.Material.Metal)
	spanU("Toilet", 1.4, 2.8, 81.4, BACK, 30, 31.6, PORCELAIN)
	if men then
		for _, a in ipairs({ 5, 6.6 }) do
			spanU("Urinal", a - 0.5, a + 0.5, 82.3, BACK, 31.2, 33.8, PORCELAIN)
		end
		spanU("UrinalDivider", 5.7, 5.9, 81.6, BACK - 0.1, 31, 34.8, STEEL, Enum.Material.Metal)
	else
		spanU("Toilet", 5.1, 6.5, 81.4, BACK, 30, 31.6, PORCELAIN)
	end
	-- wall-hung sinks + mirror on the back wall, outside the door's swing (the leaf is hinged at
	-- a = 14.4 and sweeps everything closer than 6.2 to the hinge before it lies along the side wall)
	spanU("SinkCounter", 8.4, 11.2, 82, BACK, 30, 33, PORCELAIN)
	local mirror = spanU("Mirror", 8.4, 11.2, 82.8, BACK, 34, 37.6, MIRROR, Enum.Material.Glass, { Reflectance = 0.35 })
	-- a hand dryer beside the mirror (just outside the door's swing: 6.2 from its hinge)
	spanU("HandDryer", 11.3, 12.3, 82.4, BACK - 0.1, 33.8, 35.4, STEEL, Enum.Material.Metal)
	BuildUtil.Look(
		mirror,
		"Mirror",
		men and "Looking sharp! Fix your team cap before the second half." or "Looking great! Time to touch up that face paint.",
		{ At = localPoint(ctx, mirror, seg, u(9.8), 34.5, 80.6) }
	)
	local light = spanU("RestroomLight", 4, 11, 78.4, 81.4, 40.95, 41.25, NEON, Enum.Material.Neon, NO_COLLIDE)
	lamp(light, 16, 1.1)
end

local function restroomBlock(ctx, seg, cx, team)
	local half = 15.6
	-- front wall: three pieces between/around the two doorways, under a sign band
	for _, p in ipairs({ { -half, -14.4 }, { -8.2, 8.2 }, { 14.4, half } }) do
		span(ctx, seg, "RestroomFrontWall", cx + p[1], cx + p[2], FRONT, ROOM_WALL_IN, 30, ROOM_HEAD_Y, TILE_WALL)
	end
	local band = span(ctx, seg, "RestroomSign", cx - half, cx + half, FRONT, ROOM_WALL_IN, ROOM_HEAD_Y, 41.3, team.Primary)
	local signInk = ink(team.Primary, team)
	-- (on the lane-facing face the GUI runs from the block's -x end to its +x end)
	local women = write(band, INWARD, "WOMEN", signInk, { Glow = true, Left = 1.2 / 31.2, Width = 6.2 / 31.2, Top = 0.2, Height = 0.6 })
	addLine(women, "RESTROOMS", 0.31, 0.12, 0.38, 0.76)
	addLine(women, "MEN", 23.8 / 31.2, 0.2, 6.2 / 31.2, 0.6)
	BuildUtil.Look(band, "Restrooms", "Beat the halftime rush! Women's room on the left, men's room on the right.", {
		At = localPoint(ctx, band, seg, cx, 34.5, FRONT - 0.6),
	})
	-- side walls + the middle wall, floor tiles and a tiled back wall over the concourse wall
	-- (both rooms share them)
	span(ctx, seg, "RestroomTiles", cx - half + 0.6, cx + half - 0.6, ROOM_WALL_IN, BACK, 30, 30.04, TILE, nil, PAINT)
	span(ctx, seg, "RestroomBackTiles", cx - half + 0.6, cx + half - 0.6, BACK - 0.1, BACK, 30, 41.3, TILE)
	span(ctx, seg, "RestroomWall", cx - half, cx - half + 0.6, ROOM_WALL_IN, BACK, 30, 41.3, TILE_WALL)
	span(ctx, seg, "RestroomWall", cx + half - 0.6, cx + half, ROOM_WALL_IN, BACK, 30, 41.3, TILE_WALL)
	span(ctx, seg, "RestroomWall", cx - 0.3, cx + 0.3, ROOM_WALL_IN, BACK, 30, 41.3, TILE_WALL)
	-- team-colour tiles: a kick band along the front wall between the doors and a stripe across
	-- the back wall over the mirrors (through the middle wall into both rooms)
	span(ctx, seg, "RestroomKickBand", cx - 8.2, cx + 8.2, FRONT - 0.06, FRONT, 30, 32.8, team.Primary, nil, PAINT)
	span(ctx, seg, "RestroomTileStripe", cx - half + 0.6, cx + half - 0.6, BACK - 0.16, BACK - 0.1, 38.2, 38.7, team.Primary, nil, PAINT)
	for _, s in ipairs({ -1, 1 }) do
		local men = s > 0
		-- doors swing into the rooms (the door's front, -Z, points outward = into the room);
		-- hinged at the outer end so the open leaf lies along the side wall
		BuildUtil.Door(ctx, {
			Name = men and "MensRoomDoor" or "WomensRoomDoor",
			Size = Vector3.new(6.2, 8, 0.3),
			CFrame = at(seg, cx + s * 11.3, 34, FRONT + 0.3),
			Hinge = men and "Right" or "Left",
			Color = team.Primary,
			Material = Enum.Material.SmoothPlastic,
			Object = men and "Men's Restroom" or "Women's Restroom",
			Title = men and "Men's Restroom" or "Women's Restroom",
			Info = "Clean, bright and ready for game day.",
		})
		restroomRoom(ctx, seg, cx, s, men)
	end
end

local function familyRestroom(ctx, seg, cx, team)
	local half = 6.3
	-- the doorway (cx - 5.5 .. cx + 0.7) is at the -x end: its door opens flat against the side
	-- wall (90 degrees), clear of the toilet and the sink
	for _, p in ipairs({ { -half, -5.5 }, { 0.7, half } }) do
		span(ctx, seg, "RestroomFrontWall", cx + p[1], cx + p[2], FRONT, ROOM_WALL_IN, 30, ROOM_HEAD_Y, TILE_WALL)
	end
	local band = span(ctx, seg, "FamilyRestroomSign", cx - half, cx + half, FRONT, ROOM_WALL_IN, ROOM_HEAD_Y, 41.3, accent(team))
	local title = write(band, INWARD, "FAMILY RESTROOM", ink(accent(team), team), { Glow = true, Top = 0.12, Height = 0.5 })
	addLine(title, "EVERYONE WELCOME", 0.05, 0.64, 0.9, 0.26, Enum.Font.GothamBold)
	span(ctx, seg, "RestroomWall", cx - half, cx - half + 0.6, ROOM_WALL_IN, BACK, 30, 41.3, TILE_WALL)
	span(ctx, seg, "RestroomWall", cx + half - 0.6, cx + half, ROOM_WALL_IN, BACK, 30, 41.3, TILE_WALL)
	BuildUtil.Door(ctx, {
		Name = "FamilyRestroomDoor",
		Size = Vector3.new(6.2, 8, 0.3),
		CFrame = at(seg, cx - 2.4, 34, FRONT + 0.3),
		Hinge = "Left",
		Swing = 90,
		Color = accent(team),
		Material = Enum.Material.SmoothPlastic,
		Object = "Family Restroom",
		Title = "Family Restroom",
		Info = "A big private restroom for families, with a baby changing table.",
	})
	span(ctx, seg, "RestroomTiles", cx - half + 0.6, cx + half - 0.6, ROOM_WALL_IN, BACK, 30, 30.04, TILE, nil, PAINT)
	span(ctx, seg, "RestroomBackTiles", cx - half + 0.6, cx + half - 0.6, BACK - 0.1, BACK, 30, 41.3, TILE)
	-- accent tiles like the door, unless the accent is as pale as the tiles (silver, white)
	local band = accent(team)
	if similar(band, TILE_WALL) then
		band = team.Primary
	end
	span(ctx, seg, "RestroomKickBand", cx + 0.7, cx + half, FRONT - 0.06, FRONT, 30, 32.8, band, nil, PAINT)
	span(ctx, seg, "RestroomTileStripe", cx - half + 0.6, cx + half - 0.6, BACK - 0.16, BACK - 0.1, 38.2, 38.7, band, nil, PAINT)
	span(ctx, seg, "Toilet", cx - 0.6, cx + 0.8, 81.4, BACK, 30, 31.6, PORCELAIN)
	span(ctx, seg, "SinkCounter", cx + 2.2, cx + half - 0.6, 81.4, BACK, 30, 33, PORCELAIN)
	span(ctx, seg, "Mirror", cx + 2.4, cx + half - 0.8, 82.8, BACK, 34, 37.6, MIRROR, Enum.Material.Glass, { Reflectance = 0.35 })
	span(ctx, seg, "PaperTowels", cx + 1, cx + 2, 82.4, BACK - 0.1, 33.8, 35.6, STEEL, Enum.Material.Metal)
	-- a fold-down baby changing table on the side wall
	local changer = span(ctx, seg, "ChangingTable", cx + half - 2.4, cx + half - 0.6, 77.8, 80.4, 32.6, 33.2, Color3.fromRGB(150, 205, 235))
	BuildUtil.Look(changer, "Baby Changing Station", "A fold-down table for the littlest fans. Even future quarterbacks need diapers!", {
		At = localPoint(ctx, changer, seg, cx + 3.8, 34, 79.1),
	})
	local light = span(ctx, seg, "RestroomLight", cx - 3, cx + 3, 78.4, 81.4, 40.95, 41.25, NEON, Enum.Material.Neon, NO_COLLIDE)
	lamp(light, 16, 1.1)
end

-- A drinking fountain standing against `back` (a column's face - its TV hangs above from y 35.6 -
-- or the outer wall), with a bottle filler above it whose little screen counts the bottles saved.
local function waterFountain(ctx, seg, x, back, team)
	local body = span(ctx, seg, "WaterFountain", x - 1, x + 1, back - 1.3, back - 0.1, 30, 32.9, STEEL, Enum.Material.Metal)
	span(ctx, seg, "FountainBowl", x - 1.1, x + 1.1, back - 1.5, back - 0.1, 32.9, 33.2, team.Primary)
	local filler = span(ctx, seg, "BottleFiller", x - 0.9, x + 0.9, back - 0.45, back - 0.1, 33.3, 35.5, STEEL, Enum.Material.Metal)
	local _, counter = BuildUtil.SurfaceText(filler, INWARD, "BOTTLES SAVED\n12,345", {
		LabelName = "BottleCounter",
		TextColor3 = FILLER_TEXT,
		BackgroundColor3 = SCREEN,
		BackgroundTransparency = 0,
		Font = Enum.Font.Code,
		PixelsPerStud = 32,
		LightInfluence = 0,
	})
	counter.Position = UDim2.new(0.12, 0, 0.08, 0)
	counter.Size = UDim2.new(0.76, 0, 0.24, 0)
	BuildUtil.Look(
		body,
		"Water Fountain",
		"Free, ice-cold water! Fill your bottle up top - its little screen counts every bottle fans have saved.",
		{ At = localPoint(ctx, body, seg, x, 34, back - 2) }
	)
end

-- A two-sided blade sign hanging from the ceiling on a column line, over the lane's outer edge in
-- front of the stand fronts (so neither face looks into a stand's side wall); its bottom stays
-- above the lane's head room (y 39) and it doesn't collide.
local function bladeSign(ctx, seg, x, text, team)
	local sign = span(ctx, seg, "WayfindingSign", x - 0.15, x + 0.15, 72.7, 76, 39.6, 41.3, team.Primary, nil, NO_COLLIDE)
	local color = ink(team.Primary, team)
	write(sign, TOWARD_MINUS_X, text, color, { Glow = true, Top = 0.12, Height = 0.76 })
	write(sign, TOWARD_PLUS_X, text, color, { Glow = true, Top = 0.12, Height = 0.76 })
	return sign
end

function ConcourseShops.concourse_restrooms(ctx)
	local L = ctx.config.Layout
	local team = ctx.colors
	local segs = ringSegments(L)

	-- 1 RESTROOMS
	BuildUtil.Stage(ctx, 1)
	for _, spec in ipairs(RESTROOM_BLOCKS) do
		restroomBlock(ctx, segs[spec.seg], spec.x, team)
	end

	-- 2 FAMILY RESTROOMS
	BuildUtil.Stage(ctx, 2)
	for _, spec in ipairs(FAMILY_ROOMS) do
		familyRestroom(ctx, segs[spec.seg], spec.x, team)
	end

	-- 3 WATER FOUNTAINS & SIGNS
	BuildUtil.Stage(ctx, 3)
	for _, spec in ipairs(RESTROOM_BLOCKS) do
		waterFountain(ctx, segs[spec.seg], spec.fountain, spec.fountainBack, team)
		bladeSign(ctx, segs[spec.seg], spec.sign, "RESTROOMS", team)
	end
	for _, spec in ipairs(FAMILY_ROOMS) do
		waterFountain(ctx, segs[spec.seg], spec.fountain, spec.fountainBack, team)
		bladeSign(ctx, segs[spec.seg], spec.sign, "FAMILY RESTROOM", team)
	end
end

---------------------------------------------------------------------------------------------
-- CONCOURSE MERCH
---------------------------------------------------------------------------------------------

local PRO_SHOP = { seg = "visitor", x = 52 } -- bay 29.5..74.5, right next to Gate A
local KIOSKS = {
	{ seg = "visitor", x = 16.5, star = "roster:WR", number = "88", title = "Star Receiver Jersey" },
	{ seg = "home", x = 16.5, star = "roster:RB", number = "22", title = "Star Running Back Jersey" },
	{ seg = "west", x = 16.5, star = "roster:DEF", number = "55", title = "Star Defender Jersey" },
	{ seg = "east", x = 16.5, star = "roster:K", number = "3", title = "Star Kicker Jersey" },
}
local CARTS = {
	{ seg = "visitor", x = -38.5 },
	{ seg = "home", x = -38.5 },
	{ seg = "west", x = -88.5 },
	{ seg = "east", x = -88.5 },
	-- right inside every gate, across from its jersey kiosk (team-colour carts)
	{ seg = "visitor", x = -16.5, gate = true },
	{ seg = "home", x = -16.5, gate = true },
	{ seg = "west", x = -16.5, gate = true },
	{ seg = "east", x = -16.5, gate = true },
}

-- A giant foam finger (palm + pointing finger), its front facing the lane.
local function foamFinger(ctx, seg, x, y0, o, color, team)
	local palm = span(ctx, seg, "FoamFingerHand", x - 0.9, x + 0.9, o - 0.35, o + 0.35, y0, y0 + 1.6, color)
	span(ctx, seg, "FoamFingerPoint", x - 0.3, x + 0.3, o - 0.25, o + 0.25, y0 + 1.6, y0 + 3.4, color)
	write(palm, INWARD, "#1", ink(color, team), { Top = 0.15, Height = 0.7 })
	return palm
end

local function proShop(ctx, seg, cx, team)
	local half = 22.5
	local function x(u)
		return cx + u
	end
	local name = teamLabel(ctx)
	local glassIn = 76.9 -- storefront glass 76.9..77.3 (the sliding doors run in front of it)
	local inside = 77.3
	local wallColor = team.Primary

	-- floor, back wall (over the concourse wall), side walls, sign band
	span(ctx, seg, "ProShopFloor", x(-half + 0.6), x(half - 0.6), inside, BACK, 30, 30.04, SHOP_FLOOR, Enum.Material.WoodPlanks, PAINT)
	span(ctx, seg, "ProShopBackWall", x(-half + 0.6), x(half - 0.6), BACK - 0.1, BACK, 30, 41.3, SHOP_WALL)
	span(ctx, seg, "ProShopWall", x(-half), x(-half + 0.6), FRONT, BACK, 30, 41.3, STAND_DARK)
	span(ctx, seg, "ProShopWall", x(half - 0.6), x(half), FRONT, BACK, 30, 41.3, STAND_DARK)
	local band = span(ctx, seg, "ProShopSign", x(-half + 0.6), x(half - 0.6), FRONT, inside, 38, 41.3, wallColor)
	local bandInk = ink(wallColor, team)
	local title = write(band, INWARD, name .. " PRO SHOP", bandInk, { Glow = true, Left = 0.2, Width = 0.6, Top = 0.1, Height = 0.62 })
	addLine(title, "OFFICIAL TEAM GEAR", 0.3, 0.72, 0.4, 0.22, Enum.Font.GothamBold)
	BuildUtil.Look(band, "Pro Shop", "Jerseys, caps, hoodies and foam fingers - everything a true fan needs!", {
		At = localPoint(ctx, band, seg, x(-12), 34.5, FRONT - 0.6),
	})

	-- glass storefront + sliding glass doors in the middle
	for _, p in ipairs({ { -half + 0.6, -3.5 }, { 3.5, half - 0.6 } }) do
		span(ctx, seg, "ShopWindow", x(p[1]), x(p[2]), glassIn, inside, 30, 38, GLASS, Enum.Material.Glass, { Transparency = 0.55 })
	end
	BuildUtil.Door(ctx, {
		Name = "ProShopDoors",
		Size = Vector3.new(7, 8, 0.3),
		CFrame = at(seg, cx, 34, 76.55),
		Double = true,
		Slide = true,
		Color = GLASS,
		Material = Enum.Material.Glass,
		Transparency = 0.45,
		Object = "Pro Shop",
		Title = "Pro Shop",
		Info = "Come on in - the whole team's gear is inside!",
	})

	-- window display: two mannequins in home and away jerseys (left end)
	for index, u in ipairs({ -20, -17 }) do
		cyl(ctx, seg, "MannequinStand", x(u), 30.15, 78.2, 0.3, 1.4, "y", DARK_METAL, Enum.Material.Metal)
		local color = index == 1 and team.Primary or team.Trim
		span(ctx, seg, "MannequinJersey", x(u - 0.9), x(u + 0.9), 77.8, 78.6, 30.3, 34.2, color, Enum.Material.Fabric)
		ball(ctx, seg, "MannequinHead", x(u), 34.75, 78.2, 1.1, SKIN)
	end
	-- live "starting lineup" screen on the back wall behind the mannequins
	local lineup = span(ctx, seg, "LineupScreen", x(-21.6), x(-16), 82.7, BACK, 33.4, 39.6, SCREEN)
	liveScreen(lineup, INWARD, "roster", LIVE_PLACEHOLDER.roster)

	-- cap wall: a backing panel, two shelves, a row of caps on each
	span(ctx, seg, "CapWall", x(-15.4), x(-8.4), 82.6, BACK, 31, 39.6, accent(team))
	for index, y in ipairs({ 33.2, 36.2 }) do
		span(ctx, seg, "CapShelf", x(-15.2), x(-8.6), 81.6, 82.6, y, y + 0.2, STEEL, Enum.Material.Metal)
		local capColor = index == 1 and team.Primary or team.Trim
		span(ctx, seg, "CapRow", x(-14.8), x(-9), 81.8, 82.5, y + 0.2, y + 1.1, capColor, Enum.Material.Fabric)
	end

	-- jersey wall facing the doors: the star QB jersey in the middle
	local wall = span(ctx, seg, "JerseyWall", x(-7.4), x(7.4), 82.6, BACK, 31, 40.8, wallColor)
	write(wall, INWARD, "JERSEY WALL", bandInk, { Top = 0.02, Height = 0.09, Glow = true })
	local star = jersey(ctx, seg, cx, 39.4, 82.4, 1.25, team.Trim, "1", team)
	BuildUtil.Look(star, "Star Quarterback Jersey", "The best-selling jersey in the stadium! It belongs to your starting QB.", {
		LookKey = "roster:QB",
		At = localPoint(ctx, star, seg, cx, 35, 80.4),
	})
	jersey(ctx, seg, x(-5), 39, 82.4, 0.85, accent(team), "12", team)
	jersey(ctx, seg, x(5), 39, 82.4, 0.85, accent(team), "7", team)
	-- hoodie rack under the jerseys
	span(ctx, seg, "HoodieRail", x(-6), x(6), 81.9, 82.1, 34.4, 34.6, STEEL, Enum.Material.Metal)
	span(ctx, seg, "Hoodies", x(-5.6), x(5.6), 81.6, 82.5, 31.4, 34.4, HEATHER, Enum.Material.Fabric)

	-- foam finger bin (Use)
	local bin = span(ctx, seg, "FoamFingerBin", x(8.2), x(13.4), 81.6, BACK, 30, 32.6, accent(team))
	write(bin, INWARD, "FOAM FINGERS", ink(accent(team), team), { Top = 0.2, Height = 0.6 })
	foamFinger(ctx, seg, x(9.5), 32.6, 82.1, team.Primary, team)
	foamFinger(ctx, seg, x(12.1), 32.6, 82.3, team.Trim, team)
	BuildUtil.Use(ctx, bin, "foamfinger", {
		Object = "Pro Shop",
		At = localPoint(ctx, bin, seg, x(10.8), 34, 80.4),
	})

	-- checkout counter across the right end (staff behind it)
	span(ctx, seg, "CheckoutCounter", x(16.4), x(18), 78.2, 82, 30, 33.4, wallColor)
	span(ctx, seg, "CheckoutTop", x(16.2), x(18.2), 78, 82.2, 33.4, 33.7, STEEL, Enum.Material.Metal)
	local register = span(ctx, seg, "CashRegister", x(16.6), x(17.8), 79.4, 80.6, 33.7, 34.7, DARK_METAL)
	BuildUtil.Look(register, "Checkout", "Ka-ching! Every jersey sold here helps your franchise grow.", {
		At = localPoint(ctx, register, seg, x(15.4), 34.6, 80),
	})
	-- a card reader in front of the till, a team shopping bag ready to go, and mini helmets on a
	-- shelf on the wall behind the counter
	span(ctx, seg, "CardReader", x(16.8), x(17.4), 78.5, 79.1, 33.7, 34.05, INK)
	local bag = span(ctx, seg, "ShoppingBag", x(16.7), x(17.9), 81, 81.9, 33.7, 35.1, wallColor)
	write(bag, TOWARD_MINUS_X, name, ink(wallColor, team), { Top = 0.3, Height = 0.4, Font = Enum.Font.GothamBold })
	span(ctx, seg, "HelmetShelf", x(18.6), x(21.7), 82, 82.9, 36.4, 36.6, STEEL, Enum.Material.Metal)
	for index, u in ipairs({ 19.4, 20.9 }) do
		ball(ctx, seg, "MiniHelmet", x(u), 37.2, 82.3, 1.2, index == 1 and team.Primary or accent(team))
	end

	-- a big felt pennant on each (dark) side wall, pointing at the storefront (two wedges: upper and
	-- lower half, meeting at y 38.6; the pole edge at offset 81.6, the tip at 78.6)
	for _, u in ipairs({ -21.84, 21.84 }) do
		for _, flip in ipairs({ false, true }) do
			BuildUtil.Wedge(ctx, {
				Name = "Pennant",
				Size = Vector3.new(0.12, 0.8, 3),
				CFrame = at(seg, x(u), flip and 38.2 or 39, 80.1)
					* CFrame.Angles(0, math.pi, 0)
					* (flip and CFrame.Angles(0, 0, math.pi) or CFrame.new()),
				Color = ink(STAND_DARK, team),
				Material = Enum.Material.Fabric,
			})
		end
	end

	-- a shelf of footballs over the foam finger bin
	span(ctx, seg, "FootballShelf", x(8.4), x(13.2), 81.9, 82.9, 37, 37.2, STEEL, Enum.Material.Metal)
	for _, u in ipairs({ 9.2, 10.8, 12.4 }) do
		football(ctx, seg, "ShelfFootball", x(u), 37.6, 82.4, 1.3, 0.8)
	end

	-- the signed game ball in a glass case in the window (look: your record)
	local plinth = span(ctx, seg, "DisplayCase", x(-13.2), x(-10.4), 77.5, 78.9, 30, 32.4, wallColor)
	span(ctx, seg, "DisplayGlass", x(-13.1), x(-10.5), 77.6, 78.8, 32.4, 34.6, GLASS, Enum.Material.Glass, { Transparency = 0.6 })
	football(ctx, seg, "SignedBall", x(-11.8), 32.83, 78.2, 1.4, 0.85)
	BuildUtil.Look(plinth, "Signed Game Ball", "Signed by the whole team after a big win. Not for sale - sorry!", {
		LookKey = "record",
		At = localPoint(ctx, plinth, seg, x(-11.8), 33.4, 79.8),
	})

	-- ceiling light panels
	for _, u in ipairs({ -13, 0, 13 }) do
		local panel = span(ctx, seg, "ProShopLight", x(u - 3), x(u + 3), 78.6, 81.4, 40.95, 41.25, NEON, Enum.Material.Neon, NO_COLLIDE)
		lamp(panel, 18, 1.2)
	end
end

local function jerseyKiosk(ctx, seg, spec, team)
	local cx = spec.x
	local half = 5.8
	-- back display panel with three jerseys
	local panel = span(ctx, seg, "KioskPanel", cx - half + 0.4, cx + half - 0.4, 82.5, BACK, 30, 39.2, team.Primary)
	write(panel, INWARD, "OFFICIAL JERSEYS", ink(team.Primary, team), { Top = 0.03, Height = 0.08, Glow = true })
	local star = jersey(ctx, seg, cx, 38.6, 82.3, 1, team.Trim, spec.number, team)
	jersey(ctx, seg, cx - 3.9, 38, 82.3, 0.65, accent(team), spec.number, team)
	jersey(ctx, seg, cx + 3.9, 38, 82.3, 0.65, accent(team), spec.number, team)
	BuildUtil.Look(star, spec.title, "Wear your favourite player's number! This kiosk sells the jersey of your current star.", {
		LookKey = spec.star,
		At = localPoint(ctx, star, seg, cx, 35, 79.4),
	})
	-- counter
	local counter = span(ctx, seg, "KioskCounter", cx - 4.6, cx + 4.6, 78.8, 80.2, 30, 33.4, accent(team))
	write(counter, INWARD, "JERSEYS", ink(accent(team), team), { Top = 0.2, Height = 0.5, Left = 0.2, Width = 0.6 })
	span(ctx, seg, "KioskCounterTop", cx - 4.8, cx + 4.8, 78.6, 80.4, 33.4, 33.7, STEEL, Enum.Material.Metal)
	-- a till at one end of the counter, a football at the other
	till(ctx, seg, cx - 3.9, cx - 2.5, 79, 79.9, 33.7)
	football(ctx, seg, "CounterFootball", cx + 3.2, 34.1, 79.5, 1.3, 0.8)
	-- canopy on two posts, with a name sign along its front edge
	for _, s in ipairs({ -1, 1 }) do
		cyl(ctx, seg, "KioskPost", cx + s * (half - 0.4), 34.7, 78.1, 9.4, 0.4, "y", STEEL, Enum.Material.Metal)
	end
	span(ctx, seg, "KioskCanopy", cx - half, cx + half, 77.8, BACK, 39.4, 39.8, team.Primary)
	local sign = span(ctx, seg, "KioskSign", cx - half, cx + half, 77.4, 77.8, 39.2, 41.2, SIGN_DARK)
	write(sign, INWARD, teamLabel(ctx) .. " JERSEYS", accent(team), { Glow = true, Top = 0.14, Height = 0.72 })
	lamp(sign, 14, 1)
end

local function foamFingerCart(ctx, seg, cx, team, gate)
	local o = 79.6 -- cart centre line
	local bodyColor = gate and team.Primary or accent(team)
	local topColor = gate and accent(team) or team.Primary
	local body = span(ctx, seg, "FoamFingerCart", cx - 2.8, cx + 2.8, o - 1, o + 1, 30.9, 33.5, bodyColor)
	write(body, INWARD, gate and "GAME DAY GEAR" or "FOAM FINGERS", ink(bodyColor, team), { Top = 0.14, Height = 0.4 })
	for _, s in ipairs({ -1, 1 }) do
		cyl(ctx, seg, "CartWheel", cx + s * 1.9, 30.8, o - 1.2, 0.4, 1.6, "o", DARK_METAL)
	end
	span(ctx, seg, "CartHandle", cx + 2.8, cx + 3.8, o - 0.6, o + 0.6, 32.9, 33.2, STEEL, Enum.Material.Metal)
	cyl(ctx, seg, "UmbrellaPole", cx - 1.6, 36.25, o + 0.4, 5.5, 0.25, "y", STEEL, Enum.Material.Metal)
	cyl(ctx, seg, "CartUmbrella", cx - 1.6, 39.2, o + 0.4, 0.4, 5.6, "y", topColor, nil, NO_COLLIDE)
	foamFinger(ctx, seg, cx + 0.8, 33.5, o, topColor, team)
	-- a folded stack of rally towels beside the finger
	span(ctx, seg, "RallyTowels", cx + 1.9, cx + 2.7, o - 0.7, o + 0.7, 33.5, 34.1, topColor, Enum.Material.Fabric)
	BuildUtil.Use(ctx, body, "foamfinger", {
		Object = gate and "Game Day Gear Cart" or "Foam Finger Cart",
		Title = gate and "Game Day Gear" or "Foam Finger Cart",
		Info = gate and "Welcome to the stadium! Grab a giant foam finger on your way in and show everyone who's #1."
			or "Giant foam fingers in team colours. Wave it high when your team scores!",
		At = localPoint(ctx, body, seg, cx, 34.4, o - 2.2),
	})
end

function ConcourseShops.concourse_merch(ctx)
	local L = ctx.config.Layout
	local team = ctx.colors
	local segs = ringSegments(L)

	-- 1 PRO SHOP
	BuildUtil.Stage(ctx, 1)
	proShop(ctx, segs[PRO_SHOP.seg], PRO_SHOP.x, team)

	-- 2 JERSEY KIOSKS
	BuildUtil.Stage(ctx, 2)
	for _, spec in ipairs(KIOSKS) do
		jerseyKiosk(ctx, segs[spec.seg], spec, team)
	end

	-- 3 FOAM FINGER CARTS
	BuildUtil.Stage(ctx, 3)
	for _, spec in ipairs(CARTS) do
		foamFingerCart(ctx, segs[spec.seg], spec.x, team, spec.gate)
	end
end

return ConcourseShops
