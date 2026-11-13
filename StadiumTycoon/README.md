# Gridiron Stadium Tycoon (Roblox)

A Roblox tycoon where every player builds a pro-football franchise from nothing. You start with
the **Front Office**, build a **practice facility** (practice field, locker room, weight room,
training room, film room, practice gear, and later an indoor practice dome), then build the
**stadium** piece by piece. It grows from turf and yard lines into a **full bowl**, with
seating all the way round on two decks, home and visitor locker rooms, a two-level press box,
a TV broadcast booth, luxury suites, a jumbotron and a ring canopy. The last piece is a
giant championship trophy.

Every few minutes a **game day** starts. Fans walk in through your gate, fill the stands you
built and cheer, and your income is doubled for a minute.

![Finished stadium](docs/preview-aerial.png)

## Versions

| Version | What's in it |
| --- | --- |
| 1 | Core stadium: 23 pieces, plots claimed at a gold gate, vault + collect pad, saving, day/night, HUD |
| 1.1 | Polish: pulsing buy buttons, a guide beam to your next button, sounds, "Unlocked: ..." messages, vault hints, full-server handling |
| 2 | Front Office + practice campus behind the stadium, Team Bus between the plaza and the campus, a second collect pad (Team Safe). The stadium becomes a full bowl (corner seats, upper bowl ends) with a home tunnel, home + visitor locker rooms, a bigger press box and a TV broadcast booth |
| 3 | Game days with NPC fans, double income, a countdown in the HUD, and an excited jumbotron and scoreboard |

## Play it in Roblox Studio

1. Download [`build/StadiumTycoon.rbxlx`](build/StadiumTycoon.rbxlx).
2. Double-click it (or in Studio: **File > Open from File...**).
3. Press **Play** (F5).
4. Walk through a glowing **gold gate** to claim a stadium.
5. Step on the glowing **buttons** to build. Green = you can afford it, red = not yet.
   A golden **guide beam** points from you to your next button.
6. Your franchise earns money every second. It piles up in the **vault** next to the gate.
   Step on the **green pad** beside the vault to collect it (standing on it keeps collecting).
   The **Team Safe** pad at the practice campus collects from the same vault.
7. The practice campus is behind the stadium. Ride the **Team Bus** (the blue pad in the plaza)
   to get there, or walk through the stadium: in the front tunnel, across the field and out the
   home tunnel behind the home bench.

The plots, buttons and buildings are built by the scripts when the game starts, so in edit mode
you only see the ground and the spawn point. That's expected: press Play.

**Multiplayer test:** in Studio open the **Test** tab, set *Clients and Servers* to 2 players
and press **Start**. Each player can claim a different stadium (6 plots per server).

**Build faster while testing:** open `ReplicatedStorage > TycoonShared > Config` and set
`Config.IncomeMultiplier = 50`. To see a game day sooner, set `Config.GameDay.IntervalSeconds = 30`.
Put both back before publishing.

### Before you publish: set the server size

Each server has 6 stadium plots (`Config.PlotCount`). In **Home > Game Settings > Places**, set
**Max Players** to **6** so every player gets a stadium. If a server is ever full, players without a
stadium are told that all stadiums are taken and get a message when one opens up.

### Turning on saving

Progress (cash + everything you built) saves with a DataStore. That only works when:

1. The place is published: **File > Publish to Roblox**.
2. In Studio: **Home > Game Settings > Security > Enable Studio Access to API Services** is ON.

Without that the game still works. The bottom-left of the screen shows
"Progress saving: OFF" and nothing is saved. Saving happens automatically every 90 seconds,
when a player leaves, and when the server shuts down.

How saving stays safe:
* A session lock stops two servers, or a quick leave-and-rejoin, from overwriting each other.
* Temporary Roblox outages are retried.
* If a save can't load, the player is told it is safe and nothing overwrites it.
* Pieces from a newer version of the game are kept, not deleted.

## How the game works

| Thing | What it does |
| --- | --- |
| Gold gate | Touch it to claim an empty stadium (one per player). The sign shows your name. |
| Buy buttons | Appear when a piece unlocks. They pulse and show the name, price and income it adds. |
| Guide beam | A golden beam from your character to the cheapest button you can see. |
| Vault / Team Safe | Collect your income every second. The number above them is how much is waiting. |
| Collect pads | Step on one (front plaza or campus) to move the vault money into your cash. |
| Team Bus | Blue pads in the plaza and at the campus teleport you between the two. |
| Game day | Every 4 minutes: fans walk in and fill your stands, and income is doubled for 60 seconds. |
| HUD | Cash, income per second, pieces built, game day countdown and whether saving is on. |
| Scoreboard / Jumbotron | Your team name, attendance and a pretend game that keeps scoring (faster on game days). |
| Day / night | A full day takes 10 minutes. Stadium lights switch on at night. |

Each plot gets its own team colours (navy & orange, crimson & gold, forest & silver, purple & black,
teal & black, royal & white). Team names come from the owner's display name, so no real NFL teams,
logos or trademarks are used.

### The build order (36 pieces, about 40-45 minutes to finish)

**Franchise:** Front Office (free) -> Practice Field -> Practice Locker Room + Practice Gear ->
Weight Room -> Training Room -> Film Room

**Stadium:** Turf Field -> Yard Lines -> Team Benches -> End Zones -> Ticket Booth -> Goal Posts ->
Midfield Logo -> Concession Stand -> Home Stands -> Home Locker Room -> Visitor Stands ->
Visitor Locker Room -> Scoreboard -> Parking Lot -> West + East End Zone Seats ->
Corner Seats (the lower bowl closes) -> Team Store -> Stadium Lights -> Home Upper Deck ->
Indoor Practice Dome -> Visitor Upper Deck -> Jumbotron -> Press Box ->
Upper Bowl Ends (the upper ring closes) -> Luxury Suites -> TV Broadcast Booth -> Stadium Canopy ->
Championship Trophy

Prices and income are in `src/shared/Items.lua`.

## Project layout

```
StadiumTycoon/
  build/StadiumTycoon.rbxlx      the place file to open in Studio (built from src/)
  default.project.json           Rojo project: maps src/ into the place
  src/shared/   -> ReplicatedStorage.TycoonShared
    Config.lua                   all tunable numbers, team colours, game days and the plot layout
    Items.lua                    every buildable piece: price, income, unlock order, button spot
    Format.lua                   money formatting ($12.5K)
  src/server/   -> ServerScriptService.TycoonServer
    Main.server.lua              entry point: builds the world, wires players, saving, loops
    World.lua                    plot positions, street + spawn, day/night cycle
    PlotManager.lua              claiming, buttons, purchases, vault, bus, scoreboard, lights
    PlayerData.lua               DataStore loading/saving with session locking
    GameDay.lua                  game day schedule, income boost, crowds
    Crowd.lua                    NPC fan models (seated + walking)
    BuildUtil.lua                helpers for making parts, text and lights
    Builders/                    the geometry, one function per item id
      PlotBase.lua               slab, paths, gate, vault, collect pads, team bus stops
      CampusBuildings.lua        front office, practice locker room, weight room, training room, film room
      CampusFields.lua           practice field, practice gear, indoor practice dome
      StadiumRooms.lua           home + visitor locker rooms
      Field.lua                  turf, yard lines, end zones, goal posts, midfield, benches
      Stands.lua                 the full bowl: lower + upper sideline decks, end zones, corners
      Plaza.lua                  ticket booth, concessions, parking, team store, trophy
      Features.lua               scoreboard, lights, jumbotron, press box, suites, broadcast booth, canopy
  src/client/   -> StarterPlayer.StarterPlayerScripts.TycoonClient
    HUD.client.lua               cash / income / progress / game day / save status / pop-ups
    Effects.client.lua           pulsing buttons, guide beam, sounds, cheering fans
  tools/                         offline checks (see below)
  docs/                          preview pictures
```

### Adding a new piece

1. Add an entry to `Items.List` in `src/shared/Items.lua` (Id, Name, Cost, Income, Requires, Button position).
2. Add a builder function with the same Id to one of the `Builders/` modules. Use the
   `BuildUtil` helpers and plot-local coordinates (see the comment at the top of `Config.lua`).
3. Rebuild the place file (below) or paste the changed scripts into Studio.

## For developers

These tools are optional. You only need them to edit the code outside Studio.

* **Rojo** (`rojo build default.project.json -o build/StadiumTycoon.rbxlx`) rebuilds the place
  file. You can also use `rojo serve` to live-sync into Studio.
* **Lune** runs the game code outside Roblox:
  * `lune run tools/render_plot.luau tools/out all` builds a complete plot with the real builder
    code and checks it: plot bounds, blocked buttons, clear walkways and tunnel. Add `crowd` as a
    third argument to also seat a game-day crowd.
  * `node tools/preview/shoot.js tools/out/parts.json tools/out` renders it to PNG images
    (run `npm install` in `tools/preview` first; needs Playwright + Chromium).
  * `lune run tools/test_server.luau` runs 150+ checks of the server logic, HUD and client
    effects against a fake Roblox engine. It covers:
    * claiming, buying, the vault and auto-collect
    * saving and rejoining, session locks, temporary errors, bad or newer save data, and
      Studio without API access
    * game days and crowds
    * the HUD, the guide beam and the cheering fans
  * `lune run tools/inspect_place.luau build/StadiumTycoon.rbxlx` checks the built place file.
* **StyLua** (`stylua src tools`) formats the code and **selene** (`selene src`) lints it.

## Ideas for next versions

* Rebirth / "new season" for a permanent income boost.
* Upgrades for existing pieces (bigger jumbotron, more seats) instead of only new pieces.
* A leaderboard (cash, stadium value), daily rewards and gamepasses (2x cash, auto-collect).
* Real Humanoid NPC players running drills on the practice field.
