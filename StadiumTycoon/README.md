# Gridiron Stadium Tycoon (Roblox)

A Roblox tycoon where every player builds their own pro-football stadium piece by piece:
turf and yard lines first, then end zones, goal posts, stands, a scoreboard, flood lights,
upper decks, a jumbotron, a press box, luxury suites, a stadium canopy and finally a giant
championship trophy.

This is **version 1 (the simple version)**: the core stadium. Practice facilities, more
buildings and bigger systems can be layered on top later (see *Ideas for next versions*).

![Finished stadium](docs/preview-aerial.png)

## Play it in Roblox Studio

1. Download [`build/StadiumTycoon.rbxlx`](build/StadiumTycoon.rbxlx).
2. Double-click it (or in Studio: **File > Open from File...**).
3. Press **Play** (F5).
4. Walk through a glowing **gold gate** to claim a stadium.
5. Step on the glowing **buttons** to build. Green = you can afford it, red = not yet.
6. Your stadium earns money every second. It piles up in the **vault** next to the gate.
   Step on the **green pad** beside the vault to collect it (standing on it keeps collecting).

The plots, buttons and stadium pieces are built by the scripts when the game starts, so in
edit mode you only see the ground and the spawn point. That's expected: press Play.

**Multiplayer test:** in Studio open the **Test** tab, set *Clients and Servers* to 2 players
and press **Start**. Each player can claim a different stadium (6 plots per server).

**Build faster while testing:** open `ReplicatedStorage > TycoonShared > Config` and set
`Config.IncomeMultiplier = 50`. Put it back to `1` before publishing.

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
when a player leaves, and when the server shuts down. A "session lock" stops two servers from
overwriting each other if a player hops servers quickly.

## How the game works

| Thing | What it does |
| --- | --- |
| Gold gate | Touch it to claim an empty stadium (one per player). The sign shows your name. |
| Buy buttons | Appear when a piece unlocks. Shows the name, price and income it adds. |
| Vault | Collects your income every second. The number above it is how much is waiting. |
| Collect pad | Step on it to move the vault money into your cash. |
| HUD | Shows your cash, income per second, pieces built and whether saving is on. |
| Scoreboard / Jumbotron | Show your team name and attendance, and a pretend game that keeps scoring. |
| Day / night | A full day takes 10 minutes. Stadium lights switch on at night. |

Each plot gets its own team colours (navy & orange, crimson & gold, forest & silver, purple & black).
Team names come from the owner's display name, so no real NFL teams, logos or trademarks are used.

### The build order (23 pieces, about 35-40 minutes to finish)

Turf Field (free) -> Yard Lines -> Team Benches -> End Zones -> Ticket Booth -> Goal Posts ->
Midfield Logo -> Concession Stand -> Home Stands -> Visitor Stands -> Scoreboard -> Parking Lot ->
West + East End Zone Seats -> Team Store -> Stadium Lights -> Home Upper Deck -> Visitor Upper Deck ->
Jumbotron -> Press Box -> Luxury Suites -> Stadium Canopy -> Championship Trophy.

Prices and income are in `src/shared/Items.lua`.

## Project layout

```
StadiumTycoon/
  build/StadiumTycoon.rbxlx      the place file to open in Studio (built from src/)
  default.project.json           Rojo project: maps src/ into the place
  src/shared/   -> ReplicatedStorage.TycoonShared
    Config.lua                   all tunable numbers, team colours and the stadium layout
    Items.lua                    every buildable piece: price, income, unlock order, button spot
    Format.lua                   money formatting ($12.5K)
  src/server/   -> ServerScriptService.TycoonServer
    Main.server.lua              entry point: builds the world, wires players, saving, loops
    World.lua                    plot positions, street + spawn, day/night cycle
    PlotManager.lua              claiming, buttons, purchases, vault, scoreboard, lights
    PlayerData.lua               DataStore loading/saving with session locking
    BuildUtil.lua                helpers for making parts, text and lights
    Builders/                    the stadium geometry, one function per item id
      PlotBase.lua               slab, walkway, gate, vault, collect pad
      Field.lua                  turf, yard lines, end zones, goal posts, midfield, benches
      Stands.lua                 lower bowls, end-zone seats, upper decks
      Plaza.lua                  ticket booth, concessions, parking, team store, trophy
      Features.lua               scoreboard, lights, jumbotron, press box, suites, canopy
  src/client/   -> StarterPlayer.StarterPlayerScripts.TycoonClient
    HUD.client.lua               cash / income / progress / save status / pop-up messages
  tools/                         offline checks (see below)
```

### Adding a new stadium piece

1. Add an entry to `Items.List` in `src/shared/Items.lua` (Id, Name, Cost, Income, Requires, Button position).
2. Add a builder function with the same Id to one of the `Builders/` modules. Use the
   `BuildUtil` helpers and plot-local coordinates (see the comment at the top of `Config.lua`).
3. Rebuild the place file (below) or paste the changed scripts into Studio.

## For developers

These tools are optional. You only need them to edit the code outside Studio.

* **Rojo** (`rojo build default.project.json -o build/StadiumTycoon.rbxlx`) rebuilds the place
  file. You can also use `rojo serve` to live-sync into Studio.
* **Lune** runs the game code outside Roblox:
  * `lune run tools/render_plot.luau tools/out all` builds a complete stadium with the real
    builder code and checks it: plot bounds, blocked buttons, a clear walkway and tunnel.
  * `node tools/preview/shoot.js tools/out/parts.json tools/out` renders it to PNG images
    (run `npm install` in `tools/preview` first; needs Playwright + Chromium).
  * `lune run tools/test_server.luau` runs 100+ checks of the server logic and HUD against a
    fake Roblox engine. It covers claiming, buying, the vault, saving and rejoining, session
    locks, bad save data, Studio-without-API-access and the HUD.
  * `lune run tools/inspect_place.luau build/StadiumTycoon.rbxlx` checks the built place file.
* **StyLua** (`stylua src tools`) formats the code and **selene** (`selene src`) lints it.

## Ideas for next versions

* Practice facility: practice fields, weight room, locker room, training center and a film room
  (a second area on each plot, or plot expansion).
* Rebirth / "new season" for a permanent income boost.
* Game days: a timed event with a crowd of NPC fans and a temporary income multiplier.
* Leaderboard (cash, stadium value), daily rewards and gamepasses (2x cash, auto-collect).
* Upgrades for existing pieces (bigger jumbotron, more seats) instead of only new pieces.
