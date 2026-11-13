--[[
	StadiumRooms
	The two game-day locker rooms. Both are real walk-in rooms bought in three steps (see
	Items.lua); BuildUtil.Stage(ctx, n) marks the parts of step n.

	  home_lockerroom     behind the home stands, east of the press box. The double doors face
	                      the campus road (+Z); inside, the coach's corner is at the west end
	                      (whiteboard, podium, live screens), the lockers line the north + south
	                      walls, the showers fill the east end.
	                        1 Building            shell + ceiling lights, double doors, signs,
	                                              the showers behind a partition (look)
	                        2 Lockers             16 lockers, each with its own door (opening it
	                                              shows whose locker it is) and a jersey inside,
	                                              three rows of benches facing the podium (two
	                                              camera seats: TEAM TALK CAM + TUNNEL CAM)
	                        3 Logo & Whiteboard   floor logo (look), coach's whiteboard with the
	                                              live starters, podium (pre-game speech), live
	                                              summary / record / season screens, sports-drink
	                                              cooler, trophy shelf (titles), motto banners
	  visitor_lockerroom  in the plaza beside the front walkway. The door faces the walkway (+X).
	                      Smaller and plainer on purpose.
	                        1 Building            shell, door, VISITORS sign, AWAY TEAM plaque (look)
	                        2 Lockers             grey open stalls with white away jerseys (looks)
	                        3 Bench & Signs       a squeaky bench, a CRT on an AV cart with the live
	                                              score, a lukewarm soda cooler, a leaky ceiling +
	                                              bucket and some not-so-welcoming signs

	Everything is built in plot-local studs; box() takes min / max corners so the room plans
	below read like a floor plan.
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)

local StadiumRooms = {}

local FLOOR_TOP = 0.3

local PAINT = { CanCollide = false, CastShadow = false }
local DECOR = { CanCollide = false }

local WHITE = Color3.fromRGB(248, 248, 248)
local INK = Color3.fromRGB(22, 22, 26)
local DARK_METAL = Color3.fromRGB(62, 64, 70)
local CHROME = Color3.fromRGB(200, 204, 210)
local WARM_LIGHT = Color3.fromRGB(255, 236, 200)
local LAMP = Color3.fromRGB(255, 248, 232)
local CEILING = Color3.fromRGB(226, 226, 222)
local SCREEN_BLACK = Color3.fromRGB(12, 14, 20)
local LED_TEXT = Color3.fromRGB(255, 226, 120)
local LED_GREEN = Color3.fromRGB(120, 255, 150)
local FACEMASK_GREY = Color3.fromRGB(80, 82, 90)
local GOLD = Color3.fromRGB(232, 184, 52)
local WOOD = Color3.fromRGB(120, 84, 52)

local HOME_WALL = Color3.fromRGB(178, 180, 186)
local HOME_CARPET = Color3.fromRGB(50, 52, 60)
local TILE = Color3.fromRGB(214, 228, 236)
local COOLER_ORANGE = Color3.fromRGB(255, 120, 20)
local MARKER_BLUE = Color3.fromRGB(30, 60, 160)

local VISITOR_WALL = Color3.fromRGB(150, 150, 156)
local VISITOR_BAND = Color3.fromRGB(92, 94, 102)
local VISITOR_FLOOR = Color3.fromRGB(128, 128, 132)
local VISITOR_SIGN = Color3.fromRGB(60, 62, 70)
local LOCKER_GREY = Color3.fromRGB(150, 152, 158)
local LOCKER_GREY_DARK = Color3.fromRGB(92, 94, 100)
local LOCKER_GREY_MID = Color3.fromRGB(118, 120, 126)
local AWAY_NUMBER = Color3.fromRGB(70, 72, 80)
local AWAY_HELMET = Color3.fromRGB(236, 236, 240)
local CRT_BEIGE = Color3.fromRGB(196, 186, 162)
local BUCKET_BLUE = Color3.fromRGB(60, 110, 170)
local WATER_BLUE = Color3.fromRGB(110, 170, 230)
local STAIN_BROWN = Color3.fromRGB(150, 122, 74)
local CAUTION_YELLOW = Color3.fromRGB(255, 208, 30)
local DUFFEL_GREY = Color3.fromRGB(70, 74, 82)
local COOLER_BLUE = Color3.fromRGB(40, 96, 170)

-- Home locker room plan (plot-local studs). Outer wall faces X[47, 108] Z[146, 170]: east of the
-- press box (x <= 44), behind the upper deck's outside wall (z <= 143.7), off the campus road
-- (z >= 172). Walls are 1 thick, so the room inside is X[48, 107] Z[147, 169].
local HOME = { MinX = 47, MaxX = 108, MinZ = 146, MaxZ = 170 }
local HOME_H = 12.5 -- wall height (the roof band sits on top)
local HOME_CEILING = 12 -- underside of the ceiling
local HOME_MID_Z = 158
local HOME_DOOR = { MinX = 52, MaxX = 60, Top = 9.5 } -- double doors in the north wall
local HOME_WINDOW = { MinX = 63, MaxX = 105, Top = 11.7 } -- clerestory strip over the north lockers
local SHOWER_X = 95 -- the shower partition spans x[95, 96]; showers behind it
local SHOWER_DOOR = { MinZ = 154.5, MaxZ = 161.5, Top = 9.3 }
local HOME_LOCKERS = { MinX = 64, Count = 8, Width = 3.5, Depth = 2.6 } -- per wall (north + south)
local BENCH_ROWS = { 70, 76, 82 } -- x of the bench rows; they face the podium (-X)
local PODIUM_X = 52.5
local SPEAKER_HEAD = Vector3.new(50.3, 5.4, HOME_MID_Z) -- where a player at the podium stands

-- Visitor locker room plan. Outer wall faces X[-50, -22] Z[-118, -100]; inside X[-49, -23]
-- Z[-117, -101]. The door is in the east wall (facing the front walkway).
local VISITOR = { MinX = -50, MaxX = -22, MinZ = -118, MaxZ = -100 }
local VISITOR_H = 10.5
local VISITOR_CEILING = 10
local VISITOR_DOOR = { MinZ = -108, MaxZ = -102, Top = 8.8 }
local VISITOR_WINDOW = { MinZ = -116, MaxZ = -111, Bottom = 3 }

-- Jersey numbers hanging in the home lockers (locker n wears HOME_NUMBERS[n])
local HOME_NUMBERS = { "1", "7", "12", "22", "24", "33", "44", "52", "55", "62", "74", "81", "88", "90", "95", "99" }
local AWAY_NUMBERS = { "2", "14", "27", "38", "50", "61", "73", "84" }
local AWAY_NAMES = { "VISITOR", "GUEST", "AWAY", "TBD", "ROOKIE", "BACKUP", "NEW GUY", "SUB" }

-- Funny descriptions for some of the visitors' stalls (by stall number, west bank then south bank)
local AWAY_STALL_INFO = {
	[1] = "A tiny stall with one wobbly hook. The away team has to share hangers!",
	[3] = "This one smells like old gym socks. Nobody knows why, and nobody wants to find out.",
	[5] = "The name tag just says 'NEW GUY'. The home team printed them in a hurry... on purpose.",
	[7] = "The seat squeaks every time you sit down. Good luck sneaking out early!",
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

local function contrastRatio(a, b)
	local la, lb = luminance(a), luminance(b)
	if la < lb then
		la, lb = lb, la
	end
	return (la + 0.05) / (lb + 0.05)
end

-- First candidate that reads well on `background`, else whichever of white / ink reads best.
local function textColorOn(background, candidates)
	for _, candidate in ipairs(candidates) do
		if contrastRatio(background, candidate) >= 3 then
			return candidate
		end
	end
	if contrastRatio(background, WHITE) >= contrastRatio(background, INK) then
		return WHITE
	end
	return INK
end

-- Insets a TextLabel inside its SurfaceGui (fractions of the face left empty around it).
local function inset(label, insetX, insetY)
	label.Size = UDim2.new(1 - 2 * insetX, 0, 1 - 2 * insetY, 0)
	label.Position = UDim2.new(insetX, 0, insetY, 0)
end

--[[
	Writes `text` on each face in `faces` of `part`, coloured to read well on `background`.
	opts: TextColor3, Font, PixelsPerStud, InsetX / InsetY (fraction of the face left empty
	      around the text, default 0.06 / 0.12)
	Returns the last TextLabel.
]]
local function sign(part, faces, text, background, team, opts)
	opts = opts or {}
	local color = opts.TextColor3 or textColorOn(background, { team.Trim, team.Primary, team.Secondary })
	local label
	for _, face in ipairs(faces) do
		_, label = BuildUtil.SurfaceText(part, face, text, {
			LabelName = part.Name .. face.Name,
			TextColor3 = color,
			Font = opts.Font or Enum.Font.GothamBlack,
			PixelsPerStud = opts.PixelsPerStud or 20,
		})
		inset(label, opts.InsetX or 0.06, opts.InsetY or 0.12)
	end
	return label
end

--[[
	A live screen (BuildUtil.LiveText) the server keeps up to date with the owner's team: dark
	background, bright text, readable in the dark (LightInfluence 0). Returns the TextLabel.
	opts: LabelName, TextColor3, BackgroundColor3, BackgroundTransparency, Font, PixelsPerStud,
	      InsetX / InsetY
]]
local function liveScreen(part, face, live, placeholder, opts)
	opts = opts or {}
	local _, label = BuildUtil.LiveText(part, face, live, {
		LabelName = opts.LabelName or ("Live_" .. live),
		Text = placeholder,
		TextColor3 = opts.TextColor3 or LED_TEXT,
		BackgroundColor3 = opts.BackgroundColor3 or SCREEN_BLACK,
		BackgroundTransparency = opts.BackgroundTransparency or 0,
		LightInfluence = 0,
		Font = opts.Font or Enum.Font.GothamBold,
		PixelsPerStud = opts.PixelsPerStud or 24,
	})
	local pad = Instance.new("UIPadding")
	local px, py = UDim.new(opts.InsetX or 0.05, 0), UDim.new(opts.InsetY or 0.08, 0)
	pad.PaddingLeft, pad.PaddingRight, pad.PaddingTop, pad.PaddingBottom = px, px, py, py
	pad.Parent = label
	return label
end

local function shade(color, factor)
	return Color3.new(math.clamp(color.R * factor, 0, 1), math.clamp(color.G * factor, 0, 1), math.clamp(color.B * factor, 0, 1))
end

-- The owner's name, or a generic one while the plot has no name.
local function displayName(ctx)
	if ctx.teamName and ctx.teamName ~= "" then
		return ctx.teamName
	end
	return "HOME TEAM"
end

-- Axis-aligned block from its min corner (x0, y0, z0) to its max corner (x1, y1, z1).
local function box(ctx, name, x0, y0, z0, x1, y1, z1, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Size = Vector3.new(x1 - x0, y1 - y0, z1 - z0)
	props.Position = Vector3.new((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Part(ctx, props)
end

-- Block in a local `frame`: bottom at local height y0, centred on local (x, z).
local function lblock(ctx, frame, name, size, x, y0, z, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Size = size
	props.CFrame = frame * CFrame.new(x, y0 + size.Y / 2, z)
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Part(ctx, props)
end

-- Thin box from point a to point b (plot-local), its length along a -> b.
local function strut(ctx, name, a, b, thickness, color, material)
	return BuildUtil.Part(ctx, {
		Name = name,
		Size = Vector3.new(thickness, thickness, (b - a).Magnitude),
		CFrame = CFrame.lookAt((a + b) / 2, b),
		Color = color,
		Material = material,
		CanCollide = false,
	})
end

-- A glowing ceiling panel (w along X, d along Z) hanging under the ceiling at `ceilingY`,
-- centred on (x, z), with the room's PointLight.
local function ceilingLight(ctx, x, z, w, d, ceilingY, range, brightness)
	local lamp =
		box(ctx, "CeilingLight", x - w / 2, ceilingY - 0.2, z - d / 2, x + w / 2, ceilingY, z + d / 2, LAMP, Enum.Material.Neon, PAINT)
	BuildUtil.Light(lamp, "PointLight", { Name = "RoomLight", Range = range, Brightness = brightness or 1.4, Color = WARM_LIGHT })
	return lamp
end

-- A football helmet (shell + facemask) resting at local `frame` position; the facemask points
-- along the frame's -Z.
local function helmet(ctx, frame, diameter, color)
	BuildUtil.Ball(ctx, {
		Name = "Helmet",
		CFrame = frame * CFrame.new(0, diameter / 2, 0),
		Diameter = diameter,
		Color = color,
		Material = Enum.Material.SmoothPlastic,
		Reflectance = 0.1,
		CanCollide = false,
	})
	lblock(
		ctx,
		frame,
		"Facemask",
		Vector3.new(diameter * 0.62, diameter * 0.42, 0.25),
		0,
		0.08,
		-diameter / 2 + 0.06,
		FACEMASK_GREY,
		Enum.Material.Metal,
		DECOR
	)
end

--[[
	A bank of closed lockers against a wall, each with its own door (BuildUtil.Door, Object
	"Locker", LookKey "locker:<n>": opening it shows whose locker it is) and a numbered jersey
	hanging inside. `frame` is a plot-local CFrame at floor level on the wall face in the middle of
	the bank, its LookVector pointing into the room (the doors swing that way).
	o: Name, Count, Width (per locker), Depth, DoorHeight, First (number of the first locker),
	   FrameColor, HeaderColor, DoorColor, JerseyColor, NumberColor, PlateColor
]]
local function lockerBank(ctx, frame, o)
	local bank = BuildUtil.Child(ctx, o.Name)
	local n, w, D = o.Count, o.Width, o.Depth
	local len = n * w
	local plinth, doorH, header = 0.5, o.DoorHeight, 1.3
	local H = plinth + doorH + header
	local midZ = -D / 2 -- the wall is the lockers' back
	lblock(bank, frame, "LockerPlinth", Vector3.new(len, plinth, D), 0, 0, midZ, DARK_METAL, Enum.Material.Metal)
	local headerPart = lblock(bank, frame, "LockerHeader", Vector3.new(len, header, D), 0, plinth + doorH, midZ, o.HeaderColor)
	for i = 0, n do
		lblock(bank, frame, "LockerDivider", Vector3.new(0.3, doorH, D), -len / 2 + i * w, plinth, midZ, o.FrameColor, Enum.Material.Metal)
	end

	-- number plates: one GUI on the header front (its GUI x runs toward the bank's local -X)
	local plates = Instance.new("SurfaceGui")
	plates.Name = "NumberPlatesGui"
	plates.Face = Enum.NormalId.Front
	plates.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	plates.PixelsPerStud = 24
	plates.LightInfluence = 1
	plates.Parent = headerPart

	for i = 1, n do
		local number = o.First + i - 1
		local x = -len / 2 + (i - 0.5) * w
		local jersey =
			lblock(bank, frame, "Jersey", Vector3.new(w - 1.2, 3.2, 0.25), x, 3.6, -0.5, o.JerseyColor, Enum.Material.Fabric, DECOR)
		sign(jersey, { Enum.NormalId.Front }, HOME_NUMBERS[(number - 1) % #HOME_NUMBERS + 1], o.JerseyColor, nil, {
			TextColor3 = o.NumberColor,
			InsetX = 0.2,
			InsetY = 0.18,
		})

		local plateW = w - 1
		local label = Instance.new("TextLabel")
		label.Name = "LockerNumber"
		label.BackgroundTransparency = 1
		label.BorderSizePixel = 0
		label.Position = UDim2.new((len / 2 - x - plateW / 2) / len, 0, 0.2, 0)
		label.Size = UDim2.new(plateW / len, 0, 0.6, 0)
		label.Font = Enum.Font.GothamBlack
		label.Text = string.format("%02d", number)
		label.TextColor3 = o.PlateColor
		label.TextScaled = true
		label.Parent = plates

		BuildUtil.Door(bank, {
			Name = "LockerDoor" .. number,
			Size = Vector3.new(w - 0.3, doorH - 0.1, 0.2),
			CFrame = frame * CFrame.new(x, plinth + doorH / 2, -D + 0.1),
			Hinge = "Left",
			Color = o.DoorColor,
			Material = Enum.Material.Metal,
			Object = "Locker",
			Title = "Locker #" .. number,
			Info = "A player's locker: game jersey, pads and a lucky photo from home. Players dress here before every game.",
			LookKey = "locker:" .. number,
			Distance = 6,
		})
	end
	return H
end

--[[
	A bank of open locker stalls (the visitors don't get doors). `frame` is a plot-local CFrame at
	floor level on the wall face in the middle of the bank, its LookVector pointing into the room.
	o: Name, Length, Stalls, Height, Depth, First (number of the first stall), BackColor,
	   FrameColor, ShelfColor, SeatColor, JerseyColor, NumberColor, Names, HelmetEvery,
	   HelmetColor, Looks = { [stall number] = info }, Team
]]
local function openStalls(ctx, frame, o)
	local bank = BuildUtil.Child(ctx, o.Name)
	local n, len, H, D = o.Stalls, o.Length, o.Height, o.Depth
	local w = len / n
	local inner = D - 0.4 -- depth in front of the back panel
	lblock(bank, frame, "LockerBack", Vector3.new(len, H, 0.4), 0, 0, -0.2, o.BackColor, Enum.Material.Wood)
	lblock(bank, frame, "LockerSeat", Vector3.new(len, 1.6, inner), 0, 0, -0.4 - inner / 2, o.SeatColor, Enum.Material.Fabric)
	local shelf = lblock(bank, frame, "LockerShelf", Vector3.new(len, 1.2, inner), 0, H - 1.2, -0.4 - inner / 2, o.ShelfColor)
	-- dividers stand 0.15 proud of the seat + shelf fronts and stop 0.1 under the shelf top; the
	-- end panels poke 0.05 past the bank ends (no shared planes with the back / seat / shelf)
	for i = 0, n do
		local x = -len / 2 + i * w
		if i == 0 then
			x = -len / 2 + 0.1
		elseif i == n then
			x = len / 2 - 0.1
		end
		lblock(
			bank,
			frame,
			"LockerDivider",
			Vector3.new(0.3, H - 0.1, inner + 0.15),
			x,
			0,
			-0.4 - (inner + 0.15) / 2,
			o.FrameColor,
			Enum.Material.Wood
		)
	end

	-- nameplates: one GUI on the shelf front (its GUI x runs toward the bank's local -X)
	local plates = Instance.new("SurfaceGui")
	plates.Name = "NameplatesGui"
	plates.Face = Enum.NormalId.Front
	plates.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	plates.PixelsPerStud = 24
	plates.LightInfluence = 1
	plates.Parent = shelf
	local plateColor = textColorOn(o.ShelfColor, { WHITE, INK })

	local hd = 1.5
	for i = 1, n do
		local number = o.First + i - 1
		local x = -len / 2 + (i - 0.5) * w
		local jersey = lblock(
			bank,
			frame,
			"Jersey",
			Vector3.new(math.min(w - 1.4, 2.8), 3, 0.25),
			x,
			3.3,
			-0.75,
			o.JerseyColor,
			Enum.Material.Fabric,
			DECOR
		)
		sign(jersey, { Enum.NormalId.Front }, AWAY_NUMBERS[(number - 1) % #AWAY_NUMBERS + 1], o.JerseyColor, o.Team, {
			InsetX = 0.22,
			InsetY = 0.18,
			TextColor3 = o.NumberColor,
		})
		local info = o.Looks and o.Looks[number]
		if info then
			BuildUtil.Look(jersey, "Visitors' Locker", info, { At = Vector3.new(0, -0.4, -0.8), Distance = 7 })
		end
		local plateW = w - 0.8
		local label = Instance.new("TextLabel")
		label.Name = "Nameplate"
		label.BackgroundTransparency = 1
		label.BorderSizePixel = 0
		label.Position = UDim2.new((len / 2 - x - plateW / 2) / len, 0, 0.22, 0)
		label.Size = UDim2.new(plateW / len, 0, 0.56, 0)
		label.Font = Enum.Font.GothamBold
		label.Text = o.Names[(number - 1) % #o.Names + 1]
		label.TextColor3 = plateColor
		label.TextScaled = true
		label.Parent = plates
		if o.HelmetEvery and i % o.HelmetEvery == 0 then
			helmet(bank, frame * CFrame.new(x, H, -0.4 - inner / 2), hd, o.HelmetColor)
		end
	end
end

---------------------------------------------------------------------------------------------
-- Home Locker Room (behind the home stands; the double doors face the campus road)
---------------------------------------------------------------------------------------------

function StadiumRooms.home_lockerroom(ctx)
	local C = ctx.config.Colors
	local team = ctx.colors
	local name = displayName(ctx)
	local x0, x1, z0, z1 = HOME.MinX, HOME.MaxX, HOME.MinZ, HOME.MaxZ
	local H, ceil = HOME_H, HOME_CEILING
	local door, win = HOME_DOOR, HOME_WINDOW
	local midZ = HOME_MID_Z
	local wallMat = Enum.Material.Concrete

	-- Step 1: Building -----------------------------------------------------------------------
	-- floor, walls (door gap + clerestory in the north wall), roof, ceiling + lights, the double
	-- doors and the showers behind a partition at the east end
	BuildUtil.Stage(ctx, 1)
	local shell = BuildUtil.Child(ctx, "Building")
	box(shell, "Floor", x0 + 0.05, 0, z0 + 0.05, x1 - 0.05, FLOOR_TOP, z1 - 0.05, HOME_CARPET, Enum.Material.Carpet)
	box(shell, "SouthWall", x0, 0, z0, x1, H, z0 + 1, HOME_WALL, wallMat)
	box(shell, "WestWall", x0, 0, z0 + 1, x0 + 1, H, z1 - 1, HOME_WALL, wallMat)
	box(shell, "EastWall", x1 - 1, 0, z0 + 1, x1, H, z1 - 1, HOME_WALL, wallMat)
	box(shell, "NorthWall", x0, 0, z1 - 1, door.MinX, H, z1, HOME_WALL, wallMat)
	box(shell, "NorthWall", door.MaxX, 0, z1 - 1, x1, door.Top, z1, HOME_WALL, wallMat)
	box(shell, "DoorLintel", door.MinX, door.Top, z1 - 1, win.MinX, H, z1, HOME_WALL, wallMat)
	box(shell, "NorthWall", win.MaxX, door.Top, z1 - 1, x1, H, z1, HOME_WALL, wallMat)
	box(shell, "WindowHead", win.MinX, win.Top, z1 - 1, win.MaxX, H, z1, HOME_WALL, wallMat)
	box(shell, "ClerestoryGlass", win.MinX, door.Top, z1 - 0.65, win.MaxX, win.Top, z1 - 0.35, C.Glass, Enum.Material.Glass, {
		Transparency = 0.4,
	})
	box(shell, "RoofBand", x0 - 0.3, H, z0 - 0.3, x1 + 0.3, H + 1.6, z1 + 0.3, team.Primary)
	box(shell, "Roof", x0 - 0.6, H + 1.6, z0 - 0.6, x1 + 0.6, H + 2.2, z1 + 0.6, C.ConcreteDark, Enum.Material.Concrete)
	box(shell, "Ceiling", x0 + 1, ceil, z0 + 1, x1 - 1, ceil + 0.2, z1 - 1, CEILING)
	for _, lx in ipairs({ 56, 71, 86 }) do
		ceilingLight(shell, lx, midZ, 8, 3, ceil, 26, 1.5)
	end

	-- Entrance (outside, facing the campus road): step, jambs, canopy, lamps, signs
	local doorMid = (door.MinX + door.MaxX) / 2
	box(shell, "DoorStep", door.MinX - 1.5, 0, z1, door.MaxX + 1.5, FLOOR_TOP, z1 + 1.6, C.Concrete, Enum.Material.Concrete)
	for _, jx in ipairs({ door.MinX - 0.6, door.MaxX }) do
		box(shell, "DoorJamb", jx, FLOOR_TOP, z1, jx + 0.6, door.Top, z1 + 0.35, team.Secondary)
	end
	box(shell, "DoorCanopy", door.MinX - 1.6, door.Top, z1, door.MaxX + 1.6, door.Top + 0.5, z1 + 1.8, team.Secondary)
	for _, lx in ipairs({ door.MinX - 1.4, door.MaxX + 1.4 }) do
		local lamp = box(shell, "WallLamp", lx - 0.3, 6.4, z1, lx + 0.3, 7.4, z1 + 0.4, LAMP, Enum.Material.Neon)
		BuildUtil.Light(lamp, "PointLight", { Name = "EntranceLight", Range = 12, Brightness = 0.9, Color = WARM_LIGHT })
	end
	local signBoard = box(shell, "Sign", door.MinX - 3.5, door.Top + 0.75, z1, win.MinX - 0.5, H - 0.2, z1 + 0.4, team.Primary)
	sign(signBoard, { Enum.NormalId.Back }, "HOME LOCKER ROOM", team.Primary, team, { InsetX = 0.04, InsetY = 0.12 })
	local plaque = box(shell, "Plaque", x0 + 1.2, 3.4, z1, x0 + 2.8, 5.2, z1 + 0.15, team.Trim)
	sign(plaque, { Enum.NormalId.Back }, "PLAYERS\n& STAFF\nONLY", team.Trim, team, { InsetX = 0.08, InsetY = 0.1 })
	-- the team name under the clerestory, live (it follows the owner's team name)
	local nameBoard = box(shell, "NameBoard", 66, 3.8, z1, 102, 8, z1 + 0.4, team.Primary)
	local nameLabel = liveScreen(nameBoard, Enum.NormalId.Back, "team", name, {
		TextColor3 = textColorOn(team.Primary, { team.Trim, team.Secondary }),
		BackgroundColor3 = team.Primary,
		BackgroundTransparency = 1,
		Font = Enum.Font.GothamBlack,
		InsetX = 0.04,
		InsetY = 0.1,
		PixelsPerStud = 16,
	})
	nameLabel.Name = "TeamName"

	local doorH = door.Top - FLOOR_TOP - 0.1
	BuildUtil.Door(shell, {
		Name = "EntranceDoors",
		Size = Vector3.new(door.MaxX - door.MinX, doorH, 0.4),
		CFrame = CFrame.new(doorMid, FLOOR_TOP + 0.05 + doorH / 2, z1 - 0.5), -- swings in (toward -Z)
		Double = true,
		Window = true,
		Color = team.Primary,
		Material = Enum.Material.SmoothPlastic,
		Object = "Home Locker Room",
		Title = "Home Locker Room",
		Info = "Players and staff only! Your team suits up in here before every home game.",
		Distance = 8,
	})

	-- Showers: a partition with a wide archway, tiled floor + wall, four shower heads, own light
	local sd = SHOWER_DOOR
	box(shell, "ShowerWall", SHOWER_X, FLOOR_TOP, z0 + 1, SHOWER_X + 1, ceil, sd.MinZ, HOME_WALL, wallMat)
	box(shell, "ShowerWall", SHOWER_X, FLOOR_TOP, sd.MaxZ, SHOWER_X + 1, ceil, z1 - 1, HOME_WALL, wallMat)
	box(shell, "ShowerLintel", SHOWER_X, sd.Top, sd.MinZ, SHOWER_X + 1, ceil, sd.MaxZ, HOME_WALL, wallMat)
	box(
		shell,
		"ShowerFloorTiles",
		SHOWER_X + 1,
		FLOOR_TOP,
		z0 + 1,
		x1 - 1,
		FLOOR_TOP + 0.04,
		z1 - 1,
		TILE,
		Enum.Material.CeramicTiles,
		PAINT
	)
	local tiles =
		box(shell, "ShowerWallTiles", x1 - 1.12, FLOOR_TOP + 0.04, z0 + 1, x1 - 1, 8.6, z1 - 1, TILE, Enum.Material.CeramicTiles, PAINT)
	-- shower heads: chrome cones out of the tiles, tilted down toward the room
	for _, hz in ipairs({ 150.5, 155.5, 160.5, 165.5 }) do
		BuildUtil.Part(shell, {
			Name = "ShowerHead",
			Shape = Enum.PartType.Cylinder,
			Size = Vector3.new(1.5, 0.75, 0.75),
			CFrame = CFrame.new(x1 - 1.12 - 0.6, 7.4, hz) * CFrame.Angles(0, 0, math.rad(35)),
			Color = CHROME,
			Material = Enum.Material.Metal,
			CanCollide = false,
		})
	end
	BuildUtil.Look(
		tiles,
		"Showers",
		"Hot water, clouds of steam and the best singing echo in the whole stadium. The team hits the showers after every game.",
		{ At = Vector3.new(-3.5, 0, 0), Distance = 9 }
	)
	ceilingLight(shell, (SHOWER_X + 1 + x1 - 1) / 2, midZ, 4, 6, ceil, 20, 1.2)

	-- Step 2: Lockers ------------------------------------------------------------------------
	-- 8 lockers on the north wall (1-8, west to east) and 8 on the south wall (9-16, east to
	-- west), three rows of benches between them, facing the coach's corner
	BuildUtil.Stage(ctx, 2)
	local lockers = BuildUtil.Child(ctx, "Lockers")
	local L = HOME_LOCKERS
	local bankMidX = L.MinX + L.Count * L.Width / 2
	local bankOpts = {
		Count = L.Count,
		Width = L.Width,
		Depth = L.Depth,
		DoorHeight = 7.2,
		FrameColor = shade(team.Primary, 0.55),
		HeaderColor = team.Secondary,
		DoorColor = team.Primary,
		JerseyColor = team.Primary,
		NumberColor = textColorOn(team.Primary, { team.Trim, team.Secondary }),
		PlateColor = textColorOn(team.Secondary, { team.Trim, team.Primary }),
	}
	local north = table.clone(bankOpts)
	north.Name, north.First = "NorthLockers", 1
	local lockerH = lockerBank(lockers, CFrame.new(bankMidX, FLOOR_TOP, z1 - 1), north)
	local south = table.clone(bankOpts)
	south.Name, south.First = "SouthLockers", L.Count + 1
	lockerBank(lockers, CFrame.new(bankMidX, FLOOR_TOP, z0 + 1) * CFrame.Angles(0, math.pi, 0), south)
	-- helmets on top of the south lockers (the north ones sit under the windows)
	for _, hx in ipairs({ 71, 85 }) do
		helmet(lockers, CFrame.new(hx, FLOOR_TOP + lockerH, z0 + 1 + L.Depth / 2) * CFrame.Angles(0, math.pi, 0), 1.7, team.Primary)
	end

	-- benches: a dark frame with three padded seats each; seated players face the podium (-X)
	local seatColor = shade(team.Primary, 0.8)
	local facePodium = CFrame.Angles(0, math.pi / 2, 0)
	for row, bx in ipairs(BENCH_ROWS) do
		box(lockers, "BenchFrame", bx - 0.6, FLOOR_TOP, midZ - 3.8, bx + 0.6, FLOOR_TOP + 1.25, midZ + 3.8, DARK_METAL, Enum.Material.Metal)
		for i = -1, 1 do
			local camera, object
			if i == 0 and row == 1 then
				object = "Bench - Team Talk Cam"
				camera = { From = Vector3.new(66, 8.5, 151), To = SPEAKER_HEAD, Fov = 34, Label = "TEAM TALK CAM" }
			elseif i == 0 and row == #BENCH_ROWS then
				object = "Bench - Tunnel Cam"
				camera = { From = Vector3.new(0, 7, 90), To = Vector3.new(0, 2, 30), Fov = 60, Label = "TUNNEL CAM - LIVE" }
			end
			BuildUtil.Seat(lockers, {
				Name = "BenchSeat",
				Size = Vector3.new(2.5, 0.5, 1.8),
				CFrame = CFrame.new(bx, FLOOR_TOP + 1.5, midZ + i * 2.55) * facePodium,
				Color = seatColor,
				Material = Enum.Material.Fabric,
				Object = object,
				Camera = camera,
				NoPrompt = camera == nil,
			})
		end
	end

	-- Step 3: Logo & Whiteboard ----------------------------------------------------------------
	-- the coach's corner (west wall): live screens either side of the whiteboard, the podium in
	-- front; the team logo on the carpet; cooler, trophy shelf and motto signs
	BuildUtil.Stage(ctx, 3)
	local corner = BuildUtil.Child(ctx, "CoachCorner")
	local wallX = x0 + 1 -- inner face of the west wall

	-- coach's whiteboard: the live starting lineup in marker blue under a GAME PLAN header
	box(corner, "WhiteboardFrame", wallX, 2.7, midZ - 4.3, wallX + 0.12, 8.3, midZ + 4.3, team.Primary)
	local whiteboard = box(corner, "Whiteboard", wallX + 0.12, 3, midZ - 4, wallX + 0.32, 8, midZ + 4, WHITE)
	local rosterLabel = liveScreen(whiteboard, Enum.NormalId.Right, "roster", "QB\nRB\nWR\nOL\nDEF\nK", {
		TextColor3 = MARKER_BLUE,
		BackgroundColor3 = WHITE,
		BackgroundTransparency = 1,
		InsetX = 0.03,
		InsetY = 0.02,
		PixelsPerStud = 28,
	})
	rosterLabel.Size = UDim2.new(0.88, 0, 0.8, 0)
	rosterLabel.Position = UDim2.new(0.06, 0, 0.18, 0)
	local header = Instance.new("TextLabel")
	header.Name = "WhiteboardHeader"
	header.BackgroundTransparency = 1
	header.BorderSizePixel = 0
	header.Position = UDim2.new(0.06, 0, 0.03, 0)
	header.Size = UDim2.new(0.88, 0, 0.14, 0)
	header.Font = Enum.Font.GothamBlack
	header.Text = "GAME PLAN - TODAY'S STARTERS"
	header.TextColor3 = Color3.fromRGB(190, 30, 40)
	header.TextScaled = true
	header.Parent = rosterLabel.Parent
	BuildUtil.Look(
		whiteboard,
		"Coach's Whiteboard",
		"Today's starting lineup, in the coach's best handwriting. Train your players to raise their ratings!",
		{ LookKey = "rating", At = Vector3.new(1.6, -1, -3.7), Distance = 7 }
	)

	-- live screens: the game summary (south of the board), record + season (north of it)
	box(corner, "SummaryBezel", wallX, 5, 147.6, wallX + 0.3, 8.6, 153.2, SCREEN_BLACK)
	local summary =
		box(corner, "SummaryScreen", wallX + 0.3, 5.2, 147.8, wallX + 0.36, 8.4, 153, SCREEN_BLACK, Enum.Material.SmoothPlastic, PAINT)
	liveScreen(summary, Enum.NormalId.Right, "summary", name .. "\n0 - 0\nRECORD 0-0\nSEASON 1", { PixelsPerStud = 30 })
	box(corner, "RecordBezel", wallX, 5, 162.8, wallX + 0.3, 8.6, 168.4, SCREEN_BLACK)
	local record =
		box(corner, "RecordScreen", wallX + 0.3, 6.95, 163, wallX + 0.36, 8.4, 168.2, SCREEN_BLACK, Enum.Material.SmoothPlastic, PAINT)
	liveScreen(record, Enum.NormalId.Right, "record", "RECORD 0-0", { TextColor3 = LED_GREEN })
	local season =
		box(corner, "SeasonScreen", wallX + 0.3, 5.2, 163, wallX + 0.36, 6.75, 168.2, SCREEN_BLACK, Enum.Material.SmoothPlastic, PAINT)
	liveScreen(season, Enum.NormalId.Right, "season", "SEASON 1 - WEEK 1", { PixelsPerStud = 28 })

	-- the podium: the coach's (or your) pre-game speech; the camera watches from the benches
	local podium = box(corner, "Podium", PODIUM_X - 1.1, FLOOR_TOP, midZ - 1.5, PODIUM_X + 1.1, 4.1, midZ + 1.5, WOOD, Enum.Material.Wood)
	box(corner, "PodiumTop", PODIUM_X - 1.3, 4.1, midZ - 1.7, PODIUM_X + 1.3, 4.4, midZ + 1.7, shade(WOOD, 0.8), Enum.Material.Wood)
	local podiumFront = box(corner, "PodiumFront", PODIUM_X + 1.1, 1.2, midZ - 1.2, PODIUM_X + 1.22, 3.7, midZ + 1.2, team.Primary)
	sign(podiumFront, { Enum.NormalId.Right }, name, team.Primary, team, { InsetX = 0.08, InsetY = 0.3 })
	strut(
		corner,
		"PodiumMic",
		Vector3.new(PODIUM_X + 0.4, 4.4, midZ),
		Vector3.new(PODIUM_X - 0.3, 5.2, midZ),
		0.12,
		INK,
		Enum.Material.Metal
	)
	BuildUtil.Use(corner, podium, "podium", {
		Object = "Podium",
		Title = "Pre-Game Speech",
		Info = "Fire up the team before kickoff! Pick the best lines and your players run out ready to win.",
		At = Vector3.new(-1.9, 1.8, 0), -- on the speaker's side
		Distance = 7,
		Camera = { From = Vector3.new(73, 6.2, midZ + 0.5), To = SPEAKER_HEAD, Fov = 28 },
	})

	-- the team logo on the carpet (reads from the benches, +X). Locker room rule: don't step on it!
	local logoX, logoD = 60.5, 11
	BuildUtil.Cylinder(corner, {
		Name = "LogoRing",
		Position = Vector3.new(logoX, FLOOR_TOP + 0.02, midZ),
		Height = 0.04,
		Diameter = logoD,
		Axis = "Y",
		Color = team.Secondary,
		CanCollide = false,
		CastShadow = false,
	})
	BuildUtil.Cylinder(corner, {
		Name = "LogoDisc",
		Position = Vector3.new(logoX, FLOOR_TOP + 0.04, midZ),
		Height = 0.08,
		Diameter = logoD - 1.6,
		Axis = "Y",
		Color = team.Primary,
		CanCollide = false,
		CastShadow = false,
	})
	local logoName = BuildUtil.Part(corner, {
		Name = "LogoName",
		Size = Vector3.new(logoD * 0.72, 0.02, logoD * 0.3),
		CFrame = CFrame.new(logoX, FLOOR_TOP + 0.1, midZ) * CFrame.Angles(0, math.pi / 2, 0),
		Transparency = 1,
		CanCollide = false,
		CastShadow = false,
	})
	sign(logoName, { Enum.NormalId.Top }, name, team.Primary, team, { InsetX = 0.02, InsetY = 0.05, PixelsPerStud = 12 })
	BuildUtil.Look(
		logoName,
		"Team Logo",
		"Your team's logo, right in the middle of the locker room. Team rule: nobody steps on the logo!",
		{ LookKey = "team", At = Vector3.new(0, 3, 0), Distance = 8 }
	)

	-- sports-drink cooler with a cup dispenser in the south-west corner (under the summary screen)
	local coolerX, coolerZ = wallX + 2, 150
	local cooler = BuildUtil.Cylinder(corner, {
		Name = "Cooler",
		Position = Vector3.new(coolerX, FLOOR_TOP + 1.7, coolerZ),
		Height = 3.4,
		Diameter = 2.2,
		Axis = "Y",
		Color = COOLER_ORANGE,
	})
	BuildUtil.Cylinder(corner, {
		Name = "CoolerLid",
		Position = Vector3.new(coolerX, FLOOR_TOP + 3.6, coolerZ),
		Height = 0.4,
		Diameter = 2.3,
		Axis = "Y",
		Color = WHITE,
	})
	BuildUtil.Use(corner, cooler, "sportsdrink", {
		Object = "Sports Drink Cooler",
		Title = "Sports Drink Cooler",
		Info = "Ice-cold and full of electrolytes. Grab a cup - every player hydrates before the big game!",
		Distance = 8,
	})

	-- trophy shelf on the south wall of the coach's corner (lights up with your championships)
	local shelfX0, shelfX1 = 53.5, 62.5
	local backing = box(corner, "TrophyBacking", shelfX0, 3.2, z0 + 1, shelfX1, 8.8, z0 + 1.15, team.Secondary)
	local title = sign(backing, { Enum.NormalId.Back }, "CHAMPIONS", team.Secondary, team)
	title.Size = UDim2.new(0.8, 0, 0.16, 0) -- a header strip above the trophies
	title.Position = UDim2.new(0.1, 0, 0.03, 0)
	local shelf = box(corner, "TrophyShelf", shelfX0 + 0.2, 4.5, z0 + 1.15, shelfX1 - 0.2, 4.8, z0 + 2.3, WOOD, Enum.Material.Wood, DECOR)
	for i, tx in ipairs({ 55.5, 58, 60.5 }) do
		local size = i == 2 and 1.3 or 1
		BuildUtil.Cylinder(corner, {
			Name = "TrophyBase",
			Position = Vector3.new(tx, 5.05, z0 + 1.75),
			Height = 0.5,
			Diameter = 0.9,
			Axis = "Y",
			Color = INK,
			CanCollide = false,
		})
		BuildUtil.Ball(corner, {
			Name = "TrophyCup",
			Position = Vector3.new(tx, 5.3 + size * 0.75, z0 + 1.75),
			Diameter = size * 1.5,
			Color = GOLD,
			Material = Enum.Material.Metal,
			Reflectance = 0.2,
			CanCollide = false,
		})
	end
	BuildUtil.Look(
		shelf,
		"Trophy Shelf",
		"Every championship your team wins earns a spot up here. Plenty of room for more!",
		{ LookKey = "titles", At = Vector3.new(0, -0.4, 0.8), Distance = 8 }
	)

	-- players slap this sign over the doors on their way out to the field
	local slap = box(corner, "LuckySign", door.MinX + 0.4, 9.75, z1 - 1.15, door.MaxX - 0.4, 11.6, z1 - 1, team.Secondary)
	sign(slap, { Enum.NormalId.Front }, "BELIEVE. FIGHT. WIN.", team.Secondary, team, { InsetX = 0.05, InsetY = 0.14 })
	BuildUtil.Look(
		slap,
		"Lucky Sign",
		"Team tradition: every player jumps up and slaps this sign on the way out to the field. Don't forget yours!",
		{ At = Vector3.new(0, -5.5, -3.2), Distance = 7 } -- shows just inside the doors
	)
	-- motto banner over the shower archway, facing the benches
	local banner = box(corner, "MottoBanner", SHOWER_X - 0.15, sd.Top + 0.3, 149, SHOWER_X, 11.6, 167, team.Primary, Enum.Material.Fabric)
	sign(banner, { Enum.NormalId.Left }, "LEAVE IT ALL ON THE FIELD", team.Primary, team, { InsetX = 0.04, InsetY = 0.14 })
end

---------------------------------------------------------------------------------------------
-- Visitor Locker Room (plaza, entrance facing the front walkway)
---------------------------------------------------------------------------------------------

function StadiumRooms.visitor_lockerroom(ctx)
	local C = ctx.config.Colors
	local team = ctx.colors
	local x0, x1, z0, z1 = VISITOR.MinX, VISITOR.MaxX, VISITOR.MinZ, VISITOR.MaxZ
	local H, ceil = VISITOR_H, VISITOR_CEILING
	local door, win = VISITOR_DOOR, VISITOR_WINDOW
	local midZ = (z0 + z1) / 2
	local wallMat = Enum.Material.Concrete

	-- Step 1: Building -----------------------------------------------------------------------
	BuildUtil.Stage(ctx, 1)
	local shell = BuildUtil.Child(ctx, "Building")
	box(shell, "Floor", x0 + 0.05, 0, z0 + 0.05, x1 - 0.05, FLOOR_TOP, z1 - 0.05, VISITOR_FLOOR, Enum.Material.Concrete)
	box(shell, "SouthWall", x0, 0, z0, x1, H, z0 + 1, VISITOR_WALL, wallMat)
	box(shell, "NorthWall", x0, 0, z1 - 1, x1, H, z1, VISITOR_WALL, wallMat)
	box(shell, "WestWall", x0, 0, z0 + 1, x0 + 1, H, z1 - 1, VISITOR_WALL, wallMat)
	-- east wall (the front): a window to the south, the door to the north
	local ex = x1 - 1
	box(shell, "EastWall", ex, 0, z0 + 1, x1, H, win.MinZ, VISITOR_WALL, wallMat)
	box(shell, "WindowSill", ex, 0, win.MinZ, x1, win.Bottom, win.MaxZ, VISITOR_WALL, wallMat)
	box(
		shell,
		"Window",
		ex + 0.35,
		win.Bottom,
		win.MinZ,
		x1 - 0.35,
		door.Top,
		win.MaxZ,
		C.Glass,
		Enum.Material.Glass,
		{ Transparency = 0.4 }
	)
	local mz = (win.MinZ + win.MaxZ) / 2
	box(shell, "Mullion", ex + 0.2, win.Bottom, mz - 0.15, x1 - 0.2, door.Top, mz + 0.15, DARK_METAL, Enum.Material.Metal)
	box(shell, "EastWall", ex, 0, win.MaxZ, x1, door.Top, door.MinZ, VISITOR_WALL, wallMat)
	box(shell, "EastWall", ex, 0, door.MaxZ, x1, H, z1 - 1, VISITOR_WALL, wallMat)
	box(shell, "EastLintel", ex, door.Top, win.MinZ, x1, H, door.MaxZ, VISITOR_WALL, wallMat)
	box(shell, "RoofBand", x0 - 0.3, H, z0 - 0.3, x1 + 0.3, H + 1.4, z1 + 0.3, VISITOR_BAND)
	box(shell, "Roof", x0 - 0.6, H + 1.4, z0 - 0.6, x1 + 0.6, H + 2, z1 + 0.6, C.ConcreteDark, Enum.Material.Concrete)
	box(shell, "Ceiling", x0 + 1, ceil, z0 + 1, x1 - 1, ceil + 0.2, z1 - 1, CEILING)
	ceilingLight(shell, -42, midZ, 5, 2.4, ceil, 20, 1.1)
	ceilingLight(shell, -30, midZ, 5, 2.4, ceil, 20, 1.1)

	-- outside: step, VISITORS sign over the door + window, AWAY TEAM plaque (look)
	local doorMid = (door.MinZ + door.MaxZ) / 2
	box(shell, "FrontStep", x1, 0, door.MinZ - 0.8, x1 + 1.6, FLOOR_TOP, door.MaxZ + 0.8, C.Concrete, Enum.Material.Concrete)
	local board = box(shell, "Sign", x1, door.Top + 0.15, win.MinZ, x1 + 0.4, H - 0.15, door.MaxZ, VISITOR_SIGN)
	sign(board, { Enum.NormalId.Right }, "VISITORS", VISITOR_SIGN, team, { TextColor3 = WHITE, InsetX = 0.08, InsetY = 0.12 })
	local plaque = box(shell, "Plaque", x1, 3.4, win.MaxZ + 0.8, x1 + 0.15, 4.9, door.MinZ - 0.8, WHITE)
	sign(plaque, { Enum.NormalId.Right }, "AWAY\nTEAM", WHITE, team, { TextColor3 = VISITOR_SIGN, InsetX = 0.1, InsetY = 0.15 })
	BuildUtil.Look(
		plaque,
		"Visitor Locker Room",
		"The visitors' locker room - smaller on purpose! Squeaky benches, warm drinks and no Wi-Fi keep the away team from getting comfortable.",
		{ At = Vector3.new(0.8, 0, 0), Distance = 8 }
	)

	local doorH = door.Top - FLOOR_TOP - 0.1
	BuildUtil.Door(shell, {
		Name = "EntranceDoor",
		Size = Vector3.new(door.MaxZ - door.MinZ, doorH, 0.35),
		-- the door's X runs south (its hinge on the north jamb), it swings in (toward -X)
		CFrame = CFrame.new(x1 - 0.5, FLOOR_TOP + 0.05 + doorH / 2, doorMid) * CFrame.Angles(0, math.pi / 2, 0),
		Hinge = "Left",
		Window = true,
		Color = LOCKER_GREY_DARK,
		Material = Enum.Material.Metal,
		Object = "Visitors' Door",
		Title = "Visitor Locker Room",
		Info = "Where the away team gets ready. Squeaky, dusty and a little too cozy.",
		Distance = 8,
	})

	-- Step 2: Lockers ------------------------------------------------------------------------
	-- plain grey open stalls with white away jerseys: four on the west wall, four on the south
	BuildUtil.Stage(ctx, 2)
	local lockerH, lockerD = 8, 2.6
	local stallOpts = {
		Height = lockerH,
		Depth = lockerD,
		Stalls = 4,
		BackColor = LOCKER_GREY_DARK,
		FrameColor = LOCKER_GREY,
		ShelfColor = LOCKER_GREY_MID,
		SeatColor = LOCKER_GREY_MID,
		JerseyColor = WHITE,
		NumberColor = AWAY_NUMBER,
		Names = AWAY_NAMES,
		HelmetEvery = 2,
		HelmetColor = AWAY_HELMET,
		Looks = AWAY_STALL_INFO,
		Team = team,
	}
	local west = table.clone(stallOpts)
	west.Name, west.First, west.Length = "WestLockers", 1, 15.2
	openStalls(ctx, CFrame.new(x0 + 1, FLOOR_TOP, midZ) * CFrame.Angles(0, -math.pi / 2, 0), west)
	local south = table.clone(stallOpts)
	south.Name, south.First, south.Length = "SouthLockers", 5, 14.4
	openStalls(ctx, CFrame.new(-39, FLOOR_TOP, z0 + 1) * CFrame.Angles(0, math.pi, 0), south)

	-- Step 3: Bench & Signs ------------------------------------------------------------------
	BuildUtil.Stage(ctx, 3)
	local stuff = BuildUtil.Child(ctx, "BenchAndSigns")

	-- one squeaky bench in the middle; sitters face the old TV on the north wall. It leaves >= 4
	-- studs to the west + south stalls and to the TV cart, so players can walk all the way round.
	local benchX, benchZ = -38.3, -109.3
	box(
		stuff,
		"BenchFrame",
		benchX - 3.9,
		FLOOR_TOP,
		benchZ - 0.5,
		benchX + 3.9,
		FLOOR_TOP + 1.2,
		benchZ + 0.5,
		DARK_METAL,
		Enum.Material.Metal
	)
	for i = -1, 1 do
		BuildUtil.Seat(stuff, {
			Name = "BenchSeat",
			Size = Vector3.new(2.55, 0.5, 1.8),
			CFrame = CFrame.new(benchX + i * 2.6, FLOOR_TOP + 1.45, benchZ) * CFrame.Angles(0, math.pi, 0),
			Color = LOCKER_GREY_MID,
			Material = Enum.Material.WoodPlanks,
			Object = "Squeaky Bench",
			NoPrompt = i ~= 0,
		})
	end
	box(
		stuff,
		"DuffelBag",
		benchX + 4.6,
		FLOOR_TOP,
		benchZ - 1.3,
		benchX + 6,
		FLOOR_TOP + 1.1,
		benchZ + 1.3,
		DUFFEL_GREY,
		Enum.Material.Fabric
	)
	box(
		stuff,
		"Towel",
		benchX + 3.9,
		FLOOR_TOP + 0.5,
		benchZ - 0.55,
		benchX + 4,
		FLOOR_TOP + 1.25,
		benchZ + 0.55,
		WHITE,
		Enum.Material.Fabric,
		PAINT
	)

	-- an old CRT TV on an AV cart against the north wall: it shows the live score (bunny ears and all)
	local tvX, tvZ = benchX, z1 - 2.2
	box(stuff, "AVCart", tvX - 1.4, FLOOR_TOP, tvZ - 1.2, tvX + 1.4, FLOOR_TOP + 2.6, tvZ + 1.2, DARK_METAL, Enum.Material.Metal)
	local crtBottom = FLOOR_TOP + 2.6
	local crt = box(stuff, "CRT", tvX - 1.5, crtBottom, tvZ - 1.1, tvX + 1.5, crtBottom + 2.4, tvZ + 1.1, CRT_BEIGE)
	local crtScreen = box(
		stuff,
		"CRTScreen",
		tvX - 1.15,
		crtBottom + 0.3,
		tvZ - 1.18,
		tvX + 1.15,
		crtBottom + 2.1,
		tvZ - 1.1,
		SCREEN_BLACK,
		Enum.Material.SmoothPlastic,
		PAINT
	)
	liveScreen(crtScreen, Enum.NormalId.Front, "score", "HOME 0 - 0 VISITORS", { TextColor3 = LED_GREEN, PixelsPerStud = 30 })
	for _, s in ipairs({ -1, 1 }) do
		local base = Vector3.new(tvX, crtBottom + 2.4, tvZ + 0.3)
		strut(stuff, "BunnyEar", base, base + Vector3.new(s * 0.8, 1.5, 0.3), 0.06, DARK_METAL, Enum.Material.Metal)
	end
	BuildUtil.Look(
		crt,
		"Old TV",
		"An ancient TV on a wobbly cart. It only gets one channel: the score of today's game.",
		{ At = Vector3.new(0, -0.6, -1.6), Distance = 7 }
	)

	-- a cooler of lukewarm soda, a bin beside it (clear of the door's swing) and a sad WI-FI sign
	local cx, cz = -33, z1 - 2
	local coolerBox = box(stuff, "SodaCooler", cx - 1.2, FLOOR_TOP, cz - 0.9, cx + 1.2, FLOOR_TOP + 1.8, cz + 0.9, COOLER_BLUE)
	box(stuff, "SodaCoolerLid", cx - 1.3, FLOOR_TOP + 1.8, cz - 1, cx + 1.3, FLOOR_TOP + 2.1, cz + 1, WHITE)
	BuildUtil.Use(stuff, coolerBox, "soda", {
		Object = "Soda Cooler",
		Title = "Lukewarm Soda Cooler",
		Info = "The ice melted hours ago. The home team says that's 'just how it works'.",
		Distance = 8,
	})
	BuildUtil.Cylinder(stuff, {
		Name = "Bin",
		Position = Vector3.new(cx + 3, FLOOR_TOP + 1.3, cz),
		Height = 2.6,
		Diameter = 1.6,
		Axis = "Y",
		Color = DARK_METAL,
		Material = Enum.Material.Metal,
	})
	local wifi = box(stuff, "WifiSign", cx - 1.8, 5.8, z1 - 1.2, cx + 1.8, 7.2, z1 - 1, WHITE)
	sign(wifi, { Enum.NormalId.Front }, "WI-FI: NONE", WHITE, team, { TextColor3 = INK })
	-- the visitors' whole game plan, on a small whiteboard in the north-west corner
	local plan = box(stuff, "PlanBoard", -46.2, 4.2, z1 - 1.15, -42.2, 7.2, z1 - 1, WHITE)
	sign(plan, { Enum.NormalId.Front }, "GAME PLAN:\nTRY NOT TO LOSE\nBY TOO MUCH", WHITE, team, {
		TextColor3 = MARKER_BLUE,
		Font = Enum.Font.GothamBold,
		InsetX = 0.08,
		InsetY = 0.12,
	})
	BuildUtil.Look(
		plan,
		"Visitors' Game Plan",
		"Their whole game plan, scribbled in a hurry: 'Try not to lose by too much.' Good luck with that!",
		{ At = Vector3.new(0, -0.8, -1.2), Distance = 7 }
	)

	-- the roof leaks: a stain on the ceiling, a falling drip, a bucket and a wet floor sign
	local leakX, leakZ = -27, -113.5
	BuildUtil.Cylinder(stuff, {
		Name = "CeilingStain",
		Position = Vector3.new(leakX, ceil - 0.03, leakZ),
		Height = 0.06,
		Diameter = 3,
		Axis = "Y",
		Color = STAIN_BROWN,
		CanCollide = false,
		CastShadow = false,
	})
	BuildUtil.Ball(stuff, {
		Name = "Drip",
		Position = Vector3.new(leakX, 5.4, leakZ),
		Diameter = 0.3,
		Color = WATER_BLUE,
		Material = Enum.Material.Glass,
		Transparency = 0.2,
		CanCollide = false,
		CastShadow = false,
	})
	local bucket = BuildUtil.Cylinder(stuff, {
		Name = "Bucket",
		Position = Vector3.new(leakX, FLOOR_TOP + 0.7, leakZ),
		Height = 1.4,
		Diameter = 1.4,
		Axis = "Y",
		Color = BUCKET_BLUE,
	})
	BuildUtil.Cylinder(stuff, {
		Name = "BucketWater",
		Position = Vector3.new(leakX, FLOOR_TOP + 1.25, leakZ),
		Height = 0.2,
		Diameter = 1.5,
		Axis = "Y",
		Color = WATER_BLUE,
		Material = Enum.Material.Glass,
		Transparency = 0.3,
		CanCollide = false,
	})
	BuildUtil.Look(
		bucket,
		"Leaky Roof",
		"Drip... drip... drip. The home team promises they'll fix it 'next season'.",
		{ At = Vector3.new(1.2, 0, 0), Distance = 7 } -- (cylinder space: local X is up)
	)
	local signX, signZ = leakX - 1.6, leakZ + 2
	for _, s in ipairs({ -1, 1 }) do
		local panel = BuildUtil.Part(stuff, {
			Name = "WetFloorSign",
			Size = Vector3.new(1.2, 2, 0.08),
			CFrame = CFrame.new(signX, FLOOR_TOP + 0.98, signZ + s * 0.21) * CFrame.Angles(-s * math.rad(12), 0, 0),
			Color = CAUTION_YELLOW,
			CanCollide = false,
		})
		sign(
			panel,
			{ s < 0 and Enum.NormalId.Front or Enum.NormalId.Back },
			"CAUTION\nWET\nFLOOR",
			CAUTION_YELLOW,
			team,
			{ TextColor3 = INK, InsetX = 0.1, InsetY = 0.12 }
		)
	end

	-- a VISITORS mat inside the door (reads from the door, +X) and not-so-welcoming signs
	local mat = BuildUtil.Part(stuff, {
		Name = "VisitorMat",
		Size = Vector3.new(door.MaxZ - door.MinZ - 0.4, 0.04, 3.4),
		CFrame = CFrame.new(x1 - 3, FLOOR_TOP + 0.02, doorMid) * CFrame.Angles(0, math.pi / 2, 0),
		Color = LOCKER_GREY_DARK,
		Material = Enum.Material.Fabric,
		CanCollide = false,
		CastShadow = false,
	})
	sign(
		mat,
		{ Enum.NormalId.Top },
		"VISITORS",
		LOCKER_GREY_DARK,
		team,
		{ TextColor3 = WHITE, InsetX = 0.06, InsetY = 0.15, PixelsPerStud = 12 }
	)
	local hotWater = box(stuff, "HotWaterSign", x0 + 1, lockerH + 0.6, midZ - 4.5, x0 + 1.2, lockerH + 1.6, midZ + 4.5, WHITE)
	sign(hotWater, { Enum.NormalId.Right }, "HOT WATER: OUT OF ORDER", WHITE, team, { TextColor3 = Color3.fromRGB(190, 30, 30) })
	local goodLuck = box(stuff, "GoodLuckSign", ex - 0.2, door.Top + 0.1, door.MinZ, ex, ceil - 0.1, door.MaxZ, VISITOR_SIGN)
	sign(goodLuck, { Enum.NormalId.Left }, "GOOD LUCK. YOU'LL NEED IT.", VISITOR_SIGN, team, { TextColor3 = WHITE, InsetY = 0.16 })
end

return StadiumRooms
