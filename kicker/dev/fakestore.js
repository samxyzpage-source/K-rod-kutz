/**
 * Road to Glory: Kicker — dev harness for the kick scene (kicker/dev/kickscene.html).
 *
 * Uses the real shell (RTG.UI.Store / Router / C / Palette, RTG.debug) when those files are loaded and falls
 * back to minimal fakes with the same contract otherwise. Builds careers through RTG.Engine.newCareer and
 * cycles kick situations (PAT, 45 calm, 55 windy decisive, snow, iced, college hash, showcase, camp battle,
 * combine, game, practice). Dev only — never shipped in index.html.
 *
 *   RTG.Dev.boot(hostEl)                 mounts the router into hostEl and reads ?sit=&mode=&diff=&reduced=&left=&autostart=1
 *   RTG.Dev.setup(name, opts)            builds the situation and routes to its screen
 *   RTG.Dev.SITUATIONS                   {id: {label, run}}
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var doc = root.document;
  var Dev = {};

  // ───────────────────────────── fakes (only when the shell is missing) ─────────────────────────────
  if (!RTG.UI.Palette) {
    RTG.UI.Palette = {
      navy: '#1b1f3a', navy2: '#262b4d', cream: '#f4e9d0', ink: '#101226', grass: '#3a8c3f', grass2: '#2e7233', chalk: '#f2f2e6',
      gold: '#f6c445', red: '#d8433a', sky: '#7fc7ff', mint: '#4dbb63', grey: '#8a8f9e', dusk: '#5b3a6e', steel: '#c9ccd6', night: '#12142a',
      get: function (t) { return this[t]; },
      teamTint: function (teamOrId) {
        var t = typeof teamOrId === 'object' ? teamOrId : (RTG.UI.store && RTG.UI.store.state ? RTG.Schema.teamById(RTG.UI.store.state, teamOrId) : null);
        return t && t.colors ? [t.colors[0], t.colors[1]] : ['#f6c445', '#f4e9d0'];
      },
      findTeam: function (id) { return RTG.UI.store && RTG.UI.store.state ? RTG.Schema.teamById(RTG.UI.store.state, id) : null; },
      setTeamVars: function () {}
    };
  }
  if (!RTG.UI.C) {
    var C = {};
    C.el = function (tag, attrs) {
      var e = doc.createElement(tag);
      if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) {
        var v = attrs[k];
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v;
        else if (k === 'style' && typeof v === 'object') { for (var s in v) e.style[s] = v[s]; }
        else if (k.indexOf('on') === 0 && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'disabled' || k === 'hidden') e[k] = v; else e.setAttribute(k, v === true ? '' : v);
      }
      function add(ch) { if (ch === null || ch === undefined || ch === false) return; if (Array.isArray(ch)) { ch.forEach(add); return; } if (ch.nodeType) e.appendChild(ch); else e.appendChild(doc.createTextNode(String(ch))); }
      for (var i = 2; i < arguments.length; i++) add(arguments[i]);
      return e;
    };
    C.clear = function (el) { while (el.firstChild) el.removeChild(el.firstChild); return el; };
    C.button = function (o) { var b = C.el('button', { class: 'btn btn-' + (o.kind || 'secondary') + (o.small ? ' btn-sm' : '') + (o.class ? ' ' + o.class : ''), type: 'button', disabled: !!o.disabled, 'aria-label': o.ariaLabel, onClick: o.onClick }); b.appendChild(C.el('span', { class: 'btn-label', text: o.label || '' })); return b; };
    C.buttonRow = function (btns) { return C.el('div', { class: 'btn-row' }, btns); };
    C.chip = function (t, kind) { return C.el('span', { class: 'chip' + (kind ? ' chip-' + kind : ''), text: t }); };
    C.card = function (o) { var s = C.el('section', { class: 'card' + (o.class ? ' ' + o.class : '') }); if (o.title) s.appendChild(C.el('h2', { class: 'card-title', text: o.title })); s.appendChild(C.el('div', { class: 'card-body' }, o.body)); return s; };
    C.toast = function (t) { var h = doc.getElementById('toast-host') || doc.body.appendChild(C.el('div', { id: 'toast-host', class: 'toast-host' })); var e = C.el('div', { class: 'toast', text: t }); h.appendChild(e); setTimeout(function () { if (e.parentNode) e.parentNode.removeChild(e); }, 2600); return e; };
    C.announce = function (t) { var l = doc.getElementById('live'); if (l) l.textContent = t; };
    C.icon = function (name, size) { var s = C.el('span', { class: 'icon icon-' + name, text: name === 'check' ? '✓' : name === 'x' ? '✗' : name === 'heart' ? '♥' : '·' }); s.style.fontSize = (size || 12) + 'px'; return s; };
    C.crest = function (id, size) { var t = RTG.UI.Palette.teamTint(id); return C.el('span', { class: 'crest', style: { display: 'inline-block', width: (size || 16) + 'px', height: (size || 16) + 'px', background: t[0], border: '2px solid ' + t[1] } }); };
    C.teamAbbr = function (id) { var t = RTG.UI.Palette.findTeam(id); return t ? t.abbr : String(id); };
    C.weatherIcon = function () { return 'sun'; };
    C.fmt = { clock: function (s) { return RTG.Util.fmtClock(s); }, kickType: function () { return ''; } };
    C.list = function (items, r) { return C.el('ul', {}, items.map(function (it) { return C.el('li', {}, r(it)); })); };
    C.kv = function (rows) { return C.el('dl', {}, rows.map(function (r) { return [C.el('dt', { text: r[0] }), C.el('dd', {}, r[1])]; })); };
    C.modal = function (o) { var b = C.el('div', { class: 'modal-backdrop' }, C.el('div', { class: 'modal' }, C.el('h2', { text: o.title }), o.body)); doc.body.appendChild(b); return { el: b, close: function () { if (b.parentNode) b.parentNode.removeChild(b); } }; };
    C.hideTooltip = function () {};
    C.modalOpen = function () { return false; };
    RTG.UI.C = C;
  }
  if (!RTG.UI.Store) {
    var NO_SYNC = { simStep: 1, simToKick: 1, applyUserKick: 1, autoKick: 1, applyUserKickoff: 1, sessionKick: 1, finishUserGame: 1, train: 1, spendXp: 1 };
    var NO_RNG = { spendXp: 1, autoSpend: 1, autoOption: 1 };
    function FakeStore() {
      this.state = null; this.rng = null; this.settings = { audio: false, autoPat: 'off', playKickoffs: false, simSpeed: 1, colorblind: false, highContrast: false, reducedMotion: false, fontScale: 1, leftFooted: false, inputMode: 'flick', playClockMult: 1, tooltips: true };
      this.uiRng = RTG.RNG.create((Date.now() ^ 0x9e3779b9) >>> 0); this._subs = []; this.autoKickAll = false;
    }
    FakeStore.prototype.subscribe = function (fn) { var s = this._subs; s.push(fn); return function () { var i = s.indexOf(fn); if (i >= 0) s.splice(i, 1); }; };
    FakeStore.prototype._notify = function (info) { info.store = this; this._subs.slice().forEach(function (f) { try { f(info); } catch (e) { console.error(e); } }); };
    FakeStore.prototype.dispatch = function (fn) {
      var args = Array.prototype.slice.call(arguments, 1);
      var r = RTG.Engine[fn].apply(RTG.Engine, NO_RNG[fn] ? [this.state].concat(args) : [this.state, this.rng].concat(args));
      this.state.rngState = this.rng.state();
      if (!NO_SYNC[fn]) RTG.UI.Router.sync();
      this._notify({ fnName: fn, result: r, args: args });
      return r;
    };
    FakeStore.prototype.touch = function (fn, result, o) { o = o || {}; if (!o.noSync) RTG.UI.Router.sync(); this._notify({ fnName: fn, result: result, args: [], forced: !!o.forced }); return result; };
    FakeStore.prototype.replace = function (state, rng) { this.state = state; this.rng = rng || RTG.RNG.create(state.rngState >>> 0); RTG.UI.Router.sync(); this._notify({ fnName: 'replace', result: state, args: [] }); };
    FakeStore.prototype.setSetting = function (k, v) { this.settings[k] = v; this._notify({ fnName: 'settings', result: this.settings, args: [] }); };
    FakeStore.prototype.autosave = function () { return false; };
    FakeStore.prototype.listenerCount = function () { return this._subs.length; };
    RTG.UI.Store = FakeStore;
  }
  if (!RTG.UI.Router) {
    var factories = {}, live = null, hostEl = null;
    var R = {
      register: function (id, f) { factories[id] = f; },
      has: function (id) { return !!factories[id]; },
      mount: function (el) { hostEl = el; },
      current: function () { return live ? live.id : null; },
      screen: function () { return live ? live.screen : null; },
      go: function (id, params, opts) {
        if (live) { try { live.screen.destroy(); } catch (e) { console.error(e); } if (live.screen.el.parentNode) live.screen.el.parentNode.removeChild(live.screen.el); }
        var f = factories[id];
        var screen = f ? f(RTG.UI.store, params || {}) : { el: RTG.UI.C.el('div', { class: 'screen', text: 'Screen "' + id + '" not available (dev fallback).' }), destroy: function () {} };
        screen.el.classList.add('screen'); screen.el.setAttribute('data-screen', id);
        hostEl.appendChild(screen.el);
        live = { id: id, screen: screen, params: params || {} };
        return screen;
      },
      back: function () { R.sync(); },
      resolve: function (state) {
        if (!state) return { id: 'title', params: {} };
        if (state.game) return state.game.pending ? { id: 'kick', params: { mode: 'game' } } : { id: 'game', params: {} };
        var pd = state.pending;
        if (pd && pd.kind === 'KICKS') {
          var sk = pd.session.kind;
          if (sk === 'SHOWCASE') return { id: 'showcase', params: {} };
          if (sk === 'CAMP') return { id: 'campbattle', params: {} };
          if (sk.indexOf('COMBINE') === 0) return { id: 'combine', params: {} };
          return { id: 'kick', params: { mode: 'session', session: sk } };
        }
        if (pd && pd.kind === 'DECISION' && pd.decision.kind === 'COMBINE_PLAN') return { id: 'combine', params: {} };
        return { id: 'hub', params: {} };
      },
      sync: function () { var r = R.resolve(RTG.UI.store.state); if (!live || live.id !== r.id) R.go(r.id, r.params, { replace: true }); return R.current(); },
      resize: function () { if (live && live.screen.onResize) live.screen.onResize(); },
      key: function () { return false; },
      onChange: function () { return function () {}; },
      FREE: { hub: 1 }, CHROMELESS: { kick: 1 }
    };
    RTG.UI.Router = R;
  }

  // ───────────────────────────── situation builders ─────────────────────────────
  function E() { return RTG.Engine; }
  function newCareer(seed, difficulty) {
    var r = E().newCareer({ seed: seed, difficulty: difficulty || 'pro', name: 'Dev Kicker' }, Date.now());
    return r;
  }
  function settleAll(state, rng) {
    var guard = 0;
    while (state.pending && guard++ < 20) E().settlePending(state, rng);
  }
  function toRegWeek1(state, rng) {
    var guard = 0;
    while (!(state.phase === 'REG' && state.week === 1) && guard++ < 20) {
      if (state.pending) { E().settlePending(state, rng); continue; }
      if (state.phase === 'PRE' || state.stage === 'HS') { E().nextPhase(state, rng); continue; }
      break;
    }
    return state.phase === 'REG';
  }
  function startGameAndFindKick(state, rng, wantType) {
    if (!state.game) E().startUserGame(state, rng);
    var guard = 0;
    while (guard++ < 60) {
      var ev = E().simToKick(state, rng);
      if (ev.type === 'USER_KICK') {
        if (!wantType || ev.ctx.type === wantType) return ev.ctx;
        E().autoKick(state, rng);
      } else if (ev.type === 'USER_KICKOFF') E().applyUserKickoff(state, rng, null);
      else if (ev.type === 'ICE_TIMEOUT') continue;
      else if (ev.type === 'END_GAME' || ev.type === 'END') return null;
    }
    return null;
  }
  /** A state at REG week 1 with a pending user kick (retries seeds until a kick of the wanted type shows up). */
  function pendingKickState(seed, difficulty, wantType) {
    for (var attempt = 0; attempt < 6; attempt++) {
      var r = newCareer(seed + attempt * 7919, difficulty);
      var state = r.state, rng = r.rng;
      if (!toRegWeek1(state, rng)) continue;
      var ctx = startGameAndFindKick(state, rng, wantType);
      if (ctx) return { state: state, rng: rng, ctx: ctx };
    }
    throw new Error('dev: could not reach a pending ' + (wantType || 'kick'));
  }
  function patchCtx(state, over) {
    var ctx = state.game.pending.ctx, K = RTG.Kick;
    for (var k in over) if (Object.prototype.hasOwnProperty.call(over, k)) ctx[k] = over[k];
    if (over.hash !== undefined) ctx.ballX = K.ballXFor(ctx.league, ctx.hash);
    if (ctx.type === 'PAT') { ctx.distance = K.patDistance(ctx.league); ctx.hash = 0; ctx.ballX = 0; }
    ctx.clutch = ctx.pressure >= RTG.Tuning.kick.pressure.clutchThreshold;
    if (ctx.iced) state.game.iced = true;
    return ctx;
  }

  Dev.SITUATIONS = {
    pat: { label: 'PAT', run: function (o) { var r = pendingKickState(o.seed, o.diff, null); patchCtx(r.state, { type: 'PAT', pressure: 0.13, decisive: false, iced: false, wind: { speed: 4, dir: 45 }, weather: 'clear' }); return r; } },
    fg45: { label: '45 calm', run: function (o) { var r = pendingKickState(o.seed, o.diff, null); patchCtx(r.state, { type: 'FG', distance: 45, hash: 0, pressure: 0.2, decisive: false, iced: false, wind: { speed: 0, dir: 0 }, weather: 'clear', tempF: 68 }); return r; } },
    fg55windy: { label: '55 windy decisive', run: function (o) { var r = pendingKickState(o.seed, o.diff, null); patchCtx(r.state, { type: 'FG', distance: 55, hash: 1, pressure: 0.85, decisive: true, late: true, iced: false, wind: { speed: 14, dir: 90 }, weather: 'clear', tempF: 55, game: Object.assign({}, r.state.game.pending.ctx.game, { q: 4, clock: 41 }) }); return r; } },
    snow: { label: '38 snow', run: function (o) { var r = pendingKickState(o.seed, o.diff, null); patchCtx(r.state, { type: 'FG', distance: 38, hash: -1, pressure: 0.3, decisive: false, iced: false, wind: { speed: 8, dir: 270 }, weather: 'snow', tempF: 28 }); return r; } },
    rain: { label: '47 rain R hash', run: function (o) { var r = pendingKickState(o.seed, o.diff, null); patchCtx(r.state, { type: 'FG', distance: 47, hash: 1, pressure: 0.4, decisive: false, iced: false, wind: { speed: 12, dir: 270 }, weather: 'rain', tempF: 50 }); return r; } },
    iced: { label: '42 iced decisive', run: function (o) { var r = pendingKickState(o.seed, o.diff, null); patchCtx(r.state, { type: 'FG', distance: 42, hash: 0, pressure: 0.9, decisive: true, late: true, iced: true, wind: { speed: 6, dir: 120 }, weather: 'clear', tempF: 60, game: Object.assign({}, r.state.game.pending.ctx.game, { q: 4, clock: 3 }) }); return r; } },
    hash30: { label: '30 college R hash', run: function (o) { var r = pendingKickState(o.seed, o.diff, null); patchCtx(r.state, { type: 'FG', distance: 30, hash: 1, pressure: 0.15, decisive: false, iced: false, wind: { speed: 0, dir: 0 }, weather: 'clear' }); return r; } },
    fg60: { label: '60 long', run: function (o) { var r = pendingKickState(o.seed, o.diff, null); patchCtx(r.state, { type: 'FG', distance: 60, hash: 0, pressure: 0.5, decisive: false, iced: false, wind: { speed: 10, dir: 0 }, weather: 'clear' }); return r; } },
    showcase: { label: 'Showcase', run: function (o) { return newCareer(o.seed, o.diff); } },
    camp: { label: 'Camp battle', run: function (o) {
      var r = newCareer(o.seed, o.diff), state = r.state, rng = r.rng;
      var guard = 0;
      while (state.stage === 'HS' && guard++ < 10) E().settlePending(state, rng);
      settleAll(state, rng);
      RTG.Career.campBattle(state, rng);
      return r;
    } },
    combine: { label: 'Combine', run: function (o) {
      var r = newCareer(o.seed, o.diff), state = r.state, rng = r.rng;
      var guard = 0;
      while (!(state.stage === 'DRAFT' && state.phase === 'COMBINE') && guard++ < 400) {
        if (state.game) { E().autoPlayGame(state, rng); continue; }
        if (state.pending) { E().settlePending(state, rng); continue; }
        if (state.phase === 'REG' || state.phase === 'POST') { E().autoPlayWeek(state, rng); continue; }
        if (state.stage === 'RETIRED') break;
        E().nextPhase(state, rng);
      }
      return r;
    } },
    game: { label: 'Game screen', run: function (o) { var r = newCareer(o.seed, o.diff); toRegWeek1(r.state, r.rng); E().train(r.state, r.rng, 'ACC'); E().startUserGame(r.state, r.rng); return r; } },
    practice: { label: 'Practice', run: function (o) { var r = newCareer(o.seed, o.diff); toRegWeek1(r.state, r.rng); return r; }, screen: 'practice' }
  };

  Dev.setup = function (name, o) {
    o = o || {};
    var sit = Dev.SITUATIONS[name] || Dev.SITUATIONS.fg45;
    var store = RTG.UI.store;
    if (o.mode) store.settings.inputMode = o.mode;
    if (o.reduced !== undefined) store.settings.reducedMotion = !!o.reduced;
    if (o.left !== undefined) store.settings.leftFooted = !!o.left;
    if (o.audio !== undefined) store.settings.audio = !!o.audio;
    if (o.autoPat) store.settings.autoPat = o.autoPat;
    if (o.playKickoffs !== undefined) store.settings.playKickoffs = !!o.playKickoffs;
    var r = sit.run({ seed: o.seed || 4242, diff: o.diff || 'pro' });
    store.replace(r.state, r.rng);
    if (sit.screen) RTG.UI.Router.go(sit.screen, {});
    Dev.current = name;
    return r.state;
  };

  function qs() {
    var out = {}, q = (root.location.search || '').slice(1).split('&');
    for (var i = 0; i < q.length; i++) { if (!q[i]) continue; var kv = q[i].split('='); out[decodeURIComponent(kv[0])] = kv.length > 1 ? decodeURIComponent(kv[1]) : '1'; }
    return out;
  }

  Dev.boot = function (host, toolbar) {
    var C = RTG.UI.C;
    if (!RTG.UI.store) { RTG.UI.store = new RTG.UI.Store(); RTG.UI.uiRng = RTG.UI.store.uiRng; }
    RTG.UI.Router.mount(host);
    if (RTG.UI.Audio && RTG.UI.Audio.init) RTG.UI.Audio.init(function () { return RTG.UI.store.settings; });
    var p = qs();
    if (p.bar === '0') doc.body.classList.add('nobar');
    if (p.w && p.h) { host.style.width = p.w + 'px'; host.style.height = p.h + 'px'; host.classList.add('sized'); if (p.bar === '0') host.style.margin = '0 auto'; }
    var opts = { mode: p.mode || 'flick', diff: p.diff || 'pro', reduced: p.reduced === '1', left: p.left === '1', seed: p.seed ? +p.seed : 4242, audio: p.audio === '1', autoPat: p.autoPat, playKickoffs: p.playKickoffs === '1' };
    if (toolbar) {
      var sel = C.el('select', { 'aria-label': 'Situation' });
      for (var k in Dev.SITUATIONS) sel.appendChild(C.el('option', { value: k, text: Dev.SITUATIONS[k].label }));
      sel.value = p.sit || 'fg45';
      var mode = C.el('select', { 'aria-label': 'Input mode' }, C.el('option', { value: 'flick', text: 'flick' }), C.el('option', { value: 'meter', text: 'meter' }));
      mode.value = opts.mode;
      var diff = C.el('select', { 'aria-label': 'Difficulty' }, ['rookie', 'pro', 'allpro', 'legend'].map(function (d) { return C.el('option', { value: d, text: d }); }));
      diff.value = opts.diff;
      var reduced = C.el('input', { type: 'checkbox', id: 'dev-reduced' }); reduced.checked = opts.reduced;
      var left = C.el('input', { type: 'checkbox', id: 'dev-left' }); left.checked = opts.left;
      var go = C.el('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'LOAD', onClick: function () {
        opts.mode = mode.value; opts.diff = diff.value; opts.reduced = reduced.checked; opts.left = left.checked;
        Dev.setup(sel.value, opts);
      } });
      var force = function (outcome) { return C.el('button', { class: 'btn btn-sm', type: 'button', text: outcome, onClick: function () { try { RTG.debug.forceKick({ outcome: outcome }); } catch (e) { alert(e.message); } } }); };
      toolbar.appendChild(sel); toolbar.appendChild(mode); toolbar.appendChild(diff);
      toolbar.appendChild(C.el('label', { for: 'dev-reduced' }, reduced, 'reduced')); toolbar.appendChild(C.el('label', { for: 'dev-left' }, left, 'left'));
      toolbar.appendChild(go);
      toolbar.appendChild(force('GOOD')); toolbar.appendChild(force('DOINK_IN')); toolbar.appendChild(force('BLOCKED')); toolbar.appendChild(force('WIDE_R'));
      var perf = C.el('span', { class: 'dev-perf', text: '' });
      toolbar.appendChild(perf);
      setInterval(function () { var s = RTG.UI.Canvas ? RTG.UI.Canvas.perf() : null; if (s) perf.textContent = s.fps + ' fps · p95 ' + s.frameP95Ms + ' ms' + (s.rafActive ? '' : ' · idle'); }, 1000);
    }
    if (p.sit || p.autostart === '1') Dev.setup(p.sit || 'fg45', opts);
    root.addEventListener('resize', function () { RTG.UI.Router.resize(); });
    return RTG.UI.store;
  };

  // dev-only forceKick when RTG.debug is absent
  if (!RTG.debug || typeof RTG.debug.forceKick !== 'function') {
    RTG.debug = RTG.debug || {};
    RTG.debug.forceKick = function (arg) {
      var s = RTG.UI.store, st = s.state, K = RTG.Kick;
      var g = K.geometry(st.game && st.game.pending ? st.game.pending.ctx : st.pending.session.contexts[st.pending.session.results.length], null);
      var input = { power: K.aiPower(g.pNeed), aim: 0, quality: 0.85 };
      if (st.game && st.game.pending) {
        var res = K.resolve(s.rng, st.game.pending.ctx, null, input, { forced: arg });
        RTG.Sim.applyKick(st.game, st, s.rng, res);
        s.touch('applyUserKick', res, { forced: true, noSync: true });
        return res;
      }
      var sess = st.pending.session, idx = sess.results.length;
      var r2 = K.resolve(s.rng, sess.contexts[idx], null, input, { forced: arg });
      sess.results[idx] = r2; sess.idx = sess.results.length;
      var done = sess.results.length >= sess.contexts.length, outcome = null;
      if (done) { outcome = RTG.Career.finishSession(st, s.rng); if (RTG.Career.resume) RTG.Career.resume(st, s.rng); }
      s.touch('sessionKick', { result: r2, idx: idx, done: done, outcome: outcome, remaining: sess.contexts.length - sess.results.length }, { forced: true, noSync: true });
      return r2;
    };
    RTG.debug.autoKick = function (on) { RTG.UI.store.autoKickAll = !!on; return !!on; };
    RTG.debug.getState = function () { return RTG.Util.deepClone(RTG.UI.store.state); };
    RTG.debug.perf = function () { return RTG.UI.Canvas.perf(); };
  }

  RTG.Dev = Dev;
})(typeof window !== 'undefined' ? window : globalThis);
