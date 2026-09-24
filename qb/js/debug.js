/**
 * Road to Glory: QB — RTG.debug (the scripted API the tests drive; the kicker's SPEC §3.8 idea for the demo, v2
 * "DRAW THE PASS": the play is a live field simulation the scene steps, and the debug hands draw through the same
 * view commits a finger does).
 *
 * Always loaded. Every function is synchronous and JSON-serialisable in its return (functions are dropped, there
 * are no cycles), so the e2e harness can call it: H.debug(page, 'current').
 *
 *   current()        {screen, stage, idx, kind, pending, phase, livePhase, t, timeScale, slowLeftS, drafting, target,
 *                     liveSnapshot: {t, phase, carrier, pressure, qb, receivers, defenders, ball} | null,
 *                     drawing (view.drawing(): the draft {mode, kind, target, preview, previewShown, points, loft, tooLong, …} | null),
 *                     sim (the ids: playId, fit, real, shown, sackAt, revealAt, hot, checkdown, receivers [{slot, name,
 *                     route, family, …, ghost}], defenders [{id, pos, role, man}], rushers), ctx (the PlayContext),
 *                     situation, plan (live.plan()), events (live.events), result}
 *   forceResult(kind, {target?, input?}) → PlayResult   Play.forcedResult on the live moment: 'CATCH' | 'FIRST_DOWN' |
 *                     'TD' | 'INCOMPLETE' | 'INT' | 'SACK' | 'DROP' | 'THROWAWAY' | 'SCRAMBLE' | 'FUMBLE'. From SITUATION /
 *                     READ it reads and snaps the first pass card first (the live fork is spent by the snap's Live);
 *                     the scene freezes the live, animates the result and the shell records it.
 *   drawPass(slot, {loft?, bend?, end?: {x, y}}) → {ok, kind, target, reason, points, loft, spot}
 *                     a straight (or bent: `bend` yd off the middle) pass line from the QB to the spot `slot` can reach
 *                     at `loft` (reachSpot), committed through view.commitPass — the programmatic twin of a drawn line
 *   drawRun(points | 'rollout' | 'rollLeft' | 'rollRight' | 'stepUp' | 'scramble', {relative?}) → {ok, reason, points}
 *                     a run line through view.commitRun (field yards; `relative`: offsets from the QB)
 *   reachSpot(slot, loft) → {x, y, kind, target, preview, previewShown, margin, tooLong, length, src} | null
 *                     where a straight line from the QB must end for `slot` to take it: the engine's live.aim, checked
 *                     with live.classify, else the best of a classify loop over his route ahead (0 draws)
 *   classify(points, loft) → live.classify (the scene's own rule; 0 draws)
 *   fieldToCss(x, y) → {x, y} client css px · cssToField(px, py) → {x, y} field yards · qbPoint() → {x, y, chestY, r, fieldX, fieldY}
 *   throwAway() · live() → the live snapshot · plan() → live.plan() · events() → live.events · timeScale()
 *   holding() → the drive's first moment is waiting at the snap for the first touch · unhold() → start its clock
 *   autoThrow() → drawPass to the receiver with the best race right now (the engine's preview margin)
 *   replay(idx) → {same, recorded, replayed}   Play.resolve of a recorded moment (its plan, a scratch rng at its liveRng)
 *   seed()           the drive's seed as typed ('4242' / 'a word'); state().drive.seedNum is the uint32
 *   state()          {screen, phase, drive, script, situation, line, rating, results (with each moment's plan), story, settings, rngState}
 *   skipTo('summary' | 'title')   finish the moment in progress on its own live (the auto plan) and resolve every
 *                     remaining one headlessly (store.autoResolve: the first pass card, Play.autoPlan, Play.resolve)
 *   newDrive({seed, archetype, team, venue}) · next() · read() · pick(idx | id) · go(id) · summary() · results()
 *   tune(path, value) · tuningDefaults() · setSettings({…}) · perf()
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  var D = RTG.debug = RTG.debug || {};

  D.version = RTG.VERSION;
  D.strict = false;

  function app() { var a = RTG.UI && RTG.UI.app; if (!a) throw new Error('RTG.debug: the app has not booted yet'); return a; }
  function store() { var s = RTG.UI && RTG.UI.store; if (!s) throw new Error('RTG.debug: the app has not booted yet'); return s; }
  function drive() { var s = store(); if (!s.drive) throw new Error('RTG.debug: no drive (start one from the title or call newDrive)'); return s.drive; }
  function PV() { return RTG.UI.PlayView; }
  function view() { return PV() && typeof PV().current === 'function' ? PV().current() : null; }
  function safe(o) { if (o === undefined) return null; try { return JSON.parse(JSON.stringify(o)); } catch (e) { return String(o); } }
  function screenObj() { return app().current ? app().current() : null; }
  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
  function r3(x) { return Math.round(num(x, 0) * 1000) / 1000; }
  /** The live of the mounted scene (else the store's), or null. */
  function liveNow() {
    var v = view();
    if (v && typeof v.live === 'function') { var l = v.live(); if (l) return l; }
    var s = RTG.UI && RTG.UI.store, d = s && s.drive;
    return d && d.live ? d.live : null;
  }
  function simNow() {
    var v = view();
    if (v && typeof v.sim === 'function' && v.sim()) return v.sim();
    var d = RTG.UI && RTG.UI.store && RTG.UI.store.drive;
    return d ? d.sim : null;
  }
  function simReceiver(sim, slot) {
    if (!sim || !sim.receivers) return null;
    for (var i = 0; i < sim.receivers.length; i++) if (sim.receivers[i].slot === slot) return sim.receivers[i];
    return null;
  }

  // ─────────────────────────── the drive ───────────────────────────

  D.newDrive = function (opts) {
    app().startDrive(opts || {});
    return D.state();
  };

  D.seed = function () { return drive().seed; };

  D.go = function (id, params) { app().go(id, params || {}); return app().screen(); };

  D.next = function () {
    var s = store(), sc = screenObj();
    if (s.pending() !== 'STORY') return false;
    s.next();
    if (app().screen() === 'moment' && sc && typeof sc.renderPlay === 'function') sc.renderPlay();
    return true;
  };

  D.read = function () { var v = view(); if (!v) throw new Error('RTG.debug.read: no live scene'); if (v.phase() === 'SITUATION') v.read(); return v.phase(); };

  D.pick = function (idxOrId) {
    var v = view();
    if (!v) throw new Error('RTG.debug.pick: no live scene');
    if (v.phase() === 'SITUATION') v.read();
    var ok = v.pick(idxOrId === undefined ? 0 : idxOrId);
    return { ok: !!ok, phase: v.phase() };
  };

  /** Make sure a scene is live and past the read (snap the first pass card when needed). */
  function armPlay() {
    var s = store(), sc = screenObj();
    if (app().screen() !== 'moment') throw new Error('RTG.debug: not on the moment screen (' + app().screen() + ')');
    if (s.pending() === 'STORY') { s.next(); if (sc && typeof sc.renderPlay === 'function') sc.renderPlay(); }
    var v = view();
    if (!v) throw new Error('RTG.debug: no live scene');
    if (v.phase() === 'SITUATION') v.read();
    if (v.phase() === 'READ') {
      var opt = s.firstPassOption();
      if (!opt || !v.pick(opt.id)) throw new Error('RTG.debug: could not snap ' + (opt && opt.id));
    }
    return v;
  }

  D.forceResult = function (kind, opts) {
    opts = opts || {};
    var v = armPlay();
    if (v.phase() !== 'PLAY') return safe(v.result());                 // a run card resolves itself; a result is already playing
    var sim = simNow();
    var input = opts.input || (opts.target ? { target: opts.target } : undefined);
    var res = RTG.Play.forcedResult(sim, String(kind || 'CATCH').toUpperCase(), input);
    v.playResult(res);                                                // the live fork was spent by the snap's Live (store.record checks)
    return safe(res);
  };

  // ─────────────────────────── drawing ───────────────────────────

  function rank(c) { return c && c.kind === 'PASS' ? (c.preview === 'GREEN' ? 2 : (c.preview === 'GOLD' ? 1 : 0)) : -1; }
  function spotOut(p, c, src, loft) {
    return {
      x: r3(p.x), y: r3(p.y), kind: c ? c.kind : null, target: c ? (c.target || null) : null, preview: c ? (c.preview || null) : null,
      previewShown: !!(c && c.previewShown), margin: c && typeof c.margin === 'number' ? r3(c.margin) : null,
      tooLong: !!(c && c.tooLong), length: c ? r3(c.length) : 0, maxLen: c ? r3(c.maxLen) : 0, src: src, loft: r3(loft)
    };
  }

  /**
   * Where a straight line from the QB must end for `slot` to take the ball at `loft`: the engine's live.aim when a
   * straight line there classifies as a PASS to him, else the best (preview, then margin) of a classify loop over his
   * route ahead (every 0.1 s for 4 s) and around the aim. 0 draws. null when passing is not legal or the slot is unknown.
   */
  D.reachSpot = function (slot, loft) {
    var lv = liveNow(), sim = simNow();
    if (!lv || typeof lv.classify !== 'function' || !lv.qb) return null;
    slot = String(slot);
    loft = clamp(num(loft, 0.5), 0, 1);
    var q = { x: num(lv.qb.x, 0), y: num(lv.qb.y, 0) }, cands = [], i;
    var aim = typeof lv.aim === 'function' ? lv.aim(slot, loft) : null;
    if (aim && typeof aim.x === 'number') {
      cands.push({ x: aim.x, y: aim.y, src: 'aim' });
      for (var dx = -2; dx <= 2; dx += 1) for (var dy = -2; dy <= 2; dy += 1) if (dx || dy) cands.push({ x: aim.x + dx, y: aim.y + dy, src: 'aim±' });
    }
    var rec = simReceiver(sim, slot), F = RTG.Field;
    if (rec && F && typeof F.pathAt === 'function') {
      for (i = 0; i <= 40; i++) { var p = F.pathAt(rec, num(lv.t, 0) + i * 0.1); cands.push({ x: p.x, y: p.y, src: 'route' }); }
    }
    if (lv.receivers) for (i = 0; i < lv.receivers.length; i++) if (lv.receivers[i].slot === slot) {
      var r = lv.receivers[i];
      for (var k = 0; k <= 12; k++) cands.push({ x: r.x + r.vx * k * 0.25, y: r.y + r.vy * k * 0.25, src: 'vel' });
    }
    if (!cands.length) return null;
    var best = null, bestC = null, bestScore = -Infinity, first = null, firstC = null;
    for (i = 0; i < cands.length; i++) {
      var c = lv.classify([q, { x: cands[i].x, y: cands[i].y }], loft);
      if (i === 0) { first = cands[i]; firstC = c; }
      if (!c || c.kind !== 'PASS' || c.target !== slot || c.tooLong) continue;
      if (cands[i].src === 'aim') { best = cands[i]; bestC = c; break; }        // the engine's own spot wins when it holds
      var score = rank(c) * 100 + num(c.margin, 0);
      if (score > bestScore) { bestScore = score; best = cands[i]; bestC = c; }
    }
    if (best) return spotOut(best, bestC, best.src, loft);
    return first ? spotOut(first, firstC, 'none', loft) : null;
  };

  D.classify = function (points, loft) {
    var lv = liveNow();
    if (!lv || typeof lv.classify !== 'function') return null;
    return safe(lv.classify(points, loft));
  };

  /** A quadratic line from a to b bent `bend` yd off the chord's middle (+ = to the right of the direction of travel). */
  function bent(a, b, bend, n) {
    var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, cx = b.x - a.x, cy = b.y - a.y, l = Math.sqrt(cx * cx + cy * cy) || 1;
    var nx = cy / l, ny = -cx / l, px = mx + nx * bend * 2, py = my + ny * bend * 2, out = [];   // the control point: the curve's middle sits `bend` off
    for (var i = 0; i <= n; i++) {
      var u = i / n, w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u;
      out.push({ x: w0 * a.x + w1 * px + w2 * b.x, y: w0 * a.y + w1 * py + w2 * b.y });
    }
    return out;
  }

  /** A pass line to `slot` (reachSpot) committed through the scene (view.commitPass) — what a finger's line does. */
  D.drawPass = function (slot, opts) {
    opts = opts || {};
    var v = view(), lv = liveNow();
    if (!v || !lv || typeof v.commitPass !== 'function') return { ok: false, reason: 'no live play' };
    var loft = clamp(num(opts.loft, 0.5), 0, 1);
    var spot = opts.end && typeof opts.end.x === 'number' ? { x: opts.end.x, y: opts.end.y } : D.reachSpot(slot, loft);
    if (!spot) return { ok: false, reason: 'no spot for ' + slot };
    var q = { x: num(lv.qb.x, 0), y: num(lv.qb.y, 0) };
    var pts = num(opts.bend, 0) ? bent(q, spot, num(opts.bend, 0), 12) : [q, { x: spot.x, y: spot.y }];
    var r = v.commitPass(pts, loft) || {};
    return { ok: !!r.ok, kind: r.kind || null, target: r.target || null, reason: r.reason || '', points: safe(pts), loft: loft, spot: safe(spot) };
  };

  /** Presets for drawRun: offsets from the QB (yd). */
  function runPreset(name, lv) {
    var q = lv.qb, f = lv.field || (lv.sim && lv.sim.field) || { sideL: -26, sideR: 26 };
    var roomL = num(q.x, 0) - num(f.sideL, -26), roomR = num(f.sideR, 26) - num(q.x, 0), side = roomR >= roomL ? 1 : -1;
    switch (name) {
      case 'rollRight': return [{ x: 3, y: 0.5 }, { x: 7, y: 1 }];
      case 'rollLeft': return [{ x: -3, y: 0.5 }, { x: -7, y: 1 }];
      case 'rollout': return [{ x: 3 * side, y: 0.5 }, { x: 7 * side, y: 1 }];
      case 'stepUp': return [{ x: 0, y: 2.5 }];
      case 'scramble': return [{ x: 2.5 * side, y: 2 }, { x: 5 * side, y: -num(q.y, 0) + 2 }, { x: 5 * side, y: -num(q.y, 0) + 12 }];
      default: return null;
    }
  }

  /** A run line through the scene (view.commitRun). Points in field yards, or offsets from the QB (`relative`, the presets). */
  D.drawRun = function (points, opts) {
    opts = opts || {};
    var v = view(), lv = liveNow();
    if (!v || !lv || typeof v.commitRun !== 'function') return { ok: false, reason: 'no live play' };
    var rel = !!opts.relative, pts = points;
    if (typeof points === 'string') { pts = runPreset(points, lv); rel = true; if (!pts) return { ok: false, reason: 'unknown preset ' + points }; }
    if (!pts || typeof pts.length !== 'number') return { ok: false, reason: 'no points' };
    var q = { x: num(lv.qb.x, 0), y: num(lv.qb.y, 0) }, line = [q];
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') continue;
      line.push(rel ? { x: q.x + p.x, y: q.y + p.y } : { x: p.x, y: p.y });
    }
    var r = v.commitRun(line) || {};
    return { ok: !!r.ok, reason: r.reason || '', points: safe(line) };
  };

  D.throwAway = function () { var v = view(); if (!v || typeof v.throwAway !== 'function') return { ok: false, reason: 'no live play' }; return safe(v.throwAway()) || { ok: false }; };

  D.fieldToCss = function (x, y) { var v = view(); return v && typeof v.fieldToCss === 'function' ? safe(v.fieldToCss(x, y)) : null; };
  D.cssToField = function (px, py) { var v = view(); return v && typeof v.cssToField === 'function' ? safe(v.cssToField(px, py)) : null; };

  /** Where to press to start a draft: the QB's feet in client css px (+ his chest and the start radius when the scene says). */
  D.qbPoint = function () {
    var v = view(), lv = liveNow();
    if (!v) return null;
    if (typeof v.qbPoint === 'function') return safe(v.qbPoint());
    if (!lv || typeof v.fieldToCss !== 'function') return null;
    var p = v.fieldToCss(lv.qb.x, lv.qb.y);
    return { x: p.x, y: p.y, chestY: p.y - 12, r: 22, fieldX: r3(lv.qb.x), fieldY: r3(lv.qb.y) };
  };

  D.timeScale = function () { var v = view(); return v && typeof v.timeScale === 'function' ? v.timeScale() : 1; };
  /** The first moment waits at the snap for the first touch (the scene's hold); unhold starts its clock. */
  D.holding = function () { var v = view(); return !!(v && typeof v.holding === 'function' && v.holding()); };
  D.unhold = function () { var v = view(); return !!(v && typeof v.unhold === 'function' && v.unhold()); };

  /** Draw a pass to the receiver with the best race right now (the engine's preview, then its margin). */
  D.autoThrow = function (opts) {
    opts = opts || {};
    armPlay();
    var lv = liveNow(), sim = simNow();
    if (!lv || !sim || !sim.receivers) return { ok: false, reason: 'no live play' };
    var loft = clamp(num(opts.loft, 0.45), 0, 1), best = null, bestScore = -Infinity;
    for (var i = 0; i < sim.receivers.length; i++) {
      var sp = D.reachSpot(sim.receivers[i].slot, loft);
      if (!sp || sp.kind !== 'PASS' || sp.target !== sim.receivers[i].slot) continue;
      var score = (sp.preview === 'GREEN' ? 2 : (sp.preview === 'GOLD' ? 1 : 0)) * 100 + num(sp.margin, 0);
      if (score > bestScore) { bestScore = score; best = sp; }
    }
    if (!best) return D.throwAway();
    return D.drawPass(best.target, { loft: loft, end: best });
  };

  // ─────────────────────────── the live ───────────────────────────

  function ballOut(b) {
    if (!b) return null;
    function pts(a) { var o = []; if (a) for (var i = 0; i < a.length; i++) o.push({ x: r3(a[i].x), y: r3(a[i].y) }); return o; }
    return {
      x: r3(b.x), y: r3(b.y), h: r3(b.h), u: r3(b.u), kind: b.kind || null, target: b.target || null, loft: r3(b.loft),
      releaseT: r3(b.releaseT), arriveT: r3(b.arriveT), caught: !!b.caught, tipped: !!b.tipped, tooLong: !!b.tooLong,
      landing: b.landing ? { x: r3(b.landing.x), y: r3(b.landing.y) } : null, apex: r3(b.apex), speed: r3(b.speed), length: r3(b.length),
      path: pts(b.path), drawn: pts(b.drawn)
    };
  }
  function actorOut(o, keys) { var out = {}; for (var i = 0; i < keys.length; i++) { var v = o[keys[i]]; out[keys[i]] = typeof v === 'number' ? r3(v) : (v === undefined ? null : v); } return out; }

  /** What the scene draws right now, from the live: {t, phase, carrier, pressure, qb, receivers, defenders, ball}. */
  function snapshot(lv) {
    if (!lv) return null;
    var out = { t: r3(lv.t), phase: lv.phase || null, carrier: lv.carrier === undefined ? null : lv.carrier, pressure: r3(lv.pressure), qb: null, receivers: [], defenders: [], linemen: [], ball: ballOut(lv.ball) };
    if (lv.qb) out.qb = actorOut(lv.qb, ['x', 'y', 'vx', 'vy', 'hasBall', 'down', 'escaped']);
    var i;
    if (lv.receivers) for (i = 0; i < lv.receivers.length; i++) out.receivers.push(actorOut(lv.receivers[i], ['slot', 'x', 'y', 'vx', 'vy', 'sep', 'open', 'target', 'shown']));
    if (lv.defenders) for (i = 0; i < lv.defenders.length; i++) out.defenders.push(actorOut(lv.defenders[i], ['id', 'pos', 'role', 'man', 'x', 'y', 'vx', 'vy', 'blocked']));
    if (lv.linemen) for (i = 0; i < lv.linemen.length; i++) out.linemen.push(actorOut(lv.linemen[i], ['x', 'y']));
    return out;
  }
  D.live = function () { return snapshot(liveNow()); };
  D.plan = function () { var lv = liveNow(); return lv && typeof lv.plan === 'function' ? safe(lv.plan()) : null; };
  D.events = function () { var lv = liveNow(); return lv && lv.events ? safe(lv.events) : []; };

  /** The sim's ids (not its paths): what the helpers and the specs read. A run card's sim is its result. */
  function simIds(sim) {
    if (!sim) return null;
    if (sim.run) return { playId: sim.playId, run: true, outcome: sim.outcome, yards: sim.yards, text: sim.text || '' };
    var recs = [], defs = [], rush = [], i;
    for (i = 0; i < (sim.receivers || []).length; i++) {
      var r = sim.receivers[i], g = r.ghost || null;
      recs.push({ slot: r.slot, name: r.name, skill: r.skill, speed: r.speed, route: r.route, family: r.family || null, x0: r3(r.x0), y0: r3(r.y0), hot: !!r.hot, checkdown: !!r.checkdown,
        ghost: g ? { peak: r3(g.peak), peakAt: r3(g.peakAt), from: r3(g.from), to: r3(g.to) } : null });
    }
    for (i = 0; i < (sim.defenders || []).length; i++) { var d = sim.defenders[i]; defs.push({ id: d.id, pos: d.pos, role: d.role, man: d.man || null, deep: !!d.deep, react: r3(d.react), trail: r3(d.trail), cushion: r3(d.cushion), speed: r3(d.speed), reach: r3(d.reach) }); }
    for (i = 0; i < (sim.rushers || []).length; i++) rush.push({ defId: sim.rushers[i].defId, lane: sim.rushers[i].lane, beatAt: r3(sim.rushers[i].beatAt) });
    return {
      playId: sim.playId, run: false, name: sim.play && sim.play.name || null, fit: sim.fit || null, real: sim.real, shown: sim.shown,
      sackAt: r3(sim.sackAt), revealAt: r3(sim.revealAt), hot: sim.hot || null, checkdown: sim.checkdown || null,
      field: safe(sim.field), qbDrop: safe(sim.qbDrop), receivers: recs, defenders: defs, rushers: rush
    };
  }
  D.simIds = function () { return simIds(simNow()); };
  D.simFull = function () { var s = simNow(); if (!s) return null; var c = {}; for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k) && k !== 'ctx') c[k] = s[k]; return safe(c); };

  // ─────────────────────────── headless ───────────────────────────

  /** Finish the moment the scene is playing on its own sim and live (auto plan), so skipTo spends no extra draws. */
  function finishArmed(s) {
    var d = s.drive;
    if (!d || d.pending !== 'PLAY' || !d.sim || !d.ctx || d.ctx.idx !== d.idx) return false;
    var sim = d.sim, res = null, how = {};
    var v = view(), shown = v && typeof v.result === 'function' ? v.result() : null;
    if (shown && typeof shown.outcome === 'string') res = shown;          // a result already on screen (a forced one included)
    else if (sim.run) res = sim;
    else if (d.live && d.liveIdx === d.idx && typeof d.live.result === 'function') {
      var lv = d.live;
      if (lv.phase !== 'DONE' && RTG.Field && typeof RTG.Field.replay === 'function') {
        try { RTG.Field.replay(lv, s.autoPlan(sim)); } catch (e) { if (root.console) root.console.error('skipTo: replay failed', e); }
      }
      res = lv.result();
    }
    if (!res) return false;
    if (!sim.run && d.live && d.liveIdx === d.idx && !res.forced) how = { plan: d.live.plan(), liveRng: d.liveRng, liveForked: true };
    s.record(res, sim, how);
    return true;
  }

  D.skipTo = function (id) {
    var s = store();
    id = id || 'summary';
    if (id === 'title') { app().go('title'); return app().screen(); }
    if (id !== 'summary') throw new Error('RTG.debug.skipTo: unknown target ' + id);
    if (!s.hasDrive()) s.newDrive({});
    finishArmed(s);
    var guard = 0;
    while (!s.isDone() && guard++ < 12) s.autoResolve();
    app().go('summary');
    return app().screen();
  };

  /** Replay a recorded moment with Play.resolve and compare it to what was recorded. */
  D.replay = function (idx) {
    var s = store(), d = drive(), e = d.results[idx];
    if (!e) return null;
    var res = s.replay(idx);
    if (!res) return { same: null, recorded: { outcome: e.outcome, yards: e.yards, text: e.text }, replayed: null, reason: e.forced ? 'forced' : (e.plan ? 'no sim' : 'no plan') };
    var same = res.outcome === e.outcome && Math.round(num(res.yards, 0)) === e.yards && (res.text || '') === e.text;
    return { same: same, recorded: { outcome: e.outcome, yards: e.yards, text: e.text, t: e.t }, replayed: { outcome: res.outcome, yards: Math.round(num(res.yards, 0)), text: res.text || '', t: res.t } };
  };

  D.summary = function () { return safe(store().summary()); };

  // ─────────────────────────── inspection ───────────────────────────

  D.current = function () {
    var s = store(), d = s.drive, v = view(), sc = screenObj();
    var cur = v && typeof v.current === 'function' ? v.current() : null;
    var lv = liveNow(), sim = simNow();
    return {
      screen: app().screen(), stage: sc && sc.el && sc.el.getAttribute ? sc.el.getAttribute('data-stage') : null,
      idx: d ? d.idx : null, kind: d && d.situation ? d.situation.kind : null, pending: d ? d.pending : null,
      phase: v ? v.phase() : null, livePhase: lv ? lv.phase || null : null,
      t: lv ? r3(lv.t) : (cur ? r3(cur.t) : 0),
      timeScale: v && typeof v.timeScale === 'function' ? v.timeScale() : 1,
      slowLeftS: cur && typeof cur.slowLeftS === 'number' ? r3(cur.slowLeftS) : null,
      drafting: !!(cur && cur.drafting), target: cur ? cur.target || null : null, play: cur ? cur.play || null : null, holding: !!(cur && cur.holding),
      liveSnapshot: snapshot(lv),
      drawing: v && typeof v.drawing === 'function' ? safe(v.drawing()) : null,
      sim: simIds(sim),
      ctx: d && d.ctx ? safe(d.ctx) : (v && typeof v.ctx === 'function' ? safe(v.ctx()) : null),
      situation: d ? safe(d.situation) : null,
      plan: lv && typeof lv.plan === 'function' ? safe(lv.plan()) : null,
      events: lv && lv.events ? safe(lv.events) : [],
      result: v && typeof v.result === 'function' ? safe(v.result()) : null
    };
  };

  D.state = function () {
    var s = store(), d = s.drive, v = view();
    var line = s.line();
    return {
      screen: app().screen(), phase: v ? v.phase() : null,
      drive: d ? { seed: d.seed, seedNum: d.seedNum, archetype: d.archetype, team: d.team, venue: d.venue, idx: d.idx, pending: d.pending, advance: d.advance, weather: safe(d.weather), climate: d.climate, week: d.week, liveIdx: d.liveIdx } : null,
      script: d ? safe(d.script) : null,
      situation: d ? safe(d.situation) : null,
      line: safe(line), rating: RTG.Play && RTG.Play.rating ? RTG.Play.rating(line) : 0,
      results: d ? safe(d.results) : [],
      story: d ? safe(d.story) : null,
      settings: safe(s.settings),
      rngState: s.rng ? s.rng.state() : null
    };
  };

  D.results = function () { return safe(store().results()); };

  // ─────────────────────────── knobs ───────────────────────────

  D.setSettings = function (obj) {
    var s = store();
    for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) s.setSetting(k, obj[k]);
    return safe(s.settings);
  };

  /** Set a Tuning leaf by dotted path ('qb.draw.slowMoBudgetS', 1) in place. */
  D.tune = function (path, value) {
    var parts = String(path).split('.'), o = RTG.Tuning;
    for (var i = 0; i < parts.length - 1; i++) { if (!o[parts[i]] || typeof o[parts[i]] !== 'object') o[parts[i]] = {}; o = o[parts[i]]; }
    o[parts[parts.length - 1]] = value;
    return value;
  };
  D.tuningDefaults = function () {
    var fresh = RTG.TuningDefaults(), T = RTG.Tuning, k;
    for (k in T) if (Object.prototype.hasOwnProperty.call(T, k)) delete T[k];
    for (k in fresh) if (Object.prototype.hasOwnProperty.call(fresh, k)) T[k] = fresh[k];
    return true;
  };

  D.perf = function () {
    var Cv = RTG.UI.Canvas;
    return Cv && typeof Cv.perf === 'function' ? safe(Cv.perf()) : null;
  };
})(typeof window !== 'undefined' ? window : globalThis);
