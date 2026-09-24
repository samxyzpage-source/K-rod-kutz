/**
 * Road to Glory: QB — RTG.Play (the play engine: the pre-snap read, the snap, the live play, the demo's drive script)
 *
 * DOM-free and pure over plain JSON: every random number comes from the rng passed in (int / float / chance /
 * gauss / pick / weighted / shuffle / fork). The parent rng only ever sees FORKS — one draw per call — and every
 * child draw is in a fixed order (or, inside a Live, in event order), so a moment replays exactly from
 * {situation, playId, plan, rngState}.
 *
 * v2 — "DRAW THE PASS": the throw is a line the player draws and the ball flies along it. The play after the snap is a
 * deterministic field simulation (engine/field.js, RTG.Field): 22 players and the ball in field yards, stepped at a
 * fixed dt; the scene draws what the Live says. Play.throw and the velocity meter (need / needFor / greenBand /
 * inGreen / the openness curves) are gone.
 *
 * RNG draw accounting (binding):
 *   buildContext : 1 parent draw — rng.fork('play:ctx'). Child, in order:
 *                  coverage weighted 1 · disguise roll 1 · disguise pick 1 (always drawn, used only on a disguise)
 *                  · card count int 1 · goodOffered roll 1 · pass-card picks weighted 1 each (2–3) · pass-card shuffle (pass cards − 1)
 *                  · card clarity roll 1 per pass card (always drawn; it only matters under iqExact on an ambiguous card)
 *                  = 8 + 3 × pass cards (a run card on short yardage draws nothing)
 *                  · sackAt gauss 2 · hash int 1 · strong-side roll 1. The alignment (ctx.alignment) draws nothing.
 *   snap         : 1 parent draw — rng.fork('play:snap'). Child, in order:
 *                  pass play → RTG.Field.setup: per receiver a route-clock gauss 2 (10) · per defender a skill gauss 2 +
 *                  a reaction gauss 2 (44) · the sack clock's jitter gauss 2 · the first rusher weighted 1 · six beat
 *                  gaps float 1 = 63; then the pre-run for the separation curves (0).
 *                  SNEAK → success roll 1 · gain int 1 · loss int 1 = 3.   DRAW → yards gauss 2 · break roll 1 · break int 1 = 4.
 *   live         : 1 parent draw — rng.fork('play:live'); the child lives in the Live and is drawn by in-play events in
 *                  event order (engine/field.js header). A run sim → a finished Live, 0 child draws.
 *   resolve      : 1 parent draw (Play.live's fork); the plan's inputs replay the live play's child draws exactly.
 *   driveScript  : 1 parent draw — rng.fork('play:drive'). Child: 25 draws in a fixed order (24 ints + the opening-score pick; see the function).
 *   rating, pathAt, pocketTime, isClutch, downText, spotText, forcedResult, autoPlan : 0.
 *
 * Shapes (the binding contract with the scene and the shell) are documented on each function.
 * Dependencies (load order): Tuning, Util, RNG (only through the rng passed in), Data.plays, Field.
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
  var ATTRS = ['ARM', 'ACC', 'IQ', 'MOB', 'POI'];
  var KINDS = ['PASS', 'THROWAWAY', 'SCRAMBLE', 'SACK'];
  var OUTCOMES = ['CATCH', 'INCOMPLETE', 'INT', 'SACK', 'THROWAWAY', 'SCRAMBLE', 'RUN', 'DROP'];
  var ADVICE = ['GOOD', 'OK', 'BAD'];
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

  // ═══════════════════════════════ CONTEXT ═══════════════════════════════

  /**
   * Build a PlayContext for a situation (the pre-snap read). ONE fork rng.fork('play:ctx') = 1 parent draw (the child's
   * draws in the file header; the field and the alignment draw nothing).
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
   *   pressure    { sackAt (s, jittered: when the first rusher gets home on a QB who stays in the pocket), pocket (s, before the jitter), hot, clutch }
   *   receivers   the roster aligned in the shotgun (the READ picture): [{slot, name, skill, speed, x0, y0, side}] (x0 held
   *               sideMargin inside the field); snap re-aligns per play
   *   field       { sideL, sideR, centerX, goalY, endY, losY: 0 } (RTG.Field.frame)
   *   alignment   the PRE-SNAP picture of the SHOWN look, so the READ screen draws the engine's alignment:
   *               { qb: {x, y}, receivers: [{slot, x, y}], linemen: [{x, y}] (5), defenders: [{id, x, y, pos}] (11) }
   *               (safeties deep or rolled down, press or off, the box count exact, the creeping nickel of a blitz tell)
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
    var field = RTG.Field.frame(sit.yl, hash, sit.venue);
    var receivers = RTG.Field.alignReceivers(team.wr, 'SHOTGUN', sign, field);
    var lookOut = { safeties: look.safeties, press: look.press, box: look.box, showBlitz: look.showBlitz, name: covs[shown].name, text: covs[shown].text, tell: covs[shown].tell };
    return {
      situation: sit, qb: qb, team: team, opp: opp,
      real: real, shown: shown, disguised: disguised,
      look: lookOut,
      options: options,
      adviceFrom: iq >= T.read.iqExact ? 'REAL' : 'SHOWN',
      pressure: {
        sackAt: rd(sackAt), pocket: rd(pocket),
        hot: real === 'BLITZ' || sackAt < T.read.hotBelow,
        clutch: clutch
      },
      receivers: receivers,
      field: field,
      alignment: RTG.Field.alignment(lookOut, receivers, sign, field),
      hash: hash, sign: sign,
      revealAt: rd(Math.max(0, T.read.revealBase - ratio(iq) * T.read.revealIq)),
      clarity: rd(ratio(iq)),
      weather: sit.weather, venue: sit.venue, clutch: clutch
    };
  };

  // ═══════════════════════════════ GEOMETRY ═══════════════════════════════

  /**
   * Position {x, y} (field yards) of a sim receiver at time t along his path (RTG.Field.pathAt: piecewise linear
   * through the waypoints, extrapolated along the last segment, y capped at the end zone, x held inside the field).
   * @param {{path: Array<{t:number, x:number, y:number}>, capY?: number}} rec @param {number} t @returns {{x:number, y:number}}
   */
  Play.pathAt = function (rec, t) { return RTG.Field.pathAt(rec, t); };

  /** The play for an id (or an option / play object). */
  function playFor(playId) {
    var id = playId && typeof playId === 'object' ? playId.id : playId;
    var all = D().plays;
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  /** The sim's receiver for a slot (null when unknown). */
  function receiverOf(sim, slot) {
    if (!sim || !sim.receivers) return null;
    for (var i = 0; i < sim.receivers.length; i++) if (sim.receivers[i].slot === slot) return sim.receivers[i];
    return null;
  }

  // ═══════════════════════════════ SNAP ═══════════════════════════════

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
    return {
      run: true, playId: play.id, play: { id: play.id, name: play.name, formation: play.formation, tags: play.tags.slice(), line: play.line },
      kind: 'RUN', outcome: 'RUN', target: null, yards: nz(yards), airYards: 0, yac: 0,
      td: td, firstDown: firstDown, turnover: false, fumble: false, big: big,
      t: 0, loft: 0, length: 0, flight: 0, arrive: null, landing: { x: 0, y: nz(yards) },
      text: text, banner: td ? 'TOUCHDOWN!' : (firstDown && !sit.lastPlay ? 'FIRST DOWN' : text),
      feedback: { timing: 'ON TIME', touch: 'TOUCH', placement: '—', coachSaw: saw },
      receivers: [], defenders: [], rushers: [], sackAt: null, revealAt: null, hot: null, checkdown: null,
      ctx: ctx
    };
  }

  /**
   * Snap the ball on a play. ONE fork rng.fork('play:snap') = 1 parent draw.
   * A run option (SNEAK / DRAW) is resolved here: the returned sim has run: true and IS the PlayResult
   * ({ run, outcome: 'RUN', yards, td, firstDown, text, banner, feedback, … } — no live play follows).
   * A pass play returns a PlaySim — everything the field simulation needs, as JSON:
   * {
   *   run: false, playId, play: {id, name, formation, tags, line}, ctx, real, shown, look,
   *   fit        the play's rating vs the REAL coverage ('GOOD' | 'OK' | 'BAD') — it shapes the defence (Tuning.qb.field.fit)
   *   field      { sideL, sideR, centerX, goalY, endY, losY: 0 }
   *   receivers  [{ slot, name, skill, speed, x0, y0, side, route, family, path: [{t, x, y}] (absolute field yards,
   *                speed-scaled, the snap's clock jitter in), capY, xMin, xMax, key: {t, x, y} (where the route is "there"),
   *                hot, checkdown, ghost: {sep: [41 samples, 0.1 s], peak, peakAt, from, to} (the separation with nobody
   *                throwing) }]
   *   defenders  [{ id, pos: 'CB'|'NB'|'S'|'LB'|'DL', role: 'MAN'|'ZONE'|'RUSH'|'SPY'|'ROBBER', man: slot|null,
   *                zone: {x, y, r}|null (the landmark), speed (yd/s), skill, reach (yd), react (s, the break on the
   *                ball; the snap's jitter in), trail (s, man), cushion (yd, man), x0, y0 (= ctx.alignment), deep }]
   *   rushers    [{ defId, lane, beatAt (s: he gets off his block), line: {x, y}, pocket: {x, y} }] in beat order
   *   linemen    [{x, y}] (5 starting spots)   qbStart {x, y}   qbDrop {y, t} (the default drop)
   *   sackAt     s: when the first rusher gets home on a QB who stands at the top of his drop (the pocket's clock)
   *   revealAt   s (IQ: the rings may show from here)   clarity   hot slot|null   checkdown slot|null
   * }
   * Child draws: RTG.Field.setup's 63 (the file header of engine/field.js), then the pre-run (0).
   * @param {Object} ctx PlayContext @param {string|Object} playId @param {RNG} rng @returns {Object} PlaySim
   */
  Play.snap = function (ctx, playId, rng) {
    if (!ctx || !ctx.situation) fail('snap', 'a PlayContext is required');
    if (!rng || typeof rng.fork !== 'function') fail('snap', 'an rng is required');
    var play = playFor(playId);
    if (!play) fail('snap', 'unknown play ' + (playId && playId.id ? playId.id : playId));
    var r = rng.fork('play:snap');                                                       // 1 parent draw
    if (play.run) return runPlay(ctx, play, r);
    var cast = RTG.Field.setup(ctx, play, r);                                            // 63 child draws
    var sim = {
      run: false, playId: play.id, play: { id: play.id, name: play.name, formation: play.formation, tags: play.tags.slice(), line: play.line },
      fit: cast.fit, field: cast.field,
      receivers: cast.receivers, defenders: cast.defenders, rushers: cast.rushers, linemen: cast.linemen,
      qbStart: cast.qbStart, qbDrop: cast.qbDrop, sackAt: cast.sackAt,
      revealAt: ctx.revealAt, clarity: ctx.clarity, hot: cast.hot, checkdown: cast.checkdown,
      real: ctx.real, shown: ctx.shown, look: ctx.look,
      ctx: ctx
    };
    var ghost = RTG.Field.ghost(sim);                                                    // 0 draws
    for (var i = 0; i < sim.receivers.length; i++) sim.receivers[i].ghost = ghost[i];
    return sim;
  };

  // ═══════════════════════════════ THE LIVE PLAY ═══════════════════════════════

  /** A finished Live for a run sim (the sim IS the result): nothing moves, every input is refused. */
  function runLive(sim) {
    var no = { ok: false, kind: null, target: null, reason: 'a run play: nothing to draw' };
    return {
      t: 0, phase: 'DONE', qb: { x: 0, y: 0, vx: 0, vy: 0, hasBall: false, down: false, escaped: 0 },
      receivers: [], defenders: [], linemen: [], ball: null, carrier: null, events: [], pressure: 0, rest: 0, previewShown: false,
      field: null, sim: sim,
      step: function () { return 'DONE'; },
      classify: function () { return { kind: 'INVALID', target: null, points: [], length: 0, maxLen: 0, tooLong: false, preview: null, previewShown: false, margin: null, reason: no.reason }; },
      aim: function () { return null; },
      setRun: function () { return { ok: false, reason: no.reason }; },
      throwAlong: function () { return no; },
      throwAway: function () { return no; },
      result: function () { return sim; },
      plan: function () { return { runs: [], pass: null, away: null }; },
      snapshot: function () { return { t: 0, phase: 'DONE', carrier: null, pressure: 0, qb: null, receivers: [], defenders: [], ball: null }; }
    };
  }

  /**
   * The play, live: ONE fork rng.fork('play:live') = 1 parent draw; the child rng lives inside the Live for the in-play
   * rolls (sack escape, scatter, tip, pick, catch, drop, broken tackle), drawn in EVENT ORDER (engine/field.js header).
   * Returns the Live (RTG.Field.create): positions mutated in place by live.step(dt); classify / aim / setRun /
   * throwAlong / throwAway / result / plan / snapshot. A run sim gets a finished Live whose result() is the sim.
   * @param {Object} sim PlaySim @param {RNG} rng @returns {Object} Live
   */
  Play.live = function (sim, rng) {
    if (!sim || !sim.ctx) fail('live', 'a PlaySim is required');
    if (!rng || typeof rng.fork !== 'function') fail('live', 'an rng is required');
    var r = rng.fork('play:live');                                                       // 1 parent draw
    if (sim.run) return runLive(sim);
    return RTG.Field.create(sim, r);
  };

  /**
   * Replay a plan: Play.live + the plan's inputs at their sim times + step to DONE. The SAME PlayResult as the live play
   * that produced the plan (live.plan()). ONE parent draw (Play.live's fork). A run sim returns the sim.
   * @param {Object} sim PlaySim @param {{runs?: Array<{t, points}>, pass?: {t, points, loft}|null, away?: number|null}} plan
   * @param {RNG} rng @returns {Object} PlayResult
   */
  Play.resolve = function (sim, plan, rng) {
    var live = Play.live(sim, rng);
    if (sim.run) return sim;
    return RTG.Field.replay(live, plan);
  };

  /**
   * A sensible plan for a pass sim with no human (the shell's headless auto-resolve, RTG.debug.skipTo): at the first of
   * field.auto.times with a GREEN or GOLD line, a straight touch pass (field.auto.loft) to the spot the best of those
   * receivers can reach (the best colour, then the most separation now); at the last of those times the best line
   * whatever its colour; with no PASS line at all, a throw-away field.auto.awayEarly before sim.sackAt. Pure: it
   * rehearses on a private Live whose rolls are the median (every chance at 0.5, every gauss at its mean) — 0 draws
   * from any rng.
   * @param {Object} sim PlaySim @returns {{runs: Array, pass: Object|null, away: number|null}}
   */
  Play.autoPlan = function (sim) {
    var empty = { runs: [], pass: null, away: null };
    if (!sim || sim.run || !sim.receivers) return empty;
    var A = P().field.auto, live = RTG.Field.create(sim, MEDIAN), times = A.times, loft = A.loft;
    var DT = P().field.dt, best = null;
    for (var i = 0; i < times.length && !best; i++) {
      while (live.t < times[i] - 1e-9 && live.phase === 'PRE_THROW') live._steps(1);
      if (live.phase !== 'PRE_THROW') break;
      var pick = null, pickRank = -1;
      for (var j = 0; j < sim.receivers.length; j++) {
        var aim = live.aim(sim.receivers[j].slot, loft);
        if (!aim || aim.tooLong) continue;
        var c = live.classify(aim.points, loft);
        if (c.kind !== 'PASS' || c.target !== sim.receivers[j].slot) continue;
        var rank = (c.preview === 'GREEN' ? 2 : (c.preview === 'GOLD' ? 1 : 0)) * 100 + live.receivers[j].sep;
        if (rank > pickRank) { pickRank = rank; pick = aim; }
      }
      if (pick && (pickRank >= 100 || i === times.length - 1)) best = { t: Math.round(live.t / DT) * DT, points: pick.points, loft: loft };
    }
    if (best) return { runs: [], pass: { t: Util.roundN(best.t, 6), points: best.points, loft: loft }, away: null };
    var awayT = Math.max(0, num(sim.sackAt, 2) - A.awayEarly);
    return { runs: [], pass: null, away: Util.roundN(Math.round(awayT / DT) * DT, 6) };
  };

  /** The median "rng" for rehearsals (Play.autoPlan): no randomness at all. */
  var MEDIAN = {
    next: function () { return 0.5; }, chance: function (p) { return p > 0.5; }, float: function (a, b) { return (a + b) / 2; },
    int: function (a, b) { return Math.round((a + b) / 2); }, gauss: function (mu) { return mu === undefined ? 0 : mu; },
    pick: function (arr) { return arr && arr.length ? arr[0] : undefined; }, weighted: function (arr) { return arr && arr.length ? arr[0] : undefined; },
    fork: function () { return MEDIAN; }, state: function () { return 0; }, setState: function () {}
  };

  /**
   * Debug: a consistent PlayResult for a requested outcome without consuming rng (the shell's RTG.debug.forceResult).
   * kind: 'CATCH'|'FIRST_DOWN'|'TD'|'INCOMPLETE'|'INT'|'SACK'|'DROP'|'THROWAWAY'|'SCRAMBLE'|'FUMBLE'. 0 draws.
   * The target defaults to the first receiver, the release to 0.8 s before his separation peak (≥ 0.3 s).
   * @param {Object} sim @param {string} kind @param {Object} [input] {target?, t?, loft?} @returns {Object} PlayResult
   */
  Play.forcedResult = function (sim, kind, input) {
    if (!sim || !sim.ctx) fail('forcedResult', 'a PlaySim is required');
    if (sim.run) return sim;
    var sit = sim.ctx.situation, goal = FIELD_YARDS - sit.yl;
    input = input || {};
    var target = (input.target && receiverOf(sim, input.target)) ? input.target : (sim.receivers[0] ? sim.receivers[0].slot : null);
    var rec = receiverOf(sim, target);
    var t = clamp(num(input.t, rec && rec.ghost ? rec.ghost.peakAt - 0.8 : 1), 0.3, 6);
    var pos = rec ? Play.pathAt(rec, t + 1) : { x: 0, y: 5 };
    var air = clamp(Math.round(pos.y), -(sit.yl - 1), goal);
    var res = {
      run: false, playId: sim.playId, play: sim.play, kind: 'PASS', outcome: 'INCOMPLETE', target: target,
      yards: 0, airYards: 0, yac: 0, td: false, firstDown: false, turnover: false, fumble: false,
      t: rd(t), loft: rd(clamp(num(input.loft, 0.5), 0, 1)), length: rd(Math.sqrt(pos.x * pos.x + (pos.y + 7) * (pos.y + 7))),
      landing: { x: rd(pos.x), y: rd(pos.y) }, release: null, arrive: rd(t + 1), flight: 1, sep: null, escaped: 0,
      ended: 'FORCED', endT: rd(t + 1), tooLong: false, sackAt: sim.sackAt,
      text: 'INCOMPLETE', banner: 'INCOMPLETE', forced: true,
      feedback: { timing: 'ON TIME', touch: 'TOUCH', placement: 'ON THE MONEY', coachSaw: 'Coach saw the debug menu.' }
    };
    function gain(y, verb) {
      res.yards = nz(clamp(y, -(sit.yl - 1), goal));
      res.airYards = Math.min(res.yards, Math.max(0, air));
      res.yac = res.yards - res.airYards;
      res.td = res.yards > 0 && sit.yl + res.yards >= FIELD_YARDS;
      res.firstDown = res.td || res.yards >= sit.toGo;
      res.text = verb + ' ' + signed(res.yards);
      res.banner = res.td ? 'TOUCHDOWN!' : (res.firstDown && !sit.lastPlay ? 'FIRST DOWN' : res.text);
    }
    switch (kind) {
      case 'CATCH': res.outcome = 'CATCH'; gain(Math.max(0, Math.min(air + 2, sit.toGo - 1)), 'CATCH'); break;   // never a first down (0 at toGo 1)
      case 'FIRST_DOWN': res.outcome = 'CATCH'; gain(Math.max(sit.toGo, Math.min(sit.toGo + 3, goal)), 'CATCH'); break;   // always the sticks (a TD when they are the goal line)
      case 'TD': res.outcome = 'CATCH'; gain(goal, 'CATCH'); break;
      case 'INT': res.outcome = 'INT'; res.turnover = true; res.text = 'INTERCEPTED'; res.banner = res.text; res.feedback.placement = 'INTO COVERAGE'; break;
      case 'SACK': res.outcome = 'SACK'; res.kind = 'SACK'; res.target = null; res.landing = { x: 0, y: P().field.qbDrop.depth };
        res.yards = P().field.qbDrop.depth; res.text = 'SACKED ' + signed(res.yards); res.banner = res.text; res.feedback.timing = 'TOO LATE'; res.feedback.placement = '—'; break;
      case 'DROP': res.outcome = 'DROP'; res.text = 'DROPPED'; res.banner = res.text; break;
      case 'THROWAWAY': res.outcome = 'THROWAWAY'; res.kind = 'THROWAWAY'; res.target = null; res.text = 'THROWN AWAY'; res.banner = res.text; res.feedback.placement = '—'; break;
      case 'SCRAMBLE': res.outcome = 'SCRAMBLE'; res.kind = 'SCRAMBLE'; res.target = null; res.feedback.placement = '—'; gain(Math.min(4, goal), 'SCRAMBLE'); res.airYards = 0; res.yac = 0; break;
      case 'FUMBLE': res.outcome = 'SCRAMBLE'; res.kind = 'SCRAMBLE'; res.target = null; res.feedback.placement = '—'; res.yards = Math.min(2, goal); res.fumble = true; res.turnover = true; res.text = 'FUMBLE'; res.banner = 'FUMBLE'; break;
      default: res.outcome = 'INCOMPLETE'; break;
    }
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
