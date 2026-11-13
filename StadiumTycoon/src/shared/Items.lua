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
	  Button    position of the piece's buy button in its AREA (y = the floor it stands on)
	  Area      which part of the plot it is built in (Config.Layout.Areas: "stadium", "campus",
	            "plaza", "fanzone"); its builder, button and zone all use that area's coordinates

	Items.List is generated from the pieces: one entry per step with
	  Id = "<pieceId>:<step>", PieceId, Stage, StageCount, Name, StageName, Cost, Income, Requires,
	  Button (PLOT coordinates, area offset added), LocalButton, Area, AreaOffset

	To add a piece: add it to PIECES below and add a builder function with the same Id in one of the
	modules in ServerScriptService/TycoonServer/Builders (use BuildUtil.Stage(ctx, n) inside it to
	say which parts belong to which step).
]]

local Config = require(script.Parent.Config)
local AREAS = Config.Layout.Areas

local Items = {}

local SIDELINE_Z = -29 -- buy-button row along the front sideline of the stadium field
local BACK_LINE_Z = 89 -- buy-button row along the back sideline (outside the bench area)
local END_X = 128 -- buy buttons in the end-zone margins
local HQ_FRONT_BUTTON_Z = 268 -- HQ corridor, in front of the front-row rooms
local HQ_BACK_BUTTON_Z = 274 -- HQ corridor, in front of the back-row rooms
local UPPER_Y = 17 -- the HQ's upper floor (Config.Layout.HQ.UpperFloorY): upstairs buttons
local PRICE_SCALE = 2.6 -- multiplies every Cost below (tune the game's length here)

-- area = which part of the plot the piece is built in (Config.Layout.Areas): its builder, button
-- and zone use that area's coordinates. nil = "stadium" (plot coordinates).
local function piece(id, name, stages, cost, income, requires, button, area)
	return {
		Id = id,
		Name = name,
		Stages = stages,
		Cost = cost,
		Income = income,
		Requires = requires,
		Button = button,
		Area = area or "stadium",
	}
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
		Vector3.new(-100, 0, 222),
		"campus"
	),
	piece(
		"hq_frontoffice",
		"Front Office",
		{ "Walls & Door", "GM Desk", "Draft Board", "Windows & Decor" },
		800,
		14,
		{ "hq_lobby" },
		Vector3.new(-232, 0, HQ_FRONT_BUTTON_Z),
		"campus"
	),
	piece(
		"hq_lockerroom",
		"Locker Room",
		{ "Walls & Floor", "Lockers", "Benches & Logo", "Showers & Extras" },
		1200,
		18,
		{ "hq_lobby" },
		Vector3.new(-216, 0, HQ_BACK_BUTTON_Z),
		"campus"
	),
	piece(
		"hq_coaches",
		"Coaches' Offices",
		{ "Walls & Doors", "Head Coach Office", "Assistant Desks", "Play Whiteboards" },
		2000,
		22,
		{ "hq_frontoffice" },
		Vector3.new(-183, 0, HQ_FRONT_BUTTON_Z),
		"campus"
	),

	-- Practice ---------------------------------------------------------------------------------------
	piece(
		"practice_field",
		"Practice Field",
		{ "Grass", "Yard Lines", "End Zones", "Goal Posts", "Fence & Sideline", "Bleachers" },
		3500,
		32,
		{ "hq_lockerroom" },
		Vector3.new(-130, 0, 392),
		"campus"
	),
	piece(
		"hq_weightroom",
		"Weight Room",
		{ "Walls & Rubber Floor", "Squat Racks", "Benches & Dumbbells", "Mirrors & Banners" },
		4500,
		36,
		{ "hq_lockerroom" },
		Vector3.new(-117, 0, HQ_BACK_BUTTON_Z),
		"campus"
	),
	piece(
		"hq_equipment",
		"Equipment Room",
		{ "Walls & Shelves", "Helmets & Pads", "Laundry & Carts" },
		5000,
		38,
		{ "hq_lockerroom" },
		Vector3.new(-167, 0, HQ_BACK_BUTTON_Z),
		"campus"
	),
	piece(
		"golf_carts",
		"Golf Cart Garage",
		{ "Garage", "Golf Cart #1", "Golf Cart #2", "Charging Station & Cart #3" },
		6000,
		30,
		{ "practice_field" },
		Vector3.new(124, 0, 324), -- between the Hall of Fame and the garage (clear of the carts' exits)
		"campus"
	),
	piece(
		"practice_gear",
		"Practice Gear",
		{ "Blocking Sleds", "Tackling Dummies", "Agility Ladder & Cones", "Coach Tower" },
		7000,
		44,
		{ "practice_field" },
		Vector3.new(-40, 0, 392),
		"campus"
	),
	piece(
		"hq_trainingroom",
		"Training Room",
		{ "Walls & Floor", "Treatment Tables", "Cold & Hot Tubs", "Rehab Gear" },
		8500,
		50,
		{ "hq_weightroom" },
		Vector3.new(-67, 0, HQ_BACK_BUTTON_Z),
		"campus"
	),
	piece(
		"hq_filmroom",
		"Film Room",
		{ "Walls & Tiers", "Seats", "Big Screen & Projector" },
		10000,
		56,
		{ "hq_coaches" },
		Vector3.new(-17, 0, HQ_BACK_BUTTON_Z),
		"campus"
	),
	piece(
		"hq_meeting",
		"Team Meeting Room",
		{ "Walls", "Seating Rows", "Podium & Screen" },
		12000,
		62,
		{ "hq_coaches" },
		Vector3.new(17, 0, HQ_FRONT_BUTTON_Z),
		"campus"
	),
	piece(
		"hq_atrium",
		"Grand Atrium",
		{ "Grand Staircase", "Balcony & Railings", "Hanging Banners", "Video Wall" },
		11000,
		58,
		{ "hq_meeting" },
		Vector3.new(-100, 0, 256), -- on the path from the entrance to the corridor
		"campus"
	),
	piece(
		"staff_coaches",
		"Coaching Staff",
		{ "Offensive Coordinator", "Defensive Coordinator", "Special Teams Coach" },
		13000,
		54,
		{ "hq_coaches", "practice_field" },
		Vector3.new(-165, 0, 391),
		"campus"
	),
	piece(
		"staff_trainers",
		"Medical & Training Staff",
		{ "Head Trainer", "Strength Coach", "Team Doctor" },
		16000,
		60,
		{ "hq_trainingroom", "practice_field" },
		Vector3.new(-75, 0, 391),
		"campus"
	),

	-- The stadium field ---------------------------------------------------------------------------------
	piece(
		"turf",
		"Stadium Turf",
		{ "Field Base", "Grass", "Mowing Stripes" },
		15000,
		70,
		{ "hq_filmroom", "practice_gear" },
		Vector3.new(0, 0, 40)
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
		Vector3.new(57, 0, HQ_BACK_BUTTON_Z),
		"campus"
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
	piece(
		"ticketbooth",
		"Ticket Booth",
		{ "Booth", "Window & Awning", "Signs" },
		28000,
		92,
		{ "turf" },
		Vector3.new(-20, 0, -166),
		"plaza"
	),
	piece("midfield", "Midfield Logo", { "Logo Ring", "Team Logo" }, 30000, 95, { "endzones" }, Vector3.new(33, 0, SIDELINE_Z)),
	piece(
		"concessions",
		"Concession Stand",
		{ "Stand", "Counter & Awning", "Menu & Giant Hot Dog" },
		34000,
		100,
		{ "ticketbooth" },
		Vector3.new(-38, 0, -128),
		"plaza"
	),
	piece(
		"staff_vendors",
		"Food Vendors",
		{ "Hot Dog Vendor", "Popcorn Vendor", "Drinks Vendor" },
		36000,
		100,
		{ "concessions" },
		Vector3.new(-96, 0, -175),
		"plaza"
	),
	piece(
		"hq_lounge",
		"Player Lounge",
		{ "Walls & Carpet", "Couches & TV", "Pool & Ping-Pong", "Arcade & Snacks" },
		38000,
		105,
		{ "hq_cafeteria" },
		Vector3.new(66, 0, HQ_FRONT_BUTTON_Z),
		"campus"
	),
	piece(
		"hq_owner",
		"Owner's Suite",
		{ "Walls & Doors", "Owner's Desk", "Trophy Wall", "Lounge & Balcony" },
		42000,
		110,
		{ "hq_atrium" },
		Vector3.new(-220, UPPER_Y, HQ_FRONT_BUTTON_Z),
		"campus"
	),

	-- The lower bowl + locker rooms (under the stands) --------------------------------------------------
	piece(
		"lower_home",
		"Lower Bowl: Home Side",
		{ "Raker Beams & Rows", "Seats", "Aisles & Railings", "Field Wall & Signs", "Players' Tunnel" },
		45000,
		120,
		{ "goalposts" },
		Vector3.new(46, 0, SIDELINE_Z)
	),
	piece(
		"home_lockerroom",
		"Home Locker Room",
		{ "Tunnel & Walls", "Lockers", "Coach's Office & Showers", "Logo & Hype Screens" },
		50000,
		125,
		{ "lower_home" },
		Vector3.new(72, 0, BACK_LINE_Z)
	),
	piece(
		"hq_interview",
		"Interview Room",
		{ "Walls & Backdrop", "Podium & Mics", "Press Seats & Cameras" },
		55000,
		130,
		{ "hq_meeting" },
		Vector3.new(-33, 0, HQ_FRONT_BUTTON_Z),
		"campus"
	),
	piece(
		"lower_visitor",
		"Lower Bowl: Visitor Side",
		{ "Raker Beams & Rows", "Seats", "Aisles & Railings", "Field Wall & Players' Tunnel" },
		62000,
		140,
		{ "lower_home" },
		Vector3.new(-59, 0, SIDELINE_Z)
	),
	piece(
		"visitor_lockerroom",
		"Visitor Locker Room",
		{ "Tunnel & Walls", "Lockers", "Bench & Signs" },
		68000,
		145,
		-- (also waits for the escalators: its tunnel walls close the visitor players' tunnel, which
		-- is the only way from the event level onto the field once the lower bowl is closed and
		-- the home locker room closes the home tunnel - until the escalators reach the concourse)
		{ "lower_visitor", "escalators" },
		Vector3.new(-72, 0, SIDELINE_Z)
	),
	piece(
		"hq_media",
		"Media Studio",
		{ "Studio Walls", "Podcast Desk", "TV Set & Cameras" },
		72000,
		150,
		{ "hq_interview", "hq_atrium" },
		Vector3.new(-25, UPPER_Y, HQ_FRONT_BUTTON_Z),
		"campus"
	),
	piece(
		"parking",
		"Parking Lot",
		{ "Asphalt", "Parking Lines", "Lamp Posts", "Cars" },
		85000,
		165,
		{ "concessions" },
		Vector3.new(-84, 0, -165),
		"plaza"
	),
	piece(
		"lower_ends",
		"Lower Bowl: End Zones",
		{ "West End Rows", "East End Rows", "Seats", "Aisles & Railings" },
		95000,
		175,
		{ "lower_visitor" },
		Vector3.new(59, 0, SIDELINE_Z)
	),
	piece(
		"hq_kitchen",
		"Nutrition Kitchen",
		{ "Walls & Floor", "Chef's Kitchen", "Juice & Smoothie Lab", "Dining Tables" },
		100000,
		180,
		{ "hq_cafeteria", "hq_atrium" },
		Vector3.new(-190, UPPER_Y, HQ_BACK_BUTTON_Z),
		"campus"
	),
	piece(
		"lower_corners",
		"Lower Bowl: Corners",
		{ "Corner Rows", "Seats", "Aisles & Railings" },
		120000,
		200,
		{ "lower_ends" },
		Vector3.new(-85, 0, SIDELINE_Z)
	),

	-- The main concourse ------------------------------------------------------------------------------
	piece(
		"main_concourse",
		"Main Concourse",
		{ "Concourse Floor & Columns", "Walls & Ceiling", "Section Portals", "Lights & TV Screens" },
		130000,
		210,
		{ "lower_corners" },
		Vector3.new(72, 0, SIDELINE_Z)
	),
	piece(
		"gates",
		"Stadium Gates",
		{ "Gate A (Main Gate)", "Gate B (West)", "Gate C (East)", "Gate D (Players' Gate)" },
		140000,
		220,
		{ "main_concourse" },
		Vector3.new(85, 0, SIDELINE_Z)
	),
	piece(
		"concourse_food",
		"Concourse Food Court",
		{ "Hot Dog Stands", "Pizza & Nachos", "Drink Bars", "Grill & BBQ", "Desserts & Snacks" },
		150000,
		230,
		{ "main_concourse" },
		Vector3.new(-98, 0, SIDELINE_Z)
	),
	piece(
		"teamstore",
		"Team Store",
		{ "Building", "Glass Front & Doors", "Merch & Sign" },
		160000,
		240,
		{ "parking" },
		Vector3.new(40, 0, -150),
		"plaza"
	),
	piece(
		"fan_zone",
		"Tailgate & Fan Zone",
		{ "Tailgate Lot", "Food Trucks", "Tents & Grills", "Football Toss Game", "Mascot Statue", "Stage & Speakers" },
		175000,
		250,
		{ "teamstore" },
		Vector3.new(206, 0, -150),
		"fanzone"
	),
	piece(
		"hq_scouting",
		"Scouting War Room",
		{ "Walls & Door", "Big Board", "Scout Desks", "Film Wall" },
		185000,
		260,
		{ "hq_owner" },
		Vector3.new(25, UPPER_Y, HQ_FRONT_BUTTON_Z),
		"campus"
	),
	piece(
		"concourse_restrooms",
		"Concourse Restrooms",
		{ "Restrooms", "Family Restrooms", "Water Fountains & Signs" },
		190000,
		265,
		{ "concourse_food" },
		Vector3.new(98, 0, SIDELINE_Z)
	),
	piece(
		"escalators",
		"Escalators & Ramps",
		{ "Main Escalators", "Corner Ramps", "Elevators", "Wayfinding Signs" },
		200000,
		270,
		{ "gates" },
		Vector3.new(-111, 0, SIDELINE_Z)
	),
	piece(
		"scoreboard",
		"End Zone Video Board",
		{ "Support Legs", "Board Frame", "Screens" },
		210000,
		275,
		{ "main_concourse" },
		Vector3.new(111, 0, SIDELINE_Z)
	),
	piece(
		"lights",
		"Stadium Lights",
		{ "Tower 1", "Tower 2", "Tower 3", "Tower 4" },
		230000,
		290,
		{ "scoreboard" },
		Vector3.new(-124, 0, SIDELINE_Z)
	),
	piece(
		"hq_barber",
		"Barbershop",
		{ "Shop Walls", "Barber Chairs", "Mirrors & Neon" },
		240000,
		300,
		{ "hq_kitchen" },
		Vector3.new(-125, UPPER_Y, HQ_BACK_BUTTON_Z),
		"campus"
	),

	-- Club level ------------------------------------------------------------------------------------------
	piece(
		"club_seats",
		"Club Level Seats",
		{ "Club Rows", "Padded Seats", "Aisles & Glass Rails", "Club Signs" },
		260000,
		310,
		{ "escalators" },
		Vector3.new(124, 0, SIDELINE_Z)
	),
	piece(
		"club_lounge",
		"Club Lounge",
		{ "Lounge Floor & Bars", "Buffet", "Lounge Seating", "Club Screens" },
		300000,
		330,
		{ "club_seats" },
		Vector3.new(-72, 0, BACK_LINE_Z)
	),
	piece(
		"concourse_merch",
		"Pro Shop & Merch",
		{ "Pro Shop", "Jersey Kiosks", "Foam Finger Carts" },
		320000,
		340,
		{ "concourse_restrooms" },
		Vector3.new(-85, 0, BACK_LINE_Z)
	),
	piece(
		"indoor_dome",
		"Indoor Practice Dome",
		{ "Frame", "Turf & Lines", "Roof Panels", "Doors & Lights" },
		340000,
		350,
		{ "club_seats", "practice_gear" },
		Vector3.new(150, 0, 400),
		"campus"
	),
	piece(
		"hq_analytics",
		"Analytics Lab",
		{ "Walls & Glass", "Computer Desks", "Data Screens" },
		360000,
		360,
		{ "hq_scouting" },
		Vector3.new(74, UPPER_Y, HQ_FRONT_BUTTON_Z),
		"campus"
	),
	piece(
		"suites",
		"Luxury Suites",
		{ "Suite Corridor", "Glass Fronts", "Suite Interiors & Signs" },
		400000,
		380,
		{ "club_lounge" },
		Vector3.new(85, 0, BACK_LINE_Z)
	),

	-- Upper deck ------------------------------------------------------------------------------------------
	piece(
		"upper_home",
		"Upper Deck: Home Side",
		{ "Upper Rows", "Seats", "Aisles & Railings", "Facade" },
		450000,
		400,
		{ "suites" },
		Vector3.new(-98, 0, BACK_LINE_Z)
	),
	piece(
		"hall_of_fame",
		"Hall of Fame & Museum",
		{ "Building", "Trophy Cases", "Jersey Wall", "Player Statues", "Gold Entrance" },
		480000,
		420,
		{ "hq_interview", "upper_home" },
		Vector3.new(195, 0, 193),
		"campus"
	),
	piece(
		"pressbox",
		"Press Box",
		{ "Press Box Shell", "Press Row", "Coaches' Booths", "Roof & TV Cameras" },
		520000,
		440,
		{ "upper_home" },
		Vector3.new(98, 0, BACK_LINE_Z)
	),
	piece(
		"hq_spa",
		"Recovery Spa & Pool",
		{ "Walls & Tiles", "Recovery Pool", "Cold Plunge & Sauna", "Massage Room" },
		560000,
		450,
		{ "hq_barber" },
		Vector3.new(-50, UPPER_Y, HQ_BACK_BUTTON_Z),
		"campus"
	),
	piece(
		"upper_visitor",
		"Upper Deck: Visitor Side",
		{ "Upper Rows", "Seats", "Aisles & Railings", "Facade" },
		600000,
		470,
		{ "upper_home" },
		Vector3.new(-111, 0, BACK_LINE_Z)
	),
	piece(
		"upper_concourse",
		"Upper Concourse",
		{ "Concourse Floor", "Vomitories", "Food Stands", "Restrooms & Signs" },
		650000,
		490,
		{ "upper_visitor" },
		Vector3.new(111, 0, BACK_LINE_Z)
	),
	piece(
		"broadcast_booth",
		"TV Broadcast Booth",
		{ "Booth", "Glass & Cameras", "Satellite Dish" },
		700000,
		510,
		{ "pressbox", "upper_visitor" },
		Vector3.new(-124, 0, BACK_LINE_Z)
	),
	piece(
		"jumbotron",
		"West Video Board",
		{ "Support Tower", "Screen Frame", "Video Screen & Speakers" },
		760000,
		530,
		{ "lights" },
		Vector3.new(124, 0, BACK_LINE_Z)
	),
	piece(
		"upper_ends",
		"Upper Deck: Ends & Corners",
		{ "End Rows", "Corner Rows", "Seats", "Aisles & Railings" },
		850000,
		560,
		{ "upper_concourse" },
		Vector3.new(END_X, 0, -20)
	),
	piece(
		"hq_players",
		"Player Development Center",
		{ "Classroom", "Library & Study Pods", "Gaming Lounge" },
		900000,
		580,
		{ "hq_spa" },
		Vector3.new(49, UPPER_Y, HQ_BACK_BUTTON_Z),
		"campus"
	),
	piece(
		"campus_links",
		"Campus Walkways & Skybridges",
		{ "Covered Walkway", "Skybridge to the Hall of Fame", "Skybridge to the Dome & Garage", "Landscaping & Lights" },
		950000,
		600,
		{ "hall_of_fame", "indoor_dome" },
		Vector3.new(110, 0, 230),
		"campus"
	),
	piece(
		"facade",
		"Stadium Exterior",
		{ "Lower Facade", "Glass Curtain Walls", "Upper Facade & Fins", "Banners & Night Lights" },
		1100000,
		650,
		{ "upper_ends" },
		Vector3.new(-END_X, 0, -20)
	),
	piece(
		"canopy",
		"Stadium Roof",
		{ "Roof Supports", "Sideline Roofs", "End Roofs", "Roof Lights" },
		1400000,
		720,
		{ "facade", "broadcast_booth" },
		Vector3.new(0, 0, 10)
	),
	piece(
		"trophy",
		"Championship Trophy",
		{ "Plinth", "Trophy Base", "Golden Trophy", "Champions Plaque" },
		2000000,
		850,
		{ "canopy", "jumbotron", "campus_links", "hq_players" },
		Vector3.new(118, 0, -140),
		"plaza"
	),
}

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
	local areaOffset = AREAS[p.Area]
	assert(areaOffset, ("Items: %s has an unknown Area %s"):format(p.Id, tostring(p.Area)))
	p.AreaOffset = areaOffset
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
			Button = p.Button + areaOffset, -- plot coordinates
			LocalButton = p.Button, -- in the piece's area
			Area = p.Area,
			AreaOffset = areaOffset,
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
