--[[
	HQRoomsFront
	The front row of rooms inside the Team HQ (the empty building itself is Builders/HQShell.lua).
	Every room fills its zone (Config.Layout.Zones) between the shell's front wall (z = 200) and the
	corridor (z = 264..278). Rooms are REAL walk-in rooms: floor, walls, a ceiling with light panels
	and a working door (BuildUtil.Door, swinging INTO the room) right beside the room's buy button
	(never in line with it, so nobody walks out of a room onto a button).

	  hq_lobby        the open atrium behind the entrance (no closing walls, the walk from the
	                  doors to the corridor stays open):
	                    1 reception desk (look) + receptionist chair (seat), a basket of free foam
	                      fingers (use), HQ directory (look) with a station clock on top (look)
	                    2 giant team wall: live team name, record, season + game-day countdown, logo,
	                      three team photos (look), Rumble the mascot statue (look)
	                    3 sofas + armchairs (seats; one cushion is a camera seat on the team wall),
	                      plants, lamp
	                    4 a lit glass trophy case (look: championships)
	                    5 a big LED screen (live summary + game-day ticker) over the corridor opening
	  hq_frontoffice  the GM's office: 1 walls + door, 2 GM desk + chair (seat), computer (look:
	                  record), guest chairs, 3 the DRAFT BOARD (look: draft, live starters screen),
	                  war-room table + chairs (one a draft-board camera seat), draft-day phone (look),
	                  4 window glass, bookcase, retired jersey + team photos (look), mini fridge
	                  (soda), sofa, franchise certificate (live owner), first dollar, stadium model
	  hq_coaches      1 walls, sliding glass doors and the head coach office with its own door,
	                  2 head coach desk + chair (a game-film camera seat), playbook shelf (look),
	                  3 assistant desks + huddle table (seats), sports-drink cooler, 4 whiteboards
	                  with plays (look), depth chart (live starters) and a live TEAM RATING board
	  hq_interview    press room: 1 dark walls + step-and-repeat backdrop + door, 2 stage, podium
	                  with microphones (use: press conference, TV close-up camera), panel table,
	                  3 press chairs (seats), TV cameras (look), a camera-operator seat with a live
	                  TV view, press monitors (live score + summary) and an ON AIR light
	  hq_meeting      team meeting room: 1 walls + team crest (look) + motto (look), 2 tiered rows of
	                  seats (one with a screen camera) with steps at the back, 3 stage with podium
	                  (look), video wall with the live season + summary (look) and this week's game
	                  plan (look)
	  hq_lounge       player lounge: 1 walls + striped team carpet, 2 sectional couch (seats, the
	                  middle one a TV camera seat), big TV (live score, look), bean bags, 3 pool table
	                  (look) + ping-pong (use) with a live rally scoreboard, 4 arcade cabinets (use)
	                  under a live high-score marquee, drinks fridge (soda), popcorn machine,
	                  foosball (look), jukebox (look)

	Plays on whiteboards and screens, the step-and-repeat pattern, the directory, team photos and
	the draft board cards are drawn with GUI frames on SurfaceGuis (crisp lines, no extra parts).
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)

local HQRoomsFront = {}

-- Lines and heights shared by every front-row room (plot-local studs)
local SHELL_FLOOR = 0.2 -- top of the HQ shell's floor
local FLOOR_TOP = 0.32 -- room floors lie on the shell floor
local WALL_TOP = 12.2 -- room walls (the shell roof is at ~30); the ceilings rest on them
local CEILING_TOP = 12.6
local DOOR_TOP = 9.2 -- doorways and window heads
local SILL_TOP = 3.2
local FRONT_Z = 201.45 -- rooms reach the inner face of the shell's front wall
local CW_IN, CW_OUT = 262.8, 263.8 -- corridor-side room wall (the corridor starts at z = 264)
local FACE_Z = 264
local LIGHT_ROWS = { 214, 233, 252 } -- z of the ceiling light panels in every room (default)
local DOOR_H = DOOR_TOP - FLOOR_TOP - 0.1 -- height of a closed door leaf
local DOOR_Z = (CW_IN + CW_OUT) / 2 -- door leaves sit in the middle of the corridor wall

local PAINT = { CanCollide = false, CastShadow = false }
local NO_COLLIDE = { CanCollide = false }

local WHITE = Color3.fromRGB(248, 248, 248)
local INK = Color3.fromRGB(22, 22, 26)
local BLACK = Color3.fromRGB(24, 24, 28)
local DARK_METAL = Color3.fromRGB(62, 64, 70)
local CHROME = Color3.fromRGB(200, 204, 210)
local STEEL = Color3.fromRGB(210, 212, 216)
local SCREEN = Color3.fromRGB(14, 16, 22)
local SCREEN_BLUE = Color3.fromRGB(28, 92, 196)
local WARM_LIGHT = Color3.fromRGB(255, 238, 205)
local LAMP = Color3.fromRGB(255, 248, 232)
local CEILING = Color3.fromRGB(232, 232, 228)
local DARK_WOOD = Color3.fromRGB(92, 62, 40)
local WOOD = Color3.fromRGB(150, 105, 60)
local LEATHER_BLACK = Color3.fromRGB(34, 34, 38)
local LEATHER_BROWN = Color3.fromRGB(112, 64, 38)
local FOOTBALL = Color3.fromRGB(124, 66, 36)
local LEAF = Color3.fromRGB(58, 128, 64)
local LEAF_DARK = Color3.fromRGB(38, 98, 50)
local TRUNK = Color3.fromRGB(96, 70, 46)
local POT = Color3.fromRGB(64, 66, 72)
local GLASS = Color3.fromRGB(160, 210, 240)
local GOLD = Color3.fromRGB(255, 190, 40)
local SILVER = Color3.fromRGB(214, 218, 224)
local MARBLE = Color3.fromRGB(236, 234, 228)
local ON_AIR_RED = Color3.fromRGB(230, 40, 40)
local MARKER = Color3.fromRGB(26, 28, 36)
local MARKER_BLUE = Color3.fromRGB(28, 78, 200)
local MARKER_RED = Color3.fromRGB(200, 36, 36)
local LED_DARK = Color3.fromRGB(12, 14, 20)
local LED_TEXT = Color3.fromRGB(255, 226, 120)

local DRAFT_POSITIONS = { "QB", "RB", "WR", "OL", "DEF", "K" }
local DRAFT_NAMES = {
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
}
local DRAFT_GRADES = {
	Color3.fromRGB(255, 212, 84), -- first-round grade
	Color3.fromRGB(150, 200, 255),
	Color3.fromRGB(150, 224, 150),
	Color3.fromRGB(232, 232, 236),
}

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
	      LightInfluence, BackgroundColor3 + BackgroundTransparency (a filled label), Wrap
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
-- GUI drawing (whiteboards, screens, patterns). Positions/sizes are in studs measured from the
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

-- Straight marker line from (ax, ay) to (bx, by) (a frame rotated about its centre).
local function guiLine(gui, ax, ay, bx, by, thick, color)
	local dx, dy = bx - ax, by - ay
	local len = math.sqrt(dx * dx + dy * dy)
	local cx, cy = (ax + bx) / 2, (ay + by) / 2
	return guiFrame(gui, cx - len / 2, cy - thick / 2, len, thick, color, math.deg(math.atan2(dy, dx)))
end

-- A route: a polyline with an arrowhead at its last point.
local function guiRoute(gui, points, thick, color)
	for i = 1, #points - 1 do
		guiLine(gui, points[i][1], points[i][2], points[i + 1][1], points[i + 1][2], thick, color)
	end
	local a, b = points[#points - 1], points[#points]
	local angle = math.atan2(b[2] - a[2], b[1] - a[1])
	local head = thick * 4
	for _, s in ipairs({ -1, 1 }) do
		local t = angle + math.pi + s * 0.55
		guiLine(gui, b[1], b[2], b[1] + head * math.cos(t), b[2] + head * math.sin(t), thick, color)
	end
end

-- An "O": a stroked circle.
local function guiRing(gui, cx, cy, d, thick, color)
	local frame = guiFrame(gui, cx - d / 2, cy - d / 2, d, d, color, 0, 1)
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

-- An "X": two crossed strokes.
local function guiCross(gui, cx, cy, size, thick, color)
	local h = size / 2
	guiLine(gui, cx - h, cy - h, cx + h, cy + h, thick, color)
	guiLine(gui, cx - h, cy + h, cx + h, cy - h, thick, color)
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

-- Plays in normalised board coordinates (u right, v down). o = offence, x = defence.
local PLAYS = {
	{
		title = "TRIPS RT - 32 DIVE",
		name = "Trips Right 32 Dive",
		info = "Trips Right, 32 Dive: three receivers line up on the right to drag the defense over, then the running back blasts through the gap between the guard and tackle.",
		los = 0.52,
		o = {
			{ 0.38, 0.6 },
			{ 0.44, 0.6 },
			{ 0.5, 0.6 },
			{ 0.56, 0.6 },
			{ 0.62, 0.6 },
			{ 0.5, 0.74 },
			{ 0.5, 0.9 },
			{ 0.1, 0.6 },
			{ 0.8, 0.62 },
			{ 0.9, 0.62 },
		},
		x = {
			{ 0.41, 0.44 },
			{ 0.47, 0.44 },
			{ 0.53, 0.44 },
			{ 0.59, 0.44 },
			{ 0.36, 0.3 },
			{ 0.5, 0.3 },
			{ 0.64, 0.3 },
			{ 0.1, 0.38 },
			{ 0.84, 0.38 },
			{ 0.4, 0.13 },
			{ 0.62, 0.13 },
		},
		routes = {
			{ { 0.1, 0.55 }, { 0.1, 0.08 } },
			{ { 0.8, 0.57 }, { 0.8, 0.42 }, { 0.68, 0.22 } },
			{ { 0.9, 0.57 }, { 0.9, 0.3 }, { 0.98, 0.3 } },
			{ { 0.52, 0.86 }, { 0.55, 0.78 }, { 0.53, 0.4 } },
		},
	},
	{
		title = "COVER 2 - MIKE BLITZ",
		name = "Cover 2 Mike Blitz",
		info = "Cover 2, Mike Blitz: two safeties split the deep field while the middle linebacker sneaks through the middle to sack the quarterback.",
		los = 0.5,
		o = {
			{ 0.38, 0.58 },
			{ 0.44, 0.58 },
			{ 0.5, 0.58 },
			{ 0.56, 0.58 },
			{ 0.62, 0.58 },
			{ 0.5, 0.72 },
			{ 0.44, 0.86 },
			{ 0.12, 0.58 },
			{ 0.88, 0.58 },
		},
		x = {
			{ 0.4, 0.42 },
			{ 0.47, 0.42 },
			{ 0.53, 0.42 },
			{ 0.6, 0.42 },
			{ 0.34, 0.28 },
			{ 0.5, 0.26 },
			{ 0.66, 0.28 },
			{ 0.12, 0.36 },
			{ 0.88, 0.36 },
			{ 0.28, 0.1 },
			{ 0.72, 0.1 },
		},
		routes = {
			{ { 0.5, 0.29 }, { 0.5, 0.36 }, { 0.495, 0.66 } },
			{ { 0.28, 0.13 }, { 0.2, 0.06 } },
			{ { 0.72, 0.13 }, { 0.8, 0.06 } },
			{ { 0.12, 0.39 }, { 0.12, 0.5 } },
			{ { 0.88, 0.39 }, { 0.88, 0.5 } },
		},
	},
	{
		title = "PUNT RETURN - WALL LEFT",
		name = "Punt Return Wall Left",
		info = "Punt Return, Wall Left: the blockers race to the left sideline and build a wall, and the returner cuts behind it for a big gain.",
		los = 0.36,
		o = {
			{ 0.3, 0.44 },
			{ 0.4, 0.44 },
			{ 0.5, 0.44 },
			{ 0.6, 0.44 },
			{ 0.7, 0.44 },
			{ 0.42, 0.62 },
			{ 0.58, 0.62 },
			{ 0.5, 0.9 },
		},
		x = {
			{ 0.25, 0.28 },
			{ 0.35, 0.28 },
			{ 0.45, 0.28 },
			{ 0.55, 0.28 },
			{ 0.65, 0.28 },
			{ 0.75, 0.28 },
			{ 0.5, 0.12 },
		},
		routes = {
			{ { 0.6, 0.47 }, { 0.62, 0.56 }, { 0.3, 0.66 } },
			{ { 0.7, 0.47 }, { 0.72, 0.6 }, { 0.36, 0.72 } },
			{ { 0.5, 0.86 }, { 0.62, 0.74 }, { 0.2, 0.64 }, { 0.12, 0.2 } },
		},
	},
}

-- (the fourth play: Trips Right Flood - three levels of receivers flood one side of the field)
table.insert(PLAYS, {
	title = "TRIPS RT - FLOOD",
	name = "Trips Right Flood",
	info = "Trips Right, Flood: three receivers run deep, medium and short to the same side, so one of them is always open. Read it high to low!",
	los = 0.5,
	o = {
		{ 0.38, 0.58 },
		{ 0.44, 0.58 },
		{ 0.5, 0.58 },
		{ 0.56, 0.58 },
		{ 0.62, 0.58 },
		{ 0.5, 0.72 },
		{ 0.42, 0.86 },
		{ 0.1, 0.58 },
		{ 0.74, 0.6 },
		{ 0.84, 0.6 },
		{ 0.94, 0.58 },
	},
	x = {
		{ 0.41, 0.42 },
		{ 0.47, 0.42 },
		{ 0.53, 0.42 },
		{ 0.59, 0.42 },
		{ 0.36, 0.28 },
		{ 0.5, 0.28 },
		{ 0.66, 0.28 },
		{ 0.1, 0.36 },
		{ 0.92, 0.36 },
		{ 0.3, 0.1 },
		{ 0.72, 0.1 },
	},
	routes = {
		{ { 0.94, 0.55 }, { 0.94, 0.06 } },
		{ { 0.84, 0.57 }, { 0.84, 0.32 }, { 0.97, 0.22 } },
		{ { 0.74, 0.57 }, { 0.78, 0.5 }, { 0.97, 0.48 } },
		{ { 0.1, 0.55 }, { 0.1, 0.3 }, { 0.4, 0.2 } },
		{ { 0.44, 0.84 }, { 0.6, 0.8 }, { 0.7, 0.68 } },
	},
})

-- Draws play `index` on a W x H stud area of `gui` starting at (ox, oy).
local function drawPlay(gui, index, ox, oy, W, H, ink, accent)
	local play = PLAYS[(index - 1) % #PLAYS + 1]
	local margin = math.min(W, H) * 0.06
	local titleH = H * 0.12
	local areaX, areaY = ox + margin, oy + margin + titleH
	local areaW, areaH = W - 2 * margin, H - 2 * margin - titleH
	local function at(p)
		return areaX + p[1] * areaW, areaY + p[2] * areaH
	end
	local d = math.min(areaW * 0.045, areaH * 0.1)
	local thick = math.max(d * 0.16, 0.05)
	guiText(gui, ox + margin, oy + margin * 0.6, W * 0.6, titleH, play.title, ink, Enum.Font.GothamBlack, Enum.TextXAlignment.Left)
	-- line of scrimmage (dashed)
	local dashes = 14
	for i = 0, dashes - 1 do
		local u0 = (i + 0.15) / dashes
		local u1 = (i + 0.75) / dashes
		local ax, ay = at({ u0, play.los })
		local bx = at({ u1, play.los })
		guiLine(gui, ax, ay, bx, ay, thick * 0.7, ink)
	end
	for _, p in ipairs(play.o) do
		local x, y = at(p)
		guiRing(gui, x, y, d, thick, ink)
	end
	for _, p in ipairs(play.x) do
		local x, y = at(p)
		guiCross(gui, x, y, d * 0.9, thick, accent)
	end
	for _, route in ipairs(play.routes) do
		local points = {}
		for i, p in ipairs(route) do
			local x, y = at(p)
			points[i] = { x, y }
		end
		guiRoute(gui, points, thick, accent)
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

---------------------------------------------------------------------------------------------
-- Furniture
---------------------------------------------------------------------------------------------

-- A seat cushion players can sit on (BuildUtil.Seat) in a local frame, bottom at local y0. The
-- sitter faces the frame's front. opts: Name, Object (prompt label), NoPrompt, Camera
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

-- Office chair: pedestal, seat (a real seat), high back. Returns the seat and the back.
local function officeChair(ctx, frame, color, opts)
	opts = opts or {}
	cyl(ctx, "ChairPost", (frame * CFrame.new(0, 0.8, 0)).Position, 1.6, 0.5, "Y", DARK_METAL, Enum.Material.Metal)
	local seat = lseat(ctx, frame, Vector3.new(2.2, 0.6, 2.2), 0, 1.5, 0, color, Enum.Material.Leather, {
		Name = "ChairSeat",
		Object = opts.Object or "Office Chair",
		NoPrompt = opts.NoPrompt,
		Camera = opts.Camera,
	})
	local back = lblock(ctx, frame, "ChairBack", Vector3.new(2.2, 3, 0.45), 0, 2.1, 1.0, color, Enum.Material.Leather)
	return seat, back
end

-- Sofa (seat cushions, back, two arms) whose seats face the frame's front. Every cushion is a
-- seat; only the middle one shows a prompt (opts.Object / Camera go to it, opts.NoPrompt = none).
local function sofa(ctx, frame, length, color, armColor, opts)
	opts = opts or {}
	local material = Enum.Material.Fabric
	local seatLen = length - 1.6
	local count = math.max(1, math.floor(seatLen / 3.2))
	local cushionW = seatLen / count
	local middle = math.ceil(count / 2)
	for i = 1, count do
		local x = -seatLen / 2 + (i - 0.5) * cushionW
		local main = i == middle and not opts.NoPrompt
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

-- Bean bag: a low cushion you sit in (a seat) with a squashy ball behind it. It faces `target`.
local function beanBag(ctx, x, z, target, color, opts)
	local frame = CFrame.lookAt(Vector3.new(x, FLOOR_TOP, z), Vector3.new(target.X, FLOOR_TOP, target.Z))
	local seat = lseat(ctx, frame, Vector3.new(3, 1.3, 3), 0, 0, 0, color, Enum.Material.Fabric, {
		Name = "BeanBag",
		Object = "Bean Bag",
		NoPrompt = opts and opts.NoPrompt,
	})
	ball(ctx, "BeanBagBack", (frame * CFrame.new(0, 1.9, 1.3)).Position, 2.8, color, Enum.Material.Fabric, NO_COLLIDE)
	return seat
end

-- Potted plant (pot + two leaf balls); `tall` adds a trunk (indoor tree).
local function plant(ctx, x, z, size, tall)
	size = size or 1
	local potH = 2 * size
	cyl(ctx, "PlantPot", Vector3.new(x, FLOOR_TOP + potH / 2, z), potH, 2.4 * size, "Y", POT, Enum.Material.Concrete)
	local leafY = FLOOR_TOP + potH + 1.4 * size
	if tall then
		cyl(ctx, "PlantTrunk", Vector3.new(x, FLOOR_TOP + potH + 1.6 * size, z), 3.2 * size, 0.4 * size, "Y", TRUNK, Enum.Material.Wood)
		leafY += 3 * size
	end
	ball(ctx, "PlantLeaves", Vector3.new(x, leafY, z), 3.6 * size, LEAF, Enum.Material.Grass)
	ball(ctx, "PlantLeaves", Vector3.new(x + 0.5 * size, leafY + 1.5 * size, z - 0.4 * size), 2.6 * size, LEAF_DARK, Enum.Material.Grass)
end

-- A screen showing `text` on the face toward `face` (filled background, glows in the dark).
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

-- Desk monitor in a local frame: display on its Front face (toward the frame's front).
local function monitor(ctx, frame, x, y0, z, w, h, text, color)
	lblock(ctx, frame, "MonitorStand", Vector3.new(0.4, 0.5, 0.4), x, y0, z + 0.05, DARK_METAL, Enum.Material.Metal)
	local screen = lblock(ctx, frame, "Monitor", Vector3.new(w, h, 0.18), x, y0 + 0.5, z, SCREEN)
	screenText(screen, Enum.NormalId.Front, text, color or SCREEN_BLUE, WHITE)
	return screen
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

-- A filled circle (heads in photos, dots).
local function guiDot(gui, cx, cy, d, color)
	local frame = guiFrame(gui, cx - d / 2, cy - d / 2, d, d, color)
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0.5, 0)
	corner.Parent = frame
	return frame
end

local SKIN = { Color3.fromRGB(241, 194, 150), Color3.fromRGB(198, 134, 90), Color3.fromRGB(141, 85, 54), Color3.fromRGB(224, 172, 122) }

--[[
	A team photo drawn on `face` of `part` (W x H studs): two rows of players in front of a
	backdrop and a caption strip. variant 1 = game jerseys on the field, 2 = white practice
	jerseys, 3 = fan day (a crowd + the mascot).
]]
local function teamPhoto(part, face, W, H, team, variant, caption)
	local gui = canvas(part, face, 16, Color3.fromRGB(246, 244, 236), 1)
	local m = 0.25
	local iw, ih = W - 2 * m, H - 2 * m - 0.8
	local sky = variant == 3 and Color3.fromRGB(200, 70, 60) or Color3.fromRGB(150, 200, 240)
	guiFrame(gui, m, m, iw, ih * 0.5, sky)
	guiFrame(gui, m, m + ih * 0.5, iw, ih * 0.5, Color3.fromRGB(64, 136, 64))
	local jersey = variant == 2 and Color3.fromRGB(245, 245, 245) or team.Primary
	local rows = { { n = 6, y = 0.42, size = 1 }, { n = 5, y = 0.7, size = 1.1 } }
	if variant == 3 then
		-- the crowd: little heads in the stands, team colours everywhere
		for i = 0, 13 do
			for r = 0, 1 do
				local c = (i + r) % 3 == 0 and team.Secondary or team.Primary
				guiDot(gui, m + 0.3 + i * (iw - 0.6) / 13, m + 0.35 + r * 0.55, 0.38, c)
			end
		end
		-- the mascot, big and round, in the middle
		guiDot(gui, W / 2, m + ih * 0.42, ih * 0.34, team.Secondary)
		guiFrame(gui, W / 2 - ih * 0.17, m + ih * 0.56, ih * 0.34, ih * 0.36, team.Primary)
	end
	for r, row in ipairs(rows) do
		local step = iw / (row.n + 1)
		local head = 0.42 * row.size
		for i = 1, row.n do
			local x = m + i * step
			if not (variant == 3 and math.abs(x - W / 2) < ih * 0.25) then
				local y = m + ih * row.y
				guiDot(gui, x, y, head, SKIN[(i + r) % #SKIN + 1])
				guiFrame(gui, x - head * 0.75, y + head * 0.45, head * 1.5, head * 1.5, jersey)
			end
		end
	end
	guiFrame(gui, m, H - m - 0.75, iw, 0.7, Color3.fromRGB(30, 30, 34))
	guiText(gui, m + 0.2, H - m - 0.7, iw - 0.4, 0.6, caption, WHITE, Enum.Font.GothamBold)
	return gui
end

-- Team logo: a ring + disc with the monogram, standing on a wall. `axis` is the wall normal
-- axis ("X" or "Z"), `dir` (+1/-1) the side it faces, (x, y, z) the point on the wall face.
local function wallLogo(ctx, x, y, z, axis, dir, diameter, team, letters)
	local function at(offset)
		if axis == "X" then
			return Vector3.new(x + dir * offset, y, z)
		end
		return Vector3.new(x, y, z + dir * offset)
	end
	-- ring 0.3 deep on the wall, the disc stands 0.15 proud of it
	cyl(ctx, "LogoRing", at(0.15), 0.3, diameter, axis, team.Secondary, Enum.Material.SmoothPlastic)
	local disc = cyl(ctx, "LogoDisc", at(0.225), 0.45, diameter * 0.84, axis, team.Primary)
	-- the disc's flat ends are its Left/Right faces (local X); pick the one facing out of the wall
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
-- Room shell
---------------------------------------------------------------------------------------------

-- Glass + mullions in a corridor-wall window.
local function glaze(ctx, op)
	box(ctx, "WindowGlass", op.From, op.Sill, CW_IN + 0.35, op.To, DOOR_TOP, CW_OUT - 0.35, GLASS, Enum.Material.Glass, {
		Transparency = 0.45,
	})
	local n = op.Mullions or 0
	for m = 1, n do
		local x = op.From + m * (op.To - op.From) / (n + 1)
		box(ctx, "Mullion", x - 0.15, op.Sill, CW_IN + 0.2, x + 0.15, DOOR_TOP, CW_OUT - 0.2, DARK_METAL, Enum.Material.Metal)
	end
end

-- A working double door in a corridor-wall doorway (BuildUtil.Door: it swings INTO the room,
-- toward -Z, or slides into the wall), a team frame + name plate on the corridor side.
-- Call it after BuildUtil.Stage (the door builds into its own child model).
local function doorway(ctx, op, o, team)
	local glass = o.DoorGlass
	BuildUtil.Door(ctx, {
		Name = "RoomDoor",
		Size = Vector3.new(op.To - op.From, DOOR_H, 0.35),
		CFrame = CFrame.new((op.From + op.To) / 2, FLOOR_TOP + 0.05 + DOOR_H / 2, DOOR_Z),
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
	local trim = team.Secondary
	box(ctx, "DoorFrame", op.From - 0.5, SHELL_FLOOR, CW_OUT, op.From, DOOR_TOP, CW_OUT + 0.25, trim)
	box(ctx, "DoorFrame", op.To, SHELL_FLOOR, CW_OUT, op.To + 0.5, DOOR_TOP, CW_OUT + 0.25, trim)
	box(ctx, "DoorFrameTop", op.From - 0.5, DOOR_TOP, CW_OUT, op.To + 0.5, DOOR_TOP + 0.5, CW_OUT + 0.25, trim)
	if o.DoorSign then
		local plate = box(ctx, "DoorSign", op.From - 0.5, DOOR_TOP + 0.7, CW_OUT, op.To + 0.5, DOOR_TOP + 1.9, CW_OUT + 0.2, team.Primary)
		sign(plate, Enum.NormalId.Back, o.DoorSign, team.Primary, team, { InsetX = 0.05, InsetY = 0.12 })
	end
end

-- A glowing ceiling light panel (w x d) centred on (x, z) with a PointLight.
local function ceilingLight(ctx, x, z, w, d, range)
	local lamp =
		box(ctx, "CeilingLight", x - w / 2, WALL_TOP - 0.2, z - d / 2, x + w / 2, WALL_TOP, z + d / 2, LAMP, Enum.Material.Neon, PAINT)
	BuildUtil.Light(lamp, "PointLight", { Name = "RoomLight", Range = range or 26, Brightness = 1.3, Color = WARM_LIGHT })
	return lamp
end

--[[
	Builds a room's floor, side walls, corridor wall (doorway with a working door + windows), team
	band and ceiling with light panels, all in the current step.
	o: MinX, MaxX (floor/ceiling/corridor wall extent), Walls = { { minX, maxX }, ... } (walls
	   between rooms), Openings = { { From, To, Sill?, Mullions? } } sorted by x (no Sill = a
	   doorway), Glass (glaze the windows now), WallColor, WallMaterial, FloorColor, FloorMaterial,
	   CeilingColor, DoorColor, DoorGlass, DoorSlide, DoorWindow, DoorSign, DoorObject, DoorTitle,
	   DoorInfo, Lights = { { x, z }, ... } (default: three panels down the middle)
]]
local function roomShell(ctx, o)
	local team = ctx.colors
	local x0, x1 = o.MinX, o.MaxX
	local wallColor, wallMaterial = o.WallColor, o.WallMaterial or Enum.Material.Plaster
	box(ctx, "Floor", x0, SHELL_FLOOR, FRONT_Z, x1, FLOOR_TOP, FACE_Z, o.FloorColor, o.FloorMaterial)
	for _, w in ipairs(o.Walls) do
		box(ctx, "SideWall", w[1], SHELL_FLOOR, FRONT_Z, w[2], WALL_TOP, CW_IN, wallColor, wallMaterial)
	end

	-- corridor wall: one lintel over everything, piers between the openings, sills under windows
	box(ctx, "CorridorWallTop", x0, DOOR_TOP, CW_IN, x1, WALL_TOP, CW_OUT, wallColor, wallMaterial)
	local x = x0
	local function pier(a, b)
		if b - a > 0.01 then
			box(ctx, "CorridorWall", a, SHELL_FLOOR, CW_IN, b, DOOR_TOP, CW_OUT, wallColor, wallMaterial)
		end
	end
	for _, op in ipairs(o.Openings) do
		pier(x, op.From)
		if op.Sill then
			box(ctx, "WindowSill", op.From, SHELL_FLOOR, CW_IN, op.To, op.Sill, CW_OUT, wallColor, wallMaterial)
			if o.Glass then
				glaze(ctx, op)
			end
		else
			doorway(ctx, op, o, team)
		end
		x = op.To
	end
	pier(x, x1)
	box(ctx, "WallBand", x0, WALL_TOP - 1.1, CW_OUT, x1, WALL_TOP, FACE_Z, team.Primary)

	-- ceiling with glowing light panels
	box(ctx, "Ceiling", x0, WALL_TOP, FRONT_Z, x1, CEILING_TOP, FACE_Z, o.CeilingColor or CEILING)
	local lights = o.Lights
	if not lights then
		lights = {}
		for _, z in ipairs(LIGHT_ROWS) do
			table.insert(lights, { (x0 + x1) / 2, z })
		end
	end
	for _, l in ipairs(lights) do
		ceilingLight(ctx, l[1], l[2], 12, 5)
	end
end

---------------------------------------------------------------------------------------------
-- Lobby (open atrium X[-150, -50])
---------------------------------------------------------------------------------------------

function HQRoomsFront.hq_lobby(ctx)
	local team = ctx.colors
	local name = teamLabel(ctx)

	-- Step 1: reception desk + chair, the lobby floor with its team runner, the HQ directory ----
	BuildUtil.Stage(ctx, 1)
	local reception = BuildUtil.Child(ctx, "Reception")
	-- polished floor; the shell's entrance mat (x[-108, -92], up to z = 205.5) stays visible as an
	-- inset in front of the doors
	local matZ = 205.55
	box(reception, "LobbyFloor", -150, SHELL_FLOOR, matZ, -50, FLOOR_TOP, FACE_Z, MARBLE, Enum.Material.Marble)
	box(reception, "LobbyFloor", -150, SHELL_FLOOR, FRONT_Z, -108.05, FLOOR_TOP, matZ, MARBLE, Enum.Material.Marble)
	box(reception, "LobbyFloor", -91.95, SHELL_FLOOR, FRONT_Z, -50, FLOOR_TOP, matZ, MARBLE, Enum.Material.Marble)
	box(reception, "Runner", -106, FLOOR_TOP, matZ, -94, 0.36, FACE_Z, team.Primary, Enum.Material.Carpet, PAINT)
	for _, x in ipairs({ -107, -94 }) do
		box(reception, "RunnerEdge", x, FLOOR_TOP, matZ, x + 1, 0.35, FACE_Z, team.Secondary, Enum.Material.Carpet, PAINT)
	end

	-- U-shaped desk facing the doors: team-colour front with WELCOME, marble counter
	local front = box(reception, "DeskFront", -136, FLOOR_TOP, 230, -116, 3.7, 233, team.Primary)
	sign(front, Enum.NormalId.Front, "WELCOME", team.Primary, team, { InsetX = 0.12, Top = 0.16, Height = 0.6 })
	BuildUtil.Look(
		front,
		"Welcome Desk",
		"The front desk of your Team HQ. Visitors sign in here, and the receptionist knows where every room is!",
		{ At = Vector3.new(4, 1, -1.7), Distance = 8 }
	)
	local glow = box(reception, "DeskGlow", -136, 3.42, 229.85, -116, 3.58, 230, team.Secondary, Enum.Material.Neon, PAINT)
	BuildUtil.Light(glow, "PointLight", { Name = "DeskLight", Range = 16, Brightness = 1.2, Color = WARM_LIGHT })
	box(reception, "Counter", -136.6, 3.7, 229.4, -115.4, 4, 233.6, MARBLE, Enum.Material.Marble)
	for _, wx in ipairs({ -136, -119 }) do
		box(reception, "DeskWing", wx, FLOOR_TOP, 233, wx + 3, 2.9, 239, shade(team.Primary, 0.75))
		box(reception, "DeskWingTop", wx - 0.3, 2.9, 233, wx + 3.3, 3.15, 239.3, MARBLE, Enum.Material.Marble)
	end
	box(reception, "WorkSurface", -133, 2.6, 233, -119, 2.85, 235.4, WOOD, Enum.Material.Wood)
	local deskFrame = frameAt(-126, 234.4, "N", 2.85) -- screens face the receptionist
	monitor(reception, deskFrame, -2.4, 0, 0, 2.8, 1.7, "VISITORS", SCREEN_BLUE)
	monitor(reception, deskFrame, 2.4, 0, 0, 2.8, 1.7, "TEAM HQ", shade(team.Primary, 0.9))
	box(reception, "Keyboard", -127.4, 2.85, 234.9, -124.6, 2.97, 235.3, BLACK)
	box(reception, "Phone", -121.6, 2.85, 234.4, -120.8, 3.2, 235.2, BLACK)
	ball(reception, "DeskBell", Vector3.new(-120, 4.25, 231.2), 0.6, GOLD, Enum.Material.Metal)
	-- welcome gift: a basket of foam fingers on the counter (every visitor may take one)
	local basket = box(reception, "GiftBasket", -135, 4, 230.8, -132, 4.9, 232.4, Color3.fromRGB(196, 150, 90), Enum.Material.Wood)
	sign(basket, Enum.NormalId.Front, "FREE!", Color3.fromRGB(196, 150, 90), team, { TextColor3 = INK, InsetX = 0.1, InsetY = 0.12 })
	for i, fx in ipairs({ -134.2, -132.8 }) do
		local color = i == 1 and team.Primary or team.Secondary
		box(reception, "FoamHand", fx - 0.55, 4.9, 231.3, fx + 0.55, 6.1, 231.7, color, Enum.Material.Foil, NO_COLLIDE)
		box(reception, "FoamFinger", fx - 0.18, 6.1, 231.33, fx + 0.18, 7.1, 231.67, color, Enum.Material.Foil, NO_COLLIDE)
	end
	BuildUtil.Use(reception, basket, "foamfinger", {
		Object = "Welcome Gift",
		Title = "Welcome Gift",
		Info = "Every visitor to Team HQ gets a free foam finger. Wave it high on game day!",
		Distance = 8,
	})
	-- the receptionist's chair (walk in between the desk wings from the corridor side)
	officeChair(reception, frameAt(-126, 237.6, "S"), LEATHER_BLACK, { Object = "Receptionist's Chair" })

	-- HQ directory: a lit totem beside the entrance path, facing the doors
	local directory = box(reception, "Directory", -114, FLOOR_TOP, 215.6, -108.5, 8.6, 216.4, BLACK)
	box(reception, "DirectoryCap", -114.3, 8.6, 215.4, -108.2, 9.1, 216.6, team.Primary)
	local dirGui = canvas(directory, Enum.NormalId.Front, 24, Color3.fromRGB(24, 26, 32), 0.3)
	local dirW = 5.5
	guiFrame(dirGui, 0, 0, dirW, 1.1, team.Primary)
	guiText(dirGui, 0.25, 0.18, dirW - 0.5, 0.75, "HQ DIRECTORY", textColorOn(team.Primary, team), Enum.Font.GothamBlack)
	local lines = {
		{ "FRONT ROW", true },
		{ "FRONT OFFICE" },
		{ "COACHES' OFFICES" },
		{ "LOBBY - YOU ARE HERE", false, true },
		{ "INTERVIEW ROOM" },
		{ "TEAM MEETING ROOM" },
		{ "PLAYER LOUNGE" },
		{ "BACK ROW", true },
		{ "LOCKER ROOM" },
		{ "EQUIPMENT ROOM" },
		{ "WEIGHT ROOM" },
		{ "TRAINING ROOM" },
		{ "FILM ROOM" },
		{ "CAFETERIA" },
	}
	for i, line in ipairs(lines) do
		local y = 1.3 + (i - 1) * 0.48
		local color = line[2] and LED_TEXT or (line[3] and Color3.fromRGB(120, 230, 140) or WHITE)
		local inset = line[2] and 0.3 or 0.6
		guiText(
			dirGui,
			inset,
			y,
			dirW - inset - 0.3,
			0.4,
			line[1],
			color,
			line[2] and Enum.Font.GothamBlack or Enum.Font.GothamBold,
			Enum.TextXAlignment.Left
		)
	end
	-- a round station clock on top of the directory (hands at ten past ten)
	box(reception, "ClockStem", -111.55, 9.1, 215.7, -110.95, 9.75, 216.3, DARK_METAL, Enum.Material.Metal)
	local clockD = 2.8
	local clock = cyl(reception, "LobbyClock", Vector3.new(-111.25, 9.7 + clockD / 2, 216), 0.5, clockD, "Z", BLACK, Enum.Material.Metal)
	local clockGui = canvas(clock, Enum.NormalId.Right, 40, nil, 0.4) -- a Z cylinder's Right end faces -Z
	local c = clockD / 2
	guiDot(clockGui, c, c, clockD - 0.35, WHITE)
	for h = 0, 11 do
		local a = h * math.pi / 6
		local r0, r1 = c - 0.42, c - (h % 3 == 0 and 0.7 or 0.55)
		guiLine(clockGui, c + r0 * math.sin(a), c - r0 * math.cos(a), c + r1 * math.sin(a), c - r1 * math.cos(a), 0.09, INK)
	end
	guiText(clockGui, c - 0.45, c + 0.32, 0.9, 0.32, "HQ", team.Primary, Enum.Font.GothamBlack)
	local hourA, minuteA = math.rad(305), math.rad(60)
	guiLine(clockGui, c, c, c + 0.55 * math.sin(hourA), c - 0.55 * math.cos(hourA), 0.13, INK)
	guiLine(clockGui, c, c, c + 0.85 * math.sin(minuteA), c - 0.85 * math.cos(minuteA), 0.09, INK)
	guiDot(clockGui, c, c, 0.2, Color3.fromRGB(200, 30, 30))
	BuildUtil.Look(
		clock,
		"Lobby Clock",
		"It's always football o'clock at Team HQ! You choose when a game day kicks off: press START GAME once the field is ready.",
		{ Distance = 10 }
	)
	BuildUtil.Look(
		directory,
		"HQ Directory",
		"Front row: Front Office, Coaches' Offices, Interview Room, Team Meeting Room and Player Lounge. Back row: Locker Room, Equipment, Weight Room, Training Room, Film Room and Cafeteria.",
		{ At = Vector3.new(0, -1.2, -0.7), Distance = 8 }
	)

	-- Step 2: giant team wall (live name + record), team photos on its back, floor medallion -----
	BuildUtil.Stage(ctx, 2)
	local wallModel = BuildUtil.Child(ctx, "TeamWall")
	local teamWall = box(wallModel, "TeamWall", -147, FLOOR_TOP, 246.5, -113, 18.3, 248.5, team.Primary)
	sign(teamWall, Enum.NormalId.Back, name .. " HQ", team.Primary, team, { InsetX = 0.08, Top = 0.05, Height = 0.18 })
	box(wallModel, "TeamWallCap", -147.5, 18.3, 246.2, -112.5, 19, 248.8, team.Secondary)
	box(wallModel, "TeamWallBase", -147.5, FLOOR_TOP, 246.2, -112.5, 1, 248.8, Color3.fromRGB(40, 42, 48), Enum.Material.Slate)
	-- the team name and record on LED panels (kept up to date by the server)
	local ledBack = shade(team.Primary, 0.3)
	local namePanel = box(wallModel, "TeamNameScreen", -144, 4.4, 246.2, -116, 8.6, 246.5, ledBack)
	liveScreen(namePanel, Enum.NormalId.Front, "team", name, {
		BackgroundColor3 = ledBack,
		TextColor3 = WHITE,
		Font = Enum.Font.GothamBlack,
		PixelsPerStud = 16,
		Padding = 0.08,
	})
	local record = box(wallModel, "RecordScreen", -137, 1.5, 246.2, -123, 3.9, 246.5, LED_DARK)
	liveScreen(record, Enum.NormalId.Front, "record", "RECORD 0-0", { PixelsPerStud = 20, Padding = 0.1 })
	BuildUtil.Look(namePanel, "Team Wall", "The pride of your HQ: your team's name, crest and record, lit up for every visitor.", {
		LookKey = "owner",
		At = Vector3.new(0, -2.4, -0.5),
		Distance = 8,
	})
	wallLogo(wallModel, -130, 13.4, 246.5, "Z", -1, 8.6, team, monogram(ctx))
	for _, span in ipairs({ { -146.4, -134.8 }, { -125.2, -113.6 } }) do
		box(wallModel, "LogoStripe", span[1], 13, 246.2, span[2], 13.8, 246.5, team.Secondary)
	end
	-- LED tickers either side of the logo: where the season stands + the next game day
	local seasonPanel = box(wallModel, "SeasonScreen", -145.6, 9.6, 246.2, -135.4, 12.3, 246.5, LED_DARK)
	liveScreen(seasonPanel, Enum.NormalId.Front, "season", "SEASON 1 - WEEK 1", { PixelsPerStud = 20, Padding = 0.1 })
	local countdown = box(wallModel, "GameDayScreen", -124.6, 9.6, 246.2, -114.4, 12.3, 246.5, LED_DARK)
	liveScreen(countdown, Enum.NormalId.Front, "gameday", "NEXT GAME SOON", {
		TextColor3 = Color3.fromRGB(120, 230, 140),
		PixelsPerStud = 20,
		Padding = 0.1,
	})
	-- Rumble, the team mascot, greets visitors on a marble plinth (faces the doors)
	local mx, mz = -145, 225
	cyl(wallModel, "MascotPlinth", Vector3.new(mx, FLOOR_TOP + 0.6, mz), 1.2, 4.2, "Y", MARBLE, Enum.Material.Marble)
	local plaque = box(wallModel, "MascotPlaque", mx - 1.3, 0.5, mz - 2.12, mx + 1.3, 1.3, mz - 1.9, GOLD, Enum.Material.Metal)
	sign(plaque, Enum.NormalId.Front, "RUMBLE", GOLD, team, { TextColor3 = INK, InsetX = 0.08, InsetY = 0.12 })
	local base = FLOOR_TOP + 1.2
	box(wallModel, "MascotLegs", mx - 0.9, base, mz - 0.5, mx + 0.9, base + 1.3, mz + 0.5, shade(team.Primary, 0.7), Enum.Material.Fabric)
	local body = ball(wallModel, "MascotBody", Vector3.new(mx, base + 2.9, mz), 3.4, team.Primary, Enum.Material.Fabric)
	ball(wallModel, "MascotHead", Vector3.new(mx, base + 5.2, mz), 2.6, team.Primary, Enum.Material.Fabric)
	ball(wallModel, "MascotSnout", Vector3.new(mx, base + 4.95, mz - 1.15), 1.2, WHITE, Enum.Material.Fabric, NO_COLLIDE)
	for _, s in ipairs({ -1, 1 }) do
		ball(wallModel, "MascotEar", Vector3.new(mx + s * 0.95, base + 6.35, mz), 0.95, team.Secondary, Enum.Material.Fabric, NO_COLLIDE)
		ball(wallModel, "MascotEye", Vector3.new(mx + s * 0.48, base + 5.55, mz - 1.08), 0.42, INK, Enum.Material.SmoothPlastic, NO_COLLIDE)
	end
	ball(wallModel, "MascotFootball", Vector3.new(mx + 1.7, base + 3.2, mz - 0.6), 1.1, FOOTBALL, Enum.Material.Leather, NO_COLLIDE)
	BuildUtil.Look(
		body,
		"Rumble the Mascot",
		"Meet Rumble, your team's fuzzy mascot! Rumble leads the cheers on game day and has never lost a dance-off.",
		{ Distance = 9 }
	)
	for _, px0 in ipairs({ -149, -113 }) do
		box(wallModel, "WallPillar", px0, FLOOR_TOP, 245.6, px0 + 2, 19.6, 249.4, DARK_METAL, Enum.Material.Metal)
		box(wallModel, "PillarGlow", px0 + 0.7, 1.2, 245.45, px0 + 1.3, 18.8, 245.6, team.Secondary, Enum.Material.Neon, PAINT)
	end
	for _, ux in ipairs({ -140, -130, -120 }) do
		local can = cyl(wallModel, "UpLight", Vector3.new(ux, FLOOR_TOP + 0.3, 244.6), 0.6, 1.1, "Y", BLACK, Enum.Material.Metal)
		BuildUtil.Light(can, "SpotLight", {
			Name = "WallWash",
			Face = Enum.NormalId.Right, -- a Y cylinder's local +X points up
			Angle = 50,
			Range = 22,
			Brightness = 3,
			Color = WARM_LIGHT,
		})
	end
	-- three framed team photos on the corridor side of the wall
	local photos = {
		{
			x = -140,
			caption = "YEAR ONE",
			title = "Year One Team Photo",
			info = "The very first squad to wear your colours. Their kicker, Toby 'Big Toe' Mills, won game one with a 58-yard field goal!",
		},
		{
			x = -130,
			caption = "ROOKIE CAMP",
			title = "Rookie Camp Photo",
			info = "This year's rookies on day one of training camp, before their white practice jerseys got muddy.",
		},
		{
			x = -120,
			caption = "FAN DAY",
			title = "Fan Day Photo",
			info = "Thousands of fans came to meet the team. The mascot, Rumble, signed 400 footballs and one pizza box.",
		},
	}
	for i, ph in ipairs(photos) do
		local frame = box(wallModel, "TeamPhoto", ph.x - 3.2, 5.4, 248.5, ph.x + 3.2, 10.2, 248.8, DARK_WOOD, Enum.Material.Wood)
		teamPhoto(frame, Enum.NormalId.Back, 6.4, 4.8, team, i, ph.caption)
		BuildUtil.Look(frame, ph.title, ph.info, { At = Vector3.new(0, -1.4, 0.5), Distance = 8 })
	end
	-- floor medallion on the runner, halfway to the corridor
	cyl(wallModel, "MedallionRing", Vector3.new(-100, 0.38, 246), 0.04, 16, "Y", team.Secondary, Enum.Material.SmoothPlastic, PAINT)
	cyl(wallModel, "MedallionDisc", Vector3.new(-100, 0.42, 246), 0.04, 14.2, "Y", team.Primary, Enum.Material.SmoothPlastic, PAINT)
	local medallionText = BuildUtil.Part(wallModel, {
		Name = "MedallionName",
		Size = Vector3.new(11, 0.02, 4),
		CFrame = CFrame.new(-100, 0.45, 246) * CFrame.Angles(0, math.pi, 0), -- reads from the doors
		Transparency = 1,
		CanCollide = false,
		CastShadow = false,
	})
	sign(medallionText, Enum.NormalId.Top, name, team.Primary, team, { InsetX = 0.02, InsetY = 0.05, PixelsPerStud = 14 })

	-- Step 3: lounge seating, waiting sofa, plants (every sofa and armchair is a real seat) ------
	BuildUtil.Stage(ctx, 3)
	local seating = BuildUtil.Child(ctx, "Seating")
	box(seating, "RugBorder", -89, FLOOR_TOP, 223, -57, 0.35, 245, team.Primary, Enum.Material.Carpet, PAINT)
	box(seating, "Rug", -88, FLOOR_TOP, 224, -58, 0.38, 244, Color3.fromRGB(78, 80, 88), Enum.Material.Carpet, PAINT)
	local sofaColor = Color3.fromRGB(96, 100, 112)
	-- (its middle cushion is a camera seat on the live Team Wall: step 2, so it always exists when
	-- the sofas do - the big screen only comes with step 5)
	sofa(seating, frameAt(-73, 228, "N"), 12, sofaColor, shade(team.Primary, 0.85), {
		Object = "Lobby Sofa",
		Camera = { From = Vector3.new(-130, 11, 226), To = Vector3.new(-130, 9.2, 246.2), Fov = 52, Label = "TEAM WALL - LIVE" },
	})
	sofa(seating, frameAt(-73, 240, "S"), 12, sofaColor, shade(team.Primary, 0.85), { Object = "Lobby Sofa" })
	for _, side in ipairs({ { -83.5, "E" }, { -62.5, "W" } }) do
		chair(seating, frameAt(side[1], 234, side[2]), team.Secondary, {
			Width = 3,
			Depth = 2.8,
			SeatHeight = 1.6,
			BackHeight = 2.2,
			Material = Enum.Material.Leather,
			Object = "Armchair",
		})
	end
	box(seating, "CoffeeTableBase", -76, FLOOR_TOP, 232.8, -70, 1.32, 235.2, BLACK)
	box(seating, "CoffeeTable", -77, 1.3, 232, -69, 1.6, 236, Color3.fromRGB(30, 30, 34), Enum.Material.Glass, { Reflectance = 0.1 })
	ball(seating, "Football", Vector3.new(-74.5, 2.05, 234), 0.9, FOOTBALL, Enum.Material.Leather)
	box(seating, "Magazines", -72.4, 1.6, 233.2, -70.6, 1.78, 234.6, team.Secondary)
	cyl(seating, "LampPole", Vector3.new(-60, FLOOR_TOP + 3.5, 226), 7, 0.25, "Y", DARK_METAL, Enum.Material.Metal)
	local shadePart = cyl(seating, "LampShade", Vector3.new(-60, FLOOR_TOP + 7.4, 226), 1.6, 2, "Y", LAMP, Enum.Material.Fabric)
	BuildUtil.Light(shadePart, "PointLight", { Name = "LampLight", Range = 18, Brightness = 1, Color = WARM_LIGHT })
	-- waiting sofa facing the reception desk
	sofa(seating, frameAt(-138, 212, "N"), 14, sofaColor, shade(team.Primary, 0.85), { Object = "Waiting Sofa" })
	plant(seating, -117, 205, 1, true)
	plant(seating, -83, 205, 1, true)
	plant(seating, -146.5, 205, 1.1, true)
	plant(seating, -53.5, 205, 1.1, true)
	plant(seating, -120, 258, 0.9, false)
	plant(seating, -80, 258, 0.9, false)

	-- Step 4: lit trophy case -------------------------------------------------------------------
	BuildUtil.Stage(ctx, 4)
	local trophies = BuildUtil.Child(ctx, "TrophyCase")
	box(trophies, "CaseBase", -86, FLOOR_TOP, 252, -58, 3.3, 256, DARK_WOOD, Enum.Material.Wood)
	local back = box(trophies, "CaseBack", -85.6, 3.3, 255.4, -58.4, 11, 255.8, team.Primary)
	sign(back, Enum.NormalId.Back, name, team.Primary, team, { InsetX = 0.06, InsetY = 0.3 })
	local caseGlass = box(trophies, "CaseGlass", -85.8, 3.3, 252.3, -58.2, 10.4, 255.4, GLASS, Enum.Material.Glass, { Transparency = 0.78 })
	BuildUtil.Look(
		caseGlass,
		"Hall of Champions",
		"Trophies, game balls and banners from your team's best seasons. Win the championship game in the playoffs to add a new title!",
		{ LookKey = "titles", At = Vector3.new(0, -2.2, -1.7), Distance = 8 }
	)
	local header = box(trophies, "CaseHeader", -86, 10.4, 252, -58, 11.8, 256, team.Secondary)
	sign(header, Enum.NormalId.Front, "HALL OF CHAMPIONS", team.Secondary, team, { InsetX = 0.08, InsetY = 0.14 })
	local strip = box(trophies, "CaseLight", -85.5, 10.15, 252.6, -58.5, 10.4, 253.3, LAMP, Enum.Material.Neon, PAINT)
	BuildUtil.Light(strip, "PointLight", { Name = "CaseGlow", Range = 14, Brightness = 2, Color = WARM_LIGHT })
	box(trophies, "GlassShelf", -85.7, 7.4, 252.6, -58.3, 7.55, 255.3, GLASS, Enum.Material.Glass, { Transparency = 0.4 })
	-- three big trophies on the base: a silver football trophy between two gold cups
	local shelfY = 3.3
	for i, tx in ipairs({ -79, -72, -65 }) do
		local tz = 253.9
		cyl(trophies, "TrophyBase", Vector3.new(tx, shelfY + 0.4, tz), 0.8, 1.7, "Y", DARK_WOOD, Enum.Material.Wood)
		cyl(trophies, "TrophyStem", Vector3.new(tx, shelfY + 1.6, tz), 1.6, 0.45, "Y", i == 2 and SILVER or GOLD, Enum.Material.Metal)
		if i == 2 then
			ball(trophies, "TrophyFootball", Vector3.new(tx, shelfY + 2.9, tz), 1.5, SILVER, Enum.Material.Metal, { Reflectance = 0.3 })
		else
			cyl(trophies, "TrophyCup", Vector3.new(tx, shelfY + 3.1, tz), 1.4, 1.7, "Y", GOLD, Enum.Material.Metal, { Reflectance = 0.2 })
		end
	end
	-- top shelf: game balls and a helmet
	local topY = 7.55
	for _, bx in ipairs({ -82, -76, -64 }) do
		ball(trophies, "GameBall", Vector3.new(bx, topY + 0.5, 254), 1, FOOTBALL, Enum.Material.Leather)
	end
	ball(trophies, "Helmet", Vector3.new(-70, topY + 0.9, 254), 1.8, team.Primary, Enum.Material.SmoothPlastic, { Reflectance = 0.15 })
	box(trophies, "Facemask", -70.8, topY + 0.35, 253.05, -69.2, topY + 0.65, 253.25, CHROME, Enum.Material.Metal)
	for _, px0 in ipairs({ -84.5, -61.5 }) do
		box(trophies, "Plaque", px0, 8, 255.25, px0 + 2.2, 9.6, 255.4, GOLD, Enum.Material.Metal)
	end
	-- championship banners on poles either side of the case
	for i, bx in ipairs({ -90, -54 }) do
		cyl(trophies, "BannerPole", Vector3.new(bx, FLOOR_TOP + 8.15, 254.5), 16.3, 0.4, "Y", GOLD, Enum.Material.Metal)
		local color = i == 1 and team.Primary or team.Secondary
		local banner = box(trophies, "ChampionshipBanner", bx - 2.4, 7, 254.3, bx + 2.4, 16.4, 254.45, color, Enum.Material.Fabric)
		sign(banner, Enum.NormalId.Front, i == 1 and "LEAGUE\nCHAMPIONS" or "DIVISION\nCHAMPIONS", color, team, {
			InsetX = 0.08,
			InsetY = 0.2,
			Wrap = true,
		})
	end

	-- Step 5: big LED screen on two pylons over the opening to the corridor ---------------------
	BuildUtil.Stage(ctx, 5)
	local bigScreen = BuildUtil.Child(ctx, "BigScreen")
	for i, cx0 in ipairs({ -125.5, -77.5 }) do
		local pylon = box(bigScreen, "ScreenPylon", cx0, FLOOR_TOP, 260.5, cx0 + 3, 26, 263.5, DARK_METAL, Enum.Material.Metal)
		box(bigScreen, "PylonGlow", cx0 + 1, 1, 260.3, cx0 + 2, 12.4, 260.5, team.Primary, Enum.Material.Neon, PAINT)
		box(bigScreen, "Speaker", cx0, 15, 259.3, cx0 + 3, 20.5, 260.5, BLACK)
		if i == 1 then
			BuildUtil.Look(pylon, "Big Screen", "Live from your HQ: your team's latest score, record and where you are in the season.", {
				LookKey = "season",
				At = Vector3.new(0, -9, -1.7),
				Distance = 8,
			})
		end
	end
	local frame = box(bigScreen, "ScreenFrame", -122.5, 14, 261, -77.5, 25.5, 263, BLACK)
	sign(frame, Enum.NormalId.Back, name .. " TEAM HQ", BLACK, team, { InsetX = 0.08, Top = 0.3, Height = 0.4 })
	local screenBack = shade(team.Primary, 0.25)
	local display = box(bigScreen, "Screen", -121.9, 14.6, 260.8, -78.1, 24.9, 261, screenBack)
	liveScreen(display, Enum.NormalId.Front, "summary", name .. "\nWELCOME TO TEAM HQ", {
		BackgroundColor3 = screenBack,
		TextColor3 = WHITE,
		Font = Enum.Font.GothamBlack,
		PixelsPerStud = 12,
		Padding = 0.05,
	})
	BuildUtil.Light(
		display,
		"SurfaceLight",
		{ Name = "ScreenGlow", Face = Enum.NormalId.Front, Range = 24, Brightness = 1.5, Color = team.Primary }
	)
	local ticker = box(bigScreen, "Ticker", -122.5, 12.6, 261, -77.5, 13.8, 263, LED_DARK)
	liveScreen(ticker, Enum.NormalId.Front, "gameday", "HOME OF THE " .. name, { PixelsPerStud = 20, Padding = 0.08 })
end

---------------------------------------------------------------------------------------------
-- Front Office: the General Manager's office X[-248, -200]
---------------------------------------------------------------------------------------------

function HQRoomsFront.hq_frontoffice(ctx)
	local team = ctx.colors
	local name = teamLabel(ctx)
	local windows = {
		{ From = -246.5, To = -236.5, Sill = SILL_TOP, Mullions = 1 },
		{ From = -216, To = -203, Sill = SILL_TOP, Mullions = 2 },
	}

	-- Step 1: walls + door (window holes stay open until step 4) -----------------------------
	BuildUtil.Stage(ctx, 1)
	local shell = BuildUtil.Child(ctx, "Walls")
	roomShell(shell, {
		MinX = -248.5,
		MaxX = -200,
		Walls = { { -200.8, -200 } },
		Openings = { windows[1], { From = -227, To = -219 }, windows[2] },
		Glass = false,
		WallColor = Color3.fromRGB(226, 218, 204),
		FloorColor = Color3.fromRGB(122, 86, 54),
		FloorMaterial = Enum.Material.WoodPlanks,
		DoorColor = DARK_WOOD,
		DoorSign = "GENERAL MANAGER",
		DoorObject = "Front Office",
		DoorTitle = "Front Office",
		DoorInfo = "The General Manager's office: trades, contracts and the Draft Board all live here.",
	})

	-- Step 2: the GM's desk ---------------------------------------------------------------------
	BuildUtil.Stage(ctx, 2)
	local gm = BuildUtil.Child(ctx, "GMDesk")
	local desk = frameAt(-224, 216, "N") -- front of the desk faces the door
	lblock(gm, desk, "DeskBody", Vector3.new(10, 2.8, 3.6), 0, 0, 0, DARK_WOOD, Enum.Material.Wood)
	lblock(gm, desk, "DeskTop", Vector3.new(11, 0.3, 4.6), 0, 2.8, 0.2, WOOD, Enum.Material.Wood)
	lblock(gm, desk, "DeskPanel", Vector3.new(8.6, 1.8, 0.12), 0, 0.6, -1.86, team.Primary)
	local plate = lblock(gm, desk, "Nameplate", Vector3.new(4.2, 0.7, 0.3), 0, 3.1, -1.65, GOLD, Enum.Material.Metal)
	sign(plate, Enum.NormalId.Front, "GENERAL MANAGER", GOLD, team, { TextColor3 = INK, InsetX = 0.04, InsetY = 0.14 })
	lblock(gm, desk, "MonitorBase", Vector3.new(7.4, 0.5, 0.8), 0, 3.1, 1.25, DARK_METAL, Enum.Material.Metal)
	local screens = {
		{ x = -3.4, z = 0.95, turn = 0.45, text = "SCOUTING" },
		{ x = 0, z = 1.25, turn = 0, text = "SALARY CAP" },
		{ x = 3.4, z = 0.95, turn = -0.45, text = "TRADES" },
	}
	for i, s in ipairs(screens) do
		local screen = BuildUtil.Part(gm, {
			Name = "Monitor",
			Size = Vector3.new(3.2, 1.9, 0.15),
			CFrame = desk * CFrame.new(s.x, 3.6 + 0.95, s.z) * CFrame.Angles(0, s.turn, 0),
			Color = SCREEN,
		})
		screenText(screen, Enum.NormalId.Back, s.text, SCREEN_BLUE, WHITE) -- the GM sits behind the desk
		if i == 1 then
			BuildUtil.Look(
				screen,
				"GM's Computer",
				"Scouting reports, the salary cap and trade offers, all on one screen. Here's how your season is going:",
				{ LookKey = "record", Distance = 8 }
			)
		end
	end
	lblock(gm, desk, "Keyboard", Vector3.new(2.8, 0.12, 0.9), 0, 3.1, 0, BLACK)
	lblock(gm, desk, "Phone", Vector3.new(0.9, 0.35, 0.7), 4, 3.1, -0.4, BLACK)
	ball(gm, "Football", (desk * CFrame.new(-4.1, 3.55, -0.6)).Position, 0.9, FOOTBALL, Enum.Material.Leather)
	cyl(gm, "Mug", (desk * CFrame.new(2.4, 3.45, 0.2)).Position, 0.7, 0.5, "Y", team.Primary)
	-- the GM's chair, with a GM plate on its back
	local _, gmBack = officeChair(gm, frameAt(-224, 212.2, "N"), LEATHER_BLACK, { Object = "GM's Chair" })
	sign(gmBack, Enum.NormalId.Front, "GM", LEATHER_BLACK, team, { TextColor3 = GOLD, InsetX = 0.25, Top = 0.12, Height = 0.3 })
	for i, gx in ipairs({ -227.5, -220.5 }) do
		chair(gm, frameAt(gx, 221, "S"), team.Secondary, {
			Width = 2.4,
			Depth = 2.4,
			SeatHeight = 1.7,
			Material = Enum.Material.Leather,
			Object = "Guest Chair",
			NoPrompt = i == 2,
		})
	end
	-- wood feature wall in front of the facade glass, carrying the team logo
	box(gm, "FeatureWall", -235, FLOOR_TOP, 201.5, -213, WALL_TOP, 202.1, DARK_WOOD, Enum.Material.WoodPlanks)
	box(gm, "Credenza", -232, FLOOR_TOP, 202.2, -216, 3.2, 204.8, DARK_WOOD, Enum.Material.Wood)
	ball(gm, "Helmet", Vector3.new(-220, 4.2, 203.5), 2, team.Primary, Enum.Material.SmoothPlastic, { Reflectance = 0.15 })
	box(gm, "Facemask", -220.9, 3.5, 204.45, -219.1, 3.8, 204.65, CHROME, Enum.Material.Metal)
	wallLogo(gm, -224, 8.4, 202.1, "Z", 1, 6, team, monogram(ctx))

	-- Step 3: the draft board (live starters + prospects), war-room table and the clock --------
	BuildUtil.Stage(ctx, 3)
	local draft = BuildUtil.Child(ctx, "DraftBoard")
	local boardColor = Color3.fromRGB(30, 34, 44)
	local board = box(draft, "DraftBoard", -248.3, 2.4, 220, -247.9, 11.3, 256, boardColor)
	BuildUtil.Look(
		board,
		"The Draft Board",
		"Once it's built you can draft players from the ROSTER screen. Every pick joins your team, and your starters show up right here.",
		{ LookKey = "draft", At = Vector3.new(0.9, -1.6, 0), Distance = 10 }
	)
	local header = box(draft, "DraftHeader", -247.9, 9.95, 220.4, -247.75, 11.1, 255.6, team.Primary)
	sign(header, Enum.NormalId.Right, "DRAFT BOARD - " .. name, team.Primary, team, { InsetX = 0.04, InsetY = 0.12 })
	-- left half (seen from the room): the live list of starters
	local starters = box(draft, "StartersScreen", -247.9, 2.9, 238.8, -247.75, 9.6, 255.4, LED_DARK)
	liveScreen(starters, Enum.NormalId.Right, "roster", "STARTERS", { Font = Enum.Font.Code, PixelsPerStud = 24, Padding = 0.05 })
	-- right half: prospect cards per position, drawn on the board (its Right face is seen from the
	-- room, so its left edge is at z = 256)
	local positions = (ctx.config.Draft and ctx.config.Draft.Positions) or DRAFT_POSITIONS
	local columns = math.min(#positions, 6)
	local x0, regionW = 18.1, 17.3
	local colW = regionW / columns
	local gui = canvas(board, Enum.NormalId.Right, 20, nil, 1)
	guiText(gui, x0, 1.45, regionW, 0.7, "TOP PROSPECTS", LED_TEXT, Enum.Font.GothamBlack)
	for c = 1, columns do
		local cx = x0 + (c - 1) * colW
		guiText(gui, cx + 0.15, 2.25, colW - 0.3, 0.6, positions[c], WHITE, Enum.Font.GothamBlack)
		for r = 1, 3 do
			local y = 2.95 + (r - 1) * 1.9
			local card = guiFrame(gui, cx + 0.15, y, colW - 0.3, 1.6, DRAFT_GRADES[r])
			card.Name = "NameCard"
			local index = ((c - 1) * 3 + r - 1) % #DRAFT_NAMES + 1
			guiText(gui, cx + 0.25, y + 0.4, colW - 0.5, 0.8, DRAFT_NAMES[index], INK, Enum.Font.GothamBold)
		end
	end
	-- war-room table with chairs facing the board
	box(draft, "WarRoomTable", -239, 2.8, 228, -233, 3.1, 248, WOOD, Enum.Material.Wood)
	box(draft, "WarRoomTableBase", -237.5, FLOOR_TOP, 230, -234.5, 2.8, 246, DARK_WOOD, Enum.Material.Wood)
	for i, cz in ipairs({ 231, 236, 241, 246 }) do
		-- (the third chair is a camera seat: a close-up of the draft board)
		chair(draft, frameAt(-230.6, cz, "W"), LEATHER_BLACK, {
			Material = Enum.Material.Leather,
			BackHeight = 2.8,
			Object = "War Room Chair",
			NoPrompt = i ~= 3,
			Camera = i == 3 and { From = Vector3.new(-226, 8, 238), To = Vector3.new(-248, 6.8, 238), Fov = 58, Label = "DRAFT BOARD" }
				or nil,
		})
	end
	local phone = box(draft, "DraftPhone", -237, 3.1, 231, -235.8, 3.5, 232.2, Color3.fromRGB(220, 40, 40), Enum.Material.Neon)
	BuildUtil.Look(
		phone,
		"Draft Day Phone",
		"When it's your pick, this red phone rings off the hook. Great picks push your team rating up!",
		{
			Distance = 8,
		}
	)
	local laptopFrame = frameAt(-236, 238, "W", 3.1)
	lblock(draft, laptopFrame, "LaptopBase", Vector3.new(2.4, 0.1, 1.6), 0, 0, 0, CHROME, Enum.Material.Metal)
	-- the lid stands on the board side (-X) and its display faces the chairs (+X = the frame's back)
	local lid = BuildUtil.Part(draft, {
		Name = "LaptopScreen",
		Size = Vector3.new(2.4, 1.6, 0.08),
		CFrame = laptopFrame * CFrame.new(0, 0.85, -0.85) * CFrame.Angles(math.rad(-12), 0, 0),
		Color = SCREEN,
	})
	screenText(lid, Enum.NormalId.Back, "MOCK DRAFT", SCREEN_BLUE, WHITE)
	box(draft, "Binders", -237.6, 3.1, 244, -235.2, 3.9, 245.6, team.Secondary)
	local clock = box(draft, "DraftClock", -248.3, 6.2, 206.5, -247.9, 9.6, 215.5, BLACK)
	local clockGui = canvas(clock, Enum.NormalId.Right, 20, BLACK, 0)
	guiText(clockGui, 0.4, 0.2, 8.2, 0.9, "ON THE CLOCK", Color3.fromRGB(255, 210, 80), Enum.Font.GothamBlack)
	guiText(clockGui, 0.4, 1.1, 8.2, 2.1, "10:00", ON_AIR_RED, Enum.Font.Code)

	-- Step 4: glass in the windows + decor ------------------------------------------------------
	BuildUtil.Stage(ctx, 4)
	local decor = BuildUtil.Child(ctx, "Decor")
	for _, op in ipairs(windows) do
		glaze(decor, op)
	end
	box(decor, "RugBorder", -235, FLOOR_TOP, 207.5, -213, 0.35, 231, team.Secondary, Enum.Material.Carpet, PAINT)
	box(decor, "Rug", -234, FLOOR_TOP, 208.5, -214, 0.38, 230, shade(team.Primary, 0.7), Enum.Material.Carpet, PAINT)
	-- bookcase on the east wall: a dark case with colourful rows of book spines
	local bookcase = box(decor, "Bookcase", -203.2, FLOOR_TOP, 212, -200.8, 9.3, 232, DARK_WOOD, Enum.Material.Wood)
	BuildUtil.Look(bookcase, "Bookcase", "Scouting reports, old playbooks and the signed ball from your team's very first win.", {
		At = Vector3.new(-1.4, -1.2, 0),
		Distance = 8,
	})
	local spines = {
		team.Primary,
		Color3.fromRGB(170, 40, 40),
		Color3.fromRGB(40, 110, 70),
		team.Secondary,
		Color3.fromRGB(220, 206, 170),
		Color3.fromRGB(40, 70, 140),
		Color3.fromRGB(120, 80, 50),
		Color3.fromRGB(90, 90, 98),
	}
	for row = 0, 3 do
		local y0 = 1 + row * 2
		for half = 0, 1 do
			local z0 = 212.6 + half * 9.8
			box(
				decor,
				"Books",
				-203.35,
				y0,
				z0,
				-203.2,
				y0 + 1.5 - (half * 0.2),
				z0 + 9,
				spines[row * 2 + half + 1],
				Enum.Material.SmoothPlastic
			)
		end
	end
	ball(decor, "SignedBall", Vector3.new(-202, 9.75, 216), 0.9, FOOTBALL, Enum.Material.Leather)
	cyl(decor, "BookcaseTrophy", Vector3.new(-202, 9.95, 227), 1.3, 0.9, "Y", GOLD, Enum.Material.Metal)
	-- mini fridge beside the credenza: free sodas
	local fridge = box(decor, "MiniFridge", -213, FLOOR_TOP, 202.3, -209.6, 3.4, 205.3, STEEL, Enum.Material.Metal)
	sign(fridge, Enum.NormalId.Back, "COLD DRINKS", STEEL, team, { TextColor3 = INK, Top = 0.12, Height = 0.18 })
	BuildUtil.Use(decor, fridge, "soda", { Object = "Mini Fridge", At = Vector3.new(0, 0.4, 1.7), Distance = 8 })
	box(decor, "FridgeHandle", -212.7, 1.4, 205.3, -212.4, 3, 205.55, DARK_METAL, Enum.Material.Metal)
	plant(decor, -246, 204.6, 1, true)
	plant(decor, -204, 204.6, 0.9, false)
	-- framed jersey on the east wall
	box(decor, "JerseyFrame", -201.1, 4.4, 238, -200.8, 10.4, 245, DARK_WOOD, Enum.Material.Wood)
	local jersey = box(decor, "Jersey", -201.25, 4.8, 239.3, -201.1, 9.2, 243.7, team.Primary, Enum.Material.Fabric)
	sign(jersey, Enum.NormalId.Left, "1", team.Primary, team, { InsetX = 0.2, Top = 0.25, Height = 0.6 })
	BuildUtil.Look(
		jersey,
		"Retired Jersey",
		"Number 1 will never be worn again: it belonged to the team's first captain, 'Iron' Ike Morales.",
		{
			At = Vector3.new(-0.5, -1.4, 0),
			Distance = 8,
		}
	)
	box(decor, "JerseySleeves", -201.2, 8.2, 238.4, -201.12, 9.6, 244.6, team.Primary, Enum.Material.Fabric)
	-- two team photos over the leather sofa
	local photos = {
		{
			z = 249.4,
			variant = 1,
			caption = "DRAFT NIGHT",
			title = "Draft Night Photo",
			info = "The GM and the coaches cheering a great first-round pick. There were pizza boxes everywhere!",
		},
		{
			z = 254.6,
			variant = 2,
			caption = "FIRST WIN",
			title = "First Win Photo",
			info = "The locker room after the team's first-ever win. The head coach got a sports-drink shower!",
		},
	}
	for _, ph in ipairs(photos) do
		local frame = box(decor, "TeamPhoto", -201.1, 6.2, ph.z - 2, -200.8, 9.2, ph.z + 2, DARK_WOOD, Enum.Material.Wood)
		teamPhoto(frame, Enum.NormalId.Left, 4, 3, team, ph.variant, ph.caption)
		BuildUtil.Look(frame, ph.title, ph.info, { At = Vector3.new(-0.5, -0.5, 0), Distance = 8 })
	end
	sofa(decor, frameAt(-202.3, 252, "W"), 10, LEATHER_BROWN, nil, { Object = "Leather Sofa" })
	cyl(decor, "FloorLampPole", Vector3.new(-203, FLOOR_TOP + 3.6, 259), 7.2, 0.25, "Y", DARK_METAL, Enum.Material.Metal)
	local lampShade = cyl(decor, "FloorLampShade", Vector3.new(-203, FLOOR_TOP + 7.6, 259), 1.6, 2, "Y", LAMP, Enum.Material.Fabric)
	BuildUtil.Light(lampShade, "PointLight", { Name = "LampLight", Range = 18, Brightness = 1, Color = WARM_LIGHT })

	-- two frames on the wood feature wall, either side of the logo: the owner's franchise
	-- certificate (live owner name) and the first dollar the franchise ever earned
	local paperColor = Color3.fromRGB(246, 240, 222)
	box(decor, "CertificateFrame", -232.4, 5.6, 202.1, -227.6, 9.4, 202.3, GOLD, Enum.Material.Metal)
	local certificate = box(decor, "Certificate", -232, 6, 202.3, -228, 9, 202.36, paperColor, Enum.Material.SmoothPlastic, NO_COLLIDE)
	local certGui, ownerLabel = BuildUtil.LiveText(certificate, Enum.NormalId.Back, "owner", "OWNER", {
		LabelName = "Live_owner",
		TextColor3 = INK,
		BackgroundColor3 = paperColor,
		BackgroundTransparency = 0,
		Font = Enum.Font.Garamond,
		PixelsPerStud = 40,
	})
	ownerLabel.Size = UDim2.new(0.84, 0, 0.3, 0)
	ownerLabel.Position = UDim2.new(0.08, 0, 0.42, 0)
	guiText(certGui, 0.3, 0.25, 3.4, 0.7, "FRANCHISE CERTIFICATE", team.Primary, Enum.Font.GothamBlack)
	guiFrame(certGui, 0.5, 1.05, 3, 0.04, GOLD)
	guiText(certGui, 0.3, 2.35, 2.9, 0.35, "THIS TEAM BELONGS TO THE OWNER ABOVE", Color3.fromRGB(90, 80, 70), Enum.Font.Garamond)
	guiDot(certGui, 3.6, 2.52, 0.45, Color3.fromRGB(200, 40, 40)) -- the wax seal
	BuildUtil.Look(
		certificate,
		"Franchise Certificate",
		"Official papers that say this whole franchise is yours: the stadium, the HQ and every player.",
		{ LookKey = "owner", Distance = 9 }
	)
	box(decor, "DollarFrame", -220.4, 5.6, 202.1, -215.6, 9.4, 202.3, DARK_WOOD, Enum.Material.Wood)
	local dollar = box(decor, "FirstDollar", -220, 6, 202.3, -216, 9, 202.36, paperColor, Enum.Material.SmoothPlastic, NO_COLLIDE)
	local dollarGui = canvas(dollar, Enum.NormalId.Back, 40, paperColor, 1)
	guiFrame(dollarGui, 0.5, 0.6, 3, 1.4, Color3.fromRGB(120, 168, 112))
	guiFrame(dollarGui, 0.62, 0.72, 2.76, 1.16, Color3.fromRGB(176, 210, 160))
	guiText(dollarGui, 0.7, 0.8, 0.8, 1, "1", Color3.fromRGB(40, 90, 50), Enum.Font.GothamBlack)
	guiText(dollarGui, 2.5, 0.8, 0.8, 1, "1", Color3.fromRGB(40, 90, 50), Enum.Font.GothamBlack)
	guiDot(dollarGui, 2, 1.3, 0.9, Color3.fromRGB(120, 168, 112))
	guiText(dollarGui, 0.4, 2.25, 3.2, 0.45, "OUR FIRST DOLLAR", INK, Enum.Font.Garamond)
	BuildUtil.Look(
		dollar,
		"Our First Dollar",
		"The very first dollar this franchise ever earned, framed forever. Every great stadium starts with one!",
		{ Distance = 9 }
	)

	-- a scale model of the stadium under glass, for planning upgrades
	local pedestal = box(decor, "ModelPedestal", -217, FLOOR_TOP, 237, -211, 3.3, 243, DARK_WOOD, Enum.Material.Wood)
	sign(pedestal, Enum.NormalId.Back, "OUR STADIUM", DARK_WOOD, team, { TextColor3 = GOLD, InsetX = 0.1, Top = 0.12, Height = 0.2 })
	box(decor, "ModelField", -215.6, 3.3, 239, -212.4, 3.45, 241, Color3.fromRGB(58, 125, 52), Enum.Material.Grass)
	for _, s in ipairs({
		{ -216.4, 241, -211.6, 241.8 },
		{ -216.4, 238.2, -211.6, 239 },
		{ -216.4, 239, -215.6, 241 },
		{ -212.4, 239, -211.6, 241 },
	}) do
		box(decor, "ModelStands", s[1], 3.3, s[2], s[3], 4.1, s[4], team.Primary)
	end
	box(decor, "ModelGlass", -216.8, 3.3, 237.2, -211.2, 5.4, 242.8, GLASS, Enum.Material.Glass, { Transparency = 0.75 })
	BuildUtil.Look(
		pedestal,
		"Stadium Model",
		"The GM's tiny model of your stadium, used to plan every upgrade. Buy more steps outside to make the real one even bigger!",
		{ At = Vector3.new(0, 0.6, 3.1), Distance = 8 }
	)
end

---------------------------------------------------------------------------------------------
-- Coaches' Offices X[-200, -150]
---------------------------------------------------------------------------------------------

-- A wall-mounted whiteboard: aluminium frame, white board, marker tray, a play drawn on it and a
-- "look" prompt describing the play. `face` is the board's face seen from the room;
-- (x0, z0)-(x1, z1) its footprint.
local function whiteboard(ctx, x0, z0, x1, z1, y0, y1, face, playIndex)
	local thinX = math.abs(x1 - x0) < math.abs(z1 - z0)
	box(ctx, "BoardFrame", x0, y0 - 0.2, z0, x1, y1 + 0.2, z1, CHROME, Enum.Material.Metal)
	local bx0, bx1, bz0, bz1, tray
	local out = (face == Enum.NormalId.Left or face == Enum.NormalId.Front) and -1 or 1
	if thinX then
		local front = out > 0 and math.max(x0, x1) or math.min(x0, x1)
		bx0, bx1 = front, front + out * 0.12
		bz0, bz1 = math.min(z0, z1) + 0.25, math.max(z0, z1) - 0.25
		tray = { front, front + out * 0.6, bz0 + 0.5, bz1 - 0.5 }
	else
		local front = out > 0 and math.max(z0, z1) or math.min(z0, z1)
		bz0, bz1 = front, front + out * 0.12
		bx0, bx1 = math.min(x0, x1) + 0.25, math.max(x0, x1) - 0.25
		tray = { bx0 + 0.5, bx1 - 0.5, front, front + out * 0.6 }
	end
	local white = box(ctx, "Whiteboard", bx0, y0, bz0, bx1, y1, bz1, WHITE)
	box(ctx, "MarkerTray", tray[1], y0 - 0.3, tray[3], tray[2], y0 - 0.05, tray[4], CHROME, Enum.Material.Metal)
	local W = thinX and (bz1 - bz0) or (bx1 - bx0)
	local gui = canvas(white, face, 30, nil, 1)
	drawPlay(gui, playIndex, 0, 0, W, y1 - y0, MARKER, playIndex == 2 and MARKER_RED or MARKER_BLUE)
	local play = PLAYS[(playIndex - 1) % #PLAYS + 1]
	BuildUtil.Look(white, "Play: " .. play.name, play.info, { At = Vector3.new(0, -1.2, 0), Distance = 9 })
	return white
end

-- Magnetic depth chart on the coaches' west wall (x = -199.2, facing +X): a header strip and the
-- live list of starters written in marker.
local function depthChart(ctx, team)
	box(ctx, "DepthChartFrame", -199.2, 3.3, 233.8, -198.9, 10.2, 258.2, CHROME, Enum.Material.Metal)
	local header = box(ctx, "DepthChartHeader", -198.9, 8.8, 234, -198.75, 10, 258, team.Primary)
	sign(header, Enum.NormalId.Right, "DEPTH CHART - STARTERS", team.Primary, team, { InsetX = 0.1, InsetY = 0.12 })
	local board = box(ctx, "DepthChart", -198.9, 3.5, 234, -198.78, 8.8, 258, WHITE)
	local label = liveScreen(board, Enum.NormalId.Right, "roster", "QB\nRB\nWR\nOL\nDEF\nK", {
		BackgroundColor3 = WHITE,
		TextColor3 = MARKER,
		Font = Enum.Font.PermanentMarker,
		PixelsPerStud = 24,
		Padding = 0.05,
	})
	label.Parent.LightInfluence = 1 -- a whiteboard, not a screen
	box(ctx, "DepthChartTray", -198.9, 3.2, 234.5, -198.3, 3.45, 257.5, CHROME, Enum.Material.Metal)
	BuildUtil.Look(
		board,
		"Depth Chart",
		"The coaches' list of who starts at every position. Draft better players to climb the chart! Your starting quarterback:",
		{ LookKey = "roster:QB", At = Vector3.new(0.6, -1, 0), Distance = 9 }
	)
end

function HQRoomsFront.hq_coaches(ctx)
	local team = ctx.colors

	-- Step 1: walls, sliding glass doors and the head coach's office with its own door ---------
	BuildUtil.Stage(ctx, 1)
	local shell = BuildUtil.Child(ctx, "Walls")
	local wallColor = Color3.fromRGB(204, 206, 210)
	roomShell(shell, {
		MinX = -200,
		MaxX = -150,
		Walls = { { -200, -199.2 }, { -150.8, -150 } },
		Openings = {
			{ From = -197.5, To = -188, Sill = SILL_TOP, Mullions = 1 },
			{ From = -178, To = -170 },
			-- (the pier east of the doorway is as wide as a door leaf: the leaf slides into it)
			{ From = -166, To = -153, Sill = SILL_TOP, Mullions = 2 },
		},
		Glass = true,
		WallColor = wallColor,
		FloorColor = Color3.fromRGB(66, 70, 82),
		FloorMaterial = Enum.Material.Carpet,
		DoorGlass = true,
		DoorSlide = true,
		DoorSign = "COACHES",
		DoorObject = "Coaches' Offices",
		DoorTitle = "Coaches' Offices",
		DoorInfo = "Where the coaching staff draw up plays, break down game film and set the depth chart.",
		-- one light in the head coach's office, two over the open-plan desks
		Lights = { { -188.4, 216 }, { -164, 216 }, { -175, 247 } },
	})
	-- head coach office X[-199.2, -177.6] Z[front, 230.4]: north wall with a door, glass east wall
	local hc = BuildUtil.Child(ctx, "HeadCoachWalls")
	box(hc, "OfficeWall", -199.2, SHELL_FLOOR, 229.6, -192.5, WALL_TOP, 230.4, wallColor, Enum.Material.Plaster)
	box(hc, "OfficeWall", -185.5, SHELL_FLOOR, 229.6, -178.4, WALL_TOP, 230.4, wallColor, Enum.Material.Plaster)
	box(hc, "OfficeWallTop", -192.5, DOOR_TOP, 229.6, -185.5, WALL_TOP, 230.4, wallColor, Enum.Material.Plaster)
	box(hc, "OfficeGlassBase", -178.4, SHELL_FLOOR, FRONT_Z, -177.6, SILL_TOP, 230.4, wallColor, Enum.Material.Plaster)
	box(hc, "OfficeGlass", -178.15, SILL_TOP, FRONT_Z, -177.85, DOOR_TOP, 230.4, GLASS, Enum.Material.Glass, { Transparency = 0.5 })
	box(hc, "OfficeGlassTop", -178.4, DOOR_TOP, FRONT_Z, -177.6, WALL_TOP, 230.4, wallColor, Enum.Material.Plaster)
	box(hc, "OfficeMullion", -178.5, SILL_TOP, 215.6, -177.5, DOOR_TOP, 216.2, DARK_METAL, Enum.Material.Metal)
	-- the office door swings into the office (toward -Z)
	BuildUtil.Door(hc, {
		Name = "HeadCoachDoor",
		Size = Vector3.new(7, DOOR_H, 0.3),
		CFrame = CFrame.new(-189, FLOOR_TOP + 0.05 + DOOR_H / 2, 230),
		Double = true,
		Color = DARK_WOOD,
		Window = true,
		Object = "Head Coach's Office",
		Title = "Head Coach's Office",
		Info = "Knock first! The head coach plans every game from this desk.",
		Distance = 8,
	})
	-- the coaches' wall seen from the lobby
	local lobbySign = box(hc, "LobbySign", -150, 3.5, 224, -149.8, 9.5, 250, team.Primary)
	sign(lobbySign, Enum.NormalId.Right, "COACHING STAFF", team.Primary, team, { InsetX = 0.06, InsetY = 0.22 })

	-- Step 2: head coach office ----------------------------------------------------------------
	BuildUtil.Stage(ctx, 2)
	local office = BuildUtil.Child(ctx, "HeadCoachOffice")
	box(office, "Rug", -197, FLOOR_TOP, 207, -181, 0.36, 224, shade(team.Primary, 0.7), Enum.Material.Carpet, PAINT)
	local desk = frameAt(-189, 213.4, "N")
	lblock(office, desk, "DeskBody", Vector3.new(9, 2.8, 3.4), 0, 0, 0, DARK_WOOD, Enum.Material.Wood)
	lblock(office, desk, "DeskTop", Vector3.new(9.8, 0.3, 4.2), 0, 2.8, 0.2, WOOD, Enum.Material.Wood)
	lblock(office, desk, "DeskPanel", Vector3.new(8, 1.6, 0.12), 0, 0.6, -1.76, team.Primary)
	local plate = lblock(office, desk, "Nameplate", Vector3.new(3.8, 0.7, 0.3), 0, 3.1, -1.5, GOLD, Enum.Material.Metal)
	sign(plate, Enum.NormalId.Front, "HEAD COACH", GOLD, team, { TextColor3 = INK, InsetX = 0.05, InsetY = 0.14 })
	local hcScreen = lblock(office, desk, "Monitor", Vector3.new(3.4, 2, 0.15), 1.8, 3.6, 1.3, SCREEN)
	screenText(hcScreen, Enum.NormalId.Back, "GAME FILM", SCREEN_BLUE, WHITE)
	lblock(office, desk, "MonitorStand", Vector3.new(0.5, 0.5, 0.5), 1.8, 3.1, 1.3, DARK_METAL, Enum.Material.Metal)
	local clip = lblock(office, desk, "Clipboard", Vector3.new(1.6, 0.08, 2.2), -2.4, 3.1, 0.2, WOOD, Enum.Material.Wood)
	sign(clip, Enum.NormalId.Top, "4TH & 1: GO FOR IT", WHITE, team, {
		TextColor3 = INK,
		BackgroundColor3 = WHITE,
		BackgroundTransparency = 0,
		Font = Enum.Font.GothamBold,
		InsetX = 0.1,
		InsetY = 0.08,
	})
	ball(office, "Whistle", (desk * CFrame.new(-0.6, 3.3, 0.1)).Position, 0.4, CHROME, Enum.Material.Metal)
	ball(office, "GameBall", (desk * CFrame.new(-4, 3.55, -0.9)).Position, 0.9, FOOTBALL, Enum.Material.Leather)
	-- (a camera seat: sit down to watch the game film on the office TV)
	officeChair(office, frameAt(-189, 209.6, "N"), LEATHER_BLACK, {
		Object = "Head Coach's Chair",
		Camera = { From = Vector3.new(-192.5, 7.2, 219.5), To = Vector3.new(-195.85, 6.85, 229.3), Fov = 34, Label = "GAME FILM" },
	})
	for i, gx in ipairs({ -192, -186 }) do
		chair(office, frameAt(gx, 218.6, "S"), team.Secondary, {
			Width = 2.4,
			Depth = 2.4,
			SeatHeight = 1.7,
			Material = Enum.Material.Leather,
			Object = "Guest Chair",
			NoPrompt = i == 2,
		})
	end
	-- playbook shelves on the west wall
	local shelf = box(office, "PlaybookShelf", -199.2, FLOOR_TOP, 205, -197.4, 8.6, 225, DARK_WOOD, Enum.Material.Wood)
	BuildUtil.Look(
		shelf,
		"Playbook Shelf",
		"Every play the team has ever run, from goal-line dives to the famous 'Flea Flicker Deluxe'. The head coach knows them all by heart!",
		{ At = Vector3.new(1.4, -1.2, 0), Distance = 8 }
	)
	local rows = {
		{ 1, team.Primary, "OFFENSE" },
		{ 3.4, team.Secondary, "PLAYBOOK" },
		{ 5.8, team.Primary, "DEFENSE" },
	}
	for _, row in ipairs(rows) do
		local binders = box(office, "Binders", -197.4, row[1], 205.6, -197.25, row[1] + 1.8, 224.4, row[2])
		sign(binders, Enum.NormalId.Right, row[3], row[2], team, { InsetX = 0.2, InsetY = 0.2 })
	end
	local tv = box(office, "FilmTV", -198.6, 5.2, 229.3, -193.1, 8.5, 229.6, BLACK)
	local tvGui = canvas(tv, Enum.NormalId.Front, 30, Color3.fromRGB(46, 120, 62), 0)
	drawPlay(tvGui, 1, 0.1, 0.1, 5.3, 3.1, WHITE, Color3.fromRGB(255, 220, 90))
	local doorPlate = box(office, "DoorPlate", -192.5, 9.5, 230.4, -185.5, 10.9, 230.6, team.Primary)
	sign(doorPlate, Enum.NormalId.Back, "HEAD COACH", team.Primary, team, { InsetX = 0.06, InsetY = 0.14 })

	-- Step 3: assistant coaches' desks, a huddle table and the sports-drink cooler -------------
	BuildUtil.Stage(ctx, 3)
	local bullpen = BuildUtil.Child(ctx, "AssistantDesks")
	local desks = {
		{ -194, 240, "OC", "Offensive Coordinator's Chair" },
		{ -185.5, 240, "QB COACH" },
		{ -194, 252, "WR COACH" },
		{ -163, 240, "DC", "Defensive Coordinator's Chair" },
		{ -155.4, 240, "DB COACH" },
		{ -155.4, 252, "LB COACH" },
	}
	for i, d in ipairs(desks) do
		local f = frameAt(d[1], d[2], "S") -- the coach sits on the corridor side, facing south
		lblock(bullpen, f, "DeskTop", Vector3.new(6.2, 0.25, 3), 0, 2.7, 0, WHITE)
		lblock(bullpen, f, "DeskPedestal", Vector3.new(1.6, 2.7, 2.6), 2.1, 0, 0, i <= 3 and team.Primary or team.Secondary)
		for _, mx in ipairs({ -1.3, 1.1 }) do
			local m = lblock(bullpen, f, "Monitor", Vector3.new(2.2, 1.4, 0.15), mx, 3.15, -0.9, SCREEN)
			screenText(m, Enum.NormalId.Back, mx < 0 and d[3] or "FILM", SCREEN_BLUE, WHITE)
		end
		chair(bullpen, f * CFrame.new(0, 0, 2.7), LEATHER_BLACK, {
			Width = 2.2,
			Depth = 2.2,
			SeatHeight = 1.9,
			BackHeight = 2.8,
			Object = d[4],
			NoPrompt = d[4] == nil,
		})
	end
	for _, s in ipairs({ { -189.75, "OFFENSE" }, { -159.2, "DEFENSE" } }) do
		local hanging = box(bullpen, "TeamSign", s[1] - 6, 10.4, 239.7, s[1] + 6, WALL_TOP, 240.1, team.Primary, nil, NO_COLLIDE)
		sign(hanging, Enum.NormalId.Front, s[2], team.Primary, team, { InsetX = 0.08, InsetY = 0.14 })
		sign(hanging, Enum.NormalId.Back, s[2], team.Primary, team, { InsetX = 0.08, InsetY = 0.14 })
	end
	-- huddle table for special teams in the south-east corner
	cyl(bullpen, "HuddleTableBase", Vector3.new(-164, FLOOR_TOP + 1.3, 216), 2.6, 1, "Y", DARK_METAL, Enum.Material.Metal)
	cyl(bullpen, "HuddleTable", Vector3.new(-164, FLOOR_TOP + 2.75, 216), 0.3, 7, "Y", WOOD, Enum.Material.Wood)
	for i, c in ipairs({ { -164, 220.6, "S" }, { -168.6, 216, "E" }, { -159.4, 216, "W" } }) do
		chair(bullpen, frameAt(c[1], c[2], c[3]), LEATHER_BLACK, {
			Material = Enum.Material.Leather,
			Object = "Huddle Chair",
			NoPrompt = i ~= 1,
		})
	end
	-- sports-drink cooler by the door
	box(bullpen, "CoolerStand", -168, FLOOR_TOP, 258.6, -166, 3.2, 260.6, WHITE)
	local cooler = cyl(bullpen, "SportsDrinkCooler", Vector3.new(-167, 4.35, 259.6), 2.3, 1.9, "Y", Color3.fromRGB(255, 128, 20))
	cyl(bullpen, "CoolerLid", Vector3.new(-167, 5.65, 259.6), 0.3, 2, "Y", WHITE)
	BuildUtil.Use(bullpen, cooler, "sportsdrink", { Object = "Sports Drink Cooler", Distance = 8 })

	-- Step 4: play whiteboards, the depth chart and the team rating board ----------------------
	BuildUtil.Stage(ctx, 4)
	local boards = BuildUtil.Child(ctx, "Whiteboards")
	whiteboard(boards, -151.1, 206, -150.8, 228, 3.5, 9.5, Enum.NormalId.Left, 4)
	whiteboard(boards, -151.1, 234, -150.8, 256, 3.5, 9.5, Enum.NormalId.Left, 2)
	whiteboard(boards, -184.4, 229.3, -178.8, 229.6, 4, 9, Enum.NormalId.Front, 1) -- in the head coach's office
	depthChart(boards, team)
	-- live TEAM RATING board on the office wall, facing the assistants' desks
	local ratingFrame = box(boards, "RatingFrame", -198.9, 4.8, 230.4, -193.1, 8.6, 230.6, CHROME, Enum.Material.Metal)
	ratingFrame.CastShadow = false
	local rating = box(boards, "RatingScreen", -198.6, 5.1, 230.6, -193.4, 8.3, 230.75, LED_DARK)
	liveScreen(
		rating,
		Enum.NormalId.Back,
		"rating",
		"TEAM RATING",
		{ TextColor3 = Color3.fromRGB(120, 230, 140), Font = Enum.Font.GothamBlack }
	)
	-- rolling whiteboard by the huddle table
	local rx, rz = -164, 207
	for _, s in ipairs({ -1, 1 }) do
		box(
			boards,
			"RollingLeg",
			rx + s * 4.3 - 0.15,
			FLOOR_TOP + 0.5,
			rz - 0.15,
			rx + s * 4.3 + 0.15,
			9.8,
			rz + 0.15,
			CHROME,
			Enum.Material.Metal
		)
		box(
			boards,
			"RollingFoot",
			rx + s * 4.3 - 0.2,
			FLOOR_TOP,
			rz - 1.2,
			rx + s * 4.3 + 0.2,
			FLOOR_TOP + 0.5,
			rz + 1.2,
			DARK_METAL,
			Enum.Material.Metal
		)
	end
	local rolling = box(boards, "RollingBoard", rx - 4.15, 4.4, rz - 0.12, rx + 4.15, 9.6, rz + 0.12, WHITE)
	local rollingGui = canvas(rolling, Enum.NormalId.Back, 30, nil, 1)
	drawPlay(rollingGui, 3, 0, 0, 8.3, 5.2, MARKER, MARKER_RED)
	BuildUtil.Look(rolling, "Play: " .. PLAYS[3].name, PLAYS[3].info, { At = Vector3.new(0, -1.5, 0.4), Distance = 9 })
	box(boards, "RollingTray", rx - 3.6, 4.1, rz + 0.12, rx + 3.6, 4.35, rz + 0.6, CHROME, Enum.Material.Metal)
	for i, color in ipairs({ MARKER, MARKER_BLUE, MARKER_RED }) do
		cyl(boards, "Marker", Vector3.new(rx - 2 + i * 0.9, 4.48, rz + 0.36), 0.8, 0.22, "X", color)
	end
end

---------------------------------------------------------------------------------------------
-- Interview (press conference) room X[-50, 0]
---------------------------------------------------------------------------------------------

-- A TV camera on a tripod standing at `base` (feet level), looking along `facing`. Returns the
-- camera body.
local function tvCamera(ctx, base, facing, team)
	local top = base + Vector3.new(0, 4.4, 0)
	for k = 0, 2 do
		local a = k * 2 * math.pi / 3 + 0.4
		local foot = base + Vector3.new(math.cos(a) * 1.6, 0.05, math.sin(a) * 1.6)
		rod(ctx, "TripodLeg", foot, top, 0.18, DARK_METAL, Enum.Material.Metal)
	end
	local f = CFrame.new(top) * CFrame.Angles(0, FACING[facing], 0)
	local body = lblock(ctx, f, "CameraBody", Vector3.new(1.3, 1.5, 2.6), 0, 0, 0, BLACK)
	sign(body, Enum.NormalId.Left, "TV", BLACK, team, { TextColor3 = WHITE, InsetX = 0.25, InsetY = 0.25 })
	cyl(ctx, "CameraLens", (f * CFrame.new(0, 0.75, -1.8)).Position, 1.1, 1, (facing == "N" or facing == "S") and "Z" or "X", DARK_METAL)
	lblock(ctx, f, "TallyLight", Vector3.new(0.3, 0.3, 0.3), 0, 1.5, -0.9, ON_AIR_RED, Enum.Material.Neon)
	BuildUtil.Look(
		body,
		"TV Camera",
		"Live TV cameras send every press conference to fans at home. Smile, you might be on the evening news!",
		{
			Distance = 8,
		}
	)
	return body
end

-- Where a speaker's head is when they stand at the press-room podium (TV close-ups aim here).
local PODIUM_HEAD = Vector3.new(-39.5, 6.1, 210.4)

function HQRoomsFront.hq_interview(ctx)
	local team = ctx.colors
	local name = teamLabel(ctx)

	-- Step 1: dark walls + the step-and-repeat backdrop ---------------------------------------
	BuildUtil.Stage(ctx, 1)
	local shell = BuildUtil.Child(ctx, "Walls")
	roomShell(shell, {
		MinX = -50,
		MaxX = 0,
		Walls = { { -50, -49.2 }, { -0.8, 0 } },
		Openings = { { From = -28, To = -20 } },
		WallColor = Color3.fromRGB(58, 60, 68),
		FloorColor = Color3.fromRGB(44, 46, 54),
		FloorMaterial = Enum.Material.Carpet,
		CeilingColor = Color3.fromRGB(48, 50, 56),
		DoorColor = BLACK,
		DoorSign = "PRESS ROOM",
		DoorObject = "Interview Room",
		DoorTitle = "Interview Room",
		DoorInfo = "Press conferences happen here. Step up to the podium and answer the reporters' questions!",
	})
	local backdrop = BuildUtil.Child(ctx, "Backdrop")
	-- the backdrop covers the whole front wall, so TV close-ups of the podium only ever show the
	-- team pattern behind the speaker (never the facade glass)
	local backX0, backX1 = -48.2, -1.8
	local panel = box(backdrop, "Backdrop", backX0, FLOOR_TOP, 203.4, backX1, 11.4, 204.2, WHITE)
	-- step-and-repeat: staggered rows of the team name and the monogram badge
	local gui = canvas(panel, Enum.NormalId.Back, 14, WHITE, 1)
	local W, H = backX1 - backX0, 11.08
	local cols, rowsN = 5, 4
	local cellW, cellH = W / cols, H / rowsN
	local nameColor = contrastRatio(WHITE, team.Primary) >= 3 and team.Primary or INK
	for r = 0, rowsN - 1 do
		for c = -1, cols do
			local x = c * cellW + ((r % 2 == 1) and cellW / 2 or 0)
			if x > -cellW * 0.6 and x < W - cellW * 0.4 then
				if (c + r) % 2 == 0 then
					guiText(gui, x + 0.4, r * cellH + cellH * 0.28, cellW - 0.8, cellH * 0.44, name, nameColor, Enum.Font.GothamBlack)
				else
					local d = cellH * 0.62
					guiRing(gui, x + cellW / 2, r * cellH + cellH / 2, d, 0.16, team.Secondary)
					guiText(
						gui,
						x + cellW / 2 - d * 0.35,
						r * cellH + cellH / 2 - d * 0.3,
						d * 0.7,
						d * 0.6,
						monogram(ctx),
						nameColor,
						Enum.Font.GothamBlack
					)
				end
			end
		end
	end
	for _, ex in ipairs({ backX0 - 1, backX1 }) do
		box(backdrop, "BackdropEdge", ex, FLOOR_TOP, 203.3, ex + 1, 11.6, 204.3, team.Primary)
	end
	local header = box(backdrop, "BackdropHeader", backX0 - 1, 11.6, 203.3, backX1 + 1, WALL_TOP, 204.6, Color3.fromRGB(30, 30, 36))
	sign(header, Enum.NormalId.Back, "PRESS CONFERENCE", Color3.fromRGB(30, 30, 36), team, { InsetX = 0.2, InsetY = 0.1 })
	-- seen from the lobby: a PRESS ROOM panel and an ON AIR light, high on the lobby's east wall
	-- above the grand staircase's first flight (Builders/HQRoomsUpperFront.lua hq_atrium: its
	-- handrail tops out at y 9.9 at z 224), so the stairs never hide them
	local lobbyPanel = box(backdrop, "LobbySign", -50.2, 10.4, 212, -50, 14.4, 224, team.Primary)
	sign(lobbyPanel, Enum.NormalId.Left, "PRESS ROOM", team.Primary, team, { InsetX = 0.08, InsetY = 0.2 })
	local onAir = box(backdrop, "OnAirLight", -50.4, 14.8, 214, -50, 15.9, 222, ON_AIR_RED, Enum.Material.Neon)
	sign(onAir, Enum.NormalId.Left, "ON AIR", ON_AIR_RED, team, { TextColor3 = WHITE, InsetX = 0.1, InsetY = 0.12, LightInfluence = 0 })

	-- Step 2: stage, panel table and the podium with microphones ------------------------------
	BuildUtil.Stage(ctx, 2)
	local stage = BuildUtil.Child(ctx, "Stage")
	local stageTop = 1.5
	box(stage, "Stage", -44, FLOOR_TOP, 204.2, -6, stageTop, 216, Color3.fromRGB(36, 36, 42), Enum.Material.WoodPlanks)
	box(stage, "StageSkirt", -44.1, FLOOR_TOP, 216, -5.9, stageTop - 0.05, 216.2, team.Primary)
	box(stage, "StageStep", -29, FLOOR_TOP, 216.2, -21, 0.9, 218.2, Color3.fromRGB(36, 36, 42), Enum.Material.WoodPlanks)
	-- (the panel table leaves a 5-stud walk between it and the podium)
	box(stage, "PanelTable", -33, 4, 207.2, -13, 4.3, 210.2, Color3.fromRGB(40, 40, 46))
	local skirt = box(stage, "TableSkirt", -33, stageTop, 210, -13, 4, 210.25, team.Primary, Enum.Material.Fabric)
	sign(skirt, Enum.NormalId.Back, name, team.Primary, team, { InsetX = 0.1, InsetY = 0.22 })
	local seats = { { -28, "HEAD COACH" }, { -23, "QB #12" }, { -18, "GM" } }
	for i, s in ipairs(seats) do
		chair(stage, frameAt(s[1], 206.1, "N", stageTop), LEATHER_BLACK, {
			Material = Enum.Material.Leather,
			BackHeight = 3,
			Object = "Panel Chair",
			NoPrompt = i ~= 2,
		})
		local tent = box(stage, "NameTent", s[1] - 1.1, 4.3, 209.5, s[1] + 1.1, 4.9, 209.8, WHITE)
		sign(tent, Enum.NormalId.Back, s[2], WHITE, team, { TextColor3 = INK, InsetX = 0.05, InsetY = 0.12 })
		box(stage, "TableMic", s[1] - 0.06, 4.3, 208.5, s[1] + 0.06, 5.3, 208.62, BLACK)
		ball(stage, "MicHead", Vector3.new(s[1], 5.45, 208.56), 0.38, DARK_METAL, Enum.Material.Metal)
		cyl(stage, "WaterBottle", Vector3.new(s[1] + 1.6, 4.75, 208.4), 0.9, 0.38, "Y", Color3.fromRGB(255, 130, 30), Enum.Material.Glass, {
			Transparency = 0.2,
		})
	end
	-- podium: wooden lectern, team front, a bundle of station microphones with flags. Taking the
	-- podium starts a press conference; the camera cuts to a TV close-up from the press seats.
	local podium = frameAt(-39.5, 212.2, "N", stageTop)
	local lectern = lblock(stage, podium, "Podium", Vector3.new(3.2, 3.8, 2.2), 0, 0, 0, DARK_WOOD, Enum.Material.Wood)
	BuildUtil.Use(stage, lectern, "podium", {
		Object = "Podium",
		Title = "Press Conference",
		Info = "The reporters want to hear about the big game. Pick the best answers and the fans will love you!",
		At = Vector3.new(0, 1.2, 1.6), -- on the speaker's side
		Distance = 8,
		Camera = { From = Vector3.new(-35, 6.6, 238), To = PODIUM_HEAD, Fov = 22 },
	})
	local podiumFront = lblock(stage, podium, "PodiumFront", Vector3.new(2.6, 2.2, 0.12), 0, 0.8, -1.16, team.Primary)
	sign(podiumFront, Enum.NormalId.Front, monogram(ctx), team.Primary, team, { InsetX = 0.2, InsetY = 0.15 })
	lblock(stage, podium, "PodiumTop", Vector3.new(3.6, 0.3, 2.6), 0, 3.8, 0, WOOD, Enum.Material.Wood)
	local flagColors = { ON_AIR_RED, MARKER_BLUE, Color3.fromRGB(255, 200, 40), WHITE }
	for i, mx in ipairs({ -0.9, -0.3, 0.3, 0.9 }) do
		local lean = mx * 0.25
		local foot = (podium * CFrame.new(mx * 0.9, 4.1, -0.9)).Position
		local tip = (podium * CFrame.new(mx * 0.5 + lean, 5.5, -0.15)).Position
		rod(stage, "PodiumMic", foot, tip, 0.1, BLACK)
		ball(stage, "PodiumMicHead", tip, 0.34, DARK_METAL, Enum.Material.Metal)
		if i % 2 == 1 then
			local cube = BuildUtil.Part(stage, {
				Name = "MicFlag",
				Size = Vector3.new(0.5, 0.5, 0.5),
				CFrame = CFrame.new(foot:Lerp(tip, 0.6)),
				Color = flagColors[i],
			})
			sign(cube, Enum.NormalId.Back, i == 1 and "7" or "TV", flagColors[i], team, { TextColor3 = INK, InsetX = 0.1, InsetY = 0.1 })
		end
	end

	-- Step 3: press chairs, TV cameras (one with a camera-operator seat), lights, ON AIR -------
	BuildUtil.Stage(ctx, 3)
	local press = BuildUtil.Child(ctx, "Press")
	for ri, rz in ipairs({ 229, 234, 239 }) do
		for ci, cx in ipairs({ -38, -33.5, -29, -21, -16.5, -12 }) do
			chair(press, frameAt(cx, rz, "S"), Color3.fromRGB(70, 72, 80), {
				BackColor = team.Primary,
				SeatHeight = 1.7,
				BackHeight = 2.4,
				Object = "Press Seat",
				NoPrompt = not (ri == 1 and (ci == 3 or ci == 4)),
			})
		end
	end
	local riserTop = 1.3 -- one easy step up from the floor
	for _, span in ipairs({ { -44, -32 }, { -18, -6 } }) do
		box(press, "CameraRiser", span[1], FLOOR_TOP, 248.5, span[2], riserTop, 255.5, BLACK)
		box(press, "RiserEdge", span[1], riserTop - 0.15, 248.35, span[2], riserTop, 248.5, team.Secondary, Enum.Material.Neon, PAINT)
	end
	tvCamera(press, Vector3.new(-38, riserTop, 251.4), "S", team)
	tvCamera(press, Vector3.new(-12, riserTop, 251.4), "S", team)
	tvCamera(press, Vector3.new(-45, FLOOR_TOP, 233), "S", team)
	-- the camera operator's stool: sit down to watch the podium through the camera
	BuildUtil.Seat(press, {
		Name = "CameraStool",
		Size = Vector3.new(1.8, 1.8, 1.8),
		CFrame = CFrame.new(-38, riserTop + 0.9, 254.3),
		Color = DARK_METAL,
		Material = Enum.Material.Metal,
		Object = "Camera Operator's Stool",
		Camera = { From = Vector3.new(-38, 7.4, 248.4), To = PODIUM_HEAD, Fov = 24, Label = "PRESS CONFERENCE - LIVE" },
	})
	for _, l in ipairs({ { -46, 221, -1.05 }, { -4, 221, 1.05 } }) do
		cyl(press, "LightStand", Vector3.new(l[1], FLOOR_TOP + 3.6, l[2]), 7.2, 0.25, "Y", DARK_METAL, Enum.Material.Metal)
		local softbox = BuildUtil.Part(press, {
			Name = "Softbox",
			Size = Vector3.new(3, 3, 1),
			CFrame = CFrame.new(l[1], FLOOR_TOP + 8.4, l[2]) * CFrame.Angles(0, l[3], 0) * CFrame.Angles(math.rad(-15), 0, 0),
			Color = LAMP,
			Material = Enum.Material.Neon,
		})
		BuildUtil.Light(
			softbox,
			"SpotLight",
			{ Name = "StageLight", Face = Enum.NormalId.Front, Angle = 60, Range = 26, Brightness = 2.5, Color = WARM_LIGHT }
		)
	end
	box(press, "Cable", -40, FLOOR_TOP, 236, -39.7, 0.38, 251, BLACK, Enum.Material.Rubber, PAINT)
	box(press, "Cable", -9.8, FLOOR_TOP, 222, -9.5, 0.38, 251, BLACK, Enum.Material.Rubber, PAINT)
	-- press monitors on both side walls: the latest score (west) and the team summary (east)
	local westTV = box(press, "PressMonitor", -49.2, 5.4, 225, -48.9, 10.2, 234, BLACK)
	local westScreen = box(press, "PressMonitorScreen", -48.9, 5.7, 225.3, -48.8, 9.9, 233.7, LED_DARK)
	liveScreen(westScreen, Enum.NormalId.Right, "score", name .. " 0 - 0 VISITORS", {
		TextColor3 = WHITE,
		Font = Enum.Font.GothamBlack,
		PixelsPerStud = 20,
		Padding = 0.08,
	})
	BuildUtil.Look(
		westTV,
		"Press Monitor",
		"Reporters check the latest score here before they fire off their questions. Win big and the questions get easy!",
		{ LookKey = "record", At = Vector3.new(0.6, -1.6, 0), Distance = 9 }
	)
	box(press, "PressMonitor", -1.1, 5.4, 225, -0.8, 10.2, 234, BLACK)
	local eastScreen = box(press, "PressMonitorScreen", -1.2, 5.7, 225.3, -1.1, 9.9, 233.7, LED_DARK)
	liveScreen(eastScreen, Enum.NormalId.Left, "summary", name, {
		TextColor3 = LED_TEXT,
		Font = Enum.Font.GothamBold,
		PixelsPerStud = 20,
		Padding = 0.06,
	})
	-- ON AIR light over the door, inside the room
	local live = box(press, "OnAirSign", -27, 9.6, 262.4, -21, 10.9, 262.8, ON_AIR_RED, Enum.Material.Neon)
	sign(live, Enum.NormalId.Front, "ON AIR", ON_AIR_RED, team, { TextColor3 = WHITE, InsetX = 0.12, InsetY = 0.14, LightInfluence = 0 })
	BuildUtil.Light(live, "PointLight", { Name = "OnAirGlow", Range = 8, Brightness = 1, Color = ON_AIR_RED })
end

---------------------------------------------------------------------------------------------
-- Team Meeting Room X[0, 50]
---------------------------------------------------------------------------------------------

function HQRoomsFront.hq_meeting(ctx)
	local team = ctx.colors
	local name = teamLabel(ctx)

	-- Step 1: walls, team crest and motto ------------------------------------------------------
	BuildUtil.Stage(ctx, 1)
	local shell = BuildUtil.Child(ctx, "Walls")
	roomShell(shell, {
		MinX = 0,
		MaxX = 50,
		Walls = { { 0, 0.8 }, { 49.2, 50 } },
		Openings = { { From = 22, To = 30 }, { From = 36, To = 47, Sill = SILL_TOP, Mullions = 1 } },
		Glass = true,
		WallColor = Color3.fromRGB(196, 200, 208),
		FloorColor = Color3.fromRGB(58, 62, 74),
		FloorMaterial = Enum.Material.Carpet,
		DoorColor = DARK_WOOD,
		DoorWindow = true,
		DoorSign = "TEAM MEETING",
		DoorObject = "Team Meeting Room",
		DoorTitle = "Team Meeting Room",
		DoorInfo = "The whole team meets here before every game to go over the game plan.",
	})
	local walls = BuildUtil.Child(ctx, "WallArt")
	local crest = wallLogo(walls, 49.2, 7.6, 232, "X", -1, 8.4, team, monogram(ctx))
	BuildUtil.Look(crest, "Team Crest", "Your team's crest. Players tap it for luck on their way out to the field.", {
		LookKey = "team",
		Distance = 9,
	})
	local namePanel = box(walls, "TeamName", 48.9, 2, 222, 49.2, 3.4, 242, team.Primary)
	sign(namePanel, Enum.NormalId.Left, name, team.Primary, team, { InsetX = 0.05, InsetY = 0.12 })
	local motto = box(walls, "Motto", 0.8, 8, 214, 1, 10.4, 250, team.Secondary)
	sign(motto, Enum.NormalId.Right, "ONE TEAM - ONE GOAL", team.Secondary, team, { InsetX = 0.05, InsetY = 0.12 })
	BuildUtil.Look(
		motto,
		"Team Motto",
		"ONE TEAM - ONE GOAL! The whole squad shouts it together before every game day.",
		{ At = Vector3.new(0.6, -3, 0), Distance = 9 }
	)
	-- framed posters on both side walls
	local posters = {
		{ 0.8, 1.05, 218, "PLAYOFFS\nBOUND", Enum.NormalId.Right },
		{ 0.8, 1.05, 242, "TEAM\nFIRST", Enum.NormalId.Right },
		{ 48.95, 49.2, 215, "CHAMPIONS\nMINDSET", Enum.NormalId.Left },
		{ 48.95, 49.2, 249, "FINISH\nSTRONG", Enum.NormalId.Left },
	}
	for i, p in ipairs(posters) do
		local color = i % 2 == 1 and team.Primary or team.Secondary
		local poster = box(walls, "Poster", p[1], 3, p[3] - 3, p[2], 7.2, p[3] + 3, color, Enum.Material.SmoothPlastic)
		sign(poster, p[5], p[4], color, team, { InsetX = 0.1, InsetY = 0.16, Wrap = true })
	end

	-- Step 2: tiered rows of seats facing the screen -------------------------------------------
	BuildUtil.Stage(ctx, 2)
	local seating = BuildUtil.Child(ctx, "Seating")
	local riseH = 0.7
	local rowZ = { 229, 234, 239, 244 }
	local riserColor = Color3.fromRGB(74, 78, 92)
	for r = 2, 4 do
		local z0 = rowZ[r] - 2
		local z1 = (r == 4) and 249.5 or (rowZ[r + 1] - 2)
		local top = FLOOR_TOP + riseH * (r - 1)
		box(seating, "Riser", 6, FLOOR_TOP, z0, 44, top, z1, riserColor, Enum.Material.Carpet)
		box(seating, "RiserGlow", 6, top - 0.15, z0 - 0.08, 44, top - 0.05, z0, team.Secondary, Enum.Material.Neon, PAINT)
	end
	-- two steps up the back of the top riser in the middle aisle (from the door side)
	for k, top in ipairs({ FLOOR_TOP + riseH * 2, FLOOR_TOP + riseH }) do
		local z0 = 249.5 + (k - 1) * 1.6
		box(seating, "BackStep", 22.8, FLOOR_TOP, z0, 27.2, top, z0 + 1.6, riserColor, Enum.Material.Carpet)
	end
	local seatXs = { 8, 12.5, 17, 21.5, 28.5, 33, 37.5, 42 }
	for r, z in ipairs(rowZ) do
		local baseY = FLOOR_TOP + riseH * (r - 1)
		for i, x in ipairs(seatXs) do
			local f = frameAt(x, z, "S", baseY)
			-- every seat works (touch it to sit); the front-row aisle seat also shows a prompt and
			-- zooms in on the video wall
			local front = r == 1 and i == 4
			lseat(seating, f, Vector3.new(2.2, 1.7, 2), 0, 0, -0.1, team.Primary, Enum.Material.Fabric, {
				Name = "MeetingSeat",
				Object = "Front Row Seat",
				NoPrompt = not front,
				Camera = front and { From = Vector3.new(25, 6.4, 224), To = Vector3.new(25, 6.6, 203), Fov = 52, Label = "GAME PLAN" }
					or nil,
			})
			lblock(seating, f, "SeatBack", Vector3.new(2.2, 3.6, 0.45), 0, 0, 1.12, shade(team.Primary, 0.65), Enum.Material.Fabric)
		end
	end

	-- Step 3: stage with podium, the video wall (live season + summary, game plan), speakers ---
	BuildUtil.Stage(ctx, 3)
	local front = BuildUtil.Child(ctx, "Stage")
	local stageTop = 1.1
	box(front, "Stage", 5, FLOOR_TOP, 203, 45, stageTop, 213, Color3.fromRGB(46, 40, 36), Enum.Material.WoodPlanks)
	box(front, "StageEdge", 5, 0.4, 213, 45, stageTop - 0.1, 213.15, team.Primary)
	box(front, "ScreenFrame", 8, FLOOR_TOP, 201.8, 42, 11.6, 202.8, BLACK) -- a video wall standing on the floor
	local season = box(front, "SeasonScreen", 8.6, 9.75, 202.8, 41.4, 11.05, 202.95, LED_DARK)
	liveScreen(season, Enum.NormalId.Back, "season", "SEASON 1 - WEEK 1", { PixelsPerStud = 20, Padding = 0.1 })
	local plan = box(front, "GamePlanScreen", 8.6, 3.2, 202.8, 24.8, 9.55, 202.95, Color3.fromRGB(14, 22, 40))
	local W, H = 16.2, 6.35
	local gui = canvas(plan, Enum.NormalId.Back, 20, Color3.fromRGB(14, 22, 40), 0)
	guiFrame(gui, 0, 0, W, H * 0.16, team.Primary)
	guiText(
		gui,
		0.4,
		H * 0.02,
		W * 0.8,
		H * 0.12,
		"THIS WEEK'S GAME PLAN",
		textColorOn(team.Primary, team),
		Enum.Font.GothamBlack,
		Enum.TextXAlignment.Left
	)
	drawPlay(gui, 1, W * 0.01, H * 0.18, W * 0.6, H * 0.8, WHITE, Color3.fromRGB(255, 214, 80))
	local keys = { "1. PROTECT THE BALL", "2. WIN THE TRENCHES", "3. FINISH STRONG" }
	for i, line in ipairs(keys) do
		guiText(gui, W * 0.63, H * (0.26 + (i - 1) * 0.22), W * 0.35, H * 0.14, line, WHITE, Enum.Font.GothamBold, Enum.TextXAlignment.Left)
	end
	BuildUtil.Look(
		plan,
		"This Week's Game Plan",
		"Run the Trips Right 32 Dive until the defense creeps up, then throw it deep! The three keys to the game are on the screen.",
		{ At = Vector3.new(0, -1.5, 0), Distance = 10 }
	)
	local summary = box(front, "SummaryScreen", 25.2, 3.2, 202.8, 41.4, 9.55, 202.95, LED_DARK)
	liveScreen(summary, Enum.NormalId.Back, "summary", name, { TextColor3 = WHITE, PixelsPerStud = 16, Font = Enum.Font.GothamBlack })
	BuildUtil.Look(
		summary,
		"Season Screen",
		"Every game day is one week of the season. Win enough games to reach the playoffs, then win two more for the title!",
		{ LookKey = "season", At = Vector3.new(0, -1.5, 0.2), Distance = 10 }
	)
	BuildUtil.Light(
		summary,
		"SurfaceLight",
		{ Name = "ScreenGlow", Face = Enum.NormalId.Back, Range = 20, Brightness = 1, Color = Color3.fromRGB(150, 180, 255) }
	)
	local podium = frameAt(38, 209.4, "N", stageTop)
	local lectern = lblock(front, podium, "Podium", Vector3.new(2.8, 3.8, 2), 0, 0, 0, DARK_WOOD, Enum.Material.Wood)
	BuildUtil.Look(
		lectern,
		"Coach's Podium",
		"The head coach gives the pre-game speech from here. One speech was so loud it rattled the trophy case in the lobby!",
		{ At = Vector3.new(0, 0.4, -1.2), Distance = 8 }
	)
	local podiumFront = lblock(front, podium, "PodiumFront", Vector3.new(2.2, 2.2, 0.12), 0, 0.8, -1.06, team.Primary)
	sign(podiumFront, Enum.NormalId.Front, monogram(ctx), team.Primary, team, { InsetX = 0.2, InsetY = 0.15 })
	lblock(front, podium, "PodiumTop", Vector3.new(3.2, 0.3, 2.4), 0, 3.8, 0, WOOD, Enum.Material.Wood)
	local micFoot = (podium * CFrame.new(0, 4.1, -0.5)).Position
	local micTip = (podium * CFrame.new(0, 5.2, -1)).Position
	rod(front, "PodiumMic", micFoot, micTip, 0.1, BLACK)
	ball(front, "PodiumMicHead", micTip, 0.34, DARK_METAL, Enum.Material.Metal)
	lblock(front, podium, "Laptop", Vector3.new(1.8, 0.1, 1.2), 0.4, 4.1, 0.3, CHROME, Enum.Material.Metal)
	for _, sx in ipairs({ 6.6, 43.4 }) do
		box(front, "Speaker", sx - 1, stageTop, 204, sx + 1, stageTop + 6, 206, BLACK)
		cyl(front, "SpeakerCone", Vector3.new(sx, stageTop + 4.2, 206.05), 0.1, 1.4, "Z", DARK_METAL)
	end
end

---------------------------------------------------------------------------------------------
-- Player Lounge X[50, 98]
---------------------------------------------------------------------------------------------

-- Arcade cabinet against the west wall, facing +X. Press E at the controls to play.
local function arcade(ctx, z, bodyColor, glow, title, team)
	local f = frameAt(52.7, z, "E")
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
	guiFrame(gui, 0.4, 1.95, 2, 0.12, glow)
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

function HQRoomsFront.hq_lounge(ctx)
	local team = ctx.colors
	local name = teamLabel(ctx)

	-- Step 1: walls + striped team carpet ------------------------------------------------------
	BuildUtil.Stage(ctx, 1)
	local shell = BuildUtil.Child(ctx, "Walls")
	roomShell(shell, {
		MinX = 50,
		MaxX = 98.5,
		Walls = { { 50, 50.8 } },
		Openings = {
			{ From = 52.5, To = 61, Sill = SILL_TOP, Mullions = 1 },
			{ From = 71, To = 79 },
			{ From = 83, To = 96, Sill = SILL_TOP, Mullions = 2 },
		},
		Glass = true,
		WallColor = Color3.fromRGB(236, 232, 222),
		FloorColor = shade(team.Primary, 0.5),
		FloorMaterial = Enum.Material.Carpet,
		DoorColor = team.Secondary,
		DoorWindow = true,
		DoorSign = "PLAYER LOUNGE",
		DoorObject = "Player Lounge",
		DoorTitle = "Player Lounge",
		DoorInfo = "Players only! Relax with the big TV, pool, ping-pong, arcade games and free snacks.",
	})
	local carpet = BuildUtil.Child(ctx, "Carpet")
	box(carpet, "CarpetStripe", 50.8, FLOOR_TOP, 228.5, 98.5, 0.35, 231, team.Secondary, Enum.Material.Carpet, PAINT)
	box(carpet, "CarpetStripe", 50.8, FLOOR_TOP, 232.5, 98.5, 0.35, 235, team.Trim, Enum.Material.Carpet, PAINT)
	local players = box(carpet, "PlayersOnly", 50.8, 9, 212, 51, 11.4, 240, team.Primary)
	sign(players, Enum.NormalId.Right, "PLAYERS ONLY", team.Primary, team, { InsetX = 0.05, InsetY = 0.12 })

	-- Step 2: sectional couch (a TV camera seat in the middle), big TV with the live score -----
	BuildUtil.Stage(ctx, 2)
	local tvArea = BuildUtil.Child(ctx, "TVCorner")
	box(tvArea, "Rug", 70, FLOOR_TOP, 206, 96.6, 0.37, 226, Color3.fromRGB(70, 72, 80), Enum.Material.Carpet, PAINT)
	box(tvArea, "TVWall", 74, FLOOR_TOP, 201.5, 94, WALL_TOP, 202.3, Color3.fromRGB(56, 58, 66), Enum.Material.Slate)
	box(tvArea, "TVConsole", 76, FLOOR_TOP, 202.3, 92, 2.2, 204.8, BLACK, Enum.Material.Wood)
	box(tvArea, "Soundbar", 78, 2.2, 203.6, 90, 2.7, 204.3, DARK_METAL)
	box(tvArea, "GameConsole", 90.6, 2.2, 202.8, 91.8, 3.6, 204.3, WHITE)
	local tvFrame = box(tvArea, "TV", 76.5, 3.2, 202.3, 91.5, 11.4, 203, BLACK)
	BuildUtil.Look(
		tvFrame,
		"Players' Big TV",
		"Game replays all day long! The players watch your last game here to spot what to do better next week.",
		{ LookKey = "record", At = Vector3.new(-5.5, -3.4, 0.6), Distance = 9 }
	)
	local fieldGreen = Color3.fromRGB(18, 58, 30)
	local tvScreen = box(tvArea, "TVScreen", 77, 3.7, 203, 91, 10.9, 203.1, fieldGreen)
	liveScreen(tvScreen, Enum.NormalId.Back, "score", name .. " 0 - 0 VISITORS", {
		BackgroundColor3 = fieldGreen,
		TextColor3 = WHITE,
		Font = Enum.Font.GothamBlack,
		PixelsPerStud = 20,
		Padding = 0.1,
	})
	BuildUtil.Light(
		tvScreen,
		"SurfaceLight",
		{ Name = "TVGlow", Face = Enum.NormalId.Back, Range = 16, Brightness = 1, Color = Color3.fromRGB(150, 255, 160) }
	)
	local couch = Color3.fromRGB(70, 74, 86)
	sofa(tvArea, frameAt(84, 221, "S"), 20, couch, shade(couch, 0.8), {
		Object = "Couch",
		Camera = { From = Vector3.new(84, 6.6, 213), To = Vector3.new(84, 7.3, 203.1), Fov = 50, Label = "GAME ON TV" },
	})
	sofa(tvArea, frameAt(96.3, 213, "W"), 10, couch, shade(couch, 0.8), { Object = "Couch" })
	for i, px0 in ipairs({ 78, 90 }) do
		BuildUtil.Part(tvArea, {
			Name = "Pillow",
			Size = Vector3.new(1.6, 1.5, 0.5),
			CFrame = CFrame.new(px0, 2.6, 221.1) * CFrame.Angles(math.rad(-15), 0, 0),
			Color = i == 2 and team.Secondary or team.Primary,
			Material = Enum.Material.Fabric,
			CanCollide = false,
		})
	end
	box(tvArea, "CoffeeTableBase", 79, FLOOR_TOP, 212, 89, 1.2, 214, DARK_WOOD, Enum.Material.Wood)
	box(tvArea, "CoffeeTable", 78, 1.2, 211, 90, 1.5, 215, WOOD, Enum.Material.Wood)
	box(tvArea, "Controller", 82, 1.5, 212.6, 83.2, 1.75, 213.4, BLACK)
	box(tvArea, "Controller", 85.6, 1.5, 213, 86.8, 1.75, 213.8, team.Primary)
	cyl(tvArea, "SnackBowl", Vector3.new(88, 1.75, 213), 0.5, 1.4, "Y", Color3.fromRGB(255, 220, 120))
	-- bean bags facing the TV
	local tvSpot = Vector3.new(84, 0, 203)
	for i, bean in ipairs({ { 64, 209 }, { 68.5, 215 }, { 63, 220 } }) do
		local colors = { team.Primary, team.Secondary, Color3.fromRGB(220, 60, 60) }
		beanBag(tvArea, bean[1], bean[2], tvSpot, colors[i])
	end

	-- Step 3: pool table + ping-pong table with a live rally scoreboard -----------------------
	BuildUtil.Stage(ctx, 3)
	local games = BuildUtil.Child(ctx, "Games")
	box(games, "PoolPedestal", 61.6, FLOOR_TOP, 234, 66.4, 2.2, 242, DARK_WOOD, Enum.Material.Wood)
	box(games, "PoolBody", 60.7, 2.2, 232, 67.3, 3, 244, DARK_WOOD, Enum.Material.Wood)
	local felt = box(games, "PoolFelt", 61.3, 3, 232.6, 66.7, 3.1, 243.4, Color3.fromRGB(34, 118, 70), Enum.Material.Fabric)
	BuildUtil.Look(felt, "Pool Table", "Rack 'em up! The players settle who picks the locker room music with a game of pool.", {
		At = Vector3.new(0, 0.8, -3),
		Distance = 8,
	})
	box(games, "PoolRail", 60.7, 3, 232, 61.3, 3.4, 244, WOOD, Enum.Material.Wood)
	box(games, "PoolRail", 66.7, 3, 232, 67.3, 3.4, 244, WOOD, Enum.Material.Wood)
	box(games, "PoolRail", 61.3, 3, 232, 66.7, 3.4, 232.6, WOOD, Enum.Material.Wood)
	box(games, "PoolRail", 61.3, 3, 243.4, 66.7, 3.4, 244, WOOD, Enum.Material.Wood)
	local ballColors = {
		Color3.fromRGB(255, 210, 30),
		Color3.fromRGB(30, 70, 200),
		Color3.fromRGB(210, 40, 40),
		Color3.fromRGB(110, 40, 150),
		Color3.fromRGB(255, 120, 20),
		Color3.fromRGB(20, 20, 22),
	}
	local rack = { { 64, 240 }, { 63.7, 240.5 }, { 64.3, 240.5 }, { 63.4, 241 }, { 64, 241 }, { 64.6, 241 } }
	for i, p in ipairs(rack) do
		ball(games, "PoolBall", Vector3.new(p[1], 3.33, p[2]), 0.46, ballColors[i], Enum.Material.SmoothPlastic, NO_COLLIDE)
	end
	ball(games, "CueBall", Vector3.new(64, 3.33, 235.5), 0.46, WHITE, Enum.Material.SmoothPlastic, NO_COLLIDE)
	rod(
		games,
		"Cue",
		Vector3.new(61.9, 3.45, 233.8),
		Vector3.new(65.6, 3.45, 240.4),
		0.16,
		Color3.fromRGB(196, 160, 110),
		Enum.Material.Wood,
		NO_COLLIDE
	)
	box(games, "CueRack", 50.8, 2.4, 236, 51.2, 9, 240, DARK_WOOD, Enum.Material.Wood)
	for _, cz in ipairs({ 237, 239 }) do
		cyl(games, "RackCue", Vector3.new(51.45, 5.4, cz), 6.6, 0.16, "Y", Color3.fromRGB(196, 160, 110), Enum.Material.Wood)
	end
	cyl(games, "LampCord", Vector3.new(64, 10.7, 238), 3, 0.1, "Y", BLACK, Enum.Material.SmoothPlastic, NO_COLLIDE)
	box(games, "PoolLamp", 62.5, 8.8, 233.5, 65.5, 9.4, 242.5, team.Primary, nil, NO_COLLIDE)
	local lampGlow = box(games, "PoolLampGlow", 62.7, 8.7, 233.7, 65.3, 8.8, 242.3, LAMP, Enum.Material.Neon, PAINT)
	BuildUtil.Light(
		lampGlow,
		"SpotLight",
		{ Name = "PoolLight", Face = Enum.NormalId.Bottom, Angle = 90, Range = 12, Brightness = 2, Color = WARM_LIGHT }
	)
	-- ping-pong: press E at the end of the table to play a rally
	local pingPong = box(games, "PingPongTable", 83.2, 2.9, 235.8, 88.8, 3.1, 246.2, Color3.fromRGB(30, 70, 150))
	BuildUtil.Use(games, pingPong, "pingpong", { Object = "Ping-Pong Table", At = Vector3.new(0, 0.8, -5.4), Distance = 8 })
	box(games, "PingPongLine", 85.95, 3.1, 235.8, 86.05, 3.12, 246.2, WHITE, Enum.Material.SmoothPlastic, PAINT)
	box(games, "PingPongNet", 83, 3.1, 240.95, 89, 3.75, 241.05, WHITE, Enum.Material.Fabric, { Transparency = 0.2 })
	for _, lz in ipairs({ 237.5, 243.7 }) do
		box(games, "PingPongLegs", 84, FLOOR_TOP, lz, 88, 2.9, lz + 0.8, DARK_METAL, Enum.Material.Metal)
	end
	for _, p in ipairs({ { 84.6, 237.2, Color3.fromRGB(200, 30, 30) }, { 87.4, 244.8, BLACK } }) do
		cyl(games, "Paddle", Vector3.new(p[1], 3.16, p[2]), 0.12, 1.3, "Y", p[3], Enum.Material.SmoothPlastic, NO_COLLIDE)
		box(games, "PaddleHandle", p[1] - 0.15, 3.1, p[2] + 0.6, p[1] + 0.15, 3.25, p[2] + 1.3, WOOD, Enum.Material.Wood, NO_COLLIDE)
	end
	ball(games, "PingPongBall", Vector3.new(86.4, 3.4, 239), 0.3, Color3.fromRGB(255, 160, 40), Enum.Material.SmoothPlastic, NO_COLLIDE)
	-- the longest-rally scoreboard hangs over the net (readable from both ends)
	for _, sx in ipairs({ 83.6, 88.4 }) do
		cyl(games, "ScoreboardRod", Vector3.new(sx, 11.4, 241), 1.6, 0.12, "Y", DARK_METAL, Enum.Material.Metal, NO_COLLIDE)
	end
	local rally = box(games, "RallyScoreboard", 83, 8.8, 240.8, 89, 10.6, 241.2, LED_DARK, nil, NO_COLLIDE)
	for _, face in ipairs({ Enum.NormalId.Front, Enum.NormalId.Back }) do
		liveScreen(
			rally,
			face,
			"pingpong",
			"LONGEST RALLY",
			{ LabelName = "Rally" .. face.Name, TextColor3 = Color3.fromRGB(255, 170, 60), PixelsPerStud = 24 }
		)
	end

	-- Step 4: arcade cabinets under a live high-score marquee, drinks fridge and snack bar -----
	BuildUtil.Stage(ctx, 4)
	local arcadeModel = BuildUtil.Child(ctx, "Arcade")
	arcade(arcadeModel, 246, Color3.fromRGB(40, 40, 120), Color3.fromRGB(60, 200, 255), "GRIDIRON BLITZ", team)
	arcade(arcadeModel, 251.5, Color3.fromRGB(120, 30, 40), Color3.fromRGB(255, 90, 120), "TOUCHDOWN FEVER", team)
	arcade(arcadeModel, 257, Color3.fromRGB(30, 90, 50), Color3.fromRGB(120, 255, 120), "PIXEL PUNT", team)
	local highScore = box(arcadeModel, "HighScoreMarquee", 50.8, 9, 243.6, 51.15, 11.2, 259.6, LED_DARK)
	liveScreen(
		highScore,
		Enum.NormalId.Right,
		"arcade",
		"HIGH SCORE",
		{ TextColor3 = Color3.fromRGB(120, 255, 255), Font = Enum.Font.Arcade }
	)
	BuildUtil.Light(
		highScore,
		"SurfaceLight",
		{ Name = "MarqueeGlow", Face = Enum.NormalId.Right, Range = 10, Brightness = 1, Color = Color3.fromRGB(120, 220, 255) }
	)
	-- foosball table by the corridor wall: rods run across (Z), goals at the X ends
	-- a glowing jukebox against the east wall (faces -X, into the room)
	local jukebox = box(arcadeModel, "Jukebox", 95.8, FLOOR_TOP, 236.5, 98.4, 5.2, 240.5, DARK_WOOD, Enum.Material.Wood)
	cyl(arcadeModel, "JukeboxArch", Vector3.new(97.1, 5.2, 238.5), 2.6, 4, "X", Color3.fromRGB(255, 150, 60), Enum.Material.Neon)
	local playlist = box(arcadeModel, "JukeboxPanel", 95.6, 1.2, 237, 95.8, 4.6, 240, Color3.fromRGB(40, 20, 60), Enum.Material.Neon)
	local jukeGui = canvas(playlist, Enum.NormalId.Left, 30, Color3.fromRGB(40, 20, 60), 0)
	guiText(jukeGui, 0.2, 0.15, 2.6, 0.6, "JUKEBOX", Color3.fromRGB(255, 200, 90), Enum.Font.Arcade)
	for i, song in ipairs({ "1. GAME DAY STOMP", "2. FOURTH & LOUD", "3. RUMBLE'S SHUFFLE" }) do
		guiText(jukeGui, 0.25, 0.9 + (i - 1) * 0.7, 2.5, 0.45, song, WHITE, Enum.Font.Code, Enum.TextXAlignment.Left)
	end
	BuildUtil.Look(
		jukebox,
		"Jukebox",
		"Loaded with the team's pump-up songs. Rumble the mascot picks the same dance song every single day!",
		{ At = Vector3.new(-1.6, 0, 0), Distance = 8 }
	)
	box(arcadeModel, "FoosballLegs", 85.5, FLOOR_TOP, 252.6, 90.5, 2.4, 255.4, DARK_METAL, Enum.Material.Metal)
	local foosball = box(arcadeModel, "FoosballBody", 84.5, 2.4, 251.5, 91.5, 3.3, 256.5, team.Primary)
	BuildUtil.Look(
		foosball,
		"Foosball Table",
		"Spin the rods to kick the little ball. The linemen claim they're the best foosball team in the league.",
		{
			At = Vector3.new(0, 1.2, -2.6),
			Distance = 8,
		}
	)
	box(arcadeModel, "FoosballField", 84.9, 3.3, 251.9, 91.1, 3.36, 256.1, Color3.fromRGB(46, 150, 70), Enum.Material.SmoothPlastic)
	for _, rz in ipairs({ 251.5, 256.1 }) do
		box(arcadeModel, "FoosballRail", 84.5, 3.3, rz, 91.5, 3.9, rz + 0.4, team.Secondary)
	end
	for i, rx in ipairs({ 85.8, 87.2, 88.8, 90.2 }) do
		cyl(arcadeModel, "FoosballRod", Vector3.new(rx, 3.7, 254), 7.6, 0.16, "Z", CHROME, Enum.Material.Metal, NO_COLLIDE)
		box(
			arcadeModel,
			"FoosballMen",
			rx - 0.2,
			3.36,
			252.8,
			rx + 0.2,
			3.9,
			255.2,
			i % 2 == 1 and team.Primary or WHITE,
			Enum.Material.SmoothPlastic,
			NO_COLLIDE
		)
	end
	local snacks = BuildUtil.Child(ctx, "Snacks")
	box(snacks, "Fridge", 53, FLOOR_TOP, 202.2, 59, 7.4, 204.3, STEEL, Enum.Material.Metal)
	local fridgeDoor = box(snacks, "FridgeDoor", 53, FLOOR_TOP, 204.3, 59, 6.4, 205.4, GLASS, Enum.Material.Glass, { Transparency = 0.35 })
	BuildUtil.Use(snacks, fridgeDoor, "soda", { Object = "Drinks Fridge", At = Vector3.new(0, 0.6, 0.6), Distance = 8 })
	local drinks = { Color3.fromRGB(255, 120, 20), Color3.fromRGB(60, 180, 255) }
	for i, y0 in ipairs({ 1.4, 3.7 }) do
		local row = box(snacks, "Drinks", 53.5, y0, 204.4, 58.5, y0 + 1.5, 205.2, drinks[i], Enum.Material.Neon)
		if i == 2 then
			BuildUtil.Light(row, "PointLight", { Name = "FridgeLight", Range = 6, Brightness = 1, Color = Color3.fromRGB(200, 230, 255) })
		end
	end
	local fridgeSign = box(snacks, "FridgeSign", 53, 6.4, 204.3, 59, 7.4, 205.5, team.Primary)
	sign(fridgeSign, Enum.NormalId.Back, "ICE COLD", team.Primary, team, { InsetX = 0.08, InsetY = 0.1 })
	box(snacks, "SnackCounter", 61, FLOOR_TOP, 202.2, 72, 3.2, 205.4, team.Primary)
	box(snacks, "SnackCounterTop", 60.8, 3.2, 202.1, 72.2, 3.5, 205.7, MARBLE, Enum.Material.Marble)
	box(snacks, "PopcornBase", 62.4, 3.5, 202.9, 64.6, 4.5, 205.1, Color3.fromRGB(200, 30, 30))
	local popcornGlass = box(snacks, "PopcornGlass", 62.4, 4.5, 202.9, 64.6, 6.7, 205.1, GLASS, Enum.Material.Glass, { Transparency = 0.6 })
	BuildUtil.Use(snacks, popcornGlass, "popcorn", { Object = "Popcorn Machine", At = Vector3.new(0, -0.4, 1.2), Distance = 8 })
	box(snacks, "Popcorn", 62.6, 4.5, 203.1, 64.4, 5.5, 204.9, Color3.fromRGB(255, 236, 160), Enum.Material.Sand)
	for i, jx in ipairs({ 66.2, 67.6, 69 }) do
		local candy = { Color3.fromRGB(255, 80, 140), Color3.fromRGB(80, 200, 255), Color3.fromRGB(255, 200, 40) }
		cyl(snacks, "CandyJar", Vector3.new(jx, 4.1, 204.2), 1.2, 1, "Y", candy[i], Enum.Material.Glass, { Transparency = 0.15 })
	end
	box(snacks, "CoffeeMachine", 70.4, 3.5, 202.6, 71.8, 5.3, 204.4, BLACK, Enum.Material.Metal)
	box(snacks, "SnackWall", 52.5, FLOOR_TOP, 201.5, 72.5, WALL_TOP, 202.1, Color3.fromRGB(250, 236, 200), Enum.Material.Plaster)
	local snackSign = box(snacks, "SnackSign", 60, 7.6, 202.1, 72, 9.8, 202.4, team.Secondary, Enum.Material.Neon)
	sign(snackSign, Enum.NormalId.Back, "SNACK BAR", team.Secondary, team, { InsetX = 0.08, InsetY = 0.12, LightInfluence = 0 })
end

return HQRoomsFront
