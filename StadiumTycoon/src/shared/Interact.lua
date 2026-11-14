--[[
	Interact
	The shared list of everything players can interact with. Builders add ProximityPrompts named
	"Interact" with BuildUtil.Look / Door / Seat / Elevator / Use; the server (Interactions.lua)
	and the client (Interact.client.lua) handle them by the prompt's "Kind" attribute:

	  look      "Press E to look": shows a card with a title + description (client only)
	  door      opens / closes a hinged or sliding door (server)
	  seat      sits you down; seats with a camera switch to a TV-style view (server + client)
	  elevator  rides an elevator (or stairs) to another level (server)
	  use       a "use" action from Interact.Uses: a mini-game on the client, or an item or outfit
	            from the server

	Any prompt may also carry Title / Info / LookKey attributes; the client then shows the
	description card as well (e.g. opening a locker shows whose locker it is).
]]

local Interact = {}

Interact.PromptName = "Interact"

Interact.Kinds = {
	look = true,
	door = true,
	seat = true,
	elevator = true,
	use = true,
}

--[[
	Use actions.
	  Game  = a mini-game on the client (Interact.client.lua); the result goes back to the server
	  Tool  = the server hands the player this item (Snacks.lua)
	  Gear  = the server hands the player this piece of coaching gear (Gear.lua: whistle, clipboard)
	  Outfit = the server dresses the player in this outfit (Gear.lua); ChangeBack = true puts the
	          player's own clothes back on
	  Action = default prompt text
]]
Interact.Uses = {
	lift = { Action = "Lift weights", Game = "lift", Title = "Weight Room" },
	arcade = { Action = "Play arcade", Game = "arcade", Title = "Pigskin Catch" },
	pingpong = { Action = "Play ping-pong", Game = "pingpong", Title = "Ping-Pong" },
	podium = { Action = "Take the podium", Game = "podium", Title = "Press Conference" },
	tray = { Action = "Grab a tray", Tool = "LunchTray" },
	smoothie = { Action = "Grab a smoothie", Tool = "Smoothie" },
	hotdog = { Action = "Get a hot dog", Tool = "HotDog" },
	popcorn = { Action = "Get popcorn", Tool = "Popcorn" },
	soda = { Action = "Get a soda", Tool = "Soda" },
	sportsdrink = { Action = "Grab a sports drink", Tool = "SportsDrink" },
	foamfinger = { Action = "Grab a foam finger", Tool = "FoamFinger" },
	-- the coaches' locker room
	whistle = { Action = "Grab a whistle", Gear = "Whistle", Title = "Whistle Rack" },
	clipboard = { Action = "Grab a clipboard", Gear = "Clipboard", Title = "Clipboards" },
	coachpolo = { Action = "Put it on", Outfit = "CoachPolo", Title = "Head Coach Polo" },
	hoodie = { Action = "Put it on", Outfit = "SidelineHoodie", Title = "Sideline Hoodie" },
	jersey = { Action = "Put it on", Outfit = "TeamJersey", Title = "Team Jersey" },
	changeback = { Action = "Change back", ChangeBack = true, Title = "Your Own Clothes" },
}

-- Mini-game score limits (the server ignores anything above these)
Interact.MaxScores = {
	lift = 40, -- reps
	arcade = 30, -- footballs caught (a perfect 20-second game is about 29)
	pingpong = 115, -- rally length (a perfect 90-second rally is about 112)
	podium = 3, -- answer number
}

--[[
	LookKeys: dynamic text the client adds to a description card, from the plot owner's data.
	  record, season, titles, rating, team, owner, draft, quests
	  roster:<POS>   the starter at that position (QB, RB, WR, OL, DEF, K)
	  locker:<n>     the n-th player on the roster (lockers 1, 2, 3...)
]]
Interact.LookKeys = {
	record = true,
	season = true,
	titles = true,
	rating = true,
	team = true,
	owner = true,
	draft = true,
	quests = true,
}

function Interact.IsLookKey(key)
	if type(key) ~= "string" then
		return false
	end
	if Interact.LookKeys[key] then
		return true
	end
	local pos = key:match("^roster:(%u+)$")
	if pos then
		return pos == "QB" or pos == "RB" or pos == "WR" or pos == "OL" or pos == "DEF" or pos == "K"
	end
	local n = key:match("^locker:(%d+)$")
	return n ~= nil and tonumber(n) >= 1 and tonumber(n) <= 99
end

--[[
	Live text kinds (BuildUtil.LiveText). LiveScreens.lua keeps these TextLabels up to date:
	  team      team name                         score     "STINGRAYS 21 - 14 VISITORS"
	  record    "RECORD 12-5"                     season    "SEASON 3 - WEEK 4/8 - 3-1"
	  titles    "CHAMPIONSHIPS: 2"                rating    "TEAM RATING 84"
	  summary   team / score / record / season on 4 lines
	  gameday   "GAME DAY! 0:42 LEFT" or "NEXT GAME IN 2:15"
	  roster    the starters, one per line ("QB  M. BROOKS  82")
	  arcade    "HIGH SCORE 37 - ALICE"           pingpong  "LONGEST RALLY 12 - ALICE"
	  owner     "OWNER: ALICE"
]]
Interact.LiveKinds = {
	team = true,
	score = true,
	record = true,
	season = true,
	titles = true,
	rating = true,
	summary = true,
	gameday = true,
	roster = true,
	arcade = true,
	pingpong = true,
	owner = true,
}

return Interact
