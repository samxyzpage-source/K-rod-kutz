# V5 layout: a real NFL stadium + a two-storey connected HQ campus

This is the plan every V5 builder follows. Numbers come from `src/shared/Config.lua`
(`Config.Layout`, here `L`). Everything is in plot-local studs: y = 0 is the slab top,
-Z is the front (street, plaza), +Z is the back (campus), 1 yard = 2 studs.

## Plot and areas

* 2 plots per server. One plot is X[-520, 520], Z[-460, 720].
* **Areas** (`L.Areas`): a piece is built in its area's frame. Its builder, its buy button
  (Items.lua) and its zone (`L.Zones`) all use that area's coordinates; the game adds the offset.
  * `stadium` (0, 0, 0): the field and the whole stadium (default).
  * `campus` (0, 0, +120): Team HQ, practice fields, Hall of Fame, garage, dome, skybridges.
    All campus numbers in Config (`L.HQ`, `L.HQCorridor`, `L.CampusRoad`, zones...) are
    campus-area coordinates, the same ones the V4 builders always used.
  * `plaza` (0, 0, -230): ticket booth, concessions, parking, team store, trophy, vendors.
  * `fanzone` (+220, 0, 0): the tailgate & fan zone.
* Plaza (stadium coordinates): the gold claim gate at z = -457, the walkway X[-12, 12] from the
  gate to **Gate A** at z = -195 (`L.StadiumFrontZ`). Vault + collect pad near the gate.
* Flush (0.1 tall) service roads ring the stadium: front road z[-244, -230], west road
  x[-340, -326], east road x[326, 340], the campus road (campus z[172, 186] = plot z[292, 306]),
  the back road (campus z[372, 386]) and the cart road along the west edge x[-516, -496].
  **Nothing collidable on roads, walkways or paths taller than 0.4** (golf carts must roll over
  everything; kerbs are fine up to 0.4).
* Back walk X[-12, 12] Z[255, 292]: Gate D (`L.StadiumBackZ` = 255) to the campus road.

## The stadium bowl

The bowl is an octagon around the turf rectangle (X +-135, Z -35..95). **Offset** = distance
outward from the turf edge. `src/server/Bowl.lua` turns this into geometry; use it.

* `Bowl.Row(L, tier, row)` -> `{ inner, outer, top }` (offsets + seating-surface height).
* `Bowl.Segments(L, o1, o2)` -> the 8 segments of a band (sides `visitor`/`home`, ends
  `west`/`east`, corners `corner_vw`/`corner_ve`/`corner_hw`/`corner_he`), each with a CFrame on
  the band's centre line at y = 0 (LookVector = outward, RightVector = along the segment),
  `depth`, `innerLength`, `outerLength`, `midLength`. Build a row block as
  `seg.cframe * CFrame.new(0, height / 2, 0)` with size `(midLength, height, depth)`; fill the small
  triangular joints between straight and corner blocks with wedges if they show.
* `Bowl.Aisles(L, kind, length)` -> stair aisle positions along a segment (3 wide):
  straight segments +-26, +-78, +-130...; corners: one in the middle.
* `Bowl.Gaps(L, rowInfo, seg)` -> places with no seats (aisles, players' tunnel, vomitories).
* `Bowl.SeatSpots(L, rowInfo, segName)` -> where game-day fans sit (on the row's top surface,
  0.6 toward the field from the row's centre line). **Keep that surface clear** of anything
  taller than 0.6 except at gaps, or fans will sit inside it. Seat strips go at the back of each
  row (the outer ~1.2 studs).
* Ownership (`Bowl.Pieces`): lower tier: `lower_home` (home side), `lower_visitor`,
  `lower_ends` (west = step 1, east = step 2), `lower_corners`; club tier: `club_seats`; upper
  tier: `upper_home`, `upper_visitor`, `upper_ends` (ends = step 1, corners = step 2).

| Tier / level | Offsets | Heights (y) | Notes |
| --- | --- | --- | --- |
| Lower bowl, 14 rows | 0..56 | row tops 4..30 | field wall 4 tall at the front; rows 1-5 cut at abs(x) < 10 on both sidelines (players' tunnels) |
| Event level | under rows 8-14 and outward | floor 0 | locker rooms, players' tunnels, entry halls, escalator halls |
| Main concourse | 56..84 | floor 30, ceiling 42 | on top of the lower bowl; section **portals** onto the lower bowl's top row; food/restrooms/merch on the outer side |
| Club seats, 6 rows | 56..80 | row tops 44..54 | above the main concourse (undersides >= 42) |
| Club ring | 80..108 | floor 54, ceiling 66 | club lounge, suites, press box (home side, centre), broadcast booth (visitor side, centre) |
| Upper deck, 18 rows | 80..152 | row tops 70..104 | undersides over the club ring >= 66 |
| Upper concourse | 116..152 | floor 74, ceiling 86 (rising outward) | under upper rows 10-18; **vomitories** run inward under rows 9-18, as open trenches through upper rows 4-8, onto a cross-aisle at upper row 3 (also y = 74) at +-52 on each side and the middle of each end (8 wide) |
| Facade | 152..160 | 0..112 | Gates A (front, x = 0), B (west, z = 30), C (east, z = 30), D (back, x = 0) at ground level |
| Roof canopy | over the upper deck | ~114..124 | ring roof, open over the field |

Rows are **hollow raked slabs** (about 2 thick) on raker beams and columns wherever something
needs to pass underneath (players' tunnels, locker rooms, event level, the main concourse
ceiling). Solid blocks are fine where nothing is underneath (lower rows 1-7 except the tunnels).

Levels are connected by escalators (stepped ramps), elevators (`BuildUtil.Elevator`, both ways)
and corner ramps (ground to the main concourse). Players walk from the plaza through Gate A into
an entry hall, take escalators/elevators to the concourses, and walk through portals and
vomitories ("tunnels into the seats") to their sections.

## Who builds what (modules)

| Module (file) | Pieces | Owns |
| --- | --- | --- |
| Stands.lua (rewrite) | lower_home, lower_visitor, lower_ends, lower_corners | lower rows, seat strips, aisles + railings, field wall + signs, players' tunnel openings + the tunnel structure under the rows |
| UpperDeck.lua (new) | club_seats, upper_home, upper_visitor, upper_ends | club rows, upper rows, their aisles/railings/glass rails, upper-deck vomitories through the rows, the upper deck's rear fascia ("Facade" steps) |
| Concourse.lua (new) | main_concourse, upper_concourse | concourse floors, columns, walls, ceilings, section portals, vomitory portals on the concourse side, upper-concourse food stands + restrooms |
| ConcourseShops.lua (new) | concourse_food, concourse_restrooms, concourse_merch | food stands, bars, restrooms, pro shop + kiosks on the main concourse (outer side) |
| StadiumRooms.lua (rewrite) | home_lockerroom, visitor_lockerroom | locker rooms in the event level under the home / visitor stands + the players' tunnels to them |
| ClubLevel.lua (replaces PressLevel.lua) | club_lounge, suites, pressbox, broadcast_booth | everything in the club ring |
| Exterior.lua (new) | gates, escalators, facade | the facade + gates + entry halls, escalators/ramps/elevators between levels, wayfinding |
| Features.lua (rewrite) | scoreboard, jumbotron, lights, canopy | east (scoreboard) and west (jumbotron) end-zone video boards above the upper deck, 4 light towers at `L.LightTowerPositions`, the roof canopy |
| HQShell.lua (redesign) | (always present) | the two-storey HQ: floors, walls, roofs, atrium void, stairs + elevator cores, upper corridor, room outlines on both floors |
| HQRoomsUpperFront.lua (new) | hq_atrium, hq_owner, hq_media, hq_scouting, hq_analytics | upper-floor front rooms + the atrium's grand staircase |
| HQRoomsUpperBack.lua (new) | hq_kitchen, hq_barber, hq_spa, hq_players | upper-floor back rooms |
| CampusLinks.lua (new) | campus_links | covered walkways + skybridges joining the HQ, Hall of Fame, garage, dome and fields |

## The Team HQ (campus coordinates)

* Footprint `L.HQ` X[-250, 100] Z[200, 360] (the shell may stick out a little for architecture:
  X[-262, 118] Z[188, 372] (the east tower reaches x 118), but the HQ entrance walk X[-112, -88] Z[186, 200] stays clear at
  ground level and the campus/back roads stay clear).
* Ground floor y = 0.2. **Upper floor top y = 17** (`L.HQ.UpperFloorY`) everywhere except the
  atrium void over the lobby (`L.HQAtrium` X[-150, -50] Z[202, 264]). Roof ~36.
* Ground-floor rooms (existing pieces) keep their zones and stay below y = 16.
* Upper floor: the corridor X[-248, 98] Z[264, 278] (y 17) must stay walkable; upper rooms
  sit above the ground rooms (front row Z[202, 264], back row Z[278, 358]) with doors onto the
  corridor; upstairs buy buttons stand in the corridor at y = 17 (see Items.lua).
* The shell provides stairs + an elevator from the start (so players can reach upstairs
  buttons before buying the atrium staircase).

## Rules for every builder

* Use the BuildUtil helpers (parts, `Stage`, `Look`, `Door`, `Seat`, `Elevator`, `Use`,
  `LiveText`) as in V4. Make things walk-in and interactive.
* Part budget per piece (all steps together): rooms <= 170, stadium structure pieces <= 300
  (hard cap 380). Prefer long merged parts over many small ones.
* The preview harness (`tools/render_plot.luau`) checks zones, plot bounds, buttons, walkways,
  roads, players' tunnels, HQ corridors (both floors), concourse lanes, prompts, doors, seats,
  elevator targets and live screens. Concourse **lanes** that must stay clear (y floor+0.8 to
  floor+9) on the straight sides: main concourse offsets 66..76, club ring 96..104, upper
  concourse 128..138. Shops and suites go outside the lanes.
* New camera views: `plot`, `v5_aerial`, `v5_back`, `v5_bowl`, `v5_field`, `v5_hq`
  (`node tools/preview/shoot.js <out>/parts.json <out> v5_aerial`).
