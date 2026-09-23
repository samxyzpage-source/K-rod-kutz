# ROAD TO GLORY: QB — Build Specification (The Moment)

**Version:** 0.1 (the moment demo, as built)
**Status:** DESCRIPTIVE. This document records what is in `qb/` today — every number is the one in `Tuning.qb` (`qb/js/engine/tuning.js`) and every shape is the one the code returns. Where the build contract and the code differed, the code is documented here and the difference is listed in §0.5. Changes require a note in §0.4.
**Repo location:** `qb/` (a sibling of `kicker/`, which is never edited — it is the style guide and the source of every kit file).
**Audience:** whoever picks this up next: the career build (§6) hosts the moment screen unchanged, so the contracts in §3 are the ones to keep.

---

## 0. How to read this document

### 0.1 Document map

| Part | Section | What it covers |
|---|---|---|
| A. Game design | §1 pitch, pillars, pacing · §2 attributes, the read, the snap, the throw, the runs, the drive script, the rating, weather, the measured balance | The rules and every formula, with worked numbers |
| B. Technical | §3 files, namespace, shapes, `RTG.Play` API, the RNG draw contract, the store, the debug API, performance | Binding for anything that hosts the moment |
| C. UI | §4 visual language, sprites, layout, screens, the moment scene, input, audio, accessibility | The scene and the demo's shell |
| D. Tests | §5 Node engine tests and Playwright flows | What is asserted and how to run it |
| E. Later | §6 the career to come | What the kicker's career gives for free and what a QB needs of its own |

### 0.2 Terminology

- **Engine**: DOM-free JS under `qb/js/engine/` and `qb/js/data/`. Loadable in Node through `qb/test/load.js`. Never touches `window`, `document`, `localStorage`, `Date`, `Math.random`, timers.
- **UI**: everything under `qb/js/ui/`, `qb/css/`, `qb/index.html`, plus `qb/js/debug.js`.
- **Moment**: one snap of football, played in full: the pre-snap read, the throw (or the tuck, the throwaway, the sack), the result. The only thing the player ever plays.
- **Situation**: the plain object that describes a snap before anything is rolled — `{down, toGo, yl, quarter, clock, score, venue, weather, qb, team, opp, …}`. In the demo it comes from the drive script (§2.6); in a career it will come from a game.
- **PlayContext / PlaySim / PlayResult**: the three engine shapes of a moment (§3.4): what the defence shows and which plays are offered → what happens after the snap → what the throw did.
- **PlayInput**: `{kind, target, t, lead, loft, power, quality, green}` — the ONLY thing the scene hands to `Play.throw` (§2.4.1). The QB's kick triple.
- **rng**: the seeded mulberry32 instance (`RTG.RNG`, copied from the kicker). The engine's only source of randomness. Every engine call forks it exactly once (§3.6).
- **uiRng**: the store's non-persisted RNG for cosmetics (title stars, a random seed). Never reaches the engine.
- **Tuning**: `RTG.Tuning` — `Tuning.qb` holds every balance constant of the moment; `Tuning.weather` and `Tuning.difficulty.pro.windCap` are the kicker's blocks the copied `engine/weather.js` reads.
- **yl**: the field position in yards from the player's own goal line (0..100; 80 = the opponent's 20). **t**: seconds since the snap. Screen positions are virtual px (§4.2).

### 0.3 Non-negotiable constraints (the kicker's, inherited)

1. Static site. Plain HTML5 + CSS + vanilla JS + `<canvas>`. No build step, no npm dependencies at runtime, no modules, no frameworks. Works on `file://` and on any static host. Classic `<script>` tags in order; one global `window.RTG`.
2. ES2017 at most: no `?.`, no `??`, no class fields, no optional catch binding. Every file in the shim `(function (root) { 'use strict'; var RTG = root.RTG = root.RTG || {}; … })(typeof window !== 'undefined' ? window : globalThis);`.
3. Only optional external resource: Google Font "Press Start 2P" with a Courier fallback. Fully playable offline.
4. Phone-first (390×844 with 16-px gutters, no horizontal scroll; 320 px must still work), desktop 1280×800, landscape 844×390. 60 fps on a phone: no per-frame text on the canvas (HUD text is DOM), no allocations in the draw loop, at most 200 draw calls a frame.
5. Seeded RNG. No `Math.random` in engine code. A drive is reproducible from `{seed, archetype, team, venue, inputs}`; `?seed=` in the URL replays one.
6. Strict engine/UI separation; the engine is unit-testable in Node via `vm`.
7. `RTG.debug.*` for Playwright: force results, skip to the summary, read state.
8. Fictional names everywhere (the demo's five receivers per preset are invented).

### 0.4 Decision log

| # | Topic | Decision | Rationale |
|---|---|---|---|
| D1 | The request (the player's words) | *"Let's make one of the same style, but with a qb. You should only play the moments kinda like the game soccer superstar."* The QB game is built in the kicker's idiom — Retro Bowl-style pixels, the same palette, chips, banner beats and the aim-then-hold hand — and the player only ever plays snaps, never a whole game. | The kicker is the style guide; "only the moments" is the design. |
| D2 | What a moment is (asked and answered) | Four questions were put to the player and answered: **(1)** a moment is a **pre-snap read** (the defence shows a look; pick one of 2–3 plays) **and then the throw**; **(2)** **only the key plays** of a game are played (a third down, the red zone, short yardage, the two-minute drill, the last play); **(3)** the camera sits **behind the QB**, over the shoulder, like the kicker's kick scene; **(4)** **the full career comes later** — this build is the playable demo of the moment on its own page (`qb/index.html`) with its own single-file bundle. | The answers fix the scope: one scene, one screen flow, no career state. |
| D3 | Kit forked, not shared | `qb/` copies the kicker's kit files verbatim (`00_namespace`, `util`, `rng`, `weather`, `storage`, `palette`, `components`, `canvas`, `audio`, `sprites`, `style.css`) with only the game name in the header changed, and `sprites.js` is extended below the kicker's atlas. `kicker/` is never edited. | The two games must be able to drift apart without breaking each other; the copy is the contract. |
| D4 | One fork per engine call | `Play.buildContext`, `Play.snap`, `Play.throw` and `Play.driveScript` each cost the parent rng **exactly one draw** (a fork) and draw everything else on the child in a fixed order (§3.6). A run option and a forced result still consume the throw fork, so **every moment costs the drive's rng exactly 3 draws** whatever the player does. | A drive replays from its seed no matter how the moments were played; the tests pin the counts with a draw-counting rng. |
| D5 | The green band follows the receiver | The velocity bar's green band is not static like the kicker's: it is recomputed **every frame of the hold** from the engine's own rule (`Play.need`: the arrival at full power and the route's ideal loft, then `needFor` / `greenBand`), so the band the player releases in is the band the engine verifies for `input.green`. | The receiver keeps running while the bar climbs; a static band would lie by the time the ball came out. Verified equal to 3 decimals on three seeds. |
| D6 | Green is verified, not trusted | `input.green` is the scene's claim; `Play.throw` re-checks it with `Play.inGreen(power, need, band)` and, only when it holds, floors `quality` at `throw.greenQuality` (0.88). An unverifiable claim is ignored. There is no "green = guaranteed" (the kicker's D21): a green throw is an on-time, well-thrown ball, and it can still be dropped or contested. | The band is a promise about timing, not about the outcome; interceptions stay impossible on a green throw into an open window (D7), which is the promise the game can keep. |
| D7 | Interceptions gate on the window, rings agree with the engine | A ball is only ever picked when the window at the arrival is under `throw.intWindow` (0.70) **and** the ball is imperfect (accuracy < 0.92): `pInt = 0.42 × (1 − window)`. `Tuning.qb.open.ring = {open: 0.70, closing: 0.25}` publishes the thresholds and the scene colours a receiver's ring by **the openness a ball released now would find at its arrival** (`Play.openIfThrown`: full power, the route's ideal loft — the same time base as the INT gate), not by the openness at this instant, so a **green ring means "cannot be picked"**, gold means a closing window (≈ 15–20 % pick risk on a late ball), red means closed, grey means beyond the arm (`Play.maxDist`). | The contract named `intWindow` without a value; a throw at the plateau of an open receiver is provably safe and a throw into a closing one carries real risk. Colouring by the present openness made every deep ring red at its correct release (the review's probes: 8 % picks on green, 35 % on deep green). |
| D8 | Extra phases SACK and RUN | The scene's state machine is `SITUATION → READ → SNAP → THROW → FLIGHT \| SACK \| RUN → RESULT → DONE`. A sack and a run (scramble, SNEAK, DRAW) have their own beat between THROW and RESULT. | A sack is not a flight; a run needs a runner. |
| D9 | The offence slides into the formation | At the pick the offence slides from the READ picture (the shotgun, the engine's read alignment) into the play's formation over `TIMING.alignMs` (420 ms; 0 with reduced motion) **before** `t` starts, and a back or slot released from the backfield joins the engine's line-of-scrimmage path over `releaseS` (0.5 s). | The engine re-aligns receivers per formation; a jump cut looked like a bug. |
| D10 | Thirteen pass plays, not twelve | `QUICK OUTS` was added for short-yardage variety, and after a balance probe found no BAD play vs COVER 3, `FOUR VERTS` and `FADE` became BAD vs COVER 3 and `SCREEN` BAD vs MAN. Every coverage now has ≥ 2 BAD and ≥ 4 GOOD plays. | The read has to matter against every look. |
| D11 | Short-yardage cards | `SNEAK` at `toGo ≤ 2`, `DRAW` at `toGo = 3`, never both; a run card sits next to exactly `read.runCardsMin` (2) pass cards, so the options are always 2–3 cards. `SNEAK` on `3rd/4th & 1` is always advised GOOD. | The scene expects 2–3 cards; a sneak from the 3 is not a sneak. |
| D12 | `peakAt` is the centre of the plateau | The best moment to arrive is the centre of the run of samples within 0.02 of the peak, not the first sample at the max. | The honest "best moment" for the auto-thrower, the helpers and the feedback. |
| D13 | The openness envelope continues past 4 s | `open[]` holds 41 samples over the arrival time 0..4 s, but `Play.openAt` continues the envelope analytically from `rec.env {wo, wc, peak}` after 4 s. | A 50-yard ball released late lands after 4 s and must find the window closed; the probe caught it. |
| D14 | `rating` is the NFL formula | `Play.rating` implements the exact NFL passer rating. The contract's example (20/30, 250 yd, 2 TD, 1 INT → 92.4) was wrong: that line is 100.7; 92.4 is the same line for 190 yards. The test pins 158.3, 92.4 (190), 100.7 (250), Brady 2007 = 117.2 and 0 attempts → 0. | A wrong constant in a spec is still wrong. |
| D15 | `window` is a string key | The purity scan forbids the bare identifier `window` outside the shim, so the contract's `window` fields (on routes, receivers and results) are written through `var WINDOW = 'window'`. The shapes are exactly as specified; only the source spelling differs. | Keeps the DOM scan strict. |
| D16 | The drive continues on a first down | Between moments the shell advances the story: a first down (or any gain on 1st/2nd down) carries the gain into the next script entry's `yl` (clamped −10..+40 and capped per kind so a red-zone snap stays a red-zone snap); a turnover, a failed 3rd/4th down, a touchdown or the last play resets it ("the defence holds; next possession"). | Six scripted snaps still feel like one night. |
| D17 | No career save; settings only | `RTG.UI.Storage` persists only `rtg.qb.settings` (separate from the kicker's `rtg.settings`). A drive is reproduced by its seed, not saved. | The career (§6) brings the save format; the demo must not invent one. |
| D18 | The pressure meter is the sack clock | The HUD's RUSH meter is `t / sim.sackAt`; there is no separate play clock. Poise buys pocket time in the engine (`pressure.poiW`, `clutchMul`) rather than slowing a UI meter; `ctx.pressure.meterMul` is computed but the scene does not read it (§0.5). | One clock the player can feel; the engine owns it. |

### 0.5 As built vs the build contract (drift, resolved in favour of the code)

| Where | The contract said | The code does |
|---|---|---|
| `Data.plays.plays` | about 12 pass plays | 13 (D10) |
| `Play.rating` | 20/30 250 2 1 → 92.4 | 100.7 (D14) |
| `throw.intWindow` | a name, no value | 0.70; `open.ring` publishes it (D7) |
| `Tuning.qb.read` | `{disguise, iqSees, iqExact, goodOffered, revealBase, revealIq}` | plus `options`, `sneakToGo`, `drawToGo`, `runCardsMin`, `hotBelow`, `weights` |
| `Tuning.qb.pressure` | `{base, olW, dlW, poiW, clutchMul, sigma}` | plus `up`, `down` (tanh soft caps), `mulExp`, `clutchClock`, `clutchMargin`, `snapSigma`, `min`, `max`, `rushers` |
| `fit` | `1 − \|lead − ideal\| × wL − \|loft − ideal\| × wF` | minus a hot-ball term `0.8 × max(0, power − (need + band))` |
| YAC | from speed / skill and the route | from the route family, speed and the **window** (skill only shapes the openness peak and the drop chance) |
| `PlayContext.pressure.meterMul` | the HUD meter runs slower in the clutch for high POI | computed, unused by the scene (D18) |
| Phases | `SITUATION → READ → SNAP → THROW → FLIGHT → RESULT → DONE` | plus `SACK` and `RUN` (D8) |
| RESULT skip | skippable after 300 ms | FLIGHT after 300 ms; RUN / SACK / RESULT immediately |
| SCRAMBLE button | when MOB ≥ `scramble.minMob` | and only from `t ≥ 0.3 s` (`TIMING.scrambleAfterS`) |
| `PlayView.mount` callbacks | `onPick(playId)`, `onThrow(input)` | `onPick(playId, option)`, `onThrow(input, sim)`; extra `onResult`, `onSettings`, `tints`, `uiRng` |
| HUD wind chip | `WIND 8` | `Weather.label`: `WIND ← 8` / `CALM` / `DOME`, plus a weather-kind chip (`RAIN`, `SNOW`, `FOG`, `COLD`, `HEAT`) |
| Settings | reduced motion, colour-blind, high contrast, font scale, left-handed mirror, sound | plus green assist, haptics, tooltips, eight key remaps, RESET |
| `RTG.debug` | `forceResult, current, seed, state, skipTo` | plus `autoThrow, newDrive, next, read, pick, go, summary, results, setSettings, tune, tuningDefaults, perf` |
| `qa_shots` | title, read, snap, throw, flight, result, summary | plus situation and story |
| `PlayView.needFor(dist, ARM)` | — | a UI fallback with its own constants (`rangeBase 40, rangePerArm 25, base 0.2, span 0.8`), used only when `RTG.Play` is missing; with the engine present the band is `Play.needFor` (D5) |

---

## 1. Game overview

### 1.1 Pitch

You are the arm. Everything before the snap is a picture the defence painted for you, and everything after it is a window that opens and closes in a second and a half. *Road to Glory: QB* takes the kicker's promise — you only play the plays that are yours — and gives it to the quarterback: read the look, pick the play, find the man, put the ball where he will be. The demo is one night, six snaps: a third and medium, a third and long, a red-zone snap, a fourth and short, the two-minute drill and the last play with the game on the line. Then the box score and a passer rating.

### 1.2 Pillars (pinned above every monitor)

1. **The read must feel like a bet.** The look is honest most of the time and a lie some of the time; IQ decides how often, and how much the card can tell you.
2. **The window must be seen, not counted.** The rings turn green, gold, red under the receivers' feet, from `revealAt` on — earlier for a smart quarterback — and the green band on the bar follows the man as he runs.
3. **The rush must be felt.** The RUSH meter is the sack clock; the pocket folds at `sackAt` and the ball comes out then, or it is a sack, whatever your finger was doing.
4. **Green means on time, not free.** A release in the band is a well-thrown ball that arrives when the window says it should; it can still be contested. It cannot be picked into an open window.
5. **Every number is a mechanism.** ARM → velocity and range · ACC → the band and the scatter · IQ → the disguise rate, the reveal, the card · MOB → scramble yards and sack escapes · POI → pocket time and the pressure penalty.

### 1.3 Pacing budgets

| Unit | Target | Notes |
|---|---|---|
| A moment | 10–15 s | situation card → read (2–3 cards) → 0.4 s align → up to `sackAt` (≈ 2.1–3.4 s) → flight (`flight × 0.75`, ≥ 0.26 s) → result 1.2 s |
| A drive (six moments) | 1.5–3 min | with a DRIVE interstitial between moments |
| The summary | as long as you like | PLAY AGAIN (same seed) / NEW DRIVE / TITLE |

### 1.4 What the demo is, and is not

It is: the title (archetype, team preset, venue, seed), six moments through the real scene and the real engine, the story between them, the box score. It is not: a career. There is no XP, no team, no season, no save. §6 says what comes next and what it inherits.

---

## 2. Game design

### 2.1 Attributes and archetypes

Attributes are integers 0..99 (`Tuning.qb.attrMax` 99; ratios below divide by it).

| Attr | Key | Governs |
|---|---|---|
| Arm | `ARM` | ball velocity (`throw.armBase 0.7 + 0.3 × ARM/99`), the deep range (`throw.maxDist 48 × (0.75 + 0.35 × ARM/99)`: 45.3 yd at 55, 48.2 at 72, 52.8 at 99), the on-time power `need` |
| Accuracy | `ACC` | the green band width (`0.16 + 0.10 × ACC/99`: 0.215 at 54, 0.233 at 72, 0.26 at 99) and 60 % of the accuracy score (`throw.accW`) |
| IQ | `IQ` | the disguise rate (§2.2.2), when the rings appear (`revealAt`), whether the card's advice is against the real coverage (`read.iqExact` 80) |
| Mobility | `MOB` | scramble yards (`scramble.perMob 0.08`/pt), the sack-escape roll, the fumble chance, whether the SCRAMBLE button appears (`scramble.minMob` 55) |
| Poise | `POI` | pocket time (`pressure.poiW` 0.004 s/pt), the clutch shrink of the pocket (`clutchMul` 0.30 × (1 − POI/99)), relief from the pressure penalty (`throw.poiRelief` 0.6) |

**Archetypes** (`Tuning.qb.archetypes`; the signature attribute is the one the kicker's D24 rule leaves uncapped in the career — here it simply starts at 72):

| Archetype | ARM | ACC | IQ | MOB | POI | Signature | The card's line |
|---|---|---|---|---|---|---|---|
| GUNSLINGER | **72** | 54 | 52 | 52 | 56 | ARM | A cannon and a short memory. Throws it deep and asks later. |
| SURGEON | 55 | **72** | 58 | 50 | 56 | ACC | Puts it on the numbers. Lives in the green. |
| FIELD GENERAL | 55 | 58 | **72** | 50 | 60 | IQ | Sees the disguise before the snap. Knows where the window is. |
| DUAL THREAT | 56 | 52 | 50 | **72** | 55 | MOB | When it breaks down, he leaves. The legs buy time. |

The demo's default archetype is `FIELD_GENERAL` in the engine (`demo.defaultArchetype`, used when a situation carries no `qb`) and `GUNSLINGER` on the title screen. Every QB is right-handed unless `qb.foot === 'L'` (presentation: the left-handed mirror).

**Team presets** (`Tuning.qb.demo.teams`; usable as `situation.team` *and* `situation.opp`):

| Preset | OL | DL | DB | WR1 | WR2 | SLOT | TE | RB |
|---|---|---|---|---|---|---|---|---|
| BAD ("BAD LINE") | 30 | 78 | 70 | T. Vance 48/62 | R. Okafor 42/55 | J. Pruitt 45/50 | B. Holm 40/38 | D. Sykes 44/58 |
| AVERAGE | 58 | 55 | 56 | D. Cross 66/70 | M. Reyes 58/64 | K. Abara 60/60 | S. Lindqvist 55/44 | A. Booker 56/66 |
| GREAT ("GREAT LINE") | 80 | 50 | 48 | Z. Moreau 82/86 | C. Whitfield 74/78 | E. Tanaka 76/72 | G. Marchetti 70/52 | L. Batiste 70/80 |

Receivers are `skill/speed`. A `team.wr` given as a number (a skill level) builds five generic receivers from `demo.defaultRoster` (`WR1 +6/+8, WR2 0/+4, SLOT +2/0, TE −4/−14, RB −2/+6`); a missing team or opponent uses `demo.defaultTeam` (`AVERAGE`).

### 2.2 The pre-snap read (`Play.buildContext`)

#### 2.2.1 Coverages (`Data.plays.coverages`, in `Data.plays.order`)

| Id | Look: safeties · press · box · blitz tell | Can disguise as | `pressureMul` | Tightness SHORT / MID / DEEP | What you see (`text`) |
|---|---|---|---|---|---|
| COVER2 | 2 · press · 7 · no | COVER4, MAN | 1.0 | 0.60 / 0.40 / 0.35 | Two high, corners pressed, seven in the box. |
| COVER3 | 1 · off · 8 · no | MAN, BLITZ | 1.0 | 0.35 / 0.50 / 0.65 | One high, corners off, eight in the box. |
| COVER4 | 2 · off · 6 · no | COVER2 | 0.9 | 0.30 / 0.50 / 0.75 | Two high and deep, corners off, six in the box. |
| MAN | 1 · press · 7 · no | COVER3, BLITZ | 1.1 | 0.55 / 0.55 / 0.50 | One high, everybody pressed, seven in the box. |
| BLITZ | 1 · press · 8 · **yes** | COVER3, MAN | 1.6 | 0.30 / 0.45 / 0.55 | One high, pressed, eight in the box and the nickel is creeping. |
| PREVENT | 2 · off · 5 · no | COVER4 | 0.7 | 0.15 / 0.40 / 0.90 | Two high and backing up, corners way off, five in the box. |

Each coverage also carries a `tell` (the coach's line for the look; e.g. COVER3 "Three deep and soft underneath. Take the curls all day."). The context exposes the **shown** coverage's `look`, `name`, `text` and `tell`; `ctx.real` is never drawn before the snap.

**The real coverage** (1 child draw, `rng.weighted`): `coverage.base` `{COVER2 0.20, COVER3 0.30, COVER4 0.15, MAN 0.20, BLITZ 0.10, PREVENT 0.05}` × the situation's multipliers × `opp.tendency` (a `{coverageId: weight}` table, optional):

| Situation | Rule (`Tuning.qb.coverage`) | Multipliers |
|---|---|---|
| long | 3rd/4th down and `toGo ≥ longToGo` (7) | BLITZ ×1.8, COVER2 ×0.8, PREVENT ×0.6 |
| short | `toGo ≤ shortToGo` (2) | MAN ×1.3, BLITZ ×1.3, COVER4 ×0.5, PREVENT ×0 |
| red zone | `yl ≥ redZoneYl` (80) | COVER4 ×0.4, MAN ×1.4, COVER2 ×1.2, PREVENT ×0 |
| late | Q4+, `clock ≤ lateClock` (120 s) and the **defence leading** | PREVENT ×6, BLITZ ×0.6, COVER4 ×1.3 |

#### 2.2.2 The disguise

`pDisguise = read.disguise (0.40) × (1 − IQ/99 × read.iqSees (0.85))`; the alternative is `rng.pick(real.disguises)` (always drawn, used only on a disguise). IQ 20 → 33.1 %, 52 → 22.1 %, 58 → 20.1 %, 72 → 15.3 %, 80 → 12.5 %, 99 → 6.0 %. `ctx.disguised = shown !== real`.

#### 2.2.3 The cards (`ctx.options`)

- Count: `rng.int(read.options.min 2, max 3)`. On short yardage a run card replaces one: `SNEAK` at `toGo ≤ read.sneakToGo` (2), `DRAW` at `toGo ≤ read.drawToGo` (3) — never both — next to `max(read.runCardsMin 2, n − 1)` pass cards.
- A GOOD-vs-real pass card is present with probability `read.goodOffered` (0.85): when the roll succeeds one GOOD play is drawn first, when it fails GOOD plays are excluded from the pool (so the rate is exact). The rest are weighted picks from the pool, then shuffled.
- Pool weights (`read.weights`, multiplied by tag; 0 removes a play): `toGo ≤ 3` (`shortToGo`) → `short {SHORT_YDG ×2, QUICK ×1.5, DEEP ×0.4, PA ×0.5}`; `toGo ≥ 8` (`longToGo`) → `long {DEEP ×1.5, SCREEN ×1.3, SHORT_YDG ×0.6, QUICK ×0.8}`; a last play from at least 25 yards out (`lastPlayToGoal`) → `lastPlay {DEEP ×2, QUICK ×0.4, SCREEN ×0.3, SHORT_YDG ×0.3}` instead of the short/long rule; within 20 yards of the goal (`redZoneToGoal`) → additionally `redZone {DEEP ×0.3, PA ×0.6}`.
- **Advice** (the chip the card SHOWS): the play's `vs` rating against the **real** coverage when `IQ ≥ read.iqExact` (80), else against the **shown** look — so a disguised blitz fools the card too. `ctx.adviceFrom` says which (`'REAL'` / `'SHOWN'`). `SNEAK` at `toGo ≤ 1` is always GOOD.
- Each card: `{id, name, formation, routes: [{slot, route}], advice: 'GOOD'|'OK'|'BAD', tags, run, line}`.

#### 2.2.4 The pocket, the ball, the reveal

- `pocket = Play.pocketTime(ol, dl, real, attrs, clutch)` (§2.3.5); `ctx.pressure.sackAt = clamp(pocket + gauss(0, pressure.sigma 0.25), 1.2, 4.2)`; `hot = real === 'BLITZ' || sackAt < read.hotBelow (2.1)`; `clutch = Play.isClutch(sit)`; `meterMul = clutch ? 1 − 0.15 × (1 − POI/99) : 1` (unused by the scene, D18).
- **Clutch** (`Play.isClutch`): Q4 or later, `clock ≤ pressure.clutchClock` (120 s) and the score within `pressure.clutchMargin` (8) — or an explicit `situation.clutch`.
- `hash = rng.int(−1, 1)` (left hash / middle / right); `sign = ±1` (the strong side; the formation is mirrored by it).
- `revealAt = max(0, read.revealBase 1.6 − IQ/99 × read.revealIq 1.2)` s: IQ 50 → 0.99, 52 → 0.97, 58 → 0.90, 72 → 0.73, 99 → 0.40. `clarity = IQ/99`.
- `ctx.receivers` is the roster aligned in the **SHOTGUN** (the READ picture); the snap re-aligns per the play's formation.

### 2.3 The snap (`Play.snap`)

#### 2.3.1 Routes (`Data.plays.routes`)

Waypoints `{t, x, y}` are timed for an average receiver (speed 50): `t` seconds, `x` lateral yards from the alignment (+ toward the receiver's sideline, − inside), `y` yards downfield. `ideal` is the lead/loft the throw is graded against; `window` is the base **arrival** window.

| Route | Family | Depth | Path (t: x, y) | ideal lead / loft | window open–close |
|---|---|---|---|---|---|
| GO | DEEP | 20 | 0:0,0 · 1.0:0,6 · 2.0:0,14 · 3.0:0,22 · 4.0:0,30 | 0.7 / 0.7 | 2.5–3.5 |
| POST | DEEP | 12 | 0:0,0 · 1.6:0,12 · 2.6:−6,20 · 4.0:−12,30 | 0.6 / 0.55 | 2.3–3.3 |
| CORNER | DEEP | 12 | 0:0,0 · 1.6:0,12 · 2.6:6,19 · 4.0:12,28 | 0.6 / 0.7 | 2.3–3.2 |
| SEAM | DEEP | 15 | 0:0,0 · 1.2:−1,8 · 2.2:−2,16 · 3.2:−2,24 · 4.0:−2,30 | 0.6 / 0.5 | 2.0–3.0 |
| WHEEL | DEEP | 5 | 0:0,0 · 0.8:6,2 · 1.6:9,8 · 2.6:9,16 · 4.0:9,28 | 0.7 / 0.75 | 2.5–3.5 |
| FADE | DEEP | 8 | 0:0,0 · 1.0:3,7 · 2.0:5,15 · 3.0:5,23 · 4.0:5,30 | 0.3 / 0.9 | 1.6–2.6 |
| OUT | MID | 10 | 0:0,0 · 1.4:0,10 · 2.1:6,11 · 3.0:12,11 · 4.0:16,11 | 0.4 / 0.15 | 1.6–2.5 |
| IN ("Dig") | MID | 12 | 0:0,0 · 1.6:0,12 · 2.4:−6,13 · 3.4:−14,13 · 4.0:−18,13 | 0.5 / 0.2 | 2.0–3.0 |
| CURL | MID | 10 | 0:0,0 · 1.4:0,10 · 1.9:−1,8 · 4.0:−1,8 | −0.2 / 0.25 | 1.7–2.7 |
| COMEBACK | MID | 14 | 0:0,0 · 1.8:0,14 · 2.4:3,12 · 4.0:3,12 | −0.3 / 0.2 | 2.2–3.2 |
| SLANT | SHORT | 3 | 0:0,0 · 0.5:0,3 · 1.3:−6,8 · 2.2:−12,12 · 4.0:−22,18 | 0.5 / 0.05 | 1.1–2.0 |
| FLAT | SHORT | 1 | 0:0,0 · 0.7:4,2 · 1.5:9,3 · 4.0:18,4 | 0.4 / 0.3 | 1.0–2.2 |
| SCREEN | SHORT | −2 | 0:0,0 · 0.6:2,−2 · 1.2:5,−3 · 2.0:7,−3 · 4.0:9,4 | 0.0 / 0.4 | 1.3–2.4 |
| DRAG | SHORT | 4 | 0:0,0 · 0.6:0,4 · 1.8:−10,5 · 3.0:−20,6 · 4.0:−28,7 | 0.6 / 0.1 | 1.4–2.8 |
| CHECKDOWN | SHORT | 3 | 0:0,0 · 1.0:−1,1 · 1.8:2,4 · 3.0:4,5 · 4.0:8,6 | 0.2 / 0.35 | 1.6–3.4 |

**Speed** scales the waypoint times: `tRoute = t × route.speedBase 1.0 / (1.0 + route.speedPer 0.004 × (speed − 50))` — speed 38 → ×1.05, 70 → ×0.926, 86 → ×0.874, 99 → ×0.836. A route never runs deeper than `capY = 100 − yl + route.endZoneCap (10)`; `Play.pathAt` interpolates piecewise-linearly and extrapolates along the last segment with `y` capped.

**Formations** (`Data.plays.formations`; yards from the ball, + right; `ctx.sign` mirrors the whole set):

| | WR1 | WR2 | SLOT | TE | RB |
|---|---|---|---|---|---|
| SHOTGUN | −22 | 22 | 12 | 5 | −3 |
| TRIPS | −22 | 22 | 10 | 15 | −3 |
| SINGLEBACK | −20 | 20 | 9 | 4 | 0 |
| I_FORM | −20 | 20 | −9 | 4 | 0 |
| EMPTY | −24 | 24 | 14 | −12 | 8 |

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

(G = GOOD, O = OK, B = BAD.)

#### 2.3.3 Openness curves (per receiver; `Tuning.qb.open`)

```
edge     = (skill − opp.db)/99 × skillW 0.35 × (real === 'MAN' ? manMul 1.6 : 1)
peak     = base 0.70 − tightW 0.50 × coverage.tightness[family] + edge + vs[play.vs[real]] + N(0, noiseSd 0.08) + (hot ? hotBonus 0.20 : 0)
           vs = { GOOD: +0.20, OK: +0.02, BAD: −0.22 } ; the checkdown's peak is never under checkdownFloor 0.35 ; clamped [min 0.05, max 0.98]
wo, wc   = route.window.open × speedScale + shift, route.window.close × speedScale + shift    // shift ~ N(0, shiftSd 0.15) ; the hot read opens hotEarlier 0.15 s sooner
envelope(t) = 0 before wo − rise 0.5 · linear up over rise · 1 on [wo, wc] · down over fall 0.7 to lateFrac 0.15 · lateFrac after
open(t)  = floor 0.05 + (peak − floor) × envelope(t)      sampled every sampleDt 0.1 s over the ARRIVAL time 0..maxT 4 (41 samples)
```

Draws: per receiver in slot order WR1, WR2, SLOT, TE, RB, `noise` gauss (2) then `shift` gauss (2) — 20 for the five.

The reported **window** `{from, to, peak, peakAt}` spans where `open ≥ windowFrac 0.75 × peak`; `peakAt` is the centre of the plateau (D12). The **release** window `{from, to, peakAt}` is the arrival window minus the flight at full power and the route's ideal loft (one direct solve per edge: the arrival spot is known); `release.peakAt` respects the arm — when the plateau runs past `Play.maxDist` it moves back to the last in-range plateau sample (one sample of slack), so the engine's own best moment is one the arm can hit ({from, to} stay the window's edges). `Play.openAt(rec, t)` interpolates the samples and continues the envelope from `rec.env {wo, wc, peak}` past 4 s (D13).

Typical timing: deep routes must be released early (a GO releases ≈ 0.9–1.7 s and arrives 2.6–3.8 s); the quick game releases at 0.3–1.5 s.

**Hot read**: when the real coverage is BLITZ, the play's quickest route (the smallest base `window.open`) is `sim.hot` (+0.20 peak, opens 0.15 s earlier). **Checkdown**: the RB on a SHORT route (else the earliest SHORT route) is `sim.checkdown`; its peak has the 0.35 floor.

#### 2.3.4 A worked snap (seed 4242, AVERAGE, FIELD GENERAL, COLLEGE, moment 1: 3rd & 5 at OWN 41, 0–3)

Real COVER 3, shown COVER 3 (no disguise), advice from the SHOWN look (IQ 72 < 80); cards `FADE = BAD [SHORT_YDG] · MESH = OK [QUICK] · FLOOD = GOOD`; `sackAt` 2.96 s (pocket 3.16); reveal 0.73 s. Snapping FADE (the bad card): `sackAt` 3.08, rushers lanes +1 at 3.08 s and −1 at 3.55 s; WR1 FADE peak 0.16 (window 1.1–2.4, release 0–0.38), WR2 FADE 0.21, SLOT OUT 0.27 (release 0.55–1.43, peak at 0.97), TE FLAT 0.26, RB CHECKDOWN 0.35 (the floor; release 0.76–2.50, peak at 1.61). A perfect green throw to the checkdown at 1.61 s (`need` 0.447, band 0.219, 12.9 yd): accuracy 0.752, window 0.35, `pComplete` 0.22, `pInt` 0.26 — the bad card was bad.

#### 2.3.5 The sack clock (`Play.pocketTime`, `Tuning.qb.pressure`)

```
d      = olW 0.025 × (ol − 50) − dlW 0.025 × (dl − 50)
d      = d > 0 ? up 0.30 × tanh(d / 0.30) : −down 1.30 × tanh(−d / 1.30)      // a great line buys at most ≈ +0.3 s, a bad one loses at most ≈ −1.3 s
pocket = (base 3.05 + d + poiW 0.004 × (POI − 50)) ÷ coverage.pressureMul ^ mulExp 0.4      // BLITZ 1.6 → ×0.83 · PREVENT 0.7 → ×1.15
if clutch: pocket × (1 − clutchMul 0.30 × (1 − POI/99))                 // 0.30: the last two snaps are felt in the hand (POI 56 loses ≈ 0.4 s)
clamp [min 1.2, max 4.2]
ctx.pressure.sackAt = pocket + N(0, sigma 0.25)  (buildContext, 2 draws) ; sim.sackAt = ctx.sackAt + N(0, snapSigma 0.10) (snap, 2 draws), both clamped
```

| Line (OL vs DL) · coverage · POI | pocket (s) |
|---|---|
| AVERAGE 58 vs 55 · COVER3 · 56 | 3.15 |
| BAD 30 vs 78 · COVER3 · 56 | 2.13 |
| GREAT 80 vs 50 · COVER3 · 56 | 3.37 |
| AVERAGE · BLITZ · 56 | 2.61 |
| AVERAGE · PREVENT · 56 | 3.63 |
| AVERAGE · MAN / COVER4 · 56 | 3.03 / 3.28 |
| AVERAGE · COVER3 · 56, clutch | 2.94 |
| AVERAGE · COVER3 · 99, clutch | 3.32 |

**Rushers** (`pressure.rushers`): `base 2` lanes, `blitz 3` on a real BLITZ; lanes are a shuffle of `[−1, 0, 1]` (2 draws); `rushers[0].arriveAt === sim.sackAt`, the next arrive `+ float(laneGapMin 0.25, laneGapMax 0.9)` each (2 draws).

**Scramble yards** (`throw.scramble`, in snap, 2 draws): `base 0 + perMob 0.06 × MOB + look[real] + boxPer −1.5 × (box − boxAnchor 6) + N(0, sd 3)`, clamped `[min −4, max 30]`; `look = {COVER2 1, COVER3 1, COVER4 2, MAN 3, BLITZ 2, PREVENT 3}`. Means (the pocket used): MOB 72 vs COVER3 (box 8) → 2.3; vs COVER2 (box 7) → 3.8; vs MAN → 5.8; vs PREVENT (box 5) → 8.8; weighted ≈ 4.3, P(≥ 5) ≈ 47 %. The tuck-and-run is a bail-out, not a play: before this retune a SCRAMBLE at the snap on every down out-gained an expert throw on 3rd and medium.

### 2.4 The throw (`Play.throw`)

#### 2.4.1 The input

`PlayInput = { kind: 'THROW'|'THROWAWAY'|'SCRAMBLE'|'SACK', target: slot|null, t: s since the snap, lead: −1..1 (behind ← → ahead), loft: 0..1 (bullet ← → touch), power: 0..1.15, quality: 0..1 (the release relative to the green band; 1 = its centre), green?: bool }`. Missing fields normalise to `kind 'THROW', t 0, lead 0, loft 0, power 1, quality 0.5, green false`; an unknown target becomes `null`.

#### 2.4.2 Resolution order

```
1. sim.run                                   → the sim is the result (a run option resolved in snap); 0 child draws
2. kind SACK, or t ≥ sim.sackAt and kind ≠ SCRAMBLE  → SACK (2 draws: yards gauss)
3. kind SCRAMBLE: if t ≥ sackAt an escape roll (1 draw) with pEscape = clamp(escape 0.55 × MOB/99 − escapeMob 0.5 × (1 − MOB/99), 0, 1)
                  (MOB 55 → 8 % · 72 → 26 % · 99 → 55 %); a failed escape is a SACK; else SCRAMBLE (3 draws)
4. kind THROWAWAY, or no target, or power < throw.minCommit 0.08 → THROWAWAY (0 draws; never a turnover)
5. THROW (9 draws, fixed order: catch roll · int roll · drop roll · yac gauss 2 · scatter gauss 2 + 2)
```

#### 2.4.3 The pass

```
a        = Play.arrival(rec, attrs, t, power, loft)           // the ball meets the receiver: fixed-point rounds of pos = pathAt(t + flight), dist = |(pos.x, pos.y + qbDrop 7)| until the flight settles (Play.ARRIVAL: eps 1e-4 s, ≤ 24 rounds; the scene mirrors it)
flight   = dist / (velocity 24 × (armBase 0.7 + armPer 0.3 × ARM/99) × (powerBase 0.85 + powerPer 0.3 × power)) × (1 + loftTime 0.30 × loft)
             30 yd, ARM 55: 1.25 s at power 1 (0.7 → 1.36 · 1.15 → 1.21) · loft 1 → 1.63 s · ARM 72 → 1.18 · ARM 99 → 1.09 ; 10 yd → 0.42 s ; 45 yd loft 0.7 → 2.28 s
need     = needFor(dist at full power and the route's ideal loft) = clamp(needBase 0.15 + dist / (range 50 × arm), 2 × minCommit, powerMax 1.15 − band − bandTopMargin 0.06)   // the deepest ball's band stops under the top: a bar parked at 1.15 is red
             ARM 55: 10 yd 0.381 · 20 yd 0.612 · 30 yd 0.842 · 40+ yd 0.935 (the cap) ; ARM 72 30 yd 0.803 ; ARM 99 30 yd 0.75
band     = greenBand.base 0.12 + greenBand.perAcc 0.18 × ACC/99
green    = input.green && inGreen(power, need, band) ; quality = green ? max(quality, greenQuality 0.88) : quality
hot      = max(0, power − (need + band)) × hotBallPen 0.8                      // a ball thrown too hard to catch
fit      = clamp(1 − |lead − ideal.lead| × leadW 0.35 − |loft − ideal.loft| × loftW 0.35 − hot, 0, 1)
press    = pressPen 0.15 × clamp(1 − (sackAt − t) / pressWindow 0.7, 0, 1) × (1 − POI/99 × poiRelief 0.6)
             sackAt 3.1: 0 until 2.4 s · 0.05 at 2.75 s · 0.085 at 3.0 s (POI 56; 0.051 at POI 99, 0.129 at POI 0)
wx       = weather penalty (§2.8)
beyond   = max(0, dist − maxDist(ARM)) × beyondRangePen 0.06
accuracy = clamp(ACC/99 × accW 0.60 + quality × qualW 0.22 + fit × fitW 0.18 − press − wx − beyond, 0, 1)
             a perfect input (quality 1, fit 1, no penalties): ACC 54 → 0.727 · 58 → 0.752 · 72 → 0.836 · 99 → 1.0
window   = Play.openAt(rec, a.arrive)
pComplete= sigmoid(k 7.5 × (accuracy × accMul 1.0 + window × windowMul 0.6 − bias 1.13))
             (acc, window): (0.9, 0.9) 0.91 · (0.85, 0.7) 0.74 · (0.75, 0.7) 0.57 · (0.75, 0.5) 0.35 · (0.6, 0.5) 0.15 · (0.9, 0.3) 0.41 · (1, 1) 0.97
pInt     = window < intWindow 0.70 && accuracy < intAcc 0.92 ? intBase 0.42 × (1 − window) : 0     // window 0.69 → 0.13 · 0.3 → 0.29 · 0.1 → 0.38
pDrop    = drop 0.08 × (1 − skill/99)                                                                 // skill 40 → 4.8 % · 66 → 2.7 % · 82 → 1.4 %
outcome  = caught ? (dropped ? DROP : CATCH) : (picked ? INT : INCOMPLETE)
```

On a **CATCH**: `airYards = round(a.pos.y)`; `yac = max(0, round(yac.base[family] {SHORT 6.0, MID 3.5, DEEP 4.0} × (0.6 + 0.4 × speed/99) × (0.6 + 0.4 × window) + (SCREEN ? screenBonus 4 : 0) + N(0, sd 3)))`; `yards = air + yac` clamped to the field (the goal-line clamp comes off the run); `landing = a.pos`. Otherwise `landing = a.pos + scatter` with `sd = scatter.sd 2.5 × (1 − accuracy) + scatter.min 0.3` and the lead error × `scatter.leadYd 3` downfield; `turnover = outcome === 'INT'`.

`td = yards > 0 && yl + yards ≥ 100`; `firstDown = td || yards ≥ toGo`; `text` = `'CATCH +14'` / `'INCOMPLETE'` / `'INTERCEPTED'` / `'DROPPED'`; `banner` = `'TOUCHDOWN!'` > `'FIRST DOWN'` > `text` — except on a last play (`situation.lastPlay`), where a first down that does not score loses the game: the banner is the `text` (`'CATCH +12'`; the `firstDown` flag stays for the line). A catch behind the line clamped up to 0 yards keeps `yac 0` and puts the air yards at the spot (a clamp never invents a run).

#### 2.4.4 The other outcomes

- **SACK**: `yards = clamp(round(N(sackYards.mean −7, sd 2)), −12, −1)`, `landing (0, yards)`, text `'SACKED -7'`, feedback timing `TOO LATE`, coach: "Coach saw the pocket fold. Get it out, or get out." (or the blitz line when `sim.hot`).
- **THROWAWAY**: 0 yards, `landing (30 × sign, 5)` (the sideline), text `'THROWN AWAY'`, timing `ON TIME` when `t < sackAt − 0.7` else `LATE`.
- **SCRAMBLE**: `yards = clamp(round((sim.scrambleYards + N(0, sd2 2.5)) × clamp(t / useT 1.2, useMin 0.3, 1)), −4, 30)` — a tuck at the snap (t 0.35) is worth 30 % of the yards, the lanes open once the rush has committed; `fumble` with `p = max(fumbleMin 0.03, fumble 0.06 × max(0, 1 − MOB / fumbleMobFree 60))` (MOB 20 → 4 %, ≥ 30 → the 3 % floor: a scramble is never free); a fumble keeps `outcome 'SCRAMBLE'` with `fumble: true, turnover: true, text/banner 'FUMBLE'`; `landing (5 × sign, yards)`.

#### 2.4.5 Feedback (`Tuning.qb.feedback`)

- **timing** from the arrival vs the receiver's window: `EARLY` (arrive < from − early 0.15), `ON TIME` (≤ to + late 0.15), `LATE` (≤ to + tooLate 0.8), else `TOO LATE`.
- **touch**: `GOOD` when both |lead − ideal| < leadOff 0.35 and |loft − ideal| < loftOff 0.30; else the larger relative error names it — loft: `BULLET` / `FLOATED`; lead on a crossing route (SLANT, DRAG, IN, OUT, FLAT, SCREEN, CHECKDOWN, CURL, COMEBACK): `LED` / `BEHIND`; lead on a vertical route: `OVERTHROWN` / `UNDERTHROWN`.
- **coachSaw**: one sentence per outcome and dominant cause (a TD, a first down with ≥ 8 YAC, a drop "on <name>", a late pick "The safety was waiting", a forced pick "That is not a window, that is a wish", beyond the range, early, too late, the rush (`press ≥ 0.05`), the weather (`wx ≥ 0.03`), floated / bullet / sailed / died, a lucky miss into coverage, a sloppy release (`quality < 0.5`), "just a miss").

### 2.5 The run options (resolved inside `Play.snap`; the sim IS the result)

- **SNEAK** (3 draws): `p = clamp(base 0.70 − perYd 0.15 × (toGo − 1) + lineW 0.25 × (ol − dl)/99 + boxPer −0.04 × (box − boxAnchor 7), 0.1, 0.95)` — AVERAGE 3rd & 1 vs a 7-man box → 70.8 %; & 2 → 55.8 %; BAD vs 8 → 53.9 %; GREAT vs 6 → 81.6 %. Success → `toGo + int(0, 1)` yards; failure → `int(−1, 0)`. Text `'SNEAK +1'` / `'STUFFED'`.
- **DRAW** (4 draws): `yards = round(N(mean 2.5 + lineW 4 × (ol − dl)/99 + look[real], sd 4))` with `look = {BLITZ 3, PREVENT 2, COVER4 1, MAN 0, COVER2 0, COVER3 0}`, a `breakP 0.06` break adding `int(breakMin 10, breakMax 25)`, clamped `[−3, 40]`. Text `'DRAW +5'` / `'STUFFED'`.
- Both return `{run: true, kind: 'RUN', outcome: 'RUN', yards, td, firstDown, turnover: false, fumble: false, big, text, banner, feedback, landing {0, yards}, receivers: [], sackAt: null, ctx}`. `Play.throw` on a run sim returns it unchanged (still one parent draw).

### 2.6 The drive script (`Play.driveScript`) and the story between moments

One fork, then 25 ints in a fixed order (`Tuning.qb.drive`):

| # | Kind | Q | Down | toGo | yl | Clock (s) | Score (us–them) | Stakes copy |
|---|---|---|---|---|---|---|---|---|
| 0 | THIRD_MEDIUM | 1 | 3 | 4–6 | 25–45 | 300–800 | 0 – `openingLead` (one of 0, 3, 7) | `3RD & 5 — keep the drive alive` |
| 1 | THIRD_LONG | 2 | 3 | 8–12 | 20–40 | 200–700 | 7 – 7 + 3..7 | `3RD & 9 — a long way to the sticks` |
| 2 | RED_ZONE | 3 | 2–3 | 5–9 | 82–90 | 300–800 | 10 – 10 + 3..7 | `2ND & 7 at the 17 — points here` |
| 3 | SHORT_YARDAGE | 4 | 3–4 | 1–2 | 40–60 | 120–600 | 17 – 17 + 1..6 | `4TH & 2 — go or go home` / `3RD & 1 — a yard is a yard` |
| 4 | TWO_MINUTE | 4 | 1–2 | 10 | 45–60 | 35–58 | 20 – 20 + 1..3 | `0:40 left, down 2 — the drill` |
| 5 | LAST_PLAY | 4 | 1 | 10 | 100 − (30..45) | 3–8 | 20 – 20 + 4..5 | `0:07 left at the 40 — one shot at the end zone` |

Every entry: `{idx, kind, down, toGo, yl, quarter, clock, score, stakes, venue, lastPlay, twoMinute}`; `toGo` is clamped to the goal line. The last play is down by 4–5: a touchdown wins, a field goal does not.

**The shell's story rule** (`Store.record`, D16): a touchdown ends the possession ("The building comes apart…"); the last play is won or lost; an INT or a fumble → "the defence holds"; a first down → "FIRST DOWN at the OPP 34. The drive rolls on." and the next entry's `yl` advances by the gain (clamped −10..+40; caps `THIRD_LONG 60, RED_ZONE 95, SHORT_YARDAGE 75, TWO_MINUTE 75, LAST_PLAY 80`; `THIRD_MEDIUM` never moves; a first down in the drill carries into the last play, which still starts at least 20 yards out; a moved entry is re-worded). A touchdown in the two-minute drill moves both scores of the last play by 7 ("they answer, and then some") so the script's deficit — a TD wins, a FG does not — survives; an INT on a disguised snap says so ("They showed COVER 2 and played COVER 4 — the look lied"); a failed 3rd/4th down → the punt team / next possession; a gain on 1st/2nd down → "The chains stay put" and the drive continues. The scene's crowd / clutch level per kind: `THIRD_MEDIUM 0.3, THIRD_LONG 0.4, RED_ZONE 0.55, SHORT_YARDAGE 0.5, TWO_MINUTE 0.75, LAST_PLAY 0.95` (`ctx.pressureLevel`; ≥ 0.6 counts as clutch in the scene).

### 2.7 Passer rating (`Play.rating`, pure)

The NFL formula: `a = (cmp/att − 0.3) × 5`, `b = (yds/att − 3) × 0.25`, `c = td/att × 20`, `d = 2.375 − int/att × 25`, each clamped to 0..2.375, `(a + b + c + d) / 6 × 100`, one decimal; 0 attempts → 0. Perfect 158.3 · 20/30 190 2 1 → 92.4 · 20/30 250 2 1 → 100.7 · 4/6 60 1 0 → 138.9 · 2/5 20 0 1 → 12.5. The summary's tiers: ≥ 120 LIGHTS OUT · ≥ 100 SHARP · ≥ 80 SOLID · ≥ 60 SHAKY · else ROUGH.

### 2.8 Weather

- **Game day** (`Store.newDrive`, one fork `'drive:weather'`): a climate pick (`warm / temperate / cold`, plus `dome` in the NFL), a week (`1..8` HS, `1..12` otherwise), then the kicker's `Weather.forGame(rng, {climate, dome}, week, 'NFL'|'COLLEGE')` (6 draws; 7 below the snow line) with `Tuning.weather` and `Tuning.difficulty.pro.windCap` (20 mph) carried over verbatim. The HUD chip is `Weather.label`: `WIND ← 8` (the arrow by the dominant component: `→ ←` cross, `↑ ↓` along), `CALM`, `DOME`, plus the kind (`RAIN`, `SNOW`, `FOG`, `COLD`, `HEAT`).
- **On the throw** (`Tuning.qb.weather`; a dome costs nothing): `wind = max(0, mph − windFree 5) × windPerMph 0.004 × (windLoftBase 0.6 + windLoftPer 0.8 × loft)` + `byWeather {clear 0, dome 0, heat 0, fog 0.01, cold 0.02, rain 0.04, snow 0.07}` + `max(0, coldBelowF 35 − tempF) × coldPer 0.001`. 15 mph clear: 0.024 on a bullet, 0.056 on a floated ball; rain 0.04; snow at 25 °F in 10 mph, loft 0.5: 0.10 of accuracy.
- The scene: rain / snow particles (32, a tiny LCG — nothing touches the rng), a fog band, a grey sky in rain / fog / snow, a lit ceiling in a dome.

### 2.9 Balance (measured, not asserted except where noted)

The engine agent's probe (2000 snaps per cell; 3rd & 6 at own 40, Q2; "perfect" = quality 1, ideal lead/loft, mid-band power, green; "mediocre" = quality 0.5, lead/loft off by 0.4). Completion % on the GOOD card thrown on time at the plateau centre; INT % of non-sack throws; the "too late" column is a throw after `sackAt`:

| QB (ACC) × line | GOOD on time | OK | BAD (INT) | GOOD late, closed: INT | too late |
|---|---|---|---|---|---|
| AVG 55 × BAD | 49.5 | 29.4 | 16.4 (21) | 31.6 | 100 % sack |
| AVG 55 × AVERAGE | **63.6** (target 62–70) | 43.5 | 21.6 (16) | **30.9** (target 25–40) | 100 % sack |
| AVG 55 × GREAT | 73.2 | 53.1 | 28.9 (8) | 29.6 | 100 % sack |
| SURGEON (72) × AVERAGE | **78.3** (target 75–82) | 60.7 | 37.3 (12) | 27.3 | 100 % sack |
| SURGEON × GREAT | 85.0 | 71.3 | 45.8 | 26.2 | 100 % sack |
| GUNSLINGER (54) × AVERAGE | 62.2 | 42.6 | 21.0 | 30.7 | 100 % sack |
| mediocre AVG 55 × AVERAGE | 35.6 | 19.4 | 8.3 | 32.7 | 100 % sack |
| mediocre SURGEON × AVERAGE | 53.5 | 33.8 | 15.8 | 31.9 | 100 % sack |

Early throws (0.5 s before the release window): 17–28 % complete, 15–28 % picked. On-time INT is 0.0 % on GOOD / OK plays (the window gate). A sensible policy (best card, most open receiver at its peak ± 0.35 s, quality ~ N(0.8, 0.15), lead/loft ± 0.25) over a drive: AVG 55 on the AVERAGE line 42 % / 2.4 % INT / 0.1 % sacks / 5.5 yd per attempt / rating 50; BAD line 30 % / 4.3 % / 6.6 % / rating 24; GREAT 49.5 % / 1.6 % / rating 65; SURGEON 58 % / 2.1 % / rating 73. Sack clock over the coverage mix at 3rd & 6: BAD median 2.11 s (96 % sacked by 2.6 s), AVERAGE 3.13 s (7.3 % at 2.6 s; target 6–9), GREAT 3.35 s (2.8 %). Runs: SNEAK on 4th & 1 71.0 %, DRAW on 3rd & 3 59.8 % first downs at 4.3 yd. `play.test.js` pins the bold cells' targets (the 55-ACC and SURGEON on-time completion, the closed-window INT band), the on-time-green-never-picked rule, the sneak rate and the disguise formula. A human on the demo (the shell agent's runs) landed ratings 39–96.

---

## 3. Engine (technical specification)

### 3.1 Principles

1. **One global** `window.RTG`; classic scripts in the shim; no `type="module"`, no `fetch`, no image files.
2. **The engine is pure over plain JSON**: `fn(input, rng) → result`. The only closures are the convenience helpers `attachHelpers` puts on a PlaySim (`open`, `path`, `arrival`, `openIfThrown`, `need`); `JSON.stringify` drops them and `Play.openAt / pathAt / arrival / need` are the pure forms. `PlaySim.ctx` and `PlayResult.play` are references, not copies; there are no cycles.
3. **All randomness through the rng**: every function documents its draw count (§3.6). `uiRng` never reaches the engine.
4. **Constants live in `Tuning.qb`** (read at call time through `P()`, so `RTG.debug.tune` applies). The engine's own literals are definitions, not balance: `FIELD_YARDS 100`, `RESULT_DECIMALS 3`, `PLATEAU_EPS 0.02`, the NFL rating constants.
5. **The UI renders the engine's shapes**; the scene never derives a rule — the one exception is the green band, which the scene recomputes per frame with the engine's own functions (D5).
6. **Tolerant inputs**: `buildContext` normalises everything (`normSituation`, `normQb`, `normTeam`, `normOpp`); a missing block falls back to the demo presets, so a career can hand it a partial situation.

### 3.2 Files, ownership, load order

Owner codes: KIT (copied from the kicker verbatim; only line 2's game name changed) · ENG engine · SCN scene · SHL shell.

```
qb/
  index.html                          SHL   the page; script order is the contract (test/load.js ORDER); an inline boot-error hook
  README.md                           —
  css/style.css                       KIT   tokens, chrome, components (the visual system)
  css/play.css                        SCN   the moment scene (HUD, stage, panel, cards, bars, banners)
  css/screens.css                     SHL   title, the moment wrapper + DRIVE interstitial, summary, settings modal, the engine-missing card
  js/00_namespace.js                  KIT   window.RTG = {VERSION '1.0.0', SAVE_VERSION 2 (unused), Data, UI}
  js/engine/tuning.js                 ENG   RTG.Tuning = {qb, weather, difficulty.pro.windCap} + RTG.TuningDefaults()
  js/engine/util.js                   KIT   RTG.Util
  js/engine/rng.js                    KIT   RTG.RNG (mulberry32; int/float/chance/gauss/pick/weighted/shuffle/fork/state/setState/toSeed)
  js/engine/weather.js                KIT   RTG.Weather (forGame, perKick, monthFor, components, label)
  js/data/plays.js                    ENG   RTG.Data.plays {routes, formations, plays, coverages, order, slots, families}
  js/engine/play.js                   ENG   RTG.Play
  js/ui/storage.js                    KIT   RTG.UI.Storage
  js/ui/palette.js                    KIT   RTG.UI.Palette (tokens, cb / hc variants, teamTint, setTeamVars)
  js/ui/store.js                      SHL   RTG.UI.Store (settings, the drive, the line, the story, the summary)
  js/ui/components.js                 KIT   RTG.UI.C
  js/ui/sprites.js                    SCN   the kicker's atlas + the QB tiles appended (§4.2)
  js/ui/canvas.js                     KIT   RTG.UI.Canvas
  js/ui/audio.js                      KIT   RTG.UI.Audio
  js/ui/playinput.js                  SCN   RTG.UI.PlayInput
  js/ui/playview.js                   SCN   RTG.UI.PlayView
  js/ui/screens/title.js              SHL   RTG.UI.Screens.title
  js/ui/screens/moment.js             SHL   RTG.UI.Moment (the reusable host) + RTG.UI.Screens.moment
  js/ui/screens/summary.js            SHL   RTG.UI.Screens.summary
  js/ui/screens/settings.js           SHL   RTG.UI.Screens.settingsModal
  js/debug.js                         SHL   RTG.debug
  js/ui/app.js                        SHL   RTG.UI.app (boot, the screen switcher, settings classes, resize / key routing, the engine guard)
  tools/bundle.js                     SHL   node qb/tools/bundle.js [--fragment out.html] → qb/dist/qb.html
  test/load.js, run.js                ENG   the vm loader (ORDER) and the runner
  test/purity.test.js, rng.test.js, util.test.js, play.test.js
  test/e2e/_harness.js, _playhelpers.js, run.js, boot.spec.js, moment.spec.js, qa_shots.js, shots/
```

**`index.html` script order** (exactly this): `00_namespace, engine/tuning, engine/util, engine/rng, engine/weather, data/plays, engine/play, ui/storage, ui/palette, ui/store, ui/components, ui/sprites, ui/canvas, ui/audio, ui/playinput, ui/playview, ui/screens/title, ui/screens/moment, ui/screens/summary, ui/screens/settings, debug, ui/app`. `test/load.js` `ORDER = ['00_namespace', 'engine/tuning', 'engine/util', 'engine/rng', 'engine/weather', 'data/plays', 'engine/play']` — a new engine or data file goes there, in `index.html` and in `purity.test.js`'s `CONTRACT`. The page also carries `#app`, `#live` (`aria-live="polite"`), a `<noscript>` line and an inline hook that appends a `.noscript.boot-error` line to `#app` when an uncaught error fires before `RTG.UI.app.ready`.

### 3.3 Namespace and the shim

As the kicker's §3.3: every file is `(function (root) { 'use strict'; var RTG = root.RTG = root.RTG || {}; … })(typeof window !== 'undefined' ? window : globalThis);`. The purity test whitelists exactly that string, forbids `window` outside it (hence D15), `document`, `localStorage`, `Math.random`, `Date`, `setTimeout`, `setInterval`, `requestAnimationFrame`, `performance`, `console.log`, `fetch` in `js/engine` and `js/data`, the ES2018+ syntax, and any `Tuning` write outside `tuning.js`. `RTG.UI.uiRng = store.uiRng = RNG.create((Date.now() ^ 0x9e3779b9) >>> 0)` is created in the store.

### 3.4 Shapes

**Situation (input)** — `{ down, toGo, yl, quarter, clock (s), score: {us, them}, venue?: 'HS'|'COLLEGE'|'NFL' (default COLLEGE), weather?: {weather, wind: {speed, dir}, tempF}, qb?: {attrs: {ARM, ACC, IQ, MOB, POI}, archetype, foot}, team?: {ol, wr: [{slot, name, skill, speed}] | number}, opp?: {dl, db, tendency?}, lastPlay?, twoMinute?, clutch?, stakes?, kind?, idx? }`. `normSituation` clamps `yl` to 1..99, `toGo` to 1..(100 − yl), `down` 1..4, `quarter` 1..5; the demo's store also puts `pressure` (the scene level) on it, which the engine drops and the store re-attaches as `ctx.pressureLevel`.

**PlayContext** (`Play.buildContext`) — `{ situation (normalised; no qb / team / opp inside), qb: {attrs, archetype, foot}, team: {ol, wr[5]}, opp: {dl, db, tendency|null}, real, shown, disguised, look: {safeties, press, box, showBlitz, name, text, tell} (of the SHOWN coverage), options: [card], adviceFrom: 'REAL'|'SHOWN', pressure: {sackAt, pocket, hot, clutch, meterMul}, receivers: [{slot, name, skill, speed, x0, side}] (the shotgun), hash: −1|0|1, sign: ±1, revealAt, clarity, weather|null, venue, clutch }`. The store adds `idx`, `kind`, `pressureLevel`, and mirrors `clutch` onto `situation.clutch`.

**PlaySim** (`Play.snap`, a pass play) — `{ run: false, playId, play: {id, name, formation, tags, line}, receivers: [{ slot, name, skill, speed, x0, side, route, family, path: [{t, x, y}] (field yards from the ball, absolute; t scaled by speed; y capped), capY, open: [41], peak, env: {wo, wc, peak}, window: {from, to, peak, peakAt} (arrival s), release: {from, to, peakAt} (release s at full power), hot, checkdown }], sackAt, revealAt, clarity, rushers: [{lane, arriveAt}], scrambleYards, hot: slot|null, checkdown: slot|null, real, shown, look, ctx, open(slot, t), path(slot, t), arrival(slot, t, power?, loft?) → {flight, arrive, pos, dist}, openIfThrown(slot, t, power?, loft?), need(slot, t) → {need, band, top, dist} }`. A run play returns the result shape of §2.5.

**PlayResult** (`Play.throw`) — `{ run: false, playId, play, kind, outcome: 'CATCH'|'INCOMPLETE'|'INT'|'SACK'|'THROWAWAY'|'SCRAMBLE'|'DROP', target, yards, airYards, yac, td, firstDown, turnover, fumble, flight, arrive, landing: {x, y} (yards: the receiver's spot on a catch, the scattered spot otherwise, (0, yards) on a sack, the sideline on a throwaway), accuracy, window, fit, quality, green (engine-verified), need, dist, pComplete, pInt, t, lead, loft, power, sackAt, text, banner, feedback: {timing, touch, coachSaw} }`. Numbers are rounded to 3 decimals; `−0` is normalised to `0`. `Play.forcedResult` adds `forced: true`. `arrive`, `need` and `dist` are `null` (like `accuracy` / `fit`) on SACK, THROWAWAY, SCRAMBLE and run results. `input.t` of `Infinity` (or past 1e6) is clamped to 1e6 s — still a sack, still a finite `t`.

**The store's drive** (`RTG.UI.Store`, not persisted) — `{ seed (as typed), seedNum (uint32), archetype, team, venue, startedAt, script[6], weather, climate, week, idx, pending: 'PLAY'|'STORY'|'DONE', advance, ctx, sim, situation, results: [entry], line: {att, cmp, yds, td, int, sacks, sackYds, rushes, rushYds, rushTd, fumbles, firstDowns, long, turnovers}, story: {text, continues, td, won, lost, spot, nextText}, lastResult }`. A results entry keeps the situation, the play and target names, the outcome, the yards, the flags, `text`, `banner`, `feedback`, `accuracy`, `window`, `quality`, `green`, `t`, `story`, `forced`.

### 3.5 Public API

#### 3.5.1 `RTG.Play`

- `buildContext(situation, rng) → PlayContext` — 1 parent draw (`fork('play:ctx')`). §2.2. Each option carries `sure: bool`: under `read.iqExact` a pass card whose rating differs among the coverages the SHOWN look can be (the shown one and every coverage that disguises as it) is flagged `sure: false` with probability `1 − IQ/99` (the clarity roll) — the scene dims its chip with a `?` ("if the look is honest"). IQ 52 flags ≈ 47 % of the ambiguous cards, IQ 74 ≈ 25 %, ≥ 80 none.
- `snap(ctx, playId | option, rng) → PlaySim | run result` — 1 parent draw (`fork('play:snap')`). §2.3, §2.5. Throws on an unknown play or a play with an unassigned slot.
- `throw(sim, input, rng) → PlayResult` — 1 parent draw (`fork('play:throw')`). §2.4. A run sim is returned unchanged.
- `driveScript(opts {venue?}, rng) → situation[6]` — 1 parent draw (`fork('play:drive')`). §2.6.
- `rating(line {att, cmp, yds, td, int}) → number` — pure. §2.7.
- `forcedResult(sim, kind, input?) → PlayResult` — pure (0 draws). `kind ∈ CATCH | FIRST_DOWN | TD | INCOMPLETE | INT | SACK | DROP | THROWAWAY | SCRAMBLE | FUMBLE`; the target defaults to the first receiver, `t` to its `release.peakAt`; `CATCH` gains `max(0, min(air + 2, toGo − 1))` (never a first down: 0 at toGo 1), `FIRST_DOWN` `max(toGo, min(toGo + 3, the distance to the goal))` (always the sticks; a TD when they are the goal line), `TD` the distance to the goal; `coachSaw: 'Coach saw the debug menu.'`.
- Pure helpers (0 draws): `pathAt(rec, t)`, `openAt(rec, t)`, `flightTime(dist, attrs, power, loft)`, `maxDist(attrs)`, `arrival(rec, attrs, t, power, loft)`, `openIfThrown(rec, attrs, t, power?, loft?)` (the openness at the arrival of a ball released at t — what the rings show), `greenBand(ACC)`, `needFor(dist, attrs)`, `need(sim, slot, t)`, `inGreen(power, need, band)`, `pocketTime(ol, dl, coverageId, attrs, clutch)`, `isClutch(sit)`, `downText(sit)` (`'3RD & 7'`, `'4TH & GOAL'`), `spotText(yl)` (`'OWN 34'`, `'MIDFIELD'`, `'OPP 18'`).
- Constants: `Play.KINDS`, `Play.OUTCOMES`, `Play.ADVICE`.

#### 3.5.2 `RTG.Data.plays`

`{ routes (15), formations (5), plays (13 pass + SNEAK + DRAW, in that order), coverages (6), order: ['COVER2', 'COVER3', 'COVER4', 'MAN', 'BLITZ', 'PREVENT'], slots: ['WR1', 'WR2', 'SLOT', 'TE', 'RB'], families: ['SHORT', 'MID', 'DEEP'] }`. Pure data; the copy is in the kicker's voice (short, second person, the coach talking).

#### 3.5.3 `RTG.Tuning` (`RTG.TuningDefaults()` returns a fresh deep copy; the tree is NOT frozen so `RTG.debug.tune` can set leaves in place)

`Tuning.qb` blocks: `attrMax` · `archetypes` (§2.1) · `read` (§2.2) · `coverage` (§2.2.1) · `pressure` (§2.3.5) · `open` (§2.3.3; `ring {open 0.70, closing 0.25}`) · `route {speedBase 1.0, speedPer 0.004, qbDrop 7, endZoneCap 10}` · `throw` (§2.4; also `powerMax 1.15`, `meterHoldMs 1300`, `uiFlightScale 0.75`, `scramble`, `sackYards`, `scatter`, `yac`) · `run` (§2.5) · `feedback` (§2.4.5) · `drive` (§2.6) · `demo {teams, defaultRoster, defaultTeam 'AVERAGE', defaultArchetype 'FIELD_GENERAL'}` · `weather` (§2.8). `Tuning.weather` and `Tuning.difficulty.pro.windCap 20` are the kicker's, read by the copied `engine/weather.js`.

#### 3.5.4 `RTG.Weather` (copied) — `forGame(rng, {climate, dome, windy}, week, league, cap?)` (6 draws; 7 below the snow line), `perKick(rng, weather)` (2), `monthFor`, `components(wind) → {cross, along}`, `label(w)`.

#### 3.5.5 `RTG.UI.Store` (the demo's shell store; §3.7)

`new Store()` → `settings`, `setSetting(key, value)`, `resetSettings()`, `saveSettings()`, `subscribe(fn) → unsubscribe` (notifications `{fnName: 'settings'|'newDrive'|'context'|'record'|'next', result, store}`), `isDebug()`, `newDrive({seed, archetype, team, venue}) → drive`, `hasDrive()`, `pending()`, `isDone()`, `line()`, `results()`, `tints()`, `situation()`, `context()`, `snap(playId)`, `throwBall(input)`, `firstPassOption()`, `autoInput(sim)`, `record(result, sim) → story`, `next()`, `force(result, sim)`, `autoResolve()`, `summary() → {seed, seedNum, archetype, team, venue, weather, done, played, total, line, rating, best: {text, sub, result}|null, won, verdict, results}`. Statics: `Store.KEYS {settings: 'rtg.qb.settings'}`, `Store.KINDS`, `Store.TINTS`, `Store.defaultSettings()`, `Store.sanitizeSettings(raw)`.

### 3.6 The RNG draw contract (pinned by `play.test.js` with a draw-counting rng)

The parent rng sees exactly **1 draw per call** (the fork). The child draws, in a fixed order:

| Call | Child draws |
|---|---|
| `buildContext` — `fork('play:ctx')` | coverage weighted 1 · disguise roll 1 · disguise pick 1 (always) · card count int 1 · goodOffered roll 1 · pass-card picks weighted 1 each · pass-card shuffle (n − 1) · card clarity roll 1 per pass card (always drawn) · sackAt gauss 2 · hash int 1 · strong-side roll 1 = **8 + 3 × pass cards** (14 or 17; a run card draws nothing) |
| `snap` — `fork('play:snap')` | pass play: per receiver in slot order, peak gauss 2 + window shift gauss 2 (20) · sackAt jitter gauss 2 · rush lanes shuffle 2 · lane gaps float 2 · scramble gauss 2 = **28**. `SNEAK` = **3** (success roll, gain int, loss int). `DRAW` = **4** (yards gauss 2, break roll, break int) |
| `throw` — `fork('play:throw')` | THROW = **9** always (catch roll, int roll, drop roll, yac gauss 2, scatter gauss 2 + 2). SACK = **2**. THROWAWAY / no target / power < minCommit = **0**. SCRAMBLE = **3** (+ 1 escape roll when `t ≥ sackAt`; a failed escape → SACK's 2). A run sim → **0** |
| `driveScript` — `fork('play:drive')` | **25** draws (24 ints + the opening-score pick): `1: toGo yl clock lead(pick) · 2: toGo yl clock deficit · 3: down toGo yl clock deficit · 4: down toGo yl clock deficit · 5: down yl clock deficit · 6: fromGoal clock deficit` |
| `rating` and every helper | 0 |

The drive's parent rng (`Store`): `driveScript` fork 1 · weather fork 1 · then per moment `buildContext` 1 · `snap` 1 · `throw` 1 (a run option and a forced result consume the throw fork too) — **every moment costs 3 parent draws** regardless of the inputs, so `?seed=` reproduces the six looks, windows and the weather whatever was thrown. `RNG.toSeed` maps a number or a word to the uint32.

### 3.7 The demo's flow (screens are UI names; §4)

```
title ──START THE DRIVE──▶ store.newDrive({seed, archetype, team, venue}) ──▶ moment (pending PLAY)
  moment: store.context() → RTG.UI.Moment.mount({ctx, rng, Play, PlayView, …})
          onPick → Play.snap · onThrow → Play.throw · onDone → store.record(result, sim)
          → pending STORY: the DRIVE interstitial (banner, play/target line, coach line, story, the running line, NEXT UP, NEXT)
          → NEXT → store.next() → pending PLAY → the next Moment in place (the screen id stays 'moment')
          → after the sixth result pending DONE → summary
summary ──PLAY AGAIN (same seed + picks) / NEW DRIVE (new seed, same picks)──▶ moment · ──TITLE──▶ title (picks kept)
```

`RTG.UI.Moment.mount(container, {ctx, rng, Play?, PlayView?, settings?, store?, reduced?, tints?, uiRng?, onSnap?, onThrow?, onResult?, onDone, onSettings?}) → {el, view, ctx(), sim(), result(), setSim(s), destroy()}` depends only on `{ctx, Play, PlayView, rng}` — the seam the career hosts (§6). Escape opens the settings modal on every screen (a mounted scene routes it through `onSettings`; the shell handles it whenever no scene is live — the DRIVE interstitial included, which also carries a SETTINGS button for touch); the modal's changes apply live (body classes `cb`, `hc`, `reduced-motion`, `font-scale-125|150`, `left-handed`, `no-tooltips`; `data-input-mode="hold"`) and reach a mounted scene at once (it subscribes to the store: palette, rings, the vignette, the mirror, reduced motion). While any kit modal is open the scene is paused: the play clock, the flight, the landing and result beats and their timers freeze (a live hold is cancelled, the target stays) and no input is taken. `app.startDrive` writes `?seed=&arch=&team=&venue=` into the URL (`history.replaceState`, file:// and http) so a reload or a shared link reproduces the drive; entering the moment pushes one history entry and the browser's back button (a phone's back gesture) pops it to the title instead of leaving the page.

**Settings** (`rtg.qb.settings`, sanitised on load): `audio true · colorblind false · highContrast false · reducedMotion false · fontScale 1 (1 | 1.25 | 1.5) · leftHanded false · greenAssist true · haptics true · tooltips true · keys {confirm ' ', confirmAlt 'Enter', left 'ArrowLeft', right 'ArrowRight', up 'ArrowUp', down 'ArrowDown', throwAway 'x', scramble 'z'}`.

**URL**: `?seed=` (a number or a word), `?arch=`, `?team=`, `?venue=` preselect the title; `?debug=1` marks `store.isDebug()`.

**The engine guard** (`app.engineStatus()`): checks `Play.buildContext/snap/throw/driveScript/rating`, `Data.plays`, `Tuning.qb.archetypes/demo`, `PlayView.mount/current`, `PlayInput.create`, `Sprites.get`, and that `driveScript` returns a non-empty array; otherwise the page renders the `.engine-missing` card ("ENGINE NOT LOADED"), `app.ready = true`, `app.screen() === 'error'`.

### 3.8 Debug API (`qb/js/debug.js`, always loaded; every return JSON-serialisable)

```js
RTG.debug.forceResult(kind, {target?, input?}) → PlayResult   // from SITUATION / READ it reads and snaps the first pass card, then Play.forcedResult is animated by the scene (view.playResult) and recorded; the throw fork is consumed
RTG.debug.current() → {screen, stage, idx, kind, pending, phase, situation, ctx, sim, target, t, play, hold, power, lead, loft, zone, actors, lastInput, result}
RTG.debug.seed() → the seed as typed      state() → {screen, phase, drive, script, situation, line, rating, results, story, settings, rngState}
RTG.debug.skipTo('summary' | 'title')      // resolves the remaining moments headlessly (store.autoResolve: first pass card, store.autoInput) and routes
RTG.debug.autoThrow() → PlayResult         // the live moment through the real engine with autoInput (the most open receiver whose release fits before sackAt − 0.15, released at its peak with the route's ideal lead / loft and the on-time power)
RTG.debug.newDrive(opts) next() read() pick(idxOrId) go(id) summary() results() setSettings(obj) tune(path, value) tuningDefaults() perf()
RTG.debug.version → RTG.VERSION   strict (false)
```

### 3.9 Performance and memory rules

- Virtual canvas 192×320 (portrait) / 320×192 (landscape), integer scale (below 2× the fractional fit when it reaches `Canvas.MIN_FRACTIONAL` 1.15 — the QB copy's deviation from the kicker's 1.35, so a 320×568 phone gets 1.25× instead of a 192-px strip at 1×; the play chip is hidden from the HUD at ≤ 380 px so the stage does not shrink under the fitted canvas at the snap), `dpr ≤ 2`, `imageSmoothingEnabled = false` (`RTG.UI.Canvas`, copied). The RAF loop runs only while the scene is mounted; `view.destroy()` stops it and removes every listener and timer.
- Per frame: two `drawImage` calls for the pre-rendered stands and field, then ≤ 40 sprites / rects (22 actors, rings, the ball, ≤ 32 particles, the aim dots, the overlays). No text on the canvas at runtime (the stands' boards are drawn once at build), no allocations in the loop (typed arrays for the 22 actors, shared `pt` / `pt2` points, insertion sort for the z-order, the green band written into one reused object).
- Pre-rendered once per mount / resize / arm: the three crowd frames (`a` seated, `b` on their feet, `dim` for the groan), the field layer (per layout + yard line), the posts, the clutch vignette.
- Measured (desktop headless): frame p95 0.3–0.5 ms with rain and the clutch vignette on.
- The store keeps no per-frame state; screens unsubscribe in `destroy`.

---

## 4. UI specification

### 4.1 Visual language

The kicker's palette, type and idiom verbatim (`css/style.css`, `js/ui/palette.js` copied): `--navy #1b1f3a`, `--navy-2 #262b4d`, `--cream #f4e9d0`, `--ink #101226`, `--grass #3a8c3f`, `--grass-2 #2e7233`, `--chalk #f2f2e6`, `--gold #f6c445`, `--red #d8433a`, `--sky #7fc7ff`, `--mint #4dbb63`, `--grey #8a8f9e`, `--dusk #5b3a6e`; the Okabe–Ito colour-blind variant (`body.cb`) and the high-contrast one (`body.hc`); "Press Start 2P", 8-px grid, 2-px borders, hard shadows, no gradients. Result banners always carry text + icon.

**Team tints** (`Store.TINTS` by venue; the demo has no team objects, so `Palette.teamTint` is bypassed): HS home `#d8433a / #f2f2e6`, COLLEGE `#f6c445 / #101226`, NFL `#7fc7ff / #f2f2e6`; the opponent `#8a8f9e / #f4e9d0` everywhere. The scene falls back to `situation.team.colors` / `opp.colors`, then `Palette.teamTint(team)` when `team.id` exists, then red/chalk and grey/cream. Ring tiles are re-tinted from the live palette on every arm so a palette toggled mid-drive shows on the next snap.

### 4.2 Pixel-art approach and the sprites

`RTG.UI.Sprites` is the kicker's file with the QB tiles **appended** (nothing above them changed; `Sprites.frames('qb_back') → ['qb_back0', 'qb_back1', 'qb_back2']`):

| Tile | Frames | Use |
|---|---|---|
| `qb_back0/1/2` | set · drop · throw | the quarterback from behind (team tint, `look`) |
| `receiver_run0/1`, `receiver_catch` | run ×2, catch | the five receivers (home tint), drawn `w = max(3, 8 × s)`, `h = max(4, 12 × s)` px |
| `defender_run0/1`, `defender_set` | run ×2, set | the eleven defenders (opponent tint); `rusher` (the kicker's block-rush tile) for rushers and the blitzer |
| `lineman_block` | 1 | the five blockers |
| `ball_2` | 1 | added under the kicker's `ball_3 / 5 / 8 / 11`; the flight picks by size |
| `ring_open`, `ring_closing`, `ring_closed` | 1 each | the openness rings (tint `J` = the ring colour; three **shapes** so cb / hc stay apart) |
| `yard0`–`yard9` | 5×7 | the field numbers at the tens |
| `lead_ahead`, `lead_behind` | 5×5 | the lead arrow along the receiver's run during the hold |
| `hot_flag` | 3×3 | over the hot read for the first 1.5 s |
| `target_pick` | 7×6 | bracket corners on the chosen target |

The stands reuse the kicker's `seats / bench / seatsfar / fans_a|b / fansfar_a|b / band_a|b` tiles; the posts are `Sprites.uprights(w, h, …)`; rain / snow are the kicker's particles.

### 4.3 Layout and responsive rules

- The demo has no chrome: `#app.chromeless` is one grid area; `.screen-host` fills `100dvh`.
- **The scene** (`.playview`): the HUD strip on top, the stage (the canvas, centred; `min-height 200px`) and the panel under it (`min-height 136px`; 124 px under 380 px wide) — the panel keeps a fixed minimum height in every phase so the canvas never re-fits mid-play. At `≥ 900 px` and on landscape phones (`orientation: landscape` and `max-height: 520px`) the panel becomes a right column beside the stage (`.pv-card-line`, the card's one-liner, shows only on desktop).
- **Title**: the hero canvas (192×112 virtual, scaled by CSS; max 640 px), the column `max-width 560px` (720 px on desktop), the archetype cards in a 2-column grid (one column under 360 px, four at `≥ 900 px`; the `NO CAP` chip hides under 420 px), pills that wrap.
- **Summary**: the stats grid (2 columns under 360 px, 6 at `≥ 900 px`), the three action buttons in a row at `≥ 900 px`, `max-width 720px`.
- Phone 390×844, narrow 320×568, landscape 844×390, tablet 768×1024 and desktop 1280×800 all verified without horizontal scroll; `html.is-desktop / is-phone / is-landscape` are set by `app.layout()` (`isDesktop = innerWidth ≥ 900`, `isLandscape = innerHeight < 500 && wider than tall`); resize is debounced 100 ms and routed to the live screen (`view.resize()`).

### 4.4 Screens

Each entry: layout · components · engine / store calls.

| Screen | Layout & components | Calls |
|---|---|---|
| **title** (`.qb-title`) | Hero canvas (the field from behind the QB at dusk: plain rects, 26 stars twinkling via `uiRng`, a foot wobble); logo ROAD TO GLORY / QB / THE MOMENT; the three `radiogroup`s (archetype, team, venue) are one Tab stop each with a roving `tabindex` and the arrows moving the selection (WAI-ARIA); the blurb ("Read the look. Pick the play. Tap a receiver, hold for velocity, drag for lead and loft, let go in the green. Six snaps decide the night."); **ARCHETYPE** ×4 (`button.arch-card[role=radio][data-arch]` with five `C.bar`s, a `NO CAP` chip on the signature, a one-liner; tooltips on the bars); **TEAM** pills (`[data-team]` BAD LINE / AVERAGE / GREAT LINE with a line `OL 58 · WR 59 vs DL 55 · DB 56 — a fair fight up front`); **VENUE** pills (`[data-venue]` HIGH SCHOOL / COLLEGE / NFL); **SEED** (`#qb-seed` + RANDOM; shown as `.title-seed[data-seed]`); START THE DRIVE (`[data-action=start]`); SETTINGS; the footer `v1.0.0 · the moment demo · seed n`. Enter on the body or in the seed field starts. Defaults GUNSLINGER / AVERAGE / COLLEGE / a random seed; `?seed= ?arch= ?team= ?venue=` and the summary's TITLE button preselect. | `app.startDrive({seed, archetype, team, venue})` → `store.newDrive` |
| **moment** (`.screen-moment[data-stage=play\|story]`, chromeless) | `data-stage="play"`: the `Moment` host with the scene (§4.5). `data-stage="story"`: the DRIVE card (`.drive-card`, `MOMENT n OF 6`; the result banner `.drive-banner[data-outcome]`; the play / target / text line; the coach's line; the story `[data-story]`; the running line chips `.drive-line` — `12/18 · 141 YDS · 1 TD · 0 INT · 2 SACK · 14 RUSH · RTG 98.4`; NEXT UP: `THE RED ZONE` + `Q3 · 2ND & 7 · OPP 17 · 10-15` + the stakes; NEXT `[data-action=next]` (THE BOX SCORE after the sixth); SETTINGS `[data-action=settings]`; "Escape · settings"). Enter / Space on the body → NEXT. | `store.context()`, `Moment.mount` (→ `Play.snap` / `Play.throw`), `store.record`, `store.next`, `app.go('summary')` |
| **summary** (`.summary-screen`) | Header `THE BOX SCORE` / `YOU WON IT` / `THE DRIVE SO FAR` with archetype / team / venue chips; **THE LINE**: `.sum-rating-num[data-rating]` (huge) + `PASSER RATING · SOLID`, six stats (CMP / ATT, YARDS, TD, INT, SACKS (yds), RUSH), `LONG · FIRST DOWNS · TURNOVERS`; **THE BEST THROW** (`[data-best]`: `24 YD TD TO Z. MOREAU ON THE POST` + the play and the moment kind, or "No completion to speak of."); **THE VERDICT** (`[data-verdict]`, five lines by won / rating / turnovers); **SIX SNAPS** (`.sum-row[data-idx][data-outcome]`: `3 · RED ZONE · Q3 2ND & 7 · OPP 17 · SMASH → E. Tanaka · FIRST DOWN`); PLAY AGAIN (`[data-action=again]`, same seed and picks), NEW DRIVE (`new`, a fresh seed), TITLE; `seed n · PLAY AGAIN replays this script`. Enter → PLAY AGAIN. | `store.summary()` (→ `Play.rating`), `app.startDrive`, `app.go('title', picks)` |
| **settings modal** (`.settings-modal`, `C.modal`, wide) | GAMEPLAY: Sound, Green = on time, Haptics, Left-handed mirror · ACCESSIBILITY: Reduced motion, Colour-blind palette, High contrast, Font scale 100 / 125 / 150 %, Tooltips · KEYS: Hold / throw, Hold / throw (alt), Lead behind, Lead ahead, More loft, Less loft, Throw away, Scramble (press to remap; Escape cancels) and the note "1–5 pick a receiver in slot order (WR1 WR2 SLOT TE RB); Tab cycles; Escape opens this panel." · RESET (danger) · DONE. Switches are `.switch[data-setting]`, pills `.pill[data-setting][data-value]`. | `store.setSetting`, `store.resetSettings`; `app.applySettings` on every change |
| **engine missing** (`.engine-missing`) | A red card `ROAD TO GLORY: QB` — `ENGINE NOT LOADED`, the missing names, where to look. | `app.engineStatus()` |

### 4.5 The moment scene (`RTG.UI.PlayView`)

**Mount:** `PlayView.mount(container, { ctx, settings, store?, onPick(playId, option) → PlaySim, onThrow(input, sim) → PlayResult, onDone(result), onResult?(result), onSettings?(), reduced?, tints?: {home, opp}, uiRng? }) → view`. `view = { el, canvas, cv, destroy(), phase(), skip(), layout() → L, current() → {sim, target, t, phase, play, hold, power, lead, loft}, ctx(), sim(), result(), lastInput(), greenZone() → {lo, hi, dist}|null, input(), project(xYd, yYd) → {x, y, s}, actors() → {receivers: [{slot, x, y (css px, the sprite's centre), fieldX, fieldY, open, ring}], qb: {x, y}, scale}, read(), pick(idx | playId) → bool, target(slot), holdStart(), holdEnd(), throwAway(), scramble(), playResult(result), resize() }`. `PlayView.current()` is the live view (null after destroy). Statics: `TIMING`, `FIELD`, `VENUES`, `OUTCOME_TEXT`, `hudParts(ctx)`, `needFor(distYd, ARM)` (the fallback), `greenBandFor(ACC)`, `venueOf(ctx)`, `escapeToSettings(ev)`.

**State machine:** `SITUATION → READ → SNAP → THROW → FLIGHT | SACK | RUN → RESULT → DONE` (`.playview[data-phase]`). `onDone` fires at `DONE`; a run option (`sim.run`) never calls `onThrow` — the sim is the result. If `onThrow` returns nothing the play is re-armed (except kind `SACK`, which falls back to a local sack result).

**Camera (fixed, behind and above the QB; `FIELD`):** `project(xYd, yYd)`: `u = yYd / depthYd 45` (clamped −0.3..1), `p = u × (1 + k 1.2) / (1 + k × u)`, `s = 1 − p × (1 − farScale 0.36)`, `x = xC + xYd × pxPerYd × s` (`pxPerYd = W / widthYd 53.33`), `y = yLOS − (yLOS − yHor) × p` with `yLOS = round(H × losFrac 0.78)`, `yHor = round(H × horizonFrac 0.28)`; sprites shrink with `s` (receivers 12 → ≈ 4 px tall). The ball sits on a hash: the field's centre is shifted by `−ctx.hash × hashYd` (NFL 3.083 yd; college 6.667 yd, also used for HS). The QB stands at `y −1.6` under centre or `−5` in the shotgun, drops to `−6` / `−6.5` over `dropMs` 450; the green band geometry uses the engine's `route.qbDrop` 7.

**The field (pre-rendered per layout + yard line):** out-of-bounds `grass2`, the trapezoid clipped to the sidelines, every other 5-yard band striped, yard lines every 5 (the goal lines 2 px), hash dots every yard at `±hashYd`, the numbers at the tens on both sides (`numbersIn` 8.5 yd from the sideline; `yard0–9` scaled by depth, `≥ 3 px`), the end zone when the goal line is within 45 yards (the home tint at 0.8 alpha; `navy2` beyond) and the posts (`Sprites.uprights`, 6.17 yd wide) at the back of it, 1-px sidelines.

**The stands (`PlayView.VENUES`, the kicker's D25 in miniature; pre-rendered into three W × yHor frames):**
- **HS** (night): 18 stars, dusk / sunset bands, an ink tree line and a steel fence, three light poles (`0.12·W` and `0.88·W` at 0.62 of the band with 6-px lamps, `0.985·W` at 0.92 with 8 px), one aluminium bleacher `0.56·W` wide (2 `bench` rows) under a `HOME n  GUEST n` board on two poles. Fill `0.35 + 0.45 × pressure`; 15 % visitors.
- **COLLEGE** (day): a lower tier 0.30 of the band and an upper deck 0.18, both 35 % taller at the edges (`edgeRise`; flat across the middle `0.44·W`), a concourse strip, a marching band on the bottom two rows right of centre, press boxes on both rims, two light towers at `0.1·W / 0.9·W`, a framed `HOME / GUEST` board on the rim. Fill `0.6 + 0.2 × pressure`; 10 % visitors.
- **NFL** (night): two decks 0.30 / 0.32, a lit concourse (gold windows), a navy roof 0.10 with a steel rim, an ink underside and a floodlight every 20 px, a jumbotron (`0.42·W` capped at 96 px, 0.30 of the band) over the far end showing `HOME / AWAY`, the scores in scale-2 digits and `Q1–Q4 / OT` (one row when the board is short). Fill `0.9 + 0.1 × pressure`; 15 % visitors.
- Common: `+0.1` fill in the clutch, clamped to 1; seats empty by a deterministic hash of (seat, row, tier); the sky is `navy2` with lights in a dome, `night` over `navy` with dusk / sunset bands at night (`navy2` in rain / fog / snow), `sky` by day (`grey` in rain / fog / snow; a heavier dusk band when cold). `draw()` copies `dim` while the crowd groans, else `a` / `b` alternating every `crowdIdleMs` 700 (`crowdCheerMs` 180 while cheering).

**The look → eleven defenders (`LOOK`, from the SHOWN coverage):** four linemen at `x −4.5, −1.5, 1.5, 4.5`, `y 1`; `box − 4` linebackers (1..3) at `y 4.5` (`x` `[0]`, `[−3, 3]`, `[−4, 0, 4]`), the middle one creeping to `y 1.5` on a blitz tell; two corners over the two widest receivers, shaded 1 yd inside, at `y 1.5` (press) or `7` (off); `7 − safeties − 2 − LBs` nickels over the inside receivers at `y 2` (press) / `5`; safeties at `(±9, 12)` or `(0, 13)`. After the snap the roles blend in over `rotateMs` 600 from the shown spots to the **real** coverage: SHADOW (a cushion `0.8 + 6.5 × open(t)` yards off the man, shaded inside), DEEP landmarks per coverage (`COVER2 (±9, 14)`, `COVER3 (0, 17) / (9, 7)`, `COVER4 (±7, 15)`, `MAN (0, 15) / (0, 8)`, `BLITZ (0, 14) / (−9, 6)`, `PREVENT (±8, 20)`), RUSH along the sim's lanes (lane × 3 yd; the nearest lineman takes it and the nearest blocker is pushed back in front of him; arrival = `rushers[].arriveAt`, the first at `sackAt`), BLITZ (a real blitz sends a linebacker on the back, arriving at `1.05 × sackAt`), HOLD (the line). During the flight the man on the target and the deep help converge on the landing spot.

**Phases:**
- **SITUATION**: the field dimmed (`ink` at 0.55); a DOM card (`.pv-situation`: `.pv-sit-down` `3RD & 7`, `.pv-sit-line` `OWN 34 · Q4 0:48 · 21-24`, `.pv-sit-stakes`, `button.pv-go[data-action=read]` TAP TO READ, focused). A tap on the canvas, the button, or the confirm key → READ. A `CLUTCH` sub-banner (900 ms) when clutch.
- **READ**: the canvas shows the shown look (safeties deep, press or off, the box, the blitz creep); `READ THE LOOK` sub-banner (900 ms); the look line above the cards (`.pv-look`: `THEY SHOW: TWO HIGH, CORNERS PRESSED, SEVEN IN THE BOX · POCKET: SHORT` when `ctx.pressure.hot`, and the coverage's `tell` as the coach's line); the cards in the panel (`.pv-cards[role=group]` › `button.pv-card[data-play][data-idx][aria-label]`: the key `1–3`, the name, an SVG route thumbnail (`svg.pv-routes`, 60×40, the LOS at 30, each route drawn from the receiver's alignment mirrored by side; an arrow for a run), the one-liner (desktop), the advice chip `.pv-advice.chip-mint|gold|red|grey` (`GOOD / OK / BAD / ?`; dimmed `.unsure` with a `.pv-unsure` `?` badge and `data-sure="0"` on the card when the engine's `sure` is false — "if the look is honest"), up to three tags). Tap / click, or `1–9` → `pick(idx)` → `onPick` → SNAP (or RUN). The first card is focused; the canvas `aria-label` reads "The defence shows <look.text>. Pick a play."
- **SNAP**: the offence slides into the formation (`alignMs` 420), then `t` runs in real time: the QB drops (three frames), the receivers run their paths (run frames every `runFrameMs` 110), the rings appear from `revealAt`, coloured by the openness a ball released now would find (`arrivalFlight`, the engine's `openIfThrown` computed without allocating; `ringKind`: green ≥ `open.ring.open` 0.70, gold ≥ `closing` 0.25, red below; grey when the arrival is beyond `Play.maxDist`; the target's ring is chalk while unrevealed; the hold's hint reads `OUT OF RANGE · 41 YD ARM` for a target beyond the arm). A disguised look announces its rotation at the snap (`ROTATION · COVER 4` sub-banner over the align + rotate beat); the HUD clock runs down during a two-minute snap, the hot flag over the hot read for 1.5 s, the rushers close, the RUSH meter fills `t / sackAt` (`.pv-pressure[role=meter]`; `.hot` ≥ 70 %; `.clutch`), the hint `TAP A RECEIVER · HOLD · DRAG TO LEAD & LOFT · LET GO` (`1-5 PICK · HOLD SPACE · ARROWS LEAD & LOFT · LET GO IN THE GREEN` with a fine pointer), the play chip `.pv-chip.pv-play` shows the picked play. THROW AWAY appears at `t ≥ throwAwayAfterS` 1.2; SCRAMBLE at `t ≥ scrambleAfterS` 0.3 when `MOB ≥ scramble.minMob` 55. A tap picks the nearest receiver within `hitRadius` 28 virtual px of the sprite's centre (`hitTest`); `1–5`, arrows and Tab pick by slot order. `t ≥ sackAt` (or `≥ max(4, sackAt)`) → `resolve({kind: 'SACK', …})` whatever the input.
- **THROW**: once a target is chosen (bracket corners on him) the aim-then-hold meter runs (§4.5.1): the velocity bar (`.pv-vbar[role=meter]`, `VEL`, ticks every 10 %, the red zone past 1.0, the green band `.pv-vbar-green` from `greenZone`, the fill `.in-green` inside it) climbs while the finger / key is held; a drag or the arrows set lead / loft (`.pv-aim-lead` `LEAD ►0.3`, `.pv-aim-loft` `LOFT 0.6`; the lead arrow ahead of / behind the receiver along his run; a dotted loft arc from the hand to the target rising with `arcMin 1.5 + arcPerLoft 10 × loft` yards); the release → `onThrow`.
- **FLIGHT**: the ball arcs in perspective from the hand (`ballHandYd` 1.8) to `result.landing` over `flight × flightScale 0.75` (≥ `minFlightMs` 260; `reducedFlightMs` 80), its apex `arcMin + arcPerLoft × loft`, its size `lerp(8, 3, 1 − s) × (1 + 0.35 × 4s(1 − s))`, a ground shadow, a 3-px camera dip, the QB in the throw pose for `throwPoseMs` 250, the target and the defence converging. Then the landing beat: **catch** (`catchHoldMs` 250, then the YAC run `140 + 55/yd` ms, ≤ 900), **drop** (a bounce, whistle), **INT** (the nearest defender takes it and returns 3 yards over `intReturnMs` 320, the bad stinger), **throwaway / incomplete** (a bounce, `bounceMs` 220). Skippable after `skipAfterMs` 300 (`TAP TO SKIP`).
- **SACK**: the QB goes down (`sackMs` 380; a 3-px shake and a red flash unless reduced), thunk + haptic 60.
- **RUN**: the runner (the QB on a scramble / SNEAK, the RB on a DRAW) runs `yards` over `runMs 720 + 25/yd` (≤ +600 ms), capped at the goal line.
- **RESULT**: the banner (`.pv-banner.pv-banner-good|bad|gold|blocked|neutral` with an icon: the engine's `banner` wins, its `text` as a sub-banner when different — `TOUCHDOWN!` gold, `FIRST DOWN` / `CATCH +14` good, `INTERCEPTED` / `FUMBLE` blocked, `SACKED -7` / `DROPPED` / `INCOMPLETE` bad, `THROWN AWAY` neutral), a gold / red flash (0.55 on a TD, 0.45 bad, 0.25 good), the crowd cheers or groans (stingers, roar on a TD), the feedback strip (`.pv-feedback-line` `ON TIME · GOOD · WINDOW 72% · ACC 81% · AIR 14 · YAC 3`, `.pv-feedback-coach` the coach's sentence), `aria-live` announces it, `onResult`. Skippable at once; `resultMs` 1200 (`resultReducedMs` 400) → DONE.

**`PlayView.TIMING`** (ms unless noted): `alignMs 420 · dropMs 450 · rotateMs 600 · releaseS 0.5 s · playMaxS 4 s · throwAwayAfterS 1.2 s · scrambleAfterS 0.3 s · flightScale 0.75 · reducedFlightMs 80 · minFlightMs 260 · throwPoseMs 250 · catchHoldMs 250 · yacBaseMs 140 · yacPerYdMs 55 · yacMaxMs 900 · intReturnMs 320 · bounceMs 220 · sackMs 380 · runMs 720 · resultMs 1200 · resultReducedMs 400 · skipAfterMs 300 · bannerFadeMs 300 · subBannerMs 1400 · crowdIdleMs 700 · crowdCheerMs 180 · runFrameMs 110 · hintMs 1600 · armMs 200 (a phase ignores a confirm key and a field tap this long after it mounts: a double tap on NEXT, three quick Enters) · pausePollMs 100 (a beat's timer re-arms in these steps while a modal is open)`. The whole situation card reads on a tap (the button's click bubbles), not only its button. At the sack the first rusher ends on the quarterback's near side (drawn over him), the others a step wide; the QB is drawn on his side with the ball loose; the shake scales with the yards lost. The interceptor is chosen at the throw (the deep help or the man on the target, else the nearest) and runs to the landing under the ball.

**HUD (`.pv-hud[role=group]`):** `.pv-strip` of `.chip.pv-chip` (`hudParts(ctx)`: `3RD & 7` gold · `OWN 34` · `Q4 0:48` (`OT` past Q4) · `21-24` · `WIND ← 8` · `RAIN`) and the play chip; `.pv-hud-right` › the RUSH meter. The panel: `.pv-throwbox` (`.pv-hint[role=status]`, the velocity bar, `.pv-throwrow` with `.pv-aim` and `.pv-actions` › `button.pv-btn-away[data-action=throwaway]`, `button.pv-btn-scramble[data-action=scramble]`), `.pv-feedback`. Overlay (`.pv-overlay`, pointer-events none): `.pv-sub.pv-sub-info|clutch|good`, `.pv-banner`, `.pv-toast` (the stray-tap hint `TAP A RECEIVER FIRST` / `PICK A RECEIVER: 1-5`), `.pv-skip`. Reduced motion (`settings.reducedMotion`, `opts.reduced` or `prefers-reduced-motion`): no align / drop / rotate beats, 80-ms flight, 400-ms result, no shake, flash or vignette. The left-handed mirror flips the QB sprite only.

#### 4.5.1 Input (`RTG.UI.PlayInput`, modelled on the kicker's `ui/input.js`)

`PlayInput.create({ canvasEl, hitTest(clientX, clientY) → slot|null, active(), holdMs(), greenZone() → {lo, hi}|null, assist(), keys(), canThrowAway(), canScramble(), playTime(), onTarget(slot, 'tap'|'key'), onHoldStart(), onHold(P), onAim(lead, loft), onHoldCancel(), onRelease(input), onThrowAway(), onScramble(), onStray() }) → { update(now), state() 'IDLE'|'ARMED'|'HOLD'|'DONE', target(), power(), lead(), loft(), setTarget(slot, how), cycle(dir), holdStart(), holdEnd(), setLead(v), setLoft(v), qualityNow(), inGreenNow(), throwAway(), scramble(), slots(list), reset(), destroy() }`. It never touches state; the play clock is the sack clock the scene owns.

**The hand (the kicker's aim-then-hold, adapted):**
1. A press **on a receiver** selects him and starts the climb in the same touch; a press anywhere on the canvas after a target was chosen (by key or an earlier tap) also starts the climb. `setPointerCapture`; `touch-action: none`; one pointer.
2. While held the bar climbs linearly `0 → powerMax 1.15` over `holdMs` (`Tuning.qb.throw.meterHoldMs` 1300) and parks at the top. A drag from the press point sets **lead** (`dx / leadRangeCss 44`, −1..1) and **loft** (`loftStart 0.5 − dy / loftRangeCss 56`, 0..1: drag UP for touch, DOWN for a bullet), both past a dead zone of `deadCss` 6.
3. The release throws: `power` = the bar; `quality` against the green band — the kicker's meter rule verbatim: `center 1.0` at the middle easing to `edge 0.88` at the rim, then `0.88 − missSlope 3.0 × d` outside it (floor `min 0.15`; `edge` when no band — a bar parked in the red is 0.15, the meter is a skill); `green = inside the band && assist()` (Settings ▸ "Green = on time", default on). A release under `minCommit` 0.08 is a stray tap: back to ARMED, the target stays. A lost pointer (`pointercancel`, capture loss, window blur) past `noCancelP` 0.20 throws with `cancelQuality` 0.5, else it is a stray.
4. A press with no target on empty grass is a swipe candidate: a downward swipe of `swipeCss` 48 within `swipeMs` 500 is SCRAMBLE (when allowed); a plain release is `onStray`.

**Keys** (`DEFAULT_KEYS`; `settings.keys` remaps; `A/D`, `W/S` alias the arrows while unremapped): `1–5` pick a receiver in slot order (`WR1 WR2 SLOT TE RB`); `←/→/↑/↓` cycle the target before the hold and set lead / loft during it (`nudge` 0.1 per tap, a sweep of `sweepPerSec` 1.2 after `sweepAfterMs` 220 held); `Tab` / `Shift+Tab` step the target while the canvas or the body has the focus and a target is chosen, without wrapping — at either end Tab stays native and leaves the canvas for THROW AWAY / SCRAMBLE and the page beyond (never a button); the confirm key (`Space` / `Enter`) held = the climb, released = the throw (auto-repeat ignored; a focused THROW AWAY / SCRAMBLE button keeps its own Space / Enter); `X` = throw away, `Z` = scramble. The emitted input: `{kind: 'THROW', target, t: playTime(), lead, loft, power, quality, green}`; the scene's THROW AWAY sends `{kind: 'THROWAWAY', power 0.6, quality 0.5}`, SCRAMBLE `{kind: 'SCRAMBLE', power 0}`, the clock `{kind: 'SACK', quality 0.3}`.

### 4.6 Audio (`RTG.UI.Audio`, copied)

The kicker's cues, wired: `click` (a pick, the target, the bar's 10 % ticks), `thunk` (the sack at 1.0, the catch at 0.6, a run's snap at 0.8), `whoosh` (the release, a run), `whistle` (a drop, a throwaway), `stingerGood` / `stingerBad`, `crowd(level)` on arm and at the result, `crowdRoar` on a touchdown, `haptic(ms)` (15 at the snap, 20 at the release, 60 at the sack; `settings.haptics`), `crowdStop` / `heartbeatStop` on destroy. Every cue is optional (wrapped in a try).

### 4.7 Accessibility and QoL

- Keyboard-only path end to end: title (Tab, Enter), the situation card (a focused button), the cards (`1–9`, Tab + Enter), the target (`1–5`, arrows, Tab), the hold (Space / Enter), lead / loft (arrows), X / Z, the skips (Space / Enter), the interstitial (a focused NEXT, Enter / Space on the body), the summary (a focused PLAY AGAIN). Escape opens Settings from every screen, including the chromeless scene, and returns to the still-armed moment.
- The canvas is `role="img"` with `tabindex="0"` (focused at the snap) and an `aria-label` that follows the phase (the situation, the look, "Snap.", "Target WR1.", "Ball in the air.", the banner + the coach's line); `#live` (`aria-live="polite"`) announces the situation, the look, the result, the story and the box score. Cards, buttons, meters and groups carry roles and labels; the settings modal traps focus.
- Colour-blind and high-contrast palettes (the rings use three shapes; every banner has text + icon), reduced motion, font scale, the left-handed mirror, tooltips on the attribute bars, haptics.
- QoL: the seed shown and editable, RANDOM, PLAY AGAIN with the same seed, the stray-tap hint, THROW AWAY and SCRAMBLE as buttons as well as keys / a swipe, the feedback strip and the coach's sentence after every snap, `?seed=` sharing.

---

## 5. Test plan

Runner: `node qb/test/run.js` (every `qb/test/*.test.js` in its own process; `node:test` + `node:assert/strict`, no npm; a file whose first 40 lines contain `[balance]` is skipped unless `--balance`; `node qb/test/run.js play` filters by name; a single file: `/opt/node22/bin/node --test qb/test/play.test.js`). `test/load.js` evaluates the `ORDER` files in a `vm` context with no `window` / `document` and returns `RTG` (`RTG.__loaded` lists what was delivered). Playwright specs are dev-only: `/opt/node22/bin/node qb/test/e2e/run.js [boot moment]` (each spec also runs standalone; the static server serves the repo root at `RTG_PORT` 8080 or a free port; never edit source during a run).

### 5.1 Node engine tests

| File | Asserts |
|---|---|
| `purity.test.js` (19) | every file under `js/engine` and `js/data` is wrapped in the shim with `'use strict'`, references `window` only in it, none of `document / localStorage / Math.random / Date / setTimeout / setInterval / requestAnimationFrame / performance / console.log / fetch`, no `?.` `??` class fields, optional catch binding or modules; only `tuning.js` assigns into `RTG.Tuning`; every file parses and the engine loads without throwing; every `ORDER` file exists; the namespaces `Tuning.qb`, `Util` (13 fns), `RNG.create`, `Weather.forGame/perKick/monthFor`, `Data.plays {routes, plays, coverages}`, `Play.buildContext/snap/throw/driveScript/rating`; `RTG.TuningDefaults()` returns a fresh deep copy and `Tuning` is mutable in place; no numeric leaf is NaN / undefined. |
| `rng.test.js` (13, the kicker's) | mulberry32 vectors; same seed → identical sequence; `state / setState` resume exactly; `gauss` mean / sd and 2 draws; `fork` deterministic, 1 parent draw; `shuffle` a permutation. |
| `util.test.js` (13, the kicker's) | `erf / phi`, `fnv1a`, `template`, `indexBy`, `clamp`, formatters. |
| `play.test.js` (33) | **data**: every route's `ideal` in range, window inside [0, 4], path from the alignment; 13 pass plays each assigning all five slots to known routes with a full `vs` table, SNEAK and DRAW the run options; the six coverages' looks, disguises, `pressureMul` (BLITZ 1.6, PREVENT 0.7), tightness. **draw counts**: each call costs the parent exactly 1; the child counts of §3.6 (ctx 8 + 2·cards, pass snap 28, SNEAK 3, DRAW 4, drive 25; throw THROW 9 · SACK 2 · THROWAWAY 0 · SCRAMBLE 3 + 1). **determinism**: same seed → same context, sim and result; a different seed differs. **buildContext**: the shape; the disguise rate falls with IQ per the formula; advice vs the SHOWN look below `iqExact` and the REAL coverage at or above; a GOOD-vs-real card about `goodOffered` of the time; SNEAK only at `toGo ≤ 2`, DRAW at 3, two pass cards next to a run card; the coverage follows the situation (BLITZ more on 3rd and long, COVER4 less in the red zone, PREVENT late with a lead; `opp.tendency` forces it); `sackAt` shrinks with a worse line and a blitz, grows with POI, the clutch shortens it for a nervous QB; tolerant inputs (no qb / team / opp → the demo defaults; a numeric `team.wr`; the sign mirrors the alignment). **snap**: the shape (five receivers, 41 samples in 0..1, windows in [0, 4], release windows, sackAt, rushers, scramble, checkdown); a GOOD play opens wider windows than a BAD one; the reveal comes earlier with IQ; under a real BLITZ the quickest route is hot and opens earlier; scramble yards scale with MOB and the look; SNEAK on 4th & 1 ≈ 70 %; DRAW is a run result. **throw**: `t ≥ sackAt` is a SACK whatever the kind (a 0-MOB SCRAMBLE too) with negative yards and TOO LATE; a throwaway is never a turnover and gains nothing, a stray release too; an on-time green throw into a window ≥ `intWindow` has `pInt` exactly 0; a late throw into a closed window is picked ≈ 25–40 %; completion rises with ACC, quality and the window (GOOD > OK > BAD) and the 55-ACC / SURGEON on-time targets hold; pressure and weather cost accuracy, power outside the band costs the fit, a ball beyond the arm dies; the result bookkeeping (yards = air + yac, the goal-line clamp, td / firstDown / banner precedence, feedback labels); SCRAMBLE ≈ `sim.scrambleYards`, fumbles only at low MOB, escapes more with MOB. **green band**: `need` grows with distance and shrinks with ARM, the band widens with ACC and fits under `powerMax`, `inGreen` verifies a claim. **geometry**: `pathAt` interpolates / extrapolates, `openAt` clamps, `flightTime` scales with arm / power / loft, `arrival` converges. **forcedResult** for every kind without rng. **driveScript**: the six kinds in order, short yardage offers SNEAK, the two-minute clock under 1:00, the last play winnable by a TD and not a FG. **text**: `downText / spotText`. **rating**: 158.3 · 92.4 · 100.7 · 117.2 · 0. |

Current run: `node qb/test/run.js` → 4/4 files, 78 tests green.

### 5.2 Playwright flows (`qb/test/e2e/*.spec.js`; Chromium; `H.matrix` = file + http × phone 390×844 + desktop 1280×800)

The harness (`_harness.js`): `openApp / openDemo({mode, viewport, seed, query, debug, blockFonts, dpr, reducedMotion}) → {page, context, errors, foreignErrors, url, close()}` (waits on `RTG.UI.app.ready`; `errors` excludes 404s of scripts listed but absent; errors from `ui/(sprites|canvas|audio|playinput|playview).js` go to `foreignErrors`), `waitReady`, `waitForScreen(page, id)` (`RTG.UI.app.screen()`), `waitPhase(page, phase)` (`RTG.UI.PlayView.current().phase()`), `debug(page, fn, …args)`, `shot(page, name)` → `test/e2e/shots/<name>.png`, `noHorizontalScroll`, `clickButton(page, label)`, `VIEWPORTS {phone, desktop, landscape 844×390, narrow 320×568, tablet 768×1024}`. The helpers (`_playhelpers.js`): `pickArchetype / pickTeam / pickVenue`, `startDrive` (→ moment + SITUATION), `tapToRead`, `cards(page)`, `bestCard`, `pickPlay(page, idx)`, `pickFirstGood`, `chooseTarget` (the most open receiver whose `release.peakAt` fits before `sackAt − 0.35`, else the checkdown; returns `ideal`), `tapReceiver(page, slot, {touch})` (mouse or CDP touch on the sprite from `view.actors()`), `holdRelease(page, {touch, lead, loft, releaseAt, onHold})` (press on empty grass, a computed sleep to the lower part of the band read at the hold start — the bar climbs `0 → 1.15` over `meterHoldMs` — then a per-frame poll past the centre of the LIVE band, then let go), `keyThrow` (number key → Space held → arrow nudges toward the ideal → Space up), `waitGreen`, `waitPlayTime`, `waitResult`, `waitDone`, `next`, `playMoment(page, {how: 'mouse'|'touch'|'key', cardIdx, lead, loft, onTime, skip})`, `geometry`, `current`, `state`, `touchTap`.

| Spec | Steps & assertions |
|---|---|
| `boot.spec` (5) | matrix: zero console / page errors and zero scene-file errors on boot; `RTG.VERSION`, `RTG.debug`, `RTG.UI.app.ready`, `RTG.Play.buildContext`, `RTG.UI.C.el`, `RTG.UI.Sprites.get` present; `#app` not blank; no `.boot-error`. Plus file + phone with the Google Fonts hosts blocked: still renders, `ready`, no errors. |
| `moment.spec` (8 runs) | **matrix** (seed 4242, GUNSLINGER / AVERAGE / COLLEGE): four archetype cards with 20 bars, the seed shown, `state().drive` and the six script kinds in order; six real moments — the situation card with TAP TO READ and ≥ 4 HUD chips; 2–3 cards each with a GOOD / OK / BAD / ? chip; the best card; the chosen target (mouse on desktop, a keyboard-only moment 2 on desktop, a CDP-touch moment 3 on phone): phase THROW, `current().target` is the tapped slot, the emitted input is a THROW to it, `power` inside the live band ± 0.03, `green === true`; a result with a banner matching the outcome list and visible; the result recorded with the same outcome; the interstitial with a story line and ≥ 5 line chips (or the summary after the sixth); the summary: `done`, six results, `att + sacks + rushes === 6`, `[data-rating]` equals `summary.rating`, CMP/ATT on the line, six rows, a verdict; a re-navigation with the same seed reproduces the script signature, the first read's cards + advice and the real coverage. Zero errors at every checkpoint. **file desktop**: `forceResult('TD')` from the read → a forced CATCH with `td`, the TOUCHDOWN banner and story, the line updated; `skipTo('summary')` → six results, `seed() === '99'`; PLAY AGAIN keeps seed / archetype / team / venue with a fresh line; `forceResult('FIRST_DOWN')` advances the next situation's `yl` by the gain and clamps `toGo`. **file desktop**: Escape → the settings modal on the title and on the chromeless scene, a toggle applies live to the body and persists in `rtg.qb.settings`, the scene is still on the armed moment. **file narrow 320 px**: the title and the summary without horizontal scroll. **file landscape 844×390**: a moment plays and the story fits. |
| `qa_shots.js` (a tool, not a spec) | seed 4242 through the real screens at phone + desktop (http): `qb_title / situation / read / snap / throw / flight / result / story / summary_<vp>.png` into `test/e2e/shots/`; `all` adds landscape and narrow. |

### 5.3 Definition of done (per module, inherited from the kicker)

Unit tests green; purity green; `node --check` on every touched file; the public API matches §3.5; no `console.log` in engine code; JSDoc with the draw count on every exported function; the bundle (`node qb/tools/bundle.js`, full and `--fragment`) boots at 390 / 1280 / 320 px with zero errors and no horizontal scroll.

---

## 6. The career to come

The player's fourth answer (D2) was "the full career later". The seam is already cut: `RTG.UI.Moment.mount` depends only on `{ctx, Play, PlayView, rng}`, and `Play.buildContext` takes a plain situation with optional `qb / team / opp / weather` blocks — a career hosts the moment screen unchanged by building that situation from its game state and recording the `PlayResult` into its own stats. What follows is a list, not a design.

**What the kicker's career gives the QB game for free** (its `engine/` and `ui/` machinery is generic over "a session of user plays inside a simulated game"):

- **The hub, the week loop and the season** (`Season`, `Schedule`, `Standings`, the `hub` / `schedule` / `standings` / `postgame` screens): the week card, PLAY GAME / SIM GAME / SIM TO END OF SEASON, the drive log, the 48 real colleges and the fictional 32-team NFL with their schedules, tiebreaks, rankings, playoffs and bowls.
- **Training** (`Player`, the XP economy, the weekly focus card, the offseason blocks, the `training` screen) — with the attribute keys swapped for `ARM / ACC / IQ / MOB / POI` and the archetype signature uncapped (D24 → `Tuning.qb.archetypes[].signature` already names it).
- **Events, headlines and the inbox** (`Events`, `data/events`, `data/headlines`; "the news must be a little bit mean") — the schema, the roll, the ring buffers, the effect machinery; the copy needs a QB pass.
- **Contracts, agents, free agency, tags, cuts** (`Contracts`) — the offer generation and the counter; the money scale changes (a quarterback is not paid like a kicker) but the machinery does not.
- **The draft and the combine** (`Draft`) — the value → round table and the ticker; the rounds a QB goes in are different (§ below).
- **Money** (`Finance`, `data/finance`, the FINANCES step, "THE BOOKS") — the bank, the lifestyle plans, the buys, the three services, the investments with real risk; untouched by the position.
- **Stadiums** (D25): the venues are already in the scene (§4.5) as the kicker's `VENUES` in miniature, and `ctx.venue` / `prestige` come with the team.
- **Save / load** (`Save`, `Schema`, the slots, export / import, migrations) — the demo deliberately kept no save (D17) so the career brings its format with it.
- **The kit**: the store / router / components, settings, the debug panel, the palette, the sprites, the canvas, the audio, the accessibility rules, the e2e harness idiom.

**What must be QB-specific:**

- **Stats and splits**: a passing line per game / season / career (`att, cmp, yds, td, int, sacks, rush`) instead of FG buckets; `Play.rating` is the headline number; splits by down, distance, coverage, pressure, weather; the "key plays" log replaces the kick log (the store's results entry is the row shape to keep).
- **Awards and records**: the kicker's catalogue (Golden Leg, STPOY, longest FG) is position-bound; a QB needs passing titles, an MVP-style award, rookie honours, season / career records for yards, touchdowns, rating, game-winning drives, and legends to chase.
- **The sim's dependence on the QB, on the line and on the receivers**: the kicker only touches field goals and PATs, so its drive engine takes the team's `OFF` as given. A QB career must make the team's offence depend on the quarterback (the drive outcome shift from the QB's overall) and the *moment* depend on the team: `situation.team.ol` and `wr[5]` and `opp.dl / db` are already the inputs the engine reads, so the roster needs real linemen and receivers with `skill / speed` that progress, get hurt and leave (the demo's presets are the seam).
- **Key-play selection per game**: the sim must decide which snaps are moments — the demo's six kinds (`THIRD_MEDIUM, THIRD_LONG, RED_ZONE, SHORT_YARDAGE, TWO_MINUTE, LAST_PLAY`) are the natural catalogue, and the kicker's `USER_KICK` event is the pattern (`simToNextUserKick` → a `USER_SNAP` event carrying the situation; every other snap resolved by the sim with an AI input — `Store.autoInput` is the seed of `Play.aiInput`). A per-game budget of moments (3–6) is a pacing decision (§1.3 of the kicker).
- **Progression and aging** curves for the five attributes (an arm declines, IQ grows late), traits, injuries that fit a quarterback, the QB1 / QB2 job-security semantics (a benching is a bigger event than a kicker's), and difficulty tiers that scale the accuracy score and the disguise rate rather than a kick's σ.
- **The senior season and the camps** (D23 / D26) with throws instead of kicks: five games of moments and a recruiting board that moves on completions and wins; a camp is a handful of scripted moments in front of a staff.
- **AI quarterbacks** for the league sims (an `AIQuarterback` like `AIKicker`) so awards and records are earned against real simulated lines.

*End of specification.*
