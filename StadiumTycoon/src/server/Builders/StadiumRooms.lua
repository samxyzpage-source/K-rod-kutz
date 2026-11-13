--[[
	StadiumRooms
	The two game-day locker rooms beside the players' tunnels. Both are bought in three steps
	(see Items.lua); BuildUtil.Stage(ctx, n) marks the parts of step n.

	  home_lockerroom     behind the home stands, east of the back walk (X[-12, 12]) that runs
	                      from the home tunnel to the campus road. Entrance, window and the
	                      HOME LOCKER ROOM sign face the back walk (-X); the team name faces the
	                      campus road (+Z) under a strip of clerestory windows.
	                        1 Building            shell, door frame, lamps, signs outside
	                        2 Lockers             a U of team lockers: jerseys, nameplates, helmets
	                        3 Logo & Whiteboard   carpet logo, whiteboard, banner, TV, clock, cooler
	                                              and the PLAY LIKE A CHAMPION TODAY sign
	  visitor_lockerroom  in the plaza beside the front tunnel / walkway. Entrance, window and the
	                      VISITORS sign face the walkway (+X). Spartan on purpose.
	                        1 Building            shell, door frame, VISITORS sign
	                        2 Lockers             grey lockers with white away jerseys + helmets
	                        3 Bench & Signs       one bench, mat, bin, a CRT on an AV cart that shows
	                                              NO SIGNAL, a leaky ceiling + bucket and some
	                                              not-so-welcoming signs

	Both rooms share one shell (roomShell) built in a local frame whose -Z points out of the
	front wall, so the same code faces -X (home) or +X (visitors). Lockers are open stalls
	(lockerBank): back panel, seat, top shelf with nameplates, dividers and a numbered jersey.
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
local SCREEN_BLACK = Color3.fromRGB(14, 16, 22)
local SCREEN_BLUE = Color3.fromRGB(26, 52, 110)
local FACEMASK_GREY = Color3.fromRGB(80, 82, 90)

local HOME_WALL = Color3.fromRGB(178, 180, 186)
local HOME_CARPET = Color3.fromRGB(50, 52, 60)
local COOLER_ORANGE = Color3.fromRGB(255, 120, 20)
local LOCKER_LIT = Color3.fromRGB(214, 218, 226)
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
local STATIC_GREY = Color3.fromRGB(150, 156, 160)
local BUCKET_BLUE = Color3.fromRGB(60, 110, 170)
local WATER_BLUE = Color3.fromRGB(110, 170, 230)
local STAIN_BROWN = Color3.fromRGB(150, 122, 74)
local CAUTION_YELLOW = Color3.fromRGB(255, 208, 30)
local DUFFEL_GREY = Color3.fromRGB(70, 74, 82)

local HOME_NUMBERS = { "1", "12", "23", "34", "45", "56", "67", "78", "89", "10", "21", "32" }
local AWAY_NUMBERS = { "2", "14", "27", "38", "50", "61", "73", "84", "95", "11" }
local HOME_NAMES = { "CARTER", "BROOKS", "HAYES", "REED", "WALKER", "PRICE", "BELL", "COLE", "GRANT", "MILLS" }
local SOUTH_NAMES = { "ROSS", "HUNT", "FORD", "LANE", "WEST", "STONE", "KING", "WOODS" }
local AWAY_NAMES = { "VISITOR", "GUEST", "AWAY", "TBD", "ROOKIE", "BACKUP", "NEW GUY", "SUB" }

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

-- The owner's name, or a generic one while the plot has no name.
local function displayName(ctx)
	if ctx.teamName and ctx.teamName ~= "" then
		return ctx.teamName
	end
	return "HOME TEAM"
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
		else
			-- door frame: two jambs standing proud of the outer wall face
			for _, jx in ipairs({ op.From - 0.2, op.To + 0.2 }) do
				lblock(
					ctx,
					frame,
					"DoorJamb",
					Vector3.new(0.4, (o.JambTop or top) - FLOOR_TOP, 0.3),
					jx,
					FLOOR_TOP,
					-0.15,
					o.JambColor or DARK_METAL,
					Enum.Material.SmoothPlastic
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
	   Jerseys (colours, cycled), Numbers (cycled), NumberColor, Names (nameplates on the shelf,
	   cycled), EndPanels, HelmetEvery, HelmetColor, HelmetDiameter, StripeColor, FacemaskColor, Team
]]
local function lockerBank(ctx, frame, o)
	local bank = BuildUtil.Child(ctx, o.Name)
	local n, len, H, D = o.Stalls, o.Length, o.Height, o.Depth
	local w = len / n
	local inner = D - 0.4 -- depth in front of the back panel
	lblock(bank, frame, "LockerBack", Vector3.new(len, H, 0.4), 0, 0, -0.2, o.BackColor, o.BackMaterial or Enum.Material.Wood)
	lblock(bank, frame, "LockerSeat", Vector3.new(len, 1.6, inner), 0, 0, -0.4 - inner / 2, o.SeatColor, Enum.Material.Fabric)
	local shelf = lblock(
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

	-- nameplates: one GUI on the shelf front (its GUI x runs toward the bank's local -X)
	local plates
	if o.Names then
		plates = Instance.new("SurfaceGui")
		plates.Name = "NameplatesGui"
		plates.Face = Enum.NormalId.Front
		plates.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
		plates.PixelsPerStud = 24
		plates.LightInfluence = 1
		plates.Parent = shelf
	end
	local plateColor = textColorOn(o.ShelfColor, { o.Team.Trim, WHITE, INK })

	local hd = o.HelmetDiameter or 1.7
	local hz = -0.4 - inner / 2
	for i = 1, n do
		local x = -len / 2 + (i - 0.5) * w
		local color = o.Jerseys[(i - 1) % #o.Jerseys + 1]
		local jersey =
			lblock(bank, frame, "Jersey", Vector3.new(math.min(w - 1.4, 2.8), 3, 0.25), x, 3.3, -0.75, color, Enum.Material.Fabric)
		local number = o.Numbers[(i - 1) % #o.Numbers + 1]
		sign(jersey, { Enum.NormalId.Front }, number, color, o.Team, { InsetX = 0.22, InsetY = 0.18, TextColor3 = o.NumberColor })
		if plates then
			local plateW = w - 0.8
			local label = Instance.new("TextLabel")
			label.Name = "Nameplate"
			label.BackgroundTransparency = 1
			label.BorderSizePixel = 0
			label.Position = UDim2.new((len / 2 - x - plateW / 2) / len, 0, 0.22, 0)
			label.Size = UDim2.new(plateW / len, 0, 0.56, 0)
			label.Font = Enum.Font.GothamBold
			label.Text = o.Names[(i - 1) % #o.Names + 1]
			label.TextColor3 = plateColor
			label.TextScaled = true
			label.Parent = plates
		end
		if o.HelmetEvery and i % o.HelmetEvery == 0 then
			BuildUtil.Ball(bank, {
				Name = "Helmet",
				CFrame = frame * CFrame.new(x, H + hd / 2, hz),
				Diameter = hd,
				Color = o.HelmetColor,
				Material = Enum.Material.SmoothPlastic,
				Reflectance = 0.1,
			})
			if o.StripeColor then
				-- a thin disk across the crown, front to back (cylinder axis = the bank's local X)
				BuildUtil.Part(bank, {
					Name = "HelmetStripe",
					Shape = Enum.PartType.Cylinder,
					Size = Vector3.new(0.26, hd + 0.04, hd + 0.04),
					CFrame = frame * CFrame.new(x, H + hd / 2, hz),
					Color = o.StripeColor,
					Material = Enum.Material.SmoothPlastic,
				})
			end
			lblock(
				bank,
				frame,
				"Facemask",
				Vector3.new(hd * 0.62, hd * 0.42, 0.25),
				x,
				H + 0.08,
				hz - hd / 2 + 0.06,
				o.FacemaskColor or FACEMASK_GREY,
				Enum.Material.Metal
			)
		end
	end
end

-- Round wall clock on a wall face. `frame` sits on the wall face, LookVector into the room.
local function wallClock(ctx, frame, rimColor)
	-- cylinders run along their local X: turned 90 degrees so they stick out of the wall
	BuildUtil.Part(ctx, {
		Name = "ClockRim",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(0.12, 2, 2),
		CFrame = frame * CFrame.new(0, 0, -0.06) * CFrame.Angles(0, math.pi / 2, 0),
		Color = rimColor,
		Material = Enum.Material.SmoothPlastic,
	})
	BuildUtil.Part(ctx, {
		Name = "ClockFace",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(0.16, 1.7, 1.7),
		CFrame = frame * CFrame.new(0, 0, -0.08) * CFrame.Angles(0, math.pi / 2, 0),
		Color = WHITE,
		Material = Enum.Material.SmoothPlastic,
	})
	-- hands at ten past ten (the classic catalogue time)
	for _, hand in ipairs({ { length = 0.75, angle = 60 }, { length = 0.55, angle = -60 } }) do
		local a = math.rad(hand.angle)
		BuildUtil.Part(ctx, {
			Name = "ClockHand",
			Size = Vector3.new(0.1, hand.length, 0.05),
			CFrame = frame * CFrame.new(0, 0, -0.18) * CFrame.Angles(0, 0, a) * CFrame.new(0, hand.length / 2, 0),
			Color = INK,
			Material = Enum.Material.SmoothPlastic,
			CanCollide = false,
		})
	end
end

---------------------------------------------------------------------------------------------
-- Home Locker Room (behind the home stands, entrance facing the back walk)
---------------------------------------------------------------------------------------------

function StadiumRooms.home_lockerroom(ctx)
	local C = ctx.config.Colors
	local team = ctx.colors
	local fp = HOME_ROOM
	local name = displayName(ctx)

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
	local innerMinX, innerMaxX = minX + 1, maxX - 1
	local innerMinZ, innerMaxZ = minZ + 1, maxZ - 1

	-- Step 1: Building -----------------------------------------------------------------------
	BuildUtil.Stage(ctx, 1)
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
		JambColor = team.Secondary,
		JambTop = top - 0.4, -- up to the canopy
	})

	-- Entrance: step, canopy, wall lamps, the HOME LOCKER ROOM sign (on a trim-coloured backing)
	local doorX = cz - (doorMinZ + doorMaxZ) / 2
	local doorW = doorMaxZ - doorMinZ
	lblock(ctx, frame, "FrontStep", Vector3.new(doorW + 2, FLOOR_TOP, 2), doorX, 0, -1, C.Concrete, Enum.Material.Concrete)
	lblock(ctx, frame, "DoorCanopy", Vector3.new(doorW + 3, 0.4, 2), doorX, top - 0.4, -1, team.Secondary, Enum.Material.SmoothPlastic)
	lblock(ctx, frame, "SignBacking", Vector3.new(W - 0.4, 3.2, 0.2), 0, top + 0.25, -0.1, team.Trim, Enum.Material.SmoothPlastic)
	local board = lblock(ctx, frame, "Sign", Vector3.new(W - 1, 2.6, 0.4), 0, top + 0.55, -0.4, team.Primary, Enum.Material.SmoothPlastic)
	sign(board, { Enum.NormalId.Front }, "HOME LOCKER ROOM", team.Primary, team, { InsetX = 0.03, InsetY = 0.1 })
	-- the pier between the window and the door: a lamp over a PLAYERS ONLY plaque
	local pierX = cz - (windowMaxZ + doorMinZ) / 2
	for _, lx in ipairs({ pierX, doorX - doorW / 2 - 1.1 }) do
		local lamp = lblock(ctx, frame, "WallLamp", Vector3.new(0.6, 0.9, 0.4), lx, 6.2, -0.2, LAMP, Enum.Material.Neon)
		BuildUtil.Light(lamp, "PointLight", { Name = "EntranceLight", Range = 10, Brightness = 0.8, Color = WARM_LIGHT })
	end
	local plaque =
		lblock(ctx, frame, "Plaque", Vector3.new(1.3, 1.5, 0.15), pierX + 0.2, 3.4, -0.075, team.Trim, Enum.Material.SmoothPlastic)
	sign(plaque, { Enum.NormalId.Front }, "PLAYERS\n& STAFF\nONLY", team.Trim, team, { InsetX = 0.08, InsetY = 0.1 })

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
	sign(nameBoard, { Enum.NormalId.Back }, name, team.Primary, team, { InsetX = 0.04, InsetY = 0.1 })

	-- Step 2: Lockers ------------------------------------------------------------------------
	-- U of team lockers: north wall, south wall and the east end
	BuildUtil.Stage(ctx, 2)
	local lockerH, lockerD = 8.5, 2.8
	local bankMinX = innerMinX + 16 -- leaves an entry area by the door
	local bankLen = innerMaxX - bankMinX
	local bankX = (bankMinX + innerMaxX) / 2
	local function lockerOpts(bankName, length, stalls, extra)
		local o = {
			Name = bankName,
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
			Names = HOME_NAMES,
			HelmetColor = team.Primary,
			StripeColor = team.Secondary,
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
		lockerOpts("SouthLockers", bankLen, 8, {
			EndPanels = true,
			HelmetEvery = 2,
			Numbers = { "99", "4", "15", "26", "37", "48", "59", "70" },
			Names = SOUTH_NAMES,
		})
	)
	local endLen = (innerMaxZ - lockerD) - (innerMinZ + lockerD)
	lockerBank(
		ctx,
		CFrame.new(innerMaxX, FLOOR_TOP, cz) * CFrame.Angles(0, math.pi / 2, 0),
		lockerOpts("EastLockers", endLen, 3, { Numbers = { "5", "17", "81" }, Names = { "CAPTAIN", "COACH", "LEGEND" } })
	)

	-- Step 3: Logo & Whiteboard ----------------------------------------------------------------
	BuildUtil.Stage(ctx, 3)
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
	sign(logoName, { Enum.NormalId.Top }, name, team.Primary, team, { InsetX = 0.02, InsetY = 0.05, PixelsPerStud = 12 })

	-- Coach's whiteboard (team-colour frame) on the north wall of the entry area, facing into the room
	local boardX = innerMinX + 8
	BuildUtil.Box(
		ctx,
		"WhiteboardFrame",
		Vector3.new(10.6, 5.6, 0.12),
		Vector3.new(boardX, 5.6, innerMaxZ - 0.06),
		team.Primary,
		Enum.Material.SmoothPlastic
	)
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
		TextColor3 = MARKER_BLUE,
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

	-- TV on the south wall of the entry area showing the game-day screen
	local tvX = innerMinX + 9
	BuildUtil.Box(
		ctx,
		"TVBezel",
		Vector3.new(6.6, 3.8, 0.3),
		Vector3.new(tvX, 6.6, innerMinZ + 0.15),
		SCREEN_BLACK,
		Enum.Material.SmoothPlastic
	)
	local screen = BuildUtil.Box(
		ctx,
		"TVScreen",
		Vector3.new(6.1, 3.3, 0.08),
		Vector3.new(tvX, 6.6, innerMinZ + 0.33),
		SCREEN_BLUE,
		Enum.Material.Neon,
		PAINT
	)
	sign(screen, { Enum.NormalId.Back }, "GAME DAY\n" .. name .. " vs AWAY", SCREEN_BLUE, team, {
		TextColor3 = WHITE,
		InsetX = 0.08,
		InsetY = 0.16,
		Font = Enum.Font.GothamBold,
	})
	BuildUtil.Light(screen, "SurfaceLight", { Name = "TVGlow", Face = Enum.NormalId.Back, Range = 8, Brightness = 0.6, Color = WHITE })

	-- PLAY LIKE A CHAMPION TODAY over the inside of the door: players slap it on the way out
	local champion = BuildUtil.Box(
		ctx,
		"ChampionSign",
		Vector3.new(0.2, 1.8, doorW - 0.6),
		Vector3.new(innerMinX + 0.1, top + 1.1, (doorMinZ + doorMaxZ) / 2),
		team.Secondary,
		Enum.Material.SmoothPlastic
	)
	sign(champion, { Enum.NormalId.Right }, "PLAY LIKE A CHAMPION TODAY", team.Secondary, team, { InsetX = 0.04, InsetY = 0.14 })

	-- wall clock over the window
	wallClock(ctx, CFrame.new(innerMinX, 10.2, (windowMinZ + windowMaxZ) / 2) * CFrame.Angles(0, -math.pi / 2, 0), team.Primary)

	-- Sports-drink cooler with a cup dispenser in the south-west corner (seen through the window)
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
	BuildUtil.Cylinder(ctx, {
		Name = "CupDispenser",
		Position = Vector3.new(coolerX + 1.2, FLOOR_TOP + 2.2, coolerZ),
		Height = 1.4,
		Diameter = 0.4,
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
	local floorFrame = frame * CFrame.new(0, FLOOR_TOP, 0)
	local innerHalf = W / 2 - 1
	local innerDepth = D - 1 -- local z of the back wall's inner face
	local innerMinX, innerMaxX = minX + 1, maxX - 1
	local innerMinZ, innerMaxZ = minZ + 1, maxZ - 1

	-- Step 1: Building -----------------------------------------------------------------------
	BuildUtil.Stage(ctx, 1)
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
		JambColor = LOCKER_GREY_DARK,
	})
	local doorX = (doorFrom + doorTo) / 2
	lblock(ctx, frame, "FrontStep", Vector3.new(doorTo - doorFrom + 2, FLOOR_TOP, 2), doorX, 0, -1, C.Concrete, Enum.Material.Concrete)
	local board = lblock(ctx, frame, "Sign", Vector3.new(15, 2.2, 0.4), 0, top + 0.15, -0.2, VISITOR_SIGN, Enum.Material.SmoothPlastic)
	sign(board, { Enum.NormalId.Front }, "VISITORS", VISITOR_SIGN, team, { TextColor3 = WHITE, InsetX = 0.08, InsetY = 0.12 })
	local plaque =
		lblock(ctx, frame, "Plaque", Vector3.new(1.2, 1.5, 0.15), doorFrom / 2 - 0.15, 3.4, -0.075, WHITE, Enum.Material.SmoothPlastic)
	sign(plaque, { Enum.NormalId.Front }, "AWAY\nTEAM", WHITE, team, { TextColor3 = VISITOR_SIGN, InsetX = 0.1, InsetY = 0.15 })

	-- Step 2: Lockers ------------------------------------------------------------------------
	-- plain grey U of lockers with white away jerseys
	BuildUtil.Stage(ctx, 2)
	local lockerH, lockerD = 8, 2.6
	local function lockerOpts(bankName, length, stalls, extra)
		local o = {
			Name = bankName,
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
			Names = AWAY_NAMES,
			HelmetColor = AWAY_HELMET,
			HelmetDiameter = 1.5,
			Team = team,
		}
		for k, v in pairs(extra or {}) do
			o[k] = v
		end
		return o
	end
	lockerBank(ctx, floorFrame * CFrame.new(0, 0, innerDepth), lockerOpts("BackLockers", innerHalf * 2, 3))
	local sideStart, sideEnd = 7, innerDepth - lockerD
	local sideZ = (sideStart + sideEnd) / 2
	lockerBank(
		ctx,
		floorFrame * CFrame.new(-innerHalf, 0, sideZ) * CFrame.Angles(0, -math.pi / 2, 0),
		lockerOpts("SideLockers", sideEnd - sideStart, 4, { EndPanels = true, HelmetEvery = 2 })
	)
	lockerBank(
		ctx,
		floorFrame * CFrame.new(innerHalf, 0, sideZ) * CFrame.Angles(0, math.pi / 2, 0),
		lockerOpts("SideLockers", sideEnd - sideStart, 4, {
			EndPanels = true,
			HelmetEvery = 2,
			Numbers = { "6", "19", "33", "42" },
			Names = { "EXTRA", "SPARE", "WALK-ON", "TRYOUT" },
		})
	)

	-- Step 3: Bench & Signs ------------------------------------------------------------------
	BuildUtil.Stage(ctx, 3)
	-- one plain bench with somebody's duffel bag and a towel on it
	local benchLen = sideEnd - sideStart - 4
	lblock(ctx, floorFrame, "BenchBase", Vector3.new(1, 1.2, benchLen - 2), 0, 0, sideZ, DARK_METAL, Enum.Material.Metal)
	lblock(ctx, floorFrame, "BenchSeat", Vector3.new(1.8, 0.5, benchLen), 0, 1.2, sideZ, LOCKER_GREY_MID, Enum.Material.WoodPlanks)
	lblock(ctx, floorFrame, "DuffelBag", Vector3.new(1.3, 1, 2.6), 0, 1.7, sideZ + 3.5, DUFFEL_GREY, Enum.Material.Fabric)
	lblock(ctx, floorFrame, "Towel", Vector3.new(1.6, 0.12, 1.4), 0.1, 1.7, sideZ - 3, WHITE, Enum.Material.Fabric)

	-- a painted VISITORS mat by the door, a bin
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

	-- an old CRT TV on an AV cart, bunny ears and all, showing NO SIGNAL
	local cartX, cartZ = maxX - 5, innerMinZ + 1.4
	BuildUtil.Block(
		ctx,
		"AVCart",
		Vector3.new(2.2, 2.6, 1.8),
		Vector3.new(cartX, 0, cartZ),
		DARK_METAL,
		Enum.Material.Metal,
		nil,
		FLOOR_TOP
	)
	local crtBottom = FLOOR_TOP + 2.6
	BuildUtil.Block(
		ctx,
		"CRT",
		Vector3.new(2, 1.8, 1.8),
		Vector3.new(cartX, 0, cartZ),
		CRT_BEIGE,
		Enum.Material.SmoothPlastic,
		nil,
		crtBottom
	)
	local crtScreen = BuildUtil.Box(
		ctx,
		"CRTScreen",
		Vector3.new(0.08, 1.3, 1.4),
		Vector3.new(cartX - 1.04, crtBottom + 0.95, cartZ),
		STATIC_GREY,
		Enum.Material.SmoothPlastic
	)
	sign(crtScreen, { Enum.NormalId.Left }, "NO SIGNAL", STATIC_GREY, team, { TextColor3 = INK, InsetX = 0.1, InsetY = 0.3 })
	for _, s in ipairs({ -1, 1 }) do
		local base = Vector3.new(cartX + 0.2, crtBottom + 1.8, cartZ)
		strut(ctx, "BunnyEar", base, base + Vector3.new(-0.3, 1.5, s * 0.8), 0.06, DARK_METAL, Enum.Material.Metal)
	end

	-- the roof leaks: a stain on the ceiling, a falling drip, a bucket and a wet floor sign
	local leakX, leakZ = maxX - 7, cz - 2.6
	BuildUtil.Cylinder(ctx, {
		Name = "CeilingStain",
		Position = Vector3.new(leakX, H - 0.25 - 0.03, leakZ),
		Height = 0.06,
		Diameter = 3,
		Axis = "Y",
		Color = STAIN_BROWN,
		Material = Enum.Material.SmoothPlastic,
		CanCollide = false,
		CastShadow = false,
	})
	BuildUtil.Ball(ctx, {
		Name = "Drip",
		Position = Vector3.new(leakX, 5.4, leakZ),
		Diameter = 0.3,
		Color = WATER_BLUE,
		Material = Enum.Material.Glass,
		Transparency = 0.2,
		CanCollide = false,
		CastShadow = false,
	})
	BuildUtil.Cylinder(ctx, {
		Name = "Bucket",
		Position = Vector3.new(leakX, FLOOR_TOP + 0.7, leakZ),
		Height = 1.4,
		Diameter = 1.4,
		Axis = "Y",
		Color = BUCKET_BLUE,
		Material = Enum.Material.SmoothPlastic,
	})
	BuildUtil.Cylinder(ctx, {
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
	local signX, signZ = leakX + 1.5, leakZ - 1.9
	for _, s in ipairs({ -1, 1 }) do
		local panel = BuildUtil.Part(ctx, {
			Name = "WetFloorSign",
			Size = Vector3.new(1.2, 2, 0.08),
			CFrame = CFrame.new(signX, FLOOR_TOP + 0.98, signZ + s * 0.21) * CFrame.Angles(-s * math.rad(12), 0, 0),
			Color = CAUTION_YELLOW,
			Material = Enum.Material.SmoothPlastic,
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

	-- not-so-welcoming signs
	local hotWater = BuildUtil.Box(
		ctx,
		"HotWaterSign",
		Vector3.new(0.2, 1.3, 9),
		Vector3.new(innerMinX + 0.1, FLOOR_TOP + lockerH + 0.95, cz),
		WHITE,
		Enum.Material.SmoothPlastic
	)
	sign(hotWater, { Enum.NormalId.Right }, "HOT WATER: OUT OF ORDER", WHITE, team, { TextColor3 = Color3.fromRGB(190, 30, 30) })
	local wifi = BuildUtil.Box(
		ctx,
		"WifiSign",
		Vector3.new(3.6, 1.4, 0.2),
		Vector3.new(maxX - 4, 6.2, innerMaxZ - 0.1),
		WHITE,
		Enum.Material.SmoothPlastic
	)
	sign(wifi, { Enum.NormalId.Front }, "WI-FI: NONE", WHITE, team, { TextColor3 = INK })
	local goodLuck = BuildUtil.Box(
		ctx,
		"GoodLuckSign",
		Vector3.new(0.2, 1.4, doorTo - doorFrom),
		Vector3.new(innerMaxX - 0.1, top + 1.05, cz + doorX),
		VISITOR_SIGN,
		Enum.Material.SmoothPlastic
	)
	sign(goodLuck, { Enum.NormalId.Left }, "GOOD LUCK. YOU'LL NEED IT.", VISITOR_SIGN, team, { TextColor3 = WHITE, InsetY = 0.16 })
end

return StadiumRooms
