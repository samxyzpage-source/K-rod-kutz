--[[
	Crowd
	Builds the simple NPC fans used on game days:
	  * seated fans that fill the stands the owner has built
	  * walking fans that stroll in from the entrance gate

	Fans are a couple of anchored blocks (no Humanoids), so even a full crowd is cheap.
	Every fan model is tagged "TycoonFan" by the GameDay module; the client makes them cheer.
	Like the Builders, this module only uses BuildUtil + datatypes, so it can run in the
	offline preview tools.
]]

local BuildUtil = require(script.Parent.BuildUtil)

local Crowd = {}

local SKIN_TONES = {
	Color3.fromRGB(255, 220, 177),
	Color3.fromRGB(234, 192, 134),
	Color3.fromRGB(198, 134, 66),
	Color3.fromRGB(141, 85, 36),
	Color3.fromRGB(95, 60, 30),
}
local VISITOR_COLOR = Color3.fromRGB(150, 150, 158)

--[[
	Seat sections for each stands item, derived from Config.Layout. Every section has:
	  origin   local CFrame at ground level, front-centre of row 1, LookVector pointing AWAY from the field
	  length   row length (along the CFrame's X axis)
	  rows     number of rows, firstHeight = top of row 1
	  gaps     list of {from, to} offsets along the row that must stay empty (e.g. the tunnel)
	  visitor  true = fans wear grey visitor colours
]]
function Crowd.SeatSections(layout, owned)
	local L = layout
	local sections = {}
	local function add(itemId, origin, length, firstHeight, gaps, visitor)
		if owned[itemId] then
			table.insert(sections, {
				origin = origin,
				length = length,
				rows = itemId:find("upper") and L.UpperRows or L.LowerRows,
				firstHeight = firstHeight,
				gaps = gaps or {},
				visitor = visitor or false,
			})
		end
	end
	local sideLength = L.SidelineStandsHalfLength * 2
	local tunnel = { { -L.TunnelHalfWidth - 1, L.TunnelHalfWidth + 1 } }
	local endLength = L.FieldWidth
	local back = CFrame.Angles(0, math.pi, 0)

	add("bleachers_home", CFrame.new(0, 0, L.SurfaceMaxZ) * back, sideLength, L.RowRise)
	add("upper_home", CFrame.new(0, 0, L.BackLowerOuterZ) * back, sideLength, L.UpperStartHeight)
	add("bleachers_visitor", CFrame.new(0, 0, L.SurfaceMinZ), sideLength, L.RowRise, tunnel, true)
	add("upper_visitor", CFrame.new(0, 0, L.FrontLowerOuterZ), sideLength, L.UpperStartHeight, tunnel, true)
	add("endzone_stands_east", CFrame.new(L.SurfaceHalfX, 0, L.FieldCenterZ) * CFrame.Angles(0, -math.pi / 2, 0), endLength, L.RowRise)
	add("endzone_stands_west", CFrame.new(-L.SurfaceHalfX, 0, L.FieldCenterZ) * CFrame.Angles(0, math.pi / 2, 0), endLength, L.RowRise)
	return sections
end

local function inGap(offset, gaps)
	for _, gap in ipairs(gaps) do
		if offset >= gap[1] and offset <= gap[2] then
			return true
		end
	end
	return false
end

-- One seated fan: a jersey block and a head, sitting on top of a row, facing the field.
local function seatedFan(ctx, seatCFrame, jersey, skin, number)
	local fanCtx, model = BuildUtil.Child(ctx, "Fan" .. number)
	BuildUtil.Part(fanCtx, {
		Name = "Body",
		Size = Vector3.new(2, 2.4, 1.2),
		CFrame = seatCFrame * CFrame.new(0, 1.2, 0),
		Color = jersey,
		Material = Enum.Material.SmoothPlastic,
		CanCollide = false,
		CastShadow = false,
	})
	BuildUtil.Part(fanCtx, {
		Name = "Head",
		Size = Vector3.new(1.3, 1.3, 1.3),
		CFrame = seatCFrame * CFrame.new(0, 3.05, 0),
		Color = skin,
		Material = Enum.Material.SmoothPlastic,
		CanCollide = false,
		CastShadow = false,
	})
	return model
end

--[[
	Fills the owner's stands with up to `maxFans` seated fans.
	ctx      BuildUtil context (ctx.parent = folder for the fans)
	owned    set of owned item ids
	rng      a Random object (or anything with :NextNumber() and :NextInteger(a, b))
	Returns the list of fan models.
]]
function Crowd.SeatedFans(ctx, owned, maxFans, rng)
	local L = ctx.config.Layout
	local sections = Crowd.SeatSections(L, owned)
	local fans = {}
	if #sections == 0 or maxFans <= 0 then
		return fans
	end
	local perSection = math.max(1, math.floor(maxFans / #sections))
	local count = 0
	for _, section in ipairs(sections) do
		local placed = 0
		local attempts = 0
		local used = {}
		while placed < perSection and attempts < perSection * 6 do
			attempts += 1
			local row = rng:NextInteger(1, section.rows)
			local offset = (rng:NextNumber() - 0.5) * (section.length - 4)
			local slot = row .. ":" .. math.floor(offset / 2.6)
			if not inGap(offset, section.gaps) and not used[slot] then
				used[slot] = true
				local top = section.firstHeight + (row - 1) * L.RowRise
				-- rows step along the section's LookVector; sit a little toward the field side of the row
				local depth = (row - 0.5) * L.RowDepth - 0.6
				-- the fan looks back toward the field (+Z of the section CFrame)
				local seat = section.origin * CFrame.new(offset, top, -depth) * CFrame.Angles(0, math.pi, 0)
				local jersey
				if section.visitor and rng:NextNumber() < 0.5 then
					jersey = VISITOR_COLOR
				else
					-- mix the team colours (plus white) so fans stand out against the seats
					local roll = rng:NextNumber()
					jersey = roll < 0.4 and ctx.colors.Secondary or (roll < 0.7 and ctx.colors.Trim or ctx.colors.Primary)
				end
				local skin = SKIN_TONES[rng:NextInteger(1, #SKIN_TONES)]
				count += 1
				table.insert(fans, seatedFan(ctx, seat, jersey, skin, count))
				placed += 1
			end
		end
	end
	return fans
end

--[[
	A walking fan for the entrance parade. Returns the model and its root part.
	The root is anchored; the other parts are welded to it, so moving the root moves the fan.
	startCFrame is plot-local.
]]
function Crowd.Walker(ctx, startCFrame, jersey, skin, number)
	local fanCtx, model = BuildUtil.Child(ctx, "Walker" .. number)
	local root = BuildUtil.Part(fanCtx, {
		Name = "Root",
		Size = Vector3.new(1.8, 2, 1),
		CFrame = startCFrame * CFrame.new(0, 3, 0),
		Color = jersey,
		Material = Enum.Material.SmoothPlastic,
		CanCollide = false,
		CastShadow = false,
	})
	local function welded(name, size, offset, color)
		local part = BuildUtil.Part(fanCtx, {
			Name = name,
			Size = size,
			CFrame = startCFrame * offset,
			Color = color,
			Material = Enum.Material.SmoothPlastic,
			CanCollide = false,
			CastShadow = false,
		})
		part.Anchored = false
		local weld = Instance.new("WeldConstraint")
		weld.Part0 = root
		weld.Part1 = part
		weld.Parent = part
		return part
	end
	welded("Head", Vector3.new(1.1, 1.1, 1.1), CFrame.new(0, 4.6, 0), skin)
	welded("Legs", Vector3.new(1.6, 2, 0.9), CFrame.new(0, 1, 0), Color3.fromRGB(40, 44, 60))
	model.PrimaryPart = root
	return model, root
end

Crowd.SkinTones = SKIN_TONES
Crowd.VisitorColor = VISITOR_COLOR

return Crowd
