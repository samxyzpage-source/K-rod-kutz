/**
 * Road to Glory: Kicker — screen 'kick' (SPEC §4.5 kick row, §4.6): the full-screen kick scene.
 *
 * Game mode (state.game.pending, params.mode 'game'): score / clock chips above the KickView HUD strip
 * (`47 YDS · R HASH · WIND ← 12 · RAIN · ICED!`); on release dispatch('applyUserKick', input) → the returned
 * KickResult drives FLIGHT → RESULT; after the result beat (+ a short read-the-feedback pause, tap to skip)
 * → Router.sync() (→ 'game'). A pending USER_KICKOFF shows the one-tap timing bar (settings.playKickoffs)
 * or dispatches applyUserKickoff(null). The auto-PAT rule (KickView.shouldAutoPat) and RTG.debug.autoKick
 * resolve through dispatch('autoKick') and play the returned result.
 *
 * Session mode (state.pending.kind === 'KICKS' with no dedicated screen — HALFTIME70 / TRYOUT / PRACTICE):
 * KickView.sessionScreen with a generic slot strip; when the session completes → Router.sync().
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Screens = RTG.UI.Screens = RTG.UI.Screens || {};

  function C() { return RTG.UI.C; }
  function KV() { return RTG.UI.KickView; }
  function Router() { return RTG.UI.Router; }
  function num(v, d) { return typeof v === 'number' && v === v ? v : d; }

  var SESSION_TITLES = { HALFTIME70: 'HALFTIME 70', TRYOUT: 'MINICAMP TRYOUT', PRACTICE: 'PRACTICE', SHOWCASE: 'SHOWCASE', CAMP: 'CAMP BATTLE' };

  /** Mini LED row: AWAY abbr score · Q clock · HOME abbr score (user side in gold). */
  function scoreRow(store) {
    var c = C(), state = store.state, gs = state.game;
    var row = c.el('div', { class: 'kick-score' });
    if (!gs) return row;
    var led = c.el('div', { class: 'led', role: 'status', 'aria-label': 'Score' });
    function side(id, sc, isHome) {
      var user = gs.userSide === (isHome ? 'home' : 'away');
      var t = c.el('div', { class: 'led-team' + (isHome ? ' home' : '') });
      t.appendChild(c.crest(id, 16));
      t.appendChild(c.el('span', { class: 'led-abbr' + (user ? ' txt-gold' : ''), text: c.teamAbbr(id) }));
      t.appendChild(c.el('span', { class: 'led-score num', 'data-side': isHome ? 'home' : 'away', text: String(sc) }));
      return t;
    }
    led.appendChild(side(gs.awayId, gs.score.away, false));
    var Q = RTG.Tuning.sim.clock.quarters, otN = gs.q - Q;
    var period = otN > 0 ? 'OT' + (otN > 1 ? otN : '') : 'Q' + gs.q;
    led.appendChild(c.el('div', { class: 'led-mid' }, c.el('span', { class: 'led-q', text: period }), c.el('span', { class: 'led-clock num', text: c.fmt.clock(gs.clock) })));
    led.appendChild(side(gs.homeId, gs.score.home, true));
    row.appendChild(led);
    row.refresh = function () {
      var g2 = store.state.game; if (!g2) return;
      var a = led.querySelector('[data-side="away"]'), h = led.querySelector('[data-side="home"]');
      if (a) a.textContent = String(g2.score.away);
      if (h) h.textContent = String(g2.score.home);
    };
    return row;
  }

  function gameKick(store, params) {
    var c = C(), state = store.state, gs = state.game, pend = gs.pending, ctx = pend.ctx;
    var el = c.el('div', { class: 'screen-kick' });
    var score = scoreRow(store);
    el.appendChild(score);
    var stage = c.el('div', { class: 'kick-stage', style: 'display:flex;flex-direction:column;flex:1 1 auto;min-height:0;position:relative' });
    el.appendChild(stage);
    var view = null, koBar = null, timers = [], destroyed = false, leaving = false;
    function setTimer(fn, ms) { var id = root.setTimeout(function () { if (!destroyed) fn(); }, ms); timers.push(id); return id; }
    function leave() {
      if (leaving || destroyed) return;
      leaving = true;
      Router().sync();
    }
    var reduced = RTG.UI.Shell && RTG.UI.Shell.reducedMotion ? RTG.UI.Shell.reducedMotion() : !!store.settings.reducedMotion;

    // ── kickoff ──
    if (pend.type === 'USER_KICKOFF') {
      var auto = !store.settings.playKickoffs || store.autoKickAll;
      if (auto) {
        setTimer(function () { try { store.dispatch('applyUserKickoff', null); } catch (e) { if (root.console) root.console.error(e); } leave(); }, 0);
        el.appendChild(c.el('p', { class: 'txt-grey small', style: 'padding:8px', text: 'Kickoff…' }));
        return { el: el, destroy: function () { destroyed = true; timers.forEach(root.clearTimeout); } };
      }
      var koWrap = c.el('div', { class: 'kick-ko' });
      stage.appendChild(koWrap);
      var KO = num(ctx.kicker && ctx.kicker.attrs && ctx.kicker.attrs.KO, 50);
      koBar = KV().kickoffBar(koWrap, { KO: KO, reduced: reduced, onLock: function (timing) {
        var r = null;
        try { r = store.dispatch('applyUserKickoff', { timing: timing }); } catch (e) { if (root.console) root.console.error(e); }
        var txt = KV().kickoffText(r);
        koWrap.appendChild(c.el('div', { class: 'ko-result', text: txt }));
        c.announce(txt);
        setTimer(leave, reduced ? 300 : 1200);
      } });
      return { el: el, destroy: function () { destroyed = true; timers.forEach(root.clearTimeout); if (koBar) koBar.destroy(); } };
    }

    // ── field goal / PAT ──
    var model = RTG.Kick.model(ctx, null);
    var continueBtn = null;
    function afterDone() {
      var wrap = c.el('div', { class: 'kick-continue' });
      continueBtn = c.button({ label: 'CONTINUE ▶', kind: 'primary', onClick: leave });
      wrap.appendChild(continueBtn);
      el.appendChild(wrap);
      try { continueBtn.focus(); } catch (e) { /* ignore */ }
      setTimer(leave, reduced ? 500 : 1400);
    }
    view = KV().mount(stage, {
      ctx: ctx, model: model, settings: store.settings, store: store, mode: 'game',
      onInput: function (input) {
        try { return store.dispatch('applyUserKick', input); }
        catch (e) { if (root.console) root.console.error('applyUserKick failed', e); return null; }
      },
      onResult: function () { if (score.refresh) score.refresh(); },
      onDone: afterDone
    });
    // auto resolution (auto-PAT rule / RTG.debug.autoKick)
    if (KV().shouldAutoPat(ctx, store.settings, store)) {
      setTimer(function () {
        if (!store.state.game || !store.state.game.pending) { leave(); return; }
        var r = null;
        try { r = store.dispatch('autoKick'); } catch (e) { if (root.console) root.console.error('autoKick failed', e); }
        if (r && typeof r.outcome === 'string' && view && view.phase() === 'SETUP') view.playResult(r);
        else leave();
      }, 20);
    }
    // stage tap after DONE also continues
    stage.addEventListener('pointerdown', function () { if (view && view.phase() === 'DONE') leave(); });
    return {
      el: el,
      view: function () { return view; },
      onResize: function () { if (view) view.resize(); },
      destroy: function () {
        destroyed = true;
        timers.forEach(root.clearTimeout);
        if (view) view.destroy();
        view = null;
      }
    };
  }

  /** Generic session header: title + one slot per context (distance · ✓/✗). */
  function genericHeader(state, sess) {
    var c = C();
    var wrap = c.el('div');
    wrap.appendChild(c.el('div', { class: 'session-title', text: SESSION_TITLES[sess.kind] || sess.kind }));
    wrap.appendChild(c.el('div', { class: 'slot-strip' }));
    return wrap;
  }
  function genericUpdate(headerEl, state, sess) {
    var c = C();
    var strip = headerEl.querySelector('.slot-strip');
    if (!strip || !sess) return;
    c.clear(strip);
    var next = sess.results.length;
    for (var i = 0; i < sess.contexts.length; i++) {
      var ctx = sess.contexts[i], r = sess.results[i];
      var cls = 'slot' + (r ? (r.made ? ' made' : ' miss') : (i === next ? ' current' : ''));
      strip.appendChild(c.el('span', { class: cls },
        c.el('span', { class: 'slot-d', text: ctx.type === 'KO' ? 'KO' : ctx.distance + ' YD' }),
        c.el('span', { class: 'slot-r', text: r ? (r.made ? '✓' : '✗') : '·' })));
    }
  }
  Screens.genericSessionHeader = genericHeader;
  Screens.genericSessionUpdate = genericUpdate;

  function factory(store, params) {
    var c = C(), state = store.state;
    if (state && state.game && state.game.pending) return gameKick(store, params || {});
    if (state && state.pending && state.pending.kind === 'KICKS') {
      return KV().sessionScreen(store, { className: 'session-generic', header: genericHeader, update: genericUpdate });
    }
    var el = c.el('div', { class: 'screen-kick' }, c.el('p', { class: 'txt-grey', style: 'padding:16px', text: 'No kick is pending.' }));
    var t = root.setTimeout(function () { Router().sync(); }, 0);
    return { el: el, destroy: function () { root.clearTimeout(t); } };
  }

  Screens.kick = factory;
  if (RTG.UI.Router) RTG.UI.Router.register('kick', factory);
})(typeof window !== 'undefined' ? window : globalThis);
