--[[
	HQShell
	The EMPTY Team HQ building every plot starts with. PlotBase.lua calls HQShell.Build(ctx) once
	per plot. It is never built in steps (no BuildUtil.Stage) and ctx.teamName is still empty, so
	all printed text is generic ("TEAM HEADQUARTERS"); the team name and the owner appear through
	live text (BuildUtil.LiveText) on the facade sign and the entrance monument.

	Footprint Config.Layout.HQ = X[-250, 100] Z[200, 360], 30 tall (parapet 31):
	  * Front (-Z) facade: glass curtain wall - a granite plinth, a tall glass band, a white floor
	    band, a second glass band and a team-colour cornice - with team-colour fins. The GRAND
	    ENTRANCE (16.8 tall) sits at the end of the HQ entrance walk (X[-112, -88]): a team-colour
	    portal, two glass revolving doors (no collision), a cantilevered canopy on two columns with
	    a lit "MAIN ENTRANCE" fascia and a big lit "TEAM HEADQUARTERS" sign above it. Outside:
	    three team flags, two planters with trees and a monument sign beside the walk.
	  * Sides + back: precast cladding with two window strips under a team-colour parapet band
	    ("TEAM HQ" / "TEAM HEADQUARTERS"), team-colour corner piers and back pilasters, and an EXIT
	    doorway with sliding glass doors at each end of the corridor (west: cart road, under a
	    small canopy; east: the glass elevator tower).
	  * Roof (y 29..30): a gabled glass lantern over the lobby, four skylights over the corridor,
	    steel beams underneath, HVAC units, two solar arrays and a helipad on top.
	  * Glass elevator tower X[100, 118] Z[258, 284] outside the east doors: a glass lobby (open
	    toward the Hall of Fame), a glass shaft with a cab at each landing (sliding doors, call
	    panel + cab buttons that ride to the other landing) and a glass top floor level with the
	    roof, whose sliding doors open onto the Sky Deck through a gap in the east parapet.
	  * The SKY DECK roof terrace X[74.5, 98.4] Z[202, 358.4] (wood deck top 30.3, from the front
	    edge of the roof to the back edge): glass railings, planters and two trees, string lights,
	    a cafe table, benches facing the stadium (BLIMP CAM seat) and the campus (CAMPUS CAM
	    seat) and three telescopes (stadium, practice field + TELESCOPE CAM stool, dome).
	  * Interactions: look prompts on the revolving doors, the monument, the WELCOME banner and
	    the two HQ directories (corridor end walls, above the EXIT signs); doors, seats,
	    elevators and telescopes as above; the corridor benches are seats too.
	  * Inside: polished concrete floor (top y = 0.2) and a lighter corridor with team-colour edge
	    lines, a team medallion and wayfinding arrows (room lists on their shafts) at the lobby.
	    Every room zone (Config.Layout.Zones.hq_*) is a raw-concrete pad outlined in layout
	    yellow with a flat "FUTURE <ROOM>" floor label; the room pieces cover them when built.
	  * Room-name signs hang from the roof (y 15..19) over the corridor, beside each room's buy
	    button (front row faces +Z, back row faces -Z); the lobby gets a big WELCOME banner.
	    Ceiling light panels and strips, EXIT signs, fire extinguishers and two benches.

	Nothing collidable stands inside a room zone, in the corridor (y 0.8..9) or on the HQ entrance
	walk: the benches, extinguishers and revolving doors don't collide.

	Paint heights on the floor (top 0.2): zone outline plates 0.22, room pads 0.24, label carriers
	0.25 (invisible), corridor 0.23 (edges 0.24), arrows + medallion 0.26, entrance mat 0.28.
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)

local HQShell = {}

local FLOOR_TOP = 0.2
local WALL_T = 1.5
local ROOF_BOTTOM = 29
local ROOF_TOP = 30
local PARAPET_TOP = 31
local ENTRANCE_TOP = 16.8
local CANOPY_BOTTOM = 17.2
local EXIT_HALF = 4 -- exit doorways at both ends of the corridor (8 wide)
local EXIT_TOP = 10
local SIGN_Y = 17 -- centre of the hanging room-name signs (15..19)
local SIGN_SIZE = Vector3.new(18, 4, 0.6)

-- Strips of the cladded walls (sides + back): { bottom, top, kind }
local WALL_BANDS = {
	{ 0, 11, "Cladding" },
	{ 11, 15, "WindowStrip" },
	{ 15, 22, "Cladding" },
	{ 22, 27, "WindowStrip" },
}
local PARAPET_BOTTOM = 27

local PAINT = { CanCollide = false, CastShadow = false }
local DECOR = { CanCollide = false }

local WHITE = Color3.fromRGB(248, 248, 248)
local INK = Color3.fromRGB(22, 22, 26)
local FLOOR_CONCRETE = Color3.fromRGB(188, 188, 184)
local CORRIDOR_FLOOR = Color3.fromRGB(230, 228, 220)
local RAW_CONCRETE = Color3.fromRGB(134, 136, 140)
local LAYOUT_YELLOW = Color3.fromRGB(255, 198, 30)
local CLADDING = Color3.fromRGB(222, 222, 216)
local PLINTH = Color3.fromRGB(64, 66, 72)
local SLAB_WHITE = Color3.fromRGB(240, 240, 236)
local FACADE_GLASS = Color3.fromRGB(120, 176, 212)
local STRIP_GLASS = Color3.fromRGB(64, 98, 124)
local ROOF_GREY = Color3.fromRGB(196, 198, 202)
local STEEL = Color3.fromRGB(62, 64, 70)
local HVAC_GREY = Color3.fromRGB(170, 174, 180)
local LAMP = Color3.fromRGB(255, 248, 232)
local WARM_LIGHT = Color3.fromRGB(255, 236, 200)
local SIGN_DARK = Color3.fromRGB(28, 30, 36)
local EXIT_GREEN = Color3.fromRGB(60, 235, 110)
local FIRE_RED = Color3.fromRGB(200, 28, 30)
local STONE = Color3.fromRGB(120, 120, 126)
local BUSH = Color3.fromRGB(56, 122, 62)
local LEAVES = Color3.fromRGB(72, 140, 70)
local TRUNK = Color3.fromRGB(104, 74, 48)
local WOOD = Color3.fromRGB(150, 105, 60)
local HELIPAD = Color3.fromRGB(58, 60, 66)
local SOLAR_BLUE = Color3.fromRGB(34, 52, 96)
local DOOR_GLASS = Color3.fromRGB(170, 214, 236)
local DECK_WOOD = Color3.fromRGB(156, 112, 72)
local PLANTER_GREY = Color3.fromRGB(96, 98, 104)
local BULB = Color3.fromRGB(255, 214, 140)
local CAB_WOOD = Color3.fromRGB(122, 86, 56)
local BUTTON_GLOW = Color3.fromRGB(120, 220, 255)

-- Glass elevator tower outside the east exit + the Sky Deck (roof terrace) it serves. The tower's
-- top floor sits level with the roof (floor top = ROOF_TOP) and steps out onto the deck through a
-- gap in the east parapet. Parts above the roof are named "Roof..." so --noroof previews hide them.
local TOWER = { MinX = 100, MaxX = 118, MinZ = 258, MaxZ = 284 }
local LOBBY_CEILING = 12 -- the tower's ground lobby ceiling (12 .. 12.6)
local TOWER_CEILING = 40 -- top floor ceiling = the tower roof (40 .. 41)
local SHAFT = { MinX = 103, MaxX = 115, MinZ = 258.6, FaceZ0 = 265, FaceZ1 = 265.5 } -- doors in the north face
local SHAFT_DOOR_HALF = 3
local SHAFT_DOOR_H = 8.2
-- (the deck runs from the front edge of the roof to the back edge, so the telescopes at both ends
-- can see over the parapet; it stays clear of the corridor skylights at x < 74)
local DECK = { MinX = 74.5, MaxX = 98.4, MinZ = 202, MaxZ = 358.4, Top = 30.3 }

local FACADE_GLASS_PROPS = { Transparency = 0.35, Reflectance = 0.15 }
local STRIP_GLASS_PROPS = { Transparency = 0.3, Reflectance = 0.2 }
local SKYLIGHT_PROPS = { Transparency = 0.45, Reflectance = 0.1, CastShadow = false }

-- The rooms (Config.Layout.Zones) with their buy-button X (Items.lua: the front row's buttons sit
-- in the corridor at z = 268, the back row's at z = 274). The hanging sign sits halfway between
-- the button and the middle of the room, so it covers both the button and the doorway beside it.
local FRONT_ROOMS = {
	{ id = "hq_frontoffice", name = "FRONT OFFICE", buttonX = -232 },
	{ id = "hq_coaches", name = "COACHES' OFFICES", buttonX = -183 },
	{ id = "hq_lobby", name = "LOBBY & RECEPTION", buttonX = -100, lobby = true },
	{ id = "hq_interview", name = "INTERVIEW ROOM", buttonX = -33 },
	{ id = "hq_meeting", name = "TEAM MEETING ROOM", buttonX = 17 },
	{ id = "hq_lounge", name = "PLAYER LOUNGE", buttonX = 66 },
}
local BACK_ROOMS = {
	{ id = "hq_lockerroom", name = "LOCKER ROOM", buttonX = -216 },
	{ id = "hq_equipment", name = "EQUIPMENT ROOM", buttonX = -167 },
	{ id = "hq_weightroom", name = "WEIGHT ROOM", buttonX = -117 },
	{ id = "hq_trainingroom", name = "TRAINING ROOM", buttonX = -67 },
	{ id = "hq_filmroom", name = "FILM ROOM", buttonX = -17 },
	{ id = "hq_cafeteria", name = "CAFETERIA", buttonX = 57 },
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

-- Axis-aligned block between two corners (plot-local).
local function span(ctx, name, xa, ya, za, xb, yb, zb, color, material, extra)
	return BuildUtil.Box(
		ctx,
		name,
		Vector3.new(xb - xa, yb - ya, zb - za),
		Vector3.new((xa + xb) / 2, (ya + yb) / 2, (za + zb) / 2),
		color,
		material,
		extra
	)
end

-- A wall slab running along `axis` ("X" or "Z") from u0 to u1, thickness t0..t1 across it.
local function wallSlab(ctx, name, axis, u0, u1, t0, t1, y0, y1, color, material, extra)
	if axis == "X" then
		return span(ctx, name, u0, y0, t0, u1, y1, t1, color, material, extra)
	end
	return span(ctx, name, t0, y0, u0, t1, y1, u1, color, material, extra)
end

--[[
	Writes stacked lines of text on `faces` of `part`.
	lines: { { Text, Weight (share of the height, default 1), Color, Font } }
	o: TextColor3, Font, PixelsPerStud, LightInfluence, InsetX / InsetY (fraction of the face
	   left empty around the text), TextStrokeTransparency,
	   BorderStuds + BorderColor3 (a frame of that colour around the face, the part colour inside)
	Returns the TextLabels of the first face (so callers can change the text later).
]]
local function panelText(part, faces, lines, o)
	o = o or {}
	local pps = o.PixelsPerStud or 20
	local border = math.floor((o.BorderStuds or 0) * pps + 0.5)
	local insetX = o.InsetX or 0.05
	local insetY = o.InsetY or 0.12
	local total = 0
	for _, line in ipairs(lines) do
		total += line.Weight or 1
	end
	local firstLabels
	for _, face in ipairs(faces) do
		local gui = Instance.new("SurfaceGui")
		gui.Name = part.Name .. face.Name .. "Gui"
		gui.Face = face
		gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
		gui.PixelsPerStud = pps
		gui.LightInfluence = o.LightInfluence or 1
		gui.Parent = part
		if border > 0 then
			local frame = Instance.new("Frame")
			frame.Name = "Border"
			frame.Size = UDim2.new(1, 0, 1, 0)
			frame.BackgroundColor3 = o.BorderColor3 or WHITE
			frame.BorderSizePixel = 0
			frame.ZIndex = 1
			frame.Parent = gui
			local inner = Instance.new("Frame")
			inner.Name = "Panel"
			inner.Position = UDim2.new(0, border, 0, border)
			inner.Size = UDim2.new(1, -2 * border, 1, -2 * border)
			inner.BackgroundColor3 = part.Color
			inner.BorderSizePixel = 0
			inner.ZIndex = 1
			inner.Parent = frame
		end
		local labels = {}
		local y = insetY
		for index, line in ipairs(lines) do
			local h = (1 - 2 * insetY) * (line.Weight or 1) / total
			local label = Instance.new("TextLabel")
			label.Name = "Line" .. index
			label.BackgroundTransparency = 1
			label.BorderSizePixel = 0
			label.Position = UDim2.new(insetX, 0, y, 0)
			label.Size = UDim2.new(1 - 2 * insetX, 0, h, 0)
			label.Font = line.Font or o.Font or Enum.Font.GothamBlack
			label.Text = line.Text
			label.TextColor3 = line.Color or o.TextColor3 or WHITE
			label.TextScaled = true
			label.TextStrokeTransparency = o.TextStrokeTransparency or 1
			label.ZIndex = 2
			label.Parent = gui
			table.insert(labels, label)
			y += h
		end
		firstLabels = firstLabels or labels
	end
	return firstLabels
end

--[[
	A sign whose first line is live text (BuildUtil.LiveText: the server writes the owner's team /
	name into it once the plot is owned; `placeholder` shows until then) over a static second line.
	o: TextColor3, SubColor3, LiveWeight (share of the height for the live line, default 0.6),
	   BorderStuds + BorderColor3, InsetX, InsetY, PixelsPerStud, LightInfluence, LabelName
	Returns the live TextLabel.
]]
local function liveSign(part, face, live, placeholder, subline, o)
	local pps = o.PixelsPerStud or 20
	local _, label = BuildUtil.LiveText(part, face, live, {
		LabelName = o.LabelName or (part.Name .. "Live"),
		Text = placeholder,
		TextColor3 = o.TextColor3,
		PixelsPerStud = pps,
		LightInfluence = o.LightInfluence or 0,
		Font = Enum.Font.GothamBlack,
	})
	local gui = label.Parent
	local insetX, insetY = o.InsetX or 0.05, o.InsetY or 0.12
	local liveShare = o.LiveWeight or 0.6
	local inner = 1 - 2 * insetY
	label.Position = UDim2.new(insetX, 0, insetY, 0)
	label.Size = UDim2.new(1 - 2 * insetX, 0, inner * (subline and liveShare or 1), 0)
	label.ZIndex = 2
	if subline then
		local sub = Instance.new("TextLabel")
		sub.Name = (o.LabelName or part.Name) .. "Sub"
		sub.BackgroundTransparency = 1
		sub.BorderSizePixel = 0
		sub.Position = UDim2.new(insetX, 0, insetY + inner * liveShare, 0)
		sub.Size = UDim2.new(1 - 2 * insetX, 0, inner * (1 - liveShare), 0)
		sub.Font = Enum.Font.GothamBold
		sub.Text = subline
		sub.TextColor3 = o.SubColor3 or o.TextColor3
		sub.TextScaled = true
		sub.ZIndex = 2
		sub.Parent = gui
	end
	local border = math.floor((o.BorderStuds or 0) * pps + 0.5)
	if border > 0 then
		local frame = Instance.new("Frame")
		frame.Name = "Border"
		frame.Size = UDim2.new(1, 0, 1, 0)
		frame.BackgroundColor3 = o.BorderColor3 or WHITE
		frame.BorderSizePixel = 0
		frame.ZIndex = 1
		frame.Parent = gui
		local panel = Instance.new("Frame")
		panel.Name = "Panel"
		panel.Position = UDim2.new(0, border, 0, border)
		panel.Size = UDim2.new(1, -2 * border, 1, -2 * border)
		panel.BackgroundColor3 = part.Color
		panel.BorderSizePixel = 0
		panel.ZIndex = 1
		panel.Parent = frame
	end
	return label
end

--[[
	The HQ directory: a header, two columns of rooms (the reader's left and right, nearest first)
	and a footer line, on one face of `part` (a dark lit board).
]]
local function directoryText(part, face, columns, footer, accent)
	local gui = Instance.new("SurfaceGui")
	gui.Name = "DirectoryGui"
	gui.Face = face
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 40
	gui.LightInfluence = 0
	gui.Parent = part
	local function line(name, text, x, y, w, h, color, font, alignment)
		local label = Instance.new("TextLabel")
		label.Name = name
		label.BackgroundTransparency = 1
		label.BorderSizePixel = 0
		label.Position = UDim2.new(x, 0, y, 0)
		label.Size = UDim2.new(w, 0, h, 0)
		label.Font = font or Enum.Font.GothamBold
		label.Text = text
		label.TextColor3 = color
		label.TextScaled = true
		label.TextXAlignment = alignment or Enum.TextXAlignment.Left
		label.Parent = gui
		return label
	end
	line("Header", "HQ DIRECTORY", 0.05, 0.03, 0.9, 0.13, accent, Enum.Font.GothamBlack, Enum.TextXAlignment.Center)
	local bar = Instance.new("Frame")
	bar.Name = "HeaderBar"
	bar.BackgroundColor3 = accent
	bar.BorderSizePixel = 0
	bar.Position = UDim2.new(0.05, 0, 0.175, 0)
	bar.Size = UDim2.new(0.9, 0, 0.012, 0)
	bar.Parent = gui
	for c, column in ipairs(columns) do
		local x = c == 1 and 0.05 or 0.53
		line("ColumnTitle", column.title, x, 0.21, 0.42, 0.065, accent, Enum.Font.GothamBlack)
		for r, room in ipairs(column.rooms) do
			line("Room", room, x, 0.29 + (r - 1) * 0.085, 0.42, 0.07, WHITE)
		end
	end
	line("Footer", footer, 0.05, 0.84, 0.9, 0.11, accent, Enum.Font.GothamBlack, Enum.TextXAlignment.Center)
end

-- A flat arrow painted on the floor along X: a shaft from tailX and a head (two flat wedges)
-- ending at tipX, paint from y0 to y0 + 0.03. `lines` are written on the shaft, reading upright
-- for players who walk up to it along +Z (from the lobby).
local function floorArrow(ctx, name, tailX, tipX, z, y0, color, lines, textColor)
	local dir = tipX > tailX and 1 or -1
	local headLength, headHalf, shaftHalf, thick = 6, 3, 1.8, 0.03
	local baseX = tipX - dir * headLength
	local shaft = BuildUtil.Part(ctx, {
		Name = name .. "Shaft",
		Size = Vector3.new(math.abs(baseX - tailX), thick, shaftHalf * 2),
		CFrame = CFrame.new((tailX + baseX) / 2, y0 + thick / 2, z) * CFrame.Angles(0, math.pi, 0),
		Color = color,
		Material = Enum.Material.SmoothPlastic,
		CanCollide = false,
		CastShadow = false,
	})
	local textLines = {}
	for _, text in ipairs(lines) do
		table.insert(textLines, { Text = text, Color = textColor })
	end
	panelText(shaft, { Enum.NormalId.Top }, textLines, { PixelsPerStud = 30, InsetX = 0.03, InsetY = 0.1 })
	-- each half of the head is a wedge laid flat: its height axis points at the tip and its
	-- right angle sits on the arrow's centre line at the base of the head
	for _, side in ipairs({ -1, 1 }) do
		local vY = Vector3.new(dir, 0, 0)
		local vZ = Vector3.new(0, 0, -side)
		local centre = Vector3.new(baseX + dir * headLength / 2, y0 + thick / 2, z + side * headHalf / 2)
		BuildUtil.Wedge(ctx, {
			Name = name .. "Head",
			Size = Vector3.new(thick, headLength, headHalf),
			CFrame = CFrame.fromMatrix(centre, vY:Cross(vZ), vY, vZ),
			Color = color,
			Material = Enum.Material.SmoothPlastic,
			CanCollide = false,
			CastShadow = false,
		})
	end
end

-- Invisible flat carrier with "FUTURE <ROOM>" text on its Top face. Top-face text reads upright
-- from the carrier's +Z side, so rooms read from -Z get the carrier turned around.
local function floorLabel(ctx, name, x, z, width, depth, readFromMinusZ, roomName, hint)
	local carrier = BuildUtil.Part(ctx, {
		Name = name,
		Size = Vector3.new(width, 0.01, depth),
		CFrame = CFrame.new(x, 0.245, z) * CFrame.Angles(0, readFromMinusZ and math.pi or 0, 0),
		Transparency = 1,
		CanCollide = false,
		CastShadow = false,
	})
	panelText(carrier, { Enum.NormalId.Top }, {
		{ Text = "FUTURE", Weight = 1, Color = LAYOUT_YELLOW },
		{ Text = roomName, Weight = 2.2, Color = WHITE },
		{ Text = hint, Weight = 0.8, Color = LAYOUT_YELLOW, Font = Enum.Font.GothamBold },
	}, { PixelsPerStud = 12, InsetX = 0.04, InsetY = 0.06, TextStrokeTransparency = 0.75 })
	return carrier
end

-- Two thin rods from the top of a hanging sign up to the underside of the roof.
local function hangerRods(ctx, x, offset, z, top)
	for _, s in ipairs({ -1, 1 }) do
		BuildUtil.Cylinder(ctx, {
			Name = "SignHangerRod",
			Position = Vector3.new(x + s * offset, (top + ROOF_BOTTOM) / 2, z),
			Height = ROOF_BOTTOM - top,
			Diameter = 0.25,
			Axis = "Y",
			Color = STEEL,
			Material = Enum.Material.Metal,
			CanCollide = false,
		})
	end
end

---------------------------------------------------------------------------------------------
-- Floor: polished concrete, corridor, room-zone pads + labels, wayfinding
---------------------------------------------------------------------------------------------

local function buildFloor(ctx, S, team)
	local L = S.L
	local floor = BuildUtil.Child(ctx, "Floor")

	-- one slab under the whole building; its edges stay 0.1 inside the outer wall faces and it
	-- runs through the entrance and exit doorways
	span(floor, "HQFloor", S.x0 + 0.1, 0, S.z0 + 0.1, S.x1 - 0.1, FLOOR_TOP, S.z1 - 0.1, FLOOR_CONCRETE, Enum.Material.Concrete, {
		Reflectance = 0.06,
	})

	-- corridor: lighter terrazzo stripe between two team-colour edge lines
	local cor = L.HQCorridor
	span(
		floor,
		"CorridorFloor",
		S.x0 + 0.1,
		FLOOR_TOP,
		cor.MinZ + 0.6,
		S.x1 - 0.1,
		0.23,
		cor.MaxZ - 0.6,
		CORRIDOR_FLOOR,
		Enum.Material.Marble,
		PAINT
	)
	for _, z in ipairs({ cor.MinZ, cor.MaxZ - 0.6 }) do
		span(floor, "CorridorEdgeLine", S.ix0, FLOOR_TOP, z, S.ix1, 0.24, z + 0.6, team.Primary, Enum.Material.SmoothPlastic, PAINT)
	end

	-- room zones: one layout-yellow plate per row with a raw-concrete pad per room on top, so
	-- every room shows a yellow outline; plus a flat "FUTURE <ROOM>" label
	local zones = L.Zones
	local rows = {
		{ rooms = FRONT_ROOMS, readFromMinusZ = false },
		{ rooms = BACK_ROOMS, readFromMinusZ = true },
	}
	local inset = 0.6
	for _, row in ipairs(rows) do
		local first, last = zones[row.rooms[1].id], zones[row.rooms[#row.rooms].id]
		span(
			floor,
			"ZoneOutline",
			first.MinX,
			FLOOR_TOP,
			first.MinZ,
			last.MaxX,
			0.22,
			first.MaxZ,
			LAYOUT_YELLOW,
			Enum.Material.SmoothPlastic,
			PAINT
		)
		for _, room in ipairs(row.rooms) do
			local zone = zones[room.id]
			span(
				floor,
				"ZonePad_" .. room.id,
				zone.MinX + inset,
				0.22,
				zone.MinZ + inset,
				zone.MaxX - inset,
				0.24,
				zone.MaxZ - inset,
				RAW_CONCRETE,
				Enum.Material.Concrete,
				PAINT
			)
			local cx, cz = (zone.MinX + zone.MaxX) / 2, (zone.MinZ + zone.MaxZ) / 2
			local hint = "BUILD IT WITH THE BUY BUTTON IN THE HALLWAY"
			local readFromMinusZ = row.readFromMinusZ
			if room.lobby then
				-- behind the lobby's buy button, read by players walking in through the entrance
				cz = zone.MaxZ - 20
				hint = "STEP ON THE BUY BUTTON BY THE DOOR TO START"
				readFromMinusZ = true
			end
			local width = math.min(zone.MaxX - zone.MinX - 8, 40)
			floorLabel(floor, "FloorLabel_" .. room.id, cx, cz, width, 16, readFromMinusZ, room.name, hint)
		end
	end

	-- entrance mat in front of the doors (stops short of the spawn point)
	local walk = L.HQEntranceWalk
	-- (turned around: Top-face text reads upright from the part's +Z side, players walk in along +Z)
	local matZ0, matZ1 = S.z0 + 0.2, L.HQSpawn.Z - 4.5
	local mat = BuildUtil.Part(floor, {
		Name = "EntranceMat",
		Size = Vector3.new(walk.MaxX - walk.MinX - 8, 0.08, matZ1 - matZ0),
		CFrame = CFrame.new((walk.MinX + walk.MaxX) / 2, FLOOR_TOP + 0.04, (matZ0 + matZ1) / 2) * CFrame.Angles(0, math.pi, 0),
		Color = team.Primary,
		Material = Enum.Material.Fabric,
		CanCollide = false,
		CastShadow = false,
	})
	panelText(mat, { Enum.NormalId.Top }, {
		{ Text = "TEAM HQ", Color = textColorOn(team.Primary, { team.Trim, team.Secondary }) },
	}, { PixelsPerStud = 16, InsetX = 0.1, InsetY = 0.18 })

	-- wayfinding at the lobby / corridor junction: a team medallion and two arrows in the
	-- front lane (clear of every buy button) with the room lists written on their shafts
	local junctionX = (walk.MinX + walk.MaxX) / 2
	local midZ = (cor.MinZ + cor.MaxZ) / 2
	BuildUtil.Cylinder(floor, {
		Name = "CorridorMedallionRing",
		Position = Vector3.new(junctionX, 0.24, midZ),
		Height = 0.02,
		Diameter = 10,
		Axis = "Y",
		Color = team.Trim,
		Material = Enum.Material.SmoothPlastic,
		CanCollide = false,
		CastShadow = false,
	})
	BuildUtil.Cylinder(floor, {
		Name = "CorridorMedallion",
		Position = Vector3.new(junctionX, 0.245, midZ),
		Height = 0.03,
		Diameter = 8.8,
		Axis = "Y",
		Color = team.Primary,
		Material = Enum.Material.SmoothPlastic,
		CanCollide = false,
		CastShadow = false,
	})
	-- (front lane: no buy buttons between the coaches' and the interview room's; the back-row
	-- buttons at x = -117 / -67 stay clear of the arrow heads)
	local laneZ = cor.MinZ + 3.8
	local arrowText = textColorOn(team.Primary, { team.Trim, team.Secondary })
	floorArrow(floor, "WayfindingArrowWest", junctionX - 6, junctionX - 29, laneZ, 0.23, team.Primary, {
		"LOCKER ROOM  |  EQUIPMENT",
		"WEIGHT ROOM  |  OFFICES",
	}, arrowText)
	floorArrow(floor, "WayfindingArrowEast", junctionX + 6, junctionX + 29, laneZ, 0.23, team.Primary, {
		"TRAINING  |  FILM  |  CAFETERIA",
		"INTERVIEW  |  MEETING  |  LOUNGE",
	}, arrowText)
end

---------------------------------------------------------------------------------------------
-- Walls: glass front facade, cladded sides + back, corner piers, exit doorways
---------------------------------------------------------------------------------------------

-- A cladded wall (sides + back) with two window strips and a team-colour parapet band.
-- door = { from, to } along the wall for an exit doorway (EXIT_TOP tall), or nil.
-- roofGap = { from, to }: the parapet stops at the roof surface there (a doorway onto the roof).
-- Returns the (longest) parapet part.
local function claddedWall(ctx, name, axis, u0, u1, t0, t1, door, team, roofGap)
	local mid = (t0 + t1) / 2
	for _, band in ipairs(WALL_BANDS) do
		local y0, y1, kind = band[1], band[2], band[3]
		if kind == "WindowStrip" then
			wallSlab(ctx, name .. kind, axis, u0, u1, mid - 0.3, mid + 0.3, y0, y1, STRIP_GLASS, Enum.Material.Glass, STRIP_GLASS_PROPS)
		elseif door and y0 < EXIT_TOP then
			wallSlab(ctx, name .. kind, axis, u0, door[1], t0, t1, y0, y1, CLADDING, Enum.Material.Concrete)
			wallSlab(ctx, name .. kind, axis, door[2], u1, t0, t1, y0, y1, CLADDING, Enum.Material.Concrete)
			wallSlab(ctx, name .. "DoorLintel", axis, door[1], door[2], t0, t1, EXIT_TOP, y1, CLADDING, Enum.Material.Concrete)
		else
			wallSlab(ctx, name .. kind, axis, u0, u1, t0, t1, y0, y1, CLADDING, Enum.Material.Concrete)
		end
	end
	local function parapet(a, b, top)
		return wallSlab(ctx, name .. "Parapet", axis, a, b, t0, t1, PARAPET_BOTTOM, top, team.Primary, Enum.Material.SmoothPlastic)
	end
	if not roofGap then
		return parapet(u0, u1, PARAPET_TOP)
	end
	parapet(roofGap[1], roofGap[2], ROOF_TOP)
	local first = parapet(u0, roofGap[1], PARAPET_TOP)
	local second = parapet(roofGap[2], u1, PARAPET_TOP)
	return (roofGap[1] - u0 > u1 - roofGap[2]) and first or second
end

local function buildWalls(ctx, S, team)
	local L = S.L
	local walls = BuildUtil.Child(ctx, "Walls")
	local walk = L.HQEntranceWalk
	local wx0, wx1 = walk.MinX, walk.MaxX -- the entrance opening
	local fz0, fz1 = S.z0, S.iz0 -- front wall thickness
	local gz0, gz1 = fz0 + 0.45, fz1 - 0.45 -- glass sits in the middle of it

	-- Front facade: plinth + tall glass beside the entrance, then full-width bands above it
	for _, seg in ipairs({ { S.x0, wx0 }, { wx1, S.x1 } }) do
		span(walls, "FacadePlinth", seg[1], 0, fz0, seg[2], 2, fz1, PLINTH, Enum.Material.Granite)
		span(walls, "FacadeGlass", seg[1], 2, gz0, seg[2], 17, gz1, FACADE_GLASS, Enum.Material.Glass, FACADE_GLASS_PROPS)
		span(walls, "FacadeTransom", seg[1], 9.3, fz0 + 0.2, seg[2], 9.8, fz1 - 0.2, STEEL, Enum.Material.Metal)
	end
	span(walls, "FacadeFloorBand", S.x0, 17, fz0, S.x1, 19.5, fz1, SLAB_WHITE, Enum.Material.SmoothPlastic)
	span(walls, "FacadeUpperGlass", S.x0, 19.5, gz0, S.x1, PARAPET_BOTTOM, gz1, FACADE_GLASS, Enum.Material.Glass, FACADE_GLASS_PROPS)
	span(walls, "FacadeCornice", S.x0, PARAPET_BOTTOM, fz0, S.x1, PARAPET_TOP, fz1, team.Primary, Enum.Material.SmoothPlastic)

	-- team-colour fins in front of the glass (none in front of the entrance portal)
	local finStep = 17.5
	for k = 1, math.floor((S.x1 - S.x0) / finStep) - 1 do
		local x = S.x0 + k * finStep
		if x < wx0 - 4 or x > wx1 + 4 then
			span(walls, "FacadeFin", x - 0.4, 0, fz0 - 1.6, x + 0.4, PARAPET_TOP, fz0, team.Secondary, Enum.Material.SmoothPlastic)
		end
	end

	-- Sides + back: cladding with window strips; exit doorways at both corridor ends
	local cor = L.HQCorridor
	local doorZ = (cor.MinZ + cor.MaxZ) / 2
	local door = { doorZ - EXIT_HALF, doorZ + EXIT_HALF }
	local westBand = claddedWall(walls, "WestWall", "Z", S.iz0, S.iz1, S.x0, S.ix0, door, team)
	-- (the east parapet opens where the elevator tower's top floor steps out onto the Sky Deck)
	local eastBand = claddedWall(walls, "EastWall", "Z", S.iz0, S.iz1, S.ix1, S.x1, door, team, door)
	local backBand = claddedWall(walls, "BackWall", "X", S.x0, S.x1, S.iz1, S.z1, nil, team)
	local bandText = textColorOn(team.Primary, { team.Trim, team.Secondary })
	panelText(westBand, { Enum.NormalId.Left }, { { Text = "TEAM HQ", Color = bandText } }, { PixelsPerStud = 8, InsetY = 0.14 })
	panelText(eastBand, { Enum.NormalId.Right }, { { Text = "TEAM HQ", Color = bandText } }, { PixelsPerStud = 8, InsetY = 0.14 })
	panelText(backBand, { Enum.NormalId.Back }, { { Text = "TEAM HEADQUARTERS", Color = bandText } }, { PixelsPerStud = 8, InsetY = 0.14 })

	-- team-colour corner piers (they also close the reveals where the glass meets the corners)
	for _, cx in ipairs({ { S.x0 - 0.6, S.ix0 + 0.4 }, { S.ix1 - 0.4, S.x1 + 0.6 } }) do
		for _, cz in ipairs({ { S.z0 - 0.6, S.iz0 + 0.4 }, { S.iz1 - 0.4, S.z1 + 0.6 } }) do
			span(walls, "CornerPier", cx[1], 0, cz[1], cx[2], PARAPET_TOP + 0.2, cz[2], team.Primary, Enum.Material.SmoothPlastic)
		end
	end
	-- pilasters on the back facade (it faces the practice fields)
	for _, x in ipairs({ -180, -110, -40, 30 }) do
		span(walls, "BackPilaster", x - 0.8, 0, S.z1, x + 0.8, PARAPET_TOP, S.z1 + 0.8, team.Secondary, Enum.Material.SmoothPlastic)
	end

	-- EXIT signs over the two exit doorways (facing into the corridor)
	for _, side in ipairs({ { x = S.ix0 + 0.15, face = Enum.NormalId.Right }, { x = S.ix1 - 0.15, face = Enum.NormalId.Left } }) do
		local exitSign = BuildUtil.Box(
			walls,
			"ExitSign",
			Vector3.new(0.3, 1.4, 4),
			Vector3.new(side.x, EXIT_TOP + 0.9, doorZ),
			SIGN_DARK,
			Enum.Material.SmoothPlastic,
			DECOR
		)
		panelText(exitSign, { side.face }, { { Text = "EXIT", Color = EXIT_GREEN } }, { LightInfluence = 0, InsetY = 0.14 })
	end
	-- and a small team-colour canopy over the west one outside (the east one opens into the
	-- elevator tower's lobby)
	span(
		walls,
		"ExitCanopy",
		S.x0 - 4,
		EXIT_TOP + 0.3,
		door[1] - 2,
		S.x0 + 0.1,
		EXIT_TOP + 0.9,
		door[2] + 2,
		team.Primary,
		Enum.Material.SmoothPlastic
	)

	-- sliding glass doors in both exit doorways (they slide into the wall)
	local doorHeight = EXIT_TOP - FLOOR_TOP
	for _, exit in ipairs({
		{
			name = "WestDoors",
			x = (S.x0 + S.ix0) / 2,
			title = "West Doors",
			info = "The way out to the cart road on the west edge of your campus. Follow it to the practice field behind the HQ!",
		},
		{
			name = "EastDoors",
			x = (S.ix1 + S.x1) / 2,
			title = "East Doors",
			info = "Through here: the glass elevator up to the Sky Deck on the roof, and the path to the Hall of Fame.",
		},
	}) do
		local centre = Vector3.new(exit.x, FLOOR_TOP + doorHeight / 2, doorZ)
		BuildUtil.Door(walls, {
			Name = exit.name,
			Size = Vector3.new(door[2] - door[1], doorHeight, 0.4),
			CFrame = CFrame.lookAt(centre, centre + Vector3.new(1, 0, 0)),
			Double = true,
			Slide = true,
			Color = DOOR_GLASS,
			Material = Enum.Material.Glass,
			Transparency = 0.45,
			Object = "Glass Doors",
			Title = exit.title,
			Info = exit.info,
			Distance = 8,
		})
	end
end

---------------------------------------------------------------------------------------------
-- Grand entrance + forecourt (outside the front facade, z < 200)
---------------------------------------------------------------------------------------------

local function buildEntrance(ctx, S, team)
	local L = S.L
	local C = ctx.config.Colors
	local entrance = BuildUtil.Child(ctx, "Entrance")
	local walk = L.HQEntranceWalk
	local wx0, wx1 = walk.MinX, walk.MaxX
	local cx = (wx0 + wx1) / 2
	local fz0 = S.z0

	-- team-colour portal around the opening (jambs reach 0.2 into it so no faces line up)
	for _, jamb in ipairs({ { wx0 - 2.5, wx0 + 0.2 }, { wx1 - 0.2, wx1 + 2.5 } }) do
		span(entrance, "EntrancePortal", jamb[1], 0, fz0 - 2, jamb[2], ENTRANCE_TOP, S.iz0 + 0.3, team.Primary, Enum.Material.SmoothPlastic)
	end
	span(
		entrance,
		"EntrancePortalHead",
		wx0 - 2.5,
		ENTRANCE_TOP,
		fz0 - 2,
		wx1 + 2.5,
		19.7,
		S.iz0 + 0.3,
		team.Primary,
		Enum.Material.SmoothPlastic
	)

	-- EXIT sign on the inside of the portal head
	local exitSign =
		span(entrance, "ExitSign", cx - 2.5, 17.4, S.iz0 + 0.3, cx + 2.5, 18.8, S.iz0 + 0.5, SIGN_DARK, Enum.Material.SmoothPlastic, DECOR)
	panelText(exitSign, { Enum.NormalId.Back }, { { Text = "EXIT", Color = EXIT_GREEN } }, { LightInfluence = 0, InsetY = 0.14 })

	-- two glass revolving doors in the opening (they don't collide, the doorway stays open)
	for _, dx in ipairs({ -6.5, 6.5 }) do
		local p = Vector3.new(cx + dx, 0, fz0 + 0.6)
		local drum = BuildUtil.Cylinder(entrance, {
			Name = "RevolvingDoorDrum",
			Position = p + Vector3.new(0, FLOOR_TOP + 4.5, 0),
			Height = 9,
			Diameter = 7,
			Axis = "Y",
			Color = C.Glass,
			Material = Enum.Material.Glass,
			Transparency = 0.72,
			CanCollide = false,
			CastShadow = false,
		})
		if dx < 0 then
			BuildUtil.Look(
				drum,
				"Revolving Doors",
				"The front door of your franchise! Spin through the glass and you're in the lobby, where every owner starts the day.",
				{ Distance = 8 }
			)
		end
		BuildUtil.Cylinder(entrance, {
			Name = "RevolvingDoorCap",
			Position = p + Vector3.new(0, FLOOR_TOP + 9.4, 0),
			Height = 0.8,
			Diameter = 7.6,
			Axis = "Y",
			Color = STEEL,
			Material = Enum.Material.Metal,
			CanCollide = false,
		})
		for _, angle in ipairs({ 45, -45 }) do
			BuildUtil.Part(entrance, {
				Name = "RevolvingDoorWing",
				Size = Vector3.new(6.8, 8.8, 0.15),
				CFrame = CFrame.new(p + Vector3.new(0, FLOOR_TOP + 4.5, 0)) * CFrame.Angles(0, math.rad(angle), 0),
				Color = C.Glass,
				Material = Enum.Material.Glass,
				Transparency = 0.5,
				CanCollide = false,
				CastShadow = false,
			})
		end
	end

	-- cantilevered canopy over the entrance walk on two slim columns, lit from below
	local canopyX0, canopyX1 = wx0 - 12, wx1 + 12
	local canopyZ0 = walk.MinZ + 1
	local canopy = span(
		entrance,
		"EntranceCanopy",
		canopyX0,
		CANOPY_BOTTOM,
		canopyZ0,
		canopyX1,
		CANOPY_BOTTOM + 2,
		fz0,
		team.Secondary,
		Enum.Material.SmoothPlastic
	)
	panelText(canopy, { Enum.NormalId.Front }, {
		{ Text = "MAIN ENTRANCE", Color = textColorOn(team.Secondary, { team.Primary, team.Trim }) },
	}, { PixelsPerStud = 20, InsetX = 0.3, InsetY = 0.12, LightInfluence = 0.5 })
	local downlight = span(
		entrance,
		"CanopyDownlight",
		canopyX0 + 2,
		CANOPY_BOTTOM - 0.2,
		canopyZ0 + 0.4,
		canopyX1 - 2,
		CANOPY_BOTTOM,
		canopyZ0 + 1,
		LAMP,
		Enum.Material.Neon,
		PAINT
	)
	BuildUtil.Light(downlight, "SpotLight", {
		Name = "CanopyLight",
		Face = Enum.NormalId.Bottom,
		Range = 26,
		Angle = 110,
		Brightness = 2,
		Color = WARM_LIGHT,
	})
	for _, x in ipairs({ wx0 - 6, wx1 + 6 }) do
		BuildUtil.Cylinder(entrance, {
			Name = "CanopyColumn",
			Position = Vector3.new(x, CANOPY_BOTTOM / 2, canopyZ0 + 2.5),
			Height = CANOPY_BOTTOM,
			Diameter = 1.2,
			Axis = "Y",
			Color = STEEL,
			Material = Enum.Material.Metal,
		})
	end

	-- the big lit sign above the canopy, mounted on the fins: the team's name (live text - the
	-- shell is built before anyone owns the plot) over HEADQUARTERS
	local facadeSign =
		span(entrance, "HQFacadeSign", cx - 32, 20.4, fz0 - 2.4, cx + 32, 26.4, fz0 - 1.7, SIGN_DARK, Enum.Material.SmoothPlastic)
	local signColor = textColorOn(SIGN_DARK, { team.Trim, team.Secondary, WHITE })
	S.refs.FacadeSignLabel = liveSign(facadeSign, Enum.NormalId.Front, "team", "TEAM", "HEADQUARTERS", {
		LabelName = "FacadeTeamName",
		TextColor3 = signColor,
		SubColor3 = WHITE,
		LiveWeight = 0.62,
		BorderStuds = 0.35,
		BorderColor3 = team.Primary,
		InsetX = 0.06,
		InsetY = 0.12,
	})

	-- planters with a tree on both sides of the doors, in front of the glass
	for _, planter in ipairs({ { wx0 - 28, wx0 - 5, wx0 - 22 }, { wx1 + 5, wx1 + 28, wx1 + 22 } }) do
		local px0, px1, treeX = planter[1], planter[2], planter[3]
		span(entrance, "Planter", px0, 0, fz0 - 6.5, px1, 2, fz0 - 2, STONE, Enum.Material.Concrete)
		span(entrance, "PlanterHedge", px0 + 0.4, 2, fz0 - 6.1, px1 - 0.4, 3.4, fz0 - 2.4, BUSH, Enum.Material.Grass)
		BuildUtil.Cylinder(entrance, {
			Name = "PlanterTreeTrunk",
			Position = Vector3.new(treeX, 5.5, fz0 - 4.25),
			Height = 7,
			Diameter = 0.9,
			Axis = "Y",
			Color = TRUNK,
			Material = Enum.Material.Wood,
		})
		BuildUtil.Ball(entrance, {
			Name = "PlanterTreeCrown",
			Position = Vector3.new(treeX, 10.5, fz0 - 4.25),
			Diameter = 6.4,
			Color = LEAVES,
			Material = Enum.Material.Grass,
		})
	end

	-- three team flags west of the walk, flying away from it
	local flagColors = { team.Primary, team.Trim, team.Secondary }
	for i = 1, 3 do
		local x = wx0 - 34 - (i - 1) * 10
		local h = (i == 2) and 26 or 24
		BuildUtil.Cylinder(entrance, {
			Name = "FlagPole",
			Position = Vector3.new(x, h / 2, fz0 - 6),
			Height = h,
			Diameter = 0.5,
			Axis = "Y",
			Color = C.Metal,
			Material = Enum.Material.Metal,
		})
		span(entrance, "Flag", x - 8.5, h - 6, fz0 - 6.08, x - 0.25, h - 0.6, fz0 - 5.92, flagColors[i], Enum.Material.Fabric, DECOR)
	end

	-- monument sign beside the walk, readable from the campus road
	-- (team name + owner are live text, like the facade sign)
	local mx, mz = wx1 + 17, walk.MinZ + 5
	local monumentBase = span(entrance, "MonumentBase", mx - 7.5, 0, mz - 1.7, mx + 7.5, 1, mz + 1.7, PLINTH, Enum.Material.Granite)
	local _, ownerLabel = BuildUtil.LiveText(monumentBase, Enum.NormalId.Front, "owner", {
		LabelName = "MonumentOwner",
		Text = "OWNER: -",
		TextColor3 = C.Gold,
		Font = Enum.Font.GothamBold,
		PixelsPerStud = 30,
	})
	ownerLabel.Size = UDim2.new(0.8, 0, 0.7, 0)
	ownerLabel.Position = UDim2.new(0.1, 0, 0.15, 0)
	local monument = span(entrance, "Monument", mx - 6.5, 1, mz - 0.7, mx + 6.5, 5.4, mz + 0.7, team.Primary, Enum.Material.SmoothPlastic)
	local monumentText = textColorOn(team.Primary, { team.Trim, team.Secondary })
	S.refs.MonumentLabel = liveSign(monument, Enum.NormalId.Front, "team", "TEAM", "HEADQUARTERS", {
		LabelName = "MonumentTeamName",
		TextColor3 = monumentText,
		LiveWeight = 0.55,
		LightInfluence = 1,
		InsetX = 0.06,
		InsetY = 0.1,
	})
	panelText(monument, { Enum.NormalId.Back }, { { Text = "WELCOME HOME", Color = monumentText } }, { InsetY = 0.3 })
	BuildUtil.Look(
		monument,
		"Team Headquarters",
		"Home of your franchise! Build every room inside step by step - the more you build, the more cash your team earns.",
		{ LookKey = "owner", Distance = 9 }
	)
	span(entrance, "MonumentCap", mx - 7, 5.4, mz - 1, mx + 7, 6, mz + 1, team.Secondary, Enum.Material.SmoothPlastic)
end

---------------------------------------------------------------------------------------------
-- Roof: slabs around a lobby lantern + corridor skylights, beams, HVAC, helipad
---------------------------------------------------------------------------------------------

local function buildRoof(ctx, S)
	local roof = BuildUtil.Child(ctx, "Roof")
	local cor = S.L.HQCorridor
	local function slab(x0, z0, x1, z1)
		span(roof, "RoofSlab", x0, ROOF_BOTTOM, z0, x1, ROOF_TOP, z1, ROOF_GREY, Enum.Material.SmoothPlastic)
	end

	-- lobby lantern opening + the corridor skylight band
	local lx0, lx1, lz0, lz1 = -135, -65, 214, 252
	local sz0, sz1 = cor.MinZ + 2, cor.MaxZ - 2
	slab(S.ix0, S.iz0, S.ix1, lz0)
	slab(S.ix0, lz1, S.ix1, sz0)
	slab(S.ix0, lz0, lx0, lz1)
	slab(lx1, lz0, S.ix1, lz1)
	slab(S.ix0, sz1, S.ix1, S.iz1)
	local skylights = { { -224, -168 }, { -143, -87 }, { -63, -7 }, { 18, 74 } }
	local x = S.ix0
	for _, sky in ipairs(skylights) do
		slab(x, sz0, sky[1], sz1)
		span(
			roof,
			"CorridorSkylight",
			sky[1],
			ROOF_BOTTOM + 0.2,
			sz0,
			sky[2],
			ROOF_TOP + 0.6,
			sz1,
			ctx.config.Colors.Glass,
			Enum.Material.Glass,
			SKYLIGHT_PROPS
		)
		x = sky[2]
	end
	slab(x, sz0, S.ix1, sz1)

	-- gabled glass lantern over the lobby atrium: two wedges meeting at a steel ridge
	local lcx, lcz = (lx0 + lx1) / 2, (lz0 + lz1) / 2
	local half = (lz1 - lz0) / 2
	local rise = 3
	for _, s in ipairs({ -1, 1 }) do
		local props = table.clone(SKYLIGHT_PROPS)
		props.Name = "LobbySkylight"
		props.Size = Vector3.new(lx1 - lx0, rise, half)
		props.CFrame = CFrame.new(lcx, ROOF_BOTTOM + 0.2 + rise / 2, lcz + s * half / 2) * CFrame.Angles(0, s > 0 and math.pi or 0, 0)
		props.Color = ctx.config.Colors.Glass
		props.Material = Enum.Material.Glass
		BuildUtil.Wedge(roof, props)
	end
	span(
		roof,
		"SkylightRidge",
		lx0 - 0.2,
		ROOF_BOTTOM + 0.2 + rise,
		lcz - 0.4,
		lx1 + 0.2,
		ROOF_BOTTOM + 0.7 + rise,
		lcz + 0.4,
		STEEL,
		Enum.Material.Metal
	)

	-- steel beams under the roof (above every room's height limit)
	for _, bx in ipairs({ -175, -100, -25, 50 }) do
		span(roof, "RoofBeam", bx - 0.4, 28, S.iz0, bx + 0.4, ROOF_BOTTOM, S.iz1, STEEL, Enum.Material.Metal)
	end

	-- rooftop plant: two HVAC units with fans
	for _, unit in ipairs({ { -210, 330 }, { -140, 340 } }) do
		span(
			roof,
			"RoofHVAC",
			unit[1] - 7,
			ROOF_TOP,
			unit[2] - 4.5,
			unit[1] + 7,
			ROOF_TOP + 4,
			unit[2] + 4.5,
			HVAC_GREY,
			Enum.Material.Metal
		)
		BuildUtil.Cylinder(roof, {
			Name = "RoofHVACFan",
			Position = Vector3.new(unit[1] + 2.5, ROOF_TOP + 4.3, unit[2]),
			Height = 0.6,
			Diameter = 6,
			Axis = "Y",
			Color = STEEL,
			Material = Enum.Material.DiamondPlate,
		})
	end

	-- two tilted solar arrays facing the stadium (-Z)
	for _, z in ipairs({ 300, 326 }) do
		BuildUtil.Part(roof, {
			Name = "RoofSolarArray",
			Size = Vector3.new(44, 0.4, 12),
			CFrame = CFrame.new(-55, ROOF_TOP + 1.8, z) * CFrame.Angles(math.rad(-15), 0, 0),
			Color = SOLAR_BLUE,
			Material = Enum.Material.Glass,
			Reflectance = 0.25,
		})
	end

	-- helipad: yellow ring, dark pad and a white H
	local hx, hz = 45, 318
	BuildUtil.Cylinder(roof, {
		Name = "RoofHelipadRing",
		Position = Vector3.new(hx, ROOF_TOP + 0.05, hz),
		Height = 0.1,
		Diameter = 27,
		Axis = "Y",
		Color = LAYOUT_YELLOW,
		Material = Enum.Material.SmoothPlastic,
	})
	BuildUtil.Cylinder(roof, {
		Name = "RoofHelipad",
		Position = Vector3.new(hx, ROOF_TOP + 0.1, hz),
		Height = 0.2,
		Diameter = 25,
		Axis = "Y",
		Color = HELIPAD,
		Material = Enum.Material.Asphalt,
	})
	for _, s in ipairs({ -1, 1 }) do
		span(
			roof,
			"RoofHelipadH",
			hx + s * 4 - 0.9,
			ROOF_TOP + 0.2,
			hz - 6,
			hx + s * 4 + 0.9,
			ROOF_TOP + 0.25,
			hz + 6,
			WHITE,
			Enum.Material.SmoothPlastic,
			PAINT
		)
	end
	span(
		roof,
		"RoofHelipadH",
		hx - 3.1,
		ROOF_TOP + 0.2,
		hz - 0.9,
		hx + 3.1,
		ROOF_TOP + 0.25,
		hz + 0.9,
		WHITE,
		Enum.Material.SmoothPlastic,
		PAINT
	)
end

---------------------------------------------------------------------------------------------
-- Interior: hanging room signs, welcome banner, lights, extinguishers, benches
---------------------------------------------------------------------------------------------

local function buildInterior(ctx, S, team)
	local L = S.L
	local inside = BuildUtil.Child(ctx, "Interior")
	local cor = L.HQCorridor
	local zones = L.Zones

	-- room-name signs over the corridor, facing it: front row -> +Z, back row -> -Z
	local signText = textColorOn(team.Primary, { team.Trim, team.Secondary })
	local signRows = {
		{ rooms = FRONT_ROOMS, z = cor.MinZ + 0.6 },
		{ rooms = BACK_ROOMS, z = cor.MaxZ - 0.6 },
	}
	local signTop = SIGN_Y + SIGN_SIZE.Y / 2
	for _, row in ipairs(signRows) do
		for _, room in ipairs(row.rooms) do
			if not room.lobby then
				local zone = zones[room.id]
				local x = (room.buttonX + (zone.MinX + zone.MaxX) / 2) / 2
				local sign = BuildUtil.Box(
					inside,
					"RoomSign_" .. room.id,
					SIGN_SIZE,
					Vector3.new(x, SIGN_Y, row.z),
					team.Primary,
					Enum.Material.SmoothPlastic,
					DECOR
				)
				panelText(sign, { Enum.NormalId.Front, Enum.NormalId.Back }, { { Text = room.name, Color = signText } }, {
					BorderStuds = 0.25,
					BorderColor3 = team.Secondary,
					InsetX = 0.06,
					InsetY = 0.2,
					LightInfluence = 0.4,
				})
				hangerRods(inside, x, SIGN_SIZE.X / 2 - 1.5, row.z, signTop)
			end
		end
	end

	-- the lobby's big WELCOME banner, hanging where the lobby meets the corridor: the front reads
	-- from the entrance (players spawn facing it), the back from the corridor. It is no wider
	-- than the lobby's Big Screen (step 5, just in front of it), which then takes over the view.
	local walk = L.HQEntranceWalk
	local bx = (walk.MinX + walk.MaxX) / 2
	local bannerColor = team.Trim
	local banner = BuildUtil.Box(
		inside,
		"WelcomeBanner",
		Vector3.new(40, 7, 0.4),
		Vector3.new(bx, 20, cor.MinZ + 0.6),
		bannerColor,
		Enum.Material.Fabric,
		DECOR
	)
	local bannerText = textColorOn(bannerColor, { team.Primary, team.Secondary })
	local bannerLabels = panelText(banner, { Enum.NormalId.Front }, {
		{ Text = "WELCOME", Weight = 1.6, Color = bannerText },
		{ Text = "TO YOUR TEAM HEADQUARTERS", Weight = 0.8, Color = bannerText },
	}, { BorderStuds = 0.4, BorderColor3 = team.Primary, InsetX = 0.05, InsetY = 0.1, LightInfluence = 0.5 })
	panelText(banner, { Enum.NormalId.Back }, {
		{ Text = "LOBBY", Weight = 1.4, Color = bannerText },
		{ Text = "MAIN ENTRANCE  |  TEAM SAFE", Weight = 0.8, Color = bannerText },
	}, { BorderStuds = 0.4, BorderColor3 = team.Primary, InsetX = 0.05, InsetY = 0.1, LightInfluence = 0.5 })
	S.refs.WelcomeLabel = bannerLabels[1]
	hangerRods(inside, bx, 17, cor.MinZ + 0.6, 23.5)
	-- (the prompt hangs at eye height under the banner, at the edge of the corridor)
	BuildUtil.Look(
		banner,
		"Welcome Banner",
		"Welcome to your Team HQ! Build every room step by step with the glowing buy buttons in the hallway. Here's what to do next:",
		{ LookKey = "quests", At = Vector3.new(0, -15, 3), Distance = 9 }
	)

	-- HQ directories on both corridor end walls, above the EXIT signs: the rooms on the reader's
	-- left and right, nearest first
	local frontRooms = {
		"FRONT OFFICE - DRAFT",
		"COACHES' OFFICES",
		"LOBBY - TEAM SAFE",
		"INTERVIEW ROOM - PRESS",
		"MEETING ROOM",
		"PLAYER LOUNGE - GAMES",
	}
	local backRooms = {
		"LOCKER ROOM",
		"EQUIPMENT ROOM",
		"WEIGHT ROOM - TRAINING",
		"TRAINING ROOM - REHAB",
		"FILM ROOM",
		"CAFETERIA - FOOD",
	}
	local function reversed(list)
		local out = {}
		for i = #list, 1, -1 do
			table.insert(out, list[i])
		end
		return out
	end
	local accent = textColorOn(SIGN_DARK, { team.Trim, team.Secondary, WHITE })
	local doorZ = (cor.MinZ + cor.MaxZ) / 2
	local directoryInfo = "Front Office: draft players. Coaches' Offices: game plans. Lobby: reception + team safe. "
		.. "Interview Room: press conferences. Meeting Room: team talks. Player Lounge: arcade + ping-pong. "
		.. "Locker Room: every player's locker. Equipment Room: helmets + pads. Weight Room: train your players. "
		.. "Training Room: ice tubs + rehab. Film Room: study game film. Cafeteria: grab a tray. "
		.. "Sky Deck: glass elevator behind the east doors!"
	for _, board in ipairs({
		{
			x = S.ix1 - 0.2,
			face = Enum.NormalId.Left,
			readerDir = -1,
			-- read facing +X: the front row is on the left
			columns = {
				{ title = "FRONT ROW", rooms = reversed(frontRooms) },
				{ title = "BACK ROW", rooms = reversed(backRooms) },
			},
			footer = "SKY DECK: GLASS ELEVATOR THROUGH THESE DOORS",
		},
		{
			x = S.ix0 + 0.2,
			face = Enum.NormalId.Right,
			readerDir = 1,
			-- read facing -X: the back row is on the left
			columns = {
				{ title = "BACK ROW", rooms = backRooms },
				{ title = "FRONT ROW", rooms = frontRooms },
			},
			footer = "SKY DECK: GLASS ELEVATOR AT THE EAST END",
		},
	}) do
		local directory = BuildUtil.Box(
			inside,
			"HQDirectory",
			Vector3.new(0.4, 7.4, 12.4),
			Vector3.new(board.x, 15.9, doorZ),
			SIGN_DARK,
			Enum.Material.SmoothPlastic,
			DECOR
		)
		directoryText(directory, board.face, board.columns, board.footer, accent)
		BuildUtil.Look(directory, "HQ Directory", directoryInfo, {
			At = Vector3.new(board.readerDir * 1.5, -11, -6),
			Distance = 8,
		})
	end

	-- ceiling lights: two long strips along the corridor, panels between the skylights and in
	-- the lobby (a few of them carry PointLights)
	local lightY0, lightY1 = ROOF_BOTTOM - 0.3, ROOF_BOTTOM
	for _, z in ipairs({ cor.MinZ + 1.1, cor.MaxZ - 1.9 }) do
		span(inside, "CeilingLightStrip", S.ix0 + 1, lightY0, z, S.ix1 - 1, lightY1, z + 0.8, LAMP, Enum.Material.Neon, PAINT)
	end
	local midZ = (cor.MinZ + cor.MaxZ) / 2
	local panels = {
		{ -236.25, midZ, 10, 6, true },
		{ -155.5, midZ, 10, 6, true },
		{ -75, midZ, 10, 6, true },
		{ 5.5, midZ, 10, 6, true },
		{ 86.25, midZ, 10, 6, true },
		{ -120, 208, 12, 6, true },
		{ -80, 208, 12, 6, true },
		{ -120, 258, 12, 6, false },
		{ -80, 258, 12, 6, false },
	}
	for _, p in ipairs(panels) do
		local panel = span(
			inside,
			"CeilingLightPanel",
			p[1] - p[3] / 2,
			lightY0,
			p[2] - p[4] / 2,
			p[1] + p[3] / 2,
			lightY1,
			p[2] + p[4] / 2,
			LAMP,
			Enum.Material.Neon,
			PAINT
		)
		if p[5] then
			BuildUtil.Light(
				panel,
				"PointLight",
				{ Name = "HQCeilingLight", Range = 48, Brightness = 1.2, Color = WARM_LIGHT, Shadows = false }
			)
		end
	end

	-- fire extinguishers on the end walls beside the exit doorways (no collision)
	for _, ext in ipairs({
		{ x = S.ix0 + 0.5, z = cor.MinZ + 1.5, face = Enum.NormalId.Right, plateX = S.ix0 + 0.1 },
		{ x = S.ix1 - 0.5, z = cor.MaxZ - 1.5, face = Enum.NormalId.Left, plateX = S.ix1 - 0.1 },
	}) do
		BuildUtil.Cylinder(inside, {
			Name = "FireExtinguisher",
			Position = Vector3.new(ext.x, 3.6, ext.z),
			Height = 2.4,
			Diameter = 0.9,
			Axis = "Y",
			Color = FIRE_RED,
			Material = Enum.Material.SmoothPlastic,
			CanCollide = false,
		})
		local plate = BuildUtil.Box(
			inside,
			"FireExtinguisherSign",
			Vector3.new(0.2, 1.4, 1.8),
			Vector3.new(ext.plateX, 6.2, ext.z),
			FIRE_RED,
			Enum.Material.SmoothPlastic,
			DECOR
		)
		panelText(plate, { ext.face }, {
			{ Text = "FIRE", Color = WHITE },
			{ Text = "EXTINGUISHER", Weight = 0.6, Color = WHITE },
		}, { InsetX = 0.08, InsetY = 0.1 })
	end

	-- two benches at the corridor ends, against the room rows, away from every buy button
	for _, bench in ipairs({
		{ x0 = S.ix0 + 2.5, z = cor.MaxZ - 1.3, back = 1 },
		{ x0 = S.ix1 - 10.5, z = cor.MinZ + 1.3, back = -1 },
	}) do
		local benchX = bench.x0 + 4
		-- the seat faces away from the backrest; it doesn't collide (the corridor stays clear)
		BuildUtil.Seat(inside, {
			Name = "CorridorBench",
			Size = Vector3.new(8, 0.5, 2),
			CFrame = CFrame.new(benchX, 1.65, bench.z) * CFrame.Angles(0, bench.back > 0 and 0 or math.pi, 0),
			Color = WOOD,
			Material = Enum.Material.Wood,
			CanCollide = false,
			Object = "Bench",
		})
		BuildUtil.Box(
			inside,
			"CorridorBenchBase",
			Vector3.new(7, 1.4, 1.2),
			Vector3.new(benchX, 0.7, bench.z),
			STEEL,
			Enum.Material.Metal,
			DECOR
		)
		BuildUtil.Box(
			inside,
			"CorridorBenchBack",
			Vector3.new(8, 2.2, 0.3),
			Vector3.new(benchX, 3, bench.z + bench.back * 0.85),
			WOOD,
			Enum.Material.Wood,
			DECOR
		)
	end
end

---------------------------------------------------------------------------------------------
-- Glass elevator tower (outside the east exit) + the Sky Deck roof terrace
---------------------------------------------------------------------------------------------

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

-- Cylinder from point a to point b (not vertical).
local function rodBetween(ctx, name, a, b, diameter, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Shape = Enum.PartType.Cylinder
	props.Size = Vector3.new((b - a).Magnitude, diameter, diameter)
	props.CFrame = CFrame.lookAt((a + b) / 2, b) * CFrame.Angles(0, math.pi / 2, 0)
	props.Color = color
	props.Material = material
	return BuildUtil.Part(ctx, props)
end

local function buildElevatorTower(ctx, S, team)
	local C = ctx.config.Colors
	local tower = BuildUtil.Child(ctx, "ElevatorTower")
	local cor = S.L.HQCorridor
	local doorZ = (cor.MinZ + cor.MaxZ) / 2
	local T, sh = TOWER, SHAFT
	local accent = textColorOn(team.Primary, { team.Trim, team.Secondary })
	local glassProps = { Transparency = 0.55, Reflectance = 0.15, CastShadow = false }
	local function glass(name, x0, y0, z0, x1, y1, z1)
		return span(tower, name, x0, y0, z0, x1, y1, z1, C.Glass, Enum.Material.Glass, glassProps)
	end

	-- floors, ceilings, roof and four team-colour corner columns
	span(tower, "TowerLobbyFloor", S.x1 - 0.1, 0, T.MinZ, T.MaxX - 0.1, FLOOR_TOP, T.MaxZ, CORRIDOR_FLOOR, Enum.Material.Marble)
	span(
		tower,
		"TowerLobbyCeiling",
		T.MinX,
		LOBBY_CEILING,
		T.MinZ + 0.1,
		T.MaxX - 0.1,
		LOBBY_CEILING + 0.6,
		T.MaxZ - 0.1,
		SLAB_WHITE,
		Enum.Material.SmoothPlastic
	)
	span(
		tower,
		"TowerRoofLevelFloor",
		T.MinX,
		ROOF_BOTTOM,
		T.MinZ + 0.1,
		T.MaxX - 0.1,
		ROOF_TOP,
		T.MaxZ - 0.1,
		ROOF_GREY,
		Enum.Material.Concrete
	)
	span(
		tower,
		"TowerRoof",
		T.MinX - 0.4,
		TOWER_CEILING,
		T.MinZ - 0.4,
		T.MaxX + 0.4,
		TOWER_CEILING + 1,
		T.MaxZ + 0.4,
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	for _, x in ipairs({ T.MinX, T.MaxX - 1 }) do
		for _, z in ipairs({ T.MinZ, T.MaxZ - 1 }) do
			span(tower, "TowerColumn", x, 0, z, x + 1, TOWER_CEILING, z + 1, team.Primary, Enum.Material.SmoothPlastic)
		end
	end

	-- glass walls: the lobby (open portal on the east side, toward the Hall of Fame) and the top
	-- floor (Sky Deck doorway on the west side); the south wall runs the full height (it is also the
	-- back of the shaft)
	local ex0, ex1 = T.MaxX - 0.6, T.MaxX - 0.2
	local portal = { doorZ - 5, doorZ + 5 }
	local deckDoor = { doorZ - EXIT_HALF, doorZ + EXIT_HALF }
	glass("TowerGlassSouth", T.MinX + 1, FLOOR_TOP, T.MinZ + 0.2, T.MaxX - 1, TOWER_CEILING, T.MinZ + 0.6)
	glass("TowerGlassNorth", T.MinX + 1, FLOOR_TOP, T.MaxZ - 0.6, T.MaxX - 1, LOBBY_CEILING, T.MaxZ - 0.2)
	glass("TowerRoofLevelGlassNorth", T.MinX + 1, ROOF_TOP, T.MaxZ - 0.6, T.MaxX - 1, TOWER_CEILING, T.MaxZ - 0.2)
	glass("TowerGlassEast", ex0, FLOOR_TOP, T.MinZ + 1, ex1, LOBBY_CEILING, portal[1])
	glass("TowerGlassEast", ex0, FLOOR_TOP, portal[2], ex1, LOBBY_CEILING, T.MaxZ - 1)
	glass("TowerRoofLevelGlassEast", ex0, ROOF_TOP, T.MinZ + 1, ex1, TOWER_CEILING, T.MaxZ - 1)
	glass("TowerRoofLevelGlassWest", T.MinX + 0.2, ROOF_TOP, T.MinZ + 1, T.MinX + 0.6, TOWER_CEILING, deckDoor[1])
	glass("TowerRoofLevelGlassWest", T.MinX + 0.2, ROOF_TOP, deckDoor[2], T.MinX + 0.6, TOWER_CEILING, T.MaxZ - 1)
	span(
		tower,
		"TowerRoofLevelDoorHead",
		T.MinX + 0.1,
		ROOF_TOP + 8.6,
		deckDoor[1],
		T.MinX + 0.7,
		TOWER_CEILING,
		deckDoor[2],
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	local portalHead = span(
		tower,
		"TowerPortalHeader",
		ex0 - 0.2,
		10,
		portal[1],
		ex1 + 0.2,
		LOBBY_CEILING,
		portal[2],
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	panelText(portalHead, { Enum.NormalId.Right }, { { Text = "SKY DECK ELEVATOR", Color = accent } }, { InsetX = 0.06, InsetY = 0.2 })
	span(
		tower,
		"TowerPortalCanopy",
		T.MaxX - 0.2,
		10.3,
		portal[1] - 1,
		T.MaxX + 1.5,
		10.8,
		portal[2] + 1,
		team.Secondary,
		Enum.Material.SmoothPlastic
	)
	-- X bracing between the lobby and the top floor on the east face, and the crown sign
	for _, s in ipairs({ -1, 1 }) do
		strut(
			tower,
			"TowerBrace",
			Vector3.new(T.MaxX - 0.5, LOBBY_CEILING + 1, doorZ - s * 12),
			Vector3.new(T.MaxX - 0.5, ROOF_BOTTOM - 0.5, doorZ + s * 12),
			0.5,
			STEEL,
			Enum.Material.Metal
		)
	end
	local crown = span(
		tower,
		"TowerRoofSign",
		(T.MinX + T.MaxX) / 2 - 0.5,
		TOWER_CEILING + 1,
		doorZ - 9,
		(T.MinX + T.MaxX) / 2 + 0.5,
		TOWER_CEILING + 4.6,
		doorZ + 9,
		SIGN_DARK,
		Enum.Material.SmoothPlastic
	)
	panelText(crown, { Enum.NormalId.Left, Enum.NormalId.Right }, { { Text = "SKY DECK", Color = accent } }, {
		BorderStuds = 0.2,
		BorderColor3 = team.Primary,
		InsetX = 0.06,
		InsetY = 0.16,
		LightInfluence = 0,
	})

	-- lights
	for _, light in ipairs({
		{ name = "TowerLobbyCeilingLight", y = LOBBY_CEILING },
		{ name = "TowerRoofLevelCeilingLight", y = TOWER_CEILING },
	}) do
		local lamp = span(tower, light.name, 105, light.y - 0.2, doorZ - 3, 115, light.y, doorZ + 3, LAMP, Enum.Material.Neon, PAINT)
		BuildUtil.Light(lamp, "PointLight", { Name = "TowerLight", Range = 22, Brightness = 1.5, Color = WARM_LIGHT, Shadows = false })
	end

	-- the elevator shaft: glass sides, team-colour door pillars running up the whole tower, glass
	-- between the two landings (with the hoist cable showing)
	local shaftGlass = { Transparency = 0.45, Reflectance = 0.1, CastShadow = false }
	for _, x in ipairs({ sh.MinX, sh.MaxX - 0.4 }) do
		span(tower, "ShaftGlass", x, FLOOR_TOP, sh.MinZ, x + 0.4, TOWER_CEILING, sh.FaceZ0, C.Glass, Enum.Material.Glass, shaftGlass)
	end
	local doorX0, doorX1 = (sh.MinX + sh.MaxX) / 2 - SHAFT_DOOR_HALF, (sh.MinX + sh.MaxX) / 2 + SHAFT_DOOR_HALF
	for _, p in ipairs({ { sh.MinX, doorX0 }, { doorX1, sh.MaxX } }) do
		span(tower, "ShaftPillar", p[1], FLOOR_TOP, sh.FaceZ0, p[2], TOWER_CEILING, sh.FaceZ1, team.Primary, Enum.Material.Metal)
	end
	span(
		tower,
		"ShaftGlassMid",
		doorX0,
		LOBBY_CEILING + 0.6,
		sh.FaceZ0 + 0.1,
		doorX1,
		ROOF_BOTTOM,
		sh.FaceZ1 - 0.1,
		C.Glass,
		Enum.Material.Glass,
		shaftGlass
	)
	BuildUtil.Cylinder(tower, {
		Name = "HoistCable",
		Position = Vector3.new((sh.MinX + sh.MaxX) / 2, (FLOOR_TOP + 9.4 + ROOF_BOTTOM) / 2, (sh.MinZ + sh.FaceZ0) / 2),
		Height = ROOF_BOTTOM - FLOOR_TOP - 9.4,
		Diameter = 0.3,
		Axis = "Y",
		Color = STEEL,
		Material = Enum.Material.Metal,
		CanCollide = false,
	})

	-- both landings: a cab (wood back, lit ceiling, button panel), sliding doors, a header sign and
	-- a call panel beside the doors. Each elevator button rides to the other landing.
	local upTarget = CFrame.lookAt(Vector3.new(110, ROOF_TOP, doorZ + 0.5), Vector3.new(90, ROOF_TOP, doorZ + 0.5))
	local downTarget = CFrame.lookAt(Vector3.new(110, FLOOR_TOP, doorZ + 0.5), Vector3.new(90, FLOOR_TOP, doorZ + 0.5))
	local landings = {
		{
			name = "Lobby",
			y = FLOOR_TOP,
			sign = "SKY DECK",
			target = upTarget,
			action = "Ride up",
			label = "SKY DECK",
			info = "A glass elevator up to the Sky Deck, the roof terrace on top of your Team HQ.",
		},
		{
			name = "RoofLevel",
			y = ROOF_TOP,
			sign = "GROUND FLOOR",
			target = downTarget,
			action = "Ride down",
			label = "GROUND FLOOR",
			info = "Rides back down to the ground floor, next to the HQ's east doors.",
		},
	}
	for _, landing in ipairs(landings) do
		local y0 = landing.y
		span(
			tower,
			landing.name .. "ElevatorCabBack",
			sh.MinX + 0.4,
			y0,
			sh.MinZ,
			sh.MaxX - 0.4,
			y0 + 9,
			sh.MinZ + 0.3,
			CAB_WOOD,
			Enum.Material.Wood
		)
		local cabCeiling = span(
			tower,
			landing.name .. "ElevatorCabCeiling",
			sh.MinX + 0.4,
			y0 + 9,
			sh.MinZ,
			sh.MaxX - 0.4,
			y0 + 9.4,
			sh.FaceZ0,
			LAMP,
			Enum.Material.Neon,
			{ CastShadow = false }
		)
		BuildUtil.Light(cabCeiling, "PointLight", { Name = "CabLight", Range = 12, Brightness = 1.2, Color = WARM_LIGHT, Shadows = false })
		local header = span(
			tower,
			landing.name .. "ElevatorHeader",
			doorX0,
			y0 + SHAFT_DOOR_H,
			sh.FaceZ0,
			doorX1,
			y0 + SHAFT_DOOR_H + 1.8,
			sh.FaceZ1,
			SIGN_DARK,
			Enum.Material.SmoothPlastic
		)
		panelText(
			header,
			{ Enum.NormalId.Back },
			{ { Text = landing.sign, Color = accent } },
			{ InsetX = 0.08, InsetY = 0.2, LightInfluence = 0 }
		)
		local doorCentre = Vector3.new((doorX0 + doorX1) / 2, y0 + SHAFT_DOOR_H / 2, (sh.FaceZ0 + sh.FaceZ1) / 2)
		BuildUtil.Door(tower, {
			Name = landing.name .. "ElevatorDoors",
			Size = Vector3.new(doorX1 - doorX0, SHAFT_DOOR_H, 0.3),
			CFrame = CFrame.lookAt(doorCentre, doorCentre + Vector3.new(0, 0, 1)),
			Double = true,
			Slide = true,
			Color = C.Metal,
			Material = Enum.Material.Metal,
			Object = "Elevator Doors",
			Title = "Glass Elevator",
			Info = landing.info,
			Distance = 8,
		})
		-- call panel on the east pillar (outside) + button panel inside the cab
		local call = span(
			tower,
			landing.name .. "ElevatorCallPanel",
			doorX1 + 0.8,
			y0 + 3.6,
			sh.FaceZ1,
			doorX1 + 2.2,
			y0 + 5.6,
			sh.FaceZ1 + 0.2,
			SIGN_DARK,
			Enum.Material.SmoothPlastic
		)
		panelText(call, { Enum.NormalId.Back }, {
			{ Text = landing.action == "Ride up" and "UP" or "DOWN", Color = BUTTON_GLOW },
		}, { InsetX = 0.15, InsetY = 0.3, LightInfluence = 0 })
		BuildUtil.Elevator(
			ctx,
			call,
			landing.target,
			{ Action = landing.action, Object = "Glass Elevator", Label = landing.label, Distance = 7 }
		)
		local buttons = span(
			tower,
			landing.name .. "ElevatorCabButtons",
			sh.MaxX - 0.8,
			y0 + 3.6,
			sh.MinZ + 2.6,
			sh.MaxX - 0.4,
			y0 + 5.6,
			sh.MinZ + 4,
			SIGN_DARK,
			Enum.Material.SmoothPlastic
		)
		panelText(buttons, { Enum.NormalId.Left }, {
			{ Text = "SKY DECK", Color = BUTTON_GLOW },
			{ Text = "LOBBY", Color = BUTTON_GLOW },
		}, { InsetX = 0.12, InsetY = 0.15, LightInfluence = 0 })
		BuildUtil.Elevator(
			ctx,
			buttons,
			landing.target,
			{ Action = landing.action, Object = "Elevator Buttons", Label = landing.label, Distance = 6 }
		)
	end

	-- the top floor's sliding glass doors onto the Sky Deck
	local deckDoorH = 8.6
	local deckDoorCentre = Vector3.new(T.MinX + 0.4, ROOF_TOP + deckDoorH / 2, doorZ)
	BuildUtil.Door(tower, {
		Name = "SkyDeckDoors",
		Size = Vector3.new(deckDoor[2] - deckDoor[1], deckDoorH, 0.3),
		CFrame = CFrame.lookAt(deckDoorCentre, deckDoorCentre + Vector3.new(1, 0, 0)),
		Double = true,
		Slide = true,
		Color = DOOR_GLASS,
		Material = Enum.Material.Glass,
		Transparency = 0.45,
		Object = "Sky Deck Doors",
		Title = "Sky Deck",
		Info = "The roof terrace: benches, telescopes and the best view on the whole campus.",
		Distance = 8,
	})
end

local function buildSkyDeck(ctx, team)
	local C = ctx.config.Colors
	local deck = BuildUtil.Child(ctx, "SkyDeck")
	local D = DECK
	local dy = D.Top
	local T = TOWER

	-- wood decking on the roof slab (0.3 step up from the tower's top floor)
	span(deck, "RoofDeckBoards", D.MinX, ROOF_TOP, D.MinZ, D.MaxX, dy, D.MaxZ, DECK_WOOD, Enum.Material.WoodPlanks)

	-- glass railings with a steel top rail all round (the tower closes the east side in the middle)
	local railH = 3.2
	local function railing(x0, z0, x1, z1)
		span(
			deck,
			"RoofRailingGlass",
			x0,
			dy,
			z0,
			x1,
			dy + railH,
			z1,
			C.Glass,
			Enum.Material.Glass,
			{ Transparency = 0.5, CastShadow = false }
		)
		span(deck, "RoofRailingTop", x0 - 0.05, dy + railH, z0 - 0.05, x1 + 0.05, dy + railH + 0.3, z1 + 0.05, STEEL, Enum.Material.Metal)
	end
	railing(D.MinX, D.MinZ, D.MinX + 0.4, D.MaxZ)
	railing(D.MinX + 0.4, D.MinZ, D.MaxX, D.MinZ + 0.4)
	railing(D.MinX + 0.4, D.MaxZ - 0.4, D.MaxX, D.MaxZ)
	railing(D.MaxX - 0.4, D.MinZ + 0.4, D.MaxX, T.MinZ)
	railing(D.MaxX - 0.4, T.MaxZ, D.MaxX, D.MaxZ - 0.4)

	-- planters: hedges in the corners, two trees along the west railing
	local function planter(x, z, w, d, tree)
		span(deck, "RoofPlanter", x - w / 2, dy, z - d / 2, x + w / 2, dy + 2, z + d / 2, PLANTER_GREY, Enum.Material.Concrete)
		if tree then
			span(
				deck,
				"RoofPlanterSoil",
				x - w / 2 + 0.3,
				dy + 2,
				z - d / 2 + 0.3,
				x + w / 2 - 0.3,
				dy + 2.1,
				z + d / 2 - 0.3,
				TRUNK,
				Enum.Material.Ground
			)
			BuildUtil.Cylinder(deck, {
				Name = "RoofTreeTrunk",
				Position = Vector3.new(x, dy + 4.5, z),
				Height = 5,
				Diameter = 0.6,
				Axis = "Y",
				Color = TRUNK,
				Material = Enum.Material.Wood,
			})
			BuildUtil.Ball(deck, {
				Name = "RoofTreeCrown",
				Position = Vector3.new(x, dy + 8, z),
				Diameter = 4.6,
				Color = LEAVES,
				Material = Enum.Material.Grass,
			})
		else
			span(
				deck,
				"RoofPlanterHedge",
				x - w / 2 + 0.3,
				dy + 2,
				z - d / 2 + 0.3,
				x + w / 2 - 0.3,
				dy + 3.3,
				z + d / 2 - 0.3,
				BUSH,
				Enum.Material.Grass
			)
		end
	end
	planter(77.4, D.MinZ + 3.8, 4.4, 5.6, false)
	planter(95.5, D.MinZ + 3.8, 4.4, 5.6, false)
	planter(77.4, 258, 4.4, 4.4, true)
	planter(77.4, 284, 4.4, 4.4, true)
	planter(77.4, D.MaxZ - 22, 4.4, 5.6, false)
	planter(95.5, D.MaxZ - 22, 4.4, 5.6, false)

	-- benches: two face the stadium (south), two face the campus (north); one of each is a TV seat
	local function bench(x, z, facing, object, camera)
		local base = CFrame.new(x, dy, z) * CFrame.Angles(0, facing < 0 and 0 or math.pi, 0)
		BuildUtil.Part(deck, {
			Name = "RoofBenchBase",
			Size = Vector3.new(5, 1.3, 1.2),
			CFrame = base * CFrame.new(0, 0.65, 0),
			Color = STEEL,
			Material = Enum.Material.Metal,
		})
		BuildUtil.Seat(deck, {
			Name = "RoofBenchSeat",
			Size = Vector3.new(6, 0.5, 2),
			CFrame = base * CFrame.new(0, 1.55, 0),
			Color = DECK_WOOD,
			Material = Enum.Material.Wood,
			Object = object,
			Camera = camera,
		})
		BuildUtil.Part(deck, {
			Name = "RoofBenchBack",
			Size = Vector3.new(6, 2.2, 0.35),
			CFrame = base * CFrame.new(0, 2.9, 0.85),
			Color = DECK_WOOD,
			Material = Enum.Material.Wood,
		})
	end
	local southZ, northZ = D.MinZ + 13, D.MaxZ - 13
	local blimpCam = { From = Vector3.new(90, 120, 215), To = Vector3.new(5, 0, 35), Fov = 48, Label = "BLIMP CAM" }
	local campusCam = { From = Vector3.new(96, 75, 345), To = Vector3.new(-25, 0, 465), Fov = 60, Label = "CAMPUS CAM" }
	bench(80.5, southZ, -1, "Stadium View Bench", blimpCam)
	bench(92.5, southZ, -1, "Bench")
	bench(80.5, northZ, 1, "Bench")
	bench(92.5, northZ, 1, "Campus View Bench", campusCam)

	-- a cafe table with two chairs between the trees
	local tableX, tableZ = 84, 271
	BuildUtil.Cylinder(deck, {
		Name = "RoofCafeTableLeg",
		Position = Vector3.new(tableX, dy + 1.4, tableZ),
		Height = 2.8,
		Diameter = 0.4,
		Axis = "Y",
		Color = STEEL,
		Material = Enum.Material.Metal,
	})
	BuildUtil.Cylinder(deck, {
		Name = "RoofCafeTable",
		Position = Vector3.new(tableX, dy + 2.9, tableZ),
		Height = 0.2,
		Diameter = 3.2,
		Axis = "Y",
		Color = WHITE,
		Material = Enum.Material.SmoothPlastic,
	})
	for _, s in ipairs({ -1, 1 }) do
		local chair = Vector3.new(tableX, dy, tableZ + s * 2.6)
		local facing = CFrame.lookAt(chair, Vector3.new(tableX, dy, tableZ))
		BuildUtil.Seat(deck, {
			Name = "RoofCafeChair",
			Size = Vector3.new(1.8, 0.4, 1.8),
			CFrame = facing * CFrame.new(0, 1.7, 0),
			Color = team.Primary,
			Object = "Cafe Chair",
			NoPrompt = s > 0,
		})
		BuildUtil.Part(deck, {
			Name = "RoofCafeChairBack",
			Size = Vector3.new(1.8, 2.2, 0.3),
			CFrame = facing * CFrame.new(0, 3, 0.75),
			Color = team.Primary,
			Material = Enum.Material.SmoothPlastic,
		})
		BuildUtil.Part(deck, {
			Name = "RoofCafeChairLeg",
			Size = Vector3.new(0.3, 1.5, 0.3),
			CFrame = facing * CFrame.new(0, 0.75, 0),
			Color = STEEL,
			Material = Enum.Material.Metal,
		})
	end

	-- telescopes on posts, aimed at the stadium, the practice field and the dome; the practice
	-- field one has a stool that shows the zoomed-in view
	local function telescope(x, z, target, title, info)
		local standTop = dy + 3.2
		BuildUtil.Cylinder(deck, {
			Name = "RoofTelescopeStand",
			Position = Vector3.new(x, (dy + standTop) / 2, z),
			Height = standTop - dy,
			Diameter = 0.45,
			Axis = "Y",
			Color = STEEL,
			Material = Enum.Material.Metal,
		})
		local pivot = Vector3.new(x, standTop + 0.35, z)
		local dir = (target - pivot).Unit
		local centre = pivot + dir * 0.6
		local tube = rodBetween(deck, "RoofTelescope", centre - dir * 1.7, centre + dir * 1.7, 0.75, WHITE, Enum.Material.SmoothPlastic)
		local eye = centre - dir * 2
		rodBetween(deck, "RoofTelescopeEyepiece", eye - dir * 0.35, eye + dir * 0.35, 0.35, INK, Enum.Material.Metal)
		BuildUtil.Look(tube, title, info, { Distance = 7 })
		return dir, eye
	end
	telescope(
		86.5,
		D.MinZ + 4.5,
		Vector3.new(0, 20, 60),
		"Stadium Telescope",
		"Zoom in on your stadium! Spot the light towers, the giant scoreboard and the top rows of the stands."
	)
	local fieldTarget = Vector3.new(-130, 0, 456)
	local northTeleZ = D.MaxZ - 4.5
	local fieldDir, eye = telescope(
		79.5,
		northTeleZ,
		fieldTarget,
		"Practice Field Telescope",
		"You can see the practice field from here! Spot the blocking sleds, the tackling dummies and the coach tower on the far sideline."
	)
	telescope(
		93.5,
		northTeleZ,
		Vector3.new(150, 15, 475),
		"Campus Telescope",
		"That big curved roof is the Indoor Practice Dome. Turn left to spot the golf cart garage and the Hall of Fame behind it!"
	)
	local flat = Vector3.new(fieldDir.X, 0, fieldDir.Z).Unit
	local stool = Vector3.new(79.5, 0, northTeleZ) - flat * 2.4
	BuildUtil.Cylinder(deck, {
		Name = "RoofStoolPost",
		Position = Vector3.new(stool.X, dy + 0.75, stool.Z),
		Height = 1.5,
		Diameter = 0.35,
		Axis = "Y",
		Color = STEEL,
		Material = Enum.Material.Metal,
	})
	BuildUtil.Seat(deck, {
		Name = "RoofTelescopeStool",
		Size = Vector3.new(1.6, 0.4, 1.6),
		CFrame = CFrame.lookAt(Vector3.new(stool.X, dy + 1.7, stool.Z), Vector3.new(stool.X + flat.X, dy + 1.7, stool.Z + flat.Z)),
		Color = team.Primary,
		Object = "Telescope Stool",
		Camera = { From = eye + Vector3.new(0, 1, 0), To = fieldTarget, Fov = 16, Label = "TELESCOPE CAM" },
	})

	-- string lights: poles along the railings, festoons across the deck and along the west side
	local poleTop = dy + 8.5
	local poles = {
		W1 = Vector3.new(D.MinX + 1.1, poleTop, 226),
		W2 = Vector3.new(D.MinX + 1.1, poleTop, 271),
		W3 = Vector3.new(D.MinX + 1.1, poleTop, 316),
		E1 = Vector3.new(D.MaxX - 0.6, poleTop, 226),
		E3 = Vector3.new(D.MaxX - 0.6, poleTop, 316),
	}
	for _, key in ipairs({ "W1", "W2", "W3", "E1", "E3" }) do
		local p = poles[key]
		BuildUtil.Cylinder(deck, {
			Name = "RoofLightPole",
			Position = Vector3.new(p.X, (dy + poleTop) / 2, p.Z),
			Height = poleTop - dy,
			Diameter = 0.35,
			Axis = "Y",
			Color = STEEL,
			Material = Enum.Material.Metal,
		})
	end
	local towerAnchor = Vector3.new(T.MinX + 0.2, poleTop, 271)
	local strings = {
		{ poles.W1, poles.E1, true },
		{ poles.W3, poles.E3, true },
		{ poles.W2, towerAnchor, true },
		{ poles.W1, poles.W2, false },
		{ poles.W2, poles.W3, false },
	}
	for _, s in ipairs(strings) do
		local a, b = s[1] - Vector3.new(0, 0.2, 0), s[2] - Vector3.new(0, 0.2, 0)
		local sag = (a + b) / 2 - Vector3.new(0, 1.2, 0)
		local first = strut(deck, "RoofStringLights", a, sag, 0.18, BULB, Enum.Material.Neon, { CanCollide = false, CastShadow = false })
		strut(deck, "RoofStringLights", sag, b, 0.18, BULB, Enum.Material.Neon, { CanCollide = false, CastShadow = false })
		if s[3] then
			BuildUtil.Light(first, "PointLight", { Name = "StringLight", Range = 24, Brightness = 1.3, Color = BULB, Shadows = false })
		end
	end
end

---------------------------------------------------------------------------------------------
-- Entry point
---------------------------------------------------------------------------------------------

-- Builds the whole empty HQ. Returns references the game may use later:
--   FacadeSignLabel (the "TEAM HEADQUARTERS" sign over the canopy), WelcomeLabel (the banner)
function HQShell.Build(ctx)
	local L = ctx.config.Layout
	local team = ctx.colors
	local hq = L.HQ
	local S = {
		L = L,
		x0 = hq.MinX,
		x1 = hq.MaxX,
		z0 = hq.MinZ,
		z1 = hq.MaxZ,
		ix0 = hq.MinX + WALL_T,
		ix1 = hq.MaxX - WALL_T,
		iz0 = hq.MinZ + WALL_T,
		iz1 = hq.MaxZ - WALL_T,
		refs = {},
	}
	local shell = BuildUtil.Child(ctx, "HQShell")
	buildFloor(shell, S, team)
	buildWalls(shell, S, team)
	buildEntrance(shell, S, team)
	buildRoof(shell, S)
	buildInterior(shell, S, team)
	buildElevatorTower(shell, S, team)
	buildSkyDeck(shell, team)
	return S.refs
end

return HQShell
