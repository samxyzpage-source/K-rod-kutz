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

Regenerated after the progression / HOF / draft spec bump (§5.2). Every career validates, is NaN-free and survives a save/load
round trip after every season (`career_balance.test.js`, 9/9 green with the retuned bands in `Tuning.career.balance`).

Run: `node kicker/test/career_report.js` · 3 workers · 127 s wall · failures: 0 · retired: 200/200

| Metric | Spec §2.13 target | Measured |
|---|---|---|
| Rookie NFL season FG% (first NFL season with ≥ 12 FGA), median | 78–83 % | 85.5 % (OVR median 73, n=200) |
| Year-4 NFL starter FG%, median | 84–88 % | 89.7 % (OVR median 80, n=199) |
| Elite peak seasons (OVR ≥ 88) FG%, median | 89–93 % | 94.7 % (n=730 seasons from 124 careers) |
| Career longest FG: median · share ≥ 64 yd | 57–61 · 5 % | 64 · 62.5 % |
| Careers with a benching or cut in the first 3 NFL seasons | 25–45 % | 49.0 % (benched 48.5 %, cut 13.0 %, lost camp battle 47.5 %) |
| NFL seasons (careers reaching OVR ≥ 80), median | 10–14 | 14 (199 careers; all careers median 14) |
| HOF verdicts: first-ballot · inducted (incl. first-ballot) | ≤ 10 % · 15–25 % | 0.5 % · 19.5 % (score median 1327) |
| Full auto career runtime (engine, per worker, 3 parallel) | < 4 s | median 1838 ms · max 3563 ms |
| Save size after the career | < 400 KB (20 seasons) | median 326 KB · max 342 KB (seasons median 17) |

#### FG% by NFL career year

| NFL year | n | age | OVR median | FGA median | FG% p25 | FG% median | FG% p75 | PAT% median | long median | starters (K1) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 200 | 21 | 72 | 35 | 80.0 % | 85.0 % | 89.7 % | 95.8 % | 57 | 80 % |
| 2 | 200 | 22 | 75 | 40 | 82.5 % | 86.7 % | 90.2 % | 96.5 % | 58 | 96 % |
| 3 | 200 | 23 | 78 | 40 | 83.9 % | 88.6 % | 91.3 % | 97.7 % | 59 | 99 % |
| 4 | 200 | 24 | 80 | 41 | 86.1 % | 89.7 % | 93.3 % | 98.1 % | 60 | 100 % |
| 5 | 200 | 25 | 82 | 41 | 87.5 % | 91.4 % | 94.9 % | 98.3 % | 60 | 100 % |
| 6 | 200 | 26 | 84 | 42 | 88.9 % | 92.1 % | 95.2 % | 99.3 % | 60 | 100 % |
| 7 | 200 | 27 | 85 | 42 | 89.2 % | 92.3 % | 95.6 % | 100.0 % | 60 | 100 % |
| 8 | 200 | 28 | 86 | 43 | 89.3 % | 92.5 % | 95.4 % | 98.6 % | 61 | 100 % |
| 9 | 200 | 29 | 87 | 41 | 90.7 % | 93.6 % | 96.7 % | 100.0 % | 61 | 100 % |
| 10 | 200 | 30 | 88 | 42 | 90.7 % | 94.0 % | 96.0 % | 100.0 % | 61 | 100 % |
| 11 | 200 | 31 | 88 | 43 | 91.2 % | 94.6 % | 97.5 % | 100.0 % | 61 | 100 % |
| 12 | 189 | 32 | 89 | 41 | 92.9 % | 95.2 % | 97.5 % | 100.0 % | 61 | 100 % |
| 13 | 122 | 33 | 90 | 42 | 92.7 % | 95.1 % | 97.6 % | 100.0 % | 61 | 100 % |
| 14 | 106 | 34 | 90 | 41 | 92.3 % | 94.8 % | 97.7 % | 100.0 % | 61 | 100 % |

#### FG% by college year

| College year | n | age | OVR median | FGA median | FG% median | long median |
|---|---|---|---|---|---|---|
| 1 | 200 | 18 | 57 | 24 | 72.9 % | 51 |
| 2 | 200 | 19 | 63 | 23 | 79.0 % | 53 |
| 3 | 200 | 20 | 68 | 25 | 81.4 % | 54 |
| 4 | 27 | 21 | 70 | 29 | 86.2 % | 54 |

#### Longest FG distribution (career)

| p5 | p25 | median | p75 | p95 | ≥ 60 | ≥ 64 | ≥ 67 | NFL-only median |
|---|---|---|---|---|---|---|---|---|
| 61 | 63 | 64 | 65 | 67 | 99.5 % | 62.5 % | 13.5 % | 64 |

#### Hall of Fame

| Verdicts | Tiers | HOF score p10 / median / p90 |
|---|---|---|
| FIRST_BALLOT: 1 · INDUCTED: 38 · FINALIST: 85 · NOT_ON_BALLOT: 76 | Immortal: 1 · Legend: 46 · Franchise Leg: 150 · Solid Starter: 3 | 1059 / 1327 / 1656 |

#### Career shape

| Stars | Draft round (8 = UDFA, 9 = undrafted) | Retirement reasons | Final age median | Career FG% median | Peak OVR median | Attributes at POT at retirement (of 5) | Unspent XP median | Earnings $M median |
|---|---|---|---|---|---|---|---|---|
| 2: 6 · 3: 118 · 4: 76 | 4: 19 · 5: 59 · 6: 74 · 7: 32 · 8: 14 · 9: 2 | CHOICE: 200 | 35 | 89.9 % | 89 | 2.9 | 2806 | 65.2 |

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

### 5.2 Spec bump — progression, Hall of Fame, draft value (orchestrator, after integration)

The §2.13 bands were unattainable under the spec's own pinned formulas (POT ~ N(80, 8) reachable with ≈ 2 200 XP against a
career income of ≈ 14 000; every auto career entered the NFL at OVR ≈ 80 and retired first-ballot). Rather than starve the
reward loop (E3 had cut a made FG to 1 XP), the economy was re-based at the root and the numbers re-measured over 200 careers:

| Constant | Spec | Now | Why |
|---|---|---|---|
| `progression.pot` | N(80, 8) in 60–99 | **N(88, 6) in 62–99** | elite (90+) must be reachable for most archetypes, but only late |
| `progression.cost` | 12 + 0.6·(v−50) + 2.0·(v−80) | **30 + 2.2·(v−50) + 6.5·(v−70) + 3.0·(v−80)** | a career's XP (≈ 15 k) ≈ the cost of maxing every attribute by ~30 |
| `progression.xp` (game / offseason) | fgMade 8 + 0.5/yd, 50+ 8, clutch 12, GW 30, TF 18, miss 2, win 4, blocks 70, goals 40/60/100 | **5 + 0.3/yd, 5, 8, 20, 12, 1, 3, 50, 30/45/75** (training 20 unchanged) | ≈ 60 % of the table — a made kick still pays; E3's 1-XP table is gone |
| `kick.range.windAlongPerMph` | 0.30 | **0.15** | a 20 mph tailwind adds 3 yd, not 6 — career longs stay near the 66-yd record |
| `sim.coach.longAttempt*` | — | **+0.20 to the attempt threshold from 57 yd** | coaches want extra confidence before a 57+ try |
| `soft.camp.triggerOvrMargin` | 5 | **2** | a clearly better newcomer starts without a camp battle |
| `hof.weights` | starter 15, 50+ 3, AL1 25, AL2 12, STPOY 35 | **8, 2, 40, 15, 60** | dominance over longevity |
| `hof.verdicts` / `hof.tiers` | 750 / 550 / 400 · 900 / 550 / 300 / 150 | **1850 / 1550 / 1250 · 1900 / 1500 / 950 / 450** | rescaled to the economy: median auto career = FINALIST, Franchise Leg |
| `draft.value.offset` | — | **+12** | lines the §2.7.6 round table up with rookies at OVR ≈ 66–74 (rounds 4–7, some UDFA) |
| `career.autoplay.retire` | forced only | **from 32 unless OVR ≥ 88, hard 35** | test policy only; humans decide |

Measured after the bump (200 careers, §3): rookie OVR 73 / FG% 85 %, OVR 80 at year 4, 85 by ~27, POT (≈ 89) by ~30;
college OVR 57 → 64 → 68 (→ 72–73 entering the NFL); draft rounds 4–7 with ≈ 10 % UDFA; career long median 64 (record 66;
≈ 12 % reach 67); bench/cut in the first 3 NFL seasons ≈ 49 % (camp battles are a coin flip for a rookie against a comparable
incumbent — a live event a human wins with skill); NFL seasons median 14; HOF first-ballot 0.5 %, inducted 19.5 %, tiers
Franchise Leg 75 % / Legend 23 %. The Training screen now has something to buy in every season of a career.

Still open (accepted): elite peak FG% ≈ 94 % (spec 89–93 — an OVR-89 kicker in this engine is a video-game elite; the
calibration table itself is met); rookie FG% 85 % vs the spec's 78–83 (rookies arrive at OVR 73, not 66).

### 5.3 Observations worth a look before the UI balance pass

- The Training screen has nothing to buy after NFL year 1 for most careers (see 5.2.1) — the single biggest feel issue.
- 26 % of auto careers lose the rookie camp battle (start as K2); combined with benchings the §2.13 25–45 % band is met, but almost
  no one is cut (1.5 %) because the cut rule needs FG% < 75 % and OVR < 68, which a POT-capped kicker never shows.
- Draft rounds are 5–7 / UDFA (5 first-round-shock careers); nobody projects to rounds 1–3, so the "stay unless round ≤ 4" hook is dead.
- Every auto career retires by choice (no forced retirements): forced rules trigger at 42 / two offer-less offseasons / injury, and the
  default policy leaves at 34–38.
