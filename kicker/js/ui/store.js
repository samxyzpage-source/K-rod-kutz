/**
 * Road to Glory: Kicker — RTG.UI.Store (SPEC §4.4, UI_API.md §Store).
 *
 * The one object that owns the live CareerState and its RNG. Screens read `store.state` and change it ONLY through
 * `store.dispatch('EngineFn', ...args)`, which calls `RTG.Engine[fn](state, rng, ...args)`, writes `state.rngState`
 * back, validates in debug mode, autosaves after the §3.7 functions, re-routes (Router.sync) and notifies
 * subscribers with `{fnName, result, args}`.
 *
 *   var store = new RTG.UI.Store();       // app.js creates the singleton RTG.UI.store
 *   store.state · store.rng · store.settings · store.uiRng
 *   store.dispatch(fnName, ...args) → result
 *   store.subscribe(fn) → unsubscribe        fn({fnName, result, args, store})
 *   store.replace(state, rng) · store.newCareer(opts) · store.hasCareer()
 *   store.save(slotKey) → {ok, error?} · store.load(slotKey) → {ok, error?, warnings?} · store.autosave() → boolean
 *   store.saveSettings() · store.setSetting(key, value) · store.resetSettings()
 *   store.touch(fnName, result) — notify + sync without an engine call (debug / forced results)
 *   store.getRecords() / store.addCareerRecord(entry) — the cross-save `rtg.records` block
 *
 * Sync rule: after a dispatch the store calls Router.sync() EXCEPT for the in-scene functions listed in NO_SYNC
 * (the scene that dispatched them owns the transition — see UI_API.md).
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};

  var KEYS = {
    settings: 'rtg.settings',
    records: 'rtg.records',
    auto: 'rtg.save.auto',
    slot: function (n) { return 'rtg.save.' + n; }
  };

  /** Engine functions that take (state, ...args) without an rng. */
  var NO_RNG = { spendXp: 1, autoSpend: 1, autoOption: 1 };

  /** Functions after which the store autosaves (SPEC §3.7 + the autoPlay* helpers). sessionKick autosaves when done. */
  var AUTOSAVE = {
    finishUserGame: 1, endWeek: 1, chooseEvent: 1, decide: 1, nextPhase: 1,
    autoPlayGame: 1, autoPlayWeek: 1, autoPlaySeason: 1, autoPlayOffseason: 1, autoPlayCareer: 1, settlePending: 1
  };

  /**
   * Functions after which the store does NOT call Router.sync(): the in-game step functions (the game / kick
   * scenes own the game loop), sessionKick (the session scenes call Router.sync() after their result beat),
   * finishUserGame (the game screen routes to 'postgame' itself), the hub-local training calls and markRead.
   */
  var NO_SYNC = {
    simStep: 1, simToKick: 1, applyUserKick: 1, autoKick: 1, applyUserKickoff: 1,
    sessionKick: 1, finishUserGame: 1, train: 1, spendXp: 1, autoSpend: 1, autoOption: 1, markRead: 1
  };

  /** Not dispatchable (they create or load a state instead of mutating one). */
  var NOT_DISPATCHABLE = { newCareer: 1, save: 1, load: 1 };

  function defaultSettings() {
    return {
      audio: true,
      autoPat: 'off',
      playKickoffs: false,
      simSpeed: 1,
      colorblind: false,
      highContrast: false,
      reducedMotion: false,
      fontScale: 1,
      leftFooted: false,
      inputMode: 'flick',
      playClockMult: 1,
      tooltips: true,
      haptics: true,
      keys: { confirm: ' ', confirmAlt: 'Enter', left: 'ArrowLeft', right: 'ArrowRight' }
    };
  }

  var ALLOWED = {
    autoPat: ['off', 'safe', 'all'], simSpeed: [1, 2, 4], fontScale: [1, 1.25, 1.5],
    inputMode: ['flick', 'meter'], playClockMult: [1, 2]
  };

  function sanitizeSettings(raw) {
    var d = defaultSettings();
    if (!raw || typeof raw !== 'object') return d;
    var k;
    for (k in d) {
      if (!Object.prototype.hasOwnProperty.call(d, k) || raw[k] === undefined) continue;
      if (k === 'keys') {
        if (raw.keys && typeof raw.keys === 'object') {
          for (var kk in d.keys) if (typeof raw.keys[kk] === 'string' && raw.keys[kk]) d.keys[kk] = raw.keys[kk];
        }
      } else if (typeof d[k] === 'boolean') {
        d[k] = !!raw[k];
      } else if (ALLOWED[k]) {
        if (ALLOWED[k].indexOf(raw[k]) >= 0) d[k] = raw[k];
      } else {
        d[k] = raw[k];
      }
    }
    return d;
  }

  function nowMs() { return Date.now(); }

  function Store() {
    this.state = null;
    this.rng = null;
    this.settings = sanitizeSettings(RTG.UI.Storage ? RTG.UI.Storage.getJSON(KEYS.settings) : null);
    this.uiRng = RTG.RNG.create((nowMs() ^ 0x9e3779b9) >>> 0);
    this.lastDispatch = null;
    this.lastAutosaveAt = 0;
    this.autoKickAll = false;        // RTG.debug.autoKick(true): kick scenes resolve every user kick via autoKick
    this._subs = [];
    this._playMark = 0;
    this._debug = null;              // null = derive from RTG.debug.strict / ?debug=1 at call time
  }

  Store.KEYS = KEYS;
  Store.NO_RNG = NO_RNG;
  Store.AUTOSAVE = AUTOSAVE;
  Store.NO_SYNC = NO_SYNC;
  Store.defaultSettings = defaultSettings;
  Store.sanitizeSettings = sanitizeSettings;

  /** Debug mode: ?debug=1 in the URL or RTG.debug.strict. */
  Store.prototype.isDebug = function () {
    if (this._debug !== null) return this._debug;
    var q = root.location && typeof root.location.search === 'string' ? root.location.search : '';
    if (/[?&]debug=1\b/.test(q)) return true;
    return !!(RTG.debug && RTG.debug.strict);
  };
  Store.prototype.setDebug = function (on) { this._debug = on === null ? null : !!on; };

  Store.prototype.hasCareer = function () { return !!(this.state && this.rng); };

  // ─────────────────────────── subscriptions ───────────────────────────

  /** @returns {function} unsubscribe */
  Store.prototype.subscribe = function (fn) {
    if (typeof fn !== 'function') throw new Error('Store.subscribe: a function is required');
    var subs = this._subs;
    subs.push(fn);
    var done = false;
    return function unsubscribe() {
      if (done) return;
      done = true;
      var i = subs.indexOf(fn);
      if (i >= 0) subs.splice(i, 1);
    };
  };

  Store.prototype.listenerCount = function () { return this._subs.length; };

  Store.prototype._notify = function (info) {
    var list = this._subs.slice();
    info.store = this;
    for (var i = 0; i < list.length; i++) {
      try { list[i](info); } catch (e) { if (root.console) root.console.error('Store subscriber failed after ' + info.fnName, e); }
    }
  };

  Store.prototype._sync = function (force) {
    var R = RTG.UI.Router;
    if (R && typeof R.sync === 'function') {
      try { R.sync(force ? { force: true } : undefined); } catch (e) { if (root.console) root.console.error('Router.sync failed', e); }
    }
  };

  Store.prototype._validate = function (label) {
    if (!this.isDebug() || !this.state || !RTG.Schema || typeof RTG.Schema.validate !== 'function') return;
    var r = RTG.Schema.validate(this.state);
    if (!r.ok) throw new Error('Schema invalid after ' + label + ': ' + r.errors.slice(0, 5).join(' | '));
  };

  Store.prototype._tickPlaytime = function () {
    if (!this.state) return;
    var t = nowMs();
    if (this._playMark) {
      var d = Math.round((t - this._playMark) / 1000);
      if (d > 0 && d < 6 * 3600) this.state.playtimeSec = (this.state.playtimeSec || 0) + d;
    }
    this._playMark = t;
  };

  // ─────────────────────────── dispatch ───────────────────────────

  /**
   * Call RTG.Engine[fnName](state, rng, ...args). See the file header for the sync / autosave rules.
   * @returns {*} the engine result
   */
  Store.prototype.dispatch = function (fnName) {
    var args = Array.prototype.slice.call(arguments, 1);
    if (!this.state || !this.rng) throw new Error('Store.dispatch(' + fnName + '): no career loaded');
    if (NOT_DISPATCHABLE[fnName]) throw new Error('Store.dispatch: use store.' + fnName + '() instead of dispatching ' + fnName);
    var E = RTG.Engine;
    var fn = E && E[fnName];
    if (typeof fn !== 'function') throw new Error('Store.dispatch: unknown Engine function "' + fnName + '"');
    var callArgs = NO_RNG[fnName] ? [this.state].concat(args) : [this.state, this.rng].concat(args);
    var result = fn.apply(E, callArgs);
    this.state.rngState = this.rng.state();
    this._validate(fnName);
    this.lastDispatch = { fnName: fnName, result: result, at: nowMs() };
    if (AUTOSAVE[fnName] || (fnName === 'sessionKick' && result && result.done)) this.autosave();
    if (!NO_SYNC[fnName]) this._sync();
    this._notify({ fnName: fnName, result: result, args: args });
    return result;
  };

  /**
   * Notify + sync without an engine call (debug tools, forced kicks, direct state edits). `fnName` is what
   * subscribers see (e.g. 'applyUserKick' for a forced kick so the kick scene renders the result).
   */
  Store.prototype.touch = function (fnName, result, opts) {
    opts = opts || {};
    if (this.state && this.rng) this.state.rngState = this.rng.state();
    this._validate(fnName || 'touch');
    this.lastDispatch = { fnName: fnName || 'touch', result: result, at: nowMs(), forced: !!opts.forced };
    if (opts.autosave) this.autosave();
    if (!opts.noSync) this._sync();
    this._notify({ fnName: fnName || 'touch', result: result, args: [], forced: !!opts.forced });
    return result;
  };

  // ─────────────────────────── state lifecycle ───────────────────────────

  /** Replace the live state (and rng), then Router.sync({force:true}) + notify with fnName 'replace'. */
  Store.prototype.replace = function (state, rng) {
    this.state = state || null;
    if (state && !rng) rng = RTG.RNG.create(state.rngState >>> 0);
    this.rng = state ? rng : null;
    this._playMark = state ? nowMs() : 0;
    if (state) {
      if (!state.settings && RTG.Schema) state.settings = RTG.Schema.mirrorSettings(this.settings);
      this._validate('replace');
    }
    this._sync(true);
    this._notify({ fnName: 'replace', result: state, args: [] });
    return state;
  };

  /** Drop the career (back to the title). */
  Store.prototype.clear = function () { return this.replace(null, null); };

  /**
   * Engine.newCareer(opts, Date.now()) → replace. `opts.settings` defaults to the UI settings (the engine mirrors
   * autoPat / playKickoffs / simSpeed into state.settings).
   */
  Store.prototype.newCareer = function (opts) {
    opts = opts || {};
    var o = {};
    for (var k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k];
    if (!o.settings) o.settings = this.settings;
    var r = RTG.Engine.newCareer(o, nowMs());
    this.replace(r.state, r.rng);
    this.autosave();
    return this.state;
  };

  // ─────────────────────────── saves ───────────────────────────

  function slotKey(slot) {
    if (slot === undefined || slot === null || slot === 'auto') return KEYS.auto;
    var s = String(slot);
    if (s.indexOf('rtg.save.') === 0) return s;
    return KEYS.slot(s);
  }
  Store.slotKey = slotKey;

  /** Build the current save blob (Engine.save with the wall clock). */
  Store.prototype.blob = function () {
    if (!this.state) return null;
    this._tickPlaytime();
    return RTG.Engine.save(this.state, this.rng, nowMs());
  };

  /** @returns {{ok:boolean, error?:string, key:string, bytes?:number}} */
  Store.prototype.save = function (slot) {
    var key = slotKey(slot);
    if (!this.state) return { ok: false, error: 'No career to save', key: key };
    var blob;
    try { blob = this.blob(); } catch (e) { return { ok: false, error: 'Save failed: ' + e.message, key: key }; }
    var json = JSON.stringify(blob);
    var stored = RTG.UI.Storage.setItem(key, json);
    return { ok: true, key: key, bytes: json.length, persisted: stored, savedAt: blob.savedAt };
  };

  /** Autosave to rtg.save.auto (never throws). @returns {boolean} */
  Store.prototype.autosave = function () {
    if (!this.state) return false;
    try {
      var r = this.save('auto');
      if (r.ok) this.lastAutosaveAt = r.savedAt;
      return !!r.ok;
    } catch (e) {
      if (root.console) root.console.error('autosave failed', e);
      return false;
    }
  };

  var LOAD_MESSAGES = {
    NEWER: 'This save is from a newer version of the game.',
    CHECKSUM: 'Save rejected: checksum mismatch (the data was altered).',
    INVALID: 'Save rejected: the data is not a valid career.',
    NO_MIGRATION: 'Save rejected: no migration path for this save version.',
    EMPTY: 'That slot is empty.',
    PARSE: 'Save rejected: not readable JSON.'
  };
  Store.LOAD_MESSAGES = LOAD_MESSAGES;

  /**
   * Load a slot (or a blob / JSON string passed directly) via Save.deserialize → replace.
   * @returns {{ok:boolean, error?:string, code?:string, warnings?:string[], summary?:Object}}
   */
  Store.prototype.load = function (slotOrBlob) {
    var blob = slotOrBlob;
    if (typeof slotOrBlob !== 'object' || slotOrBlob === null) {
      var raw = RTG.UI.Storage.getItem(slotKey(slotOrBlob));
      if (raw === null) return { ok: false, code: 'EMPTY', error: LOAD_MESSAGES.EMPTY };
      try { blob = JSON.parse(raw); } catch (e) { return { ok: false, code: 'PARSE', error: LOAD_MESSAGES.PARSE }; }
    }
    return this.loadBlob(blob);
  };

  Store.prototype.loadBlob = function (blob) {
    var r = RTG.Save.deserialize(blob);
    if (!r || r.error) {
      var code = (r && r.error) || 'INVALID';
      var msg = LOAD_MESSAGES[code] || ('Save rejected: ' + code);
      if (r && r.message && code !== 'CHECKSUM') msg = msg + ' (' + r.message + ')';
      return { ok: false, code: code, error: msg, errors: r && r.errors ? r.errors : [] };
    }
    var rng = RTG.RNG.create(r.rngState >>> 0);
    this.replace(r.state, rng);
    return { ok: true, warnings: r.warnings || [], migrated: !!r.migrated, summary: RTG.Save.slotSummary(blob) };
  };

  /** Slot summary (Save.slotSummary) or null for an empty / unreadable slot. */
  Store.prototype.slotSummary = function (slot) {
    var blob = RTG.UI.Storage.getJSON(slotKey(slot));
    if (!blob) return null;
    try { return RTG.Save.slotSummary(blob); } catch (e) { return null; }
  };

  Store.prototype.deleteSlot = function (slot) { RTG.UI.Storage.removeItem(slotKey(slot)); };

  // ─────────────────────────── settings ───────────────────────────

  /** Persist settings, mirror the per-career subset into state.settings and notify with fnName 'settings'. */
  Store.prototype.saveSettings = function () {
    this.settings = sanitizeSettings(this.settings);
    RTG.UI.Storage.setJSON(KEYS.settings, this.settings);
    if (this.state && RTG.Schema && typeof RTG.Schema.mirrorSettings === 'function') {
      this.state.settings = RTG.Schema.mirrorSettings(this.settings);   // UI-owned per-career mirror (SPEC §3.4)
    }
    this._notify({ fnName: 'settings', result: this.settings, args: [] });
    return this.settings;
  };

  Store.prototype.setSetting = function (key, value) {
    if (key === 'keys' && value && typeof value === 'object') {
      for (var k in value) if (Object.prototype.hasOwnProperty.call(value, k)) this.settings.keys[k] = value[k];
    } else {
      this.settings[key] = value;
    }
    return this.saveSettings();
  };

  Store.prototype.resetSettings = function () {
    this.settings = defaultSettings();
    return this.saveSettings();
  };

  // ─────────────────────────── cross-save records (rtg.records) ───────────────────────────

  function emptyRecords() { return { careers: [], best: {} }; }

  /** @returns {{careers:Object[], best:Object}} */
  Store.prototype.getRecords = function () {
    var r = RTG.UI.Storage.getJSON(KEYS.records);
    if (!r || typeof r !== 'object') return emptyRecords();
    if (!Array.isArray(r.careers)) r.careers = [];
    if (!r.best || typeof r.best !== 'object') r.best = {};
    return r;
  };

  /**
   * Append a finished career {seed, name, tier, hof, fgm, long, gw, seasons, finishedAt} and refresh `best`
   * ({[key]: {value, name}} for hof / fgm / long / gw / seasons). Keeps the newest 50 careers.
   */
  Store.prototype.addCareerRecord = function (entry) {
    var r = this.getRecords();
    var e = {};
    for (var k in entry) if (Object.prototype.hasOwnProperty.call(entry, k)) e[k] = entry[k];
    if (!e.finishedAt) e.finishedAt = nowMs();
    r.careers.push(e);
    if (r.careers.length > 50) r.careers = r.careers.slice(r.careers.length - 50);
    var keys = ['hof', 'fgm', 'long', 'gw', 'seasons'];
    for (var i = 0; i < keys.length; i++) {
      var v = e[keys[i]];
      if (typeof v !== 'number') continue;
      var cur = r.best[keys[i]];
      if (!cur || v > cur.value) r.best[keys[i]] = { value: v, name: e.name || '', seed: e.seed };
    }
    RTG.UI.Storage.setJSON(KEYS.records, r);
    this._notify({ fnName: 'records', result: r, args: [] });
    return r;
  };

  RTG.UI.Store = Store;
})(typeof window !== 'undefined' ? window : globalThis);
