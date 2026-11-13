--[[
	Stands
	The seating bowl: the lower stands on both sidelines and behind both end zones, plus the
	two sideline upper decks.

	Every stand is built in its own "stand space": a CFrame at ground level on the front-centre
	edge of the first row (the edge nearest the field) whose LookVector points AWAY from the field
	(the same StartCFrame BuildUtil.Rows uses). In stand space:
	  x  runs along the rows
	  y  is up (y = 0 is the plot surface)
	  d  is the distance away from the field (stand-local -Z): d = 0 is the field-side face of
	     row 1 and d = rows * RowDepth is the back wall of the stand.
	Faces: Enum.NormalId.Back faces the field, Enum.NormalId.Front faces away from it.
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)

local Stands = {}

local TOWARD_FIELD = Enum.NormalId.Back
local AWAY_FROM_FIELD = Enum.NormalId.Front

local FIELD_WALL_HEIGHT = 3.5
local FACADE_BOTTOM = 12.8 -- just above the seat strips on the lower bowl's top row
local FACADE_TOP = 17 -- one stud above the upper deck's first row (acts as its front parapet)
local GATE_DARK = Color3.fromRGB(28, 28, 34)

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

local function addText(part, face, text, textColor, pixelsPerStud)
	return BuildUtil.SurfaceText(part, face, text, {
		LabelName = part.Name .. "Text",
		TextColor3 = textColor,
		PixelsPerStud = pixelsPerStud or 20,
		Font = Enum.Font.GothamBlack,
	})
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

-- Glass safety rail along the top back edge of a stand.
local function backRail(ctx, frame, length, topHeight, depth)
	standBox(
		ctx,
		frame,
		"BackRail",
		Vector3.new(length, 1.6, 0.25),
		0,
		topHeight + 0.8,
		depth - 0.125,
		ctx.config.Colors.Glass,
		Enum.Material.Glass,
		{ Transparency = 0.4 }
	)
end

-- A horizontal band on the outside (back) wall of a stand. `face` = d of the wall surface.
local function backBand(ctx, frame, length, bottom, height, face, color, name)
	return standBox(
		ctx,
		frame,
		name or "BackBand",
		Vector3.new(length, height, 0.3),
		0,
		bottom + height / 2,
		face + 0.15,
		color,
		Enum.Material.SmoothPlastic,
		{ CanCollide = false }
	)
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
	BuildUtil.Cylinder(
		ctx,
		{
			Name = "FlagPole",
			Position = polePos,
			Height = height,
			Diameter = 0.4,
			Axis = "Y",
			Color = C.Metal,
			Material = Enum.Material.Metal,
		}
	)
	BuildUtil.Ball(
		ctx,
		{
			Name = "FlagPoleTop",
			Position = polePos + Vector3.new(0, height / 2 + 0.3, 0),
			Diameter = 0.8,
			Color = C.Gold,
			Material = Enum.Material.Metal,
		}
	)
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
-- Lower bowl
---------------------------------------------------------------------------------------------

local SIDELINE_AISLES = { -80, -40, 0, 40, 80 } -- shared by the lower and upper decks so they line up

function Stands.bleachers_home(ctx)
	local L = ctx.config.Layout
	local team = ctx.colors
	local name = ctx.teamName
	local frame = CFrame.new(0, 0, L.SurfaceMaxZ) * CFrame.Angles(0, math.pi, 0)
	local length = L.SidelineStandsHalfLength * 2

	lowerStand(ctx, frame, {
		length = length,
		rowColors = { team.Primary, shade(team.Primary, 0.8) },
		seatColor = team.Secondary,
		aisles = SIDELINE_AISLES,
		caps = { -1, 1 },
		panels = {
			{ x = -90, width = 40, text = name },
			{ x = -30, width = 40, text = "GO " .. name .. "!", color = team.Trim },
			{ x = 30, width = 40, text = "DE-FENSE!", color = team.Trim },
			{ x = 90, width = 40, text = name },
		},
	})
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
	for _, side in ipairs({ -1, 1 }) do
		BuildUtil.Box(
			tunnelCtx,
			"TunnelWall",
			Vector3.new(wallOuter - wallInner, wallHeight, depth),
			Vector3.new(side * wallX, wallHeight / 2, midZ),
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
			Vector3.new(wallOuter - wallInner + 0.4, 0.4, depth),
			Vector3.new(side * wallX, wallHeight + 0.2, midZ),
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
	local frame = CFrame.new(side * L.SurfaceHalfX, 0, L.FieldCenterZ) * CFrame.Angles(0, -side * math.pi / 2, 0)
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

---------------------------------------------------------------------------------------------
-- Upper decks
---------------------------------------------------------------------------------------------

-- Team-coloured facade band on the front face of an upper deck, filling the gap between the
-- lower bowl's top row (12) and the upper deck's first row (16), plus a parapet cap.
local function facade(ctx, frame, length, text)
	local team = ctx.colors
	local height = FACADE_TOP - FACADE_BOTTOM
	local band = standBox(
		ctx,
		frame,
		"Facade",
		Vector3.new(length, height, 0.4),
		0,
		FACADE_BOTTOM + height / 2,
		-0.2,
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	addText(band, TOWARD_FIELD, text, readable(team.Primary, team.Trim), 12)
	standBox(ctx, frame, "FacadeCap", Vector3.new(length, 0.3, 0.7), 0, FACADE_TOP + 0.15, -0.2, team.Trim, Enum.Material.SmoothPlastic)
	standBox(
		ctx,
		frame,
		"FacadeStripe",
		Vector3.new(length, 0.35, 0.1),
		0,
		FACADE_BOTTOM + 0.6,
		-0.45,
		team.Secondary,
		Enum.Material.SmoothPlastic,
		{ CanCollide = false }
	)
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

function Stands.upper_home(ctx)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local team = ctx.colors
	local name = ctx.teamName
	local frame = CFrame.new(0, 0, L.BackLowerOuterZ) * CFrame.Angles(0, math.pi, 0)
	local length = L.SidelineStandsHalfLength * 2
	local depth = L.UpperDepth
	local top = L.UpperTopHeight

	upperStand(ctx, frame, {
		length = length,
		rowColors = { team.Secondary, shade(team.Secondary, 0.82) },
		seatColor = team.Primary,
		aisles = SIDELINE_AISLES,
		caps = { -1, 1 },
	})
	facade(ctx, frame, length, name .. "      HOME OF THE " .. name .. "      " .. name)

	-- Outside (back) wall: concrete cladding, team bands, stadium name and concourse gates
	local cladding = 0.3
	standBox(
		ctx,
		frame,
		"BackCladding",
		Vector3.new(length, top, cladding),
		0,
		top / 2,
		depth + cladding / 2,
		C.Concrete,
		Enum.Material.Concrete
	)
	local face = depth + cladding
	backBand(ctx, frame, length, 11.2, 1.4, face, team.Primary, "ConcourseBand")
	local nameBand = backBand(ctx, frame, length, 18.5, 4, face, team.Primary, "NameBand")
	addText(nameBand, AWAY_FROM_FIELD, name .. " STADIUM", readable(team.Primary, team.Trim), 12)
	backBand(ctx, frame, length, top - 1.2, 1.2, face, team.Secondary, "TopBand")
	gate(ctx, frame, -80, face, "GATE E")
	gate(ctx, frame, 0, face, "GATE F")
	gate(ctx, frame, 80, face, "GATE G")

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
	-- tunnel walls under the bridge (a little proud of the row ends) + the runway continues
	for _, side in ipairs({ -1, 1 }) do
		BuildUtil.Box(
			bridgeCtx,
			"TunnelWall",
			Vector3.new(0.4, bridgeBottom, depth),
			Vector3.new(side * (tunnel - 0.2), bridgeBottom / 2, (frontZ + backZ) / 2),
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

	-- Facade across the whole front face (both sections and the bridge)
	facade(ctx, CFrame.new(0, 0, frontZ), outer * 2, "WELCOME TO " .. name .. " STADIUM")
end

return Stands
