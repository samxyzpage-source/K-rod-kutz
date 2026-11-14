--[[
	LiveScreens
	Keeps every live screen / board up to date. Builders mark a TextLabel with a "Live"
	attribute (BuildUtil.LiveText); this module finds them when a step is built and refreshes
	them every second with the owner's team: name, score, record, season, titles, rating,
	starters, game-day countdown and the arcade / ping-pong records. See Interact.LiveKinds.
]]

local HttpService = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("TycoonShared")
local Config = require(Shared:WaitForChild("Config"))

local LiveScreens = {}

local plotManager = nil
local tycoonsFolder = nil
local labelsByPlot = {} -- [plot] = { TextLabel, ... } in the built steps
local baseLabels = {} -- [plot] = { TextLabel, ... } in the always-present plot base (HQ shell signs)

local function clock(seconds)
	seconds = math.max(0, math.floor(seconds))
	return ("%d:%02d"):format(math.floor(seconds / 60), seconds % 60)
end

local function shortName(fullName)
	-- "Marcus Brooks" -> "M. BROOKS"
	local first, last = fullName:match("^(%S+)%s+(.+)$")
	if first then
		return (first:sub(1, 1) .. ". " .. last):upper()
	end
	return fullName:upper()
end

local function decode(json)
	if type(json) ~= "string" or json == "" then
		return {}
	end
	local ok, result = pcall(function()
		return HttpService:JSONDecode(json)
	end)
	return ok and type(result) == "table" and result or {}
end

-- All the texts for one plot (computed once per refresh).
function LiveScreens.Texts(plot)
	local owner = plot.Owner
	local team = plot.TeamName ~= "" and plot.TeamName or "HOME"
	local get = function(name, default)
		local value = owner and owner:GetAttribute(name)
		if value == nil then
			return default
		end
		return value
	end
	local record = get("Record", "0-0")
	local season = get("Season", "")
	local titles = get("Titles", 0)
	local model = plot.Model
	local texts = {
		team = team,
		owner = "OWNER: " .. (owner and string.upper(owner.DisplayName) or "-"),
		score = ("%s %d - %d VISITORS"):format(team, plot.HomeScore, plot.AwayScore),
		record = "RECORD " .. record,
		season = season,
		titles = ("CHAMPIONSHIPS: %d"):format(titles),
		rating = ("TEAM RATING %d"):format(get("TeamRating", 0)),
	}
	texts.summary = ("%s\n%d - %d\nRECORD %s\n%s"):format(team, plot.HomeScore, plot.AwayScore, record, season)
	-- game day countdown
	local now = Workspace:GetServerTimeNow()
	if tycoonsFolder and tycoonsFolder:GetAttribute("GameDayActive") then
		texts.gameday = "GAME DAY!  " .. clock((tycoonsFolder:GetAttribute("GameDayEndsAt") or now) - now) .. " LEFT"
	elseif tycoonsFolder and tycoonsFolder:GetAttribute("NextGameDayAt") then
		texts.gameday = "NEXT GAME IN " .. clock(tycoonsFolder:GetAttribute("NextGameDayAt") - now)
	else
		texts.gameday = "GAME DAY SOON"
	end
	-- starters
	local lines = {}
	local byPos = {}
	for _, entry in ipairs(decode(get("Roster", ""))) do
		if type(entry) == "table" and type(entry.Pos) == "string" then
			byPos[entry.Pos] = entry
		end
	end
	for _, pos in ipairs(Config.Draft.Positions) do
		local entry = byPos[pos]
		if entry and type(entry.Name) == "string" and entry.Name ~= "" then
			table.insert(lines, ("%-3s %s  %d"):format(pos, shortName(entry.Name), tonumber(entry.Rating) or 0))
		else
			table.insert(lines, ("%-3s ---"):format(pos))
		end
	end
	texts.roster = table.concat(lines, "\n")
	-- records set in the lounge
	local high = model:GetAttribute("ArcadeHigh")
	texts.arcade = high and ("HIGH SCORE %d - %s"):format(high, string.upper(model:GetAttribute("ArcadeHighName") or "?"))
		or "HIGH SCORE ---"
	local rally = model:GetAttribute("RallyBest")
	texts.pingpong = rally and ("LONGEST RALLY %d - %s"):format(rally, string.upper(model:GetAttribute("RallyBestName") or "?"))
		or "LONGEST RALLY ---"
	return texts
end

local function refreshPlot(plot)
	local labels = labelsByPlot[plot] or {}
	local fixed = baseLabels[plot] or {}
	if not plot.Owner or plot.Building or (#labels == 0 and #fixed == 0) then
		return -- (a plot that is being rebuilt is refreshed once, when the build is done)
	end
	local texts = LiveScreens.Texts(plot)
	for _, label in ipairs(fixed) do
		local text = texts[label:GetAttribute("Live")]
		if text and label.Text ~= text then
			label.Text = text
		end
	end
	for index = #labels, 1, -1 do
		local label = labels[index]
		if label.Parent == nil or not label:IsDescendantOf(plot.Model) then
			table.remove(labels, index)
		else
			local text = texts[label:GetAttribute("Live")]
			if text and label.Text ~= text then
				label.Text = text
			end
		end
	end
end

-- Finds the live labels in a freshly built step. (While a whole plot is being rebuilt, the
-- labels are only collected: the plot is refreshed once at the end, see LiveScreens.Init.)
function LiveScreens.Track(plot, model)
	local labels = labelsByPlot[plot] or {}
	labelsByPlot[plot] = labels
	for _, descendant in ipairs(model:GetDescendants()) do
		if descendant:IsA("TextLabel") and descendant:GetAttribute("Live") ~= nil then
			table.insert(labels, descendant)
		end
	end
	refreshPlot(plot)
end

function LiveScreens.Refresh()
	for _, plot in ipairs(plotManager.GetPlots()) do
		refreshPlot(plot)
	end
end

-- Finds the live labels of the plot base (built once per plot, before anyone owns it).
function LiveScreens.TrackBase(plot)
	local list = {}
	for _, descendant in ipairs(plot.Model:GetDescendants()) do
		if descendant:IsA("TextLabel") and descendant:GetAttribute("Live") ~= nil then
			if descendant:GetAttribute("LiveDefault") == nil then
				descendant:SetAttribute("LiveDefault", descendant.Text)
			end
			table.insert(list, descendant)
		end
	end
	baseLabels[plot] = list
end

function LiveScreens.Init(manager, folder)
	plotManager = manager
	tycoonsFolder = folder
	for _, plot in ipairs(plotManager.GetPlots()) do
		LiveScreens.TrackBase(plot)
	end
	plotManager.OnAnyBuilt(function(plot, _item, model)
		LiveScreens.Track(plot, model)
	end)
	plotManager.OnRebuilt(refreshPlot)
	plotManager.OnPlotReleased(function(plot)
		labelsByPlot[plot] = nil
		for _, label in ipairs(baseLabels[plot] or {}) do
			label.Text = label:GetAttribute("LiveDefault") or ""
		end
		plot.Model:SetAttribute("ArcadeHigh", nil)
		plot.Model:SetAttribute("ArcadeHighName", nil)
		plot.Model:SetAttribute("RallyBest", nil)
		plot.Model:SetAttribute("RallyBestName", nil)
	end)
	task.spawn(function()
		while true do
			task.wait(1)
			local ok, err = pcall(LiveScreens.Refresh)
			if not ok then
				warn("[LiveScreens] " .. tostring(err))
			end
		end
	end)
end

return LiveScreens
