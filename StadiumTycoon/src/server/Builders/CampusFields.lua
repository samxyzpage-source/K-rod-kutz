--[[
	CampusFields
	The outdoor and indoor practice fields of the training campus behind the stadium.

	  practice_field  striped grass practice field in X[-200,-30] Z[262,350]: boundary + yard
	                  lines every 5 yards, yard numbers, one team end zone at the far (west) end
	                  with a single goal post, and a low railing all round. The railing has a gate
	                  ("PRACTICE FIELD" banner) in the +X side, facing the campus walk.
	  practice_gear   training equipment on and around the practice field: kicking net, water
	                  station, agility ladder, two-man blocking sled, tackling dummies, cone drill
	                  and a coach tower with a megaphone. The middle of the field stays open.
	  indoor_dome     translucent barrel-vault practice bubble in X[-10,200] Z[262,352]: a
	                  13-panel polygonal arch roof running along X on a team-coloured base,
	                  closed end walls, striped turf with lines + end zones + a goal post,
	                  ceiling lights, a big team portal facing the campus walk (-Z) and a field
	                  door in the west end wall facing the practice field gate (-X).

	Paint layers (bottom of every layer is the turf top 0.2):
	  dome mowing stripes 0.24 | end zones 0.3 | lines 0.32 | yard numbers 0.33 |
	  agility ladder rungs 0.36 / straps 0.38
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)

local CampusFields = {}

-- Reserved footprints (plot-local studs; Config.Layout has no values for these)
local FIELD_AREA = { MinX = -200, MaxX = -30, MinZ = 262, MaxZ = 350 } -- practice_field
-- practice_gear stays inside X[-200,-30] Z[262,356] (on and around the practice field)
local DOME_AREA = { MinX = -10, MaxX = 200, MinZ = 262, MaxZ = 352 } -- indoor_dome, top <= 46

local TURF_TOP = 0.2
local STEP = 10 -- 5 yards: yard lines and mowing stripes
local LINE_WIDTH = 0.6
local BOUNDARY_WIDTH = 1
local LINE_THICKNESS = 0.12 -- 0.2 .. 0.32
local ENDZONE_THICKNESS = 0.1 -- 0.2 .. 0.3
local STRIPE_THICKNESS = 0.04 -- 0.2 .. 0.24

local NUMBER_Y = 0.33
local NUMBER_INSET = 12 -- sideline -> centre of the row of yard numbers
local NUMBER_HEIGHT = 6
local NUMBER_PPS = 16
local NUMBER_TEXT_SIZE = 80
local DIGIT_WIDTH = 3.2
local DIGIT_GAP = 1.2

local CROSSBAR_HEIGHT = 7
local UPRIGHT_HALF_GAP = 6.2
local POST_SETBACK = 4.5
local PAD_HEIGHT = 4

-- Outdoor practice field: the end zone is at the far (west) end, the open end faces the campus walk.
local PF = {
	EndLineX = FIELD_AREA.MinX + 10, -- -190: back of the end zone
	GoalLineX = FIELD_AREA.MinX + 30, -- -170
	FarLineX = FIELD_AREA.MaxX - 10, -- -40: east boundary (the 65-yard line)
	MinZ = FIELD_AREA.MinZ + 10, -- 272: front sideline
	MaxZ = FIELD_AREA.MaxZ - 10, -- 340: back sideline
	FenceInset = 1,
	GateHalfWidth = 10, -- gate in the +X railing, centred on the field
	PostHeight = 3.8,
}
PF.CenterZ = (PF.MinZ + PF.MaxZ) / 2 -- 306

-- Indoor dome: a polygonal barrel vault along X. Arch vertex k (0..Panels) sits at angle k*180/Panels
-- on a half circle of `Radius` around (z = CenterZ, y = KneeHeight).
local DOME = {
	MinX = DOME_AREA.MinX + 2, -- -8: the west door frame stands in the 2 studs in front of the end wall
	MaxX = DOME_AREA.MaxX - 2, -- 198
	CenterZ = (DOME_AREA.MinZ + DOME_AREA.MaxZ) / 2, -- 307
	Radius = 42, -- base z 265 .. 349, top of the roof ~45.2
	KneeHeight = 3,
	Panels = 13, -- odd, so there is a flat top panel for the team name
	Thickness = 1,
	PortalCenterX = 11, -- main entrance in the -Z side, at the end of the campus walk (X[-20,20])
	PortalHalfWidth = 10,
	EndDoorHalfWidth = 7, -- field door in the west end wall
}
DOME.CenterX = (DOME.MinX + DOME.MaxX) / 2 -- 95

-- Main portal frame in front of the -Z side of the dome (from the footprint edge z = 262 inward)
local PORTAL = {
	OpenTop = 14, -- top of the doorway (the arch's first vertex is at y ~13, the panel above recedes)
	Top = 25,
	Depth = 6,
	PillarWidth = 3,
	Chamfer = 3.5,
}

local PAINT = { CanCollide = false, CastShadow = false }
local NO_COLLIDE = { CanCollide = false }
local UP = Vector3.new(0, 1, 0)

local WHITE = Color3.fromRGB(248, 248, 248)
local INK = Color3.fromRGB(22, 22, 26)
local FENCE_WHITE = Color3.fromRGB(232, 234, 238)
local DARK_METAL = Color3.fromRGB(62, 64, 70)
local RIBBON_RED = Color3.fromRGB(240, 70, 30)
local NET_WHITE = Color3.fromRGB(240, 240, 240)
local COOLER_ORANGE = Color3.fromRGB(247, 128, 10)
local CONE_ORANGE = Color3.fromRGB(255, 110, 20)
local LADDER_YELLOW = Color3.fromRGB(255, 214, 10)
local STRAP_BLACK = Color3.fromRGB(30, 30, 34)
local RUBBER_BLACK = Color3.fromRGB(36, 36, 40)
local LEATHER = Color3.fromRGB(124, 66, 36)
local MEMBRANE = Color3.fromRGB(242, 244, 248)
local LAMP_WHITE = Color3.fromRGB(255, 246, 228)

---------------------------------------------------------------------------------------------
-- Helpers
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

local function contrast(a, b)
	local la, lb = luminance(a), luminance(b)
	if la < lb then
		la, lb = lb, la
	end
	return (la + 0.05) / (lb + 0.05)
end

-- The most readable team colour on `background` and the next best one (for an outline).
local function teamTextColors(background, team)
	local candidates = { team.Trim, team.Secondary, team.Primary, WHITE, INK }
	table.sort(candidates, function(a, b)
		return contrast(a, background) > contrast(b, background)
	end)
	-- prefer a team colour when it reads well enough
	for _, c in ipairs({ team.Trim, team.Secondary }) do
		if contrast(c, background) >= 3 then
			local outline = candidates[1] == c and candidates[2] or candidates[1]
			return c, outline
		end
	end
	return candidates[1], candidates[2]
end

-- Text on one face of a part, inset by a fraction of the face, with an outline.
local function faceText(part, face, text, background, team, opts)
	opts = opts or {}
	local color, outline = teamTextColors(background, team)
	local _, label = BuildUtil.SurfaceText(part, face, text, {
		LabelName = opts.LabelName or (part.Name .. face.Name),
		TextColor3 = opts.TextColor3 or color,
		PixelsPerStud = opts.PixelsPerStud or 20,
		Font = opts.Font or Enum.Font.GothamBlack,
	})
	local insetX, insetY = opts.InsetX or 0.05, opts.InsetY or 0.12
	label.Size = UDim2.new(1 - 2 * insetX, 0, 1 - 2 * insetY, 0)
	label.Position = UDim2.new(insetX, 0, insetY, 0)
	if opts.Outline ~= false then
		local stroke = Instance.new("UIStroke")
		stroke.Name = "Outline"
		stroke.Color = outline
		stroke.Thickness = opts.Outline or 2
		stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Contextual
		stroke.Parent = label
	end
	return label
end

-- Axis-aligned block given by its min and max corners.
local function span(ctx, name, minV, maxV, color, material, extra)
	return BuildUtil.Box(ctx, name, maxV - minV, (minV + maxV) / 2, color, material, extra)
end

-- Flat paint lying on the turf (bottom at TURF_TOP), given by its X/Z bounds.
local function paint(ctx, name, minX, maxX, minZ, maxZ, thickness, color, material)
	return BuildUtil.Box(
		ctx,
		name,
		Vector3.new(maxX - minX, thickness, maxZ - minZ),
		Vector3.new((minX + maxX) / 2, TURF_TOP + thickness / 2, (minZ + maxZ) / 2),
		color,
		material or Enum.Material.SmoothPlastic,
		PAINT
	)
end

-- Cylinder from point a to point b. Both points must share the same Z (the rod lies in an XY plane).
local function rod(ctx, name, a, b, diameter, color, material)
	local delta = b - a
	return BuildUtil.Part(ctx, {
		Name = name,
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(delta.Magnitude, diameter, diameter),
		CFrame = CFrame.new((a + b) / 2) * CFrame.Angles(0, 0, math.atan2(delta.Y, delta.X)),
		Color = color,
		Material = material,
	})
end

-- Square-section bar from point a to point b (any direction except straight up).
local function strut(ctx, name, a, b, width, color, material)
	return BuildUtil.Part(ctx, {
		Name = name,
		Size = Vector3.new(width, width, (b - a).Magnitude),
		CFrame = CFrame.lookAt((a + b) / 2, b),
		Color = color,
		Material = material,
	})
end

--[[
	Right triangle (WedgePart) standing in a plane: `corner` is the right-angle corner, the legs run
	`a` studs along unit vector `u` and `b` studs along unit vector `w`. The wedge is `thickness`
	thick along u x w.
]]
local function triangle(ctx, name, corner, u, a, w, b, thickness, color, material, extra)
	local props = extra and table.clone(extra) or {}
	-- Wedge local frame: right angle at (y = -h/2, z = +d/2), legs along local +Y and local -Z.
	local yAxis, zAxis = u, -w
	props.Name = name
	props.Size = Vector3.new(thickness, a, b)
	props.CFrame = CFrame.fromMatrix(corner + u * (a / 2) + w * (b / 2), yAxis:Cross(zAxis), yAxis, zAxis)
	props.Color = color
	props.Material = material
	return BuildUtil.Wedge(ctx, props)
end

local function digitLabel(gui, text, xPixels, widthPixels, alignment, color)
	local label = Instance.new("TextLabel")
	label.Name = "Digit"
	label.BackgroundTransparency = 1
	label.BorderSizePixel = 0
	label.Position = UDim2.new(0, xPixels, 0, 0)
	label.Size = UDim2.new(0, widthPixels, 1, 0)
	label.Font = Enum.Font.GothamBlack
	label.Text = text
	label.TextColor3 = color
	label.TextSize = NUMBER_TEXT_SIZE
	label.TextXAlignment = alignment
	label.Parent = gui
	return label
end

--[[
	One row of yard numbers: an invisible carrier over X[minX, maxX] at `z` with the digits drawn on its
	Top face (upright from the part's +Z side, so a row by the -Z sideline is turned 180 degrees).
	marks: list of { x = world x of the yard line, text = "20" } - the line runs between the two digits.
]]
local function yardNumberRow(ctx, name, minX, maxX, z, flip, marks, color)
	local length = maxX - minX
	local cx = (minX + maxX) / 2
	local carrier = BuildUtil.Part(ctx, {
		Name = name,
		Size = Vector3.new(length, 0.02, NUMBER_HEIGHT),
		CFrame = CFrame.new(cx, NUMBER_Y, z) * CFrame.Angles(0, flip and math.pi or 0, 0),
		Transparency = 1,
		CanCollide = false,
		CastShadow = false,
	})
	local gui = Instance.new("SurfaceGui")
	gui.Name = "YardNumbersGui"
	gui.Face = Enum.NormalId.Top
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = NUMBER_PPS
	gui.LightInfluence = 1
	gui.Parent = carrier

	local digitPixels = DIGIT_WIDTH * NUMBER_PPS
	local gapPixels = DIGIT_GAP / 2 * NUMBER_PPS
	for _, mark in ipairs(marks) do
		local localX = flip and -(mark.x - cx) or (mark.x - cx)
		local centerPixels = (localX + length / 2) * NUMBER_PPS
		digitLabel(gui, mark.text:sub(1, 1), centerPixels - gapPixels - digitPixels, digitPixels, Enum.TextXAlignment.Right, color)
		digitLabel(gui, mark.text:sub(2, 2), centerPixels + gapPixels, digitPixels, Enum.TextXAlignment.Left, color)
	end
	return carrier
end

-- Mowing stripes between consecutive X `edges`, covering Z[minZ, maxZ] (collidable turf, top 0.2).
local function stripedTurf(ctx, edges, minZ, maxZ, C)
	for i = 1, #edges - 1 do
		local x0, x1 = edges[i], edges[i + 1]
		BuildUtil.Box(
			ctx,
			"TurfStripe" .. i,
			Vector3.new(x1 - x0, TURF_TOP, maxZ - minZ),
			Vector3.new((x0 + x1) / 2, TURF_TOP / 2, (minZ + maxZ) / 2),
			i % 2 == 0 and C.GrassDark or C.Grass,
			Enum.Material.Grass
		)
	end
end

--[[
	Boundary + yard lines. f: MinX / MaxX (end lines, the paint lies just outside), MinZ / MaxZ
	(sidelines, the paint lies just outside), GoalLines = { x, ... }, YardLines = { x, ... }
]]
local function fieldLines(ctx, f, color)
	local minX, maxX, minZ, maxZ = f.MinX, f.MaxX, f.MinZ, f.MaxZ
	local bw = BOUNDARY_WIDTH
	paint(ctx, "SidelineFront", minX - bw, maxX + bw, minZ - bw, minZ, LINE_THICKNESS, color)
	paint(ctx, "SidelineBack", minX - bw, maxX + bw, maxZ, maxZ + bw, LINE_THICKNESS, color)
	paint(ctx, "EndLineWest", minX - bw, minX, minZ, maxZ, LINE_THICKNESS, color)
	paint(ctx, "EndLineEast", maxX, maxX + bw, minZ, maxZ, LINE_THICKNESS, color)
	for _, x in ipairs(f.GoalLines) do
		paint(ctx, "GoalLine", x - LINE_WIDTH / 2, x + LINE_WIDTH / 2, minZ, maxZ, LINE_THICKNESS, color)
	end
	for _, x in ipairs(f.YardLines) do
		paint(ctx, "YardLine", x - LINE_WIDTH / 2, x + LINE_WIDTH / 2, minZ, maxZ, LINE_THICKNESS, color)
	end
end

--[[
	Team-coloured end zone between the end line `outerX` and the goal line `goalX` with the owner's
	name across it, reading upright for someone standing behind the end line (like Field.lua).
]]
local function endZone(ctx, name, outerX, goalX, minZ, maxZ, team, teamName)
	local s = outerX < goalX and -1 or 1
	local inner = goalX + s * LINE_WIDTH / 2
	local depth = math.abs(outerX - inner)
	local zone = BuildUtil.Part(ctx, {
		Name = name,
		Size = Vector3.new(maxZ - minZ, ENDZONE_THICKNESS, depth),
		CFrame = CFrame.new((outerX + inner) / 2, TURF_TOP + ENDZONE_THICKNESS / 2, (minZ + maxZ) / 2)
			* CFrame.Angles(0, s * math.rad(90), 0),
		Color = team.Primary,
		Material = Enum.Material.SmoothPlastic,
		CanCollide = false,
		CastShadow = false,
	})
	faceText(zone, Enum.NormalId.Top, teamName, team.Primary, team, {
		LabelName = name .. "Name",
		PixelsPerStud = 6,
		InsetX = 0.06,
		InsetY = 0.14,
		Outline = 4,
	})
	return zone
end

--[[
	Single "slingshot" goal post: uprights above x = planeX, the padded base post `POST_SETBACK`
	studs behind it (dir = -1: the post stands west of the plane, +1: east).
]]
local function goalPost(ctx, planeX, dir, z, uprightHeight, team, postColor, withRibbons)
	local metal = Enum.Material.Metal
	local baseX = planeX + dir * POST_SETBACK
	local padTop = TURF_TOP + PAD_HEIGHT
	BuildUtil.Cylinder(ctx, {
		Name = "GoalPostPad",
		Position = Vector3.new(baseX, TURF_TOP + PAD_HEIGHT / 2, z),
		Height = PAD_HEIGHT,
		Diameter = 2,
		Color = team.Primary,
		Material = Enum.Material.Fabric,
	})
	local elbow = Vector3.new(baseX, CROSSBAR_HEIGHT, z)
	rod(ctx, "GoalPostStem", Vector3.new(baseX, padTop, z), elbow, 0.8, postColor, metal)
	BuildUtil.Ball(ctx, { Name = "GoalPostElbow", Position = elbow, Diameter = 0.8, Color = postColor, Material = metal })
	rod(ctx, "GoalPostArm", elbow, Vector3.new(planeX, CROSSBAR_HEIGHT, z), 0.8, postColor, metal)
	BuildUtil.Cylinder(ctx, {
		Name = "Crossbar",
		Axis = "Z",
		Position = Vector3.new(planeX, CROSSBAR_HEIGHT, z),
		Height = UPRIGHT_HALF_GAP * 2 + 0.5,
		Diameter = 0.6,
		Color = postColor,
		Material = metal,
	})
	for _, s in ipairs({ -1, 1 }) do
		BuildUtil.Cylinder(ctx, {
			Name = "Upright",
			Position = Vector3.new(planeX, CROSSBAR_HEIGHT + uprightHeight / 2, z + s * UPRIGHT_HALF_GAP),
			Height = uprightHeight,
			Diameter = 0.5,
			Color = postColor,
			Material = metal,
		})
		if withRibbons then
			-- streamer tied to the top of the upright, blowing outward and drooping a little
			local droop = math.rad(25)
			local length = 2.2
			local dir = Vector3.new(0, -math.sin(droop), s * math.cos(droop))
			local tie = Vector3.new(planeX, CROSSBAR_HEIGHT + uprightHeight - 0.3, z + s * (UPRIGHT_HALF_GAP + 0.2))
			local center = tie + dir * (length / 2)
			local ribbon = table.clone(PAINT)
			ribbon.Name = "WindRibbon"
			ribbon.Size = Vector3.new(0.1, 0.3, length)
			ribbon.CFrame = CFrame.lookAt(center, center + dir)
			ribbon.Color = RIBBON_RED
			ribbon.Material = Enum.Material.Fabric
			BuildUtil.Part(ctx, ribbon)
		end
	end
end

---------------------------------------------------------------------------------------------
-- practice_field: grass field, lines, one end zone + goal post, railing with a gate
---------------------------------------------------------------------------------------------
function CampusFields.practice_field(ctx)
	local C = ctx.config.Colors
	local team = ctx.colors
	local A = FIELD_AREA

	-- Turf: 10-stud mowing stripes lined up with the yard lines, over the whole footprint
	local edges = { A.MinX }
	for x = PF.EndLineX, PF.FarLineX, STEP do
		table.insert(edges, x)
	end
	table.insert(edges, A.MaxX)
	stripedTurf(ctx, edges, A.MinZ, A.MaxZ, C)

	-- Lines: boundary, goal line, a line every 5 yards up to the 60
	local yardLines = {}
	for x = PF.GoalLineX + STEP, PF.FarLineX - STEP, STEP do
		table.insert(yardLines, x)
	end
	fieldLines(ctx, {
		MinX = PF.EndLineX,
		MaxX = PF.FarLineX,
		MinZ = PF.MinZ,
		MaxZ = PF.MaxZ,
		GoalLines = { PF.GoalLineX },
		YardLines = yardLines,
	}, C.Line)

	-- Yard numbers every 10 yards, one row along each sideline
	local marks = {}
	for yards = 10, 60, 10 do
		table.insert(marks, { x = PF.GoalLineX + yards * 2, text = tostring(yards) })
	end
	yardNumberRow(ctx, "NumbersFront", PF.GoalLineX, PF.FarLineX, PF.MinZ + NUMBER_INSET, true, marks, C.Line)
	yardNumberRow(ctx, "NumbersBack", PF.GoalLineX, PF.FarLineX, PF.MaxZ - NUMBER_INSET, false, marks, C.Line)

	-- End zone with the team name + a single goal post above the end line
	endZone(ctx, "EndZone", PF.EndLineX, PF.GoalLineX, PF.MinZ, PF.MaxZ, team, ctx.teamName)
	goalPost(BuildUtil.Child(ctx, "GoalPost"), PF.EndLineX - BOUNDARY_WIDTH / 2, -1, PF.CenterZ, 20, team, C.GoalPost, true)

	-- Low railing all round: white posts, team-coloured top rail, white mid rail
	local fence = BuildUtil.Child(ctx, "Railing")
	local x0, x1 = A.MinX + PF.FenceInset, A.MaxX - PF.FenceInset
	local z0, z1 = A.MinZ + PF.FenceInset, A.MaxZ - PF.FenceInset
	local gateMin, gateMax = PF.CenterZ - PF.GateHalfWidth, PF.CenterZ + PF.GateHalfWidth
	local postSize = Vector3.new(0.5, PF.PostHeight, 0.5)
	local function post(x, z)
		BuildUtil.Block(fence, "RailPost", postSize, Vector3.new(x, 0, z), FENCE_WHITE, Enum.Material.Metal, nil, TURF_TOP)
	end
	local function rails(fromV, toV)
		local alongX = math.abs(toV.X - fromV.X) > math.abs(toV.Z - fromV.Z)
		local length = alongX and math.abs(toV.X - fromV.X) or math.abs(toV.Z - fromV.Z)
		local size = alongX and Vector3.new(length, 0.3, 0.25) or Vector3.new(0.25, 0.3, length)
		local mid = (fromV + toV) / 2
		BuildUtil.Box(fence, "TopRail", size, Vector3.new(mid.X, 3.4, mid.Z), team.Primary, Enum.Material.Metal)
		BuildUtil.Box(fence, "MidRail", size, Vector3.new(mid.X, 1.9, mid.Z), FENCE_WHITE, Enum.Material.Metal)
	end
	-- long sides (along X): a post every 28 studs
	for i = 0, 6 do
		local x = x0 + (x1 - x0) * i / 6
		post(x, z0)
		post(x, z1)
	end
	rails(Vector3.new(x0, 0, z0), Vector3.new(x1, 0, z0))
	rails(Vector3.new(x0, 0, z1), Vector3.new(x1, 0, z1))
	-- far (west) end
	for i = 1, 3 do
		post(x0, z0 + (z1 - z0) * i / 4)
	end
	rails(Vector3.new(x0, 0, z0), Vector3.new(x0, 0, z1))
	-- near (east) end: two runs either side of the gate
	post(x1, (z0 + gateMin) / 2)
	post(x1, (gateMax + z1) / 2)
	rails(Vector3.new(x1, 0, z0), Vector3.new(x1, 0, gateMin))
	rails(Vector3.new(x1, 0, gateMax), Vector3.new(x1, 0, z1))

	-- Gate: two tall team posts with a "PRACTICE FIELD" banner overhead (clear below y = 9)
	local gate = BuildUtil.Child(ctx, "Gate")
	for _, z in ipairs({ gateMin, gateMax }) do
		BuildUtil.Block(gate, "GatePost", Vector3.new(1, 12.6, 1), Vector3.new(x1, 0, z), team.Primary, Enum.Material.Metal, nil, TURF_TOP)
	end
	local banner = span(
		gate,
		"GateBanner",
		Vector3.new(x1 - 0.3, 9.4, gateMin + 0.5),
		Vector3.new(x1 + 0.3, 12.8, gateMax - 0.5),
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	for _, face in ipairs({ Enum.NormalId.Right, Enum.NormalId.Left }) do
		faceText(banner, face, "PRACTICE FIELD", team.Primary, team, { LabelName = "GateBanner" .. face.Name })
	end

	-- Team banners hung on the outside of the front (-Z) railing, facing the campus buildings
	local bannerTexts = { ctx.teamName, "PRACTICE FIELD" }
	for i, cx in ipairs({ x0 + 56 - 14, x1 - 56 + 14 }) do
		local cloth = span(
			fence,
			"RailBanner",
			Vector3.new(cx - 12, 0.9, z0 - 0.45),
			Vector3.new(cx + 12, 3.7, z0 - 0.2),
			team.Primary,
			Enum.Material.Fabric,
			NO_COLLIDE
		)
		faceText(cloth, Enum.NormalId.Front, bannerTexts[i], team.Primary, team, { LabelName = "RailBanner" .. i })
	end
end

---------------------------------------------------------------------------------------------
-- practice_gear: equipment on and around the practice field
---------------------------------------------------------------------------------------------

-- Kicking net beside the end zone (in the -Z margin), open side toward the field (+Z).
local function kickingNet(ctx, cx, z, team)
	local halfW, height = 6, 10
	for _, s in ipairs({ -1, 1 }) do
		BuildUtil.Cylinder(ctx, {
			Name = "NetPost",
			Position = Vector3.new(cx + s * halfW, TURF_TOP + height / 2, z),
			Height = height,
			Diameter = 0.5,
			Color = team.Secondary,
			Material = Enum.Material.Metal,
		})
		BuildUtil.Block(
			ctx,
			"NetFoot",
			Vector3.new(0.5, 0.4, 3.2),
			Vector3.new(cx + s * halfW, 0, z + 0.4),
			DARK_METAL,
			Enum.Material.Metal,
			nil,
			TURF_TOP
		)
	end
	BuildUtil.Cylinder(ctx, {
		Name = "NetTopBar",
		Axis = "X",
		Position = Vector3.new(cx, TURF_TOP + height, z),
		Height = halfW * 2 + 0.5,
		Diameter = 0.5,
		Color = team.Secondary,
		Material = Enum.Material.Metal,
	})
	BuildUtil.Box(
		ctx,
		"Netting",
		Vector3.new(halfW * 2 - 0.5, height - 0.4, 0.15),
		Vector3.new(cx, TURF_TOP + 0.2 + (height - 0.4) / 2, z - 0.2),
		NET_WHITE,
		Enum.Material.Fabric,
		{ Transparency = 0.5 }
	)
	-- a ball on a kicking tee in front of the net
	BuildUtil.Cylinder(ctx, {
		Name = "KickingTee",
		Position = Vector3.new(cx, TURF_TOP + 0.25, z + 5),
		Height = 0.5,
		Diameter = 0.7,
		Color = CONE_ORANGE,
		Material = Enum.Material.Plastic,
	})
	BuildUtil.Cylinder(ctx, {
		Name = "Football",
		Axis = "Z",
		Position = Vector3.new(cx, TURF_TOP + 0.95, z + 5),
		Height = 1.2,
		Diameter = 0.8,
		Color = LEATHER,
		Material = Enum.Material.Leather,
	})
end

-- Water table with two coolers and a stack of cups, front skirt facing the field (+Z).
local function waterStation(ctx, cx, cz, team)
	local top = TURF_TOP + 2.8
	BuildUtil.Box(ctx, "TableTop", Vector3.new(8, 0.4, 3), Vector3.new(cx, top - 0.2, cz), WHITE, Enum.Material.SmoothPlastic)
	for _, s in ipairs({ -1, 1 }) do
		BuildUtil.Block(
			ctx,
			"TableLeg",
			Vector3.new(0.4, 2.4, 2.6),
			Vector3.new(cx + s * 3.6, 0, cz),
			DARK_METAL,
			Enum.Material.Metal,
			nil,
			TURF_TOP
		)
	end
	local skirt =
		BuildUtil.Box(ctx, "TableSkirt", Vector3.new(8, 2, 0.2), Vector3.new(cx, top - 1.4, cz + 1.6), team.Primary, Enum.Material.Fabric)
	faceText(skirt, Enum.NormalId.Back, "WATER", team.Primary, team, { LabelName = "WaterSign", InsetX = 0.25 })
	for _, dx in ipairs({ -2.2, 0.6 }) do
		BuildUtil.Cylinder(ctx, {
			Name = "Cooler",
			Position = Vector3.new(cx + dx, top + 1.3, cz),
			Height = 2.6,
			Diameter = 2.2,
			Color = COOLER_ORANGE,
			Material = Enum.Material.SmoothPlastic,
		})
		BuildUtil.Cylinder(ctx, {
			Name = "CoolerLid",
			Position = Vector3.new(cx + dx, top + 2.75, cz),
			Height = 0.3,
			Diameter = 2.35,
			Color = WHITE,
			Material = Enum.Material.SmoothPlastic,
		})
	end
	BuildUtil.Cylinder(ctx, {
		Name = "CupStack",
		Position = Vector3.new(cx + 2.8, top + 0.8, cz + 0.4),
		Height = 1.6,
		Diameter = 0.7,
		Color = WHITE,
		Material = Enum.Material.SmoothPlastic,
	})
end

-- Flat agility ladder from x0 to x1 centred on z (yellow rungs on black straps).
local function agilityLadder(ctx, x0, x1, z)
	local halfW = 1.5
	for _, s in ipairs({ -1, 1 }) do
		BuildUtil.Box(
			ctx,
			"LadderStrap",
			Vector3.new(x1 - x0, 0.18, 0.3),
			Vector3.new((x0 + x1) / 2, TURF_TOP + 0.09, z + s * halfW),
			STRAP_BLACK,
			Enum.Material.Fabric,
			PAINT
		)
	end
	local rungs = 9
	for i = 0, rungs - 1 do
		local x = x0 + 0.15 + (x1 - x0 - 0.3) * i / (rungs - 1)
		BuildUtil.Box(
			ctx,
			"LadderRung",
			Vector3.new(0.3, 0.16, halfW * 2 - 0.3),
			Vector3.new(x, TURF_TOP + 0.08, z),
			LADDER_YELLOW,
			Enum.Material.SmoothPlastic,
			PAINT
		)
	end
end

-- Two-man blocking sled: skids + bed, two arms with pads facing +Z (players drive it toward -Z).
local function blockingSled(ctx, cx, cz, team)
	local metal = Enum.Material.Metal
	for _, s in ipairs({ -1, 1 }) do
		BuildUtil.Block(ctx, "SledSkid", Vector3.new(0.6, 0.5, 8), Vector3.new(cx + s * 3.5, 0, cz), DARK_METAL, metal, nil, TURF_TOP)
	end
	BuildUtil.Block(ctx, "SledBackBar", Vector3.new(7.6, 0.5, 0.5), Vector3.new(cx, 0, cz - 3.75), DARK_METAL, metal, nil, TURF_TOP)
	BuildUtil.Block(
		ctx,
		"SledBed",
		Vector3.new(7.6, 0.3, 5),
		Vector3.new(cx, 0, cz - 0.5),
		DARK_METAL,
		Enum.Material.DiamondPlate,
		nil,
		TURF_TOP + 0.5
	)
	local armZ = cz + 1.8
	for _, s in ipairs({ -1, 1 }) do
		BuildUtil.Block(
			ctx,
			"SledArm",
			Vector3.new(0.5, 3.8, 0.5),
			Vector3.new(cx + s * 2.4, 0, armZ),
			DARK_METAL,
			metal,
			nil,
			TURF_TOP + 0.8
		)
		BuildUtil.Block(
			ctx,
			"SledPad",
			Vector3.new(3.2, 4, 1.2),
			Vector3.new(cx + s * 2.4, 0, armZ + 0.85),
			team.Primary,
			Enum.Material.Fabric,
			nil,
			TURF_TOP + 1.4
		)
	end
	BuildUtil.Box(ctx, "SledTopBar", Vector3.new(5.3, 0.4, 0.4), Vector3.new(cx, TURF_TOP + 4.2, armZ), DARK_METAL, metal)
end

-- Upright tackling dummy on a rubber base.
local function tacklingDummy(ctx, x, z, color, bandColor)
	BuildUtil.Cylinder(ctx, {
		Name = "DummyBase",
		Position = Vector3.new(x, TURF_TOP + 0.3, z),
		Height = 0.6,
		Diameter = 3.2,
		Color = RUBBER_BLACK,
		Material = Enum.Material.Rubber,
	})
	BuildUtil.Cylinder(ctx, {
		Name = "DummyBody",
		Position = Vector3.new(x, TURF_TOP + 0.6 + 2.7, z),
		Height = 5.4,
		Diameter = 2.4,
		Color = color,
		Material = Enum.Material.Fabric,
	})
	BuildUtil.Cylinder(ctx, {
		Name = "DummyBand",
		Position = Vector3.new(x, TURF_TOP + 4.2, z),
		Height = 0.7,
		Diameter = 2.5,
		Color = bandColor,
		Material = Enum.Material.Fabric,
	})
end

-- Traffic cone (not collidable, so nobody trips over the drill).
local function cone(ctx, x, z)
	BuildUtil.Box(
		ctx,
		"ConeBase",
		Vector3.new(1.5, 0.15, 1.5),
		Vector3.new(x, TURF_TOP + 0.075, z),
		CONE_ORANGE,
		Enum.Material.Plastic,
		PAINT
	)
	BuildUtil.Cylinder(ctx, {
		Name = "ConeBody",
		Position = Vector3.new(x, TURF_TOP + 0.15 + 0.4, z),
		Height = 0.8,
		Diameter = 1.0,
		Color = CONE_ORANGE,
		Material = Enum.Material.Plastic,
		CanCollide = false,
	})
	BuildUtil.Cylinder(ctx, {
		Name = "ConeTip",
		Position = Vector3.new(x, TURF_TOP + 0.95 + 0.35, z),
		Height = 0.7,
		Diameter = 0.55,
		Color = WHITE,
		Material = Enum.Material.Plastic,
		CanCollide = false,
	})
end

-- Coach tower: scaffold with a platform, a team panel facing the field (-Z), a ladder on the +X
-- side, a megaphone on the rail and an umbrella.
local function coachTower(ctx, cx, cz, team)
	local metal = Enum.Material.Metal
	local deckY = TURF_TOP + 12
	local leg = 2.7
	for _, sx in ipairs({ -1, 1 }) do
		for _, sz in ipairs({ -1, 1 }) do
			BuildUtil.Block(
				ctx,
				"TowerLeg",
				Vector3.new(0.6, 12, 0.6),
				Vector3.new(cx + sx * leg, 0, cz + sz * leg),
				FENCE_WHITE,
				metal,
				nil,
				TURF_TOP
			)
		end
		-- one diagonal brace on each side face
		strut(
			ctx,
			"TowerBrace",
			Vector3.new(cx + sx * leg, TURF_TOP + 0.6, cz - leg),
			Vector3.new(cx + sx * leg, deckY - 0.6, cz + leg),
			0.3,
			FENCE_WHITE,
			metal
		)
	end
	BuildUtil.Box(ctx, "TowerDeck", Vector3.new(7, 0.6, 7), Vector3.new(cx, deckY + 0.3, cz), DARK_METAL, Enum.Material.DiamondPlate)
	local railTop = deckY + 0.6 + 2.8
	local front = BuildUtil.Box(
		ctx,
		"TowerPanel",
		Vector3.new(7, 2.8, 0.3),
		Vector3.new(cx, deckY + 0.6 + 1.4, cz - 3.35),
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	faceText(front, Enum.NormalId.Front, "COACH", team.Primary, team, { LabelName = "TowerPanelText", InsetX = 0.12 })
	for _, sx in ipairs({ -1, 1 }) do
		BuildUtil.Box(
			ctx,
			"TowerRailPost",
			Vector3.new(0.3, 2.8, 0.3),
			Vector3.new(cx + sx * 3.35, deckY + 2, cz + 3.35),
			FENCE_WHITE,
			metal
		)
	end
	BuildUtil.Box(ctx, "TowerRailBack", Vector3.new(7, 0.3, 0.3), Vector3.new(cx, railTop - 0.15, cz + 3.35), FENCE_WHITE, metal)
	BuildUtil.Box(ctx, "TowerRailSide", Vector3.new(0.3, 0.3, 6.5), Vector3.new(cx - 3.35, railTop - 0.15, cz + 0.1), FENCE_WHITE, metal)
	-- ladder up the open +X side
	local ladderX = cx + 3.7
	for _, s in ipairs({ -1, 1 }) do
		BuildUtil.Block(
			ctx,
			"LadderRail",
			Vector3.new(0.3, 12.6, 0.3),
			Vector3.new(ladderX, 0, cz + s * 1),
			FENCE_WHITE,
			metal,
			nil,
			TURF_TOP
		)
	end
	for i = 1, 4 do
		BuildUtil.Box(ctx, "LadderStep", Vector3.new(0.25, 0.25, 1.8), Vector3.new(ladderX, TURF_TOP + i * 2.5, cz), FENCE_WHITE, metal)
	end
	-- megaphone resting on the front panel, pointing at the field
	local megaY = railTop + 0.45
	BuildUtil.Cylinder(ctx, {
		Name = "MegaphoneBody",
		Axis = "Z",
		Position = Vector3.new(cx + 1.8, megaY, cz - 3.2),
		Height = 1.6,
		Diameter = 0.8,
		Color = WHITE,
		Material = Enum.Material.SmoothPlastic,
	})
	BuildUtil.Cylinder(ctx, {
		Name = "MegaphoneBell",
		Axis = "Z",
		Position = Vector3.new(cx + 1.8, megaY, cz - 4.2),
		Height = 0.5,
		Diameter = 1.6,
		Color = team.Secondary,
		Material = Enum.Material.SmoothPlastic,
	})
	-- shade umbrella
	BuildUtil.Cylinder(ctx, {
		Name = "UmbrellaPole",
		Position = Vector3.new(cx - 1.5, deckY + 0.6 + 4, cz + 1.5),
		Height = 8,
		Diameter = 0.3,
		Color = FENCE_WHITE,
		Material = metal,
	})
	BuildUtil.Cylinder(ctx, {
		Name = "UmbrellaCanopy",
		Position = Vector3.new(cx - 1.5, deckY + 0.6 + 8, cz + 1.5),
		Height = 0.4,
		Diameter = 9,
		Color = team.Secondary,
		Material = Enum.Material.Fabric,
	})
end

function CampusFields.practice_gear(ctx)
	local team = ctx.colors

	-- -Z margin (between the railing and the front sideline): kicking net + water station
	kickingNet(BuildUtil.Child(ctx, "KickingNet"), PF.EndLineX + 9, FIELD_AREA.MinZ + 3.5, team)
	waterStation(BuildUtil.Child(ctx, "WaterStation"), -150, FIELD_AREA.MinZ + 5.5, team)

	-- along the front sideline: agility ladder (flat) and the blocking sled
	agilityLadder(BuildUtil.Child(ctx, "AgilityLadder"), -150, -128, PF.MinZ + 4.5)
	blockingSled(BuildUtil.Child(ctx, "BlockingSled"), -80, PF.MinZ + 8, team)

	-- along the back sideline: a row of tackling dummies
	local dummies = BuildUtil.Child(ctx, "TacklingDummies")
	for i = 0, 3 do
		local color = i % 2 == 0 and team.Primary or team.Secondary
		local band = i % 2 == 0 and team.Secondary or team.Primary
		tacklingDummy(dummies, -158 + i * 8, PF.MaxZ - 6.5, color, band)
	end

	-- cone drill near the open (east) end
	local cones = BuildUtil.Child(ctx, "ConeDrill")
	for i = 0, 4 do
		cone(cones, -78 + i * 7, PF.CenterZ + 10 + (i % 2) * 7)
	end

	-- coach tower just outside the back sideline at midfield
	coachTower(BuildUtil.Child(ctx, "CoachTower"), (PF.EndLineX + PF.FarLineX) / 2, PF.MaxZ + 4.5, team)
end

---------------------------------------------------------------------------------------------
-- indoor_dome: translucent barrel-vault practice bubble with an indoor field
---------------------------------------------------------------------------------------------

-- Arch vertex k (0 .. DOME.Panels): returns z, y.
local function archVertex(k)
	local theta = math.pi * k / DOME.Panels
	return DOME.CenterZ - DOME.Radius * math.cos(theta), DOME.KneeHeight + DOME.Radius * math.sin(theta)
end

--[[
	Flat end wall of the vault at x = wallX (DOME.Thickness thick): an opaque team-coloured strip up to
	the knee height, then horizontal layers of the arch polygon (a box in the middle + a wedge at each
	shoulder). doorHalf (optional) cuts a door, as high as the first layer, in the middle.
]]
local function endWall(ctx, wallX, doorHalf, team)
	local n = DOME.Panels
	local t = DOME.Thickness
	local x0, x1 = wallX - t / 2, wallX + t / 2
	local zc = DOME.CenterZ
	local membrane = { Transparency = 0.25, CastShadow = false }
	local function wallBox(name, minZ, maxZ, minY, maxY, color, material, extra)
		if maxZ - minZ > 0.01 then
			span(ctx, name, Vector3.new(x0, minY, minZ), Vector3.new(x1, maxY, maxZ), color, material, extra)
		end
	end
	local function boxWithDoor(name, minZ, maxZ, minY, maxY, color, material, extra)
		if doorHalf then
			wallBox(name, minZ, zc - doorHalf, minY, maxY, color, material, extra)
			wallBox(name, zc + doorHalf, maxZ, minY, maxY, color, material, extra)
		else
			wallBox(name, minZ, maxZ, minY, maxY, color, material, extra)
		end
	end

	local zFirst = archVertex(0)
	local zLast = archVertex(n)
	boxWithDoor("EndWallBase", zFirst + t / 2, zLast - t / 2, 0, DOME.KneeHeight, team.Primary, Enum.Material.Concrete)

	local layers = math.floor(n / 2)
	for j = 0, layers - 1 do
		local zA, yA = archVertex(j)
		local zB, yB = archVertex(j + 1)
		local zC = archVertex(n - 1 - j)
		local zD = archVertex(n - j)
		local box = j == 0 and boxWithDoor or wallBox
		box("EndWallLayer" .. j, zB, zC, yA, yB, MEMBRANE, Enum.Material.SmoothPlastic, membrane)
		local corner = Vector3.new(wallX, yA, zB)
		triangle(
			ctx,
			"EndWallShoulder",
			corner,
			UP,
			yB - yA,
			Vector3.new(0, 0, -1),
			zB - zA,
			t,
			MEMBRANE,
			Enum.Material.SmoothPlastic,
			membrane
		)
		corner = Vector3.new(wallX, yA, zC)
		triangle(
			ctx,
			"EndWallShoulder",
			corner,
			UP,
			yB - yA,
			Vector3.new(0, 0, 1),
			zD - zC,
			t,
			MEMBRANE,
			Enum.Material.SmoothPlastic,
			membrane
		)
	end
end

function CampusFields.indoor_dome(ctx)
	local C = ctx.config.Colors
	local team = ctx.colors
	local n = DOME.Panels
	local t = DOME.Thickness
	local zc = DOME.CenterZ
	local doorMinX = DOME.PortalCenterX - DOME.PortalHalfWidth
	local doorMaxX = DOME.PortalCenterX + DOME.PortalHalfWidth
	local JAMB = 0.5 -- roof + knee wall stop this far inside the portal pillars (no shared faces)
	local zFront = archVertex(0) -- 265: -Z foot of the arch
	local zBack = archVertex(n) -- 349

	-- Roof: n long panels around the arch (lowest panel each side team-coloured, the rest translucent)
	local roof = BuildUtil.Child(ctx, "Roof")
	local delta = math.pi / n
	local width = 2 * DOME.Radius * math.sin(delta / 2) + t * math.tan(delta / 2) -- closes the outer seams
	local mid = DOME.Radius * math.cos(delta / 2)
	local topPanel
	for k = 0, n - 1 do
		local phi = (k + 0.5) * delta
		local y = DOME.KneeHeight + mid * math.sin(phi)
		local z = zc - mid * math.cos(phi)
		local rotation = CFrame.Angles(phi - math.pi / 2, 0, 0)
		if k == (n - 1) / 2 then
			rotation = CFrame.Angles(0, math.pi, 0) -- flat top panel, turned so its Top text reads from -Z
		end
		local isBase = k == 0 or k == n - 1
		local props = {
			Name = isBase and "RoofBasePanel" or "RoofPanel",
			Color = MEMBRANE,
			Material = Enum.Material.SmoothPlastic,
			Transparency = isBase and 0.25 or 0.3,
			CastShadow = false,
		}
		local segments = { { DOME.MinX, DOME.MaxX } }
		if k == 0 then
			segments = { { DOME.MinX, doorMinX - JAMB }, { doorMaxX + JAMB, DOME.MaxX } } -- the main portal
		end
		for _, seg in ipairs(segments) do
			local p = table.clone(props)
			p.Size = Vector3.new(seg[2] - seg[1], t, width)
			p.CFrame = CFrame.new((seg[1] + seg[2]) / 2, y, z) * rotation
			local panel = BuildUtil.Part(roof, p)
			if k == (n - 1) / 2 then
				topPanel = panel
			end
		end
	end
	faceText(topPanel, Enum.NormalId.Top, ctx.teamName .. "  INDOOR PRACTICE", MEMBRANE, team, {
		LabelName = "RoofName",
		PixelsPerStud = 4,
		InsetX = 0.04,
		InsetY = 0.1,
		Outline = false,
		TextColor3 = team.Primary,
	})

	-- Knee walls along both long sides (team colour), the -Z one split around the portal
	local walls = BuildUtil.Child(ctx, "Walls")
	local kneeSegments = {
		{ DOME.MinX, doorMinX - JAMB, zFront },
		{ doorMaxX + JAMB, DOME.MaxX, zFront },
		{ DOME.MinX, DOME.MaxX, zBack },
	}
	for _, seg in ipairs(kneeSegments) do
		span(
			walls,
			"KneeWall",
			Vector3.new(seg[1], 0, seg[3] - t / 2),
			Vector3.new(seg[2], DOME.KneeHeight, seg[3] + t / 2),
			team.Primary,
			Enum.Material.Concrete
		)
	end

	-- End walls: the west one has a field door facing the practice field gate
	-- (set 0.05 inside the roof ends so the wall faces never share a plane with the panel ends)
	endWall(walls, DOME.MinX + t / 2 + 0.05, DOME.EndDoorHalfWidth, team)
	endWall(walls, DOME.MaxX - t / 2 - 0.05, nil, team)

	-- Floor: turf + darker mowing stripes between the goal lines
	local floor = BuildUtil.Child(ctx, "IndoorField")
	local inX0, inX1 = DOME.MinX + t, DOME.MaxX - t
	local inZ0, inZ1 = zFront + t / 2, zBack - t / 2
	BuildUtil.Box(
		floor,
		"IndoorTurf",
		Vector3.new(inX1 - inX0, TURF_TOP, inZ1 - inZ0),
		Vector3.new((inX0 + inX1) / 2, TURF_TOP / 2, (inZ0 + inZ1) / 2),
		C.Grass,
		Enum.Material.Grass
	)
	local f = {
		MinX = DOME.CenterX - 90,
		MaxX = DOME.CenterX + 90,
		MinZ = zc - 30,
		MaxZ = zc + 30,
	}
	local goalWest, goalEast = f.MinX + 20, f.MaxX - 20
	for x = goalWest, goalEast - STEP, 2 * STEP do
		paint(floor, "MowStripe", x, x + STEP, inZ0, inZ1, STRIPE_THICKNESS, C.GrassDark, Enum.Material.Grass)
	end
	local yardLines = {}
	for x = goalWest + STEP, goalEast - STEP, STEP do
		table.insert(yardLines, x)
	end
	f.GoalLines = { goalWest, goalEast }
	f.YardLines = yardLines
	fieldLines(floor, f, C.Line)
	endZone(floor, "EndZoneWest", f.MinX, goalWest, f.MinZ, f.MaxZ, team, ctx.teamName)
	endZone(floor, "EndZoneEast", f.MaxX, goalEast, f.MinZ, f.MaxZ, team, ctx.teamName)
	local marks = {}
	local half = (goalEast - goalWest) / 2
	for d = 20, half - 1, 20 do
		local yards = tostring(math.floor(d / 2 + 0.5))
		table.insert(marks, { x = goalWest + d, text = yards })
		table.insert(marks, { x = goalEast - d, text = yards })
	end
	yardNumberRow(floor, "NumbersFront", goalWest, goalEast, f.MinZ + NUMBER_INSET, true, marks, C.Line)
	yardNumberRow(floor, "NumbersBack", goalWest, goalEast, f.MaxZ - NUMBER_INSET, false, marks, C.Line)
	goalPost(BuildUtil.Child(floor, "GoalPost"), f.MaxX + BOUNDARY_WIDTH / 2, 1, zc, 16, team, C.GoalPost, false)

	-- Ceiling lights hanging under the flat top panel
	local lights = BuildUtil.Child(ctx, "CeilingLights")
	local ceilingY = DOME.KneeHeight + mid - t / 2
	for i = 0, 5 do
		local x = DOME.CenterX + (i - 2.5) * 35
		local lamp = BuildUtil.Box(
			lights,
			"CeilingLamp",
			Vector3.new(14, 0.6, 2.4),
			Vector3.new(x, ceilingY - 0.3, zc),
			LAMP_WHITE,
			Enum.Material.Neon,
			{ CastShadow = false }
		)
		BuildUtil.Light(lamp, "PointLight", {
			Name = "CeilingLight",
			Range = 60,
			Brightness = 1.4,
			Color = LAMP_WHITE,
			Shadows = false,
		})
	end

	-- Main portal (-Z side, at the end of the campus walk): team pillars with accent stripes, a
	-- header with the team name and "INDOOR PRACTICE", chamfered top corners, glass doors slid open.
	local portal = BuildUtil.Child(ctx, "Portal")
	local outerZ = DOME_AREA.MinZ
	local backZ = outerZ + PORTAL.Depth
	for _, s in ipairs({ -1, 1 }) do
		local innerX = s < 0 and doorMinX or doorMaxX
		local outerX = innerX + s * PORTAL.PillarWidth
		local pillarMinX, pillarMaxX = math.min(innerX, outerX), math.max(innerX, outerX)
		span(
			portal,
			"PortalPillar",
			Vector3.new(pillarMinX, 0, outerZ + 0.2),
			Vector3.new(pillarMaxX, PORTAL.Top, backZ),
			team.Primary,
			Enum.Material.SmoothPlastic
		)
		span(
			portal,
			"PortalStripe",
			Vector3.new((pillarMinX + pillarMaxX) / 2 - 0.5, 0, outerZ),
			Vector3.new((pillarMinX + pillarMaxX) / 2 + 0.5, PORTAL.Top, outerZ + 0.2),
			team.Secondary,
			Enum.Material.SmoothPlastic
		)
		-- chamfer in the top corner of the opening
		triangle(
			portal,
			"PortalChamfer",
			Vector3.new(innerX, PORTAL.OpenTop, (outerZ + 0.5 + backZ) / 2),
			-UP,
			PORTAL.Chamfer,
			Vector3.new(-s, 0, 0),
			PORTAL.Chamfer,
			backZ - outerZ - 0.5,
			team.Primary,
			Enum.Material.SmoothPlastic
		)
		-- sliding glass door, open
		span(
			portal,
			"PortalDoor",
			Vector3.new(math.min(innerX, innerX - s * 4), TURF_TOP, zFront - 0.2),
			Vector3.new(math.max(innerX, innerX - s * 4), PORTAL.OpenTop - PORTAL.Chamfer, zFront + 0.2),
			C.Glass,
			Enum.Material.Glass,
			{ Transparency = 0.55 }
		)
	end
	local header = span(
		portal,
		"PortalHeader",
		Vector3.new(doorMinX, PORTAL.OpenTop, outerZ + 0.5),
		Vector3.new(doorMaxX, PORTAL.Top, backZ),
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	local nameColor, outline = teamTextColors(team.Primary, team)
	local _, nameLabel = BuildUtil.SurfaceText(header, Enum.NormalId.Front, ctx.teamName, {
		LabelName = "PortalTeamName",
		TextColor3 = nameColor,
		PixelsPerStud = 20,
	})
	nameLabel.Size = UDim2.new(0.9, 0, 0.5, 0)
	nameLabel.Position = UDim2.new(0.05, 0, 0.06, 0)
	local stroke = Instance.new("UIStroke")
	stroke.Name = "Outline"
	stroke.Color = outline
	stroke.Thickness = 3
	stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Contextual
	stroke.Parent = nameLabel
	local sub = Instance.new("TextLabel")
	sub.Name = "PortalSubtitle"
	sub.BackgroundTransparency = 1
	sub.BorderSizePixel = 0
	sub.Font = Enum.Font.GothamBold
	sub.Text = "INDOOR PRACTICE"
	sub.TextColor3 = nameColor
	sub.TextScaled = true
	sub.Size = UDim2.new(0.9, 0, 0.3, 0)
	sub.Position = UDim2.new(0.05, 0, 0.62, 0)
	sub.Parent = nameLabel.Parent
	-- cap reaches back to the membrane so there is no gap above the header
	span(
		portal,
		"PortalCap",
		Vector3.new(doorMinX - PORTAL.PillarWidth - 0.5, PORTAL.Top, outerZ),
		Vector3.new(doorMaxX + PORTAL.PillarWidth + 0.5, PORTAL.Top + 1.2, outerZ + 10),
		team.Secondary,
		Enum.Material.SmoothPlastic
	)
	span(
		portal,
		"PortalMat",
		Vector3.new(doorMinX, 0, outerZ),
		Vector3.new(doorMaxX, TURF_TOP, zFront + t / 2),
		team.Primary,
		Enum.Material.Fabric
	)

	-- West field door frame (faces the practice field gate across the corridor)
	local door = BuildUtil.Child(ctx, "FieldDoor")
	local wallOuterX = DOME.MinX
	local frameX0 = DOME_AREA.MinX
	local dh = DOME.EndDoorHalfWidth
	local _, doorTop = archVertex(1)
	for _, s in ipairs({ -1, 1 }) do
		span(
			door,
			"DoorFramePost",
			Vector3.new(frameX0, 0, zc + s * dh + (s < 0 and -2 or 0)),
			Vector3.new(wallOuterX, doorTop + 3, zc + s * dh + (s < 0 and 0 or 2)),
			team.Primary,
			Enum.Material.SmoothPlastic
		)
	end
	local doorHeader = span(
		door,
		"DoorFrameHeader",
		Vector3.new(frameX0, doorTop, zc - dh),
		Vector3.new(wallOuterX, doorTop + 3, zc + dh),
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	faceText(doorHeader, Enum.NormalId.Left, "INDOOR PRACTICE", team.Primary, team, { LabelName = "FieldDoorSign" })
	-- threshold through the wall opening, ending where the indoor turf starts (no shared top face)
	span(
		door,
		"DoorThreshold",
		Vector3.new(frameX0, 0, zc - dh),
		Vector3.new(inX0, TURF_TOP, zc + dh),
		C.ConcreteDark,
		Enum.Material.Concrete
	)
end

return CampusFields
