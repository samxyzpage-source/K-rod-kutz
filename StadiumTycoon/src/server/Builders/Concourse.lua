--[[
	Concourse
	The two walk-in concourse rings of the V5 bowl (docs/V5-LAYOUT.md). Both follow the bowl's
	octagon (Bowl.Segments: 2 sidelines, 2 ends, 4 corners) and are built in plot (stadium-area)
	coordinates. "Offset" = distance outward from the turf edge, as everywhere in the bowl.

	  main_concourse   offsets 56..84, floor y 30 (flush with the lower bowl's top row), ceiling ~41.3
	    1 Concourse Floor & Columns  the floor slab, lane-edge stripes, a painted "WELCOME TO ..." logo
	                                 inside each gate and a column on every aisle line at offsets
	                                 80.6..83.2 (down to the ground where nothing is underneath: not over
	                                 the locker rooms, not beside the end gates)
	    2 Walls & Ceiling            the outer wall (offset 83..84.1) with 16-wide openings on the four
	                                 gate axes (escalator landings, Exterior.lua) + lit GATE signs (look),
	                                 a team band outside, the ceiling over the whole ring
	    3 Section Portals            the inner wall (offset 56..57, team colour) with a 7 x 9 portal onto
	                                 the lower bowl's top row at every aisle (Bowl.Aisles), each a short
	                                 tunnel mouth (deep jambs to offset 60.5) under a lit section sign
	                                 naming the two sections either side of its aisle ("SECTIONS
	                                 103-104", numbered like Stands.lua's plaques; look card says where)
	    4 Lights & TV Screens        neon light strips with PointLights, a TV on every column (live
	                                 score / game day / summary, 4 with a look card), team banners on the
	                                 inner wall and overhead wayfinding signs above the walking lane (each
	                                 face lists the sections + gate ahead of its readers)
	  upper_concourse  offsets 116..152, floor y 74, flat ceiling ~85.2 (under the upper rows 10-18)
	    1 Concourse Floor            slab, ceiling with light strips, inner wall (team colour) with 8-wide
	                                 vomitory openings, outer wall (151..152) with gate openings and two
	                                 rings of columns down to the ground (offsets ~118 and ~150)
	    2 Vomitories                 portal frames + lit "SECTIONS 3xx" signs (look) where the upper
	                                 deck's vomitory tunnels arrive (+-52 on the sides, the middle of
	                                 each end) and "ESCALATORS / STAIRS / ELEVATOR" signs (look) over the
	                                 four gate openings
	    3 Food Stands                6 stands on the outer side (hot dogs, kettle corn, sodas, sports
	                                 drinks): an alcove with a queue divider, counter (use), lit menu
	                                 board (look) and gear (grill, popcorn machine, soda fountain...)
	    4 Restrooms & Signs          2 restroom blocks (women + men, swinging doors, stalls, sinks,
	                                 mirror + hand dryer to look at), overhead wayfinding signs, 6 live
	                                 screens on the inner wall, drink rails with bar stools under the 4
	                                 sideline screens (one per rail is a "CONCOURSE TV" camera seat)
	                                 Painted slogans on the corner walls come with step 1.

	Walking lanes (kept clear, the harness checks them): main offsets 66..76 (y 30.8..39), upper
	128..138 (y 74.8..83). Everything collidable sits outside them; overhead signs and light strips
	are non-collidable and hang well above head height. The main concourse's outer side (76..84)
	stays free between the columns for ConcourseShops.lua; on the sidelines nothing of this module
	goes below y = 29 at |x| < 84 (the locker rooms are underneath).

	Flat layers: main floor top 30, lane stripes 30.05 (corners 30.09), gate logo border 30.06 + logo
	30.08 (between the stripes); upper floor top 74, restroom tiles 74.05. Ceiling blocks of the
	corners sit 0.05 lower than the straights' (they overlap).
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)
local Bowl = require(script.Parent.Parent.Bowl)

local Concourse = {}

-- Segment frames (Bowl): local +Z points toward the field, local -Z outward, local +X along the
-- ring (the loop below always runs toward +X).
local INWARD = Enum.NormalId.Back -- the face that looks toward the field
local OUTWARD = Enum.NormalId.Front -- the face that looks away from the field
local LOOP = { "home", "corner_hw", "west", "corner_vw", "visitor", "corner_ve", "east", "corner_he" }
local GATES = { visitor = "A", west = "B", east = "C", home = "D" }

local PAINT = { CanCollide = false, CastShadow = false }
local NO_COLLIDE = { CanCollide = false }

local WHITE = Color3.fromRGB(248, 248, 248)
local INK = Color3.fromRGB(22, 22, 26)
local FLOOR = Color3.fromRGB(186, 182, 174)
local CEILING = Color3.fromRGB(238, 238, 234)
local WALL = Color3.fromRGB(228, 226, 220)
local CONCRETE = Color3.fromRGB(170, 170, 174)
local SIGN_DARK = Color3.fromRGB(20, 24, 34)
local SCREEN = Color3.fromRGB(12, 14, 20)
local SCREEN_TEXT = Color3.fromRGB(255, 226, 120)
local MENU_TEXT = Color3.fromRGB(255, 236, 170)
local NEON = Color3.fromRGB(255, 249, 232)
local LIGHT_COLOR = Color3.fromRGB(255, 244, 222)
local STEEL = Color3.fromRGB(200, 204, 210)
local DARK_METAL = Color3.fromRGB(58, 60, 66)
local STAND_DARK = Color3.fromRGB(44, 46, 54)
local TILE = Color3.fromRGB(206, 218, 226)
local TILE_WALL = Color3.fromRGB(222, 232, 238)
local PORCELAIN = Color3.fromRGB(244, 244, 246)
local MIRROR = Color3.fromRGB(196, 214, 228)
local POPCORN = Color3.fromRGB(255, 224, 120)
local POPCORN_RED = Color3.fromRGB(196, 36, 40)
local COOLER_ORANGE = Color3.fromRGB(245, 130, 32)
local GLOW_ORANGE = Color3.fromRGB(255, 120, 40)

local COLUMN = 2.6 -- square columns

-- Main concourse (offsets from Config.Layout.Bowl.MainConcourse: 56..84, floor 30, ceiling 42)
local MAIN_SLAB = 1 -- slab thickness (bottom 29: the locker rooms below reach y 29)
local MAIN_OUTER_WALL_IN = 83 -- the outer wall runs 83..84.1 (it covers the slab edge)
local MAIN_OUTER_WALL_OUT = 84.1
local MAIN_COLUMN_IN = 80.6 -- columns 80.6..83.2 (outside the lane, against the outer wall)
local MAIN_PORTAL_HALF = 3.5 -- 7 wide
local MAIN_PORTAL_HEIGHT = 9
local MAIN_PORTAL_DEPTH = 3.5 -- the tunnel mouth sticks out this far into the concourse
local MAIN_GATE_HALF = 8 -- 16 wide
local MAIN_GATE_HEIGHT = 8.8
local MAIN_TV_KINDS = { "score", "gameday", "summary" }

-- Upper concourse (Config.Layout.Bowl.UpperConcourse: 116..152, floor 74, ceiling 86)
local UPPER_INNER_WALL = 1 -- inner wall 116..117
local UPPER_OUTER_WALL_IN = 151 -- outer wall 151..152 (the facade is 152..160)
local UPPER_VOM_HEIGHT = 9
local UPPER_GATE_HALF = 8
local UPPER_GATE_HEIGHT = 9
local UPPER_COLUMNS = {
	side = { -130, -78, 78, 130 },
	["end"] = { -104, -44, 44, 104 },
	corner = { 0 },
}
local UPPER_STAND_FRONT = 139.4 -- stands + restrooms start here (the lane ends at 138)

local SECTION_FACTS = {
	"These seats are so close you can hear the quarterback call the play!",
	"Fans down here make the most noise on third down. Get LOUD!",
	"Keep your eyes open: footballs kicked into the stands are souvenirs!",
	"Row 1 is right behind the field wall. High-five the players!",
}

--[[
	Lower-bowl section numbers, exactly as Stands.lua numbers its section plaques: round the bowl
	like a clock from the west end of the visitor side (101-107), the visitor/east corner (108), the
	east end (109-111), ... Every block between two aisle lines of a straight (sides +-26 / +-78 /
	+-130, ends +-26) is one section, every corner is one section. A portal stands on an aisle line,
	so it leads to the two sections either side of it.
]]
local LOWER_SECTION_BASE = {
	visitor = 101,
	corner_ve = 108,
	east = 109,
	corner_he = 112,
	home = 113,
	corner_hw = 120,
	west = 121,
	corner_vw = 124,
}

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

-- The team's second colour for signs on the Primary walls (Trim if Secondary doesn't stand out).
local function accent(team)
	if contrast(team.Secondary, team.Primary) >= 3 or contrast(team.Secondary, team.Primary) >= contrast(team.Trim, team.Primary) then
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
	score = "HOME 0 - 0 VISITORS",
	gameday = "NEXT GAME SOON",
	summary = "TEAM\nSCORE\nRECORD\nSEASON",
	record = "RECORD 0-0",
	season = "SEASON 1",
	rating = "TEAM RATING",
}

-- PointLights spread along a long part (on attachments), `count` of them along its local X.
local function lightsAlong(part, count, props)
	local length = part.Size.X
	for index = 1, count do
		local attachment = Instance.new("Attachment")
		attachment.Name = "LightAt"
		attachment.Position = Vector3.new((index - 0.5) * length / count - length / 2, -0.4, 0)
		attachment.Parent = part
		BuildUtil.Light(attachment, "PointLight", props)
	end
end

---------------------------------------------------------------------------------------------
-- Ring geometry (segment-local: x along the segment, o = offset outward, y = height)
---------------------------------------------------------------------------------------------

-- The 8 segments (Bowl.Segments) in ring order, each with its frame at offset 0 and a function
-- giving its length at any offset.
local function ringSegments(L)
	local byName = {}
	for _, s in ipairs(Bowl.Segments(L, 0, 0)) do
		byName[s.name] = s
	end
	local list = {}
	for _, name in ipairs(LOOP) do
		local s = byName[name]
		table.insert(list, {
			name = name,
			kind = s.kind,
			straight = s.kind ~= "corner",
			base = s.cframe, -- the segment's frame at offset 0
			gate = GATES[name],
			len = function(o)
				return Bowl.Segment(L, name, o, o).midLength
			end,
		})
	end
	return list
end

local function at(seg, x, y, o)
	return seg.base * CFrame.new(x, y, -o)
end

-- Block from x0..x1 along the segment, offsets o0..o1, heights y0..y1.
local function span(ctx, seg, name, x0, x1, o0, o1, y0, y1, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Size = Vector3.new(x1 - x0, y1 - y0, o1 - o0)
	props.CFrame = at(seg, (x0 + x1) / 2, (y0 + y1) / 2, (o0 + o1) / 2)
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Part(ctx, props)
end

--[[
	The exact trapezoid of a segment's band o0..o1 (a slab y0..y1): a block as long as the band's
	inner edge plus two flat wedges that fill the 22.5-degree joints, so neighbouring segments meet
	without gaps or overlaps (floors you can see from above).
]]
local function bandExact(ctx, seg, name, o0, o1, y0, y1, color, material, extra)
	local li, lo = seg.len(o0), seg.len(o1)
	local parts = { span(ctx, seg, name, -li / 2, li / 2, o0, o1, y0, y1, color, material, extra) }
	local w = (lo - li) / 2
	if w > 0.05 then
		local depth, thick, yc = o1 - o0, y1 - y0, (y0 + y1) / 2
		for _, s in ipairs({ -1, 1 }) do
			local props = extra and table.clone(extra) or {}
			props.Name = name .. "Joint"
			-- right angle at the outer edge of the block's end; legs along the ring and inward
			props.Size = Vector3.new(thick, w, depth)
			props.CFrame = seg.base
				* CFrame.fromMatrix(
					Vector3.new(s * (li + w) / 2, yc, -(o0 + o1) / 2),
					Vector3.new(0, s, 0),
					Vector3.new(s, 0, 0),
					Vector3.new(0, 0, -1)
				)
			props.Color = color
			props.Material = material or Enum.Material.SmoothPlastic
			table.insert(parts, BuildUtil.Wedge(ctx, props))
		end
	end
	return parts
end

-- One block per segment, as long as the band's outer edge (it overlaps its neighbours near the
-- inner edge; corners sit 0.05 lower so the overlaps never z-fight). For ceilings.
local function bandBlock(ctx, seg, name, o0, o1, y0, y1, color, material, extra)
	local drop = seg.straight and 0 or 0.05
	local half = seg.len(o1) / 2
	return span(ctx, seg, name, -half, half, o0, o1, y0 - drop, y1 - drop, color, material, extra)
end

--[[
	A wall along the whole segment (offsets o0..o1, y0..y1) with openings
	{ x = centre, half = half width, top = head height } and a lintel above each opening.
	Returns the wall pieces and the lintels.
]]
local function wallRun(ctx, seg, name, o0, o1, y0, y1, openings, color, material)
	local half = seg.len(o1) / 2 -- the outer length closes the corners
	table.sort(openings, function(a, b)
		return a.x < b.x
	end)
	local pieces, lintels = {}, {}
	local cursor = -half
	for _, opening in ipairs(openings) do
		local a, b = opening.x - opening.half, opening.x + opening.half
		if a - cursor > 0.05 then
			table.insert(pieces, span(ctx, seg, name, cursor, a, o0, o1, y0, y1, color, material))
		end
		if not opening.noLintel and opening.top < y1 - 0.05 then
			table.insert(lintels, span(ctx, seg, name .. "Lintel", a, b, o0, o1, opening.top, y1, color, material))
		end
		cursor = b
	end
	if half - cursor > 0.05 then
		table.insert(pieces, span(ctx, seg, name, cursor, half, o0, o1, y0, y1, color, material))
	end
	return pieces, lintels
end

--[[
	A non-collidable overhead sign hanging from the ceiling across a walking lane (faces along
	the ring). People walking toward +x read its Left face (`text`), people walking toward -x its
	Right face (`backText`, default the same).
]]
local function overheadSign(ctx, seg, x, o0, o1, y0, y1, text, background, team, backText)
	local sign = span(ctx, seg, "OverheadSign", x - 0.2, x + 0.2, o0, o1, y0, y1, background, nil, NO_COLLIDE)
	local color = ink(background, team)
	write(sign, Enum.NormalId.Left, text, color, { Glow = true, Top = 0.12, Height = 0.76 })
	write(sign, Enum.NormalId.Right, backText or text, color, { Glow = true, Top = 0.12, Height = 0.76 })
	return sign
end

---------------------------------------------------------------------------------------------
-- Lower-bowl sections (the numbers on Stands.lua's plaques)
---------------------------------------------------------------------------------------------

-- The aisle lines that split a straight segment into sections (see LOWER_SECTION_BASE).
local function lowerBounds(L, kind)
	local B = L.Bowl
	local list = {}
	if kind == "side" then
		for j = 0, 2 do
			local a = B.AisleFirst + j * B.AisleSpacing
			table.insert(list, -a)
			table.insert(list, a)
		end
	elseif kind == "end" then
		list = { -B.AisleFirst, B.AisleFirst }
	end
	return list
end

-- The lower-bowl section at segment x = a.
local function lowerSection(L, seg, a)
	local number = LOWER_SECTION_BASE[seg.name]
	for _, bound in ipairs(lowerBounds(L, seg.kind)) do
		if a > bound then
			number += 1
		end
	end
	return number
end

-- "SECTIONS 103-104", or "SECTION 109" when first == last.
local function sectionsText(first, last)
	if first == last then
		return "SECTION " .. first
	end
	return ("SECTIONS %d-%d"):format(first, last)
end

-- Where a portal at segment x is, for its description card.
local function portalWhere(L, seg, x)
	local p = seg.base * CFrame.new(x, 0, 0)
	if seg.kind == "side" then
		local side = seg.name == "home" and "Home side" or "Visitor side"
		local px = math.abs(p.X)
		if px <= L.GoalLineX then
			return ("%s, %d-yard line"):format(side, 50 - math.floor(px / L.Yard / 5 + 0.5) * 5)
		end
		return ("%s, next to the %s end zone"):format(side, p.X < 0 and "west" or "east")
	elseif seg.kind == "end" then
		return ("Behind the %s end zone"):format(seg.name)
	end
	return ("Corner seats between the %s side and the %s end zone"):format(
		(seg.name == "corner_vw" or seg.name == "corner_ve") and "visitor" or "home",
		(seg.name == "corner_vw" or seg.name == "corner_hw") and "west" or "east"
	)
end

---------------------------------------------------------------------------------------------
-- MAIN CONCOURSE
---------------------------------------------------------------------------------------------

-- Columns reach the ground only where nothing else lives underneath: never over the locker
-- rooms (sidelines, |x| < 84) or right beside an end gate's entry hall.
local function mainColumnReachesGround(seg, x)
	if seg.kind == "side" then
		return math.abs(x) >= 84
	elseif seg.kind == "end" then
		return math.abs(x) >= 30
	end
	return true
end

function Concourse.main_concourse(ctx)
	local L = ctx.config.Layout
	local MC = L.Bowl.MainConcourse
	local team = ctx.colors
	local segs = ringSegments(L)
	local floorY = MC.Floor
	local ceilBottom, ceilTop = MC.Ceiling - 0.7, MC.Ceiling - 0.1 -- 41.3 .. 41.9
	local laneIn, laneOut = MC.Inner + 10, MC.Inner + 20 -- 66..76 (the harness lane)
	local lowerTop = Bowl.Row(L, "lower", L.Bowl.Tiers.lower.Rows)
	local wallColor = team.Primary
	local trim = accent(team)

	-- portals on the lower bowl's top-row aisles (each leads to the sections either side of it)
	for _, seg in ipairs(segs) do
		seg.portals = Bowl.Aisles(L, seg.kind, seg.len(lowerTop.inner))
	end

	-- 1 CONCOURSE FLOOR & COLUMNS ----------------------------------------------------------
	BuildUtil.Stage(ctx, 1)
	for _, seg in ipairs(segs) do
		bandExact(ctx, seg, "ConcourseFloor", MC.Inner, MC.Outer, floorY - MAIN_SLAB, floorY, FLOOR)
		-- team stripes along both edges of the walking lane
		local stripeTop = floorY + (seg.straight and 0.05 or 0.09)
		for _, o in ipairs({ laneIn + 0.6, laneOut - 0.6 }) do
			local half = seg.len(o) / 2
			span(ctx, seg, "LaneStripe", -half, half, o - 0.25, o + 0.25, floorY, stripeTop, team.Primary, nil, PAINT)
		end
		if seg.gate then
			-- a painted welcome logo on the floor inside each gate, between the lane stripes (it
			-- reads upright for fans walking in from the gate: the part's +Z faces the gate)
			local mid = (laneIn + laneOut) / 2
			span(ctx, seg, "GateFloorBorder", -7.5, 7.5, laneIn + 1, laneOut - 1, floorY, floorY + 0.06, trim, nil, PAINT)
			local logo = BuildUtil.Part(ctx, {
				Name = "GateFloorLogo",
				Size = Vector3.new(14, 0.08, (laneOut - laneIn) - 3),
				CFrame = at(seg, 0, floorY + 0.04, mid) * CFrame.Angles(0, math.pi, 0),
				Color = wallColor,
				CanCollide = false,
				CastShadow = false,
			})
			local welcome = write(logo, Enum.NormalId.Top, "WELCOME TO", ink(wallColor, team), {
				Top = 0.1,
				Height = 0.3,
				Font = Enum.Font.GothamBold,
			})
			addLine(welcome, teamLabel(ctx) .. " FOOTBALL", 0.42, 0.46, Enum.Font.GothamBlack)
		end
		for _, x in ipairs(seg.portals) do
			local bottom = mainColumnReachesGround(seg, x) and 0 or floorY
			span(
				ctx,
				seg,
				"ConcourseColumn",
				x - COLUMN / 2,
				x + COLUMN / 2,
				MAIN_COLUMN_IN,
				MAIN_COLUMN_IN + COLUMN,
				bottom,
				ceilBottom,
				CONCRETE,
				Enum.Material.Concrete
			)
		end
	end

	-- 2 WALLS & CEILING ---------------------------------------------------------------------
	BuildUtil.Stage(ctx, 2)
	for _, seg in ipairs(segs) do
		local openings = {}
		if seg.gate then
			table.insert(openings, { x = 0, half = MAIN_GATE_HALF, top = floorY + MAIN_GATE_HEIGHT })
		end
		wallRun(ctx, seg, "ConcourseOuterWall", MAIN_OUTER_WALL_IN, MAIN_OUTER_WALL_OUT, floorY - MAIN_SLAB, MC.Ceiling, openings, WALL)
		-- team band around the outside, above the gate openings
		local bandHalf = seg.len(MAIN_OUTER_WALL_OUT + 0.15) / 2
		span(
			ctx,
			seg,
			"ConcourseBand",
			-bandHalf,
			bandHalf,
			MAIN_OUTER_WALL_OUT,
			MAIN_OUTER_WALL_OUT + 0.15,
			floorY + 10,
			floorY + 11.6,
			team.Primary,
			nil,
			PAINT
		)
		bandBlock(ctx, seg, "ConcourseCeiling", MC.Inner, MAIN_OUTER_WALL_IN, ceilBottom, ceilTop, CEILING)

		if seg.gate then
			-- lit gate sign over the opening (inside) + team-colour jambs
			local headTop = floorY + MAIN_GATE_HEIGHT
			local sign = span(
				ctx,
				seg,
				"GateSign",
				-MAIN_GATE_HALF - 1,
				MAIN_GATE_HALF + 1,
				MAIN_OUTER_WALL_IN - 0.3,
				MAIN_OUTER_WALL_IN,
				headTop + 0.1,
				ceilBottom - 0.1,
				SIGN_DARK
			)
			write(sign, INWARD, "GATE " .. seg.gate .. "   |   EXIT & ESCALATORS", ink(SIGN_DARK, team), { Glow = true })
			local gateInfo = {
				A = "The main gate! Escalators here run down to the entry hall and out to the plaza.",
				B = "The west gate. Ride the escalators down to street level - or up to the upper deck.",
				C = "The east gate, closest to the fan zone tailgate. Escalators down to the street.",
				D = "The players' gate at the back, toward the team campus and your HQ.",
			}
			BuildUtil.Look(sign, "Gate " .. seg.gate, gateInfo[seg.gate], {
				At = Vector3.new(0, floorY + 4.5 - (headTop + ceilBottom) / 2, 1.2),
			})
			for _, s in ipairs({ -1, 1 }) do
				local x0 = s * MAIN_GATE_HALF
				span(
					ctx,
					seg,
					"GateTrim",
					math.min(x0, x0 + s * 0.9),
					math.max(x0, x0 + s * 0.9),
					MAIN_OUTER_WALL_IN - 0.4,
					MAIN_OUTER_WALL_IN,
					floorY,
					headTop,
					trim,
					nil,
					PAINT
				)
			end
		end
	end

	-- 3 SECTION PORTALS ---------------------------------------------------------------------
	BuildUtil.Stage(ctx, 3)
	local factIndex = 0
	for _, seg in ipairs(segs) do
		local openings = {}
		for _, x in ipairs(seg.portals) do
			table.insert(openings, { x = x, half = MAIN_PORTAL_HALF, top = floorY + MAIN_PORTAL_HEIGHT, noLintel = true })
		end
		wallRun(ctx, seg, "PortalWall", MC.Inner, MC.Inner + 1, floorY, ceilBottom, openings, wallColor)
		for _, x in ipairs(seg.portals) do
			local left, right = lowerSection(L, seg, x - 0.5), lowerSection(L, seg, x + 0.5)
			local headY0 = floorY + MAIN_PORTAL_HEIGHT
			-- a short tunnel mouth: two deep jambs and a deep header that is the section sign
			-- (it also sticks out a little on the bowl side)
			local mouth = MC.Inner + 1 + MAIN_PORTAL_DEPTH
			local sign = span(
				ctx,
				seg,
				"SectionSign",
				x - MAIN_PORTAL_HALF - 0.9,
				x + MAIN_PORTAL_HALF + 0.9,
				MC.Inner - 0.1,
				mouth,
				headY0,
				ceilBottom,
				trim
			)
			local signInk = ink(trim, team)
			local title = write(sign, OUTWARD, sectionsText(left, right), signInk, { Glow = true, Top = 0.08, Height = 0.6 })
			addLine(title, "ROWS 1-14", 0.66, 0.28, Enum.Font.GothamBold)
			write(sign, INWARD, left == right and tostring(left) or (left .. "  |  " .. right), signInk, { Glow = true })
			factIndex += 1
			local cardTitle = left == right and ("Section " .. left) or ("Sections %d & %d"):format(left, right)
			local cardInfo = portalWhere(L, seg, x) .. ", lower bowl. " .. SECTION_FACTS[(factIndex - 1) % #SECTION_FACTS + 1]
			BuildUtil.Look(sign, cardTitle, cardInfo, {
				At = Vector3.new(0, floorY + 4.5 - (headY0 + ceilBottom) / 2, -((mouth - MC.Inner + 0.1) / 2 + 1)),
			})
			-- jambs start at the wall's concourse face (no coplanar faces with the opening)
			for _, s in ipairs({ -1, 1 }) do
				local x0 = x + s * MAIN_PORTAL_HALF
				span(
					ctx,
					seg,
					"PortalJamb",
					math.min(x0, x0 + s * 0.9),
					math.max(x0, x0 + s * 0.9),
					MC.Inner + 1,
					mouth,
					floorY,
					headY0,
					trim
				)
			end
		end
	end

	-- 4 LIGHTS & TV SCREENS -----------------------------------------------------------------
	BuildUtil.Stage(ctx, 4)
	local light = { Range = 34, Brightness = 1.3, Color = LIGHT_COLOR, Shadows = false }
	local name = teamLabel(ctx)
	local banners = {
		"GO\n" .. name .. "!",
		name .. "\nFOOTBALL",
		"DEFENSE!",
		"GAME\nDAY",
		"LOUD &\nPROUD",
		"HOME OF THE\n" .. name,
		"TOUCH-\nDOWN!",
		"ALL\nIN!",
	}
	local tvIndex, bannerIndex = 0, 0
	for _, seg in ipairs(segs) do
		-- neon strips over the lane (and over the portal side on the straights)
		local laneMid = (laneIn + laneOut) / 2
		local half = seg.len(laneMid) / 2 - 1.5
		local strip = span(
			ctx,
			seg,
			"ConcourseLightStrip",
			-half,
			half,
			laneMid - 0.6,
			laneMid + 0.6,
			ceilBottom - 0.25,
			ceilBottom,
			NEON,
			Enum.Material.Neon,
			NO_COLLIDE
		)
		lightsAlong(strip, math.max(1, math.floor(half * 2 / 60 + 0.5)), light)
		if seg.straight then
			local o = MC.Inner + 5
			local h2 = seg.len(o) / 2 - 1.5
			span(
				ctx,
				seg,
				"ConcourseLightStrip",
				-h2,
				h2,
				o - 0.4,
				o + 0.4,
				ceilBottom - 0.2,
				ceilBottom,
				NEON,
				Enum.Material.Neon,
				NO_COLLIDE
			)
		end

		-- a TV on every column, facing the lane
		for index, x in ipairs(seg.portals) do
			tvIndex += 1
			local live = MAIN_TV_KINDS[(tvIndex - 1) % #MAIN_TV_KINDS + 1]
			local tv =
				span(ctx, seg, "ConcourseTV", x - 3.3, x + 3.3, MAIN_COLUMN_IN - 0.6, MAIN_COLUMN_IN, floorY + 5.6, floorY + 9.4, SCREEN)
			liveScreen(tv, INWARD, live, LIVE_PLACEHOLDER[live])
			if seg.straight and index == 1 then
				BuildUtil.Look(tv, "Concourse TV", "Never miss a play - not even in the hot dog line! Every column has a live screen.", {
					At = Vector3.new(0, -3.4, 1.4),
				})
			end
		end

		if seg.straight then
			-- banners on the inner wall, halfway between the portals
			local spots = {}
			for index = 1, #seg.portals - 1 do
				table.insert(spots, (seg.portals[index] + seg.portals[index + 1]) / 2)
			end
			for _, x in ipairs(spots) do
				bannerIndex += 1
				local color = bannerIndex % 2 == 0 and team.Secondary or team.Trim
				if contrast(color, wallColor) < 1.6 then
					color = WHITE
				end
				local banner =
					span(ctx, seg, "TeamBanner", x - 3, x + 3, MC.Inner + 1, MC.Inner + 1.2, floorY + 1.6, floorY + 9.4, color, nil, PAINT)
				write(banner, OUTWARD, banners[(bannerIndex - 1) % #banners + 1], ink(color, team), { Top = 0.08, Height = 0.84 })
			end
			-- overhead wayfinding signs over the lane: each face lists the sections (and the gate)
			-- ahead of the people reading it
			local first = LOWER_SECTION_BASE[seg.name]
			local last = first + #lowerBounds(L, seg.kind)
			local gateText = "  |  GATE " .. seg.gate
			for _, x in ipairs({ -52, 52 }) do
				local here = lowerSection(L, seg, x)
				overheadSign(
					ctx,
					seg,
					x,
					laneIn + 0.5,
					laneOut - 0.5,
					ceilBottom - 3.6,
					ceilBottom,
					sectionsText(here, last) .. (x < 0 and gateText or ""),
					team.Primary,
					team,
					sectionsText(first, here) .. (x > 0 and gateText or "")
				)
			end
		end
	end
end

---------------------------------------------------------------------------------------------
-- UPPER CONCOURSE
---------------------------------------------------------------------------------------------

local STANDS = {
	{
		seg = "visitor",
		x = -52,
		title = "GRIDIRON GRILL",
		use = "hotdog",
		gear = "grill",
		menu = "HOT DOG ........ $5\nCHILI DOG ...... $7\nJUMBO BRAT ..... $8",
		info = "Hot dogs straight off the grill. The Chili Dog is a game-day legend!",
	},
	{
		seg = "visitor",
		x = 52,
		title = "KICKOFF KETTLE CORN",
		use = "popcorn",
		gear = "popcorn",
		menu = "POPCORN ........ $4\nKETTLE CORN .... $5\nTUB OF CORN .... $9",
		info = "Fresh popcorn, sweet kettle corn and a tub big enough for the whole row.",
	},
	{
		seg = "home",
		x = -52,
		title = "FIZZ STATION",
		use = "soda",
		gear = "soda",
		menu = "SODA ........... $3\nBIG GULP ....... $5\nSLUSH .......... $4",
		info = "Ice-cold sodas and slushes. Refills are free when your team scores!",
	},
	{
		seg = "home",
		x = 52,
		title = "HYDRATION STATION",
		use = "sportsdrink",
		gear = "cooler",
		menu = "SPORTS DRINK ... $3\nWATER .......... $2\nSMOOTHIE ....... $5",
		info = "The same sports drink the players chug on the sideline. Stay hydrated, fan!",
	},
	{
		seg = "west",
		x = 74,
		title = "END ZONE DOGS",
		use = "hotdog",
		gear = "grill",
		menu = "FOOTLONG ....... $7\nCORN DOG ....... $5\nPRETZEL ........ $4",
		info = "Footlong hot dogs and corn dogs - the snack of champions behind the end zone.",
	},
	{
		seg = "east",
		x = -74,
		title = "TOUCHBACK TREATS",
		use = "popcorn",
		gear = "popcorn",
		menu = "CARAMEL CORN ... $5\nCOTTON CANDY ... $4\nNACHOS ......... $6",
		info = "Caramel corn, cotton candy and nachos. Sweet, salty, and totally worth the climb.",
	},
}

local RESTROOMS = {
	{ seg = "visitor", x = 104 },
	{ seg = "home", x = 104 },
}

local SCREENS = {
	{ seg = "visitor", x = -104, live = "score" },
	{ seg = "visitor", x = 104, live = "gameday" },
	{ seg = "home", x = -104, live = "summary" },
	{ seg = "home", x = 104, live = "record" },
	{ seg = "west", x = -74, live = "season" },
	{ seg = "east", x = 74, live = "rating" },
}

local function findSeg(segs, name)
	for _, seg in ipairs(segs) do
		if seg.name == name then
			return seg
		end
	end
	return nil
end

-- Food stand gear on the back counter (two parts).
local function standGear(ctx, seg, cx, kind, top, back, team)
	if kind == "grill" then
		span(ctx, seg, "Grill", cx - 6, cx + 0, back - 2.8, back - 0.2, top, top + 0.9, DARK_METAL, Enum.Material.Metal)
		span(ctx, seg, "GrillCoals", cx - 5.6, cx - 0.4, back - 2.5, back - 0.5, top + 0.9, top + 1.0, GLOW_ORANGE, Enum.Material.Neon)
	elseif kind == "popcorn" then
		span(ctx, seg, "PopcornCart", cx - 6, cx - 1, back - 2.8, back - 0.2, top, top + 1.2, POPCORN_RED)
		span(ctx, seg, "PopcornGlass", cx - 5.8, cx - 1.2, back - 2.6, back - 0.4, top + 1.2, top + 4.4, POPCORN, Enum.Material.Glass, {
			Transparency = 0.15,
		})
	elseif kind == "soda" then
		local fountain = span(ctx, seg, "SodaFountain", cx - 6, cx - 0.5, back - 2.4, back - 0.2, top, top + 3.8, team.Primary)
		write(fountain, INWARD, "ICE COLD", ink(team.Primary, team), { Top = 0.1, Height = 0.3 })
		span(ctx, seg, "CupStack", cx + 1, cx + 2.4, back - 2.2, back - 0.8, top, top + 2.2, WHITE)
	else
		BuildUtil.Cylinder(ctx, {
			Name = "DrinkCooler",
			Position = at(seg, cx - 3, top + 1.4, back - 1.5).Position,
			Height = 2.8,
			Diameter = 2.4,
			Color = COOLER_ORANGE,
		})
		span(
			ctx,
			seg,
			"DrinkFridge",
			cx + 0.5,
			cx + 4.5,
			back - 2.6,
			back - 0.2,
			top,
			top + 4.6,
			MIRROR,
			Enum.Material.Glass,
			{ Transparency = 0.25 }
		)
	end
end

local function foodStand(ctx, seg, spec, team)
	local cx = spec.x
	local front = UPPER_STAND_FRONT -- the stand's housing starts here (the lane ends at 138)
	local back = UPPER_OUTER_WALL_IN
	local floorY, top = 74, 85.2
	local half = 11
	-- the counter sits back in an alcove, so the queue (and its rail) fits in front of it
	local counterIn, counterOut = front + 4, front + 6
	-- housing: side walls + name fascia
	span(ctx, seg, "StandWall", cx - half, cx - half + 0.8, front, back, floorY, top, STAND_DARK)
	span(ctx, seg, "StandWall", cx + half - 0.8, cx + half, front, back, floorY, top, STAND_DARK)
	local fascia = span(ctx, seg, "StandSign", cx - half, cx + half, front, front + 0.8, 82.2, top, team.Primary)
	write(fascia, INWARD, spec.title, ink(team.Primary, team), { Glow = true, Top = 0.14, Height = 0.72 })
	-- lit menu board hanging from the ceiling behind the counter
	local menuY0, menuY1 = 79.8, top
	local menu = span(ctx, seg, "MenuBoard", cx - 8, cx + 8, counterOut + 0.4, counterOut + 0.8, menuY0, menuY1, SIGN_DARK)
	local heading = write(menu, INWARD, "- MENU -", ink(SIGN_DARK, team), { Glow = true, Top = 0.05, Height = 0.18 })
	addLine(heading, spec.menu, 0.28, 0.66, Enum.Font.Code).TextColor3 = MENU_TEXT
	BuildUtil.Look(menu, spec.title .. " Menu", spec.info, { At = Vector3.new(5, 78.4 - (menuY0 + menuY1) / 2, 4) })
	BuildUtil.Light(menu, "PointLight", { Range = 16, Brightness = 1.2, Color = LIGHT_COLOR, Shadows = false })
	-- counter (use) with a steel top
	local counter = span(ctx, seg, "Counter", cx - half + 0.8, cx + half - 0.8, counterIn, counterOut, floorY, 77.4, team.Secondary)
	span(
		ctx,
		seg,
		"CounterTop",
		cx - half + 0.8,
		cx + half - 0.8,
		counterIn - 0.25,
		counterOut + 0.2,
		77.4,
		77.7,
		STEEL,
		Enum.Material.Metal
	)
	BuildUtil.Use(ctx, counter, spec.use, { Object = spec.title, At = Vector3.new(-4, 2.6, 1.6) })
	-- back counter + gear
	span(ctx, seg, "BackCounter", cx - half + 0.8, cx + half - 0.8, back - 3, back, floorY, 77.4, STEEL, Enum.Material.Metal)
	standGear(ctx, seg, cx, spec.gear, 77.4, back, team)
	-- a queue divider down the middle of the alcove (two lines)
	BuildUtil.Cylinder(ctx, {
		Name = "QueuePost",
		Position = at(seg, cx, floorY + 1.6, front + 0.4).Position,
		Height = 3.2,
		Diameter = 0.45,
		Color = STEEL,
		Material = Enum.Material.Metal,
	})
	span(ctx, seg, "QueueBelt", cx - 0.08, cx + 0.08, front + 0.4, counterIn, floorY + 2.6, floorY + 3.1, team.Primary)
end

-- One restroom: tiles, light, sink counter + mirror on the middle wall, two stalls, a hand dryer.
-- s = -1 (room toward -x of the block centre) or 1.
local function restroomRoom(ctx, seg, cx, s, front, back)
	local floorY = 74
	local function u(a)
		return cx + s * a
	end
	local function spanU(name, a0, a1, o0, o1, y0, y1, color, material, extra)
		return span(ctx, seg, name, math.min(u(a0), u(a1)), math.max(u(a0), u(a1)), o0, o1, y0, y1, color, material, extra)
	end
	spanU("RestroomTiles", 0.3, 17.4, front, back, floorY, floorY + 0.05, TILE, nil, PAINT)
	local lamp = spanU("RestroomLight", 6, 12, front + 4, back - 4, 84.95, 85.2, NEON, Enum.Material.Neon, NO_COLLIDE)
	BuildUtil.Light(lamp, "PointLight", { Range = 16, Brightness = 1.1, Color = LIGHT_COLOR, Shadows = false })
	-- sinks along the middle wall + mirror
	spanU("SinkCounter", 0.3, 2.3, front + 0.8, front + 5.4, floorY, floorY + 3, PORCELAIN)
	local mirror = spanU("Mirror", 0.3, 0.5, front + 1, front + 5.2, floorY + 4, floorY + 7.4, MIRROR, Enum.Material.Glass, {
		Reflectance = 0.35,
	})
	-- (the prompt sits in front of the sinks, well away from the other room's mirror prompt)
	BuildUtil.Look(mirror, "Mirror", "Looking good! Quick, check your face paint before the second half.", {
		At = Vector3.new(s * 3, -2, 0),
	})
	-- two stalls along the back wall
	for _, a in ipairs({ 8.4, 12.8 }) do
		spanU("StallDivider", a - 0.1, a + 0.1, back - 5, back, floorY + 0.6, floorY + 7, STEEL, Enum.Material.Metal)
	end
	for _, a in ipairs({ 10.6, 15.1 }) do
		spanU("Toilet", a - 0.8, a + 0.8, back - 2.4, back, floorY, floorY + 1.6, PORCELAIN)
	end
	local dryer = spanU("HandDryer", 3, 4.4, back - 0.9, back, floorY + 3.4, floorY + 5, STEEL, Enum.Material.Metal)
	BuildUtil.Look(dryer, "Hand Dryer", "WHOOOOSH! The loudest thing in the stadium after the crowd. Dry those hands!", {
		At = Vector3.new(0, -0.8, 1.4),
	})
end

local function restroomBlock(ctx, seg, cx, team)
	local front0, front1 = UPPER_STAND_FRONT, UPPER_STAND_FRONT + 0.6
	local back = UPPER_OUTER_WALL_IN
	local floorY, top = 74, 85.2
	local doorTop = floorY + 8.2
	local half = 18
	-- front wall with two doorways (6.4 wide) at cx -+ 9
	local pieces = {
		{ -half, -12.2 },
		{ -5.8, 5.8 },
		{ 12.2, half },
	}
	local wallParts = {}
	for _, p in ipairs(pieces) do
		table.insert(wallParts, span(ctx, seg, "RestroomWall", cx + p[1], cx + p[2], front0, front1, floorY, top, TILE_WALL))
	end
	for _, d in ipairs({ -9, 9 }) do
		span(ctx, seg, "RestroomWallLintel", cx + d - 3.2, cx + d + 3.2, front0, front1, doorTop, top, TILE_WALL)
	end
	-- side walls + the wall between the two rooms
	span(ctx, seg, "RestroomWall", cx - half, cx - half + 0.6, front1, back, floorY, top, TILE_WALL)
	span(ctx, seg, "RestroomWall", cx + half - 0.6, cx + half, front1, back, floorY, top, TILE_WALL)
	span(ctx, seg, "RestroomWall", cx - 0.3, cx + 0.3, front1, back, floorY, top, TILE_WALL)

	-- the RESTROOMS sign over the middle of the front + WOMEN / MEN signs
	local main = span(ctx, seg, "RestroomSign", cx - 5.2, cx + 5.2, front0 - 0.3, front0, floorY + 6.6, floorY + 10.4, team.Primary)
	write(main, INWARD, "RESTROOMS", ink(team.Primary, team), { Glow = true })
	BuildUtil.Look(main, "Restrooms", "Beat the halftime rush! Real stadiums have hundreds of restrooms - this level has two.", {
		At = Vector3.new(0, -3.5, 1.2),
	})
	for _, entry in ipairs({ { -1, "WOMEN" }, { 1, "MEN" } }) do
		local s = entry[1]
		-- a lit WOMEN / MEN plate on the wall right above its doorway
		local plate = span(
			ctx,
			seg,
			"RestroomDoorSign",
			cx + s * 9 - 2.6,
			cx + s * 9 + 2.6,
			front0 - 0.2,
			front0,
			doorTop + 0.4,
			top - 0.5,
			SIGN_DARK
		)
		write(plate, INWARD, entry[2], WHITE, { Glow = true })
		BuildUtil.Door(ctx, {
			Name = "RestroomDoor",
			Size = Vector3.new(6.2, 8, 0.3),
			CFrame = at(seg, cx + s * 9, floorY + 0.05 + 4, (front0 + front1) / 2),
			Hinge = s < 0 and "Left" or "Right",
			Color = team.Primary,
			Material = Enum.Material.SmoothPlastic,
			Object = entry[2] == "MEN" and "Men's Restroom" or "Women's Restroom",
			Title = entry[2] == "MEN" and "Men's Restroom" or "Women's Restroom",
			Info = "Clean, bright and ready for game day.",
		})
		restroomRoom(ctx, seg, cx, s, front1, back)
	end
	return wallParts
end

function Concourse.upper_concourse(ctx)
	local L = ctx.config.Layout
	local UC = L.Bowl.UpperConcourse
	local team = ctx.colors
	local segs = ringSegments(L)
	local floorY = UC.Floor
	local ceilBottom, ceilTop = UC.Ceiling - 0.8, UC.Ceiling - 0.2 -- 85.2 .. 85.8
	local laneIn, laneOut = UC.Inner + 12, UC.Inner + 22 -- 128..138
	local innerOut = UC.Inner + UPPER_INNER_WALL -- 117

	-- vomitories (Bowl.Vomitories), numbered from the home side like the lower sections
	local number = 300
	for _, seg in ipairs(segs) do
		seg.voms = Bowl.Vomitories(seg.kind)
		seg.vomSections = {}
		for index = 1, #seg.voms do
			seg.vomSections[index] = { number + 1, number + 4 }
			number += 4
		end
	end

	-- 1 CONCOURSE FLOOR ---------------------------------------------------------------------
	BuildUtil.Stage(ctx, 1)
	local light = { Range = 34, Brightness = 1.3, Color = LIGHT_COLOR, Shadows = false }
	local murals = {
		"WELCOME TO THE UPPER DECK",
		teamLabel(ctx) .. " NATION",
		"LOUDEST FANS IN FOOTBALL",
		"BEST VIEW IN THE HOUSE",
	}
	local muralIndex = 0
	for _, seg in ipairs(segs) do
		bandExact(ctx, seg, "UpperConcourseFloor", UC.Inner, UC.Outer, floorY - 1, floorY, FLOOR)
		bandBlock(ctx, seg, "UpperConcourseCeiling", innerOut, UPPER_OUTER_WALL_IN, ceilBottom, ceilTop, CEILING)
		local laneMid = (laneIn + laneOut) / 2
		local half = seg.len(laneMid) / 2 - 1.5
		local strip = span(
			ctx,
			seg,
			"ConcourseLightStrip",
			-half,
			half,
			laneMid - 0.6,
			laneMid + 0.6,
			ceilBottom - 0.25,
			ceilBottom,
			NEON,
			Enum.Material.Neon,
			NO_COLLIDE
		)
		lightsAlong(strip, math.max(1, math.floor(half * 2 / 60 + 0.5)), light)

		-- inner wall (team colour) with the vomitory openings
		local voms = {}
		for _, x in ipairs(seg.voms) do
			table.insert(voms, { x = x, half = Bowl.Vomitory.Width / 2, top = floorY + UPPER_VOM_HEIGHT })
		end
		wallRun(ctx, seg, "UpperInnerWall", UC.Inner, innerOut, floorY, ceilBottom, voms, team.Primary)
		-- outer wall with the gate openings (escalators arrive here)
		local gates = {}
		if seg.gate then
			table.insert(gates, { x = 0, half = UPPER_GATE_HALF, top = floorY + UPPER_GATE_HEIGHT })
		end
		local outerPieces = wallRun(ctx, seg, "UpperOuterWall", UPPER_OUTER_WALL_IN, UC.Outer, floorY, ceilTop, gates, WALL)
		if not seg.straight then
			-- a big painted slogan on the corner walls
			muralIndex += 1
			write(outerPieces[1], INWARD, murals[(muralIndex - 1) % #murals + 1], ink(WALL, team), {
				Top = 0.3,
				Height = 0.3,
				Left = 0.08,
				Width = 0.84,
				PPS = 8,
				Name = "Mural",
			})
		end
		-- two rings of columns down to the ground
		for _, x in ipairs(UPPER_COLUMNS[seg.kind]) do
			for _, o0 in ipairs({ innerOut - 0.2, UPPER_OUTER_WALL_IN + 0.2 - COLUMN }) do
				span(
					ctx,
					seg,
					"UpperColumn",
					x - COLUMN / 2,
					x + COLUMN / 2,
					o0,
					o0 + COLUMN,
					0,
					ceilBottom,
					CONCRETE,
					Enum.Material.Concrete
				)
			end
		end
	end

	-- 2 VOMITORIES ---------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 2)
	local trim = accent(team)
	for _, seg in ipairs(segs) do
		for index, x in ipairs(seg.voms) do
			local halfW = Bowl.Vomitory.Width / 2
			local headY = floorY + UPPER_VOM_HEIGHT
			for _, s in ipairs({ -1, 1 }) do
				local x0 = x + s * halfW
				span(
					ctx,
					seg,
					"VomitoryFrame",
					math.min(x0, x0 + s),
					math.max(x0, x0 + s),
					innerOut,
					innerOut + 2.4,
					floorY,
					ceilBottom,
					trim
				)
			end
			local range = seg.vomSections[index]
			-- (frames + sign start at the wall's concourse face: no coplanar faces with the opening)
			local sign = span(ctx, seg, "VomitorySign", x - halfW, x + halfW, innerOut, innerOut + 2.4, headY, ceilBottom, SIGN_DARK)
			write(sign, OUTWARD, ("SECTIONS %d-%d"):format(range[1], range[2]), ink(SIGN_DARK, team), { Glow = true })
			BuildUtil.Look(
				sign,
				("Sections %d-%d"):format(range[1], range[2]),
				"Upper deck! Walk through the tunnel and climb to your row. The whole field fits in one look from up here.",
				{ At = Vector3.new(0, floorY + 4.5 - (headY + ceilBottom) / 2, -2.3) }
			)
			BuildUtil.Light(sign, "PointLight", { Range = 12, Brightness = 1, Color = LIGHT_COLOR, Shadows = false })
		end
		if seg.gate then
			local headY = floorY + UPPER_GATE_HEIGHT
			local sign = span(
				ctx,
				seg,
				"StairsSign",
				-UPPER_GATE_HALF,
				UPPER_GATE_HALF,
				UPPER_OUTER_WALL_IN - 0.3,
				UPPER_OUTER_WALL_IN,
				headY + 0.1,
				ceilBottom - 0.05,
				SIGN_DARK
			)
			write(sign, INWARD, "ESCALATORS  |  STAIRS  |  ELEVATOR", ink(SIGN_DARK, team), { Glow = true })
			BuildUtil.Look(
				sign,
				"Escalators & Elevator",
				("Gate %s: ride down to the main concourse, the club level and the street."):format(seg.gate),
				{ At = Vector3.new(0, floorY + 4.5 - (headY + ceilBottom) / 2, 1.5) }
			)
		end
	end

	-- 3 FOOD STANDS --------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 3)
	for _, spec in ipairs(STANDS) do
		foodStand(ctx, findSeg(segs, spec.seg), spec, team)
	end

	-- 4 RESTROOMS & SIGNS --------------------------------------------------------------------
	BuildUtil.Stage(ctx, 4)
	for _, spec in ipairs(RESTROOMS) do
		restroomBlock(ctx, findSeg(segs, spec.seg), spec.x, team)
	end
	for _, spec in ipairs(SCREENS) do
		local seg = findSeg(segs, spec.seg)
		local tv = span(ctx, seg, "ConcourseScreen", spec.x - 8, spec.x + 8, innerOut, innerOut + 0.5, floorY + 4.2, floorY + 10.2, SCREEN)
		liveScreen(tv, OUTWARD, spec.live, LIVE_PLACEHOLDER[spec.live])
		if seg.kind == "side" then
			-- a drink rail under the screen with two bar stools (one shows the game like a TV)
			span(
				ctx,
				seg,
				"DrinkRail",
				spec.x - 7,
				spec.x + 7,
				innerOut,
				innerOut + 1.6,
				floorY + 3.3,
				floorY + 3.7,
				STEEL,
				Enum.Material.Metal
			)
			local fieldSide = seg.name == "visitor" and -1 or 1
			for index, dx in ipairs({ -3, 3 }) do
				BuildUtil.Seat(ctx, {
					Name = "BarStool",
					Size = Vector3.new(1.6, 3, 1.6),
					CFrame = at(seg, spec.x + dx, floorY + 1.5, innerOut + 2.6) * CFrame.Angles(0, math.pi, 0),
					Color = team.Primary,
					Object = index == 1 and "Concourse TV Stool" or "Bar Stool",
					Camera = index == 1 and {
						From = Vector3.new(0, 66, L.FieldCenterZ + fieldSide * 95),
						To = Vector3.new(0, 0, L.FieldCenterZ),
						Fov = 55,
						Label = "CONCOURSE TV",
					} or nil,
				})
			end
		end
	end
	-- overhead wayfinding over the lane (straights): sections one way, food + restrooms the other
	for _, seg in ipairs(segs) do
		if seg.straight then
			local first = seg.vomSections[1][1]
			local last = seg.vomSections[#seg.vomSections][2]
			overheadSign(
				ctx,
				seg,
				-26,
				laneIn + 0.5,
				laneOut - 0.5,
				ceilBottom - 3.2,
				ceilBottom,
				("SECTIONS %d-%d  |  FOOD"):format(first, last),
				team.Primary,
				team
			)
			overheadSign(
				ctx,
				seg,
				26,
				laneIn + 0.5,
				laneOut - 0.5,
				ceilBottom - 3.2,
				ceilBottom,
				(seg.kind == "side" and "RESTROOMS  |  GATE " or "ESCALATORS  |  GATE ") .. seg.gate,
				team.Primary,
				team
			)
		end
	end
end

return Concourse
