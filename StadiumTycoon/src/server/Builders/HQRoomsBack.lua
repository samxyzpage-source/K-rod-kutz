--[[
	HQRoomsBack
	The back row of rooms inside the Team HQ (the empty building itself is Builders/HQShell.lua).
	Every room fills its zone (Config.Layout.Zones) between the corridor (z = 264..278) and the
	shell's back wall (inner face z = 358.5). Rooms are REAL walk-in rooms: floor, walls, a ceiling
	with light panels and a working door (BuildUtil.Door, opening INTO the room, toward +Z) right
	beside the room's buy button (never in line with it, so nobody walks out of a room onto a button).

	  hq_lockerroom    1 walls, team carpet, the team name over the lockers, a door to the showers
	                   2 a U of 14 team-colour lockers, each with its own door (look: whose locker),
	                     a jersey and a helmet inside
	                   3 benches (seats), a big floor logo, the STARTING LINEUP whiteboard (live)
	                   4 tiled showers (one running), towel rack, hamper, a live scoreboard screen,
	                     the PLAY LIKE A CHAMPION sign over the door, a sports-drink cooler (use)
	  hq_equipment     1 walls + the gear window (counter, look), the equipment manager's desk with
	                     a live gear checklist + chair (seat), empty shelves, a pad rail, an island
	                   2 helmets with facemasks, shoulder pads, cleats and ball bins (looks)
	                   3 washers + dryers (looks), folding table, laundry carts, travel trunks
	  hq_weightroom    1 rubber floor with a turf sprint lane, glass front with sliding glass doors,
	                     team accent wall
	                   2 three squat racks with team bumper plates (use: lift), a plate stack
	                   3 two bench presses (use: lift), dumbbell rack, kettlebells, plyo boxes, a push
	                     sled on the turf and battle ropes (looks)
	                   4 mirror wall, three motivational banners (looks), a live TEAM RATING board,
	                     the weight-room record board
	  hq_trainingroom  1 white clinic, tiled floor, frosted windows, red cross signs
	                   2 treatment tables (seats) with curtains, taping station, first-aid cabinet,
	                     a live player status board
	                   3 cold tub + hot tub (looks), ice machine, a sports-drink cooler (use)
	                   4 rehab gear: exercise bike (seat), treadmill, foam rollers, exercise balls,
	                     resistance bands (looks)
	  hq_filmroom      1 dark theatre: a staircase from the lobby up to six carpeted tiers with lit
	                     step edges, glass rails
	                   2 48 theatre seats (three aisle seats are TV camera seats aimed at the screen)
	                   3 big screen (live summary), projector + beam, speakers, the coach's clicker
	                     podium, popcorn machine (use), playbook library and a NOW SHOWING poster
	  hq_cafeteria     1 the double-width dining hall, glass front, double doors with windows
	                   2 the serving line: food pans under a sneeze guard, lunch trays (use), kitchen
	                   3 eight round tables with 32 chairs (seats), two live TVs (game day + score)
	                   4 smoothie bar with blenders, stools and a menu board (use: smoothie), and a
	                     drinks cooler (use: sports drink)

	Boards, menus, record lists and cubbies are drawn with GUI frames on SurfaceGuis (no extra
	parts). Players, legends and records are fictional.
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)

local HQRoomsBack = {}

-- Lines and heights shared by every back-row room (plot-local studs)
local SHELL_FLOOR = 0.2 -- top of the HQ shell's floor
local FLOOR_TOP = 0.32 -- room floors lie on the shell floor
local WALL_TOP = 12.2 -- room walls (the shell roof is at ~30); the ceilings rest on them
local CEILING_TOP = 12.6
local DOOR_TOP = 9.2 -- doorways and window heads
local CW_OUT, CW_IN = 278.2, 279.2 -- corridor-side room wall (the corridor ends at z = 278)
local FACE_Z = 278 -- the corridor face of the room row (trims stand on it)
local BACK_Z = 358.45 -- rooms reach the inner face of the shell's back wall (z = 358.5)
local LINE_Z = 358.15 -- inner face of the back-wall lining in every room
local DOOR_H = DOOR_TOP - FLOOR_TOP - 0.1 -- height of a closed door leaf
local DOOR_Z = (CW_OUT + CW_IN) / 2 -- door leaves sit in the middle of the corridor wall

local PAINT = { CanCollide = false, CastShadow = false }
local NO_COLLIDE = { CanCollide = false }

local WHITE = Color3.fromRGB(248, 248, 248)
local INK = Color3.fromRGB(22, 22, 26)
local BLACK = Color3.fromRGB(24, 24, 28)
local DARK_METAL = Color3.fromRGB(62, 64, 70)
local IRON = Color3.fromRGB(44, 44, 50)
local CHROME = Color3.fromRGB(200, 204, 210)
local STEEL = Color3.fromRGB(176, 182, 190)
local SCREEN = Color3.fromRGB(14, 16, 22)
local LED_DARK = Color3.fromRGB(12, 14, 20)
local LED_TEXT = Color3.fromRGB(255, 226, 120)
local LED_GREEN = Color3.fromRGB(110, 235, 140)
local WARM_LIGHT = Color3.fromRGB(255, 238, 205)
local COOL_LIGHT = Color3.fromRGB(235, 245, 255)
local LAMP = Color3.fromRGB(255, 248, 232)
local CEILING = Color3.fromRGB(232, 232, 228)
local DARK_WOOD = Color3.fromRGB(92, 62, 40)
local WOOD = Color3.fromRGB(150, 105, 60)
local LIGHT_WOOD = Color3.fromRGB(196, 156, 108)
local LEATHER_BLACK = Color3.fromRGB(34, 34, 38)
local FOOTBALL = Color3.fromRGB(124, 66, 36)
local GLASS = Color3.fromRGB(160, 210, 240)
local GOLD = Color3.fromRGB(255, 190, 40)
local MARKER_BLUE = Color3.fromRGB(28, 60, 150)
local CROSS_RED = Color3.fromRGB(214, 30, 40)
local TILE = Color3.fromRGB(222, 230, 236)
local WATER = Color3.fromRGB(120, 196, 245)
local HOT_WATER = Color3.fromRGB(60, 150, 220)
local ICE_BLUE = Color3.fromRGB(220, 240, 255)

local JERSEY_NUMBERS = { "1", "3", "7", "9", "12", "21", "22", "28", "34", "44", "52", "55", "72", "88", "90", "99" }
local LOCKER_INFO = {
	"Game jersey, polished helmet, lucky socks... and a half-eaten granola bar. Open it to see whose locker it is!",
	"Every player gets a locker with their name and number. This one smells like victory (and old socks).",
	"Inside: a fresh game jersey, a helmet and a family photo taped to the door for good luck.",
	"Cleats, gloves and a spare mouthguard live in here. Game day starts right at this locker!",
}

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
	opts: TextColor3, Font, PixelsPerStud, InsetX, InsetY, Left / Top / Width / Height (fractions of
	      the face), LightInfluence, BackgroundColor3 + BackgroundTransparency, Wrap
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
	label.Size = UDim2.new(opts.Width or (1 - 2 * insetX), 0, opts.Height or (1 - 2 * insetY), 0)
	label.Position = UDim2.new(opts.Left or insetX, 0, opts.Top or insetY, 0)
	if opts.Wrap then
		label.TextWrapped = true
	end
	return label
end

---------------------------------------------------------------------------------------------
-- GUI drawing (boards, menus, cubbies). Positions/sizes are in studs measured from the top-left
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

-- A filled circle (speaker cones, fruit, dots).
local function guiDot(gui, cx, cy, d, color)
	local frame = guiFrame(gui, cx - d / 2, cy - d / 2, d, d, color)
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0.5, 0)
	corner.Parent = frame
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

-- Office chair: pedestal, seat (a real seat), high back. Returns the seat.
local function officeChair(ctx, frame, color, opts)
	opts = opts or {}
	cyl(ctx, "ChairPost", (frame * CFrame.new(0, 0.8, 0)).Position, 1.6, 0.5, "Y", DARK_METAL, Enum.Material.Metal)
	local seat = lseat(ctx, frame, Vector3.new(2.2, 0.6, 2.2), 0, 1.5, 0, color, Enum.Material.Leather, {
		Name = "ChairSeat",
		Object = opts.Object or "Office Chair",
		NoPrompt = opts.NoPrompt,
	})
	lblock(ctx, frame, "ChairBack", Vector3.new(2.2, 3, 0.45), 0, 2.1, 1.0, color, Enum.Material.Leather)
	return seat
end

--[[
	A live screen (BuildUtil.LiveText) the server keeps up to date with the owner's team: dark LED
	background, bright text, glows in the dark. Returns the TextLabel.
	opts: TextColor3, BackgroundColor3, Font, PixelsPerStud, Padding, LightInfluence,
	      Header (a static title line over the live text), HeaderShare, HeaderColor, HeaderBackground
]]
local function liveScreen(part, face, live, placeholder, opts)
	opts = opts or {}
	local _, label = BuildUtil.LiveText(part, face, live, {
		LabelName = opts.LabelName or ("Live_" .. live),
		Text = placeholder,
		TextColor3 = opts.TextColor3 or LED_TEXT,
		BackgroundColor3 = opts.BackgroundColor3 or LED_DARK,
		BackgroundTransparency = 0,
		LightInfluence = opts.LightInfluence or 0,
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
-- room, toward +Z, or slide into the wall), a frame + optional name plate on the corridor side.
-- Call it after BuildUtil.Stage (the door builds into its own child model).
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
	if o.DoorSign then
		local plate = box(ctx, "DoorSign", op.From - 0.5, DOOR_TOP + 0.7, CW_OUT - 0.2, op.To + 0.5, DOOR_TOP + 1.7, CW_OUT, team.Primary)
		sign(plate, Enum.NormalId.Front, o.DoorSign, team.Primary, team, { InsetX = 0.06, InsetY = 0.16 })
	end
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
		Range = o.LightRange or 28,
		Brightness = o.LightBrightness or 1.4,
		Color = o.LightColor or WARM_LIGHT,
	})
	return lamp
end

--[[
	Builds a room's floor, side walls, back-wall lining, corridor wall (doorway with a working door,
	windows), team band and ceiling with light panels, all in the current step.
	o: X0, X1 (floor / ceiling / corridor wall extent), InnerX0, InnerX1 (inner faces of the side
	   walls), Walls = { { minX, maxX } } (walls between rooms), Linings = { { minX, maxX } } (thin
	   linings in front of the shell's end walls), Openings = { { From, To, Sill?, Mullions?, Open?,
	   GlassColor?, Transparency? } } sorted by x (no Sill = the doorway; Open = no glass),
	   WallColor, WallMaterial, BackColor, FloorColor, FloorMaterial, CeilingColor, FrameColor,
	   Door (BuildUtil.Door props), DoorSign, Lights = { { x, z } }, LightSize, LightRange,
	   LightBrightness, LightColor, LampColor
	Returns { Lintel = the corridor wall above the openings, Back = the back-wall lining }.
]]
local function roomShell(ctx, o)
	local team = ctx.colors
	local x0, x1 = o.X0, o.X1
	local wallColor, wallMaterial = o.WallColor, o.WallMaterial or Enum.Material.Plaster
	box(ctx, "Floor", x0, SHELL_FLOOR, CW_OUT, x1, FLOOR_TOP, BACK_Z, o.FloorColor, o.FloorMaterial)
	for _, w in ipairs(o.Walls or {}) do
		box(ctx, "SideWall", w[1], SHELL_FLOOR, CW_IN, w[2], WALL_TOP, BACK_Z, wallColor, wallMaterial)
	end
	for _, w in ipairs(o.Linings or {}) do
		box(ctx, "WallLining", w[1], FLOOR_TOP, CW_IN, w[2], WALL_TOP, LINE_Z, wallColor, wallMaterial)
	end
	local back =
		box(ctx, "BackWallLining", o.InnerX0, FLOOR_TOP, LINE_Z, o.InnerX1, WALL_TOP, BACK_Z, o.BackColor or wallColor, wallMaterial)

	-- corridor wall: one lintel over everything, piers between the openings, sills under windows
	local lintel = box(ctx, "CorridorWallTop", x0, DOOR_TOP, CW_OUT, x1, WALL_TOP, CW_IN, wallColor, wallMaterial)
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
			if not op.Open then
				glaze(ctx, op)
			end
		else
			doorway(ctx, op, o)
		end
		x = op.To
	end
	pier(x, x1)
	box(ctx, "WallBand", x0, WALL_TOP - 1.1, FACE_Z, x1, WALL_TOP, CW_OUT, team.Primary)

	-- ceiling with glowing light panels
	box(ctx, "Ceiling", x0, WALL_TOP, FACE_Z, x1, CEILING_TOP, BACK_Z, o.CeilingColor or CEILING)
	for _, l in ipairs(o.Lights) do
		ceilingLight(ctx, l[1], l[2], o)
	end
	return { Lintel = lintel, Back = back }
end

---------------------------------------------------------------------------------------------
-- Locker Room X[-248, -200]
---------------------------------------------------------------------------------------------

local LOCKER_PITCH, LOCKER_DEPTH = 3.4, 3

--[[
	A bank of closed team lockers against a wall. `frame` is a plot-local CFrame at floor level on
	the wall face in the middle of the bank, its LookVector pointing into the room. Every locker
	has its own small door (BuildUtil.Door: it swings toward the room, its card says whose locker
	it is) and a jersey + helmet inside. Lockers are numbered from `first` along the frame's +X.
]]
local function lockerBank(ctx, frame, count, first, team)
	local bank = BuildUtil.Child(ctx, "LockerBank")
	local len = count * LOCKER_PITCH
	local D = LOCKER_DEPTH
	local inner = D - 0.3
	lblock(bank, frame, "LockerBack", Vector3.new(len, 8.5, 0.3), 0, 0, -0.15, shade(team.Primary, 0.3), Enum.Material.Wood)
	lblock(bank, frame, "LockerBase", Vector3.new(len, 1, inner), 0, 0, -0.3 - inner / 2, BLACK)
	local cap = lblock(bank, frame, "LockerCap", Vector3.new(len + 0.2, 0.9, D + 0.3), 0, 7.8, -(D + 0.3) / 2, team.Secondary)
	for i = 0, count do
		local x = math.clamp(-len / 2 + i * LOCKER_PITCH, -len / 2 + 0.125, len / 2 - 0.125)
		lblock(bank, frame, "LockerDivider", Vector3.new(0.25, 6.8, inner), x, 1, -0.3 - inner / 2, DARK_WOOD, Enum.Material.Wood)
	end
	for i = 1, count do
		local index = first + i - 1
		local x = -len / 2 + (i - 0.5) * LOCKER_PITCH
		local number = JERSEY_NUMBERS[(index - 1) % #JERSEY_NUMBERS + 1]
		local jerseyColor = (index % 2 == 1) and team.Primary or team.Trim
		local jersey = lblock(bank, frame, "Jersey", Vector3.new(2.4, 2.8, 0.2), x, 3.2, -0.55, jerseyColor, Enum.Material.Fabric)
		sign(jersey, Enum.NormalId.Front, number, jerseyColor, team, { InsetX = 0.22, InsetY = 0.2 })
		ball(bank, "Helmet", (frame * CFrame.new(x, 6.9, -1.35)).Position, 1.5, team.Primary, Enum.Material.SmoothPlastic, {
			Reflectance = 0.15,
		})
		local door = BuildUtil.Door(bank, {
			Name = "LockerDoor",
			Size = Vector3.new(LOCKER_PITCH - 0.3, 6.7, 0.2),
			CFrame = frame * CFrame.new(x, 1.05 + 3.35, -D - 0.1),
			Hinge = "Left",
			Color = team.Primary,
			Material = Enum.Material.Metal,
			Object = "Locker",
			Title = "Locker #" .. number,
			Info = LOCKER_INFO[(index - 1) % #LOCKER_INFO + 1],
			LookKey = "locker:" .. index,
			Distance = 6,
			AutoClose = 8,
		})
		local leaf = door:FindFirstChild("DoorLeaf")
		if leaf then
			sign(leaf, Enum.NormalId.Front, number, team.Primary, team, { Top = 0.06, Height = 0.12, InsetX = 0.18 })
		end
	end
	return cap
end

function HQRoomsBack.hq_lockerroom(ctx)
	local team = ctx.colors
	local name = teamLabel(ctx)
	local wall = Color3.fromRGB(214, 214, 220)
	local IX0, IX1 = -248.15, -200.8 -- inner faces: the west lining, the east wall
	local PZ0, PZ1 = 328, 329 -- partition between the lockers and the showers
	local OX0, OX1 = -244.5, -237.5 -- the way into the showers
	local CX = -224.5 -- centre line of the U

	-- Step 1: walls, team carpet, the partition with the team name, door, lights --------------
	BuildUtil.Stage(ctx, 1)
	local room = BuildUtil.Child(ctx, "Room")
	roomShell(room, {
		X0 = -248.45,
		X1 = -200,
		InnerX0 = IX0,
		InnerX1 = IX1,
		Walls = { { -200.8, -200 } },
		Linings = { { -248.45, IX0 } },
		Openings = { { From = -230, To = -222 } },
		WallColor = wall,
		FloorColor = shade(team.Primary, 0.45),
		FloorMaterial = Enum.Material.Carpet,
		Door = {
			Color = team.Primary,
			Material = Enum.Material.Wood,
			Object = "Locker Room",
			Title = "Locker Room",
			Info = "Where your players suit up before every game. Check out the lockers, then hit the showers!",
		},
		DoorSign = "PLAYERS ONLY",
		Lights = { { CX, 290 }, { CX, 304 }, { CX, 318 }, { CX, 343.5 } },
	})
	box(room, "PartitionWall", IX0, SHELL_FLOOR, PZ0, OX0, DOOR_TOP, PZ1, wall, Enum.Material.Plaster)
	box(room, "PartitionWall", OX1, SHELL_FLOOR, PZ0, IX1, DOOR_TOP, PZ1, wall, Enum.Material.Plaster)
	local lintel = box(room, "PartitionLintel", IX0, DOOR_TOP, PZ0, IX1, WALL_TOP, PZ1, wall, Enum.Material.Plaster)
	sign(lintel, Enum.NormalId.Front, name .. " LOCKER ROOM", wall, team, { InsetX = 0.2, Top = 0.12, Height = 0.6 })
	for _, x in ipairs({ IX0, IX1 - 0.05 }) do
		box(room, "WallStripe", x, 3.6, CW_IN, x + 0.05, 4.4, PZ0, team.Primary, Enum.Material.SmoothPlastic, PAINT)
	end

	-- Step 2: a U of team lockers, each with its own door, jersey and helmet --------------------
	BuildUtil.Stage(ctx, 2)
	local lockers = BuildUtil.Child(ctx, "Lockers")
	local backCap = lockerBank(lockers, CFrame.new(CX, FLOOR_TOP, PZ0), 6, 1, team)
	sign(backCap, Enum.NormalId.Front, name, team.Secondary, team, { InsetX = 0.2, InsetY = 0.12 })
	local sideZ = 315.2
	lockerBank(lockers, CFrame.new(IX0, FLOOR_TOP, sideZ) * CFrame.Angles(0, FACING.E, 0), 4, 7, team)
	lockerBank(lockers, CFrame.new(IX1, FLOOR_TOP, sideZ) * CFrame.Angles(0, FACING.W, 0), 4, 11, team)

	-- Step 3: benches inside the U, the floor logo, the starting-lineup whiteboard --------------
	BuildUtil.Stage(ctx, 3)
	local benches = BuildUtil.Child(ctx, "Benches")
	local benchSpecs = {
		{ x = -239.4, z = 315, facing = "E", along = "Z" },
		{ x = -209.6, z = 315, facing = "W", along = "Z" },
		{ x = CX, z = 319.6, facing = "S", along = "X" },
	}
	for i, b in ipairs(benchSpecs) do
		local frame = frameAt(b.x, b.z, b.facing)
		local len = b.along == "Z" and 10.9 or 12.7
		lblock(benches, frame, "BenchBase", Vector3.new(len - 1.2, 1.2, 1), 0, 0, 0, DARK_METAL, Enum.Material.Metal)
		local seatLen = (len - 0.1) / 2
		for k = 1, 2 do
			lseat(
				benches,
				frame,
				Vector3.new(seatLen - 0.1, 0.45, 1.8),
				(k - 1.5) * seatLen,
				1.2,
				0,
				LIGHT_WOOD,
				Enum.Material.WoodPlanks,
				{
					Name = "BenchSeat",
					Object = i == 3 and "Captains' Bench" or "Locker Bench",
					NoPrompt = k ~= 1,
				}
			)
		end
	end
	-- a team runner from the door to the logo
	box(benches, "Runner", -229, FLOOR_TOP, CW_IN, -223, FLOOR_TOP + 0.03, 288.2, team.Secondary, Enum.Material.Carpet, PAINT)
	-- big team logo on the carpet, reading upright from the door
	local logo = Vector3.new(CX, 0, 296)
	cyl(
		benches,
		"LogoRing",
		Vector3.new(logo.X, FLOOR_TOP + 0.02, logo.Z),
		0.04,
		16,
		"Y",
		team.Secondary,
		Enum.Material.SmoothPlastic,
		PAINT
	)
	cyl(benches, "LogoDisc", Vector3.new(logo.X, FLOOR_TOP + 0.05, logo.Z), 0.06, 14, "Y", team.Primary, Enum.Material.SmoothPlastic, PAINT)
	local logoText = BuildUtil.Part(benches, {
		Name = "LogoName",
		Size = Vector3.new(11.5, 0.02, 4.5),
		CFrame = CFrame.new(logo.X, FLOOR_TOP + 0.1, logo.Z) * CFrame.Angles(0, math.pi, 0),
		Transparency = 1,
		CanCollide = false,
		CastShadow = false,
	})
	sign(logoText, Enum.NormalId.Top, name, team.Primary, team, { InsetX = 0.02, InsetY = 0.05, PixelsPerStud = 14 })
	-- whiteboard with the live starting lineup (west wall, by the door)
	box(benches, "BoardFrame", IX0, 2.8, 281.6, IX0 + 0.2, 9.8, 294.4, team.Primary)
	local board = box(benches, "Whiteboard", IX0 + 0.2, 3.2, 282, IX0 + 0.3, 9.4, 294, WHITE)
	liveScreen(board, Enum.NormalId.Right, "roster", "QB  -\nRB  -\nWR  -\nOL  -\nDEF  -\nK  -", {
		BackgroundColor3 = WHITE,
		TextColor3 = MARKER_BLUE,
		Font = Enum.Font.PermanentMarker,
		LightInfluence = 0.3,
		PixelsPerStud = 20,
		Header = "STARTING LINEUP",
		HeaderShare = 0.2,
		HeaderColor = WHITE,
		HeaderBackground = team.Primary,
		Padding = 0.05,
	})
	BuildUtil.Look(
		board,
		"Starting Lineup",
		"The coach writes your best player at every position here before each game. Draft and train players to climb the lineup!",
		{ LookKey = "rating", Distance = 8 }
	)

	-- Step 4: showers, towels, live scoreboard, the champion sign, drinks cooler ---------------
	BuildUtil.Stage(ctx, 4)
	local showers = BuildUtil.Child(ctx, "Showers")
	box(showers, "ShowerFloor", IX0, FLOOR_TOP, PZ1, IX1, FLOOR_TOP + 0.04, LINE_Z, TILE, Enum.Material.CeramicTiles, PAINT)
	box(showers, "ShowerTiles", IX0, FLOOR_TOP, LINE_Z - 0.3, IX1, 9, LINE_Z, TILE, Enum.Material.CeramicTiles)
	box(showers, "ShowerTiles", IX0, FLOOR_TOP, PZ1, IX0 + 0.3, 9, LINE_Z - 0.3, TILE, Enum.Material.CeramicTiles)
	box(showers, "ShowerTiles", IX1 - 0.3, FLOOR_TOP, PZ1, IX1, 9, LINE_Z - 0.3, TILE, Enum.Material.CeramicTiles)
	-- five shower stalls along the back wall (nozzles out of the tiles), one of them running
	local headZ = LINE_Z - 1.1
	for i, hx in ipairs({ -242, -234, -226, -218, -210 }) do
		cyl(showers, "ShowerHead", Vector3.new(hx, 8.3, LINE_Z - 0.85), 1.1, 0.9, "Z", CHROME, Enum.Material.Metal)
		if i < 5 then
			box(showers, "ShowerDivider", hx + 3.85, FLOOR_TOP, LINE_Z - 6.3, hx + 4.15, 8, LINE_Z - 0.3, TILE, Enum.Material.CeramicTiles)
		end
	end
	local water = cyl(
		showers,
		"ShowerWater",
		Vector3.new(-226, (FLOOR_TOP + 7.9) / 2, headZ),
		7.9 - FLOOR_TOP,
		0.9,
		"Y",
		WATER,
		Enum.Material.Glass,
		{
			Transparency = 0.55,
			CanCollide = false,
			CastShadow = false,
		}
	)
	BuildUtil.Look(
		water,
		"Team Showers",
		"Hot showers after a muddy practice. Team rule: the last one in has to sing the fight song!",
		{ Distance = 8 }
	)
	-- vanity on the east wall: a counter with two sinks under a long mirror
	box(showers, "VanityCounter", IX1 - 3, FLOOR_TOP, 334, IX1, 3.4, 348, WHITE, Enum.Material.Marble)
	for _, sz in ipairs({ 337.5, 344.5 }) do
		cyl(showers, "Sink", Vector3.new(IX1 - 1.6, 3.5, sz), 0.2, 1.8, "Y", CHROME, Enum.Material.Metal)
	end
	local vanityMirror =
		box(showers, "VanityMirror", IX1 - 0.35, 4.2, 334.5, IX1 - 0.3, 8.6, 347.5, Color3.fromRGB(214, 224, 232), Enum.Material.Glass, {
			Reflectance = 0.6,
		})
	BuildUtil.Look(vanityMirror, "Locker Room Mirror", "Players fix their hair here before the post-game interview. Looking good, champ!", {
		Distance = 8,
	})
	-- towel rack on the shower side of the partition, a hamper by the way in
	cyl(showers, "TowelBar", Vector3.new(-231, 6.5, PZ1 + 0.16), 9, 0.25, "X", CHROME, Enum.Material.Metal)
	local towels = {}
	for i, tx in ipairs({ -234, -231, -228 }) do -- hanging over the bar
		local color = ({ team.Primary, WHITE, team.Secondary })[i]
		towels[i] = box(showers, "Towel", tx - 1.2, 3.6, PZ1 + 0.2, tx + 1.2, 6.8, PZ1 + 0.45, color, Enum.Material.Fabric, NO_COLLIDE)
	end
	BuildUtil.Look(
		towels[2],
		"Towel Rack",
		"Fresh, fluffy towels in team colours. The equipment staff washes hundreds of them every week!",
		{
			Distance = 7,
		}
	)
	cyl(showers, "LaundryHamper", Vector3.new(-246.4, FLOOR_TOP + 1.5, 332.2), 3, 2.4, "Y", team.Secondary, Enum.Material.Fabric)
	local showerSign =
		box(showers, "ShowerSign", OX0, 8.45, PZ0 + 0.3, OX1, DOOR_TOP, PZ1 - 0.3, team.Primary, Enum.Material.SmoothPlastic, NO_COLLIDE)
	sign(showerSign, Enum.NormalId.Front, "SHOWERS", team.Primary, team, { InsetX = 0.2, InsetY = 0.12 })
	-- the live scoreboard screen on the east wall, facing the door side
	box(showers, "ScoreboardFrame", IX1 - 0.4, 3, 283, IX1, 10.6, 301, team.Primary)
	local scoreboard = box(showers, "Scoreboard", IX1 - 0.55, 3.4, 283.4, IX1 - 0.4, 10.2, 300.6, SCREEN)
	liveScreen(scoreboard, Enum.NormalId.Left, "summary", name .. "\n0 - 0", { PixelsPerStud = 16, Padding = 0.06 })
	BuildUtil.Light(
		scoreboard,
		"SurfaceLight",
		{ Name = "ScreenGlow", Face = Enum.NormalId.Left, Range = 14, Brightness = 0.8, Color = team.Primary }
	)
	BuildUtil.Look(
		scoreboard,
		"Locker Room Scoreboard",
		"Your latest score, record and season, live. Players check it on the way out to the field.",
		{
			LookKey = "record",
			Distance = 9,
		}
	)
	-- PLAY LIKE A CHAMPION over the door (players tap it on the way out)
	local champion = box(showers, "ChampionSign", -233, 9.6, CW_IN, -219, 11.8, CW_IN + 0.25, team.Secondary)
	sign(champion, Enum.NormalId.Back, "PLAY LIKE A CHAMPION", team.Secondary, team, { InsetX = 0.05, InsetY = 0.14 })
	BuildUtil.Look(
		champion,
		"Play Like a Champion",
		"Players slap this sign for luck every time they head out of the locker room to play!",
		{
			Distance = 10,
		}
	)
	-- sports-drink cooler on a stand by the scoreboard
	box(showers, "CoolerStand", -204.2, FLOOR_TOP, 303, -201, 2.3, 306.2, DARK_METAL, Enum.Material.Metal)
	local cooler = cyl(showers, "DrinksCooler", Vector3.new(-202.6, 3.8, 304.6), 3, 2.8, "Y", team.Primary, Enum.Material.SmoothPlastic)
	BuildUtil.Use(ctx, cooler, "sportsdrink", {
		Object = "Sports Drink Cooler",
		Title = "Sports Drink Cooler",
		Info = "Ice-cold sports drinks to keep players hydrated. Grab one before you hit the field!",
		Distance = 8,
	})
	-- the game ball in a glass case, in the corner by the door
	box(showers, "CasePedestal", -206.4, FLOOR_TOP, 280, -202.4, 3.6, 284, DARK_WOOD, Enum.Material.Wood)
	local case = box(showers, "GameBallCase", -206.1, 3.6, 280.3, -202.7, 6.4, 283.7, GLASS, Enum.Material.Glass, { Transparency = 0.7 })
	ball(showers, "GameBall", Vector3.new(-204.4, 4.25, 282), 1.2, FOOTBALL, Enum.Material.Leather)
	BuildUtil.Look(
		case,
		"Game Ball",
		"After every win the coach hands the game ball to the player of the game. This one is from your very first win!",
		{
			LookKey = "record",
			Distance = 8,
		}
	)
end

---------------------------------------------------------------------------------------------
-- Equipment Room X[-200, -150]
---------------------------------------------------------------------------------------------

function HQRoomsBack.hq_equipment(ctx)
	local team = ctx.colors
	local wall = Color3.fromRGB(204, 206, 212)
	local shelfColor = Color3.fromRGB(150, 156, 166)
	local IX0, IX1 = -199.2, -150.8

	-- Step 1: walls, the gear window + manager's desk, empty shelving --------------------------
	BuildUtil.Stage(ctx, 1)
	local room = BuildUtil.Child(ctx, "Room")
	roomShell(room, {
		X0 = -200,
		X1 = -150,
		InnerX0 = IX0,
		InnerX1 = IX1,
		Walls = { { -200, IX0 }, { IX1, -150 } },
		Openings = { { From = -196, To = -188, Sill = 3.6, Open = true }, { From = -181, To = -173 } },
		WallColor = wall,
		WallMaterial = Enum.Material.Brick,
		BackColor = shade(team.Primary, 0.9),
		FloorColor = Color3.fromRGB(140, 144, 150),
		FloorMaterial = Enum.Material.Concrete,
		Door = {
			Color = Color3.fromRGB(128, 134, 144),
			Material = Enum.Material.Metal,
			Window = true,
			Object = "Equipment Room",
			Title = "Equipment Room",
			Info = "Helmets, pads, balls and a mountain of laundry. The equipment crew keeps the whole team geared up!",
		},
		Lights = { { -175, 290 }, { -175, 308 }, { -175, 326 }, { -175, 344 } },
	})
	-- the gear window: a counter through the corridor wall, a rolled-up shutter and a sign
	local counter = box(room, "GearCounter", -196.4, 3.6, FACE_Z, -187.6, 3.9, 281.4, WOOD, Enum.Material.Wood)
	box(room, "CounterCabinet", -196, FLOOR_TOP, CW_IN, -188, 3.6, 281.2, shade(team.Primary, 0.8))
	box(room, "Shutter", -196, 8.4, 278.45, -188, DOOR_TOP, 278.95, team.Secondary, Enum.Material.Metal)
	local windowSign = box(room, "GearWindowSign", -196.5, DOOR_TOP + 0.7, CW_OUT - 0.2, -187.5, DOOR_TOP + 1.7, CW_OUT, team.Primary)
	sign(windowSign, Enum.NormalId.Front, "GEAR WINDOW", team.Primary, team, { InsetX = 0.06, InsetY = 0.16 })
	ball(room, "CounterBell", Vector3.new(-189, 4.2, 279.4), 0.6, GOLD, Enum.Material.Metal)
	BuildUtil.Look(
		counter,
		"Gear Window",
		"Need new cleats or fresh gloves? Players line up here and the equipment manager hands out the gear.",
		{ Distance = 8 }
	)
	-- the equipment manager's desk with a live gear checklist, and the chair
	box(room, "Desk", -196, 2.9, 284, -188, 3.2, 286.4, WOOD, Enum.Material.Wood)
	box(room, "DeskSide", -196, FLOOR_TOP, 284.1, -195.6, 2.9, 286.3, DARK_METAL, Enum.Material.Metal)
	box(room, "DeskSide", -188.4, FLOOR_TOP, 284.1, -188, 2.9, 286.3, DARK_METAL, Enum.Material.Metal)
	box(room, "MonitorStand", -192.2, 3.2, 285.2, -191.8, 3.7, 285.6, DARK_METAL, Enum.Material.Metal)
	local monitor = box(room, "Monitor", -193.8, 3.7, 285.25, -190.2, 5.7, 285.45, SCREEN)
	liveScreen(monitor, Enum.NormalId.Back, "roster", "GEAR CHECK", {
		PixelsPerStud = 40,
		TextColor3 = LED_GREEN,
		Header = "GEAR CHECKLIST",
		HeaderShare = 0.2,
		HeaderBackground = team.Primary,
		Padding = 0.04,
	})
	officeChair(room, frameAt(-192, 288.8, "S"), LEATHER_BLACK, { Object = "Equipment Manager's Chair" })
	-- helmet shelving on the west wall (helmets arrive in step 2)
	for _, z in ipairs({ 294, 311.85, 329.7 }) do
		box(room, "ShelfUpright", IX0, FLOOR_TOP, z, IX0 + 2.6, 9.3, z + 0.3, shelfColor, Enum.Material.Metal)
	end
	for _, top in ipairs({ 1.5, 4.2, 6.9, 9.3 }) do
		box(room, "Shelf", IX0, top - 0.2, 294, IX0 + 2.6, top, 330, shelfColor, Enum.Material.DiamondPlate)
	end
	-- the shoulder-pad rail on the east wall, over a long row of cleat cubbies
	cyl(room, "PadRail", Vector3.new(-152.4, 7.8, 312), 36, 0.3, "Z", CHROME, Enum.Material.Metal)
	for _, z in ipairs({ 294.6, 329.4 }) do
		box(room, "RailBracket", -152.6, 7.6, z - 0.2, IX1, 8, z + 0.2, DARK_METAL, Enum.Material.Metal)
	end
	local cubbies = box(room, "CleatCubbies", -153, FLOOR_TOP, 294, IX1, 3.4, 330, shade(team.Primary, 0.8), Enum.Material.Wood)
	local cubbyGui = canvas(cubbies, Enum.NormalId.Left, 10, nil, 1)
	for col = 0, 11 do
		guiFrame(cubbyGui, 0.4 + col * 2.98, 0.4, 2.5, 2.2, Color3.fromRGB(30, 32, 38))
	end
	-- yellow safety lines along the main aisle
	for _, lx in ipairs({ -186, -166 }) do
		box(
			room,
			"SafetyLine",
			lx - 0.25,
			FLOOR_TOP,
			292,
			lx + 0.25,
			FLOOR_TOP + 0.03,
			338,
			Color3.fromRGB(250, 204, 40),
			Enum.Material.SmoothPlastic,
			PAINT
		)
	end
	-- the cleat island: a low cubby cabinet (cubbies drawn on both long sides)
	local island = box(room, "CubbyIsland", -178, FLOOR_TOP, 300, -172, 4.2, 324, Color3.fromRGB(70, 74, 82))
	box(room, "IslandTop", -178.2, 4.2, 299.8, -171.8, 4.4, 324.2, WOOD, Enum.Material.Wood)
	for _, face in ipairs({ Enum.NormalId.Left, Enum.NormalId.Right }) do
		local gui = canvas(island, face, 10, nil, 1)
		for col = 0, 5 do
			for row = 0, 1 do
				guiFrame(gui, 0.6 + col * 3.9, 0.35 + row * 1.85, 3.3, 1.5, Color3.fromRGB(30, 32, 38))
			end
		end
	end

	-- Step 2: helmets, shoulder pads, cleats, ball bins ------------------------------------------
	BuildUtil.Stage(ctx, 2)
	local gear = BuildUtil.Child(ctx, "Gear")
	local helmetLook
	for row, top in ipairs({ 4.2, 6.9 }) do
		for i, z in ipairs({ 297, 303, 309, 315, 321, 327 }) do
			local helmet = ball(gear, "Helmet", Vector3.new(-197.6, top + 0.9, z), 1.8, team.Primary, Enum.Material.SmoothPlastic, {
				Reflectance = 0.2,
			})
			box(
				gear,
				"Facemask",
				-196.85,
				top + 0.3,
				z - 0.55,
				-196.55,
				top + 0.95,
				z + 0.55,
				Color3.fromRGB(150, 150, 156),
				Enum.Material.Metal
			)
			if row == 2 and i == 3 then
				helmetLook = helmet
			end
		end
	end
	if helmetLook then
		BuildUtil.Look(
			helmetLook,
			"Helmet Wall",
			"Every helmet is custom-fitted to one player. The equipment crew checks each one before kickoff and keeps spares ready!",
			{ Distance = 8 }
		)
	end
	local padLook
	for i, z in ipairs({ 297, 303, 309, 315, 321, 327 }) do
		local pad = box(gear, "ShoulderPads", -153.2, 5.3, z - 1.5, -151.6, 7.65, z + 1.5, WHITE, Enum.Material.Plastic)
		local gui = canvas(pad, Enum.NormalId.Left, 20, nil, 1)
		guiFrame(gui, 0, 0.9, 3, 0.5, team.Primary)
		guiText(gui, 0.6, 1.45, 1.8, 0.8, JERSEY_NUMBERS[i + 4], team.Primary, Enum.Font.GothamBlack)
		if i == 3 then
			padLook = pad
		end
	end
	if padLook then
		BuildUtil.Look(
			padLook,
			"Shoulder Pads",
			"Hard plastic shells over soft foam. Linemen wear the biggest pads on the team, kickers the tiniest!",
			{ Distance = 8 }
		)
	end
	-- cleats on the island
	for i, z in ipairs({ 304, 310, 316, 322 }) do
		local color = i % 2 == 1 and BLACK or WHITE
		box(gear, "Cleats", -176, 4.4, z - 0.6, -174, 5.1, z + 0.6, color, Enum.Material.Leather)
	end
	local cleatTop = box(gear, "Cleats", -176, 4.4, 312.4, -174, 5.1, 313.6, team.Primary, Enum.Material.Leather)
	BuildUtil.Look(
		cleatTop,
		"Cleat Island",
		"Grass cleats, turf shoes, rain cleats... most players bring three or four pairs to every game!",
		{
			Distance = 8,
		}
	)
	-- helmet repair bench on the east wall, by the door
	local bench = box(gear, "RepairBench", -153.8, 3, 281, IX1, 3.3, 290, LIGHT_WOOD, Enum.Material.Wood)
	box(gear, "BenchCabinet", -153.6, FLOOR_TOP, 281.2, IX1, 3, 289.8, DARK_METAL, Enum.Material.Metal)
	ball(gear, "Helmet", Vector3.new(-152.4, 4.2, 285.5), 1.8, team.Primary, Enum.Material.SmoothPlastic, { Reflectance = 0.2 })
	local pegboard = box(gear, "ToolBoard", IX1 - 0.2, 4.6, 281.5, IX1, 9, 289.5, Color3.fromRGB(196, 170, 130), Enum.Material.Wood)
	local toolGui = canvas(pegboard, Enum.NormalId.Left, 10, nil, 1)
	for k, tool in ipairs({
		{ 0.8, 0.6, 0.5, 2.6 },
		{ 2.2, 0.6, 1.6, 0.5 },
		{ 4.4, 0.6, 0.5, 2.2 },
		{ 5.8, 1.2, 1.4, 1.4 },
		{ 2.2, 2.2, 1.6, 1.2 },
	}) do
		guiFrame(toolGui, tool[1], tool[2], tool[3], tool[4], k % 2 == 1 and DARK_METAL or CROSS_RED)
	end
	BuildUtil.Look(
		bench,
		"Helmet Repair Bench",
		"Loose facemask? Wobbly chin strap? The equipment crew fixes helmets here and sticks on fresh team decals.",
		{ At = Vector3.new(-1.1, 0.4, 2), Distance = 8 }
	)
	-- two ball bins full of footballs
	for i, z in ipairs({ 306, 316 }) do
		local bin = box(gear, "BallBin", -164.4, FLOOR_TOP, z - 1.7, -161.6, 2.7, z + 1.7, Color3.fromRGB(40, 42, 48), Enum.Material.Fabric)
		for k, offset in ipairs({ Vector3.new(-0.6, 0, -0.8), Vector3.new(0.5, 0, 0), Vector3.new(-0.4, 0, 0.9) }) do
			ball(
				gear,
				"Football",
				Vector3.new(-163 + offset.X, 3.1 + (k == 2 and 0.15 or 0), z + offset.Z),
				1,
				FOOTBALL,
				Enum.Material.Leather
			)
		end
		if i == 1 then
			BuildUtil.Look(
				bin,
				"Ball Bin",
				"Brand-new footballs are slippery! The equipment crew brushes and breaks in dozens of balls before every game.",
				{ Distance = 8 }
			)
		end
	end

	-- Step 3: washers + dryers, folding table, laundry carts, travel trunks --------------------
	BuildUtil.Stage(ctx, 3)
	local laundry = BuildUtil.Child(ctx, "Laundry")
	for i, mx in ipairs({ -194, -186.5, -179, -171.5 }) do
		local dryer = i > 2
		local body = dryer and Color3.fromRGB(190, 196, 204) or Color3.fromRGB(228, 230, 234)
		box(laundry, dryer and "Dryer" or "Washer", mx - 3, FLOOR_TOP, 353.6, mx + 3, 6.8, LINE_Z, body, Enum.Material.Metal)
		local door =
			cyl(laundry, "MachineDoor", Vector3.new(mx, 3.7, 353.45), 0.3, 3.4, "Z", Color3.fromRGB(60, 72, 86), Enum.Material.Glass, {
				Reflectance = 0.2,
			})
		if i == 1 then
			BuildUtil.Look(
				door,
				"Industrial Washer",
				"This giant washer cleans a whole team's muddy uniforms in one go. Grass stains don't stand a chance!",
				{ Distance = 8 }
			)
		elseif i == 3 then
			BuildUtil.Look(door, "Tumble Dryer", "Jerseys, towels and socks tumble dry in here. Somehow one sock always goes missing...", {
				Distance = 8,
			})
		end
	end
	local laundrySign = box(laundry, "LaundrySign", -196, 8.2, LINE_Z - 0.2, -169.5, 10.2, LINE_Z, team.Primary)
	sign(laundrySign, Enum.NormalId.Front, "LAUNDRY", team.Primary, team, { InsetX = 0.2, InsetY = 0.14 })
	-- folding table with stacks of clean jerseys
	local tableTop = box(laundry, "FoldingTable", -163, 3, 349, -155, 3.3, 353, LIGHT_WOOD, Enum.Material.Wood)
	box(laundry, "FoldingTableBase", -162.5, FLOOR_TOP, 349.6, -155.5, 3, 352.4, DARK_METAL, Enum.Material.Metal)
	box(laundry, "JerseyStack", -162, 3.3, 350, -159.6, 4.1, 352, team.Primary, Enum.Material.Fabric)
	box(laundry, "JerseyStack", -158.4, 3.3, 350, -156, 3.9, 352, team.Trim, Enum.Material.Fabric)
	BuildUtil.Look(tableTop, "Folding Table", "Clean jerseys get folded here, numbers up, ready to go back into the lockers.", {
		Distance = 7,
	})
	-- laundry carts
	for i, cx in ipairs({ -186, -170 }) do
		box(laundry, "CartWheels", cx - 1.7, FLOOR_TOP, 342.8, cx + 1.7, 0.9, 345.2, DARK_METAL, Enum.Material.Metal)
		local cart =
			box(laundry, "LaundryCart", cx - 1.8, 0.9, 342.7, cx + 1.8, 3.5, 345.3, Color3.fromRGB(96, 104, 120), Enum.Material.Fabric)
		if i == 1 then
			BuildUtil.Look(
				cart,
				"Laundry Cart",
				"Full of sweaty practice gear. Hold your nose and push it to the washers!",
				{ Distance = 7 }
			)
		end
	end
	-- a rolling rack of clean game jerseys
	for _, pz in ipairs({ 300.2, 313.8 }) do
		box(laundry, "RackPost", -188.15, FLOOR_TOP, pz - 0.15, -187.85, 7.3, pz + 0.15, CHROME, Enum.Material.Metal)
	end
	cyl(laundry, "RackBar", Vector3.new(-188, 7.1, 307), 13.9, 0.25, "Z", CHROME, Enum.Material.Metal)
	local rackJersey
	for k, jz in ipairs({ 302, 304.5, 307, 309.5, 312 }) do
		local color = k % 2 == 1 and team.Primary or team.Trim
		local jersey = box(laundry, "HangingJersey", -188.15, 3.6, jz - 1.1, -187.85, 6.95, jz + 1.1, color, Enum.Material.Fabric)
		for _, face in ipairs({ Enum.NormalId.Left, Enum.NormalId.Right }) do
			sign(jersey, face, JERSEY_NUMBERS[k + 8], color, team, { InsetX = 0.18, InsetY = 0.25 })
		end
		if k == 3 then
			rackJersey = jersey
		end
	end
	if rackJersey then
		BuildUtil.Look(
			rackJersey,
			"Game Jerseys",
			"Every player has a home jersey, an away jersey and spares in case one rips during a big tackle.",
			{ Distance = 7 }
		)
	end
	-- travel trunks on wheels
	for i, tx in ipairs({ -164, -157 }) do
		box(laundry, "TrunkWheels", tx - 2.4, FLOOR_TOP, 336.6, tx + 2.4, 0.8, 339.4, DARK_METAL, Enum.Material.Metal)
		local trunk = box(laundry, "EquipmentTrunk", tx - 2.5, 0.8, 336.5, tx + 2.5, 3.4, 339.5, team.Primary, Enum.Material.SmoothPlastic)
		box(laundry, "TrunkLid", tx - 2.55, 3.4, 336.45, tx + 2.55, 3.8, 339.55, team.Secondary, Enum.Material.Metal)
		if i == 1 then
			sign(trunk, Enum.NormalId.Front, teamLabel(ctx), team.Primary, team, { InsetX = 0.1, Top = 0.15, Height = 0.55 })
			BuildUtil.Look(
				trunk,
				"Equipment Trunk",
				"For away games the crew packs every helmet, pad and ball into trunks like this and loads them onto the team plane.",
				{ Distance = 7 }
			)
		end
	end
end

---------------------------------------------------------------------------------------------
-- Weight Room X[-150, -100]
---------------------------------------------------------------------------------------------

function HQRoomsBack.hq_weightroom(ctx)
	local team = ctx.colors
	local name = teamLabel(ctx)
	local wall = Color3.fromRGB(66, 70, 80)
	local IX0, IX1 = -149.2, -100.8

	-- Step 1: rubber floor, glass front + sliding glass doors, team accent wall -----------------
	BuildUtil.Stage(ctx, 1)
	local room = BuildUtil.Child(ctx, "Room")
	local shell = roomShell(room, {
		X0 = -150,
		X1 = -100,
		InnerX0 = IX0,
		InnerX1 = IX1,
		Walls = { { -150, IX0 }, { IX1, -100 } },
		Openings = {
			{ From = -147, To = -136, Sill = 1.2, Mullions = 1 },
			{ From = -131, To = -123 },
			{ From = -112, To = -103, Sill = 1.2, Mullions = 1 },
		},
		WallColor = wall,
		WallMaterial = Enum.Material.Concrete,
		BackColor = team.Primary,
		FloorColor = Color3.fromRGB(34, 34, 38),
		FloorMaterial = Enum.Material.Rubber,
		Door = {
			Slide = true,
			Color = GLASS,
			Material = Enum.Material.Glass,
			Transparency = 0.45,
			Object = "Weight Room",
			Title = "Weight Room",
			Info = "Squat racks, bench presses and dumbbells. Lift weights here to get your team stronger!",
		},
		Lights = { { -125, 290 }, { -125, 308 }, { -125, 326 }, { -125, 344 } },
		LightBrightness = 1.6,
		LightColor = COOL_LIGHT,
	})
	sign(shell.Back, Enum.NormalId.Front, name .. " STRENGTH", team.Primary, team, { InsetX = 0.12, Top = 0.06, Height = 0.16 })
	for _, x in ipairs({ IX0, IX1 - 0.05 }) do
		box(room, "WallStripe", x, 8.6, CW_IN, x + 0.05, 8.9, LINE_Z, team.Secondary, Enum.Material.SmoothPlastic, PAINT)
	end
	-- team logo on the rubber floor, between the benches (reads upright from the door)
	cyl(room, "LogoRing", Vector3.new(-125, FLOOR_TOP + 0.02, 316), 0.04, 12, "Y", team.Secondary, Enum.Material.SmoothPlastic, PAINT)
	cyl(room, "LogoDisc", Vector3.new(-125, FLOOR_TOP + 0.05, 316), 0.06, 10.4, "Y", team.Primary, Enum.Material.SmoothPlastic, PAINT)
	local logoText = BuildUtil.Part(room, {
		Name = "LogoName",
		Size = Vector3.new(8.6, 0.02, 3.4),
		CFrame = CFrame.new(-125, FLOOR_TOP + 0.1, 316) * CFrame.Angles(0, math.pi, 0),
		Transparency = 1,
		CanCollide = false,
		CastShadow = false,
	})
	sign(logoText, Enum.NormalId.Top, name, team.Primary, team, { InsetX = 0.02, InsetY = 0.05, PixelsPerStud = 14 })
	-- a strip of turf for sprints and sled pushes, east of the door along the front windows
	box(room, "TurfLane", -120, FLOOR_TOP, 281, -108, FLOOR_TOP + 0.04, 309, Color3.fromRGB(64, 140, 60), Enum.Material.Grass, PAINT)
	for _, lz in ipairs({ 284, 291, 298, 305 }) do
		box(room, "TurfLine", -120, FLOOR_TOP + 0.04, lz - 0.2, -108, FLOOR_TOP + 0.06, lz + 0.2, WHITE, Enum.Material.SmoothPlastic, PAINT)
	end

	-- Step 2: three squat racks on lifting platforms + a stack of spare plates -----------------
	BuildUtil.Stage(ctx, 2)
	local racks = BuildUtil.Child(ctx, "SquatRacks")
	local rackZ = 349
	for i, rx in ipairs({ -139, -125, -111 }) do
		box(
			racks,
			"Platform",
			rx - 4,
			FLOOR_TOP,
			rackZ - 4,
			rx + 4,
			FLOOR_TOP + 0.06,
			rackZ + 4,
			LIGHT_WOOD,
			Enum.Material.WoodPlanks,
			PAINT
		)
		for _, sx in ipairs({ -3, 3 }) do
			for _, sz in ipairs({ -2, 2 }) do
				box(
					racks,
					"RackPost",
					rx + sx - 0.25,
					FLOOR_TOP,
					rackZ + sz - 0.25,
					rx + sx + 0.25,
					9,
					rackZ + sz + 0.25,
					IRON,
					Enum.Material.Metal
				)
			end
			box(racks, "RackTop", rx + sx - 0.25, 9, rackZ - 2.25, rx + sx + 0.25, 9.4, rackZ + 2.25, team.Primary, Enum.Material.Metal)
		end
		local barY, barZ = 4.6, rackZ - 1.6
		local bar = cyl(racks, "Barbell", Vector3.new(rx, barY, barZ), 9, 0.3, "X", CHROME, Enum.Material.Metal)
		for _, s in ipairs({ -1, 1 }) do
			cyl(racks, "BumperPlate", Vector3.new(rx + s * 3.65, barY, barZ), 0.5, 2.7, "X", team.Primary, Enum.Material.Rubber)
			cyl(racks, "BumperPlate", Vector3.new(rx + s * 4.1, barY, barZ), 0.4, 2.1, "X", team.Secondary, Enum.Material.Rubber)
		end
		BuildUtil.Use(ctx, bar, "lift", {
			Action = "Lift weights",
			Object = "Squat Rack " .. i,
			Title = "Squat Rack",
			Info = "Squats build the leg power linemen need to push the pile. Lift to make your team stronger!",
			Distance = 8,
		})
	end
	cyl(racks, "PlateTreeBase", Vector3.new(-104, FLOOR_TOP + 0.2, 336), 0.4, 3.4, "Y", IRON, Enum.Material.Metal)
	cyl(racks, "PlateTreePost", Vector3.new(-104, FLOOR_TOP + 2.9, 336), 5, 0.4, "Y", CHROME, Enum.Material.Metal)
	local plates = {}
	for k, d in ipairs({ 3.2, 2.8, 2.4 }) do
		local color = k == 2 and team.Secondary or team.Primary
		plates[k] =
			cyl(racks, "SparePlate", Vector3.new(-104, FLOOR_TOP + 0.4 + (k - 0.5) * 0.55, 336), 0.5, d, "Y", color, Enum.Material.Rubber)
	end
	BuildUtil.Look(
		plates[3],
		"Plate Stack",
		"Spare bumper plates in team colours, heaviest at the bottom. Load up the bar!",
		{ Distance = 7 }
	)

	-- Step 3: bench presses, dumbbell rack, kettlebells, plyo boxes ----------------------------
	BuildUtil.Stage(ctx, 3)
	local benches = BuildUtil.Child(ctx, "BenchesDumbbells")
	for i, bx in ipairs({ -137, -113 }) do
		local bz = 322
		box(benches, "BenchBase", bx - 0.45, FLOOR_TOP, bz - 2.2, bx + 0.45, 1.72, bz + 2.2, IRON, Enum.Material.Metal)
		box(benches, "BenchPad", bx - 0.75, 1.72, bz - 2.7, bx + 0.75, 2.22, bz + 2.7, team.Primary, Enum.Material.Leather)
		local headZ = bz + 3.2
		local barY = 3.9
		for _, s in ipairs({ -1, 1 }) do
			box(
				benches,
				"BenchUpright",
				bx + s * 1.7 - 0.2,
				FLOOR_TOP,
				headZ - 0.2,
				bx + s * 1.7 + 0.2,
				barY - 0.15,
				headZ + 0.2,
				IRON,
				Enum.Material.Metal
			)
			cyl(benches, "BenchPlate", Vector3.new(bx + s * 2.9, barY, headZ), 0.5, 2.1, "X", team.Secondary, Enum.Material.Rubber)
		end
		local bar = cyl(benches, "Barbell", Vector3.new(bx, barY, headZ), 7.5, 0.3, "X", CHROME, Enum.Material.Metal)
		BuildUtil.Use(ctx, bar, "lift", {
			Action = "Lift weights",
			Object = "Bench Press " .. i,
			Title = "Bench Press",
			Info = "Push the bar up, nice and steady. A strong bench press helps players shove blockers out of the way!",
			Distance = 8,
		})
	end
	-- dumbbell rack along the west wall
	local rack = box(benches, "DumbbellRack", IX0, FLOOR_TOP, 296, IX0 + 2.6, 2.6, 316, DARK_METAL, Enum.Material.Metal)
	for k, z in ipairs({ 298, 302, 306, 310, 314 }) do
		local d = 0.9 + k * 0.08
		for _, hx in ipairs({ -148.55, -147.15 }) do
			cyl(benches, "DumbbellHead", Vector3.new(hx, 2.6 + d / 2, z), 0.5, d, "X", IRON, Enum.Material.Metal)
		end
		cyl(benches, "DumbbellGrip", Vector3.new(-147.85, 2.6 + d / 2, z), 1, 0.3, "X", CHROME, Enum.Material.Metal)
	end
	BuildUtil.Look(
		rack,
		"Dumbbell Rack",
		"From light to super heavy. Rule number one of the weight room: put them back where you found them!",
		{
			Distance = 8,
		}
	)
	for k = 1, 3 do
		ball(benches, "Kettlebell", Vector3.new(-147.6, FLOOR_TOP + 0.7, 318.5 + k * 2), 1.4, team.Secondary, Enum.Material.Metal)
	end
	box(benches, "PlyoBox", -105.5, FLOOR_TOP, 298.5, -102.5, FLOOR_TOP + 2, 301.5, LIGHT_WOOD, Enum.Material.Wood)
	local plyo = box(benches, "PlyoBox", -105.5, FLOOR_TOP, 303, -102.5, FLOOR_TOP + 3, 306, LIGHT_WOOD, Enum.Material.Wood)
	BuildUtil.Look(plyo, "Plyo Boxes", "Jump up! Explosive box jumps make players quicker off the line.", { Distance = 7 })
	-- a push sled loaded with team plates, at the far end of the turf lane
	local sledX, sledZ = -114, 302.5
	box(benches, "SledSkid", sledX - 1.6, FLOOR_TOP, sledZ - 2, sledX + 1.6, FLOOR_TOP + 0.4, sledZ + 2, IRON, Enum.Material.Metal)
	local sledPost = cyl(benches, "SledPost", Vector3.new(sledX, FLOOR_TOP + 1.4, sledZ + 0.6), 2, 0.5, "Y", CHROME, Enum.Material.Metal)
	for k, color in ipairs({ team.Primary, team.Secondary }) do
		local plateY = FLOOR_TOP + 0.4 + (k - 0.5) * 0.5
		cyl(benches, "SledPlate", Vector3.new(sledX, plateY, sledZ + 0.6), 0.5, 2.6 - 0.4 * k, "Y", color, Enum.Material.Rubber)
	end
	for _, s in ipairs({ -1, 1 }) do
		local hx = sledX + s * 1.2
		box(
			benches,
			"SledHandle",
			hx - 0.15,
			FLOOR_TOP + 0.4,
			sledZ - 1.9,
			hx + 0.15,
			FLOOR_TOP + 3.3,
			sledZ - 1.6,
			IRON,
			Enum.Material.Metal
		)
	end
	box(
		benches,
		"SledBar",
		sledX - 1.4,
		FLOOR_TOP + 3.3,
		sledZ - 1.9,
		sledX + 1.4,
		FLOOR_TOP + 3.6,
		sledZ - 1.6,
		team.Primary,
		Enum.Material.Metal
	)
	BuildUtil.Look(
		sledPost,
		"Push Sled",
		"Lean in and drive it down the turf! Sled pushes build the leg power linemen need to move the pile.",
		{ Distance = 8 }
	)
	-- battle ropes tied to an anchor in front of the mirror wall
	local anchor = box(benches, "RopeAnchor", IX1 - 1.3, FLOOR_TOP, 319, IX1 - 0.3, FLOOR_TOP + 1.2, 321, IRON, Enum.Material.Metal)
	for _, rz in ipairs({ 319.5, 320.5 }) do
		cyl(
			benches,
			"BattleRope",
			Vector3.new(IX1 - 4.55, FLOOR_TOP + 0.2, rz),
			6.5,
			0.4,
			"X",
			Color3.fromRGB(40, 40, 44),
			Enum.Material.Fabric,
			{
				CanCollide = false,
			}
		)
	end
	BuildUtil.Look(
		anchor,
		"Battle Ropes",
		"Grab both ends and make waves as fast as you can. Thirty seconds of this and your arms feel like spaghetti!",
		{ Distance = 8 }
	)

	-- Step 4: mirror wall, motivational banners, live team rating, record board ----------------
	BuildUtil.Stage(ctx, 4)
	local decor = BuildUtil.Child(ctx, "MirrorsBanners")
	local mirror = box(decor, "Mirror", IX1 - 0.3, 1.2, 288, IX1, 8.4, 336, Color3.fromRGB(214, 224, 232), Enum.Material.Glass, {
		Reflectance = 0.6,
	})
	BuildUtil.Look(mirror, "Mirror Wall", "Lifters watch their form in the mirror... and maybe flex a little when nobody is looking.", {
		Distance = 8,
	})
	box(decor, "Mirror", IX0, 2.8, 296.5, IX0 + 0.3, 8.2, 315.5, Color3.fromRGB(214, 224, 232), Enum.Material.Glass, { Reflectance = 0.6 })
	local banners = {
		{
			box = { IX0, 8.6, 298, IX0 + 0.2, 11.8, 314 },
			face = Enum.NormalId.Right,
			text = "NO DAYS OFF",
			info = "The weight-room motto: champions train even when nobody is watching.",
		},
		{
			box = { IX1 - 0.2, 8.8, 300, IX1, 11.8, 324 },
			face = Enum.NormalId.Left,
			text = "OUTWORK EVERYONE",
			info = "Talent wins games, but hard work wins championships.",
		},
		{
			box = { -140, 9.5, CW_IN, -114, 11.8, CW_IN + 0.2 },
			face = Enum.NormalId.Back,
			text = "EARN IT",
			info = "Nothing is given. Every rep, every sprint and every snap is earned.",
		},
	}
	for i, b in ipairs(banners) do
		local color = i == 2 and team.Secondary or team.Primary
		local p = b.box
		local banner = box(decor, "Banner", p[1], p[2], p[3], p[4], p[5], p[6], color, Enum.Material.Fabric)
		sign(banner, b.face, b.text, color, team, { InsetX = 0.05, InsetY = 0.14 })
		BuildUtil.Look(banner, "Banner: " .. b.text, b.info, { Distance = 10 })
	end
	-- live TEAM RATING board by the door
	box(decor, "RatingFrame", IX0, 3.4, 281, IX0 + 0.3, 9.6, 294, team.Primary)
	local rating = box(decor, "RatingBoard", IX0 + 0.3, 3.8, 281.4, IX0 + 0.45, 9.2, 293.6, LED_DARK)
	liveScreen(rating, Enum.NormalId.Right, "rating", "TEAM RATING", {
		PixelsPerStud = 20,
		TextColor3 = LED_GREEN,
		Font = Enum.Font.GothamBlack,
		Header = "STRENGTH METER",
		HeaderShare = 0.25,
		HeaderBackground = team.Primary,
		Padding = 0.08,
	})
	BuildUtil.Look(
		rating,
		"Team Rating",
		"Your team's overall strength. With the Weight Room finished you can train your weakest starter to raise it!",
		{ LookKey = "rating", Distance = 8 }
	)
	-- weight-room records (fictional legends)
	local records = box(decor, "RecordBoard", -122, 3, CW_IN, -113, 8.6, CW_IN + 0.25, Color3.fromRGB(30, 32, 38))
	local gui = canvas(records, Enum.NormalId.Back, 20, nil, 0.4)
	guiFrame(gui, 0, 0, 9, 1.2, team.Primary)
	guiText(gui, 0.3, 0.15, 8.4, 0.9, "WEIGHT ROOM RECORDS", textColorOn(team.Primary, team), Enum.Font.GothamBlack)
	local lines = {
		{ "SQUAT", "655", "T. 'TANK' IRONWOOD" },
		{ "BENCH", "475", "D. 'DOZER' BOULDERS" },
		{ "DEADLIFT", "700", "M. 'MOOSE' MAPLEWOOD" },
		{ "BOX JUMP", "64 IN", "J. 'HOPS' HOPPERTON" },
	}
	for i, line in ipairs(lines) do
		local y = 1.5 + (i - 1) * 1
		guiText(gui, 0.3, y, 2.5, 0.7, line[1], LED_TEXT, Enum.Font.GothamBlack, Enum.TextXAlignment.Left)
		guiText(gui, 2.9, y, 1.6, 0.7, line[2], WHITE, Enum.Font.GothamBlack, Enum.TextXAlignment.Left)
		guiText(gui, 4.5, y, 4.3, 0.7, line[3], WHITE, Enum.Font.GothamBold, Enum.TextXAlignment.Left)
	end
	BuildUtil.Look(records, "Record Board", "The strongest lifts in team history. Legend says 'Tank' Ironwood once squatted a golf cart!", {
		Distance = 8,
	})
end

---------------------------------------------------------------------------------------------
-- Training Room X[-100, -50]
---------------------------------------------------------------------------------------------

function HQRoomsBack.hq_trainingroom(ctx)
	local team = ctx.colors
	local C = ctx.config.Colors
	local wall = Color3.fromRGB(236, 238, 240)
	local IX0, IX1 = -99.2, -50.8
	local frosted = Color3.fromRGB(226, 238, 244)

	-- Step 1: white clinic, tiled floor, frosted windows, red cross signs ----------------------
	BuildUtil.Stage(ctx, 1)
	local room = BuildUtil.Child(ctx, "Room")
	roomShell(room, {
		X0 = -100,
		X1 = -50,
		InnerX0 = IX0,
		InnerX1 = IX1,
		Walls = { { -100, IX0 }, { IX1, -50 } },
		Openings = {
			{ From = -96, To = -85, Sill = 3.2, Mullions = 1, GlassColor = frosted, Transparency = 0.3 },
			{ From = -81, To = -73 },
			{ From = -62, To = -53, Sill = 3.2, Mullions = 1, GlassColor = frosted, Transparency = 0.3 },
		},
		WallColor = wall,
		BackColor = Color3.fromRGB(196, 228, 230),
		FloorColor = Color3.fromRGB(204, 216, 224),
		FloorMaterial = Enum.Material.CeramicTiles,
		CeilingColor = WHITE,
		Door = {
			Color = WHITE,
			Material = Enum.Material.SmoothPlastic,
			Window = true,
			Object = "Training Room",
			Title = "Training Room",
			Info = "The team's sports clinic. Trainers tape ankles, treat sore muscles and keep everyone healthy.",
		},
		Lights = { { -75, 290 }, { -75, 308 }, { -75, 326 }, { -75, 344 } },
		LightBrightness = 1.6,
		LightColor = COOL_LIGHT,
	})
	-- red cross by the door (corridor side) and a big one on the back wall
	box(room, "CrossPlate", -84.7, 5, CW_OUT - 0.25, -81.9, 7.8, CW_OUT, WHITE)
	box(room, "Cross", -83.75, 5.3, CW_OUT - 0.35, -82.85, 7.5, CW_OUT - 0.25, CROSS_RED, Enum.Material.Neon)
	box(room, "Cross", -84.4, 5.95, CW_OUT - 0.36, -82.2, 6.85, CW_OUT - 0.25, CROSS_RED, Enum.Material.Neon)
	local bigCross = box(room, "CrossPlate", -77.5, 6.5, LINE_Z - 0.25, -72.5, 11.5, LINE_Z, WHITE)
	box(room, "Cross", -75.75, 7, LINE_Z - 0.35, -74.25, 11, LINE_Z - 0.25, CROSS_RED, Enum.Material.Neon)
	box(room, "Cross", -77, 8.25, LINE_Z - 0.36, -73, 9.75, LINE_Z - 0.25, CROSS_RED, Enum.Material.Neon)
	BuildUtil.Look(bigCross, "Training Room", "Hurt? Sore? Tired? The trainers here patch players up so they're ready for game day.", {
		Distance = 10,
	})

	-- Step 2: treatment tables with curtains, taping station, first aid, player status ---------
	BuildUtil.Stage(ctx, 2)
	local treatment = BuildUtil.Child(ctx, "TreatmentTables")
	local tableX = -93
	for i, z in ipairs({ 298, 307, 316, 325 }) do
		box(treatment, "TableBase", tableX - 2.5, FLOOR_TOP, z - 0.9, tableX + 2.5, 2.5, z + 0.9, CHROME, Enum.Material.Metal)
		BuildUtil.Seat(treatment, {
			Name = "TreatmentTable",
			Size = Vector3.new(7, 0.6, 2.8),
			CFrame = CFrame.new(tableX, 2.8, z),
			Color = team.Primary,
			Material = Enum.Material.Leather,
			Object = "Treatment Table",
			NoPrompt = i % 2 == 0,
		})
		box(treatment, "Pillow", tableX - 3.3, 3.1, z - 1, tableX - 1.5, 3.5, z + 1, WHITE, Enum.Material.Fabric)
		if i < 4 then
			local cz = z + 4.5
			box(
				treatment,
				"Curtain",
				IX0 + 0.4,
				1.4,
				cz - 0.08,
				tableX + 3.5,
				8.6,
				cz + 0.08,
				Color3.fromRGB(150, 200, 196),
				Enum.Material.Fabric,
				{
					CanCollide = false,
					Transparency = 0.1,
				}
			)
			box(treatment, "CurtainTrack", IX0, 8.6, cz - 0.12, tableX + 3.6, 8.85, cz + 0.12, CHROME, Enum.Material.Metal, NO_COLLIDE)
		end
	end
	-- taping station by the door: a padded bench and a tape cart
	local taping = box(treatment, "TapingBench", -66, FLOOR_TOP, 284.8, -60, 3.6, 287.2, team.Primary, Enum.Material.Leather)
	box(treatment, "TapeCart", -58, FLOOR_TOP, 285, -56, 3.2, 287, WHITE)
	for _, tz in ipairs({ 285.6, 286.4 }) do
		cyl(treatment, "TapeRoll", Vector3.new(-57, 3.45, tz), 0.5, 0.7, "Y", WHITE, Enum.Material.Fabric)
	end
	BuildUtil.Look(
		taping,
		"Taping Station",
		"Before every practice the trainers tape ankles and wrists right here. A team can use miles of tape in one season!",
		{ Distance = 8 }
	)
	-- first-aid cabinet on the west wall
	local cabinet = box(treatment, "FirstAidCabinet", IX0, 3, 329.5, IX0 + 1.2, 8, 333.5, WHITE)
	box(treatment, "CabinetCross", IX0 + 1.2, 4.6, 331.2, IX0 + 1.3, 6.4, 331.8, CROSS_RED)
	box(treatment, "CabinetCross", IX0 + 1.2, 5.2, 330.6, IX0 + 1.29, 5.8, 332.4, CROSS_RED)
	BuildUtil.Look(cabinet, "First-Aid Cabinet", "Bandages, ice packs, braces and everything else the trainers need. Safety first!", {
		Distance = 7,
	})
	-- X-ray light box over the first table
	local xray = box(treatment, "XRayLightBox", IX0, 5, 296, IX0 + 0.25, 8.6, 300, Color3.fromRGB(210, 230, 245), Enum.Material.Neon)
	local xrayGui = canvas(xray, Enum.NormalId.Right, 20, Color3.fromRGB(20, 28, 40), 0)
	guiFrame(xrayGui, 1.75, 0.3, 0.5, 1.4, Color3.fromRGB(220, 230, 240))
	guiDot(xrayGui, 2, 1.8, 0.8, Color3.fromRGB(220, 230, 240))
	guiFrame(xrayGui, 1.78, 2.1, 0.45, 1.3, Color3.fromRGB(220, 230, 240))
	BuildUtil.Look(
		xray,
		"X-Ray Light Box",
		"Team doctors check X-rays here to make sure bones are healthy. This one shows a perfectly fine knee. Phew!",
		{
			Distance = 8,
		}
	)
	-- live player status board (west wall, by the door)
	box(treatment, "StatusFrame", IX0, 3.2, 281.5, IX0 + 0.25, 9.6, 293.5, team.Primary)
	local status = box(treatment, "StatusBoard", IX0 + 0.25, 3.6, 281.9, IX0 + 0.4, 9.2, 293.1, LED_DARK)
	liveScreen(status, Enum.NormalId.Right, "roster", "ALL CLEAR", {
		PixelsPerStud = 20,
		TextColor3 = WHITE,
		Header = "PLAYER STATUS: ALL CLEAR",
		HeaderShare = 0.18,
		HeaderColor = INK,
		HeaderBackground = LED_GREEN,
		Padding = 0.05,
	})
	BuildUtil.Look(
		status,
		"Player Status Board",
		"The trainers' health check for every starter. Green means cleared to play!",
		{ Distance = 8 }
	)

	-- Step 3: cold tub, hot tub, ice machine, drinks cooler -----------------------------------
	BuildUtil.Stage(ctx, 3)
	local tubs = BuildUtil.Child(ctx, "Tubs")
	local tubX = -57
	local rimTop = FLOOR_TOP + 2.8
	local tubSpecs = {
		{
			z = 300,
			rim = CHROME,
			rimMaterial = Enum.Material.Metal,
			water = WATER,
			label = "COLD TUB",
			labelColor = Color3.fromRGB(40, 110, 200),
			title = "Cold Tub",
			info = "Brrr! The water is about 50 degrees. Players jump in after games to help sore muscles recover faster.",
		},
		{
			z = 314,
			rim = C.Wood,
			rimMaterial = Enum.Material.WoodPlanks,
			water = HOT_WATER,
			label = "HOT TUB",
			labelColor = CROSS_RED,
			title = "Hot Tub",
			info = "Warm, bubbly water that loosens up tight muscles before practice. Ahhh...",
		},
	}
	for i, spec in ipairs(tubSpecs) do
		local rim = cyl(tubs, "TubRim", Vector3.new(tubX, FLOOR_TOP + 1.4, spec.z), 2.8, 7, "Y", spec.rim, spec.rimMaterial)
		cyl(tubs, "TubWater", Vector3.new(tubX, rimTop + 0.06, spec.z), 0.12, 6.2, "Y", spec.water, Enum.Material.Glass, {
			Transparency = 0.25,
			CanCollide = false,
			CastShadow = false,
		})
		box(
			tubs,
			"TubStep",
			tubX - 5.9,
			FLOOR_TOP,
			spec.z - 1.5,
			tubX - 3.5,
			FLOOR_TOP + 1.4,
			spec.z + 1.5,
			CHROME,
			Enum.Material.DiamondPlate
		)
		local label = box(tubs, "TubSign", IX1 - 0.2, 5.6, spec.z - 3, IX1, 7.2, spec.z + 3, spec.labelColor)
		sign(label, Enum.NormalId.Left, spec.label, spec.labelColor, team, { TextColor3 = WHITE, InsetX = 0.08, InsetY = 0.15 })
		BuildUtil.Look(rim, spec.title, spec.info, { Distance = 8 })
		if i == 1 then
			for k, offset in ipairs({ Vector3.new(-1.3, 0, -1), Vector3.new(1, 0, 1.2), Vector3.new(1.4, 0, -1.4) }) do
				BuildUtil.Part(tubs, {
					Name = "IceCube",
					Size = Vector3.new(0.8, 0.8, 0.8),
					CFrame = CFrame.new(tubX + offset.X, rimTop + 0.3, spec.z + offset.Z)
						* CFrame.Angles(0, math.rad(25 * k), math.rad(10)),
					Color = ICE_BLUE,
					Material = Enum.Material.Ice,
					Transparency = 0.2,
					CanCollide = false,
				})
			end
		else
			for k, offset in ipairs({ Vector3.new(-0.5, 1.3, -0.5), Vector3.new(0.9, 2.4, 0.7) }) do
				ball(tubs, "Steam", Vector3.new(tubX + offset.X, rimTop + offset.Y, spec.z + offset.Z), 1.8 - 0.4 * k, WHITE, nil, {
					Transparency = 0.6,
					CanCollide = false,
					CastShadow = false,
				})
			end
		end
	end
	local ice = box(tubs, "IceMachine", IX1 - 3.4, FLOOR_TOP, 323, IX1, 6, 327, CHROME, Enum.Material.Metal)
	sign(
		ice,
		Enum.NormalId.Left,
		"ICE",
		CHROME,
		team,
		{ TextColor3 = Color3.fromRGB(40, 110, 200), InsetX = 0.2, Top = 0.12, Height = 0.25 }
	)
	BuildUtil.Look(
		ice,
		"Ice Machine",
		"Makes a mountain of ice every day for ice packs, the cold tub and ice-cold drinks.",
		{ Distance = 7 }
	)
	local fridge = box(tubs, "DrinksCooler", IX1 - 3.4, FLOOR_TOP, 328.5, IX1, 7, 333, team.Primary)
	box(tubs, "CoolerGlass", IX1 - 3.55, 1, 328.9, IX1 - 3.4, 6.6, 332.6, GLASS, Enum.Material.Glass, { Transparency = 0.5 })
	local bottles = box(tubs, "CoolerBottles", IX1 - 3, 1.2, 329.1, IX1 - 2.4, 6.4, 332.4, Color3.fromRGB(230, 232, 236))
	local bottleGui = canvas(bottles, Enum.NormalId.Left, 20, nil, 0.3)
	local drinkColors =
		{ Color3.fromRGB(255, 150, 30), Color3.fromRGB(80, 200, 255), Color3.fromRGB(150, 230, 60), Color3.fromRGB(240, 60, 90) }
	for row = 0, 2 do
		for col = 0, 5 do
			guiFrame(bottleGui, 0.2 + col * 0.52, 0.4 + row * 1.7, 0.36, 1.2, drinkColors[(row + col) % 4 + 1])
		end
	end
	BuildUtil.Use(ctx, fridge, "sportsdrink", {
		Object = "Drinks Cooler",
		Title = "Recovery Drinks",
		Info = "After a cold tub or a long rehab session, players refuel with a sports drink from this cooler.",
		Distance = 8,
	})

	-- Step 4: rehab gear --------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 4)
	local rehab = BuildUtil.Child(ctx, "Rehab")
	-- exercise bike (you can sit on it)
	local bikeX, bikeZ = -93, 345
	box(rehab, "BikeFrame", bikeX - 0.5, FLOOR_TOP, bikeZ - 1.8, bikeX + 0.5, 2.3, bikeZ + 1.8, DARK_METAL, Enum.Material.Metal)
	cyl(rehab, "BikeFlywheel", Vector3.new(bikeX, 1.5, bikeZ - 1.4), 0.6, 2.2, "X", team.Primary, Enum.Material.Metal)
	box(rehab, "BikeHandles", bikeX - 0.9, 2.3, bikeZ - 2.1, bikeX + 0.9, 4.6, bikeZ - 1.75, DARK_METAL, Enum.Material.Metal)
	box(rehab, "BikeSeatPost", bikeX - 0.2, 2.3, bikeZ + 1, bikeX + 0.2, 3.45, bikeZ + 1.4, DARK_METAL, Enum.Material.Metal)
	BuildUtil.Seat(rehab, {
		Name = "BikeSeat",
		Size = Vector3.new(1.3, 0.5, 1.5),
		CFrame = CFrame.new(bikeX, 3.7, bikeZ + 1.2),
		Color = LEATHER_BLACK,
		Material = Enum.Material.Leather,
		Object = "Exercise Bike",
	})
	-- treadmill
	local mill = box(rehab, "TreadmillDeck", -85.5, FLOOR_TOP, 342, -82.5, 0.92, 348, LEATHER_BLACK, Enum.Material.Rubber)
	box(rehab, "TreadmillConsole", -85.5, 0.92, 341.6, -82.5, 4.5, 342, DARK_METAL, Enum.Material.Metal)
	BuildUtil.Look(
		mill,
		"Treadmill",
		"Injured players jog here first. When they can run fast without pain, they're cleared for the field!",
		{
			Distance = 8,
		}
	)
	-- foam rollers on a mat
	box(rehab, "StretchMat", -78, FLOOR_TOP, 340, -70, FLOOR_TOP + 0.08, 346, team.Secondary, Enum.Material.Fabric, PAINT)
	local roller = cyl(rehab, "FoamRoller", Vector3.new(-75.5, FLOOR_TOP + 0.58, 342), 3, 1, "X", team.Primary, Enum.Material.Foil)
	cyl(rehab, "FoamRoller", Vector3.new(-72.5, FLOOR_TOP + 0.58, 344), 3, 1, "X", WHITE, Enum.Material.Foil)
	BuildUtil.Look(roller, "Foam Rollers", "Rolling on these squishy tubes loosens tight muscles. It tickles and hurts at the same time!", {
		Distance = 7,
	})
	-- exercise balls
	local exerciseBall = ball(rehab, "ExerciseBall", Vector3.new(-75, FLOOR_TOP + 1.3, 351.5), 2.6, team.Primary, Enum.Material.Rubber)
	ball(rehab, "ExerciseBall", Vector3.new(-71.5, FLOOR_TOP + 1.3, 353), 2.6, team.Secondary, Enum.Material.Rubber)
	-- underwater treadmill: a raised glass-sided tank of warm water
	local tank = box(rehab, "TreadmillTank", -65, FLOOR_TOP, 337.5, -53, 3.2, 349.5, WHITE, Enum.Material.SmoothPlastic)
	box(rehab, "TankWindow", -63, 0.9, 337.4, -55, 2.8, 337.5, WATER, Enum.Material.Glass, { Transparency = 0.3 })
	box(
		rehab,
		"TankWater",
		-64.5,
		3.2,
		338,
		-53.5,
		3.3,
		349,
		HOT_WATER,
		Enum.Material.Glass,
		{ Transparency = 0.3, CanCollide = false, CastShadow = false }
	)
	box(rehab, "TankBelt", -60.5, 3.3, 340, -57.5, 3.34, 347, LEATHER_BLACK, Enum.Material.Rubber, PAINT)
	BuildUtil.Look(
		tank,
		"Underwater Treadmill",
		"Jogging in warm water takes the weight off sore legs, so injured players can start running again sooner. Splash!",
		{ At = Vector3.new(0, 0.8, -5), Distance = 8 } -- by the window at the front of the tank
	)
	BuildUtil.Look(
		exerciseBall,
		"Exercise Ball",
		"Great for balance and core training. Also great for bouncing when the trainers aren't looking.",
		{
			Distance = 7,
		}
	)
	-- resistance band board on the back wall
	local bandBoard = box(rehab, "BandBoard", -63, 4.5, LINE_Z - 0.25, -55, 8.5, LINE_Z, Color3.fromRGB(180, 184, 190))
	for k, bx in ipairs({ -61, -59, -57 }) do
		local color = ({ Color3.fromRGB(250, 210, 60), Color3.fromRGB(230, 60, 60), Color3.fromRGB(50, 120, 220) })[k]
		box(rehab, "ResistanceBand", bx - 0.15, 4.9, LINE_Z - 0.35, bx + 0.15, 8.1, LINE_Z - 0.25, color, Enum.Material.Rubber, NO_COLLIDE)
	end
	BuildUtil.Look(bandBoard, "Resistance Bands", "Stretchy bands for rehab exercises. The darker the colour, the harder the pull!", {
		Distance = 8,
	})
end

---------------------------------------------------------------------------------------------
-- Film Room X[-50, 0]
---------------------------------------------------------------------------------------------

-- Theatre rows: the screen hangs on the back wall (+Z), the rows rise toward the corridor.
-- front = edge toward the screen, back = edge toward the corridor, top = walking surface.
local FILM_ROWS = {
	{ front = 338.5, back = 333, top = FLOOR_TOP },
	{ front = 333, back = 327.5, top = FLOOR_TOP + 1 },
	{ front = 327.5, back = 322, top = FLOOR_TOP + 2 },
	{ front = 322, back = 316.5, top = FLOOR_TOP + 3 },
	{ front = 316.5, back = 311, top = FLOOR_TOP + 4 },
	{ front = 311, back = 300, top = FLOOR_TOP + 5, seatBack = 305.5 }, -- with the cross-aisle behind
}
local FILM_SEAT_X = { -39, -35, -31, -27, -23, -19, -15, -11 }

function HQRoomsBack.hq_filmroom(ctx)
	local team = ctx.colors
	local name = teamLabel(ctx)
	local wall = Color3.fromRGB(46, 48, 56)
	local step = Color3.fromRGB(36, 38, 46)
	local IX0, IX1 = -49.2, -0.8
	local SX0, SX1 = -31, -23 -- the staircase from the lobby, in line with the door
	local screenTarget = Vector3.new(-25, 6.8, 357.5)

	-- Step 1: dark walls, staircase + six tiers with lit edges, glass rails --------------------
	BuildUtil.Stage(ctx, 1)
	local room = BuildUtil.Child(ctx, "Room")
	roomShell(room, {
		X0 = -50,
		X1 = 0,
		InnerX0 = IX0,
		InnerX1 = IX1,
		Walls = { { -50, IX0 }, { IX1, 0 } },
		Openings = { { From = SX0, To = SX1 } },
		WallColor = wall,
		WallMaterial = Enum.Material.Fabric,
		BackColor = Color3.fromRGB(26, 26, 32),
		FloorColor = shade(team.Primary, 0.4),
		FloorMaterial = Enum.Material.Carpet,
		CeilingColor = Color3.fromRGB(30, 32, 38),
		Door = {
			Color = Color3.fromRGB(44, 44, 50),
			Material = Enum.Material.Leather,
			Object = "Film Room",
			Title = "Film Room",
			Info = "The team's private movie theatre. Coaches and players study game film here every week.",
		},
		DoorSign = "QUIET - FILM IN PROGRESS",
		Lights = { { -25, 286 }, { -25, 318 }, { -25, 348 } },
		LightSize = { 6, 3 }, -- small dim downlights, so they don't glare into the screen
		LightBrightness = 1,
		LightRange = 24,
		LampColor = Color3.fromRGB(150, 130, 100),
	})
	local tiers = BuildUtil.Child(ctx, "Tiers")
	for k = 2, #FILM_ROWS do
		local row = FILM_ROWS[k]
		local tier = box(tiers, "Tier" .. k, IX0, SHELL_FLOOR, row.back, IX1, row.top, row.front, step, Enum.Material.Carpet)
		box(
			tiers,
			"StepLight",
			IX0,
			row.top,
			row.front - 0.3,
			IX1,
			row.top + 0.04,
			row.front,
			Color3.fromRGB(255, 214, 90),
			Enum.Material.Neon,
			PAINT
		)
		if k == #FILM_ROWS then
			-- big GAME / FILM letters on the back riser, either side of the staircase (the canvas
			-- runs from the east end, IX1, westward: GAME fills 2 studs from the east wall to 3 short
			-- of the stairs, FILM the far side)
			local gui = canvas(tier, Enum.NormalId.Front, 12, nil, 0.4)
			local h = row.top - SHELL_FLOOR
			local textColor = textColorOn(step, team)
			guiText(gui, 2, h * 0.15, (IX1 - 2) - (SX1 + 3) - 0.1, h * 0.7, "GAME", textColor, Enum.Font.GothamBlack)
			guiText(gui, IX1 - (IX0 + 15.5), h * 0.15, 13.5, h * 0.7, "FILM", textColor, Enum.Font.GothamBlack)
		end
	end
	for i = 1, 5 do
		local z0 = 290 + (i - 1) * 2
		box(tiers, "Stair", SX0, SHELL_FLOOR, z0, SX1, FLOOR_TOP + i, z0 + 2, step, Enum.Material.Carpet)
		box(tiers, "StairNosing", SX0, FLOOR_TOP + i, z0, SX1, FLOOR_TOP + i + 0.04, z0 + 0.3, team.Secondary, Enum.Material.Neon, PAINT)
	end
	local railTop = FILM_ROWS[6].top + 3
	for _, span in ipairs({ { IX0, SX0 }, { SX1, IX1 } }) do
		box(
			tiers,
			"GlassRail",
			span[1],
			FILM_ROWS[6].top,
			300,
			span[2],
			railTop,
			300.25,
			GLASS,
			Enum.Material.Glass,
			{ Transparency = 0.5 }
		)
		box(tiers, "RailCap", span[1], railTop, 299.95, span[2], railTop + 0.2, 300.3, team.Primary, Enum.Material.Metal)
	end

	-- Step 2: theatre seats (three TV camera seats aimed at the screen) ------------------------
	BuildUtil.Stage(ctx, 2)
	local seating = BuildUtil.Child(ctx, "Seats")
	-- The camera seats are aisle seats (the end of a row, right by a side aisle), so nobody has to
	-- squeeze past a row of touch-to-sit seats to reach them. Their TV cameras film the screen from
	-- the middle of the room, beside the projector beam (x = -25).
	local cameras = {
		[1] = { x = -11, cam = { From = Vector3.new(-22.5, 5.8, 336.6), To = screenTarget, Fov = 62, Label = "FRONT ROW" } },
		[4] = { x = -39, cam = { From = Vector3.new(-27.5, 8.4, 324.5), To = screenTarget, Fov = 52, Label = "FILM SESSION" } },
		[6] = { x = -11, cam = { From = Vector3.new(-22, 10.4, 309.5), To = screenTarget, Fov = 44, Label = "COACH'S VIEW" } },
	}
	local backColor = shade(team.Primary, 0.65)
	for k, row in ipairs(FILM_ROWS) do
		local back = row.seatBack or row.back
		local camera = cameras[k]
		for _, x in ipairs(FILM_SEAT_X) do
			local prompted = camera ~= nil and camera.x == x
			BuildUtil.Seat(seating, {
				Name = "TheatreSeat",
				Size = Vector3.new(3.2, 1.5, 2.4),
				CFrame = CFrame.new(x, row.top + 0.75, back + 2) * CFrame.Angles(0, math.pi, 0),
				Color = team.Primary,
				Material = Enum.Material.Fabric,
				Object = "Film Seat",
				NoPrompt = not prompted,
				Camera = prompted and camera.cam or nil,
			})
			box(
				seating,
				"SeatBack",
				x - 1.6,
				row.top + 0.4,
				back + 0.2,
				x + 1.6,
				row.top + 3.8,
				back + 0.8,
				backColor,
				Enum.Material.Fabric
			)
		end
	end

	-- Step 3: the big screen, projector + beam, speakers, podium, lobby extras -----------------
	BuildUtil.Stage(ctx, 3)
	local screenModel = BuildUtil.Child(ctx, "BigScreen")
	box(screenModel, "ScreenFrame", -42.2, 1.6, LINE_Z - 0.4, -7.8, 12, LINE_Z, team.Primary)
	local screen = box(screenModel, "Screen", -41.4, 2.2, LINE_Z - 0.55, -8.6, 11.4, LINE_Z - 0.4, SCREEN)
	liveScreen(screen, Enum.NormalId.Front, "summary", name .. "\nGAME FILM", {
		PixelsPerStud = 12,
		TextColor3 = WHITE,
		Font = Enum.Font.GothamBlack,
		Padding = 0.08,
	})
	BuildUtil.Light(
		screen,
		"SurfaceLight",
		{ Name = "ScreenGlow", Face = Enum.NormalId.Front, Range = 30, Brightness = 1.2, Color = Color3.fromRGB(170, 190, 255) }
	)
	BuildUtil.Look(screen, "Big Screen", "Game film plays here, along with your team's latest score, record and season. Grab a seat!", {
		LookKey = "season",
		At = Vector3.new(0, -3, -1),
		Distance = 10,
	})
	-- speakers either side of the screen
	for i, sx in ipairs({ -45.6, -4.4 }) do
		local speaker = box(screenModel, "Speaker", sx - 2, FLOOR_TOP, 355, sx + 2, 10.2, LINE_Z, BLACK)
		local gui = canvas(speaker, Enum.NormalId.Front, 12, nil, 0.6)
		guiDot(gui, 2, 2.4, 2.6, Color3.fromRGB(56, 58, 66))
		guiDot(gui, 2, 6.4, 3.4, Color3.fromRGB(56, 58, 66))
		if i == 1 then
			BuildUtil.Look(speaker, "Surround Speakers", "You can hear every hit, every whistle and the coach yelling 'WHAT WAS THAT?!'", {
				Distance = 8,
			})
		end
	end
	-- the projector hangs over the cross-aisle and beams at the screen
	box(screenModel, "ProjectorMount", -25.4, 11.8, 302.6, -24.6, WALL_TOP, 303.4, DARK_METAL, Enum.Material.Metal)
	local projector = box(screenModel, "Projector", -26.6, 10.6, 301.4, -23.4, 11.8, 304.4, INK, Enum.Material.SmoothPlastic, NO_COLLIDE)
	local lensAt = Vector3.new(-25, 11.2, 304.7)
	cyl(screenModel, "ProjectorLens", lensAt, 0.6, 0.9, "Z", CHROME, Enum.Material.Glass, NO_COLLIDE)
	local beamFrom = lensAt + Vector3.new(0, 0, 0.3)
	local beamTo = Vector3.new(-25, 6.8, LINE_Z - 0.6)
	BuildUtil.Part(screenModel, {
		Name = "ProjectorBeam",
		Size = Vector3.new(1.4, 1.4, (beamTo - beamFrom).Magnitude),
		CFrame = CFrame.lookAt((beamFrom + beamTo) / 2, beamTo),
		Color = Color3.fromRGB(255, 250, 222),
		Material = Enum.Material.Neon,
		Transparency = 0.9,
		CanCollide = false,
		CastShadow = false,
	})
	BuildUtil.Look(
		projector,
		"Film Projector",
		"Beams game film onto the big screen. Coaches watch every play again... and again... and again.",
		{
			Distance = 10,
		}
	)
	-- the coach's clicker podium on the stage, facing the rows
	local podium = box(screenModel, "Podium", -6.8, FLOOR_TOP, 346, -4.2, 3.9, 348, DARK_WOOD, Enum.Material.Wood)
	box(screenModel, "PodiumTop", -7, 3.9, 345.8, -4, 4.15, 348.2, WOOD, Enum.Material.Wood)
	box(screenModel, "Clicker", -5.7, 4.15, 347, -5.3, 4.3, 347.7, BLACK)
	sign(podium, Enum.NormalId.Front, "COACH", DARK_WOOD, team, { TextColor3 = GOLD, InsetX = 0.12, Top = 0.15, Height = 0.2 })
	BuildUtil.Look(
		podium,
		"Coach's Clicker",
		"Pause. Rewind. Play. Rewind again! The coach replays every mistake on the big screen until it's fixed.",
		{ Distance = 8 }
	)
	-- lobby: popcorn machine, NOW SHOWING poster, playbook library
	local lobby = BuildUtil.Child(ctx, "Lobby")
	local cart = box(lobby, "PopcornCart", -47.8, FLOOR_TOP, 281.4, -45.2, 3.3, 284, Color3.fromRGB(200, 40, 40))
	sign(
		cart,
		Enum.NormalId.Right,
		"POPCORN",
		Color3.fromRGB(200, 40, 40),
		team,
		{ TextColor3 = Color3.fromRGB(255, 236, 160), InsetX = 0.08, InsetY = 0.35 }
	)
	box(lobby, "Popcorn", -47.6, 3.3, 281.6, -45.4, 4.4, 283.8, Color3.fromRGB(255, 236, 160), Enum.Material.Sand)
	box(
		lobby,
		"PopcornGlass",
		-47.8,
		3.3,
		281.4,
		-45.2,
		5.7,
		284,
		Color3.fromRGB(230, 240, 245),
		Enum.Material.Glass,
		{ Transparency = 0.5 }
	)
	BuildUtil.Use(ctx, cart, "popcorn", {
		Object = "Popcorn Machine",
		Title = "Popcorn Machine",
		Info = "Fresh, hot popcorn for film night. Coaches say it helps you spot the open receiver. (It doesn't.)",
		Distance = 8,
	})
	local poster = box(lobby, "Poster", IX0, 2.5, 287, IX0 + 0.2, 9.5, 292, team.Primary)
	local posterGui = canvas(poster, Enum.NormalId.Right, 20, nil, 0.5)
	local posterInk = textColorOn(team.Primary, team)
	guiText(posterGui, 0.4, 0.4, 4.2, 0.8, "NOW SHOWING", GOLD, Enum.Font.GothamBlack)
	guiText(posterGui, 0.4, 1.6, 4.2, 2.2, name, posterInk, Enum.Font.GothamBlack)
	guiText(posterGui, 0.4, 4.2, 4.2, 0.9, "VS. LAST WEEK", posterInk, Enum.Font.GothamBold)
	guiText(posterGui, 0.4, 5.5, 4.2, 0.6, "EVERY PLAY. EVERY ANGLE.", GOLD, Enum.Font.GothamBold)
	BuildUtil.Look(
		poster,
		"Now Showing",
		"Tonight's feature: your team's last game, every single play. Popcorn is free, falling asleep is not!",
		{ LookKey = "season", Distance = 8 }
	)
	local shelf = box(lobby, "PlaybookShelf", IX1 - 2.4, FLOOR_TOP, 282, IX1, 8.5, 296, DARK_WOOD, Enum.Material.Wood)
	local shelfGui = canvas(shelf, Enum.NormalId.Left, 10, nil, 0.8)
	local spines = { team.Primary, team.Secondary, WHITE, Color3.fromRGB(40, 40, 46) }
	for row = 0, 2 do
		for k = 0, 16 do
			guiFrame(shelfGui, 0.3 + k * 0.8, 0.5 + row * 2.7, 0.65, 2.1, spines[(k + row) % #spines + 1])
		end
	end
	BuildUtil.Look(
		shelf,
		"Playbook Library",
		"Every play your team has ever run, in giant binders. Top secret... okay, maybe one quick peek.",
		{ Distance = 8 }
	)
end

---------------------------------------------------------------------------------------------
-- Cafeteria X[0, 98] (double width)
---------------------------------------------------------------------------------------------

function HQRoomsBack.hq_cafeteria(ctx)
	local team = ctx.colors
	local name = teamLabel(ctx)
	local wall = Color3.fromRGB(240, 236, 228)
	local IX0, IX1 = 0.8, 98.15

	-- Step 1: the dining hall, glass front, double doors ---------------------------------------
	BuildUtil.Stage(ctx, 1)
	local room = BuildUtil.Child(ctx, "Room")
	local shell = roomShell(room, {
		X0 = 0,
		X1 = 98.45,
		InnerX0 = IX0,
		InnerX1 = IX1,
		Walls = { { 0, IX0 } },
		Linings = { { IX1, 98.45 } },
		Openings = {
			{ From = 6, To = 36, Sill = 3.2, Mullions = 3 },
			{ From = 41, To = 51 },
			{ From = 64, To = 94, Sill = 3.2, Mullions = 3 },
		},
		WallColor = wall,
		FloorColor = Color3.fromRGB(222, 214, 198),
		FloorMaterial = Enum.Material.CeramicTiles,
		CeilingColor = WHITE,
		Door = {
			Color = WOOD,
			Material = Enum.Material.Wood,
			Window = true,
			Object = "Cafeteria",
			Title = "Team Cafeteria",
			Info = "Breakfast, lunch and dinner for the whole team. Grab a tray, a smoothie or a sports drink!",
		},
		Lights = { { 25, 300 }, { 73, 300 }, { 25, 330 }, { 73, 330 } },
		LightSize = { 14, 6 },
		LightRange = 30,
		LightBrightness = 1.5,
	})
	sign(shell.Lintel, Enum.NormalId.Back, name .. " CAFETERIA", wall, team, { InsetX = 0.3, Top = 0.15, Height = 0.6 })
	for _, x in ipairs({ IX0, IX1 - 0.05 }) do
		box(room, "WallStripe", x, 7.2, CW_IN, x + 0.05, 8, LINE_Z, team.Primary, Enum.Material.SmoothPlastic, PAINT)
	end
	-- two team murals on the back wall, either side of the kitchen
	local murals = {
		{ x0 = 5, lines = { name, "EAT. SLEEP. FOOTBALL." } },
		{ x0 = 78, lines = { "HYDRATE", "WATER WINS GAMES" } },
	}
	for i, m in ipairs(murals) do
		local color = i == 1 and team.Primary or team.Secondary
		local mural = box(room, "Mural", m.x0, 3.4, LINE_Z - 0.15, m.x0 + 17, 10.4, LINE_Z, color, Enum.Material.SmoothPlastic)
		local gui = canvas(mural, Enum.NormalId.Front, 16, nil, 0.6)
		local ink = textColorOn(color, team)
		guiFrame(gui, 0.6, 0.6, 15.8, 0.25, ink)
		guiText(gui, 0.8, 1.3, 15.4, 3, m.lines[1], ink, Enum.Font.GothamBlack)
		guiText(gui, 0.8, 4.6, 15.4, 1.3, m.lines[2], ink, Enum.Font.GothamBold)
		guiFrame(gui, 0.6, 6.15, 15.8, 0.25, ink)
		if i == 2 then
			BuildUtil.Look(
				mural,
				"Hydration Mural",
				"Players drink lots of water every day. A thirsty player is a slow player!",
				{ Distance = 9 }
			)
		end
	end

	-- Step 2: the serving line + kitchen ---------------------------------------------------------
	BuildUtil.Stage(ctx, 2)
	local line = BuildUtil.Child(ctx, "ServingLine")
	local counter = box(line, "ServingCounter", 26, FLOOR_TOP, 344, 74, 3.5, 347.6, team.Primary)
	sign(counter, Enum.NormalId.Front, "HOT LINE  -  GRAB A TRAY  -  EAT LIKE A CHAMPION", team.Primary, team, {
		InsetX = 0.08,
		InsetY = 0.3,
	})
	local counterTop = box(line, "CounterTop", 25.8, 3.5, 343.6, 74.2, 3.8, 348, STEEL, Enum.Material.Metal)
	box(line, "TraySlide", 26, 2.9, 342.2, 74, 3.1, 343.6, STEEL, Enum.Material.Metal)
	local foods = {
		Color3.fromRGB(90, 170, 70),
		Color3.fromRGB(250, 190, 60),
		Color3.fromRGB(190, 130, 70),
		Color3.fromRGB(200, 60, 40),
		Color3.fromRGB(250, 220, 90),
		Color3.fromRGB(60, 130, 50),
	}
	for i, color in ipairs(foods) do
		local fx = 30 + (i - 1) * 8
		box(line, "FoodPan", fx - 3.2, 3.8, 344.6, fx + 3.2, 3.92, 347, color, Enum.Material.SmoothPlastic, PAINT)
	end
	box(line, "SneezeGuard", 26, 3.8, 343.85, 74, 5.8, 344, GLASS, Enum.Material.Glass, { Transparency = 0.55 })
	box(line, "GuardShelf", 26, 5.8, 343.85, 74, 5.95, 347.4, GLASS, Enum.Material.Glass, { Transparency = 0.5 })
	box(line, "HeatLamp", 27, 5.65, 345.4, 73, 5.8, 346.2, Color3.fromRGB(255, 140, 60), Enum.Material.Neon, PAINT)
	BuildUtil.Look(
		counterTop,
		"Hot Food Line",
		"Grilled chicken, pasta, veggies and a mountain of mac and cheese. Big linemen can eat over 5,000 calories a day!",
		{ At = Vector3.new(0, 0.6, -1.5), Distance = 8 }
	)
	box(line, "TrayStand", 20.5, FLOOR_TOP, 343.6, 24.5, 3.5, 347.6, STEEL, Enum.Material.Metal)
	local trays = box(line, "TrayStack", 21, 3.5, 344.4, 24, 4.7, 346.8, team.Secondary)
	BuildUtil.Use(ctx, trays, "tray", {
		Action = "Grab a tray",
		Object = "Lunch Trays",
		Title = "Lunch Tray",
		Info = "Grab a tray and load up at the hot line. Today's special: the Linebacker Lasagna!",
		Distance = 8,
	})
	-- the kitchen behind the line
	box(line, "KitchenCounter", 24, FLOOR_TOP, 354.2, 76, 3.6, LINE_Z, STEEL, Enum.Material.Metal)
	local hood = box(line, "KitchenHood", 26, 8.6, 353.4, 74, WALL_TOP, LINE_Z, STEEL, Enum.Material.Metal)
	sign(hood, Enum.NormalId.Front, "FUEL UP!", STEEL, team, { TextColor3 = team.Primary, InsetX = 0.3, InsetY = 0.14 })
	for _, px0 in ipairs({ 36, 62 }) do
		cyl(line, "SoupPot", Vector3.new(px0, 4.6, 356.2), 2, 2.4, "Y", CHROME, Enum.Material.Metal)
	end
	BuildUtil.Look(
		hood,
		"Team Kitchen",
		"The team chefs cook breakfast, lunch and dinner back here. Pasta night before a big game is everyone's favourite!",
		{
			At = Vector3.new(16, -4, -9),
			Distance = 10,
		}
	)

	-- Step 3: round tables with chairs, two live TVs ----------------------------------------------
	BuildUtil.Stage(ctx, 3)
	local dining = BuildUtil.Child(ctx, "Tables")
	local promptAt = { ["18,302"] = true, ["74,302"] = true, ["33,320"] = true, ["59,320"] = true }
	local t = 0
	for _, tz in ipairs({ 302, 320 }) do
		for _, tx in ipairs({ 18, 33, 59, 74 }) do
			t += 1
			cyl(dining, "TablePost", Vector3.new(tx, (FLOOR_TOP + 3) / 2, tz), 3 - FLOOR_TOP, 0.8, "Y", DARK_METAL, Enum.Material.Metal)
			cyl(dining, "TableTop", Vector3.new(tx, 3.15, tz), 0.3, 4.6, "Y", WHITE, Enum.Material.Marble)
			local color = t % 2 == 1 and team.Primary or team.Secondary
			local chairs = {
				{ tx - 3.4, tz, "E" },
				{ tx + 3.4, tz, "W" },
				{ tx, tz - 3.4, "N" },
				{ tx, tz + 3.4, "S" },
			}
			for k, c in ipairs(chairs) do
				-- a moulded seat on a tall back panel that stands on the floor
				local frame = frameAt(c[1], c[2], c[3])
				lseat(dining, frame, Vector3.new(2, 0.45, 2), 0, 1.35, -0.1, color, Enum.Material.SmoothPlastic, {
					Name = "ChairSeat",
					Object = "Cafeteria Chair",
					NoPrompt = not (k == 1 and promptAt[tx .. "," .. tz]),
				})
				lblock(dining, frame, "ChairBack", Vector3.new(1.9, 4.1, 0.35), 0, 0, 0.95, shade(color, 0.8), Enum.Material.SmoothPlastic)
			end
		end
	end
	-- two TVs on the west wall: the game-day countdown and the latest score
	for i, tv in ipairs({ { z0 = 296, live = "gameday", text = "NEXT GAME SOON" }, { z0 = 314, live = "score", text = name } }) do
		box(dining, "TVFrame", IX0, 5.2, tv.z0, IX0 + 0.3, 11.6, tv.z0 + 12, BLACK)
		local display = box(dining, "TV", IX0 + 0.3, 5.5, tv.z0 + 0.3, IX0 + 0.45, 11.3, tv.z0 + 11.7, SCREEN)
		liveScreen(display, Enum.NormalId.Right, tv.live, tv.text, {
			PixelsPerStud = 20,
			TextColor3 = i == 1 and LED_TEXT or WHITE,
			Font = Enum.Font.GothamBlack,
			Header = i == 1 and "GAME DAY" or "LATEST SCORE",
			HeaderShare = 0.22,
			HeaderBackground = team.Primary,
			Padding = 0.06,
		})
		if i == 1 then
			BuildUtil.Look(
				display,
				"Cafeteria TV",
				"Counts down to the next game day. When it hits zero, the fans pour in and income doubles!",
				{
					LookKey = "season",
					Distance = 9,
				}
			)
		end
	end

	-- Step 4: smoothie bar + drinks cooler -------------------------------------------------------
	BuildUtil.Stage(ctx, 4)
	local bar = BuildUtil.Child(ctx, "SmoothieBar")
	local barFront = box(bar, "BarCounter", 86, FLOOR_TOP, 300, 89, 3.6, 324, team.Primary)
	sign(barFront, Enum.NormalId.Left, "SMOOTHIE BAR", team.Primary, team, { InsetX = 0.15, InsetY = 0.22 })
	local barTop = box(bar, "BarTop", 85.7, 3.6, 299.7, 89.3, 3.9, 324.3, LIGHT_WOOD, Enum.Material.Wood)
	BuildUtil.Use(ctx, barTop, "smoothie", {
		Action = "Grab a smoothie",
		Object = "Smoothie Bar",
		Title = "Smoothie Bar",
		Info = "Fresh fruit blended with ice for game-day energy. Pick a flavour from the menu board!",
		Distance = 8,
	})
	box(bar, "BackCounter", 95.2, FLOOR_TOP, 300, IX1, 3.4, 324, WHITE)
	local jarColors = { Color3.fromRGB(240, 110, 150), Color3.fromRGB(120, 200, 90), Color3.fromRGB(250, 160, 50) }
	for i, bz in ipairs({ 304, 312, 320 }) do
		box(bar, "BlenderBase", 95.9, 3.4, bz - 0.6, 97.1, 4, bz + 0.6, BLACK)
		cyl(bar, "BlenderJar", Vector3.new(96.5, 4.8, bz), 1.6, 1, "Y", jarColors[i], Enum.Material.Glass, { Transparency = 0.2 })
	end
	for i, bz in ipairs({ 306, 318 }) do
		cyl(bar, "FruitBowl", Vector3.new(87.5, 4.15, bz), 0.5, 1.8, "Y", WHITE, Enum.Material.SmoothPlastic)
		ball(bar, "Fruit", Vector3.new(87.2, 4.65, bz - 0.3), 0.75, i == 1 and Color3.fromRGB(220, 40, 40) or Color3.fromRGB(250, 140, 30))
		ball(bar, "Fruit", Vector3.new(87.8, 4.65, bz + 0.3), 0.75, Color3.fromRGB(250, 220, 60))
	end
	-- menu board on the east wall
	local menu = box(bar, "MenuBoard", IX1 - 0.3, 5.5, 301, IX1, 11.5, 323, BLACK)
	local menuGui = canvas(menu, Enum.NormalId.Left, 20, Color3.fromRGB(24, 26, 30), 0.3)
	guiFrame(menuGui, 0, 0, 22, 1.4, team.Primary)
	guiText(menuGui, 0.5, 0.2, 21, 1, "SMOOTHIE MENU", textColorOn(team.Primary, team), Enum.Font.GothamBlack)
	local items = {
		{ "TOUCHDOWN TROPICAL", "MANGO - PINEAPPLE - BANANA", Color3.fromRGB(250, 190, 60) },
		{ "BLITZ BERRY", "STRAWBERRY - BLUEBERRY - YOGURT", Color3.fromRGB(240, 110, 150) },
		{ "GREEN MACHINE", "SPINACH - APPLE - KIWI", Color3.fromRGB(120, 210, 90) },
		{ "END ZONE PB", "PEANUT BUTTER - BANANA - OATS", Color3.fromRGB(220, 170, 110) },
	}
	for i, item in ipairs(items) do
		local y = 1.8 + (i - 1) * 1.05
		guiDot(menuGui, 1.2, y + 0.45, 0.6, item[3])
		guiText(menuGui, 2, y, 9, 0.6, item[1], item[3], Enum.Font.GothamBlack, Enum.TextXAlignment.Left)
		guiText(menuGui, 11.4, y + 0.08, 10.2, 0.45, item[2], WHITE, Enum.Font.GothamBold, Enum.TextXAlignment.Left)
	end
	BuildUtil.Look(
		menu,
		"Smoothie Menu",
		"Try the Touchdown Tropical, the Blitz Berry or the Green Machine. Packed with fruit for game-day energy!",
		{ At = Vector3.new(-5.5, -2.3, 4), Distance = 10 }
	)
	-- bar stools facing the counter
	for i, sz in ipairs({ 303, 309, 315, 321 }) do
		cyl(bar, "StoolPost", Vector3.new(83.6, (FLOOR_TOP + 3) / 2, sz), 3 - FLOOR_TOP, 0.35, "Y", CHROME, Enum.Material.Metal)
		BuildUtil.Seat(bar, {
			Name = "BarStool",
			Size = Vector3.new(1.8, 0.5, 1.8),
			CFrame = CFrame.new(83.6, 3.25, sz) * CFrame.Angles(0, FACING.E, 0),
			Color = team.Secondary,
			Material = Enum.Material.Leather,
			Object = "Bar Stool",
			NoPrompt = i ~= 2,
		})
	end
	-- drinks cooler on the west wall, by the serving line
	local fridge = box(bar, "DrinksCooler", IX0, FLOOR_TOP, 336, 4.4, 7.4, 342.5, DARK_METAL, Enum.Material.Metal)
	box(bar, "CoolerGlass", 4.4, 0.9, 336.4, 4.55, 6.9, 342.1, GLASS, Enum.Material.Glass, { Transparency = 0.5 })
	local bottles = box(bar, "CoolerBottles", 3.6, 1.1, 336.6, 4.3, 6.7, 341.9, Color3.fromRGB(230, 232, 236))
	local bottleGui = canvas(bottles, Enum.NormalId.Right, 20, nil, 0.3)
	local drinkColors =
		{ Color3.fromRGB(255, 150, 30), Color3.fromRGB(80, 200, 255), Color3.fromRGB(150, 230, 60), Color3.fromRGB(240, 60, 90) }
	for row = 0, 2 do
		for col = 0, 8 do
			guiFrame(bottleGui, 0.2 + col * 0.56, 0.4 + row * 1.8, 0.38, 1.3, drinkColors[(row + col) % 4 + 1])
		end
	end
	BuildUtil.Use(ctx, fridge, "sportsdrink", {
		Object = "Drinks Cooler",
		Title = "Drinks Cooler",
		Info = "Sports drinks in every team-approved flavour. Stay hydrated, champ!",
		Distance = 8,
	})
end

return HQRoomsBack
