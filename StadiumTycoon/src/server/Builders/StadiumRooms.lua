--[[
	StadiumRooms
	The two game-day locker rooms beside the players' tunnels.

	  home_lockerroom     behind the home stands, east of the back walk (X[-12, 12]) that runs
	                      from the home tunnel to the campus road. Entrance, window and the
	                      HOME LOCKER ROOM sign face the back walk (-X); the team name faces the
	                      campus road (+Z) under a strip of clerestory windows. Inside: a U of
	                      team-colour lockers with home jerseys and helmets, the team logo on the
	                      carpet, the coach's whiteboard, a sports-drink cooler and a banner.
	  visitor_lockerroom  in the plaza beside the front tunnel / walkway. Entrance, window and the
	                      VISITORS sign face the walkway (+X). Plain grey inside: grey lockers with
	                      white away jerseys, one bench, a painted VISITORS mat and a bin.

	Both rooms share one shell (roomShell) built in a local frame whose -Z points out of the
	front wall, so the same code faces -X (home) or +X (visitors). Lockers are open stalls
	(lockerBank): back panel, seat, top shelf, dividers and a jersey with a number in each stall.
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)

local StadiumRooms = {}

-- Reserved footprints (plot-local studs; Config.Layout has no values for these)
local HOME_ROOM = { MinX = 45, MaxX = 110, MinZ = 146, MaxZ = 170 }
local VISITOR_ROOM = { MinX = -52, MaxX = -20, MinZ = -120, MaxZ = -98 }

local FLOOR_TOP = 0.3

local PAINT = { CanCollide = false, CastShadow = false }

local WHITE = Color3.fromRGB(248, 248, 248)
local INK = Color3.fromRGB(22, 22, 26)
local DARK_METAL = Color3.fromRGB(62, 64, 70)
local WARM_LIGHT = Color3.fromRGB(255, 236, 200)
local LAMP = Color3.fromRGB(255, 248, 232)
local CEILING = Color3.fromRGB(226, 226, 222)

local HOME_WALL = Color3.fromRGB(178, 180, 186)
local HOME_CARPET = Color3.fromRGB(50, 52, 60)
local COOLER_ORANGE = Color3.fromRGB(255, 120, 20)
local LOCKER_LIT = Color3.fromRGB(214, 218, 226)

local VISITOR_WALL = Color3.fromRGB(150, 150, 156)
local VISITOR_BAND = Color3.fromRGB(92, 94, 102)
local VISITOR_FLOOR = Color3.fromRGB(128, 128, 132)
local VISITOR_SIGN = Color3.fromRGB(60, 62, 70)
local LOCKER_GREY = Color3.fromRGB(150, 152, 158)
local LOCKER_GREY_DARK = Color3.fromRGB(92, 94, 100)
local LOCKER_GREY_MID = Color3.fromRGB(118, 120, 126)
local AWAY_NUMBER = Color3.fromRGB(70, 72, 80)

local HOME_NUMBERS = { "1", "12", "23", "34", "45", "56", "67", "78", "89", "10", "21", "32" }
local AWAY_NUMBERS = { "2", "14", "27", "38", "50", "61", "73", "84", "95", "11" }

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

--[[
	Writes `text` on each face in `faces` of `part`, coloured to read well on `background`.
	opts: TextColor3, Font, PixelsPerStud, InsetX / InsetY (fraction of the face left empty
	      around the text, default 0.06 / 0.12)
]]
local function sign(part, faces, text, background, team, opts)
	opts = opts or {}
	local color = opts.TextColor3 or textColorOn(background, { team.Trim, team.Primary, team.Secondary })
	local insetX = opts.InsetX or 0.06
	local insetY = opts.InsetY or 0.12
	for _, face in ipairs(faces) do
		local _, label = BuildUtil.SurfaceText(part, face, text, {
			LabelName = part.Name .. face.Name,
			TextColor3 = color,
			Font = opts.Font or Enum.Font.GothamBlack,
			PixelsPerStud = opts.PixelsPerStud or 20,
		})
		label.Size = UDim2.new(1 - 2 * insetX, 0, 1 - 2 * insetY, 0)
		label.Position = UDim2.new(insetX, 0, insetY, 0)
	end
end

local function shade(color, factor)
	return Color3.new(math.clamp(color.R * factor, 0, 1), math.clamp(color.G * factor, 0, 1), math.clamp(color.B * factor, 0, 1))
end

-- Block in a local `frame`: bottom at local height y0, centred on local (x, z).
local function lblock(ctx, frame, name, size, x, y0, z, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Size = size
	props.CFrame = frame * CFrame.new(x, y0 + size.Y / 2, z)
	props.Color = color
	props.Material = material
	return BuildUtil.Part(ctx, props)
end

--[[
	One-storey room shell. `frame` is a plot-local CFrame at ground level in the middle of the
	front wall's OUTER face, its LookVector pointing out of the building (so every part's Front
	face is the entrance side). The room spans local x in [-Width/2, Width/2], z in [0, Depth].
	o: Width, Depth, WallH, Thickness, WallColor, WallMaterial, FloorColor, FloorMaterial,
	   OpeningTop, Openings = { { From, To, Bottom, Mullions } } (local x, sorted; Bottom = 0 is
	   an open doorway, otherwise a window with a sill), BandColor, BandH, RoofColor,
	   Clerestory = { Side = -1 | 1, Bottom, Mullions } (that side wall gets a glass strip on top)
]]
local function roomShell(ctx, frame, o)
	local C = ctx.config.Colors
	local W, D, H = o.Width, o.Depth, o.WallH
	local t = o.Thickness or 1
	local top = o.OpeningTop
	local wallColor, wallMaterial = o.WallColor, o.WallMaterial
	local glassProps = { Transparency = 0.4 }

	-- the floor stops 0.05 inside the outer wall faces so its edges never share their plane
	lblock(ctx, frame, "Floor", Vector3.new(W - 0.1, FLOOR_TOP, D - 0.1), 0, 0, D / 2, o.FloorColor, o.FloorMaterial)
	lblock(ctx, frame, "BackWall", Vector3.new(W, H, t), 0, 0, D - t / 2, wallColor, wallMaterial)
	for _, s in ipairs({ -1, 1 }) do
		local wallX = s * (W / 2 - t / 2)
		local clerestory = o.Clerestory
		if clerestory and clerestory.Side == s then
			local glassH = H - clerestory.Bottom
			lblock(ctx, frame, "SideWall", Vector3.new(t, clerestory.Bottom, D - 2 * t), wallX, 0, D / 2, wallColor, wallMaterial)
			lblock(
				ctx,
				frame,
				"Clerestory",
				Vector3.new(0.3, glassH, D - 2 * t),
				wallX,
				clerestory.Bottom,
				D / 2,
				C.Glass,
				Enum.Material.Glass,
				glassProps
			)
			local n = clerestory.Mullions or 0
			for m = 1, n do
				lblock(
					ctx,
					frame,
					"ClerestoryMullion",
					Vector3.new(t * 0.6, glassH, 0.3),
					wallX,
					clerestory.Bottom,
					t + m * (D - 2 * t) / (n + 1),
					DARK_METAL,
					Enum.Material.Metal
				)
			end
		else
			lblock(ctx, frame, "SideWall", Vector3.new(t, H, D - 2 * t), wallX, 0, D / 2, wallColor, wallMaterial)
		end
	end

	-- front wall: a lintel over all openings, piers between them, sill + glass under each window
	lblock(ctx, frame, "Lintel", Vector3.new(W, H - top, t), 0, top, t / 2, wallColor, wallMaterial)
	local function pier(a, b)
		if b - a > 0.01 then
			lblock(ctx, frame, "Pier", Vector3.new(b - a, top, t), (a + b) / 2, 0, t / 2, wallColor, wallMaterial)
		end
	end
	local x = -W / 2
	for _, op in ipairs(o.Openings) do
		pier(x, op.From)
		local w = op.To - op.From
		local mid = (op.From + op.To) / 2
		if op.Bottom > 0 then
			lblock(ctx, frame, "Sill", Vector3.new(w, op.Bottom, t), mid, 0, t / 2, wallColor, wallMaterial)
			lblock(
				ctx,
				frame,
				"Window",
				Vector3.new(w, top - op.Bottom, 0.3),
				mid,
				op.Bottom,
				t / 2,
				C.Glass,
				Enum.Material.Glass,
				glassProps
			)
			local n = op.Mullions or 0
			for m = 1, n do
				lblock(
					ctx,
					frame,
					"Mullion",
					Vector3.new(0.3, top - op.Bottom, t * 0.6),
					op.From + m * w / (n + 1),
					op.Bottom,
					t / 2,
					DARK_METAL,
					Enum.Material.Metal
				)
			end
		end
		x = op.To
	end
	pier(x, W / 2)

	-- roof: coloured band (also the ceiling inside), concrete cap, one big ceiling light
	local bandH = o.BandH or 1.6
	local band = lblock(ctx, frame, "RoofBand", Vector3.new(W + 0.6, bandH, D + 0.6), 0, H, D / 2, o.BandColor, Enum.Material.SmoothPlastic)
	lblock(
		ctx,
		frame,
		"Roof",
		Vector3.new(W + 1.2, 0.6, D + 1.2),
		0,
		H + bandH,
		D / 2,
		o.RoofColor or C.ConcreteDark,
		Enum.Material.Concrete
	)
	-- a plain ceiling just under the band (so the room isn't roofed in team colour) + light panel
	lblock(ctx, frame, "Ceiling", Vector3.new(W - 2 * t, 0.2, D - 2 * t), 0, H - 0.25, D / 2, CEILING, Enum.Material.SmoothPlastic)
	local lamp = lblock(ctx, frame, "CeilingLight", Vector3.new(W * 0.4, 0.2, D * 0.3), 0, H - 0.45, D / 2, LAMP, Enum.Material.Neon, PAINT)
	BuildUtil.Light(
		lamp,
		"PointLight",
		{ Name = "RoomLight", Range = math.min(math.max(W, D) * 0.8, 60), Brightness = 1.3, Color = WARM_LIGHT }
	)
	return band
end

--[[
	A bank of open locker stalls against a wall. `frame` is a plot-local CFrame at floor level on
	the wall face in the middle of the bank, its LookVector pointing into the room.
	o: Name, Length, Stalls, Height, Depth, BackColor, BackMaterial, FrameColor, ShelfColor, SeatColor,
	   Jerseys (colours, cycled), Numbers (cycled), NumberColor, EndPanels, HelmetEvery,
	   HelmetColor, Team
]]
local function lockerBank(ctx, frame, o)
	local bank = BuildUtil.Child(ctx, o.Name)
	local n, len, H, D = o.Stalls, o.Length, o.Height, o.Depth
	local w = len / n
	local inner = D - 0.4 -- depth in front of the back panel
	lblock(bank, frame, "LockerBack", Vector3.new(len, H, 0.4), 0, 0, -0.2, o.BackColor, o.BackMaterial or Enum.Material.Wood)
	lblock(bank, frame, "LockerSeat", Vector3.new(len, 1.6, inner), 0, 0, -0.4 - inner / 2, o.SeatColor, Enum.Material.Fabric)
	lblock(
		bank,
		frame,
		"LockerShelf",
		Vector3.new(len, 1.2, inner),
		0,
		H - 1.2,
		-0.4 - inner / 2,
		o.ShelfColor,
		Enum.Material.SmoothPlastic
	)
	-- dividers stand 0.15 proud of the seat + shelf fronts and stop 0.1 under the shelf top;
	-- end panels poke 0.05 past the bank ends (no shared planes with the back/seat/shelf)
	local first, last = 1, n - 1
	if o.EndPanels then
		first, last = 0, n
	end
	for i = first, last do
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
	for i = 1, n do
		local x = -len / 2 + (i - 0.5) * w
		local color = o.Jerseys[(i - 1) % #o.Jerseys + 1]
		local jersey =
			lblock(bank, frame, "Jersey", Vector3.new(math.min(w - 1.4, 2.8), 3, 0.25), x, 3.3, -0.75, color, Enum.Material.Fabric)
		local number = o.Numbers[(i - 1) % #o.Numbers + 1]
		sign(jersey, { Enum.NormalId.Front }, number, color, o.Team, { InsetX = 0.22, InsetY = 0.18, TextColor3 = o.NumberColor })
		if o.HelmetEvery and i % o.HelmetEvery == 0 then
			BuildUtil.Ball(bank, {
				Name = "Helmet",
				CFrame = frame * CFrame.new(x, H + 0.85, -0.4 - inner / 2),
				Diameter = 1.7,
				Color = o.HelmetColor,
				Material = Enum.Material.SmoothPlastic,
				Reflectance = 0.1,
			})
		end
	end
end

---------------------------------------------------------------------------------------------
-- Home Locker Room (behind the home stands, entrance facing the back walk)
---------------------------------------------------------------------------------------------

function StadiumRooms.home_lockerroom(ctx)
	local C = ctx.config.Colors
	local team = ctx.colors
	local fp = HOME_ROOM

	-- Outer walls X[47, 108] Z[147, 169]; the roof overhang stays inside the footprint
	local minX, maxX = fp.MinX + 2, fp.MaxX - 2
	local minZ, maxZ = fp.MinZ + 1, fp.MaxZ - 1
	local cz = (minZ + maxZ) / 2
	local W, D = maxZ - minZ, maxX - minX
	-- local +Z (into the room) = world +X, local +X = world -Z, so local x = cz - world z
	local frame = CFrame.new(minX, 0, cz) * CFrame.Angles(0, math.pi / 2, 0)
	local H, top = 12, 8.5
	local doorMinZ, doorMaxZ = maxZ - 10.5, maxZ - 2.5 -- north end: clear of the press box (z <= 161)
	local windowMinZ, windowMaxZ = minZ + 2, doorMinZ - 2

	roomShell(ctx, frame, {
		Width = W,
		Depth = D,
		WallH = H,
		OpeningTop = top,
		WallColor = HOME_WALL,
		WallMaterial = Enum.Material.Concrete,
		FloorColor = HOME_CARPET,
		FloorMaterial = Enum.Material.Carpet,
		Openings = {
			{ From = cz - doorMaxZ, To = cz - doorMinZ, Bottom = 0 },
			{ From = cz - windowMaxZ, To = cz - windowMinZ, Bottom = 3, Mullions = 1 },
		},
		Clerestory = { Side = -1, Bottom = 9, Mullions = 3 }, -- the north wall (campus side)
		BandColor = team.Primary,
		BandH = 1.6,
	})

	-- Entrance: step, canopy and the HOME LOCKER ROOM sign (on a trim-coloured backing)
	local doorX = cz - (doorMinZ + doorMaxZ) / 2
	local doorW = doorMaxZ - doorMinZ
	lblock(ctx, frame, "FrontStep", Vector3.new(doorW + 2, FLOOR_TOP, 2), doorX, 0, -1, C.Concrete, Enum.Material.Concrete)
	lblock(ctx, frame, "DoorCanopy", Vector3.new(doorW + 3, 0.4, 2), doorX, top - 0.4, -1, team.Secondary, Enum.Material.SmoothPlastic)
	lblock(ctx, frame, "SignBacking", Vector3.new(W - 0.4, 3.2, 0.2), 0, top + 0.25, -0.1, team.Trim, Enum.Material.SmoothPlastic)
	local board = lblock(ctx, frame, "Sign", Vector3.new(W - 1, 2.6, 0.4), 0, top + 0.55, -0.4, team.Primary, Enum.Material.SmoothPlastic)
	sign(board, { Enum.NormalId.Front }, "HOME LOCKER ROOM", team.Primary, team, { InsetX = 0.03, InsetY = 0.1 })

	-- Team name on the north wall, facing the campus road (+Z)
	local nameX = (minX + maxX) / 2 + 3
	BuildUtil.Box(
		ctx,
		"NameBacking",
		Vector3.new(37, 4.4, 0.2),
		Vector3.new(nameX, 5.2, maxZ + 0.1),
		team.Secondary,
		Enum.Material.SmoothPlastic
	)
	local nameBoard = BuildUtil.Box(
		ctx,
		"NameBoard",
		Vector3.new(36, 3.6, 0.4),
		Vector3.new(nameX, 5.2, maxZ + 0.4),
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	sign(nameBoard, { Enum.NormalId.Back }, ctx.teamName, team.Primary, team, { InsetX = 0.04, InsetY = 0.1 })

	-- U of team lockers: north wall, south wall and the east end
	local innerMinX, innerMaxX = minX + 1, maxX - 1
	local innerMinZ, innerMaxZ = minZ + 1, maxZ - 1
	local lockerH, lockerD = 8.5, 2.8
	local bankMinX = innerMinX + 16 -- leaves an entry area by the door
	local bankLen = innerMaxX - bankMinX
	local bankX = (bankMinX + innerMaxX) / 2
	local function lockerOpts(name, length, stalls, extra)
		local o = {
			Name = name,
			Length = length,
			Stalls = stalls,
			Height = lockerH,
			Depth = lockerD,
			-- a light, "lit" back panel so the team-colour home jerseys stand out in every palette
			BackColor = LOCKER_LIT,
			BackMaterial = Enum.Material.SmoothPlastic,
			FrameColor = team.Primary,
			ShelfColor = team.Secondary,
			SeatColor = shade(team.Primary, 0.7),
			Jerseys = { team.Primary },
			Numbers = HOME_NUMBERS,
			HelmetColor = team.Primary,
			Team = team,
		}
		for k, v in pairs(extra or {}) do
			o[k] = v
		end
		return o
	end
	lockerBank(ctx, CFrame.new(bankX, FLOOR_TOP, innerMaxZ), lockerOpts("NorthLockers", bankLen, 8, { EndPanels = true, HelmetEvery = 2 }))
	lockerBank(
		ctx,
		CFrame.new(bankX, FLOOR_TOP, innerMinZ) * CFrame.Angles(0, math.pi, 0),
		lockerOpts("SouthLockers", bankLen, 8, { EndPanels = true, Numbers = { "99", "4", "15", "26", "37", "48", "59", "70" } })
	)
	local endLen = (innerMaxZ - lockerD) - (innerMinZ + lockerD)
	lockerBank(
		ctx,
		CFrame.new(innerMaxX, FLOOR_TOP, cz) * CFrame.Angles(0, math.pi / 2, 0),
		lockerOpts("EastLockers", endLen, 3, { Numbers = { "5", "17", "81" } })
	)
	local banner = BuildUtil.Box(
		ctx,
		"Banner",
		Vector3.new(0.2, 2.2, endLen + 2),
		Vector3.new(innerMaxX - 0.1, 10.6, cz),
		team.Secondary,
		Enum.Material.Fabric
	)
	sign(banner, { Enum.NormalId.Left }, "PROTECT THIS HOUSE", team.Secondary, team, { InsetX = 0.04, InsetY = 0.14 })

	-- Team logo on the carpet, reading from the door (-X)
	local logoX = (bankMinX + innerMaxX - lockerD) / 2
	local logoD = 12
	BuildUtil.Cylinder(ctx, {
		Name = "LogoRing",
		Position = Vector3.new(logoX, FLOOR_TOP + 0.02, cz),
		Height = 0.04,
		Diameter = logoD,
		Axis = "Y",
		Color = team.Secondary,
		Material = Enum.Material.SmoothPlastic,
		CanCollide = false,
		CastShadow = false,
	})
	BuildUtil.Cylinder(ctx, {
		Name = "LogoDisc",
		Position = Vector3.new(logoX, FLOOR_TOP + 0.04, cz),
		Height = 0.08,
		Diameter = logoD - 1.6,
		Axis = "Y",
		Color = team.Primary,
		Material = Enum.Material.SmoothPlastic,
		CanCollide = false,
		CastShadow = false,
	})
	local logoName = BuildUtil.Part(ctx, {
		Name = "LogoName",
		Size = Vector3.new(logoD * 0.72, 0.02, logoD * 0.3),
		CFrame = CFrame.new(logoX, FLOOR_TOP + 0.1, cz) * CFrame.Angles(0, -math.pi / 2, 0),
		Transparency = 1,
		CanCollide = false,
		CastShadow = false,
	})
	sign(logoName, { Enum.NormalId.Top }, ctx.teamName, team.Primary, team, { InsetX = 0.02, InsetY = 0.05, PixelsPerStud = 12 })

	-- Coach's whiteboard on the north wall of the entry area, facing into the room
	local boardX = innerMinX + 8
	local whiteboard = BuildUtil.Box(
		ctx,
		"Whiteboard",
		Vector3.new(10, 5, 0.2),
		Vector3.new(boardX, 5.6, innerMaxZ - 0.1),
		WHITE,
		Enum.Material.SmoothPlastic
	)
	BuildUtil.SurfaceText(whiteboard, Enum.NormalId.Front, "GAME PLAN\nX  X  X  X  X\nO    O    O\nWIN THE DAY!", {
		LabelName = "WhiteboardText",
		TextColor3 = Color3.fromRGB(30, 60, 160),
		Font = Enum.Font.GothamBold,
		PixelsPerStud = 20,
	})
	BuildUtil.Box(
		ctx,
		"MarkerTray",
		Vector3.new(10, 0.25, 0.5),
		Vector3.new(boardX, 2.95, innerMaxZ - 0.25),
		DARK_METAL,
		Enum.Material.Metal
	)

	-- Sports-drink cooler in the south-west corner (seen through the window)
	local coolerX, coolerZ = innerMinX + 2.5, innerMinZ + 2
	BuildUtil.Cylinder(ctx, {
		Name = "Cooler",
		Position = Vector3.new(coolerX, FLOOR_TOP + 1.8, coolerZ),
		Height = 3.6,
		Diameter = 2.2,
		Axis = "Y",
		Color = COOLER_ORANGE,
		Material = Enum.Material.SmoothPlastic,
	})
	BuildUtil.Cylinder(ctx, {
		Name = "CoolerLid",
		Position = Vector3.new(coolerX, FLOOR_TOP + 3.8, coolerZ),
		Height = 0.4,
		Diameter = 2.3,
		Axis = "Y",
		Color = WHITE,
		Material = Enum.Material.SmoothPlastic,
	})
end

---------------------------------------------------------------------------------------------
-- Visitor Locker Room (plaza, entrance facing the walkway)
---------------------------------------------------------------------------------------------

function StadiumRooms.visitor_lockerroom(ctx)
	local C = ctx.config.Colors
	local team = ctx.colors
	local fp = VISITOR_ROOM

	-- Outer walls X[-50, -22] Z[-118, -100]
	local minX, maxX = fp.MinX + 2, fp.MaxX - 2
	local minZ, maxZ = fp.MinZ + 2, fp.MaxZ - 2
	local cz = (minZ + maxZ) / 2
	local W, D = maxZ - minZ, maxX - minX
	-- local +Z (into the room) = world -X, local +X = world +Z, so local x = world z - cz
	local frame = CFrame.new(maxX, 0, cz) * CFrame.Angles(0, -math.pi / 2, 0)
	local H, top = 10.5, 8
	local doorFrom, doorTo = 2, 8 -- local x: the north part of the front (toward the tunnel)

	roomShell(ctx, frame, {
		Width = W,
		Depth = D,
		WallH = H,
		OpeningTop = top,
		WallColor = VISITOR_WALL,
		WallMaterial = Enum.Material.Concrete,
		FloorColor = VISITOR_FLOOR,
		FloorMaterial = Enum.Material.Concrete,
		Openings = {
			{ From = -W / 2 + 1, To = 0, Bottom = 3, Mullions = 1 },
			{ From = doorFrom, To = doorTo, Bottom = 0 },
		},
		BandColor = VISITOR_BAND,
		BandH = 1.4,
	})
	local doorX = (doorFrom + doorTo) / 2
	lblock(ctx, frame, "FrontStep", Vector3.new(doorTo - doorFrom + 2, FLOOR_TOP, 2), doorX, 0, -1, C.Concrete, Enum.Material.Concrete)
	local board = lblock(ctx, frame, "Sign", Vector3.new(15, 2.2, 0.4), 0, top + 0.15, -0.2, VISITOR_SIGN, Enum.Material.SmoothPlastic)
	sign(board, { Enum.NormalId.Front }, "VISITORS", VISITOR_SIGN, team, { TextColor3 = WHITE, InsetX = 0.08, InsetY = 0.12 })

	-- Plain grey U of lockers with white away jerseys
	local innerHalf = W / 2 - 1
	local innerDepth = D - 1 -- local z of the back wall's inner face
	local lockerH, lockerD = 8, 2.6
	local function lockerOpts(name, length, stalls, extra)
		local o = {
			Name = name,
			Length = length,
			Stalls = stalls,
			Height = lockerH,
			Depth = lockerD,
			BackColor = LOCKER_GREY_DARK,
			FrameColor = LOCKER_GREY,
			ShelfColor = LOCKER_GREY_MID,
			SeatColor = LOCKER_GREY_MID,
			Jerseys = { WHITE },
			Numbers = AWAY_NUMBERS,
			NumberColor = AWAY_NUMBER,
			Team = team,
		}
		for k, v in pairs(extra or {}) do
			o[k] = v
		end
		return o
	end
	local floorFrame = frame * CFrame.new(0, FLOOR_TOP, 0)
	lockerBank(ctx, floorFrame * CFrame.new(0, 0, innerDepth), lockerOpts("BackLockers", innerHalf * 2, 3))
	local sideStart, sideEnd = 7, innerDepth - lockerD
	local sideZ = (sideStart + sideEnd) / 2
	lockerBank(
		ctx,
		floorFrame * CFrame.new(-innerHalf, 0, sideZ) * CFrame.Angles(0, -math.pi / 2, 0),
		lockerOpts("SideLockers", sideEnd - sideStart, 4, { EndPanels = true })
	)
	lockerBank(
		ctx,
		floorFrame * CFrame.new(innerHalf, 0, sideZ) * CFrame.Angles(0, math.pi / 2, 0),
		lockerOpts("SideLockers", sideEnd - sideStart, 4, { EndPanels = true, Numbers = { "6", "19", "33", "42" } })
	)

	-- One plain bench, a painted VISITORS mat by the door, a bin
	local benchLen = sideEnd - sideStart - 4
	lblock(ctx, floorFrame, "BenchBase", Vector3.new(1, 1.2, benchLen - 2), 0, 0, sideZ, DARK_METAL, Enum.Material.Metal)
	lblock(ctx, floorFrame, "BenchSeat", Vector3.new(1.8, 0.5, benchLen), 0, 1.2, sideZ, LOCKER_GREY_MID, Enum.Material.WoodPlanks)
	local mat = BuildUtil.Part(ctx, {
		Name = "VisitorMat",
		Size = Vector3.new(doorTo - doorFrom, 0.04, 3.2),
		CFrame = floorFrame * CFrame.new(doorX, 0.02, 3.5) * CFrame.Angles(0, math.pi, 0),
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
	local bin = floorFrame * CFrame.new(-innerHalf + 1.2, 1.3, 2.2)
	BuildUtil.Cylinder(ctx, {
		Name = "Bin",
		Position = bin.Position,
		Height = 2.6,
		Diameter = 1.6,
		Axis = "Y",
		Color = DARK_METAL,
		Material = Enum.Material.Metal,
	})
end

return StadiumRooms
