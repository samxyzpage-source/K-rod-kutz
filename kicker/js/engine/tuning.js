/**
 * Road to Glory: Kicker — RTG.Tuning
 *
 * The single home for every balance constant in the game (SPEC §2, §3).
 * Nobody hardcodes a number elsewhere; tests read from here.
 *
 * DEVIATION (agreed): the tree is NOT Object.freeze'd. Modules capture
 * `RTG.Tuning` at load time and `RTG.debug.tune(path, value)` must be able to
 * set values in place at runtime. `RTG.TuningDefaults()` returns a fresh deep
 * copy of the pristine tree so debug code can reset. The purity test checks
 * that no other engine file assigns into Tuning.
 *
 * Owner: E1. Other engineers may ADD keys with targeted edits; never rename or
 * remove existing keys.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};

  /** @returns {object} a brand-new copy of the default constant tree */
  function TuningDefaults() {
    return {

      // ───────────────────────────── §2.3 KICK ─────────────────────────────
      kick: {
        // §2.3.1 geometry (yards)
        geometry: {
          H: 3.083,            // half-width of the uprights (18.5 ft / 2)
          R_POST: 0.10,        // post band: ball touching the post
          XBAR: 3.333,         // crossbar height
          XBAR_BAND: 0.18,     // ± band around the crossbar height
          LINE_DRIVE_H: 1.5,   // h(D) below this → sub 'LINE_DRIVE'
          DEAD_CENTER_X: 0.8,  // |x| below this → sub 'DEAD_CENTER'
          SNEAKS_X: 2.5        // |x| above this (and good) → sub 'SNEAKS'
        },
        // distance = yards-to-goal + hold + end zone; PAT distances by league
        distance: {
          losToKick: 17,       // 7-yd hold + 10-yd end zone
          patCollege: 20,
          patNfl: 33
        },
        // §2.3.1 hash marks
        hash: {
          ballXNfl: 3.083,
          ballXCollege: 6.667,
          snapDist: {                          // probability of L / M / R snap spot
            NFL: { L: 0.40, M: 0.20, R: 0.40 },
            COLLEGE: { L: 0.45, M: 0.10, R: 0.45 }
          },
          sigmaMiddle: 1.00, sigmaNfl: 1.03, sigmaCollege: 1.08
        },
        // §2.3.2 range and flight
        range: {
          base: 37, perPow: 0.31,              // maxFG = (37 + 0.31·POW)·rangeMult + rangeAdd
          weatherMult: { clear: 1.00, dome: 1.00, heat: 1.01, rain: 0.97, fog: 1.00, cold: 0.95, snow: 0.93 },
          tempPenaltyPerDeg: 0.002, tempPenaltyBelowF: 40,   // (1 − 0.002·max(0, 40 − tempF)) outdoors
          altitudeMult: 1.03,
          windAlongPerMph: 0.15,               // rangeAdd += 0.15·windAlong (SPEC BUMP: was 0.30 — 20 mph tail = +3 yd, keeps career longs near the record book)
          KCB: 4.942,                          // XBAR / tan(34°)
          launchDeg: 34, tanLaunch: 0.6745,    // h(D) = tan(34°)·D·(1 − D/carry)
          rneedMinD: 8,                        // D ≤ KCB+1 → treat as 8
          flightBase: 1.0, flightPerYd: 0.026, // t = 1.0 + 0.026·D
          uiFlightScale: 0.75,
          powerMax: 1.15, aimMax: 12,
          launchClampDeg: 60,                  // numerical guard for the tan() projection of the launch angle
          contactPowerBase: 0.92, contactPowerQuality: 0.08   // Peff = power·(0.92 + 0.08·quality)
        },
        // §2.3.3 lateral error model (degrees)
        sigma: {
          accWeight: 0.7, conWeight: 0.3, attrDiv: 99,   // s = (0.7·ACC_eff + 0.3·CON)/99
          base: 1.746, spread: 5.82,                     // σ_base = 1.746 + 5.82·(1 − s)²  (spec 1.8 / 6.0 × 0.97: re-fitted by Monte Carlo so the §2.3.6 table centres on its targets with the harness's contact/aim/shank terms; college 2.98 · rookie 2.72 · vet 2.03 · elite 1.78)
          distPerYd: 0.018, distFrom: 40,                // σ_dist = 1 + 0.018·max(0, D − 40)
          pressBase: 0.9, pressPerClu: 0.008,            // σ_press = 1 + p·(0.9 − 0.008·CLU)
          weather: { clear: 1.00, dome: 1.00, heat: 1.02, fog: 1.00, rain: 1.12, cold: 1.06, snow: 1.25 },
          turfPrecipMult: 1.04,
          powerFrom: 0.80, powerPer: 0.10,               // σ_power = 1 + 0.10·max(0, power − 0.80)
          overPer: 2.5,                                  // σ_over = 1 + 2.5·max(0, power − 1.0)
          slumpMult: 1.12,
          hesitationDegPer100ms: 0.15, hesitationFromMs: 1200, hesitationCluBelow: 70
        },
        shank: { base: 0.05, perCon: 0.0004, min: 0.005, max: 0.06, sigmaMult: 3 },
        contact: { degPerQuality: 4.0, signProb: 0.5 },  // contact = (1 − q)·degPerQuality·±1 (sign draw p = 0.5); 4.0 fitted so quality 0.5 costs 5–12 pts (§5.1)
        overBias: { deg: 1.2, zone: 0.15 },              // 1.2·max(0, power − 1)/0.15·footSign
        wind: { driftCoeff: 0.025, legendGustSd: 0.30 }, // windDriftYd = 0.025·windCross·t²
        // §2.3.7 pressure
        pressure: {
          base: 0.05, late: 0.30, decisive: 0.30, asTimeExpires: 0.10, playoff: 0.15,
          rivalry: 0.10, away: 0.08, longDist: 0.07, longDistFrom: 50,
          missStreak: 0.10, missStreakFrom: 2, iced: 0.15, iceImmuneClu: 90,
          fansRelief: 0.10, fansReliefFrom: 80,
          lateClockSec: 300, decisiveClockSec: 120,
          clutchThreshold: 0.6,
          iceFameAdd: 0.10, iceFameFrom: 500,
          swayDeg: 0.5, swayCluDiv: 120,
          collegeOtBase: 0.9, otMin: 0.35,
          heartbeatMin: 60, heartbeatRange: 90
        },
        // §2.3.5 blocks
        block: {
          base: 0.006, perOppSt: 0.00015, oppStAnchor: 60,
          lowTraj: 0.020, allOut: 0.030, perCon: 0.00008, conAnchor: 50,
          min: 0.002, max: 0.15,
          lowTrajPeff: 0.97, lowTrajRangeMargin: 3,
          scoopTdProb: 0.03, patReturnProb: 0.02
        },
        // §2.3.4 doinks
        doink: { xbarIn: 0.50, uprightInInside: 0.45, uprightInOutside: 0.25 },
        // §2.3.8 AI input rule (difficulty-independent)
        ai: {
          powerAdd: 0.15, powerMinAdd: 0.05, powerFloor: 1.0, powerCap: 1.08, powerSd: 0.02,
          windCompBase: 0.65, windCompPerAcc: 0.30, aimSd: 0.5,
          qualityBase: 0.80, qualityPerCon: 0.15, qualitySd: 0.06, qualityMin: 0.4, qualityMax: 1.0,
          modelQuality: 0.85, powerNoiseSd: 0.02    // Kick.model.pClear: sd of the AI power noise (= powerSd) × Peff quality factor × carryMax
        },
        // §2.3.10 kickoffs
        kickoff: {
          hangBase: 3.4, hangPerKo: 0.012, hangTiming: 0.3, hangSd: 0.12,
          distBase: 55, distPerKo: 0.105, distTiming: 4, distSd: 4,   // distPerKo fitted (spec 0.22) so auto touchbacks ≈ 35 % @ KO 50, ≈ 75 % @ KO 90
          kickFromYard: 35,
          touchbackDist: 65, touchbackYard: { NFL: 30, COLLEGE: 25 },
          returnBase: 28, returnPerYdShort: 0.4, returnHangAnchor: 3.9, returnPerHangSec: 6,
          returnSd: 7, returnMin: 5, returnMax: 60, returnTdProb: 0.015,
          oobTiming: 0.9, oobYard: 40,
          onsideProb: 0.10, onsideTrainedProb: 0.18, onsideDist: 10,   // onside kicks travel ~10 yd from the kick spot
          greenZoneBase: 12, greenZonePerKo: 0.35,
          autoTiming: 0.2,                     // |timing| used for simulated (input null) kickoffs
          autoTouchbackTarget: { ko50: 0.35, ko90: 0.75 }   // §5.1 kick test targets
        },
        // balance-table profiles (§2.3.6) used by tests
        profiles: {
          college: { ACC: 55, CON: 50, CLU: 50, POW: 58 },
          rookie: { ACC: 60, CON: 55, CLU: 55, POW: 62 },
          vet: { ACC: 78, CON: 75, CLU: 70, POW: 72 },
          elite: { ACC: 92, CON: 90, CLU: 88, POW: 82 }
        },
        // scoring (§2.3.4 / §2.3.5)
        points: { FG: 3, PAT: 1, blockReturnFg: 6, blockReturnPat: 2 },
        // context defaults when no game / opponent is known (sessions, pMakeAt)
        defaults: { oppST: 70, tempF: 70, surface: 'grass', weather: 'clear' },
        // §3.4 KickResult.feedback labels
        feedback: {
          timing: { pure: 0.90, good: 0.75, fair: 0.50 },          // quality thresholds → PURE / GOOD / FAIR / POOR
          powerFullAbove: 0.15,                                     // power > pNeed + 0.15 → FULL (> 1.0 → OVERSWING; < pNeed → WEAK)
          explain: { windYd: 1.0, contactDeg: 0.9, aimDeg: 1.5, errDeg: 2.0, shortYd: 1.0 },   // "what the coach saw" thresholds
          ftPerYd: 3
        },
        // debug forced outcomes (opts.forced): geometry of the synthetic result, in yards
        forced: { goodX: 0.4, wideMargin: 1.5, shortMargin: 1.0, clearMargin: 2.0, sneaksX: 2.8 }
      },

      // ───────────────────────────── §2.5 SIM ─────────────────────────────
      sim: {
        drive: {
          outcomes: ['TD', 'STALL', 'PUNT', 'TO', 'DOWNS'],
          base: {
            NFL: { TD: 0.22, STALL: 0.18, PUNT: 0.42, TO: 0.11, DOWNS: 0.04 },
            COLLEGE: { TD: 0.26, STALL: 0.17, PUNT: 0.36, TO: 0.13, DOWNS: 0.06 }
          },
          shift: { TD: 0.30, STALL: 0.04, PUNT: -0.26, TO: -0.06, DOWNS: -0.02 },   // per unit edge
          time: {                                                                      // seconds, mean ± sd
            TD: { mean: 200, sd: 55 }, STALL: { mean: 195, sd: 55 }, PUNT: { mean: 145, sd: 45 },
            TO: { mean: 110, sd: 40 }, DOWNS: { mean: 170, sd: 45 }
          },
          minTimeSec: 30, pMin: 0.02, edgeDiv: 100, homeAdv: 3,
          stallYtg: { NFL: { mean: 25, sd: 12 }, COLLEGE: { mean: 23, sd: 12 }, min: 1, max: 50 },
          puntStart: { mean: 30, sd: 10, min: 5, max: 60 },                            // opponent own-yard after a punt
          turnoverYtg: { mean: 45, sd: 20 },
          downsYtg: { mean: 40, sd: 15 },                                              // E2 (sim.js): spot of a failed 4th down (yards-to-goal of the offence)
          ratingNoiseSd: 3, perGameNoiseDraws: 4
        },
        clock: { quarterSec: 900, quarters: 4, halfQuarter: 2, otSecNfl: 600,
                 timeoutsPerHalf: 3, coinP: 0.5, fgPlaySec: 5 },                          // E2 (sim.js): timeouts per half · coin toss · seconds a FG play burns
        possession: {                                                                       // E2 (sim.js): field-position rules
          minPossessionSec: 30,        // less than this left in the half → kneel (H1) / heave (trailing by > script.maxDeficit) / kneel (leading)
          defaultStartYtg: 75,         // safety net when a possession starts without a known spot
          holdYards: 7,                // missed FG: defence takes over at the spot of the kick (LOS + 7)
          missedFgMinOwn: 20           // …but never inside its own 20 (touchback rule)
        },
        kickoffRules: { onsideClockSec: 120 },                                              // E2 (sim.js): trailing team kicking off in Q4 with ≤ 2:00 → onside kick
        points: { TD: 6, twoPoint: 2 },                                                     // E2 (sim.js): scoring plays that are not kicks
        hurryUp: { clockSec: 300, timeMult: 0.55, shifts: { TD: 0.06, STALL: 0.10, PUNT: -0.16 } },
        endHalfFg: { clockSec: 40, pMakeMin: 0.20 },
        kneel: { clockSec: 120, p: 0.5, pNoTimeouts: 0.9 },
        script: {                                                   // §2.5.3 end-of-game play-by-play
          triggerClockSec: 240, maxDeficit: 3, ytg: { mean: 72, sd: 8 },
          toProb: 0.015, incompleteProb: 0.33, gain: { mean: 7.5, sd: 9 },
          runoffProb: 0.5, runoffSec: 20, timeoutClockSec: 60, playSec: 6,
          rangeMargin: 3, clockFgSec: 8, fourthDownPMake: 0.15, fourthDownConvert: 0.50,
          fgClockSec: 25, fgDown3ClockSec: 45,
          toGo: 10                                                  // E2 (sim.js): yards for a first down
        },
        twoPoint: { deficits: [2, 5, 8, 10, 16], convert: 0.47 },
        decisive: { clockSec: 120 },
        ot: {
          nfl: { periodSec: 600, bothPossessUnlessTd: true, regSeasonSinglePeriod: true, timeouts: 2 },   // timeouts: E2 (sim.js) per OT period
          college: {
            ytg: 25, table: { TD: 0.40, STALL: 0.40, TO: 0.12, DOWNS: 0.08 },
            stallYtg: { mean: 12, sd: 8, min: 1, max: 25 },
            twoPtFromPeriod: 2, onlyTwoPtFromPeriod: 3, pressureBase: 0.9
          },
          maxQ: 20                                                  // E2 (sim.js): gs.q ceiling (Schema.validate allows 1–20)
        },
        coach: {                                                    // §2.5.6 attempt decision
          thrBase: 0.55, trustW: 0.20, aggW: 0.10, collegeAdd: 0.05, asTimeExpiresSub: 0.35,
          thrMin: 0.15, thrMax: 0.60, defaultTrust01: 0.5, rangeMargin: 3,
          longAttemptFrom: 57, longAttemptAdd: 0.20,                 // SPEC BUMP: coaches want extra confidence before a 58+ yd try
          goForItYtg: 40, goForItProb: 0.15, convertProb: 0.45, convertYtgGain: 6,
          puntNet: { mean: 38, sd: 8 }, puntCapOwn: 20,
          giveMe60Thr: -0.10, under55Thr: 0.10,
          giveMe60Dist: 55, giveMe60Fame: 15,                       // E2 (sim.js): event #35 "Give me 60" → Fame +15 per 55+ attempt
          defaultAgg: 0.5, convertTimeSec: 40,                      // E2 (sim.js): coachAgg fallback · clock burned by a 4th-down conversion
          firedAfterWinPct: 0.35, firedProb: 0.30, firedTrustReset: 45
        },
        summary: {                                                  // E2 (sim.js): GameSummary / headline rules
          perfectMinFga: 2, badDayMinFga: 2, badDayPct: 0.5,       // perfect_day: ≥ 2 FGA all made, PATs clean · bad_day: ≤ 50 % on ≥ 2 FGA
          maxSteps: 2000                                            // step guard for simToNextUserKick / simAiGame
        },
        expected: {                                                 // §2.5.2 / §2.13 sanity bands
          nfl: { pts: [21, 27], fga: [1.9, 2.4], pat: [2.4, 3.0], ties: [0.03, 0.07], decisive: [0.10, 0.25],
                 buckets: { lt30: [0.14, 0.19], s30: [0.26, 0.31], s40: [0.30, 0.35], s50: [0.19, 0.25] } },
          college: { pts: [24, 32], fga: [1.5, 2.2], pat: [2.8, 4.2] },
          harness: {                                                // E2 (sim_balance.test.js): §5.1 "sim" Monte-Carlo harness
            nflGames: 4000, collegeGames: 1000, teamRating: [58, 88], kickerOvr: [62, 92],   // nflGames: spec minimum 2 000, doubled so the tie-rate / ice-ratio SE halves (seeded run)
            drives: [10, 14], iceToDecisiveMax: 0.6
          }
        }
      },

      // ───────────────────────────── §2.5.5 WEATHER ─────────────────────────────
      weather: {
        climates: {
          warm: { temp: [82, 78, 70, 64, 60], rain: 0.18, snow: 0 },
          temperate: { temp: [74, 64, 52, 44, 40], rain: 0.15, snow: 0.25 },
          cold: { temp: [68, 55, 42, 32, 26], rain: 0.12, snow: 0.48 },   // snow 0.48 (spec 0.35) so cold-climate December snow share lands in the §5.1 band 25–45 %
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

      // ───────────────────────────── §2.1 PROGRESSION ─────────────────────────────
      progression: {
        ovrWeights: { ACC: 0.30, POW: 0.25, CON: 0.20, CLU: 0.17, KO: 0.08 },
        attrs: ['POW', 'ACC', 'CON', 'CLU', 'KO'],
        attrMin: 1, attrMax: 99,
        archetypes: {                                    // [mean, sd] per attribute
          CANNON: { POW: [60, 4], ACC: [46, 4], CON: [44, 4], CLU: [44, 5], KO: [52, 5] },
          SURGEON: { POW: [48, 4], ACC: [60, 4], CON: [54, 4], CLU: [46, 5], KO: [44, 5] },
          ICEMAN: { POW: [50, 4], ACC: [50, 4], CON: [48, 4], CLU: [64, 4], KO: [46, 5] },
          SOCCER: { POW: [56, 4], ACC: [46, 4], CON: [46, 4], CLU: [46, 5], KO: [62, 4] }
        },
        creation: { attrMin: 30, attrMax: 75, starPer: 4, starBase: 3, defaultStars: 3 },
        pot: { mean: 88, sd: 6, min: 62, max: 99, starBonus: { 2: -3, 3: 0, 4: 3, 5: 6 } },
        form: { decay: 0.7, sdBase: 3.5, sdConDiv: 130, max: 6, sharpAt: 3, watchAt: -3 },
        traits: {
          max: 3, creationProb: 0.25,
          creationWeights: {                             // per archetype override, else default
            BIG_LEG: { def: 0.10, CANNON: 0.40 },
            ICE_VEINS: { def: 0.10, ICEMAN: 0.40 },
            LATE_BLOOMER: { def: 0.10 },
            LEGS_OF_STEEL: { def: 0.05 }
          },
          bigLegRangeAdd: 2, bigLegSigma: 1.04,
          iceVeinsPress: 0.85, iceVeinsGwPerSeason: 3,
          coldWeatherSeasons: 3, domeBabySeasons: 3,
          domeBabyRangeAdd: -1, domeBabySigma: 0.97,
          lateBloomerYears: 2, legsOfSteelYears: 2,
          doinkKingFans: 2
        },
        xp: {                                            // §2.1.2 sources (Pro; × difficulty.xpMult)
          // SPEC BUMP (orchestrator, §0.4): rewards are ~60 % of the §2.1.2 table (a made kick must still feel rewarding),
          // and saturation is fixed at the root: higher POT (pot.mean 88) and a steeper cost curve (cost 20 + 2.2/pt + 2.5/pt over 80),
          // fitted so a full career's XP (~15k) is roughly the cost of maxing every attribute by age ~30.
          fgMade: 5, fgMadePerYd: 0.3, fgMadeFrom: 35, fifty: 5, clutch: 8,
          gameWinner: 20, tieForcer: 12, fgMissed: 1, patMade: 1, patMissed: 0, koTouchback: 1,
          teamWin: 3, teamLoss: 1,
          trainingBase: 20, moraleMultBase: 0.7, moraleMultPer: 0.006, whispererMult: 1.15,
          restMorale: 8, restInjuryMult: 0.5,
          goals: [30, 45, 75], offseasonBlock: 50, offseasonBlocks: 3,
          eventRange: [-30, 80], expectedWeekly: 45
        },
        cost: {                                          // §2.1.2 cost(v, age)
          base: 30, over50: 2.2, over70: 6.5, over80: 3.0, focusMult: 0.75,   // SPEC BUMP: was 12 / 0.6 / — / 2.0 — gentle below 70 (college growth), steep above (elite by ~30)
          ageMult: [
            { maxAge: 22, mult: 0.85 }, { maxAge: 26, mult: 1.00 }, { maxAge: 30, mult: 1.20 },
            { maxAge: 33, mult: 1.60 }, { maxAge: 36, mult: 2.40 }, { maxAge: 999, mult: 3.50 }
          ]
        },
        aging: {                                         // §2.1.3
          growthMaxAge: 24, growthPicks: 2, growthDelta: 1,
          declineStart: 33,
          powDecline: { below35: 1, below37: 2, else: 3 },
          conOffsetYears: 2, conDelta: 1,
          accOffsetYears: 4, accDelta: 1,
          koFrom: 32, koDecline: { below35: 1, else: 2 },
          whispererAcc: 1
        },
        injury: {                                        // §2.1.4
          pPerGame: 0.012, restMult: 0.5, ageFrom: 32, ageMult: 1.5,
          types: [
            { type: 'PLANT_LEG_STRAIN', label: 'plant-leg strain', weeks: [1, 3] },
            { type: 'HIP_FLEXOR', label: 'hip flexor', weeks: [2, 4] },
            { type: 'QUAD', label: 'quad', weeks: [1, 2] }
          ],
          careerThreat: { p: 0.0015, weeks: [8, 14], powLoss: 3, ageFrom: 34, label: 'career-threatening' },
          jsPerWeek: -3, trustPerWeek: -2, comebackMinWeeks: 4
        }
      },

      // ───────────────────────────── §2.2 SOFT STATS ─────────────────────────────
      soft: {
        min: 0, max: 100,
        start: {
          morale: 60, fans: 50, trust: 50,
          trustByCoach: { TRUSTING: 60, CAUTIOUS: 40, WHISPERER: 50 },
          coachAgg: { TRUSTING: 0.6, CAUTIOUS: 0.3, WHISPERER: 0.5 },
          fameByStars: { 2: 0, 3: 20, 4: 40, 5: 60 },
          jsStarter: 60, jsBackup: 35, jsOpen: 60, jsContested: 45,
          walkonMorale: -5
        },
        drift: { moraleTarget: 60, moraleTargetSleep: 65, moraleRate: 0.10, trustTarget: 50, trustStep: 1, fansRate: 0.10 },
        morale: {
          teamWin: 3, teamLoss: -2, clutchMake: 4, clutchMiss: -6, streakBonus: 2, streakFrom: 5,
          slumpBelow: 30, slumpWeeks: 3, slumpClearAt: 45, slumpSigma: 1.12,
          guiltPerWeek: -2, guiltWeeks: 3
        },
        trust: {
          make: 2, make50: 5, decisiveMake: 8, missLt40: -4, miss40s: -3, miss50: -1,
          decisiveMiss: -8, blocked: -6, trainingAccCon: 2, hotSeatBelow: 25
        },
        fans: {
          make: 1, decisiveMake: 6, miss: -3, decisiveMiss: -10, teamWin: 2, doinkIn: 3,
          pressureReliefAt: 80, endorsementAt: 60, booBirdsBelow: 35
        },
        fame: {
          max: 1000, perMakeDiv: 10, decisiveMake: 40, fifty: 10,
          tiers: [100, 250, 500, 800],
          tierNames: ['Unknown', 'Local Hero', 'Household Name', 'Star', 'Icon'],
          bigMarketMult: 1.2, collegePrestigePer: 0.15, prestigeAnchor: 3,
          milestone: 20
        },
        js: {                                              // §2.2 weekly update
          make: 2, missLt40: -6, miss40s: -3, miss50: -1, decisiveMake: 8, decisiveMiss: -10, blocked: -4,
          keep: 0.9, gapWeight: 0.1, gapBase: 50, gapPer: 5, floorTrustDiv: 5,
          benchBelow: 25, regainAt: 40, rivalFgPctBelow: 0.70, rivalWeeks: 3,
          cutBelow: 10, cutWeeks: 3, defaultRivalGap: 5
        },
        camp: {                                            // §2.2 camp battle
          distances: [32, 38, 44, 48, 52, 55], pressure: 0.3,
          makeW: 10, trustW: 0.2, seniorityW: 3, rivalTrust: 50, loserJs: 35, triggerOvrMargin: 2   // SPEC BUMP: was 5 — a clearly better newcomer starts without a camp battle
        }
      },

      // ───────────────────────────── §2.7.7 CONTRACTS ($M) ─────────────────────────────
      contracts: {
        capStart: 280, capGrowth: 0.05, vetMinStart: 1.0, vetMinGrowth: 0.04,
        rookie: {
          years: 4,
          byRound: { 1: { aav: 2.2, gtd: 1.00 }, 3: { aav: 1.15, gtd: 0.60 }, 4: { aav: 1.05, gtd: 0.40 },
                     5: { aav: 0.98, gtd: 0.25 }, 6: { aav: 0.92, gtd: 0.15 }, 7: { aav: 0.88, gtd: 0.10 } },
          udfa: { years: 3, aav: 0.80, gtd: 0 }
        },
        aav: {
          // base/per are the spec's 0.9/0.055 ÷ fameBase (0.92) so the §2.7.7 worked values (75→3.0, 85→5.1, 92→6.8) hold at fame 0
          base: 0.9783, per: 0.0598, ovrFrom: 60, exp: 1.35, max: 8.0,
          ageMul: [{ maxAge: 31, mult: 1.00 }, { maxAge: 34, mult: 0.90 }, { maxAge: 37, mult: 0.75 }, { maxAge: 999, mult: 0.55 }],
          fameBase: 0.92, famePer: 0.16,
          market: { per: 0.06, anchor: 6, div: 6, min: 0.90, max: 1.12 }
        },
        gtd: { base: 0.35, per: 0.30, ovrFrom: 70, div: 30, min: 0.10, max: 0.80 },
        signingBonusPct: 0.25,
        extension: {
          satisfaction: { fgW: 0.5, trustW: 0.3, fansW: 0.2, min: 0.72 }, jsMin: 50,
          yearsByAge: [{ maxAge: 28, years: [4, 5] }, { maxAge: 32, years: [2, 4] }, { maxAge: 999, years: [1, 2] }],
          aavRange: [0.90, 1.05],
          counter: { aavBump: 0.10, yearBump: 1, base: 0.30, agentPer: 0.20, famePer: 0.15, needPer: 0.20, min: 0.10, max: 0.90, standsProb: 0.5 }
        },
        tag: { base: 6.0, growth: 1.05, aavMin: 4.5, maxAge: 33, prob: 0.5, morale: -8, secondMult: 1.2, max: 2 },
        fa: {
          offersMin: 1, offersMax: 4, aavRange: [0.85, 1.10], hometownWeight: 1.5,
          minOffers: [0, 2],                                          // 'MIN' mode (mid-season cut / ring chase): vet-minimum offers
          capRoom: { per: 0.005, min: 0.88, max: 1.0 },              // teamCapRoom01 = clamp(1 − per·(avg(OFF,DEF) − league.drift.nflAnchor), min, max)
          needDiv: 12,                                               // need01 = clamp(teamsNeedingK / needDiv, 0, 1)
          yearsByAge: [{ maxAge: 28, years: [3, 5] }, { maxAge: 32, years: [2, 4] }, { maxAge: 999, years: [1, 2] }],
          hometownDiscount: 0.08, hometownMorale: 10, hometownFans: 10,
          withdrawProb: 0.35, newOfferProb: 0.40, noOffersRetireAfter: 2,
          practiceSquad: { callUpProb: 0.30, weeks: 6, xpMult: 0.5 }
        },
        cut: { fgPctBelow: 0.75, ovrBelow: 68, jsBelow: 20, marketMul: 0.8 },
        need: { ageFrom: 34, ovrBelow: 72, yearsLeftMax: 1 },
        changeTeam: { trust: 50, js: 55 },
        transfer: { trust: 45, js: 50, fame: -10 },
        holdout: { extensionProb: 0.55, extensionAav: 1.10, trust: -12 },
        nil: { byPrestige: { 5: [60, 120], 4: [30, 80], 3: [10, 40], 2: [0, 15], 1: [0, 0] }, famePerYear: 10, moralePerYear: 2 },
        agent: { tier1Fame: 250, tier2Fame: 600, feePct: 0.05, potBandTier1: 5 },
        retirement: { offerFromAge: 33, forcedAge: 42, ringChaseTopN: 5 }
      },

      // ───────────────────────────── §2.7.1 / §2.7.5 / §2.7.6 DRAFT ─────────────────────────────
      draft: {
        stars: { base: 1.5, perOvr: 0.03, ovrAnchor: 40, showcaseW: 0.4, showcaseKicks: 6, min: 2, max: 5, walkon: 2 },
        showcase: { distances: [30, 38, 44, 50, 55, 42], pressureLast: 0.6 },
        offers: { min: 3, max: 6, walkon: 1, safetyPrestigeMax: 2, weightOffset: 0.5,
                  depth: { VET: { ovr: [66, 78], years: [1, 1] }, STAR: { ovr: [74, 84], years: [2, 3] } },
                  prestigeBumpPer: 2, prestigeAnchor: 3 },
        value: { ovrW: 0.55, powW: 0.15, cluW: 0.10, fameW: 0.10, fameTierMult: 5, fgW: 0.10, fgAnchor: 70, offset: 12,   // SPEC BUMP: offset lines the §2.7.6 round table up with rookies at OVR ≈ 66–74
                 walkonPenalty: 4, walkonOvrBelow: 70 },
        rounds: [                                       // draftValue thresholds (descending)
          { min: 92, round: 3, shock: true },
          { min: 86, round: 3, altRound: 4, roundProb: 0.40 },
          { min: 80, round: 4 }, { min: 75, round: 5 }, { min: 70, round: 6 }, { min: 66, round: 7 },
          { min: 60, udfa: true }
        ],
        undraftedBelow: 60,
        shock: { prob: 0.01, pickMin: 28, pickMax: 32, fame: 150 },
        udfaInvites: [2, 3],
        tryout: { kicks: 6, passMakes: 4, distances: [33, 38, 42, 46, 50, 53], pressure: 0.35 },
        springLeague: { xpMult: 0.6, maxFailures: 2, ageAdd: 1 },
        pickSlot: { teamsPerRound: 32, jitterMax: 5 },
        ticker: { before: 6, after: 3 },                            // fictional picks shown around the user's pick
        positions: [
          { pos: 'QB', w: 8 }, { pos: 'OL', w: 18 }, { pos: 'WR', w: 12 }, { pos: 'DB', w: 16 }, { pos: 'DL', w: 14 },
          { pos: 'LB', w: 11 }, { pos: 'RB', w: 8 }, { pos: 'TE', w: 5 }, { pos: 'K/P', w: 1 }, { pos: 'ATH', w: 7 }
        ],
        combine: { ladder: [45, 50, 55, 60, 65], safeStop: 55, accDist: 40, accKicks: 5,
                   ladderAnchor: 3, accAnchor: 3, hangAnchor: 3.9, hangW: 5, perMake: 2, clamp: 8, interviewClu: 1,
                   pressure: 0.25 },
        declare: { seasonsMin: 3, seasonsMax: 5, nonRedshirtAuto: 4 },
        projectionBand: { tier0: 2, tier1: 1, tier2: 1 }
      },

      // ───────────────────────────── §2.8 AWARDS ─────────────────────────────
      awards: {
        kickerScore: { fgm: 3, fgPct: 40, longDiv: 10, clutch: 4, fifty: 2, gw: 6, minFga: 12 },
        weeklyMinFgm: 2,
        stpoy: { ratio: 1.15, minGw: 3 },
        comeback: { minFgPct: 0.85, injuryWeeks: 6 },
        proClassicPerConf: 2,
        rewards: {                                          // {xp, fame}
          GOLDEN_BOOT: { xp: 200, fame: 150 }, ALL_AMERICAN_1: { xp: 150, fame: 100 }, ALL_AMERICAN_2: { xp: 80, fame: 50 },
          ALL_CONF_1: { xp: 80, fame: 40 }, FRESHMAN_LEG: { xp: 100, fame: 60 }, IRON_LEG_COLLEGE: { xp: 60, fame: 40 },
          CLUTCH_KICK_COLLEGE: { xp: 100, fame: 80 }, CCG_MVP: { xp: 120, fame: 120 }, NATIONAL_MVP: { xp: 200, fame: 250 },
          ST_PLAYER_OF_WEEK: { xp: 15, fame: 8 },
          GOLDEN_LEG: { xp: 200, fame: 150 }, ALL_LEAGUE_1: { xp: 180, fame: 120 }, ALL_LEAGUE_2: { xp: 100, fame: 60 },
          PRO_CLASSIC: { xp: 60, fame: 40 }, STPOY: { xp: 220, fame: 150 }, IRON_LEG_NFL: { xp: 60, fame: 40 },
          CLUTCH_KICK_NFL: { xp: 100, fame: 80 }, CHAMPIONSHIP_MVP: { xp: 250, fame: 300 }, COMEBACK_LEG: { xp: 80, fame: 60 }
        },
        goalXp: [15, 25, 40],           // BALANCE (E3, career_balance): spec 40/60/100 — see progression.xp
        milestones: { fgm: [100, 200, 300, 400, 500], pts: [1000, 1500, 2000], consecutive: 20, gw: 10, fame: 20 },
        // E3 additions (engine/awards.js): season goals (§2.7.3) and misc award rules
        goals: {
          wins:  { base: 0.5, perRating: 40, min: 0.20, max: 0.85, scale: 0.95, jitter: [-1, 0], floor: 3, ceilBelowGames: 2 },
          fgPct: { base: 0.70, perOvr: 0.003, ovrAnchor: 50, min: 0.65, max: 0.90, jitter: 0.02, step: 0.01, minFga: 8 },
          fans:  { gain: 12, jitter: 3, max: 90 }
        },
        awardImpact: 2,                 // timeline impact for a user award
        weeklyImpact: 1,
        longestMinFga: 1                // Iron Leg needs at least one made FG
      },

      // ───────────────────────────── §2.7.9 HALL OF FAME ─────────────────────────────
      hof: {
        // SPEC BUMP: dominance (awards, game-winners, titles) weighs more than longevity (starter seasons, 50+ makes) than in §2.7.9
        weights: { fgm: 0.8, fifty: 2, ptsPer100: 2, gw: 12, allLeague1: 40, allLeague2: 15, stpoy: 60,
                   championships: 30, championshipKicks: 60, seasonsAsStarter: 8, pctBonus: 40, recordsHeld: 20 },
        pctBonusMin: 0.88, pctBonusMinFga: 300,
        walkonMult: 1.15, udfaMult: 1.10,
        verdicts: { firstBallot: 1850, inducted: 1550, finalist: 1250 },   // SPEC BUMP: rescaled to the restored XP economy (was 750 / 550 / 400)
        inductionYears: [1, 5],
        tiers: [{ min: 1900, name: 'Immortal' }, { min: 1500, name: 'Legend' }, { min: 950, name: 'Franchise Leg' },
                { min: 450, name: 'Solid Starter' }, { min: 0, name: 'Journeyman' }],   // SPEC BUMP: rescaled (was 900 / 550 / 300 / 150)
        moments: { decisive: 40, doink: 20, playoff: 15, missMult: 0.6, keep: 10 },
        targets: { firstBallotMax: 0.10, inducted: [0.15, 0.25] },
        inductionYear: { base: 5, famePer: 4 }   // INDUCTED: year = clamp(round(5 − 4·fame/1000), 1, 5)  (E3, engine/awards.js)
      },

      // ───────────────────────────── §2.9 RECORDS (base values live in data/records.js) ───────────
      records: {
        keys: ['longFG', 'seasonFGM', 'seasonPts', 'seasonFGpct', 'season50plus', 'careerFGM', 'careerPts',
               'careerFGpct', 'consecutiveFGM', 'careerGW', 'careerSeasons'],
        minFgaSeasonPct: 20, minFgaCareerPct: 100
      },

      // ───────────────────────────── §3.5.12 STATS (E3, engine/stats.js) ─────────────────────────────
      stats: {
        splitPressureTense: 0.30,       // byPressure split: calm < 0.30 ≤ tense < clutchThreshold ≤ clutch
        grade: { b: 0.85, c: 0.70, d: 0.50, aMinFga: 2, decisiveMissCap: 'D' },   // §3.5.12 grade table
        seasonGrade: { a: 0.90, b: 0.85, c: 0.78, d: 0.70 },                       // SeasonLine.grade by FG%
        momentMinScore: 15,             // kicks below this moment score are not kept in history.moments
        milestoneImpact: 2, recordImpact: 3
      },

      // ───────────────────────────── §2.10 EVENTS ─────────────────────────────
      events: {
        weekProb: 0.40, weekProbFameAdd: 0.15, weekProbFameFrom: 500,
        offseasonPerSlot: 2, offseasonProb: 1.0,
        recentRing: 12, headlineRing: 40,
        halftime70Dist: 70,
        psych: { cluTotal: 3, weeks: 6 },
        // E3 additions (data/events.js + engine/events.js)
        halftime70: { pressure: 0.3, makeFame: 80, makeFans: 15, missFans: -5, missMorale: -3 },
        guru: { sigma: 1.2, weeks: 2, acc: 2 },
        ultimatum: { weeks: 3, fgPct: 0.85, trust: 20, jsNfl: -20 },
        trade: { execProb: 0.40, trust: -15 },                       // TRADE action (Career.handleActions)
        holdout: { extensionProb: 0.55 },                            // branch split for event #5 (see contracts.holdout)
        timelineImpact: { choice: 1, action: 2 },
        gates: {                                                     // cond thresholds of the §2.10.2 catalog
          nilFame: 100, portalJs: 40, portalTrust: 40, ultimatumTrust: 30, captainTrust: 65, aggressiveTrust: 70,
          halftimeFame: 250, agentFame: 250, podcastFame: 100, petitionFans: 30, psychClu: 60, psychFreePrestige: 4,
          holdoutOvr: 82, contenderOvr: 78, contenderWinPct: 0.4, contenderWeeks: [4, 9], contenderMinGames: 3,
          tradeRumorJs: 45, tradeRumorTrust: 40, retirementAge: 35, drinkFame: 400, drinkFans: 60,
          windTunnelMoneyK: 10, hurricaneMonths: [9, 10], comebackWeeks: 4, coachShoppingMinFga: 3,
          draftEligibleSeasons: 3, mentorNflSeasons: 0, coldTempF: 40
        }
      },

      // ───────────────────────────── §2.4 DIFFICULTY ─────────────────────────────
      difficulty: {
        rookie: { sigmaMult: 0.85, iceProb: 0.25, pressureAdd: -0.05, windCap: 15, xpMult: 1.25, contractMult: 1.15,
                  jsNegMult: 0.6, playClockSec: 3.5, driftPreview: 'full', greenZone: true, effectPreview: 'full',
                  careerInjury: 'off', gusts: false },
        pro: { sigmaMult: 1.00, iceProb: 0.55, pressureAdd: 0, windCap: 20, xpMult: 1.00, contractMult: 1.00,
               jsNegMult: 1.0, playClockSec: 2.5, driftPreview: 'full', greenZone: true, effectPreview: 'icons',
               careerInjury: 'age34', gusts: false },
        allpro: { sigmaMult: 1.10, iceProb: 0.65, pressureAdd: 0, windCap: 25, xpMult: 0.90, contractMult: 0.92,
                  jsNegMult: 1.3, playClockSec: 2.5, driftPreview: 'numeric', greenZone: true, effectPreview: 'hidden',
                  careerInjury: 'on', gusts: false },
        legend: { sigmaMult: 1.20, iceProb: 0.75, pressureAdd: 0.05, windCap: 30, xpMult: 0.80, contractMult: 0.85,
                  jsNegMult: 1.6, playClockSec: 2.0, driftPreview: 'arrow', greenZone: false, effectPreview: 'hidden',
                  careerInjury: 'on', gusts: true }
      },

      // ───────────────────────────── §3.7 SAVE CAPS ─────────────────────────────
      save: {
        kickLogCap: 600, driveLogCap: 80, inboxCap: 60, headlinesCap: 40, momentsCap: 50,
        recentHeadlineIds: 40, recentEventIds: 12, timelineCap: 600, maxBytes: 400 * 1024
      },

      // ───────────────────────────── §2.6 SCHEDULE ─────────────────────────────
      schedule: {
        college: { regWeeks: 13, ccgWeek: 13, bowlWeek: 14, playoffWeeks: [14, 15, 16, 17], totalWeeks: 17,
                   confGames: 7, nonConfGames: 5, rivalryWeek: 12, nonConfWeeks: [1, 2, 3, 5, 9],
                   confWeeks: [4, 6, 7, 8, 10, 11, 12], titleGameName: 'The National Title Game',
                   rivalPairs: [[0, 7], [1, 6], [2, 5], [3, 4]], teams: 48, conferences: 6, perConf: 8,
                   playoffTeams: 12, autoBids: 5, byes: 4, bowlMinWins: 6, majorBowls: 6, minorBowls: 12 },
        nfl: { regWeeks: 18, games: 17, playoffWeeks: [19, 20, 21, 22], totalWeeks: 22, byeWeeks: [5, 14],
               teams: 32, conferences: 2, divisions: 4, perDiv: 4, playoffPerConf: 7, maxGamesPerWeek: 16,
               slotShuffles: 200, maxRestarts: 500, genBudgetMs: 50, maxByesPerWeek: 6 },
        tiebreak: { commonGamesMin: 4, coinP: 0.5 },
        ranking: { winW: 0.55, sosW: 0.20, marginW: 0.12, marginDiv: 25, prestigeW: 0.13, sticky: 0.7 },
        firstYear: 2026
      },

      // ───────────────────────────── §2.5.1 LEAGUE / TEAMS ─────────────────────────────
      league: {
        ratingMin: 50, ratingMax: 92,
        drift: { keep: 0.6, anchorW: 0.4, sd: 6, collegeAnchorBase: 50, collegeAnchorPerPrestige: 8, nflAnchor: 72 },
        stBlend: 0.5, homeAdv: 3,
        nflInit: { off: { mean: 72, sd: 7, min: 58, max: 88 }, def: { mean: 72, sd: 7, min: 58, max: 88 },
                   st: { mean: 70, sd: 5 }, coachAgg: [0.3, 0.8] },
        aiKicker: {
          age: [22, 36], ovrSd: 7, attrSd: 4, attrMin: 30, attrMax: 99,
          collegeAnchorBase: 52, collegeAnchorPerPrestige: 4, nflAnchor: 74,
          contractYears: [1, 4], declineFrom: 34, retireAge: 38, retireProb: 0.5, retireOvrBelow: 55,
          rookie: { mean: 60, sd: 5, age: 22 }
        },
        bigMarkets: ['NYE', 'LA', 'CHI', 'DAL', 'BOS', 'SF'],
        walkonHofMult: 1.15
      },

      // ───────────────────────────── §2.12.4 NAMES (RTG.Names, E2) ─────────────────────────────
      names: {
        suffixRate: 0.08,        // share of generated players with a suffix or hyphenated surname
        hyphenShare: 0.5,        // of those, share that hyphenate (rest get 'Jr.'/'III'/'II')
        uniqueRetries: 10,       // Names.unique retry budget
        legendYears: { college: [1958, 2018], nfl: [1962, 2022] }   // calendar-year band for record holders
      },

      // ───────────────────────────── §3.5.17 SEASON LOOP (RTG.Season, E2) ─────────────────────────────
      season: {
        inbox: {                    // weekly coach / GM / press notes (Events.message kinds), thresholds
          jsLowBelow: 35,           // coach_js_low once Job Security drops under this (once per dip)
          jsHighFrom: 80,           // coach_js_high once it climbs past this (once per run)
          cutWarnLowWeeks: 2,       // gm_cut_warning after this many consecutive weeks under the cut line (NFL)
          hotStreakFrom: 8,         // press_hot at this make streak
          slumpMissesFrom: 3        // press_slump at this miss streak
        },
        starterShare: 0.5,          // seasonsAsStarter: gamesStarted ≥ share·games (or K1 at season end)
        fastForwardGuard: 12,       // max postseason weeks simulated at once when the user is out of the bracket
        aiRookieContractYears: 4,   // AI replacement kickers (§2.5.1 rookies) sign for this many years
        aiResignYears: [1, 3],      // an AI kicker whose deal expired re-signs for int(lo, hi) years (1 draw)
        aiForceRetireAge: 45,       // hard cap on top of the §2.5.1 p 0.5/yr retirement from 38
        timelineImpact: { season: 1, champion: 3, cut: 3, lostJob: 3, bench: 2, unbench: 1, injury: 2, returned: 1, coach: 2 }
      },

      // ───────────────────────────── §2.7 CAREER FLOW (RTG.Career / RTG.Engine, E3) ─────────────────────────────
      career: {
        offers: {                                         // §2.7.2 college offers (Career.generateCollegeOffers)
          coachWeights: { TRUSTING: 0.45, CAUTIOUS: 0.35, WHISPERER: 0.20 },   // weighted pick of an offer's coach type
          depthOrder: ['OPEN', 'VET', 'STAR'],            // §2.7.2 kicker-room depth of an offer, sampled per prestige …
          depthWeights: { 1: [0.65, 0.25, 0.10], 2: [0.55, 0.30, 0.15], 3: [0.45, 0.35, 0.20], 4: [0.30, 0.40, 0.30], 5: [0.20, 0.40, 0.40] },
          openBelow: [6, 11],                             // OPEN: the generated incumbent sits int(6, 11) OVR below the recruit (no camp battle), 1–2 years left
          openYears: [1, 2],
          vetMargin: 5,                                   // margin used to classify an unshaped roster (VET when the incumbent is within it)
          nilFameDiv: 60,                                 // NIL $k = lerp(band lo, hi, 0.5·u + 0.5·min(1, fame / nilFameDiv))
          transferCount: [2, 3], transferBand: 1,         // §2.7.4 portal: 2–3 offers within ±1 prestige of the OVR-implied tier
          ovrTier: { base: 3, perOvr: 0.1, anchor: 60 }   // OVR-implied prestige tier = clamp(round(3 + 0.1·(OVR − 60)), 1, 5)
        },
        redshirt: { afterSeason: 1 },                     // §2.7.3 redshirt offered after this college season when it ended as K2
        camp: { incumbentSeniority: 1, winnerJs: 60 },    // §2.2 camp battle: incumbent's seniority head start (years) · winner's Job Security floor
        trainingBlocks: { raisesPerBlock: 1 },            // §2.1.2 offseason blocks: attribute raises bought per block in the focus attribute
        college: { nearHomeMorale: 5 },                   // §2.7.2 nearHome: morale +5 per season (applied when the offseason opens)
        retire: { injuryWeeksForced: 10 },                // §2.7.8 a career-threat injury still ≥ this many weeks out at the offseason ends the career
        legacy: { moments: 10, timeline: 60 },            // §2.7.9 legacy report: top moments · timeline entries kept
        acts: { holdOnAge: 30 },                          // §1.4 act III ("Hold on") from this age
        autoplay: {                                       // §3.5.20 default choices of Engine.autoPlay* (tests, RTG.debug)
          eventChoice: 0, faWaitRounds: 3, showLadderPMake: 0.30,
          declare: { whenEligible: true, roundMax: 4 },      // declare as soon as eligible (spec: stay until senior unless projected round ≤ 4 — see career.js DEVIATION)
          restMoraleBelow: 40, redshirtAccept: true,
          retire: { age: 32, keepOvr: 88, hardAge: 35 },    // retire when forced, or from 32 unless still OVR ≥ 88, or at 35
          spendOrder: ['ACC', 'POW', 'CON', 'CLU', 'KO']    // tie-break order for the greedy XP spend (OVR weight per XP)
        },
        balance: {                                        // §2.13 career targets asserted by test/career_balance.test.js
          careers: 200, seedBase: 1000, maxYears: 30, perCareerMs: 4000, minFga: 12,
          // SPEC BUMP (orchestrator): bands re-measured after the progression/HOF/draft retune (docs/BALANCE.md §5): rookies now
          // enter the NFL at OVR ≈ 70–75 (FG% ≈ 85), reach 85 by ~27 and their POT (mean 88) by ~30; the 66-yd record is a real chase.
          rookieFgPct: [0.80, 0.88], year4FgPct: [0.86, 0.93], eliteFgPct: [0.90, 0.97], eliteOvrMin: 88,
          longMedian: [60, 66], longTail: { yd: 64, share: 0.05 },
          benchCut: { share: [0.25, 0.55], seasons: 3 },
          length: { median: [10, 15], ovrMin: 80 },
          hofStarterSeasons: 12, hofStarterPct: 0.88, hofStarterTier: 'Franchise Leg',   // ≥ 12 starter seasons at ≥ 88 % must at least be a Franchise Leg
          spec: { rookieFgPct: [0.78, 0.83], year4FgPct: [0.84, 0.88], eliteFgPct: [0.89, 0.93], longMedian: [57, 61] }
        }
      },

      // ───────────────────────────── §2.13 / §3.9 ENGINE BUDGETS (test/perf.test.js, INT) ─────────────────────────────
      perf: {
        seasonMs: 250,            // a full auto season (Engine.autoPlaySeason, warm, main realm) — §3.9 "full auto season < 250 ms"
        careerMs: 4000,           // a full auto career (Engine.autoPlayCareer HS → RETIRED) — §3.9 "full career < 4 s (Node)"
        warmupSeasons: 1          // seasons played before timing starts (JIT warm-up)
      }
    };
  }

  RTG.Tuning = TuningDefaults();
  RTG.TuningDefaults = TuningDefaults;
})(typeof window !== 'undefined' ? window : globalThis);
