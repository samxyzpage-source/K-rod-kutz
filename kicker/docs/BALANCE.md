# Road to Glory: Kicker — Balance report (integration pass)

Numbers produced by the Node engine on the integration pass (INT), from the committed code and `RTG.Tuning`. Every table
here is regenerable:

| What | Command | Time |
|---|---|---|
| Kick calibration table + season-level make rates (§2.3.6, §2.14) | `node kicker/test/balance_report.js` | ≈ 11 s |
| Game simulation targets (§2.14 sim rows) | `node kicker/test/run.js sim_balance --balance` | ≈ 2 s |
| 200 auto careers (§2.14 career rows) — asserted | `node kicker/test/run.js career_balance --balance` | ≈ 190 s on 3 workers |
| 200 auto careers — the tables below | `node kicker/test/career_report.js` | ≈ 105 s on 3 workers |
| Engine budgets (§2.14 / §3.9) | `node kicker/test/perf.test.js` | ≈ 5 s |
| Whole suite | `node kicker/test/run.js` (fast, 25 files ≈ 49 s) · `node kicker/test/run.js --balance` (28 files ≈ 240 s) | |
| The star curve and the money tiers (§6, §7) | Node probes through `test/load.js` (described in §7; not in the repo yet — a `test/finance_report.js` in the style of `career_report.js` is the natural home) | ≈ 2 s + ≈ 40 s |

Suite status at the time of writing (the D27 money pass, on top of commit `0cdb041`): **fast 25/25 files green in 48.7 s** with the new `finance.test.js` (36 tests incl. the `[risk]` row) and the D27 additions to `career`, `schema`, `season`, `events`, `contracts`, `engine_api`, `save` and `integration`; the balance files were not re-run on this pass. Sections 1–5 are unchanged since the integration pass (§2.14 was §2.13 then); §6–§7 were measured on the D27 working tree.

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

| Metric | Spec §2.14 target | Measured |
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
| §2.7.1 stars | `1.5 + 0.03·(OVR − 40) + 0.4·makes/6` | since D23/D26: `clamp(round(1.0 + 0.03·(OVR − 40) + 0.6·rating), 2, 5)` over the senior season's 0–6 rating (`Tuning.draft.stars` base 1.0 / seasonW 0.6; §6) | E3 — the literal formula made every recruit a 2★ walk-on; the showcase itself is gone |
| `perf` (new block) | — | `seasonMs 250, careerMs 4000, warmupSeasons 1` | INT — budgets read by `test/perf.test.js` |

### 5.2 Spec bump — progression, Hall of Fame, draft value (orchestrator, after integration)

The §2.14 bands were unattainable under the spec's own pinned formulas (POT ~ N(80, 8) reachable with ≈ 2 200 XP against a
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
- 26 % of auto careers lose the rookie camp battle (start as K2); combined with benchings the §2.14 25–45 % band is met, but almost
  no one is cut (1.5 %) because the cut rule needs FG% < 75 % and OVR < 68, which a POT-capped kicker never shows.
- Draft rounds are 5–7 / UDFA (5 first-round-shock careers); nobody projects to rounds 1–3, so the "stay unless round ≤ 4" hook is dead.
- Every auto career retires by choice (no forced retirements): forced rules trigger at 42 / two offer-less offseasons / injury, and the
  default policy leaves at 34–38.

---

## 6. Recruiting: the star curve and the camp bars (D23 / D26) — measured on the D27 working tree

`Career.starsFor(ovr, rating) = clamp(round(1.0 + 0.03·(OVR − 40) + 0.6·rating), 2, 5)` (`Tuning.draft.stars`: base 1.0,
perOvr 0.03, ovrAnchor 40, seasonW 0.6, min 2, max 5, walkon 2), where `rating` is the senior season's 0–6 mark
(`HS.ratingOf`, one decimal). Thresholds read back from the engine (the lowest rating that rounds up):

| Recruit OVR | 3★ from | 4★ from | 5★ from | Note |
|---|---|---|---|---|
| 44 | 2.3 | 4.0 | 5.7 | a perfect season (6.0) is still 5★ |
| **50** (the spec's anchor) | **2.0** | **3.7** | **5.4** | exactly the §2.7.0 figures |
| 56 | 1.7 | 3.4 | 5.1 | |

A blank season (0) is 2★ at every recruit OVR — the walk-on line — and the star bonus never touches the archetype's
signature attribute (D24: `Player.signatureOf`, POT pinned at 99).

**The camp bars** (`Tuning.hs.camps`; a camp is 5 kicks from the middle hash at that school, wind held to 8 mph,
`oppST` 40, pressure 0.15 on the first four and 0.5 on the fifth; the first four distances wander ±2 yd, the long one
adds 0–2 and never drops under the bar):

| Prestige | Makes of 5 | The long one from | Distances (yd) |
|---|---|---|---|
| 1 | 3 | — | 27 32 36 40 44 |
| 2 | 3 | — | 29 34 38 42 46 |
| 3 | 4 | 48+ | 31 36 41 45 48 |
| 4 | 4 | 52+ | 32 38 43 47 52 |
| 5 | 4 | 55+ | 34 40 45 50 55 |

Invites: every board school at WARM (interest ≥ 25) or better, plus off-board programmes by star rating (5★ → 3–4 of
prestige 5, 4★ → 2–3 of prestige 4, 3★ → one of prestige 3), never zero (1–2 prestige ≤ 2 fallbacks), capped at 8,
sorted small camps first. Not measured here: the share of camps a human-quality tape earns per prestige — worth a
Playwright or engine probe with forced makes before the next balance pass.

---

## 7. Money (D27) — measured at the D27 working tree on top of commit `0cdb041` (2026-09-22); refresh after any retune

Every number below comes from the code as it stands in `Tuning.finance` and `Data.finance` on that tree. Method, so
the section can be regenerated: (a) **investments** — one holding of $1 000k per catalogue entry, 10 000 seeds
(`RNG.create(1000003·i + 17)`), `Finance.tick` ten times with `state.year` advancing (the real revaluation: bust /
boom / gauss draws in the tick's own order, `state.player = null` and no timeline so nothing else moves), end value
per $1 in read at year 3 and year 10; (b) **the all-WILD career** — 12 offseasons, each a tick followed by a $1 stake
in a WILD pitch drawn by `weight` (Parking App 3, Rocket Coin 4, Sure Thing 2), then a 13th tick; (c) **take-home** —
24 auto careers (`Engine.newCareer` seeds 5000–5023, Pro, `autoPlayCareer`), the `INCOME` ledger rows grouped by
league and contract phase; (d) the star thresholds of §6 read from `Career.starsFor`.

### 7.1 Take-home vs the lifestyle tiers

`Tuning.finance.takeHome`: college 0.85 (NIL money), NFL 0.52 (salary, bonus, dead money); catalogue prices ×
`Tuning.finance.scale` — **1 in both leagues since D28** (§7.1–7.4 below were measured at the original NFL ×10; §7.5 has the
D28 re-measure). Measured take-home per season (24 auto careers, $k):

| Take-home ($k) | n | p10 | median | p90 |
|---|---|---|---|---|
| College season (NIL × 0.85; NIL by prestige `Tuning.contracts.nil.byPrestige`) | 78 | 8 | 32 | 96 |
| NFL rookie-deal year 1 (salary + the 25 % signing bonus, × 0.52) | 24 | 832 | 988 | 988 |
| NFL rookie-deal years 2–4 | 69 | 364 | 416 | 416 |
| NFL second contract and later, per season | 237 | 2 236 | 2 964 | 6 396 |
| Net event money over a career | 24 | 231 | 247 | 287 |
| Bank at retirement (autoplay spends nothing: FRUGAL, nothing owned, no stakes — verified on every seed) | 24 | 33 396 | 38 874 | 41 520 |

What a year of each plan costs against those incomes (`Tuning.finance.lifestyle.tiers`):

| Tier | Cost college · NFL ($k/yr) | Yearly effects | Share of a median college season ($32k) | of a rookie year 2–4 ($416k) | of a second-contract season ($2.96M) |
|---|---|---|---|---|---|
| FRUGAL | 0 · 0 | — | 0 % | 0 % | 0 % |
| COMFORTABLE | 12 · 120 | morale +2 | 38 % | 29 % | 4 % |
| FLASHY | 40 · 400 | morale +4, fame +15, fans +2 | 125 % | 96 % | 14 % |
| BALLER | 110 · 1 100 | morale +6, fame +40, fans +4, trust −3 | 344 % | 264 % | 37 % |

Reading: in college only COMFORTABLE is sustainable on NIL money (a prestige-5 NIL deal at $60–120k gross clears
FLASHY); a rookie can live COMFORTABLE and afford FLASHY only by spending the year-1 bonus; BALLER is a second-contract
plan by design. The eleven purchases run $4k–$350k at scale 1 ($40k–$3.5M in the NFL: the lake house is 1.2
second-contract seasons, the parents' house $1.8M), upkeep 3–8 % of the price (season tickets 50 %, they renew); the
services $12–20k ($120–200k). Debt: 12 % interest, morale −6 per year in the red, the plan forced to FRUGAL, a forced
sale after 2 years or when the debt exceeds the net worth — and note that any negative bank triggers it, so a college
year-1 overdraft of a few $k from event costs (seen in the engine probes: −$13k after a $10k NIL deposit and $22k of
event charges) already pays interest and the morale hit. A grace floor (only below −$X × scale) is the obvious
retune; the contract asked for `bank < 0`, so none was added.

### 7.2 Investments — end value per $1 in, 10 000 ten-year holds through `Finance.tick`

| id | risk · kind | 3 y p10 / median / p90 | 3 y mean · P(loss) · P(zero) | 10 y p10 / median / p90 | 10 y mean · P(loss) · P(zero) |
|---|---|---|---|---|---|
| `INDEX_FUND` | LOW · INDEX | 0.98 / 1.21 / 1.48 | 1.22 · 12 % · 0 % | 1.28 / 1.88 / 2.74 | 1.96 · 2 % · 0 % |
| `MUNI_BONDS` | LOW · INDEX | 1.06 / 1.16 / 1.25 | 1.16 · 1 % · 0 % | 1.39 / 1.62 / 1.88 | 1.63 · 0 % · 0 % |
| `RENTAL_DUPLEX` | MED · PROPERTY | 0.78 / 1.23 / 1.84 | 1.27 · 26 % · 3 % | 0.47 / 1.91 / 4.25 | 2.22 · 19 % · 9 % |
| `CAR_WASH` | MED · BUSINESS | 0.50 / 1.22 / 2.00 | 1.24 · 32 % · 9 % | 0.00 / 1.55 / 4.75 | 2.07 · 37 % · 26 % |
| `HOMETOWN_GYM` | MED · BUSINESS | 0.54 / 1.19 / 1.90 | 1.21 · 33 % · 9 % | 0.00 / 1.50 / 4.25 | 1.89 · 37 % · 26 % |
| `BUYOUT_FUND` (NFL, fame ≥ 200) | MED · BUSINESS | 0.60 / 1.31 / 2.12 | 1.34 · 25 % · 9 % | 0.00 / 2.09 / 5.98 | 2.66 · 30 % · 26 % |
| `WING_JOINT` | HIGH · BUSINESS | 0.00 / 1.20 / 2.81 | 1.39 · 41 % · 14 % | 0.00 / 0.70 / 7.88 | 2.98 · 54 % · 40 % |
| `MEMORABILIA` | HIGH · BUSINESS | 0.00 / 1.15 / 3.20 | 1.50 · 44 % · 12 % | 0.00 / 0.65 / 9.52 | 3.95 · 56 % · 35 % |
| `SMOOTHIE_FRANCHISE` | HIGH · BUSINESS | 0.00 / 1.16 / 2.41 | 1.27 · 41 % · 14 % | 0.00 / 0.78 / 6.00 | 2.26 · 53 % · 40 % |
| `PARKING_APP` (exploit-pass retune: bust 0.30, boom 0.05) | WILD · STARTUP | 0.00 / 0.00 / 1.71 | 0.83 · 85 % · 71 % | 0.00 / 0.00 / 0.00 | 2.22 · 99 % · 98 % |
| `ROCKET_COIN` (exploit-pass retune: mean 0, bust 0.20) | WILD · CRYPTO | 0.00 / 0.00 / 2.73 | 0.91 · 79 % · 63 % | 0.00 / 0.00 / 0.00 | 0.86 · 98 % · 96 % |
| `SURE_THING` | WILD · **SCAM** | 0.00 / 0.00 / 0.00 | 0.00 · 100 % · 100 % | 0.00 / 0.00 / 0.00 | 0.00 · 100 % · 100 % |

Tier checks (SPEC §2.14): LOW ten-year medians 1.62–1.88 (≥ 1.5 ✓, ≤ 2 % losses); MED 1.50–2.09 with 19–37 % ten-year
loss odds; HIGH is a three-year coin flip (41–44 % losses) whose ten-year median is under 1 (0.65–0.78) with a 6–10×
p90 tail — the "sell after the boom" tier, since nothing has an exit of its own; WILD medians 0 (98–99 % ten-year
losses, a mean above 1 only for the start-up, carried by the ≈ 2 % that pop); SCAM 0. **The exploit pass** found the
first WILD models +EV per year (Parking App 1.37, Rocket Coin 1.18 — above every LOW model), and an all-in gambler who
never sold beat cash in 20 of 30 careers; the retune (Parking App bust 0.25 → 0.30, boom 0.12 → 0.05; Rocket Coin
mean 0.15 → 0, bust 0.12 → 0.20) puts every WILD model's yearly E[×] under 1 (0.95 / 0.97; `finance.test.js` `[risk]`
pins the analytic figure and checks it against the tick) — measured over 30 shared seeds the never-sell gambler now
finishes below cash in 19 of 30 careers and below a 60 %-into-LOW/MED saver in 24 of 30, a gambler who sells after
every boom is short of the saver in 17 of 30 (p50 0.59 × gross vs the saver's 0.64) though still above plain cash in
21 of 30 — "a little bit of play" with a real downside, not a money loop. **The all-WILD career** (one $1 stake a
year for 12 years, ridden to a 13th tick) **loses money 88.8 % of the time** (everything gone 7.7 %; end value p10 /
median / p90 = 0.14 / 2.44 / 13.46 on $12 in, mean 7.7); the "real risk, real loss" bar (> 50 %) holds with room.
Departures from the contract's example models, kept on purpose (all in `Data.finance`, trivially retunable): Wing
Joint bust 0.05 not 0.15 (at 0.15 HIGH was indistinguishable from the WILD start-up), Parking App bust 0.30 / boom
0.05 / ×8 not 0.45 / 0.10 / ×6 (the contract's shape had a per-year EV of 0.83 with no pop worth the name; the
content pass's 0.25 / 0.12 / ×8 was the +EV trap the exploit pass caught), duplex 0.01 / car wash and gym 0.03 /
memorabilia 0.04 / franchise 0.05 busts so MED sits at 19–37 % ten-year losses instead of ~50 %; crypto at mean 0 /
0.8 / bust 0.20 (the −100 % gauss floor adds ≈ 5 % effective bust a year on top).

### 7.3 Open for the balance pass

- ~~A grace floor for the debt step (§7.1)~~ — done in the exploit pass: `Tuning.finance.debt.grace` 10 ($k × scale);
  an overdraft no deeper than that is not a debt year. The same pass fixed the forced sale (it fires only once the
  debt exceeds what could be sold, or after `liquidateAfter` red years, and sells the smallest asset that clears the
  debt), charges the lifestyle plan at the price quoted when it was picked (a college BALLER is not $1.1M at the first
  NFL tick) and upkeep off what was paid, and refuses a dearer plan while the bank is red.
- ~~NFL scale ×10 makes the Sure Thing ask $100–500k and the lake house $5M~~ — D28 set the NFL scale to 1: the
  pitches ask the same $k in both leagues and the lake house is $500k for everyone.
- ~~The opportunity card prints the holding `kind` next to the pitcher ("A DM · SCAM")~~ — the card now prints a
  display label (INDEX and SCAM both read FUND).
- A sale haircut for HIGH / WILD holdings (or a one-year lock after a boom) if the sell-after-the-boom play should
  cost something: it still beats plain cash in about two careers out of three (never the saver's median).
- Purchase effect sizes sit at the low end of the contract's ranges (morale 2–8, fame 5–20, fans 1–6, trust ±3);
  BALLER's trust −3 a year is the only standing meter cost — whether it should bite harder against Coach Trust's
  long-attempt gate (§2.5.6) is a feel question.
- Autoplay never touches the books (`finance.test.js` on 3 auto careers, `engine_api`, `integration`), so §3's career
  tables are unaffected; `finance.test.js`'s `[risk]` row asserts the direction of the tier checks above on 200 seeds
  (all-WILD loses in > 100 / 200, all-LOW in < 20 / 200 and never to zero). Still open: a 200-career `career_balance`
  assertion (bank ≥ 0, nothing owned, FRUGAL) and a checked-in `finance_report.js` for the full tables.

### 7.5 D28 re-measure — flat prices (NFL scale 1)

Same probe (40 seeds × 5 personas, `money_probe.js`, 3 workers) after D28 set `Tuning.finance.scale.NFL` to 1:

| Persona | gross median | net worth median | NW / gross p10 · median · p90 | in debt (seeds) | liquidated (seeds) | best / worst holding median |
|---|---|---|---|---|---|---|
| HOARDER (never spends) | $72.6M | $38.0M | 52 % · 52 % · 52 % | 0 % | 0 % | — |
| SAVER | $72.6M | $39.7M | 53 % · 54 % · 57 % | 0 % | 0 % | +352 % / −100 % |
| LIVER | $71.5M | $38.1M | 51 % · 53 % · 55 % | 0 % | 0 % | +302 % / −100 % |
| GAMBLER (BALLER, buys everything, all-in WILD) | $70.7M | $34.3M | 46 % · 48 % · 54 % | 5 % | 0 % | +500 % / −100 % |
| GAMBLER_RAW (the same without the college guard) | $71.4M | $34.0M | 45 % · 47 % · 51 % | 95 % (all college) | 70 % (all college) | +251 % / −100 % |

Read: with prices, plan costs and pitch sizes fixed at college numbers, **college is unchanged** (a college BALLER
still goes into debt and gets sold up), while **the NFL cannot be lost**: a vet's take-home is $2–6M a season and
the most a year of books can move is the plan ($110k), the catalogue (~$1.1M once) and three pitches capped at
$40–500k, so every persona retires within a few points of the 52 % hoarder line. The lever that is not inflation,
if the pros should be able to lose real money, is the pitch **`max`** (a stake sized to the bank rather than a fixed
$k cap) — open, not done: the player asked only for prices that do not move.
