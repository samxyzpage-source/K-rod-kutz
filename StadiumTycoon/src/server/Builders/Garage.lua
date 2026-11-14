--[[
	Garage
	The Golf Cart Garage (piece "golf_carts") in Config.Layout.Zones.golf_carts (X[128, 270]
	Z[328, 368], max height 20): behind the Hall of Fame, beside the back road. The buy button
	(124, 324) sits on the open slab between the Hall of Fame and the garage, clear of the
	carts' way out to the west.

	The building X[139, 193] Z[329, 367] is one walk-in garage with two rooms:
	  * CART BAYS (x 140 .. 170): three bays open to the west, one per cart. The server
	    (Vehicles.lua) parks the drivable carts on Config.Layout.CartPads (x 148, z 336 / 348 / 360,
	    facing -X). X[142, 154] x Z[pad - 5, pad + 5] holds nothing collidable and the west side has
	    no doors (only rolled-up shutters above the openings), so the carts drive straight out onto
	    a 22-stud apron (to the Campus Walk's columns at x 117, CampusLinks) with room to turn.
	    Low divider walls separate the backs of the bays (x 157 .. 170).
	  * WORKSHOP (x 171 .. 192): mechanic's bench, a cart up on a lift, a rolling tool chest, a
	    parts shelf, a soda vending machine and a lounge bench facing a live TV (the bench is a TV
	    camera seat). A double door from the back of bay 2 and a side door to the back road.

	Steps (Items.lua):
	  1 Garage                      the building: floor with painted bays, walls and windows, the
	                                partition and dividers, roof / ceiling with lights, facade signs
	                                and lamps, both doors, the cart rules poster and the workshop
	  2 Golf Cart #1                bay 1: bay sign, tool board and tire rack (+ cart #1, server)
	  3 Golf Cart #2                bay 2: the same (+ cart #2)
	  4 Charging Station & Cart #3  bay 3 (+ cart #3) and the charging station: a cabinet in the
	                                back of bay 3, a cable tray with a charging cable to every bay
	                                and the live OWNER parking sign

	Floor paint lives in GUI frames on the floor slab (it reads upright walking in from the west).
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)

local Garage = {}

---------------------------------------------------------------------------------------------
-- Layout (plot-local studs)
---------------------------------------------------------------------------------------------

local G = { X0 = 139, X1 = 193, Z0 = 329, Z1 = 367 } -- outside of the walls (1 thick)
local FLOOR_TOP = 0.1
local WALL_TOP = 14 -- underside of the ceiling slab (y 14 .. 15); the pitched roof sits on it
local ROOF_RISE = 4.8 -- ridge at y 19.8 (the zone allows 20)
local OPEN_TOP = 10.5 -- top of the cart openings in the west facade
local PART_X = 170 -- the partition between bays and workshop: x 170 .. 171
local DIV_X0, DIV_TOP = 157, 9 -- low bay dividers from x 157 to the partition
local DOOR_TOP = 8.5
local WORK_DOOR = { Z0 = 345, Z1 = 351 } -- partition doorway (back of bay 2)
local SIDE_DOOR = { X0 = 178, X1 = 184 } -- north wall doorway to the back road
local DEFAULT_PADS = { Vector3.new(148, 0, 336), Vector3.new(148, 0, 348), Vector3.new(148, 0, 360) }
local CART_REAR_X = 152.5 -- back end of a parked cart (9 long, centred on its pad)
local SIGN_X = 155.7 -- bay sign posts, just behind the carts
local TRAY_X = 156.5 -- overhead charging cable tray
local LIFT = { X = 180, Z = 339.4 } -- the cart lift in the workshop (4-stud aisles on every side)
local LOUNGE_Z = 360 -- lounge bench + TV
-- the lounge TV camera: high over the bowl's back corner, looking at the field centre. The garage is
-- built in CAMPUS-area coordinates (Config.Layout.Areas.campus = +120 z), so the stadium's field
-- centre (plot 0, 0, 30) is at campus (0, 0, -90) and the eye (plot 150, 70, 110) at campus z -10.
local STADIUM_CAM = { From = Vector3.new(150, 70, -10), To = Vector3.new(0, 0, -90) }

local PAINT = { CanCollide = false, CastShadow = false }
local UP = Vector3.new(0, 1, 0)

local WHITE = Color3.fromRGB(248, 248, 248)
local INK = Color3.fromRGB(22, 22, 26)
local WALL = Color3.fromRGB(214, 210, 200)
local WALL_INSIDE = Color3.fromRGB(196, 198, 202)
local FLOOR = Color3.fromRGB(142, 144, 150)
local ROOF = Color3.fromRGB(72, 74, 80)
local CEILING = Color3.fromRGB(226, 226, 222)
local BAY_YELLOW = Color3.fromRGB(255, 200, 40)
local GLASS = Color3.fromRGB(160, 210, 240)
local DARK_METAL = Color3.fromRGB(58, 60, 66)
local STEEL = Color3.fromRGB(176, 180, 188)
local LAMP = Color3.fromRGB(255, 244, 214)
local WARM_LIGHT = Color3.fromRGB(255, 232, 190)
local PEGBOARD = Color3.fromRGB(196, 158, 112)
local TOOL_RED = Color3.fromRGB(200, 40, 36)
local TIRE = Color3.fromRGB(30, 30, 32)
local CABLE = Color3.fromRGB(24, 24, 28)
local CHARGE_GREEN = Color3.fromRGB(60, 230, 110)
local WOOD = Color3.fromRGB(150, 105, 60)
local SCREEN_BLACK = Color3.fromRGB(14, 16, 22)
local LED_TEXT = Color3.fromRGB(255, 255, 255)
local CART_WHITE = Color3.fromRGB(240, 240, 240)
local CART_GLASS = Color3.fromRGB(170, 210, 235)

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

-- The owner's name (upper case) or `fallback` when the plot has no name yet.
local function teamName(ctx, fallback)
	local name = ctx.teamName
	if type(name) ~= "string" or name == "" then
		return fallback
	end
	return name
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

-- A text label placed by scale inside `parent` (a GUI or a frame).
local function words(parent, name, x, y, w, h, text, color, font)
	local label = Instance.new("TextLabel")
	label.Name = name
	label.BackgroundTransparency = 1
	label.BorderSizePixel = 0
	label.Position = UDim2.new(x, 0, y, 0)
	label.Size = UDim2.new(w, 0, h, 0)
	label.Font = font or Enum.Font.GothamBlack
	label.Text = text
	label.TextColor3 = color
	label.TextScaled = true
	label.TextWrapped = true
	label.Parent = parent
	return label
end

-- Text filling one face of `part` (with a small inset), coloured to read on `background`.
local function sign(part, face, text, background, team, insetX, insetY)
	local gui = canvas(part, face, 20)
	local color = readableOn(background, { team.Trim, team.Secondary, team.Primary })
	local ix, iy = insetX or 0.06, insetY or 0.12
	return words(gui, part.Name .. "Text", ix, iy, 1 - 2 * ix, 1 - 2 * iy, text, color)
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

-- Round pipe from a to b (a cylinder whose local X axis runs from a to b).
local function pipe(ctx, name, a, b, diameter, color, material, extra)
	local dir = (b - a).Unit
	local up = math.abs(dir.Y) > 0.99 and Vector3.new(0, 0, 1) or UP
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Shape = Enum.PartType.Cylinder
	props.Size = Vector3.new((b - a).Magnitude, diameter, diameter)
	props.CFrame = CFrame.lookAt((a + b) / 2, b, up) * CFrame.Angles(0, math.pi / 2, 0)
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Part(ctx, props)
end

-- Cylinder along a world axis ("X", "Y" or "Z") centred at `position`.
local function cylinder(ctx, name, axis, position, length, diameter, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Axis = axis
	props.Position = position
	props.Height = length
	props.Diameter = diameter
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Cylinder(ctx, props)
end

-- A pitched roof: two wedges meeting in a ridge along X over the middle of [z0, z1], on y = baseY.
local function pitched(ctx, name, x0, x1, z0, z1, baseY, rise, color, material)
	local cx, cz, half = (x0 + x1) / 2, (z0 + z1) / 2, (z1 - z0) / 2
	local size = Vector3.new(x1 - x0, rise, half)
	-- a wedge's tall face is its local +Z side: the south half sits on the ridge as built
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

-- A glowing ceiling panel (w along X, d along Z) centred on (x, z) with a PointLight.
local function ceilingLight(ctx, x, z, w, d, range)
	local lamp =
		span(ctx, "CeilingLight", x - w / 2, x + w / 2, WALL_TOP - 0.2, WALL_TOP, z - d / 2, z + d / 2, LAMP, Enum.Material.Neon, PAINT)
	BuildUtil.Light(lamp, "PointLight", { Name = "GarageLight", Range = range or 24, Brightness = 1.4, Color = WARM_LIGHT })
	return lamp
end

--[[
	A live screen (BuildUtil.LiveText) the server keeps up to date with the owner's team: dark
	background, bright text, readable in the dark (LightInfluence 0). Returns the TextLabel.
]]
local function liveScreen(part, face, live, placeholder, color, pixelsPerStud)
	local _, label = BuildUtil.LiveText(part, face, live, {
		LabelName = "Live_" .. live,
		Text = placeholder,
		TextColor3 = color or LED_TEXT,
		BackgroundColor3 = SCREEN_BLACK,
		BackgroundTransparency = 0,
		LightInfluence = 0,
		Font = Enum.Font.GothamBold,
		PixelsPerStud = pixelsPerStud or 24,
	})
	local pad = Instance.new("UIPadding")
	local px, py = UDim.new(0.05, 0), UDim.new(0.08, 0)
	pad.PaddingLeft, pad.PaddingRight, pad.PaddingTop, pad.PaddingBottom = px, px, py, py
	pad.Parent = label
	return label
end

-- A team band painted around a wall face at height y0 .. y1 (the wall spans wallY0 .. wallY1).
local function band(part, face, wallY0, wallY1, y0, y1, color)
	local h = wallY1 - wallY0
	blob(canvas(part, face, 4), "TeamBand", 0, (wallY1 - y1) / h, 1, (y1 - y0) / h, color)
end

-- The cart pads (Config.Layout.CartPads), with a fallback for older configs.
local function cartPads(ctx)
	local layout = ctx.config and ctx.config.Layout
	return (layout and layout.CartPads) or DEFAULT_PADS
end

---------------------------------------------------------------------------------------------
-- Step 1: the garage building
---------------------------------------------------------------------------------------------

--[[
	The floor slab, turned so its Top-face paint reads upright for someone walking in from the
	west (looking +X): local X = world +Z, local Z = world -X. Paints the parking boxes, the bay
	numbers, the way to the workshop and a safety box around the lift.
]]
local function garageFloor(ctx, pads, team)
	local x0, x1, z0, z1 = G.X0 + 1, G.X1 - 1, G.Z0 + 1, G.Z1 - 1
	local floor = BuildUtil.Part(ctx, {
		Name = "GarageFloor",
		Size = Vector3.new(z1 - z0, FLOOR_TOP, x1 - x0),
		CFrame = CFrame.new((x0 + x1) / 2, FLOOR_TOP / 2, (z0 + z1) / 2) * CFrame.Angles(0, -math.pi / 2, 0),
		Color = FLOOR,
		Material = Enum.Material.Concrete,
	})
	local pps = 6
	local gui = canvas(floor, Enum.NormalId.Top, pps)
	local function place(inst, ax, bx, az, bz)
		inst.Position = UDim2.new(0, (math.min(az, bz) - z0) * pps, 0, (x1 - math.max(ax, bx)) * pps)
		inst.Size = UDim2.new(0, math.abs(bz - az) * pps, 0, math.abs(bx - ax) * pps)
		inst.BorderSizePixel = 0
		inst.Parent = gui
		return inst
	end
	local function rect(name, ax, bx, az, bz, color)
		local frame = Instance.new("Frame")
		frame.Name = name
		frame.BackgroundColor3 = color
		return place(frame, ax, bx, az, bz)
	end
	local function text(name, ax, bx, az, bz, value, color)
		local label = Instance.new("TextLabel")
		label.Name = name
		label.BackgroundTransparency = 1
		label.Font = Enum.Font.GothamBlack
		label.Text = value
		label.TextColor3 = color
		label.TextScaled = true
		return place(label, ax, bx, az, bz)
	end
	local numberColor = readableOn(FLOOR, { team.Primary, team.Secondary, team.Trim })
	for index, pad in ipairs(pads) do
		-- parking box around the cart (open toward the entrance) and the bay number behind it
		rect("BayLine", x0 + 1, CART_REAR_X + 2.6, pad.Z - 5.2, pad.Z - 4.8, BAY_YELLOW)
		rect("BayLine", x0 + 1, CART_REAR_X + 2.6, pad.Z + 4.8, pad.Z + 5.2, BAY_YELLOW)
		rect("BayLine", CART_REAR_X + 2.2, CART_REAR_X + 2.6, pad.Z - 5.2, pad.Z + 5.2, BAY_YELLOW)
		text("BayNumber", 156.6, 162.6, pad.Z - 2.6, pad.Z + 2.6, tostring(index), numberColor)
	end
	text("ToWorkshop", 163.4, 169.4, WORK_DOOR.Z0 - 1, WORK_DOOR.Z1 + 1, "WORKSHOP", BAY_YELLOW)
	-- yellow safety box around the cart lift
	local lx0, lx1, lz0, lz1 = LIFT.X - 6, LIFT.X + 6, LIFT.Z - 3.6, LIFT.Z + 3.6
	rect("LiftBox", lx0, lx1, lz0, lz0 + 0.4, BAY_YELLOW)
	rect("LiftBox", lx0, lx1, lz1 - 0.4, lz1, BAY_YELLOW)
	rect("LiftBox", lx0, lx0 + 0.4, lz0, lz1, BAY_YELLOW)
	rect("LiftBox", lx1 - 0.4, lx1, lz0, lz1, BAY_YELLOW)
	return floor
end

-- Outer walls, facade, partition, dividers, roof and lights.
local function shell(ctx, pads, team, name)
	local s = BuildUtil.Child(ctx, "GarageShell")
	local wallMat = Enum.Material.Concrete

	-- west facade: a pillar between the bay openings, the team header above them, rolled-up
	-- shutters at the top of every opening and a lamp over each one
	local pillarZ = {}
	for _, pad in ipairs(pads) do
		table.insert(pillarZ, pad.Z - 6)
	end
	table.insert(pillarZ, pads[#pads].Z + 6)
	for _, z in ipairs(pillarZ) do
		span(s, "FacadePillar", G.X0, G.X0 + 1, 0, OPEN_TOP, z - 1, z + 1, WALL, wallMat)
	end
	local header = span(s, "FacadeHeader", G.X0, G.X0 + 1, OPEN_TOP, WALL_TOP, G.Z0, G.Z1, team.Primary)
	local headerGui = canvas(header, Enum.NormalId.Left, 20) -- faces west; +Z is on the right
	local headerText = readableOn(team.Primary, { team.Trim, team.Secondary })
	local length = G.Z1 - G.Z0
	for index, pad in ipairs(pads) do
		words(headerGui, "BayNumber", (pad.Z - 4 - G.Z0) / length, 0.14, 8 / length, 0.72, "CART " .. index, headerText)
		cylinder(s, "RolledShutter", "Z", Vector3.new(G.X0 + 1.7, OPEN_TOP - 0.6, pad.Z), 10, 1.1, STEEL, Enum.Material.Metal, PAINT)
		local lamp = span(
			s,
			"FacadeLamp",
			G.X0 - 0.5,
			G.X0,
			OPEN_TOP + 0.3,
			OPEN_TOP + 0.8,
			pad.Z - 1.2,
			pad.Z + 1.2,
			LAMP,
			Enum.Material.Neon,
			PAINT
		)
		BuildUtil.Light(lamp, "PointLight", { Name = "BayLamp", Range = 18, Brightness = 1.2, Color = WARM_LIGHT })
	end
	-- a welcome plaque on the pillar between bays 1 and 2
	local plaque = span(s, "GaragePlaque", G.X0 - 0.15, G.X0, 3.2, 5.6, pillarZ[2] - 0.8, pillarZ[2] + 0.8, WHITE)
	words(canvas(plaque, Enum.NormalId.Left, 30), "PlaqueText", 0.08, 0.1, 0.84, 0.8, "GOLF\nCART\nGARAGE", team.Primary)
	BuildUtil.Look(
		plaque,
		"Golf Cart Garage",
		"Home of your team's golf carts. Hop in one and cruise the campus roads - the fastest way from the stadium to the practice fields!",
		{ LookKey = "team", Distance = 6 } -- short, so it stays quiet on the buy button next door
	)

	-- long walls: a high clerestory window band along the bays (tool boards and tire racks hang
	-- below it), a low window band along the workshop; a team band painted inside and out
	local CLERESTORY = { Y0 = 9.6, Y1 = 12.6 }
	local function longWall(wallName, x0, x1, z0, z1, windowY0, windowY1, inside, outside)
		local low = span(s, wallName .. "Low", x0, x1, 0, windowY0, z0, z1, WALL, wallMat)
		band(low, inside, 0, windowY0, windowY0 - 0.8, windowY0 - 0.2, team.Primary)
		band(low, outside, 0, windowY0, windowY0 - 0.8, windowY0 - 0.2, team.Primary)
		span(
			s,
			wallName .. "Window",
			x0 + 1,
			x1 - 1,
			windowY0,
			windowY1,
			z0 + 0.3,
			z1 - 0.3,
			GLASS,
			Enum.Material.Glass,
			{ Transparency = 0.4 }
		)
		span(s, wallName .. "High", x0, x1, windowY1, WALL_TOP, z0, z1, WALL, wallMat)
		return low
	end
	local south =
		longWall("SouthWall", G.X0, PART_X + 1, G.Z0, G.Z0 + 1, CLERESTORY.Y0, CLERESTORY.Y1, Enum.NormalId.Back, Enum.NormalId.Front)
	-- the garage's name along the side facing the Hall of Fame
	sign(south, Enum.NormalId.Front, name ~= "" and (name .. " GOLF CART GARAGE") or "GOLF CART GARAGE", WALL, team, 0.06, 0.4)
	longWall("SouthWall", PART_X + 1, G.X1, G.Z0, G.Z0 + 1, 4.6, 9.4, Enum.NormalId.Back, Enum.NormalId.Front)

	-- north wall: clerestory along the bays, the side door to the back road in the workshop
	longWall("NorthWall", G.X0, SIDE_DOOR.X0, G.Z1 - 1, G.Z1, CLERESTORY.Y0, CLERESTORY.Y1, Enum.NormalId.Front, Enum.NormalId.Back)
	local northEast = span(s, "NorthWall", SIDE_DOOR.X1, G.X1, 0, WALL_TOP, G.Z1 - 1, G.Z1, WALL, wallMat)
	band(northEast, Enum.NormalId.Back, 0, WALL_TOP, CLERESTORY.Y0 - 0.8, CLERESTORY.Y0 - 0.2, team.Primary)
	band(northEast, Enum.NormalId.Front, 0, WALL_TOP, CLERESTORY.Y0 - 0.8, CLERESTORY.Y0 - 0.2, team.Primary)
	local lintel = span(s, "SideDoorLintel", SIDE_DOOR.X0, SIDE_DOOR.X1, DOOR_TOP, WALL_TOP, G.Z1 - 1, G.Z1, WALL, wallMat)
	sign(lintel, Enum.NormalId.Back, "CART WORKSHOP", WALL, team, 0.04, 0.3)

	-- east wall
	local east = span(s, "EastWall", G.X1 - 1, G.X1, 0, WALL_TOP, G.Z0 + 1, G.Z1 - 1, WALL, wallMat)
	band(east, Enum.NormalId.Right, 0, WALL_TOP, CLERESTORY.Y0 - 0.8, CLERESTORY.Y0 - 0.2, team.Primary)
	band(east, Enum.NormalId.Left, 0, WALL_TOP, CLERESTORY.Y0 - 0.8, CLERESTORY.Y0 - 0.2, team.Primary)
	sign(east, Enum.NormalId.Right, name ~= "" and (name .. " CART BARN") or "CART BARN", WALL, team, 0.08, 0.38)

	-- partition between the bays and the workshop (doorway in the back of bay 2)
	span(s, "Partition", PART_X, PART_X + 1, 0, WALL_TOP, G.Z0 + 1, WORK_DOOR.Z0, WALL_INSIDE, wallMat)
	span(s, "Partition", PART_X, PART_X + 1, 0, WALL_TOP, WORK_DOOR.Z1, G.Z1 - 1, WALL_INSIDE, wallMat)
	local doorHead = span(s, "PartitionLintel", PART_X, PART_X + 1, DOOR_TOP, WALL_TOP, WORK_DOOR.Z0, WORK_DOOR.Z1, WALL_INSIDE, wallMat)
	sign(doorHead, Enum.NormalId.Left, "WORKSHOP", WALL_INSIDE, team, 0.06, 0.2)

	-- low dividers between the backs of the bays
	for index = 2, #pads do
		local z = pads[index].Z - 6
		local divider = span(s, "BayDivider", DIV_X0, PART_X, 0, DIV_TOP, z - 0.5, z + 0.5, WALL_INSIDE, wallMat)
		blob(canvas(divider, Enum.NormalId.Top, 4), "Cap", 0, 0, 1, 1, team.Primary)
	end

	-- ceiling slab on the walls (a team trim band outside), a pitched roof on top with the big
	-- sign on its west gable, and the lights: one over each bay, two in the workshop
	local ceiling = span(s, "GarageCeiling", G.X0, G.X1, WALL_TOP, WALL_TOP + 1, G.Z0, G.Z1, CEILING)
	for _, face in ipairs({ Enum.NormalId.Front, Enum.NormalId.Back, Enum.NormalId.Left, Enum.NormalId.Right }) do
		blob(canvas(ceiling, face, 4), "TrimBand", 0, 0, 1, 1, team.Primary)
	end
	pitched(s, "GarageRoof", G.X0 - 0.4, G.X1 + 0.4, G.Z0 - 0.6, G.Z1 + 0.6, WALL_TOP + 1, ROOF_RISE, ROOF, Enum.Material.Metal)
	local gableSign = span(s, "GableSign", G.X0 - 0.75, G.X0 - 0.45, WALL_TOP + 1.3, WALL_TOP + 4.5, 342, 354, team.Secondary)
	sign(gableSign, Enum.NormalId.Left, name ~= "" and (name .. "\nGOLF CARTS") or "GOLF CART\nGARAGE", team.Secondary, team, 0.05, 0.08)
	for _, pad in ipairs(pads) do
		ceilingLight(s, 151, pad.Z, 7, 1.6, 24)
	end
	ceilingLight(s, 181.5, 340, 8, 2, 26)
	ceilingLight(s, 181.5, 357, 8, 2, 26)

	-- cart rules poster on the back wall of bay 1
	local poster = span(s, "CartRulesPoster", PART_X - 0.15, PART_X, 3.4, 8.2, pads[1].Z - 3, pads[1].Z + 3, WHITE)
	local posterGui = canvas(poster, Enum.NormalId.Left, 30)
	words(posterGui, "PosterTitle", 0.06, 0.04, 0.88, 0.18, "CART RULES", team.Primary)
	words(
		posterGui,
		"PosterRules",
		0.08,
		0.26,
		0.84,
		0.68,
		"1. STAY ON THE ROADS\n2. HONK AT FRIENDS\n3. NO RACING THE TEAM BUS\n4. HAVE FUN!",
		INK,
		Enum.Font.GothamBold
	)
	BuildUtil.Look(
		poster,
		"Cart Rules",
		"Stay on the roads, honk at your friends and never race the team bus. Leave a cart anywhere and it drives itself back to its bay!",
		{ At = Vector3.new(-1.2, -1, 0), Distance = 8 }
	)

	-- the two doors: a double door into the workshop (swings into it, toward +X) and the side
	-- door from the back road (swings in, toward -Z)
	local doorH = DOOR_TOP - FLOOR_TOP
	BuildUtil.Door(s, {
		Name = "WorkshopDoor",
		Size = Vector3.new(WORK_DOOR.Z1 - WORK_DOOR.Z0, doorH, 0.3),
		CFrame = CFrame.new(PART_X + 0.5, FLOOR_TOP + doorH / 2, (WORK_DOOR.Z0 + WORK_DOOR.Z1) / 2) * CFrame.Angles(0, -math.pi / 2, 0),
		Double = true,
		Window = true,
		Color = team.Primary,
		Material = Enum.Material.SmoothPlastic,
		Object = "Workshop",
		Title = "Cart Workshop",
		Info = "The pit crew's workshop: tools, spare parts, a cart up on the lift and a cold soda machine.",
		Distance = 8,
	})
	BuildUtil.Door(s, {
		Name = "SideDoor",
		Size = Vector3.new(SIDE_DOOR.X1 - SIDE_DOOR.X0, doorH, 0.3),
		CFrame = CFrame.new((SIDE_DOOR.X0 + SIDE_DOOR.X1) / 2, FLOOR_TOP + doorH / 2, G.Z1 - 0.5),
		Double = true,
		Window = true,
		Color = team.Primary,
		Material = Enum.Material.SmoothPlastic,
		Object = "Side Door",
		Title = "Cart Workshop",
		Info = "The back door of the golf cart garage, right by the back road.",
		Distance = 8,
	})
end

-- A static golf cart up on a scissor lift, nose toward -X (the one the pit crew is fixing).
local function cartOnLift(ctx, team)
	local lift = BuildUtil.Child(ctx, "CartLift")
	local cx, cz = LIFT.X, LIFT.Z
	span(lift, "LiftBase", cx - 5, cx + 5, FLOOR_TOP, 0.5, cz - 2.6, cz + 2.6, BAY_YELLOW, Enum.Material.DiamondPlate)
	span(lift, "LiftScissor", cx - 2.4, cx + 2.4, 0.5, 3, cz - 1.4, cz + 1.4, DARK_METAL, Enum.Material.Metal, { Transparency = 0.25 })
	local y = 3 -- underside of the cart
	local chassis = span(lift, "LiftCartChassis", cx - 4.5, cx + 4.5, y, y + 1, cz - 2.5, cz + 2.5, team.Primary)
	for _, dx in ipairs({ -3.2, 3.2 }) do
		for _, side in ipairs({ -1, 1 }) do
			cylinder(lift, "LiftCartWheel", "Z", Vector3.new(cx + dx, y + 0.1, cz + side * 2.35), 0.8, 2.1, TIRE, Enum.Material.Rubber)
		end
	end
	span(lift, "LiftCartHood", cx - 4.5, cx - 2.3, y + 1, y + 2.3, cz - 2.4, cz + 2.4, CART_WHITE)
	span(lift, "LiftCartSeat", cx - 0.4, cx + 1.8, y + 1, y + 2.2, cz - 2.3, cz + 2.3, DARK_METAL, Enum.Material.Fabric)
	span(lift, "LiftCartDeck", cx + 1.8, cx + 4.5, y + 1, y + 2, cz - 2.4, cz + 2.4, CART_WHITE)
	span(lift, "LiftCartBag", cx + 3, cx + 4.3, y + 2, y + 4.6, cz - 2.2, cz - 0.9, team.Secondary, Enum.Material.Fabric)
	span(
		lift,
		"LiftCartWindshield",
		cx - 2.3,
		cx - 2.1,
		y + 2.3,
		y + 5.4,
		cz - 2.3,
		cz + 2.3,
		CART_GLASS,
		Enum.Material.Glass,
		{ Transparency = 0.5 }
	)
	for _, dz in ipairs({ -2.2, 2.2 }) do
		span(lift, "LiftCartPost", cx + 1.9, cx + 2.2, y + 2, y + 5.4, cz + dz - 0.15, cz + dz + 0.15, STEEL, Enum.Material.Metal)
	end
	span(lift, "LiftCartRoof", cx - 2.6, cx + 2.6, y + 5.4, y + 5.7, cz - 2.6, cz + 2.6, team.Primary)
	BuildUtil.Look(
		chassis,
		"Cart Lift",
		"Up it goes! The pit crew lifts carts here to swap tires, check the brakes and fix this one's very squeaky horn.",
		{ Distance = 8 }
	)
end

-- Mechanic's bench, tool chest, parts shelf, vending machine and the lounge (bench + live TV).
local function workshop(ctx, team)
	local w = BuildUtil.Child(ctx, "Workshop")
	local wallX = G.X1 - 1 -- inner face of the east wall

	-- mechanic's bench along the east wall, pegboard above it
	local z0, z1 = 333, 345
	span(w, "BenchCabinet", wallX - 2.7, wallX, FLOOR_TOP, 3, z0 + 0.3, z1 - 0.3, TOOL_RED, Enum.Material.Metal)
	local benchTop = span(w, "MechanicBench", wallX - 3, wallX, 3, 3.4, z0, z1, WOOD, Enum.Material.WoodPlanks)
	local pegboard = span(w, "Pegboard", wallX - 0.2, wallX, 4.6, 9.4, z0, z1, PEGBOARD, Enum.Material.Wood)
	local tools = canvas(pegboard, Enum.NormalId.Left, 10)
	for k = 0, 5 do
		local tx = 0.06 + k * 0.155
		blob(tools, "ToolShadow", tx, 0.15, 0.06, 0.55, DARK_METAL) -- wrenches / screwdrivers
		blob(tools, "ToolHead", tx - 0.015, 0.1, 0.09, 0.1, k % 2 == 0 and TOOL_RED or DARK_METAL, true)
	end
	words(tools, "PegboardTitle", 0.2, 0.78, 0.6, 0.18, "PIT CREW", team.Primary)
	span(w, "BenchVise", wallX - 2.8, wallX - 1.8, 3.4, 4.3, z0 + 1.2, z0 + 2.4, DARK_METAL, Enum.Material.Metal)
	local battery = span(w, "CartBattery", wallX - 2.4, wallX - 0.8, 3.4, 4.6, z1 - 4.4, z1 - 2.4, INK)
	local terminals = canvas(battery, Enum.NormalId.Top, 20)
	blob(terminals, "Plus", 0.2, 0.2, 0.2, 0.2, TOOL_RED, true)
	blob(terminals, "Minus", 0.6, 0.2, 0.2, 0.2, DARK_METAL, true)
	BuildUtil.Look(
		benchTop,
		"Mechanic's Bench",
		"Where the pit crew keeps your carts purring: fresh batteries, new tires, and a lot of oily rags.",
		{ At = Vector3.new(-1.4, 0.8, 0), Distance = 8 }
	)

	-- rolling tool chest against the south wall (under the windows)
	local chest = span(w, "ToolChest", 174, 178.6, FLOOR_TOP, 4.3, G.Z0 + 1.1, G.Z0 + 3.6, TOOL_RED, Enum.Material.Metal)
	local drawers = canvas(chest, Enum.NormalId.Back, 10)
	for k = 0, 5 do
		blob(drawers, "Drawer", 0.06, 0.06 + k * 0.15, 0.88, 0.02, DARK_METAL)
		blob(drawers, "Handle", 0.4, 0.11 + k * 0.15, 0.2, 0.025, STEEL)
	end
	BuildUtil.Look(
		chest,
		"Tool Chest",
		"Seven drawers of wrenches, sockets and screwdrivers - and one lucky golf ball nobody is allowed to touch.",
		{ At = Vector3.new(0, 0, 1.6), Distance = 8 }
	)

	-- parts shelf against the north wall, west of the side door
	local shelf = span(w, "PartsShelf", PART_X + 1.6, SIDE_DOOR.X0 - 0.8, FLOOR_TOP, 7, G.Z1 - 2.4, G.Z1 - 1, STEEL, Enum.Material.Metal)
	local boxes = canvas(shelf, Enum.NormalId.Front, 10)
	for row = 0, 2 do
		blob(boxes, "Shelf", 0, 0.3 + row * 0.32, 1, 0.03, DARK_METAL)
		for col = 0, 2 do
			blob(
				boxes,
				"PartsBox",
				0.08 + col * 0.3,
				0.1 + row * 0.32,
				0.22,
				0.19,
				col == 1 and team.Primary or Color3.fromRGB(170, 130, 80)
			)
		end
	end

	-- soda vending machine on the east wall (glowing front)
	local vz0, vz1 = 348, 351.6
	span(w, "VendingMachine", wallX - 2.6, wallX, FLOOR_TOP, 7.2, vz0, vz1, team.Primary, Enum.Material.Metal)
	local front =
		span(w, "VendingFront", wallX - 2.7, wallX - 2.6, 2.4, 6.8, vz0 + 0.3, vz1 - 1, Color3.fromRGB(220, 240, 255), Enum.Material.Neon)
	local rows = canvas(front, Enum.NormalId.Left, 20)
	for row = 0, 3 do
		for col = 0, 2 do
			local colors = { TOOL_RED, Color3.fromRGB(60, 160, 230), Color3.fromRGB(255, 170, 40) }
			blob(rows, "Can", 0.12 + col * 0.28, 0.08 + row * 0.23, 0.18, 0.15, colors[col + 1])
		end
	end
	BuildUtil.Use(w, front, "soda", {
		Object = "Vending Machine",
		Title = "Ice-Cold Soda",
		Info = "The pit crew's favourite machine. It only takes good vibes - your soda is free!",
		Distance = 8,
	})

	-- lounge: a bench facing a live TV on the east wall; sitting switches to the stadium camera
	local tv = span(w, "LoungeTV", wallX - 0.4, wallX, 4.4, 8.6, LOUNGE_Z - 3.5, LOUNGE_Z + 3.5, SCREEN_BLACK)
	liveScreen(tv, Enum.NormalId.Left, "summary", "HOME\n0 - 0\nRECORD 0-0\nSEASON 1", LED_TEXT, 20)
	local benchX = wallX - 6.4
	span(
		w,
		"LoungeBenchBack",
		benchX - 1.1,
		benchX - 0.7,
		FLOOR_TOP,
		3.8,
		LOUNGE_Z - 2.25,
		LOUNGE_Z + 2.25,
		team.Primary,
		Enum.Material.Fabric
	)
	BuildUtil.Seat(w, {
		Name = "LoungeBench",
		Size = Vector3.new(4.5, 1.6, 1.4),
		CFrame = CFrame.new(benchX, FLOOR_TOP + 0.8, LOUNGE_Z) * CFrame.Angles(0, -math.pi / 2, 0), -- faces the TV (+X)
		Color = team.Primary,
		Material = Enum.Material.Fabric,
		Object = "Lounge Bench - Stadium TV",
		Camera = { From = STADIUM_CAM.From, To = STADIUM_CAM.To, Fov = 55, Label = "GARAGE TV - CORNER CAM" },
	})
end

---------------------------------------------------------------------------------------------
-- Steps 2 - 4: one bay per cart
---------------------------------------------------------------------------------------------

local BAY_TOOL_INFO = {
	"Every tool has its outline painted on the board, so the pit crew always knows what's missing.",
	"Tire gauge, wrenches and a spare steering wheel. Cart #2's crew is the tidiest in the garage!",
	"The charging-cable tester and the shiny wrench set. Cart #3 is the owner's favourite.",
}

--[[
	Bay `index` (1-3) for the cart on `pad`: a bay sign on a post just behind the cart (look), a
	tool board on the bay's south side and a tire rack on its north side.
]]
local function bayDetails(ctx, index, pad, pads, team)
	local bay = BuildUtil.Child(ctx, "Bay" .. index)
	-- the bay's side faces: the south wall / a divider on the south, a divider / the north wall on
	-- the north
	local southFace = index == 1 and (G.Z0 + 1) or (pad.Z - 5.5)
	local northFace = index == #pads and (G.Z1 - 1) or (pad.Z + 5.5)

	-- bay sign (faces the entrance): the number and "GOLF CART"
	local sz = pad.Z - 4.2
	cylinder(bay, "BaySignPost", "Y", Vector3.new(SIGN_X + 0.3, FLOOR_TOP + 2.5, sz), 5, 0.35, STEEL, Enum.Material.Metal)
	local board = span(bay, "BaySign", SIGN_X, SIGN_X + 0.2, 4.6, 7.4, sz - 1.5, sz + 1.5, team.Primary)
	local boardGui = canvas(board, Enum.NormalId.Left, 30)
	local text = readableOn(team.Primary, { team.Trim, team.Secondary })
	words(boardGui, "Number", 0.1, 0.04, 0.8, 0.62, tostring(index), text)
	words(boardGui, "Caption", 0.06, 0.68, 0.88, 0.26, "GOLF CART", text)
	BuildUtil.Look(
		board,
		"Golf Cart #" .. index,
		"Sit in the driver's seat and drive with WASD (or the thumbstick on a phone). Leave the cart anywhere - it drives itself back to bay "
			.. index
			.. "!",
		{ At = Vector3.new(-0.6, -1.2, 0), Distance = 9 }
	)

	-- tool board on the south side: tool outlines, a few tools and the bay name
	local toolBoard = span(bay, "ToolBoard", 159, 168, 3, 7.4, southFace, southFace + 0.2, PEGBOARD, Enum.Material.Wood)
	local toolsGui = canvas(toolBoard, Enum.NormalId.Back, 12) -- faces +Z, into the bay
	words(toolsGui, "BayTitle", 0.05, 0.03, 0.4, 0.18, "BAY " .. index, team.Primary)
	for k = 0, 6 do
		local tx = 0.08 + k * 0.125
		blob(toolsGui, "ToolOutline", tx, 0.3, 0.05, 0.5, DARK_METAL)
		blob(toolsGui, "ToolHead", tx - 0.02, 0.26, 0.09, 0.12, k % 3 == 0 and TOOL_RED or STEEL, true)
	end
	BuildUtil.Look(
		toolBoard,
		"Bay " .. index .. " Tool Board",
		BAY_TOOL_INFO[index] or BAY_TOOL_INFO[1],
		{ At = Vector3.new(0, -0.8, 0.8), Distance = 8 }
	)

	-- tire rack on the north side: a wall shelf with two tires, three more standing on the floor
	-- (tires centred 1.3 off the wall, so they stand clear of it)
	local rackZ0, tireZ = northFace - 2.6, northFace - 1.3
	span(bay, "TireShelf", 160, 167.4, 3.3, 3.6, rackZ0, northFace, STEEL, Enum.Material.Metal)
	for k = 0, 2 do
		cylinder(bay, "Tire", "X", Vector3.new(161.2 + k * 2.2, FLOOR_TOP + 1.25, tireZ), 1, 2.5, TIRE, Enum.Material.Rubber)
	end
	for k = 0, 1 do
		cylinder(bay, "Tire", "X", Vector3.new(162.6 + k * 2.6, 3.6 + 1.2, tireZ), 1, 2.4, TIRE, Enum.Material.Rubber)
	end
end

---------------------------------------------------------------------------------------------
-- Step 4: charging station
---------------------------------------------------------------------------------------------

local function chargingStation(ctx, pads, team)
	local station = BuildUtil.Child(ctx, "ChargingStation")
	local last = pads[#pads]
	local cz = last.Z

	-- the cabinet on the back wall of the last bay
	local cabinet = span(
		station,
		"ChargerCabinet",
		PART_X - 2,
		PART_X,
		FLOOR_TOP,
		7,
		cz - 3,
		cz + 3,
		Color3.fromRGB(236, 238, 242),
		Enum.Material.Metal
	)
	local face = canvas(cabinet, Enum.NormalId.Left, 20)
	blob(face, "ChargerStripe", 0, 0.08, 1, 0.08, team.Primary)
	words(face, "ChargerTitle", 0.08, 0.2, 0.84, 0.16, "CHARGING", INK)
	for k = 0, #pads - 1 do
		blob(face, "ChargeLED", 0.2 + k * 0.22, 0.45, 0.14, 0.08, CHARGE_GREEN, true)
	end
	-- a lightning bolt: two slanted bars
	local bolt1 = blob(face, "Bolt", 0.42, 0.6, 0.1, 0.18, BAY_YELLOW)
	bolt1.Rotation = 20
	local bolt2 = blob(face, "Bolt", 0.48, 0.74, 0.1, 0.18, BAY_YELLOW)
	bolt2.Rotation = 20
	BuildUtil.Look(
		cabinet,
		"Charging Station",
		"Plug in and power up! Every cart charges here between rides, so it's always ready to zoom around the campus.",
		{ At = Vector3.new(-1.4, -0.4, 0), Distance = 8 }
	)

	-- the reserved-for-the-owner sign above it (live: shows the owner's name)
	local plate = span(station, "OwnerSign", PART_X - 0.2, PART_X, 8.2, 10.4, cz - 3.6, cz + 3.6, SCREEN_BLACK)
	liveScreen(plate, Enum.NormalId.Left, "owner", "OWNER", BAY_YELLOW, 24)

	-- conduit up the wall, a feed across the bay and the cable tray over the backs of the carts,
	-- with a charging cable dropping to every cart (cables don't collide)
	local trayY = 10.6
	pipe(
		station,
		"Conduit",
		Vector3.new(PART_X - 1, 7, cz + 2.2),
		Vector3.new(PART_X - 1, trayY, cz + 2.2),
		0.4,
		DARK_METAL,
		Enum.Material.Metal,
		PAINT
	)
	span(
		station,
		"CableFeed",
		TRAY_X - 0.4,
		PART_X - 0.6,
		trayY - 0.2,
		trayY + 0.2,
		cz + 1.8,
		cz + 2.6,
		DARK_METAL,
		Enum.Material.Metal,
		PAINT
	)
	span(
		station,
		"CableTray",
		TRAY_X - 0.4,
		TRAY_X + 0.4,
		trayY - 0.2,
		trayY + 0.2,
		pads[1].Z - 1,
		cz + 2.6,
		DARK_METAL,
		Enum.Material.Metal,
		PAINT
	)
	-- hanger rods from the ceiling carry the tray (the feed holds its bay-3 end)
	for index = 1, #pads - 1 do
		local hz = pads[index].Z + 6 -- over the bay dividers
		span(
			station,
			"TrayHanger",
			TRAY_X - 0.1,
			TRAY_X + 0.1,
			trayY + 0.2,
			WALL_TOP,
			hz - 0.1,
			hz + 0.1,
			STEEL,
			Enum.Material.Metal,
			PAINT
		)
	end
	for _, pad in ipairs(pads) do
		local plug = Vector3.new(CART_REAR_X + 0.8, 2.6, pad.Z + 1.2)
		pipe(station, "ChargingCable", Vector3.new(TRAY_X, trayY - 0.2, pad.Z + 1.2), plug, 0.25, CABLE, Enum.Material.Rubber, PAINT)
		span(
			station,
			"CablePlug",
			plug.X - 0.4,
			plug.X + 0.3,
			plug.Y - 0.5,
			plug.Y + 0.3,
			plug.Z - 0.3,
			plug.Z + 0.3,
			team.Primary,
			Enum.Material.SmoothPlastic,
			PAINT
		)
	end
end

---------------------------------------------------------------------------------------------
-- golf_carts
---------------------------------------------------------------------------------------------

function Garage.golf_carts(ctx)
	local team = ctx.colors
	local name = teamName(ctx, "")
	local pads = cartPads(ctx)

	BuildUtil.Stage(ctx, 1)
	local building = BuildUtil.Child(ctx, "Garage")
	garageFloor(building, pads, team)
	shell(building, pads, team, name)
	cartOnLift(building, team)
	workshop(building, team)

	for index = 1, 3 do
		BuildUtil.Stage(ctx, index + 1) -- steps 2, 3, 4: one bay each (the server adds the carts)
		bayDetails(ctx, index, pads[index], pads, team)
	end

	BuildUtil.Stage(ctx, 4)
	chargingStation(ctx, pads, team)
end

return Garage
