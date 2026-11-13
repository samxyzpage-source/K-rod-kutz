--[[
	Stands
	The seating bowl. Bought piece by piece, it ends up as one continuous ring of seats around the
	turf (a full NFL-style bowl): every seating row r (1-6 lower, 7-12 upper) is a rectangular ring
	band around the field (see the full-bowl comment in Config.Layout).

	  bleachers_home       back lower sideline X[-120,120], split by the HOME tunnel (|x| < 14)
	                       steps: Concrete Rows, Seats, Aisles & Railings, Field Wall & Signs, Home Tunnel
	  bleachers_visitor    front lower sideline X[-120,120], split by the players' tunnel
	                       steps: Concrete Rows, Seats, Aisles & Railings, Field Wall & Players' Tunnel
	  endzone_stands_*     lower ends behind the end zones, Z[-23,83]
	                       steps: Concrete Rows, Seats, Aisles & Walls
	  corner_seats         the four lower corners that close the lower ring
	                       steps: Concrete Rows, Seats, Corner Walls & Aisles
	  upper_home           back upper sideline (with a bridge over the HOME tunnel)
	                       steps: Upper Rows, Seats, Facade & Railings, Tunnel Bridge
	  upper_visitor        front upper sideline (with a bridge over the players' tunnel)
	                       steps: Upper Rows, Seats, Facade & Railings
	  upper_bowl_ends      both upper ends + the four upper corners: closes the upper ring
	                       steps: End Rows, Corner Rows, Seats, Facades & Railings

	Every stand goes up the same way: bare concrete rows first, then the coloured seat strips
	(split into alternating colour blocks at the aisles), then stair aisles with handrails, then the
	walls, signs and facades. Crowd.lua seats game-day fans on the row tops as soon as step 1 exists,
	so the rows never move; everything added later keeps clear of the spots Crowd uses.

	Interactions: gold front-row "TV" seats with a camera view of the field (lower sidelines), a
	section sign with a fun fact on every stand, live score panels in the sideline field walls and
	"stairs" buttons on the upper-deck facades that take players between the lower bowl's top row
	and the upper deck's first row. Every straight stand has real stair aisles (1-stud steps) that
	can be walked from the field up to the top row; walkable aisles get an opening in the field wall
	with an entry step.

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
local FACE_FIELD = CFrame.Angles(0, math.pi, 0) -- turns a stand-space CFrame round to look at the field

local FIELD_WALL_HEIGHT = 3.5
local FACADE_BOTTOM = 12.8 -- just above the seat strips on the lower bowl's top row
local FACADE_TOP = 17 -- one stud above the upper deck's first row (acts as its front parapet)
local GATE_DARK = Color3.fromRGB(28, 28, 34)
local TUNNEL_WALL_OVERHANG = 0.2 -- lower tunnel walls stick out this far past the lower bowl's back wall
local CLADDING = 0.3 -- concrete skin on the outside walls of the home upper deck and the upper ring

-- bare concrete rows (two tones so the steps read from far away)
local ROW_LIGHT = Color3.fromRGB(152, 152, 157)
local ROW_DARK = Color3.fromRGB(128, 128, 134)
local SCREEN_DARK = Color3.fromRGB(12, 14, 20)
local SCREEN_TEXT = Color3.fromRGB(255, 220, 70)
local PLAQUE_DARK = Color3.fromRGB(26, 30, 40)
local WHITE = Color3.fromRGB(250, 250, 250)

-- Aisles: Crowd.lua expects a 3-stud stair aisle 26 studs either side of every section centre
-- and keeps its fans 2.7 studs away from the aisle's centre line.
local AISLE_WIDTH = 3
local AISLE_OFFSET = 26
local GAP_HALF = 1.8 -- half-width of the field-wall opening in front of a walkable aisle
local RAIL_HEIGHT = 2.8 -- handrails run this high above the stairs' nosing line...
local RAIL_OFFSET = 1.65 -- ...beside the aisle, on the side away from the stand's centre
-- Crowd.lua seats sideline fans every 2.6 studs. Next to every sideline aisle that leaves a free
-- 2.1-stud slot 1.5..3.6 studs off the aisle centre on the field-centre side: the 1.8-wide TV seats
-- go there, kept 0.25 studs back from the aisle so climbers don't brush against them and sit down.
local TV_SEAT_OFFSET = 2.65
local TV_SEAT_WIDTH = 1.8
local CORNER_GAP = 3.4 -- the corner field walls stop this far from the turf corner (entry to the aisle)

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
	return Color3.fromRGB(250, 250, 250)
end

-- The owner's team name, or a stand-in while it is empty.
local function displayName(ctx)
	local name = ctx.teamName
	if type(name) ~= "string" or name == "" then
		return "HOME TEAM"
	end
	return name
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

-- Fractions (from, to) of a band running from stand x bandMin to bandMax that cover stand x
-- xa..xb, measured left to right as seen by someone looking at `face` (Back faces the field: its
-- left edge is at the low stand x; Front faces away from the field: its left edge is at the high x).
local function rangeOnBand(face, bandMin, bandMax, xa, xb)
	local lo, hi = math.min(xa, xb), math.max(xa, xb)
	local width = bandMax - bandMin
	if face == TOWARD_FIELD then
		return (lo - bandMin) / width, (hi - bandMin) / width
	end
	return (bandMax - hi) / width, (bandMax - lo) / width
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

-- Step "Concrete Rows": the stepped seating blocks, bare concrete (same geometry as BuildUtil.Rows,
-- which is where Crowd.lua puts its fans). spec: length, rows, firstHeight, name
local function concreteRows(ctx, frame, spec)
	local L = ctx.config.Layout
	local colors = { ROW_LIGHT, ROW_DARK }
	local firstHeight = spec.firstHeight or L.RowRise
	for row = 1, spec.rows or L.LowerRows do
		local height = firstHeight + (row - 1) * L.RowRise
		standBox(
			ctx,
			frame,
			(spec.name or "Row") .. row,
			Vector3.new(spec.length, height, L.RowDepth),
			0,
			height / 2,
			(row - 0.5) * L.RowDepth,
			colors[(row - 1) % #colors + 1],
			Enum.Material.Concrete
		)
	end
end

--[[
	Step "Seats": a seat strip along the back edge of every row, split into colour blocks at the
	aisles (stand x in spec.splits). Block ends stop 1.25 short of an aisle centre, so they tuck
	into the aisle's steps (no coplanar faces) and leave an opening in the top row.
	spec: length, rows, firstHeight, splits, colors (cycled per block), name
]]
local function seatStrips(ctx, frame, spec)
	local L = ctx.config.Layout
	local firstHeight = spec.firstHeight or L.RowRise
	local half = spec.length / 2 - 0.5 -- 0.5 short of the row ends (the end caps stand there)
	local edges = { -half }
	local splits = table.clone(spec.splits or {})
	table.sort(splits)
	for _, x in ipairs(splits) do
		table.insert(edges, x)
	end
	table.insert(edges, half)
	for row = 1, spec.rows or L.LowerRows do
		local top = firstHeight + (row - 1) * L.RowRise
		for block = 1, #edges - 1 do
			local x0 = edges[block] + (block > 1 and AISLE_WIDTH / 2 - 0.25 or 0)
			local x1 = edges[block + 1] - (block < #edges - 1 and AISLE_WIDTH / 2 - 0.25 or 0)
			standSpan(
				ctx,
				frame,
				(spec.name or "Row") .. row .. "Seats",
				x0,
				x1,
				0.8,
				top + 0.4,
				1,
				row * L.RowDepth - 0.5,
				spec.colors[(block - 1) % #spec.colors + 1],
				Enum.Material.SmoothPlastic
			)
		end
	end
end

--[[
	A stair aisle at stand x = `x`: on every row but the top one, a light concrete step on the back
	half of the row. Walking up goes row top -> step -> next row top in 1-stud steps, 2 studs deep.
	entry = true adds a step in front of row 1 so the aisle can be climbed from the ground.
]]
local function stairAisle(ctx, frame, x, firstHeight, rows, entry)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local stepRise, stepDepth = L.RowRise / 2, L.RowDepth / 2
	for row = 1, rows - 1 do
		local top = firstHeight + (row - 1) * L.RowRise
		standBox(
			ctx,
			frame,
			"AisleStep",
			Vector3.new(AISLE_WIDTH, stepRise, stepDepth),
			x,
			top + stepRise / 2,
			row * L.RowDepth - stepDepth / 2,
			C.Walkway,
			Enum.Material.Concrete
		)
	end
	if entry then
		local height = firstHeight - stepRise
		standBox(
			ctx,
			frame,
			"AisleEntryStep",
			Vector3.new(AISLE_WIDTH, height, stepDepth),
			x,
			height / 2,
			-stepDepth / 2,
			C.Walkway,
			Enum.Material.Concrete
		)
	end
end

-- Metal handrail beside a stair aisle (stand x = `x`): a sloped rail on two posts, following the
-- stairs' nosing line from the first row to the top row.
local function handrail(ctx, frame, x, firstHeight, rows)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local slope = L.RowRise / L.RowDepth
	local d0, d1 = 0.6, (rows - 1) * L.RowDepth + 1
	local function railY(d)
		return firstHeight + d * slope + RAIL_HEIGHT
	end
	local middle = (d0 + d1) / 2
	BuildUtil.Part(ctx, {
		Name = "Handrail",
		Size = Vector3.new(0.25, 0.25, (d1 - d0) * math.sqrt(1 + slope * slope)),
		CFrame = at(frame, x, railY(middle), middle) * CFrame.Angles(math.atan(slope), 0, 0),
		Color = C.Metal,
		Material = Enum.Material.Metal,
	})
	for _, d in ipairs({ d0 + 0.25, d1 - 0.25 }) do
		local base = firstHeight + math.floor(d / L.RowDepth) * L.RowRise -- top of the row under the post
		local top = railY(d)
		standBox(ctx, frame, "HandrailPost", Vector3.new(0.25, top - base, 0.25), x, (base + top) / 2, d, C.Metal, Enum.Material.Metal)
	end
end

--[[
	Padded wall along the turf edge in front of the first row, with an opening at every stand x in
	`gaps` (in front of a walkable aisle). panels = { { x0, x1, text, color, live, look }, ... }:
	  live  a LiveText kind ("score"): a dark LED panel the server keeps up to date
	  look  { title, info, key }: a "Press E to look" section sign (dark plaque, white text)
]]
local function fieldWall(ctx, frame, length, gaps, panels)
	local team = ctx.colors
	local cuts = table.clone(gaps)
	table.sort(cuts)
	local spans, from = {}, -length / 2
	for _, x in ipairs(cuts) do
		table.insert(spans, { from, x - GAP_HALF })
		from = x + GAP_HALF
	end
	table.insert(spans, { from, length / 2 })
	for _, span in ipairs(spans) do
		standSpan(
			ctx,
			frame,
			"FieldWall",
			span[1],
			span[2],
			FIELD_WALL_HEIGHT,
			FIELD_WALL_HEIGHT / 2,
			0.8,
			-0.4,
			team.Primary,
			Enum.Material.Fabric
		)
		standSpan(
			ctx,
			frame,
			"FieldWallCap",
			span[1],
			span[2],
			0.3,
			FIELD_WALL_HEIGHT + 0.15,
			1,
			-0.4,
			team.Trim,
			Enum.Material.SmoothPlastic
		)
	end
	for index, panel in ipairs(panels) do
		local background = panel.color or team.Secondary
		local name = "WallSign" .. index
		if panel.live then
			background, name = SCREEN_DARK, "ScorePanel"
		elseif panel.look then
			background, name = PLAQUE_DARK, "SectionSign"
		end
		local sign = standSpan(ctx, frame, name, panel.x0, panel.x1, 2.3, 1.85, 0.2, -0.9, background, Enum.Material.SmoothPlastic, {
			CanCollide = false,
		})
		if panel.live then
			BuildUtil.LiveText(sign, TOWARD_FIELD, panel.live, {
				LabelName = "Live_" .. panel.live,
				Text = displayName(ctx) .. "  0 - 0  VISITORS",
				TextColor3 = SCREEN_TEXT,
				BackgroundColor3 = SCREEN_DARK,
				BackgroundTransparency = 0,
				LightInfluence = 0,
				PixelsPerStud = 20,
				Font = Enum.Font.GothamBlack,
			})
		else
			addText(sign, TOWARD_FIELD, panel.text, panel.look and WHITE or readable(background, team.Primary))
		end
		if panel.look then
			BuildUtil.Look(sign, panel.look.title, panel.look.info, { LookKey = panel.look.key })
		end
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

--[[
	Gold front-row seats with a team-coloured backrest on the rows in `rows`, at stand x = `x` (in
	the free slot next to a sideline aisle). Sitting in one switches to a camera view from just
	above the seats, looking across the field.
]]
local function tvSeats(ctx, frame, x, rows)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local team = ctx.colors
	for _, row in ipairs(rows) do
		local top = row * L.RowRise
		local d = (row - 1) * L.RowDepth + 1.3
		local seatCFrame = at(frame, x, top + 0.4, d) * FACE_FIELD
		local seatPosition = seatCFrame.Position
		BuildUtil.Seat(ctx, {
			Name = "TVSeat",
			Size = Vector3.new(TV_SEAT_WIDTH, 0.8, 1.8),
			CFrame = seatCFrame,
			Color = C.Gold,
			Material = Enum.Material.SmoothPlastic,
			Object = "Front Row Seat",
			Camera = {
				From = at(frame, x, top + 9 + row * 3, d + 7).Position,
				To = Vector3.new(seatPosition.X * 0.3, 0, L.FieldCenterZ),
				Fov = 55,
				Label = "SEATS",
			},
		})
		standBox(
			ctx,
			frame,
			"TVSeatBack",
			Vector3.new(TV_SEAT_WIDTH, 2.2, 0.4),
			x,
			top + 1.1,
			d + 1.1,
			team.Primary,
			Enum.Material.SmoothPlastic
		)
	end
end

---------------------------------------------------------------------------------------------
-- Lower sideline sections
---------------------------------------------------------------------------------------------

--[[
	One half of a lower sideline stand (between a tunnel and the corner), built over steps 1-4.
	Positions are given as u = distance from the section centre toward its OUTER end (the corner);
	outSign converts u to stand x. spec:
	  seatColors   colour blocks of the seat strips (outer / middle / inner)
	  chant        { text, color } for the long field-wall sign near the tunnel
	  section      { number, info, key } for the section sign
	  wallStage    step of the field wall (4)
	  tunnelHalf   half-width of the tunnel gap at the section's inner end
	The walkable aisle is the outer one (u = 26): it gets an entry step, an opening in the field
	wall, the section sign and the two TV seats.
]]
local function lowerSideline(ctx, frame, outSign, spec)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local length = L.SidelineStandsHalfLength - spec.tunnelHalf -- 106
	local function sx(u)
		return u * outSign
	end
	local walkX = sx(AISLE_OFFSET)

	BuildUtil.Stage(ctx, 1)
	concreteRows(ctx, frame, { length = length })

	BuildUtil.Stage(ctx, 2)
	seatStrips(ctx, frame, { length = length, splits = { -AISLE_OFFSET, AISLE_OFFSET }, colors = spec.seatColors })
	tvSeats(ctx, frame, sx(AISLE_OFFSET - TV_SEAT_OFFSET), { 1, 2 })

	BuildUtil.Stage(ctx, 3)
	for _, u in ipairs({ -AISLE_OFFSET, AISLE_OFFSET }) do
		stairAisle(ctx, frame, sx(u), L.RowRise, L.LowerRows, u > 0)
		handrail(ctx, frame, sx(u + RAIL_OFFSET), L.RowRise, L.LowerRows)
	end
	endCaps(ctx, frame, length, { outSign }, L.RowRise, L.LowerRows, C.ConcreteDark)

	BuildUtil.Stage(ctx, spec.wallStage)
	local name = displayName(ctx)
	fieldWall(ctx, frame, length, { walkX }, {
		{ x0 = sx(-47), x1 = sx(-7), text = spec.chant.text, color = spec.chant.color },
		{ x0 = sx(-3), x1 = sx(22.5), live = "score" },
		{
			x0 = sx(29.5),
			x1 = sx(38),
			text = "SEC " .. spec.section.number,
			look = { title = "Section " .. spec.section.number, info = spec.section.info, key = spec.section.key },
		},
		{ x0 = sx(40), x1 = sx(51.5), text = name },
	})
	backBand(ctx, frame, length, L.LowerTopHeight - 1, 1, L.LowerDepth, ctx.colors.Trim, "BackStripe")
end

--[[
	Tunnel walls, LED strips, header beam and runway through a lower sideline stand at the tunnel
	gap (|x| < halfWidth). zSign = 1 for the home tunnel (it runs toward +Z), -1 for the players'
	tunnel. texts = { field = <header text facing the field>, inside = <text seen from the tunnel> }
	plaque = { title, info, key }: a sign on the tunnel wall you can look at.
]]
local function tunnel(ctx, halfWidth, zSign, texts, plaque)
	local L = ctx.config.Layout
	local team = ctx.colors
	local depth = L.LowerDepth
	local frontZ = zSign > 0 and L.SurfaceMaxZ or L.SurfaceMinZ
	local midZ = frontZ + zSign * depth / 2
	local wallHeight = L.LowerTopHeight + 1
	local wallInner = halfWidth - 0.4 -- a little proud of the row ends so their faces don't z-fight
	local wallOuter = halfWidth + 0.8
	local wallX = (wallInner + wallOuter) / 2
	-- the walls run 0.2 past the stand's back wall so their faces don't z-fight with it
	-- (the upper deck's tunnel walls start where these end)
	local wallDepth = depth + TUNNEL_WALL_OVERHANG
	local wallZ = frontZ + zSign * wallDepth / 2
	for _, side in ipairs({ -1, 1 }) do
		BuildUtil.Box(
			ctx,
			"TunnelWall",
			Vector3.new(wallOuter - wallInner, wallHeight, wallDepth),
			Vector3.new(side * wallX, wallHeight / 2, wallZ),
			team.Primary,
			Enum.Material.Brick
		)
		-- LED strip along the inside of each wall (above head height)
		BuildUtil.Box(
			ctx,
			"TunnelLED",
			Vector3.new(0.15, 0.5, depth - 1),
			Vector3.new(side * (wallInner - 0.075), 10, midZ),
			team.Secondary,
			Enum.Material.Neon,
			{ CanCollide = false, CastShadow = false }
		)
		BuildUtil.Box(
			ctx,
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
		ctx,
		"TunnelHeader",
		Vector3.new(headerWidth, headerHeight, 2),
		Vector3.new(0, headerBottom + headerHeight / 2, frontZ + zSign),
		team.Secondary,
		Enum.Material.SmoothPlastic
	)
	-- Front faces -Z: toward the field for the home tunnel, into the tunnel for the players' tunnel
	local fieldFace = zSign > 0 and Enum.NormalId.Front or Enum.NormalId.Back
	local insideFace = zSign > 0 and Enum.NormalId.Back or Enum.NormalId.Front
	addText(header, fieldFace, texts.field, readable(team.Secondary, team.Primary), 16)
	addText(header, insideFace, texts.inside, readable(team.Secondary, team.Primary), 16)
	BuildUtil.Light(header, "SurfaceLight", { Name = "TunnelLight", Face = Enum.NormalId.Bottom, Range = 16, Brightness = 1.5, Angle = 80 })
	BuildUtil.Box(
		ctx,
		"TunnelHeaderTrim",
		Vector3.new(headerWidth, 0.5, 2.3),
		Vector3.new(0, headerBottom + headerHeight + 0.25, frontZ + zSign),
		team.Trim,
		Enum.Material.SmoothPlastic
	)

	-- Team-coloured runway on the tunnel floor (flat, non-collidable, above the walkway paint)
	BuildUtil.Box(
		ctx,
		"TunnelRunway",
		Vector3.new(16, 0.12, depth - 0.5),
		Vector3.new(0, 0.16, midZ + zSign * 0.25),
		team.Primary,
		Enum.Material.Fabric,
		{ CanCollide = false }
	)

	-- A plaque at eye height on the east wall's inside face, a few studs into the tunnel
	local sign = BuildUtil.Box(
		ctx,
		"TunnelPlaque",
		Vector3.new(0.15, 2.4, 4.5),
		Vector3.new(wallInner - 0.075, 5, frontZ + zSign * 5),
		PLAQUE_DARK,
		Enum.Material.SmoothPlastic,
		{ CanCollide = false }
	)
	addText(sign, Enum.NormalId.Left, texts.plaque, WHITE, 30)
	BuildUtil.Look(sign, plaque.title, plaque.info, { LookKey = plaque.key, Distance = 8 })
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
	`ends` = the Z the B legs start from (FieldBackZ / FieldFrontZ for a lower corner).
]]
local function cornerRowBlocks(ctx, sx, sz, firstRow, lastRow, ends)
	local L = ctx.config.Layout
	local colors = { ROW_LIGHT, ROW_DARK }
	for r = firstRow, lastRow do
		local g = ringRow(L, r)
		local zi = sz > 0 and g.backZi or g.frontZi
		local zo = sz > 0 and g.backZo or g.frontZo
		local color = colors[(r - firstRow) % #colors + 1]
		boundsBox(ctx, "Row" .. r .. "A", sx * L.CornerStartX, sx * g.xo, 0, g.height, zi, zo, color, Enum.Material.Concrete)
		boundsBox(ctx, "Row" .. r .. "B", sx * g.xi, sx * g.xo, 0, g.height, ends, zi, color, Enum.Material.Concrete)
	end
end

-- The seat strips of a corner's rows: they run along the outside edge of the L, like
-- BuildUtil.Rows' strips. Leg A carries on the sideline's colour, leg B the end's.
local function cornerSeatStrips(ctx, sx, sz, firstRow, lastRow, colorA, colorB, ends)
	local L = ctx.config.Layout
	local startX = L.CornerStartX
	for r = firstRow, lastRow do
		local g = ringRow(L, r)
		local zo = sz > 0 and g.backZo or g.frontZo
		local h = g.height
		-- 0.5 short of the neighbouring stands' row ends (where their end caps stand), like Rows
		boundsBox(ctx, "Row" .. r .. "SeatsA", sx * (startX + 0.5), sx * g.xo, h, h + 0.8, zo - sz, zo, colorA)
		boundsBox(ctx, "Row" .. r .. "SeatsB", sx * (g.xo - 1), sx * g.xo, h, h + 0.8, ends + sz * 0.5, zo - sz, colorB)
	end
end

--[[
	Diagonal aisle across a corner: a ramp along the 45 degree line from the inner corner of the
	first row (cornerX, cornerZ) outward. Like the stairs its slope climbs one row per row, so it
	passes over the front corner of every row. It starts `lead` studs early so its edges ride just
	above the L-shaped row corners instead of being notched by them.
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
	  labels              { { text = "...", x0 = <stand x>, x1 = <stand x> }, ... }
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
	local bandMin, bandMax = math.min(spec.x0, spec.x1), math.max(spec.x0, spec.x1)
	local ranges = {}
	for _, label in ipairs(spec.labels or {}) do
		local from, to = rangeOnBand(TOWARD_FIELD, bandMin, bandMax, label.x0, label.x1)
		local _, textLabel = BuildUtil.SurfaceText(band, TOWARD_FIELD, label.text, {
			LabelName = band.Name .. "Text" .. (#ranges + 1),
			TextColor3 = readable(team.Primary, team.Trim),
			PixelsPerStud = 12,
			Font = Enum.Font.GothamBlack,
		})
		textLabel.Position = UDim2.new(from, 0, 0, 0)
		textLabel.Size = UDim2.new(to - from, 0, 1, 0)
		table.insert(ranges, { from, to })
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

--[[
	Upper-deck rows (step `stages.rows`), seat strips (`stages.seats`) and stair aisles, handrails,
	end caps and the glass back rail (`stages.rails`) of one section of an upper sideline deck.
	outSign: stand-x direction of the section's outer end (the corner).
]]
local function upperSideline(ctx, frame, outSign, stages, seatColors)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local length = L.SidelineStandsHalfLength - L.TunnelHalfWidth
	BuildUtil.Stage(ctx, stages.rows)
	concreteRows(ctx, frame, { name = "UpperRow", length = length, rows = L.UpperRows, firstHeight = L.UpperStartHeight })
	BuildUtil.Stage(ctx, stages.seats)
	seatStrips(ctx, frame, {
		name = "UpperRow",
		length = length,
		rows = L.UpperRows,
		firstHeight = L.UpperStartHeight,
		splits = { -AISLE_OFFSET, AISLE_OFFSET },
		colors = seatColors,
	})
	BuildUtil.Stage(ctx, stages.rails)
	for _, u in ipairs({ -AISLE_OFFSET, AISLE_OFFSET }) do
		stairAisle(ctx, frame, u * outSign, L.UpperStartHeight, L.UpperRows, false)
		handrail(ctx, frame, (u + RAIL_OFFSET) * outSign, L.UpperStartHeight, L.UpperRows)
	end
	endCaps(ctx, frame, length, { outSign }, L.UpperStartHeight, L.UpperRows, C.ConcreteDark)
	backRail(ctx, frame, length, L.UpperTopHeight, L.UpperDepth)
end

--[[
	Section sign + "stairs" buttons on an upper deck's facade (frame = the deck's stand frame, its
	front face at d = 0). The lower bowl's top row runs right along the facade, so:
	  * a section plaque in line with the walkable aisle (stand x = aisleX) you can look at
	  * a STAIRS UP panel a few studs along (toward `dir`): rides you to the upper deck's first row
	  * a STAIRS DOWN sign on the parapet further along: rides you back down to the top of the
	    lower bowl's walkable aisle
	The two stairs buttons are 5 studs apart in x with short prompt ranges, so each is only offered
	on its own level. section = { number, info, key }
	Both targets need the lower bowl's top row, which is always built first (Items requirements).
]]
local function deckAccess(ctx, frame, aisleX, dir, section)
	local L = ctx.config.Layout
	local team = ctx.colors
	local upX = aisleX + dir * 6
	local downX = aisleX + dir * 11
	local plaque =
		standBox(ctx, frame, "SectionPlaque", Vector3.new(5, 3, 0.2), aisleX, 14.9, -0.5, PLAQUE_DARK, Enum.Material.SmoothPlastic, {
			CanCollide = false,
		})
	addText(plaque, TOWARD_FIELD, "SEC " .. section.number, WHITE, 20)
	BuildUtil.Look(plaque, "Section " .. section.number, section.info, { LookKey = section.key })

	local upSign =
		standBox(ctx, frame, "StairsUpSign", Vector3.new(3.4, 3, 0.2), upX, 14.9, -0.5, team.Secondary, Enum.Material.SmoothPlastic, {
			CanCollide = false,
		})
	addText(upSign, TOWARD_FIELD, "STAIRS UP", readable(team.Secondary, team.Primary), 20)
	-- arrive on the first upper row behind the STAIRS DOWN sign, looking out over the field
	BuildUtil.Elevator(ctx, upSign, at(frame, downX, L.UpperStartHeight, 1.6) * FACE_FIELD, {
		Action = "Climb the stairs",
		Object = "Upper Deck",
		Label = "UPPER DECK - SECTION " .. section.number,
		Distance = 5,
	})

	local downSign = standBox(
		ctx,
		frame,
		"StairsDownSign",
		Vector3.new(3.4, 1.1, 0.25),
		downX,
		L.UpperStartHeight + 0.6,
		0.125,
		team.Secondary,
		Enum.Material.SmoothPlastic,
		{ CanCollide = false }
	)
	addText(downSign, AWAY_FROM_FIELD, "STAIRS DOWN", readable(team.Secondary, team.Primary), 20)
	-- arrive on the lower bowl's top row at the top of its stair aisle, in front of the section
	-- plaque (the lower bowl lies L.LowerDepth in front of this deck: the target is 2.4 studs in
	-- front of the facade, clear of the seat strips, in the aisle gap where Crowd seats no fans)
	BuildUtil.Elevator(ctx, downSign, at(frame, aisleX, L.LowerTopHeight, -2.4) * FACE_FIELD, {
		Action = "Go down the stairs",
		Object = "Lower Bowl",
		Label = "LOWER BOWL",
		Distance = 5,
	})
end

---------------------------------------------------------------------------------------------
-- Lower bowl
---------------------------------------------------------------------------------------------

function Stands.bleachers_home(ctx)
	local L = ctx.config.Layout
	local team = ctx.colors
	local tunnelHalf = L.BackTunnelHalfWidth
	local centre = (tunnelHalf + L.SidelineStandsHalfLength) / 2
	local sections = {
		[-1] = {
			number = "108",
			info = "Home Stands, lower level: the loudest seats in the stadium! Fun fact: when these fans stomp, the whole bowl rumbles.",
		},
		[1] = {
			number = "114",
			info = "Right behind the home bench, so the players hear every cheer. Fun fact: fans here count down the last ten seconds of every win!",
		},
	}

	-- Two sections either side of the HOME tunnel (side = -1 west, 1 east). The home stands look
	-- toward +Z, so stand x runs toward -X: the section's outer end is at stand x = -side * length / 2.
	for _, side in ipairs({ -1, 1 }) do
		local sectionCtx = BuildUtil.Child(ctx, side < 0 and "WestSection" or "EastSection")
		local frame = CFrame.new(side * centre, 0, L.SurfaceMaxZ) * TURN
		lowerSideline(sectionCtx, frame, -side, {
			seatColors = { team.Secondary, team.Primary, team.Secondary },
			chant = side > 0 and { text = "GO " .. displayName(ctx) .. "!", color = team.Trim }
				or { text = "DE-FENSE!", color = team.Trim },
			section = { number = sections[side].number, info = sections[side].info, key = "record" },
			wallStage = 4,
			tunnelHalf = tunnelHalf,
		})
	end

	-- Step 5: the HOME tunnel, from the back sideline through the stands toward the locker rooms
	BuildUtil.Stage(ctx, 5)
	tunnel(BuildUtil.Child(ctx, "HomeTunnel"), tunnelHalf, 1, {
		field = "HOME TEAM: " .. displayName(ctx),
		inside = "LOCKER ROOMS",
		plaque = "HOME TUNNEL",
	}, {
		title = "Home Tunnel",
		info = "Your team charges out of this tunnel before every kick-off. Behind it: the locker rooms and the team campus.",
		key = "team",
	})
end

function Stands.bleachers_visitor(ctx)
	local L = ctx.config.Layout
	local team = ctx.colors
	local tunnelHalf = L.TunnelHalfWidth
	local depth = L.LowerDepth
	local centre = (tunnelHalf + L.SidelineStandsHalfLength) / 2
	local sections = {
		[-1] = {
			number = "138",
			info = "Visitor Stands, lower level. Fun fact: away fans sit here, but home fans always sneak in to cheer louder!",
		},
		[1] = {
			number = "132",
			info = "Visitor Stands, next to the players' tunnel. Fun fact: fans here are the first to see the teams run out!",
		},
	}

	-- Two sections either side of the players' tunnel (side = -1 west, 1 east); stand x == world x
	-- offset here, so the outer end is at stand x = side * length / 2.
	for _, side in ipairs({ -1, 1 }) do
		local sectionCtx = BuildUtil.Child(ctx, side < 0 and "WestSection" or "EastSection")
		local frame = CFrame.new(side * centre, 0, L.SurfaceMinZ)
		lowerSideline(sectionCtx, frame, side, {
			seatColors = { team.Secondary, team.Primary, team.Secondary },
			chant = { text = side < 0 and "VISITORS" or displayName(ctx), color = side < 0 and team.Trim or nil },
			section = { number = sections[side].number, info = sections[side].info, key = "season" },
			wallStage = 4,
			tunnelHalf = tunnelHalf,
		})
		-- concourse gates on the plaza-facing outside wall (hidden once the upper deck is built)
		for _, x in ipairs({ -26, 26 }) do
			gate(sectionCtx, frame, x, depth, plazaGateLabel(side * centre + x))
		end
	end

	-- Step 4 (with the field wall): the players' tunnel from the plaza onto the field
	BuildUtil.Stage(ctx, 4)
	tunnel(BuildUtil.Child(ctx, "PlayersTunnel"), tunnelHalf, -1, {
		field = "WELCOME TO " .. displayName(ctx) .. " STADIUM",
		inside = "PLAYERS' TUNNEL",
		plaque = "PLAYERS' TUNNEL",
	}, {
		title = "Players' Tunnel",
		info = "Both teams walk out onto the field through here on game day. Behind you: the plaza and the visitor locker room.",
		key = "season",
	})
end

local function endZoneStand(ctx, side, chant, section)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local team = ctx.colors
	local name = displayName(ctx)
	-- west (side -1): rows step toward -X; east (side 1): rows step toward +X
	local frame = endFrame(L, side, L.SurfaceHalfX)
	local length = L.FieldWidth
	local aisleXs = { -AISLE_OFFSET, AISLE_OFFSET }

	BuildUtil.Stage(ctx, 1)
	concreteRows(ctx, frame, { length = length })

	BuildUtil.Stage(ctx, 2)
	seatStrips(ctx, frame, { length = length, splits = aisleXs, colors = { team.Primary, team.Secondary, team.Primary } })

	-- Step 3: both aisles can be climbed from the end zone through openings in the field wall
	BuildUtil.Stage(ctx, 3)
	for _, x in ipairs(aisleXs) do
		stairAisle(ctx, frame, x, L.RowRise, L.LowerRows, true)
		handrail(ctx, frame, x + math.sign(x) * RAIL_OFFSET, L.RowRise, L.LowerRows)
	end
	endCaps(ctx, frame, length, { -1, 1 }, L.RowRise, L.LowerRows, C.ConcreteDark)
	fieldWall(ctx, frame, length, aisleXs, {
		{ x0 = -51, x1 = -29.5, text = name },
		{ x0 = -20, x1 = 20, text = chant, color = team.Trim },
		{
			x0 = 29.5,
			x1 = 51,
			text = "SECTION " .. section.number,
			look = { title = "Section " .. section.number, info = section.info, key = "titles" },
		},
	})
	backBand(ctx, frame, length, L.LowerTopHeight - 1, 1, L.LowerDepth, team.Trim, "BackStripe")
	-- team flags at the two back corners
	local top = L.LowerTopHeight
	local back = L.LowerDepth - 1.2
	flag(ctx, frame, -(length / 2 - 1.5), back, top, 12, 1, team.Primary)
	flag(ctx, frame, length / 2 - 1.5, back, top, 12, -1, team.Secondary)
end

function Stands.endzone_stands_west(ctx)
	endZoneStand(ctx, -1, "DE-FENSE!", {
		number = "121",
		info = "West end zone seats, right behind the goal posts. Fun fact: big field goals sometimes sail all the way up here - bring a glove!",
	})
end

function Stands.endzone_stands_east(ctx)
	endZoneStand(ctx, 1, "TOUCHDOWN!", {
		number = "101",
		info = "East end zone seats. Fun fact: most touchdown dances happen right in front of you - dance along!",
	})
end

-- The four lower corners: they join the sideline stands to the end-zone stands so the lower
-- bowl becomes one closed ring (only the two tunnels stay open).
function Stands.corner_seats(ctx)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local team = ctx.colors
	local name = displayName(ctx)
	local startX = L.CornerStartX -- 120: where the sideline stands end
	local turfX = L.SurfaceHalfX -- 135
	local outerX = L.EndLowerOuterX -- 159
	local top = L.LowerTopHeight
	local sections = {
		["-1,-1"] = { "126", "Front corner seats. Fun fact: from a corner you can see both end zones and the whole field at once!" },
		["1,-1"] = { "103", "Front corner seats, next to the visitor stands. Fun fact: corner fans get the best view of trick plays!" },
		["-1,1"] = { "116", "Back corner seats near the home stands. Fun fact: the team's mascot loves to wave to this corner!" },
		["1,1"] = { "111", "Back corner seats. Fun fact: when the bowl is full, the wave starts right here and goes all the way round!" },
	}

	for _, corner in ipairs({ { -1, -1 }, { 1, -1 }, { -1, 1 }, { 1, 1 } }) do
		local sx, sz = corner[1], corner[2]
		local cornerCtx = BuildUtil.Child(ctx, (sz > 0 and "Back" or "Front") .. (sx > 0 and "East" or "West") .. "Corner")
		local turfZ = sz > 0 and L.SurfaceMaxZ or L.SurfaceMinZ -- 95 / -35
		local endZ = sz > 0 and L.FieldBackZ or L.FieldFrontZ -- 83 / -23: where the end stands end
		local outerZ = turfZ + sz * L.LowerDepth -- 119 / -59
		local section = sections[sx .. "," .. sz]

		BuildUtil.Stage(cornerCtx, 1)
		cornerRowBlocks(cornerCtx, sx, sz, 1, L.LowerRows, endZ)

		-- leg A carries on the sideline stands' outer colour, leg B the end stands'
		BuildUtil.Stage(cornerCtx, 2)
		cornerSeatStrips(cornerCtx, sx, sz, 1, L.LowerRows, team.Secondary, team.Primary, endZ)

		-- Step 3: diagonal aisle (a ramp) entered from the turf corner through a gap in the walls
		BuildUtil.Stage(cornerCtx, 3)
		local lead = 1.1
		diagonalAisle(cornerCtx, sx, sz, sx * turfX, turfZ, L.RowRise, L.LowerRows, lead, 3, C.Walkway)
		local entryOut = (lead + 1) / math.sqrt(2)
		BuildUtil.Part(cornerCtx, {
			Name = "AisleEntryStep",
			Size = Vector3.new(3, 1, 2),
			CFrame = CFrame.new(sx * (turfX - entryOut), 0.5, turfZ - sz * entryOut) * CFrame.Angles(0, math.atan2(sx, sz), 0),
			Color = C.Walkway,
			Material = Enum.Material.Concrete,
		})

		-- Padded field wall carried round the turf corner (leg A along the sideline, leg B along
		-- the end), open at the corner itself, with a sign on each leg facing the field.
		local wallTop = FIELD_WALL_HEIGHT
		local gapX, gapZ = turfX - CORNER_GAP, turfZ - sz * CORNER_GAP
		boundsBox(cornerCtx, "FieldWall", sx * startX, sx * gapX, 0, wallTop, turfZ - sz * 0.8, turfZ, team.Primary, Enum.Material.Fabric)
		boundsBox(cornerCtx, "FieldWall", sx * (turfX - 0.8), sx * turfX, 0, wallTop, endZ, gapZ, team.Primary, Enum.Material.Fabric)
		boundsBox(cornerCtx, "FieldWallCap", sx * startX, sx * gapX, wallTop, wallTop + 0.3, turfZ - sz * 0.9, turfZ + sz * 0.1, team.Trim)
		boundsBox(cornerCtx, "FieldWallCap", sx * (turfX - 0.9), sx * (turfX + 0.1), wallTop, wallTop + 0.3, endZ, gapZ, team.Trim)
		local signA = boundsBox(
			cornerCtx,
			"WallSignA",
			sx * (startX + 2),
			sx * (gapX - 1),
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
			"SectionSign",
			sx * (turfX - 0.8),
			sx * (turfX - 1),
			0.7,
			3,
			endZ + sz * 1.5,
			gapZ - sz * 1,
			PLAQUE_DARK,
			Enum.Material.SmoothPlastic,
			{ CanCollide = false }
		)
		addText(signB, sx > 0 and Enum.NormalId.Left or Enum.NormalId.Right, "SEC " .. section[1], WHITE)
		BuildUtil.Look(signB, "Section " .. section[1], section[2], { LookKey = "rating" })

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
	local name = displayName(ctx)
	local tunnelHalf = L.BackTunnelHalfWidth
	local outer = L.SidelineStandsHalfLength
	local length = outer - tunnelHalf
	local centre = (tunnelHalf + outer) / 2
	local depth = L.UpperDepth
	local top = L.UpperTopHeight
	local frontZ = L.BackLowerOuterZ
	local frame = CFrame.new(0, 0, frontZ) * TURN -- whole stand; stand x = -world x
	local seatColors = { team.Primary, team.Secondary, team.Primary }
	local face = depth + CLADDING
	local sections = {
		[-1] = {
			number = "308",
			info = "Home upper deck: you can follow every play from up here. Fun fact: on a clear day you can spot the team campus behind the stadium!",
		},
		[1] = {
			number = "314",
			info = "Home upper deck, high above the home bench. Fun fact: the scouts say this is the best seat to watch the quarterback!",
		},
	}

	-- Steps 1-3 of the two sections either side of the HOME tunnel (side = -1 west, 1 east). In the
	-- whole-stand frame the west section covers stand x 14..120 and the east one -120..-14.
	for _, side in ipairs({ -1, 1 }) do
		local sectionCtx = BuildUtil.Child(ctx, side < 0 and "WestSection" or "EastSection")
		local sectionFrame = CFrame.new(side * centre, 0, frontZ) * TURN
		upperSideline(sectionCtx, sectionFrame, -side, { rows = 1, seats = 2, rails = 3 }, seatColors)

		-- Step 3: concrete cladding on the back wall, the facade (its middle comes with the
		-- bridge), outside bands, the section plaque and the stairs between the decks
		BuildUtil.Stage(sectionCtx, 3)
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
		local s = -side -- whole-frame stand x of this section's outer end is s * outer
		facadeSpan(sectionCtx, frame, {
			x0 = s * tunnelHalf,
			x1 = s * outer,
			labels = { { text = side < 0 and "HOME OF THE " .. name or name .. " NATION", x0 = s * 18, x1 = s * 78 } },
		})
		bandSpan(sectionCtx, frame, s * tunnelHalf, s * outer, 11.2, 1.4, face, team.Primary, "ConcourseBand")
		-- the press box (X -44..44) later stands right in front of the middle of the stand, so the
		-- name sits on the outer part of each section's band
		local nameBand = bandSpan(sectionCtx, frame, s * tunnelHalf, s * outer, 18.5, 4, face, team.Primary, "NameBand")
		local from, to =
			rangeOnBand(AWAY_FROM_FIELD, math.min(s * tunnelHalf, s * outer), math.max(s * tunnelHalf, s * outer), s * 50, s * 110)
		addTextRanges(nameBand, AWAY_FROM_FIELD, name .. " STADIUM", readable(team.Primary, team.Trim), { { from, to } })
		bandSpan(sectionCtx, frame, s * tunnelHalf, s * outer, top - 1.2, 1.2, face, team.Secondary, "TopBand")
		-- near the end, clear of the home locker room (X 45..110) and the press box stair cores
		gate(sectionCtx, frame, s * 114, face, side < 0 and "GATE E" or "GATE F")
		-- flags along the top (clear of the press box in the middle)
		for index, x in ipairs({ 70, 110 }) do
			flag(sectionCtx, frame, s * x, depth - 1.2, top, 9, -s, index % 2 == 0 and team.Primary or team.Secondary)
		end
		deckAccess(sectionCtx, frame, s * (AISLE_OFFSET + centre), -s, {
			number = sections[side].number,
			info = sections[side].info,
			key = "team",
		})
	end

	-- Step 4: the bridge over the HOME tunnel (only above the lower bowl's top, so the tunnel stays
	-- open underneath) with the middle of the facade and of the outside bands
	BuildUtil.Stage(ctx, 4)
	local bridgeCtx = BuildUtil.Child(ctx, "TunnelBridge")
	local bridgeBottom = L.LowerTopHeight
	for row = 1, L.UpperRows do
		local rowTop = L.UpperStartHeight + (row - 1) * L.RowRise
		local d = (row - 0.5) * L.RowDepth
		standBox(
			bridgeCtx,
			frame,
			"BridgeRow" .. row,
			Vector3.new(tunnelHalf * 2, rowTop - bridgeBottom, L.RowDepth),
			0,
			(rowTop + bridgeBottom) / 2,
			d,
			row % 2 == 1 and ROW_LIGHT or ROW_DARK,
			Enum.Material.Concrete
		)
		standBox(
			bridgeCtx,
			frame,
			"BridgeRow" .. row .. "Seats",
			Vector3.new(tunnelHalf * 2 + 1, 0.8, 1),
			0,
			rowTop + 0.4,
			d + (L.RowDepth / 2 - 0.5),
			team.Primary,
			Enum.Material.SmoothPlastic
		)
	end
	backRail(bridgeCtx, frame, tunnelHalf * 2, top, depth)
	-- tunnel walls under the bridge (a little proud of the row ends) + the runway continues.
	-- They start where the lower bowl's tunnel walls end (those overhang the lower back wall).
	for _, side in ipairs({ -1, 1 }) do
		standSpan(
			bridgeCtx,
			frame,
			"TunnelWall",
			side * (tunnelHalf - 0.4),
			side * tunnelHalf,
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
	standBox(
		bridgeCtx,
		frame,
		"BackCladding",
		Vector3.new(tunnelHalf * 2, top - bridgeBottom, CLADDING),
		0,
		(top + bridgeBottom) / 2,
		depth + CLADDING / 2,
		C.Concrete,
		Enum.Material.Concrete
	)
	local lintel = standBox(bridgeCtx, frame, "TunnelLintel", Vector3.new(tunnelHalf * 2, 4.5, 0.3), 0, 15.25, face + 0.15, team.Secondary)
	addText(lintel, AWAY_FROM_FIELD, "HOME TEAM TUNNEL", readable(team.Secondary, team.Primary))
	facadeSpan(bridgeCtx, frame, { x0 = -tunnelHalf, x1 = tunnelHalf })
	bandSpan(bridgeCtx, frame, -tunnelHalf, tunnelHalf, 11.2, 1.4, face, team.Primary, "ConcourseBand")
	bandSpan(bridgeCtx, frame, -tunnelHalf, tunnelHalf, 18.5, 4, face, team.Primary, "NameBand")
	bandSpan(bridgeCtx, frame, -tunnelHalf, tunnelHalf, top - 1.2, 1.2, face, team.Secondary, "TopBand")
end

function Stands.upper_visitor(ctx)
	local L = ctx.config.Layout
	local team = ctx.colors
	local name = displayName(ctx)
	local tunnelHalf = L.TunnelHalfWidth
	local outer = L.SidelineStandsHalfLength
	local length = outer - tunnelHalf
	local centre = (tunnelHalf + outer) / 2
	local depth = L.UpperDepth
	local top = L.UpperTopHeight
	local frontZ = L.FrontLowerOuterZ
	local backZ = L.FrontUpperOuterZ
	local frame = CFrame.new(0, 0, frontZ) -- whole stand; stand x == world x
	local seatColors = { team.Primary, team.Secondary, team.Primary }
	local sections = {
		[-1] = {
			number = "338",
			info = "Visitor upper deck. Fun fact: the TV cameras love the view from up here - wave and you might be on the big screen!",
		},
		[1] = {
			number = "332",
			info = "Visitor upper deck, right next to the TV booth. Fun fact: you can hear the announcers shouting when your team scores!",
		},
	}

	for _, side in ipairs({ -1, 1 }) do
		local sectionCtx = BuildUtil.Child(ctx, side < 0 and "WestSection" or "EastSection")
		local sectionFrame = CFrame.new(side * centre, 0, frontZ) -- stand x == world x offset here
		upperSideline(sectionCtx, sectionFrame, side, { rows = 1, seats = 2, rails = 3 }, seatColors)
		-- Step 3: plaza-facing outside wall (bands, gates and hanging team banners), the section
		-- plaque and the stairs between the decks
		BuildUtil.Stage(sectionCtx, 3)
		backBand(sectionCtx, sectionFrame, length, 11.2, 1.4, depth, team.Primary, "ConcourseBand")
		backBand(sectionCtx, sectionFrame, length, top - 2, 2, depth, team.Secondary, "TopBand")
		for _, x in ipairs({ -26, 26 }) do
			gate(sectionCtx, sectionFrame, x, depth, plazaGateLabel(side * centre + x))
		end
		for index, x in ipairs({ -40, 0, 40 }) do
			standBox(
				sectionCtx,
				sectionFrame,
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
		deckAccess(sectionCtx, frame, side * (AISLE_OFFSET + centre), -side, {
			number = sections[side].number,
			info = sections[side].info,
			key = "owner",
		})
	end

	-- Bridge over the players' tunnel (only above the lower bowl's top, so the tunnel stays open):
	-- its rows and tunnel walls come with step 1, its seats with step 2, the rest with step 3
	local bridgeCtx = BuildUtil.Child(ctx, "TunnelBridge")
	local bridgeBottom = L.LowerTopHeight
	for row = 1, L.UpperRows do
		local rowTop = L.UpperStartHeight + (row - 1) * L.RowRise
		local z = frontZ - (row - 0.5) * L.RowDepth
		BuildUtil.Stage(ctx, 1)
		BuildUtil.Box(
			bridgeCtx,
			"BridgeRow" .. row,
			Vector3.new(tunnelHalf * 2, rowTop - bridgeBottom, L.RowDepth),
			Vector3.new(0, (rowTop + bridgeBottom) / 2, z),
			row % 2 == 1 and ROW_LIGHT or ROW_DARK,
			Enum.Material.Concrete
		)
		BuildUtil.Stage(ctx, 2)
		BuildUtil.Box(
			bridgeCtx,
			"BridgeRow" .. row .. "Seats",
			Vector3.new(tunnelHalf * 2 + 1, 0.8, 1),
			Vector3.new(0, rowTop + 0.4, z - (L.RowDepth / 2 - 0.5)),
			team.Primary,
			Enum.Material.SmoothPlastic
		)
	end
	-- tunnel walls under the bridge (a little proud of the row ends). They start where the lower
	-- bowl's tunnel walls end (those overhang z = frontZ slightly).
	BuildUtil.Stage(ctx, 1)
	local bridgeWallFront = frontZ - TUNNEL_WALL_OVERHANG
	for _, side in ipairs({ -1, 1 }) do
		BuildUtil.Box(
			bridgeCtx,
			"TunnelWall",
			Vector3.new(0.4, bridgeBottom, bridgeWallFront - backZ),
			Vector3.new(side * (tunnelHalf - 0.2), bridgeBottom / 2, (bridgeWallFront + backZ) / 2),
			team.Primary,
			Enum.Material.Brick
		)
	end

	BuildUtil.Stage(ctx, 3)
	backRail(bridgeCtx, frame, tunnelHalf * 2, top, depth)
	local lintel = BuildUtil.Box(
		bridgeCtx,
		"TunnelLintel",
		Vector3.new(tunnelHalf * 2, 3.6, 0.4),
		Vector3.new(0, bridgeBottom + 1.8, backZ - 0.2),
		team.Secondary,
		Enum.Material.SmoothPlastic
	)
	addText(lintel, Enum.NormalId.Front, "PLAYERS' TUNNEL", readable(team.Secondary, team.Primary))
	local nameSign = BuildUtil.Box(
		bridgeCtx,
		"StadiumSign",
		Vector3.new(tunnelHalf * 2, 9, 0.4),
		Vector3.new(0, bridgeBottom + 8.5, backZ - 0.2),
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	addText(nameSign, Enum.NormalId.Front, name .. " STADIUM", readable(team.Primary, team.Trim))
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
	-- middle of it is hidden behind the tunnel header, and the stairs signs stand in front of it
	-- near the corners, so the text sits in between.
	facadeSpan(ctx, frame, {
		x0 = -outer,
		x1 = outer,
		labels = {
			{ text = name .. " STADIUM", x0 = -78, x1 = -18 },
			{ text = "GO " .. name .. "!", x0 = 18, x1 = 78 },
		},
	})
end

--[[
	Upper bowl ends: upper rows 7-12 behind both end zones plus the four upper corners, which
	closes the upper deck into a full ring. Per side (sx) every row is one long block along the
	end (it also covers the corners' end legs, step 1) plus a corner leg at the back and at the
	front (step 2). Step 3 adds the seat strips, step 4 the stairs, facade, top rail, concrete
	cladding and outside bands, which all run on round the corners.
]]
local function upperRingEnd(ctx, sx, facadeText, gateLabels, section)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local team = ctx.colors
	local name = displayName(ctx)
	local startX = L.CornerStartX -- 120
	local innerX = L.EndLowerOuterX -- 159: front face of the upper ring's ends
	local outerX = L.EndUpperOuterX -- 183: outside wall
	local backInnerZ, frontInnerZ = L.BackLowerOuterZ, L.FrontLowerOuterZ -- 119 / -59
	local backOuterZ, frontOuterZ = L.BackUpperOuterZ, L.FrontUpperOuterZ -- 143 / -83
	local depth = L.UpperDepth
	local top = L.UpperTopHeight
	local first, last = L.LowerRows + 1, L.LowerRows + L.UpperRows
	local function rowColor(r)
		return (r - first) % 2 == 0 and ROW_LIGHT or ROW_DARK
	end

	-- Step 1: the end rows ---------------------------------------------------------------------
	BuildUtil.Stage(ctx, 1)
	for r = first, last do
		local g = ringRow(L, r)
		boundsBox(
			ctx,
			"UpperRow" .. r .. "End",
			sx * g.xi,
			sx * g.xo,
			0,
			g.height,
			g.frontZi,
			g.backZi,
			rowColor(r),
			Enum.Material.Concrete
		)
	end

	-- Step 2: the corner rows ------------------------------------------------------------------
	BuildUtil.Stage(ctx, 2)
	for r = first, last do
		local g = ringRow(L, r)
		local h = g.height
		boundsBox(
			ctx,
			"UpperRow" .. r .. "BackCorner",
			sx * startX,
			sx * g.xo,
			0,
			h,
			g.backZi,
			g.backZo,
			rowColor(r),
			Enum.Material.Concrete
		)
		boundsBox(
			ctx,
			"UpperRow" .. r .. "FrontCorner",
			sx * startX,
			sx * g.xo,
			0,
			h,
			g.frontZo,
			g.frontZi,
			rowColor(r),
			Enum.Material.Concrete
		)
	end

	-- Step 3: seat strips along the outside edge of the ring band (0.5 short of the sideline
	-- decks' end caps): the end in the team's second colour, the corners in the main colour
	BuildUtil.Stage(ctx, 3)
	for r = first, last do
		local g = ringRow(L, r)
		local h = g.height
		boundsBox(ctx, "UpperRow" .. r .. "SeatsEnd", sx * (g.xo - 1), sx * g.xo, h, h + 0.8, g.frontZo + 1, g.backZo - 1, team.Secondary)
		boundsBox(ctx, "UpperRow" .. r .. "SeatsBack", sx * (startX + 0.5), sx * g.xo, h, h + 0.8, g.backZo - 1, g.backZo, team.Primary)
		boundsBox(ctx, "UpperRow" .. r .. "SeatsFront", sx * (startX + 0.5), sx * g.xo, h, h + 0.8, g.frontZo, g.frontZo + 1, team.Primary)
	end

	-- Step 4: stairs, facades, railings and the outside walls ------------------------------------
	BuildUtil.Stage(ctx, 4)
	-- two stair aisles behind the end zone (in line with the lower ones) + a diagonal ramp per corner
	local frame = endFrame(L, sx, innerX)
	for _, x in ipairs({ -AISLE_OFFSET, AISLE_OFFSET }) do
		stairAisle(ctx, frame, x, L.UpperStartHeight, L.UpperRows, false)
		handrail(ctx, frame, x + math.sign(x) * RAIL_OFFSET, L.UpperStartHeight, L.UpperRows)
	end
	diagonalAisle(ctx, sx, 1, sx * innerX, backInnerZ, L.UpperStartHeight, L.UpperRows, 0.5, 3, C.Walkway)
	diagonalAisle(ctx, sx, -1, sx * innerX, frontInnerZ, L.UpperStartHeight, L.UpperRows, 0.5, 3, C.Walkway)

	-- Facade round the front face: one band along the end (inner corner to inner corner) and a
	-- leg along each corner that meets it at the inside corner (bands, caps and stripes butt up
	-- against each other instead of overlapping). The text stays behind the end zone, clear of
	-- the section plaque and stairs signs next to the aisle at stand x = 26.
	local endHalf = (backInnerZ - frontInnerZ) / 2 -- 89: stand x along the end runs -89..89
	facadeSpan(ctx, frame, {
		x0 = -endHalf,
		x1 = endHalf,
		capX0 = -endHalf - 0.15,
		capX1 = endHalf + 0.15,
		stripeX0 = -endHalf + 0.4,
		stripeX1 = endHalf - 0.4,
		labels = { { text = facadeText, x0 = -21, x1 = 21 } },
	})
	deckAccess(ctx, frame, AISLE_OFFSET, 1, section)
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
	upperRingEnd(westCtx, -1, "LOUD AND PROUD", { "GATE K", "GATE L" }, {
		number = "321",
		info = "West upper end, way up behind the goal posts. Fun fact: from here the players look like action figures - but you can see every route they run!",
		key = "titles",
	})
	local eastCtx = BuildUtil.Child(ctx, "EastEnd")
	upperRingEnd(eastCtx, 1, displayName(ctx) .. " FOOTBALL", { "GATE H", "GATE J" }, {
		number = "301",
		info = "East upper end, the highest end-zone seats. Fun fact: fans up here hold up giant cards to spell the team's name!",
		key = "titles",
	})
end

return Stands
