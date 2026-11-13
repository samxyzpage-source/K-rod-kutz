--[[
	Bowl
	Geometry of the V5 stadium bowl (Config.Layout.Bowl), shared by the seating builders
	(Builders/Stands.lua, Builders/UpperDeck.lua) and the game-day crowd (Crowd.lua), so rows,
	aisles, tunnels and fans always line up.

	The bowl outline at OFFSET o (distance outward from the turf edge) is the turf rectangle
	(X +-SurfaceHalfX, Z SurfaceMinZ..SurfaceMaxZ) pushed out by o, with 45-degree corners whose lines
	pass through the turf corners at o = 0. So every row is an octagonal band made of 8 SEGMENTS:
	  sides   "visitor" (-Z, front) and "home" (+Z, back): along X
	  ends    "west" (-X) and "east" (+X): along Z
	  corners "corner_vw", "corner_ve", "corner_hw", "corner_he" (visitor/home x west/east): diagonal
	Straight segments get 2 * (sqrt(2) - 1) = 0.83 studs longer per stud of offset; corner segments
	grow from nothing at o = 0 to 0.83 * o.

	Segment tables (Bowl.Segments) use a CFrame on the band's CENTRE line at ground level (y = 0),
	in the middle of the segment, whose LookVector points OUTWARD (away from the field) and whose
	RightVector runs along the segment. In that frame: local X = along the segment, local -Z = outward,
	local +Z = toward the field, local Y = up.
]]

local Bowl = {}

local K = math.sqrt(2) - 1 -- how much each half of a straight segment grows per stud of offset

Bowl.Sides = { "visitor", "home", "west", "east" }
Bowl.Corners = { "corner_vw", "corner_ve", "corner_hw", "corner_he" }

-- Which piece (and from which step) owns the rows of each tier / segment.
Bowl.Pieces = {
	lower = {
		home = { "lower_home", 1 },
		visitor = { "lower_visitor", 1 },
		west = { "lower_ends", 1 },
		east = { "lower_ends", 2 },
		corners = { "lower_corners", 1 },
	},
	club = {
		home = { "club_seats", 1 },
		visitor = { "club_seats", 1 },
		west = { "club_seats", 1 },
		east = { "club_seats", 1 },
		corners = { "club_seats", 1 },
	},
	upper = {
		home = { "upper_home", 1 },
		visitor = { "upper_visitor", 1 },
		west = { "upper_ends", 1 },
		east = { "upper_ends", 1 },
		corners = { "upper_ends", 2 },
	},
}

-- The piece + step that builds the rows of `segmentName` in tier `tierName`.
function Bowl.Owner(tierName, segmentName)
	local tier = Bowl.Pieces[tierName]
	local entry = tier[segmentName] or tier.corners
	return entry[1], entry[2]
end

-- Row `row` (1-based) of a tier: { inner, outer, top, tier, row }
function Bowl.Row(layout, tierName, row)
	local B = layout.Bowl
	local tier = B.Tiers[tierName]
	local inner = tier.StartOffset + (row - 1) * B.Depth
	return {
		tier = tierName,
		row = row,
		inner = inner,
		outer = inner + B.Depth,
		top = tier.FirstHeight + (row - 1) * B.Rise,
	}
end

-- Half-length of a straight segment at offset o.
local function sideHalf(layout, o)
	return layout.SurfaceHalfX + K * o
end
local function endHalf(layout, o)
	return (layout.SurfaceMaxZ - layout.SurfaceMinZ) / 2 + K * o
end

-- Point on the centre line of a segment (y = 0) at offset o: the segment's middle.
local function frameAt(layout, name, o)
	local hx, z0, z1 = layout.SurfaceHalfX, layout.SurfaceMinZ, layout.SurfaceMaxZ
	local zc = (z0 + z1) / 2
	if name == "visitor" then
		return CFrame.new(0, 0, z0 - o)
	elseif name == "home" then
		return CFrame.new(0, 0, z1 + o) * CFrame.Angles(0, math.pi, 0)
	elseif name == "west" then
		return CFrame.new(-hx - o, 0, zc) * CFrame.Angles(0, math.pi / 2, 0)
	elseif name == "east" then
		return CFrame.new(hx + o, 0, zc) * CFrame.Angles(0, -math.pi / 2, 0)
	end
	local sx = (name == "corner_ve" or name == "corner_he") and 1 or -1
	local sz = (name == "corner_hw" or name == "corner_he") and 1 or -1
	local corner = Vector3.new(sx * hx, 0, sz > 0 and z1 or z0)
	local normal = Vector3.new(sx, 0, sz).Unit
	return CFrame.new(corner + normal * o) * CFrame.Angles(0, math.atan2(-sx, -sz), 0)
end

-- Length of a segment at offset o.
local function lengthAt(layout, name, o)
	if name == "visitor" or name == "home" then
		return 2 * sideHalf(layout, o)
	elseif name == "west" or name == "east" then
		return 2 * endHalf(layout, o)
	end
	return 2 * K * o
end

--[[
	The 8 segments of the band between offsets o1 and o2. Each:
	  name, kind ("side" | "end" | "corner"), cframe (centre line, see the header),
	  depth (= o2 - o1), innerLength (at o1), outerLength (at o2), midLength
	For a solid block use midLength (the small triangular gaps at the joints between a straight and
	a corner segment can be filled with wedges); for seats/fans stay inside innerLength.
]]
function Bowl.Segments(layout, o1, o2)
	local mid = (o1 + o2) / 2
	local list = {}
	for _, name in ipairs(Bowl.Sides) do
		table.insert(list, {
			name = name,
			kind = (name == "visitor" or name == "home") and "side" or "end",
			cframe = frameAt(layout, name, mid),
			depth = o2 - o1,
			innerLength = lengthAt(layout, name, o1),
			outerLength = lengthAt(layout, name, o2),
			midLength = lengthAt(layout, name, mid),
		})
	end
	for _, name in ipairs(Bowl.Corners) do
		table.insert(list, {
			name = name,
			kind = "corner",
			cframe = frameAt(layout, name, mid),
			depth = o2 - o1,
			innerLength = lengthAt(layout, name, o1),
			outerLength = lengthAt(layout, name, o2),
			midLength = lengthAt(layout, name, mid),
		})
	end
	return list
end

-- One segment (by name) of the band between o1 and o2.
function Bowl.Segment(layout, name, o1, o2)
	for _, segment in ipairs(Bowl.Segments(layout, o1, o2)) do
		if segment.name == name then
			return segment
		end
	end
	return nil
end

-- Positions (along the segment, from its middle) of the stair aisles of a segment whose usable
-- length is `length`. Straight segments: +-AisleFirst, +-(AisleFirst + AisleSpacing), ...
-- Corners: one aisle in the middle (when the corner is long enough).
function Bowl.Aisles(layout, kind, length)
	local B = layout.Bowl
	local list = {}
	if kind == "corner" then
		if length >= 10 then
			table.insert(list, 0)
		end
		return list
	end
	local x = B.AisleFirst
	while x < length / 2 - 6 do
		table.insert(list, -x)
		table.insert(list, x)
		x += B.AisleSpacing
	end
	table.sort(list)
	return list
end

-- Upper-deck vomitory centres (along the segment): +-52 on the sides, the middle of each end.
-- The vomitories cut upper rows Vomitory.FirstRow .. Vomitory.LastRow (open trenches) and run
-- under the rows behind them to the upper concourse.
Bowl.Vomitory = { Width = 8, FirstRow = 4, LastRow = 8 }
function Bowl.Vomitories(kind)
	if kind == "side" then
		return { -52, 52 }
	elseif kind == "end" then
		return { 0 }
	end
	return {}
end

-- Gaps along a row (list of { from, to } along the segment) that hold no seats: aisles, the
-- players' tunnels (low lower-bowl rows on both sidelines) and upper-deck vomitories.
function Bowl.Gaps(layout, rowInfo, segment, margin)
	local B = layout.Bowl
	margin = margin or 0
	local gaps = {}
	local function add(centre, halfWidth)
		table.insert(gaps, { centre - halfWidth - margin, centre + halfWidth + margin })
	end
	for _, x in ipairs(Bowl.Aisles(layout, segment.kind, segment.innerLength)) do
		add(x, B.AisleWidth / 2)
	end
	if rowInfo.tier == "lower" and segment.kind == "side" and rowInfo.row <= B.TunnelRows then
		add(0, B.TunnelHalfWidth + 0.8) -- (tunnel walls are up to 0.8 thick)
	end
	if rowInfo.tier == "upper" and rowInfo.row >= Bowl.Vomitory.FirstRow and rowInfo.row <= Bowl.Vomitory.LastRow then
		for _, x in ipairs(Bowl.Vomitories(segment.kind)) do
			add(x, Bowl.Vomitory.Width / 2 + 0.8)
		end
	end
	return gaps
end

local function inGap(x, gaps)
	for _, gap in ipairs(gaps) do
		if x >= gap[1] and x <= gap[2] then
			return true
		end
	end
	return false
end
Bowl.InGap = inGap

--[[
	Seat spots of one row of one segment: CFrames on the row's seating surface, toward the front of
	the row, facing the field. `spacing` = studs between seats (default 2.6).
	Returns a list of CFrames (plot-local).
]]
function Bowl.SeatSpots(layout, rowInfo, segmentName, spacing)
	spacing = spacing or 2.6
	if rowInfo.tier == "upper" and rowInfo.row == Bowl.Vomitory.FirstRow - 1 then
		return {} -- upper row 3 is the cross-aisle the vomitories open onto: no seats
	end
	local segment = Bowl.Segment(layout, segmentName, rowInfo.inner, rowInfo.outer)
	local usable = segment.innerLength - 3
	if usable < spacing then
		return {}
	end
	local gaps = Bowl.Gaps(layout, rowInfo, segment, 1.2)
	local count = math.floor(usable / spacing)
	local spots = {}
	for index = 0, count - 1 do
		local x = (index + 0.5 - count / 2) * spacing
		if not inGap(x, gaps) then
			-- 0.6 toward the field from the row's centre line, facing the field (+Z local)
			table.insert(spots, segment.cframe * CFrame.new(x, rowInfo.top, 0.6) * CFrame.Angles(0, math.pi, 0))
		end
	end
	return spots
end

-- All the bowl rows whose owning piece/step is in `owned` (a set of step ids).
-- Returns a list of { row = rowInfo, segment = name, visitor = bool }.
function Bowl.BuiltRows(layout, owned)
	local list = {}
	for tierName, tier in pairs(layout.Bowl.Tiers) do
		for _, segmentName in ipairs({ "visitor", "home", "west", "east", "corner_vw", "corner_ve", "corner_hw", "corner_he" }) do
			local pieceId, step = Bowl.Owner(tierName, segmentName)
			if owned[pieceId .. ":" .. step] then
				for row = 1, tier.Rows do
					table.insert(list, {
						row = Bowl.Row(layout, tierName, row),
						segment = segmentName,
						visitor = segmentName == "visitor" or segmentName == "corner_vw" or segmentName == "corner_ve",
					})
				end
			end
		end
	end
	table.sort(list, function(a, b)
		if a.row.tier ~= b.row.tier then
			return a.row.tier < b.row.tier
		end
		if a.segment ~= b.segment then
			return a.segment < b.segment
		end
		return a.row.row < b.row.row
	end)
	return list
end

return Bowl
