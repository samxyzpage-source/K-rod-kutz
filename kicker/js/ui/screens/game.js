/**
 * Road to Glory: Kicker — screen 'game' (SPEC §4.5 game row): LED scoreboard, drive log, sim controls.
 *
 *   NEXT KICK ▶   dispatch('simToKick') in a loop until a user kick / kickoff / end (auto-PATs resolve inline)
 *   WATCH         setTimeout loop of dispatch('simStep') every 400 ms ÷ settings.simSpeed (cancelled in destroy)
 *   SIM REST      simToKick / autoKick loop to END_GAME (all NO_SYNC dispatches, no screen bounce)
 *   speed pills   store.setSetting('simSpeed', 1|2|4)
 *
 * Events: USER_KICK → auto-PAT rule (dispatch('autoKick')) or Router.go('kick', {mode:'game'}); USER_KICKOFF →
 * inline kickoff timing bar when settings.playKickoffs, else dispatch('applyUserKickoff', null); ICE_TIMEOUT →
 * "ICED!" toast then continue (the same kick comes back with ctx.iced); END_GAME → dispatch('finishUserGame') →
 * Router.go('postgame', {summary}) when registered, else Router.sync().
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

  var STEP_MS = 400;
  var PERIOD = { END_QUARTER: 1, END_HALF: 1, END_GAME: 1, OT_START: 1, TOSS: 1 };
  var SCORE = { TD: 1, FG: 1, PAT: 1, '2PT': 1 };
  var BAD = { FG_MISS: 1, PAT_MISS: 1, '2PT_FAIL': 1, TO: 1 };

  function lineClass(gs, row) {
    var cls = 'drivelog-line';
    if (row.side === 'home' || row.side === 'away') cls += ' ' + row.side;
    if (row.side && gs.userSide === row.side && (row.result === 'FG' || row.result === 'FG_MISS' || row.result === 'PAT' || row.result === 'PAT_MISS' || row.result === 'KO')) cls += ' user';
    if (PERIOD[row.result]) cls += ' period';
    else if (SCORE[row.result]) cls += ' score';
    else if (BAD[row.result]) cls += ' bad';
    if (row.result === 'ICE') cls += ' ice';
    return cls;
  }

  function factory(store) {
    var c = C(), state = store.state;
    var el = c.el('div', { class: 'game-screen screen-game' });
    var destroyed = false, watchTimer = null, watching = false, koBar = null, unsub = null, busy = false;
    var rendered = 0;

    if (!state || !state.game) {
      el.appendChild(c.el('div', { class: 'game-empty' }, c.el('p', { class: 'txt-grey', text: 'No game in progress.' }),
        c.button({ label: 'BACK TO HUB', kind: 'secondary', onClick: function () { Router().sync(); } })));
      return { el: el, destroy: function () { destroyed = true; } };
    }

    // ── scoreboard ──
    var led = c.el('div', { class: 'led', role: 'status', 'aria-label': 'Scoreboard' });
    function teamBlock(isHome) {
      var gs = store.state.game, id = isHome ? gs.homeId : gs.awayId;
      var user = gs.userSide === (isHome ? 'home' : 'away');
      var t = c.el('div', { class: 'led-team' + (isHome ? ' home' : '') });
      t.appendChild(c.crest(id, 28));
      t.appendChild(c.el('span', { class: 'led-abbr' + (user ? ' txt-gold' : ''), text: c.teamAbbr(id) }));
      t.appendChild(c.el('span', { class: 'led-poss', 'data-poss': isHome ? 'home' : 'away', 'aria-hidden': 'true' }));
      t.appendChild(c.el('span', { class: 'led-score num', 'data-side': isHome ? 'home' : 'away', text: '0' }));
      return t;
    }
    var mid = c.el('div', { class: 'led-mid' }, c.el('span', { class: 'led-q', text: '' }), c.el('span', { class: 'led-clock num', text: '' }), c.el('span', { class: 'led-wx' }));
    led.appendChild(teamBlock(false)); led.appendChild(mid); led.appendChild(teamBlock(true));
    el.appendChild(led);

    function renderLed() {
      var gs = store.state.game; if (!gs) return;
      led.querySelector('[data-side="away"]').textContent = String(gs.score.away);
      led.querySelector('[data-side="home"]').textContent = String(gs.score.home);
      var Q = RTG.Tuning.sim.clock.quarters, otN = gs.q - Q;
      var period = otN > 0 ? 'OT' + (otN > 1 ? otN : '') : 'Q' + gs.q;
      led.querySelector('.led-q').textContent = gs.done ? 'FINAL' : period;
      led.querySelector('.led-clock').textContent = gs.done ? '0:00' : c.fmt.clock(gs.clock);
      led.classList.toggle('led-final', !!gs.done);
      var pa = led.querySelector('[data-poss="away"]'), ph = led.querySelector('[data-poss="home"]');
      pa.classList.toggle('on', !gs.done && gs.possession === 'away');
      ph.classList.toggle('on', !gs.done && gs.possession === 'home');
      var wx = led.querySelector('.led-wx');
      c.clear(wx);
      if (gs.weather) {
        wx.appendChild(c.icon(c.weatherIcon(gs.weather.weather, gs.weather.wind && gs.weather.wind.speed), 10));
        wx.appendChild(c.el('span', { text: (gs.weather.dome ? 'DOME' : Math.round(gs.weather.tempF) + '°F') + (gs.weather.wind && gs.weather.wind.speed >= 1 && !gs.weather.dome ? ' · ' + Math.round(gs.weather.wind.speed) + ' MPH' : '') }));
      }
    }

    // ── drive log ──
    var log = c.el('div', { class: 'drivelog', role: 'log', 'aria-live': 'polite', 'aria-label': 'Drive log', tabindex: '0' });
    el.appendChild(log);
    function addLine(text, cls) {
      log.appendChild(c.el('div', { class: cls || 'drivelog-line', text: text }));
      while (log.children.length > 120) log.removeChild(log.firstChild);
      log.scrollTop = log.scrollHeight;
    }
    function renderLog() {
      var gs = store.state.game; if (!gs) return;
      var rows = gs.driveLog || [];
      if (rendered > rows.length) { c.clear(log); rendered = 0; }
      for (var i = rendered; i < rows.length; i++) addLine(RTG.Sim.driveLogLine(gs, rows[i]), lineClass(gs, rows[i]));
      rendered = rows.length;
    }

    // ── kick chips ──
    var chips = c.el('div', { class: 'kick-chips', 'aria-label': 'Your kicks this game' });
    el.appendChild(chips);
    function renderChips() {
      var gs = store.state.game; if (!gs) return;
      c.clear(chips);
      var rows = gs.kicks || [], n = 0;
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (r.ai) continue;
        n++;
        var label = (r.type === 'PAT' ? 'PAT' : r.distance) + ' ' + (r.made ? '✓' : '✗');
        var chip = c.el('span', { class: 'kick-chip ' + (r.made ? 'made' : 'miss') + (r.auto ? ' auto' : ''), text: label, title: r.outcome + (r.auto ? ' (auto)' : '') });
        chips.appendChild(chip);
      }
      if (!n) chips.appendChild(c.el('span', { class: 'small txt-grey', text: 'No kicks yet.' }));
    }

    // ── controls ──
    var controls = c.el('div', { class: 'game-controls' });
    var pills = c.el('div', { class: 'speed-pills', role: 'group', 'aria-label': 'Sim speed' }, c.el('span', { text: 'SPEED' }));
    [1, 2, 4].forEach(function (s) {
      pills.appendChild(c.el('button', { class: 'pill' + (store.settings.simSpeed === s ? ' active' : ''), type: 'button', 'data-speed': s, 'aria-pressed': store.settings.simSpeed === s ? 'true' : 'false', text: '×' + s, onClick: function () {
        if (typeof store.setSetting === 'function') store.setSetting('simSpeed', s); else store.settings.simSpeed = s;
        var b = pills.querySelectorAll('.pill');
        for (var i = 0; i < b.length; i++) { var on = +b[i].getAttribute('data-speed') === s; b[i].classList.toggle('active', on); b[i].setAttribute('aria-pressed', on ? 'true' : 'false'); }
      } }));
    });
    var btnNext = c.button({ label: 'NEXT KICK ▶', kind: 'primary', action: 'next-kick', onClick: function () { stopWatch(); runToKick(); } });
    var btnWatch = c.button({ label: 'WATCH', kind: 'secondary', action: 'watch', onClick: function () { if (watching) stopWatch(); else startWatch(); } });
    var btnRest = c.button({ label: 'SIM REST', kind: 'secondary', action: 'sim-rest', onClick: function () { stopWatch(); simRest(); } });
    controls.appendChild(pills);
    controls.appendChild(c.buttonRow([btnNext, btnWatch, btnRest]));
    var koSlot = c.el('div', { class: 'game-kobar', hidden: true });
    controls.appendChild(koSlot);
    el.appendChild(controls);

    function speedMs() { return Math.round(STEP_MS / (num(store.settings.simSpeed, 1) || 1)); }
    function gs() { return store.state.game; }

    // ── event handling ──
    function dispatch(fn, arg) {
      try { return arg === undefined ? store.dispatch(fn) : store.dispatch(fn, arg); }
      catch (e) { if (root.console) root.console.error('game.' + fn + ' failed', e); c.toast(String(e.message || e), 'bad'); return null; }
    }
    function refresh() { renderLed(); renderLog(); renderChips(); }

    /** @returns 'continue' | 'stop' */
    function handle(ev, mode) {
      if (!ev || destroyed) return 'stop';
      var g = gs();
      refresh();
      switch (ev.type) {
        case 'USER_KICK':
          if (KV().shouldAutoPat(ev.ctx, store.settings, store)) {
            var r = dispatch('autoKick');
            if (r) addLine((ev.ctx.type === 'PAT' ? 'PAT' : ev.ctx.distance + '-yd FG') + ' (auto): ' + (KV().OUTCOME_TEXT[r.outcome] || r.outcome), 'drivelog-line user');
            refresh();
            return 'continue';
          }
          addLine('YOUR KICK: ' + ev.text, 'drivelog-line user');
          Router().go('kick', { mode: 'game' });
          return 'stop';
        case 'USER_KICKOFF':
          if (store.settings.playKickoffs && !store.autoKickAll && mode !== 'rest') { showKickoff(ev, mode); return 'stop'; }
          dispatch('applyUserKickoff', null);
          refresh();
          return 'continue';
        case 'ICE_TIMEOUT':
          c.toast('ICED! ' + ev.text, 'info', 2200);
          c.announce(ev.text);
          led.classList.add('ice-flash');
          root.setTimeout(function () { led.classList.remove('ice-flash'); }, 1300);
          return 'continue';
        case 'END_GAME':
        case 'END':
          finishGame();
          return 'stop';
        default:
          return 'continue';
      }
    }

    function runToKick() {
      if (busy || destroyed) return;
      busy = true;
      var guard = 0;
      while (!destroyed && guard++ < 200) {
        var g = gs();
        if (!g) break;
        if (g.done) { finishGame(); break; }
        if (g.pending) { Router().go('kick', { mode: 'game' }); break; }
        var ev = dispatch('simToKick');
        if (!ev) break;
        if (handle(ev, 'next') === 'stop') break;
      }
      busy = false;
    }

    function startWatch() {
      if (destroyed) return;
      watching = true;
      btnWatch.querySelector('.btn-label').textContent = 'PAUSE';
      btnWatch.setAttribute('aria-pressed', 'true');
      tickWatch();
    }
    function stopWatch() {
      watching = false;
      if (watchTimer) { root.clearTimeout(watchTimer); watchTimer = null; }
      if (!destroyed) { btnWatch.querySelector('.btn-label').textContent = 'WATCH'; btnWatch.setAttribute('aria-pressed', 'false'); }
    }
    function tickWatch() {
      watchTimer = null;
      if (!watching || destroyed) return;
      var g = gs();
      if (!g) { stopWatch(); return; }
      if (g.done) { stopWatch(); finishGame(); return; }
      if (g.pending) { stopWatch(); Router().go('kick', { mode: 'game' }); return; }
      var ev = dispatch('simStep');
      if (!ev) { stopWatch(); return; }
      var r = handle(ev, 'watch');
      if (r === 'stop') { stopWatch(); return; }
      watchTimer = root.setTimeout(tickWatch, speedMs());
    }

    function simRest() {
      if (busy || destroyed) return;
      busy = true;
      var guard = 0;
      while (!destroyed && guard++ < 400) {
        var g = gs();
        if (!g) break;
        if (g.done) { finishGame(); break; }
        if (g.pending) { dispatch('autoKick'); continue; }
        var ev = dispatch('simToKick');
        if (!ev) break;
        if (ev.type === 'USER_KICK' || ev.type === 'USER_KICKOFF') { dispatch('autoKick'); continue; }
        if (ev.type === 'END_GAME' || ev.type === 'END') { refresh(); finishGame(); break; }
      }
      busy = false;
    }

    function showKickoff(ev, mode) {
      koSlot.hidden = false;
      c.clear(koSlot);
      var KO = num(ev.ctx && ev.ctx.kicker && ev.ctx.kicker.attrs && ev.ctx.kicker.attrs.KO, 50);
      var reduced = RTG.UI.Shell && RTG.UI.Shell.reducedMotion ? RTG.UI.Shell.reducedMotion() : !!store.settings.reducedMotion;
      if (koBar) koBar.destroy();
      koBar = KV().kickoffBar(koSlot, { KO: KO, reduced: reduced, onLock: function (timing) {
        var r = dispatch('applyUserKickoff', { timing: timing });
        var txt = KV().kickoffText(r);
        koSlot.appendChild(c.el('div', { class: 'ko-result', text: txt }));
        c.announce(txt);
        refresh();
        root.setTimeout(function () {
          if (destroyed) return;
          if (koBar) { koBar.destroy(); koBar = null; }
          koSlot.hidden = true;
          if (mode === 'watch') startWatch(); else runToKick();
        }, reduced ? 300 : 1200);
      } });
    }

    var finished = false;
    function finishGame() {
      if (finished || destroyed) return;
      var g = gs();
      if (!g) return;
      if (!g.done) return;
      finished = true;
      var summary = dispatch('finishUserGame');
      if (!summary) { finished = false; return; }
      var R = Router();
      if (R.has && R.has('postgame')) R.go('postgame', { summary: summary }, { replace: true });
      else { c.toast('Final: ' + summary.score.away + '-' + summary.score.home + (summary.won ? ' · WIN' : summary.tied ? ' · TIE' : ' · LOSS'), summary.won ? 'good' : 'info', 3000); R.sync(); }
    }

    unsub = store.subscribe(function () { if (!destroyed) refresh(); });
    refresh();
    // a game that is already over (e.g. reload) → straight to the summary
    if (gs().done) root.setTimeout(function () { if (!destroyed) finishGame(); }, 0);

    return {
      el: el,
      destroy: function () {
        destroyed = true;
        stopWatch();
        if (koBar) koBar.destroy();
        if (unsub) unsub();
      }
    };
  }

  Screens.game = factory;
  if (RTG.UI.Router) RTG.UI.Router.register('game', factory);
})(typeof window !== 'undefined' ? window : globalThis);
