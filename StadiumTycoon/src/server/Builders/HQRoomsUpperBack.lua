--[[
	HQRoomsUpperBack
	The BACK row of rooms on the Team HQ's UPPER floor (campus-area coordinates). The empty
	two-storey building - its upper slab (top y = 17), outer walls, roof and the upper corridor
	X[-248, 98] Z[264, 278] - is Builders/HQShell.lua. Every room fills its zone
	(Config.Layout.Zones) between the upper corridor (z = 278) and the shell's back wall (inner face
	z = 358.5), right above the ground-floor back rooms. Rooms are REAL walk-in rooms: a floor on the
	slab, walls up to y 29.6 (the corridor wall rises to 31 so the corridor gets a tidy line), a
	ceiling with glowing light panels and a working door (BuildUtil.Door, swinging INTO the room or
	sliding) right beside the room's buy button in the corridor (never in line with it). Glass
	fronts let everybody walking along the upper corridor look into the rooms, and since the shell's
	upper floor has a glass curtain wall at the back (z 359), rooms only line the parts of the back
	wall they need (kitchen range wall, the barbershop's brick, the massage room, library + lounge)
	and leave the rest as big windows onto the practice fields (juice lab, pool deck, classroom).
	The shell hangs the room-name signs over the corridor, so the doors get no sign plates.

	  hq_kitchen  X[-248, -150]  Nutrition Kitchen
	    1 Walls & Floor         oak floor, glass front, double doors with windows, team stripes, an
	                            entry mat and the TODAY'S MENU chalkboard (look)
	    2 Chef's Kitchen        tiled cooking area: range + hood (look), two ovens, a long counter
	                            with a sink, upper cabinets, the meal-prep fridge (use: tray), the
	                            pantry (look), a teaching island (look) with stools (seats) and a
	                            tilted demo mirror, the COOKING CLASS screen
	    3 Juice & Smoothie Lab  juice bar (use: smoothie) with a fruit crate and stools (seats),
	                            blenders (look) + juice press (look) on the back counter, menu board
	                            (look), sports-drink fridge (use), a living herb wall (look)
	    4 Dining Tables         two long team tables with benches + captain's chairs (seats),
	                            pendant lamps, the CHAMPION PLATE mural (look), plants
	  hq_barber   X[-150, -100]  Barbershop
	    1 Shop Walls            checkerboard floor, brick back wall, glass shop front, a barber pole
	                            on the corridor wall (look)
	    2 Barber Chairs         six chrome barber chairs (seats with a MIRROR CAM view) at two
	                            station counters, a waiting sofa + magazine table, two wash chairs,
	                            a checkout with a golden cash register (look), a gumball machine
	                            (look), the GOLDEN CLIPPERS trophy on a display island (look)
	    3 Mirrors & Neon        a neon-framed mirror at every station, the FRESH CUTS neon sign,
	                            the haircut menu (look), a live game-day TV, a product shelf (look),
	                            neon cove strips, Edison bulbs over the aisle
	  hq_spa      X[-100, 0]     Recovery Spa & Pool
	    1 Walls & Tiles         tiled spa, frosted windows, sliding glass doors, check-in desk,
	                            towel wall (look), a bench, plants, the recovery poster (look)
	    2 Recovery Pool         a raised pool on a teak deck (steps up, steps into the water,
	                            handrails, look) with blue glass water, an underwater light, a
	                            waterfall wall (look), a floor logo and four lounge chairs (seats)
	    3 Cold Plunge & Sauna   a cedar sauna room (door, tiered benches = seats, heater look) and
	                            two ice-cold plunge tubs (steps, look) with a rinse shower
	    4 Massage Room          a walled room (door) with two massage tables (seats), towel shelves,
	                            candles, an oil cart (look), a calm mural
	  hq_players  X[0, 98]       Player Development Center
	    1 Classroom             walls + carpet, a glass classroom: three rows of desks + chairs
	                            (seats) facing a live SEASON screen (look), playbook whiteboard,
	                            teacher desk + laptop (look); a live TOP PLAYERS board by the door
	    2 Library & Study Pods  tall bookcases with a rolling ladder (look), a double-sided book
	                            divider, three study pods (seats), a reading nook, a globe (look)
	    3 Gaming Lounge         big live SCORE TV in a neon glow over a console (look), a sofa
	                            (seats) and bean bags, an air-hockey table (look), two arcade
	                            cabinets (use: arcade) under a live high-score sign, a snack fridge
	                            (use: soda)

	Paint heights on a room floor (top 17.12): kitchen tiles / rugs 17.14 - 17.15, the pool logo is a
	GUI on an invisible plate. Boards, menus and books are drawn with GUI frames (no extra parts).
	Everything printed is fictional; the team name comes from ctx.teamName.
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)

local M = {}

-- Lines and heights shared by every upper back room (campus-area studs)
local SHELL_FLOOR = 17 -- top of the shell's upper slab (Config.Layout.HQ.UpperFloorY)
local FLOOR_TOP = 17.12 -- room floors lie on the slab
local WALL_TOP = 29.6 -- room walls; the ceilings rest on them
local CEILING_TOP = 30
local LINTEL_TOP = 31 -- the corridor wall rises a little higher (a clean line along the corridor)
local DOOR_TOP = 26.2 -- doorways and window heads (9 above the floor)
local SILL = 20.3 -- clear windows (3.2 above the floor)
local HIGH_SILL = 22.4 -- frosted spa windows
local CW_OUT, CW_IN = 278.2, 279.2 -- corridor-side room wall (the corridor ends at z = 278)
local FACE_Z = 278 -- the corridor face of the room row (trims stand on it)
local BACK_Z = 358.45 -- rooms reach the inner face of the shell's back wall (z = 358.5)
local LINE_Z = 358.15 -- inner face of the back-wall lining in every room
local DOOR_H = DOOR_TOP - FLOOR_TOP - 0.1 -- height of a closed corridor door leaf
local DOOR_Z = (CW_OUT + CW_IN) / 2
-- the room-name line on the inside of the corridor wall (fractions of the lintel's DOOR_TOP..
-- LINTEL_TOP face): y 29.4 .. 27.7, below the ceiling (29.6) and above the TOP PLAYERS board
local SIGN_TOP, SIGN_H = 0.33, 0.36

local PAINT = { CanCollide = false, CastShadow = false }
local NO_COLLIDE = { CanCollide = false }

local WHITE = Color3.fromRGB(248, 248, 248)
local INK = Color3.fromRGB(22, 22, 26)
local BLACK = Color3.fromRGB(26, 26, 30)
local DARK_METAL = Color3.fromRGB(62, 64, 70)
local CHROME = Color3.fromRGB(200, 204, 210)
local STEEL = Color3.fromRGB(186, 190, 196)
local SCREEN = Color3.fromRGB(14, 16, 22)
local LED_DARK = Color3.fromRGB(12, 14, 20)
local LED_TEXT = Color3.fromRGB(255, 226, 120)
local WARM_LIGHT = Color3.fromRGB(255, 238, 205)
local COOL_LIGHT = Color3.fromRGB(232, 244, 255)
local LAMP = Color3.fromRGB(255, 248, 232)
local CEILING = Color3.fromRGB(236, 236, 232)
local DARK_WOOD = Color3.fromRGB(92, 62, 40)
local WOOD = Color3.fromRGB(150, 105, 60)
local LIGHT_WOOD = Color3.fromRGB(198, 160, 112)
local OAK_FLOOR = Color3.fromRGB(184, 140, 96)
local MARBLE = Color3.fromRGB(238, 236, 230)
local GLASS = Color3.fromRGB(160, 210, 240)
local MIRROR = Color3.fromRGB(196, 214, 226)
local GOLD = Color3.fromRGB(255, 190, 40)
local LEAF = Color3.fromRGB(58, 128, 64)
local LEAF_DARK = Color3.fromRGB(38, 98, 50)
local POT = Color3.fromRGB(64, 66, 72)
local TILE = Color3.fromRGB(226, 228, 230)
local POOL_TILE = Color3.fromRGB(70, 150, 200)
local WATER = Color3.fromRGB(90, 180, 235)
local ICE = Color3.fromRGB(200, 236, 255)
local CEDAR = Color3.fromRGB(176, 112, 68)
local CEDAR_LIGHT = Color3.fromRGB(210, 150, 96)
local SLATE = Color3.fromRGB(92, 96, 104)
local NEON_PINK = Color3.fromRGB(255, 70, 170)
local NEON_CYAN = Color3.fromRGB(60, 225, 255)
local NEON_GREEN = Color3.fromRGB(120, 255, 120)
local NEON_ORANGE = Color3.fromRGB(255, 150, 50)
local FRUIT_RED = Color3.fromRGB(220, 40, 40)
local FRUIT_ORANGE = Color3.fromRGB(250, 140, 30)
local FRUIT_YELLOW = Color3.fromRGB(250, 220, 60)
local FRUIT_GREEN = Color3.fromRGB(110, 200, 70)

-- Facing of furniture frames: the frame's front (-Z) points this way.
-- S = toward the corridor (-Z), N = toward the HQ back wall (+Z), E = +X, W = -X.
local FACING = { S = 0, N = math.pi, E = -math.pi / 2, W = math.pi / 2 }

---------------------------------------------------------------------------------------------
-- Colour + text helpers
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

-- First team colour that reads well on `background`, else whichever of white / ink reads best.
local function textColorOn(background, team)
	for _, candidate in ipairs({ team.Trim, team.Secondary, team.Primary }) do
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

local function teamLabel(ctx)
	local name = ctx.teamName
	if type(name) ~= "string" or name == "" then
		return "HOME TEAM"
	end
	return name
end

--[[
	Text on one face of `part`, coloured to read on `background`.
	opts: TextColor3, Font, PixelsPerStud, InsetX, InsetY, Top / Height (fractions of the face),
	      LightInfluence, BackgroundColor3 + BackgroundTransparency, Wrap
]]
local function sign(part, face, text, background, team, opts)
	opts = opts or {}
	local _, label = BuildUtil.SurfaceText(part, face, text, {
		LabelName = opts.LabelName or (part.Name .. face.Name),
		TextColor3 = opts.TextColor3 or textColorOn(background, team),
		Font = opts.Font or Enum.Font.GothamBlack,
		PixelsPerStud = opts.PixelsPerStud or 20,
		LightInfluence = opts.LightInfluence,
		BackgroundColor3 = opts.BackgroundColor3,
		BackgroundTransparency = opts.BackgroundTransparency,
	})
	local insetX, insetY = opts.InsetX or 0.06, opts.InsetY or 0.14
	label.Size = UDim2.new(1 - 2 * insetX, 0, opts.Height or (1 - 2 * insetY), 0)
	label.Position = UDim2.new(insetX, 0, opts.Top or insetY, 0)
	if opts.Wrap then
		label.TextWrapped = true
	end
	return label
end

---------------------------------------------------------------------------------------------
-- GUI drawing (menus, boards, books). Positions/sizes are in studs measured from the top-left
-- corner of the face as seen from outside it.
---------------------------------------------------------------------------------------------

local function px(studs, pps)
	return math.floor(studs * pps + 0.5)
end

-- A SurfaceGui to draw on; `background` fills the face (nil = transparent).
local function canvas(part, face, pps, background, lightInfluence)
	local gui = Instance.new("SurfaceGui")
	gui.Name = part.Name .. face.Name .. "Canvas"
	gui.Face = face
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = pps
	gui.LightInfluence = lightInfluence or 1
	gui.Parent = part
	if background then
		local fill = Instance.new("Frame")
		fill.Name = "Background"
		fill.BorderSizePixel = 0
		fill.BackgroundColor3 = background
		fill.Size = UDim2.new(1, 0, 1, 0)
		fill.Parent = gui
	end
	return gui
end

local function guiFrame(gui, x, y, w, h, color, transparency)
	local pps = gui.PixelsPerStud
	local frame = Instance.new("Frame")
	frame.Name = "Ink"
	frame.BorderSizePixel = 0
	frame.BackgroundColor3 = color
	frame.BackgroundTransparency = transparency or 0
	frame.Size = UDim2.new(0, math.max(1, px(w, pps)), 0, math.max(1, px(h, pps)))
	frame.Position = UDim2.new(0, px(x, pps), 0, px(y, pps))
	frame.Parent = gui
	return frame
end

-- A filled circle (fruit, dots, logos).
local function guiDot(gui, cx, cy, d, color)
	local frame = guiFrame(gui, cx - d / 2, cy - d / 2, d, d, color)
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0.5, 0)
	corner.Parent = frame
	return frame
end

-- A stroked circle (burners, plates).
local function guiRing(gui, cx, cy, d, thick, color)
	local frame = guiFrame(gui, cx - d / 2, cy - d / 2, d, d, color, 1)
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0.5, 0)
	corner.Parent = frame
	local stroke = Instance.new("UIStroke")
	stroke.Color = color
	stroke.Thickness = math.max(1, px(thick, gui.PixelsPerStud))
	stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	stroke.Parent = frame
	return frame
end

local function guiText(gui, x, y, w, h, text, color, font, alignX)
	local pps = gui.PixelsPerStud
	local label = Instance.new("TextLabel")
	label.Name = "Text"
	label.BackgroundTransparency = 1
	label.BorderSizePixel = 0
	label.Size = UDim2.new(0, px(w, pps), 0, px(h, pps))
	label.Position = UDim2.new(0, px(x, pps), 0, px(y, pps))
	label.Font = font or Enum.Font.GothamBold
	label.Text = text
	label.TextColor3 = color
	label.TextScaled = true
	if alignX then
		label.TextXAlignment = alignX
	end
	label.ZIndex = 2
	label.Parent = gui
	return label
end

-- Rows of book spines on a shelf face (W x H studs), `shelves` shelves.
local BOOK_COLORS = {
	Color3.fromRGB(150, 40, 40),
	Color3.fromRGB(40, 70, 140),
	Color3.fromRGB(40, 110, 60),
	Color3.fromRGB(210, 160, 50),
	Color3.fromRGB(90, 50, 110),
	Color3.fromRGB(230, 230, 220),
	Color3.fromRGB(30, 30, 34),
	Color3.fromRGB(200, 90, 40),
}
local function drawBooks(gui, W, H, shelves, team, seed)
	local boardH = 0.25
	local rowH = (H - boardH) / shelves
	for s = 0, shelves - 1 do
		local y0 = s * rowH
		guiFrame(gui, 0, y0 + rowH - boardH + boardH, W, boardH, DARK_WOOD)
		local x = 0.25
		local k = seed + s * 7
		while x < W - 0.6 do
			k += 1
			local w = 0.32 + (k * 37 % 5) * 0.06
			local h = rowH * (0.62 + (k * 53 % 4) * 0.07)
			local color = BOOK_COLORS[k % #BOOK_COLORS + 1]
			if k % 9 == 0 then
				color = team.Primary
			elseif k % 11 == 0 then
				color = team.Secondary
			end
			guiFrame(gui, x, y0 + rowH - h, w, h - 0.05, color)
			x += w + 0.04
			if k % 13 == 0 then
				x += 0.7 -- a gap (a book is out)
			end
		end
	end
end

---------------------------------------------------------------------------------------------
-- Part helpers
---------------------------------------------------------------------------------------------

-- Axis-aligned box between two corners.
local function box(ctx, name, x0, y0, z0, x1, y1, z1, color, material, extra)
	local minX, maxX = math.min(x0, x1), math.max(x0, x1)
	local minY, maxY = math.min(y0, y1), math.max(y0, y1)
	local minZ, maxZ = math.min(z0, z1), math.max(z0, z1)
	return BuildUtil.Box(
		ctx,
		name,
		Vector3.new(maxX - minX, maxY - minY, maxZ - minZ),
		Vector3.new((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2),
		color,
		material or Enum.Material.SmoothPlastic,
		extra
	)
end

-- A furniture frame on the floor at (x, z) whose front (-Z, the Front face) points `facing`.
local function frameAt(x, z, facing, y)
	return CFrame.new(x, y or FLOOR_TOP, z) * CFrame.Angles(0, FACING[facing] or facing, 0)
end

-- Block in a local `frame`: bottom at local height y0, centred on local (x, z).
local function lblock(ctx, frame, name, size, x, y0, z, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Size = size
	props.CFrame = frame * CFrame.new(x, y0 + size.Y / 2, z)
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Part(ctx, props)
end

local function cyl(ctx, name, position, length, diameter, axis, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Position = position
	props.Height = length
	props.Diameter = diameter
	props.Axis = axis
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Cylinder(ctx, props)
end

local function ball(ctx, name, position, diameter, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Position = position
	props.Diameter = diameter
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Ball(ctx, props)
end

-- Rod (cylinder) from point a to point b (vertical rods too).
local function rod(ctx, name, a, b, diameter, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Shape = Enum.PartType.Cylinder
	props.Size = Vector3.new((b - a).Magnitude, diameter, diameter)
	local dir = b - a
	if math.abs(dir.X) < 1e-4 and math.abs(dir.Z) < 1e-4 then
		-- vertical: lookAt can't use the default up vector, turn the cylinder's X axis upright
		props.CFrame = CFrame.new((a + b) / 2) * CFrame.Angles(0, 0, math.pi / 2)
	else
		props.CFrame = CFrame.lookAt((a + b) / 2, b) * CFrame.Angles(0, math.pi / 2, 0)
	end
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Part(ctx, props)
end

---------------------------------------------------------------------------------------------
-- Furniture
---------------------------------------------------------------------------------------------

-- A seat players can sit on (BuildUtil.Seat) in a local frame, bottom at local y0. The sitter
-- faces the frame's front. opts: Name, Object (prompt label), NoPrompt, Camera
local function lseat(ctx, frame, size, x, y0, z, color, material, opts)
	opts = opts or {}
	return BuildUtil.Seat(ctx, {
		Name = opts.Name or "Seat",
		Size = size,
		CFrame = frame * CFrame.new(x, y0 + size.Y / 2, z),
		Color = color,
		Material = material or Enum.Material.Fabric,
		Object = opts.Object,
		NoPrompt = opts.NoPrompt,
		Camera = opts.Camera,
	})
end

-- Simple chair: a seat block standing on the floor (a real seat) + a back. The sitter faces the
-- frame's front. opts: Width, Depth, SeatHeight, BackHeight, Material, BackColor, Object, NoPrompt
local function chair(ctx, frame, color, opts)
	opts = opts or {}
	local w, d = opts.Width or 2, opts.Depth or 2
	local seatH, backH = opts.SeatHeight or 1.9, opts.BackHeight or 2.4
	local material = opts.Material or Enum.Material.Fabric
	local seat = lseat(ctx, frame, Vector3.new(w, seatH, d), 0, 0, 0, color, material, {
		Name = opts.Name or "ChairSeat",
		Object = opts.Object or "Chair",
		NoPrompt = opts.NoPrompt,
	})
	lblock(ctx, frame, "ChairBack", Vector3.new(w, backH, 0.4), 0, seatH, d / 2 - 0.2, opts.BackColor or color, material)
	return seat
end

-- Bar stool: chrome post + a cushion seat (a real seat). The sitter faces `facing`.
local function stool(ctx, x, z, facing, seatTop, color, opts)
	opts = opts or {}
	local postTop = seatTop - 0.5
	cyl(ctx, "StoolPost", Vector3.new(x, (FLOOR_TOP + postTop) / 2, z), postTop - FLOOR_TOP, 0.4, "Y", CHROME, Enum.Material.Metal)
	return BuildUtil.Seat(ctx, {
		Name = "BarStool",
		Size = Vector3.new(1.8, 0.5, 1.8),
		CFrame = frameAt(x, z, facing, seatTop - 0.25),
		Color = color,
		Material = Enum.Material.Leather,
		Object = opts.Object or "Bar Stool",
		NoPrompt = opts.NoPrompt,
	})
end

-- Sofa (seat cushions, back, two arms) whose seats face the frame's front. Every cushion is a
-- seat; only the middle one shows a prompt. opts: Object, BackHeight, NoPrompt
local function sofa(ctx, frame, length, color, armColor, opts)
	opts = opts or {}
	local material = Enum.Material.Fabric
	local seatLen = length - 1.6
	local count = math.max(1, math.floor(seatLen / 3.2))
	local cushionW = seatLen / count
	local middle = math.ceil(count / 2)
	for i = 1, count do
		local x = -seatLen / 2 + (i - 0.5) * cushionW
		lseat(ctx, frame, Vector3.new(cushionW - 0.08, 1.7, 2.2), x, 0, -0.4, color, material, {
			Name = "SofaSeat",
			Object = opts.Object or "Sofa",
			NoPrompt = opts.NoPrompt or i ~= middle,
		})
	end
	lblock(ctx, frame, "SofaBack", Vector3.new(length, opts.BackHeight or 3.6, 0.8), 0, 0, 1.1, armColor or color, material)
	for _, s in ipairs({ -1, 1 }) do
		lblock(ctx, frame, "SofaArm", Vector3.new(0.8, 2.6, 2.2), s * (length / 2 - 0.4), 0, -0.4, armColor or color, material)
	end
end

-- Potted plant: a pot and a leafy ball (2 parts).
local function plant(ctx, x, z, size)
	size = size or 1
	local potH = 2.2 * size
	cyl(ctx, "PlantPot", Vector3.new(x, FLOOR_TOP + potH / 2, z), potH, 2.4 * size, "Y", POT, Enum.Material.Concrete)
	ball(ctx, "PlantLeaves", Vector3.new(x, FLOOR_TOP + potH + 1.5 * size, z), 3.8 * size, LEAF, Enum.Material.Grass)
end

--[[
	A live screen (BuildUtil.LiveText) the server keeps up to date with the owner's team: dark LED
	background, bright text, glows in the dark. Returns the TextLabel.
	opts: TextColor3, Font, PixelsPerStud, Padding, Header (a static title line over the live text),
	      HeaderShare, HeaderColor, HeaderBackground
]]
local function liveScreen(part, face, live, placeholder, opts)
	opts = opts or {}
	local _, label = BuildUtil.LiveText(part, face, live, {
		LabelName = opts.LabelName or ("Live_" .. live),
		Text = placeholder,
		TextColor3 = opts.TextColor3 or LED_TEXT,
		BackgroundColor3 = LED_DARK,
		BackgroundTransparency = 0,
		LightInfluence = 0,
		Font = opts.Font or Enum.Font.GothamBold,
		PixelsPerStud = opts.PixelsPerStud or 24,
	})
	local p = opts.Padding or 0.06
	local headerShare = opts.Header and (opts.HeaderShare or 0.22) or 0
	local pad = Instance.new("UIPadding")
	pad.PaddingLeft = UDim.new(p, 0)
	pad.PaddingRight = UDim.new(p, 0)
	pad.PaddingTop = UDim.new(headerShare + p, 0)
	pad.PaddingBottom = UDim.new(p, 0)
	pad.Parent = label
	if opts.Header then
		local header = Instance.new("TextLabel")
		header.Name = "Header"
		header.BackgroundColor3 = opts.HeaderBackground or Color3.new(0, 0, 0)
		header.BackgroundTransparency = opts.HeaderBackground and 0 or 1
		header.BorderSizePixel = 0
		header.Size = UDim2.new(1, 0, headerShare, 0)
		header.Font = Enum.Font.GothamBlack
		header.Text = opts.Header
		header.TextColor3 = opts.HeaderColor or WHITE
		header.TextScaled = true
		header.ZIndex = 2
		header.Parent = label.Parent
		local hp = Instance.new("UIPadding")
		hp.PaddingTop = UDim.new(0.12, 0)
		hp.PaddingBottom = UDim.new(0.12, 0)
		hp.PaddingLeft = UDim.new(0.04, 0)
		hp.PaddingRight = UDim.new(0.04, 0)
		hp.Parent = header
	end
	return label
end

---------------------------------------------------------------------------------------------
-- Room shell
---------------------------------------------------------------------------------------------

-- Glass + mullions in a corridor-wall window.
local function glaze(ctx, op)
	box(ctx, "WindowGlass", op.From, op.Sill, CW_OUT + 0.35, op.To, DOOR_TOP, CW_IN - 0.35, op.GlassColor or GLASS, Enum.Material.Glass, {
		Transparency = op.Transparency or 0.45,
	})
	local n = op.Mullions or 0
	for m = 1, n do
		local x = op.From + m * (op.To - op.From) / (n + 1)
		box(ctx, "Mullion", x - 0.15, op.Sill, CW_OUT + 0.2, x + 0.15, DOOR_TOP, CW_IN - 0.2, DARK_METAL, Enum.Material.Metal)
	end
end

-- A working door in a corridor-wall doorway (BuildUtil.Door: double leaves that swing INTO the
-- room, toward +Z, or slide into the wall) and a team-colour frame on the corridor side (the shell
-- hangs the room-name signs over the corridor).
local function doorway(ctx, op, o)
	local team = ctx.colors
	local props = table.clone(o.Door or {})
	props.Name = props.Name or "RoomDoor"
	props.Size = Vector3.new(op.To - op.From, DOOR_H, 0.35)
	props.CFrame = CFrame.new((op.From + op.To) / 2, FLOOR_TOP + 0.05 + DOOR_H / 2, DOOR_Z)
	if props.Double == nil then
		props.Double = true
	end
	if not props.Slide then
		props.Swing = props.Swing or -95 -- negative = toward the door's back (+Z), into the room
	end
	props.Distance = props.Distance or 8
	BuildUtil.Door(ctx, props)
	local trim = o.FrameColor or team.Secondary
	box(ctx, "DoorFrame", op.From - 0.5, SHELL_FLOOR, CW_OUT - 0.25, op.From, DOOR_TOP, CW_OUT, trim)
	box(ctx, "DoorFrame", op.To, SHELL_FLOOR, CW_OUT - 0.25, op.To + 0.5, DOOR_TOP, CW_OUT, trim)
	box(ctx, "DoorFrameTop", op.From - 0.5, DOOR_TOP, CW_OUT - 0.25, op.To + 0.5, DOOR_TOP + 0.5, CW_OUT, trim)
end

-- A glowing ceiling light panel centred on (x, z) with a PointLight.
local function ceilingLight(ctx, x, z, o)
	local size = o.LightSize or { 12, 5 }
	local w, d = size[1], size[2]
	local lamp = box(
		ctx,
		"CeilingLight",
		x - w / 2,
		WALL_TOP - 0.2,
		z - d / 2,
		x + w / 2,
		WALL_TOP,
		z + d / 2,
		o.LampColor or LAMP,
		Enum.Material.Neon,
		PAINT
	)
	BuildUtil.Light(lamp, "PointLight", {
		Name = "RoomLight",
		Range = o.LightRange or 30,
		Brightness = o.LightBrightness or 1.4,
		Color = o.LightColor or WARM_LIGHT,
	})
	return lamp
end

--[[
	Builds a room's floor, side walls, back-wall lining, corridor wall (windows + a doorway with a
	working door), team band and ceiling with light panels, all in the current step.
	o: X0, X1 (floor / ceiling / corridor wall extent), InnerX0, InnerX1 (inner faces of the side
	   walls), Walls = { { minX, maxX } } (walls between rooms), Linings = { { minX, maxX } } (thin
	   linings in front of the shell's end walls), Openings = { { From, To, Sill?, Mullions?,
	   GlassColor?, Transparency? } } sorted by x (no Sill = the doorway), WallColor, WallMaterial,
	   BackColor, BackMaterial, BackSegments = { { minX, maxX } } (lined parts of the back wall; the
	   rest stays open to the shell's glass), FloorColor, FloorMaterial, CeilingColor, FrameColor, BandColor,
	   Door (BuildUtil.Door props), Lights = { { x, z } }, LightSize, LightRange,
	   LightBrightness, LightColor, LampColor
	Returns { Floor, Lintel (the corridor wall above the openings), Back (the back-wall lining) }.
]]
local function roomShell(ctx, o)
	local team = ctx.colors
	local x0, x1 = o.X0, o.X1
	local wallColor, wallMaterial = o.WallColor, o.WallMaterial or Enum.Material.Plaster
	-- the floor runs out to the corridor's edge (a low plinth under the corridor wall and a
	-- threshold in the doorway) and stops 0.02 short of the side / back walls (no coplanar faces)
	local floor = box(ctx, "Floor", x0 + 0.02, SHELL_FLOOR, FACE_Z, x1 - 0.02, FLOOR_TOP, BACK_Z - 0.02, o.FloorColor, o.FloorMaterial)
	for _, w in ipairs(o.Walls or {}) do
		box(ctx, "SideWall", w[1], SHELL_FLOOR, CW_IN, w[2], WALL_TOP, BACK_Z, wallColor, wallMaterial)
	end
	for _, w in ipairs(o.Linings or {}) do
		box(ctx, "WallLining", w[1], FLOOR_TOP, CW_IN, w[2], WALL_TOP, LINE_Z, wallColor, wallMaterial)
	end
	-- the back wall: the shell's upper floor is a glass curtain wall (z 359), so a room only lines
	-- the parts it needs (BackSegments; default: all of it) and keeps the rest as a view of the
	-- practice fields. A header runs along the top, under the ceiling.
	local back
	for _, seg in ipairs(o.BackSegments or { { o.InnerX0, o.InnerX1 } }) do
		local part = box(
			ctx,
			"BackWallLining",
			seg[1],
			FLOOR_TOP,
			LINE_Z,
			seg[2],
			WALL_TOP - 0.8,
			BACK_Z,
			o.BackColor or wallColor,
			o.BackMaterial or wallMaterial
		)
		back = back or part
	end
	-- (a hair deeper than the ceiling so their back faces never fight through the curtain glass)
	box(ctx, "BackHeader", o.InnerX0, WALL_TOP - 0.8, LINE_Z, o.InnerX1, LINTEL_TOP, BACK_Z + 0.03, wallColor, wallMaterial)

	-- corridor wall: one lintel over everything, piers between the openings, sills under windows
	local lintel = box(ctx, "CorridorWallTop", x0, DOOR_TOP, CW_OUT, x1, LINTEL_TOP, CW_IN, wallColor, wallMaterial)
	local x = x0
	local function pier(a, b)
		if b - a > 0.01 then
			box(ctx, "CorridorWall", a, SHELL_FLOOR, CW_OUT, b, DOOR_TOP, CW_IN, wallColor, wallMaterial)
		end
	end
	for _, op in ipairs(o.Openings) do
		pier(x, op.From)
		if op.Sill then
			box(ctx, "WindowSill", op.From, SHELL_FLOOR, CW_OUT, op.To, op.Sill, CW_IN, wallColor, wallMaterial)
			glaze(ctx, op)
		else
			doorway(ctx, op, o)
		end
		x = op.To
	end
	pier(x, x1)
	box(ctx, "WallBand", x0, LINTEL_TOP - 1.4, FACE_Z, x1, LINTEL_TOP, CW_OUT, o.BandColor or team.Primary)

	-- ceiling with glowing light panels
	box(ctx, "Ceiling", x0, WALL_TOP, CW_IN, x1, CEILING_TOP, BACK_Z, o.CeilingColor or CEILING)
	for _, l in ipairs(o.Lights) do
		ceilingLight(ctx, l[1], l[2], o)
	end
	return { Floor = floor, Lintel = lintel, Back = back }
end

-- A thin team-colour stripe along the inner faces of a room's two side walls (paint).
local function wallStripes(ctx, ix0, ix1, y, color, z1)
	for _, x in ipairs({ ix0, ix1 - 0.05 }) do
		box(ctx, "WallStripe", x, y, CW_IN, x + 0.05, y + 0.8, z1 or LINE_Z, color, Enum.Material.SmoothPlastic, PAINT)
	end
end

---------------------------------------------------------------------------------------------
-- Nutrition Kitchen X[-248, -150]
---------------------------------------------------------------------------------------------

function M.hq_kitchen(ctx)
	local team = ctx.colors
	local name = teamLabel(ctx)
	local wall = Color3.fromRGB(244, 240, 232)
	local IX0, IX1 = -248.05, -150.4 -- inner faces: the west lining, the east wall

	-- Step 1: walls, oak floor, glass front, double doors -----------------------------------------
	BuildUtil.Stage(ctx, 1)
	local room = BuildUtil.Child(ctx, "Room")
	local shell = roomShell(room, {
		X0 = -248.45,
		X1 = -150,
		InnerX0 = IX0,
		InnerX1 = IX1,
		Walls = { { IX1, -150 } },
		Linings = { { -248.45, IX0 } },
		BackSegments = { { IX0, -176 } },
		Openings = {
			{ From = -245, To = -221, Sill = SILL, Mullions = 2 },
			{ From = -217, To = -196, Sill = SILL, Mullions = 1 },
			{ From = -184, To = -174 },
			{ From = -169, To = -154, Sill = SILL, Mullions = 1 },
		},
		WallColor = wall,
		FloorColor = OAK_FLOOR,
		FloorMaterial = Enum.Material.WoodPlanks,
		CeilingColor = WHITE,
		Door = {
			Color = WOOD,
			Material = Enum.Material.Wood,
			Window = true,
			Object = "Nutrition Kitchen",
			Title = "Nutrition Kitchen",
			Info = "The team chefs teach players to cook healthy meals up here. Smells like grilled chicken and fresh smoothies!",
		},
		Lights = { { -228, 300 }, { -200, 300 }, { -166, 300 }, { -228, 340 }, { -200, 340 }, { -166, 340 } },
	})
	sign(shell.Lintel, Enum.NormalId.Back, name .. " NUTRITION KITCHEN", wall, team, { InsetX = 0.3, Top = SIGN_TOP, Height = SIGN_H })
	wallStripes(room, IX0, IX1, 24.2, team.Primary)
	box(room, "EntryMat", -184, FLOOR_TOP, CW_IN, -174, FLOOR_TOP + 0.02, 286, team.Secondary, Enum.Material.Fabric, PAINT)
	-- a chalkboard menu stand by the door, turned toward everyone walking in
	local chalk = BuildUtil.Part(room, {
		Name = "MenuStand",
		Size = Vector3.new(3.6, 4.8, 0.3),
		CFrame = CFrame.new(-168, FLOOR_TOP + 2.35, 286) * CFrame.Angles(0, math.rad(40), 0) * CFrame.Angles(math.rad(-10), 0, 0),
		Color = Color3.fromRGB(34, 40, 36),
		Material = Enum.Material.Slate,
	})
	local chalkGui = canvas(chalk, Enum.NormalId.Front, 24, Color3.fromRGB(34, 40, 36), 0.6)
	guiFrame(chalkGui, 0, 0, 3.6, 0.2, LIGHT_WOOD)
	guiText(chalkGui, 0.2, 0.35, 3.2, 0.6, "TODAY'S MENU", WHITE, Enum.Font.PermanentMarker)
	local today = { "BLITZ BURRITO BOWLS", "GRILLED SALMON", "VEGGIE MOUNTAIN", "FRUIT + SMOOTHIES" }
	for i, line in ipairs(today) do
		guiText(chalkGui, 0.25, 1.1 + (i - 1) * 0.7, 3.1, 0.45, line, i % 2 == 1 and LED_TEXT or WHITE, Enum.Font.PermanentMarker)
	end
	guiText(chalkGui, 0.2, 4, 3.2, 0.5, "EAT LIKE A CHAMP!", NEON_PINK, Enum.Font.PermanentMarker)
	BuildUtil.Look(chalk, "Today's Menu", "Blitz burrito bowls, grilled salmon and a veggie mountain. Dessert? Fruit, of course!", {
		Distance = 8,
	})

	-- Step 2: the chef's teaching kitchen (back-west corner) ------------------------------------------
	BuildUtil.Stage(ctx, 2)
	local kitchen = BuildUtil.Child(ctx, "ChefsKitchen")
	box(kitchen, "KitchenTiles", IX0, FLOOR_TOP, 328, -174, FLOOR_TOP + 0.02, LINE_Z, TILE, Enum.Material.CeramicTiles, PAINT)
	-- meal-prep fridge in the corner (use: tray)
	local fridge = box(kitchen, "MealPrepFridge", IX0, FLOOR_TOP, 352.15, -241, 26.6, LINE_Z, STEEL, Enum.Material.Metal)
	local fridgeGui = canvas(fridge, Enum.NormalId.Front, 20, nil, 1)
	guiFrame(fridgeGui, 3.48, 0, 0.08, 9.5, DARK_METAL)
	guiFrame(fridgeGui, 2.9, 2.6, 0.18, 3.2, DARK_METAL)
	guiFrame(fridgeGui, 3.95, 2.6, 0.18, 3.2, DARK_METAL)
	guiFrame(fridgeGui, 0.8, 1, 1.6, 1, team.Primary)
	guiText(fridgeGui, 0.85, 1.1, 1.5, 0.8, "MEAL PREP", textColorOn(team.Primary, team), Enum.Font.GothamBlack)
	BuildUtil.Use(ctx, fridge, "tray", {
		Action = "Grab a tray",
		Object = "Meal-Prep Fridge",
		Title = "Meal-Prep Fridge",
		Info = "Ready-made healthy meals for every player: grilled chicken, rice and a mountain of veggies. Grab a tray!",
		At = Vector3.new(0, -1.5, -3.2),
		Distance = 8,
	})
	-- counter run along the back wall with two ovens and a range
	local counter = box(kitchen, "Counter", -241, FLOOR_TOP, 354.15, -178, 20.5, LINE_Z, shade(team.Primary, 0.55))
	local counterGui = canvas(counter, Enum.NormalId.Front, 16, nil, 1)
	for i = 0, 15 do
		guiFrame(counterGui, i * 4, 0, 0.08, 3.4, shade(team.Primary, 0.3))
		guiFrame(counterGui, i * 4 + 1.4, 0.5, 1.2, 0.12, CHROME)
	end
	box(kitchen, "CounterTop", -241.2, 20.5, 353.85, -177.8, 20.85, LINE_Z, MARBLE, Enum.Material.Marble)
	box(kitchen, "CounterSink", -191, 20.85, 354.8, -185, 20.88, 357.4, DARK_METAL, Enum.Material.Metal, PAINT)
	cyl(kitchen, "Faucet", Vector3.new(-188, 21.85, 357.6), 2, 0.3, "Y", CHROME, Enum.Material.Metal)
	box(kitchen, "UpperCabinets", -196, 24.8, 356.15, -178, 28.4, LINE_Z, WOOD, Enum.Material.Wood)
	box(kitchen, "Backsplash", -241, 20.85, 357.95, -213, 24.4, LINE_Z, WHITE, Enum.Material.CeramicTiles)
	local cooktop = box(kitchen, "Cooktop", -226, 20.85, 354.4, -216, 20.95, 357.9, BLACK, Enum.Material.Glass)
	local burnerGui = canvas(cooktop, Enum.NormalId.Top, 20, nil, 0)
	-- four burner rings that fit the 10 x 3.5 glass top
	for _, b in ipairs({ { 2.5, 0.95, 1.7 }, { 7.5, 0.95, 1.4 }, { 2.5, 2.55, 1.4 }, { 7.5, 2.55, 1.7 } }) do
		guiRing(burnerGui, b[1], b[2], b[3], 0.15, NEON_ORANGE)
	end
	for i, ox in ipairs({ -221, -207 }) do
		local oven = box(kitchen, "Oven", ox - 4, 17.9, 353.95, ox + 4, 20.1, 354.15, BLACK, Enum.Material.Glass)
		local ovenGui = canvas(oven, Enum.NormalId.Front, 20, nil, 0)
		guiFrame(ovenGui, 0.5, 0.25, 7, 0.18, CHROME)
		guiFrame(ovenGui, 1.2, 0.7, 5.6, 1.2, i == 1 and Color3.fromRGB(255, 120, 40) or Color3.fromRGB(120, 60, 30))
	end
	cyl(kitchen, "StockPot", Vector3.new(-223.5, 21.75, 356.2), 1.6, 2.2, "Y", CHROME, Enum.Material.Metal)
	cyl(kitchen, "SautePan", Vector3.new(-218.5, 21.2, 356.2), 0.5, 2, "Y", team.Primary, Enum.Material.Metal)
	local hood = box(kitchen, "RangeHood", -227, 25.6, 354.6, -215, 27, LINE_Z, STEEL, Enum.Material.Metal)
	sign(hood, Enum.NormalId.Front, "COOK LIKE A CHAMP", STEEL, team, { TextColor3 = team.Primary, InsetX = 0.08, InsetY = 0.2 })
	box(kitchen, "HoodChimney", -223.5, 27, 355.6, -218.5, WALL_TOP, LINE_Z, STEEL, Enum.Material.Metal)
	box(kitchen, "UpperCabinets", -241, 24.8, 356.15, -229, 28.4, LINE_Z, WOOD, Enum.Material.Wood)
	BuildUtil.Look(
		hood,
		"Chef's Range",
		"Six burners and two ovens. The team chef can cook pasta for 53 hungry players at once!",
		{ At = Vector3.new(0, -3.5, -1), Distance = 9 }
	)
	-- the COOKING CLASS screen over the counter's east end
	local tv = box(kitchen, "RecipeScreen", -211.5, 21.6, 357.75, -198.5, 28.4, LINE_Z, SCREEN)
	local tvGui = canvas(tv, Enum.NormalId.Front, 20, Color3.fromRGB(20, 24, 34), 0)
	guiFrame(tvGui, 0, 0, 13, 1.4, team.Primary)
	guiText(tvGui, 0.4, 0.2, 12.2, 1, "COOKING CLASS", textColorOn(team.Primary, team), Enum.Font.GothamBlack)
	guiText(tvGui, 0.5, 1.7, 12, 0.9, "TODAY: TOUCHDOWN TACOS", LED_TEXT, Enum.Font.GothamBlack)
	local recipe = { "1. GRILL THE CHICKEN", "2. CHOP PEPPERS + ONIONS", "3. WARM THE TORTILLAS", "4. ADD SALSA + EAT!" }
	for i, line in ipairs(recipe) do
		guiText(tvGui, 0.8, 2.75 + (i - 1) * 0.95, 11.4, 0.7, line, WHITE, Enum.Font.GothamBold, Enum.TextXAlignment.Left)
	end
	-- teaching island: students on stools (south), the chef behind it (north)
	local island = box(kitchen, "Island", -236, FLOOR_TOP, 336.5, -204, 20.4, 342.5, team.Primary)
	sign(island, Enum.NormalId.Front, name .. " TEACHING KITCHEN", team.Primary, team, { InsetX = 0.08, InsetY = 0.28 })
	local islandTop = box(kitchen, "IslandTop", -236.6, 20.4, 335.6, -203.4, 20.75, 343.4, MARBLE, Enum.Material.Marble)
	local topGui = canvas(islandTop, Enum.NormalId.Top, 16, nil, 1)
	guiFrame(topGui, 5, 3, 5, 2.6, LIGHT_WOOD)
	for i, c in ipairs({ FRUIT_RED, FRUIT_GREEN, FRUIT_ORANGE, FRUIT_YELLOW, FRUIT_GREEN }) do
		guiDot(topGui, 5.8 + (i - 1) * 0.85, 4.3, 0.6, c)
	end
	guiFrame(topGui, 12, 3.2, 3.2, 2.2, DARK_METAL)
	box(kitchen, "IslandSink", -212.5, 20.75, 338.4, -209, 20.78, 341.4, DARK_METAL, Enum.Material.Metal, PAINT)
	cyl(kitchen, "Faucet", Vector3.new(-210.75, 21.75, 342.4), 2, 0.3, "Y", CHROME, Enum.Material.Metal)
	BuildUtil.Look(
		islandTop,
		"Teaching Kitchen",
		"Players learn to cook their own healthy meals here. Rookies start with scrambled eggs, pros make the famous Touchdown Tacos!",
		{ At = Vector3.new(-4, 0.6, -2), Distance = 9 }
	)
	for i, sx in ipairs({ -232, -226, -220, -214, -208 }) do
		stool(kitchen, sx, 333.4, "N", 20.4, team.Secondary, { Object = "Cooking Class Stool", NoPrompt = i ~= 1 and i ~= 5 })
	end
	-- a tilted mirror over the island lets the students watch the chef's hands
	BuildUtil.Part(kitchen, {
		Name = "DemoMirror",
		Size = Vector3.new(26, 0.2, 4.6),
		CFrame = CFrame.new(-220, 26.6, 339.5) * CFrame.Angles(math.rad(40), 0, 0),
		Color = MIRROR,
		Material = Enum.Material.Glass,
		Reflectance = 0.5,
		CanCollide = false,
	})
	for _, rx in ipairs({ -232, -208 }) do
		rod(
			kitchen,
			"MirrorRod",
			Vector3.new(rx, 28.1, 340.5),
			Vector3.new(rx, WALL_TOP, 340.5),
			0.2,
			DARK_METAL,
			Enum.Material.Metal,
			PAINT
		)
	end
	-- the pantry: tall shelves of jars on the west wall
	local pantry = box(kitchen, "Pantry", IX0, FLOOR_TOP, 330, IX0 + 2.6, 27.2, 349, LIGHT_WOOD, Enum.Material.Wood)
	local pantryGui = canvas(pantry, Enum.NormalId.Right, 16, Color3.fromRGB(120, 86, 52), 1)
	local jarColors = { FRUIT_RED, FRUIT_YELLOW, FRUIT_GREEN, Color3.fromRGB(190, 130, 80), WHITE, FRUIT_ORANGE }
	for row = 0, 4 do
		guiFrame(pantryGui, 0, 1.95 + row * 2, 19, 0.15, DARK_WOOD)
		for k = 0, 11 do
			local h = 1 + ((k + row) % 3) * 0.25
			guiFrame(pantryGui, 0.5 + k * 1.55, 1.95 + row * 2 - h, 1, h, jarColors[(k * 5 + row) % #jarColors + 1])
		end
	end
	BuildUtil.Look(pantry, "Pantry", "Oats, rice, pasta, beans and 40 kinds of spices. Everything a hungry linebacker needs!", {
		At = Vector3.new(1.6, -2, 0),
		Distance = 8,
	})

	-- Step 3: juice & smoothie lab (east side) ----------------------------------------------------
	BuildUtil.Stage(ctx, 3)
	local lab = BuildUtil.Child(ctx, "JuiceLab")
	local barX0, barX1 = -164, -160.5
	local bar = box(lab, "JuiceBar", barX0, FLOOR_TOP, 298, barX1, 20.6, 330, team.Secondary)
	sign(bar, Enum.NormalId.Left, "JUICE & SMOOTHIE LAB", team.Secondary, team, { InsetX = 0.12, InsetY = 0.24 })
	box(lab, "BarGlow", barX0 - 0.15, FLOOR_TOP + 0.3, 298.2, barX0, FLOOR_TOP + 0.6, 329.8, NEON_GREEN, Enum.Material.Neon, PAINT)
	local barTop = box(lab, "BarTop", barX0 - 0.4, 20.6, 297.6, barX1 + 0.3, 20.95, 330.4, LIGHT_WOOD, Enum.Material.Wood)
	BuildUtil.Use(ctx, barTop, "smoothie", {
		Action = "Grab a smoothie",
		Object = "Smoothie Bar",
		Title = "Juice & Smoothie Lab",
		Info = "The lab blends fruit, yogurt and oats into super smoothies. Pick a flavour from the menu board!",
		At = Vector3.new(-1, 0.5, 2),
		Distance = 8,
	})
	box(lab, "FruitCrate", barX0 - 0.1, 20.95, 300.5, barX1 - 0.4, 21.7, 305.5, WOOD, Enum.Material.WoodPlanks)
	for i, c in ipairs({ FRUIT_ORANGE, FRUIT_RED, FRUIT_YELLOW, FRUIT_GREEN }) do
		ball(lab, "Fruit", Vector3.new(-162.3 + (i % 2 - 0.5) * 0.9, 22.05, 301.4 + (i - 1) * 1.1), 0.8, c)
	end
	-- back counter with blenders and a juice press
	local back = box(lab, "BackCounter", -154.4, FLOOR_TOP, 298, IX1, 20.4, 330, WHITE)
	local blenderColors = { Color3.fromRGB(240, 110, 150), FRUIT_GREEN, FRUIT_ORANGE }
	for i, bz in ipairs({ 304, 311, 318 }) do
		box(lab, "BlenderBase", -153.1, 20.4, bz - 0.7, -151.7, 21.1, bz + 0.7, BLACK)
		cyl(lab, "BlenderJar", Vector3.new(-152.4, 22.05, bz), 1.9, 1.1, "Y", blenderColors[i], Enum.Material.Glass, { Transparency = 0.2 })
	end
	local press = box(lab, "JuicePress", -153.4, 20.4, 323, -151.4, 22.6, 326, CHROME, Enum.Material.Metal)
	cyl(lab, "JuiceJug", Vector3.new(-153.8, 21.2, 327.6), 1.6, 1.2, "Y", FRUIT_ORANGE, Enum.Material.Glass, { Transparency = 0.15 })
	BuildUtil.Look(press, "Juice Press", "Squeezes a whole bag of oranges in one minute. Fresh juice for the whole offensive line!", {
		Distance = 7,
	})
	-- menu board on the east wall
	local menu = box(lab, "MenuBoard", IX1 - 0.25, 22.2, 300, IX1, 28.2, 328, BLACK)
	local menuGui = canvas(menu, Enum.NormalId.Left, 16, Color3.fromRGB(24, 26, 30), 0.3)
	guiFrame(menuGui, 0, 0, 28, 1.5, team.Secondary)
	guiText(menuGui, 0.5, 0.2, 27, 1.1, "JUICE & SMOOTHIE LAB", textColorOn(team.Secondary, team), Enum.Font.GothamBlack)
	local menuItems = {
		{ "TOUCHDOWN TROPICAL", "MANGO - PINEAPPLE - BANANA", FRUIT_ORANGE },
		{ "BLITZ BERRY", "STRAWBERRY - BLUEBERRY - YOGURT", Color3.fromRGB(240, 110, 150) },
		{ "GREEN MACHINE", "SPINACH - APPLE - KIWI", FRUIT_GREEN },
		{ "END ZONE PB", "PEANUT BUTTER - BANANA - OATS", Color3.fromRGB(220, 170, 110) },
		{ "SUNRISE SQUEEZE", "FRESH ORANGE + CARROT JUICE", FRUIT_YELLOW },
	}
	for i, item in ipairs(menuItems) do
		local y = 1.95 + (i - 1) * 0.8
		guiDot(menuGui, 1.2, y + 0.3, 0.5, item[3])
		guiText(menuGui, 2, y, 11, 0.6, item[1], item[3], Enum.Font.GothamBlack, Enum.TextXAlignment.Left)
		guiText(menuGui, 13.6, y + 0.08, 13.8, 0.45, item[2], WHITE, Enum.Font.GothamBold, Enum.TextXAlignment.Left)
	end
	BuildUtil.Look(
		menu,
		"Smoothie Menu",
		"Try the Touchdown Tropical or the Blitz Berry. The Green Machine tastes better than it looks, promise!",
		{ At = Vector3.new(-0.5, -1, 6), Distance = 10 }
	)
	-- sports-drink fridge
	local drinks = box(lab, "DrinksFridge", -155.4, FLOOR_TOP, 333, IX1, 26, 341, DARK_METAL, Enum.Material.Metal)
	box(lab, "FridgeGlass", -155.55, 18, 333.5, -155.4, 25.4, 340.5, GLASS, Enum.Material.Glass, { Transparency = 0.5, CanCollide = false })
	-- the lit shelves of bottles are drawn on the fridge's own front face, behind the glass door
	local bottleGui = canvas(drinks, Enum.NormalId.Left, 20, nil, 0.3)
	guiFrame(bottleGui, 0.5, 0.6, 7, 7.4, Color3.fromRGB(230, 232, 236))
	local drinkColors = { FRUIT_ORANGE, NEON_CYAN, FRUIT_GREEN, Color3.fromRGB(240, 60, 90) }
	for row = 0, 2 do
		guiFrame(bottleGui, 0.5, 2.85 + row * 2.4, 7, 0.12, CHROME)
		for col = 0, 10 do
			guiFrame(bottleGui, 0.75 + col * 0.6, 1.25 + row * 2.4, 0.4, 1.6, drinkColors[(row + col) % 4 + 1])
		end
	end
	BuildUtil.Use(ctx, drinks, "sportsdrink", {
		Object = "Sports-Drink Fridge",
		Title = "Sports-Drink Fridge",
		Info = "Ice-cold sports drinks in every flavour. Players sip them all day to stay hydrated!",
		At = Vector3.new(-2.8, -1, 0),
		Distance = 8,
	})
	for i, sz in ipairs({ 303, 310, 317, 324 }) do
		stool(lab, -166.3, sz, "E", 20.4, team.Primary, { Object = "Juice Bar Stool", NoPrompt = i ~= 2 })
	end
	plant(lab, -152.4, 294.5, 0.9)
	-- a living herb wall for the green smoothies
	local herbs = box(lab, "HerbWall", IX1 - 0.3, 20.4, 344, IX1, 27.6, 356, LEAF_DARK, Enum.Material.Grass)
	box(lab, "HerbPlanter", IX1 - 1.4, FLOOR_TOP, 344, IX1, 20.4, 356, WOOD, Enum.Material.WoodPlanks)
	BuildUtil.Look(herbs, "Herb Wall", "Mint, basil and spinach grow right here. Chefs snip them fresh for the Green Machine smoothie!", {
		At = Vector3.new(-0.4, -1.5, 0),
		Distance = 8,
	})
	box(lab, "BackCounterTop", -154.6, 20.4, 297.8, IX1, 20.45, 330.2, MARBLE, Enum.Material.Marble, PAINT)
	BuildUtil.Look(back, "Blender Station", "Three blenders, zero lumps. The lab makes over 200 smoothies on a busy practice day!", {
		At = Vector3.new(-1.5, 2, 6),
		Distance = 7,
	})

	-- Step 4: two long family tables with benches, pendant lamps, the champion-plate mural ------------
	BuildUtil.Stage(ctx, 4)
	local dining = BuildUtil.Child(ctx, "Dining")
	local tx0, tx1 = -238, -198
	local tcx = (tx0 + tx1) / 2
	for t, tz in ipairs({ 296, 316 }) do
		box(dining, "TableTop", tx0, 20, tz - 2.5, tx1, 20.35, tz + 2.5, LIGHT_WOOD, Enum.Material.Wood)
		for _, lx in ipairs({ tx0 + 1.5, tcx, tx1 - 1.5 }) do
			box(dining, "TableLeg", lx - 0.3, FLOOR_TOP, tz - 1.8, lx + 0.3, 20, tz + 1.8, DARK_METAL, Enum.Material.Metal)
		end
		local benchColor = t == 1 and team.Primary or team.Secondary
		for side, dz in ipairs({ -3.9, 3.9 }) do
			local frame = frameAt(tcx, tz + dz, dz < 0 and "N" or "S")
			lblock(dining, frame, "BenchBase", Vector3.new(38, 1.5, 1.4), 0, 0, 0, DARK_WOOD, Enum.Material.Wood)
			for k = 1, 4 do
				lseat(dining, frame, Vector3.new(9.3, 0.4, 1.8), (k - 2.5) * 9.45, 1.5, 0, benchColor, Enum.Material.Leather, {
					Name = "BenchSeat",
					Object = "Team Table",
					NoPrompt = not ((side == 1 and k == 2) or (side == 2 and k == 3)),
				})
			end
		end
		-- a captain's chair at each end of the table
		chair(dining, frameAt(tx0 - 1.6, tz, "E"), team.Primary, {
			Object = "Captain's Chair",
			NoPrompt = t ~= 1,
			Material = Enum.Material.Leather,
			Width = 2.4,
			BackHeight = 3.4,
		})
		chair(dining, frameAt(tx1 + 1.6, tz, "W"), team.Primary, {
			Object = "Captain's Chair",
			NoPrompt = t ~= 2,
			Material = Enum.Material.Leather,
			Width = 2.4,
			BackHeight = 3.4,
		})
		-- three pendant lamps over each table
		for i, px0 in ipairs({ tcx - 11, tcx, tcx + 11 }) do
			local shadeLamp =
				cyl(dining, "PendantLamp", Vector3.new(px0, 25.4, tz), 1.2, 2.6, "Y", team.Primary, Enum.Material.Metal, NO_COLLIDE)
			if i ~= 2 then
				BuildUtil.Light(shadeLamp, "PointLight", { Name = "PendantLight", Range = 16, Brightness = 1.1, Color = WARM_LIGHT })
			end
			rod(
				dining,
				"PendantCord",
				Vector3.new(px0, 26, tz),
				Vector3.new(px0, WALL_TOP, tz),
				0.12,
				BLACK,
				Enum.Material.SmoothPlastic,
				PAINT
			)
		end
	end
	-- the CHAMPION PLATE mural on the west wall
	local mural = box(dining, "PlateMural", IX0, 20.6, 286, IX0 + 0.15, 27.8, 318, team.Primary)
	local muralGui = canvas(mural, Enum.NormalId.Right, 14, nil, 0.6)
	local ink = textColorOn(team.Primary, team)
	guiText(muralGui, 1, 0.5, 18, 2, "EAT LIKE A CHAMPION", ink, Enum.Font.GothamBlack)
	guiText(muralGui, 1, 2.6, 18, 0.9, "HALF VEGGIES - A QUARTER PROTEIN - A QUARTER GRAINS", ink, Enum.Font.GothamBold)
	guiDot(muralGui, 25, 3.6, 6.2, WHITE)
	guiDot(muralGui, 23.6, 3.6, 2.6, FRUIT_GREEN)
	guiDot(muralGui, 26.5, 2.6, 1.8, Color3.fromRGB(190, 130, 80))
	guiDot(muralGui, 26.5, 4.7, 1.8, Color3.fromRGB(230, 200, 140))
	guiFrame(muralGui, 1, 4.2, 18, 0.15, ink)
	guiText(muralGui, 1, 4.6, 18, 1.9, name, ink, Enum.Font.GothamBlack)
	BuildUtil.Look(
		mural,
		"The Champion Plate",
		"Half a plate of veggies and fruit, a quarter protein, a quarter grains. That's how champions fuel up!",
		{ At = Vector3.new(0, -1.5, 0), Distance = 10 }
	)
	plant(dining, -245.5, 324, 1)
	plant(dining, -190, 283.2, 1)
end

---------------------------------------------------------------------------------------------
-- Barbershop X[-150, -100]
---------------------------------------------------------------------------------------------

-- A chrome barber chair (foot plate, post, a real seat with a MIRROR CAM view, back, foot rest).
-- `frame` faces the mirror; `mirrorX` is where the mirror is (for the camera).
local function barberChair(ctx, frame, color, mirrorPos)
	cyl(ctx, "ChairPlate", (frame * CFrame.new(0, 0.15, 0)).Position, 0.3, 3.2, "Y", CHROME, Enum.Material.Metal)
	cyl(ctx, "ChairPost", (frame * CFrame.new(0, 1.1, 0)).Position, 1.6, 0.8, "Y", CHROME, Enum.Material.Metal)
	local seatPos = (frame * CFrame.new(0, 2.3, 0)).Position
	lseat(ctx, frame, Vector3.new(2.8, 0.8, 2.8), 0, 1.9, 0, color, Enum.Material.Leather, {
		Name = "BarberChair",
		Object = "Barber Chair",
		Camera = {
			From = mirrorPos,
			To = seatPos + Vector3.new(0, 1.6, 0),
			Fov = 50,
			Label = "MIRROR CAM",
		},
	})
	lblock(ctx, frame, "ChairBack", Vector3.new(2.8, 3.8, 0.7), 0, 2.3, 1.4, color, Enum.Material.Leather)
	lblock(ctx, frame, "FootRest", Vector3.new(2.2, 0.3, 1.2), 0, 0.9, -2, CHROME, Enum.Material.Metal)
end

function M.hq_barber(ctx)
	local team = ctx.colors
	local name = teamLabel(ctx)
	local wall = Color3.fromRGB(58, 60, 66)
	local IX0, IX1 = -149.6, -100.4
	local stationZ = { 304, 320, 336 }

	-- Step 1: shop walls, checkerboard floor, brick back wall, glass front, the barber pole --------------
	BuildUtil.Stage(ctx, 1)
	local room = BuildUtil.Child(ctx, "Shop")
	local shell = roomShell(room, {
		X0 = -150,
		X1 = -100,
		InnerX0 = IX0,
		InnerX1 = IX1,
		Walls = { { -150, IX0 }, { IX1, -100 } },
		Openings = {
			{ From = -147.5, To = -129.5, Sill = SILL, Mullions = 2 },
			{ From = -119, To = -111 },
		},
		WallColor = wall,
		WallMaterial = Enum.Material.SmoothPlastic,
		BackColor = Color3.fromRGB(150, 74, 56),
		BackMaterial = Enum.Material.Brick,
		FloorColor = WHITE,
		FloorMaterial = Enum.Material.SmoothPlastic,
		CeilingColor = Color3.fromRGB(44, 44, 50),
		Door = {
			Color = BLACK,
			Material = Enum.Material.SmoothPlastic,
			Window = true,
			Object = "Barbershop",
			Title = "Barbershop",
			Info = "Fresh cuts for game day! Players look their best when the cameras are rolling.",
		},
		Lights = { { -137, 300 }, { -113, 300 }, { -137, 334 }, { -113, 334 } },
		LightBrightness = 1.5,
	})
	-- black-and-white checkerboard on the white floor (GUI tiles, no extra parts)
	local floorGui = canvas(shell.Floor, Enum.NormalId.Top, 4, nil, 1)
	for i = 0, 12 do
		for j = 0, 20 do
			if (i + j) % 2 == 0 then
				guiFrame(floorGui, i * 4, j * 4, 4, 4, BLACK)
			end
		end
	end
	sign(
		shell.Lintel,
		Enum.NormalId.Back,
		name .. " BARBERSHOP",
		wall,
		team,
		{ TextColor3 = WHITE, InsetX = 0.12, Top = SIGN_TOP, Height = SIGN_H }
	)
	wallStripes(room, IX0, IX1, 20.6, team.Primary)
	-- the barber pole on the corridor wall, beside the door (no collision)
	local poleX, poleZ = -108.2, CW_OUT - 0.3
	cyl(room, "PoleCap", Vector3.new(poleX, 19.75, poleZ), 0.5, 0.95, "Y", CHROME, Enum.Material.Metal, PAINT)
	local pole = cyl(room, "BarberPole", Vector3.new(poleX, 22.5, poleZ), 5, 0.75, "Y", WHITE, Enum.Material.Glass, PAINT)
	for i, y in ipairs({ 20.6, 21.8, 23, 24.2 }) do
		cyl(
			room,
			"PoleStripe",
			Vector3.new(poleX, y, poleZ),
			0.45,
			0.8,
			"Y",
			i % 2 == 1 and FRUIT_RED or Color3.fromRGB(40, 80, 200),
			Enum.Material.Neon,
			PAINT
		)
	end
	local poleTop = ball(room, "PoleTop", Vector3.new(poleX, 25.3, poleZ), 0.95, CHROME, Enum.Material.Metal, PAINT)
	BuildUtil.Light(poleTop, "PointLight", { Name = "PoleGlow", Range = 8, Brightness = 1, Color = Color3.fromRGB(255, 220, 220) })
	BuildUtil.Look(
		pole,
		"Barber Pole",
		"Red, white and blue stripes mean a barbershop is open. This one spins for every touchdown!",
		{ Distance = 8 }
	)

	-- Step 2: six barber chairs at two station counters, a waiting sofa, two wash chairs -----------
	BuildUtil.Stage(ctx, 2)
	local chairs = BuildUtil.Child(ctx, "BarberChairs")
	local counterColor = DARK_WOOD
	for _, side in ipairs({ { x0 = IX0, x1 = -146.4 }, { x0 = -103.6, x1 = IX1 } }) do
		box(chairs, "StationCounter", side.x0, FLOOR_TOP, 296, side.x1, 20.4, 344, counterColor, Enum.Material.Wood)
		local top = box(chairs, "StationTop", side.x0, 20.4, 295.8, side.x1, 20.7, 344.2, MARBLE, Enum.Material.Marble)
		local topGui = canvas(top, Enum.NormalId.Top, 16, nil, 1)
		for k = 0, 2 do
			local y0 = 4 + k * 16
			guiFrame(topGui, 0.6, y0, 0.5, 2, BLACK) -- clippers
			guiFrame(topGui, 1.6, y0 + 0.2, 0.25, 1.6, team.Primary) -- comb
			guiDot(topGui, 2.5, y0 + 1.6, 0.6, NEON_CYAN) -- tonic bottle
		end
	end
	for _, z in ipairs(stationZ) do
		barberChair(chairs, frameAt(-108, z, "E"), team.Primary, Vector3.new(-101.4, 23.8, z))
		barberChair(chairs, frameAt(-141.6, z, "W"), team.Primary, Vector3.new(-148.6, 23.8, z))
	end
	-- waiting sofa under the window + a magazine table
	sofa(chairs, frameAt(-139, 281.2, "N"), 14, Color3.fromRGB(120, 66, 40), DARK_WOOD, { Object = "Waiting Sofa", BackHeight = 2.9 })
	local magazines = box(chairs, "MagazineTable", -142, FLOOR_TOP, 286.6, -136, 18.6, 289.4, DARK_WOOD, Enum.Material.Wood)
	local magGui = canvas(magazines, Enum.NormalId.Top, 20, nil, 1)
	guiFrame(magGui, 0.6, 0.5, 1.6, 2, team.Primary)
	guiFrame(magGui, 2.6, 0.7, 1.6, 2, NEON_ORANGE)
	guiFrame(magGui, 4.4, 0.4, 1.4, 1.9, WHITE)
	-- the checkout counter with a golden cash register, by the door
	box(chairs, "CheckoutCounter", -110, FLOOR_TOP, 283, -106, 20.6, 291, DARK_WOOD, Enum.Material.Wood)
	box(chairs, "CheckoutTop", -110.3, 20.6, 282.7, -105.7, 20.9, 291.3, MARBLE, Enum.Material.Marble)
	local register = box(chairs, "CashRegister", -109.2, 20.9, 285.5, -106.8, 22.3, 288, GOLD, Enum.Material.Metal)
	BuildUtil.Look(register, "Cash Register", "Ka-ching! Cuts are free for players, but the owner just loves the sound it makes.", {
		Distance = 7,
	})
	-- a gumball machine by the waiting sofa
	cyl(chairs, "GumballStand", Vector3.new(-130, FLOOR_TOP + 1.6, 282.6), 3.2, 0.5, "Y", FRUIT_RED, Enum.Material.Metal)
	local gumballs = ball(chairs, "GumballGlobe", Vector3.new(-130, FLOOR_TOP + 4.3, 282.6), 2.4, WHITE, Enum.Material.Glass, {
		Transparency = 0.5,
	})
	ball(chairs, "Gumballs", Vector3.new(-130, FLOOR_TOP + 4.1, 282.6), 1.8, NEON_PINK, Enum.Material.SmoothPlastic, NO_COLLIDE)
	cyl(chairs, "GumballCap", Vector3.new(-130, FLOOR_TOP + 5.6, 282.6), 0.5, 1, "Y", FRUIT_RED, Enum.Material.Metal)
	BuildUtil.Look(gumballs, "Gumball Machine", "One gumball after every haircut. The pink ones taste like victory!", { Distance = 7 })
	-- a product display island with the GOLDEN CLIPPERS trophy in the middle of the shop
	local display = box(chairs, "DisplayIsland", -128.5, FLOOR_TOP, 312, -121.5, 19.9, 324, DARK_WOOD, Enum.Material.Wood)
	local displayGui = canvas(display, Enum.NormalId.Top, 16, nil, 1)
	for k = 0, 5 do
		guiFrame(displayGui, 0.8 + (k % 2) * 3.6, 0.8 + math.floor(k / 2) * 3.8, 1.6, 1.6, k % 3 == 0 and team.Primary or NEON_CYAN)
	end
	local trophy = cyl(chairs, "GoldenClippers", Vector3.new(-125, 21.1, 318), 2.4, 1.6, "Y", GOLD, Enum.Material.Metal)
	BuildUtil.Look(
		trophy,
		"Golden Clippers",
		"Best Barbershop in the League, three years running. The trophy gets polished more than the chairs!",
		{
			Distance = 8,
		}
	)
	-- hair-wash basins on the back wall with two reclining wash chairs
	box(chairs, "WashCounter", -134, FLOOR_TOP, 354.15, -116, 20.4, LINE_Z, counterColor, Enum.Material.Wood)
	for i, wx in ipairs({ -129.5, -120.5 }) do
		cyl(chairs, "WashBasin", Vector3.new(wx, 20.8, 355.8), 0.8, 2.8, "Y", WHITE, Enum.Material.Marble)
		local f = frameAt(wx, 351, "S")
		lseat(chairs, f, Vector3.new(2.6, 1.9, 2.6), 0, 0, 0, BLACK, Enum.Material.Leather, {
			Name = "WashChair",
			Object = "Hair-Wash Chair",
			NoPrompt = i ~= 1,
		})
		BuildUtil.Part(chairs, {
			Name = "WashChairBack",
			Size = Vector3.new(2.6, 3.6, 0.6),
			CFrame = f * CFrame.new(0, 2.9, 1.9) * CFrame.Angles(math.rad(35), 0, 0),
			Color = BLACK,
			Material = Enum.Material.Leather,
		})
	end

	-- Step 3: neon mirrors, the FRESH CUTS sign, haircut menu, game-day TV, product shelf ----------
	BuildUtil.Stage(ctx, 3)
	local neon = BuildUtil.Child(ctx, "MirrorsNeon")
	for i, z in ipairs(stationZ) do
		local glow = i % 2 == 1 and NEON_PINK or NEON_CYAN
		for _, side in ipairs({ { x = IX1, dir = -1 }, { x = IX0, dir = 1 } }) do
			box(neon, "MirrorGlow", side.x, 21.1, z - 3.1, side.x + side.dir * 0.08, 27.9, z + 3.1, glow, Enum.Material.Neon)
			box(neon, "Mirror", side.x, 21.4, z - 2.8, side.x + side.dir * 0.15, 27.6, z + 2.8, MIRROR, Enum.Material.Glass, {
				Reflectance = 0.55,
			})
		end
	end
	-- the FRESH CUTS neon sign over the wash basins
	box(neon, "SignGlow", -133.2, 24.2, LINE_Z - 0.1, -116.8, 28.8, LINE_Z, NEON_PINK, Enum.Material.Neon)
	local freshCuts = box(neon, "FreshCutsSign", -132.8, 24.6, LINE_Z - 0.2, -117.2, 28.4, LINE_Z, BLACK)
	sign(freshCuts, Enum.NormalId.Front, "FRESH CUTS", BLACK, team, {
		TextColor3 = NEON_PINK,
		LightInfluence = 0,
		Font = Enum.Font.FredokaOne,
		InsetX = 0.08,
		InsetY = 0.12,
	})
	BuildUtil.Light(freshCuts, "PointLight", { Name = "SignGlow", Range = 14, Brightness = 1.2, Color = NEON_PINK })
	-- haircut menu on the west wall by the waiting sofa
	box(neon, "MenuGlow", IX0, 20.8, 283.7, IX0 + 0.08, 27.9, 294.3, NEON_CYAN, Enum.Material.Neon)
	local menu = box(neon, "HaircutMenu", IX0, 21.1, 284, IX0 + 0.2, 27.6, 294, BLACK)
	local menuGui = canvas(menu, Enum.NormalId.Right, 20, Color3.fromRGB(20, 20, 24), 0)
	guiText(menuGui, 0.5, 0.25, 9, 1, "HAIRCUT MENU", NEON_CYAN, Enum.Font.FredokaOne)
	local cuts = {
		{ "THE TOUCHDOWN FADE", "$12" },
		{ "THE BLITZ BUZZ", "$8" },
		{ "HAIL MARY MOHAWK", "$15" },
		{ "QUARTERBACK SWOOP", "$14" },
		{ "END ZONE FLAT TOP", "$11" },
		{ "THE FUMBLE FRO", "FREE" },
	}
	for i, c in ipairs(cuts) do
		local y = 1.55 + (i - 1) * 0.78
		guiText(menuGui, 0.5, y, 7.2, 0.55, c[1], WHITE, Enum.Font.GothamBold, Enum.TextXAlignment.Left)
		guiText(menuGui, 7.9, y, 1.6, 0.55, c[2], NEON_PINK, Enum.Font.GothamBlack, Enum.TextXAlignment.Right)
	end
	BuildUtil.Look(
		menu,
		"Haircut Menu",
		"Today's special: the Touchdown Fade. The Fumble Fro is free... because nobody ever asks for it!",
		{ At = Vector3.new(0.6, -1.5, 0), Distance = 9 }
	)
	BuildUtil.Light(menu, "PointLight", { Name = "MenuGlow", Range = 10, Brightness = 0.8, Color = NEON_CYAN })
	-- game-day TV on the east wall, opposite the sofa
	box(neon, "TVFrame", IX1 - 0.25, 22.3, 283.6, IX1, 28.4, 294.4, BLACK)
	local tvScreen = box(neon, "TV", IX1 - 0.4, 22.6, 284, IX1 - 0.25, 28.1, 294, SCREEN)
	liveScreen(tvScreen, Enum.NormalId.Left, "gameday", "NEXT GAME SOON", {
		PixelsPerStud = 20,
		Font = Enum.Font.GothamBlack,
		Header = "GAME DAY",
		HeaderBackground = team.Primary,
		HeaderColor = textColorOn(team.Primary, team),
	})
	-- product shelf on the brick wall
	local shelf = box(neon, "ProductShelf", -147, 21, 356.9, -137, 27.5, LINE_Z, DARK_WOOD, Enum.Material.Wood)
	local shelfGui = canvas(shelf, Enum.NormalId.Front, 16, nil, 1)
	local bottleColors = { NEON_CYAN, team.Primary, GOLD, WHITE, NEON_PINK }
	for row = 0, 2 do
		guiFrame(shelfGui, 0, 2 + row * 2.1, 10, 0.15, BLACK)
		for k = 0, 7 do
			local h = 0.9 + ((k + row) % 3) * 0.3
			guiFrame(shelfGui, 0.5 + k * 1.2, 2 + row * 2.1 - h, 0.7, h, bottleColors[(k + row) % #bottleColors + 1])
		end
	end
	BuildUtil.Look(shelf, "Hair Products", "Pomade, beard oil and super-strong gel. Enough to keep a helmet-hair disaster away!", {
		Distance = 7,
	})
	-- Edison bulbs hanging over the aisle
	for i, bz in ipairs({ 300, 316, 332, 348 }) do
		local bulb =
			ball(neon, "EdisonBulb", Vector3.new(-125, 25.2, bz), 0.9, Color3.fromRGB(255, 196, 110), Enum.Material.Neon, NO_COLLIDE)
		rod(neon, "BulbCord", Vector3.new(-125, 25.6, bz), Vector3.new(-125, WALL_TOP, bz), 0.1, BLACK, Enum.Material.SmoothPlastic, PAINT)
		if i % 2 == 0 then
			BuildUtil.Light(bulb, "PointLight", { Name = "BulbLight", Range = 14, Brightness = 0.9, Color = WARM_LIGHT })
		end
	end
	-- neon cove strips along the top of both side walls
	for _, s in ipairs({ { x = IX0, dir = 1, c = NEON_CYAN }, { x = IX1, dir = -1, c = NEON_PINK } }) do
		box(neon, "NeonCove", s.x, 28.9, 281, s.x + s.dir * 0.25, 29.2, 357, s.c, Enum.Material.Neon, PAINT)
	end
end

---------------------------------------------------------------------------------------------
-- Recovery Spa & Pool X[-100, 0]
---------------------------------------------------------------------------------------------

local POOL = { X0 = -70, X1 = -30, Z0 = 300, Z1 = 334, Wall = 2, Rim = 20.12, Water = 19.82, Bottom = 17.42 }
local SAUNA = { X0 = -24, X1 = -0.4, Z0 = 334, Top = 26.8, DoorX0 = -15.5, DoorX1 = -8.5, DoorTop = 25.9 }
local PLUNGE = { X0 = -22, X1 = -6, Z0 = 306, Z1 = 318, Top = 19.62, Water = 19.3 }
local MASSAGE = { X1 = -78, Z0 = 320, DoorX0 = -92, DoorX1 = -85, DoorTop = 25.9 }

-- A pool lounge chair (frame, a reclined back cushion, a seat) facing `facing`.
local function loungeChair(ctx, x, z, facing, color, noPrompt)
	local f = frameAt(x, z, facing)
	lblock(ctx, f, "LoungerFrame", Vector3.new(2.8, 1.2, 7), 0, 0, 0, WHITE)
	lseat(ctx, f, Vector3.new(2.6, 0.4, 3.6), 0, 1.2, -1.4, color, Enum.Material.Fabric, {
		Name = "LoungeChair",
		Object = "Lounge Chair",
		NoPrompt = noPrompt,
	})
	BuildUtil.Part(ctx, {
		Name = "LoungerBack",
		Size = Vector3.new(2.6, 0.5, 3.4),
		CFrame = f * CFrame.new(0, 2.4, 2) * CFrame.Angles(math.rad(-35), 0, 0),
		Color = color,
		Material = Enum.Material.Fabric,
	})
end

function M.hq_spa(ctx)
	local team = ctx.colors
	local name = teamLabel(ctx)
	local wall = Color3.fromRGB(214, 234, 234)
	local IX0, IX1 = -99.6, -0.4
	local frosted = Color3.fromRGB(230, 242, 246)

	-- Step 1: tiled spa, frosted windows, sliding glass doors, check-in desk, towel wall ---------
	BuildUtil.Stage(ctx, 1)
	local room = BuildUtil.Child(ctx, "Spa")
	local shell = roomShell(room, {
		X0 = -100,
		X1 = 0,
		InnerX0 = IX0,
		InnerX1 = IX1,
		Walls = { { -100, IX0 }, { IX1, 0 } },
		BackSegments = {},
		Openings = {
			{ From = -96, To = -60, Sill = HIGH_SILL, Mullions = 3, GlassColor = frosted, Transparency = 0.25 },
			{ From = -44, To = -36 },
			{ From = -30, To = -4, Sill = HIGH_SILL, Mullions = 2, GlassColor = frosted, Transparency = 0.25 },
		},
		WallColor = wall,
		WallMaterial = Enum.Material.CeramicTiles,
		BackColor = Color3.fromRGB(196, 224, 226),
		FloorColor = Color3.fromRGB(232, 228, 218),
		FloorMaterial = Enum.Material.Marble,
		CeilingColor = WHITE,
		Door = {
			Slide = true,
			Color = GLASS,
			Material = Enum.Material.Glass,
			Transparency = 0.4,
			Object = "Recovery Spa",
			Title = "Recovery Spa & Pool",
			Info = "Sore after practice? The spa has a warm pool, a cold plunge, a sauna and massages. Relax and recover!",
		},
		Lights = { { -86, 298 }, { -50, 317 }, { -15, 296 }, { -86, 340 }, { -50, 348 }, { -12, 326 } },
		LightColor = COOL_LIGHT,
		LightBrightness = 1.5,
	})
	sign(shell.Lintel, Enum.NormalId.Back, name .. " RECOVERY SPA", wall, team, { InsetX = 0.25, Top = SIGN_TOP, Height = SIGN_H })
	wallStripes(room, IX0, IX1, 22, team.Primary)
	-- check-in desk right inside the doors
	local desk = box(room, "CheckInDesk", -32, FLOOR_TOP, 285, -20, 20.6, 289, LIGHT_WOOD, Enum.Material.Wood)
	sign(desk, Enum.NormalId.Front, "RECOVERY SPA", LIGHT_WOOD, team, { TextColor3 = DARK_WOOD, InsetX = 0.1, InsetY = 0.28 })
	box(room, "DeskTop", -32.3, 20.6, 284.7, -19.7, 20.9, 289.3, WHITE, Enum.Material.Marble)
	-- towel wall on the east wall (look)
	local towels = box(room, "TowelWall", -3.4, FLOOR_TOP, 283, IX1, 25.4, 297, LIGHT_WOOD, Enum.Material.Wood)
	local towelGui = canvas(towels, Enum.NormalId.Left, 16, nil, 1)
	for row = 0, 3 do
		guiFrame(towelGui, 0, 0.6 + row * 2.05 + 1.55, 14, 0.12, DARK_WOOD)
		for k = 0, 8 do
			local c = (k + row) % 3 == 0 and team.Primary or WHITE
			guiDot(towelGui, 0.95 + k * 1.5, 0.6 + row * 2.05 + 0.85, 1.3, c)
		end
	end
	BuildUtil.Look(towels, "Towel Wall", "Fluffy towels in team colours. The spa washes over 500 of them every week!", {
		At = Vector3.new(-1.6, 0, 0),
		Distance = 8,
	})
	-- a cedar bench under the west window, the recovery poster, plants
	box(room, "BenchBase", -94, FLOOR_TOP, 280.4, -78, 18.5, 282.6, DARK_WOOD, Enum.Material.Wood)
	for i, bx in ipairs({ -90, -82 }) do
		BuildUtil.Seat(room, {
			Name = "SpaBench",
			Size = Vector3.new(7.8, 0.4, 2.2),
			CFrame = frameAt(bx, 281.5, "N", 18.7),
			Color = CEDAR_LIGHT,
			Material = Enum.Material.WoodPlanks,
			Object = "Spa Bench",
			NoPrompt = i ~= 1,
		})
	end
	local poster = box(room, "RecoveryPoster", IX0, 20.6, 290, IX0 + 0.15, 27.6, 312, team.Primary)
	local posterGui = canvas(poster, Enum.NormalId.Right, 14, nil, 0.6)
	local ink = textColorOn(team.Primary, team)
	guiText(posterGui, 1, 0.5, 20, 1.8, "RECOVERY = VICTORY", ink, Enum.Font.GothamBlack)
	guiFrame(posterGui, 1, 2.6, 20, 0.15, ink)
	local tips = { "SLEEP 9 HOURS", "DRINK LOTS OF WATER", "STRETCH EVERY DAY", "WARM POOL + COLD PLUNGE" }
	for i, tip in ipairs(tips) do
		guiText(posterGui, 2, 3.1 + (i - 1) * 0.9, 18, 0.7, tip, ink, Enum.Font.GothamBold, Enum.TextXAlignment.Left)
	end
	BuildUtil.Look(
		poster,
		"Recovery Rules",
		"Muscles grow while you rest! Sleep, water, stretching and the pool keep players fresh all season.",
		{ At = Vector3.new(0, -1.5, 0), Distance = 10 }
	)
	plant(room, -97, 316, 1.1)
	plant(room, -47.5, 282.2, 0.9)

	-- Step 2: the raised recovery pool --------------------------------------------------------------
	BuildUtil.Stage(ctx, 2)
	local pool = BuildUtil.Child(ctx, "RecoveryPool")
	local P = POOL
	local px0, px1, pz0, pz1, pw = P.X0, P.X1, P.Z0, P.Z1, P.Wall
	box(
		pool,
		"PoolDeck",
		px0 - 6,
		FLOOR_TOP,
		290,
		px1 + 4,
		FLOOR_TOP + 0.02,
		LINE_Z,
		Color3.fromRGB(150, 108, 72),
		Enum.Material.WoodPlanks,
		PAINT
	)
	box(pool, "PoolFloor", px0 + pw, FLOOR_TOP, pz0 + pw, px1 - pw, P.Bottom, pz1 - pw, POOL_TILE, Enum.Material.CeramicTiles)
	local south = box(pool, "PoolWall", px0, FLOOR_TOP, pz0, px1, P.Rim, pz0 + pw, WHITE, Enum.Material.Marble)
	box(pool, "PoolWall", px0, FLOOR_TOP, pz1 - pw, px1, P.Rim, pz1, WHITE, Enum.Material.Marble)
	box(pool, "PoolWall", px0, FLOOR_TOP, pz0 + pw, px0 + pw, P.Rim, pz1 - pw, WHITE, Enum.Material.Marble)
	box(pool, "PoolWall", px1 - pw, FLOOR_TOP, pz0 + pw, px1, P.Rim, pz1 - pw, WHITE, Enum.Material.Marble)
	box(pool, "PoolWater", px0 + pw, P.Bottom, pz0 + pw, px1 - pw, P.Water, pz1 - pw, WATER, Enum.Material.Glass, {
		Transparency = 0.4,
		CanCollide = false,
		CastShadow = false,
	})
	-- steps up to the rim (outside) and down into the water (inside): rises <= 0.75, 2 deep
	local sx0, sx1 = -54, -46
	local rise = (P.Rim - FLOOR_TOP) / 4
	for k = 1, 4 do
		box(pool, "PoolStep", sx0, FLOOR_TOP, pz0 - 10 + 2 * k, sx1, FLOOR_TOP + rise * k, pz0, WHITE, Enum.Material.Marble)
	end
	for k = 1, 3 do
		box(pool, "PoolStepIn", sx0, P.Bottom, pz0 + pw, sx1, P.Rim - rise * k, pz0 + pw + 2 * k, WHITE, Enum.Material.Marble)
	end
	-- handrails on both sides: posts at the bottom step, on the rim and on the last step inside
	local s1 = FLOOR_TOP + rise
	local railPoints = {
		Vector3.new(0, s1, pz0 - 7.5),
		Vector3.new(0, P.Rim, pz0 + 1),
		Vector3.new(0, s1, pz0 + pw + 5.5),
	}
	for _, rx in ipairs({ sx0 - 0.3, sx1 + 0.3 }) do
		for k, pt in ipairs(railPoints) do
			local base = Vector3.new(rx, pt.Y, pt.Z)
			rod(pool, "RailPost", base, base + Vector3.new(0, 3, 0), 0.25, CHROME, Enum.Material.Metal, PAINT)
			if k > 1 then
				local prev = railPoints[k - 1]
				rod(
					pool,
					"HandRail",
					Vector3.new(rx, prev.Y + 3, prev.Z),
					base + Vector3.new(0, 3, 0),
					0.25,
					CHROME,
					Enum.Material.Metal,
					PAINT
				)
			end
		end
	end
	BuildUtil.Look(
		south,
		"Recovery Pool",
		"Warm water and bubbly jets help tired legs recover after practice. Walk up the steps and hop in!",
		{ At = Vector3.new(12, 0.6, 0), Distance = 9 }
	)
	-- a team logo on the pool floor (GUI on an invisible plate; reads from the steps)
	local logo = BuildUtil.Part(pool, {
		Name = "PoolLogo",
		Size = Vector3.new(14, 0.02, 14),
		CFrame = CFrame.new((px0 + px1) / 2, P.Bottom + 0.02, 320) * CFrame.Angles(0, math.pi, 0),
		Transparency = 1,
		CanCollide = false,
		CastShadow = false,
	})
	local logoGui = canvas(logo, Enum.NormalId.Top, 16, nil, 1)
	guiDot(logoGui, 7, 7, 13.6, team.Secondary)
	guiDot(logoGui, 7, 7, 12, team.Primary)
	guiText(logoGui, 2, 5.6, 10, 2.8, name, textColorOn(team.Primary, team), Enum.Font.GothamBlack)
	-- underwater light along the north wall
	local glow =
		box(pool, "PoolGlow", px0 + pw + 1, 18.2, pz1 - pw - 0.12, px1 - pw - 1, 18.5, pz1 - pw, NEON_CYAN, Enum.Material.Neon, PAINT)
	BuildUtil.Light(glow, "PointLight", { Name = "PoolLight", Range = 24, Brightness = 1.4, Color = NEON_CYAN })
	-- waterfall wall on the north rim
	local stone = box(pool, "WaterfallStone", -57, P.Rim, pz1 - pw, -43, 25.4, pz1, SLATE, Enum.Material.Slate)
	box(pool, "WaterfallSpout", -56, 24.7, pz1 - pw - 0.8, -44, 25.1, pz1 - pw, SLATE, Enum.Material.Slate)
	box(
		pool,
		"Waterfall",
		-55.5,
		P.Water,
		pz1 - pw - 0.7,
		-44.5,
		24.7,
		pz1 - pw - 0.4,
		Color3.fromRGB(130, 215, 250),
		Enum.Material.Glass,
		{
			Transparency = 0.35,
			CanCollide = false,
			CastShadow = false,
		}
	)
	box(pool, "WaterfallFoam", -56, P.Water - 0.03, pz1 - pw - 2.2, -44, P.Water + 0.03, pz1 - pw, WHITE, Enum.Material.SmoothPlastic, {
		Transparency = 0.2,
		CanCollide = false,
		CastShadow = false,
	})
	box(pool, "WaterfallPlants", -56.6, 25.4, pz1 - pw + 0.3, -43.4, 26.3, pz1 - 0.2, LEAF, Enum.Material.Grass)
	BuildUtil.Look(stone, "Waterfall", "The sound of falling water helps players relax. Some say it's the best nap spot in the building!", {
		At = Vector3.new(0, 0, 1.5),
		Distance = 9,
	})
	-- lounge chairs on the deck behind the pool, facing the water
	for i, lx in ipairs({ -66, -60.5, -39.5, -34 }) do
		loungeChair(pool, lx, 346, "S", i <= 2 and team.Primary or team.Secondary, i ~= 1 and i ~= 4)
	end

	-- Step 3: cedar sauna + cold plunge tubs + rinse shower -------------------------------------------
	BuildUtil.Stage(ctx, 3)
	local sauna = BuildUtil.Child(ctx, "Sauna")
	local S = SAUNA
	box(sauna, "SaunaWall", S.X0, FLOOR_TOP, S.Z0, S.X0 + 0.8, S.Top, BACK_Z, CEDAR, Enum.Material.WoodPlanks)
	local saunaFront = box(sauna, "SaunaWall", S.X0 + 0.8, FLOOR_TOP, S.Z0, S.DoorX0, S.Top, S.Z0 + 0.8, CEDAR, Enum.Material.WoodPlanks)
	box(sauna, "SaunaWall", S.DoorX1, FLOOR_TOP, S.Z0, S.X1, S.Top, S.Z0 + 0.8, CEDAR, Enum.Material.WoodPlanks)
	local saunaLintel = box(sauna, "SaunaLintel", S.DoorX0, S.DoorTop, S.Z0, S.DoorX1, S.Top, S.Z0 + 0.8, CEDAR, Enum.Material.WoodPlanks)
	sign(saunaLintel, Enum.NormalId.Front, "SAUNA", CEDAR, team, { TextColor3 = WHITE, InsetX = 0.2, InsetY = 0.1 })
	box(sauna, "SaunaCeiling", S.X0, S.Top, S.Z0, S.X1, S.Top + 0.4, BACK_Z, CEDAR, Enum.Material.WoodPlanks)
	box(sauna, "SaunaLining", S.X1 - 0.3, FLOOR_TOP, S.Z0 + 0.8, S.X1, S.Top, LINE_Z, CEDAR_LIGHT, Enum.Material.WoodPlanks)
	box(sauna, "SaunaLining", S.X0 + 0.8, FLOOR_TOP, LINE_Z - 0.3, S.X1 - 0.3, S.Top, BACK_Z, CEDAR_LIGHT, Enum.Material.WoodPlanks)
	BuildUtil.Door(sauna, {
		Name = "SaunaDoor",
		Size = Vector3.new(S.DoorX1 - S.DoorX0, S.DoorTop - FLOOR_TOP - 0.1, 0.3),
		CFrame = CFrame.new((S.DoorX0 + S.DoorX1) / 2, FLOOR_TOP + 0.05 + (S.DoorTop - FLOOR_TOP - 0.1) / 2, S.Z0 + 0.4),
		Double = true,
		Swing = -95,
		Window = true,
		Color = CEDAR_LIGHT,
		Material = Enum.Material.Wood,
		Object = "Sauna",
		Title = "Sauna",
		Info = "A hot cedar room (about 80 degrees C). Ten minutes in here, then a cold plunge - players swear by it!",
		Distance = 8,
	})
	-- two bench tiers along the back wall with towel seats
	box(sauna, "SaunaBench", S.X0 + 0.8, FLOOR_TOP, 349.5, S.X1 - 0.3, 18.9, 353.6, CEDAR_LIGHT, Enum.Material.WoodPlanks)
	box(sauna, "SaunaBench", S.X0 + 0.8, FLOOR_TOP, 353.6, S.X1 - 0.3, 20.7, LINE_Z - 0.3, CEDAR_LIGHT, Enum.Material.WoodPlanks)
	for i, spot in ipairs({ { -18, 351.4, 18.9 }, { -7, 351.4, 18.9 }, { -12.5, 355.6, 20.7 } }) do
		BuildUtil.Seat(sauna, {
			Name = "SaunaTowel",
			Size = Vector3.new(3, 0.25, 2.4),
			CFrame = frameAt(spot[1], spot[2], "S", spot[3] + 0.125),
			Color = WHITE,
			Material = Enum.Material.Fabric,
			Object = "Sauna Bench",
			NoPrompt = i == 2,
		})
	end
	local heater = box(sauna, "SaunaHeater", -22.8, FLOOR_TOP, 337.5, -19.2, 20.3, 341.5, DARK_METAL, Enum.Material.Metal)
	local rocks = box(sauna, "SaunaRocks", -22.6, 20.3, 337.7, -19.4, 21, 341.3, SLATE, Enum.Material.Slate)
	BuildUtil.Light(rocks, "PointLight", { Name = "HeaterGlow", Range = 10, Brightness = 1, Color = NEON_ORANGE })
	BuildUtil.Look(heater, "Sauna Heater", "Hot rocks warm the whole room. Splash a little water on them and - tssss - instant steam!", {
		Distance = 7,
	})
	local saunaLamp = box(sauna, "SaunaLamp", -13.5, 24.4, LINE_Z - 0.55, -11.5, 25.2, LINE_Z - 0.3, NEON_ORANGE, Enum.Material.Neon, PAINT)
	BuildUtil.Light(saunaLamp, "PointLight", { Name = "SaunaLight", Range = 18, Brightness = 1, Color = WARM_LIGHT })
	local thermo = canvas(saunaFront, Enum.NormalId.Front, 16, nil, 1)
	guiFrame(thermo, 2.4, 2, 2.6, 4.6, WHITE)
	guiFrame(thermo, 3.55, 2.4, 0.3, 3.2, FRUIT_RED)
	guiDot(thermo, 3.7, 5.8, 0.8, FRUIT_RED)
	guiText(thermo, 1.6, 6.8, 4.2, 0.8, "80 C / 176 F", WHITE, Enum.Font.GothamBlack)

	-- the cold plunge: two icy tubs with steps up and in
	local plunge = BuildUtil.Child(ctx, "ColdPlunge")
	local C = PLUNGE
	local tubColor = Color3.fromRGB(176, 196, 210)
	box(plunge, "PlungeWall", C.X0, FLOOR_TOP, C.Z0, C.X1, C.Top, C.Z0 + 1, tubColor, Enum.Material.Marble)
	box(plunge, "PlungeWall", C.X0, FLOOR_TOP, C.Z1 - 1, C.X1, C.Top, C.Z1, tubColor, Enum.Material.Marble)
	box(plunge, "PlungeWall", C.X0, FLOOR_TOP, C.Z0 + 1, C.X0 + 1, C.Top, C.Z1 - 1, tubColor, Enum.Material.Marble)
	box(plunge, "PlungeWall", C.X1 - 1, FLOOR_TOP, C.Z0 + 1, C.X1, C.Top, C.Z1 - 1, tubColor, Enum.Material.Marble)
	box(plunge, "PlungeWall", -14.5, FLOOR_TOP, C.Z0 + 1, -13.5, C.Top, C.Z1 - 1, tubColor, Enum.Material.Marble)
	local plungeRise = (C.Top - FLOOR_TOP) / 3
	box(plunge, "PlungeStep", C.X0, FLOOR_TOP, C.Z0 - 3, C.X1, FLOOR_TOP + plungeRise, C.Z0, tubColor, Enum.Material.Marble)
	box(plunge, "PlungeStep", C.X0, FLOOR_TOP, C.Z0 - 1.5, C.X1, FLOOR_TOP + 2 * plungeRise, C.Z0, tubColor, Enum.Material.Marble)
	for _, tub in ipairs({ { C.X0 + 1, -14.5 }, { -13.5, C.X1 - 1 } }) do
		box(plunge, "PlungeStepIn", tub[1], FLOOR_TOP, C.Z0 + 1, tub[2], FLOOR_TOP + plungeRise, C.Z0 + 4, tubColor, Enum.Material.Marble)
		box(
			plunge,
			"PlungeStepIn",
			tub[1],
			FLOOR_TOP,
			C.Z0 + 1,
			tub[2],
			FLOOR_TOP + 2 * plungeRise,
			C.Z0 + 2.5,
			tubColor,
			Enum.Material.Marble
		)
		local water = box(
			plunge,
			"PlungeWater",
			tub[1],
			FLOOR_TOP,
			C.Z0 + 1,
			tub[2],
			C.Water,
			C.Z1 - 1,
			Color3.fromRGB(140, 205, 245),
			Enum.Material.Glass,
			{
				Transparency = 0.3,
				CanCollide = false,
				CastShadow = false,
			}
		)
		local iceGui = canvas(water, Enum.NormalId.Top, 10, nil, 1)
		for k = 0, 4 do
			guiFrame(iceGui, 0.8 + (k * 1.37) % 5, 1 + k * 1.6, 0.9, 0.9, WHITE, 0.15)
		end
	end
	local plungeSign = box(plunge, "PlungeSign", IX1 - 0.15, 21, 307.5, IX1, 25.6, 316.5, Color3.fromRGB(40, 110, 170))
	local plungeGui = canvas(plungeSign, Enum.NormalId.Left, 16, nil, 0.4)
	guiText(plungeGui, 0.5, 0.4, 8, 1.6, "COLD PLUNGE", WHITE, Enum.Font.GothamBlack)
	guiText(plungeGui, 0.5, 2.3, 8, 1.6, "10 C / 50 F", ICE, Enum.Font.GothamBlack)
	BuildUtil.Look(
		plungeSign,
		"Cold Plunge",
		"Brrr! Ice-cold water calms sore muscles after a hard practice. Can you stay in for one whole minute?",
		{ At = Vector3.new(-1, -1, 0), Distance = 10 }
	)
	-- a rinse shower between the plunge and the sauna
	cyl(plunge, "ShowerPipe", Vector3.new(-1.2, 22.2, 325), 10, 0.35, "Y", CHROME, Enum.Material.Metal)
	local showerHead = cyl(plunge, "ShowerHead", Vector3.new(-2.6, 26.6, 325), 0.3, 2.4, "Y", CHROME, Enum.Material.Metal, NO_COLLIDE)
	box(plunge, "ShowerArm", -2.6, 26.9, 324.85, -1.2, 27.1, 325.15, CHROME, Enum.Material.Metal, NO_COLLIDE)
	BuildUtil.Look(showerHead, "Rinse Shower", "Warm, cold, warm, cold! Players rinse off here between the sauna and the plunge.", {
		At = Vector3.new(0, -4, 0),
		Distance = 8,
	})

	-- Step 4: the massage room (west, behind its own door) -------------------------------------------
	BuildUtil.Stage(ctx, 4)
	local massage = BuildUtil.Child(ctx, "MassageRoom")
	local Mz = MASSAGE
	local mWall = Color3.fromRGB(206, 186, 160)
	box(massage, "MassageWall", IX0, FLOOR_TOP, Mz.Z0, Mz.DoorX0, WALL_TOP, Mz.Z0 + 0.8, mWall, Enum.Material.Plaster)
	local mPier = box(massage, "MassageWall", Mz.DoorX1, FLOOR_TOP, Mz.Z0, Mz.X1 - 0.8, WALL_TOP, Mz.Z0 + 0.8, mWall, Enum.Material.Plaster)
	local mLintel =
		box(massage, "MassageLintel", Mz.DoorX0, Mz.DoorTop, Mz.Z0, Mz.DoorX1, WALL_TOP, Mz.Z0 + 0.8, mWall, Enum.Material.Plaster)
	sign(mLintel, Enum.NormalId.Front, "MASSAGE", mWall, team, { TextColor3 = DARK_WOOD, InsetX = 0.15, Top = 0.08, Height = 0.3 })
	box(massage, "MassageWall", Mz.X1 - 0.8, FLOOR_TOP, Mz.Z0, Mz.X1, WALL_TOP, BACK_Z, mWall, Enum.Material.Plaster)
	box(massage, "BackWallLining", IX0, FLOOR_TOP, LINE_Z, Mz.X1 - 0.8, WALL_TOP - 0.8, BACK_Z, mWall, Enum.Material.Plaster)
	BuildUtil.Door(massage, {
		Name = "MassageDoor",
		Size = Vector3.new(Mz.DoorX1 - Mz.DoorX0, Mz.DoorTop - FLOOR_TOP - 0.1, 0.3),
		CFrame = CFrame.new((Mz.DoorX0 + Mz.DoorX1) / 2, FLOOR_TOP + 0.05 + (Mz.DoorTop - FLOOR_TOP - 0.1) / 2, Mz.Z0 + 0.4),
		Double = true,
		Swing = -95,
		Color = WOOD,
		Material = Enum.Material.Wood,
		Object = "Massage Room",
		Title = "Massage Room",
		Info = "Soft music, candles and expert hands. A massage after a big game helps players bounce back fast.",
		Distance = 8,
	})
	box(massage, "MassageRug", -97, FLOOR_TOP, 324, -81, FLOOR_TOP + 0.03, 348, Color3.fromRGB(150, 120, 96), Enum.Material.Fabric, PAINT)
	for i, mx in ipairs({ -93.5, -85 }) do
		box(massage, "TableBase", mx - 1.2, FLOOR_TOP, 331, mx + 1.2, 19.6, 339, DARK_WOOD, Enum.Material.Wood)
		BuildUtil.Seat(massage, {
			Name = "MassageTable",
			Size = Vector3.new(3, 0.6, 8),
			CFrame = frameAt(mx, 335, "S", 19.9),
			Color = i == 1 and team.Primary or WHITE,
			Material = Enum.Material.Leather,
			Object = "Massage Table",
		})
		box(massage, "FaceCradle", mx - 0.8, 19.7, 339, mx + 0.8, 20.2, 340.6, WHITE, Enum.Material.Leather)
	end
	-- towel shelves on the west wall
	local shelf = box(massage, "TowelShelves", IX0, FLOOR_TOP, 343, IX0 + 2.6, 25.2, 355, LIGHT_WOOD, Enum.Material.Wood)
	local shelfGui = canvas(shelf, Enum.NormalId.Right, 16, nil, 1)
	for row = 0, 3 do
		guiFrame(shelfGui, 0, 0.5 + row * 2 + 1.5, 12, 0.12, DARK_WOOD)
		for k = 0, 6 do
			guiFrame(shelfGui, 0.6 + k * 1.6, 0.5 + row * 2 + 0.6, 1.3, 0.9, k % 2 == 0 and WHITE or team.Secondary)
		end
	end
	-- candles + an oil cart
	local cart = box(massage, "OilCart", -82.6, FLOOR_TOP, 350, -80, 20.2, 353.6, DARK_WOOD, Enum.Material.Wood)
	for k, c in ipairs({ { -81.9, 350.8 }, { -80.7, 351.4 } }) do
		local candle = cyl(
			massage,
			"Candle",
			Vector3.new(c[1], 20.6, c[2]),
			0.8,
			0.6,
			"Y",
			Color3.fromRGB(255, 200, 120),
			Enum.Material.Neon,
			NO_COLLIDE
		)
		if k == 1 then
			BuildUtil.Light(candle, "PointLight", { Name = "CandleGlow", Range = 14, Brightness = 0.9, Color = NEON_ORANGE })
		end
	end
	BuildUtil.Look(cart, "Massage Oils", "Lavender, eucalyptus and peppermint oils. Smells like a forest... a very relaxing forest.", {
		Distance = 7,
	})
	local calm = box(massage, "CalmMural", -97, 21, LINE_Z - 0.1, -83, 27, LINE_Z, Color3.fromRGB(120, 160, 150))
	local calmGui = canvas(calm, Enum.NormalId.Front, 14, nil, 0.7)
	guiDot(calmGui, 7, 2.4, 2.6, Color3.fromRGB(250, 220, 160))
	guiText(calmGui, 1, 4, 12, 1.4, "RELAX. RECOVER. REPEAT.", WHITE, Enum.Font.GothamBlack)
	plant(massage, -81, 324.5, 0.9)
	BuildUtil.Look(mPier, "Massage Room", "Book a massage after every game. Players say it's the best part of the week!", {
		At = Vector3.new(0, -2, -0.6),
		Distance = 7,
	})
end

---------------------------------------------------------------------------------------------
-- Player Development Center X[0, 98]
---------------------------------------------------------------------------------------------

-- A study pod against the classroom glass: back, sides, a canopy, a desk shelf and a chair.
local function studyPod(ctx, z, team, lampColor, noPrompt)
	local x0, x1 = 38.4, 44
	box(ctx, "PodBack", x0, FLOOR_TOP, z - 3.5, x0 + 0.6, 26, z + 3.5, team.Primary)
	box(ctx, "PodSide", x0 + 0.6, FLOOR_TOP, z - 3.5, x1, 26, z - 3.1, team.Primary)
	box(ctx, "PodSide", x0 + 0.6, FLOOR_TOP, z + 3.1, x1, 26, z + 3.5, team.Primary)
	box(ctx, "PodRoof", x0, 26, z - 3.5, x1, 26.4, z + 3.5, shade(team.Primary, 0.7))
	box(ctx, "PodDesk", x0 + 0.6, 19.9, z - 3.1, x0 + 2.8, 20.2, z + 3.1, LIGHT_WOOD, Enum.Material.Wood)
	box(ctx, "PodLamp", x0 + 0.65, 25.6, z - 2.4, x0 + 1, 25.9, z + 2.4, lampColor, Enum.Material.Neon, PAINT)
	chair(ctx, frameAt(x0 + 4, z, "W"), team.Secondary, { Object = "Study Pod", NoPrompt = noPrompt, Name = "PodChair" })
end

-- Armchair facing `facing`: a seat block, a back and two arms.
local function armchair(ctx, x, z, facing, color)
	local f = frameAt(x, z, facing)
	lseat(ctx, f, Vector3.new(3, 1.8, 3), 0, 0, 0, color, Enum.Material.Fabric, { Name = "Armchair", Object = "Reading Chair" })
	lblock(ctx, f, "ArmchairBack", Vector3.new(3.8, 4, 0.8), 0, 0, 1.9, color, Enum.Material.Fabric)
	for _, s in ipairs({ -1, 1 }) do
		lblock(ctx, f, "ArmchairArm", Vector3.new(0.4, 2.7, 3), s * 1.7, 0, 0, color, Enum.Material.Fabric)
	end
end

-- Arcade cabinet against the east wall, facing -X. Press E at the controls to play.
local function arcadeCabinet(ctx, z, bodyColor, glow, title, team)
	local f = frameAt(96.2, z, "W")
	lblock(ctx, f, "ArcadeBody", Vector3.new(3.4, 7.6, 3.4), 0, 0, 0, bodyColor)
	local controls = lblock(ctx, f, "ArcadeControls", Vector3.new(3.4, 0.5, 1.4), 0, 3.4, -2.4, DARK_METAL)
	BuildUtil.Use(ctx, controls, "arcade", { Object = title, Title = title, Distance = 7 })
	local screen = BuildUtil.Part(ctx, {
		Name = "ArcadeScreen",
		Size = Vector3.new(2.8, 2.4, 0.12),
		CFrame = f * CFrame.new(0, 5.2, -1.72) * CFrame.Angles(math.rad(-10), 0, 0),
		Color = glow,
		Material = Enum.Material.Neon,
	})
	local gui = canvas(screen, Enum.NormalId.Front, 30, shade(glow, 0.35), 0)
	guiText(gui, 0.2, 0.3, 2.4, 0.6, "PRESS START", WHITE, Enum.Font.Arcade)
	guiRing(gui, 1.4, 1.5, 0.5, 0.08, glow)
	local marquee = lblock(ctx, f, "ArcadeMarquee", Vector3.new(3.6, 1.1, 1), 0, 6.6, -1.5, glow, Enum.Material.Neon)
	sign(
		marquee,
		Enum.NormalId.Front,
		title,
		glow,
		team,
		{ TextColor3 = INK, InsetX = 0.05, InsetY = 0.12, LightInfluence = 0, Font = Enum.Font.Arcade }
	)
end

function M.hq_players(ctx)
	local team = ctx.colors
	local name = teamLabel(ctx)
	local wall = Color3.fromRGB(240, 240, 236)
	local IX0, IX1 = 0.4, 98.05

	-- Step 1: walls, carpet and the glass classroom ------------------------------------------------
	BuildUtil.Stage(ctx, 1)
	local room = BuildUtil.Child(ctx, "Room")
	local shell = roomShell(room, {
		X0 = 0,
		X1 = 98.45,
		InnerX0 = IX0,
		InnerX1 = IX1,
		Walls = { { 0, IX0 } },
		Linings = { { IX1, 98.45 } },
		BackSegments = {},
		Openings = {
			{ From = 4, To = 38, Sill = SILL, Mullions = 3 },
			{ From = 55, To = 63 },
			{ From = 68, To = 94, Sill = SILL, Mullions = 2 },
		},
		WallColor = wall,
		FloorColor = Color3.fromRGB(78, 84, 96),
		FloorMaterial = Enum.Material.Carpet,
		CeilingColor = WHITE,
		Door = {
			Color = WOOD,
			Material = Enum.Material.Wood,
			Window = true,
			Object = "Player Development",
			Title = "Player Development Center",
			Info = "Where players grow off the field: classes, a library, study pods and (after homework) the gaming lounge!",
		},
		Lights = { { 18, 300 }, { 51, 300 }, { 82, 300 }, { 18, 336 }, { 51, 336 }, { 82, 336 } },
	})
	sign(
		shell.Lintel,
		Enum.NormalId.Back,
		name .. " PLAYER DEVELOPMENT CENTER",
		wall,
		team,
		{ InsetX = 0.25, Top = SIGN_TOP, Height = SIGN_H }
	)
	wallStripes(room, IX0, IX1, 24.2, team.Primary)
	-- the classroom's glass wall (open at the front: z 279 - 292)
	box(room, "ClassroomGlass", 38, FLOOR_TOP, 292, 38.3, WALL_TOP, BACK_Z, GLASS, Enum.Material.Glass, { Transparency = 0.55 })
	box(room, "GlassPost", 37.85, FLOOR_TOP, 291.6, 38.45, WALL_TOP, 292, DARK_METAL, Enum.Material.Metal)
	-- the season screen on the west wall (live) + a playbook whiteboard
	box(room, "ScreenFrame", IX0, 20.4, 311.6, IX0 + 0.3, 28.4, 328.4, BLACK)
	local screen = box(room, "ClassScreen", IX0 + 0.3, 20.8, 312, IX0 + 0.45, 28, 328, SCREEN)
	liveScreen(screen, Enum.NormalId.Right, "season", "SEASON 1 - WEEK 1", {
		PixelsPerStud = 20,
		TextColor3 = WHITE,
		Font = Enum.Font.GothamBlack,
		Header = "THIS SEASON",
		HeaderBackground = team.Primary,
		HeaderColor = textColorOn(team.Primary, team),
	})
	BuildUtil.Look(screen, "Season Tracker", "Every class starts with the standings. Win more games to make the playoffs!", {
		LookKey = "season",
		Distance = 10,
	})
	local board = box(room, "Whiteboard", IX0, 20.8, 331, IX0 + 0.2, 27, 345, WHITE)
	local boardGui = canvas(board, Enum.NormalId.Right, 16, nil, 0.4)
	guiText(boardGui, 0.5, 0.3, 13, 1, "PLAYBOOK 101", Color3.fromRGB(28, 60, 150), Enum.Font.PermanentMarker)
	for i = 0, 4 do
		guiRing(boardGui, 2 + i * 2.4, 3.6, 0.9, 0.1, Color3.fromRGB(200, 36, 36))
	end
	for i = 0, 3 do
		guiText(boardGui, 2.6 + i * 2.6, 1.9, 0.9, 0.9, "X", Color3.fromRGB(28, 60, 150), Enum.Font.PermanentMarker)
	end
	guiText(boardGui, 0.5, 4.6, 13, 0.9, "HOMEWORK: LEARN 3 PLAYS", Color3.fromRGB(30, 30, 34), Enum.Font.PermanentMarker)
	-- the TOP PLAYERS board on the corridor wall, behind the buy button
	box(room, "BoardFrame", 41.6, 20.4, CW_IN, 52.4, 27.6, CW_IN + 0.2, team.Primary)
	local lineup = box(room, "TopPlayersBoard", 42, 20.8, CW_IN + 0.2, 52, 27.2, CW_IN + 0.35, SCREEN)
	liveScreen(lineup, Enum.NormalId.Back, "roster", "QB  -\nRB  -\nWR  -\nOL  -\nDEF  -\nK  -", {
		PixelsPerStud = 20,
		TextColor3 = WHITE,
		Header = "TOP PLAYERS",
		HeaderShare = 0.18,
		HeaderBackground = team.Primary,
		HeaderColor = textColorOn(team.Primary, team),
	})
	BuildUtil.Look(lineup, "Top Players", "Your best player at every position. Draft and train players to see new names up here!", {
		LookKey = "rating",
		Distance = 9,
	})
	box(room, "TeacherDesk", 4, FLOOR_TOP, 296, 8, 20.2, 304, DARK_WOOD, Enum.Material.Wood)
	local laptop = box(room, "Laptop", 5, 20.2, 299, 6.6, 21.4, 301.4, DARK_METAL, Enum.Material.Metal)
	BuildUtil.Look(
		laptop,
		"Coach's Laptop",
		"The coach clicks through game film and quizzes here. Pop quiz: how many points is a touchdown? (6!)",
		{
			Distance = 7,
		}
	)
	-- three rows of desks, students facing the screen (west)
	-- (9 apart: a 4-stud aisle between a row's chair backs and the next row's desks)
	for r, dx in ipairs({ 12, 21, 30 }) do
		box(room, "DeskTop", dx - 1.3, 19.9, 306, dx + 1.3, 20.2, 334, LIGHT_WOOD, Enum.Material.Wood)
		for _, ez in ipairs({ 306, 333.7 }) do
			box(room, "DeskLeg", dx - 1.3, FLOOR_TOP, ez, dx + 1.3, 19.9, ez + 0.3, DARK_METAL, Enum.Material.Metal)
		end
		for k, cz in ipairs({ 309.5, 316.5, 323.5, 330.5 }) do
			chair(room, frameAt(dx + 2.5, cz, "W"), team.Primary, {
				Object = "Classroom Chair",
				NoPrompt = k ~= 2 + r % 2,
				Material = Enum.Material.SmoothPlastic,
				BackHeight = 2.6,
			})
		end
	end

	-- Step 2: library + study pods -----------------------------------------------------------------
	BuildUtil.Stage(ctx, 2)
	local library = BuildUtil.Child(ctx, "Library")
	box(
		library,
		"BackWallLining",
		38.3,
		FLOOR_TOP,
		LINE_Z,
		66,
		WALL_TOP - 0.8,
		BACK_Z,
		Color3.fromRGB(226, 214, 196),
		Enum.Material.Plaster
	)
	for i, bx in ipairs({ { 41, 52 }, { 53, 64 } }) do
		local case = box(library, "Bookcase", bx[1], FLOOR_TOP, LINE_Z - 3, bx[2], 28, LINE_Z, DARK_WOOD, Enum.Material.Wood)
		local gui = canvas(case, Enum.NormalId.Front, 16, Color3.fromRGB(60, 42, 28), 1)
		drawBooks(gui, bx[2] - bx[1], 10.88, 5, team, i * 5)
		if i == 1 then
			BuildUtil.Look(
				case,
				"Playbook Library",
				"Hundreds of playbooks, biographies of (made-up) legends and comic books. Every player reads one book a month!",
				{ At = Vector3.new(0, -3, -1.6), Distance = 9 }
			)
		end
	end
	-- a rolling ladder on the bookcases
	rod(library, "LadderRail", Vector3.new(49, FLOOR_TOP, 353.6), Vector3.new(49, 27.6, 355.1), 0.25, CHROME, Enum.Material.Metal, PAINT)
	rod(library, "LadderRail", Vector3.new(51, FLOOR_TOP, 353.6), Vector3.new(51, 27.6, 355.1), 0.25, CHROME, Enum.Material.Metal, PAINT)
	-- a double-sided book divider between the library and the gaming lounge
	local divider = box(library, "BookDivider", 65.5, FLOOR_TOP, 300, 67, 24.4, 340, DARK_WOOD, Enum.Material.Wood)
	for _, face in ipairs({ Enum.NormalId.Left, Enum.NormalId.Right }) do
		drawBooks(canvas(divider, face, 12, Color3.fromRGB(60, 42, 28), 1), 40, 7.28, 3, team, face == Enum.NormalId.Left and 3 or 8)
	end
	-- three study pods along the classroom glass
	for i, pz in ipairs({ 306, 318, 330 }) do
		studyPod(library, pz, team, i == 2 and NEON_CYAN or LAMP, i == 2)
	end
	local podInfo = box(library, "PodSign", 38.3, 26.4, 302.5, 44, 27.4, 333.5, team.Secondary)
	sign(podInfo, Enum.NormalId.Right, "QUIET! STUDY PODS", team.Secondary, team, { InsetX = 0.2, InsetY = 0.12 })
	BuildUtil.Look(podInfo, "Study Pods", "Little quiet booths for studying the playbook. Sit down, put on headphones and focus!", {
		At = Vector3.new(2.85, -1, 0),
		Distance = 9,
	})
	-- reading nook: rug, two armchairs, a side table, a floor lamp, a globe
	box(library, "ReadingRug", 48, FLOOR_TOP, 316, 62, FLOOR_TOP + 0.03, 336, Color3.fromRGB(150, 60, 50), Enum.Material.Fabric, PAINT)
	armchair(library, 52, 330, "S", Color3.fromRGB(120, 66, 40))
	armchair(library, 59, 330, "S", Color3.fromRGB(40, 70, 120))
	box(library, "SideTable", 54.6, FLOOR_TOP, 322, 56.4, 19.6, 323.8, DARK_WOOD, Enum.Material.Wood)
	cyl(library, "LampPole", Vector3.new(62.5, 21.5, 333), 8.8, 0.3, "Y", DARK_METAL, Enum.Material.Metal)
	local lampShade = cyl(library, "LampShade", Vector3.new(62.5, 26.2, 333), 1.6, 2.2, "Y", LAMP, Enum.Material.Neon, NO_COLLIDE)
	BuildUtil.Light(lampShade, "PointLight", { Name = "ReadingLamp", Range = 14, Brightness = 1, Color = WARM_LIGHT })
	cyl(library, "GlobeStand", Vector3.new(48, 18.3, 297), 2.4, 0.5, "Y", GOLD, Enum.Material.Metal)
	local globe = ball(library, "Globe", Vector3.new(48, 20.6, 297), 2.6, Color3.fromRGB(60, 120, 200))
	BuildUtil.Look(globe, "Road Trip Globe", "Every away game gets a pin. Your team will fly all over the map this season!", {
		LookKey = "record",
		Distance = 7,
	})

	-- Step 3: gaming lounge -----------------------------------------------------------------------
	BuildUtil.Stage(ctx, 3)
	local lounge = BuildUtil.Child(ctx, "GamingLounge")
	box(
		lounge,
		"BackWallLining",
		66,
		FLOOR_TOP,
		LINE_Z,
		IX1,
		WALL_TOP - 0.8,
		BACK_Z,
		Color3.fromRGB(44, 46, 56),
		Enum.Material.SmoothPlastic
	)
	box(lounge, "LoungeRug", 70, FLOOR_TOP, 334, 95, FLOOR_TOP + 0.03, 356, shade(team.Primary, 0.75), Enum.Material.Carpet, PAINT)
	box(lounge, "TVGlow", 73.8, 19.9, 357.95, 92.2, 28.7, LINE_Z, Color3.fromRGB(150, 80, 255), Enum.Material.Neon)
	box(lounge, "TVFrame", 74.6, 20.4, 357.85, 91.4, 28.2, LINE_Z, BLACK)
	local tv = box(lounge, "BigTV", 75, 20.8, 357.7, 91, 27.8, 357.85, SCREEN)
	liveScreen(tv, Enum.NormalId.Front, "score", name, {
		PixelsPerStud = 20,
		TextColor3 = WHITE,
		Font = Enum.Font.GothamBlack,
		Header = "LATEST SCORE",
		HeaderBackground = team.Primary,
		HeaderColor = textColorOn(team.Primary, team),
	})
	local console = box(lounge, "TVConsole", 74, FLOOR_TOP, 354.6, 92, 19.4, 357.7, BLACK)
	local gameBox = box(lounge, "GameConsole", 81.5, 19.4, 355.2, 84.5, 20.1, 357.2, WHITE)
	local consoleGui = canvas(gameBox, Enum.NormalId.Front, 20, nil, 0)
	guiFrame(consoleGui, 0.2, 0.3, 2.6, 0.1, NEON_CYAN)
	BuildUtil.Look(
		console,
		"Game Console",
		"Football video games, of course. Players play as themselves and always give themselves a 99 rating!",
		{
			At = Vector3.new(4, 1, -1.6),
			Distance = 8,
		}
	)
	sofa(lounge, frameAt(83, 341, "N"), 15, Color3.fromRGB(60, 62, 70), shade(team.Primary, 0.8), { Object = "Gaming Sofa" })
	box(lounge, "CoffeeTable", 79, FLOOR_TOP, 345.5, 87, 18.7, 348.5, LIGHT_WOOD, Enum.Material.Wood)
	for _, b in ipairs({ { 72.5, 349, 77 }, { 93.5, 349, 89 } }) do
		local f = CFrame.lookAt(Vector3.new(b[1], FLOOR_TOP, b[2]), Vector3.new(b[3], FLOOR_TOP, 358))
		lseat(lounge, f, Vector3.new(3, 1.3, 3), 0, 0, 0, team.Secondary, Enum.Material.Fabric, {
			Name = "BeanBag",
			Object = "Bean Bag",
			NoPrompt = true,
		})
		ball(lounge, "BeanBagBack", (f * CFrame.new(0, 1.9, 1.3)).Position, 2.8, team.Secondary, Enum.Material.Fabric, NO_COLLIDE)
	end
	-- two arcade cabinets on the east wall under a live high-score sign
	arcadeCabinet(lounge, 300, Color3.fromRGB(40, 40, 120), NEON_CYAN, "GRIDIRON BLITZ", team)
	arcadeCabinet(lounge, 307, Color3.fromRGB(120, 30, 40), NEON_PINK, "PIXEL PUNT", team)
	box(lounge, "ScoreGlow", IX1 - 0.08, 26.1, 296.6, IX1, 28.9, 310.4, NEON_GREEN, Enum.Material.Neon)
	local highScore = box(lounge, "HighScoreSign", IX1 - 0.25, 26.4, 297, IX1, 28.6, 310, LED_DARK)
	liveScreen(highScore, Enum.NormalId.Left, "arcade", "HIGH SCORE ---", {
		PixelsPerStud = 20,
		TextColor3 = NEON_GREEN,
		Font = Enum.Font.Arcade,
		Header = "GAME ON",
		HeaderShare = 0.4,
		HeaderColor = NEON_PINK,
	})
	BuildUtil.Light(highScore, "PointLight", { Name = "ArcadeGlow", Range = 16, Brightness = 1, Color = NEON_CYAN })
	-- snack fridge (use: soda)
	-- an air-hockey table
	box(lounge, "AirHockeyBase", 77, FLOOR_TOP, 312, 89, 19.9, 318, BLACK)
	local hockey = box(lounge, "AirHockeyTop", 76.6, 19.9, 311.6, 89.4, 20.4, 318.4, WHITE)
	local hockeyGui = canvas(hockey, Enum.NormalId.Top, 16, nil, 0.5)
	guiFrame(hockeyGui, 6.3, 0.4, 0.2, 6, FRUIT_RED)
	guiRing(hockeyGui, 6.4, 3.4, 2.4, 0.12, NEON_CYAN)
	guiFrame(hockeyGui, 0.2, 2.4, 0.3, 2, team.Primary)
	guiFrame(hockeyGui, 12.3, 2.4, 0.3, 2, team.Primary)
	box(lounge, "AirHockeyRim", 76.6, 20.4, 311.6, 89.4, 20.7, 311.9, NEON_CYAN, Enum.Material.Neon, NO_COLLIDE)
	BuildUtil.Look(hockey, "Air Hockey", "First to seven wins! The linemen hit the puck so hard it once flew into the bookcase.", {
		At = Vector3.new(0, 0.6, 0),
		Distance = 8,
	})
	local fridge = box(lounge, "SnackFridge", IX1 - 3, FLOOR_TOP, 318, IX1, 22.6, 322, WHITE)
	box(lounge, "FridgeHandle", IX1 - 3.15, 19.5, 318.6, IX1 - 3, 21.5, 318.9, CHROME, Enum.Material.Metal)
	BuildUtil.Use(ctx, fridge, "soda", { Object = "Snack Fridge", At = Vector3.new(-1.6, 0, 0), Distance = 8 })
end

return M
