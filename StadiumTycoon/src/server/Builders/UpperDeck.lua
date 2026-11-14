--[[
	UpperDeck
	The CLUB SEATS and the UPPER DECK of the V5 bowl (docs/V5-LAYOUT.md, Server/Bowl.lua).

	  club_seats     the club tier, all 8 segments: 6 rows (offsets 56..80, tops 44..54) on top of the
	                 main concourse (undersides >= 42). The club ring floor (y 54, ClubLevel.lua)
	                 continues behind the top row.
	                   1 Club Rows             hollow raked concrete rows (2-stud slabs)
	                   2 Padded Seats          a padded cushion + backrest strip on every row (team colours)
	                                           + front-row TV camera seats at the foot of 4 aisles
	                   3 Aisles & Glass Rails  stair aisles (1-stud steps, a landing on the top row) with a
	                                           handrail each, and a glass rail with a metal drink ledge
	                                           along the front edge
	                   4 Club Signs            "CLUB LEVEL" fascia boards (live team name) and lit section
	                                           plaques at the foot of the main aisles and the corner aisles
	                                           (look)
	  upper_home     the home side (+Z) of the upper deck: 18 rows (offsets 80..152, tops 70..104)
	  upper_visitor  the visitor side (-Z), the same
	                   1 Upper Rows            raked rows on raker beams + columns, the front fascia, two
	                                           vomitories (open trench with a team-colour base + lit tunnel)
	                                           and stairs (elevator) between the club seats and the upper deck
	                   2 Seats                 seat strips (row 3 is the cross-aisle) + 2 TV camera seats
	                                           at the very top
	                   3 Aisles & Railings     stair aisles + handrails, the glass front rail with fans'
	                                           banners hanging over it, a glass rail along the cross-aisle,
	                                           vomitory railings, trim frames and SECTION signs (look)
	                   4 Facade                the rear fascia closing the back of the deck (team colour,
	                                           live team name outside), the rear parapet (team-colour band,
	                                           live team name, glass and rail) and an LED ribbon board on
	                                           the front fascia
	  upper_ends     both ends (step 1, with a vomitory each) and the 4 corners (step 2); 3 Seats (+ a TV
	                 camera seat on each end); 4 Aisles & Railings (ramped aisles with painted step
	                 nosings and handrails, glass front rails, vomitory railings + frames + signs, rear
	                 fascias + parapets, ribbon boards, and the RING OF HONOR on the corner fascias: the
	                 franchise's made-up legends, look)

	SEGMENT SPACE: everything is built per bowl segment (Bowl.Segment) in a frame on the turf outline
	(offset 0) in the middle of the segment: x runs along the segment, y is up and o = offset (distance
	outward from the turf edge); a point is seg.base * CFrame.new(x, y, -o). The Back face (+Z) of an
	unrotated part looks at the field, the Front face (-Z) away from it. Straight and corner blocks
	use the length at their OUTER edge, so neighbouring segments overlap a little at the joints
	(same colours, never a hole).

	Upper deck cross-section (every segment):
	  * rows are 2-stud slabs, so their stepped undersides line up on the "soffit line"
	    y = 68 + 0.5 * (o - 80); undersides stay >= 66 over the club ring and >= 86 over the upper
	    concourse. Raker beams hang below that line: a front raker over the club ring (o 80.6..116,
	    bottom >= 66) and, on the sides (built before the upper concourse), a rear raker over the
	    concourse (o 120..151, bottom >= 86, above its ceiling at 85.2). Columns stand behind the club
	    ring (o 109..113; sides +-26 / +-78 / +-130 / +-164, ends +-44 / +-88, none in the corners where
	    the corner ramps go) and, on the sides, at the back (o 147.6..151.6, around the upper
	    concourse's own columns at +-78 / +-130). The upper concourse is built before upper_ends, so the
	    ends and corners only need the front structure (the rear is hidden above the concourse ceiling).
	  * vomitories (Bowl.Vomitories): an 8-wide open trench through rows 4-8 (floor y 74, walls one
	    stud above the rows with railings on top) that continues as a lit tunnel under row 9 to the
	    upper concourse (o 116). Row 3 (top y 74) is the cross-aisle they open onto: no seats there.
	  * aisles (Bowl.Aisles, per row): real 1-stud steps on the two sides; on the ends + corners a
	    ramp per aisle with yellow nosing stripes painted where the steps would be (part budget).
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)
local Bowl = require(script.Parent.Parent.Bowl)

local M = {}

local TOWARD_FIELD = Enum.NormalId.Back
local AWAY_FROM_FIELD = Enum.NormalId.Front
local TURN = CFrame.Angles(0, math.pi, 0) -- turns a segment-space CFrame round to face the field

-- every segment of the ring, in the same order as Concourse.lua (vomitory section numbers match)
local LOOP = { "home", "corner_hw", "west", "corner_vw", "visitor", "corner_ve", "east", "corner_he" }

local ROW_T = 2 -- row slab thickness
local WALL = 0.8 -- vomitory wall thickness
local STEP = 1 -- aisle step height
local BEAM = 4 -- raker beams are 4 wide...
local COLUMN_INSET = 0.1 -- ...the columns 3.8 (no coplanar side faces where a column meets its raker)
local BEAM_DEPTH = 2 -- raker beams hang this far (vertically) below the row slabs
local FRONT_COLUMN = 109 -- front columns stand at offsets 109..113 (behind the club ring)
local REAR_COLUMN = 147.6 -- rear columns at 147.6..151.6 (around the upper concourse's own columns)
local SEAT_STRIP = 1.9 -- upper seat strips fill the back 1.9 studs of a row (fans sit in front)...
local SEAT_HEIGHT = 0.9 -- ...and stay under the 1-stud aisle steps that cover them
local TOP_STRIP = 1.2 -- the top row's strip (in front of the rear parapet; fans sit up to 2.0 into a row)
local PARAPET = 0.8 -- the rear parapet takes the back 0.8 studs of the top row
local RAIL_HEIGHT = 2.8 -- handrails run this high above the stairs' nosing line
local CLUB_RAIL_HEIGHT = 3 -- (the club's start at the top of the club glass rail)
local FASCIA_IN = 0.6 -- the front fascia covers offsets start - 0.6 .. start
-- Corner blocks overlap their straight neighbours a little at the joints. Their horizontal faces
-- (row tops + bottoms, seat tops, fascia top) sit this much inside the straight blocks' faces, so
-- the overlapping textured faces never z-fight.
local CORNER_SINK = 0.04

local SIDE_RAKERS = { -164, -130, -78, -26, 26, 78, 130, 164 }
local END_RAKERS = { -88, -44, 44, 88 }
local CORNER_RAKERS = { 0 }

-- colours
local ROW_LIGHT = Color3.fromRGB(158, 158, 163)
local ROW_DARK = Color3.fromRGB(136, 136, 142)
local CLUB_LIGHT = Color3.fromRGB(174, 168, 160)
local CLUB_DARK = Color3.fromRGB(152, 146, 139)
local CLUB_CARPET = Color3.fromRGB(72, 76, 90) -- the club aisles' carpeted steps
local STRUCTURE = Color3.fromRGB(122, 123, 130)
local WALL_COLOR = Color3.fromRGB(178, 178, 182)
local FLOOR_COLOR = Color3.fromRGB(198, 194, 184)
local FASCIA_COLOR = Color3.fromRGB(46, 48, 56)
local SCREEN_DARK = Color3.fromRGB(12, 14, 20)
local SCREEN_TEXT = Color3.fromRGB(255, 220, 70)
local PLAQUE_DARK = Color3.fromRGB(24, 28, 38)
local WHITE = Color3.fromRGB(250, 250, 250)
local NOSING = Color3.fromRGB(255, 206, 46)
local LAMP = Color3.fromRGB(255, 246, 228)
local RAMP_COLOR = Color3.fromRGB(184, 180, 170)
local LIGHT_COLOR = Color3.fromRGB(255, 238, 210)
local ACCESS_BLUE = Color3.fromRGB(28, 92, 178) -- painted wheelchair spaces
local CHAIR_DARK = Color3.fromRGB(52, 54, 62)

local NO_COLLIDE = { CanCollide = false }
local GLASS = { Transparency = 0.45 }

-- fun facts on the vomitory SECTION signs (one per vomitory, in LOOP order)
local UPPER_FACTS = {
	"You can see the whole field from up here - the best seats to watch a play unfold!",
	"Upper deck fans are the loudest in the building. When the other team has the ball, make some NOISE!",
	"Coaches love a view like this: from up here you can see the whole formation before the snap.",
	"From the upper deck the players look like action figures - but you can see every route the receivers run.",
	"The roof is right above you and the video boards are almost at eye level - perfect for replays!",
	"The tunnel behind you leads to the upper concourse: hot dogs, popcorn, sodas and restrooms.",
}

local CLUB_FACTS = {
	"Padded seats, extra legroom and waiters who bring snacks right to your seat. The club lounge is just up the aisle!",
	"Club seats sit between the lower bowl and the upper deck: close to the action AND high enough to see every play.",
	"Club members get in early to watch the warm-ups from the best seats in the house.",
	"Chilly game? The heated club lounge with its buffet is right behind the top row.",
}

-- The Ring of Honor on the upper deck's corner fascias (in Bowl.Corners order): the franchise's
-- made-up legends, two per corner, with a line for their look card.
local RING_OF_HONOR = {
	corner_vw = {
		{ "12  ROCKET RAMIREZ", "#12 Rocket Ramirez, the quarterback who threw a touchdown in 41 games in a row" },
		{ "88  BOLT McGEE", "#88 Bolt McGee, a receiver so fast the cameras couldn't keep up" },
	},
	corner_ve = {
		{ "99  TANK OKORO", "#99 Tank Okoro, who once sacked the quarterback 5 times in one game" },
		{ "22  FLASH FONTAINE", "#22 Flash Fontaine, the running back with the famous spin move" },
	},
	corner_hw = {
		{ "54  MOOSE CALLOWAY", "#54 Moose Calloway, the linebacker who never missed a tackle (well, almost never)" },
		{ "74  BRICK HOLLOWAY", "#74 Brick Holloway, who protected the quarterback for 15 seasons" },
	},
	corner_he = {
		{ "3  ZIGGY QUILLFEATHER", "#3 Ziggy Quillfeather, the kicker who made a 64-yard field goal in a snowstorm" },
		{ "24  DASH DELGADO", "#24 Dash Delgado, the cornerback who caught 3 interceptions in one championship game" },
	},
}

---------------------------------------------------------------------------------------------
-- Small helpers
---------------------------------------------------------------------------------------------

local function luminance(color)
	return 0.299 * color.R + 0.587 * color.G + 0.114 * color.B
end

-- Returns `preferred` when it reads well on `background`, otherwise near-white or near-black.
local function readable(background, preferred)
	if math.abs(luminance(background) - luminance(preferred)) >= 0.3 then
		return preferred
	end
	if luminance(background) > 0.55 then
		return Color3.fromRGB(20, 20, 26)
	end
	return WHITE
end

-- The owner's team name, or a stand-in while it is empty.
local function displayName(ctx)
	if type(ctx.teamName) == "string" and ctx.teamName ~= "" then
		return ctx.teamName
	end
	return "HOME TEAM"
end

local function kindOf(name)
	if name == "home" or name == "visitor" then
		return "side"
	elseif name == "west" or name == "east" then
		return "end"
	end
	return "corner"
end

-- A segment of the ring: its frame on the turf outline (offset 0) + what Bowl knows about it.
local function segment(L, name)
	local s = Bowl.Segment(L, name, 0, 0)
	return { name = name, kind = s.kind, base = s.cframe, layout = L, sink = s.kind == "corner" and CORNER_SINK or 0 }
end

-- Length of a segment at offset o.
local function lengthAt(seg, o)
	return Bowl.Segment(seg.layout, seg.name, o, o).innerLength
end

-- Segment space -> plot-local CFrame.
local function at(seg, x, y, o)
	return seg.base * CFrame.new(x, y, -o)
end

-- Block between two corners in segment space (x along, y up, o outward; any order).
local function block(ctx, seg, name, x0, x1, y0, y1, o0, o1, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Size = Vector3.new(math.abs(x1 - x0), math.abs(y1 - y0), math.abs(o1 - o0))
	props.CFrame = at(seg, (x0 + x1) / 2, (y0 + y1) / 2, (o0 + o1) / 2)
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Part(ctx, props)
end

-- A beam/slab sloping up outward whose TOP surface runs from (oA, yA) to (oB, yB); `depth` is its
-- vertical thickness below that line.
local function incline(ctx, seg, name, x0, x1, oA, yA, oB, yB, depth, color, material, extra)
	local run, climb = oB - oA, yB - yA
	local angle = math.atan2(climb, run)
	local thickness = depth * math.cos(angle)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Size = Vector3.new(math.abs(x1 - x0), thickness, math.sqrt(run * run + climb * climb))
	props.CFrame = at(seg, (x0 + x1) / 2, (yA + yB) / 2 - thickness / 2 * math.cos(angle), (oA + oB) / 2 + thickness / 2 * math.sin(angle))
		* CFrame.Angles(angle, 0, 0)
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Part(ctx, props)
end

-- A WedgePart whose top rises from y0 at offset o0 to y0 + height at offset o1 (tall face at o1).
local function wedgeUp(ctx, seg, name, x0, x1, o0, o1, y0, height, color, material)
	return BuildUtil.Wedge(ctx, {
		Name = name,
		Size = Vector3.new(math.abs(x1 - x0), height, o1 - o0),
		CFrame = at(seg, (x0 + x1) / 2, y0 + height / 2, (o0 + o1) / 2) * TURN,
		Color = color,
		Material = material or Enum.Material.Concrete,
	})
end

-- The pieces of [-length/2, length/2] left after cutting out [c - half, c + half] for every c.
local function spans(length, cuts, half)
	local sorted = table.clone(cuts)
	table.sort(sorted)
	local list, from = {}, -length / 2
	for _, c in ipairs(sorted) do
		table.insert(list, { from, c - half })
		from = c + half
	end
	table.insert(list, { from, length / 2 })
	return list
end

-- Static text on a face. opts: Glow (LightInfluence 0), PixelsPerStud, Font
local function write(part, face, text, color, opts)
	opts = opts or {}
	local _, label = BuildUtil.SurfaceText(part, face, text, {
		LabelName = opts.Name or (part.Name .. "Text"),
		TextColor3 = color,
		PixelsPerStud = opts.PixelsPerStud or 20,
		LightInfluence = opts.Glow and 0 or 1,
		Font = opts.Font or Enum.Font.GothamBlack,
	})
	return label
end

--[[
	Labels side by side along a long band (a fascia board or a parapet). entries = list of
	{ text = "...", live = <LiveText kind or nil> }: every entry gets an equal slot. Live entries are
	screens (dark or team-colour background filled in, LightInfluence 0).
	opts: color, background, inset (fraction of a slot left empty at both ends), height (fraction),
	glow (default true: static text glows too; false = painted text, lit like the band)
]]
local function bandLabels(part, face, entries, opts)
	local count = #entries
	local inset = opts.inset or 0.06
	local height = opts.height or 0.8
	for index, entry in ipairs(entries) do
		local label
		if entry.live then
			local _, liveLabel = BuildUtil.LiveText(part, face, entry.live, {
				LabelName = "Live_" .. entry.live .. index,
				Text = entry.text,
				TextColor3 = opts.color,
				BackgroundColor3 = opts.background,
				BackgroundTransparency = 0,
				LightInfluence = 0,
				PixelsPerStud = 10,
				Font = Enum.Font.GothamBlack,
			})
			label = liveLabel
		else
			label = write(
				part,
				face,
				entry.text,
				opts.color,
				{ Name = part.Name .. "Text" .. index, Glow = opts.glow ~= false, PixelsPerStud = 10 }
			)
		end
		local slot = 1 / count
		label.Position = UDim2.new((index - 1 + inset) * slot, 0, (1 - height) / 2, 0)
		label.Size = UDim2.new((1 - 2 * inset) * slot, 0, height, 0)
	end
end

---------------------------------------------------------------------------------------------
-- Tier geometry
---------------------------------------------------------------------------------------------

-- Numbers of the upper tier (all from Config.Layout.Bowl + Bowl.lua).
local function upperGeometry(L)
	local B = L.Bowl
	local tier = B.Tiers.upper
	local V = Bowl.Vomitory
	local U = {
		rows = tier.Rows,
		start = tier.StartOffset, -- 80
		first = tier.FirstHeight, -- 70
		depth = B.Depth,
		rise = B.Rise,
		slope = B.Rise / B.Depth,
		cross = V.FirstRow - 1, -- row 3: the cross-aisle
		concourseIn = B.UpperConcourse.Inner, -- 116
		ringCeiling = B.ClubRing.Ceiling, -- 66
	}
	U.finish = U.start + U.rows * U.depth -- 152
	U.top = U.first + (U.rows - 1) * U.rise -- 104 (the top row)
	U.floorY = Bowl.Row(L, "upper", U.cross).top -- 74: cross-aisle + vomitory floor
	U.trenchIn = Bowl.Row(L, "upper", V.FirstRow).inner -- 92
	U.trenchOut = Bowl.Row(L, "upper", V.LastRow).outer -- 112
	local covered = Bowl.Row(L, "upper", V.LastRow + 1)
	U.tunnelOut = covered.outer -- 116: the upper concourse
	U.tunnelTop = covered.top - ROW_T -- 84: underside of the row over the tunnel
	U.fasciaBottom = U.ringCeiling + 0.2 -- 66.2
	-- the upper concourse's outer wall (Concourse.lua, offsets 151..152) stops at its ceiling top,
	-- 85.8; the rear fascia closes the back of the deck from there up to the top row
	U.rearBottom = B.UpperConcourse.Ceiling - 0.2
	return U
end

-- The line through the front-bottom corners of the upper row slabs.
local function soffitY(U, o)
	return U.first - ROW_T + U.slope * (o - U.start)
end

-- The line through the stairs' nosings (front-top corners of the rows) of a tier.
local function nosingY(L, tierName, o)
	local B = L.Bowl
	local tier = B.Tiers[tierName]
	return tier.FirstHeight + B.Rise / B.Depth * (o - tier.StartOffset)
end

local function isVomitoryRow(row)
	return row >= Bowl.Vomitory.FirstRow and row <= Bowl.Vomitory.LastRow
end

-- Seats/rows stop inside the vomitory walls (the walls stand 4..4.8 off the vomitory centre).
local function vomitoryCut()
	return Bowl.Vomitory.Width / 2 + WALL / 2
end

-- "SECTIONS 301-304" for vomitory `index` of a segment (numbered in LOOP order, like the portals
-- Concourse.lua puts on the concourse side).
local function vomitoryTitle(segName, index)
	local number = 300
	for _, name in ipairs(LOOP) do
		for i = 1, #Bowl.Vomitories(kindOf(name)) do
			if name == segName and i == index then
				return ("SECTIONS %d-%d"):format(number + 1, number + 4)
			end
			number += 4
		end
	end
	return "UPPER DECK"
end

-- The two club sections on either side of the aisle at `aisleX` of a segment (200s, LOOP order).
local function clubSections(L, segName, aisleX)
	local tier = L.Bowl.Tiers.club
	local number = 200
	for _, name in ipairs(LOOP) do
		local s = Bowl.Segment(L, name, tier.StartOffset, tier.StartOffset + L.Bowl.Depth)
		local aisles = Bowl.Aisles(L, s.kind, s.innerLength)
		if name == segName then
			for i, x in ipairs(aisles) do
				if x == aisleX then
					return number + i, number + i + 1
				end
			end
		end
		number += #aisles + 1
	end
	return number + 1, number + 2
end

---------------------------------------------------------------------------------------------
-- Aisles (both tiers)
---------------------------------------------------------------------------------------------

-- For every aisle position of a segment: the set of rows it runs through (Bowl.Gaps uses each
-- row's own inner length, so the long upper rows get extra aisles near the ends of the sides).
local function aisleRows(L, seg, tierName)
	local tier = L.Bowl.Tiers[tierName]
	local rowsOf, order = {}, {}
	for row = 1, tier.Rows do
		local r = Bowl.Row(L, tierName, row)
		for _, x in ipairs(Bowl.Aisles(L, seg.kind, lengthAt(seg, r.inner))) do
			if not rowsOf[x] then
				rowsOf[x] = {}
				table.insert(order, x)
			end
			rowsOf[x][row] = true
		end
	end
	table.sort(order)
	return rowsOf, order
end

--[[
	Stair aisles: a light concrete step on the back half of every row the aisle runs through (1 stud
	up, 2 deep), so walking up goes row top -> step -> next row top. The steps cover the seat strips
	inside the aisle. topLanding adds a step on the top row too (club: it covers the top row's seats
	where the aisle meets the club ring floor). carpet = true lays the club's carpet on the steps
	instead of bare concrete. Returns rowsOf, order (see aisleRows).
]]
local function stairAisles(ctx, seg, tierName, topLanding, carpet)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local tier = L.Bowl.Tiers[tierName]
	local color = carpet and CLUB_CARPET or C.Walkway
	local material = carpet and Enum.Material.Carpet or Enum.Material.Concrete
	local half = L.Bowl.AisleWidth / 2
	local rowsOf, order = aisleRows(L, seg, tierName)
	for _, x in ipairs(order) do
		local rows = rowsOf[x]
		for row = 1, tier.Rows do
			local last = row == tier.Rows
			if rows[row] and (rows[row + 1] or (last and topLanding)) then
				local r = Bowl.Row(L, tierName, row)
				block(
					ctx,
					seg,
					last and "AisleLanding" or "AisleStep",
					x - half,
					x + half,
					r.top,
					r.top + STEP,
					r.inner + L.Bowl.Depth / 2,
					r.outer,
					color,
					material
				)
			end
		end
	end
	return rowsOf, order
end

-- Paints yellow step nosings on the top face of a ramp: `count` + 1 evenly spaced stripes from one
-- end to the other (the same set of positions whichever way round the face is drawn).
local function paintNosings(part, count)
	local gui = Instance.new("SurfaceGui")
	gui.Name = "NosingsGui"
	gui.Face = Enum.NormalId.Top
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 8
	gui.LightInfluence = 1
	gui.Parent = part
	local stripe = 0.35 / part.Size.Z
	for index = 0, count do
		local frame = Instance.new("Frame")
		frame.Name = "Nosing" .. index
		frame.BorderSizePixel = 0
		frame.BackgroundColor3 = NOSING
		frame.Size = UDim2.new(1, 0, stripe, 0)
		frame.Position = UDim2.new(0, 0, math.clamp(index / count - stripe / 2, 0, 1 - stripe), 0)
		frame.Parent = gui
	end
end

-- Ramped aisles (upper ends + corners): one sloped slab per aisle from the front of row 1 to the
-- front of the top row, 0.2 above the nosings (its underside runs through the rows), with painted
-- nosings. Walkable both ways; it covers the seat strips inside the aisle.
local function rampAisles(ctx, seg, U)
	local L = ctx.config.Layout
	local half = L.Bowl.AisleWidth / 2
	local _, order = aisleRows(L, seg, "upper")
	-- two pieces, split at the upper concourse's inner edge (a row front), so neither one's bounding
	-- box reaches down into the concourse's walking lane
	local pieces = { { U.start, U.concourseIn }, { U.concourseIn, U.finish - U.depth } }
	for _, x in ipairs(order) do
		for _, piece in ipairs(pieces) do
			local oA, oB = piece[1], piece[2]
			local ramp = incline(
				ctx,
				seg,
				"AisleRamp",
				x - half,
				x + half,
				oA,
				nosingY(L, "upper", oA) + 0.2,
				oB,
				nosingY(L, "upper", oB) + 0.2,
				ROW_T + 0.2,
				RAMP_COLOR,
				Enum.Material.Concrete
			)
			paintNosings(ramp, math.floor((oB - oA) / U.depth + 0.5))
		end
	end
end

-- Metal handrails beside the upper aisles that reach the top row (on the side away from the
-- segment's middle), from row 4 (above the cross-aisle, which stays free to walk along), or from the
-- aisle's first row for the short aisles near the ends of the sides, to the top row.
local function handrails(ctx, seg, U, rowsOf, order)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local half = L.Bowl.AisleWidth / 2
	local oB = U.finish - U.depth - 0.4
	local function railY(o)
		return nosingY(L, "upper", o) + RAIL_HEIGHT
	end
	for _, x in ipairs(order) do
		local rows = rowsOf[x]
		if rows[U.rows] then
			local first = 1
			while not rows[first] do
				first += 1
			end
			local oA = math.max(U.trenchIn, Bowl.Row(L, "upper", first).inner) + 0.5
			local rx = x + (x >= 0 and 1 or -1) * (half + 0.05)
			-- (split at the concourse's inner edge: see rampAisles)
			local pieces = { { oA, U.concourseIn }, { U.concourseIn, oB } }
			if oA >= U.concourseIn then
				pieces = { { oA, oB } }
			end
			for _, piece in ipairs(pieces) do
				incline(
					ctx,
					seg,
					"Handrail",
					rx - 0.125,
					rx + 0.125,
					piece[1],
					railY(piece[1]),
					piece[2],
					railY(piece[2]),
					0.28,
					C.Metal,
					Enum.Material.Metal
				)
			end
			for _, o in ipairs({ oA + 0.3, oB - 0.3 }) do
				local row = math.floor((o - U.start) / U.depth) + 1
				local base = Bowl.Row(L, "upper", row).top
				block(ctx, seg, "HandrailPost", rx - 0.125, rx + 0.125, base, railY(o), o - 0.125, o + 0.125, C.Metal, Enum.Material.Metal)
			end
		end
	end
end

---------------------------------------------------------------------------------------------
-- Upper deck parts
---------------------------------------------------------------------------------------------

-- Step "Upper Rows": the raked rows (cut at the vomitories) and the front fascia over the club ring.
local function upperRows(ctx, seg, U)
	local L = ctx.config.Layout
	local cuts = Bowl.Vomitories(seg.kind)
	for row = 1, U.rows do
		local r = Bowl.Row(L, "upper", row)
		-- (the cross-aisle has the vomitory floor's colour: it reads as the walkway it is)
		local color = row == U.cross and FLOOR_COLOR or (row % 2 == 1 and ROW_LIGHT or ROW_DARK)
		local rowCuts = isVomitoryRow(row) and cuts or {}
		for _, piece in ipairs(spans(lengthAt(seg, r.outer), rowCuts, vomitoryCut())) do
			block(
				ctx,
				seg,
				"UpperRow" .. row,
				piece[1],
				piece[2],
				r.top - ROW_T + seg.sink,
				r.top - seg.sink,
				r.inner,
				r.outer,
				color,
				Enum.Material.Concrete
			)
		end
	end
	local length = lengthAt(seg, U.start) + 0.4
	block(
		ctx,
		seg,
		"UpperFascia",
		-length / 2,
		length / 2,
		U.fasciaBottom + seg.sink,
		U.first - seg.sink,
		U.start - FASCIA_IN,
		U.start,
		FASCIA_COLOR,
		Enum.Material.Concrete
	)
end

-- Raker beams (+ columns down to the ground) under the deck at the given segment x positions;
-- withRear adds the rear raker + column over the upper concourse (sides only, see the header).
local function upperStructure(ctx, seg, U, rakers, withRear, withColumns)
	for _, x in ipairs(rakers) do
		local x0, x1 = x - BEAM / 2, x + BEAM / 2
		-- front raker: over the club ring (bottom >= 66) to the upper concourse's inner edge
		-- (its slanted end face stops at the concourse's inner wall)
		local oA, oB = U.start + FASCIA_IN, U.concourseIn - 0.9
		incline(ctx, seg, "RakerBeam", x0, x1, oA, soffitY(U, oA), oB, soffitY(U, oB), BEAM_DEPTH, STRUCTURE, Enum.Material.Concrete)
		if withColumns then
			block(
				ctx,
				seg,
				"DeckColumn",
				x0 + COLUMN_INSET,
				x1 - COLUMN_INSET,
				0,
				soffitY(U, FRONT_COLUMN + BEAM) - BEAM_DEPTH + 0.2,
				FRONT_COLUMN,
				FRONT_COLUMN + BEAM,
				STRUCTURE,
				Enum.Material.Concrete
			)
		end
		if withRear then
			-- rear raker: over the upper concourse, from where its bottom clears y 86
			local rA, rB = U.concourseIn + BEAM_DEPTH / U.slope, U.finish - 1
			incline(ctx, seg, "RakerBeam", x0, x1, rA, soffitY(U, rA), rB, soffitY(U, rB), BEAM_DEPTH, STRUCTURE, Enum.Material.Concrete)
			block(
				ctx,
				seg,
				"DeckColumn",
				x0 + COLUMN_INSET,
				x1 - COLUMN_INSET,
				0,
				soffitY(U, REAR_COLUMN + BEAM) - BEAM_DEPTH + 0.2,
				REAR_COLUMN,
				REAR_COLUMN + BEAM,
				STRUCTURE,
				Enum.Material.Concrete
			)
		end
	end
end

-- Step "Upper Rows": a vomitory at segment x = v: floor, side walls (sloped tops one stud above the
-- back of every row), the tunnel walls under the covered row, a header over the tunnel mouth and a
-- lit light strip in the tunnel ceiling.
local function vomitoryShell(ctx, seg, U, v)
	local half = Bowl.Vomitory.Width / 2
	block(
		ctx,
		seg,
		"VomitoryFloor",
		v - half,
		v + half,
		U.floorY - 1.4,
		U.floorY,
		U.trenchIn,
		U.tunnelOut,
		FLOOR_COLOR,
		Enum.Material.Concrete
	)
	local climb = (U.trenchOut - U.trenchIn) * U.slope
	for _, side in ipairs({ -1, 1 }) do
		local x0, x1 = v + side * half, v + side * (half + WALL)
		-- (the wall's foot, the stud above the floor, is a team-colour band all the way in)
		block(
			ctx,
			seg,
			"VomitoryWall",
			x0,
			x1,
			U.floorY - 2,
			U.floorY + 1,
			U.trenchIn,
			U.tunnelOut,
			ctx.colors.Primary,
			Enum.Material.Concrete
		)
		wedgeUp(ctx, seg, "VomitoryWallTop", x0, x1, U.trenchIn, U.trenchOut, U.floorY + 1, climb, WALL_COLOR)
		block(ctx, seg, "TunnelWall", x0, x1, U.floorY + 1, U.tunnelTop, U.trenchOut, U.tunnelOut, WALL_COLOR, Enum.Material.Concrete)
	end
	block(
		ctx,
		seg,
		"VomitoryHeader",
		v - half,
		v + half,
		U.tunnelTop - 2,
		U.tunnelTop + ROW_T,
		U.trenchOut - 0.5,
		U.trenchOut,
		ctx.colors.Primary,
		Enum.Material.Concrete
	)
	local lamp = block(
		ctx,
		seg,
		"TunnelLight",
		v - 1.5,
		v + 1.5,
		U.tunnelTop - 0.25,
		U.tunnelTop,
		U.trenchOut + 0.6,
		U.tunnelOut - 0.6,
		LAMP,
		Enum.Material.Neon,
		NO_COLLIDE
	)
	BuildUtil.Light(lamp, "PointLight", { Range = 16, Brightness = 1.4, Color = LIGHT_COLOR, Shadows = false })
end

-- Step "Aisles & Railings": railings on the vomitory walls + the lit SECTION sign over the tunnel.
local function vomitoryFinish(ctx, seg, U, v, title, fact)
	local C = ctx.config.Colors
	local half = Bowl.Vomitory.Width / 2
	local function wallTop(o)
		return U.floorY + 1 + U.slope * (o - U.trenchIn)
	end
	for _, side in ipairs({ -1, 1 }) do
		local rx = v + side * (half + WALL / 2)
		local oA, oB = U.trenchIn + 0.3, U.trenchOut - 0.3
		incline(
			ctx,
			seg,
			"VomitoryRail",
			rx - 0.15,
			rx + 0.15,
			oA,
			wallTop(oA) + 2.4,
			oB,
			wallTop(oB) + 2.4,
			0.3,
			C.Metal,
			Enum.Material.Metal
		)
		for _, o in ipairs({ oA + 0.2, oB - 0.2 }) do
			block(
				ctx,
				seg,
				"VomitoryRailPost",
				rx - 0.12,
				rx + 0.12,
				wallTop(o) - 0.3,
				wallTop(o) + 2.3,
				o - 0.12,
				o + 0.12,
				C.Metal,
				Enum.Material.Metal
			)
		end
	end
	local sign = block(
		ctx,
		seg,
		"SectionSign",
		v - half + 0.4,
		v + half - 0.4,
		U.tunnelTop - 1.7,
		U.tunnelTop + 1.6,
		U.trenchOut - 0.7,
		U.trenchOut - 0.5,
		PLAQUE_DARK,
		nil,
		NO_COLLIDE
	)
	write(sign, TOWARD_FIELD, title, WHITE, { Glow = true })
	BuildUtil.Look(sign, "Upper Deck - " .. title:sub(1, 1) .. title:sub(2):lower(), fact, { At = Vector3.new(0, -5.5, 0) })
	-- a trim frame round the tunnel mouth: down both walls and under the header (paint-thin)
	local trim = ctx.colors.Trim
	for _, side in ipairs({ -1, 1 }) do
		local x0, x1 = v + side * (half - 0.15), v + side * half
		block(ctx, seg, "VomitoryTrim", x0, x1, U.floorY, U.tunnelTop - 2, U.trenchOut - 0.8, U.trenchOut, trim, nil, NO_COLLIDE)
	end
	block(
		ctx,
		seg,
		"VomitoryTrim",
		v - half,
		v + half,
		U.tunnelTop - 2.4,
		U.tunnelTop - 2,
		U.trenchOut - 0.8,
		U.trenchOut,
		trim,
		nil,
		NO_COLLIDE
	)
end

-- Step "Seats": a seat strip at the back of every row but the cross-aisle (cut at the vomitories);
-- the top row's strip leaves room for the rear parapet.
local function upperSeats(ctx, seg, U)
	local L = ctx.config.Layout
	local cuts = Bowl.Vomitories(seg.kind)
	for row = 1, U.rows do
		if row ~= U.cross then
			local r = Bowl.Row(L, "upper", row)
			-- (the top row's strip is shallower: the parapet takes the back of the row)
			local o1 = row == U.rows and r.outer - PARAPET or r.outer
			local depth = row == U.rows and TOP_STRIP or SEAT_STRIP
			local rowCuts = isVomitoryRow(row) and cuts or {}
			for _, piece in ipairs(spans(lengthAt(seg, r.outer), rowCuts, vomitoryCut())) do
				block(
					ctx,
					seg,
					"UpperSeats" .. row,
					piece[1],
					piece[2],
					r.top - seg.sink,
					r.top + SEAT_HEIGHT - seg.sink,
					o1 - depth,
					o1,
					ctx.colors.Primary,
					Enum.Material.SmoothPlastic
				)
			end
		end
	end
end

-- A TV camera seat on the top row at the head of the aisle at segment x (the highest seat in the house).
local function cameraSeat(ctx, seg, U, x)
	local L = ctx.config.Layout
	local r = Bowl.Row(L, "upper", U.rows)
	local o = r.outer - PARAPET - TOP_STRIP - 0.8 -- 0.8 in front of the top row's seat strip
	-- (the eye moves a little toward the segment's middle, away from the aisle's handrail)
	local eye = at(seg, x - (x >= 0 and 1.5 or -1.5), r.top + 5.5, o - 1.5).Position
	return BuildUtil.Seat(ctx, {
		Name = "UpperDeckCamSeat",
		Size = Vector3.new(2, 1, 1.6),
		CFrame = at(seg, x, r.top + 0.5, o) * TURN,
		Color = ctx.colors.Secondary,
		Material = Enum.Material.Fabric,
		Object = "Upper Deck Seat",
		Camera = { From = eye, To = Vector3.new(0, 2, L.FieldCenterZ), Fov = 58, Label = "UPPER DECK" },
	})
end

-- Step "Aisles & Railings": the glass front rail on the fascia (with a metal cap on the sides).
local function frontRail(ctx, seg, U, withCap)
	local C = ctx.config.Colors
	local length = lengthAt(seg, U.start) + 0.6
	block(
		ctx,
		seg,
		"FrontGlassRail",
		-length / 2,
		length / 2,
		U.first,
		U.first + 3.4,
		U.start - 0.45,
		U.start - 0.15,
		C.Glass,
		Enum.Material.Glass,
		GLASS
	)
	if withCap then
		block(
			ctx,
			seg,
			"FrontRailCap",
			-length / 2,
			length / 2,
			U.first + 3.4,
			U.first + 3.7,
			U.start - 0.55,
			U.start - 0.05,
			C.Metal,
			Enum.Material.Metal
		)
	end
end

--[[
	Step "Aisles & Railings" (sides): an accessible-seating bay on the cross-aisle at segment x, right
	behind its glass rail: two painted wheelchair spaces (look) and two slim companion chairs (seats
	with a view of the field). Everything stays within 1.9 of the rail, so 2.1 of the 4-deep
	cross-aisle stays free to walk along behind them.
]]
local function accessibleBay(ctx, seg, U, x)
	local L = ctx.config.Layout
	local r = Bowl.Row(L, "upper", U.cross)
	local o0 = r.inner + 0.4 -- (just behind the glass rail)
	-- (turned round: the lettering reads upright from the walkway behind)
	local spaces = BuildUtil.Part(ctx, {
		Name = "WheelchairSpaces",
		Size = Vector3.new(6, 0.06, 1.5),
		CFrame = at(seg, x - 1.6, r.top + 0.03, o0 + 0.75) * TURN,
		Color = ACCESS_BLUE,
		Material = Enum.Material.SmoothPlastic,
		CanCollide = false,
		CastShadow = false,
	})
	write(spaces, Enum.NormalId.Top, "WHEELCHAIR SPACES", WHITE, { PixelsPerStud = 24 })
	BuildUtil.Look(
		spaces,
		"Accessible Seating",
		"Wheelchair spaces with a great view of the field, right beside the tunnel to the concourse, and seats for friends and family next to them.",
		{ Distance = 12 }
	)
	for _, cx in ipairs({ x + 2.5, x + 4.5 }) do
		local eye = at(seg, cx, r.top + 4.5, o0 + 0.2).Position
		BuildUtil.Seat(ctx, {
			Name = "CompanionSeat",
			Size = Vector3.new(1.8, 0.8, 1.2),
			CFrame = at(seg, cx, r.top + 0.4, o0 + 0.6) * TURN,
			Color = ctx.colors.Primary,
			Material = Enum.Material.Fabric,
			Object = "Companion Seat",
			Camera = { From = eye, To = Vector3.new(0, 2, L.FieldCenterZ), Fov = 58, Label = "UPPER DECK" },
		})
		block(ctx, seg, "CompanionSeatBack", cx - 0.9, cx + 0.9, r.top, r.top + 2.4, o0 + 1.2, o0 + 1.45, CHAIR_DARK, Enum.Material.Metal)
	end
end

-- Step "Aisles & Railings" (sides): home-made fan banners hanging over the front glass rail, facing
-- the field (above the ribbon board, below the rail's cap: the front row still leans on the rail).
local function fanBanners(ctx, seg, U, texts)
	local team = ctx.colors
	local colors = { team.Secondary, WHITE, team.Trim, team.Secondary }
	for index, x in ipairs({ -104, -52, 52, 104 }) do
		local color = colors[(index - 1) % #colors + 1]
		local banner = block(
			ctx,
			seg,
			"FanBanner",
			x - 4.5,
			x + 4.5,
			U.first + 0.35,
			U.first + 3.3,
			U.start - FASCIA_IN - 0.1,
			U.start - FASCIA_IN + 0.02,
			color,
			Enum.Material.Fabric,
			NO_COLLIDE
		)
		write(banner, TOWARD_FIELD, texts[index], readable(color, team.Primary), { PixelsPerStud = 16 })
	end
end

-- Step "Aisles & Railings" (sides): a glass rail with a metal cap along the front edge of the
-- cross-aisle (upper row 3), open where the aisles come up from rows 1-2.
local function crossAisleRail(ctx, seg, U, rowsOf, order)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local r = Bowl.Row(L, "upper", U.cross)
	local gaps = {}
	for _, x in ipairs(order) do
		if rowsOf[x][U.cross - 1] or rowsOf[x][U.cross] then
			table.insert(gaps, x)
		end
	end
	for _, piece in ipairs(spans(lengthAt(seg, r.inner), gaps, L.Bowl.AisleWidth / 2 + 0.1)) do
		if piece[2] - piece[1] > 1 then
			block(
				ctx,
				seg,
				"CrossAisleGlass",
				piece[1],
				piece[2],
				r.top,
				r.top + 2.4,
				r.inner + 0.05,
				r.inner + 0.3,
				C.Glass,
				Enum.Material.Glass,
				GLASS
			)
			block(
				ctx,
				seg,
				"CrossAisleRailCap",
				piece[1],
				piece[2],
				r.top + 2.4,
				r.top + 2.7,
				r.inner,
				r.inner + 0.35,
				C.Metal,
				Enum.Material.Metal
			)
		end
	end
end

-- Step "Aisles & Railings" (corners): the RING OF HONOR on the front fascia, a team-colour band with
-- the franchise's two legends of this corner (look card: their stories and your championships).
local function ringOfHonor(ctx, seg, U, legends)
	local team = ctx.colors
	local length = lengthAt(seg, U.start) - 8
	local band = block(
		ctx,
		seg,
		"RingOfHonor",
		-length / 2,
		length / 2,
		U.fasciaBottom + 0.3,
		U.first - 0.3,
		U.start - FASCIA_IN - 0.25,
		U.start - FASCIA_IN - 0.05,
		team.Primary,
		nil,
		NO_COLLIDE
	)
	local ink = readable(team.Primary, team.Trim)
	bandLabels(
		band,
		TOWARD_FIELD,
		{ { text = legends[1][1] }, { text = "RING OF HONOR" }, { text = legends[2][1] } },
		{ color = ink, background = team.Primary, inset = 0.05, height = 0.7, glow = false }
	)
	-- painted pinstripes along its top and bottom edges
	local gui = band:FindFirstChildOfClass("SurfaceGui")
	for index, y in ipairs({ 0.03, 0.89 }) do
		local stripe = Instance.new("Frame")
		stripe.Name = "Pinstripe" .. index
		stripe.BorderSizePixel = 0
		stripe.BackgroundColor3 = ink
		stripe.Position = UDim2.new(0.01, 0, y, 0)
		stripe.Size = UDim2.new(0.98, 0, 0.08, 0)
		stripe.Parent = gui
	end
	BuildUtil.Look(
		band,
		"Ring of Honor",
		("The legends of the franchise: %s, and %s. Their numbers are retired, so nobody wears them again!"):format(
			legends[1][2],
			legends[2][2]
		),
		{ LookKey = "titles", Distance = 16 }
	)
	return band
end

--[[
	The back of the deck: a team-colour REAR FASCIA that closes it from the upper concourse's outer
	wall (y 85.8) up to the top row (it covers the top row's end face, 0.05 proud of it so the two
	never z-fight; the Exterior's facade at offsets 152..160 later stands right outside it) and the
	rear PARAPET on the top row: a team-colour band with a trim cap; full = glass + a metal rail on
	top as well. labels / outside = bandLabels entries for the field side / the outside (nil = none).
]]
local function parapet(ctx, seg, U, full, labels, outside)
	local C = ctx.config.Colors
	local team = ctx.colors
	local length = lengthAt(seg, U.finish)
	local o0 = U.finish - PARAPET
	local rear = block(
		ctx,
		seg,
		"RearFascia",
		-length / 2,
		length / 2,
		U.rearBottom,
		U.top - 0.05, -- (its top stays inside the top row, under the parapet)
		o0,
		U.finish + 0.05,
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	if outside then
		bandLabels(
			rear,
			AWAY_FROM_FIELD,
			outside,
			{ color = readable(team.Primary, team.Trim), background = team.Primary, inset = 0.18, height = 0.62 }
		)
	end
	local wall =
		block(ctx, seg, "RearParapet", -length / 2, length / 2, U.top, U.top + 3.6, o0, U.finish, team.Primary, Enum.Material.SmoothPlastic)
	block(
		ctx,
		seg,
		"RearParapetCap",
		-length / 2,
		length / 2,
		U.top + 3.6,
		U.top + 4,
		o0 - 0.2,
		U.finish,
		team.Trim,
		Enum.Material.SmoothPlastic
	)
	if full then
		block(
			ctx,
			seg,
			"RearGlassRail",
			-length / 2,
			length / 2,
			U.top + 4,
			U.top + 6.2,
			o0 + 0.25,
			o0 + 0.55,
			C.Glass,
			Enum.Material.Glass,
			GLASS
		)
		block(
			ctx,
			seg,
			"RearRailCap",
			-length / 2,
			length / 2,
			U.top + 6.2,
			U.top + 6.5,
			o0 + 0.15,
			o0 + 0.65,
			C.Metal,
			Enum.Material.Metal
		)
	end
	if labels then
		bandLabels(
			wall,
			TOWARD_FIELD,
			labels,
			{ color = readable(team.Primary, team.Trim), background = team.Primary, inset = 0.1, height = 0.86 }
		)
	end
	return wall
end

-- An LED ribbon board on the front fascia (live screens side by side).
local function ribbon(ctx, seg, U, labels)
	local length = lengthAt(seg, U.start) - 8
	local board = block(
		ctx,
		seg,
		"RibbonBoard",
		-length / 2,
		length / 2,
		U.fasciaBottom + 0.3,
		U.first - 0.3,
		U.start - FASCIA_IN - 0.25,
		U.start - FASCIA_IN - 0.05,
		SCREEN_DARK,
		nil,
		NO_COLLIDE
	)
	bandLabels(board, TOWARD_FIELD, labels, { color = SCREEN_TEXT, background = SCREEN_DARK, inset = 0.04, height = 0.9 })
	return board
end

-- Step "Upper Rows" (sides): "stairs" between the top of a club aisle (segment x = clubX) and the
-- vomitory at x = v: a sign hanging under the front fascia + a panel on the vomitory wall.
local function stairsLink(ctx, seg, U, clubX, v)
	local L = ctx.config.Layout
	local club = Bowl.Row(L, "club", L.Bowl.Tiers.club.Rows)
	local sign = block(
		ctx,
		seg,
		"StairsUpSign",
		clubX - 3,
		clubX + 3,
		U.fasciaBottom - 4.6,
		U.fasciaBottom,
		U.start - 0.55,
		U.start - 0.25,
		PLAQUE_DARK,
		nil,
		NO_COLLIDE
	)
	write(sign, TOWARD_FIELD, "UPPER DECK STAIRS", WHITE, { Glow = true })
	write(sign, AWAY_FROM_FIELD, "UPPER DECK STAIRS", WHITE, { Glow = true, Name = "StairsUpSignBack" })
	local arrival = at(seg, v, U.floorY, (U.trenchIn + U.trenchOut) / 2 - 4) * TURN
	BuildUtil.Elevator(ctx, sign, arrival, {
		Action = "Take the stairs",
		Object = "Upper Deck",
		Label = "UPPER DECK",
		At = Vector3.new(0, -5.5, 0),
	})
	local half = Bowl.Vomitory.Width / 2
	local panel = block(
		ctx,
		seg,
		"StairsDownSign",
		v + half - 0.2,
		v + half,
		U.floorY + 1.6,
		U.floorY + 3.8,
		U.trenchIn + 8,
		U.trenchIn + 11,
		PLAQUE_DARK,
		nil,
		NO_COLLIDE
	)
	write(panel, Enum.NormalId.Left, "STAIRS TO CLUB LEVEL", WHITE, { Glow = true })
	local back = at(seg, clubX, club.top, club.inner + 0.7) * TURN
	BuildUtil.Elevator(ctx, panel, back, {
		Action = "Take the stairs",
		Object = "Club Level",
		Label = "CLUB LEVEL",
	})
end

---------------------------------------------------------------------------------------------
-- Club tier parts
---------------------------------------------------------------------------------------------

local function clubRows(ctx, seg)
	local L = ctx.config.Layout
	for row = 1, L.Bowl.Tiers.club.Rows do
		local r = Bowl.Row(L, "club", row)
		local length = lengthAt(seg, r.outer)
		block(
			ctx,
			seg,
			"ClubRow" .. row,
			-length / 2,
			length / 2,
			r.top - ROW_T + seg.sink,
			r.top - seg.sink,
			r.inner,
			r.outer,
			row % 2 == 1 and CLUB_LIGHT or CLUB_DARK,
			Enum.Material.Concrete
		)
	end
end

-- Padded seats: a cushion (Secondary) in front of a backrest (Primary) at the back of every row.
-- Both stay below the aisle steps (1 stud), which cover them inside the aisles.
local function clubSeats(ctx, seg)
	local L = ctx.config.Layout
	local team = ctx.colors
	for row = 1, L.Bowl.Tiers.club.Rows do
		local r = Bowl.Row(L, "club", row)
		local length = lengthAt(seg, r.outer)
		block(
			ctx,
			seg,
			"ClubCushions" .. row,
			-length / 2,
			length / 2,
			r.top - seg.sink,
			r.top + 0.45 - seg.sink,
			r.outer - 1.9,
			r.outer - 0.8,
			team.Secondary,
			Enum.Material.Fabric
		)
		block(
			ctx,
			seg,
			"ClubSeatBacks" .. row,
			-length / 2,
			length / 2,
			r.top - seg.sink,
			r.top + 0.9 - seg.sink,
			r.outer - 0.8,
			r.outer,
			team.Primary,
			Enum.Material.Fabric
		)
	end
end

-- A padded front-row club seat at the foot of the aisle at segment x (fans never sit in aisles),
-- with a TV view of the field.
local function clubCameraSeat(ctx, seg, x)
	local L = ctx.config.Layout
	local tier = L.Bowl.Tiers.club
	local o = tier.StartOffset + 1.25 -- 0.5..2.0 behind the front edge, in front of the first step
	return BuildUtil.Seat(ctx, {
		Name = "ClubCamSeat",
		Size = Vector3.new(2, 1, 1.5),
		CFrame = at(seg, x, tier.FirstHeight + 0.5, o) * TURN,
		Color = ctx.colors.Secondary,
		Material = Enum.Material.Fabric,
		Object = "Club Seat",
		Camera = {
			From = at(seg, x, tier.FirstHeight + 5, o - 2).Position,
			To = Vector3.new(0, 2, L.FieldCenterZ),
			Fov = 55,
			Label = "CLUB SEATS",
		},
	})
end

-- The glass rail along the front of the club seats, with a metal drink ledge on top.
local function clubGlass(ctx, seg)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local tier = L.Bowl.Tiers.club
	local length = lengthAt(seg, tier.StartOffset) + 0.4
	block(
		ctx,
		seg,
		"ClubGlassRail",
		-length / 2,
		length / 2,
		tier.FirstHeight,
		tier.FirstHeight + 3.4,
		tier.StartOffset + 0.1,
		tier.StartOffset + 0.4,
		C.Glass,
		Enum.Material.Glass,
		GLASS
	)
	block(
		ctx,
		seg,
		"ClubDrinkLedge",
		-length / 2,
		length / 2,
		tier.FirstHeight + 3.4 + seg.sink,
		tier.FirstHeight + 3.7 - seg.sink,
		tier.StartOffset - 0.05,
		tier.StartOffset + 0.55,
		C.Metal,
		Enum.Material.Metal
	)
end

-- A metal handrail up every club aisle (on the side away from the segment's middle): from the top
-- of the glass rail at the front to the top row, with a post at its top end.
local function clubRails(ctx, seg, rowsOf, order)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local tier = L.Bowl.Tiers.club
	local half = L.Bowl.AisleWidth / 2
	local oA = tier.StartOffset + 0.6
	local oB = Bowl.Row(L, "club", tier.Rows).inner - 0.2
	local function railY(o)
		return nosingY(L, "club", o) + CLUB_RAIL_HEIGHT
	end
	for _, x in ipairs(order) do
		local rows = rowsOf[x]
		if rows[1] and rows[tier.Rows] then
			local rx = x + (x >= 0 and 1 or -1) * (half + 0.05)
			incline(ctx, seg, "ClubHandrail", rx - 0.125, rx + 0.125, oA, railY(oA), oB, railY(oB), 0.28, C.Metal, Enum.Material.Metal)
			local o = oB - 0.3
			local base = Bowl.Row(L, "club", math.floor((o - tier.StartOffset) / L.Bowl.Depth) + 1).top
			block(ctx, seg, "ClubHandrailPost", rx - 0.125, rx + 0.125, base, railY(o), o - 0.125, o + 0.125, C.Metal, Enum.Material.Metal)
		end
	end
end

-- Club Signs: a "CLUB LEVEL" board on the front of the first row (live team name on the long ones)
-- and lit section plaques at the foot of the main aisles (+-26 on the sides and ends).
local function clubSigns(ctx, seg, factIndex)
	local L = ctx.config.Layout
	local team = ctx.colors
	local tier = L.Bowl.Tiers.club
	local start, first = tier.StartOffset, tier.FirstHeight
	local length = lengthAt(seg, start) - 0.6
	local board = block(
		ctx,
		seg,
		"ClubFasciaBoard",
		-length / 2,
		length / 2,
		first - ROW_T + 0.2,
		first - 0.15,
		start - 0.25,
		start - 0.05,
		team.Primary,
		nil,
		NO_COLLIDE
	)
	local name = displayName(ctx)
	local entries
	if seg.kind == "side" then
		entries = {
			{ text = "CLUB LEVEL" },
			{ text = name, live = "team" },
			{ text = "CLUB LEVEL" },
			{ text = name, live = "team" },
			{ text = "CLUB LEVEL" },
		}
	elseif seg.kind == "end" then
		entries = { { text = "CLUB LEVEL" }, { text = name, live = "team" }, { text = "CLUB LEVEL" } }
	else
		entries = { { text = "CLUB" } }
	end
	bandLabels(
		board,
		TOWARD_FIELD,
		entries,
		{ color = readable(team.Primary, team.Trim), background = team.Primary, inset = 0.12, height = 0.9 }
	)
	local half = L.Bowl.AisleWidth / 2
	-- (the corners have one aisle, in their middle)
	local plaques = seg.kind == "corner" and { 0 } or { -L.Bowl.AisleFirst, L.Bowl.AisleFirst }
	for _, x in ipairs(plaques) do
		local a, b = clubSections(L, seg.name, x)
		local title = ("SECTIONS %d-%d"):format(a, b)
		local plaque = block(
			ctx,
			seg,
			"ClubSectionSign",
			x - half + 0.2,
			x + half - 0.2,
			first + 0.4,
			first + 2.6,
			start + 0.5,
			start + 0.7,
			PLAQUE_DARK,
			nil,
			NO_COLLIDE
		)
		write(plaque, AWAY_FROM_FIELD, "CLUB " .. a .. "-" .. b, WHITE, { Glow = true })
		BuildUtil.Look(plaque, "Club Seats - " .. title:sub(1, 1) .. title:sub(2):lower(), CLUB_FACTS[(factIndex - 1) % #CLUB_FACTS + 1])
		factIndex += 1
	end
	return factIndex
end

---------------------------------------------------------------------------------------------
-- Pieces
---------------------------------------------------------------------------------------------

function M.club_seats(ctx)
	local L = ctx.config.Layout
	local segs = {}
	for _, name in ipairs(LOOP) do
		table.insert(segs, segment(L, name))
	end

	-- 1 CLUB ROWS
	BuildUtil.Stage(ctx, 1)
	for _, seg in ipairs(segs) do
		clubRows(ctx, seg)
	end

	-- 2 PADDED SEATS
	BuildUtil.Stage(ctx, 2)
	for _, seg in ipairs(segs) do
		clubSeats(ctx, seg)
		if seg.kind == "side" then
			for _, x in ipairs({ -(L.Bowl.AisleFirst + L.Bowl.AisleSpacing), L.Bowl.AisleFirst + L.Bowl.AisleSpacing }) do
				clubCameraSeat(ctx, seg, x)
			end
		end
	end

	-- 3 AISLES & GLASS RAILS
	BuildUtil.Stage(ctx, 3)
	for _, seg in ipairs(segs) do
		local rowsOf, order = stairAisles(ctx, seg, "club", true, true)
		clubGlass(ctx, seg)
		clubRails(ctx, seg, rowsOf, order)
	end

	-- 4 CLUB SIGNS
	BuildUtil.Stage(ctx, 4)
	local factIndex = 1
	for _, seg in ipairs(segs) do
		factIndex = clubSigns(ctx, seg, factIndex)
	end
end

-- upper_home / upper_visitor: one straight side of the upper deck.
local function upperSide(ctx, name, firstFact, banners)
	local L = ctx.config.Layout
	local U = upperGeometry(L)
	local seg = segment(L, name)
	local voms = Bowl.Vomitories(seg.kind)
	local name0 = displayName(ctx)

	-- 1 UPPER ROWS
	BuildUtil.Stage(ctx, 1)
	upperRows(ctx, seg, U)
	upperStructure(ctx, seg, U, SIDE_RAKERS, true, true)
	for _, v in ipairs(voms) do
		vomitoryShell(ctx, seg, U, v)
	end
	stairsLink(ctx, seg, U, L.Bowl.AisleFirst + L.Bowl.AisleSpacing, voms[#voms])

	-- 2 SEATS
	BuildUtil.Stage(ctx, 2)
	upperSeats(ctx, seg, U)
	for _, x in ipairs({ -L.Bowl.AisleFirst, L.Bowl.AisleFirst }) do
		cameraSeat(ctx, seg, U, x)
	end

	-- 3 AISLES & RAILINGS
	BuildUtil.Stage(ctx, 3)
	local rowsOf, order = stairAisles(ctx, seg, "upper", false)
	handrails(ctx, seg, U, rowsOf, order)
	frontRail(ctx, seg, U, true)
	crossAisleRail(ctx, seg, U, rowsOf, order)
	fanBanners(ctx, seg, U, banners(name0))
	-- (between each vomitory and the next aisle out)
	for _, x in ipairs({ -64, 64 }) do
		accessibleBay(ctx, seg, U, x)
	end
	for index, v in ipairs(voms) do
		vomitoryFinish(ctx, seg, U, v, vomitoryTitle(name, index), UPPER_FACTS[firstFact + index - 1])
	end

	-- 4 FACADE
	BuildUtil.Stage(ctx, 4)
	parapet(
		ctx,
		seg,
		U,
		true,
		{ { text = "300 LEVEL" }, { text = name0, live = "team" }, { text = "300 LEVEL" } },
		{ { text = name0, live = "team" }, { text = "FOOTBALL" } }
	)
	local placeholder = name0 .. "  0 - 0  VISITORS"
	if name == "home" then
		ribbon(
			ctx,
			seg,
			U,
			{ { text = name0, live = "team" }, { text = placeholder, live = "score" }, { text = "GAME DAY", live = "gameday" } }
		)
	else
		ribbon(
			ctx,
			seg,
			U,
			{ { text = "GAME DAY", live = "gameday" }, { text = placeholder, live = "score" }, { text = name0, live = "team" } }
		)
	end
end

function M.upper_home(ctx)
	upperSide(ctx, "home", 1, function(team)
		return { "GO " .. team .. "!", "DEFENSE!", "HI MOM!", "WE ARE LOUD!" }
	end)
end

function M.upper_visitor(ctx)
	upperSide(ctx, "visitor", 3, function(team)
		return { "#1 FANS", "MAKE SOME NOISE!", "GO " .. team .. "!", "TOUCHDOWN TIME!" }
	end)
end

function M.upper_ends(ctx)
	local L = ctx.config.Layout
	local U = upperGeometry(L)
	local name0 = displayName(ctx)
	local ends = { segment(L, "west"), segment(L, "east") }
	local corners = {}
	for _, name in ipairs(Bowl.Corners) do
		table.insert(corners, segment(L, name))
	end
	local all = { ends[1], ends[2], corners[1], corners[2], corners[3], corners[4] }

	-- 1 END ROWS
	BuildUtil.Stage(ctx, 1)
	for _, seg in ipairs(ends) do
		upperRows(ctx, seg, U)
		upperStructure(ctx, seg, U, END_RAKERS, false, true)
		for _, v in ipairs(Bowl.Vomitories(seg.kind)) do
			vomitoryShell(ctx, seg, U, v)
		end
	end

	-- 2 CORNER ROWS
	BuildUtil.Stage(ctx, 2)
	for _, seg in ipairs(corners) do
		upperRows(ctx, seg, U)
		-- (no column down to the ground in the corners: the corner ramps of Exterior.lua live there)
		upperStructure(ctx, seg, U, CORNER_RAKERS, false, false)
	end

	-- 3 SEATS
	BuildUtil.Stage(ctx, 3)
	for _, seg in ipairs(all) do
		upperSeats(ctx, seg, U)
	end
	for _, seg in ipairs(ends) do
		cameraSeat(ctx, seg, U, L.Bowl.AisleFirst)
	end

	-- 4 AISLES & RAILINGS
	BuildUtil.Stage(ctx, 4)
	for _, seg in ipairs(all) do
		rampAisles(ctx, seg, U)
		handrails(ctx, seg, U, aisleRows(L, seg, "upper"))
		frontRail(ctx, seg, U, false)
		local teamLabel = seg.kind == "end" and { { text = name0, live = "team" } } or nil
		parapet(ctx, seg, U, false, teamLabel, teamLabel)
	end
	for _, seg in ipairs(corners) do
		ringOfHonor(ctx, seg, U, RING_OF_HONOR[seg.name])
	end
	for index, seg in ipairs(ends) do
		for vIndex, v in ipairs(Bowl.Vomitories(seg.kind)) do
			vomitoryFinish(ctx, seg, U, v, vomitoryTitle(seg.name, vIndex), UPPER_FACTS[4 + index + vIndex - 1])
		end
		ribbon(ctx, seg, U, { { text = name0 .. "  0 - 0  VISITORS", live = "score" } })
	end
end

return M
