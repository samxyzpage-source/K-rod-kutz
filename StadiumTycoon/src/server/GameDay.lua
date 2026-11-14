--[[
	GameDay
	Every franchise plays its own game days, and the OWNER chooses when they start. A game is
	READY when the field is playable (the Goal Posts piece is finished), no game is on, the plot
	isn't being rebuilt and Config.GameDay.CooldownSeconds have passed since the last game ended
	(the first game is ready as soon as the field is). The HUD then shows a big START GAME button:
	it fires the StartGameDay remote and the server checks the request (the owner of a plot,
	standing on it, the game is ready, not too often). Two owners play whenever they like.

	A game day on one plot:
	  * fans walk in through the plot's gate and fill the stands its owner built. Crowds arrive and
	    leave Config.GameDay.FansPerFrame per server frame, one crowd after the other (two owners
	    may kick off together), so neither the server nor the clients make a whole crowd in a frame
	  * that plot's income is multiplied (Config.GameDay.IncomeMultiplier) while it lasts
	  * the team plays one game: the result is decided at kick-off (GameDay.SetMatchMaker, see
	    Franchise.DecideGame) and the score goes up play by play on the scoreboard, the jumbotron,
	    the live screens and the HUD; at the final whistle the result counts as a week of the
	    season (GameDay.OnEnded, see Franchise.FinishGame)
	It ends after DurationSeconds. Releasing the plot (the owner leaves) ends it at once, with no
	result.

	Attributes on each plot model (read by the HUD, the live screens and the TV camera seats):
	  GameDayStatus    "active", "ready", "cooldown", "nofield" (the goal posts aren't finished)
	                   or "building" (the plot is being rebuilt); nil while nobody owns the plot
	  GameDayActive    true while the plot's game day is on
	  GameDayEndsAt    server time (workspace:GetServerTimeNow()) when it ends
	  GameReady        true when the owner can start a game day right now
	  NextGameReadyAt  server time when the cooldown ends (nil = no cooldown)

	Remote (ReplicatedStorage.TycoonRemotes): StartGameDay, client -> server, no arguments.
]]

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("TycoonShared")
local Config = require(Shared:WaitForChild("Config"))
local Items = require(Shared:WaitForChild("Items"))

local BuildUtil = require(script.Parent.BuildUtil)
local Crowd = require(script.Parent.Crowd)

local GameDay = {}

local FAN_TAG = "TycoonFan" -- Effects.client.lua makes these cheer (a seated fan's jersey block)
local WALKER_TAG = "TycoonWalker" -- Effects.client.lua walks these in from the gate
local CROWD_FOLDER = "GameDayFans"
local REMOTE_NAME = "StartGameDay"
local FIELD_PIECE = "goalposts" -- the field is playable once this piece is finished
local WALK_SPEED = 12 -- studs per second
local PLAN_SECONDS_PER_FRAME = 0.004 -- planning a full bowl's seats takes a while: at most this much per frame
local STATUS_SECONDS = 0.5 -- how often every plot's status is checked again (a cooldown running out)
local REQUEST_SECONDS = 1 -- a player's start requests closer together than this are ignored
local PLOT_MARGIN = 60 -- the owner must be on their plot (or this close to its edge) to kick off

local settings = Config.GameDay
local plotManager = nil
local notifyRemote = nil
local matchMaker = nil -- fn(plot) -> { Home, Away, ... } decides a game at kick-off (Franchise.DecideGame)
local endedHooks = {} -- fn(plot, game) at every final whistle
local states = setmetatable({}, { __mode = "k" }) -- [plot] = see stateOf
local readyAtByUser = {} -- [UserId] = server time an owner's next game is ready (kept when they rejoin)
local lastRequest = {} -- [Player] = os.clock() of their last start request
local hookedManagers = setmetatable({}, { __mode = "k" }) -- plot managers whose hooks are registered
local crowdJobs = {} -- crowds arriving / leaving, run one after the other (see queueCrowd)
local crowdBusy = false
local loopStarted = false
local playersHooked = false
local rng = Random.new()

local function serverNow()
	return Workspace:GetServerTimeNow()
end

local function clock(seconds)
	seconds = math.max(0, math.ceil(seconds))
	return ("%d:%02d"):format(math.floor(seconds / 60), seconds % 60)
end

local function notify(player, message, kind)
	if notifyRemote and player and player.Parent then
		notifyRemote:FireClient(player, message, kind or "info")
	end
end

local function fansPerFrame()
	return math.max(1, math.floor(settings.FansPerFrame or 150))
end

--[[
	Per-plot state:
	  Active   a game day is on           Token     changes whenever a game starts or is cut short
	  EndsAt   server time it ends        ReadyAt   server time the next one is ready (nil = now)
	  Crowd    the crowd folder of the game that is on
	  Announce the message for the owner once a game is ready again (the goal posts were
	           finished, or the cooldown ran out)
]]
local function stateOf(plot)
	local state = states[plot]
	if not state then
		state = { Active = false, Token = 0, EndsAt = nil, ReadyAt = nil, Crowd = nil, Announce = nil }
		states[plot] = state
	end
	return state
end

local function fieldReady(plot)
	return Items.HasPiece(plot.Owned or {}, FIELD_PIECE)
end

local function coolingDown(state)
	return state.ReadyAt ~= nil and serverNow() < state.ReadyAt
end

-- "active" > "nofield" > "cooldown" > "building" > "ready" (nil: nobody owns the plot). A
-- rebuild only shows when it is the one thing left that stops a game.
local function statusOf(plot)
	if not plot.Owner or not settings.Enabled then
		return nil
	end
	local state = stateOf(plot)
	if state.Active then
		return "active"
	elseif not fieldReady(plot) then
		return "nofield"
	elseif coolingDown(state) then
		return "cooldown"
	elseif plot.Building then
		return "building"
	end
	return "ready"
end

local function publish(plot, status)
	local state = stateOf(plot)
	local model = plot.Model
	model:SetAttribute("GameDayStatus", status)
	model:SetAttribute("GameDayActive", state.Active)
	model:SetAttribute("GameDayEndsAt", state.Active and state.EndsAt or nil)
	model:SetAttribute("GameReady", status == "ready")
	model:SetAttribute("NextGameReadyAt", (status ~= nil and coolingDown(state)) and state.ReadyAt or nil)
end

-- Works out the plot's status and publishes it; tells the owner when a game is ready again (the
-- goal posts were finished, or the cooldown ran out - also if a rebuild was still going on then).
local function refresh(plot)
	local state = stateOf(plot)
	local status = statusOf(plot)
	publish(plot, status)
	if status == "nofield" then
		state.Announce = "Your field is ready for football! Press START GAME to play your first game day."
	elseif status == "cooldown" then
		state.Announce = "Your next game is ready - press START GAME!"
	elseif status == "ready" and state.Announce then
		notify(plot.Owner, state.Announce, "success")
		state.Announce = nil
	end
end

---------------------------------------------------------------------------------------------
-- Crowds
---------------------------------------------------------------------------------------------

-- Crowds arrive and leave one after the other (each over several frames, a chunk per frame), so
-- two stadiums never fill or empty in the same frame.
local function runCrowdJobs()
	while #crowdJobs > 0 do
		local job = table.remove(crowdJobs, 1)
		local ok, err = pcall(job)
		if not ok then
			warn("[GameDay] crowd: " .. tostring(err))
		end
		task.wait()
	end
	crowdBusy = false
end

local function queueCrowd(job)
	table.insert(crowdJobs, job)
	if not crowdBusy then
		crowdBusy = true
		task.spawn(runCrowdJobs)
	end
end

-- A fn() for Crowd.PlanSeats that waits for the next frame once PLAN_SECONDS_PER_FRAME of work
-- has been done since the last wait.
local function framePacer()
	local since = os.clock()
	return function()
		if os.clock() - since >= PLAN_SECONDS_PER_FRAME then
			task.wait()
			since = os.clock()
		end
	end
end

-- Removes a plot's game-day crowds at once (e.g. when the plot is released).
function GameDay.ClearCrowd(plot)
	for _, child in ipairs(plot.Model:GetChildren()) do
		if child.Name == CROWD_FOLDER then
			child:Destroy()
		end
	end
end

-- Walking fans are created here but MOVED by each client (Effects.client.lua lerps the root
-- from WalkFrom to WalkTo), so the parade is smooth and costs no network traffic.
local function spawnWalkers(plot, folder, ctx, stillOn)
	local L = Config.Layout
	for index = 1, settings.WalkingFans do
		task.delay((index - 1) * 0.9, function()
			if not stillOn() or folder.Parent == nil then
				return
			end
			local x = rng:NextNumber(-L.WalkwayHalfWidth + 2, L.WalkwayHalfWidth - 2)
			local facingStadium = CFrame.Angles(0, math.pi, 0) -- local +Z
			local start = CFrame.new(x, 0, L.GateZ + 3) * facingStadium
			local finish = CFrame.new(x * 0.6, 0, L.StadiumFrontZ - 2) * facingStadium -- Gate A
			local jersey = (rng:NextNumber() < 0.6) and plot.Palette.Primary or plot.Palette.Secondary
			local skin = Crowd.SkinTones[rng:NextInteger(1, #Crowd.SkinTones)]
			-- build into an unparented holder so the attributes arrive together with the parts
			local holder = Instance.new("Folder")
			local holderCtx = table.clone(ctx)
			holderCtx.parent = holder
			local model, root = Crowd.Walker(holderCtx, start, jersey, skin, index)
			local duration = (finish.Position - start.Position).Magnitude / WALK_SPEED
			root:SetAttribute("WalkFrom", plot.Origin * start * CFrame.new(0, 3, 0))
			root:SetAttribute("WalkTo", plot.Origin * finish * CFrame.new(0, 3, 0))
			root:SetAttribute("WalkStart", serverNow())
			root:SetAttribute("WalkDuration", duration)
			CollectionService:AddTag(model, WALKER_TAG)
			model.Parent = folder
			holder:Destroy()
			task.delay(duration + 0.5, function()
				model:Destroy()
			end)
		end)
	end
end

--[[
	Fills a plot's stands for the game day `token`. The seats are planned first (no instances, a
	few ms per frame), then the fans arrive fansPerFrame() per frame: each one is built in an
	unparented holder, tagged and only then moved into the crowd folder, so it replicates in one
	piece. YIELDS; stops early when that game day ends or is cut short (plot released) meanwhile.
	Returns how many seated fans arrived.
]]
local function spawnCrowd(plot, token)
	local state = stateOf(plot)
	local owner = plot.Owner
	local function stillOn()
		return state.Active and state.Token == token and plot.Owner == owner
	end
	if not stillOn() then
		return 0 -- that game day is already over (the crowd waited for another stadium's)
	end
	local perFrame = fansPerFrame()
	local folder = Instance.new("Folder")
	folder.Name = CROWD_FOLDER
	local ctx = BuildUtil.NewContext(plot.Origin, folder, plot.Palette, plot.TeamName, Config)
	local seats = Crowd.PlanSeats(ctx, plot.Owned, settings.SeatedFans, rng, framePacer())
	if not stillOn() then
		return 0 -- the game day ended (or the plot changed hands) while the seats were planned
	end
	GameDay.ClearCrowd(plot)
	folder.Parent = plot.Model
	state.Crowd = folder
	spawnWalkers(plot, folder, ctx, stillOn)
	local holder = Instance.new("Folder")
	local holderCtx = table.clone(ctx)
	holderCtx.parent = holder
	local arrived = 0
	for _, seat in ipairs(seats) do
		if arrived % perFrame == 0 then
			task.wait()
		end
		if not stillOn() or folder.Parent ~= plot.Model then
			break -- the game day ended (or the plot was released) while the fans were arriving
		end
		local fan = Crowd.SeatedFan(holderCtx, seat)
		CollectionService:AddTag(fan, FAN_TAG)
		fan.Parent = folder
		arrived += 1
	end
	holder:Destroy()
	return arrived
end

-- The fans leave the way they came: fansPerFrame() per frame (GameDay.ClearCrowd removes a crowd
-- at once, e.g. when its plot is released). Leaves the crowd of a game that is on alone.
local function dismissCrowd(plot)
	local state = stateOf(plot)
	local perFrame = fansPerFrame()
	for _, folder in ipairs(plot.Model:GetChildren()) do
		if folder.Name == CROWD_FOLDER and folder ~= state.Crowd then
			for index, child in ipairs(folder:GetChildren()) do
				if folder.Parent == nil then
					break -- cleared meanwhile
				end
				child:Destroy()
				if index % perFrame == 0 then
					task.wait()
				end
			end
			folder:Destroy()
		end
	end
end

---------------------------------------------------------------------------------------------
-- The game
---------------------------------------------------------------------------------------------

local function isScore(value)
	return type(value) == "number" and value == value and value >= 0 and value <= 200 and math.floor(value) == value
end

-- The result of the plot's game, decided at kick-off by the match maker (Franchise). Without team
-- data (e.g. a save that couldn't load) the team plays a friendly scrimmage with a made-up score.
local function decideGame(plot)
	if matchMaker then
		local ok, game = pcall(matchMaker, plot)
		if not ok then
			warn("[GameDay] match maker failed: " .. tostring(game))
		elseif type(game) == "table" and isScore(game.Home) and isScore(game.Away) then
			return game
		end
	end
	return { Home = 7 * rng:NextInteger(1, 4) + 3, Away = 7 * rng:NextInteger(0, 3) } -- (never a tie)
end

-- A team's points as scoring plays: touchdowns (7) and field goals (3); points that can't be made
-- of those (1, 2, 4, 5, 8, 11) are touchdowns and one last smaller play.
local function splitPoints(points)
	local plays = {}
	for touchdowns = math.floor(points / 7), 0, -1 do
		local rest = points - touchdowns * 7
		if rest % 3 == 0 then
			for _ = 1, touchdowns do
				table.insert(plays, 7)
			end
			for _ = 1, rest / 3 do
				table.insert(plays, 3)
			end
			return plays
		end
	end
	for _ = 1, math.floor(points / 7) do
		table.insert(plays, 7)
	end
	if points % 7 > 0 then
		table.insert(plays, points % 7)
	end
	return plays
end

-- The scoring plays that make up a final score, in a random order, at random times between 8%
-- and 90% of the game (so the score is complete before the final whistle). Each play is
-- { Home = scored by the home team, Points, At = seconds after kick-off }.
local function planPlays(home, away, duration)
	local plays = {}
	for _, points in ipairs(splitPoints(home)) do
		table.insert(plays, { Home = true, Points = points })
	end
	for _, points in ipairs(splitPoints(away)) do
		table.insert(plays, { Home = false, Points = points })
	end
	for index = #plays, 2, -1 do
		local other = rng:NextInteger(1, index)
		plays[index], plays[other] = plays[other], plays[index]
	end
	local times = {}
	for _ = 1, #plays do
		table.insert(times, (0.08 + rng:NextNumber() * 0.82) * duration)
	end
	table.sort(times)
	for index, play in ipairs(plays) do
		play.At = times[index]
	end
	return plays
end

GameDay._splitPoints = splitPoints -- (tests)
GameDay._planPlays = planPlays

local function endGameDay(plot, game)
	local state = stateOf(plot)
	local owner = plot.Owner
	local cooldown = math.max(0, settings.CooldownSeconds or 0)
	state.Active = false
	state.EndsAt = nil
	state.Crowd = nil -- (it leaves below)
	state.ReadyAt = serverNow() + cooldown
	if owner then
		readyAtByUser[owner.UserId] = state.ReadyAt
	end
	plotManager.SetScore(plot, game.Home, game.Away)
	for _, hook in ipairs(endedHooks) do
		local ok, err = pcall(hook, plot, game)
		if not ok then
			warn("[GameDay] end hook failed: " .. tostring(err))
		end
	end
	plotManager.SetGameDay(plot, false, 1)
	refresh(plot)
	if cooldown > 0 then
		notify(owner, ("Game over! Your next game is ready in %s."):format(clock(cooldown)), "info")
	else
		notify(owner, "Game over! Press START GAME to play again.", "info")
	end
	queueCrowd(function()
		dismissCrowd(plot)
	end)
end

-- The game itself: the scoring plays go up one by one, then the final whistle. Stops when the
-- game day is cut short meanwhile (the plot was released).
local function playGame(plot, token, game, duration)
	local state = stateOf(plot)
	local started = os.clock()
	local home, away = 0, 0
	for _, play in ipairs(planPlays(game.Home, game.Away, duration)) do
		local wait = play.At - (os.clock() - started)
		if wait > 0 then
			task.wait(wait)
		end
		if state.Token ~= token then
			return
		end
		if play.Home then
			home += play.Points
		else
			away += play.Points
		end
		local ok, err = pcall(plotManager.ScorePlay, plot, home, away, play.Home and play.Points or 0)
		if not ok then
			warn("[GameDay] score: " .. tostring(err))
		end
	end
	local left = duration - (os.clock() - started)
	if left > 0 then
		task.wait(left)
	end
	if state.Token ~= token then
		return
	end
	local ok, err = pcall(endGameDay, plot, game)
	if not ok then
		warn("[GameDay] Couldn't end the game day: " .. tostring(err))
	end
end

local function beginGameDay(plot)
	local state = stateOf(plot)
	local duration = math.max(settings.DurationSeconds, 0.1)
	state.Token += 1
	local token = state.Token
	state.Active = true
	state.EndsAt = serverNow() + duration
	state.ReadyAt = nil
	state.Crowd = nil
	local game = decideGame(plot)
	plotManager.SetScore(plot, 0, 0) -- kick-off
	plotManager.SetGameDay(plot, true, settings.IncomeMultiplier)
	refresh(plot)
	notify(plot.Owner, ("GAME DAY! Fans are pouring in - %dX CASH!"):format(settings.IncomeMultiplier), "success")
	queueCrowd(function()
		spawnCrowd(plot, token)
	end)
	task.spawn(playGame, plot, token, game, duration)
end

-- Where the plot's owner is: "here" (on their plot or close to its edge), "away", or nil (no
-- character: respawning).
local function ownerWhere(plot)
	local character = plot.Owner and plot.Owner.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if not root then
		return nil
	end
	local L = Config.Layout
	local position = plot.Origin:PointToObjectSpace(root.CFrame.Position)
	local onPlot = math.abs(position.X) <= L.PlotWidth / 2 + PLOT_MARGIN
		and position.Z >= L.PlotFrontZ - PLOT_MARGIN
		and position.Z <= L.PlotBackZ + PLOT_MARGIN
	return onPlot and "here" or "away"
end

---------------------------------------------------------------------------------------------
-- API
---------------------------------------------------------------------------------------------

-- Starts the player's game day if it's ready. Returns true, or false and a message saying why
-- not (for the player). The StartGameDay remote uses it; so could a "Start the game" prompt.
function GameDay.RequestStart(player)
	if not plotManager or not settings.Enabled then
		return false, "Game days are switched off right now."
	end
	local plot = plotManager.GetPlot(player)
	if not plot or plot.Owner ~= player then
		return false, "Claim a stadium first - walk through a glowing gold gate!"
	end
	local status = statusOf(plot)
	if status == "active" then
		return false, "Your game is already on - enjoy it!"
	elseif status == "nofield" then
		return false, "Build the goal posts first - then your team can play its first game!"
	elseif status == "cooldown" then
		local left = (stateOf(plot).ReadyAt or serverNow()) - serverNow()
		return false, ("Your team is resting. The next game is ready in %s."):format(clock(left))
	elseif status == "building" then
		return false, "Hold on - your stadium is still being built. Try again in a moment!"
	elseif status ~= "ready" then
		return false, nil
	end
	local where = ownerWhere(plot)
	if where == nil then
		return false, "Wait until you're back on your feet, then press START GAME again!"
	elseif where == "away" then
		return false, "Head back to your own stadium to start the game!"
	end
	local ok, err = pcall(beginGameDay, plot)
	if not ok then
		warn("[GameDay] Couldn't start the game day: " .. tostring(err))
		local state = stateOf(plot) -- undo a half-started game day (no thread would ever end it)
		state.Token += 1
		state.Active = false
		state.EndsAt = nil
		pcall(plotManager.SetGameDay, plot, false, 1)
		refresh(plot)
		return false, "The game couldn't start - try again in a moment."
	end
	return true
end

-- StartGameDay remote: rate limited; a refused request tells the player why.
local function onStartRequest(player)
	local now = os.clock()
	if lastRequest[player] and now - lastRequest[player] < REQUEST_SECONDS then
		return
	end
	lastRequest[player] = now
	local started, message = GameDay.RequestStart(player)
	if not started and message then
		notify(player, message, "error")
	end
end
GameDay._onStartRequest = onStartRequest -- (tests)

-- The plot's game-day status ("active", "ready", "cooldown", "nofield", "building" or nil).
function GameDay.GetStatus(plot)
	return statusOf(plot)
end

-- True while the plot's game day is on (no plot: while any is on).
function GameDay.IsActive(plot)
	if plot then
		local state = states[plot]
		return state ~= nil and state.Active
	end
	for _, state in pairs(states) do
		if state.Active then
			return true
		end
	end
	return false
end

-- Publishes the plot's status again now (it is also checked every STATUS_SECONDS).
function GameDay.Refresh(plot)
	refresh(plot)
end

-- A new owner: no game day yet; a returning owner's cooldown (same server) carries on.
-- Called by PlotManager.Claim before the plot is rebuilt.
function GameDay.OnPlotClaimed(plot)
	if not plotManager then
		return
	end
	local state = stateOf(plot)
	state.Token += 1
	state.Active = false
	state.EndsAt = nil
	state.Announce = nil -- (a returning owner whose game is ready isn't told again)
	state.Crowd = nil
	local readyAt = plot.Owner and readyAtByUser[plot.Owner.UserId]
	state.ReadyAt = (readyAt and readyAt > serverNow()) and readyAt or nil
	refresh(plot)
end

-- The plot was released (its owner left): a game day that is on stops at once, with no result,
-- and its crowd goes. Called by PlotManager.Release (which resets the income boost itself).
function GameDay.OnPlotReleased(plot)
	local state = stateOf(plot)
	state.Token += 1
	state.Active = false
	state.EndsAt = nil
	state.ReadyAt = nil
	state.Announce = nil
	state.Crowd = nil
	GameDay.ClearCrowd(plot)
	publish(plot, nil)
end

-- fn(plot) -> { Home, Away, ... } decides a plot's game at kick-off (the table is passed to the
-- OnEnded hooks at the final whistle).
function GameDay.SetMatchMaker(fn)
	matchMaker = fn
end

-- fn(plot, game) runs at the final whistle of a plot's game day (before its crowd leaves), e.g.
-- to record the result.
function GameDay.OnEnded(fn)
	table.insert(endedHooks, fn)
end

-- remoteFolder (ReplicatedStorage.TycoonRemotes) gets the StartGameDay remote; notify is the
-- Notify remote for messages.
function GameDay.Init(manager, remoteFolder, notify)
	plotManager = manager
	notifyRemote = notify
	if remoteFolder and not remoteFolder:FindFirstChild(REMOTE_NAME) then
		local remote = Instance.new("RemoteEvent")
		remote.Name = REMOTE_NAME
		remote.OnServerEvent:Connect(onStartRequest)
		remote.Parent = remoteFolder
	end
	if not hookedManagers[manager] then
		hookedManagers[manager] = true
		if manager.OnRebuilt then
			manager.OnRebuilt(refresh) -- a claimed plot or a new team is built: maybe ready now
		end
		if manager.OnPieceBuilt then
			manager.OnPieceBuilt(FIELD_PIECE, refresh) -- the goal posts make the field playable
		end
	end
	if not playersHooked then
		playersHooked = true
		Players.PlayerRemoving:Connect(function(player)
			lastRequest[player] = nil
		end)
	end
	for _, plot in ipairs(manager.GetPlots()) do
		refresh(plot)
	end
end

-- Checks every plot's status a couple of times a second (a cooldown running out).
function GameDay.Start()
	if loopStarted then
		return
	end
	loopStarted = true
	task.spawn(function()
		while true do
			task.wait(STATUS_SECONDS)
			for _, plot in ipairs(plotManager and plotManager.GetPlots() or {}) do
				local ok, err = pcall(refresh, plot)
				if not ok then
					warn("[GameDay] status: " .. tostring(err))
				end
			end
		end
	end)
end

return GameDay
