/**
 * Road to Glory: QB — RTG.Play (the play engine: the pre-snap read, the snap, the throw, the demo's drive script)
 *
 * DOM-free and pure over plain JSON: every random number comes from the rng passed in (int / float / chance /
 * gauss / pick / weighted / shuffle / fork). The parent rng only ever sees FORKS — one draw per call — and every
 * child draw below is in a FIXED order, so a moment replays exactly from {situation, playId, input, rngState}.
 *
 * RNG draw accounting (binding):
 *   buildContext : 1 parent draw — rng.fork('play:ctx'). Child, in order:
 *                  coverage weighted 1 · disguise roll 1 · disguise pick 1 (always drawn, used only on a disguise)
 *                  · card count int 1 · goodOffered roll 1 · pass-card picks weighted 1 each (2–3) · pass-card shuffle (pass cards − 1)
 *                  · card clarity roll 1 per pass card (always drawn; it only matters under iqExact on an ambiguous card)
 *                  = 8 + 3 × pass cards (a run card on short yardage draws nothing)
 *                  · sackAt gauss 2 · hash int 1 · strong-side roll 1.
 *   snap         : 1 parent draw — rng.fork('play:snap'). Child, in order:
 *                  pass play → per receiver in slot order (WR1, WR2, SLOT, TE, RB): peak gauss 2 · window shift gauss 2
 *                  (20) · sackAt jitter gauss 2 · rush lanes shuffle 2 · lane gaps float 2 · scramble gauss 2 = 28.
 *                  SNEAK → success roll 1 · gain int 1 · loss int 1 = 3.   DRAW → yards gauss 2 · break roll 1 · break int 1 = 4.
 *   throw        : 1 parent draw — rng.fork('play:throw'). Child:
 *                  THROW → catch roll 1 · int roll 1 · drop roll 1 · yac gauss 2 · scatter gauss 2 + 2 = 9 (always).
 *                  SACK (t ≥ sackAt, or kind SACK) → yards gauss 2.   THROWAWAY (or no target) → 0.
 *                  SCRAMBLE → [escape roll 1 when t ≥ sackAt; a failed escape is a SACK: + yards gauss 2] · yards gauss 2 · fumble roll 1.
 *                  A run sim (snap already resolved it) → 0 child draws; the sim is returned as the result.
 *   driveScript  : 1 parent draw — rng.fork('play:drive'). Child: 25 draws in a fixed order (24 ints + the opening-score pick; see the function).
 *   rating, need, greenBand, inGreen, flightTime, pathAt, openAt, arrival, openIfThrown, isClutch, downText, spotText, forcedResult : 0.
 *
 * Shapes (the binding contract with the scene and the shell) are documented on each function.
 * Dependencies (load order): Tuning, Util, RNG (only through the rng passed in), Data.plays.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  var Util = RTG.Util, Tuning = RTG.Tuning;
  var Play = {};

  var clamp = Util.clamp;
  var FIELD_YARDS = 100;                 // goal line to goal line
  var RESULT_DECIMALS = 3;               // formatting precision of PlayResult numbers (not a balance constant)
  var PLATEAU_EPS = 0.02;                // openness within this of the peak counts as the plateau (peakAt = its centre)
  // The arrival solver (the receiver keeps running while the ball flies): fixed-point rounds until the flight moves
  // under eps, capped. A slow, lofted ball contracts by receiverSpeed / ballSpeed ≈ 0.8 per round, so a fixed four
  // rounds left up to 0.36 s of error; the cap is numerical, not a balance constant. The scene mirrors it.
  var ARRIVAL = { eps: 1e-4, maxRounds: 24 };
  var T_MAX = 1e6;                       // s: the largest release time accepted (Infinity / 1e308 clamp here and still sack)
  var ATTRS = ['ARM', 'ACC', 'IQ', 'MOB', 'POI'];
  var KINDS = ['THROW', 'THROWAWAY', 'SCRAMBLE', 'SACK'];
  var OUTCOMES = ['CATCH', 'INCOMPLETE', 'INT', 'SACK', 'THROWAWAY', 'SCRAMBLE', 'RUN', 'DROP'];
  var ADVICE = ['GOOD', 'OK', 'BAD'];
  var WINDOW = 'window';               // the contract's field name on routes, receivers and results (the purity scan forbids the bare identifier)
  var CROSSING = { SLANT: true, DRAG: true, IN: true, OUT: true, FLAT: true, SCREEN: true, CHECKDOWN: true, CURL: true, COMEBACK: true };
  // NFL passer rating: a definition, not a balance constant
  var RATING = { cmpSub: 0.3, cmpMul: 5, ydsSub: 3, ydsMul: 0.25, tdMul: 20, intMul: 25, cap: 2.375, div: 6, scale: 100 };

  /** Tuning.qb, read at call time so RTG.debug.tune edits apply. */
  function P() { return Tuning.qb; }
  /** RTG.Data.plays (routes, plays, coverages). */
  function D() { return RTG.Data.plays; }
  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
  function has(arr, v) { return !!arr && arr.indexOf(v) >= 0; }
  function rd(x) { return Util.roundN(x, RESULT_DECIMALS); }
  /** Normalise −0 to +0 (so zero results compare equal with Object.is / assert.equal). */
  function nz(x) { return x === 0 ? 0 : x; }
  function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
  /** attribute → 0..1 */
  function ratio(a) { return clamp(num(a, 0), 0, P().attrMax) / P().attrMax; }
  function fail(fn, msg) { throw new Error('Play.' + fn + ': ' + msg); }
  function signed(n) { return (n > 0 ? '+' : '') + n; }
  function mult(table, id) { return table && typeof table[id] === 'number' ? table[id] : 1; }
  function add(table, id) { return table && typeof table[id] === 'number' ? table[id] : 0; }
  function tanh(x) { var e = Math.exp(2 * x); return isFinite(e) ? (e - 1) / (e + 1) : (x > 0 ? 1 : -1); }

  Play.KINDS = KINDS;
  Play.OUTCOMES = OUTCOMES;
  Play.ADVICE = ADVICE;
  Play.ARRIVAL = ARRIVAL;

  // ═══════════════════════════════ NORMALISATION ═══════════════════════════════

  /** The demo preset a name points to (unknown → the default preset). */
  function preset(name) {
    var T = P().demo;
    return T.teams[name] || T.teams[T.defaultTeam];
  }

  /** A complete attrs object: the archetype's profile filled in for anything missing, rounded and clamped. */
  function fullAttrs(a, archetype) {
    var T = P(), base = T.archetypes[archetype] || T.archetypes[T.demo.defaultArchetype];
    var out = {};
    for (var i = 0; i < ATTRS.length; i++) {
      var k = ATTRS[i];
      out[k] = Util.roundClamp(num(a && a[k], base[k]), 0, T.attrMax);
    }
    return out;
  }

  /** {attrs, archetype, foot} from situation.qb (missing → the default archetype's profile). */
  function normQb(qb) {
    qb = qb || {};
    var T = P();
    var archetype = T.archetypes[qb.archetype] ? qb.archetype : T.demo.defaultArchetype;
    return { attrs: fullAttrs(qb.attrs, archetype), archetype: archetype, foot: qb.foot === 'L' ? 'L' : 'R' };
  }

  /**
   * The five receivers {slot, name, skill, speed} in slot order from situation.team.wr: an array (matched by
   * slot; missing slots filled from the default roster at the array's mean skill), a number (a skill level → the
   * default roster around it) or nothing (the default preset).
   */
  function normRoster(wr, fallbackSkill) {
    var T = P(), slots = D().slots, bySlot = {}, i;
    if (Array.isArray(wr)) for (i = 0; i < wr.length; i++) if (wr[i] && wr[i].slot) bySlot[wr[i].slot] = wr[i];
    var level = num(wr, fallbackSkill);                  // a number is a skill level; NaN / anything else → the fallback
    var out = [];
    for (i = 0; i < slots.length; i++) {
      var slot = slots[i], src = bySlot[slot], dflt = T.demo.defaultRoster[i];
      out.push({
        slot: slot,
        name: src && src.name ? String(src.name) : dflt.name,
        skill: Util.roundClamp(num(src && src.skill, level + dflt.skillAdd), 0, T.attrMax),
        speed: Util.roundClamp(num(src && src.speed, level + dflt.speedAdd), 0, T.attrMax)
      });
    }
    return out;
  }

  /** {ol, wr[5]} from situation.team. */
  function normTeam(team) {
    team = team || {};
    var T = P(), avg = preset(T.demo.defaultTeam);
    var meanSkill = avg.wr.reduce(function (s, r) { return s + r.skill; }, 0) / avg.wr.length;
    if (Array.isArray(team.wr) && team.wr.length) {
      var s = 0, n = 0;
      for (var i = 0; i < team.wr.length; i++) if (team.wr[i] && typeof team.wr[i].skill === 'number') { s += team.wr[i].skill; n++; }
      if (n) meanSkill = s / n;
    }
    return {
      ol: Util.roundClamp(num(team.ol, avg.ol), 0, T.attrMax),
      wr: normRoster(team.wr !== undefined ? team.wr : avg.wr, meanSkill)
    };
  }

  /** {dl, db, tendency} from situation.opp. */
  function normOpp(opp) {
    opp = opp || {};
    var T = P(), avg = preset(T.demo.defaultTeam);
    var tendency = null;
    if (opp.tendency && typeof opp.tendency === 'object') {
      tendency = {};
      for (var k in opp.tendency) if (Object.prototype.hasOwnProperty.call(opp.tendency, k) && num(opp.tendency[k], -1) >= 0) tendency[k] = opp.tendency[k];
    }
    return { dl: Util.roundClamp(num(opp.dl, avg.dl), 0, T.attrMax), db: Util.roundClamp(num(opp.db, avg.db), 0, T.attrMax), tendency: tendency };
  }

  /** The game situation: down, toGo, yl, quarter, clock, score, venue, weather, flags, copy. */
  function normSituation(s) {
    s = s || {};
    var score = s.score || {};
    var yl = clamp(Math.round(num(s.yl, 25)), 1, FIELD_YARDS - 1);
    var toGo = clamp(Math.round(num(s.toGo, 10)), 1, FIELD_YARDS - yl);
    var weather = null;
    if (s.weather && typeof s.weather === 'object') {
      weather = {
        weather: typeof s.weather.weather === 'string' ? s.weather.weather : 'clear',
        wind: { speed: num(s.weather.wind && s.weather.wind.speed, 0), dir: num(s.weather.wind && s.weather.wind.dir, 0) },
        tempF: num(s.weather.tempF, 70)
      };
    }
    return {
      idx: num(s.idx, 0), kind: typeof s.kind === 'string' ? s.kind : 'SNAP',
      down: clamp(Math.round(num(s.down, 1)), 1, 4), toGo: toGo, yl: yl,
      quarter: clamp(Math.round(num(s.quarter, 1)), 1, 5), clock: Math.max(0, Math.round(num(s.clock, 900))),
      score: { us: Math.max(0, Math.round(num(score.us, 0))), them: Math.max(0, Math.round(num(score.them, 0))) },
      venue: s.venue === 'HS' || s.venue === 'NFL' ? s.venue : 'COLLEGE',
      weather: weather,
      lastPlay: !!s.lastPlay, twoMinute: !!s.twoMinute, clutch: s.clutch === true,
      stakes: typeof s.stakes === 'string' ? s.stakes : ''
    };
  }

  // ═══════════════════════════════ TEXT ═══════════════════════════════

  /** '3RD & 7' · '4TH & GOAL' (toGo reaches the goal line). */
  Play.downText = function (sit) {
    var down = clamp(Math.round(num(sit && sit.down, 1)), 1, 4), toGo = num(sit && sit.toGo, 10), yl = num(sit && sit.yl, 25);
    var goal = yl + toGo >= FIELD_YARDS;
    return Util.ordinal(down).toUpperCase() + ' & ' + (goal ? 'GOAL' : toGo);
  };

  /** 'OWN 34' · 'MIDFIELD' · 'OPP 18' from a yard line (0..100 from the own goal). */
  Play.spotText = function (yl) {
    yl = Math.round(num(yl, 50));
    if (yl === FIELD_YARDS / 2) return 'MIDFIELD';
    return yl < FIELD_YARDS / 2 ? 'OWN ' + yl : 'OPP ' + (FIELD_YARDS - yl);
  };

  // ═══════════════════════════════ SITUATION RULES ═══════════════════════════════

  /**
   * Clutch: Q4 (or later) with the clock at or under Tuning.qb.pressure.clutchClock and the game within
   * clutchMargin points — or an explicit situation.clutch. 0 draws.
   * @param {Object} sit @returns {boolean}
   */
  Play.isClutch = function (sit) {
    if (!sit) return false;
    if (sit.clutch === true) return true;
    var T = P().pressure, score = sit.score || {};
    return num(sit.quarter, 1) >= 4 && num(sit.clock, 900) <= T.clutchClock && Math.abs(num(score.us, 0) - num(score.them, 0)) <= T.clutchMargin;
  };

  /**
   * The pocket time before jitter (s): base + the softened line battle + poise, ÷ the coverage's pressure,
   * × the clutch factor. tanh soft caps: a great line buys at most `up` s, a bad one loses at most `down` s.
   * @param {number} ol @param {number} dl @param {string} coverageId @param {Object} attrs @param {boolean} clutch @returns {number}
   */
  Play.pocketTime = function (ol, dl, coverageId, attrs, clutch) {
    var T = P().pressure, cov = D().coverages[coverageId];
    var d = T.olW * (num(ol, 50) - 50) - T.dlW * (num(dl, 50) - 50);
    d = d > 0 ? T.up * tanh(d / T.up) : -T.down * tanh(-d / T.down);
    var t = T.base + d + T.poiW * (num(attrs && attrs.POI, 50) - 50);
    t /= Math.pow(cov ? num(cov.pressureMul, 1) : 1, T.mulExp);
    if (clutch) t *= 1 - T.clutchMul * (1 - ratio(attrs && attrs.POI));
    return clamp(t, T.min, T.max);
  };

  /** The real coverage for a situation: base weights × situation multipliers × opp.tendency. 1 draw. */
  function pickCoverage(sit, opp, r) {
    var C = P().coverage, order = D().order, items = [];
    var late = sit.quarter >= 4 && sit.clock <= C.lateClock && sit.score.them > sit.score.us;
    var long = sit.down >= 3 && sit.toGo >= C.longToGo;
    var short = sit.toGo <= C.shortToGo;
    var red = sit.yl >= C.redZoneYl;
    for (var i = 0; i < order.length; i++) {
      var id = order[i], w = num(C.base[id], 0);
      if (long) w *= mult(C.long, id);
      if (short) w *= mult(C.short, id);
      if (red) w *= mult(C.redZone, id);
      if (late) w *= mult(C.late, id);
      if (opp.tendency) w *= mult(opp.tendency, id);
      items.push({ id: id, w: w });
    }
    return r.weighted(items, 'w').id;                                                   // draw
  }

  /** A pass play's pool weight in a situation (0 removes it). 0 draws. */
  function playWeight(play, sit) {
    var W = P().read.weights, w = 1, i;
    var tags = play.tags || [];
    function apply(table) { for (i = 0; i < tags.length; i++) w *= mult(table, tags[i]); }
    var toGoal = FIELD_YARDS - sit.yl;
    if (sit.lastPlay && toGoal >= W.lastPlayToGoal) apply(W.lastPlay);
    else if (sit.toGo <= W.shortToGo) apply(W.short);
    else if (sit.toGo >= W.longToGo) apply(W.long);
    if (toGoal <= W.redZoneToGoal) apply(W.redZone);
    return w;
  }

  /** The advice a card SHOWS: the rating vs the real coverage at IQ ≥ iqExact, else vs the shown look. */
  function adviceFor(play, real, shown, iq, sit) {
    if (play.id === 'SNEAK' && sit.toGo <= 1) return 'GOOD';
    var vsId = num(iq, 0) >= P().read.iqExact ? real : shown;
    var a = play.vs && play.vs[vsId];
    return has(ADVICE, a) ? a : 'OK';
  }

  /**
   * Is a play's rating ambiguous under a SHOWN look — does it differ among the coverages that look can be: the shown
   * one and every coverage that disguises as it? 0 draws.
   */
  function ambiguousUnder(play, shown) {
    var covs = D().coverages, first = play.vs && play.vs[shown];
    for (var id in covs) {
      if (!Object.prototype.hasOwnProperty.call(covs, id) || id === shown) continue;
      if (has(covs[id].disguises, shown) && play.vs[id] !== first) return true;
    }
    return false;
  }

  /** A card for the options list (sure: the card's advice can be trusted; pickOptions may clear it on a pass card). */
  function cardFor(play, real, shown, iq, sit) {
    return {
      id: play.id, name: play.name, formation: play.formation,
      routes: play.assignments.map(function (a) { return { slot: a.slot, route: a.route }; }),
      advice: adviceFor(play, real, shown, iq, sit), sure: true, tags: play.tags.slice(), run: !!play.run, line: play.line
    };
  }

  /**
   * The 2–3 play cards: a run card on short yardage (SNEAK at toGo ≤ sneakToGo, DRAW up to drawToGo) next to
   * runCardsMin pass cards; at least one GOOD-vs-real card with probability goodOffered (when that roll fails
   * the GOOD plays are excluded, so the rate is exact). Under iqExact a pass card whose rating is ambiguous under
   * the shown look (ambiguousUnder) is flagged sure: false with probability 1 − IQ/99 — the chip is honest about
   * what it cannot know.
   * Draws: count int 1 · goodOffered roll 1 · weighted pick 1 per pass card · shuffle (pass cards − 1) · clarity roll 1 per pass card.
   */
  function pickOptions(sit, real, shown, iq, r) {
    var T = P().read, all = D().plays, i;
    var n = r.int(T.options.min, T.options.max);                                        // draw
    var runId = sit.toGo <= T.sneakToGo ? 'SNEAK' : (sit.toGo <= T.drawToGo ? 'DRAW' : null);
    var nPass = runId ? Math.max(T.runCardsMin, n - 1) : n;
    var wantGood = r.chance(T.goodOffered);                                             // draw
    var pool = [];
    for (i = 0; i < all.length; i++) if (!all[i].run && playWeight(all[i], sit) > 0) pool.push(all[i]);
    var wf = function (p) { return playWeight(p, sit); };
    var chosen = [], rest;
    if (wantGood) {
      var goods = pool.filter(function (p) { return p.vs[real] === 'GOOD'; });
      if (goods.length) chosen.push(r.weighted(goods, wf));                              // draw
      rest = pool.filter(function (p) { return chosen.indexOf(p) < 0; });
    } else {
      rest = pool.filter(function (p) { return p.vs[real] !== 'GOOD'; });
      if (rest.length < nPass) rest = pool.slice();
    }
    while (chosen.length < nPass && rest.length) {
      var p = r.weighted(rest, wf);                                                     // draw
      chosen.push(p);
      rest.splice(rest.indexOf(p), 1);
    }
    r.shuffle(chosen);                                                                  // cards − 1 draws
    var cards = chosen.map(function (pl) { return cardFor(pl, real, shown, iq, sit); });
    for (i = 0; i < cards.length; i++) {
      var unsure = r.chance(1 - ratio(iq));                                             // 1 draw per pass card (always)
      if (unsure && num(iq, 0) < T.iqExact && ambiguousUnder(chosen[i], shown)) cards[i].sure = false;
    }
    if (runId) {
      for (i = 0; i < all.length; i++) if (all[i].id === runId) cards.push(cardFor(all[i], real, shown, iq, sit));
    }
    return cards;
  }

  /** The five receivers aligned in a formation (x0 in yards from the ball, mirrored by sign). */
  function alignReceivers(roster, formationId, sign) {
    var f = D().formations[formationId] || D().formations.SHOTGUN;
    return roster.map(function (wr) {
      var x0 = num(f[wr.slot], 0) * sign;
      return { slot: wr.slot, name: wr.name, skill: wr.skill, speed: wr.speed, x0: nz(x0), side: x0 < 0 ? -1 : (x0 > 0 ? 1 : sign) };
    });
  }

  // ═══════════════════════════════ CONTEXT ═══════════════════════════════

  /**
   * Build a PlayContext for a situation (the pre-snap read). ONE fork rng.fork('play:ctx') = 1 parent draw.
   *   situation = { down, toGo, yl, quarter, clock (s), score: {us, them}, weather?: {weather, wind: {speed, dir}, tempF},
   *                 venue?: 'HS'|'COLLEGE'|'NFL', qb?: {attrs: {ARM, ACC, IQ, MOB, POI}, archetype, foot}, team?: {ol, wr: [5]},
   *                 opp?: {dl, db, tendency?: {coverageId: weight}}, lastPlay?, twoMinute?, clutch?, stakes?, kind?, idx? }
   * Returns {
   *   situation   the normalised game situation (no qb / team / opp inside)
   *   qb          {attrs, archetype, foot}   team {ol, wr: [{slot, name, skill, speed}]}   opp {dl, db, tendency}
   *   real        the coverage the defence really runs (hidden until the snap — the scene must not show it)
   *   shown       the coverage id whose look the defence SHOWS   disguised  shown !== real
   *   look        { safeties, press, box, showBlitz, name, text, tell } of the shown coverage (text/tell are the shown copy)
   *   options     [{ id, name, formation, routes: [{slot, route}], advice: 'GOOD'|'OK'|'BAD', sure: bool, tags, run, line }]
   *               (sure false: the advice was read off the shown look and this play rates differently against what
   *               that look can hide — the scene dims the chip with a '?')
   *   adviceFrom  'REAL' at IQ ≥ read.iqExact, else 'SHOWN' (what the advice was computed against)
   *   pressure    { sackAt (s, jittered), pocket (s, before the jitter), hot, clutch, meterMul }
   *   receivers   the roster aligned in the default formation (the READ picture); snap re-aligns per play
   *   hash        −1 | 0 | 1 (ball on the left hash / middle / right)   sign  +1 strong right · −1 strong left
   *   revealAt    s after the snap from which the scene may show openness rings   clarity  IQ/99
   *   weather     the situation's weather copy or null   venue   'HS'|'COLLEGE'|'NFL'   clutch  bool
   * }
   * @param {Object} situation @param {RNG} rng @returns {Object} PlayContext
   */
  Play.buildContext = function (situation, rng) {
    if (!rng || typeof rng.fork !== 'function') fail('buildContext', 'an rng is required');
    var T = P(), covs = D().coverages;
    var r = rng.fork('play:ctx');                                                        // 1 parent draw
    var sit = normSituation(situation);
    var qb = normQb(situation && situation.qb);
    var team = normTeam(situation && situation.team);
    var opp = normOpp(situation && situation.opp);
    var clutch = Play.isClutch(sit);
    var iq = qb.attrs.IQ;

    // 1. the real coverage (1 draw)
    var real = pickCoverage(sit, opp, r);
    // 2. the disguise: roll (1) + the alternative (1, always drawn)
    var pDisguise = T.read.disguise * (1 - ratio(iq) * T.read.iqSees);
    var disguised = r.chance(pDisguise);
    var alt = r.pick(covs[real].disguises);
    var shown = disguised && alt && covs[alt] ? alt : real;
    disguised = shown !== real;
    // 3. the cards
    var options = pickOptions(sit, real, shown, iq, r);
    // 4. the pocket (2 draws)
    var pocket = Play.pocketTime(team.ol, opp.dl, real, qb.attrs, clutch);
    var sackAt = clamp(pocket + r.gauss(0, T.pressure.sigma), T.pressure.min, T.pressure.max);
    // 5. the ball and the strong side (1 + 1 draws)
    var hash = r.int(-1, 1);
    var sign = r.chance(0.5) ? 1 : -1;

    var look = covs[shown].look;
    return {
      situation: sit, qb: qb, team: team, opp: opp,
      real: real, shown: shown, disguised: disguised,
      look: { safeties: look.safeties, press: look.press, box: look.box, showBlitz: look.showBlitz, name: covs[shown].name, text: covs[shown].text, tell: covs[shown].tell },
      options: options,
      adviceFrom: iq >= T.read.iqExact ? 'REAL' : 'SHOWN',
      pressure: {
        sackAt: rd(sackAt), pocket: rd(pocket),
        hot: real === 'BLITZ' || sackAt < T.read.hotBelow,
        clutch: clutch,
        meterMul: rd(clutch ? 1 - T.pressure.clutchMul * (1 - ratio(qb.attrs.POI)) : 1)
      },
      receivers: alignReceivers(team.wr, 'SHOTGUN', sign),
      hash: hash, sign: sign,
      revealAt: rd(Math.max(0, T.read.revealBase - ratio(iq) * T.read.revealIq)),
      clarity: rd(ratio(iq)),
      weather: sit.weather, venue: sit.venue, clutch: clutch
    };
  };

  // ═══════════════════════════════ GEOMETRY ═══════════════════════════════

  /** Route-time scale for a receiver speed: waypoint times × this (fast → < 1). */
  function speedScale(speed) {
    var R = P().route;
    return R.speedBase / (R.speedBase + R.speedPer * (num(speed, 50) - 50));
  }

  /**
   * Position {x, y} (yards from the ball: x lateral, y downfield) of a receiver at time t along its path
   * (piecewise linear through the waypoints; extrapolated along the last segment, y capped at the end zone).
   * @param {{path: Array<{t:number, x:number, y:number}>, capY?: number}} rec @param {number} t @returns {{x:number, y:number}}
   */
  Play.pathAt = function (rec, t) {
    var p = rec.path, n = p.length;
    if (!n) return { x: 0, y: 0 };
    if (t <= p[0].t) return { x: p[0].x, y: p[0].y };
    for (var i = 1; i < n; i++) {
      if (t <= p[i].t) {
        var a = p[i - 1], b = p[i], u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
        return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
      }
    }
    var l = p[n - 1], k = n > 1 ? p[n - 2] : l, dt = l.t - k.t;
    if (dt <= 0) return { x: l.x, y: l.y };
    var over = (t - l.t) / dt;
    var cap = num(rec.capY, Infinity);
    return { x: l.x + (l.x - k.x) * over, y: Math.min(cap, l.y + (l.y - k.y) * over) };
  };

  /**
   * Openness 0..1 of a receiver at ARRIVAL time t: linear between the 0.1 s samples over [0, 4]; before 0 the
   * first sample; after 4 s the same envelope continued analytically from rec.env {wo, wc, peak} (a deep ball
   * released late lands after the sampled range and must still find the window closed).
   * @param {{open: number[], env?: {wo:number, wc:number, peak:number}}} rec @param {number} t @returns {number}
   */
  Play.openAt = function (rec, t) {
    var O = P().open, s = rec.open;
    if (!s || !s.length) return 0;
    t = num(t, 0);
    if (t > O.maxT && rec.env) return O.floor + (rec.env.peak - O.floor) * envelope(t, rec.env.wo, rec.env.wc);
    var x = clamp(t, 0, O.maxT) / O.sampleDt;
    var i = Math.floor(x), f = x - i;
    if (i >= s.length - 1) return s[s.length - 1];
    return s[i] + (s[i + 1] - s[i]) * f;
  };

  /**
   * Flight time (s) of a throw over `dist` yards: dist / (velocity × arm × power) × (1 + loftTime × loft).
   * @param {number} dist @param {Object} attrs @param {number} power 0..1.15 @param {number} loft 0..1 @returns {number}
   */
  Play.flightTime = function (dist, attrs, power, loft) {
    var T = P().throw;
    var v = T.velocity * (T.armBase + T.armPer * ratio(attrs && attrs.ARM)) * (T.powerBase + T.powerPer * clamp(num(power, 1), 0, T.powerMax));
    return Math.max(0, dist) / v * (1 + T.loftTime * clamp(num(loft, 0), 0, 1));
  };

  /** The deep range (yd) for an arm. */
  Play.maxDist = function (attrs) {
    var T = P().throw;
    return T.maxDist * (T.rangeBase + T.rangePer * ratio(attrs && attrs.ARM));
  };

  /**
   * Where the ball meets the receiver for a release at t: the receiver keeps running while the ball flies,
   * so the flight is solved by fixed-point iteration until it settles (Play.ARRIVAL: eps 1e-4 s, at most 24
   * rounds; a lofted ball for a weak arm needs a dozen). 0 draws.
   * @param {Object} rec sim receiver @param {Object} attrs @param {number} t release (s) @param {number} power @param {number} loft
   * @returns {{flight:number, arrive:number, pos:{x:number, y:number}, dist:number}}
   */
  Play.arrival = function (rec, attrs, t, power, loft) {
    var drop = P().route.qbDrop, flight = 0, pos, dist = 0;
    for (var i = 0; i < ARRIVAL.maxRounds; i++) {
      pos = Play.pathAt(rec, t + flight);
      dist = Math.sqrt(pos.x * pos.x + (pos.y + drop) * (pos.y + drop));
      var next = Play.flightTime(dist, attrs, power, loft), done = Math.abs(next - flight) < ARRIVAL.eps;
      flight = next;
      if (done) break;
    }
    return { flight: flight, arrive: t + flight, pos: pos, dist: dist };
  };

  /**
   * The openness a ball released at t would find: Play.openAt at the arrival (full power and the route's ideal
   * loft unless given). What the scene's rings show. 0 draws.
   * @param {Object} rec sim receiver @param {Object} attrs @param {number} t release (s) @param {number} [power] @param {number} [loft]
   * @returns {number} 0..1
   */
  Play.openIfThrown = function (rec, attrs, t, power, loft) {
    if (!rec) return 0;
    var route = D().routes[rec.route];
    var a = Play.arrival(rec, attrs, num(t, 0), num(power, 1), num(loft, route ? route.ideal.loft : 0));
    return Play.openAt(rec, a.arrive);
  };

  /** The green band width on the meter for an ACC: base + perAcc × ACC/99. */
  Play.greenBand = function (ACC) {
    var G = P().throw.greenBand;
    return G.base + G.perAcc * ratio(ACC);
  };

  /**
   * The on-time power for a throw of `dist` yards: needBase + dist / (range × arm), clamped so the band
   * [need, need + greenBand] always fits under powerMax − bandTopMargin (the deepest ball still needs a release:
   * a bar parked at the top is outside the band).
   * @param {number} dist @param {Object} attrs @returns {number}
   */
  Play.needFor = function (dist, attrs) {
    var T = P().throw;
    var arm = T.armBase + T.armPer * ratio(attrs && attrs.ARM);
    return clamp(T.needBase + Math.max(0, dist) / (T.range * arm), T.minCommit * 2, T.powerMax - Play.greenBand(attrs && attrs.ACC) - num(T.bandTopMargin, 0));
  };

  /**
   * The green band {need, band, top} of a throw to `slot` released at t (the distance is the arrival at the
   * route's ideal loft and full power). The scene draws [need, top] on the meter. 0 draws.
   * @param {Object} sim @param {string} slot @param {number} t @returns {{need:number, band:number, top:number, dist:number}|null}
   */
  Play.need = function (sim, slot, t) {
    var rec = receiverOf(sim, slot);
    if (!rec) return null;
    var attrs = sim.ctx.qb.attrs, route = D().routes[rec.route];
    var a = Play.arrival(rec, attrs, num(t, 0), 1, route ? route.ideal.loft : 0);
    var need = Play.needFor(a.dist, attrs), band = Play.greenBand(attrs.ACC);
    return { need: rd(need), band: rd(band), top: rd(Math.min(P().throw.powerMax, need + band)), dist: rd(a.dist) };
  };

  /**
   * Is `power` inside the green band [need, need + band]? The engine re-checks the UI's `input.green` claim
   * with its own numbers so a UI bug can never hand out free accuracy.
   * @param {number} power @param {number} need @param {number} band @returns {boolean}
   */
  Play.inGreen = function (power, need, band) {
    var eps = 1e-6;
    return num(power, -1) >= need - eps && power <= Math.min(P().throw.powerMax, need + band) + eps;
  };

  /** The sim's receiver for a slot (null when unknown). */
  function receiverOf(sim, slot) {
    if (!sim || !sim.receivers) return null;
    for (var i = 0; i < sim.receivers.length; i++) if (sim.receivers[i].slot === slot) return sim.receivers[i];
    return null;
  }

  /** The play for an id (or an option / play object). */
  function playFor(playId) {
    var id = playId && typeof playId === 'object' ? playId.id : playId;
    var all = D().plays;
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  /** Attach the convenience closures to a sim (they only delegate to the pure helpers; JSON drops them). */
  function attachHelpers(sim) {
    sim.open = function (slot, t) { var rec = receiverOf(sim, slot); return rec ? Play.openAt(rec, t) : 0; };
    sim.path = function (slot, t) { var rec = receiverOf(sim, slot); return rec ? Play.pathAt(rec, t) : { x: 0, y: 0 }; };
    sim.arrival = function (slot, t, power, loft) {
      var rec = receiverOf(sim, slot);
      if (!rec) return null;
      var route = D().routes[rec.route];
      return Play.arrival(rec, sim.ctx.qb.attrs, num(t, 0), num(power, 1), num(loft, route ? route.ideal.loft : 0));
    };
    sim.openIfThrown = function (slot, t, power, loft) { return Play.openIfThrown(receiverOf(sim, slot), sim.ctx.qb.attrs, t, power, loft); };
    sim.need = function (slot, t) { return Play.need(sim, slot, t); };
    return sim;
  }

  // ═══════════════════════════════ SNAP ═══════════════════════════════

  /** The openness envelope 0..1 at arrival time t for a window [wo, wc]. */
  function envelope(t, wo, wc) {
    var O = P().open;
    if (t < wo - O.rise) return 0;
    if (t < wo) return (t - (wo - O.rise)) / O.rise;
    if (t <= wc) return 1;
    if (t < wc + O.fall) return 1 - (1 - O.lateFrac) * (t - wc) / O.fall;
    return O.lateFrac;
  }

  /**
   * The reported window of a sampled curve: {from, to} the run around the peak where open ≥ windowFrac × peak,
   * peak, and peakAt the CENTRE of the plateau (the run within 2 % of the peak) — the best moment to arrive.
   * `plateauFrom` (s, internal) is where that plateau starts; releaseWindow uses it to respect the arm.
   */
  function windowOf(samples) {
    var O = P().open, n = samples.length, best = 0, i;
    for (i = 1; i < n; i++) if (samples[i] > samples[best]) best = i;
    var thr = O.windowFrac * samples[best], from = best, to = best;
    while (from > 0 && samples[from - 1] >= thr) from--;
    while (to < n - 1 && samples[to + 1] >= thr) to++;
    var top = samples[best] - PLATEAU_EPS, pFrom = best, pTo = best;
    while (pFrom > 0 && samples[pFrom - 1] >= top) pFrom--;
    while (pTo < n - 1 && samples[pTo + 1] >= top) pTo++;
    return { win: { from: rd(from * O.sampleDt), to: rd(to * O.sampleDt), peak: rd(samples[best]), peakAt: rd(Math.round((pFrom + pTo) / 2) * O.sampleDt) }, plateauFrom: pFrom * O.sampleDt };
  }

  /** The last sampled arrival time (s) at which the receiver is still inside the arm's range (Infinity: always is). */
  function lastInRange(rec, attrs) {
    var O = P().open, drop = P().route.qbDrop, maxD = Play.maxDist(attrs), n = Math.round(O.maxT / O.sampleDt);
    for (var k = 0; k <= n; k++) {
      var pos = Play.pathAt(rec, k * O.sampleDt);
      if (Math.sqrt(pos.x * pos.x + (pos.y + drop) * (pos.y + drop)) > maxD) return k === 0 ? -Infinity : (k - 1) * O.sampleDt;
    }
    return Infinity;
  }

  /**
   * The release-time window: the arrival window minus the flight at full power and the route's loft. `peakAt`
   * (the best moment) respects the arm: when the plateau runs past the range it moves back to the last in-range
   * plateau point (one sample short of the edge, so a ball a shade under full power still lands on the plateau),
   * so the engine's own best release is one the arm can hit ({from, to} stay the window's edges).
   */
  function releaseWindow(rec, attrs, win, loft, plateauFrom) {
    function releaseFor(arrive) {                      // t with t + flight(dist at the arrival spot) = arrive
      var pos = Play.pathAt(rec, arrive), drop = P().route.qbDrop;
      var dist = Math.sqrt(pos.x * pos.x + (pos.y + drop) * (pos.y + drop));
      return Math.max(0, arrive - Play.flightTime(dist, attrs, 1, loft));
    }
    var peakAt = win.peakAt, reach = lastInRange(rec, attrs) - P().open.sampleDt;
    if (reach < peakAt && reach >= num(plateauFrom, 0)) peakAt = reach;
    return { from: rd(releaseFor(win.from)), to: rd(releaseFor(win.to)), peakAt: rd(releaseFor(peakAt)) };
  }

  /** The slot with the quickest route (smallest base window.open) among a play's assignments. */
  function quickestSlot(play) {
    var routes = D().routes, best = null, bestT = Infinity;
    for (var i = 0; i < play.assignments.length; i++) {
      var a = play.assignments[i], rt = routes[a.route];
      if (rt && rt[WINDOW].open < bestT) { bestT = rt[WINDOW].open; best = a.slot; }
    }
    return best;
  }

  /** Resolve a run option inside snap (SNEAK 3 draws · DRAW 4 draws). The sim IS the result (run: true). */
  function runPlay(ctx, play, r) {
    var R = P().run, sit = ctx.situation, look = D().coverages[ctx.real].look;
    var ol = ctx.team.ol, dl = ctx.opp.dl, edge = (ol - dl) / P().attrMax;
    var yards, ok, big = false;
    if (play.id === 'SNEAK') {
      var S = R.sneak;
      var p = clamp(S.base - S.perYd * (sit.toGo - 1) + S.lineW * edge + S.boxPer * (look.box - S.boxAnchor), S.min, S.max);
      ok = r.chance(p);                                                                 // draw 1
      var gain = r.int(0, 1), loss = r.int(-1, 0);                                       // draws 2, 3
      yards = ok ? sit.toGo + gain : loss;
    } else {
      var Dr = R.draw;
      var mean = Dr.mean + Dr.lineW * edge + add(Dr.look, ctx.real);
      yards = Math.round(r.gauss(mean, Dr.sd));                                          // draws 1, 2
      big = r.chance(Dr.breakP);                                                         // draw 3
      var extra = r.int(Dr.breakMin, Dr.breakMax);                                       // draw 4
      if (big) yards += extra;
      yards = clamp(yards, Dr.min, Dr.max);
      ok = yards >= sit.toGo;
    }
    yards = clamp(yards, -(sit.yl - 1), FIELD_YARDS - sit.yl);
    var td = sit.yl + yards >= FIELD_YARDS, firstDown = td || yards >= sit.toGo;
    var text = play.id === 'SNEAK' ? (ok ? 'SNEAK ' + signed(yards) : 'STUFFED') : (yards <= 0 ? 'STUFFED' : 'DRAW ' + signed(yards));
    var saw;
    if (play.id === 'SNEAK') saw = ok ? 'Coach saw you get under the pile. A yard is a yard.' : 'Coach saw the pile move the wrong way. They knew it was coming.';
    else saw = big ? 'Coach saw the draw split them. Nobody home.' : (yards <= 0 ? 'Coach saw the draw stuffed. They were not fooled.' : 'Coach saw a draw for a few. Quiet, but it counts.');
    var sim = {
      run: true, playId: play.id, play: { id: play.id, name: play.name, formation: play.formation, tags: play.tags.slice(), line: play.line },
      kind: 'RUN', outcome: 'RUN', target: null, yards: nz(yards), airYards: 0, yac: 0,
      td: td, firstDown: firstDown, turnover: false, fumble: false, big: big,
      flight: 0, arrive: null, need: null, dist: null, landing: { x: 0, y: nz(yards) }, accuracy: null, fit: null, quality: null, t: 0,
      text: text, banner: td ? 'TOUCHDOWN!' : (firstDown && !sit.lastPlay ? 'FIRST DOWN' : text),
      feedback: { timing: 'ON TIME', touch: 'GOOD', coachSaw: saw },
      receivers: [], sackAt: null, revealAt: null, rushers: [], scrambleYards: 0, hot: null, checkdown: null,
      ctx: ctx
    };
    sim[WINDOW] = null;
    return sim;
  }

  /**
   * Snap the ball on a play. ONE fork rng.fork('play:snap') = 1 parent draw.
   * A run option (SNEAK / DRAW) is resolved here: the returned sim has run: true and IS the PlayResult
   * ({ run, outcome: 'RUN', yards, td, firstDown, text, banner, feedback, … } — no throw follows).
   * A pass play returns a PlaySim = {
   *   run: false, playId, play: {id, name, formation, tags, line},
   *   receivers: [{ slot, name, skill, speed, x0, side, route, family,
   *                 path: [{t, x, y}] (field yards from the ball, t scaled by speed, y capped at the end zone), capY,
   *                 open: [41 samples every 0.1 s over the ARRIVAL time 0..4], peak, env: {wo, wc, peak} (the envelope past 4 s),
   *                 window: {from, to, peak, peakAt} (arrival time), release: {from, to, peakAt} (release time at full power),
   *                 hot, checkdown }],
   *   sackAt (s), revealAt (s), clarity, rushers: [{lane: −1|0|1, arriveAt}] (the first arrives at sackAt),
   *   scrambleYards, hot: slot|null (the hot read when the real coverage is BLITZ), checkdown: slot|null,
   *   real, shown, look, ctx, and the closures open(slot, t) · path(slot, t) · arrival(slot, t, power?, loft?)
   *   · openIfThrown(slot, t, power?, loft?) · need(slot, t) (JSON drops them; Play.openAt / pathAt / arrival / need are the pure forms)
   * }
   * @param {Object} ctx PlayContext @param {string|Object} playId @param {RNG} rng @returns {Object} PlaySim
   */
  Play.snap = function (ctx, playId, rng) {
    if (!ctx || !ctx.situation) fail('snap', 'a PlayContext is required');
    if (!rng || typeof rng.fork !== 'function') fail('snap', 'an rng is required');
    var play = playFor(playId);
    if (!play) fail('snap', 'unknown play ' + (playId && playId.id ? playId.id : playId));
    var r = rng.fork('play:snap');                                                       // 1 parent draw
    if (play.run) return runPlay(ctx, play, r);

    var T = P(), O = T.open, routes = D().routes, cov = D().coverages[ctx.real];
    var sit = ctx.situation, attrs = ctx.qb.attrs;
    var aligned = alignReceivers(ctx.team.wr, play.formation, ctx.sign);
    var bySlot = Util.indexBy(play.assignments, 'slot');
    var hotSlot = ctx.real === 'BLITZ' ? quickestSlot(play) : null;
    var capY = FIELD_YARDS - sit.yl + T.route.endZoneCap;
    var nSamples = Math.round(O.maxT / O.sampleDt) + 1;
    var receivers = [], checkdown = null, i, k;

    for (i = 0; i < aligned.length; i++) {
      var wr = aligned[i], a = bySlot[wr.slot], route = a && routes[a.route];
      if (!route) fail('snap', play.id + ' has no route for ' + wr.slot);
      var scale = speedScale(wr.speed);
      var path = route.path.map(function (p) { return { t: rd(p.t * scale), x: nz(rd(wr.x0 + wr.side * p.x)), y: nz(rd(Math.min(capY, p.y))) }; });
      var noise = r.gauss(0, O.noiseSd);                                                 // draws 1, 2 per receiver
      var shift = r.gauss(0, O.shiftSd);                                                 // draws 3, 4 per receiver
      var hot = wr.slot === hotSlot;
      var isCheckdown = wr.slot === 'RB' && route.family === 'SHORT';
      var edge = (wr.skill - ctx.opp.db) / T.attrMax * O.skillW * (ctx.real === 'MAN' ? O.manMul : 1);
      var peak = O.base - O.tightW * num(cov.tightness[route.family], 0.5) + edge + add(O.vs, play.vs[ctx.real]) + noise + (hot ? O.hotBonus : 0);
      if (isCheckdown) peak = Math.max(peak, O.checkdownFloor);
      peak = clamp(peak, O.min, O.max);
      var wo = route[WINDOW].open * scale + shift - (hot ? O.hotEarlier : 0), wc = route[WINDOW].close * scale + shift;
      var samples = new Array(nSamples);
      for (k = 0; k < nSamples; k++) samples[k] = rd(O.floor + (peak - O.floor) * envelope(k * O.sampleDt, wo, wc));
      var rec = {
        slot: wr.slot, name: wr.name, skill: wr.skill, speed: wr.speed, x0: wr.x0, side: wr.side,
        route: route.id, family: route.family, path: path, capY: capY,
        open: samples, peak: rd(peak), env: { wo: rd(wo), wc: rd(wc), peak: rd(peak) }, release: null, hot: hot, checkdown: isCheckdown
      };
      var w = windowOf(samples);
      rec[WINDOW] = w.win;
      rec.release = releaseWindow(rec, attrs, rec[WINDOW], route.ideal.loft, w.plateauFrom);
      receivers.push(rec);
      if (isCheckdown) checkdown = wr.slot;
    }
    if (!checkdown) {                                    // no back on a short route: the earliest short route stands in
      var earliest = Infinity;
      for (i = 0; i < receivers.length; i++) if (receivers[i].family === 'SHORT' && receivers[i][WINDOW].from < earliest) { earliest = receivers[i][WINDOW].from; checkdown = receivers[i].slot; }
    }

    var PR = T.pressure;
    var sackAt = clamp(ctx.pressure.sackAt + r.gauss(0, PR.snapSigma), PR.min, PR.max);   // draws 21, 22
    var lanes = r.shuffle([-1, 0, 1]);                                                   // draws 23, 24
    var gap1 = r.float(PR.rushers.laneGapMin, PR.rushers.laneGapMax);                    // draw 25
    var gap2 = r.float(PR.rushers.laneGapMin, PR.rushers.laneGapMax);                    // draw 26
    var nRush = ctx.real === 'BLITZ' ? PR.rushers.blitz : PR.rushers.base;
    var rushers = [{ lane: lanes[0], arriveAt: rd(sackAt) }, { lane: lanes[1], arriveAt: rd(sackAt + gap1) }, { lane: lanes[2], arriveAt: rd(sackAt + gap1 + gap2) }].slice(0, nRush);
    var SC = T.throw.scramble, look = cov.look;
    var scramble = SC.base + SC.perMob * attrs.MOB + add(SC.look, ctx.real) + SC.boxPer * (look.box - SC.boxAnchor) + r.gauss(0, SC.sd);   // draws 27, 28
    scramble = clamp(scramble, SC.min, SC.max);

    var sim = {
      run: false, playId: play.id, play: { id: play.id, name: play.name, formation: play.formation, tags: play.tags.slice(), line: play.line },
      receivers: receivers,
      sackAt: rd(sackAt), revealAt: ctx.revealAt, clarity: ctx.clarity,
      rushers: rushers, scrambleYards: rd(scramble),
      hot: hotSlot, checkdown: checkdown,
      real: ctx.real, shown: ctx.shown, look: ctx.look,
      ctx: ctx
    };
    return attachHelpers(sim);
  };

  // ═══════════════════════════════ THROW ═══════════════════════════════

  /** Normalise a PlayInput. */
  function normInput(input, sim) {
    var T = P().throw;
    input = input || {};
    var kind = has(KINDS, input.kind) ? input.kind : 'THROW';
    var target = typeof input.target === 'string' && receiverOf(sim, input.target) ? input.target : null;
    return {
      target: target, kind: kind,
      t: clamp(input.t === Infinity ? T_MAX : num(input.t, 0), 0, T_MAX),   // Infinity / 1e308 stay a (finite) sack; a string is 0
      lead: clamp(num(input.lead, 0), -1, 1),
      loft: clamp(num(input.loft, 0), 0, 1),
      power: clamp(num(input.power, 1), 0, T.powerMax),
      quality: clamp(num(input.quality, 0.5), 0, 1),
      green: !!input.green
    };
  }

  /** The accuracy penalty under the rush: full pressPen at the sack, tapering to 0 pressWindow before it; poise relieves it. */
  function pressurePenalty(t, sackAt, POI) {
    var T = P().throw;
    var closeness = clamp(1 - (sackAt - t) / T.pressWindow, 0, 1);
    return T.pressPen * closeness * (1 - ratio(POI) * T.poiRelief);
  }

  /** The weather penalty: wind above the free mph (more on a floated ball), the weather kind, a frozen ball. */
  function weatherPenalty(wx, loft) {
    if (!wx) return 0;
    var W = P().weather, kind = wx.weather || 'clear';
    if (kind === 'dome') return 0;
    var wind = Math.max(0, num(wx.wind && wx.wind.speed, 0) - W.windFree) * W.windPerMph * (W.windLoftBase + W.windLoftPer * loft);
    var cold = Math.max(0, W.coldBelowF - num(wx.tempF, 70)) * W.coldPer;
    return wind + num(W.byWeather[kind], 0) + cold;
  }

  /** The base fields every PlayResult shares. */
  function baseResult(sim, inp, outcome) {
    var res = {
      run: false, playId: sim.playId, play: sim.play, kind: inp.kind, outcome: outcome, target: inp.target,
      yards: 0, airYards: 0, yac: 0, td: false, firstDown: false, turnover: false, fumble: false,
      flight: 0, arrive: null, need: null, dist: null, landing: { x: 0, y: 0 }, accuracy: null, fit: null, quality: rd(inp.quality),
      t: rd(inp.t), lead: rd(inp.lead), loft: rd(inp.loft), power: rd(inp.power), green: false,
      pComplete: null, pInt: null, text: '', banner: '', feedback: null, sackAt: sim.sackAt
    };
    res[WINDOW] = null;
    return res;
  }

  /**
   * Clamp a gain to the field and set td / firstDown / text / banner. On the last play a first down that does not
   * score loses the game, so the banner is the text ('CATCH +12'), never 'FIRST DOWN' (the flag stays for the line).
   */
  function settle(res, sit, verb) {
    res.yards = nz(clamp(res.yards, -(sit.yl - 1), FIELD_YARDS - sit.yl));
    res.td = res.yards > 0 && sit.yl + res.yards >= FIELD_YARDS;
    res.firstDown = res.td || res.yards >= sit.toGo;
    res.landing.y = rd(res.landing.y);
    res.landing.x = rd(res.landing.x);
    if (verb) res.text = verb + ' ' + signed(res.yards);
    res.banner = res.td ? 'TOUCHDOWN!' : (res.firstDown && !sit.lastPlay ? 'FIRST DOWN' : res.text);
    return res;
  }

  /** SACK: yards gauss (2 draws). */
  function sackResult(sim, inp, r) {
    var S = P().throw.sackYards, sit = sim.ctx.situation;
    var res = baseResult(sim, inp, 'SACK');
    res.yards = clamp(Math.round(r.gauss(S.mean, S.sd)), S.min, S.max);                  // draws 1, 2
    res.landing = { x: 0, y: res.yards };
    settle(res, sit, 'SACKED');
    res.td = false; res.firstDown = false; res.banner = res.text;
    res.feedback = {
      timing: 'TOO LATE', touch: 'GOOD',
      coachSaw: sim.hot ? 'Coach saw the blitz you did not — that ball has to be out hot.' : 'Coach saw the pocket fold. Get it out, or get out.'
    };
    return res;
  }

  /** THROWAWAY: 0 draws, never a turnover. */
  function throwawayResult(sim, inp) {
    var res = baseResult(sim, inp, 'THROWAWAY');
    res.landing = { x: 30 * (sim.ctx.sign || 1), y: 5 };
    res.text = 'THROWN AWAY'; res.banner = res.text;
    res.feedback = { timing: inp.t < sim.sackAt - P().throw.pressWindow ? 'ON TIME' : 'LATE', touch: 'GOOD', coachSaw: 'Coach saw you throw it away. Nothing wrong with living to play another down.' };
    return res;
  }

  /**
   * SCRAMBLE: yards gauss 2 · fumble roll 1. The yards are sim.scrambleYards (+ gauss) × how much of the pocket
   * was used, clamp(t / useT, useMin, 1): a tuck at the snap is worth useMin of it — the lanes open once the rush
   * has committed. The fumble roll never goes under fumbleMin.
   */
  function scrambleResult(sim, inp, r) {
    var SC = P().throw.scramble, sit = sim.ctx.situation, attrs = sim.ctx.qb.attrs;
    var res = baseResult(sim, inp, 'SCRAMBLE');
    var use = clamp(inp.t / num(SC.useT, 1), num(SC.useMin, 1), 1);
    res.yards = clamp(Math.round((sim.scrambleYards + r.gauss(0, SC.sd2)) * use), SC.min, SC.max);   // draws 1, 2
    res.fumble = r.chance(Math.max(num(SC.fumbleMin, 0), SC.fumble * Math.max(0, 1 - attrs.MOB / SC.fumbleMobFree)));   // draw 3
    res.landing = { x: 5 * (sim.ctx.sign || 1), y: res.yards };
    settle(res, sit, 'SCRAMBLE');
    if (res.fumble) {
      res.turnover = true; res.td = false; res.firstDown = false; res.text = 'FUMBLE'; res.banner = 'FUMBLE';
    }
    res.feedback = {
      timing: 'ON TIME', touch: 'GOOD',
      coachSaw: res.fumble ? 'Coach saw the ball on the ground. Two hands on it.'
        : (res.firstDown ? 'Coach saw you take off and take the sticks with you.' : 'Coach saw you tuck it. A few yards beats a sack.')
    };
    return res;
  }

  /** The touch label from the lead / loft errors (the larger relative error names it). */
  function touchLabel(rec, route, dLead, dLoft) {
    var F = P().feedback;
    var offLead = Math.abs(dLead) / F.leadOff, offLoft = Math.abs(dLoft) / F.loftOff;
    if (offLead < 1 && offLoft < 1) return 'GOOD';
    if (offLoft >= offLead) return dLoft < 0 ? 'BULLET' : 'FLOATED';
    if (CROSSING[route.id]) return dLead > 0 ? 'LED' : 'BEHIND';
    return dLead > 0 ? 'OVERTHROWN' : 'UNDERTHROWN';
  }

  /** The timing label from the arrival vs the receiver's window. */
  function timingLabel(arrive, win) {
    var F = P().feedback;
    if (arrive < win.from - F.early) return 'EARLY';
    if (arrive <= win.to + F.late) return 'ON TIME';
    if (arrive <= win.to + F.tooLate) return 'LATE';
    return 'TOO LATE';
  }

  /** 'COVER 2' for a coverage id (the id itself when unknown). */
  function coverageName(id) { var c = D().coverages[id]; return c && c.name ? c.name : String(id); }

  /** One sentence: what the coach saw on a pass. */
  function coachSawPass(res, rec, sim, parts) {
    var name = rec.name;
    switch (res.outcome) {
      case 'CATCH':
        if (res.td) return sim.ctx.clutch ? 'Coach saw the end zone with the game on the line. So did everybody else.' : 'Coach saw the end zone. So did everybody else.';
        if (res.firstDown) return res.yac >= 8 ? 'Coach saw the catch and the run after it. ' + name + ' did the rest.' : 'Coach saw you move the sticks. Clean.';
        return res.feedback.timing === 'ON TIME' ? 'Coach saw a completion. Not enough of one.' : 'Coach saw a catch, late and short. Take what they give sooner.';
      case 'DROP': return 'Coach saw a good ball hit the turf. That one is on ' + name + '.';
      case 'INT':
        if (res.feedback.timing === 'LATE' || res.feedback.timing === 'TOO LATE') return 'Coach saw you throw late into a closed window. The safety was waiting.';
        if (sim.shown && sim.real && sim.shown !== sim.real) return 'Coach saw them show ' + coverageName(sim.shown) + ' and play ' + coverageName(sim.real) + '. The look lied and you bought it.';
        if (parts.press >= 0.05) return 'Coach saw the rush in your face and the ball come out anyway. Eat it next time.';
        return 'Coach saw you force it into coverage. That is not a window, that is a wish.';
      default: break;
    }
    // INCOMPLETE: name the dominant cause
    var f = res.feedback;
    if (parts.beyond > 0) return 'Coach saw you throw it further than your arm goes. Know your range.';
    if (f.timing === 'EARLY') return 'Coach saw you throw before the break. Let ' + name + ' get there.';
    if (f.timing === 'TOO LATE') return 'Coach saw you hold it a beat too long. The window had closed.';
    if (parts.press >= 0.05) return 'Coach saw the rush in your face — you threw off your back foot.';
    if (parts.wx >= 0.03) return 'Coach saw the weather take it. Drive it lower next time.';
    if (f.touch === 'FLOATED') return 'Coach saw it hang up there. Put something on it.';
    if (f.touch === 'BULLET') return 'Coach saw you fire one nobody could handle. Take a little off it.';
    if (f.touch === 'OVERTHROWN' || f.touch === 'LED') return 'Coach saw it sail past ' + name + '. Too much lead.';
    if (f.touch === 'UNDERTHROWN' || f.touch === 'BEHIND') return 'Coach saw it die behind ' + name + '. Lead him.';
    if (f.timing === 'LATE') return 'Coach saw you a beat late. It was there and then it was not.';
    if (res[WINDOW] < P().throw.intWindow) return 'Coach saw you throw into coverage and get away with it. Do not count on that.';
    if (res.quality < 0.5) return 'Coach saw a sloppy release. Hit the green.';
    return 'Coach saw a miss. Nothing mechanical, just a miss.';
  }

  /** THROW: 9 draws in a fixed order. */
  function passResult(sim, inp, r) {
    var T = P().throw, O = P().open, sit = sim.ctx.situation, attrs = sim.ctx.qb.attrs;
    var rec = receiverOf(sim, inp.target), route = D().routes[rec.route];
    var res = baseResult(sim, inp, 'INCOMPLETE');

    // the ball meets the receiver
    var a = Play.arrival(rec, attrs, inp.t, inp.power, inp.loft);
    var need = Play.needFor(Play.arrival(rec, attrs, inp.t, 1, route.ideal.loft).dist, attrs);
    var band = Play.greenBand(attrs.ACC);
    var green = inp.green && Play.inGreen(inp.power, need, band);
    var quality = green ? Math.max(inp.quality, T.greenQuality) : inp.quality;
    // the input's fit to the route
    var dLead = inp.lead - route.ideal.lead, dLoft = inp.loft - route.ideal.loft;
    var hot = Math.max(0, inp.power - (need + band)) * T.hotBallPen;
    var fit = clamp(1 - Math.abs(dLead) * T.leadW - Math.abs(dLoft) * T.loftW - hot, 0, 1);
    // penalties
    var press = pressurePenalty(inp.t, sim.sackAt, attrs.POI);
    var wx = weatherPenalty(sim.ctx.weather, inp.loft);
    var beyond = Math.max(0, a.dist - Play.maxDist(attrs)) * T.beyondRangePen;
    var accuracy = clamp(ratio(attrs.ACC) * T.accW + quality * T.qualW + fit * T.fitW - press - wx - beyond, 0, 1);
    var openness = Play.openAt(rec, a.arrive);
    var pComplete = sigmoid(T.k * (accuracy * T.accMul + openness * T.windowMul - T.bias));
    var pInt = openness < T.intWindow && accuracy < T.intAcc ? T.intBase * (1 - openness) : 0;
    var pDrop = T.drop * (1 - ratio(rec.skill));

    var caught = r.chance(pComplete);                                                    // draw 1
    var picked = r.chance(pInt);                                                         // draw 2
    var dropped = r.chance(pDrop);                                                       // draw 3
    var Y = T.yac;
    var yacRaw = num(Y.base[route.family], 3) * (Y.speedBase + Y.speedPer * ratio(rec.speed)) * (Y.windowBase + Y.windowPer * openness)
      + (route.id === 'SCREEN' ? Y.screenBonus : 0) + r.gauss(0, Y.sd);                  // draws 4, 5
    var sd = T.scatter.sd * (1 - accuracy) + T.scatter.min;
    var sx = r.gauss(0, sd), sy = r.gauss(0, sd);                                        // draws 6..9

    res.outcome = caught ? (dropped ? 'DROP' : 'CATCH') : (picked ? 'INT' : 'INCOMPLETE');
    res.airYards = Math.round(a.pos.y);
    res.flight = rd(a.flight);
    res.arrive = rd(a.arrive);
    res.accuracy = rd(accuracy); res[WINDOW] = rd(openness); res.fit = rd(fit); res.quality = rd(quality); res.green = green;
    res.need = rd(need); res.dist = rd(a.dist);
    res.pComplete = rd(pComplete); res.pInt = rd(pInt);
    res.feedback = { timing: timingLabel(a.arrive, rec[WINDOW]), touch: touchLabel(rec, route, dLead, dLoft), coachSaw: '' };
    if (res.outcome === 'CATCH') {
      var yac = Math.max(Y.min, Math.round(yacRaw));
      res.yards = res.airYards + yac;
      res.landing = { x: a.pos.x, y: a.pos.y };
      settle(res, sit, 'CATCH');
      // a clamp comes off the run, never invents one: the goal line shortens the yac, the own goal line (a catch
      // behind the line clamped up to 0) leaves yac 0 and puts the air yards at the spot
      res.yac = clamp(res.yards - res.airYards, 0, yac);
      res.airYards = res.yards - res.yac;
    } else {
      res.landing = { x: rd(a.pos.x + sx), y: rd(a.pos.y + sy + dLead * T.scatter.leadYd) };
      res.turnover = res.outcome === 'INT';
      res.text = res.outcome === 'INT' ? 'INTERCEPTED' : (res.outcome === 'DROP' ? 'DROPPED' : 'INCOMPLETE');
      res.banner = res.text;
    }
    res.feedback.coachSaw = coachSawPass(res, rec, sim, { press: press, wx: wx, beyond: beyond });
    return res;
  }

  /**
   * Resolve the throw (or the tuck, the throwaway, the sack). ONE fork rng.fork('play:throw') = 1 parent draw.
   *   input = { target: slot, t: release (s from the snap), lead: -1..1, loft: 0..1, power: 0..1.15, quality: 0..1,
   *             green?: bool (the UI's band claim; re-checked with Play.inGreen), kind?: 'THROW'|'THROWAWAY'|'SCRAMBLE'|'SACK' }
   * Rules: t ≥ sim.sackAt → SACK whatever the input (a SCRAMBLE may escape on a MOB roll) · THROWAWAY (or THROW
   * without a target) → 0 yards, never a turnover · SCRAMBLE → sim.scrambleYards + gauss, may fumble at low MOB ·
   * THROW → see passResult: flight from the distance and the arm, fit from lead/loft vs the route's ideal, accuracy
   * from ACC / quality / fit minus pressure and weather, the window from the openness at the arrival, completion
   * by a logistic on accuracy and window, an interception only into a closed window with an imperfect ball.
   * Returns PlayResult = {
   *   run: false, playId, play, kind, outcome: 'CATCH'|'INCOMPLETE'|'INT'|'SACK'|'THROWAWAY'|'SCRAMBLE'|'DROP', target,
   *   yards, airYards, yac, td, firstDown, turnover, fumble, flight (s), arrive (s), landing: {x, y} (yards for the scene),
   *   accuracy, window, fit, quality, green, need, dist, pComplete, pInt, t, lead, loft, power, sackAt,
   *   text ('CATCH +14' · 'INCOMPLETE' · 'INTERCEPTED' · 'SACKED -7' · 'DROPPED' · 'THROWN AWAY' · 'SCRAMBLE +6' · 'FUMBLE'),
   *   banner ('TOUCHDOWN!' · 'FIRST DOWN' (never on a last play: a first down that does not score loses) · else text),
   *   feedback: { timing: 'EARLY'|'ON TIME'|'LATE'|'TOO LATE', touch: 'BULLET'|'GOOD'|'FLOATED'|'OVERTHROWN'|'UNDERTHROWN'|'BEHIND'|'LED', coachSaw }
   * }
   * A run sim is returned as it is (it already is the result).
   * @param {Object} sim PlaySim @param {Object} input @param {RNG} rng @returns {Object} PlayResult
   */
  Play.throw = function (sim, input, rng) {
    if (!sim || !sim.ctx) fail('throw', 'a PlaySim is required');
    if (!rng || typeof rng.fork !== 'function') fail('throw', 'an rng is required');
    var r = rng.fork('play:throw');                                                      // 1 parent draw
    if (sim.run) return sim;
    var inp = normInput(input, sim);
    if (inp.kind === 'SACK' || (inp.t >= sim.sackAt && inp.kind !== 'SCRAMBLE')) return sackResult(sim, inp, r);
    if (inp.kind === 'SCRAMBLE') {
      if (inp.t >= sim.sackAt) {
        var SC = P().throw.scramble, mob = ratio(sim.ctx.qb.attrs.MOB);
        var pEscape = clamp(SC.escape * mob - SC.escapeMob * (1 - mob), 0, 1);
        if (!r.chance(pEscape)) return sackResult(sim, inp, r);                          // escape roll, then the sack draws
      }
      return scrambleResult(sim, inp, r);
    }
    if (inp.kind === 'THROWAWAY' || !inp.target || inp.power < P().throw.minCommit) return throwawayResult(sim, inp);
    return passResult(sim, inp, r);
  };

  /**
   * Debug: a consistent PlayResult for a requested outcome without consuming rng (the shell's RTG.debug.forceResult).
   * kind: 'CATCH'|'FIRST_DOWN'|'TD'|'INCOMPLETE'|'INT'|'SACK'|'DROP'|'THROWAWAY'|'SCRAMBLE'|'FUMBLE'. 0 draws.
   * @param {Object} sim @param {string} kind @param {Object} [input] @returns {Object} PlayResult
   */
  Play.forcedResult = function (sim, kind, input) {
    if (!sim || !sim.ctx) fail('forcedResult', 'a PlaySim is required');
    if (sim.run) return sim;
    var sit = sim.ctx.situation, T = P().throw;
    var target = (input && input.target && receiverOf(sim, input.target)) ? input.target : (sim.receivers[0] ? sim.receivers[0].slot : null);
    var rec = receiverOf(sim, target);
    var inp = normInput(Object.assign({ target: target, t: rec ? rec.release.peakAt : 1, quality: 1, power: 1 }, input || {}), sim);
    var res = baseResult(sim, inp, 'INCOMPLETE');
    res.forced = true;
    var pos = rec ? Play.pathAt(rec, inp.t + 1) : { x: 0, y: 5 };
    res.landing = { x: pos.x, y: pos.y };
    res.airYards = Math.round(pos.y); res.flight = 1; res.arrive = rd(inp.t + 1);
    res.feedback = { timing: 'ON TIME', touch: 'GOOD', coachSaw: 'Coach saw the debug menu.' };
    switch (kind) {
      case 'CATCH': res.outcome = 'CATCH'; res.yards = Math.max(0, Math.min(res.airYards + 2, sit.toGo - 1)); settle(res, sit, 'CATCH'); break;   // never a first down (0 at toGo 1)
      case 'FIRST_DOWN': res.outcome = 'CATCH'; res.yards = Math.max(sit.toGo, Math.min(sit.toGo + 3, FIELD_YARDS - sit.yl)); settle(res, sit, 'CATCH'); break;   // always the sticks (a TD when they are the goal line)
      case 'TD': res.outcome = 'CATCH'; res.yards = FIELD_YARDS - sit.yl; settle(res, sit, 'CATCH'); break;
      case 'INT': res.outcome = 'INT'; res.turnover = true; res.text = 'INTERCEPTED'; res.banner = res.text; res[WINDOW] = 0.1; res.accuracy = 0.5; break;
      case 'SACK': res.outcome = 'SACK'; res.kind = 'SACK'; res.yards = T.sackYards.mean; res.landing = { x: 0, y: res.yards }; res.text = 'SACKED ' + signed(res.yards); res.banner = res.text; res.feedback.timing = 'TOO LATE'; break;
      case 'DROP': res.outcome = 'DROP'; res.text = 'DROPPED'; res.banner = res.text; break;
      case 'THROWAWAY': res.outcome = 'THROWAWAY'; res.kind = 'THROWAWAY'; res.text = 'THROWN AWAY'; res.banner = res.text; break;
      case 'SCRAMBLE': res.outcome = 'SCRAMBLE'; res.kind = 'SCRAMBLE'; res.yards = Math.round(sim.scrambleYards); settle(res, sit, 'SCRAMBLE'); break;
      case 'FUMBLE': res.outcome = 'SCRAMBLE'; res.kind = 'SCRAMBLE'; res.yards = 2; res.fumble = true; res.turnover = true; res.text = 'FUMBLE'; res.banner = 'FUMBLE'; break;
      default: res.outcome = 'INCOMPLETE'; res.text = 'INCOMPLETE'; res.banner = res.text; break;
    }
    if (res.yac === 0 && res.outcome === 'CATCH') res.airYards = res.yards;
    return res;
  };

  // ═══════════════════════════════ THE DRIVE SCRIPT ═══════════════════════════════

  /** Stakes copy for a situation. */
  function stakesFor(s) {
    var d = Play.downText(s), clock = Util.fmtClock(s.clock), deficit = s.score.them - s.score.us;
    switch (s.kind) {
      case 'THIRD_MEDIUM': return d + ' — keep the drive alive';
      case 'THIRD_LONG': return d + ' — a long way to the sticks';
      case 'RED_ZONE': return d + ' at the ' + (FIELD_YARDS - s.yl) + ' — points here';
      case 'SHORT_YARDAGE': return s.down === 4 ? d + ' — go or go home' : d + ' — a yard is a yard';
      case 'TWO_MINUTE': return clock + ' left, down ' + deficit + ' — the drill';
      case 'LAST_PLAY': return clock + ' left at the ' + (FIELD_YARDS - s.yl) + ' — one shot at the end zone';
      default: return d;
    }
  }

  /**
   * The demo's drive script: six situations in order — a 3rd-and-medium (Q1), a 3rd-and-long (Q2), a red-zone
   * snap (Q3), a short-yardage snap (Q4, SNEAK offered), a two-minute-drill snap (Q4, clock under 1:00) and a
   * last-play game-winner from the 30–45 (Q4, down by 4–5: a TD wins, a FG does not). ONE fork
   * rng.fork('play:drive') = 1 parent draw; the child draws 25 times in this order (ints, except the opening
   * score which is a pick from drive.openingLead — a real score: 0, 3 or 7):
   *   1: toGo yl clock lead · 2: toGo yl clock deficit · 3: down toGo yl clock deficit · 4: down toGo yl clock deficit
   *   · 5: down yl clock deficit · 6: fromGoal clock deficit.
   * Each situation: { idx, kind, down, toGo, yl, quarter, clock, score: {us, them}, stakes, venue, lastPlay, twoMinute }.
   * The shell adds qb / team / opp before Play.buildContext and advances yl on a first down.
   * @param {{venue?: 'HS'|'COLLEGE'|'NFL'}} [opts] @param {RNG} rng @returns {Object[]}
   */
  Play.driveScript = function (opts, rng) {
    if (!rng || typeof rng.fork !== 'function') fail('driveScript', 'an rng is required');
    opts = opts || {};
    var Dv = P().drive, r = rng.fork('play:drive');                                      // 1 parent draw
    var venue = opts.venue === 'HS' || opts.venue === 'NFL' ? opts.venue : 'COLLEGE';
    function between(range) { return r.int(range[0], range[1]); }
    var out = [], s;
    // 1. third and medium, Q1
    s = { idx: 0, kind: 'THIRD_MEDIUM', down: 3, quarter: 1, lastPlay: false, twoMinute: false };
    s.toGo = between(Dv.thirdMedium.toGo); s.yl = between(Dv.thirdMedium.yl); s.clock = between(Dv.thirdMedium.clock);
    s.score = { us: 0, them: r.pick(Dv.openingLead) };                                 // 1 draw: a real score, not any integer
    out.push(s);
    // 2. third and long, Q2
    s = { idx: 1, kind: 'THIRD_LONG', down: 3, quarter: 2, lastPlay: false, twoMinute: false };
    s.toGo = between(Dv.thirdLong.toGo); s.yl = between(Dv.thirdLong.yl); s.clock = between(Dv.thirdLong.clock);
    s.score = { us: 7, them: 7 + r.int(3, 7) };
    out.push(s);
    // 3. the red zone, Q3
    s = { idx: 2, kind: 'RED_ZONE', quarter: 3, lastPlay: false, twoMinute: false };
    s.down = between(Dv.redZone.down); s.toGo = between(Dv.redZone.toGo); s.yl = between(Dv.redZone.yl); s.clock = between(Dv.redZone.clock);
    s.score = { us: 10, them: 10 + r.int(3, 7) };
    out.push(s);
    // 4. short yardage, Q4 (SNEAK offered)
    s = { idx: 3, kind: 'SHORT_YARDAGE', quarter: 4, lastPlay: false, twoMinute: false };
    s.down = between(Dv.shortYardage.down); s.toGo = between(Dv.shortYardage.toGo); s.yl = between(Dv.shortYardage.yl); s.clock = between(Dv.shortYardage.clock);
    s.score = { us: 17, them: 17 + r.int(1, 6) };
    out.push(s);
    // 5. the two-minute drill, Q4 under 1:00
    s = { idx: 4, kind: 'TWO_MINUTE', quarter: 4, toGo: Dv.twoMinute.toGo, lastPlay: false, twoMinute: true };
    s.down = between(Dv.twoMinute.down); s.yl = between(Dv.twoMinute.yl); s.clock = between(Dv.twoMinute.clock);
    s.score = { us: 20, them: 20 + between(Dv.twoMinute.deficit) };
    out.push(s);
    // 6. the last play: a TD wins, a FG does not
    s = { idx: 5, kind: 'LAST_PLAY', quarter: 4, down: 1, toGo: 10, lastPlay: true, twoMinute: true };
    s.yl = FIELD_YARDS - between(Dv.lastPlay.fromGoal); s.clock = between(Dv.lastPlay.clock);
    s.score = { us: 20, them: 20 + between(Dv.lastPlay.deficit) };
    out.push(s);
    for (var i = 0; i < out.length; i++) {
      out[i].venue = venue;
      out[i].toGo = Math.min(out[i].toGo, FIELD_YARDS - out[i].yl);
      out[i].stakes = stakesFor(out[i]);
    }
    return out;
  };

  // ═══════════════════════════════ PASSER RATING ═══════════════════════════════

  /**
   * NFL passer rating from a line {att, cmp, yds, td, int}: each of the four components clamped to 0..2.375,
   * summed, ÷ 6, × 100, one decimal. 0 attempts → 0. Pure.
   *   perfect 158.3 · 20/30 190 yd 2 TD 1 INT → 92.4 · 20/30 250 2 1 → 100.7 · Brady 2007 (398/578 4806 50 8) → 117.2
   * @param {{att:number, cmp:number, yds:number, td:number, int:number}} line @returns {number}
   */
  Play.rating = function (line) {
    line = line || {};
    var att = num(line.att, 0);
    if (att <= 0) return 0;
    var cmp = num(line.cmp, 0), yds = num(line.yds, 0), td = num(line.td, 0), ints = num(line.int, 0);
    var a = clamp((cmp / att - RATING.cmpSub) * RATING.cmpMul, 0, RATING.cap);
    var b = clamp((yds / att - RATING.ydsSub) * RATING.ydsMul, 0, RATING.cap);
    var c = clamp(td / att * RATING.tdMul, 0, RATING.cap);
    var d = clamp(RATING.cap - ints / att * RATING.intMul, 0, RATING.cap);
    return Util.round1((a + b + c + d) / RATING.div * RATING.scale);
  };

  RTG.Play = Play;
})(typeof window !== 'undefined' ? window : globalThis);
