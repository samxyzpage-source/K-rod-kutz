--[[
	PlotBase
	The parts every plot has before anything is bought: the concrete slab, the walkway,
	the entrance gate (touch it to claim the stadium), the cash vault and the collect pad.
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)

local PlotBase = {}

-- Returns references used by the PlotManager:
--   ClaimTrigger, GateSignLabel, GateBackLabel, VaultLabel, CollectPad, SpawnCFrame (world)
function PlotBase.PlotBase(ctx)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local team = ctx.colors

	-- Slab: top surface at y = 0
	BuildUtil.Box(ctx, "PlotSlab", Vector3.new(L.PlotWidth, 1, L.PlotDepth), Vector3.new(0, -0.5, 0), C.Concrete, Enum.Material.Concrete)

	-- Team-coloured border around the edge of the plot
	local halfW, halfD = L.PlotWidth / 2, L.PlotDepth / 2
	local borderProps = { CanCollide = false }
	BuildUtil.Box(
		ctx,
		"BorderFront",
		Vector3.new(L.PlotWidth, 0.2, 2),
		Vector3.new(0, 0.1, -halfD + 1),
		team.Primary,
		Enum.Material.SmoothPlastic,
		borderProps
	)
	BuildUtil.Box(
		ctx,
		"BorderBack",
		Vector3.new(L.PlotWidth, 0.2, 2),
		Vector3.new(0, 0.1, halfD - 1),
		team.Primary,
		Enum.Material.SmoothPlastic,
		borderProps
	)
	BuildUtil.Box(
		ctx,
		"BorderLeft",
		Vector3.new(2, 0.2, L.PlotDepth - 4),
		Vector3.new(-halfW + 1, 0.1, 0),
		team.Primary,
		Enum.Material.SmoothPlastic,
		borderProps
	)
	BuildUtil.Box(
		ctx,
		"BorderRight",
		Vector3.new(2, 0.2, L.PlotDepth - 4),
		Vector3.new(halfW - 1, 0.1, 0),
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

	local spawnLocal = CFrame.new(L.SpawnPosition + Vector3.new(0, 4, 0)) * CFrame.Angles(0, math.pi, 0)

	return {
		ClaimTrigger = claimTrigger,
		GateSignLabel = gateSign,
		GateBackLabel = gateBack,
		VaultLabel = vaultLabel,
		CollectPad = collectPad,
		SpawnCFrame = ctx.origin * spawnLocal,
	}
end

return PlotBase
