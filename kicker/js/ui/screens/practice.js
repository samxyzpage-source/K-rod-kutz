/**
 * Road to Glory: Kicker — screen 'practice' (SPEC §4.5 practice row, M4).
 * Distance / hash / wind / weather pickers; unlimited kicks with no XP. Contexts come from
 * RTG.Kick.buildContext(state, null, {type:'FG', distance, hash, isUser:true, forSession:true, wind, weather})
 * and are resolved with RTG.Kick.resolve on a throwaway RTG.RNG — the one place the UI calls resolve
 * directly, because nothing here touches state. 30-kick heat map at the goal plane; "SIM 30" uses the AI input.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Screens = RTG.UI.Screens = RTG.UI.Screens || {};

  function C() { return RTG.UI.C; }
  var WEATHERS = ['clear', 'rain', 'snow', 'fog', 'cold', 'heat', 'dome'];
  var DIRS = [{ id: 'tail', label: 'TAIL', dir: 0 }, { id: 'right', label: '→', dir: 90 }, { id: 'head', label: 'HEAD', dir: 180 }, { id: 'left', label: '←', dir: 270 }];
  var HASHES = [{ h: -1, label: 'L' }, { h: 0, label: 'M' }, { h: 1, label: 'R' }];
  var MAX_DOTS = 30;

  function factory(store) {
    var c = C(), K = RTG.Kick;
    var state = store.state;
    var el = c.el('div', { class: 'practice-screen screen-practice' });
    var destroyed = false, view = null, seed = 1000 + Math.floor((store.uiRng ? store.uiRng.next() : Math.random()) * 1e6);
    var opts = { distance: 40, hash: 0, wind: 0, dirIdx: 0, weather: 'clear' };
    var dots = [];   // {x, h, made}
    var kicks = 0, makes = 0;

    if (!state) {
      el.appendChild(c.el('p', { class: 'txt-grey', style: 'padding:16px', text: 'Start a career to practice.' }));
      return { el: el, destroy: function () {} };
    }

    el.appendChild(c.el('header', { class: 'screen-head' }, c.button({ kind: 'ghost', small: true, icon: 'arrow-l', ariaLabel: 'Back', onClick: function () { RTG.UI.Router.back(); } }), c.el('h1', { class: 'screen-title', text: 'PRACTICE' })));

    // ── pickers ──
    var pickers = c.el('div', { class: 'practice-pickers' });
    function stepper(label, get, set, min, max, step, fmt) {
      var p = c.el('div', { class: 'picker' });
      p.appendChild(c.el('span', { text: label }));
      var val = c.el('span', { class: 'picker-val', text: fmt(get()) });
      var rowEl = c.el('div', { class: 'picker-row' },
        c.button({ label: '−', small: true, ariaLabel: label + ' less', onClick: function () { set(Math.max(min, get() - step)); val.textContent = fmt(get()); rearm(); } }),
        val,
        c.button({ label: '+', small: true, ariaLabel: label + ' more', onClick: function () { set(Math.min(max, get() + step)); val.textContent = fmt(get()); rearm(); } }));
      p.appendChild(rowEl);
      return p;
    }
    function pills(label, items, isActive, onPick) {
      var p = c.el('div', { class: 'picker' });
      p.appendChild(c.el('span', { text: label }));
      var rowEl = c.el('div', { class: 'picker-row', role: 'group', 'aria-label': label });
      items.forEach(function (it) {
        rowEl.appendChild(c.el('button', { class: 'pill' + (isActive(it) ? ' active' : ''), type: 'button', 'aria-pressed': isActive(it) ? 'true' : 'false', text: it.label, onClick: function () {
          onPick(it);
          var b = rowEl.querySelectorAll('.pill');
          for (var i = 0; i < b.length; i++) { var on = b[i].textContent === it.label; b[i].classList.toggle('active', on); b[i].setAttribute('aria-pressed', on ? 'true' : 'false'); }
          rearm();
        } }));
      });
      p.appendChild(rowEl);
      return p;
    }
    pickers.appendChild(stepper('DISTANCE', function () { return opts.distance; }, function (v) { opts.distance = v; }, 18, 75, 1, function (v) { return v + ' YD'; }));
    pickers.appendChild(pills('HASH', HASHES, function (it) { return it.h === opts.hash; }, function (it) { opts.hash = it.h; }));
    pickers.appendChild(stepper('WIND', function () { return opts.wind; }, function (v) { opts.wind = v; }, 0, 30, 2, function (v) { return v ? v + ' MPH' : 'CALM'; }));
    pickers.appendChild(pills('WIND DIR', DIRS, function (it) { return DIRS.indexOf(it) === opts.dirIdx; }, function (it) { opts.dirIdx = DIRS.indexOf(it); }));
    pickers.appendChild(pills('WEATHER', WEATHERS.map(function (w) { return { label: w.toUpperCase(), w: w }; }), function (it) { return it.w === opts.weather; }, function (it) { opts.weather = it.w; }));
    el.appendChild(pickers);

    // ── stage ──
    var stage = c.el('div', { class: 'practice-stage' });
    el.appendChild(stage);

    // ── stats + heat map ──
    var stats = c.el('div', { class: 'practice-stats' });
    var tally = c.el('span', { class: 'chip chip-gold', text: '0/0' });
    var modelChip = c.el('span', { class: 'chip', text: '' });
    var btnSim = c.button({ label: 'SIM 30', kind: 'secondary', small: true, onClick: sim30 });
    var btnClear = c.button({ label: 'CLEAR', kind: 'ghost', small: true, onClick: function () { dots.length = 0; kicks = 0; makes = 0; renderStats(); } });
    stats.appendChild(tally); stats.appendChild(modelChip); stats.appendChild(btnSim); stats.appendChild(btnClear);
    el.appendChild(stats);
    var heat = c.el('div', { class: 'heatmap', role: 'img', 'aria-label': 'Heat map of the last 30 kicks at the goal plane' });
    el.appendChild(heat);

    var G = RTG.Tuning.kick.geometry;
    var HM = { yardsWide: 16, yardsHigh: 12 };   // view: ±8 yd lateral, 0..12 yd high
    function hx(x) { return (0.5 + x / HM.yardsWide) * 100; }
    function hy(h) { return (1 - Math.max(0, Math.min(HM.yardsHigh, h)) / HM.yardsHigh) * 100; }
    function renderHeat() {
      c.clear(heat);
      heat.appendChild(c.el('span', { class: 'hm-post', style: { left: hx(-G.H) + '%' } }));
      heat.appendChild(c.el('span', { class: 'hm-post', style: { left: hx(G.H) + '%' } }));
      heat.appendChild(c.el('span', { class: 'hm-xbar', style: { top: hy(G.XBAR) + '%' } }));
      heat.appendChild(c.el('span', { class: 'hm-label', style: { left: '2px', top: '2px' }, text: 'GOAL PLANE · ' + opts.distance + ' YD' }));
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        heat.appendChild(c.el('span', { class: 'hm-dot' + (d.made ? '' : ' miss') + (i === dots.length - 1 ? ' last' : ''), style: { left: hx(Math.max(-8, Math.min(8, d.x))) + '%', top: hy(d.h) + '%' }, title: d.outcome }));
      }
    }
    function renderStats() {
      tally.textContent = makes + '/' + kicks + (kicks ? ' · ' + Math.round(makes / kicks * 100) + '%' : '');
      try { var m = K.model(buildCtx(), null); modelChip.textContent = 'MODEL ' + Math.round(m.pMake * 100) + '% · MAX ' + Math.round(m.maxFG) + ' YD'; } catch (e) { modelChip.textContent = ''; }
      renderHeat();
    }
    function record(res) {
      kicks++; if (res.made) makes++;
      dots.push({ x: res.xYd, h: res.hYd, made: res.made, outcome: res.outcome });
      while (dots.length > MAX_DOTS) dots.shift();
      renderStats();
    }

    function buildCtx() {
      var sit = { type: 'FG', distance: opts.distance, hash: opts.hash, isUser: true, forSession: true,
        wind: { speed: opts.wind, dir: DIRS[opts.dirIdx].dir }, weather: opts.weather, calm: opts.wind === 0 };
      if (opts.weather === 'dome') { sit.dome = true; sit.wind = { speed: 0, dir: 0 }; }
      if (opts.weather === 'cold') sit.tempF = 28;
      if (opts.weather === 'snow') sit.tempF = 30;
      if (opts.weather === 'heat') sit.tempF = 92;
      var ctx = K.buildContext(store.state, null, sit);
      ctx.label = 'PRACTICE';
      return ctx;
    }
    function resolveWith(ctx, input, auto) {
      var rng = RTG.RNG.create(seed++);
      var inp = input || K.aiInput(rng, ctx, null);
      return K.resolve(rng, ctx, null, inp, auto ? { auto: true } : {});
    }
    function rearm() {
      if (destroyed) return;
      var ctx = buildCtx(), model = K.model(ctx, null);
      if (!view) {
        view = RTG.UI.KickView.mount(stage, {
          ctx: ctx, model: model, settings: store.settings, store: store, mode: 'practice',
          onInput: function (input) { var r = resolveWith(ctx, input, false); record(r); return r; },
          onDone: function () { root.setTimeout(function () { if (!destroyed) rearm(); }, 600); }
        });
      } else if (view.phase() === 'SETUP' || view.phase() === 'DONE' || view.phase() === 'PULL') view.next(ctx, model, { label: 'PRACTICE' });
      renderStats();
    }
    function sim30() {
      var ctx = buildCtx();
      for (var i = 0; i < 30; i++) record(resolveWith(ctx, null, true));
      c.announce('Simulated 30 kicks: ' + makes + ' of ' + kicks + ' made');
    }

    rearm();
    return {
      el: el,
      onResize: function () { if (view) view.resize(); },
      destroy: function () { destroyed = true; if (view) view.destroy(); view = null; }
    };
  }

  Screens.practice = factory;
  if (RTG.UI.Router) RTG.UI.Router.register('practice', factory);
})(typeof window !== 'undefined' ? window : globalThis);
