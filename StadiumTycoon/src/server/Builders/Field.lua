--[[
	Field
	The playing surface and everything painted on (or standing on) it.

	  turf       mowing-striped grass covering the whole field surface
	  yardlines  boundary lines, goal lines, 5-yard lines, try lines, yard numbers + arrows
	  endzones   team-coloured end zone paint with the owner's name, orange corner pylons
	  goalposts  NFL "slingshot" goal posts above both end lines
	  midfield   team logo at the 50-yard line
	  benches    home-team bench area on the back sideline

	Paint layers (y, bottom of every layer is the turf top 0.2):
	  turf 0.2 | end zones 0.3 | lines 0.32 | numbers 0.34 | midfield logo 0.34 .. 0.45
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)

local Field = {}

local TURF_TOP = 0.2
local STRIPE_WIDTH = 10 -- mowing stripes line up with the 5-yard lines

local LINE_WIDTH = 0.6
local BOUNDARY_WIDTH = 1 -- sidelines and end lines are a little bolder than the yard lines
local LINE_THICKNESS = 0.12 -- 0.2 .. 0.32
local ENDZONE_THICKNESS = 0.1 -- 0.2 .. 0.3

local NUMBER_INSET = 12 -- distance from a sideline to the centre of its row of yard numbers
local NUMBER_HEIGHT = 6 -- studs, along Z
local NUMBER_PPS = 16
local NUMBER_TEXT_SIZE = 80 -- pixels (TextSize is capped at 100) -> 5 studs
local DIGIT_WIDTH = 3.2
local DIGIT_GAP = 1.2 -- the yard line runs through this gap, like a real field
local ARROW_LENGTH = 1.8
local ARROW_HALF_WIDTH = 0.8

local CROSSBAR_HEIGHT = 7 -- 10 ft
local UPRIGHT_HALF_GAP = 6.2 -- 18'6" between the uprights
local UPRIGHT_HEIGHT = 22 -- above the crossbar
local POST_SETBACK = 5.5 -- base post sits this far behind the uprights
local PAD_HEIGHT = 4

local PAINT = { CanCollide = false, CastShadow = false }
local UP = Vector3.new(0, 1, 0)

local PYLON_ORANGE = Color3.fromRGB(255, 112, 20)
local RIBBON_RED = Color3.fromRGB(240, 70, 30)
local COOLER_ORANGE = Color3.fromRGB(247, 128, 10)
local WHITE = Color3.fromRGB(245, 245, 245)
local MEDICAL_BLUE = Color3.fromRGB(36, 92, 196)
local MEDICAL_RED = Color3.fromRGB(215, 30, 40)
local MAT_GREY = Color3.fromRGB(58, 60, 66)
local HEATER_GREY = Color3.fromRGB(44, 45, 50)
local HEATER_GLOW = Color3.fromRGB(255, 120, 30)

---------------------------------------------------------------------------------------------
-- Helpers
---------------------------------------------------------------------------------------------

-- Flat paint strip lying on the turf (bottom at TURF_TOP).
local function paint(ctx, name, sizeX, sizeZ, x, z, thickness, color, material)
	return BuildUtil.Box(
		ctx,
		name,
		Vector3.new(sizeX, thickness, sizeZ),
		Vector3.new(x, TURF_TOP + thickness / 2, z),
		color,
		material or Enum.Material.SmoothPlastic,
		PAINT
	)
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

-- Returns (textColor, outlineColor) from the team palette for text on `background`:
-- the most readable team colour for the letters, then the best of the other two for the outline.
local function teamTextColors(background, colors)
	local candidates = { colors.Trim, colors.Secondary, colors.Primary }
	table.sort(candidates, function(a, b)
		return contrast(a, background) > contrast(b, background)
	end)
	return candidates[1], candidates[2]
end

-- Big team-coloured text on one face of a part, inset by a fraction of the face on each side.
local function teamText(part, face, text, background, colors, pixelsPerStud, insetX, insetY, labelName, outline)
	local textColor, outlineColor = teamTextColors(background, colors)
	local _, label = BuildUtil.SurfaceText(part, face, text, {
		LabelName = labelName,
		TextColor3 = textColor,
		PixelsPerStud = pixelsPerStud,
		Font = Enum.Font.GothamBlack,
	})
	label.Size = UDim2.new(1 - 2 * insetX, 0, 1 - 2 * insetY, 0)
	label.Position = UDim2.new(insetX, 0, insetY, 0)
	local stroke = Instance.new("UIStroke")
	stroke.Name = "Outline"
	stroke.Color = outlineColor
	stroke.Thickness = outline or 3
	stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Contextual
	stroke.Parent = label
	return label
end

-- Half of a flat isosceles triangle: a WedgePart lying on its side so its triangular face is on top.
-- `corner` is the right-angle corner (middle of the arrow's base, y ignored), `dir` the horizontal unit
-- vector toward the tip, `side` the horizontal unit vector toward the base corner of this half.
local function flatHalfTriangle(ctx, name, corner, dir, side, length, halfWidth, thickness, color)
	-- Wedge local frame: X = thickness (up), right angle at local (y = -h/2, z = +d/2),
	-- legs along local +Y and local -Z. Pick whichever assignment is right-handed.
	local axisY, axisZ, h, d
	if (side + UP:Cross(dir)).Magnitude < 1e-3 then
		axisY, axisZ, h, d = dir, -side, length, halfWidth
	else
		axisY, axisZ, h, d = side, -dir, halfWidth, length
	end
	local base = Vector3.new(corner.X, TURF_TOP + thickness / 2, corner.Z)
	local center = base + axisY * (h / 2) - axisZ * (d / 2)
	return BuildUtil.Wedge(ctx, {
		Name = name,
		Size = Vector3.new(thickness, h, d),
		CFrame = CFrame.fromMatrix(center, UP, axisY, axisZ),
		Color = color,
		Material = Enum.Material.SmoothPlastic,
		CanCollide = false,
		CastShadow = false,
	})
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

local function newSurfaceGui(part, face, pixelsPerStud, name)
	local gui = Instance.new("SurfaceGui")
	gui.Name = name
	gui.Face = face
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = pixelsPerStud
	gui.LightInfluence = 1
	gui.Parent = part
	return gui
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

---------------------------------------------------------------------------------------------
-- turf: alternating mowing stripes over the whole field surface (top at y = 0.2)
---------------------------------------------------------------------------------------------
function Field.turf(ctx)
	local L = ctx.config.Layout
	local C = ctx.config.Colors

	-- stripe edges: the turf margin behind each end line, then 10-stud bands lined up with the yard lines
	local edges = { -L.SurfaceHalfX }
	for x = -L.FieldHalfLength, L.FieldHalfLength, STRIPE_WIDTH do
		table.insert(edges, x)
	end
	table.insert(edges, L.SurfaceHalfX)

	local depth = L.SurfaceMaxZ - L.SurfaceMinZ
	local centerZ = (L.SurfaceMinZ + L.SurfaceMaxZ) / 2
	for i = 1, #edges - 1 do
		local x0, x1 = edges[i], edges[i + 1]
		BuildUtil.Box(
			ctx,
			"TurfStripe" .. i,
			Vector3.new(x1 - x0, TURF_TOP, depth),
			Vector3.new((x0 + x1) / 2, TURF_TOP / 2, centerZ),
			i % 2 == 0 and C.GrassDark or C.Grass,
			Enum.Material.Grass
		)
	end
end

---------------------------------------------------------------------------------------------
-- yardlines: all the white paint plus the yard numbers
---------------------------------------------------------------------------------------------
function Field.yardlines(ctx)
	local L = ctx.config.Layout
	local lineColor = ctx.config.Colors.Line
	local front, back = L.FieldFrontZ, L.FieldBackZ
	local width = back - front
	local centerZ = L.FieldCenterZ
	local half = L.FieldHalfLength

	-- Boundary: sidelines and end lines sit just outside the field of play
	local outerLength = (half + BOUNDARY_WIDTH) * 2
	paint(ctx, "SidelineFront", outerLength, BOUNDARY_WIDTH, 0, front - BOUNDARY_WIDTH / 2, LINE_THICKNESS, lineColor)
	paint(ctx, "SidelineBack", outerLength, BOUNDARY_WIDTH, 0, back + BOUNDARY_WIDTH / 2, LINE_THICKNESS, lineColor)
	paint(ctx, "EndLineWest", BOUNDARY_WIDTH, width, -(half + BOUNDARY_WIDTH / 2), centerZ, LINE_THICKNESS, lineColor)
	paint(ctx, "EndLineEast", BOUNDARY_WIDTH, width, half + BOUNDARY_WIDTH / 2, centerZ, LINE_THICKNESS, lineColor)

	-- Goal lines and a line every 5 yards in between
	local step = 5 * L.Yard
	for x = -L.GoalLineX, L.GoalLineX, step do
		local isGoal = math.abs(x) >= L.GoalLineX
		local name = isGoal and "GoalLine" or ("YardLine" .. math.floor((L.GoalLineX - math.abs(x)) / L.Yard + 0.5))
		paint(ctx, name, LINE_WIDTH, width, x, centerZ, LINE_THICKNESS, lineColor)
	end

	-- Try (extra point) marks on the 2-yard lines
	for _, s in ipairs({ -1, 1 }) do
		paint(ctx, "TryLine", LINE_WIDTH, L.Yard, s * (L.GoalLineX - 2 * L.Yard), centerZ, LINE_THICKNESS, lineColor)
	end

	-- Yard numbers: one invisible carrier part per row, digits drawn with a SurfaceGui on its Top face.
	-- Top-face text is upright when read from the part's +Z side, so the front row is turned 180 degrees:
	-- each row then reads upright from its own sideline (tops of the numbers point to the middle of the field).
	local span = 2 * (L.GoalLineX - 5 * L.Yard) -- numbers + arrows live between the 5-yard lines
	local rows = {
		{ name = "NumbersFront", z = front + NUMBER_INSET, flip = true, topDir = 1 },
		{ name = "NumbersBack", z = back - NUMBER_INSET, flip = false, topDir = -1 },
	}
	local digitPixels = DIGIT_WIDTH * NUMBER_PPS
	local gapPixels = DIGIT_GAP / 2 * NUMBER_PPS
	for _, row in ipairs(rows) do
		local carrier = BuildUtil.Part(ctx, {
			Name = row.name,
			Size = Vector3.new(span, 0.02, NUMBER_HEIGHT),
			CFrame = CFrame.new(0, 0.33, row.z) * CFrame.Angles(0, row.flip and math.pi or 0, 0),
			Transparency = 1,
			CanCollide = false,
			CastShadow = false,
		})
		local gui = newSurfaceGui(carrier, Enum.NormalId.Top, NUMBER_PPS, "YardNumbersGui")

		for x = -(L.GoalLineX - 10 * L.Yard), L.GoalLineX - 10 * L.Yard, 10 * L.Yard do
			local yards = math.floor((L.GoalLineX - math.abs(x)) / L.Yard + 0.5)
			local text = tostring(yards)
			local localX = row.flip and -x or x
			local centerPixels = (localX + span / 2) * NUMBER_PPS
			digitLabel(gui, text:sub(1, 1), centerPixels - gapPixels - digitPixels, digitPixels, Enum.TextXAlignment.Right, lineColor)
			digitLabel(gui, text:sub(2, 2), centerPixels + gapPixels, digitPixels, Enum.TextXAlignment.Left, lineColor)

			-- direction arrow beside the number, pointing at the nearest goal line
			if x ~= 0 then
				local dir = Vector3.new(x < 0 and -1 or 1, 0, 0)
				local baseX = x + dir.X * (DIGIT_GAP / 2 + DIGIT_WIDTH + 0.7)
				local corner = Vector3.new(baseX, 0, row.z + row.topDir * 1.2)
				for _, sz in ipairs({ -1, 1 }) do
					flatHalfTriangle(
						ctx,
						"Arrow",
						corner,
						dir,
						Vector3.new(0, 0, sz),
						ARROW_LENGTH,
						ARROW_HALF_WIDTH,
						LINE_THICKNESS,
						lineColor
					)
				end
			end
		end
	end
end

---------------------------------------------------------------------------------------------
-- endzones: team paint with the owner's name + orange pylons on the corners
---------------------------------------------------------------------------------------------
function Field.endzones(ctx)
	local L = ctx.config.Layout
	local team = ctx.colors
	local front, back = L.FieldFrontZ, L.FieldBackZ
	local inner = L.GoalLineX + LINE_WIDTH / 2 -- paint starts right behind the goal line
	local outer = L.FieldHalfLength
	local depth = outer - inner
	local width = back - front

	for _, s in ipairs({ -1, 1 }) do
		local sideName = s < 0 and "West" or "East"
		-- Part X runs along the field width (Z) so the name runs across the end zone; rotated so the
		-- letters read upright for someone standing behind the end line (tops toward the goal line).
		local zone = BuildUtil.Part(ctx, {
			Name = "EndZone" .. sideName,
			Size = Vector3.new(width, ENDZONE_THICKNESS, depth),
			CFrame = CFrame.new(s * (inner + outer) / 2, TURF_TOP + ENDZONE_THICKNESS / 2, L.FieldCenterZ)
				* CFrame.Angles(0, s * math.rad(90), 0),
			Color = team.Primary,
			Material = Enum.Material.SmoothPlastic,
			CanCollide = false,
			CastShadow = false,
		})
		teamText(zone, Enum.NormalId.Top, ctx.teamName, team.Primary, team, 6, 0.05, 0.12, "EndZoneName", 4)

		-- pylons where the goal line and end line meet each sideline
		for _, px in ipairs({ s * L.GoalLineX, s * (outer + BOUNDARY_WIDTH / 2) }) do
			for _, pz in ipairs({ front - 0.4, back + 0.4 }) do
				BuildUtil.Block(
					ctx,
					"Pylon",
					Vector3.new(0.6, 1.6, 0.6),
					Vector3.new(px, 0, pz),
					PYLON_ORANGE,
					Enum.Material.SmoothPlastic,
					PAINT,
					TURF_TOP
				)
			end
		end
	end
end

---------------------------------------------------------------------------------------------
-- goalposts: single-post "slingshot" goals above both end lines
---------------------------------------------------------------------------------------------
function Field.goalposts(ctx)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local team = ctx.colors
	local zc = L.FieldCenterZ
	local postColor = C.GoalPost
	local metal = Enum.Material.Metal

	for _, s in ipairs({ -1, 1 }) do
		local goal = BuildUtil.Child(ctx, s < 0 and "WestGoalPost" or "EastGoalPost")
		local planeX = s * (L.FieldHalfLength + BOUNDARY_WIDTH / 2) -- uprights stand right above the end line
		local baseX = planeX + s * POST_SETBACK
		local padTop = TURF_TOP + PAD_HEIGHT

		-- padded base post
		BuildUtil.Cylinder(goal, {
			Name = "Padding",
			Position = Vector3.new(baseX, TURF_TOP + PAD_HEIGHT / 2, zc),
			Height = PAD_HEIGHT,
			Diameter = 2.2,
			Color = team.Primary,
			Material = Enum.Material.Fabric,
		})
		BuildUtil.Cylinder(goal, {
			Name = "PaddingBand",
			Position = Vector3.new(baseX, padTop - 0.6, zc),
			Height = 0.5,
			Diameter = 2.3,
			Color = team.Secondary,
			Material = Enum.Material.Fabric,
		})

		-- gooseneck: quarter circle from the top of the pad bending toward the field, then a short arm
		local radius = CROSSBAR_HEIGHT - padTop
		local bendCenter = Vector3.new(baseX - s * radius, padTop, zc)
		local points = {}
		for i = 0, 3 do
			local angle = math.rad(30 * i)
			points[i] = bendCenter + Vector3.new(s * radius * math.cos(angle), radius * math.sin(angle), 0)
		end
		for i = 1, 3 do
			rod(goal, "Gooseneck", points[i - 1], points[i], 0.9, postColor, metal)
			BuildUtil.Ball(goal, { Name = "GooseneckJoint", Position = points[i], Diameter = 0.9, Color = postColor, Material = metal })
		end
		rod(goal, "Arm", points[3], Vector3.new(planeX, CROSSBAR_HEIGHT, zc), 0.9, postColor, metal)

		-- crossbar and uprights
		BuildUtil.Cylinder(goal, {
			Name = "Crossbar",
			Axis = "Z",
			Position = Vector3.new(planeX, CROSSBAR_HEIGHT, zc),
			Height = UPRIGHT_HALF_GAP * 2 + 0.5,
			Diameter = 0.6,
			Color = postColor,
			Material = metal,
		})
		local uprightBottom = CROSSBAR_HEIGHT - 0.3
		local uprightLength = UPRIGHT_HEIGHT + 0.3
		local topY = uprightBottom + uprightLength
		for _, side in ipairs({ -1, 1 }) do
			local uz = zc + side * UPRIGHT_HALF_GAP
			BuildUtil.Cylinder(goal, {
				Name = "Upright",
				Position = Vector3.new(planeX, uprightBottom + uprightLength / 2, uz),
				Height = uprightLength,
				Diameter = 0.45,
				Color = postColor,
				Material = metal,
			})
			-- wind ribbon blowing toward +Z
			local ribbonDir = Vector3.new(0, -0.35, 0.94).Unit
			local ribbonUp = Vector3.new(0, 0.94, 0.35).Unit
			BuildUtil.Part(goal, {
				Name = "WindRibbon",
				Size = Vector3.new(0.06, 0.4, 2.4),
				CFrame = CFrame.fromMatrix(
					Vector3.new(planeX, topY - 0.15, uz) + ribbonDir * 1.2,
					ribbonUp:Cross(ribbonDir),
					ribbonUp,
					ribbonDir
				),
				Color = RIBBON_RED,
				Material = Enum.Material.Fabric,
				CanCollide = false,
				CastShadow = false,
			})
		end
	end
end

---------------------------------------------------------------------------------------------
-- midfield: team logo at the 50 (covers the 50-yard line, like most NFL fields)
---------------------------------------------------------------------------------------------
function Field.midfield(ctx)
	local L = ctx.config.Layout
	local team = ctx.colors
	local zc = L.FieldCenterZ

	local function disk(name, diameter, top, color)
		BuildUtil.Cylinder(ctx, {
			Name = name,
			Axis = "Y",
			Position = Vector3.new(0, (TURF_TOP + top) / 2, zc),
			Height = top - TURF_TOP,
			Diameter = diameter,
			Color = color,
			Material = Enum.Material.SmoothPlastic,
			CanCollide = false,
			CastShadow = false,
		})
	end
	disk("LogoOuterRing", 28, 0.34, team.Trim)
	disk("LogoRing", 26.4, 0.37, team.Secondary)
	disk("LogoDisk", 23, 0.4, team.Primary)

	-- two bars framing the name
	for _, side in ipairs({ -1, 1 }) do
		paint(ctx, "LogoBar", 15, 0.7, 0, zc + side * 4.6, 0.23, team.Secondary)
	end

	-- the owner's name, readable from the front sideline (where the players walk in)
	local nameCarrier = BuildUtil.Part(ctx, {
		Name = "LogoName",
		Size = Vector3.new(20, 0.02, 7),
		CFrame = CFrame.new(0, 0.44, zc) * CFrame.Angles(0, math.pi, 0),
		Transparency = 1,
		CanCollide = false,
		CastShadow = false,
	})
	teamText(nameCarrier, Enum.NormalId.Top, ctx.teamName, team.Primary, team, 13, 0, 0.05, "MidfieldName")
end

---------------------------------------------------------------------------------------------
-- benches: home team area on the back sideline (X[-40,40], Z[85,94], height <= 7)
---------------------------------------------------------------------------------------------
function Field.benches(ctx)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local team = ctx.colors
	local areaFront = L.FieldBackZ + 2 -- 85
	local areaBack = L.SurfaceMaxZ - 1 -- 94
	local matTop = TURF_TOP + 0.06

	-- The bench area is split in two halves so the home team tunnel (behind the middle of the
	-- sideline) has a clear lane onto the field: |x| < BENCH_LANE stays empty.
	local BENCH_LANE = L.BackTunnelHalfWidth + 2
	local MAT_WIDTH = 42
	local matX = BENCH_LANE + MAT_WIDTH / 2 -- 37

	-- rubber sideline mats with a team-coloured front edge
	for _, side in ipairs({ -1, 1 }) do
		paint(
			ctx,
			"SidelineMat",
			MAT_WIDTH,
			areaBack - areaFront,
			side * matX,
			(areaFront + areaBack) / 2,
			0.06,
			MAT_GREY,
			Enum.Material.Fabric
		)
		paint(ctx, "MatEdge", MAT_WIDTH, 0.5, side * matX, areaFront + 0.25, 0.08, team.Secondary)
	end

	-- two long team benches facing the field (-Z): metal legs, team-coloured seat and backrest
	local seatZ = areaFront + 3.5
	local seatTop = matTop + 2
	for _, s in ipairs({ -1, 1 }) do
		local bench = BuildUtil.Child(ctx, s < 0 and "BenchWest" or "BenchEast")
		local bx = s * (BENCH_LANE + 14) -- 30: bench spans 18..42
		for _, offset in ipairs({ -10.5, -3.5, 3.5, 10.5 }) do
			BuildUtil.Block(
				bench,
				"Leg",
				Vector3.new(0.4, 1.6, 1.8),
				Vector3.new(bx + offset, 0, seatZ + 0.1),
				C.Metal,
				Enum.Material.Metal,
				nil,
				matTop
			)
		end
		BuildUtil.Block(
			bench,
			"Seat",
			Vector3.new(24, 0.4, 2),
			Vector3.new(bx, 0, seatZ),
			team.Primary,
			Enum.Material.SmoothPlastic,
			nil,
			seatTop - 0.4
		)
		BuildUtil.Block(
			bench,
			"Backrest",
			Vector3.new(24, 1.8, 0.4),
			Vector3.new(bx, 0, seatZ + 0.8),
			team.Primary,
			Enum.Material.SmoothPlastic,
			nil,
			seatTop
		)
		BuildUtil.Block(
			bench,
			"BackrestStripe",
			Vector3.new(24.1, 0.4, 0.46),
			Vector3.new(bx, 0, seatZ + 0.8),
			team.Secondary,
			Enum.Material.SmoothPlastic,
			nil,
			seatTop + 1.5
		)
	end
	local benchBackTop = seatTop + 1.9 -- top of the backrest stripe

	-- drinks table with two orange coolers at the west end of the benches
	local drinks = BuildUtil.Child(ctx, "DrinksTable")
	local drinksX = -(BENCH_LANE + 34) -- -50
	-- table at seat height so the cooler lids (top 4.16) stay below the HOME TEAM lettering on the board
	local tableHeight = 2
	local tableTop = matTop + tableHeight
	BuildUtil.Block(
		drinks,
		"Table",
		Vector3.new(5, tableHeight, 2.2),
		Vector3.new(drinksX, 0, seatZ),
		team.Primary,
		Enum.Material.Fabric,
		nil,
		matTop
	)
	for _, s in ipairs({ -1, 1 }) do
		BuildUtil.Cylinder(drinks, {
			Name = "Cooler",
			Position = Vector3.new(drinksX + s * 1.2, tableTop + 0.8, seatZ + 0.2),
			Height = 1.6,
			Diameter = 1.6,
			Color = COOLER_ORANGE,
			Material = Enum.Material.SmoothPlastic,
		})
		BuildUtil.Cylinder(drinks, {
			Name = "CoolerLid",
			Position = Vector3.new(drinksX + s * 1.2, tableTop + 1.75, seatZ + 0.2),
			Height = 0.3,
			Diameter = 1.75,
			Color = WHITE,
			Material = Enum.Material.SmoothPlastic,
		})
	end
	BuildUtil.Cylinder(drinks, {
		Name = "CupStack",
		Position = Vector3.new(drinksX, tableTop + 0.6, seatZ - 0.6),
		Height = 1.2,
		Diameter = 0.55,
		Color = WHITE,
		Material = Enum.Material.SmoothPlastic,
	})

	-- medical tent footprint (built below); the east board's lettering stays clear of its roof
	local tentX, tentZ = BENCH_LANE + 36, areaFront + 3.6 -- 52
	local tentW, tentD, tentH, roofH = 6, 5.4, 4, 1.6
	local tentEaveX = tentX - tentW / 2 - 0.3

	-- sideline boards behind the benches (Secondary so they stand out behind the Primary benches).
	-- The field-side lettering sits in a band ABOVE the bench backrests, otherwise the benches hide it
	-- from the field and the front stands; the back carries full-height lettering for the home stands.
	local boardZ = areaBack - 0.8
	local boardWidth = 24
	local boardHeight = 6.3 -- cap top = 6.86, inside the 7-stud height limit
	local boardTop = matTop + boardHeight
	local bandBottom = benchBackTop + 0.2
	local bandTopInset = 0.12
	local panels = {
		{ x = -matX, text = ctx.teamName },
		{ x = matX, text = "HOME TEAM" },
	}
	for _, info in ipairs(panels) do
		local panel = BuildUtil.Block(
			ctx,
			"SidelineBoard",
			Vector3.new(boardWidth, boardHeight, 0.5),
			Vector3.new(info.x, 0, boardZ),
			team.Secondary,
			Enum.Material.SmoothPlastic,
			nil,
			matTop
		)
		-- Front face (-Z) GUI x runs toward world -X; work out the band from world x limits.
		local x0 = info.x - boardWidth / 2 + 0.6
		local x1 = math.min(info.x + boardWidth / 2 - 0.6, tentEaveX - 0.4)
		local front = teamText(panel, Enum.NormalId.Front, info.text, team.Secondary, team, 30, 0, 0, "BoardText", 3)
		front.Position = UDim2.new((info.x + boardWidth / 2 - x1) / boardWidth, 0, bandTopInset / boardHeight, 0)
		front.Size = UDim2.new((x1 - x0) / boardWidth, 0, (boardTop - bandTopInset - bandBottom) / boardHeight, 0)
		teamText(panel, Enum.NormalId.Back, info.text, team.Secondary, team, 20, 0.06, 0.16, "BoardBackText", 3)
		BuildUtil.Block(
			ctx,
			"SidelineBoardCap",
			Vector3.new(boardWidth + 0.2, 0.3, 0.7),
			Vector3.new(info.x, 0, boardZ),
			team.Primary,
			Enum.Material.SmoothPlastic,
			nil,
			boardTop
		)
	end

	-- blue medical tent at the east end
	local tent = BuildUtil.Child(ctx, "MedicalTent")
	BuildUtil.Block(
		tent,
		"TentBody",
		Vector3.new(tentW, tentH, tentD),
		Vector3.new(tentX, 0, tentZ),
		MEDICAL_BLUE,
		Enum.Material.Fabric,
		nil,
		matTop
	)
	for _, s in ipairs({ -1, 1 }) do
		-- gable roof: tall face of each wedge meets at the ridge (along Z)
		BuildUtil.Wedge(tent, {
			Name = "TentRoof",
			Size = Vector3.new(tentD + 0.6, roofH, tentW / 2 + 0.3),
			CFrame = CFrame.new(tentX + s * (tentW / 4 + 0.15), matTop + tentH + roofH / 2, tentZ) * CFrame.Angles(0, -s * math.rad(90), 0),
			Color = MEDICAL_BLUE,
			Material = Enum.Material.Fabric,
		})
	end
	local tentFrontZ = tentZ - tentD / 2
	local crossY = matTop + tentH / 2 + 0.3
	BuildUtil.Box(
		tent,
		"CrossPanel",
		Vector3.new(2.6, 2.6, 0.1),
		Vector3.new(tentX, crossY, tentFrontZ - 0.05),
		WHITE,
		Enum.Material.SmoothPlastic
	)
	BuildUtil.Box(
		tent,
		"CrossH",
		Vector3.new(1.9, 0.6, 0.14),
		Vector3.new(tentX, crossY, tentFrontZ - 0.07),
		MEDICAL_RED,
		Enum.Material.SmoothPlastic
	)
	BuildUtil.Box(
		tent,
		"CrossV",
		Vector3.new(0.6, 1.9, 0.14),
		Vector3.new(tentX, crossY, tentFrontZ - 0.07),
		MEDICAL_RED,
		Enum.Material.SmoothPlastic
	)

	-- sideline heater at the west end, glowing grille aimed at the bench
	local heater = BuildUtil.Child(ctx, "Heater")
	local hx, hz = -35, seatZ
	BuildUtil.Block(heater, "HeaterBody", Vector3.new(2.4, 3.2, 2.4), Vector3.new(hx, 0, hz), HEATER_GREY, Enum.Material.Metal, nil, matTop)
	BuildUtil.Block(
		heater,
		"HeaterCap",
		Vector3.new(2.6, 0.3, 2.6),
		Vector3.new(hx, 0, hz),
		team.Primary,
		Enum.Material.SmoothPlastic,
		nil,
		matTop + 3.2
	)
	local grille = BuildUtil.Box(
		heater,
		"HeaterGrille",
		Vector3.new(0.1, 1.8, 1.8),
		Vector3.new(hx + 1.25, matTop + 1.8, hz),
		HEATER_GLOW,
		Enum.Material.Neon,
		{ CastShadow = false }
	)
	BuildUtil.Light(grille, "PointLight", { Name = "HeaterGlow", Color = HEATER_GLOW, Range = 8, Brightness = 1 })
end

return Field
