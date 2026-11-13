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
Config.PlotCount = 6 -- stadium plots per server (1 - 6). Set Max Players in Game Settings to the same number!
Config.StartingCash = 0
Config.IncomeMultiplier = 1 -- set to 10 or 100 while testing to build faster
Config.IncomeTickSeconds = 1 -- how often income is added to the vault
Config.AttendancePerIncome = 25 -- scoreboard "attendance" = income/sec * this

-- Saving -----------------------------------------------------------------------------------
Config.SaveEnabled = true
Config.DataStoreName = "GridironStadiumTycoon_v1"
Config.AutosaveSeconds = 90

-- World ------------------------------------------------------------------------------------
Config.DayNightCycle = true
Config.DayLengthSeconds = 600 -- seconds for a full 24 hour day
Config.NightStartsAt = 18 -- ClockTime when stadium lights switch on
Config.NightEndsAt = 6.5 -- ClockTime when stadium lights switch off
Config.BuildAnimation = true
Config.RespawnAtPlot = true -- owners respawn at their own stadium
Config.ShowGuideBeam = true -- a glowing beam points to your next buy button

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
L.PlotWidth = 420 -- X
L.PlotDepth = 400 -- Z
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

-- Fixed (always present) plot features
L.GateZ = L.PlazaFrontZ + 3 -- -197
L.GateHalfWidth = 13
L.VaultPosition = Vector3.new(36, 0, -182)
L.CollectPadPosition = Vector3.new(22, 0, -182)
L.SpawnPosition = Vector3.new(0, 0, -188) -- where owners respawn (just inside the gate)

Config.Layout = L

return Config
