--[[
	Crowd
	Builds the simple NPC fans used on game days:
	  * seated fans that fill the stands the owner has built (rows come from Bowl.lua)
	  * walking fans that stroll in from the entrance gate

	Fans are a couple of anchored blocks (no Humanoids), so even a full crowd is cheap.
	Every fan model is tagged "TycoonFan" by the GameDay module; the client makes them cheer.
	Like the Builders, this module only uses BuildUtil + datatypes, so it can run in the
	offline preview tools.
]]

local BuildUtil = require(script.Parent.BuildUtil)
local Bowl = require(script.Parent.Bowl)

local Crowd = {}

local SKIN_TONES = {
	Color3.fromRGB(255, 220, 177),
	Color3.fromRGB(234, 192, 134),
	Color3.fromRGB(198, 134, 66),
	Color3.fromRGB(141, 85, 36),
	Color3.fromRGB(95, 60, 30),
}
local VISITOR_COLOR = Color3.fromRGB(150, 150, 158)
local SEAT_SPACING = 2.6 -- fans are 2 studs wide

-- One seated fan: a jersey block and a head, sitting on top of a row, facing the field.
local function quiet(part)
	-- fans are decoration only: no touches, no raycasts (they move every frame on clients)
	part.CanTouch = false
	part.CanQuery = false
	return part
end

local function seatedFan(ctx, seatCFrame, jersey, skin, number)
	local fanCtx, model = BuildUtil.Child(ctx, "Fan" .. number)
	quiet(BuildUtil.Part(fanCtx, {
		Name = "Body",
		Size = Vector3.new(2, 2.4, 1.2),
		CFrame = seatCFrame * CFrame.new(0, 1.2, 0),
		Color = jersey,
		Material = Enum.Material.SmoothPlastic,
		CanCollide = false,
		CastShadow = false,
	}))
	quiet(BuildUtil.Part(fanCtx, {
		Name = "Head",
		Size = Vector3.new(1.3, 1.3, 1.3),
		CFrame = seatCFrame * CFrame.new(0, 3.05, 0),
		Color = skin,
		Material = Enum.Material.SmoothPlastic,
		CanCollide = false,
		CastShadow = false,
	}))
	return model
end

--[[
	Fills the owner's stands with up to `maxFans` seated fans.
	ctx      BuildUtil context (ctx.parent = folder for the fans)
	owned    set of owned item ids (a tier/segment has seats once its owning step is built, see
	         Bowl.Pieces)
	rng      a Random object (or anything with :NextNumber() and :NextInteger(a, b))
	Returns the list of fan models.
]]
function Crowd.SeatedFans(ctx, owned, maxFans, rng)
	local L = ctx.config.Layout
	local fans = {}
	if maxFans <= 0 then
		return fans
	end
	-- every free seat of every built row, then a random selection of them
	local seats = {}
	for _, entry in ipairs(Bowl.BuiltRows(L, owned)) do
		for _, spot in ipairs(Bowl.SeatSpots(L, entry.row, entry.segment, SEAT_SPACING)) do
			table.insert(seats, { cframe = spot, visitor = entry.visitor })
		end
	end
	local count = math.min(maxFans, #seats)
	for index = 1, count do
		-- partial Fisher-Yates shuffle: pick a random remaining seat
		local pick = rng:NextInteger(index, #seats)
		seats[index], seats[pick] = seats[pick], seats[index]
		local seat = seats[index]
		local jersey
		if seat.visitor and rng:NextNumber() < 0.5 then
			jersey = VISITOR_COLOR
		else
			-- mix the team colours (plus white) so fans stand out against the seats
			local roll = rng:NextNumber()
			jersey = roll < 0.4 and ctx.colors.Secondary or (roll < 0.7 and ctx.colors.Trim or ctx.colors.Primary)
		end
		local skin = SKIN_TONES[rng:NextInteger(1, #SKIN_TONES)]
		table.insert(fans, seatedFan(ctx, seat.cframe, jersey, skin, index))
	end
	return fans
end

--[[
	A walking fan for the entrance parade. Returns the model and its root part.
	The root is anchored; the other parts are welded to it, so moving the root moves the fan.
	startCFrame is plot-local.
]]
function Crowd.Walker(ctx, startCFrame, jersey, skin, number)
	-- (GameDay moves walkers on each client, see Effects.client.lua)
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
