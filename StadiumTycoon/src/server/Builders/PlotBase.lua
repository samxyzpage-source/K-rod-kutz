--[[
	PlotBase
	The parts every plot has before anything is bought: the concrete slab, the walkway,
	the entrance gate (touch it to claim the stadium), the cash vault and its collect pad,
	another collect pad on the stadium field, plus the roads, team-bus stops and team safe (a
	collect pad too) of the campus behind the stadium, and the EMPTY Team HQ building
	(Builders/HQShell.lua) that every plot starts with.
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)

local PlotBase = {}

-- Marks a part whose colour comes from the team palette with the palette key it uses
-- ("Primary", "Secondary", "Trim"), so PlotManager can repaint the plot base when the owner
-- picks other team colours. (Labels get TeamTextRole / TeamBackRole the same way.)
local function teamPart(part, role)
	part:SetAttribute("TeamRole", role)
	return part
end

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
	teamPart(
		BuildUtil.Box(
			ctx,
			name .. "Roof",
			Vector3.new(10.5, 0.6, 3),
			position + Vector3.new(0, 9.3, 4.6),
			team.Primary,
			Enum.Material.SmoothPlastic
		),
		"Primary"
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
--   CampusCollectPad, CampusVaultLabel, FieldCollectPad, FieldVaultLabel
function PlotBase.PlotBase(ctx)
	local L = ctx.config.Layout
	local C = ctx.config.Colors
	local team = ctx.colors

	-- the campus (HQ, campus roads, team safe) is built in the campus area's frame
	local campus = table.clone(ctx)
	campus.origin = ctx.origin * CFrame.new(L.Areas.campus)

	-- Slab: top surface at y = 0, covering the whole plot
	local depth = L.PlotBackZ - L.PlotFrontZ
	local centerZ = (L.PlotBackZ + L.PlotFrontZ) / 2
	BuildUtil.Box(ctx, "PlotSlab", Vector3.new(L.PlotWidth, 1, depth), Vector3.new(0, -0.5, centerZ), C.Concrete, Enum.Material.Concrete)

	-- Team-coloured border around the edge of the plot
	local halfW = L.PlotWidth / 2
	local borderProps = { CanCollide = false }
	teamPart(
		BuildUtil.Box(
			ctx,
			"BorderFront",
			Vector3.new(L.PlotWidth, 0.2, 2),
			Vector3.new(0, 0.1, L.PlotFrontZ + 1),
			team.Primary,
			Enum.Material.SmoothPlastic,
			borderProps
		),
		"Primary"
	)
	teamPart(
		BuildUtil.Box(
			ctx,
			"BorderBack",
			Vector3.new(L.PlotWidth, 0.2, 2),
			Vector3.new(0, 0.1, L.PlotBackZ - 1),
			team.Primary,
			Enum.Material.SmoothPlastic,
			borderProps
		),
		"Primary"
	)
	teamPart(
		BuildUtil.Box(
			ctx,
			"BorderLeft",
			Vector3.new(2, 0.2, depth - 4),
			Vector3.new(-halfW + 1, 0.1, centerZ),
			team.Primary,
			Enum.Material.SmoothPlastic,
			borderProps
		),
		"Primary"
	)
	teamPart(
		BuildUtil.Box(
			ctx,
			"BorderRight",
			Vector3.new(2, 0.2, depth - 4),
			Vector3.new(halfW - 1, 0.1, centerZ),
			team.Primary,
			Enum.Material.SmoothPlastic,
			borderProps
		),
		"Primary"
	)

	-- Flat paths and roads (all flush with the slab: 0.1 high, so carts roll straight over them)
	local function strip(buildCtx, name, rect, color, material)
		return BuildUtil.Box(
			buildCtx,
			name,
			Vector3.new(rect.MaxX - rect.MinX, 0.1, rect.MaxZ - rect.MinZ),
			Vector3.new((rect.MinX + rect.MaxX) / 2, 0.05, (rect.MinZ + rect.MaxZ) / 2),
			color,
			material or Enum.Material.Pavement
		)
	end
	local function centreLine(buildCtx, name, rect)
		local alongX = (rect.MaxX - rect.MinX) > (rect.MaxZ - rect.MinZ)
		local size = alongX and Vector3.new(rect.MaxX - rect.MinX - 8, 0.05, 0.6) or Vector3.new(0.6, 0.05, rect.MaxZ - rect.MinZ - 8)
		BuildUtil.Box(
			buildCtx,
			name,
			size,
			Vector3.new((rect.MinX + rect.MaxX) / 2, 0.125, (rect.MinZ + rect.MaxZ) / 2),
			Color3.fromRGB(255, 214, 10),
			Enum.Material.SmoothPlastic,
			{ CanCollide = false }
		)
	end
	-- service roads around the stadium (golf carts can drive all the way round)
	local roadInner = L.StadiumHalfX + 31 -- 326: clear of the facade, ramps and light towers
	local roads = {
		Front = { MinX = -L.PlotWidth / 2 + 4, MaxX = L.PlotWidth / 2 - 4, MinZ = L.StadiumFrontZ - 49, MaxZ = L.StadiumFrontZ - 35 },
		West = { MinX = -roadInner - 14, MaxX = -roadInner, MinZ = L.StadiumFrontZ - 49, MaxZ = L.Areas.campus.Z + L.CampusRoad.MinZ },
		East = { MinX = roadInner, MaxX = roadInner + 14, MinZ = L.StadiumFrontZ - 49, MaxZ = L.Areas.campus.Z + L.CampusRoad.MinZ },
	}
	-- (flush strips of different colours must not overlap: their equal top faces would flicker)
	-- plaza walkway from the claim gate to the stadium's main gate (Gate A), on both sides of the
	-- front road it crosses
	local walkX = L.WalkwayHalfWidth
	strip(ctx, "Walkway", { MinX = -walkX, MaxX = walkX, MinZ = L.PlazaFrontZ + 2, MaxZ = roads.Front.MinZ }, C.Walkway)
	strip(ctx, "Walkway", { MinX = -walkX, MaxX = walkX, MinZ = roads.Front.MaxZ, MaxZ = L.StadiumFrontZ }, C.Walkway)
	for name, rect in pairs(roads) do
		strip(ctx, name .. "ServiceRoad", rect, C.Asphalt, Enum.Material.Asphalt)
		centreLine(ctx, name .. "ServiceRoadLine", rect)
	end
	-- golf-cart road along the west edge of the plot
	strip(ctx, "CartRoad", L.CartRoad, C.Asphalt, Enum.Material.Asphalt)
	centreLine(ctx, "CartRoadLine", L.CartRoad)
	-- Gate D -> campus road
	strip(ctx, "BackWalk", L.BackWalk, C.Walkway)
	-- campus roads (campus area); the two cross roads start at the cart road's east edge
	local function eastOfCartRoad(rect)
		local cut = table.clone(rect)
		cut.MinX = math.max(rect.MinX, L.CartRoad.MaxX - L.Areas.campus.X)
		return cut
	end
	strip(campus, "CampusRoad", eastOfCartRoad(L.CampusRoad), C.Walkway)
	strip(campus, "HQEntranceWalk", L.HQEntranceWalk, C.Walkway)
	strip(campus, "BackRoad", eastOfCartRoad(L.BackRoad), C.Walkway)

	-- Entrance gate ------------------------------------------------------------------------
	local gateZ = L.GateZ
	local pillarX = L.GateHalfWidth + 1.5
	for _, side in ipairs({ -1, 1 }) do
		local pillar = BuildUtil.Block(
			ctx,
			"GatePillar",
			Vector3.new(3, 20, 3),
			Vector3.new(side * pillarX, 0, gateZ),
			team.Primary,
			Enum.Material.Brick
		)
		teamPart(pillar, "Primary")
		BuildUtil.Ball(ctx, {
			Name = "GatePillarBall",
			Diameter = 3.4,
			Position = Vector3.new(side * pillarX, 26.7, gateZ),
			Color = C.Gold,
			Material = Enum.Material.Metal,
		})
	end
	local beam = teamPart(
		BuildUtil.Box(
			ctx,
			"GateBeam",
			Vector3.new(pillarX * 2 + 6, 5, 3),
			Vector3.new(0, 22.5, gateZ),
			team.Secondary,
			Enum.Material.SmoothPlastic
		),
		"Secondary"
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
	for _, label in ipairs({ gateSign, gateBack }) do
		label:SetAttribute("TeamTextRole", "Trim")
		label:SetAttribute("TeamBackRole", "Primary")
	end

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
	local vaultRoof =
		BuildUtil.Block(ctx, "VaultRoof", Vector3.new(13, 1, 11), vaultPos, team.Secondary, Enum.Material.SmoothPlastic, nil, 12)
	teamPart(vaultRoof, "Secondary")
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

	-- A third collect pad on the stadium field, where every stadium buy button stands: on the
	-- front sideline, right in front of the visitors' tunnel (it lies on top of the turf layers)
	local fieldPos = L.FieldCollectPadPosition
	local fieldPad = BuildUtil.Box(
		ctx,
		"FieldCollectPad",
		Vector3.new(8, 0.4, 8),
		Vector3.new(fieldPos.X, 0.2, fieldPos.Z),
		C.CollectPad,
		Enum.Material.Neon
	)
	-- (its labels show from further away than the other pads': the field is big)
	BuildUtil.Billboard(fieldPad, "STEP HERE TO COLLECT", {
		LabelName = "FieldCollectHint",
		Size = UDim2.new(10, 0, 2, 0),
		StudsOffset = Vector3.new(0, 3, 0),
		TextColor3 = Color3.fromRGB(255, 255, 255),
		MaxDistance = 160,
	})
	local _, fieldVaultLabel = BuildUtil.Billboard(fieldPad, "$0", {
		LabelName = "FieldVaultAmount",
		Size = UDim2.new(10, 0, 2.5, 0),
		StudsOffset = Vector3.new(0, 5.4, 0),
		TextColor3 = Color3.fromRGB(90, 255, 120),
		MaxDistance = 160,
	})

	-- The empty Team HQ building that every plot starts with (rooms are built inside it)
	local shellModule = script.Parent:FindFirstChild("HQShell")
	local hqRefs = {}
	if shellModule then
		hqRefs = require(shellModule).Build(campus) or {}
	end

	-- Team bus stops (plaza <-> campus) -------------------------------------------------------
	local busPlaza = busStop(ctx, "BusStopPlaza", L.BusStopPlaza, "TEAM BUS > TEAM HQ")
	local busCampus = busStop(campus, "BusStopCampus", L.BusStopCampus, "TEAM BUS > STADIUM")
	local facingBack = CFrame.Angles(0, math.pi, 0) -- local +Z, into the plot
	local arrivePlaza = CFrame.new(L.BusStopPlaza + Vector3.new(0, 4, 11)) * facingBack
	local arriveCampus = CFrame.new(L.BusStopCampus + Vector3.new(0, 4, 11)) * facingBack

	-- Team safe: a second collect pad in the HQ lobby (same vault)
	local safePos = L.HQSafePosition
	local campusPad = BuildUtil.Box(
		campus,
		"CampusCollectPad",
		Vector3.new(8, 0.4, 8),
		Vector3.new(safePos.X, 0.2, safePos.Z),
		C.CollectPad,
		Enum.Material.Neon
	)
	local safe =
		BuildUtil.Block(campus, "TeamSafe", Vector3.new(6, 7, 6), safePos + Vector3.new(9, 0, 0), C.Vault, Enum.Material.DiamondPlate)
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

	-- owners start (and respawn) inside the HQ lobby, facing into the building (+Z)
	local spawnLocal = CFrame.new(L.HQSpawn + Vector3.new(0, 4, 0)) * CFrame.Angles(0, math.pi, 0)
	local gateLocal = CFrame.new(L.SpawnPosition + Vector3.new(0, 4, 0)) * CFrame.Angles(0, math.pi, 0)

	return {
		ClaimTrigger = claimTrigger,
		GateSignLabel = gateSign,
		GateBackLabel = gateBack,
		VaultLabel = vaultLabel,
		CollectPad = collectPad,
		SpawnCFrame = campus.origin * spawnLocal,
		GateCFrame = ctx.origin * gateLocal,
		HQ = hqRefs,
		BusStopPlaza = busPlaza,
		BusStopCampus = busCampus,
		BusArrivePlaza = ctx.origin * arrivePlaza,
		BusArriveCampus = campus.origin * arriveCampus,
		CampusCollectPad = campusPad,
		CampusVaultLabel = campusVaultLabel,
		FieldCollectPad = fieldPad,
		FieldVaultLabel = fieldVaultLabel,
	}
end

return PlotBase
