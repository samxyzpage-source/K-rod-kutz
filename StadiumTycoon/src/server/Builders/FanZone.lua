--[[
	FanZone
	The Tailgate & Fan Zone: a long festival strip east of the stadium in
	Config.Layout.Zones.fan_zone (X[212, 276] Z[-190, 150], max height 30). The buy button
	(206, -150) stays clear on the open ground west of the strip.

	A paved lane (X[232, 244]) runs the length of the strip, from the FAN ZONE arch at the plaza end
	(-Z) to the stage at the far end (+Z). Everything else stands beside it:

	  z -190 ..  -58   tailgate lot: painted stalls on both sides of the lane
	  z  -56 ..   28   food trucks (east, serving windows face the lane) | football toss (west)
	  z   54 ..   86   mascot plaza: a round plaza in the lane, the statue in the middle
	  z  104 ..  150   stage area (the stage faces -Z, down the lane)

	Steps (Items.lua):
	  1 Tailgate Lot        asphalt lots with painted stalls and TAILGATE LOT lettering, grass, the
	                        lane with team edge lines, the round mascot plaza, the FAN ZONE arch with
	                        a giant football, string lights zig-zagging across the lane, trash cans
	  2 Food Trucks         TACOS, BBQ and ICE CREAM trucks: cab, wheels, headlights, serving window
	                        with a striped team awning, chalkboard menu, roof sign and a giant snack
	  3 Tents & Grills      a pickup with its tailgate down (cooler in the bed), two team canopy
	                        tents, a kettle grill and a barrel smoker (both smoking), camp chairs,
	                        a covered table, a cooler and a pair of cornhole boards
	  4 Football Toss Game  turf runway with yard marks and a throw line, a target board with three
	                        scoring holes under a FOOTBALL TOSS sign and a bin of footballs
	  5 Mascot Statue       a big blocky team bull in a #12 jersey holding a football up, on a
	                        plinth with the team name, lit from below
	  6 Stage & Speakers    stage deck with a team fascia and a ramp, banner wall, roof on truss
	                        columns, a light truss with coloured cans, speaker stacks, a DJ booth

	Paint heights: lot surfaces 0..0.2 | lane edge lines 0.24 | toss runway 0.28 | throw line 0.32 |
	mascot plaza 0.3. Fine markings (stall lines, lettering, stripes, speaker cones) are GUI frames.
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)

local FanZone = {}

---------------------------------------------------------------------------------------------
-- Layout (plot-local studs)
---------------------------------------------------------------------------------------------

local GROUND = 0.2 -- top of the lot surfaces (asphalt, grass and the lane)
local ZONE_X0, ZONE_X1 = 212, 276
local LANE = { X0 = 232, X1 = 244, Z0 = -190, Z1 = 104 }
local LANE_X = (LANE.X0 + LANE.X1) / 2 -- 238
local STALL_Z0, STALL_WIDTH, STALL_COUNT = -172, 9, 12 -- stalls from z -172 to -64
local WEST_STALLS = { X0 = 214, X1 = 230 }
local EAST_STALLS = { X0 = 246, X1 = 262 }
local WEST_LOT_END = -58 -- the west asphalt ends here, grass beyond
local EAST_LOT_END = 32 -- the east asphalt carries the lot and the food trucks
local EAST_LOT_X1 = 266 -- a grass strip runs beyond it along the plot edge
local GRASS_END = 104 -- the stage area beyond is the plain plot slab
local LOT_PPS = 6
local ARCH_Z = -181
local POLE_TOP = 13.4
local POLES = { { 231.2, -166 }, { 244.8, -113 }, { 231.2, -60 }, { 244.8, -7 }, { 231.2, 46 }, { 244.8, 99 } }
local TRUCK_X = 256 -- centre line of the food trucks (body X[252, 260]); serving side faces -X
local TRUCK_Z = { -42, -12, 18 }
local TOSS = { X0 = 214, X1 = 230, Z0 = -22, Z1 = 26, ThrowZ = -14, TargetZ = 20, Top = 0.28 }
local PLAZA = { X = LANE_X, Z = 70, Diameter = 32, Top = 0.3 }
local STAGE = { X0 = 220, X1 = 268, Z0 = 122, Z1 = 146, Top = 3.6, RoofY = 23 }

local PAINT = { CanCollide = false, CastShadow = false }
local GLOW = { CanCollide = false, CastShadow = false }
local NO_COLLIDE = { CanCollide = false }
local UP = Vector3.new(0, 1, 0)

local WHITE = Color3.fromRGB(248, 248, 248)
local INK = Color3.fromRGB(22, 22, 26)
local ASPHALT = Color3.fromRGB(54, 54, 60)
local STALL_WHITE = Color3.fromRGB(236, 236, 228)
local LANE_PAVER = Color3.fromRGB(178, 112, 84)
local PLAZA_PAVER = Color3.fromRGB(192, 178, 154)
local DARK_METAL = Color3.fromRGB(58, 60, 66)
local STRING_LIGHT = Color3.fromRGB(255, 212, 130)
local BIN_GREEN = Color3.fromRGB(46, 104, 66)
local BIN_BLUE = Color3.fromRGB(36, 92, 184)
local TIRE = Color3.fromRGB(30, 30, 32)
local CAR_GLASS = Color3.fromRGB(46, 58, 74)
local KITCHEN = Color3.fromRGB(78, 52, 36)
local WARM_LIGHT = Color3.fromRGB(255, 226, 170)
local STAINLESS = Color3.fromRGB(200, 204, 210)
local CHALKBOARD = Color3.fromRGB(34, 40, 37)
local MENU_TEXT = Color3.fromRGB(255, 228, 150)
local HEADLIGHT = Color3.fromRGB(255, 246, 220)
local TAIL_RED = Color3.fromRGB(222, 30, 30)
local SMOKE = Color3.fromRGB(205, 205, 210)
local GRILL_BLACK = Color3.fromRGB(32, 32, 34)
local PICKUP_WHITE = Color3.fromRGB(232, 233, 236)
local TENT_FRAME = Color3.fromRGB(196, 200, 206)
local CHAIR_FRAME = Color3.fromRGB(70, 72, 78)
local TURF = Color3.fromRGB(64, 150, 62)
local LEATHER = Color3.fromRGB(128, 68, 36)
local STONE = Color3.fromRGB(112, 112, 118)
local MARBLE = Color3.fromRGB(238, 235, 228)
local FUR = Color3.fromRGB(126, 76, 44)
local MUZZLE = Color3.fromRGB(222, 178, 136)
local HORN = Color3.fromRGB(244, 232, 200)
local HORN_TIP = Color3.fromRGB(196, 176, 140)
local HOOF = Color3.fromRGB(48, 40, 38)
local GOLD = Color3.fromRGB(255, 192, 40)
local STAGE_BLACK = Color3.fromRGB(30, 30, 34)
local TRUSS = Color3.fromRGB(196, 200, 206)
local SPEAKER_BLACK = Color3.fromRGB(26, 26, 30)
local CONE_GREY = Color3.fromRGB(74, 74, 82)

-- The three food trucks, from the entrance end. Body / sign colours are the trucks' own brands;
-- the awnings carry the team colours.
local TRUCKS = {
	{
		Name = "TacoTruck",
		Sign = "TACOS",
		Body = Color3.fromRGB(255, 178, 36),
		SignColor = Color3.fromRGB(206, 40, 30),
		Menu = "TACOS  $3\nBURRITOS  $5\nNACHOS  $4\nCHURROS  $2",
		Prop = "Taco",
	},
	{
		Name = "BBQTruck",
		Sign = "BBQ",
		Body = Color3.fromRGB(150, 34, 28),
		SignColor = Color3.fromRGB(28, 26, 26),
		Menu = "BRISKET  $8\nRIBS  $9\nPULLED PORK  $7\nWINGS  $6",
		Prop = "Smoker",
	},
	{
		Name = "IceCreamTruck",
		Sign = "ICE CREAM",
		Body = Color3.fromRGB(255, 184, 208),
		SignColor = Color3.fromRGB(64, 160, 220),
		Menu = "CONES  $2\nSUNDAES  $4\nSHAKES  $5\nSNOW CONES  $2",
		Prop = "Cone",
	},
}

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

-- First candidate that reads well on `background`, else whichever of white / ink reads best.
local function readableOn(background, candidates)
	for _, candidate in ipairs(candidates) do
		if contrast(background, candidate) >= 3 then
			return candidate
		end
	end
	if contrast(background, WHITE) >= contrast(background, INK) then
		return WHITE
	end
	return INK
end

-- A colour that differs clearly from `color` (for stripes next to it).
local function partnerColor(color, team)
	for _, candidate in ipairs({ team.Trim, team.Secondary, WHITE }) do
		if contrast(color, candidate) >= 1.6 then
			return candidate
		end
	end
	return INK
end

-- The owner's name (upper case) or `fallback` when the plot has no name yet.
local function teamName(ctx, fallback)
	local name = ctx.teamName
	if type(name) ~= "string" or name == "" then
		return fallback
	end
	return name
end

--[[
	Writes `text` on each face in `faces` of `part`, coloured to read well on `background`.
	opts: TextColor3, Font, PixelsPerStud, InsetX / InsetY (fraction left empty, default 0.06 /
	      0.12), Wrap, Glow (ignore lighting), Outline (stroke thickness, 0 = none)
]]
local function sign(part, faces, text, background, team, opts)
	opts = opts or {}
	local color = opts.TextColor3 or readableOn(background, { team.Trim, team.Secondary, team.Primary })
	local insetX = opts.InsetX or 0.06
	local insetY = opts.InsetY or 0.12
	for _, face in ipairs(faces) do
		local _, label = BuildUtil.SurfaceText(part, face, text, {
			LabelName = part.Name .. face.Name,
			TextColor3 = color,
			Font = opts.Font or Enum.Font.GothamBlack,
			PixelsPerStud = opts.PixelsPerStud or 20,
			LightInfluence = opts.Glow and 0 or 1,
		})
		label.Size = UDim2.new(1 - 2 * insetX, 0, 1 - 2 * insetY, 0)
		label.Position = UDim2.new(insetX, 0, insetY, 0)
		label.TextWrapped = opts.Wrap == true
		if (opts.Outline or 0) > 0 then
			local stroke = Instance.new("UIStroke")
			stroke.Name = "Outline"
			stroke.Color = readableOn(color, { INK, WHITE })
			stroke.Thickness = opts.Outline
			stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Contextual
			stroke.Parent = label
		end
	end
end

-- A SurfaceGui (no text) on one face of `part`, for painting frames onto it.
local function canvas(part, face, pixelsPerStud)
	local gui = Instance.new("SurfaceGui")
	gui.Name = part.Name .. face.Name .. "Paint"
	gui.Face = face
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = pixelsPerStud or 20
	gui.LightInfluence = 1
	gui.Parent = part
	return gui
end

-- A frame placed by scale (fractions of the face): x, y = top-left corner, w, h = size.
local function blob(gui, name, x, y, w, h, color, round)
	local frame = Instance.new("Frame")
	frame.Name = name
	frame.BackgroundColor3 = color
	frame.BorderSizePixel = 0
	frame.Position = UDim2.new(x, 0, y, 0)
	frame.Size = UDim2.new(w, 0, h, 0)
	frame.Parent = gui
	if round then
		local corner = Instance.new("UICorner")
		corner.CornerRadius = UDim.new(0.5, 0)
		corner.Parent = frame
	end
	return frame
end

--[[
	Paint on the Top face of an axis-aligned part covering [x0, x1] x [z0, z1], addressed in plot
	coordinates. flip = true when the part is turned 180 degrees about Y, so lettering reads upright
	for someone looking toward +Z (Top-face text reads upright from the part's +Z side).
]]
local function topSheet(part, x0, x1, z0, z1, pixelsPerStud, flip)
	local gui = canvas(part, Enum.NormalId.Top, pixelsPerStud)
	local function u(x)
		return (flip and (x1 - x) or (x - x0)) * pixelsPerStud
	end
	local function v(z)
		return (flip and (z1 - z) or (z - z0)) * pixelsPerStud
	end
	local sheet = {}
	local function place(inst, ax, bx, az, bz)
		local u0, u1, v0, v1 = u(ax), u(bx), v(az), v(bz)
		inst.Position = UDim2.new(0, math.min(u0, u1), 0, math.min(v0, v1))
		inst.Size = UDim2.new(0, math.abs(u1 - u0), 0, math.abs(v1 - v0))
		inst.BorderSizePixel = 0
		inst.Parent = gui
		return inst
	end
	function sheet.rect(name, ax, bx, az, bz, color)
		local frame = Instance.new("Frame")
		frame.Name = name
		frame.BackgroundColor3 = color
		return place(frame, ax, bx, az, bz)
	end
	function sheet.text(name, ax, bx, az, bz, text, color)
		local label = Instance.new("TextLabel")
		label.Name = name
		label.BackgroundTransparency = 1
		label.Font = Enum.Font.GothamBlack
		label.Text = text
		label.TextColor3 = color
		label.TextScaled = true
		label.TextWrapped = true
		return place(label, ax, bx, az, bz)
	end
	return sheet
end

-- Axis-aligned block between two corners (plot-local).
local function span(ctx, name, x0, x1, y0, y1, z0, z1, color, material, extra)
	x0, x1 = math.min(x0, x1), math.max(x0, x1)
	y0, y1 = math.min(y0, y1), math.max(y0, y1)
	z0, z1 = math.min(z0, z1), math.max(z0, z1)
	return BuildUtil.Box(
		ctx,
		name,
		Vector3.new(x1 - x0, y1 - y0, z1 - z0),
		Vector3.new((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
		color,
		material or Enum.Material.SmoothPlastic,
		extra
	)
end

-- Block placed by a CFrame (plot-local).
local function boxAt(ctx, name, size, cframe, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Size = size
	props.CFrame = cframe
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Part(ctx, props)
end

-- Cylinder along the local X axis of `cframe`.
local function cylinderAt(ctx, name, cframe, length, diameter, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Shape = Enum.PartType.Cylinder
	props.Size = Vector3.new(length, diameter, diameter)
	props.CFrame = cframe
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Part(ctx, props)
end

-- CFrame at the middle of a -> b, looking from a to b (works for vertical segments too).
local function along(a, b)
	local dir = (b - a).Unit
	local up = math.abs(dir.Y) > 0.99 and Vector3.new(0, 0, 1) or UP
	return CFrame.lookAt((a + b) / 2, b, up)
end

-- Square-section bar from a to b.
local function bar(ctx, name, a, b, width, color, material, extra)
	return boxAt(ctx, name, Vector3.new(width, width, (b - a).Magnitude), along(a, b), color, material, extra)
end

-- Round pipe from a to b (its local +X axis points from a to b).
local function pipe(ctx, name, a, b, diameter, color, material, extra)
	return cylinderAt(ctx, name, along(a, b) * CFrame.Angles(0, math.pi / 2, 0), (b - a).Magnitude, diameter, color, material, extra)
end

-- Upright cylinder standing on y = baseY.
local function post(ctx, name, x, z, baseY, height, diameter, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Position = Vector3.new(x, baseY + height / 2, z)
	props.Height = height
	props.Diameter = diameter
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Cylinder(ctx, props)
end

local function ball(ctx, name, position, diameter, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Position = position
	props.Diameter = diameter
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Ball(ctx, props)
end

-- A football: one ball part shown as an ellipsoid (a sphere mesh stretched along the local X axis
-- of `cframe`). The offline previews draw it as a plain ball.
local function football(ctx, name, cframe, length, diameter, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Shape = Enum.PartType.Ball
	props.Size = Vector3.new(diameter, diameter, diameter)
	props.CFrame = cframe
	props.Color = LEATHER
	props.Material = Enum.Material.SmoothPlastic
	local part = BuildUtil.Part(ctx, props)
	local mesh = Instance.new("SpecialMesh")
	mesh.Name = "FootballShape"
	mesh.MeshType = Enum.MeshType.Sphere
	mesh.Scale = Vector3.new(length / diameter, 1, 1)
	mesh.Parent = part
	return part
end

--[[
	Right triangle (WedgePart) standing in a plane: `corner` is the right-angle corner, the legs run
	`a` studs along unit vector `u` and `b` studs along unit vector `w`; `thickness` along u x w.
]]
local function triangle(ctx, name, corner, u, a, w, b, thickness, color, material, extra)
	local props = extra and table.clone(extra) or {}
	local yAxis, zAxis = u, -w
	props.Name = name
	props.Size = Vector3.new(thickness, a, b)
	props.CFrame = CFrame.fromMatrix(corner + u * (a / 2) + w * (b / 2), yAxis:Cross(zAxis), yAxis, zAxis)
	props.Color = color
	props.Material = material
	return BuildUtil.Wedge(ctx, props)
end

-- Peaked canopy roof: two wedges meeting in a ridge along X at z = cz, standing on y = baseY.
local function gableRoof(ctx, name, cx, cz, baseY, lengthX, depthZ, rise, color, material)
	local half = depthZ / 2
	local size = Vector3.new(lengthX, rise, half)
	-- south half: a wedge's tall face is its local +Z side, so it sits on the ridge as built
	BuildUtil.Wedge(ctx, {
		Name = name,
		Size = size,
		CFrame = CFrame.new(cx, baseY + rise / 2, cz - half / 2),
		Color = color,
		Material = material,
	})
	BuildUtil.Wedge(ctx, {
		Name = name,
		Size = size,
		CFrame = CFrame.new(cx, baseY + rise / 2, cz + half / 2) * CFrame.Angles(0, math.pi, 0),
		Color = color,
		Material = material,
	})
end

-- Grey smoke puff (no collision, half see-through).
local function smoke(ctx, position, diameter)
	return ball(ctx, "Smoke", position, diameter, SMOKE, Enum.Material.SmoothPlastic, {
		Transparency = 0.45,
		CanCollide = false,
		CastShadow = false,
	})
end

---------------------------------------------------------------------------------------------
-- Step 1: Tailgate Lot
---------------------------------------------------------------------------------------------

-- Asphalt with painted stalls (GUI lines) and TAILGATE LOT lettering at the entrance end.
local function asphaltLot(ctx, name, x0, x1, z1, stalls, team)
	local z0 = LANE.Z0
	local lot = BuildUtil.Part(ctx, {
		Name = name,
		Size = Vector3.new(x1 - x0, GROUND, z1 - z0),
		-- turned around so the lettering reads upright for fans walking in from the plaza (+Z)
		CFrame = CFrame.new((x0 + x1) / 2, GROUND / 2, (z0 + z1) / 2) * CFrame.Angles(0, math.pi, 0),
		Color = ASPHALT,
		Material = Enum.Material.Asphalt,
	})
	local sheet = topSheet(lot, x0, x1, z0, z1, LOT_PPS, true)
	for k = 0, STALL_COUNT do
		local z = STALL_Z0 + k * STALL_WIDTH
		sheet.rect("StallLine", stalls.X0, stalls.X1, z - 0.2, z + 0.2, STALL_WHITE)
	end
	-- a short "T" bar at the outer end of every stall line
	local outer = math.abs(stalls.X0 - LANE_X) > math.abs(stalls.X1 - LANE_X) and stalls.X0 or stalls.X1
	sheet.rect("StallEnd", outer - 0.2, outer + 0.2, STALL_Z0, STALL_Z0 + STALL_COUNT * STALL_WIDTH, STALL_WHITE)
	local textColor = readableOn(ASPHALT, { team.Trim, team.Secondary, team.Primary })
	sheet.text("LotName", stalls.X0, stalls.X1, z0 + 3, STALL_Z0 - 2, "TAILGATE LOT", textColor)
	return lot
end

local function tailgateLot(ctx, team, C, name)
	local lot = BuildUtil.Child(ctx, "TailgateLot")

	-- the lane and its team-coloured edge lines
	span(lot, "FanLane", LANE.X0, LANE.X1, 0, GROUND, LANE.Z0, LANE.Z1, LANE_PAVER, Enum.Material.Pavement)
	for _, x in ipairs({ LANE.X0, LANE.X1 - 0.6 }) do
		span(lot, "LaneEdge", x, x + 0.6, GROUND, 0.24, LANE.Z0, LANE.Z1, team.Primary, Enum.Material.SmoothPlastic, PAINT)
	end

	asphaltLot(lot, "WestLot", ZONE_X0, LANE.X0, WEST_LOT_END, WEST_STALLS, team)
	asphaltLot(lot, "EastLot", LANE.X1, EAST_LOT_X1, EAST_LOT_END, EAST_STALLS, team)
	span(lot, "WestGrass", ZONE_X0, LANE.X0, 0, GROUND, WEST_LOT_END, GRASS_END, C.Grass, Enum.Material.Grass)
	span(lot, "EastGrass", LANE.X1, EAST_LOT_X1, 0, GROUND, EAST_LOT_END, GRASS_END, C.Grass, Enum.Material.Grass)
	span(lot, "EdgeGrass", EAST_LOT_X1, ZONE_X1, 0, GROUND, LANE.Z0, GRASS_END, C.Grass, Enum.Material.Grass)

	-- round plaza in the lane where the mascot statue will stand
	local plaza = BuildUtil.Cylinder(lot, {
		Name = "MascotPlaza",
		Axis = "Y",
		Position = Vector3.new(PLAZA.X, (GROUND + PLAZA.Top) / 2, PLAZA.Z),
		Height = PLAZA.Top - GROUND,
		Diameter = PLAZA.Diameter,
		Color = PLAZA_PAVER,
		Material = Enum.Material.Pavement,
	})
	-- a team ring painted around its edge (the cylinder's +X face is its top)
	local ringGui = canvas(plaza, Enum.NormalId.Right, 4)
	local ring = blob(ringGui, "PlazaRing", 0.04, 0.04, 0.92, 0.92, team.Primary, true)
	ring.BackgroundTransparency = 1
	local ringStroke = Instance.new("UIStroke")
	ringStroke.Name = "Ring"
	ringStroke.Color = team.Primary
	ringStroke.Thickness = 6
	ringStroke.Parent = ring

	-- FAN ZONE arch over the lane with a giant football on top
	for _, x in ipairs({ LANE.X0 - 1.5, LANE.X1 + 1.5 }) do
		BuildUtil.Block(lot, "ArchPillar", Vector3.new(2, 16 - GROUND, 2), Vector3.new(x, 0, ARCH_Z), team.Primary, Enum.Material.SmoothPlastic, nil, GROUND)
	end
	local beam = span(lot, "ArchBeam", LANE.X0 - 3, LANE.X1 + 3, 12.4, 16.4, ARCH_Z - 1.2, ARCH_Z + 1.2, team.Secondary)
	sign(beam, { Enum.NormalId.Front }, "FAN ZONE", team.Secondary, team, { Outline = 2 })
	sign(beam, { Enum.NormalId.Back }, name ~= "" and ("GO " .. name .. "!") or "GAME DAY!", team.Secondary, team, { Outline = 2 })
	football(lot, "ArchFootball", CFrame.new(LANE_X, 18.2, ARCH_Z), 7, 3.6)

	-- string lights zig-zagging across the lane between poles on both edges
	for index, p in ipairs(POLES) do
		post(lot, "LightPole", p[1], p[2], GROUND, POLE_TOP - GROUND, 0.6, DARK_METAL, Enum.Material.Metal)
		if index > 1 then
			local previous = POLES[index - 1]
			local strand = pipe(
				lot,
				"StringLights",
				Vector3.new(previous[1], POLE_TOP - 0.4, previous[2]),
				Vector3.new(p[1], POLE_TOP - 0.4, p[2]),
				0.3,
				STRING_LIGHT,
				Enum.Material.Neon,
				GLOW
			)
			BuildUtil.Light(strand, "PointLight", { Name = "StringGlow", Range = 24, Brightness = 0.8, Color = STRING_LIGHT })
		end
	end

	-- trash + recycling cans beside the lane
	for _, bin in ipairs({ { 230.6, -140, BIN_GREEN }, { 245.4, -84, BIN_BLUE } }) do
		post(lot, "TrashCan", bin[1], bin[2], GROUND, 3, 2, bin[3], Enum.Material.SmoothPlastic)
		post(lot, "TrashLid", bin[1], bin[2], GROUND + 3, 0.4, 2.3, team.Primary, Enum.Material.SmoothPlastic)
	end
end

---------------------------------------------------------------------------------------------
-- Step 2: Food Trucks
---------------------------------------------------------------------------------------------

-- The snack on the roof, at the front of the roof (z = cz).
local PROPS = {}

-- A giant taco shell sunk into the roof with lettuce sticking out around it.
function PROPS.Taco(ctx, cx, top, cz)
	cylinderAt(ctx, "TacoLettuce", CFrame.new(cx, top, cz), 1.1, 6.2, Color3.fromRGB(96, 190, 60), Enum.Material.SmoothPlastic)
	cylinderAt(ctx, "TacoShell", CFrame.new(cx, top, cz), 1.8, 5.4, Color3.fromRGB(246, 200, 92), Enum.Material.SmoothPlastic)
end

-- A smoker chimney with smoke rising from it.
function PROPS.Smoker(ctx, cx, top, cz)
	post(ctx, "SmokerChimney", cx + 1.5, cz, top, 4, 1.2, GRILL_BLACK, Enum.Material.Metal)
	smoke(ctx, Vector3.new(cx + 1.6, top + 5.4, cz + 0.3), 2.6)
	smoke(ctx, Vector3.new(cx + 2.1, top + 7.6, cz + 1.0), 3.4)
end

-- A giant ice cream cone: two wedges for the cone, two scoops and a cherry.
function PROPS.Cone(ctx, cx, top, cz)
	local height, half = 4.6, 1.9
	local corner = Vector3.new(cx, top + 0.2 + height, cz)
	for _, side in ipairs({ -1, 1 }) do
		triangle(
			ctx,
			"Cone",
			corner,
			Vector3.new(0, -1, 0),
			height,
			Vector3.new(0, 0, side),
			half,
			2.6,
			Color3.fromRGB(214, 160, 92),
			Enum.Material.SmoothPlastic
		)
	end
	ball(ctx, "Scoop", corner + Vector3.new(0, 1.3, 0), 4.4, Color3.fromRGB(255, 150, 190))
	ball(ctx, "Cherry", corner + Vector3.new(0, 3.9, 0), 1.2, Color3.fromRGB(214, 20, 40))
end

--[[
	A food truck parked along Z at z = cz, nose toward the entrance (-Z), serving window on its -X
	side facing the lane. Body X[TRUCK_X - 4, TRUCK_X + 4].
]]
local function foodTruck(ctx, spec, cz, team)
	local truck = BuildUtil.Child(ctx, spec.Name)
	local cx = TRUCK_X
	local x0, x1 = cx - 4, cx + 4

	for _, dz in ipairs({ -6.5, 6 }) do
		BuildUtil.Cylinder(truck, {
			Name = "Wheels",
			Axis = "X",
			Position = Vector3.new(cx, GROUND + 1.4, cz + dz),
			Height = 8.4,
			Diameter = 2.8,
			Color = TIRE,
			Material = Enum.Material.Rubber,
		})
	end
	local body = span(truck, "Body", x0, x1, 2, 11, cz - 6.5, cz + 10, spec.Body)
	span(truck, "Cab", x0, x1, 2, 6, cz - 10, cz - 6.5, spec.Body)
	-- one glass block: windshield on the front, side windows on both sides
	span(truck, "CabGlass", x0 - 0.06, x1 + 0.06, 6.3, 9, cz - 6.6, cz - 3.4, CAR_GLASS, Enum.Material.Glass)
	span(truck, "HeadLights", cx - 3.2, cx + 3.2, 3.6, 4.4, cz - 10.08, cz - 9.96, HEADLIGHT, Enum.Material.Neon)

	-- serving window (warm kitchen inside) with a steel counter
	local window = span(truck, "ServingWindow", x0 - 0.08, x0 + 0.1, 5.4, 8.8, cz - 3, cz + 5.4, KITCHEN)
	BuildUtil.Light(window, "PointLight", { Name = "KitchenGlow", Range = 12, Brightness = 1, Color = WARM_LIGHT })
	span(truck, "Counter", x0 - 1.3, x0, 5.1, 5.4, cz - 3.2, cz + 5.6, STAINLESS, Enum.Material.Metal)

	-- striped awning hinged above the window, sloping down toward the lane
	local reach, drop = 3.6, 1.2
	local awningColor = team.Primary
	local stripeColor = partnerColor(awningColor, team)
	local awning = boxAt(
		truck,
		"Awning",
		Vector3.new(math.sqrt(reach * reach + drop * drop), 0.2, 9.8),
		CFrame.new(x0 - reach / 2, 9.7 - drop / 2, cz + 1.2) * CFrame.Angles(0, 0, math.atan2(drop, reach)),
		awningColor,
		Enum.Material.Fabric
	)
	for _, face in ipairs({ Enum.NormalId.Top, Enum.NormalId.Bottom }) do
		local gui = canvas(awning, face, 10)
		for stripe = 2, 6, 2 do
			blob(gui, "Stripe", 0, (stripe - 1) / 7, 1, 1 / 7, stripeColor)
		end
	end

	-- painted on the body: a team stripe along both sides and a chalkboard menu beside the window
	-- (the -X face runs from cz - 6.5 on its left to cz + 10 on its right, top edge at y = 11)
	local length, height = 16.5, 9
	for _, face in ipairs({ Enum.NormalId.Left, Enum.NormalId.Right }) do
		local gui = canvas(body, face, 10)
		blob(gui, "TeamStripe", 0, 0.9, 1, 0.05, team.Primary)
		if face == Enum.NormalId.Left then
			local board = blob(gui, "MenuBoard", 12.7 / length, 1.8 / height, 3.2 / length, 4.8 / height, CHALKBOARD)
			local menu = Instance.new("TextLabel")
			menu.Name = "Menu"
			menu.BackgroundTransparency = 1
			menu.Font = Enum.Font.GothamBold
			menu.Text = spec.Menu
			menu.TextColor3 = MENU_TEXT
			menu.TextScaled = true
			menu.TextWrapped = true
			menu.Size = UDim2.new(0.84, 0, 0.88, 0)
			menu.Position = UDim2.new(0.08, 0, 0.06, 0)
			menu.Parent = board
		end
	end

	-- roof sign (reads from both sides) and the giant snack
	local roofSign = span(truck, "RoofSign", cx - 0.4, cx + 0.4, 11, 13.8, cz - 0.2, cz + 9.6, spec.SignColor)
	sign(roofSign, { Enum.NormalId.Left, Enum.NormalId.Right }, spec.Sign, spec.SignColor, team, {
		TextColor3 = readableOn(spec.SignColor, { WHITE, Color3.fromRGB(255, 220, 60), INK }),
		InsetY = 0.1,
	})
	PROPS[spec.Prop](truck, cx, 11, cz - 3.4)
end

---------------------------------------------------------------------------------------------
-- Step 3: Tents & Grills
---------------------------------------------------------------------------------------------

local function stallCenter(k)
	return STALL_Z0 + (k - 0.5) * STALL_WIDTH
end

-- Pop-up canopy tent: four legs, a valance with the team name and a peaked roof.
local function canopyTent(ctx, name, cx, cz, color, team, text)
	local size, legTop = 8.6, 7.6
	local half = size / 2 - 0.3
	for _, sx in ipairs({ -1, 1 }) do
		for _, sz in ipairs({ -1, 1 }) do
			BuildUtil.Block(
				ctx,
				name .. "Leg",
				Vector3.new(0.3, legTop - GROUND, 0.3),
				Vector3.new(cx + sx * half, 0, cz + sz * half),
				TENT_FRAME,
				Enum.Material.Metal,
				nil,
				GROUND
			)
		end
	end
	local valance = span(ctx, name .. "Valance", cx - size / 2, cx + size / 2, legTop, legTop + 0.9, cz - size / 2, cz + size / 2, color, Enum.Material.Fabric)
	sign(valance, { Enum.NormalId.Front, Enum.NormalId.Back, Enum.NormalId.Left, Enum.NormalId.Right }, text, color, team, { InsetY = 0.08 })
	gableRoof(ctx, name .. "Peak", cx, cz, legTop + 0.9, size, size, 2.2, color, Enum.Material.Fabric)
end

-- Camp chair facing `facing` (a unit vector): sling back + seat in team colour on a dark frame.
local function campChair(ctx, x, z, facing, color)
	local frame = CFrame.lookAt(Vector3.new(x, GROUND, z), Vector3.new(x, GROUND, z) + facing)
	boxAt(ctx, "ChairBack", Vector3.new(1.8, 2.3, 0.25), frame * CFrame.new(0, 2.75, 0.95) * CFrame.Angles(math.rad(12), 0, 0), color, Enum.Material.Fabric)
	boxAt(ctx, "ChairSeat", Vector3.new(1.8, 0.3, 1.8), frame * CFrame.new(0, 1.55, 0), color, Enum.Material.Fabric)
	-- the legs: one dark frame under the seat, open at the sides
	boxAt(ctx, "ChairLegs", Vector3.new(1.7, 1.4, 1.6), frame * CFrame.new(0, 0.7, 0.05), CHAIR_FRAME, Enum.Material.Metal, { Transparency = 0.35 })
end

-- Cooler: team-coloured body with a white lid.
local function cooler(ctx, cframe, color)
	boxAt(ctx, "Cooler", Vector3.new(2.2, 1.3, 1.4), cframe * CFrame.new(0, 0.65, 0), color)
	boxAt(ctx, "CoolerLid", Vector3.new(2.3, 0.25, 1.5), cframe * CFrame.new(0, 1.42, 0), WHITE)
end

-- White pickup backed into a stall, tailgate down toward the lane. frame: front = local -Z.
local function pickup(ctx, frame, team)
	local w = 5
	for _, z in ipairs({ -3.4, 3.4 }) do
		cylinderAt(ctx, "PickupWheels", frame * CFrame.new(0, 1.3, z), w + 0.2, 2.6, TIRE, Enum.Material.Rubber)
	end
	boxAt(ctx, "PickupBody", Vector3.new(w, 1.8, 11), frame * CFrame.new(0, 2.3, 0), PICKUP_WHITE, Enum.Material.SmoothPlastic)
	boxAt(ctx, "PickupCab", Vector3.new(w - 0.3, 1.8, 3.4), frame * CFrame.new(0, 4.1, -1.3), CAR_GLASS, Enum.Material.Glass)
	boxAt(ctx, "PickupCabRoof", Vector3.new(w - 0.1, 0.3, 3.2), frame * CFrame.new(0, 5.15, -1.2), PICKUP_WHITE)
	for _, side in ipairs({ -1, 1 }) do
		boxAt(ctx, "PickupBedSide", Vector3.new(0.3, 1.1, 5), frame * CFrame.new(side * (w / 2 - 0.15), 3.75, 2.95), PICKUP_WHITE)
	end
	boxAt(ctx, "PickupTailgate", Vector3.new(w - 0.3, 0.25, 1.5), frame * CFrame.new(0, 3.08, 6.25), PICKUP_WHITE)
	boxAt(ctx, "PickupTailLights", Vector3.new(w + 0.05, 0.5, 0.1), frame * CFrame.new(0, 2.6, 5.52), TAIL_RED, Enum.Material.Neon)
	cooler(ctx, frame * CFrame.new(0, 3.2, 3.6) * CFrame.Angles(0, math.pi / 2, 0), team.Primary)
end

local function tailgateParty(ctx, team, name)
	local party = BuildUtil.Child(ctx, "Tailgate")
	local tentText = name ~= "" and name or "TAILGATE"

	-- east lot: pickup in stall 6, a team tent with a covered table next to it, kettle grill
	local pickupZ = stallCenter(6)
	pickup(party, CFrame.new(253, GROUND, pickupZ) * CFrame.Angles(0, -math.pi / 2, 0), team)

	local tentZ = stallCenter(5)
	canopyTent(party, "TentA", 252.4, tentZ, team.Primary, team, tentText)
	local tableTop = span(party, "PartyTable", 254.2, 256.4, GROUND, 2.8, tentZ - 2.6, tentZ + 2.6, team.Secondary, Enum.Material.Fabric)
	sign(tableTop, { Enum.NormalId.Left }, "GO TEAM!", team.Secondary, team)
	campChair(party, 250.8, tentZ - 2.2, Vector3.new(-1, 0, 0), team.Secondary)
	campChair(party, 250.8, tentZ + 2.2, Vector3.new(-1, 0, 0), team.Secondary)

	-- kettle grill at the lane end of the tent's stall
	local grill = Vector3.new(246.4, 0, tentZ - 1)
	post(party, "GrillLeg", grill.X, grill.Z, GROUND, 2, 0.35, GRILL_BLACK, Enum.Material.Metal)
	ball(party, "KettleGrill", Vector3.new(grill.X, 3, grill.Z), 2.4, GRILL_BLACK, Enum.Material.Metal)
	smoke(party, Vector3.new(grill.X + 0.3, 6, grill.Z + 0.3), 1.8)

	-- west lot: a second tent with a barrel smoker, chairs and a cooler
	local westZ = stallCenter(8)
	canopyTent(party, "TentB", 222.4, westZ, team.Secondary, team, tentText)
	local smokerX = 229.2
	span(party, "SmokerStand", smokerX - 1.1, smokerX + 1.1, GROUND, 2.2, westZ - 1.8, westZ + 1.8, GRILL_BLACK, Enum.Material.Metal)
	cylinderAt(
		party,
		"BarrelSmoker",
		CFrame.new(smokerX, 3.2, westZ) * CFrame.Angles(0, math.pi / 2, 0),
		4,
		2.4,
		GRILL_BLACK,
		Enum.Material.Metal
	)
	smoke(party, Vector3.new(smokerX + 0.3, 6.4, westZ - 1.2), 2)
	campChair(party, 220.6, westZ - 1.5, Vector3.new(1, 0, 0), team.Primary)
	cooler(party, CFrame.new(224.6, GROUND, westZ + 3), team.Primary)

	-- cornhole: two tilted boards facing each other along the west stalls
	for _, spot in ipairs({ { stallCenter(10), 1 }, { stallCenter(12), -1 } }) do
		local z, dir = spot[1], spot[2]
		local board = boxAt(
			party,
			"CornholeBoard",
			Vector3.new(2.2, 0.25, 4),
			CFrame.new(222, GROUND + 0.5, z) * CFrame.Angles(dir * math.rad(12), 0, 0),
			team.Primary,
			Enum.Material.Wood
		)
		local gui = canvas(board, Enum.NormalId.Top, 20)
		blob(gui, "Hole", 0.3, dir > 0 and 0.14 or 0.62, 0.4, 0.22, INK, true)
	end
end

---------------------------------------------------------------------------------------------
-- Step 4: Football Toss Game
---------------------------------------------------------------------------------------------

local function footballToss(ctx, team)
	local toss = BuildUtil.Child(ctx, "FootballToss")
	local x0, x1, tz = TOSS.X0, TOSS.X1, TOSS.TargetZ

	-- turf runway (turned so its marks read upright from the throw line)
	local turf = BuildUtil.Part(toss, {
		Name = "TossTurf",
		Size = Vector3.new(x1 - x0, TOSS.Top - GROUND, TOSS.Z1 - TOSS.Z0),
		CFrame = CFrame.new((x0 + x1) / 2, (GROUND + TOSS.Top) / 2, (TOSS.Z0 + TOSS.Z1) / 2) * CFrame.Angles(0, math.pi, 0),
		Color = TURF,
		Material = Enum.Material.Grass,
		CanCollide = false,
		CastShadow = false,
	})
	local sheet = topSheet(turf, x0, x1, TOSS.Z0, TOSS.Z1, 8, true)
	for index, z in ipairs({ -4, 6, 14 }) do
		sheet.rect("YardMark", x0 + 1, x1 - 1, z - 0.15, z + 0.15, WHITE)
		sheet.text("YardNumber", x0 + 1, x0 + 4, z + 0.4, z + 2.6, tostring(index * 5), WHITE)
	end
	sheet.text("ThrowHere", x0 + 3, x1 - 3, TOSS.Z0 + 1.5, TOSS.ThrowZ - 1.2, "THROW FROM HERE", WHITE)
	span(toss, "ThrowLine", x0, x1, TOSS.Top, 0.32, TOSS.ThrowZ - 0.4, TOSS.ThrowZ + 0.4, WHITE, Enum.Material.SmoothPlastic, PAINT)

	-- target frame: two posts, the sign on top and the board with three scoring holes
	for _, x in ipairs({ x0 + 0.8, x1 - 0.8 }) do
		BuildUtil.Block(toss, "TossPost", Vector3.new(1.2, 14.4, 1.2), Vector3.new(x, 0, tz), team.Primary, Enum.Material.Metal, nil, TOSS.Top)
	end
	local header = span(toss, "TossSign", x0, x1, 11.6, 14.8, tz - 0.7, tz + 0.7, team.Secondary)
	sign(header, { Enum.NormalId.Front, Enum.NormalId.Back }, "FOOTBALL TOSS", team.Secondary, team, { Outline = 2 })
	local bx0, bx1, by0, by1 = x0 + 1.4, x1 - 1.4, TOSS.Top, 11.6
	local board = span(toss, "TossBoard", bx0, bx1, by0, by1, tz - 0.3, tz + 0.3, WHITE, Enum.Material.Wood)
	local front = tz - 0.3
	local holes = { { 218.6, 8.4, 2.6, "25" }, { 225.4, 8.4, 2.6, "25" }, { 222, 4.4, 3.4, "10" } }
	local boardGui = canvas(board, Enum.NormalId.Front, 20)
	for _, hole in ipairs(holes) do
		local hx, hy, d, points = hole[1], hole[2], hole[3], hole[4]
		BuildUtil.Cylinder(toss, {
			Name = "HoleRim",
			Axis = "Z",
			Position = Vector3.new(hx, hy, front - 0.1),
			Height = 0.2,
			Diameter = d + 1,
			Color = team.Primary,
		})
		BuildUtil.Cylinder(toss, {
			Name = "Hole",
			Axis = "Z",
			Position = Vector3.new(hx, hy, front - 0.2),
			Height = 0.1,
			Diameter = d,
			Color = INK,
		})
		-- points under the hole (the Front face reads with +X on the left)
		local label = Instance.new("TextLabel")
		label.Name = "Points"
		label.BackgroundTransparency = 1
		label.Font = Enum.Font.GothamBlack
		label.Text = points
		label.TextScaled = true
		label.TextColor3 = INK
		label.Size = UDim2.new(2.4 / (bx1 - bx0), 0, 1.2 / (by1 - by0), 0)
		local labelTop = hy - (d + 1) / 2 - 0.1
		label.Position = UDim2.new((bx1 - hx - 1.2) / (bx1 - bx0), 0, (by1 - labelTop) / (by1 - by0), 0)
		label.Parent = boardGui
	end
	local rules = Instance.new("TextLabel")
	rules.Name = "Rules"
	rules.BackgroundTransparency = 1
	rules.Font = Enum.Font.GothamBlack
	rules.Text = "3 IN = PRIZE!"
	rules.TextScaled = true
	rules.TextColor3 = INK
	rules.Size = UDim2.new(0.8, 0, 0.1, 0)
	rules.Position = UDim2.new(0.1, 0, 0.01, 0)
	rules.Parent = boardGui

	-- a bin of footballs at the throw line
	local binX, binZ = x1 - 2, TOSS.ThrowZ - 2
	span(toss, "BallBin", binX - 1.2, binX + 1.2, TOSS.Top, 2.3, binZ - 1.2, binZ + 1.2, team.Primary, Enum.Material.DiamondPlate)
	football(toss, "Football", CFrame.new(binX - 0.4, 2.75, binZ - 0.3) * CFrame.Angles(0, 0.4, 0.3), 1.6, 1, NO_COLLIDE)
	football(toss, "Football", CFrame.new(binX + 0.5, 2.75, binZ + 0.2) * CFrame.Angles(0, -0.9, -0.2), 1.6, 1, NO_COLLIDE)
end

---------------------------------------------------------------------------------------------
-- Step 5: Mascot Statue
---------------------------------------------------------------------------------------------

local function mascotStatue(ctx, team, name)
	local statue = BuildUtil.Child(ctx, "MascotStatue")
	local cx, cz = PLAZA.X, PLAZA.Z

	-- plinth with the team name on every side
	BuildUtil.Block(statue, "PlinthBase", Vector3.new(12, 1.4, 12), Vector3.new(cx, 0, cz), STONE, Enum.Material.Slate, nil, PLAZA.Top)
	local plinth = BuildUtil.Block(statue, "Plinth", Vector3.new(9, 3.4, 9), Vector3.new(cx, 0, cz), MARBLE, Enum.Material.Marble, nil, PLAZA.Top + 1.4)
	local faces = { Enum.NormalId.Front, Enum.NormalId.Back, Enum.NormalId.Left, Enum.NormalId.Right }
	sign(plinth, faces, name ~= "" and name or "OUR MASCOT", MARBLE, team, { TextColor3 = readableOn(MARBLE, { team.Primary, team.Secondary }) })
	BuildUtil.Light(plinth, "SpotLight", { Name = "StatueLight", Face = Enum.NormalId.Top, Angle = 50, Range = 30, Brightness = 2 })

	-- the bull faces the entrance (-Z); his right side is +X
	local b = PLAZA.Top + 4.8
	for _, side in ipairs({ -1, 1 }) do
		BuildUtil.Block(statue, "Hoof", Vector3.new(2.6, 1.4, 3), Vector3.new(cx + side * 1.8, 0, cz - 0.3), HOOF, Enum.Material.SmoothPlastic, nil, b)
		BuildUtil.Block(statue, "Leg", Vector3.new(2.2, 4.6, 2.2), Vector3.new(cx + side * 1.8, 0, cz), FUR, Enum.Material.SmoothPlastic, nil, b + 1.2)
	end
	BuildUtil.Block(statue, "Shorts", Vector3.new(6.4, 2.6, 3.6), Vector3.new(cx, 0, cz), team.Secondary, Enum.Material.SmoothPlastic, nil, b + 5.2)
	local jersey = BuildUtil.Block(statue, "Jersey", Vector3.new(7.4, 6, 4.4), Vector3.new(cx, 0, cz), team.Primary, Enum.Material.Fabric, nil, b + 7.8)
	sign(jersey, { Enum.NormalId.Front }, "12", team.Primary, team, { InsetX = 0.22, InsetY = 0.12, Outline = 3 })
	sign(jersey, { Enum.NormalId.Back }, name ~= "" and name or "FANS", team.Primary, team, { InsetY = 0.3 })

	-- arms: the right one holds a football up high, the left rests on the hip
	bar(statue, "ArmRaised", Vector3.new(cx + 3.6, b + 12.6, cz), Vector3.new(cx + 6.6, b + 18, cz - 0.6), 1.9, FUR, Enum.Material.SmoothPlastic)
	bar(statue, "ArmHip", Vector3.new(cx - 3.6, b + 12.6, cz), Vector3.new(cx - 5.2, b + 8.6, cz), 1.9, FUR, Enum.Material.SmoothPlastic)
	football(statue, "HeldFootball", CFrame.new(cx + 7.1, b + 19.5, cz - 0.8) * CFrame.Angles(0, 0.3, math.rad(35)), 3.2, 2)

	-- head: muzzle with nostrils, a gold nose ring, angry eyes, horns and ears
	local headFront = cz - 3.1
	BuildUtil.Block(statue, "Head", Vector3.new(6.2, 5.2, 5.4), Vector3.new(cx, 0, cz - 0.4), FUR, Enum.Material.SmoothPlastic, nil, b + 13.6)
	local muzzle = span(statue, "Muzzle", cx - 2.2, cx + 2.2, b + 13.7, b + 16.1, headFront - 1.5, headFront + 0.1, MUZZLE)
	local nostrils = canvas(muzzle, Enum.NormalId.Front, 20)
	blob(nostrils, "Nostril", 0.18, 0.3, 0.16, 0.3, HOOF, true)
	blob(nostrils, "Nostril", 0.66, 0.3, 0.16, 0.3, HOOF, true)
	local ring = BuildUtil.Cylinder(statue, {
		Name = "NoseRing",
		Axis = "Z",
		Position = Vector3.new(cx, b + 13.5, headFront - 1.6),
		Height = 0.2,
		Diameter = 1.3,
		Color = GOLD,
		Material = Enum.Material.Metal,
	})
	-- the cylinder's +X face looks toward -Z: paint the hole in the ring
	blob(canvas(ring, Enum.NormalId.Right, 40), "RingHole", 0.25, 0.25, 0.5, 0.5, MUZZLE, true)
	for _, side in ipairs({ -1, 1 }) do
		local ex = cx + side * 1.5
		span(statue, "Eye", ex - 0.7, ex + 0.7, b + 16.4, b + 17.9, headFront - 0.15, headFront + 0.15, WHITE)
		span(statue, "Pupil", ex - side * 0.15 - 0.35, ex - side * 0.15 + 0.35, b + 16.6, b + 17.4, headFront - 0.3, headFront - 0.1, INK)
		boxAt(
			statue,
			"Brow",
			Vector3.new(1.9, 0.45, 0.3),
			CFrame.new(ex, b + 18.3, headFront - 0.1) * CFrame.Angles(0, 0, side * math.rad(16)),
			HOOF
		)
		-- horn: out of the top corner of the head, then curving up (clear of the raised arm)
		local root = Vector3.new(cx + side * 2.6, b + 18.2, cz - 0.4)
		local bend = Vector3.new(cx + side * 4.6, b + 18.7, cz - 0.4)
		pipe(statue, "Horn", root, bend, 1.3, HORN, Enum.Material.SmoothPlastic)
		pipe(statue, "HornTip", bend - Vector3.new(side * 0.3, 0, 0), Vector3.new(cx + side * 5.3, b + 21, cz - 0.6), 0.85, HORN_TIP, Enum.Material.SmoothPlastic)
	end
end

---------------------------------------------------------------------------------------------
-- Step 6: Stage & Speakers
---------------------------------------------------------------------------------------------

local function speakerStack(ctx, x0, x1, team)
	local z1 = STAGE.Z0 - 1.6
	local z0 = z1 - 4.4
	local cabinet = span(ctx, "SpeakerStack", x0, x1, 0, 9.6, z0, z1, SPEAKER_BLACK)
	-- woofers, a tweeter and a team badge painted on the front (4.8 wide, 9.6 tall)
	local gui = canvas(cabinet, Enum.NormalId.Front, 20)
	blob(gui, "Tweeter", 0.36, 0.05, 0.28, 0.14, CONE_GREY, true)
	blob(gui, "Woofer", 0.12, 0.22, 0.76, 0.38, CONE_GREY, true)
	blob(gui, "Woofer", 0.12, 0.6, 0.76, 0.38, CONE_GREY, true)
	blob(gui, "Badge", 0.3, 0.205, 0.4, 0.012, team.Primary)
end

local function stageShow(ctx, team, name)
	local stage = BuildUtil.Child(ctx, "Stage")
	local S = STAGE
	local cx = (S.X0 + S.X1) / 2

	span(stage, "StageDeck", S.X0, S.X1, 0, S.Top, S.Z0, S.Z1, STAGE_BLACK, Enum.Material.WoodPlanks)
	local fascia = span(stage, "StageFascia", S.X0 - 0.1, S.X1 + 0.1, 0.4, S.Top - 0.3, S.Z0 - 0.25, S.Z0, team.Primary)
	sign(fascia, { Enum.NormalId.Front }, name ~= "" and (name .. " FAN FEST") or "FAN FEST", team.Primary, team, { InsetY = 0.1 })
	BuildUtil.Wedge(stage, {
		Name = "StageRamp",
		Size = Vector3.new(5, S.Top, 7),
		-- slope falls toward -X (the west side of the stage)
		CFrame = CFrame.new(S.X0 - 3.5, S.Top / 2, S.Z0 + 5) * CFrame.Angles(0, math.pi / 2, 0),
		Color = DARK_METAL,
		Material = Enum.Material.DiamondPlate,
	})

	-- banner wall, roof and truss columns
	span(stage, "StageBackWall", S.X0 + 1, S.X1 - 1, S.Top, S.RoofY, S.Z1 - 1, S.Z1, STAGE_BLACK)
	local banner = span(stage, "StageBanner", cx - 17, cx + 17, 8.6, 19.6, S.Z1 - 1.3, S.Z1 - 1, team.Primary, Enum.Material.Fabric)
	sign(banner, { Enum.NormalId.Front }, "GAME DAY\nFAN FEST", team.Primary, team, { Wrap = true, InsetY = 0.1, Outline = 3 })
	-- roof: carried by the back wall and two truss columns at the front corners
	span(stage, "StageRoof", S.X0 - 2, S.X1 + 2, S.RoofY, S.RoofY + 1, S.Z0 - 2, S.Z1, team.Secondary, Enum.Material.Metal)
	for _, x in ipairs({ S.X0 - 1.4, S.X1 + 1.4 }) do
		span(stage, "TrussColumn", x - 0.6, x + 0.6, 0, S.RoofY, S.Z0 - 2, S.Z0 - 0.8, TRUSS, Enum.Material.DiamondPlate)
	end

	-- light truss across the front with four coloured cans aimed at the stage
	span(stage, "LightTruss", S.X0 - 2, S.X1 + 2, 20.6, 21.8, S.Z0 - 2, S.Z0 - 0.8, TRUSS, Enum.Material.DiamondPlate)
	local beams = { team.Primary, WARM_LIGHT, team.Secondary, WARM_LIGHT }
	for index, x in ipairs({ cx - 18, cx - 6, cx + 6, cx + 18 }) do
		local color = beams[index]
		if luminance(color) < 0.05 then
			color = team.Trim
		end
		local can = pipe(stage, "StageLight", Vector3.new(x, 20.6, S.Z0 - 1.4), Vector3.new(x, 18.8, S.Z0 + 0.2), 1.3, color, Enum.Material.Neon)
		BuildUtil.Light(can, "SpotLight", { Name = "StageBeam", Face = Enum.NormalId.Right, Angle = 40, Range = 40, Brightness = 3, Color = color })
	end

	-- speaker stacks on the ground at both front corners
	speakerStack(stage, ZONE_X0 + 0.6, ZONE_X0 + 5.4, team)
	speakerStack(stage, ZONE_X1 - 5.4, ZONE_X1 - 0.6, team)

	-- DJ booth: team-coloured table with two turntables and a laptop
	local deckTop = S.Top
	local booth = span(stage, "DJBooth", cx - 4, cx + 4, deckTop, deckTop + 3.4, S.Z0 + 4.5, S.Z0 + 7.5, team.Primary)
	sign(booth, { Enum.NormalId.Front }, "DJ", team.Primary, team, { InsetX = 0.3, InsetY = 0.15, Outline = 2 })
	for _, side in ipairs({ -1, 1 }) do
		post(stage, "Turntable", cx + side * 2.4, S.Z0 + 6, deckTop + 3.4, 0.3, 2, DARK_METAL, Enum.Material.Metal)
	end
	boxAt(
		stage,
		"Laptop",
		Vector3.new(1.8, 1.2, 0.1),
		CFrame.new(cx, deckTop + 4, S.Z0 + 6.6) * CFrame.Angles(math.rad(-15), 0, 0),
		STAINLESS,
		Enum.Material.Metal
	)
end

---------------------------------------------------------------------------------------------
-- fan_zone
---------------------------------------------------------------------------------------------

function FanZone.fan_zone(ctx)
	local team = ctx.colors
	local C = ctx.config.Colors
	local name = teamName(ctx, "")

	BuildUtil.Stage(ctx, 1)
	tailgateLot(ctx, team, C, name)

	BuildUtil.Stage(ctx, 2)
	for index, spec in ipairs(TRUCKS) do
		foodTruck(ctx, spec, TRUCK_Z[index], team)
	end

	BuildUtil.Stage(ctx, 3)
	tailgateParty(ctx, team, name)

	BuildUtil.Stage(ctx, 4)
	footballToss(ctx, team)

	BuildUtil.Stage(ctx, 5)
	mascotStatue(ctx, team, name)

	BuildUtil.Stage(ctx, 6)
	stageShow(ctx, team, name)
end

return FanZone
