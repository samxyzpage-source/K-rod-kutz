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
 *   open        the openness curves: how wide a window a route gets against a coverage
 *   route       receiver speed → route timing
 *   throw       the throw model: flight, the green band, accuracy, completion, interception, YAC, drops
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
          FIELD_GENERAL: { ARM: 55, ACC: 58, IQ: 72, MOB: 50, POI: 60, signature: 'IQ' },    // reads the look, sees windows early
          DUAL_THREAT:   { ARM: 56, ACC: 52, IQ: 50, MOB: 72, POI: 55, signature: 'MOB' }    // scramble yards, sack escapes
        },

        // The pre-snap read.
        read: {
          disguise: 0.40,          // base probability that the SHOWN look is a disguise of the real coverage
          iqSees: 0.85,            // the share of that probability IQ 99 removes: p = disguise × (1 − IQ/99 × iqSees)
          iqExact: 80,             // IQ at or above this → the card's advice is the rating vs the REAL coverage
          goodOffered: 0.85,       // probability that at least one option is GOOD vs the real coverage
          revealBase: 1.6,         // s after the snap the UI may show the openness rings at IQ 0 …
          revealIq: 1.2,           // … minus IQ/99 × this (IQ 50 → 0.99 s · IQ 72 → 0.73 s · IQ 99 → 0.40 s)
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
          base: { COVER2: 0.20, COVER3: 0.30, COVER4: 0.15, MAN: 0.20, BLITZ: 0.10, PREVENT: 0.05 },
          longToGo: 7,             // 3rd/4th and at least this → the "long" multipliers
          long: { BLITZ: 1.8, COVER2: 0.8, PREVENT: 0.6 },
          shortToGo: 2,            // toGo ≤ this → the "short" multipliers
          short: { MAN: 1.3, BLITZ: 1.3, COVER4: 0.5, PREVENT: 0 },
          redZoneYl: 80,           // yl ≥ this → the red-zone multipliers (COVER4 less, MAN more)
          redZone: { COVER4: 0.4, MAN: 1.4, COVER2: 1.2, PREVENT: 0 },
          lateClock: 120,          // Q4 with the clock at or under this and the DEFENCE leading → PREVENT
          late: { PREVENT: 6, BLITZ: 0.6, COVER4: 1.3 }
        },

        // The sack clock (seconds after the snap when the first rusher arrives).
        pressure: {
          base: 3.05,              // s for an even line battle, neutral coverage, POI 50
          olW: 0.025,              // s per point of (ol − 50) …
          dlW: 0.025,              // … minus s per point of (dl − 50); the sum is softened below
          up: 0.30,                // soft cap of the line's GAIN (tanh): a great line buys at most ≈ +0.3 s
          down: 1.30,              // soft cap of the line's LOSS: a bad line loses at most ≈ −1.3 s
          poiW: 0.004,             // s per point of (POI − 50): poise buys a beat in the pocket
          mulExp: 0.4,             // the coverage's pressureMul enters as sackAt ÷ pressureMul^mulExp (BLITZ 1.6 → ×0.83 · PREVENT 0.7 → ×1.15)
          clutchMul: 0.15,         // in the clutch sackAt × (1 − clutchMul × (1 − POI/99)): the rush "feels" faster to a nervous QB
          clutchClock: 120,        // Q4 with the clock at or under this and the game within one score → clutch
          clutchMargin: 8,         // … "within one score"
          sigma: 0.25,             // s: gauss jitter of sackAt in buildContext
          snapSigma: 0.10,         // s: a second, smaller jitter in snap (the same look never plays twice the same)
          min: 1.2, max: 4.2,      // s clamp
          rushers: { base: 2, blitz: 3, laneGapMin: 0.25, laneGapMax: 0.9 }   // rush lanes: count · the later lanes arrive sackAt + [min, max] s
        },

        // Openness curves (0 = blanketed, 1 = wide open), per receiver, over the ARRIVAL time t ∈ [0, 4].
        open: {
          sampleDt: 0.1,           // s between samples (41 samples over 0..4)
          maxT: 4,                 // s: the last sample; later times hold the last value
          base: 0.70,              // peak openness before the modifiers
          tightW: 0.50,            // − tightW × coverage.tightness[family]
          skillW: 0.35,            // + skillW × (receiver skill − opp.db)/99 …
          manMul: 1.6,             // … × this against MAN (a matchup coverage)
          vs: { GOOD: 0.20, OK: 0.02, BAD: -0.22 },   // + the play's rating vs the REAL coverage
          noiseSd: 0.08,           // gauss on the peak per receiver
          shiftSd: 0.15,           // s: gauss shift of the receiver's window
          min: 0.05, max: 0.98,    // peak clamp
          floor: 0.05,             // openness before the break and far after the window
          rise: 0.5,               // s: the window opens linearly over this before window.open
          fall: 0.7,               // s: … and closes over this after window.close
          lateFrac: 0.15,          // the openness left after the fall, as a fraction of the peak (a late ball is contested)
          checkdownFloor: 0.35,    // the checkdown's peak is never below this (it is always a little open)
          hotBonus: 0.20,          // the hot read's peak bonus under a real BLITZ …
          hotEarlier: 0.15,        // … and how much earlier (s) its window opens
          windowFrac: 0.75,        // the reported window {from, to} spans where open(t) ≥ windowFrac × peak
          ring: { open: 0.45, closing: 0.25 }   // the scene's ring colours: green ≥ open (= throw.intWindow: never picked) · gold ≥ closing · red below
        },

        // Receiver speed → route timing. A route's waypoints are timed for an average receiver; a fast one
        // runs them in less time: tRoute = tWaypoint × speedBase / (speedBase + speedPer × (speed − 50)).
        route: {
          speedBase: 1.0, speedPer: 0.004,   // speed 99 → ×0.836 of the waypoint times · speed 30 → ×1.087
          qbDrop: 7,               // yd behind the LOS the QB throws from (the top of the drop)
          endZoneCap: 10           // yd: a route never runs deeper than the back of the end zone (100 − yl + this)
        },

        // The throw.
        throw: {
          velocity: 24,            // yd/s reference ball speed (× arm × power below); a 30-yd throw ≈ 1.3 s
          armBase: 0.7, armPer: 0.3,          // × (0.7 + 0.3 × ARM/99)
          powerBase: 0.85, powerPer: 0.3,     // × (0.85 + 0.3 × power); power 0..1.15
          powerMax: 1.15,
          loftTime: 0.30,          // flight × (1 + loftTime × loft): touch hangs in the air
          maxDist: 48,             // yd × (0.75 + 0.35 × ARM/99): the deep range; beyond it the ball dies (ARM 55 → 45 · 99 → 53)
          rangeBase: 0.75, rangePer: 0.35,
          beyondRangePen: 0.06,    // accuracy − this per yard beyond the range
          // the green band: the on-time power for the throw's distance is need(dist) = needBase + dist / (range × arm);
          // the band is [need, need + greenBand(ACC)] with greenBand = base + perAcc × ACC/99
          needBase: 0.15, range: 50,
          greenBand: { base: 0.16, perAcc: 0.10 },
          greenQuality: 0.88,      // an engine-verified `green` claim floors quality here (the UI's own rim value)
          minCommit: 0.08,         // a release under this power is a stray tap (the UI never sends it; the engine treats it as a throwaway)
          hotBallPen: 0.8,         // fit − hotBallPen × (power − (need + greenBand)) when the ball is thrown too hard to catch
          // fit = 1 − |lead − ideal.lead| × leadW − |loft − ideal.loft| × loftW
          leadW: 0.35, loftW: 0.35,
          // accuracy = ACC/99 × accW + quality × qualW + fit × fitW − pressure − weather
          accW: 0.60, qualW: 0.22, fitW: 0.18,
          pressPen: 0.15,          // full penalty at the sack …
          pressWindow: 0.7,        // … tapering to 0 this many seconds before it
          poiRelief: 0.6,          // × (1 − POI/99 × poiRelief)
          // completion probability = sigmoid(k × (accuracy × accMul + window × windowMul − bias))
          k: 7.5, accMul: 1.0, windowMul: 0.6, bias: 1.13,
          // interception: only when the window is closed AND the ball is not perfect: intBase × (1 − window)
          intWindow: 0.45, intAcc: 0.92, intBase: 0.40,
          drop: 0.08,              // drop probability × (1 − skill/99)
          yac: {
            base: { SHORT: 6.0, MID: 3.5, DEEP: 4.0 },   // yd by route family …
            speedBase: 0.6, speedPer: 0.4,               // … × (0.6 + 0.4 × speed/99)
            windowBase: 0.6, windowPer: 0.4,             // … × (0.6 + 0.4 × window): a contested catch has no room to run
            screenBonus: 4,                              // + this on a SCREEN
            sd: 3, min: 0                                // gauss sd · floor
          },
          sackYards: { mean: -7, sd: 2, min: -12, max: -1 },   // yards on a sack
          scramble: {
            minMob: 55,            // the SCRAMBLE button appears at MOB ≥ this (the engine accepts it always)
            base: 2, perMob: 0.08, // yd = base + perMob × MOB + look bonus + gauss
            look: { COVER2: 1, COVER3: 1, COVER4: 2, MAN: 3, BLITZ: 2, PREVENT: 3 },
            boxPer: -0.5, boxAnchor: 6,   // + boxPer × (box − 6): a stacked box has nowhere to run
            sd: 3, sd2: 2.5, min: -2, max: 30,   // sd in snap · a second sd in throw · clamp
            escape: 0.55, escapeMob: 0.5,        // P(escape a sack on SCRAMBLE) = escape × MOB/99 + … − escapeMob × (1 − MOB/99)
            fumble: 0.06, fumbleMobFree: 60      // P(fumble) = fumble × max(0, 1 − MOB/fumbleMobFree)
          },
          scatter: { sd: 2.5, min: 0.3, leadYd: 3 },    // landing scatter (yd): sd × (1 − accuracy) + min; lead error × leadYd downfield
          meterHoldMs: 1300,       // the velocity meter climbs 0 → powerMax over this (the scene reads it)
          uiFlightScale: 0.75      // the scene animates the flight over flight × this
        },

        // The run options.
        run: {
          sneak: { base: 0.70, perYd: 0.15, lineW: 0.25, boxPer: -0.04, boxAnchor: 7, min: 0.1, max: 0.95 },   // P = base − perYd × (toGo − 1) + lineW × (ol − dl)/99 + boxPer × (box − 7)
          draw: { mean: 2.5, sd: 4, lineW: 4, look: { BLITZ: 3, PREVENT: 2, COVER4: 1, MAN: 0, COVER2: 0, COVER3: 0 }, breakP: 0.06, breakMin: 10, breakMax: 25, min: -3, max: 40 }
        },

        // PlayResult.feedback label thresholds.
        feedback: {
          early: 0.15,             // s before window.from → EARLY
          late: 0.15,              // s after window.to → LATE …
          tooLate: 0.8,            // … and this far after → TOO LATE
          leadOff: 0.35,           // |lead − ideal| above this → OVERTHROWN / UNDERTHROWN (deep) or LED / BEHIND (crossing)
          loftOff: 0.30            // |loft − ideal| above this → BULLET / FLOATED
        },

        // The demo's drive script (six snaps).
        drive: {
          thirdMedium: { toGo: [4, 6], yl: [25, 45], clock: [300, 800] },
          thirdLong: { toGo: [8, 12], yl: [20, 40], clock: [200, 700] },
          redZone: { down: [2, 3], toGo: [5, 9], yl: [82, 90], clock: [300, 800] },
          shortYardage: { down: [3, 4], toGo: [1, 2], yl: [40, 60], clock: [120, 600] },
          twoMinute: { down: [1, 2], toGo: 10, yl: [45, 60], clock: [35, 58], deficit: [1, 3] },
          lastPlay: { fromGoal: [30, 45], clock: [3, 8], deficit: [4, 5] },
          openingLead: [0, 7]      // the opponent's opening score in the first snap (us 0)
        },

        // The demo's team presets (title screen: BAD LINE / AVERAGE / GREAT LINE). `wr` is the five-man roster
        // buildContext expects in situation.team.wr; `dl` / `db` are what situation.opp carries.
        demo: {
          teams: {
            BAD: {
              ol: 30, dl: 78, db: 70,
              wr: [
                { slot: 'WR1', name: 'T. Vance', skill: 48, speed: 62 },
                { slot: 'WR2', name: 'R. Okafor', skill: 42, speed: 55 },
                { slot: 'SLOT', name: 'J. Pruitt', skill: 45, speed: 50 },
                { slot: 'TE', name: 'B. Holm', skill: 40, speed: 38 },
                { slot: 'RB', name: 'D. Sykes', skill: 44, speed: 58 }
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
              ol: 80, dl: 50, db: 48,
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
