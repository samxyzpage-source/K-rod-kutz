--[[
	Stands (V5): THE LOWER BOWL
	The first tier of the octagonal stadium bowl (docs/V5-LAYOUT.md, Config.Layout.Bowl): 14 rows,
	offsets 0..56 from the turf edge, seating surfaces at y 4..30. The top row is flush with the main
	concourse floor (y 30, another module) that continues outward from offset 56.

	  lower_home      home sideline (+Z)      1 Raker Beams & Rows   2 Seats   3 Aisles & Railings
	                                          4 Field Wall & Signs   5 Players' Tunnel
	  lower_visitor   visitor sideline (-Z)   1 Raker Beams & Rows   2 Seats   3 Aisles & Railings
	                                          4 Field Wall & Players' Tunnel
	  lower_ends      both end zones          1 West End Rows   2 East End Rows   3 Seats
	                                          4 Aisles & Railings
	  lower_corners   the four corners        1 Corner Rows   2 Seats   3 Aisles & Railings

	SEGMENT SPACE. Every segment (Bowl.lua: sides, ends, corners) is built in its own frame F: the
	segment's frame at offset 0 (the turf edge), so a point at (along a, height y, offset o) is
	F * CFrame.new(a, y, -o). Local -Z points away from the field, +Z (Enum.NormalId.Back) faces it.

	ROWS. Row k covers offsets 4(k-1)..4k, its seating surface is at 4 + 2(k-1). Rows 1-7 are solid
	concrete blocks from the ground; rows 8-14 are hollow raked slabs (2 thick, undersides 16..28)
	carried by raker beams along the aisle lines (sides +-26 / +-78 / +-130, ends +-26, corners on
	their centre line). Each beam runs from inside row 7 (the event level's inner wall at offset 28)
	to offset 55 and rests on ONE 1.4 x 1.4 column at offset 53.5: those columns are all that stands
	in the event level underneath (offsets 28..56: locker rooms, corridors, escalator halls).
	Every row of a straight segment is a rectangle as long as
	the row's OUTER edge, and every corner row a rectangle as long as its outer edge too: such
	rectangles cover the octagonal band completely and only ever overlap the SAME row of the
	neighbouring segment (same height + same colour, so the shared top faces never flicker).
	The players' tunnels cut rows 1-5 at |along| < 10.8 on both sidelines; rows 6-7 bridge over the
	tunnel and the passage runs on under the hollow rows (X[-10, 10] stays clear up to y 9).

	SEATS are strips along the back 1.2 studs of every row (Bowl.SeatSpots puts game-day fans on the
	front of the rows), coloured by section: the colour changes at every aisle line, so the bowl
	shows alternating Primary / Secondary sections all the way round.

	AISLES (Bowl.Aisles, 3 wide): one 1-stud step on the back half of every row, so the climb goes
	row top -> step -> next row top. Each aisle has dark sloped row-end caps on both sides and a
	metal handrail; the sideline / end-zone aisles marked as entries also get an opening in the
	field wall with three steps up from the turf.

	Interactions: section plaques on the field walls (and on the corner aisles) with a description
	card, gold TV camera seats near the front of both sidelines (Label "SEATS"), live score /
	game-day / team panels in the sideline walls, and in each players' tunnel a LED header, a
	"slap the sign" board and a plaque.
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)
local Bowl = require(script.Parent.Parent.Bowl)

local M = {}

local TIER = "lower"
local K = math.sqrt(2) - 1 -- a straight segment's half-length grows this much per stud of offset
local TOWARD_FIELD = Enum.NormalId.Back
local AWAY_FROM_FIELD = Enum.NormalId.Front

local SOLID_ROWS = 7 -- rows 1..7 are solid blocks; the rest are hollow raked slabs
local SLAB = 2 -- thickness of a hollow raked slab
local STRIP_DEPTH = 1.2 -- seat strips: the back 1.2 studs of a row...
local STRIP_HEIGHT = 1.1 -- ...and this tall
local STRIP_GAP = 2 -- seat strips stop this far from an aisle centre
local TUNNEL_STRIP = 11.5 -- seat strips on the cut rows stop this far from the tunnel centre
local STEP_RISE = 1 -- two 1-stud steps per 2-stud row
local CAP_IN, CAP_OUT = 1.55, 1.95 -- row-end caps beside each aisle (distance from its centre)
local CAP_ABOVE = 1.2 -- the caps' top runs this far above the stairs' nosing line
local RAIL_OFFSET = 1.75 -- the handrail runs above one cap...
local RAIL_ABOVE = 3 -- ...this far above the nosing line
-- padded field wall (offsets): it overlaps row 1 by 0.1 and leaves most of the turf's drainage
-- gutter (offsets -1..0) and its grates in view
local WALL_FRONT, WALL_BACK = -0.35, 0.1
local WALL_HEIGHT = 4.5
local PANEL_BOTTOM, PANEL_TOP = 0.9, 3.7 -- ad boards / screens on the field face of the wall
local ENTRY_HALF = 2 -- field-wall openings in front of the entry aisles (4 wide)
local RAKER_FROM, RAKER_TO = 27, 55 -- raker beams under the hollow rows (offsets; they start
-- inside row 7, the event level's inner wall, and rest on one column near the back)
local RAKER_THICK = 1.4
local RAKER_COLUMNS = { 53.5 }

local ROW_LIGHT = Color3.fromRGB(160, 160, 165)
local ROW_DARK = Color3.fromRGB(136, 136, 142)
local STEP_COLOR = Color3.fromRGB(198, 194, 184)
local CAP_COLOR = Color3.fromRGB(48, 50, 58)
local STRUCTURE = Color3.fromRGB(116, 116, 122)
local SCREEN_DARK = Color3.fromRGB(12, 14, 20)
local SCREEN_TEXT = Color3.fromRGB(255, 220, 70)
local PLAQUE_DARK = Color3.fromRGB(26, 30, 40)
local WHITE = Color3.fromRGB(250, 250, 250)
local VISITOR_GREY = Color3.fromRGB(58, 60, 68)
local SEAT_GOLD = Color3.fromRGB(255, 196, 37)

local KIND = {
	visitor = "side",
	home = "side",
	west = "end",
	east = "end",
	corner_vw = "corner",
	corner_ve = "corner",
	corner_hw = "corner",
	corner_he = "corner",
}

-- Section numbers go round the bowl like a clock: visitor side west -> east (101-107), the
-- visitor/east corner, the east end front -> back, ... (Bowl along-axis directions: visitor +X,
-- home -X, east +Z, west -Z, so sections are numbered in increasing `along` order everywhere).
local SECTION_BASE = {
	visitor = 101,
	corner_ve = 108,
	east = 109,
	corner_he = 112,
	home = 113,
	corner_hw = 120,
	west = 121,
	corner_vw = 124,
}

-- Fictional sponsors for the field-wall ad boards: { text, board colour, text colour }
local SPONSORS = {
	{ "TOUCHDOWN TACOS", Color3.fromRGB(255, 196, 40), Color3.fromRGB(150, 30, 30) },
	{ "BLITZ COLA", Color3.fromRGB(200, 30, 40), WHITE },
	{ "SPIRAL SPORTS DRINK", Color3.fromRGB(40, 170, 220), WHITE },
	{ "PIGSKIN PIZZA", Color3.fromRGB(240, 120, 30), WHITE },
	{ "END ZONE EXPRESS", Color3.fromRGB(60, 60, 150), Color3.fromRGB(255, 220, 70) },
	{ "HUDDLE HOT DOGS", Color3.fromRGB(250, 235, 200), Color3.fromRGB(180, 40, 30) },
	{ "GRIDIRON GRUB", Color3.fromRGB(30, 120, 60), WHITE },
	{ "FIRST DOWN FRIES", Color3.fromRGB(220, 40, 40), Color3.fromRGB(255, 220, 70) },
	{ "HAIL MARY HONEY", Color3.fromRGB(255, 210, 60), Color3.fromRGB(90, 60, 20) },
	{ "TOUCHBACK TIRES", Color3.fromRGB(30, 30, 36), Color3.fromRGB(250, 200, 40) },
	{ "FUMBLE-FREE GLOVES", Color3.fromRGB(110, 40, 160), WHITE },
	{ "TAILGATE TOOTHPASTE", Color3.fromRGB(230, 245, 255), Color3.fromRGB(20, 90, 170) },
}

local SECTION_FACTS = {
	"Wave your foam finger: the TV cameras love this section!",
	"The stadium wave starts right here every game.",
	"Catch a ball that flies into the stands and you get to keep it!",
	"The loudest chant in the league starts in these rows.",
	"Great view of the kicker lining up a field goal.",
	"Super fans here paint their faces in team colours.",
	"The mascot visits this section at halftime.",
	"Perfect for watching touchdown dances up close.",
}

---------------------------------------------------------------------------------------------
-- Small helpers
---------------------------------------------------------------------------------------------

local function hasName(ctx)
	return type(ctx.teamName) == "string" and ctx.teamName ~= ""
end

local function displayName(ctx)
	return hasName(ctx) and ctx.teamName or "HOME TEAM"
end

local function luminance(color)
	return 0.299 * color.R + 0.587 * color.G + 0.114 * color.B
end

-- `preferred` when it reads well on `background`, otherwise near-white or near-black.
local function readable(background, preferred)
	if math.abs(luminance(background) - luminance(preferred)) >= 0.3 then
		return preferred
	end
	return luminance(background) > 0.55 and Color3.fromRGB(20, 20, 26) or WHITE
end

local function rowColor(k)
	return k % 2 == 1 and ROW_LIGHT or ROW_DARK
end

local function rowInfo(L, k)
	return Bowl.Row(L, TIER, k)
end

local function rowCount(L)
	return L.Bowl.Tiers[TIER].Rows
end

-- Height of the stairs' nosing line (the front edge of every row) at offset o.
local function nosing(L, o)
	local B = L.Bowl
	return B.Tiers[TIER].FirstHeight + (o - B.Tiers[TIER].StartOffset) * B.Rise / B.Depth
end

local function slope(L)
	return L.Bowl.Rise / L.Bowl.Depth
end

-- Half-length of a segment at offset o.
local function halfLength(L, kind, o)
	if kind == "side" then
		return L.SurfaceHalfX + K * o
	elseif kind == "end" then
		return (L.SurfaceMaxZ - L.SurfaceMinZ) / 2 + K * o
	end
	return K * o
end

-- Segment frame at offset 0 (see the header).
local function frameOf(L, name)
	return Bowl.Segment(L, name, 0, 0).cframe
end

-- Block in segment space between along a0..a1, heights y0..y1 and offsets o0..o1.
local function segBox(ctx, F, name, a0, a1, y0, y1, o0, o1, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Size = Vector3.new(math.abs(a1 - a0), y1 - y0, math.abs(o1 - o0))
	props.CFrame = F * CFrame.new((a0 + a1) / 2, (y0 + y1) / 2, -(o0 + o1) / 2)
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Part(ctx, props)
end

--[[
	A bar climbing away from the field at along `a`: its TOP face follows the line
	y = yTop0 + rise * (o - o0) from offset o0 to o1. width = along the segment, thick = perpendicular
	to the slope.
]]
local function slopedBar(ctx, F, name, a, width, o0, o1, yTop0, rise, thick, color, material, extra)
	local phi = math.atan(rise)
	local oc = (o0 + o1) / 2
	local yTop = yTop0 + rise * (oc - o0)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Size = Vector3.new(width, thick, (o1 - o0) * math.sqrt(1 + rise * rise))
	props.CFrame = F * CFrame.new(a, yTop - thick / 2 * math.cos(phi), -(oc + thick / 2 * math.sin(phi))) * CFrame.Angles(phi, 0, 0)
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Part(ctx, props)
end

local function addText(part, face, text, color, pixelsPerStud)
	return BuildUtil.SurfaceText(part, face, text, {
		LabelName = part.Name .. "Text",
		TextColor3 = color,
		PixelsPerStud = pixelsPerStud or 20,
		Font = Enum.Font.GothamBlack,
	})
end

local function contains(list, value)
	for _, x in ipairs(list) do
		if math.abs(x - value) < 0.01 then
			return true
		end
	end
	return false
end

-- Aisle positions of row k of a segment (Bowl.Aisles, measured on the row's inner edge).
local function rowAisles(L, name, k)
	local r = rowInfo(L, k)
	local seg = Bowl.Segment(L, name, r.inner, r.outer)
	return Bowl.Aisles(L, seg.kind, seg.innerLength)
end

--[[
	The stair aisles of a segment: { a, steps = {[k] = true}, gaps = {[k] = true},
	has = {[k] = true}, first, count }. Row k gets a step when row k + 1 has the aisle (the step leads
	up to it); its seat strip leaves a gap when it has the aisle (has[k]) or a step.
]]
local function aislePlan(L, name)
	local rows = rowCount(L)
	local perRow, all = {}, {}
	for k = 1, rows do
		perRow[k] = rowAisles(L, name, k)
		for _, a in ipairs(perRow[k]) do
			if not contains(all, a) then
				table.insert(all, a)
			end
		end
	end
	table.sort(all)
	local plan = {}
	for _, a in ipairs(all) do
		local entry = { a = a, steps = {}, gaps = {}, has = {}, first = nil, count = 0 }
		for k = 1, rows do
			entry.has[k] = contains(perRow[k], a)
			if k < rows and contains(perRow[k + 1], a) then
				entry.steps[k] = true
				entry.count += 1
				entry.first = entry.first or k
			end
			if entry.steps[k] or entry.has[k] then
				entry.gaps[k] = true
			end
		end
		table.insert(plan, entry)
	end
	return plan
end

-- Section colour boundaries along a segment (the aisle lines).
local function colourBounds(L, kind)
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
	else
		list = { 0 }
	end
	table.sort(list)
	return list
end

--[[
	Seat colour of the section at along `a`. Going round the bowl the sections alternate
	A (Primary) / B (Secondary): the middle of each sideline is A, the middle of each end is B and
	every corner is split between the B of the sideline's outer section and the A of the end.
]]
local function sectionColour(ctx, L, name, a)
	local B = L.Bowl
	local team = ctx.colors
	local kind = KIND[name]
	if kind == "side" then
		local index = 0
		for j = 0, 2 do
			if math.abs(a) > B.AisleFirst + j * B.AisleSpacing then
				index = j + 1
			end
		end
		return index % 2 == 0 and team.Primary or team.Secondary
	elseif kind == "end" then
		return math.abs(a) < B.AisleFirst and team.Secondary or team.Primary
	end
	-- corners: +along points toward the sideline on corner_vw / corner_he, toward the end otherwise
	local towardSide = (name == "corner_vw" or name == "corner_he") and 1 or -1
	return a * towardSide > 0 and team.Secondary or team.Primary
end

--[[
	Section number + description card of the section at along `a` of a segment.
	Returns number, title, info.
]]
local function sectionAt(L, name, a)
	local B = L.Bowl
	local kind = KIND[name]
	local index = 1
	if kind ~= "corner" then
		for _, bound in ipairs(colourBounds(L, kind)) do
			if a > bound then
				index += 1
			end
		end
	end
	local number = SECTION_BASE[name] + index - 1
	local F = frameOf(L, name)
	local p = (F * CFrame.new(a, 0, 0)).Position
	local where
	if kind == "side" then
		local sideName = name == "home" and "Home side" or "Visitor side"
		local half = p.X < 0 and "west" or "east"
		if math.abs(a) < B.AisleFirst then
			where = sideName .. ", 50-yard line"
		elseif math.abs(p.X) <= L.GoalLineX then
			local yard = 50 - math.floor((math.abs(p.X) / L.Yard) / 5 + 0.5) * 5
			where = ("%s, %d-yard line (%s half)"):format(sideName, yard, half)
		elseif math.abs(p.X) <= L.FieldHalfLength then
			where = ("%s, level with the %s end zone"):format(sideName, half)
		else
			where = ("%s, next to the %s end zone"):format(sideName, half)
		end
	elseif kind == "end" then
		local endName = name == "west" and "West end zone" or "East end zone"
		if math.abs(a) < B.AisleFirst then
			where = endName .. ", right behind the goal posts"
		else
			where = ("%s, %s side"):format(endName, p.Z < L.FieldCenterZ and "visitor" or "home")
		end
	else
		where = ("Corner seats between the %s side and the %s end zone"):format(
			(name == "corner_vw" or name == "corner_ve") and "visitor" or "home",
			(name == "corner_vw" or name == "corner_hw") and "west" or "east"
		)
	end
	local fact = SECTION_FACTS[number % #SECTION_FACTS + 1]
	return number, "Section " .. number, ("Section %d - %s. %s"):format(number, where, fact)
end

---------------------------------------------------------------------------------------------
-- Step builders (all in segment space)
---------------------------------------------------------------------------------------------

--[[
	The concrete rows of a segment. tunnel = true cuts rows 1..TunnelRows at the players' tunnel and
	bridges rows TunnelRows+1..SOLID_ROWS over it (hollow slabs above the passage).
]]
local function rowBlocks(ctx, L, name, tunnel)
	local B = L.Bowl
	local F = frameOf(L, name)
	local kind = KIND[name]
	local cut = B.TunnelHalfWidth + 0.8
	for k = 1, rowCount(L) do
		local r = rowInfo(L, k)
		local half = halfLength(L, kind, r.outer)
		local color = rowColor(k)
		local solid = k <= SOLID_ROWS
		local y0 = solid and 0 or r.top - SLAB
		local label = (solid and "Row" or "RakedSlab") .. k
		if tunnel and solid then
			segBox(ctx, F, label, -half, -cut, 0, r.top, r.inner, r.outer, color, Enum.Material.Concrete)
			segBox(ctx, F, label, cut, half, 0, r.top, r.inner, r.outer, color, Enum.Material.Concrete)
			if k > B.TunnelRows then
				-- the row bridges over the tunnel passage
				segBox(ctx, F, "TunnelBridge" .. k, -cut, cut, r.top - SLAB, r.top, r.inner, r.outer, color, Enum.Material.Concrete)
			end
		else
			segBox(ctx, F, label, -half, half, y0, r.top, r.inner, r.outer, color, Enum.Material.Concrete)
		end
	end
end

-- Raker beams (with a column and an event-level light) under the hollow rows along the segment's
-- aisle lines.
local function rakers(ctx, L, name, plan)
	local F = frameOf(L, name)
	local rise = slope(L)
	local vertical = RAKER_THICK / math.cos(math.atan(rise))
	for _, aisle in ipairs(plan) do
		if aisle.first and aisle.first <= SOLID_ROWS + 1 then
			-- the beam's top runs through the front-bottom corners of the slabs
			local beam = slopedBar(
				ctx,
				F,
				"RakerBeam",
				aisle.a,
				1.2,
				RAKER_FROM,
				RAKER_TO,
				nosing(L, RAKER_FROM) - SLAB,
				rise,
				RAKER_THICK,
				STRUCTURE,
				Enum.Material.Concrete
			)
			BuildUtil.Light(beam, "PointLight", { Name = "EventLevelLight", Range = 22, Brightness = 0.8 })
			for _, o in ipairs(RAKER_COLUMNS) do
				local top = nosing(L, o) - SLAB - vertical + 0.5
				segBox(ctx, F, "RakerColumn", aisle.a - 0.7, aisle.a + 0.7, 0, top, o - 0.7, o + 0.7, STRUCTURE, Enum.Material.Concrete)
			end
		end
	end
end

-- Seat strips along the back of every row, split (and recoloured) at the aisle lines.
local function seatStrips(ctx, L, name, plan, tunnel)
	local B = L.Bowl
	local F = frameOf(L, name)
	local kind = KIND[name]
	for k = 1, rowCount(L) do
		local r = rowInfo(L, k)
		local o0 = r.outer - STRIP_DEPTH
		local half = halfLength(L, kind, o0) -- the segment joint at the strip's front edge
		local cuts = {}
		local function add(a, h)
			for _, c in ipairs(cuts) do
				if math.abs(c.a - a) < 0.01 then
					c.h = math.max(c.h, h)
					return
				end
			end
			table.insert(cuts, { a = a, h = h })
		end
		for _, a in ipairs(colourBounds(L, kind)) do
			add(a, 0)
		end
		for _, aisle in ipairs(plan) do
			if aisle.gaps[k] then
				add(aisle.a, STRIP_GAP)
			end
		end
		if tunnel and k <= B.TunnelRows then
			add(0, TUNNEL_STRIP)
		end
		table.sort(cuts, function(x, y)
			return x.a < y.a
		end)
		local function strip(a0, a1)
			a0, a1 = math.max(a0, -half), math.min(a1, half)
			if a1 - a0 >= 0.4 then
				segBox(
					ctx,
					F,
					"Row" .. k .. "Seats",
					a0,
					a1,
					r.top,
					r.top + STRIP_HEIGHT,
					o0,
					r.outer,
					sectionColour(ctx, L, name, (a0 + a1) / 2),
					Enum.Material.SmoothPlastic
				)
			end
		end
		local from = -half
		for _, c in ipairs(cuts) do
			strip(from, c.a - c.h)
			from = math.max(from, c.a + c.h)
		end
		strip(from, half)
	end
end

-- Stair steps, row-end caps (sloped dark stringers on both sides) and a handrail for every aisle.
local function aisles(ctx, L, name, plan)
	local C = ctx.config.Colors
	local B = L.Bowl
	local F = frameOf(L, name)
	local rise = slope(L)
	local cos = math.cos(math.atan(rise))
	local topInner = rowInfo(L, rowCount(L)).inner
	local half = B.AisleWidth / 2
	for _, aisle in ipairs(plan) do
		local a = aisle.a
		for k = 1, rowCount(L) do
			if aisle.steps[k] then
				local r = rowInfo(L, k)
				segBox(
					ctx,
					F,
					"AisleStep",
					a - half,
					a + half,
					r.top,
					r.top + STEP_RISE,
					r.inner + B.Depth / 2,
					r.outer,
					STEP_COLOR,
					Enum.Material.Concrete
				)
			end
		end
		if aisle.first then
			-- on a first row without the aisle (game-day fans sit in front of its step) the caps
			-- start behind the fans, at the step
			local o0 = rowInfo(L, aisle.first).inner + (aisle.has[aisle.first] and 0 or B.Depth / 2)
			-- the caps' bottom line runs through the front-bottom corners of the raked slabs, so
			-- they sit inside the rows everywhere and stand CAP_ABOVE above the nosing line
			local capThick = (CAP_ABOVE + B.Rise) * cos
			for _, s in ipairs({ -1, 1 }) do
				slopedBar(
					ctx,
					F,
					"AisleEndCap",
					a + s * (CAP_IN + CAP_OUT) / 2,
					CAP_OUT - CAP_IN,
					o0,
					topInner,
					nosing(L, o0) + CAP_ABOVE,
					rise,
					capThick,
					CAP_COLOR,
					Enum.Material.SmoothPlastic
				)
			end
			if aisle.count >= 4 then
				-- handrail on the side toward the segment's middle
				local side = a > 0.01 and -1 or 1
				local x = a + side * RAIL_OFFSET
				local r0, r1 = o0 + 0.4, topInner - 0.2
				slopedBar(ctx, F, "Handrail", x, 0.25, r0, r1, nosing(L, r0) + RAIL_ABOVE, rise, 0.25, C.Metal, Enum.Material.Metal)
				for _, o in ipairs({ r0 + 0.5, r1 - 0.5 }) do
					local base = nosing(L, o) + CAP_ABOVE - 0.3
					local top = nosing(L, o) + RAIL_ABOVE - 0.25 / cos
					segBox(ctx, F, "HandrailPost", x - 0.12, x + 0.12, base, top, o - 0.12, o + 0.12, C.Metal, Enum.Material.Metal)
				end
			end
		end
	end
end

-- Row-end caps along both sides of the players' tunnel cut (rows 1..TunnelRows).
local function tunnelCutCaps(ctx, L, name)
	local B = L.Bowl
	local F = frameOf(L, name)
	local rise = slope(L)
	local cos = math.cos(math.atan(rise))
	local cut = B.TunnelHalfWidth + 0.8
	local o1 = rowInfo(L, B.TunnelRows).outer
	for _, s in ipairs({ -1, 1 }) do
		slopedBar(
			ctx,
			F,
			"TunnelCutCap",
			s * (cut + 0.35),
			0.6,
			0,
			o1,
			nosing(L, 0) + CAP_ABOVE,
			rise,
			(CAP_ABOVE + B.Rise) * cos,
			CAP_COLOR,
			Enum.Material.SmoothPlastic
		)
	end
end

--[[
	Padded field wall in front of row 1 along `spans` ({ a0, a1 } pairs) with ad boards, live
	screens and section plaques on its field face. panels = { { a0, a1, kind }, ... } with kind
	"ad" (next fictional sponsor), "score" / "gameday" (live LED screens), "team" (live team name)
	or "plaque" (section sign with a description card; the section comes from the panel's middle).
]]
local function fieldWall(ctx, L, name, spans, panels, sponsorStart)
	local team = ctx.colors
	local F = frameOf(L, name)
	for _, span in ipairs(spans) do
		segBox(ctx, F, "FieldWall", span[1], span[2], 0, WALL_HEIGHT, WALL_FRONT, WALL_BACK, team.Primary, Enum.Material.Fabric)
		segBox(
			ctx,
			F,
			"FieldWallCap",
			span[1],
			span[2],
			WALL_HEIGHT,
			WALL_HEIGHT + 0.25,
			WALL_FRONT - 0.1,
			WALL_BACK,
			team.Trim,
			Enum.Material.SmoothPlastic
		)
	end
	local sponsor = sponsorStart or 1
	for _, panel in ipairs(panels) do
		local a0, a1, kind = panel[1], panel[2], panel[3]
		local color = SCREEN_DARK
		if kind == "ad" then
			color = SPONSORS[sponsor][2]
		elseif kind == "plaque" then
			color = PLAQUE_DARK
		end
		local board = segBox(
			ctx,
			F,
			kind == "ad" and "AdBoard" or kind == "plaque" and "SectionSign" or "WallScreen",
			a0,
			a1,
			PANEL_BOTTOM,
			PANEL_TOP,
			WALL_FRONT - 0.16,
			WALL_FRONT,
			color,
			Enum.Material.SmoothPlastic,
			{ CanCollide = false }
		)
		if kind == "ad" then
			addText(board, TOWARD_FIELD, SPONSORS[sponsor][1], SPONSORS[sponsor][3])
			sponsor = sponsor % #SPONSORS + 1
		elseif kind == "plaque" then
			local number, title, info = sectionAt(L, name, (a0 + a1) / 2)
			addText(board, TOWARD_FIELD, "SEC " .. number, WHITE, 24)
			BuildUtil.Look(board, title, info)
		elseif kind == "team" then
			-- LED screen: the team name in team colours on a dark background
			BuildUtil.LiveText(board, TOWARD_FIELD, "team", {
				LabelName = "Live_team",
				Text = displayName(ctx),
				TextColor3 = readable(SCREEN_DARK, team.Secondary),
				BackgroundColor3 = SCREEN_DARK,
				BackgroundTransparency = 0,
				LightInfluence = 0,
				PixelsPerStud = 20,
				Font = Enum.Font.GothamBlack,
			})
		else
			BuildUtil.LiveText(board, TOWARD_FIELD, kind, {
				LabelName = "Live_" .. kind,
				Text = kind == "score" and (displayName(ctx) .. "  0 - 0  VISITORS") or "NEXT GAME SOON",
				TextColor3 = SCREEN_TEXT,
				BackgroundColor3 = SCREEN_DARK,
				BackgroundTransparency = 0,
				LightInfluence = 0,
				PixelsPerStud = 20,
				Font = Enum.Font.GothamBlack,
			})
		end
	end
	return sponsor
end

-- The parts of a span [lo, hi] that are left after cutting out `holes` ({ a0, a1 } pairs).
local function spansBetween(lo, hi, holes)
	table.sort(holes, function(x, y)
		return x[1] < y[1]
	end)
	local spans, from = {}, lo
	for _, hole in ipairs(holes) do
		if hole[1] > from then
			table.insert(spans, { from, hole[1] })
		end
		from = math.max(from, hole[2])
	end
	if hi > from then
		table.insert(spans, { from, hi })
	end
	return spans
end

-- Three steps up from the turf to row 1 in front of the field-wall opening at along `a`.
local function entrySteps(ctx, L, name, a)
	local F = frameOf(L, name)
	local first = rowInfo(L, 1).top
	local depth = 1.5
	for step = 1, first - 1 do
		local top = first - step
		segBox(
			ctx,
			F,
			"EntryStep",
			a - ENTRY_HALF,
			a + ENTRY_HALF,
			0,
			top,
			-depth * step,
			-depth * (step - 1),
			STEP_COLOR,
			Enum.Material.Concrete
		)
	end
end

-- Along positions of the game-day fans on row k (Bowl.SeatSpots).
local function fanAlongs(L, name, k)
	local r = rowInfo(L, k)
	local seg = Bowl.Segment(L, name, r.inner, r.outer)
	local list = {}
	for _, spot in ipairs(Bowl.SeatSpots(L, r, name)) do
		table.insert(list, (spot.Position - seg.cframe.Position):Dot(seg.cframe.RightVector))
	end
	return list
end

--[[
	Gold TV camera seats near the front of a sideline, each beside an entry aisle in a slot where no
	game-day fan sits. specs = { { aisle = a, dir = 1 | -1 (side of the aisle) }, ... }.
	Sitting down switches to a TV view of the field from high above the seats.
]]
local function cameraSeats(ctx, L, name, specs)
	local team = ctx.colors
	local F = frameOf(L, name)
	local width = 1.7
	for _, spec in ipairs(specs) do
		for _, k in ipairs({ 2, 3, 1, 4, 5 }) do
			local start = spec.aisle + spec.dir * (CAP_OUT + 0.1)
			local nearest
			for _, p in ipairs(fanAlongs(L, name, k)) do
				local d = (p - spec.aisle) * spec.dir
				if d > 0 and (nearest == nil or d < (nearest - spec.aisle) * spec.dir) then
					nearest = p
				end
			end
			local room = nearest and ((nearest - spec.aisle) * spec.dir - (CAP_OUT + 0.1) - 1.15) or 99
			if room >= width + 0.1 then
				local r = rowInfo(L, k)
				local c = start + spec.dir * (width / 2 + 0.05)
				local seatO = r.inner + 1.65
				local seatCFrame = F * CFrame.new(c, r.top + 0.3, -seatO) * CFrame.Angles(0, math.pi, 0)
				local p = seatCFrame.Position
				BuildUtil.Seat(ctx, {
					Name = "TVSeat",
					Size = Vector3.new(width, 0.6, 1.5),
					CFrame = seatCFrame,
					Color = SEAT_GOLD,
					Material = Enum.Material.SmoothPlastic,
					Object = "Front Row Seat",
					-- a high "sky cam" just behind the seat: high enough that the aisle's handrail
					-- and the tunnel header stay below the picture
					Camera = {
						From = p + F.LookVector * 3 + Vector3.new(0, 13, 0),
						To = Vector3.new(p.X * 0.6, 0, L.FieldCenterZ),
						Fov = 60,
						Label = "SEATS",
					},
				})
				segBox(
					ctx,
					F,
					"TVSeatBack",
					c - width / 2,
					c + width / 2,
					r.top,
					r.top + 2.2,
					r.inner + 2.45,
					r.inner + 2.75,
					team.Primary,
					Enum.Material.SmoothPlastic
				)
				break
			end
		end
	end
end

--[[
	A players' tunnel mouth + passage through the cut rows of a sideline (step "Players' Tunnel").
	spec: home (bool), wallColor, headerColor, fieldText (static header text facing the field; nil =
	live team name), insideText, slapText, slapInfo, plaqueTitle, plaqueInfo.
]]
local function playersTunnel(ctx, L, name, spec)
	local B = L.Bowl
	local team = ctx.colors
	local F = frameOf(L, name)
	local inner = B.TunnelHalfWidth -- the clear passage is |along| < inner
	local cut = inner + 0.8
	local pillarOut = cut + 0.8
	local mouthFront, mouthBack = -0.6, 1
	local headerBottom, headerTop = 9.4, 14
	local openEnd = rowInfo(L, B.TunnelRows).outer -- the cut rows end here
	local coveredEnd = rowInfo(L, SOLID_ROWS).outer -- the bridged rows end here (hollow rows beyond)
	local bridgeBottom = rowInfo(L, B.TunnelRows + 1).top - SLAB
	local coveredTop = rowInfo(L, SOLID_ROWS).top - SLAB - 0.1
	local wallBase = nosing(L, mouthBack) + 1.6
	local wallTop = nosing(L, openEnd) + 1.6

	for _, s in ipairs({ -1, 1 }) do
		segBox(
			ctx,
			F,
			"TunnelPillar",
			s * inner,
			s * pillarOut,
			0,
			headerTop,
			mouthFront,
			mouthBack,
			spec.headerColor,
			Enum.Material.SmoothPlastic
		)
		-- side walls: along the cut with a sloped top following the rows, then up to the ceiling
		-- under the bridged rows
		segBox(ctx, F, "TunnelWall", s * inner, s * cut, 0, wallBase, mouthBack, openEnd, spec.wallColor, Enum.Material.Brick)
		BuildUtil.Wedge(ctx, {
			Name = "TunnelWallSlope",
			Size = Vector3.new(cut - inner, wallTop - wallBase, openEnd - mouthBack),
			CFrame = F
				* CFrame.new(s * (inner + cut) / 2, (wallBase + wallTop) / 2, -(mouthBack + openEnd) / 2)
				* CFrame.Angles(0, math.pi, 0),
			Color = spec.wallColor,
			Material = Enum.Material.Brick,
		})
		-- (up to just under row 7's bridge: the part above row 6's underside hides inside that bridge,
		-- so no slot shows between the wall and row 7)
		segBox(ctx, F, "TunnelWallCovered", s * inner, s * cut, 0, coveredTop, openEnd, coveredEnd, spec.wallColor, Enum.Material.Brick)
		local led = segBox(
			ctx,
			F,
			"TunnelLED",
			s * (inner - 0.12),
			s * inner,
			wallBase - 0.75,
			wallBase - 0.4,
			mouthBack + 0.8,
			coveredEnd - 0.5,
			team.Secondary,
			Enum.Material.Neon,
			{ CanCollide = false, CastShadow = false }
		)
		BuildUtil.Light(led, "PointLight", { Name = "TunnelGlow", Range = 20, Brightness = 1.2 })
	end

	local header = segBox(
		ctx,
		F,
		"TunnelHeader",
		-inner,
		inner,
		headerBottom,
		headerTop,
		mouthFront,
		mouthBack,
		spec.headerColor,
		Enum.Material.SmoothPlastic
	)
	BuildUtil.Light(header, "PointLight", { Name = "TunnelMouthLight", Range = 16, Brightness = 1.5 })
	segBox(
		ctx,
		F,
		"TunnelHeaderCap",
		-pillarOut - 0.4,
		pillarOut + 0.4,
		headerTop,
		headerTop + 0.4,
		mouthFront - 0.2,
		mouthBack + 0.2,
		team.Trim,
		Enum.Material.SmoothPlastic
	)
	-- one face of the header is an LED screen with the live team name: facing the field at home,
	-- facing into the tunnel for the visitors (so they know whose house they are in)
	BuildUtil.LiveText(header, spec.home and TOWARD_FIELD or AWAY_FROM_FIELD, "team", {
		LabelName = "Live_team",
		Text = displayName(ctx),
		TextColor3 = spec.home and readable(SCREEN_DARK, team.Secondary) or SCREEN_TEXT,
		BackgroundColor3 = SCREEN_DARK,
		BackgroundTransparency = 0,
		LightInfluence = 0,
		PixelsPerStud = 20,
		Font = Enum.Font.GothamBlack,
	})
	if spec.home then
		addText(header, AWAY_FROM_FIELD, spec.insideText, readable(spec.headerColor, team.Trim), 16)
	else
		addText(header, TOWARD_FIELD, spec.fieldText, readable(spec.headerColor, WHITE), 16)
	end

	-- team runway on the tunnel floor
	segBox(ctx, F, "TunnelRunway", -inner + 2, inner - 2, 0, 0.12, mouthBack, coveredEnd, team.Primary, Enum.Material.Fabric, {
		CanCollide = false,
	})

	-- "slap the sign" board hanging from the front of the first bridged row, read by players on
	-- their way out to the field
	local slap = segBox(
		ctx,
		F,
		"SlapSign",
		-6,
		6,
		bridgeBottom - 1.8,
		bridgeBottom + 0.6,
		openEnd - 0.25,
		openEnd - 0.05,
		team.Secondary,
		Enum.Material.SmoothPlastic,
		{
			CanCollide = false,
		}
	)
	addText(slap, AWAY_FROM_FIELD, spec.slapText, readable(team.Secondary, team.Primary), 20)
	BuildUtil.Look(slap, "Slap the Sign!", spec.slapInfo, { LookKey = "team" })

	-- plaque on the inside of the left wall
	local plaque = segBox(ctx, F, "TunnelPlaque", -inner, -inner + 0.15, 6.2, 8.4, 6.5, 10.5, PLAQUE_DARK, Enum.Material.SmoothPlastic, {
		CanCollide = false,
	})
	addText(plaque, Enum.NormalId.Right, spec.plaqueTitle:upper(), WHITE, 24)
	BuildUtil.Look(plaque, spec.plaqueTitle, spec.plaqueInfo, { LookKey = spec.home and "record" or "season", Distance = 9 })
end

-- Wall layout of a sideline (along positions): the plaques mark the 7 sections.
local SIDE_PLAQUES = {
	{ -134.8, -130.4 },
	{ -107, -101 },
	{ -55, -49 },
	{ -21, -16 },
	{ 49, 55 },
	{ 101, 107 },
	{ 130.4, 134.8 },
}

local function sideline(ctx, name, home)
	local L = ctx.config.Layout
	local B = L.Bowl
	local team = ctx.colors
	local plan = aislePlan(L, name)
	-- entry aisles: away from the benches on the home side, near the middle on the visitor side
	local entries = home and { -(B.AisleFirst + B.AisleSpacing), B.AisleFirst + B.AisleSpacing } or { -B.AisleFirst, B.AisleFirst }

	BuildUtil.Stage(ctx, 1)
	rowBlocks(ctx, L, name, true)
	rakers(ctx, L, name, plan)

	BuildUtil.Stage(ctx, 2)
	seatStrips(ctx, L, name, plan, true)
	local specs = {}
	for _, a in ipairs(entries) do
		table.insert(specs, { aisle = a, dir = a > 0 and -1 or 1 })
		table.insert(specs, { aisle = a, dir = a > 0 and 1 or -1 })
	end
	cameraSeats(ctx, L, name, specs)

	BuildUtil.Stage(ctx, 3)
	aisles(ctx, L, name, plan)
	tunnelCutCaps(ctx, L, name)

	BuildUtil.Stage(ctx, 4)
	local wallEnd = L.SurfaceHalfX + WALL_BACK -- covers the turf corner (the end walls stop short of it)
	local cut = B.TunnelHalfWidth + 0.8
	local holes = { { -cut, cut } }
	for _, a in ipairs(entries) do
		table.insert(holes, { a - ENTRY_HALF, a + ENTRY_HALF })
		entrySteps(ctx, L, name, a)
	end
	local panels
	if home then
		-- (the middle of the home wall hides behind the benches: screens go further out)
		panels = {
			{ -128, -110, "team" },
			{ -99, -83, "gameday" },
			{ -74, -59, "score" },
			{ -47, -28, "ad" },
			{ 28, 47, "ad" },
			{ 59, 74, "score" },
			{ 83, 99, "gameday" },
			{ 110, 128, "ad" },
		}
	else
		panels = {
			{ -128, -110, "ad" },
			{ -99, -83, "gameday" },
			{ -47, -30, "score" },
			{ 13, 22.5, "team" },
			{ 30, 47, "score" },
			{ 59, 74, "ad" },
			{ 83, 99, "gameday" },
			{ 110, 128, "ad" },
		}
	end
	for _, plaque in ipairs(SIDE_PLAQUES) do
		table.insert(panels, { plaque[1], plaque[2], "plaque" })
	end
	fieldWall(ctx, L, name, spansBetween(-wallEnd, wallEnd, holes), panels, home and 1 or 6)

	if home then
		BuildUtil.Stage(ctx, 5)
	end
	local tunnelCtx = BuildUtil.Child(ctx, home and "HomeTunnel" or "VisitorTunnel")
	if home then
		playersTunnel(tunnelCtx, L, name, {
			home = true,
			wallColor = team.Primary,
			headerColor = team.Primary,
			insideText = "LEAVE IT ALL ON THE FIELD",
			slapText = "PLAY HARD. PLAY TOGETHER.",
			slapInfo = "Every player jumps up and slaps this sign for luck on the way out to the field. Can you reach it?",
			plaqueTitle = "Home Tunnel",
			plaqueInfo = "Your team charges out of this tunnel before every kick-off while the crowd goes wild. Behind you: the home locker room.",
		})
	else
		playersTunnel(tunnelCtx, L, name, {
			home = false,
			wallColor = VISITOR_GREY,
			headerColor = VISITOR_GREY,
			fieldText = "VISITORS",
			slapText = "WELCOME TO THE LOUDEST STADIUM IN THE LEAGUE",
			slapInfo = "The home fans put this sign here to scare the visitors. It doesn't work... usually!",
			plaqueTitle = "Visitors' Tunnel",
			plaqueInfo = "The away team walks out through here on game day. Behind you: the visitor locker room.",
		})
	end
end

---------------------------------------------------------------------------------------------
-- Pieces
---------------------------------------------------------------------------------------------

function M.lower_home(ctx)
	sideline(ctx, "home", true)
end

function M.lower_visitor(ctx)
	sideline(ctx, "visitor", false)
end

function M.lower_ends(ctx)
	local L = ctx.config.Layout
	local B = L.Bowl
	local plans = { west = aislePlan(L, "west"), east = aislePlan(L, "east") }
	local wallEnd = (L.SurfaceMaxZ - L.SurfaceMinZ) / 2 + WALL_FRONT -- stops at the sideline walls
	local entries = { -B.AisleFirst, B.AisleFirst }
	local panels = {
		{ -61.5, -51, "ad" },
		{ -49, -43, "plaque" },
		{ -40.5, -30, "ad" },
		{ -21, -6, "ad" },
		{ -3, 3, "plaque" },
		{ 6, 21, "team" },
		{ 30, 40.5, "ad" },
		{ 43, 49, "plaque" },
		{ 51, 61.5, "ad" },
	}

	for stage, name in ipairs({ "west", "east" }) do
		BuildUtil.Stage(ctx, stage)
		local endCtx = BuildUtil.Child(ctx, name == "west" and "WestEnd" or "EastEnd")
		rowBlocks(endCtx, L, name, false)
		rakers(endCtx, L, name, plans[name])
		local holes = {}
		for _, a in ipairs(entries) do
			table.insert(holes, { a - ENTRY_HALF, a + ENTRY_HALF })
		end
		fieldWall(endCtx, L, name, spansBetween(-wallEnd, wallEnd, holes), panels, stage == 1 and 3 or 9)
	end

	BuildUtil.Stage(ctx, 3)
	for _, name in ipairs({ "west", "east" }) do
		seatStrips(ctx, L, name, plans[name], false)
	end

	BuildUtil.Stage(ctx, 4)
	for _, name in ipairs({ "west", "east" }) do
		aisles(ctx, L, name, plans[name])
		for _, a in ipairs(entries) do
			entrySteps(ctx, L, name, a)
		end
	end
end

function M.lower_corners(ctx)
	local L = ctx.config.Layout
	local plans = {}
	for _, name in ipairs(Bowl.Corners) do
		plans[name] = aislePlan(L, name)
	end

	BuildUtil.Stage(ctx, 1)
	for _, name in ipairs(Bowl.Corners) do
		rowBlocks(ctx, L, name, false)
		rakers(ctx, L, name, plans[name])
	end

	BuildUtil.Stage(ctx, 2)
	for _, name in ipairs(Bowl.Corners) do
		seatStrips(ctx, L, name, plans[name], false)
	end

	BuildUtil.Stage(ctx, 3)
	for _, name in ipairs(Bowl.Corners) do
		local plan = plans[name]
		aisles(ctx, L, name, plan)
		-- section plaque on the inside of the left row-end cap, on the second row of the aisle
		local aisle = plan[1]
		if aisle and aisle.first then
			local F = frameOf(L, name)
			local r = rowInfo(L, aisle.first + 1)
			local o = r.inner + 1.05
			local y = r.top + 0.2
			local plaque = segBox(
				ctx,
				F,
				"SectionSign",
				aisle.a - CAP_IN - 0.02,
				aisle.a - CAP_IN + 0.1,
				y,
				y + 1,
				o - 0.85,
				o + 0.85,
				PLAQUE_DARK,
				Enum.Material.SmoothPlastic,
				{ CanCollide = false }
			)
			local number, title, info = sectionAt(L, name, 0)
			addText(plaque, Enum.NormalId.Right, "SEC " .. number, WHITE, 30)
			BuildUtil.Look(plaque, title, info, { Distance = 8 })
		end
	end
end

return M
