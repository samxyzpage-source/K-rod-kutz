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
	  * nothing collidable taller than 0.4 stands on a road or path golf carts use
	  * the event level (the ground between the bowl and the facade) has no sealed areas
	  * the HQ shell's team colours carry their palette roles (a team change repaints them)
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
			local areaOrigin = origin * CFrame.new(item.AreaOffset or Vector3.new())
			local stepCtx = BuildUtil.NewContext(areaOrigin, root, palette, "PREVIEW", Config, item.Stage)
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
				if v ~= v or math.abs(v) > 1e7 then
					addError(("%s/%s has an invalid (NaN or huge) CFrame"):format(entry.id, inst.Name))
					v = 0
				end
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
	local buttonBox = { minX = b.X - 3, maxX = b.X + 3, minY = b.Y, maxY = b.Y + 5, minZ = b.Z - 3, maxZ = b.Z + 3 }
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
			if math.abs(o.X - b.X) < 7 and math.abs(o.Z - b.Z) < 7 and math.abs(o.Y - b.Y) < 3 then
				addWarning(("Buttons '%s' and '%s' overlap"):format(item.Id, other.Id))
			end
		end
	end
end

-- Walkways, roads and concourse lanes must stay walkable at head height (V5 layout).
-- Each corridor is a box in PLOT coordinates (campus ones are shifted by the campus area offset).
local corridors = {}
local function corridor(name, rect, inset, floorY, area, ignore)
	local offset = L.Areas[area or "stadium"]
	floorY = floorY or 0
	table.insert(corridors, {
		name = name,
		box = {
			minX = rect.MinX + inset + offset.X,
			maxX = rect.MaxX - inset + offset.X,
			minY = floorY + 0.8,
			maxY = floorY + 9,
			minZ = rect.MinZ + inset + offset.Z,
			maxZ = rect.MaxZ - inset + offset.Z,
		},
		ignore = ignore,
	})
end
local B = L.Bowl
-- plaza walkway: claim gate -> Gate A (through the gate opening into the stadium)
corridor("front walkway", { MinX = -L.WalkwayHalfWidth, MaxX = L.WalkwayHalfWidth, MinZ = L.GateZ + 4, MaxZ = L.StadiumFrontZ + 12 }, 1)
corridor(
	"back walk (Gate D -> campus)",
	{ MinX = L.BackWalk.MinX, MaxX = L.BackWalk.MaxX, MinZ = L.BackWalk.MinZ - 12, MaxZ = L.BackWalk.MaxZ },
	1
)
corridor("cart road", L.CartRoad, 1)
-- players' tunnels from the field into the event level (under the lower bowl)
local tunnel = B.TunnelHalfWidth
corridor("home players' tunnel", { MinX = -tunnel, MaxX = tunnel, MinZ = L.FieldBackZ + 1, MaxZ = L.SurfaceMaxZ + 30 }, 1)
corridor("visitor players' tunnel", { MinX = -tunnel, MaxX = tunnel, MinZ = L.SurfaceMinZ - 30, MaxZ = L.FieldFrontZ - 1 }, 1)
-- concourse walking lanes (the straight sides; stands and shops line the outer walls)
local function lanes(name, inner, outer, floorY)
	local hx, minZ, maxZ = L.SurfaceHalfX, L.SurfaceMinZ, L.SurfaceMaxZ
	corridor(name .. " (visitor side)", { MinX = -hx, MaxX = hx, MinZ = minZ - outer, MaxZ = minZ - inner }, 0, floorY)
	corridor(name .. " (home side)", { MinX = -hx, MaxX = hx, MinZ = maxZ + inner, MaxZ = maxZ + outer }, 0, floorY)
	corridor(name .. " (west end)", { MinX = -hx - outer, MaxX = -hx - inner, MinZ = minZ, MaxZ = maxZ }, 0, floorY)
	corridor(name .. " (east end)", { MinX = hx + inner, MaxX = hx + outer, MinZ = minZ, MaxZ = maxZ }, 0, floorY)
end
lanes("main concourse lane", B.MainConcourse.Inner + 10, B.MainConcourse.Inner + 20, B.MainConcourse.Floor)
lanes("club ring lane", B.ClubRing.Outer - 12, B.ClubRing.Outer - 4, B.ClubRing.Floor)
lanes("upper concourse lane", B.UpperConcourse.Inner + 12, B.UpperConcourse.Inner + 22, B.UpperConcourse.Floor)
-- campus (campus-area rects)
corridor(
	"campus road",
	{ MinX = L.CampusRoad.MinX + 1, MaxX = L.CampusRoad.MaxX - 1, MinZ = L.CampusRoad.MinZ, MaxZ = L.CampusRoad.MaxZ },
	1,
	0,
	"campus"
)
corridor("HQ entrance", L.HQEntranceWalk, 1, 0, "campus")
corridor("HQ corridor", L.HQCorridor, 1, 0, "campus")
corridor("HQ upper corridor", L.HQCorridor, 1, L.HQ.UpperFloorY, "campus")
corridor("back road", L.BackRoad, 1, 0, "campus")
for _, corridor in ipairs(corridors) do
	for id, list in pairs(partsByItem) do
		for _, entry in ipairs(list) do
			if not (corridor.ignore and corridor.ignore[id]) and isSolid(entry) and overlaps(corridor.box, entry.box) then
				addWarning(("%s is blocked by %s/%s"):format(corridor.name, id, entry.part.Name))
			end
		end
	end
end

-- Golf carts roll over anything up to 0.4 tall (docs/V5-LAYOUT.md), so no collidable part may stand
-- on a road or path between 0.4 and a cart's height (7): the rectangles are PlotBase's own flush
-- strips (the service roads round the stadium, the cart road, the campus + back roads, the plaza
-- walkway and the back walk). Gate turnstiles, the claim gate and signs over the roads don't collide.
do
	local roadNames = {
		FrontServiceRoad = "front service road",
		WestServiceRoad = "west service road",
		EastServiceRoad = "east service road",
		CartRoad = "cart road",
		CampusRoad = "campus road",
		BackRoad = "back road",
		Walkway = "plaza walkway",
		BackWalk = "back walk (Gate D -> campus road)",
	}
	local roads, found = {}, {}
	for _, entry in ipairs(partsByItem.PlotBase or {}) do
		local name = roadNames[entry.part.Name]
		if name then
			found[entry.part.Name] = true
			table.insert(roads, { name = name, box = entry.box })
		end
	end
	if okBase then
		for partName in pairs(roadNames) do
			if not found[partName] then
				addError("cart road check: PlotBase has no road strip named " .. partName)
			end
		end
	end
	for _, road in ipairs(roads) do
		local r = road.box
		for id, list in pairs(partsByItem) do
			for _, entry in ipairs(list) do
				local b = entry.box
				if
					entry.part.CanCollide
					and b.maxY > 0.41
					and b.minY < 7
					and b.minX < r.maxX - 0.05
					and b.maxX > r.minX + 0.05
					and b.minZ < r.maxZ - 0.05
					and b.maxZ > r.minZ + 0.05
				then
					addWarning(
						("%s: %s/%s stands in the way of golf carts (top %.2f; carts roll over 0.4)"):format(
							road.name,
							id,
							entry.part.Name,
							b.maxY
						)
					)
				end
			end
		end
	end
end

-- No sealed rooms on the event level: every walkable ground spot between the lower bowl and the
-- facade (offsets 60..156) must lead back to the plaza on foot, since players can drop in from the
-- bridges and ramps above. A flood fill over 1-stud ground cells from the plaza in front of Gate A.
-- A collidable part (door leaves open) blocks a cell where it fills some of the body's height
-- (0.3..5.2) above it, unless it is a low thing on the ground to step or jump onto (bottom <= 2, top
-- <= 6.5). Parts grow by 0.5 so a 2-wide player needs a 2-stud gap.
do
	local GX0, GZ0, NX, NZ = -330, -250, 660, 560 -- plot x -330..330, z -250..310
	local free = table.create(NX * NZ, true)
	for _, list in pairs(partsByItem) do
		for _, entry in ipairs(list) do
			local part, b = entry.part, entry.box
			if
				part.CanCollide
				and part:GetAttribute("Leaf") == nil
				and b.minY < 5.7
				and b.maxY > -0.2
				and b.maxX > GX0
				and b.minX < GX0 + NX
				and b.maxZ > GZ0
				and b.minZ < GZ0 + NZ
			then
				local px, py, pz, r00, r01, r02, r10, r11, r12, r20, r21, r22 = part.CFrame:GetComponents()
				local half = { part.Size.X / 2 + 0.5, part.Size.Y / 2 + 0.5, part.Size.Z / 2 + 0.5 }
				local rise = { r10, r11, r12 } -- (how fast each local axis climbs along a vertical line)
				for ix = math.max(0, math.ceil(b.minX - GX0 - 1)), math.min(NX - 1, math.floor(b.maxX - GX0)) do
					for iz = math.max(0, math.ceil(b.minZ - GZ0 - 1)), math.min(NZ - 1, math.floor(b.maxZ - GZ0)) do
						-- the stretch [lo, hi] of the vertical line through the cell's centre inside the part
						local dx, dz = GX0 + ix + 0.5 - px, GZ0 + iz + 0.5 - pz
						local along = { r00 * dx + r20 * dz, r01 * dx + r21 * dz, r02 * dx + r22 * dz }
						local lo, hi = -math.huge, math.huge
						for k = 1, 3 do
							if math.abs(rise[k]) < 1e-9 then
								if math.abs(along[k]) > half[k] then
									lo, hi = 1, 0
								end
							else
								local a, c = (-half[k] - along[k]) / rise[k], (half[k] - along[k]) / rise[k]
								lo, hi = math.max(lo, math.min(a, c)), math.min(hi, math.max(a, c))
							end
						end
						lo, hi = lo + py, hi + py
						if lo <= hi and hi > 0.3 and lo < 5.2 and not (lo <= 2 and hi <= 6.5) then
							free[iz * NX + ix + 1] = false
						end
					end
				end
			end
		end
	end
	local function flood(start, mark, value)
		local queue, head, count = { start }, 1, 0
		mark[start] = value
		while head <= #queue do
			local cell = queue[head]
			head += 1
			count += 1
			local ix = (cell - 1) % NX
			for _, n in ipairs({ ix > 0 and cell - 1, ix < NX - 1 and cell + 1, cell - NX, cell + NX }) do
				if n and n >= 1 and n <= NX * NZ and free[n] and mark[n] == nil then
					mark[n] = value
					table.insert(queue, n)
				end
			end
		end
		return count
	end
	-- (the field counts as a way out too: its stands and players' tunnels lead back to the plaza,
	-- which the Items order keeps true - see the bowl tests in tools/test_server.luau)
	local reached = {}
	for _, start in ipairs({ Vector3.new(0, 0, L.StadiumFrontZ - 20), Vector3.new(0, 0, L.FieldCenterZ) }) do
		local cell = math.floor(start.Z - GZ0) * NX + math.floor(start.X - GX0) + 1
		if not free[cell] then
			addError(("event level check: the start cell at (%g, %g) is blocked"):format(start.X, start.Z))
		elseif reached[cell] == nil then
			flood(cell, reached, 0)
		end
	end
	local hx, minZ, maxZ = L.SurfaceHalfX, L.SurfaceMinZ, L.SurfaceMaxZ
	local function offset(x, z)
		local dx = math.abs(x) - hx
		local dz = math.max(minZ - z, z - maxZ)
		return math.max(dx, dz, (dx + dz) / math.sqrt(2))
	end
	local component = 0
	for iz = 0, NZ - 1 do
		for ix = 0, NX - 1 do
			local cell = iz * NX + ix + 1
			local x, z = GX0 + ix + 0.5, GZ0 + iz + 0.5
			local o = offset(x, z)
			if free[cell] and reached[cell] == nil and o >= 60 and o <= L.Bowl.Facade.Inner + 4 then
				component += 1
				local size = flood(cell, reached, component)
				if size >= 400 then
					addWarning(
						("event level: %d stud2 of ground around (%.0f, %.0f) has no walkable way back to the plaza"):format(size, x, z)
					)
				end
			end
		end
	end
end

-- Pieces outside the stadium must stay inside their zone (Config.Layout.Zones)
if L.Zones then
	for _, entry in ipairs(built) do
		local zone = entry.pieceId and L.Zones[entry.pieceId]
		if zone then
			local offset = Items.PieceById[entry.pieceId].AreaOffset or Vector3.new()
			for _, part in ipairs(partsByItem[entry.id] or {}) do
				local plotBox = part.box
				local box = {
					minX = plotBox.minX - offset.X,
					maxX = plotBox.maxX - offset.X,
					minZ = plotBox.minZ - offset.Z,
					maxZ = plotBox.maxZ - offset.Z,
					maxY = plotBox.maxY,
				}
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
-- Interactions: prompts (look / door / seat / elevator / use), seats and live screens
---------------------------------------------------------------------------------------------
local Interact = requireNode("ReplicatedStorage/TycoonShared/Interact")
local interactionsByPiece, interactionOrder = {}, {}
local promptsOut = {}
local elevatorTargets = {}
local allSolid = {}
for _, list in pairs(partsByItem) do
	for _, entry in ipairs(list) do
		if entry.part.CanCollide and entry.part.Transparency < 1 then
			table.insert(allSolid, entry)
		end
	end
end
local function nonEmpty(value)
	return type(value) == "string" and value:match("%S") ~= nil
end
for _, entry in ipairs(built) do
	local key = entry.pieceId or entry.id
	local tally = interactionsByPiece[key]
	if not tally then
		tally = { look = 0, door = 0, seat = 0, elevator = 0, use = 0, live = 0, seats = 0, camera = 0 }
		interactionsByPiece[key] = tally
		table.insert(interactionOrder, key)
	end
	for _, inst in ipairs(entry.model:GetDescendants()) do
		if inst:IsA("ProximityPrompt") then
			local host = inst.Parent
			local hostPart = host
			if hostPart and hostPart:IsA("Attachment") then
				hostPart = hostPart.Parent
			end
			local where = ("%s/%s"):format(entry.id, hostPart and hostPart.Name or "?")
			local kind = inst:GetAttribute("Kind")
			if inst.Name ~= Interact.PromptName then
				addError(where .. ": a ProximityPrompt must be named 'Interact' (use the BuildUtil helpers)")
			end
			if not Interact.Kinds[kind] then
				addError(where .. ": unknown prompt Kind '" .. tostring(kind) .. "'")
			else
				tally[kind] += 1
			end
			if not (hostPart and hostPart:IsA("BasePart")) then
				addError(where .. ": prompt is not on a part")
			end
			local lookKey = inst:GetAttribute("LookKey")
			if lookKey ~= nil and not Interact.IsLookKey(lookKey) then
				addError(where .. ": unknown LookKey '" .. tostring(lookKey) .. "'")
			end
			if kind == "look" then
				if not nonEmpty(inst:GetAttribute("Title")) then
					addError(where .. ": look prompt without a Title")
				end
				if not nonEmpty(inst:GetAttribute("Info")) and lookKey == nil then
					addError(where .. ": look prompt without Info or a LookKey")
				end
			elseif kind == "use" then
				local use = inst:GetAttribute("Use")
				if not Interact.Uses[use] then
					addError(where .. ": unknown Use '" .. tostring(use) .. "'")
				end
			elseif kind == "door" then
				local model = hostPart and hostPart.Parent
				local leaves = model and model:GetAttribute("Leaves")
				local leafParts = 0
				for _, d in ipairs(model and model:GetDescendants() or {}) do
					if d:IsA("BasePart") and d:GetAttribute("Leaf") ~= nil then
						leafParts += 1
					end
				end
				if not leaves or typeof(model:GetAttribute("Pivot1")) ~= "CFrame" or leafParts == 0 then
					addError(where .. ": door prompt without door leaves (use BuildUtil.Door)")
				end
			elseif kind == "seat" then
				if not (hostPart and hostPart:IsA("Seat")) then
					addError(where .. ": seat prompt must be on a Seat (use BuildUtil.Seat)")
				end
			elseif kind == "elevator" then
				local target = inst:GetAttribute("Target")
				if typeof(target) ~= "CFrame" then
					addError(where .. ": elevator without a Target CFrame")
				else
					table.insert(elevatorTargets, { where = where, target = target })
				end
			end
			if hostPart and hostPart:IsA("BasePart") then
				local position = host:IsA("Attachment") and (hostPart.CFrame * host.Position) or hostPart.CFrame.Position
				table.insert(promptsOut, {
					kind = kind,
					text = inst.ActionText ~= "" and inst.ActionText or tostring(inst:GetAttribute("Use") or kind),
					p = { round(position.X), round(position.Y), round(position.Z) },
				})
			end
		elseif inst:IsA("TextLabel") and inst:GetAttribute("Live") ~= nil then
			local live = inst:GetAttribute("Live")
			if not Interact.LiveKinds[live] then
				addError(("%s/%s: unknown Live kind '%s'"):format(entry.id, inst.Name, tostring(live)))
			end
			tally.live += 1
		elseif inst:IsA("Seat") then
			tally.seats += 1
			if inst:GetAttribute("CameraCFrame") ~= nil then
				tally.camera += 1
			end
		end
	end
end
-- elevators must land on a floor with head room
for _, e in ipairs(elevatorTargets) do
	local p = e.target.Position
	local body = { minX = p.X - 1.2, maxX = p.X + 1.2, minY = p.Y + 0.6, maxY = p.Y + 5.5, minZ = p.Z - 1.2, maxZ = p.Z + 1.2 }
	local floorFound = false
	for _, entry in ipairs(allSolid) do
		local b = entry.box
		if overlaps(body, b) then
			addWarning(("%s: elevator target (%.1f, %.1f, %.1f) is inside %s"):format(e.where, p.X, p.Y, p.Z, entry.part.Name))
		end
		if b.minX <= p.X and b.maxX >= p.X and b.minZ <= p.Z and b.maxZ >= p.Z and b.maxY <= p.Y + 0.6 and b.maxY >= p.Y - 1.5 then
			floorFound = true
		end
	end
	if not floorFound then
		addWarning(("%s: no floor under the elevator target (%.1f, %.1f, %.1f)"):format(e.where, p.X, p.Y, p.Z))
	end
end

---------------------------------------------------------------------------------------------
-- Team colours: a team change repaints the always-present HQ shell in place by palette role
-- (PlotManager.ApplyTeam: TeamRole on parts, TeamTextRole / TeamBackRole on text and panels).
-- Build it in every palette: whatever changes with the palette must carry the role whose colour it
-- has in every build, and text on or in team colours must stay readable (contrast 3) in all of them.
---------------------------------------------------------------------------------------------
do
	local builds = {}
	for index, colors in ipairs(Config.TeamColors) do
		local holder = Instance.new("Model")
		local ctx = BuildUtil.Child(BuildUtil.NewContext(origin, holder, colors, "", Config), "PlotBase")
		local ok, err = pcall(Builders.PlotBase, ctx)
		if not ok then
			addError(("PlotBase failed with palette %d: %s"):format(index, tostring(err)))
		end
		local hq = holder:FindFirstChild("HQShell", true)
		builds[index] = hq and hq:GetDescendants() or {}
	end
	local function same(a, b)
		return math.abs(a.R - b.R) < 0.002 and math.abs(a.G - b.G) < 0.002 and math.abs(a.B - b.B) < 0.002
	end
	local function luminance(c)
		local function channel(v)
			return v <= 0.03928 and v / 12.92 or ((v + 0.055) / 1.055) ^ 2.4
		end
		return 0.2126 * channel(c.R) + 0.7152 * channel(c.G) + 0.0722 * channel(c.B)
	end
	local function contrast(a, b)
		local la, lb = luminance(a), luminance(b)
		return (math.max(la, lb) + 0.05) / (math.min(la, lb) + 0.05)
	end
	-- what a label is drawn on: the nearest visible panel behind it, else the part's face
	local function backgroundOf(label)
		local node = label
		while node do
			if node:IsA("GuiObject") and node.BackgroundTransparency < 1 then
				return node.BackgroundColor3
			elseif node:IsA("BasePart") then
				return node.Color
			end
			node = node.Parent
		end
		return nil
	end
	local base = builds[1]
	local sameTree = #base > 0
	for index = 2, #builds do
		if #builds[index] ~= #base then
			sameTree = false
		else
			for k, inst in ipairs(base) do
				if builds[index][k].ClassName ~= inst.ClassName or builds[index][k].Name ~= inst.Name then
					sameTree = false
					break
				end
			end
		end
	end
	if not sameTree then
		addError("the HQ shell must build the same instances in every team palette (the team colour check compares them)")
	else
		local channels = {
			{ "BasePart", "Color", "TeamRole" },
			{ "GuiObject", "BackgroundColor3", "TeamBackRole" },
			{ "TextLabel", "TextColor3", "TeamTextRole" },
		}
		local problems = {}
		for k, inst in ipairs(base) do
			for _, channel in ipairs(channels) do
				local class, prop, attr = channel[1], channel[2], channel[3]
				if inst:IsA(class) and not (class == "GuiObject" and inst.BackgroundTransparency >= 1) then
					local role = inst:GetAttribute(attr)
					local varies, wrong = false, false
					for index, list in ipairs(builds) do
						local value = list[k][prop]
						varies = varies or not same(value, inst[prop])
						local palette = Config.TeamColors[index]
						if list[k]:GetAttribute(attr) ~= role or (role ~= nil and not same(value, palette[role])) then
							wrong = true
						end
					end
					if wrong or (varies and role == nil) then
						table.insert(
							problems,
							("%s.%s %s"):format(inst:GetFullName(), prop, role and "has the wrong " .. attr or "has no " .. attr)
						)
					end
				end
			end
			if inst:IsA("TextLabel") and inst.Text ~= "" then
				local worst, varies = math.huge, false
				for _, list in ipairs(builds) do
					local label = list[k]
					local back = backgroundOf(label)
					if back then
						worst = math.min(worst, contrast(label.TextColor3, back))
						varies = varies or not same(label.TextColor3, inst.TextColor3) or not same(back, backgroundOf(inst))
					end
				end
				if varies and worst < 3 then
					table.insert(
						problems,
						("%s ('%s') is hard to read in some team palette (contrast %.2f)"):format(inst:GetFullName(), inst.Text, worst)
					)
				end
			end
		end
		for index, problem in ipairs(problems) do
			if index <= 12 then
				addWarning("team colours: " .. problem)
			end
		end
		if #problems > 12 then
			addWarning(("team colours: ... and %d more"):format(#problems - 12))
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
		prompts = promptsOut,
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
print("\nInteractions per piece (prompts by kind, seats, camera seats, live screens):")
for _, key in ipairs(interactionOrder) do
	local t = interactionsByPiece[key]
	local sum = t.look + t.door + t.seat + t.elevator + t.use + t.live + t.seats
	if sum > 0 then
		print(
			("  %-22s look %2d  door %2d  use %2d  elevator %2d  seats %2d (camera %d)  live %2d"):format(
				key,
				t.look,
				t.door,
				t.use,
				t.elevator,
				t.seats,
				t.camera,
				t.live
			)
		)
	end
end

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
