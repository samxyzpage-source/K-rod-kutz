--[[
	Items
	Every buildable piece of the stadium, in the order they unlock.

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
-- buttons for plaza buildings sit next to the building they create.
local SIDELINE_Z = -29

Items.List = {
	-- Groundbreaking ---------------------------------------------------------------------
	{ Id = "turf", Name = "Turf Field", Cost = 0, Income = 1, Requires = {}, Button = Vector3.new(0, 0, -178) },
	{ Id = "yardlines", Name = "Yard Lines", Cost = 25, Income = 2, Requires = { "turf" }, Button = Vector3.new(-20, 0, SIDELINE_Z) },
	{ Id = "benches", Name = "Team Benches", Cost = 60, Income = 2, Requires = { "turf" }, Button = Vector3.new(20, 0, SIDELINE_Z) },
	{ Id = "endzones", Name = "End Zones", Cost = 120, Income = 3, Requires = { "yardlines" }, Button = Vector3.new(-33, 0, SIDELINE_Z) },
	{ Id = "ticketbooth", Name = "Ticket Booth", Cost = 200, Income = 4, Requires = { "turf" }, Button = Vector3.new(-20, 0, -166) },
	{ Id = "goalposts", Name = "Goal Posts", Cost = 350, Income = 5, Requires = { "endzones" }, Button = Vector3.new(-46, 0, SIDELINE_Z) },
	{ Id = "midfield", Name = "Midfield Logo", Cost = 500, Income = 6, Requires = { "endzones" }, Button = Vector3.new(33, 0, SIDELINE_Z) },
	{
		Id = "concessions",
		Name = "Concession Stand",
		Cost = 800,
		Income = 8,
		Requires = { "ticketbooth" },
		Button = Vector3.new(-38, 0, -128),
	},

	-- Seating -----------------------------------------------------------------------------
	{
		Id = "bleachers_home",
		Name = "Home Stands",
		Cost = 1300,
		Income = 12,
		Requires = { "goalposts" },
		Button = Vector3.new(46, 0, SIDELINE_Z),
	},
	{
		Id = "bleachers_visitor",
		Name = "Visitor Stands",
		Cost = 2200,
		Income = 16,
		Requires = { "bleachers_home" },
		Button = Vector3.new(-59, 0, SIDELINE_Z),
	},
	{
		Id = "scoreboard",
		Name = "Scoreboard",
		Cost = 3500,
		Income = 20,
		Requires = { "bleachers_home" },
		Button = Vector3.new(59, 0, SIDELINE_Z),
	},
	{ Id = "parking", Name = "Parking Lot", Cost = 5000, Income = 25, Requires = { "concessions" }, Button = Vector3.new(-84, 0, -165) },
	{
		Id = "endzone_stands_west",
		Name = "West End Zone Seats",
		Cost = 7500,
		Income = 32,
		Requires = { "bleachers_visitor" },
		Button = Vector3.new(-72, 0, SIDELINE_Z),
	},
	{
		Id = "endzone_stands_east",
		Name = "East End Zone Seats",
		Cost = 7500,
		Income = 32,
		Requires = { "bleachers_visitor" },
		Button = Vector3.new(72, 0, SIDELINE_Z),
	},
	{ Id = "teamstore", Name = "Team Store", Cost = 12000, Income = 45, Requires = { "parking" }, Button = Vector3.new(40, 0, -150) },

	-- Big league --------------------------------------------------------------------------
	{
		Id = "lights",
		Name = "Stadium Lights",
		Cost = 18000,
		Income = 60,
		Requires = { "scoreboard" },
		Button = Vector3.new(-85, 0, SIDELINE_Z),
	},
	{
		Id = "upper_home",
		Name = "Home Upper Deck",
		Cost = 28000,
		Income = 80,
		Requires = { "endzone_stands_west", "endzone_stands_east" },
		Button = Vector3.new(85, 0, SIDELINE_Z),
	},
	{
		Id = "upper_visitor",
		Name = "Visitor Upper Deck",
		Cost = 40000,
		Income = 100,
		Requires = { "upper_home" },
		Button = Vector3.new(-98, 0, SIDELINE_Z),
	},
	{ Id = "jumbotron", Name = "Jumbotron", Cost = 60000, Income = 130, Requires = { "lights" }, Button = Vector3.new(98, 0, SIDELINE_Z) },
	{
		Id = "pressbox",
		Name = "Press Box",
		Cost = 85000,
		Income = 170,
		Requires = { "upper_home" },
		Button = Vector3.new(-111, 0, SIDELINE_Z),
	},
	{
		Id = "suites",
		Name = "Luxury Suites",
		Cost = 120000,
		Income = 220,
		Requires = { "upper_visitor" },
		Button = Vector3.new(111, 0, SIDELINE_Z),
	},
	{
		Id = "canopy",
		Name = "Stadium Canopy",
		Cost = 180000,
		Income = 300,
		Requires = { "pressbox", "suites" },
		Button = Vector3.new(0, 0, 14),
	},
	{
		Id = "trophy",
		Name = "Championship Trophy",
		Cost = 300000,
		Income = 500,
		Requires = { "canopy", "jumbotron" },
		Button = Vector3.new(118, 0, -140),
	},
}

Items.ById = {}
for index, item in ipairs(Items.List) do
	item.Order = index
	Items.ById[item.Id] = item
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

return Items
