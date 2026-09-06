/**
 * Road to Glory: Kicker — RTG.debug (SPEC §3.8, UI_API.md §Debug).
 *
 * Always loaded; `?debug=1` (or RTG.debug.strict = true) turns on Schema.validate after every dispatch and mounts
 * the panel. Every function is synchronous and re-renders through the store (store.dispatch / store.touch), so
 * Playwright can drive the whole game: `page.evaluate(() => RTG.debug.getState())`.
 *
 * Instrumentation (for perf()): requestAnimationFrame / cancelAnimationFrame are wrapped to count outstanding
 * frames and sample frame deltas; window/document addEventListener are wrapped to count live listeners.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  var doc = root.document;

  function store() {
    var s = RTG.UI && RTG.UI.store;
    if (!s) throw new Error('RTG.debug: the app has not booted yet');
    return s;
  }
  function state() {
    var s = store();
    if (!s.state) throw new Error('RTG.debug: no career loaded (call newCareer first)');
    return s.state;
  }
  function Router() { return RTG.UI.Router; }
  function isFn(f) { return typeof f === 'function'; }
  function clone(o) { return RTG.Util.deepClone(o); }

  var D = {};
  D.strict = false;
  D.version = RTG.VERSION;
  D.saveVersion = RTG.SAVE_VERSION;

  // ─────────────────────────── instrumentation ───────────────────────────

  var raf = { outstanding: 0, deltas: [], last: 0, wrapped: false };
  var listeners = { count: 0, list: [] };

  function wrapRaf() {
    if (raf.wrapped || !isFn(root.requestAnimationFrame)) return;
    raf.wrapped = true;
    var origReq = root.requestAnimationFrame, origCancel = root.cancelAnimationFrame;
    var handles = {};
    root.requestAnimationFrame = function (cb) {
      var id = origReq.call(root, function (ts) {
        delete handles[id];
        raf.outstanding = Math.max(0, raf.outstanding - 1);
        if (raf.last) {
          var d = ts - raf.last;
          if (d > 0 && d < 1000) { raf.deltas.push(d); if (raf.deltas.length > 240) raf.deltas.shift(); }
        }
        raf.last = ts;
        return cb(ts);
      });
      handles[id] = 1;
      raf.outstanding++;
      return id;
    };
    root.cancelAnimationFrame = function (id) {
      if (handles[id]) { delete handles[id]; raf.outstanding = Math.max(0, raf.outstanding - 1); }
      return origCancel ? origCancel.call(root, id) : undefined;
    };
  }

  function wrapListeners() {
    if (!doc || !root.EventTarget || listeners.wrapped) return;
    listeners.wrapped = true;
    var proto = root.EventTarget.prototype;
    var add = proto.addEventListener, rem = proto.removeEventListener;
    function tracked(t) { return t === root || t === doc || t === doc.body || t === doc.documentElement; }
    proto.addEventListener = function (type, fn, opts) {
      if (tracked(this) && isFn(fn)) {
        var cap = !!(opts === true || (opts && opts.capture));
        var i, l = listeners.list, dup = false;
        for (i = 0; i < l.length; i++) if (l[i].t === this && l[i].type === type && l[i].fn === fn && l[i].cap === cap) { dup = true; break; }
        if (!dup) { l.push({ t: this, type: type, fn: fn, cap: cap }); listeners.count = l.length; }
      }
      return add.call(this, type, fn, opts);
    };
    proto.removeEventListener = function (type, fn, opts) {
      if (tracked(this) && isFn(fn)) {
        var cap = !!(opts === true || (opts && opts.capture));
        var l = listeners.list;
        for (var i = 0; i < l.length; i++) if (l[i].t === this && l[i].type === type && l[i].fn === fn && l[i].cap === cap) { l.splice(i, 1); break; }
        listeners.count = l.length;
      }
      return rem.call(this, type, fn, opts);
    };
  }
  wrapRaf();
  wrapListeners();

  // ─────────────────────────── state access ───────────────────────────

  /** Deep clone of the live CareerState. */
  D.getState = function () { return clone(state()); };

  /** Validate, reindex and replace the live state (rng restored from state.rngState). */
  D.setState = function (s) {
    if (!s || typeof s !== 'object') throw new Error('debug.setState: a CareerState object is required');
    var st = clone(s);
    if (RTG.Schema.reindex) RTG.Schema.reindex(st);
    var v = RTG.Schema.validate(st);
    if (!v.ok) throw new Error('debug.setState: invalid state — ' + v.errors.slice(0, 5).join(' | '));
    store().replace(st, RTG.RNG.create(st.rngState >>> 0));
    store().autosave();
  };

  /** New career through the store (opts: seed, difficulty, archetype, name, look, foot, hometown). */
  D.newCareer = function (opts) {
    opts = opts || {};
    var o = {};
    for (var k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k];
    if (!o.name) o.name = 'Debug Kicker';
    store().newCareer(o);
    return D.getState();
  };

  D.pending = function () { return store().state ? clone(store().state.pending) : null; };
  D.screen = function () { return Router().current(); };
  D.go = function (id, params) { Router().go(id, params || {}); return Router().current(); };
  D.seed = function () { return state().seed; };
  D.rngState = function () { return store().rng ? store().rng.state() : null; };

  // ─────────────────────────── stepping ───────────────────────────

  function dispatch() { var s = store(); return s.dispatch.apply(s, arguments); }

  D.simGame = function () { return dispatch('autoPlayGame'); };
  D.simWeek = function (opts) { return dispatch('autoPlayWeek', opts || {}); };
  D.simSeason = function (opts) { return dispatch('autoPlaySeason', opts || {}); };
  D.simOffseason = function (opts) { return dispatch('autoPlayOffseason', opts || {}); };
  D.simCareer = function (opts) {
    opts = opts || {};
    var o = { untilStage: opts.untilStage || 'RETIRED' };
    if (typeof opts.maxYears === 'number') o.maxYears = opts.maxYears;
    dispatch('autoPlayCareer', o);
    return D.getState();
  };
  D.settle = function (opts) { return dispatch('settlePending', opts || {}); };
  D.nextPhase = function () { return dispatch('nextPhase'); };
  D.choose = function (idx) { return dispatch('chooseEvent', idx | 0); };
  D.decide = function (arg) {
    var st = state();
    if (typeof arg === 'string') arg = { kind: st.pending && st.pending.decision ? st.pending.decision.kind : '', optionId: arg };
    if (!arg.kind && st.pending && st.pending.decision) arg.kind = st.pending.decision.kind;
    return dispatch('decide', arg);
  };
  D.triggerEvent = function (id) {
    var s = store(), st = state();
    if (st.pending) throw new Error('debug.triggerEvent: something is already pending (' + st.pending.kind + ')');
    var inst = RTG.Events.force(st, s.rng, id);
    s.touch('triggerEvent', inst);
    return clone(inst);
  };

  var STAGE_ORDER = ['HS', 'COLLEGE', 'DRAFT', 'NFL', 'RETIRED'];

  function reached(st, t) {
    if (st.stage !== t.stage) return false;
    if (t.phase && st.phase !== t.phase) return false;
    if (typeof t.year === 'number' && st.year !== t.year) return false;
    if (typeof t.week === 'number' && st.week !== t.week) return false;
    return true;
  }

  /**
   * Fast-forward with the engine's auto policies until {stage, phase?, year?, week?} is reached. One engine step per
   * iteration (settlePending / nextPhase / autoPlayWeek) so every phase — including DRAFT.DECLARE / COMBINE / DRAFT —
   * is reachable. Throws when the target is not reached within 30 career years.
   */
  D.jumpTo = function (target) {
    if (!target || !target.stage) throw new Error('debug.jumpTo: {stage, phase?, year?, week?} is required');
    if (STAGE_ORDER.indexOf(target.stage) < 0) throw new Error('debug.jumpTo: unknown stage ' + target.stage);
    var s = store();
    if (!s.state) D.newCareer({ seed: target.seed });
    var st = s.state, rng = s.rng, E = RTG.Engine;
    var startYear = st.year, guard = 0;
    while (!reached(st, target)) {
      if (++guard > 5000 || st.year - startYear > 30) throw new Error('debug.jumpTo: target ' + JSON.stringify(target) + ' not reached (at ' + st.stage + '.' + st.phase + ' Y' + st.year + ' W' + st.week + ')');
      if (st.stage === 'RETIRED' && target.stage !== 'RETIRED') throw new Error('debug.jumpTo: career already over');
      if (st.game) { E.autoPlayGame(st, rng); continue; }
      if (st.pending) { E.settlePending(st, rng); continue; }
      if (st.phase === 'REG' || st.phase === 'POST') { E.autoPlayWeek(st, rng); continue; }
      if (st.stage === 'RETIRED') break;
      E.nextPhase(st, rng);
    }
    s.touch('jumpTo', { stage: st.stage, phase: st.phase, year: st.year, week: st.week }, { autosave: true });
    return D.getState();
  };

  // ─────────────────────────── kicks ───────────────────────────

  var OUTCOMES = ['GOOD', 'WIDE_L', 'WIDE_R', 'SHORT', 'BLOCKED', 'DOINK_IN', 'DOINK_OUT', 'XBAR_IN', 'XBAR_OUT'];

  function nextSessionIdx(sess) {
    if (sess.kind && sess.kind.indexOf('COMBINE') === 0 && RTG.Draft && isFn(RTG.Draft.combineNextIdx)) return RTG.Draft.combineNextIdx(sess);
    var i = sess.results.length;
    return i < sess.contexts.length ? i : -1;
  }

  function neutralInput(ctx) {
    var g = RTG.Kick.geometry(ctx, null);
    return { power: RTG.Kick.aiPower(g.pNeed), aim: 0, quality: 0.85 };
  }

  /**
   * Apply a kick to the current pending kick — the in-game pending (state.game.pending) or the next context of the
   * pending KICKS session. `arg` = {outcome} (Kick.resolve with opts.forced, 0 draws) or a triple {power, aim, quality}
   * (a normal applyUserKick / sessionKick dispatch). Subscribers are notified with fnName 'applyUserKick' /
   * 'sessionKick' and forced:true so the kick scene renders the result. Returns the KickResult.
   */
  D.forceKick = function (arg) {
    arg = arg || { outcome: 'GOOD' };
    var s = store(), st = state(), rng = s.rng, K = RTG.Kick;
    var forced = arg.outcome ? { outcome: OUTCOMES.indexOf(arg.outcome) >= 0 ? arg.outcome : 'GOOD', sub: arg.sub, side: arg.side, blockReturnTd: arg.blockReturnTd } : null;
    var triple = forced ? null : { power: arg.power, aim: arg.aim, quality: arg.quality, holdMs: arg.holdMs };
    // 1. in-game pending
    if (st.game && st.game.pending) {
      var gp = st.game.pending;
      if (gp.type === 'USER_KICKOFF') return dispatch('applyUserKickoff', arg.timing !== undefined ? { timing: arg.timing } : null);
      if (triple) return dispatch('applyUserKick', triple);
      var res = K.resolve(rng, gp.ctx, null, neutralInput(gp.ctx), { forced: forced });
      RTG.Sim.applyKick(st.game, st, rng, res);
      s.touch('applyUserKick', res, { forced: true, noSync: true });
      return clone(res);
    }
    // 2. pending kick session
    if (st.pending && st.pending.kind === 'KICKS') {
      var sess = st.pending.session;
      var idx = nextSessionIdx(sess);
      if (idx < 0) throw new Error('debug.forceKick: the session is complete');
      var ctx = sess.contexts[idx];
      if (triple || ctx.type === 'KO') return dispatch('sessionKick', ctx.type === 'KO' ? (arg.timing !== undefined ? { timing: arg.timing } : null) : triple);
      var result = K.resolve(rng, ctx, null, neutralInput(ctx), { forced: forced });
      sess.results[idx] = result;
      sess.idx = sess.results.length;
      var done = nextSessionIdx(sess) < 0, outcome = null;
      if (done) {
        outcome = RTG.Career.finishSession(st, rng);
        if (isFn(RTG.Career.resume)) RTG.Career.resume(st, rng);
      }
      var out = { result: result, idx: idx, done: done, outcome: outcome, remaining: done ? 0 : sess.contexts.length - sess.results.length };
      s.touch('sessionKick', out, { forced: true, noSync: true, autosave: done });
      return clone(result);
    }
    throw new Error('debug.forceKick: no pending kick (game or session)');
  };

  /** UI kick scenes resolve every user kick through autoKick without input while this is on. */
  D.autoKick = function (on) { store().autoKickAll = !!on; return store().autoKickAll; };
  D.autoKickEnabled = function () { return !!(RTG.UI.store && RTG.UI.store.autoKickAll); };

  // ─────────────────────────── player edits ───────────────────────────

  D.setAttrs = function (attrs) {
    var st = state(), p = st.player;
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k) && p.attrs[k] !== undefined) {
      p.attrs[k] = RTG.Util.roundClamp(attrs[k], 1, 99);
      if (p.pot && p.pot[k] < p.attrs[k]) p.pot[k] = p.attrs[k];
    }
    store().touch('setAttrs', clone(p.attrs));
    return clone(p.attrs);
  };
  var SOFT = { morale: [0, 100], trust: [0, 100], fans: [0, 100], js: [0, 100], fame: [0, 1000], form: [-6, 6], xp: [0, 1e9], age: [16, 60] };
  D.setSoft = function (soft) {
    var st = state(), p = st.player;
    for (var k in soft) if (Object.prototype.hasOwnProperty.call(soft, k) && SOFT[k]) p[k] = RTG.Util.clamp(soft[k], SOFT[k][0], SOFT[k][1]);
    store().touch('setSoft', soft);
    return { morale: p.morale, trust: p.trust, fans: p.fans, js: p.js, fame: p.fame, form: p.form, xp: p.xp };
  };
  D.addXp = function (n) { var p = state().player; p.xp = Math.max(0, Math.round(p.xp + (n | 0))); store().touch('addXp', p.xp); return p.xp; };
  D.addMod = function (mod) { var m = RTG.Player.addMod(state().player, mod); store().touch('addMod', m); return clone(m); };

  // ─────────────────────────── analysis ───────────────────────────

  function ctxFor(st, distance, over, attrs) {
    var sit = { type: 'FG', distance: distance, hash: 0, forSession: true, calm: true, isUser: true };
    for (var k in over || {}) if (Object.prototype.hasOwnProperty.call(over, k)) sit[k] = over[k];
    if (attrs) sit.attrs = attrs;
    return RTG.Kick.buildContext(st, null, sit);
  }

  /** {attrs?, distance, n?, ctxOverrides?} → {pct, n, made, model} using the AI input on a throwaway rng. */
  D.montecarlo = function (o) {
    o = o || {};
    var st = state(), K = RTG.Kick;
    var attrs = o.attrs || null;
    var ctx = ctxFor(st, o.distance || 45, o.ctxOverrides, attrs);
    var n = o.n || 2000, made = 0, r = RTG.RNG.create(o.seed || 424242);
    for (var i = 0; i < n; i++) if (K.resolve(r, ctx, attrs, K.aiInput(r, ctx, attrs)).made) made++;
    return { pct: made / n, n: n, made: made, model: K.model(ctx, attrs) };
  };

  /** FG% by distance bucket for the current player (AI input), n kicks per bucket. */
  D.balance = function (n) {
    var mids = [{ bucket: '0-29', d: 25 }, { bucket: '30-39', d: 35 }, { bucket: '40-49', d: 45 }, { bucket: '50-59', d: 54 }, { bucket: '60+', d: 61 }];
    return mids.map(function (m) {
      var r = D.montecarlo({ distance: m.d, n: n || 1000 });
      return { bucket: m.bucket, distance: m.d, n: r.n, pct: Math.round(r.pct * 1000) / 10, model: Math.round(r.model.pMake * 1000) / 10 };
    });
  };

  /** {fps, frameP95Ms, heapMB|null, rafActive, listeners, storeListeners, windowListeners} */
  D.perf = function () {
    var d = raf.deltas.slice().sort(function (a, b) { return a - b; });
    var mean = 0;
    for (var i = 0; i < d.length; i++) mean += d[i];
    mean = d.length ? mean / d.length : 0;
    var p95 = d.length ? d[Math.min(d.length - 1, Math.floor(d.length * 0.95))] : 0;
    var heap = root.performance && root.performance.memory ? root.performance.memory.usedJSHeapSize / 1048576 : null;
    var sl = RTG.UI.store ? RTG.UI.store.listenerCount() : 0;
    var Cv = RTG.UI.Canvas;
    var canvasActive = Cv && isFn(Cv.active) ? !!Cv.active() : null;
    var cp = null;
    if (Cv && isFn(Cv.perf)) { try { cp = Cv.perf(); } catch (e) { cp = null; } }
    var fps = mean ? Math.round(1000 / mean) : 0, p95r = Math.round(p95 * 100) / 100;
    if (cp && typeof cp.frameP95Ms === 'number' && cp.frameP95Ms > 0 && canvasActive) { fps = cp.fps; p95r = cp.frameP95Ms; }
    return {
      fps: fps,
      frameP95Ms: p95r,
      frames: d.length,
      heapMB: heap === null ? null : Math.round(heap * 10) / 10,
      rafActive: canvasActive !== null ? (canvasActive || raf.outstanding > 0) : raf.outstanding > 0,
      rafOutstanding: raf.outstanding,
      listeners: sl + listeners.count,
      storeListeners: sl,
      windowListeners: listeners.count
    };
  };
  D.perfReset = function () { raf.deltas.length = 0; raf.last = 0; };

  // ─────────────────────────── saves / storage ───────────────────────────

  D.save = function (slot) { return store().save(slot === undefined ? 'auto' : slot); };
  D.load = function (slot) { return store().load(slot === undefined ? 'auto' : slot); };
  D.clearStorage = function () { RTG.UI.Storage.clear('rtg.'); return RTG.UI.Storage.keys(); };
  D.exportString = function () { return RTG.Save.exportString(store().blob()); };
  D.importString = function (s) {
    var blob = RTG.Save.importString(s);
    if (!blob || blob.error) return { ok: false, error: 'Import rejected: not a save string' };
    return store().load(blob);
  };
  D.storageKeys = function () { return RTG.UI.Storage.keys(); };

  // ─────────────────────────── tuning ───────────────────────────

  /** tune(path) reads; tune(path, value) writes into RTG.Tuning (plain mutable tree). */
  D.tune = function (path, value) {
    if (value === undefined) return RTG.Util.getPath(RTG.Tuning, path);
    RTG.Util.setPath(RTG.Tuning, path, value);
    return RTG.Util.getPath(RTG.Tuning, path);
  };
  D.validate = function () { return RTG.Schema.validate(state()); };

  // ─────────────────────────── panel ───────────────────────────

  var panel = null;

  D.mountPanel = function () {
    if (panel || !doc) return panel;
    var c = RTG.UI.C;
    var open = false;
    var dump = c.el('pre', { class: 'dbg-dump', hidden: true });
    var status = c.el('div', { class: 'dbg-status' });
    function refresh() {
      var st = RTG.UI.store.state;
      var txt = st ? (st.stage + '.' + st.phase + ' Y' + st.year + ' W' + st.week + ' · pending ' + (st.pending ? st.pending.kind + (st.pending.session ? ':' + st.pending.session.kind : st.pending.decision ? ':' + st.pending.decision.kind : '') : '—') + (st.game ? ' · GAME' + (st.game.pending ? ':' + st.game.pending.type : '') : '')) : 'no career';
      status.textContent = 'screen ' + Router().current() + ' · ' + txt;
      if (!dump.hidden && st) dump.textContent = JSON.stringify({ stage: st.stage, phase: st.phase, year: st.year, week: st.week, seed: st.seed, rngState: st.rngState, pending: st.pending, game: st.game ? { id: st.game.id, q: st.game.q, clock: st.game.clock, score: st.game.score, pending: st.game.pending ? st.game.pending.type : null } : null, player: st.player }, null, 1);
    }
    function run(label, fn) {
      return c.button({ label: label, small: true, kind: 'secondary', onClick: function () {
        try { var r = fn(); if (r !== undefined && root.console) root.console.log('[debug] ' + label, r); }
        catch (e) { c.toast(String(e.message || e), 'bad', 4000); if (root.console) root.console.error(e); }
        refresh();
      } });
    }
    var grid = c.el('div', { class: 'dbg-grid' }, [
      run('NEW', function () { return D.newCareer({ seed: Math.floor(Math.random() * 1e6) }); }),
      run('SETTLE', function () { return D.settle(); }),
      run('KICK GOOD', function () { return D.forceKick({ outcome: 'GOOD' }); }),
      run('KICK MISS', function () { return D.forceKick({ outcome: 'WIDE_R' }); }),
      run('DOINK', function () { return D.forceKick({ outcome: 'DOINK_IN' }); }),
      run('SIM GAME', function () { return D.simGame(); }),
      run('SIM WEEK', function () { return D.simWeek(); }),
      run('SIM SEASON', function () { return D.simSeason(); }),
      run('OFFSEASON', function () { return D.simOffseason(); }),
      run('→ COLLEGE', function () { return D.jumpTo({ stage: 'COLLEGE', phase: 'REG', week: 1 }); }),
      run('→ NFL', function () { return D.jumpTo({ stage: 'NFL', phase: 'REG', week: 1 }); }),
      run('→ RETIRED', function () { return D.jumpTo({ stage: 'RETIRED' }); }),
      run('NEXT PHASE', function () { return D.nextPhase(); }),
      run('EVENT', function () { return D.triggerEvent('NIL_TRUCK'); }),
      run('+500 XP', function () { return D.addXp(500); }),
      run('VALIDATE', function () { var v = D.validate(); c.toast(v.ok ? 'state valid' : v.errors.slice(0, 2).join(' | '), v.ok ? 'good' : 'bad'); return v; }),
      run('SAVE', function () { return D.save('auto'); }),
      run('LOAD', function () { return D.load('auto'); }),
      run('PERF', function () { var p = D.perf(); c.toast(p.fps + ' fps · p95 ' + p.frameP95Ms + ' ms · ' + p.listeners + ' listeners', 'info', 4000); return p; }),
      run('DUMP', function () { dump.hidden = !dump.hidden; })
    ]);
    var body = c.el('div', { class: 'dbg-body', hidden: true }, status, grid, dump);
    var toggle = c.button({ label: 'DEBUG', small: true, kind: 'gold', class: 'dbg-toggle', onClick: function () { open = !open; body.hidden = !open; panel.classList.toggle('open', open); refresh(); } });
    panel = c.el('div', { class: 'dbg-panel', role: 'region', 'aria-label': 'Debug panel' }, toggle, body);
    doc.body.appendChild(panel);
    RTG.UI.store.subscribe(refresh);
    Router().onChange(refresh);
    refresh();
    return panel;
  };

  RTG.debug = D;
})(typeof window !== 'undefined' ? window : globalThis);
