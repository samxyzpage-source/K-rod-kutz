--[[
	PlotBase
	The parts every plot has before anything is bought: the concrete slab, the walkway,
	the entrance gate (touch it to claim the stadium), the cash vault and the collect pad,
	plus the paths, team-bus stops and team safe of the practice campus behind the stadium.
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)

local PlotBase = {}

-- A team-bus stop: a glowing pad with a shelter and a sign. Touching the pad rides the bus.
local function busStop(ctx, name, position, text)
	local C = ctx.config.Colors
	local team = ctx.colors
	local pad = BuildUtil.Box(
		ctx,
		name,
		Vector3.new(8, 0.4, 8),
		Vector3.new(position.X, 0.2, position.Z),
		Color3.fromRGB(60, 160, 255),
		Enum.Material.Neon
	)
	for _, side in ipairs({ -1, 1 }) do
		BuildUtil.Block(
			ctx,
			name .. "Post",
			Vector3.new(0.6, 9, 0.6),
			position + Vector3.new(side * 4.6, 0, 4.6),
			C.Metal,
			Enum.Material.Metal
		)
	end
	BuildUtil.Box(
		ctx,
		name .. "Roof",
		Vector3.new(10.5, 0.6, 3),
		position + Vector3.new(0, 9.3, 4.6),
		team.Primary,
		Enum.Material.SmoothPlastic
	)
	local board = BuildUtil.Box(
		ctx,
		name .. "Sign",
		Vector3.new(9.2, 3, 0.3),
		position + Vector3.new(0, 7, 4.6),
		Color3.fromRGB(25, 30, 40),
		Enum.Material.SmoothPlastic
	)
	for _, face in ipairs({ Enum.NormalId.Front, Enum.NormalId.Back }) do
		BuildUtil.SurfaceText(board, face, text, {
			LabelName = name .. "Text",
			TextColor3 = Color3.fromRGB(255, 255, 255),
			BackgroundColor3 = Color3.fromRGB(30, 90, 170),
			BackgroundTransparency = 0,
			PixelsPerStud = 30,
		})
	end
	BuildUtil.Billboard(pad, "TEAM BUS", {
		LabelName = name .. "Hint",
		Size = UDim2.new(8, 0, 2, 0),
		StudsOffset = Vector3.new(0, 3, 0),
		TextColor3 = Color3.fromRGB(150, 210, 255),
		MaxDistance = 90,
	})
	return pad
end

-- Returns references used by the PlotManager:
--   ClaimTrigger, GateSignLabel, GateBackLabel, VaultLabel, CollectPad, SpawnCFrame (world),
--   BusStopPlaza, BusStopCampus, BusArrivePlaza, BusArriveCampus (world CFrames),
--   CampusCollectPad, CampusVaultLabel
function PlotBase.PlotBase(ctx)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local team = ctx.colors

	-- Slab: top surface at y = 0, from the front edge (street) to the back of the campus
	local depth = L.PlotBackZ - L.PlotFrontZ
	local centerZ = (L.PlotBackZ + L.PlotFrontZ) / 2
	BuildUtil.Box(ctx, "PlotSlab", Vector3.new(L.PlotWidth, 1, depth), Vector3.new(0, -0.5, centerZ), C.Concrete, Enum.Material.Concrete)

	-- Team-coloured border around the edge of the plot
	local halfW = L.PlotWidth / 2
	local borderProps = { CanCollide = false }
	BuildUtil.Box(
		ctx,
		"BorderFront",
		Vector3.new(L.PlotWidth, 0.2, 2),
		Vector3.new(0, 0.1, L.PlotFrontZ + 1),
		team.Primary,
		Enum.Material.SmoothPlastic,
		borderProps
	)
	BuildUtil.Box(
		ctx,
		"BorderBack",
		Vector3.new(L.PlotWidth, 0.2, 2),
		Vector3.new(0, 0.1, L.PlotBackZ - 1),
		team.Primary,
		Enum.Material.SmoothPlastic,
		borderProps
	)
	BuildUtil.Box(
		ctx,
		"BorderLeft",
		Vector3.new(2, 0.2, depth - 4),
		Vector3.new(-halfW + 1, 0.1, centerZ),
		team.Primary,
		Enum.Material.SmoothPlastic,
		borderProps
	)
	BuildUtil.Box(
		ctx,
		"BorderRight",
		Vector3.new(2, 0.2, depth - 4),
		Vector3.new(halfW - 1, 0.1, centerZ),
		team.Primary,
		Enum.Material.SmoothPlastic,
		borderProps
	)

	-- Walkway from the gate to the players' tunnel
	local walkFront = L.PlazaFrontZ + 2
	local walkBack = L.SurfaceMinZ
	BuildUtil.Box(
		ctx,
		"Walkway",
		Vector3.new(L.WalkwayHalfWidth * 2, 0.1, walkBack - walkFront),
		Vector3.new(0, 0.05, (walkFront + walkBack) / 2),
		C.Walkway,
		Enum.Material.Pavement
	)

	-- Entrance gate ------------------------------------------------------------------------
	local gateZ = L.GateZ
	local pillarX = L.GateHalfWidth + 1.5
	for _, side in ipairs({ -1, 1 }) do
		BuildUtil.Block(ctx, "GatePillar", Vector3.new(3, 20, 3), Vector3.new(side * pillarX, 0, gateZ), team.Primary, Enum.Material.Brick)
		BuildUtil.Ball(ctx, {
			Name = "GatePillarBall",
			Diameter = 3.4,
			Position = Vector3.new(side * pillarX, 26.7, gateZ),
			Color = C.Gold,
			Material = Enum.Material.Metal,
		})
	end
	local beam = BuildUtil.Box(
		ctx,
		"GateBeam",
		Vector3.new(pillarX * 2 + 6, 5, 3),
		Vector3.new(0, 22.5, gateZ),
		team.Secondary,
		Enum.Material.SmoothPlastic
	)
	local _, gateSign = BuildUtil.SurfaceText(beam, Enum.NormalId.Front, "CLAIM THIS STADIUM", {
		LabelName = "GateSign",
		TextColor3 = team.Trim,
		BackgroundColor3 = team.Primary,
		BackgroundTransparency = 0,
		PixelsPerStud = 25,
	})
	local _, gateBack = BuildUtil.SurfaceText(beam, Enum.NormalId.Back, "GRIDIRON STADIUM", {
		LabelName = "GateBackSign",
		TextColor3 = team.Trim,
		BackgroundColor3 = team.Primary,
		BackgroundTransparency = 0,
		PixelsPerStud = 25,
	})

	local claimTrigger = BuildUtil.Box(
		ctx,
		"ClaimTrigger",
		Vector3.new(L.GateHalfWidth * 2 - 1, 19, 1.5),
		Vector3.new(0, 9.5, gateZ),
		C.ClaimGate,
		Enum.Material.Neon,
		{ Transparency = 0.55, CanCollide = false, CastShadow = false }
	)

	-- Cash vault + collect pad --------------------------------------------------------------
	local vaultPos = L.VaultPosition
	local vault = BuildUtil.Block(ctx, "Vault", Vector3.new(12, 12, 10), vaultPos, C.Vault, Enum.Material.DiamondPlate)
	BuildUtil.Block(ctx, "VaultRoof", Vector3.new(13, 1, 11), vaultPos, team.Secondary, Enum.Material.SmoothPlastic, nil, 12)
	BuildUtil.SurfaceText(vault, Enum.NormalId.Left, "$ VAULT $", {
		LabelName = "VaultTitle",
		TextColor3 = C.Gold,
		PixelsPerStud = 20,
	})
	local _, vaultLabel = BuildUtil.Billboard(vault, "$0", {
		LabelName = "VaultAmount",
		Size = UDim2.new(14, 0, 3.5, 0),
		StudsOffset = Vector3.new(0, 9.5, 0),
		TextColor3 = Color3.fromRGB(90, 255, 120),
		MaxDistance = 120,
	})

	local padPos = L.CollectPadPosition
	local collectPad =
		BuildUtil.Box(ctx, "CollectPad", Vector3.new(8, 0.4, 8), Vector3.new(padPos.X, 0.2, padPos.Z), C.CollectPad, Enum.Material.Neon)
	BuildUtil.Billboard(collectPad, "STEP HERE TO COLLECT", {
		LabelName = "CollectHint",
		Size = UDim2.new(10, 0, 2, 0),
		StudsOffset = Vector3.new(0, 3, 0),
		TextColor3 = Color3.fromRGB(255, 255, 255),
		MaxDistance = 80,
	})

	-- Practice campus paths ------------------------------------------------------------------
	local path = L.BackWalk
	BuildUtil.Box(
		ctx,
		"BackWalk",
		Vector3.new(path.MaxX - path.MinX, 0.1, path.MaxZ - path.MinZ),
		Vector3.new((path.MinX + path.MaxX) / 2, 0.05, (path.MinZ + path.MaxZ) / 2),
		C.Walkway,
		Enum.Material.Pavement
	)
	local road = L.CampusRoad
	BuildUtil.Box(
		ctx,
		"CampusRoad",
		Vector3.new(road.MaxX - road.MinX, 0.1, road.MaxZ - road.MinZ),
		Vector3.new((road.MinX + road.MaxX) / 2, 0.05, (road.MinZ + road.MaxZ) / 2),
		C.Walkway,
		Enum.Material.Pavement
	)
	local walk = L.CampusWalk
	BuildUtil.Box(
		ctx,
		"CampusWalk",
		Vector3.new(walk.MaxX - walk.MinX, 0.1, walk.MaxZ - walk.MinZ),
		Vector3.new((walk.MinX + walk.MaxX) / 2, 0.05, (walk.MinZ + walk.MaxZ) / 2),
		C.Walkway,
		Enum.Material.Pavement
	)
	-- campus entrance arch over the centre walk
	local archZ = walk.MinZ + 1.5
	for _, side in ipairs({ -1, 1 }) do
		BuildUtil.Block(
			ctx,
			"CampusArchPost",
			Vector3.new(2, 16, 2),
			Vector3.new(side * (walk.MaxX + 2), 0, archZ),
			team.Primary,
			Enum.Material.Brick
		)
	end
	local archBeam = BuildUtil.Box(
		ctx,
		"CampusArchBeam",
		Vector3.new((walk.MaxX + 3) * 2, 3.5, 2),
		Vector3.new(0, 17.75, archZ),
		team.Secondary,
		Enum.Material.SmoothPlastic
	)
	for _, face in ipairs({ Enum.NormalId.Front, Enum.NormalId.Back }) do
		BuildUtil.SurfaceText(archBeam, face, "PRACTICE FACILITY", {
			LabelName = "CampusArchText",
			TextColor3 = team.Trim,
			BackgroundColor3 = team.Primary,
			BackgroundTransparency = 0,
			PixelsPerStud = 25,
		})
	end

	-- Team bus stops (plaza <-> campus) -------------------------------------------------------
	local busPlaza = busStop(ctx, "BusStopPlaza", L.BusStopPlaza, "TEAM BUS > PRACTICE FACILITY")
	local busCampus = busStop(ctx, "BusStopCampus", L.BusStopCampus, "TEAM BUS > STADIUM")
	local facingBack = CFrame.Angles(0, math.pi, 0) -- local +Z, into the plot
	local arrivePlaza = CFrame.new(L.BusStopPlaza + Vector3.new(0, 4, 11)) * facingBack
	local arriveCampus = CFrame.new(L.BusStopCampus + Vector3.new(0, 4, 11)) * facingBack

	-- Team safe: a second collect pad at the campus (same vault)
	local safePos = L.CampusSafePosition
	local campusPad = BuildUtil.Box(
		ctx,
		"CampusCollectPad",
		Vector3.new(8, 0.4, 8),
		Vector3.new(safePos.X, 0.2, safePos.Z),
		C.CollectPad,
		Enum.Material.Neon
	)
	local safe = BuildUtil.Block(ctx, "TeamSafe", Vector3.new(6, 7, 6), safePos + Vector3.new(9, 0, 0), C.Vault, Enum.Material.DiamondPlate)
	BuildUtil.SurfaceText(safe, Enum.NormalId.Left, "TEAM SAFE", {
		LabelName = "TeamSafeTitle",
		TextColor3 = C.Gold,
		PixelsPerStud = 20,
	})
	local _, campusVaultLabel = BuildUtil.Billboard(safe, "$0", {
		LabelName = "CampusVaultAmount",
		Size = UDim2.new(12, 0, 3, 0),
		StudsOffset = Vector3.new(0, 6.5, 0),
		TextColor3 = Color3.fromRGB(90, 255, 120),
		MaxDistance = 120,
	})
	BuildUtil.Billboard(campusPad, "STEP HERE TO COLLECT", {
		LabelName = "CampusCollectHint",
		Size = UDim2.new(10, 0, 2, 0),
		StudsOffset = Vector3.new(0, 3, 0),
		TextColor3 = Color3.fromRGB(255, 255, 255),
		MaxDistance = 80,
	})

	local spawnLocal = CFrame.new(L.SpawnPosition + Vector3.new(0, 4, 0)) * CFrame.Angles(0, math.pi, 0)

	return {
		ClaimTrigger = claimTrigger,
		GateSignLabel = gateSign,
		GateBackLabel = gateBack,
		VaultLabel = vaultLabel,
		CollectPad = collectPad,
		SpawnCFrame = ctx.origin * spawnLocal,
		BusStopPlaza = busPlaza,
		BusStopCampus = busCampus,
		BusArrivePlaza = ctx.origin * arrivePlaza,
		BusArriveCampus = ctx.origin * arriveCampus,
		CampusCollectPad = campusPad,
		CampusVaultLabel = campusVaultLabel,
	}
end

return PlotBase
