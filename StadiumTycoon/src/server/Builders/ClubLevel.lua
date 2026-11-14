--[[
	ClubLevel
	Everything in the CLUB RING of the V5 bowl (docs/V5-LAYOUT.md): offsets 80..108 all the way
	round, floor y 54, ceiling y 66. The club seats (UpperDeck.lua, offsets 56..80, top row y 54) are
	in front of it, the upper deck (undersides >= 66) is above it, and the escalators (Exterior.lua)
	arrive at its outer edge (offset 108) on the four gate axes.

	SEGMENT SPACE (like UpperDeck.lua / Concourse.lua): everything is built per bowl segment
	(Bowl.Segments) in a frame on the turf outline (offset 0) in the middle of the segment: x runs
	along the segment, y is up and o = offset (outward from the turf edge); a point is
	seg.base * CFrame.new(x, y, -o). The Back face (+Z) of an unrotated part looks at the field, its
	Front face (-Z) away from it. Corner pieces sit SINK (0.04) inside their horizontal faces so the
	small overlaps at the joints never z-fight.

	Plan of a straight side (segment x, both halves mirrored; offsets 80..96 = the "room row",
	96..104 = the walking lane the harness checks, 104..108 = the outer strip):
	  |x| 0..22.7      press box (home) / broadcast booth (visitor)
	      22.7..29.3   passage from the club aisle at +-26 to the lane
	      29.3..44     coaches' booths (home, pressbox step 3) / suites block A starts (visitor)
	      44..74       suites block A (home: one big suite per half)
	      74..82       passage (club aisle +-78, where UpperDeck hangs its stairs sign)
	      82..126      suites block B (two suites)
	      126..134     passage (club aisle +-130)
	      134..        side lounge (club_lounge) up to the corner
	The ends + corners are open club lounges: buffet in front of the lane, seating along the front,
	bars against the outer wall (offset 104.15..107.2, clear of the lane), screens on the walls.

	  club_lounge      1 Lounge Floor & Bars   the ring floor slab (all 8 segments, top y 54) with a
	                                           non-collidable skirt at offset 84 (down to the main
	                                           concourse: nobody gets shut in on its roof) and an
	                                           outer girder, the outer wall (offset 107.2..108) with
	                                           16-wide escalator openings + lit GATE signs (look) on the
	                                           gate axes, lounge carpets, ceilings + light strips over
	                                           the ends, corners and side lounges, a dark wood wainscot
	                                           along the outer wall, a team-colour carpet stripe along
	                                           the lane's inner edge, 8 bars (soda / sports drink /
	                                           smoothie: the name on the counter, sodas + juices on a
	                                           glass shelf on the back bar, a tap tower, cooler or
	                                           blender on the counter)
	                   2 Buffet                buffet islands in both end lounges (tray + hot dogs) with
	                                           heat lamp posts + plate stacks, popcorn carts, food
	                                           stations in the corners
	                   3 Lounge Seating        drink rails with stools along the front (one CLUB LOUNGE
	                                           CAM stool per end + corner), sofas, armchairs, coffee
	                                           tables, rugs, standing high-top tables, painted CLUB
	                                           floor logos, potted plants by the end escalators
	                   4 Club Screens          live screens over the bars and above the buffets, CLUB
	                                           signs, a wall of fame + a Fan of the Game wall (look) and
	                                           trophy cases (look) with balls, cups and rings inside
	  suites           1 Suite Corridor        corridor ceiling, room-row ceilings, carpet with a team
	                                           stripe, the corridor wall (door openings) with a framed
	                                           photo beside every suite's sign, light strips, wood
	                                           panelling, overhead wayfinding signs, SUITE LEVEL panels
	                                           + photo walls (look)
	                   2 Glass Fronts          glass fronts (team header with the name), end walls,
	                                           dividers and a door per suite
	                   3 Suite Interiors       carpet, stadium chairs at the glass (one SUITE CAM seat),
	                     & Signs               sofa on a team rug, live score TV on a walnut media wall
	                                           (the suite's name over it), mini-bar (soda / popcorn,
	                                           its sign on the front) + glass-door mini fridge, a
	                                           framed jersey in the suite's theme, a cove light per
	                                           block (a PointLight over every suite), number sign
	                                           (look); the Owner's Suite + Legends Suite get extras
	                                           (owner's chair, popcorn machine, golden football (look),
	                                           signed-ball case with balls on a shelf)
	  pressbox         1 Press Box Shell       walls, glass front, ceiling, lights, sliding glass double
	                                           door, signs, framed press photos on the corridor side,
	                                           an aisle runner, a framed front page (look)
	                   2 Press Row             desk with 6 PRESS BOX CAM seats + live monitors +
	                                           nameplates + keyboards, radio headsets, cups, PA
	                                           microphone, a second row on two risers either side of a
	                                           centre aisle from the door (laptops, keyboards, stat
	                                           sheets), TVs hung over the window, stat boards, game
	                                           clock, coffee & soda bar with a chalkboard menu, cooler,
	                                           copier, credentials
	                   3 Coaches' Booths       home + visiting coaches' booths (|x| 29.3..44): glass,
	                                           doors, a framed photo outside, desks with camera seats,
	                                           headsets, binoculars, sideline phone (look), playbook
	                                           tablet, drink, live depth chart, play sheet
	                   4 Roof & TV Cameras     a team-colour roof visor over the club seats' top row with
	                                           a PRESS BOX sign, three TV cameras (look) and antennas
	  broadcast_booth  1 Booth                 walls, ceiling, lights, double door, sill + header, framed
	                                           photos + an ON AIR sign on the corridor side, producer's
	                                           desk with a mixing console, live monitor wall, equipment
	                                           rack with status lights, the show's rundown (look),
	                                           soundproofing panels
	                   2 Glass & Cameras       glass in a steel frame, commentators' desk with 3 TV
	                                           BROADCAST seats, desk monitors, microphones, headsets,
	                                           coffee, spotting boards (look), field + studio cameras on
	                                           tripods, ON AIR light, softbox studio lights, a lighting
	                                           pipe with stage lights aimed at the desk, telestrator
	                                           (look), stats desk, guest couch
	                   3 Satellite Dish        an uplink deck over the club seats with the dish (look),
	                                           uplink box and an antenna with a beacon

	Flat layers: ring floor top 54 (corners 53.96); carpets 54.05 (corners 54.01); corridor + lounge
	stripes and rugs 54.08 (corners 54.04, but the corners' lounge stripes 54.085: the straight
	carpets run on over the corner joints).
	Ceilings 65.3..66 (corners 65.34..65.96) end at the outer wall's inner face (107.2); headers of
	the glass fronts 80..80.6 run up to 66, so the room ceilings start behind them at 80.6. The roof
	visors (press box, TV uplink deck) reach out over the club seats' top rows (offsets 75.4..80,
	y 63.8..65.6: above everyone's heads, non-collidable) and stay in front of the upper deck's ribbon
	board + fascia (offset 79.15+, from y 66.2).
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)
local Bowl = require(script.Parent.Parent.Bowl)

local M = {}

---------------------------------------------------------------------------------------------
-- Layout
---------------------------------------------------------------------------------------------

local LOOP = { "home", "corner_hw", "west", "corner_vw", "visitor", "corner_ve", "east", "corner_he" }
local GATES = { visitor = "A", west = "B", east = "C", home = "D" }

local TOWARD_FIELD = Enum.NormalId.Back
local OUTWARD = Enum.NormalId.Front
local TURN = CFrame.Angles(0, math.pi, 0)
-- which way a seat faces (its LookVector) in segment space
local FACE = { field = math.pi, out = 0, plus = -math.pi / 2, minus = math.pi / 2 }

local RING_IN, RING_OUT = 80, 108
local FLOOR = 54
local SLAB_BOTTOM = 52
local CEIL_BOTTOM, CEIL_TOP = 65.3, 66
local SINK = 0.04
local WALL_IN = 107.2 -- outer wall 107.2..108
local SKIRT_IN, SKIRT_OUT, SKIRT_BOTTOM = 83.4, 84.1, 42 -- closes the gap down to the main concourse
local GIRDER_IN, GIRDER_BOTTOM = 106, 49.5
local GATE_HALF = 8 -- escalator openings (16 wide)
local GATE_TOP = FLOOR + 10
local BAR_FRONT = 104.15 -- bars start just outside the lane (96..104)

-- the room row (suites, press box, booth): glass front 80..80.6, back wall 95.3..96
local FRONT_OUT, FRONT_IN = 80, 80.6
local BACK_IN, BACK_OUT = 95.25, 95.95
local SILL_TOP = FLOOR + 1.2
local GLASS_TOP = FLOOR + 9.2
-- roof visors (press box, TV uplink deck) reach out over the club seats' top rows from here; they stay
-- in front of the upper deck's ribbon board (offset 79.15..79.35 from y 66.5) and fascia (79.4..80)
local VISOR_IN = 75.4
local DOOR_H = 8
local WALL_T = 0.7

local PRESS_HALF = 22.7 -- press room / broadcast booth: |x| <= 22.7 (walls 22..22.7)
local COACH_A, COACH_B = 29.3, 44 -- coaches' booths (home)
local LOUNGE_X = 134 -- side lounges from here to the corners
local SUITE_BLOCKS = {
	home = { { 44, 74, 1 }, { 82, 126, 2 } },
	visitor = { { 29.3, 74, 2 }, { 82, 126, 2 } },
}

---------------------------------------------------------------------------------------------
-- Colours
---------------------------------------------------------------------------------------------

local PAINT = { CanCollide = false, CastShadow = false }
local NO_COLLIDE = { CanCollide = false }

local WHITE = Color3.fromRGB(248, 248, 248)
local INK = Color3.fromRGB(22, 22, 26)
local FLOOR_COLOR = Color3.fromRGB(190, 186, 178)
local STRUCTURE = Color3.fromRGB(122, 123, 130)
local WALL = Color3.fromRGB(214, 208, 198)
local WALL_LIGHT = Color3.fromRGB(230, 226, 218)
local CEILING = Color3.fromRGB(236, 236, 232)
local CARPET = Color3.fromRGB(54, 56, 66)
local SUITE_CARPET = Color3.fromRGB(86, 74, 66)
local LOUNGE_CARPET = Color3.fromRGB(70, 74, 84)
local WOOD = Color3.fromRGB(150, 105, 60)
local DARK_WOOD = Color3.fromRGB(92, 62, 40)
local WALNUT = Color3.fromRGB(70, 48, 34)
local MARBLE = Color3.fromRGB(236, 234, 228)
local LEATHER = Color3.fromRGB(34, 34, 38)
local CREAM = Color3.fromRGB(236, 230, 214)
local STEEL = Color3.fromRGB(78, 84, 94)
local DARK_METAL = Color3.fromRGB(58, 60, 66)
local BRUSHED = Color3.fromRGB(184, 188, 196)
local SCREEN = Color3.fromRGB(12, 14, 20)
local SCREEN_TEXT = Color3.fromRGB(255, 226, 120)
local SCREEN_WHITE = Color3.fromRGB(235, 242, 255)
local LAMP = Color3.fromRGB(255, 248, 232)
local WARM_LIGHT = Color3.fromRGB(255, 238, 205)
local HEAT_LAMP = Color3.fromRGB(255, 150, 70)
local CAMERA_BLACK = Color3.fromRGB(28, 28, 32)
local ON_AIR_RED = Color3.fromRGB(230, 36, 36)
local PAPER = Color3.fromRGB(250, 250, 244)
local COOLER_ORANGE = Color3.fromRGB(255, 120, 20)
local POPCORN_RED = Color3.fromRGB(200, 30, 36)
local GOLD = Color3.fromRGB(255, 190, 40)
local GLASS_TINT = Color3.fromRGB(160, 210, 240)
local SIGN_DARK = Color3.fromRGB(20, 24, 34)
local FOLIAGE = Color3.fromRGB(62, 118, 64)
local PLANTER = Color3.fromRGB(44, 46, 52)
local FOOTBALL = Color3.fromRGB(128, 74, 42)
local SMOOTHIE_PINK = Color3.fromRGB(236, 118, 150)
local FRIDGE_GLASS = Color3.fromRGB(34, 52, 62)
local LED_GREEN = Color3.fromRGB(60, 220, 110)
local LED_BLUE = Color3.fromRGB(70, 150, 255)
-- soda + juice bottles on the back bars and in the suites' mini fridges (no alcohol anywhere)
local BOTTLE_COLORS = {
	Color3.fromRGB(116, 58, 30), -- cola
	Color3.fromRGB(255, 140, 30), -- orange soda
	Color3.fromRGB(126, 204, 62), -- lime
	Color3.fromRGB(226, 58, 70), -- cherry
	Color3.fromRGB(78, 168, 232), -- blue sports drink
	Color3.fromRGB(246, 206, 84), -- lemonade
	Color3.fromRGB(150, 84, 170), -- grape juice
}
-- the "photos" in the suite corridor's frames (backgrounds behind the captions)
local PHOTO_TONES = {
	Color3.fromRGB(56, 108, 64), -- a sunny field
	Color3.fromRGB(66, 92, 138), -- an evening sky
	Color3.fromRGB(116, 82, 58), -- an old sepia print
	Color3.fromRGB(44, 48, 60), -- a night game
}

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

local function contrast(a, b)
	local la, lb = luminance(a), luminance(b)
	if la < lb then
		la, lb = lb, la
	end
	return (la + 0.05) / (lb + 0.05)
end

-- A team colour that reads well on `background`, else white or ink.
local function ink(background, team)
	for _, candidate in ipairs({ team.Trim, team.Secondary, team.Primary }) do
		if contrast(background, candidate) >= 3 then
			return candidate
		end
	end
	if contrast(background, WHITE) >= contrast(background, INK) then
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
	Text on one face of a part. opts: Left / Top / Width / Height (fractions of the face), Font,
	PPS (pixels per stud), Glow (LightInfluence 0: lit signs), Background (a filled plate), Wrap, Name
]]
local function write(part, face, text, color, opts)
	opts = opts or {}
	local _, label = BuildUtil.SurfaceText(part, face, text, {
		LabelName = opts.Name,
		TextColor3 = color,
		Font = opts.Font or Enum.Font.GothamBlack,
		PixelsPerStud = opts.PPS or 20,
		LightInfluence = opts.Glow and 0 or 1,
		BackgroundColor3 = opts.Background,
		BackgroundTransparency = opts.Background and 0 or 1,
	})
	label.Position = UDim2.new(opts.Left or 0.05, 0, opts.Top or 0.12, 0)
	label.Size = UDim2.new(opts.Width or 0.9, 0, opts.Height or 0.76, 0)
	if opts.Wrap then
		label.TextWrapped = true
	end
	return label
end

local function placeholders(ctx)
	local name = teamLabel(ctx)
	return {
		team = name,
		score = name .. " 0 - 0 VISITORS",
		gameday = "NEXT GAME SOON",
		summary = name .. "\n0 - 0\nRECORD 0-0\nSEASON 1",
		record = "RECORD 0-0",
		season = "SEASON 1",
		titles = "CHAMPIONSHIPS: 0",
		rating = "TEAM RATING 50",
		roster = "DEPTH CHART",
		owner = "OWNER",
	}
end

-- A live screen filling one face (dark LED background, bright unlit text).
local function liveScreen(ctx, part, face, live, opts)
	opts = opts or {}
	local _, label = BuildUtil.LiveText(part, face, live, {
		LabelName = opts.Name or ("Live_" .. live),
		Text = placeholders(ctx)[live] or "",
		TextColor3 = opts.Color or SCREEN_TEXT,
		BackgroundColor3 = SCREEN,
		BackgroundTransparency = 0,
		LightInfluence = 0,
		Font = Enum.Font.GothamBold,
		PixelsPerStud = opts.PPS or 24,
	})
	label.TextWrapped = true
	local pad = Instance.new("UIPadding")
	local px, py = UDim.new(0.05, 0), UDim.new(0.1, 0)
	pad.PaddingLeft, pad.PaddingRight, pad.PaddingTop, pad.PaddingBottom = px, px, py, py
	pad.Parent = label
	return label
end

-- PointLights spread along a long part (on attachments), `count` of them along its local X.
local function lightsAlong(part, count, props)
	local length = part.Size.X
	for index = 1, count do
		local attachment = Instance.new("Attachment")
		attachment.Name = "LightAt"
		attachment.Position = Vector3.new((index - 0.5) * length / count - length / 2, -0.4, 0)
		attachment.Parent = part
		BuildUtil.Light(attachment, "PointLight", props)
	end
end

---------------------------------------------------------------------------------------------
-- Segment-space part helpers
---------------------------------------------------------------------------------------------

-- The 8 segments of the ring in LOOP order (also indexed by name).
local function ring(L)
	local list = {}
	for _, s in ipairs(Bowl.Segments(L, 0, 0)) do
		list[s.name] = s
	end
	local out = {}
	for _, name in ipairs(LOOP) do
		local s = list[name]
		local seg = {
			name = name,
			kind = s.kind,
			base = s.cframe,
			sink = s.kind == "corner" and SINK or 0,
			gate = GATES[name],
		}
		seg.len = function(o)
			return Bowl.Segment(L, name, o, o).innerLength
		end
		seg.floor = FLOOR - seg.sink
		table.insert(out, seg)
		out[name] = seg
	end
	return out
end

local function at(seg, x, y, o)
	return seg.base * CFrame.new(x, y, -o)
end

-- Block from x0..x1 along the segment, offsets o0..o1, heights y0..y1 (any order).
local function span(ctx, seg, name, x0, x1, o0, o1, y0, y1, color, material, extra)
	local ax, bx = math.min(x0, x1), math.max(x0, x1)
	local ao, bo = math.min(o0, o1), math.max(o0, o1)
	local ay, by = math.min(y0, y1), math.max(y0, y1)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Size = Vector3.new(bx - ax, by - ay, bo - ao)
	props.CFrame = at(seg, (ax + bx) / 2, (ay + by) / 2, (ao + bo) / 2)
	if props.Turned then
		props.CFrame = props.CFrame * TURN
		props.Turned = nil
	end
	props.Color = color
	props.Material = material or Enum.Material.SmoothPlastic
	return BuildUtil.Part(ctx, props)
end

-- Vertical cylinder standing on (x, o) from y0 to y1.
local function post(ctx, seg, name, x, o, y0, y1, diameter, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Position = at(seg, x, (y0 + y1) / 2, o).Position
	props.Height = y1 - y0
	props.Diameter = diameter
	props.Axis = "Y"
	props.Color = color
	props.Material = material or Enum.Material.Metal
	return BuildUtil.Cylinder(ctx, props)
end

-- Horizontal cylinder centred at (x, y, o), along the segment ("x") or across it ("o").
local function rod(ctx, seg, name, x, y, o, length, diameter, axis, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Shape = Enum.PartType.Cylinder
	props.Size = Vector3.new(length, diameter, diameter)
	props.CFrame = at(seg, x, y, o) * (axis == "o" and CFrame.Angles(0, math.pi / 2, 0) or CFrame.new())
	props.Color = color
	props.Material = material or Enum.Material.Metal
	return BuildUtil.Part(ctx, props)
end

-- Pieces of x0..x1 that are not inside any of the gaps ({ a, b } pairs, sorted).
local function runs(x0, x1, gaps)
	local list = {}
	local cursor = x0
	for _, gap in ipairs(gaps) do
		if gap[1] - cursor > 0.05 then
			table.insert(list, { cursor, gap[1] })
		end
		cursor = math.max(cursor, gap[2])
	end
	if x1 - cursor > 0.05 then
		table.insert(list, { cursor, x1 })
	end
	return list
end

-- Neon panel under the ceiling with a PointLight.
local function lamp(ctx, seg, x, o, w, d, range, brightness)
	local y1 = CEIL_BOTTOM + seg.sink
	local panel = span(ctx, seg, "CeilingLight", x - w / 2, x + w / 2, o - d / 2, o + d / 2, y1 - 0.15, y1, LAMP, Enum.Material.Neon, PAINT)
	BuildUtil.Light(panel, "PointLight", { Name = "RoomLight", Range = range or 22, Brightness = brightness or 1.4, Color = WARM_LIGHT })
	return panel
end

-- A long neon strip under the ceiling with `count` PointLights along it.
local function lightStrip(ctx, seg, x0, x1, o, count, range, brightness)
	local y1 = CEIL_BOTTOM + seg.sink
	local strip = span(ctx, seg, "CeilingLightStrip", x0, x1, o - 0.3, o + 0.3, y1 - 0.15, y1, LAMP, Enum.Material.Neon, PAINT)
	lightsAlong(strip, count, { Name = "RingLight", Range = range or 24, Brightness = brightness or 1.3, Color = WARM_LIGHT })
	return strip
end

--[[
	A chair players can sit on: a padded seat (BuildUtil.Seat) and a back. The sitter faces
	`facing` (a FACE key). opts: Width, Depth, SeatHeight, BackHeight (0 = no back), BackColor,
	Material, Name, Object, NoPrompt, Camera
]]
local function chair(ctx, seg, x, o, fy, facing, color, opts)
	opts = opts or {}
	local w, d = opts.Width or 2, opts.Depth or 2
	local seatH = opts.SeatHeight or 1.7
	local backH = opts.BackHeight or 2.3
	local frame = at(seg, x, fy, o) * CFrame.Angles(0, FACE[facing], 0)
	local material = opts.Material or Enum.Material.Fabric
	local seat = BuildUtil.Seat(ctx, {
		Name = opts.Name or "Chair",
		Size = Vector3.new(w, seatH, d),
		CFrame = frame * CFrame.new(0, seatH / 2, 0),
		Color = color,
		Material = material,
		Object = opts.Object,
		NoPrompt = opts.NoPrompt,
		Camera = opts.Camera,
	})
	if backH > 0 then
		BuildUtil.Part(ctx, {
			Name = (opts.Name or "Chair") .. "Back",
			Size = Vector3.new(w, backH, 0.4),
			CFrame = frame * CFrame.new(0, seatH + backH / 2, d / 2 - 0.2),
			Color = opts.BackColor or color,
			Material = material,
		})
	end
	return seat
end

-- A camera view (plot-local) from segment point (x, y, o) toward the field centre.
local function fieldView(L, seg, x, y, o, fov, label)
	return {
		From = at(seg, x, y, o).Position,
		To = Vector3.new(0, 0, L.FieldCenterZ),
		Fov = fov,
		Label = label,
	}
end

--[[
	A door in a room's back wall (offsets 95.3..96) between x0 and x1 (the doorway), swinging into
	the room (toward the field). Single doors hinge on their +x side. props: Name, Double, Window,
	Slide, Color, Material, Transparency, Object, Title, Info, LookKey
]]
local function roomDoor(ctx, seg, x0, x1, fy, props)
	return BuildUtil.Door(ctx, {
		Name = props.Name or "Door",
		Size = Vector3.new(x1 - x0, DOOR_H, 0.3),
		CFrame = at(seg, (x0 + x1) / 2, fy + DOOR_H / 2, (BACK_IN + BACK_OUT) / 2) * TURN,
		Double = props.Double,
		Slide = props.Slide,
		Hinge = "Left",
		Window = props.Window,
		Color = props.Color,
		Material = props.Material,
		Transparency = props.Transparency,
		Object = props.Object,
		Title = props.Title,
		Info = props.Info,
		LookKey = props.LookKey,
	})
end

-- Writes text on the corridor side (Back face) of every leaf of a door model (leaf index -> text).
local function doorText(model, texts, color, background)
	for _, part in ipairs(model:GetChildren()) do
		if part.Name == "DoorLeaf" then
			local text = texts[part:GetAttribute("Leaf")]
			if text then
				write(part, Enum.NormalId.Back, text, color, {
					Name = "DoorSign",
					Left = 0.12,
					Width = 0.76,
					Top = 0.14,
					Height = 0.14,
					Background = background,
					PPS = 30,
				})
			end
		end
	end
end

--[[
	The back wall of a room (offsets 95.3..96) from x0 to x1 with door openings ({ a, b } pairs):
	wall pieces up to the door heads and one lintel over the whole run (up to the ceiling).
	Returns the lintel.
]]
local function backWall(ctx, seg, name, x0, x1, fy, doors, color)
	local head = fy + DOOR_H
	for _, piece in ipairs(runs(x0, x1, doors)) do
		span(ctx, seg, name, piece[1], piece[2], BACK_IN, BACK_OUT, fy, head, color)
	end
	return span(ctx, seg, name .. "Lintel", x0, x1, BACK_IN, BACK_OUT, head, CEIL_BOTTOM, color)
end

--[[
	A glass front (offsets 80..80.6) from x0 to x1: sill, glass and a header up to the ceiling top.
	Returns the header (for its sign) and the glass. withGlass = false leaves the glass out.
]]
local function glassFront(ctx, seg, x0, x1, fy, sillColor, headerColor, withGlass)
	span(ctx, seg, "GlassSill", x0, x1, FRONT_OUT, FRONT_IN, fy, SILL_TOP, sillColor)
	local glass
	if withGlass ~= false then
		glass =
			span(ctx, seg, "FrontGlass", x0, x1, FRONT_OUT + 0.15, FRONT_IN - 0.15, SILL_TOP, GLASS_TOP, GLASS_TINT, Enum.Material.Glass, {
				Transparency = 0.55,
			})
	end
	local header = span(ctx, seg, "GlassHeader", x0, x1, FRONT_OUT, FRONT_IN, GLASS_TOP, CEIL_TOP, headerColor)
	return header, glass
end

-- TV camera on a tripod post: the lens points "field" (toward the field) or "plus"/"minus" (along x).
-- Returns the body (for its look prompt).
local function tvCamera(ctx, seg, x, o, baseY, dir, postH, extra)
	local top = baseY + postH
	post(ctx, seg, "TripodPost", x, o, baseY, top, 0.4, DARK_METAL, Enum.Material.Metal, extra)
	local body
	if dir == "field" then
		body = span(ctx, seg, "CameraBody", x - 0.9, x + 0.9, o - 1.3, o + 1.3, top, top + 1.6, CAMERA_BLACK, nil, extra)
		rod(ctx, seg, "CameraLens", x, top + 0.8, o - 1.8, 1, 1.1, "o", DARK_METAL, Enum.Material.Metal, extra)
	else
		local s = dir == "plus" and 1 or -1
		body = span(ctx, seg, "CameraBody", x - 1.3, x + 1.3, o - 0.9, o + 0.9, top, top + 1.6, CAMERA_BLACK, nil, extra)
		rod(ctx, seg, "CameraLens", x + s * 1.8, top + 0.8, o, 1, 1.1, "x", DARK_METAL, Enum.Material.Metal, extra)
	end
	return body
end

-- A thin rod between two segment points a and b ({ x, y, o }), not collidable.
local function strut(ctx, seg, name, a, b, diameter, color)
	local p0 = at(seg, a[1], a[2], a[3]).Position
	local p1 = at(seg, b[1], b[2], b[3]).Position
	return BuildUtil.Part(ctx, {
		Name = name,
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new((p1 - p0).Magnitude, diameter, diameter),
		-- (a cylinder's axis is its local X)
		CFrame = CFrame.lookAt((p0 + p1) / 2, p1) * CFrame.Angles(0, math.pi / 2, 0),
		Color = color,
		Material = Enum.Material.Metal,
		CanCollide = false,
	})
end

-- Three tripod legs splayed out from a camera's post at (x, o): from `hipY` down to the floor.
local function tripodLegs(ctx, seg, x, o, floorY, hipY, spread)
	for _, angle in ipairs({ math.pi / 2, math.pi * 7 / 6, math.pi * 11 / 6 }) do
		local foot = { x + spread * math.cos(angle), floorY + 0.06, o + spread * math.sin(angle) }
		strut(ctx, seg, "TripodLeg", { x, hipY, o }, foot, 0.14, DARK_METAL)
	end
end

--[[
	Rows of soda and juice bottles drawn on one face of a part (a back bar, a fridge door):
	rows = { { bottom, top }, ... } in studs above the part's bottom, a bottle every opts.Spacing
	studs, opts.Inset studs in from each end. opts.Panel = the colour of a door panel behind them
	(inset by opts.Inset; nil = none), opts.Seed shuffles the colours. Ordinary lit paint (no glow);
	the shelves are real parts.
]]
local function bottleRows(part, face, rows, opts)
	local gui = Instance.new("SurfaceGui")
	gui.Name = "BottlesGui"
	gui.Face = face
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 12
	gui.LightInfluence = 1 -- (a new SurfaceGui glows unless told otherwise)
	gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
	gui.Parent = part
	local width = (face == Enum.NormalId.Left or face == Enum.NormalId.Right) and part.Size.Z or part.Size.X
	local height = part.Size.Y
	local inset = opts.Inset
	if opts.Panel then
		local panel = Instance.new("Frame")
		panel.Name = "DoorPanel"
		panel.BorderSizePixel = 0
		panel.BackgroundColor3 = opts.Panel
		panel.Position = UDim2.new(inset / width, 0, inset / height, 0)
		panel.Size = UDim2.new(1 - 2 * inset / width, 0, 1 - 2 * inset / height, 0)
		panel.Parent = gui
	end
	local count = math.max(1, math.floor((width - 2 * inset) / opts.Spacing))
	local step = (width - 2 * inset) / count
	local bottleWidth = math.min(step * 0.55, 0.42)
	for r, row in ipairs(rows) do
		for index = 1, count do
			local bottle = Instance.new("Frame")
			bottle.Name = "Bottle"
			bottle.BorderSizePixel = 0
			bottle.ZIndex = 2
			bottle.BackgroundColor3 = BOTTLE_COLORS[(index * 3 + r * 5 + (opts.Seed or 0)) % #BOTTLE_COLORS + 1]
			-- every third one is a short can
			local tall = (row[2] - row[1]) * ((index + r) % 3 == 0 and 0.62 or 1)
			local x = inset + (index - 0.5) * step
			bottle.Size = UDim2.new(bottleWidth / width, 0, tall / height, 0)
			bottle.Position = UDim2.new((x - bottleWidth / 2) / width, 0, (height - row[1] - tall) / height, 0)
			bottle.Parent = gui
		end
	end
	return gui
end

-- A framed "photo" on one face of a part (the part is the frame): a picture of a stadium (sky in
-- `tone` over a green field) with a caption along its bottom. Ordinary lit paint (no glow).
local function picture(part, face, caption, tone)
	local gui = Instance.new("SurfaceGui")
	gui.Name = "PictureGui"
	gui.Face = face
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 20
	gui.LightInfluence = 1
	gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
	gui.Parent = part
	local sky = Instance.new("Frame")
	sky.Name = "Picture"
	sky.BorderSizePixel = 0
	sky.BackgroundColor3 = tone
	sky.Position = UDim2.new(0.07, 0, 0.09, 0)
	sky.Size = UDim2.new(0.86, 0, 0.82, 0)
	sky.Parent = gui
	local field = Instance.new("Frame")
	field.Name = "Field"
	field.BorderSizePixel = 0
	field.BackgroundColor3 = Color3.fromRGB(70, 132, 74)
	field.Position = UDim2.new(0, 0, 0.58, 0)
	field.Size = UDim2.new(1, 0, 0.42, 0)
	field.Parent = sky
	local label = Instance.new("TextLabel")
	label.Name = "Caption"
	label.BackgroundTransparency = 1
	label.Position = UDim2.new(0.05, 0, 0.66, 0)
	label.Size = UDim2.new(0.9, 0, 0.26, 0)
	label.Font = Enum.Font.GothamBold
	label.Text = caption
	label.TextColor3 = WHITE
	label.TextScaled = true
	label.ZIndex = 2
	label.Parent = sky
	return gui
end

---------------------------------------------------------------------------------------------
-- CLUB LOUNGE
---------------------------------------------------------------------------------------------

-- Bars against the outer wall: segment -> list of { x0, x1, use, sign, title, info }
local BARS = {
	west = {
		{ -40, -14, "soda", "CLUB SODA BAR", "Club Soda Bar", "Fizzy sodas on tap, served in a souvenir cup with the team logo." },
		{
			14,
			40,
			"sportsdrink",
			"HYDRATION STATION",
			"Hydration Station",
			"The same ice-cold sports drinks the players get on the sideline!",
		},
	},
	east = {
		{
			-40,
			-14,
			"sportsdrink",
			"HYDRATION STATION",
			"Hydration Station",
			"Grab a sports drink - cheering for four quarters is thirsty work!",
		},
		{ 14, 40, "soda", "CLUB SODA BAR", "Club Soda Bar", "Pick a flavour: cola, orange, lemon-lime or the secret team-colour fizz." },
	},
	corner_hw = {
		{ -15, 15, "soda", "FIZZ BAR", "Fizz Bar", "Root beer floats, cherry cola and more fizz than a shaken soda can." },
	},
	corner_vw = {
		{ -15, 15, "smoothie", "SMOOTHIE BAR", "Smoothie Bar", "Fruit smoothies blended fresh - the kickers swear by the mango one." },
	},
	corner_ve = {
		{
			-15,
			15,
			"sportsdrink",
			"SIDELINE COOLER",
			"Sideline Cooler Bar",
			"Sports drinks in every team colour. Try not to get a cooler shower!",
		},
	},
	corner_he = {
		{
			-15,
			15,
			"soda",
			"SODA FOUNTAIN",
			"Soda Fountain",
			"An old-school soda fountain with twenty flavours. Mix them all - we dare you!",
		},
	},
}

--[[
	A bar against the outer wall: a walnut counter with the bar's name on its front (facing the lane),
	a marble top (the drinks prompt in its middle), a back bar with rows of sodas and juices on a
	glass shelf over a team-colour glow strip, and a drinks prop on the counter 5 studs in from its
	+x end, clear of the prompt: a soda tap tower, a sports drink cooler or a smoothie blender.
	`index` shuffles the bottle colours from bar to bar.
]]
local function bar(ctx, seg, spec, team, index)
	local x0, x1 = spec[1], spec[2]
	local fy = seg.floor
	local counter = span(ctx, seg, "BarCounter", x0, x1, BAR_FRONT + 0.15, 105.6, fy, fy + 3.2, WALNUT, Enum.Material.Wood)
	-- (the name goes on the counter: the back bar's lower half hides behind it)
	write(counter, TOWARD_FIELD, spec[4], ink(WALNUT, team), { Top = 0.2, Height = 0.5, Left = 0.12, Width = 0.76 })
	local top = span(ctx, seg, "BarTop", x0 - 0.2, x1 + 0.2, BAR_FRONT, 105.8, fy + 3.2, fy + 3.5, MARBLE, Enum.Material.Marble)
	local back = span(ctx, seg, "BackBar", x0, x1, 106.3, WALL_IN, fy, fy + 6.2, DARK_WOOD, Enum.Material.Wood)
	span(ctx, seg, "BarGlow", x0 + 0.4, x1 - 0.4, 106.15, 106.3, fy + 3.7, fy + 3.85, team.Secondary, Enum.Material.Neon, PAINT)
	span(ctx, seg, "BackBarShelf", x0 + 0.4, x1 - 0.4, 105.85, 106.3, fy + 4.9, fy + 5.02, GLASS_TINT, Enum.Material.Glass, {
		Transparency = 0.3,
		CanCollide = false,
	})
	bottleRows(back, TOWARD_FIELD, { { 3.9, 4.75 }, { 5.02, 5.95 } }, { Spacing = 1.25, Inset = 0.6, Seed = index })
	-- (po: the cooler, 1.6 wide, ends flush with the back of the marble, clear of the glass shelf)
	local px, po, pt = x1 - 5, 105, fy + 3.5
	if spec[3] == "soda" then
		local tower = span(ctx, seg, "SodaTower", px - 1, px + 1, po - 0.35, po + 0.35, pt, pt + 1.8, BRUSHED, Enum.Material.Metal)
		span(ctx, seg, "SodaTaps", px - 0.8, px + 0.8, po - 0.55, po - 0.35, pt + 0.8, pt + 1.25, team.Secondary, nil, NO_COLLIDE)
		write(tower, TOWARD_FIELD, "COLA  ORANGE  LIME", INK, { Top = 0.06, Height = 0.22, Font = Enum.Font.GothamBold })
	elseif spec[3] == "sportsdrink" then
		post(ctx, seg, "DrinkCooler", px, po, pt, pt + 2, 1.6, COOLER_ORANGE, Enum.Material.SmoothPlastic)
		post(ctx, seg, "CupStack", px - 1.5, po, pt, pt + 1.3, 0.5, WHITE, Enum.Material.SmoothPlastic, NO_COLLIDE)
	else
		span(ctx, seg, "BlenderBase", px - 0.55, px + 0.55, po - 0.45, po + 0.45, pt, pt + 0.6, DARK_METAL, Enum.Material.Metal)
		post(ctx, seg, "BlenderJug", px, po, pt + 0.6, pt + 2, 0.8, SMOOTHIE_PINK, Enum.Material.Glass, { Transparency = 0.15 })
	end
	BuildUtil.Use(ctx, top, spec[3], {
		Object = spec[5],
		Title = spec[5],
		Info = spec[6],
		Distance = 8,
	})
end

-- Lounge furniture: a sofa set (sofa facing the field, coffee table, two armchairs) on a rug.
local function sofaSet(ctx, seg, x, o, team, opts)
	opts = opts or {}
	local fy = seg.floor
	span(ctx, seg, "LoungeRug", x - 6, x + 6, o - 4.2, o + 3.4, fy, fy + 0.08, opts.Rug or team.Primary, Enum.Material.Carpet, PAINT)
	chair(ctx, seg, x, o + 1.6, fy, "field", opts.Sofa or LEATHER, {
		Width = 7,
		Depth = 2.6,
		SeatHeight = 1.6,
		BackHeight = 2,
		Name = "Sofa",
		Object = "Lounge Sofa",
		Material = Enum.Material.Leather,
	})
	span(ctx, seg, "CoffeeTable", x - 2.4, x + 2.4, o - 1.6, o - 0.2, fy, fy + 1.3, DARK_WOOD, Enum.Material.Wood)
	if opts.Armchairs ~= false then
		for _, s in ipairs({ -1, 1 }) do
			chair(ctx, seg, x + s * 4.8, o - 0.9, fy, s < 0 and "plus" or "minus", opts.Armchair or team.Secondary, {
				Width = 2.4,
				Depth = 2.4,
				SeatHeight = 1.6,
				BackHeight = 1.8,
				Name = "Armchair",
				NoPrompt = true,
			})
		end
	end
end

-- A standing high-top table (marble top on a slim post) at (x, o).
local function highTop(ctx, seg, x, o)
	local fy = seg.floor
	post(ctx, seg, "HighTopPost", x, o, fy, fy + 3.4, 0.5, DARK_METAL, Enum.Material.Metal)
	return post(ctx, seg, "HighTopTable", x, o, fy + 3.4, fy + 3.65, 2.8, MARBLE, Enum.Material.Marble)
end

-- A drink rail along the front edge (offset 80.3..81.1) from x0 to x1 with stools behind it.
-- camIndex = which stool (if any) is a CLUB LOUNGE CAM seat.
local function drinkRail(ctx, seg, L, x0, x1, stools, team, camIndex)
	local fy = seg.floor
	local rail = span(ctx, seg, "DrinkRail", x0, x1, 80.3, 81.1, fy, fy + 3.4, team.Primary)
	span(ctx, seg, "DrinkRailTop", x0 - 0.1, x1 + 0.1, 80.2, 81.5, fy + 3.4, fy + 3.6, MARBLE, Enum.Material.Marble)
	for index = 1, stools do
		local x = x0 + (index - 0.5) * (x1 - x0) / stools
		local camera = index == camIndex
		BuildUtil.Seat(ctx, {
			Name = "BarStool",
			Size = Vector3.new(1.6, 2.6, 1.6),
			CFrame = at(seg, x, fy + 1.3, 82.6) * TURN,
			Color = camera and team.Secondary or LEATHER,
			Material = Enum.Material.Leather,
			Object = camera and "Club Lounge Stool" or nil,
			NoPrompt = not camera,
			Camera = camera and fieldView(L, seg, x * 0.8, fy + 9, 72, 55, "CLUB LOUNGE CAM") or nil,
		})
	end
	return rail
end

function M.club_lounge(ctx)
	local L = ctx.config.Layout
	local team = ctx.colors
	local name = teamLabel(ctx)
	local segs = ring(L)

	-------------------------------------------------------------------------------------------
	-- 1 LOUNGE FLOOR & BARS
	-------------------------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 1)
	local shell = BuildUtil.Child(ctx, "ClubRing")
	for _, seg in ipairs(segs) do
		local k = seg.sink
		local half = seg.len(RING_OUT) / 2
		span(shell, seg, "ClubRingFloor", -half, half, RING_IN, RING_OUT, SLAB_BOTTOM + k, FLOOR - k, FLOOR_COLOR, Enum.Material.Concrete)
		-- (the skirt doesn't collide: anyone on the main concourse's roof when the floor goes in
		-- walks out under it and drops to the ground; nothing outside it can be stood on)
		local skirtHalf = seg.len(SKIRT_OUT) / 2
		span(
			shell,
			seg,
			"ClubRingSkirt",
			-skirtHalf,
			skirtHalf,
			SKIRT_IN,
			SKIRT_OUT,
			SKIRT_BOTTOM,
			SLAB_BOTTOM + k,
			STRUCTURE,
			Enum.Material.Concrete,
			NO_COLLIDE
		)
		-- the outer girder (open on the gate axes, where the escalators come up from below)
		local gaps = seg.gate and { { -GATE_HALF - 1, GATE_HALF + 1 } } or {}
		for _, piece in ipairs(runs(-half, half, gaps)) do
			span(
				shell,
				seg,
				"RingGirder",
				piece[1],
				piece[2],
				GIRDER_IN,
				RING_OUT,
				GIRDER_BOTTOM + k,
				SLAB_BOTTOM + k,
				STRUCTURE,
				Enum.Material.Concrete
			)
		end
		-- the outer wall with the escalator opening
		local wallGaps = seg.gate and { { -GATE_HALF, GATE_HALF } } or {}
		for _, piece in ipairs(runs(-half, half, wallGaps)) do
			span(shell, seg, "ClubOuterWall", piece[1], piece[2], WALL_IN, RING_OUT, seg.floor, CEIL_TOP - k, WALL)
		end
		if seg.gate then
			local lintel = span(shell, seg, "GateLintel", -GATE_HALF, GATE_HALF, WALL_IN, RING_OUT, GATE_TOP, CEIL_TOP, team.Primary)
			write(lintel, TOWARD_FIELD, "GATE " .. seg.gate .. "  -  ESCALATORS", ink(team.Primary, team), {
				Top = 0.4,
				Height = 0.5,
				Glow = true,
				PPS = 40,
			})
			-- (no outward CLUB LEVEL lettering: the escalators' CLUB LEVEL sign stands right in front of it)
			BuildUtil.Look(
				lintel,
				"Escalators to Gate " .. seg.gate,
				"The escalators run down to the main concourse and out through Gate "
					.. seg.gate
					.. ". You're on the club level, three floors above the field!",
				{ At = Vector3.new(0, -2.2, 0.8), Distance = 10 }
			)
		end
	end

	-- lounge carpets, ceilings + light strips: ends, corners and the side lounges (the carpets run
	-- the full length of the floor slab, so the straight ones also cover the corner joints)
	local lounge = BuildUtil.Child(ctx, "Lounges")
	for _, seg in ipairs(segs) do
		local k = seg.sink
		if seg.kind ~= "side" then
			local half = seg.len(RING_OUT) / 2
			span(
				lounge,
				seg,
				"LoungeCarpet",
				-half,
				half,
				RING_IN,
				WALL_IN,
				seg.floor,
				seg.floor + 0.05,
				LOUNGE_CARPET,
				Enum.Material.Carpet,
				PAINT
			)
			span(lounge, seg, "LoungeCeiling", -half, half, RING_IN, WALL_IN, CEIL_BOTTOM + k, CEIL_TOP - k, CEILING)
			if seg.kind == "end" then
				lightStrip(lounge, seg, -92, 92, 86, 6, 26, 1.4)
				lightStrip(lounge, seg, -100, 100, 100.5, 6, 26, 1.3)
			else
				lightStrip(lounge, seg, -30, 30, 93, 3, 26, 1.4)
			end
		else
			local half = seg.len(RING_OUT) / 2
			for _, s in ipairs({ -1, 1 }) do
				span(
					lounge,
					seg,
					"LoungeCarpet",
					s * LOUNGE_X,
					s * half,
					RING_IN,
					WALL_IN,
					FLOOR,
					FLOOR + 0.05,
					LOUNGE_CARPET,
					Enum.Material.Carpet,
					PAINT
				)
				span(lounge, seg, "LoungeCeiling", s * LOUNGE_X, s * half, RING_IN, WALL_IN, CEIL_BOTTOM, CEIL_TOP, CEILING)
				lightStrip(lounge, seg, s * (LOUNGE_X + 2), s * 174, 93, 3, 26, 1.3)
			end
		end
	end

	-- a dark wood wainscot along the outer wall (it meets the suite corridor's panelling at +-132)
	-- and a team-colour stripe in the carpet along the inner edge of the walking lane (96..104), in
	-- front of the CLUB floor logos
	for _, seg in ipairs(segs) do
		local half = seg.len(WALL_IN) / 2
		-- (+0.11 closes the mitre at the corner joints; a corner's stripe lies on top of the straight
		-- carpets, which run on over the joints, and of the straight stripes' ends)
		local stripeHalf = seg.len(94.7) / 2 + 0.11
		local stripeTop = seg.kind == "corner" and FLOOR + 0.085 or FLOOR + 0.08
		local pieces, stripes
		if seg.kind == "side" then
			pieces = { { -half, -LOUNGE_X + 2 }, { LOUNGE_X - 2, half } }
			stripes = { { -stripeHalf, -LOUNGE_X }, { LOUNGE_X, stripeHalf } }
		else
			pieces = runs(-half, half, seg.gate and { { -GATE_HALF, GATE_HALF } } or {})
			stripes = { { -stripeHalf, stripeHalf } }
		end
		for _, piece in ipairs(pieces) do
			span(
				lounge,
				seg,
				"Wainscot",
				piece[1],
				piece[2],
				WALL_IN - 0.15,
				WALL_IN,
				seg.floor,
				seg.floor + 3.6,
				DARK_WOOD,
				Enum.Material.Wood,
				PAINT
			)
		end
		for _, piece in ipairs(stripes) do
			span(
				lounge,
				seg,
				"LoungeStripe",
				piece[1],
				piece[2],
				94.45,
				94.95,
				seg.floor + 0.05,
				stripeTop,
				team.Primary,
				Enum.Material.Carpet,
				PAINT
			)
		end
	end

	-- bars against the outer wall
	local bars = BuildUtil.Child(ctx, "Bars")
	local barCount = 0
	for _, seg in ipairs(segs) do
		for _, spec in ipairs(BARS[seg.name] or {}) do
			barCount += 1
			bar(bars, seg, spec, team, barCount)
		end
	end

	-------------------------------------------------------------------------------------------
	-- 2 BUFFET
	-------------------------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 2)
	local food = BuildUtil.Child(ctx, "Buffet")
	for _, seg in ipairs(segs) do
		local fy = seg.floor
		if seg.kind == "end" then
			-- the buffet island between the two middle aisles, in front of the lane
			local base = span(food, seg, "BuffetCounter", -16, 16, 85.2, 88.2, fy, fy + 3, team.Primary)
			write(base, OUTWARD, "CLUB BUFFET", ink(team.Primary, team), { Left = 0.3, Width = 0.4, Top = 0.2, Height = 0.6 })
			write(base, TOWARD_FIELD, name .. " CLUB", ink(team.Primary, team), { Left = 0.3, Width = 0.4, Top = 0.2, Height = 0.6 })
			local top = span(food, seg, "BuffetTop", -16.3, 16.3, 85, 88.4, fy + 3, fy + 3.3, MARBLE, Enum.Material.Marble)
			local dishes = {
				{ -10, Color3.fromRGB(196, 110, 70) }, -- hot dogs
				{ 0, Color3.fromRGB(250, 204, 70) }, -- mac and cheese
				{ 10, Color3.fromRGB(110, 170, 70) }, -- salad
			}
			for _, dish in ipairs(dishes) do
				span(
					food,
					seg,
					"BuffetDish",
					dish[1] - 4,
					dish[1] + 4,
					85.8,
					87.6,
					fy + 3.3,
					fy + 3.75,
					dish[2],
					Enum.Material.SmoothPlastic
				)
			end
			span(food, seg, "SneezeGuard", -15.5, 15.5, 85.6, 88, fy + 5.2, fy + 5.35, GLASS_TINT, Enum.Material.Glass, {
				Transparency = 0.5,
				CanCollide = false,
			})
			local heat = span(food, seg, "HeatLamps", -15.25, 15.25, 87.2, 87.6, fy + 6.6, fy + 6.9, HEAT_LAMP, Enum.Material.Neon, PAINT)
			BuildUtil.Light(heat, "PointLight", { Name = "HeatGlow", Range = 10, Brightness = 0.8, Color = HEAT_LAMP })
			-- brushed posts at both ends carry the heat lamps and the sneeze guard; a stack of plates
			-- at each end
			for _, s in ipairs({ -1, 1 }) do
				-- (the lamp bar runs on into the posts)
				post(food, seg, "HeatLampPost", s * 15.25, 87.4, fy + 3.3, fy + 6.9, 0.25, BRUSHED, Enum.Material.Metal, NO_COLLIDE)
				post(food, seg, "PlateStack", s * 15.3, 86, fy + 3.3, fy + 3.8, 1.2, WHITE, Enum.Material.SmoothPlastic, NO_COLLIDE)
			end
			BuildUtil.Use(ctx, top, "tray", {
				Object = "Club Buffet",
				Title = "Club Buffet",
				Info = "All-you-can-eat for club members: hot dogs, mac and cheese, salad... and a mountain of cookies.",
				At = Vector3.new(-12, 0.6, 0),
				Distance = 8,
			})
			BuildUtil.Use(ctx, top, "hotdog", {
				Object = "Hot Dog Tray",
				Title = "Hot Dog Tray",
				Info = "Grilled hot dogs with every topping you can think of. Ketchup AND mustard - you're a club member!",
				At = Vector3.new(12, 0.6, 0),
				Distance = 8,
			})
			-- popcorn & candy carts at the ends of the lounge
			for _, s in ipairs({ -1, 1 }) do
				local x = s * 40
				local cart = span(food, seg, "PopcornCart", x - 2, x + 2, 87.6, 90.2, fy, fy + 3.6, POPCORN_RED)
				span(
					food,
					seg,
					"PopcornCase",
					x - 1.8,
					x + 1.8,
					87.8,
					90,
					fy + 3.6,
					fy + 6.2,
					Color3.fromRGB(255, 236, 170),
					Enum.Material.Glass,
					{
						Transparency = 0.25,
					}
				)
				write(cart, OUTWARD, "POPCORN", WHITE, { Top = 0.25, Height = 0.5 })
				BuildUtil.Use(ctx, cart, "popcorn", {
					Object = "Popcorn Cart",
					Title = "Popcorn & Candy Cart",
					Info = "Freshly popped and extra buttery. The cart even has team-colour candy!",
					Distance = 8,
				})
			end
		elseif seg.kind == "corner" then
			-- a food station beside the corner aisle
			local hot = seg.name == "corner_hw" or seg.name == "corner_vw"
			local counter =
				span(food, seg, "FoodStation", -24, -12, 88, 90.6, fy, fy + 3.2, hot and DARK_WOOD or POPCORN_RED, Enum.Material.Wood)
			span(food, seg, "StationTop", -24.2, -11.8, 87.8, 90.8, fy + 3.2, fy + 3.5, MARBLE, Enum.Material.Marble)
			local hood =
				span(food, seg, "StationHood", -23.6, -12.4, 88.4, 90.2, fy + 6.4, fy + 7.2, BRUSHED, Enum.Material.Metal, NO_COLLIDE)
			write(
				hood,
				OUTWARD,
				hot and "CARVING STATION" or "POPCORN STATION",
				INK,
				{ Top = 0.1, Height = 0.8, Font = Enum.Font.GothamBold }
			)
			BuildUtil.Use(ctx, counter, hot and "hotdog" or "popcorn", {
				Object = hot and "Carving Station" or "Popcorn Station",
				Title = hot and "Gourmet Hot Dog Station" or "Popcorn Station",
				Info = hot and "The chef grills foot-long hot dogs right in front of you. Pick your toppings!"
					or "Caramel, cheese or classic butter - popped fresh every few minutes.",
				Distance = 8,
			})
		end
	end

	-------------------------------------------------------------------------------------------
	-- 3 LOUNGE SEATING
	-------------------------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 3)
	local seating = BuildUtil.Child(ctx, "LoungeSeating")
	for _, seg in ipairs(segs) do
		if seg.kind == "end" then
			for _, s in ipairs({ -1, 1 }) do
				-- drink rail between the aisles at +-26 and +-78 (the middle stool of the east half is
				-- the lounge's camera seat)
				drinkRail(seating, seg, L, s * 31, s * 73, 4, team, s > 0 and 2 or nil)
				sofaSet(seating, seg, s * 58, 90.8, team)
				-- standing high-tops fill the far ends of the lounge (clear of the aisle at 78)
				highTop(seating, seg, s * 84, 86.5)
				highTop(seating, seg, s * 92, 91)
				-- potted plants either side of the escalators (between the opening and the bars,
				-- behind the walking lane; the leaves don't collide)
				local px = s * 11
				post(seating, seg, "Planter", px, 105.6, seg.floor, seg.floor + 1.8, 1.8, PLANTER, Enum.Material.Slate)
				BuildUtil.Ball(seating, {
					Name = "PlantLeaves",
					Position = at(seg, px, seg.floor + 3.3, 105.6).Position,
					Diameter = 3,
					Color = FOLIAGE,
					Material = Enum.Material.Grass,
					CanCollide = false,
				})
			end
			local welcome =
				span(seating, seg, "ClubFloorLogo", -10, 10, 96.5, 103.5, seg.floor, seg.floor + 0.08, team.Primary, Enum.Material.Carpet, {
					CanCollide = false,
					CastShadow = false,
					Turned = true,
				})
			write(welcome, Enum.NormalId.Top, "WELCOME TO THE " .. name .. " CLUB", ink(team.Primary, team), {
				Top = 0.3,
				Height = 0.4,
				Wrap = true,
			})
		elseif seg.kind == "corner" then
			drinkRail(seating, seg, L, 6, 30, 3, team, 2)
			sofaSet(seating, seg, 18, 91, team, { Armchairs = false })
			highTop(seating, seg, -18, 84.5)
			local logo =
				span(seating, seg, "ClubFloorLogo", -7, 7, 95, 103, seg.floor, seg.floor + 0.08, team.Primary, Enum.Material.Carpet, {
					CanCollide = false,
					CastShadow = false,
					Turned = true,
				})
			write(logo, Enum.NormalId.Top, "CLUB", ink(team.Primary, team), { Top = 0.2, Height = 0.6, Left = 0.1, Width = 0.8 })
		else
			for _, s in ipairs({ -1, 1 }) do
				drinkRail(seating, seg, L, s * 136, s * 164, 3, team, nil)
				sofaSet(seating, seg, s * 150, 91, team, { Armchairs = false })
			end
		end
	end

	-------------------------------------------------------------------------------------------
	-- 4 CLUB SCREENS
	-------------------------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 4)
	local screens = BuildUtil.Child(ctx, "ClubScreens")
	local cornerLive = { corner_hw = "record", corner_vw = "season", corner_ve = "titles", corner_he = "rating" }
	local cornerCase = {
		corner_hw = { "Signed Game Balls", "Footballs signed by (made-up) team legends after their biggest wins.", "record" },
		corner_vw = {
			"Club Members' Trophy",
			"Awarded every year to the loudest club member. This year's winner lost their voice!",
			"season",
		},
		corner_ve = { "Championship Rings", "A case of shiny championship rings. Win a title and yours goes here!", "titles" },
		corner_he = { "Golden Helmet", "A gold-painted helmet from the team's first ever game.", "team" },
	}
	-- what stands in each trophy case: { "ball" | "cup" | "ring", size, colour } either side of its middle
	local caseTrophies = {
		corner_hw = { { "ball", 0.9, FOOTBALL }, { "ball", 0.9, FOOTBALL } },
		corner_vw = { { "cup", 1, GOLD }, { "ball", 0.8, GOLD } },
		corner_ve = { { "ring", 0.8, GOLD }, { "ring", 0.8, GOLD } },
		corner_he = { { "ball", 1.4, GOLD }, { "ball", 0.9, FOOTBALL } },
	}
	for _, seg in ipairs(segs) do
		local fy = seg.floor
		if seg.kind == "end" then
			-- screens over the bars, a big double-sided screen over the buffet, CLUB signs, wall of fame
			for _, s in ipairs({ -1, 1 }) do
				local tv =
					span(screens, seg, "BarScreen", s * 16, s * 38, WALL_IN - 0.3, WALL_IN, fy + 6.8, fy + 10.6, SCREEN, nil, NO_COLLIDE)
				liveScreen(ctx, tv, TOWARD_FIELD, s < 0 and "score" or "gameday")
				local plate =
					span(screens, seg, "ClubSign", s * 50, s * 80, WALL_IN - 0.25, WALL_IN, fy + 6, fy + 10, team.Primary, nil, PAINT)
				write(plate, TOWARD_FIELD, name .. " CLUB", ink(team.Primary, team), { Glow = true, Top = 0.15, Height = 0.7 })
			end
			local big = span(screens, seg, "BuffetScreen", -7.5, 7.5, 86.4, 86.7, fy + 7.4, CEIL_BOTTOM, SCREEN, nil, NO_COLLIDE)
			liveScreen(ctx, big, OUTWARD, "summary", { PPS = 16 })
			liveScreen(ctx, big, TOWARD_FIELD, "score", { PPS = 16, Name = "Live_scoreField" })
			local fame =
				span(screens, seg, "WallOfFame", 84, 100, WALL_IN - 0.2, WALL_IN, fy + 2.2, fy + 9.4, WALNUT, Enum.Material.Wood, PAINT)
			write(fame, TOWARD_FIELD, "CLUB WALL OF FAME", GOLD, { Top = 0.06, Height = 0.16, Font = Enum.Font.GothamBold })
			write(
				fame,
				TOWARD_FIELD,
				"FIRST GAME  -  FIRST WIN  -  FIRST TITLE\nEVERY BIG MOMENT OF THE CLUB",
				CREAM,
				{ Name = "FameLines", Top = 0.32, Height = 0.4, Font = Enum.Font.Gotham, Wrap = true }
			)
			BuildUtil.Look(
				fame,
				"Club Wall of Fame",
				"Photos of every big moment in club history: the first game, the first win... and the first title (still waiting?).",
				{ LookKey = "titles", Distance = 8 }
			)
			-- its twin at the other end of the lounge
			local fans =
				span(screens, seg, "FanWall", -100, -84, WALL_IN - 0.2, WALL_IN, fy + 2.2, fy + 9.4, WALNUT, Enum.Material.Wood, PAINT)
			write(fans, TOWARD_FIELD, "FAN OF THE GAME", GOLD, { Top = 0.06, Height = 0.16, Font = Enum.Font.GothamBold })
			write(fans, TOWARD_FIELD, "THIS WEEK'S LOUDEST CLUB MEMBER\nCOULD BE YOU!", CREAM, {
				Name = "FanLines",
				Top = 0.32,
				Height = 0.4,
				Font = Enum.Font.Gotham,
				Wrap = true,
			})
			BuildUtil.Look(
				fans,
				"Fan of the Game",
				"Every game day the loudest club member gets their photo up here. Cheer loud enough and it could be you!",
				{ Distance = 8 }
			)
		elseif seg.kind == "corner" then
			local tv = span(screens, seg, "BarScreen", -12, 12, WALL_IN - 0.3, WALL_IN, fy + 6.8, fy + 10.6, SCREEN, nil, NO_COLLIDE)
			liveScreen(ctx, tv, TOWARD_FIELD, cornerLive[seg.name])
			local info = cornerCase[seg.name]
			local case = span(screens, seg, "TrophyCase", 26, 34, 104.8, WALL_IN, fy, fy + 6.4, GLASS_TINT, Enum.Material.Glass, {
				Transparency = 0.45,
			})
			span(screens, seg, "TrophyShelf", 26.3, 33.7, 105, 107, fy + 3, fy + 3.2, GOLD, Enum.Material.Metal, PAINT)
			-- (the prompt sits on the glass front: the trophies inside would hide the case's middle)
			BuildUtil.Look(case, info[1], info[2], { LookKey = info[3], Distance = 8, At = Vector3.new(0, 0.4, 1.25) })
			-- what's on the shelf (either side of the middle, where the case's prompt is)
			for index, item in ipairs(caseTrophies[seg.name]) do
				local kind, size, color = item[1], item[2], item[3]
				local x, base = index == 1 and 27.9 or 32.1, fy + 3.2
				local material = color == FOOTBALL and Enum.Material.Leather or Enum.Material.Metal
				if kind == "ball" then
					BuildUtil.Ball(screens, {
						Name = "Trophy",
						Position = at(seg, x, base + size / 2, 106).Position,
						Diameter = size,
						Color = color,
						Material = material,
						CanCollide = false,
					})
				elseif kind == "cup" then
					post(screens, seg, "TrophyCup", x, 106, base, base + 1.5, size, color, material, NO_COLLIDE)
				else
					rod(screens, seg, "TrophyRing", x, base + size / 2, 106, 0.22, size, "o", color, material, NO_COLLIDE)
				end
			end
		else
			for _, s in ipairs({ -1, 1 }) do
				local tv = span(
					screens,
					seg,
					"LoungeScreen",
					s * 140,
					s * 160,
					WALL_IN - 0.3,
					WALL_IN,
					fy + 5.6,
					fy + 10.4,
					SCREEN,
					nil,
					NO_COLLIDE
				)
				liveScreen(ctx, tv, TOWARD_FIELD, s < 0 and "summary" or "season", { PPS = 16 })
			end
		end
	end
end

---------------------------------------------------------------------------------------------
-- SUITES
---------------------------------------------------------------------------------------------

local SUITE_INFO = {
	{ "Hall of Fame Suite", "Signed footballs from (made-up) legends line the walls. The comfy seats look right down at the goal line!" },
	{ "Rookie Suite", "The cheapest suite in the house - but the popcorn is just as good!" },
	{ "Legends Suite", "Old game balls and team photos everywhere. Rumour says a famous kicker carved his initials in the mini-bar." },
	{
		"Owner's Suite",
		"The best seats in the stadium, right next to the coaches' booth near midfield. Only the owner gets the big gold chair!",
	},
	{ "Family Suite", "Kid-sized seats and a never-ending popcorn supply. Perfect for game day with the whole family." },
	{ "Sponsors' Suite", "Fancy snacks for the team's partners. They clap politely after every touchdown." },
	{ "Kicker's Corner Suite", "Right in line with the goal posts - perfect for judging field goals!" },
	{ "Tailgate Suite", "Grill-themed decor and a menu of hot dogs, burgers and nachos." },
	{ "Champions Suite", "The walls are covered in championship banners. Room for a few more!" },
	{ "Rivals Suite", "The visiting team's VIPs watch from here. Be nice... they lose a lot!" },
	{ "Alumni Suite", "Former players come back to watch and tell stories about the good old days." },
	{ "Coaches' Club Suite", "Retired coaches watch the game here and shout plays at the TV." },
	{ "Mascot Suite", "The team mascot naps here at half-time. Shh!" },
	{ "Super Fan Suite", "Face paint, foam fingers and the loudest fans in the building. Bring earplugs!" },
}

-- The framed jersey on each suite's wall (by suite number), in the suite's own theme.
local SUITE_JERSEYS = {
	"HALL OF FAME\n#10",
	"ROOKIE\n#99",
	"LEGEND\n#12",
	"OWNER\n#1",
	"FAMILY\n#4",
	"PARTNER\n#50",
	"KICKER\n#3",
	"GRILL MASTER\n#88",
	"CHAMPS\n#1",
	"VISITOR\n#0",
	"ALUMNI\n#21",
	"COACH\n#00",
	"MASCOT\n#7",
	"SUPER FAN\n#12",
}

-- Captions of the framed photos on the corridor wall, one beside every suite's number sign.
local CORRIDOR_PHOTOS = {
	"OPENING DAY",
	"FIRST TOUCHDOWN",
	"THE GOAL-LINE STAND",
	"TITLE PARADE",
	"ROOKIE DEBUT",
	"THE 60-YARD FIELD GOAL",
	"THE SNOW GAME",
	"TAILGATE PARTY",
	"THE ONE-HANDED CATCH",
	"OVERTIME WINNER",
	"HOMECOMING",
	"THE BIG COMEBACK",
	"MASCOT DANCE-OFF",
	"FIRST SELL-OUT",
}

-- The suites of one side: list of { s, a, b (block), xa, xb (interior), big } sorted by world x.
local function sideSuites(L, sideName)
	local seg = Bowl.Segment(L, sideName, 0, 0)
	local list = {}
	for _, blockSpec in ipairs(SUITE_BLOCKS[sideName]) do
		local a, b, count = blockSpec[1], blockSpec[2], blockSpec[3]
		for _, s in ipairs({ -1, 1 }) do
			local ba, bb = s > 0 and a or -b, s > 0 and b or -a
			local A, B = ba + WALL_T, bb - WALL_T
			local w = (B - A - WALL_T * (count - 1)) / count
			for index = 1, count do
				local xa = A + (index - 1) * (w + WALL_T)
				table.insert(list, {
					s = s,
					blockA = ba,
					blockB = bb,
					xa = xa,
					xb = xa + w,
					big = count == 1,
					worldX = (seg.cframe * CFrame.new(xa + w / 2, 0, 0)).Position.X,
				})
			end
		end
	end
	table.sort(list, function(p, q)
		return p.worldX < q.worldX
	end)
	return list
end

-- The suite blocks of one side: list of { a, b, count } in segment x.
local function sideBlocks(sideName)
	local list = {}
	for _, blockSpec in ipairs(SUITE_BLOCKS[sideName]) do
		local a, b, count = blockSpec[1], blockSpec[2], blockSpec[3]
		table.insert(list, { -b, -a, count })
		table.insert(list, { a, b, count })
	end
	return list
end

-- The doorway of a suite: 6 wide, 1.5 from its +x wall (the leaf swings against that wall).
local function suiteDoorway(suite)
	return suite.xb - 7.5, suite.xb - 1.5
end

function M.suites(ctx)
	local L = ctx.config.Layout
	local team = ctx.colors
	local name = teamLabel(ctx)
	local segs = ring(L)
	local sides = { segs.home, segs.visitor }

	-- number the suites round the two sides (home 1..6, visitor 7..14)
	local suitesOf = {}
	local number = 0
	for _, seg in ipairs(sides) do
		suitesOf[seg.name] = sideSuites(L, seg.name)
		for _, suite in ipairs(suitesOf[seg.name]) do
			number += 1
			suite.n = number
		end
	end
	-- the two big home suites: the owner's (west of the press box) and the legends'
	for _, suite in ipairs(suitesOf.home) do
		if suite.big then
			suite.owner = suite.worldX > 0
		end
	end

	-------------------------------------------------------------------------------------------
	-- 1 SUITE CORRIDOR
	-------------------------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 1)
	for _, seg in ipairs(sides) do
		local c = BuildUtil.Child(ctx, "SuiteCorridor_" .. seg.name)
		local fy = seg.floor
		local home = seg.name == "home"
		-- ceilings: the corridor + the room row (not over the press box / booth / coaches' booths)
		span(c, seg, "CorridorCeiling", -LOUNGE_X, LOUNGE_X, BACK_OUT, WALL_IN, CEIL_BOTTOM, CEIL_TOP, CEILING)
		for _, s in ipairs({ -1, 1 }) do
			if home then
				span(c, seg, "PassageCeiling", s * PRESS_HALF, s * COACH_A, FRONT_IN, BACK_OUT, CEIL_BOTTOM, CEIL_TOP, CEILING)
				span(c, seg, "SuiteRowCeiling", s * COACH_B, s * LOUNGE_X, FRONT_IN, BACK_OUT, CEIL_BOTTOM, CEIL_TOP, CEILING)
			else
				span(c, seg, "SuiteRowCeiling", s * PRESS_HALF, s * LOUNGE_X, FRONT_IN, BACK_OUT, CEIL_BOTTOM, CEIL_TOP, CEILING)
			end
		end
		lightStrip(c, seg, -132, 132, 98.4, 11, 24, 1.3)
		lightStrip(c, seg, -132, 132, 102.6, 9, 24, 1.2)
		-- carpet with a team stripe down the middle
		span(c, seg, "CorridorCarpet", -LOUNGE_X, LOUNGE_X, BACK_OUT, WALL_IN, fy, fy + 0.05, CARPET, Enum.Material.Carpet, PAINT)
		span(c, seg, "CorridorStripe", -LOUNGE_X, LOUNGE_X, 99.6, 100.4, fy + 0.05, fy + 0.08, team.Primary, Enum.Material.Carpet, PAINT)
		-- the corridor wall along every block, with a doorway per suite
		for _, blockSpec in ipairs(sideBlocks(seg.name)) do
			local doors = {}
			for _, suite in ipairs(suitesOf[seg.name]) do
				if suite.xa > blockSpec[1] and suite.xb < blockSpec[2] then
					local d0, d1 = suiteDoorway(suite)
					table.insert(doors, { d0, d1 })
				end
			end
			table.sort(doors, function(p, q)
				return p[1] < q[1]
			end)
			backWall(c, seg, "CorridorWall", blockSpec[1], blockSpec[2], fy, doors, WALL_LIGHT)
		end
		-- a framed photo on the corridor wall beside every suite's number sign (which hangs at
		-- d0 - 4.4 .. d0 - 0.8, in step 3), out in the free stretch toward the suite's -x wall
		for _, suite in ipairs(suitesOf[seg.name]) do
			local x0, x1 = suite.xa + 1, suiteDoorway(suite) - 5.4
			local half = math.min(x1 - x0, suite.big and 9 or 5.6) / 2
			local xc = (x0 + x1) / 2
			local photo = span(
				c,
				seg,
				"CorridorPhoto",
				xc - half,
				xc + half,
				BACK_OUT,
				BACK_OUT + 0.12,
				fy + 4.4,
				fy + 8.2,
				WALNUT,
				Enum.Material.Wood,
				NO_COLLIDE
			)
			picture(photo, OUTWARD, CORRIDOR_PHOTOS[suite.n], PHOTO_TONES[suite.n % #PHOTO_TONES + 1])
		end
		-- wood panelling along the outer wall + SUITE LEVEL panels either side of the escalators
		for _, s in ipairs({ -1, 1 }) do
			span(c, seg, "WallPanelling", s * 10, s * 132, WALL_IN - 0.15, WALL_IN, fy, fy + 3.6, DARK_WOOD, Enum.Material.Wood, PAINT)
			local panel =
				span(c, seg, "SuiteLevelPanel", s * 12, s * 34, WALL_IN - 0.25, WALL_IN, fy + 4.6, fy + 9.6, team.Primary, nil, PAINT)
			local wing = {}
			for _, suite in ipairs(suitesOf[seg.name]) do
				if suite.s == s then
					table.insert(wing, suite.n)
				end
			end
			table.sort(wing)
			local text = ("SUITES %d - %d"):format(wing[1], wing[#wing])
			write(panel, TOWARD_FIELD, "LUXURY " .. text, ink(team.Primary, team), { Top = 0.14, Height = 0.4, Glow = true })
			write(panel, TOWARD_FIELD, name .. " SUITE LEVEL", ink(team.Primary, team), {
				Name = "SuiteLevel",
				Top = 0.6,
				Height = 0.26,
				Font = Enum.Font.GothamBold,
			})
			BuildUtil.Look(
				panel,
				"Luxury " .. text:sub(1, 1) .. text:sub(2):lower(),
				"Private boxes with comfy seats, a mini-bar and a TV, right above the club seats. Each suite has its own door off this corridor.",
				{ Distance = 9 }
			)
			-- a photo wall further along (look)
			local photos =
				span(c, seg, "PhotoWall", s * 86, s * 118, WALL_IN - 0.2, WALL_IN, fy + 4.2, fy + 9.4, WALNUT, Enum.Material.Wood, PAINT)
			write(photos, TOWARD_FIELD, name .. " THROUGH THE YEARS", GOLD, { Top = 0.06, Height = 0.2, Font = Enum.Font.GothamBold })
			write(photos, TOWARD_FIELD, "FIRST KICKOFF   -   FIRST TOUCHDOWN   -   FIRST SELL-OUT", CREAM, {
				Name = "PhotoCaptions",
				Top = 0.72,
				Height = 0.14,
				Font = Enum.Font.Gotham,
			})
			BuildUtil.Look(
				photos,
				home and "Team History Photos" or "Great Plays Photos",
				home
						and "Old photos of the team's first kickoff, first touchdown and first sold-out game. Look how tiny the stadium was back then!"
					or "Famous plays frozen in time: a one-handed catch, a goal-line stand and a 60-yard field goal.",
				{ LookKey = "season", Distance = 9 }
			)
			-- an overhead sign across the corridor (non-collidable, high above heads)
			local x = s * 60
			local over = span(c, seg, "OverheadSign", x - 0.2, x + 0.2, 97.4, 105.8, fy + 8.6, CEIL_BOTTOM, SIGN_DARK, nil, NO_COLLIDE)
			local out = {}
			local back = {}
			for _, suite in ipairs(suitesOf[seg.name]) do
				if suite.s == s then
					-- (sorted by where the suite's DOOR is: that is what people walk to)
					local d0, d1 = suiteDoorway(suite)
					if (d0 + d1) / 2 * s > 60 then
						table.insert(out, suite.n)
					else
						table.insert(back, suite.n)
					end
				end
			end
			table.sort(out)
			table.sort(back)
			local function listText(numbers, last)
				if #numbers == 0 then
					return last
				end
				return ("SUITES %d - %d\n%s"):format(numbers[1], numbers[#numbers], last)
			end
			-- readers walking away from the middle see the face whose normal points to the middle
			local towardMiddle = s > 0 and Enum.NormalId.Left or Enum.NormalId.Right
			local towardEnd = s > 0 and Enum.NormalId.Right or Enum.NormalId.Left
			write(over, towardMiddle, listText(out, "CLUB LOUNGE"), WHITE, { Glow = true, Wrap = true, Top = 0.1, Height = 0.8 })
			write(over, towardEnd, listText(back, home and "PRESS BOX" or "TV BOOTH"), WHITE, {
				Name = "OverheadBack",
				Glow = true,
				Wrap = true,
				Top = 0.1,
				Height = 0.8,
			})
		end
	end

	-------------------------------------------------------------------------------------------
	-- 2 GLASS FRONTS
	-------------------------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 2)
	for _, seg in ipairs(sides) do
		local c = BuildUtil.Child(ctx, "SuiteFronts_" .. seg.name)
		local fy = seg.floor
		for index, blockSpec in ipairs(sideBlocks(seg.name)) do
			local a, b = blockSpec[1], blockSpec[2]
			local header = glassFront(c, seg, a, b, fy, team.Secondary, team.Primary)
			write(header, TOWARD_FIELD, name .. " SUITES", ink(team.Primary, team), {
				Name = "SuitesSign" .. index,
				Left = 0.2,
				Width = 0.6,
				Top = 0.16,
				Height = 0.68,
				PPS = 20,
			})
			span(c, seg, "SuiteEndWall", a, a + WALL_T, FRONT_IN, BACK_IN, fy, CEIL_BOTTOM, WALL_LIGHT)
			span(c, seg, "SuiteEndWall", b - WALL_T, b, FRONT_IN, BACK_IN, fy, CEIL_BOTTOM, WALL_LIGHT)
		end
		for _, suite in ipairs(suitesOf[seg.name]) do
			-- divider on the suite's +x side (unless that is the block's end wall)
			if suite.xb < suite.blockB - WALL_T - 0.05 then
				span(c, seg, "SuiteDivider", suite.xb, suite.xb + WALL_T, FRONT_IN, BACK_IN, fy, CEIL_BOTTOM, WALL_LIGHT)
			end
			if suite.big then
				local mid = (suite.xa + suite.xb) / 2
				span(
					c,
					seg,
					"GlassMullion",
					mid - 0.2,
					mid + 0.2,
					FRONT_OUT - 0.05,
					FRONT_IN,
					SILL_TOP,
					GLASS_TOP,
					STEEL,
					Enum.Material.Metal
				)
			end
			local d0, d1 = suiteDoorway(suite)
			local info = SUITE_INFO[suite.n]
			local color = suite.owner and DARK_WOOD or WOOD
			local door = roomDoor(c, seg, d0, d1, fy, {
				Name = "SuiteDoor",
				Color = color,
				Material = Enum.Material.Wood,
				Object = "Suite " .. suite.n,
				Title = "Suite " .. suite.n .. " - The " .. info[1],
				Info = info[2],
				LookKey = suite.owner and "owner" or nil,
			})
			doorText(door, { "SUITE " .. suite.n }, GOLD, nil)
		end
	end

	-------------------------------------------------------------------------------------------
	-- 3 SUITE INTERIORS & SIGNS
	-------------------------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 3)
	for _, seg in ipairs(sides) do
		local fy = seg.floor
		local carpets = BuildUtil.Child(ctx, "SuiteCarpets_" .. seg.name)
		local blocks = sideBlocks(seg.name)
		for _, s in ipairs({ -1, 1 }) do
			-- one carpet per half (it runs on under the walls and the passage between the blocks)
			local first, last = SUITE_BLOCKS[seg.name][1], SUITE_BLOCKS[seg.name][#SUITE_BLOCKS[seg.name]]
			span(
				carpets,
				seg,
				"SuiteCarpet",
				s * (first[1] + WALL_T),
				s * (last[2] - WALL_T),
				FRONT_IN,
				BACK_IN,
				fy,
				fy + 0.05,
				SUITE_CARPET,
				Enum.Material.Carpet,
				PAINT
			)
		end
		-- a cove light along every block with a PointLight over each suite
		for _, blockSpec in ipairs(blocks) do
			local strip = span(
				carpets,
				seg,
				"SuiteCeilingLight",
				blockSpec[1] + WALL_T,
				blockSpec[2] - WALL_T,
				87.7,
				88.3,
				CEIL_BOTTOM - 0.15,
				CEIL_BOTTOM,
				LAMP,
				Enum.Material.Neon,
				PAINT
			)
			for _, suite in ipairs(suitesOf[seg.name]) do
				if suite.xa > blockSpec[1] and suite.xb < blockSpec[2] then
					local attachment = Instance.new("Attachment")
					attachment.Name = "LightAt"
					attachment.Position = Vector3.new((suite.xa + suite.xb) / 2 - (blockSpec[1] + blockSpec[2]) / 2, -0.4, 0)
					attachment.Parent = strip
					BuildUtil.Light(attachment, "PointLight", { Name = "SuiteLight", Range = 24, Brightness = 1.5, Color = WARM_LIGHT })
				end
			end
		end
		for _, suite in ipairs(suitesOf[seg.name]) do
			local c = BuildUtil.Child(ctx, "Suite" .. suite.n)
			local xa, xb = suite.xa, suite.xb
			local xm = (xa + xb) / 2
			local info = SUITE_INFO[suite.n]
			local title = "Suite " .. suite.n .. " - The " .. info[1]
			-- number sign beside the door (corridor side, non-collidable: the lane stays clear)
			local d0 = suiteDoorway(suite)
			local plate =
				span(c, seg, "SuiteSign", d0 - 4.4, d0 - 0.8, BACK_OUT, BACK_OUT + 0.12, fy + 5.4, fy + 7.8, team.Primary, nil, NO_COLLIDE)
			write(plate, OUTWARD, suite.owner and "OWNER'S SUITE" or ("SUITE " .. suite.n), ink(team.Primary, team), {
				Glow = true,
				Top = 0.16,
				Height = 0.68,
			})
			BuildUtil.Look(plate, title, info[2], { LookKey = suite.owner and "owner" or nil, Distance = 8 })
			-- stadium chairs at the glass (the middle one is the suite's TV camera seat); the two
			-- big suites get a row of five
			local spots = suite.big and { -4.8, -2.4, 0, 2.4, 4.8 } or { -2.4, 0, 2.4 }
			local middle = (#spots + 1) / 2
			for index, dx in ipairs(spots) do
				BuildUtil.Seat(c, {
					Name = "SuiteChair",
					Size = Vector3.new(2, 1.8, 1.8),
					CFrame = at(seg, xm + dx, fy + 0.9, 82.5) * TURN,
					Color = team.Primary,
					Material = Enum.Material.Fabric,
					Object = "Suite Seat",
					NoPrompt = index ~= middle,
					Camera = index == middle and fieldView(L, seg, xm, fy + 8, 74, 52, "SUITE " .. suite.n .. " - LIVE") or nil,
				})
			end
			local backHalf = spots[#spots] + 1
			span(c, seg, "ChairBacks", xm - backHalf, xm + backHalf, 83.4, 83.8, fy + 1.8, fy + 4.2, team.Primary, Enum.Material.Fabric)
			-- sofa facing the field, live score TV on the -x wall, mini-bar in the -x back corner
			chair(c, seg, xa + 4.8, 89.5, fy, "field", suite.owner and LEATHER or team.Secondary, {
				Width = 7,
				Depth = 2.6,
				SeatHeight = 1.6,
				BackHeight = 2,
				Name = "Sofa",
				Object = "Sofa",
				Material = suite.owner and Enum.Material.Leather or Enum.Material.Fabric,
			})
			-- (the TV hangs on a walnut media wall with the suite's name in brass letters over it; a team
			-- rug under the sofa)
			local media = span(c, seg, "MediaWall", xa, xa + 0.12, 83.2, 91.2, fy, fy + 8.6, WALNUT, Enum.Material.Wood, PAINT)
			write(media, Enum.NormalId.Right, string.upper(info[1]), GOLD, {
				Name = "SuiteName",
				Font = Enum.Font.GothamBold,
				Left = 0.08,
				Width = 0.84,
				Top = 0.07,
				Height = 0.11,
			})
			local tv = span(c, seg, "SuiteTV", xa + 0.12, xa + 0.42, 84.6, 89.8, fy + 3.6, fy + 6.6, SCREEN)
			liveScreen(ctx, tv, Enum.NormalId.Right, "score", { PPS = 30 })
			span(c, seg, "SuiteRug", xa + 0.8, xa + 9.2, 85.8, 91.6, fy + 0.05, fy + 0.08, team.Primary, Enum.Material.Carpet, PAINT)
			local popcorn = suite.n % 3 == 2 and not suite.owner
			local miniBar = span(c, seg, "MiniBar", xa + 0.2, xa + 5.2, 93.5, BACK_IN, fy, fy + 3.4, DARK_WOOD, Enum.Material.Wood)
			BuildUtil.Use(ctx, miniBar, popcorn and "popcorn" or "soda", {
				Object = popcorn and "Popcorn Bar" or "Mini-Bar",
				Title = popcorn and "Suite Popcorn Bar" or "Suite Mini-Bar",
				Info = popcorn and "Fresh, buttery popcorn - free for suite guests!"
					or "Ice-cold sodas in a mini fridge. Cheers to the home team!",
				-- (on its front: the mini fridge beside it would hide its middle from the door)
				At = Vector3.new(0, 0.6, 0.9),
				Distance = 7,
			})
			-- what's inside, in brass letters along the top of its front
			write(miniBar, TOWARD_FIELD, popcorn and "HOT POPCORN" or "COLD SODAS", GOLD, {
				Name = "MiniBarSign",
				Font = Enum.Font.GothamBold,
				Left = 0.12,
				Width = 0.76,
				Top = 0.07,
				Height = 0.17,
			})
			-- a glass-door mini fridge full of drinks beside the mini-bar (the owner's suite has its
			-- popcorn machine there) and a framed jersey on the +x wall, clear of the door's swing
			if not suite.owner then
				local fx = xa + 5.4
				local fridge = span(c, seg, "MiniFridge", fx, fx + 1.5, 93.7, BACK_IN, fy, fy + 3, BRUSHED, Enum.Material.Metal)
				bottleRows(fridge, TOWARD_FIELD, { { 0.5, 1.25 }, { 1.6, 2.35 } }, {
					Spacing = 0.42,
					Inset = 0.12,
					Seed = suite.n,
					Panel = FRIDGE_GLASS,
				})
			end
			local jersey = span(c, seg, "FramedJersey", xb - 0.12, xb, 82.2, 86.8, fy + 3.6, fy + 8.2, DARK_WOOD, Enum.Material.Wood, PAINT)
			write(jersey, Enum.NormalId.Left, SUITE_JERSEYS[suite.n], ink(team.Primary, team), {
				Name = "Jersey",
				Background = team.Primary,
				Left = 0.1,
				Width = 0.8,
				Top = 0.08,
				Height = 0.84,
				Wrap = true,
			})
			if suite.big then
				span(c, seg, "CoffeeTable", xa + 2.6, xa + 7, 86.4, 87.8, fy, fy + 1.3, WALNUT, Enum.Material.Wood)
				if suite.owner then
					chair(c, seg, xm + 8, 84, fy, "field", LEATHER, {
						Width = 3,
						Depth = 2.8,
						SeatHeight = 1.8,
						BackHeight = 3.4,
						Name = "OwnersChair",
						Object = "Owner's Chair",
						Material = Enum.Material.Leather,
						BackColor = GOLD,
						Camera = fieldView(L, seg, xm, fy + 10, 72, 45, "OWNER'S BOX"),
					})
					local machine = span(c, seg, "PopcornMachine", xa + 6, xa + 8.4, 93.3, BACK_IN, fy, fy + 4.2, POPCORN_RED)
					BuildUtil.Use(ctx, machine, "popcorn", {
						Object = "Popcorn Machine",
						Title = "Owner's Popcorn Machine",
						Info = "The owner's personal popcorn machine. Extra butter!",
						Distance = 6,
					})
					local goldBall = BuildUtil.Ball(c, {
						Name = "GoldenFootball",
						Position = at(seg, xa + 4.8, fy + 1.75, 87.1).Position,
						Diameter = 0.9,
						Color = GOLD,
						Material = Enum.Material.Metal,
					})
					BuildUtil.Look(
						goldBall,
						"Golden Football",
						"A gold-painted game ball from the stadium's very first sell-out. Only the owner is allowed to polish it!",
						{ LookKey = "owner", Distance = 7 }
					)
				else
					chair(c, seg, xm + 8, 84, fy, "field", WALNUT, {
						Width = 3,
						Depth = 2.8,
						SeatHeight = 1.8,
						BackHeight = 3,
						Name = "Recliner",
						Object = "Legends Recliner",
						Material = Enum.Material.Leather,
						Camera = fieldView(L, seg, xm, fy + 10, 72, 48, "LEGENDS SUITE - LIVE"),
					})
					local case =
						span(c, seg, "SignedBallCase", xa + 7, xa + 11, 93.6, BACK_IN, fy, fy + 5.6, GLASS_TINT, Enum.Material.Glass, {
							Transparency = 0.4,
						})
					BuildUtil.Look(
						case,
						"Signed Football Case",
						"Every football in here was signed by a team captain. The oldest one is older than your grandpa!",
						{ LookKey = "roster:QB", Distance = 7 }
					)
					-- two of the signed balls on a shelf, either side of the case's middle (its prompt)
					span(c, seg, "BallShelf", xa + 7.3, xa + 10.7, 93.9, 95, fy + 2.2, fy + 2.35, WALNUT, Enum.Material.Wood, PAINT)
					for _, dx in ipairs({ 7.95, 10.05 }) do
						BuildUtil.Ball(c, {
							Name = "SignedBall",
							Position = at(seg, xa + dx, fy + 2.75, 94.7).Position,
							Diameter = 0.8,
							Color = FOOTBALL,
							Material = Enum.Material.Leather,
							CanCollide = false,
						})
					end
				end
			end
		end
	end
end

---------------------------------------------------------------------------------------------
-- PRESS BOX (home side, centre)
---------------------------------------------------------------------------------------------

local PRESS_NAMES = {
	"CITY HERALD",
	"GRIDIRON DAILY",
	"KICKOFF RADIO",
	"SPORTS WIRE",
	"PIGSKIN GAZETTE",
	"BLITZ TV",
	"MORNING HUDDLE",
	"TOUCHDOWN TIMES",
}

function M.pressbox(ctx)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local team = ctx.colors
	local name = teamLabel(ctx)
	local seg = ring(L).home
	local fy = seg.floor
	local inner = PRESS_HALF - WALL_T -- 22: inner face of the side walls
	local doorHalf = 4

	-------------------------------------------------------------------------------------------
	-- 1 PRESS BOX SHELL
	-------------------------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 1)
	local shell = BuildUtil.Child(ctx, "PressBoxShell")
	for _, s in ipairs({ -1, 1 }) do
		local wall = span(shell, seg, "PressSideWall", s * inner, s * PRESS_HALF, FRONT_IN, BACK_IN, fy, CEIL_BOTTOM, team.Primary)
		write(wall, s > 0 and Enum.NormalId.Right or Enum.NormalId.Left, "PRESS", ink(team.Primary, team), {
			Left = 0.2,
			Width = 0.6,
			Top = 0.3,
			Height = 0.2,
		})
	end
	local lintel = backWall(shell, seg, "PressBackWall", -PRESS_HALF, PRESS_HALF, fy, { { -doorHalf, doorHalf } }, team.Primary)
	write(
		lintel,
		OUTWARD,
		name .. " PRESS BOX",
		ink(team.Primary, team),
		{ Left = 0.3, Width = 0.4, Top = 0.12, Height = 0.76, Glow = true }
	)
	local header = glassFront(shell, seg, -PRESS_HALF, PRESS_HALF, fy, team.Primary, team.Secondary)
	write(header, TOWARD_FIELD, "PRESS BOX", ink(team.Secondary, team), { Left = 0.3, Width = 0.4, Top = 0.12, Height = 0.76 })
	for _, x in ipairs({ -11, 11 }) do
		span(shell, seg, "Mullion", x - 0.2, x + 0.2, FRONT_OUT - 0.05, FRONT_IN, SILL_TOP, GLASS_TOP, STEEL, Enum.Material.Metal)
	end
	span(shell, seg, "PressCeiling", -PRESS_HALF, PRESS_HALF, FRONT_IN, BACK_OUT, CEIL_BOTTOM, CEIL_TOP, CEILING)
	span(shell, seg, "PressCarpet", -inner, inner, FRONT_IN, BACK_IN, fy, fy + 0.05, CARPET, Enum.Material.Carpet, PAINT)
	lightStrip(shell, seg, -19, 19, 84.5, 3, 22, 1.4)
	lightStrip(shell, seg, -19, 19, 92, 3, 22, 1.3)
	-- sliding glass doors: open leaves never block the walkway behind the second row
	local door = roomDoor(shell, seg, -doorHalf, doorHalf, fy, {
		Name = "PressBoxDoor",
		Double = true,
		Slide = true,
		Color = GLASS_TINT,
		Material = Enum.Material.Glass,
		Transparency = 0.35,
		Object = "Press Box",
		Title = "Press Box",
		Info = "Reporters only! Well... and team owners. The rule up here: NO CHEERING in the press box!",
	})
	doorText(door, { "PRESS", "BOX" }, ink(team.Primary, team), team.Primary)
	-- framed press photos either side of the door, facing the corridor (the first thing fans see
	-- coming up the Gate D escalators)
	for index, s in ipairs({ -1, 1 }) do
		local photo = span(
			shell,
			seg,
			"PressPhoto",
			s * 8.5,
			s * 16.5,
			BACK_OUT,
			BACK_OUT + 0.12,
			fy + 3.4,
			fy + 7.2,
			WALNUT,
			Enum.Material.Wood,
			NO_COLLIDE
		)
		picture(photo, OUTWARD, index == 1 and "OPENING DAY PRESS CONFERENCE" or "THE WINNING HEADLINE", PHOTO_TONES[index + 1])
	end
	local rules = span(shell, seg, "PressRules", -inner, -inner + 0.15, 84.5, 89.5, fy + 3.4, fy + 7.4, CREAM, nil, PAINT)
	write(rules, Enum.NormalId.Right, "PRESS BOX RULES\n1. NO CHEERING\n2. NO AUTOGRAPHS\n3. SNACKS ARE FREE", INK, {
		Font = Enum.Font.GothamBold,
		Wrap = true,
		Top = 0.08,
		Height = 0.84,
	})
	BuildUtil.Look(
		rules,
		"Press Box Rules",
		"Real press boxes have a famous rule: no cheering! Reporters have to stay calm... even after a 99-yard touchdown.",
		{ Distance = 8 }
	)
	-- a team-colour runner from the door down the centre aisle (between the front-row chairs at
	-- +-3.5), and a framed front page over the copier on the +x wall
	span(shell, seg, "AisleRunner", -2.4, 2.4, 83.4, BACK_IN, fy + 0.05, fy + 0.08, team.Primary, Enum.Material.Carpet, PAINT)
	span(shell, seg, "FrontPageFrame", inner - 0.12, inner, 88.6, 93.4, fy + 4.2, fy + 8.2, DARK_WOOD, Enum.Material.Wood, PAINT)
	local frontPage = span(shell, seg, "FrontPage", inner - 0.16, inner - 0.12, 88.85, 93.15, fy + 4.45, fy + 7.95, PAPER, nil, PAINT)
	write(frontPage, Enum.NormalId.Left, "THE PIGSKIN GAZETTE", INK, { Top = 0.05, Height = 0.14, Font = Enum.Font.Garamond })
	write(frontPage, Enum.NormalId.Left, name .. "\nWIN THE OPENER!", INK, {
		Name = "Headline",
		Top = 0.24,
		Height = 0.4,
		Wrap = true,
	})
	BuildUtil.Look(
		frontPage,
		"Framed Front Page",
		"The newspaper from the team's very first win, framed by the reporters who wrote it. Their record since then:",
		{ LookKey = "record", Distance = 8 }
	)

	-------------------------------------------------------------------------------------------
	-- 2 PRESS ROW
	-------------------------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 2)
	local room = BuildUtil.Child(ctx, "PressRow")
	-- the long desk at the window (turned: its Top face reads from the reporters' side)
	local desk = span(room, seg, "PressDesk", -21, 21, 80.8, 83.2, fy + 2.6, fy + 2.9, WOOD, Enum.Material.Wood, { Turned = true })
	span(room, seg, "PressDeskPanel", -21, 21, 80.8, 81.2, fy, fy + 2.6, DARK_WOOD, Enum.Material.Wood)
	local plates = Instance.new("SurfaceGui")
	plates.Name = "Nameplates"
	plates.Face = Enum.NormalId.Top
	plates.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	plates.PixelsPerStud = 20
	plates.LightInfluence = 1 -- (paper name cards, lit like the desk: not glowing)
	plates.Parent = desk
	local rowLives = { "score", "record", "season", "gameday", "rating", "titles" }
	for index, x in ipairs({ -17.5, -10.5, -3.5, 3.5, 10.5, 17.5 }) do
		-- nameplate near the reporter's edge (the turned desk's face runs from +21 on the left)
		local plate = Instance.new("TextLabel")
		plate.Name = "Nameplate"
		plate.BackgroundColor3 = PAPER
		plate.BorderSizePixel = 0
		plate.Size = UDim2.new(3.6 / 42, 0, 0.5 / 2.4, 0)
		plate.Position = UDim2.new((21 - x - 1.8) / 42, 0, 0.7, 0)
		plate.Font = Enum.Font.GothamBold
		plate.Text = PRESS_NAMES[index]
		plate.TextColor3 = INK
		plate.TextScaled = true
		plate.Parent = plates
		local monitor = span(room, seg, "Monitor", x - 1.3, x + 1.3, 81.5, 81.8, fy + 2.9, fy + 4.1, SCREEN)
		liveScreen(ctx, monitor, OUTWARD, rowLives[index], { PPS = 40 })
		chair(room, seg, x, 84.9, fy, "field", LEATHER, {
			BackColor = team.Primary,
			Material = Enum.Material.Leather,
			Object = "Press Row Seat",
			-- (just in front of the roof visor, 75.4..80 from y 63.8, so the view never starts inside it)
			Camera = fieldView(L, seg, x * 0.6, fy + 8.6, 75, 50, "PRESS BOX CAM"),
		})
	end
	local mic = post(room, seg, "PAMicrophone", 0, 82.2, fy + 2.9, fy + 4.1, 0.25, DARK_METAL, Enum.Material.Metal)
	BuildUtil.Look(
		mic,
		"Stadium PA Microphone",
		'The stadium announcer talks to the whole crowd from this microphone: "FIRST... DOWN!"',
		{ LookKey = "team", Distance = 6 }
	)
	local sheets = span(room, seg, "StatSheets", 6.2, 7.8, 81.4, 82.6, fy + 2.9, fy + 3.1, PAPER, nil, PAINT)
	BuildUtil.Look(
		sheets,
		"Stat Sheets",
		"Fresh stats are printed every quarter: yards, tackles, touchdowns - and your team's record.",
		{ LookKey = "record", Distance = 6 }
	)
	-- the second row on two risers (one step up) either side of a centre aisle that runs from the
	-- door straight down to the window; 4+ wide walkways stay free behind the risers (91..95.25)
	-- and between the risers and the side walls
	local riserTop = fy + 1
	for index, s in ipairs({ -1, 1 }) do
		span(room, seg, "PressRiser", s * 4.5, s * 15.5, 87.2, 91, fy, riserTop, CARPET, Enum.Material.Carpet)
		span(room, seg, "PressDesk2", s * 5, s * 15, 87.4, 88.8, riserTop + 2.6, riserTop + 2.9, WOOD, Enum.Material.Wood)
		span(room, seg, "PressDeskPanel2", s * 5, s * 15, 87.4, 87.8, riserTop, riserTop + 2.6, DARK_WOOD, Enum.Material.Wood)
		local monitor = span(room, seg, "Monitor2", s * 8.5, s * 11.5, 87.9, 88.2, riserTop + 2.9, riserTop + 4.4, SCREEN)
		liveScreen(ctx, monitor, OUTWARD, index == 1 and "team" or "score", { PPS = 40 })
		for _, x in ipairs({ 7, 13 }) do
			chair(room, seg, s * x, 89.8, riserTop, "field", LEATHER, {
				BackColor = team.Primary,
				Material = Enum.Material.Leather,
				Object = "Press Seat",
				NoPrompt = x == 7,
			})
		end
	end
	-- the back of the room: stat boards either side of the door
	local statLeft = span(room, seg, "StatBoard", -20, -6.5, BACK_IN - 0.3, BACK_IN, fy + 2.6, fy + 8.6, SCREEN)
	liveScreen(ctx, statLeft, TOWARD_FIELD, "summary", { PPS = 20 })
	local statRight = span(room, seg, "StatBoard", 6.5, 20, BACK_IN - 0.3, BACK_IN, fy + 2.6, fy + 8.6, SCREEN)
	liveScreen(ctx, statRight, TOWARD_FIELD, "season", { PPS = 20, Color = SCREEN_WHITE })
	local clock = span(room, seg, "GameClock", -3.6, 3.6, BACK_IN - 0.3, BACK_IN, fy + 8.3, fy + 10.5, SCREEN)
	liveScreen(ctx, clock, TOWARD_FIELD, "gameday", { PPS = 30 })
	-- coffee & soda bar on the -x wall, cooler + copier on the +x wall
	local coffee = span(room, seg, "CoffeeBar", -inner, -inner + 2, 90.4, 94.4, fy, fy + 3.2, DARK_WOOD, Enum.Material.Wood)
	span(room, seg, "CoffeeMachine", -inner + 0.3, -inner + 1.7, 91.2, 92.8, fy + 3.2, fy + 5.2, DARK_METAL, Enum.Material.Metal)
	BuildUtil.Use(ctx, coffee, "soda", {
		Object = "Coffee & Soda Bar",
		Title = "Coffee & Soda Bar",
		Info = "Reporters run on coffee... but this machine also pours fizzy soda!",
		Distance = 7,
	})
	local cooler = post(room, seg, "DrinkCooler", inner - 1.1, 87, fy, fy + 3.2, 2, COOLER_ORANGE, Enum.Material.SmoothPlastic)
	BuildUtil.Use(ctx, cooler, "sportsdrink", {
		Object = "Sports Drink Cooler",
		Title = "Sports Drink Cooler",
		Info = "The same cooler the players drink from on the sideline. Stay hydrated!",
		Distance = 7,
	})
	local copier = span(room, seg, "StatCopier", inner - 2, inner, 91, 94.4, fy, fy + 3.4, Color3.fromRGB(200, 202, 206))
	BuildUtil.Look(
		copier,
		"Stat Copier",
		"This copier prints play-by-play sheets so fast it never stops whirring. Every reporter gets a copy!",
		{ Distance = 7 }
	)
	local credentials =
		span(room, seg, "CredentialsBoard", inner - 0.15, inner, 83.6, 85.6, fy + 3.2, fy + 7.4, CREAM, Enum.Material.Fabric, PAINT)
	write(credentials, Enum.NormalId.Left, "PRESS\nPASSES", INK, { Font = Enum.Font.GothamBold, Wrap = true, Top = 0.06, Height = 0.3 })
	BuildUtil.Look(
		credentials,
		"Press Credentials",
		"Every reporter needs a pass to get in. Today's list has 24 newspapers, radio shows and TV crews - all here to cover your team!",
		{ LookKey = "team", Distance = 7 }
	)
	-- the reporters' kit: a keyboard in front of every monitor (between it and the nameplates),
	-- radio headsets, cups, laptops and stat sheets on the second row
	for _, x in ipairs({ -17.5, -10.5, -3.5, 3.5, 10.5, 17.5 }) do
		span(room, seg, "Keyboard", x - 1.1, x + 1.1, 81.9, 82.42, fy + 2.9, fy + 3, CAMERA_BLACK, nil, NO_COLLIDE)
	end
	for _, x in ipairs({ -3.5, 17.5 }) do -- (KICKOFF RADIO and BLITZ TV)
		span(room, seg, "Headset", x + 1.3, x + 2.1, 81.85, 82.4, fy + 2.9, fy + 3.15, CAMERA_BLACK, nil, NO_COLLIDE)
	end
	post(room, seg, "CoffeeCup", -15.3, 82, fy + 2.9, fy + 3.4, 0.45, WHITE, Enum.Material.SmoothPlastic, NO_COLLIDE)
	post(room, seg, "SodaCup", 13.4, 82.1, fy + 2.9, fy + 3.5, 0.45, team.Secondary, Enum.Material.SmoothPlastic, NO_COLLIDE)
	for _, s in ipairs({ -1, 1 }) do
		local top = riserTop + 2.9
		span(room, seg, "LaptopBase", s * 12.2, s * 13.8, 88.0, 88.75, top, top + 0.08, BRUSHED, Enum.Material.Metal, NO_COLLIDE)
		local lid =
			span(room, seg, "LaptopScreen", s * 12.2, s * 13.8, 87.88, 88.0, top, top + 1.05, DARK_METAL, Enum.Material.Metal, NO_COLLIDE)
		liveScreen(ctx, lid, OUTWARD, s < 0 and "record" or "rating", { PPS = 40, Name = "LaptopStory" })
		span(room, seg, "StatSheets2", s * 9.1, s * 10.9, 88.25, 88.7, top, top + 0.06, PAPER, nil, PAINT)
		-- (and a keyboard for the reporter at +-7, whose screen is the desk's monitor)
		span(room, seg, "Keyboard2", s * 6, s * 8, 88.05, 88.55, top, top + 0.1, CAMERA_BLACK, nil, NO_COLLIDE)
	end
	-- TVs hung from the ceiling over the window (above the glass), facing the press row
	for _, s in ipairs({ -1, 1 }) do
		local x = s * 16.5
		local tv = span(room, seg, "CeilingTV", x - 2.2, x + 2.2, 81, 81.3, fy + 9.5, fy + 10.9, SCREEN, nil, NO_COLLIDE)
		liveScreen(ctx, tv, OUTWARD, s < 0 and "score" or "gameday", { PPS = 30 })
		span(room, seg, "TVMount", x - 0.25, x + 0.25, 81.05, 81.25, fy + 10.9, CEIL_BOTTOM, DARK_METAL, Enum.Material.Metal, NO_COLLIDE)
	end
	-- a chalkboard menu over the coffee bar
	local menu = span(room, seg, "CoffeeMenu", -inner, -inner + 0.12, 90.6, 94.2, fy + 5.8, fy + 8.4, SIGN_DARK, nil, PAINT)
	write(menu, Enum.NormalId.Right, "COFFEE  -  HOT COCOA\nSODA  -  SPORTS DRINKS\nALL FREE FOR THE PRESS!", CREAM, {
		Name = "MenuText",
		Font = Enum.Font.GothamBold,
		Wrap = true,
		Top = 0.1,
		Height = 0.8,
	})

	-------------------------------------------------------------------------------------------
	-- 3 COACHES' BOOTHS
	-------------------------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 3)
	for _, s in ipairs({ -1, 1 }) do
		-- the home coaches' booth (team colours) is on the segment's -x side (world +x), the visitors'
		-- (steel) on the other; both are the same size
		local homeBooth = s < 0
		local c = BuildUtil.Child(ctx, homeBooth and "HomeCoachesBooth" or "VisitingCoachesBooth")
		local a, b = s > 0 and COACH_A or -COACH_B, s > 0 and COACH_B or -COACH_A
		local xa, xb = a + WALL_T, b - WALL_T -- interior
		local passageSide = s > 0 and a or b -- the wall next to the press box passage
		local outerSide = s > 0 and b or a
		local accent = homeBooth and team.Primary or STEEL
		span(c, seg, "BoothWall", passageSide, passageSide + s * WALL_T, FRONT_IN, BACK_IN, fy, CEIL_BOTTOM, accent)
		span(c, seg, "BoothWall", outerSide - s * WALL_T, outerSide, FRONT_IN, BACK_IN, fy, CEIL_BOTTOM, WALL_LIGHT)
		local d0, d1 = xb - 7.5, xb - 1.5
		local boothLintel = backWall(c, seg, "BoothBackWall", a, b, fy, { { d0, d1 } }, accent)
		local title = homeBooth and "HOME COACHES" or "VISITING COACHES"
		write(boothLintel, OUTWARD, title, ink(accent, team), { Top = 0.14, Height = 0.72, Glow = true })
		-- a framed photo on the corridor side, beside the door
		local wallPhoto = span(
			c,
			seg,
			"BoothPhoto",
			d0 - 5.5,
			d0 - 1,
			BACK_OUT,
			BACK_OUT + 0.12,
			fy + 3.4,
			fy + 7.2,
			WALNUT,
			Enum.Material.Wood,
			NO_COLLIDE
		)
		picture(wallPhoto, OUTWARD, homeBooth and "THE GAME-WINNING PLAY CALL" or "VISITORS WELCOME", PHOTO_TONES[homeBooth and 4 or 3])
		local boothHeader = glassFront(c, seg, a, b, fy, accent, homeBooth and team.Secondary or DARK_METAL)
		write(boothHeader, TOWARD_FIELD, "COACHES", ink(homeBooth and team.Secondary or DARK_METAL, team), { Top = 0.14, Height = 0.72 })
		span(c, seg, "BoothCeiling", a, b, FRONT_IN, BACK_OUT, CEIL_BOTTOM, CEIL_TOP, CEILING)
		span(
			c,
			seg,
			"BoothCarpet",
			xa,
			xb,
			FRONT_IN,
			BACK_IN,
			fy,
			fy + 0.05,
			homeBooth and team.Primary or CARPET,
			Enum.Material.Carpet,
			PAINT
		)
		lamp(c, seg, (xa + xb) / 2, 88, 5, 2, 22, 1.4)
		roomDoor(c, seg, d0, d1, fy, {
			Name = "BoothDoor",
			Window = true,
			Color = homeBooth and DARK_WOOD or DARK_METAL,
			Material = homeBooth and Enum.Material.Wood or Enum.Material.Metal,
			Object = homeBooth and "Home Coaches' Booth" or "Visiting Coaches' Booth",
			Title = homeBooth and "Home Coaches' Booth" or "Visiting Coaches' Booth",
			Info = homeBooth
					and "Your coordinators call the plays from up here, where they can see the whole field. They talk to the sideline through headsets."
				or "The visiting coaches get a booth too - right next to ours, so no peeking at their play sheet!",
		})
		-- headset desk at the window with three camera seats
		span(c, seg, "CoachDesk", xa + 0.4, xb - 0.4, FRONT_IN + 0.2, 83, fy + 2.6, fy + 2.9, DARK_WOOD, Enum.Material.Wood)
		span(c, seg, "CoachDeskPanel", xa + 0.4, xb - 0.4, FRONT_IN + 0.2, FRONT_IN + 0.6, fy, fy + 2.6, accent)
		local mid = (xa + xb) / 2
		for index, dx in ipairs({ -4.2, 0, 4.2 }) do
			local x = mid + dx
			chair(c, seg, x, 84.6, fy, "field", LEATHER, {
				BackColor = homeBooth and team.Secondary or STEEL,
				Material = Enum.Material.Leather,
				Object = "Coach's Seat",
				Camera = fieldView(
					L,
					seg,
					x,
					fy + (index == 2 and 14 or 9),
					index == 2 and 70 or 76,
					index == 2 and 62 or 48,
					index == 2 and "ALL-22 COACHES CAM" or "COACHES' BOOTH CAM"
				),
			})
		end
		local headsets = span(c, seg, "Headsets", mid - 2.9, mid - 1.3, 81.4, 82.4, fy + 2.9, fy + 3.3, CAMERA_BLACK)
		BuildUtil.Look(
			headsets,
			homeBooth and "Coaches' Headsets" or "Visiting Headsets",
			homeBooth and "Coaches up here radio plays down to the sideline: 'Run it again - they can't stop it!'"
				or "The visitors' headsets. Rumour says they only ever say 'punt'.",
			{ LookKey = homeBooth and "rating" or nil, Distance = 6 }
		)
		local binoculars = span(c, seg, "Binoculars", mid + 1.3, mid + 2.9, 81.2, 82.2, fy + 2.9, fy + 3.5, CAMERA_BLACK)
		BuildUtil.Look(
			binoculars,
			"Spotter Binoculars",
			homeBooth and "Spotters zoom in to see who made the play. Right now they're watching your quarterback:"
				or "The spotter checks every tackle. Today's star on your defense:",
			{ LookKey = homeBooth and "roster:QB" or "roster:DEF", Distance = 6 }
		)
		-- the sideline phone (look), a playbook tablet and a sports drink on the desk
		local phone = span(
			c,
			seg,
			"SidelinePhone",
			mid + 4.6,
			mid + 5.8,
			81.3,
			82.2,
			fy + 2.9,
			fy + 3.2,
			homeBooth and team.Primary or DARK_METAL,
			nil,
			NO_COLLIDE
		)
		span(c, seg, "PhoneHandset", mid + 4.7, mid + 5.7, 81.4, 81.7, fy + 3.2, fy + 3.42, CAMERA_BLACK, nil, NO_COLLIDE)
		BuildUtil.Look(
			phone,
			"Sideline Phone",
			homeBooth and "A direct line down to the sideline. When it rings, the head coach is about to change the play!"
				or "The visitors' sideline phone. It rings a lot when they're losing...",
			-- (on the half of its top behind the handset, facing the coaches)
			{ Distance = 6, At = Vector3.new(0, 0.18, -0.3) }
		)
		-- (turned: its Top face reads from the coaches' side)
		local tablet = span(c, seg, "Tablet", mid - 6.1, mid - 5.1, 81.5, 82.3, fy + 2.9, fy + 2.96, CAMERA_BLACK, nil, {
			CanCollide = false,
			Turned = true,
		})
		write(tablet, Enum.NormalId.Top, "PLAYBOOK", SCREEN_WHITE, { Name = "TabletScreen", Background = SCREEN, Glow = true, PPS = 40 })
		-- (a short can, out of the line to the headsets from the far end of the desk)
		post(
			c,
			seg,
			"DrinkCan",
			mid - 4.4,
			82.5,
			fy + 2.9,
			fy + 3.45,
			0.35,
			homeBooth and team.Secondary or COOLER_ORANGE,
			Enum.Material.Metal,
			NO_COLLIDE
		)
		-- live depth chart on the passage wall, play sheet on the outer wall
		local passageFace = s > 0 and Enum.NormalId.Right or Enum.NormalId.Left
		local depthChart =
			span(c, seg, "DepthChart", passageSide + s * WALL_T, passageSide + s * (WALL_T + 0.25), 86.6, 92.6, fy + 2.6, fy + 8.2, SCREEN)
		liveScreen(ctx, depthChart, passageFace, "roster", { PPS = 24, Color = SCREEN_WHITE })
		local outerFace = s > 0 and Enum.NormalId.Left or Enum.NormalId.Right
		local sheet = span(
			c,
			seg,
			"PlaySheet",
			outerSide - s * (WALL_T + 0.15),
			outerSide - s * WALL_T,
			85.6,
			90.6,
			fy + 2.8,
			fy + 8,
			WHITE,
			nil,
			PAINT
		)
		write(sheet, outerFace, "PLAY SHEET\n\nRUN: 32 DIVE, 28 TOSS\nPASS: TRIPS FLOOD, Y-CROSS\nTRICK: FLEA FLICKER", INK, {
			Font = Enum.Font.GothamBold,
			Wrap = true,
			Left = 0.08,
			Width = 0.84,
			Top = 0.08,
			Height = 0.84,
		})
		BuildUtil.Look(
			sheet,
			"Play Sheet",
			"The coordinator's play sheet: 120 plays, colour-coded and laminated. The trick plays are circled in red!",
			{ LookKey = "season", Distance = 7 }
		)
	end

	-------------------------------------------------------------------------------------------
	-- 4 ROOF & TV CAMERAS
	-------------------------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 4)
	local roof = BuildUtil.Child(ctx, "PressRoof")
	-- a team-colour roof visor out over the club seats' top row (above everyone's heads, below
	-- the upper deck's fascia at 66.2)
	local visorBottom, visorTop = fy + 9.8, fy + 11.6
	local visor =
		span(roof, seg, "PressRoofVisor", -COACH_B, COACH_B, VISOR_IN, FRONT_OUT, visorBottom, visorTop, team.Primary, nil, NO_COLLIDE)
	write(visor, TOWARD_FIELD, name .. " PRESS BOX", ink(team.Primary, team), {
		Left = 0.3,
		Width = 0.4,
		Top = 0.1,
		Height = 0.8,
		PPS = 24,
		Glow = true,
	})
	for _, left in ipairs({ 0.01, 0.843 }) do -- (over the two coaches' booths, whose headers it covers)
		write(visor, TOWARD_FIELD, "COACHES", ink(team.Primary, team), {
			Left = left,
			Width = 0.147,
			Top = 0.1,
			Height = 0.8,
			PPS = 24,
			Glow = true,
		})
	end
	local soffit = span(
		roof,
		seg,
		"VisorLights",
		-COACH_B + 1,
		COACH_B - 1,
		76.8,
		77.2,
		visorBottom - 0.1,
		visorBottom,
		LAMP,
		Enum.Material.Neon,
		PAINT
	)
	lightsAlong(soffit, 4, { Name = "VisorLight", Range = 16, Brightness = 1, Color = WARM_LIGHT })
	local camInfo = {
		{ -32, "Wide Camera", "This camera shows the whole field for the TV broadcast. It's the view you see between plays!" },
		{ 0, "50-Yard Line Camera", "The main TV camera, right on the 50-yard line. When the ball is snapped, this is the shot on TV." },
		{ 32, "Tight Camera", "This camera zooms in close on the quarterback. Smile - you might be on TV!" },
	}
	for _, spec in ipairs(camInfo) do
		local x = spec[1]
		span(
			roof,
			seg,
			"CameraPlatform",
			x - 1.8,
			x + 1.8,
			75.7,
			78.7,
			visorTop,
			visorTop + 0.2,
			STEEL,
			Enum.Material.DiamondPlate,
			NO_COLLIDE
		)
		local body = tvCamera(roof, seg, x, 77.3, visorTop + 0.2, "field", 0.6, NO_COLLIDE)
		BuildUtil.Look(body, spec[2], spec[3], { Distance = 18 })
	end
	for _, s in ipairs({ -1, 1 }) do
		post(roof, seg, "Antenna", s * 42, 77, visorTop, visorTop + 3.6, 0.3, C.Metal, Enum.Material.Metal, NO_COLLIDE)
		BuildUtil.Ball(roof, {
			Name = "AntennaBeacon",
			Position = at(seg, s * 42, visorTop + 3.8, 77).Position,
			Diameter = 0.45,
			Color = ON_AIR_RED,
			Material = Enum.Material.Neon,
			CanCollide = false,
		})
	end
end

---------------------------------------------------------------------------------------------
-- TV BROADCAST BOOTH (visitor side, centre)
---------------------------------------------------------------------------------------------

function M.broadcast_booth(ctx)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local team = ctx.colors
	local name = teamLabel(ctx)
	local seg = ring(L).visitor
	local fy = seg.floor
	local inner = PRESS_HALF - WALL_T
	local doorHalf = 4

	-------------------------------------------------------------------------------------------
	-- 1 BOOTH
	-------------------------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 1)
	local shell = BuildUtil.Child(ctx, "BoothShell")
	for _, s in ipairs({ -1, 1 }) do
		local wall = span(shell, seg, "BoothSideWall", s * inner, s * PRESS_HALF, FRONT_IN, BACK_IN, fy, CEIL_BOTTOM, CAMERA_BLACK)
		write(wall, s > 0 and Enum.NormalId.Right or Enum.NormalId.Left, name .. " TV", ink(CAMERA_BLACK, team), {
			Left = 0.15,
			Width = 0.7,
			Top = 0.3,
			Height = 0.2,
			Glow = true,
		})
	end
	-- (the lintel stays black inside so the red ON AIR light stands out; the corridor side gets a
	-- red name plate)
	local lintel = backWall(shell, seg, "BoothBackWall", -PRESS_HALF, PRESS_HALF, fy, { { -doorHalf, doorHalf } }, CAMERA_BLACK)
	write(lintel, OUTWARD, name .. " TV  -  BROADCAST BOOTH", WHITE, {
		Left = 0.2,
		Width = 0.6,
		Top = 0.1,
		Height = 0.8,
		Glow = true,
		Background = ON_AIR_RED,
	})
	local header = glassFront(shell, seg, -PRESS_HALF, PRESS_HALF, fy, team.Secondary, CAMERA_BLACK, false)
	write(header, TOWARD_FIELD, name .. " TV  -  BROADCAST BOOTH", ink(CAMERA_BLACK, team), {
		Left = 0.2,
		Width = 0.6,
		Top = 0.12,
		Height = 0.76,
		Glow = true,
	})
	span(shell, seg, "BoothCeiling", -PRESS_HALF, PRESS_HALF, FRONT_IN, BACK_OUT, CEIL_BOTTOM, CEIL_TOP, CEILING)
	span(shell, seg, "BoothCarpet", -inner, inner, FRONT_IN, BACK_IN, fy, fy + 0.05, CARPET, Enum.Material.Carpet, PAINT)
	lightStrip(shell, seg, -19, 19, 84, 3, 22, 1.5)
	lightStrip(shell, seg, -19, 19, 91.5, 3, 22, 1.3)
	local door = roomDoor(shell, seg, -doorHalf, doorHalf, fy, {
		Name = "BoothDoor",
		Double = true,
		Window = true,
		Color = CAMERA_BLACK,
		Material = Enum.Material.SmoothPlastic,
		Object = "Broadcast Booth",
		Title = "TV Broadcast Booth",
		Info = "Quiet please - we're live! This is where the game is called for millions of TV viewers.",
	})
	doorText(door, { "BROADCAST", "BOOTH" }, WHITE, ON_AIR_RED)
	-- framed photos of famous broadcasts either side of the door, facing the corridor (where fans
	-- come up the Gate A escalators)
	for index, s in ipairs({ -1, 1 }) do
		local photo = span(
			shell,
			seg,
			"BroadcastPhoto",
			s * 8.5,
			s * 14.5,
			BACK_OUT,
			BACK_OUT + 0.12,
			fy + 3.4,
			fy + 7.2,
			WALNUT,
			Enum.Material.Wood,
			NO_COLLIDE
		)
		picture(photo, OUTWARD, index == 1 and "OUR FIRST LIVE BROADCAST" or "THE MILLION-VIEWER GAME", PHOTO_TONES[index == 1 and 4 or 2])
	end
	-- the control room at the back: monitor wall either side of the door, producer's desk, rack
	local wallLeft = span(shell, seg, "MonitorWall", -20, -6, BACK_IN - 0.3, BACK_IN, fy + 2.2, fy + 8.4, SCREEN)
	liveScreen(ctx, wallLeft, TOWARD_FIELD, "summary", { PPS = 20 })
	local wallRight = span(shell, seg, "MonitorWall", 6, 20, BACK_IN - 0.3, BACK_IN, fy + 2.2, fy + 8.4, SCREEN)
	liveScreen(ctx, wallRight, TOWARD_FIELD, "score", { PPS = 20, Color = SCREEN_WHITE })
	local producerDesk = span(shell, seg, "ProducerDesk", -17, -8, 89.6, 91.4, fy + 2.6, fy + 2.9, DARK_METAL, Enum.Material.Metal)
	span(shell, seg, "ProducerDeskPanel", -17, -8, 89.6, 90, fy, fy + 2.6, CAMERA_BLACK)
	BuildUtil.Look(
		producerDesk,
		"Producer's Desk",
		"The producer picks which camera goes on TV: 'Camera 2... and GO!' Dozens of buttons, and every one of them blinks.",
		{ At = Vector3.new(-3.5, 0.4, 0), Distance = 7 }
	)
	chair(shell, seg, -12.5, 92.6, fy, "field", LEATHER, {
		BackColor = DARK_METAL,
		Material = Enum.Material.Leather,
		Object = "Producer's Chair",
	})
	local rack = span(shell, seg, "EquipmentRack", inner - 1.6, inner, 88, 93, fy, fy + 6, CAMERA_BLACK, Enum.Material.Metal)
	BuildUtil.Look(
		rack,
		"Equipment Rack",
		"Blinking boxes that send the game to TV trucks outside. There are more cables in here than plays in the playbook!",
		{ Distance = 7 }
	)
	-- rows of status lights on the rack (above and below its middle, where its prompt is)
	for _, row in ipairs({ { 1.4, LED_GREEN }, { 2.2, LED_BLUE }, { 4.7, LED_GREEN }, { 5.4, ON_AIR_RED } }) do
		span(
			shell,
			seg,
			"RackLights",
			inner - 1.66,
			inner - 1.6,
			88.5,
			92.5,
			fy + row[1],
			fy + row[1] + 0.1,
			row[2],
			Enum.Material.Neon,
			PAINT
		)
	end
	-- the producer's mixing desk: a sloped console (rising toward the window) with a fader panel and
	-- a row of lit buttons, on the desk's +x half (its prompt is at the -x end)
	local consoleCFrame = at(seg, -10.6, fy + 3.2, 90.45)
	BuildUtil.Wedge(shell, {
		Name = "MixingConsole",
		Size = Vector3.new(4.2, 0.6, 1.4),
		CFrame = consoleCFrame,
		Color = CAMERA_BLACK,
		Material = Enum.Material.SmoothPlastic,
	})
	local slope = consoleCFrame * CFrame.Angles(-math.atan2(0.6, 1.4), 0, 0)
	BuildUtil.Part(shell, {
		Name = "Faders",
		Size = Vector3.new(3.8, 0.06, 0.8),
		CFrame = slope * CFrame.new(0, 0.03, -0.2),
		Color = BRUSHED,
		Material = Enum.Material.Metal,
		CanCollide = false,
	})
	BuildUtil.Part(shell, {
		Name = "ConsoleButtons",
		Size = Vector3.new(3.8, 0.06, 0.18),
		CFrame = slope * CFrame.new(0, 0.04, 0.55),
		Color = LED_GREEN,
		Material = Enum.Material.Neon,
		CanCollide = false,
	})
	-- the show's rundown on the +x wall, and an ON AIR sign over the door out in the corridor
	local rundown = span(shell, seg, "RundownBoard", inner - 0.12, inner, 82.8, 87.4, fy + 3.6, fy + 7.6, WHITE, nil, PAINT)
	write(rundown, Enum.NormalId.Left, "TODAY'S RUNDOWN", ON_AIR_RED, { Top = 0.06, Height = 0.14, Font = Enum.Font.GothamBold })
	write(rundown, Enum.NormalId.Left, "PREGAME SHOW\nKICKOFF\nHALFTIME HIGHLIGHTS\nPOSTGAME INTERVIEWS", INK, {
		Name = "RundownLines",
		Top = 0.26,
		Height = 0.66,
		Font = Enum.Font.Gotham,
		Wrap = true,
	})
	BuildUtil.Look(
		rundown,
		"Show Rundown",
		"Every second of the broadcast is planned on this board, from the pregame show to the last interview. Today's show is about:",
		{ LookKey = "team", Distance = 8 }
	)
	local onAirOut = span(shell, seg, "OnAirSign", 15.5, 19.5, BACK_OUT, BACK_OUT + 0.4, fy + 8.7, fy + 10.3, SCREEN, nil, NO_COLLIDE)
	write(onAirOut, OUTWARD, "ON AIR", ON_AIR_RED, { Glow = true, Top = 0.15, Height = 0.7 })
	-- soundproofing panels on the side walls, round the telestrator, the rundown and the rack
	for _, panel in ipairs({
		{ -inner, -inner + 0.15, 81.2, 85.2, 3, 10.4 },
		{ -inner, -inner + 0.15, 85.6, 91, 7.6, 10.4 },
		{ inner - 0.15, inner, 82.8, 87.4, 8, 10.4 },
		{ inner - 0.15, inner, 88, 93, 6.6, 10.4 },
	}) do
		span(
			shell,
			seg,
			"AcousticPanel",
			panel[1],
			panel[2],
			panel[3],
			panel[4],
			fy + panel[5],
			fy + panel[6],
			CARPET,
			Enum.Material.Fabric,
			PAINT
		)
	end

	-------------------------------------------------------------------------------------------
	-- 2 GLASS & CAMERAS
	-------------------------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 2)
	local studio = BuildUtil.Child(ctx, "Studio")
	span(
		studio,
		seg,
		"BoothGlass",
		-PRESS_HALF,
		PRESS_HALF,
		FRONT_OUT + 0.15,
		FRONT_IN - 0.15,
		SILL_TOP,
		GLASS_TOP,
		GLASS_TINT,
		Enum.Material.Glass,
		{
			Transparency = 0.5,
		}
	)
	for _, x in ipairs({ -11, 11 }) do
		span(studio, seg, "Mullion", x - 0.2, x + 0.2, FRONT_OUT - 0.05, FRONT_IN, SILL_TOP, GLASS_TOP, STEEL, Enum.Material.Metal)
	end
	-- commentators' desk facing the field, three TV BROADCAST seats behind it
	span(studio, seg, "CommentaryDesk", -9, 9, 82.8, 84.6, fy + 2.6, fy + 2.9, DARK_WOOD, Enum.Material.Wood)
	local deskFront = span(studio, seg, "DeskFront", -9, 9, 82.8, 83.2, fy, fy + 2.6, team.Primary)
	write(deskFront, TOWARD_FIELD, name .. " TV", ink(team.Primary, team), { Left = 0.25, Width = 0.5, Top = 0.2, Height = 0.6 })
	local views = {
		{ x = -6, from = Vector3.new(0, 64, -100), fov = 50, label = "TV BROADCAST - MAIN CAM" },
		{ x = 0, from = Vector3.new(0, 96, -6), fov = 64, label = "TV BROADCAST - SKY CAM" },
		{ x = 6, from = Vector3.new(-160, 26, 30), fov = 45, label = "TV BROADCAST - END ZONE CAM" },
	}
	for _, v in ipairs(views) do
		chair(studio, seg, v.x, 86.2, fy, "field", LEATHER, {
			BackColor = ON_AIR_RED,
			Material = Enum.Material.Leather,
			BackHeight = 2.6,
			Object = "Commentator's Seat",
			Camera = { From = v.from, To = Vector3.new(0, 0, L.FieldCenterZ), Fov = v.fov, Label = v.label },
		})
	end
	for index, x in ipairs({ -3, 3 }) do
		local monitor = span(studio, seg, "DeskMonitor", x - 1.2, x + 1.2, 83.4, 83.7, fy + 2.9, fy + 4.2, SCREEN)
		liveScreen(ctx, monitor, OUTWARD, index == 1 and "score" or "gameday", { PPS = 40 })
	end
	for _, x in ipairs({ -6, 6 }) do
		post(studio, seg, "Microphone", x, 84, fy + 2.9, fy + 4, 0.2, DARK_METAL, Enum.Material.Metal)
	end
	local headMic = BuildUtil.Ball(studio, {
		Name = "MicrophoneHead",
		Position = at(seg, 0, fy + 4.15, 84).Position,
		Diameter = 0.5,
		Color = CAMERA_BLACK,
		Material = Enum.Material.Fabric,
	})
	post(studio, seg, "Microphone", 0, 84, fy + 2.9, fy + 3.95, 0.2, DARK_METAL, Enum.Material.Metal)
	BuildUtil.Look(
		headMic,
		"Commentator's Microphone",
		"Lean in and say it with feeling: 'TOUCH... DOWN!' Millions of fans are listening.",
		{ LookKey = "team", Distance = 6 }
	)
	-- two TV cameras on tripods: one films the field, one films the commentators
	local fieldCam = tvCamera(studio, seg, -17, 83, fy, "field", 3)
	BuildUtil.Look(
		fieldCam,
		"Field Camera",
		"Camera 1 zooms in on the action through the glass. It can read a jersey number from across the stadium!",
		{ Distance = 7 }
	)
	local studioCam = tvCamera(studio, seg, 15.5, 86.4, fy, "minus", 3)
	BuildUtil.Look(
		studioCam,
		"Studio Camera",
		"Camera 2 points at the commentators. Sit at the desk and you're on TV - wave to the folks at home!",
		{ Distance = 7 }
	)
	-- ON AIR light above the door (control room side)
	local onAir = span(studio, seg, "OnAirLight", -3, 3, BACK_IN - 0.35, BACK_IN, fy + 8.4, fy + 10, ON_AIR_RED, Enum.Material.Neon, PAINT)
	write(onAir, TOWARD_FIELD, "ON AIR", WHITE, { Glow = true, Left = 0.1, Width = 0.8, Top = 0.12, Height = 0.76 })
	BuildUtil.Light(onAir, "PointLight", { Name = "OnAirGlow", Range = 10, Brightness = 1, Color = ON_AIR_RED })
	BuildUtil.Look(
		onAir,
		"On Air Light",
		"When this glows red the broadcast is LIVE - so no burping into the microphones!",
		{ LookKey = "team", Distance = 9 }
	)
	-- two softbox studio lights on stands, and the telestrator on the -x wall
	for _, x in ipairs({ -11.5, 11.5 }) do
		post(studio, seg, "LightStand", x, 88.2, fy, fy + 5.2, 0.3, DARK_METAL, Enum.Material.Metal)
		local softbox =
			span(studio, seg, "Softbox", x - 1.2, x + 1.2, 87.8, 88.6, fy + 5.2, fy + 7.2, WHITE, Enum.Material.Neon, NO_COLLIDE)
		BuildUtil.Light(softbox, "SpotLight", {
			Name = "StudioLight",
			Range = 14,
			Brightness = 1.2,
			Angle = 70,
			Face = Enum.NormalId.Back,
			Color = WARM_LIGHT,
		})
	end
	local telestrator = span(studio, seg, "Telestrator", -inner, -inner + 0.25, 85.6, 91, fy + 2.6, fy + 7, SCREEN)
	liveScreen(ctx, telestrator, Enum.NormalId.Right, "score", { PPS = 24, Color = SCREEN_WHITE })
	BuildUtil.Look(
		telestrator,
		"Telestrator",
		"A giant touchscreen: the analyst draws arrows and circles on replays to show how the play worked.",
		{ Distance = 8 }
	)
	-- stats desk for the numbers guru, and a guest couch
	span(studio, seg, "StatsDesk", 13, 20.5, 81, 82.6, fy + 2.6, fy + 2.9, DARK_WOOD, Enum.Material.Wood)
	span(studio, seg, "StatsDeskPanel", 13, 20.5, 81, 81.4, fy, fy + 2.6, CAMERA_BLACK)
	local statsScreen = span(studio, seg, "StatsMonitor", 15, 18.6, 81.6, 81.9, fy + 2.9, fy + 4.4, SCREEN)
	liveScreen(ctx, statsScreen, OUTWARD, "record", { PPS = 40 })
	chair(studio, seg, 16.8, 84, fy, "field", LEATHER, {
		BackColor = DARK_METAL,
		Material = Enum.Material.Leather,
		Object = "Stats Guru's Chair",
		NoPrompt = true,
	})
	chair(studio, seg, 13.5, 92.2, fy, "field", team.Secondary, {
		Width = 6,
		Depth = 2.4,
		SeatHeight = 1.6,
		BackHeight = 2,
		Name = "GuestCouch",
		Object = "Guest Couch",
	})
	-- the commentators' kit: foam heads on the side microphones, a headset at every seat, coffee
	-- and two spotting boards with the rosters (look)
	for _, x in ipairs({ -6, 6 }) do
		BuildUtil.Ball(studio, {
			Name = "MicrophoneHead",
			Position = at(seg, x, fy + 4.15, 84).Position,
			Diameter = 0.45,
			Color = CAMERA_BLACK,
			Material = Enum.Material.Fabric,
		})
	end
	for _, x in ipairs({ -6, 0, 6 }) do
		span(studio, seg, "Headset", x + 0.7, x + 1.5, 83.9, 84.45, fy + 2.9, fy + 3.12, CAMERA_BLACK, nil, NO_COLLIDE)
	end
	for _, s in ipairs({ -1, 1 }) do
		post(studio, seg, "CoffeeCup", s * 5, 83.3, fy + 2.9, fy + 3.4, 0.45, WHITE, Enum.Material.SmoothPlastic, NO_COLLIDE)
		-- (turned: its Top face reads from the commentators' side)
		local board = span(studio, seg, "SpottingBoard", s * 7.6, s * 8.9, 83.1, 84.5, fy + 2.9, fy + 2.94, PAPER, nil, {
			CanCollide = false,
			CastShadow = false,
			Turned = true,
		})
		write(board, Enum.NormalId.Top, s < 0 and "HOME\nROSTER" or "VISITORS\nROSTER", INK, { Name = "Roster", Wrap = true, PPS = 40 })
		if s < 0 then
			BuildUtil.Look(
				board,
				"Spotting Board",
				"Every player's name and number on one big card, so the play-by-play voice never misses a tackle. The starting quarterback:",
				{ LookKey = "roster:QB", Distance = 6 }
			)
		end
	end
	-- the cameras' tripod legs, a lighting pipe under the ceiling with three stage lights, and a
	-- steel frame round the big window
	tripodLegs(studio, seg, -17, 83, fy, fy + 1.5, 1.2)
	tripodLegs(studio, seg, 15.5, 86.4, fy, fy + 1.5, 1.2)
	-- (the pipe is fixed right under the ceiling; the lights hang from it, tipped toward the desk)
	rod(studio, seg, "LightingPipe", 0, CEIL_BOTTOM - 0.15, 87.6, 40, 0.3, "x", DARK_METAL, Enum.Material.Metal, NO_COLLIDE)
	for _, x in ipairs({ -8, 0, 8 }) do
		BuildUtil.Part(studio, {
			Name = "StageLight",
			Shape = Enum.PartType.Cylinder,
			Size = Vector3.new(1, 0.7, 0.7),
			-- (a cylinder's axis is its local X: turned to hang down from the pipe, then tipped 25
			-- degrees toward the field)
			CFrame = at(seg, x, CEIL_BOTTOM - 0.3, 87.6)
				* CFrame.Angles(-math.rad(25), 0, 0)
				* CFrame.Angles(0, 0, -math.pi / 2)
				* CFrame.new(0.5, 0, 0),
			Color = CAMERA_BLACK,
			Material = Enum.Material.Metal,
			CanCollide = false,
		})
	end
	span(studio, seg, "WindowFrame", -inner, inner, FRONT_IN, FRONT_IN + 0.3, GLASS_TOP - 0.3, GLASS_TOP, STEEL, Enum.Material.Metal, PAINT)
	span(studio, seg, "WindowLedge", -inner, inner, FRONT_IN, FRONT_IN + 0.35, SILL_TOP, SILL_TOP + 0.15, STEEL, Enum.Material.Metal, PAINT)

	-------------------------------------------------------------------------------------------
	-- 3 SATELLITE DISH
	-------------------------------------------------------------------------------------------
	BuildUtil.Stage(ctx, 3)
	local roof = BuildUtil.Child(ctx, "Satellite")
	local deckBottom, deckTop = fy + 9.8, fy + 11.6
	local deck = span(roof, seg, "UplinkDeck", -24, 24, VISOR_IN, FRONT_OUT, deckBottom, deckTop, CAMERA_BLACK, nil, NO_COLLIDE)
	write(
		deck,
		TOWARD_FIELD,
		name .. " TV  -  LIVE",
		ink(CAMERA_BLACK, team),
		{ Left = 0.25, Width = 0.5, Top = 0.1, Height = 0.8, Glow = true, PPS = 24 }
	)
	local dishX, dishO = -16, 76.9
	post(roof, seg, "DishMast", dishX, dishO, deckTop, deckTop + 1.3, 0.5, C.Metal, Enum.Material.Metal, NO_COLLIDE)
	-- the dish faces up and toward the open sky over the field; a cylinder's axis is its local X
	local centre = at(seg, dishX, deckTop + 2, dishO).Position
	local normal = (at(seg, dishX, deckTop + 2 + 0.8, dishO - 0.6).Position - centre).Unit
	local dish = BuildUtil.Part(roof, {
		Name = "SatelliteDish",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(0.3, 3.4, 3.4),
		CFrame = CFrame.lookAt(centre, centre + normal) * CFrame.Angles(0, math.pi / 2, 0),
		Color = WHITE,
		Material = Enum.Material.SmoothPlastic,
		CanCollide = false,
	})
	local feed = centre + normal * 1.3
	BuildUtil.Part(roof, {
		Name = "FeedArm",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(1.3, 0.15, 0.15),
		CFrame = CFrame.lookAt((centre + feed) / 2, feed) * CFrame.Angles(0, math.pi / 2, 0),
		Color = C.Metal,
		Material = Enum.Material.Metal,
		CanCollide = false,
	})
	BuildUtil.Ball(roof, {
		Name = "FeedHorn",
		Position = feed,
		Diameter = 0.45,
		Color = DARK_METAL,
		Material = Enum.Material.Metal,
		CanCollide = false,
	})
	BuildUtil.Look(
		dish,
		"Satellite Dish",
		"This dish beams the game up to a satellite in space, and from there to TVs all over the world!",
		{ LookKey = "team", Distance = 18 }
	)
	local uplink = span(roof, seg, "UplinkBox", 10, 15, 76, 78.4, deckTop, deckTop + 1.4, BRUSHED, Enum.Material.Metal, NO_COLLIDE)
	write(uplink, TOWARD_FIELD, "UPLINK", INK, { Font = Enum.Font.GothamBold })
	post(roof, seg, "Antenna", 19, 77.2, deckTop, deckTop + 3.4, 0.25, C.Metal, Enum.Material.Metal, NO_COLLIDE)
	BuildUtil.Ball(roof, {
		Name = "AntennaBeacon",
		Position = at(seg, 19, deckTop + 3.6, 77.2).Position,
		Diameter = 0.45,
		Color = ON_AIR_RED,
		Material = Enum.Material.Neon,
		CanCollide = false,
	})
	local underLight = span(roof, seg, "DeckLights", -22, 22, 76.8, 77.2, deckBottom - 0.1, deckBottom, LAMP, Enum.Material.Neon, PAINT)
	lightsAlong(underLight, 3, { Name = "DeckLight", Range = 14, Brightness = 1, Color = WARM_LIGHT })
end

return M
