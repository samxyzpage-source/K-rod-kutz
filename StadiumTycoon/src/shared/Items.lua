--[[
	Items
	Everything you can build, as PIECES (a room, a field, a stand...). Every piece is built in
	several STEPS: e.g. the Practice Field goes Grass -> Yard Lines -> End Zones -> Goal Posts ->
	Fence & Sideline -> Bleachers. Each step is its own buy button (shown one after another on the
	piece's button spot).

	Piece fields:
	  Id        unique key; also the name of the builder function in Builders/
	  Name      shown on the buy button
	  Stages    list of step names (2-6)
	  Cost      total price of all steps (split over the steps, later steps cost more)
	  Income    total cash/second of all steps (split the same way)
	  Requires  list of piece Ids that must be FULLY built before this piece's first step appears
	  Button    plot-local position of the piece's buy button (y = 0 is the plot surface)

	Items.List is generated from the pieces: one entry per step with
	  Id = "<pieceId>:<step>", PieceId, Stage, StageCount, Name, StageName, Cost, Income, Requires, Button

	To add a piece: add it to PIECES below and add a builder function with the same Id in one of the
	modules in ServerScriptService/TycoonServer/Builders (use BuildUtil.Stage(ctx, n) inside it to
	say which parts belong to which step).
]]

local Items = {}

local SIDELINE_Z = -29 -- the buy-button row on the front sideline of the stadium
local HQ_FRONT_BUTTON_Z = 268 -- HQ corridor, in front of the front-row rooms
local HQ_BACK_BUTTON_Z = 274 -- HQ corridor, in front of the back-row rooms
local PRICE_SCALE = 2.6 -- multiplies every Cost below (tune the game's length here)

local function piece(id, name, stages, cost, income, requires, button)
	return { Id = id, Name = name, Stages = stages, Cost = cost, Income = income, Requires = requires, Button = button }
end

local PIECES = {
	-- The Team HQ (you start inside it) ----------------------------------------------------------
	piece(
		"hq_lobby",
		"Lobby & Reception",
		{ "Reception Desk", "Team Wall & Logo", "Seating & Plants", "Trophy Case", "Big Screen" },
		300,
		10,
		{},
		Vector3.new(-100, 0, 222)
	),
	piece(
		"hq_frontoffice",
		"Front Office",
		{ "Walls & Door", "GM Desk", "Draft Board", "Windows & Decor" },
		800,
		14,
		{ "hq_lobby" },
		Vector3.new(-232, 0, HQ_FRONT_BUTTON_Z)
	),
	piece(
		"hq_lockerroom",
		"Locker Room",
		{ "Walls & Floor", "Lockers", "Benches & Logo", "Showers & Extras" },
		1200,
		18,
		{ "hq_lobby" },
		Vector3.new(-216, 0, HQ_BACK_BUTTON_Z)
	),
	piece(
		"hq_coaches",
		"Coaches' Offices",
		{ "Walls & Doors", "Head Coach Office", "Assistant Desks", "Play Whiteboards" },
		2000,
		22,
		{ "hq_frontoffice" },
		Vector3.new(-183, 0, HQ_FRONT_BUTTON_Z)
	),

	-- Practice ---------------------------------------------------------------------------------------
	piece(
		"practice_field",
		"Practice Field",
		{ "Grass", "Yard Lines", "End Zones", "Goal Posts", "Fence & Sideline", "Bleachers" },
		3500,
		32,
		{ "hq_lockerroom" },
		Vector3.new(-130, 0, 392)
	),
	piece(
		"hq_weightroom",
		"Weight Room",
		{ "Walls & Rubber Floor", "Squat Racks", "Benches & Dumbbells", "Mirrors & Banners" },
		4500,
		36,
		{ "hq_lockerroom" },
		Vector3.new(-117, 0, HQ_BACK_BUTTON_Z)
	),
	piece(
		"hq_equipment",
		"Equipment Room",
		{ "Walls & Shelves", "Helmets & Pads", "Laundry & Carts" },
		5000,
		38,
		{ "hq_lockerroom" },
		Vector3.new(-167, 0, HQ_BACK_BUTTON_Z)
	),
	piece(
		"golf_carts",
		"Golf Cart Garage",
		{ "Garage", "Golf Cart #1", "Golf Cart #2", "Charging Station & Cart #3" },
		6000,
		30,
		{ "practice_field" },
		Vector3.new(124, 0, 324) -- between the Hall of Fame and the garage (clear of the carts' exits)
	),
	piece(
		"practice_gear",
		"Practice Gear",
		{ "Blocking Sleds", "Tackling Dummies", "Agility Ladder & Cones", "Coach Tower" },
		7000,
		44,
		{ "practice_field" },
		Vector3.new(-40, 0, 392)
	),
	piece(
		"hq_trainingroom",
		"Training Room",
		{ "Walls & Floor", "Treatment Tables", "Cold & Hot Tubs", "Rehab Gear" },
		8500,
		50,
		{ "hq_weightroom" },
		Vector3.new(-67, 0, HQ_BACK_BUTTON_Z)
	),
	piece(
		"hq_filmroom",
		"Film Room",
		{ "Walls & Tiers", "Seats", "Big Screen & Projector" },
		10000,
		56,
		{ "hq_coaches" },
		Vector3.new(-17, 0, HQ_BACK_BUTTON_Z)
	),
	piece(
		"hq_meeting",
		"Team Meeting Room",
		{ "Walls", "Seating Rows", "Podium & Screen" },
		12000,
		62,
		{ "hq_coaches" },
		Vector3.new(17, 0, HQ_FRONT_BUTTON_Z)
	),
	piece(
		"staff_coaches",
		"Coaching Staff",
		{ "Offensive Coordinator", "Defensive Coordinator", "Special Teams Coach" },
		13000,
		54,
		{ "hq_coaches", "practice_field" },
		Vector3.new(-165, 0, 391)
	),
	piece(
		"staff_trainers",
		"Medical & Training Staff",
		{ "Head Trainer", "Strength Coach", "Team Doctor" },
		16000,
		60,
		{ "hq_trainingroom", "practice_field" },
		Vector3.new(-75, 0, 391)
	),

	-- The stadium: field ---------------------------------------------------------------------------
	piece(
		"turf",
		"Stadium Turf",
		{ "Field Base", "Grass", "Mowing Stripes" },
		15000,
		70,
		{ "hq_filmroom", "practice_gear" },
		Vector3.new(0, 0, 165)
	),
	piece(
		"yardlines",
		"Yard Lines",
		{ "Sidelines & End Lines", "Yard Lines", "Numbers & Hash Marks" },
		17000,
		74,
		{ "turf" },
		Vector3.new(-20, 0, SIDELINE_Z)
	),
	piece(
		"benches",
		"Team Benches",
		{ "Sideline Mats", "Benches", "Coolers & Medical Tent", "Sideline Boards" },
		19000,
		78,
		{ "turf" },
		Vector3.new(20, 0, SIDELINE_Z)
	),
	piece(
		"endzones",
		"End Zones",
		{ "End Zone Paint", "Team Name", "Pylons" },
		21000,
		82,
		{ "yardlines" },
		Vector3.new(-33, 0, SIDELINE_Z)
	),
	piece(
		"hq_cafeteria",
		"Cafeteria",
		{ "Walls & Floor", "Serving Line", "Tables & Chairs", "Smoothie Bar" },
		23000,
		86,
		{ "hq_trainingroom" },
		Vector3.new(57, 0, HQ_BACK_BUTTON_Z)
	),
	piece(
		"goalposts",
		"Goal Posts",
		{ "Posts & Padding", "Crossbars & Uprights", "Wind Ribbons" },
		26000,
		90,
		{ "endzones" },
		Vector3.new(-46, 0, SIDELINE_Z)
	),
	piece("ticketbooth", "Ticket Booth", { "Booth", "Window & Awning", "Signs" }, 28000, 92, { "turf" }, Vector3.new(-20, 0, -166)),
	piece("midfield", "Midfield Logo", { "Logo Ring", "Team Logo" }, 30000, 95, { "endzones" }, Vector3.new(33, 0, SIDELINE_Z)),
	piece(
		"concessions",
		"Concession Stand",
		{ "Stand", "Counter & Awning", "Menu & Giant Hot Dog" },
		34000,
		100,
		{ "ticketbooth" },
		Vector3.new(-38, 0, -128)
	),
	piece(
		"staff_vendors",
		"Food Vendors",
		{ "Hot Dog Vendor", "Popcorn Vendor", "Drinks Vendor" },
		36000,
		100,
		{ "concessions" },
		Vector3.new(-96, 0, -175)
	),
	piece(
		"hq_lounge",
		"Player Lounge",
		{ "Walls & Carpet", "Couches & TV", "Pool & Ping-Pong", "Arcade & Snacks" },
		38000,
		105,
		{ "hq_cafeteria" },
		Vector3.new(66, 0, HQ_FRONT_BUTTON_Z)
	),

	-- The stadium: the bowl -------------------------------------------------------------------------
	piece(
		"bleachers_home",
		"Home Stands",
		{ "Concrete Rows", "Seats", "Aisles & Railings", "Field Wall & Signs", "Home Tunnel" },
		45000,
		120,
		{ "goalposts" },
		Vector3.new(46, 0, SIDELINE_Z)
	),
	piece(
		"home_lockerroom",
		"Home Locker Room",
		{ "Building", "Lockers", "Logo & Whiteboard" },
		50000,
		125,
		{ "bleachers_home" },
		Vector3.new(20, 0, 163)
	),
	piece(
		"hq_interview",
		"Interview Room",
		{ "Walls & Backdrop", "Podium & Mics", "Press Seats & Cameras" },
		55000,
		130,
		{ "hq_meeting" },
		Vector3.new(-33, 0, HQ_FRONT_BUTTON_Z)
	),
	piece(
		"bleachers_visitor",
		"Visitor Stands",
		{ "Concrete Rows", "Seats", "Aisles & Railings", "Field Wall & Players' Tunnel" },
		62000,
		140,
		{ "bleachers_home" },
		Vector3.new(-59, 0, SIDELINE_Z)
	),
	piece(
		"visitor_lockerroom",
		"Visitor Locker Room",
		{ "Building", "Lockers", "Bench & Signs" },
		68000,
		145,
		{ "bleachers_visitor" },
		Vector3.new(-58, 0, -105)
	),
	piece(
		"scoreboard",
		"Scoreboard",
		{ "Support Legs", "Board Frame", "Screens" },
		75000,
		155,
		{ "bleachers_home" },
		Vector3.new(59, 0, SIDELINE_Z)
	),
	piece(
		"parking",
		"Parking Lot",
		{ "Asphalt", "Parking Lines", "Lamp Posts", "Cars" },
		85000,
		165,
		{ "concessions" },
		Vector3.new(-84, 0, -165)
	),
	piece(
		"endzone_stands_west",
		"West End Zone Seats",
		{ "Concrete Rows", "Seats", "Aisles & Walls" },
		95000,
		175,
		{ "bleachers_visitor" },
		Vector3.new(-72, 0, SIDELINE_Z)
	),
	piece(
		"endzone_stands_east",
		"East End Zone Seats",
		{ "Concrete Rows", "Seats", "Aisles & Walls" },
		95000,
		175,
		{ "bleachers_visitor" },
		Vector3.new(72, 0, SIDELINE_Z)
	),
	piece(
		"corner_seats",
		"Corner Seats (Full Bowl)",
		{ "Concrete Rows", "Seats", "Corner Walls & Aisles" },
		120000,
		200,
		{ "endzone_stands_west", "endzone_stands_east" },
		Vector3.new(-124, 0, SIDELINE_Z)
	),
	piece(
		"teamstore",
		"Team Store",
		{ "Building", "Glass Front & Doors", "Merch & Sign" },
		135000,
		210,
		{ "parking" },
		Vector3.new(40, 0, -150)
	),
	piece(
		"fan_zone",
		"Tailgate & Fan Zone",
		{ "Tailgate Lot", "Food Trucks", "Tents & Grills", "Football Toss Game", "Mascot Statue", "Stage & Speakers" },
		160000,
		240,
		{ "teamstore" },
		Vector3.new(206, 0, -150)
	),
	piece(
		"lights",
		"Stadium Lights",
		{ "Tower 1", "Tower 2", "Tower 3", "Tower 4" },
		190000,
		260,
		{ "scoreboard" },
		Vector3.new(-85, 0, SIDELINE_Z)
	),
	piece(
		"upper_home",
		"Home Upper Deck",
		{ "Upper Rows", "Seats", "Facade & Railings", "Tunnel Bridge" },
		230000,
		290,
		{ "corner_seats" },
		Vector3.new(85, 0, SIDELINE_Z)
	),
	piece(
		"indoor_dome",
		"Indoor Practice Dome",
		{ "Frame", "Turf & Lines", "Roof Panels", "Doors & Lights" },
		270000,
		320,
		{ "upper_home", "practice_gear" },
		Vector3.new(150, 0, 400)
	),
	piece(
		"hall_of_fame",
		"Hall of Fame & Museum",
		{ "Building", "Trophy Cases", "Jersey Wall", "Player Statues", "Gold Entrance" },
		320000,
		350,
		{ "hq_interview", "upper_home" },
		Vector3.new(195, 0, 193)
	),
	piece(
		"upper_visitor",
		"Visitor Upper Deck",
		{ "Upper Rows", "Seats", "Facade & Railings" },
		380000,
		390,
		{ "upper_home" },
		Vector3.new(-98, 0, SIDELINE_Z)
	),
	piece(
		"jumbotron",
		"Jumbotron",
		{ "Support Tower", "Screen Frame", "Video Screen & Speakers" },
		450000,
		430,
		{ "lights" },
		Vector3.new(98, 0, SIDELINE_Z)
	),
	piece(
		"pressbox",
		"Press Box",
		{ "Columns & Floor", "Lower Level", "Upper Level", "Roof & TV Cameras" },
		530000,
		470,
		{ "upper_home" },
		Vector3.new(-111, 0, SIDELINE_Z)
	),
	piece(
		"upper_bowl_ends",
		"Upper Bowl Ends (Full Ring)",
		{ "End Rows", "Corner Rows", "Seats", "Facades & Railings" },
		620000,
		520,
		{ "upper_visitor" },
		Vector3.new(124, 0, SIDELINE_Z)
	),
	piece(
		"suites",
		"Luxury Suites",
		{ "Columns & Floor", "Glass Fronts", "Suite Interiors & Signs" },
		720000,
		570,
		{ "upper_visitor" },
		Vector3.new(111, 0, SIDELINE_Z)
	),
	piece(
		"broadcast_booth",
		"TV Broadcast Booth",
		{ "Booth", "Glass & Cameras", "Satellite Dish" },
		830000,
		620,
		{ "suites", "pressbox" },
		Vector3.new(16, 0, -100)
	),
	piece(
		"canopy",
		"Stadium Canopy",
		{ "Roof Supports", "Sideline Roofs", "End Roofs", "Roof Lights" },
		1000000,
		700,
		{ "upper_bowl_ends", "broadcast_booth" },
		Vector3.new(0, 0, 10)
	),
	piece(
		"trophy",
		"Championship Trophy",
		{ "Plinth", "Trophy Base", "Golden Trophy", "Champions Plaque" },
		1500000,
		800,
		{ "canopy", "jumbotron", "indoor_dome", "hall_of_fame" },
		Vector3.new(118, 0, -140)
	),
}

-- Rounds a price to 2 significant digits (1234 -> 1200, 56789 -> 57000).
local function nice(value)
	if value <= 0 then
		return 0
	end
	local digits = math.max(0, math.floor(math.log10(value)) - 1)
	local unit = 10 ^ digits
	return math.floor(value / unit + 0.5) * unit
end

Items.Pieces = PIECES
Items.PieceById = {}
Items.List = {}
Items.ById = {}

for _, p in ipairs(PIECES) do
	Items.PieceById[p.Id] = p
end

for pieceIndex, p in ipairs(PIECES) do
	local count = #p.Stages
	local weightTotal = count * (count + 1) / 2
	p.Order = pieceIndex
	p.StageIds = {}
	for stage, stageName in ipairs(p.Stages) do
		local requires
		if stage == 1 then
			requires = {}
			for _, requiredPiece in ipairs(p.Requires) do
				local other = Items.PieceById[requiredPiece]
				assert(other, ("Items: %s requires unknown piece %s"):format(p.Id, requiredPiece))
				table.insert(requires, requiredPiece .. ":" .. #other.Stages)
			end
		else
			requires = { p.Id .. ":" .. (stage - 1) }
		end
		local cost = nice(p.Cost * PRICE_SCALE * stage / weightTotal)
		if pieceIndex == 1 and stage == 1 then
			cost = 0 -- the very first step is free
		end
		local entry = {
			Id = p.Id .. ":" .. stage,
			PieceId = p.Id,
			Stage = stage,
			StageCount = count,
			Name = ("%s: %s"):format(p.Name, stageName),
			PieceName = p.Name,
			StageName = stageName,
			Cost = cost,
			Income = math.max(1, math.floor(p.Income * stage / weightTotal + 0.5)),
			Requires = requires,
			Button = p.Button,
		}
		table.insert(Items.List, entry)
		Items.ById[entry.Id] = entry
		p.StageIds[stage] = entry.Id
	end
end
for index, entry in ipairs(Items.List) do
	entry.Order = index
end

-- Returns true when every requirement of `item` is in the `owned` set.
function Items.IsUnlocked(item, owned)
	for _, requiredId in ipairs(item.Requires) do
		if not owned[requiredId] then
			return false
		end
	end
	return true
end

-- Total income per second for an `owned` set ({ [itemId] = true }).
function Items.TotalIncome(owned)
	local total = 0
	for id in pairs(owned) do
		local item = Items.ById[id]
		if item then
			total += item.Income
		end
	end
	return total
end

-- How many steps of a piece are owned (steps are always bought in order).
function Items.StagesOwned(owned, pieceId)
	local p = Items.PieceById[pieceId]
	local count = 0
	if p then
		for stage = 1, #p.Stages do
			if owned[pieceId .. ":" .. stage] then
				count = stage
			else
				break
			end
		end
	end
	return count
end

-- True if at least `stage` steps (default: all) of a piece are owned.
function Items.HasPiece(owned, pieceId, stage)
	local p = Items.PieceById[pieceId]
	if not p then
		return false
	end
	return Items.StagesOwned(owned, pieceId) >= (stage or #p.Stages)
end

return Items
