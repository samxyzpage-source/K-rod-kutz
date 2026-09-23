/**
 * Road to Glory: QB — RTG.debug (the scripted API the tests drive; the kicker's SPEC §3.8 idea for the demo).
 *
 * Always loaded. Every function is synchronous and JSON-serialisable in its return (functions are dropped, there
 * are no cycles), so the e2e harness can call it: H.debug(page, 'current').
 *
 *   forceResult(kind, {target?, input?}) → PlayResult   resolve the live moment with Play.forcedResult(sim, kind):
 *                     'CATCH' | 'FIRST_DOWN' | 'TD' | 'INCOMPLETE' | 'INT' | 'SACK' | 'DROP' | 'THROWAWAY' | 'SCRAMBLE' | 'FUMBLE'.
 *                     From SITUATION / READ it reads and snaps the first pass card first; the scene animates the
 *                     result and the shell records it (the throw fork is consumed so the drive replays the same).
 *   current()        {screen, stage, idx, kind, phase, situation, ctx, sim, target, t, hold, power, lead, loft, zone, actors, lastInput, result}
 *   seed()           the drive's seed as typed ('4242' / 'a word'); state().seedNum is the uint32
 *   state()          {screen, stage, phase, drive, script, line, rating, results, settings}
 *   skipTo('summary' | 'title')   resolve every remaining moment headlessly (store.autoResolve) and route there
 *   autoThrow()      resolve the live moment through the engine with store.autoInput (the most open receiver, on time)
 *   newDrive({seed, archetype, team, venue}) · next() · read() · pick(idx) · go(id) · summary()
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
  function view() { var v = PV() && typeof PV().current === 'function' ? PV().current() : null; return v; }
  function safe(o) { if (o === undefined) return null; try { return JSON.parse(JSON.stringify(o)); } catch (e) { return String(o); } }
  function screenObj() { return app().current ? app().current() : null; }

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
    var s = store(), v = armPlay();
    var ph = v.phase();
    if (ph !== 'SNAP' && ph !== 'THROW') return safe(v.result());   // a run option resolves itself; a result is already playing
    var sim = s.drive.sim || v.sim();
    var input = opts.input || (opts.target ? { target: opts.target } : undefined);
    var res = RTG.Play.forcedResult(sim, String(kind || 'CATCH').toUpperCase(), input);
    if (s.rng) s.rng.fork('play:throw');                                                 // as Play.throw would: 1 parent draw
    v.playResult(res);
    return safe(res);
  };

  D.autoThrow = function () {
    var s = store(), v = armPlay();
    var ph = v.phase();
    if (ph !== 'SNAP' && ph !== 'THROW') return safe(v.result());
    var sim = s.drive.sim || v.sim();
    var input = s.autoInput(sim);
    var res = s.throwBall(input);
    v.playResult(res);
    return safe(res);
  };

  D.skipTo = function (id) {
    var s = store();
    id = id || 'summary';
    if (id === 'title') { app().go('title'); return app().screen(); }
    if (id !== 'summary') throw new Error('RTG.debug.skipTo: unknown target ' + id);
    if (!s.hasDrive()) s.newDrive({});
    var guard = 0;
    while (!s.isDone() && guard++ < 12) s.autoResolve();
    app().go('summary');
    return app().screen();
  };

  D.summary = function () { return safe(store().summary()); };

  // ─────────────────────────── inspection ───────────────────────────

  D.current = function () {
    var s = store(), d = s.drive, v = view(), sc = screenObj();
    var cur = v ? v.current() : null;
    var out = {
      screen: app().screen(), stage: sc && sc.el && sc.el.getAttribute ? sc.el.getAttribute('data-stage') : null,
      idx: d ? d.idx : null, kind: d && d.situation ? d.situation.kind : null, pending: d ? d.pending : null,
      phase: v ? v.phase() : null,
      situation: d ? safe(d.situation) : null, ctx: d ? safe(d.ctx) : null,
      sim: cur && cur.sim ? safe(cur.sim) : (d && d.sim ? safe(d.sim) : null),
      target: cur ? cur.target : null, t: cur ? cur.t : null, play: cur ? cur.play : null,
      hold: cur ? !!cur.hold : false, power: cur ? cur.power : null, lead: cur ? cur.lead : null, loft: cur ? cur.loft : null,
      zone: v && v.greenZone ? safe(v.greenZone()) : null,
      actors: v && v.actors ? safe(v.actors()) : null,
      lastInput: v && v.lastInput ? safe(v.lastInput()) : null,
      result: v && v.result ? safe(v.result()) : null
    };
    return out;
  };

  D.state = function () {
    var s = store(), d = s.drive, v = view();
    var line = s.line();
    return {
      screen: app().screen(), phase: v ? v.phase() : null,
      drive: d ? { seed: d.seed, seedNum: d.seedNum, archetype: d.archetype, team: d.team, venue: d.venue, idx: d.idx, pending: d.pending, advance: d.advance, weather: safe(d.weather), climate: d.climate, week: d.week } : null,
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

  /** Set a Tuning leaf by dotted path ('qb.throw.meterHoldMs', 900) in place. */
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
