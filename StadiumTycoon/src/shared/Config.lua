--[[
	Config
	All the numbers you are most likely to want to tweak live here.

	Coordinate system used by every builder (plot-local space):
	  * Origin = centre of the plot, on the walkable plot surface (y = 0).
	  * -Z is the FRONT of the plot (the side with the entrance gate, facing the street).
	  * +Z is the BACK of the plot.
	  * X runs left/right along the length of the football field.
	  * 1 yard = 2 studs.
]]

local Config = {}

-- General ----------------------------------------------------------------------------------
Config.GameTitle = "Gridiron Stadium Tycoon"
Config.PlotCount = 2 -- franchise plots per server (they are huge). Set Max Players in Game Settings to the same number!
Config.StartingCash = 0
Config.IncomeMultiplier = 1 -- set to 10 or 100 while testing to build faster
Config.IncomeTickSeconds = 1 -- how often income is added to the vault
Config.AttendancePerIncome = 25 -- scoreboard "attendance" = income/sec * this

-- Saving -----------------------------------------------------------------------------------
Config.SaveEnabled = true
-- (v5: the stadium was rebuilt with new pieces, so older test saves are not carried over)
Config.DataStoreName = "GridironStadiumTycoon_v5"
Config.AutosaveSeconds = 90

-- World ------------------------------------------------------------------------------------
Config.DayNightCycle = true
Config.DayLengthSeconds = 600 -- seconds for a full 24 hour day
Config.NightStartsAt = 18 -- ClockTime when stadium lights switch on
Config.NightEndsAt = 6.5 -- ClockTime when stadium lights switch off
-- Lamps: every built step goes through BuildUtil.TuneLighting, which tones down the lamps in
-- rooms and indoor halls and the glow of white Neon light panels, so rooms don't look washed out
-- (too white, too yellow, hazy). Outdoor lights and the stadium's flood lights are left alone.
-- Rooms too dark? Raise Brightness / MaxRange; too bright? lower them.
Config.Lighting = {
	-- HQ rooms, locker rooms, suites, press box, booths, shops, the Hall of Fame, the garage...
	Room = { Brightness = 0.55, MaxRange = 20, Neutral = 0.65 },
	-- concourses, gate halls, escalators, walkways, the HQ's halls, the event level, the dome
	Hall = { Brightness = 0.75, MaxRange = 40, Neutral = 0.5 },
	NeutralColor = Color3.fromRGB(255, 251, 245), -- lamp colours are blended toward this (less yellow)
	NeonWhiteLimit = 0.72, -- white/cream Neon panels in rooms and halls glow at most this bright (0..1)
	NeonYellowLimit = 0.85, -- strong yellow Neon in rooms glows at most this bright (0..1)
}
Config.BuildAnimation = true
-- A returning owner's franchise (and every team change) is rebuilt a few steps per frame: the
-- server spends at most this many seconds per frame on it, so nobody's game stalls.
Config.BuildFrameBudget = 0.008
Config.RespawnAtPlot = true -- owners respawn at their own stadium
Config.ShowGuideBeam = true -- a glowing beam points to your next buy button
-- The beam's button: the cheapest one in the part of the plot you are in (the HQ building, the
-- campus outdoors, the stadium, the plaza or the fan zone) while it costs at most ZoneCostFactor
-- times the cheapest one anywhere; otherwise that one. Re-checked every RecheckSeconds; the beam
-- only moves to another button when that one wins two checks in a row.
Config.GuideGoal = { RecheckSeconds = 2, ZoneCostFactor = 2.5 }

-- Game days: every franchise plays its own, and the OWNER starts them with the START GAME button
-- (HUD) once the goal posts are finished. Fans walk in and fill the stands you've built, your
-- income is multiplied for DurationSeconds and your team plays one game (a week of the season).
-- The next game is ready CooldownSeconds after one ends (set it to 10 while testing to play again
-- sooner).
Config.GameDay = {
	Enabled = true,
	CooldownSeconds = 150,
	DurationSeconds = 60,
	IncomeMultiplier = 2,
	SeatedFans = 1200, -- max seated fans per stadium (sections about half full, best seats first: see Crowd.lua)
	FansPerFrame = 150, -- seated fans arrive (and leave) this many per server frame, one stadium after the other
	WalkingFans = 8, -- fans that walk in through the gate at kick-off
}

-- Team identity: owners pick a palette (TeamColors above) and a nickname when they claim.
Config.TeamNicknames = {
	"Comets",
	"Thunderhawks",
	"Ironclads",
	"Mammoths",
	"Stingrays",
	"Wildfire",
	"Bulldogs",
	"Dragons",
	"Rhinos",
	"Cyclones",
	"Gladiators",
	"Yetis",
}

-- Owner's Bonus: a free cash gift every IntervalSeconds (claimed from the HUD).
Config.OwnerBonus = {
	IntervalSeconds = 480,
	MinimumCash = 250,
	IncomeSeconds = 90, -- the bonus is worth this many seconds of income (or MinimumCash)
	-- TESTING: while you play in Roblox Studio the bonus button is always ready and every click
	-- gives StudioTestCash. Published games ignore this (it only works in Studio), so it can stay
	-- on. Set StudioTestMode = false to test the normal 8-minute bonus in Studio.
	StudioTestMode = true,
	StudioTestCash = 1000000000, -- $1,000,000,000 per click
}

-- Hoverboard: every franchise owner gets one in their hotbar as soon as they claim (see
-- Hoverboard.lua and Hoverboard.client.lua). Pick it to ride, put it away to walk. While riding,
-- the jump is charged: a quick tap is a normal jump, holding jump charges it, up to
-- MaxJumpMultiplier times as high after ChargeSeconds.
Config.Hoverboard = {
	Enabled = true,
	Speed = 48, -- WalkSpeed while riding: 3x walking (16)
	HoverHeight = 0.8, -- the rider floats this much higher than on foot, the board under their feet
	MinJumpHeight = 7.2, -- studs: a quick tap is a normal jump
	MaxJumpMultiplier = 10, -- a full charge jumps this many times as high (72 studs)
	ChargeSeconds = 1.2, -- holding jump this long gives the full charge
	TapSeconds = 0.15, -- a press shorter than this is a normal jump (the charge starts after it)
	TipDelaySeconds = 8, -- the "You got a HOVERBOARD!" tip pops up this long after claiming
}

-- Draft + roster: draft players from the Front Office's draft board.
Config.Draft = {
	Positions = { "QB", "RB", "WR", "OL", "DEF", "K" },
	BaseRating = 50, -- worst possible draft pick
	RatingSpread = 22, -- random extra rating 0..RatingSpread
	CostIncomeSeconds = 60, -- a draft pick costs this many seconds of income (or MinimumCost)
	MinimumCost = 400,
	BenchSize = 12, -- players kept besides the starters
	EmptyPositionRating = 35,
	-- Training (needs the finished Weight Room): +1..3 rating for your weakest starter
	TrainCostIncomeSeconds = 25, -- a session costs this many seconds of income (or MinimumTrainCost)
	MinimumTrainCost = 250,
	TrainCooldownSeconds = 20,
	MaxTrainedRating = 95, -- training can't push a player past this (great draft picks can)
}

-- Seasons: every game day is one week of the season. Win enough regular-season games to reach
-- the playoffs (a semifinal, then the championship game). Titles are counted on the leaderboard.
Config.Season = {
	Weeks = 8,
	PlayoffWins = 5, -- regular-season wins needed for the playoffs
	PlayoffBoost = 4, -- playoff opponents are this much stronger
	ChampionshipIncomeSeconds = 900, -- extra prize for a title: this many seconds of income...
	MinimumChampionshipPrize = 25000, -- ...or at least this much
}

-- Field goal challenge (stadium field, once the goal posts are finished).
Config.KickGame = {
	CooldownSeconds = 3,
	-- difficulty: aim (-1..1) must land within AimTolerance of the centre, power (0..1) must reach
	-- PowerNeeded. Both get harder with distance:
	--   AimTolerance = max(AimMin, AimBase - yards * AimPerYard)
	--   PowerNeeded  = min(PowerMax, PowerBase + yards * PowerPerYard)
	AimBase = 0.32,
	AimPerYard = 0.0035,
	AimMin = 0.1,
	PowerBase = 0.35,
	PowerPerYard = 0.0105,
	PowerMax = 0.95,
	MeterSeconds = 1.6, -- how long one sweep of the aim / power meter takes
	MinMeterSeconds = 0.8, -- a kick sent back faster than this after the offer is ignored (no bots)
	MeterTimeoutSeconds = 15, -- an open meter closes by itself after this long (the offer stays live as long)
	RewardCooldownSeconds = 60, -- good kicks pay at most once per minute (the rest are practice)
	RewardIncomeSecondsPerYard = 0.25, -- reward = yards * 8 + base income * yards * this
	Spots = {
		{ Name = "SHORT", Yards = 25, Position = Vector3.new(70, 0, 30) },
		{ Name = "MEDIUM", Yards = 40, Position = Vector3.new(40, 0, 30) },
		{ Name = "LONG", Yards = 55, Position = Vector3.new(10, 0, 30) },
	},
}

-- Sounds (client only). Set Id = "" to turn one off, or paste your own "rbxassetid://123..." ids.
Config.Sounds = {
	Purchase = { Id = "rbxasset://sounds/electronicpingshort.wav", Volume = 0.6, Speed = 1 },
	Collect = { Id = "rbxasset://sounds/electronicpingshort.wav", Volume = 0.35, Speed = 1.5 },
	Error = { Id = "", Volume = 0.4, Speed = 0.8 },
}

-- Team colours: plot N uses palette N -------------------------------------------------------
Config.TeamColors = {
	{
		Name = "Navy & Orange",
		Primary = Color3.fromRGB(18, 44, 96),
		Secondary = Color3.fromRGB(245, 130, 32),
		Trim = Color3.fromRGB(245, 245, 245),
	},
	{
		Name = "Crimson & Gold",
		Primary = Color3.fromRGB(160, 24, 44),
		Secondary = Color3.fromRGB(255, 196, 37),
		Trim = Color3.fromRGB(245, 245, 245),
	},
	{
		Name = "Forest & Silver",
		Primary = Color3.fromRGB(22, 96, 58),
		Secondary = Color3.fromRGB(196, 202, 208),
		Trim = Color3.fromRGB(245, 245, 245),
	},
	{
		Name = "Purple & Black",
		Primary = Color3.fromRGB(84, 40, 140),
		Secondary = Color3.fromRGB(32, 32, 38),
		Trim = Color3.fromRGB(255, 200, 40),
	},
	{
		Name = "Teal & Black",
		Primary = Color3.fromRGB(0, 128, 140),
		Secondary = Color3.fromRGB(28, 28, 34),
		Trim = Color3.fromRGB(245, 245, 245),
	},
	{
		Name = "Royal & White",
		Primary = Color3.fromRGB(28, 78, 200),
		Secondary = Color3.fromRGB(240, 240, 245),
		Trim = Color3.fromRGB(220, 30, 40),
	},
}

-- Common colours --------------------------------------------------------------------------
Config.Colors = {
	Grass = Color3.fromRGB(58, 125, 52),
	GrassDark = Color3.fromRGB(50, 112, 45),
	Line = Color3.fromRGB(250, 250, 250),
	Concrete = Color3.fromRGB(150, 150, 155),
	ConcreteDark = Color3.fromRGB(110, 110, 116),
	Asphalt = Color3.fromRGB(52, 52, 58),
	Walkway = Color3.fromRGB(196, 190, 176),
	Metal = Color3.fromRGB(160, 165, 172),
	Glass = Color3.fromRGB(160, 210, 240),
	GoalPost = Color3.fromRGB(255, 214, 10),
	Gold = Color3.fromRGB(255, 190, 40),
	Wood = Color3.fromRGB(150, 105, 60),
	ButtonAffordable = Color3.fromRGB(40, 220, 90),
	ButtonTooExpensive = Color3.fromRGB(230, 60, 60),
	Vault = Color3.fromRGB(70, 75, 82),
	CollectPad = Color3.fromRGB(40, 220, 90),
	ClaimGate = Color3.fromRGB(255, 200, 40),
}

-- Layout (plot-local studs) ----------------------------------------------------------------
-- (V5) Each plot is a whole franchise campus: a 3-tier stadium in the middle, the entrance plaza in
-- front (-Z), the Team HQ + practice campus behind (+Z) and the tailgate fan zone to the east (+X).
-- See docs/V5-LAYOUT.md for the full plan.
--
-- AREAS: groups of pieces are built in their own frame, shifted from the plot origin. A piece's
-- builder, its button and its zone (L.Zones) all use the coordinates of its area; the game adds the
-- area's offset (Items.lua gives every piece an Area). So the HQ/campus builders still use the
-- coordinates they always had.
local L = {}
L.Areas = {
	stadium = Vector3.new(0, 0, 0), -- the field + bowl (and everything without an Area)
	campus = Vector3.new(0, 0, 120), -- Team HQ, practice fields, hall of fame, garage, dome
	plaza = Vector3.new(0, 0, -230), -- ticket booth, concessions, parking, team store, trophy, vendors
	fanzone = Vector3.new(220, 0, 0), -- tailgate & fan zone
}

L.PlotWidth = 1040 -- X[-520, 520]
L.PlotDepth = 920 -- the front half: the plot's front edge is at -PlotDepth/2
L.PlotFrontZ = -460 -- front edge of the plot (faces the street)
L.PlotBackZ = 720 -- back edge of the plot (behind the campus)
L.StreetWidth = 60 -- gap between the two plots (spawn is in the middle)
L.PlotGap = 30 -- gap between neighbouring plots on the same side of the street
L.Yard = 2

-- The football field (stadium area) ---------------------------------------------------------
L.FieldCenterZ = 30
L.FieldLength = 240 -- back of end zone to back of end zone (120 yards)
L.PlayLength = 200 -- goal line to goal line (100 yards)
L.EndZoneDepth = 20 -- 10 yards
L.FieldWidth = 106 -- ~53 yards
L.SidelineMargin = 12 -- turf between the sideline and the stands
L.EndMargin = 15 -- turf between the end line and the end-zone stands
L.FieldFrontZ = L.FieldCenterZ - L.FieldWidth / 2 -- -23
L.FieldBackZ = L.FieldCenterZ + L.FieldWidth / 2 -- 83
L.FieldHalfLength = L.FieldLength / 2 -- 120
L.GoalLineX = L.PlayLength / 2 -- 100
L.SurfaceMinZ = L.FieldFrontZ - L.SidelineMargin -- -35
L.SurfaceMaxZ = L.FieldBackZ + L.SidelineMargin -- 95
L.SurfaceHalfX = L.FieldHalfLength + L.EndMargin -- 135

--[[
	THE BOWL (V5): an octagonal 3-tier bowl around the turf rectangle (X +-135, Z -35..95).
	"Offset" = distance outward from the turf edge. At offset o the bowl outline is the turf
	rectangle pushed out by o on every side, with 45-degree corners (the corner lines pass through
	the turf corners at offset 0). Server/Bowl.lua turns this into row segments for builders + fans.

	Tier rows: row k of a tier covers offsets StartOffset + (k-1)*Depth .. StartOffset + k*Depth and
	its seating surface (top) is at height FirstHeight + (k-1)*Rise.
	  lower  14 rows, offsets   0..56, heights  4..30   (open to the main concourse at the top)
	  club    6 rows, offsets  56..80, heights 44..54   (above the main concourse)
	  upper  18 rows, offsets  80..152, heights 70..104 (above the club ring)
	Levels (floor heights) and the rings they occupy (offsets):
	  event level      y = 0   under the lower bowl's back rows + everything outside it (locker
	                           rooms, players' tunnels, entry halls, escalators)
	  main concourse   y = 30  offsets  56..84 (food, restrooms, merch; portals onto the lower bowl)
	  club ring        y = 54  offsets  80..108 (club lounge, suites, press box, broadcast booth)
	  upper concourse  y = 74  offsets 116..152 (under the upper deck's back rows; vomitories
	                           run inward under rows 9-18 and open onto a cross-aisle at upper row 3,
	                           which is at y = 74 too)
	  facade           offsets 152..160, up to y ~110 (gates through it at ground level)
]]
L.Bowl = {
	Depth = 4, -- every row is 4 studs deep
	Rise = 2, -- and 2 studs higher than the row in front
	Tiers = {
		lower = { Rows = 14, StartOffset = 0, FirstHeight = 4 },
		club = { Rows = 6, StartOffset = 56, FirstHeight = 44 },
		upper = { Rows = 18, StartOffset = 80, FirstHeight = 70 },
	},
	MainConcourse = { Inner = 56, Outer = 84, Floor = 30, Ceiling = 42 },
	ClubRing = { Inner = 80, Outer = 108, Floor = 54, Ceiling = 66 },
	UpperConcourse = { Inner = 116, Outer = 152, Floor = 74, Ceiling = 86 },
	Facade = { Inner = 152, Outer = 160, Top = 112 },
	-- players' tunnels: lower rows 1..TunnelRows are cut at |x| < TunnelHalfWidth on both
	-- sidelines; the tunnel continues under the higher rows to the locker rooms (event level)
	TunnelHalfWidth = 10,
	TunnelRows = 5,
	-- stair aisles: along each straight side, aisle centres sit at +-AisleFirst, +-(AisleFirst +
	-- AisleSpacing), ... from the side's centre; every corner has one aisle along its centre line
	AisleWidth = 3,
	AisleFirst = 26,
	AisleSpacing = 52,
	Capacity = 72000, -- what the scoreboard brags about
}
L.StadiumOuterOffset = L.Bowl.Facade.Outer -- 160
L.StadiumFrontZ = L.SurfaceMinZ - L.StadiumOuterOffset -- -195: front facade (Gate A)
L.StadiumBackZ = L.SurfaceMaxZ + L.StadiumOuterOffset -- 255: back facade (Gate D)
L.StadiumHalfX = L.SurfaceHalfX + L.StadiumOuterOffset -- 295: east / west facades (Gates C / B)

-- V4 values still read by Field.lua (bench lane) and older stadium code. New code uses L.Bowl.
L.RowDepth = 4
L.RowRise = 2
L.LowerRows = 6
L.UpperRows = 6
L.UpperStartHeight = 16
L.TunnelHalfWidth = 14
L.BackTunnelHalfWidth = 14 -- Field.lua keeps the bench area clear at |x| < 16 for the home tunnel
L.LowerDepth = L.LowerRows * L.RowDepth
L.UpperDepth = L.UpperRows * L.RowDepth
L.LowerTopHeight = L.LowerRows * L.RowRise
L.UpperTopHeight = L.UpperStartHeight + (L.UpperRows - 1) * L.RowRise
L.SidelineStandsHalfLength = L.FieldHalfLength
L.CornerStartX = L.SidelineStandsHalfLength
L.FrontLowerOuterZ = L.SurfaceMinZ - L.LowerDepth
L.FrontUpperOuterZ = L.FrontLowerOuterZ - L.UpperDepth
L.BackLowerOuterZ = L.SurfaceMaxZ + L.LowerDepth
L.BackUpperOuterZ = L.BackLowerOuterZ + L.UpperDepth
L.EndLowerOuterX = L.SurfaceHalfX + L.LowerDepth
L.EndUpperOuterX = L.EndLowerOuterX + L.UpperDepth

-- Light towers stand in the four corners outside the facade
L.LightTowerPositions = {
	Vector3.new(305, 0, 265),
	Vector3.new(-305, 0, 265),
	Vector3.new(305, 0, -205),
	Vector3.new(-305, 0, -205),
}

-- Entrance plaza (stadium-area coordinates) --------------------------------------------------
L.PlazaFrontZ = -L.PlotDepth / 2 -- -460
L.GateZ = L.PlazaFrontZ + 3 -- -457: the gold claim gate
L.GateHalfWidth = 13
L.WalkwayHalfWidth = 12 -- the walkway from the claim gate to Gate A
L.VaultPosition = Vector3.new(36, 0, -442)
L.CollectPadPosition = Vector3.new(22, 0, -442)
L.FieldCollectPadPosition = Vector3.new(0, 0, -29) -- on the field: the front sideline, by the visitors' tunnel
L.SpawnPosition = Vector3.new(0, 0, -448) -- just inside the claim gate (refs.GateCFrame); owners respawn in the HQ lobby (L.HQSpawn)
L.BusStopPlaza = Vector3.new(-26, 0, -375)
L.BackWalk = { MinX = -12, MaxX = 12, MinZ = L.StadiumBackZ, MaxZ = 292 } -- Gate D -> campus road
L.CartRoad = { MinX = -516, MaxX = -496, MinZ = -456, MaxZ = 716 } -- along the west edge

-- Team campus (CAMPUS-AREA coordinates: add L.Areas.campus for plot coordinates) ---------------
L.CampusRoad = { MinX = -516, MaxX = 516, MinZ = 172, MaxZ = 186 }
L.HQEntranceWalk = { MinX = -112, MaxX = -88, MinZ = 186, MaxZ = 200 } -- campus road -> HQ front doors
L.BackRoad = { MinX = -516, MaxX = 516, MinZ = 372, MaxZ = 386 } -- behind the HQ, in front of the fields
L.BusStopCampus = Vector3.new(-150, 0, 163) -- just south of the campus road: the shelter stays off the road

-- The Team HQ: a two-storey building that starts EMPTY. Each room is a piece you build inside it.
-- The shell (outer walls, roofs, both floors, stairs + elevator, room outlines) is always there.
L.HQ = { MinX = -250, MaxX = 100, MinZ = 200, MaxZ = 360, Height = 36, UpperFloorY = 17 }
L.HQCorridor = { MinX = -248, MaxX = 98, MinZ = 264, MaxZ = 278 } -- both floors: must stay walkable
L.HQAtrium = { MinX = -150, MaxX = -50, MinZ = 202, MaxZ = 264 } -- the lobby is open to the roof
L.HQSpawn = Vector3.new(-100, 0, 210) -- owners appear here (facing into the building)
L.HQSafePosition = Vector3.new(-75, 0, 212) -- collect pad in the lobby (the safe block sits 9 studs to +X)
-- (a guide-beam stair leg: a box of FEET positions and the points to walk to from it, up / down)
local function guideLeg(minX, maxX, minZ, maxZ, minY, maxY, up, down)
	return { MinX = minX, MaxX = maxX, MinZ = minZ, MaxZ = maxZ, MinY = minY, MaxY = maxY, Up = up, Down = down }
end
-- Guide-beam waypoints in and around the Team HQ (Effects.client.lua). A straight beam can't be
-- followed through the HQ's walls and floors, so it first points at a door, a corner of the
-- building, the lobby's lane onto the corridor or the stairs. Points stand on the floor; the
-- MinY/MaxY of a box are FEET heights. (Real positions from Builders/HQShell.lua, the lobby's
-- furniture in HQRoomsFront.lua, the grand staircase in HQRoomsUpperFront.lua and the skybridges in
-- CampusLinks.lua: tools/test_server.luau walks the lobby's legs through the real built parts.)
L.HQGuide = {
	-- inside the HQ: the main block (L.HQ) and its two towers
	Building = {
		{ MinX = -250, MaxX = 100, MinZ = 200, MaxZ = 360 },
		{ MinX = -262, MaxX = -250, MinZ = 249, MaxZ = 301 }, -- west stair tower
		{ MinX = 100, MaxX = 118, MinZ = 258, MaxZ = 284 }, -- east glass elevator tower
	},
	UpstairsY = 11, -- feet this high or higher: on the upper floor (its top is L.HQ.UpperFloorY)
	RoofY = 30, -- ... higher than this: on the roofs (no waypoints)
	-- outside, the beam goes round the whole block, by its corners (CornerMargin studs out). On the
	-- ground in the block but outside the building (the covered HQ walk, beside the west wall, behind
	-- the back wall) it first steps out of the block when the building is in the way.
	Block = { MinX = -262, MaxX = 118, MinZ = 198, MaxZ = 366 },
	CornerMargin = 4,
	-- up on the skybridges (campus_links steps 2 + 3, deck y 17, outside the building) the way into
	-- the HQ is the "Walk into the HQ" prompt at the bridge's HQ end (Builders/CampusLinks.lua): the
	-- beam points there (Door) for a goal in the HQ. FEET boxes.
	Bridges = {
		{ MinX = 118, MaxX = 142, MinZ = 212, MaxZ = 281, MinY = 15, MaxY = 20, Door = Vector3.new(122.4, 17, 271) }, -- link, Sky Lounge, Hall of Fame bridge + tower
		{ MinX = 100, MaxX = 120, MinZ = 284, MaxZ = 409.5, MinY = 15, MaxY = 20, Door = Vector3.new(109, 17, 288.4) }, -- Dome & Garage bridge + tower
	},
	-- the doors to the outside, a spot just inside and just outside each (the back wall has none);
	-- inside, the beam points at the spot inside first (so it never cuts through the glass beside a
	-- door), then through the door
	Doors = {
		{ Inside = Vector3.new(-100, 0.2, 208), Outside = Vector3.new(-100, 0.2, 194) }, -- main entrance (inside: clear of the plants by the doors)
		{ Inside = Vector3.new(-256, 0.2, 271), Outside = Vector3.new(-266, 0.2, 271) }, -- west doors (stair tower)
		{ Inside = Vector3.new(108, 0.2, 271), Outside = Vector3.new(122, 0.2, 271) }, -- east tower's open portal
	},
	-- The lobby (with the main entrance; its furniture is Builders/HQRoomsFront.lua, hq_lobby). It is
	-- open to the corridor all along, but the Team Wall (to x -111) and the trophy case (from x -86)
	-- leave one clear lane from the corridor into its front half: the beam leads through that lane,
	-- between OpenMinX and OpenMaxX (OpenZ: the corridor in front of it), and through the Hub on it.
	--   FrontZ: north of this, a spot in the front half (the entrance, the desk, the lounge, the
	--     stairs) is reached through the Hub
	--   ToLane: FEET boxes (the first one you stand in counts) where furniture stands between you and
	--     the Hub, and the point to walk to first to get onto the lane: on the way out of the lobby,
	--     and from the reception side (west of the lane) across it. Elsewhere: the Hub.
	--   Pockets: the strips behind the Team Wall and the trophy case only open onto the corridor:
	--     from them the beam leads straight out onto it first. They stop 2.5 studs short of the lane
	--     (the turn into it from the corridor starts that far out), so the way in never crosses them
	--     (that would turn the beam back onto the corridor)
	--   Doorway: just inside the main entrance, between the plants either side of it: from there, a
	--     spot beyond the plants (east or west) is reached through its Point
	Lobby = {
		MinX = -150,
		MaxX = -50,
		MinZ = 190,
		MaxZ = 264,
		OpenMinX = -108,
		OpenMaxX = -92,
		OpenZ = 268,
		Hub = Vector3.new(-100, 0.2, 243), -- in front of the Team Wall, on the runner
		FrontZ = 245.5,
		ToLane = { -- (the reception desk is x -136.6..-115.4, z 229.4..239.3; the HQ directory x -114..-108.5, z 216)
			{ MinX = -150, MaxX = -136.6, MinZ = 229.4, MaxZ = 240, Point = Vector3.new(-138, 0.2, 242.5) }, -- beside the desk's west wing
			{ MinX = -136.6, MaxX = -115.4, MinZ = 229.4, MaxZ = 240, Point = Vector3.new(-126, 0.2, 242) }, -- behind the desk
			{ MinX = -150, MaxX = -108, MinZ = 215.6, MaxZ = 240, Point = Vector3.new(-106, 0.2, 223) }, -- in front of the desk, beside it
			{ MinX = -150, MaxX = -108, MinZ = 200, MaxZ = 215.6, Point = Vector3.new(-106, 0.2, 212) }, -- the doors, the waiting sofa
			{ MinX = -71, MaxX = -50, MinZ = 200, MaxZ = 209, Point = Vector3.new(-76, 0.2, 208) }, -- south of the Team Safe
		},
		Pockets = {
			{ MinX = -150, MaxX = -110.5, MinZ = 249.5, MaxZ = 264 }, -- behind the Team Wall
			{ MinX = -89.5, MaxX = -50, MinZ = 256.3, MaxZ = 264 }, -- behind the trophy case
		},
		Doorway = { MinX = -117, MaxX = -83, MinZ = 200, MaxZ = 207.5, Point = Vector3.new(-100, 0.2, 209.5) },
	},
	-- stairs, in legs from the bottom up: standing in a leg's box, walk to its Up point (going up)
	-- or Down point (going down), each inside the next leg or off the stairs (never inside its own
	-- box, so nobody ends up standing on a hidden waypoint; nil = already there). Bottom / Top: where
	-- to step on, going up / down (inside a leg). A stair with a Room of its own is entered through
	-- its Door.
	Stairs = {
		{ -- the grand staircase in the atrium (the Grand Atrium's first step)
			Piece = "hq_atrium:1",
			Bottom = Vector3.new(-69, 0.2, 207), -- in front of the stairs, past the Team Safe (x -69..-63, z 209..215)
			Top = Vector3.new(-62, 17, 267), -- on the upper corridor in front of the east mezzanine (clear of the atrium railing)
			Legs = {
				guideLeg(-71, -50.3, 205.6, 208.4, -1, 4, Vector3.new(-54.5, 0.2, 209), Vector3.new(-76, 0.2, 208)), -- in front of the foot, along the Team Safe
				guideLeg(-63, -58.8, 208.4, 211.6, -1, 4, Vector3.new(-57, 0.2, 208.6), Vector3.new(-56, 0.2, 207)), -- the foot beside the west newel post
				guideLeg(-58.8, -50.3, 208.4, 211.6, -1, 4, Vector3.new(-54.5, 1.5, 212.5), Vector3.new(-56, 0.2, 207)), -- the foot, between the newel posts
				guideLeg(-58.7, -50.3, 211.6, 253, 0.9, 18, Vector3.new(-54.5, 17, 256), Vector3.new(-54.5, 0.2, 209)), -- flights
				guideLeg(-74.4, -50.3, 253, 264, 14, 19, Vector3.new(-62, 17, 267), Vector3.new(-54.5, 15, 251)), -- mezzanine
				guideLeg(-74.4, -50.3, 264, 269, 14, 19, nil, Vector3.new(-62, 17, 262)), -- the corridor in front of it
			},
		},
		{ -- the west stair tower's switchback stairs (always there)
			Room = { MinX = -262, MaxX = -250, MinZ = 249, MaxZ = 301 },
			Door = Vector3.new(-252, 0.2, 271), -- the ground doorway from the corridor
			Bottom = Vector3.new(-258.3, 1.2, 281.4), -- the first step
			Top = Vector3.new(-252, 17, 272), -- the upper landing, by the doorway onto the corridor
			Legs = {
				guideLeg(-261.5, -250, 273.5, 280.6, -1, 0.9, Vector3.new(-258.3, 1.2, 281.4), Vector3.new(-256, 0.2, 271)), -- the ground floor at its foot: to the doors
				guideLeg(-261.5, -255.5, 280.6, 295, 0.9, 9.5, Vector3.new(-258.3, 8.6, 297.5), Vector3.new(-258.3, 0.2, 278.5)), -- first flight
				guideLeg(-261.5, -255.5, 295, 300.5, 7, 10.5, Vector3.new(-252.7, 8.6, 297.5), Vector3.new(-258.3, 7, 293)), -- half landing W
				guideLeg(-255.5, -250, 295, 300.5, 7, 10.5, Vector3.new(-252.7, 10, 292), Vector3.new(-258.3, 8.6, 297.5)), -- half landing E
				guideLeg(-255.5, -250, 280.6, 295, 7, 18, Vector3.new(-252.7, 17, 278.5), Vector3.new(-252.7, 8.6, 297.5)), -- second flight
				guideLeg(-261.5, -250, 262, 280.6, 14, 18, Vector3.new(-247, 17, 271), Vector3.new(-252.7, 15.5, 283)), -- upper landing
			},
		},
	},
}

-- Staff characters (one per hired step): feet positions in their piece's area
L.StaffSpots = {
	staff_coaches = { Vector3.new(-182, 0, 391), Vector3.new(-194, 0, 391), Vector3.new(-206, 0, 391) },
	staff_trainers = { Vector3.new(-90, 0, 391), Vector3.new(-102, 0, 391), Vector3.new(-114, 0, 391) },
	staff_vendors = { Vector3.new(-85, 0, -150), Vector3.new(-85, 0, -138), Vector3.new(-85, 0, -126) },
}

-- Golf carts spawn here (campus area, in the garage's bays, facing -X: they drive out west onto a
-- 22-stud apron in front of the garage)
L.CartPads = {
	Vector3.new(148, 0, 336),
	Vector3.new(148, 0, 348),
	Vector3.new(148, 0, 360),
}

-- Every piece must stay inside its zone (the preview tool checks). Zones are in the piece's
-- AREA coordinates. MinX/MaxX/MinZ/MaxZ in studs, MaxY = height limit.
local UPPER = L.HQ.UpperFloorY
L.Zones = {
	-- HQ ground floor, front row (doors open onto the corridor at z = 264)
	hq_frontoffice = { MinX = -248, MaxX = -200, MinZ = 202, MaxZ = 264, MaxY = UPPER - 1 },
	hq_coaches = { MinX = -200, MaxX = -150, MinZ = 202, MaxZ = 264, MaxY = UPPER - 1 },
	hq_lobby = { MinX = -150, MaxX = -50, MinZ = 202, MaxZ = 264, MaxY = 34 },
	hq_interview = { MinX = -50, MaxX = 0, MinZ = 202, MaxZ = 264, MaxY = UPPER - 1 },
	hq_meeting = { MinX = 0, MaxX = 50, MinZ = 202, MaxZ = 264, MaxY = UPPER - 1 },
	hq_lounge = { MinX = 50, MaxX = 98, MinZ = 202, MaxZ = 264, MaxY = UPPER - 1 },
	-- HQ ground floor, back row (doors open onto the corridor at z = 278)
	hq_lockerroom = { MinX = -248, MaxX = -200, MinZ = 278, MaxZ = 358, MaxY = UPPER - 1 },
	hq_equipment = { MinX = -200, MaxX = -150, MinZ = 278, MaxZ = 358, MaxY = UPPER - 1 },
	hq_weightroom = { MinX = -150, MaxX = -100, MinZ = 278, MaxZ = 358, MaxY = UPPER - 1 },
	hq_trainingroom = { MinX = -100, MaxX = -50, MinZ = 278, MaxZ = 358, MaxY = UPPER - 1 },
	hq_filmroom = { MinX = -50, MaxX = 0, MinZ = 278, MaxZ = 358, MaxY = UPPER - 1 },
	hq_cafeteria = { MinX = 0, MaxX = 98, MinZ = 278, MaxZ = 358, MaxY = UPPER - 1 },
	-- HQ upper floor (floor top at y = UpperFloorY; the atrium is the open lobby below)
	hq_atrium = { MinX = -150, MaxX = -50, MinZ = 202, MaxZ = 264, MaxY = 34 },
	hq_owner = { MinX = -248, MaxX = -150, MinZ = 202, MaxZ = 264, MaxY = 34 },
	hq_media = { MinX = -50, MaxX = 0, MinZ = 202, MaxZ = 264, MaxY = 34 },
	hq_scouting = { MinX = 0, MaxX = 50, MinZ = 202, MaxZ = 264, MaxY = 34 },
	hq_analytics = { MinX = 50, MaxX = 98, MinZ = 202, MaxZ = 264, MaxY = 34 },
	hq_kitchen = { MinX = -248, MaxX = -150, MinZ = 278, MaxZ = 358, MaxY = 34 },
	hq_barber = { MinX = -150, MaxX = -100, MinZ = 278, MaxZ = 358, MaxY = 34 },
	hq_spa = { MinX = -100, MaxX = 0, MinZ = 278, MaxZ = 358, MaxY = 34 },
	hq_players = { MinX = 0, MaxX = 98, MinZ = 278, MaxZ = 358, MaxY = 34 },
	-- campus outdoors
	hall_of_fame = { MinX = 120, MaxX = 270, MinZ = 200, MaxZ = 320, MaxY = 40 },
	golf_carts = { MinX = 128, MaxX = 270, MinZ = 328, MaxZ = 368, MaxY = 20 },
	practice_field = { MinX = -250, MaxX = -10, MinZ = 396, MaxZ = 520, MaxY = 24 },
	practice_gear = { MinX = -250, MaxX = -10, MinZ = 396, MaxZ = 530, MaxY = 24 },
	indoor_dome = { MinX = 30, MaxX = 270, MinZ = 410, MaxZ = 540, MaxY = 50 },
	campus_links = { MinX = -262, MaxX = 282, MinZ = 186, MaxZ = 560, MaxY = 45 },
	-- fan zone (fan zone area)
	fan_zone = { MinX = 212, MaxX = 276, MinZ = -190, MaxZ = 150, MaxY = 30 },
	-- stadium (stadium area): bounding boxes of each piece
	lower_home = { MinX = -200, MaxX = 200, MinZ = 90, MaxZ = 155, MaxY = 36 },
	lower_visitor = { MinX = -200, MaxX = 200, MinZ = -95, MaxZ = -30, MaxY = 36 },
	lower_ends = { MinX = -196, MaxX = 196, MinZ = -60, MaxZ = 120, MaxY = 36 },
	lower_corners = { MinX = -196, MaxX = 196, MinZ = -96, MaxZ = 156, MaxY = 36 },
	home_lockerroom = { MinX = -80, MaxX = 80, MinZ = 95, MaxZ = 186, MaxY = 29 },
	-- the coaches' door in the home corridor's west wall (x -10.8..-10), their tunnel west of it and
	-- their room west of the coach's office (Builders/StadiumRooms.lua), under the hollow lower rows
	coach_lockerroom = { MinX = -80, MaxX = -9, MinZ = 120, MaxZ = 160, MaxY = 16 },
	visitor_lockerroom = { MinX = -80, MaxX = 80, MinZ = -126, MaxZ = -35, MaxY = 29 },
	main_concourse = { MinX = -226, MaxX = 226, MinZ = -126, MaxZ = 186, MaxY = 46 },
	concourse_food = { MinX = -226, MaxX = 226, MinZ = -126, MaxZ = 186, MaxY = 44 },
	concourse_restrooms = { MinX = -226, MaxX = 226, MinZ = -126, MaxZ = 186, MaxY = 44 },
	concourse_merch = { MinX = -226, MaxX = 226, MinZ = -126, MaxZ = 186, MaxY = 44 },
	club_seats = { MinX = -246, MaxX = 246, MinZ = -146, MaxZ = 206, MaxY = 60 },
	club_lounge = { MinX = -250, MaxX = 250, MinZ = -150, MaxZ = 210, MaxY = 70 },
	suites = { MinX = -250, MaxX = 250, MinZ = -150, MaxZ = 210, MaxY = 70 },
	pressbox = { MinX = -250, MaxX = 250, MinZ = -150, MaxZ = 210, MaxY = 72 },
	broadcast_booth = { MinX = -250, MaxX = 250, MinZ = -150, MaxZ = 210, MaxY = 72 },
	upper_home = { MinX = -292, MaxX = 292, MinZ = 100, MaxZ = 252, MaxY = 112 },
	upper_visitor = { MinX = -292, MaxX = 292, MinZ = -192, MaxZ = -40, MaxY = 112 },
	upper_ends = { MinX = -292, MaxX = 292, MinZ = -192, MaxZ = 252, MaxY = 112 },
	upper_concourse = { MinX = -292, MaxX = 292, MinZ = -192, MaxZ = 252, MaxY = 100 },
	gates = { MinX = -330, MaxX = 330, MinZ = -240, MaxZ = 292, MaxY = 60 },
	escalators = { MinX = -340, MaxX = 340, MinZ = -240, MaxZ = 292, MaxY = 96 },
	facade = { MinX = -320, MaxX = 320, MinZ = -225, MaxZ = 285, MaxY = 130 },
	scoreboard = { MinX = -320, MaxX = 320, MinZ = -225, MaxZ = 285, MaxY = 150 },
	jumbotron = { MinX = -320, MaxX = 320, MinZ = -225, MaxZ = 285, MaxY = 150 },
	lights = { MinX = -330, MaxX = 330, MinZ = -235, MaxZ = 295, MaxY = 170 },
	canopy = { MinX = -320, MaxX = 320, MinZ = -225, MaxZ = 285, MaxY = 140 },
}

Config.Layout = L

return Config
