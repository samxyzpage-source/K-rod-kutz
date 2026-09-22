# ROAD TO GLORY: KICKER — Authoritative Build Specification

**Version:** 1.0 (synthesis of proposals "fun" / "systems" / "tech" + judge feedback)
**Status:** FROZEN for implementation. Changes require a spec bump and a note in §0.4.
**Repo location:** `kicker/` (the repo-root `index.html` barber-shop page is untouched).
**Audience:** 5 parallel engineers (E1–E5) + 1 integrator (INT). Every module contract in §3 is binding.

---

## 0. How to read this document

### 0.1 Document map

| Part | Section | Who must read it |
|---|---|---|
| A. Game design | §1 pillars & pacing · §2 rules, formulas, tables, catalogs, data | Everyone (E1–E3 in full; E4/E5 skim §2.3, §2.10–2.12) |
| B. Technical | §3 files, namespace, state schema, public APIs, sim/career state machines, save, debug | Everyone, in full |
| C. UI | §4 screens, palette, pixel approach, input, animation, accessibility | E4, E5, INT |
| D. Tests | §5 Node engine tests & Playwright flows | Everyone (each owns tests for their modules) |
| E. Plan | §6 work packages, contracts, milestones, integrator duties | Everyone |

### 0.2 Terminology

- **Engine**: DOM-free JS under `kicker/js/engine/` and `kicker/js/data/`. Loadable in Node. Never touches `window`, `document`, `localStorage`, `Date`, `Math.random`, timers.
- **UI**: everything under `kicker/js/ui/`, `kicker/css/`, `kicker/index.html`, plus `kicker/js/debug.js`.
- **State** (`CareerState`): one JSON-serialisable object holding the entire career. Mutated **in place** only through engine API calls.
- **rng**: the seeded RNG instance (mulberry32). The engine's only source of randomness. Its integer state is persisted in `state.rngState`.
- **uiRng**: a separate, non-persisted RNG for cosmetics (crowd sway, particle jitter). Never touches state.
- **Kick triple**: `{power, aim, quality}` — the ONLY thing the UI (or the AI) hands to the kick engine.
- **Punt input**: `{power, aim, green?}` — what the scene (or `Punt.aiInput`) hands `RTG.Punt` for a punter's punt (§2.14). A punt reads no contact quality; `green` is the D21 assist claim and is re-checked by `Punt.inGreen`.
- **Pending**: `state.pending` — the engine's way of asking the UI for something (a kick, an event choice, a decision). The UI never guesses what to show; it renders `state.pending` / `state.stage` / `state.phase`.
- **Tuning**: `RTG.Tuning` — the single object holding every balance constant. Tests read it; nobody hardcodes a constant elsewhere.

### 0.3 Non-negotiable constraints (from the brief)

1. Static site. Plain HTML5 + CSS + vanilla JS + `<canvas>`. No build step, no bundler, no npm dependencies at runtime, no frameworks. Works on `file://` and GitHub Pages. Classic `<script>` tags in order; one global `window.RTG`.
2. Only optional external resource: Google Font "Press Start 2P" with monospace fallback. Fully playable offline.
3. Fictional teams/logos/players (real city names OK). Trademark blocklist test in CI.
4. Desktop (mouse+keyboard) and mobile (touch), portrait and landscape. Kick playable by drag/flick AND by keyboard meters.
5. Save/load via `localStorage`: 3 manual slots + autosave; save format version number; migrations.
6. Seeded RNG (mulberry32). No `Math.random` in engine code. A career is reproducible from `{seed, difficulty, inputs}`.
7. Strict engine/UI separation; engine unit-testable in Node via `vm`/`require`.
8. `RTG.debug.*` API for Playwright: force kicks, auto-play games/seasons, jump states, read state.
9. 60 fps canvas on a phone; no leaks across hundreds of games.

### 0.4 Decision log (contradictions resolved)

| # | Topic | Decision | Rationale |
|---|---|---|---|
| D1 | Sim shape | Explicit serialisable `GameState` with `startGame / step / simToNextUserKick / applyKick / finishGame` (tech). **No generators.** | Mid-game autosave, reload, and `RTG.debug.jumpTo` must work. |
| D2 | Kick error model | **Angular** (degrees) error with distance term, CON shank tail, contact channel, overswing (fun + systems). Not constant-yards (tech). | Only angular error reproduces the make-rate curve vs distance. |
| D3 | σ constants | **Re-fitted by Monte Carlo** in this spec (§2.3.6) to the real-data table (systems). Cells ±4 pts. | All three proposals' constants contradicted their own tables. |
| D4 | Max range | `maxFG` is the distance at which a full-power kick **clears the crossbar**, not the landing distance. Carry derived from it. | Fixes the "R_max is landing distance" error. |
| D5 | Hash geometry | Ball offset: NFL 3.083 yd, college 6.667 yd. Post centre is at lateral 0. **Aim 0 always means "post centre"** (pre-rotated) on all difficulties; hash adds a σ multiplier and an asymmetric window. | Judge 2: aim clamp vs college hash angle; keep the visual and the difficulty, drop the trap. |
| D6 | Input contract | Both pointer flick and keyboard meters emit the same `{power, aim, quality}` triple (tech). Flick feel per fun; all pixel thresholds are DPR-normalised; contact quality window = last 120 ms or 6 samples, whichever is larger. | One contract for tests, AI and UI. |
| D7 | Coach attempt decision | Uses `Kick.model(...).pMake` vs a threshold shaped by Coach Trust and coach aggression (systems), not a yardage cut-off. | A bigger leg literally creates more attempts; Trust is load-bearing. |
| D8 | Meters | Morale, Coach Trust, Fan Approval, Fame, **Job Security** (systems), hidden Form. **No Energy** (folded into Rest/Morale). | Retro Bowl-sized meter count. |
| D9 | XP | One XP pool spent by the player on the Training screen; weekly focus card = training XP + 25 % discount on that attribute this week. Per-attribute pools dropped. | Simpler UX; "weekly training choice" preserved. |
| D10 | Contracts | Fixed generated offers + one counter; agent tier widens acceptance (tech/judges). No 3-slider negotiation. | Scope. |
| D11 | Trades / transfer portal | In v1 as **events** that reuse offer generation and `changeTeam` (cheap). Practice mode, replays, extra headline packs → M4. | Brief lists them; cost is low given the offer machinery. |
| D12 | Sprites | Procedural sprite atlas from pixel strings built at boot (tech). No PNGs, no artist on the critical path. | file:// safe, no assets. |
| D13 | Difficulty | 4 tiers. σ multiplier applies only to the **user's** kicks (human or auto-simmed). Balance tests run at Pro. | Balance is difficulty-independent for AI. |
| D14 | League sims | Every game of the user's current league is simulated weekly (all AI kicks resolved through `Kick.model`), so awards/records are computed from real simulated stats. The other league only drifts yearly. | Cheap (≈600 drive rolls/week) and makes awards honest. |
| D15 | Team names (colleges superseded by D22) | All lists scrubbed against a blocklist of real NFL/NCAA/major-pro nicknames + name/place collisions (Minutemen, Aces, Gators, Broncos, Lakers, Bison, Cavaliers, Roadrunners, Mustangs, Bulldogs, Hurricanes, Timberwolves, Lightning, Mariners, Hoosier, Buckeye, Sooner, etc.). `test/data_lint.test.js` enforces it. | Legal. |
| D16 | Kickoffs | Simulated by default; optional one-tap timing mini-event (`settings.playKickoffs`). Dynamic-kickoff analog (touchback to the 30 NFL / 25 college). | Brief: "simulated or a simplified mini-event". |
| D17 | Rounds | Kickers go rounds 3–7 or UDFA; 1 % "first-round shock" event at draftValue ≥ 92. | Realism (systems) + fantasy. |
| D18 | State mutation | In place via API; `Schema.validate` runs after every dispatch when `debug` is on. No per-week deep clones. | Perf + simplicity. |
| D19 | Progression economy (post-integration spec bump) | POT ~ N(88, 6); `cost = 30 + 2.2·(v−50) + 6.5·(v−70) + 3.0·(v−80)`; game/offseason XP at ≈ 60 % of the §2.1.2 table (training 20 unchanged); tailwind range bonus 0.15 yd/mph; coach threshold +0.20 from 57 yd; camp battle only when the incumbent is within 2 OVR; HOF weights favour dominance and verdict/tier thresholds rescaled (1850 / 1550 / 1250 · 1900 / 1500 / 950 / 450); draft value +12 offset. Measured bands live in `Tuning.career.balance`; full rationale and tables in `docs/BALANCE.md` §5.2. | The §2.13 bands were unattainable under the original constants: every auto career hit its potential by NFL year 1 and retired first-ballot with 12 k XP unspent, leaving the Training screen dead for 15 seasons. |
| D20 | Kick input (post-launch, at the player's request) | **Aim-then-hold replaces the 3-click meter and becomes the default** for every new career and, once, for players whose settings predate it (`kickInputV2` marker in `rtg.settings`): arrows aim, then hold the confirm key / a finger and release inside the green band; the release sets power AND contact quality, so the accuracy needle is gone. Flick stays available under Settings ▸ Kick input. | The 3-click meter asked for three separate timings and the needle re-aimed the kick after the player had already aimed, which made the arrows feel pointless; one held press reads as a kick's windup and keeps aim and power as two clean, separate decisions. |
| D21 | Green = guaranteed (post-launch, at the player's request: "make it easier, green should be guaranteed") | A release inside the green band makes the kick outright — no random error, contact slop or block — and the band widened 0.15 → 0.20 (`Tuning.kick.range.greenBand`, also what the scene draws). Gated by `settings.greenAssist` (default on) and verified engine-side by `Kick.inGreen`. Aim-and-hold only; flick is unchanged. | The ask was for an easier game with a promise the bar can actually keep. Keeping it UI-flagged but engine-verified means the assist cannot leak into AI kicks, so the §2.3.6 make-rate table, the sim bands and the career balance targets all stand. Aim still decides every kick that misses the green. |
| D22 | Real colleges (post-launch, at the player's request) | The 48 fictional schools and the 18 fictional bowls are replaced with real FBS programmes on 2026 alignment and the real bowl slate; conference codes become `SEC BIG XII ACC PAC AAC` (letters only — the id grammar is `[A-Z]{3}` + index) and each conference is ordered to put real rivalries on the `(0,7) (1,6) (2,5) (3,4)` slots. `verifiedFictional` is `false` for colleges and the blocklist lint now guards the NFL side only. **The NFL league stays fictional.** | The player asked for real colleges on their own project. Only 48 of ~134 FBS programmes fit the engine's 6×8 structure, so this is a selection, not the full sport; Notre Dame and the other independents have no conference slot. School nicknames and marks are trademarks — fine for a personal project, worth licensing thought if it is ever published commercially, which is why the pro league remains invented. |
| D23 | The senior season replaces the showcase (post-launch, at the player's request: "instead of the college showcase can you play the last 5 games of high school to do offers for college") | The six-kick showcase is gone. A career opens at `HS.SEASON` on the last five games of the senior year (`engine/hs.js` → `RTG.HS`, session kind `HS_GAME`, screens `hsseason` / `hsgame`): every kick is a scoring chance inside a real game with a live scoreboard, the rivalry and playoff weeks end on the kicker, and a ten-school recruiting board moves after each game. The star formula keeps its shape but reads a 0–6 rating earned over the whole stretch (`HS.ratingOf`) instead of showcase makes, and the schools that reached the offer line join the offers list — capped at half of it. | Six kicks in an empty stadium had no stakes and nothing to follow; five games give the opening hour a scoreboard, a record and a recruitment to watch move. Building it as ordinary KickSessions kept the sim, save, autoplay and kick-scene machinery untouched — only the phase enum (`SHOWCASE` → `SEASON`), the session kind and the screens changed. |
| D24 | A punter career path (post-launch, at the player's request: "a separate option in the game for being a punter") | A career picks `K` or `P` at creation. The punter runs the same road — senior season, offers, college, draft, pros, Hall — on the same aim-then-hold input, but the kick is a different problem: distance rises with power while hang time peaks lower, so the green band is the power that maximises NET yards from this spot, and aim trades downfield yards for a ball nobody returns (§2.14). Punting stats, awards, records and Hall scoring are parallel rows selected by `position`. **As built** the punter's contracts, camp battles, combine, job security, season goals, game XP and post-game grade still run on the kicker's machinery; §2.14.7 lists every place the build and this design parted, and §2.14 as a whole was rewritten from the code after integration. | The kicking game already had everything a punter needs — contexts, sessions, the scene, the career — and nothing it had measured applied. Building the punt as its own module over the shared machinery keeps the field-goal balance untouched while giving the second position a genuinely different decision to make, rather than a reskin of the same kick. |

---

## 1. Game overview

### 1.1 Pitch

You are a leg. The most ignored player on the roster until the game is on your foot. *Road to Glory: Kicker* compresses a whole football career — walk-on freshman to Hall of Fame plaque — into a Retro Bowl-style text-and-pixels experience where the only plays you play are your kicks. Everything else (drives, injuries, coaches, contracts, the media) is simulated and narrated in snappy headlines and messages.

### 1.2 Pillars (acceptance checklist pinned above every monitor)

1. **The pull must feel heavy, the flick must feel sharp.** Sprite lean on pull, bar ticks every 10 %, "thunk" pitched by power, 4-frame contact flash.
2. **The doink must be unfair.** 500 ms freeze on the post, metallic TING, crowd holds its breath, then the ruling.
3. **The game-winner must be loud.** Heartbeat, vignette, muted crowd → roar, "GAME ON THE LINE" banner.
4. **The news must be a little bit mean.** Headlines never let you forget last week.
5. **Every number is a mechanism.** Trust → long attempts. Fame → they ice you more. CON → shank tail. Form → slumps the coach can see.

### 1.3 Pacing budgets

| Unit | Target time | Notes |
|---|---|---|
| A kick | 6–10 s | snap 0.4 s, input ≤ 2.5 s play clock, flight 0.9–1.9 s, result 1.2 s |
| A game (sim-to-next-kick ON) | 60–120 s | ~2 FG + ~2.7 PAT (auto-PAT ON after year 1) |
| A game (watch mode) | ~4 min | drive log at 400 ms/drive |
| A week | 3–5 min | week card → inbox/event → training → game → post-game |
| College season (12 + CCG + bowl/playoff) | 45–70 min | |
| NFL season (17 + playoffs) | 70–100 min | |
| Full career (3–4 college + 10–15 NFL) | 12–20 h | + records chase & second careers |

### 1.4 Career act structure (drives the event pools and messaging tone)

| Act | Stage / ages | Emotional question | Meters that matter |
|---|---|---|---|
| I — Prove it | HS senior season, college (18–22) | Do I belong? | Job Security, Coach Trust, Morale |
| II — Get paid | Draft, rookie deal, first extension (22–29) | What am I worth? | Fame, Fans, Trust, money |
| III — Hold on | 30+ | How does it end? | Job Security, decline, legacy/HOF meter |

---

## 2. Game design

### 2.1 Attributes, progression, aging

#### 2.1.1 Attributes (integers 1–99)

| Attr | Key | Governs |
|---|---|---|
| Power | `POW` | `maxFG` (range), carry, kickoff distance, overswing tolerance |
| Accuracy | `ACC` | base angular σ (70 % weight), wind-compensation quality of the AI |
| Consistency | `CON` | base σ (30 % weight), shank-tail probability, block get-off, weekly Form variance |
| Composure | `CLU` | pressure multiplier, aim-line sway, ice immunity at ≥ 90, hesitation penalty |
| Kickoff | `KO` | touchback zone width, hang time, opponent field position |
| Overall | `OVR` (derived) | `round(0.30·ACC + 0.25·POW + 0.20·CON + 0.17·CLU + 0.08·KO)` |
| Potential | `POT` (hidden, per attribute) | Hard cap per attribute. `POT[a] ~ clamp(round(N(80, 8)), 60, 99)`; 5-star recruit `+6`, 4-star `+3`, walk-on `−3`. Revealed to the player by agent tier (§2.7.10). |

A punter (§2.14) trains the same five numbers under different names (`Player.attrLabels('P')` / `Player.attrNames('P')`):
`POW` = **LEG** (Leg strength: `maxDist`, the gross ceiling), `ACC` = **PLACE** (Placement: lateral σ, so the sideline is findable), `CON` = **OPER** (Operation: distance σ and the block get-off), `CLU` stays **CLU** (Composure), `KO` = **HANG** (Hang time: `maxHang`). `OVR` keeps the kicker's weights for both positions, so a punter's hang leg counts 8 % of OVR while it decides most of the net.

**Starting attributes** (recruit creation, `Player.create`):

| Archetype | POW | ACC | CON | CLU | KO |
|---|---|---|---|---|---|
| Cannon | 60 ± 4 | 46 ± 4 | 44 ± 4 | 44 ± 5 | 52 ± 5 |
| Surgeon | 48 ± 4 | 60 ± 4 | 54 ± 4 | 46 ± 5 | 44 ± 5 |
| Iceman | 50 ± 4 | 50 ± 4 | 48 ± 4 | 64 ± 4 | 46 ± 5 |
| Soccer Convert | 56 ± 4 | 46 ± 4 | 46 ± 4 | 46 ± 5 | 62 ± 4 |

`± n` = `round(N(0, n))` via rng, clamped 30–75. Star rating (§2.7.1) adds `+4·(stars − 3)` to every attribute (walk-on = 2 stars → −4).

**Form** (hidden, −6..+6, float): weekly `form = 0.7·form + N(0, 3.5·(1 − CON/130))`, clamped ±6. `Kick.model` uses `ACC_eff = clamp(ACC + form, 1, 99)`. Form ≥ +3 → coach text "You've looked sharp in practice"; ≤ −3 → "Coach is watching your plant foot".

**Traits** (`player.traits: string[]`, max 3; earned or rolled at creation with p = 0.25 for one trait):

| Trait | Effect | How acquired |
|---|---|---|
| `BIG_LEG` | `maxFG +2`, σ ×1.04 | creation (Cannon 40 %, others 10 %) |
| `ICE_VEINS` | pressure multiplier ×0.85 | creation (Iceman 40 %) or 3 game-winners in one season |
| `COLD_WEATHER` | cold/snow σ and range penalties halved | 3 seasons on a `cold` climate team |
| `DOME_BABY` | `maxFG −1` outdoors, σ ×0.97 in domes | 3 seasons on a dome team |
| `LATE_BLOOMER` | growth age windows shift +2 years | creation (10 %) |
| `LEGS_OF_STEEL` | decline starts 2 years later | creation (5 %) |
| `DOINK_KING` | flavour: doink headlines; fans +2 per doink-in | event 13 |

#### 2.1.2 XP economy

One pool `player.xp` (integer). Sources (Pro difficulty; multiply by `Tuning.difficulty[d].xpMult`):

| Source | XP |
|---|---|
| FG made | `8 + 0.5·max(0, D − 35)` (48 yd → 14.5) |
| FG made 50+ | `+8` |
| Clutch make (`pressure ≥ 0.6`) | `+12` |
| Decisive make (game-winner / tie-forcer) | `+30` / `+18` |
| FG missed | `+2` |
| PAT made / missed | `+1` / `0` |
| Kickoff touchback (when played) | `+1` |
| Team win / loss | `+4` / `+1` |
| Weekly training focus | `20 · moraleMult · coachMult` (`moraleMult = 0.7 + 0.006·Morale`; `coachMult` 1.15 for "kicker-whisperer" coaches, else 1.0) |
| Rest (training choice) | 0 XP, Morale +8, injury chance ×0.5 next game |
| Season goal met (3 goals per season) | 40 / 60 / 100 |
| Award | 40–200 (§2.8) |
| Offseason training block (3 per offseason) | `70 · moraleMult` each |
| Event choices | −30 .. +80 |

**Cost to raise attribute `a` from `v` to `v+1`:**

```
cost(v, age) = round( (12 + 0.6·max(0, v − 50) + 2.0·max(0, v − 80)) · ageMult(age) · focusMult )
ageMult: ≤22: 0.85 | 23–26: 1.00 | 27–30: 1.20 | 31–33: 1.60 | 34–36: 2.40 | 37+: 3.50
focusMult: 0.75 if `a` is this week's training focus (in-season) else 1.0
```
Examples (age 24): 60→61 = 18 XP; 75→76 = 27; 85→86 = 43; 90→91 = 56. Cannot exceed `POT[a]`.

Expected in-season income ≈ 45 XP/week → ≈ 30 attribute points/year early career (+6 per attribute), slowing to ≈ 8/year at 30+. A recruit at OVR 48 reaches ≈ 66–70 by draft, ≈ 85 by 27 if well played, elite (90+) by 28–30. This is the intended fantasy curve; `test/career_balance.test.js` asserts it (§2.13).

#### 2.1.3 Offseason growth & decline (`Player.ageTick`, applied once per offseason before training)

```
if age ≤ 24 (26 with LATE_BLOOMER): +1 to two distinct random attributes (rng.pick), capped by POT
declineStart = 33 (+2 with LEGS_OF_STEEL)
if age ≥ declineStart:   POW -= (age < 35 ? 1 : age < 37 ? 2 : 3)
if age ≥ declineStart+2: CON -= 1
if age ≥ declineStart+4: ACC -= 1
if age ≥ 32:             KO  -= (age < 35 ? 1 : 2)
CLU never declines.
```
Each decline line is reported in the offseason "Body Check" card ("Your leg lost a step this winter").

#### 2.1.4 Injuries

- Per game (user kicker): `pInjury = 0.012 · (Rest this week ? 0.5 : 1) · (age ≥ 32 ? 1.5 : 1)`. Types: plant-leg strain (1–3 weeks), hip flexor (2–4 weeks), quad (1–2 weeks). While injured: K2 kicks (user sims), Job Security −3/week, Trust −2/week.
- Career-threatening (Legend difficulty only, or age ≥ 34 on any difficulty): `p = 0.0015` per game → 8–14 weeks + POW −3 permanent; triggers the "Comeback" arc events (#28).
- Injury weeks tick down in `Season.endWeek`.

### 2.2 Soft stats (0–100 unless stated)

| Stat | Key | Start | Weekly drift | Deltas | Effects |
|---|---|---|---|---|---|
| Morale | `morale` | 60 | toward 60 (65 with "Sleep Study" flag) by 10 %/week | +3 team win, −2 loss, +4 clutch make, −6 clutch miss, +2 per make streak ≥ 5, events | training multiplier; `morale < 30` for 3 consecutive weeks → `SLUMP` flag: σ ×1.12 until morale ≥ 45 |
| Coach Trust | `trust` | offer-dependent (40/50/60) | toward 50 by 1/week | +2 make, +5 50+ make, +8 decisive make, −4 miss <40, −3 miss 40–49, −1 miss 50+, −8 decisive miss, −6 blocked (yes, unfair), +2 training Accuracy/Consistency, events | attempt threshold (§2.5.6); Job Security floor `= trust/5`; extension eligibility; `trust < 25` → "hot seat" headline + event #9 eligible |
| Fan Approval | `fans` | 50 | toward `teamWinPct·100` by 10 %/week | +1 make, +6 decisive make, −3 miss, −10 decisive miss, +2 team win, +3 doink-in, events | pressure −0.10 when ≥ 80; crowd noise; endorsement events gate at ≥ 60; `< 35` → "Boo birds" event eligible |
| Fame | `fame` (0–1000) | 0 (walk-on) / 20 (3★) / 60 (5★) | never decays | per make `+D/10 · marketMult`, decisive make +40, 50+ make +10, awards +40..150, events; `marketMult` = college prestige mult `1 + 0.15·(prestige − 3)` or NFL market mult (big markets ×1.2: NY, LA, Chicago, Dallas, Boston, SF) | tiers: Unknown < 100, Local Hero 100–249, Household Name 250–499, Star 500–799, Icon 800+. Gates: agent tier, endorsements, draft bump, ice frequency (`+0.10` ice prob at Star+), HOF vote noise |
| Job Security | `js` | 60 starter / 35 backup | see formula | see formula | benching, cuts, camp battles, extension |
| Form | `form` (hidden float −6..6) | 0 | `0.7·form + N(0, 3.5·(1 − CON/130))` | — | `ACC_eff` in `Kick.model` |

**Job Security weekly update** (`Player.updateJobSecurity`, called in `Season.endWeek` for the user; AI kickers do not track it):

```
js += 2·makes − 6·misses(<40) − 3·misses(40–49) − 1·misses(50+) + 8·decisiveMakes − 10·decisiveMisses − 4·blocked
js  = 0.9·js + 0.1·clamp(50 + 5·(myOVR − rivalOVR), 0, 100)      // regression toward the rating gap
js  = clamp(max(js, trust/5), 0, 100)
Difficulty scales the negative deltas: rookie ×0.6, pro ×1, allpro ×1.3, legend ×1.6.
```
- `js < 25` → benched next week (`player.role = 'K2'`); the rival kicks; user can only play kickoffs (if enabled) or sim. Benched player regains `K1` when `js ≥ 40` or the rival's FG% over the last 3 weeks < 70 % (fires event #9b "Coach is shopping for a new leg" → 6-kick camp battle).
- `js < 10` for 3 consecutive weeks → NFL: cut (→ `FA` phase mid-season: 0–2 offers at vet minimum, else practice-squad branch event #24); college: lose the job for the season (kickoffs only, transfer portal event unlocked in the offseason).

**Camp battle** (`Career.campBattle`): preseason if an incumbent/rival has `OVR ≥ myOVR − 5`, or when triggered by event. 6 kicks (32, 38, 44, 48, 52, 55 yd, pressure 0.3), user plays them; rival's kicks resolved by `Kick.resolve` with `aiInput`. `myScore = makes·10 + trust·0.2 + seniority·3` vs `rivalScore = rivalMakes·10 + 50·0.2 + rivalSeniority·3`; ties → incumbent. Loser is K2 with `js = 35`. A live scoreboard shows both lines.

### 2.3 Kick minigame (engine: `engine/kick.js`)

#### 2.3.1 Geometry & units

- Yards everywhere. Uprights 18.5 ft wide → half-width `H = 3.083`. Post band `R_POST = 0.10` (ball touching the post). Crossbar height `XBAR = 3.333`, crossbar band `±0.18`.
- Distance `D` = line-of-scrimmage yards-to-goal + 17 (7-yd hold + 10-yd end zone). PAT: college `D = 20`, NFL `D = 33`.
- Lateral coordinate `x` at the goal plane: `+` = kicker's right. Post centre is `x = 0`.
- **Ball offset** `ballX`: middle 0; NFL hash `±3.083`; college hash `±6.667` (sign = hash side; −1 left, +1 right). Snap spot distribution: NFL 40 % L / 20 % M / 40 % R; college 45/10/45.
- **Target angle** `targetDeg = atan2(−ballX, D)` in degrees. The UI pre-rotates the aim line so that user aim `0` = the post centre. The engine adds `targetDeg` itself: `launchDeg = targetDeg + aimDeg + error`.
- Angular window (relative to the post centre) is asymmetric from a hash; e.g. college right hash at 30 yd: −5.5° .. +5.7°. `Kick.model` reports `windowDeg: {left, right}` for the HUD.

#### 2.3.2 Range and flight

```
maxFG(POW, ctx)  = (37 + 0.31·POW) · rangeMult(ctx) + rangeAdd(ctx)
   POW 40 → 49.4   POW 55 → 54.1   POW 62 → 56.2   POW 72 → 59.3   POW 82 → 62.4   POW 90 → 64.9   POW 99 → 67.7
rangeMult = weather (clear 1.00, dome 1.00, heat 1.01, rain 0.97, fog 1.00, cold(<35°F) 0.95, snow 0.93)
          · (1 − 0.002·max(0, 40 − tempF)) (outdoor only) · (altitude ? 1.03 : 1) · traits (BIG_LEG +2 yd as rangeAdd, DOME_BABY −1 outdoors)
          · Π mods[key='range', op='mul']      (+ Σ mods[key='range', op='add'] as rangeAdd)
rangeAdd += 0.30 · windAlong          // windAlong = wind.speed · cos(wind.dir) mph; + = tailwind. 20 mph tail = +6 yd
KCB = 4.942                            // = XBAR / tan(34°): D·(1 − D/carry) = KCB at the crossbar
carryMax = maxFG² / (maxFG − KCB)      // landing distance at power 1.0 (maxFG 60 → 65.4)
Rneed(D) = D² / (D − KCB)              // carry needed to just clear the crossbar at D (D ≤ KCB+1 → treat as 8)
pNeed    = Rneed / carryMax            // fraction of full power needed
Peff     = power · (0.92 + 0.08·quality)             // bad contact bleeds power
carry    = carryMax · Peff
h(D)     = tan(34°) · D · (1 − D/carry)              // height at the goal plane, yards (0.6745·D·(1−D/carry))
flightTime t = 1.0 + 0.026·D seconds                  // 25 yd 1.65 s · 45 yd 2.17 s · 60 yd 2.56 s (UI scales ×0.75 for animation)
```
Power `power ∈ [0, 1.15]`; `> 1.0` is the **overswing** zone (+ range, − accuracy, plant-side push).

#### 2.3.3 Lateral error model (degrees)

```
s        = (0.7·ACC_eff + 0.3·CON) / 99                      // ACC_eff = clamp(ACC + form, 1, 99)
σ_base   = 1.8 + 6.0·(1 − s)²                                 // college avg (55/50) 3.07 · rookie (60/55) 2.80 · vet (78/75) 2.09 · elite (92/90) 1.84
σ_dist   = 1 + 0.018·max(0, D − 40)                           // 50 yd ×1.18 · 58 yd ×1.32
σ_press  = 1 + pressure·(0.9 − 0.008·CLU)                     // CLU 50 at p=1 ×1.5 · CLU 95 ×1.14; ×0.85 of the (σ_press−1) term with ICE_VEINS
σ_weather= clear 1.00 · dome 1.00 · heat 1.02 · fog 1.00 · rain 1.12 · cold(<35°F) 1.06 · snow 1.25 ; ×1.04 extra if surface='turf' and rain/snow ; COLD_WEATHER trait halves the excess over 1.0 for cold/snow
σ_hash   = middle 1.00 · NFL hash 1.03 · college hash 1.08
σ_power  = 1 + 0.10·max(0, power − 0.80)                      // smooth swings are straighter
σ_over   = 1 + 2.5·max(0, power − 1.0)                        // overswing: 1.15 → ×1.375
σ_mods   = Π mods[key='sigma', op='mul'] · (SLUMP ? 1.12 : 1) · (hesitation: +0.15° per 100 ms held at full draw beyond 1.2 s if CLU < 70, added to σ as an additive term)
σ_diff   = Tuning.difficulty[d].sigmaMult  (user kicks only; 0.85 / 1.00 / 1.10 / 1.20)
σ        = σ_base · σ_dist · σ_press · σ_weather · σ_hash · σ_power · σ_over · σ_mods · σ_diff

pShank   = clamp(0.05 − 0.0004·CON, 0.005, 0.06)              // CON 50 → 3.0 % · CON 90 → 1.4 %
err      = rng.chance(pShank) ? N(0, 3σ) : N(0, σ)             // shank tail (CON shapes the tail, not the mean)
contact  = (1 − quality) · 3.0 · (rng.chance(0.5) ? −1 : +1)   // player-skill channel: sloppy flick ≤ 3°
overBias = 1.2 · max(0, power − 1.0)/0.15 · footSign            // plant-side push; footSign = +1 right-footed, −1 left-footed
launchDeg = targetDeg + aimDeg + err + contact + overBias
windDriftYd = 0.025 · windCross · t²                             // windCross = speed·sin(dir) mph (+ = pushes right); 15 mph @ 45 yd → 1.77 yd
   · Π mods[key='windDrift', op='mul']  (Legend: actual speed = shown speed · (1 + N(0, 0.30)) "gusts", hidden)
x = ballX + D·tan(launchDeg) + windDriftYd
```

#### 2.3.4 Outcome resolution order

```
1. blocked?  (§2.3.5)                                   → BLOCKED (made=false). NFL blocked PAT: 2 % returned for 2 (defence points).
2. h(D) < XBAR − 0.18                                   → SHORT ; if h(D) < 1.5 → sub 'LINE_DRIVE'
3. |h(D) − XBAR| ≤ 0.18 and |x| < H                     → crossbar doink: rng.chance(0.50) ? XBAR_IN : XBAR_OUT
4. | |x| − H | ≤ R_POST                                 → upright doink: p = (|x| < H ? 0.45 : 0.25); XBAR/upright doinks also require h ≥ XBAR − 0.18
                                                           rng.chance(p) ? DOINK_IN : DOINK_OUT
5. |x| < H − R_POST                                     → GOOD ; sub 'DEAD_CENTER' if |x| < 0.8, 'SNEAKS' if |x| > 2.5
6. else                                                 → x < 0 ? WIDE_L : WIDE_R
made = outcome ∈ {GOOD, DOINK_IN, XBAR_IN}; points = made ? (type==='PAT' ? 1 : 3) : 0
```
RNG draw order inside `Kick.resolve` is FIXED (block, shank-select, gauss error, contact sign, power-noise (AI only), doink) so replays are deterministic; the test `kick.test.js` asserts the sequence.

#### 2.3.5 Blocks

```
pBlock = clamp( 0.006 + 0.00015·(oppST − 60) + 0.020·lowTraj + 0.030·allOut − 0.00008·(CON − 50) + Σ mods[key='block', op='add'], 0.002, 0.15 )
lowTraj = (Peff > 0.97 and D > maxFG − 3)     // straining line drive
allOut  = ctx.decisive                         // they bring the house
```
Typical 0.75 %/kick; ≈ 3 % on a straining 55-yarder to win it. Blocked FG: ball dead at LOS (defence takes over at the spot; 3 % scoop-and-score TD). Blocked PAT: no points.

#### 2.3.6 Balance table (canonical; `test/kick_calibration.test.js`, 30 000 kicks per cell, calm, middle hash, pressure 0.15, AI power rule, quality 0.85, aim error N(0, 0.5°), Pro, no mods)

| Profile (ACC/CON/CLU/POW) | maxFG | 20–29 | 30–39 | 40–49 | 50–55 | 56–60 |
|---|---|---|---|---|---|---|
| College average (55/50/50/58) | 55.0 | **95** | **85** | **70** | **52** | 29 |
| NFL rookie (60/55/55/62) | 56.2 | **97** | **88** | **75** | **59** | 40 |
| Solid vet (78/75/70/72) | 59.3 | **99** | **96** | **87** | **74** | 61 |
| Elite (92/90/88/82) | 62.4 | **99.5** | **98** | **92** | **82** | 71 |

Bold cells are asserted at **±4 points**; the 56–60 column at ±6. Reference real-world NFL 2019–24: 97 / 91 / 84 / 72 / ~60. Season-level targets (with weather, wind, hash, pressure, AI input): rookie 78–83 %, vet 84–88 %, elite 89–93 %, PAT NFL 93–97 %, college PAT ≥ 98 %. A human with clean flicks (quality ≥ 0.9, aim within 0.5°) beats the AI profile by 2–4 points; sloppy flicks (quality 0.5) lose 5–10.

#### 2.3.7 Pressure

```
pressure = clamp( 0.05
   + 0.30·late          // (Q4 and clock ≤ 5:00) or OT
   + 0.30·decisive      // kick ties or takes the lead AND ((Q4 and clock ≤ 2:00) or OT). End-of-half 'as time expires' kicks are NOT decisive (they get +0.10 via a dedicated term below)
   + 0.10·asTimeExpires
   + 0.15·playoff       // conference title game, playoff, bowl, championship
   + 0.10·rivalry
   + 0.08·away
   + 0.07·(D ≥ 50)
   + 0.10·(missStreak ≥ 2)          // consecutive misses this season
   + 0.15·iced                      // 0 if CLU ≥ 90 (ice immunity; news notes it)
   − 0.10·(fans ≥ 80)
   + Σ mods[key='pressure', op='add'] + Tuning.difficulty[d].pressureAdd (legend +0.05), 0, 1 )
clutch  = pressure ≥ 0.6
```
UI mapping (§4.6): heartbeat 60 → 150 bpm, crowd volume, camera shake 0–2 px, aim-line sway amplitude `0.5°·pressure·(1 − CLU/120)`.

**Icing**: when the defence has a timeout and the kick is `decisive`: `P(ice) = Tuning.difficulty[d].iceProb (0.25/0.55/0.65/0.75) + 0.10·(fame ≥ 500)`, at most once per kick. Sim event `ICE_TIMEOUT` precedes `USER_KICK`; the UI shows "ICED!" and re-arms the play clock.

#### 2.3.8 The kick triple and AI input

`KickInput = { power: 0..1.15, aim: −12..+12 (deg, relative to post centre), quality: 0..1, holdMs?: int }`.

```
Kick.aiInput(rng, ctx, attrs, model):
  pNeed = model.pNeed
  power = min(pNeed + 0.15, max(1.0, pNeed + 0.05)) ; power = min(power, 1.08) ; power += N(0, 0.02)
  aim   = −model.windDriftDeg · (0.65 + 0.30·ACC/99) + N(0, 0.5)          // compensate most of the wind
  quality = clamp(0.80 + 0.15·CON/99 + N(0, 0.06), 0.4, 1)
```
Used for: opponent kickers, auto-simmed user kicks (flagged `auto:true` in the kick log), camp-battle rivals, awards competition, and the balance tests.

#### 2.3.9 `Kick.model` (pure, no rng) — the reusable primitive

Returns `{ sigmaDeg, targetDeg, windowDeg:{left,right}, maxFG, carryMax, pNeed, windDriftYd, windDriftDeg, flightTime, pBlock, pShank, pMake, pClear, pLateral }` for a context + attrs, assuming the AI power rule and quality 0.85. `pMake` by closed form:

```
A_left/right = angular window edges (deg) ; use the symmetric approximation A = atan(H/D)·180/π when ballX = 0
pClear   = Φ( (carryMax·PeffAI − Rneed) / (0.025·carryMax) )                 // power-noise short risk
pLateral = (1−pShank)·P(|N(bias, σ)| inside window) + pShank·P(|N(bias, 3σ)| inside window)
           where bias = windDriftDeg·(1 − 0.65 − 0.30·ACC/99) (residual after AI compensation) ; P computed with erf on each edge
pMake    = (1 − pBlock) · pClear · pLateral
```
Consumers: coach attempt decision (§2.5.6), auto-sim, "What's my range?" overlay, post-kick "what the coach saw", `RTG.debug.montecarlo` cross-check (MC vs closed form within ±2 pts, tested).

#### 2.3.10 Kickoffs (`Kick.resolveKickoff`)

Simulated by default. Input `null` (auto) or `{timing: −1..1}` from a one-tap timing bar (green zone width `= 12 + 0.35·KO` percent of the bar).
```
hang   = 3.4 + 0.012·KO + 0.3·(1 − |timing|) + N(0, 0.12) s
dist   = 55 + 0.22·KO + 4·(1 − |timing|) + N(0, 4) yards from the 35 (NFL) / 35 (college)
touchback if dist ≥ 65 → ball at the 30 (NFL dynamic-kickoff analog) / 25 (college)
else return: startYard = clamp(round(N(28 + (65 − dist)·0.4 − (hang − 3.9)·6, 7)), 5, 60); returnTd 1.5 % ; out of bounds if |timing| > 0.9 → ball at the 40
onside (only in end-game scripts): recover 10 % (18 % with flag ONSIDE_TRAINED)
```

#### 2.3.11 Pseudo-code — `Kick.resolve`

```
function resolve(rng, ctx, attrs, input, opts):
  m = model(ctx, attrs)                              // pure numbers
  power = clamp(input.power, 0, 1.15); aim = clamp(input.aim, -12, 12); q = clamp(input.quality, 0, 1)
  if opts.forced: return forcedOutcome(...)          // debug only: builds a consistent result for a requested outcome
  blocked = rng.chance(pBlockFor(m, power, ctx, attrs))            // draw 1
  sigma   = sigmaFor(m, power, ctx, attrs)                          // deterministic
  shank   = rng.chance(m.pShank)                                    // draw 2
  err     = rng.gauss(0, shank ? 3*sigma : sigma)                   // draws 3,4 (Box–Muller uses two)
  csign   = rng.chance(0.5) ? -1 : 1                                // draw 5
  contact = (1-q)*3*csign
  launch  = m.targetDeg + aim + err + contact + overBias(power, attrs.foot)
  carry   = m.carryMax * power * (0.92 + 0.08*q)
  h       = 0.6745 * D * (1 - D/carry)
  x       = ctx.ballX + D*tan(rad(launch)) + m.windDriftYd
  outcome = classify(blocked, h, x, rng)                            // doink draws 6.. as needed
  return KickResult{...}
```

### 2.4 Difficulty

| Setting | Rookie | Pro | All-Pro | Legend |
|---|---|---|---|---|
| `sigmaMult` (user kicks) | 0.85 | 1.00 | 1.10 | 1.20 |
| Aim assist: post pre-rotation | always | always | always | always |
| Aim assist: wind drift preview (ghost line + yards) | yes | yes | numeric mph + arrow only | arrow only, gusts hidden (±30 %) |
| Power bar "green zone" shown (`pNeed` .. `pNeed+0.15`) | yes | yes | yes | no (bar only) |
| `iceProb` | 0.25 | 0.55 | 0.65 | 0.75 |
| `pressureAdd` | −0.05 | 0 | 0 | +0.05 |
| Wind cap (mph) | 15 | 20 | 25 | 30 |
| `xpMult` | 1.25 | 1.00 | 0.90 | 0.80 |
| Contract generosity | 1.15 | 1.00 | 0.92 | 0.85 |
| Job Security negative deltas | ×0.6 | ×1.0 | ×1.3 | ×1.6 |
| Event effect preview | full numbers | icons + signs | hidden | hidden |
| Career-ending injuries | off | off (age ≥ 34 only) | on | on |
| Play clock | 3.5 s | 2.5 s | 2.5 s | 2.0 s |

### 2.5 Simulation model (engine: `engine/sim.js`, `engine/weather.js`)

#### 2.5.1 Team ratings

`Team = { id, name, city, nick, abbr, colors:[primary, secondary], conf, div, prestige (college 1–5) , OFF, DEF, ST, coachAgg (0..1), climate, dome, altitude, windy, surface, kicker: AIKicker, kicker2: AIKicker|null }`.

- Ratings live in 50–92. Preseason drift (both leagues, yearly): `r' = clamp(round(0.6·r + 0.4·(anchor + N(0, 6))), 50, 92)` with `anchor = 50 + 8·prestige` (college) or `72` (NFL; parity). Per-game noise `N(0, 3)` applied to OFF/DEF in `startGame` (not persisted).
- `ST` blends the kicker: `ST = round(0.5·ST_base + 0.5·kicker.OVR)` recomputed when kickers change.
- Home advantage: +3 to the home team's OFF and DEF edge. Coaches are names only; fired with p = 0.30 after a ≤ 35 % season (headline + trust reset to 45 for the user).

**AIKicker** `= { name, age, ovr, attrs:{POW,ACC,CON,CLU,KO}, contractYears, seasonStats }`. Generated `Names.player(rng)`, `age 22–36`, `ovr` from `N(anchorK, 7)` (college `52 + 4·prestige`, NFL `74`), each attr `= clamp(ovr + N(0, 4), 30, 99)`. Yearly: `ovr` drifts with the §2.1.3 age curve (simplified: −1 POW/yr from 34), retire at 38+ (p 0.5/yr) or ovr < 55 → replaced by a rookie (`N(60, 5)`, age 22). Contract years tick down; expiring/old/bad kickers define **team need** for the draft and FA (§2.7.7).

#### 2.5.2 Drive engine

A game is a sequence of drives with a clock. Constants in `Tuning.sim`:

| Outcome | NFL base | College base | Shift per unit `edge` | Drive time (s), mean ± sd |
|---|---|---|---|---|
| `TD` | 0.22 | 0.26 | +0.30 | 200 ± 55 |
| `STALL` (drive dies in opponent territory → coach decision) | 0.18 | 0.17 | +0.04 | 195 ± 55 |
| `PUNT` | 0.42 | 0.36 | −0.26 | 145 ± 45 |
| `TO` (turnover) | 0.11 | 0.13 | −0.06 | 110 ± 40 |
| `DOWNS` | 0.04 | 0.06 | −0.02 | 170 ± 45 |
| `KNEEL` | situational | situational | — | remaining |

```
edge = (OFF_off − DEF_def + (home ? 3 : 0)) / 100                    // ≈ −0.45 .. +0.45
p_k  = max(0.02, base_k + shift_k·edge + situational_k) ; normalise
stall yards-to-goal: ytg = clamp(round(N(25, 12)), 1, 50) ; college N(23, 12) ; D = ytg + 17
drive time: max(30, N(mean, sd)) ; ×0.55 in hurry-up ; clipped to time left in the half
```
Regulation: 4 quarters × 900 s. Halves: after Q2 the team that kicked off to start the game receives. Drive start after a score: kickoff (§2.3.10, auto for AI). After a punt: the drive first picks the punting team's line of scrimmage, `los = clamp(round(N(32, 11)), 4, 58)` (own yard, 2 draws), and the punt itself is resolved by `RTG.Punt` (§2.14.4), so the opponent starts where the ball actually died. The abstract spot `clamp(round(N(30, 10)), 5, 50)` survives only as the fallback when the punt engine is not loaded. After a turnover: at the mirrored spot `100 − (ytg at turnover ~ N(45, 20))`. After DOWNS: the mirrored ytg.

Expected: ≈ 11.5–12.5 drives/team, 21–27 points/team, 1.9–2.4 FGA/team, 2.4–3.0 PAT/team, regulation ties 4–6 %. FG distance histogram (attempts, both teams): <30: 14–19 %, 30–39: 26–31 %, 40–49: 30–35 %, 50+: 19–25 % (verified by Monte Carlo during spec authoring: 15.5 / 28.1 / 32.5 / 23.8).

#### 2.5.3 Situational rules

- **Hurry-up** (`situational` shifts, drive time ×0.55): the trailing team (or either team in Q2) with ≤ 5:00 left in the half: `TD +0.06, STALL +0.10, PUNT −0.16`.
- **End-of-half FG script**: a STALL whose drive ends with ≤ 40 s left in the half attempts if `pMake ≥ 0.20` (flag `asTimeExpires`), regardless of trust.
- **Kneel**: leading team with the ball, Q4, ≤ 2:00: `p = 0.5` (0.9 if the opponent has 0 timeouts) → `KNEEL`, clock → 0.
- **End-of-game script** (play-by-play) — triggers when the team with the ball is trailing by 0–3 (tied included) in Q4 with ≤ 4:00 left:
  ```
  ytg = round(N(72, 8)) (or the real drive start if from a turnover), down 1, toGo 10, timeouts as tracked
  loop:
    if rng.chance(0.015): result TO
    incomplete = rng.chance(0.33); gain = incomplete ? 0 : round(N(7.5, 9)); ytg -= gain
    runoff = (!incomplete && rng.chance(0.5)) ? 20 : 0 ; if runoff and timeouts>0 and clock<60: use a timeout, runoff=0
    clock -= 6 + runoff
    if ytg ≤ 0: result TD
    first down if gain ≥ toGo else down++, toGo -= gain
    D = ytg + 17 ; inRange = D ≤ maxFG + 3
    if clock ≤ 8: result inRange ? FG : CLOCK
    if down == 4: if inRange and pMake(pressure=1) ≥ 0.15: FG ; else if rng.chance(0.50): first down ; else DOWNS
    if inRange and (clock ≤ 25 or (down ≥ 3 and clock ≤ 45)): FG
  ```
  An FG here is `decisive` (pressure 1.0 via the formula), may be iced, and gets a specific distance (mean ≈ 41 yd). Measured: decisive attempts 0.12–0.15 per game across both teams, plus OT; target band for tests 0.10–0.25.
- **Two-point tries**: after a TD in Q4 when trailing by 2/5/8/10/16 after the TD → 2-pt attempt (47 %); otherwise PAT (user kicks it if it is the user's team; auto-PAT rules in §4.6).
- **Decisive flag** for regular-table kicks: Q4, clock at kick ≤ 2:00, and the kick ties or takes the lead. `gameWinner` = decisive make that gives the lead and the team wins; `tieForcer` = decisive make that ties and the game goes to OT.

#### 2.5.4 Overtime

- **NFL regular season**: one 10-minute period; both teams possess unless the first possession is a TD; then sudden death; still tied → tie. **NFL playoffs**: repeat full periods until decided. OT kicks: `late = true` (pressure ≥ 0.35), FG that wins = decisive.
- **College**: alternating possessions from the 25 (`ytg = 25`, no clock). Per possession outcome table: `TD 0.40, STALL 0.40 (ytg = clamp(round(N(12, 8)), 1, 25) → FG 18–42 yd), TO 0.12, DOWNS 0.08`. Period 2+: TD → must go for 2 (47 %). Period 3+: alternating 2-pt tries only. College OT kicks: pressure 0.9 base (`late` + `decisive` both true when the kick wins/extends).

#### 2.5.5 Weather (`engine/weather.js`, `Weather.forGame(rng, homeTeam, week, league)`)

Month by week: college weeks 1–4 Sep, 5–8 Oct, 9–12 Nov, 13+ Dec; NFL weeks 1–4 Sep, 5–8 Oct, 9–13 Nov, 14–18 Dec, playoffs Jan.

| climate | mean °F (Sep/Oct/Nov/Dec/Jan) | rain p | snow p (if temp < 34) | notes |
|---|---|---|---|---|
| warm | 82 / 78 / 70 / 64 / 60 | 0.18 | — | |
| temperate | 74 / 64 / 52 / 44 / 40 | 0.15 | 0.25 | |
| cold | 68 / 55 / 42 / 32 / 26 | 0.12 | 0.35 | |
| dome | 70 | 0 | 0 | wind 0, weather 'dome' |

`tempF = round(N(mean, 7))`. Wind speed `= min(cap, Rayleigh(σ = 5))` (`Rayleigh: σ·sqrt(−2·ln(1 − u))`), ×1.4 if `windy`; direction uniform 0–359 (relative to the home team's kicking direction; flipped per half). Weather: snow if snowing roll, else rain roll, else `cold` if `tempF < 35`, `heat` if `tempF > 88`, else `fog` (3 % temperate/cold), else `clear`. Altitude flag from the stadium. Per-kick wind = game wind + `N(0, 1.5)` mph (min 0).

#### 2.5.6 Coach attempt decision (on `STALL`)

```
pm  = Kick.model(ctx for this D with current weather/pressure, kicker attrs).pMake
thr = 0.55 − 0.20·trust01 − 0.10·coachAgg + (league === 'COLLEGE' ? 0.05 : 0) − (asTimeExpires ? 0.35 : 0)   // clamp 0.15..0.60
   trust01 = user kicker ? trust/100 : 0.5
attempt if D ≤ maxFG + 3 and pm ≥ thr
else if ytg ≤ 40 and (trailing in Q4 or rng.chance(0.15)): go for it → convert 45 % (drive continues as a fresh STALL/TD roll with ytg − 6) else DOWNS
else PUNT from the stall spot (own 100 − ytg), resolved by RTG.Punt (§2.14.4); the abstract 100 − ytg − N(38, 8) roll (capped at own 20) is only the fallback without the punt engine
```
Trust 50 / agg 0.5: threshold 0.40 → a rookie is sent out to ≈ 52 yd, an elite to ≈ 58. Trust 90 / agg 0.8: 0.29 → elite gets 60+ tries. This is how Coach Trust creates glory and risk.

#### 2.5.7 Pseudo-code — `Sim.step`

```
function step(gs, state, rng):
  if gs.pending: throw 'pending kick must be applied first'
  if gs.done: return {type:'END'}
  if gs.script: return stepScriptPlay(gs, state, rng)          // end-of-game play-by-play (one play per step)
  if gs.pendingKickoff: return doKickoff(...)                   // may yield USER_KICKOFF when settings.playKickoffs and user team kicking
  side = gs.possession ; opp = other(side)
  if shouldStartScript(gs): gs.script = initScript(gs); return {type:'DRIVE', text:'Two-minute drill…'}
  if shouldKneel(gs, rng): endHalfOrGame(...); return event
  outcome = rollOutcome(gs, side, rng)
  dt = driveTime(outcome, gs, rng) ; advanceClock(gs, dt)
  switch outcome:
    TD:   gs.score[side] += 6 ; log ; decide PAT vs 2pt ; if PAT and side is user side and user is K1 and not injured: gs.pending = {type:'USER_KICK', ctx: buildCtx('PAT')} ; return {type:'USER_KICK'}
          else resolve AI PAT/2pt immediately ; queue kickoff
    STALL: decision = coachDecision(...) ; if FG: build ctx ; if user side → pending USER_KICK ; else AI resolve → 'AI_KICK' event ; PUNT/GO handled
    PUNT: los = clamp(round(N(32, 11)), 4, 58) ; ctx = Punt.buildContext(...) ; if the user punts for this side (position 'P', K1, healthy):
          gs.pending = {type:'USER_PUNT', ctx} ; return {type:'USER_PUNT'} ; else Punt.aiInput + Punt.resolve now (§2.14.4)
          possession flips at 100 − oppStart ; a return TD or blocked-punt TD scores for the other side
    TO/DOWNS: field position ; possession flips
  if clock == 0: endQuarter/half/game (+ OT init) ; return END_HALF / OT_START / END_GAME
  return {type:'DRIVE', text: driveLogLine, gs}
```
`simToNextUserKick` loops `step` until the event type is `USER_KICK`, `USER_PUNT`, `USER_KICKOFF`, `ICE_TIMEOUT` (immediately followed by `USER_KICK` on the next call) or `END_GAME`. `applyKick(gs, state, rng, result)` scores it, appends to `gs.kicks`, clears `pending`, queues the kickoff/possession change, and updates in-game stats.

### 2.6 League structures (engine: `engine/schedule.js`, `engine/standings.js`)

#### 2.6.1 College: 48 teams, 6 conferences × 8 (data §2.12.1)

- **Season**: 13 weeks. Weeks 1–3 non-conference, week 4 conference, week 5 non-conference, weeks 6–8 conference, week 9 non-conference, weeks 10–12 conference (7 conference games = full round robin; 5 non-conference), week 13 conference championship games (top 2 by conference record). Week 12 = **rivalry week**: rivals are index pairs `(0,7), (1,6), (2,5), (3,4)` within each conference's data order; the round robin is generated by the circle method with round 0 (which pairs exactly those indices) scheduled in week 12.
- **Non-conference**: a 5-round circle-method round robin among the 6 conferences; in round `r` for conference pair `(A, B)`: `A[t]` vs `B[(t + r + year) mod 8]`, home = `A` if `(t + year) even` else `B`. Every team gets one game vs each other conference, no repeats.
- **Ranking** (Top 25 poll, recomputed weekly): `raw = 0.55·winPct + 0.20·SOS + 0.12·clamp(avgMargin/25, −1, 1) + 0.13·prestige/5` where `SOS = mean opponent winPct`; `score = 0.7·raw + 0.3·prevScore` (sticky). Preseason `prevScore = raw with winPct = prestige/5`.
- **Playoff (12 teams)**: the 5 highest-ranked conference champions auto-qualify; 7 at-large by ranking (the 6th champion is eligible as an at-large). Seeds 1–4 = the four highest-ranked champions (byes). First round: 5v12, 6v11, 7v10, 8v9 at the higher seed. Quarterfinals at the four "major" bowls, semifinals at two, championship at a neutral site ("The National Title Game"). Rounds are weeks 14, 15, 16, 17.
- **Bowls**: teams with ≥ 6 wins not in the playoff, sorted by ranking, paired across conferences (best vs next-best that is not in the same conference) into the 12 named bowls (§2.12.3), played week 14. Bowl = 1 game with the `playoff` pressure flag, `bowlWeek` event pool.
- **Standings tiebreakers** (conference): head-to-head → record vs common opponents → ranking score → `rng.chance(0.5)` (seeded coin).

#### 2.6.2 NFL: 32 teams, 2 conferences (Liberty, Frontier) × 4 divisions (North, South, East, West) × 4

- **17 games, 18 weeks.** Opponents per team: 6 divisional (home/away); 4 vs one same-conference division (rotation `(year + divIdx) mod 3` over the other three); 4 vs one other-conference division (rotation `(year + divIdx) mod 4`); 2 same-place finishers from the two remaining same-conference divisions (by previous standing; year 1 uses data order); 1 same-place finisher from an other-conference division not already played (`(year + divIdx + 2) mod 4`), hosted by the conference `year mod 2 === 0 ? Liberty : Frontier`. Home/away: divisional split 3/3; rotating divisions 2/2; place-based games alternate by year parity.
- **Slotting**: byes only in weeks 5–14. Algorithm: build the 272-game list; for week 1..18, randomly match available teams (not yet played this week, game unplayed) with a greedy maximum-matching attempt (200 shuffles); a team left unmatched in weeks 5–14 takes its bye if it has none; any team unmatched outside the window or twice → restart the whole slotting (max 500 restarts, seeded). `test/schedule.test.js` proves validity; generation must take < 50 ms.
- **Standings tiebreakers** (division): head-to-head → division record → common games (min 4) → conference record → point differential → seeded coin. Wild card: head-to-head sweep (if all play) → conference record → common games → point differential → coin.
- **Playoffs**: 7 per conference (4 division winners seeded 1–4 by record, 3 wild cards 5–7). Seed 1 bye. Wild Card (2v7, 3v6, 4v5) → Divisional (1 vs lowest remaining; other two) → Conference Championship → **The Championship Bowl** (neutral, week 22, fireworks). Weeks 19–22.
- **Draft order**: non-playoff teams by record (worst first; ties by point differential then coin), then playoff teams by exit round.

### 2.7 Career systems (engine: `engine/hs.js`, `career.js`, `contracts.js`, `draft.js`)

#### 2.7.0 High-school senior season (stage `HS`, phase `SEASON`, engine `engine/hs.js` → `RTG.HS`) — D23

A career opens on **the last five games of the senior year**, not a six-kick showcase. Each game is a KickSession
of kind `HS_GAME` with a live scoreboard: for a kicker 3–5 scoring chances (extra points and field goals 23–51 yd), for a
punter 3–6 punts (§2.14.5), in quarter order, the opponent answering between them, and the whole night on tape. `state.flags.hs` holds the season:

| Field | What it is |
|---|---|
| `school` | `<hometown><qualifier?> <mascot>`, its abbreviation and the climate its weather is drawn from |
| `games[5]` | weeks 6–10: opponent, home/away, the rivalry (index 3) and the state-playoff opener (index 4), then the result and the kicking line once played (a punter's line: `punts`, `gross` and `net` averages, `in20`, `tbs`, `puntLong`, `puntBlocked`; `gw`/`gwa` count the punts with the game on them) |
| `board[10]` | the recruiting board: real colleges following the tape, `interest` 0–100, the move from the last game, and the per-school `pull` that decides how hard each one reacts |
| `totals` | `fgm/fga`, `xpm/xpa`, 45+ makes, game-winners, W–L; for a punter also `punts`, `gross`/`net` (sums, not averages), `in20`, `tbs`, `puntLong`, `puntBlocked` |
| `position` | `'K'` or `'P'`, copied from the player so the season knows which script to run (fixtures without one are kickers) |
| `rating`, `summary` | filled when the fifth game ends |

- **Game scripts** (`HS.startGame`, 1 forked draw) build every chance up front so the generic session machinery
  sees the full length; `HS.afterKick` folds each result into the scoreboard and rebuilds the *next* context from
  the real score, so pressure and the "to win it" flag are never a projection.
- **The opponent** scores in touchdowns and field goals to a total of `ratio ∈ [0.5, 1.3]` × what your offence set
  up, dropped into the gaps between your chances. Below 1.0 you are favoured; above it you are not.
- **The rivalry and playoff weeks end on the kicker**: the last chance is a field goal, the opponent's answering
  score puts you 1–2 points down with the clock gone, and nothing follows it. A bad night can still leave them
  further ahead than the trail — the scoreboard says so rather than pretending.
- **A tie goes to overtime**, settled by a walk-off touchdown (pre-rolled in the script, so closing a game still
  costs exactly one headline draw).
- **The board moves after every game** (`HS.finishGame`): makes, long makes and game-winners lift it, misses and
  losses drop it, scaled by the school's own `pull` and by `1 − 0.16·(prestige − 1)` — a blue blood takes more
  convincing than a MAC school. Bands: `OFFER` ≥ 70, `HIGH` ≥ 45, `WARM` ≥ 25, else `COLD`.

- **A punter's night** (`scriptPunts`, `Tuning.hs.punter`): 3–6 punts from your own 8–48 (hash weighted L 45 / M 10 / R 45,
  so the near sideline is usually the short way out); your offence's points land between the punts (0 / 3 / 7 weighted
  30 / 30 / 40) and the opponent answers to `ratio ∈ [0.55, 1.35]` of them. The rivalry and playoff weeks end on the
  punt instead of a kick: backed up on your own 6–22, protecting a 1–3 point lead with the clock gone. A punt is
  `decisive` when your side leads by 1–3 at that moment; it counts as a game-winner (`gw`) when it lands inside the 20 or
  nets ≥ 34 (`rating.clutchNet`). A blocked punt or a touchback is the miss the slot strip shows. The board moves on
  `0.6·punts + 6·(net ≥ 36) + 4·in20 + 12·pinnedIt − 8·pinMissed − 5·touchbacks − 10·blocked` (+3 win / −2 loss).

The five-game stretch produces one 0–6 rating (`HS.ratingOf`), which is what the star formula reads:

```
rating = clamp(6·(0.55·fgPct + 0.20·patPct + 0.25·gwRate) + min(0.35·longMakes, 1), 0, 6)
stars  = clamp(round(1.5 + 0.03·(OVR − 40) + 0.4·rating), 2, 5)
punter: rating = clamp(6·(0.5·clamp((netAvg − 24)/14, 0, 1) + 0.25·in20Rate + 0.25·pinnedRate), 0, 6)   // an 18-year-old's scale: net 24 → 0, 38 → 1
```

2★ = walk-on path (one prestige 1–2 offer, no scholarship, morale −5, `WALKON` flag → HOF ×1.15 legacy bonus). Fame start by stars: 2★ 0, 3★ 20, 4★ 40, 5★ 60.

#### 2.7.1 Screens and flow

`HS.SEASON` with nothing pending is the **`hsseason`** screen — school, season line, the five-game schedule with
what the leg did in each, and the recruiting board. PLAY WEEK n → `Engine.hsStartGame` → the **`hsgame`** screen
(`KickView.sessionScreen`, chromeless, scoreboard header). The fifth game closes the season
(`HS.finishSeason`) and routes to the offers. The auto players need no help: `Engine.settlePending`,
`autoPlayCareer` and `RTG.debug.jumpTo` open the next game themselves when HS.SEASON has nothing pending.

#### 2.7.2 Offers (`Career.generateCollegeOffers`)

3–6 offers (walk-on: 1). Candidate schools: prestige within `stars − 1 .. stars` (5★: 4–5; 3★: 2–3), sampled by weight `1/(1 + |prestige − (stars − 0.5)|)`, plus one "safety" school of prestige ≤ 2. Every school that reached the `OFFER` band on the senior-season board is a candidate too — highest prestige first — but the board fills **at most half** the list, so the prestige band the star rating earned always gets a say; the rest of the board tilts that band's weights by `1 + 1.5·interest/100`. Each `Offer`:

| Field | Values | Effect |
|---|---|---|
| `prestige` 1–5 | | wins, PAT volume, fame mult `1 + 0.15·(prestige − 3)`, draft bump `+2·(prestige − 3)` |
| `depth` | `OPEN` / `VET` (incumbent ovr 66–78, 1 yr left) / `STAR` (ovr 74–84, 2–3 yrs) | camp battle odds; `STAR` → likely K2 year 1 |
| `coach` | `TRUSTING` (trust 60, agg 0.6) / `CAUTIOUS` (trust 40, agg 0.3) / `WHISPERER` (trust 50, agg 0.5, coachMult 1.15, +1 ACC each offseason) | |
| `nil` | $0–120k/yr scaled by prestige & fame | +fame 10/yr, morale +2/yr; unlocks NIL events |
| `nearHome` | bool (hometown region match) | morale +5/season, family events |
| `climate` / `dome` | from team data | home weather |

Accepting sets `team`, `trust`, `js` (60 if `OPEN`, 45 otherwise), enrols in `COLLEGE` stage year 1, age 18.

#### 2.7.3 College season flow

PRE (camp battle if needed, 3 season goals set: team wins target, personal FG% target, fan target) → REG weeks 1–13 → POST (bowl or playoff weeks 14–17; teams without a bowl skip to AWARDS) → AWARDS → OFF (offseason wizard: Body Check → 3 training blocks → declaration/transfer decisions → recruiting rival kicker → next season). Redshirt: offered in year 1 if K2 (`REDSHIRT` flag, does not count toward the 3-season eligibility clock but does count toward the 5-season max).

#### 2.7.4 Declaration, transfer portal

- Eligible to declare after 3 seasons of play (redshirt excluded); seniors (5th season, or 4th non-redshirt) auto-declare.
- Projection card: `draftValue` (§2.7.6) shown as a round range ±1 (agent tier 0 shows ±2).
- Transfer portal (event #2 / decision `TRANSFER`): available in the offseason if `js < 40` or `trust < 40` or the user lost the job; 2–3 offers via `generateCollegeOffers` with prestige within ±1 of current OVR-implied tier; transferring resets `trust = 45`, `js = 50`, keeps stats, costs fame −10.

#### 2.7.5 Combine / Pro Day (stage `DRAFT`, phase `COMBINE`)

Three mini-events played by the user: **Range ladder** (45/50/55/60/65 until a miss; option beforehand: "play it safe — stop at 55" vs "show them the 65"), **Accuracy set** (5 × 40 yd from alternating hashes), **Kickoff hang** (one timing tap; hang time shown). Interview event (choice, CLU ±1). 
```
combineScore = (ladderMakes − 3)·2 + (accMakes − 3)·2 + (hang − 3.9)·5 clamped to ±8
```

#### 2.7.6 Draft (`Draft.run`)

```
draftValue = 0.55·OVR + 0.15·POW + 0.10·CLU + 0.10·fameTier·5 + 0.10·(collegeFGpct·100 − 70) + combineScore + prestigeBump − 4·(WALKON && OVR < 70)
   fameTier 0..4
```
| draftValue | Round |
|---|---|
| ≥ 92 | 3 (1 % "first-round shock" event: round 1 pick 28–32, headline, fame +150) |
| 86–91 | 3 (40 %) / 4 (60 %) |
| 80–85 | 4 |
| 75–79 | 5 |
| 70–74 | 6 |
| 66–69 | 7 |
| 60–65 | UDFA: 2–3 camp invites (UDFA contract) |
| < 60 | undrafted, one "minicamp tryout" event: pass (≥ 4/6 kicks) → UDFA deal; fail → "Pro Springs League" year (age +1, XP ×0.6, retry next draft; 2 failures → forced retirement) |

Team selection: teams with **need** (`kicker.age ≥ 34` or `kicker.ovr < 72` or `contractYears ≤ 1`) in draft order; pick slot = `(round − 1)·32 + position of the first needy team + rng.int(0, 5)`; if no needy team in that round, the best-fit team by lowest `kicker.ovr`. The draft screen scrolls fictional picks (positions from a weighted list: QB 8 %, OL 18 %, WR 12 %, DB 16 %, DL 14 %, LB 11 %, RB 8 %, TE 5 %, K/P 1 %, other) around the user's pick. Rookie contract auto-signed. UDFA: choose among invites (cards with team need, climate, dome, market).

#### 2.7.7 Contracts (`engine/contracts.js`; money in $M, 1 decimal; `state.leagues.nfl.cap` starts 280 and grows 5 %/yr; `vetMin` starts 1.0 and grows 4 %/yr)

**Rookie scale** (4 years; guaranteed % of total):

| Round | $/yr | Gtd |
|---|---|---|
| 1 | 2.2 | 100 % |
| 3 | 1.15 | 60 % |
| 4 | 1.05 | 40 % |
| 5 | 0.98 | 25 % |
| 6 | 0.92 | 15 % |
| 7 | 0.88 | 10 % |
| UDFA (3 years) | 0.80 | 0 % |

**Market value (AAV):**
```
AAV = clamp( max(vetMin, 0.9 + 0.055·max(0, OVR − 60)^1.35) · ageMul · fameMul · marketMul · Tuning.difficulty[d].contractMult, vetMin, 8.0 )
   OVR 75 → 3.0 · OVR 85 → 5.1 · OVR 92 → 6.8 · OVR 99 → 8.0 (cap)
ageMul: ≤31 1.00 | 32–34 0.90 | 35–37 0.75 | 38+ 0.55
fameMul = 0.92 + 0.16·fame/1000
marketMul = clamp(1 + 0.06·(teamsNeedingK − 6)/6, 0.90, 1.12)
guaranteedPct = clamp(0.35 + 0.30·(OVR − 70)/30, 0.10, 0.80) ; signing bonus = 25 % of total, paid year 1 (earnings)
```
**Extension** (final contract year, offered in the offseason wizard if `teamSatisfaction = 0.5·seasonFGpct + 0.3·trust/100 + 0.2·fans/100 ≥ 0.72` and `js ≥ 50`): one offer `{years 2–5 by age (≤28: 4–5, 29–32: 2–4, 33+: 1–2), aav = AAV·U(0.90, 1.05), gtdPct}`. Player may **Accept**, **Counter** (+10 % AAV or +1 year; acceptance `P = clamp(0.30 + 0.20·agentTier + 0.15·fame/1000 + 0.20·need01, 0.10, 0.90)`; on rejection the original offer stands with p 0.5, else withdrawn → FA), or **Decline** (→ FA). Holdout is event #5.
**Franchise tag**: if the team wanted you (satisfaction ≥ 0.72), talks failed, `AAV ≥ 4.5`, age ≤ 33: `P(tag) = 0.5`. Tag = `tagValue(year) = 6.0·1.05^(year − 1)` for 1 year, morale −8; second consecutive tag ×1.2; max two. Event #18 handles the reaction.
**Free agency** (`Contracts.generateOffers(state, rng, 'FA')`): 1–4 offers from needy teams (weighted by need, hometown region ×1.5, dome teams add a "dome" tag); each `{teamId, years, aav = AAV·U(0.85, 1.10)·teamCapRoom01, gtdPct, startsK1: bool, note}`. Hometown discount option (−8 % AAV, morale +10, fans +10) if a hometown-region team offers. Waiting one round: each existing offer withdrawn with p 0.35, new offer with p 0.4. No offers → practice-squad/"Pro Springs" branch; two consecutive offseasons without offers → forced retirement.
**Cuts**: offseason cut if (`seasonFGpct < 0.75` and `OVR < 68`) or `js < 20`; mid-season per §2.2. Cut = FA with `marketMul ×0.8`; guaranteed money still counts as career earnings; a "dead money" headline.
**Trades**: event #23 (contender wants your leg) and event #20 (trade request) — both resolve via `Career.changeTeam(state, rng, teamId, {trust: 50, js: 55})`.
**Earnings** accumulate in `history.earnings` (salary paid at season end + bonuses + NIL + endorsements).

#### 2.7.8 Retirement (stage `RETIRED`)

Offered every NFL offseason from age 33 (decision `RETIRE`: "One more year" / "Retire" / "Ring chase" = accept a vet-minimum offer from a top-5 team if available). Forced: no contract for two consecutive offseasons; age 42; career-ending injury without comeback. Farewell Tour event (#30) in the declared last season.

#### 2.7.9 Hall of Fame & legacy (`Awards.hofScore`)

```
HOF = 0.8·careerFGM + 3·made50plus + 2·careerPoints/100 + 12·gameWinners + 25·allLeague1st + 12·allLeague2nd
    + 35·stPlayerOfYear + 30·championships + 60·championshipWinningKicks + 15·seasonsAsStarter
    + 40·(careerFGpct ≥ 0.88 && careerFGA ≥ 300) + 20·recordsHeld
    × (WALKON ? 1.15 : 1) × (UDFA ? 1.10 : 1)
Verdict: ≥ 750 FIRST_BALLOT · 550–749 INDUCTED (year 1–5, rng weighted by fame) · 400–549 FINALIST ("the debate rages on") · < 400 NOT_ON_BALLOT
Legacy tier: Journeyman < 150 · Solid Starter 150–299 · Franchise Leg 300–549 · Legend 550–899 · Immortal ≥ 900
```
Sanity (test): a 14-season starter at 86 % with 320 FGM, 40 50+, 12 GW, 2 All-League 1st, 1 title ≈ 256+120+27+144+50+30+210+40 = 877 → first ballot; a 6-season 82 % journeyman ≈ 200 → Solid Starter. Target distribution over 200 auto-simmed Pro careers: first-ballot ≤ 10 %, inducted 15–25 %.

**A punter's Hall case** (`hofRowsPunter`, `Tuning.hof.punter`; nobody counts a punter's points, so the ledger is the yards the other side had to go):

```
HOF_P = 0.10·proPunts + 0.30·downedInside20 + 3·(longestPunt/10) + 80·allLeagueP1 + 30·allLeagueP2 + 120·STPOY
      + 40·championships + 16·seasonsAsStarter + 250·(careerNet ≥ 44 with ≥ 400 punts) + 45·recordsHeld
      × the same WALKON / UDFA multipliers ; the same verdict thresholds (1850 / 1550 / 1250 after D19) and legacy tiers
```
Worked (seed 3, auto career): 990 punts, 580 inside the 20, 68-yd long, 7 All-League 1st, 1 second team, 1 STPOY, 1 title, 12 starter seasons, 43.2 net (no bonus), 3 records = 99 + 174 + 20 + 560 + 30 + 120 + 40 + 192 + 135 = **1370 → FINALIST, Franchise Leg**. Measured over 60 auto punter careers at Pro (seeds 1–60): first-ballot 3 %, inducted 18 %, finalist 57 %, off the ballot 22 % (§2.14.6).

Legacy screen: bust portrait, tier, HOF score, career line, timeline, **top-10 moments** (`Stats.topMoments`: score = `pressure·D·(made ? 1 : 0.6) + 40·decisive + 20·doink + 15·playoff`), records held, a generated "documentary title" from templates, and the seed code.

#### 2.7.10 Agents

`player.agentTier` 0–2: 0 default; 1 at fame ≥ 250 via event #17 (5 % fee); 2 at fame ≥ 600. Tier reveals POT (tier 1: ±5 band; tier 2: exact), narrows draft projection, and widens counter acceptance (§2.7.7).

### 2.8 Awards catalog (`data/awards.js`, computed by `Awards.compute(state, rng)` at AWARDS phase from simulated stats of every kicker in the league — or, for a punter, from every team's punting line in `season.punterStats`; the slate is chosen by `state.player.position`, and `Data.awardsFor(league, position)` filters the catalog by the same rule: rows without a `position` are the kicker's and `position: 'P'` rows are the punter's — so the shared `PRO_CLASSIC`, `STPOY` and season-goal rows, which carry no `position`, are granted to a punter by `punterAwards` / the goals check but are **not** listed by `awardsFor(league, 'P')`)

`kickerScore = FGM·3 + FGpct·40 + long/10 + clutchMakes·4 + made50plus·2 + gameWinners·6 (min 12 FGA)`.

| League | Award | Rule | XP / Fame |
|---|---|---|---|
| College | **Golden Boot Award** | highest `kickerScore` nationally | 200 / +150 |
| College | **All-American First Team** (1) / **Second Team** (2–3) | rank 1 / 2–3 nationally | 150 / +100 ; 80 / +50 |
| College | **All-Conference First Team K** | rank 1 in conference | 80 / +40 |
| College | **Freshman Leg of the Year** | best first-year kicker (min 12 FGA) | 100 / +60 |
| College | **Iron Leg** | longest made FG of the season (national) | 60 / +40 |
| College | **Clutch Kick of the Year** | max `pressure·D` made kick nationally | 100 / +80 |
| College | **Conference Championship MVP** / **National Championship MVP** | decisive make in that game | 120 / +120 ; 200 / +250 |
| College | **Conference ST Player of the Week** | weekly: best kickerScore delta in conference (min 2 FGM) | 15 / +8 |
| NFL | **Golden Leg Award** | highest `kickerScore` league-wide | 200 / +150 |
| NFL | **All-League First Team K** (1) / **Second Team** (1) | rank 1 / 2 | 180 / +120 ; 100 / +60 |
| NFL | **Pro Classic** selection | top 2 kickers per conference | 60 / +40 (event #18 Pro Bowl invite) |
| NFL | **Special Teams Player of the Year** | kickerScore ≥ 1.15 × second-best AND ≥ 3 gameWinners (else "a punter won it" headline) | 220 / +150 |
| NFL | **Iron Leg** | season long | 60 / +40 |
| NFL | **Clutch Kick of the Year** | max `pressure·D` made kick | 100 / +80 |
| NFL | **Championship Bowl MVP** | decisive make in the Championship Bowl | 250 / +300 |
| NFL | **Comeback Leg** | ≥ 85 % season after a ≥ 6-week injury | 80 / +60 |
| Both | **Season goals** ×3 | set in PRE | 40/60/100 |

**The punter's slate** (§2.14; `Awards.punterScore`, `punterAwards`). `punterScore = netAvg·2.6 + grossAvg·0.8 + in20Rate·30 + in20·0.8 + puntLong/12 − touchbacks·3 − blocked·8` over live punts (punts − blocked), null under 20 live punts. AI candidates are named `<abbr> P` (no team carries a punter object yet). XP / fame from `Tuning.awards.rewards`:

| League | Award (id) | Rule | XP / Fame |
|---|---|---|---|
| College | **Golden Foot Award** (`GOLDEN_FOOT`) + **All-American First Team (P)** (`ALL_AMERICAN_P1`) | rank 1 nationally by `punterScore` | 200 / +130 ; 150 / +90 |
| College | **All-American Second Team (P)** (`ALL_AMERICAN_P2`) | rank 2–3 | 80 / +45 |
| College | **All-Conference First Team (P)** (`ALL_CONF_P1`) | rank 1 in conference | 80 / +35 |
| College | **Freshman Punter of the Year** (`FRESHMAN_FOOT`) | the user, ranked (≥ 20 live punts), in a freshman season | 100 / +55 |
| College | **Coffin Corner Award** (`PIN_KING_COLLEGE`) | most punts downed inside the 20 | 60 / +40 |
| NFL | **Golden Leg (Punter)** (`GOLDEN_LEG_P`) + **All-League First Team (P)** (`ALL_LEAGUE_P1`) | rank 1 league-wide | 200 / +130 ; 180 / +110 |
| NFL | **All-League Second Team (P)** (`ALL_LEAGUE_P2`) | rank 2 | 100 / +55 |
| NFL | **Pro Classic** (`PRO_CLASSIC`, shared) | top 2 punters per conference | 60 / +40 |
| NFL | **Field Position Award** (`PIN_KING_NFL`) | most punts downed inside the 20 | 60 / +40 |
| NFL | **Special Teams Player of the Year** (`STPOY`, shared) | the **user**, ranked first with `punterScore ≥ 1.15 ×` the runner-up (no game-winner clause; an AI punter never takes it, and a kicker season that fails its own STPOY test still prints the "a punter won it" note) | 220 / +150 |

A punter's season is not eligible for Iron Leg, Clutch Kick, the MVPs, Comeback Leg or the weekly award, and the milestones below are kicker milestones (no punting milestone fires yet).

Awards go to `history.awards[] = {year, league, id, name, teamId}` and the trophy case. Milestones (`Stats.checkRecords`): 100/200/300/400/500 FGM; 1,000/1,500/2,000 points; first 50+, first 60+; 20 consecutive makes; 10 game-winners; each fires a headline + fame +20.

### 2.9 Records & legends (`data/records.js`, `state.records`)

Per seed, `Names.legend(rng)` generates fictional holders (era names: Otis, Walter, Gus, Lou…) for each record; values (college / NFL):

| Key | College | NFL | Notes |
|---|---|---|---|
| `longFG` | 62 | 66 | |
| `seasonFGM` | 29 | 40 | |
| `seasonPts` (kicker) | 140 | 166 | |
| `seasonFGpct` (min 20 FGA) | 96.0 % | 97.2 % | |
| `season50plus` | 8 | 12 | |
| `careerFGM` | 90 | 560 | |
| `careerPts` | 460 | 2,600 | |
| `careerFGpct` (min 100 FGA) | 89.5 % | 91.0 % | |
| `consecutiveFGM` | 26 | 44 | |
| `careerGW` | 7 | 30 | |
| `careerSeasons` | — | 22 | |
| `longPunt` (P) | 78 | 82 | gross |
| `seasonNet` (P, min 30 punts) | 44.8 | 46.4 | net average, `fmt: 'pct1'` |
| `seasonIn20` (P) | 34 | 42 | |
| `careerPunts` (P) | 230 | 1,100 | |
| `careerNet` (P, min 150 punts) | 42.6 | 44.2 | |
| `careerIn20` (P) | 96 | 460 | |
| `punterSeasons` (P) | — | 22 | NFL only |

Rows marked (P) carry `position: 'P'` in `Data.records.meta` and `minPunts` where a minimum applies (`Tuning.records.minPuntsSeasonNet` 30, `minPuntsCareerNet` 150). `Data.records.keysFor(league, position)` returns one position's keys; `Stats.checkRecords` reads the user's values from the punting block when `player.position === 'P'` (`userRecordValues`: `longPunt = nfl/college.puntLong`, `careerPunts`, `careerIn20`, `seasonIn20`; the two net averages only at season end and over the minimums; `punterSeasons` replaces `careerSeasons`). Every seed still generates legend holders for all 18 keys, so both positions' boards are populated.

The records screen shows holder, year, and "yours" in gold. `records.crossSave` (localStorage `rtg.records`, UI-owned) keeps the best of every career on this device for the title screen ticker.

### 2.10 Narrative / event system (`data/events.js`, `engine/events.js`)

#### 2.10.1 Event schema

```js
{ id:'NIL_TRUCK', stage:['COLLEGE'], phase:['REG','OFF'], once:true|false, weight:number|fn(state),
  cond: fn(state)→bool, sender:'coach'|'agent'|'gm'|'press'|'fan'|'family'|'teammate'|'sponsor',
  title, text (templates: {coach} {team} {city} {rival} {opp} {dist} {name} {agent}),
  choices:[{ label, preview:'…', effects: Effects, branches?:[{p, effects, headline}] }] }
Effects = { morale?, trust?, fans?, fame?, js?, xp?, money? ($k), attrs?:{ACC:+2}, mods?:[Modifier], flags?:{k:v}, action?:'TRANSFER'|'TRADE'|'HOLDOUT'|'RETIRE'|'CHANGE_TEAM'|'CAMP_BATTLE'|'SKIP_GAME'|'INJURY', headline?:string }
Modifier = { id, key:'sigma'|'windDrift'|'pressure'|'block'|'range'|'trainMult'|'moraleTarget'|'injury'|'iceImmune', op:'mul'|'add', value, expires:{type:'week'|'game'|'season'|'never', at?:number}, label }
```
`Events.roll(state, rng)`: at most one event per in-season week (`p = 0.40 + 0.15·(fame ≥ 500)`), two per offseason slot (`p = 1`), drawn by weight among eligible (`cond`, `stage`, `phase`, `once` not used, not in `recentEvents` ring of 12). `Events.apply(state, rng, choiceIdx)` applies effects (clamps 0–100), resolves `branches` with rng, pushes the consequence headline into `headlines` and `timeline`, clears `pending`. Modifiers are appended to `player.mods`; `Player.expireMods(state, {week|game|season})` prunes.

#### 2.10.2 Catalog (39 events incl. 9b)

| # | id · title (stage; trigger) | Choices → effects |
|---|---|---|
| 1 | `NIL_TRUCK` NIL Offer — a local truck dealer wants your leg on a billboard (COLLEGE; fame ≥ 100) | **Sign**: money +40, fame +30, trust −4, mod trainMult ×0.7 for 2 weeks · **Decline**: morale −2, trust +3 · **Negotiate**: 60 % money +60 fame +40 / 40 % deal dies, morale −4 |
| 2 | `PORTAL_WHISPER` Transfer Portal Whisper (COLLEGE OFF; js < 40 or trust < 40) | **Enter portal**: action TRANSFER · **Stay and fight**: morale +5, action CAMP_BATTLE |
| 3 | `MEDIA_SCRUM_MISS` Media scrum after a miss (any; missed a decisive kick last game) | **"My fault"**: fans +5, trust +3, morale −3 · **Blame the hold**: trust −8, fans +2, flag `holderBeef` · **Joke it off**: fame +10, 50 % fans +4 / 50 % fans −6 |
| 4 | `HOLDER_BEEF` Teammate conflict — the holder is mad about your ST award (any; flag holderBeef or won an award) | **Buy dinner**: morale +3, money −2, mod sigma ×0.98 for 4 weeks · **Ignore**: 10 % branch: mod block +0.02 for 3 games · **Confront**: 50 % morale +6 / 50 % morale −6, trust −3 |
| 5 | `HOLDOUT` Contract holdout (NFL OFF; final contract year, OVR ≥ 82) | **Hold out**: action HOLDOUT (skip week 1; 55 % extension at AAV ×1.10 / 45 % tag threat, trust −12) · **Report**: trust +5 |
| 6 | `CHARITY_KICKATHON` Charity kick-a-thon (any) | **Host**: money −5, fans +10, fame +20, morale +4 · **Skip**: — |
| 7 | `FAMILY_ILLNESS` Family illness (any) | **Fly home**: no training this week, mod moraleTarget +5 for season, mod sigma ×1.05 for 1 game · **Stay**: morale −10, flag `guilt` (morale drift −2/week for 3 weeks) |
| 8 | `KID_LESSON` A young fan wants a lesson (any) | **Teach**: fans +8, morale +5 · **Politely decline**: fans −2 |
| 9 | `COACH_ULTIMATUM` Coach's ultimatum (any REG; trust < 30) | **"Give me 3 more weeks"**: flag `ultimatum` (if FG% ≥ 85 over next 3 weeks: trust +20 else action CAMP_BATTLE / NFL: js −20) · **Request transfer/trade**: action TRANSFER (college) / TRADE (NFL, 40 % executed, trust −15) |
| 9b | `COACH_SHOPPING` Coach is shopping for a new leg (any REG; user is K2 and rival FG% < 70 % over 3 weeks) | **Challenge**: action CAMP_BATTLE · **Wait**: js +5 |
| 10 | `RIVAL_TRASH_TALK` Rival's trash talk (any; rivalry week) | **Respond**: fame +15, fans +5, mod pressure +0.10 for 1 game · **Silence**: xp +20 (CLU-flavoured text) |
| 11 | `WIND_TUNNEL` Wind tunnel study (NFL OFF; money ≥ 10) | **Pay $10k**: money −10, mod windDrift ×0.95 never expires · **No**: — |
| 12 | `MENTOR` Old kicker mentor (NFL year 1) | **Listen**: xp +90, flag `mentored` · **"I've got this"**: xp +40, morale +4 |
| 13 | `DOINK_VIRAL` Doink goes viral (any; a doink last game) | **Lean in**: fame +40, fans +5, trait DOINK_KING · **Delete socials**: morale +2 |
| 14 | `SNOW_BOOTS` Snow game boots (any; next game weather = snow) | **Long studs**: mod sigma ×0.92 for 1 game, mod range ×0.97 for 1 game · **Normal**: — |
| 15 | `CAPTAIN_VOTE` Locker room vote — captaincy (any PRE; trust ≥ 65) | **Accept**: trust +8, morale +5, mod pressure +0.05 for season · **Decline**: — |
| 16 | `HALFTIME_70` Sponsor wants a 70-yarder at halftime (any; fame ≥ 250) | **Try**: one practice kick at 70 (POW-based): make → fame +80, fans +15; miss → fans −5, morale −3 · **No**: — |
| 17 | `AGENT_UPGRADE` Agent upgrade (NFL; fame ≥ 250, agentTier 0) | **Sign big agency**: agentTier 1, flag fee 5 % · **Stay loyal**: morale +4 |
| 18 | `TAG_REACTION` Franchise tag frustration (NFL OFF; tagged) | **Sign tender**: — · **Skip OTAs**: trust −10, fame +2, morale +5 |
| 19 | `SLEEP_STUDY` Sleep study (any) | **Adopt routine**: mod moraleTarget +5 never · **Nah**: — |
| 20 | `TRADE_RUMOR` Trade rumor (NFL REG; js < 45 or trust < 40) | **Request trade**: action TRADE (40 % executed, trust −15) · **Deny publicly**: fans +3, trust +5 |
| 21 | `DRAFT_PRESSURE` Parents want the degree (COLLEGE OFF; draft-eligible) | **Stay**: morale +6 (decision STAY pre-selected) · **Declare**: fame +10 (decision DECLARE pre-selected) |
| 22 | `PARADE` Hometown parade (any OFF; won a title) | **Attend**: fans +15, fame +30 · **Skip for training**: xp +50 |
| 23 | `CONTENDER_CALL` A contender wants your leg for a 6th-rounder (NFL REG week 4–9; team winPct < 0.4, OVR ≥ 78) | **Accept**: action CHANGE_TEAM (best-record needy team), morale +3, fame +20 · **Decline**: trust +5 |
| 24 | `CUT_DAY_CALL` Cut day phone call (NFL; just cut, no FA offers) | **Practice squad**: flag `practiceSquad` (30 % call-up per week for 6 weeks, XP ×0.5) · **Refuse**: FA wait |
| 25 | `FAN_MAIL` Fan mail: the kid who wears your number (any) | **Reply**: fans +6, morale +6 |
| 26 | `ROOKIE_HAZING` Carry the pads (NFL year 1 PRE) | **Do it**: morale −2, trust +4 · **Refuse**: trust −4, fame +5 |
| 27 | `WEATHER_SESSION` Weather sim session (any; next game cold/snow away) | **Practice outdoors**: mod sigma ×0.85 for 1 game, morale −3 · **Skip**: — |
| 28 | `COMEBACK` Comeback question (any; injury ≥ 4 weeks) | **Rush back**: injury −2 weeks, mod sigma ×1.15 for 2 games, fans +5 · **Full recovery**: injury +2 weeks |
| 29 | `PODCAST` Podcast appearance (any; fame ≥ 100) | **Do it**: fame +25, 20 % branch fans −8 (gaffe) · **Pass**: — |
| 30 | `RETIREMENT_RUMOR` Retirement rumor / farewell tour (NFL; age ≥ 35) | **"I'm not done"**: morale +5, mod pressure +0.05 for season · **Announce farewell tour**: fame +40, flag `farewell` (retire after season, mod pressure +0.05) |
| 31 | `HURRICANE` Wild weather warning — postponed game (any; warm climate, Sep–Oct) | **Stay sharp**: xp +25 · **Relax**: morale +6 |
| 32 | `ONSIDE_PRACTICE` Coach wants an onside trick (any PRE) | **Learn**: flag ONSIDE_TRAINED · **No**: xp +20 |
| 33 | `PSYCH` Sports psychologist (any; CLU < 60) | **Enroll**: money −15 (college: free at prestige ≥ 4), attrs CLU +3 over 6 weeks (mod applies +0.5/week via flag) · **Decline**: — |
| 34 | `FAN_PETITION` Fan petition to bench you (any REG; fans < 30) | **Post practice video**: fans +6, 20 % branch fans −6 · **Stay quiet**: xp +10 |
| 35 | `AGGRESSIVE_PLAN` Coach's aggressive plan (any PRE; trust ≥ 70) | **"Give me 60"**: flag `giveMe60` (coach threshold −0.10; fame per 55+ attempt +15) · **"Keep me under 55"**: flag `under55` (threshold +0.10, trust +3) |
| 36 | `GURU` Kick camp guru — swing change (any OFF) | **Overhaul**: mod sigma ×1.2 for 2 weeks then attrs ACC +2 (applied at expiry via flag) · **Keep it**: — |
| 37 | `FOG_DELAY` Fog rolls in (any; weather fog) — informational | **OK**: next kick has hidden wind (mod windDrift 'hidden' flag for 1 game) |
| 38 | `ENDORSEMENT_DRINK` Energy drink endorsement (NFL; fame ≥ 400, fans ≥ 60) | **Sign**: money +250, fame +30, 5 % branch "bad PR" fans −10 · **Decline**: — |

Every event resolves with a consequence headline next week.

### 2.11 Headlines & messages (`data/headlines.js`, `engine/events.js` → `Events.headline(state, rng, tag, ctx)`)

- Templates: `{ id, tags:[...], cond?:fn(ctx), text }`, slots `{name} {last} {team} {opp} {city} {dist} {pct} {coach} {rival} {week} {score}`.
- Minimum bank: 160 lines across tags `postgame_win`, `postgame_loss`, `game_winner`, `decisive_miss`, `doink`, `blocked`, `shank`, `fifty_plus`, `perfect_day`, `bad_day` (≤ 50 %), `slump`, `hot_streak`, `award`, `contract`, `draft`, `fa`, `cut`, `injury`, `event_consequence`, `weekly_flavor`, `rare` (perfect season, 0-for-3, 60+ in snow, iced-and-made-with-CLU≥90 "Ice does nothing to this man").
- Tone: mean-but-fun ("LEG OF GOLD OR LEG OF LEAD? Rookie K goes 1-for-4 in the rain").
- Selection: weighted random among matching tag + cond, excluding `state.recentHeadlineIds` (ring of 40).
- Inbox messages (`Message = {id, week, year, from, avatar, text, kind:'note'|'event'|'result', read}`) from coach/agent/GM/press/fans; coach notes reflect Form and Job Security thresholds; agent notes reflect contract status; ≥ 60 message templates.


### 2.12 Data

All data files are plain JS literals attached to `RTG.Data.*`. Every team carries `verifiedFictional: true` after the blocklist lint passes. Abbreviations are 3 letters, unique per league.

#### 2.12.1 Colleges — 48 real FBS programmes, 6 conferences × 8 (`data/colleges.js` → `RTG.Data.colleges`)

**Superseded by D22:** the 48 fictional schools this section used to tabulate were replaced with real programmes on
2026 alignment. `data/colleges.js` is the authoritative list; the spec no longer duplicates it. The structure is
unchanged and still load-bearing: 6 conferences × 8, array ordered conference by conference, `confIdx` 0–7, rival
pairs `(0,7) (1,6) (2,5) (3,4)`, ids `<CONF><idx>` with three-letter conference codes.

| idx | Conference | id | The eight, in index order (0 → 7) |
|---|---|---|---|
| 0 | Southeastern Conference | `SEC` | Alabama · Georgia · LSU · Texas · Oklahoma · Tennessee · Florida · Auburn |
| 1 | Big Ten Conference | `BIG` | Ohio State · Penn State · Oregon · Wisconsin · Nebraska · Washington · USC · Michigan |
| 2 | Big 12 Conference | `XII` | Kansas State · Utah · Baylor · Iowa State · Oklahoma State · TCU · BYU · Kansas |
| 3 | Atlantic Coast Conference | `ACC` | Clemson · Florida State · Virginia Tech · NC State · North Carolina · Virginia · Miami · Georgia Tech |
| 4 | Pac-12 Conference | `PAC` | Boise State · Oregon State · Colorado State · San Diego State · Texas State · Utah State · Washington State · Fresno State |
| 5 | American Conference | `AAC` | South Florida · Army · Memphis · East Carolina · Charlotte · Tulane · Navy · UTSA |

Each conference is ordered so the rival slots are real rivalries: Iron Bowl (`SEC0`/`SEC7`), Georgia–Florida,
Red River (`SEC3`/`SEC4`), The Game (`BIG0`/`BIG7`), Oregon–Washington, Sunflower Showdown, Holy War, Baylor–TCU,
Florida State–Miami, Commonwealth Cup, NC State–North Carolina, Clemson–Georgia Tech, Army–Navy (`AAC1`/`AAC6`),
Memphis–Tulane, the Milk Can. Prestige 1–5, ratings, climate flags, real colours and unique three-letter abbreviations
live in the data file. Nicknames repeat there as they do in life (four of these programmes are the Tigers), so only the
full name must be unique.

Bowls (`RTG.Data.bowls`) are likewise real: the six New Year's Six as majors (Rose, Sugar, Orange, Cotton, Fiesta,
Peach) and twelve real minor bowls.


#### 2.12.2 NFL — 32 teams (`data/nfl.js` → `RTG.Data.nfl`, array in this order). Conferences **Liberty** / **Frontier**, divisions North/South/East/West.

| Conf | Div | Team (city · nickname) | Abbr | Primary / Secondary | Climate | Flags |
|---|---|---|---|---|---|---|
| Liberty | North | Boston Harbormen | BOS | #0b2a4a / #c8102e | cold | |
| Liberty | North | Pittsburgh Forge | PIT | #1a1a1a / #f2b705 | cold | |
| Liberty | North | Cleveland Rockhounds | CLE | #5b3a1a / #f37021 | cold | windy |
| Liberty | North | Buffalo Blizzard | BUF | #1c3f95 / #ffffff | cold | windy |
| Liberty | South | Nashville Rhythm | NSH | #27235c / #c9a227 | temperate | |
| Liberty | South | Jacksonville Tidewater | JAX | #00594c / #c0c0c0 | warm | |
| Liberty | South | Houston Launch | HOU | #0c2340 / #e03a3e | dome | |
| Liberty | South | Charlotte Crown | CHA | #1b1b1b / #7ac142 | temperate | |
| Liberty | East | New York Empire | NYE | #0f2c59 / #ffffff | cold | big market, windy |
| Liberty | East | Baltimore Privateers | BAL | #2e1a47 / #d4a017 | temperate | |
| Liberty | East | Miami Barracudas | MIA | #00778b / #ff6b35 | warm | rainy |
| Liberty | East | Philadelphia Founders | PHI | #004c54 / #a5acaf | cold | |
| Liberty | West | Denver Summit | DEN | #e8641b / #1b2a49 | cold | altitude |
| Liberty | West | Kansas City Stampede | KC | #b3121b / #f2c14e | cold | |
| Liberty | West | Las Vegas Neon | LV | #000000 / #ff2d95 | dome | |
| Liberty | West | Salt Lake Peaks | SLC | #3a5f8f / #ffffff | cold | altitude |
| Frontier | North | Chicago Wind | CHI | #0b162a / #c83803 | cold | big market, windy |
| Frontier | North | Detroit Motors | DET | #0076b6 / #b0b7bc | dome | |
| Frontier | North | Minneapolis Frost | MIN | #5a3d8f / #f4d35e | dome | |
| Frontier | North | Milwaukee Brewmasters | MIL | #1f4d3a / #f2c14e | cold | |
| Frontier | South | Atlanta Phoenix | ATL | #a71930 / #000000 | dome | |
| Frontier | South | New Orleans Brass | NO | #d3bc8d / #101820 | dome | |
| Frontier | South | Tampa Bay Cannons | TB | #d50a0a / #34302b | warm | rainy |
| Frontier | South | Memphis Soul | MEM | #5d76a9 / #12173f | temperate | |
| Frontier | East | Washington Sentinels | WAS | #5a1414 / #ffb612 | temperate | |
| Frontier | East | Dallas Outlaws | DAL | #041e42 / #869397 | dome | big market |
| Frontier | East | Cincinnati Riverhawks | CIN | #e5581b / #1a1a1a | cold | |
| Frontier | East | Indianapolis Speed | IND | #002c5f / #a2aaad | dome | |
| Frontier | West | Los Angeles Stars | LA | #1e3a8a / #f5c518 | warm | big market |
| Frontier | West | San Francisco Quakes | SF | #9b1c1c / #c7b07a | temperate | big market, windy |
| Frontier | West | Seattle Rain | SEA | #1a2b4c / #6cc04a | temperate | rainy |
| Frontier | West | Phoenix Firebirds | PHX | #b0243c / #1a1a1a | dome | |

Initial ratings: `OFF, DEF ~ clamp(round(N(72, 7)), 58, 88)` generated per seed at career creation; `ST = 70 ± 5`; `coachAgg ~ U(0.3, 0.8)`; `surface`: dome → turf; cold/windy outdoor → 50 % turf; else grass. Big-market flag → fame `marketMult 1.2`.

#### 2.12.3 Bowls & venues (`data/colleges.js` → `RTG.Data.bowls`)

Major (playoff quarterfinals/semis): Citrus Grove Bowl (Orlando), Cactus Sun Bowl (Phoenix), Harbor Bowl (San Diego), Peach Blossom Bowl (Atlanta), Alamo Plaza Bowl (San Antonio), Frontier Bowl (Dallas). Minor (12): Lakeshore Bowl (Chicago), Silver Dollar Bowl (Reno), Gulf Coast Bowl (Mobile), Pioneer Bowl (Boise), Redwood Bowl (San Jose), Independence Day Bowl (Shreveport), Boardwalk Bowl (Atlantic City), Bluegrass Bowl (Louisville), Music Row Bowl (Nashville), Sunshine Bowl (Tampa), Prairie Bowl (Kansas City), Steel Bowl (Pittsburgh). Each has a climate/dome flag for weather. National Title Game rotates among the six majors by `year mod 6`. The Championship Bowl (NFL) rotates among the 8 dome cities + Miami + LA by `year mod 10`.

#### 2.12.4 Name lists (`data/names.js` → `RTG.Data.names`, generator `engine/names.js` → `RTG.Names`)

- `first`: ≥ 200 entries `{n:'Tyler', era:'modern'|'classic'|'any', w:1..3}`; `last`: ≥ 300 entries; `suffix`: `['Jr.', 'III', 'II']`; `nicknames`: ≥ 30 ("The Leg of {city}", "Iceman", "The Mailman", "Doink King"…); `outlets`: ≥ 12 ("Gridiron Daily", "The Snap Count", "KickCast"…); `hometowns`: 60 `{city, state, region:'NE'|'SE'|'MW'|'SW'|'W'}`.
- **Blocklist** (`RTG.Data.names.blockedLast`): surnames of real well-known kickers must not appear in `last`: Tucker, Butker, Vinatieri, Janikowski, Aubrey, Gostkowski, Prater, Zuerlein, Lutz, McManus, Boswell, Koo, Carlson, Gould, Crosby, Dicker, Fairbairn, Slye, Folk, Andersen, Stenerud, Akers, Kaeding, Hauschka, Gano, Succop, Badgley, Maher, Blankenship, Ficken, Moody, Pineiro, Reichard, Karty. Common surnames that some kickers also carry (Bailey, Jones, Myers, Little, Elliott, Joseph, Santos, York, Bass) are allowed and listed in `allowCommon` so the lint does not flag them.
- `Names.player(rng, {era})` → `{first, last, full}` (8 % hyphen/suffix); `Names.coach(rng)` → `"Coach {last}"`; `Names.reporter(rng)` → `{name, outlet}`; `Names.legend(rng)` → classic-era name; `Names.hometown(rng)`; uniqueness within a team by retry ≤ 10.

#### 2.12.5 Trademark blocklist (`data/blocklist.js` → `RTG.Data.blockedNicknames`, used by `test/data_lint.test.js`)

Nicknames (case-insensitive, singular/plural) that may not appear as any team's `nick`: all 32 real NFL nicknames; common NCAA FBS nicknames (Tigers, Bulldogs, Wildcats, Eagles, Bears, Cougars, Huskies, Aggies, Trojans, Bruins, Ducks, Beavers, Sooners, Longhorns, Gators, Seminoles, Hurricanes, Volunteers, Razorbacks, Rebels, Crimson Tide, Buckeyes, Wolverines, Spartans, Hawkeyes, Badgers, Cornhuskers, Cyclones, Jayhawks, Mountaineers, Hokies, Cavaliers, Tar Heels, Blue Devils, Wolfpack, Demon Deacons, Yellow Jackets, Gamecocks, Commodores, Red Raiders, Horned Frogs, Bearcats, Knights, Bulls, Owls, Broncos, Rams, Lobos, Utes, Rainbow Warriors, Aztecs, Falcons, Minutemen, Roadrunners, Bison, Jackrabbits, Coyotes, Lumberjacks, Panthers, Mustangs, Miners, Vaqueros, Rattlers, Racers, Blackhawks, Timberwolves, Lightning, Mariners, Lakers, Clippers, Aces, Kings, Suns, Heat, Thunder, Hornets, Pelicans, Warriors, Magic, Rockets, Ravens, Pistons, Raiders, Chargers, Titans, Texans, Colts, Jaguars, Browns, Bengals, Steelers, Bills, Patriots, Dolphins, Jets, Chiefs, Cowboys, Giants, Commanders, Packers, Vikings, Lions, Saints, Buccaneers, Cardinals, Seahawks, 49ers, Marlins, Brewers, Twins, Cubs, Reds, Yankees, Braves, Astros, Rangers, Angels, Padres, Royals, Blue Jays, Indians, Guardians, Nationals, Orioles, Phillies, Pirates, Mets, Rockies, Diamondbacks, Athletics, Mariners, Dodgers). Also blocked: any team whose `city + nick` equals a real professional or FBS team, and the words "Hoosier", "Buckeye", "Sooner", "Old Dominion", "Delta State", "Boston Common".

### 2.14 The punter path (engine: `engine/punt.js` → `RTG.Punt`) — D24

A career picks a position at creation (`Engine.newCareer({position})` → `Player.create` → `state.player.position`):
**`K`** (field goals, extra points, kickoffs — everything §2.3 describes) or **`P`** (punts). Old saves and fixtures
without a position are kickers (`Save.migrate` fills `'K'`). The road is the same one — the senior season, the offers,
college, the draft, the pros, the Hall — but the kick at the centre of it is a different problem, and so are the numbers
it is judged on. This section describes the punter path **as built**; §2.14.7 records where the build left the original
design.

The punt module is pure over plain JSON: every random number comes from the rng passed in, and `resolve` reads
attributes only from `ctx.kicker` (or an explicit `attrs`), so a punt replays exactly from `{ctx, input, rngState}`.
It loads after `Kick` and before `Sim` (§3.2) and uses `Kick.buildContext`, `Kick.ballXFor`, `Tuning.kick.hash` and
`Weather.components`.

#### 2.14.1 The two curves (`Punt.model`, pure, no rng)

A field goal asks one question: is it through? A punt asks two at once, and they fight:

```
maxDist = clamp(46 + 0.26·(POW − 50) + 0.28·windAlong, 32, 64)        // yd; windAlong = tailwind mph, Weather.components(ctx.wind).along
maxHang = clamp(4.35 + 0.022·(KO − 50), 3.2, 5.4)                       // s; a snapshot without KO reads CON
dist(p) = maxDist · (0.30 + 0.70·p^1.30)                    p ≤ 1.0       // distance rises with power all the way to the leg's limit…
        = maxDist · (1 − 0.28·(p − 1)/0.15)                  1.0 < p ≤ 1.15  // …then past 1.0 the ball comes off the foot badly
hang(p) = max(2.2, maxHang · exp(−½·((p − 0.72)/0.42)²))                  // hang time is a bell around the sweet spot at 0.72
```
(`Tuning.punt.curve` and `.distance`.) Worked at all attributes 62, calm: `maxDist` 49.1, `maxHang` 4.61; at power 0.72
the ball goes 37.2 yd and hangs 4.61 s, at 1.0 it goes 49.1 yd and hangs 3.69 s, at 1.15 it goes 35.4 yd and hangs
2.73 s. POW 40 / 80 / 99 → 43.4 / 53.8 / 58.7 yd; KO 40 / 80 / 99 → 4.13 / 5.01 / 5.40 s.

#### 2.14.2 What the situation wants: the green band (`bestPower`)

A ball that outruns its coverage comes back. So the green band on the power bar is not "the power that gets there" —
it is **the power that maximises net yards from this spot**, found by scanning both curves against the expected return:

```
expectedReturn(hang, oppST) = (1 − pFair) · mean                               // the coach's own estimate, straight down the middle
  pFair = clamp(0.46 + 0.34·(hang − 4.3), 0, 1)
  mean  = max(0, 9.5 − 4.2·(hang − 4.3) − 0.06·(oppST − 70))
pin = toGoal ≤ 55                                                              // inside the opponent's 55 the ball is meant to die, not to travel
for p in 0 … 1.15 in 60 steps (Tuning.punt.search.steps):
  landing = los + dist(p) ;  net = dist(p) − expectedReturn(hang(p), oppST)
  if landing ≥ 100 − 4:  net = pin ? −∞ : (80 − los) − 12                     // the end zone is worth a touchback minus a penalty, and never the target when pinning
  else if landing ≥ 80:  net += 7                                              // pinning them is worth more than the yardage says
  keep the best net → bestP, want = dist(bestP)
if every power reaches the end zone: bestP = 0, want = dist(0)
pNeed = clamp(bestP − 0.20·0.7, 0, 1.15 − 0.20)                                // the band is [pNeed, pNeed + greenBand]; the target sits 70 % up it (field.bandLead)
```
`Tuning.punt.field`: `greenBand` 0.20 (the same width as the kick's, D21), `bandLead` 0.7, `pinFrom` 55,
`insideYards` 20, `touchbackYard` 20, `halfWidthYd` 26.65; `Tuning.punt.search`: `steps` 60, `endZoneMargin` 4,
`touchbackPenalty` 12, `insideBonus` 7.

That makes field position the whole game. Worked at 62s, calm, NFL: from your own 8 through your own 45 the coach wants
every yard (`want` 49, `pNeed` 0.86); from your own 50 the band drops (46 / 0.78), from the 55 (41 / 0.66), the 65
(31 / 0.42), the 75 (21 / 0.13) and from the 85 it sits on the floor (15 / 0.00). `tbFrom` is the power that reaches
the end zone (0.91 from the 55), always above the band once the end zone is in range.

**`PuntModel`** = `{losYard, toGoal, pin, maxDist, maxHang, want (rounded, ≤ toGoal), pNeed, greenBand, powerMax
(1.15), windAlongYds, tbFrom, distance, hang, power, pBlock}` — `distance`/`hang`/`power` are for the power given in
`opts.power` (default: the middle of the band). `Punt.inGreen(power, model)` is the engine's own check of the band
(`pNeed ≤ power ≤ min(powerMax, pNeed + greenBand)`, 1e-6 tolerance).

**Aim** is the other half. The punter stands on a hash (`ctx.ballX`: NFL ±3.083 yd, college ±6.667 yd), so one
sideline is the short way out. Pointing at it costs `cos(aim)` of the downfield distance and buys a ball nobody
returns: `lateral = ballX + gross·tan(aim) + N(0, σ_lat)`, and at `|lateral| ≥ 26.65` the ball is out of bounds and
dead where it crossed. Wide aim also widens σ, and a worse ACC widens it further. The engine accepts
`±Tuning.punt.aimMax` (30°); **the scene's meter clamps aim at ±12°** (`Input.CONST.aimMax`), so a human punter reaches
the sideline mostly from the near hash while the AI (§2.14.3) uses the full range.

#### 2.14.3 Resolving a punt (`Punt.resolve(rng, ctx, attrs, input, opts)`, draw order binding)

```
input null         → Punt.aiInput (power gauss 2 · aim gauss 2), result.auto = true and tag 'auto'
opts.forced        → forcedResult (a Punt.GRADES name), 0 draws                                 // RTG.debug.forceKick
input.green && inGreen(power, model) → assistedResult, 0 draws                                   // the D21 assist, see below
1      blocked = chance(pBlock)         pBlock = clamp(0.006 + 0.0009·(oppST − 70) − 0.00035·(CON − 55) + 0.02·pressure, 0, 0.09)
       blocked → 2 blockReturnTd = chance(0.22) ; gross = net = hang = 0 ; landing = los
                 oppStart = blockReturnTd ? 100 : clamp(100 − los + 12, 1, 99) ; grade BLOCKED ; return
2,3    gross   = max(0, dist(power)·cos(aim) + N(0, σ_dist))      σ_dist = 4.2·(1 + 0.012·(62 − CON))·(1 + 0.55·pressure)
4,5    hang    = max(2.2, hang(power) + N(0, 0.24))
6,7    lateral = ballX + gross·tan(aim) + N(0, σ_lat)              σ_lat = 3.4·(1 + 0.014·(62 − ACC))·(1 + 0.9·|aim|/30)
settle (landing = los + gross):
  landing ≥ 100          → TOUCHBACK: gross = 100 − los, landing = 100, oppStart = 20, net = 80 − los ; no more draws
  |lateral| ≥ 26.65      → out of bounds, dead there: net = gross, oppStart = 100 − landing ; no more draws
  else 8     fair = chance(pFair)    pFair = clamp(0.46 + 0.34·(hang − 4.3) + 0.45·|lateral|/26.65, 0, 1)   // a ball angled at the sideline pins the returner whether or not it crosses
       fair → fairCatch: net = gross, oppStart = 100 − landing
       else 9,10  ret = clamp(N(9.5 − 4.2·(hang − 4.3) − 0.06·(oppST − 70), 5.5), 0, landing)                // cannot run past the goal line
            11    returnTd = chance(clamp(0.002 + 0.0016·ret, 0, 0.06)) → returnYds = landing, oppStart = 100
                  else oppStart = 100 − landing + ret ; net = gross − ret
  inside20 = !touchback && landing ≥ 80                              // judged where the ball LANDED, even if the return carried it back out
```
So a live punt spends 7 draws (blocked: 2; out of bounds or a touchback: 7; in play: 8 fair-caught, 10 returned, 11
with the return-TD roll — `punt.test.js` asserts 7–11). `oppStart` is the receiving side's own yard line, clamped 1–99
except that a touchdown reads 100. Constants: `Tuning.punt.spread`, `.block`, `.ret`.

**Grades** (`Tuning.punt.grade`), in this order: `BLOCKED`; `TOUCHBACK`; `SHANK` when `gross ≤ 26`; `COFFIN` when
`inside20` and the ball was out of bounds, fair-caught or returned ≤ 3; then net yards against the punter's **own**
ceiling — `BOOMING` ≥ 0.92·`maxDist`, `GOOD` ≥ 0.80, `OK` ≥ 0.64, else `POOR` — so "booming" means booming for them.
`outcome` mirrors the grade; `made` = not blocked, not a touchback, not a shank (what the log, the HUD and the slot
strip read). `Punt.GRADE_TEXT` gives the banner: BLOCKED! · SHANKED · TOUCHBACK · SHORT · FAIR · GOOD PUNT · BOOMING! ·
COFFIN CORNER!. `Punt.feedbackFor(result, ctx, model) → {title, detail, coach}`: `detail` is
"`gross` yd (`net` net) · `hang`s hang · out of bounds at the N / into the end zone / fair catch / N yd return", and
`coach` is one line for the case (blocked, touchback, shank, coffin, a return ≥ 15 yd = "not enough hang", booming,
else "a little more hang").

**The AI rule** (`Punt.aiInput`, 4 draws): `power = clamp(pNeed + 0.10 + N(0, 0.05), 0, 1.15)` — the middle of the
band — and `aim = clamp((pin ? 22·ACC/62 : 0) + N(0, 1.6), −30, 30)`. The AI aims to the **right** (positive) sideline
whenever it is pinning, whichever hash it stands on; it never sets `green`. Used for every AI punt, auto-resolved user
punts (`auto: true`) and the balance test.

**The green assist (D21) applies to punts too.** A release the engine agrees was inside the band returns the punt the
situation asked for, with **no draws spent**: `gross = dist(power)·cos(aim)` with no noise, `hang = max(hang(power),
4.4)` (`Tuning.punt.assist.hangFloor`), `assisted: true`, tag `'assisted'`. If it lands inside the 20 (`80 ≤ landing <
100`) it is put out of bounds at the near sideline (the sign of `ballX`) and graded `COFFIN`; if it reaches the end zone
it is a `TOUCHBACK` (the band itself can reach the end zone from deep in plus territory); otherwise it is fair-caught and
graded normally. It is never blocked and never returned. An unverifiable claim falls through to the physics above.

**Forced grades** (`Tuning.punt.forced`, 0 draws): BLOCKED as above (no TD); TOUCHBACK; SHANK gross `min(18, room − 1)`,
hang 2.8; COFFIN gross `clamp(room − 6, 1, maxDist)` out of bounds (re-graded honestly when the leg cannot reach the
20); BOOMING gross `min(maxDist, room − 1)`, fair-caught; POOR / OK / GOOD gross `min(0.8·maxDist, room − 1)`,
fair-caught; hang 4.4 and `net = gross` for all of them.

**`PuntResult`** (§3.4): `{type:'PUNT', losYard, toGoal, power, aim, gross, net, hang, landing, lateral, oppStart,
touchback, outOfBounds, fairCatch, downed (never set), returnYds, inside20, blocked, blockReturnTd, returnTd, grade,
outcome, made, auto, assisted, forced, tags}`, every number rounded to 2 dp.

**Context** (`Punt.buildContext(state, gs, situation, rng)`): `situation.losYard` (own yard 1–99, default 30) becomes
`ctx.losYard`, `ctx.toGoal = 100 − losYard` and `ctx.distance = toGoal`; everything else is `Kick.buildContext`'s
(`type: 'PUNT'`, wind 2 draws plus Legend gusts 2, pressure and its flags, `oppST` from the opponent team's ST or
`Tuning.kick.defaults.oppST`, the kicker snapshot from `situation.kicker` / `situation.attrs` / the user). Then the hash:
`Kick.buildContext` rolls one only for field goals, so the punt rolls its own weighted draw from
`Tuning.kick.hash.snapDist[league]` when `situation.hash` is not given, and `ctx.ballX = Kick.ballXFor(league, hash)`.
Draws: `Kick.buildContext`'s + 1.

#### 2.14.4 Punts in the sim (`engine/sim.js`)

- **Every punt in a simulated game goes through `RTG.Punt`** when it is loaded (`puntOrNull`); the pre-D24 abstract
  rolls (`Tuning.sim.drive.puntStart`, `Tuning.sim.coach.puntNet`) are only the fallback without it. A `PUNT` drive
  outcome first draws the line of scrimmage, `los = clamp(round(N(32, 11)), 4, 58)` (`drive.puntLos`, 2 draws); a `STALL`
  the coach declines to kick or go for punts from the stall spot (own `100 − ytg`) with the stall text as a prefix.
- **Who punts** (`userPunts`): the user, when it is their side, they are `K1`, healthy and `position === 'P'` →
  `gs.pending = {type:'USER_PUNT', ctx}` and a `USER_PUNT` SimEvent ("Punt from own 32"). Otherwise the AI punter
  (`aiPunterFor`: `team.punter` / `team.punter2`, which **no code populates yet**), else the **abstract leg**: all five
  attributes `clamp(round(62 + 0.5·(ST − 70)), 30, 95)` from the team's special-teams rating (`Tuning.punt.abstract`),
  resolved at once with `Punt.aiInput` (4) + `Punt.resolve` (7–11). Conversely `userKicks` requires `position !== 'P'`:
  a punter's field goals and extra points are taken by the team's own AI kicker (`team.kicker`), never offered to the
  user, and kickoffs stay simulated for both positions.
- **`settlePunt`**: `gs.stats[side].punts++`, clears `pending`, records the punt (the user's through
  `Stats.recordPunt` with `{gameId, teamId, oppId, week, year, rngState}`; everyone else's through `Stats.recordAiPunt`
  onto `season.punterStats[teamId]` when the game is in the active league), writes the drive-log line ("44-yd punt,
  fair catch - BOS takes over at own 22" · "PUNT BLOCKED - …" · "…, touchback - …" · "… out of bounds - …" · "…, 12-yd
  return - …"), burns `clock.fgPlaySec` (5 s), and either scores the touchdown for the other side (`returnTd` or
  `blockReturnTd`) or flips possession at `ytg = 100 − oppStart`. The event is a `DRIVE` with `result: 'PUNT'`, `punt`
  and `ctx` (both drive paths pass `eventType: 'DRIVE'`; the `AI_PUNT` type exists only as the default when none is
  given).
- **Entry points**: `Sim.applyPunt(gs, state, rng, result)` (requires `pending.type === 'USER_PUNT'`);
  `Sim.autoResolvePending` resolves a `USER_PUNT` with the AI rule and `auto: true`; `Engine.applyUserPunt(state, rng,
  input|null, {forced?})` is the UI's one entry (it refuses a pending kick by name); `Engine.autoKick` covers whatever is
  pending; `Engine.sessionKick` resolves `PUNT` session contexts through `Punt.resolve` (§2.7.0), mapping a forced kick
  word onto a grade (GOOD → GOOD, BLOCKED → BLOCKED, SHORT → SHANK, else POOR). `RTG.debug.forceKick({outcome})` accepts a
  `Punt.GRADES` name on a pending punt.
- **What still reads the kicker's line** (as built): per-kick meters (`Player.applyKickMeters` is called from the kick
  path only), game XP (`awardXp` reads FG/PAT rows; a punter earns the team-result XP and kickoff touchbacks only), the
  post-game grade (`Stats.grade` on 0 FGA / 0 PAT reads a 100 % day → `B`), the headline tag (falls to
  `postgame_win/loss`), Job Security (`Player.kickCounts` counts FG rows, so a punter's `js` is carried by the OVR gap
  and the trust floor alone), and the season goals (`fgPct` cannot be met). Camp battles, the combine, the UDFA tryout
  and the halftime-70 remain field-goal / kickoff sessions for a punter, and the draft's "needy team" rule and
  `Contracts.marketValue` know nothing of the position (`Tuning.punt.career.{marketMult, xpMult}` exist but nothing
  reads them).

#### 2.14.5 What the career measures

**Stats** — every `KickerStats` block (`Schema.STAT_KEYS`) carries `punts`, `puntYds` (gross sum), `puntNet` (net sum),
`in20`, `tbs`, `puntLong`, `puntBlocked`, `fairCatch` (fair catches **and** balls out of bounds), `retYds`, `hangSum`,
`pinned` (inside-20 punts at pressure ≥ the clutch threshold). `Stats.applyPunt`: `punts++`; a blocked punt adds only
`puntBlocked` and nothing else; otherwise gross/net/hang accumulate, `puntLong` is the max gross (rounded), a touchback
counts in `tbs` and never in `in20`. `Stats.puntLine(block)` → `{punts, gross, net, hang, in20, in20Pct, tbs, long,
blocked, retYds}` with the averages over **live** punts (`punts − puntBlocked`); the UI uses it rather than dividing by
hand. The line the game shows is **net average** and **inside-20 rate**, because those are what a punter is paid for.
`Stats.recordPunt` also logs a `KickLogRow` of `type 'PUNT'` (`distance = round(gross)`, `outcome = grade`, `made =
!blocked && !touchback`, `input.quality 0`, a `punt` sub-object with the landing spot, net, hang, `oppStart` and the
flags; id `p<year>w<week>n<seq>`) into `stats.kicks` and the splits, so the kick log, the game screen and the season
line see punts.

**Records** (§2.9): `longPunt`, `seasonNet` (min 30 punts), `seasonIn20`, `careerPunts`, `careerNet` (min 150),
`careerIn20`, `punterSeasons` (NFL only), each with `position: 'P'`; `Data.records.keysFor(league, position)` and the
user's values from the punting block when the career is a punter's.

**Awards** (§2.8): the punter slate — `GOLDEN_FOOT`, `ALL_AMERICAN_P1/P2`, `ALL_CONF_P1`, `FRESHMAN_FOOT`,
`PIN_KING_COLLEGE` in college; `GOLDEN_LEG_P`, `ALL_LEAGUE_P1/P2`, `PIN_KING_NFL` plus the shared `PRO_CLASSIC` and
`STPOY` in the NFL — ranked on `Awards.punterScore` over `season.punterStats` (every team's punting line, since every
team punts) plus the user's season block; `Data.awardsFor(league, 'P')`.

**The Hall** (§2.7.9): `Awards.hofScore` swaps in `hofRowsPunter` — punts, downed inside the 20, the longest, the
All-League teams, STPOY, titles, starter seasons, a 44+ career net over 400 punts, records held — under the shared
verdict thresholds.

**The senior season** (§2.7.0): a punter's five games are 3–6 punts a night instead of scoring chances; the offence's
drives die and you flip the field; the rivalry and playoff weeks end on a punt protecting a one-score lead; the board
reads net average, the ones pinned inside the 20 and the ones with the game on them; the 0–6 rating is
`6·(0.5·netScore + 0.25·in20Rate + 0.25·pinnedRate)`.

**Attributes** (§2.1.1) are the same five numbers relabelled LEG · PLACE · OPER · CLU · HANG (`Player.attrLabels`),
so a punter's `KO` is hang time. As built only the new-career archetype bars use the labels; the training screen's
tiles and the attribute panels elsewhere still read POW / ACC / CON / CLU / KICKOFF for a punter.

**Screens** (§4.5, §4.6): position cards on `newcareer`; the punter's lines on `hsseason` and `hsgame`; `game` routes a
`USER_PUNT` to the kick scene ("YOUR PUNT: …") and SIM REST resolves it through `autoKick`; the kick scene draws the punt
field (the strip inside the 20 and the tick at `model.want`), a `hang × 0.45` s flight, the grade banner and
`Punt.feedbackFor`.

#### 2.14.6 Balance (asserted in `test/punt.test.js` unless marked measured)

The season harness: 1 200 AI punts per profile (`Punt.aiInput` → `Punt.resolve`), calm NFL, middle hash, no pressure,
from own 10–45 (`los = 10 + (7·i mod 36)`), seed 4242, blocked punts excluded from the averages. Measured values are
from that harness as it stands.

| Metric | Target | Measured |
|---|---|---|
| Good leg (POW / ACC / CON / KO all 80): gross average | 45–52 yd | 50.6 |
| Good leg: net average | 38–48 yd | 44.8 |
| Good leg: inside-20 rate | > 20 % | 44.6 % |
| Good leg: touchback rate | < 12 % | 0.2 % |
| Gap from a poor leg (all 45) to the good one, gross | > 7 yd | 9.0 (41.6 → 50.6) |
| Gap, net | > 8 yd | 12.2 (32.6 → 44.8) |
| Middle leg (all 62): gross / net / inside-20 | — | 46.4 / 38.6 / 32.6 % (measured) |
| Blocks over 4 000 mixed punts (own 1–95, power 0.5–1.1, aim ±30°) | > 0 and < 10 % | rare; `pBlock` 0.36 % at 62s calm, 0 at CON 80 calm, 3.5 % at CON 30 under pressure 1 |
| Draw contract | `resolve` 7–11 · `aiInput` 4 · forced 0 · assist 0 | exact |
| Band geometry at own 1 / 10 / 25 / 40 / 55 / 70 / 85 / 95 | `pNeed ≥ 0`, `pNeed + band ≤ 1.15`, `0 ≤ want ≤ maxDist + 1`; `want ≥ 20` through own 60 | holds |
| Near-sideline aim (own 55, right hash, +30°) vs straight | shorter gross; out of bounds > 20 %; returned < 50 % as often; the far sideline (−30°) not reached | holds |
| Hang (KO 95 vs 30, 800 punts each) | < 75 % of the return yards | holds |
| Punter Hall verdicts, 60 auto careers at Pro (seeds 1–60, `autoPlayCareer` to RETIRED) | — | **3 % first-ballot, 18 % inducted** (2 / 11 of 60), 57 % finalist, 22 % off the ballot (measured, not asserted) |
| Those 60 careers: NFL career net / inside-20 rate / seasons / punts | — | medians 42.7 yd / 60 % / 12 / 998 (measured) |

The punter distribution sits inside the kicker's §2.7.9 band (first-ballot ≤ 10 %, inducted 15–25 %) without a punter
row in `career_balance`; a later balance phase may assert it there.

#### 2.14.7 Design vs. build (for the record)

Where the code, as integrated, differs from the §2.14 that was written ahead of it:

1. **Balance targets** were 44–48 gross / 37–43 net / touchbacks < 6 % / blocked < 1 %; the test asserts 45–52 / 38–48
   / < 12 % / blocks merely rare, plus the net gap and the inside-20 floor (table above).
2. **`inside20` is judged on the landing spot**, not on where the ball was dead: a ball that lands at the 15 and is
   returned to the 25 still counts. The old text said "dead at or past the 20".
3. **The fair-catch probability has a sideline term** (`+0.45·|lateral|/26.65`) that the old formula omitted, and the
   design's "high hang → fair catch, low hang → return" reads as one roll in the code, not two branches.
4. **The end zone in the scan** is priced as a touchback minus 12 yards outside pinning range and excluded inside it
   (`endZoneMargin` 4), not simply "the best net that still lands short of it".
5. **The assist can produce a touchback**: when the band itself reaches the end zone the assisted ball is a
   `TOUCHBACK`, not "a coffin corner or a fair catch". It is still never blocked and never returned.
6. **Aim**: the engine's `aimMax` is 30° but the scene's meter clamps at ±12° (`Input.CONST.aimMax`), so a human never
   aims as wide as the AI; and the AI aims right, not at the near sideline.
7. **Contracts** do not use `Tuning.punt.career.marketMult` (nor `xpMult`); nothing reads either. Camp battles, the
   combine, tryouts, halftime-70, job security, game XP, the post-game grade, headline tags and season goals still run
   on field goals (§2.14.4).
8. **No team carries a punter object** (`team.punter` / `punter2` are always null); every AI punt is the abstract leg
   from the team's ST rating, and award candidates are labelled `<abbr> P`.
9. **STPOY for a punter** goes only to the user, on the ratio alone (no game-winner clause), while a kicker season
   that fails its own STPOY test still prints the "a punter won it" note (§2.8).
10. `fairCatch` in the stats counts balls out of bounds too; `PuntResult.downed` is never set; the kick-log row's `made`
    (`!blocked && !touchback`) differs from `PuntResult.made`, which also excludes a shank.
11. `Tuning.punt.field.pinTarget` (6) and `safeTarget` (4) are not read by the code (the scan replaced them);
    `Tuning.punt.distance.minWant` (20) is read only by the test.
12. `Data.awardsFor(league, 'P')` lists only the six college and four NFL `position: 'P'` rows; the shared `PRO_CLASSIC`,
    `STPOY` and season-goal rows carry no `position`, so they are granted to a punter but never listed as the punter's.
13. `Player.attrLabels` / `attrNames` are read only by the new-career screen; the training, team and stats screens
    still show a punter the kicker's attribute names.

---

### 2.13 Balancing targets (asserted in tests; see §5)

| Metric | Target | Test |
|---|---|---|
| Kick make rates by profile/bucket | §2.3.6 table ±4 (56–60 ±6) | `kick_calibration` |
| `Kick.model.pMake` vs Monte Carlo | within ±2 pts at 25/35/45/52/58 yd | `kick_model` |
| NFL sim: points/team | 21–27 | `sim` (2 000 games) |
| NFL sim: FGA/team, PAT/team | 1.9–2.4, 2.4–3.0 | `sim` |
| NFL sim: FG distance buckets (<30/30s/40s/50+) | 14–19 / 26–31 / 30–35 / 19–25 % | `sim` |
| NFL sim: regulation ties, decisive attempts per game (both teams, incl. OT) | 3–7 %, 0.10–0.25 | `sim` |
| College sim: points/team, FGA/team, PAT/team | 24–32, 1.5–2.2, 2.8–4.2 | `sim` |
| Schedules valid (NFL 17 games, 6 divisional, 8/9 home split; college 12 games, 7 conference) | always | `schedule` |
| Auto-simmed careers (200 seeds, Pro, AI input): rookie season FG% | median 78–83 % | `career_balance` |
| Year-4 starter FG% / elite peak seasons | 84–88 % / 89–93 % | `career_balance` |
| Career longest FG | median 57–61; 5 % ≥ 64 | `career_balance` |
| Careers with ≥ 1 benching or cut in first 3 NFL seasons | 25–45 % | `career_balance` |
| Career length (NFL seasons) for careers that reach OVR ≥ 80 | median 10–14 | `career_balance` |
| HOF verdicts over 200 careers | first-ballot ≤ 10 %, inducted 15–25 % | `career_balance` |
| Punt engine: good leg (all 80s) gross / net / inside-20 / touchbacks, 1 200 AI punts | 45–52 / 38–48 / > 20 % / < 12 % | `punt` (§2.14.6) |
| Punt engine: gap from a poor leg (all 45s) to a good one, gross / net | > 7 / > 8 yd | `punt` |
| Punt engine: draw contract (`resolve` 7–11, `aiInput` 4, forced 0, assist 0) and the band fits the bar at every LOS | always | `punt` |
| Punter HOF verdicts over 60 auto careers (seeds 1–60, Pro) | first-ballot 3 %, inducted 18 % (measured; not asserted) | — (§2.14.6) |
| Full auto career runtime (engine only) | < 4 s on Node (CI) | `career_balance` |
| Save size after 20 seasons | < 400 KB | `save` |
| Season sim without UI | < 250 ms | `season` |


---

## 3. Technical specification

### 3.1 Principles

1. **One global**: `window.RTG`. Every file is a classic script wrapped in the UMD-ish shim (§3.3). No `type="module"`, no `fetch`, no XHR, no image files — sprites are pixel strings, data are JS literals.
2. **Engine is pure over plain JSON**: `fn(state, rng, args) → result`, mutating `state` in place. No object cycles; teams referenced by id. `JSON.parse(JSON.stringify(state))` must equal `state` (tested).
3. **All randomness through `rng`** (engine) or `uiRng` (UI cosmetics, never persisted, never affects state). Purity test greps the engine for `window.` (except the shim line), `document`, `localStorage`, `Math.random`, `Date`, `setTimeout`, `setInterval`, `requestAnimationFrame`, `performance`.
4. **Time** is passed in: `Save.serialize(state, rng, now)`; the engine never reads clocks.
5. **Constants live in `RTG.Tuning`**; tests import it; no magic numbers elsewhere (lint test greps kick.js/sim.js for numeric literals outside `Tuning` references except 0, 1, 2, 100, 360 and unit conversions).
6. **UI renders `state`**; it never derives game rules. Screens are functions `(store) → {el, destroy()}`; `destroy` unsubscribes and cancels RAF.
7. **Fixtures first**: every engine module ships `test/fixtures/<module>.js` with valid states at its phase so UI screens can be built before the engine is complete.

### 3.2 Files, ownership, load order

Owner codes: E1 Core & Kick · E2 Sim & League · E3 Career & Story · E4 Kick Scene & Canvas · E5 App Shell & Screens · INT integrator.

```
kicker/
  index.html                          E5 (INT maintains script order)
  css/style.css                       E5
  js/00_namespace.js                  E1   window.RTG = {VERSION, SAVE_VERSION, ...}
  js/engine/tuning.js                 E1   RTG.Tuning (every constant)
  js/engine/util.js                   E1   RTG.Util
  js/engine/rng.js                    E1   RTG.RNG
  js/engine/schema.js                 E1   RTG.Schema (factories + validate + typedefs)
  js/data/blocklist.js                E2   RTG.Data.blockedNicknames
  js/data/names.js                    E2   RTG.Data.names
  js/data/colleges.js                 E2   RTG.Data.colleges, RTG.Data.bowls, RTG.Data.conferences
  js/data/nfl.js                      E2   RTG.Data.nfl, RTG.Data.nflStructure
  js/data/records.js                  E2   RTG.Data.records (base values)
  js/data/awards.js                   E3   RTG.Data.awards
  js/data/events.js                   E3   RTG.Data.events
  js/data/headlines.js                E3   RTG.Data.headlines, RTG.Data.messages
  js/engine/names.js                  E2   RTG.Names
  js/engine/weather.js                E1   RTG.Weather
  js/engine/player.js                 E1   RTG.Player
  js/engine/kick.js                   E1   RTG.Kick
  js/engine/punt.js                   E1   RTG.Punt (the punting engine, §2.14; needs Util, Tuning, Kick, Weather)
  js/engine/schedule.js               E2   RTG.Schedule
  js/engine/standings.js              E2   RTG.Standings (standings, tiebreaks, rankings, playoffs, bowls)
  js/engine/sim.js                    E2   RTG.Sim
  js/engine/stats.js                  E3   RTG.Stats
  js/engine/awards.js                 E3   RTG.Awards (incl. hofScore)
  js/engine/events.js                 E3   RTG.Events (events + headlines + inbox)
  js/engine/contracts.js              E3   RTG.Contracts
  js/engine/draft.js                  E3   RTG.Draft (combine + draft)
  js/engine/season.js                 E2   RTG.Season (week loop, league sims, postseason)
  js/engine/career.js                 E3   RTG.Career (stages, offers, decisions, transitions)
  js/engine/hs.js                     E3   RTG.HS (the high-school senior season, §2.7.0)
  js/engine/save.js                   E3   RTG.Save
  js/engine/api.js                    E3   RTG.Engine (facade; INT reviews)
  js/ui/storage.js                    E5   RTG.UI.Storage (localStorage adapter)
  js/ui/store.js                      E5   RTG.UI.Store
  js/ui/router.js                     E5   RTG.UI.Router
  js/ui/components.js                 E5   RTG.UI.C (meters, cards, buttons, tabs, modal, toast, list)
  js/ui/sprites.js                    E4   RTG.UI.Sprites (procedural atlas)
  js/ui/canvas.js                     E4   RTG.UI.Canvas (virtual canvas, scaling, RAF loop)
  js/ui/audio.js                      E4   RTG.UI.Audio (WebAudio bleeps)
  js/ui/input.js                      E4   RTG.UI.Input (pointer flick + keyboard meters → triple)
  js/ui/kickview.js                   E4   RTG.UI.KickView (kick scene state machine)
  js/ui/screens/title.js              E5
  js/ui/screens/newcareer.js          E5
  js/ui/screens/hsseason.js           E4
  js/ui/screens/hsgame.js             E4   (uses KickView)
  js/ui/screens/offers.js             E5
  js/ui/screens/hub.js                E5
  js/ui/screens/inbox.js              E5
  js/ui/screens/training.js           E5
  js/ui/screens/game.js               E4   (drive log + sim controls + kick handoff)
  js/ui/screens/kick.js               E4   (full-screen kick scene wrapper)
  js/ui/screens/postgame.js           E5
  js/ui/screens/schedule.js           E5
  js/ui/screens/standings.js          E5
  js/ui/screens/team.js               E5
  js/ui/screens/stats.js              E5
  js/ui/screens/records.js            E5
  js/ui/screens/awards.js             E5
  js/ui/screens/offseason.js          E5   (wizard: body check, training blocks, decisions)
  js/ui/screens/combine.js            E4   (uses KickView)
  js/ui/screens/draft.js              E5
  js/ui/screens/contract.js           E5   (extension / FA / tag / UDFA / retire)
  js/ui/screens/campbattle.js         E4   (uses KickView)
  js/ui/screens/timeline.js           E5
  js/ui/screens/legacy.js             E5
  js/ui/screens/settings.js           E5
  js/ui/screens/saves.js              E5
  js/ui/screens/practice.js           E4   (M4)
  js/ui/app.js                        E5   boot, resize, autosave hooks, debug panel mount
  js/debug.js                         E5   RTG.debug
  test/load.js                        E1   loads engine files into a vm context in order
  test/run.js                         E1   runs all *.test.js (node:test or plain assert)
  test/fixtures/*.js                  owner of the module
  test/*.test.js                      owner of the module (see §5)
  test/e2e/*.spec.js                  E5 (Playwright, dev-only)
  test/balance_report.js              E1 (prints the calibration table; checked into repo output)
  README.md                           INT
```

**`index.html` script order** (exactly this; INT owns the list):
```
00_namespace, engine/tuning, engine/util, engine/rng, engine/schema,
data/blocklist, data/names, data/colleges, data/nfl, data/records, data/awards, data/events, data/headlines,
engine/names, engine/weather, engine/player, engine/kick, engine/punt, engine/schedule, engine/standings, engine/sim,
engine/stats, engine/awards, engine/events, engine/contracts, engine/draft, engine/season, engine/career, engine/hs,
engine/save, engine/api,
ui/storage, ui/store, ui/router, ui/components, ui/sprites, ui/canvas, ui/audio, ui/input, ui/kickview,
ui/screens/* (any order; each registers itself with Router), ui/app, debug
```
`test/load.js` loads `00_namespace` → `engine/tuning` … → `engine/kick` → `engine/punt` → … → `engine/api` (everything before `ui/`) in the same order via `vm.runInThisContext(fs.readFileSync(...))` with `globalThis.RTG` captured, then exports `RTG`. A test that needs the UI does not exist (UI is tested by Playwright only).

### 3.3 Namespace & the shim

`00_namespace.js`:
```js
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.VERSION = '1.0.0';
  RTG.SAVE_VERSION = 1;
  RTG.Data = RTG.Data || {};
  RTG.UI = RTG.UI || {};
})(typeof window !== 'undefined' ? window : globalThis);
```
Every engine and data file:
```js
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  var Util = RTG.Util, Tuning = RTG.Tuning;      // deps already loaded (load order is a contract)
  var Kick = {};
  // ... pure functions ...
  RTG.Kick = Kick;
})(typeof window !== 'undefined' ? window : globalThis);
```
The purity test whitelists exactly the string `typeof window !== 'undefined' ? window : globalThis`. UI files use the same shim (for symmetry) and may use the DOM freely.

`RTG.UI.uiRng = RTG.RNG.create((Date.now() ^ 0x9e3779b9) >>> 0)` is created in `app.js`; only UI code may use it.

### 3.4 State schema (`RTG.Schema` typedefs; factories `Schema.createCareer`, `Schema.createTeam`, `Schema.createGameState`, `Schema.createKickLogRow`; `Schema.validate(state) → {ok, errors[]}`)

```js
CareerState = {
  v: 1,                                  // save schema version (mirrors RTG.SAVE_VERSION)
  seed: uint32,                          // career seed (displayed, shareable)
  rngState: uint32,                      // rng state after the last engine call (store writes it back after every dispatch)
  difficulty: 'rookie'|'pro'|'allpro'|'legend',
  createdAt: number,                     // ms, supplied by UI
  playtimeSec: number,
  stage: 'HS'|'COLLEGE'|'DRAFT'|'NFL'|'RETIRED',
  phase: 'SEASON'|'OFFERS'              // HS
       | 'PRE'|'REG'|'POST'|'AWARDS'|'OFF'   // COLLEGE, NFL
       | 'DECLARE'|'COMBINE'|'DRAFT'|'UDFA'  // DRAFT
       | 'LEGACY',                            // RETIRED
  year: int,                             // 1 = first college season; calendar year = 2026 + year − 1
  week: int,                             // 1-based; PRE week 0; POST weeks continue numbering (college 14–17, NFL 19–22)
  player: {
    id: string, name: {first, last, full}, hometown: {city, state, region}, archetype: 'CANNON'|'SURGEON'|'ICEMAN'|'SOCCER',
    position: 'K'|'P',                   // §2.14: chosen at creation, never changes; Save.migrate fills 'K' on older saves
    look: {skin: 0..3, hair: 0..5, boot: 0..3}, foot: 'R'|'L', age: int, stars: 2..5,
    attrs: {POW, ACC, CON, CLU, KO},     // ints 1–99
    pot:   {POW, ACC, CON, CLU, KO},     // hidden caps
    xp: int, xpSpent: int, form: float,
    morale: 0..100, trust: 0..100, fans: 0..100, fame: 0..1000, js: 0..100,
    traits: string[], mods: Modifier[], flags: {[k]: any},
    injury: null | {type: string, weeksLeft: int, careerThreat: bool},
    agentTier: 0|1|2, agentName: string,
    missStreak: int, makeStreak: int,
    role: 'K1'|'K2'|'NONE',
    teamId: string|null, league: 'COLLEGE'|'NFL'|null,
    contract: null | {type:'SCHOLARSHIP'|'WALKON'|'ROOKIE'|'UDFA'|'VET'|'TAG'|'MIN', years, yearIdx, aav, gtdPct, signingBonus, startYear, round?},
    nil: number,                         // $k per year (college)
    redshirt: bool, collegeSeasons: int, nflSeasons: int, seasonsAsStarter: int,
    tags: int                            // franchise tags applied (max 2)
  },
  leagues: {
    college: League, nfl: League         // both exist from creation; only the active one is simulated
  },
  season: SeasonState,                   // the active league's current season
  game: GameState|null,                  // in-progress user game (serialisable mid-game)
  pending: null
         | {kind:'EVENT', event: EventInstance}
         | {kind:'DECISION', decision: Decision}
         | {kind:'KICKS', session: KickSession},   // senior-season game / camp battle / combine / halftime-70 (a list of contexts the UI must play)
  history: {
    seasons: SeasonLine[],               // one per completed season
    awards: Award[], contracts: ContractRecord[], teams: TeamStint[],
    timeline: TimelineEntry[],           // {year, week, kind, text, impact 0..3, teamId}
    earnings: number,                    // $M total
    moments: Moment[]                    // top moments (kept ≤ 50, pruned by score)
  },
  stats: {
    season: KickerStats,                 // current season (user)
    career: KickerStats,                 // running career totals
    college: KickerStats, nfl: KickerStats,
    kicks: KickLogRow[],                 // capped at Tuning.save.kickLogCap (600); older kicks aggregated into `stats.*`
    splits: {byBucket: {...}, byWeather: {...}, byHash: {...}, byPressure: {...}}   // derived caches, rebuilt by Stats.rebuild
  },
  records: {
    college: {[key]: RecordEntry}, nfl: {[key]: RecordEntry},   // RecordEntry = {value, holder, holderTeam, year, isUser}
    personal: {[key]: number}
  },
  inbox: Message[],                      // capped 60
  headlines: Headline[],                 // {id, year, week, text, tag} capped 40
  recentHeadlineIds: string[], recentEventIds: string[],
  settings: Settings,                    // per-career copy of relevant settings (autoPat, playKickoffs, simSpeed) — UI-level settings live in rtg.settings
  flags: {[k]: any}                      // WALKON, UDFA, giveMe60, under55, ultimatum, farewell, ...
}

League = {
  kind: 'COLLEGE'|'NFL', year: int,
  teams: Team[],                         // Team per §2.5.1; college adds prestige, conf, rival; NFL adds conf/div; punter/punter2 slots exist (§2.14) but nothing fills them yet
  teamIndex: {[id]: int},                // cache; NOT persisted (Save.serialize strips it); rebuilt by Schema.reindex on load
  cap: number, vetMin: number, tagValue: number,      // NFL only
  seasonHistory: {year, championId, userTeamId, userLine: string}[],
  kickers: {[teamId]: AIKicker}          // K1 per team (K2 optional in Team.kicker2)
}

SeasonState = {
  league: 'COLLEGE'|'NFL', year: int,
  schedule: Game[],                      // Game = {id, week, homeId, awayId, kind:'REG'|'CCG'|'BOWL'|'PLAYOFF'|'WC'|'DIV'|'CONF'|'CHAMP', venue?, played, score?:{home,away}, ot?:bool, weather?, log?: string[] (user game only, pruned after season)}
  results: {[teamId]: {w, l, t, pf, pa, confW, confL, divW, divL, h2h: {[oppId]: [w,l,t]}, streak}},
  rankings: {[teamId]: {score, rank, prev}},   // college only
  standings: StandingRow[],              // recomputed weekly by Standings.compute
  playoffs: Bracket|null, bowls: BowlGame[]|null,
  goals: [{id, text, target, progress, met, xp}],
  trainingDone: bool, focus: 'POW'|'ACC'|'CON'|'CLU'|'KO'|'REST'|null,
  userGameId: string|null, weekGameDone: bool,
  kickerStats: {[teamId]: KickerStats},  // AI kickers this season (awards, records)
  punterStats: {[teamId]: KickerStats}   // every team's punting line this season, created on demand by Stats.recordAiPunt; the punter awards and records rank on it (§2.14)
}

GameState = {
  id, league, week, kind, homeId, awayId, userSide: 'home'|'away'|null,
  score: {home, away}, q: int (1–4, 5+ = OT periods), clock: int (seconds left in quarter), half: 1|2,
  possession: 'home'|'away', receivedFirst: 'home'|'away',
  timeouts: {home, away},
  ball: {ytg: int, down: int, toGo: int}|null,
  drive: {n, startYtg, plays, side},
  driveLog: DriveLogRow[],               // {q, clock, side, text, ytg, result} capped 80
  kicks: KickLogRow[],                   // both teams, this game
  pending: null | {type:'USER_KICK'|'USER_KICKOFF'|'USER_PUNT', ctx: KickContext},   // USER_PUNT only for a punter (§2.14.4)
  pendingKickoff: {side}|null,
  script: null | {ytg, down, toGo, plays, timeouts},          // end-of-game drill state
  ot: null | {period, mode:'NFL_REG'|'NFL_PLAYOFF'|'COLLEGE', firstPossession, bothPossessed, possessions: int},
  weather: {weather, tempF, wind:{speed, dir}, surface, altitude, dome},
  iced: bool, done: bool,
  stats: {home: TeamGameStats, away: TeamGameStats},          // {drives, td, fga, fgm, pat, patMade, punts, to}
  offRating: {home, away}, defRating: {home, away}             // with per-game noise applied
}

KickContext = {
  type: 'FG'|'PAT'|'KO'|'PUNT', league, distance, hash: -1|0|1, ballX,   // a PUNT context adds losYard (own yard 1–99) and toGoal (= distance = 100 − losYard)
  wind: {speed, dir}, weather, tempF, surface, altitude, dome,
  pressure, clutch, decisive, iced, playoff, rivalry, away, asTimeExpires, ot: bool,
  oppST, isUser: bool, difficulty,
  game: {q, clock, scoreFor, scoreAgainst, week, oppId, teamId},
  kicker: {attrs, form, mods, traits, foot, flags}             // snapshot for replay determinism
}
KickInput  = {power: 0..1.15, aim: -12..12, quality: 0..1, holdMs?: int}   // holdMs only from the flick input (hesitation rule)
KickResult = {
  outcome: 'GOOD'|'WIDE_L'|'WIDE_R'|'SHORT'|'BLOCKED'|'DOINK_IN'|'DOINK_OUT'|'XBAR_IN'|'XBAR_OUT',
  made, points, distance, xYd, hYd, launchDeg, errDeg, shank, contactDeg, windDriftYd, power, quality,
  flightTime, sub: ''|'DEAD_CENTER'|'SNEAKS'|'LINE_DRIVE', blockReturnTd: bool,
  tags: string[],                        // 'clutch','decisive','iced','gameWinner','tieForcer','asTimeExpires','playoff','fiftyPlus','auto'
  feedback: {timing: 'PURE'|'GOOD'|'FAIR'|'POOR', power: 'WEAK'|'SMOOTH'|'FULL'|'OVERSWING', missBy: {yd, side: 'L'|'R'|'SHORT'|null}, coachSaw: string}
}
PuntInput  = {power: 0..1.15, aim: -30..30 (deg; the scene's meter clamps at ±12), green?: bool}                       // §2.14; no quality
PuntResult = {
  type: 'PUNT', losYard, toGoal, power, aim, gross, net, hang, landing, lateral, oppStart (receiving side's own yard, 1–99; 100 = a TD),
  touchback, outOfBounds, fairCatch, downed (always false as built), returnYds, inside20, blocked, blockReturnTd, returnTd,
  grade: 'BLOCKED'|'SHANK'|'TOUCHBACK'|'POOR'|'OK'|'GOOD'|'BOOMING'|'COFFIN', outcome (= grade), made (not blocked, not a touchback, not a shank),
  auto, assisted, forced, tags: string[]   // 'auto' | 'assisted' | 'forced'; every number 2 dp
}
KickLogRow = {id, year, week, league, gameId, teamId, oppId, type, distance, hash, wind:{speed,dir}, weather, pressure, outcome, made, tags, input:{power, aim, quality}, auto: bool, rngState: uint32, q, clock, scoreFor, scoreAgainst,
              punt?: {losYard, gross, net, hang, oppStart, inside20, touchback, outOfBounds, fairCatch, returnYds, blocked}}   // PUNT rows: distance = round(gross), outcome = grade, made = !blocked && !touchback, quality 0, id 'p<year>w<week>n<seq>'
KickerStats = {fga, fgm, pat, patMade, pts, long, buckets:{'0-29':{a,m}, '30-39':{a,m}, '40-49':{a,m}, '50-59':{a,m}, '60+':{a,m}}, clutchA, clutchM, decisiveA, decisiveM, gameWinners, tieForcers, blocked, doinks, doinkIn, wideL, wideR, short, made50plus, consecutive, bestConsecutive, games, gamesStarted, koTouchbacks, koCount, wins, losses,
               punts, puntYds, puntNet, in20, tbs, puntLong, puntBlocked, fairCatch, retYds, hangSum, pinned}   // §2.14 punting keys (Schema.STAT_KEYS), zero on a kicker's block
SeasonLine = {year, league, teamId, teamName, age, ovr, role, stats: KickerStats, awards: string[], teamRecord: string, champion: bool, playoffResult: string, grade: 'A'..'F', salary}
Decision = { kind:'OFFERS_COLLEGE'|'REDSHIRT'|'DECLARE'|'TRANSFER'|'COMBINE_PLAN'|'UDFA'|'EXTENSION'|'FREE_AGENCY'|'TAG'|'RETIRE'|'OFFSEASON_PLAN'|'CUT_NOTICE'|'HOF'|'TRAINING_BLOCKS', payload: any, options: {id, label, detail}[] }
KickSession = { kind:'HS_GAME'|'CAMP'|'COMBINE_LADDER'|'COMBINE_ACC'|'COMBINE_KO'|'HALFTIME70'|'PRACTICE'|'TRYOUT', contexts: KickContext[], results: (KickResult|PuntResult)[], rival?: {name, results: KickResult[]}, idx: int,
                position?: 'K'|'P' }     // HS_GAME sessions carry position, gameIdx, week, opp, score, chances, log (§2.7.0); a punter's chances are PUNT contexts
EventInstance = { id, text (rendered), sender, choices: [{label, preview}], rolledWeek, rolledYear }
Modifier = { id, key, op:'mul'|'add', value, expires:{type:'week'|'game'|'season'|'never', at}, label, source }
Settings (rtg.settings, UI-owned; mirrored subset in state.settings) = { audio: bool, autoPat: 'off'|'safe'|'all', playKickoffs: bool, simSpeed: 1|2|4, colorblind: bool, highContrast: bool, reducedMotion: bool, fontScale: 1|1.25|1.5, leftFooted: bool, inputMode: 'flick'|'meter', playClockMult: 1|2, tooltips: bool }
```
Cross-save (UI-owned, `rtg.records`): `{ careers: [{seed, name, tier, hof, fgm, long, gw, seasons, finishedAt}], best: {[key]: {value, name}} }`.

### 3.5 Public API by module

Conventions: `state` = `CareerState`; `rng` = RNG instance; all functions are synchronous; **"RNG"** column says how many/which draws (so replays stay deterministic); **"Side effects"** = which parts of `state` are mutated. Anything not listed is private.

#### 3.5.1 `RTG.Util` (E1)
`clamp(x, lo, hi)`, `lerp(a, b, t)`, `round1(x)`, `sum(arr)`, `mean(arr)`, `indexBy(arr, key)`, `deepClone(obj)` (JSON), `fnv1a(str) → hex8`, `erf(x)`, `phi(z)` (normal CDF), `fmtMoney(m)`, `fmtPct(x)`, `fmtClock(sec)`, `ordinal(n)`, `template(str, vars)` (`{slot}` replacement), `pad(n, w)`, `assert(cond, msg)`. Pure.

#### 3.5.2 `RTG.RNG` (E1)
`create(seed:uint32) → rng`; `rng.next() → [0,1)` (mulberry32, 1 draw), `int(lo, hi)` inclusive (1 draw), `float(lo, hi)` (1), `chance(p)` (1), `gauss(mu=0, sd=1)` (exactly 2 draws, Box–Muller, no caching), `pick(arr)` (1), `weighted(items, weightFn|key)` (1), `shuffle(arr)` in place (n−1 draws), `state() → uint32`, `setState(s)`, `fork(label) → rng` (derives a child seed `fnv1a(state+label)` for isolated sub-simulations such as other teams' games; advances parent by 1 draw). Test vectors in `rng.test.js`.

#### 3.5.3 `RTG.Tuning` (E1) — object tree: `kick`, `punt` (§2.14: `aimMax`, `curve`, `distance`, `field`, `spread`, `search`, `block`, `ret`, `grade`, `assist`, `forced`, `ai`, `abstract`, `career`), `sim`, `progression`, `soft`, `contracts`, `draft`, `hs` (incl. `hs.punter`), `awards` (incl. `punterScore`), `hof` (incl. `hof.punter`), `records` (incl. `minPuntsSeasonNet`, `minPuntsCareerNet`), `difficulty[d]`, `save`, `events`. Frozen with `Object.freeze` deep. `RTG.debug.tune(path, value)` may replace values at runtime (debug only) by re-creating an unfrozen copy.

#### 3.5.4 `RTG.Schema` (E1)
- `createCareer(opts:{name, archetype, position?, difficulty, seed, hometown, look, foot}, rng) → CareerState` — builds both leagues (`Data.colleges` + generated NFL ratings), AI kickers, legends/records, player (§2.1.1), stage `HS`/phase `SEASON`, `flags.hs` = the senior season (`HS.season`), `pending = null` until the first game is opened. RNG: many draws (documented order: player attrs → college ratings → NFL ratings → kickers → legends).
- `createTeam(data, rng, league) → Team`; `createGameState(...)`; `createKickLogRow(ctx, result, meta)`; `emptyKickerStats()`.
- `validate(state) → {ok, errors: string[]}` — checks types/ranges/enums, referential integrity (teamIds exist), caps, no cycles. Cheap enough to run after every dispatch in debug mode (< 5 ms).
- `reindex(state)` — rebuilds non-persisted caches (`teamIndex`) after load.

#### 3.5.5 `RTG.Names` (E2)
`player(rng, {era}) → {first, last, full}`, `coach(rng)`, `reporter(rng) → {name, outlet}`, `legend(rng)`, `hometown(rng)`, `unique(rng, taken:Set, gen)`. RNG: 2–3 draws each.

#### 3.5.6 `RTG.Weather` (E1)
`forGame(rng, homeTeam, week, league, cap) → {weather, tempF, wind:{speed, dir}, surface, altitude, dome}` (draws: temp gauss 2, wind 1, dir 1, precip 1–2, fog 1); `perKick(rng, gameWeather) → wind` (2 draws); `monthFor(week, league)`.

#### 3.5.7 `RTG.Player` (E1)
- `create(rng, opts) → Player` (used by Schema).
- `ovr(attrs) → int`; `fameTier(fame) → 0..4`; `ageMult(age)`; `costToRaise(attr, value, age, focus) → int`.
- `spendXp(player, attr) → {ok, cost, newValue, reason?}` (respects POT; no rng).
- `applyTraining(state, focus) → {xp, moraleDelta}` — weekly focus; sets `season.focus`, `season.trainingDone`.
- `weeklyTick(state, rng)` — form update (2 draws), morale/trust/fans drift, slump flag, mods expiry (week), injury countdown.
- `updateJobSecurity(state, gameSummary)`; `applyKickMeters(state, ctx, result)` — trust/fans/morale/js/fame deltas for one kick.
- `ageTick(state, rng) → ChangeLog[]` (§2.1.3; 2 draws for growth picks).
- `rollInjury(state, rng) → Injury|null` (1–2 draws).
- `addMod(player, mod)`, `expireMods(player, {type, at})`, `modValue(player, key, op) → number` (product for `mul`, sum for `add`).
- `effectiveAttrs(player) → attrs` (form applied to ACC; traits; not mods).
- `attrLabels(position) → {POW, ACC, CON, CLU, KO: string}` short labels (`LEG PLACE OPER CLU HANG` for `'P'`); `attrNames(position)` the long names (§2.1.1, §2.14). Pure.

#### 3.5.8 `RTG.Kick` (E1)
- `buildContext(state, gs|null, situation) → KickContext` — `situation = {type, distance, hash?, decisive?, asTimeExpires?, playoff?, rivalry?, away?, oppST?, isUser, forSession?}`; computes pressure (§2.3.7) from `gs`/situation, snapshots kicker. RNG: hash draw (1) if `hash` undefined, per-kick wind via `Weather.perKick` (2).
- `model(ctx, attrs) → KickModel` (§2.3.9). Pure.
- `aiInput(rng, ctx, attrs, model) → KickInput` (draws: power gauss 2, aim gauss 2, quality gauss 2).
- `resolve(rng, ctx, attrs, input, opts?) → KickResult` (§2.3.11; opts.forced for debug).
- `resolveKickoff(rng, ctx, attrs, input|null) → KickoffResult` (§2.3.10).
- `pMakeAt(state, distance, opts) → number` — convenience for UI overlays and the coach.
- `feedbackFor(ctx, model, input, result) → KickResult.feedback` (pure).

#### 3.5.8b `RTG.Punt` (E1) — the punting engine (§2.14; `engine/punt.js`, after `Kick`)
- `buildContext(state, gs|null, situation, rng?) → KickContext` (type `'PUNT'`) — `situation = {losYard (own yard, default 30), hash?, isUser, forSession?, calm?, wind?, pressure?, kicker?|attrs?, side?, teamId?, oppId?, league?, game?}`; runs `Kick.buildContext` with `toGoal = 100 − losYard` as the distance, then rolls the hash itself. RNG: `Kick.buildContext`'s wind 2 (+ Legend gusts 2) + hash 1 when `hash` is not given.
- `model(ctx, attrs?, {power?}) → PuntModel` `{losYard, toGoal, pin, maxDist, maxHang, want, pNeed, greenBand, powerMax, windAlongYds, tbFrom, distance, hang, power, pBlock}` (§2.14.2). Pure.
- `pBlock(ctx, attrs?) → number`; `inGreen(power, model) → bool` (the engine's own check of the band, §2.14.3).
- `aiInput(rng, ctx, attrs?, model?) → {power, aim}` (draws: power gauss 2 · aim gauss 2). Never sets `green`.
- `resolve(rng, ctx, attrs|null, input|null, opts?) → PuntResult` — `input` null → `aiInput` and `auto: true`; `opts.forced` a `GRADES` name (0 draws); `opts.noReturn` forces the fair catch. Draw order in §2.14.3.
- `feedbackFor(result, ctx, model?) → {title, detail, coach}`; `GRADES` (8 names, in order), `GRADE_TEXT` (banner text by grade).

#### 3.5.9 `RTG.Schedule` (E2)
- `college(league, year, rng) → Game[]` (§2.6.1); `nfl(league, year, prevStandings, rng) → Game[]` (§2.6.2). RNG: shuffles/restarts only; deterministic for a seed.
- `weeksFor(league) → {reg, post, total}`; `gamesInWeek(schedule, week)`.

#### 3.5.10 `RTG.Standings` (E2)
- `compute(season, league) → StandingRow[]` (with tiebreaks; uses `rng.fork('tiebreak')` for coins — pass rng).
- `rankings(season, league, prev) → {[teamId]: {score, rank, prev}}` (college).
- `conferenceChampionshipGames(season, league) → Game[]`; `playoffField(season, league, rng) → Bracket`; `bowls(season, league) → BowlGame[]`; `nflPlayoffField(season, league) → Bracket`; `advanceBracket(bracket, results)`; `draftOrder(season, league) → teamId[]`.

#### 3.5.11 `RTG.Sim` (E2)
- `startGame(state, rng, gameRef:{league, gameId}) → GameState` — applies weather (`Weather.forGame`), per-game rating noise (4 draws), coin toss (1). Sets `state.game` when the user's team plays.
- `step(gs, state, rng) → SimEvent` — one drive / one script play / one kickoff. RNG: outcome 1, time 2, stall spot 2, AI kick via `Kick.resolve`, etc. (exact order documented in code comments; `sim.test.js` asserts replay determinism).
- `simToNextUserKick(gs, state, rng) → SimEvent` — loops `step`.
- `applyKick(gs, state, rng, result) → void` — scores, logs, clears `pending`, queues kickoff.
- `applyKickoff(gs, state, rng, koResult)`.
- `applyPunt(gs, state, rng, puntResult) → SimEvent` — requires `pending.type === 'USER_PUNT'`; logs, records (`Stats.recordPunt`), hands the ball over at `100 − oppStart` or scores the return TD (§2.14.4).
- `autoResolvePending(gs, state, rng) → KickResult|KickoffResult|PuntResult` — uses the position's AI rule (`Kick.aiInput` / `Punt.aiInput`); tags `auto`.
- `finishGame(gs, state, rng) → GameSummary` — `{gameId, score, won, userLine: {fga, fgm, pat, patMade, long, gw}, grade, xp: {items[], total}, meters: {morale, trust, fans, js, fame}, headline, kicks: KickLogRow[], drives}`; writes `season.schedule[game]`, `season.results`, `stats.*` (via `Stats.recordGame`), meters (via `Player`), records check; sets `state.game = null`, `season.weekGameDone = true`.
- `simAiGame(state, rng, gameRef) → {score, kicks}` — full game between two AI teams (used by `Season.simOtherGames`), records AI kicker stats into `season.kickerStats`.
- `driveLogLine(gs, event) → string` (pure text helper; UI may use).

**SimEvent** = `{ type: 'DRIVE'|'SCORE'|'AI_KICK'|'USER_KICK'|'USER_PUNT'|'AI_PUNT'|'USER_KICKOFF'|'ICE_TIMEOUT'|'END_QUARTER'|'END_HALF'|'OT_START'|'END_GAME'|'END', text: string, side?: 'home'|'away', kick?: KickResult, punt?: PuntResult, ctx?: KickContext, result?: 'PUNT'|…, gs: GameState }`. A settled punt is a `DRIVE` event with `result: 'PUNT'`, `punt` and `ctx` (both drive paths pass `eventType: 'DRIVE'`; `AI_PUNT` is only the default when no type is given). `USER_PUNT` carries the pending `ctx`. After `END_GAME`, the caller must call `finishGame`.

#### 3.5.12 `RTG.Stats` (E3)
- `recordKick(state, ctx, result, meta) → KickLogRow` — appends to `stats.kicks` (cap/aggregate), updates season/career/league `KickerStats` (buckets, streaks), `player.missStreak/makeStreak`.
- `recordGame(state, summary)`; `recordAiKick(season, teamId, ctx, result)`.
- Punting (§2.14.5): `applyPunt(block, ctx, result) → block` folds one punt into a KickerStats block; `recordPunt(state, ctx, result, meta) → KickLogRow` applies it to season / career / league blocks and logs a `PUNT` row (splits included); `recordAiPunt(season, teamId, ctx, result)` onto `season.punterStats[teamId]`; `puntLine(block) → {punts, gross, net, hang, in20, in20Pct, tbs, long, blocked, retYds}` with the averages already derived over live punts — use it rather than dividing by hand.
- `finishSeason(state) → SeasonLine`; `rebuildSplits(state)`; `bucketOf(distance)`.
- `checkRecords(state, ctx?, result?) → Milestone[]` — updates `records.*` when beaten (isUser), returns milestone/headline payloads.
- `topMoments(state, n) → Moment[]`; `grade(summary) → 'A'..'F'` (`A: 100 % with ≥ 2 FGA or GW; B ≥ 85 %; C ≥ 70 %; D ≥ 50 %; F otherwise; decisive miss caps at D`).
- `seasonFgPct(stats)`, `careerLine(state)`, `compareToLegends(state)`.

#### 3.5.13 `RTG.Awards` (E3)
- `compute(state, rng) → Award[]` — evaluates §2.8 across `season.kickerStats` + user (a punter: the punter slate across `season.punterStats` + user); appends to `history.awards`, applies XP/fame; returns the list for the awards screen. RNG: none except tie-breaks (1 draw; the tie test also compares `puntNet`).
- `kickerScore(stats, ignoreMin?) → number|null`; `punterScore(stats, ignoreMin?) → number|null` (§2.8; null under 20 live punts).
- `weekly(state) → Award|null` (ST Player of the Week).
- `hofScore(state) → {score, verdict, tier, breakdown[]}` — the kicker rows, or `hofRowsPunter` when `player.position === 'P'` (§2.7.9).
- `seasonGoals(state, rng) → Goal[]` (3 goals at PRE); `checkGoals(state)`.

#### 3.5.14 `RTG.Events` (E3)
- `roll(state, rng, slot:'week'|'offseason') → EventInstance|null` — sets `state.pending = {kind:'EVENT', ...}`. RNG: 1 (fire) + 1 (weighted pick).
- `apply(state, rng, choiceIdx) → EventOutcome {effects, headline, actions[]}` — applies effects, branches (1 draw each), clears pending, returns `actions` for `Career.handleActions`.
- `force(state, rng, eventId) → EventInstance` (debug).
- `headline(state, rng, tag, vars) → Headline` — picks a template (1 draw), pushes to `headlines`, ring-buffer update.
- `message(state, kind, vars) → Message` — inbox note from templates; `markRead(state, id)`.
- `renderText(template, state, vars)`.

#### 3.5.15 `RTG.Contracts` (E3)
- `marketValue(state) → {aav, gtdPct, years}`; `rookieDeal(round) → Contract`; `tagValue(league) → number`.
- `teamSatisfaction(state) → number`; `extensionOffer(state, rng) → Decision|null` (2 draws); `generateOffers(state, rng, mode:'FA'|'UDFA'|'MIN') → Decision` (weighted picks ≤ 6 draws); `counter(state, rng, decision) → {accepted, offer|null}` (1 draw); `applyTag(state, rng) → bool` (1 draw); `cutCheck(state, rng) → {cut, reason}|null`; `sign(state, offer)` (sets `player.contract`, `history.contracts`, `Career.changeTeam` if needed); `payoutSeason(state)` (earnings).
- `teamsNeedingK(league) → Team[]` (need rule §2.7.6).

#### 3.5.16 `RTG.Draft` (E3)
- `combineSession(state, rng) → KickSession` (contexts for the ladder/accuracy/KO); `scoreCombine(session) → combineScore`.
- `draftValue(state) → number`; `projection(state) → {round, low, high}`.
- `run(state, rng) → DraftResult {round, pick, teamId, picksTicker: [{round, pick, teamId, pos, name}], firstRoundShock: bool} | {undrafted: true, invites: Decision}` (draws: shock 1, slot 1, ticker names n).
- `tryout(state, rng) → KickSession` (undrafted minicamp).

#### 3.5.17 `RTG.Season` (E2)
- `start(state, rng)` — builds schedule for the active league, resets `season`, sets `phase='PRE'`, `week=0`, goals (via Awards), camp battle decision if required (via Career).
- `beginRegular(state, rng)` — `phase='REG'`, `week=1`.
- `userGameRef(state) → gameRef|null` (bye → null).
- `simOtherGames(state, rng)` — every other game this week via `Sim.simAiGame` with `rng.fork('wk'+week+':'+gameId)`; writes results/standings/rankings/kicker stats.
- `endWeek(state, rng) → WeekReport {headlines, messages, event: bool, injuries, bench: bool, milestones, phaseChange}` — order: `simOtherGames` (if not yet) → `Standings.compute/rankings` → `Player.weeklyTick` → `Player.updateJobSecurity` → bench/cut checks → `Awards.weekly` → `Stats.checkRecords` → messages → `Events.roll('week')` → `week++`; if past the last regular week → `startPostseason`.
- `startPostseason(state, rng)`, `postseasonWeek(state, rng)` — builds CCG/bowls/playoffs per §2.6; user game refs come from the bracket; eliminated/without-bowl users skip to `AWARDS`.
- `finishSeason(state, rng) → SeasonLine` — `phase='AWARDS'`, awards via `Awards.compute`, `Stats.finishSeason`, league history, AI kicker season tick.
- `offseason(state, rng)` — `phase='OFF'`; builds the wizard decision chain via `Career.offseasonChain`.
- `advanceYear(state, rng)` — age +1, `Player.ageTick`, team rating drift, AI kicker aging/retirements/rookies, contracts tick, cap growth, `year++`, then `start`.

#### 3.5.18 `RTG.Career` (E3)
- `starsFor(ovr, rating) → 2..5`; `afterSessionKick(state, rng, sess, idx, result)` — the live-scoreboard hook `sessionKick` calls (senior-season games only).
- `generateCollegeOffers(state, rng, mode:'RECRUIT'|'TRANSFER') → Decision` (≤ 8 draws).
- `decide(state, rng, decision:{kind, optionId, extra?}) → DecisionOutcome {next: 'PENDING'|'PHASE', headline?, timeline?}` — the single entry point for every `Decision` kind (offers, redshirt, declare/stay, transfer, combine plan, UDFA pick, extension accept/counter/decline, FA pick/wait/hometown, tag reaction, retire choices, offseason plan, training blocks, HOF ack). Delegates to Contracts/Draft/Season.
- `campBattle(state, rng) → KickSession`; `finishSession(state, rng) → SessionOutcome` — resolves any `KickSession` (senior-season game → `HS.finishGame`; camp → K1/K2; combine → combineScore; halftime → fame; tryout → contract).
- `offseasonChain(state, rng)` — orders the offseason decisions: `BODY_CHECK`(info) → `TRAINING_BLOCKS` → college: `REDSHIRT?`/`TRANSFER?`/`DECLARE?`; NFL: `CUT_NOTICE?` → `EXTENSION?`/`TAG?`/`FREE_AGENCY?` → `RETIRE?` → offseason events (2) → `advanceYear`.
- `changeTeam(state, rng, teamId, {trust, js, reason})` — moves the player, resets meters, records `history.teams`, headline.
- `handleActions(state, rng, actions[])` — executes event `action`s (TRANSFER, TRADE, HOLDOUT, CAMP_BATTLE, CHANGE_TEAM, SKIP_GAME, INJURY, RETIRE).
- `enterDraft(state, rng)` (`stage='DRAFT'`, `phase='DECLARE'|'COMBINE'`), `runDraft(state, rng)`, `enterNfl(state, rng, teamId, contract)`.
- `retire(state, rng) → LegacyReport {tier, hof, line, moments, records, docTitle, timeline}`; sets `stage='RETIRED'`, `phase='LEGACY'`.
- `stageInfo(state) → {act, label}`.

#### 3.5.19 `RTG.Save` (E3)
- `serialize(state, rng, now) → SaveBlob` `{v, app: RTG.VERSION, savedAt: now, seed, rngState, playtimeSec, checksum: fnv1a(JSON(career)), career: state}` (prunes non-persisted caches).
- `deserialize(blob) → {state, rngState, migrated: bool, warnings[]}` — verifies checksum (mismatch → `{error:'CHECKSUM'}`), runs `migrate`, `Schema.reindex`, `Schema.validate` (errors → `{error:'INVALID', errors}`).
- `migrate(blob) → blob` — applies `Save.migrations[v]` sequentially up to `RTG.SAVE_VERSION`; `blob.v > SAVE_VERSION` → `{error:'NEWER'}`.
- `exportString(blob) → base64`, `importString(str) → blob`.
- `slotSummary(blob) → {name, team, year, stage, ovr, savedAt}`.
- Storage adapter contract (UI): `{ getItem(key) → string|null, setItem(key, string), removeItem(key), keys() → string[] }`; keys `rtg.save.1|2|3`, `rtg.save.auto`, `rtg.settings`, `rtg.records`.

#### 3.5.20 `RTG.Engine` facade (E3, INT reviews) — every UI dispatch goes through one of these; each returns a plain result and mutates `state`.

| Function | Returns | Notes |
|---|---|---|
| `newCareer(opts, now)` | `{state, rng}` | seed default `fnv1a(now)`; creates rng; `opts.position` `'K'` (default) or `'P'` (§2.14) |
| `train(state, rng, focus)` | `{xp, moraleDelta}` | once per week |
| `spendXp(state, attr)` | `{ok, cost}` | |
| `startUserGame(state, rng)` | `GameState` | error if `weekGameDone` |
| `simStep(state, rng)` / `simToKick(state, rng)` | `SimEvent` | on `state.game` |
| `applyUserKick(state, rng, input)` | `KickResult` | resolves via `Kick.resolve` with `state.game.pending.ctx`, then `Sim.applyKick`, `Stats.recordKick` |
| `autoKick(state, rng)` | `KickResult` \| `KickoffResult` \| `PuntResult` | auto-PAT / sim; resolves whatever is pending (`Sim.autoResolvePending`) |
| `applyUserKickoff(state, rng, input|null)` | `KickoffResult` | |
| `applyUserPunt(state, rng, input|null, opts?)` | `PuntResult` | requires `game.pending.type === 'USER_PUNT'` (else throws and names the pending type); `input` `{power, aim, green?}` or null for the AI rule; `opts.forced` a `Punt.GRADES` name (0 draws); then `Sim.applyPunt` (§2.14.4) |
| `finishUserGame(state, rng)` | `GameSummary` | |
| `endWeek(state, rng)` | `WeekReport` | requires game done or bye; requires no pending |
| `chooseEvent(state, rng, idx)` | `EventOutcome` | |
| `sessionKick(state, rng, input)` | `{result, done, outcome?}` | for `pending.kind==='KICKS'`; a `PUNT` context resolves through `Punt.resolve` (a forced kick word is mapped onto a grade: GOOD → GOOD, BLOCKED → BLOCKED, SHORT → SHANK, else POOR); when the last kick is played, calls `Career.finishSession` |
| `decide(state, rng, {kind, optionId, extra})` | `DecisionOutcome` | |
| `nextPhase(state, rng)` | `{phase, stage}` | drives PRE→REG, AWARDS→OFF, OFF→next year, DRAFT sub-phases; idempotent when a `pending` exists (returns current) |
| `autoPlayGame(state, rng)` | `GameSummary` | start (if needed) + auto kicks + finish |
| `autoPlayWeek(state, rng, {autoChoices: true})` | `WeekReport` | train (auto focus), play, endWeek, auto-resolve event (choice 0) |
| `autoPlaySeason(state, rng, opts)` | `SeasonLine` | loops weeks, postseason, awards; stops at OFF |
| `autoPlayOffseason(state, rng, opts)` | `{decisions[]}` | default choices (accept best offer, stay in college until senior unless projected round ≤ 4, retire when forced) |
| `autoPlayCareer(state, rng, {untilStage, maxYears})` | `state` | used by tests and `RTG.debug` |
| `save(state, rng, now)` / `load(blob)` | blob / `{state, rng}` | wraps `Save` |

### 3.6 Career flow / state machine (screens are UI names; see §4)

| Stage.Phase | `pending` | Screen | User actions → engine call | Next |
|---|---|---|---|---|
| (none) | — | `title` | New / Continue / Load / Settings | `newcareer` / load |
| (none) | — | `newcareer` | name, archetype, look, difficulty, seed → `Engine.newCareer` | `HS.SEASON` |
| HS.SEASON | — | `hsseason` | PLAY WEEK n → `Engine.hsStartGame` | `HS.SEASON` (pending KICKS `HS_GAME`) |
| HS.SEASON | KICKS(HS_GAME) | `hsgame` | 3–5 kicks (a punter: 3–6 punts) → `sessionKick` | `HS.SEASON` (games 1–4) · `HS.OFFERS` after the fifth |
| HS.OFFERS | DECISION | `offers` | pick → `decide` | `COLLEGE.PRE` |
| COLLEGE/NFL.PRE | DECISION(CAMP)? / KICKS(camp) | `hub` (pre card) → `campbattle` | `sessionKick`, then `nextPhase` | `.REG` week 1 |
| .REG (week w) | none | `hub` | `train`, `spendXp`, view screens; Play → `startUserGame` | `game` |
| .REG | none, `state.game` | `game` | `simToKick` / `simStep`; on `USER_KICK` or `USER_PUNT` → `kick` | `kick` |
| .REG | `game.pending` | `kick` | flick/meter → `applyUserKick` (a punter: aim-then-hold → `applyUserPunt`; or `autoKick`) | back to `game`; on `END_GAME` → `finishUserGame` → `postgame` |
| .REG | none | `postgame` | Continue → `endWeek` | `hub` (next week) or EVENT |
| .REG | EVENT | `inbox` (event modal) | `chooseEvent` | `hub` |
| .REG bye week | none | `hub` (bye card: Rest/Grind) | `train`, `endWeek` | next week |
| .REG last week | — | (endWeek) | — | `.POST` or `.AWARDS` |
| .POST | none / game | `hub` (bracket card) → `game` … | same as REG per postseason game | `.AWARDS` |
| .AWARDS | none | `awards` | Continue → `nextPhase` | `.OFF` |
| .OFF | DECISION chain | `offseason` wizard (body check, blocks, decisions), `contract`, `draft` decisions | `decide` per step; `nextPhase` at the end | COLLEGE: next `.PRE` or `DRAFT.DECLARE`→…; NFL: next `.PRE`, or `RETIRED.LEGACY` |
| DRAFT.DECLARE | DECISION(DECLARE) | `offseason` (declare card) | Declare/Stay → `decide` | Stay → `COLLEGE.PRE`; Declare → `DRAFT.COMBINE` |
| DRAFT.COMBINE | DECISION(COMBINE_PLAN) → KICKS ×3 | `combine` | `decide`, `sessionKick` | `DRAFT.DRAFT` |
| DRAFT.DRAFT | none → DECISION(UDFA)? | `draft` | Continue → `Career.runDraft` (via `nextPhase`); UDFA pick → `decide` | `NFL.PRE` |
| NFL cut mid-season | DECISION(FREE_AGENCY/CUT_NOTICE) | `contract` | `decide` | `NFL.REG` (new team) or practice-squad wait |
| RETIRED.LEGACY | DECISION(HOF) | `legacy` | ack → records board; New career | `title` |

Invariant: **the UI only ever calls `Engine.*`**, and after any call it re-renders from `state`. If `state.pending` is non-null, the router shows the screen for that pending kind regardless of where the user is (modal for EVENT).

### 3.7 Save format, versioning, migration

```json
{ "v": 1, "app": "1.0.0", "savedAt": 1757000000000, "seed": 123456789, "rngState": 987654321,
  "playtimeSec": 5400, "checksum": "a1b2c3d4", "career": { …CareerState… } }
```
- `v` = save schema version = `RTG.SAVE_VERSION`. Bump when `CareerState` changes incompatibly; add `Save.migrations[oldV] = blob => blob` (with a fixture `test/fixtures/save_v<oldV>.json`). A save newer than the app → refuse with "This save is from a newer version".
- The punter path (D24) changed the shape without a version bump: `Save.migrate` fills `player.position = 'K'`, and `Stats` fills the zero punting keys on any KickerStats block it touches (`ensureStats`), so pre-punter saves load as kickers.
- `checksum` = `fnv1a(JSON.stringify(career))`; mismatch → refuse to load (offers export for support).
- Keys: `rtg.save.1|2|3`, `rtg.save.auto`, `rtg.settings`, `rtg.records`. Autosave after every `finishUserGame`, `endWeek`, `chooseEvent`, `decide`, `nextPhase`; manual save any time (not mid-kick).
- Size: `stats.kicks` capped at 600 rows (older rows are aggregated; season/career totals are always exact), `driveLog` ≤ 80 rows and only for the in-progress game, `season.schedule[].log` only for user games of the current season, `inbox` ≤ 60, `headlines` ≤ 40, `history.moments` ≤ 50. Target < 400 KB per slot.
- Export/Import: base64 of the blob JSON via the Saves screen (textarea copy/paste), because file:// cannot download.
- Load path: `Storage.getItem` → `Save.deserialize` → `Store.replace(state, rng)` → router to the screen implied by stage/phase/pending.

### 3.8 Debug API (`kicker/js/debug.js`, always loaded; `?debug=1` mounts the panel)

```js
RTG.debug.getState() → CareerState (deep clone)         RTG.debug.setState(state) → void (validate, replace, re-render)
RTG.debug.newCareer({seed, difficulty, archetype, name}) → state
RTG.debug.jumpTo({stage, phase?, year?, week?})         // fast-forwards with Engine.autoPlay* until the target; throws if unreachable in 30 years
RTG.debug.forceKick({outcome}|{power, aim, quality})    // applies to the current pending kick (game or session) and returns KickResult
                                                        // on a pending punt (USER_PUNT or a PUNT session context) `outcome` may be a Punt.GRADES name; kick words map GOOD→GOOD, BLOCKED→BLOCKED, SHORT→SHANK, else POOR; returns the PuntResult
RTG.debug.autoKick(bool)                                // UI resolves all user kicks via autoKick without input
RTG.debug.simGame() → GameSummary   simWeek() → WeekReport   simSeason() → SeasonLine   simCareer({untilStage:'RETIRED'|…, maxYears}) → state
RTG.debug.setAttrs({POW:90,…})  setSoft({trust:90, js:80, fame:600})  addXp(n)  addMod(mod)
RTG.debug.triggerEvent(id) → EventInstance   choose(idx)   decide({kind, optionId})
RTG.debug.screen() → current screen id   go(screenId, params)   pending() → state.pending
RTG.debug.montecarlo({attrs, distance, n, ctxOverrides}) → {pct, model: Kick.model(...)}
RTG.debug.balance(n) → table of FG% by bucket for the current player (AI input)
RTG.debug.perf() → {fps, frameP95Ms, heapMB|null, rafActive: bool, listeners: int}
RTG.debug.save(slot) load(slot) clearStorage() exportString() importString(s)
RTG.debug.seed() → seed   rngState() → uint32   tune(path, value)
RTG.debug.version → RTG.VERSION   saveVersion → RTG.SAVE_VERSION
```
All debug functions are synchronous and re-render through the store. Playwright reads via `page.evaluate(() => RTG.debug.getState())`.

### 3.9 Performance & memory rules

- Virtual canvas 192×320 (portrait) / 320×192 (landscape) scaled by an integer factor (§4.2); `imageSmoothingEnabled = false`; `devicePixelRatio` capped at 2.
- The RAF loop runs only while a canvas scene is mounted (`Canvas.start()/stop()`); screens' `destroy()` must stop it. Kick scene ≤ 200 draw calls/frame; no allocations in the frame loop (pooled vectors, pre-rendered sprites on offscreen canvases, no per-frame `fillText` for static HUD — HUD is DOM).
- Store listeners: `subscribe` returns `unsubscribe`; screens unsubscribe in `destroy`. `RTG.debug.perf().listeners` must return to baseline after 500 mount/unmount cycles (Playwright test).
- Engine budgets: full auto season < 250 ms; full career < 4 s (Node). `Season.simOtherGames` uses `rng.fork` per game so the user's game replay is unaffected by AI game count.
- Text caches (`stats.splits`) are rebuilt lazily and invalidated on `recordKick`.


---

## 4. UI specification

### 4.1 Visual language

**Palette** (CSS custom properties in `css/style.css`; the canvas reads the same values from `RTG.UI.Palette`):

| Token | Hex | Use |
|---|---|---|
| `--navy` | `#1b1f3a` | page background |
| `--navy-2` | `#262b4d` | panels |
| `--cream` | `#f4e9d0` | primary text |
| `--ink` | `#101226` | text on light chips |
| `--grass` | `#3a8c3f` | field |
| `--grass-2` | `#2e7233` | field stripes |
| `--chalk` | `#f2f2e6` | yard lines, uprights |
| `--gold` | `#f6c445` | accent, your stats, records |
| `--red` | `#d8433a` | bad / miss |
| `--sky` | `#7fc7ff` | good / links / focus ring |
| `--mint` | `#4dbb63` | positive deltas |
| `--grey` | `#8a8f9e` | muted |
| `--team-1` / `--team-2` | from data | team tints (set on the root when the team changes) |
| `--dusk` | `#5b3a6e` | sky gradient stop for evening games (flat bands, no gradients) |

Colorblind variant (`body.cb`) swaps `--red → #e26100`, `--mint → #00b386`, `--gold → #f0e442`, `--sky → #56b4e9` — Okabe–Ito, with vermillion and bluish green taken one tint up so every accent clears WCAG AA (≥ 4.5:1) as text on `--navy`. High-contrast (`body.hc`) uses black, white and four accents separated in luminance as well as hue: `--gold #ff0` (lum .93), `--mint #0f0` (.72), `--sky #66ccff` (.53), `--red #ff5c5c` (.30), so the power bar's target and overswing zones stay distinct in greyscale too; anything painted **on** an accent uses `--ink`. `js/ui/palette.js` holds the same hex values for the canvas. Result banners always carry text + icon, never colour alone.

**Type:** `font-family: "Press Start 2P", "Courier New", Courier, monospace;` loaded via `<link rel="preconnect">` + Google Fonts CSS with `font-display: swap`; base size 10 px phone / 12 px desktop; `--font-scale` 1 / 1.25 / 1.5. Line-height 1.6. Numbers use `font-variant-numeric: tabular-nums` (falls back gracefully).

**Idiom:** 8-px grid; 2-px borders; no gradients; chunky buttons with a 3-px hard drop shadow that "presses" (translate 2px, shadow 1px) on `:active`; 5-block pixel bars for meters; pennant/shield crests generated procedurally (3 shapes × 2 colours seeded by team id).

### 4.2 Pixel-art approach

- `RTG.UI.Canvas.create(container, {w:192, h:320})`: virtual resolution `192×320` (portrait) or `320×192` (landscape; chosen on resize by aspect). The backing canvas is `virtual × scale × dpr` where `scale = floor(min(containerW / w, containerH / h))` (min 1) and `dpr = min(devicePixelRatio, 2)`; CSS size = `virtual × scale`. Context: `imageSmoothingEnabled = false`, `image-rendering: pixelated`. All drawing is in virtual pixels via `ctx.setTransform(scale·dpr, 0, 0, scale·dpr, 0, 0)`.
- `RTG.UI.Sprites`: pixel strings (`'..XX..'` rows with a per-sprite palette map) → offscreen canvases at boot. Required sprites: kicker (idle, lean ×3 by pull depth, approach ×3, plant, swing, follow-through), holder, snapper, ball (3 sizes + squash frame), uprights (3 scales), crowd row (2 frames × 2 tints), ref (arms up / arms crossed / wave-off), wind sock (4 frames), rain/snow particle, banner frame, crest shapes, boot icon, trophy, envelope, pennant.
- Only the kick scene, the senior-season/camp/combine wrappers, and the title screen goalposts are canvas. Everything else is DOM (fast, accessible, scrollable).

### 4.3 Layout & responsive rules

- Root: `#app` grid. **Phone portrait** (< 700 px wide): single column, sticky top bar (team crest, record, week, XP, $), content, bottom tab bar (HOME · TEAM · TRAIN · STATS · MORE), 44-px minimum touch targets, safe-area insets.
- **Phone landscape** (height < 500): canvas scenes use 320×192; panels become horizontal tabs; top bar collapses to icons.
- **Desktop / tablet** (≥ 900 px): centred column max 520 px + right rail (max 320 px) with the news ticker, meters, and quick stats; left rail nav replaces the bottom tabs. Content max-width 720 px.
- The page never scrolls horizontally (`overflow-x: hidden` on `#app`; tables scroll inside `.scroll-x`).
- Orientation change: `Canvas.resize()` on `resize`/`orientationchange`, debounced 100 ms; the kick scene re-lays out its HUD.

### 4.4 Store, router, components (E5)

- `RTG.UI.Store`: `{ state, rng, dispatch(fnName, ...args) → result, subscribe(fn) → unsubscribe, replace(state, rng), settings, save(slot), autosave() }`. `dispatch` calls `RTG.Engine[fnName](state, rng, ...args)`, writes `state.rngState = rng.state()`, runs `Schema.validate` when `debug` is on (throws on error), notifies subscribers with `{fnName, result}`, and autosaves after the functions listed in §3.7. `store.uiRng` for cosmetics.
- `RTG.UI.Router`: `register(id, factory)`, `go(id, params)`, `back()`, `current()`; keeps a stack ≤ 8; screens are `{el, destroy, onResize?, onKey?}`. `Router.sync()` picks the screen from `state` (§3.6) when `pending` changes.
- `RTG.UI.C` components: `button({label, kind, onClick, icon})`, `meter({label, value, blocks:5})`, `card`, `tabs`, `list`, `modal`, `toast(text, kind)`, `deltaChip(value)`, `crest(teamId, size)`, `kv(rows)`, `table(cols, rows)`, `sparkline(canvas, values)`, `tooltip(el, text)` (long-press 400 ms on touch, hover on desktop, `aria-describedby`).

### 4.5 Screens

Each entry: layout · components · engine calls.

| Screen | Layout & components | Engine / store calls |
|---|---|---|
| **title** | Canvas strip (goalposts at dusk, ball wobble via uiRng); logo; buttons NEW CAREER · CONTINUE (last autosave summary) · LOAD · SETTINGS; ticker of `rtg.records` best careers; version/seed in the corner | `Storage.getItem('rtg.save.auto')` summary via `Save.slotSummary` |
| **newcareer** | Name input + "Generate" dice (`Names.player(uiRng)`), position cards ×2 (KICKER / PUNTER, §2.14; the archetype bars relabel through `Player.attrLabels`), archetype cards ×4 (attr preview bars), look swatches (skin 4 × hair 6 × boot 4), foot, hometown dropdown (60), difficulty pills ×4, seed field (editable, "Random") | `Engine.newCareer(opts, Date.now())` → `Store.replace` |
| **hsseason** | The senior season between games: school header, season line, the five-game schedule with each night's kicking line, and the recruiting board (interest bar, tier, last move). A punter's card reads PUNTS · NET AVERAGE · INSIDE THE 20 · PINNED IT and each night's line `n punts · net · inside the 20 · TB · pinned it` | PLAY WEEK n → `Engine.hsStartGame` |
| **hsgame** | KickView full-screen with a live scoreboard (your school, the opponent, quarter, running score) and a slot strip of the night's chances; the tutorial overlay runs on the first game only. Punt slots read `OWN n`; a resolved punt shows ✗ (blocked), TB, ★ (inside the 20) or its net yards | `Engine.sessionKick`; on done → `Router.sync` |
| **offers** | Card carousel (swipe/arrows): crest, prestige ★, depth pill (OPEN/VET/STAR), coach line, NIL, climate icon, "near home" tag; COMPARE toggle → 2-column table | `Engine.decide({kind:'OFFERS_COLLEGE', optionId})` |
| **hub** | Top: team bar (crest, record, rank/seed). Week Card: opponent crest, venue, forecast (icon + °F + wind mph/dir), spread text, 2 storylines (headlines), meters row (Trust, Fans, Morale, Job Security as 5-block bars; Fame tier chip). Inbox preview (3 newest). Buttons: TRAIN (if not done), PLAY GAME / SIM GAME, SIM TO END OF SEASON (confirm). Bye week: "Rest or Grind" card. PRE: goals card + camp-battle button. POST: bracket card. | `Season.userGameRef` (read), `Engine.train`, `Engine.startUserGame`, `Engine.autoPlayGame`, `Engine.endWeek`, `Engine.autoPlaySeason` |
| **inbox** | Chat-bubble list with sender avatars (coach/agent/GM/press/fan/family); events open as a modal with 2–3 big buttons; effect preview per difficulty (numbers / icons / hidden); consequence toast | `Engine.chooseEvent(idx)`, `Events.markRead` |
| **training** | 6 focus tiles (POW/ACC/CON/CLU/KO/REST) with projected XP and the 25 % discount tag; attribute panel: 5 rows with bars, current/POT hint (agent tier), cost, "+" button, XP balance, AUTO button; traits list; "Practice" button (M4) | `Engine.train(focus)`, `Engine.spendXp(attr)`, `Player.costToRaise` (read) |
| **game** | Scoreboard (DOM "LED": crests, score, Q, clock, possession dot); drive log (monospace lines coloured by side, auto-scroll, `aria-live=polite`); speed pills ×1/×2/×4; buttons NEXT KICK ▶ (default) / WATCH / SIM REST; kick history chip strip (this game). On `USER_KICK` → `Router.go('kick')`; on `USER_PUNT` → drive-log line `YOUR PUNT: …` then `Router.go('kick')` (SIM REST resolves it through `autoKick`); on `USER_KICKOFF` → KO timing bar inline; on `ICE_TIMEOUT` → "ICED!" toast then kick; on `END_GAME` → `finishUserGame` → postgame | `Engine.simToKick`, `Engine.simStep` (watch mode timer 400 ms/drive ÷ speed; uses `setTimeout`, cancelled in `destroy`), `Engine.autoKick` (auto-PAT rule), `Engine.applyUserKickoff`, `Engine.finishUserGame` |
| **kick** | Full-width KickView (§4.6) + HUD strip: `47 YDS · R HASH · WIND ← 12 · 🌧 · ICED!`; pressure heartbeat icon; play-clock ring; result banner overlay; feedback line ("Wide right by 2 ft · Timing: GOOD · Power: 91 %"); "What's my range?" toggle (shows `Kick.model` pMake at this distance). A pending `USER_PUNT` runs the same scene on `RTG.Punt` (§2.14): HUD `PUNT · OWN 32 · R HASH · WIND …`, the punt field instead of uprights, banner from `Punt.GRADE_TEXT`, feedback from `Punt.feedbackFor`; the auto-PAT rule does not apply | `Engine.applyUserKick(input)`; reads `state.game.pending.ctx` and `Kick.model`. Punts: `Engine.applyUserPunt(input)` and `Punt.model` |
| **postgame** | Big score with crests; your line in gold (FG 3/3 · Long 48 · PAT 2/2 · GW ★); letter grade stamp (animated 300 ms); headline card; XP breakdown list; meter deltas with arrows; coach quote; CONTINUE | `Engine.endWeek` on continue |
| **schedule** | Week list with results (W/L, score, your line); tap → box score modal (drives summary, kicks) | read `state.season.schedule` |
| **standings** | Tabs: Division/Conference (NFL) or Conference/Top 25/Playoff picture (college); bracket view in POST; tiebreak note | read `state.season.standings/rankings/playoffs` |
| **team** | Depth chart cards (K1/K2 with OVR bars and Job Security meter, rival comparison), P/LS names, team OFF/DEF/ST bars, coach card (style, aggression, trust), stadium card (climate, dome, surface, altitude) | read |
| **stats** | Tabs: Season / Career / Splits (distance buckets table, by weather, by hash, by pressure) / Kick log (rows: wk, D, wind, result, tags; replay ▶ re-simulates deterministically from `rngState` + input in KickView, M4) | read `state.stats`; `Stats.rebuildSplits` |
| **records** | Two tabs (College/NFL): record, holder, year; yours in gold; "3 more 50+ makes for the season record" chase lines; milestones list | read `state.records` |
| **awards** | Envelope-open animation per award (600 ms), trophy sprite, XP/fame chips; season goals results; CONTINUE | `Engine.nextPhase` |
| **offseason** | Stepper: Body Check (age deltas) → Training Blocks (3 drag-to-slot or tap) → Decisions (declare/stay with projection; redshirt; transfer offers; extension/tag/FA → contract screen; retire) → Preview next season (rival kicker card, schedule teaser) | `Engine.decide(...)` per step; `Engine.nextPhase` |
| **combine** | Three KickView sessions with a plan choice card first; results summary with combineScore and projection update | `Engine.decide({kind:'COMBINE_PLAN'})`, `Engine.sessionKick` |
| **draft** | Picks ticker (auto-scroll 250 ms/pick, ×4 speed button); your card pulses when reached; agent phone texts; "YOU'RE GOING TO {CITY}" stinger; UDFA invite cards fallback | `Engine.nextPhase` (runs the draft), `Engine.decide({kind:'UDFA'})` |
| **contract** | Offer cards (AAV, years, gtd %, team quality stars, climate/dome tag, starter guarantee, market); agent advice text; buttons ACCEPT · COUNTER (once) · DECLINE/WAIT; team-mood face (5 states) | `Engine.decide({kind:'EXTENSION'|'FREE_AGENCY'|'TAG'|'CUT_NOTICE', optionId, extra})` |
| **campbattle** | KickView with a live 2-line scoreboard (you vs rival), 6 slots each; rival kicks shown as quick results | `Engine.sessionKick` |
| **timeline** | Vertical strip per season: crest, record, FG%, awards icons, contract chips; moments with impact stars | read `history` |
| **legacy** | Bust portrait (look), tier, HOF score meter with tick marks, verdict text, career line, top-10 moments carousel, records held, documentary title, seed code (tap to copy), NEW CAREER | `Engine.decide({kind:'HOF'})`; writes `rtg.records` |
| **settings** | Audio, auto-PAT (off/safe/all), play kickoffs, sim speed, input mode (flick/meter), play clock ×2, colorblind, high contrast, reduced motion, font scale, left-footed mirror, tooltips, key remap (Space/Enter/arrows) | `Storage.setItem('rtg.settings')`; `Store.settings` |
| **saves** | 3 slots + autosave cards (name, team, year, OVR, saved at); SAVE / LOAD / DELETE; EXPORT (textarea + copy) / IMPORT (paste) | `Store.save(slot)`, `Save.deserialize`, `Store.replace` |
| **practice** (M4) | Distance/hash/wind/weather pickers; unlimited kicks, no XP; 30-kick heat map | `Kick.buildContext(..., {forSession:true})`, `Kick.resolve` via a throwaway rng |
| **debug panel** (`?debug=1`) | Buttons for the §3.8 API; state JSON dump | `RTG.debug.*` |

### 4.6 The kick scene (`RTG.UI.KickView`, E4)

**State machine:** `SETUP → PULL → FLIGHT → RESULT → DONE` (keyboard mode: `SETUP → POWER_METER → ACCURACY_METER → FLIGHT → …`). `KickView.mount(canvas, {ctx: KickContext, model: KickModel, settings, onInput(input) → KickResult, onDone()})`.

**Camera A (setup):** behind the kicker; ball low-centre (tee at y = 78 % of height); uprights near the top scaled by distance (width = `clamp(0.60 − (D − 20)·0.0115, 0.14, 0.60) × canvasW`; at 20 yd 60 %, at 60 yd 14 %) and horizontally offset for the hash (`ballX` projected: −6.667 yd college hash ≈ 22 % of width at 30 yd, shrinking with D); wind sock top-right with numeric mph + arrow; hash chip; distance label; pressure heartbeat icon; play-clock ring around the ball (drains only after the first touch; `Tuning.difficulty[d].playClock × settings.playClockMult`).

**Pointer input (`RTG.UI.Input.flick`)** — uses Pointer Events with `setPointerCapture` on the canvas; `touch-action: none` on the canvas; ignores multi-touch beyond the first pointer.
1. `pointerdown` within 96 css-px (÷ scale → virtual) of the ball → `PULL`. Play clock starts.
2. `pointermove`: pull vector `d = (p − p0)`; power `P = clamp(dy / D_full, 0, 1.15)` where `D_full = 0.32 × canvasCssHeight` (portrait) or `0.45 × canvasCssHeight` (landscape); all distances in CSS px (already DPR-independent). Bar fills with ticks every 10 % (click SFX); green zone drawn from `model.pNeed` to `model.pNeed + 0.15` (not on Legend); red zone above 1.0. Kicker sprite lean frame = `floor(P·3)`. Samples `{x, y, t}` are pushed into a ring buffer of 32.
3. `pointerup`: flick segment = samples in the last **120 ms or the last 6 samples, whichever is larger**. `v = (p_last − p_first) / dt` in css-px/ms. *As built:* the segment never starts before the pull's reversal — the deepest sample of the pull, found by walking back from the release with no time bound (the 300 ms window only ever deepens it), which is also where power is read, so a pause at full draw cannot under-read power — a fast pull that snaps straight into the flick would otherwise carry downward samples into the window and read as WEAK. If `v.y > −0.12` (no forward flick) → mishit: `power = 0.5, aim = N_ui(0, 2°) via uiRng, quality = 0.3`. Else:
   - `aim = clamp(atan2(v.x, −v.y) · 180/π, −12, 12)` (mirror for left-footed setting);
   - `speed = |v|` css-px/ms; `< 0.35` → "WEAK" (power ×0.85); `> 2.2` → "YANKED" (quality −0.15);
   - `quality = 1 − clamp(rmsPerp / 14, 0, 1)` where `rmsPerp` = RMS perpendicular deviation (css px) of flick samples from the chord; then `quality = clamp(quality − yank, 0, 1)`;
   - hesitation: time held with `P ≥ 0.95` before the flick > 1.2 s → passes `holdMs` in the input (`Kick.resolve` reads `input.holdMs` for the CLU < 70 penalty).
   - Once `P` exceeded 0.20 the kick cannot be cancelled: `pointercancel`/leaving the canvas → kick with the current values (`quality 0.5`).
4. Play clock at 0 → kick with current values (or mishit if never pulled).
5. The triple goes to `onInput` → `Engine.applyUserKick` → `FLIGHT` with the returned `KickResult`.

**Aim-then-hold mode** (`inputMode: 'meter'`, the DEFAULT since D20; the confirm / aim keys below are the defaults — Settings ▸ KEYS rebinds them and `Input.resolveKeys` is the only reader, so A/D stay aliases only while the arrows are unremapped): ←/→ (A/D) nudge aim ±0.5° per tap, hold to sweep 6°/s; the aim marker sits on the uprights, and aim is the arrows ALONE. Then Space/Enter is **held** — or a finger held anywhere on the canvas — while the power bar climbs linearly 0 → 1.15 over `Tuning`-free `Input.CONST.meter.holdMs` (1300 ms; 1050 ms under pressure ≥ 0.6), parking at the top if over-held. Releasing sets power, and quality comes from that same release relative to the green band `[pNeed, pNeed + Tuning.kick.range.greenBand]` (0.20): 1.0 at its middle easing to 0.88 at the rim, then `0.88 − 2.2·d` outside it (floor 0.30). **With the Settings ▸ "Green = guaranteed" assist on (default), a release inside the band sets `input.green` and the kick is a certain make** (D21): `Kick.resolve` re-checks the claim with `Kick.inGreen(power, model)` and, if it holds, returns a pure strike — `err = contact = overBias = 0`, `x = 0`, no block roll, height floored above the bar, `result.assisted = true`, no rng consumed. An unverifiable claim falls through to the normal physics, and AI input never sets the flag, so simulated kickers and every balance target are untouched. A release under `minCommit` (0.08) is a stray tap — it returns to aiming without spending the kick. Holding past 1.0 leaves the bar in the red, where the engine's overswing penalty applies. The play clock starts on the first hold; running it out kicks at the current fill with `cancelQuality`. Gamepad: d-pad = arrows, A = Space (optional, via `navigator.getGamepads` polling in the RAF, M4).

**Flight (Camera B):** duration `flightTime × 0.75` s (PAT ×0.77 again); ball sprite scale follows the parabola `size = 3 + 9·(4·s·(1−s))` where `s = t/T`; a drop shadow slides along the ground line; lateral screen position interpolates from the ball to the projected `xYd`; uprights drawn last with z-sort (ball behind the crossbar plane after `s > 0.92`). Camera drift 4 px vertical. Wind particles (rain/snow) via uiRng. Skippable by tap/Space after 300 ms (jumps to RESULT).

**Result beat (1.2 s; 0.4 s with reduced motion):** refs' arms (up = good, wave-off = no good), crowd row colour flip, banner "GOOD!" / "WIDE RIGHT" / "SHORT" / "BLOCKED!" / "DOINK!" with palette flash; score ticker rolls in the HUD. **Doink:** freeze 500 ms on the post with the ball squashed against it, metallic TING, crowd "ooh" bar, then the ruling banner. **Block:** 6-frame rush sprite overlay before the swing when `result.outcome === 'BLOCKED'` (the result is known before the animation, so the rush is drawn convincingly). **Clutch (pressure ≥ 0.6):** vignette, heartbeat SFX at `60 + 90·pressure` bpm, crowd muted → roar on the result, "GAME ON THE LINE" banner on decisive kicks; camera shake amplitude `2·pressure` px (0 with reduced motion); aim-line sway per §2.3.7.

**Punts in the scene (§2.14):** a `PUNT` context mounts the same view with `Punt.model` as the model. The green band is `[model.pNeed, model.pNeed + model.greenBand]` (0.20, `Tuning.punt.field.greenBand`) and the meter's `greenZone` reads the model's own band and `powerMax`; a release inside it sets `input.green` exactly as for a kick. Aim uses the same arrows and the same `Input.CONST.aimMax` clamp (±12°), although the engine accepts ±30°. Instead of uprights the field draws the strip inside the opponent's 20 (gold, from `ctx.toGoal − 20` to the goal line) and a mint tick at `model.want`, the yardage the coach asks for. The flight lasts `hang × 0.45` s (`TIMING.puntFlightScale`), there is no doink, a block runs the rush overlay, and the ball lands at `gross / toGoal` of the way up the field. The banner is `Punt.GRADE_TEXT[grade]` (COFFIN CORNER! is styled as a make, BLOCKED! as a block); the feedback lines are `Punt.feedbackFor(result, ctx, model).detail` and `.coach`; the aria text is the grade, the gross yards and the receiving side's yard line.

**Timings summary:** snap+hold 400 ms · pull ≤ play clock · swing 5 frames @ 60 ms · contact flash 4 frames · flight 0.9–1.9 s · result 1.2 s · banner fade 300 ms · post-kick feedback line persists until the next event.

**Auto-PAT rule (settings.autoPat):** `off` = kick every PAT; `safe` (default after the first college season) = auto unless `pressure ≥ 0.5` (a tying PAT in Q4 is always yours); `all` = auto. Auto kicks use `Engine.autoKick` (AI input with the user's attributes; 1 % honest auto-miss floor at ACC < 70 is inherent in the model).

### 4.7 Audio (`RTG.UI.Audio`, E4)

WebAudio only, no files: `click` (bar ticks), `thunk` (contact; pitch 180–320 Hz by power), `whoosh` (flight noise burst), `ting` (doink, 2.2 kHz decaying), `crowd` (filtered noise loop, gain by pressure/fans), `heartbeat` (two low thumps at the bpm), `stinger_good`/`stinger_bad` (3-note arpeggios), `whistle`. Off by default on mobile until the first tap; master toggle in settings; never required for play.

### 4.8 Accessibility & QoL

- Keyboard-only navigation for every DOM screen (visible `:focus-visible` ring in `--sky`); `Tab` order follows layout; modals trap focus; Escape closes modals (not kicks).
- Keyboard-only play on the **canvas** screens too: they are chromeless, so the confirm key on an armed flick
  scene swaps that scene to the meter sequence (the stored input mode is untouched) and Escape opens Settings,
  returning to the still-pending kick — a keyboard-only player is never stranded on a kick that needs a pointer.
- `aria-live="polite"` region announces kick results, scores, headlines; canvas has `role="img"` with an `aria-label` describing the kick situation and result.
- Colour-blind palette, high contrast, reduced motion (`prefers-reduced-motion` honoured + manual switch: no shake, instant flight, no vignette), font scale, play clock ×2, left-footed mirror, tooltips on every number (long-press on touch), haptics (`navigator.vibrate(30)` on contact, 80 on doink) when available and enabled.
- QoL: sim-to-next-kick default, auto-PAT, auto-kickoff, sim rest of game/season, speed ×1/2/4, kick history, "why did I miss?" feedback, "What's my range?" overlay, seed copy, export/import, undo last XP spend until leaving the Training screen, no undo for kicks.


---

## 5. Test plan

Runner: `node kicker/test/run.js` (plain `node:assert` + `node:test`, no npm deps). `test/load.js` evaluates the engine files in the §3.2 order inside a `vm` context whose global has **no** `window`/`document` (so any DOM reference throws), returns `RTG`. Slow statistical tests are tagged `[balance]` and run with `node kicker/test/run.js --balance` (CI runs both). Playwright specs live in `test/e2e/` and are dev-only (`npx playwright test` from a checkout with Playwright installed; the game itself never depends on npm).

### 5.1 Node engine tests

| File | Owner | Asserts |
|---|---|---|
| `purity.test.js` | E1 | Every file under `js/engine` and `js/data` contains none of `document`, `localStorage`, `Math.random`, `Date`, `setTimeout`, `setInterval`, `requestAnimationFrame`, `performance`, `navigator`, `alert`; `window` appears only in the shim string; loading via `load.js` throws nothing; `typeof RTG.Kick.resolve === 'function'` etc. for every module in §3.2. |
| `rng.test.js` | E1 | mulberry32 vectors (seed 1 → first 5 draws match known constants); same seed → identical 10 000-draw sequence; `state()/setState()` resumes exactly; `gauss` mean/sd within 0.02/0.03 over 100k; `gauss` consumes exactly 2 draws; `fork` is deterministic and does not perturb the parent beyond 1 draw; `shuffle` is a permutation. |
| `util.test.js` | E1 | `erf`/`phi` accuracy (|err| < 1e-6 vs table), `fnv1a` vectors, `template`, `indexBy`, `clamp`. |
| `schema.test.js` | E1 | `createCareer` produces a state that `validate`s; `JSON.parse(JSON.stringify(state))` deep-equals `state` (after `reindex`); no object identity shared between leagues; all 48 + 32 team ids unique; fixtures for every phase validate. |
| `data_lint.test.js` | E2 | 48 colleges (6×8), 32 NFL (2×4×4); nicknames not in `blockedNicknames` and no `city+nick` collision with the blocklist pairs; unique abbreviations/names; hex colours valid and primary/secondary contrast ratio ≥ 2.5; names lists sizes (≥ 200 first, ≥ 300 last); no blocked kicker surnames; ≥ 30 events with ≥ 1 choice each; ≥ 160 headline templates; every event `cond` is a function; every effect key exists in the `Effects` schema. |
| `weather.test.js` | E1 | dome → wind 0 & weather 'dome'; wind ≤ cap; snow only when temp < 34; distributions (10k games): cold-December snow share 25–45 %; Rayleigh mean ≈ 6.3 mph. |
| `player.test.js` | E1 | `ovr` formula; `costToRaise` table values (60→61 @24 = 18; 85→86 = 43); POT cap; `ageTick` decline lines by age; injury probabilities (100k rolls within ±10 %); JS update rule fixtures (bench at < 25, cut after 3 weeks < 10, floor = trust/5); modifier expiry by week/game/season. |
| `kick.test.js` | E1 | `maxFG` values at POW 40/62/82/99 (49.4/56.2/62.4/67.7 ±0.05); `carryMax`, `Rneed`, `h(D)` closed forms; σ at the four profiles (3.07/2.80/2.09/1.84 ±0.01 before multipliers); shank rate by CON; deterministic `resolve` for a fixed seed (golden JSON of 20 results); **rng draw order** asserted by counting draws per outcome branch; doink bands (x = ±3.05 → DOINK, ±3.30 → WIDE); crossbar band; wind drift sign (+dir pushes right) and magnitude (15 mph @ 45 yd = 1.77 yd ±0.01); hash `targetDeg` (college R hash @ 30 yd = −12.53°); overswing penalty (σ ×1.375 at 1.15) and bias sign by foot; block probability bounds (0.2 %–15 %) and `allOut` bump; PAT distance by league; `pMakeAt` monotone decreasing in D and increasing in ACC; kickoff touchback rate at KO 50 vs 90 (≈ 35 % vs ≈ 75 %); `feedbackFor` labels. |
| `kick_model.test.js` | E1 | `Kick.model().pMake` vs 50k-kick Monte Carlo within ±2 pts at 25/35/45/52/58 yd for rookie and elite; `windowDeg` asymmetry from hashes; `pClear` = 0.5 exactly at pNeed where carry = Rneed. |
| `kick_calibration.test.js` `[balance]` | E1 | The §2.3.6 table, 30k kicks/cell, ±4 (56–60: ±6); human-vs-AI: quality 0.95/aim sd 0.3 beats AI profile by 2–5 pts at 40–49; quality 0.5 loses 5–12; difficulty σ multipliers ordering. Prints the table (also `test/balance_report.js`). |
| `punt.test.js` | E1 | `RTG.Punt` (§2.14): public API and `Tuning.punt`; a `PUNT` context carries `losYard` / `toGoal`; distance rises with power to 1.0 and falls past it while hang peaks at `curve.hangPeak` and falls either side (the boomed ball is longer and hangs less); POW moves `maxDist` by > 8 yd from 40 to 90, KO moves `maxHang`, tail/head wind move the ceiling; the band moves with the field (own 8: `want ≥ maxDist − 1`, not pinning; own 55: pinning, `want` inside the 20 and ≥ 2 yd short of the goal line, lower `pNeed`, `tbFrom` above the band) and fits the bar at every LOS with `want ≥ 20` through own 60; `inGreen` edges; **draw contract** (`resolve` 7–11 draws, forced 0, `aiInput` 4, assist 0); `resolve` is a pure function of `{ctx, input, rngState}`; 4 000 mixed punts close the arithmetic (`oppStart = 100 − landing + return` clamped, net ≤ gross, touchbacks start at 20, out-of-bounds and fair catches return nothing, inside-20 means landed at ≥ 80, blocks > 0 and < 10 %); aiming at the near sideline travels less, finds the sideline > 20 % of the time and is returned < half as often, the far sideline is not reached; high KO gives up < 75 % of the return yards; `pBlock` doubles from calm/CON 80 to pressure 1/CON 30 and stays ≤ `block.max`; the verified assist is never blocked or returned, hangs ≥ 4.4 and pins from plus territory, an unverifiable claim falls through to the physics, the AI never claims it; forced grades produce their shape and legal spots; `feedbackFor` titles, details and coach lines; **balance** (1 200 AI punts per profile, own 10–45): good leg (80s) gross 45–52, net 38–48, inside-20 > 20 %, touchbacks < 12 %; poor leg (45s) > 7 yd worse gross and > 8 net. |
| `sim.test.js` `[balance]` | E2 | 2 000 NFL games (random teams 58–88, kickers 62–92) → points/team 21–27, FGA/team 1.9–2.4, PAT/team 2.4–3.0, distance buckets per §2.13, regulation ties 3–7 %, decisive attempts/game 0.10–0.25, ice timeouts ≤ 0.6 × decisive; college 1 000 games → 24–32 pts, FGA 1.5–2.2, PAT 2.8–4.2; clock never negative, drives/team 10–14; OT rules (NFL both-possess, playoff continues, college alternating from 25, 2-pt from period 2, 3+ alternating tries) by scripted fixtures; `step` after `END` throws; a scripted `applyKick` sequence reproduces an exact final score; **determinism**: same seed → identical `driveLog` and score; `simToNextUserKick` returns only user-kick or end events; blocked PAT return-for-2 occurs; a scripted `PUNT` outcome resolves through the punt engine from `drive.puntLos.mean`, the other side starts at `100 − oppStart`, the punt counts in `gs.stats` and burns clock; punt spots in the drive log read "own N" / "the N" (never own 51+). |
| `schedule.test.js` | E2 | College: every team 12 games, 7 conference (each conference opponent once), 5 non-conference vs 5 distinct other conferences, week 12 = rival, no team plays twice in a week, no self-games, home/away 6/6 ±1; NFL: 17 games, 6 divisional, 4+4 rotating divisions, 2+1 place-based, 8/9 home split alternating by year, one bye in weeks 5–14, 18 weeks, ≤ 16 games per week, generation < 50 ms, deterministic by seed, 100 consecutive years all valid. |
| `standings.test.js` | E2 | Tiebreak fixtures (H2H, division record, common games, conference record, point diff, coin) for NFL divisions and wild cards; college ranking formula & stickiness; 5-champs + 7-at-large selection with the 6th champion as at-large; seeds 1–4 byes; bracket advancement; bowl pairing never same-conference; draft order (worst first, playoff exits). |
| `season.test.js` | E2 | A full college season via `Engine.autoPlaySeason` on a fixture: 13 REG weeks, CCG, bowls/playoff produce a champion, `phase` sequence PRE→REG→POST→AWARDS→OFF, `season.kickerStats` populated for all 48 teams, awards non-empty, user stats consistent with kick log, runtime < 250 ms; NFL season likewise (18 weeks + 4 playoff weeks, Championship Bowl winner); `endWeek` refuses with a pending event; injuries tick; mods expire. |
| `stats.test.js` | E3 | bucket assignment, streaks, long, 50+ counts, clutch/decisive counters, kick-log cap & aggregation preserving totals, splits rebuild, `grade` table, `topMoments` ordering, `checkRecords` beats legends and flags `isUser`, milestones fire once. |
| `awards.test.js` | E3 | Golden Boot/Leg goes to the max `kickerScore` with min FGA; All-League 1st/2nd distinct; STPOY threshold rule (else the "a punter won it" note); weekly award; season goals generation/checking; `hofScore` worked examples (877 → FIRST_BALLOT; ≈ 200 → Solid Starter) and monotonicity in each input. |
| `events.test.js` | E3 | Every event: `cond` evaluates on fixtures for its stages without throwing; each choice applies and clamps soft stats 0–100 / fame 0–1000; branches respect probabilities (10k trials ±3 %); `once` respected; recent-ring exclusion; actions returned for TRANSFER/TRADE/CAMP_BATTLE; headline ring buffer never repeats within 40; template slots all resolve (no `{` left). |
| `contracts.test.js` | E3 | AAV worked values (OVR 75 → 3.0, 85 → 5.1, 92 → 6.8, cap 8.0 ±0.05), age/fame/market multipliers, rookie scale by round, guaranteed %, tag value growth and second-tag ×1.2, max two tags, extension eligibility rule, counter acceptance bounds, FA offer counts 1–4 and withdrawal odds, cut rules, earnings accumulate, `teamsNeedingK` rule. |
| `draft.test.js` | E3 | `draftValue` → round table boundaries; shock event 1 % (100k trials ±0.2 %); team selection prefers needy teams; ticker length; UDFA invites 2–3; tryout branch; combine score clamp ±8. |
| `career.test.js` | E3 | Showcase → stars formula; offers count by stars (walk-on 1); camp battle scoring & tie to incumbent; declare eligibility (3 seasons, redshirt excluded, senior auto); transfer resets; `decide` rejects unknown kinds; `offseasonChain` order; `changeTeam` bookkeeping; retirement rules (forced after 2 offer-less offseasons, age 42); HOF verdict thresholds; legacy report fields. |
| `career_balance.test.js` `[balance]` | E3 (E1 assists) | 200 seeded careers via `Engine.autoPlayCareer` at Pro: no exceptions/NaN; stage progression valid; §2.13 career targets (rookie FG%, year-4, elite peaks, longest FG distribution, benching/cut rate, career length, HOF distribution); each career saves/loads round-trip every season; runtime < 4 s per career. |
| `save.test.js` | E3 | round-trip equality (ignoring caches); checksum mismatch rejected; `v > SAVE_VERSION` rejected; migration from `fixtures/save_v0.json` (a deliberately older shape) runs and validates; export/import base64 round trip; size after a 20-season auto career < 400 KB; slot summary fields. |
| `engine_api.test.js` | E3 | Each `Engine.*` function exists; `endWeek` before the game is played throws; `applyUserKick` without a pending kick throws; `autoPlayWeek/Season/Career` reach the expected phases; `nextPhase` is idempotent with a pending decision. |

### 5.2 Playwright flows (`test/e2e/*.spec.js`, Chromium desktop + WebKit "iPhone 12" emulation; each spec runs against **both** `file://…/kicker/index.html` and `http://localhost:8080/kicker/`)

| Spec | Steps & assertions |
|---|---|
| `boot.spec` | Page loads with zero console errors on file:// and http; title renders; with `**/fonts.googleapis.com/**` and gstatic blocked the page still renders and a kick can be played (fallback font). `RTG.VERSION` defined; `RTG.debug` present. |
| `newcareer.spec` | New career → name/archetype/difficulty/seed → the `hsseason` screen with five schedule rows and a recruiting board; `getState().stage === 'HS'`, `phase === 'SEASON'`, `pending === null`; seed shown equals the entered seed. |
| `kick_mouse.spec` | In a senior-season game: `page.mouse` press on the ball, drag down 120 px over 300 ms, flick up 60 px in 80 ms, release → result banner visible; `getState().pending.session.results.length === 1`, `input.power` within 0.5–1.15, `auto === false`. Overswing: drag 200 px → `feedback.power === 'OVERSWING'`. |
| `kick_touch.spec` | Same via `page.touchscreen`/pointer emulation on iPhone 12 portrait and landscape (844×390); canvas fits the viewport; `document.documentElement.scrollWidth <= innerWidth`. |
| `kick_keyboard.spec` | Aim-then-hold: ArrowLeft ×4 → aim −2°, then hold the confirm key until the bar is mid-green and release → result with `input.aim = −2` and a high quality. |
| `force_kick.spec` | `RTG.debug.forceKick({outcome:'DOINK_IN'})` → banner contains "DOINK"; `{outcome:'BLOCKED'}` → rush overlay class present; stats increment (`stats.career.doinks`). |
| `game_flow.spec` | `RTG.debug.jumpTo({stage:'COLLEGE', phase:'REG', week:1})`; Play Game; loop: click NEXT KICK → if kick screen, `forceKick({outcome:'GOOD'})`; until postgame; assert postgame line equals `getState()` summary; Continue → hub week 2; autosave key updated (`rtg.save.auto` savedAt increased). Also watch mode for one drive (speed ×4) shows drive-log lines. |
| `season_and_career.spec` | `simSeason()` ×3 (college) → offseason declare card → Declare → combine (3 forced sessions) → draft screen shows a pick → contract/hub NFL; `simCareer({untilStage:'RETIRED'})` → legacy screen visible with tier and HOF score; `rtg.records` updated. No console errors throughout. |
| `events.spec` | `triggerEvent('NIL_TRUCK')` → modal with 3 buttons; choose 0 → `player.fame` +30 and a consequence headline appears after `endWeek`. |
| `saveload.spec` | Save to slot 2 → reload page → Load slot 2 → `getState()` equals the saved state (ignoring `playtimeSec`); slots 1/3 untouched; export string → clear storage → import → same state; checksum-tampered blob refused with a message. |
| `responsive.spec` | Viewports 390×844, 844×390, 768×1024, 1280×800: hub, game, kick, stats screens have no horizontal scroll; bottom tab bar visible on phone; right rail visible at 1280. |
| `perf.spec` | `simGame()` ×300 then open a kick: `RTG.debug.perf().frameP95Ms < 20` on desktop CI; heap (`performance.memory` when available, else CDP `Performance.getMetrics` JSHeapUsedSize) growth < 20 MB; `perf().listeners` equal before/after 500 `go('stats')/go('hub')` cycles; `rafActive === false` on DOM screens. |
| `a11y.spec` | Tab reaches every hub button; focus ring visible; `prefers-reduced-motion` emulation → flight completes in < 100 ms; `aria-live` region text updates after a kick; colorblind mode adds `.cb` and result banner still contains text. |

### 5.3 Definition of done (per module)

Unit tests green; purity green; fixtures updated; `Schema.validate` passes on every state the module produces; public API matches §3.5 (INT diffs signatures); no `console.log` left in engine code; JSDoc on every exported function.

---

## 6. Implementation plan

### 6.1 Day 0–2: contracts land first (E1 + INT)

Before anything else: `00_namespace.js`, `tuning.js`, `util.js`, `rng.js`, `schema.js` (factories for **every** typedef in §3.4 with sensible defaults + `validate`), `test/load.js`, `test/run.js`, and `test/fixtures/*` skeletons. E2/E3 add their data files in parallel on day 1 so `createCareer` can build leagues by day 2. Everyone else stubs against fixtures until then.

### 6.2 Work packages

#### WP1 — Core & Kick (E1)
Files: `00_namespace`, `engine/tuning`, `engine/util`, `engine/rng`, `engine/schema`, `engine/weather`, `engine/player`, `engine/kick`, `engine/punt` (D24), `test/load`, `test/run`, tests `purity, rng, util, schema, weather, player, kick, kick_model, kick_calibration, punt`, `test/balance_report.js`, `fixtures/{schema,kick,player}.js`.
Deliverables in order: (1) namespace/tuning/util/rng/schema + loader (day 0–2); (2) `Kick.model/resolve/aiInput` + calibration test green (day 3–5) — **nothing in the UI is tuned before this is green**; (3) `Player`, `Weather`; (4) `buildContext`, kickoffs, feedback, forced outcomes for debug.
Contracts provided: `RTG.Schema` typedefs/factories (everyone), `RTG.Kick` (E2 sim, E4 scene, E5 debug), `RTG.Player` (E2/E3), `RTG.Weather` (E2), `RTG.RNG`/`Util`/`Tuning` (all).

#### WP2 — Sim & League (E2)
Files: `data/blocklist`, `data/names`, `data/colleges`, `data/nfl`, `data/records`, `engine/names`, `engine/schedule`, `engine/standings`, `engine/sim`, `engine/season`, tests `data_lint, sim, schedule, standings, season`, `fixtures/{league,game,season}.js`.
Deliverables: (1) data files + lint (day 1–2); (2) `Schedule` + `Standings` (day 2–5); (3) `Sim` state machine with AI kicks via `Kick` (day 3–7) — `simToNextUserKick/applyKick` contract frozen by day 4 so E4 can build the game screen; (4) `Season` week loop, postseason, league sims, `advanceYear` (day 6–10).
Contracts consumed: `Kick.model/resolve/aiInput/buildContext`, `Weather.forGame`, `Player.*` meters, `Stats.recordAiKick/recordGame` (E3, stubbed early), `Awards.compute/weekly/seasonGoals` (E3), `Events.roll/headline/message` (E3), `Career.campBattle/offseasonChain` (E3).

#### WP3 — Career & Story (E3)
Files: `data/awards`, `data/events`, `data/headlines`, `engine/stats`, `engine/awards`, `engine/events`, `engine/contracts`, `engine/draft`, `engine/career`, `engine/hs`, `engine/save`, `engine/api`, tests `stats, awards, events, contracts, draft, career, hs, career_balance, save, engine_api`, `fixtures/{career,contract,events,save_v0.json}`.
Deliverables: (1) `Stats` + `Save` (day 1–4; `Save` needs only `Schema`); (2) events data + `Events` (day 2–6); (3) `Contracts`, `Draft` (day 4–8); (4) `Career.decide/offseasonChain/sessions` + `Awards` (day 6–11); (5) `Engine` facade incl. `autoPlay*` (day 8–12; `autoPlayCareer` is the integration test everyone runs).
Contracts consumed: `Season.*` (E2), `Sim.*` (E2), `Kick.*`, `Player.*`, `Schema`, `Names`.

#### WP4 — Kick Scene & Canvas (E4)
Files: `ui/sprites`, `ui/canvas`, `ui/audio`, `ui/input`, `ui/kickview`, `ui/screens/{hsseason,hsgame,game,kick,combine,campbattle,practice}`.
Deliverables: (1) `Canvas` scaling + `Sprites` atlas + a kick scene running on `fixtures/kick.js` with `Kick.resolve` directly (day 1–5) — the **flick prototype on a real phone by day 5** is the project's riskiest item; (2) `Input` flick + meters emitting the triple, with the DPR-normalised thresholds of §4.6 (day 4–7); (3) result beats, doink/block/clutch presentation, audio (day 6–10); (4) `game` screen on `Sim.simToNextUserKick` (day 7–11); (5) session wrappers (senior-season game/camp/combine) over `pending.kind==='KICKS'`.
Contracts consumed: `Kick.model/resolve` (for practice mode and range overlay), `Engine.applyUserKick/autoKick/simToKick/simStep/sessionKick/finishUserGame`, `Store`/`Router`/`C` (E5), `Settings`.

#### WP5 — App Shell & Screens (E5)
Files: `index.html`, `css/style.css`, `ui/storage`, `ui/store`, `ui/router`, `ui/components`, all other `ui/screens/*`, `ui/app`, `debug.js`, `test/e2e/*`.
Deliverables: (1) shell (index/css/store/router/components/storage) with the title + newcareer + hub on fixtures (day 1–4); (2) `debug.js` skeleton (`getState/setState/go/forceKick/autoKick`) by day 4 so Playwright can start; (3) hub/inbox/training/postgame/schedule/standings/team/stats/records (day 4–9); (4) awards/offseason wizard/draft/contract/timeline/legacy/settings/saves (day 8–12); (5) Playwright suite (from day 5, growing).
Contracts consumed: `Engine.*` (E3), `Save` (E3), `Schema.validate`, `Stats` read helpers, `Kick.model` for read-only overlays.

### 6.3 Integrator (INT)

1. Owns `index.html` script order, `README.md`, CI script (`npm`-free: `node kicker/test/run.js`; Playwright optional job), and the spec change log.
2. Freezes the §3.5 signatures on day 2; reviews every PR against them; resolves drift by editing the spec, never by silent divergence.
3. Runs `Engine.autoPlayCareer` nightly from day 8 and triages exceptions to owners.
4. Milestone gates (each playable on file:// and gated by the Node suite + the listed Playwright specs):
   - **M1 (day 7)** — Kick scene + calibration green + one simulated game with sim-to-next-kick (`boot`, `kick_mouse`, `kick_touch`, `kick_keyboard`).
   - **M2 (day 12)** — College season loop: hub, training, inbox/events, standings, postgame, awards, save/load, autosave, debug API (`game_flow`, `events`, `saveload`).
   - **M3 (day 18)** — Draft, NFL, contracts (extension/FA/tag/cuts), trades/transfer events, injuries, awards, records, HOF/legacy, full auto career green (`season_and_career`, `responsive`, `perf`).
   - **M4 (day 22)** — Kickoff mini-event, practice mode, kick replays, extra headline packs, gamepad, accessibility polish (`a11y`), balance pass on 200 careers, README with seed-sharing notes.
5. Final balance pass: run `test/balance_report.js` and `career_balance`; adjust only `Tuning`; record the final tables in `README.md`.
6. Performance pass on a mid-range Android phone: kick scene p95 frame < 16.7 ms; fix by reducing draw calls, never by lowering the virtual resolution.

### 6.4 Cross-team contract checklist (must be true at integration)

- [ ] Every engine file uses the shim and passes `purity.test.js`.
- [ ] `Schema.validate` passes after every `Engine.*` call in the Playwright `game_flow` run with `?debug=1`.
- [ ] `Sim` never reads `state.player` directly for AI kicks — it goes through `Kick.buildContext`, which snapshots attrs into `ctx.kicker`.
- [ ] `Kick.resolve` is the only function that consumes a kick triple; `Engine.applyUserKick` is the only UI entry for user kicks; `Engine.sessionKick` for sessions.
- [ ] `state.pending` drives routing; no screen decides on its own what phase comes next.
- [ ] RNG draws happen only inside engine functions; the store writes back `rngState` after every dispatch; `uiRng` is never passed to the engine.
- [ ] All numbers displayed by the UI come from `state` or `Kick.model` (never re-derived).
- [ ] `Tuning` is the only home for constants; tests read from it.
- [ ] Saves produced at M2 load at M3/M4 (migrations added if the schema changes; `SAVE_VERSION` bumped).

*End of specification.*
