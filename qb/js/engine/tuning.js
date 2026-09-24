/**
 * Road to Glory: QB — RTG.Tuning
 *
 * The single home for every balance constant in the game. Nobody hardcodes a number elsewhere;
 * tests read from here. Same rules as the kicker's tuning.js: the tree is NOT Object.freeze'd
 * (modules capture `RTG.Tuning` at load time and RTG.debug.tune must be able to set values in
 * place), `RTG.TuningDefaults()` returns a fresh deep copy of the pristine tree, and the purity
 * test checks that no other engine file assigns into Tuning and that no numeric leaf is NaN.
 *
 * Tuning.qb is the QB moment (engine/play.js reads it at call time through P()):
 *   archetypes  the four demo starting profiles (signature ≈ 72, the rest 50–60)
 *   read        the pre-snap read: disguise odds, what IQ sees, the card advice, the reveal timing
 *   coverage    which coverage the defence really runs (base weights × situation multipliers)
 *   pressure    the sack clock: when the pocket collapses from the line battle, the coverage and poise
 *   open        the scene's separation-ring thresholds
 *   route       receiver speed → route timing
 *   field       the play on the field (engine/field.js): speeds, the rush, coverage technique, the ball's flight,
 *               scatter, contact, the catch, the tackle, the separation → openness map
 *   draw        drawing the pass / the run: slow motion, the draft's rules, the preview, the loft from the draw speed
 *   run         the two run options (SNEAK / DRAW)
 *   feedback    the label thresholds of PlayResult.feedback
 *   drive       the demo's six-snap drive script ranges
 *   demo        the BAD / AVERAGE / GREAT team presets and the default roster
 *   weather     the QB-specific weather penalties (Tuning.weather below is the kicker's game-day generator)
 *
 * CARRIED OVER from the kicker (not part of Tuning.qb): `weather` and `difficulty.pro.windCap` — the copied
 * engine/weather.js reads `Tuning.weather` and `Tuning.difficulty.pro.windCap` at call time (Weather.forGame /
 * perKick). Keep both blocks or the demo's game-day weather throws.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};

  /** @returns {object} a brand-new copy of the default constant tree */
  function TuningDefaults() {
    return {

      // ───────────────────────────── QB — THE MOMENT (engine/play.js) ─────────────────────────────
      qb: {
        attrMax: 99,                              // every attribute lives in 0..99; ratios below divide by this

        // The demo's starting attributes per archetype. The signature attribute is the only one that may
        // grow past the cap later (the kicker's D24 rule); here it simply starts at ≈ 72.
        archetypes: {
          GUNSLINGER:    { ARM: 72, ACC: 54, IQ: 52, MOB: 52, POI: 56, signature: 'ARM' },   // velocity and deep range
          SURGEON:       { ARM: 55, ACC: 72, IQ: 58, MOB: 50, POI: 56, signature: 'ACC' },   // the green zone and the scatter
          FIELD_GENERAL: { ARM: 55, ACC: 58, IQ: 74, MOB: 50, POI: 60, signature: 'IQ' },    // reads the look, sees windows early (IQ 74 × iqSees → sees 80 % of the disguises)
          DUAL_THREAT:   { ARM: 56, ACC: 52, IQ: 50, MOB: 72, POI: 55, signature: 'MOB' }    // scramble yards, sack escapes
        },

        // The pre-snap read.
        read: {
          disguise: 0.55,          // base probability that the SHOWN look is a disguise of the real coverage (0.55: a low-IQ QB is lied to on ≈ 1 snap in 4)
          iqSees: 1.08,            // the share of that probability IQ 99 removes: p = disguise × (1 − IQ/99 × iqSees) (1.08: IQ 74 sees 80 %, IQ 52 sees 57 %; ≥ 92 sees everything)
          iqExact: 80,             // IQ at or above this → the card's advice is the rating vs the REAL coverage
          goodOffered: 0.85,       // probability that at least one option is GOOD vs the real coverage
          revealBase: 1.6,         // s after the snap the UI may show the openness rings at IQ 0 …
          revealIq: 1.2,           // … minus IQ/99 × this (IQ 50 → 0.99 s · IQ 72 → 0.73 s · IQ 99 → 0.40 s)
          // Below iqExact a card whose rating differs among the coverages the SHOWN look can hide (the shown one and
          // every coverage that disguises as it) is honest about it: with probability 1 − IQ/99 it carries sure: false
          // (the chip is dimmed with a '?'). IQ 52 → 47 % of the ambiguous cards flagged · IQ 74 → 25 % · ≥ iqExact → none.
          options: { min: 2, max: 3 },   // number of play cards (a run card replaces one on short yardage)
          sneakToGo: 2,            // toGo ≤ this → SNEAK is offered (never further out)
          drawToGo: 3,             // toGo ≤ this (and above sneakToGo) → DRAW is offered
          runCardsMin: 2,          // pass cards kept next to a run card
          hotBelow: 2.1,           // sackAt under this many seconds flags ctx.pressure.hot (throw quick)
          // play-card pool weights by tag in a situation (multiplied; 0 removes the play from the pool)
          weights: {
            shortToGo: 3,          // toGo ≤ this → `short`
            short: { SHORT_YDG: 2, QUICK: 1.5, DEEP: 0.4, PA: 0.5 },
            longToGo: 8,           // toGo ≥ this → `long`
            long: { DEEP: 1.5, SCREEN: 1.3, SHORT_YDG: 0.6, QUICK: 0.8 },
            redZoneToGoal: 20,     // yards to the goal line at or under this → `redZone`
            redZone: { DEEP: 0.3, PA: 0.6 },
            lastPlayToGoal: 25,    // a last play (situation.lastPlay) from at least this far → `lastPlay` (only a shot at the end zone counts)
            lastPlay: { DEEP: 2, QUICK: 0.4, SCREEN: 0.3, SHORT_YDG: 0.3 }
          }
        },

        // Which coverage the defence really runs: base weights × the situation's multipliers × opp.tendency.
        coverage: {
          base: { COVER2: 0.20, COVER3: 0.30, COVER4: 0.15, MAN: 0.20, BLITZ: 0.10, PREVENT: 0.03 },   // PREVENT 0.03: a late-game look, almost never on a regular down
          longToGo: 7,             // 3rd/4th and at least this → the "long" multipliers
          long: { BLITZ: 1.8, COVER2: 0.8, PREVENT: 0.6 },
          shortToGo: 2,            // toGo ≤ this → the "short" multipliers
          short: { MAN: 1.3, BLITZ: 1.3, COVER4: 0.5, PREVENT: 0 },
          redZoneYl: 80,           // yl ≥ this → the red-zone multipliers (COVER4 less, MAN more)
          redZone: { COVER4: 0.4, MAN: 1.4, COVER2: 1.2, PREVENT: 0 },
          lateClock: 120,          // Q4 with the clock at or under this and the DEFENCE leading → PREVENT
          late: { PREVENT: 3.5, BLITZ: 0.6, COVER4: 0.6 }   // PREVENT ×3.5 ≈ 11 % of last plays (×6 made the game-winner unwinnable); COVER4 ×0.6: quarters late would do the same
        },

        // The sack clock (seconds after the snap when the first rusher arrives).
        pressure: {
          base: 2.6,               // s for an even line battle, neutral coverage, POI 50 (the first rusher home on a QB who stands at the top of his drop; 2.6: a novice who waits for a wide-open man is sacked on ≈ 1 dropback in 6, a decent reader ≈ 1 in 14)
          olW: 0.025,              // s per point of (ol − 50) …
          dlW: 0.025,              // … minus s per point of (dl − 50); the sum is softened below
          up: 0.25,                // soft cap of the line's GAIN (tanh): a great line buys at most ≈ +0.25 s (GREAT 2.85 s pocket, AVERAGE 2.7)
          down: 0.70,              // soft cap of the line's LOSS: a bad line loses at most ≈ −0.7 s (BAD 1.95 s: the bad line is the story — ≈ 3.5× the sacks of GREAT)
          poiW: 0.004,             // s per point of (POI − 50): poise buys a beat in the pocket
          mulExp: 0.4,             // the coverage's pressureMul enters as sackAt ÷ pressureMul^mulExp (BLITZ 1.6 → ×0.83 · PREVENT 0.7 → ×1.15)
          clutchMul: 0.30,         // in the clutch sackAt × (1 − clutchMul × (1 − POI/99)): the rush "feels" faster to a nervous QB (0.30: POI 56 loses ≈ 0.4 s on the last two snaps — the stakes reach the hand, not only the sky)
          clutchClock: 120,        // Q4 with the clock at or under this and the game within one score → clutch
          clutchMargin: 8,         // … "within one score"
          sigma: 0.7,              // s: gauss jitter of sackAt in buildContext (0.7: the rush is a threat on every snap — a great line still gets beaten early now and then, a bad one sometimes holds)
          snapSigma: 0.10,         // s: a second, smaller jitter in snap (the same look never plays twice the same)
          min: 1.5, max: 4.2       // s clamp (sackAt: when the first rusher gets home on a QB who stands at the top of his drop; field.rush turns it into beatAt; min 1.5: even the worst snap leaves time for one quick throw)
        },

        // The scene's separation-ring colours for live.receivers[i].open (0..1 from the separation NOW, field.openSep).
        open: {
          ring: { open: 0.60, closing: 0.25 }   // green ≥ open · gold ≥ closing · red below (0.60 ≈ 3.2 yd of room with openSep 1.0–4.6)
        },

        // Receiver speed → route timing. A route's waypoints are timed for an average receiver; a fast one
        // runs them in less time: tRoute = tWaypoint × speedBase / (speedBase + speedPer × (speed − 50)).
        route: {
          speedBase: 1.0, speedPer: 0.004,   // speed 99 → ×0.836 of the waypoint times · speed 30 → ×1.087
          endZoneCap: 10,          // yd: a route never runs deeper than the back of the end zone (100 − yl + this)
          releaseT: 1.0,           // s: a man lined up behind the line (the gun back, −5) reaches his route's depth over this
          jitterSd: 0.05           // s: gauss jitter of each receiver's route clock at the snap (a release off the line is never twice the same)
        },

        // ═══ THE FIELD (engine/field.js): 22 players and the ball in field yards, stepped at a fixed dt ═══
        // x = lateral yards from the ball (+ = the offence's right), y = yards downfield of the line (the backfield is < 0).
        field: {
          dt: 1 / 60,              // s: the fixed sub-step (live.step(dt) runs floor(dt / this) of them, the rest carries)
          maxStep: 0.25,           // s: live.step(dt) never advances more than this per call (a stalled tab does not teleport the play)
          maxT: 8,                 // s: a play that never resolves ends here (the pocket always folds long before)
          halfWidth: 26.667,       // yd: half of the 53⅓-yard field
          endZone: 10,             // yd: goal line to end line
          hash: { HS: 6.667, COLLEGE: 6.667, NFL: 3.083 },   // yd from the field's centre to a hash (ctx.hash −1 left / 0 middle / 1 right; the scene's numbers)
          sideMargin: 3,           // yd: no one lines up closer than this to a sideline (a 22-yd split on the short side is pulled in)
          inbounds: 0.6,           // yd: a route runs along the sideline this far inside it, never out of bounds
          arriveGain: 3.2,         // 1/s: a steered player wants min(vmax, gain × distance) — he slows into his spot
          accel: 21,               // yd/s²: how fast anybody changes velocity (0 → 9 yd/s in under half a second)
          recAccel: 11,            // yd/s²: a receiver breaking to the ball (a ball thrown behind him costs him the stop and the turn)
          breakGain: 12,           // 1/s: … and slows into the landing spot only as late as his braking allows
          brakeFrac: 0.85,         // an arriving player plans his stop on this share of his deceleration (√(2·a·frac·d) caps his speed)
          carry: { speedMul: 0.86, pause: 0.3, pauseMul: 0.5, escortX: 3, escortY: 2, escortMul: 0.6 },   // the ball carrier runs at × speedMul of his speed, × pauseMul for pause s after the catch (secure it, turn upfield) · the other receivers drift to escortX / escortY off him at × escortMul (presentation: nobody blocks)
          rotateS: 0.6,            // s: the defence holds the SHOWN picture and blends into the REAL roles over this (the disguise rotation)
          // the pre-snap picture (ctx.alignment) and the offence's spots
          align: {
            qbGun: -5, qbUnder: -1.2,          // QB depth in the gun (SHOTGUN / TRIPS / EMPTY) and under centre
            wrY: -0.8, slotY: -1.2, teY: -0.8, rbGun: -5, rbUnder: -6,   // receivers' depths
            olX: 1.9, olY: -0.6,               // yd between linemen · their depth
            dlX: [-5.2, -1.8, 1.8, 5.2], dlY: 0.9,   // DL1..DL4 (weak → strong, strong-relative) · depth
            cbPress: 1.0, cbOff: 7, cbWayOff: 10, cbInside: 0.8,   // corner depth pressed / off / prevent-soft · inside shade
            nbPress: 1.5, nbOff: 5, apexXs: 6.5, apexY: 4, creepY: 2,   // nickel over the slot · walked into the apex · creeping (the blitz tell)
            safetyTwoXs: 10, safetyDeep: 13, safetyBackedUp: 18, safetyOneY: 14,   // two-high splits · depth · prevent depth · single-high depth
            boxSafetyXs: 4, boxSafetyY: 6, rolledXs: 9, rolledY: 9,              // the rolled-down strong safety in the box / over the strong side
            lbXs: 2.5, lbY: 5, lbDeepY: 11,     // linebackers · the fifth-man-out linebacker (a five-man box) plays deep
            boxX: 7, boxY: 8                     // the box the look's count is measured in (|x| ≤ boxX, y ≤ boxY)
          },
          qbDrop: { depth: -7, gunT: 0.6, underT: 1.1, paT: 0.35 },   // the default drop: to y = depth by gunT (gun) / underT (under centre), + paT on play action
          // speeds (yd/s)
          qbSpeed: { base: 4.9, perMob: 3.0 },            // MOB 50 → 6.4 · 72 → 7.1 · 99 → 7.9 (a Dual Threat who scrambles every snap makes ≈ 5 yd — viable, not better than passing)
          recSpeed: { base: 7.2, perSpeed: 2.8 },         // a receiver off his route (breaking to the ball, after the catch): speed 50 → 8.6 · 70 → 9.2 · 86 → 9.6
          defSpeed: { base: 7.6, perSkill: 2.6, pos: { CB: 1.0, NB: 0.98, S: 0.97, LB: 0.9, DL: 0.78 } },   // × by position group: a 56-skill corner 9.1 (a receiver's pace) · linebacker 8.2 · lineman 7.1
          shedSlow: 0.35,          // × speed while shed (a broken tackle / an escaped sack: he is on the ground for shedS)
          defSkillSd: 4,           // gauss sd of each defender's skill around the unit's rating (opp.db / opp.dl), drawn at the snap
          // the defence's reactions (s)
          react: { base: 0.42, perSkill: -0.22, sd: 0.06, min: 0.12, robber: 0.6, spy: 0.4, manScramble: 1.3, scramble: 0.15, chase: 0.25 },   // break on the ball after base + perSkill × skill/99 (+ jitter) · × robber / spy · on a scramble × manScramble (a man defender has his back to the QB) or × scramble (everyone else faces him: 0.15 — they see him go at once) · chase: after a catch
          // coverage technique
          man: { trail: 0.16, edgeW: 1.4, press: 0.4, off: 1.8, inside: 0.7, minTrail: 0.06, maxTrail: 0.6 },   // trail s × fit × (1 + edgeW × (rec skill − def skill)/99) · cushion yd pressed / off · inside leverage yd
          zone: { shade: 0.72, deepY: 14, deepCushion: 2.2, robberShade: 0.9 },   // move toward the nearest threat in the zone by shade · a landmark this deep stays deepCushion over the threat
          // the call matters: the play's rating vs the REAL coverage shapes the defence (no dice: geometry)
          fit: {
            trail: { GOOD: 1.55, OK: 1.0, BAD: 0.6 },    // man coverage's lag × this
            shade: { GOOD: -0.35, OK: 0, BAD: 0.5 },     // a zone landmark moves this fraction toward (+) / away from (−) the play's nearest route spot
            react: { GOOD: 1.2, OK: 1.0, BAD: 0.85 },    // the break on the ball × this
            keyR: 1.6                                    // a route spot within keyR × the zone's radius is the one it shades to
          },
          // the rush (the pocket)
          rush: {
            engageT: 0.3,          // s: a rusher is at the line (engaged) by this; no one beats his block earlier
            lineY: 0.3,            // yd: where the rush meets the line
            pocketGap: 2.6,        // yd: a held rusher is pushed back to this far in front of the drop spot by his beatAt
            converge: 0.45,        // × his split: the lanes converge on the pocket
            laneYd: 2.5,           // yd per lane number (rushers[].lane −2..2, for the scene)
            approach: 0.42,        // s: beatAt = sackAt − approach (a free rusher needs about this long from the pocket's edge to the QB)
            blitzFirst: 3,         // weight: a blitzer (not a lineman) is the first one free this much more often
            gapMin: 0.25, gapMax: 0.6,   // s: each later rusher beats his block this long after the one before
            pocketBack: 3.0,       // yd: an unblocked lineman settles this far in front of the drop
            olGap: 0.9,            // yd: a blocker stands this far between his rusher and the QB
            olNarrow: 0.85,        // × his split: an unblocked lineman's home narrows toward the pocket
            olSettle: 2            // 1/s: how fast an unblocked lineman eases to his home
          },
          pressR: 4,               // yd: a rusher inside tackleR + pressR puts pressure on the throw (scatter) and the RUSH meter
          heldPressure: 0.5,       // × a still-blocked rusher's pressure
          // the ball
          ballSpeed: { base: 18, perArm: 16, loftSlow: 0.48 },   // yd/s = (base + perArm × ARM/99) × (1 − loftSlow × loft): ARM 55 bullet 26.9 · lob 14.0 · ARM 72 bullet 29.6 · ARM 99 bullet 34
          maxLen: { base: 30, perArm: 30 },   // yd of flight the arm has (the line's arc length): ARM 55 → 46.7 · 72 → 51.8 · 99 → 60 (the far-hash deep out and the last-play heave from the 40 need a gunslinger)
          height: { release: 2.0, catch: 1.6, apexMin: 0.15, gravity: 10.7, lift: 0.8 },   // yd: out of the hand · into the hands · the apex over the chord = max(apexMin, gravity × flight² / 8) × (1 + lift × loft) (lift 0.8: a 15-yd lob peaks ≈ 4.4 yd, over a linebacker's hands; a touch pass ≈ 2.9)
          reach: { CB: 3.1, NB: 3.1, S: 3.1, LB: 3.2, DL: 3.3 },                  // yd: how high a defender's hands get with a jump (a ball above this sails over him)
          catchZone: 2.5,          // yd: the last stretch of the flight belongs to the catch contest, not the in-flight contact rolls
          laneStep: 1.5,           // yd: a defender looks for a spot on the ball's path he can beat it to (under his reach) every this — jumping the lane …
          laneR: 1.5,              // yd: … within this of him (farther off the lane he runs to the landing spot)
          scatter: { base: 0.4, perYd: 0.032, perAcc: 0.8, pressure: 0.8, running: 0.7, setV: 2.5, weather: 6, lenMul: 1.25, minYd: 1 },   // lateral sd (yd, at the end) = (base + perYd × length) × (1 − perAcc × ACC/99) × (1 + pressure × p + running × r) + weather × penalty, r = (|v| − setV) / (qbSpeed − setV) (a drifting QB is set; a sprinting one is not) · the length sd × lenMul · a short ball never dies under minYd (perAcc 0.8: ACC 72 scatters ≈ 20 % less than ACC 55)
          // contact, catch, tackle
          tackleR: 1.25,           // yd: a defender this close to the ball carrier gets a tackle (or sack) roll
          catchR: 1.3,             // yd: a receiver this close to the landing spot can catch it
          contestR: 2.0,           // yd: a defender this close to the landing spot contests the catch
          reachR: 0.9,             // yd: the ball passing this close to a defender (under his reach) is a contact roll
          shedS: 0.6,              // s: an escaped or broken tackler is out of it for this long
          targetReact: 0.15,       // s: the target breaks off his route toward the landing spot this long after the release
          hopeless: -1.0,          // s: a line no receiver reaches, thrown anyway, is meant for the one with the best margin unless even he is this far off (then it is thrown to nobody)
          sack: { base: -0.06, perMob: 0.42, max: 0.6 },   // P(escape) = base + perMob × MOB/99: 50 → 15 % · 72 → 25 % · 99 → 36 %
          tip: { base: 0.5, perSkill: 0.3, near: 0.4, blind: 0.45, held: 0.08, hBand: 0.6, hMin: 0.1, max: 0.85 },   // P(a hand on it) = (base + perSkill × skill/99) × (near + (1 − near) × closeness) × clamp((reach − h) / hBand, hMin, 1) × (blind before his react) × (held: an engaged rusher)
          int: { touch: 0.5, high: 0.35, blind: 0.4, chest: 0.7, held: 0.3, alone: 0.65, contest: 0.1 },   // P(pick | a hand on it in flight) = touch × (high when the ball is above chest height: h > reach − chest) × (blind) · at the landing: a defender alone → alone × closeness · a contested miss → contest × Σ contest
          catch: { base: 0.95, perSkill: 0.08, reachPen: 0.35, contest: 0.45, first: 1.3, heat: 0.3, heatT: 0.5, heatLoft: 0.5, min: 0.05, max: 0.98 },   // P(catch) = base + perSkill × skill/99 − reachPen × (miss/catchR)² (0.35: a ball he has to reach for at the edge of his radius is caught ≈ 1 time in 3 less — where the ball lands, the accuracy, counts) − contest × Σ contest (a defender closer to the ball than the catcher counts × first) − hot, hot = heat × (1 − flight/heatT) × (1 − loft/heatLoft) (a flat ball over a short flight is too hot to handle: a 5-yd bullet −0.19, a touch pass 0)
          drop: { base: 0.07, contest: 0.08 },   // P(drop | caught) = base × (1 − skill/99) + contest × Σ contest
          tackle: { base: 0.04, perSkill: 0.14, perSpeed: 0.1, defSkill: 0.14, min: 0.03, max: 0.5 },   // P(broken tackle) = base + perSkill × skill/99 + perSpeed × speed/99 − defSkill × def skill/99
          evade: { r: 6, w: 0.6, upW: 0.3, minUp: 0.35, sideR: 3, look: 5 },   // the ball carrier bends away from defenders inside r (weight w laterally, × upW along the field), never less than minUp upfield, off a sideline inside sideR, steering at a point look yd ahead
          pursueBurst: 1.1,        // × a pursuer's speed after a catch / on a scramble (everybody runs to the ball)
          pursueLead: 1.2,         // s: a pursuer aims at the point he meets the carrier, at most this far ahead (and this far ahead when he cannot meet him: the angle)
          intReturnS: 0.9,         // s: the interceptor's return after the pick (presentation; the result is already in)
          away: { out: 3, depth: 10, minY: 2, loft: 0.3 },   // live.throwAway(): this far past the nearer sideline, this far downfield of the QB (never short of minY), thrown with this loft
          present: { carryH: 1.2, popH: 2.2, popV: 3.2, popG: 9, fallV: 6 },   // presentation after DONE (no rules): the carried ball's height · a tipped ball's pop (h = popH + popV·u − popG·u²) · a dead ball falls at fallV yd/s
          openSep: { lo: 1.0, hi: 4.6 },   // yd of separation → live.receivers[i].open 0 … 1
          ghostT: 4,               // s: snap pre-runs the play this long (no QB, no rolls) to record each receiver's separation curve
          ghostFrom: 0.8,          // s: … and looks for each curve's peak from here on (the snap and the rotation are not a window)
          sampleDt: 0.1,           // s: … sampled every this
          auto: { times: [1.2, 1.6, 2.0, 2.4], loft: 0.45, awayEarly: 0.4 }   // Play.autoPlan (the headless shell): the release times it tries · its touch · the throw-away this long before sackAt when nothing is on
        },

        // ═══ DRAWING (the scene reads these; live.classify applies the engine's share) ═══
        draw: {
          slowMo: 0.15,            // the play's speed while a finger is drawing
          slowMoBudgetS: 4,        // REAL seconds of slow motion per play; then time returns to full speed
          startR: 2.5,             // yd: a draft must start this close to the QB (the scene: never under 22 css px)
          minLen: 2,               // yd: a shorter line is nothing
          reachSlack: 0.2,         // s: a receiver this late to the line's end still makes it a PASS (he gets a hand to it)
          greenMargin: 0.3,        // s: the preview is GREEN when nobody can contest the spot until this long after the ball …
          greenReach: 0.1,         // s: … and the target gets there at least this early (room for the scatter; 0.1: a man in stride on his route to the spot can be GREEN — catchR / his speed ≈ 0.14 s)
          redReach: -0.05,         // s: a target who gets there later than this after the ball makes the preview RED (he will not make it)
          previewLowBand: 0.5,     // yd: the line passing a defender this far under his reach is RED (a pick at chest height)
          previewPad: 0.3,         // yd: added to reachR for the preview's in-flight check (the defender will move)
          previewHot: 0.1,         // a line whose hot-ball catch penalty (field.catch.heat) reaches this is never GREEN (take something off it)
          previewIq: 70,           // IQ at or above this sees the preview colour (the FIELD GENERAL's perk)
          loft: { fastHps: 2.4, slowHps: 0.5 },   // canvas-heights per second of drawing: this fast or faster → a bullet (loft 0), this slow or slower → a lob (1)
          assistYd: 3.5,           // yd: a PASS line's end this close to the target's reachable spot snaps onto it (aim assist; 3.5: a new player's line at where the man IS snaps to where he is going on most short routes)
          resampleYd: 0.75,        // yd: the scene resamples the drawn points to this spacing
          maxPoints: 600           // points: longer polylines are thinned (classify stays cheap)
        },

        // The run options.
        run: {
          sneak: { base: 0.70, perYd: 0.15, lineW: 0.25, boxPer: -0.04, boxAnchor: 7, min: 0.1, max: 0.95 },   // P = base − perYd × (toGo − 1) + lineW × (ol − dl)/99 + boxPer × (box − 7)
          draw: { mean: 2.5, sd: 4, lineW: 4, look: { BLITZ: 3, PREVENT: 2, COVER4: 1, MAN: 0, COVER2: 0, COVER3: 0 }, breakP: 0.06, breakMin: 10, breakMax: 25, min: -3, max: 40 }
        },

        // PlayResult.feedback label thresholds (timing: the arrival vs the target's separation plateau from the snap's pre-run).
        feedback: {
          early: 0.15,             // s before the plateau → EARLY
          late: 0.15,              // s after it → LATE …
          tooLate: 0.8,            // … and this far after → TOO LATE
          plateau: 0.75,           // the plateau spans where the separation ≥ this × its peak
          bullet: 0.33, lob: 0.67, // loft under bullet → BULLET, at or over lob → LOB, between → TOUCH
          money: 1.5               // yd: a caught ball this close to where the route had him → ON THE MONEY
        },

        // The demo's drive script (six snaps).
        drive: {
          thirdMedium: { toGo: [4, 6], yl: [25, 45], clock: [300, 800] },
          thirdLong: { toGo: [8, 12], yl: [20, 40], clock: [200, 700] },
          redZone: { down: [2, 3], toGo: [5, 9], yl: [82, 90], clock: [300, 800] },
          shortYardage: { down: [3, 4], toGo: [1, 2], yl: [40, 60], clock: [120, 600] },
          twoMinute: { down: [1, 2], toGo: 10, yl: [45, 60], clock: [35, 58], deficit: [1, 3] },
          lastPlay: { fromGoal: [30, 45], clock: [3, 8], deficit: [4, 5] },
          openingLead: [0, 3, 7]   // the opponent's opening score in the first snap (us 0): one of these (a real score — no 0-1 or 0-4 scoreboards)
        },

        // The demo's team presets (title screen: BAD LINE / AVERAGE / GREAT LINE). `wr` is the five-man roster
        // buildContext expects in situation.team.wr; `dl` / `db` are what situation.opp carries.
        demo: {
          teams: {
            BAD: {
              ol: 30, dl: 78, db: 62,   // db 62 and skills in the 40s–50s: the bad LINE is the story (1.95 s pocket vs 2.85 behind the great line), the secondary costs ≈ 5 points, not 10
              wr: [
                { slot: 'WR1', name: 'T. Vance', skill: 52, speed: 62 },
                { slot: 'WR2', name: 'R. Okafor', skill: 46, speed: 55 },
                { slot: 'SLOT', name: 'J. Pruitt', skill: 49, speed: 50 },
                { slot: 'TE', name: 'B. Holm', skill: 44, speed: 38 },
                { slot: 'RB', name: 'D. Sykes', skill: 48, speed: 58 }
              ]
            },
            AVERAGE: {
              ol: 58, dl: 55, db: 56,
              wr: [
                { slot: 'WR1', name: 'D. Cross', skill: 66, speed: 70 },
                { slot: 'WR2', name: 'M. Reyes', skill: 58, speed: 64 },
                { slot: 'SLOT', name: 'K. Abara', skill: 60, speed: 60 },
                { slot: 'TE', name: 'S. Lindqvist', skill: 55, speed: 44 },
                { slot: 'RB', name: 'A. Booker', skill: 56, speed: 66 }
              ]
            },
            GREAT: {
              ol: 80, dl: 50, db: 52,   // db 52: the great line buys the pocket; the receivers are the difference, the secondary is merely average
              wr: [
                { slot: 'WR1', name: 'Z. Moreau', skill: 82, speed: 86 },
                { slot: 'WR2', name: 'C. Whitfield', skill: 74, speed: 78 },
                { slot: 'SLOT', name: 'E. Tanaka', skill: 76, speed: 72 },
                { slot: 'TE', name: 'G. Marchetti', skill: 70, speed: 52 },
                { slot: 'RB', name: 'L. Batiste', skill: 70, speed: 80 }
              ]
            }
          },
          // Used when situation.team.wr is a single number (a skill level) or missing: five generic receivers.
          defaultRoster: [
            { slot: 'WR1', name: 'WR1', skillAdd: 6, speedAdd: 8 },
            { slot: 'WR2', name: 'WR2', skillAdd: 0, speedAdd: 4 },
            { slot: 'SLOT', name: 'SLOT', skillAdd: 2, speedAdd: 0 },
            { slot: 'TE', name: 'TE', skillAdd: -4, speedAdd: -14 },
            { slot: 'RB', name: 'RB', skillAdd: -2, speedAdd: 6 }
          ],
          defaultTeam: 'AVERAGE',
          defaultArchetype: 'FIELD_GENERAL'
        },

        // Weather penalties on the throw (the situation's weather object: {weather, wind: {speed, dir}, tempF}).
        weather: {
          windFree: 5,             // mph of wind that cost nothing …
          windPerMph: 0.004,       // … then accuracy − windPerMph per mph above it …
          windLoftBase: 0.6, windLoftPer: 0.8,   // … × (0.6 + 0.8 × loft): a floated ball rides the wind
          byWeather: { clear: 0, dome: 0, heat: 0, fog: 0.01, cold: 0.02, rain: 0.04, snow: 0.07 },   // accuracy penalty by weather kind
          coldBelowF: 35, coldPer: 0.001    // − coldPer per °F under coldBelowF (a frozen ball)
        }
      },

      // ───────────────────────────── WEATHER (kicker §2.5.5, read by engine/weather.js) ─────────────────────────────
      weather: {
        climates: {
          warm: { temp: [82, 78, 70, 64, 60], rain: 0.18, snow: 0 },
          temperate: { temp: [74, 64, 52, 44, 40], rain: 0.15, snow: 0.25 },
          cold: { temp: [68, 55, 42, 32, 26], rain: 0.12, snow: 0.48 },
          dome: { temp: [70, 70, 70, 70, 70], rain: 0, snow: 0 }
        },
        months: ['Sep', 'Oct', 'Nov', 'Dec', 'Jan'],
        monthByWeek: {                       // last week of each month index 0..3; beyond → last month
          COLLEGE: [4, 8, 12, 99],
          NFL: [4, 8, 13, 18]
        },
        tempSd: 7, snowTempBelow: 34, coldBelow: 35, heatAbove: 88,
        fogProb: 0.03, fogClimates: ['temperate', 'cold'],
        wind: { rayleighSigma: 5, windyMult: 1.4, perKickSd: 1.5, dirMax: 359 },
        surface: { domeTurf: 1.0, coldOrWindyTurf: 0.5, otherTurf: 0 }
      },

      // ───────────────────────────── DIFFICULTY (only the wind cap Weather.forGame defaults to) ─────────────────────────────
      difficulty: {
        pro: { windCap: 20 }                 // mph: Weather.forGame(rng, venue, week, league) with no explicit cap
      }
    };
  }

  RTG.Tuning = TuningDefaults();
  RTG.TuningDefaults = TuningDefaults;
})(typeof window !== 'undefined' ? window : globalThis);
