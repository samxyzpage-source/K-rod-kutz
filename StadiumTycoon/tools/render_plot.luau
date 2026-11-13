--[[
	Offline plot builder + layout checker (runs with Lune, outside Roblox).

	Usage (from the StadiumTycoon folder):
	  lune run tools/render_plot.luau [outDir] [itemIds] [crowd]

	  outDir   where parts.json is written (default: tools/out)
	  itemIds  comma separated item Ids to build, or "all" (default: all)
	  crowd    pass "crowd" to also seat a game-day crowd in the stands (preview only)

	It loads the real builder modules from src/, runs every builder with real Roblox
	datatypes (Lune validates property names and Enum items), then checks:
	  * every item in Items.List has a builder and no builder errors
	  * parts stay inside the plot bounds
	  * buy buttons are not buried inside parts that can exist while the button is visible
	  * the walkway and players' tunnel stay walkable
	and writes parts.json for tools/preview/shoot.js to render.
]]

local fs = require("@lune/fs")
local luau = require("@lune/luau")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")

local Instance = roblox.Instance
local CFrame = roblox.CFrame
local Vector3 = roblox.Vector3

local outDir = process.args[1] or "tools/out"
local selection = process.args[2] or "all"
local withCrowd = process.args[3] == "crowd"

---------------------------------------------------------------------------------------------
-- Fake DataModel paths -> source folders
---------------------------------------------------------------------------------------------
local ROOTS = {
	["ReplicatedStorage/TycoonShared"] = "src/shared",
	["ServerScriptService/TycoonServer"] = "src/server",
}

local function resolveFile(path)
	for prefix, folder in pairs(ROOTS) do
		if path == prefix or path:sub(1, #prefix + 1) == prefix .. "/" then
			local rest = path:sub(#prefix + 2)
			local base = rest == "" and folder or (folder .. "/" .. rest)
			for _, candidate in ipairs({ base .. ".lua", base .. ".luau", base .. "/init.lua", base .. "/init.luau" }) do
				if fs.isFile(candidate) then
					return candidate
				end
			end
			if fs.isDir(base) then
				return nil, true
			end
		end
	end
	return nil, false
end

local nodeMeta = {}
local function makeNode(path)
	return setmetatable({ __path = path }, nodeMeta)
end

local function parentPath(path)
	return path:match("^(.*)/[^/]+$") or ""
end

nodeMeta.__index = function(self, key)
	local path = rawget(self, "__path")
	if key == "Parent" then
		return makeNode(parentPath(path))
	elseif key == "Name" then
		return path:match("([^/]+)$")
	elseif key == "FindFirstChild" or key == "WaitForChild" then
		return function(_, name)
			local childPath = path .. "/" .. name
			local file, isDir = resolveFile(childPath)
			if file or isDir then
				return makeNode(childPath)
			end
			if key == "WaitForChild" then
				error("WaitForChild would hang: " .. childPath)
			end
			return nil
		end
	end
	return makeNode(path == "" and key or (path .. "/" .. key))
end
nodeMeta.__tostring = function(self)
	return "Node(" .. rawget(self, "__path") .. ")"
end

local moduleCache = {}
local requireNode

local function makeEnv(scriptPath)
	local env = {
		script = makeNode(scriptPath),
		game = {
			GetService = function(_, name)
				return makeNode(name)
			end,
		},
		require = function(node)
			return requireNode(rawget(node, "__path"))
		end,
		warn = function(...)
			print("[warn]", ...)
		end,
	}
	for _, name in ipairs({
		"Instance",
		"Vector3",
		"Vector2",
		"CFrame",
		"Color3",
		"BrickColor",
		"UDim",
		"UDim2",
		"Enum",
		"NumberSequence",
		"NumberSequenceKeypoint",
		"ColorSequence",
		"ColorSequenceKeypoint",
		"NumberRange",
		"Font",
		"Rect",
	}) do
		env[name] = roblox[name]
	end
	return env
end

requireNode = function(path)
	if moduleCache[path] ~= nil then
		return moduleCache[path]
	end
	local file = resolveFile(path)
	if not file then
		error("Cannot require " .. path .. " (no source file)")
	end
	local scriptPath = path
	local chunk = luau.load(fs.readFile(file), { debugName = file, environment = makeEnv(scriptPath) })
	local result = chunk()
	moduleCache[path] = result
	return result
end

---------------------------------------------------------------------------------------------
-- Build
---------------------------------------------------------------------------------------------
local Config = requireNode("ReplicatedStorage/TycoonShared/Config")
local Items = requireNode("ReplicatedStorage/TycoonShared/Items")
local BuildUtil = requireNode("ServerScriptService/TycoonServer/BuildUtil")
local Builders = requireNode("ServerScriptService/TycoonServer/Builders")

local L = Config.Layout
local palette = Config.TeamColors[1]
local origin = CFrame.new()
local root = Instance.new("Model")
root.Name = "PreviewPlot"

local errors = {}
local warnings = {}
local function addError(msg)
	table.insert(errors, msg)
end
local function addWarning(msg)
	table.insert(warnings, msg)
end

-- selection: "all", or comma separated piece ids ("turf,yardlines") and/or step ids ("turf:2")
local selected = {} -- [stepId] = true
if selection == "all" then
	for _, item in ipairs(Items.List) do
		selected[item.Id] = true
	end
else
	for id in selection:gmatch("[^,]+") do
		if Items.PieceById[id] then
			for _, stepId in ipairs(Items.PieceById[id].StageIds) do
				selected[stepId] = true
			end
		elseif Items.ById[id] then
			selected[id] = true
		else
			addError("Unknown piece or step '" .. id .. "'")
		end
	end
end

-- item models in build order, plus the always-present base
local built = {} -- { id, model }

local baseCtx, baseModel = BuildUtil.Child(BuildUtil.NewContext(origin, root, palette, "PREVIEW", Config), "PlotBase")
local okBase, baseRefs = pcall(Builders.PlotBase, baseCtx)
if not okBase then
	addError("PlotBase builder failed: " .. tostring(baseRefs))
else
	for _, key in ipairs({ "ClaimTrigger", "GateSignLabel", "VaultLabel", "CollectPad", "SpawnCFrame" }) do
		if baseRefs[key] == nil then
			addError("PlotBase did not return " .. key)
		end
	end
end
table.insert(built, { id = "PlotBase", model = baseModel })

for id in pairs(Builders) do
	if id ~= "PlotBase" and Items.PieceById[id] == nil then
		addWarning("Builder '" .. id .. "' has no matching piece in Items")
	end
end

-- Build every selected STEP separately, exactly like the game does (ctx.onlyStage = step).
local stepsPerPiece = {} -- [pieceId] = highest Stage() the builder used
for _, item in ipairs(Items.List) do
	if selected[item.Id] then
		local builder = Builders[item.PieceId]
		if builder == nil then
			if item.Stage == 1 then
				addError("No builder for piece '" .. item.PieceId .. "'")
			end
		else
			local stepCtx = BuildUtil.NewContext(origin, root, palette, "PREVIEW", Config, item.Stage)
			local ctx, model = BuildUtil.Child(stepCtx, item.Id)
			local ok, err = pcall(builder, ctx)
			if not ok then
				addError(("Builder '%s' failed on step %d: %s"):format(item.PieceId, item.Stage, tostring(err)))
			end
			BuildUtil.PruneEmpty(model)
			stepsPerPiece[item.PieceId] = stepCtx.stageState.highest
			local partCount = 0
			for _, d in ipairs(model:GetDescendants()) do
				if d:IsA("BasePart") then
					partCount += 1
				end
			end
			if ok and partCount == 0 then
				addError(("Step %d (%s) of '%s' builds no parts"):format(item.Stage, item.StageName, item.PieceId))
			end
			table.insert(built, { id = item.Id, model = model, pieceId = item.PieceId })
		end
	end
end
for pieceId, highest in pairs(stepsPerPiece) do
	local p = Items.PieceById[pieceId]
	if highest ~= #p.Stages then
		addError(("'%s' has %d steps in Items.lua but its builder uses BuildUtil.Stage up to %d"):format(pieceId, #p.Stages, highest))
	end
end

if withCrowd then
	local Crowd = requireNode("ServerScriptService/TycoonServer/Crowd")
	local owned = {}
	for id in pairs(selected) do
		owned[id] = true
	end
	local seed = 0
	local rng = {
		NextNumber = function()
			seed = (seed * 1103515245 + 12345) % 2147483648
			return seed / 2147483648
		end,
	}
	rng.NextInteger = function(_, a, b)
		return a + math.floor(rng.NextNumber() * (b - a + 1))
	end
	local crowdCtx, crowdModel = BuildUtil.Child(BuildUtil.NewContext(origin, root, palette, "PREVIEW", Config), "GameDayFans")
	local ok, err = pcall(Crowd.SeatedFans, crowdCtx, owned, Config.GameDay.SeatedFans, rng)
	if not ok then
		addError("Crowd.SeatedFans failed: " .. tostring(err))
	end
	for index = 1, Config.GameDay.WalkingFans do
		local x = -8 + index * 2
		local okWalker, walkerErr = pcall(
			Crowd.Walker,
			crowdCtx,
			CFrame.new(x, 0, L.GateZ + 10 + index * 12) * CFrame.Angles(0, math.pi, 0),
			palette.Primary,
			Crowd.SkinTones[1],
			index
		)
		if not okWalker then
			addError("Crowd.Walker failed: " .. tostring(walkerErr))
		end
	end
	table.insert(built, { id = "GameDayFans", model = crowdModel })
end

---------------------------------------------------------------------------------------------
-- Collect parts + checks
---------------------------------------------------------------------------------------------
local function aabb(part)
	local cf = part.CFrame
	local size = part.Size
	local x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22 = cf:GetComponents()
	local hx, hy, hz = size.X / 2, size.Y / 2, size.Z / 2
	local ex = math.abs(r00) * hx + math.abs(r01) * hy + math.abs(r02) * hz
	local ey = math.abs(r10) * hx + math.abs(r11) * hy + math.abs(r12) * hz
	local ez = math.abs(r20) * hx + math.abs(r21) * hy + math.abs(r22) * hz
	return { minX = x - ex, maxX = x + ex, minY = y - ey, maxY = y + ey, minZ = z - ez, maxZ = z + ez }
end

local function overlaps(a, b, pad)
	pad = pad or 0
	return a.minX < b.maxX - pad
		and a.maxX > b.minX + pad
		and a.minY < b.maxY - pad
		and a.maxY > b.minY + pad
		and a.minZ < b.maxZ - pad
		and a.maxZ > b.minZ + pad
end

local function round(n)
	return math.floor(n * 1000 + 0.5) / 1000
end

local partsOut = {}
local partsByItem = {}
local counts = {}
local total = 0
local guiCount = 0
local lightCount = 0

for _, entry in ipairs(built) do
	local list = {}
	partsByItem[entry.id] = list
	local count = 0
	for _, inst in ipairs(entry.model:GetDescendants()) do
		if inst:IsA("BasePart") then
			count += 1
			local box = aabb(inst)
			table.insert(list, { part = inst, box = box })
			local size = inst.Size
			if size.X <= 0 or size.Y <= 0 or size.Z <= 0 then
				addError(("%s/%s has a non-positive size %s"):format(entry.id, inst.Name, tostring(size)))
			end
			if size.X > 2048 or size.Y > 2048 or size.Z > 2048 then
				addError(("%s/%s is larger than 2048 studs"):format(entry.id, inst.Name))
			end
			local halfW = L.PlotWidth / 2
			if box.minX < -halfW - 0.01 or box.maxX > halfW + 0.01 or box.minZ < L.PlotFrontZ - 0.01 or box.maxZ > L.PlotBackZ + 0.01 then
				addWarning(
					("%s/%s sticks outside the plot (x %.1f..%.1f, z %.1f..%.1f)"):format(
						entry.id,
						inst.Name,
						box.minX,
						box.maxX,
						box.minZ,
						box.maxZ
					)
				)
			end
			if box.minY < -1.01 then
				addWarning(("%s/%s goes below the plot slab (minY %.2f)"):format(entry.id, inst.Name, box.minY))
			end
			local shape = "Block"
			if inst.ClassName == "WedgePart" then
				shape = "Wedge"
			elseif inst.ClassName == "CornerWedgePart" then
				shape = "CornerWedge"
			elseif inst.ClassName == "Part" then
				shape = inst.Shape.Name
			elseif inst.ClassName == "TrussPart" then
				shape = "Block"
			end
			local comps = { inst.CFrame:GetComponents() }
			for i, v in ipairs(comps) do
				comps[i] = round(v)
			end
			local color = inst.Color
			table.insert(partsOut, {
				item = entry.id,
				name = inst.Name,
				shape = shape,
				size = { round(size.X), round(size.Y), round(size.Z) },
				cf = comps,
				color = { round(color.R), round(color.G), round(color.B) },
				transparency = inst.Transparency,
				material = inst.Material.Name,
				collide = inst.CanCollide,
			})
		elseif inst:IsA("SurfaceGui") or inst:IsA("BillboardGui") then
			guiCount += 1
		elseif inst:IsA("Light") then
			lightCount += 1
		end
	end
	counts[entry.id] = count
	total += count
end

-- Dependency closure: items that can only exist AFTER `id` is bought.
local dependents = {}
local function collectDependents(id, acc)
	for _, other in ipairs(Items.List) do
		for _, req in ipairs(other.Requires) do
			if req == id and not acc[other.Id] then
				acc[other.Id] = true
				collectDependents(other.Id, acc)
			end
		end
	end
	return acc
end
for _, item in ipairs(Items.List) do
	dependents[item.Id] = collectDependents(item.Id, {})
end

local function isSolid(entry)
	-- floors/lines a player can simply walk over don't block anything
	return entry.part.CanCollide and entry.part.Transparency < 1 and entry.box.maxY > 0.75
end

-- Buttons must not be buried by parts that can exist while they are visible
for _, item in ipairs(Items.List) do
	local b = item.Button
	local buttonBox = { minX = b.X - 3, maxX = b.X + 3, minY = 0, maxY = 5, minZ = b.Z - 3, maxZ = b.Z + 3 }
	for otherId, list in pairs(partsByItem) do
		if otherId ~= item.Id and not dependents[item.Id][otherId] then
			for _, entry in ipairs(list) do
				if isSolid(entry) and overlaps(buttonBox, entry.box) then
					addWarning(("Button '%s' at (%g, %g) is blocked by %s/%s"):format(item.Id, b.X, b.Z, otherId, entry.part.Name))
				end
			end
		end
	end
	-- buttons that overlap each other
	for _, other in ipairs(Items.List) do
		if other.Order > item.Order and other.PieceId ~= item.PieceId then
			local o = other.Button
			if math.abs(o.X - b.X) < 7 and math.abs(o.Z - b.Z) < 7 then
				addWarning(("Buttons '%s' and '%s' overlap"):format(item.Id, other.Id))
			end
		end
	end
end

-- Walkway (gate -> tunnel) and tunnel must stay walkable at head height
local corridors = {
	{
		name = "walkway",
		box = {
			minX = -L.WalkwayHalfWidth + 1,
			maxX = L.WalkwayHalfWidth - 1,
			minY = 0.8,
			maxY = 9,
			minZ = L.PlazaFrontZ + 6,
			maxZ = L.PlazaBackZ,
		},
	},
	{
		name = "tunnel",
		box = {
			minX = -L.TunnelHalfWidth + 1,
			maxX = L.TunnelHalfWidth - 1,
			minY = 0.8,
			maxY = 9,
			minZ = L.FrontUpperOuterZ,
			maxZ = L.SurfaceMinZ,
		},
	},
}
if L.BackWalk then
	table.insert(corridors, {
		name = "home tunnel + back walk",
		box = {
			minX = L.BackWalk.MinX + 1,
			maxX = L.BackWalk.MaxX - 1,
			minY = 0.8,
			maxY = 9,
			minZ = L.FieldBackZ + 1, -- from the sideline (benches must leave the lane open)
			maxZ = L.BackWalk.MaxZ - 1,
		},
	})
end
local function corridorFrom(name, rect, inset, ignore)
	table.insert(corridors, {
		name = name,
		box = {
			minX = rect.MinX + inset,
			maxX = rect.MaxX - inset,
			minY = 0.8,
			maxY = 9,
			minZ = rect.MinZ + inset,
			maxZ = rect.MaxZ - inset,
		},
		ignore = ignore,
	})
end
if L.HQCorridor then
	corridorFrom("HQ corridor", L.HQCorridor, 1)
end
if L.HQEntranceWalk then
	corridorFrom("HQ entrance", L.HQEntranceWalk, 1)
end
if L.BackRoad then
	corridorFrom("back road", L.BackRoad, 1)
end
if L.CartRoad then
	corridorFrom("cart road", L.CartRoad, 1)
end
if L.CampusRoad then
	table.insert(corridors, {
		name = "campus road",
		box = {
			minX = L.CampusRoad.MinX + 2,
			maxX = L.CampusRoad.MaxX - 2,
			minY = 0.8,
			maxY = 9,
			minZ = L.CampusRoad.MinZ + 1,
			maxZ = L.CampusRoad.MaxZ - 1,
		},
		ignore = { PlotBase = true }, -- bus stop shelters + team safe sit on the road on purpose
	})
end
for _, corridor in ipairs(corridors) do
	for id, list in pairs(partsByItem) do
		for _, entry in ipairs(list) do
			if not (corridor.ignore and corridor.ignore[id]) and isSolid(entry) and overlaps(corridor.box, entry.box) then
				addWarning(("%s is blocked by %s/%s"):format(corridor.name, id, entry.part.Name))
			end
		end
	end
end

-- Pieces outside the stadium must stay inside their zone (Config.Layout.Zones)
if L.Zones then
	for _, entry in ipairs(built) do
		local zone = entry.pieceId and L.Zones[entry.pieceId]
		if zone then
			for _, part in ipairs(partsByItem[entry.id] or {}) do
				local box = part.box
				local tolerance = 0.6
				if
					box.minX < zone.MinX - tolerance
					or box.maxX > zone.MaxX + tolerance
					or box.minZ < zone.MinZ - tolerance
					or box.maxZ > zone.MaxZ + tolerance
					or box.maxY > zone.MaxY + tolerance
				then
					addWarning(
						("%s/%s is outside its zone (x %.1f..%.1f, z %.1f..%.1f, top %.1f; zone x %g..%g, z %g..%g, top %g)"):format(
							entry.id,
							part.part.Name,
							box.minX,
							box.maxX,
							box.minZ,
							box.maxZ,
							box.maxY,
							zone.MinX,
							zone.MaxX,
							zone.MinZ,
							zone.MaxZ,
							zone.MaxY
						)
					)
				end
			end
		end
	end
end

---------------------------------------------------------------------------------------------
-- Report
---------------------------------------------------------------------------------------------
fs.writeDir(outDir)
local buttons = {}
for _, item in ipairs(Items.List) do
	table.insert(buttons, { id = item.Id, x = item.Button.X, z = item.Button.Z })
end
fs.writeFile(
	outDir .. "/parts.json",
	serde.encode("json", {
		parts = partsOut,
		buttons = buttons,
		plot = { width = L.PlotWidth, frontZ = L.PlotFrontZ, backZ = L.PlotBackZ },
	})
)

print("Parts per piece (all built steps):")
local pieceTotals, pieceOrder = {}, {}
for _, entry in ipairs(built) do
	local key = entry.pieceId or entry.id
	if not pieceTotals[key] then
		pieceTotals[key] = 0
		table.insert(pieceOrder, key)
	end
	pieceTotals[key] += counts[entry.id]
end
for _, key in ipairs(pieceOrder) do
	print(("  %-22s %4d"):format(key, pieceTotals[key]))
end
print(("Total parts: %d   GUIs: %d   Lights: %d"):format(total, guiCount, lightCount))

if #warnings > 0 then
	print(("\n%d warning(s):"):format(#warnings))
	for _, w in ipairs(warnings) do
		print("  WARN  " .. w)
	end
end
if #errors > 0 then
	print(("\n%d error(s):"):format(#errors))
	for _, e in ipairs(errors) do
		print("  ERROR " .. e)
	end
	process.exit(1)
end
print("\nOK - wrote " .. outDir .. "/parts.json")
