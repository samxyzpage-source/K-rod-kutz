--[[
	Crowd
	Builds the simple NPC fans used on game days:
	  * seated fans that fill the stands the owner has built (rows come from Bowl.lua)
	  * walking fans that stroll in from the entrance gate

	Fans are a couple of anchored blocks (no Humanoids), so even a full crowd is cheap. A seated
	fan is just TWO instances, no Model: its jersey block (a part named "Fan", straight in the
	crowd folder) with its head as a child part. The GameDay module tags every jersey block
	"TycoonFan" and the client makes the fans near the camera hop (Effects.client.lua moves the
	block and the parts inside it together).
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

local function quiet(part)
	-- fans are decoration only: no touches, no raycasts (they hop on clients)
	part.CanTouch = false
	part.CanQuery = false
	return part
end

--[[
	One seated fan, sitting on top of a row, facing the field: the jersey block (named "Fan", made
	in ctx.parent) with the head as its child part. Returns the jersey block.
	seat = { cframe = plot-local seat CFrame, jersey = Color3, skin = Color3 } (see PlanSeats)
]]
function Crowd.SeatedFan(ctx, seat)
	local body = quiet(BuildUtil.Part(ctx, {
		Name = "Fan",
		Size = Vector3.new(2, 2.4, 1.2),
		CFrame = seat.cframe * CFrame.new(0, 1.2, 0),
		Color = seat.jersey,
		Material = Enum.Material.SmoothPlastic,
		CanCollide = false,
		CastShadow = false,
	}))
	quiet(BuildUtil.Part(ctx, {
		Name = "Head",
		Size = Vector3.new(1.3, 1.3, 1.3),
		CFrame = seat.cframe * CFrame.new(0, 3.05, 0),
		Color = seat.skin,
		Material = Enum.Material.SmoothPlastic,
		CanCollide = false,
		CastShadow = false,
		Parent = body,
	}))
	return body
end

-- Which stands fill first: the lower bowl's sidelines (what the field, the press box and the TV
-- cameras look at), then the rest of the lower bowl, the club seats and the upper deck. Sections
-- nearer the 50-yard line fill before the ones near the corners.
local TIER_WEIGHT = { lower = 3, club = 2, upper = 1.4 }
local KIND_WEIGHT = { side = 1, ["end"] = 0.7, corner = 0.55 }
local SECTION_FILL = 0.5 -- share of a chosen section's seats that get a fan
local SPRINKLE = 0.1 -- share of the fans scattered over all the other seats

-- Random order of a list, in place (Fisher-Yates).
local function shuffle(list, rng)
	for index = #list, 2, -1 do
		local pick = rng:NextInteger(1, index)
		list[index], list[pick] = list[pick], list[index]
	end
end

--[[
	Works out where up to `maxFans` seated fans sit in the owner's stands and what they wear.
	No instances are made here: Crowd.SeatedFan builds each planned fan.
	Fans sit together in SECTIONS (a tier's rows between two aisles of one segment), like a real
	crowd, instead of one here and one there: the best sections fill up first (see TIER_WEIGHT)
	and a few fans are scattered over the rest of the seats.
	ctx      BuildUtil context (only ctx.config and ctx.colors are read)
	owned    set of owned item ids (a tier/segment has seats once its owning step is built, see
	         Bowl.Pieces)
	rng      a Random object (or anything with :NextNumber() and :NextInteger(a, b))
	pace     optional fn() called between rows and sections: GameDay yields in it, so looking at
	         the ~15,000 seats of a full bowl is spread over several frames
	Returns a list of seats { cframe (plot-local), jersey, skin } for Crowd.SeatedFan.
]]
function Crowd.PlanSeats(ctx, owned, maxFans, rng, pace)
	local L = ctx.config.Layout
	local B = L.Bowl
	local planned = {}
	if maxFans <= 0 then
		return planned
	end

	-- every free seat of every built row, grouped into sections
	local sections, byKey = {}, {}
	local total = 0
	for _, entry in ipairs(Bowl.BuiltRows(L, owned)) do
		local row = entry.row
		local segment = Bowl.Segment(L, entry.segment, row.inner, row.outer)
		for _, spot in ipairs(Bowl.SeatSpots(L, row, entry.segment, SEAT_SPACING)) do
			local along = segment.cframe:PointToObjectSpace(spot.Position).X
			local index -- 0 = the middle section of the segment
			if segment.kind == "corner" then
				index = along < 0 and -1 or 0 -- one aisle in the middle of a corner
			else
				index = math.floor((along + B.AisleFirst) / B.AisleSpacing)
			end
			local key = row.tier .. "/" .. entry.segment .. "/" .. index
			local section = byKey[key]
			if not section then
				local distance = segment.kind == "corner" and 0 or math.abs(index)
				local weight = TIER_WEIGHT[row.tier] * KIND_WEIGHT[segment.kind] / (1 + 0.35 * distance)
				section = { seats = {}, priority = weight * (0.75 + 0.5 * rng:NextNumber()) }
				byKey[key] = section
				table.insert(sections, section)
			end
			table.insert(section.seats, { cframe = spot, visitor = entry.visitor })
			total += 1
		end
		if pace then
			pace()
		end
	end
	if total == 0 then
		return planned
	end
	table.sort(sections, function(a, b)
		return a.priority > b.priority
	end)

	-- whole sections first (best first), then a sprinkle over every seat that is still free
	local count = math.min(maxFans, total)
	local inSections = math.min(count, math.floor(count * (1 - SPRINKLE) + 0.5))
	local chosen, rest = {}, {}
	for _, section in ipairs(sections) do
		shuffle(section.seats, rng)
		local take = math.min(math.ceil(#section.seats * SECTION_FILL), inSections - #chosen)
		for index, seat in ipairs(section.seats) do
			if index <= take then
				table.insert(chosen, seat)
			else
				table.insert(rest, seat)
			end
		end
		if pace then
			pace()
		end
	end
	shuffle(rest, rng)
	for index = 1, math.min(count - #chosen, #rest) do
		table.insert(chosen, rest[index])
	end

	for _, seat in ipairs(chosen) do
		local jersey
		if seat.visitor and rng:NextNumber() < 0.5 then
			jersey = VISITOR_COLOR
		else
			-- mix the team colours (plus white) so fans stand out against the seats
			local roll = rng:NextNumber()
			jersey = roll < 0.4 and ctx.colors.Secondary or (roll < 0.7 and ctx.colors.Trim or ctx.colors.Primary)
		end
		local skin = SKIN_TONES[rng:NextInteger(1, #SKIN_TONES)]
		table.insert(planned, { cframe = seat.cframe, jersey = jersey, skin = skin })
	end
	return planned
end

--[[
	Plans and builds the whole seated crowd at once (ctx.parent = folder for the fans), e.g. for
	the offline preview. Returns the list of jersey blocks. (On game days GameDay.lua builds the
	planned fans a chunk per frame instead.)
]]
function Crowd.SeatedFans(ctx, owned, maxFans, rng)
	local fans = {}
	for _, seat in ipairs(Crowd.PlanSeats(ctx, owned, maxFans, rng)) do
		table.insert(fans, Crowd.SeatedFan(ctx, seat))
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
