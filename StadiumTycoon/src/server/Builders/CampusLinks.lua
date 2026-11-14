--[[
	CampusLinks (V5)
	Covered walkways and glass skybridges that join the Team HQ, the Hall of Fame, the golf cart
	garage, the indoor dome and the practice field into ONE connected campus. Piece "campus_links"
	(4 steps, Items.lua), built in CAMPUS-area coordinates (the same ones as Config.Layout.HQ,
	HQCorridor, Zones, CampusRoad, BackRoad); zone Config.Layout.Zones.campus_links.

	The hub is the HQ's EAST GLASS ELEVATOR TOWER (HQShell, X[100, 118] Z[258, 284]): players leave
	the HQ through its ground-floor portal (x 118, z 266..276) or ride its elevator to the upper
	floor (y 17), where both skybridges start (one from its east face, one from its north face).

	  1 Covered Walkway   white canopies (team-colour fascias, light strips, benches) on slim columns:
	                      a porch outside the tower portal X[118, 125] Z[262, 292], the HQ walk along
	                      the HQ's east side X[100.6, 118] Z[284, 372], a covered zebra crossing over
	                      the back road (paint flush, canopy underside 12.3+, columns off the road) and
	                      the field promenade X[-10, 142] Z[386, 399] from the practice field's side
	                      gate (x -10.6) to the indoor dome's entrance portal (x 138..162), with a
	                      Hydration Station (sports drink) by the field gate.
	  2 Skybridge to the  from the tower's east face at y 17: a glass link X[118, 126] Z[265, 277],
	    Hall of Fame      the SKY LOUNGE X[126, 142] Z[261, 281] (smoothie bar, campus map, live TV,
	                      Hall of Fame cam), the south bridge X[127, 141] Z[232, 261] and the HALL OF
	                      FAME TOWER X[126, 142] Z[212, 232] (glass elevator both ways, a stadium cam,
	                      glass doors onto a forecourt beside the Hall of Fame's front steps).
	  3 Skybridge to the  from the tower's north face at y 17: a white-truss glass bridge X[103, 115]
	    Dome & Garage     Z[284, 399.5] along the HQ's east side (over the HQ walk), past the golf
	                      cart garage (CART CAM bench) and over the back road (underside y 15), on three
	                      portal piers (z 329, 370.5, 387.6: none on the road), to the DOME & GARAGE
	                      TOWER X[100, 120] Z[399.5, 409.5] (glass elevator both ways, doors onto the
	                      promenade a few steps from the dome entrance).
	  4 Landscaping &     the Hall of Fame walk (HQ front arcade -> Hall of Fame steps) with three team
	    Lights            flags, a path from the promenade to the dome's west door, lamp posts, trees
	                      in planters, benches and three wayfinding signposts (look prompts).

	Getting into the HQ tower: HQShell closes the tower's east and north faces with glass at the
	upper floor, so each bridge end carries a "TEAM HQ" sign with two elevator prompts that carry
	players through (onto the tower's landing, and back onto the bridge). If the shell opens doorways
	there later, the bridges simply become walk-through as well.

	Kept clear: the carts' way out of the garage X[118, 154] Z[331, 365] (nothing at ground level:
	the bays open at x 139, 22 studs east of the HQ walk's columns and pier legs at x 116.6),
	the back road and the campus road (only flush paint on the road; canopy and bridge undersides
	stay >= 12.3 above it, columns and piers stand beside it), every buy button (campus_links
	(110, 230), golf_carts (124, 324), indoor_dome (150, 400) ...) and the HQ entrance walk.
	Paint: paving top 0.15 (the roads are 0.1), zebra stripes 0.1 .. 0.14 on the back road.
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)

local CampusLinks = {}

---------------------------------------------------------------------------------------------
-- Layout (campus coordinates)
---------------------------------------------------------------------------------------------

local PAVE = 0.15 -- paving top (the roads are 0.1 tall)
local STRIPE0, STRIPE1 = 0.1, 0.14 -- zebra stripes painted on the back road

-- covered walkway canopies
local SOFFIT = 12.5 -- underside of every canopy roof
local CANOPY_TOP = 13.3
local FASCIA0, FASCIA1 = 12.3, 13.6 -- team-colour edge bands (>= 12 over the back road)
local PORCH = { MinX = 118, MaxX = 125, MinZ = 262, MaxZ = 292 }
local HQ_WALK = { MinX = 100.6, MaxX = 118, MinZ = 284, MaxZ = 372 } -- the canopy runs on over the road
local CROSSING = { MinX = 101, MaxX = 117, MinZ = 372, MaxZ = 386 } -- Config.Layout.BackRoad
local PROMENADE = { MinX = -10, MaxX = 142, MinZ = 386, MaxZ = 399 }
local FIELD_PLAZA = { MinX = -10, MaxX = 4, MinZ = 399, MaxZ = 410 } -- at the practice field's side gate
local WALK_W, WALK_E = 101.4, 116.6 -- column lines of the HQ walk + crossing
local PROM_S, PROM_N = 387.6, 398.4 -- column lines of the promenade

-- skybridges
local DECK = 17 -- bridge floors = the HQ's upper floor (Config.Layout.HQ.UpperFloorY)
local DECK_BOTTOM = 15
local GLASS_TOP = 25.5
local ROOF_TOP = 26.5
local TALL_ROOF = 27 -- the lounge and both towers: roof slab 27 .. 28
local LINK = { MinX = 118, MaxX = 126, MinZ = 265, MaxZ = 277 }
local LOUNGE = { MinX = 126, MaxX = 142, MinZ = 261, MaxZ = 281 }
local HOF_BRIDGE = { MinX = 127, MaxX = 141, MinZ = 232, MaxZ = 261 }
local HOF_TOWER = { MinX = 126, MaxX = 142, MinZ = 212, MaxZ = 232 }
local FORECOURT = { MinX = 126, MaxX = 142, MinZ = 200, MaxZ = 212 } -- meets the Hall of Fame walk (z 200)
local DOME_BRIDGE = { MinX = 103, MaxX = 115, MinZ = 284, MaxZ = 399.5 }
local DOME_TOWER = { MinX = 100, MaxX = 120, MinZ = 399.5, MaxZ = 409.5 }
local PIER_Z = { 329, 370.5, PROM_S } -- portal piers under the dome bridge (beside the road)
local TRUSS_PANELS = 5
-- where players land on the HQ tower's upper floor (HQShell: X[100, 118] Z[265.6, 284] at y 17)
local HQ_LANDING_EAST = Vector3.new(112, DECK, 271)
local HQ_LANDING_NORTH = Vector3.new(109, DECK, 278.5)

-- step 4
-- the Hall of Fame walk continues the HQ's front arcade paving (X[-50, 100] Z[193, 200], same height)
-- east past the tower to the Hall of Fame's red carpet (x 191 .. 199 from z 200) and front steps
local HOF_WALK = { MinX = 100, MaxX = 199, MinZ = 193, MaxZ = 200 }
-- promenade -> the dome's west door (indoor_dome: a double door in its end wall, x 34, z 439 .. 451)
local SPINE = { MinX = 8, MaxX = 16, MinZ = 399, MaxZ = 450 }
local SPINE_BRANCH = { MinX = 16, MaxX = 34, MinZ = 440, MaxZ = 450 }

-- cameras (campus coordinates; the stadium's field centre is at campus (0, 0, -90))
local STADIUM_CAM = { From = Vector3.new(90, 170, 180), To = Vector3.new(0, 0, -90), Fov = 50, Label = "STADIUM CAM" }
local HALL_CAM = { From = Vector3.new(150, 22, 168), To = Vector3.new(195, 12, 230), Fov = 55, Label = "HALL OF FAME CAM" }
local CART_CAM = { From = Vector3.new(119, 12, 322), To = Vector3.new(160, 3, 352), Fov = 65, Label = "CART CAM" }

local PAINT = { CanCollide = false, CastShadow = false }
local DECOR = { CanCollide = false }
local GLASS_PROPS = { Transparency = 0.55, Reflectance = 0.15, CastShadow = false }
local SHAFT_PROPS = { Transparency = 0.6, Reflectance = 0.1, CastShadow = false }

local WHITE = Color3.fromRGB(248, 248, 248)
local INK = Color3.fromRGB(22, 22, 26)
local PANEL_WHITE = Color3.fromRGB(238, 239, 241)
local BRIDGE_FLOOR = Color3.fromRGB(230, 228, 220)
local PAVER = Color3.fromRGB(172, 168, 160)
local LIMESTONE = Color3.fromRGB(206, 198, 182)
local GLASS = Color3.fromRGB(150, 200, 230)
local STEEL = Color3.fromRGB(62, 64, 70)
local BRUSHED = Color3.fromRGB(178, 182, 188)
local LAMP = Color3.fromRGB(255, 248, 232)
local WARM_LIGHT = Color3.fromRGB(255, 236, 200)
local SIGN_DARK = Color3.fromRGB(28, 30, 36)
local SCREEN_DARK = Color3.fromRGB(12, 14, 22)
local BUTTON_GLOW = Color3.fromRGB(120, 220, 255)
local DOOR_GLASS = Color3.fromRGB(170, 214, 236)
local WOOD = Color3.fromRGB(150, 105, 60)
local DARK_WOOD = Color3.fromRGB(96, 66, 44)
local MARBLE = Color3.fromRGB(240, 238, 232)
local LEAVES = Color3.fromRGB(72, 140, 70)
local LEAVES_DARK = Color3.fromRGB(56, 118, 58)
local TRUNK = Color3.fromRGB(104, 74, 48)
local PLANTER_GREY = Color3.fromRGB(96, 98, 104)
local COOLER_ORANGE = Color3.fromRGB(247, 128, 10)
local GOLD = Color3.fromRGB(255, 196, 60)
local SMOOTHIE_PINK = Color3.fromRGB(236, 92, 140)
local VENDING_RED = Color3.fromRGB(196, 36, 40)

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

-- "<prefix><TEAM><suffix>" with the owner's team name, or `otherwise` when the plot has no name yet.
local function withTeam(ctx, prefix, suffix, otherwise)
	local name = ctx.teamName
	if type(name) ~= "string" or name == "" then
		return otherwise
	end
	return prefix .. name .. suffix
end

-- Axis-aligned block between two corners.
local function span(ctx, name, xa, ya, za, xb, yb, zb, color, material, extra)
	return BuildUtil.Box(
		ctx,
		name,
		Vector3.new(math.abs(xb - xa), math.abs(yb - ya), math.abs(zb - za)),
		Vector3.new((xa + xb) / 2, (ya + yb) / 2, (za + zb) / 2),
		color,
		material,
		extra
	)
end

local function glass(ctx, name, xa, ya, za, xb, yb, zb)
	return span(ctx, name, xa, ya, za, xb, yb, zb, GLASS, Enum.Material.Glass, GLASS_PROPS)
end

-- Vertical cylinder.
local function post(ctx, name, x, z, y0, y1, diameter, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Position = Vector3.new(x, (y0 + y1) / 2, z)
	props.Height = y1 - y0
	props.Diameter = diameter
	props.Axis = "Y"
	props.Color = color
	props.Material = material
	return BuildUtil.Cylinder(ctx, props)
end

-- Box of the given cross-section from point a to point b.
local function strut(ctx, name, a, b, width, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Size = Vector3.new(width, width, (b - a).Magnitude)
	props.CFrame = CFrame.lookAt((a + b) / 2, b)
	props.Color = color
	props.Material = material
	return BuildUtil.Part(ctx, props)
end

-- A warm PointLight, at an offset from the part's centre (on an attachment) or at its centre.
local function pointLight(part, offset, range, brightness)
	local host = part
	if offset then
		local attachment = Instance.new("Attachment")
		attachment.Name = "LightAt"
		attachment.Position = offset
		attachment.Parent = part
		host = attachment
	end
	return BuildUtil.Light(host, "PointLight", {
		Name = "CampusLight",
		Range = range or 18,
		Brightness = brightness or 1.2,
		Color = WARM_LIGHT,
		Shadows = false,
	})
end

--[[
	Text on one face of a part. items: { { Text, Color, X0, X1, Y0, Y1 (fractions of the face),
	Align (Enum.TextXAlignment) } }. o: PixelsPerStud, LightInfluence, Background (Color3: a solid
	background panel behind the text).
]]
local function faceText(part, face, items, o)
	o = o or {}
	local gui = Instance.new("SurfaceGui")
	gui.Name = part.Name .. face.Name .. "Gui"
	gui.Face = face
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = o.PixelsPerStud or 20
	gui.LightInfluence = o.LightInfluence or 1
	gui.Parent = part
	if o.Background then
		local frame = Instance.new("Frame")
		frame.Name = "Panel"
		frame.Size = UDim2.new(1, 0, 1, 0)
		frame.BackgroundColor3 = o.Background
		frame.BorderSizePixel = 0
		frame.Parent = gui
	end
	for index, item in ipairs(items) do
		local x0, x1 = item.X0 or 0.05, item.X1 or 0.95
		local y0, y1 = item.Y0 or 0.14, item.Y1 or 0.86
		local label = Instance.new("TextLabel")
		label.Name = "Line" .. index
		label.BackgroundTransparency = 1
		label.BorderSizePixel = 0
		label.Position = UDim2.new(x0, 0, y0, 0)
		label.Size = UDim2.new(x1 - x0, 0, y1 - y0, 0)
		label.Font = item.Font or Enum.Font.GothamBlack
		label.Text = item.Text
		label.TextColor3 = item.Color or WHITE
		label.TextScaled = true
		label.TextXAlignment = item.Align or Enum.TextXAlignment.Center
		label.ZIndex = 2
		label.Parent = gui
	end
	return gui
end

-- A bench: a Seat block standing on floorY at (x, z) facing `dir` (a unit X/Z vector) + a backrest.
local function bench(ctx, name, x, z, floorY, dir, length, team, opts)
	opts = opts or {}
	local pos = Vector3.new(x, floorY + 0.7, z)
	local seat = BuildUtil.Seat(ctx, {
		Name = name,
		Size = Vector3.new(length, 1.4, 2),
		CFrame = CFrame.lookAt(pos, pos + dir),
		Color = opts.Color or WOOD,
		Material = Enum.Material.WoodPlanks,
		Camera = opts.Camera,
		Object = opts.Object,
	})
	local back = pos - dir * 1.2 + Vector3.new(0, 1.6, 0)
	BuildUtil.Part(ctx, {
		Name = name .. "Back",
		Size = Vector3.new(length, 2.2, 0.4),
		CFrame = CFrame.lookAt(back, back + dir),
		Color = opts.BackColor or team.Primary,
		Material = Enum.Material.SmoothPlastic,
	})
	return seat
end

-- A glass elevator: shaft (box), a parked cab, and at each of the two levels static doors + a call
-- panel that rides to the other level. s: X0, X1, Z0, Z1 (shaft), Face ("+X" or "-Z": the side
-- with the doors), Top, Levels = { { Y, Name, Target (CFrame), Action }, { ... } }
local function glassElevator(ctx, name, s, team)
	span(ctx, name .. "ShaftGlass", s.X0, 0.2, s.Z0, s.X1, s.Top, s.Z1, GLASS, Enum.Material.Glass, SHAFT_PROPS)
	span(ctx, name .. "Cab", s.X0 + 0.5, 0.4, s.Z0 + 0.5, s.X1 - 0.5, 9.4, s.Z1 - 0.5, team.Secondary, Enum.Material.Metal, DECOR)
	local onDoors = textColorOn(BRUSHED, { team.Primary, INK })
	for index, level in ipairs(s.Levels) do
		local other = s.Levels[3 - index]
		local y = level.Y
		local doors, panel, face
		if s.Face == "+X" then
			local cz = (s.Z0 + s.Z1) / 2
			doors = span(ctx, name .. "Doors", s.X1, y, cz - 2.5, s.X1 + 0.3, y + 8.4, cz + 2.5, BRUSHED, Enum.Material.Metal)
			panel = span(
				ctx,
				name .. "CallPanel",
				s.X1,
				y + 3.4,
				cz + 2.9,
				s.X1 + 0.3,
				y + 5.6,
				cz + 4.1,
				SIGN_DARK,
				Enum.Material.SmoothPlastic
			)
			face = Enum.NormalId.Right
		else
			local cx = (s.X0 + s.X1) / 2
			doors = span(ctx, name .. "Doors", cx - 2.5, y, s.Z0 - 0.3, cx + 2.5, y + 8.4, s.Z0, BRUSHED, Enum.Material.Metal)
			panel = span(
				ctx,
				name .. "CallPanel",
				cx + 2.9,
				y + 3.4,
				s.Z0 - 0.3,
				cx + 4.1,
				y + 5.6,
				s.Z0,
				SIGN_DARK,
				Enum.Material.SmoothPlastic
			)
			face = Enum.NormalId.Front
		end
		-- where the ride goes, across the top of the 5-wide doors (the narrow call panel beside them
		-- only says UP or DOWN, big): both read from the landing
		local goingUp = other.Y > y
		local destination = (goingUp and "UP TO THE " or "DOWN TO THE ") .. other.Name
		faceText(doors, face, { { Text = destination, Color = onDoors, Y0 = 0.02, Y1 = 0.16 } }, { LightInfluence = 0, PixelsPerStud = 40 })
		faceText(panel, face, {
			{ Text = goingUp and "UP" or "DOWN", Color = BUTTON_GLOW, X0 = 0.08, X1 = 0.92, Y0 = 0.2, Y1 = 0.8 },
		}, { LightInfluence = 0, PixelsPerStud = 40 })
		BuildUtil.Elevator(ctx, panel, other.Target, {
			Action = other.Action,
			Object = "Glass Elevator",
			Label = other.Name,
			Distance = 7,
		})
	end
end

-- A wayfinding signpost: a post with arrow boards ({ Dir = "+X" | "-X" | "+Z" | "-Z", Text }).
-- Every board reads on both sides with its arrow pointing the right way.
local function signpost(ctx, name, x, z, boards, team, title, info)
	local postPart = post(ctx, name .. "Post", x, z, PAVE, 11.2, 0.6, STEEL, Enum.Material.Metal)
	local accent = textColorOn(team.Primary, { team.Trim, team.Secondary })
	for index, board in ipairs(boards) do
		local y = 10.4 - (index - 1) * 1.6
		local s = (board.Dir == "+X" or board.Dir == "+Z") and 1 or -1
		local len = 6.4
		local part, faceA, faceB, textA, textB
		local right = board.Text .. "  >"
		local left = "<  " .. board.Text
		if board.Dir == "+X" or board.Dir == "-X" then
			local xa, xb = x + s * 0.4, x + s * (0.4 + len)
			part = span(
				ctx,
				name .. "Board",
				math.min(xa, xb),
				y - 0.65,
				z - 0.15,
				math.max(xa, xb),
				y + 0.65,
				z + 0.15,
				team.Primary,
				Enum.Material.SmoothPlastic,
				DECOR
			)
			-- Back face (+Z): its viewer's right is +X; Front face (-Z): its viewer's right is -X
			faceA, faceB = Enum.NormalId.Back, Enum.NormalId.Front
			textA = s > 0 and right or left
			textB = s > 0 and left or right
		else
			local za, zb = z + s * 0.4, z + s * (0.4 + len)
			part = span(
				ctx,
				name .. "Board",
				x - 0.15,
				y - 0.65,
				math.min(za, zb),
				x + 0.15,
				y + 0.65,
				math.max(za, zb),
				team.Primary,
				Enum.Material.SmoothPlastic,
				DECOR
			)
			-- Left face (-X): its viewer's right is +Z; Right face (+X): its viewer's right is -Z
			faceA, faceB = Enum.NormalId.Left, Enum.NormalId.Right
			textA = s > 0 and right or left
			textB = s > 0 and left or right
		end
		faceText(part, faceA, { { Text = textA, Color = accent } })
		faceText(part, faceB, { { Text = textB, Color = accent } })
	end
	BuildUtil.Ball(
		ctx,
		{ Name = name .. "Cap", Diameter = 1, Position = Vector3.new(x, 11.4, z), Color = GOLD, Material = Enum.Material.Metal }
	)
	-- (a vertical cylinder's local X axis points up)
	BuildUtil.Look(postPart, title, info, { At = Vector3.new(4.5 - (11.2 - PAVE) / 2, 0, 0) })
	return postPart
end

-- A lamp post with a glowing lantern.
local function lampPost(ctx, x, z, team)
	post(ctx, "LampPost", x, z, PAVE, 10.4, 0.5, team.Primary, Enum.Material.Metal)
	local head = span(ctx, "LampLantern", x - 0.8, 10.4, z - 0.8, x + 0.8, 11.4, z + 0.8, LAMP, Enum.Material.Neon)
	pointLight(head, nil, 26, 1.3)
end

-- A tree (trunk + two leaf balls), optionally in a round planter.
local function tree(ctx, x, z, size, planter)
	local base = PAVE
	if planter then
		post(ctx, "TreePlanter", x, z, 0, 1.6, 4.6, PLANTER_GREY, Enum.Material.Concrete)
		base = 1.6
	end
	post(ctx, "TreeTrunk", x, z, base, base + size * 0.9, 0.8, TRUNK, Enum.Material.Wood)
	BuildUtil.Ball(ctx, {
		Name = "TreeLeaves",
		Diameter = size,
		Position = Vector3.new(x, base + size * 1.05, z),
		Color = LEAVES,
		Material = Enum.Material.Grass,
		CanCollide = false,
	})
	BuildUtil.Ball(ctx, {
		Name = "TreeLeaves",
		Diameter = size * 0.7,
		Position = Vector3.new(x + size * 0.2, base + size * 1.45, z - size * 0.15),
		Color = LEAVES_DARK,
		Material = Enum.Material.Grass,
		CanCollide = false,
	})
end

---------------------------------------------------------------------------------------------
-- STEP 1: Covered Walkway
---------------------------------------------------------------------------------------------

local function buildWalkway(ctx, team)
	BuildUtil.Stage(ctx, 1)
	local walk = BuildUtil.Child(ctx, "CoveredWalkway")
	local accent = textColorOn(team.Primary, { team.Trim, team.Secondary })

	-- paving (flush: golf carts roll straight over it)
	for _, r in ipairs({ PORCH, HQ_WALK, PROMENADE, FIELD_PLAZA }) do
		span(walk, "WalkwayPaving", r.MinX, 0, r.MinZ, r.MaxX, PAVE, r.MaxZ, PAVER, Enum.Material.Slate)
	end
	-- the zebra crossing painted on the back road (team colour: the road itself is light). Like a real
	-- crossing, the bars run along the road (piano keys to a driver) and you step over them in turn.
	for i = 0, 4 do
		local z = CROSSING.MinZ + 0.7 + i * 2.8
		span(
			walk,
			"ZebraStripe",
			CROSSING.MinX + 1,
			STRIPE0,
			z,
			CROSSING.MaxX - 1,
			STRIPE1,
			z + 1.4,
			team.Primary,
			Enum.Material.SmoothPlastic,
			PAINT
		)
	end

	-- canopy roofs (white) with team-colour fascia bands along their long edges
	local function roof(name, x0, z0, x1, z1)
		return span(walk, name, x0, SOFFIT, z0, x1, CANOPY_TOP, z1, PANEL_WHITE, Enum.Material.SmoothPlastic)
	end
	local function fascia(name, x0, z0, x1, z1, top)
		return span(walk, name, x0, FASCIA0, z0, x1, top or FASCIA1, z1, team.Primary, Enum.Material.SmoothPlastic)
	end
	local promRoofZ = PROMENADE.MinZ + 0.9 -- the HQ walk's roof ends where the promenade's begins
	roof("PorchCanopyRoof", PORCH.MinX + 0.1, PORCH.MinZ, PORCH.MaxX, PORCH.MaxZ)
	roof("HQWalkCanopyRoof", HQ_WALK.MinX, HQ_WALK.MinZ + 0.1, 117.4, promRoofZ)
	roof("PromenadeCanopyRoof", PROMENADE.MinX, promRoofZ, PROMENADE.MaxX, PROMENADE.MaxZ)
	local walkName = withTeam(ctx, "", " CAMPUS WALK", "CAMPUS WALK")
	local porchBand = fascia("PorchFascia", PORCH.MaxX - 0.2, PORCH.MinZ, PORCH.MaxX + 0.2, PORCH.MaxZ)
	faceText(porchBand, Enum.NormalId.Right, { { Text = walkName, Color = accent, X0 = 0.1, X1 = 0.9 } })
	fascia("HQWalkFascia", 100.4, HQ_WALK.MinZ + 0.1, 100.8, 370)
	local walkBand = fascia("HQWalkFascia", 117.2, HQ_WALK.MinZ + 0.1, 117.6, 370)
	-- (Right face: seen from the cart lane; +Z, toward the fields, is on the reader's left)
	faceText(walkBand, Enum.NormalId.Right, { { Text = "<  PRACTICE FIELD + INDOOR DOME", Color = accent, X0 = 0.3, X1 = 0.7 } })
	fascia("PromenadeFascia", PROMENADE.MinX, promRoofZ - 0.2, PROMENADE.MaxX, promRoofZ + 0.2)
	fascia("PromenadeFascia", PROMENADE.MinX, PROMENADE.MaxZ - 0.4, PROMENADE.MaxX, PROMENADE.MaxZ)
	-- over the back road the fascias become taller signs, read by the cart drivers on the road
	local crossingText = withTeam(ctx, "", " CAMPUS WALK - PLAYERS CROSSING", "CAMPUS WALK - PLAYERS CROSSING")
	local westSign = fascia("CrossingSign", 100.3, 370, 100.7, promRoofZ - 0.2, 15)
	faceText(westSign, Enum.NormalId.Left, { { Text = crossingText, Color = accent } })
	local eastSign = fascia("CrossingSign", 117.3, 370, 117.7, promRoofZ - 0.2, 15)
	faceText(eastSign, Enum.NormalId.Right, { { Text = crossingText, Color = accent } })

	-- slim white columns (none on the road: the crossing's stand at z 370.5 and 387.6)
	local function columnAt(x, z)
		post(walk, "CanopyColumn", x, z, PAVE, SOFFIT, 1.2, PANEL_WHITE, Enum.Material.SmoothPlastic)
	end
	for _, z in ipairs({ 263, 277.5, 291.5 }) do
		columnAt(PORCH.MaxX - 0.8, z)
	end
	for _, z in ipairs({ 286, 307, 329, 350, 370.5 }) do
		columnAt(WALK_W, z)
	end
	for _, z in ipairs({ 307, 329, 350, 370.5 }) do
		columnAt(WALK_E, z)
	end
	for _, x in ipairs({ -9, 15, 39, 63, 87, WALK_W, WALK_E, 141 }) do
		columnAt(x, PROM_S)
	end
	for _, x in ipairs({ 2, 26, 50, 74, 96, 128, 141 }) do
		columnAt(x, PROM_N)
	end

	-- light strips under the canopies
	local function lightStrip(name, x0, z0, x1, z1, offsets)
		local strip = span(walk, name, x0, SOFFIT - 0.25, z0, x1, SOFFIT, z1, LAMP, Enum.Material.Neon, PAINT)
		for _, offset in ipairs(offsets) do
			pointLight(strip, offset, 22, 1.1)
		end
	end
	lightStrip("PorchLightStrip", 121.2, 264, 121.8, 290, { Vector3.new(0, -0.6, -7), Vector3.new(0, -0.6, 7) })
	local walkLights = {}
	for i = -2, 2 do
		table.insert(walkLights, Vector3.new(0, -0.6, i * 21))
	end
	lightStrip("HQWalkLightStrip", 108.7, 286, 109.3, 385, walkLights)
	local promLights = {}
	for i = -2, 2 do
		table.insert(promLights, Vector3.new(i * 32, -0.6, 0))
	end
	lightStrip("PromenadeLightStrip", -8, 392.7, 140, 393.3, promLights)

	-- benches: two against the HQ wall, two along the promenade facing the back road
	bench(walk, "WalkBench", 102.6, 318, PAVE, Vector3.new(1, 0, 0), 6, team, { Object = "Bench" })
	bench(walk, "WalkBench", 102.6, 340, PAVE, Vector3.new(1, 0, 0), 6, team, { Object = "Bench" })
	bench(walk, "PromenadeBench", 38, 397, PAVE, Vector3.new(0, 0, -1), 6, team, { Object = "Bench" })
	bench(walk, "PromenadeBench", 62, 397, PAVE, Vector3.new(0, 0, -1), 6, team, { Object = "Bench" })

	-- a direction sign under the promenade's front beam, where the crossing arrives
	local sign = span(
		walk,
		"PromenadeSign",
		102.4,
		9.6,
		promRoofZ - 0.2,
		115.6,
		FASCIA0,
		promRoofZ + 0.2,
		SIGN_DARK,
		Enum.Material.SmoothPlastic,
		DECOR
	)
	-- Front (-Z): read walking north across the road (+X is on your left)
	faceText(sign, Enum.NormalId.Front, {
		{ Text = "<  INDOOR DOME", Color = WHITE, X0 = 0.04, X1 = 0.47, Align = Enum.TextXAlignment.Left },
		{ Text = "PRACTICE FIELD  >", Color = WHITE, X0 = 0.53, X1 = 0.96, Align = Enum.TextXAlignment.Right },
	}, { LightInfluence = 0 })
	faceText(sign, Enum.NormalId.Back, { { Text = "TEAM HQ  -  HALL OF FAME", Color = WHITE } }, { LightInfluence = 0 })
	BuildUtil.Look(
		sign,
		withTeam(ctx, "", " Campus Walk", "Campus Walk"),
		"A covered walkway from the Team HQ across the back road to the practice field and the indoor dome. Rain or shine, the team never gets wet on the way to practice!",
		{ At = Vector3.new(0, -5.6, 0) }
	)

	-- the Hydration Station by the practice field's side gate
	local cooler = span(walk, "HydrationCooler", -0.2, PAVE, 406.3, 2.2, PAVE + 2.6, 408.7, COOLER_ORANGE, Enum.Material.SmoothPlastic)
	span(walk, "HydrationCoolerLid", -0.4, PAVE + 2.6, 406.1, 2.4, PAVE + 3, 408.9, WHITE, Enum.Material.SmoothPlastic)
	faceText(cooler, Enum.NormalId.Front, { { Text = "HYDRATE!", Color = WHITE, Y0 = 0.3, Y1 = 0.6 } })
	BuildUtil.Use(walk, cooler, "sportsdrink", {
		Object = "Hydration Station",
		Title = "Hydration Station",
		Info = "Ice-cold sports drinks for the walk to practice. Coaches say: drink up before the first whistle!",
	})
end

---------------------------------------------------------------------------------------------
-- STEP 2: Skybridge to the Hall of Fame
---------------------------------------------------------------------------------------------

local function buildHallBridge(ctx, team)
	BuildUtil.Stage(ctx, 2)
	local m = BuildUtil.Child(ctx, "SkybridgeHallOfFame")
	local accent = textColorOn(team.Primary, { team.Trim, team.Secondary })
	local dark = textColorOn(SIGN_DARK, { team.Trim, team.Secondary, WHITE })

	-- the glass link from the HQ tower's east face
	local l = LINK
	span(m, "LinkFloor", l.MinX, DECK_BOTTOM, l.MinZ, l.MaxX, DECK, l.MaxZ, BRIDGE_FLOOR, Enum.Material.Marble)
	glass(m, "LinkGlass", l.MinX, DECK, l.MinZ, l.MaxX, GLASS_TOP, l.MinZ + 0.4)
	glass(m, "LinkGlass", l.MinX, DECK, l.MaxZ - 0.4, l.MaxX, GLASS_TOP, l.MaxZ)
	span(m, "LinkRoof", l.MinX, GLASS_TOP, l.MinZ - 0.4, l.MaxX, ROOF_TOP, l.MaxZ + 0.4, team.Primary, Enum.Material.SmoothPlastic)
	span(m, "LinkCeiling", l.MinX, GLASS_TOP - 0.3, l.MinZ + 0.4, l.MaxX, GLASS_TOP, l.MaxZ - 0.4, PANEL_WHITE, Enum.Material.SmoothPlastic)
	local linkLight = span(m, "LinkCeilingLight", 120, GLASS_TOP - 0.55, 270, 124, GLASS_TOP - 0.3, 272, LAMP, Enum.Material.Neon, PAINT)
	pointLight(linkLight, nil, 16, 1.2)
	-- the "TEAM HQ" sign at the tower's glass carries players in and out of the tower's landing
	local doorSign = span(m, "SkybridgeDoorSign", l.MinX + 0.2, 23.4, 267, l.MinX + 0.6, 25.3, 275, SIGN_DARK, Enum.Material.SmoothPlastic)
	faceText(doorSign, Enum.NormalId.Right, { { Text = "TEAM HQ  -  UPPER FLOOR", Color = dark } }, { LightInfluence = 0 })
	faceText(doorSign, Enum.NormalId.Left, { { Text = "SKYBRIDGE TO THE HALL OF FAME", Color = dark } }, { LightInfluence = 0 })
	BuildUtil.Elevator(m, doorSign, CFrame.lookAt(HQ_LANDING_EAST, HQ_LANDING_EAST - Vector3.new(1, 0, 0)), {
		Action = "Walk into the HQ",
		Object = "Team HQ - Upper Floor",
		Label = "TEAM HQ - UPPER FLOOR",
		At = Vector3.new(4, -4.4, 0),
		Distance = 5,
	})
	local onBridge = Vector3.new(122.5, DECK, 271)
	BuildUtil.Elevator(m, doorSign, CFrame.lookAt(onBridge, onBridge + Vector3.new(1, 0, 0)), {
		Action = "Walk onto the skybridge",
		Object = "Skybridge to the Hall of Fame",
		Label = "SKYBRIDGE TO THE HALL OF FAME",
		At = Vector3.new(-5, -4.4, 2.5),
		Distance = 5,
	})

	-- THE SKY LOUNGE: a glass pavilion on four team-colour columns
	local g = LOUNGE
	span(m, "LoungeFloor", g.MinX, DECK_BOTTOM, g.MinZ, g.MaxX, DECK, g.MaxZ, BRIDGE_FLOOR, Enum.Material.Marble)
	for _, x in ipairs({ g.MinX, g.MaxX - 1 }) do
		for _, z in ipairs({ g.MinZ, g.MaxZ - 1 }) do
			span(m, "LoungeColumn", x, 0, z, x + 1, TALL_ROOF, z + 1, team.Primary, Enum.Material.SmoothPlastic)
		end
	end
	glass(m, "LoungeGlassNorth", g.MinX + 1, DECK, g.MaxZ - 0.6, g.MaxX - 1, TALL_ROOF, g.MaxZ - 0.2)
	glass(m, "LoungeGlassEast", g.MaxX - 0.6, DECK, g.MinZ + 1, g.MaxX - 0.2, TALL_ROOF, g.MaxZ - 1)
	glass(m, "LoungeGlassWest", g.MinX + 0.2, DECK, g.MinZ + 1, g.MinX + 0.6, TALL_ROOF, l.MinZ)
	glass(m, "LoungeGlassWest", g.MinX + 0.2, DECK, l.MaxZ, g.MinX + 0.6, TALL_ROOF, g.MaxZ - 1)
	span(m, "LoungeHeader", g.MinX, GLASS_TOP, l.MinZ, g.MinX + 1, TALL_ROOF, l.MaxZ, team.Primary, Enum.Material.SmoothPlastic)
	span(m, "LoungeHeader", g.MinX + 1, GLASS_TOP, g.MinZ, g.MaxX - 1, TALL_ROOF, g.MinZ + 1, team.Primary, Enum.Material.SmoothPlastic)
	-- a deep roof band (the pavilion's crown) carries the name: seen from the Hall of Fame side over
	-- the bridge roof, from the garage side and from the HQ porch
	local loungeRoof = span(
		m,
		"LoungeRoof",
		g.MinX - 0.4,
		TALL_ROOF,
		g.MinZ - 0.4,
		g.MaxX + 0.4,
		TALL_ROOF + 2.2,
		g.MaxZ + 0.4,
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	for _, face in ipairs({ Enum.NormalId.Front, Enum.NormalId.Back, Enum.NormalId.Left }) do
		faceText(loungeRoof, face, { { Text = "SKY LOUNGE", Color = accent, X0 = 0.08, X1 = 0.92, Y0 = 0.16, Y1 = 0.84 } })
	end
	span(
		m,
		"LoungeCeiling",
		g.MinX + 1,
		TALL_ROOF - 0.3,
		g.MinZ + 1,
		g.MaxX - 1,
		TALL_ROOF,
		g.MaxZ - 1,
		PANEL_WHITE,
		Enum.Material.SmoothPlastic
	)
	local loungeLight =
		span(m, "LoungeCeilingLight", 129, TALL_ROOF - 0.6, 269.5, 139, TALL_ROOF - 0.3, 271.5, LAMP, Enum.Material.Neon, PAINT)
	pointLight(loungeLight, Vector3.new(-3, -0.6, 0), 20, 1.3)
	pointLight(loungeLight, Vector3.new(3, -0.6, 0), 20, 1.3)

	-- smoothie bar along the north glass
	span(m, "SmoothieCounter", 130, DECK, 278.2, 138, DECK + 3.6, 280.2, DARK_WOOD, Enum.Material.Wood)
	local counterTop = span(m, "SmoothieCounterTop", 129.8, DECK + 3.6, 277.9, 138.2, DECK + 4, 280.2, MARBLE, Enum.Material.Marble)
	local menu = span(m, "SmoothieMenu", 130.5, DECK + 5, 279.8, 137.5, DECK + 8, 280.1, SMOOTHIE_PINK, Enum.Material.SmoothPlastic)
	faceText(menu, Enum.NormalId.Front, {
		{ Text = "SMOOTHIE BAR", Color = WHITE, Y0 = 0.1, Y1 = 0.55 },
		{ Text = "BERRY BLITZ - MANGO MOVER - GREEN MACHINE", Color = WHITE, Y0 = 0.62, Y1 = 0.88, Font = Enum.Font.GothamBold },
	}, { LightInfluence = 0 })
	BuildUtil.Use(m, counterTop, "smoothie", {
		Object = "Sky Lounge Smoothie Bar",
		Title = "Sky Lounge Smoothie Bar",
		Info = "Fresh smoothies 17 studs above the campus. The Berry Blitz is the quarterback's favourite!",
		At = Vector3.new(0, 0.6, -1.2),
	})

	post(m, "LoungePlanter", 139.9, 278.9, DECK, DECK + 1.8, 1.8, PLANTER_GREY, Enum.Material.Concrete)
	BuildUtil.Ball(m, {
		Name = "LoungePlant",
		Diameter = 3,
		Position = Vector3.new(139.9, DECK + 3.2, 278.9),
		Color = LEAVES,
		Material = Enum.Material.Grass,
	})

	-- lounge chairs facing the Hall of Fame (one is a TV camera seat)
	bench(m, "LoungeChair", 139.6, 266, DECK, Vector3.new(1, 0, 0), 3, team, { Camera = HALL_CAM, Object = "Hall of Fame Cam" })
	bench(m, "LoungeChair", 139.6, 274.5, DECK, Vector3.new(1, 0, 0), 3, team, { Object = "Lounge Chair" })

	-- campus map + live TV
	-- (the glass beside the link is only 2.9 wide: the map uses its full height and keeps every
	-- line short - a destination and how to get there - so the letters stay big enough to read)
	local map =
		span(m, "CampusMap", g.MinX + 0.6, DECK + 0.4, 277.3, g.MinX + 0.9, DECK + 9.4, 280.2, SIGN_DARK, Enum.Material.SmoothPlastic)
	local how = Enum.Font.GothamBold
	faceText(map, Enum.NormalId.Right, {
		{ Text = "CAMPUS MAP", Color = dark, Y0 = 0.02, Y1 = 0.11 },
		{ Text = "HALL OF FAME", Color = WHITE, Y0 = 0.15, Y1 = 0.27 },
		{ Text = "ACROSS THE SKYBRIDGE", Color = dark, Y0 = 0.27, Y1 = 0.38, Font = how },
		{ Text = "TEAM HQ", Color = WHITE, Y0 = 0.44, Y1 = 0.56 },
		{ Text = "THROUGH THE GLASS LINK", Color = dark, Y0 = 0.56, Y1 = 0.67, Font = how },
		{ Text = "FIELDS, DOME + CARTS", Color = WHITE, Y0 = 0.73, Y1 = 0.85 },
		{ Text = "DOWN THE CAMPUS WALK", Color = dark, Y0 = 0.85, Y1 = 0.96, Font = how },
	}, { LightInfluence = 0, PixelsPerStud = 40 })
	BuildUtil.Look(
		map,
		"Campus Map",
		"You are in the Sky Lounge! Skybridges join the Team HQ to the Hall of Fame (and later the Dome & Garage tower). Down below, the Campus Walk leads to the practice field and the indoor dome.",
		{ At = Vector3.new(1, -1.5, 0) }
	)
	local tv =
		span(m, "LoungeTV", g.MaxX - 1.1, DECK + 4.6, 268.5, g.MaxX - 0.8, DECK + 7.6, 272.5, SCREEN_DARK, Enum.Material.SmoothPlastic)
	BuildUtil.LiveText(tv, Enum.NormalId.Left, "summary", {
		Text = "TEAM HQ",
		BackgroundTransparency = 0,
		BackgroundColor3 = SCREEN_DARK,
		LightInfluence = 0,
		TextColor3 = WHITE,
		PixelsPerStud = 30,
	})

	-- the south bridge
	local b = HOF_BRIDGE
	span(m, "BridgeFloor", b.MinX, DECK_BOTTOM, b.MinZ, b.MaxX, DECK, b.MaxZ, BRIDGE_FLOOR, Enum.Material.Marble)
	glass(m, "BridgeGlass", b.MinX, DECK, b.MinZ, b.MinX + 0.4, GLASS_TOP, b.MaxZ)
	glass(m, "BridgeGlass", b.MaxX - 0.4, DECK, b.MinZ, b.MaxX, GLASS_TOP, b.MaxZ)
	span(m, "BridgeRoof", b.MinX - 0.4, GLASS_TOP, b.MinZ, b.MaxX + 0.4, ROOF_TOP, b.MaxZ, team.Primary, Enum.Material.SmoothPlastic)
	local bridgeName = withTeam(ctx, "", " HALL OF FAME SKYBRIDGE", "HALL OF FAME SKYBRIDGE")
	for _, side in ipairs({ { b.MinX - 0.3, b.MinX, Enum.NormalId.Left }, { b.MaxX, b.MaxX + 0.3, Enum.NormalId.Right } }) do
		local band = span(
			m,
			"BridgeFascia",
			side[1],
			DECK_BOTTOM + 0.3,
			b.MinZ,
			side[2],
			DECK - 0.3,
			b.MaxZ,
			team.Primary,
			Enum.Material.SmoothPlastic
		)
		faceText(band, side[3], { { Text = bridgeName, Color = accent, X0 = 0.2, X1 = 0.8 } })
	end
	for _, x in ipairs({ b.MinX + 0.4, b.MaxX - 0.7 }) do
		span(m, "BridgeHandrail", x, DECK + 2.8, b.MinZ, x + 0.3, DECK + 3.2, b.MaxZ, BRUSHED, Enum.Material.Metal)
	end
	span(
		m,
		"BridgeCeiling",
		b.MinX + 0.4,
		GLASS_TOP - 0.3,
		b.MinZ,
		b.MaxX - 0.4,
		GLASS_TOP,
		b.MaxZ,
		PANEL_WHITE,
		Enum.Material.SmoothPlastic
	)
	local bridgeLight = span(
		m,
		"BridgeCeilingLight",
		133.7,
		GLASS_TOP - 0.55,
		b.MinZ + 2,
		134.3,
		GLASS_TOP - 0.3,
		b.MaxZ - 2,
		LAMP,
		Enum.Material.Neon,
		PAINT
	)
	pointLight(bridgeLight, Vector3.new(0, -0.6, -7), 18, 1.1)
	pointLight(bridgeLight, Vector3.new(0, -0.6, 7), 18, 1.1)

	-- THE HALL OF FAME TOWER: limestone ground floor, glass on top, a glass elevator inside
	local t = HOF_TOWER
	local doorX0, doorX1 = 133.5, t.MaxX - 1 -- ground doorways (south door + north opening)
	span(m, "HallTowerFloor", t.MinX, 0, t.MinZ, t.MaxX, 0.2, t.MaxZ, MARBLE, Enum.Material.Marble)
	span(m, "HallTowerUpperFloor", t.MinX, DECK_BOTTOM, t.MinZ, t.MaxX, DECK, t.MaxZ, BRIDGE_FLOOR, Enum.Material.Marble)
	for _, x in ipairs({ t.MinX, t.MaxX - 1 }) do
		for _, z in ipairs({ t.MinZ, t.MaxZ - 1 }) do
			span(m, "HallTowerColumn", x, 0, z, x + 1, TALL_ROOF, z + 1, team.Primary, Enum.Material.SmoothPlastic)
		end
	end
	for _, z in ipairs({ t.MinZ, t.MaxZ - 1 }) do
		span(m, "HallTowerStone", t.MinX + 1, 0.2, z, doorX0, DECK_BOTTOM, z + 1, LIMESTONE, Enum.Material.Limestone)
		span(m, "HallTowerStone", doorX0, 9.2, z, doorX1, DECK_BOTTOM, z + 1, LIMESTONE, Enum.Material.Limestone)
	end
	span(m, "HallTowerStone", t.MinX, 0.2, t.MinZ + 1, t.MinX + 1, DECK_BOTTOM, t.MaxZ - 1, LIMESTONE, Enum.Material.Limestone)
	glass(m, "HallTowerGlassEast", t.MaxX - 0.6, 0.2, t.MinZ + 1, t.MaxX - 0.2, TALL_ROOF, t.MaxZ - 1)
	glass(m, "HallTowerGlassWest", t.MinX + 0.2, DECK, t.MinZ + 1, t.MinX + 0.6, TALL_ROOF, t.MaxZ - 1)
	glass(m, "HallTowerGlassSouth", t.MinX + 1, DECK, t.MinZ + 0.2, t.MaxX - 1, TALL_ROOF, t.MinZ + 0.6)
	span(m, "HallTowerHeader", t.MinX + 1, GLASS_TOP, t.MaxZ - 1, t.MaxX - 1, TALL_ROOF, t.MaxZ, team.Primary, Enum.Material.SmoothPlastic)
	span(
		m,
		"HallTowerRoof",
		t.MinX - 0.4,
		TALL_ROOF,
		t.MinZ - 0.4,
		t.MaxX + 0.4,
		TALL_ROOF + 1,
		t.MaxZ + 0.4,
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	local crown =
		span(m, "HallTowerSign", t.MinX + 1, TALL_ROOF + 1, 221.7, t.MaxX - 1, TALL_ROOF + 4, 222.3, SIGN_DARK, Enum.Material.SmoothPlastic)
	-- (the Hall of Fame is to the east: on the left seen from the south, on the right from the north)
	faceText(crown, Enum.NormalId.Front, { { Text = "<  HALL OF FAME", Color = dark } }, { LightInfluence = 0 })
	faceText(crown, Enum.NormalId.Back, { { Text = "HALL OF FAME  >", Color = dark } }, { LightInfluence = 0 })
	span(
		m,
		"HallTowerCeiling",
		t.MinX + 1,
		TALL_ROOF - 0.3,
		t.MinZ + 1,
		t.MaxX - 1,
		TALL_ROOF,
		t.MaxZ - 1,
		PANEL_WHITE,
		Enum.Material.SmoothPlastic
	)
	for _, y in ipairs({ DECK_BOTTOM, TALL_ROOF - 0.3 }) do
		local lamp = span(m, "HallTowerCeilingLight", 134, y - 0.35, 219, 140, y, 225, LAMP, Enum.Material.Neon, PAINT)
		pointLight(lamp, Vector3.new(0, -0.6, 0), 20, 1.3)
	end
	-- the glass doors to the forecourt (the north side stays an open doorway under the bridge)
	BuildUtil.Door(m, {
		Name = "HallTowerDoors",
		Size = Vector3.new(doorX1 - doorX0, 9, 0.4),
		CFrame = CFrame.new((doorX0 + doorX1) / 2, 0.2 + 4.5, t.MinZ + 0.5),
		Double = true,
		Slide = true,
		Color = DOOR_GLASS,
		Material = Enum.Material.Glass,
		Transparency = 0.45,
		Object = "Glass Doors",
		Title = "Hall of Fame Tower",
		Info = "Out these doors and up the steps on your right: the Hall of Fame. Up the glass elevator: the skybridge back to the Team HQ.",
		Distance = 8,
	})
	glassElevator(m, "HallTowerElevator", {
		X0 = 127,
		X1 = 133,
		Z0 = 218,
		Z1 = 226,
		Face = "+X",
		Top = TALL_ROOF,
		Levels = {
			{
				Y = 0.2,
				Name = "HALL OF FAME",
				Target = CFrame.lookAt(Vector3.new(137, 0.2, 222), Vector3.new(137, 0.2, 200)),
				Action = "Ride down to the Hall of Fame",
			},
			{
				Y = DECK,
				Name = "SKYBRIDGE",
				Target = CFrame.lookAt(Vector3.new(137, DECK, 222), Vector3.new(137, DECK, 240)),
				Action = "Ride up to the skybridge",
			},
		},
	}, team)
	local plaque =
		span(m, "WalkOfChampionsPlaque", t.MinX + 1, 3, 213.6, t.MinX + 1.2, 7, 217.4, GOLD, Enum.Material.Metal, { Reflectance = 0.2 })
	faceText(plaque, Enum.NormalId.Right, {
		{ Text = "WALK OF CHAMPIONS", Color = INK, Y0 = 0.12, Y1 = 0.42 },
		{ Text = "EVERY LEGEND CROSSED THIS BRIDGE", Color = INK, Y0 = 0.55, Y1 = 0.85, Font = Enum.Font.GothamBold },
	})
	BuildUtil.Look(
		plaque,
		"Walk of Champions",
		"Every legend in the Hall of Fame walked across this skybridge. How many championships has your team won?",
		{
			LookKey = "titles",
			At = Vector3.new(1.5, 0, 0),
		}
	)
	bench(m, "TowerWindowBench", 134, 214.4, DECK, Vector3.new(0, 0, -1), 5, team, { Camera = STADIUM_CAM, Object = "Stadium Cam" })

	-- paving: under the lounge + bridge (HQ tower portal -> tower), and the forecourt in front of the doors
	span(m, "SkybridgeUnderpass", PORCH.MaxX, 0, t.MaxZ, g.MaxX - 1, PAVE, g.MaxZ, PAVER, Enum.Material.Slate)
	span(m, "HallTowerForecourt", FORECOURT.MinX, 0, FORECOURT.MinZ, FORECOURT.MaxX, PAVE, FORECOURT.MaxZ, PAVER, Enum.Material.Slate)
end

---------------------------------------------------------------------------------------------
-- STEP 3: Skybridge to the Dome & Garage
---------------------------------------------------------------------------------------------

local function buildDomeBridge(ctx, team)
	BuildUtil.Stage(ctx, 3)
	local m = BuildUtil.Child(ctx, "SkybridgeDome")
	local dark = textColorOn(SIGN_DARK, { team.Trim, team.Secondary, WHITE })

	local b = DOME_BRIDGE
	span(m, "DomeBridgeFloor", b.MinX, DECK_BOTTOM, b.MinZ, b.MaxX, DECK, b.MaxZ, BRIDGE_FLOOR, Enum.Material.Marble)
	glass(m, "DomeBridgeGlass", b.MinX, DECK, b.MinZ, b.MinX + 0.4, GLASS_TOP, b.MaxZ)
	glass(m, "DomeBridgeGlass", b.MaxX - 0.4, DECK, b.MinZ, b.MaxX, GLASS_TOP, b.MaxZ)
	span(m, "DomeBridgeRoof", b.MinX - 0.4, GLASS_TOP, b.MinZ, b.MaxX + 0.4, ROOF_TOP, b.MaxZ, team.Primary, Enum.Material.SmoothPlastic)
	for _, x in ipairs({ b.MinX + 0.4, b.MaxX - 0.7 }) do
		span(m, "DomeBridgeHandrail", x, DECK + 2.8, b.MinZ, x + 0.3, DECK + 3.2, b.MaxZ, BRUSHED, Enum.Material.Metal)
	end
	for _, x in ipairs({ b.MinX - 0.3, b.MaxX }) do
		span(m, "DomeBridgeFascia", x, DECK_BOTTOM + 0.3, b.MinZ, x + 0.3, DECK - 0.3, b.MaxZ, team.Primary, Enum.Material.SmoothPlastic)
	end
	span(
		m,
		"DomeBridgeCeiling",
		b.MinX + 0.4,
		GLASS_TOP - 0.3,
		b.MinZ,
		b.MaxX - 0.4,
		GLASS_TOP,
		b.MaxZ,
		PANEL_WHITE,
		Enum.Material.SmoothPlastic
	)
	local strip = span(
		m,
		"DomeBridgeCeilingLight",
		108.7,
		GLASS_TOP - 0.55,
		b.MinZ + 2,
		109.3,
		GLASS_TOP - 0.3,
		b.MaxZ - 2,
		LAMP,
		Enum.Material.Neon,
		PAINT
	)
	for i = -2, 2 do
		pointLight(strip, Vector3.new(0, -0.6, i * 22), 20, 1.1)
	end
	-- white Warren trusses outside the glass on both sides
	local panelLength = (b.MaxZ - b.MinZ) / TRUSS_PANELS
	for _, x in ipairs({ b.MinX - 0.35, b.MaxX + 0.35 }) do
		for i = 0, TRUSS_PANELS - 1 do
			local z0, z1 = b.MinZ + i * panelLength, b.MinZ + (i + 1) * panelLength
			local low, high = DECK_BOTTOM + 0.6, GLASS_TOP + 0.4
			local a = Vector3.new(x, i % 2 == 0 and low or high, z0 + 0.4)
			local c = Vector3.new(x, i % 2 == 0 and high or low, z1 - 0.4)
			strut(m, "TrussDiagonal", a, c, 0.5, PANEL_WHITE, Enum.Material.SmoothPlastic)
		end
	end
	-- portal piers beside the road (their legs wrap the walkway's columns)
	for _, z in ipairs(PIER_Z) do
		for _, x in ipairs({ WALK_W, WALK_E }) do
			post(m, "PierLeg", x, z, 0, DECK_BOTTOM - 1, 1.6, PANEL_WHITE, Enum.Material.SmoothPlastic)
		end
		span(
			m,
			"PierBeam",
			WALK_W - 0.8,
			DECK_BOTTOM - 1,
			z - 0.6,
			WALK_E + 0.8,
			DECK_BOTTOM,
			z + 0.6,
			team.Primary,
			Enum.Material.SmoothPlastic
		)
	end
	-- signs for the cart drivers on the back road
	local roadText = withTeam(ctx, "", " SKYBRIDGE", "CAMPUS SKYBRIDGE")
	local westBoard =
		span(m, "RoadSign", b.MinX - 1.1, DECK_BOTTOM - 0.2, 374, b.MinX - 0.7, DECK + 0.2, 384, SIGN_DARK, Enum.Material.SmoothPlastic)
	faceText(westBoard, Enum.NormalId.Left, { { Text = roadText, Color = dark } }, { LightInfluence = 0 })
	local eastBoard =
		span(m, "RoadSign", b.MaxX + 0.7, DECK_BOTTOM - 0.2, 374, b.MaxX + 1.1, DECK + 0.2, 384, SIGN_DARK, Enum.Material.SmoothPlastic)
	faceText(eastBoard, Enum.NormalId.Right, { { Text = roadText, Color = dark } }, { LightInfluence = 0 })

	-- the "TEAM HQ" sign at the HQ tower's north glass (carries players in and out of its landing)
	local doorSign = span(m, "SkybridgeDoorSign", 105, 23.4, b.MinZ + 0.2, 113, 25.3, b.MinZ + 0.6, SIGN_DARK, Enum.Material.SmoothPlastic)
	faceText(doorSign, Enum.NormalId.Back, { { Text = "TEAM HQ  -  UPPER FLOOR", Color = dark } }, { LightInfluence = 0 })
	faceText(doorSign, Enum.NormalId.Front, { { Text = "SKYBRIDGE TO THE DOME", Color = dark } }, { LightInfluence = 0 })
	BuildUtil.Elevator(m, doorSign, CFrame.lookAt(HQ_LANDING_NORTH, HQ_LANDING_NORTH - Vector3.new(0, 0, 1)), {
		Action = "Walk into the HQ",
		Object = "Team HQ - Upper Floor",
		Label = "TEAM HQ - UPPER FLOOR",
		At = Vector3.new(0, -4.4, 4),
		Distance = 5,
	})
	local onBridge = Vector3.new(109, DECK, 289.5)
	BuildUtil.Elevator(m, doorSign, CFrame.lookAt(onBridge, onBridge + Vector3.new(0, 0, 1)), {
		Action = "Walk onto the skybridge",
		Object = "Skybridge to the Dome & Garage",
		Label = "SKYBRIDGE TO THE DOME",
		At = Vector3.new(-1.5, -4.4, -5),
		Distance = 5,
	})

	-- the garage overlook: a TV camera bench and a sign looking across at the golf cart garage
	bench(m, "GarageOverlookBench", 105.2, 348, DECK, Vector3.new(1, 0, 0), 5, team, { Camera = CART_CAM, Object = "Cart Cam" })
	local garageSign =
		span(m, "GarageOverlookSign", b.MaxX - 1, DECK + 4, 345, b.MaxX - 0.7, DECK + 6.2, 351, SIGN_DARK, Enum.Material.SmoothPlastic)
	faceText(garageSign, Enum.NormalId.Left, { { Text = "GOLF CART GARAGE", Color = dark } }, { LightInfluence = 0 })
	BuildUtil.Look(
		garageSign,
		"Golf Cart Garage",
		"Right across the way! The garage keeps the team's golf carts charged and ready. Grab one and cruise around your whole franchise.",
		{ At = Vector3.new(-1.5, -1, 0) }
	)

	-- over the back road: a window plaque
	local roadPlaque =
		span(m, "RoadViewPlaque", b.MinX + 0.7, DECK + 4, 376, b.MinX + 1, DECK + 6.2, 382, SIGN_DARK, Enum.Material.SmoothPlastic)
	faceText(roadPlaque, Enum.NormalId.Right, { { Text = "BACK ROAD BELOW", Color = dark } }, { LightInfluence = 0 })
	BuildUtil.Look(
		roadPlaque,
		"Over the Back Road",
		"You are 15 studs above the back road! Golf carts zoom underneath while the team walks across in the dry.",
		{ At = Vector3.new(1.5, -1, 0) }
	)

	-- THE DOME & GARAGE TOWER at the end, beside the promenade
	local t = DOME_TOWER
	local doorX0, doorX1 = 105, 113
	-- (a marble threshold reaches the promenade's paving at z 399, so there is no gap at the doors)
	span(m, "DomeTowerFloor", t.MinX, 0, PROMENADE.MaxZ, t.MaxX, 0.2, t.MaxZ, MARBLE, Enum.Material.Marble)
	span(m, "DomeTowerUpperFloor", t.MinX, DECK_BOTTOM, t.MinZ, t.MaxX, DECK, t.MaxZ, BRIDGE_FLOOR, Enum.Material.Marble)
	for _, x in ipairs({ t.MinX, t.MaxX - 1 }) do
		for _, z in ipairs({ t.MinZ, t.MaxZ - 1 }) do
			span(m, "DomeTowerColumn", x, 0, z, x + 1, TALL_ROOF, z + 1, team.Primary, Enum.Material.SmoothPlastic)
		end
	end
	local sz0, sz1 = t.MinZ, t.MinZ + 1
	span(m, "DomeTowerStone", t.MinX + 1, 0.2, sz0, doorX0, DECK_BOTTOM, sz1, LIMESTONE, Enum.Material.Limestone)
	span(m, "DomeTowerStone", doorX1, 0.2, sz0, t.MaxX - 1, DECK_BOTTOM, sz1, LIMESTONE, Enum.Material.Limestone)
	local doorHead = span(m, "DomeTowerStone", doorX0, 9.2, sz0, doorX1, DECK_BOTTOM, sz1, LIMESTONE, Enum.Material.Limestone)
	-- (low on the stone, under the promenade canopy's edge at y 12.3, so walkers can read it)
	faceText(doorHead, Enum.NormalId.Front, { { Text = "DOME & GARAGE TOWER", Color = INK, Y0 = 0.52, Y1 = 0.84 } })
	span(m, "DomeTowerStone", t.MinX + 1, 0.2, t.MaxZ - 1, t.MaxX - 1, DECK_BOTTOM, t.MaxZ, LIMESTONE, Enum.Material.Limestone)
	glass(m, "DomeTowerGlassSouth", t.MinX + 1, DECK, sz0 + 0.2, b.MinX, TALL_ROOF, sz0 + 0.6)
	glass(m, "DomeTowerGlassSouth", b.MaxX, DECK, sz0 + 0.2, t.MaxX - 1, TALL_ROOF, sz0 + 0.6)
	span(m, "DomeTowerHeader", b.MinX, GLASS_TOP, sz0, b.MaxX, TALL_ROOF, sz1, team.Primary, Enum.Material.SmoothPlastic)
	glass(m, "DomeTowerGlassNorth", t.MinX + 1, DECK, t.MaxZ - 0.6, t.MaxX - 1, TALL_ROOF, t.MaxZ - 0.2)
	glass(m, "DomeTowerGlassEast", t.MaxX - 0.6, 0.2, t.MinZ + 1, t.MaxX - 0.2, TALL_ROOF, t.MaxZ - 1)
	glass(m, "DomeTowerGlassWest", t.MinX + 0.2, 0.2, t.MinZ + 1, t.MinX + 0.6, TALL_ROOF, t.MaxZ - 1)
	span(
		m,
		"DomeTowerRoof",
		t.MinX - 0.4,
		TALL_ROOF,
		t.MinZ - 0.4,
		t.MaxX + 0.4,
		TALL_ROOF + 1,
		t.MaxZ + 0.4,
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	local crown =
		span(m, "DomeTowerSign", t.MinX + 1, TALL_ROOF + 1, 404.7, t.MaxX - 1, TALL_ROOF + 4, 405.3, SIGN_DARK, Enum.Material.SmoothPlastic)
	faceText(crown, Enum.NormalId.Front, { { Text = "DOME + FIELDS", Color = dark } }, { LightInfluence = 0 })
	faceText(crown, Enum.NormalId.Back, { { Text = withTeam(ctx, "", " CAMPUS", "TEAM CAMPUS"), Color = dark } }, { LightInfluence = 0 })
	span(
		m,
		"DomeTowerCeiling",
		t.MinX + 1,
		TALL_ROOF - 0.3,
		t.MinZ + 1,
		t.MaxX - 1,
		TALL_ROOF,
		t.MaxZ - 1,
		PANEL_WHITE,
		Enum.Material.SmoothPlastic
	)
	for _, y in ipairs({ DECK_BOTTOM, TALL_ROOF - 0.3 }) do
		local lamp = span(m, "DomeTowerCeilingLight", 105, y - 0.35, 400.8, 113, y, 403.2, LAMP, Enum.Material.Neon, PAINT)
		pointLight(lamp, Vector3.new(0, -0.6, 0), 18, 1.3)
	end
	BuildUtil.Door(m, {
		Name = "DomeTowerDoors",
		Size = Vector3.new(doorX1 - doorX0, 9, 0.4),
		CFrame = CFrame.new((doorX0 + doorX1) / 2, 0.2 + 4.5, sz0 + 0.5),
		Double = true,
		Slide = true,
		Color = DOOR_GLASS,
		Material = Enum.Material.Glass,
		Transparency = 0.45,
		Object = "Glass Doors",
		Title = "Dome & Garage Tower",
		Info = "Out onto the Campus Walk: the indoor dome is a few steps to the right, the practice field down the walk to the left, the golf carts back across the road.",
		Distance = 8,
	})
	glassElevator(m, "DomeTowerElevator", {
		X0 = 105,
		X1 = 113,
		Z0 = 404.6,
		Z1 = t.MaxZ - 1,
		Face = "-Z",
		Top = TALL_ROOF,
		Levels = {
			{
				Y = 0.2,
				Name = "CAMPUS WALK",
				Target = CFrame.lookAt(Vector3.new(109, 0.2, 402.2), Vector3.new(109, 0.2, 390)),
				Action = "Ride down to the Campus Walk",
			},
			{
				Y = DECK,
				Name = "SKYBRIDGE",
				Target = CFrame.lookAt(Vector3.new(109, DECK, 402), Vector3.new(109, DECK, 390)),
				Action = "Ride up to the skybridge",
			},
		},
	}, team)
	-- the vending machine fills the back of the nook between the west glass and the elevator shaft
	-- (flush against the glass, the back wall and the shaft, facing the doors), so the nook is a
	-- shallow alcove open along its whole width instead of a pocket with a narrow way out
	local vending = span(m, "VendingMachine", t.MinX + 0.6, 0.2, 405.9, 105, 7.2, t.MaxZ - 1, VENDING_RED, Enum.Material.SmoothPlastic)
	faceText(vending, Enum.NormalId.Front, {
		{ Text = "ICE COLD", Color = WHITE, Y0 = 0.08, Y1 = 0.2 },
		{ Text = "SODA", Color = WHITE, Y0 = 0.22, Y1 = 0.45 },
	}, { LightInfluence = 0 })
	BuildUtil.Use(m, vending, "soda", {
		Object = "Vending Machine",
		Title = "Vending Machine",
		Info = "A cold soda for the walk to practice. Press the big button and listen for the clunk!",
		At = Vector3.new(0, -0.5, -1.6),
	})
	-- (wide along the east glass, so each line reads at about 0.6 studs)
	local directory = span(m, "DomeTowerDirectory", t.MaxX - 1, 2.2, 401, t.MaxX - 0.7, 7.8, 407.4, SIGN_DARK, Enum.Material.SmoothPlastic)
	faceText(directory, Enum.NormalId.Left, {
		{ Text = "DIRECTORY", Color = dark, Y0 = 0.04, Y1 = 0.2 },
		{ Text = "INDOOR DOME: OUT + RIGHT", Color = WHITE, Y0 = 0.26, Y1 = 0.46, Font = Enum.Font.GothamBold },
		{ Text = "PRACTICE FIELD: OUT + LEFT", Color = WHITE, Y0 = 0.51, Y1 = 0.71, Font = Enum.Font.GothamBold },
		{ Text = "GOLF CARTS: ACROSS THE ROAD", Color = WHITE, Y0 = 0.76, Y1 = 0.96, Font = Enum.Font.GothamBold },
	}, { LightInfluence = 0, PixelsPerStud = 40 })
	BuildUtil.Look(
		directory,
		"Dome & Garage Tower",
		"The far end of the Dome & Garage skybridge. Ride up to walk back to the Team HQ above the cart garage and the back road, or head out to the indoor dome and the practice field.",
		{ LookKey = "season", At = Vector3.new(-1.5, -1, 0) }
	)
end

---------------------------------------------------------------------------------------------
-- STEP 4: Landscaping & Lights
---------------------------------------------------------------------------------------------

local function buildLandscaping(ctx, team)
	BuildUtil.Stage(ctx, 4)
	local m = BuildUtil.Child(ctx, "Landscaping")

	-- paths: the Hall of Fame walk and the path from the promenade to the dome's west door
	for _, r in ipairs({ HOF_WALK, SPINE, SPINE_BRANCH }) do
		span(m, "CampusPath", r.MinX, 0, r.MinZ, r.MaxX, PAVE, r.MaxZ, PAVER, Enum.Material.Slate)
	end

	-- hedge planters against the HQ wall under the Campus Walk canopy
	for _, z in ipairs({ { 288.5, 305 }, { 352, 368.5 } }) do
		span(m, "WalkPlanter", HQ_WALK.MinX + 0.2, 0, z[1], HQ_WALK.MinX + 2, 1.5, z[2], PLANTER_GREY, Enum.Material.Concrete)
		span(m, "WalkHedge", HQ_WALK.MinX + 0.4, 1.5, z[1] + 0.2, HQ_WALK.MinX + 1.8, 3.2, z[2] - 0.2, LEAVES_DARK, Enum.Material.Grass)
	end

	-- team banners on the promenade columns, facing the back road
	local initial = withTeam(ctx, "", "", "")
	initial = initial ~= "" and string.sub(initial, 1, 1) or "GO"
	for i, x in ipairs({ 15, 39, 63, 87 }) do
		local color = i % 2 == 1 and team.Primary or team.Secondary
		local banner = span(m, "TeamBanner", x - 1.2, 6, PROM_S - 0.8, x + 1.2, 11.6, PROM_S - 0.6, color, Enum.Material.Fabric, DECOR)
		faceText(
			banner,
			Enum.NormalId.Front,
			{ { Text = initial, Color = textColorOn(color, { team.Trim, WHITE, INK }), Y0 = 0.2, Y1 = 0.8 } }
		)
	end

	-- lamp posts along the open paths
	for _, p in ipairs({ { 114, 191.5 }, { 150, 191.5 }, { 186, 191.5 }, { 19.5, 410 }, { 4.5, 424 }, { 19.5, 435 }, { -5, 413 } }) do
		lampPost(m, p[1], p[2], team)
	end

	-- trees: in planters along the dome's front, beside the dome path and the Hall of Fame walk
	for _, x in ipairs({ 38, 62, 86 }) do
		tree(m, x, 404.5, 7, true)
	end
	tree(m, -1, 427, 8, false)
	tree(m, -1, 445, 8, false)
	tree(m, 150, 208.5, 7, false)
	tree(m, 160, 208.5, 7, false)

	-- team flags beside the Hall of Fame tower
	local flagColors = { team.Primary, team.Secondary, team.Trim }
	local flagPoles = {}
	for i, x in ipairs({ 110, 116, 122 }) do
		local pole = post(m, "FlagPole", x, 206, PAVE, 22, 0.5, BRUSHED, Enum.Material.Metal)
		span(m, "TeamFlag", x + 0.25, 18.4, 205.9, x + 4.9, 21.6, 206.1, flagColors[i], Enum.Material.Fabric, DECOR)
		BuildUtil.Ball(
			m,
			{ Name = "FlagPoleCap", Diameter = 0.9, Position = Vector3.new(x, 22.3, 206), Color = GOLD, Material = Enum.Material.Metal }
		)
		flagPoles[i] = pole
	end
	BuildUtil.Look(flagPoles[2], "Team Flags", "The team colours fly over the campus every day of the season.", {
		LookKey = "team",
		At = Vector3.new(4.5 - (22 - PAVE) / 2, 0, 0), -- (a vertical cylinder's local X axis points up)
	})

	-- benches beside the dome path
	bench(m, "PathBench", 20, 418, PAVE, Vector3.new(-1, 0, 0), 5, team, { Object = "Bench" })
	bench(m, "PathBench", 4.2, 434, PAVE, Vector3.new(1, 0, 0), 5, team, { Object = "Bench" })

	-- wayfinding signposts
	signpost(
		m,
		"PorchSignpost",
		PORCH.MaxX - 0.8,
		284.5,
		{
			{ Dir = "-Z", Text = "HALL OF FAME" },
			{ Dir = "+Z", Text = "FIELDS + DOME" },
			{ Dir = "+Z", Text = "GOLF CARTS" },
		},
		team,
		"Campus Signpost",
		"Hall of Fame: this way past the Sky Lounge. Practice field, indoor dome and golf carts: follow the Campus Walk along the HQ."
	)
	signpost(
		m,
		"JunctionSignpost",
		92,
		403,
		{
			{ Dir = "-X", Text = "PRACTICE FIELD" },
			{ Dir = "+X", Text = "INDOOR DOME" },
			{ Dir = "-Z", Text = "TEAM HQ" },
		},
		team,
		"Campus Signpost",
		"Practice field: down the promenade. Indoor dome: the big entrance just past the tower. Team HQ and the Hall of Fame: back across the road."
	)
	signpost(
		m,
		"FieldSignpost",
		5.5,
		403.6,
		{
			{ Dir = "-X", Text = "PRACTICE FIELD" },
			{ Dir = "+Z", Text = "DOME WEST DOOR" },
			{ Dir = "+X", Text = "TEAM HQ" },
		},
		team,
		"Campus Signpost",
		"The practice field's side gate is right here. The dome's west door is up the path, and the Team HQ is back along the Campus Walk."
	)
end

---------------------------------------------------------------------------------------------
-- Piece
---------------------------------------------------------------------------------------------

function CampusLinks.campus_links(ctx)
	local team = ctx.colors
	buildWalkway(ctx, team)
	buildHallBridge(ctx, team)
	buildDomeBridge(ctx, team)
	buildLandscaping(ctx, team)
end

return CampusLinks
