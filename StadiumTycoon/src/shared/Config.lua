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
Config.PlotCount = 4 -- stadium plots per server (1 - 6). Set Max Players in Game Settings to the same number!
Config.StartingCash = 0
Config.IncomeMultiplier = 1 -- set to 10 or 100 while testing to build faster
Config.IncomeTickSeconds = 1 -- how often income is added to the vault
Config.AttendancePerIncome = 25 -- scoreboard "attendance" = income/sec * this

-- Saving -----------------------------------------------------------------------------------
Config.SaveEnabled = true
-- (v4: every piece is now built in steps with new ids, so V1-V3 test saves are not carried over)
Config.DataStoreName = "GridironStadiumTycoon_v4"
Config.AutosaveSeconds = 90

-- World ------------------------------------------------------------------------------------
Config.DayNightCycle = true
Config.DayLengthSeconds = 600 -- seconds for a full 24 hour day
Config.NightStartsAt = 18 -- ClockTime when stadium lights switch on
Config.NightEndsAt = 6.5 -- ClockTime when stadium lights switch off
Config.BuildAnimation = true
Config.RespawnAtPlot = true -- owners respawn at their own stadium
Config.ShowGuideBeam = true -- a glowing beam points to your next buy button

-- Game days: every IntervalSeconds a game day starts for everyone. Fans walk in, fill the
-- stands you've built, and income is multiplied for DurationSeconds.
Config.GameDay = {
	Enabled = true,
	IntervalSeconds = 240,
	DurationSeconds = 60,
	IncomeMultiplier = 2,
	SeatedFans = 150, -- max seated fans per stadium (spread over the stands you own)
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
local L = {}
L.PlotWidth = 560 -- X (the stadium area is X[-210,210]; the extra strips hold the fan zone and the cart road)
L.PlotDepth = 400 -- Z depth of the original stadium area (front edge at -PlotDepth/2)
L.PlotFrontZ = -200 -- front edge of the plot (faces the street)
L.PlotBackZ = 600 -- back edge of the plot (the team HQ + practice campus sit behind the stadium)
L.StreetWidth = 60 -- gap between the two rows of plots (spawn is in the middle)
L.PlotGap = 30 -- gap between neighbouring plots on the same side of the street
L.Yard = 2

L.FieldCenterZ = 30
L.FieldLength = 240 -- back of end zone to back of end zone (120 yards)
L.PlayLength = 200 -- goal line to goal line (100 yards)
L.EndZoneDepth = 20 -- 10 yards
L.FieldWidth = 106 -- ~53 yards
L.SidelineMargin = 12 -- turf between the sideline and the stands
L.EndMargin = 15 -- turf between the end line and the end-zone stands

L.RowDepth = 4
L.RowRise = 2
L.LowerRows = 6
L.UpperRows = 6
L.UpperStartHeight = 16 -- height of the first upper-deck row

L.TunnelHalfWidth = 14 -- gap in the front (visitor) stands for the players' tunnel
L.WalkwayHalfWidth = 12

-- Derived values (do not edit, they are computed from the values above)
L.FieldFrontZ = L.FieldCenterZ - L.FieldWidth / 2 -- -23
L.FieldBackZ = L.FieldCenterZ + L.FieldWidth / 2 -- 83
L.FieldHalfLength = L.FieldLength / 2 -- 120
L.GoalLineX = L.PlayLength / 2 -- 100
L.SurfaceMinZ = L.FieldFrontZ - L.SidelineMargin -- -35
L.SurfaceMaxZ = L.FieldBackZ + L.SidelineMargin -- 95
L.SurfaceHalfX = L.FieldHalfLength + L.EndMargin -- 135
L.LowerDepth = L.LowerRows * L.RowDepth -- 24
L.UpperDepth = L.UpperRows * L.RowDepth -- 24
L.LowerTopHeight = L.LowerRows * L.RowRise -- 12
L.UpperTopHeight = L.UpperStartHeight + (L.UpperRows - 1) * L.RowRise -- 26
L.SidelineStandsHalfLength = L.FieldHalfLength -- 120: sideline stands span X in [-120, 120]
L.FrontLowerOuterZ = L.SurfaceMinZ - L.LowerDepth -- -59
L.FrontUpperOuterZ = L.FrontLowerOuterZ - L.UpperDepth -- -83
L.BackLowerOuterZ = L.SurfaceMaxZ + L.LowerDepth -- 119
L.BackUpperOuterZ = L.BackLowerOuterZ + L.UpperDepth -- 143
L.EndLowerOuterX = L.SurfaceHalfX + L.LowerDepth -- 159
L.PlazaFrontZ = -L.PlotDepth / 2 -- -200
L.PlazaBackZ = L.FrontUpperOuterZ -- -83
L.EndUpperOuterX = L.EndLowerOuterX + L.UpperDepth -- 183
L.CornerStartX = L.SidelineStandsHalfLength -- 120: corner seats fill the bowl from here outward
L.BackTunnelHalfWidth = 14 -- gap in the home stands (lower + upper) for the home team tunnel

-- Full bowl: every seating row r (1-6 lower, 7-12 upper) is a rectangular ring around the turf.
-- Row r covers the band between these two rectangles (half-widths in X, front/back edges in Z):
--   inner: X = SurfaceHalfX + (r-1)*RowDepth, Z from SurfaceMinZ - (r-1)*RowDepth to SurfaceMaxZ + (r-1)*RowDepth
--   outer: the same with r instead of r-1
-- Row heights: lower r -> r*RowRise; upper r -> UpperStartHeight + (r-7)*RowRise.

-- Outside the bowl
L.LightTowerPositions = {
	Vector3.new(194, 0, 156),
	Vector3.new(-194, 0, 156),
	Vector3.new(194, 0, -90),
	Vector3.new(-194, 0, -90),
}

-- Team campus (behind the stadium) -----------------------------------------------------------
L.BackWalk = { MinX = -12, MaxX = 12, MinZ = 95, MaxZ = 172 } -- home tunnel -> campus road
L.CampusRoad = { MinX = -276, MaxX = 276, MinZ = 172, MaxZ = 186 }
L.HQEntranceWalk = { MinX = -112, MaxX = -88, MinZ = 186, MaxZ = 200 } -- campus road -> HQ front doors
L.BackRoad = { MinX = -276, MaxX = 276, MinZ = 372, MaxZ = 386 } -- behind the HQ, in front of the fields
L.CartRoad = { MinX = -276, MaxX = -256, MinZ = -196, MaxZ = 596 } -- road along the west edge for golf carts
L.BusStopPlaza = Vector3.new(-26, 0, -145)
L.BusStopCampus = Vector3.new(-150, 0, 179)

-- The Team HQ: a big building that starts EMPTY. Each room is a piece you build inside it.
-- The shell (outer walls, roof, floor, room outlines) is part of every plot from the start.
L.HQ = { MinX = -250, MaxX = 100, MinZ = 200, MaxZ = 360, Height = 30 }
L.HQCorridor = { MinX = -248, MaxX = 98, MinZ = 264, MaxZ = 278 } -- must stay walkable
L.HQSpawn = Vector3.new(-100, 0, 210) -- owners appear here (facing into the building)
L.HQSafePosition = Vector3.new(-75, 0, 212) -- collect pad in the lobby (the safe block sits 9 studs to +X)

-- Staff characters (one per hired step): plot-local feet positions
L.StaffSpots = {
	staff_coaches = { Vector3.new(-182, 0, 391), Vector3.new(-194, 0, 391), Vector3.new(-206, 0, 391) },
	staff_trainers = { Vector3.new(-90, 0, 391), Vector3.new(-102, 0, 391), Vector3.new(-114, 0, 391) },
	staff_vendors = { Vector3.new(-85, 0, -150), Vector3.new(-85, 0, -138), Vector3.new(-85, 0, -126) },
}

-- Golf carts spawn here (in front of the garage, facing -X)
L.CartPads = {
	Vector3.new(138, 0, 336),
	Vector3.new(138, 0, 348),
	Vector3.new(138, 0, 360),
}

-- Every piece outside the original stadium must stay inside its zone (the preview tool checks).
-- MinX/MaxX/MinZ/MaxZ are plot-local studs, MaxY is the height limit.
L.Zones = {
	-- HQ rooms, front row (doors open onto the corridor at z = 264)
	hq_frontoffice = { MinX = -248, MaxX = -200, MinZ = 202, MaxZ = 264, MaxY = 26 },
	hq_coaches = { MinX = -200, MaxX = -150, MinZ = 202, MaxZ = 264, MaxY = 26 },
	hq_lobby = { MinX = -150, MaxX = -50, MinZ = 202, MaxZ = 264, MaxY = 28 },
	hq_interview = { MinX = -50, MaxX = 0, MinZ = 202, MaxZ = 264, MaxY = 26 },
	hq_meeting = { MinX = 0, MaxX = 50, MinZ = 202, MaxZ = 264, MaxY = 26 },
	hq_lounge = { MinX = 50, MaxX = 98, MinZ = 202, MaxZ = 264, MaxY = 26 },
	-- HQ rooms, back row (doors open onto the corridor at z = 278)
	hq_lockerroom = { MinX = -248, MaxX = -200, MinZ = 278, MaxZ = 358, MaxY = 26 },
	hq_equipment = { MinX = -200, MaxX = -150, MinZ = 278, MaxZ = 358, MaxY = 26 },
	hq_weightroom = { MinX = -150, MaxX = -100, MinZ = 278, MaxZ = 358, MaxY = 26 },
	hq_trainingroom = { MinX = -100, MaxX = -50, MinZ = 278, MaxZ = 358, MaxY = 26 },
	hq_filmroom = { MinX = -50, MaxX = 0, MinZ = 278, MaxZ = 358, MaxY = 26 },
	hq_cafeteria = { MinX = 0, MaxX = 98, MinZ = 278, MaxZ = 358, MaxY = 26 },
	-- stadium press level (walk-in, reached by elevators)
	pressbox = { MinX = -44, MaxX = 44, MinZ = 143, MaxZ = 171, MaxY = 50 },
	suites = { MinX = -120, MaxX = 120, MinZ = -104, MaxZ = -83, MaxY = 40 },
	broadcast_booth = { MinX = -24, MaxX = 24, MinZ = -96, MaxZ = -66, MaxY = 40 },
	-- outdoors
	hall_of_fame = { MinX = 120, MaxX = 270, MinZ = 200, MaxZ = 320, MaxY = 40 },
	golf_carts = { MinX = 128, MaxX = 270, MinZ = 328, MaxZ = 368, MaxY = 20 },
	practice_field = { MinX = -250, MaxX = -10, MinZ = 396, MaxZ = 520, MaxY = 24 },
	practice_gear = { MinX = -250, MaxX = -10, MinZ = 396, MaxZ = 530, MaxY = 24 },
	indoor_dome = { MinX = 30, MaxX = 270, MinZ = 410, MaxZ = 540, MaxY = 50 },
	fan_zone = { MinX = 212, MaxX = 276, MinZ = -190, MaxZ = 150, MaxY = 30 },
}

-- Fixed (always present) plot features
L.GateZ = L.PlazaFrontZ + 3 -- -197
L.GateHalfWidth = 13
L.VaultPosition = Vector3.new(36, 0, -182)
L.CollectPadPosition = Vector3.new(22, 0, -182)
L.SpawnPosition = Vector3.new(0, 0, -188) -- where owners respawn (just inside the gate)

Config.Layout = L

return Config
