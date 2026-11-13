--[[
	CampusFields
	The outdoor and indoor practice fields of the campus, beyond the back road behind the Team HQ.
	Every footprint comes from Config.Layout.Zones. Every piece is bought in steps (Items.lua): each
	builder builds the whole piece and calls BuildUtil.Stage(ctx, n) before the parts of step n.

	  practice_field  a full 100-yard field running along X (7-yard end zones, so a goal post and the
	                  fence still fit behind each end line). The team area is on the near (-Z) side
	                  behind the main gate, which sits right behind the buy button.
	    1 Grass             turf over the whole zone with 5-yard mowing stripes
	    2 Yard Lines        boundary, goal and 5-yard lines; yard numbers, one-yard sideline ticks and
	                        hash marks are GUI frames on two invisible sheets (no part per mark)
	    3 End Zones         team end zones with the owner's name, orange pylons, a midfield logo
	    4 Goal Posts        a slingshot goal post behind each end line, with wind ribbons
	    5 Fence & Sideline  chain-link fence, main gate with a PRACTICE FIELD arch, side gate toward
	                        the dome, team mat, benches, water station, ball bin, fence banners
	    6 Bleachers         five-row aluminium bleachers on the far (+Z) sideline, facing the road
	  practice_gear   equipment on the field. A lane 40 studs wide across midfield (gate -> bleachers)
	                  stays free of anything collidable.
	    1 Blocking Sleds          seven-man sled + two-man sled (west half)
	    2 Tackling Dummies        stand-up dummies (one knocked over) + two tackle wheels (east half)
	    3 Agility Ladder & Cones  two flat ladders, a cone weave and mini hurdles (all walk-through)
	    4 Coach Tower             filming scaffold on the far sideline: camera, megaphone, umbrella
	  indoor_dome     an elliptical barrel vault running along X (11 roof panels).
	    1 Frame             team knee walls, steel arches + purlins, end walls (west door toward the
	                        practice field, east loading door), entrance portal at the buy button (-Z)
	    2 Turf & Lines      indoor turf, an 80-yard field with lines, numbers, end zones, goal posts
	    3 Roof Panels       team-coloured base panels, translucent membrane, team name on top
	    4 Doors & Lights    glass entrance doors, INDOOR PRACTICE + team signs, side doors, lamps

	Paint layers (bottom of every layer is the turf top 0.2):
	  mowing stripes 0.24 | team mat 0.26 | end zones 0.3 | lines 0.32 | mark sheets 0.335 |
	  logo ring 0.35 / logo 0.36 / logo text 0.37 | cone bases 0.38 | ladder rungs 0.4 / straps 0.42
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)

local CampusFields = {}

local TURF_TOP = 0.2
local YARD = 2
local STEP = 10 -- 5 yards: yard lines and mowing stripes

local STRIPE_TOP = 0.24
local MAT_TOP = 0.26
local ENDZONE_TOP = 0.3
local LINE_TOP = 0.32
local SHEET_Y = 0.335
local LOGO_RING_TOP = 0.35
local LOGO_TOP = 0.36
local LOGO_TEXT_Y = 0.37
local CONE_BASE_TOP = 0.38
local RUNG_TOP = 0.4
local STRAP_TOP = 0.42

local LINE_WIDTH = 0.6
local GOAL_LINE_WIDTH = 0.8
local BOUNDARY_WIDTH = 1
local NUMBER_INSET = 12 -- sideline -> centre of the yard numbers
local NUMBER_HEIGHT = 6
local DIGIT_WIDTH = 3.6
local DIGIT_GAP = 1.2
local SHEET_PPS = 8

local CROSSBAR_HEIGHT = 7
local UPRIGHT_HALF_GAP = 6.2
local POST_SETBACK = 3
local PAD_HEIGHT = 4

local FENCE_HEIGHT = 5.2

local PAINT = { CanCollide = false, CastShadow = false }
local NO_COLLIDE = { CanCollide = false }
local UP = Vector3.new(0, 1, 0)

local WHITE = Color3.fromRGB(248, 248, 248)
local INK = Color3.fromRGB(22, 22, 26)
local STEEL_WHITE = Color3.fromRGB(232, 234, 238)
local CHAIN_LINK = Color3.fromRGB(170, 176, 184)
local ALUMINIUM = Color3.fromRGB(200, 204, 210)
local ALUMINIUM_DARK = Color3.fromRGB(150, 155, 162)
local DARK_METAL = Color3.fromRGB(62, 64, 70)
local RIBBON_RED = Color3.fromRGB(240, 70, 30)
local COOLER_ORANGE = Color3.fromRGB(247, 128, 10)
local CONE_ORANGE = Color3.fromRGB(255, 110, 20)
local PYLON_ORANGE = Color3.fromRGB(255, 96, 16)
local LADDER_YELLOW = Color3.fromRGB(255, 214, 10)
local STRAP_BLACK = Color3.fromRGB(30, 30, 34)
local RUBBER_BLACK = Color3.fromRGB(36, 36, 40)
local LEATHER = Color3.fromRGB(124, 66, 36)
local MEMBRANE = Color3.fromRGB(242, 244, 248)
local LAMP_WHITE = Color3.fromRGB(255, 246, 228)
local CAMERA_BLACK = Color3.fromRGB(28, 28, 32)
local TALLY_RED = Color3.fromRGB(255, 40, 40)
local GLASS_TINT = Color3.fromRGB(150, 200, 230)

---------------------------------------------------------------------------------------------
-- Layouts (derived from Config.Layout.Zones)
---------------------------------------------------------------------------------------------

-- Outdoor practice field: X runs along the field, the team area is on the -Z (road) side.
local function practiceLayout(L)
	local zone = L.Zones.practice_field
	local f = { Zone = zone }
	f.CenterX = (zone.MinX + zone.MaxX) / 2 -- -130 (the buy button and the main gate)
	f.GoalW = f.CenterX - 50 * YARD -- -230
	f.GoalE = f.CenterX + 50 * YARD -- -30
	-- end zones as deep as fits with a goal post and the fence behind the end line (7 yards here)
	local room = (zone.MaxX - zone.MinX) / 2 - 50 * YARD
	f.EndZoneDepth = math.min(10 * YARD, room - 6)
	f.EndW = f.GoalW - f.EndZoneDepth -- -244
	f.EndE = f.GoalE + f.EndZoneDepth -- -16
	f.MinZ = zone.MinZ + 12 -- 408: near sideline (team area between it and the fence)
	f.MaxZ = f.MinZ + 96 -- 504: far sideline (bleachers + coach tower behind it)
	f.CenterZ = (f.MinZ + f.MaxZ) / 2 -- 456
	f.HashInset = 34
	f.FenceX0 = zone.MinX + 0.6
	f.FenceX1 = zone.MaxX - 0.6
	f.FenceZ0 = zone.MinZ + 1
	f.FenceZ1 = zone.MaxZ - 1
	f.GateX = f.CenterX
	f.GateHalf = 8
	f.SideGateZ = f.FenceZ0 + 10 -- side gate in the east fence, between the fence corner and this post
	return f
end

-- Indoor dome: polygonal half-ellipse vault along X. Vertex k (0..Panels) sits at angle k*180/Panels.
local function domeLayout(L)
	local zone = L.Zones.indoor_dome
	local d = { Zone = zone }
	d.X0 = zone.MinX + 4 -- 34: outer face of the west end wall (door canopy + sign in front)
	d.X1 = zone.MaxX - 4 -- 266
	d.CenterX = (zone.MinX + zone.MaxX) / 2 -- 150 (the buy button)
	d.CenterZ = (zone.MinZ + zone.MaxZ) / 2 -- 475
	d.A = (zone.MaxZ - zone.MinZ) / 2 - 3 -- 62: half width (base z 413 .. 537)
	d.Knee = 4
	d.B = math.min(43, zone.MaxY - d.Knee - 3) -- rise of the vault (top ~47)
	d.Panels = 11 -- odd, so there is a flat top panel for the team name
	d.T = 1
	d.DoorHalf = 12 -- entrance portal opening (-Z side, in front of the buy button)
	d.PillarW = 4
	d.FrontZ = zone.MinZ + 0.5
	d.OpenTop = 15
	d.HeaderTop = 23
	d.WestDoorZ = d.CenterZ - 30
	d.WestDoorHalf = 6
	d.EastDoorZ = d.CenterZ + 30
	d.EastDoorHalf = 10
	return d
end

-- Point on the vault outline (inset > 0: a smaller ellipse inside it). Returns z, y.
local function domeVertex(d, k, inset)
	inset = inset or 0
	local theta = math.pi * k / d.Panels
	return d.CenterZ - (d.A - inset) * math.cos(theta), d.Knee + (d.B - inset) * math.sin(theta)
end

---------------------------------------------------------------------------------------------
-- Helpers
---------------------------------------------------------------------------------------------

local function teamLabel(ctx, fallback)
	local name = ctx.teamName
	if type(name) ~= "string" or name == "" then
		return fallback
	end
	return name
end

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
		stroke.Color = opts.OutlineColor or outline
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

-- Flat paint lying on the turf: bottom at TURF_TOP, top at `top`.
local function paint(ctx, name, minX, maxX, minZ, maxZ, top, color, material)
	local thickness = top - TURF_TOP
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

-- CFrame at the middle of a -> b, looking from a to b (works for vertical segments too).
local function along(a, b)
	local dir = (b - a).Unit
	local up = math.abs(dir.Y) > 0.99 and Vector3.new(0, 0, 1) or UP
	return CFrame.lookAt((a + b) / 2, b, up)
end

-- Square-section bar from a to b.
local function bar(ctx, name, a, b, width, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Size = Vector3.new(width, width, (b - a).Magnitude)
	props.CFrame = along(a, b)
	props.Color = color
	props.Material = material
	return BuildUtil.Part(ctx, props)
end

-- Round pipe from a to b.
local function pipe(ctx, name, a, b, diameter, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Shape = Enum.PartType.Cylinder
	props.Size = Vector3.new((b - a).Magnitude, diameter, diameter)
	props.CFrame = along(a, b) * CFrame.Angles(0, math.pi / 2, 0) -- cylinder axis (local X) along a -> b
	props.Color = color
	props.Material = material
	return BuildUtil.Part(ctx, props)
end

-- Upright cylinder standing on y = baseY.
local function post(ctx, name, x, z, baseY, height, diameter, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Position = Vector3.new(x, baseY + height / 2, z)
	props.Height = height
	props.Diameter = diameter
	props.Color = color
	props.Material = material
	return BuildUtil.Cylinder(ctx, props)
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

local function sheetLabel(gui, text, x, y, w, h, alignment, color)
	local label = Instance.new("TextLabel")
	label.Name = "Digit"
	label.BackgroundTransparency = 1
	label.BorderSizePixel = 0
	label.Position = UDim2.new(0, x, 0, y)
	label.Size = UDim2.new(0, w, 0, h)
	label.Font = Enum.Font.GothamBlack
	label.Text = text
	label.TextColor3 = color
	label.TextScaled = true
	label.TextXAlignment = alignment
	label.Parent = gui
	return label
end

--[[
	Yard numbers + one-yard sideline ticks + inbound hash marks for one half of a field (between the
	goal lines), drawn as GUI frames on an invisible sheet so they cost a single part.
	side = -1: the -Z half (the sheet is turned 180 degrees so the numbers read upright from the -Z
	sideline), +1: the +Z half. f: GoalW, GoalE, MinZ, MaxZ, HashInset.
]]
local function fieldMarks(ctx, name, f, side, color)
	local flip = side < 0
	local sideline = flip and f.MinZ or f.MaxZ
	local inward = flip and 1 or -1
	local depth = f.HashInset + 2
	local minX, maxX = f.GoalW, f.GoalE
	local minZ = math.min(sideline, sideline + inward * depth)
	local maxZ = math.max(sideline, sideline + inward * depth)
	local carrier = BuildUtil.Part(ctx, {
		Name = name,
		Size = Vector3.new(maxX - minX, 0.02, maxZ - minZ),
		CFrame = CFrame.new((minX + maxX) / 2, SHEET_Y, (minZ + maxZ) / 2) * CFrame.Angles(0, flip and math.pi or 0, 0),
		Transparency = 1,
		CanCollide = false,
		CastShadow = false,
	})
	local gui = Instance.new("SurfaceGui")
	gui.Name = name .. "Gui"
	gui.Face = Enum.NormalId.Top
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = SHEET_PPS
	gui.LightInfluence = 1
	gui.Parent = carrier

	-- world -> sheet pixels (Top-face GUIs read upright from the part's +Z side)
	local function px(x)
		return (flip and (maxX - x) or (x - minX)) * SHEET_PPS
	end
	local function py(z)
		return (flip and (maxZ - z) or (z - minZ)) * SHEET_PPS
	end
	local function mark(kind, x0, x1, z0, z1)
		local a, b, c, e = px(x0), px(x1), py(z0), py(z1)
		local frame = Instance.new("Frame")
		frame.Name = kind
		frame.BackgroundColor3 = color
		frame.BorderSizePixel = 0
		frame.Position = UDim2.new(0, math.min(a, b), 0, math.min(c, e))
		frame.Size = UDim2.new(0, math.abs(b - a), 0, math.abs(e - c))
		frame.Parent = gui
	end

	local yards = math.floor((f.GoalE - f.GoalW) / YARD + 0.5)
	for yard = 1, yards - 1 do
		if yard % 5 ~= 0 then
			local x = f.GoalW + yard * YARD
			mark("SidelineTick", x - 0.18, x + 0.18, sideline + inward * 0.6, sideline + inward * 2)
			mark("HashMark", x - 0.18, x + 0.18, sideline + inward * (f.HashInset - 0.7), sideline + inward * (f.HashInset + 0.7))
		end
	end

	local digitPixels = DIGIT_WIDTH * SHEET_PPS
	local gapPixels = DIGIT_GAP / 2 * SHEET_PPS
	local numberZ = sideline + inward * NUMBER_INSET
	local topPixels = math.min(py(numberZ - NUMBER_HEIGHT / 2), py(numberZ + NUMBER_HEIGHT / 2))
	local heightPixels = NUMBER_HEIGHT * SHEET_PPS
	for yard = 10, yards - 10, 10 do
		local text = tostring(math.min(yard, yards - yard))
		local linePixels = px(f.GoalW + yard * YARD)
		sheetLabel(
			gui,
			text:sub(1, 1),
			linePixels - gapPixels - digitPixels,
			topPixels,
			digitPixels,
			heightPixels,
			Enum.TextXAlignment.Right,
			color
		)
		sheetLabel(gui, text:sub(2, 2), linePixels + gapPixels, topPixels, digitPixels, heightPixels, Enum.TextXAlignment.Left, color)
	end
	return carrier
end

-- Darker 5-yard mowing stripes between the goal lines.
local function mowingStripes(ctx, f, minZ, maxZ, color)
	local index = 0
	for x = f.GoalW, f.GoalE - STEP / 2, STEP do
		if index % 2 == 1 then
			paint(ctx, "MowStripe", x, x + STEP, minZ, maxZ, STRIPE_TOP, color, Enum.Material.Grass)
		end
		index += 1
	end
end

-- Boundary (just outside the field), goal lines and a line every 5 yards.
local function fieldLines(ctx, f, color)
	local bw = BOUNDARY_WIDTH
	paint(ctx, "SidelineFront", f.EndW - bw, f.EndE + bw, f.MinZ - bw, f.MinZ, LINE_TOP, color)
	paint(ctx, "SidelineBack", f.EndW - bw, f.EndE + bw, f.MaxZ, f.MaxZ + bw, LINE_TOP, color)
	paint(ctx, "EndLineWest", f.EndW - bw, f.EndW, f.MinZ, f.MaxZ, LINE_TOP, color)
	paint(ctx, "EndLineEast", f.EndE, f.EndE + bw, f.MinZ, f.MaxZ, LINE_TOP, color)
	for _, x in ipairs({ f.GoalW, f.GoalE }) do
		paint(ctx, "GoalLine", x - GOAL_LINE_WIDTH / 2, x + GOAL_LINE_WIDTH / 2, f.MinZ, f.MaxZ, LINE_TOP, color)
	end
	for x = f.GoalW + STEP, f.GoalE - STEP / 2, STEP do
		paint(ctx, "YardLine", x - LINE_WIDTH / 2, x + LINE_WIDTH / 2, f.MinZ, f.MaxZ, LINE_TOP, color)
	end
end

--[[
	Team-coloured end zone between the end line `outerX` and the goal line `goalX` with the owner's
	name across it, reading upright for someone standing behind the end line (like Field.lua).
]]
local function endZone(ctx, name, outerX, goalX, minZ, maxZ, team, text)
	local s = outerX < goalX and -1 or 1
	local inner = goalX + s * GOAL_LINE_WIDTH / 2
	local depth = math.abs(outerX - inner)
	local thickness = ENDZONE_TOP - TURF_TOP
	local zone = BuildUtil.Part(ctx, {
		Name = name,
		Size = Vector3.new(maxZ - minZ, thickness, depth),
		CFrame = CFrame.new((outerX + inner) / 2, TURF_TOP + thickness / 2, (minZ + maxZ) / 2) * CFrame.Angles(0, s * math.rad(90), 0),
		Color = team.Primary,
		Material = Enum.Material.SmoothPlastic,
		CanCollide = false,
		CastShadow = false,
	})
	faceText(zone, Enum.NormalId.Top, text, team.Primary, team, {
		LabelName = name .. "Name",
		PixelsPerStud = 6,
		InsetX = 0.06,
		InsetY = 0.14,
		Outline = 4,
	})
	return zone
end

-- Orange end-zone pylon (not collidable, so nobody trips over it).
local function pylon(ctx, x, z)
	return BuildUtil.Block(
		ctx,
		"Pylon",
		Vector3.new(0.7, 1.8, 0.7),
		Vector3.new(x, 0, z),
		PYLON_ORANGE,
		Enum.Material.SmoothPlastic,
		NO_COLLIDE,
		TURF_TOP
	)
end

--[[
	Single "slingshot" goal post: uprights above x = planeX, the padded base post POST_SETBACK studs
	behind it (dir = -1: the post stands west of the plane, +1: east).
]]
local function goalPost(ctx, planeX, dir, z, uprightHeight, team, postColor, withRibbons)
	local metal = Enum.Material.Metal
	local baseX = planeX + dir * POST_SETBACK
	local padTop = TURF_TOP + PAD_HEIGHT
	post(ctx, "GoalPostPad", baseX, z, TURF_TOP, PAD_HEIGHT, 2, team.Primary, Enum.Material.Fabric)
	local elbow = Vector3.new(baseX, CROSSBAR_HEIGHT, z)
	pipe(ctx, "GoalPostStem", Vector3.new(baseX, padTop, z), elbow, 0.8, postColor, metal)
	BuildUtil.Ball(ctx, { Name = "GoalPostElbow", Position = elbow, Diameter = 0.8, Color = postColor, Material = metal })
	pipe(ctx, "GoalPostArm", elbow, Vector3.new(planeX, CROSSBAR_HEIGHT, z), 0.8, postColor, metal)
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
		post(ctx, "Upright", planeX, z + s * UPRIGHT_HALF_GAP, CROSSBAR_HEIGHT, uprightHeight, 0.5, postColor, metal)
		if withRibbons then
			-- streamer tied to the top of the upright, blowing outward and drooping a little
			local droop = math.rad(25)
			local length = 2.2
			local d = Vector3.new(0, -math.sin(droop), s * math.cos(droop))
			local tie = Vector3.new(planeX, CROSSBAR_HEIGHT + uprightHeight - 0.3, z + s * (UPRIGHT_HALF_GAP + 0.2))
			local center = tie + d * (length / 2)
			local ribbon = table.clone(PAINT)
			ribbon.Name = "WindRibbon"
			ribbon.Size = Vector3.new(0.1, 0.3, length)
			ribbon.CFrame = CFrame.lookAt(center, center + d)
			ribbon.Color = RIBBON_RED
			ribbon.Material = Enum.Material.Fabric
			BuildUtil.Part(ctx, ribbon)
		end
	end
end

---------------------------------------------------------------------------------------------
-- practice_field
---------------------------------------------------------------------------------------------

-- Team logo at midfield: a ring, a disc and the team name (reads upright from the -Z gate side).
local function midfieldLogo(ctx, x, z, team, text)
	post(ctx, "LogoRing", x, z, TURF_TOP, LOGO_RING_TOP - TURF_TOP, 21, team.Secondary, Enum.Material.SmoothPlastic, PAINT)
	post(ctx, "LogoDisc", x, z, TURF_TOP, LOGO_TOP - TURF_TOP, 18.4, team.Primary, Enum.Material.SmoothPlastic, PAINT)
	local carrier = BuildUtil.Part(ctx, {
		Name = "LogoText",
		Size = Vector3.new(15, 0.02, 6),
		CFrame = CFrame.new(x, LOGO_TEXT_Y, z) * CFrame.Angles(0, math.pi, 0),
		Transparency = 1,
		CanCollide = false,
		CastShadow = false,
	})
	faceText(carrier, Enum.NormalId.Top, text, team.Primary, team, { LabelName = "LogoName", PixelsPerStud = 12, Outline = 3 })
end

-- One straight chain-link run: translucent mesh, top rail and posts every <= 40 studs (not at the ends).
local function fenceRun(ctx, x0, z0, x1, z1, railColor)
	local alongX = math.abs(x1 - x0) > math.abs(z1 - z0)
	local length = alongX and math.abs(x1 - x0) or math.abs(z1 - z0)
	local midX, midZ = (x0 + x1) / 2, (z0 + z1) / 2
	local meshHeight = FENCE_HEIGHT - 0.5
	BuildUtil.Box(
		ctx,
		"FenceMesh",
		alongX and Vector3.new(length, meshHeight, 0.12) or Vector3.new(0.12, meshHeight, length),
		Vector3.new(midX, TURF_TOP + 0.15 + meshHeight / 2, midZ),
		CHAIN_LINK,
		Enum.Material.Metal,
		{ Transparency = 0.55, CastShadow = false }
	)
	BuildUtil.Cylinder(ctx, {
		Name = "FenceTopRail",
		Axis = alongX and "X" or "Z",
		Position = Vector3.new(midX, TURF_TOP + FENCE_HEIGHT - 0.15, midZ),
		Height = length,
		Diameter = 0.35,
		Color = railColor,
		Material = Enum.Material.Metal,
	})
	local intervals = math.ceil(length / 40)
	for i = 1, intervals - 1 do
		local t = i / intervals
		post(ctx, "FencePost", x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, TURF_TOP, FENCE_HEIGHT + 0.2, 0.45, CHAIN_LINK, Enum.Material.Metal)
	end
end

-- Play clock on a pole behind an end line; the amber "40" faces the field (`face` side).
local function playClock(ctx, x, z, face)
	post(ctx, "PlayClockPole", x, z, TURF_TOP, 9, 0.4, DARK_METAL, Enum.Material.Metal)
	local box = BuildUtil.Box(
		ctx,
		"PlayClock",
		Vector3.new(0.8, 3, 5),
		Vector3.new(x, TURF_TOP + 10.3, z),
		CAMERA_BLACK,
		Enum.Material.SmoothPlastic
	)
	local _, label = BuildUtil.SurfaceText(box, face, "40", {
		LabelName = "PlayClockTime",
		TextColor3 = Color3.fromRGB(255, 176, 30),
		Font = Enum.Font.Code,
		PixelsPerStud = 20,
		LightInfluence = 0,
	})
	label.Size = UDim2.new(0.8, 0, 0.8, 0)
	label.Position = UDim2.new(0.1, 0, 0.1, 0)
end

-- Team bench facing +Z (the field): aluminium seat, team backrest with the name toward the road.
local function bench(ctx, cx, cz, length, team, text)
	local metal = Enum.Material.Metal
	BuildUtil.Box(ctx, "BenchSeat", Vector3.new(length, 0.4, 1.6), Vector3.new(cx, TURF_TOP + 2, cz + 0.6), ALUMINIUM, metal)
	local back =
		BuildUtil.Box(ctx, "BenchBack", Vector3.new(length, 1.8, 0.3), Vector3.new(cx, TURF_TOP + 3.4, cz - 0.4), team.Primary, metal)
	faceText(back, Enum.NormalId.Front, text, team.Primary, team, { LabelName = "BenchName", InsetX = 0.2 })
	for _, s in ipairs({ -1, 1 }) do
		BuildUtil.Block(
			ctx,
			"BenchLeg",
			Vector3.new(0.4, 4.3, 2.1),
			Vector3.new(cx + s * (length / 2 - 0.8), 0, cz + 0.2),
			DARK_METAL,
			metal,
			nil,
			TURF_TOP
		)
	end
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
		post(ctx, "Cooler", cx + dx, cz, top, 2.6, 2.2, COOLER_ORANGE, Enum.Material.SmoothPlastic)
		post(ctx, "CoolerLid", cx + dx, cz, top + 2.6, 0.3, 2.35, WHITE, Enum.Material.SmoothPlastic)
	end
	post(ctx, "CupStack", cx + 2.8, cz + 0.4, top, 1.6, 0.7, WHITE, Enum.Material.SmoothPlastic)
end

-- Ball bin full of footballs.
local function ballBin(ctx, cx, cz)
	BuildUtil.Block(ctx, "BallBin", Vector3.new(4, 2.2, 2.6), Vector3.new(cx, 0, cz), DARK_METAL, Enum.Material.DiamondPlate, nil, TURF_TOP)
	local balls = { { -1.2, 0.2, 0 }, { 0.2, -0.3, 0.5 }, { 1.3, 0.4, -0.2 } }
	for i, b in ipairs(balls) do
		BuildUtil.Cylinder(ctx, {
			Name = "Football",
			Axis = i % 2 == 0 and "X" or "Z",
			Position = Vector3.new(cx + b[1], TURF_TOP + 2.55 + b[3] * 0.2, cz + b[2]),
			Height = 1.2,
			Diameter = 0.8,
			Color = LEATHER,
			Material = Enum.Material.Leather,
		})
	end
end

--[[
	Aluminium bleachers over X[x0, x1], first row at frontZ, rising toward +Z (spectators face -Z, the
	field). Seats + footboards, sloped stringers, a back guard rail with a team banner and team side
	panels.
]]
local function bleachers(ctx, x0, x1, frontZ, team, text)
	local metal = Enum.Material.Metal
	local rows, rowDepth, rowRise = 5, 2.2, 1.4
	local backZ = frontZ + rows * rowDepth
	local topSeat = TURF_TOP + 1.2 + (rows - 1) * rowRise
	local railTop = topSeat + 3.4
	for r = 1, rows do
		local z = frontZ + (r - 1) * rowDepth
		local seatTop = TURF_TOP + 1.2 + (r - 1) * rowRise
		span(ctx, "BleacherSeat", Vector3.new(x0, seatTop - 0.3, z + 1), Vector3.new(x1, seatTop, z + rowDepth), ALUMINIUM, metal)
		span(ctx, "BleacherFootboard", Vector3.new(x0, seatTop - 1.2, z), Vector3.new(x1, seatTop - 1, z + 1), ALUMINIUM_DARK, metal)
		-- team-coloured riser under the nose of every seat
		span(ctx, "BleacherRiser", Vector3.new(x0, seatTop - 1, z + 1), Vector3.new(x1, seatTop - 0.3, z + 1.15), team.Primary, metal)
	end
	-- understructure: a sloped stringer + a rear post every <= 16 studs
	local frames = math.ceil((x1 - x0) / 16)
	for i = 0, frames do
		local x = x0 + 0.4 + (x1 - x0 - 0.8) * i / frames
		bar(
			ctx,
			"BleacherStringer",
			Vector3.new(x, TURF_TOP, frontZ + 0.4),
			Vector3.new(x, topSeat - 0.3, backZ - 0.6),
			0.4,
			ALUMINIUM_DARK,
			metal
		)
		BuildUtil.Block(
			ctx,
			"BleacherPost",
			Vector3.new(0.4, railTop - TURF_TOP, 0.4),
			Vector3.new(x, 0, backZ - 0.2),
			ALUMINIUM_DARK,
			metal,
			nil,
			TURF_TOP
		)
	end
	BuildUtil.Box(
		ctx,
		"BleacherBackRail",
		Vector3.new(x1 - x0, 0.3, 0.3),
		Vector3.new((x0 + x1) / 2, railTop - 0.15, backZ - 0.2),
		ALUMINIUM,
		metal
	)
	local banner = span(
		ctx,
		"BleacherBanner",
		Vector3.new(x0 + 2, topSeat + 1.1, backZ - 0.62),
		Vector3.new(x1 - 2, topSeat + 3, backZ - 0.47),
		team.Primary,
		Enum.Material.Fabric,
		NO_COLLIDE
	)
	faceText(banner, Enum.NormalId.Front, text, team.Primary, team, { LabelName = "BleacherBannerText", InsetX = 0.08 })
	-- team side panels (a triangle under each end of the seats) + sloped hand rails
	for _, x in ipairs({ x0 - 0.15, x1 + 0.15 }) do
		triangle(
			ctx,
			"BleacherSidePanel",
			Vector3.new(x, TURF_TOP, backZ),
			UP,
			topSeat - TURF_TOP,
			Vector3.new(0, 0, -1),
			backZ - frontZ,
			0.3,
			team.Primary,
			Enum.Material.Metal
		)
		BuildUtil.Block(
			ctx,
			"BleacherRailPost",
			Vector3.new(0.25, 3.5, 0.25),
			Vector3.new(x, 0, frontZ + 0.3),
			ALUMINIUM,
			metal,
			nil,
			TURF_TOP
		)
		bar(
			ctx,
			"BleacherHandRail",
			Vector3.new(x, TURF_TOP + 3.5, frontZ + 0.3),
			Vector3.new(x, railTop, backZ - 0.2),
			0.25,
			ALUMINIUM,
			metal
		)
	end
end

function CampusFields.practice_field(ctx)
	local C = ctx.config.Colors
	local team = ctx.colors
	local f = practiceLayout(ctx.config.Layout)
	local zone = f.Zone
	local name = teamLabel(ctx, "HOME")

	-- STEP 1: Grass -----------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 1)
	local grass = BuildUtil.Child(ctx, "Grass")
	span(
		grass,
		"PracticeTurf",
		Vector3.new(zone.MinX, 0, zone.MinZ),
		Vector3.new(zone.MaxX, TURF_TOP, zone.MaxZ),
		C.Grass,
		Enum.Material.Grass
	)
	mowingStripes(grass, f, f.MinZ, f.MaxZ, C.GrassDark)

	-- STEP 2: Yard Lines ------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 2)
	local lines = BuildUtil.Child(ctx, "YardLines")
	fieldLines(lines, f, C.Line)
	fieldMarks(lines, "MarksFront", f, -1, C.Line)
	fieldMarks(lines, "MarksBack", f, 1, C.Line)

	-- STEP 3: End Zones -------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 3)
	local zones = BuildUtil.Child(ctx, "EndZones")
	endZone(zones, "EndZoneWest", f.EndW, f.GoalW, f.MinZ, f.MaxZ, team, name)
	endZone(zones, "EndZoneEast", f.EndE, f.GoalE, f.MinZ, f.MaxZ, team, name)
	for _, x in ipairs({ f.EndW - 0.5, f.GoalW, f.GoalE, f.EndE + 0.5 }) do
		pylon(zones, x, f.MinZ - 0.5)
		pylon(zones, x, f.MaxZ + 0.5)
	end
	midfieldLogo(zones, f.CenterX, f.CenterZ, team, name)

	-- STEP 4: Goal Posts ------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 4)
	goalPost(BuildUtil.Child(ctx, "GoalPostWest"), f.EndW - BOUNDARY_WIDTH / 2, -1, f.CenterZ, 16, team, C.GoalPost, true)
	goalPost(BuildUtil.Child(ctx, "GoalPostEast"), f.EndE + BOUNDARY_WIDTH / 2, 1, f.CenterZ, 16, team, C.GoalPost, true)

	-- STEP 5: Fence & Sideline ------------------------------------------------------------------
	BuildUtil.Stage(ctx, 5)
	local fence = BuildUtil.Child(ctx, "Fence")
	local x0, x1, z0, z1 = f.FenceX0, f.FenceX1, f.FenceZ0, f.FenceZ1
	local gateW, gateE = f.GateX - f.GateHalf, f.GateX + f.GateHalf
	fenceRun(fence, x0, z0, gateW - 0.6, z0, team.Primary)
	fenceRun(fence, gateE + 0.6, z0, x1, z0, team.Primary)
	fenceRun(fence, x1, f.SideGateZ, x1, z1, team.Primary)
	fenceRun(fence, x0, z1, x1, z1, team.Primary)
	fenceRun(fence, x0, z0, x0, z1, team.Primary)
	for _, p in ipairs({ { x0, z0 }, { x1, z0 }, { x0, z1 }, { x1, z1 }, { x1, f.SideGateZ } }) do
		post(fence, "FenceCornerPost", p[1], p[2], TURF_TOP, FENCE_HEIGHT + 0.4, 0.6, CHAIN_LINK, Enum.Material.Metal)
	end
	-- side gate toward the dome (east fence), swung open into the field
	span(
		fence,
		"SideGateLeaf",
		Vector3.new(x1 - 9.2, TURF_TOP + 0.4, f.SideGateZ - 0.5),
		Vector3.new(x1 - 0.4, TURF_TOP + FENCE_HEIGHT - 0.4, f.SideGateZ - 0.35),
		CHAIN_LINK,
		Enum.Material.Metal,
		{ Transparency = 0.35 }
	)

	-- main gate behind the buy button: team posts with gold balls and an arch banner (clear to y 9.6)
	local gate = BuildUtil.Child(ctx, "MainGate")
	for _, x in ipairs({ gateW - 0.6, gateE + 0.6 }) do
		BuildUtil.Block(
			gate,
			"GatePost",
			Vector3.new(1.2, 12.8, 1.2),
			Vector3.new(x, 0, z0),
			team.Primary,
			Enum.Material.Metal,
			nil,
			TURF_TOP
		)
		BuildUtil.Ball(gate, {
			Name = "GatePostBall",
			Position = Vector3.new(x, TURF_TOP + 13.5, z0),
			Diameter = 1.6,
			Color = C.Gold,
			Material = Enum.Material.Metal,
		})
	end
	local arch = span(
		gate,
		"GateBanner",
		Vector3.new(gateW, 9.6, z0 - 0.3),
		Vector3.new(gateE, 12.8, z0 + 0.3),
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	faceText(arch, Enum.NormalId.Front, "PRACTICE FIELD", team.Primary, team, { LabelName = "GateBannerFront" })
	faceText(arch, Enum.NormalId.Back, "GO " .. name .. "!", team.Primary, team, { LabelName = "GateBannerBack" })
	for _, s in ipairs({ -1, 1 }) do
		local hingeX = s < 0 and gateW + 0.2 or gateE - 0.2
		span(
			gate,
			"GateLeaf",
			Vector3.new(hingeX - 0.08, TURF_TOP + 0.4, z0 + 0.6),
			Vector3.new(hingeX + 0.08, TURF_TOP + FENCE_HEIGHT - 0.4, z0 + 0.6 + f.GateHalf - 0.6),
			CHAIN_LINK,
			Enum.Material.Metal,
			{ Transparency = 0.35 }
		)
	end

	-- banners on the outside of the front fence, facing the road
	local bannerSpecs = { { (x0 + gateW) / 2, name .. " PRACTICE" }, { (gateE + x1) / 2, "PRACTICE LIKE A CHAMPION" } }
	for i, spec in ipairs(bannerSpecs) do
		local cloth = span(
			fence,
			"FenceBanner",
			Vector3.new(spec[1] - 20, TURF_TOP + 0.8, z0 - 0.32),
			Vector3.new(spec[1] + 20, TURF_TOP + 4.2, z0 - 0.12),
			team.Primary,
			Enum.Material.Fabric,
			NO_COLLIDE
		)
		faceText(cloth, Enum.NormalId.Front, spec[2], team.Primary, team, { LabelName = "FenceBanner" .. i, InsetX = 0.04 })
	end

	-- team area between the fence and the near sideline
	local side = BuildUtil.Child(ctx, "Sideline")
	local areaZ = (z0 + f.MinZ - BOUNDARY_WIDTH) / 2 -- 402.5
	paint(
		side,
		"TeamMat",
		f.CenterX - 72,
		f.CenterX + 72,
		z0 + 1.4,
		f.MinZ - BOUNDARY_WIDTH - 0.4,
		MAT_TOP,
		team.Primary,
		Enum.Material.Fabric
	)
	bench(BuildUtil.Child(side, "BenchWest"), f.CenterX - 51, areaZ, 26, team, name)
	bench(BuildUtil.Child(side, "BenchEast"), f.CenterX + 51, areaZ, 26, team, name)
	waterStation(BuildUtil.Child(side, "WaterStation"), f.CenterX - 22, areaZ - 0.5, team)
	ballBin(BuildUtil.Child(side, "BallBin"), f.CenterX + 22, areaZ)
	-- play clocks behind both end lines (near corner, clear of the goal posts)
	local clocks = BuildUtil.Child(ctx, "PlayClocks")
	playClock(clocks, (f.EndW - BOUNDARY_WIDTH + x0) / 2, f.MinZ + 6, Enum.NormalId.Right)
	playClock(clocks, (f.EndE + BOUNDARY_WIDTH + x1) / 2, f.MinZ + 6, Enum.NormalId.Left)

	-- STEP 6: Bleachers -------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 6)
	local stands = BuildUtil.Child(ctx, "Bleachers")
	local bleacherText = name == "HOME" and "HOME OF CHAMPIONS" or ("HOME OF THE " .. name)
	bleachers(stands, f.CenterX - 32, f.CenterX + 32, f.MaxZ + BOUNDARY_WIDTH + 1.5, team, bleacherText)
end

---------------------------------------------------------------------------------------------
-- practice_gear
---------------------------------------------------------------------------------------------

--[[
	Seven-man blocking sled, long axis along Z: skids, a diamond-plate bed with weight plates, a top
	beam on two posts and seven pads facing -X (the linemen line up west of it and drive it east).
]]
local function sevenManSled(ctx, cx, cz, team, text)
	local metal = Enum.Material.Metal
	local length = 28
	for _, s in ipairs({ -1, 1 }) do
		BuildUtil.Block(
			ctx,
			"SledSkid",
			Vector3.new(0.6, 0.5, length + 2),
			Vector3.new(cx + s * 2.2, 0, cz),
			DARK_METAL,
			metal,
			nil,
			TURF_TOP
		)
		BuildUtil.Block(
			ctx,
			"SledPost",
			Vector3.new(0.6, 3.8, 0.6),
			Vector3.new(cx - 1, 0, cz + s * 12),
			DARK_METAL,
			metal,
			nil,
			TURF_TOP + 0.8
		)
		post(ctx, "SledWeight", cx + 1.1, cz + s * 6, TURF_TOP + 0.8, 0.9, 2.2, RUBBER_BLACK, Enum.Material.Rubber)
	end
	BuildUtil.Block(
		ctx,
		"SledBed",
		Vector3.new(5, 0.3, length),
		Vector3.new(cx, 0, cz),
		DARK_METAL,
		Enum.Material.DiamondPlate,
		nil,
		TURF_TOP + 0.5
	)
	BuildUtil.Box(ctx, "SledBeam", Vector3.new(0.6, 0.6, length - 1), Vector3.new(cx - 1, TURF_TOP + 4.6, cz), DARK_METAL, metal)
	for i = 1, 7 do
		local color = i % 2 == 1 and team.Primary or team.Secondary
		BuildUtil.Block(
			ctx,
			"SledPad",
			Vector3.new(1.4, 3.8, 3.5),
			Vector3.new(cx - 2.2, 0, cz + (i - 4) * 3.85),
			color,
			Enum.Material.Fabric,
			nil,
			TURF_TOP + 1.3
		)
	end
	local plate =
		BuildUtil.Box(ctx, "SledNamePlate", Vector3.new(0.25, 1.5, 14), Vector3.new(cx + 2.65, TURF_TOP + 1.6, cz), team.Primary, metal)
	faceText(plate, Enum.NormalId.Right, text, team.Primary, team, { LabelName = "SledName" })
end

-- Two-man blocking sled, pads facing -X.
local function twoManSled(ctx, cx, cz, team)
	local metal = Enum.Material.Metal
	for _, s in ipairs({ -1, 1 }) do
		BuildUtil.Block(ctx, "SledSkid", Vector3.new(8, 0.5, 0.6), Vector3.new(cx, 0, cz + s * 3.5), DARK_METAL, metal, nil, TURF_TOP)
		BuildUtil.Block(
			ctx,
			"SledArm",
			Vector3.new(0.5, 3.8, 0.5),
			Vector3.new(cx - 1.8, 0, cz + s * 2.4),
			DARK_METAL,
			metal,
			nil,
			TURF_TOP + 0.8
		)
		BuildUtil.Block(
			ctx,
			"SledPad",
			Vector3.new(1.2, 4, 3.2),
			Vector3.new(cx - 2.65, 0, cz + s * 2.4),
			team.Primary,
			Enum.Material.Fabric,
			nil,
			TURF_TOP + 1.4
		)
	end
	BuildUtil.Block(ctx, "SledBackBar", Vector3.new(0.5, 0.5, 7.6), Vector3.new(cx + 3.75, 0, cz), DARK_METAL, metal, nil, TURF_TOP)
	BuildUtil.Block(
		ctx,
		"SledBed",
		Vector3.new(5, 0.3, 7.6),
		Vector3.new(cx + 0.5, 0, cz),
		DARK_METAL,
		Enum.Material.DiamondPlate,
		nil,
		TURF_TOP + 0.5
	)
	BuildUtil.Box(ctx, "SledTopBar", Vector3.new(0.4, 0.4, 5.3), Vector3.new(cx - 1.8, TURF_TOP + 4.6, cz), DARK_METAL, metal)
end

-- Upright tackling dummy on a rubber base (or knocked over, lying along X).
local function tacklingDummy(ctx, x, z, color, bandColor, knockedOver)
	if knockedOver then
		BuildUtil.Cylinder(ctx, {
			Name = "DummyBody",
			Axis = "X",
			Position = Vector3.new(x, TURF_TOP + 1.2, z),
			Height = 5.4,
			Diameter = 2.4,
			Color = color,
			Material = Enum.Material.Fabric,
		})
		BuildUtil.Cylinder(ctx, {
			Name = "DummyBand",
			Axis = "X",
			Position = Vector3.new(x + 0.9, TURF_TOP + 1.2, z),
			Height = 0.7,
			Diameter = 2.5,
			Color = bandColor,
			Material = Enum.Material.Fabric,
		})
		BuildUtil.Cylinder(ctx, {
			Name = "DummyBase",
			Axis = "X",
			Position = Vector3.new(x - 3, TURF_TOP + 1.6, z),
			Height = 0.6,
			Diameter = 3.2,
			Color = RUBBER_BLACK,
			Material = Enum.Material.Rubber,
		})
		return
	end
	post(ctx, "DummyBase", x, z, TURF_TOP, 0.6, 3.2, RUBBER_BLACK, Enum.Material.Rubber)
	post(ctx, "DummyBody", x, z, TURF_TOP + 0.6, 5.4, 2.4, color, Enum.Material.Fabric)
	post(ctx, "DummyBand", x, z, TURF_TOP + 3.85, 0.7, 2.5, bandColor, Enum.Material.Fabric)
end

-- Big foam tackle wheel standing on its rim (rolls along Z).
local function tackleWheel(ctx, x, z, team)
	local y = TURF_TOP + 2.6
	BuildUtil.Cylinder(ctx, {
		Name = "TackleWheel",
		Axis = "X",
		Position = Vector3.new(x, y, z),
		Height = 1.8,
		Diameter = 5.2,
		Color = team.Primary,
		Material = Enum.Material.Fabric,
	})
	BuildUtil.Cylinder(ctx, {
		Name = "TackleWheelStripe",
		Axis = "X",
		Position = Vector3.new(x, y, z),
		Height = 0.6,
		Diameter = 5.3,
		Color = team.Secondary,
		Material = Enum.Material.Fabric,
	})
end

-- Flat agility ladder from x0 to x1 centred on z (yellow rungs on black straps).
local function agilityLadder(ctx, x0, x1, z)
	local halfW = 1.5
	for _, s in ipairs({ -1, 1 }) do
		paint(ctx, "LadderStrap", x0, x1, z + s * halfW - 0.15, z + s * halfW + 0.15, STRAP_TOP, STRAP_BLACK, Enum.Material.Fabric)
	end
	local rungs = 8
	for i = 0, rungs - 1 do
		local x = x0 + 0.15 + (x1 - x0 - 0.3) * i / (rungs - 1)
		paint(ctx, "LadderRung", x - 0.15, x + 0.15, z - halfW + 0.15, z + halfW - 0.15, RUNG_TOP, LADDER_YELLOW)
	end
end

-- Traffic cone (not collidable, so nobody trips over the drill).
local function cone(ctx, x, z)
	paint(ctx, "ConeBase", x - 0.75, x + 0.75, z - 0.75, z + 0.75, CONE_BASE_TOP, CONE_ORANGE, Enum.Material.Plastic)
	post(ctx, "ConeBody", x, z, CONE_BASE_TOP, 0.8, 1, CONE_ORANGE, Enum.Material.Plastic, NO_COLLIDE)
	post(ctx, "ConeTip", x, z, CONE_BASE_TOP + 0.8, 0.7, 0.55, WHITE, Enum.Material.Plastic, NO_COLLIDE)
end

-- Mini hurdle (bar along Z, players hop along X); walk-through.
local function miniHurdle(ctx, x, z)
	for _, s in ipairs({ -1, 1 }) do
		BuildUtil.Block(
			ctx,
			"HurdleLeg",
			Vector3.new(0.25, 1.6, 0.25),
			Vector3.new(x, 0, z + s * 1.5),
			LADDER_YELLOW,
			Enum.Material.Plastic,
			NO_COLLIDE,
			TURF_TOP
		)
	end
	BuildUtil.Cylinder(ctx, {
		Name = "HurdleBar",
		Axis = "Z",
		Position = Vector3.new(x, TURF_TOP + 1.6, z),
		Height = 3.4,
		Diameter = 0.3,
		Color = CONE_ORANGE,
		Material = Enum.Material.Plastic,
		CanCollide = false,
	})
end

--[[
	Coach's filming tower: a braced scaffold with a diamond-plate deck, a team panel facing the field
	(-Z), rails, a ladder on the +X side, a video camera on a tripod, a megaphone, a shade umbrella and
	a team banner across the front legs.
]]
local function coachTower(ctx, cx, cz, team, text)
	local metal = Enum.Material.Metal
	local deckY = TURF_TOP + 14
	local leg = 3.2
	for _, sx in ipairs({ -1, 1 }) do
		for _, sz in ipairs({ -1, 1 }) do
			BuildUtil.Block(
				ctx,
				"TowerLeg",
				Vector3.new(0.6, 14, 0.6),
				Vector3.new(cx + sx * leg, 0, cz + sz * leg),
				STEEL_WHITE,
				metal,
				nil,
				TURF_TOP
			)
		end
	end
	-- X braces on the west and back faces (the ladder is on the east face, the field side stays open)
	for _, s in ipairs({ -1, 1 }) do
		bar(
			ctx,
			"TowerBrace",
			Vector3.new(cx - leg, TURF_TOP + 0.6, cz + s * leg),
			Vector3.new(cx - leg, deckY - 0.6, cz - s * leg),
			0.3,
			STEEL_WHITE,
			metal
		)
		bar(
			ctx,
			"TowerBrace",
			Vector3.new(cx + s * leg, TURF_TOP + 0.6, cz + leg),
			Vector3.new(cx - s * leg, deckY - 0.6, cz + leg),
			0.3,
			STEEL_WHITE,
			metal
		)
	end
	BuildUtil.Box(ctx, "TowerDeck", Vector3.new(7.6, 0.6, 7.6), Vector3.new(cx, deckY + 0.3, cz), DARK_METAL, Enum.Material.DiamondPlate)
	local floorY = deckY + 0.6
	local panel = BuildUtil.Box(
		ctx,
		"TowerPanel",
		Vector3.new(7.6, 2.8, 0.3),
		Vector3.new(cx, floorY + 1.4, cz - 3.65),
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	faceText(panel, Enum.NormalId.Front, "HEAD COACH", team.Primary, team, { LabelName = "TowerPanelText", InsetX = 0.08 })
	local railY = floorY + 2.65
	for _, sx in ipairs({ -1, 1 }) do
		BuildUtil.Block(
			ctx,
			"TowerRailPost",
			Vector3.new(0.3, 2.8, 0.3),
			Vector3.new(cx + sx * 3.65, 0, cz + 3.65),
			STEEL_WHITE,
			metal,
			nil,
			floorY
		)
	end
	BuildUtil.Box(ctx, "TowerRail", Vector3.new(7.6, 0.3, 0.3), Vector3.new(cx, railY, cz + 3.65), STEEL_WHITE, metal)
	BuildUtil.Box(ctx, "TowerRail", Vector3.new(0.3, 0.3, 7.3), Vector3.new(cx - 3.65, railY, cz), STEEL_WHITE, metal)
	BuildUtil.Box(ctx, "TowerRail", Vector3.new(0.3, 0.3, 3.4), Vector3.new(cx + 3.65, railY, cz - 1.95), STEEL_WHITE, metal)
	-- ladder up the +X face (rungs 1.75 apart, climbable), arriving at the open back half of that side
	local ladderX = cx + leg + 0.6
	local ladderZ = cz + 1.6
	for _, s in ipairs({ -1, 1 }) do
		BuildUtil.Block(
			ctx,
			"LadderRail",
			Vector3.new(0.3, 16.6, 0.3),
			Vector3.new(ladderX, 0, ladderZ + s * 1),
			STEEL_WHITE,
			metal,
			nil,
			TURF_TOP
		)
	end
	for i = 1, 8 do
		BuildUtil.Box(
			ctx,
			"LadderStep",
			Vector3.new(0.25, 0.25, 1.8),
			Vector3.new(ladderX, TURF_TOP + i * 1.75, ladderZ),
			STEEL_WHITE,
			metal
		)
	end
	-- video camera on a tripod, aimed at the field
	local camX, camZ = cx - 1.6, cz - 1.8
	local headY = floorY + 3.4
	for i = 0, 2 do
		local a = math.rad(90 + i * 120)
		bar(
			ctx,
			"TripodLeg",
			Vector3.new(camX + math.cos(a) * 1.1, floorY, camZ + math.sin(a) * 1.1),
			Vector3.new(camX, headY, camZ),
			0.15,
			CAMERA_BLACK,
			metal
		)
	end
	BuildUtil.Box(
		ctx,
		"CameraBody",
		Vector3.new(1.2, 1.3, 2.2),
		Vector3.new(camX, headY + 0.65, camZ),
		CAMERA_BLACK,
		Enum.Material.SmoothPlastic
	)
	BuildUtil.Cylinder(ctx, {
		Name = "CameraLens",
		Axis = "Z",
		Position = Vector3.new(camX, headY + 0.65, camZ - 1.6),
		Height = 1,
		Diameter = 0.9,
		Color = CAMERA_BLACK,
		Material = Enum.Material.Glass,
	})
	BuildUtil.Box(
		ctx,
		"CameraTally",
		Vector3.new(0.25, 0.25, 0.25),
		Vector3.new(camX, headY + 1.42, camZ - 0.8),
		TALLY_RED,
		Enum.Material.Neon
	)
	-- megaphone resting on the front panel, pointing at the field
	local megaY = floorY + 3.25
	BuildUtil.Cylinder(ctx, {
		Name = "MegaphoneBody",
		Axis = "Z",
		Position = Vector3.new(cx + 2, megaY, cz - 3.5),
		Height = 1.6,
		Diameter = 0.8,
		Color = WHITE,
		Material = Enum.Material.SmoothPlastic,
	})
	BuildUtil.Cylinder(ctx, {
		Name = "MegaphoneBell",
		Axis = "Z",
		Position = Vector3.new(cx + 2, megaY, cz - 4.5),
		Height = 0.5,
		Diameter = 1.6,
		Color = team.Secondary,
		Material = Enum.Material.SmoothPlastic,
	})
	-- shade umbrella
	post(ctx, "UmbrellaPole", cx + 1.5, cz + 1.5, floorY, 7.2, 0.3, STEEL_WHITE, metal)
	post(ctx, "UmbrellaCanopy", cx + 1.5, cz + 1.5, floorY + 7.2, 0.4, 9, team.Secondary, Enum.Material.Fabric)
	-- team banner tied across the front legs, facing the field
	local banner = span(
		ctx,
		"TowerBanner",
		Vector3.new(cx - leg - 0.3, TURF_TOP + 5, cz - leg - 0.55),
		Vector3.new(cx + leg + 0.3, TURF_TOP + 8.6, cz - leg - 0.35),
		team.Primary,
		Enum.Material.Fabric,
		NO_COLLIDE
	)
	faceText(banner, Enum.NormalId.Front, text, team.Primary, team, { LabelName = "TowerBannerText", InsetX = 0.08 })
end

function CampusFields.practice_gear(ctx)
	local team = ctx.colors
	local f = practiceLayout(ctx.config.Layout)
	local name = teamLabel(ctx, "HOME")

	-- STEP 1: Blocking Sleds (west half) -------------------------------------------------------
	BuildUtil.Stage(ctx, 1)
	sevenManSled(BuildUtil.Child(ctx, "SevenManSled"), f.GoalW + 32, f.CenterZ - 16, team, name)
	twoManSled(BuildUtil.Child(ctx, "TwoManSled"), f.GoalW + 32, f.CenterZ + 26, team)

	-- STEP 2: Tackling Dummies (east half) -----------------------------------------------------
	BuildUtil.Stage(ctx, 2)
	local dummies = BuildUtil.Child(ctx, "TacklingDummies")
	for i = 0, 5 do
		local color = i % 2 == 0 and team.Primary or team.Secondary
		local band = i % 2 == 0 and team.Secondary or team.Primary
		local x = f.GoalE - 40 + (i % 2) * 8
		tacklingDummy(dummies, x, f.MinZ + 14 + i * 13, color, band, i == 4)
	end
	tackleWheel(dummies, f.GoalE - 18, f.CenterZ - 14, team)
	tackleWheel(dummies, f.GoalE - 18, f.CenterZ + 14, team)

	-- STEP 3: Agility Ladder & Cones (flat / walk-through) --------------------------------------
	BuildUtil.Stage(ctx, 3)
	local drills = BuildUtil.Child(ctx, "AgilityDrills")
	agilityLadder(drills, f.CenterX + 12, f.CenterX + 34, f.MinZ + 12)
	agilityLadder(drills, f.CenterX - 40, f.CenterX - 18, f.MaxZ - 14)
	for i = 0, 7 do
		cone(drills, f.CenterX + 18 + i * 4, f.CenterZ + 14 + (i % 2) * 6)
	end
	for i = 0, 3 do
		miniHurdle(drills, f.GoalW + 58 + i * 6, f.MinZ + 22)
	end

	-- STEP 4: Coach Tower (far sideline, east of the bleachers) ---------------------------------
	BuildUtil.Stage(ctx, 4)
	coachTower(BuildUtil.Child(ctx, "CoachTower"), f.CenterX + 60, f.MaxZ + BOUNDARY_WIDTH + 6.5, team, name)
end

---------------------------------------------------------------------------------------------
-- indoor_dome
---------------------------------------------------------------------------------------------

--[[
	Flat end wall of the vault at x = wallX (d.T thick): an opaque team band up to the first arch
	vertex (knee strip + first layer), translucent layers of the arch polygon above it (a box in the
	middle + a wedge at each shoulder). A door [doorZ +- doorHalf] is cut through the opaque band.
]]
local function endWall(ctx, d, wallX, doorZ, doorHalf, team)
	local n = d.Panels
	local t = d.T
	local x0, x1 = wallX - t / 2, wallX + t / 2
	local membrane = { Transparency = 0.35, CastShadow = false }
	local function wallBox(name, minZ, maxZ, minY, maxY, color, material, extra)
		if maxZ - minZ > 0.01 then
			span(ctx, name, Vector3.new(x0, minY, minZ), Vector3.new(x1, maxY, maxZ), color, material, extra)
		end
	end
	local function boxWithDoor(name, minZ, maxZ, minY, maxY, color, material, extra)
		wallBox(name, minZ, doorZ - doorHalf, minY, maxY, color, material, extra)
		wallBox(name, doorZ + doorHalf, maxZ, minY, maxY, color, material, extra)
	end

	local zFirst = domeVertex(d, 0)
	local zLast = domeVertex(d, n)
	boxWithDoor("EndWallBase", zFirst + t / 2, zLast - t / 2, 0, d.Knee, team.Primary, Enum.Material.Concrete)
	for j = 0, math.floor(n / 2) - 1 do
		local zA, yA = domeVertex(d, j)
		local zB, yB = domeVertex(d, j + 1)
		local zC = domeVertex(d, n - 1 - j)
		local zD = domeVertex(d, n - j)
		local opaque = j == 0
		local color = opaque and team.Primary or MEMBRANE
		local material = opaque and Enum.Material.Metal or Enum.Material.SmoothPlastic
		local extra = not opaque and membrane or nil
		if opaque then
			boxWithDoor("EndWallBand", zB, zC, yA, yB, color, material, extra)
		else
			wallBox("EndWallPanel", zB, zC, yA, yB, color, material, extra)
		end
		triangle(ctx, "EndWallShoulder", Vector3.new(wallX, yA, zB), UP, yB - yA, Vector3.new(0, 0, -1), zB - zA, t, color, material, extra)
		triangle(ctx, "EndWallShoulder", Vector3.new(wallX, yA, zC), UP, yB - yA, Vector3.new(0, 0, 1), zD - zC, t, color, material, extra)
	end
end

--[[
	Roof panel k of the vault between x0 and x1, outward normal on the part's +Y. The panels on the
	-Z side (and the flat top one) are turned 180 degrees about that normal, so text on their Top
	face reads upright from the road (-Z); on the +Z side it reads upright from behind the dome.
]]
local function roofPanel(ctx, d, k, x0, x1, props)
	local zA, yA = domeVertex(d, k)
	local zB, yB = domeVertex(d, k + 1)
	local chord = Vector3.new(0, yB - yA, zB - zA)
	local length = chord.Magnitude
	local dir = chord / length
	local normal = Vector3.new(0, dir.Z, -dir.Y)
	local center = Vector3.new((x0 + x1) / 2, (yA + yB) / 2, (zA + zB) / 2)
	local p = table.clone(props)
	p.Size = Vector3.new(x1 - x0, d.T, length + d.T)
	local top = (d.Panels - 1) / 2
	local xAxis = k <= top and Vector3.new(-1, 0, 0) or Vector3.new(1, 0, 0)
	p.CFrame = CFrame.fromMatrix(center, xAxis, k == top and UP or normal)
	return BuildUtil.Part(ctx, p)
end

-- z of the vault outline between vertices k and k+1 at height y (on the -Z side).
local function domeZAt(d, k, y)
	local zA, yA = domeVertex(d, k)
	local zB, yB = domeVertex(d, k + 1)
	return zA + (y - yA) * (zB - zA) / (yB - yA)
end

function CampusFields.indoor_dome(ctx)
	local C = ctx.config.Colors
	local team = ctx.colors
	local d = domeLayout(ctx.config.Layout)
	local name = teamLabel(ctx, "HOME")
	local n = d.Panels
	local t = d.T
	local zc = d.CenterZ
	local doorMinX, doorMaxX = d.CenterX - d.DoorHalf, d.CenterX + d.DoorHalf
	local cutMinX, cutMaxX = doorMinX - 0.5, doorMaxX + 0.5 -- roof/knee wall stop inside the portal pillars
	local zFront = domeVertex(d, 0) -- 413
	local zBack = domeVertex(d, n) -- 537
	local _, y1 = domeVertex(d, 1)
	local westWallX = d.X0 + t / 2 + 0.05 -- end walls sit just inside the roof ends
	local eastWallX = d.X1 - t / 2 - 0.05
	local inX0, inX1 = westWallX + t / 2 + 0.05, eastWallX - t / 2 - 0.05
	local inZ0, inZ1 = zFront + t / 2 + 0.05, zBack - t / 2 - 0.05

	-- STEP 1: Frame ----------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 1)
	local frame = BuildUtil.Child(ctx, "Frame")
	-- knee walls along both long sides (the -Z one split around the entrance portal)
	for _, seg in ipairs({ { d.X0, cutMinX, zFront }, { cutMaxX, d.X1, zFront }, { d.X0, d.X1, zBack } }) do
		span(
			frame,
			"KneeWall",
			Vector3.new(seg[1], 0, seg[3] - t / 2),
			Vector3.new(seg[2], d.Knee, seg[3] + t / 2),
			team.Primary,
			Enum.Material.Concrete
		)
	end
	-- steel arches just inside the roof (the middle one starts on top of the portal header)
	local ribInset = t / 2 + 0.7
	for i = 1, 3 do
		local x = d.X0 + (d.X1 - d.X0) * i / 4
		for k = 0, n - 1 do
			local overPortal = k == 0 and x > cutMinX and x < cutMaxX
			if not overPortal then
				local za, ya = domeVertex(d, k, ribInset)
				local zb, yb = domeVertex(d, k + 1, ribInset)
				local a, b = Vector3.new(x, ya, za), Vector3.new(x, yb, zb)
				local dir = (b - a).Unit
				bar(frame, "Arch", a - dir * 0.6, b + dir * 0.6, 1.2, team.Secondary, Enum.Material.Metal)
			end
		end
	end
	-- purlins along the vault (the top two carry the lamps)
	local purlinInset = t / 2 + 1.9
	for _, k in ipairs({ 3, 5, 6, 8 }) do
		local z, y = domeVertex(d, k, purlinInset)
		BuildUtil.Box(
			frame,
			"Purlin",
			Vector3.new(d.X1 - d.X0 - 2.4, 0.8, 0.8),
			Vector3.new((d.X0 + d.X1) / 2, y, z),
			STEEL_WHITE,
			Enum.Material.Metal
		)
	end
	-- end walls: west door toward the practice field, east loading door
	endWall(frame, d, westWallX, d.WestDoorZ, d.WestDoorHalf, team)
	endWall(frame, d, eastWallX, d.EastDoorZ, d.EastDoorHalf, team)
	-- entrance portal in front of the -Z side (team pillars with accent stripes, header, cap); it
	-- reaches back to the second roof panel so the cut in the first one is closed
	local portalBackZ = domeZAt(d, 1, d.HeaderTop) + 0.3
	local capBackZ = domeZAt(d, 1, d.HeaderTop + 1.2) + 0.3
	for _, s in ipairs({ -1, 1 }) do
		local innerX = s < 0 and doorMinX or doorMaxX
		local outerX = innerX + s * d.PillarW
		local pMin, pMax = math.min(innerX, outerX), math.max(innerX, outerX)
		span(
			frame,
			"PortalPillar",
			Vector3.new(pMin, 0, d.FrontZ),
			Vector3.new(pMax, d.HeaderTop, portalBackZ),
			team.Primary,
			Enum.Material.SmoothPlastic
		)
		span(
			frame,
			"PortalStripe",
			Vector3.new((pMin + pMax) / 2 - 0.5, 0, d.FrontZ - 0.2),
			Vector3.new((pMin + pMax) / 2 + 0.5, d.HeaderTop, d.FrontZ),
			team.Secondary,
			Enum.Material.SmoothPlastic
		)
	end
	span(
		frame,
		"PortalHeader",
		Vector3.new(doorMinX, d.OpenTop, d.FrontZ),
		Vector3.new(doorMaxX, d.HeaderTop, portalBackZ),
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	span(
		frame,
		"PortalCap",
		Vector3.new(doorMinX - d.PillarW - 0.5, d.HeaderTop, d.FrontZ - 0.3),
		Vector3.new(doorMaxX + d.PillarW + 0.5, d.HeaderTop + 1.2, capBackZ),
		team.Secondary,
		Enum.Material.SmoothPlastic
	)

	-- STEP 2: Turf & Lines ---------------------------------------------------------------------
	BuildUtil.Stage(ctx, 2)
	local floor = BuildUtil.Child(ctx, "IndoorField")
	span(floor, "IndoorTurf", Vector3.new(inX0, 0, inZ0), Vector3.new(inX1, TURF_TOP, inZ1), C.Grass, Enum.Material.Grass)
	span(floor, "PortalMat", Vector3.new(doorMinX, 0, d.FrontZ), Vector3.new(doorMaxX, TURF_TOP, inZ0), team.Primary, Enum.Material.Fabric)
	local f = {
		GoalW = d.CenterX - 40 * YARD,
		GoalE = d.CenterX + 40 * YARD,
		MinZ = zc - 53,
		MaxZ = zc + 53,
		HashInset = 37,
	}
	f.EndW = f.GoalW - 10 * YARD
	f.EndE = f.GoalE + 10 * YARD
	mowingStripes(floor, f, f.MinZ, f.MaxZ, C.GrassDark)
	fieldLines(floor, f, C.Line)
	fieldMarks(floor, "MarksFront", f, -1, C.Line)
	fieldMarks(floor, "MarksBack", f, 1, C.Line)
	endZone(floor, "EndZoneWest", f.EndW, f.GoalW, f.MinZ, f.MaxZ, team, name)
	endZone(floor, "EndZoneEast", f.EndE, f.GoalE, f.MinZ, f.MaxZ, team, name)
	goalPost(BuildUtil.Child(floor, "GoalPostWest"), f.EndW - BOUNDARY_WIDTH / 2, -1, zc, 14, team, C.GoalPost, false)
	goalPost(BuildUtil.Child(floor, "GoalPostEast"), f.EndE + BOUNDARY_WIDTH / 2, 1, zc, 14, team, C.GoalPost, false)

	-- STEP 3: Roof Panels ----------------------------------------------------------------------
	BuildUtil.Stage(ctx, 3)
	local roof = BuildUtil.Child(ctx, "Roof")
	local topPanel
	for k = 0, n - 1 do
		local isBase = k == 0 or k == n - 1
		local props = {
			Name = isBase and "RoofBasePanel" or "RoofPanel",
			Color = isBase and team.Primary or MEMBRANE,
			Material = isBase and Enum.Material.Metal or Enum.Material.SmoothPlastic,
			Transparency = isBase and 0 or 0.35,
			CastShadow = isBase,
		}
		if k == 0 then
			-- big lettering on the team band either side of the portal, read from the road
			local east = roofPanel(roof, d, k, cutMaxX, d.X1, props)
			local west = roofPanel(roof, d, k, d.X0, cutMinX, props)
			local bandText = { PixelsPerStud = 5, InsetX = 0.1, InsetY = 0.2, Outline = 3 }
			bandText.LabelName = "BandNameEast"
			faceText(east, Enum.NormalId.Top, name, team.Primary, team, bandText)
			bandText.LabelName = "BandNameWest"
			faceText(west, Enum.NormalId.Top, "INDOOR PRACTICE", team.Primary, team, bandText)
		elseif k == n - 1 then
			local back = roofPanel(roof, d, k, d.X0, d.X1, props)
			faceText(back, Enum.NormalId.Top, name .. "  INDOOR PRACTICE", team.Primary, team, {
				LabelName = "BandNameBack",
				PixelsPerStud = 4,
				InsetX = 0.15,
				InsetY = 0.2,
				Outline = 3,
			})
		else
			local panel = roofPanel(roof, d, k, d.X0, d.X1, props)
			if k == (n - 1) / 2 then
				topPanel = panel
			end
		end
	end
	local _, topY = domeVertex(d, (n - 1) / 2)
	BuildUtil.Box(
		roof,
		"RoofRidge",
		Vector3.new(d.X1 - d.X0, 0.3, 1.6),
		Vector3.new((d.X0 + d.X1) / 2, topY + t / 2 + 0.15, zc - 7),
		team.Secondary,
		Enum.Material.Metal
	)
	faceText(topPanel, Enum.NormalId.Top, name .. "  INDOOR PRACTICE", MEMBRANE, team, {
		LabelName = "RoofName",
		PixelsPerStud = 4,
		InsetX = 0.04,
		InsetY = 0.12,
		Outline = false,
		TextColor3 = team.Primary,
	})

	-- STEP 4: Doors & Lights -------------------------------------------------------------------
	BuildUtil.Stage(ctx, 4)
	local doors = BuildUtil.Child(ctx, "Doors")
	-- entrance: glass sliding doors pushed to the sides, transom, signs, wall lanterns
	for _, s in ipairs({ -1, 1 }) do
		local edgeX = s < 0 and doorMinX or doorMaxX
		span(
			doors,
			"EntranceDoor",
			Vector3.new(math.min(edgeX, edgeX - s * 6.5), TURF_TOP, d.FrontZ + 0.7),
			Vector3.new(math.max(edgeX, edgeX - s * 6.5), d.OpenTop - 1.4, d.FrontZ + 1.1),
			GLASS_TINT,
			Enum.Material.Glass,
			{ Transparency = 0.5 }
		)
		local lantern = BuildUtil.Box(
			doors,
			"EntranceLantern",
			Vector3.new(0.9, 1.6, 0.4),
			Vector3.new(edgeX + s * d.PillarW / 2, 10.5, d.FrontZ - 0.4),
			LAMP_WHITE,
			Enum.Material.Neon
		)
		BuildUtil.Light(lantern, "PointLight", { Name = "LanternLight", Range = 16, Brightness = 1.5, Color = LAMP_WHITE })
	end
	BuildUtil.Box(
		doors,
		"EntranceTransom",
		Vector3.new(doorMaxX - doorMinX, 1.4, 0.8),
		Vector3.new(d.CenterX, d.OpenTop - 0.7, d.FrontZ + 0.9),
		team.Secondary,
		Enum.Material.Metal
	)
	local sign = span(
		doors,
		"EntranceSign",
		Vector3.new(doorMinX + 1, d.OpenTop + 0.6, d.FrontZ - 0.35),
		Vector3.new(doorMaxX - 1, d.HeaderTop - 0.6, d.FrontZ),
		INK,
		Enum.Material.SmoothPlastic
	)
	faceText(sign, Enum.NormalId.Front, "INDOOR PRACTICE", INK, team, { LabelName = "EntranceSignText", InsetY = 0.16 })
	local nameBoard = span(
		doors,
		"EntranceNameBoard",
		Vector3.new(doorMinX - 1, d.HeaderTop + 1.2, d.FrontZ + 0.4),
		Vector3.new(doorMaxX + 1, d.HeaderTop + 5.6, d.FrontZ + 1),
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	faceText(nameBoard, Enum.NormalId.Front, name, team.Primary, team, { LabelName = "EntranceNameText", Outline = 3 })

	-- west door (toward the practice field): doors swung in, a canopy and a sign above
	local wz0, wz1 = d.WestDoorZ - d.WestDoorHalf, d.WestDoorZ + d.WestDoorHalf
	for _, z in ipairs({ wz0 + 0.3, wz1 - 0.3 }) do
		span(
			doors,
			"WestDoorLeaf",
			Vector3.new(inX0 + 0.1, TURF_TOP, z - 0.15),
			Vector3.new(inX0 + 0.1 + d.WestDoorHalf - 0.2, y1 - 3, z + 0.15),
			team.Secondary,
			Enum.Material.Metal
		)
	end
	span(
		doors,
		"WestDoorCanopy",
		Vector3.new(d.X0 - 3, y1 + 0.2, wz0 - 2),
		Vector3.new(d.X0, y1 + 0.8, wz1 + 2),
		team.Secondary,
		Enum.Material.Metal
	)
	local westSign = span(
		doors,
		"WestDoorSign",
		Vector3.new(d.X0 - 0.4, y1 + 1.6, wz0 - 6),
		Vector3.new(d.X0 - 0.05, y1 + 6, wz1 + 6),
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	faceText(westSign, Enum.NormalId.Left, "INDOOR FIELD", team.Primary, team, { LabelName = "WestDoorSignText" })

	-- east loading door: roll-up door half open + its roll housing
	local ez0, ez1 = d.EastDoorZ - d.EastDoorHalf, d.EastDoorZ + d.EastDoorHalf
	local rollDoor = span(
		doors,
		"LoadingDoor",
		Vector3.new(d.X1 + 0.05, 10, ez0 - 0.5),
		Vector3.new(d.X1 + 0.45, y1, ez1 + 0.5),
		ALUMINIUM,
		Enum.Material.CorrodedMetal
	)
	faceText(rollDoor, Enum.NormalId.Right, "EQUIPMENT", ALUMINIUM, team, { LabelName = "LoadingDoorText", InsetX = 0.15, InsetY = 0.2 })
	BuildUtil.Cylinder(doors, {
		Name = "LoadingDoorRoll",
		Axis = "Z",
		Position = Vector3.new(d.X1 + 0.9, y1 + 0.6, d.EastDoorZ),
		Height = ez1 - ez0 + 1,
		Diameter = 1.4,
		Color = team.Secondary,
		Material = Enum.Material.Metal,
	})

	-- ceiling lamps hanging from the two top purlins
	local lights = BuildUtil.Child(ctx, "CeilingLights")
	for _, k in ipairs({ 5, 6 }) do
		local z, y = domeVertex(d, k, purlinInset)
		for i = 0, 3 do
			local x = d.X0 + (d.X1 - d.X0) * (0.125 + i * 0.25)
			local lamp = BuildUtil.Box(
				lights,
				"CeilingLamp",
				Vector3.new(14, 1.6, 2.2),
				Vector3.new(x, y - 1.2, z),
				LAMP_WHITE,
				Enum.Material.Neon,
				{ CastShadow = false }
			)
			BuildUtil.Light(lamp, "SpotLight", {
				Name = "CeilingLight",
				Face = Enum.NormalId.Bottom,
				Range = 60,
				Angle = 120,
				Brightness = 2,
				Color = LAMP_WHITE,
				Shadows = false,
			})
		end
	end

	-- banners inside: championship banners hanging from the far purlin and a welcome board on the
	-- far wall, all facing the entrance (-Z)
	local banners = BuildUtil.Child(ctx, "Banners")
	local purlinZ, purlinY = domeVertex(d, 8, purlinInset)
	for i, text in ipairs({ "LEAGUE CHAMPIONS", "DIVISION CHAMPIONS" }) do
		local x = d.CenterX + (i == 1 and -29 or 29)
		local flag = span(
			banners,
			"ChampionBanner",
			Vector3.new(x - 4, purlinY - 13, purlinZ - 0.65),
			Vector3.new(x + 4, purlinY - 0.1, purlinZ - 0.45),
			team.Primary,
			Enum.Material.Fabric,
			NO_COLLIDE
		)
		local label = faceText(flag, Enum.NormalId.Front, text, team.Primary, team, { LabelName = "ChampionBannerText", InsetX = 0.1 })
		label.TextWrapped = true
	end
	local wallZ = zc + (zc - domeZAt(d, 0, 13.5)) - t - 0.2 -- just inside the far team band
	local board = span(
		banners,
		"WelcomeBoard",
		Vector3.new(d.CenterX - 30, 5, wallZ - 0.4),
		Vector3.new(d.CenterX + 30, 13.5, wallZ),
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	faceText(board, Enum.NormalId.Front, name == "HOME" and "HOME OF CHAMPIONS" or ("HOME OF THE " .. name), team.Primary, team, {
		LabelName = "WelcomeBoardText",
		InsetX = 0.06,
		Outline = 3,
	})
end

return CampusFields
