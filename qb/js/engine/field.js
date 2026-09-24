/**
 * Road to Glory: QB — RTG.Field (the play on the field: 22 players and the ball in field yards, stepped at a fixed dt)
 *
 * DOM-free and pure. The engine owns every position: the scene draws exactly what a Live says and never computes a
 * player's position itself, so the gap the player threads on screen is the gap the engine checks.
 *
 * FIELD FRAME: x = lateral yards from the ball's spot (+ = the offence's right), y = yards downfield of the line of
 * scrimmage (the LOS is y = 0, the backfield is negative). field = { sideL, sideR, centerX, goalY (= 100 − yl),
 * endY (= goalY + 10), losY: 0 }. Points are plain {x, y}; polylines are arrays of them.
 *
 * What lives here:
 *   frame / alignment / setup   the field, the pre-snap picture (ctx.alignment) and a pass play's cast at the snap
 *                               (Play.snap calls setup, then ghost for the separation curves)
 *   create(sim, rng, opts)      → Live, the play itself (Play.live forks the rng and calls this)
 *   replay(live, plan)          apply a plan's inputs at their sim times and step to DONE (Play.resolve)
 *   polylines                   clean, length, truncate, resample, smooth (0 draws; new arrays)
 *   physics                     qbSpeed, recSpeed, defSpeed, ballSpeed, maxLen, apex, heightAt, loftFor, weatherPenalty
 *
 * THE LIVE (binding; Field.create documents every field):
 *   t · phase 'PRE_THROW' | 'BALL_IN_AIR' | 'AFTER_CATCH' | 'SCRAMBLE' | 'DONE' · qb · receivers[5] · defenders[11] ·
 *   linemen[5] · ball (null until the release) · carrier · events · pressure (0..1, the RUSH meter) · previewShown
 *   step(dt) → phase          fixed sub-steps of field.dt; dt clamped to [0, field.maxStep]; the rest carries
 *   classify(points, loft)    → {kind, target, points, length, maxLen, tooLong, preview, previewShown, margin, reason}; 0 draws
 *   aim(slot, loft)           → the spot a straight ball meets him on his route, {slot, x, y, flight, arrive, points, tooLong} | null
 *   setRun(points)            → {ok, reason}   the QB runs it from where he is (a far first point: he runs to it)
 *   throwAlong(points, loft)  → {ok, kind, target, reason}   release now along the line (a THROWAWAY line flies as one;
 *                               a RUN line thrown anyway is a pass to nobody)
 *   throwAway()               → {ok, kind: 'THROWAWAY', target: null, reason}
 *   result() · plan() · snapshot()
 * The rules in one breath: the QB drops (or runs his line); receivers run their paths; man defenders trail their man
 * (their trail, cushion and inside leverage), zones drop to landmarks and shade to the nearest threat (deep zones stay
 * over the top), the spy mirrors, the rush is held by the line until beatAt and then chases the QB where he IS; a
 * free defender within tackleR of the QB behind the line → the sack roll (escape by MOB); the ball flies its path at
 * its speed with height h(u); every defender gets one contact roll the first time it passes within reachR under his
 * reach (tip, or a pick); a defender in the lane jumps it; everybody else breaks on the landing spot after his react;
 * at the landing the catch contest; after a catch the carrier runs for the goal line, bending away from pursuit, and
 * every defender within tackleR rolls a tackle (or is broken and shed); the QB across the line is a scramble; the
 * sideline, the goal line and maxT end it. After DONE everybody coasts (presentation only: no rolls, no events).
 *
 * RNG draw accounting (binding):
 *   setup  (inside Play.snap's 'play:snap' child), in order: per receiver in slot order a route-clock jitter gauss 2
 *          (10) · per defender in Data.plays.defenders order a skill gauss 2 + a reaction gauss 2 (44) · the sack clock's
 *          snap jitter gauss 2 · the first rusher weighted 1 · six beat gaps float 1 each (always six) = 63.
 *   create / Live: the rng passed in is the Live's own child (Play.live forks 'play:live'); it is drawn only by
 *          in-play events, in EVENT ORDER: a free defender reaching the QB behind the line → escape roll 1 ·
 *          a PASS release → scatter gauss 2 (lateral) + gauss 2 (length) (a THROWAWAY draws nothing) · the ball
 *          passing within reachR of a defender under his reach → touch roll 1 (+ pick roll 1 on a touch; once per
 *          defender per throw) · the landing: a receiver within catchR → catch roll 1, then drop roll 1 (caught) or
 *          pick roll 1 (missed with a defender contesting) · no receiver but a defender within catchR → pick roll 1 ·
 *          a defender within tackleR of the ball carrier → broken-tackle roll 1 each time.
 *          The same sim, the same rng state and the same inputs at the same sim times give the same draws.
 *   ghost, classify, aim, frame, alignment, every helper: 0.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  var Util = RTG.Util, Tuning = RTG.Tuning;
  var Field = {};

  var clamp = Util.clamp;
  var FIELD_YARDS = 100;                 // goal line to goal line
  var RESULT_DECIMALS = 3;               // formatting precision of result numbers (not a balance constant)
  var COORD_MAX = 1000;                  // yd: any input coordinate is clamped here (garbage in, finite out)
  var MAX_SCAN = 200000;                 // points: a longer input array is read only this far
  var HISTORY = 90;                      // sub-steps of position history per receiver (1.5 s at 60 Hz ≥ field.man.maxTrail)
  var EPS = 1e-9;
  var PHASES = ['PRE_THROW', 'BALL_IN_AIR', 'AFTER_CATCH', 'SCRAMBLE', 'DONE'];
  var EVENTS = ['SNAP', 'RUN', 'RELEASE', 'TIP', 'INT', 'CATCH', 'DROP', 'INCOMPLETE', 'SACK', 'ESCAPE', 'SCRAMBLE', 'TACKLE', 'BROKEN_TACKLE', 'OUT_OF_BOUNDS', 'TD', 'THROWAWAY'];
  var GUN = { SHOTGUN: true, TRIPS: true, EMPTY: true };
  var WINDOW = 'window';                 // the route data's field name (the purity scan forbids the bare identifier)
  // receiver modes (internal)
  var M_ROUTE = 0, M_BREAK = 1, M_CARRY = 2, M_FREE = 3;

  Field.PHASES = PHASES;
  Field.EVENTS = EVENTS;

  /** Tuning.qb, read at call time so RTG.debug.tune edits apply. */
  function P() { return Tuning.qb; }
  function F() { return Tuning.qb.field; }
  function W() { return Tuning.qb.draw; }
  /** RTG.Data.plays. */
  function D() { return RTG.Data.plays; }
  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
  function nz(x) { return x === 0 ? 0 : x; }
  function rd(x) { return nz(Util.roundN(x, RESULT_DECIMALS)); }
  /** attribute → 0..1 */
  function ratio(a) { return clamp(num(a, 0), 0, P().attrMax) / P().attrMax; }
  function hyp(dx, dy) { return Math.sqrt(dx * dx + dy * dy); }
  function signed(n) { return (n > 0 ? '+' : '') + n; }
  function smooth01(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  /** Distance from point (px, py) to the segment (ax, ay)–(bx, by). */
  function segDist(ax, ay, bx, by, px, py) {
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, u = 0;
    if (l2 > EPS) u = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
    return hyp(ax + dx * u - px, ay + dy * u - py);
  }

  // ═══════════════════════════════ POLYLINES (0 draws; new arrays) ═══════════════════════════════

  /** One point → {x, y} with finite clamped numbers, or null. Accepts {x, y} objects and [x, y] pairs. */
  function cleanPoint(p) {
    if (!p || typeof p !== 'object') return null;
    var x = Array.isArray(p) ? p[0] : p.x, y = Array.isArray(p) ? p[1] : p.y;
    if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) return null;
    return { x: clamp(x, -COORD_MAX, COORD_MAX), y: clamp(y, -COORD_MAX, COORD_MAX) };
  }

  /**
   * A sanitised copy of a polyline: {x, y} points with finite numbers clamped to ±1000 yd, consecutive duplicates
   * dropped, thinned (first and last kept) to at most `max` points (default Tuning.qb.draw.maxPoints). Anything that is
   * not an array-like of points gives []. Idempotent. 0 draws.
   * @param {Array} points @param {number} [max] @returns {Array<{x:number, y:number}>}
   */
  Field.clean = function (points, max) {
    var out = [];
    if (!points || typeof points !== 'object' || typeof points.length !== 'number') return out;
    var n = Math.min(Math.max(0, Math.floor(num(points.length, 0))), MAX_SCAN), i;
    for (i = 0; i < n; i++) {
      var p = cleanPoint(points[i]);
      if (!p) continue;
      var last = out.length ? out[out.length - 1] : null;
      if (last && Math.abs(last.x - p.x) < 1e-9 && Math.abs(last.y - p.y) < 1e-9) continue;
      out.push(p);
    }
    max = Math.max(2, Math.floor(num(max, W().maxPoints)));
    if (out.length <= max) return out;
    var thin = [], stride = (out.length - 1) / (max - 1);
    for (i = 0; i < max; i++) thin.push(out[Math.min(out.length - 1, Math.round(i * stride))]);
    return thin;
  };

  /** Cumulative arc lengths of a polyline (cum[0] = 0). */
  function cumOf(pts) {
    var cum = new Array(pts.length), s = 0;
    if (pts.length) cum[0] = 0;
    for (var i = 1; i < pts.length; i++) { s += hyp(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); cum[i] = s; }
    return cum;
  }

  /** Arc length (yd) of a polyline of clean points. 0 draws. */
  Field.length = function (pts) {
    var s = 0;
    if (!pts) return 0;
    for (var i = 1; i < pts.length; i++) s += hyp(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return s;
  };

  /** The point at arc length s along pts (cum from cumOf), written into out. No allocation. */
  function pointAt(pts, cum, s, out) {
    var n = pts.length;
    if (!n) { out.x = 0; out.y = 0; return out; }
    if (n === 1 || s <= 0) { out.x = pts[0].x; out.y = pts[0].y; return out; }
    var total = cum[n - 1];
    if (s >= total) { out.x = pts[n - 1].x; out.y = pts[n - 1].y; return out; }
    var lo = 0, hi = n - 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
    var seg = cum[hi] - cum[lo], u = seg > EPS ? (s - cum[lo]) / seg : 0;
    out.x = pts[lo].x + (pts[hi].x - pts[lo].x) * u;
    out.y = pts[lo].y + (pts[hi].y - pts[lo].y) * u;
    return out;
  }

  /** A copy of the polyline cut at arc length len (the cut point is interpolated). 0 draws. */
  Field.truncate = function (pts, len) {
    var out = [];
    if (!pts || !pts.length) return out;
    len = Math.max(0, num(len, 0));
    out.push({ x: pts[0].x, y: pts[0].y });
    var s = 0;
    for (var i = 1; i < pts.length; i++) {
      var seg = hyp(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (s + seg >= len) {
        var u = seg > EPS ? (len - s) / seg : 0;
        if (u > EPS) out.push({ x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * u, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * u });
        return out;
      }
      s += seg;
      out.push({ x: pts[i].x, y: pts[i].y });
    }
    return out;
  };

  /**
   * The polyline resampled to points every `spacing` yd along its arc (the last point kept). The scene uses it on the
   * drawn points (Tuning.qb.draw.resampleYd). 0 draws.
   * @param {Array} points @param {number} [spacing] @returns {Array<{x:number, y:number}>}
   */
  Field.resample = function (points, spacing) {
    var pts = Field.clean(points, MAX_SCAN);
    if (pts.length < 2) return pts;
    spacing = Math.max(0.05, num(spacing, W().resampleYd));
    var cum = cumOf(pts), total = cum[cum.length - 1], out = [];
    spacing = Math.max(spacing, total / Math.max(1, W().maxPoints - 1));
    for (var s = 0; s < total - EPS; s += spacing) out.push(pointAt(pts, cum, s, { x: 0, y: 0 }));
    out.push({ x: pts[pts.length - 1].x, y: pts[pts.length - 1].y });
    return out;
  };

  /** A lightly smoothed copy (moving average of neighbours, the ends fixed), `passes` times (default 1). 0 draws. */
  Field.smooth = function (points, passes) {
    var pts = Field.clean(points, MAX_SCAN);
    passes = clamp(Math.floor(num(passes, 1)), 0, 8);
    for (var p = 0; p < passes && pts.length > 2; p++) {
      var next = [{ x: pts[0].x, y: pts[0].y }];
      for (var i = 1; i < pts.length - 1; i++) next.push({ x: (pts[i - 1].x + 2 * pts[i].x + pts[i + 1].x) / 4, y: (pts[i - 1].y + 2 * pts[i].y + pts[i + 1].y) / 4 });
      next.push({ x: pts[pts.length - 1].x, y: pts[pts.length - 1].y });
      pts = next;
    }
    return pts;
  };

  // ═══════════════════════════════ PHYSICS (0 draws) ═══════════════════════════════

  /** The QB's running speed (yd/s) from MOB. */
  Field.qbSpeed = function (attrs) { var S = F().qbSpeed; return S.base + S.perMob * ratio(attrs && attrs.MOB); };
  /** A receiver's speed off his route (yd/s) from his speed rating. */
  Field.recSpeed = function (speed) { var S = F().recSpeed; return S.base + S.perSpeed * ratio(speed); };
  /** A defender's speed (yd/s) from his position group and skill. */
  Field.defSpeed = function (pos, skill) { var S = F().defSpeed; return (S.base + S.perSkill * ratio(skill)) * num(S.pos[pos], 1); };
  /** The ball's speed along the line (yd/s): ARM and loft (a lob is slower). */
  Field.ballSpeed = function (attrs, loft) {
    var B = F().ballSpeed;
    return (B.base + B.perArm * ratio(attrs && attrs.ARM)) * (1 - B.loftSlow * clamp(num(loft, 0.5), 0, 1));
  };
  /** The arm's maximum flight length (yd of the line's arc). */
  Field.maxLen = function (attrs) { var M = F().maxLen; return M.base + M.perArm * ratio(attrs && attrs.ARM); };
  /**
   * The apex (yd over the release→catch chord) of a flight of `flight` seconds at `loft` (0 bullet … 1 lob; omitted → 0):
   * max(apexMin, g·T²/8) × (1 + lift × loft) — gravity sets the arc of the time in the air, and a lofted ball is put up
   * steeper on top of that (the touch that floats it over a linebacker).
   */
  Field.apex = function (flight, loft) {
    var H = F().height, f = num(flight, 0);
    return Math.max(H.apexMin, H.gravity * f * f / 8) * (1 + num(H.lift, 0) * clamp(num(loft, 0), 0, 1));
  };
  /** The ball's height (yd) at u ∈ [0, 1] along the path for an apex. */
  Field.heightAt = function (u, apex) {
    var H = F().height;
    u = clamp(num(u, 0), 0, 1);
    return H.release + (H.catch - H.release) * u + 4 * num(apex, 0) * u * (1 - u);
  };
  /**
   * The loft (0 bullet … 1 lob) for a draw speed in canvas-heights per second: ≥ draw.loft.fastHps → 0,
   * ≤ slowHps → 1, linear between. The scene calls it with the stroke's average speed.
   */
  Field.loftFor = function (hps) {
    var L = W().loft;
    hps = num(hps, (L.fastHps + L.slowHps) / 2);
    if (L.fastHps <= L.slowHps) return 0.5;
    return clamp((L.fastHps - hps) / (L.fastHps - L.slowHps), 0, 1);
  };
  /** The weather's penalty on a throw: wind above the free mph (more on a lofted ball), the kind, a frozen ball. */
  Field.weatherPenalty = function (wx, loft) {
    if (!wx) return 0;
    var Wx = P().weather, kind = wx.weather || 'clear';
    if (kind === 'dome') return 0;
    var wind = Math.max(0, num(wx.wind && wx.wind.speed, 0) - Wx.windFree) * Wx.windPerMph * (Wx.windLoftBase + Wx.windLoftPer * clamp(num(loft, 0), 0, 1));
    var cold = Math.max(0, Wx.coldBelowF - num(wx.tempF, 70)) * Wx.coldPer;
    return wind + num(Wx.byWeather[kind], 0) + cold;
  };

  /** Route-time scale for a receiver speed: waypoint times × this (fast → < 1). */
  function speedScale(speed) {
    var R = P().route;
    return R.speedBase / (R.speedBase + R.speedPer * (num(speed, 50) - 50));
  }
  Field.speedScale = speedScale;

  /**
   * Position of a receiver at time t along his path, written into out (piecewise linear through the waypoints,
   * extrapolated along the last segment; x held inside [xMin, xMax], y capped at capY). No allocation.
   */
  function pathInto(rec, t, out) {
    var p = rec.path, n = p.length;
    if (!n) { out.x = 0; out.y = 0; return out; }
    var x, y;
    if (t <= p[0].t) { x = p[0].x; y = p[0].y; }
    else {
      var done = false;
      for (var i = 1; i < n; i++) {
        if (t <= p[i].t) {
          var a = p[i - 1], b = p[i], u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
          x = a.x + (b.x - a.x) * u; y = a.y + (b.y - a.y) * u; done = true;
          break;
        }
      }
      if (!done) {
        var l = p[n - 1], k = n > 1 ? p[n - 2] : l, dt = l.t - k.t;
        if (dt <= 0) { x = l.x; y = l.y; }
        else { var over = (t - l.t) / dt; x = l.x + (l.x - k.x) * over; y = l.y + (l.y - k.y) * over; }
      }
    }
    out.x = clamp(x, num(rec.xMin, -Infinity), num(rec.xMax, Infinity));
    out.y = Math.min(num(rec.capY, Infinity), y);
    return out;
  }

  /** {x, y} of a sim receiver at time t (a copy; the scene's READ → snap slide and the tests use it). 0 draws. */
  Field.pathAt = function (rec, t) { return pathInto(rec, num(t, 0), { x: 0, y: 0 }); };

  // ═══════════════════════════════ THE FIELD AND THE PRE-SNAP PICTURE ═══════════════════════════════

  /**
   * The field in the play's frame: { sideL, sideR, centerX, goalY, endY, losY: 0 } — the sidelines from the ball's
   * hash (−1 left / 0 middle / 1 right; the hash offset by venue), the goal line 100 − yl downfield. 0 draws.
   */
  Field.frame = function (yl, hash, venue) {
    var T = F(), hy = num(T.hash[venue], T.hash.COLLEGE);
    var c = -clamp(Math.round(num(hash, 0)), -1, 1) * hy;
    var goalY = FIELD_YARDS - clamp(Math.round(num(yl, 25)), 1, FIELD_YARDS - 1);
    return { sideL: rd(c - T.halfWidth), sideR: rd(c + T.halfWidth), centerX: rd(c), goalY: goalY, endY: goalY + T.endZone, losY: 0 };
  };

  /** x held a margin inside the sidelines. */
  function inside(x, field, margin) { return clamp(x, field.sideL + margin, field.sideR - margin); }
  function sideOf(x, sign) { return x < 0 ? -1 : (x > 0 ? 1 : sign); }

  /** A receiver's depth at the line for his slot and formation. */
  function recDepth(slot, formationId) {
    var A = F().align, gun = !!GUN[formationId];
    if (slot === 'RB') return gun ? A.rbGun : A.rbUnder;
    if (slot === 'SLOT') return A.slotY;
    if (slot === 'TE') return A.teY;
    return A.wrY;
  }

  /**
   * The five receivers aligned in a formation, held inside the field: [{slot, name, skill, speed, x0, y0, side}]
   * (x0 = the formation's split × sign, pulled in to sideMargin from a sideline).
   */
  Field.alignReceivers = function (roster, formationId, sign, field) {
    var f = D().formations[formationId] || D().formations.SHOTGUN, m = F().sideMargin;
    var out = [];
    for (var i = 0; i < roster.length; i++) {
      var wr = roster[i], x0 = num(f[wr.slot], 0) * sign;
      if (field) x0 = inside(x0, field, m);
      out.push({ slot: wr.slot, name: wr.name, skill: wr.skill, speed: wr.speed, x0: rd(x0), y0: recDepth(wr.slot, formationId), side: sideOf(x0, sign) });
    }
    return out;
  };

  /**
   * The eleven in the pre-snap picture of a LOOK (the shown coverage's safeties, press, box and blitz tell), against
   * the shotgun receivers: [{id, x, y, pos}] in Data.plays.defenders order. The box count is exact: the look's box
   * defenders stand inside |x| ≤ align.boxX, y ≤ align.boxY. 0 draws.
   */
  function alignDefense(look, recs, sign, field) {
    var A = F().align, ids = D().defenders, pos = D().defenderPos;
    var box = num(look && look.box, 6), extras = box - 6, press = !!(look && look.press), two = look && look.safeties === 2, blitz = !!(look && look.showBlitz);
    var at = {}, i;
    for (i = 0; i < recs.length; i++) at[recs[i].slot] = recs[i].x;
    function sx(xs) { return xs * sign; }
    function over(x) { return x - sideOf(x, sign) * A.cbInside; }
    var cbY = press ? A.cbPress : (box <= 5 ? A.cbWayOff : A.cbOff);
    var o = {};
    o.CB1 = { x: over(num(at.WR1, -22 * sign)), y: cbY };
    o.CB2 = { x: over(num(at.WR2, 22 * sign)), y: cbY };
    var apex = extras >= 2 || (extras >= 1 && two) || blitz;
    o.NB = apex ? { x: sx(A.apexXs), y: blitz ? A.creepY : A.apexY } : { x: over(num(at.SLOT, 12 * sign)), y: press ? A.nbPress : A.nbOff };
    if (two) {
      var sy = box <= 5 ? A.safetyBackedUp : A.safetyDeep;
      o.S1 = { x: field.centerX + sx(-A.safetyTwoXs), y: sy };
      o.S2 = { x: field.centerX + sx(A.safetyTwoXs), y: sy };
    } else {
      o.S1 = { x: field.centerX * 0.5, y: A.safetyOneY };
      o.S2 = extras >= 1 ? { x: sx(A.boxSafetyXs), y: A.boxSafetyY } : { x: sx(A.rolledXs), y: A.rolledY };
    }
    o.LB1 = extras < 0 ? { x: 0, y: A.lbDeepY } : { x: sx(A.lbXs), y: A.lbY };
    o.LB2 = { x: sx(-A.lbXs), y: A.lbY };
    for (i = 0; i < 4; i++) o['DL' + (i + 1)] = { x: sx(A.dlX[i]), y: A.dlY };
    var out = [];
    for (i = 0; i < ids.length; i++) {
      var p = o[ids[i]] || { x: 0, y: 5 };
      out.push({ id: ids[i], x: rd(inside(p.x, field, 1)), y: rd(p.y), pos: pos[ids[i]] });
    }
    return out;
  }

  /**
   * ctx.alignment — the PRE-SNAP picture of the SHOWN look, so the READ screen draws the engine's alignment:
   * { qb: {x, y}, receivers: [{slot, x, y}] (the shotgun), linemen: [{x, y}] (5), defenders: [{id, x, y, pos}] (11) }.
   * 0 draws.
   * @param {Object} look ctx.look @param {Array} receivers ctx.receivers (x0 aligned) @param {number} sign @param {Object} field
   */
  Field.alignment = function (look, receivers, sign, field) {
    var A = F().align, recs = [], i;
    for (i = 0; i < receivers.length; i++) recs.push({ slot: receivers[i].slot, x: receivers[i].x0, y: recDepth(receivers[i].slot, 'SHOTGUN') });
    var linemen = [];
    for (i = 0; i < 5; i++) linemen.push({ x: rd((i - 2) * A.olX), y: A.olY });
    return { qb: { x: 0, y: A.qbGun }, receivers: recs, linemen: linemen, defenders: alignDefense(look, recs, sign, field) };
  };

  // ═══════════════════════════════ THE SNAP: A PASS PLAY'S CAST ═══════════════════════════════

  /** The slot with the quickest route (smallest base window.open) among a play's assignments. */
  function quickestSlot(play) {
    var routes = D().routes, best = null, bestT = Infinity;
    for (var i = 0; i < play.assignments.length; i++) {
      var a = play.assignments[i], rt = routes[a.route];
      if (rt && rt[WINDOW].open < bestT) { bestT = rt[WINDOW].open; best = a.slot; }
    }
    return best;
  }

  /**
   * A receiver's absolute path: the route's waypoints (t × speedScale + the snap's clock jitter; x from the alignment
   * toward his sideline; y downfield, capped at capY) plus his depth at the line fading out over route.releaseT (the gun
   * back starts 5 yd deep). Exact piecewise-linear waypoints; x is held inside the field when sampled (xMin / xMax).
   */
  function buildPath(route, wr, scale, jitter, capY) {
    var R = P().route, rel = Math.max(0.1, num(R.releaseT, 1)), y0 = num(wr.y0, 0);
    var times = [], i;
    for (i = 0; i < route.path.length; i++) {
      var t = i === 0 ? 0 : Math.max(route.path[i].t * scale + jitter, (times.length ? times[times.length - 1] : 0) + 0.02);
      times.push(t);
    }
    // the depth fade adds a kink at rel
    var pts = [];
    function routeAt(t) {                       // the route's own (x, y) at time t on the jittered clock
      var n = route.path.length;
      if (t <= 0) return { x: route.path[0].x, y: route.path[0].y };
      for (var k = 1; k < n; k++) {
        if (t <= times[k]) {
          var u = (t - times[k - 1]) / Math.max(EPS, times[k] - times[k - 1]);
          return { x: route.path[k - 1].x + (route.path[k].x - route.path[k - 1].x) * u, y: route.path[k - 1].y + (route.path[k].y - route.path[k - 1].y) * u };
        }
      }
      return { x: route.path[n - 1].x, y: route.path[n - 1].y };
    }
    var all = times.slice();
    if (y0 !== 0 && rel < times[times.length - 1]) all.push(rel);
    all.sort(function (a, b) { return a - b; });
    for (i = 0; i < all.length; i++) {
      if (i && Math.abs(all[i] - all[i - 1]) < 1e-6) continue;
      var t2 = all[i], r = routeAt(t2);
      var fade = y0 * Math.max(0, 1 - t2 / rel);
      pts.push({ t: rd(t2), x: rd(wr.x0 + wr.side * r.x), y: rd(Math.min(capY, r.y + fade)) });
    }
    return pts;
  }

  /**
   * Build a pass play's cast for the snap (Play.snap calls it with its child rng; draws in the file header: 63).
   * Returns { field, receivers, defenders, rushers, linemen, qbStart, qbDrop, sackAt, fit, hot, checkdown }.
   *   receivers: [{slot, name, skill, speed, x0, y0, side, route, family, path: [{t, x, y}], capY, xMin, xMax, key: {t, x, y}, hot, checkdown}]
   *   defenders: [{id, pos, role, man, zone: {x, y, r}|null, speed, skill, reach, react, trail, cushion, x0, y0, deep}]
   *   rushers:   [{defId, lane, beatAt, line: {x, y}, pocket: {x, y}}] (beatAt ascending)
   */
  Field.setup = function (ctx, play, r) {
    var T = P(), Fx = F(), routes = D().routes, cov = D().coverages[ctx.real], sit = ctx.situation;
    var field = Field.frame(sit.yl, ctx.hash, ctx.venue);
    var capY = field.goalY + T.route.endZoneCap;
    var aligned = Field.alignReceivers(ctx.team.wr, play.formation, ctx.sign, field);
    var bySlot = Util.indexBy(play.assignments, 'slot');
    var hotSlot = ctx.real === 'BLITZ' ? quickestSlot(play) : null;
    var fit = play.vs && (play.vs[ctx.real] === 'GOOD' || play.vs[ctx.real] === 'BAD') ? play.vs[ctx.real] : 'OK';
    var receivers = [], checkdown = null, i;

    // 1. receivers: route clock jitter (2 draws each)
    for (i = 0; i < aligned.length; i++) {
      var wr = aligned[i], a = bySlot[wr.slot], route = a && routes[a.route];
      if (!route) throw new Error('Play.snap: ' + play.id + ' has no route for ' + wr.slot);
      var scale = speedScale(wr.speed);
      var jitter = r.gauss(0, T.route.jitterSd);                                          // draws 1, 2 per receiver
      var rec = {
        slot: wr.slot, name: wr.name, skill: wr.skill, speed: wr.speed, x0: wr.x0, y0: wr.y0, side: wr.side,
        route: route.id, family: route.family, path: buildPath(route, wr, scale, jitter, capY), capY: capY,
        xMin: rd(field.sideL + Fx.inbounds), xMax: rd(field.sideR - Fx.inbounds),
        key: null, hot: wr.slot === hotSlot, checkdown: false
      };
      var kt = (route[WINDOW].open + route[WINDOW].close) / 2 * scale + jitter, kp = pathInto(rec, kt, { x: 0, y: 0 });
      rec.key = { t: rd(kt), x: rd(kp.x), y: rd(kp.y) };                                  // where the route is "there"
      if (wr.slot === 'RB' && route.family === 'SHORT') { rec.checkdown = true; checkdown = wr.slot; }
      receivers.push(rec);
    }
    if (!checkdown) {                                  // no back on a short route: the earliest short route stands in
      var earliest = Infinity;
      for (i = 0; i < receivers.length; i++) {
        var rt = routes[receivers[i].route];
        if (receivers[i].family === 'SHORT' && rt[WINDOW].open < earliest) { earliest = rt[WINDOW].open; checkdown = receivers[i].slot; }
      }
      for (i = 0; i < receivers.length; i++) receivers[i].checkdown = receivers[i].slot === checkdown;
    }
    var recBySlot = Util.indexBy(receivers, 'slot');

    // 2. defenders: skill gauss 2 + reaction gauss 2 each
    var ids = D().defenders, posOf = D().defenderPos, roles = cov.roles || {};
    var start = ctx.alignment && ctx.alignment.defenders ? ctx.alignment.defenders
      : Field.alignment(ctx.look, Field.alignReceivers(ctx.team.wr, 'SHOTGUN', ctx.sign, field), ctx.sign, field).defenders;
    var RC = Fx.react, MN = Fx.man, Z = Fx.zone, FT = Fx.fit;
    var defenders = [];
    for (i = 0; i < ids.length; i++) {
      var id = ids[i], pos = posOf[id], role = roles[id] || { role: 'RUSH', man: null, zone: null };
      var unit = pos === 'DL' ? ctx.opp.dl : (pos === 'LB' ? (ctx.opp.dl + ctx.opp.db) / 2 : ctx.opp.db);
      var skill = Util.roundClamp(unit + r.gauss(0, Fx.defSkillSd), 0, T.attrMax);        // draws 1, 2
      var rj = r.gauss(0, RC.sd);                                                           // draws 3, 4
      var react = (RC.base + RC.perSkill * ratio(skill)) * (role.role === 'ROBBER' ? RC.robber : (role.role === 'SPY' ? RC.spy : 1)) * num(FT.react[fit], 1) + rj;
      var d = {
        id: id, pos: pos, role: role.role, man: role.man || null, zone: null,
        speed: rd(Field.defSpeed(pos, skill)), skill: skill, reach: num(Fx.reach[pos], 2.8),
        react: rd(Math.max(RC.min, react)), trail: 0, cushion: 0,
        x0: start[i] ? start[i].x : 0, y0: start[i] ? start[i].y : 5, deep: false
      };
      if (role.role === 'MAN') {
        var mr = recBySlot[role.man];
        var edge = mr ? (mr.skill - skill) / T.attrMax : 0;
        d.trail = rd(clamp(MN.trail * num(FT.trail[fit], 1) * clamp(1 + MN.edgeW * edge, 0.4, 2), MN.minTrail, MN.maxTrail));
        d.cushion = cov.look.press ? MN.press : MN.off;
      }
      if (role.zone) {
        var zx = role.zone.fw * field.centerX + ctx.sign * role.zone.xs, zy = Math.min(role.zone.y, field.endY - 1.5), zr = role.zone.r;
        var sh = num(FT.shade[fit], 0);
        if (sh !== 0 && role.role === 'ZONE') {        // the call: the landmark leans toward (BAD) / away from (GOOD) the play's nearest route spot
          var best = null, bd = zr * FT.keyR;
          for (var j = 0; j < receivers.length; j++) {
            var kr = receivers[j];
            if (kr.checkdown) continue;
            var dk = hyp(kr.key.x - zx, kr.key.y - zy);
            if (dk <= bd) { bd = dk; best = kr.key; }
          }
          if (best) { zx += (best.x - zx) * sh; zy += (best.y - zy) * sh; }
        }
        zx = inside(zx, field, 1); zy = clamp(zy, 1, field.endY - 1);
        d.zone = { x: rd(zx), y: rd(zy), r: zr };
        d.deep = zy >= Z.deepY;
      }
      defenders.push(d);
    }

    // 3. the rush: the sack clock's snap jitter (2), the first rusher (1), six gaps (6)
    var PR = T.pressure, RU = Fx.rush;
    var sackAt = clamp(ctx.pressure.sackAt + r.gauss(0, PR.snapSigma), PR.min, PR.max);  // draws
    var rushIdx = [];
    for (i = 0; i < defenders.length; i++) if (defenders[i].role === 'RUSH') rushIdx.push(i);
    var first = rushIdx.length ? r.weighted(rushIdx, function (k) { return defenders[k].pos === 'DL' ? 1 : RU.blitzFirst; }) : null;   // draw
    var gaps = [];
    for (i = 0; i < 6; i++) gaps.push(r.float(RU.gapMin, RU.gapMax));                     // 6 draws, always
    var order = first === null ? [] : [first].concat(rushIdx.filter(function (k) { return k !== first; }));
    var drop = Fx.qbDrop, dropY = drop.depth, gun = !!GUN[play.formation];
    var dropT = (gun ? drop.gunT : drop.underT) + (play.tags && play.tags.indexOf('PA') >= 0 ? drop.paT : 0);
    var rushers = [], beat = sackAt - RU.approach;
    for (i = 0; i < order.length; i++) {
      var dd = defenders[order[i]];
      if (i > 0) beat += gaps[Math.min(gaps.length - 1, i - 1)];
      rushers.push({
        defId: dd.id, lane: clamp(Math.round(dd.x0 / RU.laneYd), -2, 2), beatAt: rd(Math.max(RU.engageT, beat)),
        line: { x: dd.x0, y: RU.lineY }, pocket: { x: rd(dd.x0 * RU.converge), y: rd(dropY + RU.pocketGap) }
      });
    }
    var A = Fx.align, linemen = [];
    for (i = 0; i < 5; i++) linemen.push({ x: rd((i - 2) * A.olX), y: A.olY });
    return {
      field: field, receivers: receivers, defenders: defenders, rushers: rushers, linemen: linemen,
      qbStart: { x: 0, y: gun ? A.qbGun : A.qbUnder }, qbDrop: { y: dropY, t: rd(dropT) },
      sackAt: rd(sackAt), fit: fit, hot: hotSlot, checkdown: checkdown
    };
  };

  /**
   * Pre-run a pass play with no QB input and no rolls (0 draws) and record each receiver's separation curve, in the
   * sim's receiver order: [{sep: [samples every field.sampleDt over 0..ghostT], peak, peakAt, from, to}] (the peak is
   * searched from field.ghostFrom on; {from, to} = where the separation stays ≥ feedback.plateau × peak around it).
   * Play.snap stores each as sim.receivers[i].ghost; the result's timing label reads it.
   */
  Field.ghost = function (sim) {
    var T = F(), live = Field.create(sim, null, { ghost: true });
    var every = Math.max(1, Math.round(T.sampleDt / T.dt)), n = Math.round(T.ghostT / T.sampleDt);
    var nR = live.receivers.length, curves = [], i, k;
    for (i = 0; i < nR; i++) curves.push([rd(live.receivers[i].sep)]);
    for (k = 1; k <= n; k++) {
      live._steps(every);
      for (i = 0; i < nR; i++) curves[i].push(rd(live.receivers[i].sep));
    }
    var out = [], frac = P().feedback.plateau;
    var k0 = Math.min(n, Math.round(T.ghostFrom / T.sampleDt));
    for (i = 0; i < nR; i++) {
      var s = curves[i], best = k0;
      for (k = k0; k < s.length; k++) if (s[k] > s[best]) best = k;
      var thr = frac * s[best], from = best, to = best;
      while (from > 0 && s[from - 1] >= thr) from--;
      while (to < s.length - 1 && s[to + 1] >= thr) to++;
      out.push({ sep: s, peak: s[best], peakAt: rd(best * T.sampleDt), from: rd(from * T.sampleDt), to: rd(to * T.sampleDt) });
    }
    return out;
  };

  // ═══════════════════════════════ THE LIVE PLAY ═══════════════════════════════

  /**
   * Create the Live for a pass sim (Play.live forks the rng and calls this; opts.ghost = no QB, no rolls, no rng).
   * Every object below is allocated once and MUTATED IN PLACE by step, so the scene reads them every frame:
   *   t (sim s since the snap), phase ('PRE_THROW' | 'BALL_IN_AIR' | 'AFTER_CATCH' | 'SCRAMBLE' | 'DONE'),
   *   qb {x, y, vx, vy, hasBall, down (sacked / tackled), escaped (count)},
   *   receivers[5] {slot, x, y, vx, vy, sep (yd to the nearest defender who is not rushing), open (0..1 via
   *     field.openSep), target (the pass's target, from the release), shown (t ≥ revealAt: the ring may show)},
   *   defenders[11] {id, pos, role, man, x, y, vx, vy, blocked (a rusher still held by the line)}, linemen[5] {x, y},
   *   ball: null until the release, then ONE object {x, y, h (yd), u (0..1 along the path), path (the flown path, after
   *     scatter), drawn (the line as drawn, from the QB, untruncated), landing {x, y}, releaseT, arriveT, loft, kind
   *     'PASS' | 'THROWAWAY', caught, deadAt (s, or −1), target (slot | null), speed (yd/s), length (yd), apex (yd),
   *     tipped, tooLong, preview (the classify colour at the release)},
   *   carrier (null | 'QB' | slot | defender id after a pick), events [{t, kind, who, x, y}] (appended),
   *   pressure (0..1: the nearest rusher's closeness; a held one counts field.heldPressure of it), previewShown
   *   (IQ ≥ draw.previewIq), rest (s: the carried remainder step has not simulated yet — the scene may draw
   *   x + vx × rest as a presentation offset so slow motion stays smooth between sub-steps), field, sim —
   *   and step(dt), classify(points, loft), aim(slot, loft), setRun(points),
   *   throwAlong(points, loft), throwAway(), result(), plan(), snapshot().
   * @param {Object} sim PlaySim (a pass play) @param {RNG|null} rng the Live's own child rng @param {{ghost?: boolean}} [opts]
   * @returns {Object} Live
   */
  Field.create = function (sim, rng, opts) {
    var ghost = !!(opts && opts.ghost);
    var T = F(), DT = T.dt;
    var ctx = sim.ctx, attrs = ctx.qb.attrs, sit = ctx.situation, fld = sim.field;
    var roster = sim.receivers, defs = sim.defenders;
    var nR = roster.length, nD = defs.length, i, j;
    var qbSpd = Field.qbSpeed(attrs), maxLen = Field.maxLen(attrs);
    var dropY = sim.qbDrop.y, dropT = Math.max(0.05, sim.qbDrop.t), qbX0 = sim.qbStart.x, qbY0 = sim.qbStart.y;
    var revealAt = num(sim.revealAt, 0);
    var tmp = { x: 0, y: 0 }, tmp2 = { x: 0, y: 0 }, lastMargin = 0, lastBest = -1, lastBestM = -Infinity;

    var live = {
      t: 0, phase: 'PRE_THROW',
      qb: { x: qbX0, y: qbY0, vx: 0, vy: 0, hasBall: true, down: false, escaped: 0 },
      receivers: new Array(nR), defenders: new Array(nD), linemen: new Array(5),
      ball: null, carrier: null, events: [], pressure: 0, rest: 0,
      previewShown: num(attrs.IQ, 0) >= W().previewIq,
      field: fld, sim: sim
    };

    // ── receivers ──
    var recSpd = new Array(nR), recMode = new Array(nR), recBreakAt = new Array(nR), recBreakSpd = new Array(nR);
    var hist = new Float64Array(nR * HISTORY * 2);
    for (i = 0; i < nR; i++) {
      pathInto(roster[i], 0, tmp);
      live.receivers[i] = { slot: roster[i].slot, x: tmp.x, y: tmp.y, vx: 0, vy: 0, sep: 0, open: 0, target: false, shown: revealAt <= 0 };
      recSpd[i] = Field.recSpeed(roster[i].speed);
      recMode[i] = M_ROUTE; recBreakAt[i] = Infinity; recBreakSpd[i] = recSpd[i];
      for (j = 0; j < HISTORY; j++) { hist[(i * HISTORY + j) * 2] = tmp.x; hist[(i * HISTORY + j) * 2 + 1] = tmp.y; }
    }
    var slotIdx = {};
    for (i = 0; i < nR; i++) slotIdx[roster[i].slot] = i;

    // ── defenders ──
    var dS = new Array(nD), rushBy = {};
    for (i = 0; i < sim.rushers.length; i++) rushBy[sim.rushers[i].defId] = sim.rushers[i];
    for (j = 0; j < nD; j++) {
      var dd = defs[j], rr = rushBy[dd.id] || null;
      live.defenders[j] = { id: dd.id, pos: dd.pos, role: dd.role, man: dd.man, x: dd.x0, y: dd.y0, vx: 0, vy: 0, blocked: !!rr };
      dS[j] = {
        role: dd.role, speed: dd.speed, skill: dd.skill, reach: dd.reach, react: dd.react,
        trailSteps: Math.min(HISTORY - 1, Math.round(num(dd.trail, 0) / DT)), cushion: num(dd.cushion, 0),
        manIdx: dd.man && slotIdx[dd.man] !== undefined ? slotIdx[dd.man] : -1,
        zx: dd.zone ? dd.zone.x : dd.x0, zy: dd.zone ? dd.zone.y : dd.y0, zr: dd.zone ? dd.zone.r : 0, deep: !!dd.deep,
        x0: dd.x0, y0: dd.y0,
        held: !!rr, beatAt: rr ? rr.beatAt : Infinity,
        lineX: rr ? rr.line.x : dd.x0, lineY: rr ? rr.line.y : dd.y0, pocketX: rr ? rr.pocket.x : 0, pocketY: rr ? rr.pocket.y : dropY,
        ballAt: Infinity, chaseAt: Infinity, shedUntil: -1, rolled: false, minD: -1, minH: 0,
        backTurned: dd.role === 'MAN' || !!dd.deep                 // man coverage and the deep zones run with their backs to the ball
      };
    }
    var firstBeat = sim.rushers.length ? sim.rushers[0].beatAt : Infinity;

    // ── linemen: each blocks the nearest rusher (greedy in beat order) ──
    var olAssign = [-1, -1, -1, -1, -1], olHomeX = new Array(5), olHomeY = new Array(5);
    for (i = 0; i < 5; i++) {
      live.linemen[i] = { x: sim.linemen[i].x, y: sim.linemen[i].y };
      olHomeX[i] = sim.linemen[i].x * T.rush.olNarrow; olHomeY[i] = dropY + T.rush.pocketBack;
    }
    for (i = 0; i < sim.rushers.length; i++) {
      var ri = -1;
      for (j = 0; j < nD; j++) if (defs[j].id === sim.rushers[i].defId) ri = j;
      if (ri < 0) continue;
      var bestOl = -1, bestD = Infinity;
      for (var m = 0; m < 5; m++) {
        if (olAssign[m] >= 0) continue;
        var dxo = Math.abs(sim.linemen[m].x - defs[ri].x0);
        if (dxo < bestD) { bestD = dxo; bestOl = m; }
      }
      if (bestOl >= 0) olAssign[bestOl] = ri;
    }

    // ── the QB's run, the ball, the log, the clock ──
    var runPts = null, runCum = null, runLen = 0, runS = 0, runSpeed = 0, qbFree = false;
    var bPts = null, bCum = null, bLen = 0, bS = 0, bSpeed = 0, bApex = 0, bTarget = -1, bArrive = 0;   // bArrive: the landing's sim time (unrounded)
    var rel = null;                          // release facts for the result (pressure, running, scatter sd, …)
    var k = 0, acc = 0, result = null, endInfo = null, returnUntil = -1, tipAt = -1, carryPauseUntil = -1;
    var log = { runs: [], pass: null, away: null };

    function addEvent(kind, who, x, y) {
      if (ghost) return;
      live.events.push({ t: rd(live.t), kind: kind, who: who === undefined ? null : who, x: rd(x), y: rd(y) });
    }

    // ── movement primitives (no allocation) ──
    /** Kinematic placement: velocity from the displacement. */
    function place(o, x, y) { o.vx = (x - o.x) / DT; o.vy = (y - o.y) / DT; o.x = x; o.y = y; }
    /** Decelerate to a stop at the field's accel. */
    function brake(o) {
      var v = hyp(o.vx, o.vy), dv = T.accel * DT;
      if (v <= dv) { o.vx = 0; o.vy = 0; return; }
      var f = (v - dv) / v;
      o.vx *= f; o.vy *= f; o.x += o.vx * DT; o.y += o.vy * DT;
    }
    /** Steer toward (tx, ty) at up to vmax; arrive = slow into the spot. */
    function steer(o, tx, ty, vmax, arrive, accel, gain) {
      var dx = tx - o.x, dy = ty - o.y, d = hyp(dx, dy), acc2 = accel || T.accel;
      // arrive: never faster than he can stop in the distance left (bounded deceleration), nor than gain × distance
      var want = arrive ? Math.min(vmax, Math.sqrt(2 * acc2 * T.brakeFrac * d), d * (gain || T.arriveGain)) : vmax;
      var wx = d > EPS ? dx / d * want : 0, wy = d > EPS ? dy / d * want : 0;
      var ax = wx - o.vx, ay = wy - o.vy, a = hyp(ax, ay), amax = acc2 * DT;
      if (a > amax) { ax *= amax / a; ay *= amax / a; }
      o.vx += ax; o.vy += ay;
      o.x += o.vx * DT; o.y += o.vy * DT;
    }
    /**
     * Track a moving point: desired velocity = its velocity + gain × the error (capped at vmax), so a steady tracker has
     * no lag of its own (a man defender's lag is exactly his trail; a zone defender sits where his zone puts him).
     */
    function track(o, tx, ty, tvx, tvy, vmax) {
      var g = T.arriveGain, wx = tvx + (tx - o.x) * g, wy = tvy + (ty - o.y) * g, w = hyp(wx, wy);
      if (w > vmax) { wx *= vmax / w; wy *= vmax / w; }
      var ax = wx - o.vx, ay = wy - o.vy, a = hyp(ax, ay), amax = T.accel * DT;
      if (a > amax) { ax *= amax / a; ay *= amax / a; }
      o.vx += ax; o.vy += ay;
      o.x += o.vx * DT; o.y += o.vy * DT;
    }
    /**
     * Pursue a moving target: aim at the earliest point he can meet it (|c + v·τ − o| = vmax·τ), at most pursueLead
     * ahead; when no meeting exists (a faster carrier running away) aim pursueLead ahead of him (the angle).
     */
    function pursue(o, c, vmax) {
      var rx = c.x - o.x, ry = c.y - o.y, a = c.vx * c.vx + c.vy * c.vy - vmax * vmax, b = 2 * (rx * c.vx + ry * c.vy), cc = rx * rx + ry * ry;
      var tau = T.pursueLead;
      if (Math.abs(a) < EPS) { if (b < -EPS) tau = Math.min(tau, -cc / b); }
      else {
        var disc = b * b - 4 * a * cc;
        if (disc >= 0) {
          var sq = Math.sqrt(disc), t1 = (-b - sq) / (2 * a), t2 = (-b + sq) / (2 * a), tm = Infinity;
          if (t1 > 0) tm = t1;
          if (t2 > 0 && t2 < tm) tm = t2;
          if (tm < tau) tau = tm;
        }
      }
      steer(o, c.x + c.vx * tau, c.y + c.vy * tau, vmax, false);
    }
    /** The ball carrier: upfield, bending away from defenders and the sidelines. */
    function carry(o, vmax, returning) {
      var E = T.evade, dx = 0, dy = returning ? -1 : 1;
      for (var di = 0; di < nD; di++) {
        var d = live.defenders[di];
        if (returning || live.t < dS[di].shedUntil) continue;
        var ex = o.x - d.x, ey = o.y - d.y, dist = hyp(ex, ey);
        if (dist > E.r || dist < EPS || d.y < o.y - 1) continue;
        var w = (E.r - dist) / E.r * E.w;
        dx += ex / dist * w; dy += ey / dist * w * E.upW;
      }
      if (!returning) {
        if (o.x - fld.sideL < E.sideR) dx += (E.sideR - (o.x - fld.sideL)) / E.sideR;
        if (fld.sideR - o.x < E.sideR) dx -= (E.sideR - (fld.sideR - o.x)) / E.sideR;
        if (dy < E.minUp) dy = E.minUp;
      }
      var n = hyp(dx, dy) || 1;
      steer(o, o.x + dx / n * E.look, o.y + dy / n * E.look, vmax, false);
    }

    function routeAt(i2, t, out) { return pathInto(roster[i2], t, out); }

    // ── the QB ──
    function moveQB(t) {
      var q = live.qb;
      if (q.down) { brake(q); return; }
      if (q.hasBall && runPts) {
        runSpeed = Math.min(qbSpd, runSpeed + T.accel * DT);
        runS += runSpeed * DT;
        if (runS >= runLen) { runS = runLen; pointAt(runPts, runCum, runLen, tmp); place(q, tmp.x, tmp.y); runPts = null; return; }
        pointAt(runPts, runCum, runS, tmp); place(q, tmp.x, tmp.y);
        return;
      }
      if (q.hasBall && live.phase === 'SCRAMBLE') { carry(q, qbSpd, false); return; }
      if (q.hasBall && !qbFree) {                 // the default drop
        var f = Math.min(1, t / dropT);
        place(q, qbX0, qbY0 + (dropY - qbY0) * f);
        return;
      }
      brake(q);
    }

    // ── the receivers ──
    function moveReceivers(t) {
      for (var r2 = 0; r2 < nR; r2++) {
        var o = live.receivers[r2];
        if (recMode[r2] === M_ROUTE && t >= recBreakAt[r2] && live.ball) {
          recMode[r2] = M_BREAK;
          recBreakSpd[r2] = Math.max(recSpd[r2], hyp(o.vx, o.vy));
        }
        if (recMode[r2] === M_ROUTE) { routeAt(r2, t, tmp); place(o, tmp.x, tmp.y); }
        else if (recMode[r2] === M_BREAK) {
          // he paces to the landing spot so he gets there WITH the ball (a catch in stride — the pace classify / aim
          // assume), not early to a dead stop: a ball led onto his route is caught on the run
          var lx = live.ball.landing.x, ly = live.ball.landing.y, left = bArrive - t;
          steer(o, lx, ly, left > DT ? Math.min(recBreakSpd[r2], hyp(lx - o.x, ly - o.y) / left) : recBreakSpd[r2], false, T.recAccel);
        }
        else if (recMode[r2] === M_CARRY) carry(o, recSpd[r2] * T.carry.speedMul * (t < carryPauseUntil ? T.carry.pauseMul : 1), false);
        else if (live.phase === 'AFTER_CATCH' && carrierObj()) {   // the others drift toward the play (presentation: nobody blocks)
          var c = carrierObj();
          steer(o, c.x + (o.x < c.x ? -T.carry.escortX : T.carry.escortX), c.y + T.carry.escortY, recSpd[r2] * T.carry.escortMul, true);
        } else brake(o);
      }
      var slotK = k % HISTORY;
      for (r2 = 0; r2 < nR; r2++) { hist[(r2 * HISTORY + slotK) * 2] = live.receivers[r2].x; hist[(r2 * HISTORY + slotK) * 2 + 1] = live.receivers[r2].y; }
    }

    // ── the defence ──
    function carrierObj() {
      var c = live.carrier;
      if (c === 'QB') return live.qb;
      if (c !== null && slotIdx[c] !== undefined) return live.receivers[slotIdx[c]];
      return null;
    }
    function moveDefenders(t) {
      var q = live.qb, Z = T.zone, phase = live.phase, carrier = carrierObj();
      var blend = t < T.rotateS ? smooth01(t / T.rotateS) : 1;
      for (var d2 = 0; d2 < nD; d2++) {
        var o = live.defenders[d2], s = dS[d2];
        var vmax = t < s.shedUntil ? s.speed * T.shedSlow : s.speed;
        if (s.held && (t >= s.beatAt || (phase === 'SCRAMBLE' && t >= s.chaseAt))) { s.held = false; o.blocked = false; }
        // 1. the ball carrier (after a catch, on a scramble)
        if (carrier && (phase === 'AFTER_CATCH' || phase === 'SCRAMBLE') && t >= s.chaseAt && !s.held) { pursue(o, carrier, vmax * T.pursueBurst); continue; }
        // 2. the ball in the air: jump the lane where he can beat the ball to it under his reach, else the landing spot
        if (phase === 'BALL_IN_AIR' && t >= s.ballAt && !s.held) {
          if (!s.rolled && live.ball.kind === 'PASS' && laneSpot(o, s, tmp2)) steer(o, tmp2.x, tmp2.y, vmax, true, 0, T.breakGain);
          else steer(o, live.ball.landing.x, live.ball.landing.y, vmax, true, 0, T.breakGain);
          continue;
        }
        // 3. the role
        var tx, ty, tvx = 0, tvy = 0, role = s.role;
        if (role === 'RUSH') {
          if (s.held) {
            var f = t < T.rush.engageT ? 0 : clamp((t - T.rush.engageT) / Math.max(0.1, s.beatAt - T.rush.engageT), 0, 1);
            tx = s.lineX + (s.pocketX - s.lineX) * f; ty = s.lineY + (s.pocketY - s.lineY) * f;
            steer(o, tx, ty, vmax, true);
          } else if (q.hasBall || phase === 'PRE_THROW') pursue(o, q, vmax);
          else steer(o, q.x, q.y + T.rush.olGap, vmax, true);
          continue;
        }
        if (role === 'MAN' && s.manIdx >= 0) {
          var kk = Math.max(0, k - s.trailSteps), idx = kk % HISTORY, idp = Math.max(0, kk - 1) % HISTORY;
          var hx = hist[(s.manIdx * HISTORY + idx) * 2], hy = hist[(s.manIdx * HISTORY + idx) * 2 + 1];
          if (kk > 0) { tvx = (hx - hist[(s.manIdx * HISTORY + idp) * 2]) / DT; tvy = (hy - hist[(s.manIdx * HISTORY + idp) * 2 + 1]) / DT; }
          tx = hx + (hx > 0 ? -1 : 1) * T.man.inside; ty = hy + s.cushion;
        } else if (role === 'SPY') {
          tx = q.x; ty = s.zy; tvx = q.vx;
        } else {                                  // ZONE, ROBBER (and a MAN without a man)
          var best = -1, bd = s.zr;
          for (var r3 = 0; r3 < nR; r3++) {
            var rc = live.receivers[r3], dz = hyp(rc.x - s.zx, rc.y - s.zy);
            if (dz <= bd) { bd = dz; best = r3; }
          }
          if (best >= 0) {
            var sh = role === 'ROBBER' ? Z.robberShade : Z.shade, rb = live.receivers[best];
            tx = s.zx + (rb.x - s.zx) * sh; ty = s.zy + (rb.y - s.zy) * sh; tvx = rb.vx * sh; tvy = rb.vy * sh;
            if (s.deep && rb.y + Z.deepCushion > ty) { ty = rb.y + Z.deepCushion; tvy = rb.vy; }
          } else { tx = s.zx; ty = s.zy; }
        }
        if (blend < 1) { tx = s.x0 + (tx - s.x0) * blend; ty = s.y0 + (ty - s.y0) * blend; tvx *= blend; tvy *= blend; }
        track(o, clamp(tx, fld.sideL + 0.5, fld.sideR - 0.5), ty, tvx, tvy, vmax);
      }
    }

    /**
     * The first point of the ball's remaining path (sampled every field.laneStep yd, the catch zone excluded), within
     * laneR of this defender, that he reaches before the ball while it is under his reach, written into out; false
     * when there is none.
     */
    function laneSpot(o, s, out) {
      var from = bS + T.laneStep, until = bLen - T.catchZone;
      for (var sp = from; sp < until; sp += T.laneStep) {
        var u = sp / bLen;
        if (Field.heightAt(u, bApex) > s.reach) continue;
        pointAt(bPts, bCum, sp, out);
        var dl = hyp(out.x - o.x, out.y - o.y);
        if (dl > T.laneR) continue;                               // only a man already near the lane jumps it
        if (dl / s.speed <= (sp - bS) / bSpeed) return true;
      }
      return false;
    }

    function moveLinemen() {
      var q = live.qb;
      for (var m2 = 0; m2 < 5; m2++) {
        var o = live.linemen[m2], a = olAssign[m2];
        if (a >= 0 && dS[a].held) {
          var d = live.defenders[a], ux = q.x - d.x, uy = q.y - d.y, n = hyp(ux, uy) || 1;
          o.x = d.x + ux / n * T.rush.olGap; o.y = d.y + uy / n * T.rush.olGap;
        } else {
          var f = Math.min(1, T.rush.olSettle * DT);
          o.x += (olHomeX[m2] - o.x) * f; o.y += (olHomeY[m2] - o.y) * f;
        }
      }
    }

    // ── the separation, the reveal, the rush meter ──
    function updateSep(t) {
      var O = T.openSep, span = Math.max(EPS, O.hi - O.lo);
      for (var r2 = 0; r2 < nR; r2++) {
        var o = live.receivers[r2], best = Infinity;
        for (var d2 = 0; d2 < nD; d2++) {
          if (dS[d2].role === 'RUSH') continue;                 // a rusher is after the QB, not covering anybody
          var d = live.defenders[d2], dist = hyp(d.x - o.x, d.y - o.y);
          if (dist < best) best = dist;
        }
        if (!isFinite(best)) best = O.hi;
        o.sep = best; o.open = clamp((best - O.lo) / span, 0, 1); o.shown = t >= revealAt - EPS;
      }
      live.pressure = live.qb.hasBall ? qbPressure() : 0;
    }
    /** The rush on the QB now: the nearest rusher's closeness 0..1 (a still-blocked one counts heldPressure of it). */
    function qbPressure() {
      var q = live.qb, p = 0;
      for (var d2 = 0; d2 < nD; d2++) {
        var s = dS[d2];
        if (s.role !== 'RUSH' && s.role !== 'SPY') continue;
        var d = live.defenders[d2], c = clamp(1 - (hyp(d.x - q.x, d.y - q.y) - T.tackleR) / T.pressR, 0, 1) * (s.held ? T.heldPressure : 1);
        if (c > p) p = c;
      }
      return p;
    }

    // ── the ball ──
    function moveBall(t) {
      var b = live.ball, px = b.x, py = b.y;
      bS = Math.min(bLen, bS + bSpeed * DT);
      pointAt(bPts, bCum, bS, tmp);
      b.x = tmp.x; b.y = tmp.y; b.u = bLen > EPS ? bS / bLen : 1; b.h = Field.heightAt(b.u, bApex);
      if (b.kind === 'PASS' && !ghost) {
        contact(px, py, t);
        if (live.phase !== 'BALL_IN_AIR') return;
      }
      if (bS >= bLen - EPS) land(t);
    }
    /**
     * One contact roll per defender per throw, taken as the ball passes him: while it is within reachR under his reach
     * the closest approach is tracked; the roll comes when it starts to pull away (or leaves his reach) with the
     * closeness and the height of that closest point. The last catchZone yards belong to the catch contest: a pass
     * still pending there is dropped (that defender contests the catch instead).
     */
    function contact(px, py, t) {
      var b = live.ball;
      if (bS >= bLen - T.catchZone) return;
      for (var d2 = 0; d2 < nD; d2++) {
        var s = dS[d2];
        if (s.rolled) continue;
        var d = live.defenders[d2], dist = segDist(px, py, b.x, b.y, d.x, d.y);
        if (dist <= T.reachR && b.h <= s.reach) {
          if (s.minD < 0 || dist < s.minD) { s.minD = dist; s.minH = b.h; continue; }   // still closing: wait for the pass
        } else if (s.minD < 0) continue;
        s.rolled = true;
        if (rollContact(d2, s, t)) return;
      }
    }
    /** The touch roll (and the pick roll on a touch) for a defender at his closest approach; true when it ended the play. */
    function rollContact(d2, s, t) {
      var TP = T.tip, IN = T.int, near = 1 - s.minD / T.reachR, reacted = t >= s.ballAt || !s.backTurned;   // an underneath zone, the spy, the rush face the QB
      var pTouch = (TP.base + TP.perSkill * ratio(s.skill)) * (TP.near + (1 - TP.near) * near) * clamp((s.reach - s.minH) / TP.hBand, TP.hMin, 1) * (reacted ? 1 : TP.blind) * (s.held ? TP.held : 1);
      if (!rng.chance(clamp(pTouch, 0, TP.max))) return false;                              // draw: touch
      var chest = s.minH <= s.reach - IN.chest;
      var pPick = IN.touch * (chest ? 1 : IN.high) * (reacted ? 1 : IN.blind) * (0.6 + 0.4 * ratio(s.skill)) * (s.held ? IN.held : 1);
      if (rng.chance(pPick)) intercept(d2, t, 'FLIGHT');                                    // draw: pick
      else tipped(d2, t);
      return true;
    }
    /** The catch contest at the landing spot. */
    function land(t) {
      var b = live.ball, C = T.catch, IN = T.int, DR = T.drop;
      b.x = b.landing.x; b.y = b.landing.y; b.u = 1; b.h = Field.heightAt(1, bApex);
      if (b.kind === 'THROWAWAY') { b.deadAt = rd(t); addEvent('THROWAWAY', 'QB', b.x, b.y); finish('THROWAWAY', 'THROWAWAY'); return; }
      var ci = -1, cd = Infinity, r2, d2;
      for (r2 = 0; r2 < nR; r2++) {
        var dr = hyp(live.receivers[r2].x - b.x, live.receivers[r2].y - b.y);
        if (dr < cd || (dr === cd && r2 === bTarget)) { cd = dr; ci = r2; }
      }
      var contest = 0, nj = -1, nd = Infinity, top = 0;
      for (d2 = 0; d2 < nD; d2++) {
        var d = live.defenders[d2], dd = hyp(d.x - b.x, d.y - b.y);
        if (dd < nd) { nd = dd; nj = d2; }
        if (dd <= T.contestR) {
          var cj = (1 - dd / T.contestR) * (0.5 + 0.5 * ratio(dS[d2].skill)) * (t >= dS[d2].ballAt ? 1 : T.tip.blind) * (dd < cd ? C.first : 1) * (dS[d2].held ? T.tip.held : 1);   // first to the ball counts more; an engaged rusher hardly at all
          contest += cj;
          if (cj > top) top = cj;
        }
      }
      endInfo = { catcher: ci, missBy: cd, contest: contest, top: top, nearDef: nj, nearBy: nd, targetBy: bTarget >= 0 ? hyp(live.receivers[bTarget].x - b.x, live.receivers[bTarget].y - b.y) : Infinity, targetSep: bTarget >= 0 ? live.receivers[bTarget].sep : null };
      if (ghost) { b.deadAt = rd(t); finish('INCOMPLETE', 'LANDED'); return; }
      if (ci >= 0 && cd <= T.catchR) {
        var skill = roster[ci].skill, miss = cd / T.catchR;
        // a hot ball: a flat, fast ball over a short flight gives the hands no time (touch takes it off)
        var hot = num(C.heat, 0) * clamp(1 - (bArrive - b.releaseT) / Math.max(EPS, num(C.heatT, 1)), 0, 1) * clamp(1 - b.loft / Math.max(EPS, num(C.heatLoft, 1)), 0, 1);
        var pC = clamp(C.base + C.perSkill * ratio(skill) - C.reachPen * miss * miss - C.contest * contest - hot, C.min, C.max);
        endInfo.pCatch = pC; endInfo.hot = hot;
        if (rng.chance(pC)) {                                                                  // draw: catch
          var pD = DR.base * (1 - ratio(skill)) + DR.contest * contest;
          if (rng.chance(pD)) { b.deadAt = rd(t); addEvent('DROP', roster[ci].slot, b.x, b.y); finish('DROP', 'DROP'); return; }   // draw: drop
          b.caught = true; b.deadAt = -1;
          live.carrier = roster[ci].slot; recMode[ci] = M_CARRY; carryPauseUntil = t + T.carry.pause;
          endInfo.catchY = live.receivers[ci].y; endInfo.catchX = live.receivers[ci].x; endInfo.catchT = t;
          addEvent('CATCH', roster[ci].slot, live.receivers[ci].x, live.receivers[ci].y);
          live.phase = 'AFTER_CATCH';
          for (d2 = 0; d2 < nD; d2++) dS[d2].chaseAt = t + (t >= dS[d2].ballAt ? T.react.chase : dS[d2].react);
          for (r2 = 0; r2 < nR; r2++) if (r2 !== ci && recMode[r2] !== M_CARRY) recMode[r2] = M_FREE;
          return;
        }
        if (top > 0 && nj >= 0 && nd <= T.contestR && rng.chance(IN.contest * top)) { intercept(nj, t, 'CONTEST'); return; }   // draw: pick
        b.deadAt = rd(t); addEvent('INCOMPLETE', roster[ci].slot, b.x, b.y); finish('INCOMPLETE', 'MISSED');
        return;
      }
      if (nj >= 0 && nd <= T.catchR) {
        if (rng.chance(IN.alone * (1 - nd / T.catchR) * (0.6 + 0.4 * ratio(dS[nj].skill)))) { intercept(nj, t, 'ALONE'); return; }   // draw: pick
      }
      b.deadAt = rd(t); addEvent('INCOMPLETE', null, b.x, b.y); finish('INCOMPLETE', 'NOBODY');
    }
    function intercept(d2, t, where) {
      var b = live.ball, d = live.defenders[d2];
      b.caught = true; b.deadAt = -1; b.x = d.x; b.y = d.y;
      live.carrier = d.id; returnUntil = t + T.intReturnS;
      endInfo = endInfo || {};
      endInfo.picker = d2; endInfo.pickedIn = where;
      addEvent('INT', d.id, d.x, d.y);
      finish('INT', where);
    }
    function tipped(d2, t) {
      var b = live.ball, d = live.defenders[d2];
      b.tipped = true; b.deadAt = rd(t); tipAt = t;
      endInfo = endInfo || {};
      endInfo.tipper = d2;
      addEvent('TIP', d.id, b.x, b.y);
      addEvent('INCOMPLETE', null, b.x, b.y);
      finish('INCOMPLETE', 'TIPPED');
    }

    // ── the rules: sack, scramble, tackle, sideline, goal ──
    function qbChecks(t) {
      var q = live.qb;
      if (!q.hasBall || q.down) return;
      if (live.phase === 'SCRAMBLE') { carrierChecks(t, q, 'QB', attrs.MOB, attrs.MOB); return; }
      if (live.phase !== 'PRE_THROW') return;
      if (q.x <= fld.sideL || q.x >= fld.sideR) { addEvent('OUT_OF_BOUNDS', 'QB', q.x, q.y); finish('SCRAMBLE', 'OUT_OF_BOUNDS'); return; }
      if (q.y > fld.losY) {
        live.phase = 'SCRAMBLE'; live.carrier = 'QB';
        addEvent('SCRAMBLE', 'QB', q.x, q.y);
        for (var d3 = 0; d3 < nD; d3++) dS[d3].chaseAt = t + dS[d3].react * (dS[d3].role === 'MAN' ? T.react.manScramble : num(T.react.scramble, 1));   // a man defender has his back to the QB; the rest see him go
        return;
      }
      if (ghost) return;
      var SK = T.sack;
      for (var d2 = 0; d2 < nD; d2++) {
        var s = dS[d2];
        if (s.held || t < s.shedUntil) continue;
        var d = live.defenders[d2];
        if (hyp(d.x - q.x, d.y - q.y) > T.tackleR) continue;
        if (rng.chance(clamp(SK.base + SK.perMob * ratio(attrs.MOB), 0, SK.max))) {           // draw: escape
          s.shedUntil = t + T.shedS; q.escaped++;
          addEvent('ESCAPE', d.id, q.x, q.y);
          continue;
        }
        q.down = true;
        endInfo = { sacker: d2 };
        addEvent('SACK', d.id, q.x, q.y);
        finish('SACK', 'SACK');
        return;
      }
    }
    function carrierChecks(t, c, who, skill, speedAttr) {
      if (c.y >= fld.goalY) { addEvent('TD', who, c.x, c.y); finish(who === 'QB' ? 'SCRAMBLE' : 'CATCH', 'TD'); return; }
      if (c.x <= fld.sideL || c.x >= fld.sideR) { addEvent('OUT_OF_BOUNDS', who, c.x, c.y); finish(who === 'QB' ? 'SCRAMBLE' : 'CATCH', 'OUT_OF_BOUNDS'); return; }
      if (ghost) return;
      var TK = T.tackle;
      for (var d2 = 0; d2 < nD; d2++) {
        var s = dS[d2];
        if (s.held || t < s.shedUntil) continue;
        var d = live.defenders[d2];
        if (hyp(d.x - c.x, d.y - c.y) > T.tackleR) continue;
        var pB = clamp(TK.base + TK.perSkill * ratio(skill) + TK.perSpeed * ratio(speedAttr) - TK.defSkill * ratio(s.skill), TK.min, TK.max);
        if (rng.chance(pB)) { s.shedUntil = t + T.shedS; addEvent('BROKEN_TACKLE', d.id, c.x, c.y); continue; }   // draw: broken tackle
        endInfo = endInfo || {};
        endInfo.tackler = d2;
        if (who === 'QB') live.qb.down = true;
        addEvent('TACKLE', d.id, c.x, c.y);
        finish(who === 'QB' ? 'SCRAMBLE' : 'CATCH', 'TACKLE');
        return;
      }
    }
    function timeout() {
      var ph = live.phase;
      if (ph === 'BALL_IN_AIR') { live.ball.deadAt = rd(live.t); finish('INCOMPLETE', 'TIMEOUT'); }
      else if (ph === 'AFTER_CATCH') finish('CATCH', 'TIMEOUT');
      else if (ph === 'SCRAMBLE') finish('SCRAMBLE', 'TIMEOUT');
      else { live.qb.down = true; finish('SACK', 'TIMEOUT'); }
    }

    // ── after DONE: everyone coasts (presentation only: no rolls, no events) ──
    function coast(t) {
      var q = live.qb, b = live.ball, c = live.carrier, PR = T.present;
      for (var d2 = 0; d2 < nD; d2++) {
        var o = live.defenders[d2];
        if (c === o.id && t < returnUntil) { carry(o, dS[d2].speed, true); if (b) { b.x = o.x; b.y = o.y; b.h = PR.carryH; } }
        else brake(o);
      }
      for (var r2 = 0; r2 < nR; r2++) brake(live.receivers[r2]);
      brake(q);
      if (b && !b.caught) {
        if (b.tipped && tipAt >= 0) { var u = t - tipAt; b.h = Math.max(0, PR.popH + PR.popV * u - PR.popG * u * u); }
        else b.h = Math.max(0, b.h - PR.fallV * DT);
      } else if (b && b.caught && c && slotIdx[c] !== undefined) { var co = live.receivers[slotIdx[c]]; b.x = co.x; b.y = co.y; b.h = PR.carryH; }
    }

    // ── one fixed sub-step ──
    function subStep() {
      k++;
      live.t = k * DT;
      var t = live.t;
      if (live.phase === 'DONE') { coast(t); return; }
      moveQB(t);
      moveReceivers(t);
      moveDefenders(t);
      moveLinemen();
      if (live.phase === 'BALL_IN_AIR') moveBall(t);
      else if (live.phase === 'AFTER_CATCH') {
        var ci = slotIdx[live.carrier];
        if (ci !== undefined) { live.ball.x = live.receivers[ci].x; live.ball.y = live.receivers[ci].y; live.ball.h = T.present.carryH; carrierChecks(t, live.receivers[ci], live.carrier, roster[ci].skill, roster[ci].speed); }
      }
      if (live.phase === 'PRE_THROW' || live.phase === 'SCRAMBLE') qbChecks(t);
      updateSep(t);
      if (live.phase !== 'DONE' && t >= T.maxT - EPS) timeout();
    }

    /**
     * Advance dt sim-seconds (clamped to [0, field.maxStep 0.25]; NaN / non-numbers → 0) in fixed sub-steps of field.dt; the remainder carries
     * to the next call. Returns live.phase. After DONE the players coast (presentation only).
     */
    live.step = function (dt) {
      dt = typeof dt === 'number' && dt === dt ? clamp(dt, 0, T.maxStep) : 0;   // NaN / strings → 0 · ±Infinity clamps
      acc += dt;
      var n = Math.floor(acc / DT + 1e-7);
      acc = Math.max(0, acc - n * DT);
      for (var s = 0; s < n; s++) subStep();
      live.rest = acc;
      return live.phase;
    };
    Object.defineProperty(live, '_steps', { value: function (n) { for (var s = 0; s < n; s++) subStep(); return live.phase; }, enumerable: false });
    Object.defineProperty(live, '_k', { value: function () { return k; }, enumerable: false });
    Object.defineProperty(live, '_margin', { value: function (r2, ex, ey, flight) { return reachMargin(r2, ex, ey, flight); }, enumerable: false });

    // ── legality ──
    function passIllegal() {
      var q = live.qb;
      if (live.phase === 'DONE') return 'the play is over';
      if (live.ball) return 'the ball is gone';
      if (!q.hasBall || q.down) return 'the quarterback does not have the ball';
      if (live.phase !== 'PRE_THROW' || q.y > fld.losY) return 'past the line: run it';
      return '';
    }
    function normLoft(loft) { return clamp(num(loft, 0.5), 0, 1); }
    function outOfBounds(p) { return p.x < fld.sideL || p.x > fld.sideR || p.y > fld.endY; }

    /** A receiver's margin (s) to reach (ex, ey) by a ball arriving `flight` s from now (straight line or on his route). */
    function reachMargin(r2, ex, ey, flight) {
      var t = live.t, rc = T.targetReact, o = live.receivers[r2], v = Math.max(recSpd[r2], hyp(o.vx, o.vy));
      routeAt(r2, t + Math.min(rc, flight), tmp2);
      var dx = ex - tmp2.x, dy = ey - tmp2.y, dd = hyp(dx, dy);
      var turn = dd > EPS ? hyp(dx / dd * v - o.vx, dy / dd * v - o.vy) / (2 * T.recAccel) : 0;   // the cut: the velocity he has to change
      var m1 = (flight - rc) - turn - Math.max(0, dd - T.catchR) / v;
      routeAt(r2, t + flight, tmp2);
      var d2 = hyp(tmp2.x - ex, tmp2.y - ey);
      var m2 = d2 <= T.catchR ? (T.catchR - d2) / v : -Infinity;
      return Math.max(m1, m2);
    }

    /**
     * The preview race at the landing spot: GREEN / GOLD / RED (see the draw contract), and its margin (s): the smaller
     * of the target's lead on the ball and the ball's lead on the first defender who can contest the spot (writes
     * lastMargin). 0 draws, no mutation of the live.
     */
    function previewOf(target, pts, len, loft, margin) {
      var DW = W(), v = Field.ballSpeed(attrs, loft), flight = len / v, end = pts[pts.length - 1];
      var recArrive = flight - margin;
      var firstDef = Infinity, contestAt = Infinity, d2, dd;
      for (d2 = 0; d2 < nD; d2++) {
        var d = live.defenders[d2], s = dS[d2];
        if (s.held) continue;
        var ex = d.x + d.vx * s.react, ey = d.y + d.vy * s.react;
        dd = hyp(ex - end.x, ey - end.y);
        var tc = s.react + Math.max(0, dd - T.contestR) / s.speed, tf = s.react + Math.max(0, dd - T.catchR) / s.speed;
        if (tc < contestAt) contestAt = tc;
        if (tf < firstDef) firstDef = tf;
      }
      var low = false, risk = false, apex = Field.apex(flight, loft);
      var cum = cumOf(pts), steps = Math.min(32, Math.max(4, Math.ceil(len / 1.5)));
      for (var si = 1; si <= steps; si++) {
        var sArc = len * si / steps;
        if (sArc > len - T.catchZone) break;
        pointAt(pts, cum, sArc, tmp);
        var u = sArc / len, h = Field.heightAt(u, apex), tau = sArc / v;
        for (d2 = 0; d2 < nD; d2++) {
          var o = live.defenders[d2], st = dS[d2];
          if (h > st.reach) continue;
          var lead = Math.min(tau, st.react), px = o.x + o.vx * lead, py = o.y + o.vy * lead;
          if (hyp(px - tmp.x, py - tmp.y) > T.reachR + DW.previewPad) continue;
          risk = true;
          if (!st.held && h <= st.reach - DW.previewLowBand) low = true;
        }
      }
      lastMargin = Math.min(margin, contestAt - flight);
      if (firstDef < recArrive || low || margin < DW.redReach) return 'RED';
      var C = T.catch, hot = num(C.heat, 0) * clamp(1 - flight / Math.max(EPS, num(C.heatT, 1)), 0, 1) * clamp(1 - loft / Math.max(EPS, num(C.heatLoft, 1)), 0, 1);
      if (contestAt - flight >= DW.greenMargin && margin >= DW.greenReach && !risk && hot < num(DW.previewHot, Infinity)) return 'GREEN';   // a hot ball is never GREEN
      return 'GOLD';
    }

    /**
     * What a drawn line is. 0 draws, never mutates the live. Returns {kind: 'PASS'|'RUN'|'THROWAWAY'|'INVALID', target,
     * points (the first point replaced by the QB; truncated at the arm's max length for a PASS / THROWAWAY), length,
     * maxLen, tooLong, preview: 'GREEN'|'GOLD'|'RED'|null, previewShown, margin (s, PASS only: the race's margin — the
     * smaller of the target's lead on the ball and the ball's lead on the first contesting defender; null otherwise),
     * reason}.
     */
    live.classify = function (points, loft) {
      var DW = W(), q = live.qb;
      var out = { kind: 'INVALID', target: null, points: [], length: 0, maxLen: rd(maxLen), tooLong: false, preview: null, previewShown: live.previewShown, margin: null, reason: '' };
      loft = normLoft(loft);
      if (live.phase === 'DONE' || live.ball || !q.hasBall || q.down) { out.reason = live.phase === 'DONE' ? 'the play is over' : 'the ball is gone'; return out; }
      var pts = Field.clean(points, DW.maxPoints);
      if (pts.length < 2) { out.reason = 'too short'; return out; }
      if (hyp(pts[0].x - q.x, pts[0].y - q.y) > DW.startR) { out.reason = 'start at the quarterback'; return out; }
      pts[0] = { x: q.x, y: q.y };
      if (pts.length > 1 && hyp(pts[1].x - q.x, pts[1].y - q.y) < 1e-9) pts.splice(1, 1);
      var len = Field.length(pts);
      out.length = rd(len);
      if (len < DW.minLen) { out.reason = 'too short'; return out; }
      out.points = pts;
      if (live.phase !== 'PRE_THROW' || q.y > fld.losY) { out.kind = 'RUN'; return out; }
      var end = pts[pts.length - 1], v = Field.ballSpeed(attrs, loft), flight = len / v;
      var best = -1, bestM = -Infinity;
      for (var r2 = 0; r2 < nR; r2++) {
        var mg = reachMargin(r2, end.x, end.y, flight);
        if (mg > bestM) { bestM = mg; best = r2; }
      }
      lastBest = best; lastBestM = bestM;
      var flightPts = pts, flen = len;
      if (len > maxLen) { flightPts = Field.truncate(pts, maxLen); flen = maxLen; }
      if (best >= 0 && bestM >= -DW.reachSlack) {
        out.kind = 'PASS'; out.target = roster[best].slot; out.points = flightPts; out.tooLong = len > maxLen;
        if (out.tooLong) {                                           // the ball dies at maxLen: the race is at the real end
          var fe = flightPts[flightPts.length - 1];
          bestM = reachMargin(best, fe.x, fe.y, flen / v);
        }
        out.preview = previewOf(best, flightPts, flen, loft, bestM);
        out.margin = rd(lastMargin);
        return out;
      }
      if (outOfBounds(end)) { out.kind = 'THROWAWAY'; out.points = flightPts; out.tooLong = len > maxLen; return out; }
      out.kind = 'RUN';
      return out;
    };

    /**
     * The spot a receiver can take a straight ball at now (where his route has him when it arrives), or null when
     * passing is not legal / the slot is unknown: {slot, x, y, flight, arrive, points: [QB, spot], tooLong}. 0 draws.
     */
    live.aim = function (slot, loft) {
      var r2 = slotIdx[slot], q = live.qb;
      if (r2 === undefined || passIllegal()) return null;
      loft = normLoft(loft);
      var v = Field.ballSpeed(attrs, loft), fl = 0, it;
      for (it = 0; it < 16; it++) {
        routeAt(r2, live.t + fl, tmp);
        var nf = hyp(tmp.x - q.x, tmp.y - q.y) / v;
        if (Math.abs(nf - fl) < 1e-4) { fl = nf; break; }
        fl = nf;
      }
      routeAt(r2, live.t + fl, tmp);
      var x = clamp(tmp.x, fld.sideL + 0.3, fld.sideR - 0.3), y = tmp.y, dist = hyp(x - q.x, y - q.y);
      return { slot: slot, x: rd(x), y: rd(y), flight: rd(dist / v), arrive: rd(live.t + dist / v), points: [{ x: q.x, y: q.y }, { x: x, y: y }], tooLong: dist > maxLen };
    };

    /** The QB runs this path from where he is (replaces any earlier run). Legal while he has the ball. */
    live.setRun = function (points) {
      var q = live.qb, DW = W();
      if (live.phase === 'DONE') return { ok: false, reason: 'the play is over' };
      if (!q.hasBall || q.down || (live.phase !== 'PRE_THROW' && live.phase !== 'SCRAMBLE')) return { ok: false, reason: 'the quarterback does not have the ball' };
      var pts = Field.clean(points, DW.maxPoints);
      if (!pts.length) return { ok: false, reason: 'no points' };
      var run = [{ x: q.x, y: q.y }];
      var from = hyp(pts[0].x - q.x, pts[0].y - q.y) <= DW.startR ? 1 : 0;
      for (var p = from; p < pts.length; p++) {
        var last = run[run.length - 1];
        if (hyp(pts[p].x - last.x, pts[p].y - last.y) > 1e-9) run.push({ x: pts[p].x, y: pts[p].y });
      }
      var len = Field.length(run);
      if (run.length < 2 || len < DW.minLen) return { ok: false, reason: 'too short' };
      runPts = run; runCum = cumOf(run); runLen = len; runS = 0; runSpeed = Math.min(qbSpd, hyp(q.vx, q.vy)); qbFree = true;
      addEvent('RUN', 'QB', q.x, q.y);
      log.runs.push({ t: rd6(live.t), points: pts });
      return { ok: true, reason: '' };
    };

    /** The flown path: the line with a lateral error growing along it (the chord's normal) and a length error. */
    function scattered(pts, eLat, eLen) {
      var n = pts.length, a = pts[0], z = pts[n - 1], cx = z.x - a.x, cy = z.y - a.y, cl = hyp(cx, cy) || 1;
      var nx = -cy / cl, ny = cx / cl, cum = cumOf(pts), L = cum[n - 1] || 1, out = [];
      for (var p = 0; p < n; p++) { var f = cum[p] / L; out.push({ x: pts[p].x + nx * eLat * f, y: pts[p].y + ny * eLat * f }); }
      var want = clamp(L + eLen, Math.min(L, T.scatter.minYd), maxLen);
      if (want < L) return Field.truncate(out, want);
      if (want > L) {
        var b = out[n - 1], c = out[n - 2], sx = b.x - c.x, sy = b.y - c.y, sl = hyp(sx, sy) || 1;
        out.push({ x: b.x + sx / sl * (want - L), y: b.y + sy / sl * (want - L) });
      }
      return out;
    }

    /** Release the ball along pts (clean, starting at the QB). */
    function release(pts, drawn, loft, kind, targetSlot) {
      var q = live.qb, t = live.t, S = T.scatter;
      var flown = pts, L = Field.length(pts);
      rel = { pressure: qbPressure(), running: clamp((hyp(q.vx, q.vy) - S.setV) / Math.max(EPS, qbSpd - S.setV), 0, 1), sd: 0, x: q.x, y: q.y };
      if (kind === 'PASS' && !ghost) {
        var wx = Field.weatherPenalty(ctx.weather, loft);
        var sd = (S.base + S.perYd * L) * (1 - S.perAcc * ratio(attrs.ACC)) * (1 + S.pressure * rel.pressure + S.running * rel.running) + S.weather * wx;
        rel.sd = sd; rel.wx = wx;
        var eLat = rng.gauss(0, sd), eLen = rng.gauss(0, sd * S.lenMul);                  // draws: 2 + 2
        rel.eLat = eLat; rel.eLen = eLen;
        flown = scattered(pts, eLat, eLen);
      }
      bPts = flown; bCum = cumOf(flown); bLen = bCum[bCum.length - 1] || 0; bS = 0;
      bSpeed = Field.ballSpeed(attrs, loft); bApex = Field.apex(bLen / bSpeed, loft); bArrive = t + bLen / bSpeed;
      bTarget = targetSlot !== null && slotIdx[targetSlot] !== undefined ? slotIdx[targetSlot] : -1;
      var end = flown[flown.length - 1];
      live.ball = {
        x: q.x, y: q.y, h: Field.heightAt(0, bApex), u: 0,
        path: flown, drawn: drawn, landing: { x: end.x, y: end.y },
        releaseT: rd(t), arriveT: rd(t + bLen / bSpeed), loft: rd(loft), kind: kind, caught: false, deadAt: -1,
        target: bTarget >= 0 ? targetSlot : null, speed: rd(bSpeed), length: rd(bLen), apex: rd(bApex), tipped: false, tooLong: false, preview: null
      };
      q.hasBall = false;
      live.phase = 'BALL_IN_AIR'; live.carrier = null;
      if (bTarget >= 0) { live.receivers[bTarget].target = true; recBreakAt[bTarget] = t + T.targetReact; }
      for (var d2 = 0; d2 < nD; d2++) dS[d2].ballAt = t + dS[d2].react;
      addEvent('RELEASE', 'QB', q.x, q.y);
    }

    /** Release NOW along the drawn line (loft 0 bullet … 1 lob). Legal only in PRE_THROW behind the line. */
    live.throwAlong = function (points, loft) {
      var why = passIllegal();
      if (why) return { ok: false, kind: null, target: null, reason: why };
      loft = normLoft(loft);
      lastBest = -1; lastBestM = -Infinity;
      var c = live.classify(points, loft);
      if (c.kind === 'INVALID') return { ok: false, kind: 'INVALID', target: null, reason: c.reason };
      var kind = c.kind === 'THROWAWAY' ? 'THROWAWAY' : 'PASS';
      // a line nobody can reach, thrown anyway: the man with the best chance is the one it was meant for (he tries)
      var aimedAt = c.kind === 'RUN' && lastBest >= 0 && lastBestM >= T.hopeless ? roster[lastBest].slot : c.target;
      var pts = c.kind === 'RUN' && c.length > maxLen ? Field.truncate(c.points, maxLen) : c.points;
      var clean = Field.clean(points, W().maxPoints), drawn = [{ x: live.qb.x, y: live.qb.y }];   // what the player drew, from the QB, untruncated
      for (var p = 1; p < clean.length; p++) drawn.push({ x: clean[p].x, y: clean[p].y });
      log.pass = { t: rd6(live.t), points: clean, loft: loft };
      release(pts, drawn, loft, kind, aimedAt);
      if (c.tooLong) live.ball.tooLong = true;
      live.ball.preview = c.preview;
      return { ok: true, kind: kind, target: aimedAt, reason: '' };
    };

    /** The ball out of bounds past the nearer sideline: THROWAWAY, never a turnover. Legal when throwAlong is. */
    live.throwAway = function () {
      var why = passIllegal();
      if (why) return { ok: false, kind: null, target: null, reason: why };
      var q = live.qb, left = (q.x - fld.sideL) <= (fld.sideR - q.x);
      var A = T.away, pts = [{ x: q.x, y: q.y }, { x: left ? fld.sideL - A.out : fld.sideR + A.out, y: Math.max(A.minY, q.y + A.depth) }];
      log.away = rd6(live.t);
      release(pts, [{ x: pts[0].x, y: pts[0].y }, { x: pts[1].x, y: pts[1].y }], A.loft, 'THROWAWAY', null);
      return { ok: true, kind: 'THROWAWAY', target: null, reason: '' };
    };

    // ── the result ──
    function finish(outcome, how) {
      live.phase = 'DONE';
      if (!ghost) result = buildResult(outcome, how);
    }

    function buildResult(outcome, how) {
      var b = live.ball, FB = P().feedback, R = rd, goal = fld.goalY;
      var kind = b ? (b.kind === 'THROWAWAY' ? 'THROWAWAY' : 'PASS') : (outcome === 'SACK' ? 'SACK' : 'SCRAMBLE');
      var target = b && b.target ? b.target : null;
      var yards = 0, airYards = 0, yac = 0, tIdx = target ? slotIdx[target] : -1;
      var minY = -(sit.yl - 1);
      if (outcome === 'CATCH') {
        var ci = slotIdx[live.carrier];
        var endY = how === 'TD' ? goal : live.receivers[ci].y;
        yards = how === 'TD' ? goal : clamp(Math.round(endY), minY, goal);
        airYards = clamp(Math.round(num(endInfo && endInfo.catchY, endY)), minY, goal);
        if (how === 'TD' && airYards >= goal) airYards = goal;
        yac = yards - airYards;
      } else if (outcome === 'SACK' || outcome === 'SCRAMBLE') {
        yards = how === 'TD' ? goal : clamp(Math.round(live.qb.y), minY, goal);
      }
      yards = nz(yards); airYards = nz(airYards); yac = nz(yac);
      var td = (outcome === 'CATCH' || outcome === 'SCRAMBLE') && yards > 0 && sit.yl + yards >= FIELD_YARDS;
      var firstDown = (outcome === 'CATCH' || outcome === 'SCRAMBLE') && (td || yards >= sit.toGo);
      var tipped = !!(b && b.tipped);
      var text;
      switch (outcome) {
        case 'CATCH': text = 'CATCH ' + signed(yards); break;
        case 'INT': text = 'INTERCEPTED'; break;
        case 'DROP': text = 'DROPPED'; break;
        case 'SACK': text = 'SACKED ' + signed(yards); break;
        case 'THROWAWAY': text = 'THROWN AWAY'; break;
        case 'SCRAMBLE': text = 'SCRAMBLE ' + signed(yards); break;
        default: text = tipped ? 'TIPPED' : 'INCOMPLETE';
      }
      var banner = td ? 'TOUCHDOWN!' : (firstDown && !sit.lastPlay ? 'FIRST DOWN' : text);
      var loft = b ? b.loft : 0.5;
      var res = {
        run: false, playId: sim.playId, play: sim.play, kind: kind, outcome: outcome, target: target,
        yards: yards, airYards: airYards, yac: yac, td: td, firstDown: firstDown, turnover: outcome === 'INT', fumble: false,
        t: R(b ? b.releaseT : live.t), loft: R(loft), length: b ? b.length : 0,
        landing: b ? { x: R(b.landing.x), y: R(b.landing.y) } : { x: R(live.qb.x), y: R(live.qb.y) },
        release: rel ? { x: R(rel.x), y: R(rel.y), pressure: R(rel.pressure), running: R(rel.running), sd: R(rel.sd) } : null,
        arrive: b ? b.arriveT : null, flight: b ? R(b.arriveT - b.releaseT) : 0,
        sep: endInfo && typeof endInfo.targetSep === 'number' ? R(endInfo.targetSep) : null,
        miss: endInfo && isFinite(endInfo.targetBy) ? R(endInfo.targetBy) : null, preview: b ? b.preview : null,
        contest: endInfo && typeof endInfo.contest === 'number' ? R(endInfo.contest) : null,
        nearest: endInfo && endInfo.nearDef >= 0 && isFinite(endInfo.nearBy) ? { id: defs[endInfo.nearDef].id, d: R(endInfo.nearBy) } : null,
        escaped: live.qb.escaped, ended: how, endT: R(live.t), tooLong: !!(b && b.tooLong), sackAt: sim.sackAt,
        catcher: catcherSlot(outcome),
        text: text, banner: banner, feedback: null
      };
      res.feedback = feedbackFor(res, outcome, how, tIdx, FB);
      return res;
    }

    /** The receiver who caught it (CATCH) or had it in his hands (DROP) — the nearest man at the landing, not always the target. */
    function catcherSlot(outcome) {
      if (outcome === 'CATCH' && live.carrier !== null && slotIdx[live.carrier] !== undefined) return live.carrier;
      if (outcome === 'DROP' && endInfo && endInfo.catcher >= 0) return roster[endInfo.catcher].slot;
      return null;
    }

    function feedbackFor(res, outcome, how, tIdx, FB) {
      var b = live.ball;
      var touch = res.loft < FB.bullet ? 'BULLET' : (res.loft >= FB.lob ? 'LOB' : 'TOUCH');
      var timing = 'ON TIME', placement = '—';
      if (outcome === 'SACK') timing = 'TOO LATE';
      else if (b && b.kind === 'THROWAWAY') timing = b.releaseT < firstBeat ? 'ON TIME' : 'LATE';
      else if (b && tIdx >= 0 && roster[tIdx].ghost) {
        var g = roster[tIdx].ghost, arr = b.arriveT;
        if (ghostSep(g, arr) >= FB.plateau * g.peak) timing = 'ON TIME';       // it got there while he was open
        else if (arr < g.from - FB.early) timing = 'EARLY';
        else if (arr <= g.to + FB.late) timing = 'ON TIME';
        else if (arr <= g.to + FB.tooLate) timing = 'LATE';
        else timing = 'TOO LATE';
      } else if (b) timing = b.releaseT < firstBeat ? 'ON TIME' : 'LATE';
      if (b && b.kind === 'PASS') {
        if (b.tipped) placement = 'TIPPED';
        else if (outcome === 'INT' || (endInfo && endInfo.nearBy < endInfo.targetBy && endInfo.nearBy <= T.contestR)) placement = 'INTO COVERAGE';
        else if (tIdx >= 0) {
          pathInto(roster[tIdx], b.arriveT, tmp);
          pathInto(roster[tIdx], b.arriveT - 0.1, tmp2);
          var ex = b.landing.x - tmp.x, ey = b.landing.y - tmp.y, dx = tmp.x - tmp2.x, dy = tmp.y - tmp2.y, dl = hyp(dx, dy);
          if (dl < EPS) { dx = 0; dy = 1; dl = 1; }
          var along = (ex * dx + ey * dy) / dl, reached = endInfo && endInfo.targetBy <= T.catchR;
          var vertical = Math.abs(dy) >= Math.abs(dx);
          if (reached && hyp(ex, ey) <= FB.money) placement = 'ON THE MONEY';
          else if (reached) placement = along >= 0 ? 'LED HIM' : 'BEHIND HIM';
          else if (vertical) placement = along >= 0 ? 'OVERTHROWN' : 'UNDERTHROWN';
          else placement = along >= 0 ? 'LED HIM' : 'BEHIND HIM';
        } else placement = 'INTO COVERAGE';
      }
      var fb = { timing: timing, touch: touch, placement: placement, coachSaw: '' };
      fb.coachSaw = coachSaw(res, outcome, how, tIdx, fb);
      return fb;
    }

    /** The pre-run separation of a receiver at time t (linear between the samples; the last one past ghostT). */
    function ghostSep(g, t) {
      var sd = T.sampleDt, x = clamp(num(t, 0), 0, (g.sep.length - 1) * sd) / sd, i0 = Math.floor(x), f = x - i0;
      if (i0 >= g.sep.length - 1) return g.sep[g.sep.length - 1];
      return g.sep[i0] + (g.sep[i0 + 1] - g.sep[i0]) * f;
    }

    function coverageName(id) { var c = D().coverages[id]; return c && c.name ? c.name : String(id); }

    /** One short line in the kicker's voice: what the coach saw. */
    function coachSaw(res, outcome, how, tIdx, fb) {
      var nIdx = res.catcher && slotIdx[res.catcher] !== undefined ? slotIdx[res.catcher] : tIdx;   // the man who caught (or dropped) it
      var name = nIdx >= 0 ? roster[nIdx].name : 'nobody', b = live.ball;
      var who = function (d2) { return d2 >= 0 && d2 < nD ? defs[d2].pos : ''; };
      switch (outcome) {
        case 'CATCH':
          if (res.td) return res.yac >= 10 ? 'Coach saw ' + name + ' take it the rest of the way. Nobody touched him.' : 'Coach saw the end zone. So did everybody else.';
          if (res.firstDown) return res.yac >= 8 ? 'Coach saw the catch and the run after it. ' + name + ' did the rest.' : 'Coach saw you move the sticks. Clean.';
          return fb.timing === 'LATE' || fb.timing === 'TOO LATE' ? 'Coach saw a catch, late and short. Take what they give sooner.' : 'Coach saw a completion. Not enough of one.';
        case 'DROP': return 'Coach saw a good ball hit the turf. That one is on ' + name + '.';
        case 'INT':
          if (endInfo && endInfo.pickedIn === 'FLIGHT') return who(endInfo.picker) === 'DL' ? 'Coach saw it come off a lineman\'s hands and into his arms. Find a lane.' : 'Coach saw you throw it right through him. Get it over the linebacker or around him.';
          if (fb.timing === 'LATE' || fb.timing === 'TOO LATE') return 'Coach saw you throw late into a closed window. The safety was waiting.';
          if (sim.shown && sim.real && sim.shown !== sim.real) return 'Coach saw them show ' + coverageName(sim.shown) + ' and play ' + coverageName(sim.real) + '. The look lied and you bought it.';
          if (!b || !b.target) return 'Coach saw you throw it to their guy. There was nobody of ours there.';
          return 'Coach saw you force it into coverage. That is not a window, that is a wish.';
        case 'SACK':
          if (how === 'TIMEOUT') return 'Coach saw you hold it forever. Somebody always gets home.';
          if (sim.hot) return 'Coach saw the blitz you did not — that ball has to be out hot.';
          if (qbFree) return 'Coach saw you run into the rush. Run away from the man who beat his block.';
          return 'Coach saw the pocket fold. Get it out, or get out.';
        case 'THROWAWAY': return 'Coach saw you throw it away. Nothing wrong with living to play another down.';
        case 'SCRAMBLE':
          if (res.td) return 'Coach saw you run it in yourself. Somebody check the tape.';
          if (how === 'OUT_OF_BOUNDS' && res.yards <= 0) return 'Coach saw you run out of room. Throw it away next time.';
          if (res.firstDown) return 'Coach saw you take off and take the sticks with you.';
          return res.yards > 0 ? 'Coach saw you tuck it. A few yards beats a sack.' : 'Coach saw you run backwards. That is a sack with extra steps.';
        default: break;
      }
      // INCOMPLETE
      if (b && b.tipped) return endInfo && who(endInfo.tipper) === 'DL' ? 'Coach saw it batted at the line. Find a lane or put air under it.' : 'Coach saw a hand on it. Loft it over the underneath guy.';
      if (b && b.tooLong) return 'Coach saw you throw it further than your arm goes. Know your range.';
      if (!b || !b.target) return 'Coach saw you throw it to nobody. Pick a man.';
      if (rel && rel.pressure >= 0.5) return 'Coach saw the rush in your face — you threw off your back foot.';
      if (rel && rel.running >= 0.5) return 'Coach saw you throw on the run and miss. Set your feet or lead him more.';
      if (rel && rel.wx >= 0.03) return 'Coach saw the weather take it. Drive it lower next time.';
      if (fb.placement === 'OVERTHROWN') return 'Coach saw it sail past ' + name + '. Too much line.';
      if (fb.placement === 'UNDERTHROWN') return 'Coach saw it die short of ' + name + '. Draw it longer.';
      if (fb.placement === 'INTO COVERAGE') return 'Coach saw a contested ball go the wrong way. Throw him open.';
      if (fb.timing === 'EARLY') return 'Coach saw you throw before the break. Let ' + name + ' get there.';
      if (fb.timing === 'TOO LATE' || fb.timing === 'LATE') return 'Coach saw you a beat late. It was there and then it was not.';
      if (fb.touch === 'BULLET' && res.length < 12) return 'Coach saw you fire one nobody could handle from there. Take a little off it.';
      return 'Coach saw a miss. Nothing mechanical, just a miss.';
    }

    /** The PlayResult once phase === 'DONE' (else null). The same object on every call. */
    live.result = function () { return live.phase === 'DONE' ? result : null; };

    /** The input log: { runs: [{t, points}], pass: {t, points, loft} | null, away: t | null } (sim times on the dt grid). A copy. */
    live.plan = function () {
      var out = { runs: [], pass: null, away: log.away };
      for (var p = 0; p < log.runs.length; p++) out.runs.push({ t: log.runs[p].t, points: copyPts(log.runs[p].points) });
      if (log.pass) out.pass = { t: log.pass.t, points: copyPts(log.pass.points), loft: log.pass.loft };
      return out;
    };

    /** A JSON snapshot of what the scene draws (debug). */
    live.snapshot = function () {
      var o = { t: rd(live.t), phase: live.phase, carrier: live.carrier, pressure: rd(live.pressure), qb: rdObj(live.qb), receivers: [], defenders: [], ball: null };
      for (var p = 0; p < nR; p++) o.receivers.push(rdObj(live.receivers[p]));
      for (p = 0; p < nD; p++) o.defenders.push(rdObj(live.defenders[p]));
      if (live.ball) o.ball = { x: rd(live.ball.x), y: rd(live.ball.y), h: rd(live.ball.h), u: rd(live.ball.u), kind: live.ball.kind, target: live.ball.target, landing: { x: rd(live.ball.landing.x), y: rd(live.ball.landing.y) }, releaseT: live.ball.releaseT, arriveT: live.ball.arriveT, loft: live.ball.loft, caught: live.ball.caught, tipped: live.ball.tipped };
      return o;
    };

    addEvent('SNAP', 'QB', qbX0, qbY0);
    updateSep(0);
    return live;
  };

  function rd6(x) { return nz(Util.roundN(x, 6)); }
  function copyPts(pts) { var out = []; for (var i = 0; i < pts.length; i++) out.push({ x: pts[i].x, y: pts[i].y }); return out; }
  function rdObj(o) {
    var out = {};
    for (var key in o) if (Object.prototype.hasOwnProperty.call(o, key)) out[key] = typeof o[key] === 'number' ? rd(o[key]) : o[key];
    return out;
  }

  // ═══════════════════════════════ REPLAY ═══════════════════════════════

  /**
   * Apply a plan's inputs to a fresh Live at their sim times (quantised to dt) and step it to DONE. The same result
   * as the live play that produced the plan. Garbage entries are ignored. Returns the PlayResult.
   * @param {Object} live a fresh Live (Field.create / Play.live) @param {Object} plan live.plan()
   */
  Field.replay = function (live, plan) {
    var T = F(), DT = T.dt, inputs = [], i;
    plan = plan && typeof plan === 'object' ? plan : {};
    function kOf(t) { return typeof t === 'number' && isFinite(t) && t >= 0 ? Math.round(t / DT) : -1; }
    var runs = Array.isArray(plan.runs) ? plan.runs : [];
    for (i = 0; i < runs.length; i++) if (runs[i] && kOf(runs[i].t) >= 0) inputs.push({ k: kOf(runs[i].t), rank: 0, idx: i, kind: 'RUN', points: runs[i].points });
    if (plan.pass && kOf(plan.pass.t) >= 0) inputs.push({ k: kOf(plan.pass.t), rank: 1, idx: 0, kind: 'PASS', points: plan.pass.points, loft: plan.pass.loft });
    if (kOf(plan.away) >= 0) inputs.push({ k: kOf(plan.away), rank: 2, idx: 0, kind: 'AWAY' });
    inputs.sort(function (a, b) { return a.k - b.k || a.rank - b.rank || a.idx - b.idx; });
    var kMax = Math.ceil(T.maxT / DT) + 2;
    for (i = 0; i < inputs.length; i++) {
      var inp = inputs[i];
      while (live._k() < inp.k && live.phase !== 'DONE' && live._k() < kMax) live._steps(1);
      if (live.phase === 'DONE') break;
      if (inp.kind === 'RUN') live.setRun(inp.points);
      else if (inp.kind === 'PASS') live.throwAlong(inp.points, inp.loft);
      else live.throwAway();
    }
    while (live.phase !== 'DONE' && live._k() < kMax) live._steps(1);
    return live.result();
  };

  RTG.Field = Field;
})(typeof window !== 'undefined' ? window : globalThis);
