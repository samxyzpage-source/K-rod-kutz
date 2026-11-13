--[[
	FanZone
	The Tailgate & Fan Zone: a long festival strip east of the stadium in
	Config.Layout.Zones.fan_zone (X[212, 276] Z[-190, 150], max height 30). The buy button
	(206, -150) stays clear on the open ground west of the strip.

	A paved lane (X[232, 244]) runs the length of the strip, from the FAN ZONE arch at the plaza end
	(-Z) to the foot of the stage (+Z). Everything else stands beside it:

	  z -190 ..  -58   tailgate lot: painted stalls on both sides of the lane, tailgating cars
	  z  -57 ..  -33   food court (west): picnic tables  |  food trucks (east, z -52 .. 28)
	  z  -28 ..   26   prize kiosk + football toss (west)
	  z   54 ..   86   mascot plaza: a round plaza in the lane, the statue in the middle
	  z   96 ..  121   the sound desk in the lane, hay-bale seats on the grass either side
	  z  116 ..  146   the stage (X[214, 262], centred on the lane, facing -Z) with its speakers

	Steps (Items.lua):
	  1 Tailgate Lot        lots + stalls, the lane, grass, the FAN ZONE arch with a giant football,
	                        string lights, a trash can and three tailgating cars (a pickup with its
	                        tailgate down, a team SUV with the hatch up, a sedan with the trunk open)
	                        with camp chairs you can sit in
	  2 Food Trucks         TOP DOG (hot dogs), POP SHOP (popcorn) and FIZZ WAGON (soda): serving
	                        windows you can get food from, sandwich-board menus, picnic tables
	  3 Tents & Grills      two team canopy tents, a kettle grill, a barrel smoker (both smoking),
	                        camp chairs, a party table, a cooler, a team flag and cornhole boards
	  4 Football Toss Game  turf runway with yard marks and a throw line, a target board with three
	                        scoring holes, a bin of footballs with the rules, a prize kiosk that
	                        hands out foam fingers
	  5 Mascot Statue       the round plaza and BIG BRUNO, a giant bull in a #12 jersey
	  6 Stage & Speakers    stage with a ramp, live GAME DAY + SCORE screens, roof on truss columns,
	                        coloured stage lights, speaker stacks, a DJ booth, hay-bale seats and a
	                        sound desk with a TV-style stage camera seat

	Paint heights: lot surfaces 0..0.2 | toss runway 0.28 | throw line 0.32 | mascot plaza 0.3.
	Fine markings (stall lines, lane edges, lettering, stripes, menus) are GUI frames.
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)

local FanZone = {}

---------------------------------------------------------------------------------------------
-- Layout (plot-local studs)
---------------------------------------------------------------------------------------------

local GROUND = 0.2 -- top of the lot surfaces (asphalt, grass and the lane)
local ZONE_X0, ZONE_X1 = 212, 276
local LANE = { X0 = 232, X1 = 244, Z0 = -190, Z1 = 121 }
local LANE_X = (LANE.X0 + LANE.X1) / 2 -- 238
local STALL_Z0, STALL_WIDTH, STALL_COUNT = -172, 9, 12 -- stalls from z -172 to -64
local WEST_STALLS = { X0 = 214, X1 = 230 }
local EAST_STALLS = { X0 = 246, X1 = 262 }
local WEST_LOT_END = -58 -- the west asphalt ends here, grass beyond
local EAST_LOT_END = 32 -- the east asphalt carries the lot and the food trucks
local EAST_LOT_X1 = 266 -- a grass strip runs beyond it along the plot edge
local GRASS_END = 121 -- the stage deck starts just beyond
local LOT_PPS = 6
local ARCH_Z = -181
local POLE_TOP = 13.4
-- string-light poles, zig-zagging across the lane (they stop short of the mascot plaza)
local POLES = { { 231.2, -166 }, { 244.8, -113 }, { 231.2, -60 }, { 244.8, -7 }, { 231.2, 46 } }
local TRUCK_X = 256 -- centre line of the food trucks (body X[252, 260]); serving side faces -X
local TRUCK_Z = { -42, -12, 18 }
local PICNIC_X, PICNIC_Z = 222, { -54, -45, -36 }
local KIOSK = { X0 = 214, X1 = 222, Z0 = -28, Z1 = -22.6 }
local TOSS = { X0 = 214, X1 = 230, Z0 = -20, Z1 = 26, ThrowZ = -12, TargetZ = 20, Top = 0.28 }
local PLAZA = { X = LANE_X, Z = 70, Diameter = 32, Top = 0.3 }
local STAGE = { X0 = 214, X1 = 262, Z0 = 122, Z1 = 146, Top = 3.6, RoofY = 23 } -- centred on the lane
local FOH = { X = LANE_X, Z = 98 } -- the sound desk at the end of the lane
local STAGE_CAM = Vector3.new(250, 15, 100)

local PAINT = { CanCollide = false, CastShadow = false }
local GLOW = { CanCollide = false, CastShadow = false }
local NO_COLLIDE = { CanCollide = false }
local UP = Vector3.new(0, 1, 0)

local WHITE = Color3.fromRGB(248, 248, 248)
local INK = Color3.fromRGB(22, 22, 26)
local ASPHALT = Color3.fromRGB(54, 54, 60)
local STALL_WHITE = Color3.fromRGB(236, 236, 228)
local LANE_PAVER = Color3.fromRGB(178, 112, 84)
local PLAZA_PAVER = Color3.fromRGB(192, 178, 154)
local DARK_METAL = Color3.fromRGB(58, 60, 66)
local STRING_LIGHT = Color3.fromRGB(255, 212, 130)
local BIN_GREEN = Color3.fromRGB(46, 104, 66)
local TIRE = Color3.fromRGB(30, 30, 32)
local CAR_GLASS = Color3.fromRGB(46, 58, 74)
local KITCHEN = Color3.fromRGB(78, 52, 36)
local WARM_LIGHT = Color3.fromRGB(255, 226, 170)
local STAINLESS = Color3.fromRGB(200, 204, 210)
local CHALKBOARD = Color3.fromRGB(34, 40, 37)
local MENU_TEXT = Color3.fromRGB(255, 228, 150)
local HEADLIGHT = Color3.fromRGB(255, 246, 220)
local TAIL_RED = Color3.fromRGB(222, 30, 30)
local SMOKE = Color3.fromRGB(205, 205, 210)
local GRILL_BLACK = Color3.fromRGB(32, 32, 34)
local PICKUP_WHITE = Color3.fromRGB(232, 233, 236)
local SEDAN_SILVER = Color3.fromRGB(176, 182, 190)
local TENT_FRAME = Color3.fromRGB(196, 200, 206)
local CHAIR_FRAME = Color3.fromRGB(70, 72, 78)
local PICNIC_WOOD = Color3.fromRGB(168, 118, 70)
local PICNIC_DARK = Color3.fromRGB(112, 76, 44)
local TURF = Color3.fromRGB(64, 150, 62)
local LEATHER = Color3.fromRGB(128, 68, 36)
local STONE = Color3.fromRGB(112, 112, 118)
local MARBLE = Color3.fromRGB(238, 235, 228)
local FUR = Color3.fromRGB(126, 76, 44)
local MUZZLE = Color3.fromRGB(222, 178, 136)
local HORN = Color3.fromRGB(244, 232, 200)
local HORN_TIP = Color3.fromRGB(196, 176, 140)
local HOOF = Color3.fromRGB(48, 40, 38)
local GOLD = Color3.fromRGB(255, 192, 40)
local STAGE_BLACK = Color3.fromRGB(30, 30, 34)
local TRUSS = Color3.fromRGB(196, 200, 206)
local SPEAKER_BLACK = Color3.fromRGB(26, 26, 30)
local CONE_GREY = Color3.fromRGB(74, 74, 82)
local HAY = Color3.fromRGB(222, 190, 104)
local SCREEN_BLACK = Color3.fromRGB(14, 16, 22)
local LED_TEXT = Color3.fromRGB(255, 255, 255)
local LED_YELLOW = Color3.fromRGB(255, 214, 64)

--[[
	The three food trucks, from the entrance end. Body / sign colours are the trucks' own brands;
	the awnings carry the team colours. Use = the item the serving window hands out (Interact.Uses).
]]
local TRUCKS = {
	{
		Name = "HotDogTruck",
		Sign = "TOP DOG",
		Title = "Top Dog Hot Dogs",
		Use = "hotdog",
		Info = "Grilled all game day long. Step up to the window and grab a hot dog!",
		Body = Color3.fromRGB(255, 190, 40),
		SignColor = Color3.fromRGB(206, 40, 30),
		Menu = "HOT DOGS  $2\nCHILI DOGS  $3\nCORN DOGS  $2\nPRETZELS  $2",
		MenuInfo = "Hot dogs, chili dogs, corn dogs and giant pretzels. The chili dog is the coach's favourite!",
		Prop = "HotDog",
	},
	{
		Name = "PopcornTruck",
		Sign = "POP SHOP",
		Title = "The Pop Shop",
		Use = "popcorn",
		Info = "Fresh, hot and buttery. Grab a bucket of popcorn for the game!",
		Body = Color3.fromRGB(240, 240, 236),
		SignColor = Color3.fromRGB(214, 36, 44),
		Menu = "BUTTER CORN  $2\nKETTLE CORN  $2\nCARAMEL CORN  $3\nCOTTON CANDY  $2",
		MenuInfo = "Butter, kettle or caramel popcorn, plus fluffy cotton candy. Popped fresh every minute!",
		Prop = "Popcorn",
	},
	{
		Name = "SodaTruck",
		Sign = "FIZZ WAGON",
		Title = "Fizz Wagon",
		Use = "soda",
		Info = "Ice-cold fizzy drinks to cheer with. Get a soda from the window!",
		Body = Color3.fromRGB(64, 170, 226),
		SignColor = Color3.fromRGB(20, 44, 96),
		Menu = "COLA  $1\nLEMON-LIME  $1\nROOT BEER  $1\nORANGE FIZZ  $1",
		MenuInfo = "Cola, lemon-lime, root beer and orange fizz, served over a mountain of ice.",
		Prop = "Soda",
	},
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

local function contrast(a, b)
	local la, lb = luminance(a), luminance(b)
	if la < lb then
		la, lb = lb, la
	end
	return (la + 0.05) / (lb + 0.05)
end

-- First candidate that reads well on `background`, else whichever of white / ink reads best.
local function readableOn(background, candidates)
	for _, candidate in ipairs(candidates) do
		if contrast(background, candidate) >= 3 then
			return candidate
		end
	end
	if contrast(background, WHITE) >= contrast(background, INK) then
		return WHITE
	end
	return INK
end

-- A colour that differs clearly from `color` (for stripes next to it).
local function partnerColor(color, team)
	for _, candidate in ipairs({ team.Trim, team.Secondary, WHITE }) do
		if contrast(color, candidate) >= 1.6 then
			return candidate
		end
	end
	return INK
end

-- The owner's name (upper case) or `fallback` when the plot has no name yet.
local function teamName(ctx, fallback)
	local name = ctx.teamName
	if type(name) ~= "string" or name == "" then
		return fallback
	end
	return name
end

--[[
	Writes `text` on each face in `faces` of `part`, coloured to read well on `background`.
	opts: TextColor3, Font, PixelsPerStud, InsetX / InsetY (fraction left empty, default 0.06 /
	      0.12), Wrap, Glow (ignore lighting), Outline (stroke thickness, 0 = none)
]]
local function sign(part, faces, text, background, team, opts)
	opts = opts or {}
	local color = opts.TextColor3 or readableOn(background, { team.Trim, team.Secondary, team.Primary })
	local insetX = opts.InsetX or 0.06
	local insetY = opts.InsetY or 0.12
	for _, face in ipairs(faces) do
		local _, label = BuildUtil.SurfaceText(part, face, text, {
			LabelName = part.Name .. face.Name,
			TextColor3 = color,
			Font = opts.Font or Enum.Font.GothamBlack,
			PixelsPerStud = opts.PixelsPerStud or 20,
			LightInfluence = opts.Glow and 0 or 1,
		})
		label.Size = UDim2.new(1 - 2 * insetX, 0, 1 - 2 * insetY, 0)
		label.Position = UDim2.new(insetX, 0, insetY, 0)
		label.TextWrapped = opts.Wrap == true
		if (opts.Outline or 0) > 0 then
			local stroke = Instance.new("UIStroke")
			stroke.Name = "Outline"
			stroke.Color = readableOn(color, { INK, WHITE })
			stroke.Thickness = opts.Outline
			stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Contextual
			stroke.Parent = label
		end
	end
end

-- A SurfaceGui (no text) on one face of `part`, for painting frames onto it.
local function canvas(part, face, pixelsPerStud)
	local gui = Instance.new("SurfaceGui")
	gui.Name = part.Name .. face.Name .. "Paint"
	gui.Face = face
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = pixelsPerStud or 20
	gui.LightInfluence = 1
	gui.Parent = part
	return gui
end

-- A frame placed by scale (fractions of the face): x, y = top-left corner, w, h = size.
local function blob(gui, name, x, y, w, h, color, round)
	local frame = Instance.new("Frame")
	frame.Name = name
	frame.BackgroundColor3 = color
	frame.BorderSizePixel = 0
	frame.Position = UDim2.new(x, 0, y, 0)
	frame.Size = UDim2.new(w, 0, h, 0)
	frame.Parent = gui
	if round then
		local corner = Instance.new("UICorner")
		corner.CornerRadius = UDim.new(0.5, 0)
		corner.Parent = frame
	end
	return frame
end

-- A text label placed by scale inside `parent` (a GUI or a frame).
local function words(parent, name, x, y, w, h, text, color, font)
	local label = Instance.new("TextLabel")
	label.Name = name
	label.BackgroundTransparency = 1
	label.BorderSizePixel = 0
	label.Position = UDim2.new(x, 0, y, 0)
	label.Size = UDim2.new(w, 0, h, 0)
	label.Font = font or Enum.Font.GothamBlack
	label.Text = text
	label.TextColor3 = color
	label.TextScaled = true
	label.TextWrapped = true
	label.Parent = parent
	return label
end

--[[
	Paint on the Top face of an axis-aligned part covering [x0, x1] x [z0, z1], addressed in plot
	coordinates. flip = true when the part is turned 180 degrees about Y, so lettering reads upright
	for someone looking toward +Z (Top-face text reads upright from the part's +Z side).
]]
local function topSheet(part, x0, x1, z0, z1, pixelsPerStud, flip)
	local gui = canvas(part, Enum.NormalId.Top, pixelsPerStud)
	local function u(x)
		return (flip and (x1 - x) or (x - x0)) * pixelsPerStud
	end
	local function v(z)
		return (flip and (z1 - z) or (z - z0)) * pixelsPerStud
	end
	local sheet = {}
	local function place(inst, ax, bx, az, bz)
		local u0, u1, v0, v1 = u(ax), u(bx), v(az), v(bz)
		inst.Position = UDim2.new(0, math.min(u0, u1), 0, math.min(v0, v1))
		inst.Size = UDim2.new(0, math.abs(u1 - u0), 0, math.abs(v1 - v0))
		inst.BorderSizePixel = 0
		inst.Parent = gui
		return inst
	end
	function sheet.rect(name, ax, bx, az, bz, color)
		local frame = Instance.new("Frame")
		frame.Name = name
		frame.BackgroundColor3 = color
		return place(frame, ax, bx, az, bz)
	end
	function sheet.text(name, ax, bx, az, bz, text, color)
		local label = Instance.new("TextLabel")
		label.Name = name
		label.BackgroundTransparency = 1
		label.Font = Enum.Font.GothamBlack
		label.Text = text
		label.TextColor3 = color
		label.TextScaled = true
		label.TextWrapped = true
		return place(label, ax, bx, az, bz)
	end
	return sheet
end

-- Axis-aligned block between two corners (plot-local).
local function span(ctx, name, x0, x1, y0, y1, z0, z1, color, material, extra)
	x0, x1 = math.min(x0, x1), math.max(x0, x1)
	y0, y1 = math.min(y0, y1), math.max(y0, y1)
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

-- Block placed by a CFrame (plot-local).
local function boxAt(ctx, name, size, cframe, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Size = size
	props.CFrame = cframe
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Part(ctx, props)
end

-- Cylinder along the local X axis of `cframe`.
local function cylinderAt(ctx, name, cframe, length, diameter, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Shape = Enum.PartType.Cylinder
	props.Size = Vector3.new(length, diameter, diameter)
	props.CFrame = cframe
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Part(ctx, props)
end

-- CFrame at the middle of a -> b, looking from a to b (works for vertical segments too).
local function along(a, b)
	local dir = (b - a).Unit
	local up = math.abs(dir.Y) > 0.99 and Vector3.new(0, 0, 1) or UP
	return CFrame.lookAt((a + b) / 2, b, up)
end

-- Square-section bar from a to b.
local function bar(ctx, name, a, b, width, color, material, extra)
	return boxAt(ctx, name, Vector3.new(width, width, (b - a).Magnitude), along(a, b), color, material, extra)
end

-- Round pipe from a to b (its local +X axis points from a to b).
local function pipe(ctx, name, a, b, diameter, color, material, extra)
	return cylinderAt(ctx, name, along(a, b) * CFrame.Angles(0, math.pi / 2, 0), (b - a).Magnitude, diameter, color, material, extra)
end

-- Upright cylinder standing on y = baseY.
local function post(ctx, name, x, z, baseY, height, diameter, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Position = Vector3.new(x, baseY + height / 2, z)
	props.Height = height
	props.Diameter = diameter
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

-- A football: one ball part shown as an ellipsoid (a sphere mesh stretched along the local X axis
-- of `cframe`). The offline previews draw it as a plain ball.
local function football(ctx, name, cframe, length, diameter, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Shape = Enum.PartType.Ball
	props.Size = Vector3.new(diameter, diameter, diameter)
	props.CFrame = cframe
	props.Color = LEATHER
	props.Material = Enum.Material.SmoothPlastic
	local part = BuildUtil.Part(ctx, props)
	local mesh = Instance.new("SpecialMesh")
	mesh.Name = "FootballShape"
	mesh.MeshType = Enum.MeshType.Sphere
	mesh.Scale = Vector3.new(length / diameter, 1, 1)
	mesh.Parent = part
	return part
end

-- Peaked canopy roof: two wedges meeting in a ridge along X at z = cz, standing on y = baseY.
local function gableRoof(ctx, name, cx, cz, baseY, lengthX, depthZ, rise, color, material)
	local half = depthZ / 2
	local size = Vector3.new(lengthX, rise, half)
	-- south half: a wedge's tall face is its local +Z side, so it sits on the ridge as built
	BuildUtil.Wedge(ctx, {
		Name = name,
		Size = size,
		CFrame = CFrame.new(cx, baseY + rise / 2, cz - half / 2),
		Color = color,
		Material = material,
	})
	BuildUtil.Wedge(ctx, {
		Name = name,
		Size = size,
		CFrame = CFrame.new(cx, baseY + rise / 2, cz + half / 2) * CFrame.Angles(0, math.pi, 0),
		Color = color,
		Material = material,
	})
end

-- Grey smoke puff (no collision, half see-through).
local function smoke(ctx, position, diameter)
	return ball(ctx, "Smoke", position, diameter, SMOKE, Enum.Material.SmoothPlastic, {
		Transparency = 0.45,
		CanCollide = false,
		CastShadow = false,
	})
end

--[[
	A live screen (BuildUtil.LiveText) the server keeps up to date with the owner's team: dark
	background, bright text, readable at night (LightInfluence 0). Returns the TextLabel.
]]
local function liveScreen(part, face, live, placeholder, color, pixelsPerStud)
	local _, label = BuildUtil.LiveText(part, face, live, {
		LabelName = "Live_" .. live,
		Text = placeholder,
		TextColor3 = color or LED_TEXT,
		BackgroundColor3 = SCREEN_BLACK,
		BackgroundTransparency = 0,
		LightInfluence = 0,
		Font = Enum.Font.GothamBold,
		PixelsPerStud = pixelsPerStud or 16,
	})
	local pad = Instance.new("UIPadding")
	local px, py = UDim.new(0.04, 0), UDim.new(0.1, 0)
	pad.PaddingLeft, pad.PaddingRight, pad.PaddingTop, pad.PaddingBottom = px, px, py, py
	pad.Parent = label
	return label
end

local function stallCenter(k)
	return STALL_Z0 + (k - 0.5) * STALL_WIDTH
end

--[[
	A camp chair you can sit in (BuildUtil.Seat), standing on the lot at (x, z) and facing
	`facing` (a horizontal unit vector): a dark frame, the sling seat and a reclined back.
]]
local function campChair(ctx, x, z, facing, color)
	local foot = Vector3.new(x, GROUND, z)
	local frame = CFrame.lookAt(foot, foot + facing)
	boxAt(ctx, "ChairLegs", Vector3.new(1.7, 1.2, 1.6), frame * CFrame.new(0, 0.6, 0.05), CHAIR_FRAME, Enum.Material.Metal, {
		Transparency = 0.35,
	})
	BuildUtil.Seat(ctx, {
		Name = "CampChair",
		Size = Vector3.new(1.9, 0.35, 1.8),
		CFrame = frame * CFrame.new(0, 1.375, 0),
		Color = color,
		Material = Enum.Material.Fabric,
		Object = "Camp Chair",
	})
	boxAt(
		ctx,
		"ChairBack",
		Vector3.new(1.9, 2.3, 0.25),
		frame * CFrame.new(0, 2.65, 0.95) * CFrame.Angles(math.rad(12), 0, 0),
		color,
		Enum.Material.Fabric
	)
end

-- Cooler: one block in `color` with a white lid painted on top and around its rim.
local function cooler(ctx, cframe, color)
	local box = boxAt(ctx, "Cooler", Vector3.new(2.2, 1.4, 1.4), cframe * CFrame.new(0, 0.7, 0), color)
	blob(canvas(box, Enum.NormalId.Top, 10), "Lid", 0, 0, 1, 1, WHITE)
	for _, face in ipairs({ Enum.NormalId.Front, Enum.NormalId.Back }) do
		blob(canvas(box, face, 10), "LidRim", 0, 0, 1, 0.22, WHITE)
	end
	return box
end

---------------------------------------------------------------------------------------------
-- Cars (step 1). `frame` stands on the lot at the middle of the car, nose toward its -Z.
---------------------------------------------------------------------------------------------

-- Both axles: one cylinder across the car per axle.
local function axles(ctx, frame, width, front, back, diameter)
	for _, z in ipairs({ front, back }) do
		cylinderAt(ctx, "Wheels", frame * CFrame.new(0, diameter / 2, z), width + 0.2, diameter, TIRE, Enum.Material.Rubber)
	end
end

-- Tail lights and a team bumper sticker painted on the back (+Z) face of a car body.
local function tailLights(body, team, sticker)
	local gui = canvas(body, Enum.NormalId.Back, 20)
	blob(gui, "TailLight", 0.03, 0.12, 0.16, 0.3, TAIL_RED)
	blob(gui, "TailLight", 0.81, 0.12, 0.16, 0.3, TAIL_RED)
	local plate = blob(gui, "BumperSticker", 0.26, 0.55, 0.48, 0.32, team.Primary)
	words(plate, "Sticker", 0.04, 0.08, 0.92, 0.84, sticker, readableOn(team.Primary, { team.Trim, team.Secondary }))
end

-- White pickup with its tailgate down (a cooler in the bed). Returns the body.
local function pickup(ctx, frame, team, sticker)
	local w = 5
	axles(ctx, frame, w, -3.4, 3.4, 2.6)
	local body = boxAt(ctx, "PickupBody", Vector3.new(w, 1.8, 11), frame * CFrame.new(0, 2.3, 0), PICKUP_WHITE)
	tailLights(body, team, sticker)
	boxAt(ctx, "PickupCab", Vector3.new(w - 0.3, 1.8, 3.4), frame * CFrame.new(0, 4.1, -1.3), CAR_GLASS, Enum.Material.Glass)
	boxAt(ctx, "PickupCabRoof", Vector3.new(w - 0.1, 0.3, 3.2), frame * CFrame.new(0, 5.15, -1.2), PICKUP_WHITE)
	for _, side in ipairs({ -1, 1 }) do
		boxAt(ctx, "PickupBedSide", Vector3.new(0.3, 1.1, 5), frame * CFrame.new(side * (w / 2 - 0.15), 3.75, 2.95), PICKUP_WHITE)
	end
	boxAt(ctx, "PickupTailgate", Vector3.new(w - 0.3, 0.25, 1.5), frame * CFrame.new(0, 3.08, 6.25), PICKUP_WHITE)
	cooler(ctx, frame * CFrame.new(0, 3.2, 3.6) * CFrame.Angles(0, math.pi / 2, 0), team.Primary)
	return body
end

-- SUV in `color` with its rear hatch swung up. Returns the body.
local function suv(ctx, frame, color, team, sticker)
	axles(ctx, frame, 5, -3.7, 3.7, 2.6)
	local body = boxAt(ctx, "SUVBody", Vector3.new(5, 2.3, 11.4), frame * CFrame.new(0, 2.45, 0), color)
	tailLights(body, team, sticker)
	boxAt(ctx, "SUVCabin", Vector3.new(4.8, 1.9, 7.6), frame * CFrame.new(0, 4.55, 0.5), CAR_GLASS, Enum.Material.Glass)
	boxAt(ctx, "SUVRoof", Vector3.new(5, 0.35, 7.8), frame * CFrame.new(0, 5.67, 0.5), color)
	-- the hatch is hinged at the back of the roof and tipped up 35 degrees
	local a = math.rad(35)
	local hinge = Vector3.new(0, 5.75, 4.4)
	local dir = Vector3.new(0, math.sin(a), math.cos(a))
	boxAt(ctx, "SUVHatch", Vector3.new(4.8, 0.25, 3.4), frame * CFrame.new(hinge + dir * 1.7) * CFrame.Angles(-a, 0, 0), color)
	return body
end

-- Sedan with its trunk lid open. Returns the body.
local function sedan(ctx, frame, color, team, sticker)
	axles(ctx, frame, 4.8, -3.5, 3.5, 2.4)
	local body = boxAt(ctx, "SedanBody", Vector3.new(4.8, 1.8, 11), frame * CFrame.new(0, 2.1, 0), color)
	tailLights(body, team, sticker)
	boxAt(ctx, "SedanCabin", Vector3.new(4.5, 1.6, 5.2), frame * CFrame.new(0, 3.8, -0.6), CAR_GLASS, Enum.Material.Glass)
	boxAt(ctx, "SedanRoof", Vector3.new(4.7, 0.3, 4.6), frame * CFrame.new(0, 4.75, -0.6), color)
	local a = math.rad(62)
	local hinge = Vector3.new(0, 3.05, 2.1)
	local dir = Vector3.new(0, math.sin(a), math.cos(a))
	boxAt(ctx, "SedanTrunkLid", Vector3.new(4.6, 0.2, 3.2), frame * CFrame.new(hinge + dir * 1.6) * CFrame.Angles(-a, 0, 0), color)
	return body
end

---------------------------------------------------------------------------------------------
-- Step 1: Tailgate Lot
---------------------------------------------------------------------------------------------

-- Asphalt with painted stalls (GUI lines) and TAILGATE LOT lettering at the entrance end.
local function asphaltLot(ctx, name, x0, x1, z1, stalls, team)
	local z0 = LANE.Z0
	local lot = BuildUtil.Part(ctx, {
		Name = name,
		Size = Vector3.new(x1 - x0, GROUND, z1 - z0),
		-- turned around so the lettering reads upright for fans walking in from the entrance (-Z)
		CFrame = CFrame.new((x0 + x1) / 2, GROUND / 2, (z0 + z1) / 2) * CFrame.Angles(0, math.pi, 0),
		Color = ASPHALT,
		Material = Enum.Material.Asphalt,
	})
	local sheet = topSheet(lot, x0, x1, z0, z1, LOT_PPS, true)
	for k = 0, STALL_COUNT do
		local z = STALL_Z0 + k * STALL_WIDTH
		sheet.rect("StallLine", stalls.X0, stalls.X1, z - 0.2, z + 0.2, STALL_WHITE)
	end
	-- a short "T" bar at the outer end of every stall line
	local outer = math.abs(stalls.X0 - LANE_X) > math.abs(stalls.X1 - LANE_X) and stalls.X0 or stalls.X1
	sheet.rect("StallEnd", outer - 0.2, outer + 0.2, STALL_Z0, STALL_Z0 + STALL_COUNT * STALL_WIDTH, STALL_WHITE)
	local textColor = readableOn(ASPHALT, { team.Trim, team.Secondary, team.Primary })
	sheet.text("LotName", stalls.X0, stalls.X1, z0 + 3, STALL_Z0 - 2, "TAILGATE LOT", textColor)
	return lot
end

-- Tailgating cars backed into stalls (rear toward the lane) with camp chairs beside them.
local function tailgateCars(ctx, team, name)
	local cars = BuildUtil.Child(ctx, "TailgateCars")
	local sticker = name ~= "" and ("GO " .. name .. "!") or "GO TEAM!"

	-- west lot, stall 3: a team-coloured SUV with the hatch up, two chairs and a cooler
	local suvZ = stallCenter(3)
	local suvBody = suv(cars, CFrame.new(222.6, GROUND, suvZ) * CFrame.Angles(0, math.pi / 2, 0), team.Primary, team, sticker)
	BuildUtil.Look(
		suvBody,
		"Super-Fan SUV",
		"Painted in team colours! This super-fan has parked in the same stall for every home game this season.",
		{ LookKey = "season", At = Vector3.new(0, 0.6, 6.4), Distance = 8 }
	)
	campChair(cars, 229, suvZ - 5.4, Vector3.new(1, 0, 0.4).Unit, team.Secondary)
	campChair(cars, 229, suvZ + 5.4, Vector3.new(1, 0, -0.4).Unit, team.Secondary)
	cooler(cars, CFrame.new(230.6, GROUND, suvZ) * CFrame.Angles(0, math.pi / 2, 0), team.Secondary)

	-- east lot, stall 6: the pickup with its tailgate down and two chairs
	local pickupZ = stallCenter(6)
	local pickupBody = pickup(cars, CFrame.new(253.6, GROUND, pickupZ) * CFrame.Angles(0, -math.pi / 2, 0), team, sticker)
	BuildUtil.Look(
		pickupBody,
		"Tailgate Pickup",
		"Tailgating = a party in the parking lot before the big game. A dropped tailgate makes the perfect snack table!",
		{ At = Vector3.new(0, 1, 6.4), Distance = 8 }
	)
	campChair(cars, 247.6, pickupZ - 5.6, Vector3.new(-1, 0, 0.4).Unit, team.Primary)
	campChair(cars, 247.6, pickupZ + 5.6, Vector3.new(-1, 0, -0.4).Unit, team.Primary)

	-- east lot, stall 10: a silver sedan with the trunk open
	local sedanZ = stallCenter(10)
	local sedanBody = sedan(cars, CFrame.new(253.6, GROUND, sedanZ) * CFrame.Angles(0, -math.pi / 2, 0), SEDAN_SILVER, team, sticker)
	BuildUtil.Look(
		sedanBody,
		"Packed Trunk",
		"Chips, foam fingers, a spare jersey and three bags of ice. This fan came prepared!",
		{ LookKey = "team", At = Vector3.new(0, 0.8, 6.2), Distance = 8 }
	)
end

local function tailgateLot(ctx, team, C, name)
	local lot = BuildUtil.Child(ctx, "TailgateLot")

	-- the lane, with team edge lines and a welcome painted on it (reads upright walking in)
	local lane = BuildUtil.Part(lot, {
		Name = "FanLane",
		Size = Vector3.new(LANE.X1 - LANE.X0, GROUND, LANE.Z1 - LANE.Z0),
		CFrame = CFrame.new(LANE_X, GROUND / 2, (LANE.Z0 + LANE.Z1) / 2) * CFrame.Angles(0, math.pi, 0),
		Color = LANE_PAVER,
		Material = Enum.Material.Pavement,
	})
	local laneSheet = topSheet(lane, LANE.X0, LANE.X1, LANE.Z0, LANE.Z1, 4, true)
	laneSheet.rect("LaneEdge", LANE.X0, LANE.X0 + 0.6, LANE.Z0, LANE.Z1, team.Primary)
	laneSheet.rect("LaneEdge", LANE.X1 - 0.6, LANE.X1, LANE.Z0, LANE.Z1, team.Primary)
	laneSheet.text("Welcome", LANE.X0 + 1.4, LANE.X1 - 1.4, ARCH_Z + 4, ARCH_Z + 10, "WELCOME FANS!", WHITE)

	asphaltLot(lot, "WestLot", ZONE_X0, LANE.X0, WEST_LOT_END, WEST_STALLS, team)
	asphaltLot(lot, "EastLot", LANE.X1, EAST_LOT_X1, EAST_LOT_END, EAST_STALLS, team)
	span(lot, "WestGrass", ZONE_X0, LANE.X0, 0, GROUND, WEST_LOT_END, GRASS_END, C.Grass, Enum.Material.Grass)
	span(lot, "EastGrass", LANE.X1, EAST_LOT_X1, 0, GROUND, EAST_LOT_END, GRASS_END, C.Grass, Enum.Material.Grass)
	span(lot, "EdgeGrass", EAST_LOT_X1, ZONE_X1, 0, GROUND, LANE.Z0, GRASS_END, C.Grass, Enum.Material.Grass)

	-- FAN ZONE arch over the lane with a giant football on top
	local pillars = {}
	for _, x in ipairs({ LANE.X0 - 1.5, LANE.X1 + 1.5 }) do
		table.insert(
			pillars,
			BuildUtil.Block(
				lot,
				"ArchPillar",
				Vector3.new(2, 16 - GROUND, 2),
				Vector3.new(x, 0, ARCH_Z),
				team.Primary,
				Enum.Material.SmoothPlastic,
				nil,
				GROUND
			)
		)
	end
	local beam = span(lot, "ArchBeam", LANE.X0 - 3, LANE.X1 + 3, 12.4, 16.4, ARCH_Z - 1.2, ARCH_Z + 1.2, team.Secondary)
	sign(beam, { Enum.NormalId.Front }, "FAN ZONE", team.Secondary, team, { Outline = 2 })
	sign(beam, { Enum.NormalId.Back }, name ~= "" and ("GO " .. name .. "!") or "GAME DAY!", team.Secondary, team, { Outline = 2 })
	football(lot, "ArchFootball", CFrame.new(LANE_X, 18.2, ARCH_Z), 7, 3.6)
	BuildUtil.Look(
		pillars[1],
		"Fan Zone",
		"Welcome to the tailgate! Sit by the cars, grab food from the trucks, play Football Toss and catch the show on the stage.",
		{ LookKey = "team", At = Vector3.new(1.4, -4, 0), Distance = 8 }
	)

	-- string lights zig-zagging across the lane between poles on both edges
	for index, p in ipairs(POLES) do
		post(lot, "LightPole", p[1], p[2], GROUND, POLE_TOP - GROUND, 0.6, DARK_METAL, Enum.Material.Metal)
		if index > 1 then
			local previous = POLES[index - 1]
			local strand = pipe(
				lot,
				"StringLights",
				Vector3.new(previous[1], POLE_TOP - 0.4, previous[2]),
				Vector3.new(p[1], POLE_TOP - 0.4, p[2]),
				0.3,
				STRING_LIGHT,
				Enum.Material.Neon,
				GLOW
			)
			BuildUtil.Light(strand, "PointLight", { Name = "StringGlow", Range = 26, Brightness = 1, Color = STRING_LIGHT })
		end
	end

	-- a trash can beside the lane (team-coloured lid painted on top: the cylinder's +X face)
	local can = post(lot, "TrashCan", 230.6, -140, GROUND, 3.2, 2, BIN_GREEN, Enum.Material.SmoothPlastic)
	blob(canvas(can, Enum.NormalId.Right, 10), "Lid", 0, 0, 1, 1, team.Primary, true)

	tailgateCars(lot, team, name)
end

---------------------------------------------------------------------------------------------
-- Step 2: Food Trucks
---------------------------------------------------------------------------------------------

-- The giant snack on the roof, centred at (cx, cz) on the roof top y = top.
local PROPS = {}

-- A giant hot dog: bun with a sausage poking out of both ends.
function PROPS.HotDog(ctx, cx, top, cz)
	local turn = CFrame.Angles(0, math.pi / 2, 0) -- cylinders run along Z
	cylinderAt(ctx, "HotDogBun", CFrame.new(cx, top + 1.1, cz) * turn, 5.2, 2.2, Color3.fromRGB(226, 170, 92))
	local sausage = cylinderAt(ctx, "HotDogSausage", CFrame.new(cx, top + 1.9, cz) * turn, 6.6, 1.4, Color3.fromRGB(176, 66, 44))
	-- a mustard zig-zag along the top of the sausage (the cylinder's Top face runs along it)
	local gui = canvas(sausage, Enum.NormalId.Top, 20)
	for k = 0, 5 do
		blob(gui, "Mustard", 0.1 + k * 0.13, 0.3 + (k % 2) * 0.15, 0.1, 0.25, Color3.fromRGB(255, 214, 30))
	end
end

-- A giant striped popcorn bucket heaped with popcorn.
function PROPS.Popcorn(ctx, cx, top, cz)
	local bucket = span(ctx, "PopcornBucket", cx - 1.6, cx + 1.6, top, top + 3.6, cz - 1.6, cz + 1.6, WHITE)
	for _, face in ipairs({ Enum.NormalId.Front, Enum.NormalId.Back, Enum.NormalId.Left, Enum.NormalId.Right }) do
		local gui = canvas(bucket, face, 10)
		for k = 0, 2 do
			blob(gui, "Stripe", 0.05 + k * 0.34, 0, 0.17, 1, Color3.fromRGB(214, 36, 44))
		end
	end
	ball(ctx, "PopcornHeap", Vector3.new(cx, top + 3.8, cz), 3.6, Color3.fromRGB(255, 240, 180))
end

-- A giant soda cup with a lid and a bendy straw.
function PROPS.Soda(ctx, cx, top, cz)
	local cup = post(ctx, "SodaCup", cx, cz, top, 4.2, 3, Color3.fromRGB(220, 40, 50))
	blob(canvas(cup, Enum.NormalId.Front, 10), "CupBand", 0, 0.3, 1, 0.4, WHITE)
	-- the lid and its straw: one thin post through the cup
	post(ctx, "SodaStraw", cx + 0.5, cz, top + 3, 4.4, 0.4, WHITE)
end

--[[
	A food truck parked along Z at z = cz, nose toward the entrance (-Z), serving window on its -X
	side facing the lane. Body X[TRUCK_X - 4, TRUCK_X + 4]. The counter under the window hands out
	the truck's snack (BuildUtil.Use); a sandwich-board menu by the cab can be looked at.
]]
local function foodTruck(ctx, spec, cz, team)
	local truck = BuildUtil.Child(ctx, spec.Name)
	local cx = TRUCK_X
	local x0, x1 = cx - 4, cx + 4

	for _, dz in ipairs({ -6.5, 6 }) do
		BuildUtil.Cylinder(truck, {
			Name = "Wheels",
			Axis = "X",
			Position = Vector3.new(cx, GROUND + 1.4, cz + dz),
			Height = 8.4,
			Diameter = 2.8,
			Color = TIRE,
			Material = Enum.Material.Rubber,
		})
	end
	local body = span(truck, "Body", x0, x1, 1.8, 11, cz - 6.5, cz + 10, spec.Body)
	local cab = span(truck, "Cab", x0, x1, 1.8, 6, cz - 10, cz - 6.5, spec.Body)
	-- headlights and grille painted on the cab's nose (the Front face looks toward -Z)
	local nose = canvas(cab, Enum.NormalId.Front, 20)
	blob(nose, "HeadLight", 0.06, 0.28, 0.16, 0.22, HEADLIGHT, true)
	blob(nose, "HeadLight", 0.78, 0.28, 0.16, 0.22, HEADLIGHT, true)
	blob(nose, "Grille", 0.3, 0.3, 0.4, 0.2, DARK_METAL)
	-- windshield painted on the body's front face above the cab (the Front face looks toward -Z)
	blob(canvas(body, Enum.NormalId.Front, 10), "Windshield", 0.06, 2 / 9.2, 0.88, 2.8 / 9.2, CAR_GLASS)

	-- steel counter at chest height under the serving window (the window itself is painted below)
	local counter = span(truck, "Counter", x0 - 1.3, x0, 3.3, 3.6, cz - 3.2, cz + 5.6, STAINLESS, Enum.Material.Metal)
	BuildUtil.Light(counter, "PointLight", { Name = "KitchenGlow", Range = 12, Brightness = 1, Color = WARM_LIGHT })
	BuildUtil.Use(truck, counter, spec.Use, {
		Object = spec.Title,
		Title = spec.Title,
		Info = spec.Info,
		At = Vector3.new(-0.4, 1, 0),
		Distance = 8,
	})

	-- striped awning hinged above the window, sloping down toward the lane
	local reach, drop = 3.6, 1.2
	local awningColor = team.Primary
	local stripeColor = partnerColor(awningColor, team)
	local awning = boxAt(
		truck,
		"Awning",
		Vector3.new(math.sqrt(reach * reach + drop * drop), 0.2, 9.8),
		CFrame.new(x0 - reach / 2, 8.6 - drop / 2, cz + 1.2) * CFrame.Angles(0, 0, math.atan2(drop, reach)),
		awningColor,
		Enum.Material.Fabric
	)
	for _, face in ipairs({ Enum.NormalId.Top, Enum.NormalId.Bottom }) do
		local gui = canvas(awning, face, 10)
		for stripe = 2, 6, 2 do
			blob(gui, "Stripe", 0, (stripe - 1) / 7, 1, 1 / 7, stripeColor)
		end
	end

	-- painted on the body: a team stripe and a cab side window on both sides, plus the serving
	-- window (warm kitchen inside) and a chalkboard menu on the lane side. The -X face runs from
	-- cz - 6.5 on its left to cz + 10 on its right, the +X face the other way; top edge at y = 11.
	local length, height = 16.5, 9.2
	for _, face in ipairs({ Enum.NormalId.Left, Enum.NormalId.Right }) do
		local gui = canvas(body, face, 10)
		blob(gui, "TeamStripe", 0, 0.9, 1, 0.05, team.Primary)
		local cabWindowX = face == Enum.NormalId.Left and 0.2 / length or 1 - 3.3 / length
		blob(gui, "CabWindow", cabWindowX, 2 / height, 3.1 / length, 2.7 / height, CAR_GLASS)
		if face == Enum.NormalId.Left then
			local hatch = blob(gui, "ServingWindow", 3.5 / length, 3.2 / height, 8.4 / length, 4.2 / height, KITCHEN)
			blob(hatch, "Shelf", 0.04, 0.42, 0.92, 0.06, STAINLESS)
			local board = blob(gui, "MenuPanel", 12.6 / length, 2.4 / height, 3.4 / length, 4.6 / height, CHALKBOARD)
			words(board, "Menu", 0.08, 0.06, 0.84, 0.88, spec.Menu, MENU_TEXT, Enum.Font.GothamBold)
		end
	end

	-- sandwich-board menu on the lot by the cab, leaning back a little
	local menu = boxAt(
		truck,
		"MenuBoard",
		Vector3.new(0.3, 3.6, 2.6),
		CFrame.new(cx - 8.6, GROUND + 1.75, cz - 7.6) * CFrame.Angles(0, 0, math.rad(-8)),
		CHALKBOARD,
		Enum.Material.Wood
	)
	local menuGui = canvas(menu, Enum.NormalId.Left, 30)
	words(menuGui, "MenuTitle", 0.06, 0.04, 0.88, 0.2, spec.Sign, readableOn(CHALKBOARD, { team.Trim, team.Secondary }))
	words(menuGui, "MenuItems", 0.08, 0.28, 0.84, 0.66, spec.Menu, MENU_TEXT, Enum.Font.GothamBold)
	BuildUtil.Look(menu, spec.Title .. " Menu", spec.MenuInfo, { Distance = 8 })

	-- roof sign (reads from both sides) and the giant snack
	local roofSign = span(truck, "RoofSign", cx - 0.4, cx + 0.4, 11, 13.8, cz - 0.2, cz + 9.6, spec.SignColor)
	sign(roofSign, { Enum.NormalId.Left, Enum.NormalId.Right }, spec.Sign, spec.SignColor, team, {
		TextColor3 = readableOn(spec.SignColor, { WHITE, Color3.fromRGB(255, 220, 60), INK }),
		InsetY = 0.1,
	})
	PROPS[spec.Prop](truck, cx, 11, cz - 3.6)
end

-- A picnic table on the grass: top + centre leg, and a bench Seat on each long side (facing it).
local function picnicTable(ctx, cx, cz)
	span(ctx, "PicnicTop", cx - 3.2, cx + 3.2, 2.9, 3.2, cz - 1.4, cz + 1.4, PICNIC_WOOD, Enum.Material.WoodPlanks)
	span(ctx, "PicnicLeg", cx - 2.4, cx + 2.4, GROUND, 2.9, cz - 0.3, cz + 0.3, PICNIC_DARK, Enum.Material.Wood)
	for _, side in ipairs({ -1, 1 }) do
		BuildUtil.Seat(ctx, {
			Name = "PicnicBench",
			Size = Vector3.new(6, 1.5, 1.1),
			-- the north bench faces -Z (its default), the south one is turned to face +Z
			CFrame = CFrame.new(cx, GROUND + 0.75, cz + side * 2.4) * CFrame.Angles(0, side > 0 and 0 or math.pi, 0),
			Color = PICNIC_WOOD,
			Material = Enum.Material.WoodPlanks,
			NoPrompt = true,
		})
	end
end

local function foodTrucks(ctx, team)
	for index, spec in ipairs(TRUCKS) do
		foodTruck(ctx, spec, TRUCK_Z[index], team)
	end
	local court = BuildUtil.Child(ctx, "FoodCourt")
	for _, z in ipairs(PICNIC_Z) do
		picnicTable(court, PICNIC_X, z)
	end
end

---------------------------------------------------------------------------------------------
-- Step 3: Tents & Grills
---------------------------------------------------------------------------------------------

-- Pop-up canopy tent: four legs, a valance with the team name and a peaked roof.
local function canopyTent(ctx, name, cx, cz, color, team, text)
	local size, legTop = 8.6, 7.6
	local half = size / 2 - 0.3
	for _, sx in ipairs({ -1, 1 }) do
		for _, sz in ipairs({ -1, 1 }) do
			BuildUtil.Block(
				ctx,
				name .. "Leg",
				Vector3.new(0.3, legTop - GROUND, 0.3),
				Vector3.new(cx + sx * half, 0, cz + sz * half),
				TENT_FRAME,
				Enum.Material.Metal,
				nil,
				GROUND
			)
		end
	end
	local valance = span(
		ctx,
		name .. "Valance",
		cx - size / 2,
		cx + size / 2,
		legTop,
		legTop + 0.9,
		cz - size / 2,
		cz + size / 2,
		color,
		Enum.Material.Fabric
	)
	sign(
		valance,
		{ Enum.NormalId.Front, Enum.NormalId.Back, Enum.NormalId.Left, Enum.NormalId.Right },
		text,
		color,
		team,
		{ InsetY = 0.08 }
	)
	gableRoof(ctx, name .. "Peak", cx, cz, legTop + 0.9, size, size, 2.2, color, Enum.Material.Fabric)
end

local function tailgateParty(ctx, team, name)
	local party = BuildUtil.Child(ctx, "Tailgate")
	local tentText = name ~= "" and name or "TAILGATE"

	-- east lot, stall 4 (beside the pickup): team tent with a party table, two chairs and a grill
	local tentZ = stallCenter(4)
	canopyTent(party, "TentA", 252, tentZ, team.Primary, team, tentText)
	local tableTop = span(party, "PartyTable", 255, 257.4, GROUND, 2.8, tentZ - 2.6, tentZ + 2.6, team.Secondary, Enum.Material.Fabric)
	sign(tableTop, { Enum.NormalId.Left }, "GO TEAM!", team.Secondary, team)
	BuildUtil.Look(
		tableTop,
		"Season Ticket Tent",
		"Your most loyal fans set up here before every home game: wings, chips and a LOT of cheering.",
		{ LookKey = "record", Distance = 8 }
	)
	campChair(party, 251, tentZ - 2.2, Vector3.new(-1, 0, 0), team.Secondary)
	campChair(party, 251, tentZ + 2.2, Vector3.new(-1, 0, 0), team.Secondary)

	-- kettle grill at the lane end of the tent's stall
	local gx, gz = 246.4, tentZ
	post(party, "GrillLeg", gx, gz, GROUND, 2, 0.35, GRILL_BLACK, Enum.Material.Metal)
	local grill = ball(party, "KettleGrill", Vector3.new(gx, 3, gz), 2.4, GRILL_BLACK, Enum.Material.Metal)
	smoke(party, Vector3.new(gx + 0.3, 6, gz + 0.3), 1.8)
	BuildUtil.Look(
		grill,
		"Kettle Grill",
		"Grilling for the game! Burgers and brats have been sizzling here since sunrise.",
		{ Distance = 8 }
	)

	-- west lot, stall 6: a second tent with a barrel smoker, a cooler and a team flag
	local westZ = stallCenter(6)
	canopyTent(party, "TentB", 222.4, westZ, team.Secondary, team, tentText)
	local smokerX = 229.2
	span(party, "SmokerStand", smokerX - 1.1, smokerX + 1.1, GROUND, 2.2, westZ - 1.8, westZ + 1.8, GRILL_BLACK, Enum.Material.Metal)
	local smoker = cylinderAt(
		party,
		"BarrelSmoker",
		CFrame.new(smokerX, 3.2, westZ) * CFrame.Angles(0, math.pi / 2, 0),
		4,
		2.4,
		GRILL_BLACK,
		Enum.Material.Metal
	)
	smoke(party, Vector3.new(smokerX + 0.3, 6.4, westZ - 1.2), 2)
	BuildUtil.Look(
		smoker,
		"Barrel Smoker",
		"Grilling for the game, low and slow: ribs smoke in here for hours before kickoff. Smells amazing!",
		{ Distance = 8 }
	)
	cooler(party, CFrame.new(224.4, GROUND, westZ + 2.6), team.Primary)
	-- a tall team flag at the tent's back corner, to find your tailgate from afar
	local flagX, flagZ = 216.2, westZ + 4.2
	post(party, "FlagPole", flagX, flagZ, GROUND, 15, 0.3, TENT_FRAME, Enum.Material.Metal)
	local flag =
		span(party, "TeamFlag", flagX - 0.05, flagX + 0.05, 11.2, 14.6, flagZ - 5.4, flagZ - 0.2, team.Primary, Enum.Material.Fabric)
	sign(flag, { Enum.NormalId.Left, Enum.NormalId.Right }, tentText, team.Primary, team, { InsetY = 0.2 })

	-- cornhole: two tilted boards facing each other along the west stalls
	local boards = {}
	for _, spot in ipairs({ { stallCenter(9), 1 }, { stallCenter(11), -1 } }) do
		local z, dir = spot[1], spot[2]
		local board = boxAt(
			party,
			"CornholeBoard",
			Vector3.new(2.2, 0.25, 4),
			CFrame.new(222, GROUND + 0.5, z) * CFrame.Angles(dir * math.rad(12), 0, 0),
			team.Primary,
			Enum.Material.Wood
		)
		local gui = canvas(board, Enum.NormalId.Top, 20)
		blob(gui, "Hole", 0.3, dir > 0 and 0.14 or 0.62, 0.4, 0.22, INK, true)
		blob(gui, "BeanBag", 0.18, 0.5, 0.2, 0.1, team.Secondary)
		table.insert(boards, board)
	end
	BuildUtil.Look(
		boards[1],
		"Cornhole",
		"The classic tailgate game: toss bean bags at the far board. In the hole = 3 points, on the board = 1. First to 21 wins!",
		{ Distance = 8 }
	)
end

---------------------------------------------------------------------------------------------
-- Step 4: Football Toss Game
---------------------------------------------------------------------------------------------

local function footballToss(ctx, team)
	local toss = BuildUtil.Child(ctx, "FootballToss")
	local x0, x1, tz = TOSS.X0, TOSS.X1, TOSS.TargetZ

	-- turf runway (turned so its marks read upright from the throw line)
	local turf = BuildUtil.Part(toss, {
		Name = "TossTurf",
		Size = Vector3.new(x1 - x0, TOSS.Top - GROUND, TOSS.Z1 - TOSS.Z0),
		CFrame = CFrame.new((x0 + x1) / 2, (GROUND + TOSS.Top) / 2, (TOSS.Z0 + TOSS.Z1) / 2) * CFrame.Angles(0, math.pi, 0),
		Color = TURF,
		Material = Enum.Material.Grass,
		CanCollide = false,
		CastShadow = false,
	})
	local sheet = topSheet(turf, x0, x1, TOSS.Z0, TOSS.Z1, 8, true)
	for index, z in ipairs({ -4, 4, 12 }) do
		sheet.rect("YardMark", x0 + 1, x1 - 1, z - 0.15, z + 0.15, WHITE)
		sheet.text("YardNumber", x0 + 1, x0 + 4, z + 0.4, z + 2.6, tostring(30 - (index - 1) * 10), WHITE)
	end
	sheet.text("ThrowHere", x0 + 3, x1 - 3, TOSS.Z0 + 1.5, TOSS.ThrowZ - 1.2, "THROW FROM HERE", WHITE)
	span(toss, "ThrowLine", x0, x1, TOSS.Top, 0.32, TOSS.ThrowZ - 0.4, TOSS.ThrowZ + 0.4, WHITE, Enum.Material.SmoothPlastic, PAINT)

	-- target frame: two posts, the sign on top and the board with three scoring holes
	for _, x in ipairs({ x0 + 0.8, x1 - 0.8 }) do
		BuildUtil.Block(
			toss,
			"TossPost",
			Vector3.new(1.2, 14.4, 1.2),
			Vector3.new(x, 0, tz),
			team.Primary,
			Enum.Material.Metal,
			nil,
			TOSS.Top
		)
	end
	local header = span(toss, "TossSign", x0, x1, 11.6, 14.8, tz - 0.7, tz + 0.7, team.Secondary)
	sign(header, { Enum.NormalId.Front, Enum.NormalId.Back }, "FOOTBALL TOSS", team.Secondary, team, { Outline = 2 })
	local bx0, bx1, by0, by1 = x0 + 1.4, x1 - 1.4, TOSS.Top, 11.6
	local board = span(toss, "TossBoard", bx0, bx1, by0, by1, tz - 0.3, tz + 0.3, WHITE, Enum.Material.Wood)
	local front = tz - 0.3
	local holes = { { 218.6, 8.4, 2.6, "25" }, { 225.4, 8.4, 2.6, "25" }, { 222, 4.4, 3.4, "10" } }
	local boardGui = canvas(board, Enum.NormalId.Front, 20)
	local w, h = bx1 - bx0, by1 - by0
	for _, hole in ipairs(holes) do
		local hx, hy, d, points = hole[1], hole[2], hole[3], hole[4]
		BuildUtil.Cylinder(toss, {
			Name = "Hole",
			Axis = "Z",
			Position = Vector3.new(hx, hy, front - 0.05),
			Height = 0.1,
			Diameter = d,
			Color = INK,
		})
		-- a team ring around the hole and the points under it (the Front face reads +X on the left)
		local ringD = d + 1.2
		local ring =
			blob(boardGui, "HoleRing", (bx1 - hx - ringD / 2) / w, (by1 - hy - ringD / 2) / h, ringD / w, ringD / h, team.Primary, true)
		ring.BackgroundTransparency = 1
		local stroke = Instance.new("UIStroke")
		stroke.Name = "Ring"
		stroke.Color = team.Primary
		stroke.Thickness = 10
		stroke.Parent = ring
		local labelTop = hy - ringD / 2 - 0.1
		words(boardGui, "Points", (bx1 - hx - 1.2) / w, (by1 - labelTop) / h, 2.4 / w, 1.2 / h, points, INK)
	end
	words(boardGui, "Rules", 0.1, 0.01, 0.8, 0.1, "SCORE 50 = PRIZE!", INK)
	BuildUtil.Look(
		board,
		"Target Board",
		"Aim for the holes! The small top holes are worth 25 points, the big bottom hole 10.",
		{ At = Vector3.new(0, -3, -0.8), Distance = 9 }
	)

	-- a bin of footballs at the throw line (the rules are on it)
	local binX, binZ = x1 - 2, TOSS.ThrowZ - 2
	local bin =
		span(toss, "BallBin", binX - 1.2, binX + 1.2, TOSS.Top, 2.3, binZ - 1.2, binZ + 1.2, team.Primary, Enum.Material.DiamondPlate)
	football(toss, "Football", CFrame.new(binX - 0.4, 2.75, binZ - 0.3) * CFrame.Angles(0, 0.4, 0.3), 1.6, 1, NO_COLLIDE)
	football(toss, "Football", CFrame.new(binX + 0.5, 2.75, binZ + 0.2) * CFrame.Angles(0, -0.9, -0.2), 1.6, 1, NO_COLLIDE)
	BuildUtil.Look(
		bin,
		"Football Toss",
		"Stand behind the line and throw three footballs at the target. Hit 50 points and you win a prize - every fan gets a foam finger at the prize kiosk!",
		{ LookKey = "rating", Distance = 8 }
	)

	-- prize kiosk at the south end: back wall with prize shelves, a counter and a giant foam finger
	local k = KIOSK
	local kx = (k.X0 + k.X1) / 2
	local back = span(toss, "KioskBack", k.X0, k.X1, 0, 8.4, k.Z0, k.Z0 + 1, team.Primary)
	local shelves = canvas(back, Enum.NormalId.Back, 10)
	local fingerColor = partnerColor(team.Primary, team)
	for row = 0, 1 do
		blob(shelves, "Shelf", 0.04, 0.36 + row * 0.3, 0.92, 0.03, WHITE)
		for col = 0, 4 do
			blob(shelves, "PrizeFinger", 0.1 + col * 0.17, 0.2 + row * 0.3, 0.07, 0.16, fingerColor)
		end
	end
	local header2 = span(toss, "KioskSign", k.X0 - 0.4, k.X1 + 0.4, 8.4, 10.4, k.Z0 - 0.2, k.Z0 + 1.2, team.Secondary)
	sign(header2, { Enum.NormalId.Front, Enum.NormalId.Back }, "PRIZES", team.Secondary, team, { Outline = 1 })
	local counter = span(toss, "PrizeCounter", k.X0 + 0.4, k.X1 - 0.4, GROUND, 3.4, k.Z1 - 1.4, k.Z1, WHITE)
	blob(canvas(counter, Enum.NormalId.Back, 10), "CounterStripe", 0, 0.15, 1, 0.2, team.Primary)
	BuildUtil.Use(toss, counter, "foamfinger", {
		Object = "Prize Kiosk",
		Title = "Football Toss Prizes",
		Info = "Every thrower is a winner! Wave your giant foam finger for the team.",
		At = Vector3.new(0, 1.6, 1.2),
		Distance = 8,
	})
	-- the giant foam finger: a hand with "#1" and the pointing finger
	local hand = span(toss, "FoamHand", kx - 1.3, kx + 1.3, 10.4, 12.8, k.Z0 - 0.1, k.Z0 + 1.1, fingerColor, Enum.Material.Foil)
	sign(hand, { Enum.NormalId.Front, Enum.NormalId.Back }, "#1", fingerColor, team, { InsetX = 0.12, InsetY = 0.15 })
	span(toss, "FoamFinger", kx + 0.1, kx + 1, 12.8, 15.4, k.Z0 + 0.05, k.Z0 + 0.95, fingerColor, Enum.Material.Foil)
end

---------------------------------------------------------------------------------------------
-- Step 5: Mascot Statue
---------------------------------------------------------------------------------------------

local function mascotStatue(ctx, team, name)
	local statue = BuildUtil.Child(ctx, "MascotStatue")
	local cx, cz = PLAZA.X, PLAZA.Z

	-- round plaza in the lane with a team ring painted around its edge (the cylinder's +X face is
	-- its top)
	local plaza = BuildUtil.Cylinder(statue, {
		Name = "MascotPlaza",
		Axis = "Y",
		Position = Vector3.new(cx, (GROUND + PLAZA.Top) / 2, cz),
		Height = PLAZA.Top - GROUND,
		Diameter = PLAZA.Diameter,
		Color = PLAZA_PAVER,
		Material = Enum.Material.Pavement,
	})
	local ring = blob(canvas(plaza, Enum.NormalId.Right, 4), "PlazaRing", 0.04, 0.04, 0.92, 0.92, team.Primary, true)
	ring.BackgroundTransparency = 1
	local ringStroke = Instance.new("UIStroke")
	ringStroke.Name = "Ring"
	ringStroke.Color = team.Primary
	ringStroke.Thickness = 6
	ringStroke.Parent = ring

	-- plinth with the team name on every side
	local plinth =
		BuildUtil.Block(statue, "Plinth", Vector3.new(9, 4.8, 9), Vector3.new(cx, 0, cz), MARBLE, Enum.Material.Marble, nil, PLAZA.Top)
	-- a dark stone band around its foot
	local faces = { Enum.NormalId.Front, Enum.NormalId.Back, Enum.NormalId.Left, Enum.NormalId.Right }
	for _, face in ipairs(faces) do
		blob(canvas(plinth, face, 10), "StoneBand", 0, 0.86, 1, 0.14, STONE)
	end
	sign(plinth, faces, name ~= "" and ("BIG BRUNO\n" .. name) or "BIG BRUNO", MARBLE, team, {
		TextColor3 = readableOn(MARBLE, { team.Primary, team.Secondary }),
		Wrap = true,
		InsetY = 0.16,
	})
	BuildUtil.Light(plinth, "SpotLight", { Name = "StatueLight", Face = Enum.NormalId.Top, Angle = 50, Range = 30, Brightness = 2 })
	BuildUtil.Look(
		plinth,
		"Big Bruno",
		"Meet Big Bruno, the Fan Zone's giant bull! He wears #12 for the '12th fan' - that's you. Fans rub his hoof for luck before kickoff.",
		{ LookKey = "team", At = Vector3.new(0, -0.4, -5.2), Distance = 9 }
	)

	-- the bull faces the entrance (-Z); his right side is +X
	local b = PLAZA.Top + 4.8
	for _, side in ipairs({ -1, 1 }) do
		BuildUtil.Block(
			statue,
			"Hoof",
			Vector3.new(2.6, 1.4, 3),
			Vector3.new(cx + side * 1.8, 0, cz - 0.3),
			HOOF,
			Enum.Material.SmoothPlastic,
			nil,
			b
		)
		BuildUtil.Block(
			statue,
			"Leg",
			Vector3.new(2.2, 4.6, 2.2),
			Vector3.new(cx + side * 1.8, 0, cz),
			FUR,
			Enum.Material.SmoothPlastic,
			nil,
			b + 1.2
		)
	end
	BuildUtil.Block(
		statue,
		"Shorts",
		Vector3.new(6.4, 2.6, 3.6),
		Vector3.new(cx, 0, cz),
		team.Secondary,
		Enum.Material.SmoothPlastic,
		nil,
		b + 5.2
	)
	local jersey = BuildUtil.Block(
		statue,
		"Jersey",
		Vector3.new(7.4, 6, 4.4),
		Vector3.new(cx, 0, cz),
		team.Primary,
		Enum.Material.Fabric,
		nil,
		b + 7.8
	)
	sign(jersey, { Enum.NormalId.Front }, "12", team.Primary, team, { InsetX = 0.22, InsetY = 0.12, Outline = 3 })
	sign(jersey, { Enum.NormalId.Back }, name ~= "" and name or "FANS", team.Primary, team, { InsetY = 0.3 })

	-- arms: the right one holds a football up high, the left rests on the hip
	bar(
		statue,
		"ArmRaised",
		Vector3.new(cx + 3.6, b + 12.6, cz),
		Vector3.new(cx + 6.6, b + 18, cz - 0.6),
		1.9,
		FUR,
		Enum.Material.SmoothPlastic
	)
	bar(statue, "ArmHip", Vector3.new(cx - 3.6, b + 12.6, cz), Vector3.new(cx - 5.2, b + 8.6, cz), 1.9, FUR, Enum.Material.SmoothPlastic)
	football(statue, "HeldFootball", CFrame.new(cx + 7.1, b + 19.5, cz - 0.8) * CFrame.Angles(0, 0.3, math.rad(35)), 3.2, 2)

	-- head: muzzle with nostrils, a gold nose ring, eyes, brows, horns
	local headFront = cz - 3.1
	BuildUtil.Block(
		statue,
		"Head",
		Vector3.new(6.2, 5.2, 5.4),
		Vector3.new(cx, 0, cz - 0.4),
		FUR,
		Enum.Material.SmoothPlastic,
		nil,
		b + 13.6
	)
	local muzzle = span(statue, "Muzzle", cx - 2.2, cx + 2.2, b + 13.7, b + 16.1, headFront - 1.5, headFront + 0.1, MUZZLE)
	local nostrils = canvas(muzzle, Enum.NormalId.Front, 20)
	blob(nostrils, "Nostril", 0.18, 0.3, 0.16, 0.3, HOOF, true)
	blob(nostrils, "Nostril", 0.66, 0.3, 0.16, 0.3, HOOF, true)
	local noseRing = BuildUtil.Cylinder(statue, {
		Name = "NoseRing",
		Axis = "Z",
		Position = Vector3.new(cx, b + 13.5, headFront - 1.6),
		Height = 0.2,
		Diameter = 1.3,
		Color = GOLD,
		Material = Enum.Material.Metal,
	})
	-- the cylinder's +X face looks toward -Z: paint the hole in the ring
	blob(canvas(noseRing, Enum.NormalId.Right, 40), "RingHole", 0.25, 0.25, 0.5, 0.5, MUZZLE, true)
	for _, side in ipairs({ -1, 1 }) do
		local ex = cx + side * 1.5
		local eye = span(statue, "Eye", ex - 0.7, ex + 0.7, b + 16.4, b + 17.9, headFront - 0.15, headFront + 0.15, WHITE)
		-- the pupil looks a little inward (the Front face reads +X on the left)
		blob(canvas(eye, Enum.NormalId.Front, 20), "Pupil", side > 0 and 0.3 or 0.2, 0.15, 0.5, 0.55, INK, true)
		boxAt(
			statue,
			"Brow",
			Vector3.new(1.9, 0.45, 0.3),
			CFrame.new(ex, b + 18.3, headFront - 0.1) * CFrame.Angles(0, 0, side * math.rad(16)),
			HOOF
		)
		-- horn: out of the top corner of the head, then curving up (clear of the raised arm)
		local root = Vector3.new(cx + side * 2.6, b + 18.2, cz - 0.4)
		local bend = Vector3.new(cx + side * 4.6, b + 18.7, cz - 0.4)
		pipe(statue, "Horn", root, bend, 1.3, HORN, Enum.Material.SmoothPlastic)
		pipe(
			statue,
			"HornTip",
			bend - Vector3.new(side * 0.3, 0, 0),
			Vector3.new(cx + side * 5.3, b + 21, cz - 0.6),
			0.85,
			HORN_TIP,
			Enum.Material.SmoothPlastic
		)
	end
end

---------------------------------------------------------------------------------------------
-- Step 6: Stage & Speakers
---------------------------------------------------------------------------------------------

local function speakerStack(ctx, x0, x1, team)
	local z1 = STAGE.Z0 - 1.6
	local z0 = z1 - 4.4
	local cabinet = span(ctx, "SpeakerStack", x0, x1, 0, 9.6, z0, z1, SPEAKER_BLACK)
	-- woofers, a tweeter and a team badge painted on the front (4.8 wide, 9.6 tall)
	local gui = canvas(cabinet, Enum.NormalId.Front, 20)
	blob(gui, "Tweeter", 0.36, 0.05, 0.28, 0.14, CONE_GREY, true)
	blob(gui, "Woofer", 0.12, 0.22, 0.76, 0.38, CONE_GREY, true)
	blob(gui, "Woofer", 0.12, 0.6, 0.76, 0.38, CONE_GREY, true)
	blob(gui, "Badge", 0.3, 0.205, 0.4, 0.012, team.Primary)
	return cabinet
end

local function stageShow(ctx, team, name)
	local stage = BuildUtil.Child(ctx, "Stage")
	local S = STAGE
	local cx = (S.X0 + S.X1) / 2

	span(stage, "StageDeck", S.X0, S.X1, 0, S.Top, S.Z0, S.Z1, STAGE_BLACK, Enum.Material.WoodPlanks)
	local fascia = span(stage, "StageFascia", S.X0 - 0.1, S.X1 + 0.1, 0.4, S.Top - 0.3, S.Z0 - 0.25, S.Z0, team.Primary)
	sign(fascia, { Enum.NormalId.Front }, name ~= "" and (name .. " FAN FEST") or "FAN FEST", team.Primary, team, { InsetY = 0.1 })
	BuildUtil.Look(
		fascia,
		"Fan Fest Stage",
		"Live music, giveaways and pep rallies before every home game. Walk up the ramp and take a bow!",
		{ LookKey = "season", Distance = 9 }
	)
	BuildUtil.Wedge(stage, {
		Name = "StageRamp",
		Size = Vector3.new(5, S.Top, 7),
		-- tall face against the deck's east edge, the slope falls toward +X
		CFrame = CFrame.new(S.X1 + 3.5, S.Top / 2, S.Z0 + 5) * CFrame.Angles(0, -math.pi / 2, 0),
		Color = DARK_METAL,
		Material = Enum.Material.DiamondPlate,
	})

	-- back wall with the big screens: GAME DAY countdown on top, the live score below
	local backWall = span(stage, "StageBackWall", S.X0 + 1, S.X1 - 1, S.Top, S.RoofY, S.Z1 - 1, S.Z1, STAGE_BLACK)
	local wallGui = canvas(backWall, Enum.NormalId.Front, 6)
	local wallText = readableOn(STAGE_BLACK, { team.Secondary, team.Trim, team.Primary })
	local wallW, wallH = S.X1 - S.X0 - 2, S.RoofY - S.Top
	-- (the Front face reads +X on the left: "FAN" on the east side, "FEST" on the west side)
	words(wallGui, "FanWord", 0.02, 0.35, 8 / wallW, 6 / wallH, "FAN", wallText)
	words(wallGui, "FestWord", 1 - 0.02 - 8 / wallW, 0.35, 8 / wallW, 6 / wallH, "FEST", wallText)
	local gameday = span(stage, "GameDayScreen", cx - 13, cx + 13, 17.6, 20.8, S.Z1 - 1.4, S.Z1 - 1, SCREEN_BLACK)
	liveScreen(gameday, Enum.NormalId.Front, "gameday", "NEXT GAME IN 4:00", LED_YELLOW, 20)
	local score = span(stage, "ScoreScreen", cx - 13, cx + 13, 8.4, 17.2, S.Z1 - 1.4, S.Z1 - 1, SCREEN_BLACK)
	liveScreen(score, Enum.NormalId.Front, "score", (name ~= "" and name or "HOME") .. " 0 - 0 VISITORS", LED_TEXT, 16)

	-- roof: carried by the back wall and two truss columns at the front corners
	span(stage, "StageRoof", S.X0 - 2, S.X1 + 2, S.RoofY, S.RoofY + 1, S.Z0 - 2, S.Z1, team.Secondary, Enum.Material.Metal)
	for _, x in ipairs({ S.X0 - 1.4, S.X1 + 1.4 }) do
		span(stage, "TrussColumn", x - 0.6, x + 0.6, 0, S.RoofY, S.Z0 - 2, S.Z0 - 0.8, TRUSS, Enum.Material.DiamondPlate)
	end

	-- light truss across the front with four coloured cans aimed at the stage
	span(stage, "LightTruss", S.X0 - 2, S.X1 + 2, 20.6, 21.8, S.Z0 - 2, S.Z0 - 0.8, TRUSS, Enum.Material.DiamondPlate)
	local beams = { team.Primary, WARM_LIGHT, team.Secondary, WARM_LIGHT }
	for index, x in ipairs({ cx - 18, cx - 6, cx + 6, cx + 18 }) do
		local color = beams[index]
		if luminance(color) < 0.05 then
			color = team.Trim
		end
		local can =
			pipe(stage, "StageLight", Vector3.new(x, 20.6, S.Z0 - 1.4), Vector3.new(x, 18.8, S.Z0 + 0.2), 1.3, color, Enum.Material.Neon)
		BuildUtil.Light(
			can,
			"SpotLight",
			{ Name = "StageBeam", Face = Enum.NormalId.Right, Angle = 40, Range = 40, Brightness = 3, Color = color }
		)
	end

	-- speaker stacks on the ground in front of both corners of the deck
	local speaker = speakerStack(stage, S.X0 + 0.4, S.X0 + 5.2, team)
	speakerStack(stage, S.X1 - 5.2, S.X1 - 0.4, team)
	BuildUtil.Look(
		speaker,
		"Speaker Stack",
		"Ten thousand watts of game-day music. You can hear the fight song all the way from the parking lot!",
		{ At = Vector3.new(0, -1.6, -2.4), Distance = 8 }
	)

	-- DJ booth: team-coloured table with two turntables and a laptop painted on top
	local deckTop = S.Top
	local booth = span(stage, "DJBooth", cx - 4, cx + 4, deckTop, deckTop + 3.4, S.Z0 + 4.5, S.Z0 + 7.5, team.Primary)
	sign(booth, { Enum.NormalId.Front }, "DJ", team.Primary, team, { InsetX = 0.3, InsetY = 0.15, Outline = 2 })
	local decks = canvas(booth, Enum.NormalId.Top, 20)
	blob(decks, "Turntable", 0.08, 0.15, 0.28, 0.7, DARK_METAL, true)
	blob(decks, "Turntable", 0.64, 0.15, 0.28, 0.7, DARK_METAL, true)
	blob(decks, "Laptop", 0.42, 0.25, 0.16, 0.5, STAINLESS)
	BuildUtil.Look(
		booth,
		"DJ Booth",
		"DJ Gridlock spins the pump-up jams before kickoff. Today's request: the fight song. Again. And again!",
		{ At = Vector3.new(0, 0, -1.8), Distance = 8 }
	)

	-- hay-bale seats on the grass either side of the lane (sit by walking into one)
	for row, z in ipairs({ 106.5, 112.5 }) do
		for _, x in ipairs({ LANE.X0 - 6, LANE.X1 + 6 }) do
			BuildUtil.Seat(stage, {
				Name = "HayBale",
				Size = Vector3.new(5, 1.6, 2),
				CFrame = CFrame.new(x + (row - 1.5) * 1.5, GROUND + 0.8, z) * CFrame.Angles(0, math.pi, 0), -- faces the stage (+Z)
				Color = HAY,
				Material = Enum.Material.Fabric,
				NoPrompt = true,
			})
		end
	end

	-- the sound desk at the end of the lane, with a TV-style stage camera seat behind it
	local desk = span(stage, "SoundDesk", FOH.X - 3, FOH.X + 3, GROUND, 3.2, FOH.Z + 1.2, FOH.Z + 2.6, DARK_METAL, Enum.Material.Metal)
	local mixer = canvas(desk, Enum.NormalId.Top, 20)
	for k = 0, 7 do
		blob(mixer, "Fader", 0.06 + k * 0.115, 0.2, 0.04, 0.6, k % 2 == 0 and LED_YELLOW or WHITE)
	end
	BuildUtil.Seat(stage, {
		Name = "SoundDeskSeat",
		Size = Vector3.new(2, 1.8, 2),
		CFrame = CFrame.new(FOH.X, GROUND + 0.9, FOH.Z - 0.6) * CFrame.Angles(0, math.pi, 0), -- faces the stage (+Z)
		Color = team.Primary,
		Material = Enum.Material.Fabric,
		Object = "Sound Desk - Stage Cam",
		Camera = { From = STAGE_CAM, To = Vector3.new(cx, 9, S.Z1 - 6), Fov = 50, Label = "FAN FEST CAM - LIVE" },
	})
end

---------------------------------------------------------------------------------------------
-- fan_zone
---------------------------------------------------------------------------------------------

function FanZone.fan_zone(ctx)
	local team = ctx.colors
	local C = ctx.config.Colors
	local name = teamName(ctx, "")

	BuildUtil.Stage(ctx, 1)
	tailgateLot(ctx, team, C, name)

	BuildUtil.Stage(ctx, 2)
	foodTrucks(ctx, team)

	BuildUtil.Stage(ctx, 3)
	tailgateParty(ctx, team, name)

	BuildUtil.Stage(ctx, 4)
	footballToss(ctx, team)

	BuildUtil.Stage(ctx, 5)
	mascotStatue(ctx, team, name)

	BuildUtil.Stage(ctx, 6)
	stageShow(ctx, team, name)
end

return FanZone
