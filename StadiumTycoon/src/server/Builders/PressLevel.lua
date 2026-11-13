--[[
	PressLevel
	The stadium's press level: three walk-in buildings high above the ground, reached by elevators.
	Every room has a floor, walls, a ceiling (parts named "...Ceiling...") and ceiling lights.

	  pressbox         behind / above the home (back) upper deck, X[-44, 44] Z[144.6, 170].
	                   Two elevator cores stand at the back corners (|x| 24..44, z 156..170). Their
	                   ground lobbies face the campus road (+Z); the cars ride up to the lobbies on
	                   the press level (floor 1, y 26). Floor 2 (y 36.4) is the coaches' booth: the
	                   EAST elevator also stops there.
	                     1 Columns & Floor     columns, girders, floor slab with parapets, both cores:
	                                           ground lobbies (sliding glass doors, elevator doors,
	                                           call buttons, directory) + the upstairs lobbies
	                     2 Lower Level         the press room: sliding glass doors from the lobbies,
	                                           the press row at the window (6 PRESS BOX CAM seats,
	                                           live monitors, nameplates), a second row on a riser,
	                                           big live summary screen, live stat board, press
	                                           credentials board, stat sheets, coffee + soda bar,
	                                           stat copier, sports-drink cooler
	                     3 Upper Level         coaches' booth: elevator stop, headset desk with 5
	                                           camera seats, headsets, spotter binoculars, game-day
	                                           screen, live depth chart, play sheet, couch
	                     4 Roof & TV Cameras   roof + fascia, PRESS BOX sign, two TV camera platforms,
	                                           antennas, air handler
	  suites           behind / above the front (visitor) upper deck, X[-120, 120] Z[-104, -83.5],
	                   floor y 28. A corridor (z -103.4..-96.4) runs behind eight suites; the one
	                   elevator rides from a ground lobby on the plaza (X[19.5, 36]) to an alcove off
	                   the corridor. The middle (|x| < 16) is left for the broadcast booth: until it
	                   is built its floor is an open terrace above the top row of the upper deck.
	                     1 Columns & Floor     columns, beam, slab, corridor (plaza windows, lights,
	                                           door openings), both elevator lobbies
	                     2 Glass Fronts        glass fronts, suite walls + ceilings, a door per suite
	                     3 Suite Interiors     two seats at the glass (one SUITE CAM seat), sofa, live
	                       & Signs             score TV, mini-bar (soda / popcorn), number signs,
	                                           lights; the owner's suite gets an owner's chair too
	  broadcast_booth  between the two suite wings, X[-16.7, 16.7] Z[-96, -71.6]: a double door from
	                   the suite corridor; the control room sits behind the stadium wall, the studio
	                   hangs over the top rows of the upper deck.
	                     1 Booth               floor, walls, ceiling, the door, lights, support girder
	                     2 Glass & Cameras     glass front, commentators' desk with 3 TV BROADCAST
	                                           camera seats, live monitors, two TV cameras on tripods,
	                                           ON AIR light, producer's desk + monitor walls
	                     3 Satellite Dish      satellite dish, uplink box and antenna on the roof
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)

local PressLevel = {}

local PAINT = { CanCollide = false, CastShadow = false }
local NO_COLLIDE = { CanCollide = false }

local WHITE = Color3.fromRGB(248, 248, 248)
local INK = Color3.fromRGB(22, 22, 26)
local STEEL = Color3.fromRGB(78, 84, 94)
local DARK_METAL = Color3.fromRGB(62, 64, 70)
local BRUSHED = Color3.fromRGB(184, 188, 196)
local SCREEN = Color3.fromRGB(12, 14, 20)
local SCREEN_TEXT = Color3.fromRGB(255, 230, 140)
local SCREEN_WHITE = Color3.fromRGB(235, 242, 255)
local LAMP = Color3.fromRGB(255, 248, 232)
local WARM_LIGHT = Color3.fromRGB(255, 238, 205)
local CEILING = Color3.fromRGB(232, 232, 228)
local CARPET = Color3.fromRGB(54, 56, 66)
local TILE = Color3.fromRGB(214, 210, 200)
local WOOD = Color3.fromRGB(150, 105, 60)
local DARK_WOOD = Color3.fromRGB(92, 62, 40)
local LEATHER = Color3.fromRGB(34, 34, 38)
local CREAM = Color3.fromRGB(236, 230, 214)
local GLASS = Color3.fromRGB(160, 210, 240)
local ON_AIR_RED = Color3.fromRGB(230, 36, 36)
local CAMERA_BLACK = Color3.fromRGB(28, 28, 32)
local CORE_WALL = Color3.fromRGB(128, 128, 134)
local PAPER = Color3.fromRGB(250, 250, 244)
local COOLER_ORANGE = Color3.fromRGB(255, 120, 20)
local GOLD = Color3.fromRGB(255, 190, 40)
local POPCORN_RED = Color3.fromRGB(200, 30, 36)
local WALL_LIGHT = Color3.fromRGB(226, 222, 214)

-- Facing of seats: the sitter looks this way. S = -Z (toward the plaza / the press box window),
-- N = +Z, E = +X, W = -X.
local FACING = { S = 0, N = math.pi, E = -math.pi / 2, W = math.pi / 2 }

local FIELD_CENTRE = Vector3.new(0, 0, 30)

---------------------------------------------------------------------------------------------
-- Colour + text helpers
---------------------------------------------------------------------------------------------

local function luminance(color)
	local function channel(v)
		if v <= 0.03928 then
			return v / 12.92
		end
		return ((v + 0.055) / 1.055) ^ 2.4
	end
	return 0.2126 * channel(color.R) + 0.7152 * channel(color.G) + 0.0722 * channel(color.B)
end

local function contrastRatio(a, b)
	local la, lb = luminance(a), luminance(b)
	if la < lb then
		la, lb = lb, la
	end
	return (la + 0.05) / (lb + 0.05)
end

-- First team colour that reads well on `background`, else whichever of white / ink reads best.
local function textOn(background, team)
	for _, candidate in ipairs({ team.Trim, team.Secondary, team.Primary }) do
		if contrastRatio(background, candidate) >= 3 then
			return candidate
		end
	end
	if contrastRatio(background, WHITE) >= contrastRatio(background, INK) then
		return WHITE
	end
	return INK
end

local function teamLabel(ctx)
	local name = ctx.teamName
	if type(name) ~= "string" or name == "" then
		return "HOME TEAM"
	end
	return name
end

--[[
	Text on one face of `part`. opts: TextColor3, Font, PixelsPerStud, LightInfluence,
	BackgroundColor3 + BackgroundTransparency (a filled plate), LabelName, Wrap and the label's
	rectangle as fractions of the face: InsetX / InsetY (centred) or Left / Top / Width / Height.
]]
local function sign(part, face, text, background, team, opts)
	opts = opts or {}
	local _, label = BuildUtil.SurfaceText(part, face, text, {
		LabelName = opts.LabelName or (part.Name .. face.Name),
		TextColor3 = opts.TextColor3 or textOn(background, team),
		Font = opts.Font or Enum.Font.GothamBlack,
		PixelsPerStud = opts.PixelsPerStud or 20,
		LightInfluence = opts.LightInfluence,
		BackgroundColor3 = opts.BackgroundColor3,
		BackgroundTransparency = opts.BackgroundTransparency,
	})
	local insetX, insetY = opts.InsetX or 0.06, opts.InsetY or 0.14
	label.Size = UDim2.new(opts.Width or (1 - 2 * insetX), 0, opts.Height or (1 - 2 * insetY), 0)
	label.Position = UDim2.new(opts.Left or insetX, 0, opts.Top or insetY, 0)
	if opts.Wrap then
		label.TextWrapped = true
	end
	return label
end

-- A live screen (Interact.LiveKinds) filling a face: dark background, bright text, unlit.
local function screen(part, face, live, text, opts)
	opts = opts or {}
	local _, label = BuildUtil.LiveText(part, face, live, {
		LabelName = opts.LabelName or ("Live" .. live),
		Text = text,
		TextColor3 = opts.TextColor3 or SCREEN_TEXT,
		BackgroundColor3 = opts.BackgroundColor3 or SCREEN,
		BackgroundTransparency = 0,
		LightInfluence = 0,
		Font = opts.Font or Enum.Font.GothamBold,
		PixelsPerStud = opts.PixelsPerStud or 30,
	})
	if opts.Top or opts.Height then
		label.Size = UDim2.new(1, 0, opts.Height or 1, 0)
		label.Position = UDim2.new(0, 0, opts.Top or 0, 0)
	end
	label.TextWrapped = true
	return label
end

---------------------------------------------------------------------------------------------
-- Part helpers
---------------------------------------------------------------------------------------------

-- Axis-aligned box between two corners.
local function box(ctx, name, x0, y0, z0, x1, y1, z1, color, material, extra)
	local minX, maxX = math.min(x0, x1), math.max(x0, x1)
	local minY, maxY = math.min(y0, y1), math.max(y0, y1)
	local minZ, maxZ = math.min(z0, z1), math.max(z0, z1)
	return BuildUtil.Box(
		ctx,
		name,
		Vector3.new(maxX - minX, maxY - minY, maxZ - minZ),
		Vector3.new((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2),
		color,
		material or Enum.Material.SmoothPlastic,
		extra
	)
end

local function cyl(ctx, name, position, length, diameter, axis, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Position = position
	props.Height = length
	props.Diameter = diameter
	props.Axis = axis
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Cylinder(ctx, props)
end

-- A neon light panel hanging under a ceiling (its top at y) with a PointLight.
local function ceilingLight(ctx, x, z, w, d, y, range, brightness)
	local panel = box(ctx, "CeilingLight", x - w / 2, y - 0.2, z - d / 2, x + w / 2, y, z + d / 2, LAMP, Enum.Material.Neon, PAINT)
	BuildUtil.Light(panel, "PointLight", {
		Name = "RoomLight",
		Range = range or 24,
		Brightness = brightness or 1.5,
		Color = WARM_LIGHT,
	})
	return panel
end

--[[
	A chair players can sit on: a padded seat block (BuildUtil.Seat) and a back. The sitter faces
	`facing` (see FACING). opts: Width, Depth, SeatHeight, BackHeight, BackColor, Material, Name,
	Object, NoPrompt, Camera
]]
local function chair(ctx, x, floorY, z, facing, color, opts)
	opts = opts or {}
	local w, d = opts.Width or 2, opts.Depth or 2
	local seatH, backH = opts.SeatHeight or 1.7, opts.BackHeight or 2.3
	local frame = CFrame.new(x, floorY, z) * CFrame.Angles(0, FACING[facing], 0)
	local material = opts.Material or Enum.Material.Fabric
	local seat = BuildUtil.Seat(ctx, {
		Name = opts.Name or "ChairSeat",
		Size = Vector3.new(w, seatH, d),
		CFrame = frame * CFrame.new(0, seatH / 2, 0),
		Color = color,
		Material = material,
		Object = opts.Object,
		NoPrompt = opts.NoPrompt,
		Camera = opts.Camera,
	})
	BuildUtil.Part(ctx, {
		Name = "ChairBack",
		Size = Vector3.new(w, backH, 0.4),
		CFrame = frame * CFrame.new(0, seatH + backH / 2, d / 2 - 0.2),
		Color = opts.BackColor or color,
		Material = material,
	})
	return seat
end

-- Elevator call panel on a wall face: a small metal box with a lit label and the elevator prompt.
local function callPanel(ctx, x0, y0, z0, x1, y1, z1, face, text, target, opts)
	local panel = box(ctx, "CallPanel", x0, y0, z0, x1, y1, z1, DARK_METAL, Enum.Material.Metal)
	sign(panel, face, text, SCREEN, nil, {
		TextColor3 = SCREEN_TEXT,
		BackgroundColor3 = SCREEN,
		BackgroundTransparency = 0,
		LightInfluence = 0,
		Font = Enum.Font.GothamBold,
		InsetX = 0.12,
		InsetY = 0.22,
		Wrap = true,
	})
	BuildUtil.Elevator(ctx, panel, target, opts)
	return panel
end

-- Writes text on the corridor-facing side of every leaf of a door model (leaf index -> text).
local function doorText(model, face, texts, team, color)
	for _, part in ipairs(model:GetChildren()) do
		if part.Name == "DoorLeaf" then
			local text = texts[part:GetAttribute("Leaf")]
			if text then
				sign(part, face, text, color, team, { InsetX = 0.12, Top = 0.12, Height = 0.16, LabelName = "DoorSign" })
			end
		end
	end
end

-- A TV camera (body + lens on a tripod post) whose lens points along +Z (dir = 1) or -Z (-1) or
-- along X (axis "X"). Returns the body (for the look prompt).
local function tvCamera(ctx, x, baseY, z, axis, dir, postHeight)
	local top = baseY + postHeight
	cyl(ctx, "TripodPost", Vector3.new(x, baseY + postHeight / 2, z), postHeight, 0.4, "Y", DARK_METAL, Enum.Material.Metal)
	local body
	if axis == "Z" then
		body = box(ctx, "CameraBody", x - 0.9, top, z - 1.3, x + 0.9, top + 1.6, z + 1.3, CAMERA_BLACK)
		cyl(ctx, "CameraLens", Vector3.new(x, top + 0.8, z + dir * 1.8), 1, 1.1, "Z", DARK_METAL, Enum.Material.Metal)
	else
		body = box(ctx, "CameraBody", x - 1.3, top, z - 0.9, x + 1.3, top + 1.6, z + 0.9, CAMERA_BLACK)
		cyl(ctx, "CameraLens", Vector3.new(x + dir * 1.8, top + 0.8, z), 1, 1.1, "X", DARK_METAL, Enum.Material.Metal)
	end
	return body
end

---------------------------------------------------------------------------------------------
-- Press box
---------------------------------------------------------------------------------------------

local PRESS_NAMES = {
	"CITY HERALD",
	"GRIDIRON DAILY",
	"KICKOFF RADIO",
	"SPORTS WIRE",
	"MORNING POST",
	"TOUCHDOWN TIMES",
	"PIGSKIN GAZETTE",
	"BLITZ TV",
	"STADIUM NEWS",
	"FOURTH DOWN PODCAST",
}

function PressLevel.pressbox(ctx)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local team = ctx.colors
	local name = teamLabel(ctx)

	-- Levels (plot-local studs)
	local F1 = L.UpperTopHeight -- 26: the press room floor, level with the top row of seats
	local SLAB1 = F1 - 1.4
	local C1, T1 = F1 + 9, F1 + 9.4 -- press room ceiling (underside, top)
	local F2 = T1 + 1 -- 36.4: coaches' booth floor
	local C2, T2 = F2 + 8, F2 + 8.4 -- coaches' booth ceiling
	local GIRDER = SLAB1 - 3 -- 21.6: bottom of the girders (far above the back walk)
	-- Outline: window wall z 144.6..145.3, back wall z 169.3..170, side walls |x| 43.3..44
	local XO, XI = 44, 43.3
	local ZO = L.BackUpperOuterZ + 1.6 -- 144.6
	local ZI = ZO + 0.7 -- 145.3
	local ZB, ZBO = 169.3, 170
	-- Elevator cores: |x| 24..44, z 156..170. The car is |x| 40.3..43.3, z 163.3..169.3; its
	-- sliding door pockets into the jamb block |x| 40.3..43.3, z 156.7..163.3.
	local CORE_X, CORE_Z = 24, 156
	local DOOR_A, DOOR_B = 28, 35 -- |x| of the glass doors (entrance, press room)
	local CAB_X, CAB_Z = 40.3, 163.3
	local ELEV_Z = (CAB_Z + ZB) / 2
	local ARRIVE_X = 36.5
	local G_FLOOR = 0.3

	local inwardOf = function(s)
		return s > 0 and Enum.NormalId.Left or Enum.NormalId.Right
	end
	local outwardOf = function(s)
		return s > 0 and Enum.NormalId.Right or Enum.NormalId.Left
	end
	-- where the elevator drops you: in front of the car door, facing into the lobby
	local function arrive(s, y)
		local p = Vector3.new(s * ARRIVE_X, y, ELEV_Z)
		return CFrame.lookAt(p, p - Vector3.new(s, 0, 0))
	end
	-- single sliding car door that pockets toward -Z into the jamb block
	local function carDoor(c, s, floorY, info)
		return BuildUtil.Door(c, {
			Name = "ElevatorDoor",
			Size = Vector3.new(ZB - CAB_Z, 8, 0.3),
			CFrame = CFrame.new(s * (CAB_X + 0.3), floorY + 4, ELEV_Z) * CFrame.Angles(0, -math.pi / 2, 0),
			Slide = true,
			Color = BRUSHED,
			Material = Enum.Material.Metal,
			Object = "Elevator",
			Title = "Elevator",
			Info = info,
			AutoClose = 5,
			Distance = 8,
		})
	end

	-------------------------------------------------------------------------------------------
	-- Step 1: columns, girders, floor slab and the two elevator cores
	-------------------------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 1)
	local frame = BuildUtil.Child(ctx, "Structure")
	-- the window parapet doubles as the front girder; it rests on two columns and the side girders
	for _, x in ipairs({ -18, 18 }) do
		cyl(frame, "Column", Vector3.new(x, SLAB1 / 2, ZI + 1.2), SLAB1, 2.4, "Y", C.Concrete, Enum.Material.Concrete)
	end
	box(frame, "Level1Slab", -XI, SLAB1, ZI, XI, F1, ZB, C.ConcreteDark, Enum.Material.Concrete)
	-- parapets round the open slab; later the window sill, the side wall bases and the back wall
	local parapet = box(frame, "WindowParapet", -XI, GIRDER, ZO, XI, F1 + 1, ZI, team.Primary)
	sign(parapet, Enum.NormalId.Front, name, team.Primary, team, {
		Left = 0.3,
		Width = 0.4,
		Top = 0.08,
		Height = 0.5,
		PixelsPerStud = 10,
	})
	for _, s in ipairs({ -1, 1 }) do
		box(frame, "SideParapet", s * XI, GIRDER, ZO, s * XO, F1 + 1.2, CORE_Z, team.Primary)
	end
	local backGirder = box(frame, "BackParapet", -CORE_X, GIRDER, ZB, CORE_X, F1 + 1.2, ZBO, team.Primary)
	-- facing the campus: the back walk passes underneath on its way into the home tunnel
	sign(backGirder, Enum.NormalId.Back, "TO THE FIELD", team.Primary, team, { Left = 0.3, Width = 0.4, Top = 0.1, Height = 0.5 })

	for _, s in ipairs({ -1, 1 }) do
		local core = BuildUtil.Child(ctx, s < 0 and "WestElevatorCore" or "EastElevatorCore")
		local inward, outward = inwardOf(s), outwardOf(s)
		-- shell: outer + inner walls, front wall with the press room doorway (floor 1), back wall
		-- with the ground entrance
		box(core, "CoreOuterWall", s * XI, 0, CORE_Z, s * XO, T1, ZBO, CORE_WALL, Enum.Material.Concrete)
		local innerWall = box(core, "CoreInnerWall", s * CORE_X, 0, CORE_Z, s * (CORE_X + 0.7), T1, ZBO, CORE_WALL, Enum.Material.Concrete)
		-- labels on the lobby side of the inner wall (that face's left edge is z 170 on the east
		-- core, z 156 on the west core)
		local function wallLabel(z0, z1, y0, y1)
			local depth = ZBO - CORE_Z
			return {
				Left = s > 0 and (ZBO - z1) / depth or (z0 - CORE_Z) / depth,
				Width = (z1 - z0) / depth,
				Top = (T1 - y1) / T1,
				Height = (y1 - y0) / T1,
			}
		end
		box(core, "CoreFrontWall", s * (CORE_X + 0.7), 0, CORE_Z, s * DOOR_A, T1, CORE_Z + 0.7, CORE_WALL, Enum.Material.Concrete)
		box(core, "CoreFrontWall", s * DOOR_A, 0, CORE_Z, s * DOOR_B, SLAB1, CORE_Z + 0.7, CORE_WALL, Enum.Material.Concrete)
		box(core, "CoreFrontLintel", s * DOOR_A, F1 + 8, CORE_Z, s * DOOR_B, T1, CORE_Z + 0.7, CORE_WALL, Enum.Material.Concrete)
		box(core, "CoreFrontWall", s * DOOR_B, 0, CORE_Z, s * XI, T1, CORE_Z + 0.7, CORE_WALL, Enum.Material.Concrete)
		box(core, "CoreBackWall", s * (CORE_X + 0.7), 0, ZB, s * DOOR_A, T1, ZBO, CORE_WALL, Enum.Material.Concrete)
		box(core, "CoreBackWall", s * DOOR_B, 0, ZB, s * XI, T1, ZBO, CORE_WALL, Enum.Material.Concrete)
		local lintel = box(core, "EntranceLintel", s * DOOR_A, 8.3, ZB, s * DOOR_B, T1, ZBO, CORE_WALL, Enum.Material.Concrete)
		sign(lintel, Enum.NormalId.Back, "PRESS BOX\nELEVATOR", team.Primary, team, {
			BackgroundColor3 = team.Primary,
			BackgroundTransparency = 0,
			InsetX = 0.04,
			Top = 1 - 4.2 / (T1 - 8.3),
			Height = 3.6 / (T1 - 8.3),
			Wrap = true,
		})
		-- the car: jamb block (the door pockets into it), lintels, back panel
		box(core, "CarJamb", s * CAB_X, 0, CORE_Z + 0.7, s * XI, T1, CAB_Z, CORE_WALL, Enum.Material.Concrete)
		box(core, "CarLintel", s * CAB_X, 8.3, CAB_Z, s * XI, 10, ZB, BRUSHED, Enum.Material.Metal)
		box(core, "CarLintel", s * CAB_X, F1 + 8, CAB_Z, s * XI, C1, ZB, BRUSHED, Enum.Material.Metal)

		-- Ground lobby (y 0.3..10): tile floor, ceiling + light, glass entrance, call button,
		-- directory
		box(core, "LobbyFloor", s * (CORE_X + 0.7), 0, CORE_Z + 0.7, s * XI, G_FLOOR, ZB, TILE, Enum.Material.Marble)
		box(core, "LobbyCeiling", s * (CORE_X + 0.7), 10, CORE_Z + 0.7, s * XI, 10.4, ZB, CEILING)
		ceilingLight(core, s * 32, 163, 5, 2.5, 10, 22, 1.4)
		BuildUtil.Door(core, {
			Name = "EntranceDoor",
			Size = Vector3.new(DOOR_B - DOOR_A, 8.3, 0.3),
			CFrame = CFrame.new(s * (DOOR_A + DOOR_B) / 2, 8.3 / 2, (ZB + ZBO) / 2),
			Double = true,
			Slide = true,
			Color = GLASS,
			Material = Enum.Material.Glass,
			Transparency = 0.45,
			Object = "Press Box Elevator Lobby",
		})
		callPanel(
			core,
			s * (CAB_X - 0.2),
			3.4,
			160.9,
			s * CAB_X,
			5.4,
			162.1,
			inward,
			"UP\nPRESS",
			arrive(s, F1),
			{ Action = "Ride up", Object = "Press Box Elevator", Label = "PRESS LEVEL", Distance = 8 }
		)
		carDoor(core, s, G_FLOOR, "Press the call button beside the doors to ride up to the press box.")
		local directory = wallLabel(160.5, 166.5, 2.8, 7.6)
		directory.LabelName = "Directory"
		directory.TextColor3 = SCREEN_WHITE
		directory.BackgroundColor3 = SCREEN
		directory.BackgroundTransparency = 0
		directory.LightInfluence = 0
		directory.Font = Enum.Font.GothamBold
		directory.Wrap = true
		sign(innerWall, outward, "PRESS BOX\n1  PRESS ROOM\n2  COACHES' BOOTH (EAST ELEVATOR)", SCREEN, team, directory)
		BuildUtil.Look(
			innerWall,
			"Press Box Directory",
			"Floor 1 is the press room, where reporters watch the game and write their stories. Floor 2 is the coaches' booth - ride the east elevator to get there!",
			{ At = Vector3.new(s * 0.45, 5.2 - T1 / 2, 0.5), Distance = 8 }
		)

		-- Upstairs lobby (floor 1): ceiling + light, call button back down
		box(core, "UpperLobbyCeiling", s * (CORE_X + 0.7), C1, CORE_Z + 0.7, s * XI, T1, ZB, CEILING)
		ceilingLight(core, s * 32, 163, 5, 2.5, C1, 22, 1.4)
		callPanel(
			core,
			s * (CAB_X - 0.2),
			F1 + 3.4,
			160.9,
			s * CAB_X,
			F1 + 5.4,
			162.1,
			inward,
			"DOWN\nGROUND",
			arrive(s, G_FLOOR),
			{ Action = "Ride down", Object = "Elevator to the Ground", Label = "GROUND FLOOR", Distance = 8 }
		)
		carDoor(core, s, F1, "This elevator goes down to the ground floor. Press the call button beside the doors.")
		local lobbySign = wallLabel(160, 167, F1 + 5.2, F1 + 7.4)
		lobbySign.LabelName = "LobbySign"
		lobbySign.BackgroundColor3 = team.Primary
		lobbySign.BackgroundTransparency = 0
		sign(innerWall, outward, "PRESS LEVEL", team.Primary, team, lobbySign)
	end

	-------------------------------------------------------------------------------------------
	-- Step 2: the press room on floor 1
	-------------------------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 2)
	local room = BuildUtil.Child(ctx, "PressRoom")
	-- shell: side walls, back wall, window wall (glass + mullions + header), ceiling, lights
	for _, s in ipairs({ -1, 1 }) do
		box(room, "SideWall", s * XI, F1 + 1.2, ZO, s * XO, T1, CORE_Z, team.Primary)
	end
	box(room, "BackWall", -CORE_X, F1 + 1.2, ZB, CORE_X, T1, ZBO, team.Primary)
	box(room, "Windows", -XI, F1 + 1, ZO + 0.2, XI, F1 + 8, ZO + 0.5, GLASS, Enum.Material.Glass, { Transparency = 0.55 })
	for _, x in ipairs({ -21.6, 21.6 }) do
		box(room, "Mullion", x - 0.25, F1 + 1, ZO - 0.05, x + 0.25, F1 + 8, ZI, STEEL, Enum.Material.Metal)
	end
	local header = box(room, "WindowHeader", -XI, F1 + 8, ZO, XI, T1, ZI, team.Secondary)
	sign(header, Enum.NormalId.Front, "PRESS BOX", team.Secondary, team, { Left = 0.35, Width = 0.3, InsetY = 0.12 })
	box(room, "PressRoomCeiling", -XI, C1, ZI, XI, T1, CORE_Z, CEILING)
	box(room, "PressRoomCeiling", -CORE_X, C1, CORE_Z, CORE_X, T1, ZB, CEILING)
	for _, x in ipairs({ -28, 0, 28 }) do
		ceilingLight(room, x, 151.5, 6, 2, C1, 26, 1.6)
	end
	box(room, "Carpet", -XI, F1, ZI, XI, F1 + 0.05, CORE_Z, CARPET, Enum.Material.Carpet, PAINT)
	box(room, "Carpet", -CORE_X, F1, CORE_Z, CORE_X, F1 + 0.05, ZB, CARPET, Enum.Material.Carpet, PAINT)
	-- sliding glass doors from the two elevator lobbies
	for _, s in ipairs({ -1, 1 }) do
		BuildUtil.Door(room, {
			Name = "PressRoomDoor",
			Size = Vector3.new(DOOR_B - DOOR_A, 8, 0.3),
			CFrame = CFrame.new(s * (DOOR_A + DOOR_B) / 2, F1 + 4, CORE_Z + 0.35),
			Double = true,
			Slide = true,
			Color = GLASS,
			Material = Enum.Material.Glass,
			Transparency = 0.45,
			Object = "Press Room",
			Title = "Press Room",
			Info = "Reporters only! Well... and team owners. Grab a seat at the window to watch the game like a sports writer.",
		})
	end

	-- The press row: a long desk at the window, monitors, nameplates and six camera seats
	local desk = box(room, "PressDesk", -38, F1 + 2.6, ZI + 0.6, 38, F1 + 2.9, ZI + 3, WOOD, Enum.Material.Wood)
	box(room, "DeskPanel", -38, F1, ZI + 0.6, 38, F1 + 2.6, ZI + 1, DARK_WOOD, Enum.Material.Wood)
	local nameGui = Instance.new("SurfaceGui")
	nameGui.Name = "Nameplates"
	nameGui.Face = Enum.NormalId.Top
	nameGui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	nameGui.PixelsPerStud = 20
	nameGui.Parent = desk
	local rowLives = { "score", "record", "season", "gameday", "rating", "titles" }
	local rowTexts = { name .. " 0 - 0 VISITORS", "RECORD 0-0", "SEASON 1", "NEXT GAME SOON", "TEAM RATING 50", "CHAMPIONSHIPS: 0" }
	for index, x in ipairs({ -30, -18, -6, 6, 18, 30 }) do
		-- nameplate (top face reads from the +Z side, where the reporters sit; its left is -X)
		local plate = Instance.new("TextLabel")
		plate.Name = "Nameplate"
		plate.BackgroundColor3 = PAPER
		plate.BorderSizePixel = 0
		plate.Size = UDim2.new(3.6 / 76, 0, 0.5 / 2.4, 0)
		plate.Position = UDim2.new((x - 1.8 + 38) / 76, 0, 1.75 / 2.4, 0)
		plate.Font = Enum.Font.GothamBold
		plate.Text = PRESS_NAMES[index]
		plate.TextColor3 = INK
		plate.TextScaled = true
		plate.Parent = nameGui
		local monitor = box(room, "Monitor", x - 1.4, F1 + 2.9, ZI + 1.2, x + 1.4, F1 + 4.6, ZI + 1.5, SCREEN)
		screen(monitor, Enum.NormalId.Back, rowLives[index], rowTexts[index])
		chair(room, x, F1, ZI + 4.5, "S", LEATHER, {
			BackColor = team.Primary,
			Material = Enum.Material.Leather,
			Object = "Press Row Seat",
			Camera = { From = Vector3.new(x * 0.6, F1 + 5.5, ZO - 0.8), To = FIELD_CENTRE, Fov = 50, Label = "PRESS BOX CAM" },
		})
	end
	local sheets = box(room, "StatSheets", -1, F1 + 2.9, ZI + 1.9, 1, F1 + 3.15, ZI + 2.8, PAPER)
	BuildUtil.Look(
		sheets,
		"Stat Sheets",
		"Fresh stats are printed every quarter: yards, tackles, touchdowns - and your team's record.",
		{ LookKey = "record", Distance = 6 }
	)

	-- Second row on a riser behind the press row (one easy step up)
	local riserTop = F1 + 1
	box(room, "Riser", -20, F1, CORE_Z + 0.5, 20, riserTop, 163, CARPET, Enum.Material.Carpet)
	box(room, "PressDesk", -17, riserTop + 2.6, CORE_Z + 0.8, 17, riserTop + 2.9, CORE_Z + 2.8, WOOD, Enum.Material.Wood)
	box(room, "DeskPanel", -17, riserTop, CORE_Z + 0.8, 17, riserTop + 2.6, CORE_Z + 1.2, DARK_WOOD, Enum.Material.Wood)
	for index, x in ipairs({ -8, 8 }) do
		local monitor = box(room, "Monitor", x - 1.6, riserTop + 2.9, CORE_Z + 1.3, x + 1.6, riserTop + 4.6, CORE_Z + 1.6, SCREEN)
		screen(monitor, Enum.NormalId.Back, index == 1 and "team" or "score", "")
	end
	for index, x in ipairs({ -12, -4, 4, 12 }) do
		chair(room, x, riserTop, CORE_Z + 4.2, "S", LEATHER, {
			BackColor = team.Primary,
			Material = Enum.Material.Leather,
			Object = "Press Seat",
			NoPrompt = index == 2 or index == 3,
		})
	end

	-- Back of the room: big live screen, stat board, credentials, coffee bar, copier, cooler
	local bigScreen = box(room, "BigScreen", -12, F1 + 2, ZB - 0.4, 12, F1 + 8.2, ZB, SCREEN)
	screen(bigScreen, Enum.NormalId.Front, "summary", name .. "\n0 - 0\nRECORD 0-0\nSEASON 1", { PixelsPerStud = 20 })
	local statBoard = box(room, "StatBoard", CORE_X - 0.2, F1 + 2.5, 157.5, CORE_X, F1 + 7, 163.5, SCREEN)
	screen(statBoard, Enum.NormalId.Left, "record", "RECORD 0-0", { Height = 0.5, LabelName = "LiveRecord" })
	screen(
		statBoard,
		Enum.NormalId.Left,
		"season",
		"SEASON 1",
		{ Top = 0.5, Height = 0.5, LabelName = "LiveSeason", TextColor3 = SCREEN_WHITE }
	)
	local credentials = box(room, "CredentialsBoard", -CORE_X, F1 + 2.5, 157.5, -CORE_X + 0.2, F1 + 7, 163.5, CREAM, Enum.Material.Fabric)
	sign(credentials, Enum.NormalId.Right, "PRESS CREDENTIALS\nTODAY'S MEDIA LIST", CREAM, team, {
		TextColor3 = INK,
		Font = Enum.Font.GothamBold,
		Top = 0.06,
		Height = 0.28,
		Wrap = true,
	})
	BuildUtil.Look(
		credentials,
		"Press Credentials",
		"Every reporter needs a badge to get in. Today's list has 24 newspapers, radio shows and TV crews - all here to cover your team!",
		{ LookKey = "team", Distance = 8 }
	)
	local coffee = box(room, "CoffeeBar", -CORE_X + 0.1, F1, 167.2, -17.5, F1 + 3.2, ZB, DARK_WOOD, Enum.Material.Wood)
	box(room, "CoffeeMachine", -22.6, F1 + 3.2, 167.6, -20.4, F1 + 5.4, ZB - 0.2, DARK_METAL, Enum.Material.Metal)
	BuildUtil.Use(ctx, coffee, "soda", {
		Object = "Coffee & Soda Bar",
		Title = "Coffee & Soda Bar",
		Info = "Reporters run on coffee... but this machine also pours fizzy soda!",
		Distance = 7,
	})
	local copier = box(room, "StatCopier", 13.5, F1, 166.6, 17.5, F1 + 3.4, ZB - 0.1, Color3.fromRGB(200, 202, 206))
	BuildUtil.Look(
		copier,
		"Stat Copier",
		"This copier prints play-by-play sheets so fast it never stops whirring. Every reporter gets a copy!",
		{ Distance = 7 }
	)
	local cooler = cyl(room, "DrinkCooler", Vector3.new(21, F1 + 1.6, 167.6), 3.2, 2.2, "Y", COOLER_ORANGE)
	BuildUtil.Use(ctx, cooler, "sportsdrink", {
		Object = "Sports Drink Cooler",
		Title = "Sports Drink Cooler",
		Info = "The same cooler the players drink from on the sideline. Stay hydrated!",
		Distance = 7,
	})

	-------------------------------------------------------------------------------------------
	-- Step 3: the coaches' booth on floor 2 (east elevator stop)
	-------------------------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 3)
	local booth = BuildUtil.Child(ctx, "CoachesBooth")
	box(booth, "Level2Slab", -XI, T1, ZI, XI, F2, ZB, C.ConcreteDark, Enum.Material.Concrete)
	box(booth, "Carpet", -XI, F2, ZI, XI, F2 + 0.05, ZB, Color3.fromRGB(40, 44, 56), Enum.Material.Carpet, PAINT)
	for _, s in ipairs({ -1, 1 }) do
		box(booth, "SideWall", s * XI, T1, ZO, s * XO, T2, ZBO, team.Primary)
	end
	local backWall = box(booth, "BackWall", -XI, T1, ZB, XI, T2, ZBO, team.Primary)
	-- a trim band round the campus side at floor 2 level ties the cores and the box together
	box(booth, "BackTrim", -XO, T1 - 0.6, ZBO, XO, F2, ZBO + 0.3, team.Secondary, Enum.Material.SmoothPlastic, PAINT)
	sign(backWall, Enum.NormalId.Back, name .. " MEDIA CENTER", team.Primary, team, {
		Left = 0.22,
		Width = 0.56,
		Top = 0.22,
		Height = 0.5,
		PixelsPerStud = 12,
	})
	box(booth, "LevelBand", -XI, T1, ZO, XI, F2 + 0.8, ZI, team.Primary)
	box(booth, "Windows", -XI, F2 + 0.8, ZO + 0.2, XI, F2 + 7.2, ZO + 0.5, GLASS, Enum.Material.Glass, { Transparency = 0.55 })
	for _, x in ipairs({ -21.6, 21.6 }) do
		box(booth, "Mullion", x - 0.25, F2 + 0.8, ZO - 0.05, x + 0.25, F2 + 7.2, ZI, STEEL, Enum.Material.Metal)
	end
	local header2 = box(booth, "WindowHeader", -XI, F2 + 7.2, ZO, XI, T2, ZI, team.Secondary)
	sign(header2, Enum.NormalId.Front, "COACHES' BOOTH", team.Secondary, team, { Left = 0.35, Width = 0.3, InsetY = 0.1 })
	box(booth, "BoothCeiling", -XI, C2, ZI, XI, T2, ZB, CEILING)
	for _, x in ipairs({ -26, 0, 26 }) do
		ceilingLight(booth, x, 151.5, 6, 2, C2, 26, 1.5)
	end

	-- the east elevator stops here: jamb block, car door, call button (and an UP button in the
	-- east lobby downstairs)
	box(booth, "CarJamb", CAB_X, F2, CORE_Z, XI, C2, CAB_Z, CORE_WALL, Enum.Material.Concrete)
	carDoor(booth, 1, F2, "This elevator goes back down to the press room. Press the call button beside the doors.")
	callPanel(
		booth,
		CAB_X - 0.2,
		F2 + 3.4,
		160.9,
		CAB_X,
		F2 + 5.4,
		162.1,
		Enum.NormalId.Left,
		"DOWN\nPRESS",
		arrive(1, F1),
		{ Action = "Ride down", Object = "Elevator to the Press Room", Label = "PRESS LEVEL", Distance = 8 }
	)
	callPanel(
		booth,
		CAB_X - 0.2,
		F1 + 3.4,
		157.6,
		CAB_X,
		F1 + 5.4,
		158.8,
		Enum.NormalId.Left,
		"UP\nCOACHES",
		arrive(1, F2),
		{ Action = "Ride up", Object = "Elevator to the Coaches' Booth", Label = "COACHES' BOOTH", Distance = 8 }
	)

	-- headset desk at the window with five camera seats
	box(booth, "CoachDesk", -30, F2 + 2.6, ZI + 0.6, 30, F2 + 2.9, ZI + 3, DARK_WOOD, Enum.Material.Wood)
	box(booth, "DeskPanel", -30, F2, ZI + 0.6, 30, F2 + 2.6, ZI + 1, team.Primary)
	for index, x in ipairs({ -24, -12, 0, 12, 24 }) do
		chair(booth, x, F2, ZI + 4.5, "S", LEATHER, {
			BackColor = team.Secondary,
			Material = Enum.Material.Leather,
			Object = "Coach's Seat",
			Camera = {
				From = Vector3.new(x * 0.5, F2 + 6, ZO - 0.8),
				To = FIELD_CENTRE,
				Fov = index == 3 and 62 or 48,
				Label = index == 3 and "ALL-22 COACHES CAM" or "COACHES' BOOTH CAM",
			},
		})
	end
	local headsets = box(booth, "Headsets", -2.2, F2 + 2.9, ZI + 1.5, 2.2, F2 + 3.3, ZI + 2.4, CAMERA_BLACK)
	BuildUtil.Look(
		headsets,
		"Coaches' Headsets",
		"Coaches up here radio plays down to the sideline: 'Run it again - they can't stop it!'",
		{ LookKey = "rating", Distance = 6 }
	)
	-- spotter binoculars on tripods in the window corners
	for _, s in ipairs({ -1, 1 }) do
		local x = s * 37.5
		cyl(booth, "TripodPost", Vector3.new(x, F2 + 2, ZI + 1.6), 4, 0.35, "Y", DARK_METAL, Enum.Material.Metal)
		local binoculars = box(booth, "Binoculars", x - 0.8, F2 + 4, ZI + 1, x + 0.8, F2 + 4.6, ZI + 2.2, CAMERA_BLACK)
		BuildUtil.Look(
			binoculars,
			"Spotter Binoculars",
			s < 0 and "Spotters zoom in to see who made the play. Right now they're watching your quarterback:"
				or "The defensive spotter checks every tackle. Today's star on defense:",
			{ LookKey = s < 0 and "roster:QB" or "roster:DEF", Distance = 7 }
		)
	end
	-- back wall: game-day screen, live depth chart, play sheet; a couch to watch from
	local gameday = box(booth, "GameDayScreen", -10, F2 + 1.8, ZB - 0.4, 10, F2 + 7, ZB, SCREEN)
	screen(gameday, Enum.NormalId.Front, "gameday", "NEXT GAME SOON", { PixelsPerStud = 20 })
	local depth = box(booth, "DepthChart", 13, F2 + 1.4, ZB - 0.4, 21, F2 + 7, ZB, SCREEN)
	screen(depth, Enum.NormalId.Front, "roster", "DEPTH CHART", { TextColor3 = SCREEN_WHITE, PixelsPerStud = 24 })
	local playSheet = box(booth, "PlaySheet", -21, F2 + 1.4, ZB - 0.4, -13, F2 + 7, ZB, WHITE)
	sign(
		playSheet,
		Enum.NormalId.Front,
		"PLAY SHEET\n\nRUN: 32 DIVE, 28 TOSS\nPASS: TRIPS FLOOD, Y-CROSS\nTRICK: FLEA FLICKER",
		WHITE,
		team,
		{
			TextColor3 = INK,
			Font = Enum.Font.GothamBold,
			InsetX = 0.08,
			InsetY = 0.08,
			Wrap = true,
		}
	)
	BuildUtil.Look(
		playSheet,
		"Play Sheet",
		"The coordinator's play sheet: 120 plays, colour-coded and laminated. The trick plays are circled in red!",
		{ LookKey = "season", Distance = 7 }
	)
	chair(booth, 0, F2, 161.6, "N", team.Primary, {
		Width = 8,
		Depth = 2.6,
		SeatHeight = 1.6,
		BackHeight = 2,
		Name = "Couch",
		Object = "Couch",
	})

	-------------------------------------------------------------------------------------------
	-- Step 4: roof, PRESS BOX sign, TV camera platforms, antennas
	-------------------------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 4)
	local roof = BuildUtil.Child(ctx, "Roof")
	local roofTop = T2 + 0.8
	box(roof, "PressBoxRoof", -XO - 0.4, T2, ZO - 0.6, XO + 0.4, roofTop, ZBO + 0.4, C.Concrete, Enum.Material.Concrete)
	box(roof, "RoofFascia", -XO - 0.4, T2 - 0.6, ZO - 1, XO + 0.4, roofTop + 0.4, ZO - 0.6, team.Secondary)
	local roofSign = box(roof, "PressBoxSign", -26, roofTop, ZI + 1.2, 26, roofTop + 3.6, ZI + 1.8, team.Primary)
	sign(roofSign, Enum.NormalId.Front, "PRESS BOX", team.Primary, team, { InsetX = 0.04, InsetY = 0.1 })
	sign(roofSign, Enum.NormalId.Back, name .. " PRESS BOX", team.Primary, team, { InsetX = 0.04, InsetY = 0.1 })
	for _, s in ipairs({ -1, 1 }) do
		local x = s * 37.5
		box(roof, "CameraPlatform", x - 4, roofTop, ZI, x + 4, roofTop + 0.4, ZI + 6, STEEL, Enum.Material.DiamondPlate)
		box(roof, "PlatformRail", x - 4, roofTop + 0.4, ZI, x + 4, roofTop + 1.4, ZI + 0.2, C.Metal, Enum.Material.Metal, NO_COLLIDE)
		local camera = tvCamera(roof, x, roofTop + 0.4, ZI + 3.2, "Z", -1, 1.6)
		BuildUtil.Look(
			camera,
			"TV Camera",
			"This camera films the whole field from high above for the TV broadcast. Smile - you're on TV!",
			{ Distance = 10 }
		)
		cyl(roof, "Antenna", Vector3.new(s * 40, roofTop + 2.1, 167), 4.2, 0.3, "Y", C.Metal, Enum.Material.Metal)
	end
	box(roof, "AirHandler", -30, roofTop, 160, -22, roofTop + 2, 166, C.Metal, Enum.Material.Metal)
end

---------------------------------------------------------------------------------------------
-- Luxury suites
---------------------------------------------------------------------------------------------

-- Suite levels (plot-local studs)
local S_FLOOR = 28
local S_CEIL, S_TOP = 36.4, 37.2
local S_DOOR_TOP = S_FLOOR + 8
local Z_OUT, Z_OUT_IN = -104, -103.4 -- corridor outer wall (faces the plaza)
local Z_CW0, Z_CW1 = -96.4, -95.8 -- corridor inner wall (doors into the suites)
local Z_GLASS, Z_FRONT = -84.2, -83.5 -- glass front (faces the field)
local X_END, X_END_IN = 120, 119.3
local BOOTH_HALF = 16 -- the broadcast booth fills |x| < 16 between the wings

-- Suites from west to east: interior x range, divider walls are 0.7 thick between them.
local SUITES = {
	{ n = 1, a = -119.3, b = -94.35, title = "Suite 1 - The Hall of Fame Suite" },
	{ n = 2, a = -93.65, b = -68.35, title = "Suite 2 - The Rookie Suite" },
	{ n = 3, a = -67.65, b = -42.35, title = "Suite 3 - The Legends Suite" },
	{ n = 4, a = -41.65, b = -16.7, title = "Suite 4 - The Owner's Suite", owner = true },
	{ n = 5, a = 36.35, b = 56.65, title = "Suite 5 - The Family Suite" },
	{ n = 6, a = 57.35, b = 77.65, title = "Suite 6 - The Sponsors' Suite" },
	{ n = 7, a = 78.35, b = 98.65, title = "Suite 7 - The Alumni Suite" },
	{ n = 8, a = 99.35, b = 119.3, title = "Suite 8 - The Super Fan Suite" },
}
local SUITE_INFO = {
	"Signed footballs from (made-up) legends line the walls. The comfy seats face the 30-yard line.",
	"The cheapest suite in the house - but the popcorn is just as good!",
	"Old game balls and team photos everywhere. Rumour says a famous kicker carved his initials in the bar.",
	"The best seats in the stadium, right next to the TV booth on the 50-yard line. Only the owner gets the big chair!",
	"Kid-sized seats and a never-ending popcorn supply. Perfect for game day with the whole family.",
	"Fancy snacks for the team's partners. They clap politely after every touchdown.",
	"Former players come back to watch the game here and tell stories about the good old days.",
	"Face paint, foam fingers and the loudest fans in the building. Bring earplugs!",
}
local DIVIDERS = { -94, -68, -42, -BOOTH_HALF - 0.35, BOOTH_HALF + 0.35, 36, 57, 78, 99 }
-- the elevator alcove off the corridor (east wing) and its car; the ground lobby is right below
local ALCOVE_A, ALCOVE_B = 16.7, 35.65
local CAR_A, CAR_B = 22.85, 28.85 -- the car door (6 wide)
local Z_CAR0, Z_CAR1 = -88.7, -88 -- the car's front wall
local G2 = { MinX = 19.5, MaxX = 36 } -- ground lobby X range (z -104..-83.5)

local function suiteDoorRange(suite)
	-- 6 wide, hinged 1.5 studs from the suite's east wall so the leaf swings against it
	local x1 = suite.b - 1.5
	return x1 - 6, x1
end

function PressLevel.suites(ctx)
	local C = ctx.config.Colors
	local team = ctx.colors
	local name = teamLabel(ctx)
	local slabBottom = S_FLOOR - 2 -- 26 (the plaza walkway stays open far below)

	-- where the elevator drops you
	local upTarget = CFrame.lookAt(Vector3.new((CAR_A + CAR_B) / 2, S_FLOOR, -91.6), Vector3.new((CAR_A + CAR_B) / 2, S_FLOOR, -100))
	local downTarget = CFrame.lookAt(Vector3.new((CAR_A + CAR_B) / 2, 0.3, -91.6), Vector3.new((CAR_A + CAR_B) / 2, 0.3, -100))

	-------------------------------------------------------------------------------------------
	-- Step 1: columns, beam, slab, the corridor and the elevator
	-------------------------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 1)
	local frame = BuildUtil.Child(ctx, "Structure")
	box(frame, "SuiteSlab", -X_END_IN, slabBottom, Z_OUT_IN, X_END_IN, S_FLOOR, Z_FRONT, C.ConcreteDark, Enum.Material.Concrete)
	box(frame, "SlabBeam", -X_END_IN, slabBottom - 2, -94, X_END_IN, slabBottom, -92, STEEL, Enum.Material.Metal)
	for _, x in ipairs({ -117, -80, -30, 80, 117 }) do
		cyl(frame, "Column", Vector3.new(x, (slabBottom - 2) / 2, -93), slabBottom - 2, 2.4, "Y", C.Concrete, Enum.Material.Concrete)
	end
	-- plaza facade of the corridor: team band, window band, top band
	local lowerBand = box(frame, "FacadeBand", -X_END, slabBottom - 2, Z_OUT, X_END, S_FLOOR + 2.4, Z_OUT_IN, team.Primary)
	for index, range in ipairs({ { 40, 96 }, { -96, -40 } }) do
		-- the Front face's left edge is world +X
		sign(lowerBand, Enum.NormalId.Front, name .. " LUXURY SUITES", team.Primary, team, {
			LabelName = "SuitesName" .. index,
			Left = (X_END - range[2]) / (2 * X_END),
			Width = (range[2] - range[1]) / (2 * X_END),
			InsetY = 0.12,
			PixelsPerStud = 10,
		})
	end
	sign(lowerBand, Enum.NormalId.Front, "CLUB LEVEL", team.Primary, team, {
		LabelName = "ClubLevel",
		Left = (X_END - 13) / (2 * X_END),
		Width = 26 / (2 * X_END),
		InsetY = 0.12,
		PixelsPerStud = 10,
	})
	sign(lowerBand, Enum.NormalId.Back, "SUITES 1 - 4   <<<        ELEVATOR        >>>   SUITES 5 - 8", team.Primary, team, {
		LabelName = "Directory",
		Left = (X_END + 4) / (2 * X_END),
		Width = 44 / (2 * X_END),
		Top = 0.58,
		Height = 0.24,
		PixelsPerStud = 10,
	})
	BuildUtil.Look(
		lowerBand,
		"Suite Level",
		"Welcome to the club level! Suites 1 to 4 are to the west, 5 to 8 to the east, and the TV booth is in the middle.",
		{ At = Vector3.new(26, 4.2, 0.6), Distance = 8 }
	)
	box(frame, "FacadeWindows", -X_END, S_FLOOR + 2.4, Z_OUT + 0.15, X_END, S_FLOOR + 7.2, Z_OUT_IN - 0.15, GLASS, Enum.Material.Glass, {
		Transparency = 0.45,
	})
	box(frame, "FacadeTop", -X_END, S_FLOOR + 7.2, Z_OUT, X_END, S_TOP, Z_OUT_IN, team.Secondary)
	for _, s in ipairs({ -1, 1 }) do
		box(frame, "EndWall", s * X_END_IN, slabBottom - 2, Z_OUT_IN, s * X_END, S_TOP, Z_FRONT, team.Primary)
	end
	box(frame, "CorridorCeiling", -X_END_IN, S_CEIL, Z_OUT_IN, X_END_IN, S_TOP, Z_CW0, CEILING)
	box(frame, "CorridorCarpet", -X_END_IN, S_FLOOR, Z_OUT_IN, X_END_IN, S_FLOOR + 0.05, Z_CW0, team.Primary, Enum.Material.Carpet, PAINT)
	for _, x in ipairs({ -90, -30, 30, 90 }) do
		ceilingLight(frame, x, -99.9, 6, 1.4, S_CEIL, 30, 1.4)
	end
	-- corridor inner wall: one lintel over everything, wall pieces between the openings
	box(frame, "CorridorLintel", -X_END_IN, S_DOOR_TOP, Z_CW0, X_END_IN, S_TOP, Z_CW1, WALL_LIGHT)
	local openings = { { -3.5, 3.5 }, { ALCOVE_A, ALCOVE_B } }
	for _, suite in ipairs(SUITES) do
		local a, b = suiteDoorRange(suite)
		table.insert(openings, { a, b })
	end
	table.sort(openings, function(p, q)
		return p[1] < q[1]
	end)
	local cursor = -X_END_IN
	for _, opening in ipairs(openings) do
		if opening[1] > cursor + 0.01 then
			box(frame, "CorridorWall", cursor, S_FLOOR, Z_CW0, opening[1], S_DOOR_TOP, Z_CW1, WALL_LIGHT)
		end
		cursor = opening[2]
	end
	box(frame, "CorridorWall", cursor, S_FLOOR, Z_CW0, X_END_IN, S_DOOR_TOP, Z_CW1, WALL_LIGHT)

	-- Elevator: ground lobby on the plaza (X[19.5, 36], z -104..-83.5) under the alcove
	local lobby = BuildUtil.Child(ctx, "ElevatorLobby")
	local gx0, gx1 = G2.MinX, G2.MaxX
	local doorA, doorB = 24.5, 31.5
	box(lobby, "LobbyWall", gx0, 0, Z_OUT_IN, gx0 + 0.7, slabBottom, Z_FRONT, team.Primary)
	box(lobby, "LobbyWall", gx1 - 0.7, 0, Z_OUT_IN, gx1, slabBottom, Z_FRONT, team.Primary)
	box(lobby, "LobbyBackWall", gx0 + 0.7, 0, Z_GLASS, gx1 - 0.7, slabBottom, Z_FRONT, team.Primary)
	box(lobby, "LobbyFront", gx0, 0, Z_OUT, doorA, slabBottom - 2, Z_OUT_IN, team.Primary)
	box(lobby, "LobbyFront", doorB, 0, Z_OUT, gx1, slabBottom - 2, Z_OUT_IN, team.Primary)
	local lintel = box(lobby, "EntranceLintel", doorA, 8.3, Z_OUT, doorB, slabBottom - 2, Z_OUT_IN, team.Primary)
	sign(lintel, Enum.NormalId.Front, "SUITES\nELEVATOR", team.Secondary, team, {
		BackgroundColor3 = team.Secondary,
		BackgroundTransparency = 0,
		InsetX = 0.04,
		Top = 1 - 4.4 / (slabBottom - 2 - 8.3),
		Height = 3.8 / (slabBottom - 2 - 8.3),
		Wrap = true,
	})
	box(lobby, "LobbyFloor", gx0 + 0.7, 0, Z_OUT_IN, gx1 - 0.7, 0.3, Z_GLASS, TILE, Enum.Material.Marble)
	box(lobby, "LobbyCeiling", gx0 + 0.7, 10, Z_OUT_IN, gx1 - 0.7, 10.4, Z_GLASS, CEILING)
	ceilingLight(lobby, 28, -96, 5, 2.5, 10, 24, 1.5)
	BuildUtil.Door(lobby, {
		Name = "EntranceDoor",
		Size = Vector3.new(doorB - doorA, 8.3, 0.3),
		CFrame = CFrame.new((doorA + doorB) / 2, 8.3 / 2, (Z_OUT + Z_OUT_IN) / 2),
		Double = true,
		Slide = true,
		Color = GLASS,
		Material = Enum.Material.Glass,
		Transparency = 0.45,
		Object = "Suites Elevator Lobby",
	})
	-- the car's front wall with its sliding door (pockets toward +X), call button, directory
	box(lobby, "CarWall", gx0 + 0.7, 0, Z_CAR0, CAR_A, 10, Z_CAR1, BRUSHED, Enum.Material.Metal)
	box(lobby, "CarWall", CAR_B, 0, Z_CAR0, gx1 - 0.7, 10, Z_CAR1, BRUSHED, Enum.Material.Metal)
	box(lobby, "CarLintel", CAR_A, 8.3, Z_CAR0, CAR_B, 10, Z_CAR1, BRUSHED, Enum.Material.Metal)
	box(lobby, "CarPanel", gx0 + 0.7, 0.3, Z_GLASS - 0.2, gx1 - 0.7, 8.3, Z_GLASS, Color3.fromRGB(150, 120, 80), Enum.Material.Wood)
	BuildUtil.Door(lobby, {
		Name = "ElevatorDoor",
		Size = Vector3.new(CAR_B - CAR_A, 8, 0.3),
		CFrame = CFrame.new((CAR_A + CAR_B) / 2, 0.3 + 4, (Z_CAR0 + Z_CAR1) / 2) * CFrame.Angles(0, math.pi, 0),
		Slide = true,
		Color = BRUSHED,
		Material = Enum.Material.Metal,
		Object = "Elevator",
		Title = "Elevator",
		Info = "Press the call button beside the doors to ride up to the luxury suites and the TV booth.",
		AutoClose = 5,
		Distance = 8,
	})
	callPanel(
		lobby,
		31.4,
		3.4,
		Z_CAR0 - 0.2,
		32.6,
		5.4,
		Z_CAR0,
		Enum.NormalId.Front,
		"UP\nSUITES",
		upTarget,
		{ Action = "Ride up", Object = "Suites Elevator", Label = "LUXURY SUITES", Distance = 8 }
	)
	local directory = box(lobby, "Directory", gx1 - 0.9, 2.8, -100, gx1 - 0.7, 7.6, -94, SCREEN)
	sign(directory, Enum.NormalId.Left, "CLUB LEVEL\n\nSUITES 1 - 8\nTV BROADCAST BOOTH", SCREEN, team, {
		TextColor3 = SCREEN_WHITE,
		Font = Enum.Font.GothamBold,
		InsetX = 0.08,
		InsetY = 0.1,
		LightInfluence = 0,
		Wrap = true,
	})
	BuildUtil.Look(
		directory,
		"Club Level Directory",
		"Up on the club level are 8 luxury suites with comfy seats, snacks and TVs - plus the TV broadcast booth.",
		{ Distance = 8 }
	)

	-- the alcove upstairs: the car's front wall, its door (pockets toward -X) and the call button
	local alcove = BuildUtil.Child(ctx, "ElevatorAlcove")
	box(alcove, "CarWall", ALCOVE_A, S_FLOOR, Z_CAR0, CAR_A, S_CEIL, Z_CAR1, BRUSHED, Enum.Material.Metal)
	box(alcove, "CarWall", CAR_B, S_FLOOR, Z_CAR0, ALCOVE_B, S_CEIL, Z_CAR1, BRUSHED, Enum.Material.Metal)
	box(alcove, "CarLintel", CAR_A, S_DOOR_TOP, Z_CAR0, CAR_B, S_CEIL, Z_CAR1, BRUSHED, Enum.Material.Metal)
	BuildUtil.Door(alcove, {
		Name = "ElevatorDoor",
		Size = Vector3.new(CAR_B - CAR_A, 8, 0.3),
		CFrame = CFrame.new((CAR_A + CAR_B) / 2, S_FLOOR + 4, (Z_CAR0 + Z_CAR1) / 2),
		Slide = true,
		Color = BRUSHED,
		Material = Enum.Material.Metal,
		Object = "Elevator",
		Title = "Elevator",
		Info = "This glass-backed elevator goes down to the plaza. Press the call button beside the doors.",
		AutoClose = 5,
		Distance = 8,
	})
	callPanel(
		alcove,
		31.4,
		S_FLOOR + 3.4,
		Z_CAR0 - 0.2,
		32.6,
		S_FLOOR + 5.4,
		Z_CAR0,
		Enum.NormalId.Front,
		"DOWN\nPLAZA",
		downTarget,
		{ Action = "Ride down", Object = "Elevator to the Plaza", Label = "PLAZA", Distance = 8 }
	)

	-------------------------------------------------------------------------------------------
	-- Step 2: glass fronts, suite walls + ceilings, suite doors
	-------------------------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 2)
	local shell = BuildUtil.Child(ctx, "SuiteShells")
	for _, x in ipairs(DIVIDERS) do
		box(shell, "SuiteWall", x - 0.35, S_FLOOR, Z_CW1, x + 0.35, S_CEIL, Z_GLASS, WALL_LIGHT)
	end
	for index, wing in ipairs({ { -X_END_IN, -BOOTH_HALF - 0.7 }, { BOOTH_HALF + 0.7, X_END_IN } }) do
		local a, b = wing[1], wing[2]
		box(shell, "GlassSill", a, S_FLOOR, Z_GLASS, b, S_FLOOR + 1.2, Z_FRONT, team.Secondary)
		box(shell, "SuiteGlass", a, S_FLOOR + 1.2, Z_GLASS + 0.2, b, S_FLOOR + 7.2, Z_FRONT - 0.2, GLASS, Enum.Material.Glass, {
			Transparency = 0.5,
		})
		local header = box(shell, "GlassHeader", a, S_FLOOR + 7.2, Z_GLASS, b, S_TOP, Z_FRONT, team.Primary)
		sign(header, Enum.NormalId.Back, name .. " CLUB SUITES", team.Primary, team, {
			LabelName = "ClubSuites" .. index,
			Left = 0.25,
			Width = 0.5,
			InsetY = 0.12,
			PixelsPerStud = 10,
		})
		box(shell, "SuiteCeiling", a, S_CEIL, Z_CW1, b, S_TOP, Z_GLASS, CEILING)
	end
	for _, suite in ipairs(SUITES) do
		local a, b = suiteDoorRange(suite)
		local door = BuildUtil.Door(shell, {
			Name = "SuiteDoor",
			Size = Vector3.new(b - a, 8, 0.3),
			CFrame = CFrame.new((a + b) / 2, S_FLOOR + 4, (Z_CW0 + Z_CW1) / 2) * CFrame.Angles(0, math.pi, 0),
			Hinge = "Left",
			Color = suite.owner and DARK_WOOD or WOOD,
			Material = Enum.Material.Wood,
			Object = "Suite " .. suite.n,
			Title = suite.title,
			Info = SUITE_INFO[suite.n],
			LookKey = suite.owner and "owner" or nil,
		})
		doorText(door, Enum.NormalId.Back, { "SUITE " .. suite.n }, team, suite.owner and DARK_WOOD or WOOD)
	end

	-------------------------------------------------------------------------------------------
	-- Step 3: suite interiors, number signs, lights
	-------------------------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 3)
	local carpets = BuildUtil.Child(ctx, "SuiteCarpets")
	for _, range in ipairs({ { -X_END_IN, SUITES[3].b }, { BOOTH_HALF + 0.7, X_END_IN } }) do
		box(carpets, "SuiteCarpet", range[1], S_FLOOR, Z_CW1, range[2], S_FLOOR + 0.05, Z_GLASS, CARPET, Enum.Material.Carpet, PAINT)
	end
	box(carpets, "SuiteCarpet", SUITES[4].a, S_FLOOR, Z_CW1, SUITES[4].b, S_FLOOR + 0.05, Z_GLASS, DARK_WOOD, Enum.Material.Carpet, PAINT)
	for _, suite in ipairs(SUITES) do
		local c = BuildUtil.Child(ctx, "Suite" .. suite.n)
		local a, b = suite.a, suite.b
		local cx = (a + b) / 2
		local doorA = suiteDoorRange(suite)
		ceilingLight(c, cx, -90, 6, 2, S_CEIL, 22, 1.4)
		-- number sign beside the door (corridor side)
		local plate = box(c, "SuiteSign", doorA - 4.2, S_FLOOR + 4.6, Z_CW0 - 0.15, doorA - 0.6, S_FLOOR + 6.8, Z_CW0, team.Primary)
		sign(plate, Enum.NormalId.Front, suite.owner and "OWNER'S SUITE" or ("SUITE " .. suite.n), team.Primary, team, {
			InsetX = 0.08,
			InsetY = 0.16,
		})
		BuildUtil.Look(plate, suite.title, SUITE_INFO[suite.n], { LookKey = suite.owner and "owner" or nil, Distance = 7 })
		-- two seats at the glass (one shows the game like a TV camera) with a shared back
		for index, dx in ipairs({ -1.6, 1.6 }) do
			local x = cx - 2 + dx
			BuildUtil.Seat(c, {
				Name = "SuiteSeat",
				Size = Vector3.new(2.6, 1.8, 2),
				CFrame = CFrame.new(x, S_FLOOR + 0.9, -86.3) * CFrame.Angles(0, math.pi, 0),
				Color = team.Primary,
				Material = Enum.Material.Fabric,
				Object = "Suite Seat",
				NoPrompt = index == 2,
				Camera = index == 1 and {
					From = Vector3.new(cx * 0.75, S_FLOOR + 5, Z_FRONT + 0.7),
					To = FIELD_CENTRE,
					Fov = 55,
					Label = "SUITE " .. suite.n .. " - LIVE",
				} or nil,
			})
		end
		box(c, "SeatBack", cx - 5.2, S_FLOOR + 1.8, -87.7, cx + 1.2, S_FLOOR + 4, -87.3, team.Primary, Enum.Material.Fabric)
		-- sofa facing the field (clear of the door's swing)
		local sofaX = math.min(cx - 1.5, b - 11.8)
		chair(c, sofaX, S_FLOOR, -90.2, "N", suite.owner and LEATHER or team.Secondary, {
			Width = 7,
			Depth = 2.5,
			SeatHeight = 1.6,
			BackHeight = 2,
			Name = "Sofa",
			Object = "Sofa",
			Material = suite.owner and Enum.Material.Leather or Enum.Material.Fabric,
		})
		-- live score TV on the west wall, mini-bar against the corridor wall
		local tv = box(c, "SuiteTV", a, S_FLOOR + 2.8, -91.6, a + 0.3, S_FLOOR + 5.8, -86.4, SCREEN)
		screen(tv, Enum.NormalId.Right, "score", name .. " 0 - 0 VISITORS")
		local bar = box(c, "MiniBar", a + 0.3, S_FLOOR, Z_CW1, a + 5.3, S_FLOOR + 3, Z_CW1 + 1.6, DARK_WOOD, Enum.Material.Wood)
		local usePopcorn = suite.n % 2 == 0 and not suite.owner
		BuildUtil.Use(ctx, bar, usePopcorn and "popcorn" or "soda", {
			Object = usePopcorn and "Popcorn Bar" or "Mini-Bar",
			Title = usePopcorn and "Popcorn Bar" or "Mini-Bar",
			Info = usePopcorn and "Fresh, buttery popcorn - free for suite guests!"
				or "Ice-cold sodas for the suite. Cheers to the home team!",
			Distance = 7,
		})
		if suite.owner then
			-- the owner's big chair in the corner with the best view of the 50-yard line
			chair(c, b - 4, S_FLOOR, -86.6, "N", LEATHER, {
				Width = 3,
				Depth = 2.8,
				SeatHeight = 1.8,
				BackHeight = 3.4,
				Name = "OwnersChair",
				Object = "Owner's Chair",
				Material = Enum.Material.Leather,
				BackColor = GOLD,
				Camera = { From = Vector3.new(-6, S_FLOOR + 6, Z_FRONT + 1), To = FIELD_CENTRE, Fov = 45, Label = "OWNER'S BOX" },
			})
			local popcorn = box(c, "PopcornMachine", a + 6, S_FLOOR, Z_CW1, a + 8.4, S_FLOOR + 4.2, Z_CW1 + 2, POPCORN_RED)
			BuildUtil.Use(ctx, popcorn, "popcorn", {
				Object = "Popcorn Machine",
				Title = "Popcorn Machine",
				Info = "The owner's personal popcorn machine. Extra butter!",
				Distance = 6,
			})
		end
	end
end

---------------------------------------------------------------------------------------------
-- TV broadcast booth (between the suite wings, over the front upper deck)
---------------------------------------------------------------------------------------------

function PressLevel.broadcast_booth(ctx)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local team = ctx.colors
	local name = teamLabel(ctx)

	local half = BOOTH_HALF -- interior |x| < 16; walls |x| 16..16.7
	local zFront = -71.6 -- outside of the glass front (the studio hangs over the top rows)
	local zGlassIn = zFront - 0.7
	local slabBottom = L.UpperTopHeight + 0.05 -- just clear of the top row
	local row10Top = L.UpperStartHeight + 3 * L.RowRise -- 22: the row under the front girder

	-------------------------------------------------------------------------------------------
	-- Step 1: floor, walls, ceiling, door, lights, support girder
	-------------------------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 1)
	local shell = BuildUtil.Child(ctx, "BoothShell")
	box(shell, "BoothSlab", -half - 0.7, slabBottom, Z_FRONT, half + 0.7, S_FLOOR, zFront, team.Primary)
	box(shell, "FrontGirder", -half - 0.7, slabBottom - 2, zFront - 2.4, half + 0.7, slabBottom, zFront - 0.4, STEEL, Enum.Material.Metal)
	for _, s in ipairs({ -1, 1 }) do
		box(
			shell,
			"GirderPost",
			s * (half - 0.9),
			row10Top,
			zFront - 1.9,
			s * (half + 0.1),
			slabBottom - 2,
			zFront - 0.9,
			STEEL,
			Enum.Material.Metal
		)
		local wall = box(shell, "SideWall", s * half, S_FLOOR, Z_GLASS, s * (half + 0.7), S_TOP, zFront, team.Primary)
		sign(wall, s > 0 and Enum.NormalId.Right or Enum.NormalId.Left, "TV", team.Primary, team, { InsetX = 0.2, InsetY = 0.2 })
	end
	box(shell, "BoothCarpet", -half, S_FLOOR, Z_CW1, half, S_FLOOR + 0.06, zGlassIn, CARPET, Enum.Material.Carpet, PAINT)
	box(shell, "Sill", -half, S_FLOOR, zGlassIn, half, S_FLOOR + 1.2, zFront, team.Secondary)
	local header = box(shell, "GlassHeader", -half, S_FLOOR + 7.2, zGlassIn, half, S_TOP, zFront, team.Secondary)
	sign(header, Enum.NormalId.Back, name .. " TV  -  BROADCAST BOOTH", team.Secondary, team, { InsetX = 0.05, InsetY = 0.14 })
	box(shell, "BoothCeiling", -half, S_CEIL, Z_CW1, half, S_TOP, zGlassIn, CEILING)
	ceilingLight(shell, 0, -90, 6, 2, S_CEIL, 22, 1.4)
	for _, x in ipairs({ -8, 8 }) do
		ceilingLight(shell, x, -79, 5, 2, S_CEIL, 22, 1.5)
	end
	-- double door from the suite corridor (swings into the booth)
	local door = BuildUtil.Door(shell, {
		Name = "BoothDoor",
		Size = Vector3.new(7, 8, 0.3),
		CFrame = CFrame.new(0, S_FLOOR + 4, Z_CW1 - 0.2) * CFrame.Angles(0, math.pi, 0),
		Double = true,
		Window = true,
		Color = CAMERA_BLACK,
		Material = Enum.Material.SmoothPlastic,
		Object = "Broadcast Booth",
		Title = "TV Broadcast Booth",
		Info = "Quiet please - we're live! This is where the game is called for millions of TV viewers.",
	})
	doorText(door, Enum.NormalId.Back, { "BROADCAST", "BOOTH" }, team, CAMERA_BLACK)

	-------------------------------------------------------------------------------------------
	-- Step 2: glass, commentators' desk + camera seats, monitors, cameras, ON AIR, control room
	-------------------------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 2)
	local studio = BuildUtil.Child(ctx, "Studio")
	box(studio, "BoothGlass", -half, S_FLOOR + 1.2, zGlassIn + 0.2, half, S_FLOOR + 7.2, zFront - 0.2, GLASS, Enum.Material.Glass, {
		Transparency = 0.5,
	})
	for _, x in ipairs({ -8, 8 }) do
		box(studio, "Mullion", x - 0.2, S_FLOOR + 1.2, zGlassIn, x + 0.2, S_FLOOR + 7.2, zFront, STEEL, Enum.Material.Metal)
	end
	-- commentators' desk facing the field, three TV BROADCAST seats behind it
	local deskZ0, deskZ1 = -75.6, -73.6
	box(studio, "CommentaryDesk", -9, S_FLOOR + 2.6, deskZ0, 9, S_FLOOR + 2.9, deskZ1, DARK_WOOD, Enum.Material.Wood)
	local deskFront = box(studio, "DeskFront", -9, S_FLOOR, deskZ1 - 0.4, 9, S_FLOOR + 2.6, deskZ1, team.Primary)
	sign(deskFront, Enum.NormalId.Back, name .. " TV", team.Primary, team, { InsetX = 0.2, InsetY = 0.2 })
	local views = {
		{ x = -6, from = Vector3.new(0, 42, -64), fov = 50, label = "TV BROADCAST - MAIN CAM" },
		{ x = 0, from = Vector3.new(0, 78, -12), fov = 62, label = "TV BROADCAST - SKY CAM" },
		{ x = 6, from = Vector3.new(-150, 24, 30), fov = 45, label = "TV BROADCAST - END ZONE CAM" },
	}
	for _, v in ipairs(views) do
		chair(studio, v.x, S_FLOOR, -77, "N", LEATHER, {
			BackColor = ON_AIR_RED,
			Material = Enum.Material.Leather,
			BackHeight = 2.6,
			Object = "Commentator's Seat",
			Camera = { From = v.from, To = FIELD_CENTRE, Fov = v.fov, Label = v.label },
		})
	end
	for index, x in ipairs({ -3, 3 }) do
		local monitor = box(studio, "DeskMonitor", x - 1.2, S_FLOOR + 2.9, -74.9, x + 1.2, S_FLOOR + 4.3, -74.6, SCREEN)
		screen(monitor, Enum.NormalId.Front, index == 1 and "score" or "gameday", "")
	end
	-- two TV cameras on tripods: one films the field, one films the commentators
	local fieldCam = tvCamera(studio, -13, S_FLOOR, -76, "Z", 1, 3)
	BuildUtil.Look(
		fieldCam,
		"Field Camera",
		"Camera 1 zooms in on the action through the glass. It can read a jersey number from across the stadium!",
		{ Distance = 7 }
	)
	local studioCam = tvCamera(studio, 13, S_FLOOR, -77, "X", -1, 3)
	BuildUtil.Look(
		studioCam,
		"Studio Camera",
		"Camera 2 points at the commentators. Sit at the desk and you're on TV - wave to the folks at home!",
		{ Distance = 7 }
	)
	-- ON AIR light hanging between the control room and the studio
	local onAir = box(studio, "OnAirLight", -3, S_CEIL - 1.4, Z_FRONT - 0.2, 3, S_CEIL - 0.1, Z_FRONT + 0.2, ON_AIR_RED, Enum.Material.Neon)
	for _, face in ipairs({ Enum.NormalId.Front, Enum.NormalId.Back }) do
		sign(
			onAir,
			face,
			"ON AIR",
			ON_AIR_RED,
			team,
			{ TextColor3 = WHITE, InsetX = 0.1, InsetY = 0.12, LightInfluence = 0, LabelName = "OnAir" }
		)
	end
	BuildUtil.Light(onAir, "PointLight", { Name = "OnAirGlow", Range = 10, Brightness = 1, Color = ON_AIR_RED })
	BuildUtil.Look(
		onAir,
		"On Air Light",
		"When this glows red the broadcast is LIVE - so no burping into the microphones!",
		{ LookKey = "team", Distance = 8 }
	)
	-- control room: monitor walls on the corridor wall, producer's desk + chair, equipment rack
	local wallLeft = box(studio, "MonitorWall", -14, S_FLOOR + 2, Z_CW1, -5, S_FLOOR + 7, Z_CW1 + 0.3, SCREEN)
	screen(wallLeft, Enum.NormalId.Back, "summary", name .. "\n0 - 0\nRECORD 0-0\nSEASON 1", { PixelsPerStud = 24 })
	local wallRight = box(studio, "MonitorWall", 5, S_FLOOR + 2, Z_CW1, 14, S_FLOOR + 7, Z_CW1 + 0.3, SCREEN)
	screen(wallRight, Enum.NormalId.Back, "score", name .. " 0 - 0 VISITORS", { PixelsPerStud = 24, TextColor3 = SCREEN_WHITE })
	local producerDesk = box(studio, "ProducerDesk", -13, S_FLOOR + 2.6, -92, -5, S_FLOOR + 2.9, -90, DARK_METAL, Enum.Material.Metal)
	box(studio, "ProducerDeskPanel", -13, S_FLOOR, -92, -5, S_FLOOR + 2.6, -91.6, CAMERA_BLACK)
	BuildUtil.Look(
		producerDesk,
		"Producer's Desk",
		"The producer picks which camera goes on TV: 'Camera 2... and GO!' Dozens of buttons, and every one of them blinks.",
		{ At = Vector3.new(-3, 0.3, 0), Distance = 7 }
	)
	chair(
		studio,
		-9,
		S_FLOOR,
		-88.8,
		"S",
		LEATHER,
		{ BackColor = DARK_METAL, Material = Enum.Material.Leather, Object = "Producer's Chair" }
	)
	box(studio, "EquipmentRack", half - 1.6, S_FLOOR, -93, half, S_FLOOR + 6, -88, CAMERA_BLACK, Enum.Material.Metal)

	-------------------------------------------------------------------------------------------
	-- Step 3: satellite dish on the roof
	-------------------------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 3)
	local roof = BuildUtil.Child(ctx, "Satellite")
	local dishBase = Vector3.new(-8, S_TOP, -88)
	box(
		roof,
		"DishBase",
		dishBase.X - 1.5,
		S_TOP,
		dishBase.Z - 1.5,
		dishBase.X + 1.5,
		S_TOP + 0.4,
		dishBase.Z + 1.5,
		C.Metal,
		Enum.Material.Metal
	)
	cyl(roof, "DishMast", Vector3.new(dishBase.X, S_TOP + 0.95, dishBase.Z), 1.1, 0.5, "Y", C.Metal, Enum.Material.Metal)
	-- the dish faces up and toward the plaza (-Z); a cylinder's axis is its local X
	local normal = Vector3.new(0, 0.766, -0.643)
	local dishCentre = Vector3.new(dishBase.X, S_TOP + 1.5, dishBase.Z)
	local dish = BuildUtil.Part(roof, {
		Name = "SatelliteDish",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(0.3, 3.6, 3.6),
		CFrame = CFrame.lookAt(dishCentre, dishCentre + normal) * CFrame.Angles(0, math.pi / 2, 0),
		Color = WHITE,
		Material = Enum.Material.SmoothPlastic,
	})
	local feed = dishCentre + normal * 1.3
	BuildUtil.Part(roof, {
		Name = "FeedArm",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(1.3, 0.15, 0.15),
		CFrame = CFrame.lookAt((dishCentre + feed) / 2, feed) * CFrame.Angles(0, math.pi / 2, 0),
		Color = C.Metal,
		Material = Enum.Material.Metal,
	})
	BuildUtil.Ball(roof, { Name = "FeedHorn", Position = feed, Diameter = 0.45, Color = DARK_METAL, Material = Enum.Material.Metal })
	BuildUtil.Look(
		dish,
		"Satellite Dish",
		"This dish beams the game up to a satellite in space, and from there to TVs all over the world!",
		{ LookKey = "team", Distance = 10 }
	)
	box(roof, "UplinkBox", 5, S_TOP, -94, 9, S_TOP + 1.2, -90, C.Concrete, Enum.Material.Metal)
	cyl(roof, "Antenna", Vector3.new(11, S_TOP + 1.2, -92), 2.4, 0.25, "Y", C.Metal, Enum.Material.Metal)
	BuildUtil.Ball(roof, {
		Name = "AntennaBeacon",
		Position = Vector3.new(11, S_TOP + 2.5, -92),
		Diameter = 0.45,
		Color = ON_AIR_RED,
		Material = Enum.Material.Neon,
	})
end

return PressLevel
