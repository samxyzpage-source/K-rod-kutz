--[[
	HQShell (V5)
	The two-storey Team HQ every plot starts with. PlotBase.lua calls HQShell.Build(ctx) once per
	plot with the CAMPUS area's ctx, so everything here is in campus coordinates (Config.Layout.HQ,
	HQCorridor, HQAtrium, Zones...). It is never built in steps (no BuildUtil.Stage) and
	ctx.teamName is still empty, so printed text is generic; the team name and the owner appear
	through live text (BuildUtil.LiveText) on the prow sign and the entrance monument. It is built in
	the plot's default palette; everything in a team colour is tagged with its palette role
	(TeamRole / TeamTextRole / TeamBackRole, see tagTeamColors) so a team change repaints it in place.

	Footprint Config.Layout.HQ = X[-250, 100] Z[200, 360]; the architecture sticks out a little
	(X[-262, 118] Z[188, 366]):
	  * GROUND FLOOR (floor top 0.2): a stone base. The front wings get a glass storefront between a
	    granite plinth and a dark spandrel; the ends + back are solid limestone (rooms put things
	    against them).
	  * UPPER FLOOR: one slab (top y = UpperFloorY = 17, underside 16) over everything except the
	    atrium void (L.HQAtrium). Upper walls are glass curtain walls with a dark spandrel above the
	    room ceilings. The slab and the roof cantilever 7 studs over the front (z = 193) and 4 - 5
	    over the back: a deep overhang over an arcade, carried by a colonnade of tall white blades
	    (ground to roof) with a sun louver in front of the upper glass; team-colour fins at the back.
	  * THE ATRIUM: the lobby is open up to its own taller roof (y 41) with a glass lantern
	    skylight on steel beams, two LED pendant rings and clerestory glass above the wing roofs.
	    Toward the campus road it ends in a curved two-storey GLASS PROW (an arc of 8 facets out to
	    z = 189) standing on the white entrance canopy (y 11.5 .. 12.5, four slim columns) over the
	    main doors (team-colour portal + two glass revolving doors); the prow carries the lit team
	    sign and the canopy a MAIN ENTRANCE fascia.
	  * UPPER CORRIDOR X[-248.5, 98.5] Z[264, 278] (y 17): marble runner with team-colour edges, a
	    glass railing where it passes behind the atrium (between the grand staircase's west balcony
	    and east mezzanine, which open onto it), hanging room-name signs, light strips along two
	    corridor skylights, directories at both ends.
	  * ACCESS from the start: the WEST STAIR TOWER X[-262, -250] Z[249, 301] (glass west face, a
	    switchback stair + an elevator, glass doors to the west side) at the west end of the
	    corridor, and the EAST GLASS ELEVATOR TOWER X[100, 118] Z[258, 284] at the east end with three
	    stops: ground (open toward the Hall of Fame), upper floor and the SKY TERRACE on the roof.
	  * ROOFS: wings + back block at y 34.5 .. 35.5 (team-colour fascia / parapet to 36.6), the
	    atrium at 41 .. 42.2, the stair tower 41 .. 42.4, the elevator tower 46.5 .. 47.5. Sedum
	    green roofs, a helipad and solar arrays, HVAC on the back block, and on the east wing the
	    green SKY TERRACE: lawn, boardwalk, trees, benches facing the stadium and the practice
	    fields (camera seats), two telescopes (one with a camera stool), a cafe table, lamp posts.
	  * OUTSIDE: arcade paving, planters with trees between the blades, three team flags and the
	    monument sign (live team + owner) beside the entrance walk.
	  * INSIDE: every room zone (Config.Layout.Zones.hq_*) on BOTH floors shows a layout-yellow
	    outline and a flat "FUTURE <ROOM>" label, drawn on one raw-concrete pad per row of rooms; the
	    room pieces cover them. Room-name signs hang over both corridors beside each room's buy
	    button (ground: from the slab soffit; upstairs: from the wing roofs, on rods under the
	    atrium roof). Non-collidable bulkheads close the gap between the ground rooms' ceilings
	    (12.6) and the slab soffit along the corridor and beside the atrium.

	Nothing collidable stands inside a room zone, in either corridor (y floor + 0.8 .. + 9), on the
	HQ entrance walk, the campus road or the back road, and the bus stop's arrival spot (x -150,
	z 190), the spawn and the team safe stay clear. The atrium floor is left to the lobby and the
	grand staircase (hq_atrium).

	Paint heights: ground floor (top 0.2) room pads 0.24, corridor 0.23, arrows 0.26, medallion
	0.25, entrance mat 0.28; upper floor (top 17) room pads 17.06, corridor 17.05. Room floors
	(0.32 / 17.12) cover the pads.
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)

local HQShell = {}

-- Heights (campus coordinates; the upper floor height comes from Config.Layout.HQ.UpperFloorY)
local FLOOR_TOP = 0.2
local WALL_T = 1.5
local ROOF_BOTTOM = 34.5 -- wings + back block (upper rooms stay below 34)
local ROOF_TOP = 35.5
local UPPER_SPANDREL = 30.4 -- upper glass curtain walls turn into a dark spandrel above the room ceilings
local PARAPET_TOP = 36.6
local DECK_TOP = 35.62 -- the Sky Terrace boardwalk (the tower's top floor is level with it)
local ATRIUM_ROOF_BOTTOM = 41
local ATRIUM_ROOF_TOP = 42.2
local CORE_ROOF_BOTTOM = 41 -- west stair tower
local CANOPY_BOTTOM = 11.5 -- entrance canopy (the floor of the glass prow)
local CANOPY_TOP = 12.5
local ENTRANCE_HEAD = 10 -- top of the main entrance opening
local DOOR_TOP = 9 -- corridor end doorways (both floors: floor + 8.8)
local DOOR_HALF = 4 -- they are 8 wide, centred on the corridor
local SLAB_FRONT = 193 -- the upper slab + wing roofs cantilever out to here at the front
local SLAB_BACK = 364 -- ... and to here at the back (the roof to 365)
local ROOF_BACK = 365
local BLADE_Z0, BLADE_Z1 = 193.4, 195.8 -- the colonnade blades under the front overhang
local BLADE_STEP = 15 -- their spacing
local PROW_Z = 189 -- the glass prow's front (middle of the arc)
local PROW_FACETS = 8
-- the atrium railing on the upper corridor runs between the grand staircase piece's west balcony
-- (X[-150, -126.2]) and east mezzanine (X[-74.4, -50]), which open onto the corridor
local RAILING_X0, RAILING_X1 = -126.2, -74.4
local SIGN_SIZE = Vector3.new(18, 4, 0.6) -- upper corridor room-name signs
local GROUND_SIGN_SIZE = Vector3.new(18, 2.8, 0.6) -- ground corridor signs (hang from the slab)

local PAINT = { CanCollide = false, CastShadow = false }
local DECOR = { CanCollide = false }

local WHITE = Color3.fromRGB(248, 248, 248)
local INK = Color3.fromRGB(22, 22, 26)
local FLOOR_CONCRETE = Color3.fromRGB(188, 188, 184)
local SLAB_COLOR = Color3.fromRGB(226, 226, 222)
local CORRIDOR_FLOOR = Color3.fromRGB(230, 228, 220)
local RAW_CONCRETE = Color3.fromRGB(134, 136, 140)
local LAYOUT_YELLOW = Color3.fromRGB(255, 198, 30)
local LIMESTONE = Color3.fromRGB(206, 198, 182)
local GRANITE = Color3.fromRGB(70, 72, 78)
local PANEL_WHITE = Color3.fromRGB(238, 239, 241)
local CURTAIN_GLASS = Color3.fromRGB(112, 166, 204)
local PROW_GLASS = Color3.fromRGB(150, 200, 230)
local SPANDREL = Color3.fromRGB(42, 54, 68)
local PAVER = Color3.fromRGB(172, 168, 160)
local ROOF_GREY = Color3.fromRGB(152, 154, 160)
local SEDUM = Color3.fromRGB(104, 134, 74)
local STEEL = Color3.fromRGB(62, 64, 70)
local BRUSHED = Color3.fromRGB(178, 182, 188)
local HVAC_GREY = Color3.fromRGB(170, 174, 180)
local LAMP = Color3.fromRGB(255, 248, 232)
local WARM_LIGHT = Color3.fromRGB(255, 236, 200)
local SIGN_DARK = Color3.fromRGB(28, 30, 36)
local EXIT_GREEN = Color3.fromRGB(60, 235, 110)
local FIRE_RED = Color3.fromRGB(200, 28, 30)
local STONE = Color3.fromRGB(120, 120, 126)
local LEAVES = Color3.fromRGB(72, 140, 70)
local LAWN = Color3.fromRGB(86, 150, 70)
local TRUNK = Color3.fromRGB(104, 74, 48)
local WOOD = Color3.fromRGB(150, 105, 60)
local DECK_WOOD = Color3.fromRGB(156, 112, 72)
local PLANTER_GREY = Color3.fromRGB(96, 98, 104)
local HELIPAD = Color3.fromRGB(58, 60, 66)
local SOLAR_BLUE = Color3.fromRGB(34, 52, 96)
local DOOR_GLASS = Color3.fromRGB(170, 214, 236)
local BULB = Color3.fromRGB(255, 214, 140)
local BUTTON_GLOW = Color3.fromRGB(120, 220, 255)

local CURTAIN_PROPS = { Transparency = 0.4, Reflectance = 0.2 }
local PROW_PROPS = { Transparency = 0.5, Reflectance = 0.15, CastShadow = false }
local SKYLIGHT_PROPS = { Transparency = 0.45, Reflectance = 0.1, CastShadow = false }
local RAIL_PROPS = { Transparency = 0.55, Reflectance = 0.1, CastShadow = false }

-- The west stair tower and the east glass elevator tower (outside the room zones)
local CORE = { MinX = -262, MaxX = -250, MinZ = 249, MaxZ = 301, Top = 41 }
local TOWER = { MinX = 100, MaxX = 118, MinZ = 258, MaxZ = 284, Top = 46.5 }
-- (the shaft spans the tower's whole width, so the floors around it leave no holes)
local TOWER_SHAFT = { MinX = 101, MaxX = 117, MinZ = 258.6, FaceZ = 265 }
-- The Sky Terrace on the east wing's roof
local TERRACE = { MinX = 46, MaxX = 98.5, MinZ = 193.4, MaxZ = 364.6 }

-- The rooms (Config.Layout.Zones) with their buy-button X (Items.lua: the front row's buttons sit
-- in the corridor at z = 268, the back row's at z = 274, on both floors). The hanging sign sits
-- halfway between the button and the middle of the room, so it covers both.
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
local UPPER_FRONT_ROOMS = {
	{ id = "hq_owner", name = "OWNER'S SUITE", buttonX = -220 },
	{ id = "hq_media", name = "MEDIA STUDIO", buttonX = -25 },
	{ id = "hq_scouting", name = "SCOUTING WAR ROOM", buttonX = 25 },
	{ id = "hq_analytics", name = "ANALYTICS LAB", buttonX = 74 },
}
local UPPER_BACK_ROOMS = {
	{ id = "hq_kitchen", name = "NUTRITION KITCHEN", buttonX = -190 },
	{ id = "hq_barber", name = "BARBERSHOP", buttonX = -125 },
	{ id = "hq_spa", name = "RECOVERY SPA & POOL", buttonX = -50 },
	{ id = "hq_players", name = "PLAYER DEVELOPMENT", buttonX = 49 },
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

--[[
	Text colour on `background` (a team colour role such as "Primary", or a fixed Color3): the first
	candidate role ({ "Trim", "Secondary" }...) that reads well on it in EVERY team palette, else
	whichever of white / ink reads best in all of them. A team change repaints the shell by role
	(PlotManager.ApplyTeam, see tagTeamColors), so the choice must not depend on the palette.
]]
local function teamInk(ctx, background, candidates)
	local palettes = ctx.config.TeamColors
	local function worst(color)
		local ratio = math.huge
		for _, palette in ipairs(palettes) do
			local back = type(background) == "string" and palette[background] or background
			ratio = math.min(ratio, contrastRatio(back, type(color) == "string" and palette[color] or color))
		end
		return ratio
	end
	for _, role in ipairs(candidates) do
		if worst(role) >= 3 then
			return ctx.colors[role]
		end
	end
	return worst(WHITE) >= worst(INK) and WHITE or INK
end

--[[
	Tags everything under `root` painted in a team colour with its palette role (the contract with
	PlotManager.ApplyTeam / Release, which repaint the plot's Base in place): BaseParts get TeamRole,
	text TeamTextRole and visible GUI panels TeamBackRole = "Primary" / "Secondary" / "Trim". No fixed
	colour of the shell equals a palette colour (tools/render_plot.luau checks every palette).
]]
local TEAM_ROLES = { "Primary", "Secondary", "Trim" }
local function tagTeamColors(root, team)
	local function roleOf(color)
		for _, role in ipairs(TEAM_ROLES) do
			local c = team[role]
			if math.abs(c.R - color.R) < 0.002 and math.abs(c.G - color.G) < 0.002 and math.abs(c.B - color.B) < 0.002 then
				return role
			end
		end
		return nil
	end
	for _, inst in ipairs(root:GetDescendants()) do
		if inst:IsA("BasePart") then
			inst:SetAttribute("TeamRole", roleOf(inst.Color))
		elseif inst:IsA("GuiObject") then
			if inst.BackgroundTransparency < 1 then
				inst:SetAttribute("TeamBackRole", roleOf(inst.BackgroundColor3))
			end
			if inst:IsA("TextLabel") then
				inst:SetAttribute("TeamTextRole", roleOf(inst.TextColor3))
			end
		end
	end
end

-- Axis-aligned block between two corners (campus coordinates).
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

-- A vertical slab standing on the plan line a -> b (a, b = { x, z }), y0..y1, `thick` across the
-- line. Its Front face (-Z) points to the right of a -> b (outward when a prow is drawn west -> east).
local function planSlab(ctx, name, a, b, y0, y1, thick, color, material, extra)
	local pa, pb = Vector3.new(a[1], 0, a[2]), Vector3.new(b[1], 0, b[2])
	local dir = (pb - pa).Unit
	local up = Vector3.new(0, 1, 0)
	local mid = (pa + pb) / 2
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Size = Vector3.new((pb - pa).Magnitude, y1 - y0, thick)
	props.CFrame = CFrame.fromMatrix(Vector3.new(mid.X, (y0 + y1) / 2, mid.Z), dir, up, dir:Cross(up))
	props.Color = color
	props.Material = material
	return BuildUtil.Part(ctx, props)
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
	The live label gets a dark background (BackgroundTransparency 0, the part's colour) and
	LightInfluence 0 so it reads like a lit screen.
	o: TextColor3, SubColor3, LiveWeight (share of the height for the live line, default 0.6),
	   BorderStuds + BorderColor3, InsetX, InsetY, PixelsPerStud, LabelName
	Returns the live TextLabel.
]]
local function liveSign(part, face, live, placeholder, subline, o)
	local pps = o.PixelsPerStud or 20
	local _, label = BuildUtil.LiveText(part, face, live, {
		LabelName = o.LabelName or (part.Name .. "Live"),
		Text = placeholder,
		TextColor3 = o.TextColor3,
		BackgroundColor3 = part.Color,
		BackgroundTransparency = 0,
		PixelsPerStud = pps,
		LightInfluence = 0,
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
	An HQ directory: a header, two columns of rooms (the reader's left and right, nearest first)
	and a footer line, on one face of `part` (a dark lit board).
]]
local function directoryText(part, face, header, columns, footer, accent)
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
	line("Header", header, 0.05, 0.03, 0.9, 0.13, accent, Enum.Font.GothamBlack, Enum.TextXAlignment.Center)
	local bar = Instance.new("Frame")
	bar.Name = "HeaderBar"
	bar.BackgroundColor3 = accent
	bar.BorderSizePixel = 0
	bar.Position = UDim2.new(0.05, 0, 0.175, 0)
	bar.Size = UDim2.new(0.9, 0, 0.012, 0)
	bar.Parent = gui
	for c, column in ipairs(columns) do
		local x = c == 1 and 0.05 or 0.53
		line("ColumnTitle", column.title, x, 0.21, 0.42, 0.075, accent, Enum.Font.GothamBlack)
		local step = math.min(0.095, 0.58 / math.max(1, #column.rooms))
		for r, room in ipairs(column.rooms) do
			line("Room", room, x, 0.3 + (r - 1) * step, 0.42, step * 0.82, WHITE)
		end
	end
	line("Footer", footer, 0.05, 0.89, 0.9, 0.08, accent, Enum.Font.GothamBlack, Enum.TextXAlignment.Center)
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

-- The largest SurfaceGui canvas side (pixels) used for the long flat floor graphics.
local MAX_CANVAS = 2000

-- A SurfaceGui on the Top face of a flat floor part, sized so its long side stays within
-- MAX_CANVAS. Returns the gui and its pixels per stud.
local function floorCanvas(part, name, maxPps)
	local pps = math.min(maxPps, MAX_CANVAS / math.max(part.Size.X, part.Size.Z))
	local gui = Instance.new("SurfaceGui")
	gui.Name = name
	gui.Face = Enum.NormalId.Top
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = pps
	gui.LightInfluence = 1
	gui.Parent = part
	return gui, pps
end

local function guiRect(gui, name, color, x, y, w, h)
	local frame = Instance.new("Frame")
	frame.Name = name
	frame.BackgroundColor3 = color
	frame.BorderSizePixel = 0
	frame.Position = UDim2.new(0, math.floor(x + 0.5), 0, math.floor(y + 0.5))
	frame.Size = UDim2.new(0, math.max(1, math.floor(w + 0.5)), 0, math.max(1, math.floor(h + 0.5)))
	frame.Parent = gui
	return frame
end

--[[
	A row of room pads: ONE raw-concrete plate (yTop - 0.04 .. yTop) under a whole row of zones.
	Its Top face draws each room's layout-yellow outline and a flat "FUTURE <ROOM>" label (the room
	pieces cover them when built). Top-face text reads upright from the part's +Z side, so a row
	read from -Z is turned around (the box is symmetric, so it stays in place).
	rooms: { { zone, name, hint, label = { x, z, width, depth }, fromMinusZ } }
]]
local function rowPad(ctx, rect, yTop, rowFromMinusZ, rooms)
	local cx, cz = (rect.MinX + rect.MaxX) / 2, (rect.MinZ + rect.MaxZ) / 2
	local w, d = rect.MaxX - rect.MinX, rect.MaxZ - rect.MinZ
	local pad = BuildUtil.Part(ctx, {
		Name = "ZonePad",
		Size = Vector3.new(w, 0.04, d),
		CFrame = CFrame.new(cx, yTop - 0.02, cz) * CFrame.Angles(0, rowFromMinusZ and math.pi or 0, 0),
		Color = RAW_CONCRETE,
		Material = Enum.Material.Concrete,
		CanCollide = false,
		CastShadow = false,
	})
	local gui, pps = floorCanvas(pad, "FloorLabelGui", 12)
	local s = rowFromMinusZ and -1 or 1
	-- world (x, z) -> canvas pixels (u, v): u grows along the part's +X, v along its +Z
	local function canvas(x, z)
		return (w / 2 + s * (x - cx)) * pps, (d / 2 + s * (z - cz)) * pps
	end
	local function canvasRect(x0, z0, x1, z1)
		local ua, va = canvas(x0, z0)
		local ub, vb = canvas(x1, z1)
		return math.min(ua, ub), math.min(va, vb), math.abs(ub - ua), math.abs(vb - va)
	end
	local edge = 0.6
	for _, room in ipairs(rooms) do
		local z = room.zone
		-- the yellow outline along the zone's four edges
		for _, e in ipairs({
			{ z.MinX, z.MinZ, z.MaxX, z.MinZ + edge },
			{ z.MinX, z.MaxZ - edge, z.MaxX, z.MaxZ },
			{ z.MinX, z.MinZ, z.MinX + edge, z.MaxZ },
			{ z.MaxX - edge, z.MinZ, z.MaxX, z.MaxZ },
		}) do
			local u, v, uw, vh = canvasRect(e[1], e[2], e[3], e[4])
			guiRect(gui, "Outline", LAYOUT_YELLOW, u, v, uw, vh)
		end
		-- the label: three lines stacked for a reader on the room's reading side (labels read from
		-- the other side than the row are turned upside down on the canvas)
		local l = room.label
		local u, v, uw, vh = canvasRect(l[1] - l[3] / 2, l[2] - l[4] / 2, l[1] + l[3] / 2, l[2] + l[4] / 2)
		local flipped = room.fromMinusZ ~= rowFromMinusZ
		local lines = {
			{ "FUTURE", 1, LAYOUT_YELLOW, Enum.Font.GothamBlack },
			{ room.name, 2.2, WHITE, Enum.Font.GothamBlack },
			{ room.hint, 0.8, LAYOUT_YELLOW, Enum.Font.GothamBold },
		}
		local y = 0.06
		for index, line in ipairs(lines) do
			local h = 0.88 * line[2] / 4
			local top = flipped and (1 - y - h) or y
			local text = Instance.new("TextLabel")
			text.Name = "Label" .. index
			text.BackgroundTransparency = 1
			text.BorderSizePixel = 0
			text.Position = UDim2.new(0, math.floor(u + 0.04 * uw), 0, math.floor(v + top * vh))
			text.Size = UDim2.new(0, math.floor(0.92 * uw), 0, math.floor(h * vh))
			text.Rotation = flipped and 180 or 0
			text.Font = line[4]
			text.Text = line[1]
			text.TextColor3 = line[3]
			text.TextScaled = true
			text.TextStrokeTransparency = 0.75
			text.Parent = gui
			y += h
		end
	end
	return pad
end

-- Two thin rods from the top of a hanging sign up to the ceiling above it.
local function hangerRods(ctx, x, offset, z, top, ceiling)
	for _, s in ipairs({ -1, 1 }) do
		post(ctx, "SignHangerRod", x + s * offset, z, top, ceiling, 0.25, STEEL, Enum.Material.Metal, DECOR)
	end
end

-- Static (closed) elevator doors facing +Z: two brushed leaves with a dark seam, under a dark
-- header band (headerH tall) naming the floor the elevator goes to.
local function elevatorDoors(ctx, name, x0, x1, y0, z0, z1, h, headerH, headerText, textColor)
	local doors = span(ctx, name, x0, y0, z0, x1, y0 + h + headerH, z1, BRUSHED, Enum.Material.Metal)
	local pps = 20
	local gui = Instance.new("SurfaceGui")
	gui.Name = "DoorGui"
	gui.Face = Enum.NormalId.Back
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = pps
	gui.LightInfluence = 0
	gui.Parent = doors
	local headerPx = math.floor(headerH * pps + 0.5)
	local header = guiRect(gui, "Header", SIGN_DARK, 0, 0, (x1 - x0) * pps, headerPx)
	local label = Instance.new("TextLabel")
	label.Name = "Floor"
	label.BackgroundTransparency = 1
	label.Position = UDim2.new(0.08, 0, 0.2, 0)
	label.Size = UDim2.new(0.84, 0, 0.6, 0)
	label.Font = Enum.Font.GothamBlack
	label.Text = headerText
	label.TextColor3 = textColor
	label.TextScaled = true
	label.Parent = header
	guiRect(gui, "Seam", STEEL, (x1 - x0) * pps / 2 - 1, headerPx, 2, h * pps)
	return doors
end

---------------------------------------------------------------------------------------------
-- Floors: ground slab, upper slab, both corridors, room pads + labels, wayfinding
---------------------------------------------------------------------------------------------

local function buildFloors(ctx, S, team)
	local L = S.L
	local floor = BuildUtil.Child(ctx, "Floors")
	local cor = L.HQCorridor
	local atrium = L.HQAtrium
	local up = S.up

	-- ground slab (its edges stay 0.1 inside the outer wall faces; the doorways at both corridor
	-- ends reach the towers' floors)
	span(floor, "HQFloor", S.x0 + 0.1, 0, S.z0 + 0.1, S.x1 - 0.1, FLOOR_TOP, S.z1 - 0.1, FLOOR_CONCRETE, Enum.Material.Concrete, {
		Reflectance = 0.06,
	})

	-- the upper slab around the atrium void (it also cantilevers over the arcade in front and the
	-- ledge at the back)
	span(floor, "UpperFloorSlab", S.x0, up - 1, SLAB_FRONT, atrium.MinX, up, SLAB_BACK, SLAB_COLOR, Enum.Material.Concrete)
	span(floor, "UpperFloorSlab", atrium.MinX, up - 1, atrium.MaxZ, atrium.MaxX, up, SLAB_BACK, SLAB_COLOR, Enum.Material.Concrete)
	span(floor, "UpperFloorSlab", atrium.MaxX, up - 1, SLAB_FRONT, S.x1, up, SLAB_BACK, SLAB_COLOR, Enum.Material.Concrete)

	-- corridors: a lighter terrazzo stripe with team-colour edge lines (drawn on it), both floors
	for _, level in ipairs({ { y = FLOOR_TOP, name = "", t = 0.03 }, { y = up, name = "Upper", t = 0.05 } }) do
		local corridor = span(
			floor,
			level.name .. "CorridorFloor",
			S.x0 + 0.1,
			level.y,
			cor.MinZ,
			S.x1 - 0.1,
			level.y + level.t,
			cor.MaxZ,
			CORRIDOR_FLOOR,
			Enum.Material.Marble,
			PAINT
		)
		local gui, pps = floorCanvas(corridor, "EdgeLinesGui", 12)
		local length = (S.x1 - S.x0 - 0.2) * pps
		local inset = (S.ix0 - S.x0 - 0.1) * pps
		for _, v in ipairs({ 0, cor.MaxZ - cor.MinZ - 0.6 }) do
			guiRect(gui, "EdgeLine", team.Primary, inset, v * pps, length - 2 * inset, 0.6 * pps)
		end
	end

	-- room zones: one raw-concrete pad per row of rooms, drawing every room's yellow outline and a
	-- flat "FUTURE <ROOM>" label (the room pieces cover them)
	local zones = L.Zones
	local function rowRooms(list, fromMinusZ, upstairs)
		local rooms = {}
		for _, room in ipairs(list) do
			local zone = zones[room.id]
			local cx, cz = (zone.MinX + zone.MaxX) / 2, (zone.MinZ + zone.MaxZ) / 2
			local entry = {
				zone = zone,
				name = room.name,
				hint = upstairs and "BUILD IT WITH THE BUY BUTTON IN THE UPSTAIRS HALLWAY" or "BUILD IT WITH THE BUY BUTTON IN THE HALLWAY",
				fromMinusZ = fromMinusZ,
			}
			if room.lobby then
				-- behind the lobby's buy button, read by players walking in through the entrance
				cz = zone.MaxZ - 20
				entry.hint = "STEP ON THE BUY BUTTON BY THE DOOR TO START"
				entry.fromMinusZ = true
			end
			entry.label = { cx, cz, math.min(zone.MaxX - zone.MinX - 8, 40), 16 }
			table.insert(rooms, entry)
		end
		return rooms
	end
	local function rect(firstId, lastId)
		local first, last = zones[firstId], zones[lastId]
		return { MinX = first.MinX, MaxX = last.MaxX, MinZ = first.MinZ, MaxZ = first.MaxZ }
	end
	local upperEast = { UPPER_FRONT_ROOMS[2], UPPER_FRONT_ROOMS[3], UPPER_FRONT_ROOMS[4] }
	rowPad(floor, rect("hq_frontoffice", "hq_lounge"), FLOOR_TOP + 0.04, false, rowRooms(FRONT_ROOMS, false))
	rowPad(floor, rect("hq_lockerroom", "hq_cafeteria"), FLOOR_TOP + 0.04, true, rowRooms(BACK_ROOMS, true))
	rowPad(floor, rect("hq_owner", "hq_owner"), up + 0.06, false, rowRooms({ UPPER_FRONT_ROOMS[1] }, false, true))
	rowPad(floor, rect("hq_media", "hq_analytics"), up + 0.06, false, rowRooms(upperEast, false, true))
	rowPad(floor, rect("hq_kitchen", "hq_players"), up + 0.06, true, rowRooms(UPPER_BACK_ROOMS, true, true))

	-- entrance mat inside the doors (stops short of the spawn point); turned around because
	-- Top-face text reads upright from the part's +Z side and players walk in along +Z
	local walk = L.HQEntranceWalk
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
		{ Text = "TEAM HQ", Color = teamInk(ctx, "Primary", { "Trim", "Secondary" }) },
	}, { PixelsPerStud = 16, InsetX = 0.1, InsetY = 0.18 })

	-- wayfinding at the lobby / corridor junction: a team medallion and two arrows (in the front
	-- lane, clear of every buy button) pointing to the two ways upstairs
	local junctionX = (walk.MinX + walk.MaxX) / 2
	local midZ = (cor.MinZ + cor.MaxZ) / 2
	post(floor, "CorridorMedallionRing", junctionX, midZ, 0.23, 0.245, 10, team.Trim, Enum.Material.SmoothPlastic, PAINT)
	post(floor, "CorridorMedallion", junctionX, midZ, 0.23, 0.25, 8.8, team.Primary, Enum.Material.SmoothPlastic, PAINT)
	local laneZ = cor.MinZ + 3.8
	local arrowText = teamInk(ctx, "Primary", { "Trim", "Secondary" })
	floorArrow(floor, "WayfindingArrowWest", junctionX - 6, junctionX - 31, laneZ, 0.23, team.Primary, {
		"STAIRS + ELEVATOR",
		"TO THE UPPER FLOOR",
	}, arrowText)
	floorArrow(floor, "WayfindingArrowEast", junctionX + 6, junctionX + 31, laneZ, 0.23, team.Primary, {
		"GLASS ELEVATOR",
		"UPPER FLOOR + SKY TERRACE",
	}, arrowText)
end

---------------------------------------------------------------------------------------------
-- Facades: stone base + storefront, glass upper floor, overhangs, colonnade blades, louvers
---------------------------------------------------------------------------------------------

local function buildFacades(ctx, S, team)
	local L = S.L
	local walls = BuildUtil.Child(ctx, "Facades")
	local up = S.up
	local sb = up - 1 -- slab underside
	local cor = L.HQCorridor
	local doorZ = (cor.MinZ + cor.MaxZ) / 2
	local d0, d1 = doorZ - DOOR_HALF, doorZ + DOOR_HALF
	local fz0, fz1 = S.z0, S.iz0 -- front wall
	local gz0, gz1 = fz0 + 0.5, fz0 + 1 -- glass plane in it

	-- FRONT of the two wings (the atrium between them gets the glass prow)
	for _, wing in ipairs(S.wings) do
		local w0, w1 = wing.x0, wing.x1
		span(walls, "FacadePlinth", w0, 0, fz0, w1, 2.5, fz1, GRANITE, Enum.Material.Granite)
		-- (the dark spandrels hide the space between the rooms' ceilings and the slab / roof)
		span(walls, "FacadeStorefront", w0, 2.5, gz0, w1, 12.6, gz1, CURTAIN_GLASS, Enum.Material.Glass, CURTAIN_PROPS)
		span(walls, "FacadeSpandrel", w0, 12.6, fz0, w1, sb, fz1, SPANDREL, Enum.Material.Glass, { Reflectance = 0.25 })
		span(walls, "UpperCurtainWall", w0, up, gz0, w1, UPPER_SPANDREL, gz1, CURTAIN_GLASS, Enum.Material.Glass, CURTAIN_PROPS)
		span(
			walls,
			"UpperSpandrel",
			w0,
			UPPER_SPANDREL,
			fz0 + 0.3,
			w1,
			ROOF_BOTTOM,
			fz1 - 0.3,
			SPANDREL,
			Enum.Material.Glass,
			{ Reflectance = 0.25 }
		)
		-- the cantilevered slab edge and the roof fascia (team colour) in front of the overhang
		-- (the fascias run 0.05 past the slab + roof ends so no end faces share a plane)
		local slabEdge = span(
			walls,
			"SlabEdgeFascia",
			w0 - 0.05,
			sb - 0.4,
			SLAB_FRONT - 0.4,
			w1 + 0.05,
			up + 0.6,
			SLAB_FRONT + 0.4,
			PANEL_WHITE,
			Enum.Material.SmoothPlastic
		)
		BuildUtil.Light(slabEdge, "SpotLight", {
			Name = "ArcadeLight",
			Face = Enum.NormalId.Bottom,
			Range = 30,
			Angle = 120,
			Brightness = 1.2,
			Color = WARM_LIGHT,
		})
		span(
			walls,
			"RoofFascia",
			w0 - 0.05,
			ROOF_BOTTOM - 0.3,
			SLAB_FRONT - 0.4,
			w1 + 0.05,
			PARAPET_TOP,
			SLAB_FRONT + 0.4,
			team.Primary,
			Enum.Material.SmoothPlastic
		)
		-- horizontal sun louvers in front of the upper glass
		span(walls, "SunLouver", w0, 26, BLADE_Z0 + 0.6, w1, 26.4, BLADE_Z1 + 1.8, PANEL_WHITE, Enum.Material.SmoothPlastic, DECOR)
		-- arcade paving under the overhang
		span(walls, "ArcadePaving", w0, 0, SLAB_FRONT, w1, 0.15, fz0, PAVER, Enum.Material.Slate)
		-- the colonnade: tall white blades from the ground to the roof (every 12.5 studs)
		for _, x in ipairs(wing.blades) do
			span(walls, "ColonnadeBlade", x - 0.4, 0, BLADE_Z0, x + 0.4, ROOF_BOTTOM, BLADE_Z1, PANEL_WHITE, Enum.Material.SmoothPlastic)
		end
	end

	-- SIDES: limestone ground floor, glass upper floor (stone where the towers attach), doorways
	-- at both corridor ends on both floors, a team-colour parapet along the roof edge
	-- (the end walls reach 0.45 into the front / back walls, past the glass planes in them, so the
	-- corners have no see-through slits)
	local cz0, cz1 = S.iz0 - 0.45, S.iz1 + 0.45
	local function sideWall(name, t0, t1, towerZ0, towerZ1)
		local function slab(z0, z1, y0, y1, color, material, extra)
			return span(walls, name, t0, y0, z0, t1, y1, z1, color, material, extra)
		end
		-- ground floor
		slab(cz0, d0, 0, sb, LIMESTONE, Enum.Material.Limestone)
		slab(d1, cz1, 0, sb, LIMESTONE, Enum.Material.Limestone)
		slab(d0, d1, DOOR_TOP, sb, LIMESTONE, Enum.Material.Limestone)
		-- upper floor
		slab(cz0, towerZ0, up, ROOF_BOTTOM, CURTAIN_GLASS, Enum.Material.Glass, CURTAIN_PROPS)
		slab(towerZ0, d0, up, ROOF_BOTTOM, LIMESTONE, Enum.Material.Limestone)
		slab(d1, towerZ1, up, ROOF_BOTTOM, LIMESTONE, Enum.Material.Limestone)
		slab(d0, d1, up + DOOR_TOP - FLOOR_TOP, ROOF_BOTTOM, LIMESTONE, Enum.Material.Limestone)
		slab(towerZ1, cz1, up, ROOF_BOTTOM, CURTAIN_GLASS, Enum.Material.Glass, CURTAIN_PROPS)
	end
	-- (0.05 proud of the front / back walls' end faces, so those never share a plane with them)
	sideWall("WestWall", S.x0 - 0.05, S.ix0, CORE.MinZ, CORE.MaxZ)
	sideWall("EastWall", S.ix1, S.x1 + 0.05, TOWER.MinZ, TOWER.MaxZ)
	span(
		walls,
		"WestParapet",
		S.x0 - 0.4,
		ROOF_BOTTOM - 0.3,
		SLAB_FRONT,
		S.x0 + 1.45, -- (its inner face stays just inside the wall below the roof)
		PARAPET_TOP,
		ROOF_BACK,
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	-- (the east parapet opens where the elevator tower's top floor steps out onto the Sky Terrace)
	for _, z in ipairs({ { SLAB_FRONT, TOWER.MinZ }, { TOWER.MaxZ, ROOF_BACK } }) do
		span(
			walls,
			"EastParapet",
			S.x1 - 1.45,
			ROOF_BOTTOM - 0.3,
			z[1],
			S.x1 + 0.4,
			PARAPET_TOP,
			z[2],
			team.Primary,
			Enum.Material.SmoothPlastic
		)
	end

	-- BACK (faces the practice fields): solid limestone ground floor, glass upper floor, a ledge
	-- + roof overhang, team-colour fins and a sun louver
	span(walls, "BackWall", S.x0, 0, S.iz1, S.x1, sb, S.z1, LIMESTONE, Enum.Material.Limestone)
	span(walls, "BackPlinth", S.x0, 0, S.z1, S.x1, 2.5, S.z1 + 0.3, GRANITE, Enum.Material.Granite)
	span(
		walls,
		"UpperBackCurtainWall",
		S.x0,
		up,
		S.z1 - 1,
		S.x1,
		UPPER_SPANDREL,
		S.z1 - 0.5,
		CURTAIN_GLASS,
		Enum.Material.Glass,
		CURTAIN_PROPS
	)
	span(
		walls,
		"UpperBackSpandrel",
		S.x0,
		UPPER_SPANDREL,
		S.z1 - 1.2,
		S.x1,
		ROOF_BOTTOM,
		S.z1 - 0.3,
		SPANDREL,
		Enum.Material.Glass,
		{ Reflectance = 0.25 }
	)
	span(
		walls,
		"BackSlabEdgeFascia",
		S.x0 - 0.05,
		sb - 0.4,
		SLAB_BACK - 0.4,
		S.x1 + 0.05,
		up + 0.6,
		SLAB_BACK + 0.4,
		PANEL_WHITE,
		Enum.Material.SmoothPlastic
	)
	local backBand = span(
		walls,
		"BackRoofFascia",
		S.x0,
		ROOF_BOTTOM - 0.3,
		ROOF_BACK - 0.6,
		S.x1,
		PARAPET_TOP,
		ROOF_BACK + 0.2,
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	local bandText = teamInk(ctx, "Primary", { "Trim", "Secondary" })
	panelText(backBand, { Enum.NormalId.Back }, { { Text = "TEAM HEADQUARTERS", Color = bandText } }, {
		PixelsPerStud = 8,
		InsetX = 0.35,
		InsetY = 0.12,
	})
	span(walls, "BackSunLouver", S.x0, 25.5, S.z1, S.x1, 25.9, S.z1 + 3, PANEL_WHITE, Enum.Material.SmoothPlastic, DECOR)
	for _, x in ipairs({ -200, -100, 0, 75 }) do
		span(walls, "BackFin", x - 0.6, 0, S.z1, x + 0.6, ROOF_BOTTOM, S.z1 + 3.2, team.Primary, Enum.Material.SmoothPlastic)
	end

	-- EXIT signs over the ground doorways at both corridor ends, STAIRS / ELEVATOR upstairs
	for _, side in ipairs({
		{ x = S.ix0 + 0.15, face = Enum.NormalId.Right, upper = "STAIRS" },
		{ x = S.ix1 - 0.15, face = Enum.NormalId.Left, upper = "ELEVATOR" },
	}) do
		for _, level in ipairs({
			{ y = DOOR_TOP, text = "EXIT", color = EXIT_GREEN },
			{ y = up + DOOR_TOP - FLOOR_TOP, text = side.upper, color = BUTTON_GLOW },
		}) do
			local sign = BuildUtil.Box(
				walls,
				"ExitSign",
				Vector3.new(0.3, 1.2, 5),
				Vector3.new(side.x, level.y + 0.75, doorZ),
				SIGN_DARK,
				Enum.Material.SmoothPlastic,
				DECOR
			)
			panelText(sign, { side.face }, { { Text = level.text, Color = level.color } }, { LightInfluence = 0, InsetY = 0.14 })
		end
	end

	-- sliding glass doors from the ground corridor into the east elevator tower
	local doorHeight = DOOR_TOP - FLOOR_TOP
	local centre = Vector3.new((S.ix1 + S.x1) / 2, FLOOR_TOP + doorHeight / 2, doorZ)
	BuildUtil.Door(walls, {
		Name = "EastDoors",
		Size = Vector3.new(d1 - d0, doorHeight, 0.4),
		CFrame = CFrame.lookAt(centre, centre + Vector3.new(1, 0, 0)),
		Double = true,
		Slide = true,
		Color = DOOR_GLASS,
		Material = Enum.Material.Glass,
		Transparency = 0.45,
		Object = "Glass Doors",
		Title = "East Doors",
		Info = "Through here: the glass elevator up to the upper floor and the Sky Terrace on the roof, and the way out to the Hall of Fame.",
		Distance = 8,
	})
end

---------------------------------------------------------------------------------------------
-- The atrium: glass prow, entrance canopy + doors, tall roof with a lantern, railing, banner
---------------------------------------------------------------------------------------------

local function buildAtrium(ctx, S, team)
	local L = S.L
	local C = ctx.config.Colors
	local atr = BuildUtil.Child(ctx, "Atrium")
	local walk = L.HQEntranceWalk
	local atrium = L.HQAtrium
	local ax0, ax1 = atrium.MinX, atrium.MaxX
	local wx0, wx1 = walk.MinX, walk.MaxX
	local cx = (wx0 + wx1) / 2
	local fz = S.z0
	local up = S.up
	local roofY = ATRIUM_ROOF_BOTTOM

	-- the glass prow: five facets (west -> east) from the canopy up to the atrium roof
	-- the glass prow: a circular arc (8 flat facets) from the west corner of the atrium (z = 200)
	-- out to z = PROW_Z in the middle and back, standing on the canopy, up to the atrium roof
	local half = (ax1 - ax0) / 2
	local sag = fz - PROW_Z
	local radius = (half * half + sag * sag) / (2 * sag)
	local zc = PROW_Z + radius
	local alpha = math.asin(half / radius)
	local P, tangents = {}, {}
	for i = 0, PROW_FACETS do
		local theta = -alpha + 2 * alpha * i / PROW_FACETS
		table.insert(P, { cx + radius * math.sin(theta), zc - radius * math.cos(theta) })
		table.insert(tangents, Vector3.new(math.cos(theta), 0, math.sin(theta)))
	end
	for i = 1, #P - 1 do
		planSlab(atr, "ProwGlass", P[i], P[i + 1], CANOPY_TOP, roofY, 0.4, PROW_GLASS, Enum.Material.Glass, PROW_PROPS)
		-- a transom on the upper floor line
		planSlab(atr, "ProwTransom", P[i], P[i + 1], up - 0.5, up + 0.5, 0.9, PANEL_WHITE, Enum.Material.SmoothPlastic)
	end
	-- radial mullion fins at every joint
	local yUp = Vector3.new(0, 1, 0)
	for i, m in ipairs(P) do
		BuildUtil.Part(atr, {
			Name = "ProwMullion",
			Size = Vector3.new(0.6, roofY - CANOPY_TOP, 1.5),
			CFrame = CFrame.fromMatrix(Vector3.new(m[1], (CANOPY_TOP + roofY) / 2, m[2]), tangents[i], yUp, tangents[i]:Cross(yUp)),
			Color = PANEL_WHITE,
			Material = Enum.Material.SmoothPlastic,
		})
	end

	-- the big lit team sign on the prow (live team name over HEADQUARTERS)
	local facadeSign = span(atr, "HQFacadeSign", cx - 15, 31, 188.2, cx + 15, 37.4, 188.7, SIGN_DARK, Enum.Material.SmoothPlastic)
	local signColor = teamInk(ctx, SIGN_DARK, { "Trim", "Secondary" })
	S.refs.FacadeSignLabel = liveSign(facadeSign, Enum.NormalId.Front, "team", "TEAM", "HEADQUARTERS", {
		LabelName = "FacadeTeamName",
		TextColor3 = signColor,
		SubColor3 = WHITE,
		LiveWeight = 0.62,
		BorderStuds = 0.3,
		BorderColor3 = team.Primary,
		InsetX = 0.06,
		InsetY = 0.12,
	})

	-- the entrance canopy (the prow's floor) on four slim columns under the prow corners
	-- (its front edge stays 0.1 behind the MAIN ENTRANCE sign's face)
	local canopy = span(atr, "EntranceCanopy", ax0, CANOPY_BOTTOM, 188.1, ax1, CANOPY_TOP, fz + 1, PANEL_WHITE, Enum.Material.SmoothPlastic)
	BuildUtil.Light(canopy, "SpotLight", {
		Name = "CanopyLight",
		Face = Enum.NormalId.Bottom,
		Range = 24,
		Angle = 120,
		Brightness = 2,
		Color = WARM_LIGHT,
	})
	for _, i in ipairs({ 2, 3, #P - 2, #P - 1 }) do
		post(atr, "CanopyColumn", P[i][1], P[i][2], 0, CANOPY_BOTTOM, 1.1, STEEL, Enum.Material.Metal)
	end
	local entranceSign =
		span(atr, "EntranceSign", wx0 - 2, 10.3, 188, wx1 + 2, CANOPY_TOP + 0.2, 188.5, team.Primary, Enum.Material.SmoothPlastic)
	panelText(entranceSign, { Enum.NormalId.Front }, {
		{ Text = "MAIN ENTRANCE", Color = teamInk(ctx, "Primary", { "Trim", "Secondary" }) },
	}, { PixelsPerStud = 20, InsetX = 0.12, InsetY = 0.16, LightInfluence = 0.5 })

	-- ground floor of the atrium front: granite sills, glass storefront, a team-colour portal
	-- around the main entrance (the opening stays clear; the revolving doors don't collide)
	for _, seg in ipairs({ { ax0, wx0 - 2 }, { wx1 + 2, ax1 } }) do
		span(atr, "LobbySill", seg[1], 0, fz, seg[2], 1, S.iz0, GRANITE, Enum.Material.Granite)
		span(atr, "LobbyStorefront", seg[1], 1, fz + 0.5, seg[2], CANOPY_BOTTOM, fz + 1, PROW_GLASS, Enum.Material.Glass, PROW_PROPS)
	end
	for _, jamb in ipairs({ { wx0 - 2, wx0 }, { wx1, wx1 + 2 } }) do
		span(atr, "EntrancePortal", jamb[1], 0, fz - 0.6, jamb[2], CANOPY_BOTTOM, fz + 2, team.Primary, Enum.Material.SmoothPlastic)
	end
	span(atr, "EntrancePortalHead", wx0, ENTRANCE_HEAD, fz - 0.6, wx1, CANOPY_BOTTOM, fz + 2, team.Primary, Enum.Material.SmoothPlastic)
	local exitSign = span(
		atr,
		"ExitSign",
		cx - 2.5,
		ENTRANCE_HEAD,
		fz + 2,
		cx + 2.5,
		ENTRANCE_HEAD + 1.3,
		fz + 2.2,
		SIGN_DARK,
		Enum.Material.SmoothPlastic,
		DECOR
	)
	panelText(exitSign, { Enum.NormalId.Back }, { { Text = "EXIT", Color = EXIT_GREEN } }, { LightInfluence = 0, InsetY = 0.14 })
	for _, dx in ipairs({ -6.5, 6.5 }) do
		local p = Vector3.new(cx + dx, 0, fz + 0.75)
		local drum = post(atr, "RevolvingDoorDrum", p.X, p.Z, FLOOR_TOP, FLOOR_TOP + 9, 7, C.Glass, Enum.Material.Glass, {
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
		post(atr, "RevolvingDoorCap", p.X, p.Z, FLOOR_TOP + 9, FLOOR_TOP + 9.8, 7.6, STEEL, Enum.Material.Metal, DECOR)
		for _, angle in ipairs({ 45, -45 }) do
			BuildUtil.Part(atr, {
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

	-- the atrium roof (higher than the wings) around a glass lantern skylight on steel beams
	local rx0, rx1, rz0, rz1 = ax0 - 2, ax1 + 2, 188.6, 281
	local sx0, sx1, sz0, sz1 = ax0 + 10, ax1 - 10, 206, 258
	local roofTop = ATRIUM_ROOF_TOP
	span(atr, "AtriumRoof", rx0, roofY, rz0, rx1, roofTop, sz0, ROOF_GREY, Enum.Material.SmoothPlastic)
	span(atr, "AtriumRoof", rx0, roofY, sz1, rx1, roofTop, rz1, ROOF_GREY, Enum.Material.SmoothPlastic)
	span(atr, "AtriumRoof", rx0, roofY, sz0, sx0, roofTop, sz1, ROOF_GREY, Enum.Material.SmoothPlastic)
	span(atr, "AtriumRoof", sx1, roofY, sz0, rx1, roofTop, sz1, ROOF_GREY, Enum.Material.SmoothPlastic)
	span(atr, "AtriumSkylight", sx0, roofY + 0.2, sz0, sx1, roofTop + 1.4, sz1, C.Glass, Enum.Material.Glass, SKYLIGHT_PROPS)
	for _, bx in ipairs({ cx - 20, cx + 20 }) do
		span(atr, "AtriumSkylightBeam", bx - 0.4, roofY - 0.8, sz0, bx + 0.4, roofY + 0.2, sz1, STEEL, Enum.Material.Metal)
	end
	span(atr, "AtriumRoofFascia", rx0, roofY - 0.6, 188, rx1, roofTop + 0.8, rz0, team.Primary, Enum.Material.SmoothPlastic)
	-- clerestory glass above the wing roofs on the atrium's sides and back
	local glassTop = roofY
	span(atr, "AtriumClerestory", ax0 - 0.3, ROOF_TOP, fz, ax0 + 0.3, glassTop, rz1, CURTAIN_GLASS, Enum.Material.Glass, CURTAIN_PROPS)
	span(atr, "AtriumClerestory", ax1 - 0.3, ROOF_TOP, fz, ax1 + 0.3, glassTop, rz1, CURTAIN_GLASS, Enum.Material.Glass, CURTAIN_PROPS)
	span(
		atr,
		"AtriumClerestory",
		ax0 + 0.3,
		ROOF_TOP,
		rz1 - 0.6,
		ax1 - 0.3,
		glassTop,
		rz1,
		CURTAIN_GLASS,
		Enum.Material.Glass,
		CURTAIN_PROPS
	)

	-- two big LED pendant rings hanging from the skylight beams (above every room zone's limit)
	for _, px in ipairs({ cx - 20, cx + 20 }) do
		post(atr, "AtriumPendantRod", px, 216, 37, roofY - 0.8, 0.3, STEEL, Enum.Material.Metal, DECOR)
		local ring = post(atr, "AtriumPendant", px, 216, 36.4, 37, 10, LAMP, Enum.Material.Neon, PAINT)
		BuildUtil.Light(ring, "PointLight", { Name = "AtriumLight", Range = 60, Brightness = 1.4, Color = WARM_LIGHT, Shadows = false })
	end

	-- the glass railing along the upper corridor's edge where it overlooks the atrium. The grand
	-- staircase piece (hq_atrium) opens this edge onto its west balcony and east mezzanine, so the
	-- shell only guards the stretch between them.
	local r0, r1 = RAILING_X0, RAILING_X1
	span(atr, "AtriumRailingGlass", r0, up, atrium.MaxZ, r1, up + 3.3, atrium.MaxZ + 0.3, C.Glass, Enum.Material.Glass, RAIL_PROPS)
	span(atr, "AtriumRailingTop", r0, up + 3.3, atrium.MaxZ - 0.02, r1, up + 3.57, atrium.MaxZ + 0.32, STEEL, Enum.Material.Metal)

	-- the WELCOME banner hanging over the railing, facing the entrance (players spawn facing it).
	-- It is no wider than the lobby's Big Screen (lobby step 5, just in front of it), which then
	-- takes over the view.
	local bannerColor = team.Trim
	local banner = span(
		atr,
		"WelcomeBanner",
		cx - 20,
		up - 2,
		atrium.MaxZ - 0.95,
		cx + 20,
		up + 4.6,
		atrium.MaxZ - 0.55,
		bannerColor,
		Enum.Material.Fabric,
		DECOR
	)
	local bannerText = teamInk(ctx, "Trim", { "Primary", "Secondary" })
	local bannerLabels = panelText(banner, { Enum.NormalId.Front }, {
		{ Text = "WELCOME", Weight = 1.6, Color = bannerText },
		{ Text = "TO YOUR TEAM HEADQUARTERS", Weight = 0.8, Color = bannerText },
	}, { BorderStuds = 0.4, BorderColor3 = team.Primary, InsetX = 0.05, InsetY = 0.1, LightInfluence = 0.5 })
	S.refs.WelcomeLabel = bannerLabels[1]
	-- (the prompt sits at eye height on the lobby floor below the banner)
	BuildUtil.Look(
		banner,
		"Welcome Banner",
		"Welcome to your Team HQ! Build every room step by step with the glowing buy buttons in the hallways - upstairs too. Here's what to do next:",
		{ LookKey = "quests", At = Vector3.new(0, -(up + 1.3 - 5), -3), Distance = 9 }
	)

	-- non-collidable bulkheads closing the gap between the ground rooms beside the lobby (12.2
	-- tall) and the slab soffit, facing the atrium
	for _, x in ipairs({ ax0 - 0.2, ax1 }) do
		span(atr, "AtriumBulkhead", x, 12.6, atrium.MinZ, x + 0.2, up - 1, atrium.MaxZ, PANEL_WHITE, Enum.Material.SmoothPlastic, PAINT)
	end
end

---------------------------------------------------------------------------------------------
-- Wing roofs: slabs around the corridor skylights, rooftop plant, helipad, solar arrays
---------------------------------------------------------------------------------------------

local function buildRoofs(ctx, S)
	local roof = BuildUtil.Child(ctx, "Roof")
	local atrium = S.L.HQAtrium
	local cor = S.L.HQCorridor
	local sz0, sz1 = cor.MinZ + 2, cor.MaxZ - 2
	local function slab(x0, z0, x1, z1)
		span(roof, "RoofSlab", x0, ROOF_BOTTOM, z0, x1, ROOF_TOP, z1, ROOF_GREY, Enum.Material.SmoothPlastic)
	end
	local function skylight(x0, x1)
		span(
			roof,
			"CorridorSkylight",
			x0,
			ROOF_BOTTOM + 0.2,
			sz0,
			x1,
			ROOF_TOP + 0.6,
			sz1,
			ctx.config.Colors.Glass,
			Enum.Material.Glass,
			SKYLIGHT_PROPS
		)
	end
	-- west wing (skylight X[-240, -160]) and east wing (skylight X[-40, 36], west of the terrace)
	for _, wing in ipairs({ { S.x0, atrium.MinX, -240, -160 }, { atrium.MaxX, S.x1, -40, 36 } }) do
		slab(wing[1], SLAB_FRONT, wing[2], sz0)
		slab(wing[1], sz1, wing[2], ROOF_BACK)
		slab(wing[1], sz0, wing[3], sz1)
		slab(wing[4], sz0, wing[2], sz1)
		skylight(wing[3], wing[4])
	end
	-- the back block behind the atrium
	slab(atrium.MinX, 281, atrium.MaxX, ROOF_BACK)
	-- green (sedum) roofs in front of the corridor skylights
	for _, g in ipairs({ { S.x0 + 4, atrium.MinX - 4 }, { atrium.MaxX + 4, TERRACE.MinX - 4 } }) do
		span(roof, "RoofSedum", g[1], ROOF_TOP, SLAB_FRONT + 4, g[2], ROOF_TOP + 0.06, sz0 - 4, SEDUM, Enum.Material.Grass)
	end

	-- rooftop plant on the back block: two HVAC units
	for _, unit in ipairs({ { -125, 330 }, { -78, 330 } }) do
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
			Enum.Material.DiamondPlate
		)
	end
	-- two tilted solar arrays on the east wing (facing the stadium)
	for _, z in ipairs({ 305, 330 }) do
		BuildUtil.Part(roof, {
			Name = "RoofSolarArray",
			Size = Vector3.new(60, 0.4, 12),
			CFrame = CFrame.new(-8, ROOF_TOP + 1.8, z) * CFrame.Angles(math.rad(-15), 0, 0),
			Color = SOLAR_BLUE,
			Material = Enum.Material.Glass,
			Reflectance = 0.25,
		})
	end
	-- helipad on the west wing: yellow ring + dark pad with a painted H
	local hx, hz = -200, 318
	post(roof, "RoofHelipadRing", hx, hz, ROOF_TOP, ROOF_TOP + 0.1, 27, LAYOUT_YELLOW, Enum.Material.SmoothPlastic)
	local pad = span(roof, "RoofHelipad", hx - 9, ROOF_TOP, hz - 9, hx + 9, ROOF_TOP + 0.2, hz + 9, HELIPAD, Enum.Material.Asphalt)
	panelText(pad, { Enum.NormalId.Top }, { { Text = "H", Color = WHITE } }, { PixelsPerStud = 10, InsetX = 0.2, InsetY = 0.12 })
end

---------------------------------------------------------------------------------------------
-- Interior: corridor bulkheads, room signs on both floors, directories, lights, benches
---------------------------------------------------------------------------------------------

local function buildInterior(ctx, S, team)
	local L = S.L
	local inside = BuildUtil.Child(ctx, "Interior")
	local cor = L.HQCorridor
	local zones = L.Zones
	local up = S.up
	local sb = up - 1
	local doorZ = (cor.MinZ + cor.MaxZ) / 2

	-- bulkheads over the ground room fronts (room ceilings top out at 12.6, the slab soffit is at
	-- 16); the lobby side stays open up to the soffit
	local atriumEdge = L.HQAtrium
	for _, seg in ipairs({ { S.ix0, atriumEdge.MinX }, { atriumEdge.MaxX, S.ix1 } }) do
		span(
			inside,
			"CorridorBulkhead",
			seg[1],
			12.6,
			cor.MinZ - 0.2,
			seg[2],
			sb,
			cor.MinZ,
			PANEL_WHITE,
			Enum.Material.SmoothPlastic,
			PAINT
		)
	end
	span(inside, "CorridorBulkhead", S.ix0, 12.6, cor.MaxZ, S.ix1, sb, cor.MaxZ + 0.2, PANEL_WHITE, Enum.Material.SmoothPlastic, PAINT)
	-- upstairs: the upper rooms' walls stop at y 31; close the slot up to the wing roof
	local UPPER_WALL_TOP = 31
	for _, seg in ipairs({ { S.ix0, atriumEdge.MinX }, { atriumEdge.MaxX, S.ix1 } }) do
		span(
			inside,
			"UpperBulkhead",
			seg[1],
			UPPER_WALL_TOP,
			cor.MinZ - 0.2,
			seg[2],
			ROOF_BOTTOM,
			cor.MinZ,
			PANEL_WHITE,
			Enum.Material.SmoothPlastic,
			PAINT
		)
	end
	span(
		inside,
		"UpperBulkhead",
		S.ix0,
		UPPER_WALL_TOP,
		cor.MaxZ,
		S.ix1,
		ROOF_BOTTOM,
		cor.MaxZ + 0.2,
		PANEL_WHITE,
		Enum.Material.SmoothPlastic,
		PAINT
	)
	for _, x in ipairs({ atriumEdge.MinX - 0.2, atriumEdge.MaxX }) do
		span(
			inside,
			"UpperBulkhead",
			x,
			UPPER_WALL_TOP,
			atriumEdge.MinZ,
			x + 0.2,
			ROOF_BOTTOM,
			atriumEdge.MaxZ,
			PANEL_WHITE,
			Enum.Material.SmoothPlastic,
			PAINT
		)
	end

	-- room-name signs over both corridors, facing them (front row -> +Z, back row -> -Z). Ground:
	-- hung from the slab soffit; upstairs: hung from the wing roofs, or on rods from the atrium's
	-- higher roof where the corridor passes behind the atrium
	local signText = teamInk(ctx, "Primary", { "Trim", "Secondary" })
	local atrium = L.HQAtrium
	local signRows = {
		{ rooms = FRONT_ROOMS, z = cor.MinZ + 0.6, size = GROUND_SIGN_SIZE, y = sb - GROUND_SIGN_SIZE.Y / 2 },
		{ rooms = BACK_ROOMS, z = cor.MaxZ - 0.6, size = GROUND_SIGN_SIZE, y = sb - GROUND_SIGN_SIZE.Y / 2 },
		{ rooms = UPPER_FRONT_ROOMS, z = cor.MinZ + 0.6, size = SIGN_SIZE, y = ROOF_BOTTOM - SIGN_SIZE.Y / 2, upper = true },
		{ rooms = UPPER_BACK_ROOMS, z = cor.MaxZ - 0.6, size = SIGN_SIZE, y = ROOF_BOTTOM - SIGN_SIZE.Y / 2, upper = true },
	}
	for _, row in ipairs(signRows) do
		for _, room in ipairs(row.rooms) do
			if not room.lobby then
				local zone = zones[room.id]
				local x = (room.buttonX + (zone.MinX + zone.MaxX) / 2) / 2
				local y = row.y
				local halfW = row.size.X / 2
				local overAtrium = false
				if row.upper then
					-- a sign straddling the atrium's edge moves under the wing roof beside it
					for _, edge in ipairs({ atrium.MinX, atrium.MaxX }) do
						if math.abs(x - edge) < halfW + 1 then
							x = edge + (x < edge and -1 or 1) * (halfW + 1)
						end
					end
					overAtrium = x > atrium.MinX and x < atrium.MaxX
					if overAtrium then
						y = S.up + 12
					end
				end
				local sign = BuildUtil.Box(
					inside,
					"RoomSign_" .. room.id,
					row.size,
					Vector3.new(x, y, row.z),
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
				if overAtrium then
					hangerRods(inside, x, halfW - 1.5, row.z, y + row.size.Y / 2, ATRIUM_ROOF_BOTTOM)
				end
			end
		end
	end

	-- HQ directories on the corridor end walls of both floors (above the doorways), listing the
	-- rooms on the reader's left and right, nearest first
	local function reversed(list)
		local out = {}
		for i = #list, 1, -1 do
			table.insert(out, list[i])
		end
		return out
	end
	local floors = {
		{
			y = DOOR_TOP + 1.6,
			h = 5.2, -- (under the slab soffit at 16)
			header = "HQ DIRECTORY - GROUND FLOOR",
			front = { "FRONT OFFICE", "COACHES' OFFICES", "LOBBY & TEAM SAFE", "INTERVIEW ROOM", "MEETING ROOM", "PLAYER LOUNGE" },
			back = { "LOCKER ROOM", "EQUIPMENT ROOM", "WEIGHT ROOM", "TRAINING ROOM", "FILM ROOM", "CAFETERIA" },
			footers = { "UPSTAIRS: STAIRS + ELEVATOR THROUGH THESE DOORS", "UPSTAIRS + SKY TERRACE: GLASS ELEVATOR THROUGH THESE DOORS" },
			info = "Ground floor: Front Office (draft), Coaches' Offices, Lobby + team safe, Interview Room, Meeting Room, "
				.. "Player Lounge, Locker Room, Equipment Room, Weight Room, Training Room, Film Room and Cafeteria. "
				.. "Take the stairs at the west end or the glass elevator at the east end to go upstairs!",
		},
		{
			y = up + DOOR_TOP - FLOOR_TOP + 1.6,
			h = 6,
			header = "HQ DIRECTORY - UPPER FLOOR",
			front = { "OWNER'S SUITE", "GRAND ATRIUM", "MEDIA STUDIO", "SCOUTING WAR ROOM", "ANALYTICS LAB" },
			back = { "NUTRITION KITCHEN", "BARBERSHOP", "RECOVERY SPA & POOL", "PLAYER DEVELOPMENT" },
			footers = { "SKY TERRACE: GLASS ELEVATOR AT THE EAST END", "SKY TERRACE: GLASS ELEVATOR THROUGH THESE DOORS" },
			info = "Upper floor: Owner's Suite, Grand Atrium balcony, Media Studio, Scouting War Room, Analytics Lab, "
				.. "Nutrition Kitchen, Barbershop, Recovery Spa & Pool and Player Development Center. "
				.. "The glass elevator at the east end goes up to the Sky Terrace on the roof!",
		},
	}
	local accent = teamInk(ctx, SIGN_DARK, { "Trim", "Secondary" })
	for _, level in ipairs(floors) do
		for index, board in ipairs({
			-- west end: read facing -X, the back row is on the reader's left
			{ x = S.ix0 + 0.2, face = Enum.NormalId.Right, readerDir = 1, columns = { { "BACK", level.back }, { "FRONT", level.front } } },
			-- east end: read facing +X, the front row is on the reader's left
			{
				x = S.ix1 - 0.2,
				face = Enum.NormalId.Left,
				readerDir = -1,
				columns = { { "FRONT", reversed(level.front) }, { "BACK", reversed(level.back) } },
			},
		}) do
			local directory = BuildUtil.Box(
				inside,
				"HQDirectory",
				Vector3.new(0.4, level.h, 12.4),
				Vector3.new(board.x, level.y + level.h / 2, doorZ),
				SIGN_DARK,
				Enum.Material.SmoothPlastic,
				DECOR
			)
			directoryText(directory, board.face, level.header, {
				{ title = board.columns[1][1] .. " ROW", rooms = board.columns[1][2] },
				{ title = board.columns[2][1] .. " ROW", rooms = board.columns[2][2] },
			}, level.footers[index], accent)
			local floorY = level.y > up and up or FLOOR_TOP
			BuildUtil.Look(directory, "HQ Directory", level.info, {
				At = Vector3.new(board.readerDir * 1.5, floorY + 4.6 - (level.y + level.h / 2), -6),
				Distance = 8,
			})
		end
	end

	-- ceiling lights: two strips along each corridor (ground: on the slab soffit; upstairs: under
	-- the wing roofs) and panels with PointLights
	for _, z in ipairs({ cor.MinZ + 1.3, cor.MaxZ - 2.1 }) do
		span(inside, "CeilingLightStrip", S.ix0 + 1, sb - 0.3, z, S.ix1 - 1, sb, z + 0.8, LAMP, Enum.Material.Neon, PAINT)
		for _, seg in ipairs({ { S.ix0 + 1, atrium.MinX }, { atrium.MaxX, S.ix1 - 1 } }) do
			span(
				inside,
				"UpperCeilingLightStrip",
				seg[1],
				ROOF_BOTTOM - 0.3,
				z,
				seg[2],
				ROOF_BOTTOM,
				z + 0.8,
				LAMP,
				Enum.Material.Neon,
				PAINT
			)
		end
	end
	local panels = {
		{ -200, sb },
		{ -100, sb },
		{ 25, sb },
		{ -244, ROOF_BOTTOM },
		{ -45, ROOF_BOTTOM },
		{ 66, ROOF_BOTTOM },
	}
	for _, p in ipairs(panels) do
		local panel =
			span(inside, "CeilingLightPanel", p[1] - 4, p[2] - 0.3, doorZ - 2, p[1] + 4, p[2], doorZ + 2, LAMP, Enum.Material.Neon, PAINT)
		BuildUtil.Light(panel, "PointLight", { Name = "HQCeilingLight", Range = 44, Brightness = 1.2, Color = WARM_LIGHT, Shadows = false })
	end

	-- fire extinguishers on the ground corridor's end walls beside the doorways (no collision)
	for _, ext in ipairs({ { x = S.ix0 + 0.5, z = cor.MinZ + 1.5 }, { x = S.ix1 - 0.5, z = cor.MaxZ - 1.5 } }) do
		post(inside, "FireExtinguisher", ext.x, ext.z, 2.4, 4.8, 0.9, FIRE_RED, Enum.Material.SmoothPlastic, DECOR)
	end

	-- benches at the ground corridor's ends, against the room rows, away from every button
	for _, bench in ipairs({
		{ x = S.ix0 + 6.5, y = FLOOR_TOP, z = cor.MaxZ - 1.3, back = 1 },
		{ x = S.ix1 - 6.5, y = FLOOR_TOP, z = cor.MinZ + 1.3, back = -1 },
	}) do
		-- the seat faces away from the backrest; it doesn't collide (the corridor stays clear)
		BuildUtil.Seat(inside, {
			Name = "CorridorBench",
			Size = Vector3.new(8, 0.5, 2),
			CFrame = CFrame.new(bench.x, bench.y + 1.45, bench.z) * CFrame.Angles(0, bench.back > 0 and 0 or math.pi, 0),
			Color = WOOD,
			Material = Enum.Material.Wood,
			CanCollide = false,
			Object = "Bench",
		})
		BuildUtil.Box(
			inside,
			"CorridorBenchBase",
			Vector3.new(7, 1.2, 1.2),
			Vector3.new(bench.x, bench.y + 0.6, bench.z),
			STEEL,
			Enum.Material.Metal,
			DECOR
		)
	end
end

---------------------------------------------------------------------------------------------
-- West stair tower: switchback stairs + an elevator between the two floors
---------------------------------------------------------------------------------------------

local function buildWestCore(ctx, S, team)
	local core = BuildUtil.Child(ctx, "WestStairTower")
	local cor = S.L.HQCorridor
	local up = S.up
	local doorZ = (cor.MinZ + cor.MaxZ) / 2
	local K = CORE
	local ix0 = K.MinX + 1 -- inside face of the west wall
	local top = K.Top
	local accent = teamInk(ctx, SIGN_DARK, { "Trim", "Secondary" })

	-- floor, stone end walls, a glass west face (the stairs show from outside), roof
	-- (0.05 inside the tower walls' outer faces)
	span(core, "CoreFloor", K.MinX + 0.05, 0, K.MinZ + 0.05, S.x0 + 0.1, FLOOR_TOP, K.MaxZ - 0.05, CORRIDOR_FLOOR, Enum.Material.Marble)
	span(core, "CoreWall", K.MinX, 0, K.MinZ, K.MaxX, top, K.MinZ + 1, LIMESTONE, Enum.Material.Limestone)
	span(core, "CoreWall", K.MinX, 0, K.MaxZ - 1, K.MaxX, top, K.MaxZ, LIMESTONE, Enum.Material.Limestone)
	-- the elevator shaft behind the south part of the west face is solid stone
	local liftZ = 262 -- the elevator wall's north face (the lobby starts here)
	local pier = span(core, "CoreWall", K.MinX, 0, K.MinZ + 1, ix0, top, liftZ, LIMESTONE, Enum.Material.Limestone)
	span(core, "CoreElevatorWall", ix0, FLOOR_TOP, liftZ - 1, K.MaxX, top, liftZ, LIMESTONE, Enum.Material.Limestone)
	local d0, d1 = doorZ - DOOR_HALF, doorZ + DOOR_HALF
	local gx0, gx1 = K.MinX + 0.3, K.MinX + 0.8
	span(core, "CoreGlass", gx0, FLOOR_TOP, liftZ, gx1, top, d0, CURTAIN_GLASS, Enum.Material.Glass, CURTAIN_PROPS)
	span(core, "CoreGlass", gx0, FLOOR_TOP, d1, gx1, top, K.MaxZ - 1, CURTAIN_GLASS, Enum.Material.Glass, CURTAIN_PROPS)
	span(core, "CoreGlass", gx0, DOOR_TOP + 0.4, d0, gx1, top, d1, CURTAIN_GLASS, Enum.Material.Glass, CURTAIN_PROPS)
	span(core, "CoreFloorBand", K.MinX, up - 1, liftZ, ix0, up + 0.6, K.MaxZ - 1, LIMESTONE, Enum.Material.Limestone)
	-- above the HQ's parapet the tower closes on its east side too
	span(core, "CoreWall", K.MaxX - 0.6, ROOF_TOP, K.MinZ + 1, K.MaxX, top, K.MaxZ - 1, LIMESTONE, Enum.Material.Limestone)
	span(
		core,
		"CoreRoof",
		K.MinX,
		CORE_ROOF_BOTTOM,
		K.MinZ - 0.6,
		K.MaxX,
		CORE_ROOF_BOTTOM + 1.4,
		K.MaxZ + 0.6,
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	-- a lit "TEAM HQ" panel at the top of the stone pier, facing west
	local pierGui = Instance.new("SurfaceGui")
	pierGui.Name = "PierSignGui"
	pierGui.Face = Enum.NormalId.Left
	pierGui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	pierGui.PixelsPerStud = 20
	pierGui.LightInfluence = 0
	pierGui.Parent = pier
	local pierW = (liftZ - K.MinZ - 1) * 20
	local signFrame = guiRect(pierGui, "Sign", team.Primary, 0.6 * 20, 1.2 * 20, pierW - 1.2 * 20, 5 * 20)
	local signInner = guiRect(signFrame, "Panel", SIGN_DARK, 4, 4, pierW - 1.2 * 20 - 8, 5 * 20 - 8)
	local signText = Instance.new("TextLabel")
	signText.Name = "Text"
	signText.BackgroundTransparency = 1
	signText.Position = UDim2.new(0.06, 0, 0.12, 0)
	signText.Size = UDim2.new(0.88, 0, 0.76, 0)
	signText.Font = Enum.Font.GothamBlack
	signText.Text = "TEAM HQ"
	signText.TextColor3 = accent
	signText.TextScaled = true
	signText.Parent = signInner

	-- the exterior doors on the west face (toward the cart road)
	local doorHeight = DOOR_TOP + 0.4 - FLOOR_TOP
	local doorCentre = Vector3.new((gx0 + gx1) / 2, FLOOR_TOP + doorHeight / 2, doorZ)
	BuildUtil.Door(core, {
		Name = "WestDoors",
		Size = Vector3.new(d1 - d0, doorHeight, 0.4),
		CFrame = CFrame.lookAt(doorCentre, doorCentre + Vector3.new(1, 0, 0)),
		Double = true,
		Slide = true,
		Color = DOOR_GLASS,
		Material = Enum.Material.Glass,
		Transparency = 0.45,
		Object = "Glass Doors",
		Title = "West Doors",
		Info = "The way out to the west side of your campus and the cart road. The stairs and the elevator here go up to the upper floor.",
		Distance = 8,
	})
	local exitSign = span(
		core,
		"ExitSign",
		ix0,
		DOOR_TOP + 0.6,
		doorZ - 2,
		ix0 + 0.2,
		DOOR_TOP + 1.8,
		doorZ + 2,
		SIGN_DARK,
		Enum.Material.SmoothPlastic,
		DECOR
	)
	panelText(exitSign, { Enum.NormalId.Right }, { { Text = "EXIT", Color = EXIT_GREEN } }, { LightInfluence = 0, InsetY = 0.14 })

	-- the upper landing (over the ground lobby) and the switchback stairs north of it
	local Z0, run, steps = 280.6, 1.6, 9
	local mid = (FLOOR_TOP + up) / 2
	local rise = (mid - FLOOR_TOP) / steps
	local splitX = (ix0 + K.MaxX) / 2
	span(core, "CoreUpperLanding", ix0, up - 1, liftZ, K.MaxX, up, Z0, SLAB_COLOR, Enum.Material.Concrete)
	local zMid = Z0 + steps * run
	for k = 1, steps do
		-- flight 1 (west half) climbs north to the half landing, flight 2 (east half) climbs back
		span(
			core,
			"StairStep",
			ix0,
			FLOOR_TOP,
			Z0 + (k - 1) * run,
			splitX - 0.1,
			FLOOR_TOP + k * rise,
			Z0 + k * run,
			LIMESTONE,
			Enum.Material.Limestone
		)
		span(
			core,
			"StairStep",
			splitX + 0.1,
			FLOOR_TOP,
			zMid - k * run,
			K.MaxX,
			mid + k * rise,
			zMid - (k - 1) * run,
			LIMESTONE,
			Enum.Material.Limestone
		)
	end
	span(core, "StairHalfLanding", ix0, FLOOR_TOP, zMid, K.MaxX, mid, K.MaxZ - 1, LIMESTONE, Enum.Material.Limestone)
	span(core, "StairPartition", splitX - 0.1, FLOOR_TOP, Z0, splitX + 0.1, up + 3.4, zMid, team.Primary, Enum.Material.SmoothPlastic)
	span(core, "LandingRailingGlass", ix0, up, Z0 - 0.4, splitX - 0.1, up + 3.4, Z0, DOOR_GLASS, Enum.Material.Glass, RAIL_PROPS)
	local stairSign = span(
		core,
		"CoreStairSign",
		ix0 + 0.4,
		up - 3.4,
		Z0 - 0.4,
		splitX - 0.5,
		up - 1,
		Z0 - 0.2,
		team.Primary,
		Enum.Material.SmoothPlastic,
		DECOR
	)
	panelText(stairSign, { Enum.NormalId.Front }, {
		{ Text = "STAIRS", Color = teamInk(ctx, "Primary", { "Trim", "Secondary" }) },
		{ Text = "UPPER FLOOR", Weight = 0.7, Color = teamInk(ctx, "Primary", { "Trim", "Secondary" }) },
	}, { InsetX = 0.08, InsetY = 0.1, LightInfluence = 0.4 })

	-- the elevator (doors on the lobby side of the shaft wall, both floors)
	local ex = (ix0 + K.MaxX) / 2
	local upTarget = CFrame.lookAt(Vector3.new(ex, up, doorZ - 3), Vector3.new(S.x0 + 20, up, doorZ - 3))
	local downTarget = CFrame.lookAt(Vector3.new(ex, FLOOR_TOP, doorZ - 3), Vector3.new(S.x0 + 20, FLOOR_TOP, doorZ - 3))
	for _, landing in ipairs({
		{
			y = FLOOR_TOP,
			name = "Ground",
			sign = "UPPER FLOOR",
			button = "UP",
			target = upTarget,
			action = "Ride up",
			label = "UPPER FLOOR",
		},
		{
			y = up,
			name = "Upper",
			sign = "GROUND FLOOR",
			button = "DOWN",
			target = downTarget,
			action = "Ride down",
			label = "GROUND FLOOR",
		},
	}) do
		local y0 = landing.y
		elevatorDoors(core, landing.name .. "ElevatorDoors", ex - 3, ex + 3, y0, liftZ, liftZ + 0.2, 8.4, 1.6, landing.sign, accent)
		local call = span(
			core,
			landing.name .. "ElevatorCallPanel",
			ex + 4,
			y0 + 3.6,
			liftZ,
			ex + 5.2,
			y0 + 5.6,
			liftZ + 0.2,
			SIGN_DARK,
			Enum.Material.SmoothPlastic
		)
		panelText(
			call,
			{ Enum.NormalId.Back },
			{ { Text = landing.button, Color = BUTTON_GLOW } },
			{ InsetX = 0.12, InsetY = 0.3, LightInfluence = 0 }
		)
		BuildUtil.Elevator(ctx, call, landing.target, { Action = landing.action, Object = "Elevator", Label = landing.label, Distance = 7 })
	end

	-- lights: the ground lobby (under the landing) and the stairwell (under the roof)
	local lobbyLamp = span(core, "CoreLobbyLight", ex - 3, up - 1.3, doorZ - 2, ex + 3, up - 1, doorZ + 2, LAMP, Enum.Material.Neon, PAINT)
	BuildUtil.Light(lobbyLamp, "PointLight", { Name = "CoreLight", Range = 26, Brightness = 1.4, Color = WARM_LIGHT, Shadows = false })
	local stairLamp =
		span(core, "CoreCeilingLight", ex - 3, CORE_ROOF_BOTTOM - 0.3, 278, ex + 3, CORE_ROOF_BOTTOM, 290, LAMP, Enum.Material.Neon, PAINT)
	BuildUtil.Light(stairLamp, "PointLight", { Name = "CoreLight", Range = 40, Brightness = 1.4, Color = WARM_LIGHT, Shadows = false })
end

---------------------------------------------------------------------------------------------
-- East glass elevator tower: ground (open to the Hall of Fame side), upper floor, Sky Terrace
---------------------------------------------------------------------------------------------

local function buildEastTower(ctx, S, team)
	local C = ctx.config.Colors
	local tower = BuildUtil.Child(ctx, "ElevatorTower")
	local cor = S.L.HQCorridor
	local up = S.up
	local doorZ = (cor.MinZ + cor.MaxZ) / 2
	local T, sh = TOWER, TOWER_SHAFT
	local top = T.Top
	local accent = teamInk(ctx, "Primary", { "Trim", "Secondary" })
	local dark = teamInk(ctx, SIGN_DARK, { "Trim", "Secondary" })
	local glassProps = { Transparency = 0.55, Reflectance = 0.15, CastShadow = false }
	local function glass(name, x0, y0, z0, x1, y1, z1)
		return span(tower, name, x0, y0, z0, x1, y1, z1, C.Glass, Enum.Material.Glass, glassProps)
	end
	local levels = { FLOOR_TOP, up, DECK_TOP }

	-- floors, roof and four team-colour corner columns
	-- (0.05 inside the corner columns' outer faces)
	span(tower, "TowerFloor", S.x1 - 0.1, 0, T.MinZ + 0.05, T.MaxX - 0.05, FLOOR_TOP, T.MaxZ - 0.05, CORRIDOR_FLOOR, Enum.Material.Marble)
	-- (the upper floors end inside the glass walls, so no faces line up)
	span(tower, "TowerUpperFloor", T.MinX, up - 1, sh.FaceZ + 0.6, T.MaxX - 0.8, up, T.MaxZ - 0.4, SLAB_COLOR, Enum.Material.Concrete)
	span(
		tower,
		"TowerTerraceFloor",
		T.MinX,
		DECK_TOP - 1,
		sh.FaceZ + 0.6,
		T.MaxX - 0.8,
		DECK_TOP,
		T.MaxZ - 0.4,
		CORRIDOR_FLOOR,
		Enum.Material.Marble
	)
	span(tower, "TowerRoof", T.MinX - 0.4, top, T.MinZ - 0.4, T.MaxX, top + 1, T.MaxZ + 0.4, team.Primary, Enum.Material.SmoothPlastic)
	for _, x in ipairs({ T.MinX, T.MaxX - 1 }) do
		for _, z in ipairs({ T.MinZ, T.MaxZ - 1 }) do
			span(tower, "TowerColumn", x, 0, z, x + 1, top, z + 1, team.Primary, Enum.Material.SmoothPlastic)
		end
	end

	-- glass walls: south (behind the shaft) + north full height; east with the ground portal toward
	-- the Hall of Fame; west only on the top floor (below it is the HQ's east wall)
	local ex0, ex1 = T.MaxX - 1, T.MaxX - 0.6
	local portal = { doorZ - 5, doorZ + 5 }
	local deckDoor = { doorZ - DOOR_HALF, doorZ + DOOR_HALF }
	glass("TowerGlassSouth", T.MinX + 1, FLOOR_TOP, T.MinZ + 0.2, T.MaxX - 1, top, T.MinZ + 0.6)
	-- (the campus skybridges arrive on the upper floor through the east face (over the ground portal)
	-- and the north face (X[103.4, 114.6]); those openings are 8.6 tall)
	local bridgeTop = up + 8.6
	local northGap = { 103.4, 114.6 }
	glass("TowerGlassNorth", T.MinX + 1, FLOOR_TOP, T.MaxZ - 0.6, T.MaxX - 1, up, T.MaxZ - 0.2)
	glass("TowerGlassNorth", T.MinX + 1, bridgeTop, T.MaxZ - 0.6, T.MaxX - 1, top, T.MaxZ - 0.2)
	glass("TowerGlassNorth", T.MinX + 1, up, T.MaxZ - 0.6, northGap[1], bridgeTop, T.MaxZ - 0.2)
	glass("TowerGlassNorth", northGap[2], up, T.MaxZ - 0.6, T.MaxX - 1, bridgeTop, T.MaxZ - 0.2)
	glass("TowerGlassEast", ex0, FLOOR_TOP, T.MinZ + 1, ex1, top, portal[1])
	glass("TowerGlassEast", ex0, FLOOR_TOP, portal[2], ex1, top, T.MaxZ - 1)
	glass("TowerGlassEast", ex0, 11.6, portal[1], ex1, up, portal[2])
	glass("TowerGlassEast", ex0, bridgeTop, portal[1], ex1, top, portal[2])
	glass("TowerTopGlassWest", T.MinX + 0.2, DECK_TOP, T.MinZ + 1, T.MinX + 0.6, top, deckDoor[1])
	glass("TowerTopGlassWest", T.MinX + 0.2, DECK_TOP, deckDoor[2], T.MinX + 0.6, top, T.MaxZ - 1)
	span(
		tower,
		"TowerTopDoorHead",
		T.MinX + 0.1,
		DECK_TOP + 8.8,
		deckDoor[1],
		T.MinX + 0.7,
		top,
		deckDoor[2],
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	local portalHead =
		span(tower, "TowerPortalHeader", ex0 - 0.2, 10, portal[1], T.MaxX, 11.6, portal[2], team.Primary, Enum.Material.SmoothPlastic)
	panelText(portalHead, { Enum.NormalId.Right }, { { Text = "SKY TERRACE ELEVATOR", Color = accent } }, { InsetX = 0.06, InsetY = 0.2 })
	-- X bracing on the east face and the crown sign on the roof
	for _, s in ipairs({ -1, 1 }) do
		strut(
			tower,
			"TowerBrace",
			Vector3.new(T.MaxX - 0.3, bridgeTop + 0.4, doorZ - s * 11.5),
			Vector3.new(T.MaxX - 0.3, up + 15.5, doorZ + s * 11.5),
			0.5,
			STEEL,
			Enum.Material.Metal
		)
	end
	local crown = span(
		tower,
		"TowerRoofSign",
		(T.MinX + T.MaxX) / 2 - 0.5,
		top + 1,
		doorZ - 9,
		(T.MinX + T.MaxX) / 2 + 0.5,
		top + 4.6,
		doorZ + 9,
		SIGN_DARK,
		Enum.Material.SmoothPlastic
	)
	panelText(crown, { Enum.NormalId.Left, Enum.NormalId.Right }, { { Text = "SKY TERRACE", Color = dark } }, {
		BorderStuds = 0.2,
		BorderColor3 = team.Primary,
		InsetX = 0.06,
		InsetY = 0.16,
		LightInfluence = 0,
	})

	-- the glass elevator shaft (cab parked at the bottom) with static doors at every landing
	local shaftGlass = { Transparency = 0.45, Reflectance = 0.1, CastShadow = false }
	for _, x in ipairs({ sh.MinX, sh.MaxX - 0.4 }) do
		span(tower, "ShaftGlass", x, FLOOR_TOP, sh.MinZ, x + 0.4, top, sh.FaceZ, C.Glass, Enum.Material.Glass, shaftGlass)
	end
	local doorX0, doorX1 = (sh.MinX + sh.MaxX) / 2 - 3, (sh.MinX + sh.MaxX) / 2 + 3
	span(tower, "ShaftGlass", doorX0, FLOOR_TOP, sh.FaceZ + 0.1, doorX1, top, sh.FaceZ + 0.4, C.Glass, Enum.Material.Glass, shaftGlass)
	for _, p in ipairs({ { sh.MinX, doorX0 }, { doorX1, sh.MaxX } }) do
		span(tower, "ShaftPillar", p[1], FLOOR_TOP, sh.FaceZ, p[2], top, sh.FaceZ + 0.6, team.Primary, Enum.Material.Metal)
	end
	span(
		tower,
		"ElevatorCab",
		sh.MinX + 0.6,
		FLOOR_TOP + 0.2,
		sh.MinZ + 0.6,
		sh.MaxX - 0.6,
		FLOOR_TOP + 9.4,
		sh.FaceZ - 0.2,
		team.Secondary,
		Enum.Material.Metal,
		DECOR
	)

	-- each landing: doors + a header sign, and two call panels (one per other stop)
	local names = { "GROUND FLOOR", "UPPER FLOOR", "SKY TERRACE" }
	local function target(level)
		return CFrame.lookAt(Vector3.new(109, levels[level], doorZ), Vector3.new(90, levels[level], doorZ))
	end
	for level, y0 in ipairs(levels) do
		elevatorDoors(tower, "ElevatorDoors", doorX0, doorX1, y0, sh.FaceZ + 0.4, sh.FaceZ + 0.6, 8.4, 1.6, names[level], dark)
		local others = {}
		for other = 1, #levels do
			if other ~= level then
				table.insert(others, other)
			end
		end
		for i, other in ipairs(others) do
			local px = i == 1 and sh.MinX + 2 or sh.MaxX - 3.4
			local call = span(
				tower,
				"ElevatorCallPanel",
				px,
				y0 + 3.6,
				sh.FaceZ + 0.6,
				px + 1.4,
				y0 + 5.6,
				sh.FaceZ + 0.8,
				SIGN_DARK,
				Enum.Material.SmoothPlastic
			)
			local goingUp = other > level
			panelText(call, { Enum.NormalId.Back }, {
				{ Text = goingUp and "UP" or "DOWN", Color = BUTTON_GLOW },
				{ Text = names[other], Weight = 0.6, Color = WHITE },
			}, { InsetX = 0.08, InsetY = 0.12, LightInfluence = 0 })
			BuildUtil.Elevator(ctx, call, target(other), {
				Action = (goingUp and "Ride up to " or "Ride down to ")
					.. (other == 1 and "the ground floor" or other == 2 and "the upper floor" or "the Sky Terrace"),
				Object = "Glass Elevator",
				Label = names[other],
				Distance = 7,
			})
		end
	end

	-- lights on every level
	for _, ceiling in ipairs({ up - 1, DECK_TOP - 1, top }) do
		local lamp =
			span(tower, "TowerCeilingLight", 105, ceiling - 0.3, doorZ - 3, 113, ceiling, doorZ + 3, LAMP, Enum.Material.Neon, PAINT)
		BuildUtil.Light(lamp, "PointLight", { Name = "TowerLight", Range = 22, Brightness = 1.4, Color = WARM_LIGHT, Shadows = false })
	end

	-- the top floor's sliding glass doors onto the Sky Terrace
	local deckDoorH = 8.8
	local deckDoorCentre = Vector3.new(T.MinX + 0.4, DECK_TOP + deckDoorH / 2, doorZ)
	BuildUtil.Door(tower, {
		Name = "SkyTerraceDoors",
		Size = Vector3.new(deckDoor[2] - deckDoor[1], deckDoorH, 0.3),
		CFrame = CFrame.lookAt(deckDoorCentre, deckDoorCentre + Vector3.new(1, 0, 0)),
		Double = true,
		Slide = true,
		Color = DOOR_GLASS,
		Material = Enum.Material.Glass,
		Transparency = 0.45,
		Object = "Sky Terrace Doors",
		Title = "Sky Terrace",
		Info = "The green roof terrace: a lawn, trees, benches, telescopes and the best view on the whole campus.",
		Distance = 8,
	})
end

---------------------------------------------------------------------------------------------
-- The Sky Terrace: a green roof on the east wing
---------------------------------------------------------------------------------------------

local function buildTerrace(ctx, S, team)
	local C = ctx.config.Colors
	local deck = BuildUtil.Child(ctx, "SkyTerrace")
	local D = TERRACE
	local T = TOWER
	local cor = S.L.HQCorridor
	local doorZ = (cor.MinZ + cor.MaxZ) / 2
	local y = ROOF_TOP
	local dy = DECK_TOP

	-- lawn, a boardwalk down the middle and a deck in front of the tower doors
	span(deck, "RoofTerraceLawn", D.MinX, y, D.MinZ, D.MaxX, y + 0.08, D.MaxZ, LAWN, Enum.Material.Grass)
	span(deck, "RoofTerraceBoardwalk", 78, y, D.MinZ + 3, 88, dy, D.MaxZ - 3, DECK_WOOD, Enum.Material.WoodPlanks)
	span(deck, "RoofTerraceDeck", 88, y, doorZ - 9, T.MinX, dy, doorZ + 9, DECK_WOOD, Enum.Material.WoodPlanks)

	-- glass railings on the parapets around it, and a glass screen toward the rest of the roof
	local railTop = PARAPET_TOP + 3
	local function rail(x0, y0, z0, x1, z1)
		span(deck, "RoofRailingGlass", x0, y0, z0, x1, railTop, z1, C.Glass, Enum.Material.Glass, RAIL_PROPS)
	end
	rail(D.MinX, PARAPET_TOP, SLAB_FRONT - 0.3, S.x1, SLAB_FRONT + 0.3)
	rail(D.MinX, PARAPET_TOP, ROOF_BACK - 0.5, S.x1, ROOF_BACK + 0.1)
	rail(S.x1 - 1.1, PARAPET_TOP, SLAB_FRONT + 0.3, S.x1 - 0.5, T.MinZ)
	rail(S.x1 - 1.1, PARAPET_TOP, T.MaxZ, S.x1 - 0.5, ROOF_BACK - 0.5)
	rail(D.MinX - 0.4, y, SLAB_FRONT + 0.3, D.MinX, ROOF_BACK - 0.5)

	-- planters with trees
	for _, p in ipairs({ { 53, 202 }, { 53, 355 }, { 66, 300 } }) do
		local px, pz = p[1], p[2]
		span(deck, "RoofPlanter", px - 2.4, y, pz - 2.4, px + 2.4, y + 2, pz + 2.4, PLANTER_GREY, Enum.Material.Concrete)
		post(deck, "RoofTreeTrunk", px, pz, y + 2, y + 7, 0.6, TRUNK, Enum.Material.Wood)
		BuildUtil.Ball(deck, {
			Name = "RoofTreeCrown",
			Position = Vector3.new(px, y + 8.4, pz),
			Diameter = 5.4,
			Color = LEAVES,
			Material = Enum.Material.Grass,
		})
	end

	-- benches: two face the stadium (south), one the practice fields (north); TV camera seats
	local function bench(x, z, facing, object, camera)
		local base = CFrame.new(x, y, z) * CFrame.Angles(0, facing < 0 and 0 or math.pi, 0)
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
	-- (the stadium is at campus z -215 .. 135: its field centre is at campus (0, 0, -90))
	local blimpCam = { From = Vector3.new(60, 170, 190), To = Vector3.new(0, 10, -90), Fov = 55, Label = "BLIMP CAM" }
	local campusCam = { From = Vector3.new(96, 75, 345), To = Vector3.new(-25, 0, 465), Fov = 60, Label = "CAMPUS CAM" }
	bench(64, D.MinZ + 7, -1, "Stadium View Bench", blimpCam)
	bench(72, D.MinZ + 7, -1, "Bench")
	bench(64, D.MaxZ - 7, 1, "Campus View Bench", campusCam)

	-- a cafe table with two chairs on the boardwalk
	local tableX, tableZ = 83, 236
	post(deck, "RoofCafeTableLeg", tableX, tableZ, dy, dy + 2.8, 0.4, STEEL, Enum.Material.Metal)
	post(deck, "RoofCafeTable", tableX, tableZ, dy + 2.8, dy + 3, 3.2, WHITE, Enum.Material.SmoothPlastic)
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
			Size = Vector3.new(1.8, 3.6, 0.3),
			CFrame = facing * CFrame.new(0, 2.1, 0.75),
			Color = team.Primary,
			Material = Enum.Material.SmoothPlastic,
		})
	end

	-- telescopes on posts: one aimed at the stadium, one at the practice field (with a stool that
	-- shows the zoomed-in view)
	local function telescope(x, z, aim, title, info)
		local standTop = y + 3.2
		post(deck, "RoofTelescopeStand", x, z, y, standTop, 0.45, STEEL, Enum.Material.Metal)
		local pivot = Vector3.new(x, standTop + 0.35, z)
		local dir = (aim - pivot).Unit
		local centre = pivot + dir * 0.6
		local tube = rodBetween(deck, "RoofTelescope", centre - dir * 1.7, centre + dir * 1.7, 0.75, WHITE, Enum.Material.SmoothPlastic)
		local eye = centre - dir * 2
		BuildUtil.Look(tube, title, info, { Distance = 7 })
		return dir, eye
	end
	telescope(
		92,
		D.MinZ + 4,
		Vector3.new(0, 40, -90),
		"Stadium Telescope",
		"Zoom in on your stadium! Spot the light towers, the video boards, the roof canopy and the top rows of the upper deck."
	)
	local fieldTarget = Vector3.new(-130, 0, 456)
	local northZ = D.MaxZ - 5
	local fieldDir, eye = telescope(
		80,
		northZ,
		fieldTarget,
		"Practice Field Telescope",
		"You can see the practice field from here! Spot the blocking sleds, the tackling dummies and the coach tower on the far sideline."
	)
	local flat = Vector3.new(fieldDir.X, 0, fieldDir.Z).Unit
	local stool = Vector3.new(80, 0, northZ) - flat * 2.4
	post(deck, "RoofStoolPost", stool.X, stool.Z, y, y + 1.5, 0.35, STEEL, Enum.Material.Metal)
	BuildUtil.Seat(deck, {
		Name = "RoofTelescopeStool",
		Size = Vector3.new(1.6, 0.4, 1.6),
		CFrame = CFrame.lookAt(Vector3.new(stool.X, y + 1.7, stool.Z), Vector3.new(stool.X + flat.X, y + 1.7, stool.Z + flat.Z)),
		Color = team.Primary,
		Object = "Telescope Stool",
		-- (the zoomed-in view starts along the tube's line just past the roof edge, so the parapet and
		-- the railing stay out of it)
		Camera = { From = eye + fieldDir * 16 + Vector3.new(0, 1, 0), To = fieldTarget, Fov = 16, Label = "TELESCOPE CAM" },
	})

	-- lamp posts along the boardwalk (string-light bulbs on top)
	for _, p in ipairs({ { 77, 214 }, { 77, 330 } }) do
		post(deck, "RoofLampPost", p[1], p[2], y, y + 8, 0.35, STEEL, Enum.Material.Metal)
		local bulb = BuildUtil.Ball(deck, {
			Name = "RoofLampGlobe",
			Position = Vector3.new(p[1], y + 8.4, p[2]),
			Diameter = 1.2,
			Color = BULB,
			Material = Enum.Material.Neon,
			CanCollide = false,
		})
		BuildUtil.Light(bulb, "PointLight", { Name = "TerraceLight", Range = 28, Brightness = 1.3, Color = BULB, Shadows = false })
	end
end

---------------------------------------------------------------------------------------------
-- Outside: planters + trees, team flags, the monument sign
---------------------------------------------------------------------------------------------

local function buildGrounds(ctx, S, team)
	local L = S.L
	local C = ctx.config.Colors
	local grounds = BuildUtil.Child(ctx, "Grounds")
	local walk = L.HQEntranceWalk

	-- planters with trees in front of both wings (between the colonnade and the campus road)
	-- (between the colonnade blades, clear of the bus stop's arrival spot at x = -150)
	for _, p in ipairs({ { -227.1, 191 }, { -182.1, 191 }, { 32.5, 191 }, { 62.5, 191 } }) do
		local px, pz = p[1], p[2]
		local planter = span(grounds, "Planter", px - 9, 0, pz - 1.8, px + 9, 1.8, pz + 1.8, STONE, Enum.Material.Concrete)
		BuildUtil.SurfaceText(planter, Enum.NormalId.Top, "", { LabelName = "Hedge", BackgroundColor3 = LAWN, BackgroundTransparency = 0 })
		post(grounds, "PlanterTreeTrunk", px, pz, 1.8, 8.5, 0.9, TRUNK, Enum.Material.Wood)
		BuildUtil.Ball(grounds, {
			Name = "PlanterTreeCrown",
			Position = Vector3.new(px, 10.6, pz),
			Diameter = 5.6,
			Color = LEAVES,
			Material = Enum.Material.Grass,
		})
	end

	-- three team flags in front of the west wing, flying away from the entrance
	local flagColors = { team.Primary, team.Trim, team.Secondary }
	for i = 1, 3 do
		local x = -160 - (i - 1) * 9
		local h = (i == 2) and 28 or 26
		post(grounds, "FlagPole", x, 189, 0, h, 0.5, C.Metal, Enum.Material.Metal)
		span(grounds, "Flag", x - 8.5, h - 6, 188.92, x - 0.25, h - 0.6, 189.08, flagColors[i], Enum.Material.Fabric, DECOR)
	end

	-- the monument sign beside the walk, readable from the campus road: the team's name (live)
	-- over HEADQUARTERS, the owner (live) on its granite base
	local mx, mz = walk.MaxX + 40, 189.8
	local monumentBase = span(grounds, "MonumentBase", mx - 7.5, 0, mz - 1.6, mx + 7.5, 1.1, mz + 1.6, GRANITE, Enum.Material.Granite)
	local _, ownerLabel = BuildUtil.LiveText(monumentBase, Enum.NormalId.Front, "owner", {
		LabelName = "MonumentOwner",
		Text = "OWNER: -",
		TextColor3 = C.Gold,
		BackgroundColor3 = GRANITE,
		BackgroundTransparency = 0,
		Font = Enum.Font.GothamBold,
		PixelsPerStud = 30,
		LightInfluence = 0,
	})
	ownerLabel.Size = UDim2.new(0.8, 0, 0.7, 0)
	ownerLabel.Position = UDim2.new(0.1, 0, 0.15, 0)
	local monument = span(grounds, "Monument", mx - 6.5, 1.1, mz - 0.7, mx + 6.5, 5.6, mz + 0.7, SIGN_DARK, Enum.Material.SmoothPlastic)
	local monumentText = teamInk(ctx, SIGN_DARK, { "Trim", "Secondary" })
	S.refs.MonumentLabel = liveSign(monument, Enum.NormalId.Front, "team", "TEAM", "HEADQUARTERS", {
		LabelName = "MonumentTeamName",
		TextColor3 = monumentText,
		SubColor3 = WHITE,
		LiveWeight = 0.58,
		BorderStuds = 0.25,
		BorderColor3 = team.Primary,
		InsetX = 0.06,
		InsetY = 0.1,
	})
	panelText(monument, { Enum.NormalId.Back }, { { Text = "WELCOME HOME", Color = monumentText } }, { InsetY = 0.3 })
	BuildUtil.Look(
		monument,
		"Team Headquarters",
		"Home of your franchise! Build every room inside, on both floors, step by step - the more you build, the more cash your team earns.",
		{ LookKey = "owner", Distance = 9 }
	)
	span(grounds, "MonumentCap", mx - 7, 5.6, mz - 1, mx + 7, 6.2, mz + 1, team.Primary, Enum.Material.SmoothPlastic)
end

---------------------------------------------------------------------------------------------
-- Entry point
---------------------------------------------------------------------------------------------

-- Builds the whole empty HQ. Returns references the game may use later:
--   FacadeSignLabel (the live team name on the prow), WelcomeLabel (the banner's first line),
--   MonumentLabel (the live team name on the entrance monument)
function HQShell.Build(ctx)
	local L = ctx.config.Layout
	local team = ctx.colors
	local hq = L.HQ
	local S = {
		L = L,
		up = hq.UpperFloorY,
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
	-- the two wings beside the atrium, with the X of their colonnade blades
	S.wings = {
		{ x0 = hq.MinX, x1 = L.HQAtrium.MinX, blades = {} },
		{ x0 = L.HQAtrium.MaxX, x1 = hq.MaxX, blades = {} },
	}
	-- (the end blades stay 0.05 inside the slab ends so their faces never share a plane)
	for x = hq.MinX + 0.45, L.HQAtrium.MinX - 8, BLADE_STEP do
		table.insert(S.wings[1].blades, x)
	end
	for x = L.HQAtrium.MaxX + BLADE_STEP, hq.MaxX - 8, BLADE_STEP do
		table.insert(S.wings[2].blades, x)
	end
	table.insert(S.wings[2].blades, hq.MaxX - 0.45)

	local shell, shellModel = BuildUtil.Child(ctx, "HQShell")
	buildFloors(shell, S, team)
	buildFacades(shell, S, team)
	buildAtrium(shell, S, team)
	buildRoofs(shell, S)
	buildInterior(shell, S, team)
	buildWestCore(shell, S, team)
	buildEastTower(shell, S, team)
	buildTerrace(shell, S, team)
	buildGrounds(shell, S, team)
	tagTeamColors(shellModel, team)
	return S.refs
end

return HQShell
