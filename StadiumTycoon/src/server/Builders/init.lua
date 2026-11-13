--[[
	Builders
	Maps every item Id (see ReplicatedStorage/TycoonShared/Items) to a function(ctx) that
	creates that piece of the stadium. ctx is described in BuildUtil.

	The functions are split across the child modules below so each file stays readable.
	"PlotBase" is special: it builds the always-present parts of a plot (base slab, gate,
	vault, collect pad) and returns references the PlotManager needs.
]]

local Builders = {}

local MODULES = {
	"PlotBase",
	-- stadium (V5)
	"Field",
	"Stands", -- lower bowl
	"UpperDeck", -- club seats + upper deck
	"Concourse", -- main + upper concourse
	"ConcourseShops", -- food, restrooms, merch on the main concourse
	"StadiumRooms", -- locker rooms under the stands
	"ClubLevel", -- club lounge, suites, press box, broadcast booth
	"Exterior", -- gates, escalators, facade
	"Features", -- video boards, lights, roof
	"Plaza",
	"FanZone",
	-- team HQ + campus
	"HQRoomsFront",
	"HQRoomsBack",
	"HQRoomsUpperFront",
	"HQRoomsUpperBack",
	"CampusFields",
	"HallOfFame",
	"Garage",
	"CampusLinks",
	"Staff",
}

for _, moduleName in ipairs(MODULES) do
	local moduleScript = script:FindFirstChild(moduleName)
	if moduleScript then
		local builderTable = require(moduleScript)
		for id, builder in pairs(builderTable) do
			if Builders[id] ~= nil then
				error(("Builder '%s' is defined twice (second time in %s)"):format(id, moduleName))
			end
			Builders[id] = builder
		end
	else
		warn(("Builders: module '%s' is missing"):format(moduleName))
	end
end

return Builders
