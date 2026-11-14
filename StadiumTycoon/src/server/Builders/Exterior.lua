--[[
	Exterior
	The outside of the V5 stadium (docs/V5-LAYOUT.md): the four GATES with their entry halls, the
	ESCALATORS / corner ramps / elevators that carry fans up to the concourses, and the FACADE (the
	stadium's outer skin, offsets 152..160 all the way round).

	SEGMENT SPACE (like Concourse.lua / UpperDeck.lua / ClubLevel.lua): everything is built per bowl
	segment (Bowl.Segments) in a frame on the turf outline (offset 0) in the middle of the segment:
	x runs along the segment, y is up and o = offset (outward from the turf edge); a point is
	seg.base * CFrame.new(x, y, -o). The Front face (-Z) of an unrotated part looks away from the
	field (toward the plaza), its Back face (+Z) toward the field.

	PIECES + STEPS
	  gates       1 Gate A (Main Gate)  2 Gate B (West)  3 Gate C (East)  4 Gate D (Players' Gate):
	              one complete gate per step (portal, plaza, entry hall). Every gate also has granite
	              plinths and team-colour LED ribbons on its pylons, two hedge planters at the front of
	              its plaza, a CLEAR BAGS ONLY board in the security tent, a lit stadium map on the
	              lobby wall and (not Gate D: its red carpet) a team medallion in the lobby floor;
	              Gate A's plaza has THE LEGEND, a bronze quarterback statue
	  escalators  1 Main Escalators (3 flights + landings in every gate hall, yellow comb plates where
	              riders step on and off, team-colour skirts on the trusses)  2 Corner Ramps (a
	              team stripe along the outer parapet, a HALFWAY UP! plaque on the landing)
	              3 Elevators (a glass elevator per gate hall; a call panel with the level number
	              beside every door)  4 Wayfinding Signs
	  facade      1 Lower Facade (+ a dark granite plinth along the base (not behind the corner
	              ramps), steel canopies with lamps and SERVICE DOOR signs over the service exits,
	              framed boards of made-up sponsors between the masts, poster cases with the season and
	              the next game beside every gate)
	              2 Glass Curtain Walls  3 Upper Facade & Fins
	              4 Banners & Night Lights (+ two tall player / team banners on the glass beside
	              every gate, team-colour LED ribbons up the gate towers)

	THE GATE HALL (the same on all four gate axes: A front/visitor, B west, C east, D back/home),
	segment x |x| < 14 between the hall walls (14..15), offsets 84.2..152:
	  * portal (gates)       pylons |x| 13..19 at offsets 152.4..163 (y 0..50) + a lit marquee over
	                         the 26-wide, 26-tall opening, a glass canopy out to offset 177, turnstiles
	                         at 166.6..169.4, a security tent at x 36..48 and two team flags at x -40/-52
	                         (gate B mirrors its plaza and the end gates' flags stand at -28/-38, clear
	                         of the canopy masts and video-board pylons of Features.lua)
	  * entry lobby (gates)  offsets 120..152 on the ground, ceiling 28.4..28.9 (a hole over the
	                         elevator shaft); its inner wall at 119.4..120 is open at |x| < 7 where the
	                         first escalators rise into the tall escalator well (84.2..120). The hall
	                         walls stop below the club ring's girder (49.4) under it and at 52.9 outside
	  * escalators           F1 ground -> 30 (|x| < 6, offsets 142 -> 90) onto the landing C (84..90)
	                         in front of the main concourse's gate opening (|x| < 8); bridge A (x -14..-6,
	                         y 30) runs back out to the mezzanine B (146..152, y 30); F2 30 -> 54 (|x| < 6,
	                         149 -> 112.5) lands on D (108..112.5) at the club ring's gate opening (offset
	                         108); bridge E (x 6..14, y 54) + a path along the segment (offsets
	                         134.2..140.2 out to x 58) + a leg into the facade band reach F3 54 -> 74,
	                         which climbs along the segment inside the facade band (offsets 152.4..158.4,
	                         x 52 -> 17.4) to the top landing (x -8..17.4) at the upper concourse's gate
	                         opening (offset 152, |x| < 8). Steps are diamond-plate ramps (30-33 deg).
	  * elevator             a glass shaft at x 6.2..14, offsets 140.2..146 (doors at y 0 + 30 on its plaza
	                         side, 54 on bridge E) + a door on the top landing (y 74); every door has
	                         buttons to the other 3 levels. (The pocket behind the shaft, between F1 and
	                         the +x hall wall, is closed: nothing opens or arrives into it.)
	  The front walkway / back walk corridors (|x| < 11 from offset 149 outward, y 0.8..9) stay clear:
	  turnstiles are non-collidable, everything collidable stands at |x| >= 13 or above y 22.

	CORNER RAMPS (escalators step 2): outside the facade's four diagonal corners (u = s * x; the
	ramps run from the bridge toward the end zones, clear of the canopy mast on each corner's centre
	line): two 45-long flights (1:3) side by side along the facade (R1 ground -> 15 in the outer lane,
	offsets 170..178.6, u 24 -> 69; a turning landing u 69..77; R2 15 -> 30 in the inner lane,
	162.4..170, u 69 -> 24) and a bridge at y 30 (u 18..24) through the facade to a balcony (u 18..40,
	offsets 84..100) at the main concourse's outer wall. That corner wall has no opening (food stands
	stand behind it), so a lit "MAIN CONCOURSE" panel on the wall + an "EXIT / CORNER RAMP" panel inside
	(around u 30, where no stand is) take fans through (elevator-type prompts, both ways).

	FACADE (offsets 152..160, y 0..112): a stone base (158..160, 0..14) with a cap (14..15) and a
	service exit (double door under a lit EXIT lintel, x -66..-60) on each straight side, glass
	curtain walls (159..159.6) up to 86 with spandrel bands at the concourse levels, a team-colour
	upper band (158.4..160.2, 86..110) behind vertical fins (160.2..162.2), a cornice roof (110..112)
	that closes the gap to the upper deck's rear fascia (152.05), piers on the 8 joints, the gate
	pylons continued as stone towers up to the band, the team name in giant letters over Gate A
	(smaller ones over B, C, D), LED strips, banners and night lights. It leaves the gate portals
	(|x| < 19 below y 50), F3 + its landings in the band (offsets < 158.8) and the corner bridges
	(u 17.4..24.6, y 29..40) open.

	Flat layers: hall floor + plaza paving 0.1..0.2 (the plot walkways are 0..0.1), floor logos
	0.2..0.26, Gate D's red carpet 0.26..0.32.
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)
local Bowl = require(script.Parent.Parent.Bowl)

local M = {}

local K = math.sqrt(2) - 1
local TURN = CFrame.Angles(0, math.pi, 0)
local OUTWARD = Enum.NormalId.Front -- faces the plaza
local INWARD = Enum.NormalId.Back -- faces the field

local GATE_ORDER = { "visitor", "west", "east", "home" } -- gates steps 1-4 (A, B, C, D)
local CORNERS = { "corner_vw", "corner_ve", "corner_hw", "corner_he" }
local ALL_SEGS = { "visitor", "corner_ve", "east", "corner_he", "home", "corner_hw", "west", "corner_vw" }
-- ring order used by Concourse.lua / UpperDeck.lua for section numbers
local LOOP = { "home", "corner_hw", "west", "corner_vw", "visitor", "corner_ve", "east", "corner_he" }

local PAINT = { CanCollide = false, CastShadow = false }
local NO_COLLIDE = { CanCollide = false }
local GLASSY = { Transparency = 0.45 }

-- colours
local WHITE = Color3.fromRGB(248, 248, 248)
local INK = Color3.fromRGB(22, 22, 26)
local STONE = Color3.fromRGB(204, 198, 186)
local STONE_DARK = Color3.fromRGB(168, 162, 150)
local CONCRETE = Color3.fromRGB(176, 176, 180)
local HALL_WALL_COLOR = Color3.fromRGB(230, 228, 222)
local TERRAZZO = Color3.fromRGB(214, 210, 200)
local PAVING = Color3.fromRGB(184, 178, 168)
local STEEL = Color3.fromRGB(200, 204, 210)
local CLADDING = Color3.fromRGB(150, 156, 166)
local DARK_STEEL = Color3.fromRGB(62, 66, 74)
local RUBBER = Color3.fromRGB(26, 26, 30)
local GLASS = Color3.fromRGB(164, 206, 232)
local CURTAIN = Color3.fromRGB(104, 150, 182)
local SIGN_DARK = Color3.fromRGB(20, 24, 34)
local SCANNER_GREEN = Color3.fromRGB(60, 232, 112)
local TENT_WHITE = Color3.fromRGB(244, 244, 246)
local RED_CARPET = Color3.fromRGB(170, 22, 32)
local LIGHT_WARM = Color3.fromRGB(255, 240, 214)
local LIGHT_COOL = Color3.fromRGB(226, 238, 255)
local LIGHT_NEUTRAL = Color3.fromRGB(246, 246, 250)
local PLINTH_STONE = Color3.fromRGB(132, 126, 116) -- the dark granite feet of the pylons and the facade
local BRONZE = Color3.fromRGB(150, 104, 58)
local SAFETY_YELLOW = Color3.fromRGB(240, 188, 30) -- painted escalator comb plates (not lit)
local PLANTER_GREY = Color3.fromRGB(152, 148, 140)
local HEDGE = Color3.fromRGB(58, 116, 60)
local MAP_GRASS = Color3.fromRGB(58, 125, 52)
local MARKER_RED = Color3.fromRGB(222, 44, 44)
-- pixels per stud of the small lit signs read up close (wayfinding, exits, elevator doors): sharp
-- glyphs (TextScaled keeps the letters the same size in studs)
local SIGN_PPS = 32

---------------------------------------------------------------------------------------------
-- Layout numbers (segment space; o = offset)
---------------------------------------------------------------------------------------------

-- the gate hall
local HALL_HALF = 14 -- inner faces of the hall walls
local HALL_WALL = 15 -- outer faces
local HALL_IN = 84.2 -- just outside the main concourse's outer wall (83..84.1)
local CLUB_EDGE = 108 -- the club ring's outer edge (ClubLevel.lua: slab 52..54, girder 106..108 from 49.5)
local FRONT = 152 -- the facade line
local LOW_WALL_TOP = 49.4 -- hall walls under the club ring's outer girder (offsets 106..108)
local GIRDER_IN = 106 -- ClubLevel.lua's ring girder (offsets 106..108, y 49.5..52, |x| >= 9)
local CLUB_SLAB = 52 -- the underside of the club ring's floor slab (52..54)
local WALL_TOP = 52.9 -- hall walls outside the club ring (bridge E sits on them at 53)
local LOBBY_IN = 120 -- the entry lobby (ground floor) spans offsets 120..152
local LOBBY_CEIL = { 28.4, 28.9 }
local LOBBY_OPEN = 7 -- the lobby's inner wall is open at |x| < 7 (escalator F1 rises through it)
local PORTAL_HALF = 13
local PYLON_OUT = 19
local PYLON_IN, PYLON_FRONT, PYLON_TOP = 152.4, 163, 50
local LINTEL = { 26, 36 }
local CANOPY_OUT = 177
local CANOPY_HALF = 24
local CANOPY_Y = { 23, 23.6 }
local PAVING_OUT = 182
local PAVING_HALF = 26
local TURNSTILE_O = { 166.6, 169.4 }
local TENT = { x0 = 36, x1 = 48, o0 = 162.8, o1 = 174.8 } -- (clear of the roof masts at +-30 on the sides)

-- escalators
local BAL = 0.4 -- balustrade thickness
local BAL_H = 3 -- balustrade height above the steps
local TREAD = 1 -- step band thickness
local TRUSS = 2.6 -- truss cladding under the steps
local F1 = { x = 0, bottom = 142, top = 90, y0 = 0, y1 = 30 }
local F2 = { x = 0, bottom = 149, top = 112.5, y0 = 30, y1 = 54 } -- (3 studs of mezzanine to board it)
local F3 = { o = 155.4, bottom = 52, top = 17.4, y0 = 54, y1 = 74 }
local SHAFT = { x0 = 6.2, x1 = 14, o0 = 140.2, o1 = 146, top = 72.6 }
local PATH = { o0 = 134.2, o1 = 140.2, x1 = 52, leg1 = 58, band = 158.6 }
local TOP = { x0 = -8, x1 = F3.top, o0 = 152.2, o1 = 158.6 }

-- corner ramps (u = s * x along the corner; s points toward the end zones)
local RAMP = {
	inner = { 162.4, 170 }, -- R2 lane (15 -> 30)
	outer = { 170, 178.6 }, -- R1 lane (ground -> 15)
	bridge = { 18, 24 }, -- the y-30 bridge to the main concourse
	balcony = { 18, 40, 100 }, -- its wide end at the concourse wall (u 18..40, offsets 84..100)
	door = 30, -- the panels through the concourse wall (u 28..32: no food stands behind it)
	high = 24, -- R2 top / R1 bottom (u)
	low = 69, -- R2 bottom / R1 top (u): 45-long flights (1:3)
	landing = 77, -- the turning landing u 69..77
	parapet = 3.5,
}

-- facade
local F = {
	baseIn = 158,
	out = 160,
	baseTop = 14,
	capIn = 157.6,
	capOut = 160.4,
	capTop = 15,
	glassIn = 159,
	glassOut = 159.6,
	glassTop = 86,
	spanOut = 160.2,
	bandIn = 158.4,
	bandOut = 160.2,
	bandTop = 110,
	roofIn = 152.1,
	roofOut = 161,
	top = 112,
	finOut = 162.2,
	finT = 0.8,
	finTop = 108.8,
	gateHalf = PYLON_OUT, -- no facade below the pylon tops at |x| < 19 on the gate axes
	gateGlassBottom = PYLON_TOP,
	rampOpen = { 17.4, 24.6 },
	rampOpenY = { 29, 40 },
}
-- a service exit through the stone base on every straight side (segment x, door top): the event
-- level between the bowl and the facade is closed in by the base, so it gets its doors out to the
-- plaza in the same step (the ground in front of them is clear on all four sides)
local SERVICE = { x0 = -66, x1 = -60, top = 10 }
-- glass guard rails where a fall would land on the event level (corner-ramp bridges, the club-level
-- path to F3): too tall to hop by accident
local HIGH_RAIL = 7.5

---------------------------------------------------------------------------------------------
-- Colour + text helpers
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

-- A second line of text on the same SurfaceGui as `label` (saves a GUI).
local function addLine(label, text, top, height, font)
	local line = label:Clone()
	line.Name = label.Name .. "Line"
	line.Text = text
	line.Position = UDim2.new(label.Position.X.Scale, 0, top, 0)
	line.Size = UDim2.new(label.Size.X.Scale, 0, height, 0)
	line.Font = font or label.Font
	line.Parent = label.Parent
	return line
end

-- The team's name, kept up to date by the server (BuildUtil.LiveText), on an opaque background.
local function liveTeam(ctx, part, face, color, background, opts)
	opts = opts or {}
	local _, label = BuildUtil.LiveText(part, face, "team", {
		LabelName = opts.Name or "LiveTeam",
		Text = teamLabel(ctx),
		TextColor3 = color,
		BackgroundColor3 = background,
		BackgroundTransparency = 0,
		LightInfluence = 0,
		Font = Enum.Font.GothamBlack,
		PixelsPerStud = opts.PPS or 12,
	})
	local pad = Instance.new("UIPadding")
	local px, py = UDim.new(opts.PadX or 0.04, 0), UDim.new(opts.PadY or 0.12, 0)
	pad.PaddingLeft, pad.PaddingRight, pad.PaddingTop, pad.PaddingBottom = px, px, py, py
	pad.Parent = label
	return label
end

-- PointLights spread along a part's local X axis (on attachments), `count` of them.
local function lightsAlong(part, count, props, dy, dz)
	local length = part.Size.X
	for index = 1, count do
		local attachment = Instance.new("Attachment")
		attachment.Name = "LightAt"
		attachment.Position = Vector3.new((index - 0.5) * length / count - length / 2, dy or 0, dz or 0)
		attachment.Parent = part
		BuildUtil.Light(attachment, "PointLight", props)
	end
end

-- PointLights spread along a part's local Z axis.
local function lightsAlongZ(part, count, props, dx, dy)
	local length = part.Size.Z
	for index = 1, count do
		local attachment = Instance.new("Attachment")
		attachment.Name = "LightAt"
		attachment.Position = Vector3.new(dx or 0, dy or 0, (index - 0.5) * length / count - length / 2)
		attachment.Parent = part
		BuildUtil.Light(attachment, "PointLight", props)
	end
end

-- The team colour for new LED ribbons: never white or yellow (they glow too harshly) and bright
-- enough to glow - the secondary, else the primary, else the trim.
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

-- A cylinder along the local X axis of `cframe` (a segment-space CFrame, see at()).
local function cyl(ctx, name, cframe, length, diameter, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Shape = Enum.PartType.Cylinder
	props.Size = Vector3.new(length, diameter, diameter)
	props.CFrame = cframe
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Part(ctx, props)
end

-- A SurfaceGui to draw on (maps, posters). glow = LightInfluence 0 (only on dark backgrounds).
local function canvas(part, face, name, pps, glow)
	local gui = Instance.new("SurfaceGui")
	gui.Name = name
	gui.Face = face
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = pps or 20
	gui.LightInfluence = glow and 0 or 1
	gui.Parent = part
	return gui
end

-- A frame placed by scale (x, y = top-left corner, w, h = size); round = a circle / pill.
local function blob(parent, name, x, y, w, h, color, round, z)
	local frame = Instance.new("Frame")
	frame.Name = name
	frame.BackgroundColor3 = color
	frame.BorderSizePixel = 0
	frame.Position = UDim2.new(x, 0, y, 0)
	frame.Size = UDim2.new(w, 0, h, 0)
	frame.ZIndex = z or 1
	frame.Parent = parent
	if round then
		local corner = Instance.new("UICorner")
		corner.CornerRadius = UDim.new(round, 0)
		corner.Parent = frame
	end
	return frame
end

-- A text label placed by scale inside `parent`.
local function words(parent, name, x, y, w, h, text, color, font, z)
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
	label.ZIndex = z or 2
	label.Parent = parent
	return label
end

---------------------------------------------------------------------------------------------
-- Segment geometry
---------------------------------------------------------------------------------------------

local function segment(L, name)
	local s = Bowl.Segment(L, name, 0, 0)
	local kind = s.kind
	local seg = { name = name, kind = kind, base = s.cframe }
	seg.len = function(o)
		if kind == "side" then
			return 2 * (L.SurfaceHalfX + K * o)
		elseif kind == "end" then
			return (L.SurfaceMaxZ - L.SurfaceMinZ) + 2 * K * o
		end
		return 2 * K * o
	end
	return seg
end

local function at(seg, x, y, o)
	return seg.base * CFrame.new(x, y, -o)
end

-- Block from x0..x1 along the segment, heights y0..y1, offsets o0..o1 (either order).
local function box(ctx, seg, name, x0, x1, y0, y1, o0, o1, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Size = Vector3.new(math.abs(x1 - x0), y1 - y0, math.abs(o1 - o0))
	props.CFrame = at(seg, (x0 + x1) / 2, (y0 + y1) / 2, (o0 + o1) / 2)
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Part(ctx, props)
end

--[[
	A sloped block whose TOP surface is the band along the line a -> b (points { x, y, o } in
	segment space), w0..w1 wide: w is the segment x for runs that go straight out from the field
	(a.x == b.x), else the offset o (runs along the segment). `drop` lowers it (perpendicular to the
	slope) below the line, e.g. a truss under the steps.
]]
local function slope(ctx, seg, name, a, b, w0, w1, thick, color, material, extra, drop)
	local A = Vector3.new(a[1], a[2], -a[3])
	local B = Vector3.new(b[1], b[2], -b[3])
	local d = B - A
	local hor = Vector3.new(d.X, 0, d.Z).Unit
	local across = Vector3.new(-hor.Z, 0, hor.X)
	local back = -d.Unit
	local up = back:Cross(across)
	local mid = (A + B) / 2
	local wc = (w0 + w1) / 2
	local target
	if math.abs(d.X) < 1e-6 then
		target = Vector3.new(wc, mid.Y, mid.Z)
	else
		target = Vector3.new(mid.X, mid.Y, -wc)
	end
	local pos = mid + across * (target - mid):Dot(across) - up * ((drop or 0) + thick / 2)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Size = Vector3.new(math.abs(w1 - w0), thick, d.Magnitude)
	props.CFrame = seg.base * CFrame.fromMatrix(pos, across, up, back)
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Part(ctx, props)
end

-- A wedge over x0..x1 (along the segment), o0..o1, y0..y1 whose tall face is at x = tallX.
local function wedgeX(ctx, seg, name, x0, x1, y0, y1, o0, o1, tallX, color, material)
	local xc, yc, oc = (x0 + x1) / 2, (y0 + y1) / 2, (o0 + o1) / 2
	local lowDir = (math.abs(tallX - math.min(x0, x1)) < 1e-6) and 1 or -1
	local pos = Vector3.new(xc, yc, -oc)
	return BuildUtil.Wedge(ctx, {
		Name = name,
		Size = Vector3.new(math.abs(o1 - o0), y1 - y0, math.abs(x1 - x0)),
		CFrame = seg.base * CFrame.lookAt(pos, pos + Vector3.new(lowDir, 0, 0)),
		Color = color,
		Material = material or Enum.Material.Concrete,
	})
end

-- Which way a corner ramp runs: s = +1 if the corner's +x points toward the end zones.
local function rampSide(seg)
	local sx = seg.base.Position.X >= 0 and 1 or -1
	return (seg.base.RightVector.X * sx > 0) and 1 or -1
end

local function up(p, dy)
	return { p[1], p[2] + dy, p[3] }
end

-- The pieces of [-half, half] left after removing the `cuts` ({ a, b } pairs).
local function runs(from, to, cuts)
	table.sort(cuts, function(p, q)
		return p[1] < q[1]
	end)
	local list, cursor = {}, from
	for _, cut in ipairs(cuts) do
		if cut[1] - cursor > 0.05 then
			table.insert(list, { cursor, math.min(cut[1], to) })
		end
		cursor = math.max(cursor, cut[2])
	end
	if to - cursor > 0.05 then
		table.insert(list, { cursor, to })
	end
	return list
end

---------------------------------------------------------------------------------------------
-- Gate data (sections are numbered exactly like Concourse.lua / UpperDeck.lua do)
---------------------------------------------------------------------------------------------

local GATE_INFO = {
	-- (hero = the player banner on the glass beside the gate: number + position; cheer = the live
	-- text on the banner across the gate: Interact.LiveKinds, under a fixed headline)
	visitor = {
		letter = "A",
		name = "MAIN GATE",
		title = "Gate A - Main Gate",
		info = "The front door of the stadium! The plaza walkway runs straight in here.",
		hall = "Main Entry Hall",
		hero = { "12", "QUARTERBACK" },
		cheer = { "WELCOME HOME", "team" },
		statue = true, -- THE LEGEND stands in front of the main gate
	},
	west = {
		letter = "B",
		name = "WEST GATE",
		title = "Gate B - West Gate",
		info = "The west gate, behind the west end zone. Great for the end-zone seats!",
		hall = "West Entry Hall",
		plazaSide = -1,
		flags = { -27, -39 }, -- (between the west video board's towers)
		flagLen = 8,
		hero = { "88", "WIDE RECEIVER" },
		cheer = { "THIS SEASON", "record" },
	},
	east = {
		letter = "C",
		name = "EAST GATE",
		title = "Gate C - East Gate",
		info = "The east gate - the closest one to the tailgate fan zone.",
		hall = "East Entry Hall",
		flags = { -27, -39 }, -- (clear of the east video board's pylons)
		flagLen = 8,
		tent = { x0 = 50, x1 = 62, o0 = 162.8, o1 = 174.8 }, -- (clear of the east video board's pylons too)
		hero = { "56", "LINEBACKER" },
		cheer = { "TROPHY CASE", "titles" },
	},
	home = {
		letter = "D",
		name = "PLAYERS' GATE",
		title = "Gate D - Players' Gate",
		info = "The players walk in here from the team campus on game day - follow the red carpet!",
		hall = "Players' Entry Hall",
		hero = { "21", "RUNNING BACK" },
		cheer = { "LET'S GO", "team" },
		carpet = true, -- (the red carpet runs where the other halls have a floor medallion)
	},
}

local LOWER_BASE = { visitor = 101, east = 109, home = 113, west = 121 }

local function kindOf(name)
	if name == "visitor" or name == "home" then
		return "side"
	elseif name == "west" or name == "east" then
		return "end"
	end
	return "corner"
end

-- "101-107" style ranges of the lower, club and upper sections behind a gate.
local function sections(L, name)
	local kind = kindOf(name)
	local lowerCount = kind == "side" and 7 or 3
	local lower = ("%d-%d"):format(LOWER_BASE[name], LOWER_BASE[name] + lowerCount - 1)
	local tier = L.Bowl.Tiers.club
	local number, club = 200, "CLUB"
	for _, n in ipairs(LOOP) do
		local s = Bowl.Segment(L, n, tier.StartOffset, tier.StartOffset + L.Bowl.Depth)
		local count = #Bowl.Aisles(L, s.kind, s.innerLength) + 1
		if n == name then
			club = ("%d-%d"):format(number + 1, number + count)
		end
		number += count
	end
	number = 300
	local upper = "UPPER"
	for _, n in ipairs(LOOP) do
		local count = 4 * #Bowl.Vomitories(kindOf(n))
		if n == name and count > 0 then
			upper = ("%d-%d"):format(number + 1, number + count)
		end
		number += count
	end
	return lower, club, upper
end

---------------------------------------------------------------------------------------------
-- GATES
---------------------------------------------------------------------------------------------

-- The pylons' dark granite plinths (round the portal side, the front and the outer side, under the
-- ticket window) and a team-colour LED ribbon up each portal side. (The plinth starts just in front
-- of the pylon's back face, so the two never share that plane: it shows in the lobby and from the
-- event level behind.)
local function pylonTrim(ctx, seg, team)
	for _, s in ipairs({ -1, 1 }) do
		box(
			ctx,
			seg,
			"PylonPlinth",
			s * (PORTAL_HALF - 0.3),
			s * (PYLON_OUT + 0.3),
			0,
			2.4,
			PYLON_IN + 0.1,
			PYLON_FRONT + 0.3,
			PLINTH_STONE,
			Enum.Material.Granite
		)
		box(
			ctx,
			seg,
			"PylonLED",
			s * (PORTAL_HALF - 0.1),
			s * PORTAL_HALF,
			3,
			LINTEL[1] - 1,
			PYLON_FRONT - 1.3,
			PYLON_FRONT - 0.5,
			ledColor(team),
			Enum.Material.Neon,
			PAINT
		)
	end
end

-- Two concrete planters with clipped hedges at the front corners of the gate plaza (outside the
-- walkway, in front of the canopy posts).
local function gatePlanters(ctx, seg)
	for _, s in ipairs({ -1, 1 }) do
		box(ctx, seg, "GatePlanter", s * 18.6, s * 24.4, 0, 2.4, 179.4, 181.8, PLANTER_GREY, Enum.Material.Concrete)
		box(ctx, seg, "PlanterHedge", s * 18.9, s * 24.1, 2.4, 3.9, 179.7, 181.5, HEDGE, Enum.Material.Grass)
	end
end

-- A CLEAR BAGS ONLY sandwich board just inside the front of the security tent `t` (beside the
-- queue for the bag table, clear of the walk-through arch).
local function clearBagSign(ctx, seg, t, ps, team)
	local tilt, len, width = math.rad(14), 3.4, 2.4
	local xc, oc = ps * (t.x0 + 2.1), t.o1 - 1.6
	local d = math.sin(tilt) * len / 2 + 0.1
	-- (the boards' lower edges stand on the ground: the tent is off the gate paving)
	local yc = math.cos(tilt) * len / 2 + math.sin(tilt) * 0.075 - 0.02
	-- (the boards lean together: each top tips toward the other)
	local front = BuildUtil.Part(ctx, {
		Name = "ClearBagSign",
		Size = Vector3.new(width, len, 0.15),
		CFrame = at(seg, xc, yc, oc + d) * CFrame.Angles(tilt, 0, 0),
		Color = WHITE,
	})
	BuildUtil.Part(ctx, {
		Name = "ClearBagSignBack",
		Size = Vector3.new(width, len, 0.15),
		CFrame = at(seg, xc, yc, oc - d) * CFrame.Angles(-tilt, 0, 0),
		Color = team.Primary,
	})
	local label = write(front, OUTWARD, "CLEAR BAGS ONLY", ink(WHITE, team), { Top = 0.08, Height = 0.46 })
	label.TextWrapped = true
	local size = addLine(label, "12 x 6 x 12 MAX", 0.62, 0.12, Enum.Font.GothamBold)
	size.TextColor3 = INK
	BuildUtil.Look(
		front,
		"Clear Bag Rule",
		"Only see-through bags (or a tiny clutch) come into the stadium, so security can check them in a snap. Sorry - no backpacks, and no pet hamsters!",
		{ Distance = 8 }
	)
end

-- The lit stadium directory on the lobby wall (between the guest services desk and the front):
-- the bowl from above as you see it walking in at Gate A (Gate D at the top, C on the left, B on
-- the right) with a red YOU ARE HERE dot on this gate, and the section numbers of every level.
local MAP_GATES = { { "A", 0.665, 0.86 }, { "B", 0.91, 0.52 }, { "C", 0.42, 0.52 }, { "D", 0.665, 0.18 } }
local function stadiumMap(ctx, seg, gate, L)
	local team = ctx.colors
	local lower, club, upper = sections(L, seg.name)
	local panel = box(ctx, seg, "StadiumMap", -HALL_HALF, -HALL_HALF + 0.18, 2.4, 8.4, 136.5, 145.5, SIGN_DARK, nil, NO_COLLIDE)
	local gui = canvas(panel, Enum.NormalId.Right, "StadiumMapGui", SIGN_PPS, true)
	words(gui, "MapTitle", 0.04, 0.06, 0.32, 0.1, "STADIUM MAP", WHITE)
	words(gui, "MapHere", 0.04, 0.22, 0.32, 0.07, "YOU ARE HERE", MARKER_RED, Enum.Font.GothamBold)
	words(gui, "MapGate", 0.04, 0.3, 0.32, 0.17, "GATE " .. gate.letter, ink(SIGN_DARK, team))
	for index, line in ipairs({ "LOWER BOWL  " .. lower, "CLUB LEVEL  " .. club, "UPPER DECK  " .. upper }) do
		words(gui, "MapLevel", 0.04, 0.45 + index * 0.11, 0.32, 0.07, line, WHITE, Enum.Font.GothamBold)
	end
	-- the bowl (stands) round the field, the four gates on its rim
	blob(gui, "MapBowl", 0.42, 0.18, 0.49, 0.68, CLADDING, 0.4, 1)
	blob(gui, "MapField", 0.535, 0.37, 0.26, 0.3, MAP_GRASS, nil, 2)
	blob(gui, "MapMidfield", 0.663, 0.37, 0.004, 0.3, WHITE, nil, 3)
	for _, spot in ipairs(MAP_GATES) do
		local here = spot[1] == gate.letter
		local dot = blob(gui, "MapGate" .. spot[1], spot[2] - 0.035, spot[3] - 0.0525, 0.07, 0.105, here and MARKER_RED or WHITE, 0.5, 4)
		words(dot, "MapGateLetter", 0.15, 0.15, 0.7, 0.7, spot[1], here and WHITE or INK, Enum.Font.GothamBlack, 5)
	end
	BuildUtil.Look(
		panel,
		"Stadium Map",
		"You are at Gate "
			.. gate.letter
			.. ". Gates A, B, C and D sit on all four sides of the bowl. Ride up for the main concourse (sections "
			.. lower
			.. "), the club level and the upper deck!",
		{ At = Vector3.new(0.7, -1.4, 0), Distance = 9 }
	)
end

-- A two-colour medallion set into the lobby floor between the portal and the escalators (the ring's
-- top stays 0.02 under the core's, so the two never flicker).
local function lobbyMedallion(ctx, seg, team)
	local upright = CFrame.Angles(0, 0, math.pi / 2) -- (a cylinder's axis turned to point up)
	cyl(ctx, "FloorMedallion", at(seg, 0, 0.22, 147.5) * upright, 0.04, 8, team.Secondary, Enum.Material.Marble, PAINT)
	cyl(ctx, "FloorMedallionCore", at(seg, 0, 0.23, 147.5) * upright, 0.06, 6.4, team.Primary, Enum.Material.Marble, PAINT)
end

-- THE LEGEND: a bronze quarterback frozen mid-throw on a granite pedestal in front of Gate A,
-- facing the plaza (left of the walkway, clear of the flags and the front road).
local function legendStatue(ctx, seg)
	local sx, so = -20, 188
	local statue = BuildUtil.Child(ctx, "LegendStatue")
	box(statue, seg, "StatuePedestal", sx - 2.3, sx + 2.3, 0, 4, so - 2.3, so + 2.3, PLINTH_STONE, Enum.Material.Granite)
	local plaque = box(statue, seg, "StatuePlaque", sx - 1.6, sx + 1.6, 1.1, 3.1, so + 2.3, so + 2.42, BRONZE, Enum.Material.Metal)
	local title =
		write(plaque, OUTWARD, "THE LEGEND", Color3.fromRGB(246, 226, 180), { Top = 0.08, Height = 0.44, Font = Enum.Font.Garamond })
	addLine(title, "OUR FIRST STAR QUARTERBACK", 0.6, 0.26, Enum.Font.GothamBold)
	local function bronze(name, size, cframe)
		return BuildUtil.Part(statue, {
			Name = name,
			Size = size,
			CFrame = cframe,
			Color = BRONZE,
			Material = Enum.Material.Metal,
			Reflectance = 0.08,
		})
	end
	-- the left foot steps toward the plaza, the right one pushes off behind
	bronze("StatueLeg", Vector3.new(0.9, 3.6, 1), at(seg, sx - 0.55, 5.75, so + 0.45) * CFrame.Angles(math.rad(14), 0, 0))
	bronze("StatueLeg", Vector3.new(0.9, 3.6, 1), at(seg, sx + 0.55, 5.75, so - 0.45) * CFrame.Angles(math.rad(-14), 0, 0))
	bronze("StatueTorso", Vector3.new(2.4, 2.8, 1.3), at(seg, sx, 8.9, so) * CFrame.Angles(0, math.rad(-12), 0))
	bronze("StatuePads", Vector3.new(3.1, 0.7, 1.7), at(seg, sx, 10.15, so) * CFrame.Angles(0, math.rad(-12), 0))
	BuildUtil.Part(statue, {
		Name = "StatueHelmet",
		Shape = Enum.PartType.Ball,
		Size = Vector3.new(1.6, 1.6, 1.6),
		CFrame = at(seg, sx, 11.05, so),
		Color = BRONZE,
		Material = Enum.Material.Metal,
		Reflectance = 0.08,
	})
	bronze("StatueFacemask", Vector3.new(1, 0.5, 0.22), at(seg, sx, 10.85, so + 0.8))
	-- the left arm points at the receiver, the throwing arm cocks the ball up and back
	bronze("StatueArm", Vector3.new(0.6, 2.6, 0.6), at(seg, sx - 1.45, 10.35, so + 1.22) * CFrame.Angles(math.rad(-70), 0, 0))
	bronze("StatueArm", Vector3.new(0.6, 2.6, 0.6), at(seg, sx + 1.45, 10.97, so - 0.75) * CFrame.Angles(math.rad(35), 0, 0))
	cyl(
		statue,
		"StatueFootball",
		at(seg, sx + 1.45, 12.3, so - 1.55) * CFrame.Angles(0, math.pi / 2, 0),
		1.1,
		0.62,
		BRONZE,
		Enum.Material.Metal,
		{ Reflectance = 0.08 }
	)
	BuildUtil.Look(
		plaque,
		"The Legend",
		"A bronze statue of the franchise's first star quarterback, frozen mid-throw. Fans rub the football for luck before every game. Will your quarterback be the next legend?",
		{ LookKey = "roster:QB", Distance = 10 }
	)
end

-- The portal (pylons, marquee, canopy), the plaza in front of it (paving, turnstiles, scanners,
-- security tent, flags) and the entry hall behind it.
local function buildGate(ctx, seg, gate, L)
	local team = ctx.colors
	local lower = sections(L, seg.name)
	local hall = BuildUtil.Child(ctx, "Gate" .. gate.letter)

	-- PORTAL ------------------------------------------------------------------------------
	for _, s in ipairs({ -1, 1 }) do
		local pylon =
			box(hall, seg, "GatePylon", s * PORTAL_HALF, s * PYLON_OUT, 0, PYLON_TOP, PYLON_IN, PYLON_FRONT, STONE, Enum.Material.Granite)
		-- a tall team-colour panel with the gate letter on the pylon's front
		local panel = box(
			hall,
			seg,
			"GatePylonPanel",
			s * (PORTAL_HALF + 0.9),
			s * (PYLON_OUT - 0.9),
			6,
			PYLON_TOP - 2,
			PYLON_FRONT,
			PYLON_FRONT + 0.2,
			team.Primary,
			nil,
			PAINT
		)
		local color = ink(team.Primary, team)
		local letter = write(panel, OUTWARD, gate.letter, color, { Top = 0.04, Height = 0.3, Glow = true })
		addLine(letter, "GATE", 0.34, 0.08, Enum.Font.GothamBold)
		BuildUtil.Light(pylon, "PointLight", { Name = "PylonLight", Range = 22, Brightness = 1.2, Color = LIGHT_WARM, Shadows = false })
		if s == -(gate.plazaSide or 1) then
			-- a ticket window in the pylon's side, facing the people walking through the portal
			local window = box(
				hall,
				seg,
				"TicketWindow",
				s * PORTAL_HALF,
				s * (PORTAL_HALF - 0.15),
				2.6,
				7.4,
				156,
				161,
				SIGN_DARK,
				Enum.Material.Glass,
				PAINT
			)
			local face = s < 0 and Enum.NormalId.Right or Enum.NormalId.Left
			local tickets = write(window, face, "TICKETS", ink(SIGN_DARK, team), { Glow = true, Top = 0.06, Height = 0.26 })
			addLine(tickets, "WILL CALL", 0.36, 0.14, Enum.Font.GothamBold)
			BuildUtil.Look(
				window,
				"Ticket Window",
				"Fans pick up their tickets here on game day. You own the whole stadium, so you always get in free!",
				{ Distance = 9 }
			)
		end
	end
	local marquee = box(hall, seg, "GateMarquee", -PORTAL_HALF, PORTAL_HALF, LINTEL[1], LINTEL[2], PYLON_IN, PYLON_FRONT, SIGN_DARK)
	local accentColor = ink(SIGN_DARK, team)
	local headline = write(marquee, OUTWARD, "GATE " .. gate.letter, accentColor, { Top = 0.06, Height = 0.56, Glow = true })
	addLine(headline, gate.name, 0.64, 0.3, Enum.Font.GothamBold)
	write(marquee, INWARD, "EXIT  -  GATE " .. gate.letter, WHITE, { Top = 0.2, Height = 0.6, Glow = true, Name = "ExitSign" })
	BuildUtil.Look(marquee, gate.title, gate.info .. " Lower-bowl sections " .. lower .. " are right inside.", {
		At = Vector3.new(0, 4 - (LINTEL[1] + LINTEL[2]) / 2, -(PYLON_FRONT - PYLON_IN) / 2 - 1),
		Distance = 12,
	})
	local led = box(
		hall,
		seg,
		"MarqueeLED",
		-PORTAL_HALF,
		PORTAL_HALF,
		LINTEL[1] - 0.4,
		LINTEL[1],
		PYLON_FRONT - 1,
		PYLON_FRONT,
		team.Secondary,
		Enum.Material.Neon,
		PAINT
	)
	lightsAlong(led, 3, { Name = "GateLight", Range = 20, Brightness = 1.4, Color = LIGHT_WARM, Shadows = false }, -0.5)

	-- glass canopy over the turnstiles, with a steel edge beam and the team banner under it
	box(
		hall,
		seg,
		"GateCanopy",
		-CANOPY_HALF,
		CANOPY_HALF,
		CANOPY_Y[1],
		CANOPY_Y[2],
		PYLON_FRONT,
		CANOPY_OUT,
		GLASS,
		Enum.Material.Glass,
		{ Transparency = 0.35 }
	)
	local beam = box(
		hall,
		seg,
		"CanopyBeam",
		-CANOPY_HALF,
		CANOPY_HALF,
		CANOPY_Y[1] - 1.2,
		CANOPY_Y[2] + 0.2,
		CANOPY_OUT - 1,
		CANOPY_OUT,
		DARK_STEEL,
		Enum.Material.Metal
	)
	lightsAlong(beam, 4, { Name = "CanopyLight", Range = 18, Brightness = 1.2, Color = LIGHT_WARM, Shadows = false }, -1)
	for _, s in ipairs({ -1, 1 }) do
		box(
			hall,
			seg,
			"CanopyPost",
			s * (CANOPY_HALF - 1.2),
			s * (CANOPY_HALF - 0.4),
			0,
			CANOPY_Y[1] - 1.2,
			CANOPY_OUT - 0.9,
			CANOPY_OUT - 0.1,
			DARK_STEEL,
			Enum.Material.Metal
		)
	end
	local banner = box(
		hall,
		seg,
		"TeamBanner",
		-12,
		12,
		CANOPY_Y[1] - 5.6,
		CANOPY_Y[1] - 1.2,
		CANOPY_OUT - 0.6,
		CANOPY_OUT - 0.4,
		team.Primary,
		nil,
		PAINT
	)
	liveTeam(ctx, banner, OUTWARD, ink(team.Primary, team), team.Primary, { PPS = 14 })

	-- PLAZA ---------------------------------------------------------------------------------
	box(hall, seg, "GatePaving", -PAVING_HALF, PAVING_HALF, 0.1, 0.2, FRONT, PAVING_OUT, PAVING, Enum.Material.Slate, PAINT)
	local logo = BuildUtil.Part(hall, {
		Name = "GateFloorLogo",
		Size = Vector3.new(18, 0.06, 6),
		-- turned round so its +Z faces the plaza: the text reads upright for fans walking in
		CFrame = at(seg, 0, 0.23, 156) * TURN,
		Color = team.Primary,
		CanCollide = false,
		CastShadow = false,
	})
	write(logo, Enum.NormalId.Top, "GATE " .. gate.letter, ink(team.Primary, team), { Top = 0.12, Height = 0.76 })

	-- turnstiles: stainless cabinets with glowing ticket scanners (non-collidable: fans pass
	-- between them, and the walkway through the gate stays clear)
	for index = -3, 3 do
		local x = index * 6
		local cabinet =
			box(hall, seg, "Turnstile", x - 0.6, x + 0.6, 0.2, 3.6, TURNSTILE_O[1], TURNSTILE_O[2], STEEL, Enum.Material.Metal, NO_COLLIDE)
		local scanner = box(
			hall,
			seg,
			"TicketScanner",
			x - 0.45,
			x + 0.45,
			3.6,
			4.1,
			TURNSTILE_O[1] + 0.5,
			TURNSTILE_O[2] - 0.5,
			SCANNER_GREEN,
			Enum.Material.Neon,
			NO_COLLIDE
		)
		if index == 0 then
			BuildUtil.Look(
				cabinet,
				"Turnstiles",
				"Scan your ticket! Hold it under the green light - BEEP! - and walk on through. On game day thousands of fans pass these.",
				{
					Distance = 9,
				}
			)
		elseif index == 1 then
			BuildUtil.Look(
				scanner,
				"Ticket Scanner",
				"Green light means GO! Red light means... check you have the right game. Every ticket has a secret barcode.",
				{
					Distance = 8,
				}
			)
		end
	end

	-- security tent (bag check + walk-through detector)
	-- (the plaza side: Gate B mirrors its plaza, clear of the west video board's control room)
	local t = gate.tent or TENT
	local ps = gate.plazaSide or 1
	for _, u in ipairs({ t.x0 + 0.2, t.x1 - 0.2 }) do
		for _, o in ipairs({ t.o0 + 0.2, t.o1 - 0.2 }) do
			box(hall, seg, "TentLeg", ps * u - 0.2, ps * u + 0.2, 0, 9.2, o - 0.2, o + 0.2, STEEL, Enum.Material.Metal)
		end
	end
	local mid = (t.o0 + t.o1) / 2
	-- gable roof: two wedges meeting at the ridge (o = mid)
	BuildUtil.Wedge(hall, {
		Name = "TentRoof",
		Size = Vector3.new(t.x1 - t.x0 + 0.4, 2.4, mid - t.o0 + 0.2),
		CFrame = at(seg, ps * (t.x0 + t.x1) / 2, 10.4, (t.o0 - 0.2 + mid) / 2) * TURN,
		Color = TENT_WHITE,
		Material = Enum.Material.Fabric,
	})
	BuildUtil.Wedge(hall, {
		Name = "TentRoof",
		Size = Vector3.new(t.x1 - t.x0 + 0.4, 2.4, t.o1 + 0.2 - mid),
		CFrame = at(seg, ps * (t.x0 + t.x1) / 2, 10.4, (mid + t.o1 + 0.2) / 2),
		Color = TENT_WHITE,
		Material = Enum.Material.Fabric,
	})
	local valance = box(
		hall,
		seg,
		"TentValance",
		ps * (t.x0 - 0.2),
		ps * (t.x1 + 0.2),
		8,
		9.2,
		t.o1 + 0.2,
		t.o1 + 0.4,
		team.Primary,
		Enum.Material.Fabric,
		PAINT
	)
	write(valance, OUTWARD, "SECURITY", ink(team.Primary, team), { Top = 0.08, Height = 0.84 })
	local tableTop =
		box(hall, seg, "BagTable", ps * (t.x0 + 1.5), ps * (t.x0 + 7.5), 0.2, 3.2, t.o0 + 2, t.o0 + 4.6, WHITE, Enum.Material.SmoothPlastic)
	BuildUtil.Look(
		tableTop,
		"Security Check",
		"Bags go on the table for a quick peek, then walk through the arch. Keys and phones in the bin - no beeping allowed!",
		{
			Distance = 9,
		}
	)
	box(hall, seg, "MetalDetector", ps * (t.x1 - 4.6), ps * (t.x1 - 4), 0.2, 7.4, mid - 0.6, mid + 0.6, DARK_STEEL, Enum.Material.Metal)
	box(hall, seg, "MetalDetector", ps * (t.x1 - 1.4), ps * (t.x1 - 0.8), 0.2, 7.4, mid - 0.6, mid + 0.6, DARK_STEEL, Enum.Material.Metal)
	local header = box(
		hall,
		seg,
		"MetalDetectorTop",
		ps * (t.x1 - 4.6),
		ps * (t.x1 - 0.8),
		7.4,
		8,
		mid - 0.6,
		mid + 0.6,
		DARK_STEEL,
		Enum.Material.Metal
	)
	BuildUtil.Light(header, "PointLight", { Name = "TentLight", Range = 14, Brightness = 1, Color = LIGHT_COOL, Shadows = false })

	-- two team flags on tall poles
	local flagLen = gate.flagLen or 10
	for index, u in ipairs(gate.flags or { -40, -52 }) do
		local x = ps * u
		BuildUtil.Cylinder(hall, {
			Name = "FlagPole",
			Position = (at(seg, x, 20, 172)).Position,
			Height = 40,
			Diameter = 0.6,
			Axis = "Y",
			Color = STEEL,
			Material = Enum.Material.Metal,
		})
		local flag = box(
			hall,
			seg,
			"TeamFlag",
			ps * (u - 0.3 - flagLen),
			ps * (u - 0.3),
			32.5,
			38.5,
			171.9,
			172.1,
			index == 1 and team.Primary or team.Secondary,
			Enum.Material.Fabric,
			PAINT
		)
		local flagColor = index == 1 and team.Primary or team.Secondary
		liveTeam(ctx, flag, OUTWARD, ink(flagColor, team), flagColor, { PPS = 14 })
	end

	-- ENTRY HALL ----------------------------------------------------------------------------
	box(hall, seg, "HallFloor", -HALL_HALF, HALL_HALF, 0.1, 0.2, HALL_IN, FRONT, TERRAZZO, Enum.Material.Marble, PAINT)
	local light = { Name = "HallLight", Range = 26, Brightness = 1.1, Color = LIGHT_WARM, Shadows = false }
	for _, s in ipairs({ -1, 1 }) do
		-- under the club ring the walls meet its floor slab (52), but stop below its outer girder
		-- (49.5, offsets 106..108); outside it they carry the club-level bridge (53)
		local well = box(
			hall,
			seg,
			"HallWall",
			s * HALL_HALF,
			s * HALL_WALL,
			0,
			CLUB_SLAB,
			HALL_IN,
			GIRDER_IN,
			HALL_WALL_COLOR,
			Enum.Material.Concrete
		)
		lightsAlongZ(well, 2, light, -s * 0.8, 12.7)
		box(
			hall,
			seg,
			"HallWall",
			s * HALL_HALF,
			s * HALL_WALL,
			0,
			LOW_WALL_TOP,
			GIRDER_IN,
			CLUB_EDGE,
			HALL_WALL_COLOR,
			Enum.Material.Concrete
		)
		local outer =
			box(hall, seg, "HallWall", s * HALL_HALF, s * HALL_WALL, 0, WALL_TOP, CLUB_EDGE, FRONT, HALL_WALL_COLOR, Enum.Material.Concrete)
		lightsAlongZ(outer, 2, light, -s * 0.8, 12)
		box(
			hall,
			seg,
			"HallStripe",
			s * (HALL_HALF - 0.15),
			s * HALL_HALF,
			9.5,
			11.5,
			LOBBY_IN + 0.6,
			FRONT - 0.6,
			team.Primary,
			nil,
			PAINT
		)
		-- the lobby's inner wall, open in the middle where the escalators rise
		local inner = box(
			hall,
			seg,
			"LobbyInnerWall",
			s * LOBBY_OPEN,
			s * HALL_HALF,
			0,
			LOBBY_CEIL[2],
			LOBBY_IN - 0.6,
			LOBBY_IN,
			HALL_WALL_COLOR,
			Enum.Material.Concrete
		)
		if s < 0 then
			local welcome = write(inner, OUTWARD, "WELCOME", team.Primary, { Top = 0.3, Height = 0.12, Left = 0.06, Width = 0.88 })
			addLine(welcome, "TO GATE " .. gate.letter, 0.43, 0.08, Enum.Font.GothamBold)
		else
			local screen = box(
				hall,
				seg,
				"LobbyTeamScreen",
				1.2 + LOBBY_OPEN,
				HALL_HALF - 0.8,
				13,
				19,
				LOBBY_IN,
				LOBBY_IN + 0.15,
				SIGN_DARK,
				nil,
				PAINT
			)
			liveTeam(ctx, screen, OUTWARD, ink(SIGN_DARK, team), SIGN_DARK, { PPS = 20 })
		end
	end
	-- lobby ceiling (a hole over the elevator shaft)
	local ceilings = {
		{ -HALL_HALF, HALL_HALF, LOBBY_IN, SHAFT.o0 },
		{ -HALL_HALF, HALL_HALF, SHAFT.o1, PYLON_IN },
		{ -HALL_HALF, SHAFT.x0, SHAFT.o0, SHAFT.o1 },
	}
	for index, c in ipairs(ceilings) do
		local ceiling = box(hall, seg, "LobbyCeiling", c[1], c[2], LOBBY_CEIL[1], LOBBY_CEIL[2], c[3], c[4], WHITE)
		if index < 3 then
			lightsAlong(ceiling, 2, light, -0.6)
		end
	end
	-- the escalator well's back wall (under the main concourse's gate opening) with a team mural
	local back = box(hall, seg, "WellEndWall", -HALL_HALF, HALL_HALF, 0, 29, HALL_IN, HALL_IN + 0.6, team.Primary, Enum.Material.Concrete)
	liveTeam(ctx, back, OUTWARD, ink(team.Primary, team), team.Primary, { PPS = 8, PadY = 0.3 })
	lightsAlong(back, 2, light, 0, -2)
	-- two big banners on the well's side walls for the escalator riders: the team name and its
	-- record (both kept up to date by the server)
	for _, s in ipairs({ -1, 1 }) do
		local color = s < 0 and team.Primary or team.Secondary
		local banner =
			box(hall, seg, "WellBanner", s * (HALL_HALF - 0.15), s * HALL_HALF, 9, 25, 95, 111, color, Enum.Material.Fabric, PAINT)
		local face = s < 0 and Enum.NormalId.Right or Enum.NormalId.Left
		if s < 0 then
			liveTeam(ctx, banner, face, ink(color, team), color, { PPS = 10, PadY = 0.3 })
		else
			local _, record = BuildUtil.LiveText(banner, face, "record", {
				LabelName = "LiveRecord",
				Text = "LET'S GO!",
				TextColor3 = ink(color, team),
				BackgroundColor3 = color,
				BackgroundTransparency = 0,
				LightInfluence = 0,
				Font = Enum.Font.GothamBlack,
				PixelsPerStud = 10,
			})
			local pad = Instance.new("UIPadding")
			pad.PaddingTop, pad.PaddingBottom = UDim.new(0.32, 0), UDim.new(0.32, 0)
			pad.PaddingLeft, pad.PaddingRight = UDim.new(0.06, 0), UDim.new(0.06, 0)
			pad.Parent = record
		end
	end
	-- the hall's glass front above the portal
	box(hall, seg, "HallFrontGlass", -HALL_HALF, HALL_HALF, LOBBY_CEIL[2], WALL_TOP, FRONT, PYLON_IN, GLASS, Enum.Material.Glass, GLASSY)
	-- guest services desk
	local desk = box(
		hall,
		seg,
		"GuestServicesDesk",
		-HALL_HALF + 0.4,
		-HALL_HALF + 3.4,
		0.2,
		3.6,
		124,
		132,
		team.Secondary,
		Enum.Material.SmoothPlastic
	)
	BuildUtil.Look(
		desk,
		"Guest Services",
		"Lost your seats? Need a map or a birthday sticker? The friendly staff here help every fan find the way.",
		{
			Distance = 9,
		}
	)
	local deskSign = box(hall, seg, "GuestServicesSign", -HALL_HALF, -HALL_HALF + 0.2, 5.6, 8.6, 123, 133, SIGN_DARK, nil, PAINT)
	write(deskSign, Enum.NormalId.Right, "GUEST SERVICES", WHITE, { Glow = true, Top = 0.15, Height = 0.7 })
	-- a live game-day countdown over the desk
	local clock = box(hall, seg, "GameDayScreen", -HALL_HALF + 0.15, -HALL_HALF + 0.35, 12.4, 17.4, 122, 134, SIGN_DARK, nil, PAINT)
	local _, clockLabel = BuildUtil.LiveText(clock, Enum.NormalId.Right, "gameday", {
		LabelName = "Live_gameday",
		Text = "NEXT GAME SOON",
		TextColor3 = Color3.fromRGB(255, 226, 120),
		BackgroundColor3 = SIGN_DARK,
		BackgroundTransparency = 0,
		LightInfluence = 0,
		Font = Enum.Font.GothamBold,
		PixelsPerStud = 20,
	})
	local pad = Instance.new("UIPadding")
	pad.PaddingLeft, pad.PaddingRight = UDim.new(0.05, 0), UDim.new(0.05, 0)
	pad.PaddingTop, pad.PaddingBottom = UDim.new(0.15, 0), UDim.new(0.15, 0)
	pad.Parent = clockLabel
	BuildUtil.Light(deskSign, "PointLight", { Name = "DeskLight", Range = 12, Brightness = 1, Color = LIGHT_WARM, Shadows = false })
	if gate.carpet then
		box(hall, seg, "RedCarpet", -3, 3, 0.26, 0.32, F1.bottom + 4, PAVING_OUT, RED_CARPET, Enum.Material.Fabric, PAINT)
	end

	-- DETAILS: pylon plinths + LED ribbons, planters, the clear-bag board, the lobby's map and floor
	-- medallion, and Gate A's statue
	pylonTrim(hall, seg, team)
	gatePlanters(hall, seg)
	clearBagSign(hall, seg, t, ps, team)
	stadiumMap(hall, seg, gate, L)
	if not gate.carpet then
		lobbyMedallion(hall, seg, team)
	end
	if gate.statue then
		legendStatue(hall, seg)
	end
	return hall
end

function M.gates(ctx)
	local L = ctx.config.Layout
	for index, name in ipairs(GATE_ORDER) do
		BuildUtil.Stage(ctx, index)
		buildGate(ctx, segment(L, name), GATE_INFO[name], L)
	end
end

---------------------------------------------------------------------------------------------
-- ESCALATORS
---------------------------------------------------------------------------------------------

--[[
	A bank of `lanes` escalators: the steps' walking surface runs from a (bottom) to b (top),
	w0..w1 wide (see slope). Steps (diamond plate), the truss under them (from `trussFrom` along
	the run, 0..1), glass balustrades on both sides and between lanes, black handrails.
	skirts: { color, sides, from } - a team-colour band along the truss on its w0 side (-1) and / or
	its w1 side (+1), from `from` along the run (0..1; default: where the truss starts).
]]
local function escalatorBank(ctx, seg, a, b, w0, w1, lanes, trussFrom, skirts)
	local dx, dy, dz = b[1] - a[1], b[2] - a[2], b[3] - a[3]
	local run = math.sqrt(dx * dx + dz * dz)
	local cosA = run / math.sqrt(run * run + dy * dy)
	local steps = slope(ctx, seg, "EscalatorSteps", a, b, w0, w1, TREAD, STEEL, Enum.Material.DiamondPlate)
	local t = trussFrom or 0
	local start = { a[1] + dx * t, a[2] + dy * t, a[3] + dz * t }
	local truss = slope(ctx, seg, "EscalatorTruss", start, b, w0, w1, TRUSS, CLADDING, Enum.Material.Metal, nil, TREAD)
	local skirtFrom = skirts and skirts.from or t
	local skirtStart = { a[1] + dx * skirtFrom, a[2] + dy * skirtFrom, a[3] + dz * skirtFrom }
	for _, side in ipairs(skirts and skirts.sides or {}) do
		local edge = side < 0 and w0 or w1
		slope(ctx, seg, "EscalatorSkirt", skirtStart, b, edge, edge + side * 0.12, 1.3, skirts.color, nil, PAINT, TREAD + 0.6)
	end
	lightsAlongZ(
		truss,
		2,
		{ Name = "EscalatorLight", Range = 14, Brightness = 0.9, Color = LIGHT_COOL, Shadows = false },
		0,
		-TRUSS / 2 - 0.5
	)
	local laneW = ((w1 - w0) - (lanes + 1) * BAL) / lanes
	for i = 0, lanes do
		local g0 = w0 + i * (laneW + BAL)
		local g1 = g0 + BAL
		slope(ctx, seg, "EscalatorGlass", up(a, BAL_H), up(b, BAL_H), g0, g1, BAL_H * cosA, GLASS, Enum.Material.Glass, GLASSY)
		if i == 0 or i == lanes then
			slope(
				ctx,
				seg,
				"Handrail",
				up(a, BAL_H + 0.35),
				up(b, BAL_H + 0.35),
				g0 - 0.06,
				g1 + 0.06,
				0.35,
				RUBBER,
				Enum.Material.Rubber,
				NO_COLLIDE
			)
		end
	end
	return steps
end

-- A glass guard rail (3.5 tall, or `height`) on a landing.
local function rail(ctx, seg, x0, x1, y, o0, o1, height)
	return box(ctx, seg, "GlassRail", x0, x1, y, y + (height or 3.5), o0, o1, GLASS, Enum.Material.Glass, GLASSY)
end

-- How far up a bank (0..1) its truss must start so the truss stays above the landing slab under
-- its bottom end (1 thick): the truss's lower corner = steps line - (TREAD + TRUSS) / cos.
local function trussStart(rise, run)
	local len = math.sqrt(rise * rise + run * run)
	local cosA, tanA = run / len, rise / run
	local f = ((TREAD + TRUSS) * cosA - 1 + 0.05) / tanA
	return math.max(0, f) / run
end

-- A safety-yellow comb plate on a landing where riders step on or off an escalator (x0..x1 along
-- the segment, o0..o1, painted on the floor at height y).
local function combPlate(ctx, seg, x0, x1, y, o0, o1)
	box(ctx, seg, "CombPlate", x0, x1, y, y + 0.06, o0, o1, SAFETY_YELLOW, Enum.Material.DiamondPlate, PAINT)
end

-- Step 1: the escalator banks + landings of one gate hall.
local function hallEscalators(ctx, seg)
	local esc = BuildUtil.Child(ctx, "Escalators")
	local slab = CONCRETE
	local skirts = { color = ctx.colors.Primary, sides = { -1, 1 } }
	-- F1: ground -> main concourse (y 30) ------------------------------------------------------
	local f1run = F1.bottom - F1.top
	-- (from the ground the truss starts where its lower corner clears the floor)
	local len1 = math.sqrt(f1run * f1run + 30 * 30)
	local f1start = ((TREAD + TRUSS) * f1run / len1 + 0.3) / (30 / f1run) / f1run
	local f1 = escalatorBank(esc, seg, { F1.x, F1.y0, F1.bottom }, { F1.x, F1.y1, F1.top }, -6, 6, 2, f1start, skirts)
	-- (the steps come out of the hall floor 0.35 before their foot)
	combPlate(esc, seg, -5.6, 5.6, 0.2, F1.bottom - 0.2, F1.bottom + 1.2)
	combPlate(esc, seg, -5.6, 5.6, F1.y1, F1.top - 1.4, F1.top - 0.1)
	-- (the steps' local +Z runs down the slope: the prompt hangs over the bottom of the bank)
	BuildUtil.Look(
		f1,
		"Escalators",
		"Up to the main concourse! Hold the handrail - before kickoff thousands of fans ride up here to find their seats.",
		{ At = Vector3.new(0, 3, len1 / 2 - 2.5), Distance = 9 }
	)
	box(esc, seg, "LandingC", -HALL_HALF, 6, 29, 30, 84, F1.top, slab, Enum.Material.Concrete)
	rail(esc, seg, 5.6, 6, 30, HALL_IN, F1.top)
	-- bridge A back out to the mezzanine B (the bottom of F2)
	box(esc, seg, "BridgeA", -HALL_HALF, -6, 29, 30, F1.top, SHAFT.o1, slab, Enum.Material.Concrete)
	rail(esc, seg, -6.4, -6, 30, F1.top, SHAFT.o1)
	box(esc, seg, "MezzanineB", -HALL_HALF, HALL_HALF, 29, 30, SHAFT.o1, FRONT, slab, Enum.Material.Concrete)

	-- F2: main concourse -> club ring (y 54) ---------------------------------------------------
	local f2run = F2.bottom - F2.top
	-- (its skirts start where they clear bridge A's glass rail beside the bank's foot)
	escalatorBank(
		esc,
		seg,
		{ F2.x, F2.y0, F2.bottom },
		{ F2.x, F2.y1, F2.top },
		-6,
		6,
		2,
		trussStart(24, f2run),
		{ color = skirts.color, sides = skirts.sides, from = 0.28 }
	)
	combPlate(esc, seg, -5.6, 5.6, F2.y0, F2.bottom + 0.1, F2.bottom + 1.4)
	combPlate(esc, seg, -5.6, 5.6, F2.y1, F2.top - 1.4, F2.top - 0.1)
	box(esc, seg, "LandingD", -6, 6, 53, 54, CLUB_EDGE, F2.top, slab, Enum.Material.Concrete)
	rail(esc, seg, -6, -5.6, 54, CLUB_EDGE, F2.top)
	-- bridge E (on top of the +x hall wall) to the elevator + the path to F3 (the rails between it
	-- and the event level outside the hall are HIGH_RAIL)
	box(esc, seg, "BridgeE", 6, HALL_HALF, 53, 54, CLUB_EDGE, SHAFT.o0, slab, Enum.Material.Concrete)
	rail(esc, seg, 6, 6.4, 54, F2.top, SHAFT.o0)
	rail(esc, seg, HALL_HALF - 0.4, HALL_HALF, 54, CLUB_EDGE, PATH.o0, HIGH_RAIL)
	box(esc, seg, "UpperPath", HALL_HALF, PATH.x1, 53, 54, PATH.o0, PATH.o1, slab, Enum.Material.Concrete)
	rail(esc, seg, HALL_HALF, PATH.leg1, 54, PATH.o0, PATH.o0 + 0.4, HIGH_RAIL)
	rail(esc, seg, HALL_HALF, PATH.x1, 54, PATH.o1 - 0.4, PATH.o1, HIGH_RAIL)
	box(esc, seg, "UpperPathLeg", PATH.x1, PATH.leg1, 53, 54, PATH.o0, PATH.band, slab, Enum.Material.Concrete)
	rail(esc, seg, PATH.leg1 - 0.4, PATH.leg1, 54, PATH.o0 + 0.4, PATH.band, HIGH_RAIL)
	rail(esc, seg, PATH.x1, PATH.x1 + 0.4, 54, PATH.o1, TOP.o0 + 0.2, HIGH_RAIL)
	rail(esc, seg, PATH.x1 + 0.4, PATH.leg1 - 0.4, 54, PATH.band - 0.4, PATH.band)
	local mid = (PATH.x1 + PATH.leg1) / 2
	box(esc, seg, "PathColumn", mid - 2, mid + 2, 0, 53, PATH.o0 + 1, PATH.o1 - 1, CONCRETE, Enum.Material.Concrete)

	-- F3: club ring -> upper concourse (y 74), along the segment inside the facade band ----------
	local f3run = F3.bottom - F3.top
	-- (its outer skirt shows through the curtain glass from the plaza)
	escalatorBank(
		esc,
		seg,
		{ F3.bottom, F3.y0, F3.o },
		{ F3.top, F3.y1, F3.o },
		F3.o - 3,
		F3.o + 3,
		1,
		trussStart(20, f3run),
		{ color = skirts.color, sides = { 1 } }
	)
	combPlate(esc, seg, F3.bottom + 0.1, F3.bottom + 1.4, F3.y0, F3.o - 2.6, F3.o + 2.6)
	combPlate(esc, seg, F3.top - 1.4, F3.top - 0.1, F3.y1, F3.o - 2.6, F3.o + 2.6)
	box(esc, seg, "TopLanding", TOP.x0, TOP.x1, 73, 74, TOP.o0, TOP.o1, slab, Enum.Material.Concrete)
	rail(esc, seg, TOP.x0, TOP.x1, 74, TOP.o1 - 0.4, TOP.o1)
	rail(esc, seg, TOP.x0, TOP.x0 + 0.4, 74, TOP.o0, TOP.o1 - 0.4)
end

-- Step 2: a corner ramp (two flights + landing + the bridge to the main concourse).
local function cornerRamp(ctx, seg, s)
	local L = ctx.config.Layout
	local ramp = BuildUtil.Child(ctx, "CornerRamp")
	local R = RAMP
	local function x(u)
		return s * u
	end
	local ramps = Color3.fromRGB(196, 192, 184)
	local wall = STONE_DARK
	local light = { Name = "RampLight", Range = 20, Brightness = 1, Color = LIGHT_WARM, Shadows = false }
	-- R1: ground -> 15 in the outer lane (low end at u = high, tall end at u = low)
	wedgeX(ramp, seg, "RampFlight", x(R.low), x(R.high), 0, 15, R.outer[1], R.outer[2], x(R.low), ramps, Enum.Material.Concrete)
	-- R2: 15 -> 30 in the inner lane (a solid base + a wedge, tall end at u = high)
	box(ramp, seg, "RampBase", x(R.low), x(R.high), 0, 15, R.inner[1], R.inner[2], wall, Enum.Material.Concrete)
	wedgeX(ramp, seg, "RampFlight", x(R.low), x(R.high), 15, 30, R.inner[1], R.inner[2], x(R.high), ramps, Enum.Material.Concrete)
	-- the turning landing
	box(ramp, seg, "RampLanding", x(R.landing), x(R.low), 0, 15, R.inner[1], R.outer[2], ramps, Enum.Material.Concrete)
	-- parapets (on the open sides of both flights and round the landing)
	local h = R.parapet
	local flight = math.abs(R.low - R.high)
	local cos1 = flight / math.sqrt(flight * flight + 15 * 15)
	local p = slope(
		ramp,
		seg,
		"RampParapet",
		{ x(R.high), h, R.outer[2] - 0.3 },
		{ x(R.low), 15 + h, R.outer[2] - 0.3 },
		R.outer[2] - 0.6,
		R.outer[2],
		h * cos1,
		wall,
		Enum.Material.Concrete
	)
	lightsAlongZ(p, 2, light, 0, 1)
	for _, o in ipairs({ R.inner[1] + 0.3, R.inner[2] - 0.3 }) do
		slope(
			ramp,
			seg,
			"RampParapet",
			{ x(R.low), 15 + h, o },
			{ x(R.high), 30 + h, o },
			o - 0.3,
			o + 0.3,
			h * cos1,
			wall,
			Enum.Material.Concrete
		)
	end
	local dir = R.landing > R.low and 1 or -1
	local landingEnd = R.landing - dir * 0.6
	box(ramp, seg, "RampParapet", x(R.landing), x(landingEnd), 15, 15 + h, R.inner[1], R.outer[2], wall, Enum.Material.Concrete)
	box(ramp, seg, "RampParapet", x(landingEnd), x(R.low), 15, 15 + h, R.inner[1], R.inner[1] + 0.6, wall, Enum.Material.Concrete)
	local lp =
		box(ramp, seg, "RampParapet", x(landingEnd), x(R.low), 15, 15 + h, R.outer[2] - 0.6, R.outer[2], wall, Enum.Material.Concrete)
	BuildUtil.Light(lp, "PointLight", light)
	-- a team stripe along R1's outer parapet (facing the corner plaza) and a plaque on the landing's
	-- end parapet for the fans coming up R1 (centred on R1's lane, so it is in full view all the way
	-- up: R2's parapet hides the inner lane's end from R1)
	local team = ctx.colors
	slope(
		ramp,
		seg,
		"RampStripe",
		{ x(R.high), h - 0.5, R.outer[2] },
		{ x(R.low), 15 + h - 0.5, R.outer[2] },
		R.outer[2],
		R.outer[2] + 0.12,
		0.9,
		team.Primary,
		nil,
		PAINT
	)
	local plaque = box(
		ramp,
		seg,
		"RampHalfwayPlaque",
		x(landingEnd - 0.15),
		x(landingEnd),
		15.6,
		18.2,
		R.outer[1] + 0.4,
		R.outer[2] - 1,
		team.Primary,
		nil,
		NO_COLLIDE
	)
	local halfway = write(plaque, s > 0 and Enum.NormalId.Left or Enum.NormalId.Right, "HALFWAY UP!", ink(team.Primary, team), {
		Top = 0.1,
		Height = 0.5,
	})
	addLine(halfway, "ONE MORE RAMP TO THE MAIN CONCOURSE", 0.66, 0.22, Enum.Font.GothamBold)

	-- the bridge at y 30 through the facade (R2 arrives at its +u side at the outer end), ending in a
	-- wide balcony at the main concourse's outer wall (offsets 84..100)
	local b0, b1 = R.bridge[1], R.bridge[2]
	local p0, p1, pOut = R.balcony[1], R.balcony[2], R.balcony[3]
	local balcony = box(ramp, seg, "RampBalcony", x(p0), x(p1), 29, 30, HALL_IN - 0.1, pOut, ramps, Enum.Material.Concrete)
	BuildUtil.Light(balcony, "PointLight", light)
	local bridge = box(ramp, seg, "RampBridge", x(b0), x(b1), 29, 30, pOut, R.inner[2], ramps, Enum.Material.Concrete)
	lightsAlongZ(bridge, 3, light, 0, 4)
	-- (short rail pieces round the balcony keep its middle clear for arrivals; the balcony and the
	-- bridge are over the event level, so their rails are HIGH_RAIL)
	rail(ramp, seg, x(p0), x(p0 + 0.4), 30, HALL_IN - 0.1, pOut, HIGH_RAIL)
	rail(ramp, seg, x(p1 - 0.4), x(p1), 30, HALL_IN - 0.1, pOut, HIGH_RAIL)
	local midRail = (b1 + p1 - 0.4) / 2 -- (two pieces: the harness tests arrival spots against AABBs)
	rail(ramp, seg, x(b1), x(midRail), 30, pOut - 0.4, pOut, HIGH_RAIL)
	rail(ramp, seg, x(midRail), x(p1 - 0.4), 30, pOut - 0.4, pOut, HIGH_RAIL)
	rail(ramp, seg, x(b0), x(b0 + 0.4), 30, pOut, R.inner[2], HIGH_RAIL)
	rail(ramp, seg, x(b1 - 0.4), x(b1), 30, pOut, R.inner[1], HIGH_RAIL)
	rail(ramp, seg, x(b0 + 0.4), x(b1 - 0.4), 30, R.inner[2] - 0.4, R.inner[2], HIGH_RAIL)
	box(ramp, seg, "RampColumn", x(b0 + 1), x(b1 - 1), 0, 29, 128, 132, CONCRETE, Enum.Material.Concrete)

	-- through the concourse wall: a dark glass "doorway" under a lit header outside and an exit sign
	-- inside (both ways; the wall itself belongs to Concourse.lua and has no opening here)
	local c = R.door
	local inside = at(seg, x(c), L.Bowl.MainConcourse.Floor, 71) * TURN
	local outside = at(seg, x(c), L.Bowl.MainConcourse.Floor, 93)
	local doorTop = 38.6
	local door =
		box(ramp, seg, "ConcourseEntryDoor", x(c - 3), x(c + 3), 30.05, doorTop, 84.2, 84.5, SIGN_DARK, Enum.Material.Glass, NO_COLLIDE)
	local label =
		write(door, OUTWARD, "MAIN CONCOURSE", ink(SIGN_DARK, ctx.colors), { Glow = true, Top = 0.05, Height = 0.15, PPS = SIGN_PPS })
	local hint = addLine(label, "WALK IN  >>>", 0.22, 0.1, Enum.Font.GothamBold)
	hint.TextColor3 = WHITE
	BuildUtil.Light(door, "PointLight", { Name = "PanelLight", Range = 12, Brightness = 1, Color = LIGHT_WARM, Shadows = false })
	BuildUtil.Elevator(ctx, door, inside, {
		Action = "Walk in",
		Object = "Main Concourse",
		Label = "MAIN CONCOURSE",
		At = Vector3.new(0, 32.8 - (30.05 + doorTop) / 2, -0.8),
	})
	-- (as wide as the wall allows: a food stand starts 3.5 to one side, the next segment 4.1 to the other)
	local exit = box(ramp, seg, "CornerRampExitPanel", x(c - 3.2), x(c + 3.2), 35.4, 38.4, 82.6, 82.9, SIGN_DARK, nil, NO_COLLIDE)
	local exitLabel = write(exit, INWARD, "EXIT", SCANNER_GREEN, { Glow = true, Top = 0.08, Height = 0.46, PPS = SIGN_PPS })
	local exitLine = addLine(exitLabel, "CORNER RAMP", 0.58, 0.32, Enum.Font.GothamBold)
	exitLine.TextColor3 = WHITE
	BuildUtil.Elevator(ctx, exit, outside, {
		Action = "Go out",
		Object = "Corner Ramp",
		Label = "CORNER RAMP",
		At = Vector3.new(0, 33 - 36.9, 1),
	})
end

-- Step 3: the glass elevator of one gate hall (doors at 0 / 30 / 54 + the top landing at 74).
local function elevator(ctx, seg)
	local lift = BuildUtil.Child(ctx, "Elevator")
	local team = ctx.colors
	local sh = SHAFT
	-- (from the top of the hall floor finish, so the glass never shares a face with it)
	box(lift, seg, "ElevatorShaft", sh.x0, sh.x1, 0.2, sh.top, sh.o0, sh.o1, GLASS, Enum.Material.Glass, GLASSY)
	local cab = box(
		lift,
		seg,
		"ElevatorCab",
		sh.x0 + 0.8,
		sh.x1 - 0.6,
		0.2,
		9.2,
		sh.o0 + 0.6,
		sh.o1 - 0.6,
		team.Primary,
		Enum.Material.SmoothPlastic,
		NO_COLLIDE
	)
	BuildUtil.Light(cab, "PointLight", { Name = "CabLight", Range = 12, Brightness = 1, Color = LIGHT_COOL, Shadows = false })

	-- levels: door (x0, x1, y, o0, o1, which side the riders stand: +1 = toward the plaza) +
	-- the arrival spot. (The ground door faces the lobby's open front: behind the shaft, between
	-- escalator F1 and the hall wall, is a closed pocket nobody can walk out of.)
	local cx = (sh.x0 + 0.8 + sh.x1 - 0.6) / 2
	local FACE_WEST = CFrame.Angles(0, math.pi / 2, 0) -- arrive looking along -x (toward escalator F2)
	local levels = {
		{
			name = "Street Level",
			label = "STREET LEVEL",
			y = 0,
			o = { sh.o1, sh.o1 + 0.3 },
			side = 1,
			arrive = at(seg, cx, 0, sh.o1 + 3), -- facing the gate (the way out)
		},
		{
			name = "Main Concourse",
			label = "MAIN CONCOURSE",
			y = 30,
			o = { sh.o1, sh.o1 + 0.3 },
			side = 1,
			arrive = at(seg, cx, 30, sh.o1 + 3) * FACE_WEST,
		},
		{
			name = "Club Level",
			label = "CLUB LEVEL",
			y = 54,
			o = { sh.o0 - 0.3, sh.o0 },
			side = -1,
			arrive = at(seg, cx, 54, sh.o0 - 3.2) * TURN,
		},
		{
			name = "Upper Concourse",
			label = "UPPER CONCOURSE",
			y = 74,
			o = { TOP.o0, TOP.o0 + 0.3 },
			side = 1,
			arrive = at(seg, cx + 0.6, 74, (TOP.o0 + TOP.o1) / 2 + 0.2) * TURN, -- facing the concourse
		},
	}
	for index, level in ipairs(levels) do
		local x0, x1 = cx - 2.3, cx + 2.3
		if index == 4 then
			x0, x1 = x0 + 0.6, x1 + 0.6
		end
		local door =
			box(lift, seg, "ElevatorDoor", x0, x1, level.y, level.y + 8, level.o[1], level.o[2], STEEL, Enum.Material.Metal, NO_COLLIDE)
		write(
			door,
			level.side > 0 and OUTWARD or INWARD,
			level.label,
			SIGN_DARK,
			{ Top = 0.02, Height = 0.16, Left = 0.03, Width = 0.94, PPS = SIGN_PPS }
		)
		local buttons = 0
		for target, other in ipairs(levels) do
			if target ~= index then
				buttons += 1
				local goingUp = target > index
				BuildUtil.Elevator(ctx, door, other.arrive, {
					Action = goingUp and "Ride up" or "Ride down",
					Object = "Elevator: " .. other.name,
					Label = other.label,
					At = Vector3.new((buttons - 2) * 3.2, -1, level.side > 0 and -0.8 or 0.8),
				})
			end
		end
		-- the call panel beside the door (on the riders' side, behind the prompts): the level number
		-- over the call buttons (the bottom level only goes up, the top one only down). It is a box
		-- from the face the door stands on (the shaft glass; at the top, the upper concourse's outer
		-- wall the door stands 0.2 off) to just in front of the door, so it never floats.
		local front = level.side > 0 and level.o[2] or level.o[1]
		local behind = index == #levels and FRONT or (level.side > 0 and level.o[1] or level.o[2])
		local panel = box(
			lift,
			seg,
			"ElevatorCallPanel",
			x1 + 0.3,
			x1 + 1,
			level.y + 2.6,
			level.y + 7.4,
			behind + level.side * 0.02,
			front + level.side * 0.1,
			DARK_STEEL,
			Enum.Material.Metal,
			NO_COLLIDE
		)
		local gui = canvas(panel, level.side > 0 and OUTWARD or INWARD, "CallPanelGui", SIGN_PPS, true)
		words(gui, "LevelNumber", 0.12, 0.05, 0.76, 0.2, tostring(index), Color3.fromRGB(255, 170, 70), Enum.Font.GothamBold)
		if index < #levels then
			blob(gui, "CallUp", 0.25, 0.42, 0.5, 0.073, Color3.fromRGB(150, 220, 255), 0.5)
		end
		if index > 1 then
			blob(gui, "CallDown", 0.25, 0.58, 0.5, 0.073, Color3.fromRGB(220, 222, 230), 0.5)
		end
	end
end

-- Step 4: wayfinding signs of one gate hall.
local function hallSigns(ctx, seg, gate, L)
	local team = ctx.colors
	local lower, club, upper = sections(L, seg.name)
	local signs = BuildUtil.Child(ctx, "Wayfinding")
	local color = ink(SIGN_DARK, team)
	local glow = { Name = "SignLight", Range = 12, Brightness = 1, Color = LIGHT_WARM, Shadows = false }

	-- ground: over the lobby, facing the gate
	local s1 = box(signs, seg, "WayfindingSign", -10, 10, 19.5, 25.5, 150.6, 151, SIGN_DARK, nil, NO_COLLIDE)
	local l1 = write(s1, OUTWARD, "ESCALATORS  ^  MAIN CONCOURSE", color, { Glow = true, Top = 0.1, Height = 0.42, PPS = SIGN_PPS })
	addLine(l1, "SECTIONS " .. lower .. "   |   CLUB LEVEL   |   UPPER DECK", 0.6, 0.28, Enum.Font.GothamBold)
	BuildUtil.Light(s1, "PointLight", glow)
	for _, hx in ipairs({ -7, 7 }) do -- (hangs from the lobby ceiling)
		box(signs, seg, "SignHanger", hx - 0.1, hx + 0.1, 25.5, LOBBY_CEIL[1], 150.7, 150.9, DARK_STEEL, Enum.Material.Metal, NO_COLLIDE)
	end
	BuildUtil.Look(
		s1,
		"Gate " .. gate.letter .. " Escalators",
		"Ride up to the main concourse for sections "
			.. lower
			.. ". Keep going up for the club level and the upper deck - or take the glass elevator!",
		{
			At = Vector3.new(0, 3.5 - 22.5, -1.2),
		}
	)

	-- main concourse level: on the -x wall over bridge A (the bridge leads outward = to the right)
	local s2 = box(signs, seg, "WayfindingSign", -HALL_HALF, -HALL_HALF + 0.2, 33.5, 37.5, 96, 112, SIGN_DARK, nil, NO_COLLIDE)
	local l2 =
		write(s2, Enum.NormalId.Right, "CLUB LEVEL & UPPER DECK  >>>", color, { Glow = true, Top = 0.1, Height = 0.45, PPS = SIGN_PPS })
	addLine(l2, "WALK THE BRIDGE TO THE NEXT ESCALATOR", 0.62, 0.26, Enum.Font.GothamBold)
	BuildUtil.Light(s2, "PointLight", glow)
	BuildUtil.Look(
		s2,
		"Main Concourse Level",
		"Straight ahead: the main concourse, food stands and sections "
			.. lower
			.. ". Going higher? Walk out along the bridge to the next escalator.",
		{
			At = Vector3.new(1.5, 33 - 35.5, 0),
		}
	)

	-- club level: over F2's top, facing the riders
	-- (on two posts at the outer edge of F2's top landing)
	local s3 = box(signs, seg, "WayfindingSign", -6, 6, 62, 66, F2.top - 0.4, F2.top, SIGN_DARK, nil, NO_COLLIDE)
	for _, px in ipairs({ -5.9, 5.6 }) do
		box(signs, seg, "SignPost", px, px + 0.3, F2.y1, 62, F2.top - 0.35, F2.top - 0.05, DARK_STEEL, Enum.Material.Metal, NO_COLLIDE)
	end
	local l3 = write(s3, OUTWARD, "CLUB LEVEL", color, { Glow = true, Top = 0.08, Height = 0.5, PPS = SIGN_PPS })
	addLine(l3, "SECTIONS " .. club, 0.62, 0.3, Enum.Font.GothamBold)
	BuildUtil.Light(s3, "PointLight", glow)
	BuildUtil.Look(s3, "Club Level", "Fancy! Padded club seats " .. club .. ", the club lounge and the luxury suites are through here.", {
		At = Vector3.new(0, 57 - 64, 2.5),
	})
	-- club level: over the elevator, pointing to the upper-deck path (to the right going out)
	local s4 = box(
		signs,
		seg,
		"WayfindingSign",
		SHAFT.x0 + 0.3,
		SHAFT.x1 - 0.3,
		63,
		67,
		SHAFT.o0 - 0.7,
		SHAFT.o0 - 0.4,
		SIGN_DARK,
		nil,
		NO_COLLIDE
	)
	local l4 = write(s4, INWARD, "UPPER CONCOURSE  >>", color, { Glow = true, Top = 0.1, Height = 0.45, PPS = SIGN_PPS })
	addLine(l4, "SECTIONS " .. upper, 0.62, 0.28, Enum.Font.GothamBold)
	BuildUtil.Look(
		s4,
		"Upper Concourse",
		"Turn right and follow the walkway to the last escalator - it climbs right up the outside wall to the upper deck!",
		{
			At = Vector3.new(-2.1, 57 - 65, 5.6), -- (on bridge E, clear of the elevator buttons)
		}
	)

	-- upper concourse: over its gate opening
	local s5 = box(signs, seg, "WayfindingSign", -7.5, 7.5, 80.6, 84.2, TOP.o0 + 0.05, TOP.o0 + 0.35, SIGN_DARK, nil, NO_COLLIDE)
	for _, px in ipairs({ -7.5, 7.2 }) do -- (on posts: it stands before the upper concourse exists)
		box(signs, seg, "SignPost", px, px + 0.3, F3.y1, 80.6, TOP.o0 + 0.05, TOP.o0 + 0.35, DARK_STEEL, Enum.Material.Metal, NO_COLLIDE)
	end
	local l5 = write(s5, OUTWARD, "UPPER CONCOURSE", color, { Glow = true, Top = 0.08, Height = 0.5, PPS = SIGN_PPS })
	addLine(l5, "SECTIONS " .. upper, 0.62, 0.3, Enum.Font.GothamBold)
	BuildUtil.Light(s5, "PointLight", glow)
	BuildUtil.Look(
		s5,
		"Upper Concourse",
		"The top level! Hot dogs, restrooms and the tunnels to sections " .. upper .. " - the best view of the whole field.",
		{
			At = Vector3.new(0, 77.5 - 82.4, -1.5),
		}
	)
end

-- Step 4: the sign at the foot of a corner ramp (on R2's tall end, facing the corner plaza).
local function rampSign(ctx, seg, s)
	local R = RAMP
	local sign =
		box(ctx, seg, "RampSign", s * (R.high - 0.25), s * R.high, 5, 14, R.inner[1] + 0.6, R.inner[2] - 0.6, SIGN_DARK, nil, NO_COLLIDE)
	local face = s > 0 and Enum.NormalId.Left or Enum.NormalId.Right
	local label = write(sign, face, "RAMP", WHITE, { Glow = true, Top = 0.08, Height = 0.38, PPS = SIGN_PPS })
	addLine(label, "TO THE MAIN CONCOURSE", 0.52, 0.3, Enum.Font.GothamBold)
	BuildUtil.Light(sign, "PointLight", { Name = "SignLight", Range = 14, Brightness = 1, Color = LIGHT_WARM, Shadows = false })
	BuildUtil.Look(
		sign,
		"Corner Ramp",
		"No escalator line? Walk up the ramp! Two long slopes take you to the main concourse - great for strollers and wheelchairs.",
		{
			At = Vector3.new(-s * 1.5, 3.5 - 9.5, 0),
		}
	)
end

function M.escalators(ctx)
	local L = ctx.config.Layout
	local gates, corners = {}, {}
	for _, name in ipairs(GATE_ORDER) do
		table.insert(gates, segment(L, name))
	end
	for _, name in ipairs(CORNERS) do
		table.insert(corners, segment(L, name))
	end

	BuildUtil.Stage(ctx, 1) -- Main Escalators
	for _, seg in ipairs(gates) do
		hallEscalators(ctx, seg)
	end

	BuildUtil.Stage(ctx, 2) -- Corner Ramps
	for _, seg in ipairs(corners) do
		cornerRamp(ctx, seg, rampSide(seg))
	end

	BuildUtil.Stage(ctx, 3) -- Elevators
	for _, seg in ipairs(gates) do
		elevator(ctx, seg)
	end

	BuildUtil.Stage(ctx, 4) -- Wayfinding Signs
	for _, seg in ipairs(gates) do
		hallSigns(ctx, seg, GATE_INFO[seg.name], L)
	end
	for _, seg in ipairs(corners) do
		rampSign(ctx, seg, rampSide(seg))
	end
end

---------------------------------------------------------------------------------------------
-- FACADE
---------------------------------------------------------------------------------------------

-- Pieces of a segment along x at offset o, leaving out the gate portal / the corner bridge.
local function facadeRuns(seg, o, cuts)
	local half = seg.len(o) / 2
	return runs(-half, half, cuts or {})
end

local function gateCut(seg)
	if GATE_INFO[seg.name] then
		return { { -F.gateHalf, F.gateHalf } }
	end
	return {}
end

local function rampCut(seg)
	if seg.kind ~= "corner" then
		return {}
	end
	local s = rampSide(seg)
	local a, b = s * F.rampOpen[1], s * F.rampOpen[2]
	return { { math.min(a, b), math.max(a, b) } }
end

-- Corner pieces sit a hair lower so overlapping horizontal faces at the joints never z-fight.
local function sink(seg)
	return seg.kind == "corner" and 0.04 or 0
end

-- A poster case on the stone base (x0..x1, at eye level): a team-colour poster with a headline and
-- a line the server keeps up to date (Interact.LiveKinds `live`).
local function posterCase(ctx, seg, x0, x1, headline, live, placeholder, team)
	local case = box(ctx, seg, "PosterCase", x0, x1, 2.2, 10.2, F.out - 0.05, F.out + 0.3, DARK_STEEL, Enum.Material.Metal)
	local gui = canvas(case, OUTWARD, "PosterGui", 24)
	local paper = blob(gui, "Poster", 0.07, 0.04, 0.86, 0.92, team.Primary, nil, 1)
	local color = ink(team.Primary, team)
	words(paper, "Headline", 0.06, 0.06, 0.88, 0.16, headline, color, Enum.Font.GothamBlack, 2)
	blob(paper, "Rule", 0.1, 0.26, 0.8, 0.012, color, nil, 2)
	local line = words(paper, "LiveLine", 0.08, 0.34, 0.84, 0.54, placeholder, color, Enum.Font.GothamBold, 2)
	line.TextWrapped = true
	line:SetAttribute("Live", live)
	return case
end

-- Boards of made-up sponsors on the stone base, between the masts: { name, tagline, colour }.
local SPONSORS = {
	{ "BLITZ COLA", "THE TASTE OF VICTORY", Color3.fromRGB(196, 30, 40) },
	{ "SPIRAL SPORTS DRINK", "STAY IN THE GAME", Color3.fromRGB(30, 110, 200) },
	{ "TOUCHBACK TIRES", "GRIP LIKE A LINEMAN", Color3.fromRGB(36, 36, 42) },
	{ "END ZONE EXPRESS", "WE DELIVER - EVERY DOWN", Color3.fromRGB(110, 60, 170) },
	{ "HAIL MARY HONEY", "SWEET LONG SHOTS", Color3.fromRGB(236, 160, 40) },
	{ "TOUCHDOWN TACOS", "SIX POINTS OF FLAVOR", Color3.fromRGB(40, 140, 80) },
}
local function sponsorBoard(ctx, seg, x, sponsor)
	local color = sponsor[3]
	local board = box(ctx, seg, "SponsorBoard", x - 6, x + 6, 3, 10, F.out - 0.05, F.out + 0.25, color)
	local text = contrast(color, WHITE) >= contrast(color, INK) and WHITE or INK
	local name = write(board, OUTWARD, sponsor[1], text, { Top = 0.14, Height = 0.44 })
	addLine(name, sponsor[2], 0.66, 0.18, Enum.Font.GothamBold)
	-- a thin rule round the edge, like a billboard's frame (drawn on the same SurfaceGui)
	local frame = Instance.new("Frame")
	frame.Name = "BoardFrame"
	frame.BackgroundTransparency = 1
	frame.Position = UDim2.new(0.025, 0, 0.045, 0)
	frame.Size = UDim2.new(0.95, 0, 0.91, 0)
	frame.Parent = name.Parent
	local stroke = Instance.new("UIStroke")
	stroke.Name = "Rule"
	stroke.Color = text
	stroke.Thickness = 2
	stroke.Parent = frame
end

-- A tall banner on the curtain glass beside a gate, between two fins (x0..x1), below the sight line
-- of the outside escalator F3.
local function glassBanner(ctx, seg, x0, x1, color)
	local banner = box(ctx, seg, "GateBanner", x0, x1, 33, 56, F.glassOut + 0.02, F.glassOut + 0.18, color, Enum.Material.Fabric, PAINT)
	return banner, canvas(banner, OUTWARD, "GateBannerGui", 10)
end

-- The player banner (a number and a position over the team's name, between two jersey stripes) and
-- the team's cheer (a headline over a live line) on the glass on both sides of a gate.
local function gateBanners(ctx, seg, gate, team)
	local _, hero = glassBanner(ctx, seg, -39.4, -24.6, team.Primary)
	local color = ink(team.Primary, team)
	for _, y in ipairs({ 0.05, 0.92 }) do
		blob(hero, "JerseyStripe", 0, y, 1, 0.03, team.Secondary, nil, 1)
	end
	words(hero, "Number", 0.08, 0.13, 0.84, 0.46, gate.hero[1], color, Enum.Font.GothamBlack, 2)
	words(hero, "Position", 0.08, 0.6, 0.84, 0.08, gate.hero[2], color, Enum.Font.GothamBold, 2)
	words(hero, "TeamName", 0.08, 0.72, 0.84, 0.13, teamLabel(ctx), color, Enum.Font.GothamBlack, 2):SetAttribute("Live", "team")
	local _, cheer = glassBanner(ctx, seg, 24.6, 39.4, team.Secondary)
	local cheerColor = ink(team.Secondary, team)
	words(cheer, "Headline", 0.08, 0.1, 0.84, 0.16, gate.cheer[1], cheerColor, Enum.Font.GothamBlack, 2)
	blob(cheer, "Rule", 0.15, 0.3, 0.7, 0.012, cheerColor, nil, 1)
	local placeholder = ({ record = "RECORD 0-0", titles = "CHAMPIONSHIPS: 0" })[gate.cheer[2]] or teamLabel(ctx)
	local live = words(cheer, "LiveLine", 0.08, 0.36, 0.84, 0.5, placeholder, cheerColor, Enum.Font.GothamBlack, 2)
	live.TextWrapped = true
	live:SetAttribute("Live", gate.cheer[2])
end

-- Fin positions along a segment.
local function finPositions(seg)
	local list = {}
	if seg.kind == "corner" then
		for _, x in ipairs({ -54, -42, -30, -12, 0, 12, 30, 42, 54 }) do
			table.insert(list, x)
		end
		return list
	end
	local limit = seg.len(F.out) / 2 - 8
	local x = 24
	while x <= limit do
		table.insert(list, -x)
		table.insert(list, x)
		x += 16
	end
	return list
end

function M.facade(ctx)
	local L = ctx.config.Layout
	local team = ctx.colors
	local segs = {}
	for _, name in ipairs(ALL_SEGS) do
		table.insert(segs, segment(L, name))
	end

	-- 1 LOWER FACADE: stone base + cap with the service exits, the cornerstone ---------------------
	BuildUtil.Stage(ctx, 1)
	local base = BuildUtil.Child(ctx, "LowerFacade")
	local sponsorIndex = 0
	for _, seg in ipairs(segs) do
		local k = sink(seg)
		local baseCuts = gateCut(seg)
		if seg.kind ~= "corner" then
			table.insert(baseCuts, { SERVICE.x0, SERVICE.x1 })
		end
		for _, r in ipairs(facadeRuns(seg, F.out, baseCuts)) do
			box(base, seg, "FacadeBase", r[1], r[2], 0, F.baseTop - k, F.baseIn, F.out, STONE, Enum.Material.Limestone)
		end
		for _, r in ipairs(facadeRuns(seg, F.capOut, gateCut(seg))) do
			box(base, seg, "FacadeCap", r[1], r[2], F.baseTop - k, F.capTop - k, F.capIn, F.capOut, STONE_DARK, Enum.Material.Limestone)
		end
		-- a dark granite plinth along the foot of the base (it stops short of the service doors,
		-- whose leaves swing out past it, and leaves out the stretch behind a corner ramp, so the
		-- 2.4-wide gap between the facade and the ramp's base stays as wide)
		local plinthCuts = gateCut(seg)
		if seg.kind ~= "corner" then
			table.insert(plinthCuts, { SERVICE.x0 - 0.4, SERVICE.x1 + 0.4 })
		else
			local s = rampSide(seg)
			table.insert(plinthCuts, { math.min(s * 20, s * 80), math.max(s * 20, s * 80) })
		end
		for _, r in ipairs(facadeRuns(seg, F.out + 0.3, plinthCuts)) do
			box(base, seg, "FacadePlinth", r[1], r[2], 0, 1.6 - k, F.out - 0.1, F.out + 0.3, PLINTH_STONE, Enum.Material.Granite)
		end
		-- sponsor boards between the masts (sides: also on the long bare stretch between the outer
		-- masts and the corner piers; corners: on the side away from the ramp)
		local boards = seg.kind == "side" and { -175, -120, 120, 175 } or seg.kind == "end" and { -100, 100 } or { -44 * rampSide(seg) }
		for _, x in ipairs(boards) do
			sponsorIndex += 1
			sponsorBoard(base, seg, x, SPONSORS[(sponsorIndex - 1) % #SPONSORS + 1])
		end
		if GATE_INFO[seg.name] then
			-- poster cases beside the gate: the season so far and the next game day
			local season = posterCase(base, seg, -24.8, -20.4, "THIS SEASON", "season", "SEASON 1 - WEEK 1/8", team)
			posterCase(base, seg, 20.4, 24.8, "GAME DAY", "gameday", "NEXT GAME SOON", team)
			BuildUtil.Look(
				season,
				"Season Poster",
				"Every game day is one week of the season. Win five of the eight games and you're in the playoffs!",
				{ LookKey = "record", At = Vector3.new(0, -2.2, -0.8), Distance = 9 }
			)
		end
		if seg.kind ~= "corner" then
			-- the service exit: a double door (its leaves swing out onto the plaza) under a lintel
			-- with a lit EXIT sign facing the event level
			local s = SERVICE
			local lintel = box(base, seg, "ServiceLintel", s.x0, s.x1, s.top, F.baseTop, F.baseIn, F.out, STONE, Enum.Material.Limestone)
			write(lintel, INWARD, "EXIT", SCANNER_GREEN, { Glow = true, PPS = SIGN_PPS, Name = "ExitSign" })
			-- (and the plaza side says what the door is, above its canopy)
			write(lintel, OUTWARD, "SERVICE DOOR", INK, { Top = 0.3, Height = 0.36, Name = "ServiceSign" })
			BuildUtil.Light(
				lintel,
				"PointLight",
				{ Name = "ExitLight", Range = 18, Brightness = 1, Color = SCANNER_GREEN, Shadows = false }
			)
			-- a steel canopy with a lamp over the door
			local canopy = box(
				base,
				seg,
				"ServiceCanopy",
				s.x0 - 1.2,
				s.x1 + 1.2,
				s.top + 0.6,
				s.top + 1,
				F.out,
				F.out + 2.4,
				DARK_STEEL,
				Enum.Material.Metal
			)
			BuildUtil.Light(
				canopy,
				"PointLight",
				{ Name = "ServiceLamp", Range = 10, Brightness = 0.8, Color = LIGHT_NEUTRAL, Shadows = false }
			)
			local doorH = s.top - 0.2
			BuildUtil.Door(base, {
				Name = "ServiceExit",
				Size = Vector3.new(s.x1 - s.x0, doorH, 0.6),
				CFrame = at(seg, (s.x0 + s.x1) / 2, 0.1 + doorH / 2, (F.baseIn + F.out) / 2),
				Double = true,
				Color = DARK_STEEL,
				Material = Enum.Material.Metal,
				Object = "Service Exit",
				Title = "Service Exit",
				Info = "A staff door between the event level under the stands and the plaza outside.",
			})
		end
	end
	local front = segment(L, "visitor")
	local stone = box(base, front, "Cornerstone", 26, 32, 3, 7, F.out, F.out + 0.25, STONE_DARK, Enum.Material.Marble)
	local cs = write(stone, OUTWARD, "CORNERSTONE", INK, { Top = 0.1, Height = 0.3, Font = Enum.Font.Garamond })
	addLine(cs, "BUILT BY THE OWNER - ONE STEP AT A TIME", 0.5, 0.3, Enum.Font.Garamond)
	BuildUtil.Look(stone, "Cornerstone", "Every stadium has a cornerstone with the name of the person who built it. This one is yours!", {
		LookKey = "owner",
		Distance = 9,
	})

	-- 2 GLASS CURTAIN WALLS + spandrel bands at the concourse levels -----------------------------
	BuildUtil.Stage(ctx, 2)
	local glass = BuildUtil.Child(ctx, "CurtainWalls")
	for _, seg in ipairs(segs) do
		local k = sink(seg)
		local half = seg.len(F.glassOut) / 2
		local cuts = gateCut(seg)
		for _, c in ipairs(rampCut(seg)) do
			table.insert(cuts, c)
		end
		for _, r in ipairs(runs(-half, half, cuts)) do
			box(
				glass,
				seg,
				"CurtainGlass",
				r[1],
				r[2],
				F.capTop - k,
				F.glassTop - k,
				F.glassIn,
				F.glassOut,
				CURTAIN,
				Enum.Material.Glass,
				{ Transparency = 0.35 }
			)
		end
		for _, c in ipairs(gateCut(seg)) do
			box(
				glass,
				seg,
				"CurtainGlass",
				c[1],
				c[2],
				F.gateGlassBottom,
				F.glassTop,
				F.glassIn,
				F.glassOut,
				CURTAIN,
				Enum.Material.Glass,
				{ Transparency = 0.35 }
			)
		end
		for _, c in ipairs(rampCut(seg)) do
			box(
				glass,
				seg,
				"CurtainGlass",
				c[1],
				c[2],
				F.capTop - k,
				F.rampOpenY[1],
				F.glassIn,
				F.glassOut,
				CURTAIN,
				Enum.Material.Glass,
				{ Transparency = 0.35 }
			)
			box(
				glass,
				seg,
				"CurtainGlass",
				c[1],
				c[2],
				F.rampOpenY[2],
				F.glassTop - k,
				F.glassIn,
				F.glassOut,
				CURTAIN,
				Enum.Material.Glass,
				{ Transparency = 0.35 }
			)
		end
		-- spandrels: main concourse level (cut at the gate + bridge) and upper concourse level
		local sHalf = seg.len(F.spanOut) / 2
		local lowCuts = gateCut(seg)
		for _, c in ipairs(rampCut(seg)) do
			table.insert(lowCuts, c)
		end
		for _, r in ipairs(runs(-sHalf, sHalf, lowCuts)) do
			box(glass, seg, "Spandrel", r[1], r[2], 29.4 - k, 31.4 - k, F.glassOut, F.spanOut, STEEL, Enum.Material.Metal)
		end
		box(glass, seg, "Spandrel", -sHalf, sHalf, 72.8 - k, 74.8 - k, F.glassOut, F.spanOut, STEEL, Enum.Material.Metal)
	end

	-- 3 UPPER FACADE & FINS: the team-colour band, the cornice roof, piers + fins, the giant name ------------
	BuildUtil.Stage(ctx, 3)
	local upper = BuildUtil.Child(ctx, "UpperFacade")
	for _, seg in ipairs(segs) do
		local k = sink(seg)
		local half = seg.len(F.bandOut) / 2
		box(upper, seg, "UpperBand", -half, half, F.glassTop - k, F.bandTop - k, F.bandIn, F.bandOut, team.Primary, Enum.Material.Metal)
		local roofHalf = seg.len(F.roofOut) / 2
		box(upper, seg, "FacadeRoof", -roofHalf, roofHalf, F.bandTop - k, F.top - k, F.roofIn, F.roofOut, STEEL, Enum.Material.Metal)
		local finBottom = F.capTop
		for _, x in ipairs(finPositions(seg)) do
			local bottom = finBottom
			if GATE_INFO[seg.name] and math.abs(x) < F.gateHalf + 2 then
				bottom = F.gateGlassBottom
			end
			box(upper, seg, "FacadeFin", x - F.finT / 2, x + F.finT / 2, bottom, F.finTop, F.bandOut, F.finOut, STEEL, Enum.Material.Metal)
		end
		if seg.kind ~= "corner" then
			-- piers on both joints (rotated half way to the corner)
			for _, e in ipairs({ -1, 1 }) do
				local pierHalf = seg.len(159) / 2
				BuildUtil.Part(upper, {
					Name = "FacadePier",
					Size = Vector3.new(3.6, F.top + 0.6, 4.6),
					CFrame = at(seg, e * pierHalf, (F.top + 0.6) / 2, 159) * CFrame.Angles(0, -e * math.rad(22.5), 0),
					Color = STONE_DARK,
					Material = Enum.Material.Limestone,
				})
			end
		end
		local gate = GATE_INFO[seg.name]
		if gate then
			-- the gate pylons rise as stone towers to the cornice (in front of the glass line, so the
			-- escalator landings in the band behind them stay clear)
			for _, s in ipairs({ -1, 1 }) do
				box(
					upper,
					seg,
					"GateTower",
					s * PORTAL_HALF,
					s * PYLON_OUT,
					PYLON_TOP,
					F.bandTop,
					F.glassOut,
					PYLON_FRONT,
					STONE,
					Enum.Material.Granite
				)
			end
			local big = gate.letter == "A"
			local w = big and 58 or 36
			local sign = box(
				upper,
				seg,
				"TeamNameSign",
				-w,
				w,
				big and 88 or 90,
				big and 106 or 104,
				F.finOut, -- (mounted on the fins' front edges)
				PYLON_FRONT + 1.2,
				SIGN_DARK,
				Enum.Material.Metal
			)
			liveTeam(ctx, sign, OUTWARD, ink(SIGN_DARK, team), SIGN_DARK, { PPS = big and 8 or 10, PadY = 0.08 })
			BuildUtil.Light(sign, "PointLight", { Name = "SignLight", Range = 30, Brightness = 1.2, Color = LIGHT_WARM, Shadows = false })
		end
	end

	-- 4 BANNERS & NIGHT LIGHTS -------------------------------------------------------------------
	BuildUtil.Stage(ctx, 4)
	local lights = BuildUtil.Child(ctx, "NightLights")
	local slogans = { "GAME DAY", "DEFENSE!", "HOME OF CHAMPIONS", "LOUD & PROUD", "BELIEVE", "ALL IN" }
	local sloganIndex = 0
	for _, seg in ipairs(segs) do
		local k = sink(seg)
		-- LED strip under the cornice
		local half = seg.len(160.9) / 2
		local top =
			box(lights, seg, "FacadeLED", -half, half, 109.2 - k, 109.8 - k, 160.4, 160.9, team.Secondary, Enum.Material.Neon, PAINT)
		lightsAlong(
			top,
			seg.kind == "corner" and 2 or 4,
			{ Name = "FacadeGlow", Range = 40, Brightness = 1.4, Color = team.Secondary, Shadows = false },
			-1
		)
		-- LED strip on the base cap (cut at the gates)
		for _, r in ipairs(facadeRuns(seg, 160.7, gateCut(seg))) do
			local strip = box(
				lights,
				seg,
				"FacadeLED",
				r[1],
				r[2],
				14.2 - k,
				14.8 - k,
				F.capOut,
				F.capOut + 0.3,
				team.Primary,
				Enum.Material.Neon,
				PAINT
			)
			local n = math.max(1, math.floor((r[2] - r[1]) / 70 + 0.5))
			lightsAlong(strip, n, { Name = "UpLight", Range = 32, Brightness = 1.3, Color = LIGHT_COOL, Shadows = false }, 4, -1)
		end
		-- banners between the fins
		local spots
		if seg.kind == "side" then
			spots = { -128, -64, 64, 128 }
		elseif seg.kind == "end" then
			spots = { -64, 64 }
		else
			spots = { -21 * rampSide(seg) } -- (between the fins at 12 and 30)
		end
		for _, x in ipairs(spots) do
			sloganIndex += 1
			local color = sloganIndex % 2 == 0 and team.Secondary or team.Primary
			local banner = box(
				lights,
				seg,
				"FacadeBanner",
				x - 5.5,
				x + 5.5,
				88,
				106,
				F.bandOut + 0.05,
				F.bandOut + 0.25,
				color,
				Enum.Material.Fabric,
				PAINT
			)
			if sloganIndex % 2 == 1 then
				liveTeam(ctx, banner, OUTWARD, ink(color, team), color, { PPS = 10, PadY = 0.38 })
			else
				write(
					banner,
					OUTWARD,
					slogans[(sloganIndex / 2 - 1) % #slogans + 1],
					ink(color, team),
					{ Top = 0.36, Height = 0.28, PPS = 10 }
				)
			end
		end
		-- the player banner and the team's cheer on the glass beside every gate, and an LED ribbon up
		-- the front of each gate tower (stopping under the team-name sign)
		local gate = GATE_INFO[seg.name]
		if gate then
			gateBanners(lights, seg, gate, team)
			local ribbonTop = gate.letter == "A" and 87 or 89
			for _, s in ipairs({ -1, 1 }) do
				box(
					lights,
					seg,
					"TowerLED",
					s * 15.6,
					s * 16.4,
					PYLON_TOP + 1,
					ribbonTop,
					PYLON_FRONT,
					PYLON_FRONT + 0.12,
					ledColor(team),
					Enum.Material.Neon,
					PAINT
				)
			end
		end
	end
end

return M
