--[[
	HQRoomsUpperFront
	The Team HQ's grand atrium and the FRONT row of rooms on the UPPER floor (campus coordinates;
	the empty two-storey building is Builders/HQShell.lua). The upper floor's top is at y = 17
	(Config.Layout.HQ.UpperFloorY); the upper corridor X[-248, 98] Z[264, 278] stays clear. Every
	room fills its zone (Config.Layout.Zones) between the shell's front wall (inner face z = 201.45)
	and the corridor, with walls from y 17 to 29, a ceiling with lights and a working door
	(BuildUtil.Door, swinging INTO the room) right beside its buy button in the corridor.

	  hq_atrium     the lobby's two-storey atrium X[-150, -50] (the lobby below is open to the roof)
	                  1 GRAND STAIRCASE along the atrium's east side: 22 marble steps (0.76 high,
	                    1.8 deep) in two flights with a mid landing, a team-colour carpet runner,
	                    team-colour stringers, glass balustrades with brass handrails, lit newel
	                    posts (look: Grand Staircase / elevator: race up the stairs), a planter
	                    under the upper flight, and the EAST MEZZANINE at the top (the upper
	                    corridor level, y 17) with a team medallion inlay, glass rails and a lit
	                    fascia. The handrail at the top lets you slide down the banister (elevator).
	                  2 the WEST BALCONY (a cantilevered marble balcony in front of the Owner's
	                    Suite, open to the upper corridor) with glass rails, lit fascias, lounge
	                    chairs (one is the ATRIUM CAM seat), a planter and a look prompt. (The
	                    shell's glass railing guards the corridor edge between the west balcony and
	                    the east mezzanine: X[-126.2, -74.4].)
	                  3 RING OF HONOR: five tall team banners (retired numbers of fictional
	                    legends + the team name) on a rigging beam across the atrium, a plaque on
	                    the mezzanine (look)
	                  4 VIDEO WALL: a huge live "summary" LED wall on the atrium's west wall with a
	                    live game-day ticker and speaker stacks (look), and a VIDEO WALL CAM bench on
	                    the mezzanine
	  hq_owner      the Owner's Suite X[-248, -150] (double width)
	                  1 cream walls, walnut floor, a walnut partition between the office and the
	                    lounge, a glass window wall onto the atrium's west balcony with a sliding
	                    glass balcony door, grand double doors from the corridor with a live OWNER
	                    plate
	                  2 the owner's desk + chair (an OWNER CAM seat), live "owner" nameplate, guest
	                    chairs, live record + season screens, bookcase (look), globe, game ball
	                  3 the trophy wall: lit display cabinet + glass shelves full of trophies, game
	                    balls and helmets, a live CHAMPIONSHIPS header (look: titles), two framed
	                    jerseys
	                  4 the lounge (sofa with a TV camera seat, armchairs, fireplace, live score TV),
	                    the owner's mini-bar (fridge: use soda, stools) and the OWNER'S BOX deck at
	                    the front window wall: recliners (STADIUM VIEW camera seat) + a telescope
	  hq_media      the Media Studio X[-50, 0]
	                  1 black studio walls with acoustic panels, a window onto the atrium, a lighting
	                    grid with spotlights, a studio door with an ON AIR light
	                  2 the podcast table: four chairs (the host chair is the PODCAST CAM seat),
	                    microphones, a live game-day tablet, THE HUDDLE neon sign
	                  3 the TV set: riser, LED backdrop (live score / season / record), anchor desk,
	                    anchor chairs (TEAM TV - LIVE camera seat), three studio cameras (looks) and
	                    two studio lights
	  hq_scouting   the Scouting War Room X[0, 50]
	                  1 navy carpet, walls, frosted corridor window, door
	                  2 the BIG BOARD of draft prospects (look: draft) with a live starters panel and
	                    a live draft clock
	                  3 the war-room table (chairs, laptops, draft phone: look) and two scout desks
	                  4 the film wall (game-film screens + live score / rating / record) and a
	                    director's chair (FILM WALL camera seat)
	  hq_analytics  the Analytics Lab X[50, 98]
	                  1 white lab with a tiled raised floor, an all-glass corridor wall with sliding
	                    glass doors, LED light strips
	                  2 two rows of computer desks with chart monitors (seats; one is the DATA WALL
	                    camera seat), server racks (look)
	                  3 the data wall (live rating / record / season, look: team rating), a chart
	                    ticker and the holo-field table (look)

	THE LOBBY BELOW (Builders/HQRoomsFront.lua hq_lobby) keeps its reception desk, team wall, trophy
	case, seating and big screen: the staircase runs between the lobby seating and the east wall,
	the balconies stay clear of the team wall (top 19.6) and the big screen (y 14..26), and the
	entrance -> corridor path, the spawn, the safe and both lobby buttons stay clear.

	Charts, cards, bottles and books are drawn with GUI frames on SurfaceGuis (no extra parts).
	Every player, legend, school and show name is fictional.
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)

local M = {}

---------------------------------------------------------------------------------------------
-- Lines and heights (campus coordinates)
---------------------------------------------------------------------------------------------
local SHELL_FLOOR = 0.2 -- the shell's ground floor
local LOBBY_FLOOR = 0.32 -- top of the lobby's marble floor
local UP = 17 -- top of the upper floor slab (Config.Layout.HQ.UpperFloorY)
local FT = 17.12 -- upper room floors lie on the slab
local WT = 29 -- upper room walls; the ceilings rest on them
local CT = 29.4
local DOOR_TOP = 26
local FRONT_Z = 201.45 -- inner face of the shell's front wall
local CW_IN, CW_OUT = 262.8, 263.8 -- corridor-side room wall (the corridor starts at z = 264)
local FACE_Z = 264
local DOOR_Z = (CW_IN + CW_OUT) / 2
local DOOR_H = DOOR_TOP - FT - 0.1

local PAINT = { CanCollide = false, CastShadow = false }
local NO_COLLIDE = { CanCollide = false }
local GLASS_PROPS = { Transparency = 0.55, Reflectance = 0.1 }

local WHITE = Color3.fromRGB(248, 248, 248)
local INK = Color3.fromRGB(22, 22, 26)
local BLACK = Color3.fromRGB(24, 24, 28)
local DARK_METAL = Color3.fromRGB(62, 64, 70)
local STEEL = Color3.fromRGB(92, 96, 104)
local CHROME = Color3.fromRGB(200, 204, 210)
local SILVER = Color3.fromRGB(214, 218, 224)
local GOLD = Color3.fromRGB(255, 190, 40)
local BRASS = Color3.fromRGB(214, 172, 84)
local GLASS = Color3.fromRGB(160, 210, 240)
local MARBLE = Color3.fromRGB(236, 234, 228)
local CREAM = Color3.fromRGB(238, 232, 218)
local WALNUT = Color3.fromRGB(92, 62, 40)
local WALNUT_DARK = Color3.fromRGB(62, 42, 28)
local OAK = Color3.fromRGB(176, 128, 82)
local DECK_WOOD = Color3.fromRGB(156, 112, 72)
local LEATHER_BLACK = Color3.fromRGB(34, 34, 38)
local LEATHER_BROWN = Color3.fromRGB(112, 64, 38)
local FOOTBALL = Color3.fromRGB(124, 66, 36)
local STONE = Color3.fromRGB(92, 92, 98)
local SCREEN = Color3.fromRGB(14, 16, 22)
local SCREEN_BLUE = Color3.fromRGB(28, 92, 196)
local LED_DARK = Color3.fromRGB(12, 14, 20)
local LED_TEXT = Color3.fromRGB(255, 226, 120)
local LED_GREEN = Color3.fromRGB(120, 230, 140)
local LAMP = Color3.fromRGB(255, 248, 232)
local WARM_LIGHT = Color3.fromRGB(255, 238, 205)
local COOL_LIGHT = Color3.fromRGB(220, 236, 255)
local LEAF = Color3.fromRGB(58, 128, 64)
local LEAF_DARK = Color3.fromRGB(38, 98, 50)
local TRUNK = Color3.fromRGB(96, 70, 46)
local POT = Color3.fromRGB(64, 66, 72)
local ON_AIR_RED = Color3.fromRGB(230, 40, 40)
local FLAME = Color3.fromRGB(255, 136, 36)
local STUDIO_BLACK = Color3.fromRGB(30, 30, 34)
local STUDIO_FLOOR = Color3.fromRGB(52, 54, 60)
local NAVY_CARPET = Color3.fromRGB(36, 42, 60)
local LAB_FLOOR = Color3.fromRGB(214, 218, 224)
local LAB_WHITE = Color3.fromRGB(240, 242, 245)
local CYAN = Color3.fromRGB(70, 220, 255)
local HOLO_GREEN = Color3.fromRGB(80, 255, 160)
local BOARD_WHITE = Color3.fromRGB(244, 244, 238)

-- Facing of furniture frames: the frame's front (-Z) points this way.
-- S = toward the HQ front (-Z), N = toward the corridor (+Z), E = +X, W = -X.
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

local function monogram(ctx)
	local name = ctx.teamName
	if type(name) ~= "string" or name == "" then
		return "HQ"
	end
	return name:sub(1, 1)
end

--[[
	Text on one face of `part`, coloured to read on `background`.
	opts: TextColor3, Font, PixelsPerStud, InsetX, InsetY, Top / Height (fractions of the face),
	      LightInfluence, BackgroundColor3 + BackgroundTransparency, Wrap, LabelName
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

-- A live screen (BuildUtil.LiveText) the server keeps up to date with the owner's team: dark LED
-- background, bright text, glows in the dark. Returns the TextLabel.
local function liveScreen(part, face, live, placeholder, opts)
	opts = opts or {}
	local _, label = BuildUtil.LiveText(part, face, live, {
		LabelName = opts.LabelName or ("Live_" .. live),
		Text = placeholder,
		TextColor3 = opts.TextColor3 or LED_TEXT,
		BackgroundColor3 = opts.BackgroundColor3 or LED_DARK,
		BackgroundTransparency = 0,
		LightInfluence = 0,
		Font = opts.Font or Enum.Font.GothamBold,
		PixelsPerStud = opts.PixelsPerStud or 24,
	})
	local pad = Instance.new("UIPadding")
	local p = UDim.new(opts.Padding or 0.06, 0)
	pad.PaddingLeft, pad.PaddingRight, pad.PaddingTop, pad.PaddingBottom = p, p, p, p
	pad.Parent = label
	return label
end

---------------------------------------------------------------------------------------------
-- GUI drawing (boards, screens, shelves). Positions/sizes are in studs measured from the
-- top-left corner of the face as seen from outside it.
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

local function guiFrame(gui, x, y, w, h, color, rotation, transparency)
	local pps = gui.PixelsPerStud
	local frame = Instance.new("Frame")
	frame.Name = "Ink"
	frame.BorderSizePixel = 0
	frame.BackgroundColor3 = color
	frame.BackgroundTransparency = transparency or 0
	frame.Size = UDim2.new(0, math.max(1, px(w, pps)), 0, math.max(1, px(h, pps)))
	frame.Position = UDim2.new(0, px(x, pps), 0, px(y, pps))
	frame.Rotation = rotation or 0
	frame.Parent = gui
	return frame
end

-- Straight line from (ax, ay) to (bx, by) (a frame rotated about its centre).
local function guiLine(gui, ax, ay, bx, by, thick, color)
	local dx, dy = bx - ax, by - ay
	local len = math.sqrt(dx * dx + dy * dy)
	local cx, cy = (ax + bx) / 2, (ay + by) / 2
	return guiFrame(gui, cx - len / 2, cy - thick / 2, len, thick, color, math.deg(math.atan2(dy, dx)))
end

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
	label.Parent = gui
	return label
end

-- A little bar + line chart (analytics monitors and tickers) in the box (x, y, w, h).
local function guiChart(gui, x, y, w, h, seed, barColor, lineColor)
	local bars = 7
	local bw = w / bars
	local prevX, prevY
	for i = 1, bars do
		local v = 0.25 + 0.6 * ((math.sin(seed * 1.7 + i * 1.3) + 1) / 2)
		local bh = h * v
		guiFrame(gui, x + (i - 1) * bw + bw * 0.15, y + h - bh, bw * 0.7, bh, barColor)
		local lx = x + (i - 0.5) * bw
		local ly = y + h * (0.15 + 0.5 * ((math.cos(seed + i * 0.9) + 1) / 2))
		if prevX then
			guiLine(gui, prevX, prevY, lx, ly, math.max(0.06, h * 0.035), lineColor)
		end
		prevX, prevY = lx, ly
	end
end

-- A mini football field with X's and O's (film screens, holo boards).
local function guiFilm(gui, w, h, seed, team)
	guiFrame(gui, 0, 0, w, h, Color3.fromRGB(40, 104, 46))
	for i = 1, 5 do
		guiFrame(gui, w * i / 6, 0, math.max(0.05, w * 0.008), h, Color3.fromRGB(220, 230, 220), 0, 0.3)
	end
	local los = w * (0.4 + 0.1 * math.sin(seed))
	for i = 1, 5 do
		local yy = h * (0.2 + i * 0.12)
		guiDot(gui, los - w * 0.04, yy, h * 0.08, team.Primary)
		guiDot(gui, los + w * 0.05, yy + h * 0.03, h * 0.08, WHITE)
	end
	guiLine(gui, los - w * 0.04, h * 0.32, los + w * 0.3, h * (0.15 + 0.1 * math.cos(seed)), h * 0.025, LED_TEXT)
	guiLine(gui, los - w * 0.04, h * 0.68, los + w * 0.22, h * 0.86, h * 0.025, LED_TEXT)
	guiFrame(gui, 0, h - h * 0.14, w, h * 0.14, Color3.fromRGB(10, 10, 14), 0, 0.2)
	guiText(gui, w * 0.03, h - h * 0.13, w * 0.6, h * 0.12, "GAME FILM  " .. string.format("%02d:%02d", 10 + seed, (seed * 7) % 60), WHITE)
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
	return CFrame.new(x, y or FT, z) * CFrame.Angles(0, FACING[facing] or facing, 0)
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

-- Rod (cylinder) from point a to point b.
local function rod(ctx, name, a, b, diameter, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Shape = Enum.PartType.Cylinder
	props.Size = Vector3.new((b - a).Magnitude, diameter, diameter)
	props.CFrame = CFrame.lookAt((a + b) / 2, b) * CFrame.Angles(0, math.pi / 2, 0)
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Part(ctx, props)
end

--[[
	A slab that climbs along +Z (stair stringers, glass balustrades, handrails, soffits): its TOP
	edge runs from (z0, y0) to (z1, y1) across x in [xa, xb]; `tv` is its VERTICAL thickness.
]]
local function slopeSlab(ctx, name, xa, xb, z0, y0, z1, y1, tv, color, material, extra)
	local dz, dy = z1 - z0, y1 - y0
	local len = math.sqrt(dz * dz + dy * dy)
	local t = tv * dz / len
	local a = Vector3.new((xa + xb) / 2, y0, z0)
	local b = Vector3.new((xa + xb) / 2, y1, z1)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Size = Vector3.new(xb - xa, t, len)
	props.CFrame = CFrame.lookAt((a + b) / 2, b) * CFrame.new(0, -t / 2, 0)
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Part(ctx, props)
end

---------------------------------------------------------------------------------------------
-- Furniture
---------------------------------------------------------------------------------------------

-- A seat cushion players can sit on (BuildUtil.Seat) in a local frame, bottom at local y0. The
-- sitter faces the frame's front. opts: Name, Object, NoPrompt, Camera
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

-- Simple chair (seat + back) you can sit on; the sitter faces the frame's front.
-- opts: Width, Depth, SeatHeight, BackHeight, Material, BackColor, Object, NoPrompt, Camera
local function chair(ctx, frame, color, opts)
	opts = opts or {}
	local w, d = opts.Width or 2, opts.Depth or 2
	local seatH, backH = opts.SeatHeight or 1.8, opts.BackHeight or 2.4
	local material = opts.Material or Enum.Material.Fabric
	local seat = lseat(ctx, frame, Vector3.new(w, seatH, d), 0, 0, 0, color, material, {
		Name = "ChairSeat",
		Object = opts.Object or "Chair",
		NoPrompt = opts.NoPrompt,
		Camera = opts.Camera,
	})
	lblock(ctx, frame, "ChairBack", Vector3.new(w, backH, 0.4), 0, seatH, d / 2 - 0.2, opts.BackColor or color, material)
	return seat
end

-- Office chair: pedestal, seat (a real seat), high back.
local function officeChair(ctx, frame, color, opts)
	opts = opts or {}
	cyl(ctx, "ChairPost", (frame * CFrame.new(0, 0.8, 0)).Position, 1.6, 0.5, "Y", DARK_METAL, Enum.Material.Metal)
	local seat = lseat(ctx, frame, Vector3.new(2.2, 0.6, 2.2), 0, 1.5, 0, color, Enum.Material.Leather, {
		Name = "ChairSeat",
		Object = opts.Object or "Office Chair",
		NoPrompt = opts.NoPrompt,
		Camera = opts.Camera,
	})
	lblock(ctx, frame, "ChairBack", Vector3.new(2.2, opts.BackHeight or 3, 0.45), 0, 2.1, 1.0, color, Enum.Material.Leather)
	return seat
end

-- Sofa (seat cushions, back, two arms) whose seats face the frame's front. Every cushion is a
-- seat; only the middle one shows a prompt (opts.Object / Camera go to it).
local function sofa(ctx, frame, length, color, armColor, opts)
	opts = opts or {}
	local material = Enum.Material.Fabric
	local seatLen = length - 1.6
	local count = math.max(1, math.floor(seatLen / 3.2))
	local cushionW = seatLen / count
	local middle = math.ceil(count / 2)
	for i = 1, count do
		local x = -seatLen / 2 + (i - 0.5) * cushionW
		local main = i == middle
		lseat(ctx, frame, Vector3.new(cushionW - 0.08, 1.7, 2.2), x, 0, -0.4, color, material, {
			Name = "SofaSeat",
			Object = opts.Object or "Sofa",
			NoPrompt = not main,
			Camera = main and opts.Camera or nil,
		})
	end
	lblock(ctx, frame, "SofaBack", Vector3.new(length, 3.6, 0.8), 0, 0, 1.1, armColor or color, material)
	for _, s in ipairs({ -1, 1 }) do
		lblock(ctx, frame, "SofaArm", Vector3.new(0.8, 2.6, 2.2), s * (length / 2 - 0.4), 0, -0.4, armColor or color, material)
	end
end

-- Potted plant (pot + two leaf balls) standing on y0; `tall` adds a trunk (indoor tree).
local function plant(ctx, x, z, size, tall, y0)
	size = size or 1
	y0 = y0 or FT
	local potH = 2 * size
	cyl(ctx, "PlantPot", Vector3.new(x, y0 + potH / 2, z), potH, 2.4 * size, "Y", POT, Enum.Material.Concrete)
	local leafY = y0 + potH + 1.4 * size
	if tall then
		cyl(ctx, "PlantTrunk", Vector3.new(x, y0 + potH + 1.6 * size, z), 3.2 * size, 0.4 * size, "Y", TRUNK, Enum.Material.Wood)
		leafY += 3 * size
	end
	ball(ctx, "PlantLeaves", Vector3.new(x, leafY, z), 3.6 * size, LEAF, Enum.Material.Grass)
	ball(ctx, "PlantLeaves", Vector3.new(x + 0.5 * size, leafY + 1.5 * size, z - 0.4 * size), 2.6 * size, LEAF_DARK, Enum.Material.Grass)
end

-- A screen showing static `text` (filled background, glows in the dark).
local function screenText(part, face, text, background, color, opts)
	opts = opts or {}
	return sign(part, face, text, background, { Trim = color, Secondary = color, Primary = color }, {
		TextColor3 = color,
		BackgroundColor3 = background,
		BackgroundTransparency = 0,
		LightInfluence = 0,
		InsetX = 0,
		InsetY = 0,
		Font = opts.Font or Enum.Font.GothamBold,
		PixelsPerStud = opts.PixelsPerStud or 40,
	})
end

-- Team logo: a ring + disc with the monogram on a wall. `axis` is the wall normal ("X" or "Z"),
-- `dir` (+1/-1) the side it faces, (x, y, z) the point on the wall face.
local function wallLogo(ctx, x, y, z, axis, dir, diameter, team, letters)
	local function at(offset)
		if axis == "X" then
			return Vector3.new(x + dir * offset, y, z)
		end
		return Vector3.new(x, y, z + dir * offset)
	end
	cyl(ctx, "LogoRing", at(0.15), 0.3, diameter, axis, team.Secondary, Enum.Material.SmoothPlastic)
	local disc = cyl(ctx, "LogoDisc", at(0.225), 0.45, diameter * 0.84, axis, team.Primary)
	local face
	if axis == "X" then
		face = dir > 0 and Enum.NormalId.Right or Enum.NormalId.Left
	else
		-- Cylinder along Z: local +X points to world -Z
		face = dir > 0 and Enum.NormalId.Left or Enum.NormalId.Right
	end
	sign(disc, face, letters, team.Primary, team, { InsetX = 0.2, InsetY = 0.2, PixelsPerStud = 24 })
	return disc
end

---------------------------------------------------------------------------------------------
-- Upper room shell
---------------------------------------------------------------------------------------------

-- A glowing ceiling light panel (w x d) centred on (x, z) with a PointLight.
local function ceilingLight(ctx, x, z, w, d, range, color)
	local lamp = box(ctx, "CeilingLight", x - w / 2, WT - 0.2, z - d / 2, x + w / 2, WT, z + d / 2, LAMP, Enum.Material.Neon, PAINT)
	BuildUtil.Light(lamp, "PointLight", { Name = "RoomLight", Range = range or 26, Brightness = 1.3, Color = color or WARM_LIGHT })
	return lamp
end

-- A working double door in a corridor-wall doorway (swings INTO the room, toward -Z, or slides),
-- a trim frame + a name plate on the corridor side. Call it after BuildUtil.Stage.
local function doorway(ctx, op, o, team)
	local glass = o.DoorGlass
	BuildUtil.Door(ctx, {
		Name = "RoomDoor",
		Size = Vector3.new(op.To - op.From, DOOR_H, 0.35),
		CFrame = CFrame.new((op.From + op.To) / 2, FT + 0.05 + DOOR_H / 2, DOOR_Z),
		Double = true,
		Slide = o.DoorSlide,
		Color = glass and GLASS or o.DoorColor,
		Material = glass and Enum.Material.Glass or Enum.Material.Wood,
		Transparency = glass and 0.45 or nil,
		Window = o.DoorWindow,
		Object = o.DoorObject,
		Title = o.DoorTitle,
		Info = o.DoorInfo,
		Distance = 8,
	})
	local trim = o.TrimColor or team.Secondary
	box(ctx, "DoorFrame", op.From - 0.5, UP, CW_OUT, op.From, DOOR_TOP, CW_OUT + 0.25, trim)
	box(ctx, "DoorFrame", op.To, UP, CW_OUT, op.To + 0.5, DOOR_TOP, CW_OUT + 0.25, trim)
	box(ctx, "DoorFrameTop", op.From - 0.5, DOOR_TOP, CW_OUT, op.To + 0.5, DOOR_TOP + 0.5, CW_OUT + 0.25, trim)
	if o.DoorSign then
		local plate = box(ctx, "DoorSign", op.From - 0.5, DOOR_TOP + 0.8, CW_OUT, op.To + 0.5, DOOR_TOP + 2.2, CW_OUT + 0.2, team.Primary)
		sign(plate, Enum.NormalId.Back, o.DoorSign, team.Primary, team, { InsetX = 0.05, InsetY = 0.12 })
	end
end

--[[
	Builds a room's floor, side walls, corridor wall (openings: a doorway with a working door, or
	windows) and its ceiling with light panels, all in the current step.
	o: MinX, MaxX, Walls = { { minX, maxX }, ... } (full side walls), Openings = { { From, To,
	   Sill?, Head?, Mullions?, Frosted? } } sorted by x (no Sill = a doorway), WallColor,
	   WallMaterial, FloorColor, FloorMaterial, CeilingColor, Door* (see doorway), Lights =
	   { { x, z }, ... }, LightColor, NoCorridorWall (the caller builds it)
]]
local function roomShell(ctx, o)
	local team = ctx.colors
	local x0, x1 = o.MinX, o.MaxX
	local wallColor, wallMaterial = o.WallColor, o.WallMaterial or Enum.Material.Plaster
	local floor = box(ctx, "Floor", x0, UP, FRONT_Z, x1, FT, FACE_Z, o.FloorColor, o.FloorMaterial)
	for _, w in ipairs(o.Walls) do
		box(ctx, "SideWall", w[1], UP, FRONT_Z, w[2], WT, CW_IN, wallColor, wallMaterial)
	end
	if not o.NoCorridorWall then
		box(ctx, "CorridorWallTop", x0, DOOR_TOP, CW_IN, x1, WT, CW_OUT, wallColor, wallMaterial)
		local x = x0
		local function pier(a, b)
			if b - a > 0.01 then
				box(ctx, "CorridorWall", a, UP, CW_IN, b, DOOR_TOP, CW_OUT, wallColor, wallMaterial)
			end
		end
		for _, op in ipairs(o.Openings) do
			pier(x, op.From)
			if op.Sill then
				box(ctx, "WindowSill", op.From, UP, CW_IN, op.To, op.Sill, CW_OUT, wallColor, wallMaterial)
				box(ctx, "WindowGlass", op.From, op.Sill, CW_IN + 0.3, op.To, DOOR_TOP, CW_OUT - 0.3, GLASS, Enum.Material.Glass, {
					Transparency = op.Frosted and 0.25 or 0.5,
				})
				for m = 1, op.Mullions or 0 do
					local mx = op.From + m * (op.To - op.From) / ((op.Mullions or 0) + 1)
					box(
						ctx,
						"Mullion",
						mx - 0.15,
						op.Sill,
						CW_IN + 0.15,
						mx + 0.15,
						DOOR_TOP,
						CW_OUT - 0.15,
						DARK_METAL,
						Enum.Material.Metal
					)
				end
			else
				doorway(ctx, op, o, team)
			end
			x = op.To
		end
		pier(x, x1)
	end
	box(ctx, "Ceiling", x0, WT, FRONT_Z, x1, CT, FACE_Z, o.CeilingColor or WHITE)
	for _, l in ipairs(o.Lights or {}) do
		ceilingLight(ctx, l[1], l[2], l[3] or 10, l[4] or 4, nil, o.LightColor)
	end
	return floor
end

---------------------------------------------------------------------------------------------
-- GRAND ATRIUM X[-150, -50]: staircase, balconies, banners, video wall
---------------------------------------------------------------------------------------------

-- The staircase climbs north (+Z) along the atrium's east side, between the lobby's seating and
-- the east wall: flight 1 (10 treads) -> mid landing -> flight 2 (10 treads) -> east mezzanine.
local ST_X0, ST_X1 = -58.2, -50.8 -- tread width (7.4)
local ST_W0, ST_E1 = -58.65, -50.35 -- outer faces of the stringers
local ST_Z0 = 211.6 -- first riser (4.6 studs behind the lobby's front plants)
local ST_D = 1.8 -- tread depth
local ST_RISE = (UP - LOBBY_FLOOR) / 22 -- 22 risers of ~0.76
local MID_Z0 = ST_Z0 + 10 * ST_D -- 229.6
local MID_Z1 = MID_Z0 + 5.4 -- 235
local TOP_Z = MID_Z1 + 10 * ST_D -- 253: the mezzanine edge (clear of the lobby's banner at z 254.3)
local MID_Y = LOBBY_FLOOR + 11 * ST_RISE -- 8.66
local CARPET_X0, CARPET_X1 = -56.8, -52.2
local MEZZ = { X0 = -74.4, X1 = -50.35, Z0 = TOP_Z, Z1 = 264 } -- east mezzanine (stair top)
local WB = { X0 = -150, X1 = -126.2, Z0 = 249.8, Z1 = 264 } -- west balcony
local SLAB_BOTTOM = 16.66 -- balcony / mezzanine slabs (clear of the lobby's banner poles at 16.62)

-- Glass balustrade + brass handrail along a sloped nosing line (z0, y0) -> (z1, y1), with the
-- stringer under it. side = "W" or "E".
local function stairSide(ctx, team, side, z0, y0, z1, y1, stringerDepth)
	local s0, s1 = ST_W0, ST_X0
	local g0, g1 = -58.55, -58.3
	if side == "E" then
		s0, s1 = ST_X1, ST_E1
		g0, g1 = -50.7, -50.45
	end
	slopeSlab(ctx, "Stringer", s0, s1, z0, y0 + 0.45, z1, y1 + 0.45, stringerDepth, team.Primary, Enum.Material.SmoothPlastic)
	slopeSlab(ctx, "GlassBalustrade", g0, g1, z0, y0 + 3.3, z1, y1 + 3.3, 2.95, GLASS, Enum.Material.Glass, GLASS_PROPS)
	return slopeSlab(ctx, "Handrail", s0, s1, z0, y0 + 3.57, z1, y1 + 3.57, 0.28, BRASS, Enum.Material.Metal)
end

-- The flat glass rail + handrail of a landing edge (axis-aligned).
local function flatRail(ctx, name, x0, z0, x1, z1, floorY)
	box(ctx, name .. "Glass", x0, floorY - 0.05, z0, x1, floorY + 3.3, z1, GLASS, Enum.Material.Glass, GLASS_PROPS)
	local cx0, cx1, cz0, cz1 = x0, x1, z0, z1
	if x1 - x0 < z1 - z0 then
		cx0, cx1 = (x0 + x1) / 2 - 0.22, (x0 + x1) / 2 + 0.22
	else
		cz0, cz1 = (z0 + z1) / 2 - 0.22, (z0 + z1) / 2 + 0.22
	end
	return box(ctx, name .. "Handrail", cx0, floorY + 3.3, cz0, cx1, floorY + 3.57, cz1, BRASS, Enum.Material.Metal)
end

-- A carpet piece covering a step's riser and tread (protrudes 0.05 so it never z-fights).
local function stairCarpet(ctx, team, zFront, zBack, top)
	box(
		ctx,
		"StairCarpet",
		CARPET_X0,
		top - ST_RISE,
		zFront - 0.05,
		CARPET_X1,
		top + 0.05,
		zBack,
		team.Primary,
		Enum.Material.Carpet,
		PAINT
	)
end

-- A tall Ring of Honor banner hanging from the rigging beam at (x, z): cloth, a pointed bottom,
-- a brass hanging rod. Text on both faces.
local function honorBanner(ctx, team, x, z, color, big, small)
	local w = 7
	local rodPart = cyl(ctx, "BannerRod", Vector3.new(x, 33.1, z), w + 1, 0.4, "X", BRASS, Enum.Material.Metal, NO_COLLIDE)
	local cloth = box(ctx, "Banner", x - w / 2, 20.4, z - 0.12, x + w / 2, 32.9, z + 0.12, color, Enum.Material.Fabric, NO_COLLIDE)
	-- the pointed bottom: two upside-down wedges meeting at the middle
	for _, s in ipairs({ -1, 1 }) do
		BuildUtil.Wedge(ctx, {
			Name = "BannerTip",
			Size = Vector3.new(0.24, 2, w / 2),
			CFrame = CFrame.new(x + s * w / 4, 19.4, z) * CFrame.Angles(0, -s * math.pi / 2, 0) * CFrame.Angles(0, 0, math.pi),
			Color = color,
			Material = Enum.Material.Fabric,
			CanCollide = false,
		})
	end
	local ink = textColorOn(color, team)
	for _, face in ipairs({ Enum.NormalId.Front, Enum.NormalId.Back }) do
		local gui = canvas(cloth, face, 12, nil, 1)
		guiFrame(gui, 0.4, 0.4, w - 0.8, 0.25, ink)
		guiText(gui, 0.5, 1.2, w - 1, 5.6, big, ink, Enum.Font.GothamBlack)
		guiText(gui, 0.5, 7.2, w - 1, 2.6, small, ink, Enum.Font.GothamBlack)
		guiFrame(gui, 0.4, 11.85, w - 0.8, 0.25, ink)
	end
	return rodPart, cloth
end

function M.hq_atrium(ctx)
	local team = ctx.colors
	local name = teamLabel(ctx)

	-- Step 1: the grand staircase + the east mezzanine at the top -----------------------------
	BuildUtil.Stage(ctx, 1)
	local stair = BuildUtil.Child(ctx, "GrandStaircase")
	-- flight 1: solid marble steps on the lobby floor
	for i = 1, 10 do
		local zf = ST_Z0 + (i - 1) * ST_D
		local top = LOBBY_FLOOR + i * ST_RISE
		box(stair, "Step", ST_X0, SHELL_FLOOR, zf, ST_X1, top, zf + ST_D, MARBLE, Enum.Material.Marble)
		stairCarpet(stair, team, zf, zf + ST_D, top)
	end
	box(stair, "MidLanding", ST_X0, SHELL_FLOOR, MID_Z0, ST_X1, MID_Y, MID_Z1, MARBLE, Enum.Material.Marble)
	stairCarpet(stair, team, MID_Z0, MID_Z1, MID_Y)
	-- flight 2: floating treads over a white soffit
	for k = 1, 10 do
		local zf = MID_Z1 + (k - 1) * ST_D
		local top = LOBBY_FLOOR + (11 + k) * ST_RISE
		box(stair, "Tread", ST_X0, top - ST_RISE - 0.35, zf, ST_X1, top, zf + ST_D, MARBLE, Enum.Material.Marble)
		stairCarpet(stair, team, zf, zf + ST_D, top)
	end
	local soffitLow = LOBBY_FLOOR + 10 * ST_RISE - 0.35
	slopeSlab(stair, "StairSoffit", ST_X0, ST_X1, MID_Z1, soffitLow, TOP_Z, soffitLow + 10 * ST_RISE, 0.32, WHITE)
	-- stringers, glass balustrades and handrails (nosing lines of both flights)
	local f1y0, f1y1 = LOBBY_FLOOR + ST_RISE, MID_Y
	local f2y0, f2y1 = MID_Y + ST_RISE, UP
	for _, side in ipairs({ "W", "E" }) do
		stairSide(stair, team, side, ST_Z0, f1y0, MID_Z0, f1y1, 2.37)
		local topRail = stairSide(stair, team, side, MID_Z1, f2y0, TOP_Z, f2y1, 2.8)
		local sx0, sx1, gx0, gx1 = ST_W0, ST_X0, -58.55, -58.3
		if side == "E" then
			sx0, sx1, gx0, gx1 = ST_X1, ST_E1, -50.7, -50.45
		end
		box(stair, "Stringer", sx0, MID_Y + 0.45 - 2.37, MID_Z0, sx1, MID_Y + 0.45, MID_Z1, team.Primary)
		flatRail(stair, "MidLandingRail", gx0, MID_Z0, gx1, MID_Z1, MID_Y + 0.05)
		if side == "W" then
			-- the top of the west handrail: slide all the way down (and race back up, below)
			local length = topRail.Size.Z
			BuildUtil.Elevator(stair, topRail, CFrame.new(-54.5, LOBBY_FLOOR, ST_Z0 - 2.2), {
				Action = "Slide down the banister!",
				Object = "Grand Staircase",
				Label = "WHEEEE!",
				At = Vector3.new(0, 0.5, -length / 2 + 1.6),
				Distance = 7,
			})
		end
	end
	-- the team logo on the side of the mid landing (faces the lobby seating)
	wallLogo(stair, ST_X0, 3.9, MID_Z0 + (MID_Z1 - MID_Z0) / 2, "X", -1, 4.4, team, monogram(ctx))
	-- lit newel posts at the foot of the stairs
	for i, nx in ipairs({ -58.15, -50.85 }) do
		local post = box(stair, "NewelPost", nx - 0.6, LOBBY_FLOOR, ST_Z0 - 1.3, nx + 0.6, 4.5, ST_Z0 - 0.1, team.Primary)
		box(stair, "NewelCap", nx - 0.75, 4.5, ST_Z0 - 1.45, nx + 0.75, 4.8, ST_Z0 + 0.05, BRASS, Enum.Material.Metal)
		local globe = ball(stair, "NewelGlobe", Vector3.new(nx, 5.45, ST_Z0 - 0.7), 1.3, LAMP, Enum.Material.Neon)
		BuildUtil.Light(globe, "PointLight", { Name = "NewelLight", Range = 16, Brightness = 1.2, Color = WARM_LIGHT })
		sign(post, Enum.NormalId.Front, "UP", team.Primary, team, { InsetX = 0.12, Top = 0.08, Height = 0.16, PixelsPerStud = 30 })
		if i == 1 then
			BuildUtil.Look(
				post,
				"Grand Staircase",
				"22 marble steps with a carpet in your team colours lead up to the executive floor: the Owner's Suite, Media Studio, Scouting War Room and Analytics Lab.",
				{ At = Vector3.new(0, 0.5, -0.8), Distance = 8 }
			)
		else
			BuildUtil.Elevator(stair, post, CFrame.new(-60, UP, 259.5), {
				Action = "Race up the stairs",
				Object = "Grand Staircase",
				Label = "UPPER FLOOR",
				At = Vector3.new(0, 0.5, -0.8),
				Distance = 7,
			})
		end
	end
	-- a planter tucked under the upper flight
	box(stair, "UnderStairPlanter", ST_X0 + 0.4, LOBBY_FLOOR, TOP_Z - 10.5, ST_X1 - 0.4, 1.6, TOP_Z - 1.4, STONE, Enum.Material.Slate)
	for i, pz in ipairs({ TOP_Z - 8.4, TOP_Z - 5.9, TOP_Z - 3.4 }) do
		ball(stair, "UnderStairBush", Vector3.new(-54.5 + (i - 2) * 0.8, 2.5, pz), 2.6, i == 2 and LEAF_DARK or LEAF, Enum.Material.Grass)
	end

	-- the east mezzanine: the stair arrives on the upper corridor level here
	box(stair, "Mezzanine", MEZZ.X0, SLAB_BOTTOM, MEZZ.Z0, MEZZ.X1, UP, MEZZ.Z1, MARBLE, Enum.Material.Marble)
	box(stair, "MezzanineFascia", MEZZ.X0, 15, MEZZ.Z0, MEZZ.X1, SLAB_BOTTOM, MEZZ.Z0 + 0.8, WHITE)
	local glow = box(
		stair,
		"MezzanineGlow",
		MEZZ.X0 + 0.2,
		15.55,
		MEZZ.Z0 - 0.08,
		ST_W0 - 0.2,
		15.85,
		MEZZ.Z0,
		team.Secondary,
		Enum.Material.Neon,
		PAINT
	)
	BuildUtil.Light(glow, "PointLight", { Name = "FasciaLight", Range = 18, Brightness = 1, Color = team.Secondary })
	box(
		stair,
		"StairCarpet",
		CARPET_X0,
		UP - ST_RISE,
		TOP_Z - 0.05,
		CARPET_X1,
		UP + 0.04,
		TOP_Z + 0.6,
		team.Primary,
		Enum.Material.Carpet,
		PAINT
	)
	box(stair, "MezzanineRunner", CARPET_X0, UP, TOP_Z + 0.6, CARPET_X1, UP + 0.04, MEZZ.Z1, team.Primary, Enum.Material.Carpet, PAINT)
	cyl(stair, "MedallionRing", Vector3.new(-61.5, UP + 0.02, 260.2), 0.04, 7, "Y", team.Secondary, Enum.Material.SmoothPlastic, PAINT)
	cyl(stair, "MedallionDisc", Vector3.new(-61.5, UP + 0.04, 260.2), 0.04, 6, "Y", team.Primary, Enum.Material.SmoothPlastic, PAINT)
	local medallion = BuildUtil.Part(stair, {
		Name = "MedallionName",
		Size = Vector3.new(5.2, 0.02, 2),
		CFrame = CFrame.new(-61.5, UP + 0.07, 260.2),
		Transparency = 1,
		CanCollide = false,
		CastShadow = false,
	})
	sign(medallion, Enum.NormalId.Top, name, team.Primary, team, { InsetX = 0.02, InsetY = 0.05, PixelsPerStud = 24 })
	-- glass rails on the open edges (the stair comes up through the south edge)
	flatRail(stair, "MezzanineRailS", MEZZ.X0, MEZZ.Z0 + 0.05, ST_W0, MEZZ.Z0 + 0.35, UP)
	flatRail(stair, "MezzanineRailW", MEZZ.X0, MEZZ.Z0 + 0.35, MEZZ.X0 + 0.3, MEZZ.Z1, UP)

	-- Step 2: the west balcony over the lobby ---------------------------------------------------------
	BuildUtil.Stage(ctx, 2)
	local balcony = BuildUtil.Child(ctx, "Balconies")
	box(balcony, "WestBalcony", WB.X0, SLAB_BOTTOM, WB.Z0, WB.X1, UP, WB.Z1, MARBLE, Enum.Material.Marble)
	box(
		balcony,
		"BalconyInlay",
		WB.X0 + 1.5,
		UP,
		WB.Z0 + 1.5,
		WB.X1 - 1.5,
		UP + 0.03,
		WB.Z0 + 2.1,
		team.Primary,
		Enum.Material.SmoothPlastic,
		PAINT
	)
	box(balcony, "BalconyFascia", WB.X0, 15, WB.Z0, WB.X1, SLAB_BOTTOM, WB.Z0 + 0.7, WHITE)
	box(balcony, "BalconyFascia", WB.X1 - 0.7, 15, WB.Z0 + 0.7, WB.X1, SLAB_BOTTOM, WB.Z1, WHITE)
	local southGlow =
		box(balcony, "BalconyGlow", WB.X0 + 0.3, 15.55, WB.Z0 - 0.08, WB.X1 - 0.3, 15.85, WB.Z0, team.Secondary, Enum.Material.Neon, PAINT)
	BuildUtil.Light(southGlow, "PointLight", { Name = "BalconyLight", Range = 20, Brightness = 1, Color = WARM_LIGHT })
	local eastGlow =
		box(balcony, "BalconyGlow", WB.X1, 15.55, WB.Z0 + 0.3, WB.X1 + 0.08, 15.85, WB.Z1 - 0.6, team.Secondary, Enum.Material.Neon, PAINT)
	BuildUtil.Light(eastGlow, "PointLight", { Name = "BalconyLight", Range = 16, Brightness = 0.8, Color = WARM_LIGHT })
	local southRail = flatRail(balcony, "BalconyRailS", WB.X0, WB.Z0 + 0.05, WB.X1, WB.Z0 + 0.35, UP)
	-- (the shell's railing guards the corridor edge between this balcony and the mezzanine)
	flatRail(balcony, "BalconyRailE", WB.X1 - 0.35, WB.Z0 + 0.35, WB.X1 - 0.05, WB.Z1, UP)
	BuildUtil.Look(
		southRail,
		"Atrium Balcony",
		"Lean on the glass and look down on the whole lobby. On game days the staff crowd up here to cheer the team bus off to the stadium!",
		{ At = Vector3.new(9, 0.2, 0), Distance = 8 }
	)
	-- lounge chairs looking over the atrium (one is a TV-style camera seat)
	for i, cx in ipairs({ -144, -135.5 }) do
		chair(balcony, frameAt(cx, 254, "S", UP), i == 1 and team.Primary or LEATHER_BROWN, {
			Width = 3,
			Depth = 2.8,
			SeatHeight = 1.6,
			BackHeight = 2.6,
			Material = Enum.Material.Leather,
			Object = i == 1 and "Atrium Cam Chair" or "Balcony Chair",
			Camera = i == 1 and {
				From = Vector3.new(-128, 30, 252),
				To = Vector3.new(-100, 4, 214),
				Fov = 60,
				Label = "ATRIUM CAM",
			} or nil,
		})
	end
	cyl(balcony, "SideTable", Vector3.new(-139.75, UP + 1, 254.4), 2, 1.6, "Y", WALNUT, Enum.Material.Wood)
	plant(balcony, -72.3, 261.4, 1, true, UP)
	box(balcony, "BalconyPlanter", -130.5, UP, 259.5, -127, UP + 1.8, 263.2, STONE, Enum.Material.Slate)
	ball(balcony, "PlanterBush", Vector3.new(-128.75, UP + 2.6, 261.4), 2.8, LEAF, Enum.Material.Grass)

	-- Step 3: the Ring of Honor banners on a rigging beam ----------------------------------------
	BuildUtil.Stage(ctx, 3)
	local banners = BuildUtil.Child(ctx, "RingOfHonor")
	local beam = box(banners, "RiggingBeam", -148.6, 33.3, 235.5, ST_W0 - 0.4, 34, 236.5, STEEL, Enum.Material.Metal)
	BuildUtil.Light(beam, "PointLight", { Name = "BannerLight", Range = 30, Brightness = 1.2, Color = WARM_LIGHT })
	local legends = {
		{ x = -136, big = "7", small = "'ROCKET' REYES\nQUARTERBACK" },
		{ x = -121, big = "22", small = "'BULLDOZER' BANKS\nRUNNING BACK" },
		{ x = -106, big = monogram(ctx), small = name .. "\nRING OF HONOR" },
		{ x = -91, big = "88", small = "'HANDS' HOLLOWAY\nWIDE RECEIVER" },
		{ x = -76, big = "55", small = "'THE WALL' WALKER\nDEFENSE" },
	}
	for i, legend in ipairs(legends) do
		local color = (i % 2 == 1) and team.Primary or team.Secondary
		if i == 3 then
			color = shade(team.Primary, 0.6)
		end
		local rodPart = honorBanner(banners, team, legend.x, 236, color, legend.big, legend.small)
		if i == 2 or i == 4 then
			BuildUtil.Light(rodPart, "PointLight", { Name = "BannerLight", Range = 18, Brightness = 0.8, Color = WARM_LIGHT })
		end
	end
	box(banners, "HonorPlaquePost", -73.1, UP, TOP_Z + 0.6, -72.3, 19.6, TOP_Z + 1.4, BRASS, Enum.Material.Metal)
	local plaque = box(banners, "HonorPlaque", -74.6, 19.6, TOP_Z + 0.7, -70.8, 21.8, TOP_Z + 1.1, WALNUT, Enum.Material.Wood)
	sign(plaque, Enum.NormalId.Back, "RING OF HONOR", WALNUT, team, { TextColor3 = GOLD, InsetX = 0.08, InsetY = 0.25 })
	BuildUtil.Look(
		plaque,
		"Ring of Honor",
		"The legends whose numbers will never be worn again: #7 'Rocket' Reyes threw a touchdown in 40 games in a row, #22 'Bulldozer' Banks never fumbled, #88 'Hands' Holloway caught everything (even a pigeon once) and #55 'The Wall' Walker sacked 30 quarterbacks in one season!",
		{ At = Vector3.new(0, 0, 0.4), Distance = 8 }
	)

	-- Step 4: the video wall on the atrium's west wall + a viewing bench --------------------------
	BuildUtil.Stage(ctx, 4)
	local video = BuildUtil.Child(ctx, "VideoWall")
	local frame = box(video, "VideoWallFrame", -150, 18.9, 208.6, -148.8, 32.5, 243.4, BLACK, Enum.Material.Metal)
	local wallBack = shade(team.Primary, 0.22)
	local screen = box(video, "VideoWallScreen", -148.85, 19.6, 209.3, -148.6, 31.8, 242.7, wallBack)
	liveScreen(screen, Enum.NormalId.Right, "summary", name .. "\nWELCOME TO TEAM HQ", {
		BackgroundColor3 = wallBack,
		TextColor3 = WHITE,
		Font = Enum.Font.GothamBlack,
		PixelsPerStud = 10,
		Padding = 0.05,
	})
	BuildUtil.Light(
		screen,
		"SurfaceLight",
		{ Name = "ScreenGlow", Face = Enum.NormalId.Right, Range = 26, Brightness = 1.5, Color = team.Primary }
	)
	local ticker = box(video, "VideoWallTicker", -149, 17.6, 208.6, -148.6, 18.85, 243.4, LED_DARK)
	liveScreen(ticker, Enum.NormalId.Right, "gameday", "NEXT GAME SOON", { TextColor3 = LED_GREEN, PixelsPerStud = 16, Padding = 0.08 })
	for _, sz in ipairs({ 205.6, 243.6 }) do
		box(video, "SpeakerStack", -150, 20, sz, -148.5, 31.6, sz + 2.8, BLACK, Enum.Material.Fabric)
	end
	BuildUtil.Look(
		frame,
		"Video Wall",
		"The biggest screen in Team HQ: your team's name, the latest score, your record and the season, live all day long.",
		{ LookKey = "season", At = Vector3.new(0.7, -5.2, 15.5), Distance = 12 }
	)
	-- a bench on the mezzanine: sit for the VIDEO WALL camera
	local benchFrame = frameAt(-67, TOP_Z + 2.4, "S", UP)
	lseat(video, benchFrame, Vector3.new(6, 0.5, 2), 0, 1.3, 0, WALNUT, Enum.Material.Wood, {
		Name = "Bench",
		Object = "Video Wall Bench",
		Camera = { From = Vector3.new(-72, 26, 222), To = Vector3.new(-148.7, 25.7, 226), Fov = 50, Label = "VIDEO WALL" },
	})
	for _, lx in ipairs({ -2.4, 2.4 }) do
		lblock(video, benchFrame, "BenchLeg", Vector3.new(0.5, 1.3, 1.8), lx, 0, 0, DARK_METAL, Enum.Material.Metal)
	end
end

---------------------------------------------------------------------------------------------
-- OWNER'S SUITE X[-248, -150]
---------------------------------------------------------------------------------------------

local OWNER_X0, OWNER_X1 = -248.5, -150
local PARTITION_W, PARTITION_E = -204.4, -203.6 -- walnut wall between the office and the lounge
local OWNER_DOOR = { From = -213, To = -205 }
local BALCONY_DOOR_Z0, BALCONY_DOOR_Z1 = 251, 257

-- A trophy standing on y0 at (x, z): "cup", "ball" (silver football), "helmet", "gameball".
local function trophy(ctx, team, kind, x, y0, z, scale)
	scale = scale or 1
	if kind == "cup" then
		cyl(ctx, "TrophyBase", Vector3.new(x, y0 + 0.35 * scale, z), 0.7 * scale, 1.4 * scale, "Y", WALNUT_DARK, Enum.Material.Wood)
		return cyl(ctx, "TrophyCup", Vector3.new(x, y0 + 1.4 * scale, z), 1.4 * scale, 1.3 * scale, "Y", GOLD, Enum.Material.Metal, {
			Reflectance = 0.2,
		})
	elseif kind == "ball" then
		cyl(ctx, "TrophyStem", Vector3.new(x, y0 + 0.6 * scale, z), 1.2 * scale, 0.5 * scale, "Y", SILVER, Enum.Material.Metal)
		return ball(
			ctx,
			"TrophyFootball",
			Vector3.new(x, y0 + 1.75 * scale, z),
			1.2 * scale,
			SILVER,
			Enum.Material.Metal,
			{ Reflectance = 0.3 }
		)
	elseif kind == "helmet" then
		box(
			ctx,
			"Facemask",
			x + 0.6 * scale,
			y0 + 0.3 * scale,
			z - 0.6 * scale,
			x + 0.8 * scale,
			y0 + 0.65 * scale,
			z + 0.6 * scale,
			CHROME,
			Enum.Material.Metal
		)
		return ball(
			ctx,
			"Helmet",
			Vector3.new(x, y0 + 0.75 * scale, z),
			1.5 * scale,
			team.Primary,
			Enum.Material.SmoothPlastic,
			{ Reflectance = 0.15 }
		)
	end
	return ball(ctx, "GameBall", Vector3.new(x, y0 + 0.45 * scale, z), 0.9 * scale, FOOTBALL, Enum.Material.Leather)
end

-- A framed jersey (drawn) on the west wall, facing +X.
local function framedJersey(ctx, team, z0, z1, number)
	local frame = box(ctx, "FramedJersey", -247.7, 19.6, z0, -247.3, 26.6, z1, WALNUT_DARK, Enum.Material.Wood)
	local w, h = z1 - z0, 7
	local gui = canvas(frame, Enum.NormalId.Right, 16, Color3.fromRGB(30, 32, 38), 1)
	local jx, jw = w * 0.22, w * 0.56
	guiFrame(gui, jx, h * 0.18, jw, h * 0.66, team.Primary)
	guiFrame(gui, jx - w * 0.14, h * 0.18, w * 0.16, h * 0.22, team.Primary, -20)
	guiFrame(gui, jx + jw - w * 0.02, h * 0.18, w * 0.16, h * 0.22, team.Primary, 20)
	guiDot(gui, w / 2, h * 0.18, w * 0.16, Color3.fromRGB(30, 32, 38))
	guiText(gui, jx, h * 0.34, jw, h * 0.4, number, textColorOn(team.Primary, team), Enum.Font.GothamBlack)
	return frame
end

function M.hq_owner(ctx)
	local team = ctx.colors
	local name = teamLabel(ctx)

	-- Step 1: walls, partition, atrium window wall, doors ----------------------------------------
	BuildUtil.Stage(ctx, 1)
	local shell = BuildUtil.Child(ctx, "OwnerSuite")
	roomShell(shell, {
		MinX = OWNER_X0,
		MaxX = OWNER_X1,
		Walls = { { OWNER_X0, -247.7 } },
		Openings = { OWNER_DOOR },
		WallColor = CREAM,
		FloorColor = Color3.fromRGB(128, 88, 56),
		FloorMaterial = Enum.Material.WoodPlanks,
		CeilingColor = CREAM,
		DoorColor = WALNUT,
		TrimColor = GOLD,
		DoorSign = "OWNER'S SUITE",
		DoorObject = "Owner's Suite",
		DoorTitle = "Owner's Suite",
		DoorInfo = "The private office of the team's owner. Knock first... or don't, you're the owner!",
		Lights = {
			{ -226, 216, 12, 4 },
			{ -226, 236, 12, 4 },
			{ -226, 254, 12, 4 },
			{ -177, 216, 12, 4 },
			{ -177, 236, 12, 4 },
			{ -177, 254, 12, 4 },
		},
	})
	-- the east wall (atrium side): solid in front of the video wall, glass behind it with a
	-- sliding glass door onto the atrium's west balcony
	local ex0, ex1 = -150.8, OWNER_X1
	box(shell, "EastWall", ex0, UP, FRONT_Z, ex1, WT, 245.5, CREAM, Enum.Material.Plaster)
	box(shell, "EastWallHead", ex0, 27.4, 245.5, ex1, WT, CW_IN, CREAM, Enum.Material.Plaster)
	box(shell, "EastWallSill", ex0, UP, 245.5, ex1, 18.4, BALCONY_DOOR_Z0 - 0.3, CREAM, Enum.Material.Plaster)
	box(shell, "EastWallSill", ex0, UP, BALCONY_DOOR_Z1 + 0.3, ex1, 18.4, CW_IN, CREAM, Enum.Material.Plaster)
	box(shell, "AtriumWindow", -150.6, 18.4, 245.5, -150.2, 27.4, BALCONY_DOOR_Z0 - 0.3, GLASS, Enum.Material.Glass, GLASS_PROPS)
	box(shell, "AtriumWindow", -150.6, 18.4, BALCONY_DOOR_Z1 + 0.3, -150.2, 27.4, CW_IN, GLASS, Enum.Material.Glass, GLASS_PROPS)
	box(shell, "Transom", -150.6, FT + 8.85, BALCONY_DOOR_Z0, -150.2, 27.4, BALCONY_DOOR_Z1, GLASS, Enum.Material.Glass, GLASS_PROPS)
	for _, jz in ipairs({ BALCONY_DOOR_Z0 - 0.3, BALCONY_DOOR_Z1 }) do
		box(shell, "DoorJamb", ex0, UP, jz, ex1, 27.4, jz + 0.3, GOLD, Enum.Material.Metal)
	end
	BuildUtil.Door(shell, {
		Name = "BalconyDoor",
		Size = Vector3.new(BALCONY_DOOR_Z1 - BALCONY_DOOR_Z0, 8.7, 0.3),
		CFrame = CFrame.new(-150.4, FT + 0.05 + 4.35, (BALCONY_DOOR_Z0 + BALCONY_DOOR_Z1) / 2) * CFrame.Angles(0, math.pi / 2, 0),
		Slide = true,
		Color = GLASS,
		Material = Enum.Material.Glass,
		Transparency = 0.45,
		Object = "Balcony Door",
		Title = "Owner's Balcony",
		Info = "Step out onto the atrium balcony and wave to everybody in the lobby!",
		Distance = 8,
	})
	-- the walnut partition between the office (west) and the lounge (east)
	box(shell, "Partition", PARTITION_W, UP, 218, PARTITION_E, WT, 250, WALNUT, Enum.Material.Wood)
	-- team-colour crown bands along the top of the corridor wall and the east wall
	box(shell, "CrownBand", -247.7, 27.7, CW_IN - 0.3, ex0, WT, CW_IN, team.Primary)
	box(shell, "CrownBand", ex0 - 0.3, 27.7, FRONT_Z, ex0, WT, 245.5, team.Primary)
	-- the owner's live name plate beside the door (corridor side)
	local plate = box(shell, "OwnerPlate", -203.8, 20.6, CW_OUT, -197.2, 22.6, CW_OUT + 0.2, LED_DARK)
	liveScreen(plate, Enum.NormalId.Back, "owner", "OWNER", { TextColor3 = GOLD, PixelsPerStud = 24, Padding = 0.1 })

	-- Step 2: the owner's desk ----------------------------------------------------------------
	BuildUtil.Stage(ctx, 2)
	local office = BuildUtil.Child(ctx, "OwnerOffice")
	box(office, "OfficeRug", -245, FT, 222, -219, FT + 0.04, 246, shade(team.Primary, 0.55), Enum.Material.Carpet, PAINT)
	box(office, "RugBorder", -245, FT + 0.04, 222, -219, FT + 0.06, 222.8, GOLD, Enum.Material.Carpet, PAINT)
	local deskTop = box(office, "DeskTop", -238.6, FT + 2.7, 227.5, -233.8, FT + 3, 240.5, WALNUT, Enum.Material.Wood)
	for _, pz in ipairs({ 228, 236.8 }) do
		box(office, "DeskPedestal", -238.3, FT, pz, -234.2, FT + 2.7, pz + 3.2, WALNUT_DARK, Enum.Material.Wood)
	end
	local deskFront = box(office, "DeskFront", -234.6, FT + 0.5, 231.2, -234.2, FT + 2.7, 236.8, team.Primary)
	box(office, "DeskInlay", -234.22, FT + 2.15, 231.2, -234.1, FT + 2.4, 236.8, GOLD, Enum.Material.Metal, PAINT)
	BuildUtil.Look(deskFront, "Owner's Desk", "The big desk where the owner signs the biggest deals in team history.", {
		LookKey = "owner",
		At = Vector3.new(0.4, 0.4, 0),
		Distance = 8,
	})
	officeChair(office, frameAt(-241, 234, "E"), LEATHER_BLACK, {
		Object = "Owner's Chair",
		BackHeight = 4,
		Camera = { From = Vector3.new(-236, 24.6, 234), To = Vector3.new(-204.4, 23.2, 234), Fov = 45, Label = "OWNER'S OFFICE" },
	})
	-- the desk nameplate (live owner name) facing the guests
	local nameplate = box(office, "Nameplate", -234.75, FT + 3, 232.4, -234.35, FT + 3.75, 235.6, LED_DARK)
	liveScreen(nameplate, Enum.NormalId.Right, "owner", "OWNER", { TextColor3 = GOLD, PixelsPerStud = 40, Padding = 0.08 })
	-- monitor (faces the owner), game ball on a stand, phone
	local monitor = box(office, "Monitor", -237.9, FT + 3.5, 236.2, -237.7, FT + 5.3, 239.4, SCREEN)
	screenText(monitor, Enum.NormalId.Left, "TICKETS: SOLD OUT!", SCREEN_BLUE, WHITE, { PixelsPerStud = 30 })
	box(office, "MonitorStand", -238, FT + 3, 237.5, -237.6, FT + 3.5, 238.1, DARK_METAL, Enum.Material.Metal)
	cyl(office, "BallStand", Vector3.new(-236.2, FT + 3.15, 229.4), 0.3, 0.9, "Y", GOLD, Enum.Material.Metal)
	ball(office, "GameBall", Vector3.new(-236.2, FT + 3.75, 229.4), 0.95, FOOTBALL, Enum.Material.Leather)
	box(office, "DeskPhone", -237.6, FT + 3, 231.2, -236.6, FT + 3.35, 232.4, BLACK)
	-- guest chairs facing the owner
	for _, gz in ipairs({ 231, 237 }) do
		chair(office, frameAt(-229.8, gz, "W"), LEATHER_BROWN, {
			Width = 2.6,
			Depth = 2.4,
			SeatHeight = 1.7,
			BackHeight = 2.6,
			Material = Enum.Material.Leather,
			Object = "Guest Chair",
		})
	end
	-- live record + season screens on the partition, facing the desk
	local record = box(office, "RecordScreen", -204.75, 19.8, 227, PARTITION_W, 26.4, 241, LED_DARK)
	liveScreen(record, Enum.NormalId.Left, "record", "RECORD 0-0", { PixelsPerStud = 16, Padding = 0.12 })
	local season = box(office, "SeasonScreen", -204.75, 18.3, 229, PARTITION_W, 19.5, 239, LED_DARK)
	liveScreen(season, Enum.NormalId.Left, "season", "SEASON 1 - WEEK 1", { TextColor3 = LED_GREEN, PixelsPerStud = 20, Padding = 0.1 })
	-- bookcase along the corridor wall, a globe and a tree
	local shelf = box(office, "Bookcase", -246.6, FT, 260.4, -231.4, FT + 9, CW_IN, WALNUT_DARK, Enum.Material.Wood)
	local books = canvas(shelf, Enum.NormalId.Front, 10, WALNUT_DARK, 1)
	local bookColors = { team.Primary, team.Secondary, Color3.fromRGB(150, 40, 40), Color3.fromRGB(40, 80, 140), OAK, BOARD_WHITE }
	for row = 0, 3 do
		local y = 0.4 + row * 2.2
		guiFrame(books, 0, y + 1.75, 15.2, 0.2, WALNUT)
		local bx = 0.4
		local n = 0
		while bx < 14.4 do
			n += 1
			local bw = 0.35 + ((n * 7 + row * 3) % 4) * 0.12
			local bh = 1.2 + ((n * 5 + row) % 3) * 0.17
			guiFrame(books, bx, y + 1.75 - bh, bw, bh, bookColors[(n + row) % #bookColors + 1])
			bx += bw + 0.05
		end
	end
	BuildUtil.Look(
		shelf,
		"Owner's Bookshelf",
		"Playbooks, scouting reports, the team's history in 12 volumes... and one very well-read copy of 'Football for Beginners'.",
		{ At = Vector3.new(0, -2, -1.4), Distance = 8 }
	)
	cyl(office, "GlobeStand", Vector3.new(-244, FT + 1.6, 207), 3.2, 0.5, "Y", BRASS, Enum.Material.Metal)
	ball(office, "Globe", Vector3.new(-244, FT + 4.1, 207), 2.4, Color3.fromRGB(70, 130, 190), Enum.Material.SmoothPlastic)
	plant(office, -207.5, 205, 1, true)
	BuildUtil.Look(deskTop, "Game Ball", "The game ball from the franchise's very first win, signed by the whole team.", {
		At = Vector3.new(0, 0.9, -4.6),
		Distance = 7,
	})

	-- Step 3: the trophy wall -------------------------------------------------------------------
	BuildUtil.Stage(ctx, 3)
	local trophies = BuildUtil.Child(ctx, "TrophyWall")
	box(trophies, "TrophyWallBack", -247.7, FT, 213, -247.2, 28.4, 255, WALNUT, Enum.Material.Wood)
	box(trophies, "DisplayCabinet", -247.2, FT, 214, -245, 19.4, 254, WALNUT_DARK, Enum.Material.Wood)
	local cabinetTop = box(trophies, "CabinetTop", -247.2, 19.4, 214, -244.8, 19.6, 254, MARBLE, Enum.Material.Marble)
	BuildUtil.Light(cabinetTop, "PointLight", { Name = "TrophyLight", Range = 12, Brightness = 1.2, Color = WARM_LIGHT })
	for _, sy in ipairs({ 22.25, 24.95 }) do
		local glassShelf =
			box(trophies, "GlassShelf", -247.2, sy, 214, -245, sy + 0.15, 254, GLASS, Enum.Material.Glass, { Transparency = 0.35 })
		BuildUtil.Light(glassShelf, "PointLight", { Name = "TrophyLight", Range = 10, Brightness = 1, Color = WARM_LIGHT })
	end
	local header = box(trophies, "ChampionshipsHeader", -247.2, 26.6, 214, -246.8, 28.2, 254, LED_DARK)
	liveScreen(header, Enum.NormalId.Right, "titles", "CHAMPIONSHIPS: 0", { TextColor3 = GOLD, PixelsPerStud = 16, Padding = 0.1 })
	BuildUtil.Look(
		header,
		"Trophy Wall",
		"Every trophy your team wins ends up right here: championship cups, game balls and helmets from the biggest wins. Win the title game to add another!",
		{ LookKey = "titles", At = Vector3.new(1.2, -6.5, 0), Distance = 9 }
	)
	local tx = -246.1
	local rows = {
		{ y = 19.6, items = { { "cup", 218 }, { "helmet", 226 }, { "ball", 234, 1.5 }, { "helmet", 242 }, { "cup", 250 } } },
		{ y = 22.4, items = { { "ball", 220 }, { "gameball", 228 }, { "cup", 240 }, { "gameball", 248 } } },
		{ y = 25.1, items = { { "gameball", 222 }, { "cup", 230, 0.75 }, { "gameball", 238 }, { "cup", 246, 0.75 } } },
	}
	for _, row in ipairs(rows) do
		for _, item in ipairs(row.items) do
			trophy(trophies, team, item[1], tx, row.y, item[2], item[3])
		end
	end
	framedJersey(trophies, team, 204.5, 211, "1")
	framedJersey(trophies, team, 256, 260, "12")

	-- Step 4: the lounge, the mini-bar and the Owner's Box deck ----------------------------------
	BuildUtil.Stage(ctx, 4)
	local lounge = BuildUtil.Child(ctx, "OwnerLounge")
	box(lounge, "LoungeRug", -200, FT, 223, -176, FT + 0.04, 245, team.Secondary, Enum.Material.Carpet, PAINT)
	box(lounge, "LoungeRug", -199, FT + 0.04, 224, -177, FT + 0.07, 244, shade(team.Primary, 0.6), Enum.Material.Carpet, PAINT)
	local tv = box(lounge, "LoungeTV", PARTITION_E, 20.6, 227.5, PARTITION_E + 0.35, 26.4, 240.5, LED_DARK)
	liveScreen(tv, Enum.NormalId.Right, "score", name .. " vs VISITORS", { TextColor3 = WHITE, PixelsPerStud = 16, Padding = 0.1 })
	box(lounge, "Fireplace", PARTITION_E, FT, 229, -202.4, 19.9, 239, STONE, Enum.Material.Slate)
	box(lounge, "Firebox", -202.45, FT + 0.4, 231, -202.35, FT + 2.2, 237, BLACK, Enum.Material.SmoothPlastic, PAINT)
	local flames = box(lounge, "Flames", -202.36, FT + 0.5, 231.5, -202.3, FT + 1.8, 236.5, FLAME, Enum.Material.Neon, PAINT)
	BuildUtil.Light(flames, "PointLight", { Name = "FireGlow", Range = 14, Brightness = 1.4, Color = FLAME })
	sofa(lounge, frameAt(-189, 234, "W"), 14, Color3.fromRGB(96, 100, 112), shade(team.Primary, 0.85), {
		Object = "Lounge Sofa",
		Camera = { From = Vector3.new(-192, 23.4, 234), To = Vector3.new(-203.3, 23.4, 234), Fov = 50, Label = "OWNER'S LOUNGE TV" },
	})
	for _, a in ipairs({ { 224.5, "N" }, { 243.5, "S" } }) do
		chair(lounge, frameAt(-197.5, a[1], a[2]), team.Secondary, {
			Width = 3,
			Depth = 2.8,
			SeatHeight = 1.6,
			BackHeight = 2.4,
			Material = Enum.Material.Leather,
			Object = "Armchair",
		})
	end
	box(lounge, "CoffeeTableBase", -198, FT, 232, -194, FT + 1.4, 236, BLACK)
	box(
		lounge,
		"CoffeeTable",
		-198.6,
		FT + 1.4,
		231.2,
		-193.4,
		FT + 1.7,
		236.8,
		Color3.fromRGB(30, 30, 34),
		Enum.Material.Glass,
		{ Reflectance = 0.1 }
	)
	-- the owner's mini-bar along the corridor wall
	box(lounge, "BarCounter", -196, FT, 255, -184, FT + 3.4, 257.5, WALNUT, Enum.Material.Wood)
	box(lounge, "BarTop", -196.3, FT + 3.4, 254.7, -183.7, FT + 3.7, 257.8, MARBLE, Enum.Material.Marble)
	local backBar = box(lounge, "BackBar", -196, FT, 261.6, -186, FT + 7.2, CW_IN, WALNUT_DARK, Enum.Material.Wood)
	local bottles = canvas(backBar, Enum.NormalId.Front, 12, WALNUT_DARK, 1)
	for row = 0, 1 do
		local y = 3.6 + row * 1.8
		guiFrame(bottles, 0.2, y + 1.3, 9.6, 0.12, BRASS)
		for b = 0, 11 do
			local c = ({ Color3.fromRGB(90, 160, 90), Color3.fromRGB(200, 120, 50), Color3.fromRGB(80, 120, 200), team.Secondary })[(b + row) % 4 + 1]
			guiFrame(bottles, 0.5 + b * 0.78, y + 0.25, 0.42, 1.05, c)
		end
	end
	guiText(bottles, 0.6, 0.5, 8.8, 1.2, "THE OWNER'S CLUB", GOLD, Enum.Font.GothamBlack)
	local shelfGlow = box(lounge, "BarGlow", -195.7, FT + 6.9, 261.5, -186.3, FT + 7.1, 261.6, team.Secondary, Enum.Material.Neon, PAINT)
	BuildUtil.Light(shelfGlow, "PointLight", { Name = "BarLight", Range = 12, Brightness = 1, Color = WARM_LIGHT })
	local fridge = box(lounge, "DrinksFridge", -184.6, FT, 259.6, -181.4, FT + 5.6, CW_IN, SILVER, Enum.Material.Metal)
	local fridgeDoor = box(lounge, "FridgeDoor", -184.4, FT + 0.4, 259.48, -181.6, FT + 5.3, 259.6, GLASS, Enum.Material.Glass, PAINT)
	local cans = canvas(fridgeDoor, Enum.NormalId.Front, 20, Color3.fromRGB(200, 230, 245), 0.4)
	for row = 0, 3 do
		for c = 0, 4 do
			local cc = ({ Color3.fromRGB(220, 40, 40), team.Primary, Color3.fromRGB(60, 180, 80), team.Secondary })[(row + c) % 4 + 1]
			guiFrame(cans, 0.25 + c * 0.5, 0.3 + row * 1.15, 0.36, 0.7, cc)
		end
	end
	BuildUtil.Use(lounge, fridge, "soda", {
		Object = "Owner's Fridge",
		Title = "Owner's Fridge",
		Info = "Ice-cold sodas, only for the owner and VIP guests. That's you!",
		At = Vector3.new(0, 0, -1.8),
		Distance = 8,
	})
	for i, sx in ipairs({ -194, -190, -186 }) do
		local stoolFrame = frameAt(sx, 253.2, "N")
		cyl(lounge, "StoolPost", Vector3.new(sx, FT + 1.3, 253.2), 2.6, 0.35, "Y", CHROME, Enum.Material.Metal)
		lseat(lounge, stoolFrame, Vector3.new(1.7, 0.4, 1.7), 0, 2.6, 0, LEATHER_BLACK, Enum.Material.Leather, {
			Name = "BarStool",
			Object = "Bar Stool",
			NoPrompt = i ~= 2,
		})
	end
	-- the OWNER'S BOX: a raised deck at the front window wall, looking at the stadium
	local deckTop = FT + 0.5
	box(lounge, "OwnersBoxDeck", -199, UP, FRONT_Z, -153, deckTop, 210.6, DECK_WOOD, Enum.Material.WoodPlanks)
	for _, seg in ipairs({ { -199, -180 }, { -172, -153 } }) do
		flatRail(lounge, "DeckRail", seg[1], 210.25, seg[2], 210.55, deckTop)
	end
	for i, rx in ipairs({ -184, -168 }) do
		local f = frameAt(rx, 205.4, "S", deckTop)
		lseat(lounge, f, Vector3.new(3, 1.4, 3), 0, 0, 0, LEATHER_BROWN, Enum.Material.Leather, {
			Name = "Recliner",
			Object = i == 1 and "Owner's Box Recliner" or "Recliner",
			Camera = i == 1 and {
				From = Vector3.new(-176, 25, 199),
				To = Vector3.new(0, 34, -90),
				Fov = 55,
				Label = "OWNER'S BOX - STADIUM VIEW",
			} or nil,
			NoPrompt = i ~= 1,
		})
		lblock(lounge, f, "ReclinerBack", Vector3.new(3, 3.2, 0.8), 0, 0.6, 1.8, LEATHER_BROWN, Enum.Material.Leather)
		lblock(lounge, f, "ReclinerFootrest", Vector3.new(2.6, 0.9, 1.4), 0, 0, -2.4, LEATHER_BROWN, Enum.Material.Leather)
	end
	cyl(lounge, "DeckSideTable", Vector3.new(-176, deckTop + 1, 205.4), 2, 1.8, "Y", WALNUT, Enum.Material.Wood)
	-- a brass telescope aimed at the stadium
	box(lounge, "TelescopeTripod", -158.2, deckTop, 205.3, -157.8, deckTop + 4, 205.7, DARK_METAL, Enum.Material.Metal)
	local scope = rod(
		lounge,
		"Telescope",
		Vector3.new(-159.6, deckTop + 4.2, 207.2),
		Vector3.new(-156.2, deckTop + 4.9, 202.6),
		0.6,
		BRASS,
		Enum.Material.Metal
	)
	BuildUtil.Look(
		scope,
		"Stadium Telescope",
		"Zoom in on your stadium from the Owner's Box! On a clear day you can count the seats... all 72,000 of them.",
		{ Distance = 8 }
	)
end

---------------------------------------------------------------------------------------------
-- MEDIA STUDIO X[-50, 0]
---------------------------------------------------------------------------------------------

local MEDIA_DOOR = { From = -19, To = -12 }

-- A studio camera on a pedestal at (x, z), lens toward -Z.
local function studioCamera(ctx, team, x, z, prompter)
	cyl(ctx, "CameraBase", Vector3.new(x, FT + 0.25, z), 0.5, 2.6, "Y", DARK_METAL, Enum.Material.Metal)
	cyl(ctx, "CameraColumn", Vector3.new(x, FT + 2.2, z), 3.4, 0.55, "Y", DARK_METAL, Enum.Material.Metal)
	local body = box(ctx, "CameraBody", x - 0.8, FT + 3.9, z - 1.2, x + 0.8, FT + 5.4, z + 1.4, BLACK)
	box(ctx, "CameraStripe", x - 0.82, FT + 4.5, z - 1, x + 0.82, FT + 4.75, z + 1.2, team.Primary, Enum.Material.SmoothPlastic, PAINT)
	cyl(ctx, "CameraLens", Vector3.new(x, FT + 4.65, z - 1.8), 1.2, 1, "Z", DARK_METAL, Enum.Material.Metal)
	if prompter then
		box(ctx, "Teleprompter", x - 1, FT + 3.8, z - 2.5, x + 1, FT + 5.5, z - 2.42, GLASS, Enum.Material.Glass, { Transparency = 0.4 })
	end
	return body
end

function M.hq_media(ctx)
	local team = ctx.colors
	local name = teamLabel(ctx)
	local X0, X1 = -50, 0

	-- Step 1: studio walls, acoustic panels, lighting grid, door + ON AIR ----------------------
	BuildUtil.Stage(ctx, 1)
	local studio = BuildUtil.Child(ctx, "Studio")
	roomShell(studio, {
		MinX = X0,
		MaxX = X1,
		Walls = { { -0.8, X1 } },
		Openings = { MEDIA_DOOR },
		WallColor = STUDIO_BLACK,
		WallMaterial = Enum.Material.SmoothPlastic,
		FloorColor = STUDIO_FLOOR,
		FloorMaterial = Enum.Material.Concrete,
		CeilingColor = STUDIO_BLACK,
		DoorColor = DARK_METAL,
		DoorWindow = true,
		DoorSign = "MEDIA STUDIO",
		DoorObject = "Media Studio",
		Lights = { { -28, 250, 10, 4 }, { -10, 236, 6, 4 } },
	})
	-- the west wall faces the atrium: a team-colour studio box with a window (watch the shows
	-- from the grand staircase) and TEAM TV lettering
	local skin = shade(team.Primary, 0.45)
	box(studio, "SideWall", X0, UP, FRONT_Z, -49.2, WT, 214, skin)
	box(studio, "SideWall", X0, UP, 246, -49.2, WT, CW_IN, skin)
	box(studio, "WindowSill", X0, UP, 214, -49.2, 20.4, 246, skin)
	local head = box(studio, "WindowHead", X0, 26.4, 214, -49.2, WT, 246, skin)
	sign(head, Enum.NormalId.Left, name .. " TEAM TV", skin, team, { InsetX = 0.08, InsetY = 0.16 })
	box(studio, "WindowGlow", X0 - 0.08, 20.15, 214, X0, 20.4, 246, team.Secondary, Enum.Material.Neon, PAINT)
	local strip = box(studio, "StudioGlow", -0.85, 27.5, FRONT_Z + 0.5, -0.8, 27.7, CW_IN - 0.5, team.Secondary, Enum.Material.Neon, PAINT)
	BuildUtil.Light(strip, "PointLight", { Name = "StudioGlow", Range = 14, Brightness = 0.6, Color = team.Secondary })
	box(studio, "StudioWindow", -49.85, 20.4, 214, -49.35, 26.4, 246, GLASS, Enum.Material.Glass, GLASS_PROPS)
	for _, mz in ipairs({ 224.7, 235.3 }) do
		box(studio, "Mullion", -49.95, 20.4, mz - 0.15, -49.25, 26.4, mz + 0.15, DARK_METAL, Enum.Material.Metal)
	end
	-- the ON AIR light beside the door (corridor side)
	local onAir = box(studio, "OnAirSign", -10.8, 22.6, CW_OUT, -6.4, 24.4, CW_OUT + 0.35, ON_AIR_RED, Enum.Material.Neon)
	sign(onAir, Enum.NormalId.Back, "ON AIR", ON_AIR_RED, team, { TextColor3 = WHITE, InsetX = 0.1, InsetY = 0.16, LightInfluence = 0 })
	BuildUtil.Light(onAir, "PointLight", { Name = "OnAirGlow", Range = 8, Brightness = 1, Color = ON_AIR_RED })
	-- acoustic panels (team-tinted fabric)
	local panelColor = shade(team.Primary, 0.45)
	box(studio, "AcousticPanel", -1.25, 19.2, 238, -0.8, 27.2, 260, panelColor, Enum.Material.Fabric)
	box(studio, "AcousticPanel", -1.25, 19.2, 222, -0.8, 27.2, 236, panelColor, Enum.Material.Fabric)
	box(studio, "AcousticPanel", -49.2, 19.2, 247.5, -48.75, 27.2, 261, panelColor, Enum.Material.Fabric)
	-- lighting grid: two pipes with spotlight cans
	for _, gz in ipairs({ 212, 226 }) do
		cyl(studio, "LightingPipe", Vector3.new(-25, 27.9, gz), 46, 0.3, "X", DARK_METAL, Enum.Material.Metal)
		for _, gx in ipairs({ -36, -20 }) do
			local can = cyl(studio, "SpotCan", Vector3.new(gx, 27.1, gz), 1.2, 1, "Y", BLACK, Enum.Material.Metal)
			BuildUtil.Light(can, "SpotLight", {
				Name = "StudioSpot",
				Face = Enum.NormalId.Left, -- a Y cylinder's local -X points down
				Angle = 60,
				Range = 22,
				Brightness = 2,
				Color = WARM_LIGHT,
			})
		end
	end

	-- Step 2: the podcast table -------------------------------------------------------------------
	BuildUtil.Stage(ctx, 2)
	local podcast = BuildUtil.Child(ctx, "Podcast")
	local cx, cz = -28, 249
	cyl(podcast, "PodcastRug", Vector3.new(cx, FT + 0.02, cz), 0.04, 16, "Y", shade(team.Primary, 0.7), Enum.Material.Carpet, PAINT)
	local tableTop = cyl(podcast, "PodcastTable", Vector3.new(cx, FT + 2.75, cz), 0.3, 8, "Y", WALNUT, Enum.Material.Wood)
	cyl(podcast, "TablePedestal", Vector3.new(cx, FT + 1.3, cz), 2.6, 1.4, "Y", DARK_METAL, Enum.Material.Metal)
	local seats = {
		{ x = cx, z = cz + 5.6, host = true },
		{ x = cx + 5.6, z = cz },
		{ x = cx, z = cz - 5.6 },
		{ x = cx - 5.6, z = cz },
	}
	for _, s in ipairs(seats) do
		local f = CFrame.lookAt(Vector3.new(s.x, FT, s.z), Vector3.new(cx, FT, cz))
		officeChair(podcast, f, s.host and team.Primary or LEATHER_BLACK, {
			Object = s.host and "Podcast Host Chair" or "Podcast Guest Chair",
			Camera = s.host
					and { From = Vector3.new(cx, 22.4, cz - 6.2), To = Vector3.new(cx, 20.8, cz + 5.6), Fov = 50, Label = "PODCAST CAM" }
				or nil,
		})
		-- a microphone in front of every chair
		local dir = (Vector3.new(s.x, 0, s.z) - Vector3.new(cx, 0, cz)).Unit
		local mp = Vector3.new(cx, 0, cz) + dir * 2.8
		cyl(podcast, "MicStand", Vector3.new(mp.X, FT + 3.3, mp.Z), 0.8, 0.18, "Y", CHROME, Enum.Material.Metal)
		ball(podcast, "Microphone", Vector3.new(mp.X, FT + 3.95, mp.Z), 0.6, BLACK, Enum.Material.Fabric)
	end
	-- a live game-day tablet in the middle of the table (faces the host)
	local tablet = box(podcast, "GameDayTablet", cx - 1.3, FT + 2.9, cz + 0.1, cx + 1.3, FT + 4.3, cz + 0.3, LED_DARK)
	liveScreen(tablet, Enum.NormalId.Back, "gameday", "NEXT GAME SOON", { TextColor3 = LED_GREEN, PixelsPerStud = 40, Padding = 0.08 })
	-- the neon show sign + an ON AIR light on the acoustic panel
	local showSign = box(podcast, "ShowSign", -1.4, 21.4, 242, -1.25, 25.4, 256, BLACK)
	sign(showSign, Enum.NormalId.Left, "THE HUDDLE\nPODCAST", BLACK, team, {
		TextColor3 = team.Secondary,
		LightInfluence = 0,
		InsetX = 0.06,
		InsetY = 0.1,
		Wrap = true,
	})
	local onAirIn = box(podcast, "OnAirLight", -1.5, 25.8, 246.5, -1.25, 27, 251.5, ON_AIR_RED, Enum.Material.Neon)
	sign(onAirIn, Enum.NormalId.Left, "ON AIR", ON_AIR_RED, team, { TextColor3 = WHITE, InsetX = 0.1, InsetY = 0.16, LightInfluence = 0 })
	BuildUtil.Light(onAirIn, "PointLight", { Name = "OnAirGlow", Range = 10, Brightness = 1, Color = ON_AIR_RED })
	BuildUtil.Look(
		tableTop,
		"The Huddle Podcast",
		"Your team's own podcast! Players, coaches and super-fans pull up a chair, grab a mic and talk football for hours.",
		{ At = Vector3.new(0, 0, 0), Distance = 8 }
	)

	-- Step 3: the TV set + cameras --------------------------------------------------------------
	BuildUtil.Stage(ctx, 3)
	local set = BuildUtil.Child(ctx, "TVSet")
	local riserTop = FT + 0.6
	box(set, "SetRiser", -43, UP, 203.4, -13, riserTop, 217, Color3.fromRGB(20, 20, 24), Enum.Material.SmoothPlastic)
	box(set, "SetBackdrop", -46, UP, 202, -10, 28.4, 203.4, BLACK)
	local mainScreen = box(set, "SetScreen", -38, 19.4, 203.4, -18, 27.4, 203.6, LED_DARK)
	liveScreen(mainScreen, Enum.NormalId.Back, "score", name .. " vs VISITORS", { TextColor3 = WHITE, PixelsPerStud = 14, Padding = 0.08 })
	BuildUtil.Light(
		mainScreen,
		"SurfaceLight",
		{ Name = "SetGlow", Face = Enum.NormalId.Back, Range = 18, Brightness = 1.2, Color = team.Primary }
	)
	local left = box(set, "SetScreen", -44.8, 19.4, 203.4, -39, 27.4, 203.6, LED_DARK)
	liveScreen(left, Enum.NormalId.Back, "season", "SEASON 1", { PixelsPerStud = 20, Padding = 0.1 })
	local right = box(set, "SetScreen", -17, 19.4, 203.4, -11.2, 27.4, 203.6, LED_DARK)
	liveScreen(right, Enum.NormalId.Back, "record", "RECORD 0-0", { PixelsPerStud = 20, Padding = 0.1 })
	local band = box(set, "SetBand", -46, riserTop, 203.4, -10, 19.1, 203.6, team.Primary)
	sign(band, Enum.NormalId.Back, name .. " TEAM TV", team.Primary, team, { InsetX = 0.1, InsetY = 0.12 })
	-- the anchor desk (team colour front, white top, angled wings)
	local desk = box(set, "AnchorDesk", -32.5, riserTop, 209.5, -23.5, 21, 212.5, team.Primary)
	sign(desk, Enum.NormalId.Back, "TEAM TV", team.Primary, team, { InsetX = 0.12, InsetY = 0.22 })
	box(set, "AnchorDeskTop", -33, 21, 209.2, -23, 21.3, 212.8, WHITE)
	for _, s in ipairs({ -1, 1 }) do
		BuildUtil.Part(set, {
			Name = "AnchorDeskWing",
			Size = Vector3.new(4.6, 21.1 - riserTop, 3),
			CFrame = CFrame.new(-28 + s * 6.3, (riserTop + 21.1) / 2, 210.2) * CFrame.Angles(0, s * math.rad(28), 0),
			Color = shade(team.Primary, 0.8),
			Material = Enum.Material.SmoothPlastic,
		})
	end
	for i, ax in ipairs({ -30.6, -25.4 }) do
		officeChair(set, frameAt(ax, 207.4, "N", riserTop), i == 1 and team.Secondary or LEATHER_BLACK, {
			Object = i == 1 and "Anchor Chair" or "Co-Anchor Chair",
			Camera = i == 1
					and { From = Vector3.new(-28, 23.2, 228), To = Vector3.new(-28, 21.6, 207), Fov = 45, Label = "TEAM TV - LIVE" }
				or nil,
		})
	end
	-- three studio cameras aimed at the desk
	for i, camX in ipairs({ -38, -28, -18 }) do
		local body = studioCamera(set, team, camX, 228, i == 2)
		if i ~= 2 then
			BuildUtil.Look(
				body,
				i == 1 and "Studio Camera 1" or "Studio Camera 3",
				"A real broadcast camera. When the red light is on, smile - the whole league is watching your team's show!",
				{ Distance = 8 }
			)
		end
	end
	-- two studio lights on stands, aimed at the anchors
	for _, lx in ipairs({ -46, -10 }) do
		cyl(set, "LightStand", Vector3.new(lx, FT + 4, 222), 8, 0.3, "Y", DARK_METAL, Enum.Material.Metal)
		local head = BuildUtil.Part(set, {
			Name = "StudioLight",
			Size = Vector3.new(1.6, 1.4, 1.2),
			CFrame = CFrame.lookAt(Vector3.new(lx, FT + 8.6, 222), Vector3.new(-28, 21, 208)),
			Color = BLACK,
			Material = Enum.Material.Metal,
		})
		BuildUtil.Light(
			head,
			"SpotLight",
			{ Name = "KeyLight", Face = Enum.NormalId.Front, Angle = 45, Range = 30, Brightness = 2.5, Color = COOL_LIGHT }
		)
	end
end

---------------------------------------------------------------------------------------------
-- SCOUTING WAR ROOM X[0, 50]
---------------------------------------------------------------------------------------------

local PROSPECT_NAMES = {
	"J. CARTER",
	"M. BROOKS",
	"D. HAYES",
	"T. REED",
	"K. WALLACE",
	"R. STONE",
	"A. PRICE",
	"B. NASH",
	"C. ELLIS",
	"L. GRANT",
	"S. WEBB",
	"P. LANE",
	"V. CROSS",
	"N. HALE",
	"G. FOX",
	"H. DIAZ",
	"E. MOORE",
	"F. BANKS",
	"O. KING",
	"Y. PARK",
	"W. SHAW",
	"Z. COLE",
	"I. ROSS",
	"U. BELL",
	"Q. HUNT",
	"X. VALE",
	"D. NOLAN",
	"T. BRYCE",
	"R. ASHE",
	"M. QUINN",
}
local SCHOOLS = { "NORTHWOOD", "LAKESIDE", "PINE VALLEY", "IRONWOOD", "SUMMIT ST", "BAYSHORE", "COPPER HILLS", "MAPLE RIDGE" }
local BOARD_POSITIONS = { "QB", "RB", "WR", "OL", "DEF", "K" }
local GRADE_COLORS = {
	Color3.fromRGB(255, 212, 84),
	Color3.fromRGB(150, 200, 255),
	Color3.fromRGB(150, 224, 150),
	Color3.fromRGB(232, 232, 236),
	Color3.fromRGB(232, 232, 236),
}

function M.hq_scouting(ctx)
	local team = ctx.colors
	local X0, X1 = 0, 50

	-- Step 1: walls, frosted corridor window, door ---------------------------------------------
	BuildUtil.Stage(ctx, 1)
	local room = BuildUtil.Child(ctx, "WarRoom")
	roomShell(room, {
		MinX = X0,
		MaxX = X1,
		Walls = { { X0, 0.8 }, { 49.2, X1 } },
		Openings = { { From = 12, To = 19 }, { From = 32, To = 46, Sill = 20.4, Mullions = 1, Frosted = true } },
		WallColor = Color3.fromRGB(70, 76, 90),
		FloorColor = NAVY_CARPET,
		FloorMaterial = Enum.Material.Carpet,
		CeilingColor = Color3.fromRGB(226, 226, 222),
		DoorColor = WALNUT,
		DoorWindow = true,
		DoorSign = "SCOUTING WAR ROOM",
		DoorObject = "Scouting War Room",
		DoorTitle = "Scouting War Room",
		DoorInfo = "Top secret! Only scouts (and the owner) may enter. This is where draft day is won.",
		Lights = { { 25, 214, 12, 4 }, { 25, 233, 12, 4 }, { 25, 252, 12, 4 } },
	})
	box(room, "WallBand", 0.8, 27.7, CW_IN - 0.3, 49.2, WT, CW_IN, team.Primary)
	local secret = box(room, "ScoutsOnlySign", 20, 21.6, CW_OUT, 23.6, 23.6, CW_OUT + 0.15, Color3.fromRGB(200, 36, 36))
	sign(
		secret,
		Enum.NormalId.Back,
		"SCOUTS\nONLY",
		Color3.fromRGB(200, 36, 36),
		team,
		{ TextColor3 = WHITE, InsetX = 0.08, InsetY = 0.1, Wrap = true }
	)

	-- Step 2: the BIG BOARD on the west wall -----------------------------------------------------
	BuildUtil.Stage(ctx, 2)
	local boardModel = BuildUtil.Child(ctx, "BigBoard")
	local bz0, bz1, by0, by1 = 205, 245, 18.2, 28.2
	local board = box(boardModel, "BigBoard", 0.8, by0, bz0, 1.3, by1, bz1, BOARD_WHITE)
	local W, H = bz1 - bz0, by1 - by0
	local gui = canvas(board, Enum.NormalId.Right, 14, BOARD_WHITE, 1)
	guiFrame(gui, 0, 0, W, 1.3, team.Primary)
	guiText(gui, 0.5, 0.15, W - 1, 1, "BIG BOARD - TOP PROSPECTS", textColorOn(team.Primary, team), Enum.Font.GothamBlack)
	local colW = (W - 1) / #BOARD_POSITIONS
	local rowH = (H - 2.4) / 5
	for c, pos in ipairs(BOARD_POSITIONS) do
		local x = 0.5 + (c - 1) * colW
		guiFrame(gui, x + 0.1, 1.5, colW - 0.2, 0.6, Color3.fromRGB(40, 44, 54))
		guiText(gui, x + 0.2, 1.55, colW - 0.4, 0.5, pos, WHITE, Enum.Font.GothamBlack)
		for r = 1, 5 do
			local n = ((c - 1) * 5 + r - 1) % #PROSPECT_NAMES + 1
			local y = 2.3 + (r - 1) * rowH
			guiFrame(gui, x + 0.15, y, colW - 0.3, rowH - 0.2, GRADE_COLORS[r])
			guiFrame(gui, x + 0.15, y, 0.18, rowH - 0.2, team.Secondary)
			guiText(gui, x + 0.45, y + 0.12, colW - 0.8, (rowH - 0.2) * 0.5, PROSPECT_NAMES[n], INK, Enum.Font.GothamBold)
			guiText(
				gui,
				x + 0.45,
				y + (rowH - 0.2) * 0.58,
				colW - 0.8,
				(rowH - 0.2) * 0.32,
				SCHOOLS[(n * 3) % #SCHOOLS + 1],
				Color3.fromRGB(70, 74, 84)
			)
		end
	end
	box(boardModel, "BoardTrim", 0.8, by1, bz0 - 0.4, 1.5, by1 + 0.5, bz1 + 0.4, team.Primary)
	local trim = box(boardModel, "BoardTrim", 0.8, by0 - 0.5, bz0 - 0.4, 1.5, by0, bz1 + 0.4, team.Primary)
	BuildUtil.Light(trim, "PointLight", { Name = "BoardLight", Range = 16, Brightness = 1, Color = WARM_LIGHT })
	BuildUtil.Look(
		board,
		"The Big Board",
		"Every top college prospect, ranked by your scouts: gold cards are first-round talent! Draft day decides the future of the franchise.",
		{ LookKey = "draft", At = Vector3.new(0.6, -3, 0), Distance = 10 }
	)
	local starters = box(boardModel, "StartersScreen", 0.8, 18.8, 246.5, 1.35, 27.4, 259, LED_DARK)
	liveScreen(starters, Enum.NormalId.Right, "roster", "OUR STARTERS", { PixelsPerStud = 16, Padding = 0.08 })
	local header = box(boardModel, "StartersHeader", 0.8, 27.4, 246.5, 1.35, 28.6, 259, team.Primary)
	sign(header, Enum.NormalId.Right, "OUR STARTERS", team.Primary, team, { InsetX = 0.08, InsetY = 0.14 })
	local clock = box(boardModel, "DraftClock", 22, 26.6, 262.0, 31, 28.6, CW_IN - 0.35, LED_DARK)
	liveScreen(
		clock,
		Enum.NormalId.Front,
		"gameday",
		"ON THE CLOCK",
		{ TextColor3 = Color3.fromRGB(255, 90, 80), PixelsPerStud = 20, Padding = 0.1 }
	)

	-- Step 3: the war-room table + scout desks --------------------------------------------------
	BuildUtil.Stage(ctx, 3)
	local desks = BuildUtil.Child(ctx, "ScoutDesks")
	box(desks, "WarRoomRug", 11, FT, 220, 39, FT + 0.04, 242, shade(team.Primary, 0.7), Enum.Material.Carpet, PAINT)
	box(desks, "WarRoomTable", 15, FT + 2.7, 226.5, 35, FT + 3, 235.5, WALNUT_DARK, Enum.Material.Wood)
	for _, bx in ipairs({ 17, 31 }) do
		box(desks, "TableBase", bx, FT, 229.5, bx + 2, FT + 2.7, 232.5, DARK_METAL, Enum.Material.Metal)
	end
	for i, chairX in ipairs({ 17.5, 22.5, 27.5, 32.5 }) do
		for _, side in ipairs({ { 223.9, "N" }, { 238.1, "S" } }) do
			chair(desks, frameAt(chairX, side[1], side[2]), LEATHER_BLACK, {
				Width = 2.2,
				Depth = 2.2,
				SeatHeight = 1.8,
				BackHeight = 2.4,
				Material = Enum.Material.Leather,
				Object = "Scout's Chair",
				NoPrompt = (i % 2 == 0) == (side[2] == "N"),
			})
			-- a laptop in front of every other chair
			if (i + (side[2] == "N" and 0 or 1)) % 2 == 1 or i == 1 then
				local dz = side[2] == "N" and 1 or -1
				local lz = side[1] + dz * 3.7
				box(desks, "Laptop", chairX - 0.8, FT + 3, lz - 0.55, chairX + 0.8, FT + 3.1, lz + 0.55, DARK_METAL, Enum.Material.Metal)
				local screen =
					box(desks, "LaptopScreen", chairX - 0.8, FT + 3.1, lz + dz * 0.55, chairX + 0.8, FT + 4.1, lz + dz * 0.63, SCREEN)
				local lg = canvas(screen, side[2] == "N" and Enum.NormalId.Front or Enum.NormalId.Back, 30, Color3.fromRGB(20, 40, 70), 0)
				guiChart(lg, 0.1, 0.15, 1.4, 0.7, i + lz, team.Secondary, LED_TEXT)
			end
		end
	end
	local phone = box(desks, "DraftPhone", 33.6, FT + 3, 230.4, 34.6, FT + 3.45, 231.6, Color3.fromRGB(200, 36, 36))
	BuildUtil.Look(
		phone,
		"Draft Phone",
		"Ring ring! When your pick is up on draft day, this red phone calls the league office. Don't put them on hold!",
		{ LookKey = "draft", Distance = 7 }
	)
	-- two scout desks along the front window with monitors full of stats
	for i, dx in ipairs({ 12, 38 }) do
		box(desks, "ScoutDesk", dx - 6, FT + 2.6, 204, dx + 6, FT + 2.9, 207.6, OAK, Enum.Material.Wood)
		box(desks, "ScoutDeskPanel", dx - 5.8, FT, 204.2, dx + 5.8, FT + 2.6, 204.6, DARK_METAL, Enum.Material.Metal)
		for m = -1, 1, 2 do
			local mon = box(desks, "Monitor", dx + m * 2.1 - 1.8, FT + 3.1, 204.8, dx + m * 2.1 + 1.8, FT + 5.2, 205, SCREEN)
			local mg = canvas(mon, Enum.NormalId.Back, 24, Color3.fromRGB(18, 24, 36), 0)
			if m < 0 then
				guiFilm(mg, 3.6, 2.1, i * 3, team)
			else
				guiChart(mg, 0.2, 0.3, 3.2, 1.6, i * 5, team.Secondary, LED_GREEN)
			end
		end
		officeChair(desks, frameAt(dx, 209.8, "S"), team.Primary, { Object = "Scout's Desk Chair" })
	end

	-- Step 4: the film wall on the east wall -----------------------------------------------------
	BuildUtil.Stage(ctx, 4)
	local film = BuildUtil.Child(ctx, "FilmWall")
	local frame = box(film, "FilmWallFrame", 48.5, 18, 207, 49.2, 28.6, 253, BLACK, Enum.Material.Metal)
	local cols = { { 208, 222 }, { 223, 237 }, { 238, 252 } }
	local rowsY = { { 23.5, 28 }, { 18.6, 23.1 } }
	local live = { [2] = "score", [4] = "rating", [6] = "record" }
	local n = 0
	for r, ry in ipairs(rowsY) do
		for c, cz in ipairs(cols) do
			n += 1
			local s = box(film, "FilmScreen", 48.3, ry[1], cz[1], 48.5, ry[2], cz[2], SCREEN)
			if live[n] then
				liveScreen(s, Enum.NormalId.Left, live[n], live[n]:upper(), { PixelsPerStud = 16, Padding = 0.1 })
			else
				local g = canvas(s, Enum.NormalId.Left, 12, SCREEN, 0)
				guiFilm(g, cz[2] - cz[1], ry[2] - ry[1], n + r + c, team)
			end
		end
	end
	BuildUtil.Look(
		frame,
		"Film Wall",
		"Scouts watch every snap a prospect ever played, frame by frame. The live screens keep an eye on your own team too.",
		{ At = Vector3.new(-0.6, -4.5, 0), Distance = 10 }
	)
	local f = frameAt(42, 230, "E")
	lseat(film, f, Vector3.new(2.4, 0.4, 2.2), 0, 2.4, 0, Color3.fromRGB(30, 30, 34), Enum.Material.Fabric, {
		Name = "DirectorChair",
		Object = "Director's Chair",
		Camera = { From = Vector3.new(41, 24, 230), To = Vector3.new(48.3, 23.3, 230), Fov = 55, Label = "FILM WALL" },
	})
	lblock(film, f, "DirectorChairBack", Vector3.new(2.4, 1.6, 0.2), 0, 3.4, 1.0, team.Primary, Enum.Material.Fabric)
	lblock(film, f, "DirectorChairLegs", Vector3.new(2.2, 2.4, 2), 0, 0, 0, WALNUT, Enum.Material.Wood)
end

---------------------------------------------------------------------------------------------
-- ANALYTICS LAB X[50, 98]
---------------------------------------------------------------------------------------------

local LAB_DOOR = { From = 80, To = 87 }
local LAB_X1 = 98.2

function M.hq_analytics(ctx)
	local team = ctx.colors
	local X0 = 50

	-- Step 1: white lab, raised floor, glass corridor wall + sliding doors -----------------------
	BuildUtil.Stage(ctx, 1)
	local lab = BuildUtil.Child(ctx, "Lab")
	local floor = roomShell(lab, {
		MinX = X0,
		MaxX = LAB_X1,
		Walls = { { X0, 50.8 }, { 97.4, LAB_X1 } },
		Openings = {},
		NoCorridorWall = true,
		WallColor = LAB_WHITE,
		FloorColor = LAB_FLOOR,
		CeilingColor = LAB_WHITE,
		Lights = {},
	})
	local tiles = canvas(floor, Enum.NormalId.Top, 4, nil, 1)
	for gx = 4, 46, 4 do
		guiFrame(tiles, gx, 0, 0.1, FACE_Z - FRONT_Z, Color3.fromRGB(180, 186, 194))
	end
	for gz = 2.55, FACE_Z - FRONT_Z, 4 do
		guiFrame(tiles, 0, gz, LAB_X1 - X0, 0.1, Color3.fromRGB(180, 186, 194))
	end
	-- the all-glass corridor wall
	box(lab, "GlassWallHead", X0, 27.4, CW_IN, LAB_X1, WT, CW_OUT, LAB_WHITE)
	box(lab, "GlassWall", X0, UP, CW_IN + 0.25, LAB_DOOR.From - 0.4, 27.4, CW_OUT - 0.25, GLASS, Enum.Material.Glass, GLASS_PROPS)
	box(lab, "GlassWall", LAB_DOOR.To + 0.4, UP, CW_IN + 0.25, LAB_X1, 27.4, CW_OUT - 0.25, GLASS, Enum.Material.Glass, GLASS_PROPS)
	box(lab, "Transom", LAB_DOOR.From, DOOR_TOP, CW_IN + 0.25, LAB_DOOR.To, 27.4, CW_OUT - 0.25, GLASS, Enum.Material.Glass, GLASS_PROPS)
	for _, mx in ipairs({ 56, 62, 68, LAB_DOOR.From - 0.2, LAB_DOOR.To + 0.2, 92.6 }) do
		box(lab, "Mullion", mx - 0.2, UP, CW_IN, mx + 0.2, 27.4, CW_OUT, DARK_METAL, Enum.Material.Metal)
	end
	local stripe =
		box(lab, "GlassStripe", X0 + 0.5, 21, CW_OUT - 0.26, LAB_X1 - 0.5, 21.4, CW_OUT - 0.2, team.Secondary, Enum.Material.Neon, PAINT)
	stripe.Transparency = 0.3
	BuildUtil.Door(lab, {
		Name = "LabDoor",
		Size = Vector3.new(LAB_DOOR.To - LAB_DOOR.From, DOOR_H, 0.3),
		CFrame = CFrame.new((LAB_DOOR.From + LAB_DOOR.To) / 2, FT + 0.05 + DOOR_H / 2, DOOR_Z),
		Double = true,
		Slide = true,
		Color = GLASS,
		Material = Enum.Material.Glass,
		Transparency = 0.4,
		Object = "Analytics Lab",
		Title = "Analytics Lab",
		Info = "Numbers win games! The analytics team turns every snap into stats.",
		Distance = 8,
	})
	local labSign = box(lab, "DoorSign", LAB_DOOR.From - 3, 27.5, CW_OUT, LAB_DOOR.To + 3, 28.8, CW_OUT + 0.2, team.Primary)
	sign(labSign, Enum.NormalId.Back, "ANALYTICS LAB", team.Primary, team, { InsetX = 0.05, InsetY = 0.12 })
	-- LED light strips in the ceiling
	for _, lx in ipairs({ 61, 74, 88 }) do
		local strip = box(lab, "CeilingLightStrip", lx - 0.4, WT - 0.15, 206, lx + 0.4, WT, 258, COOL_LIGHT, Enum.Material.Neon, PAINT)
		BuildUtil.Light(strip, "PointLight", { Name = "LabLight", Range = 30, Brightness = 1.2, Color = COOL_LIGHT })
	end

	-- Step 2: computer desks + server racks -----------------------------------------------------
	BuildUtil.Stage(ctx, 2)
	local desks = BuildUtil.Child(ctx, "ComputerDesks")
	for r, rowX in ipairs({ 72, 85 }) do
		box(desks, "DeskRow", rowX - 1.5, FT + 2.5, 212, rowX + 1.5, FT + 2.8, 250, LAB_WHITE)
		for _, ez in ipairs({ 212.3, 249.7 }) do
			box(desks, "DeskEnd", rowX - 1.4, FT, ez - 0.3, rowX + 1.4, FT + 2.5, ez + 0.3, DARK_METAL, Enum.Material.Metal)
		end
		for w, wz in ipairs({ 216.5, 226, 236, 245.5 }) do
			local mon = box(desks, "DualMonitor", rowX + 0.6, FT + 3, wz - 2.2, rowX + 0.8, FT + 4.9, wz + 2.2, SCREEN)
			local g = canvas(mon, Enum.NormalId.Left, 24, Color3.fromRGB(14, 22, 38), 0)
			guiChart(g, 0.15, 0.2, 2, 1.5, r * 4 + w, CYAN, LED_TEXT)
			guiChart(g, 2.35, 0.2, 1.9, 1.5, r * 7 + w, team.Secondary, LED_GREEN)
			chair(desks, frameAt(rowX - 2.8, wz, "E"), (w % 2 == 0) and team.Primary or Color3.fromRGB(60, 64, 72), {
				Width = 2.2,
				Depth = 2.2,
				SeatHeight = 1.8,
				BackHeight = 2.8,
				Material = Enum.Material.Fabric,
				Object = (r == 2 and w == 3) and "Data Wall Chair" or "Analyst's Chair",
				NoPrompt = w % 2 == 0,
				Camera = (r == 2 and w == 3)
						and { From = Vector3.new(88, 24, 232), To = Vector3.new(96.4, 23.6, 232), Fov = 70, Label = "DATA WALL" }
					or nil,
			})
		end
	end
	for i = 0, 2 do
		local rack = box(desks, "ServerRack", 51, FT, 208 + i * 4.2, 54, FT + 8, 212 + i * 4.2, BLACK, Enum.Material.Metal)
		local g = canvas(rack, Enum.NormalId.Right, 12, Color3.fromRGB(20, 22, 26), 0)
		for u = 0, 9 do
			guiFrame(g, 0.3, 0.4 + u * 0.75, 3.4, 0.5, Color3.fromRGB(44, 48, 56))
			for l = 0, 3 do
				local on = (u + l + i) % 3 ~= 0
				guiFrame(g, 2.4 + l * 0.3, 0.55 + u * 0.75, 0.15, 0.15, on and LED_GREEN or Color3.fromRGB(255, 160, 40))
			end
		end
		if i == 1 then
			BuildUtil.Look(
				rack,
				"Server Racks",
				"The team's super-computers crunch millions of stats every game: every pass, every tackle, every kick.",
				{ At = Vector3.new(1.6, -1, 0), Distance = 8 }
			)
		end
	end

	-- Step 3: the data wall + holo-field table --------------------------------------------------
	BuildUtil.Stage(ctx, 3)
	local data = BuildUtil.Child(ctx, "DataWall")
	box(data, "DataWallFrame", 96.6, 18, 208, 97.4, 28.6, 256, BLACK, Enum.Material.Metal)
	local screens = {
		{ z0 = 209.5, z1 = 223.5, live = "rating", text = "TEAM RATING" },
		{ z0 = 225, z1 = 239, live = "record", text = "RECORD 0-0" },
		{ z0 = 240.5, z1 = 254.5, live = "season", text = "SEASON 1" },
	}
	local ratingScreen
	for _, s in ipairs(screens) do
		local part = box(data, "DataScreen", 96.4, 19.6, s.z0, 96.6, 27.6, s.z1, LED_DARK)
		liveScreen(part, Enum.NormalId.Left, s.live, s.text, { TextColor3 = CYAN, PixelsPerStud = 16, Padding = 0.1 })
		if s.live == "rating" then
			ratingScreen = part
		end
	end
	BuildUtil.Light(
		ratingScreen,
		"SurfaceLight",
		{ Name = "DataGlow", Face = Enum.NormalId.Left, Range = 16, Brightness = 1, Color = CYAN }
	)
	BuildUtil.Look(
		ratingScreen,
		"Team Rating",
		"Your TEAM RATING is the average rating of your six starters (QB, RB, WR, OL, DEF and K). Draft better players and train them in the Weight Room to push it higher - a higher rating wins more games!",
		{ LookKey = "rating", At = Vector3.new(-0.4, -3, 0), Distance = 10 }
	)
	local ticker = box(data, "ChartTicker", 96.4, 18.3, 209.5, 96.6, 19.4, 254.5, LED_DARK)
	local tg = canvas(ticker, Enum.NormalId.Left, 16, LED_DARK, 0)
	for i = 0, 8 do
		guiChart(tg, 0.3 + i * 5, 0.1, 4.4, 0.9, i * 3 + 1, i % 2 == 0 and CYAN or team.Secondary, LED_TEXT)
	end
	local header = box(data, "DataHeader", 96.4, 27.75, 209.5, 96.6, 28.5, 254.5, team.Primary)
	sign(header, Enum.NormalId.Left, "TEAM ANALYTICS - LIVE", team.Primary, team, { InsetX = 0.2, InsetY = 0.1 })
	-- the holo-field table: a glowing 3D football field
	local hx, hz = 60, 236
	cyl(data, "HoloBase", Vector3.new(hx, FT + 1.5, hz), 3, 5, "Y", DARK_METAL, Enum.Material.Metal)
	local top = cyl(data, "HoloTable", Vector3.new(hx, FT + 3.1, hz), 0.2, 7, "Y", GLASS, Enum.Material.Glass, { Transparency = 0.2 })
	BuildUtil.Light(top, "PointLight", { Name = "HoloGlow", Range = 12, Brightness = 1.2, Color = HOLO_GREEN })
	box(data, "HoloField", hx - 2.6, FT + 3.4, hz - 1.6, hx + 2.6, FT + 3.45, hz + 1.6, HOLO_GREEN, Enum.Material.Neon, {
		CanCollide = false,
		CastShadow = false,
		Transparency = 0.35,
	})
	for i, p in ipairs({ { -1.2, -0.6 }, { 0.4, 0.5 }, { 1.4, -0.3 } }) do
		ball(data, "HoloPlayer", Vector3.new(hx + p[1], FT + 3.8, hz + p[2]), 0.5, i == 1 and team.Secondary or CYAN, Enum.Material.Neon, {
			CanCollide = false,
			CastShadow = false,
			Transparency = 0.2,
		})
	end
	BuildUtil.Look(
		top,
		"Holo-Field",
		"A 3D hologram of the field! Analysts replay every play from every angle to find the perfect game plan.",
		{ Distance = 8 }
	)
end

return M
