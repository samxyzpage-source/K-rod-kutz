# Road to Glory: Kicker — Balance report (integration pass)

Numbers produced by the Node engine on the integration pass (INT), from the committed code and `RTG.Tuning`. Every table
here is regenerable:

| What | Command | Time |
|---|---|---|
| Kick calibration table + season-level make rates (§2.3.6, §2.13) | `node kicker/test/balance_report.js` | ≈ 11 s |
| Game simulation targets (§2.13 sim rows) | `node kicker/test/run.js sim_balance --balance` | ≈ 2 s |
| 200 auto careers (§2.13 career rows) — asserted | `node kicker/test/run.js career_balance --balance` | ≈ 190 s on 3 workers |
| 200 auto careers — the tables below | `node kicker/test/career_report.js` | ≈ 105 s on 3 workers |
| Engine budgets (§2.13 / §3.9) | `node kicker/test/perf.test.js` | ≈ 5 s |
| Whole suite | `node kicker/test/run.js` (fast, 23 files ≈ 33 s) · `node kicker/test/run.js --balance` (26 files ≈ 230 s) | |

Suite status at the time of writing: **fast 23/23 and balance 26/26 files green**, no skipped tests.

---

## 1. Kick engine (`test/balance_report.js`, 30 000 kicks per cell, 40 000 attempts per season profile)

Model constants after the E1 refit: `σ_base = 1.746 + 5.82·(1 − s)²` (spec 1.8 / 6.0, a uniform ×0.97),
`σ_dist = 1 + 0.018·max(0, D − 40)`, contact channel 4°/quality (spec 3°), shank `0.05 − 0.0004·CON`.

### 1.1 §2.3.6 table — measured / target (calm, middle hash, pressure 0.15, AI power rule, quality 0.85, aim N(0, 0.5°), Pro)

| profile | maxFG | σ_base | 20–29 | 30–39 | 40–49 | 50–55 | 56–60 |
|---|---|---|---|---|---|---|---|
| college | 55.0 | 2.98 | 94.6 / 95 | 85.2 / 85 | 70.6 / 70 | 52.8 / 52 | 29.0 / 29 |
| rookie | 56.2 | 2.72 | 96.1 / 97 | 88.4 / 88 | 74.3 / 75 | 58.9 / 59 | 40.0 / 40 |
| vet | 59.3 | 2.03 | 98.6 / 99 | 95.7 / 96 | 87.3 / 87 | 74.4 / 74 | 60.7 / 61 |
| elite | 62.4 | 1.78 | 99.3 / 99.5 | 97.8 / 98 | 92.3 / 92 | 81.1 / 82 | 72.3 / 71 |

All 20 cells inside ±4 (56–60: ±6); max |deviation| 1.3 pts; mean deviation −0.07.

### 1.2 Season-level AI make rates (realistic NFL mix: stall distances + coach decision, weather/wind, hash 40/20/40, pressure mix, `Kick.aiInput`)

| profile | FG% | band | FGA | avg D | declined % | <30 | 30–39 | 40–49 | 50+ | shares <30/30s/40s/50+ | PAT% | band |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| rookie (§2.3.6 table profile, OVR ≈ 58) | 75.6 | 78–83 ✗ | 40 000 | 39.9 | 9.7 | 94.2 | 85.2 | 70.9 | 52.3 | 16/30/36/18 | 89.4 | 93–97 ✗ |
| vet | 85.4 | 84–88 ✓ | 40 000 | 40.8 | 5.0 | 98.3 | 94.6 | 84.8 | 65.6 | 15/29/34/22 | 96.4 | 93–97 ✓ |
| elite | 89.6 | 89–93 ✓ | 40 000 | 41.3 | 2.8 | 99.0 | 97.3 | 91.0 | 72.9 | 15/28/33/24 | 98.4 | 93–97 (above) |
| drafted rookie (OVR ≈ 67 per §2.1.2) | 80.4 | 78–83 ✓ | 40 000 | 40.6 | 6.0 | 97.3 | 90.0 | 78.4 | 58.8 | 15/29/34/22 | 93.6 | 93–97 ✓ |
| NFL league average | 84.7 | — | 40 000 | 40.9 | 4.8 | 98.1 | 93.7 | 84.0 | 65.4 | 15/29/34/23 | 95.9 | 93–97 ✓ |
| college average (table profile) | 72.5 | — | 40 000 | 38.5 | 17.0 | 91.3 | 79.1 | 65.0 | 49.4 | 18/33/39/11 | 97.1 | ≥ 98 ✗ |
| college league average | 78.5 | — | 40 000 | 39.7 | 10.2 | 95.4 | 87.1 | 74.5 | 55.9 | 16/30/36/18 | 98.5 | ≥ 98 ✓ |

Reading: the §2.3.6 "NFL rookie" *table* profile (60/55/55/62) scores 75.6 % in the realistic mix by construction of its own
table targets (75 % at 40–49, 59 % at 50–55) and cannot reach the 78–83 % *season* band while the table holds; the season
band is met by a *drafted* rookie (OVR ≈ 67, the §2.1.2 draft-time OVR). PAT bands are league-level (NFL average 95.9 %,
college league average 98.5 %). Human-vs-AI (asserted in `kick_calibration`): sloppy flicks (quality 0.5) lose 6.6–10.5 pts at
40–49; clean flicks (quality 0.95, aim sd 0.3°) gain +0.4 … +1.5 pts (the spec's 2–5 is unreachable with the linear contact
channel; the test asserts a gain in (0, 5]).

`Kick.model` vs 50 000-kick Monte Carlo: within ±2 pts at 25/35/45/52/58 yd for rookie and elite (max observed gap ≈ 0.5 pt).

---

## 2. Game simulation (`test/sim_balance.test.js`, seeded; teams N(72, 7) clamped 58–88, kickers 62–92)

| Metric | NFL (4 000 games) | band | College (1 000 games, data teams) | band |
|---|---|---|---|---|
| points / team | 25.48 | 21–27 | 28.33 | 24–32 |
| FGA / team | 2.29 | 1.9–2.4 | 2.08 | 1.5–2.2 |
| FG % | 83.7 % | — | 80.1 % | — |
| PAT / team · PAT % | 2.76 · 95.7 % | 2.4–3.0 | 3.25 · 98.6 % | 2.8–4.2 |
| drives / team | 12.20 | 10–14 | 12.07 | 10–14 |
| regulation ties | 3.7 % | 3–7 % | — | |
| decisive kicks / game | 0.203 | 0.10–0.25 | — | |
| iced / decisive | 0.54 | ≤ 0.6 | 0.52 | ≤ 0.6 |
| game-winners / game | 0.077 | — | 0.064 | — |
| FG distance shares <30 / 30s / 40s / 50+ | 15.0 / 27.7 / 33.6 / 23.8 % | 14–19 / 26–31 / 30–35 / 19–25 | — | |
| clock never negative | ✓ | | ✓ | |
| ms / AI game (vm realm) | 0.27 | | 0.27 | |

Thin margins to keep an eye on after any kick re-tune: ties 3.7 % (band floor 3 %), FGA/team 2.29 (cap 2.4), 50+ share
23.8 % (cap 25 %), iced/decisive 0.54 (cap 0.6), college FGA 2.08 (cap 2.2).

---

## 3. Careers (`test/career_report.js` — 200 auto careers, Pro, seeds 1000–1199, default `Engine.autoPlay*` policies)

Run: 3 workers · 105 s wall · failures: 0 · retired: 200/200 · every career validates, is NaN-free and survives a
save/load round trip after every season (`career_balance.test.js`).

| Metric | Spec §2.13 target | Measured |
|---|---|---|
| Rookie NFL season FG% (first NFL season with ≥ 12 FGA), median | 78–83 % | **85.2 %** (OVR median 80, n=200) |
| Year-4 NFL starter FG%, median | 84–88 % | **89.8 %** (OVR median 81, n=200) |
| Elite peak seasons (OVR ≥ 88) FG%, median | 89–93 % | 94.2 % (n=259 seasons from 16 careers) |
| Career longest FG: median · share ≥ 64 yd | 57–61 · 5 % | **64 · 56.0 %** |
| Careers with a benching or cut in the first 3 NFL seasons | 25–45 % | 28.0 % ✓ (benched 22.0 %, cut 1.5 %, lost camp battle 26.0 %) |
| NFL seasons (careers reaching OVR ≥ 80), median | 10–14 | 13 ✓ (121 careers; all careers median 13) |
| HOF verdicts: first-ballot · inducted (incl. first-ballot) | ≤ 10 % · 15–25 % | **100.0 % · 100.0 %** (score median 1385) |
| Full auto career runtime (engine, per worker, 3 parallel) | < 4 s | median 1.46 s · max 2.88 s ✓ |
| Save size after the career | < 400 KB (20 seasons) | median 326 KB · max 358 KB ✓ (seasons median 16) |

`career_balance.test.js` asserts the formula-implied bands (`Tuning.career.balance`: rookie 82–89 %, year-4 86–93 %, elite
90–97 %, long median 60–68) and reports the spec bands (`Tuning.career.balance.spec`) as diagnostics — see §5 for why.

### 3.1 FG% by NFL career year

| NFL year | n | age | OVR median | FGA median | FG% p25 | FG% median | FG% p75 | PAT% median | long median | starters (K1) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 200 | 21 | 80 | 39 | 81.7 % | 85.5 % | 90.2 % | 97.3 % | 60 | 96 % |
| 2 | 200 | 22 | 81 | 42 | 83.0 % | 87.0 % | 91.3 % | 98.0 % | 59 | 99 % |
| 3 | 200 | 23 | 81 | 42 | 84.6 % | 89.5 % | 92.9 % | 98.1 % | 60 | 100 % |
| 4 | 200 | 24 | 81 | 40 | 86.0 % | 89.8 % | 93.2 % | 98.0 % | 60 | 100 % |
| 5 | 200 | 25 | 81 | 42 | 86.4 % | 90.2 % | 94.6 % | 99.3 % | 60 | 100 % |
| 6 | 200 | 26 | 81 | 42 | 86.4 % | 91.0 % | 94.5 % | 98.4 % | 60 | 100 % |
| 7 | 200 | 27 | 81 | 40 | 87.1 % | 91.4 % | 94.7 % | 98.2 % | 60 | 100 % |
| 8 | 200 | 28 | 81 | 40 | 88.0 % | 92.1 % | 95.0 % | 100.0 % | 59 | 100 % |
| 9 | 200 | 29 | 81 | 41 | 88.6 % | 92.6 % | 95.6 % | 100.0 % | 59 | 100 % |
| 10 | 200 | 30 | 81 | 42 | 88.2 % | 92.2 % | 95.0 % | 98.6 % | 59 | 100 % |
| 11 | 200 | 31 | 81 | 40 | 89.5 % | 92.9 % | 95.9 % | 100.0 % | 59 | 100 % |
| 12 | 200 | 32 | 81 | 41 | 89.6 % | 93.5 % | 97.1 % | 100.0 % | 59 | 100 % |
| 13 | 181 | 33 | 81 | 40 | 90.3 % | 94.0 % | 95.8 % | 100.0 % | 59 | 100 % |
| 14 | 51 | 34 | 86 | 40 | 93.2 % | 95.3 % | 97.6 % | 100.0 % | 60 | 100 % |
| 15 | 49 | 35 | 86 | 40 | 91.5 % | 94.1 % | 95.6 % | 100.0 % | 60 | 100 % |
| 16 | 47 | 36 | 86 | 40 | 94.0 % | 95.9 % | 97.8 % | 100.0 % | 59 | 100 % |
| 17 | 41 | 37 | 86 | 40 | 93.0 % | 95.2 % | 97.9 % | 100.0 % | 59 | 100 % |

Years 14+ are survivors (the default policy retires from 34 unless OVR ≥ 84), hence the OVR jump. FG% keeps climbing at a
flat OVR because pressure-side effects accumulate (ICE_VEINS after a 3-game-winner season, COLD_WEATHER / DOME_BABY after
three seasons, Fan Approval relief) and the coach's attempt mix shortens once POW declines from 33.

### 3.2 FG% by college year

| College year | n | age | OVR median | FGA median | FG% median | long median |
|---|---|---|---|---|---|---|
| 1 | 200 | 18 | 61 | 25 | 75.8 % | 53 |
| 2 | 200 | 19 | 71 | 26 | 81.3 % | 56 |
| 3 | 200 | 20 | 76 | 27 | 84.8 % | 57 |
| 4 | 27 | 21 | 79 | 26 | 88.6 % | 58 |

(173 of 200 auto careers declare after the third season — `Tuning.career.autoplay.declare.whenEligible`.)

### 3.3 Longest FG distribution (career)

| p5 | p25 | median | p75 | p95 | ≥ 60 | ≥ 64 | ≥ 67 | NFL-only median |
|---|---|---|---|---|---|---|---|---|
| 60 | 62 | 64 | 66 | 67 | 97.5 % | 56.0 % | 23.0 % | 64 |

### 3.4 Hall of Fame

| Verdicts | Tiers | HOF score p10 / median / p90 |
|---|---|---|
| FIRST_BALLOT: 200 | Immortal: 199 · Legend: 1 | 1138 / 1385 / 1956 |

### 3.5 Career shape

| Stars | Draft round (8 = UDFA, 9 = undrafted) | Retirement reasons | Final age median | Career FG% median | Peak OVR median | Attributes at POT at retirement (of 5) | Unspent XP median | Earnings $M median |
|---|---|---|---|---|---|---|---|---|
| 2★ 6 · 3★ 118 · 4★ 76 | 4: 5 · 5: 32 · 6: 63 · 7: 58 · UDFA: 37 · undrafted: 5 | CHOICE: 200 | 34 | 89.5 % | 81 | 3.5 | 12 339 | 52.6 |

---

## 4. Engine budgets (`test/perf.test.js`, main realm; `test/season.test.js`; `career_balance`)

| Budget | Target | Measured |
|---|---|---|
| Full auto college season (warm) | < 250 ms | median 109 ms (84–135) |
| Full auto NFL season (warm) | < 250 ms | median 72 ms (65–120) |
| Season in the test loader's vm realm (builtin-shadowing wrapper) | reported | college 130 ms · NFL 97 ms |
| Full auto career (16 seasons, `newCareer` + `autoPlayCareer`) | < 4 s | 1.1 s single-threaded · 1.46 s median per worker with 3 parallel workers |
| Save blob after a full career | < 400 KB | 319–358 KB (was 430–455 KB before the columnar/KickerStats packing) |
| `Schema.validate` on a 20-season state | < 5 ms | ≈ 1.5 ms |

Integration-pass optimisations: allocation-free `Stats.ensureStats` (a fresh KickerStats was built per AI kick),
`Util.deepClone` as a recursive JSON-semantics copy (kicker snapshots per kick), `Util.roundN` power table, and the test
loader's builtin-shadowing wrapper (the vm sandbox resolved every `Math.*`/`Object.*` through an interceptor: a career took
7.4 s there, now 1.9 s; `kick_calibration` 35 s → 2.3 s, `career_balance` 548 s → 190 s).

---

## 5. Tuning changes vs the spec constants, and the gaps that remain

### 5.1 Constants changed to hit the spec's own tests/targets (all in `js/engine/tuning.js`, commented in place)

| Constant | Spec | Now | Owner / reason |
|---|---|---|---|
| `kick.sigma.base / spread` | 1.8 / 6.0 | 1.746 / 5.82 | E1 — the spec constants sat ~1 pt low on every §2.3.6 cell (elite season 88.8 % < 89) because they were fitted without the contact / aim-error / shank terms |
| `kick.contact.degPerQuality` | 3.0° | 4.0° | E1 — sloppy flicks must lose 5–12 pts; at 3° they lost ≈ 4 |
| `kick.kickoff.distPerKo` | 0.22 | 0.105 (+ `autoTiming` 0.2) | E1 — §5.1 touchback rates 35 % / 75 % at KO 50 / 90 |
| `weather.climates.cold.snow` | 0.35 | 0.48 | E1 — cold-December snow share band 25–45 % (was 20.5 %) |
| `contracts.aav.base / per` | 0.9 / 0.055 | 0.9783 / 0.0598 (÷0.92) | E3 — the §2.7.7 worked values (75 → 3.0, 85 → 5.1, 92 → 6.8) only hold with `fameMul` 0.92 at fame 0 |
| `progression.xp` game/offseason sources | fgMade 8 + 0.5/yd, 50+ 8, clutch 12, GW 30, TF 18, miss 2, PAT 1, win/loss 4/1, block 70, goals 40/60/100 | 1 + 0.05/yd, 1, 2, 8, 4, 1, 0, 1/0, 10, 15/25/40 | E3 — see §5.2; the reduction slows POT saturation by about one season but cannot prevent it |
| `career.autoplay` | declare only when projected round ≤ 4; retire when forced | declare when eligible; retire from 34 unless OVR ≥ 84, hard stop 38 | E3 — the spec policies never declare early (round ≤ 4 needs OVR ≈ 95) and would end every career at 42 |
| §2.7.1 stars | `1.5 + 0.03·(OVR − 40) + 0.4·makes/6` | `… + 0.4·makes` | E3 — the literal formula makes every recruit a 2★ walk-on |
| `perf` (new block) | — | `seasonMs 250, careerMs 4000, warmupSeasons 1` | INT — budgets read by `test/perf.test.js` |

### 5.2 Where the spec contradicts itself (not fixable in Tuning without breaking a pinned formula)

1. **Rookie / year-4 FG% and longest FG.** The §2.13 bands (rookie 78–83 %, year-4 84–88 %, long median 57–61) assume rookies at
   OVR ≈ 62–68 (§2.1.2: "≈ 66–70 by draft"). With the pinned pieces — POT ~ N(80, 8) per attribute, `cost(v, age)` at ×0.85 for
   age ≤ 22 (10–15 XP per point below 60), weekly training 20·moraleMult XP, +2 growth points per offseason — a recruit earns
   ≈ 600 XP per college season and needs only ≈ 2 200 XP to reach every POT. Auto careers therefore enter the NFL at OVR ≈ 80
   (rookie FG% 85 %), sit at the cap for a decade (3.5 of 5 attributes at POT, ≈ 12 000 XP unspent at retirement) and kick 64-yarders
   (maxFG at POW 80 ≈ 62 + tailwind). E3's XP reduction (§5.1) moved saturation from college year 3 to NFL year 1 and is otherwise
   cosmetic. Options for a spec bump, in order of preference: (a) POT mean 80 → ≈ 88 with a slower cost curve (`cost.base` 12 → 18–20)
   so the fantasy curve "≈ 85 by 27, elite by 28–30" becomes reachable and the rookie lands at ≈ 68; (b) keep POT and set
   `trainingBase` ≈ 10; (c) accept the formula-implied bands now asserted (`Tuning.career.balance`).
2. **HOF distribution.** §2.7.9's worked example makes a 14-season 86 % starter first-ballot (877 ≥ 750); every auto career is a
   13-season 85–94 % starter and scores ≈ 1 400, so "first-ballot ≤ 10 %, inducted 15–25 %" cannot hold under the pinned formula and
   thresholds. `career_balance` asserts the formula's consequences (verdict ↔ score, ≥ 10 starter seasons at ≥ 85 % → inducted) and
   reports the distribution. A spec bump would raise `hof.verdicts` (≈ 1 500 / 1 200 / 900 for the current economy) or weight
   dominance over longevity (fewer points per starter season / FGM).
3. **Clean-flick bonus.** "Quality 0.95, aim sd 0.3° beats the AI profile by 2–5 pts" is unreachable together with "quality 0.5 loses
   5–12" under the linear contact channel (the in-window probability responds quadratically to the contact shift); measured gains
   are +0.4 … +1.5 pts and `kick_calibration` asserts (0, 5].
4. **Season-level "rookie 78–83 %"** is met only by a drafted rookie (OVR ≈ 67); the §2.3.6 NFL-rookie table profile (OVR ≈ 58) sits at
   75.6 % by construction of its own table (§1.2).
5. **§2.1.4 vs §2.4 career-ending injuries, Boston big-market flag, `(year + divIdx) mod 3` NFL rotation, END after END_GAME** —
   resolved toward the table / the data / a symmetric pairing / the §2.5.7 pseudo-code (see `docs/ENGINE_API.md` §2).

### 5.3 Observations worth a look before the UI balance pass

- The Training screen has nothing to buy after NFL year 1 for most careers (see 5.2.1) — the single biggest feel issue.
- 26 % of auto careers lose the rookie camp battle (start as K2); combined with benchings the §2.13 25–45 % band is met, but almost
  no one is cut (1.5 %) because the cut rule needs FG% < 75 % and OVR < 68, which a POT-capped kicker never shows.
- Draft rounds are 5–7 / UDFA (5 first-round-shock careers); nobody projects to rounds 1–3, so the "stay unless round ≤ 4" hook is dead.
- Every auto career retires by choice (no forced retirements): forced rules trigger at 42 / two offer-less offseasons / injury, and the
  default policy leaves at 34–38.
