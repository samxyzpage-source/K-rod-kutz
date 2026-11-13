--[[
	Items
	Every buildable piece of the franchise, in the order they unlock: the Front Office and the
	practice facility come first, then the stadium.

	  Id        unique key (also the name of the builder function in Builders/)
	  Name      shown on the buy button
	  Cost      price in cash
	  Income    cash per second this piece adds to the vault once built
	  Requires  list of item Ids that must be owned before this button appears
	  Button    plot-local position of the buy button (y = 0 is the plot surface)

	To add a new piece: add an entry here, then add a builder function with the same Id
	in one of the modules inside ServerScriptService/TycoonServer/Builders.
]]

local Items = {}

-- Buttons for field + stadium pieces sit in a row on the front sideline (z = -29),
-- buttons for plaza buildings sit next to the building they create, and buttons for the
-- practice campus line the campus road (z = 190) behind the stadium. The two locker rooms sit
-- by the players' tunnels (front: visitors, back: home team).
local SIDELINE_Z = -29
local CAMPUS_Z = 190

local function item(id, name, cost, income, requires, button)
	return { Id = id, Name = name, Cost = cost, Income = income, Requires = requires, Button = button }
end

Items.List = {
	-- Front office + practice facility ----------------------------------------------------
	item("frontoffice", "Front Office", 0, 1, {}, Vector3.new(0, 0, -178)),
	item("practice_field", "Practice Field", 20, 2, { "frontoffice" }, Vector3.new(-10, 0, 200)),
	item("practice_lockerroom", "Practice Locker Room", 50, 2, { "practice_field" }, Vector3.new(-175, 0, CAMPUS_Z)),
	item("practice_gear", "Practice Gear", 90, 3, { "practice_field" }, Vector3.new(10, 0, 200)),
	item("weightroom", "Weight Room", 150, 4, { "practice_lockerroom" }, Vector3.new(-115, 0, CAMPUS_Z)),
	item("trainingroom", "Training Room", 240, 5, { "weightroom" }, Vector3.new(-55, 0, CAMPUS_Z)),
	item("filmroom", "Film Room", 360, 6, { "trainingroom" }, Vector3.new(55, 0, CAMPUS_Z)),

	-- Groundbreaking at the stadium -------------------------------------------------------
	item("turf", "Turf Field", 500, 6, { "filmroom", "practice_gear" }, Vector3.new(0, 0, 165)),
	item("yardlines", "Yard Lines", 650, 7, { "turf" }, Vector3.new(-20, 0, SIDELINE_Z)),
	item("benches", "Team Benches", 750, 7, { "turf" }, Vector3.new(20, 0, SIDELINE_Z)),
	item("endzones", "End Zones", 900, 8, { "yardlines" }, Vector3.new(-33, 0, SIDELINE_Z)),
	item("ticketbooth", "Ticket Booth", 1100, 9, { "turf" }, Vector3.new(-20, 0, -166)),
	item("goalposts", "Goal Posts", 1400, 10, { "endzones" }, Vector3.new(-46, 0, SIDELINE_Z)),
	item("midfield", "Midfield Logo", 1700, 10, { "endzones" }, Vector3.new(33, 0, SIDELINE_Z)),
	item("concessions", "Concession Stand", 2100, 12, { "ticketbooth" }, Vector3.new(-38, 0, -128)),

	-- The lower bowl + locker rooms --------------------------------------------------------
	item("bleachers_home", "Home Stands", 3000, 16, { "goalposts" }, Vector3.new(46, 0, SIDELINE_Z)),
	item("home_lockerroom", "Home Locker Room", 3800, 18, { "bleachers_home" }, Vector3.new(20, 0, 163)),
	item("bleachers_visitor", "Visitor Stands", 4500, 20, { "bleachers_home" }, Vector3.new(-59, 0, SIDELINE_Z)),
	item("visitor_lockerroom", "Visitor Locker Room", 5500, 22, { "bleachers_visitor" }, Vector3.new(-58, 0, -105)),
	item("scoreboard", "Scoreboard", 6500, 24, { "bleachers_home" }, Vector3.new(59, 0, SIDELINE_Z)),
	item("parking", "Parking Lot", 8500, 28, { "concessions" }, Vector3.new(-84, 0, -165)),
	item("endzone_stands_west", "West End Zone Seats", 11000, 34, { "bleachers_visitor" }, Vector3.new(-72, 0, SIDELINE_Z)),
	item("endzone_stands_east", "East End Zone Seats", 11000, 34, { "bleachers_visitor" }, Vector3.new(72, 0, SIDELINE_Z)),
	item(
		"corner_seats",
		"Corner Seats (Full Bowl)",
		14000,
		40,
		{ "endzone_stands_west", "endzone_stands_east" },
		Vector3.new(-124, 0, SIDELINE_Z)
	),
	item("teamstore", "Team Store", 16000, 45, { "parking" }, Vector3.new(40, 0, -150)),

	-- Big league --------------------------------------------------------------------------
	item("lights", "Stadium Lights", 30000, 60, { "scoreboard" }, Vector3.new(-85, 0, SIDELINE_Z)),
	item("upper_home", "Home Upper Deck", 50000, 80, { "corner_seats" }, Vector3.new(85, 0, SIDELINE_Z)),
	item("indoor_dome", "Indoor Practice Dome", 65000, 90, { "upper_home", "filmroom" }, Vector3.new(0, 0, 235)),
	item("upper_visitor", "Visitor Upper Deck", 85000, 105, { "upper_home" }, Vector3.new(-98, 0, SIDELINE_Z)),
	item("jumbotron", "Jumbotron", 120000, 135, { "lights" }, Vector3.new(98, 0, SIDELINE_Z)),
	item("pressbox", "Press Box", 165000, 170, { "upper_home" }, Vector3.new(-111, 0, SIDELINE_Z)),
	item("upper_bowl_ends", "Upper Bowl Ends (Full Ring)", 200000, 190, { "upper_visitor" }, Vector3.new(124, 0, SIDELINE_Z)),
	item("suites", "Luxury Suites", 230000, 215, { "upper_visitor" }, Vector3.new(111, 0, SIDELINE_Z)),
	item("broadcast_booth", "TV Broadcast Booth", 260000, 230, { "suites", "pressbox" }, Vector3.new(16, 0, -100)),
	item("canopy", "Stadium Canopy", 360000, 300, { "upper_bowl_ends", "broadcast_booth" }, Vector3.new(0, 0, 10)),
	item("trophy", "Championship Trophy", 550000, 420, { "canopy", "jumbotron", "indoor_dome" }, Vector3.new(118, 0, -140)),
}

Items.ById = {}
for index, entry in ipairs(Items.List) do
	entry.Order = index
	Items.ById[entry.Id] = entry
end

-- Returns true when every requirement of `item` is in the `owned` set.
function Items.IsUnlocked(entry, owned)
	for _, requiredId in ipairs(entry.Requires) do
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
		local entry = Items.ById[id]
		if entry then
			total += entry.Income
		end
	end
	return total
end

return Items
