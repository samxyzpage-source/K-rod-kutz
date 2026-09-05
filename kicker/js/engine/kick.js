/**
 * Road to Glory: Kicker — RTG.Kick (SPEC §2.3, §2.4, §3.4, §3.5.8)
 *
 * The kick engine: context building (pressure, hash, per-kick wind, kicker
 * snapshot), the pure closed-form model, the AI input rule, the resolver with
 * its FIXED rng draw order, kickoffs, feedback text and the debug forced
 * outcomes. Pure over plain JSON; every random number comes from the rng
 * passed in. The resolver reads attributes ONLY from `ctx.kicker` (or the
 * explicit `attrs` argument) — never from `state.player` — so any kick replays
 * exactly from {ctx, input, rngState}.
 *
 * RNG draw accounting (binding):
 *   buildContext  : hash 1 (FG only, when situation.hash is undefined/null)
 *                   · per-kick wind 2 (Weather.perKick; only when there is game
 *                     weather and no explicit situation.wind / calm flag)
 *                   · Legend gusts 2 (user kicks only, right after the wind draw).
 *                   The rng is the 4th argument or `situation.rng`; when neither is
 *                   given, a deterministic rng derived from state.rngState and the
 *                   situation is used, which never advances the caller's rng.
 *   aiInput       : power gauss 2 · aim gauss 2 · quality gauss 2 (6, in that order).
 *   resolve       : 1 block · 2 shank-select · 3,4 error gauss · 5 contact sign
 *                   · classify: BLOCKED → return roll 1; crossbar band → 1;
 *                     upright band → 1; otherwise 0.  (opts.forced: 0 draws.)
 *   resolveKickoff: onside → recover roll 1. Otherwise hang gauss 2 · dist gauss 2
 *                   · (returned kicks only) start-yard gauss 2 · return-TD roll 1.
 *
 * Dependencies (load order): Util, Tuning, Weather, RNG (fallback rng only).
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  var Util = RTG.Util, Tuning = RTG.Tuning;
  var Kick = {};

  var clamp = Util.clamp;
  var DEG = 180 / Math.PI;               // unit conversion rad → deg
  var HALF_TURN = 180, FULL_TURN = 360;  // degrees
  var FIELD_YARDS = 100;                 // goal line to goal line
  var MS_PER_HESITATION_STEP = 100;      // the hesitation rule is expressed per 100 ms
  var RESULT_DECIMALS = 3;               // formatting precision of KickResult numbers (not a balance constant)
  var OUTCOMES = ['GOOD', 'WIDE_L', 'WIDE_R', 'SHORT', 'BLOCKED', 'DOINK_IN', 'DOINK_OUT', 'XBAR_IN', 'XBAR_OUT'];
  var MADE = { GOOD: true, DOINK_IN: true, XBAR_IN: true };

  /** Tuning.kick, read at call time so RTG.debug.tune edits apply. */
  function K() { return Tuning.kick; }
  /** Difficulty row (unknown → pro). */
  function diffRow(d) { return Tuning.difficulty[d] || Tuning.difficulty.pro; }
  function has(arr, v) { return !!arr && arr.indexOf(v) >= 0; }
  function num(v, dflt) { return (typeof v === 'number' && isFinite(v)) ? v : dflt; }
  function rd(x) { return Util.roundN(x, RESULT_DECIMALS); }
  function footSign(foot) { return foot === 'L' ? -1 : 1; }
  function isOutdoors(ctx) { return !(ctx && (ctx.dome || ctx.weather === 'dome')); }

  /**
   * Product (op 'mul') or sum (op 'add') of the modifiers with a given key, over a plain
   * mods array (ctx.kicker.mods). Same semantics as Player.modValue.
   * @param {Object[]} mods @param {string} key @param {'mul'|'add'} op @returns {number}
   */
  Kick.modValue = function (mods, key, op) {
    var v = op === 'add' ? 0 : 1;
    if (!mods) return v;
    for (var i = 0; i < mods.length; i++) {
      var m = mods[i];
      if (!m || m.key !== key || m.op !== op || typeof m.value !== 'number') continue;
      if (op === 'add') v += m.value; else v *= m.value;
    }
    return v;
  };

  /** Neutral attributes when a context has no kicker (tests / practice): the §2.3.6 rookie profile. */
  function defaultAttrs() {
    var p = K().profiles.rookie;
    return { POW: p.POW, ACC: p.ACC, CON: p.CON, CLU: p.CLU, KO: num(p.KO, p.CON) };
  }

  /** A complete attrs object (missing keys filled from the defaults; KO defaults to CON). */
  function fullAttrs(a) {
    var d = defaultAttrs();
    if (!a) return d;
    return { POW: num(a.POW, d.POW), ACC: num(a.ACC, d.ACC), CON: num(a.CON, d.CON), CLU: num(a.CLU, d.CLU), KO: num(a.KO, num(a.CON, d.KO)) };
  }

  /** The kicker snapshot of a context, or a neutral one. */
  function kickerOf(ctx) {
    return (ctx && ctx.kicker) || { attrs: defaultAttrs(), form: 0, mods: [], traits: [], foot: 'R', flags: {} };
  }

  /** attrs argument → ctx.kicker.attrs → defaults. */
  function attrsFor(ctx, attrs) {
    if (attrs && typeof attrs.ACC === 'number') return attrs;
    var k = kickerOf(ctx);
    return (k.attrs && typeof k.attrs.ACC === 'number') ? k.attrs : defaultAttrs();
  }

  /** Wind after Legend gusts (hidden multiplier `gust` on the wind object). */
  function effectiveWind(wind) {
    if (!wind) return { speed: 0, dir: 0 };
    return { speed: num(wind.speed, 0) * (typeof wind.gust === 'number' ? wind.gust : 1), dir: num(wind.dir, 0) };
  }

  /** Wind components for the kicker: along (+ = tailwind) and cross (+ = pushes right). */
  function windComponents(wind) {
    var w = effectiveWind(wind);
    if (!w.speed) return { along: 0, cross: 0 };
    var rad = Util.degToRad(w.dir);
    return { along: w.speed * Math.cos(rad), cross: w.speed * Math.sin(rad) };
  }

  /**
   * True when an outcome scores (GOOD, DOINK_IN, XBAR_IN).
   * @param {string} outcome @returns {boolean}
   */
  Kick.isMade = function (outcome) { return !!MADE[outcome]; };
  Kick.OUTCOMES = OUTCOMES;

  // ═══════════════════════════════ GEOMETRY (§2.3.1) ═══════════════════════════════

  /**
   * Ball lateral offset (yards) for a hash: −1 left, 0 middle, +1 right. NFL 3.083, college 6.667.
   * @param {'COLLEGE'|'NFL'} league @param {number} hash @returns {number}
   */
  Kick.ballXFor = function (league, hash) {
    if (!hash) return 0;
    var H = K().hash;
    return (hash < 0 ? -1 : 1) * (league === 'NFL' ? H.ballXNfl : H.ballXCollege);
  };

  /**
   * PAT distance by league (college 20, NFL 33).
   * @param {'COLLEGE'|'NFL'} league @returns {number}
   */
  Kick.patDistance = function (league) {
    return league === 'NFL' ? K().distance.patNfl : K().distance.patCollege;
  };

  /**
   * Kick distance from yards-to-goal: ytg + 17 (7-yd hold + 10-yd end zone).
   * @param {number} ytg @returns {number}
   */
  Kick.distanceFor = function (ytg) {
    return ytg + K().distance.losToKick;
  };

  /**
   * Target angle (deg) from the ball to the post centre: atan2(−ballX, D). College right hash @ 30 yd → −12.53°.
   * @param {number} ballX @param {number} D @returns {number}
   */
  Kick.targetDeg = function (ballX, D) {
    return Math.atan2(-(ballX || 0), D) * DEG;
  };

  /**
   * Angular window of the uprights as seen from the ball, relative to the post centre (deg).
   * Symmetric ±atan(H/D) from the middle; asymmetric from a hash (college right hash @ 30 yd → −5.47 / +5.72).
   * @param {{distance:number, ballX?:number}} ctx @returns {{left:number, right:number}}
   */
  Kick.windowDeg = function (ctx) {
    var H = K().geometry.H, D = ctx.distance, bx = ctx.ballX || 0;
    var t = Kick.targetDeg(bx, D);
    return { left: Math.atan2(-H - bx, D) * DEG - t, right: Math.atan2(H - bx, D) * DEG - t };
  };

  // ═══════════════════════════════ RANGE & FLIGHT (§2.3.2) ═══════════════════════════════

  /**
   * Multiplicative range factor: weather · temperature (outdoors, below 40 °F) · altitude · mods (range/mul).
   * COLD_WEATHER halves the cold/snow penalty (weather and temperature together).
   * @param {Object} ctx KickContext (null → neutral) @param {Object} [kicker] snapshot (default ctx.kicker) @returns {number}
   */
  Kick.rangeMult = function (ctx, kicker) {
    var R = K().range;
    kicker = kicker || kickerOf(ctx);
    var w = (ctx && ctx.weather) || K().defaults.weather;
    var m = R.weatherMult[w] !== undefined ? R.weatherMult[w] : 1;
    if (isOutdoors(ctx)) {
      var tempF = num(ctx && ctx.tempF, K().defaults.tempF);
      m *= 1 - R.tempPenaltyPerDeg * Math.max(0, R.tempPenaltyBelowF - tempF);
    }
    if (has(kicker.traits, 'COLD_WEATHER') && (w === 'cold' || w === 'snow')) m = 1 - (1 - m) / 2;
    if (ctx && ctx.altitude) m *= R.altitudeMult;
    m *= Kick.modValue(kicker.mods, 'range', 'mul');
    return m;
  };

  /**
   * Additive range yards: BIG_LEG +2 · DOME_BABY −1 outdoors · mods (range/add) · 0.30·windAlong (tailwind +).
   * @param {Object} ctx @param {Object} [kicker] @returns {number}
   */
  Kick.rangeAdd = function (ctx, kicker) {
    var R = K().range, TR = Tuning.progression.traits;
    kicker = kicker || kickerOf(ctx);
    var add = 0;
    if (has(kicker.traits, 'BIG_LEG')) add += TR.bigLegRangeAdd;
    if (has(kicker.traits, 'DOME_BABY') && isOutdoors(ctx)) add += TR.domeBabyRangeAdd;
    add += Kick.modValue(kicker.mods, 'range', 'add');
    if (ctx && ctx.wind) add += R.windAlongPerMph * windComponents(ctx.wind).along;
    return add;
  };

  /**
   * Maximum field-goal distance — where a full-power kick just clears the crossbar:
   * (37 + 0.31·POW)·rangeMult + rangeAdd. POW 40 → 49.4 · 62 → 56.2 · 82 → 62.4 · 99 → 67.7 (neutral context).
   * @param {number} POW @param {Object} [ctx] @param {Object} [kicker] @returns {number}
   */
  Kick.maxFG = function (POW, ctx, kicker) {
    var R = K().range;
    return (R.base + R.perPow * POW) * Kick.rangeMult(ctx || null, kicker) + Kick.rangeAdd(ctx || null, kicker);
  };

  /**
   * Landing distance at power 1.0: maxFG² / (maxFG − KCB). maxFG 60 → 65.4.
   * @param {number} maxFG @returns {number}
   */
  Kick.carryMax = function (maxFG) {
    var KCB = K().range.KCB;
    return maxFG * maxFG / Math.max(maxFG - KCB, 1);
  };

  /**
   * Carry needed to just clear the crossbar at D: D² / (D − KCB); D ≤ KCB + 1 is treated as 8 yd.
   * @param {number} D @returns {number}
   */
  Kick.rneed = function (D) {
    var R = K().range;
    if (D <= R.KCB + 1) D = R.rneedMinD;
    return D * D / (D - R.KCB);
  };

  /**
   * Ball height (yards) at the goal plane: tan(34°)·D·(1 − D/carry). Negative when the ball never gets there.
   * @param {number} D @param {number} carry @returns {number}
   */
  Kick.heightAt = function (D, carry) {
    if (!(carry > 0)) return -D;
    return K().range.tanLaunch * D * (1 - D / carry);
  };

  /**
   * Flight time in seconds: 1.0 + 0.026·D (25 yd → 1.65 s · 45 → 2.17 · 60 → 2.56).
   * @param {number} D @returns {number}
   */
  Kick.flightTime = function (D) {
    var R = K().range;
    return R.flightBase + R.flightPerYd * D;
  };

  /**
   * Effective power after contact: power·(0.92 + 0.08·quality).
   * @param {number} power @param {number} quality @returns {number}
   */
  Kick.peff = function (power, quality) {
    var R = K().range;
    return power * (R.contactPowerBase + R.contactPowerQuality * quality);
  };

  // ═══════════════════════════════ ERROR MODEL (§2.3.3) ═══════════════════════════════

  /**
   * Base angular σ (deg) before multipliers: 1.8 + 6.0·(1 − s)², s = (0.7·ACC_eff + 0.3·CON)/99,
   * ACC_eff = clamp(ACC + form, 1, 99). College avg 3.07 · rookie 2.80 · vet 2.09 · elite 1.84.
   * @param {{ACC:number, CON:number}} attrs @param {number} [form=0] @returns {number}
   */
  Kick.sigmaBase = function (attrs, form) {
    var S = K().sigma, P = Tuning.progression;
    var accEff = clamp(attrs.ACC + (form || 0), P.attrMin, P.attrMax);
    var s = (S.accWeight * accEff + S.conWeight * attrs.CON) / S.attrDiv;
    return S.base + S.spread * (1 - s) * (1 - s);
  };

  /**
   * Every σ factor of §2.3.3 for a context and input. `total` is the σ used by resolve:
   * base · dist · press · weather · hash · power · over · mods · diff + hesitation.
   * @param {Object} ctx KickContext @param {{power?:number, holdMs?:number}} [input]
   * @param {Object} [attrs] raw attrs (default ctx.kicker.attrs; form comes from ctx.kicker.form)
   * @returns {{base:number, dist:number, press:number, weather:number, hash:number, power:number, over:number, mods:number, diff:number, hesitation:number, total:number}}
   */
  Kick.sigmaParts = function (ctx, input, attrs) {
    var S = K().sigma, HS = K().hash, TR = Tuning.progression.traits;
    var kicker = kickerOf(ctx);
    attrs = attrsFor(ctx, attrs);
    input = input || {};
    var power = num(input.power, 1);
    var D = ctx.distance;
    var pressure = num(ctx.pressure, 0);
    var w = ctx.weather || K().defaults.weather;

    var base = Kick.sigmaBase(attrs, kicker.form);
    var dist = 1 + S.distPerYd * Math.max(0, D - S.distFrom);
    var pressCoef = S.pressBase - S.pressPerClu * attrs.CLU;
    if (has(kicker.traits, 'ICE_VEINS')) pressCoef *= TR.iceVeinsPress;
    var press = 1 + pressure * pressCoef;
    var weather = S.weather[w] !== undefined ? S.weather[w] : 1;
    if (ctx.surface === 'turf' && (w === 'rain' || w === 'snow')) weather *= S.turfPrecipMult;
    if (has(kicker.traits, 'COLD_WEATHER') && (w === 'cold' || w === 'snow')) weather = 1 + (weather - 1) / 2;
    var hash = !ctx.hash ? HS.sigmaMiddle : (ctx.league === 'NFL' ? HS.sigmaNfl : HS.sigmaCollege);
    var pw = 1 + S.powerPer * Math.max(0, power - S.powerFrom);
    var over = 1 + S.overPer * Math.max(0, power - 1);
    var mods = Kick.modValue(kicker.mods, 'sigma', 'mul');
    if (kicker.flags && kicker.flags.SLUMP) mods *= S.slumpMult;
    if (has(kicker.traits, 'BIG_LEG')) mods *= TR.bigLegSigma;
    if (has(kicker.traits, 'DOME_BABY') && !isOutdoors(ctx)) mods *= TR.domeBabySigma;
    var hesitation = 0;
    var holdMs = num(input.holdMs, 0);
    if (attrs.CLU < S.hesitationCluBelow && holdMs > S.hesitationFromMs) {
      hesitation = S.hesitationDegPer100ms * (holdMs - S.hesitationFromMs) / MS_PER_HESITATION_STEP;
    }
    var diff = ctx.isUser ? diffRow(ctx.difficulty).sigmaMult : 1;
    var total = base * dist * press * weather * hash * pw * over * mods * diff + hesitation;
    return { base: base, dist: dist, press: press, weather: weather, hash: hash, power: pw, over: over, mods: mods, diff: diff, hesitation: hesitation, total: total };
  };

  /**
   * σ (deg) for a context and input — deterministic.
   * @param {Object} ctx @param {{power?:number, holdMs?:number}} [input] @param {Object} [attrs] @returns {number}
   */
  Kick.sigmaFor = function (ctx, input, attrs) {
    return Kick.sigmaParts(ctx, input, attrs).total;
  };

  /**
   * Shank-tail probability: clamp(0.05 − 0.0004·CON, 0.005, 0.06). CON 50 → 3 % · CON 90 → 1.4 %.
   * @param {number} CON @returns {number}
   */
  Kick.pShank = function (CON) {
    var S = K().shank;
    return clamp(S.base - S.perCon * CON, S.min, S.max);
  };

  /**
   * Plant-side push from an overswing: 1.2·max(0, power − 1)/0.15·footSign (right-footed pushes right).
   * @param {number} power @param {'R'|'L'} foot @returns {number} degrees
   */
  Kick.overBias = function (power, foot) {
    var O = K().overBias;
    return O.deg * Math.max(0, power - 1) / O.zone * footSign(foot);
  };

  /**
   * Block probability (§2.3.5):
   * clamp(0.006 + 0.00015·(oppST − 60) + 0.020·lowTraj + 0.030·allOut − 0.00008·(CON − 50) + Σ mods(block/add), 0.002, 0.15),
   * lowTraj = Peff > 0.97 and D > maxFG − 3 (straining line drive); allOut = ctx.decisive.
   * @param {Object} ctx @param {number} peff @param {number} maxFG @param {Object} [attrs] @returns {number}
   */
  Kick.pBlock = function (ctx, peff, maxFG, attrs) {
    var B = K().block;
    var kicker = kickerOf(ctx);
    attrs = attrsFor(ctx, attrs);
    var oppST = num(ctx.oppST, K().defaults.oppST);
    var lowTraj = peff > B.lowTrajPeff && ctx.distance > maxFG - B.lowTrajRangeMargin;
    var p = B.base + B.perOppSt * (oppST - B.oppStAnchor)
      + (lowTraj ? B.lowTraj : 0) + (ctx.decisive ? B.allOut : 0)
      - B.perCon * (attrs.CON - B.conAnchor)
      + Kick.modValue(kicker.mods, 'block', 'add');
    return clamp(p, B.min, B.max);
  };

  /**
   * Wind drift at the goal plane: 0.025·windCross·t² yards (· mods windDrift/mul), + = pushed right;
   * 15 mph crosswind @ 45 yd → 1.77 yd. Also as an angle from the ball and the wind components.
   * @param {Object} ctx @returns {{yd:number, deg:number, along:number, cross:number}}
   */
  Kick.windDrift = function (ctx) {
    var kicker = kickerOf(ctx);
    var c = windComponents(ctx.wind);
    var t = Kick.flightTime(ctx.distance);
    var yd = K().wind.driftCoeff * c.cross * t * t * Kick.modValue(kicker.mods, 'windDrift', 'mul');
    return { yd: yd, deg: Math.atan2(yd, ctx.distance) * DEG, along: c.along, cross: c.cross };
  };

  // ═══════════════════════════════ AI INPUT (§2.3.8) ═══════════════════════════════

  /**
   * Deterministic part of the AI power rule: min(pNeed + 0.15, max(1.0, pNeed + 0.05)), capped at 1.08.
   * @param {number} pNeed @returns {number}
   */
  Kick.aiPower = function (pNeed) {
    var A = K().ai;
    return Math.min(Math.min(pNeed + A.powerAdd, Math.max(A.powerFloor, pNeed + A.powerMinAdd)), A.powerCap);
  };

  /**
   * Fraction of the wind drift the AI compensates: 0.65 + 0.30·ACC/99.
   * @param {number} ACC @returns {number}
   */
  Kick.aiWindComp = function (ACC) {
    var A = K().ai, S = K().sigma;
    return A.windCompBase + A.windCompPerAcc * ACC / S.attrDiv;
  };

  /**
   * The AI kick triple (§2.3.8). Draws, in order: power gauss 2 · aim gauss 2 · quality gauss 2.
   *   power   = aiPower(pNeed) + N(0, 0.02)
   *   aim     = −windDriftDeg·(0.65 + 0.30·ACC/99) + N(0, 0.5)
   *   quality = clamp(0.80 + 0.15·CON/99 + N(0, 0.06), 0.4, 1)
   * @param {RNG} rng @param {Object} ctx @param {Object} [attrs] @param {Object} [model] (computed when omitted)
   * @returns {{power:number, aim:number, quality:number}}
   */
  Kick.aiInput = function (rng, ctx, attrs, model) {
    var A = K().ai, R = K().range, S = K().sigma;
    attrs = attrsFor(ctx, attrs);
    var m = model || Kick.model(ctx, attrs);
    var power = Kick.aiPower(m.pNeed) + rng.gauss(0, A.powerSd);                              // draws 1, 2
    var aim = -m.windDriftDeg * Kick.aiWindComp(attrs.ACC) + rng.gauss(0, A.aimSd);           // draws 3, 4
    var quality = A.qualityBase + A.qualityPerCon * attrs.CON / S.attrDiv + rng.gauss(0, A.qualitySd);   // draws 5, 6
    return {
      power: clamp(power, 0, R.powerMax),
      aim: clamp(aim, -R.aimMax, R.aimMax),
      quality: clamp(quality, A.qualityMin, A.qualityMax)
    };
  };

  // ═══════════════════════════════ MODEL (§2.3.9) ═══════════════════════════════

  /**
   * P(the lateral error puts the ball through), integrating the 4-component mixture
   * {no shank, shank} × {contact −c, +c} of N(mean ± c, √(σ_k² + aimSd²)) over the GOOD zone and the
   * two post bands (weighted by their doink-in probabilities). Zone edges are exact in launch-angle
   * space: x = ballX + D·tan(target + dev) + windYd  ⇔  dev = atan2(x − ballX − windYd, D) − target.
   * @param {number} D @param {number} ballX @param {number} windYd @param {number} targetDeg
   * @param {number} mean deg (aim mean + overswing bias) @param {number} contact deg (± mixture)
   * @param {number} sigma deg @param {number} aimSd deg @param {number} pShank
   * @returns {number}
   */
  function lateralProb(D, ballX, windYd, targetDeg, mean, contact, sigma, aimSd, pShank) {
    var G = K().geometry, DK = K().doink, SH = K().shank;
    var xs = [-G.H - G.R_POST, -G.H, -G.H + G.R_POST, G.H - G.R_POST, G.H, G.H + G.R_POST];
    var edges = [];
    for (var i = 0; i < xs.length; i++) edges.push(Math.atan2(xs[i] - ballX - windYd, D) * DEG - targetDeg);
    var zones = [                                              // [left edge, right edge, P(in | lands in zone)]
      [0, 1, DK.uprightInOutside], [1, 2, DK.uprightInInside], [2, 3, 1], [3, 4, DK.uprightInInside], [4, 5, DK.uprightInOutside]
    ];
    var sdN = Math.sqrt(sigma * sigma + aimSd * aimSd);
    var sdS = Math.sqrt(SH.sigmaMult * SH.sigmaMult * sigma * sigma + aimSd * aimSd);
    var comps = [
      { w: (1 - pShank) / 2, mu: mean - contact, sd: sdN }, { w: (1 - pShank) / 2, mu: mean + contact, sd: sdN },
      { w: pShank / 2, mu: mean - contact, sd: sdS }, { w: pShank / 2, mu: mean + contact, sd: sdS }
    ];
    var p = 0;
    for (var c = 0; c < comps.length; c++) {
      for (var z = 0; z < zones.length; z++) {
        p += comps[c].w * zones[z][2] * Util.gaussCdfBetween(edges[zones[z][0]], edges[zones[z][1]], comps[c].mu, comps[c].sd);
      }
    }
    return clamp(p, 0, 1);
  }

  /**
   * The pure closed-form model (§2.3.9): every derived number for a context, assuming the AI power
   * rule (with its N(0, 0.02) noise) and quality 0.85 unless overridden in `opts`.
   *   pClear   = Φ((carryMax·Peff − Rneed) / (powerNoiseSd·qualityFactor·carryMax))
   *   pLateral = mixture integral over the window (see lateralProb)
   *   pMake    = (1 − pBlock)·pClear·pLateral
   * Consumers: coach decision, auto-sim, HUD overlays, kick_model / calibration tests.
   * @param {Object} ctx KickContext
   * @param {Object} [attrs] raw attrs (default ctx.kicker.attrs; form is applied from ctx.kicker.form)
   * @param {{power?:number, quality?:number, aim?:number, aimSd?:number, powerSd?:number, holdMs?:number}} [opts]
   * @returns {{sigmaDeg:number, sigmaParts:Object, targetDeg:number, windowDeg:{left:number, right:number}, maxFG:number, carryMax:number,
   *   rneed:number, pNeed:number, windDriftYd:number, windDriftDeg:number, flightTime:number, pBlock:number, pShank:number,
   *   pMake:number, pClear:number, pLateral:number, power:number, quality:number, peff:number, aimMean:number, overBiasDeg:number, contactDeg:number}}
   */
  Kick.model = function (ctx, attrs, opts) {
    opts = opts || {};
    var A = K().ai, R = K().range, C = K().contact;
    var kicker = kickerOf(ctx);
    attrs = attrsFor(ctx, attrs);
    var D = ctx.distance;
    var maxFG = Kick.maxFG(attrs.POW, ctx, kicker);
    var carryMax = Kick.carryMax(maxFG);
    var rneed = Kick.rneed(D);
    var pNeed = rneed / carryMax;
    var quality = opts.quality !== undefined ? clamp(opts.quality, 0, 1) : A.modelQuality;
    var power = opts.power !== undefined ? clamp(opts.power, 0, R.powerMax) : Kick.aiPower(pNeed);
    var qualityFactor = R.contactPowerBase + R.contactPowerQuality * quality;
    var peff = power * qualityFactor;
    var wind = Kick.windDrift(ctx);
    var targetDeg = Kick.targetDeg(ctx.ballX, D);
    var parts = Kick.sigmaParts(ctx, { power: power, holdMs: opts.holdMs }, attrs);
    var sigma = parts.total;
    var pShank = Kick.pShank(attrs.CON);
    var pBlock = Kick.pBlock(ctx, peff, maxFG, attrs);
    var aimSd = opts.aimSd !== undefined ? Math.max(0, opts.aimSd) : A.aimSd;
    var aimMean = opts.aim !== undefined ? clamp(opts.aim, -R.aimMax, R.aimMax) : -wind.deg * Kick.aiWindComp(attrs.ACC);
    var overBias = Kick.overBias(power, kicker.foot);
    var contact = (1 - quality) * C.degPerQuality;
    var pLateral = lateralProb(D, ctx.ballX || 0, wind.yd, targetDeg, aimMean + overBias, contact, sigma, aimSd, pShank);
    var powerSd = opts.powerSd !== undefined ? Math.max(0, opts.powerSd) : A.powerNoiseSd;
    var margin = carryMax * peff - rneed;
    var pClear = powerSd > 0 ? Util.phi(margin / (powerSd * qualityFactor * carryMax)) : (margin >= 0 ? 1 : 0);
    var pMake = (1 - pBlock) * pClear * pLateral;
    return {
      sigmaDeg: sigma, sigmaParts: parts, targetDeg: targetDeg, windowDeg: Kick.windowDeg(ctx),
      maxFG: maxFG, carryMax: carryMax, rneed: rneed, pNeed: pNeed,
      windDriftYd: wind.yd, windDriftDeg: wind.deg, flightTime: Kick.flightTime(D),
      pBlock: pBlock, pShank: pShank, pMake: pMake, pClear: pClear, pLateral: pLateral,
      power: power, quality: quality, peff: peff, aimMean: aimMean, overBiasDeg: overBias, contactDeg: contact
    };
  };

  // ═══════════════════════════════ RESOLVE (§2.3.4, §2.3.11) ═══════════════════════════════

  /**
   * Outcome classification (§2.3.4), in this order: blocked → short → crossbar band → upright band → good → wide.
   * Draws: BLOCKED → 1 (return for a score); crossbar band → 1; upright band → 1; otherwise 0.
   * @param {boolean} blocked @param {number} h height at the goal plane (yd) @param {number} x lateral at the goal plane (yd)
   * @param {RNG} rng @param {{type:string, league:string}} ctx
   * @returns {{outcome:string, sub:string, blockReturnTd:boolean}}
   */
  Kick.classify = function (blocked, h, x, rng, ctx) {
    var G = K().geometry, DK = K().doink, B = K().block;
    if (blocked) {
      var pRet = ctx.type === 'PAT' ? (ctx.league === 'NFL' ? B.patReturnProb : 0) : B.scoopTdProb;
      return { outcome: 'BLOCKED', sub: '', blockReturnTd: rng.chance(pRet) };
    }
    if (h < G.XBAR - G.XBAR_BAND) return { outcome: 'SHORT', sub: h < G.LINE_DRIVE_H ? 'LINE_DRIVE' : '', blockReturnTd: false };
    var ax = Math.abs(x);
    if (Math.abs(h - G.XBAR) <= G.XBAR_BAND && ax < G.H) {
      return { outcome: rng.chance(DK.xbarIn) ? 'XBAR_IN' : 'XBAR_OUT', sub: '', blockReturnTd: false };
    }
    if (Math.abs(ax - G.H) <= G.R_POST) {
      var pIn = ax < G.H ? DK.uprightInInside : DK.uprightInOutside;
      return { outcome: rng.chance(pIn) ? 'DOINK_IN' : 'DOINK_OUT', sub: '', blockReturnTd: false };
    }
    if (ax < G.H - G.R_POST) {
      return { outcome: 'GOOD', sub: ax < G.DEAD_CENTER_X ? 'DEAD_CENTER' : (ax > G.SNEAKS_X ? 'SNEAKS' : ''), blockReturnTd: false };
    }
    return { outcome: x < 0 ? 'WIDE_L' : 'WIDE_R', sub: '', blockReturnTd: false };
  };

  /** Points for a made kick by type. */
  function pointsFor(type) {
    return type === 'PAT' ? K().points.PAT : K().points.FG;
  }

  /**
   * Result tags (§3.4): clutch (pressure ≥ 0.6), decisive, iced, asTimeExpires, playoff, fiftyPlus (FG ≥ 50), auto.
   * gameWinner / tieForcer are appended later by Sim once the game outcome is known.
   * @param {Object} ctx @param {{auto?:boolean}} [opts] @returns {string[]}
   */
  Kick.tagsFor = function (ctx, opts) {
    opts = opts || {};
    var P = K().pressure;
    var tags = [];
    if (ctx.clutch || num(ctx.pressure, 0) >= P.clutchThreshold) tags.push('clutch');
    if (ctx.decisive) tags.push('decisive');
    if (ctx.iced) tags.push('iced');
    if (ctx.asTimeExpires) tags.push('asTimeExpires');
    if (ctx.playoff) tags.push('playoff');
    if (ctx.type === 'FG' && ctx.distance >= P.longDistFrom) tags.push('fiftyPlus');
    if (opts.auto) tags.push('auto');
    return tags;
  };

  /** Launch-angle guard for the tan() projection. */
  function clampLaunch(deg) {
    var L = K().range.launchClampDeg;
    return clamp(deg, -L, L);
  }

  /** Normalise a KickInput (clamps per §2.3.8). */
  function normInput(input) {
    var R = K().range;
    input = input || {};
    return {
      power: clamp(num(input.power, 0), 0, R.powerMax),
      aim: clamp(num(input.aim, 0), -R.aimMax, R.aimMax),
      quality: clamp(num(input.quality, 0), 0, 1),
      holdMs: Math.max(0, num(input.holdMs, 0))
    };
  }

  /** Assemble a KickResult (§3.4) from the resolved numbers. */
  function makeResult(ctx, m, inp, n, cls, opts) {
    var made = Kick.isMade(cls.outcome);
    var res = {
      outcome: cls.outcome, made: made, points: made ? pointsFor(ctx.type) : 0, type: ctx.type, distance: ctx.distance,
      xYd: rd(n.x), hYd: rd(n.h), launchDeg: rd(n.launch), errDeg: rd(n.err), shank: !!n.shank,
      contactDeg: rd(n.contact), overBiasDeg: rd(n.overBias), windDriftYd: rd(m.windDriftYd), sigmaDeg: rd(n.sigma),
      power: rd(inp.power), aim: rd(inp.aim), quality: rd(inp.quality), holdMs: Math.round(inp.holdMs),
      flightTime: rd(m.flightTime), sub: cls.sub || '', blocked: !!n.blocked, blockReturnTd: !!cls.blockReturnTd,
      pMake: rd(m.pMake), pNeed: rd(m.pNeed),
      tags: Kick.tagsFor(ctx, opts), auto: !!(opts && opts.auto), forced: !!(opts && opts.forced),
      feedback: null
    };
    res.feedback = Kick.feedbackFor(ctx, m, inp, res);
    return res;
  }

  /**
   * Resolve a kick (§2.3.11). Attributes come from `ctx.kicker` unless `attrs` is given explicitly
   * (leave it null for replays). Draw order is FIXED:
   *   1 block · 2 shank-select · 3,4 error gauss · 5 contact sign · 6.. classify (see Kick.classify).
   * opts.forced (debug) builds a consistent result for a requested outcome without consuming rng;
   * opts.auto tags the result 'auto'.
   * @param {RNG} rng @param {Object} ctx KickContext @param {Object|null} attrs
   * @param {{power:number, aim:number, quality:number, holdMs?:number}} input
   * @param {{forced?:string|{outcome:string, sub?:string, side?:number, blockReturnTd?:boolean}, auto?:boolean}} [opts]
   * @returns {Object} KickResult
   */
  Kick.resolve = function (rng, ctx, attrs, input, opts) {
    opts = opts || {};
    var T = K();
    var kicker = kickerOf(ctx);
    attrs = attrsFor(ctx, attrs);
    var inp = normInput(input);
    var m = Kick.model(ctx, attrs);                                                       // input-independent numbers
    if (opts.forced) return Kick.forcedResult(ctx, attrs, inp, opts.forced, m, opts);
    var D = ctx.distance;
    var peff = Kick.peff(inp.power, inp.quality);
    var blocked = rng.chance(Kick.pBlock(ctx, peff, m.maxFG, attrs));                     // draw 1
    var sigma = Kick.sigmaFor(ctx, inp, attrs);                                           // deterministic
    var shank = rng.chance(m.pShank);                                                     // draw 2
    var err = rng.gauss(0, shank ? T.shank.sigmaMult * sigma : sigma);                    // draws 3, 4
    var csign = rng.chance(T.contact.signProb) ? -1 : 1;                                  // draw 5
    var contact = (1 - inp.quality) * T.contact.degPerQuality * csign;
    var overBias = Kick.overBias(inp.power, kicker.foot);
    var launch = m.targetDeg + inp.aim + err + contact + overBias;
    var carry = m.carryMax * peff;
    var h = Kick.heightAt(D, carry);
    var x = (ctx.ballX || 0) + D * Math.tan(Util.degToRad(clampLaunch(launch))) + m.windDriftYd;
    var cls = Kick.classify(blocked, h, x, rng, ctx);                                     // draws 6.. as needed
    return makeResult(ctx, m, inp, {
      x: x, h: h, launch: launch, err: err, shank: shank, contact: contact, overBias: overBias, sigma: sigma, blocked: blocked
    }, cls, opts);
  };

  /**
   * Debug: a consistent KickResult for a requested outcome without consuming rng. `forced` is an
   * outcome string or {outcome, sub?, side? (−1 left / +1 right), blockReturnTd?}.
   * @param {Object} ctx @param {Object|null} attrs @param {Object} input @param {string|Object} forced
   * @param {Object} [model] @param {{auto?:boolean}} [opts] @returns {Object} KickResult
   */
  Kick.forcedResult = function (ctx, attrs, input, forced, model, opts) {
    var T = K(), G = T.geometry, F = T.forced;
    var f = typeof forced === 'string' ? { outcome: forced } : (forced || {});
    var outcome = has(OUTCOMES, f.outcome) ? f.outcome : 'GOOD';
    var kicker = kickerOf(ctx);
    attrs = attrsFor(ctx, attrs);
    var m = model || Kick.model(ctx, attrs);
    var inp = normInput(input);
    var D = ctx.distance;
    var side = f.side === -1 || f.side === 1 ? f.side : footSign(kicker.foot);
    var carry = m.carryMax * Kick.peff(inp.power, inp.quality);
    var h = Math.max(Kick.heightAt(D, carry), G.XBAR + F.clearMargin);
    var x = F.goodX * side, blocked = false, sub = f.sub || '';
    switch (outcome) {
      case 'GOOD':
        if (sub === 'SNEAKS') x = F.sneaksX * side;
        else if (sub === 'DEAD_CENTER') x = 0;
        else sub = Math.abs(x) < G.DEAD_CENTER_X ? 'DEAD_CENTER' : '';
        break;
      case 'WIDE_L': x = -(G.H + F.wideMargin); sub = ''; break;
      case 'WIDE_R': x = G.H + F.wideMargin; sub = ''; break;
      case 'SHORT':
        h = sub === 'LINE_DRIVE' ? G.LINE_DRIVE_H / 2 : G.XBAR - G.XBAR_BAND - F.shortMargin;
        sub = h < G.LINE_DRIVE_H ? 'LINE_DRIVE' : '';
        break;
      case 'BLOCKED': blocked = true; x = 0; h = 0; sub = ''; break;
      case 'DOINK_IN': x = (G.H - G.R_POST / 2) * side; sub = ''; break;
      case 'DOINK_OUT': x = (G.H + G.R_POST / 2) * side; sub = ''; break;
      default: h = G.XBAR; x = F.goodX * side; sub = ''; break;                 // XBAR_IN / XBAR_OUT
    }
    var overBias = Kick.overBias(inp.power, kicker.foot);
    var contact = (1 - inp.quality) * T.contact.degPerQuality * side;
    var launch = blocked ? m.targetDeg + inp.aim : Math.atan2(x - (ctx.ballX || 0) - m.windDriftYd, D) * DEG;
    var err = launch - m.targetDeg - inp.aim - contact - overBias;
    var o = Object.assign({}, opts || {}, { forced: true });
    return makeResult(ctx, m, inp, {
      x: x, h: h, launch: launch, err: err, shank: false, contact: contact, overBias: overBias, sigma: m.sigmaDeg, blocked: blocked
    }, { outcome: outcome, sub: sub, blockReturnTd: !!f.blockReturnTd }, o);
  };

  // ═══════════════════════════════ FEEDBACK (§3.4) ═══════════════════════════════

  /**
   * "2 ft" / "1 yd 1 ft" / "4 yd" from a yard value (never less than 1 ft).
   * @param {number} yd @returns {string}
   */
  Kick.fmtYards = function (yd) {
    var ftPerYd = K().feedback.ftPerYd;
    var totalFt = Math.max(1, Math.round(Math.max(0, yd) * ftPerYd));
    var y = Math.floor(totalFt / ftPerYd), ft = totalFt - y * ftPerYd;
    if (!y) return ft + ' ft';
    return ft ? (y + ' yd ' + ft + ' ft') : (y + ' yd');
  };

  /** Timing label from contact quality: PURE ≥ 0.90 · GOOD ≥ 0.75 · FAIR ≥ 0.50 · POOR. */
  function timingLabel(quality) {
    var F = K().feedback.timing;
    return quality >= F.pure ? 'PURE' : (quality >= F.good ? 'GOOD' : (quality >= F.fair ? 'FAIR' : 'POOR'));
  }

  /** Power label: OVERSWING > 1.0 · WEAK < pNeed · SMOOTH within the green zone [pNeed, pNeed + 0.15] · FULL above it. */
  function powerLabel(power, pNeed) {
    if (power > 1) return 'OVERSWING';
    if (power < pNeed) return 'WEAK';
    return power <= pNeed + K().feedback.powerFullAbove ? 'SMOOTH' : 'FULL';
  }

  /** Miss geometry {yd, side, text}: wide by |x| − H, short by Rneed − carry. */
  function missBy(ctx, m, inp, result) {
    var G = K().geometry;
    var x = result.xYd, ax = Math.abs(x);
    var sideName = x < 0 ? 'left' : 'right', side = x < 0 ? 'L' : 'R';
    switch (result.outcome) {
      case 'WIDE_L': case 'WIDE_R': {
        var yd = Math.max(0, ax - G.H);
        return { yd: rd(yd), side: side, text: 'Wide ' + sideName + ' by ' + Kick.fmtYards(yd) };
      }
      case 'DOINK_OUT': return { yd: rd(Math.max(0, ax - G.H)), side: side, text: 'Off the ' + sideName + ' upright, no good' };
      case 'DOINK_IN': return { yd: 0, side: null, text: 'Off the ' + sideName + ' upright and in' };
      case 'XBAR_OUT': return { yd: 0, side: 'SHORT', text: 'Off the crossbar, no good' };
      case 'XBAR_IN': return { yd: 0, side: null, text: 'Off the crossbar and in' };
      case 'SHORT': {
        var shortYd = Math.max(0, m.rneed - m.carryMax * Kick.peff(inp.power, inp.quality));
        return { yd: rd(shortYd), side: 'SHORT', text: 'Short by ' + Kick.fmtYards(shortYd) };
      }
      case 'BLOCKED': return { yd: 0, side: null, text: 'Blocked' };
      default: return { yd: 0, side: null, text: '' };
    }
  }

  /** One sentence: what the coach saw. Names the dominant cause of a miss. */
  function coachSaw(ctx, m, inp, result, miss) {
    var E = K().feedback.explain, P = K().pressure;
    var x = result.xYd, dir = x < 0 ? 'left' : 'right';
    var clutch = num(ctx.pressure, 0) >= P.clutchThreshold;
    switch (result.outcome) {
      case 'BLOCKED':
        if (result.blockReturnTd) return 'Coach saw the block go the other way. Nothing to say about that one.';
        return inp.power > 1 ? 'Coach saw you strain for it and drive it low — the line got a hand on it.'
          : 'Coach saw the rush get home. That one is on the line, not on you.';
      case 'SHORT':
        if (result.sub === 'LINE_DRIVE') return 'Coach saw a line drive. You needed more leg and a lot more loft.';
        return inp.quality < K().feedback.timing.fair ? 'Coach saw you catch it thin — the contact bled the power out of it.'
          : 'Coach saw it die at the crossbar — a touch more power next time.';
      case 'XBAR_OUT': return 'Coach saw it clang off the crossbar. Inches.';
      case 'XBAR_IN': return 'Coach saw it hit the crossbar and drop in. He will take it.';
      case 'DOINK_OUT': return 'Coach saw it hit the ' + dir + ' upright. That is the post\'s call, not yours.';
      case 'DOINK_IN': return 'Coach saw it doink in off the ' + dir + ' upright. Ugly counts.';
      case 'GOOD':
        if (result.sub === 'DEAD_CENTER') return clutch ? 'Coach saw ice in your veins — dead centre with the game on the line.' : 'Coach saw a pure strike, dead centre.';
        if (result.sub === 'SNEAKS') {
          return Math.abs(result.windDriftYd) >= E.windYd ? 'Coach saw the wind nearly take it — it snuck inside the ' + dir + ' post.'
            : 'Coach saw it sneak inside the ' + dir + ' post. Lucky, but it counts.';
        }
        return clutch ? 'Coach saw you handle the moment. Clean strike.' : 'Coach saw a clean strike.';
      default: break;
    }
    // WIDE_L / WIDE_R: name the dominant cause on the miss side
    var missSign = x < 0 ? -1 : 1;
    if (result.shank) return 'Coach saw you shank it off the side of your foot. Slow the swing down.';
    if (Math.abs(result.contactDeg) >= E.contactDeg && result.contactDeg * missSign > 0) return 'Coach saw sloppy contact — your foot came through crooked and pushed it ' + dir + '.';
    if (result.overBiasDeg * missSign > 0 && Math.abs(result.overBiasDeg) >= E.contactDeg / 2) return 'Coach saw you overswing. The plant side opened up and it went ' + dir + '.';
    if (Math.abs(result.windDriftYd) >= E.windYd && result.windDriftYd * missSign > 0) return 'Coach saw the wind take it ' + dir + '. Aim into it next time.';
    var idealAim = -m.windDriftDeg * Kick.aiWindComp(attrsFor(ctx, null).ACC);
    var aimResid = inp.aim - idealAim;
    if (Math.abs(aimResid) >= E.aimDeg && aimResid * missSign > 0) return 'Coach saw you aim it ' + dir + ' of the line. Trust the line.';
    if (clutch) return 'Coach saw the moment get to you — you ' + (missSign < 0 ? 'pulled' : 'pushed') + ' it ' + dir + '.';
    if (Math.abs(result.errDeg) >= E.errDeg) return 'Coach saw you ' + (missSign < 0 ? 'pull' : 'push') + ' it ' + dir + '. Nothing mechanical, just a miss.';
    return 'Coach saw it drift ' + dir + ' by ' + Kick.fmtYards(miss.yd) + '. Close.';
  }

  /**
   * Feedback block for a result (§3.4): timing / power labels, miss geometry (yards, side and a
   * yards + feet text) and one "what the coach saw" sentence. Pure.
   * @param {Object} ctx @param {Object|null} model (computed when omitted) @param {Object} input @param {Object} result
   * @returns {{timing:string, power:string, missBy:{yd:number, side:string|null, text:string}, coachSaw:string}}
   */
  Kick.feedbackFor = function (ctx, model, input, result) {
    var m = model || Kick.model(ctx, null);
    var inp = normInput(input);
    var miss = missBy(ctx, m, inp, result);
    return { timing: timingLabel(inp.quality), power: powerLabel(inp.power, m.pNeed), missBy: miss, coachSaw: coachSaw(ctx, m, inp, result, miss) };
  };

  // ═══════════════════════════════ KICKOFFS (§2.3.10) ═══════════════════════════════

  /**
   * Width of the kickoff timing green zone in percent of the bar: 12 + 0.35·KO.
   * @param {number} KO @returns {number}
   */
  Kick.kickoffGreenZone = function (KO) {
    var Kf = K().kickoff;
    return Kf.greenZoneBase + Kf.greenZonePerKo * KO;
  };

  /**
   * Resolve a kickoff (§2.3.10). `input` null = simulated (|timing| = Tuning.kick.kickoff.autoTiming),
   * {timing: −1..1} from the one-tap bar, {onside: true} for onside kicks (also ctx.onside).
   *   hang = 3.4 + 0.012·KO + 0.3·(1 − |timing|) + N(0, 0.12) s
   *   dist = 55 + distPerKo·KO + 4·(1 − |timing|) + N(0, 4) yd from the 35; touchback if dist ≥ 65
   * Draws: onside → recover roll 1. Otherwise hang gauss 2 · dist gauss 2 · (returned) start-yard gauss 2 · return-TD roll 1.
   * `startYard` is the own yard line of the team in `possession`; `ytg` = 100 − startYard.
   * @param {RNG} rng @param {Object} ctx @param {Object|null} attrs @param {{timing?:number, onside?:boolean}|null} input
   * @returns {{type:'KO', outcome:string, touchback:boolean, dist:number, hang:number, timing:number, auto:boolean, oob:boolean,
   *   onside:boolean, recovered:boolean, returnTd:boolean, possession:'receiving'|'kicking', startYard:number, ytg:number, points:number, made:boolean, tags:string[]}}
   */
  Kick.resolveKickoff = function (rng, ctx, attrs, input) {
    var Kf = K().kickoff;
    var kicker = kickerOf(ctx);
    attrs = attrsFor(ctx, attrs);
    var KO = num(attrs.KO, attrs.CON);
    var league = ctx && ctx.league === 'NFL' ? 'NFL' : 'COLLEGE';
    var auto = !input;
    var timing = auto ? Kf.autoTiming : clamp(num(input.timing, 0), -1, 1);
    var res = {
      type: 'KO', outcome: 'RETURN', touchback: false, dist: 0, hang: 0, timing: rd(timing), auto: auto, oob: false,
      onside: false, recovered: false, returnTd: false, possession: 'receiving', startYard: 0, ytg: 0, points: 0, made: false,
      tags: auto ? ['auto'] : []
    };
    if ((input && input.onside) || (ctx && ctx.onside)) {
      var pRec = kicker.flags && kicker.flags.ONSIDE_TRAINED ? Kf.onsideTrainedProb : Kf.onsideProb;
      res.onside = true;
      res.recovered = rng.chance(pRec);                                                     // draw 1
      res.outcome = res.recovered ? 'ONSIDE_RECOVERED' : 'ONSIDE_LOST';
      res.dist = Kf.onsideDist;
      res.possession = res.recovered ? 'kicking' : 'receiving';
      res.startYard = res.recovered ? Kf.kickFromYard + Kf.onsideDist : FIELD_YARDS - Kf.kickFromYard - Kf.onsideDist;
      res.made = res.recovered;
      res.ytg = FIELD_YARDS - res.startYard;
      return res;
    }
    var bonus = 1 - Math.abs(timing);
    var hang = Kf.hangBase + Kf.hangPerKo * KO + Kf.hangTiming * bonus + rng.gauss(0, Kf.hangSd);      // draws 1, 2
    var dist = Kf.distBase + Kf.distPerKo * KO + Kf.distTiming * bonus + rng.gauss(0, Kf.distSd);      // draws 3, 4
    res.hang = Util.roundN(hang, 2);
    res.dist = Util.round1(dist);
    if (Math.abs(timing) > Kf.oobTiming) {
      res.oob = true; res.outcome = 'OOB'; res.startYard = Kf.oobYard;
    } else if (dist >= Kf.touchbackDist) {
      res.touchback = true; res.outcome = 'TOUCHBACK'; res.made = true; res.startYard = Kf.touchbackYard[league];
    } else {
      var mean = Kf.returnBase + (Kf.touchbackDist - dist) * Kf.returnPerYdShort - (hang - Kf.returnHangAnchor) * Kf.returnPerHangSec;
      res.startYard = clamp(Math.round(rng.gauss(mean, Kf.returnSd)), Kf.returnMin, Kf.returnMax);   // draws 5, 6
      res.returnTd = rng.chance(Kf.returnTdProb);                                                    // draw 7
      if (res.returnTd) { res.outcome = 'RETURN_TD'; res.startYard = FIELD_YARDS; }
    }
    res.ytg = FIELD_YARDS - res.startYard;
    return res;
  };

  // ═══════════════════════════════ CONTEXT (§2.3.7, §3.5.8) ═══════════════════════════════

  function leagueObjFor(state, league) {
    if (!state || !state.leagues) return null;
    return league === 'NFL' ? state.leagues.nfl : state.leagues.college;
  }

  function findTeam(leagueObj, id) {
    if (!leagueObj || !id || !leagueObj.teams) return null;
    var idx = leagueObj.teamIndex && leagueObj.teamIndex[id];
    if (typeof idx === 'number' && leagueObj.teams[idx] && leagueObj.teams[idx].id === id) return leagueObj.teams[idx];
    for (var i = 0; i < leagueObj.teams.length; i++) if (leagueObj.teams[i].id === id) return leagueObj.teams[i];
    return null;
  }

  /**
   * Kicker snapshot {attrs, form, mods, traits, foot, flags} from a Player, an AIKicker or a bare
   * attrs object. Everything is copied so later state changes never alter a stored context.
   * @param {Object} src @returns {Object}
   */
  Kick.snapshotKicker = function (src) {
    src = src || {};
    var attrs = src.attrs && typeof src.attrs.ACC === 'number' ? src.attrs : (typeof src.ACC === 'number' ? src : null);
    return {
      attrs: fullAttrs(attrs),
      form: num(src.form, 0),
      mods: Array.isArray(src.mods) ? Util.deepClone(src.mods) : [],
      traits: Array.isArray(src.traits) ? src.traits.slice() : [],
      foot: src.foot === 'L' ? 'L' : 'R',
      flags: src.flags && typeof src.flags === 'object' ? Util.deepClone(src.flags) : {}
    };
  };

  /** The object to snapshot for a situation: explicit kicker/attrs → the user → the team's AI kicker. */
  function kickerSource(state, situation, isUser, leagueObj, teamId) {
    if (situation.kicker) return situation.kicker;
    if (situation.attrs) return { attrs: situation.attrs, foot: situation.foot };
    if (isUser && state && state.player) return state.player;
    if (leagueObj) {
      if (leagueObj.kickers && leagueObj.kickers[teamId]) return leagueObj.kickers[teamId];
      var t = findTeam(leagueObj, teamId);
      if (t && t.kicker) return t.kicker;
      if (t && t.kicker2) return t.kicker2;
    }
    return null;
  }

  /** Rivalry: the college data rival, or the same NFL division. */
  function isRivalry(team, opp, league) {
    if (!team || !opp) return false;
    if (league === 'NFL') return !!team.conf && team.conf === opp.conf && !!team.div && team.div === opp.div;
    return team.rival === opp.id || opp.rival === team.id;
  }

  /** Overtime? (q beyond regulation or gs.ot present). */
  function inOvertime(gs) {
    return !!gs && (gs.q > Tuning.sim.clock.quarters || !!gs.ot);
  }

  /** Decisive rule (§2.5.3): the kick ties or takes the lead and (Q4 ≤ 2:00 or OT). */
  function isDecisive(gs, side, type) {
    if (!gs || !side || !gs.score) return false;
    var P = K().pressure, Q = Tuning.sim.clock.quarters;
    var inWindow = inOvertime(gs) || (gs.q === Q && gs.clock <= P.decisiveClockSec);
    if (!inWindow) return false;
    var f = side === 'home' ? gs.score.home : gs.score.away;
    var a = side === 'home' ? gs.score.away : gs.score.home;
    return f <= a && f + pointsFor(type) >= a;
  }

  /** Deterministic rng for contexts built without one (never advances the caller's rng). */
  function fallbackRng(state, gs, situation) {
    var key = [state && state.rngState, state && state.year, state && state.week, gs && gs.id, gs && gs.q, gs && gs.clock,
      situation.type, situation.distance, situation.side, situation.teamId].join(':');
    return RTG.RNG.create(Util.fnv1a32(key));
  }

  /**
   * Pressure (§2.3.7) for a situation: the clamped value, every additive term and the derived flags.
   * College OT kicks start from 0.9 (the `late` term is folded in); NFL OT kicks are `late` (≥ 0.35).
   * Iced adds nothing at CLU ≥ 90 (ice immunity). User-only terms: missStreak, fans relief, mods, difficulty.
   * @param {Object|null} state @param {Object|null} gs
   * @param {Object} sit situation (explicit flags win: late, decisive, asTimeExpires, playoff, rivalry, away, iced, ot)
   * @param {{isUser:boolean, league:string, distance:number, type:string, attrs:Object, side:string|null, team:Object|null, opp:Object|null}} info
   * @returns {{pressure:number, terms:Object, flags:Object}}
   */
  Kick.pressureFor = function (state, gs, sit, info) {
    var P = K().pressure, Q = Tuning.sim.clock.quarters;
    var player = info.isUser && state ? state.player : null;
    var ot = sit.ot !== undefined ? !!sit.ot : inOvertime(gs);
    var late = sit.late !== undefined ? !!sit.late : (ot || !!(gs && gs.q === Q && gs.clock <= P.lateClockSec));
    var decisive = sit.decisive !== undefined ? !!sit.decisive : isDecisive(gs, info.side, info.type);
    var asTimeExpires = !!sit.asTimeExpires;
    var playoff = sit.playoff !== undefined ? !!sit.playoff : !!(gs && gs.kind && gs.kind !== 'REG');
    var rivalry = sit.rivalry !== undefined ? !!sit.rivalry : isRivalry(info.team, info.opp, info.league);
    var away = sit.away !== undefined ? !!sit.away : (info.side === 'away');
    var longDist = info.type === 'FG' && info.distance >= P.longDistFrom;
    var missStreak = player ? num(player.missStreak, 0) : 0;
    var iced = sit.iced !== undefined ? !!sit.iced : !!(gs && gs.iced);
    var iceImmune = info.attrs.CLU >= P.iceImmuneClu;
    var fansRelief = !!player && num(player.fans, 0) >= P.fansReliefFrom;
    var collegeOt = info.league === 'COLLEGE' && ot;
    var terms = {
      base: collegeOt ? P.collegeOtBase : P.base,
      late: late && !collegeOt ? P.late : 0,
      decisive: decisive ? P.decisive : 0,
      asTimeExpires: asTimeExpires ? P.asTimeExpires : 0,
      playoff: playoff ? P.playoff : 0,
      rivalry: rivalry ? P.rivalry : 0,
      away: away ? P.away : 0,
      longDist: longDist ? P.longDist : 0,
      missStreak: missStreak >= P.missStreakFrom ? P.missStreak : 0,
      iced: iced && !iceImmune ? P.iced : 0,
      fansRelief: fansRelief ? -P.fansRelief : 0,
      mods: player ? Kick.modValue(player.mods, 'pressure', 'add') : 0,
      difficulty: info.isUser && state ? diffRow(state.difficulty).pressureAdd : 0
    };
    var sum = 0;
    for (var k in terms) if (Object.prototype.hasOwnProperty.call(terms, k)) sum += terms[k];
    return {
      pressure: clamp(sum, 0, 1), terms: terms,
      flags: { late: late, decisive: decisive, asTimeExpires: asTimeExpires, playoff: playoff, rivalry: rivalry, away: away, iced: iced, iceImmune: iced && iceImmune, ot: ot }
    };
  };

  /**
   * Probability that the defence ices a decisive kick (§2.3.7): difficulty.iceProb + 0.10·(fame ≥ 500) for the
   * user (AI kickers use the Pro row, no fame bump). Sim rolls it once per decisive kick when the defence has a timeout.
   * @param {Object|null} state @param {boolean} isUser @returns {number}
   */
  Kick.iceProb = function (state, isUser) {
    var P = K().pressure;
    var row = isUser && state ? diffRow(state.difficulty) : Tuning.difficulty.pro;
    var fame = isUser && state && state.player ? num(state.player.fame, 0) : 0;
    return clamp(row.iceProb + (fame >= P.iceFameFrom ? P.iceFameAdd : 0), 0, 1);
  };

  /** Wind as the kicker sees it: flipped for the away side and again for the second half (§2.5.5). */
  function orientWind(wind, side, gs) {
    var w = { speed: num(wind.speed, 0), dir: num(wind.dir, 0) };
    var half = gs ? (gs.half || (gs.q > Tuning.sim.clock.halfQuarter ? 2 : 1)) : 1;
    if ((side === 'away') !== (half === 2)) w.dir = (w.dir + HALF_TURN) % FULL_TURN;
    return w;
  }

  /**
   * Build a KickContext (§3.4) for a situation:
   *   {type, distance (or ytg), hash?, decisive?, asTimeExpires?, playoff?, rivalry?, away?, late?, iced?, ot?, oppST?,
   *    isUser, forSession?, calm?, pressure? (override), side? ('home'|'away'), teamId?, oppId?, league?,
   *    kicker? | attrs? (AI kicker / rival / bare attrs), wind? (used verbatim, no draws), gameWeather?,
   *    weather?, tempF?, surface?, altitude?, dome?, game? (snapshot overrides), rng?}
   * Draws: hash 1 (FG with hash undefined) · wind 2 (game weather present, not calm, no explicit wind)
   * · gusts 2 (Legend, user kick, wind > 0). The rng is the 4th argument or situation.rng; without either a
   * deterministic fallback derived from state.rngState is used (the caller's rng never advances).
   * @param {Object|null} state CareerState @param {Object|null} gs GameState @param {Object} situation @param {RNG} [rng]
   * @returns {Object} KickContext
   */
  Kick.buildContext = function (state, gs, situation, rng) {
    situation = situation || {};
    var T = K(), DF = T.defaults;
    rng = rng || situation.rng || null;
    var type = situation.type === 'PAT' || situation.type === 'KO' ? situation.type : 'FG';
    var isUser = situation.isUser !== undefined ? !!situation.isUser : !(situation.kicker || situation.attrs);
    var league = situation.league || (gs && gs.league) || (state && state.player && state.player.league)
      || (state && state.season && state.season.league) || 'COLLEGE';
    league = league === 'NFL' ? 'NFL' : 'COLLEGE';
    var difficulty = (state && state.difficulty) || 'pro';
    var distance;
    if (type === 'PAT') distance = Kick.patDistance(league);
    else if (type === 'KO') distance = T.kickoff.kickFromYard;
    else distance = num(situation.distance, typeof situation.ytg === 'number' ? Kick.distanceFor(situation.ytg) : Kick.patDistance(league));
    distance = clamp(Math.round(distance), 1, Tuning.progression.attrMax);

    // sides & teams
    var side = situation.side || (gs && isUser ? gs.userSide : null) || null;
    var teamId = situation.teamId || (gs && side ? gs[side + 'Id'] : null) || (isUser && state && state.player ? state.player.teamId : null) || null;
    var oppSide = side === 'home' ? 'away' : (side === 'away' ? 'home' : null);
    var oppId = situation.oppId || (gs && oppSide ? gs[oppSide + 'Id'] : null) || null;
    var leagueObj = leagueObjFor(state, league);
    var team = findTeam(leagueObj, teamId), opp = findTeam(leagueObj, oppId);
    var oppST = num(situation.oppST, opp ? num(opp.ST, DF.oppST) : DF.oppST);

    // kicker snapshot (the ONLY attribute source for resolve)
    var kicker = Kick.snapshotKicker(kickerSource(state, situation, isUser, leagueObj, teamId));

    // hash (1 draw for an FG with no hash given; PATs are always from the middle)
    var hash = 0;
    if (type === 'FG') {
      if (situation.hash === undefined || situation.hash === null) {
        var dist = T.hash.snapDist[league];
        var pickRng = rng || fallbackRng(state, gs, situation);
        hash = pickRng.weighted([{ h: -1, w: dist.L }, { h: 0, w: dist.M }, { h: 1, w: dist.R }], 'w').h;   // draw 1
      } else {
        hash = situation.hash < 0 ? -1 : (situation.hash > 0 ? 1 : 0);
      }
    }
    var ballX = Kick.ballXFor(league, hash);

    // weather & wind
    var calm = !!situation.calm || (!!situation.forSession && !situation.gameWeather && !gs);
    var wx = situation.gameWeather || (gs && gs.weather) || (!calm && state && state.game && state.game.weather) || null;
    var dome = situation.dome !== undefined ? !!situation.dome : !!(wx && wx.dome);
    var weather = situation.weather || (wx && wx.weather) || (dome ? 'dome' : DF.weather);
    var tempF = num(situation.tempF, wx ? num(wx.tempF, DF.tempF) : DF.tempF);
    var surface = situation.surface || (wx && wx.surface) || DF.surface;
    var altitude = situation.altitude !== undefined ? !!situation.altitude : !!(wx && wx.altitude);
    var wind;
    if (situation.wind) {
      wind = { speed: num(situation.wind.speed, 0), dir: num(situation.wind.dir, 0) };
      if (typeof situation.wind.gust === 'number') wind.gust = situation.wind.gust;
    } else if (!wx || calm || dome || weather === 'dome') {
      wind = { speed: 0, dir: 0 };
    } else {
      var windRng = rng || fallbackRng(state, gs, situation);
      wind = orientWind(RTG.Weather.perKick(windRng, wx), side, gs);                       // draws 2, 3
      if (isUser && diffRow(difficulty).gusts && wind.speed > 0) {
        wind.gust = Math.max(0, 1 + windRng.gauss(0, T.wind.legendGustSd));                // draws 4, 5 (Legend, hidden)
      }
    }

    // pressure
    var info = { isUser: isUser, league: league, distance: distance, type: type, attrs: kicker.attrs, side: side, team: team, opp: opp };
    var pr = Kick.pressureFor(state, gs, situation, info);
    var pressure = situation.pressure !== undefined && situation.pressure !== null ? clamp(num(situation.pressure, 0), 0, 1) : pr.pressure;
    var g = gs || {};
    var scoreFor = g.score && side ? (side === 'home' ? g.score.home : g.score.away) : 0;
    var scoreAgainst = g.score && side ? (side === 'home' ? g.score.away : g.score.home) : 0;
    var sg = situation.game || {};

    return {
      type: type, league: league, distance: distance, hash: hash, ballX: ballX,
      wind: wind, weather: weather, tempF: tempF, surface: surface, altitude: altitude, dome: dome,
      pressure: pressure, clutch: pressure >= T.pressure.clutchThreshold,
      decisive: pr.flags.decisive, iced: pr.flags.iced, playoff: pr.flags.playoff, rivalry: pr.flags.rivalry,
      away: pr.flags.away, asTimeExpires: pr.flags.asTimeExpires, ot: pr.flags.ot, late: pr.flags.late,
      iceImmune: pr.flags.iceImmune,
      oppST: oppST, isUser: isUser, difficulty: difficulty,
      game: {
        q: num(sg.q, num(g.q, 1)), clock: num(sg.clock, num(g.clock, Tuning.sim.clock.quarterSec)),
        scoreFor: num(sg.scoreFor, scoreFor), scoreAgainst: num(sg.scoreAgainst, scoreAgainst),
        week: num(sg.week, num(g.week, state ? num(state.week, 0) : 0)),
        oppId: sg.oppId !== undefined ? sg.oppId : oppId, teamId: sg.teamId !== undefined ? sg.teamId : teamId
      },
      kicker: kicker
    };
  };

  /**
   * Convenience for UI overlays and the coach: pMake at a distance for the user (default) in the current
   * conditions — the in-progress game's weather/wind (no per-kick jitter) when state.game exists, else calm.
   * No rng draws. opts: {type?, hash? (default 0), pressure?, attrs?, isUser?, kicker?, wind?, calm?, decisive?, gs?, league?, side?}
   * @param {Object|null} state @param {number} distance @param {Object} [opts] @returns {number}
   */
  Kick.pMakeAt = function (state, distance, opts) {
    opts = opts || {};
    var gs = opts.gs !== undefined ? opts.gs : ((state && state.game) || null);
    var sit = Object.assign({}, opts, { type: opts.type || 'FG', distance: distance, hash: opts.hash !== undefined ? opts.hash : 0 });
    delete sit.gs; delete sit.attrs;
    if (sit.isUser === undefined) sit.isUser = true;
    if (!sit.wind) {
      if (gs && gs.weather && gs.weather.wind && !sit.calm && !gs.weather.dome) {
        sit.wind = orientWind(gs.weather.wind, sit.side || (sit.isUser ? gs.userSide : null), gs);
      } else {
        sit.wind = { speed: 0, dir: 0 };
      }
    }
    var ctx = Kick.buildContext(state, gs, sit);
    return Kick.model(ctx, opts.attrs || null).pMake;
  };

  RTG.Kick = Kick;
})(typeof window !== 'undefined' ? window : globalThis);
