--[[
	StadiumRooms (V5)
	The two game-day locker rooms, built INTO the stadium: on the event level (y = 0) under the
	lower bowl's hollow rows 8-14 and the main concourse, at the end of the players' tunnels.
	Stands.lua builds each tunnel through the low rows (walls at |x| 10..10.8, open at offset 28);
	this module continues it as a lit corridor from offset 28 to the locker room doors and builds
	the rooms behind them. Plot coordinates; "offset" = distance outward from the turf edge.

	What stands around the rooms (measured from the finished bowl, avoided here):
	  * hollow lower rows 8-14: slab undersides 16 (offset 28) .. 28 (offset 56)
	  * raker beams + columns on the aisle lines x = +-26 / +-78: beam bottoms 14.4 (offset 28)
	    rising to ~28, one 1.4 x 1.4 column each at offset 53.5 (z = +-148.5 / -88.5). The home room's
	    side walls (x +-25.2..26.8) are built thick enough to enclose the x = +-26 columns.
	  * the main concourse slab: underside 29 over offsets 56..84
	  Every room keeps its ceiling well below all of that (corridors 14.4, rooms <= 16.4).

	  home_lockerroom   (zone X[-80, 80] Z[95, 186]) the corridor z 123..139, the main room
	                    X[-25.2, 25.2] Z[140, 176.5] (ceiling 16), the coach's office (west wing)
	                    and the showers (east wing), both X +-[26.8, 44] Z[140, 160] (ceiling 12)
	    1 Tunnel & Walls           corridor: rubber floor, team runway, dark walls with team LED
	                               strips and four banners (look), ceiling lights, a lit
	                               "WELCOME TO THE <team>" LED sign (live team, look) over big
	                               double doors with windows; the main room shell (team carpet,
	                               light walls, ceiling panels) and both wing shells, the coach's
	                               office door (glass) and the open archway to the showers; a
	                               framed doorway in the corridor's west wall (z 130.6..135.4) for
	                               the coaches' tunnel, a NEVER QUIT banner painted over it
	    2 Lockers                  16 lockers along the side walls, each with its own door (look:
	                               whose locker it is) and a numbered jersey + cleats inside (GUI on
	                               the back panel), helmets on top, two padded benches facing the
	                               speech spot (TEAM TALK CAM + TUNNEL CAM seats), the sports-drink
	                               cooler (use)
	    3 Coach's Office & Showers desk + coach's chair (seat), guest chair, a live STARTERS
	                               whiteboard (roster, look), playbook library (look), team rug,
	                               live team-rating monitor, leather couch (seat); tiled showers with
	                               four heads on chrome pipes (look) between partitions, a cold tub
	                               (look), a teak bench and a towel shelf
	    4 Logo & Hype Screens      the huge floor logo (look), a glowing ceiling halo over it, the
	                               feature wall with the pre-game speech podium (use: podium, camera
	                               on the speaker), live summary / record / season / gameday
	                               screens, the trophy shelf (look: titles), the hype mirror and the
	                               game-day checklist (looks) beside the doors
	  coach_lockerroom  (zone X[-80, -9] Z[120, 160]) the coaches' own tunnel z 129.5..136.5 from
	                    the home corridor's west wall (x -10.8) to the room X[-75, -47] Z[124, 156]
	                    (ceiling 12), west of the coach's office, under the hollow lower rows
	    1 Coaches' Tunnel & Walls  the COACHES door in the home corridor's doorway, the tunnel
	                               (dark walls, team stripes, a team runner, photos of the big
	                               moments (look: titles), the COACHING STAFF sign (live team,
	                               look)), the room shell with its double doors, plain light
	                               fixtures and a team rug (live team name)
	    2 Coaches' Lockers & Gear  six open wooden stalls with name plates (HEAD COACH, OFFENSE..):
	                               a polo on a hanger, a cap, a headset and a clipboard or a
	                               tablet in each (looks: live roster / record / rating), the
	                               coaches' bench (seat), the playbook library (look)
	    3 Whistles & Headsets      the whistle rack (use: a Whistle), the headset charging station
	                               (look), the gear table with clipboards and a tablet (use: a
	                               Clipboard), the coaches' board (live roster, look)
	    4 Wardrobe & Mirrors       three dress forms in the outfits (use: Head Coach Polo,
	                               Sideline Hoodie, Team Jersey - Gear.lua dresses you), two
	                               mirrors (look), the YOUR CLOTHES cubby (use: change back), the
	                               changing bench (seat), the kick-off countdown (live game day)
	  visitor_lockerroom (zone X[-80, 80] Z[-126, -35]) the corridor z -75..-63, the room
	                    X[-18, 18] Z[-99, -76] (ceiling 11). Smaller and plainer on purpose.
	    1 Tunnel & Walls           grey corridor with flat fluorescent tubes, the home team's
	                               "WELCOME TO THE <team>" sign (live team, look), a HOME TEAM RULES
	                               sign + visitors' plaque (looks), the room shell (a bulkhead closes
	                               the corridor's higher ceiling) and a grey door
	    2 Lockers                  8 open grey stalls with white away jerseys (some looks)
	    3 Bench & Signs            squeaky bench (seat), an old TV on an AV cart with the live
	                               score, a lukewarm soda cooler (use), a leaky ceiling + bucket,
	                               wet-floor sign, game plan board and not-so-welcoming signs

	Flat layers: tunnel floor 0..0.08, runway 0.08..0.14 (the bowl's runway is 0..0.12 up to z 123),
	room floors 0..0.2, floor logo ring 0.24 / disc 0.28 / lettering 0.31, mats 0.22.
	Lettering, nameplates and wall graphics are SurfaceGui text (no extra parts).
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)
local Gear = require(script.Parent.Parent.Gear) -- (the coaches' wardrobe shows its outfits' colours)

local M = {}

local FLOOR_TOP = 0.2 -- room floors (carpet / wood / tiles / concrete) on the plot slab
local TUNNEL_FLOOR = 0.08 -- the corridors' floor
local TUNNEL_CEIL = 14 -- corridor ceiling underside (= the underside of the bowl's row-7 tunnel bridge)
local TUNNEL_IN, TUNNEL_OUT = 10, 10.8 -- corridor walls, flush with the bowl's tunnel walls
local LED_Y0, LED_Y1 = 5.4, 5.7 -- the bowl's tunnel LED strip height (continued in the home corridor)

local PAINT = { CanCollide = false, CastShadow = false }
local DECOR = { CanCollide = false }

local WHITE = Color3.fromRGB(248, 248, 248)
local INK = Color3.fromRGB(22, 22, 26)
local DARK_METAL = Color3.fromRGB(62, 64, 70)
local CHROME = Color3.fromRGB(200, 204, 210)
local WARM_LIGHT = Color3.fromRGB(255, 236, 200)
local COOL_LIGHT = Color3.fromRGB(226, 240, 255)
local LAMP = Color3.fromRGB(255, 248, 232)
local CEILING = Color3.fromRGB(226, 226, 222)
local SCREEN_BLACK = Color3.fromRGB(12, 14, 20)
local LED_TEXT = Color3.fromRGB(255, 226, 120)
local LED_GREEN = Color3.fromRGB(120, 255, 150)
local FACEMASK_GREY = Color3.fromRGB(80, 82, 90)
local GOLD = Color3.fromRGB(232, 184, 52)
local WOOD = Color3.fromRGB(120, 84, 52)
local WOOD_DARK = Color3.fromRGB(74, 50, 34)
local WHITEBOARD = Color3.fromRGB(240, 240, 236)
local MARKER_BLUE = Color3.fromRGB(30, 60, 160)
local MARKER_RED = Color3.fromRGB(190, 30, 40)

local TUNNEL_WALL = Color3.fromRGB(38, 40, 48)
local TUNNEL_RUBBER = Color3.fromRGB(30, 30, 34)
local TUNNEL_TOP = Color3.fromRGB(50, 52, 60)
local HOME_WALL = Color3.fromRGB(232, 230, 224)
local OFFICE_FLOOR = Color3.fromRGB(150, 108, 70)
local TILE = Color3.fromRGB(214, 228, 236)
local WATER = Color3.fromRGB(120, 196, 236)
local COOLER_ORANGE = Color3.fromRGB(255, 120, 20)

local VISITOR_TUNNEL = Color3.fromRGB(128, 128, 134)
local VISITOR_CONCRETE = Color3.fromRGB(116, 116, 120)
local VISITOR_WALL = Color3.fromRGB(150, 150, 156)
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

--[[
	HOME plan (plot coordinates, +Z = away from the field). The bowl's tunnel ends at z 123
	(offset 28); the corridor runs on to the front wall (z 139..140) with the double doors.
]]
local HOME = {
	TunnelZ = 123,
	FrontZ0 = 139, -- front wall z 139..140 (the corridor face / the room face)
	FrontZ1 = 140,
	InX = 25.2, -- main room side walls x +-(25.2..26.8): the raker columns at x +-26 hide inside
	OutX = 26.8,
	BackZ = 176.5, -- back wall z 176.5..177.5
	BackOutZ = 177.5,
	WingX = 44, -- office / showers: x +-(26.8..44), walls to +-44.8
	WingOutX = 44.8,
	WingZ = 160, -- wing back walls z 160..160.8
	WingOutZ = 160.8,
	Ceil = 16, -- main room ceiling underside (part 16..16.4)
	WingCeil = 12, -- office + showers ceiling underside
	DoorHalf = 6, -- entrance double doors x -6..6
	DoorTop = 10.6,
	SideZ = 146.5, -- side doorways (office / showers) z 140..146.5 in the main room's side walls
	SideTop = 9.4,
}
local HOME_LOCKERS = { Count = 8, Width = 3.6, Depth = 2.6, MidZ = 162 } -- per side wall: z 147.6..176.4
local LOGO_Z, LOGO_D = 158.5, 16
local PODIUM_Z = 169.2
local SPEAKER_HEAD = Vector3.new(0, 5.6, 171.8) -- where a player at the podium stands (head height)
local BENCH_Z = 147.6
local HOME_NUMBERS = { "1", "7", "12", "22", "24", "33", "44", "52", "55", "62", "74", "81", "88", "90", "95", "99" }

--[[
	COACHES plan (coach_lockerroom): a doorway in the home corridor's west wall (x -10.8..-10,
	z DoorZ0..DoorZ1; the opening itself is home_lockerroom's, the door is the coaches') leads into
	the coaches' own tunnel (inside z TunnelZ0..TunnelZ1), which runs west in front of the home
	locker room under the hollow lower rows to the coaches' locker room X[RoomX0, RoomX1]
	Z[RoomZ0, RoomZ1] (walls WALL thick outside that), west of the coach's office wing. The raker
	beam + column on the x -78 aisle line stay outside its west wall; the lowest thing overhead is
	row 8's slab (underside 16), so everything stays under 12.4.
]]
local COACH = {
	DoorZ0 = 130.6,
	DoorZ1 = 135.4,
	DoorTop = 9.4,
	TunnelZ0 = 129.5,
	TunnelZ1 = 136.5,
	TunnelCeil = 10.6,
	RoomX0 = -75,
	RoomX1 = -47,
	RoomZ0 = 124,
	RoomZ1 = 156,
	Ceil = 12,
	EntryZ0 = 130, -- the room's double doors from the tunnel (in its east wall)
	EntryZ1 = 136,
	Wall = 0.8,
}
-- the six coaches' stalls along the room's west wall (south to north)
local COACH_STALLS = {
	{ Plate = "HEAD COACH", Title = "Head Coach's Locker", LookKey = "record" },
	{ Plate = "OFFENSE", Title = "Offensive Coordinator's Locker", LookKey = "roster:QB" },
	{ Plate = "DEFENSE", Title = "Defensive Coordinator's Locker", LookKey = "roster:DEF" },
	{ Plate = "SPECIAL TEAMS", Title = "Special Teams Coach's Locker", LookKey = "roster:K" },
	{ Plate = "QB COACH", Title = "Quarterbacks Coach's Locker", LookKey = "roster:QB" },
	{ Plate = "STRENGTH", Title = "Strength Coach's Locker", LookKey = "rating" },
}
local COACH_STALL_INFO = {
	"The head coach's locker: a team polo, the lucky game-day cap, a headset and the game plan. Coach is always first in and last out!",
	"The offensive coordinator calls the plays. Trick plays are scribbled all over that clipboard.",
	"The defensive coordinator's locker. The tablet has every blitz in the playbook on it.",
	"Kickoffs, punts and field goals: the special teams coach's clipboard is all about the kicker.",
	"The quarterbacks coach works with your starting QB every single day.",
	"The strength coach runs the weight room. Even the cap looks strong.",
}
local COACH_WALL = Color3.fromRGB(184, 178, 168) -- warm grey (not bright white) walls
local COACH_CEILING = Color3.fromRGB(196, 194, 190)
local FIXTURE = Color3.fromRGB(226, 222, 212) -- plain (not glowing) light fixtures
local NEUTRAL_LIGHT = Color3.fromRGB(255, 250, 242)
local COACH_TUNNEL_WALL = Color3.fromRGB(58, 60, 68)
local HEADSET_BLACK = Color3.fromRGB(34, 36, 42)
local MANNEQUIN = Color3.fromRGB(210, 206, 198)
local MIRROR_GLASS = Color3.fromRGB(196, 214, 226)

--[[
	VISITOR plan: the bowl's tunnel ends at z -63 (offset 28); the corridor runs to the front wall
	(z -76..-75) and the room fills X[-18, 18] Z[-99, -76].
]]
local VISITOR = {
	TunnelZ = -63,
	FrontZ0 = -76, -- front wall z -76..-75
	FrontZ1 = -75,
	InX = 18, -- side walls x +-(18..18.8)
	OutX = 18.8,
	BackZ = -99, -- back wall z -100..-99
	BackOutZ = -100,
	Ceil = 11,
	DoorHalf = 3.25,
	DoorTop = 8.8,
}
local AWAY_NUMBERS = { "2", "14", "27", "38", "50", "61", "73", "84" }
local AWAY_NAMES = { "VISITOR", "GUEST", "AWAY", "TBD", "ROOKIE", "BACKUP", "NEW GUY", "SUB" }
local AWAY_STALL_INFO = {
	[1] = "A tiny stall with one wobbly hook. The away team has to share hangers!",
	[3] = "This one smells like old gym socks. Nobody knows why, and nobody wants to find out.",
	[6] = "The name tag just says 'NEW GUY'. The home team printed them in a hurry... on purpose.",
	[8] = "The seat squeaks every time you sit down. Good luck sneaking out early!",
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

local function shade(color, factor)
	return Color3.new(math.clamp(color.R * factor, 0, 1), math.clamp(color.G * factor, 0, 1), math.clamp(color.B * factor, 0, 1))
end

-- The owner's team name, or a generic one while the plot has no name.
local function displayName(ctx)
	if type(ctx.teamName) == "string" and ctx.teamName ~= "" then
		return ctx.teamName
	end
	return "HOME TEAM"
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

-- Adds a TextLabel to an existing SurfaceGui (positions are fractions of the face).
local function addLabel(gui, name, text, color, x, y, w, h, font)
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
	label.Parent = gui
	return label
end

-- An empty SurfaceGui on one face of a part (for several labels / frames).
local function faceGui(part, face, name, pixelsPerStud, lightInfluence)
	local gui = Instance.new("SurfaceGui")
	gui.Name = name
	gui.Face = face
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = pixelsPerStud or 20
	gui.LightInfluence = lightInfluence or 1
	gui.Parent = part
	return gui
end

-- A coloured rectangle on a SurfaceGui (wall graphics without extra parts).
local function addFrame(gui, name, color, x, y, w, h)
	local frame = Instance.new("Frame")
	frame.Name = name
	frame.BackgroundColor3 = color
	frame.BackgroundTransparency = 0
	frame.BorderSizePixel = 0
	frame.Position = UDim2.new(x, 0, y, 0)
	frame.Size = UDim2.new(w, 0, h, 0)
	frame.Parent = gui
	return frame
end

--[[
	A live screen (BuildUtil.LiveText) the server keeps up to date with the owner's team: dark
	background, bright text, readable in the dark (LightInfluence 0). Returns the TextLabel.
	opts: LabelName, TextColor3, BackgroundColor3, Font, PixelsPerStud, InsetX / InsetY
]]
local function liveScreen(part, face, live, placeholder, opts)
	opts = opts or {}
	local _, label = BuildUtil.LiveText(part, face, live, {
		LabelName = opts.LabelName or ("Live_" .. live),
		Text = placeholder,
		TextColor3 = opts.TextColor3 or LED_TEXT,
		BackgroundColor3 = opts.BackgroundColor3 or SCREEN_BLACK,
		BackgroundTransparency = 0,
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

-- Axis-aligned block between two corners (any order) - room plans read like a floor plan.
local function box(ctx, name, x0, y0, z0, x1, y1, z1, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Size = Vector3.new(math.abs(x1 - x0), math.abs(y1 - y0), math.abs(z1 - z0))
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

-- A glowing ceiling panel (w along X, d along Z) under a ceiling at `ceilingY`, with a PointLight.
local function ceilingLight(ctx, x, z, w, d, ceilingY, range, brightness, color)
	local lamp =
		box(ctx, "CeilingLight", x - w / 2, ceilingY - 0.2, z - d / 2, x + w / 2, ceilingY, z + d / 2, LAMP, Enum.Material.Neon, PAINT)
	BuildUtil.Light(lamp, "PointLight", { Name = "RoomLight", Range = range, Brightness = brightness or 1.4, Color = color or WARM_LIGHT })
	return lamp
end

-- A football helmet (shell + facemask) resting at local `frame`; the facemask points along -Z.
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

-- An LED sign: a static header line over the live team name ("WELCOME TO THE" / "<TEAM>").
local function welcomeSign(part, face, header, footer, name, colors)
	local label = liveScreen(part, face, "team", name, {
		TextColor3 = colors.Text,
		Font = Enum.Font.GothamBlack,
		PixelsPerStud = 20,
		InsetX = 0.03,
		InsetY = 0.04,
	})
	local top = 0.36
	local bottom = footer and 0.2 or 0
	label.Position = UDim2.new(0, 0, top, 0)
	label.Size = UDim2.new(1, 0, 1 - top - bottom, 0)
	local gui = label.Parent
	local head = addLabel(gui, "Header", header, colors.Header, 0.08, 0.04, 0.84, 0.3, Enum.Font.GothamBold)
	head.ZIndex = 2
	if footer then
		local foot = addLabel(gui, "Footer", footer, colors.Header, 0.2, 0.8, 0.6, 0.17, Enum.Font.GothamBold)
		foot.ZIndex = 2
	end
	return label
end

--[[
	The corridor shell from the bowl's tunnel (z0) to a room's front wall (z1 = the wall's corridor
	face, so no corridor face shares the wall's room face): floor, walls, ceiling. The floor runs on
	to floorZ1 (under the doorway, up to the room's floor). Decorations are added by the callers.
	spec: z0, z1, floorZ1, wallColor, wallMaterial, floorColor, floorMaterial, ceilingColor,
	      doorway = { Side = -1 | 1, Z0, Z1, Top }: an opening in that side's wall (z Z0..Z1, up to
	      Top) - the home corridor's door into the coaches' tunnel
Returns the doorway's lintel (nil without a doorway).
]]
local function corridorShell(ctx, spec)
	local z0, z1 = spec.z0, spec.z1
	local zLo, zHi = math.min(z0, z1), math.max(z0, z1)
	local f1 = spec.floorZ1 or z1
	local lintel = nil
	box(ctx, "TunnelFloor", -TUNNEL_IN, 0, math.min(z0, f1), TUNNEL_IN, TUNNEL_FLOOR, math.max(z0, f1), spec.floorColor, spec.floorMaterial)
	for _, s in ipairs({ -1, 1 }) do
		local door = spec.doorway
		if door and door.Side == s then
			box(ctx, "TunnelWall", s * TUNNEL_IN, 0, zLo, s * TUNNEL_OUT, TUNNEL_CEIL, door.Z0, spec.wallColor, spec.wallMaterial)
			box(ctx, "TunnelWall", s * TUNNEL_IN, 0, door.Z1, s * TUNNEL_OUT, TUNNEL_CEIL, zHi, spec.wallColor, spec.wallMaterial)
			lintel = box(
				ctx,
				"DoorwayLintel",
				s * TUNNEL_IN,
				door.Top,
				door.Z0,
				s * TUNNEL_OUT,
				TUNNEL_CEIL,
				door.Z1,
				spec.wallColor,
				spec.wallMaterial
			)
		else
			box(ctx, "TunnelWall", s * TUNNEL_IN, 0, zLo, s * TUNNEL_OUT, TUNNEL_CEIL, zHi, spec.wallColor, spec.wallMaterial)
		end
	end
	box(
		ctx,
		"TunnelCeiling",
		-TUNNEL_OUT,
		TUNNEL_CEIL,
		zLo,
		TUNNEL_OUT,
		TUNNEL_CEIL + 0.4,
		zHi,
		spec.ceilingColor,
		Enum.Material.SmoothPlastic
	)
	return lintel
end

--[[
	A game jersey on its hanger with a pair of cleats below it, drawn on a locker bank's back-panel
	GUI. faceW / faceH: the panel's face in studs; x: the locker's centre along the panel (local X;
	the GUI's x runs toward local -X); w: the locker's width. o: JerseyColor, NumberColor.
]]
local function hangJersey(gui, faceW, faceH, x, w, number, o)
	local function rect(name, color, cx, top, width, height, z)
		local frame = addFrame(gui, name, color, (faceW / 2 - cx - width / 2) / faceW, top / faceH, width / faceW, height / faceH)
		frame.ZIndex = z
		return frame
	end
	rect("Hanger", CHROME, x, 0.4, 0.14, 0.55, 1)
	rect("JerseySleeves", o.JerseyColor, x, 0.9, w - 0.5, 1.15, 2)
	rect("JerseyBody", o.JerseyColor, x, 0.9, w - 1.3, 3.4, 2)
	rect("JerseyCollar", o.NumberColor, x, 0.9, 0.8, 0.22, 3)
	local numberW = w - 1.7
	local label = addLabel(
		gui,
		"JerseyNumber",
		number,
		o.NumberColor,
		(faceW / 2 - x - numberW / 2) / faceW,
		1.75 / faceH,
		numberW / faceW,
		1.9 / faceH
	)
	label.ZIndex = 3
	rect("Cleats", INK, x, faceH - 0.6, w - 1.2, 0.45, 1)
end

--[[
	A bank of lockers against a wall, each with its own door (BuildUtil.Door, Object "Locker",
	LookKey "locker:<n>": opening it shows whose locker it is), the jersey number on the door and
	a numbered jersey hanging inside. `frame` is a plot-local CFrame at floor level on the wall face
	in the middle of the bank, its LookVector pointing into the room (the doors swing that way).
	o: Name, Count, Width, Depth, DoorHeight, First, Hinge, Ends, BackColor, FrameColor, HeaderColor,
	   DoorColor, DoorTextColor, JerseyColor, NumberColor, PlateColor
	Returns the bank's total height.
]]
local function lockerBank(ctx, frame, o)
	local bank = BuildUtil.Child(ctx, o.Name)
	local n, w, D = o.Count, o.Width, o.Depth
	local len = n * w
	local plinth, doorH, header = 0.5, o.DoorHeight, 1.4
	lblock(bank, frame, "LockerPlinth", Vector3.new(len, plinth, D), 0, 0, -D / 2, DARK_METAL, Enum.Material.Metal)
	-- the back panel stops 0.1 short of the bank's ends (its end faces hide in the end panels); the
	-- jerseys hang on it (one GUI for the whole bank: no extra parts)
	local backLen = len - 0.2
	local back = lblock(bank, frame, "LockerBack", Vector3.new(backLen, doorH, 0.3), 0, plinth, -0.15, o.BackColor, Enum.Material.Wood)
	local hangers = faceGui(back, Enum.NormalId.Front, "JerseysGui", 20)
	-- end panels (0.1 proud of the doors) on the open ends of the bank (o.Ends: -1 / 1 = local -X / +X)
	for _, s in ipairs(o.Ends) do
		lblock(
			bank,
			frame,
			"LockerEnd",
			Vector3.new(0.15, doorH, D + 0.1),
			s * (len / 2 - 0.075),
			plinth,
			-(D + 0.1) / 2,
			o.FrameColor,
			Enum.Material.Wood
		)
	end
	local headerPart = lblock(bank, frame, "LockerHeader", Vector3.new(len, header, D), 0, plinth + doorH, -D / 2, o.HeaderColor)

	-- number plates: one GUI on the header front (its GUI x runs toward the bank's local -X)
	local plates = faceGui(headerPart, Enum.NormalId.Front, "NumberPlatesGui", 24)
	for i = 1, n do
		local number = o.First + i - 1
		local jerseyNumber = HOME_NUMBERS[(number - 1) % #HOME_NUMBERS + 1]
		local x = -len / 2 + (i - 0.5) * w
		hangJersey(hangers, backLen, doorH, x, w, jerseyNumber, o)

		local plateW = w - 0.8
		addLabel(
			plates,
			"LockerNumber",
			string.format("%02d", number),
			o.PlateColor,
			(len / 2 - x - plateW / 2) / len,
			0.2,
			plateW / len,
			0.6
		)

		local door = BuildUtil.Door(bank, {
			Name = "LockerDoor" .. number,
			Size = Vector3.new(w - 0.3, doorH - 0.1, 0.2),
			CFrame = frame * CFrame.new(x, plinth + doorH / 2, -D + 0.1),
			Hinge = o.Hinge,
			Color = o.DoorColor,
			Material = Enum.Material.SmoothPlastic,
			Object = "Locker",
			Title = "Locker #" .. number,
			Info = "A player's locker: game jersey, pads, cleats and a lucky photo from home. Players suit up here before every game.",
			LookKey = "locker:" .. number,
			Distance = 6,
		})
		local leaf = door:FindFirstChild("DoorLeaf")
		if leaf then
			local gui = faceGui(leaf, Enum.NormalId.Front, "DoorNumberGui", 20)
			addLabel(gui, "DoorNumber", jerseyNumber, o.DoorTextColor, 0.18, 0.1, 0.64, 0.2)
			addFrame(gui, "DoorVent", shade(o.DoorColor, 0.7), 0.2, 0.36, 0.6, 0.03)
			addFrame(gui, "DoorVent", shade(o.DoorColor, 0.7), 0.2, 0.41, 0.6, 0.03)
		end
	end
	return plinth + doorH + header
end

--[[
	A bank of open locker stalls (the visitors don't get doors). `frame` is a plot-local CFrame at
	floor level on the wall face in the middle of the bank, its LookVector pointing into the room.
	o: Name, Length, Stalls, Height, Depth, First, BackColor, FrameColor, ShelfColor, SeatColor,
	   JerseyColor, NumberColor, Names, HelmetEvery, HelmetColor, Looks = { [n] = info }, Team
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
	-- end panels sit 0.1 inside the bank ends (no shared planes with the back / seat / shelf)
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
	local plates = faceGui(shelf, Enum.NormalId.Front, "NameplatesGui", 24)
	local plateColor = textColorOn(o.ShelfColor, { WHITE, INK })
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
		addLabel(
			plates,
			"Nameplate",
			o.Names[(number - 1) % #o.Names + 1],
			plateColor,
			(len / 2 - x - plateW / 2) / len,
			0.22,
			plateW / len,
			0.56,
			Enum.Font.GothamBold
		)
		if o.HelmetEvery and i % o.HelmetEvery == 0 then
			helmet(bank, frame * CFrame.new(x, H, -0.4 - inner / 2), 1.5, o.HelmetColor)
		end
	end
end

---------------------------------------------------------------------------------------------
-- Home Locker Room (event level under the home stands, +Z)
---------------------------------------------------------------------------------------------

function M.home_lockerroom(ctx)
	local team = ctx.colors
	local name = displayName(ctx)
	local P = HOME
	local wallMat = Enum.Material.SmoothPlastic
	local accent = textColorOn(SCREEN_BLACK, { team.Secondary, team.Trim, team.Primary })
	local carpet = shade(team.Primary, 0.45)

	-- Step 1: Tunnel & Walls ----------------------------------------------------------------
	BuildUtil.Stage(ctx, 1)
	local tunnel = BuildUtil.Child(ctx, "Tunnel")
	local doorLintel = corridorShell(tunnel, {
		z0 = P.TunnelZ,
		z1 = P.FrontZ0,
		floorZ1 = P.FrontZ0 + 0.5, -- (the room's floor starts there)
		wallColor = TUNNEL_WALL,
		wallMaterial = wallMat,
		floorColor = TUNNEL_RUBBER,
		floorMaterial = Enum.Material.Rubber,
		ceilingColor = TUNNEL_TOP,
		-- the doorway into the coaches' tunnel (the Coaches' Locker Room puts its door in it)
		doorway = { Side = -1, Z0 = COACH.DoorZ0, Z1 = COACH.DoorZ1, Top = COACH.DoorTop },
	})
	-- the team runway continues the bowl's tunnel runway right up to the doors
	box(
		tunnel,
		"TunnelRunway",
		-8,
		TUNNEL_FLOOR,
		P.TunnelZ,
		8,
		TUNNEL_FLOOR + 0.06,
		P.FrontZ0 + 0.5,
		team.Primary,
		Enum.Material.Fabric,
		PAINT
	)
	for _, s in ipairs({ -1, 1 }) do
		-- the bowl tunnel's team LED strip runs on along both walls (on the west wall, up to the
		-- coaches' doorway)
		local led = box(
			tunnel,
			"TunnelLED",
			s * (TUNNEL_IN - 0.12),
			LED_Y0,
			P.TunnelZ,
			s * TUNNEL_IN,
			LED_Y1,
			s < 0 and COACH.DoorZ0 - 0.4 or P.FrontZ0 - 0.4,
			team.Secondary,
			Enum.Material.Neon,
			PAINT
		)
		BuildUtil.Light(led, "PointLight", { Name = "TunnelGlow", Range = 18, Brightness = 1.1, Color = team.Secondary })
		local strip = box(
			tunnel,
			"TunnelCeilingLight",
			s * 5 - 0.5,
			TUNNEL_CEIL - 0.2,
			P.TunnelZ + 1,
			s * 5 + 0.5,
			TUNNEL_CEIL,
			P.FrontZ0 - 1,
			LAMP,
			Enum.Material.Neon,
			PAINT
		)
		BuildUtil.Light(strip, "PointLight", { Name = "TunnelLight", Range = 22, Brightness = 1.3, Color = WARM_LIGHT })
	end
	-- four team banners on the walls (two per side), alternating team colours (NEVER QUIT is painted
	-- over the coaches' doorway, on its lintel)
	local banners = {
		{ -1, 127, "PLAY\nHARD", team.Primary },
		{ 1, 127, "ONE\nTEAM", team.Secondary },
		{ 1, 134.5, "OUR\nHOUSE", team.Primary },
	}
	for index, b in ipairs(banners) do
		local s, z, text, color = b[1], b[2], b[3], b[4]
		local banner = box(
			tunnel,
			"TunnelBanner",
			s * (TUNNEL_IN - 0.12),
			6.6,
			z - 2.4,
			s * TUNNEL_IN,
			12.6,
			z + 2.4,
			color,
			Enum.Material.Fabric,
			PAINT
		)
		sign(banner, { s < 0 and Enum.NormalId.Right or Enum.NormalId.Left }, text, color, team, { InsetX = 0.1, InsetY = 0.16 })
		if index == 1 then
			BuildUtil.Look(
				banner,
				"Team Banners",
				"The team's rules, hung where every player sees them on the way out: play hard, never quit, one team - and this is OUR house!",
				{ At = Vector3.new(0, -3.4, 0), Distance = 8 }
			)
		end
	end
	if doorLintel then
		-- (on the lintel's corridor face, its Right face)
		local h, w = TUNNEL_CEIL - COACH.DoorTop, COACH.DoorZ1 - COACH.DoorZ0
		local gui = faceGui(doorLintel, Enum.NormalId.Right, "BannerGui", 20)
		addFrame(gui, "Banner", team.Secondary, 0.2 / w, 0.4 / h, 1 - 0.4 / w, 1 - 0.9 / h)
		local text = textColorOn(team.Secondary, { team.Trim, team.Primary, team.Secondary })
		addLabel(gui, "BannerText", "NEVER\nQUIT", text, 0.2 / w + 0.08, 0.4 / h + 0.1, 1 - 0.4 / w - 0.16, 1 - 0.9 / h - 0.2).ZIndex = 2
	end

	-- the front wall with the entrance (doors x -6..6), team door frame + the welcome sign
	local shell = BuildUtil.Child(ctx, "Rooms")
	local wallTop = P.Ceil + 0.4
	box(shell, "FrontWall", -P.WingOutX, 0, P.FrontZ0, -P.DoorHalf, wallTop, P.FrontZ1, HOME_WALL, wallMat)
	box(shell, "FrontWall", P.DoorHalf, 0, P.FrontZ0, P.WingOutX, wallTop, P.FrontZ1, HOME_WALL, wallMat)
	box(shell, "DoorLintel", -P.DoorHalf, P.DoorTop, P.FrontZ0, P.DoorHalf, wallTop, P.FrontZ1, HOME_WALL, wallMat)
	-- the portal around the doors: team panels from the doors to the corridor walls
	for _, s in ipairs({ -1, 1 }) do
		local portal = box(
			tunnel,
			"PortalPanel",
			s * P.DoorHalf,
			TUNNEL_FLOOR,
			P.FrontZ0 - 0.4,
			s * TUNNEL_IN,
			P.DoorTop + 0.4,
			P.FrontZ0,
			team.Primary
		)
		local gui = faceGui(portal, Enum.NormalId.Front, "PortalGui", 16)
		addFrame(gui, "PortalEdge", team.Secondary, s < 0 and 0.88 or 0, 0, 0.12, 1)
		addLabel(
			gui,
			"PortalText",
			s < 0 and "PLAYERS" or "ONLY",
			textColorOn(team.Primary, { team.Trim, team.Secondary }),
			0.12,
			0.4,
			0.76,
			0.1
		)
	end
	local welcome = box(tunnel, "WelcomeSign", -9.6, P.DoorTop + 0.4, P.FrontZ0 - 0.45, 9.6, 13.8, P.FrontZ0, SCREEN_BLACK)
	welcomeSign(welcome, Enum.NormalId.Front, "WELCOME TO THE", nil, name, { Text = accent, Header = WHITE })
	BuildUtil.Look(
		welcome,
		"Welcome Sign",
		"The last thing every player sees before the locker room - and the first thing on the way out to the field!",
		{ LookKey = "team", At = Vector3.new(0, -5, -2.5), Distance = 9 }
	)
	local doorH = P.DoorTop - FLOOR_TOP - 0.15
	BuildUtil.Door(shell, {
		Name = "EntranceDoors",
		Size = Vector3.new(2 * P.DoorHalf, doorH, 0.4),
		-- the doors face +Z (their LookVector) so they swing INTO the room
		CFrame = CFrame.new(0, FLOOR_TOP + 0.05 + doorH / 2, (P.FrontZ0 + P.FrontZ1) / 2) * CFrame.Angles(0, math.pi, 0),
		Double = true,
		Window = true,
		Color = team.Secondary,
		Material = Enum.Material.SmoothPlastic,
		Object = "Home Locker Room",
		Title = "Home Locker Room",
		Info = "Players and coaches only! Your team suits up in here before every home game.",
		Distance = 8,
	})

	-- main room: side walls (thick: they hide the raker columns), the side doorways, back wall
	for _, s in ipairs({ -1, 1 }) do
		local side = box(shell, "SideWall", s * P.InX, 0, P.SideZ, s * P.OutX, wallTop, P.BackOutZ, HOME_WALL, wallMat)
		-- the team name in big letters over the lockers, between two team stripes
		local sideGui = faceGui(side, s < 0 and Enum.NormalId.Right or Enum.NormalId.Left, "SideWallGui", 12)
		addFrame(sideGui, "TeamStripe", team.Primary, 0, 0.06, 1, 0.035)
		addFrame(sideGui, "TeamStripe", team.Secondary, 0, 0.3, 1, 0.02)
		addLabel(sideGui, "TeamName", name, team.Primary, 0.1, 0.11, 0.8, 0.17)
		local lintel = box(shell, "SideLintel", s * P.InX, P.SideTop, P.FrontZ1, s * P.OutX, wallTop, P.SideZ, HOME_WALL, wallMat)
		local gui = faceGui(lintel, s < 0 and Enum.NormalId.Right or Enum.NormalId.Left, "DoorwaySignGui", 20)
		addFrame(gui, "SignPlate", team.Primary, 0.08, 0.6, 0.84, 0.3)
		addLabel(
			gui,
			"DoorwaySign",
			s < 0 and "COACH'S OFFICE" or "SHOWERS",
			textColorOn(team.Primary, { team.Trim, team.Secondary }),
			0.12,
			0.63,
			0.76,
			0.24
		)
	end
	-- (between the side walls: no shared outer faces with them)
	local back = box(shell, "BackWall", -P.InX, 0, P.BackZ, P.InX, wallTop, P.BackOutZ, HOME_WALL, wallMat)
	box(shell, "Floor", -P.InX, 0, P.FrontZ0 + 0.5, P.InX, FLOOR_TOP, P.BackZ, carpet, Enum.Material.Carpet)
	box(shell, "Ceiling", -P.InX, P.Ceil, P.FrontZ1, P.InX, P.Ceil + 0.4, P.BackZ, CEILING)
	for _, s in ipairs({ -1, 1 }) do
		ceilingLight(shell, s * 14, 161, 2.4, 26, P.Ceil, 32, 1.4)
	end
	ceilingLight(shell, 0, 144.5, 12, 2.4, P.Ceil, 26, 1.3)
	-- team stripes across the top of the back wall (over the screens' row)
	local backGui = faceGui(back, Enum.NormalId.Front, "BackWallGui", 16)
	addFrame(backGui, "TeamStripe", team.Primary, 0, 0.035, 1, 0.04)
	addFrame(backGui, "TeamStripe", team.Secondary, 0, 0.085, 1, 0.015)

	-- the wings: coach's office (west, wood floor) and showers (east, tiles)
	for _, s in ipairs({ -1, 1 }) do
		local office = s < 0
		local wallColor = office and HOME_WALL or TILE
		local wallMaterial = office and wallMat or Enum.Material.CeramicTiles
		box(
			shell,
			office and "OfficeWall" or "ShowerWall",
			s * P.WingX,
			0,
			P.FrontZ1,
			s * P.WingOutX,
			P.WingCeil + 0.4,
			P.WingOutZ,
			wallColor,
			wallMaterial
		)
		box(
			shell,
			office and "OfficeWall" or "ShowerWall",
			s * P.OutX,
			0,
			P.WingZ,
			s * P.WingX,
			P.WingCeil + 0.4,
			P.WingOutZ,
			wallColor,
			wallMaterial
		)
		box(
			shell,
			office and "OfficeFloor" or "ShowerFloor",
			s * P.InX,
			0,
			P.FrontZ1,
			s * P.WingX,
			FLOOR_TOP,
			P.WingZ,
			office and OFFICE_FLOOR or TILE,
			office and Enum.Material.WoodPlanks or Enum.Material.CeramicTiles
		)
		box(
			shell,
			office and "OfficeCeiling" or "ShowerCeiling",
			s * P.OutX,
			P.WingCeil,
			P.FrontZ1,
			s * P.WingX,
			P.WingCeil + 0.4,
			P.WingZ,
			CEILING
		)
		ceilingLight(shell, s * 35.4, 151, 5, 5, P.WingCeil, 22, 1.2, office and WARM_LIGHT or COOL_LIGHT)
	end
	-- the coach's office door (glass panel), swinging into the office (-X)
	local sideH = P.SideTop - FLOOR_TOP - 0.15
	BuildUtil.Door(shell, {
		Name = "OfficeDoor",
		Size = Vector3.new(P.SideZ - P.FrontZ1 - 0.1, sideH, 0.3),
		CFrame = CFrame.new(-(P.InX + P.OutX) / 2, FLOOR_TOP + 0.05 + sideH / 2, (P.FrontZ1 + P.SideZ) / 2)
			* CFrame.Angles(0, math.pi / 2, 0),
		Hinge = "Left",
		Window = true,
		Color = WOOD,
		Material = Enum.Material.Wood,
		Object = "Coach's Office",
		Title = "Coach's Office",
		Info = "The head coach plans every game in here. Knock first!",
		Distance = 8,
	})

	-- Step 2: Lockers -----------------------------------------------------------------------
	-- 8 lockers on each side wall (1-8 west, south to north; 9-16 east, north to south), helmets
	-- on top, two padded benches facing the speech spot, the sports-drink cooler
	BuildUtil.Stage(ctx, 2)
	local lockers = BuildUtil.Child(ctx, "Lockers")
	local LK = HOME_LOCKERS
	local bankOpts = {
		Count = LK.Count,
		Width = LK.Width,
		Depth = LK.Depth,
		DoorHeight = 7.2,
		BackColor = WOOD_DARK,
		FrameColor = WOOD,
		HeaderColor = team.Secondary,
		DoorColor = team.Primary,
		DoorTextColor = textColorOn(team.Primary, { team.Secondary, team.Trim }),
		JerseyColor = team.Primary,
		NumberColor = textColorOn(team.Primary, { team.Trim, team.Secondary }),
		PlateColor = textColorOn(team.Secondary, { team.Primary, team.Trim }),
	}
	local west = table.clone(bankOpts)
	-- (both banks hinge on their south edges; only the south ends need end panels: the north
	-- ends stand against the back wall)
	west.Name, west.First, west.Hinge, west.Ends = "WestLockers", 1, "Left", { -1 }
	local lockerH = lockerBank(lockers, CFrame.new(-P.InX, FLOOR_TOP, LK.MidZ) * CFrame.Angles(0, -math.pi / 2, 0), west)
	local east = table.clone(bankOpts)
	east.Name, east.First, east.Hinge, east.Ends = "EastLockers", LK.Count + 1, "Right", { 1 }
	lockerBank(lockers, CFrame.new(P.InX, FLOOR_TOP, LK.MidZ) * CFrame.Angles(0, math.pi / 2, 0), east)
	-- a helmet on top of each bank, facemask toward the room
	for _, h in ipairs({ { -1, 152.4 }, { 1, 171.6 } }) do
		local turn = CFrame.Angles(0, h[1] * math.pi / 2, 0) -- LookVector (facemask) toward the room
		helmet(lockers, CFrame.new(h[1] * (P.InX - LK.Depth / 2), FLOOR_TOP + lockerH, h[2]) * turn, 1.8, team.Primary)
	end

	-- benches: a dark frame with three padded seats each; seated players face the podium (+Z)
	local seatColor = shade(team.Primary, 0.8)
	local facePodium = CFrame.Angles(0, math.pi, 0)
	for _, side in ipairs({ -1, 1 }) do
		local bx = side * 8
		box(
			lockers,
			"BenchFrame",
			bx - 5,
			FLOOR_TOP,
			BENCH_Z - 0.6,
			bx + 5,
			FLOOR_TOP + 1.25,
			BENCH_Z + 0.6,
			DARK_METAL,
			Enum.Material.Metal
		)
		for i = -1, 1 do
			local camera, object
			if i == 0 and side < 0 then
				object = "Bench - Team Talk Cam"
				camera = { From = Vector3.new(-7, 8.5, 150), To = SPEAKER_HEAD, Fov = 34, Label = "TEAM TALK CAM" }
			elseif i == 0 then
				object = "Bench - Tunnel Cam"
				camera = { From = Vector3.new(0, 7.5, 121), To = Vector3.new(0, 4, 60), Fov = 62, Label = "TUNNEL CAM - LIVE" }
			end
			BuildUtil.Seat(lockers, {
				Name = "BenchSeat",
				Size = Vector3.new(3, 0.5, 1.8),
				CFrame = CFrame.new(bx + i * 3.15, FLOOR_TOP + 1.5, BENCH_Z) * facePodium,
				Color = seatColor,
				Material = Enum.Material.Fabric,
				Object = object,
				Camera = camera,
				NoPrompt = camera == nil,
			})
		end
	end

	-- the sports-drink cooler in the north-west corner (beside the coach's speech spot)
	local coolerX, coolerZ = -17, 174.2
	local cooler = BuildUtil.Cylinder(lockers, {
		Name = "Cooler",
		Position = Vector3.new(coolerX, FLOOR_TOP + 1.7, coolerZ),
		Height = 3.4,
		Diameter = 2.2,
		Axis = "Y",
		Color = COOLER_ORANGE,
	})
	BuildUtil.Cylinder(lockers, {
		Name = "CoolerLid",
		Position = Vector3.new(coolerX, FLOOR_TOP + 3.6, coolerZ),
		Height = 0.4,
		Diameter = 2.3,
		Axis = "Y",
		Color = WHITE,
	})
	BuildUtil.Use(lockers, cooler, "sportsdrink", {
		Object = "Sports Drink Cooler",
		Title = "Sports Drink Cooler",
		Info = "Ice-cold and full of electrolytes. Grab a cup - every player hydrates before the big game!",
		Distance = 8,
	})

	-- Step 3: Coach's Office & Showers ---------------------------------------------------------
	BuildUtil.Stage(ctx, 3)
	local office = BuildUtil.Child(ctx, "CoachOffice")
	-- the desk faces the door (east); the coach's chair behind it, a guest chair in front
	local deskX0, deskX1, deskZ0, deskZ1 = -40.5, -36.5, 147, 155
	local desk = box(office, "Desk", deskX0 + 0.3, FLOOR_TOP, deskZ0 + 0.3, deskX1 - 0.3, 3, deskZ1 - 0.3, WOOD_DARK, Enum.Material.Wood)
	box(office, "DeskTop", deskX0, 3, deskZ0, deskX1, 3.3, deskZ1, WOOD, Enum.Material.Wood)
	BuildUtil.Look(
		desk,
		"Coach's Desk",
		"Game film, a stack of playbooks and three cold cups of coffee. The coach's record is taped to the lamp.",
		{ LookKey = "record", At = Vector3.new(0, 0.6, -4.3), Distance = 8 }
	)
	BuildUtil.Seat(office, {
		Name = "CoachChair",
		Size = Vector3.new(2, 1.8, 2),
		CFrame = CFrame.new(-42.4, FLOOR_TOP + 0.9, 151) * CFrame.Angles(0, -math.pi / 2, 0),
		Color = INK,
		Material = Enum.Material.Leather,
		Object = "Coach's Chair",
	})
	box(office, "CoachChairBack", -43.9, FLOOR_TOP, 150, -43.4, FLOOR_TOP + 5.2, 152, INK, Enum.Material.Leather)
	BuildUtil.Seat(office, {
		Name = "GuestChair",
		Size = Vector3.new(2, 1.6, 2),
		CFrame = CFrame.new(-33.6, FLOOR_TOP + 0.8, 151) * CFrame.Angles(0, math.pi / 2, 0),
		Color = shade(team.Primary, 0.8),
		Material = Enum.Material.Fabric,
		Object = "Guest Chair",
	})
	-- the STARTERS whiteboard on the office's back wall (live roster in marker)
	local board = box(office, "Whiteboard", -42.6, 3.2, P.WingZ - 0.2, -29.4, 9.4, P.WingZ, WHITEBOARD)
	local roster = liveScreen(board, Enum.NormalId.Front, "roster", "QB\nRB\nWR\nOL\nDEF\nK", {
		TextColor3 = MARKER_BLUE,
		BackgroundColor3 = WHITEBOARD,
		InsetX = 0.03,
		InsetY = 0.02,
		PixelsPerStud = 28,
	})
	roster.Size = UDim2.new(0.9, 0, 0.78, 0)
	roster.Position = UDim2.new(0.05, 0, 0.2, 0)
	addLabel(roster.Parent, "WhiteboardHeader", "GAME PLAN - TODAY'S STARTERS", MARKER_RED, 0.05, 0.03, 0.9, 0.14)
	BuildUtil.Look(
		board,
		"Coach's Whiteboard",
		"Today's starting lineup, in the coach's best handwriting. Train your players to raise their ratings!",
		{ LookKey = "rating", At = Vector3.new(-4.5, -1.6, -1.5), Distance = 7 }
	)
	-- the playbook library on the office's front wall
	local library = box(office, "PlaybookShelf", -43.4, FLOOR_TOP, P.FrontZ1, -36.4, 7.6, P.FrontZ1 + 1, WOOD, Enum.Material.Wood)
	local spines = faceGui(library, Enum.NormalId.Back, "PlaybookGui", 16)
	for row = 0, 2 do
		for i = 0, 9 do
			local color = (i + row) % 3 == 0 and team.Primary or ((i + row) % 3 == 1 and team.Secondary or WHITE)
			addFrame(spines, "Playbook", color, 0.06 + i * 0.088, 0.08 + row * 0.31, 0.07, 0.22)
		end
	end
	BuildUtil.Look(
		library,
		"Playbook Library",
		"Every play your team has ever run, in thick binders. The secret trick plays are on the top shelf.",
		{ At = Vector3.new(0, -0.6, 1.4), Distance = 7 }
	)
	-- a team rug under the desk, the coach's monitor (live team rating) and a leather couch
	box(
		office,
		"OfficeRug",
		-43.6,
		FLOOR_TOP,
		145.6,
		-31.8,
		FLOOR_TOP + 0.04,
		156.4,
		shade(team.Primary, 0.75),
		Enum.Material.Fabric,
		PAINT
	)
	local monitor = box(office, "CoachMonitor", -37.25, 3.3, 149.2, -36.95, 5.5, 152.8, SCREEN_BLACK, Enum.Material.SmoothPlastic, DECOR)
	liveScreen(monitor, Enum.NormalId.Left, "rating", "TEAM RATING 50", { TextColor3 = accent, PixelsPerStud = 30 })
	-- (the couch stands under the whiteboard, away from the lockers behind the east wall, so its
	-- prompt never shows through that wall; sitters face the desk side of the office)
	local couchX0, couchX1, couchZ0, couchZ1 = -37.4, -29.4, P.WingZ - 2.4, P.WingZ - 0.6
	local leather = shade(team.Primary, 0.6)
	box(office, "CouchBase", couchX0, FLOOR_TOP, couchZ0, couchX1, 1.2, couchZ1, WOOD_DARK, Enum.Material.Wood)
	box(office, "CouchBack", couchX0, FLOOR_TOP, couchZ1, couchX1, 2.9, P.WingZ, leather, Enum.Material.Leather)
	for _, x in ipairs({ couchX0 - 0.6, couchX1 }) do
		box(office, "CouchArm", x, FLOOR_TOP, couchZ0, x + 0.6, 2.4, P.WingZ, leather, Enum.Material.Leather)
	end
	BuildUtil.Seat(office, {
		Name = "Couch",
		Size = Vector3.new(couchX1 - couchX0, 0.6, couchZ1 - couchZ0),
		CFrame = CFrame.new((couchX0 + couchX1) / 2, 1.5, (couchZ0 + couchZ1) / 2),
		Color = leather,
		Material = Enum.Material.Leather,
		Object = "Coach's Couch",
	})

	-- showers: chrome pipes along the east + back walls with four heads, a cold tub, towels
	local showers = BuildUtil.Child(ctx, "Showers")
	local pipeY = 8
	box(showers, "ShowerPipe", P.WingX - 0.3, pipeY, 142, P.WingX, pipeY + 0.3, 158.5, CHROME, Enum.Material.Metal, DECOR)
	local pipe =
		box(showers, "ShowerPipe", 29, pipeY, P.WingZ - 0.3, P.WingX - 0.3, pipeY + 0.3, P.WingZ, CHROME, Enum.Material.Metal, DECOR)
	local heads = {
		{ Vector3.new(P.WingX - 0.6, 7.6, 145.5), 0 },
		{ Vector3.new(P.WingX - 0.6, 7.6, 152.5), 0 },
		{ Vector3.new(34.5, 7.6, P.WingZ - 0.6), 1 },
		{ Vector3.new(40, 7.6, P.WingZ - 0.6), 1 },
	}
	for _, h in ipairs(heads) do
		-- a chrome cone out of the wall, tilted down toward the room
		local turn = h[2] == 1 and CFrame.Angles(0, math.pi / 2, 0) or CFrame.new()
		BuildUtil.Part(showers, {
			Name = "ShowerHead",
			Shape = Enum.PartType.Cylinder,
			Size = Vector3.new(1.4, 0.75, 0.75),
			CFrame = CFrame.new(h[1]) * turn * CFrame.Angles(0, 0, math.rad(35)),
			Color = CHROME,
			Material = Enum.Material.Metal,
			CanCollide = false,
		})
	end
	BuildUtil.Look(
		pipe,
		"Showers",
		"Hot water, clouds of steam and the best singing echo in the whole stadium. The team hits the showers after every game.",
		{ At = Vector3.new(0, -4, -3), Distance = 9 }
	)
	-- the round steel cold tub (ice bath) in the middle of the shower room
	local tubX, tubZ = 35, 151.5
	local tub = BuildUtil.Cylinder(showers, {
		Name = "ColdTub",
		Position = Vector3.new(tubX, FLOOR_TOP + 1.2, tubZ),
		Height = 2.4,
		Diameter = 6,
		Axis = "Y",
		Color = Color3.fromRGB(150, 158, 168),
		Material = Enum.Material.Metal,
	})
	BuildUtil.Cylinder(showers, {
		Name = "ColdTubWater",
		Position = Vector3.new(tubX, FLOOR_TOP + 2.38, tubZ),
		Height = 0.2,
		Diameter = 5.2,
		Axis = "Y",
		Color = WATER,
		Material = Enum.Material.Glass,
		Transparency = 0.2,
		CanCollide = false,
	})
	BuildUtil.Look(
		tub,
		"Cold Tub",
		"Brrr! An ice bath for sore muscles after a big game. The bravest players jump in all the way.",
		{ At = Vector3.new(0.6, 0, -3.6), Distance = 8 } -- (cylinder space: local X is up)
	)
	-- tiled privacy partitions between the shower heads
	for _, w in ipairs({
		{ P.WingX - 3.4, 148.85, P.WingX, 149.15 },
		{ P.WingX - 3.4, 155.85, P.WingX, 156.15 },
		{ 37.1, P.WingZ - 3.4, 37.4, P.WingZ },
	}) do
		box(showers, "ShowerPartition", w[1], FLOOR_TOP, w[2], w[3], 7.4, w[4], TILE, Enum.Material.CeramicTiles)
	end
	-- a teak bench along the front wall (sitters face the showers)
	box(showers, "ShowerBenchBase", 33.5, FLOOR_TOP, P.FrontZ1 + 0.3, 39.5, 1.4, P.FrontZ1 + 1.3, TILE, Enum.Material.CeramicTiles)
	BuildUtil.Seat(showers, {
		Name = "ShowerBench",
		Size = Vector3.new(7, 0.4, 1.5),
		CFrame = CFrame.new(36.5, 1.6, P.FrontZ1 + 0.85) * CFrame.Angles(0, math.pi, 0),
		Color = WOOD,
		Material = Enum.Material.WoodPlanks,
		NoPrompt = true,
	})
	local towels = box(showers, "TowelShelf", 28.2, FLOOR_TOP, P.WingZ - 1.4, 33.2, 3.4, P.WingZ, WOOD, Enum.Material.Wood)
	local towelGui = faceGui(towels, Enum.NormalId.Front, "TowelGui", 16)
	for i = 0, 3 do
		addFrame(towelGui, "TowelStack", i % 2 == 0 and team.Primary or WHITE, 0.04 + i * 0.24, 0.12, 0.2, 0.32)
		addFrame(towelGui, "TowelStack", i % 2 == 0 and WHITE or team.Primary, 0.04 + i * 0.24, 0.56, 0.2, 0.32)
	end

	-- Step 4: Logo & Hype Screens ---------------------------------------------------------------
	BuildUtil.Stage(ctx, 4)
	local hype = BuildUtil.Child(ctx, "LogoAndScreens")
	-- the huge floor logo (reads from the doors and the benches) and the glowing ceiling halo
	BuildUtil.Cylinder(hype, {
		Name = "LogoRing",
		Position = Vector3.new(0, FLOOR_TOP + 0.02, LOGO_Z),
		Height = 0.04,
		Diameter = LOGO_D,
		Axis = "Y",
		Color = team.Secondary,
		CanCollide = false,
		CastShadow = false,
	})
	BuildUtil.Cylinder(hype, {
		Name = "LogoDisc",
		Position = Vector3.new(0, FLOOR_TOP + 0.04, LOGO_Z),
		Height = 0.08,
		Diameter = LOGO_D - 2,
		Axis = "Y",
		Color = team.Primary,
		CanCollide = false,
		CastShadow = false,
	})
	local logoName = BuildUtil.Part(hype, {
		Name = "LogoName",
		Size = Vector3.new(LOGO_D * 0.74, 0.02, LOGO_D * 0.42),
		CFrame = CFrame.new(0, FLOOR_TOP + 0.1, LOGO_Z) * CFrame.Angles(0, math.pi, 0),
		Transparency = 1,
		CanCollide = false,
		CastShadow = false,
	})
	local logoGui = faceGui(logoName, Enum.NormalId.Top, "LogoGui", 12)
	local logoText = textColorOn(team.Primary, { team.Trim, team.Secondary })
	addLabel(logoGui, "LogoStars", "* * *", textColorOn(team.Primary, { team.Secondary, team.Trim }), 0.3, 0.02, 0.4, 0.2)
	addLabel(logoGui, "LogoTeam", name, logoText, 0.02, 0.26, 0.96, 0.5)
	addLabel(logoGui, "LogoFootball", "FOOTBALL", logoText, 0.2, 0.78, 0.6, 0.2, Enum.Font.GothamBold)
	BuildUtil.Look(
		logoName,
		"Team Logo",
		"Your team's logo, right in the middle of the locker room. Team rule: nobody steps on the logo!",
		{ LookKey = "team", At = Vector3.new(0, 3, 0), Distance = 9 }
	)
	local halo = BuildUtil.Cylinder(hype, {
		Name = "CeilingHalo",
		Position = Vector3.new(0, P.Ceil - 0.15, LOGO_Z),
		Height = 0.2,
		Diameter = LOGO_D + 2,
		Axis = "Y",
		Color = LAMP,
		Material = Enum.Material.Neon,
		CanCollide = false,
		CastShadow = false,
	})
	BuildUtil.Light(halo, "PointLight", { Name = "HaloLight", Range = 34, Brightness = 1.6, Color = WARM_LIGHT })
	BuildUtil.Cylinder(hype, {
		Name = "CeilingHaloDisc",
		Position = Vector3.new(0, P.Ceil - 0.2, LOGO_Z),
		Height = 0.2,
		Diameter = LOGO_D - 1,
		Axis = "Y",
		Color = team.Primary,
		CanCollide = false,
		CastShadow = false,
	})

	-- the feature wall behind the speech spot: team panel, big live summary screen, motto
	local panel = box(hype, "FeatureWall", -10, FLOOR_TOP, P.BackZ - 0.3, 10, P.Ceil, P.BackZ, team.Primary)
	local panelGui = faceGui(panel, Enum.NormalId.Front, "FeatureWallGui", 16)
	addFrame(panelGui, "FeatureStripe", team.Secondary, 0, 0.47, 1, 0.025)
	addLabel(
		panelGui,
		"Motto",
		"LEAVE IT ALL ON THE FIELD",
		textColorOn(team.Primary, { team.Trim, team.Secondary }),
		0.06,
		0.52,
		0.88,
		0.07
	)
	local summary = box(hype, "SummaryScreen", -8.5, 9.6, P.BackZ - 0.6, 8.5, 15.2, P.BackZ - 0.3, SCREEN_BLACK)
	liveScreen(summary, Enum.NormalId.Front, "summary", name .. "\n0 - 0\nRECORD 0-0\nSEASON 1", { PixelsPerStud = 30 })
	local record = box(hype, "RecordScreen", -21.5, 10.2, P.BackZ - 0.3, -11.5, 14.6, P.BackZ, SCREEN_BLACK)
	liveScreen(record, Enum.NormalId.Front, "record", "RECORD 0-0", { TextColor3 = LED_GREEN })
	BuildUtil.Look(
		record,
		"Team Record",
		"Wins and losses, right where the whole team can see them. Every win goes up in lights!",
		{ LookKey = "record", At = Vector3.new(0, -6.5, -2.5), Distance = 8 }
	)
	local season = box(hype, "SeasonScreen", 11.5, 10.2, P.BackZ - 0.3, 21.5, 14.6, P.BackZ, SCREEN_BLACK)
	liveScreen(season, Enum.NormalId.Front, "season", "SEASON 1 - WEEK 1", { PixelsPerStud = 28 })
	local gameday = box(hype, "GameDayScreen", -5.6, P.DoorTop + 0.8, P.FrontZ1, 5.6, 15.2, P.FrontZ1 + 0.3, SCREEN_BLACK)
	liveScreen(gameday, Enum.NormalId.Back, "gameday", "NEXT GAME IN 4:00", { TextColor3 = accent })

	-- the pre-game speech podium: the speaker faces the benches; the camera watches from the logo
	local podium =
		box(hype, "Podium", -1.2, FLOOR_TOP, PODIUM_Z - 1.2, 1.2, 4.1, PODIUM_Z + 1.2, team.Secondary, Enum.Material.SmoothPlastic)
	sign(podium, { Enum.NormalId.Front }, name, team.Secondary, team, { InsetX = 0.08, InsetY = 0.36 })
	box(hype, "PodiumTop", -1.45, 4.1, PODIUM_Z - 1.4, 1.45, 4.4, PODIUM_Z + 1.4, WOOD, Enum.Material.Wood)
	strut(hype, "PodiumMic", Vector3.new(0, 4.4, PODIUM_Z + 0.6), Vector3.new(0, 5.2, PODIUM_Z + 1.5), 0.12, INK, Enum.Material.Metal)
	BuildUtil.Use(hype, podium, "podium", {
		Object = "Podium",
		Title = "Pre-Game Speech",
		Info = "Fire up the team before kickoff! Pick the best lines and your players run out ready to win.",
		At = Vector3.new(0, -0.3, 2.1), -- on the speaker's side
		Distance = 7,
		Camera = { From = Vector3.new(0, 6.8, 156.5), To = SPEAKER_HEAD + Vector3.new(0, 1.2, 0), Fov = 42 },
	})

	-- trophy shelf on the back wall (lights up with your championships)
	local backing = box(hype, "TrophyBacking", 11.5, 2.6, P.BackZ - 0.15, 21, 9.2, P.BackZ, team.Secondary)
	local title = sign(backing, { Enum.NormalId.Front }, "CHAMPIONS", team.Secondary, team)
	title.Size = UDim2.new(0.8, 0, 0.16, 0)
	title.Position = UDim2.new(0.1, 0, 0.04, 0)
	local shelf = box(hype, "TrophyShelf", 11.7, 4.4, P.BackZ - 1.3, 20.8, 4.7, P.BackZ - 0.15, WOOD, Enum.Material.Wood, DECOR)
	for i, tx in ipairs({ 13.6, 16.25, 18.9 }) do
		local size = i == 2 and 1.35 or 1
		BuildUtil.Ball(hype, {
			Name = "TrophyCup",
			Position = Vector3.new(tx, 4.7 + size * 0.8, P.BackZ - 0.7),
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
		{ LookKey = "titles", At = Vector3.new(0, -0.6, -1.4), Distance = 8 }
	)

	-- on the front wall (inside, either side of the doors): the hype mirror players check on their
	-- way out, and the game-day checklist
	local mirrorFrame = box(hype, "MirrorFrame", 13.6, 1.2, P.FrontZ1, 20.4, 11.2, P.FrontZ1 + 0.15, team.Secondary)
	local mirrorHead = faceGui(mirrorFrame, Enum.NormalId.Back, "MirrorGui", 20)
	addLabel(mirrorHead, "MirrorMotto", "LOOK GOOD. PLAY GOOD.", textColorOn(team.Secondary, { team.Primary, INK }), 0.06, 0.02, 0.88, 0.12)
	local mirror =
		box(hype, "HypeMirror", 14, 1.6, P.FrontZ1 + 0.15, 20, 9.6, P.FrontZ1 + 0.25, Color3.fromRGB(196, 214, 226), Enum.Material.Glass, {
			Reflectance = 0.35,
			CanCollide = false,
		})
	BuildUtil.Look(
		mirror,
		"Hype Mirror",
		"Eye black on? Chinstrap tight? Look yourself in the eye and say it: 'Today is OUR day!'",
		{ LookKey = "team", At = Vector3.new(0, -1.2, 1.2), Distance = 8 }
	)
	local checklist = box(hype, "ChecklistBoard", -20.5, 3.4, P.FrontZ1, -11.5, 9.4, P.FrontZ1 + 0.2, WHITEBOARD)
	local listGui = faceGui(checklist, Enum.NormalId.Back, "ChecklistGui", 20)
	addFrame(listGui, "ChecklistHeader", team.Primary, 0, 0, 1, 0.2)
	addLabel(
		listGui,
		"ChecklistTitle",
		"GAME-DAY CHECKLIST",
		textColorOn(team.Primary, { team.Trim, team.Secondary }),
		0.05,
		0.03,
		0.9,
		0.14
	)
	local items = addLabel(
		listGui,
		"ChecklistItems",
		"[X] TAPE ANKLES\n[X] PADS + HELMET\n[X] SLAP THE SIGN\n[  ] WIN THE GAME",
		MARKER_BLUE,
		0.08,
		0.25,
		0.84,
		0.7,
		Enum.Font.GothamBold
	)
	items.TextXAlignment = Enum.TextXAlignment.Left
	BuildUtil.Look(
		checklist,
		"Game-Day Checklist",
		"Ankles taped, pads on, sign slapped... just one box left to tick. Go out there and win it!",
		{ LookKey = "season", At = Vector3.new(0, -1.5, 1.4), Distance = 8 }
	)
end

---------------------------------------------------------------------------------------------
-- Coaches' Locker Room (event level under the home stands, west of the home locker room)
---------------------------------------------------------------------------------------------

-- A cap (crown + brim) resting at local `frame` (its bottom centre); the brim points along local -Z.
local function capProp(ctx, frame, d, crown, brim)
	BuildUtil.Part(ctx, {
		Name = "CapCrown",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(d * 0.42, d, d),
		CFrame = frame * CFrame.new(0, d * 0.21, 0) * CFrame.Angles(0, 0, math.rad(90)),
		Color = crown,
		Material = Enum.Material.Fabric,
		CanCollide = false,
	})
	lblock(ctx, frame, "CapBrim", Vector3.new(d * 0.78, 0.06, d * 0.5), 0, 0, -d * 0.62, brim, nil, DECOR)
end

-- A headset lying at local `frame` (its bottom centre): two ear cups w apart along local X, the
-- band across their tops.
local function headsetProp(ctx, frame, w, cups)
	for _, s in ipairs({ -1, 1 }) do
		BuildUtil.Part(ctx, {
			Name = "EarCup",
			Shape = Enum.PartType.Cylinder,
			Size = Vector3.new(0.22, w * 0.46, w * 0.46),
			CFrame = frame * CFrame.new(s * w / 2, w * 0.23, 0),
			Color = cups,
			CanCollide = false,
		})
	end
	lblock(ctx, frame, "HeadsetBand", Vector3.new(w + 0.22, 0.1, 0.18), 0, w * 0.46 - 0.04, 0, HEADSET_BLACK, nil, DECOR)
end

-- A clipboard with a play sheet (or a tablet showing a play) standing on its bottom edge at local
-- `frame`, its face along local -Z. Returns the board.
local function boardProp(ctx, frame, tablet)
	local size = tablet and Vector3.new(1.2, 0.9, 0.08) or Vector3.new(0.9, 1.2, 0.08)
	local board = lblock(ctx, frame, tablet and "Tablet" or "Clipboard", size, 0, 0, 0, tablet and INK or WOOD, nil, DECOR)
	local gui = faceGui(board, Enum.NormalId.Front, "PlayGui", 40)
	addFrame(gui, "Sheet", tablet and SCREEN_BLACK or WHITEBOARD, 0.08, tablet and 0.08 or 0.14, 0.84, tablet and 0.84 or 0.8)
	addLabel(gui, "Xs", "X  X  X", tablet and LED_GREEN or MARKER_BLUE, 0.14, 0.3, 0.72, 0.18).ZIndex = 2
	addLabel(gui, "Os", "O O O O", tablet and WHITE or MARKER_RED, 0.14, 0.56, 0.72, 0.18).ZIndex = 2
	if not tablet then
		addFrame(gui, "Clip", CHROME, 0.3, 0, 0.4, 0.1).ZIndex = 2
	end
	return board
end

-- A polo on its hanger, drawn on a back panel's GUI (like hangJersey; tops are measured from the
-- panel's top, x is the stall's centre along the panel).
local function hangPolo(gui, faceW, faceH, x, w, color, accent)
	local function rect(name, c, cx, top, width, height, z)
		local frame = addFrame(gui, name, c, (faceW / 2 - cx - width / 2) / faceW, top / faceH, width / faceW, height / faceH)
		frame.ZIndex = z
		return frame
	end
	rect("Hanger", CHROME, x, 2, 0.14, 0.6, 1)
	rect("PoloSleeves", color, x, 2.6, w - 1.1, 0.8, 2)
	rect("PoloBody", color, x, 2.6, w - 1.9, 2.8, 2)
	rect("PoloCollar", accent, x, 2.6, 0.9, 0.2, 3)
	rect("PoloPlacket", accent, x, 2.8, 0.12, 0.6, 3)
	rect("PoloLogo", accent, x - 0.5, 3.1, 0.3, 0.3, 3)
end

--[[
	The six coaches' open wooden stalls with their gear: a polo on a hanger (on the back panel's
	GUI), a cap on the top shelf, a headset and a clipboard (or a tablet) on the cubby, name plates
	on the shelf front and a look card per stall. `frame`: plot-local CFrame at floor level on the
	wall face in the middle of the bank, its LookVector into the room.
]]
local function coachStalls(ctx, frame, team)
	local bank = BuildUtil.Child(ctx, "CoachStalls")
	local n, w, H, D = #COACH_STALLS, 4, 8.6, 2.6
	local len = n * w
	local inner = D - 0.3 -- depth in front of the back panel
	local mid = -0.3 - inner / 2
	local back = lblock(bank, frame, "LockerBack", Vector3.new(len, H, 0.3), 0, 0, -0.15, WOOD_DARK, Enum.Material.Wood)
	lblock(bank, frame, "LockerCubby", Vector3.new(len, 1.6, inner), 0, 0, mid, shade(WOOD_DARK, 0.8), Enum.Material.Wood)
	local shelf = lblock(bank, frame, "LockerShelf", Vector3.new(len, 1, inner), 0, H - 1, mid, team.Secondary)
	-- dividers stand 0.15 proud of the cubby + shelf and stop 0.1 under the shelf top; the end ones
	-- sit 0.1 inside the bank's ends (no shared faces with the back, cubby or shelf)
	for i = 0, n do
		local x = math.clamp(-len / 2 + i * w, -len / 2 + 0.1, len / 2 - 0.1)
		lblock(
			bank,
			frame,
			"LockerDivider",
			Vector3.new(0.3, H - 0.1, inner + 0.15),
			x,
			0,
			-0.3 - (inner + 0.15) / 2,
			WOOD,
			Enum.Material.Wood
		)
	end
	local polos = faceGui(back, Enum.NormalId.Front, "PolosGui", 20)
	local plates = faceGui(shelf, Enum.NormalId.Front, "NameplatesGui", 24)
	local plateColor = textColorOn(team.Secondary, { team.Primary, INK, WHITE })
	for i, stall in ipairs(COACH_STALLS) do
		local x = -len / 2 + (i - 0.5) * w
		local odd = i % 2 == 1
		hangPolo(polos, len, H, x, w, odd and team.Primary or team.Secondary, odd and team.Secondary or team.Primary)
		local plateW = w - 0.6
		addLabel(
			plates,
			"Nameplate",
			stall.Plate,
			plateColor,
			(len / 2 - x - plateW / 2) / len,
			0.2,
			plateW / len,
			0.6,
			Enum.Font.GothamBold
		)
		-- the cap on the top shelf (brims toward the room, each a little turned), a headset and
		-- a clipboard or a tablet leaning on the back panel
		capProp(bank, frame * CFrame.new(x, H, mid) * CFrame.Angles(0, math.rad((i % 3 - 1) * 18), 0), 1.3, team.Primary, team.Secondary)
		headsetProp(bank, frame * CFrame.new(x + 0.9, 1.6, mid), 1, team.Secondary)
		local board = boardProp(bank, frame * CFrame.new(x - 0.9, 1.6, -0.55) * CFrame.Angles(math.rad(12), 0, 0), not odd)
		BuildUtil.Look(board, stall.Title, COACH_STALL_INFO[i], { LookKey = stall.LookKey, At = Vector3.new(0, 0, -1.6), Distance = 7 })
	end
end

-- A dress form showing an outfit, standing at (x, z) and facing -Z: base, pole, pants, torso and a
-- head (its centre FLOOR_TOP + 6.55). Returns the torso.
local function dressForm(ctx, x, z, torsoColor, legsColor)
	BuildUtil.Cylinder(ctx, {
		Name = "FormBase",
		Position = Vector3.new(x, FLOOR_TOP + 0.1, z),
		Height = 0.2,
		Diameter = 1.8,
		Axis = "Y",
		Color = DARK_METAL,
		Material = Enum.Material.Metal,
	})
	BuildUtil.Cylinder(ctx, {
		Name = "FormPole",
		Position = Vector3.new(x, FLOOR_TOP + 0.85, z),
		Height = 1.3,
		Diameter = 0.25,
		Axis = "Y",
		Color = CHROME,
		Material = Enum.Material.Metal,
		CanCollide = false,
	})
	box(ctx, "FormPants", x - 0.85, FLOOR_TOP + 1.5, z - 0.4, x + 0.85, FLOOR_TOP + 3.5, z + 0.4, legsColor, Enum.Material.Fabric)
	local torso = box(ctx, "FormTorso", x - 1, FLOOR_TOP + 3.5, z - 0.5, x + 1, FLOOR_TOP + 5.9, z + 0.5, torsoColor, Enum.Material.Fabric)
	BuildUtil.Ball(ctx, {
		Name = "FormHead",
		Position = Vector3.new(x, FLOOR_TOP + 6.55, z),
		Diameter = 1.2,
		Color = MANNEQUIN,
		CanCollide = false,
	})
	return torso
end

-- Two thin tilted strips (a lanyard) and a whistle on a GUI: the "V" from the collar down.
local function lanyardOn(gui, color)
	for _, s in ipairs({ -1, 1 }) do
		local strap = addFrame(gui, "Lanyard", color, 0.5 + s * 0.09 - 0.015, 0.02, 0.03, 0.36)
		strap.Rotation = s * 22 -- (clockwise: the right strap's top leans right, the left one's left)
		strap.ZIndex = 3
	end
	addFrame(gui, "LanyardWhistle", CHROME, 0.46, 0.36, 0.08, 0.1).ZIndex = 4
end

function M.coach_lockerroom(ctx)
	local team = ctx.colors
	local name = displayName(ctx)
	local C = COACH
	local W = C.Wall
	local accent = textColorOn(SCREEN_BLACK, { team.Secondary, team.Trim, team.Primary })
	local onWall = textColorOn(COACH_WALL, { team.Primary, team.Secondary, INK })

	-- Step 1: Coaches' Tunnel & Walls -------------------------------------------------------
	BuildUtil.Stage(ctx, 1)
	local tunnel = BuildUtil.Child(ctx, "CoachesTunnel")
	local tx0, tx1 = C.RoomX1 + W, -TUNNEL_OUT -- from the room's east wall to the home corridor's wall
	-- the door in the home corridor's doorway, swinging into the coaches' tunnel (west)
	local doorH = C.DoorTop - TUNNEL_FLOOR - 0.15
	local door = BuildUtil.Door(tunnel, {
		Name = "CoachesDoor",
		Size = Vector3.new(C.DoorZ1 - C.DoorZ0 - 0.1, doorH, 0.3),
		CFrame = CFrame.new(-(TUNNEL_IN + TUNNEL_OUT) / 2, TUNNEL_FLOOR + 0.05 + doorH / 2, (C.DoorZ0 + C.DoorZ1) / 2)
			* CFrame.Angles(0, math.pi / 2, 0),
		Hinge = "Left",
		Window = true,
		Color = team.Primary,
		Material = Enum.Material.SmoothPlastic,
		Object = "Coaches' Tunnel",
		Title = "Coaches' Tunnel",
		Info = "Coaches only! Their own tunnel runs from here to the coaches' locker room. On game day they walk out to the field through the players' tunnel, right behind the team.",
		Distance = 8,
	})
	local leaf = door:FindFirstChild("DoorLeaf")
	if leaf then
		-- (under the window: COACHES on the corridor side, TO THE FIELD on the coaches' side)
		local plate = textColorOn(team.Primary, { team.Secondary, team.Trim, WHITE })
		local outside = faceGui(leaf, Enum.NormalId.Back, "DoorSignGui", 24)
		addLabel(outside, "DoorSign", "COACHES", plate, 0.1, 0.58, 0.8, 0.08)
		addLabel(outside, "DoorSignSmall", "STAFF ONLY", plate, 0.2, 0.67, 0.6, 0.05, Enum.Font.GothamBold)
		local inside = faceGui(leaf, Enum.NormalId.Front, "DoorSignGui", 24)
		addLabel(inside, "DoorSign", "TO THE FIELD", plate, 0.1, 0.58, 0.8, 0.06)
	end
	-- a team-colour frame round the door on the corridor side
	for _, trim in ipairs({
		{ TUNNEL_FLOOR, C.DoorZ0 - 0.3, C.DoorTop + 0.3, C.DoorZ0 },
		{ TUNNEL_FLOOR, C.DoorZ1, C.DoorTop + 0.3, C.DoorZ1 + 0.3 },
		{ C.DoorTop, C.DoorZ0, C.DoorTop + 0.3, C.DoorZ1 },
	}) do
		box(tunnel, "DoorTrim", -TUNNEL_IN, trim[1], trim[2], -TUNNEL_IN + 0.1, trim[3], trim[4], team.Secondary, nil, PAINT)
	end
	-- floor (on under the room's doorway), walls, ceiling, a team runner and two lights
	box(tunnel, "TunnelFloor", C.RoomX1, 0, C.TunnelZ0, tx1, TUNNEL_FLOOR, C.TunnelZ1, TUNNEL_RUBBER, Enum.Material.Rubber)
	local walls = {}
	for index, z in ipairs({ { C.TunnelZ0 - W, C.TunnelZ0 }, { C.TunnelZ1, C.TunnelZ1 + W } }) do
		walls[index] = box(tunnel, "TunnelWall", tx0, 0, z[1], tx1, C.TunnelCeil + 0.4, z[2], COACH_TUNNEL_WALL)
	end
	box(tunnel, "TunnelCeiling", tx0, C.TunnelCeil, C.TunnelZ0, tx1, C.TunnelCeil + 0.4, C.TunnelZ1, TUNNEL_TOP)
	box(
		tunnel,
		"TunnelRunner",
		tx0,
		TUNNEL_FLOOR,
		C.TunnelZ0 + 1.6,
		tx1 - 0.6,
		TUNNEL_FLOOR + 0.04,
		C.TunnelZ1 - 1.6,
		team.Primary,
		Enum.Material.Fabric,
		PAINT
	)
	for _, x in ipairs({ -19, -37 }) do
		local lamp = box(tunnel, "TunnelLight", x - 0.6, C.TunnelCeil - 0.2, 131.6, x + 0.6, C.TunnelCeil, 134.4, FIXTURE, nil, PAINT)
		BuildUtil.Light(lamp, "PointLight", { Name = "TunnelLight", Range = 14, Brightness = 0.8, Color = NEUTRAL_LIGHT })
	end
	-- team stripes along both walls; on the south wall photos of the big moments to come
	local tunnelLength = tx1 - tx0
	local wallGuis = {}
	for index, wall in ipairs(walls) do
		local gui = faceGui(wall, index == 1 and Enum.NormalId.Back or Enum.NormalId.Front, "WallGui", 12)
		addFrame(gui, "TeamStripe", team.Primary, 0, 0.6, 1, 0.025)
		addFrame(gui, "TeamStripe", team.Secondary, 0, 0.632, 1, 0.012)
		wallGuis[index] = gui
	end
	local photos = wallGuis[1]
	for i, caption in ipairs({ "FIRST PRACTICE", "FIRST WIN", "PLAYOFFS!", "CHAMPIONS?" }) do
		local px = -41 + (i - 1) * 7.5 -- (the Back face's GUI x runs toward +X)
		local left, width = (px - 2.1 - tx0) / tunnelLength, 4.2 / tunnelLength
		addFrame(photos, "PhotoFrame", INK, left, 0.24, width, 0.28).ZIndex = 1
		addFrame(photos, "Photo", i % 2 == 1 and team.Primary or team.Secondary, left + 0.006, 0.25, width - 0.012, 0.21).ZIndex = 2
		addFrame(photos, "PhotoPlayer", i % 2 == 1 and team.Secondary or team.Primary, left + width * 0.4, 0.3, width * 0.2, 0.16).ZIndex =
			3
		addLabel(photos, "PhotoCaption", caption, WHITE, left + 0.004, 0.47, width - 0.008, 0.04, Enum.Font.GothamBold).ZIndex = 3
	end
	BuildUtil.Look(
		walls[1],
		"Coaching History",
		"Photos of the big moments: the first practice, the first win, the playoffs... The last frame is waiting for a championship photo!",
		{ LookKey = "titles", At = Vector3.new(-41 + 11.25 - (tx0 + tx1) / 2, 1.2, 0.9), Distance = 9 }
	)
	-- the coaching staff's sign (live team name) on the north wall
	local staff = box(tunnel, "StaffSign", -32, 6.2, C.TunnelZ1 - 0.25, -22, 9.8, C.TunnelZ1, SCREEN_BLACK)
	welcomeSign(staff, Enum.NormalId.Front, "COACHING STAFF", nil, name, { Text = accent, Header = WHITE })
	BuildUtil.Look(
		staff,
		"Coaching Staff",
		"The coaches' own tunnel. The head coach walks down here before every game, then out to the field with the team.",
		{ LookKey = "team", At = Vector3.new(0, -2.2, -1.6), Distance = 9 }
	)

	-- the room: walls (the east one with the double doors from the tunnel), floor, ceiling, lights
	local room = BuildUtil.Child(ctx, "CoachesRoom")
	local top = C.Ceil + 0.4
	local rx0, rx1, rz0, rz1 = C.RoomX0, C.RoomX1, C.RoomZ0, C.RoomZ1
	box(room, "WestWall", rx0 - W, 0, rz0 - W, rx0, top, rz1 + W, COACH_WALL)
	local south = box(room, "SouthWall", rx0, 0, rz0 - W, rx1, top, rz0, COACH_WALL)
	local north = box(room, "NorthWall", rx0, 0, rz1, rx1, top, rz1 + W, COACH_WALL)
	box(room, "EastWall", rx1, 0, rz0 - W, rx1 + W, top, C.EntryZ0, COACH_WALL)
	local eastNorth = box(room, "EastWall", rx1, 0, C.EntryZ1, rx1 + W, top, rz1 + W, COACH_WALL)
	local lintel = box(room, "EntryLintel", rx1, C.DoorTop, C.EntryZ0, rx1 + W, top, C.EntryZ1, COACH_WALL)
	box(room, "Floor", rx0, 0, rz0, rx1, FLOOR_TOP, rz1, shade(team.Primary, 0.4), Enum.Material.Carpet)
	box(room, "Ceiling", rx0, C.Ceil, rz0, rx1, top, rz1, COACH_CEILING)
	for _, x in ipairs({ -67, -55 }) do
		for _, z in ipairs({ 130, 140, 150 }) do
			local lamp = box(room, "CeilingLight", x - 1.2, C.Ceil - 0.2, z - 1.2, x + 1.2, C.Ceil, z + 1.2, FIXTURE, nil, PAINT)
			BuildUtil.Light(lamp, "PointLight", { Name = "RoomLight", Range = 16, Brightness = 0.9, Color = NEUTRAL_LIGHT })
		end
	end
	-- the room's name over its doors (in the strip under the tunnel's ceiling), team stripes and
	-- COACHING STAFF in big letters over the gear wall
	local over = faceGui(lintel, Enum.NormalId.Right, "EntrySignGui", 24)
	addLabel(over, "EntrySign", "COACHES' LOCKER ROOM", textColorOn(COACH_WALL, { INK, team.Primary }), 0.04, 0.64, 0.92, 0.3)
	for _, wall in ipairs({ { south, Enum.NormalId.Back }, { north, Enum.NormalId.Front }, { eastNorth, Enum.NormalId.Left } }) do
		local gui = faceGui(wall[1], wall[2], "WallGui", 20)
		addFrame(gui, "TeamStripe", team.Primary, 0, 0.1, 1, 0.025)
		addFrame(gui, "TeamStripe", team.Secondary, 0, 0.135, 1, 0.012)
		if wall[1] == south then
			addLabel(gui, "WallLettering", "COACHING STAFF", onWall, 0.1, 0.17, 0.8, 0.13)
		end
	end
	local entryH = C.DoorTop - FLOOR_TOP - 0.15
	BuildUtil.Door(room, {
		Name = "EntranceDoors",
		Size = Vector3.new(C.EntryZ1 - C.EntryZ0, entryH, 0.4),
		-- the doors face -X (their LookVector) so they swing INTO the room
		CFrame = CFrame.new(rx1 + W / 2, FLOOR_TOP + 0.05 + entryH / 2, (C.EntryZ0 + C.EntryZ1) / 2) * CFrame.Angles(0, math.pi / 2, 0),
		Double = true,
		Window = true,
		Color = WOOD,
		Material = Enum.Material.Wood,
		Object = "Coaches' Locker Room",
		Title = "Coaches' Locker Room",
		Info = "Where the coaching staff gets ready: their lockers, headsets, whistles and a wardrobe full of team outfits.",
		Distance = 8,
	})
	-- a team rug in the middle (reads from the doors): the live team name over COACHING STAFF
	local rugColor = shade(team.Primary, 0.75)
	local rug = BuildUtil.Part(room, {
		Name = "TeamRug",
		Size = Vector3.new(14, 0.04, 10),
		CFrame = CFrame.new(-58, FLOOR_TOP + 0.02, 139) * CFrame.Angles(0, math.pi / 2, 0),
		Color = rugColor,
		Material = Enum.Material.Fabric,
		CanCollide = false,
		CastShadow = false,
	})
	local rugGui = faceGui(rug, Enum.NormalId.Top, "RugGui", 12)
	local rugText = textColorOn(rugColor, { team.Trim, team.Secondary, WHITE })
	addFrame(rugGui, "RugBorder", team.Secondary, 0, 0, 1, 0.05)
	addFrame(rugGui, "RugBorder", team.Secondary, 0, 0.95, 1, 0.05)
	local rugTeam = addLabel(rugGui, "Live_team", name, rugText, 0.06, 0.16, 0.88, 0.4)
	rugTeam:SetAttribute("Live", "team")
	addLabel(rugGui, "RugStaff", "COACHING STAFF", rugText, 0.12, 0.62, 0.76, 0.2, Enum.Font.GothamBold)

	-- Step 2: Coaches' Lockers & Gear -------------------------------------------------------
	BuildUtil.Stage(ctx, 2)
	local lockers = BuildUtil.Child(ctx, "CoachLockers")
	coachStalls(lockers, CFrame.new(rx0, FLOOR_TOP, 140) * CFrame.Angles(0, -math.pi / 2, 0), team)
	-- the bench in front of the stalls: sitters face the coaches' board on the east wall
	box(lockers, "BenchFrame", -69.3, FLOOR_TOP, 130.6, -67.9, FLOOR_TOP + 1.25, 145.4, DARK_METAL, Enum.Material.Metal)
	for i, z in ipairs({ 133, 138, 143 }) do
		BuildUtil.Seat(lockers, {
			Name = "BenchSeat",
			Size = Vector3.new(4.8, 0.5, 1.8),
			CFrame = CFrame.new(-68.6, FLOOR_TOP + 1.5, z) * CFrame.Angles(0, -math.pi / 2, 0),
			Color = shade(team.Primary, 0.8),
			Material = Enum.Material.Fabric,
			Object = "Coaches' Bench",
			NoPrompt = i ~= 2,
		})
	end
	-- the playbook library on the east wall, beside the doors
	local library = box(lockers, "PlaybookShelf", rx1 - 1.2, FLOOR_TOP, rz0 + 0.6, rx1, 7.6, C.EntryZ0 - 0.6, WOOD, Enum.Material.Wood)
	local spines = faceGui(library, Enum.NormalId.Left, "PlaybookGui", 16)
	for row = 0, 2 do
		for i = 0, 8 do
			local color = (i + row) % 3 == 0 and team.Primary or ((i + row) % 3 == 1 and team.Secondary or WHITE)
			addFrame(spines, "Playbook", color, 0.06 + i * 0.098, 0.08 + row * 0.31, 0.08, 0.22)
		end
	end
	BuildUtil.Look(
		library,
		"Coaches' Playbooks",
		"Every play the coaches have ever drawn up, in fat binders: runs, passes, blitzes - and a whole shelf of trick plays.",
		{ At = Vector3.new(-1.3, -0.6, 0), Distance = 7 }
	)

	-- Step 3: Whistles & Headsets -----------------------------------------------------------
	BuildUtil.Stage(ctx, 3)
	local gear = BuildUtil.Child(ctx, "WhistlesAndHeadsets")
	-- the whistle rack on the south wall: six whistles on team lanyards (grab one!)
	local rackX0, rackX1 = -73, -66
	local rack = box(gear, "WhistleRack", rackX0, 4.4, rz0, rackX1, 7.8, rz0 + 0.25, team.Primary)
	local rackGui = faceGui(rack, Enum.NormalId.Back, "WhistleRackGui", 20)
	addLabel(rackGui, "RackTitle", "WHISTLES", textColorOn(team.Primary, { team.Trim, team.Secondary, WHITE }), 0.1, 0.04, 0.8, 0.2)
	for i = 1, 6 do
		local x = rackX0 + (i - 0.5) * (rackX1 - rackX0) / 6
		addFrame(rackGui, "Lanyard", team.Secondary, (x - rackX0) / (rackX1 - rackX0) - 0.012, 0.28, 0.024, 0.42) -- (GUI x runs toward +X)
		box(gear, "RackWhistle", x - 0.16, 4.75, rz0 + 0.25, x + 0.16, 5.15, rz0 + 0.7, CHROME, Enum.Material.Metal, DECOR)
	end
	BuildUtil.Use(gear, rack, "whistle", {
		Object = "Whistle Rack",
		Title = "Whistle Rack",
		Info = "Every coach needs a whistle! Grab one, then click (or tap) to blow it - everyone around hears the TWEEEET.",
		At = Vector3.new(0, -0.4, 1.3),
		Distance = 7,
	})
	-- the headset charging station: three headsets on top, green "charged" lights in front
	local station = box(gear, "HeadsetStation", -63.5, FLOOR_TOP, rz0, -57.5, 3.4, rz0 + 2, DARK_METAL, Enum.Material.Metal)
	local stationGui = faceGui(station, Enum.NormalId.Back, "ChargeGui", 20)
	addLabel(stationGui, "ChargeLabel", "HEADSETS - CHARGED", LED_GREEN, 0.08, 0.12, 0.84, 0.2, Enum.Font.GothamBold)
	for _, x in ipairs({ -62, -60.5, -59 }) do
		headsetProp(gear, CFrame.new(x, 3.4, rz0 + 1), 1.1, team.Secondary)
		addFrame(stationGui, "ChargeLED", LED_GREEN, (x + 63.5) / 6 - 0.03, 0.5, 0.06, 0.09)
	end
	BuildUtil.Look(
		station,
		"Headset Charging Station",
		"On game day every coach wears a headset to talk to the coaches up in the press box. All charged and ready!",
		{ At = Vector3.new(0, 0.4, 1.6), Distance = 7 }
	)
	-- the gear table by the doors: clipboards, a tablet and a stack of playbooks (grab a clipboard!)
	box(gear, "TableBase", -54.4, FLOOR_TOP, rz0 + 0.4, -49.6, 3.1, rz0 + 2.2, WOOD_DARK, Enum.Material.Wood)
	local tableTop = box(gear, "GearTable", -55, 3.1, rz0, -49, 3.4, rz0 + 2.6, WOOD, Enum.Material.Wood)
	-- (boards lying face up from their bottom edge, their top edge toward the wall: they read from the room)
	local flat = CFrame.Angles(0, math.pi, 0) * CFrame.Angles(math.pi / 2, 0, 0)
	boardProp(gear, CFrame.new(-53.9, 3.44, rz0 + 2) * flat, false)
	boardProp(gear, CFrame.new(-52.7, 3.44, rz0 + 2.1) * CFrame.Angles(0, math.rad(8), 0) * flat, false)
	boardProp(gear, CFrame.new(-51.2, 3.44, rz0 + 1.8) * flat, true)
	box(gear, "PlaybookStack", -50.2, 3.4, rz0 + 0.5, -49.3, 4.1, rz0 + 1.8, team.Primary, Enum.Material.Fabric, DECOR)
	BuildUtil.Use(gear, tableTop, "clipboard", {
		Object = "Clipboards",
		Title = "Clipboards",
		Info = "Grab a clipboard, then click (or tap) to draw up a play. Flea flicker, anyone?",
		At = Vector3.new(0, 0.6, 1.9),
		Distance = 7,
	})
	-- the coaches' board on the east wall: today's starters in marker (live roster)
	local board = box(gear, "CoachesBoard", rx1 - 0.2, 3.4, 139.5, rx1, 9.6, 152.5, WHITEBOARD)
	local _, roster = BuildUtil.LiveText(board, Enum.NormalId.Left, "roster", {
		LabelName = "Live_roster",
		Text = "QB\nRB\nWR\nOL\nDEF\nK",
		TextColor3 = MARKER_BLUE,
		Font = Enum.Font.GothamBold,
		PixelsPerStud = 28,
	})
	roster.Size = UDim2.new(0.9, 0, 0.74, 0)
	roster.Position = UDim2.new(0.05, 0, 0.22, 0)
	addLabel(roster.Parent, "BoardHeader", "COACHES' BOARD - TODAY'S STARTERS", MARKER_RED, 0.05, 0.04, 0.9, 0.13)
	BuildUtil.Look(
		board,
		"Coaches' Board",
		"Today's starters, in the head coach's handwriting. Draft and train better players to move up the board!",
		{ LookKey = "rating", At = Vector3.new(-1.4, -1.6, 0), Distance = 8 }
	)

	-- Step 4: Wardrobe & Mirrors ------------------------------------------------------------
	BuildUtil.Stage(ctx, 4)
	local wardrobe = BuildUtil.Child(ctx, "Wardrobe")
	-- the wardrobe wall: three dress forms in the outfits you can put on (in front of a team
	-- backboard with their names), a mirror at each end and your own clothes' cubby
	local formZ = rz1 - 1.6
	local backboard =
		box(wardrobe, "WardrobeWall", -71.4, FLOOR_TOP, rz1 - 0.2, -54.6, 8.6, rz1, shade(team.Primary, 0.5), Enum.Material.Wood)
	local boardGui = faceGui(backboard, Enum.NormalId.Front, "WardrobeGui", 16)
	local boardText = textColorOn(shade(team.Primary, 0.5), { team.Trim, team.Secondary, WHITE })
	local forms = {
		{ x = -68.4, outfit = "CoachPolo", use = "coachpolo", label = "HEAD COACH\nPOLO" },
		{ x = -63, outfit = "SidelineHoodie", use = "hoodie", label = "SIDELINE\nHOODIE" },
		{ x = -57.6, outfit = "TeamJersey", use = "jersey", label = "TEAM\nJERSEY" },
	}
	for _, form in ipairs(forms) do
		local outfit = Gear.Outfits[form.outfit]
		local torsoColor, _, legsColor = Gear.OutfitColors(form.outfit, team)
		local torso = dressForm(wardrobe, form.x, formZ, torsoColor or MANNEQUIN, legsColor or MANNEQUIN)
		-- the outfit's name on the backboard over the form (the Front face's GUI x runs toward -X)
		addLabel(boardGui, "OutfitName", form.label, boardText, (-63 - form.x - 2.2) / 16.8 + 0.5, 0.02, 4.4 / 16.8, 0.13)
		local gui = faceGui(torso, Enum.NormalId.Front, "OutfitGui", 30)
		local trim = textColorOn(torsoColor or MANNEQUIN, { team.Secondary, team.Trim, WHITE })
		if outfit.Cap then
			capProp(wardrobe, CFrame.new(form.x, FLOOR_TOP + 6.8, formZ), 1.3, team.Primary, team.Secondary)
			addFrame(gui, "PoloCollar", trim, 0.32, 0, 0.36, 0.08).ZIndex = 2
			lanyardOn(gui, team.Secondary)
		end
		if outfit.Hood then
			box(
				wardrobe,
				"Hood",
				form.x - 0.6,
				FLOOR_TOP + 5.6,
				formZ + 0.1,
				form.x + 0.6,
				FLOOR_TOP + 6.3,
				formZ + 0.65,
				shade(team.Primary, 0.85),
				Enum.Material.Fabric,
				DECOR
			)
			addFrame(gui, "HoodiePocket", shade(torsoColor or MANNEQUIN, 0.78), 0.2, 0.6, 0.6, 0.3).ZIndex = 2
			for _, s in ipairs({ -1, 1 }) do
				addFrame(gui, "Drawstring", WHITE, 0.5 + s * 0.08 - 0.01, 0.02, 0.02, 0.3).ZIndex = 2
			end
		end
		if outfit.Jersey then
			addFrame(gui, "ShoulderStripe", team.Secondary, 0, 0, 1, 0.07).ZIndex = 2
			addLabel(gui, "JerseyNumber", "1", trim, 0.25, 0.14, 0.5, 0.7).ZIndex = 2
		end
		-- (a short reach: standing in front of one form shows only its prompt)
		BuildUtil.Use(wardrobe, torso, form.use, { Object = outfit.Name, At = Vector3.new(0, -0.6, -1.4), Distance = 5 })
	end
	local mirrors = {}
	for index, x in ipairs({ -73.3, -52.7 }) do
		box(wardrobe, "MirrorFrame", x - 1.4, 0.9, rz1 - 0.15, x + 1.4, 9.6, rz1, team.Secondary)
		mirrors[index] = box(wardrobe, "Mirror", x - 1.1, 1.2, rz1 - 0.25, x + 1.1, 9.3, rz1 - 0.15, MIRROR_GLASS, Enum.Material.Glass, {
			Reflectance = 0.35,
			CanCollide = false,
		})
	end
	BuildUtil.Look(
		mirrors[1],
		"Mirror",
		"Looking sharp, Coach! Put on an outfit from the wardrobe - your own clothes wait in the YOUR CLOTHES cubby.",
		{ LookKey = "team", At = Vector3.new(0, -1.4, -1.2), Distance = 7 }
	)
	-- your own clothes' cubby (change back here) with its sign
	local cubby = box(wardrobe, "ClothesCubby", -50.6, FLOOR_TOP, rz1 - 1.8, -47.4, 4.6, rz1, WOOD, Enum.Material.Wood)
	local cubbyGui = faceGui(cubby, Enum.NormalId.Front, "CubbyGui", 20)
	addFrame(cubbyGui, "CubbyHole", WOOD_DARK, 0.1, 0.1, 0.8, 0.8).ZIndex = 1
	for i, color in ipairs({ Color3.fromRGB(70, 110, 170), Color3.fromRGB(200, 70, 60), Color3.fromRGB(90, 150, 90) }) do
		addFrame(cubbyGui, "FoldedClothes", color, 0.2, 0.86 - i * 0.16, 0.6, 0.14).ZIndex = 2
	end
	local cubbySign = box(wardrobe, "ClothesSign", -50.6, 5.2, rz1 - 0.15, -47.4, 7.4, rz1, team.Primary)
	sign(cubbySign, { Enum.NormalId.Front }, "YOUR\nCLOTHES", team.Primary, team, { InsetX = 0.08, InsetY = 0.12 })
	BuildUtil.Use(wardrobe, cubby, "changeback", { Object = "Your Own Clothes", At = Vector3.new(0, 0.4, -1.7), Distance = 7 })
	-- the changing bench: sitters face the wardrobe
	box(wardrobe, "ChangingBenchFrame", -67.5, FLOOR_TOP, 148.6, -58.5, FLOOR_TOP + 1.25, 149.8, WOOD_DARK, Enum.Material.Wood)
	for i, x in ipairs({ -65.2, -60.8 }) do
		BuildUtil.Seat(wardrobe, {
			Name = "ChangingBench",
			Size = Vector3.new(4.3, 0.5, 1.6),
			CFrame = CFrame.new(x, FLOOR_TOP + 1.5, 149.2) * CFrame.Angles(0, math.pi, 0),
			Color = WOOD,
			Material = Enum.Material.WoodPlanks,
			Object = "Changing Bench",
			NoPrompt = i ~= 1,
		})
	end
	-- the kick-off countdown over the wardrobe (live game-day screen)
	local screen = box(wardrobe, "KickoffScreen", -67, 9, rz1 - 0.3, -59, 11.6, rz1, SCREEN_BLACK)
	local kickoff = liveScreen(screen, Enum.NormalId.Front, "gameday", "NEXT GAME IN 4:00", { TextColor3 = accent, PixelsPerStud = 24 })
	kickoff.Position = UDim2.new(0, 0, 0.42, 0)
	kickoff.Size = UDim2.new(1, 0, 0.58, 0)
	addLabel(kickoff.Parent, "ScreenHeader", "BE DRESSED BY KICKOFF!", WHITE, 0.06, 0.06, 0.88, 0.32, Enum.Font.GothamBold).ZIndex = 2
end

---------------------------------------------------------------------------------------------
-- Visitor Locker Room (event level under the visitor stands, -Z)
---------------------------------------------------------------------------------------------

function M.visitor_lockerroom(ctx)
	local team = ctx.colors
	local name = displayName(ctx)
	local V = VISITOR
	local wallMat = Enum.Material.Concrete
	local midZ = (V.FrontZ0 + V.BackZ) / 2

	-- Step 1: Tunnel & Walls ----------------------------------------------------------------
	BuildUtil.Stage(ctx, 1)
	local tunnel = BuildUtil.Child(ctx, "Tunnel")
	corridorShell(tunnel, {
		z0 = V.TunnelZ,
		z1 = V.FrontZ1,
		floorZ1 = V.FrontZ1 - 0.5, -- (the room's floor starts there)
		wallColor = VISITOR_TUNNEL,
		wallMaterial = Enum.Material.Brick,
		floorColor = VISITOR_CONCRETE,
		floorMaterial = Enum.Material.Concrete,
		ceilingColor = CEILING,
	})
	-- two bare fluorescent tubes across the corridor
	for _, z in ipairs({ -66.5, -72 }) do
		local tube = box(
			tunnel,
			"TunnelCeilingLight",
			-3,
			TUNNEL_CEIL - 0.25,
			z - 0.3,
			3,
			TUNNEL_CEIL,
			z + 0.3,
			COOL_LIGHT,
			Enum.Material.Neon,
			PAINT
		)
		BuildUtil.Light(tube, "PointLight", { Name = "TunnelLight", Range = 18, Brightness = 0.9, Color = COOL_LIGHT })
	end
	-- the home team's sign the visitors have to walk under (live team name)
	local welcome =
		box(tunnel, "WelcomeSign", -8.5, V.DoorTop + 0.6, V.FrontZ1, 8.5, 13.6, V.FrontZ1 + 0.45, team.Primary, Enum.Material.SmoothPlastic)
	welcomeSign(welcome, Enum.NormalId.Back, "WELCOME TO THE HOME OF THE", "(GOOD LUCK!)", name, {
		Text = textColorOn(SCREEN_BLACK, { team.Secondary, team.Trim }),
		Header = WHITE,
	})
	BuildUtil.Look(
		welcome,
		"Not-So-Welcome Sign",
		"The home team hung their name right where the visitors have to walk under it. Feeling nervous yet?",
		{ LookKey = "team", At = Vector3.new(0, -5.5, 2.5), Distance = 9 }
	)
	local rules = box(tunnel, "RulesSign", -TUNNEL_IN, 4.2, -70.5, -TUNNEL_IN + 0.15, 8.4, -66.5, WHITE, Enum.Material.SmoothPlastic, PAINT)
	sign(rules, { Enum.NormalId.Right }, "HOME TEAM RULES\n1. THE HOME TEAM WINS.\n2. SEE RULE 1.", WHITE, team, {
		TextColor3 = INK,
		Font = Enum.Font.GothamBold,
		InsetX = 0.08,
		InsetY = 0.12,
	})
	BuildUtil.Look(rules, "Home Team Rules", "Short and simple. The visitors read it on the way in... and on the way out.", {
		At = Vector3.new(2, -1, 0),
		Distance = 8,
	})
	local plaque = box(tunnel, "Plaque", 4.6, 4, V.FrontZ1, 8.4, 6.2, V.FrontZ1 + 0.15, VISITOR_SIGN, Enum.Material.SmoothPlastic, PAINT)
	sign(plaque, { Enum.NormalId.Back }, "VISITORS\nLOCKER ROOM", VISITOR_SIGN, team, { TextColor3 = WHITE, InsetX = 0.08, InsetY = 0.12 })
	BuildUtil.Look(
		plaque,
		"Visitor Locker Room",
		"The visitors' locker room - smaller on purpose! Squeaky benches, warm drinks and no Wi-Fi keep the away team from getting comfortable.",
		{ At = Vector3.new(0, 0, 1), Distance = 8 }
	)

	-- the room: front wall with the door, side walls, back wall, floor, ceiling, two lights
	local shell = BuildUtil.Child(ctx, "Room")
	local wallTop = V.Ceil + 0.4
	box(shell, "FrontWall", -V.OutX, 0, V.FrontZ0, -V.DoorHalf, wallTop, V.FrontZ1, VISITOR_WALL, wallMat)
	box(shell, "FrontWall", V.DoorHalf, 0, V.FrontZ0, V.OutX, wallTop, V.FrontZ1, VISITOR_WALL, wallMat)
	local lintel = box(shell, "DoorLintel", -V.DoorHalf, V.DoorTop, V.FrontZ0, V.DoorHalf, wallTop, V.FrontZ1, VISITOR_WALL, wallMat)
	-- the corridor ceiling is higher than the room's: close the slot above the front wall
	box(shell, "Bulkhead", -TUNNEL_OUT, wallTop, V.FrontZ0, TUNNEL_OUT, TUNNEL_CEIL + 0.4, V.FrontZ1, VISITOR_WALL, wallMat)
	for _, s in ipairs({ -1, 1 }) do
		box(shell, "SideWall", s * V.InX, 0, V.BackOutZ, s * V.OutX, wallTop, V.FrontZ0, VISITOR_WALL, wallMat)
	end
	box(shell, "BackWall", -V.InX, 0, V.BackOutZ, V.InX, wallTop, V.BackZ, VISITOR_WALL, wallMat)
	box(shell, "Floor", -V.InX, 0, V.BackZ, V.InX, FLOOR_TOP, V.FrontZ1 - 0.5, VISITOR_FLOOR, Enum.Material.Concrete)
	box(shell, "Ceiling", -V.InX, V.Ceil, V.BackZ, V.InX, V.Ceil + 0.4, V.FrontZ0, CEILING)
	ceilingLight(shell, -8, midZ, 5, 2.4, V.Ceil, 22, 1.1, COOL_LIGHT)
	ceilingLight(shell, 8, midZ, 5, 2.4, V.Ceil, 22, 1.1, COOL_LIGHT)
	-- the GOOD LUCK sign over the inside of the door
	local goodLuck =
		box(shell, "GoodLuckSign", -V.DoorHalf, V.DoorTop + 0.3, V.FrontZ0 - 0.15, V.DoorHalf, V.Ceil - 0.2, V.FrontZ0, VISITOR_SIGN)
	sign(goodLuck, { Enum.NormalId.Front }, "GOOD LUCK. YOU'LL NEED IT.", VISITOR_SIGN, team, { TextColor3 = WHITE, InsetY = 0.16 })
	-- AWAY stencilled on the corridor face of the lintel, in the strip left under the welcome sign
	-- (y 8.8..9.4; the small letters get more pixels)
	local lintelGui = faceGui(lintel, Enum.NormalId.Back, "DoorStencilGui", 40)
	addLabel(lintelGui, "Stencil", "AWAY", WHITE, 0.3, 0.78, 0.4, 0.2)

	local doorH = V.DoorTop - FLOOR_TOP - 0.15
	BuildUtil.Door(shell, {
		Name = "EntranceDoor",
		Size = Vector3.new(2 * V.DoorHalf - 0.1, doorH, 0.35),
		-- the door faces -Z (its LookVector) so it swings INTO the room
		CFrame = CFrame.new(0, FLOOR_TOP + 0.05 + doorH / 2, (V.FrontZ0 + V.FrontZ1) / 2),
		Hinge = "Left",
		Window = true,
		Color = LOCKER_GREY_DARK,
		Material = Enum.Material.Metal,
		Object = "Visitors' Door",
		Title = "Visitor Locker Room",
		Info = "Where the away team gets ready. Squeaky, dusty and a little too cozy.",
		Distance = 8,
	})

	-- Step 2: Lockers -----------------------------------------------------------------------
	-- plain grey open stalls with white away jerseys: four on each side wall
	BuildUtil.Stage(ctx, 2)
	local lockerH = 8
	local stallOpts = {
		Height = lockerH,
		Depth = 2.6,
		Stalls = 4,
		Length = 15.2,
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
	local lockersZ = -88.6
	local west = table.clone(stallOpts)
	west.Name, west.First = "WestLockers", 1
	openStalls(ctx, CFrame.new(-V.InX, FLOOR_TOP, lockersZ) * CFrame.Angles(0, -math.pi / 2, 0), west)
	local east = table.clone(stallOpts)
	east.Name, east.First = "EastLockers", 5
	openStalls(ctx, CFrame.new(V.InX, FLOOR_TOP, lockersZ) * CFrame.Angles(0, math.pi / 2, 0), east)

	-- Step 3: Bench & Signs ------------------------------------------------------------------
	BuildUtil.Stage(ctx, 3)
	local stuff = BuildUtil.Child(ctx, "BenchAndSigns")

	-- one squeaky bench in the middle; sitters face the old TV on the back wall
	local benchX, benchZ = 0, -88
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
			CFrame = CFrame.new(benchX + i * 2.6, FLOOR_TOP + 1.45, benchZ),
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

	-- an old CRT TV on an AV cart against the back wall: it shows the live score
	local tvX, tvZ = 0, V.BackZ + 2.2
	box(stuff, "AVCart", tvX - 1.4, FLOOR_TOP, tvZ - 1.2, tvX + 1.4, FLOOR_TOP + 2.6, tvZ + 1.2, DARK_METAL, Enum.Material.Metal)
	local crtBottom = FLOOR_TOP + 2.6
	local crt = box(stuff, "CRT", tvX - 1.5, crtBottom, tvZ - 1.1, tvX + 1.5, crtBottom + 2.4, tvZ + 1.1, CRT_BEIGE)
	local crtScreen = box(
		stuff,
		"CRTScreen",
		tvX - 1.15,
		crtBottom + 0.3,
		tvZ + 1.1,
		tvX + 1.15,
		crtBottom + 2.1,
		tvZ + 1.18,
		SCREEN_BLACK,
		Enum.Material.SmoothPlastic,
		PAINT
	)
	liveScreen(crtScreen, Enum.NormalId.Back, "score", "HOME 0 - 0 VISITORS", { TextColor3 = LED_GREEN, PixelsPerStud = 30 })
	for _, s in ipairs({ -1, 1 }) do
		local base = Vector3.new(tvX, crtBottom + 2.4, tvZ - 0.3)
		strut(stuff, "BunnyEar", base, base + Vector3.new(s * 0.8, 1.5, -0.3), 0.06, DARK_METAL, Enum.Material.Metal)
	end
	BuildUtil.Look(
		crt,
		"Old TV",
		"An ancient TV on a wobbly cart. It only gets one channel: the score of today's game.",
		{ At = Vector3.new(0, -0.6, 1.6), Distance = 7 }
	)

	-- a cooler of lukewarm soda, a bin beside it and a sad WI-FI sign
	local cx, cz = 7, V.BackZ + 2
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
	local wifi = box(stuff, "WifiSign", cx - 1.8, 5.8, V.BackZ, cx + 1.8, 7.2, V.BackZ + 0.2, WHITE)
	sign(wifi, { Enum.NormalId.Back }, "WI-FI: NONE", WHITE, team, { TextColor3 = INK })
	-- the visitors' whole game plan, on a small whiteboard on the back wall
	local plan = box(stuff, "PlanBoard", -10, 4.2, V.BackZ, -5, 7.4, V.BackZ + 0.15, WHITE)
	sign(plan, { Enum.NormalId.Back }, "GAME PLAN:\nTRY NOT TO LOSE\nBY TOO MUCH", WHITE, team, {
		TextColor3 = MARKER_BLUE,
		Font = Enum.Font.GothamBold,
		InsetX = 0.08,
		InsetY = 0.12,
	})
	BuildUtil.Look(
		plan,
		"Visitors' Game Plan",
		"Their whole game plan, scribbled in a hurry: 'Try not to lose by too much.' Good luck with that!",
		{ At = Vector3.new(0, -0.8, 1.2), Distance = 7 }
	)

	-- the roof leaks: a stain on the ceiling, a falling drip, a bucket and a wet floor sign
	local leakX, leakZ = 10, -80.5
	BuildUtil.Cylinder(stuff, {
		Name = "CeilingStain",
		Position = Vector3.new(leakX, V.Ceil - 0.03, leakZ),
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
	local signX, signZ = leakX - 2, leakZ - 1.6
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

	-- a VISITORS mat inside the door (reads from the door, +Z) and the HOT WATER sign
	local mat = BuildUtil.Part(stuff, {
		Name = "VisitorMat",
		Size = Vector3.new(2 * V.DoorHalf + 1, 0.04, 3.4),
		CFrame = CFrame.new(0, FLOOR_TOP + 0.02, V.FrontZ0 - 2.4),
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
	local hotWater = box(stuff, "HotWaterSign", -V.InX, lockerH + 0.8, lockersZ - 4.5, -V.InX + 0.2, lockerH + 1.8, lockersZ + 4.5, WHITE)
	sign(hotWater, { Enum.NormalId.Right }, "HOT WATER: OUT OF ORDER", WHITE, team, { TextColor3 = Color3.fromRGB(190, 30, 30) })
end

return M
