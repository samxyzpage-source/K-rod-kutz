--[[
	Format
	Number helpers shared by the server (signs, buttons) and the client (HUD).
]]

local Format = {}

-- 1234567 -> "1,234,567"
function Format.Commas(number)
	local whole = math.floor(math.abs(number) + 0.5)
	local text = tostring(whole)
	local formatted = text:reverse():gsub("(%d%d%d)", "%1,"):reverse()
	if formatted:sub(1, 1) == "," then
		formatted = formatted:sub(2)
	end
	if number < 0 then
		formatted = "-" .. formatted
	end
	return formatted
end

local SUFFIXES = {
	{ 1e12, "T" },
	{ 1e9, "B" },
	{ 1e6, "M" },
	{ 1e3, "K" },
}

-- 950 -> "950", 12500 -> "12.5K", 3400000 -> "3.4M"
function Format.Short(number)
	local absolute = math.abs(number)
	if absolute < 10000 then
		return Format.Commas(number)
	end
	for _, entry in ipairs(SUFFIXES) do
		local size, suffix = entry[1], entry[2]
		if absolute >= size then
			local value = math.floor(number / size * 10) / 10
			local text = string.format("%.1f", value):gsub("%.0$", "")
			return text .. suffix
		end
	end
	return Format.Commas(number)
end

-- Money with a dollar sign: "$12.5K"
function Format.Money(number)
	return "$" .. Format.Short(number)
end

-- Exact money with commas: "$12,500"
function Format.MoneyExact(number)
	return "$" .. Format.Commas(number)
end

return Format
