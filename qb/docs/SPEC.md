# ROAD TO GLORY: QB — Build Specification (The Moment)

**Version:** 0.2 (v2 "DRAW THE PASS", as built)
**Status:** DESCRIPTIVE. This document records what is in `qb/` today: every shape is the one the code returns and every number is the one in `Tuning.qb` (`qb/js/engine/tuning.js`) **as of the read recorded in §0.6**. Where the v2 build contract and the code differ, the code is documented and the difference is listed in §0.5. A change to the rules needs a row in §0.4.
**Repo location:** `qb/` (a sibling of `kicker/`, which is never edited: it is the style guide and the source of every kit file).
**Audience:** whoever picks this up next. The career build (§6) will host the moment screen unchanged, so the contracts in §3 are the ones to keep.

---

## 0. How to read this document

### 0.1 Document map

| Part | Section | What it covers |
|---|---|---|
| A. Game design | §1 pitch, pillars, pacing · §2 attributes, the read, the snap, the field simulation, the drawn line, the ball, running, the result, a worked snap, the run cards, the drive, the rating, weather, the measured balance | The rules and every formula, with worked numbers |
| B. Technical | §3 files, namespace, shapes (PlayContext, PlaySim, Live, Plan, PlayResult), `RTG.Play` / `RTG.Field` API, the RNG draw contract, the store, the flow, the debug API, performance | Binding for anything that hosts the moment |
| C. UI | §4 visual language, sprites, layout, screens, the moment scene, the drawing layer, input, audio, accessibility | The scene and the demo's shell |
| D. Tests | §5 Node unit tests, the balance tests, Playwright flows | What is asserted and how to run it |
| E. Later | §6 the career to come | What the kicker's career gives for free and what a QB needs of its own |

### 0.2 Terminology

- **Engine**: DOM-free JS under `qb/js/engine/` and `qb/js/data/`. Loadable in Node through `qb/test/load.js`. Never touches `window`, `document`, `localStorage`, `Date`, `Math.random`, timers.
- **UI**: everything under `qb/js/ui/`, `qb/css/`, `qb/index.html`, plus `qb/js/debug.js`.
- **Moment**: one snap of football, played in full: the situation card, the pre-snap read, the play on the field (the drawn pass, the drawn run, the throw-away, the sack), the result. The only thing the player ever plays.
- **Situation**: the plain object that describes a snap before anything is rolled: `{down, toGo, yl, quarter, clock, score, venue, weather, qb, team, opp, …}`. In the demo it comes from the drive script (§2.11); in a career it will come from a game.
- **PlayContext / PlaySim / Live / PlayResult**: the four engine shapes of a moment (§3.4). What the defence shows and which plays are offered → everything the field needs at the snap → the play itself, stepped in field yards → what happened.
- **The field frame**: `x` = lateral yards from the ball's spot (+ = the offence's right), `y` = yards downfield from the line of scrimmage (LOS `y = 0`, the backfield is negative). Points are `{x, y}`; a polyline is an array of them.
- **Sim time** (`live.t`, seconds since the snap) vs **real time** (the browser's clock). The scene advances sim time by `realDt × timeScale`.
- **A line / a draft**: a polyline the player draws from the quarterback (a finger, the mouse or the keyboard). While it is being drawn it is a **draft**; `live.classify` says what it is (`PASS | RUN | THROWAWAY | INVALID`, §2.5.1); released, it is **committed** (`throwAlong`, `setRun`, `throwAway`).
- **Loft**: 0 (a bullet) … 1 (a lob), from the draw speed (§2.5.2). **Touch** is the loft's name: BULLET < 0.33 ≤ TOUCH < 0.67 ≤ LOB.
- **The preview**: the colour of a PASS line's race to its landing spot (GREEN / GOLD / RED, §2.5.4), shown only at IQ ≥ 70.
- **Plan**: the log of a moment's accepted inputs at their sim times, `{runs, pass, away}` (`live.plan()`). `Play.resolve(sim, plan, rng)` replays it exactly.
- **The ghost**: `Play.snap`'s rehearsal of the play with nobody throwing (0 draws), which records each receiver's separation curve for the timing feedback (§2.3.6).
- **rng**: the seeded mulberry32 instance (`RTG.RNG`, copied from the kicker). The engine's only source of randomness. Every engine call forks it exactly once (§3.6).
- **uiRng**: the store's non-persisted RNG for cosmetics (title stars, a random seed). Never reaches the engine.
- **Tuning**: `RTG.Tuning`. `Tuning.qb` holds every balance constant of the moment; `Tuning.weather` and `Tuning.difficulty.pro.windCap` are the kicker's blocks the copied `engine/weather.js` reads.
- **yl**: the field position in yards from the player's own goal line (0..100; 80 = the opponent's 20). Screen positions are virtual px (§4.5.3).

### 0.3 Non-negotiable constraints (the kicker's, inherited)

1. Static site. Plain HTML5 + CSS + vanilla JS + `<canvas>`. No build step, no npm dependencies at runtime, no modules, no frameworks. Works on `file://` and on any static host. Classic `<script>` tags in order; one global `window.RTG`.
2. ES2017 at most: no `?.`, no `??`, no class fields, no optional catch binding. Every file in the shim `(function (root) { 'use strict'; var RTG = root.RTG = root.RTG || {}; … })(typeof window !== 'undefined' ? window : globalThis);`.
3. Only optional external resource: Google Font "Press Start 2P" with a Courier fallback. Fully playable offline.
4. Phone-first (390×844 with 16-px gutters, no horizontal scroll; 320 px must still work), desktop 1280×800, landscape 844×390. 60 fps on a phone: no per-frame text on the canvas (HUD text is DOM), no allocations in the draw loop.
5. Seeded RNG. No `Math.random` in engine code. A drive is reproducible from `{seed, archetype, team, venue}` plus each moment's plan; `?seed=` in the URL replays the six situations.
6. Strict engine/UI separation; the engine is unit-testable in Node via `vm`. **The engine owns every position** (D20): the scene never computes where a player is.
7. `RTG.debug.*` for Playwright: force results, draw programmatically, skip to the summary, read state.
8. Fictional names everywhere (the demo's five receivers per preset are invented).

### 0.4 Decision log

| # | Topic | Decision | Rationale |
|---|---|---|---|
| D1 | The request (the player's words) | *"Let's make one of the same style, but with a qb. You should only play the moments kinda like the game soccer superstar."* The QB game is built in the kicker's idiom (Retro Bowl-style pixels, the same palette, chips and banner beats) and the player only ever plays snaps, never a whole game. | The kicker is the style guide; "only the moments" is the design. |
| D2 | What a moment is (asked and answered) | Four questions were put to the player and answered: **(1)** a moment is a **pre-snap read** (the defence shows a look; pick one of 2–3 plays) **and then the play**; **(2)** **only the key plays** of a game are played (a third down, the red zone, short yardage, the two-minute drill, the last play); **(3)** the camera sits **behind the QB**, over the shoulder, like the kicker's kick scene; **(4)** **the full career comes later**: this build is the playable demo of the moment on its own page (`qb/index.html`) with its own single-file bundle. | The answers fix the scope: one scene, one screen flow, no career state. |
| D3 | Kit forked, not shared | `qb/` copies the kicker's kit files verbatim (`00_namespace`, `util`, `rng`, `weather`, `storage`, `palette`, `components`, `canvas`, `audio`, `sprites`, `style.css`) with only the game name in the header changed; `sprites.js` is extended below the kicker's atlas. `kicker/` is never edited. | The two games must be able to drift apart without breaking each other; the copy is the contract. |
| D4 | One fork per engine call | `Play.buildContext`, `Play.snap`, `Play.live` (or `Play.resolve`) and `Play.driveScript` each cost the parent rng **exactly one draw** (a fork). The child of `buildContext` and `snap` draws in a fixed order; the Live's child draws in **event order** (§3.6). A run card, a forced result and the headless paths still spend the live fork, so **every moment costs the drive's rng exactly 3 draws** (ctx · snap · live) whatever the player does. | A drive replays its six situations from the seed no matter how the moments were played; the tests pin the counts with a draw-counting rng. |
| D5–D8, D12, D13, D18 | Retired by D19 | v1's throw input (`Play.throw`), its phases and its openness curves are gone, with every rule that existed only for them. | The v2 request replaced the hand. |
| D9 | The offence slides into the formation | At the pick the offence slides from the READ picture (`ctx.alignment`, the shotgun) to the Live's `t = 0` spots over `TIMING.alignMs` (420 ms; 0 with reduced motion) **before** the scene starts stepping. In the engine a man lined up behind the line (the gun back at −5) fades into his route's depth over `route.releaseT` (1.0 s). | The engine re-aligns receivers per formation; a jump cut looked like a bug. |
| D10 | Thirteen pass plays, not twelve | `QUICK OUTS` was added for short-yardage variety, and after a balance probe found no BAD play vs COVER 3, `FOUR VERTS` and `FADE` became BAD vs COVER 3 and `SCREEN` BAD vs MAN. Every coverage has at least one GOOD and one BAD answer (`plays_lint.test.js`). | The read has to matter against every look. |
| D11 | Short-yardage cards | `SNEAK` at `toGo ≤ 2`, `DRAW` at `toGo = 3`, never both; a run card sits next to exactly `read.runCardsMin` (2) pass cards, so the options are always 2–3 cards. `SNEAK` on `3rd/4th & 1` is always advised GOOD. | The scene expects 2–3 cards; a sneak from the 3 is not a sneak. |
| D14 | `rating` is the NFL formula | `Play.rating` implements the exact NFL passer rating. The v1 contract's example (20/30, 250 yd, 2 TD, 1 INT → 92.4) was wrong: that line is 100.7; 92.4 is the same line for 190 yards. | A wrong constant in a spec is still wrong. |
| D15 | `window` is a string key | The purity scan forbids the bare identifier `window` outside the shim, so the routes' `window` field is read through `var WINDOW = 'window'` (`plays.js`, `field.js`). | Keeps the DOM scan strict. |
| D16 | The drive continues on a first down | Between moments the shell advances the story: a first down (or any gain on 1st/2nd down) carries the gain into the next script entry's `yl` (clamped −10..+40 and capped per kind so a red-zone snap stays a red-zone snap); a turnover, a failed 3rd/4th down, a touchdown or the last play resets it ("the defence holds; next possession"). | Six scripted snaps still feel like one night. |
| D17 | No career save; settings only | `RTG.UI.Storage` persists only `rtg.qb.settings` (separate from the kicker's `rtg.settings`). A drive is reproduced by its seed, not saved. | The career (§6) brings the save format; the demo must not invent one. |
| D19 | **The v2 request (the player's words)** | *"It's a good prototype but I want it to be like soccer superstar almost like you draw the line of your pass."* Four answers fixed the design: **(1) slow motion**: while a finger is drawing, the play runs at about 15 % speed and the defence and the rush still creep; **(2) the ball's exact path**: the line you draw is where the ball flies and it lands where the line ends. You can bend it around a linebacker; a defender near the line can tip or pick it; a longer line needs more arm; draw fast for a bullet, slow for a lob that floats over defenders; **(3) draw your run too**: like Soccer Superstar's dribble, a line from the QB that no receiver can reach is a run (roll out, step up, scramble); **(4) keep the play cards**: the pre-snap read and the cards stay, and IQ still matters. Unchanged: the SITUATION card, the READ phase and the cards (`buildContext`), SNEAK / DRAW resolved at the snap, `driveScript`, `rating`, the six-moment drive, the title, the summary, the settings, `?seed=`, the kicker's look. | The prototype's hand did not feel like the game the player named; drawing the play does. |
| D20 | The engine owns every position | After the snap the play is a deterministic simulation in field yards (`RTG.Field`, 22 players and the ball, a fixed 1/60-s step). The scene calls `live.step(realDt × timeScale)` once a frame and draws the Live's positions. Its only own geometry is sprite anchors, the 420-ms slide into the formation and presentation offsets. | What the player sees is what the engine resolves: the gap threaded on screen is the gap checked. |
| D21 | The line is the ball's path | `throwAlong` flies the drawn polyline (plus scatter, §2.6.2) at the arm's speed and lands at its end (cut at the arm's `maxLen`). The height follows a physical arc over the chord, so a lob is higher because it is slower and because it is lofted. The classic pick is a bullet at chest height through a linebacker; a lob sails over underneath defenders and is contested at the end. | Each promise in D19 ("bend it", "float it over") is a position and a height the engine checks. |
| D22 | One rule says what a line is | `live.classify` (§2.5.1) is used by the draft chip, the commit, the keyboard's proposal, aim assist, the e2e helpers and the bots. A line that classifies as THROWAWAY flies as drawn as a throw-away (no scatter, never a turnover); THROW AWAY and X fly the engine's own line past the nearer sideline (`live.throwAway`). A line no receiver can reach that is still sent to `throwAlong` (the programmatic path only) goes to the receiver with the best margin, unless even he is more than 1 s late (`field.hopeless`); then it is thrown to nobody. | The chip, the commit and the replay agree because they are the same function. |
| D23 | Slow motion has a budget | While a draft exists (finger or keyboard) the play runs at `draw.slowMo` 0.15 until `draw.slowMoBudgetS` 4 s of **real** time per play are spent; then time returns to full speed and the chip reads SLOW-MO OUT. The canvas shows letterbox bands and is desaturated while slow. | Drawing has to be possible but not free: at most 0.6 s of sim time passes in slow motion per play. |
| D24 | The preview is the IQ perk | Everybody sees what the line is (`PASS → WR1 · BULLET`, `RUN`, `THROW AWAY`, `TOO LONG`) and who it is for. The race colour is shown only at IQ ≥ `draw.previewIq` 70, which of the four archetypes means the FIELD GENERAL (74). The colour is an honest extrapolation (§2.14: GREEN lines complete ≈ 90 % and are not picked). | Answer (4): IQ still matters after the snap. |
| D25 | The call matters through geometry | `sim.fit` (the card's rating vs the REAL coverage) scales man coverage's trail, leans the zone landmarks toward or away from the play's route spots and scales the defenders' break on the ball (§2.3.4). There are no hidden dice for it. | The contract's target (+1.5–2.5 yd of median peak separation on the primary routes) is reached by positions the player can see. |
| D26 | The pocket is a place | `ctx.pressure.sackAt` is when the first rusher gets home on a QB who stays at the top of his drop; the snap turns it into the rushers' `beatAt` and after that they chase where the QB **is** (§2.3.5, §2.4.5). A rollout away from the first free rusher buys time. The RUSH meter is `live.pressure`. | "A rollout buys time against the wrong-side rush" is a position, not a timer. |
| D27 | The plan is the replay | `live.plan()` logs the accepted inputs at their sim times; the drive log stores it with the rng state before the live fork; `Play.resolve(sim, plan, rng)` returns the same PlayResult. This is unit-tested across seeds, frame sizes and JSON copies of the sim, and e2e-tested for every drawn moment. | A drawn moment is as reproducible as a v1 input was. |
| D28 | Timing feedback from the ghost | `Play.snap` rehearses the play once with nobody throwing (0 draws) and stores each receiver's separation curve; the result's timing label compares the ball's **arrival** with that curve (§2.8). | A label the player can learn from, computed from the same field. |
| D29 | Aim assist is a magnet, not a hand | `settings.aimAssist` (default on): a finger's PASS line whose end is within `draw.assistYd` 3.5 yd of the spot its target can reach is shifted onto that spot (the offset grows along the line, so the start stays on the QB); the snap is kept only if the shifted line still classifies as a PASS to the same man. Keyboard lines are built on that spot already. | A new player's line to where the man IS lands where he is going; it never changes who the ball is for. |
| D30 | Drafts are read once a frame | Pointer samples are converted, resampled to 0.75 yd and smoothed once per animation frame, and the draft is classified at most once a frame (not per pointermove). A stroke that never leaves 14 css px of the press is a tap and does nothing; pointercancel, a lost capture and a window blur discard the draft (never a throw). | The classify budget holds with room to spare, and a twitch on the helmet is not a 2-yard run. |
| D31 | Run cards unchanged | SNEAK / DRAW are resolved inside `Play.snap` as in v1 (the sim is the result); the scene plays v1's RUN beat; the moment host spends the live fork itself. | Answer (4) keeps the cards; a run card has no line to draw. |
| D32 | The field has edges (review fix) | A line whose ball dies out of bounds is always a THROWAWAY (checked before the race); a receiver breaking to the ball keeps his feet `field.feetIn` 0.2 yd inside the lines (his hands still reach `catchR` past them: a toe-tap); a catcher, an interceptor or a man picking it at the landing who stands out of bounds makes no catch (INCOMPLETE `OUT_OF_BOUNDS`, 0 draws); the defence stops at the sidelines and the end line and does not chase a throw-away. | 5.3 % of catches were made out of bounds, 20 of them touchdowns. |
| D33 | The spot is never rounded up (review fix) | `td` only on the TD event; a gain is floored (a loss rounded), at most `goal − 1` without a TD; `firstDown = td or yards ≥ toGo`. | A tackle at the half-yard line was a touchdown and 4 % of first downs were short of the sticks. |
| D34 | Running away buys nothing (review fix) | A held rusher is released once the QB is `rush.leash` 4 yd deeper than the rusher's pocket spot (depth only); a run line heading for his own goal line is run at `× (1 − qbSpeed.back 0.45 × (backward share − backFree 0.25) / 0.75)`; his own end line is out of bounds (a SCRAMBLE for a loss); maxT with the ball is a SACK by the nearest defender (the event names him); a ball that could not land before maxT is not released. | Straight back was never sacked and timed out as a phantom sack; now it buys ≤ 0.45 s (a rollout ≈ 1 s). |
| D35 | Contact up to the catch point (review fix) | Only a defender within `catchR` of the landing hands his in-flight roll to the catch contest; anyone else in the lane in the last `catchZone` yards keeps his roll (rolled at the latest on the landing sub-step); the preview scans the same yards. | A linebacker 2–3.3 yd in front of the receiver was a free pass. |
| D36 | The early ball costs (review fix) | A catch roll loses `catch.early` 0.35 × clamp((his route's window.open − the arrival) / `earlyT` 0.8, 0, 1): a ball that beats the break finds a man not looking; such a ball is never GREEN. The QUICK bot (no read, a touch pass at 0.7 s) is pinned below DECENT (`balance.test.js`). | A no-read throw at 0.7 s tied the DECENT reader (81 % / +0.37 EPA). |
| D37 | A pass drawn too fast is a pass (review fix) | A line ending ≥ `draw.earlyDepth` 6 yd downfield on a receiver's route AHEAD of him (his route within `catchR` of its end within `draw.earlyS` 2 s after the ball lands) is a RED PASS to him (`classify(...).early`, the chip `PASS → WR1 · TOO FAST`), not a run; the loft map is `draw.loft {fastHps 1.3, slowHps 0.35}` (an aimed thumb stroke is a bullet or a touch pass). | A fast deep flick used to become a 30-yard scramble and a bullet needed a 120–250 ms flick. |
| D38 | The finger's intent is sticky; a line can be aborted (review fix) | While a finger rests the draft keeps the kind it had when it last moved (a pass line whose man runs past its end stays his PASS, RED); the release commits the same. Letting go with the finger back on the QB, or with the line's end off the canvas, drops the draft (`LET GO TO CANCEL`). A touch line is drawn `touchLiftCss` 36 css px above the fingertip (ramped in over the first 72 px). A press on the QB during the slide into the formation starts the line once the play can be drawn. A resize mid-stroke drops the draft. | A resting pass line turned into a scramble; nothing but touchcancel could abort; the thumb hid the QB and short runs. |
| D39 | The first snap waits (review fix) | On the drive's first moment, until the player has drawn once this page, the play waits at the snap (timeScale 0, a pulsing ring on the QB, the hint up) for the first touch on the QB, a key or THROW AWAY; the READ screen adds `AFTER THE SNAP: DRAW FROM THE QB` (a sub-banner, the panel's height never changes). | The only instruction raced the rush: 2 of 5 newcomers were sacked with it still up. |
| D40 | Slow motion is smooth (review fix) | The scene draws every actor at `x + vx × live.rest` and the ball `speed × rest` further along its flown path (a presentation offset under one 1/60-s sub-step). | At 0.15× the field moved in ~9-Hz hops. |

### 0.5 As built vs the v2 build contract (drift, resolved in favour of the code)

| Where | The contract said | The code does |
|---|---|---|
| `Tuning.qb.field.height` | `{release, catch, apexMin, apexPerLoft}` | `{release 2.0, catch 1.6, apexMin 0.15, gravity 10.7, lift 0.8}`: apex = max(apexMin, g·T²/8) × (1 + lift × loft) |
| `draw.reachSlack` | a slack | seconds (0.2): a receiver up to 0.2 s late to the line's end still makes it a PASS |
| `classify` result | `{kind, target, points, length, maxLen, tooLong, preview, previewShown, reason}` | plus `margin` (s) and `early` (D37); GREEN also needs `greenReach`, a clear path and no hot or early ball, RED also comes from `redReach` (§2.5.4); a THROWAWAY's points are cut at `maxLen` too; out of bounds where the ball dies is checked before the race; once the QB is past the line or scrambling every legal line is a RUN |
| The Live | the listed fields | plus `pressure`, `rest`, `previewShown`, `field`, `sim`, `aim(slot, loft)`, `snapshot()`, `defenders[i].blocked`; `ball.{target, speed, length, apex, tipped, tooLong, preview}`; after DONE `step` keeps moving the players (presentation only) |
| `receivers[i].sep` | yd to the nearest defender | yd to the nearest defender who is not rushing |
| `throwAlong` | a PASS line | a THROWAWAY-classified line flies as a throw-away; a RUN-classified line goes to the best-margin receiver, or to nobody past `field.hopeless` (D22) |
| The scene's commit | THROWAWAY → `live.throwAway` | a drawn throw-away line → `live.throwAlong` (the ball flies the drawn line); the button and X → `live.throwAway` |
| `setRun` | from where he is | also a first point beyond `startR`: he runs to it first (`debug.drawRun` with one point works) |
| Timing label | the release vs the target's separation peak | the ball's arrival vs the ghost curve: ON TIME when his separation at the arrival was ≥ 0.75 × its peak (§2.8) |
| PlayResult | the listed fields | plus `landing, release {x, y, pressure, running, sd}, arrive, flight, sep, miss, preview, contest, nearest {id, d}, escaped, ended, endT, tooLong, sackAt, catcher`; `fumble` is always false; a tipped incompletion reads `TIPPED` |
| `Play.buildContext` | may add child draws | adds none: `ctx.field` and `ctx.alignment` are pure (8 + 3 × pass cards, as in v1) |
| `Play.snap` | per-defender randoms pre-drawn in the sim | folded into `defenders[i].skill` and `.react`; 63 child draws; the sim also carries `qbStart`, `field.centerX`, the receivers' `x0, y0, side, capY, xMin, xMax, key, ghost`, the defenders' `x0, y0, deep`, the rushers' `line, pocket` |
| `RTG.Play` | `live`, `resolve`; `throw` removed | plus `Play.autoPlan` (a headless plan, 0 draws); `Play.pathAt` kept (delegates to `Field.pathAt`); the constant `PLATEAU_EPS` is left in `play.js`, unused |
| `Play.live` on a run sim | — | spends the fork and returns a finished Live whose `result()` is the sim; `Play.resolve` returns the sim |
| RUSH chip | the nearest unblocked rusher's closeness | `live.pressure`: the nearest rusher's or spy's closeness, a still-blocked one counted at `field.heldPressure` 0.5 of it |
| Slow motion in the scene | everything keeps moving at the reduced rate | as the contract: the scene draws `x + vx × live.rest` (D40) |
| Classify cadence | on every pointermove (≤ 0.3 ms) | at most once a frame (D30); measured 3–14 µs a call |
| Camera | may follow the carrier (optional) | fixed; the horizon was raised to 0.26 H with 50 yd of depth in view |
| `PlayView.mount` | `onPick(playId) → PlaySim`, `makeLive` | `onPick(playId, option)`; also `uiRng`, and `rng` as a fallback when `makeLive` is absent; the view also returns `cv, layout, current, canDraw, qbPoint, actors, read, reachSpot, playResult` |
| HUD THROW AWAY | a touch button | shown for every pointer type while a pass is legal |
| The hint | one line on the first moment | the drive's first moment waits for the first touch with the hint over the field (D39; a player who has drawn before gets it for 3.6 s) and the same line in the panel on every moment |
| Keyboard R | a RUN draft | also Z (v1's scramble key); the draft starts 5 yd straight ahead; a keyboard PASS that classifies as RUN is refused ("NOBODY GETS THERE"); A / D / W / S alias the arrows |
| Rings | from `receivers[i].shown` | also hidden during the slide, after the catch and at DONE; thresholds from `Tuning.qb.open.ring` |
| Settings | `aimAssist` | plus the keys `run, bendLeft, bendRight, loft, cancel` (the modal remaps 12; `scramble` stays as an alias); under reduced motion slow motion keeps its chip and time scale but drops the bands and the desaturation, as the hint says |
| `RTG.debug` | `current, forceResult, drawPass, drawRun, fieldToCss` | plus `reachSpot, classify, cssToField, qbPoint, throwAway, live, plan, events, timeScale, holding, unhold, autoThrow, replay, simIds, simFull`; `current()` returns the full ctx |
| `PlayInput.DRAW_DEFAULTS` | — | fallbacks used only when `Tuning.qb.draw` is missing (the same values as Tuning) |
| `Data.plays.plays` (v1) | about 12 pass plays | 13 (D10) |
| `Play.rating` (v1) | 20/30 250 2 1 → 92.4 | 100.7 (D14) |
| `Tuning.qb.read` (v1) | `{disguise, iqSees, iqExact, goodOffered, revealBase, revealIq}` | plus `options`, `sneakToGo`, `drawToGo`, `runCardsMin`, `hotBelow`, `weights` |
| HUD wind chip (v1) | `WIND 8` | `Weather.label`: `WIND ← 8` / `CALM` / `DOME`, plus a weather-kind chip (`RAIN`, `SNOW`, `FOG`, `COLD`, `HEAT`) |

### 0.6 The numbers: as of

Every number in this document is the value in `Tuning.qb` (and `Data.plays`) as read at **2026-09-24 01:17 UTC** (`tuning.js` md5 `a8e2d70ef643…`, working tree on top of commit `275faea`), updated for the review fixes D32–D40 on top of commit `11d847b` (the rules, the tuning keys they added and the measured values in §2.3.4, §2.5.2, §2.14 and §5 were re-measured then). Derived values (speeds, lengths, probabilities, pocket times) were computed by loading the engine from that tree (`qb/test/load.js`); measured values (§2.14, the worked snap in §2.9) were produced by running the engine and the test bots (`qb/test/fixtures/bots.js`) on it. A balance pass runs in parallel with this document; where `tuning.js` and this text disagree, `tuning.js` is right and this text is stale.

---

## 1. Game overview

### 1.1 Pitch

You are the arm, and the pen. Everything before the snap is a picture the defence painted for you; everything after it is a field of 22 players moving in real yards. *Road to Glory: QB* takes the kicker's promise (you only play the plays that are yours) and gives the quarterback Soccer Superstar's hand: put your finger on the QB and **draw**. A line to a receiver is the ball's exact path: fast for a bullet, slow for a lob over the linebacker, bent around the man in the lane. A line into space is your run: roll out, step up, take off. While your finger is down the play crawls in slow motion, and the rush still comes. The demo is one night, six snaps: a third and medium, a third and long, a red-zone snap, a fourth and short, the two-minute drill and the last play with the game on the line. Then the box score and a passer rating.

### 1.2 Pillars

1. **The read must feel like a bet.** The look is honest most of the time and a lie some of the time; IQ decides how often, and how much the card can tell you.
2. **The line is the ball.** What you draw is where it goes: its length is the arm, its speed is the loft, its path is where defenders can touch it. The engine checks the same line you see.
3. **The window must be seen, not counted.** The rings under the receivers show separation now (from the engine), from `revealAt` on, earlier for a smart quarterback; the FIELD GENERAL also sees his line's race turn green, gold or red before he lets go.
4. **The rush must be felt.** The pocket is a place: the rushers beat their blocks and chase where you are. Slow motion is a budget, not a pause. Roll away, step up, or get it out.
5. **Every number is a mechanism.** ARM → ball speed and the arm's length · ACC → the scatter · IQ → the disguise rate, the reveal, the card, the preview · MOB → run speed, sack escapes, broken tackles · POI → pocket time and the clutch.

### 1.3 Pacing budgets

| Unit | Target | Notes |
|---|---|---|
| A moment | 10–15 s | situation card → read (2–3 cards) → 0.42-s slide → the play: the first rusher is home around 2–3.4 s of sim time (§2.3.5) plus up to 4 s of real slow motion → the flight, the catch and the run after it → a 0.65-s hold → the result, 1.2 s |
| A drive (six moments) | 1.5–3 min | with a DRIVE interstitial between moments |
| The summary | as long as you like | PLAY AGAIN (same seed) / NEW DRIVE / TITLE |

### 1.4 What the demo is, and is not

It is: the title (archetype, team preset, venue, seed), six moments through the real scene and the real engine, the story between them, the box score. It is not a career: there is no XP, no team, no season, no save. §6 says what comes next and what it inherits.

---

## 2. Game design

### 2.1 Attributes, archetypes, teams

Attributes are integers 0..99 (`Tuning.qb.attrMax` 99; ratios below divide by it).

| Attr | Key | Governs |
|---|---|---|
| Arm | `ARM` | the ball's speed `(ballSpeed.base 18 + perArm 16 × ARM/99) × (1 − loftSlow 0.48 × loft)` yd/s: ARM 55 → a bullet 26.9, a touch pass 20.4, a lob 14.0 · ARM 72 → 29.6 / 22.5 / 15.4 · ARM 99 → 34.0 / 25.8 / 17.7; the arm's max length `maxLen.base 30 + perArm 30 × ARM/99` yd of line: 46.7 at 55, 47.0 at 56, 51.8 at 72, 60 at 99 |
| Accuracy | `ACC` | the scatter: the lateral sd × `(1 − scatter.perAcc 0.8 × ACC/99)`. A set 30-yd line: sd 0.79 yd at ACC 52, 0.77 at 54, 0.72 at 58, 0.57 at 72, 0.27 at 99 (§2.6.2) |
| IQ | `IQ` | the disguise rate (§2.2.2), when the rings appear (`revealAt`), whether the card's advice is against the real coverage (`read.iqExact` 80), how often an ambiguous card admits it (`sure`), and the preview colour at `draw.previewIq` 70 (§2.5.4) |
| Mobility | `MOB` | the QB's speed `qbSpeed.base 4.9 + perMob 3.0 × MOB/99` yd/s (MOB 50 → 6.4 · 72 → 7.1 · 99 → 7.9), the sack-escape roll (§2.7.1), the broken-tackle roll on a scramble (MOB is his skill and his speed there) |
| Poise | `POI` | pocket time (`pressure.poiW` 0.004 s per point over 50) and the clutch shrink of the pocket (`clutchMul` 0.30 × (1 − POI/99)) |

**Archetypes** (`Tuning.qb.archetypes`; the signature attribute is the one the kicker's D24 rule leaves uncapped in the career):

| Archetype | ARM | ACC | IQ | MOB | POI | Signature | The title card's line (`title.js`) |
|---|---|---|---|---|---|---|---|
| GUNSLINGER | **72** | 54 | 52 | 52 | 56 | ARM | A cannon and a short memory. The longest line on the field and the hottest bullet. |
| SURGEON | 55 | **72** | 58 | 50 | 56 | ACC | The ball goes where the line goes. Threads it past a linebacker's ear. |
| FIELD GENERAL | 55 | 58 | **74** | 50 | 60 | IQ | Sees the disguise before the snap, and sees his line turn green, gold or red before he lets it go. |
| DUAL THREAT | 56 | 52 | 50 | **72** | 55 | MOB | Draw a run and he is gone: rolls out, slips the rush, takes the sticks himself. |

The attribute bars' tooltips: ARM "Ball speed and how long a line you can throw" · ACC "How close the ball stays to the line you draw" · IQ "Reads the look, sees windows early; 70+ sees the pass preview" · MOB "Run speed on a drawn run, sack escapes" · POI "Pocket time: the rush takes longer to get home". The engine's default archetype is `FIELD_GENERAL` (`demo.defaultArchetype`, used when a situation carries no `qb`); the title screen defaults to `GUNSLINGER`. Every QB is right-handed unless `qb.foot === 'L'` (presentation: the left-handed mirror).

**Team presets** (`Tuning.qb.demo.teams`; the demo uses one preset for both sides: `situation.team = {ol, wr}` and `situation.opp = {dl, db}` of the same preset):

| Preset | OL | DL | DB | WR1 | WR2 | SLOT | TE | RB |
|---|---|---|---|---|---|---|---|---|
| BAD ("BAD LINE") | 30 | 78 | 62 | T. Vance 52/62 | R. Okafor 46/55 | J. Pruitt 49/50 | B. Holm 44/38 | D. Sykes 48/58 |
| AVERAGE | 58 | 55 | 56 | D. Cross 66/70 | M. Reyes 58/64 | K. Abara 60/60 | S. Lindqvist 55/44 | A. Booker 56/66 |
| GREAT ("GREAT LINE") | 80 | 50 | 52 | Z. Moreau 82/86 | C. Whitfield 74/78 | E. Tanaka 76/72 | G. Marchetti 70/52 | L. Batiste 70/80 |

Receivers are `skill/speed`. Skill shapes the catch, the drop and the broken tackle, and the man-coverage matchup (§2.4.4); speed shapes the route clock (§2.3.1) and his speed off the route: `recSpeed.base 7.2 + perSpeed 2.8 × speed/99` yd/s (44 → 8.4, 60 → 8.9, 70 → 9.2, 86 → 9.6). `opp.dl` / `opp.db` are the defenders' unit ratings: each defender's skill is drawn around his unit (DL → `dl`, LB → the mean of `dl` and `db`, CB / NB / S → `db`; gauss sd `field.defSkillSd` 4) and drives his speed, his reaction, his contact and catch-contest weight and his tackling. A `team.wr` given as a number (a skill level) builds five generic receivers from `demo.defaultRoster` (`WR1 +6/+8, WR2 0/+4, SLOT +2/0, TE −4/−14, RB −2/+6`); a missing team or opponent uses `demo.defaultTeam` (`AVERAGE`).

### 2.2 The pre-snap read (`Play.buildContext`)

#### 2.2.1 Coverages (`Data.plays.coverages`, in `Data.plays.order`)

| Id | Look: safeties · press · box · blitz tell | Can disguise as | `pressureMul` | What you see (`text`) |
|---|---|---|---|---|
| COVER2 | 2 · press · 7 · no | COVER4, MAN | 1.0 | Two high, corners pressed, seven in the box. |
| COVER3 | 1 · off · 8 · no | MAN, BLITZ | 1.0 | One high, corners off, eight in the box. |
| COVER4 | 2 · off · 6 · no | COVER2 | 0.9 | Two high and deep, corners off, six in the box. |
| MAN | 1 · press · 7 · no | COVER3, BLITZ | 1.1 | One high, everybody pressed, seven in the box. |
| BLITZ | 1 · press · 8 · **yes** | COVER3, MAN | 1.6 | One high, pressed, eight in the box and the nickel is creeping. |
| PREVENT | 2 · off · 5 · no | COVER4 | 0.7 | Two high and backing up, corners way off, five in the box. |

Each coverage also carries a `tell` (the coach's line for the look; e.g. COVER3 "Three deep and soft underneath. Take the curls all day.") and `roles`: what each of the eleven does when this is the REAL coverage (§2.3.3). The data still carries v1's `tightness` per route family; the field simulation does not read it. The context exposes the **shown** coverage's `look`, `name`, `text` and `tell`; `ctx.real` is never drawn before the snap.

**The real coverage** (1 child draw, `rng.weighted`): `coverage.base` `{COVER2 0.20, COVER3 0.30, COVER4 0.15, MAN 0.20, BLITZ 0.10, PREVENT 0.03}` × the situation's multipliers × `opp.tendency` (a `{coverageId: weight}` table, optional):

| Situation | Rule (`Tuning.qb.coverage`) | Multipliers |
|---|---|---|
| long | 3rd/4th down and `toGo ≥ longToGo` (7) | BLITZ ×1.8, COVER2 ×0.8, PREVENT ×0.6 |
| short | `toGo ≤ shortToGo` (2) | MAN ×1.3, BLITZ ×1.3, COVER4 ×0.5, PREVENT ×0 |
| red zone | `yl ≥ redZoneYl` (80) | COVER4 ×0.4, MAN ×1.4, COVER2 ×1.2, PREVENT ×0 |
| late | Q4+, `clock ≤ lateClock` (120 s) and the **defence leading** | PREVENT ×3.5, BLITZ ×0.6, COVER4 ×0.6 |

#### 2.2.2 The disguise

`pDisguise = read.disguise (0.55) × (1 − IQ/99 × read.iqSees (1.08))`; the alternative is `rng.pick(real.disguises)` (always drawn, used only on a disguise). IQ 20 → 43.0 %, 50 → 25.0 %, 52 → 23.8 %, 58 → 20.2 %, 74 → 10.6 %, 80 → 7.0 %, ≥ 92 → never. `ctx.disguised = shown !== real`. After the snap the defence holds the shown picture and blends into the real roles over `field.rotateS` 0.6 s; the scene announces a rotation (`ROTATION · COVER 4`).

#### 2.2.3 The cards (`ctx.options`)

- Count: `rng.int(read.options.min 2, max 3)`. On short yardage a run card replaces one: `SNEAK` at `toGo ≤ read.sneakToGo` (2), `DRAW` at `toGo ≤ read.drawToGo` (3), never both, next to `max(read.runCardsMin 2, n − 1)` pass cards.
- A GOOD-vs-real pass card is present with probability `read.goodOffered` (0.85): when the roll succeeds one GOOD play is drawn first, when it fails GOOD plays are excluded from the pool (so the rate is exact). The rest are weighted picks from the pool, then shuffled.
- Pool weights (`read.weights`, multiplied by tag; 0 removes a play): `toGo ≤ 3` → `short {SHORT_YDG ×2, QUICK ×1.5, DEEP ×0.4, PA ×0.5}`; `toGo ≥ 8` → `long {DEEP ×1.5, SCREEN ×1.3, SHORT_YDG ×0.6, QUICK ×0.8}`; a last play from at least 25 yards out → `lastPlay {DEEP ×2, QUICK ×0.4, SCREEN ×0.3, SHORT_YDG ×0.3}` instead of the short/long rule; within 20 yards of the goal → additionally `redZone {DEEP ×0.3, PA ×0.6}`.
- **Advice** (the chip the card SHOWS): the play's `vs` rating against the **real** coverage when `IQ ≥ read.iqExact` (80), else against the **shown** look, so a disguised blitz fools the card too. `ctx.adviceFrom` says which (`'REAL'` / `'SHOWN'`). `SNEAK` at `toGo ≤ 1` is always GOOD.
- **Sure**: under `iqExact`, a pass card whose rating differs among the coverages the shown look can be (the shown one and every coverage that disguises as it) carries `sure: false` with probability `1 − IQ/99` (the clarity roll, always drawn); the scene dims its chip with a `?` ("if the look is honest"). IQ 52 flags ≈ 47 % of the ambiguous cards, IQ 74 ≈ 25 %, ≥ 80 none.
- Each card: `{id, name, formation, routes: [{slot, route}], advice: 'GOOD'|'OK'|'BAD', sure, tags, run, line}`.

#### 2.2.4 The pocket, the ball, the reveal, the READ picture

- `pocket = Play.pocketTime(ol, dl, real, attrs, clutch)` (§2.3.5); `ctx.pressure.sackAt = clamp(pocket + gauss(0, pressure.sigma 0.7), min 1.5, max 4.2)` (2 draws); `hot = real === 'BLITZ' || sackAt < read.hotBelow (2.1)`; `clutch = Play.isClutch(sit)`.
- **Clutch** (`Play.isClutch`): Q4 or later, `clock ≤ pressure.clutchClock` (120 s) and the score within `pressure.clutchMargin` (8), or an explicit `situation.clutch`.
- `hash = rng.int(−1, 1)` (left hash / middle / right); `sign = ±1` (the strong side; formations and coverage landmarks are mirrored by it).
- `revealAt = max(0, read.revealBase 1.6 − IQ/99 × read.revealIq 1.2)` s: IQ 50 → 0.99, 52 → 0.97, 58 → 0.90, 74 → 0.70, 99 → 0.40. `clarity = IQ/99`.
- `ctx.field = Field.frame(yl, hash, venue)`: `{sideL, sideR, centerX, goalY: 100 − yl, endY: goalY + 10, losY: 0}`; the sidelines are `centerX ∓ field.halfWidth 26.667` with `centerX = −hash × field.hash[venue]` (HS / COLLEGE 6.667 yd, NFL 3.083). The ball on the left hash at college puts the right sideline 33.3 yd away and the left one 20 yd.
- `ctx.receivers` is the roster aligned in the SHOTGUN (`Field.alignReceivers`: the formation's split × `sign`, held `field.sideMargin` 3 yd inside a sideline; depths `align.wrY −0.8, slotY −1.2, teY −0.8, rbGun −5`).
- **`ctx.alignment`** (`Field.alignment`, 0 draws) is the pre-snap picture of the **shown** look, which the READ screen draws: the QB at (0, −5), the five receivers, five linemen at `x = (i − 2) × 1.9, y −0.6`, and the eleven defenders `[{id, x, y, pos}]` in `Data.plays.defenders` order (CB1 CB2 NB S1 S2 LB1 LB2 DL1–DL4). The rules (`field.align`; x strong-relative unless stated; everyone held 1 yd inside the sidelines): the four linemen at `x −5.2, −1.8, 1.8, 5.2`, `y 0.9`; the corners over WR1 / WR2 shaded 0.8 yd inside at `y 1.0` pressed, 7 off, 10 way off (a five-man box); the nickel walked into the apex (6.5, 4) when the box has two extra men (or one with two high safeties) or on a blitz tell (then creeping at `y 2`), else over the slot (1.5 pressed / 5 off); two high safeties at `centerX ∓ 10`, 13 deep (18 in a five-man box); one high: the free safety at `(centerX / 2, 14)` and the strong safety in the box at (4, 6) with an extra man, else rolled to (9, 9); the linebackers at `±2.5, 5` (LB1 plays 11 deep in a five-man box). The look's box count is exact: its box defenders stand inside `|x| ≤ 7, y ≤ 8`.

### 2.3 The snap (`Play.snap`)

#### 2.3.1 Routes and formations (`Data.plays.routes`, `Data.plays.formations`)

Waypoints `{t, x, y}` are timed for an average receiver (speed 50): `t` seconds, `x` lateral yards from the alignment (+ toward the receiver's sideline, − inside), `y` yards downfield. `window` is the base arrival window (s) in which the route is "there"; the engine uses it for the route's **key spot** (where he is at the window's middle, which the zone shading reads, §2.3.4), for the hot read (the smallest `window.open`) and for the checkdown fallback. The data still carries v1's `ideal` field; v2 does not read it.

| Route | Family | Depth | Path (t: x, y) | window |
|---|---|---|---|---|
| GO | DEEP | 20 | 0:0,0 · 1.0:0,6 · 2.0:0,14.5 · 3.0:0,23.5 · 4.0:0,32.5 | 3.3–4.0 |
| POST | DEEP | 12 | 0:0,0 · 1.6:0,12 · 2.6:−6,21 · 4.0:−12,32 | 3.0–3.9 |
| CORNER | DEEP | 12 | 0:0,0 · 1.6:0,12 · 2.6:6,20 · 4.0:12,30 | 2.9–3.8 |
| SEAM | DEEP | 15 | 0:0,0 · 1.2:−1,8 · 2.2:−2,16.5 · 3.2:−2,25 · 4.0:−2,32 | 2.9–3.85 |
| WHEEL | DEEP | 5 | 0:0,0 · 0.8:6,2 · 1.6:9,8 · 2.6:9,17 · 4.0:9,30 | 3.1–3.9 |
| FADE | DEEP | 8 | 0:0,0 · 1.0:3,7 · 2.0:5,15 · 3.0:5,23 · 4.0:5,30 | 1.7–2.8 |
| OUT | MID | 10 | 0:0,0 · 1.4:0,10 · 2.1:6,11 · 3.0:12,11 · 4.0:16,11 | 1.6–2.5 |
| IN ("Dig") | MID | 12 | 0:0,0 · 1.6:0,12 · 2.4:−6,13 · 3.4:−14,13 · 4.0:−18,13 | 2.0–3.0 |
| CURL | MID | 10 | 0:0,0 · 1.4:0,10 · 1.9:−1,8 · 4.0:−1,8 | 1.7–2.7 |
| COMEBACK | MID | 14 | 0:0,0 · 1.8:0,14 · 2.4:3,12 · 4.0:3,12 | 2.2–3.2 |
| SLANT | SHORT | 3 | 0:0,0 · 0.5:0,3 · 1.3:−6,8 · 2.2:−12,12 · 4.0:−22,18 | 1.1–2.0 |
| FLAT | SHORT | 1 | 0:0,0 · 0.7:4,2 · 1.5:9,3 · 4.0:18,4 | 1.0–2.2 |
| SCREEN | SHORT | −2 | 0:0,0 · 0.6:2,−2 · 1.2:5,−3 · 2.0:7,−3 · 4.0:9,4 | 1.3–2.4 |
| DRAG | SHORT | 4 | 0:0,0 · 0.6:0,4 · 1.8:−10,5 · 3.0:−20,6 · 4.0:−28,7 | 1.4–2.8 |
| CHECKDOWN | SHORT | 3 | 0:0,0 · 1.0:−1,1 · 1.8:2,4 · 3.0:4,5 · 4.0:8,6 | 1.6–3.4 |

**A receiver's path** (`sim.receivers[i].path`, absolute field yards): the route's waypoint times × the speed scale `route.speedBase 1.0 / (1.0 + route.speedPer 0.004 × (speed − 50))` (speed 38 → ×1.05, 70 → ×0.926, 86 → ×0.874, 99 → ×0.836) plus the snap's route-clock jitter `gauss(0, route.jitterSd 0.05)`; `x = x0 + side × route.x`; `y = route.y` plus his depth at the line fading out over `route.releaseT` 1.0 s — paid in time, not speed: no segment of a man who starts behind the line (the gun back) is faster than max(his route's fastest segment, his `recSpeed`), a faster one is stretched and the rest of the path shifts later (the gun back's wheel ≈ 0.1 s later); `y` capped at `capY = goalY + route.endZoneCap 10`; `x` held inside `[sideL + field.inbounds 0.6, sideR − 0.6]` when sampled. `Field.pathAt` interpolates piecewise-linearly and extrapolates along the last segment.

**Formations** (yards from the ball, + right; `ctx.sign` mirrors the whole set):

| | WR1 | WR2 | SLOT | TE | RB | QB |
|---|---|---|---|---|---|---|
| SHOTGUN | −22 | 22 | 12 | 5 | −3 | gun (−5) |
| TRIPS | −22 | 22 | 10 | 15 | −3 | gun |
| SINGLEBACK | −20 | 20 | 9 | 4 | 0 | under centre (−1.2), RB at −6 |
| I_FORM | −20 | 20 | −9 | 4 | 0 | under centre, RB at −6 |
| EMPTY | −24 | 24 | 14 | −12 | 8 | gun |

#### 2.3.2 Plays (`Data.plays.plays`)

| Id | Name | Formation | WR1 · WR2 · SLOT · TE · RB | Tags | vs C2 C3 C4 MAN BLITZ PREV | The card's line |
|---|---|---|---|---|---|---|
| FOUR_VERTS | FOUR VERTS | SHOTGUN | GO · GO · SEAM · SEAM · CHECKDOWN | DEEP | G B B O B B | Four go. Find the one the safety forgot. |
| SLANT_FLAT | SLANT-FLAT | SHOTGUN | SLANT · SLANT · FLAT · CHECKDOWN · FLAT | QUICK | O G G O G G | Three steps and gone. Beats a blitz every time. |
| SMASH | SMASH | SHOTGUN | CURL · CURL · CORNER · CORNER · CHECKDOWN | — | G O O O O B | Hitch under, corner over. Make the flat corner choose. |
| MESH | MESH | SHOTGUN | DRAG · CORNER · DRAG · OUT · WHEEL | QUICK | O O O G O O | Two crossers rub. Man coverage hates it. |
| CURL_FLAT | CURL-FLAT | SINGLEBACK | CURL · CURL · FLAT · SEAM · FLAT | QUICK | O G O B G O | Curl sits in the hole, flat pulls the corner. Soft zone food. |
| PA_POST | PA POST | I_FORM | POST · GO · IN · CHECKDOWN · FLAT | PA, DEEP | G O B G B B | Sell the run, throw the post. Needs time you may not have. |
| SCREEN | SCREEN | SHOTGUN | GO · GO · OUT · FLAT · SCREEN | SCREEN, QUICK | B O G B G G | Let them come. The back slips out behind the rush. |
| TE_SEAM | TE SEAM | SINGLEBACK | OUT · COMEBACK · FLAT · SEAM · CHECKDOWN | — | G O B O O B | The tight end splits the safeties. Two-high only. |
| STICK | STICK | TRIPS | CURL · SLANT · OUT · CURL · FLAT | QUICK, SHORT_YDG | O G G O G G | Stick, out, flat. Somebody is open by the second step. |
| DIG | DIG | SHOTGUN | IN · GO · CURL · CHECKDOWN · FLAT | — | O O G O B O | The dig runs under the quarters. Hold the safety with your eyes. |
| FADE | FADE | SHOTGUN | FADE · FADE · OUT · FLAT · CHECKDOWN | SHORT_YDG | B B O G G B | Back shoulder, high and outside. Only your guy can get it. |
| FLOOD | FLOOD | TRIPS | GO · COMEBACK · OUT · DRAG · WHEEL | — | O G O G B B | Three levels on one side. Whoever is uncovered, that is the read. |
| QUICK_OUTS | QUICK OUTS | EMPTY | OUT · OUT · SLANT · FLAT · CHECKDOWN | QUICK, SHORT_YDG | B G G O G G | Everybody out, ball out. Off coverage gives it to you. |
| SNEAK | QB SNEAK | SINGLEBACK | (run) | RUN, SHORT_YDG | O O O O O G | Get under the pile. A yard is a yard. |
| DRAW | DRAW | SHOTGUN | (run) | RUN, SHORT_YDG | O O G O G G | Show pass, hand it off. Blitzers run right past it. |

(G = GOOD, O = OK, B = BAD.) The route-thumbnail SVGs on the cards are drawn from these assignments (§4.5.4).

#### 2.3.3 The cast (`Field.setup`, called by `Play.snap`)

A pass play's sim carries everything the field needs, as JSON (§3.4.3):

- **Receivers**: the five, aligned per the play's formation, on their absolute paths (§2.3.1), each with his `key` spot, `hot` and `checkdown` flags. **Hot read**: under a real BLITZ the play's quickest route (the smallest base `window.open`) is `sim.hot`. **Checkdown**: the RB on a SHORT route, else the earliest SHORT route.
- **Defenders**: the eleven, starting at `ctx.alignment` (the shown look), with the **real** coverage's roles. Per defender: `skill = round(unit + gauss(0, 4))`, `speed = (defSpeed.base 7.6 + perSkill 2.6 × skill/99) × pos` (`pos {CB 1.0, NB 0.98, S 0.97, LB 0.9, DL 0.78}`: a 56-skill corner 9.1 yd/s, a nickel 8.9, a safety 8.8, a linebacker 8.2, a lineman 7.1), `reach` (the height his hands get to with a jump: `field.reach {CB 3.1, NB 3.1, S 3.1, LB 3.2, DL 3.3}` yd), `react` (his break on the ball: `react.base 0.42 + perSkill −0.22 × skill/99`, × `robber 0.6` / `spy 0.4` for those roles, × the fit (§2.3.4), + `gauss(0, react.sd 0.06)`, at least `react.min` 0.12 s: a 56-skill man 0.30 s), and for man coverage `trail` and `cushion` (§2.4.4).

The roles by coverage (`Data.plays.coverages[id].roles`; `Z(xs, y, r)` = a zone landmark `xs` yd strong-relative, `y` deep, radius `r`; F = measured from the field's centre, B = from the ball):

| | CB1 | CB2 | NB | S1 | S2 | LB1 | LB2 | DL1–DL4 |
|---|---|---|---|---|---|---|---|---|
| COVER2 | Z(−17, 5, 7) F | Z(17, 5, 7) F | Z(10, 10, 6) B | Z(−11, 20, 12) F | Z(11, 20, 12) F | Z(3, 10, 6) B | Z(−8, 10, 6) B | RUSH ×4 |
| COVER3 | Z(−18, 16, 9) F | Z(18, 16, 9) F | Z(14, 6, 7) F | Z(0, 18, 10) F | Z(5, 9, 6) B | Z(−4, 9, 6) B | Z(−14, 6, 7) F | RUSH ×4 |
| COVER4 | Z(−17, 16, 8) F | Z(17, 16, 8) F | Z(13, 6, 7) F | Z(−6, 17, 8) F | Z(6, 17, 8) F | Z(4, 8, 6) B | Z(−9, 7, 7) B | RUSH ×4 |
| MAN | man WR1 | man WR2 | man SLOT | Z(0, 17, 14) F | man TE | ROBBER (0, 8, 7) | man RB | RUSH ×4 |
| BLITZ | man WR1 | man WR2 | **RUSH** | Z(0, 17, 14) F | man SLOT | man TE | man RB | RUSH ×4 (five rush) |
| PREVENT | Z(−18, 20, 10) F | Z(18, 20, 10) F | Z(12, 9, 8) F | Z(−8, 27, 12) F | Z(8, 27, 12) F | Z(0, 14, 9) F | Z(−8, 8, 8) B | RUSH ×3 + DL4 SPY (0, 5, 6) |

A landmark is `x = fw × centerX + sign × xs`, `y = min(y, endY − 1.5)`, then shaded by the fit (§2.3.4), held 1 yd inside the sidelines and `1 ≤ y ≤ endY − 1`; a landmark 14 yd or deeper (`zone.deepY`) is a deep zone.

- **The rush**: `sim.sackAt = clamp(ctx.pressure.sackAt + gauss(0, pressure.snapSigma 0.10), 1.5, 4.2)`. The first rusher is a weighted pick among the RUSH roles (a lineman weight 1, a blitzer `rush.blitzFirst` 3); he beats his block at `beatAt = sackAt − rush.approach 0.42` (never before `rush.engageT` 0.3 s), and each later rusher `U(rush.gapMin 0.25, gapMax 0.6)` s after the one before (six gaps always drawn). `sim.rushers = [{defId, lane, beatAt, line: {x, y}, pocket: {x, y}}]` in beat order.
- **The QB**: `qbStart` (0, −5) in the gun (SHOTGUN / TRIPS / EMPTY) or (0, −1.2) under centre; the default drop to `y = field.qbDrop.depth −7` by `gunT 0.6` / `underT 1.1` s, + `paT 0.35` on a play-action play (`sim.qbDrop = {y, t}`).
- **The line**: five linemen at `x = (i − 2) × 1.9, y −0.6`; at the Live's start each blocks the nearest rusher within `rush.olReach` 4 yd laterally (greedy in beat order; a blitzer from the slot is nobody's man). Presentation only: whether a rusher is held is his `beatAt`.

#### 2.3.4 The call matters (`field.fit`)

`sim.fit` is the picked card's rating against the **real** coverage (`GOOD | OK | BAD`). It shapes the defence, with no hidden dice:

| Effect | GOOD | OK | BAD |
|---|---|---|---|
| man coverage's trail × (`fit.trail`) | 1.55 | 1.0 | 0.6 |
| a zone landmark moves this fraction toward (+) / away from (−) the play's nearest route key spot within `fit.keyR 1.6` × its radius (`fit.shade`; the checkdown is ignored) | −0.35 | 0 | +0.5 |
| the break on the ball × (`fit.react`) | 1.2 | 1.0 | 0.85 |

Measured (§2.14): the primary routes' median peak separation (the ghost curves, 0.5 s to min(3 s, sackAt), the checkdown excluded) is 6.98 yd on a GOOD call vs 5.15 on a BAD one (+1.82 yd over 400 contexts; the contract's target is +1.5–2.5, `play.test.js` pins 1.2–2.8).

#### 2.3.5 The sack clock (`Play.pocketTime`, `Tuning.qb.pressure`)

```
d      = olW 0.025 × (ol − 50) − dlW 0.025 × (dl − 50)
d      = d > 0 ? up 0.25 × tanh(d / 0.25) : −down 0.70 × tanh(−d / 0.70)      // a great line buys at most ≈ +0.25 s, a bad one loses at most ≈ −0.7 s
pocket = (base 2.6 + d + poiW 0.004 × (POI − 50)) ÷ coverage.pressureMul ^ mulExp 0.4      // BLITZ 1.6 → ×0.83 · PREVENT 0.7 → ×1.15
if clutch: pocket × (1 − clutchMul 0.30 × (1 − POI/99))
clamp [min 1.5, max 4.2]
ctx.pressure.sackAt = pocket + N(0, sigma 0.7) (buildContext, 2 draws) ; sim.sackAt = ctx.sackAt + N(0, snapSigma 0.10) (snap, 2 draws), both clamped
```

`sackAt` is when the first rusher gets home on a QB who stands at the top of his drop. It is not a timer: the rushers beat their blocks at their `beatAt` and then chase where the QB is (§2.4.5), so a QB who moves changes when (and whether) he is caught.

| The demo's presets (each against its own DL), POI 56 | COVER3 / COVER2 | COVER4 | MAN | BLITZ | PREVENT | clutch (COVER3) |
|---|---|---|---|---|---|---|
| BAD LINE (30 vs 78) | 1.97 | 2.05 | 1.89 | 1.63 | 2.27 | 1.71 |
| AVERAGE (58 vs 55) | 2.70 | 2.81 | 2.60 | 2.23 | 3.11 | 2.35 |
| GREAT LINE (80 vs 50) | 2.87 | 3.00 | 2.77 | 2.38 | 3.31 | 2.50 |

POI 60 (the FIELD GENERAL) adds 0.01–0.02 s; at POI 99 the clutch costs nothing (AVERAGE COVER3 clutch: 2.87).

#### 2.3.6 The ghost (the separation curves)

`Play.snap` ends by rehearsing the play on a private Live with no QB input and no rolls (`Field.ghost`, 0 draws): `field.ghostT` 4 s sampled every `sampleDt` 0.1 s. Each receiver gets `ghost = {sep: [41 samples], peak, peakAt, from, to}`: the peak is searched from `ghostFrom` 0.8 s on (the snap and the rotation are not a window), and `{from, to}` is the run of samples around it where the separation stays ≥ `feedback.plateau` 0.75 × the peak. The timing label reads it (§2.8); `Play.forcedResult` releases 0.8 s before `peakAt`.

### 2.4 The field simulation (`RTG.Field`)

#### 2.4.1 The frame and the clock

The Live (§3.4.4) holds 22 players and the ball in field yards. `live.step(dt)` advances `dt` sim seconds (clamped to `[0, field.maxStep 0.25]`; NaN or a non-number → 0) in fixed sub-steps of `field.dt` 1/60 s; the remainder carries to the next call (`live.rest`). Each sub-step, in order: the QB moves, the receivers move, the defenders move (and stop at the sidelines and the back line of the end zone: nobody plays out of bounds), the linemen move, the ball flies (or the carrier is checked), the QB is checked (sack, scramble, sideline, his own end line), the separations and the RUSH meter update, and at `field.maxT` 8 s a play that never resolved ends (§2.7.4). Movement primitives are allocation-free: kinematic placement along a path, `steer` (toward a point at up to `vmax`, accelerating at `field.accel` 21 yd/s², slowing into an arrival as `min(vmax, √(2 · a · brakeFrac 0.85 · d), arriveGain 3.2 × d)`), `track` (feed-forward: the target's velocity plus `arriveGain` × the error, so a steady tracker has no lag of its own), `pursue` (the earliest meeting point, at most `pursueLead` 1.2 s ahead) and `carry` (the ball carrier, §2.6.5).

#### 2.4.2 The QB

- **The default drop**: from `qbStart` straight back to `qbDrop.y` −7 by `qbDrop.t`, then he stands.
- **A drawn run** (`setRun`, §2.7.2): he follows the polyline from where he is at `Field.qbSpeed(MOB)` (accelerating from his current speed at `accel`), then brakes and stands at its end (he no longer drops). A new run replaces the old one. Heading back toward his own goal line is a backpedal: `× (1 − qbSpeed.back 0.45 × (backward share − backFree 0.25) / (1 − 0.25))` of the direction (straight back 55 %; a rollout that drifts back less than 1 yd in 4 is not slowed).
- **The scramble**: once past the line with the ball (§2.7.3) he follows what is left of his run, then carries the ball upfield like any carrier.
- **Sacked or tackled**: `qb.down`, he brakes to a stop.

#### 2.4.3 The receivers

Before the release every receiver runs his path exactly (the READ card's route). After a PASS release the target breaks toward the landing spot `field.targetReact` 0.15 s later, accelerating at `field.recAccel` 11 yd/s² and **pacing** himself to arrive with the ball (speed `min(his break speed, distance ÷ time left)`), so a ball led onto his route is caught in stride; the others keep running their routes. Off his route he keeps his feet `field.feetIn` 0.2 yd inside the sidelines and the end line (a ball over the sideline is a toe-tap catch within `catchR`, or nobody's). After a catch the carrier runs (§2.6.5) and the others drift to escort spots 3 yd beside and 2 yd ahead of him at 0.6 × their speed, inside the field (presentation: nobody blocks).

#### 2.4.4 Coverage behaviour

The defence starts at `ctx.alignment` and blends from those spots into its real roles over `rotateS` 0.6 s (the disguise's rotation). Then, per role:

- **MAN**: he tracks his receiver's position from `trail` seconds ago (a 90-sample history), `cushion` yards deeper and `man.inside` 0.7 yd inside him. `trail = man.trail 0.16 × fit.trail × clamp(1 + man.edgeW 1.4 × (rec skill − def skill)/99, 0.4, 2)`, clamped `[minTrail 0.06, maxTrail 0.6]` s: an even matchup trails 0.25 s on a GOOD call, 0.16 on OK, 0.10 on BAD; D. Cross (66) vs a 56 corner on OK 0.18; Z. Moreau (82) vs a 52 corner 0.23. `cushion = man.press 0.4` yd when the REAL coverage presses, else `man.off 1.8`.
- **ZONE**: he finds the nearest receiver within his zone's radius of his landmark and moves toward him by `zone.shade` 0.72 (with the receiver's velocity × 0.72 fed forward); a deep zone keeps `zone.deepCushion` 2.2 yd over the threat. With nobody in the zone he sits on the landmark.
- **ROBBER**: a zone that shades `zone.robberShade` 0.9; his reaction time is × `react.robber` 0.6.
- **SPY**: mirrors the QB's `x` at the landmark's depth (PREVENT's DL4); his reaction time is × `react.spy` 0.4.
- **RUSH**: §2.4.5.
- **The ball in the air** (a PASS; a throw-away is nobody's ball and they play on): from `release + react` each defender (not a held rusher) jumps the lane if he can: the first point of the remaining path (sampled every `laneStep` 1.5 yd, the last `catchZone` 2.5 yd excluded) within `laneR` 1.5 yd of him, under his reach, that he reaches before the ball; otherwise he runs to the landing spot (held 0.5 yd inside the field), slowing into it only as late as his braking allows (`breakGain` 12). Man defenders and deep zones run with their backs to the ball until they react (`backTurned`: the blind factors in §2.6.3); underneath zones, the spy and the rush face the QB.
- **After a catch / on a scramble**: §2.6.5, §2.7.3.

#### 2.4.5 The rush and the line

A rusher is **held** until his `beatAt` — or until the QB runs away from the pocket, `rush.leash` 4 yd deeper than the rusher's pocket spot (1.4 yd behind the drop; depth only, so a rollout across keeps its benefit): from `rush.engageT` 0.3 s he is pushed from his spot at the line (`y 0.3`) toward his pocket spot (`x × rush.converge 0.45`, `y = drop + pocketGap 2.6`), arriving there at `beatAt` (`defenders[i].blocked` is true meanwhile). Free, he pursues the QB where he **is** (an intercept course), so a rollout away from the first free rusher buys time (measured: the mean end of a play moves from 2.75 s standing in the pocket to 4.24 s rolling 12 yd away from him). After the release the free rushers close to a spot 0.9 yd (`olGap`) in front of the QB. Each blocker moves toward the spot `rush.olGap` 0.9 yd between his rusher and the QB while the rusher is held; an unblocked lineman eases (`olSettle` 2/s) to his home `x × olNarrow 0.85`, `y = drop + pocketBack 3.0`; nobody on the line moves faster than `rush.olSpeed` 8 yd/s (no pop at the snap). Measured, running straight back 13 yd buys 0.45 s over standing (median end 2.98 s vs 2.53) and 10 yd across, 1 back buys ≈ 1 s (3.50 s). On a scramble the held rushers are released at their chase time. The contact rules (the sack, the escape) are §2.7.1.

#### 2.4.6 Separation, the rings, the RUSH meter

- `receivers[i].sep` = yards to the nearest defender who is not rushing; `open = clamp((sep − openSep.lo 1.0) / (openSep.hi 4.6 − 1.0), 0, 1)`; `shown = t ≥ revealAt`.
- The scene's ring (§4.5.6): green at `open ≥ open.ring.open` 0.60 (≈ 3.2 yd of room), gold at `≥ closing` 0.25 (≈ 1.9 yd), red below. The ring is **separation now**, the engine's own number, not a promise about the arrival; the preview (§2.5.4) is the promise.
- `live.pressure` (the RUSH meter): the nearest rusher's (or spy's) closeness `clamp(1 − (d − tackleR 1.25) / pressR 4, 0, 1)`, × `heldPressure` 0.5 while he is still blocked; 0 once the QB has released the ball. The same number is the release's `pressure` in the scatter (§2.6.2).

### 2.5 The drawn line

#### 2.5.1 What a line is (`live.classify(points, loft)`)

`classify` is pure (0 draws, the Live untouched) and cheap (measured 3–14 µs for a 60-point line; the budget is 0.3 ms). The points are cleaned (`Field.clean`: finite numbers clamped to ±1000 yd, consecutive duplicates dropped, thinned to `draw.maxPoints` 600); the loft is clamped to 0..1 (a non-number → 0.5). In order:

1. **INVALID** when the play is over, the ball is gone or the QB is down (`reason` "the play is over" / "the ball is gone"); when fewer than two points remain ("too short"); when the first point is farther than `draw.startR` 2.5 yd from the QB ("start at the quarterback"); when the line (its first point replaced by the QB) is shorter than `draw.minLen` 2 yd ("too short").
2. **RUN** when passing is no longer legal but the QB carries the ball: past the line (`y > 0`) or in a SCRAMBLE. Every legal line is then his run.
3. **THROWAWAY** when the ball dies out of bounds — the line's end, or the arm's end on a line longer than `maxLen` — beyond a sideline or the end line, whoever might run there (a line never makes a catch out of bounds); its points are cut at `maxLen`.
4. The race: the ball's flight is the line's arc length ÷ `Field.ballSpeed(ARM, loft)`; each receiver's **margin** is how early he can be at the line's end: the better of (a) running there straight from where his route has him `targetReact` after the release, paying for the cut (the velocity he has to change ÷ `2 × recAccel`), arriving within `catchR` 1.3 yd, and (b) his route taking him within `catchR` of it by the arrival. The receiver with the best margin is the candidate.
5. **PASS** when that margin is ≥ −`draw.reachSlack` 0.2 s: `target` = him; a line longer than the arm's `maxLen` is cut there (`tooLong`, and the race is re-run at the real end); `preview` = the race colour (§2.5.4); `margin` = the smaller of his margin and the ball's lead on the first defender who can contest the spot.
6. **A TOO LONG THROWAWAY** when only the untruncated end is out of bounds (the arm cannot get it there): `tooLong`, the chip reads TOO LONG; thrown, it is a ball to nobody that dies where the arm gives out (a PASS, never THROWN AWAY).
7. **An early PASS** (drawn too fast, D37): a line (not too long) ending ≥ `draw.earlyDepth` 6 yd past the line of scrimmage on a receiver's route AHEAD of him — his route within `catchR` of its end within `draw.earlyS` 2 s after the ball lands (checked every `earlyStep` 0.1 s) — is a PASS to him with `early: true`, `preview` RED and `margin` = −(his lateness). The chip reads `PASS → WR1 · TOO FAST`.
8. **RUN** otherwise: the line is where the QB will run (it may cross the line of scrimmage: that is the scramble; a scramble line ending short of `earlyDepth` is never an early pass).

The result: `{kind, target, points (the line from the QB; cut for a PASS / THROWAWAY), length, maxLen, tooLong, preview, previewShown, margin, early, reason}`.

#### 2.5.2 Loft from the draw speed

The scene measures a stroke's average speed in canvas-heights per second (the stroke's css length ÷ the canvas' css height ÷ the seconds from the first sample 4 css px from the press to the last sample, at least 0.03 s) and maps it with `Field.loftFor(hps)`: `≥ draw.loft.fastHps 1.3` → 0 (a bullet), `≤ slowHps 0.35` → 1 (a lob), linear between (1.1 → 0.21, 0.9 → 0.42, 0.6 → 0.74). So a stroke faster than ≈ 0.99 heights/s is a BULLET and one slower than ≈ 0.66 a LOB (`feedback.bullet` 0.33 / `lob` 0.67): on a 390-px phone (a 640-px canvas) a 12-yd line (≈ 226 css px) drawn in ≤ 0.36 s is a bullet and in ≥ 0.53 s a lob, a 5-yd one (≈ 140 px) ≤ 0.25 s / ≥ 0.4 s — an aimed thumb stroke (0.3–0.5 s) is a bullet or a touch pass, a lob a deliberately slow one. The keyboard's L cycles BULLET 0 / TOUCH 0.5 / LOB 1 (TOUCH first).

#### 2.5.3 The arm's max length

A line longer than `Field.maxLen(ARM)` (46.7 yd at ARM 55, 51.8 at 72, 60 at 99) is truncated there: the ball dies at the arm's end (`tooLong`). The draft shows the part past `maxLen` in red and the chip reads TOO LONG; the coach says "Coach saw you throw it further than your arm goes. Know your range."

#### 2.5.4 The preview and the IQ gate

The preview is the PASS line's race at its landing spot, computed by extrapolating current velocities (0 draws):

- For each defender who is not held: his position after his `react` along his current velocity; `contestAt` = the earliest time any of them can be within `contestR` 2.0 yd of the spot, `firstDef` = the earliest within `catchR` 1.3.
- Along the path (4–32 samples; in the last `catchZone` 2.5 yd only the men not at the catch point — farther than `catchR` from the end — count, as in the engine's contact, §2.6.3), at the ball's height there: any defender whose reach is above the ball and who is (extrapolated) within `reachR 0.9 + draw.previewPad 0.3` yd of it is a **risk**; a risk with the ball at least `draw.previewLowBand` 0.5 yd under his reach (and not a held rusher) is **low**.
- **RED**: a defender is first to the spot (`firstDef` before the target), or the line runs through a defender's reach low, or the target is more than 0.05 s late (`draw.redReach`).
- **GREEN**: the ball beats the first contester by ≥ `draw.greenMargin` 0.3 s, the target is there ≥ `draw.greenReach` 0.1 s early, the path is clear of every reach, and the ball is neither too hot to handle nor ahead of his break (the `catch.heat` + `catch.early` terms < `draw.previewHot` 0.1, §2.6.4).
- **GOLD** otherwise.

`previewShown = IQ ≥ draw.previewIq` 70 (the FIELD GENERAL's perk). Everyone else still sees PASS / RUN and the target, not the colour. Measured honesty (§2.14): GREEN lines complete 90.2 % and are never picked, GOLD 75.9 % / 1.2 %, RED 45.4 % / 7.0 %.

#### 2.5.5 Aim assist (`settings.aimAssist`, default on)

For a finger's line only: when the draft is a PASS and its end is within `draw.assistYd` 3.5 yd of the spot its target can reach (a straight-ish line, stretch < 1.04: `live.aim(target, loft)`; a bent line: the scene's fixed point of his route and the ball's flight over the line's stretch), the line's tail is shifted onto that spot (the shift grows linearly with arc length, so the start stays on the QB). The snapped line is kept only if it still classifies as a PASS to the same target; the landing marker then shows a small magnet tick and the chip carries `data-assist="1"`. A click cue marks the first snap.

#### 2.5.6 Slow motion and its budget

While a draft exists (a finger down, or a keyboard draft being composed) the scene steps the Live at `timeScale = draw.slowMo` 0.15 (the defence and the rush keep creeping), until `draw.slowMoBudgetS` 4 s of **real** time have been spent in slow motion on this play; then `timeScale` returns to 1.0 even while drawing and the SLOW-MO chip reads SLOW-MO OUT. The budget resets per play. While slow the stage shows letterbox bands (ink at 0.55 with a gold rule, top and bottom), the canvas is desaturated (`filter: saturate(0.5) contrast(1.05)`, not under high contrast; neither under reduced motion, which keeps the chip and the time scale) and the SLOW-MO chip shows a bar of the budget left; every actor is drawn at `x + vx × live.rest` so the play moves every frame, not in 1/60-s sim hops (D40). Under a modal (Settings) the time scale is 0 and a finger's draft is dropped. On the drive's first moment, until the player has drawn once, the time scale is 0 from the snap until the first touch, key or THROW AWAY (D39).

### 2.6 The ball

#### 2.6.1 The release: speed, flight, height

`throwAlong(points, loft)` releases at once (legal only in PRE_THROW with the QB behind the line; otherwise `{ok: false, reason}`). The ball flies the committed line (after scatter, §2.6.2) at `Field.ballSpeed(ARM, loft)`; `flight = length ÷ speed`; its height at `u` (0..1 along the path) is `h(u) = height.release 2.0 + (height.catch 1.6 − 2.0) × u + 4 × apex × u × (1 − u)` with `apex = max(height.apexMin 0.15, height.gravity 10.7 × flight² / 8) × (1 + height.lift 0.8 × loft)` over the chord. Worked (ARM 55):

| Line | Bullet (loft 0): flight · peak height | Touch (0.5) | Lob (1) |
|---|---|---|---|
| 5 yd | 0.19 s · 2.0 yd | 0.24 s · 2.0 | 0.36 s · 2.1 |
| 10 yd | 0.37 s · 2.0 | 0.49 s · 2.3 | 0.72 s · 3.0 |
| 15 yd | 0.56 s · 2.2 | 0.73 s · 2.8 | 1.07 s · 4.6 |
| 20 yd | 0.74 s · 2.5 | 0.98 s · 3.6 | 1.43 s · 6.7 |
| 30 yd | 1.12 s · 3.5 | 1.47 s · 5.8 | 2.15 s · 12.9 |
| 45 yd | 1.67 s · 5.6 | 2.20 s · 10.9 | 3.22 s · 26.7 |

A linebacker's hands reach 3.2 yd: a bullet passes a linebacker in the middle of a short line at chest height, a 15-yd lob sails 1.4 yd over him. ARM 72: a 30-yd bullet 1.01 s (a lob 1.95 s). The ball's `landing` is the flown path's end; `arriveT = releaseT + length ÷ speed`. At the release every defender's `ballAt = release + react` and the target's break is set (§2.4.3).

#### 2.6.2 Scatter

A PASS release draws `eLat = gauss(0, sd)` and `eLen = gauss(0, sd × scatter.lenMul 1.25)` (4 child draws; a throw-away draws none) with

```
sd = (scatter.base 0.4 + perYd 0.032 × length) × (1 − perAcc 0.8 × ACC/99) × (1 + pressure 0.8 × p + running 0.7 × r) + weather 6 × wx
p  = live.pressure at the release (§2.4.6)
r  = clamp((|QB velocity| − setV 2.5) / (qbSpeed − 2.5), 0, 1)      // a drifting QB is set; a sprinting one is throwing on the run
wx = the weather penalty (§2.13)
```

The flown path is the drawn line displaced along the chord's normal by `eLat × (arc fraction)` (the error grows along the path) and lengthened or cut by `eLen` (never shorter than `min(length, scatter.minYd 1)`, never past `maxLen`). Worked sd (yd): a set 15-yd line 0.50 at ACC 54, 0.47 at 58, 0.37 at 72; a set 30-yd line 0.77 / 0.72 / 0.57; the same 30-yd line under full pressure 1.38 / 1.30 / 1.02, on the full run 1.30 / 1.23 / 0.97. The release's `{x, y, pressure, running, sd}` is in the result.

#### 2.6.3 Contact in flight: the tip and the pick

Each defender gets **one contact roll per throw**, the first time the ball passes within `reachR` 0.9 yd of him while it is under his reach: the closest approach is tracked and the roll comes as the ball pulls away. In the last `catchZone` 2.5 yd of the flight only a man AT the catch point (within `catchR` of the landing) hands his roll to the catch contest; anyone else in the lane keeps it, and on the landing sub-step every approach still pending is rolled before the catch (D35: a linebacker on the lane 1.8–3 yd in front of the receiver is got like one 4 yd out).

```
pTouch = (tip.base 0.42 + perSkill 0.3 × skill/99) × (tip.near 0.4 + 0.6 × closeness) × clamp((reach − h) / tip.hBand 0.6, tip.hMin 0.1, 1)
         × (tip.blind 0.45 before his react, back turned) × (tip.held 0.08 for a rusher still engaged), at most tip.max 0.85
         closeness = 1 − (closest distance ÷ reachR)
on a touch: pPick = int.touch 0.5 × (int.high 0.35 when the ball was above chest height, h > reach − int.chest 0.7)
                    × (int.blind 0.4 before his react) × (0.6 + 0.4 × skill/99) × (int.held 0.3 engaged)
            a pick → INT (ended 'FLIGHT'); else TIPPED → INCOMPLETE (ended 'TIPPED')
```

A 56-skill linebacker dead on the lane at chest height (h 2.0): a hand on it 59 %, then a pick 41 % of those (≈ 24 % INT, ≈ 35 % tipped); with the ball at 2.9 yd, 30 % and 15 %; an engaged lineman dead on 5 %. Measured in the lab (a 20-yd line to a receiver sitting at the end, a linebacker 55 % of the way along it, ACC 55, 1000 throws a loft): a bullet is tipped 41.2 % and picked 10.5 %, a touch pass (0.5) is got 1.0 %, a lob (0.75 or 0.9) 0.2–1.1 %.

#### 2.6.4 The catch contest at the landing spot

At the end of the flight the ball is at the landing spot:

- The **catcher** is the receiver nearest the spot (ties go to the target). A catcher standing out of bounds (on or past a sideline, past the end line) makes no catch: INCOMPLETE, ended `OUT_OF_BOUNDS`, no roll (with `feetIn` it is a safety net); nor does a defender out of bounds pick it (no pick roll). Each defender within `contestR` 2.0 yd contests: `c = (1 − d/contestR) × (0.5 + 0.5 × skill/99) × (tip.blind 0.45 before his react) × (catch.first 1.3 when he is closer than the catcher) × (0.08 engaged)`, summed.
- **The catcher within `catchR` 1.3 yd** → the catch roll `pCatch = clamp(catch.base 0.95 + perSkill 0.08 × skill/99 − reachPen 0.35 × (miss/catchR)² − contest 0.40 × Σc − hot − early, min 0.05, max 0.98)`, with `hot = catch.heat 0.3 × clamp(1 − flight/heatT 0.5) × clamp(1 − loft/heatLoft 0.5)` (a flat ball over a short flight is too hot to handle: a 5-yd bullet −0.19, a touch pass 0) and `early = catch.early 0.35 × clamp((open − arrival) / earlyT 0.8, 0, 1)`, `open` = when his route's window opens on his clock (`Field.routeOpen`: the key spot's time less half the window; a GO ≈ 3 s, a SLANT ≈ 1 s): a ball that beats the break finds a man not looking yet (D36). A skill-60 receiver: clean 98 %, half a radius off 91 %, at the edge of his radius 65 %, with a 56 defender contesting 1 yd away 84 %, a 5-yd bullet 81 %. Caught → the drop roll `pDrop = drop.base 0.05 × (1 − skill/99) + drop.contest 0.08 × Σc` (skill 44 → 2.8 %, 60 → 2.0 %, 82 → 0.9 % uncontested) → CATCH or DROP. Not caught → with a contester, the pick roll `int.contest 0.1 × (the top contest)` → INT (ended 'CONTEST'), else INCOMPLETE (ended 'MISSED').
- **No receiver within catchR, a defender within catchR** → the pick roll `int.alone 0.8 × (1 − d/catchR) × (0.6 + 0.4 × skill/99)` (a 56 defender half a radius off: 33 %) → INT (ended 'ALONE'), else INCOMPLETE (ended 'NOBODY').
- **Nobody** → INCOMPLETE (ended 'NOBODY').

#### 2.6.5 After the catch: YAC and tackles

After a catch the phase is AFTER_CATCH and the catcher is the carrier: he runs at `recSpeed × carry.speedMul 0.86` (× `pauseMul 0.5` for the first `pause` 0.3 s: secure it, turn upfield), steering at a point `evade.look` 5 yd ahead, upfield (at least `minUp` 0.35 of it), bending away from defenders within `evade.r` 6 yd (weight 0.6 laterally, × 0.3 along the field) and off a sideline within 3 yd. Every defender pursues from `catch + chase 0.25` s (or his own `react` if he had not yet broken on the ball) at `pursueBurst` 1.1 × his speed. Each sub-step, in order: the goal line → TD; a sideline → OUT_OF_BOUNDS; then each defender (not engaged, not shed) within `tackleR` 1.25 yd → the broken-tackle roll `pB = clamp(tackle.base 0.04 + perSkill 0.14 × skill/99 + perSpeed 0.1 × speed/99 − defSkill 0.14 × def skill/99, min 0.03, max 0.5)` (D. Cross 66/70 vs a 56 tackler: 12.5 %); broken → that defender is shed for `shedS` 0.6 s at `shedSlow` 0.35 × his speed (BROKEN_TACKLE), else TACKLE. `airYards` = the catch spot's `y` (clamped to the field), `yards` = where he goes down, `yac = yards − airYards`.

#### 2.6.6 The throw-away

`live.throwAway()` (the THROW AWAY button, the X key) releases now along the engine's own line: from the QB to `field.away.out` 3 yd past the **nearer** sideline, `away.depth` 10 yd downfield of the QB (never short of `y = away.minY` 2), at loft `away.loft` 0.3. A drawn line that classifies as THROWAWAY flies as drawn (D22) — unless it is a TOO LONG one whose ball would die in the field (§2.5.1): that flies as a PASS to nobody. A throw-away draws nothing, lands out of bounds and ends THROWAWAY: 0 yards, never a turnover; no defender breaks on it. Legal when a pass is, and when it lands before `maxT`.

### 2.7 Running

#### 2.7.1 Sacks and escapes

While the QB holds the ball behind the line, any defender who is not held and not shed within `tackleR` 1.25 yd of him → the escape roll `P = clamp(sack.base −0.06 + perMob 0.42 × MOB/99, 0, sack.max 0.6)`: MOB 50 → 15.2 %, 52 → 16.1 %, 55 → 17.3 %, 72 → 24.5 %, 99 → 36.0 %. Escaped → that defender is shed for `shedS` 0.6 s (ESCAPE, `qb.escaped++`); caught → SACK (`qb.down`, yards = where he went down, `round(qb.y)`: about −7 at the top of the drop). Held rushers are released early when he runs away from the pocket (`rush.leash`, §2.4.5). Measured, a QB who never throws escapes 0.18 sacks a play at MOB 50, 0.21 at 55, 0.32 at 72, 0.54 at 99.

#### 2.7.2 The drawn run

A RUN line committed (`live.setRun(points)`): the QB runs it from where he is (a first point within `startR` is replaced by him; a farther one, he runs to it first) at `Field.qbSpeed(MOB)`; a new run replaces the old; legal while he has the ball (PRE_THROW or SCRAMBLE). A run behind the line keeps every option open (the pass after a rollout is thrown on the run, §2.6.2). The scene draws what is left of it as faint footprints ahead of him (§4.5.5).

#### 2.7.3 The scramble

The QB crossing the line (`y > 0`) with the ball in PRE_THROW → SCRAMBLE (the event; `carrier` = 'QB'; no more passing; every legal line is now a RUN). Every defender pursues from `react × react.manScramble 1.3` (a man defender has his back to the QB) or `× react.scramble 0.15` (everyone else faces him); held rushers are released then. The QB follows what is left of his run, then carries the ball upfield (§2.6.5's `carry`); the tackle rules are the catch's with MOB as his skill and speed (MOB 72 vs a 56 tackler: 13.5 % to break it). The QB running out of bounds behind the line — a sideline, or his own end line (`goalY − 100 − endZone`) — ends it SCRAMBLE / OUT_OF_BOUNDS for a loss, never a sack; a carrier crossing his own end line is out of bounds too.

#### 2.7.4 The clock

`field.maxT` 8 s ends a play that never resolves: in the air → INCOMPLETE (with the INCOMPLETE event; a throw-away is still THROWAWAY), after a catch → CATCH where he is, on a scramble → SCRAMBLE where he is, a QB who still holds it → SACK by the nearest defender (the SACK event names him; ended 'TIMEOUT'). A pass or a throw-away that could not land before `maxT` (its flight estimated from the line × 1.25 + 1 yd) is refused (`{ok: false, reason: 'too late'}`). Measured, the pocket always folds long before (§2.14).

#### 2.7.5 After the whistle

After DONE, `step` keeps moving the players for presentation only (no rolls, no events): an interceptor runs the ball back for `intReturnS` 0.9 s, a tipped ball pops (`h = popH 2.2 + popV 3.2 u − popG 9 u²`), a dead ball falls at `fallV` 6 yd/s, everybody else slows to a stop.

### 2.8 The result and the feedback

`live.result()` is null until DONE, then the same PlayResult object on every call (§3.4.6). `kind` is PASS / THROWAWAY (a ball was released) or SACK / SCRAMBLE (none was). `td = (CATCH or SCRAMBLE) and the TD event` (the carrier reached the goal line); `firstDown = (CATCH or SCRAMBLE) and (td or yards ≥ toGo)`; `turnover = outcome === 'INT'`; `fumble` is always false in v2. Yards are integers: a gain is floored and a loss rounded (a man down 0.4 yd short of the goal line or the sticks did not get there, D33), clamped to −(yl − 1) .. `goal − 1` (the goal line only with a TD); the air yards the same way.

`text`: `CATCH +14` · `INCOMPLETE` · `TIPPED` (an incompletion off a hand) · `INTERCEPTED` · `SACKED -7` · `DROPPED` · `THROWN AWAY` · `SCRAMBLE +6`. `banner`: `TOUCHDOWN!` > `FIRST DOWN` > the text, except on a last play (`situation.lastPlay`), where a first down that does not score loses the game: the banner is the text.

**`feedback`** (`Tuning.qb.feedback`):
- **timing**: a SACK is TOO LATE; a throw-away is ON TIME when released before the first rusher's `beatAt`, else LATE; a pass to a target compares its **arrival** with his ghost curve (§2.3.6): ON TIME when his separation at the arrival was ≥ `plateau` 0.75 × the peak, else EARLY (arrival more than `early` 0.15 s before the plateau), ON TIME (within `late` 0.15 s after it), LATE (within `tooLate` 0.8 s), TOO LATE.
- **touch**: BULLET (loft < `bullet` 0.33), LOB (≥ `lob` 0.67), else TOUCH.
- **placement** (a pass only; `—` otherwise): TIPPED; INTO COVERAGE (an INT, or the nearest defender was closer to the spot than the target and within `contestR`, or no target); the target got there (within `catchR`): ON THE MONEY within `money` 1.5 yd of where his route had him at the arrival, else LED HIM / BEHIND HIM by the component along his run; he did not: OVERTHROWN / UNDERTHROWN on a vertical route, LED HIM / BEHIND HIM on a crossing one.
- **coachSaw**: one sentence in the kicker's voice per outcome and cause: a TD ("Coach saw the end zone. So did everybody else."), a first down with ≥ 8 YAC, a late or short catch, a drop "on <name>", a pick in flight ("…throw it right through him. Get it over the linebacker or around him." / off a lineman's hands), a late pick, a disguised look ("They showed COVER 3 and played MAN. The look lied and you bought it."), a forced pick ("That is not a window, that is a wish."), the sack (the blitz, running into the rush "Run away from the man who beat his block.", holding it forever), the throw-away, the scramble (a TD, out of room, the sticks, a tuck, running backwards), and for an incompletion: tipped ("Loft it over the underneath guy." / batted at the line), too long ("Know your range."), to nobody, the rush in his face, throwing on the run, the weather, overthrown, underthrown ("Draw it longer."), into coverage, early, late, a short bullet ("Take a little off it."), just a miss.

### 2.9 A worked snap

Seed 4242, FIELD GENERAL, AVERAGE, COLLEGE, moment 1: **3rd & 5 at OWN 41**, Q1 7:03, 0–3, clear, wind 13.6 mph, 41 °F. The real coverage is **BLITZ** and the look is honest (shown BLITZ, advice from the shown look: IQ 74 < 80). The ball is on the left hash, strong right: `ctx.field` = sidelines −20 / +33.3, goal line 59 yd downfield. `ctx.pressure`: pocket 2.25 s, `sackAt` 3.40, hot. The rings show from 0.70 s. The cards: `PA_POST = BAD? · FOUR_VERTS = BAD? · MESH = OK?` (every advice dimmed: each rates differently against what a blitz look can hide).

Snapping **MESH** (OK vs BLITZ): `sackAt` 3.25; the nickel is the first free rusher at 2.83 s, then DL1 3.12, DL2 3.62, DL3 4.01, DL4 4.55; man across (CB1 on WR1 with a 0.19-s trail and a 0.4-yd cushion), the free safety in the deep middle. The QB drops from −5 to −7 by 0.6 s. Ghost peaks: WR1 DRAG (the hot read) 3.4 yd at 1.7 s; SLOT DRAG 5.0 yd at 1.6 s (plateau 1.3–2.1); WR2 CORNER 3.4 yd at 2.5 s; TE OUT 3.1 at 2.7 s; RB WHEEL 5.4 at 4 s.

At 1.2 s (pressure 0) the rings: SLOT 3.5 yd (green), WR1 2.4 (gold), RB 1.8 (red), WR2 1.3 (red), TE 0.8 (red). `live.aim` + `classify` for a straight line to each man: the SLOT bullet to (3.0, 4.9), 12.3 yd, flight 0.46 s, **PASS → SLOT, GOLD**, margin +0.15 s; WR1's touch pass GOLD; the TE's lines RED; WR2's lob TOO LONG. A line from the QB 6 yd to the right is a RUN; a line to 3 yd past the right sideline is a THROWAWAY. The SLOT bullet (drawn fast): scatter sd 0.55 yd (ACC 58, set, the wind's 0.12), the flown path 11.75 yd at 26.9 yd/s, caught at 1.65 s at the spot's 0.4 yd, tackled by S2 at 2.35 s 6.x yd downfield: **CATCH +6, FIRST DOWN** (the spot is floored, D33), AIR 4 · YAC 2, feedback `ON THE MONEY · ON TIME · BULLET`, "Coach saw you move the sticks. Clean." The events: `0 SNAP · 1.2 RELEASE · 1.65 CATCH SLOT · 2.35 TACKLE S2`; the plan: `{runs: [], pass: {t: 1.2, points: [QB, (3.03, 4.90)], loft: 0}, away: null}`.

### 2.10 The run cards (resolved inside `Play.snap`; the sim IS the result)

- **SNEAK** (3 draws): `p = clamp(base 0.70 − perYd 0.15 × (toGo − 1) + lineW 0.25 × (ol − dl)/99 + boxPer −0.04 × (box − boxAnchor 7), 0.1, 0.95)`: AVERAGE 3rd & 1 vs a 7-man box → 70.8 %; & 2 → 55.8 %; BAD vs 8 → 53.9 %; GREAT vs 6 → 81.6 %. Success → `toGo + int(0, 1)` yards; failure → `int(−1, 0)`. Text `'SNEAK +1'` / `'STUFFED'`.
- **DRAW** (4 draws): `yards = round(N(mean 2.5 + lineW 4 × (ol − dl)/99 + look[real], sd 4))` with `look = {BLITZ 3, PREVENT 2, COVER4 1, MAN 0, COVER2 0, COVER3 0}`, a `breakP 0.06` break adding `int(breakMin 10, breakMax 25)`, clamped `[−3, 40]`. Text `'DRAW +5'` / `'STUFFED'`.
- Both return `{run: true, playId, play, kind: 'RUN', outcome: 'RUN', target: null, yards, airYards: 0, yac: 0, td, firstDown, turnover: false, fumble: false, big, t: 0, loft: 0, length: 0, flight: 0, arrive: null, landing {0, yards}, text, banner, feedback: {timing 'ON TIME', touch 'TOUCH', placement '—', coachSaw}, receivers: [], defenders: [], rushers: [], sackAt: null, revealAt: null, hot: null, checkdown: null, ctx}`. `Play.live` on a run sim spends its fork and returns a finished Live whose `result()` is the sim; `Play.resolve` returns the sim.

### 2.11 The drive script (`Play.driveScript`) and the story between moments

One fork, then 25 draws in a fixed order (`Tuning.qb.drive`):

| # | Kind | Q | Down | toGo | yl | Clock (s) | Score (us–them) | Stakes copy |
|---|---|---|---|---|---|---|---|---|
| 0 | THIRD_MEDIUM | 1 | 3 | 4–6 | 25–45 | 300–800 | 0 – `openingLead` (one of 0, 3, 7) | `3RD & 5 — keep the drive alive` |
| 1 | THIRD_LONG | 2 | 3 | 8–12 | 20–40 | 200–700 | 7 – 7 + 3..7 | `3RD & 9 — a long way to the sticks` |
| 2 | RED_ZONE | 3 | 2–3 | 5–9 | 82–90 | 300–800 | 10 – 10 + 3..7 | `2ND & 7 at the 17 — points here` |
| 3 | SHORT_YARDAGE | 4 | 3–4 | 1–2 | 40–60 | 120–600 | 17 – 17 + 1..6 | `4TH & 2 — go or go home` / `3RD & 1 — a yard is a yard` |
| 4 | TWO_MINUTE | 4 | 1–2 | 10 | 45–60 | 35–58 | 20 – 20 + 1..3 | `0:40 left, down 2 — the drill` |
| 5 | LAST_PLAY | 4 | 1 | 10 | 100 − (30..45) | 3–8 | 20 – 20 + 4..5 | `0:07 left at the 40 — one shot at the end zone` |

Every entry: `{idx, kind, down, toGo, yl, quarter, clock, score, stakes, venue, lastPlay, twoMinute}`; `toGo` is clamped to the goal line. The last play is down by 4–5: a touchdown wins, a field goal does not.

**The shell's story rule** (`Store.record`, D16): a touchdown ends the possession ("The building comes apart…"); the last play is won or lost; an INT → "the defence holds" (on a disguised snap: "They showed COVER 2 and played COVER 4 — the look lied"); a first down → "FIRST DOWN at the OPP 34. The drive rolls on." ("— on your own legs" after a scramble) and the next entry's `yl` advances by the gain (clamped −10..+40; caps `THIRD_LONG 60, RED_ZONE 95, SHORT_YARDAGE 75, TWO_MINUTE 75, LAST_PLAY 80`; `THIRD_MEDIUM` never moves; a first down in the drill carries into the last play, which still starts at least 20 yards out; a moved entry is re-worded). A touchdown in the two-minute drill moves both scores of the last play by 7 ("they answer, and then some") so the script's deficit survives. A failed 3rd/4th down → the punt team / next possession (a scramble short of the sticks: "You took off and came up short of the sticks."); a gain on 1st/2nd down → "The chains stay put" and the drive continues. **The box score**: a PASS or a THROWAWAY is an attempt (a catch a completion); a SACK is a sack; a SCRAMBLE and a run card are rushes: scramble yards count as rushing, never as passing. The scene's crowd / clutch level per kind: `THIRD_MEDIUM 0.3, THIRD_LONG 0.4, RED_ZONE 0.55, SHORT_YARDAGE 0.5, TWO_MINUTE 0.75, LAST_PLAY 0.95` (`ctx.pressureLevel`; ≥ 0.6 counts as clutch in the scene).

### 2.12 Passer rating (`Play.rating`, pure)

The NFL formula on the **passing** line: `a = (cmp/att − 0.3) × 5`, `b = (yds/att − 3) × 0.25`, `c = td/att × 20`, `d = 2.375 − int/att × 25`, each clamped to 0..2.375, `(a + b + c + d) / 6 × 100`, one decimal; 0 attempts → 0. Perfect 158.3 · 20/30 190 2 1 → 92.4 · 20/30 250 2 1 → 100.7 · Brady 2007 → 117.2. The summary's tiers: ≥ 120 LIGHTS OUT · ≥ 100 SHARP · ≥ 80 SOLID · ≥ 60 SHAKY · else ROUGH.

### 2.13 Weather

- **Game day** (`Store.newDrive`, one fork `'drive:weather'`): a climate pick (`warm / temperate / cold`, plus `dome` in the NFL), a week (`1..8` HS, `1..12` otherwise), then the kicker's `Weather.forGame(rng, {climate, dome}, week, 'NFL'|'COLLEGE')` (6 draws; 7 below the snow line) with `Tuning.weather` and `Tuning.difficulty.pro.windCap` (20 mph) carried over verbatim. The HUD chip is `Weather.label`: `WIND ← 8` (the arrow by the dominant component), `CALM`, `DOME`, plus the kind (`RAIN`, `SNOW`, `FOG`, `COLD`, `HEAT`).
- **On the throw** (`Field.weatherPenalty`, `Tuning.qb.weather`; a dome costs nothing): `wx = max(0, mph − windFree 5) × windPerMph 0.004 × (windLoftBase 0.6 + windLoftPer 0.8 × loft) + byWeather {clear 0, dome 0, heat 0, fog 0.01, cold 0.02, rain 0.04, snow 0.07} + max(0, coldBelowF 35 − tempF) × coldPer 0.001`, and the scatter's sd grows by `scatter.weather 6 × wx` yards: 15 mph clear on a lob +0.34 yd, rain in 15 mph on a bullet +0.38, snow at 25 °F in 10 mph on a touch pass +0.60.
- The scene: rain / snow particles (32, a tiny LCG: nothing touches the rng), a fog band, a grey sky in rain / fog / snow, a lit ceiling in a dome.

### 2.14 Balance (measured, as of §0.6)

**Six-moment drives through the real store** (`qb/test/fixtures/bots.js`, seeds 424200+, all four archetypes, COLLEGE; re-measured after the review fixes D32–D40: the spot is floored, out-of-bounds catches are gone and the lane is live up to the catch point, so every tier sits lower than the v2 build's first table — EXPERT 79.5 → 74.9 %, DECENT 65.6 → 62.0 %). The bots decide only from what a player can see (positions, the rings once shown, the card's routes, the RUSH meter, the draft chip, the preview only for a FIELD GENERAL) and every input goes through the scene's rules (classify, aim assist, the commit). NOVICE: any card, looks up late, waits for a man who looks wide open, a fast flat line at where he is; DECENT: the best-advice card, a ring reader who waits for green and settles for gold; EXPERT: races the ball against the defence for every man × loft × straight or bent; CHECKDOWN: the back every snap; SCRAMBLER (DUAL THREAT): never throws, runs through the widest gap; QUICK: no read — the best-advice card and, at 0.7 s, a touch pass to whoever looks most open (the dominant-strategy probe). The bots read the chip as a player does: they never throw a TOO FAST or TOO LONG line, and an expert has learnt that a ball through the lane up to the catch point can be got and that a ball ahead of the break finds a man not looking.

| Bot | Team | Drives | Cmp % | INT % | Sacked % | Tipped % | Yd / att | Yd / play | Last play won % | EPA / play |
|---|---|---|---|---|---|---|---|---|---|---|
| EXPERT | AVERAGE | 240 | 74.9 | 2.0 | 1.0 | 3.9 | 13.3 | 13.1 | 41.7 | 0.93 |
| DECENT | AVERAGE | 600 | 62.0 | 4.5 | 6.5 | 3.4 | 7.9 | 7.0 | 15.2 | 0.13 |
| NOVICE | AVERAGE | 600 | 46.6 | 10.5 | 19.5 | 8.0 | 5.7 | 3.1 | 16.7 | −0.97 |
| DECENT | BAD LINE | 400 | 52.5 | 8.0 | 18.9 | 5.5 | 5.8 | 3.4 | 7.8 | −0.53 |
| DECENT | GREAT LINE | 400 | 67.2 | 3.6 | 4.0 | 2.8 | 10.1 | 9.5 | 26.3 | 0.43 |
| EXPERT | BAD LINE | 160 | 62.7 | 1.9 | 1.9 | 5.2 | 9.7 | 9.4 | 22.5 | 0.32 |
| EXPERT | GREAT LINE | 160 | 77.5 | 1.2 | 0.9 | 3.7 | 15.9 | 15.7 | 41.9 | 1.42 |
| CHECKDOWN | AVERAGE | 400 | 76.8 | 1.3 | 0.0 | 1.8 | 3.7 | 3.7 | 0.0 | −0.55 |
| QUICK | AVERAGE | 600 | 69.0 | 1.7 | 0.0 | 4.2 | 6.2 | 6.2 | 1.3 | −0.15 |
| SCRAMBLER | AVERAGE (DUAL THREAT) | 150 | — | — | 4.6 | — | — | 4.7 | 0.0 | −0.08 |

The targets (the v2 contract, pinned with widened bands by `balance.test.js`, §5.2): EXPERT 75–85 % / ≤ 2 % INT · DECENT 60–70 % / 3–5 % · NOVICE 40–50 % / 8–12 % and 15–25 % sacked.

**The engine's own claims** (the default snap: 3rd & 6 at own 40, the first pass card, ACC / MOB 55, the demo presets):

| Claim | Measured |
|---|---|
| A QB who never throws is sacked (the pocket's clock; 1000 snaps a line) | BAD LINE: p10 1.58 s · median 2.12 · p90 3.03, 98.2 % by 3.5 s · AVERAGE: 1.88 / 2.80 / 3.78, 82.1 % · GREAT LINE: 2.05 / 2.98 / 3.97, 74.6 % |
| A rollout away from the first free rusher delays the sack (400 snaps) | mean end of the play 2.75 s standing → 4.24 s rolling 12 yd across |
| Running straight back does not (D34) | median end 2.53 s standing → 2.98 s 13 yd back (a rollout 10 across, 1 back: 3.50) |
| MOB escapes sacks (600 snaps) | 0.18 escapes a play at MOB 50 · 0.21 at 55 · 0.32 at 72 · 0.54 at 99 |
| The call matters (§2.3.4) | median peak separation GOOD 6.98 yd vs BAD 5.15 (+1.82) |
| The preview is honest (§2.5.4; straight lines to the aim spot at 1.5 s, 500 seeds) | GREEN 90.2 % complete, 0 % picked (153) · GOLD 75.9 %, 1.2 % (498) · RED 45.4 %, 7.0 % (487) |
| A bullet through a linebacker vs a lob over him (§2.6.3, the lab, 1000 throws a loft) | bullet: 41.2 % tipped + 10.5 % picked · touch (0.5): 1.0 % · lob (0.75 / 0.9): ≤ 1.1 % |
| The no-read quick throw vs reading (D36) | QUICK 69.0 % / 1.7 % INT / −0.15 EPA a play vs DECENT 62.0 % / 4.5 % / 0.13 (without `catch.early`: QUICK 78 % and +0.16, ahead of DECENT) |
| A drawn scramble every snap (the SCRAMBLER on a DUAL THREAT) | 4.7 yd a play and −0.08 expected points a play, vs DECENT passing's 0.13 (all archetypes) |

---

## 3. Engine (technical specification)

### 3.1 Principles

1. **One global** `window.RTG`; classic scripts in the shim; no `type="module"`, no `fetch`, no image files.
2. **The engine is pure over plain JSON**: `fn(input, rng) → result`. The one stateful object is the **Live**, a closure over its sim and its child rng whose public objects are allocated once and mutated in place (so the scene reads them every frame without allocating). The PlaySim is plain JSON (a JSON copy of a sim replays to the same result). `PlaySim.ctx` and `PlayResult.play` are references, not copies; there are no cycles except `live.sim`.
3. **All randomness through the rng**: every function documents its draw count (§3.6). `uiRng` never reaches the engine.
4. **Constants live in `Tuning.qb`** (read at call time through `P()` / `F()` / `W()`, so `RTG.debug.tune` applies). The engine's own literals are definitions, not balance: `FIELD_YARDS 100`, `RESULT_DECIMALS 3`, `COORD_MAX 1000`, `MAX_SCAN 200000`, `HISTORY 90` (sub-steps of receiver history, ≥ the longest trail), the NFL rating constants.
5. **The engine owns every position** (D20): the scene renders the engine's shapes and never derives a rule; the draft's kind is always `live.classify`'s.
6. **Tolerant inputs**: `buildContext` normalises everything (`normSituation`, `normQb`, `normTeam`, `normOpp`); a missing block falls back to the demo presets. The Live never throws on garbage: NaN, strings, empty or one-point or huge polylines, a loft out of range or a call in the wrong phase gives `{ok: false, reason}` (or INVALID), and nothing in its public state is ever NaN (tested).

### 3.2 Files, ownership, load order

Owner codes: KIT (copied from the kicker verbatim; only line 2's game name changed) · ENG engine · SCN scene · SHL shell.

```
qb/
  index.html                          SHL   the page; script order is the contract (test/load.js ORDER); an inline boot-error hook
  README.md                           —
  docs/SPEC.md                        —     this document
  css/style.css                       KIT   tokens, chrome, components (the visual system)
  css/play.css                        SCN   the moment scene (HUD, stage, panel, cards, the draw HUD, slow motion, banners)
  css/screens.css                     SHL   title, the moment wrapper + DRIVE interstitial, summary, settings modal, the engine-missing card
  js/00_namespace.js                  KIT   window.RTG = {VERSION '1.0.0', SAVE_VERSION 2 (unused), Data, UI}
  js/engine/tuning.js                 ENG   RTG.Tuning = {qb, weather, difficulty.pro.windCap} + RTG.TuningDefaults()
  js/engine/util.js                   KIT   RTG.Util
  js/engine/rng.js                    KIT   RTG.RNG (mulberry32; int/float/chance/gauss/pick/weighted/shuffle/fork/state/setState/toSeed)
  js/engine/weather.js                KIT   RTG.Weather (forGame, perKick, monthFor, components, label)
  js/data/plays.js                    ENG   RTG.Data.plays {routes, formations, plays, coverages (with roles), order, slots, defenders, defenderPos, families}
  js/engine/field.js                  ENG   RTG.Field (the frame, the alignment, the cast, the ghost, the Live, replay, polylines, physics)
  js/engine/play.js                   ENG   RTG.Play
  js/ui/storage.js                    KIT   RTG.UI.Storage
  js/ui/palette.js                    KIT   RTG.UI.Palette (tokens, cb / hc variants, teamTint, setTeamVars)
  js/ui/store.js                      SHL   RTG.UI.Store (settings, the drive, the line, the story, the plans, the summary)
  js/ui/components.js                 KIT   RTG.UI.C
  js/ui/sprites.js                    SCN   the kicker's atlas + the QB tiles appended (§4.2)
  js/ui/canvas.js                     KIT   RTG.UI.Canvas
  js/ui/audio.js                      KIT   RTG.UI.Audio
  js/ui/playinput.js                  SCN   RTG.UI.PlayInput (the draw layer: pointer + keyboard drafts)
  js/ui/playview.js                   SCN   RTG.UI.PlayView (the moment scene)
  js/ui/screens/title.js              SHL   RTG.UI.Screens.title
  js/ui/screens/moment.js             SHL   RTG.UI.Moment (the reusable host) + RTG.UI.Screens.moment
  js/ui/screens/summary.js            SHL   RTG.UI.Screens.summary
  js/ui/screens/settings.js           SHL   RTG.UI.Screens.settingsModal
  js/debug.js                         SHL   RTG.debug
  js/ui/app.js                        SHL   RTG.UI.app (boot, the screen switcher, settings classes, resize / key routing, the engine guard)
  tools/bundle.js                     SHL   node qb/tools/bundle.js [--fragment out.html] → qb/dist/qb.html
  test/load.js, run.js                ENG   the vm loader (ORDER) and the runner
  test/purity.test.js, rng.test.js, util.test.js, plays_lint.test.js, field.test.js, play.test.js, balance.test.js [balance]
  test/fixtures/bots.js               ENG   the headless players (the balance tests, probes)
  test/e2e/_harness.js, _playhelpers.js, run.js, boot.spec.js, moment.spec.js, controls.spec.js, qa_shots.js, shots/
```

**`index.html` script order** (exactly this): `00_namespace, engine/tuning, engine/util, engine/rng, engine/weather, data/plays, engine/field, engine/play, ui/storage, ui/palette, ui/store, ui/components, ui/sprites, ui/canvas, ui/audio, ui/playinput, ui/playview, ui/screens/title, ui/screens/moment, ui/screens/summary, ui/screens/settings, debug, ui/app`. `test/load.js` `ORDER = ['00_namespace', 'engine/tuning', 'engine/util', 'engine/rng', 'engine/weather', 'data/plays', 'engine/field', 'engine/play']`: a new engine or data file goes there, in `index.html` and in `purity.test.js`'s `CONTRACT`. The page also carries `#app`, `#live` (`aria-live="polite"`), a `<noscript>` line and an inline hook that appends a `.noscript.boot-error` line to `#app` when an uncaught error fires before `RTG.UI.app.ready`.

### 3.3 Namespace and the shim

As the kicker's §3.3: every file is `(function (root) { 'use strict'; var RTG = root.RTG = root.RTG || {}; … })(typeof window !== 'undefined' ? window : globalThis);`. The purity test whitelists exactly that string, forbids `window` outside it (hence D15), `document`, `localStorage`, `Math.random`, `Date`, `setTimeout`, `setInterval`, `requestAnimationFrame`, `performance`, `console.log`, `fetch` in `js/engine` and `js/data`, the ES2018+ syntax, and any `Tuning` write outside `tuning.js`. `RTG.UI.uiRng = store.uiRng = RNG.create((Date.now() ^ 0x9e3779b9) >>> 0)` is created in the store.

### 3.4 Shapes

#### 3.4.1 Situation (input)

`{ down, toGo, yl, quarter, clock (s), score: {us, them}, venue?: 'HS'|'COLLEGE'|'NFL' (default COLLEGE), weather?: {weather, wind: {speed, dir}, tempF}, qb?: {attrs: {ARM, ACC, IQ, MOB, POI}, archetype, foot}, team?: {ol, wr: [{slot, name, skill, speed}] | number}, opp?: {dl, db, tendency?}, lastPlay?, twoMinute?, clutch?, stakes?, kind?, idx? }`. `normSituation` clamps `yl` to 1..99, `toGo` to 1..(100 − yl), `down` 1..4, `quarter` 1..5; the demo's store also puts `pressure` (the scene level) on it, which the engine drops and the store re-attaches as `ctx.pressureLevel`.

#### 3.4.2 PlayContext (`Play.buildContext`)

`{ situation (normalised; no qb / team / opp inside), qb: {attrs, archetype, foot}, team: {ol, wr[5]}, opp: {dl, db, tendency|null}, real, shown, disguised, look: {safeties, press, box, showBlitz, name, text, tell} (of the SHOWN coverage), options: [card], adviceFrom: 'REAL'|'SHOWN', pressure: {sackAt, pocket, hot, clutch}, receivers: [{slot, name, skill, speed, x0, y0, side}] (the shotgun), field: {sideL, sideR, centerX, goalY, endY, losY: 0}, alignment: {qb: {x, y}, receivers: [{slot, x, y}], linemen: [{x, y}] ×5, defenders: [{id, x, y, pos: 'CB'|'NB'|'S'|'LB'|'DL'}] ×11}, hash: −1|0|1, sign: ±1, revealAt, clarity, weather|null, venue, clutch }`. The store adds `idx`, `kind`, `pressureLevel`, and mirrors `clutch` onto `situation.clutch`.

#### 3.4.3 PlaySim (`Play.snap`, a pass play)

```
{ run: false, playId, play: {id, name, formation, tags, line}, ctx, real, shown, look,
  fit: 'GOOD'|'OK'|'BAD',                 the play vs the REAL coverage (§2.3.4)
  field: {sideL, sideR, centerX, goalY, endY, losY: 0},
  receivers: [{ slot, name, skill, speed, x0, y0, side, route, family,
                path: [{t, x, y}] (absolute field yards, speed-scaled, the snap's clock jitter in), capY, xMin, xMax,
                key: {t, x, y} (where the route is "there"), hot, checkdown,
                ghost: {sep: [41 samples, 0.1 s], peak, peakAt, from, to} }] ×5,
  defenders: [{ id, pos, role: 'MAN'|'ZONE'|'RUSH'|'SPY'|'ROBBER', man: slot|null, zone: {x, y, r}|null,
                speed (yd/s), skill, reach (yd), react (s), trail (s), cushion (yd), x0, y0 (= ctx.alignment), deep }] ×11,
  rushers: [{ defId, lane (−2..2), beatAt (s), line: {x, y}, pocket: {x, y} }] (beat order),
  linemen: [{x, y}] ×5, qbStart: {x, y}, qbDrop: {y, t},
  sackAt, revealAt, clarity, hot: slot|null, checkdown: slot|null }
```

A run play returns the result shape of §2.10.

#### 3.4.4 The Live (`Play.live` → `Field.create`)

Fixed-length arrays; every object allocated once and **mutated in place** by `step`:

```
t                       sim s since the snap (k × dt)
phase                   'PRE_THROW' | 'BALL_IN_AIR' | 'AFTER_CATCH' | 'SCRAMBLE' | 'DONE'
qb                      {x, y, vx, vy, hasBall, down (sacked / tackled), escaped (count)}
receivers[5]            {slot, x, y, vx, vy, sep, open (0..1), target (the pass's target, from the release), shown (t ≥ revealAt)}
defenders[11]           {id, pos, role, man, x, y, vx, vy, blocked (a rusher still held)}
linemen[5]              {x, y}
ball                    null until the release, then ONE object {x, y, h (yd), u (0..1 along the path), path (the flown path,
                        after scatter), drawn (the line as drawn, from the QB, untruncated), landing {x, y}, releaseT, arriveT,
                        loft, kind 'PASS'|'THROWAWAY', caught, deadAt (s, or −1), target (slot|null), speed, length, apex,
                        tipped, tooLong, preview (the classify colour at the release)}
carrier                 null | 'QB' | slot | defender id (after a pick)
events                  [{t, kind, who, x, y}] appended in time order: SNAP · RUN · RELEASE · TIP · INT · CATCH · DROP ·
                        INCOMPLETE · SACK · ESCAPE · SCRAMBLE · TACKLE · BROKEN_TACKLE · OUT_OF_BOUNDS · TD · THROWAWAY
pressure                0..1, the RUSH meter (§2.4.6)
rest                    s: the part of the last step's dt not simulated yet (the scene draws x + vx × rest: smooth slow motion, D40)
previewShown            IQ ≥ draw.previewIq
field, sim              the frame and the sim
step(dt) → phase        §2.4.1
classify(points, loft)  §2.5.1 (0 draws; `early` flags a pass drawn too fast)
aim(slot, loft)         → {slot, x, y, flight, arrive, points: [QB, spot], tooLong} | null: where his route has him when a straight
                        ball released now arrives (a fixed point of the flight time, ≤ 16 rounds), x held 0.3 yd inside the
                        field; null when passing is illegal or the slot is unknown (0 draws)
setRun(points)          → {ok, reason} (§2.7.2)
throwAlong(points, loft)→ {ok, kind: 'PASS'|'THROWAWAY'|'INVALID'|null, target, reason} (§2.6.1, D22)
throwAway()             → {ok, kind: 'THROWAWAY', target: null, reason} (§2.6.6)
result()                → PlayResult once DONE (the same object every call), else null
plan()                  → a copy of the Plan (§3.4.5)
snapshot()              → a JSON copy of what the scene draws (debug)
```

#### 3.4.5 Plan (`live.plan()`)

`{ runs: [{t, points}], pass: {t, points, loft} | null, away: t | null }`: only accepted inputs; `t` is the sim time of the sub-step grid (`k × dt`, rounded to 6 decimals); `points` are the cleaned input as given (`throwAlong` logs the drawn points, not the classified ones). `Field.replay(live, plan)` applies each input at `round(t / dt)` (runs, then the pass, then the throw-away at equal times) and steps to DONE; garbage entries are ignored.

#### 3.4.6 PlayResult (`live.result()`, `Play.resolve`)

```
{ run: false, playId, play, kind: 'PASS'|'THROWAWAY'|'SCRAMBLE'|'SACK',
  outcome: 'CATCH'|'INCOMPLETE'|'INT'|'SACK'|'THROWAWAY'|'SCRAMBLE'|'DROP', target (slot|null), catcher (slot|null),
  yards, airYards, yac (integers), td, firstDown, turnover, fumble (false),
  t (the release, else the end), loft, length (the flown yd), landing {x, y}, release {x, y, pressure, running, sd} | null,
  arrive, flight, sep (the target's separation at the landing), miss (the target's distance to the spot), preview,
  contest (Σ at the landing), nearest {id, d} (the nearest defender to the spot), escaped, tooLong, sackAt,
  ended: 'TACKLE'|'OUT_OF_BOUNDS' (a carrier, the QB, or an INCOMPLETE caught out of bounds)|'TD'|'TIMEOUT'|'SACK'|'THROWAWAY'|'TIPPED'|'FLIGHT'|'CONTEST'|'ALONE'|'DROP'|'MISSED'|'NOBODY',
  endT, text, banner, feedback: {timing, touch, placement, coachSaw} }
```

Numbers are rounded to 3 decimals; `−0` is normalised to `0`. `Play.forcedResult` returns the same shape with `forced: true`, `ended: 'FORCED'`, `release: null` (§3.5.1).

#### 3.4.7 The draft (the scene's `view.drawing()`)

`{mode: 'PASS'|'RUN'|null, source: 'pointer'|'key', kind (classify's; a keyboard RUN draft is always RUN), target, preview, previewShown, points (classify's line, rounded), raw (the resampled draft), loft, touch, speedHps, tooLong, length, maxLen, assisted, reason}` or null when nothing is being drawn.

#### 3.4.8 The store's drive (`RTG.UI.Store`, not persisted)

`{ seed (as typed), seedNum (uint32), archetype, team, venue, startedAt, script[6], weather, climate, week, idx, pending: 'PLAY'|'STORY'|'DONE', advance, ctx, sim, situation, live, liveIdx, liveRng, results: [entry], sims: [PlaySim], line: {att, cmp, yds, td, int, sacks, sackYds, rushes, rushYds, rushTd, fumbles, firstDowns, long, turnovers}, story: {text, continues, td, won, lost, spot, nextText}, lastResult }`. A results entry: `{idx, kind, down, toGo, yl, quarter, clock, stakes, play, playName, outcome, resultKind, yards, airYards, yac, td, firstDown, turnover, fumble, rush (a scramble or a run card), target, targetName, route, text, banner, feedback, timing, touch, placement, loft, length, t, plan (null for a run card or a forced result), liveRng (the parent state before the live fork), story, forced}`.

### 3.5 Public API

#### 3.5.1 `RTG.Play`

- `buildContext(situation, rng) → PlayContext`: 1 parent draw (`fork('play:ctx')`). §2.2.
- `snap(ctx, playId | option, rng) → PlaySim | run result`: 1 parent draw (`fork('play:snap')`). §2.3, §2.10. Throws on an unknown play or a play with an unassigned slot.
- `live(sim, rng) → Live`: 1 parent draw (`fork('play:live')`); the child lives in the Live (§3.4.4). A run sim gets a finished Live whose `result()` is the sim.
- `resolve(sim, plan, rng) → PlayResult`: `Play.live` + `Field.replay(live, plan)`. The same result as the live play that produced the plan. 1 parent draw. A run sim returns the sim.
- `autoPlan(sim) → Plan`: a sensible headless plan (the shell's skip and auto-resolve), 0 draws: it rehearses on a private Live whose rolls are the median (every chance at 0.5, every gauss at its mean) and, at the first of `field.auto.times` `[1.2, 1.6, 2.0, 2.4]` s with a GREEN or GOLD line, throws a straight touch pass (`auto.loft` 0.45) to the aim spot of the best receiver (colour, then separation now); at the last of those times the best line whatever its colour; with no PASS line at all, a throw-away `auto.awayEarly` 0.4 s before `sim.sackAt`. A run sim → the empty plan.
- `driveScript(opts {venue?}, rng) → situation[6]`: 1 parent draw (`fork('play:drive')`). §2.11.
- `rating(line {att, cmp, yds, td, int}) → number`: pure. §2.12.
- `forcedResult(sim, kind, input?) → PlayResult`: pure (0 draws). `kind ∈ CATCH | FIRST_DOWN | TD | INCOMPLETE | INT | SACK | DROP | THROWAWAY | SCRAMBLE | FUMBLE`; the target defaults to the first receiver, the release `t` to 0.8 s before his ghost `peakAt` (0.3..6), the spot to his path at `t + 1`; `CATCH` gains `max(0, min(air + 2, toGo − 1))` (never a first down), `FIRST_DOWN` `max(toGo, min(toGo + 3, the distance to the goal))`, `TD` the distance to the goal, `SACK` `qbDrop.depth` (−7), `SCRAMBLE` `min(4, goal)`, `FUMBLE` a 2-yd scramble with `fumble` and `turnover` (text / banner `FUMBLE`); `coachSaw: 'Coach saw the debug menu.'`. A run sim is returned unchanged.
- Pure helpers (0 draws): `pathAt(rec, t)` (→ `Field.pathAt`), `pocketTime(ol, dl, coverageId, attrs, clutch)`, `isClutch(sit)`, `downText(sit)` (`'3RD & 7'`, `'4TH & GOAL'`), `spotText(yl)` (`'OWN 34'`, `'MIDFIELD'`, `'OPP 18'`).
- Constants: `Play.KINDS ['PASS', 'THROWAWAY', 'SCRAMBLE', 'SACK']`, `Play.OUTCOMES ['CATCH', 'INCOMPLETE', 'INT', 'SACK', 'THROWAWAY', 'SCRAMBLE', 'RUN', 'DROP']`, `Play.ADVICE`.

#### 3.5.2 `RTG.Field`

- `create(sim, rng, {ghost?}) → Live` (`Play.live` forks the rng and calls it; `ghost`: no QB input, no rolls, no rng) · `replay(live, plan) → PlayResult` · `setup(ctx, play, rng)` (the cast, inside `Play.snap`'s child) · `ghost(sim) → [curves]` (0 draws).
- The frame and the picture (0 draws): `frame(yl, hash, venue)`, `alignReceivers(roster, formationId, sign, field)`, `alignment(look, receivers, sign, field)`, `pathAt(rec, t)`, `speedScale(speed)`, `routeOpen(rec)` (when a sim receiver's route window opens on his clock: the catch's `early` term, the bots' eyes).
- Polylines (0 draws; new arrays): `clean(points, max?)`, `length(pts)`, `truncate(pts, len)`, `resample(points, spacing = draw.resampleYd)`, `smooth(points, passes = 1)` (a [¼ ½ ¼] moving average, the ends fixed).
- Physics (0 draws): `qbSpeed(attrs)`, `recSpeed(speed)`, `defSpeed(pos, skill)`, `ballSpeed(attrs, loft)`, `maxLen(attrs)`, `apex(flight, loft)`, `heightAt(u, apex)`, `loftFor(hps)`, `weatherPenalty(wx, loft)`.
- Constants: `Field.PHASES`, `Field.EVENTS`.

#### 3.5.3 `RTG.Data.plays`

`{ routes (15), formations (5), plays (13 pass + SNEAK + DRAW, in that order), coverages (6, each with roles for the eleven), order: ['COVER2', 'COVER3', 'COVER4', 'MAN', 'BLITZ', 'PREVENT'], slots: ['WR1', 'WR2', 'SLOT', 'TE', 'RB'], defenders: ['CB1', 'CB2', 'NB', 'S1', 'S2', 'LB1', 'LB2', 'DL1', 'DL2', 'DL3', 'DL4'], defenderPos: {CB1: 'CB', …, DL4: 'DL'}, families: ['SHORT', 'MID', 'DEEP'] }`. Pure data; the copy is in the kicker's voice (short, second person, the coach talking).

#### 3.5.4 `RTG.Tuning` (`RTG.TuningDefaults()` returns a fresh deep copy; the tree is NOT frozen so `RTG.debug.tune` can set leaves in place)

`Tuning.qb` blocks: `attrMax` · `archetypes` (§2.1) · `read` (§2.2) · `coverage` (§2.2.1) · `pressure` (§2.3.5) · `open {ring {open 0.60, closing 0.25}}` (§2.4.6) · `route {speedBase 1.0, speedPer 0.004, endZoneCap 10, releaseT 1.0, jitterSd 0.05}` · `field` (the simulation: `dt 1/60, maxStep 0.25, maxT 8, halfWidth, endZone, hash, sideMargin, inbounds, feetIn 0.2, arriveGain, accel, recAccel, breakGain, brakeFrac, carry, rotateS, align, qbDrop, qbSpeed {base, perMob, back 0.45, backFree 0.25}, recSpeed, defSpeed, shedSlow, defSkillSd, react, man, zone, fit, rush {…, olSpeed 8, olReach 4, leash 4}, pressR, heldPressure, ballSpeed, maxLen, height, reach, catchZone, laneStep, laneR, scatter, tackleR, catchR, contestR, reachR, shedS, targetReact, hopeless, sack, tip, int, catch {…, early 0.35, earlyT 0.8}, drop, tackle, evade, pursueBurst, pursueLead, intReturnS, away, present, openSep, ghostT, ghostFrom, sampleDt, auto`; §2.3–§2.7) · `draw` (`slowMo 0.15, slowMoBudgetS 4, startR 2.5, minLen 2, reachSlack 0.2, greenMargin 0.3, greenReach 0.1, redReach −0.05, previewLowBand 0.5, previewPad 0.3, previewHot 0.1, previewIq 70, loft {fastHps 1.3, slowHps 0.35}, earlyDepth 6, earlyS 2, earlyStep 0.1, assistYd 3.5, resampleYd 0.75, maxPoints 600`; §2.5) · `run` (§2.10) · `feedback {early 0.15, late 0.15, tooLate 0.8, plateau 0.75, bullet 0.33, lob 0.67, money 1.5}` (§2.8) · `drive` (§2.11) · `demo {teams, defaultRoster, defaultTeam 'AVERAGE', defaultArchetype 'FIELD_GENERAL'}` · `weather` (§2.13). `Tuning.weather` and `Tuning.difficulty.pro.windCap 20` are the kicker's, read by the copied `engine/weather.js`.

#### 3.5.5 `RTG.Weather` (copied)

`forGame(rng, {climate, dome, windy}, week, league, cap?)` (6 draws; 7 below the snow line), `perKick(rng, weather)` (2), `monthFor`, `components(wind) → {cross, along}`, `label(w)`.

#### 3.5.6 `RTG.UI.Store` (the demo's shell store; §3.7)

`new Store()` → `settings`, `setSetting(key, value)`, `resetSettings()`, `saveSettings()`, `subscribe(fn) → unsubscribe` (notifications `{fnName: 'settings'|'newDrive'|'context'|'record'|'next', result, store}`), `isDebug()`, `newDrive({seed, archetype, team, venue}) → drive`, `hasDrive()`, `pending()`, `isDone()`, `line()`, `results()`, `tints()`, `situation()`, `context()` (buildContext, memoised per moment; 1 parent draw), `snap(playId)` (1), `live(sim)` (`Play.live`, 1), `noteLive(live, rngState)` (a host made the Live itself: the fork is spent, 0), `firstPassOption()`, `autoPlan(sim)` (`Play.autoPlan`, a throw-away fallback), `resolve(sim, plan)` (`Play.resolve`, 1), `replay(idx) → PlayResult | null` (`Play.resolve` of a recorded moment on a scratch rng at its `liveRng`; 0 draws on the drive), `record(result, sim, {plan, liveRng, liveForked}) → story` (spends the live fork when nobody did), `next()`, `force(result, sim)`, `autoResolve()` (the first pass card, `autoPlan`, `resolve`, `record`), `summary() → {seed, seedNum, archetype, team, venue, weather, done, played, total, line, rating (the passing line), passing {cmp, att, yds, td, int}, rushing {att, yds, td}, best: {text, sub, result, rush}|null, won, verdict, results}`. Statics: `Store.KEYS {settings: 'rtg.qb.settings'}`, `Store.KINDS`, `Store.TINTS`, `Store.defaultSettings()`, `Store.sanitizeSettings(raw)` (unknown keys dropped).

### 3.6 The RNG draw contract (pinned by `play.test.js` / `field.test.js` with a draw-counting rng)

The parent rng sees exactly **1 draw per call** (the fork). The child draws:

| Call | Child draws |
|---|---|
| `buildContext`: `fork('play:ctx')` | coverage weighted 1 · disguise roll 1 · disguise pick 1 (always) · card count int 1 · goodOffered roll 1 · pass-card picks weighted 1 each · pass-card shuffle (n − 1) · card clarity roll 1 per pass card (always drawn) · sackAt gauss 2 · hash int 1 · strong-side roll 1 = **8 + 3 × pass cards** (14 or 17; a run card draws nothing; the field and the alignment draw nothing) |
| `snap`: `fork('play:snap')` | pass play (`Field.setup`): per receiver a route-clock gauss 2 (10) · per defender in `Data.plays.defenders` order a skill gauss 2 + a reaction gauss 2 (44) · the sack clock's jitter gauss 2 · the first rusher weighted 1 · six beat gaps float 1 each (always six) = **63**; then the ghost (0). `SNEAK` = **3** (success roll, gain int, loss int). `DRAW` = **4** (yards gauss 2, break roll, break int) |
| `live`: `fork('play:live')` | in **event order**, only as events happen: a free defender reaching the QB behind the line → escape roll 1 · a PASS release → scatter gauss 2 (lateral) + gauss 2 (length) (a THROWAWAY: 0) · the ball passing a defender under his reach → touch roll 1 (+ pick roll 1 on a touch; once per defender per throw; in the catch zone too, for anyone not at the catch point, the pending ones on the landing sub-step before the catch) · the landing: a catcher out of bounds → 0 (INCOMPLETE); a receiver within catchR → catch roll 1, then a drop roll 1 (caught) or, missed with a contester in bounds, a pick roll 1 · no receiver but a defender within catchR, in bounds → pick roll 1 · a defender within tackleR of the ball carrier → broken-tackle roll 1 each time. A run sim → **0**. The same sim, the same rng state and the same inputs at the same sim times give the same draws |
| `resolve` | the live fork (1 parent); the plan replays the live play's child draws exactly |
| `driveScript`: `fork('play:drive')` | **25** draws (24 ints + the opening-score pick): `1: toGo yl clock lead(pick) · 2: toGo yl clock deficit · 3: down toGo yl clock deficit · 4: down toGo yl clock deficit · 5: down yl clock deficit · 6: fromGoal clock deficit` |
| `classify`, `aim`, `plan`, `result`, `snapshot`, `setRun`, `autoPlan`, `forcedResult`, `rating`, every helper | 0 |

The drive's parent rng (`Store`): `driveScript` fork 1 · weather fork 1 · then per moment `buildContext` 1 · `snap` 1 · `live` 1 (a run card, a forced result and the headless paths spend the live fork too: the host spends it for a run card, `record()` spends it when nobody did) — **every moment costs 3 parent draws** regardless of the inputs, so `?seed=` reproduces the six looks, casts and the weather whatever was drawn. `RNG.toSeed` maps a number or a word to the uint32.

### 3.7 The demo's flow (screens are UI names; §4)

```
title ──START THE DRIVE──▶ store.newDrive({seed, archetype, team, venue}) ──▶ moment (pending PLAY)
  moment: store.context() → RTG.UI.Moment.mount({ctx, rng, Play, PlayView, …})
          onPick → Play.snap(ctx, id, rng) · makeLive → Play.live(sim, rng) (→ store.noteLive)
          onDone(result, sim, {plan, liveRng, liveForked, forced}) → store.record(result, sim, how)
          → pending STORY: the DRIVE interstitial (banner, play/target line, feedback line, coach line, story, the running line, NEXT UP, NEXT)
          → NEXT → store.next() → pending PLAY → the next Moment in place (the screen id stays 'moment')
          → after the sixth result pending DONE → summary
summary ──PLAY AGAIN (same seed + picks) / NEW DRIVE (new seed, same picks)──▶ moment · ──TITLE──▶ title (picks kept)
```

`RTG.UI.Moment.mount(container, {ctx, rng, Play?, PlayView?, settings?, store?, reduced?, tints?, uiRng?, onSnap?(sim), onLive?(live, sim, rngState), onResult?(result, sim), onDone(result, sim, how), onSettings?()}) → {el, view, ctx(), sim(), live(), plan(), result(), setSim(s), destroy()}` depends only on `{ctx, Play, PlayView, rng}` (the seam the career hosts, §6). It hands the scene `onPick` and `makeLive` (the rng never leaves the host; one Live per moment), and at the end calls `onDone` with `how = {plan: live.plan() (null for a run card or a forced result), liveRng (the parent state before the live fork), liveForked: true, forced}`; a run card never makes a Live, so the host spends the live fork itself (`rng.fork('play:live')`).

Escape opens the settings modal on every screen (a mounted scene routes it through `onSettings`; the shell handles it whenever no scene is live, the DRIVE interstitial included, which also carries a SETTINGS button for touch); the modal's changes apply live (body classes `cb`, `hc`, `reduced-motion`, `font-scale-125|150`, `left-handed`, `no-tooltips`; `data-input-mode="draw"`, `data-aim-assist="1|0"`) and reach a mounted scene at once (it subscribes to the store: palette, rings, the mirror, reduced motion). While any kit modal is open the scene is paused: the time scale is 0, a finger's draft is dropped, the slide and the beats' timers freeze and no input is taken. `app.startDrive` writes `?seed=&arch=&team=&venue=` into the URL (`history.replaceState`, file:// and http) so a reload or a shared link reproduces the drive; entering the moment pushes one history entry and the browser's back button (a phone's back gesture) pops it to the title instead of leaving the page.

**Settings** (`rtg.qb.settings`, sanitised on load; unknown keys are dropped): `audio true · colorblind false · highContrast false · reducedMotion false · fontScale 1 (1 | 1.25 | 1.5) · leftHanded false · aimAssist true · haptics true · tooltips true · keys {confirm ' ', confirmAlt 'Enter', left 'ArrowLeft', right 'ArrowRight', up 'ArrowUp', down 'ArrowDown', throwAway 'x', scramble 'z', run 'r', bendLeft 'q', bendRight 'e', loft 'l', cancel 'Backspace'}`.

**URL**: `?seed=` (a number or a word), `?arch=`, `?team=`, `?venue=` preselect the title; `?debug=1` marks `store.isDebug()`.

**The engine guard** (`app.engineStatus()`): checks `Play.buildContext / snap / live / resolve / driveScript / rating`, `RTG.Field.create`, `Data.plays`, `Tuning.qb.archetypes / demo`, `PlayView.mount / current`, `PlayInput.create`, `Sprites.get`, and that `driveScript` returns a non-empty array; otherwise the page renders the `.engine-missing` card ("ENGINE NOT LOADED"), `app.ready = true`, `app.screen() === 'error'`.

### 3.8 Debug API (`qb/js/debug.js`, always loaded; every return JSON-serialisable)

```js
RTG.debug.current() → {screen, stage, idx, kind, pending, phase, livePhase, t, timeScale, slowLeftS, drafting, target, play, holding,
                       liveSnapshot: {t, phase, carrier, pressure, qb, receivers, defenders, linemen, ball (with path, drawn, h, u, …)} | null,
                       drawing (§3.4.7), sim (the ids: playId, fit, real, shown, sackAt, revealAt, hot, checkdown, field, qbDrop,
                       receivers [{slot, name, skill, speed, route, family, x0, y0, hot, checkdown, ghost}], defenders [{id, pos, role, man,
                       deep, react, trail, cushion, speed, reach}], rushers), ctx (the full PlayContext), situation, plan, events, result}
RTG.debug.forceResult(kind, {target?, input?}) → PlayResult   // from SITUATION / READ it reads and snaps the first pass card (its Live spends
                                                              // the live fork); Play.forcedResult is animated by the scene (view.playResult) and recorded
RTG.debug.drawPass(slot, {loft?, bend?, end?: {x, y}}) → {ok, kind, target, reason, points, loft, spot}   // a straight (or bent) line to
                                                              // reachSpot, through view.commitPass: the programmatic twin of a drawn line
RTG.debug.drawRun(points | 'rollout' | 'rollLeft' | 'rollRight' | 'stepUp' | 'scramble', {relative?}) → {ok, reason, points}   // view.commitRun
RTG.debug.reachSpot(slot, loft) → {x, y, kind, target, preview, previewShown, margin, tooLong, length, maxLen, src, loft} | null
                                                              // live.aim checked with classify, else the best of a classify loop over his route
RTG.debug.classify(points, loft) · fieldToCss(x, y) → client css {x, y} · cssToField(px, py) · qbPoint() → {x, y, chestY, r, fieldX, fieldY}
RTG.debug.throwAway() · live() (the snapshot) · plan() · events() · timeScale() · holding() · unhold() · simIds() · simFull()
RTG.debug.autoThrow({loft?}) → drawPass to the receiver with the best race now (else throwAway)
RTG.debug.replay(idx) → {same, recorded, replayed}          // Play.resolve of a recorded moment vs what was recorded
RTG.debug.seed() → the seed as typed      state() → {screen, phase, drive, script, situation, line, rating, results (with plans), story, settings, rngState}
RTG.debug.skipTo('summary' | 'title')      // finishes the moment in progress on its own Live (Field.replay of the auto plan), then store.autoResolve
RTG.debug.newDrive(opts) next() read() pick(idxOrId) go(id) summary() results() setSettings(obj) tune(path, value) tuningDefaults() perf()
RTG.debug.version → RTG.VERSION   strict (false)
```

### 3.9 Performance and memory rules

- Virtual canvas 192×320 (portrait) / 320×192 (landscape), integer scale (below 2× the fractional fit when it reaches `Canvas.MIN_FRACTIONAL` 1.15), `dpr ≤ 2`, `imageSmoothingEnabled = false` (`RTG.UI.Canvas`, copied). The RAF loop runs only while the scene is mounted; `view.destroy()` stops it and removes every listener and timer.
- Per frame: at most one `live.step`, one `classify` of the draft (plus one for the aim assist's snapped copy), two `drawImage` calls for the pre-rendered stands and field, then the 22 actors (far → near), the rings, the ball, ≤ 32 particles, the draft's dots (two `fillRect`s each: a hard ink shadow and the dot) and the overlays. No text on the canvas at runtime, no allocations in the loop: the palette's colour tokens cached at arm (never `Palette.get` per frame), typed arrays for the 22 actors, shared `pt` / `pt2` / `fpt` / `bpt` points, an insertion sort for the z-order, the draft in pooled buffers (1024 raw samples, 240 resampled points), the aim assist's copy in a 256-point pool, the committed run in typed arrays.
- The engine: measured (Node, as of §0.6; a cold process, means over two runs) `buildContext + snap` (the ghost included) 1.7–2.6 ms, `autoPlan + resolve` 1.7–3.1 ms, a 1/60-s sub-step ≈ 7 µs, `classify` of a 61-point line 12–14 µs; the engine build's warm medians were a sub-step 1.5 µs, classify 3–9 µs, a snap and a resolve 0.3 ms.
- The scene (desktop headless, the scene and shell builds): frame p95 0.4–0.9 ms while drawing and in flight; the e2e budget is 4 ms.
- Pre-rendered once per mount / resize / arm: the three crowd frames (`a` seated, `b` on their feet, `dim` for the groan), the field layer (per layout + yard line), the posts.
- The store keeps no per-frame state; screens unsubscribe in `destroy`.

---

## 4. UI specification

### 4.1 Visual language

The kicker's palette, type and idiom verbatim (`css/style.css`, `js/ui/palette.js` copied): `--navy #1b1f3a`, `--navy-2 #262b4d`, `--cream #f4e9d0`, `--ink #101226`, `--grass #3a8c3f`, `--grass-2 #2e7233`, `--chalk #f2f2e6`, `--gold #f6c445`, `--red #d8433a`, `--sky #7fc7ff`, `--mint #4dbb63`, `--grey #8a8f9e`, `--dusk #5b3a6e`; the Okabe–Ito colour-blind variant (`body.cb`) and the high-contrast one (`body.hc`); "Press Start 2P", 8-px grid, 2-px borders, hard shadows, no gradients. Result banners always carry text + icon.

**Team tints** (`Store.TINTS` by venue; the demo has no team objects, so `Palette.teamTint` is bypassed): HS home `#d8433a / #f2f2e6`, COLLEGE `#f6c445 / #101226`, NFL `#7fc7ff / #f2f2e6`; the opponent `#8a8f9e / #f4e9d0` everywhere. The scene falls back to `situation.team.colors` / `opp.colors`, then `Palette.teamTint(team)` when `team.id` exists, then red/chalk and grey/cream. The palette-tinted tiles (rings, the landing marks, the magnet tick) are re-tinted on every arm and on a settings change, so a palette toggled mid-drive shows at once.

### 4.2 Pixel-art approach and the sprites

`RTG.UI.Sprites` is the kicker's file with the QB tiles **appended** (nothing above them changed; `Sprites.frames('qb_back') → ['qb_back0', 'qb_back1', 'qb_back2']`):

| Tile | Frames | Use |
|---|---|---|
| `qb_back0/1/2` | set · drop · throw | the quarterback from behind (team tint, `look`); also his run frames (0/1) |
| `receiver_run0/1`, `receiver_catch` | run ×2, catch | the five receivers (home tint), drawn `w = max(3, 8 × s)`, `h = max(4, 12 × s)` px; the catch frame for 0.35 s of sim time |
| `defender_run0/1`, `defender_set` | run ×2, set | the eleven defenders (opponent tint); `rusher` (the kicker's block-rush tile) for the RUSH roles |
| `lineman_block` | 1 | the five blockers |
| `ball_2` | 1 | added under the kicker's `ball_3 / 5 / 8 / 11`; the ball picks by size |
| `ring_open`, `ring_closing`, `ring_closed` | 1 each | the separation rings and the preview's landing marker (tint `J`; three **shapes** so cb / hc stay apart) |
| `yard0`–`yard9` | 5×7 | the field numbers at the tens |
| `hot_flag` | 3×3 | over the hot read for the first 1.5 s |
| `target_pick` | 7×6 | bracket corners on the draft's target and on the target in flight |
| `land_x` | 5×5 | the landing mark (tint `J`: gold for a pass, grey for a throw-away, chalk at a run's end, red at a too-long line's drawn end) |
| `aim_tick` | 1 | the aim assist's magnet tick over a snapped landing |
| `tip_star` | 7×7 | the pop where a defender gets a hand on the ball |
| `ball_spin0/1` | 3×3 ×2 | the tipped ball tumbling |

The atlas still carries v1's `lead_ahead` / `lead_behind`; the v2 scene does not draw them. The stands reuse the kicker's `seats / bench / seatsfar / fans_a|b / fansfar_a|b / band_a|b` tiles; the posts are `Sprites.uprights(w, h, …)`; rain / snow are the kicker's particles.

### 4.3 Layout and responsive rules

- The demo has no chrome: `#app.chromeless` is one grid area; `.screen-host` fills `100dvh`.
- **The scene** (`.playview`): the HUD strip on top, the stage (the canvas, centred; `min-height 200px`) with the overlay (the draw HUD, the banners, the toast) and the panel under it (`min-height 136px`; 124 px under 380 px wide); the panel keeps a fixed minimum height in every phase so the canvas never re-fits mid-play. At `≥ 900 px` and on landscape phones (`orientation: landscape` and `max-height: 520px`) the panel becomes a right column beside the stage (`.pv-card-line`, the card's one-liner, shows only on desktop). On landscape phones the draw HUD's chips move to the corners of the sky.
- **Title**: the hero canvas (192×112 virtual, scaled by CSS; max 640 px), the column `max-width 560px` (720 px on desktop), the archetype cards in a 2-column grid (one column under 360 px, four at `≥ 900 px`; the `NO CAP` chip hides under 420 px), pills that wrap.
- **Summary**: the stats grid (2 columns under 360 px, 6 at `≥ 900 px`), the three action buttons in a row at `≥ 900 px`, `max-width 720px`.
- Phone 390×844, narrow 320×568, landscape 844×390 and desktop 1280×800 are verified without horizontal scroll in every phase (the narrow viewport also mid-draw and in flight); `html.is-desktop / is-phone / is-landscape` are set by `app.layout()` (`isDesktop = innerWidth ≥ 900`, `isLandscape = innerHeight < 500 && wider than tall`); resize is debounced 100 ms and routed to the live screen (`view.resize()`).

### 4.4 Screens

| Screen | Layout & components | Calls |
|---|---|---|
| **title** (`.qb-title`) | Hero canvas (the field from behind the QB at dusk: plain rects, 26 stars twinkling via `uiRng`, a foot wobble); logo ROAD TO GLORY / QB / THE MOMENT; the three `radiogroup`s (archetype, team, venue) are one Tab stop each with a roving `tabindex` and the arrows moving the selection; the blurb ("Read the look. Pick the play. Then draw it: a line from the QB to a receiver is the ball's path — fast for a bullet, slow for a lob over the linebacker — and a line into space is your run. The play slows down while your finger draws. Six snaps decide the night."); **ARCHETYPE** ×4 (`button.arch-card[role=radio][data-arch]` with five `C.bar`s, a `NO CAP` chip on the signature, the line of §2.1; tooltips on the bars); **TEAM** pills (`[data-team]` BAD LINE / AVERAGE / GREAT LINE with a line `OL 58 · WR 59 vs DL 55 · DB 56 — a fair fight up front`); **VENUE** pills (`[data-venue]` HIGH SCHOOL / COLLEGE / NFL); **SEED** (`#qb-seed` + RANDOM; shown as `.title-seed[data-seed]`); START THE DRIVE (`[data-action=start]`); SETTINGS; the footer `v1.0.0 · the moment demo · seed n`. Enter on the body or in the seed field starts. Defaults GUNSLINGER / AVERAGE / COLLEGE / a random seed; `?seed= ?arch= ?team= ?venue=` and the summary's TITLE button preselect. | `app.startDrive({seed, archetype, team, venue})` → `store.newDrive` |
| **moment** (`.screen-moment[data-stage=play\|story]`, chromeless) | `data-stage="play"`: the `Moment` host with the scene (§4.5). `data-stage="story"`: the DRIVE card (`.drive-card`, `MOMENT n OF 6`; the result banner `.drive-banner[data-outcome]`; the play / target / text line; the feedback line `.drive-feedback[data-feedback]` `ON THE MONEY · ON TIME · BULLET` (placement · timing · touch, a pass only; no touch on a throw-away); the coach's line; the story `[data-story]`; the running line chips `.drive-line` `12/18 · 141 YDS · 1 TD · 0 INT · 2 SACK · 14 RUSH · RTG 98.4`; NEXT UP: `THE RED ZONE` + `Q3 · 2ND & 7 · OPP 17 · 10-15` + the stakes; NEXT `[data-action=next]` (THE BOX SCORE after the sixth); SETTINGS `[data-action=settings]`; "Escape · settings"). Enter / Space on the body → NEXT. | `store.context()`, `Moment.mount` (→ `Play.snap` / `Play.live`), `store.record`, `store.next`, `app.go('summary')` |
| **summary** (`.summary-screen`) | Header `THE BOX SCORE` / `YOU WON IT` / `THE DRIVE SO FAR` with archetype / team / venue chips; **THE LINE**: `.sum-rating-num[data-rating]` (huge) + `PASSER RATING · SOLID`, six stats (CMP / ATT, YARDS, TD, INT, SACKS (yds), RUSH `yds on n · TD` with `data-rush` / `data-rushes`), "The rating is the passing line; scramble yards are rushing yards.", `LONG · FIRST DOWNS · TURNOVERS`; **THE BEST THROW** (`[data-best]`: `24 YD TD TO Z. MOREAU ON THE POST` + the play, the moment kind and the touch, or **THE BEST PLAY** for a scramble / run when nothing was caught, or "No completion to speak of."); **THE VERDICT** (`[data-verdict]`, by won / rating / turnovers; "You won it with your legs." when the last play was a run); **SIX SNAPS** (`.sum-row[data-idx][data-outcome]`: `3 · RED ZONE · Q3 2ND & 7 · OPP 17 · SMASH → E. Tanaka · BULLET · FIRST DOWN`; a scramble reads `· SCRAMBLE`); PLAY AGAIN (`[data-action=again]`), NEW DRIVE (`new`), TITLE; `seed n · PLAY AGAIN replays this script`. Enter → PLAY AGAIN. | `store.summary()` (→ `Play.rating`), `app.startDrive`, `app.go('title', picks)` |
| **settings modal** (`.settings-modal`, `C.modal`, wide) | GAMEPLAY: Sound, Aim assist ("A pass line that ends near the spot its receiver can reach snaps onto it (a small magnet tick)"), Haptics, Left-handed mirror · ACCESSIBILITY: Reduced motion, Colour-blind palette, High contrast, Font scale 100 / 125 / 150 %, Tooltips · KEYS: Throw / commit the line, Throw / commit (alt), Nudge the end left / right / deeper / shorter, Bend the line left / right, Bullet / touch / lob, Draw a run, Throw away, Cancel the line (press to remap; Escape cancels) and the note "1–5 aim a straight pass at a receiver in slot order (WR1 WR2 SLOT TE RB); the play slows down while you compose; Escape opens this panel." · RESET (danger) · DONE. Switches are `.switch[data-setting]`, pills `.pill[data-setting][data-value]`. | `store.setSetting`, `store.resetSettings`; `app.applySettings` on every change |
| **engine missing** (`.engine-missing`) | A red card `ROAD TO GLORY: QB` — `ENGINE NOT LOADED`, the missing names, where to look. | `app.engineStatus()` |

### 4.5 The moment scene (`RTG.UI.PlayView`)

#### 4.5.1 Mount

`PlayView.mount(container, { ctx, settings, store?, onPick(playId, option) → PlaySim, makeLive(sim) → Live, onDone(result), onResult?(result), onSettings?(), reduced?, tints?: {home, opp}, uiRng?, rng? })`. The shell calls `Play.snap` in `onPick` and `Play.live(sim, rng)` in `makeLive`, so the rng stays in the shell (`rng` is a fallback used only when `makeLive` is absent). A run card's `onPick` returns the resolved sim (`run: true`) and no Live is made.

The view: `{ el, canvas, cv, destroy(), phase(), skip(), layout() → L, resize(), ctx(), sim(), live(), result(), pick(idx | playId) → bool, read(), timeScale() (0.15 while a draft has budget left, 1 otherwise, 0 under a modal), drawing() (§3.4.7), canDraw(), qbPoint() → {x, y (the QB's feet, client css), chestY, r (the start radius, css), fieldX, fieldY}, fieldToCss(x, y) → client css {x, y}, cssToField(px, py) → field {x, y} (the exact inverse on the field, u ∈ [−0.3, 1]; above the horizon reads as the deepest yard), commitPass(points, loft), commitRun(points), throwAway() (→ the engine's {ok, …}; {ok: false, reason: 'NOT NOW'} when not legal), reachSpot(slot, loft) → {x, y, kind, target} | null, project(x, y) → {x, y, s} (virtual), current() → {sim, t, phase, livePhase, play, timeScale, drafting, target, slowLeftS, holding}, actors() → {receivers [{slot, x, y, fieldX, fieldY, open, sep, shown}], defenders [{id, pos, fieldX, fieldY, x, y}], qb {…, startR}, scale} (the drawn positions: the Live's plus the `rest` offset), holding() (the first moment waits for a touch), unhold(), playResult(result) }`. `PlayView.current()` is the live view (null after destroy). Statics: `TIMING`, `FIELD`, `VENUES`, `OUTCOME_TEXT`, `hudParts(ctx)`, `venueOf(ctx)`, `escapeToSettings(ev)`.

**DOM hooks**: `.playview[data-phase = SITUATION|READ|PLAY|RUN|RESULT|DONE][data-live = PRE_THROW|BALL_IN_AIR|AFTER_CATCH|SCRAMBLE|DONE][data-draft = PASS|RUN|THROWAWAY|INVALID|''][data-can-draw = 1|0][data-hold = 1|0]`. `data-can-draw` is 1 only in PLAY after the slide, with the QB holding the ball, not down, no modal: the e2e waits on it before any gesture.

#### 4.5.2 Phases

`SITUATION → READ → PLAY | RUN → RESULT → DONE` (`.playview[data-phase]`). `onDone` fires at DONE.

- **SITUATION**: the field dimmed (`ink` at 0.55); a DOM card (`.pv-situation`: `.pv-sit-down` `3RD & 7`, `.pv-sit-line` `OWN 34 · Q4 0:48 · 21-24`, `.pv-sit-stakes`, `button.pv-go[data-action=read]` TAP TO READ, focused). A tap on the card or the canvas, the button, or the confirm key → READ. A `CLUTCH` sub-banner (900 ms) when clutch.
- **READ**: the canvas draws `ctx.alignment` (the shown look: the defence's spots, the shotgun, the line); `READ THE LOOK` sub-banner (900 ms), then — until the player has drawn once this page — `AFTER THE SNAP: DRAW FROM THE QB` (a sub-banner: the panel's height never changes); the look line above the cards (`.pv-look`: `THEY SHOW: TWO HIGH, CORNERS PRESSED, SEVEN IN THE BOX · POCKET: SHORT` when `ctx.pressure.hot`, and the coverage's `tell`); the cards (`.pv-cards[role=group]` › `button.pv-card[data-play][data-idx][data-sure][aria-label]`: the key `1–3`, the name, an SVG route thumbnail (`svg.pv-routes`, 60×40, the LOS at 30, each route drawn from the receiver's alignment mirrored by side; an arrow for a run), the one-liner (desktop), the advice chip `.pv-advice.chip-mint|gold|red|grey` (`GOOD / OK / BAD / ?`; dimmed `.unsure` with a `.pv-unsure` `?` badge when `sure` is false), up to three tags). Tap / click, or `1–9` → `pick(idx)` → `onPick`.
- **PLAY** (a pass card): `makeLive(sim)`; the offence slides from the READ picture to the Live's `t = 0` spots over `alignMs` 420 (the defence holds its READ spots; they are the Live's start too); a disguised look announces its rotation (`ROTATION · COVER 4`, over the slide + 1.4 s). Then every frame: `live.step(realDt × timeScale)`, the Live's events drive the beats (§4.5.5), the scene reads the positions and draws them. The QB may draw (§4.5.4); THROW AWAY shows while a pass is legal; the drive's first moment — until the player has drawn once this page — **waits at the snap** (`data-hold="1"`, timeScale 0, a gold ring pulsing at the QB's feet, the hint toast `DRAW FROM THE QB — TO A RECEIVER TO PASS, INTO SPACE TO RUN` up) until the first touch on the QB, a key (1–5, R, X) or THROW AWAY (D39; a player who has drawn before gets the toast for 3.6 s), and every moment shows the same line in the panel (`· OR 1-5` with a fine pointer). When the Live reaches DONE the scene holds `doneHoldMs` 650 (150 reduced) and then shows the RESULT; it keeps stepping the Live, which coasts (§2.7.5). After the release the play is skippable (`skipAfterMs` 300, `TAP TO SKIP`): the skip steps the same Live to DONE in 0.25-s chunks (at most 80).
- **RUN** (a run card): v1's beat. The runner (the QB on a SNEAK, the RB on a DRAW) runs `yards` over `runMs 720 + 25/yd` (≤ +600 ms; 120 ms reduced), capped at the goal line; the defence closes a third of the way, the line fires out a yard.
- **RESULT**: the banner (`.pv-banner.pv-banner-good|bad|gold|blocked|neutral` with an icon: the engine's `banner` wins and its `text` becomes the sub-banner when different; `TOUCHDOWN!` gold, `FIRST DOWN` / `CATCH +14` / a positive `SCRAMBLE` good, `INTERCEPTED` / `FUMBLE` blocked, `SACKED -7` / `DROPPED` / `INCOMPLETE` / `TIPPED` bad, `THROWN AWAY` neutral; on the last play a first down that does not score is never `FIRST DOWN`), a gold / red flash (0.55 on a TD, 0.45 bad, 0.25 good), the crowd cheers or groans, the feedback strip (`.pv-feedback-line` `ON THE MONEY · ON TIME · BULLET · AIR 11 · YAC 0`: placement · timing · touch for a thrown ball, AIR / YAC on a catch; `.pv-feedback-coach` the coach's sentence), `aria-live` announces it, `onResult`. Skippable at once; `resultMs` 1200 (`resultReducedMs` 400) → DONE.

#### 4.5.3 The camera and the field

Fixed, behind and above the QB (`PlayView.FIELD`): `project(xYd, yYd)`: `u = yYd / depthYd 50` (clamped −0.3..1), `p = u × (1 + k 1.2) / (1 + k × u)`, `s = 1 − p × (1 − farScale 0.36)`, `x = xC + xYd × pxPerYd × s` (`pxPerYd = W / widthYd 53.33`), `y = yLOS − (yLOS − yHor) × p` with `yLOS = round(H × losFrac 0.73)`, `yHor = round(H × horizonFrac 0.26)` (raised from v1 so a long arm's line stays on screen). The ball's spot is the canvas centre; the field's centre is offset by the engine's `(sideL + sideR) / 2`. A height `h` yd lifts a point by `h × pxPerYd × s × kv 0.8` px. Sprites shrink with `s`; the QB sprite is drawn 1:1 at `y ≥ qbRefYd` −4 and behind, shrinking with depth once he runs upfield.

**The field** (pre-rendered per layout + yard line): out-of-bounds `grass2`, the trapezoid clipped to the sidelines, every other 5-yard band striped, yard lines every 5 (the goal lines 2 px), hash dots every yard at the venue's hashes, the numbers at the tens on both sides (`numbersIn` 8.5 yd from the sideline; `yard0–9` scaled by depth), the end zone when the goal line is within 50 yards (the home tint at 0.8 alpha; `navy2` beyond) and the posts (`Sprites.uprights`, 6.17 yd wide) at the back of it, 1-px sidelines.

**The stands** (`PlayView.VENUES`, the kicker's D25 in miniature; pre-rendered into three W × yHor frames): **HS** (night): stars, dusk / sunset bands, a tree line and a fence, three light poles, one aluminium bleacher under a `HOME n  GUEST n` board; fill `0.35 + 0.45 × pressure`. **COLLEGE** (day): a lower tier and an upper deck rising at the edges, a concourse strip, a marching band, press boxes, two light towers, a framed board; fill `0.6 + 0.2 × pressure`. **NFL** (night): two decks, a lit concourse, a roof with floodlights, a jumbotron showing `HOME / AWAY`, the scores and the quarter; fill `0.9 + 0.1 × pressure`. Common: `+0.1` fill in the clutch; seats empty by a deterministic hash; `draw()` copies `dim` while the crowd groans, else `a` / `b` alternating every `crowdIdleMs` 700 (`crowdCheerMs` 180 while cheering).

#### 4.5.4 The drawing layer

A press within the QB's start radius starts a draft (§4.6.1): `draw.startR` 2.5 yd converted to css px at his depth (`startR × pxPerYd × s × scale`), never under `startMinCss` 22, measured from the segment between his feet and his chest (10 virtual px up). The draft is anchored on the QB (its first point is where he is now), resampled, classified once a frame and drawn:

| Kind | Drawn | Chip (`.pv-draft`) |
|---|---|---|
| PASS | gold dots every 3 virtual px with an ink shadow; 1 px thick for a bullet, fattening to 3 px in the middle for a lob (`1 + round(2 × loft × 4u(1 − u))`); the part past `maxLen` red, with a red X at the drawn end; the landing marker at classify's (cut) end: the preview's ring shape (green / gold / red, `ring_open / closing / closed`) when `previewShown`, else a gold X; the aim assist's tick over it when snapped; the target bracketed (`target_pick`) | `PASS → WR1 · BULLET` (`PASS → WR1 · TOO FAST` for an early pass, `TOO LONG`); `data-kind, data-target, data-touch, data-preview (only when previewShown), data-assist, data-early`; the border shows the preview (solid mint, dashed gold, double red) |
| RUN | chalk footprints every 1.1 yd, alternating 0.4 yd either side, with an ink shadow, and a chalk X at the end | `RUN` |
| THROWAWAY | grey dots every 2 px and a grey X out of bounds (the part past `maxLen` red when it is TOO LONG) | `THROW AWAY` (`TOO LONG`) |
| INVALID | nothing | hidden |
| (aborting) | the line as drawn | `LET GO TO CANCEL` (`data-cancel="1"`) while the finger is back on the QB or the line's end is off the canvas |

`[data-draft]` mirrors the kind. **The finger's intent is sticky** (D38): the kind the line had on the last frame the finger moved holds while it rests — a pass line whose receiver runs past its end stays his PASS (shown RED), a run line a receiver wanders into stays a RUN — and a release without a fresh move commits that kind. A committed run stays as faint footprints (0.6 alpha) ahead of the running QB along what is left of it. The commit: PASS → `live.throwAlong`, a drawn THROWAWAY → `live.throwAlong` (it flies as drawn), RUN → `live.setRun` (a whoosh; the player may draw again: another run, or the pass), INVALID → nothing; an engine refusal shows its reason as a toast. The THROW AWAY button and X → `live.throwAway`.

**The draw HUD** over the field (`.pv-overlay › .pv-drawhud`): `.pv-slowmo[role=meter][data-active 1|0][aria-valuenow = % of the budget left]` (label `SLOW-MO`, a bar `.pv-slowmo-fill`; `.out` and `SLOW-MO OUT` once spent), shown while drafting, and the draft chip. While slow the stage has `.is-slow` (the canvas desaturated, not in high contrast) and the canvas draws letterbox bands (§2.5.6).

#### 4.5.5 The beats (from `live.events`)

`RELEASE`: the throw pose for 0.3 s of sim time, a whoosh, haptic 20, the draft and the hint cleared, `aria` "Ball in the air.". **The flight**: the ball at its ground spot with a two-row shadow there (narrower the higher it is) and the ball sprite lifted by `h` above it (size `3 + 5 × s × (1 + 0.04 h)`: `ball_2 / 3 / 5 / 8`), so a lob visibly rises over the defenders; the rest of the flown path in faint gold dots (every 4 px, 0.45 alpha) to a gold X at the landing; the target bracketed. `TIP`: a star at the ball (drawn 2×, with a one-frame ring pulse) for 0.4 × `tipMs` 480, the ball tumbling (`ball_spin0/1`, the engine's pop), `TIPPED!`. `INT`: a red flash, the bad stinger, `PICKED!` at the pick; the defender carries it back (the engine's return). `CATCH`: the catch frame, a thunk, `CAUGHT!` (700 ms), "Caught."; the carrier runs with the ball at his side, the defence converging (YAC). `DROP` / `INCOMPLETE` / `OUT_OF_BOUNDS` / `THROWAWAY`: a whistle. `SACK`: the QB drawn on his side under the rusher with the ball loose, a 3-px shake decaying over `sackShakeMs` 380, a red flash, thunk, haptic 60. `ESCAPE`: `SLIPPED IT!`. `SCRAMBLE`: `SCRAMBLE!`, "Scramble.". `BROKEN_TACKLE`: `BROKE A TACKLE!`. `TACKLE`: a thunk. `TD`: a gold flash and the crowd (the roar comes with the banner).

#### 4.5.6 The actors and the rings

Every frame the scene copies the Live's QB, receivers, defenders and linemen into typed arrays (blended from the READ picture during the slide), projects them and sorts them far → near. Frames: a receiver runs (two frames every `runFrameMs` 110) when moving faster than 0.5 yd/s, else stands; the catch frame after a catch; defenders run or set, a RUSH role uses the rusher tile; the QB sets, drops, throws, runs (with the ball at his side on a scramble) or lies sacked. The hot flag floats over the hot read for the first 1.5 s. **The rings**: under each receiver whose `shown` is true, from `open` (§2.4.6): green `ring_open` ≥ `open.ring.open` 0.60, gold `ring_closing` ≥ 0.25, red `ring_closed` below; hidden during the slide, after the catch and at DONE.

#### 4.5.7 The HUD (`.pv-hud[role=group]`) and the panel

`.pv-strip` of `.chip.pv-chip` (`hudParts(ctx)`: `3RD & 7` gold · `OWN 34` · `Q4 0:48` (`OT` past Q4; it runs down during a two-minute snap) · `21-24` · `WIND ← 8` · `RAIN`) and the play chip (`.pv-play`, hidden at ≤ 380 px); `.pv-hud-right` › the RUSH meter `.pv-pressure[role=meter]` (`live.pressure`; `.hot` ≥ 70 %; `.clutch`). The panel: `.pv-look`, `.pv-cards`, `.pv-drawbox` (`.pv-hint[role=status]`, `.pv-keys` on fine pointers: the legend built from the live key bindings, `1-5 AIM · ARROWS NUDGE · Q/E BEND · L LOFT · ENTER/SPACE THROW · R RUN · X AWAY · BACKSPACE UNDO`; `.pv-actions › button.pv-btn-away[data-action=throwaway]` THROW AWAY while a pass is legal), `.pv-feedback`. Overlay (`.pv-overlay`, pointer-events none): the draw HUD, `.pv-sub.pv-sub-info|clutch|good`, `.pv-banner`, `.pv-toast` (`START ON THE QB` for a press away from him; `DRAW FROM THE QB` / `1-5 AIM · R RUN · OR DRAW FROM THE QB` for a confirm with nothing drawn; `NOBODY GETS THERE`; the first-moment hint), `.pv-skip`. Reduced motion (`settings.reducedMotion`, `opts.reduced` or `prefers-reduced-motion`): no slide, no shake, no flashes, no TAP TO SKIP, no pulse on the first moment's ring, a 150-ms hold, a 400-ms result, a 120-ms run-card beat; slow motion still works (its chip and time scale) without the bands and the desaturation. The left-handed mirror flips the QB sprite only.

#### 4.5.8 `PlayView.TIMING` (ms unless noted)

`alignMs 420 · throwPoseS 0.3 s · catchPoseS 0.35 s · doneHoldMs 650 · doneHoldReducedMs 150 · tipMs 480 · sackShakeMs 380 · runMs 720 · runPerYdMs 25 · runMaxExtraMs 600 · resultMs 1200 · resultReducedMs 400 · skipAfterMs 300 · bannerFadeMs 300 · subBannerMs 1400 · crowdIdleMs 700 · crowdCheerMs 180 · runFrameMs 110 · hintMs 1600 · firstHintMs 3600 · fastForwardS 0.25 s · fastForwardMax 80 · armMs 200 (a phase ignores a keyboard-made click and a field tap this long after it mounts: a double tap on NEXT) · pausePollMs 100 (a beat's timer re-arms in these steps while a modal is open)`. `FIELD`: `widthYd 53.33, depthYd 50, losFrac 0.73, horizonFrac 0.26, farScale 0.36, k 1.2, kv 0.8, uMin −0.3, hashNfl 3.083, hashCollege 6.667, numbersIn 8.5, ringW 12, ringMinW 6, startMinCss 22, qbRefYd −4, qbBodyVpx 10, passDotPx 3, awayDotPx 2, footYd 1.1, footSide 0.4, moveEps 0.25`.

### 4.6 Input (`RTG.UI.PlayInput`, modelled on the kicker's `ui/input.js`)

`PlayInput.create({ canvasEl, active() (= view.canDraw), pending() (the offence is sliding into the formation: a press on the QB is kept), qbHit(clientX, clientY), toField(clientX, clientY, out), cssHeight(), qbAt(out), propose(slot, loft, out, fast), keys(), onDraftStart(source, mode), onDraftEnd(reason), onCommit({source, mode, points, loft, fresh, slot}), onThrowAway(), onStray(reason) }) → { update(now) → bool (new samples: the finger moved), drafting(), source(), mode(), points() (pooled), count(), loft(), loftName(), speedHps(), overQb() (letting go now aborts), slot() (a keyboard PASS's receiver), cancel(), commit(), proposePass(slot), startRun(), nudge(dx, dy), bend(d), cycleLoft(), setLoft(v), reset(), destroy() }`. It never touches the engine or the clock; the scene owns the time scale, the classify and the commit. Statics: `CONST`, `DRAW_DEFAULTS`, `draw()` (Tuning.qb.draw over the defaults, a shared object), `loftFor(hps)` (→ `Field.loftFor`), `touchName(loft)`, `DEFAULT_KEYS`, `SLOTS`, `keyMatches(e, key)`, `resolveKeys(raw)`.

#### 4.6.1 The pointer (the kicker's capture rules)

1. A press (first pointer only; mouse button 0) inside the start radius (`qbHit`) starts a draft: `setPointerCapture`, `touch-action: none`. A press anywhere else is a stray (`START ON THE QB`). A finger press cancels a keyboard draft. A press on the QB while the offence is still sliding into the formation (`opts.pending`) is kept (captured) and the draft starts on the first move once drawing is allowed.
2. Moves are sampled in client css px (a sample every ≥ 1.5 px of finger travel, up to 1024). A **touch** stroke is drawn above the fingertip: each sample is lifted `min(CONST.touchLiftCss 36, touchLiftRamp 0.5 × the finger's distance from the press)` css px (full after 72 px; a stroke back toward the QB stays under him), so the thumb never hides the line's end or a short run. Once per animation frame (`update`) the new samples become field yards (`cssToField`, the canvas rect cached at the stroke's start; a resize mid-stroke drops the draft), the first point is replaced by the QB's position now, the line is resampled every `draw.resampleYd` 0.75 yd (the last point kept) and smoothed once ([¼ ½ ¼] over the interior), up to 240 points; a frame with no new samples still re-anchors the first point on the QB (he keeps dropping under a resting finger: the draft shown is the draft a release commits).
3. The loft is the stroke's average speed (§2.5.2): the clock starts at the first sample 4 css px from the press (from the sample before it when that one is under 60 ms old, else one frame earlier), so a finger resting on the QB first is not drawing slowly.
4. pointerup commits (with `fresh`: a sample arrived since the last frame — the scene's sticky intent applies only without one), unless the stroke never got 14 css px from the press (a tap is nothing), the finger came back onto the QB after leaving him, or the point it draws is off the canvas (`CONST.cancelOffCss` 0) — both **abort** the line (`overQb()` drives the `LET GO TO CANCEL` chip). pointercancel, a lost capture and a window blur **discard** the draft.

#### 4.6.2 The keyboard (a complete path)

`DEFAULT_KEYS` (`settings.keys` remaps; `A/D`, `W/S` alias the arrows while unremapped):

| Key | Does |
|---|---|
| `1–5` | a PASS draft to that receiver (slot order WR1 WR2 SLOT TE RB): a straight line from the QB to the spot he can reach at the current loft (`propose`: `live.aim`, classify-checked, else the middle of the ends along his route that classify as a pass to him); the line **follows** that spot every frame and the QB's current position; slow motion while composing |
| `←/→/↑/↓` | nudge the line's end 1 yd (field axes: → is +x, ↑ is downfield) |
| `Q` / `E` | bend the line: a quadratic control point at the middle, 1 yd a press, ±15 |
| `L` | cycle BULLET 0 → TOUCH 0.5 → LOB 1 (TOUCH is the default; the line re-aims) |
| `Enter` / `Space` | commit (with nothing drafted: a stray hint); a focused THROW AWAY button keeps its own Space / Enter; auto-repeat ignored. Outside a legal draw the confirm key skips the beats |
| `Backspace` | cancel the draft (also a finger's) |
| `R` (or `Z`) | a RUN draft 5 yd straight ahead of the QB; the arrows steer; Enter commits (a keyboard RUN draft is a run whatever it crosses) |
| `X` | throw it away (`live.throwAway`) |
| `Escape` | settings (the play pauses) |

A keyboard PASS whose line classifies as a RUN is refused with `NOBODY GETS THERE`; one whose line classifies as a pass to ANOTHER receiver (a crosser flooding the spot) is re-aimed straight at the spot the named receiver can reach, and refused (`<SLOT> GETS THERE FIRST`) when that is still someone else's ball — the number never throws to the wrong man. Aim assist does not apply (the line is built on the engine's spot). A held Enter / Space's auto-repeats are swallowed on every screen (they never click a focused button or card).

### 4.7 Audio (`RTG.UI.Audio`, copied)

The kicker's cues, wired: `click` (a pick, the snap, the aim assist's first snap), `thunk` (a sack 1.0, a tackle 0.8, the catch and a pick 0.6, a broken tackle 0.5, a tip 0.4, a run card's snap 0.8), `whoosh` (the release, a committed run, an escape, a scramble), `whistle` (a drop, an incompletion, out of bounds, a throw-away), `stingerGood` / `stingerBad`, `crowd(level)` on arm and at the result, `crowdRoar` on a touchdown, `haptic(ms)` (15 at the snap, 20 at the release, 60 at the sack; `settings.haptics`), `crowdStop` / `heartbeatStop` on destroy. Every cue is optional (wrapped in a try).

### 4.8 Accessibility and QoL

- Keyboard-only path end to end: title (Tab, Enter), the situation card (a focused button), the cards (`1–9`, Tab + Enter), the play (`1–5`, arrows, Q / E, L, Enter / Space, Backspace, R, X), the skips (Space / Enter), the interstitial (a focused NEXT, Enter / Space on the body), the summary (a focused PLAY AGAIN). Escape opens Settings from every screen, including the chromeless scene, and returns to the paused moment.
- The canvas is `role="img"` with `tabindex="0"` (focused at the snap) and an `aria-label` that follows the phase (the situation, the look, "Snap. Draw from the quarterback: to a receiver to pass, into space to run.", "Ball in the air.", "Caught.", "Sacked.", "Scramble.", the banner + the coach's line); `#live` (`aria-live="polite"`) announces the situation, the look, the result, the story and the box score. Cards, buttons, meters (RUSH, SLOW-MO) and groups carry roles and labels; the settings modal traps focus.
- Colour-blind and high-contrast palettes (the rings and the preview marker use three shapes; the draft chip's preview is also a border style; every banner has text + icon), reduced motion, font scale, the left-handed mirror, tooltips on the attribute bars, haptics.
- QoL: the seed shown and editable, RANDOM, PLAY AGAIN with the same seed, the stray hints, THROW AWAY as a button as well as a key and a line, aim assist, the slow-motion budget bar, the feedback strip and the coach's sentence after every snap, `?seed=` sharing.

---

## 5. Test plan

Runner: `node qb/test/run.js` (every `qb/test/*.test.js` in its own process; `node:test` + `node:assert/strict`, no npm; a file whose first 40 lines contain `[balance]` is skipped unless `--balance`; `node qb/test/run.js play` filters by name; a single file: `node qb/test/field.test.js`). `test/load.js` evaluates the `ORDER` files in a `vm` context with no `window` / `document` (or in the main realm with `{realm: 'this'}`) and returns `RTG`. Playwright specs are dev-only: `/opt/node22/bin/node qb/test/e2e/run.js [boot moment controls]` (each spec also runs standalone; the static server serves the repo root; never edit source during a run).

### 5.1 Node unit tests

Last run for this document (`node qb/test/run.js`): **6 of 6 files, 139 tests green** (purity 21, rng 13, util 13, plays_lint 12, field 52, play 28); `balance.test.js` (7) is skipped by default.

| File | Asserts |
|---|---|
| `purity.test.js` (21) | every file under `js/engine` and `js/data` is wrapped in the shim with `'use strict'`, references `window` only in it, none of `document / localStorage / Math.random / Date / setTimeout / setInterval / requestAnimationFrame / performance / console.log / fetch`, no ES2018+ syntax or modules; only `tuning.js` assigns into `RTG.Tuning`; every file parses and the engine loads; every `ORDER` file exists; the namespaces (`CONTRACT`): `Tuning.qb`, `Util` (13 fns), `RNG.create`, `Weather.forGame/perKick/monthFor`, `Data.plays {routes, plays, coverages}`, `Field.create / replay / setup / ghost / frame / alignment / alignReceivers / pathAt / clean / length / truncate / resample / smooth / qbSpeed / recSpeed / defSpeed / ballSpeed / maxLen / apex / heightAt / loftFor / weatherPenalty`, `Play.buildContext / snap / live / resolve / autoPlan / forcedResult / driveScript / rating / pathAt / pocketTime / isClutch / downText / spotText`; `RTG.TuningDefaults()` returns a fresh deep copy and `Tuning` is mutable in place; no numeric leaf is NaN / undefined. |
| `rng.test.js` (13, the kicker's) | mulberry32 vectors; same seed → identical sequence; `state / setState` resume exactly; `gauss` mean / sd and 2 draws; `fork` deterministic, 1 parent draw; `shuffle` a permutation. |
| `util.test.js` (13, the kicker's) | `erf / phi`, `fnv1a`, `template`, `indexBy`, `clamp`, formatters. |
| `plays_lint.test.js` (12) | the data's shape: routes (ids, families, paths from (0, 0, 0) with ascending times, windows), formations, every pass play assigning the five slots once to existing routes, ids / names / tags / `vs` tables, SNEAK and DRAW, the six coverages' looks / disguises / pressureMul / text / tell; the Tuning tables the engine reads by name agree with the data (`field.fit` by advice, `coverage.base` / `run.draw.look` by coverage, `field.reach` / `defSpeed.pos` by group); the eleven (2 CB, NB, 2 S, 2 LB, 4 DL); every coverage gives all eleven a role (MAN names a real slot at most once; ZONE / ROBBER / SPY carry a landmark); every coverage has a GOOD and a BAD answer and short yardage has a SHORT_YDG pass. |
| `field.test.js` (52) | **polylines** (clean, length, truncate, resample, smooth, loftFor); **the frame**; **the Live's shape** (fixed arrays mutated in place, the contract fields); **step** (the dt grid, the carried remainder, the clamp, garbage → 0); **determinism** (same sim + rng + inputs → identical results, events and positions); **live vs resolve** (a drawn pass after odd-sized frames, a rollout then a pass, a replaced run, a scramble, a throw-away: `Play.resolve` of `live.plan()` gives the same result, many seeds); **plan()** (on the grid, a copy, only accepted inputs); **draw counts** (classify / aim / plan / result / snapshot / setRun 0; a PASS release exactly 4; a throw-away 0); **classify** (a line to the aim spot is a PASS to him (≥ 70 of the aim spots), INVALID off the QB / too short / one point / garbage, never mutates, RUN past the line, INVALID once the ball is gone, RUN / THROWAWAY / tooLong and the arm growing with ARM, the colour only at IQ ≥ previewIq, under 0.3 ms for a 60-point line); **the preview is honest** (GREEN ≥ 75 % complete, ≤ 3 % picked, ≥ 30 points over RED); **setRun** (the path at his speed, faster with MOB, replaced, illegal after the release); **throwAlong** (drawn vs flown, landing, arrive = release + length / speed); **throwAway** (out past the nearer sideline, 0 yards, never a turnover, legality); **ball physics** (a lob is slower, the apex grows with the flight, the height profile); **scatter** (grows with pressure, running and length, shrinks with ACC; the flown path drifts off the drawn line); **contact** (a bullet through a linebacker got ≥ 35 %, a lob ≤ 12 %, ≥ 3×; one roll per defender per throw); **a lob is slower** (a defender with time closes); **the catch** (an open man ≥ 88/100; a ball to nobody incomplete; a lone defender picks ≥ 20/100); **the sack** (a QB who never throws: SACK, a loss, TOO LATE, down; ≥ 80 % by 3.5 s, median 2.4–3.4 s); **the rush** (blocked until beatAt, the RUSH meter rises); **rollout** (≥ 0.4 s later on average); **MOB escapes** (MOB 99 > 2 × MOB 10 + 5); **the scramble** (the event, the carrier, no more passing, the pursuit; ≥ 25 seen); **the sideline** (OUT_OF_BOUNDS, behind the line a SCRAMBLE for a loss, never a sack); **the goal line** (TD for a scramble and a catch); **tackles** (yards = air + yac; broken tackles happen); **maxT**; **coverage** (the shown alignment, the rotation into the real roles, man median distance < 3.5 yd, zones near their landmarks); **the rings** (revealAt, open through openSep); **aim** (the fixed point, null when illegal); **a ball led onto the route is caught in stride** (median miss ≤ 0.5 yd, speed ≥ 7 yd/s); **result.catcher**; **result** (null until DONE, the same object, the shape, text and banner rules, the labels; the last play's first down); **events** (time order, SNAP first, RELEASE at the QB, the deciding event last); **after DONE** (coasting changes no result, draws nothing, adds no events); **no NaN under garbage input**; the review fixes: **the edges** (a line 2 yd out of bounds is never a PASS; under wild scatter nobody stands out of bounds while the play is live and no CATCH / INT is made there), **the spot** (td only with the TD event, yards never past the spot, no first down short of the sticks), **the line** (no lineman step faster than `rush.olSpeed`), **running away** (straight back is caught or runs out of the end zone; 13 yd back buys ≤ 0.7 s; a rollout buys more), **the lane before the catch** (a linebacker 1.8–2.5 yd in front of the receiver is got like one 4 yd out), **too long** (an out-of-bounds line past the arm is a TOO LONG throw-away line that flies as a ball to nobody), **the back's path** (no segment faster than his route's fastest), **drawn too fast** (a bullet to a deep man's lofted spot is an early RED PASS; a short scramble line never is), **the break** (`catch.early` costs the same early deep balls ≥ 8 points of completions); **maxT** (a release that cannot land is refused; the timeout's SACK names its sacker). |
| `play.test.js` (28) | **data** (routes, 13 pass plays + SNEAK / DRAW, the coverages); **draw counts** (each call 1 parent draw; rating / autoPlan / forcedResult 0; ctx 8 + 3·cards, pass snap 63, SNEAK 3, DRAW 4, drive 25; a run sim's Live 1 parent, 0 child); **determinism**; **buildContext** (the shape incl. field and alignment; the alignment is the SHOWN look with an exact box count; the disguise rate; advice vs SHOWN / REAL; goodOffered; SNEAK / DRAW; the coverage follows the situation; sackAt with the line, the blitz, POI and the clutch; tolerant inputs); **snap** (the shape; the gun QB at −5 and the drop times; **the call matters**: GOOD − BAD median peak separation 1.2–2.8 yd; the hot read under a BLITZ and five rushers; the checkdown; SNEAK ≈ 70 % on 4th & 1; DRAW a run result); **live / resolve** (a Live at t 0 in PRE_THROW; resolve replays the live play); **autoPlan** (a pass at one of the auto times ≥ 80 %, sacked ≤ 10 %, a run sim → the empty plan, 0 draws); **forcedResult** for every kind; **v1's API is gone** (`Play.throw` and its helpers are not exported); **driveScript**; **downText / spotText**; **rating** (158.3 · 92.4 · 100.7 · 117.2 · 0). |

### 5.2 The balance tests (`balance.test.js` [balance], ≈ 1.5 minutes; `node qb/test/run.js balance --balance`)

Six-moment drives by the headless bots through the real store, fixed seeds (`RTG_BALANCE_SEED` changes the sample). Pinned on AVERAGE (the contract's targets widened for the sample size): **the tiers** EXPERT 72–88 % / ≤ 3 % INT · DECENT 57–73 % / 1.5–6.5 % · NOVICE 37–53 % / 6–14 % INT / 12–28 % sacked, ordered with room between them in completions and expected points · **the line**: behind the BAD line ≥ 6 points fewer completions and ≥ 1.5× the sacks of the GREAT one (DECENT) · **the last play**: EXPERT wins it 28–60 %, NOVICE 4–22 % · **the strategies**: CHECKDOWN 3.5–6.5 yd a play, below DECENT's expected points, (almost) never wins the last play; SCRAMBLER on a DUAL THREAT 3.5–7.5 yd a play but below DECENT passing; ROLLOUT cuts DECENT's sacks by ≥ 30 % at an accuracy cost; LOB_ONLY and BULLET_ONLY each worse than mixing the loft (a bullet-only QB is tipped > 1.5× as often) · **the no-read throw**: QUICK (a touch pass at 0.7 s to whoever looks most open) completes under 72 % and trails DECENT by ≥ 0.2 expected points a play · **the call**: a GOOD call completes ≥ 8 points more than a BAD one (DECENT) · **the archetypes**: the SURGEON has the smallest scatter, the GUNSLINGER the most yards per attempt and the deepest intended air yards, the FIELD GENERAL the best decision rate. This document did not run it; §2.14's table is a separate sample of the same bots.

### 5.3 Playwright flows (`qb/test/e2e/*.spec.js`; Chromium; `H.matrix` = file + http × phone 390×844 + desktop 1280×800)

The harness (`_harness.js`): `openApp / openDemo({mode, viewport, seed, query, debug, blockFonts, dpr, reducedMotion}) → {page, context, errors, foreignErrors, url, close()}`, `waitReady`, `waitForScreen(page, id)`, `waitPhase(page, phase)`, `debug(page, fn, …args)`, `shot(page, name)` → `test/e2e/shots/<name>.png`, `noHorizontalScroll`, `clickButton(page, label)`, `sleep`, `VIEWPORTS {phone, desktop, landscape 844×390, narrow 320×568, tablet 768×1024}`. The helpers (`_playhelpers.js`) draw with **real pointer gestures** (the mouse, or CDP touch on a touch context) from the quarterback along a timed path of moves: `pickArchetype / pickTeam / pickVenue`, `startDrive`, `tapToRead`, `cards`, `bestCard`, `pickPlay` (→ PLAY / RUN / RESULT / DONE), `pickPassCard`, `waitCanDraw` (`[data-can-draw="1"]`), `unhold`, `waitPlayTime`, `chooseTarget({loft, minT, maxT})` (polls `reachSpot` until a race is GREEN, else the best at maxT; it and `waitPlayTime` start the first moment's clock), `gesture(css, {touch, durationMs, onMid, beforeUp, keepDown})` (a touch stroke puts the finger under each point it means to draw: the lift), `drawPass(slot, {speed: 'fast'|'slow', touch, bend, offsetYd, keepDown})` (the stroke time from `Tuning.qb.draw.loft`: fast ≈ back-to-back moves → a BULLET, slow ≥ 0.9 s → a LOB; one correction move if the draft is not yet a PASS to him), `drawRun(points | 'rollout' | 'scramble' | 'stepUp')` (run lines drawn as fast strokes, ends that stay a RUN within 1.5 yd at the slowest ball), `runLine`, `drawThrowAway`, `awayEnd`, `keyPass(slot, {touch, bend, nudge})`, `keyRun({steps})`, `waitReleased`, `waitResult`, `skipResult`, `waitDone`, `next`, `playMoment({how, speed, cardIdx, skip})`, `draftNow`, `drawing`, `live`, `current`, `state`, `geometry`, `touchTap`.

| Spec | Steps & assertions |
|---|---|
| `boot.spec` (5) | matrix: zero console / page errors and zero scene-file errors on boot; `RTG.VERSION`, `RTG.debug`, `RTG.UI.app.ready`, `RTG.Play.buildContext`, `RTG.UI.C.el`, `RTG.UI.Sprites.get` present; `#app` not blank; no `.boot-error`. Plus file + phone with the Google Fonts hosts blocked: still renders. |
| `moment.spec` (9) | **matrix** (seed 4242, GUNSLINGER / AVERAGE / COLLEGE): the title (four archetype cards with 20 bars, the blurb says *draw*, the seed), the six script kinds; six real moments, each through the situation card (TAP TO READ, ≥ 4 HUD chips), 2–3 cards with an advice chip (the first READ is the engine's alignment, 11 defenders), the best pass card → PLAY, the hint line (and the first-moment toast): **1** a fast BULLET (the mouse on desktop, CDP touch on phone), **2** a slow LOB, **3** keyboard-only on desktop (the number key, L, Enter) / a bent line by touch on phone, **4** a drawn rollout then a pass, **5** a drawn scramble past the line, **6** a throw-away line out of bounds; each checks slow motion while drawing (timeScale < 1, the SLOW-MO chip active), the drafted kind and target, the touch and the ball's loft, the banner, the plan in the drive log and that `RTG.debug.replay` of it matches; the summary (the line adds up: attempts + sacks + rushes = 6, a scramble is a rush; the rating; six rows; a verdict); a second visit with the same seed reproduces the script, the first read (cards, advice, the real coverage) and `ctx.alignment`; no horizontal scroll at phone width. Rollout and scramble moments run in real time and accept a SACK as a legal ending. **file desktop**: `forceResult('TD')` from the read, `skipTo('summary')`, PLAY AGAIN keeps the seed and picks, a forced first down moves the next snap · the draw accounting: a hand-drawn moment, a run card and a headless one leave the drive's rng on the same state (3 parent draws each) · Escape → settings on the title and the scene, toggles apply live, aim assist persisted · **narrow** title and summary · **landscape** a drawn moment and the story. |
| `controls.spec` (19) | **matrix** (DUAL THREAT / GREAT LINE / HS, a whole drive): THROW AWAY by its button → a SACK when the QB just stands there (the RUSH meter ≥ 70) → strays and a tap do nothing, then a drawn scramble → a cancelled draft (touchcancel / Backspace) then a drawn pass → the X key (desktop) / a drawn throw-away (phone) → a keyboard run (desktop) / a drawn scramble (phone) → the summary's line adds up. **file desktop**: the first moment waits for the first touch (timeScale 0, no time passes, the hint up, `data-hold`); slow motion (timeScale = `draw.slowMo`, the clock crawls, the chip and the slow band) and its budget (tuned to 1.2 s: then full speed, SLOW-MO OUT, reset per play) · INVALID lines and garbage through the debug hands do nothing, no second throw · the preview colour only for a FIELD GENERAL, everyone sees PASS and the target · aim assist on snaps, off leaves the end · keyboard composing (Enter, 1–5, L, arrows, Q / E, Backspace, R, Enter, Space skips, X) · reduced motion from the OS hint and the setting (no slide, short beats; slow motion still works) · the same `?seed` reproduces the situations, the read and the snap's cast. **narrow**: no horizontal scroll in SITUATION, READ, PLAY, mid-draw, flight, RESULT, the story and the summary. **http desktop**: the frame p95 stays under 4 ms while drawing and in flight. **file narrow + desktop**: after the slide the scene's actors are exactly the Live's positions every frame; a press at the edge of the start circle anchors the line on the QB. **file desktop**: the summary's NEW DRIVE / TITLE. **file phone**: forced INT / DROP / INCOMPLETE beats, then the SNEAK card as a rush. **file phone**: the hands — a press on the QB during the slide draws once it can, the first touch starts the clock, a touch line ends `touchLiftCss` above the fingertip, a line dragged back onto the QB or off the field shows LET GO TO CANCEL and is dropped, a real line still throws. **file desktop**: a finger resting 2.5 s on its pass line keeps it a PASS and the release throws it (no RUN event). The core-rule check allows the ≤ 0.2-yd `rest` offset. Zero console / page errors everywhere. |
| `qa_shots.js` (a tool, not a spec) | seed 4242, a FIELD GENERAL (so the preview shows), through the real screens at phone + desktop (http; `all` adds landscape and narrow): `qb_title / situation / read / snap / draw_bullet / flight / catch / result / story / draw_lob / flight_lob / result_lob / draw_run / run / result_run / sack / result_sack / int / result_int / tip / summary_<vp>.png` into `test/e2e/shots/` (the INT and the tip with the engine's contact odds tuned to certain for that one throw). |

The specs hold 33 tests (boot 5, moment 9, controls 19).

### 5.4 Definition of done (per module, inherited from the kicker)

Unit tests green; purity green; `node --check` on every touched file; the public API matches §3.5; no `console.log` in engine code; JSDoc with the draw count on every exported function; the e2e specs green with zero console errors; the bundle (`node qb/tools/bundle.js`, full and `--fragment`) boots at 390 / 1280 / 320 px with zero errors and no horizontal scroll.

---

## 6. The career to come

The player's fourth answer (D2) was "the full career later". The seam is already cut: `RTG.UI.Moment.mount` depends only on `{ctx, Play, PlayView, rng}`, and `Play.buildContext` takes a plain situation with optional `qb / team / opp / weather` blocks. A career hosts the moment screen unchanged by building that situation from its game state, recording the `PlayResult` and the plan into its own stats and log. What follows is a list, not a design.

**What the kicker's career gives the QB game for free** (its `engine/` and `ui/` machinery is generic over "a session of user plays inside a simulated game"):

- **The hub, the week loop and the season** (`Season`, `Schedule`, `Standings`, the `hub` / `schedule` / `standings` / `postgame` screens): the week card, PLAY GAME / SIM GAME / SIM TO END OF SEASON, the drive log, the 48 real colleges and the fictional 32-team NFL with their schedules, tiebreaks, rankings, playoffs and bowls.
- **Training** (`Player`, the XP economy, the weekly focus card, the offseason blocks, the `training` screen), with the attribute keys swapped for `ARM / ACC / IQ / MOB / POI` and the archetype signature uncapped (`Tuning.qb.archetypes[].signature` already names it).
- **Events, headlines and the inbox** (`Events`, `data/events`, `data/headlines`): the schema, the roll, the ring buffers, the effect machinery; the copy needs a QB pass.
- **Contracts, agents, free agency, tags, cuts** (`Contracts`): the offer generation and the counter; the money scale changes but the machinery does not.
- **The draft and the combine** (`Draft`): the value → round table and the ticker.
- **Money** (`Finance`, `data/finance`, the FINANCES step): untouched by the position.
- **Stadiums**: the venues are already in the scene (§4.5.3) and `ctx.venue` comes with the team.
- **Save / load** (`Save`, `Schema`, the slots, export / import, migrations): the demo deliberately kept no save (D17), so the career brings its format with it. A plan is small JSON; storing plans makes every key play replayable.
- **The kit**: the store / router / components, settings, the debug panel, the palette, the sprites, the canvas, the audio, the accessibility rules, the e2e harness idiom.

**What must be QB-specific:**

- **Stats and splits**: a passing line per game / season / career (`att, cmp, yds, td, int, sacks, rush`) instead of FG buckets; `Play.rating` is the headline number; splits by down, distance, coverage, pressure, weather, touch (BULLET / TOUCH / LOB) and placement; the "key plays" log replaces the kick log (the store's results entry, with its plan, is the row shape to keep).
- **Awards and records**: passing titles, an MVP-style award, rookie honours, season / career records for yards, touchdowns, rating, game-winning drives, and legends to chase.
- **The sim's dependence on the QB, the line and the receivers**: the moment already reads `situation.team.ol`, `wr[5]` and `opp.dl / db`, so the roster needs real linemen and receivers with `skill / speed` that progress, get hurt and leave (the demo's presets are the seam); the team's offence in simmed snaps must depend on the quarterback.
- **Key-play selection per game**: the sim decides which snaps are moments (the demo's six kinds are the natural catalogue; the kicker's `USER_KICK` event is the pattern: a `USER_SNAP` event carrying the situation), and every other snap is resolved headlessly with `Play.resolve(sim, Play.autoPlan(sim), rng)` (or a bot brain from `test/fixtures/bots.js` for a quarterback of a given skill). A per-game budget of moments (3–6) is a pacing decision.
- **Progression and aging** curves for the five attributes, traits, injuries that fit a quarterback, QB1 / QB2 job security, and difficulty tiers that scale the scatter, the disguise rate, the slow-motion budget and the preview gate.
- **The senior season and the camps** with drawn throws instead of kicks.
- **AI quarterbacks** for the league sims (an `AIQuarterback` like `AIKicker`) so awards and records are earned against real simulated lines.

*End of specification.*
