--[[
	Franchise
	Everything about running the team (on top of building it):
	  * Team identity: owners pick their colours + nickname (shown on every piece they build)
	  * Owner's Bonus: a free cash gift every few minutes
	  * Quests: goals with cash rewards (shown in the HUD)
	  * Draft + roster: draft players with ratings; the team rating decides game-day matchups
	  * Game-day results: every game day your team plays; wins pay out and count on the leaderboard
	  * Stats + leaderboard (leaderstats: Wins, Rating)

	All of it is saved in profile.Franchise (PlayerData saves that table as-is).

	Player attributes set here (read by Franchise.client.lua):
	  TeamChosen (bool), TeamNickname, BonusReadyAt (server time), Quests (JSON), QuestsDone,
	  Roster (JSON), TeamRating, Record ("W-L"), DraftCost, DraftUnlocked (bool)
]]

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("TycoonShared")
local Config = require(Shared:WaitForChild("Config"))
local Items = require(Shared:WaitForChild("Items"))
local Format = require(Shared:WaitForChild("Format"))

local PlayerData = require(script.Parent.PlayerData)

local Franchise = {}

-- Studio test mode: an always-ready bonus with lots of cash (never in a published game).
local function studioTestBonus()
	return Config.OwnerBonus.StudioTestMode == true and RunService:IsStudio()
end

local plotManager = nil
local remotes = nil
local notifyRemote = nil
local rng = Random.new()
local sanitized = setmetatable({}, { __mode = "k" }) -- [franchiseTable] = true
local cooldowns = {} -- [player] = { [key] = os.clock() }
local seasonHooks = {} -- fn(player, plot, titles) after each game-day result

local POSITIONS = Config.Draft.Positions
local FIRST_NAMES = {
	"Marcus",
	"Jaylen",
	"Tyler",
	"Devon",
	"Andre",
	"Caleb",
	"Malik",
	"Logan",
	"Isaiah",
	"Cooper",
	"Darius",
	"Mason",
	"Trey",
	"Elijah",
	"Brody",
	"Xavier",
	"Jace",
	"Owen",
	"Rashad",
	"Colton",
	"Dante",
	"Wyatt",
	"Kendall",
	"Reggie",
}
local LAST_NAMES = {
	"Brooks",
	"Carter",
	"Hayes",
	"Bishop",
	"Reed",
	"Holloway",
	"Vance",
	"Sutton",
	"Mercer",
	"Dawson",
	"Fletcher",
	"Langley",
	"Whitaker",
	"Pryor",
	"Gaines",
	"Ashford",
	"Kimbrough",
	"Lockhart",
	"Rowan",
	"Tillman",
	"Okafor",
	"Delgado",
	"Kowalski",
	"Nakamura",
}

-- Quest list: done in any order, the first few unfinished ones are shown in the HUD.
-- Stat keys: see Franchise.GetStat.
local QUESTS = {
	{ Id = "reception", Text = "Build the reception desk", Stat = "Built", Goal = 1, Reward = 100 },
	{ Id = "team", Text = "Pick your team colours and name", Stat = "TeamChosen", Goal = 1, Reward = 250 },
	{ Id = "bonus", Text = "Claim an Owner's Bonus", Stat = "Bonuses", Goal = 1, Reward = 300 },
	{ Id = "lobby", Text = "Finish the Lobby", Stat = "Piece:hq_lobby", Goal = 1, Reward = 600 },
	{ Id = "collect", Text = "Collect $2,000 from your safe", Stat = "Collected", Goal = 2000, Reward = 500 },
	{ Id = "rooms2", Text = "Finish 2 HQ rooms", Stat = "RoomsDone", Goal = 2, Reward = 2000 },
	{ Id = "field", Text = "Finish the Practice Field", Stat = "Piece:practice_field", Goal = 1, Reward = 5000 },
	{ Id = "cart", Text = "Drive a golf cart", Stat = "Drives", Goal = 1, Reward = 3000 },
	{ Id = "lift", Text = "Lift weights in the Weight Room", Stat = "Workouts", Goal = 1, Reward = 3500 },
	{ Id = "draft1", Text = "Draft your first player", Stat = "Drafted", Goal = 1, Reward = 4000 },
	{ Id = "train1", Text = "Train a player (ROSTER > TRAIN)", Stat = "Trainings", Goal = 1, Reward = 8000 },
	{ Id = "rooms6", Text = "Finish 6 HQ rooms", Stat = "RoomsDone", Goal = 6, Reward = 12000 },
	{ Id = "turf", Text = "Lay the stadium turf", Stat = "Piece:turf", Goal = 1, Reward = 15000 },
	{ Id = "roster", Text = "Fill every roster position", Stat = "PositionsFilled", Goal = #POSITIONS, Reward = 30000 },
	{ Id = "kick1", Text = "Kick a field goal", Stat = "FieldGoals", Goal = 1, Reward = 25000 },
	{ Id = "win1", Text = "Win a game day", Stat = "Wins", Goal = 1, Reward = 40000 },
	{ Id = "presser", Text = "Hold a press conference", Stat = "PressConferences", Goal = 1, Reward = 50000 },
	{ Id = "staff", Text = "Hire the whole coaching staff", Stat = "Piece:staff_coaches", Goal = 1, Reward = 60000 },
	{ Id = "lowerbowl", Text = "Close the lower bowl (Corner Seats)", Stat = "Piece:corner_seats", Goal = 1, Reward = 150000 },
	{ Id = "arcade20", Text = "Catch 20 footballs in the lounge arcade", Stat = "ArcadeBest", Goal = 20, Reward = 120000 },
	{ Id = "kick50", Text = "Kick a 55-yard field goal", Stat = "LongestFG", Goal = 55, Reward = 200000 },
	{ Id = "rooms12", Text = "Finish every HQ room", Stat = "RoomsDone", Goal = 11, Reward = 300000 },
	{ Id = "win5", Text = "Win 5 game days", Stat = "Wins", Goal = 5, Reward = 400000 },
	{ Id = "playoffs", Text = "Make the playoffs", Stat = "Playoffs", Goal = 1, Reward = 500000 },
	{ Id = "rating80", Text = "Reach a team rating of 80", Stat = "TeamRating", Goal = 80, Reward = 600000 },
	{ Id = "hall", Text = "Open the Hall of Fame", Stat = "Piece:hall_of_fame", Goal = 1, Reward = 900000 },
	{ Id = "upperring", Text = "Close the upper ring", Stat = "Piece:upper_bowl_ends", Goal = 1, Reward = 1500000 },
	{ Id = "win15", Text = "Win 15 game days", Stat = "Wins", Goal = 15, Reward = 2000000 },
	{ Id = "title", Text = "Win a championship", Stat = "Championships", Goal = 1, Reward = 3000000 },
	{ Id = "champion", Text = "Build the Championship Trophy", Stat = "Piece:trophy", Goal = 1, Reward = 5000000 },
}
local QUESTS_SHOWN = 3
local SEASON_STAGES = { regular = true, semifinal = true, final = true }
local TEAM_CHANGE_COOLDOWN = 30 -- seconds between team changes (each one repaints the whole plot)
local MAX_HYPE = 3 -- press conferences add hype: +1 team rating each for the next game day

---------------------------------------------------------------------------------------------
-- Data helpers
---------------------------------------------------------------------------------------------

local function isNumber(value)
	return type(value) == "number" and value == value and value ~= math.huge and value ~= -math.huge
end

local function cooldownReady(player, key, seconds)
	local now = os.clock()
	cooldowns[player] = cooldowns[player] or {}
	local last = cooldowns[player][key]
	if last and now - last < seconds then
		return false
	end
	cooldowns[player][key] = now
	return true
end

local function notify(player, message, kind)
	if notifyRemote and player.Parent then
		notifyRemote:FireClient(player, message, kind or "info")
	end
end

-- Makes sure a saved franchise table only contains sensible values (saves can be old or odd).
local function sanitize(f)
	if sanitized[f] then
		return f
	end
	if type(f.Stats) ~= "table" then
		f.Stats = {}
	end
	for key, value in pairs(f.Stats) do
		if type(key) ~= "string" or not isNumber(value) or value < 0 then
			f.Stats[key] = nil
		end
	end
	if type(f.Quests) ~= "table" then
		f.Quests = {}
	end
	if type(f.Roster) ~= "table" then
		f.Roster = {}
	end
	local roster = {}
	for _, p in ipairs(f.Roster) do
		if
			type(p) == "table"
			and type(p.Name) == "string"
			and #p.Name <= 40
			and table.find(POSITIONS, p.Pos)
			and isNumber(p.Rating)
			and p.Rating >= 1
			and p.Rating <= 99
		then
			table.insert(roster, { Name = p.Name, Pos = p.Pos, Rating = math.floor(p.Rating) })
		end
	end
	f.Roster = roster
	if type(f.Team) == "table" then
		local palette, nickname = f.Team.Palette, f.Team.Nickname
		if not (isNumber(palette) and Config.TeamColors[palette] and isNumber(nickname) and Config.TeamNicknames[nickname]) then
			f.Team = nil
		end
	else
		f.Team = nil
	end
	if not isNumber(f.NextBonus) then
		f.NextBonus = 0
	end
	if not isNumber(f.Hype) or f.Hype < 0 then
		f.Hype = 0
	end
	f.Hype = math.min(math.floor(f.Hype), MAX_HYPE)
	-- repair the season field by field (a bad or outdated value shouldn't wipe the whole season)
	local season = type(f.Season) == "table" and f.Season or {}
	local function count(value)
		return isNumber(value) and value >= 0 and math.floor(value) or 0
	end
	f.Season = {
		Number = (isNumber(season.Number) and season.Number >= 1) and math.floor(season.Number) or 1,
		Week = math.clamp(count(season.Week), 0, Config.Season.Weeks),
		Wins = count(season.Wins),
		Losses = count(season.Losses),
		Stage = SEASON_STAGES[season.Stage] and season.Stage or "regular",
	}
	sanitized[f] = true
	return f
end

local function franchiseOf(player)
	local profile = PlayerData.GetProfile(player)
	if not profile then
		return nil, nil
	end
	if type(profile.Franchise) ~= "table" then
		profile.Franchise = {}
	end
	return sanitize(profile.Franchise), profile
end

local function addStat(player, key, amount)
	local f = franchiseOf(player)
	if f then
		f.Stats[key] = (f.Stats[key] or 0) + amount
		PlayerData.MarkChanged(player)
	end
end

local function maxStat(player, key, value)
	local f = franchiseOf(player)
	if f and value > (f.Stats[key] or 0) then
		f.Stats[key] = value
		PlayerData.MarkChanged(player)
	end
end

---------------------------------------------------------------------------------------------
-- Roster
---------------------------------------------------------------------------------------------

-- Best player at every position.
local function starters(f)
	local best = {}
	for _, p in ipairs(f.Roster) do
		if not best[p.Pos] or p.Rating > best[p.Pos].Rating then
			best[p.Pos] = p
		end
	end
	return best
end

function Franchise.TeamRating(player)
	local f, profile = franchiseOf(player)
	if not f then
		return 0
	end
	local best = starters(f)
	local total = 0
	for _, pos in ipairs(POSITIONS) do
		total += best[pos] and best[pos].Rating or Config.Draft.EmptyPositionRating
	end
	local rating = total / #POSITIONS
	-- staff you hired boost the team
	rating += Items.StagesOwned(profile.Owned, "staff_coaches") * 3
	rating += Items.StagesOwned(profile.Owned, "staff_trainers") * 2
	return math.clamp(math.floor(rating + 0.5), 0, 99)
end

local function draftCost(player)
	local income = plotManager and plotManager.GetBaseIncome(player) or 0
	return math.max(Config.Draft.MinimumCost, math.floor(income * Config.Draft.CostIncomeSeconds))
end

local function trainCost(player)
	local income = plotManager and plotManager.GetBaseIncome(player) or 0
	return math.max(Config.Draft.MinimumTrainCost, math.floor(income * Config.Draft.TrainCostIncomeSeconds))
end

local function trainUnlocked(player)
	local profile = PlayerData.GetProfile(player)
	return profile ~= nil and Items.HasPiece(profile.Owned, "hq_weightroom")
end

local function draftUnlocked(player)
	local profile = PlayerData.GetProfile(player)
	return profile ~= nil and profile.Owned["hq_frontoffice:3"] == true -- the Draft Board
end

---------------------------------------------------------------------------------------------
-- Stats, quests and what the HUD shows
---------------------------------------------------------------------------------------------

function Franchise.GetStat(player, key)
	local f, profile = franchiseOf(player)
	if not f then
		return 0
	end
	if key == "Built" then
		local count = 0
		for _ in pairs(profile.Owned) do
			count += 1
		end
		return count
	elseif key:sub(1, 6) == "Piece:" then
		return Items.HasPiece(profile.Owned, key:sub(7)) and 1 or 0
	elseif key == "RoomsDone" then
		local count = 0
		for _, p in ipairs(Items.Pieces) do
			if p.Id:sub(1, 3) == "hq_" and p.Id ~= "hq_lobby" and Items.HasPiece(profile.Owned, p.Id) then
				count += 1
			end
		end
		return count
	elseif key == "TeamChosen" then
		return f.Team and 1 or 0
	elseif key == "PositionsFilled" then
		local count = 0
		for _ in pairs(starters(f)) do
			count += 1
		end
		return count
	elseif key == "TeamRating" then
		return Franchise.TeamRating(player)
	end
	return f.Stats[key] or 0
end

local function seasonText(season)
	if season.Stage == "semifinal" then
		return ("SEASON %d  -  PLAYOFF SEMIFINAL NEXT"):format(season.Number)
	elseif season.Stage == "final" then
		return ("SEASON %d  -  CHAMPIONSHIP GAME NEXT"):format(season.Number)
	end
	return ("SEASON %d  -  WEEK %d/%d  -  %d-%d"):format(
		season.Number,
		math.min(season.Week + 1, Config.Season.Weeks),
		Config.Season.Weeks,
		season.Wins,
		season.Losses
	)
end

local function publish(player)
	local f = franchiseOf(player)
	if not f or player.Parent == nil then
		return
	end
	-- quests
	local shown = {}
	local done = 0
	for _, quest in ipairs(QUESTS) do
		if f.Quests[quest.Id] then
			done += 1
		elseif #shown < QUESTS_SHOWN then
			table.insert(shown, {
				Text = quest.Text,
				Progress = math.min(Franchise.GetStat(player, quest.Stat), quest.Goal),
				Goal = quest.Goal,
				Reward = quest.Reward,
			})
		end
	end
	player:SetAttribute("Quests", HttpService:JSONEncode(shown))
	player:SetAttribute("QuestsDone", done)
	player:SetAttribute("QuestsTotal", #QUESTS)
	-- roster
	local roster = {}
	local best = starters(f)
	for _, pos in ipairs(POSITIONS) do
		local starter = best[pos]
		table.insert(roster, {
			Pos = pos,
			Name = starter and starter.Name or "",
			Rating = starter and starter.Rating or 0,
		})
	end
	player:SetAttribute("Roster", HttpService:JSONEncode(roster))
	-- every player, for locker name plates: position order, best first
	local everyone = table.clone(f.Roster)
	table.sort(everyone, function(a, b)
		local pa, pb = table.find(POSITIONS, a.Pos) or 99, table.find(POSITIONS, b.Pos) or 99
		if pa ~= pb then
			return pa < pb
		end
		return a.Rating > b.Rating
	end)
	local lockers = {}
	for _, p in ipairs(everyone) do
		table.insert(lockers, { Name = p.Name, Pos = p.Pos, Rating = p.Rating })
	end
	player:SetAttribute("RosterAll", HttpService:JSONEncode(lockers))
	player:SetAttribute("Hype", f.Hype)
	player:SetAttribute("RosterSize", #f.Roster)
	local rating = Franchise.TeamRating(player)
	player:SetAttribute("TeamRating", rating)
	player:SetAttribute("Record", ("%d-%d"):format(f.Stats.Wins or 0, f.Stats.Losses or 0))
	player:SetAttribute("Season", seasonText(f.Season))
	player:SetAttribute("Titles", f.Stats.Championships or 0)
	player:SetAttribute("DraftCost", draftCost(player))
	player:SetAttribute("DraftUnlocked", draftUnlocked(player))
	player:SetAttribute("TrainCost", trainCost(player))
	player:SetAttribute("TrainUnlocked", trainUnlocked(player))
	player:SetAttribute("TeamChosen", f.Team ~= nil)
	player:SetAttribute("TeamNickname", f.Team and Config.TeamNicknames[f.Team.Nickname] or "")
	local bonusWait = studioTestBonus() and 0 or math.max(0, f.NextBonus - os.time())
	player:SetAttribute("BonusReadyAt", Workspace:GetServerTimeNow() + bonusWait)
	-- leaderboard
	local leaderstats = player:FindFirstChild("leaderstats")
	if leaderstats then
		leaderstats.Wins.Value = f.Stats.Wins or 0
		leaderstats.Rating.Value = rating
		leaderstats.Titles.Value = f.Stats.Championships or 0
	end
end

-- Pays out every quest that is complete. Call after anything that can move a stat.
function Franchise.CheckQuests(player)
	local f = franchiseOf(player)
	if not f then
		return
	end
	for _, quest in ipairs(QUESTS) do
		if not f.Quests[quest.Id] and Franchise.GetStat(player, quest.Stat) >= quest.Goal then
			f.Quests[quest.Id] = true
			PlayerData.AddCash(player, quest.Reward)
			PlayerData.MarkChanged(player)
			notify(player, ("QUEST COMPLETE: %s!  +%s"):format(quest.Text, Format.Money(quest.Reward)), "success")
		end
	end
	publish(player)
end

---------------------------------------------------------------------------------------------
-- Team identity
---------------------------------------------------------------------------------------------

local function teamFor(f)
	if not f.Team then
		return nil, nil
	end
	return Config.TeamColors[f.Team.Palette], string.upper(Config.TeamNicknames[f.Team.Nickname])
end

local function onChooseTeam(player, paletteIndex, nicknameIndex)
	if not (isNumber(paletteIndex) and Config.TeamColors[paletteIndex]) then
		return
	end
	if not (isNumber(nicknameIndex) and Config.TeamNicknames[nicknameIndex]) then
		return
	end
	local f = franchiseOf(player)
	if not f then
		return
	end
	if f.Team and f.Team.Palette == paletteIndex and f.Team.Nickname == nicknameIndex then
		notify(player, ("You're already the %s!"):format(Config.TeamNicknames[nicknameIndex]), "info")
		return
	end
	if not cooldownReady(player, "team", TEAM_CHANGE_COOLDOWN) then
		-- re-colouring rebuilds the whole plot, so not too often
		notify(player, "Your stadium is still being repainted - try again in a little while.", "info")
		return
	end
	f.Team = { Palette = paletteIndex, Nickname = nicknameIndex }
	PlayerData.MarkChanged(player)
	local palette, name = teamFor(f)
	plotManager.ApplyTeam(player, palette, name)
	notify(player, ("Welcome to the %s!"):format(Config.TeamNicknames[nicknameIndex]), "success")
	Franchise.CheckQuests(player)
end

---------------------------------------------------------------------------------------------
-- Owner's Bonus
---------------------------------------------------------------------------------------------

local function onClaimBonus(player)
	if not cooldownReady(player, "bonus", 1) or not plotManager.GetPlot(player) then
		return
	end
	local f = franchiseOf(player)
	if not f then
		return
	end
	local settings = Config.OwnerBonus
	if studioTestBonus() then
		PlayerData.AddCash(player, settings.StudioTestCash)
		f.Stats.Bonuses = (f.Stats.Bonuses or 0) + 1
		PlayerData.MarkChanged(player)
		notify(player, "STUDIO TEST BONUS!  +" .. Format.MoneyExact(settings.StudioTestCash), "cash")
		Franchise.CheckQuests(player)
		return
	end
	if os.time() < f.NextBonus then
		return
	end
	local amount = math.max(settings.MinimumCash, math.floor(plotManager.GetBaseIncome(player) * settings.IncomeSeconds))
	if PlayerData.AddCash(player, amount) then
		f.NextBonus = os.time() + settings.IntervalSeconds
		f.Stats.Bonuses = (f.Stats.Bonuses or 0) + 1
		PlayerData.MarkChanged(player)
		notify(player, "OWNER'S BONUS!  +" .. Format.MoneyExact(amount), "cash")
		Franchise.CheckQuests(player)
	end
end

---------------------------------------------------------------------------------------------
-- Draft
---------------------------------------------------------------------------------------------

local function scoutingBonus(player)
	local profile = PlayerData.GetProfile(player)
	local owned = profile and profile.Owned or {}
	local bonus = 0
	if Items.HasPiece(owned, "hq_filmroom") then
		bonus += 4
	end
	if Items.HasPiece(owned, "hq_coaches") then
		bonus += 4
	end
	if Items.HasPiece(owned, "hq_frontoffice") then
		bonus += 3
	end
	bonus += Items.StagesOwned(owned, "staff_coaches") * 2
	return bonus
end

-- Returns a result table for the client: { ok, message, player }
local function onDraft(player)
	if not cooldownReady(player, "draft", 0.75) then
		return { ok = false, message = "Slow down, coach!" }
	end
	local f = franchiseOf(player)
	if not f or not plotManager.GetPlot(player) then
		return { ok = false, message = "Claim a stadium first." }
	end
	if not draftUnlocked(player) then
		return { ok = false, message = "Build the Draft Board in your Front Office first!" }
	end
	local cost = draftCost(player)
	if not PlayerData.TrySpend(player, cost) then
		return { ok = false, message = ("A draft pick costs %s."):format(Format.MoneyExact(cost)) }
	end
	-- prefer positions you don't have yet
	local best = starters(f)
	local open = {}
	for _, pos in ipairs(POSITIONS) do
		if not best[pos] then
			table.insert(open, pos)
		end
	end
	local pos
	if #open > 0 and rng:NextNumber() < 0.7 then
		pos = open[rng:NextInteger(1, #open)]
	else
		pos = POSITIONS[rng:NextInteger(1, #POSITIONS)]
	end
	local rating = Config.Draft.BaseRating + rng:NextInteger(0, Config.Draft.RatingSpread) + scoutingBonus(player)
	rating = math.clamp(rating, 1, 99)
	local drafted = {
		Name = FIRST_NAMES[rng:NextInteger(1, #FIRST_NAMES)] .. " " .. LAST_NAMES[rng:NextInteger(1, #LAST_NAMES)],
		Pos = pos,
		Rating = rating,
	}
	table.insert(f.Roster, drafted)
	-- keep the starters plus the best BenchSize others
	local keep = starters(f)
	local bench = {}
	for _, p in ipairs(f.Roster) do
		if keep[p.Pos] ~= p then
			table.insert(bench, p)
		end
	end
	table.sort(bench, function(a, b)
		return a.Rating > b.Rating
	end)
	local roster = {}
	for _, p in pairs(keep) do
		table.insert(roster, p)
	end
	for index = 1, math.min(#bench, Config.Draft.BenchSize) do
		table.insert(roster, bench[index])
	end
	f.Roster = roster
	f.Stats.Drafted = (f.Stats.Drafted or 0) + 1
	PlayerData.MarkChanged(player)
	local starter = starters(f)[pos] == drafted
	notify(
		player,
		("You drafted %s %s (%d)%s"):format(pos, drafted.Name, rating, starter and " - new starter!" or " - added to the bench"),
		"success"
	)
	Franchise.CheckQuests(player)
	return { ok = true, message = "Drafted!", player = drafted }
end

---------------------------------------------------------------------------------------------
-- Training
---------------------------------------------------------------------------------------------

-- Works out your weakest starter and makes them better. Returns { ok, message, player }.
local function onTrain(player)
	local settings = Config.Draft
	local f, profile = franchiseOf(player)
	if not f or not plotManager.GetPlot(player) then
		return { ok = false, message = "Claim a stadium first." }
	end
	if not trainUnlocked(player) then
		return { ok = false, message = "Finish the Weight Room in your HQ to start training!" }
	end
	local weakest = nil
	for _, p in pairs(starters(f)) do
		if p.Rating < settings.MaxTrainedRating and (not weakest or p.Rating < weakest.Rating) then
			weakest = p
		end
	end
	if not weakest then
		return { ok = false, message = #f.Roster == 0 and "Draft some players to train first." or "Your starters are maxed out!" }
	end
	if not cooldownReady(player, "train", settings.TrainCooldownSeconds) then
		return { ok = false, message = "The players need a breather. Try again in a few seconds." }
	end
	local cost = trainCost(player)
	if not PlayerData.TrySpend(player, cost) then
		cooldowns[player].train = nil -- didn't train, so no cooldown
		return { ok = false, message = ("A training session costs %s."):format(Format.MoneyExact(cost)) }
	end
	local gain = rng:NextInteger(1, 3)
	if Items.HasPiece(profile.Owned, "hq_trainingroom") then
		gain += 1 -- the training room keeps them healthy
	end
	local before = weakest.Rating
	weakest.Rating = math.min(settings.MaxTrainedRating, weakest.Rating + gain)
	f.Stats.Trainings = (f.Stats.Trainings or 0) + 1
	PlayerData.MarkChanged(player)
	notify(player, ("%s %s trained: %d -> %d"):format(weakest.Pos, weakest.Name, before, weakest.Rating), "success")
	Franchise.CheckQuests(player)
	return { ok = true, message = "Trained!", player = weakest }
end

---------------------------------------------------------------------------------------------
-- Game-day results
---------------------------------------------------------------------------------------------

local function footballScore(minimum)
	-- a believable score: touchdowns (7) and field goals (3)
	local score = 0
	while score < minimum or rng:NextNumber() < 0.35 do
		score += (rng:NextNumber() < 0.7) and 7 or 3
		if score > 56 then
			break
		end
	end
	return score
end

local function newSeason(f)
	f.Season = { Number = f.Season.Number + 1, Week = 0, Wins = 0, Losses = 0, Stage = "regular" }
end

-- Moves the season on after a game. Returns a short note for the result message and any extra prize.
local function advanceSeason(player, f, won)
	local season = f.Season
	local settings = Config.Season
	if season.Stage == "regular" then
		season.Week += 1
		if won then
			season.Wins += 1
		else
			season.Losses += 1
		end
		if season.Week < settings.Weeks then
			return ("Week %d/%d (%d-%d)"):format(season.Week, settings.Weeks, season.Wins, season.Losses), 0
		end
		if season.Wins >= settings.PlayoffWins then
			season.Stage = "semifinal"
			f.Stats.Playoffs = (f.Stats.Playoffs or 0) + 1
			return ("PLAYOFFS! %d-%d season - the next game day is the semifinal"):format(season.Wins, season.Losses), 0
		end
		local note = ("Season over at %d-%d (%d wins make the playoffs). New season!"):format(
			season.Wins,
			season.Losses,
			settings.PlayoffWins
		)
		newSeason(f)
		return note, 0
	elseif season.Stage == "semifinal" then
		if won then
			season.Stage = "final"
			return "Semifinal won - the CHAMPIONSHIP GAME is next!", 0
		end
		newSeason(f)
		return "Knocked out in the semifinal. New season!", 0
	end
	-- the championship game
	newSeason(f)
	if won then
		f.Stats.Championships = (f.Stats.Championships or 0) + 1
		local prize =
			math.max(settings.MinimumChampionshipPrize, math.floor(plotManager.GetBaseIncome(player) * settings.ChampionshipIncomeSeconds))
		return ("CHAMPIONS!!! Title #%d"):format(f.Stats.Championships), prize
	end
	return "Lost the championship game. So close! New season!", 0
end

function Franchise.PlayGameDay()
	for _, plot in ipairs(plotManager.GetPlots()) do
		local player = plot.Owner
		local f = player and franchiseOf(player)
		if f then
			local built = 0
			for _ in pairs(plot.Owned) do
				built += 1
			end
			local progress = built / #Items.List
			local rating = Franchise.TeamRating(player) + f.Hype -- press conferences fire the team up
			f.Hype = 0
			local playoff = f.Season.Stage ~= "regular"
			local opponent = 46 + progress * 40 + rng:NextInteger(-6, 6) + (playoff and Config.Season.PlayoffBoost or 0)
			local winChance = 1 / (1 + math.exp(-(rating - opponent) / 6))
			local won = rng:NextNumber() < winChance
			local winnerScore = footballScore(14)
			local loserScore = math.min(footballScore(0), winnerScore - 1)
			local home, away = won and winnerScore or loserScore, won and loserScore or winnerScore
			plotManager.SetScore(plot, home, away)
			local income = plotManager.GetBaseIncome(player)
			local prize
			if won then
				f.Stats.Wins = (f.Stats.Wins or 0) + 1
				prize = math.max(1000, math.floor(income * 150))
			else
				f.Stats.Losses = (f.Stats.Losses or 0) + 1
				prize = math.max(200, math.floor(income * 30))
			end
			local seasonNote, titlePrize = advanceSeason(player, f, won)
			prize += titlePrize
			PlayerData.AddCash(player, prize)
			PlayerData.MarkChanged(player)
			notify(
				player,
				("FINAL: %s %d - %d VISITORS. %s  +%s"):format(
					plot.TeamName ~= "" and plot.TeamName or "HOME",
					home,
					away,
					won and "WIN!" or "Tough loss.",
					Format.Money(prize)
				),
				won and "success" or "info"
			)
			notify(player, seasonNote, titlePrize > 0 and "success" or "info")
			Franchise.CheckQuests(player)
			for _, hook in ipairs(seasonHooks) do
				task.spawn(hook, player, plot, f.Stats.Championships or 0)
			end
		end
	end
end

-- fn(player, plot, titles) after every game-day result (e.g. to hang championship banners).
function Franchise.OnResult(fn)
	table.insert(seasonHooks, fn)
end

-- How many championships a player has won.
function Franchise.GetTitles(player)
	local f = franchiseOf(player)
	return f and f.Stats.Championships or 0
end

---------------------------------------------------------------------------------------------
-- Hooks from other modules
---------------------------------------------------------------------------------------------

-- Field goal attempts (KickGame.lua)
function Franchise.RecordKick(player, yards, made)
	if made then
		addStat(player, "FieldGoals", 1)
		maxStat(player, "LongestFG", yards)
	end
	addStat(player, "Kicks", 1)
	Franchise.CheckQuests(player)
end

-- Things players do in their facility (Interactions.lua): "lift", "podium", "arcade", "pingpong".
-- Returns a short note for the notification (or nil).
function Franchise.RecordActivity(player, kind, score)
	local f = franchiseOf(player)
	if not f then
		return nil
	end
	local note = nil
	if kind == "lift" then
		addStat(player, "Workouts", 1)
	elseif kind == "podium" then
		addStat(player, "PressConferences", 1)
		if f.Hype < MAX_HYPE then
			f.Hype += 1
			note = ("Team hype %d/%d: +%d rating in the next game!"):format(f.Hype, MAX_HYPE, f.Hype)
		else
			note = "The team is already fired up for the next game!"
		end
	elseif kind == "arcade" then
		maxStat(player, "ArcadeBest", score)
	elseif kind == "pingpong" then
		maxStat(player, "RallyBest", score)
	end
	PlayerData.MarkChanged(player)
	Franchise.CheckQuests(player)
	return note
end

-- Golf cart rides (Vehicles.lua)
function Franchise.RecordDrive(player)
	if cooldownReady(player, "drive", 20) then
		addStat(player, "Drives", 1)
		Franchise.CheckQuests(player)
	end
end

-- Called once a player's data is loaded (Main.server.lua).
function Franchise.OnPlayerLoaded(player)
	if player.Parent == nil then
		return
	end
	if not player:FindFirstChild("leaderstats") then
		local leaderstats = Instance.new("Folder")
		leaderstats.Name = "leaderstats"
		local wins = Instance.new("IntValue")
		wins.Name = "Wins"
		wins.Parent = leaderstats
		local rating = Instance.new("IntValue")
		rating.Name = "Rating"
		rating.Parent = leaderstats
		local titles = Instance.new("IntValue")
		titles.Name = "Titles"
		titles.Parent = leaderstats
		leaderstats.Parent = player
	end
	Franchise.CheckQuests(player)
end

function Franchise.OnPlayerRemoving(player)
	cooldowns[player] = nil
end

function Franchise.GetQuests()
	return QUESTS
end

function Franchise.Init(manager, remoteFolder, notify)
	plotManager = manager
	remotes = remoteFolder
	notifyRemote = notify

	plotManager.SetTeamProvider(function(_player, profile)
		if type(profile.Franchise) ~= "table" then
			profile.Franchise = {}
		end
		return teamFor(sanitize(profile.Franchise))
	end)
	plotManager.OnPurchase(function(player)
		Franchise.CheckQuests(player)
	end)
	plotManager.OnCollect(function(player, amount)
		addStat(player, "Collected", amount)
		Franchise.CheckQuests(player)
	end)

	local chooseTeam = Instance.new("RemoteEvent")
	chooseTeam.Name = "ChooseTeam"
	chooseTeam.OnServerEvent:Connect(onChooseTeam)
	chooseTeam.Parent = remotes

	local claimBonus = Instance.new("RemoteEvent")
	claimBonus.Name = "ClaimBonus"
	claimBonus.OnServerEvent:Connect(onClaimBonus)
	claimBonus.Parent = remotes

	local draft = Instance.new("RemoteFunction")
	draft.Name = "Draft"
	draft.OnServerInvoke = onDraft
	draft.Parent = remotes

	local train = Instance.new("RemoteFunction")
	train.Name = "Train"
	train.OnServerInvoke = onTrain
	train.Parent = remotes

	-- keep costs/attributes fresh as income grows
	task.spawn(function()
		while true do
			task.wait(5)
			for _, player in ipairs(Players:GetPlayers()) do
				if PlayerData.GetProfile(player) then
					publish(player)
				end
			end
		end
	end)
end

-- exposed for tests
Franchise._onChooseTeam = onChooseTeam
Franchise._onClaimBonus = onClaimBonus
Franchise._onDraft = onDraft
Franchise._onTrain = onTrain
Franchise._advanceSeason = advanceSeason
Franchise._resetCooldowns = function(player)
	cooldowns[player] = nil
end

return Franchise
