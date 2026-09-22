/**
 * Road to Glory: Kicker — RTG.Punt (SPEC §2.6, decision D24): the punting engine.
 *
 * A punter's career runs on the same machinery as a kicker's — the same aim-then-hold input, the same
 * KickContext, the same session and game pendings — but the kick itself is a different problem. A field goal
 * asks one question (is it through?); a punt asks two at once, and they fight:
 *
 *   distance rises with power, all the way to the punter's limit;
 *   hang time peaks at a lower power and falls off either side of it.
 *
 * So the bar's green band is not "the power that gets there" but "the power the situation wants". From your own
 * 12 the coach wants every yard; from the opponent's 40 he wants it dead at the 5, and a booming one is a
 * touchback that hands back 20 of them. Aim is the other half: pointing at a sideline trades downfield yards
 * for a ball that cannot be returned.
 *
 * Pure over plain JSON; every random number comes from the rng passed in, and the resolver reads attributes only
 * from `ctx.kicker` (or the explicit `attrs`), so a punt replays exactly from {ctx, input, rngState}.
 *
 * RNG draw accounting (binding):
 *   buildContext : Kick.buildContext's (wind 2 · Legend gusts 2) + hash 1 (punts are snapped from a hash)
 *   aiInput      : power gauss 2 · aim gauss 2 (4, in that order)
 *   resolve      : 1 block · 2,3 distance gauss · 4,5 hang gauss · 6,7 lateral gauss
 *                  · in play: 8 fair-catch roll · 9,10 return gauss · 11 return-TD roll
 *                  · blocked: 1 further roll (defence scores).  (opts.forced: 0 draws.)
 *
 * Dependencies (load order): Util, Tuning, Kick.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  var Util = RTG.Util, Tuning = RTG.Tuning;
  var Punt = {};

  var clamp = Util.clamp;
  var DEG = Math.PI / 180;
  var FIELD_YARDS = 100;
  var RESULT_DECIMALS = 2;

  var GRADES = ['BLOCKED', 'SHANK', 'TOUCHBACK', 'POOR', 'OK', 'GOOD', 'BOOMING', 'COFFIN'];

  function P() { return Tuning.punt; }
  function K() { return RTG.Kick; }
  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
  function rd(x) { return Util.roundN(x, RESULT_DECIMALS); }
  function fail(fn, msg) { throw new Error('Punt.' + fn + ': ' + msg); }

  /** The attributes a punt reads: the ctx snapshot unless the caller overrides them. */
  function attrsFor(ctx, attrs) {
    if (attrs) return attrs;
    if (ctx && ctx.kicker && ctx.kicker.attrs) return ctx.kicker.attrs;
    fail('attrsFor', 'the context carries no kicker snapshot');
    return null;
  }

  Punt.GRADES = GRADES;

  // ═══════════════════════════════ context ═══════════════════════════════

  /**
   * A punt KickContext. `situation.losYard` is the line of scrimmage measured from the punting team's own goal
   * (1–99); everything else is Kick.buildContext's (wind, weather, pressure flags, the kicker snapshot).
   * Draws: Kick.buildContext's.
   * @param {Object|null} state @param {Object|null} gs @param {Object} situation @param {RNG} [rng]
   * @returns {Object} KickContext with type 'PUNT'
   */
  Punt.buildContext = function (state, gs, situation, rng) {
    situation = situation || {};
    var los = clamp(Math.round(num(situation.losYard, 30)), 1, FIELD_YARDS - 1);
    var sit = {};
    for (var k in situation) if (Object.prototype.hasOwnProperty.call(situation, k)) sit[k] = situation[k];
    sit.type = 'PUNT';
    sit.losYard = los;
    sit.toGoal = FIELD_YARDS - los;
    var ctx = K().buildContext(state, gs, sit, rng);
    ctx.losYard = los;
    ctx.toGoal = FIELD_YARDS - los;
    // the ball is snapped from a hash, and Kick.buildContext only rolls one for field goals: the hash decides
    // which sideline is the short way out, which is the whole point of a directional punt
    var h;
    if (situation.hash === undefined || situation.hash === null) {
      var dist = Tuning.kick.hash.snapDist[ctx.league] || Tuning.kick.hash.snapDist.COLLEGE;
      var pick = rng || (situation.rng || null);
      h = pick ? pick.weighted([{ h: -1, w: dist.L }, { h: 0, w: dist.M }, { h: 1, w: dist.R }], 'w').h : 0;   // draw
    } else h = situation.hash < 0 ? -1 : (situation.hash > 0 ? 1 : 0);
    ctx.hash = h;
    ctx.ballX = K().ballXFor(ctx.league, h);
    return ctx;
  };

  // ═══════════════════════════════ the model ═══════════════════════════════

  /**
   * Gross distance from the power the punter put through it: linear to the sweet spot, then flattening, and
   * past 1.0 the ball comes off the foot badly and loses yards again.
   */
  function distanceFor(power, maxDist) {
    var C = P().curve;
    var p = clamp(power, 0, C.powerMax);
    var f = p <= 1 ? (C.distBase + (1 - C.distBase) * Math.pow(p, C.distExp))
      : 1 - C.overswingLoss * (p - 1) / (C.powerMax - 1);
    return Math.max(0, maxDist * f);
  }

  /** Hang time: a bell around the punter's sweet spot, so a boomed ball hangs less than a struck one. */
  function hangFor(power, maxHang) {
    var C = P().curve;
    var d = (clamp(power, 0, C.powerMax) - C.hangPeak) / C.hangWidth;
    return Math.max(C.hangMin, maxHang * Math.exp(-0.5 * d * d));
  }

  /** The power that produces `want` yards of gross distance (the inverse of distanceFor below 1.0). */
  function powerForDistance(want, maxDist) {
    var C = P().curve;
    var f = clamp(want / Math.max(1, maxDist), 0, 1);
    if (f <= C.distBase) return 0;
    return clamp(Math.pow((f - C.distBase) / (1 - C.distBase), 1 / C.distExp), 0, 1);
  }

  /** Expected return yards off a punt with this hang, before it is kicked (the coach's own estimate). */
  function expectedReturn(hang, oppST) {
    var R = P().ret;
    var pFair = clamp(R.fairBase + R.fairPerHang * (hang - R.hangAnchor), 0, 1);   // straight down the middle
    var mean = Math.max(0, R.base - R.perHang * (hang - R.hangAnchor) - R.perOppST * (num(oppST, R.stAnchor) - R.stAnchor));
    return (1 - pFair) * mean;
  }

  /**
   * The power the situation actually wants. A punt is not "as hard as you can": distance rises with power but
   * hang falls away past the sweet spot, and a ball that outruns its coverage comes back. So the target is the
   * power that maximises NET yards — and, once the end zone is in range, the best net that still lands short of
   * it. Scanned rather than solved: the curves are cheap and the scan keeps the two rules in one place.
   */
  function bestPower(maxDist, maxHang, los, oppST, pin) {
    var T = P(), C = T.curve, S = T.search;
    var room = FIELD_YARDS - los;
    var best = -1e9, bestP = 0, bestNet = 0;
    for (var i = 0; i <= S.steps; i++) {
      var p = (i / S.steps) * C.powerMax;
      var dist = distanceFor(p, maxDist);
      var landing = los + dist;
      var net = dist - expectedReturn(hangFor(p, maxHang), oppST);
      if (landing >= FIELD_YARDS - S.endZoneMargin) {
        // past this the ball is in the end zone: worth only what a touchback is worth, and never the target
        if (!pin) net = (FIELD_YARDS - T.field.touchbackYard) - los - S.touchbackPenalty;
        else net = -1e9;
      } else if (landing >= FIELD_YARDS - T.field.insideYards) {
        net += S.insideBonus;                      // pinning them is worth more than the yardage says
      }
      if (net > best) { best = net; bestP = p; bestNet = dist; }
    }
    if (best <= -1e8) {                            // every power puts it in the end zone: take the softest punt
      bestP = 0; bestNet = distanceFor(0, maxDist); best = bestNet;
    }
    return { power: bestP, want: bestNet, net: best };
  }

  /**
   * The closed-form picture of a punt from this spot: what the punter can do, what the situation wants, and
   * where on the power bar that lives. Pure, no draws.
   * @param {Object} ctx @param {Object} [attrs] @param {{power?:number}} [opts]
   * @returns {Object} PuntModel
   */
  Punt.model = function (ctx, attrs, opts) {
    opts = opts || {};
    var T = P(), C = T.curve, D = T.distance;
    attrs = attrsFor(ctx, attrs);
    var los = clamp(Math.round(num(ctx.losYard, 30)), 1, FIELD_YARDS - 1);
    var toGoal = FIELD_YARDS - los;
    var wind = ctx.wind || { speed: 0, dir: 0 };
    var comp = RTG.Weather && RTG.Weather.components ? RTG.Weather.components(wind) : { along: 0, cross: 0 };
    var windYds = num(comp.along, 0) * D.windAlongPerMph;
    var maxDist = clamp(D.base + D.perPow * (num(attrs.POW, 50) - D.powAnchor) + windYds, D.min, D.max);
    var maxHang = clamp(C.hangBase + C.hangPerKo * (num(attrs.KO, attrs.CON) - C.hangAnchor), C.hangFloor, C.hangCeil);

    var pin = toGoal <= T.field.pinFrom;
    var target = bestPower(maxDist, maxHang, los, num(ctx.oppST, T.ret.stAnchor), pin);
    // the band sits on the target, shaded low so the top of it is the target rather than the floor
    var pNeed = clamp(target.power - T.field.greenBand * T.field.bandLead, 0, Math.max(0, C.powerMax - T.field.greenBand));
    var power = opts.power !== undefined ? clamp(opts.power, 0, C.powerMax) : pNeed + T.field.greenBand / 2;

    return {
      losYard: los, toGoal: toGoal, pin: pin,
      maxDist: rd(maxDist), maxHang: rd(maxHang), want: Math.round(clamp(target.want, 0, toGoal)),
      pNeed: rd(pNeed), greenBand: T.field.greenBand, powerMax: C.powerMax,
      windAlongYds: rd(windYds),
      tbFrom: rd(powerForDistance(toGoal, maxDist)),           // the power that reaches the end zone
      distance: rd(distanceFor(power, maxDist)), hang: rd(hangFor(power, maxHang)),
      power: rd(power),
      pBlock: Util.roundN(Punt.pBlock(ctx, attrs), 4)      // a block is a fraction of a percent: 2 dp rounds it away
    };
  };

  /** Block probability: the operation, the rush and how much the moment is getting to them. */
  Punt.pBlock = function (ctx, attrs) {
    var B = P().block;
    attrs = attrsFor(ctx, attrs);
    var p = B.base
      + B.perOppST * (num(ctx.oppST, B.stAnchor) - B.stAnchor)
      - B.perCon * (num(attrs.CON, 50) - B.conAnchor)
      + B.pressure * num(ctx.pressure, 0);
    return clamp(p, 0, B.max);
  };

  /** True when a release at `power` is inside the band the situation asks for (the engine's own check, §4.6). */
  Punt.inGreen = function (power, model) {
    var eps = 1e-6;
    if (!model || typeof model.pNeed !== 'number') return false;
    return power >= model.pNeed - eps && power <= Math.min(model.powerMax, model.pNeed + model.greenBand) + eps;
  };

  // ═══════════════════════════════ the AI rule ═══════════════════════════════

  /**
   * What an AI punter (or an auto-punt) puts on the ball: the middle of the band, aimed at the sideline when
   * the situation wants the ball dead. Draws: power gauss 2 · aim gauss 2.
   * @param {RNG} rng @param {Object} ctx @param {Object} [attrs] @param {Object} [model]
   * @returns {{power:number, aim:number}}
   */
  Punt.aiInput = function (rng, ctx, attrs, model) {
    var A = P().ai;
    var m = model || Punt.model(ctx, attrs);
    var acc = num(attrsFor(ctx, attrs).ACC, 50);
    var power = clamp(m.pNeed + m.greenBand / 2 + rng.gauss(0, A.powerSd), 0, m.powerMax);   // draws 1, 2
    var aimTarget = m.pin ? A.pinAim * (acc / A.accAnchor) : 0;
    var aim = clamp(aimTarget + rng.gauss(0, A.aimSd), -P().aimMax, P().aimMax);             // draws 3, 4
    return { power: Util.roundN(power, 3), aim: Util.roundN(aim, 2) };
  };

  // ═══════════════════════════════ resolve ═══════════════════════════════

  function emptyResult(ctx, input, auto) {
    return {
      type: 'PUNT', losYard: num(ctx.losYard, 30), toGoal: num(ctx.toGoal, 70),
      power: rd(num(input.power, 0)), aim: rd(num(input.aim, 0)),
      gross: 0, net: 0, hang: 0, landing: 0, lateral: 0, oppStart: 0,
      touchback: false, outOfBounds: false, fairCatch: false, downed: false,
      returnYds: 0, inside20: false, blocked: false, blockReturnTd: false, returnTd: false,
      grade: 'OK', auto: !!auto, assisted: false, forced: false, tags: auto ? ['auto'] : []
    };
  }

  /** The receiving side's own-yard line for a ball dead at `landing` (their goal line is 100). */
  function spotOf(landing) {
    return rd(clamp(FIELD_YARDS - landing, 1, FIELD_YARDS - 1));
  }

  /** Where the ball ends up once it has landed, and what that is worth. */
  function settle(res, ctx, m, rng, opts) {
    var T = P(), R = T.ret;
    var landing = res.losYard + res.gross;
    if (landing >= FIELD_YARDS) {                                   // into the end zone
      res.touchback = true;
      res.landing = FIELD_YARDS;
      res.oppStart = T.field.touchbackYard;
      res.gross = rd(FIELD_YARDS - res.losYard);
      res.grade = 'TOUCHBACK';
      res.net = rd((FIELD_YARDS - T.field.touchbackYard) - res.losYard);
      return res;
    }
    res.landing = rd(landing);
    var halfWidth = T.field.halfWidthYd;
    if (Math.abs(res.lateral) >= halfWidth) {                        // out of bounds: dead where it crossed
      res.outOfBounds = true;
      res.net = rd(res.gross);
      res.oppStart = spotOf(landing);
      res.inside20 = landing >= FIELD_YARDS - T.field.insideYards;
      res.grade = gradeOf(res, m);
      return res;
    }
    // in play: a high ball is fair-caught or downed, a low one is returned
    var pinned = clamp(Math.abs(res.lateral) / halfWidth, 0, 1);            // angled at the sideline
    var pFair = clamp(R.fairBase + R.fairPerHang * (res.hang - R.hangAnchor) + R.fairPerSideline * pinned, 0, 1);
    var fair = opts && opts.noReturn ? true : rng.chance(pFair);                               // draw
    if (fair) {
      res.fairCatch = true;
      res.net = rd(res.gross);
      res.oppStart = spotOf(landing);
    } else {
      var mean = R.base - R.perHang * (res.hang - R.hangAnchor) - R.perOppST * (num(ctx.oppST, 50) - R.stAnchor);
      var ret = Math.max(0, rng.gauss(mean, R.sd));                                            // draws
      ret = Math.min(ret, landing);                                                            // cannot run past the goal line
      res.returnYds = rd(ret);
      res.returnTd = rng.chance(clamp(R.tdBase + R.tdPerYd * ret, 0, R.tdMax));                // draw
      if (res.returnTd) { res.returnYds = rd(landing); res.oppStart = FIELD_YARDS; }
      else res.oppStart = spotOf(landing - res.returnYds);
      res.net = rd(res.gross - res.returnYds);
    }
    res.inside20 = !res.touchback && landing >= FIELD_YARDS - T.field.insideYards;
    res.grade = gradeOf(res, m);
    return res;
  }

  function gradeOf(res, m) {
    var G = P().grade;
    if (res.blocked) return 'BLOCKED';
    if (res.touchback) return 'TOUCHBACK';
    if (res.gross <= G.shankBelow) return 'SHANK';
    if (res.inside20 && (res.outOfBounds || res.fairCatch || res.returnYds <= G.coffinRet)) return 'COFFIN';
    if (res.net >= m.maxDist * G.boomingPct) return 'BOOMING';
    if (res.net >= m.maxDist * G.goodPct) return 'GOOD';
    if (res.net >= m.maxDist * G.okPct) return 'OK';
    return 'POOR';
  }

  /**
   * Resolve a punt (§2.6.3). The draw order is fixed and documented at the top of the file.
   *   `opts.forced` — a debug outcome from Punt.GRADES: 0 draws.
   *   `input.green` — the §4.6 assist claim; re-checked here with Punt.inGreen before it is honoured.
   * @param {RNG} rng @param {Object} ctx @param {Object|null} attrs @param {Object|null} input {power, aim, green?}
   * @param {{auto?:boolean, forced?:string, noReturn?:boolean}} [opts]
   * @returns {Object} PuntResult
   */
  Punt.resolve = function (rng, ctx, attrs, input, opts) {
    opts = opts || {};
    attrs = attrsFor(ctx, attrs);
    var T = P(), C = T.curve;
    var auto = !input;
    var m = Punt.model(ctx, attrs);
    var inp = input || Punt.aiInput(rng, ctx, attrs, m);
    var power = clamp(num(inp.power, m.pNeed), 0, C.powerMax);
    var aim = clamp(num(inp.aim, 0), -T.aimMax, T.aimMax);
    var res = emptyResult(ctx, { power: power, aim: aim }, auto);
    if (auto) res.auto = true;

    if (opts.forced) return forcedResult(res, ctx, m, opts.forced);

    // the §4.6 assist: a release the engine agrees was inside the band is the punt the situation asked for
    if (inp.green && Punt.inGreen(power, m)) return assistedResult(res, ctx, m, power, aim, opts);

    res.blocked = rng.chance(Punt.pBlock(ctx, attrs));                                         // draw 1
    if (res.blocked) {
      res.blockReturnTd = rng.chance(T.block.returnTdProb);                                    // draw 2
      res.grade = 'BLOCKED';
      res.gross = 0; res.net = 0; res.hang = 0;
      res.landing = res.losYard;
      res.oppStart = res.blockReturnTd ? FIELD_YARDS : clamp(FIELD_YARDS - res.losYard + T.block.spotGain, 1, FIELD_YARDS - 1);
      return res;
    }
    var aimRad = aim * DEG;
    var straight = distanceFor(power, m.maxDist) * Math.cos(aimRad);
    var conSd = T.spread.distSd * (1 + T.spread.distPerCon * (T.spread.conAnchor - num(attrs.CON, 50)))
      * (1 + T.spread.pressure * num(ctx.pressure, 0));
    var gross = Math.max(0, straight + rng.gauss(0, Math.max(0.1, conSd)));                    // draws 2, 3
    var hang = Math.max(C.hangMin, hangFor(power, m.maxHang) + rng.gauss(0, T.spread.hangSd)); // draws 4, 5
    var latSd = T.spread.latSd * (1 + T.spread.latPerAcc * (T.spread.accAnchor - num(attrs.ACC, 50)))
      * (1 + T.spread.latPerAim * Math.abs(aim) / T.aimMax);
    var lateral = num(ctx.ballX, 0) + gross * Math.tan(aimRad) + rng.gauss(0, Math.max(0.1, latSd));   // draws 6, 7
    res.gross = rd(gross);
    res.hang = rd(hang);
    res.lateral = rd(lateral);
    return settle(res, ctx, m, rng, opts);
  };

  /** The green-band assist (D21, D24): the punt the situation asked for, with no draws spent. */
  function assistedResult(res, ctx, m, power, aim, opts) {
    var T = P();
    var gross = distanceFor(power, m.maxDist) * Math.cos(aim * DEG);
    res.gross = rd(gross);
    res.hang = rd(Math.max(hangFor(power, m.maxHang), T.assist.hangFloor));
    res.assisted = true;
    res.tags = res.tags.concat(['assisted']);
    var landing = res.losYard + gross;
    if (landing >= FIELD_YARDS - T.field.insideYards && landing < FIELD_YARDS) {
      // the coffin corner: the assist puts it out of bounds where it lands, so nobody returns it
      res.outOfBounds = true;
      res.lateral = rd((num(ctx.ballX, 0) >= 0 ? 1 : -1) * T.field.halfWidthYd);
      res.landing = rd(landing);
      res.net = rd(gross);
      res.oppStart = spotOf(landing);
      res.inside20 = true;
      res.grade = 'COFFIN';
      return res;
    }
    res.lateral = rd(num(ctx.ballX, 0) + gross * Math.tan(aim * DEG));
    if (landing >= FIELD_YARDS) {                    // a booming assisted punt can still reach the end zone
      res.touchback = true;
      res.landing = FIELD_YARDS;
      res.gross = rd(FIELD_YARDS - res.losYard);
      res.oppStart = T.field.touchbackYard;
      res.net = rd((FIELD_YARDS - T.field.touchbackYard) - res.losYard);
      res.grade = 'TOUCHBACK';
      return res;
    }
    res.landing = rd(landing);
    res.fairCatch = true;                            // the hang the assist guarantees is not returnable
    res.net = rd(gross);
    res.oppStart = spotOf(landing);
    res.inside20 = landing >= FIELD_YARDS - T.field.insideYards;
    res.grade = gradeOf(res, m);
    return res;
  }

  /** RTG.debug.forcePunt: the named grade, without spending a draw. */
  function forcedResult(res, ctx, m, grade) {
    var T = P(), G = T.forced;
    res.forced = true;
    res.tags = res.tags.concat(['forced']);
    res.grade = GRADES.indexOf(grade) >= 0 ? grade : 'OK';
    var los = res.losYard, room = FIELD_YARDS - los;
    switch (res.grade) {
      case 'BLOCKED':
        res.blocked = true; res.hang = 0; res.gross = 0; res.net = 0; res.landing = los;
        res.oppStart = clamp(FIELD_YARDS - los + T.block.spotGain, 1, FIELD_YARDS - 1);
        return res;
      case 'TOUCHBACK':
        res.touchback = true; res.gross = rd(room); res.landing = FIELD_YARDS; res.hang = G.hang;
        res.oppStart = T.field.touchbackYard; res.net = rd((FIELD_YARDS - T.field.touchbackYard) - los);
        return res;
      case 'SHANK':
        res.gross = rd(Math.min(G.shank, room - 1)); res.hang = G.shankHang; break;
      case 'COFFIN':
        res.gross = rd(Math.max(1, room - G.coffinYard)); res.hang = G.hang; res.outOfBounds = true; break;
      case 'BOOMING':
        res.gross = rd(Math.min(m.maxDist, room - 1)); res.hang = G.hang; res.fairCatch = true; break;
      default:
        res.gross = rd(Math.min(m.maxDist * G.okPct, room - 1)); res.hang = G.hang; res.fairCatch = true; break;
    }
    res.landing = rd(los + res.gross);
    res.net = res.gross;
    res.oppStart = spotOf(res.landing);
    res.inside20 = res.landing >= FIELD_YARDS - T.field.insideYards;
    if (!res.outOfBounds && !res.fairCatch) res.fairCatch = true;
    return res;
  }

  // ═══════════════════════════════ feedback ═══════════════════════════════

  var GRADE_TEXT = {
    BLOCKED: 'BLOCKED!', SHANK: 'SHANKED', TOUCHBACK: 'TOUCHBACK', POOR: 'SHORT',
    OK: 'FAIR', GOOD: 'GOOD PUNT', BOOMING: 'BOOMING!', COFFIN: 'COFFIN CORNER!'
  };
  Punt.GRADE_TEXT = GRADE_TEXT;

  /**
   * The line the scene prints under a punt: what happened, and the one thing that would have made it better.
   * @param {Object} res @param {Object} ctx @param {Object} [model] @returns {{title:string, detail:string, coach:string}}
   */
  Punt.feedbackFor = function (res, ctx, model) {
    var m = model || Punt.model(ctx, null);
    var title = GRADE_TEXT[res.grade] || res.grade;
    var bits = [];
    if (!res.blocked) {
      bits.push(res.gross + ' yd' + (res.net !== res.gross ? ' (' + res.net + ' net)' : ''));
      bits.push(res.hang + 's hang');
      if (res.outOfBounds) bits.push('out of bounds at the ' + Math.round(FIELD_YARDS - res.landing));
      else if (res.touchback) bits.push('into the end zone');
      else if (res.fairCatch) bits.push('fair catch');
      else bits.push(res.returnYds + ' yd return');
    }
    var coach;
    if (res.blocked) coach = 'They came clean off the edge — that ball has to be gone quicker.';
    else if (res.touchback) coach = 'Twenty yards handed back. From there you take something off it.';
    else if (res.grade === 'SHANK') coach = 'Off the side of the foot. Drop it flatter.';
    else if (res.grade === 'COFFIN') coach = 'Dead inside the 20 with nobody to return it. That is the punt.';
    else if (res.returnYds >= P().ret.longReturn) coach = 'Not enough hang — they had it back before the coverage got there.';
    else if (res.grade === 'BOOMING') coach = 'Flipped the field on your own.';
    else coach = 'Playable. A little more hang and they never get started.';
    return { title: title, detail: bits.join(' · '), coach: coach };
  };

  RTG.Punt = Punt;
})(typeof window !== 'undefined' ? window : globalThis);
