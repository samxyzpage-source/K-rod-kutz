--[[
	Stands
	The seating bowl. Bought piece by piece, it ends up as one continuous ring of seats around the
	turf (a full NFL-style bowl): every seating row r (1-6 lower, 7-12 upper) is a rectangular ring
	band around the field (see the full-bowl comment in Config.Layout).

	  bleachers_home       back lower sideline X[-120,120], split by the HOME tunnel (|x| < 14)
	  bleachers_visitor    front lower sideline X[-120,120], split by the players' tunnel
	  endzone_stands_*     lower ends behind the end zones, Z[-23,83]
	  corner_seats         the four lower corners that close the lower ring
	  upper_home           back upper sideline (with a bridge over the HOME tunnel)
	  upper_visitor        front upper sideline (with a bridge over the players' tunnel)
	  upper_bowl_ends      both upper ends + the four upper corners: closes the upper ring

	Straight stands are built in their own "stand space": a CFrame at ground level on the
	front-centre edge of the first row (the edge nearest the field) whose LookVector points AWAY
	from the field (the same StartCFrame BuildUtil.Rows uses). In stand space:
	  x  runs along the rows
	  y  is up (y = 0 is the plot surface)
	  d  is the distance away from the field (stand-local -Z): d = 0 is the field-side face of
	     row 1 and d = rows * RowDepth is the back wall of the stand.
	Faces: Enum.NormalId.Back faces the field, Enum.NormalId.Front faces away from it.

	The corners are L-shaped, so they are built straight from plot-local bounds instead. A corner
	is named by its signs (sx, sz): sx = 1 east (+X) / -1 west, sz = 1 back (+Z) / -1 front.
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)

local Stands = {}

local TOWARD_FIELD = Enum.NormalId.Back
local AWAY_FROM_FIELD = Enum.NormalId.Front
local TURN = CFrame.Angles(0, math.pi, 0) -- stands on the back (+Z) side look toward +Z

local FIELD_WALL_HEIGHT = 3.5
local FACADE_BOTTOM = 12.8 -- just above the seat strips on the lower bowl's top row
local FACADE_TOP = 17 -- one stud above the upper deck's first row (acts as its front parapet)
local GATE_DARK = Color3.fromRGB(28, 28, 34)
local TUNNEL_WALL_OVERHANG = 0.2 -- lower tunnel walls stick out this far past the lower bowl's back wall
local CLADDING = 0.3 -- concrete skin on the outside walls of the home upper deck and the upper ring

---------------------------------------------------------------------------------------------
-- Small helpers
---------------------------------------------------------------------------------------------

local function shade(color, factor)
	return Color3.new(math.clamp(color.R * factor, 0, 1), math.clamp(color.G * factor, 0, 1), math.clamp(color.B * factor, 0, 1))
end

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
	return Color3.fromRGB(250, 250, 250)
end

-- Stand space -> plot-local CFrame.
local function at(frame, x, y, d)
	return frame * CFrame.new(x, y, -d)
end

-- Block in stand space. size = (along the rows, height, depth); y and d are the centre.
local function standBox(ctx, frame, name, size, x, y, d, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Size = size
	props.CFrame = at(frame, x, y, d)
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Part(ctx, props)
end

-- Block in stand space running along the rows from stand x = x0 to x1 (either order).
local function standSpan(ctx, frame, name, x0, x1, height, y, depth, d, color, material, extra)
	return standBox(ctx, frame, name, Vector3.new(math.abs(x1 - x0), height, depth), (x0 + x1) / 2, y, d, color, material, extra)
end

-- Axis-aligned block between two plot-local corners (the bounds may come in either order).
local function boundsBox(ctx, name, x0, x1, y0, y1, z0, z1, color, material, extra)
	local minX, maxX = math.min(x0, x1), math.max(x0, x1)
	local minZ, maxZ = math.min(z0, z1), math.max(z0, z1)
	return BuildUtil.Box(
		ctx,
		name,
		Vector3.new(maxX - minX, y1 - y0, maxZ - minZ),
		Vector3.new((minX + maxX) / 2, (y0 + y1) / 2, (minZ + maxZ) / 2),
		color,
		material or Enum.Material.SmoothPlastic,
		extra
	)
end

local function addText(part, face, text, textColor, pixelsPerStud)
	return BuildUtil.SurfaceText(part, face, text, {
		LabelName = part.Name .. "Text",
		TextColor3 = textColor,
		PixelsPerStud = pixelsPerStud or 20,
		Font = Enum.Font.GothamBlack,
	})
end

-- The same text several times along a long band: ranges = { { from, to }, ... } are fractions of
-- the band's width (used to keep the text clear of things standing in front of the band).
local function addTextRanges(part, face, text, textColor, ranges)
	for index, range in ipairs(ranges) do
		local _, label = BuildUtil.SurfaceText(part, face, text, {
			LabelName = part.Name .. "Text" .. index,
			TextColor3 = textColor,
			PixelsPerStud = 12,
			Font = Enum.Font.GothamBlack,
		})
		label.Position = UDim2.new(range[1], 0, 0, 0)
		label.Size = UDim2.new(range[2] - range[1], 0, 1, 0)
	end
end

-- Stand frame of an end of the bowl at distance `x` from the centre line (side -1 west, 1 east):
-- rows step toward -X (west) or +X (east), stand x runs along Z.
local function endFrame(L, side, x)
	return CFrame.new(side * x, 0, L.FieldCenterZ) * CFrame.Angles(0, -side * math.pi / 2, 0)
end

-- Geometry of ring row r (1-12): inner/outer X half-width, inner/outer Z on the back and front
-- sides, and the height of the row's top.
local function ringRow(L, r)
	local inner = (r - 1) * L.RowDepth
	local outer = r * L.RowDepth
	local height
	if r <= L.LowerRows then
		height = r * L.RowRise
	else
		height = L.UpperStartHeight + (r - L.LowerRows - 1) * L.RowRise
	end
	return {
		xi = L.SurfaceHalfX + inner,
		xo = L.SurfaceHalfX + outer,
		backZi = L.SurfaceMaxZ + inner,
		backZo = L.SurfaceMaxZ + outer,
		frontZi = L.SurfaceMinZ - inner,
		frontZo = L.SurfaceMinZ - outer,
		height = height,
	}
end

---------------------------------------------------------------------------------------------
-- Stand pieces (all in stand space)
---------------------------------------------------------------------------------------------

-- The stepped seating itself.
local function seating(ctx, frame, spec)
	local L = ctx.config.Layout
	return BuildUtil.Rows(ctx, {
		Name = spec.name or "Row",
		StartCFrame = frame,
		Length = spec.length,
		Rows = spec.rows or L.LowerRows,
		FirstHeight = spec.firstHeight or L.RowRise,
		Colors = spec.rowColors,
		SeatColor = spec.seatColor,
		Material = Enum.Material.Concrete,
	})
end

-- Padded wall along the turf edge in front of the first row, with sign panels facing the field.
-- panels = { { x = <stand x>, width = <studs>, text = "...", color = <Color3?> }, ... }
local function fieldWall(ctx, frame, length, panels)
	local team = ctx.colors
	standBox(
		ctx,
		frame,
		"FieldWall",
		Vector3.new(length, FIELD_WALL_HEIGHT, 0.8),
		0,
		FIELD_WALL_HEIGHT / 2,
		-0.4,
		team.Primary,
		Enum.Material.Fabric
	)
	standBox(
		ctx,
		frame,
		"FieldWallCap",
		Vector3.new(length, 0.3, 1),
		0,
		FIELD_WALL_HEIGHT + 0.15,
		-0.4,
		team.Trim,
		Enum.Material.SmoothPlastic
	)
	for index, panel in ipairs(panels) do
		local background = panel.color or team.Secondary
		local sign = standBox(
			ctx,
			frame,
			"WallSign" .. index,
			Vector3.new(panel.width, 2.3, 0.2),
			panel.x,
			1.85,
			-0.9,
			background,
			Enum.Material.SmoothPlastic,
			{ CanCollide = false }
		)
		addText(sign, TOWARD_FIELD, panel.text, readable(background, team.Primary))
	end
end

-- Aisles: a light concrete ramp per aisle laid over the rows. Its top passes through the front
-- edge of every row (so it reads as a stair strip cutting through the seats) and players can
-- walk straight up it to the top row.
local function aisles(ctx, frame, xs, firstHeight, rows, color)
	local L = ctx.config.Layout
	local depth = (rows - 1) * L.RowDepth
	local rise = (rows - 1) * L.RowRise
	for _, x in ipairs(xs) do
		BuildUtil.Wedge(ctx, {
			Name = "Aisle",
			Size = Vector3.new(3, rise, depth),
			-- turned around so the slope climbs away from the field
			CFrame = at(frame, x, firstHeight + rise / 2, depth / 2) * CFrame.Angles(0, math.pi, 0),
			Color = color,
			Material = Enum.Material.Concrete,
		})
	end
end

-- Sloped side wall closing off the stepped end of a stand at stand x = `x`.
-- Its sloping top passes through the front edge of every row.
local function endCap(ctx, frame, x, firstHeight, rows, color)
	local L = ctx.config.Layout
	local depth = rows * L.RowDepth
	local slope = rows * L.RowRise
	-- 0.1 stud deeper than the rows at the back so the back faces don't z-fight
	standBox(ctx, frame, "EndCap", Vector3.new(1, firstHeight, depth + 0.2), x, firstHeight / 2, depth / 2, color, Enum.Material.Concrete)
	BuildUtil.Wedge(ctx, {
		Name = "EndCapSlope",
		Size = Vector3.new(1, slope, depth),
		-- turned around so the tall face is at the back of the stand and the slope runs down to the field
		CFrame = at(frame, x, firstHeight + slope / 2, depth / 2 + 0.1) * CFrame.Angles(0, math.pi, 0),
		Color = color,
		Material = Enum.Material.Concrete,
	})
end

-- Caps both (or some) ends of a stand of `length`. sides = list of -1 / 1.
local function endCaps(ctx, frame, length, sides, firstHeight, rows, color)
	for _, side in ipairs(sides) do
		-- 0.2 stud proud of the row ends so the faces are not coplanar (no z-fighting)
		endCap(ctx, frame, side * (length / 2 - 0.3), firstHeight, rows, color)
	end
end

-- Glass safety rail along the top back edge of a stand, from stand x = x0 to x1. It stands inside
-- the top row's seat strip (which ends flush with the back wall) so none of its faces are coplanar
-- with the strip's.
local function railSpan(ctx, frame, x0, x1, topHeight, depth)
	return standSpan(
		ctx,
		frame,
		"BackRail",
		x0,
		x1,
		1.6,
		topHeight + 0.8,
		0.25,
		depth - 0.45,
		ctx.config.Colors.Glass,
		Enum.Material.Glass,
		{ Transparency = 0.4 }
	)
end

local function backRail(ctx, frame, length, topHeight, depth)
	return railSpan(ctx, frame, -length / 2, length / 2, topHeight, depth)
end

-- A horizontal band on the outside (back) wall of a stand from stand x = x0 to x1.
-- `face` = d of the wall surface.
local function bandSpan(ctx, frame, x0, x1, bottom, height, face, color, name)
	return standSpan(
		ctx,
		frame,
		name or "BackBand",
		x0,
		x1,
		height,
		bottom + height / 2,
		0.3,
		face + 0.15,
		color,
		Enum.Material.SmoothPlastic,
		{ CanCollide = false }
	)
end

local function backBand(ctx, frame, length, bottom, height, face, color, name)
	return bandSpan(ctx, frame, -length / 2, length / 2, bottom, height, face, color, name)
end

-- A concourse gate on the outside (back) wall of a stand. `face` = d of the wall surface.
local function gate(ctx, frame, x, face, label)
	local team = ctx.colors
	standBox(
		ctx,
		frame,
		"GateOpening",
		Vector3.new(8, 8, 0.2),
		x,
		4,
		face + 0.1,
		GATE_DARK,
		Enum.Material.SmoothPlastic,
		{ CanCollide = false }
	)
	standBox(
		ctx,
		frame,
		"GateFrame",
		Vector3.new(9.2, 0.6, 0.3),
		x,
		8.3,
		face + 0.15,
		team.Trim,
		Enum.Material.SmoothPlastic,
		{ CanCollide = false }
	)
	local sign = standBox(ctx, frame, "GateSign", Vector3.new(9.2, 2.2, 0.4), x, 9.7, face + 0.2, team.Primary, Enum.Material.SmoothPlastic)
	addText(sign, AWAY_FROM_FIELD, label, readable(team.Primary, team.Trim))
end

-- Gates on the front (plaza) side are lettered A-D from left to right as seen from the plaza
-- (the plaza looks toward +Z, so the left is +X).
local function plazaGateLabel(worldX)
	if worldX > 60 then
		return "GATE A"
	elseif worldX > 0 then
		return "GATE B"
	elseif worldX > -60 then
		return "GATE C"
	end
	return "GATE D"
end

-- A team flag on a pole standing at stand position (x, d) on a surface at height `baseY`.
-- `side` (-1 / 1) is the direction the flag flies along the rows.
local function flag(ctx, frame, x, d, baseY, height, side, color)
	local C = ctx.config.Colors
	local polePos = at(frame, x, baseY + height / 2, d).Position
	BuildUtil.Cylinder(ctx, {
		Name = "FlagPole",
		Position = polePos,
		Height = height,
		Diameter = 0.4,
		Axis = "Y",
		Color = C.Metal,
		Material = Enum.Material.Metal,
	})
	BuildUtil.Ball(ctx, {
		Name = "FlagPoleTop",
		Position = polePos + Vector3.new(0, height / 2 + 0.3, 0),
		Diameter = 0.8,
		Color = C.Gold,
		Material = Enum.Material.Metal,
	})
	standBox(
		ctx,
		frame,
		"Flag",
		Vector3.new(4.5, 2.8, 0.15),
		x + side * 2.45,
		baseY + height - 1.7,
		d,
		color,
		Enum.Material.Fabric,
		{ CanCollide = false }
	)
end

-- A complete lower (ground level) stand: rows, field wall + signs, aisles, end caps and a trim
-- stripe along the top of its outside wall.
local function lowerStand(ctx, frame, spec)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	seating(ctx, frame, spec)
	fieldWall(ctx, frame, spec.length, spec.panels)
	aisles(ctx, frame, spec.aisles, L.RowRise, L.LowerRows, C.Walkway)
	endCaps(ctx, frame, spec.length, spec.caps, L.RowRise, L.LowerRows, spec.capColor or C.ConcreteDark)
	backBand(ctx, frame, spec.length, L.LowerTopHeight - 1, 1, L.LowerDepth, ctx.colors.Trim, "BackStripe")
end

---------------------------------------------------------------------------------------------
-- Corner pieces (plot-local, L-shaped)
---------------------------------------------------------------------------------------------

--[[
	Seating rows of one corner, rows `firstRow`..`lastRow` of the ring. Row r of corner (sx, sz)
	is the part of ring band r not covered by the sideline stands (|x| <= CornerStartX) or the end
	stands (z between the field's front and back edges):
	  leg A  the sideline band carried on past x = CornerStartX out to the band's outer X edge
	  leg B  the end band carried on from the field edge up to leg A
	The seat strip runs along the outside edge of the L, like BuildUtil.Rows' strips.
	`ends` = the Z the B legs start from (FieldBackZ / FieldFrontZ for a lower corner).
]]
local function cornerRows(ctx, sx, sz, firstRow, lastRow, rowColors, seatColor, ends)
	local L = ctx.config.Layout
	local startX = L.CornerStartX
	for r = firstRow, lastRow do
		local g = ringRow(L, r)
		local zi = sz > 0 and g.backZi or g.frontZi
		local zo = sz > 0 and g.backZo or g.frontZo
		local h = g.height
		local color = rowColors[(r - firstRow) % #rowColors + 1]
		boundsBox(ctx, "Row" .. r .. "A", sx * startX, sx * g.xo, 0, h, zi, zo, color, Enum.Material.Concrete)
		boundsBox(ctx, "Row" .. r .. "B", sx * g.xi, sx * g.xo, 0, h, ends, zi, color, Enum.Material.Concrete)
		-- 0.5 short of the neighbouring stands' row ends (where their end caps stand), like Rows
		boundsBox(ctx, "Row" .. r .. "SeatsA", sx * (startX + 0.5), sx * g.xo, h, h + 0.8, zo - sz, zo, seatColor)
		boundsBox(ctx, "Row" .. r .. "SeatsB", sx * (g.xo - 1), sx * g.xo, h, h + 0.8, ends + sz * 0.5, zo - sz, seatColor)
	end
end

--[[
	Diagonal aisle across a corner: a ramp along the 45 degree line from the inner corner of the
	first row (cornerX, cornerZ) outward. Like the straight aisles its slope climbs one row per
	row, so it passes over the front corner of every row. It starts `lead` studs early so its
	edges ride just above the L-shaped row corners instead of being notched by them.
]]
local function diagonalAisle(ctx, sx, sz, cornerX, cornerZ, firstHeight, rows, lead, width, color)
	local L = ctx.config.Layout
	local diagonal = math.sqrt(2)
	local slope = L.RowRise / (L.RowDepth * diagonal)
	local length = (rows - 1) * L.RowDepth * diagonal + lead
	local rise = (rows - 1) * L.RowRise + lead * slope
	local along = (length / 2 - lead) / diagonal -- centre offset from the corner, in X and in Z
	BuildUtil.Wedge(ctx, {
		Name = "Aisle",
		Size = Vector3.new(width, rise, length),
		-- LookVector (the low end of the slope) points back toward the field corner
		CFrame = CFrame.new(cornerX + sx * along, firstHeight + rise / 2, cornerZ + sz * along) * CFrame.Angles(0, math.atan2(sx, sz), 0),
		Color = color,
		Material = Enum.Material.Concrete,
	})
end

---------------------------------------------------------------------------------------------
-- Upper deck helpers
---------------------------------------------------------------------------------------------

--[[
	Team-coloured facade band on the front face of an upper deck, filling the gap between the
	lower bowl's top row (12) and the upper deck's first row (16), plus a parapet cap and a thin
	stripe. spec:
	  x0, x1              stand x range of the band
	  capX0, capX1        stand x range of the cap (default: the band's)
	  stripeX0, stripeX1  stand x range of the stripe (default: the band's)
	  labels              { { text = "...", from = 0..1, to = 0..1 }, ... }: from/to are fractions
	                      of the band's length, left to right as seen from the field
	Separate cap/stripe ranges let two facades meet at an inside corner without overlapping.
]]
local function facadeSpan(ctx, frame, spec)
	local team = ctx.colors
	local height = FACADE_TOP - FACADE_BOTTOM
	local band = standSpan(
		ctx,
		frame,
		"Facade",
		spec.x0,
		spec.x1,
		height,
		FACADE_BOTTOM + height / 2,
		0.4,
		-0.2,
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	for index, label in ipairs(spec.labels or {}) do
		local _, textLabel = BuildUtil.SurfaceText(band, TOWARD_FIELD, label.text, {
			LabelName = band.Name .. "Text" .. index,
			TextColor3 = readable(team.Primary, team.Trim),
			PixelsPerStud = 12,
			Font = Enum.Font.GothamBlack,
		})
		textLabel.Position = UDim2.new(label.from, 0, 0, 0)
		textLabel.Size = UDim2.new(label.to - label.from, 0, 1, 0)
	end
	standSpan(
		ctx,
		frame,
		"FacadeCap",
		spec.capX0 or spec.x0,
		spec.capX1 or spec.x1,
		0.3,
		FACADE_TOP + 0.15,
		0.7,
		-0.2,
		team.Trim,
		Enum.Material.SmoothPlastic
	)
	-- kept low, under the letters' baseline, so it never cuts through the text
	standSpan(
		ctx,
		frame,
		"FacadeStripe",
		spec.stripeX0 or spec.x0,
		spec.stripeX1 or spec.x1,
		0.35,
		FACADE_BOTTOM + 0.3,
		0.1,
		-0.45,
		team.Secondary,
		Enum.Material.SmoothPlastic,
		{ CanCollide = false }
	)
	return band
end

local function facade(ctx, frame, length, labels)
	return facadeSpan(ctx, frame, { x0 = -length / 2, x1 = length / 2, labels = labels })
end

-- Upper-deck rows + aisles + end caps + back rail (no facade).
local function upperStand(ctx, frame, spec)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	seating(ctx, frame, {
		name = "UpperRow",
		length = spec.length,
		rows = L.UpperRows,
		firstHeight = L.UpperStartHeight,
		rowColors = spec.rowColors,
		seatColor = spec.seatColor,
	})
	aisles(ctx, frame, spec.aisles, L.UpperStartHeight, L.UpperRows, C.Walkway)
	endCaps(ctx, frame, spec.length, spec.caps, L.UpperStartHeight, L.UpperRows, spec.capColor or C.ConcreteDark)
	backRail(ctx, frame, spec.length, L.UpperTopHeight, L.UpperDepth)
end

--[[
	Bridge carrying the upper deck's rows over a players' tunnel (only above the lower bowl's top,
	so the tunnel stays open underneath), with tunnel walls and the runway continued below it.
	frame: stand frame on the centre line at the upper deck's front face (LookVector away from
	the field). Returns the bridge's child context.
]]
local function tunnelBridge(ctx, frame, halfWidth, rowColors, seatColor)
	local L = ctx.config.Layout
	local team = ctx.colors
	local bridgeCtx = BuildUtil.Child(ctx, "TunnelBridge")
	local bridgeBottom = L.LowerTopHeight
	local depth = L.UpperDepth
	for row = 1, L.UpperRows do
		local rowTop = L.UpperStartHeight + (row - 1) * L.RowRise
		local d = (row - 0.5) * L.RowDepth
		standBox(
			bridgeCtx,
			frame,
			"BridgeRow" .. row,
			Vector3.new(halfWidth * 2, rowTop - bridgeBottom, L.RowDepth),
			0,
			(rowTop + bridgeBottom) / 2,
			d,
			rowColors[(row - 1) % #rowColors + 1],
			Enum.Material.Concrete
		)
		standBox(
			bridgeCtx,
			frame,
			"BridgeRow" .. row .. "Seats",
			Vector3.new(halfWidth * 2 + 1, 0.8, 1),
			0,
			rowTop + 0.4,
			d + (L.RowDepth / 2 - 0.5),
			seatColor,
			Enum.Material.SmoothPlastic
		)
	end
	backRail(bridgeCtx, frame, halfWidth * 2, L.UpperTopHeight, depth)
	-- tunnel walls under the bridge (a little proud of the row ends) + the runway continues.
	-- They start where the lower bowl's tunnel walls end (those overhang the lower back wall).
	for _, side in ipairs({ -1, 1 }) do
		standSpan(
			bridgeCtx,
			frame,
			"TunnelWall",
			side * (halfWidth - 0.4),
			side * halfWidth,
			bridgeBottom,
			bridgeBottom / 2,
			depth + CLADDING - TUNNEL_WALL_OVERHANG,
			(TUNNEL_WALL_OVERHANG + depth + CLADDING) / 2,
			team.Primary,
			Enum.Material.Brick
		)
	end
	standBox(
		bridgeCtx,
		frame,
		"TunnelRunway",
		Vector3.new(16, 0.12, depth),
		0,
		0.16,
		depth / 2,
		team.Primary,
		Enum.Material.Fabric,
		{ CanCollide = false }
	)
	return bridgeCtx
end

---------------------------------------------------------------------------------------------
-- Lower bowl
---------------------------------------------------------------------------------------------

function Stands.bleachers_home(ctx)
	local L = ctx.config.Layout
	local team = ctx.colors
	local name = ctx.teamName
	local tunnel = L.BackTunnelHalfWidth
	local outer = L.SidelineStandsHalfLength
	local length = outer - tunnel
	local depth = L.LowerDepth
	local centre = (tunnel + outer) / 2

	-- Two sections either side of the HOME tunnel (side = -1 west, 1 east). The home stands look
	-- toward +Z, so stand x runs toward -X: the section's outer end is at stand x = -side * length / 2.
	for _, side in ipairs({ -1, 1 }) do
		local sectionCtx = BuildUtil.Child(ctx, side < 0 and "WestSection" or "EastSection")
		local frame = CFrame.new(side * centre, 0, L.SurfaceMaxZ) * TURN
		lowerStand(sectionCtx, frame, {
			length = length,
			rowColors = { team.Primary, shade(team.Primary, 0.8) },
			seatColor = team.Secondary,
			aisles = { -26, 26 },
			caps = { -side }, -- the tunnel end gets the tunnel wall instead
			panels = {
				{ x = -side * 26, width = 40, text = name },
				{ x = side * 26, width = 40, text = side > 0 and "GO " .. name .. "!" or "DE-FENSE!", color = team.Trim },
			},
		})
	end

	-- HOME tunnel: from the back sideline through the stands toward the locker rooms + campus ----
	local tunnelCtx = BuildUtil.Child(ctx, "HomeTunnel")
	local frontZ = L.SurfaceMaxZ
	local midZ = frontZ + depth / 2
	local wallHeight = L.LowerTopHeight + 1
	local wallInner = tunnel - 0.4 -- a little proud of the row ends so their faces don't z-fight
	local wallOuter = tunnel + 0.8
	local wallX = (wallInner + wallOuter) / 2
	-- the walls run 0.2 past the stand's back wall so their faces don't z-fight with it
	-- (the upper deck's tunnel walls start where these end)
	local wallDepth = depth + TUNNEL_WALL_OVERHANG
	local wallZ = frontZ + wallDepth / 2
	for _, side in ipairs({ -1, 1 }) do
		BuildUtil.Box(
			tunnelCtx,
			"TunnelWall",
			Vector3.new(wallOuter - wallInner, wallHeight, wallDepth),
			Vector3.new(side * wallX, wallHeight / 2, wallZ),
			team.Primary,
			Enum.Material.Brick
		)
		-- LED strip along the inside of each wall (above head height)
		BuildUtil.Box(
			tunnelCtx,
			"TunnelLED",
			Vector3.new(0.15, 0.5, depth - 1),
			Vector3.new(side * (wallInner - 0.075), 10, midZ),
			team.Secondary,
			Enum.Material.Neon,
			{ CanCollide = false, CastShadow = false }
		)
		BuildUtil.Box(
			tunnelCtx,
			"TunnelWallCap",
			Vector3.new(wallOuter - wallInner + 0.4, 0.4, wallDepth),
			Vector3.new(side * wallX, wallHeight + 0.2, wallZ),
			team.Trim,
			Enum.Material.SmoothPlastic
		)
	end

	-- Header beam over the tunnel mouth (well above head height): the team name faces the field,
	-- the +Z side (seen from inside the tunnel) names where the tunnel leads.
	local headerBottom = wallHeight + 0.4
	local headerHeight = 6
	local headerWidth = wallOuter * 2
	local header = BuildUtil.Box(
		tunnelCtx,
		"TunnelHeader",
		Vector3.new(headerWidth, headerHeight, 2),
		Vector3.new(0, headerBottom + headerHeight / 2, frontZ + 1),
		team.Secondary,
		Enum.Material.SmoothPlastic
	)
	addText(header, Enum.NormalId.Front, "HOME TEAM: " .. name, readable(team.Secondary, team.Primary), 16)
	addText(header, Enum.NormalId.Back, "LOCKER ROOMS", readable(team.Secondary, team.Primary), 16)
	BuildUtil.Light(header, "SurfaceLight", { Name = "TunnelLight", Face = Enum.NormalId.Bottom, Range = 16, Brightness = 1.5, Angle = 80 })
	BuildUtil.Box(
		tunnelCtx,
		"TunnelHeaderTrim",
		Vector3.new(headerWidth, 0.5, 2.3),
		Vector3.new(0, headerBottom + headerHeight + 0.25, frontZ + 1),
		team.Trim,
		Enum.Material.SmoothPlastic
	)

	-- Team-coloured runway on the tunnel floor (flat, non-collidable, above the back walk paint)
	BuildUtil.Box(
		tunnelCtx,
		"TunnelRunway",
		Vector3.new(16, 0.12, depth - 0.5),
		Vector3.new(0, 0.16, midZ + 0.25),
		team.Primary,
		Enum.Material.Fabric,
		{ CanCollide = false }
	)
end

function Stands.bleachers_visitor(ctx)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local team = ctx.colors
	local name = ctx.teamName
	local tunnel = L.TunnelHalfWidth
	local outer = L.SidelineStandsHalfLength
	local length = outer - tunnel
	local depth = L.LowerDepth
	local centre = (tunnel + outer) / 2

	-- Two sections either side of the players' tunnel (side = -1 west, 1 east)
	for _, side in ipairs({ -1, 1 }) do
		local sectionCtx = BuildUtil.Child(ctx, side < 0 and "WestSection" or "EastSection")
		local frame = CFrame.new(side * centre, 0, L.SurfaceMinZ) -- stand x == world x offset here
		lowerStand(sectionCtx, frame, {
			length = length,
			rowColors = { C.Concrete, C.ConcreteDark },
			seatColor = team.Secondary,
			aisles = { -26, 26 },
			caps = { side }, -- the tunnel end gets the tunnel wall instead
			panels = {
				{ x = side * 26, width = 40, text = name },
				{ x = -side * 26, width = 40, text = "VISITORS", color = team.Trim },
			},
		})
		-- concourse gates on the plaza-facing outside wall
		for _, x in ipairs({ -26, 26 }) do
			gate(sectionCtx, frame, x, depth, plazaGateLabel(side * centre + x))
		end
	end

	-- Players' tunnel ------------------------------------------------------------------------
	local tunnelCtx = BuildUtil.Child(ctx, "PlayersTunnel")
	local frontZ = L.SurfaceMinZ
	local backZ = L.FrontLowerOuterZ
	local midZ = (frontZ + backZ) / 2
	local wallHeight = L.LowerTopHeight + 1
	local wallInner = tunnel - 0.4 -- a little proud of the row ends so their faces don't z-fight
	local wallOuter = tunnel + 0.8
	local wallX = (wallInner + wallOuter) / 2
	-- the walls run 0.2 past the stand's plaza-facing back wall so their back faces don't z-fight
	-- with it (the upper deck's tunnel walls start where these end)
	local wallDepth = depth + TUNNEL_WALL_OVERHANG
	local wallZ = frontZ - wallDepth / 2
	for _, side in ipairs({ -1, 1 }) do
		BuildUtil.Box(
			tunnelCtx,
			"TunnelWall",
			Vector3.new(wallOuter - wallInner, wallHeight, wallDepth),
			Vector3.new(side * wallX, wallHeight / 2, wallZ),
			team.Primary,
			Enum.Material.Brick
		)
		-- LED strip along the inside of each wall (above head height)
		BuildUtil.Box(
			tunnelCtx,
			"TunnelLED",
			Vector3.new(0.15, 0.5, depth - 1),
			Vector3.new(side * (wallInner - 0.075), 10, midZ),
			team.Secondary,
			Enum.Material.Neon,
			{ CanCollide = false, CastShadow = false }
		)
		BuildUtil.Box(
			tunnelCtx,
			"TunnelWallCap",
			Vector3.new(wallOuter - wallInner + 0.4, 0.4, wallDepth),
			Vector3.new(side * wallX, wallHeight + 0.2, wallZ),
			team.Trim,
			Enum.Material.SmoothPlastic
		)
	end

	-- Header beam over the tunnel mouth (well above head height)
	local headerBottom = wallHeight + 0.4
	local headerHeight = 6
	local headerWidth = wallOuter * 2
	local header = BuildUtil.Box(
		tunnelCtx,
		"TunnelHeader",
		Vector3.new(headerWidth, headerHeight, 2),
		Vector3.new(0, headerBottom + headerHeight / 2, frontZ - 1),
		team.Secondary,
		Enum.Material.SmoothPlastic
	)
	addText(header, Enum.NormalId.Back, "WELCOME TO " .. name .. " STADIUM", readable(team.Secondary, team.Primary), 16)
	addText(header, Enum.NormalId.Front, "PLAYERS' TUNNEL", readable(team.Secondary, team.Primary), 16)
	BuildUtil.Light(header, "SurfaceLight", { Name = "TunnelLight", Face = Enum.NormalId.Bottom, Range = 16, Brightness = 1.5, Angle = 80 })
	BuildUtil.Box(
		tunnelCtx,
		"TunnelHeaderTrim",
		Vector3.new(headerWidth, 0.5, 2.3),
		Vector3.new(0, headerBottom + headerHeight + 0.25, frontZ - 1),
		team.Trim,
		Enum.Material.SmoothPlastic
	)

	-- Team-coloured runway on the tunnel floor (flat, non-collidable, above the walkway)
	BuildUtil.Box(
		tunnelCtx,
		"TunnelRunway",
		Vector3.new(16, 0.12, depth - 0.5),
		Vector3.new(0, 0.16, midZ - 0.25),
		team.Primary,
		Enum.Material.Fabric,
		{ CanCollide = false }
	)
end

local function endZoneStand(ctx, side, chant)
	local L = ctx.config.Layout
	local team = ctx.colors
	local name = ctx.teamName
	-- west (side -1): rows step toward -X; east (side 1): rows step toward +X
	local frame = endFrame(L, side, L.SurfaceHalfX)
	local length = L.FieldWidth

	lowerStand(ctx, frame, {
		length = length,
		rowColors = { shade(team.Primary, 0.92), shade(team.Primary, 0.72) },
		seatColor = team.Trim,
		aisles = { -26, 26 },
		caps = { -1, 1 },
		panels = {
			{ x = -36, width = 26, text = name },
			{ x = 0, width = 30, text = chant, color = team.Trim },
			{ x = 36, width = 26, text = name },
		},
	})

	-- team flags at the two back corners
	local top = L.LowerTopHeight
	local back = L.LowerDepth - 1.2
	flag(ctx, frame, -(length / 2 - 1.5), back, top, 12, 1, team.Primary)
	flag(ctx, frame, length / 2 - 1.5, back, top, 12, -1, team.Secondary)
end

function Stands.endzone_stands_west(ctx)
	endZoneStand(ctx, -1, "DE-FENSE!")
end

function Stands.endzone_stands_east(ctx)
	endZoneStand(ctx, 1, "TOUCHDOWN!")
end

-- The four lower corners: they join the sideline stands to the end-zone stands so the lower
-- bowl becomes one closed ring (only the two tunnels stay open).
function Stands.corner_seats(ctx)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local team = ctx.colors
	local name = ctx.teamName
	local startX = L.CornerStartX -- 120: where the sideline stands end
	local turfX = L.SurfaceHalfX -- 135
	local outerX = L.EndLowerOuterX -- 159
	local top = L.LowerTopHeight
	local rowColors = { team.Primary, shade(team.Primary, 0.8) }

	for _, corner in ipairs({ { -1, -1 }, { 1, -1 }, { -1, 1 }, { 1, 1 } }) do
		local sx, sz = corner[1], corner[2]
		local cornerCtx = BuildUtil.Child(ctx, (sz > 0 and "Back" or "Front") .. (sx > 0 and "East" or "West") .. "Corner")
		local turfZ = sz > 0 and L.SurfaceMaxZ or L.SurfaceMinZ -- 95 / -35
		local endZ = sz > 0 and L.FieldBackZ or L.FieldFrontZ -- 83 / -23: where the end stands end
		local outerZ = turfZ + sz * L.LowerDepth -- 119 / -59

		cornerRows(cornerCtx, sx, sz, 1, L.LowerRows, rowColors, team.Secondary, endZ)
		diagonalAisle(cornerCtx, sx, sz, sx * turfX, turfZ, L.RowRise, L.LowerRows, 1.1, 3, C.Walkway)

		-- Padded field wall carried round the turf corner (leg A along the sideline, leg B along
		-- the end), with a sign on each leg facing the field.
		local wallTop = FIELD_WALL_HEIGHT
		boundsBox(cornerCtx, "FieldWall", sx * startX, sx * turfX, 0, wallTop, turfZ - sz * 0.8, turfZ, team.Primary, Enum.Material.Fabric)
		boundsBox(
			cornerCtx,
			"FieldWall",
			sx * (turfX - 0.8),
			sx * turfX,
			0,
			wallTop,
			endZ,
			turfZ - sz * 0.8,
			team.Primary,
			Enum.Material.Fabric
		)
		boundsBox(
			cornerCtx,
			"FieldWallCap",
			sx * startX,
			sx * (turfX + 0.1),
			wallTop,
			wallTop + 0.3,
			turfZ - sz * 0.9,
			turfZ + sz * 0.1,
			team.Trim
		)
		boundsBox(
			cornerCtx,
			"FieldWallCap",
			sx * (turfX - 0.9),
			sx * (turfX + 0.1),
			wallTop,
			wallTop + 0.3,
			endZ,
			turfZ - sz * 0.9,
			team.Trim
		)
		local signA = boundsBox(
			cornerCtx,
			"WallSignA",
			sx * (startX + 2),
			sx * (turfX - 2),
			0.7,
			3,
			turfZ - sz * 0.8,
			turfZ - sz * 1,
			team.Secondary,
			Enum.Material.SmoothPlastic,
			{ CanCollide = false }
		)
		addText(signA, sz > 0 and Enum.NormalId.Front or Enum.NormalId.Back, name, readable(team.Secondary, team.Primary))
		local signB = boundsBox(
			cornerCtx,
			"WallSignB",
			sx * (turfX - 0.8),
			sx * (turfX - 1),
			0.7,
			3,
			endZ + sz * 1.5,
			turfZ - sz * 2.5,
			team.Trim,
			Enum.Material.SmoothPlastic,
			{ CanCollide = false }
		)
		addText(
			signB,
			sx > 0 and Enum.NormalId.Left or Enum.NormalId.Right,
			sz > 0 and "LOUD!" or "LET'S GO!",
			readable(team.Trim, team.Primary)
		)

		-- Trim stripe along the top of the outside walls (continues the other stands' stripes)
		local stripe = { CanCollide = false }
		boundsBox(
			cornerCtx,
			"BackStripe",
			sx * startX,
			sx * (outerX + 0.3),
			top - 1,
			top,
			outerZ,
			outerZ + sz * 0.3,
			team.Trim,
			nil,
			stripe
		)
		boundsBox(cornerCtx, "BackStripe", sx * outerX, sx * (outerX + 0.3), top - 1, top, endZ, outerZ, team.Trim, nil, stripe)
	end
end

---------------------------------------------------------------------------------------------
-- Upper decks
---------------------------------------------------------------------------------------------

function Stands.upper_home(ctx)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local team = ctx.colors
	local name = ctx.teamName
	local tunnel = L.BackTunnelHalfWidth
	local outer = L.SidelineStandsHalfLength
	local length = outer - tunnel
	local centre = (tunnel + outer) / 2
	local depth = L.UpperDepth
	local top = L.UpperTopHeight
	local frontZ = L.BackLowerOuterZ
	local frame = CFrame.new(0, 0, frontZ) * TURN -- whole stand; stand x = -world x
	local rowColors = { team.Secondary, shade(team.Secondary, 0.82) }
	local seatColor = team.Primary
	local face = depth + CLADDING

	-- Two sections either side of the HOME tunnel, each with concrete cladding on its back wall
	for _, side in ipairs({ -1, 1 }) do
		local sectionCtx = BuildUtil.Child(ctx, side < 0 and "WestSection" or "EastSection")
		local sectionFrame = CFrame.new(side * centre, 0, frontZ) * TURN
		upperStand(sectionCtx, sectionFrame, {
			length = length,
			rowColors = rowColors,
			seatColor = seatColor,
			aisles = { -26, 26 },
			caps = { -side },
		})
		standBox(
			sectionCtx,
			sectionFrame,
			"BackCladding",
			Vector3.new(length, top, CLADDING),
			0,
			top / 2,
			depth + CLADDING / 2,
			C.Concrete,
			Enum.Material.Concrete
		)
	end

	-- Bridge over the HOME tunnel; its back wall is clad above the tunnel opening
	local bridgeCtx = tunnelBridge(ctx, frame, tunnel, rowColors, seatColor)
	local bridgeBottom = L.LowerTopHeight
	standBox(
		bridgeCtx,
		frame,
		"BackCladding",
		Vector3.new(tunnel * 2, top - bridgeBottom, CLADDING),
		0,
		(top + bridgeBottom) / 2,
		depth + CLADDING / 2,
		C.Concrete,
		Enum.Material.Concrete
	)
	local lintel = standBox(bridgeCtx, frame, "TunnelLintel", Vector3.new(tunnel * 2, 4.5, 0.3), 0, 15.25, face + 0.15, team.Secondary)
	addText(lintel, AWAY_FROM_FIELD, "HOME TEAM TUNNEL", readable(team.Secondary, team.Primary))

	facade(ctx, frame, outer * 2, {
		{ text = "HOME OF THE " .. name, from = 0.04, to = 0.42 },
		{ text = name .. " NATION", from = 0.58, to = 0.96 },
	})

	-- Outside (back) wall: team bands across the whole width (over the tunnel too), stadium name
	-- and concourse gates
	backBand(ctx, frame, outer * 2, 11.2, 1.4, face, team.Primary, "ConcourseBand")
	-- the press box (X -44..44) later stands right in front of the middle of this band, so the
	-- name is shown twice, either side of it
	local nameBand = backBand(ctx, frame, outer * 2, 18.5, 4, face, team.Primary, "NameBand")
	local pressBoxClear = 46 / (outer * 2) + 0.5 -- band fraction of world |x| = 46
	addTextRanges(nameBand, AWAY_FROM_FIELD, name .. " STADIUM", readable(team.Primary, team.Trim), {
		{ 1 - pressBoxClear - 0.26, 1 - pressBoxClear },
		{ pressBoxClear, pressBoxClear + 0.26 },
	})
	backBand(ctx, frame, outer * 2, top - 1.2, 1.2, face, team.Secondary, "TopBand")
	-- near the ends, clear of the home locker room (X 45..110) and the press box stair cores
	gate(ctx, frame, 114, face, "GATE E") -- world x = -114 (left, as seen from the campus)
	gate(ctx, frame, -114, face, "GATE F")

	-- flags along the top (clear of the press box in the middle)
	for index, x in ipairs({ -110, -70, 70, 110 }) do
		flag(ctx, frame, x, depth - 1.2, top, 9, x < 0 and 1 or -1, index % 2 == 0 and team.Secondary or team.Primary)
	end
end

function Stands.upper_visitor(ctx)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local team = ctx.colors
	local name = ctx.teamName
	local tunnel = L.TunnelHalfWidth
	local outer = L.SidelineStandsHalfLength
	local length = outer - tunnel
	local centre = (tunnel + outer) / 2
	local depth = L.UpperDepth
	local top = L.UpperTopHeight
	-- the last colour is the top row, whose back face is the plaza-facing outside wall
	local rowColors = { C.ConcreteDark, C.Concrete }
	local seatColor = team.Secondary

	for _, side in ipairs({ -1, 1 }) do
		local sectionCtx = BuildUtil.Child(ctx, side < 0 and "WestSection" or "EastSection")
		local frame = CFrame.new(side * centre, 0, L.FrontLowerOuterZ) -- stand x == world x offset here
		upperStand(sectionCtx, frame, {
			length = length,
			rowColors = rowColors,
			seatColor = seatColor,
			aisles = { -26, 26 },
			caps = { side },
		})
		-- plaza-facing outside wall: bands, gates and hanging team banners
		backBand(sectionCtx, frame, length, 11.2, 1.4, depth, team.Primary, "ConcourseBand")
		backBand(sectionCtx, frame, length, top - 2, 2, depth, team.Secondary, "TopBand")
		for _, x in ipairs({ -26, 26 }) do
			gate(sectionCtx, frame, x, depth, plazaGateLabel(side * centre + x))
		end
		for index, x in ipairs({ -40, 0, 40 }) do
			standBox(
				sectionCtx,
				frame,
				"Banner",
				Vector3.new(6, 9.5, 0.2),
				x,
				18.25,
				depth + 0.1,
				index == 2 and team.Secondary or team.Primary,
				Enum.Material.Fabric,
				{ CanCollide = false }
			)
		end
	end

	-- Bridge over the players' tunnel (only above the lower bowl's top, so the tunnel stays open)
	local bridgeCtx = BuildUtil.Child(ctx, "TunnelBridge")
	local bridgeBottom = L.LowerTopHeight
	local frontZ = L.FrontLowerOuterZ
	local backZ = L.FrontUpperOuterZ
	for row = 1, L.UpperRows do
		local rowTop = L.UpperStartHeight + (row - 1) * L.RowRise
		local z = frontZ - (row - 0.5) * L.RowDepth
		BuildUtil.Box(
			bridgeCtx,
			"BridgeRow" .. row,
			Vector3.new(tunnel * 2, rowTop - bridgeBottom, L.RowDepth),
			Vector3.new(0, (rowTop + bridgeBottom) / 2, z),
			rowColors[(row - 1) % #rowColors + 1],
			Enum.Material.Concrete
		)
		BuildUtil.Box(
			bridgeCtx,
			"BridgeRow" .. row .. "Seats",
			Vector3.new(tunnel * 2 + 1, 0.8, 1),
			Vector3.new(0, rowTop + 0.4, z - (L.RowDepth / 2 - 0.5)),
			seatColor,
			Enum.Material.SmoothPlastic
		)
	end
	backRail(bridgeCtx, CFrame.new(0, 0, frontZ), tunnel * 2, top, depth)
	local lintel = BuildUtil.Box(
		bridgeCtx,
		"TunnelLintel",
		Vector3.new(tunnel * 2, 3.6, 0.4),
		Vector3.new(0, bridgeBottom + 1.8, backZ - 0.2),
		team.Secondary,
		Enum.Material.SmoothPlastic
	)
	addText(lintel, Enum.NormalId.Front, "PLAYERS' TUNNEL", readable(team.Secondary, team.Primary))
	local nameSign = BuildUtil.Box(
		bridgeCtx,
		"StadiumSign",
		Vector3.new(tunnel * 2, 9, 0.4),
		Vector3.new(0, bridgeBottom + 8.5, backZ - 0.2),
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	addText(nameSign, Enum.NormalId.Front, name .. " STADIUM", readable(team.Primary, team.Trim))
	-- tunnel walls under the bridge (a little proud of the row ends) + the runway continues.
	-- They start where the lower bowl's tunnel walls end (those overhang z = frontZ slightly).
	local bridgeWallFront = frontZ - TUNNEL_WALL_OVERHANG
	for _, side in ipairs({ -1, 1 }) do
		BuildUtil.Box(
			bridgeCtx,
			"TunnelWall",
			Vector3.new(0.4, bridgeBottom, bridgeWallFront - backZ),
			Vector3.new(side * (tunnel - 0.2), bridgeBottom / 2, (bridgeWallFront + backZ) / 2),
			team.Primary,
			Enum.Material.Brick
		)
	end
	BuildUtil.Box(
		bridgeCtx,
		"TunnelRunway",
		Vector3.new(16, 0.12, depth),
		Vector3.new(0, 0.16, (frontZ + backZ) / 2),
		team.Primary,
		Enum.Material.Fabric,
		{ CanCollide = false }
	)

	-- Facade across the whole front face (both sections and the bridge). Seen from the field the
	-- middle of it is hidden behind the tunnel header, so the text sits over the two sections.
	facade(ctx, CFrame.new(0, 0, frontZ), outer * 2, {
		{ text = name .. " STADIUM", from = 0.04, to = 0.42 },
		{ text = "GO " .. name .. "!", from = 0.58, to = 0.96 },
	})
end

--[[
	Upper bowl ends: upper rows 7-12 behind both end zones plus the four upper corners, which
	closes the upper deck into a full ring. Per side (sx) every row is one long block along the
	end (it also covers the corners' end legs) plus a corner leg at the back and at the front.
	The facade, top rail, concrete cladding and outside bands all run on round the corners.
]]
local function upperRingEnd(ctx, sx, facadeText, gateLabels)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local team = ctx.colors
	local name = ctx.teamName
	local startX = L.CornerStartX -- 120
	local innerX = L.EndLowerOuterX -- 159: front face of the upper ring's ends
	local outerX = L.EndUpperOuterX -- 183: outside wall
	local backInnerZ, frontInnerZ = L.BackLowerOuterZ, L.FrontLowerOuterZ -- 119 / -59
	local backOuterZ, frontOuterZ = L.BackUpperOuterZ, L.FrontUpperOuterZ -- 143 / -83
	local depth = L.UpperDepth
	local top = L.UpperTopHeight
	local first, last = L.LowerRows + 1, L.LowerRows + L.UpperRows
	-- same colours as the home upper deck, so the whole upper ring reads as one tier
	local rowColors = { team.Secondary, shade(team.Secondary, 0.82) }
	local seatColor = team.Primary

	-- Seating rows ----------------------------------------------------------------------------
	for r = first, last do
		local g = ringRow(L, r)
		local h = g.height
		local color = rowColors[(r - first) % #rowColors + 1]
		boundsBox(ctx, "UpperRow" .. r .. "End", sx * g.xi, sx * g.xo, 0, h, g.frontZi, g.backZi, color, Enum.Material.Concrete)
		boundsBox(ctx, "UpperRow" .. r .. "BackCorner", sx * startX, sx * g.xo, 0, h, g.backZi, g.backZo, color, Enum.Material.Concrete)
		boundsBox(ctx, "UpperRow" .. r .. "FrontCorner", sx * startX, sx * g.xo, 0, h, g.frontZo, g.frontZi, color, Enum.Material.Concrete)
		-- seat strips along the outside edge of the ring band (0.5 short of the sideline decks' end caps)
		boundsBox(ctx, "UpperRow" .. r .. "SeatsEnd", sx * (g.xo - 1), sx * g.xo, h, h + 0.8, g.frontZo + 1, g.backZo - 1, seatColor)
		boundsBox(ctx, "UpperRow" .. r .. "SeatsBack", sx * (startX + 0.5), sx * g.xo, h, h + 0.8, g.backZo - 1, g.backZo, seatColor)
		boundsBox(ctx, "UpperRow" .. r .. "SeatsFront", sx * (startX + 0.5), sx * g.xo, h, h + 0.8, g.frontZo, g.frontZo + 1, seatColor)
	end

	-- Aisles: two straight ones behind the end zone (in line with the lower ones) + one diagonal
	-- aisle per corner
	local frame = endFrame(L, sx, innerX)
	aisles(ctx, frame, { -26, 26 }, L.UpperStartHeight, L.UpperRows, C.Walkway)
	diagonalAisle(ctx, sx, 1, sx * innerX, backInnerZ, L.UpperStartHeight, L.UpperRows, 0.5, 3, C.Walkway)
	diagonalAisle(ctx, sx, -1, sx * innerX, frontInnerZ, L.UpperStartHeight, L.UpperRows, 0.5, 3, C.Walkway)

	-- Facade round the front face: one band along the end (inner corner to inner corner) and a
	-- leg along each corner that meets it at the inside corner (bands, caps and stripes butt up
	-- against each other instead of overlapping).
	local endHalf = (backInnerZ - frontInnerZ) / 2 -- 89: stand x along the end runs -89..89
	local textFrom = (endHalf - L.FieldWidth / 2 + 6) / (endHalf * 2) -- keep the text behind the end zone
	facadeSpan(ctx, frame, {
		x0 = -endHalf,
		x1 = endHalf,
		capX0 = -endHalf - 0.15,
		capX1 = endHalf + 0.15,
		stripeX0 = -endHalf + 0.4,
		stripeX1 = endHalf - 0.4,
		labels = { { text = facadeText, from = textFrom, to = 1 - textFrom } },
	})
	local backFrame = CFrame.new(0, 0, backInnerZ) * TURN -- stand x = -world x
	local frontFrame = CFrame.new(0, 0, frontInnerZ) -- stand x = world x
	for _, leg in ipairs({ { backFrame, -sx }, { frontFrame, sx } }) do
		local legFrame, toStand = leg[1], leg[2]
		facadeSpan(ctx, legFrame, {
			x0 = toStand * startX,
			x1 = toStand * (innerX - 0.4),
			capX0 = toStand * startX,
			capX1 = toStand * (innerX - 0.55),
			stripeX0 = toStand * startX,
			stripeX1 = toStand * (innerX - 0.5),
		})
	end

	-- Glass rail along the top back edge, all the way round
	local outerHalf = (backOuterZ - frontOuterZ) / 2 -- 113
	railSpan(ctx, frame, -(outerHalf - 0.575), outerHalf - 0.575, top, depth)
	railSpan(ctx, backFrame, -sx * startX, -sx * (outerX - 0.325), top, depth)
	railSpan(ctx, frontFrame, sx * startX, sx * (outerX - 0.325), top, depth)

	-- Outside walls: concrete cladding + team bands continuing the home deck's, gates, stadium name.
	-- The end wall's pieces cover the outside corners; the corner legs butt up against them.
	local face = depth + CLADDING
	local endFaceHalf = outerHalf + CLADDING -- 113.3: cladding wraps the corner
	standSpan(
		ctx,
		frame,
		"BackCladding",
		-endFaceHalf,
		endFaceHalf,
		top,
		top / 2,
		CLADDING,
		depth + CLADDING / 2,
		C.Concrete,
		Enum.Material.Concrete
	)
	for _, leg in ipairs({ { backFrame, -sx }, { frontFrame, sx } }) do
		local legFrame, toStand = leg[1], leg[2]
		standSpan(
			ctx,
			legFrame,
			"BackCladding",
			toStand * startX,
			toStand * outerX,
			top,
			top / 2,
			CLADDING,
			depth + CLADDING / 2,
			C.Concrete,
			Enum.Material.Concrete
		)
		bandSpan(ctx, legFrame, toStand * startX, toStand * (outerX + CLADDING), 11.2, 1.4, face, team.Primary, "ConcourseBand")
		bandSpan(ctx, legFrame, toStand * startX, toStand * (outerX + CLADDING), 18.5, 4, face, team.Primary, "NameBand")
		bandSpan(ctx, legFrame, toStand * startX, toStand * (outerX + CLADDING), top - 1.2, 1.2, face, team.Secondary, "TopBand")
	end
	local bandHalf = endFaceHalf + 0.3
	bandSpan(ctx, frame, -bandHalf, bandHalf, 11.2, 1.4, face, team.Primary, "ConcourseBand")
	bandSpan(ctx, frame, -bandHalf, bandHalf, top - 1.2, 1.2, face, team.Secondary, "TopBand")
	local nameBand = bandSpan(ctx, frame, -bandHalf, bandHalf, 18.5, 4, face, team.Primary, "NameBand")
	-- the scoreboard / jumbotron stand in front of the middle of this wall, so the name is shown
	-- twice, nearer the corners
	addTextRanges(nameBand, AWAY_FROM_FIELD, name .. " STADIUM", readable(team.Primary, team.Trim), {
		{ 0.05, 0.36 },
		{ 0.64, 0.95 },
	})
	for index, x in ipairs({ -80, 80 }) do
		gate(ctx, frame, x, face, gateLabels[index])
	end
end

function Stands.upper_bowl_ends(ctx)
	local westCtx = BuildUtil.Child(ctx, "WestEnd")
	upperRingEnd(westCtx, -1, "LOUD AND PROUD", { "GATE K", "GATE L" })
	local eastCtx = BuildUtil.Child(ctx, "EastEnd")
	upperRingEnd(eastCtx, 1, ctx.teamName .. " FOOTBALL", { "GATE H", "GATE J" })
end

return Stands
