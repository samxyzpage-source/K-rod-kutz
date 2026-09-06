/**
 * Road to Glory: Kicker — RTG.UI.KickView (SPEC §4.6 — the kick scene, §4.7 audio cues, §4.8 a11y)
 *
 *   var view = RTG.UI.KickView.mount(container, {
 *     ctx, model,                 KickContext + Kick.model(ctx) (every number on screen comes from these)
 *     settings, store,            the shell settings / store (uiRng, autoKickAll, forced-kick notifications)
 *     sessionInfo?: {label, idx, total},   mode?: 'game'|'session'|'practice',
 *     onInput(input) → KickResult|null,    called once with the kick triple; returns the resolved result
 *     onResult?(result),          fired when the ruling banner appears (score tickers update here)
 *     onDone(result),             fired after the result beat
 *     onForced?(info) → KickResult|null    a forced/auto result arrived from the store while waiting for input
 *   }) → {el, canvas, destroy(), skip(), next(ctx, model, sessionInfo?), playResult(result, input?), phase(), layout()}
 *
 * State machine: SETUP → PULL → PRE (snap · approach · swing · contact) → FLIGHT → [FREEZE] → RESULT → DONE
 * (meter mode: SETUP → POWER → NEEDLE → PRE …). Camera A (setup) is behind the kicker with the tee at 78 % of
 * the height and the uprights scaled by distance; Camera B (flight) drifts 4 px and z-sorts the ball behind the
 * crossbar plane after s > 0.92. Everything drawn is a pre-rendered sprite or a fillRect: no per-frame text,
 * no allocations in the loop, ≤ 200 draw calls per frame. HUD text is DOM (.kv-hud chips, banners, feedback).
 *
 * Also exported:
 *   KickView.shouldAutoPat(ctx, settings, store)      the §4.6 auto-PAT rule (+ RTG.debug.autoKick)
 *   KickView.hudParts(ctx, difficultyRow)             ['47 YDS', 'R HASH', 'WIND ← 12', 'RAIN', 'ICED!']
 *   KickView.kickoffBar(parent, {KO, onLock(timing), reduced}) → {el, destroy()}   one-tap timing bar (§2.3.10)
 *   KickView.sessionScreen(store, opts)               the shared showcase / camp / combine / session-kick screen
 *   KickView.current()                                the live view (RTG.debug / tests)
 *   KickView.TIMING                                   every duration used by the scene (ms)
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var doc = root.document;
  var KickView = {};
  var live = null;

  var TIMING = {
    snapMs: 400, approachFrameMs: 60, plantMs: 60, swingFrameMs: 60, swingFrames: 5, contactFlashFrames: 4,
    rushFrames: 6, resultMs: 1200, resultReducedMs: 400, bannerFadeMs: 300, doinkFreezeMs: 500, xbarFreezeMs: 300,
    skipAfterMs: 300, blockedFlightMs: 380, flightScale: 0.75, patFlightScale: 0.77, reducedFlightMs: 80,
    preReducedMs: 120, subBannerMs: 1400, crowdIdleMs: 700, crowdCheerMs: 180, doinkDropMs: 320
  };
  KickView.TIMING = TIMING;

  // ───────────────────────────── helpers ─────────────────────────────
  function C() { return RTG.UI.C; }
  function Sprites() { return RTG.UI.Sprites; }
  function Audio() { return RTG.UI.Audio; }
  function T() { return RTG.Tuning; }
  function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function num(v, d) { return typeof v === 'number' && v === v ? v : d; }
  function now() { return (root.performance && root.performance.now) ? root.performance.now() : Date.now(); }
  function pal(tok) {
    var P = RTG.UI.Palette;
    if (P && typeof P.get === 'function') return P.get(tok);
    var S = Sprites();
    return S && S.PALETTE && S.PALETTE[tok] ? S.PALETTE[tok] : '#ff00ff';
  }
  function reducedMotion(settings) {
    if (settings && settings.reducedMotion) return true;
    var Sh = RTG.UI.Shell;
    if (Sh && typeof Sh.reducedMotion === 'function') return Sh.reducedMotion();
    try { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  function diffRow(ctx) {
    var d = T() && T().difficulty;
    return (d && d[ctx && ctx.difficulty]) || (d && d.pro) || { playClockSec: 2.5, driftPreview: 'full', greenZone: true };
  }
  function el(tag, attrs) {
    var c = C();
    if (c && c.el) return c.el.apply(c, arguments);
    var e = doc.createElement(tag);
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) {
      if (k === 'class') e.className = attrs[k]; else if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]);
    }
    for (var i = 2; i < arguments.length; i++) if (arguments[i]) e.appendChild(arguments[i]);
    return e;
  }
  function announce(text) { var c = C(); if (c && c.announce) c.announce(text); }
  function icon(name, size) { var c = C(); return c && c.icon ? c.icon(name, size) : doc.createTextNode(''); }

  /** The §4.6 auto-PAT rule: off = kick every PAT; safe = auto unless pressure ≥ 0.5; all = auto. */
  KickView.shouldAutoPat = function (ctx, settings, store) {
    if (store && store.autoKickAll) return true;
    if (!ctx || ctx.type !== 'PAT') return false;
    var mode = settings && settings.autoPat || 'off';
    if (mode === 'all') return true;
    if (mode === 'safe') return num(ctx.pressure, 0) < 0.5;
    return false;
  };

  var WEATHER_LABEL = { clear: '', dome: 'DOME', rain: 'RAIN', snow: 'SNOW', fog: 'FOG', cold: 'COLD', heat: 'HEAT' };
  var OUTCOME_TEXT = {
    GOOD: 'GOOD!', WIDE_L: 'WIDE LEFT', WIDE_R: 'WIDE RIGHT', SHORT: 'SHORT', BLOCKED: 'BLOCKED!',
    DOINK_IN: 'DOINK! GOOD', DOINK_OUT: 'DOINK! NO GOOD', XBAR_IN: 'OFF THE BAR! GOOD', XBAR_OUT: 'OFF THE BAR! NO GOOD'
  };
  KickView.OUTCOME_TEXT = OUTCOME_TEXT;

  /** Wind text for a context honouring the difficulty's drift preview: full/numeric → 'WIND ← 12', arrow → 'WIND ←'. */
  function windText(ctx, row) {
    if (ctx.dome || ctx.weather === 'dome') return 'DOME';
    var s = Math.round(num(ctx.wind && ctx.wind.speed, 0));
    if (s < 1) return 'CALM';
    var comp = RTG.Weather && RTG.Weather.components ? RTG.Weather.components(ctx.wind) : { along: 0, cross: 0 };
    var arrow = Math.abs(comp.cross) >= Math.abs(comp.along) ? (comp.cross > 0 ? '→' : '←') : (comp.along > 0 ? '↑' : '↓');
    if (row.driftPreview === 'arrow') return 'WIND ' + arrow;
    return 'WIND ' + arrow + ' ' + s;
  }
  KickView.windText = windText;

  /** HUD strip parts: ['47 YDS', 'R HASH', 'WIND ← 12', 'RAIN', 'ICED!'] */
  KickView.hudParts = function (ctx) {
    var row = diffRow(ctx);
    var parts = [];
    if (ctx.type === 'PAT') parts.push('PAT · ' + ctx.distance + ' YDS');
    else if (ctx.type === 'KO') parts.push('KICKOFF');
    else parts.push(ctx.distance + ' YDS');
    if (ctx.type === 'FG') parts.push(ctx.hash === -1 ? 'L HASH' : ctx.hash === 1 ? 'R HASH' : 'MIDDLE');
    parts.push(windText(ctx, row));
    var w = WEATHER_LABEL[ctx.weather];
    if (w && w !== 'DOME') parts.push(w);
    if (ctx.iced) parts.push('ICED!');
    return parts;
  };

  function situationLabel(ctx, model) {
    var parts = KickView.hudParts(ctx);
    var s = parts.join(', ');
    var p = num(ctx.pressure, 0);
    s += p >= 0.6 ? ', clutch kick' : (p >= 0.35 ? ', pressure on' : '');
    if (ctx.decisive) s += ', the game is on the line';
    if (model && typeof model.pMake === 'number') s += '. Make chance ' + Math.round(model.pMake * 100) + ' percent';
    return s;
  }

  // ═══════════════════════════════ the scene ═══════════════════════════════
  KickView.mount = function (container, opts) {
    opts = opts || {};
    var store = opts.store || RTG.UI.store || null;
    var settings = opts.settings || (store && store.settings) || {};
    var uiRng = opts.uiRng || (store && store.uiRng) || null;
    var Sp = Sprites(); Sp.init();
    var Cv = RTG.UI.Canvas;
    var Inp = RTG.UI.Input;
    var K = RTG.Kick;
    var G = T().kick.geometry;

    var ctx = opts.ctx, model = opts.model || (K ? K.model(ctx, null) : null);
    var sessionInfo = opts.sessionInfo || null;
    var mode = opts.mode || 'game';
    var reduced = reducedMotion(settings);
    var inputMode = settings.inputMode === 'meter' ? 'meter' : 'flick';
    var row = diffRow(ctx);

    // ── DOM ──
    var elRoot = el('div', { class: 'kickview kv-mode-' + inputMode, 'data-phase': 'SETUP' });
    var hud = el('div', { class: 'kv-hud', role: 'group', 'aria-label': 'Kick situation' });
    var stage = el('div', { class: 'kv-stage' });
    var overlay = el('div', { class: 'kv-overlay', 'aria-hidden': 'true' });
    var banner = el('div', { class: 'kv-banner', hidden: true });
    var subBanner = el('div', { class: 'kv-sub', hidden: true });
    var hint = el('div', { class: 'kv-hint' });
    var feedback = el('div', { class: 'kv-feedback', hidden: true });
    var rangePanel = el('div', { class: 'kv-range-panel', hidden: true });
    var skipHint = el('div', { class: 'kv-skip', text: 'TAP TO SKIP', hidden: true });
    overlay.appendChild(subBanner); overlay.appendChild(banner); overlay.appendChild(hint); overlay.appendChild(skipHint);
    stage.appendChild(overlay);
    elRoot.appendChild(hud); elRoot.appendChild(stage); elRoot.appendChild(feedback); elRoot.appendChild(rangePanel);
    container.appendChild(elRoot);

    var cv = Cv.create(stage, { w: 192, h: 320, onResize: function () { if (cv) relayout(); } });
    var canvas = cv.canvas, g = cv.ctx;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('tabindex', '0');
    canvas.setAttribute('aria-label', 'Kick scene');
    stage.insertBefore(canvas, overlay);

    // ── team tints / look ──
    var state = store && store.state;
    var teamTint = ['#d8433a', '#f2f2e6'], oppTint = ['#8a8f9e', '#f4e9d0'];
    var look = null;
    try {
      var P = RTG.UI.Palette;
      var teamId = ctx.game && ctx.game.teamId;
      var oppId = ctx.game && ctx.game.oppId;
      if (P && teamId) teamTint = P.teamTint(teamId);
      if (P && oppId) oppTint = P.teamTint(oppId);
      if (!teamId && P) teamTint = P.teamTint(null);
      if (state && state.player && state.player.look) look = state.player.look;
    } catch (e) { /* cosmetic */ }
    var sprOpts = { tint: teamTint, look: look };
    var crowdTint = ctx.away ? oppTint : teamTint;
    var crowdA = Sp.get('crowd_a', { tint: crowdTint }), crowdB = Sp.get('crowd_b', { tint: crowdTint });
    var crowdDim = Sp.get('crowd_a', { tint: [pal('navy2'), pal('grey')] });
    var kickerSpr = {};
    ['idle', 'lean1', 'lean2', 'lean3', 'approach1', 'approach2', 'approach3', 'plant', 'swing', 'follow'].forEach(function (n) {
      kickerSpr[n] = Sp.get('kicker_' + n, sprOpts);
    });
    var holderSpr = Sp.get('holder', sprOpts), snapperSpr = Sp.get('snapper', sprOpts);
    var rusherSpr = Sp.get('rusher', { tint: oppTint });
    var balls = { 3: Sp.get('ball_3'), 5: Sp.get('ball_5'), 8: Sp.get('ball_8'), 11: Sp.get('ball_11') };
    var ballSquash = Sp.get('ball_squash'), ballSquashV = Sp.get('ball_squash_v');
    var socks = [Sp.get('sock_0'), Sp.get('sock_1'), Sp.get('sock_2'), Sp.get('sock_3')];
    var refSpr = { up: Sp.get('ref_up'), wave: Sp.get('ref_wave'), crossed: Sp.get('ref_crossed') };
    var markerSpr = Sp.get('marker_down');
    var rainSpr = Sp.get('rain'), snowSpr = Sp.get('snow');

    // ── scene state ──
    var L = {};                                   // layout
    var phase = 'SETUP';
    var tPhase = 0, tMount = now();
    var input = null, meter = null;
    var pullP = 0, lean = 0, aimDeg = 0, needleVal = 0, meterP = 0;
    var result = null, kickInput = null, carryYd = 0, flightMs = 0, blockedKick = false, doinkKind = null;
    var ballX = 0, ballY = 0, ballSize = 5, shadowY = 0, ballHidden = false, ballBehind = false, ballAlpha = 1, squash = false, ballLand = 1;
    var kickerPose = 'idle', kickerX = 0, kickerY = 0, kickerMirror = false;
    var contactAt = 0, flashFrames = 0, camX = 0, camY = 0, shakeAmp = 0;
    var crowdFrame = 0, crowdAt = 0, crowdMode = 'idle';
    var refPose = null, flashAlpha = 0, flashColor = null;
    var snapS = 0, rushS = -1, doinkDrop = 0;
    var particles = null, pCount = 0, pKind = null;
    var vignette = null;
    var destroyed = false, unsub = null, timers = [];
    var forcedPending = null;
    var clockOwner = null;
    var lastAria = '';
    var rangeOpen = false;
    var lastTick = 0;

    var pressure = num(ctx.pressure, 0);
    var clu = num(ctx.kicker && ctx.kicker.attrs && ctx.kicker.attrs.CLU, 50);
    var swayAmp = T().kick.pressure.swayDeg * pressure * (1 - clu / T().kick.pressure.swayCluDiv);
    var bpm = T().kick.pressure.heartbeatMin + T().kick.pressure.heartbeatRange * pressure;
    var clutch = pressure >= T().kick.pressure.clutchThreshold;
    var mirror = !!settings.leftFooted;
    var playClockMs = Math.round(num(row.playClockSec, 2.5) * 1000 * (num(settings.playClockMult, 1) || 1));

    function setTimer(fn, ms) { var id = root.setTimeout(function () { if (!destroyed) fn(); }, ms); timers.push(id); return id; }
    function clearTimers() { for (var i = 0; i < timers.length; i++) root.clearTimeout(timers[i]); timers.length = 0; }
    function setPhase(p) { phase = p; tPhase = now(); elRoot.setAttribute('data-phase', p); }
    function elapsed() { return now() - tPhase; }

    // ───────────────────────────── layout ─────────────────────────────
    function relayout() {
      var W = cv.w, H = cv.h, land = cv.landscape;
      L.W = W; L.H = H; L.land = land;
      L.yH = Math.round(H * (land ? 0.30 : 0.27));
      L.yG = Math.round(H * (land ? 0.42 : 0.36));
      L.yT = Math.round(H * 0.78);
      L.xBall = Math.round(W / 2);
      var D = Math.max(8, ctx.distance);
      var frac = clamp(0.60 - (D - 20) * 0.0115, 0.14, 0.60);
      var Wref = land ? Math.min(W, Math.round(H * 1.25)) : W;
      L.upW = Math.max(10, Math.round(frac * Wref));
      L.pxPerYd = L.upW / (2 * G.H);
      L.kv = 0.6 * (H / 320);
      L.xbarPx = Math.max(3, Math.round(G.XBAR * L.pxPerYd * L.kv));
      L.postPx = clamp(Math.round(6.5 * L.pxPerYd * L.kv), 6, Math.max(6, L.yG - L.xbarPx - 6));
      L.thick = L.upW >= 90 ? 3 : (L.upW >= 40 ? 2 : 1);
      L.hashOff = Math.round(0.99 * (num(ctx.ballX, 0) / D) * W);
      L.xPost = L.xBall - L.hashOff;
      L.yXbar = L.yG - L.xbarPx;
      L.yPostTop = L.yXbar - L.postPx;
      L.uprights = Sp.uprights(L.upW, L.postPx, { xbar: L.xbarPx, thick: L.thick, base: Math.max(2, Math.round(L.xbarPx * 0.25)) });
      L.pxPerYdNear = L.pxPerYd * 2.6;
      L.bar = { x: 6, y: Math.round(H * (land ? 0.34 : 0.50)), w: 8, h: Math.round(H * (land ? 0.56 : 0.40)) };
      L.needle = { w: Math.min(W - 20, Math.max(50, L.upW + 20)), h: 6 };
      L.needle.x = clamp(L.xPost - L.needle.w / 2, 4, W - L.needle.w - 4);
      L.needle.y = L.yG + 8;
      L.sock = { x: W - 22, y: Math.max(2, L.yH - 26) };
      L.kickerIdle = { x: L.xBall - (mirror ? -8 : 20), y: L.yT - 18 };
      L.kickerPlant = { x: L.xBall - (mirror ? -1 : 12), y: L.yT - 19 };
      L.holder = { x: L.xBall + (mirror ? -12 : 3), y: L.yT - 8 };
      L.snapper = { x: L.xBall - 5, y: L.yT - Math.round(H * 0.15) };
      L.ring = 11;
      L.D = D;
      buildVignette();
      if (phase === 'SETUP' || phase === 'PULL' || phase === 'POWER' || phase === 'NEEDLE') placeIdle();
    }
    function persp(u) { var k = 1.2; return u * (1 + k) / (1 + k * u); }
    function yAt(d) { return L.yT - (L.yT - L.yG) * persp(clamp(d / L.D, -0.3, 1)); }
    function pxPerYdAt(d) { return lerp(L.pxPerYdNear, L.pxPerYd, persp(clamp(d / L.D, 0, 1))); }
    function centreXAt(d) { return lerp(L.xBall - num(ctx.ballX, 0) * L.pxPerYdNear, L.xPost, persp(clamp(d / L.D, 0, 1))); }
    function aimToX(deg) { return L.xPost + L.D * Math.tan(deg * Math.PI / 180) * L.pxPerYd; }
    function buildVignette() {
      if (reduced || !clutch) { vignette = null; return; }
      var c = doc.createElement('canvas'); c.width = L.W; c.height = L.H;
      var vc = c.getContext('2d');
      var grd = vc.createRadialGradient(L.W / 2, L.H * 0.6, L.H * 0.25, L.W / 2, L.H * 0.6, L.H * 0.8);
      grd.addColorStop(0, 'rgba(16,18,38,0)'); grd.addColorStop(1, 'rgba(16,18,38,0.85)');
      vc.fillStyle = grd; vc.fillRect(0, 0, L.W, L.H);
      vignette = c;
    }
    function placeIdle() {
      ballX = L.xBall; ballY = L.yT; ballSize = 5; shadowY = L.yT; ballHidden = false; ballBehind = false; ballAlpha = 1; squash = false;
      kickerX = L.kickerIdle.x; kickerY = L.kickerIdle.y;
    }

    // ───────────────────────────── particles (rain / snow) ─────────────────────────────
    function initParticles() {
      pKind = ctx.weather === 'rain' ? 'rain' : (ctx.weather === 'snow' ? 'snow' : null);
      if (!pKind || ctx.dome) { pCount = 0; return; }
      pCount = 32;
      particles = new Float32Array(pCount * 4);
      for (var i = 0; i < pCount; i++) seedParticle(i, true);
    }
    function rnd() { return uiRng && uiRng.next ? uiRng.next() : Math.random(); }
    function seedParticle(i, anywhere) {
      var comp = RTG.Weather && RTG.Weather.components ? RTG.Weather.components(ctx.wind) : { cross: 0 };
      var cross = clamp(num(comp.cross, 0) / 20, -1, 1);
      particles[i * 4] = rnd() * L.W;
      particles[i * 4 + 1] = anywhere ? rnd() * L.H : -4;
      particles[i * 4 + 2] = (pKind === 'rain' ? 0.06 : 0.02) * cross * 40 + (pKind === 'snow' ? (rnd() - 0.5) * 0.02 : 0);
      particles[i * 4 + 3] = pKind === 'rain' ? 0.22 + rnd() * 0.08 : 0.035 + rnd() * 0.02;
    }
    function updateParticles(dt) {
      for (var i = 0; i < pCount; i++) {
        particles[i * 4] += particles[i * 4 + 2] * dt;
        particles[i * 4 + 1] += particles[i * 4 + 3] * dt;
        if (particles[i * 4 + 1] > L.H || particles[i * 4] < -4 || particles[i * 4] > L.W + 4) seedParticle(i, false);
      }
    }

    // ───────────────────────────── HUD ─────────────────────────────
    var heartEl = null, rangeBtn = null;
    function buildHud() {
      while (hud.firstChild) hud.removeChild(hud.firstChild);
      var parts = KickView.hudParts(ctx);
      var strip = el('div', { class: 'kv-strip' });
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        var cls = 'chip kv-chip';
        if (p === 'ICED!') cls += ' chip-red kv-iced';
        else if (i === 0) cls += ' chip-gold';
        var chip = el('span', { class: cls, text: p });
        if (p.indexOf('WIND') === 0 && row.driftPreview === 'full' && model && Math.abs(num(model.windDriftYd, 0)) >= 0.05) {
          chip.appendChild(el('span', { class: 'kv-drift', text: ' ' + (model.windDriftYd > 0 ? '→' : '←') + ' ' + (K && K.fmtYards ? K.fmtYards(Math.abs(model.windDriftYd)) : Math.abs(model.windDriftYd).toFixed(1) + ' yd') }));
        }
        strip.appendChild(chip);
      }
      if (sessionInfo && sessionInfo.label) strip.appendChild(el('span', { class: 'chip kv-chip kv-session', text: sessionInfo.label }));
      hud.appendChild(strip);
      var right = el('div', { class: 'kv-hud-right' });
      heartEl = el('span', { class: 'kv-heart' + (clutch ? ' clutch' : '') + (pressure < 0.2 ? ' calm' : ''), 'aria-label': 'pressure ' + Math.round(pressure * 100) + ' percent', title: 'Pressure ' + Math.round(pressure * 100) + '%' });
      heartEl.appendChild(icon('heart', 12));
      heartEl.style.animationDuration = (60 / bpm).toFixed(2) + 's';
      heartEl.appendChild(el('span', { class: 'kv-bpm num', text: String(Math.round(bpm)) }));
      right.appendChild(heartEl);
      if (ctx.type !== 'KO') {
        rangeBtn = el('button', { class: 'btn btn-ghost btn-sm kv-range-btn', type: 'button', 'aria-pressed': 'false', text: 'RANGE?', onClick: toggleRange });
        right.appendChild(rangeBtn);
      }
      hud.appendChild(right);
    }
    function pMakeAt(dist) {
      try {
        var c2 = {};
        for (var k in ctx) if (Object.prototype.hasOwnProperty.call(ctx, k)) c2[k] = ctx[k];
        c2.distance = dist;
        return K.model(c2, null).pMake;
      } catch (e) { return NaN; }
    }
    function toggleRange() {
      rangeOpen = !rangeOpen;
      rangePanel.hidden = !rangeOpen;
      if (rangeBtn) rangeBtn.setAttribute('aria-pressed', rangeOpen ? 'true' : 'false');
      if (!rangeOpen) return;
      while (rangePanel.firstChild) rangePanel.removeChild(rangePanel.firstChild);
      var here = model ? Math.round(num(model.pMake, 0) * 100) : 0;
      rangePanel.appendChild(el('div', { class: 'kv-range-title', text: 'WHAT\'S MY RANGE?' }));
      var rowEl = el('div', { class: 'kv-range-row' });
      rowEl.appendChild(el('span', { class: 'chip chip-gold', text: 'HERE ' + ctx.distance + ' YD: ' + here + '%' }));
      var dists = [30, 40, 50, 55];
      for (var i = 0; i < dists.length; i++) {
        if (dists[i] === ctx.distance) continue;
        var pm = pMakeAt(dists[i]);
        if (pm === pm) rowEl.appendChild(el('span', { class: 'chip', text: dists[i] + ': ' + Math.round(pm * 100) + '%' }));
      }
      rangePanel.appendChild(rowEl);
      if (model) rangePanel.appendChild(el('div', { class: 'small txt-grey kv-range-note', text: 'MAX ' + Math.round(model.maxFG) + ' YD · NEED ' + Math.round(model.pNeed * 100) + '% POWER · σ ' + (model.sigmaDeg).toFixed(1) + '°' }));
    }
    function setHint(text) { hint.textContent = text || ''; hint.hidden = !text; }
    function showBanner(text, kind) {
      banner.textContent = '';
      banner.className = 'kv-banner kv-banner-' + kind;
      var ic = kind === 'good' ? 'check' : (kind === 'bad' ? 'x' : (kind === 'doink' ? 'ball' : 'x'));
      banner.appendChild(icon(ic, 14));
      banner.appendChild(el('span', { text: text }));
      banner.hidden = false;
    }
    function hideBanner() { banner.hidden = true; }
    function showSub(text, kind, ms) {
      subBanner.textContent = text; subBanner.className = 'kv-sub kv-sub-' + (kind || 'info'); subBanner.hidden = false;
      setTimer(function () { subBanner.hidden = true; }, ms || TIMING.subBannerMs);
    }
    function setAria(text) { if (text !== lastAria) { lastAria = text; canvas.setAttribute('aria-label', text); } }
    function showFeedback(res) {
      var fb = res.feedback || {};
      var parts = [];
      if (fb.missBy && fb.missBy.text) parts.push(fb.missBy.text);
      else parts.push(res.made ? (res.sub === 'DEAD_CENTER' ? 'Dead centre' : (res.sub === 'SNEAKS' ? 'Snuck inside the post' : 'Good')) : OUTCOME_TEXT[res.outcome] || res.outcome);
      if (fb.timing) parts.push('Timing: ' + fb.timing);
      parts.push('Power: ' + Math.round(num(res.power, 0) * 100) + ' %');
      feedback.textContent = '';
      feedback.appendChild(el('div', { class: 'kv-feedback-line', text: parts.join(' · ') }));
      if (fb.coachSaw) feedback.appendChild(el('div', { class: 'kv-feedback-coach small', text: fb.coachSaw }));
      feedback.hidden = false;
    }

    // ───────────────────────────── input ─────────────────────────────
    function inputActive() { return phase === 'SETUP' || phase === 'PULL' || phase === 'POWER' || phase === 'NEEDLE'; }
    function ballCss() { var s = cv.scale; return { x: L.xBall * s, y: L.yT * s }; }
    function setupInput() {
      teardownInput();
      if (ctx.type === 'KO') return;
      if (inputMode === 'meter') {
        meter = Inp.meter({
          pressure: pressure, canvasEl: canvas,
          playClockMs: function () { return playClockMs; },
          leftFooted: function () { return mirror; },
          active: inputActive,
          onAim: function (a) { aimDeg = a; },
          onPowerStart: function () { setPhase('POWER'); setHint('SPACE: LOCK POWER'); Audio().click(); },
          onPower: function (p) { meterP = p; var tick = Math.floor(p * 10); if (tick !== lastTick) { lastTick = tick; Audio().click(); } lean = Math.min(3, Math.floor(p * 3)); },
          onPowerLock: function (p) { meterP = p; setPhase('NEEDLE'); setHint('SPACE: STRIKE'); },
          onNeedle: function (n) { needleVal = n; },
          onRelease: function (inp) { onRelease(inp); }
        });
        clockOwner = meter;
        setHint('◄ ► AIM · SPACE: POWER');
      } else {
        input = Inp.flick(canvas, {
          ballAt: ballCss,
          cssHeight: function () { return cv.cssHeight(); },
          landscape: function () { return cv.landscape; },
          playClockMs: function () { return playClockMs; },
          uiRng: uiRng,
          leftFooted: function () { return mirror; },
          active: inputActive,
          onStart: function () { setPhase('PULL'); setHint(''); },
          onPull: function (P, ln) { pullP = P; lean = ln; },
          onTick: function () { Audio().click(); },
          onRelease: function (inp, meta) { onRelease(inp, meta); },
          onCancel: function () { setPhase('SETUP'); pullP = 0; lean = 0; setHint('PULL ↓ · FLICK ↑'); }
        });
        clockOwner = input;
        setHint('PULL ↓ · FLICK ↑');
      }
    }
    function teardownInput() {
      if (input) { input.destroy(); input = null; }
      if (meter) { meter.destroy(); meter = null; }
      clockOwner = null;
    }

    // ───────────────────────────── kick sequence ─────────────────────────────
    function onRelease(inp, meta) {
      if (destroyed || !inputActive()) return;
      var triple = { power: inp.power, aim: inp.aim, quality: inp.quality };
      if (inp.holdMs) triple.holdMs = inp.holdMs;
      var res = null;
      try { res = opts.onInput ? opts.onInput(triple, meta) : null; }
      catch (e) { if (root.console) root.console.error('KickView onInput failed', e); }
      if (!res || typeof res.outcome !== 'string') {
        // the dispatch did not produce a result (e.g. state changed under us): re-arm
        setPhase('SETUP'); pullP = 0; lean = 0; setupInput();
        return;
      }
      beginKick(res, triple);
    }

    /** Start the animation for a resolved result (used by onRelease, forced kicks and auto kicks). */
    function beginKick(res, triple) {
      result = res; kickInput = triple || { power: num(res.power, 0.9), aim: num(res.aim, 0), quality: num(res.quality, 0.85) };
      teardownInput();
      hideBanner(); feedback.hidden = true; subBanner.hidden = true; setHint('');
      skipHint.hidden = true;
      blockedKick = res.outcome === 'BLOCKED';
      doinkKind = (res.outcome === 'DOINK_IN' || res.outcome === 'DOINK_OUT') ? 'post' : ((res.outcome === 'XBAR_IN' || res.outcome === 'XBAR_OUT') ? 'xbar' : null);
      var peff = K && K.peff ? K.peff(kickInput.power, kickInput.quality) : kickInput.power;
      carryYd = model ? Math.max(1, model.carryMax * peff) : L.D * 1.3;
      ballLand = blockedKick ? 0.35 : clamp(carryYd / L.D, 0.2, 1);
      var ft = num(res.flightTime, model ? model.flightTime : 1.0 + 0.026 * L.D);
      flightMs = reduced ? TIMING.reducedFlightMs : Math.round(ft * TIMING.flightScale * (ctx.type === 'PAT' ? TIMING.patFlightScale : 1) * 1000);
      if (blockedKick) flightMs = reduced ? TIMING.reducedFlightMs : TIMING.blockedFlightMs;
      aimDeg = kickInput.aim;
      if (blockedKick) { elRoot.classList.add('kv-rush'); rushS = 0; } else rushS = -1;
      setPhase('PRE');
      setAria('Kick away.');
      if (clutch) Audio().crowd(0.1);
    }

    function preDuration() { return reduced ? TIMING.preReducedMs : TIMING.snapMs + 3 * TIMING.approachFrameMs + TIMING.plantMs + TIMING.swingFrames * TIMING.swingFrameMs; }

    function updatePre() {
      var e = elapsed(), total = preDuration();
      if (reduced) {
        kickerPose = 'swing'; kickerX = L.kickerPlant.x; kickerY = L.kickerPlant.y; snapS = 1;
        if (e >= total) contact();
        return;
      }
      var tApp = TIMING.snapMs, tPlant = tApp + 3 * TIMING.approachFrameMs, tSwing = tPlant + TIMING.plantMs;
      if (e < tApp) { snapS = clamp(e / 250, 0, 1); kickerPose = 'lean' + Math.max(1, lean || 1); kickerX = L.kickerIdle.x; kickerY = L.kickerIdle.y; }
      else if (e < tPlant) {
        snapS = 1;
        var f = Math.min(2, Math.floor((e - tApp) / TIMING.approachFrameMs));
        kickerPose = 'approach' + (f + 1);
        var u = (f + 1) / 3;
        kickerX = Math.round(lerp(L.kickerIdle.x, L.kickerPlant.x, u)); kickerY = Math.round(lerp(L.kickerIdle.y, L.kickerPlant.y, u));
      } else if (e < tSwing) { kickerPose = 'plant'; kickerX = L.kickerPlant.x; kickerY = L.kickerPlant.y; }
      else {
        var sf = Math.floor((e - tSwing) / TIMING.swingFrameMs);
        kickerPose = sf < 3 ? 'plant' : 'swing';
        kickerX = L.kickerPlant.x; kickerY = L.kickerPlant.y;
      }
      if (blockedKick) rushS = clamp((e - tApp) / (TIMING.rushFrames * TIMING.swingFrameMs), 0, 1);
      if (e >= total) contact();
    }
    function contact() {
      contactAt = now();
      flashFrames = TIMING.contactFlashFrames;
      shakeAmp = reduced ? 0 : 2;
      kickerPose = 'follow';
      Audio().thunk(kickInput.power);
      Audio().haptic(30);
      if (!blockedKick) Audio().whoosh();
      setPhase('FLIGHT');
      skipHint.hidden = reduced;
      setAria('Kick in flight.');
    }

    function flightS() { return clamp(elapsed() / flightMs, 0, 1); }
    function updateFlight() {
      var s = flightS();
      placeBall(s);
      if (s >= 1) endFlight();
    }
    /** Ball position along the flight for progress s (0..1). */
    function placeBall(s) {
      var D = L.D;
      var sEff = blockedKick ? Math.min(s, 1) * ballLand : s;
      var d = sEff * D;
      var u = persp(clamp(d / D, 0, 1));
      var xEndYd = num(result.xYd, 0);
      var xEnd = L.xPost + xEndYd * L.pxPerYd;
      if (doinkKind === 'post') xEnd = L.xPost + (xEndYd < 0 ? -1 : 1) * (L.upW / 2 - L.thick / 2);
      var xg = lerp(L.xBall, xEnd, u);
      var yg = lerp(L.yT, L.yG, u);
      var hYd;
      if (blockedKick) hYd = 1.2 * Math.sin(Math.PI * Math.min(1, s)) * 0.5;
      else {
        hYd = G.LINE_DRIVE_H > 0 ? 0 : 0;
        hYd = Math.max(0, T().kick.range.tanLaunch * d * (1 - d / carryYd));
        if (d >= carryYd) hYd = 0;
        if (s >= 0.999) hYd = Math.max(0, num(result.hYd, hYd));
      }
      if (doinkKind === 'xbar' && s >= 0.999) hYd = G.XBAR;
      var hPx = hYd * pxPerYdAt(d) * L.kv;
      ballX = Math.round(xg); shadowY = Math.round(yg); ballY = Math.round(yg - hPx);
      ballSize = 3 + 9 * (4 * s * (1 - s));
      ballBehind = s > 0.92 && !blockedKick;
      camY = reduced ? 0 : -Math.round(4 * Math.sin(Math.PI * s));
    }
    function endFlight() {
      placeBall(1);
      if (doinkKind) {
        squash = true;
        Audio().ting(); Audio().haptic(80);
        if (clutch) Audio().crowd(0.05);
        setPhase('FREEZE');
        setAria('Off the ' + (doinkKind === 'post' ? 'upright' : 'crossbar') + '!');
        return;
      }
      if (!blockedKick && num(result.hYd, 5) < G.XBAR - G.XBAR_BAND) { /* short: the ball drops at the bar */ }
      startResult();
    }
    function updateFreeze() {
      var fz = doinkKind === 'post' ? TIMING.doinkFreezeMs : TIMING.xbarFreezeMs;
      if (reduced) fz = Math.min(fz, 150);
      var e = elapsed();
      if (e < fz) { doinkDrop = 0; return; }
      var dropT = clamp((e - fz) / TIMING.doinkDropMs, 0, 1);
      squash = dropT < 0.15;
      var inward = result.made ? 1 : -1;
      var side = num(result.xYd, 0) < 0 ? -1 : 1;
      if (doinkKind === 'post') { ballX = Math.round(L.xPost + side * (L.upW / 2 - L.thick / 2) - side * inward * 6 * dropT); }
      ballY = Math.round(ballY + 1.5 * (dropT > 0 ? 1 : 0));
      doinkDrop = dropT;
      if (dropT >= 1) startResult();
    }
    function startResult() {
      setPhase('RESULT');
      squash = false;
      var made = !!result.made;
      var kind = made ? 'good' : 'bad';
      var text = OUTCOME_TEXT[result.outcome] || result.outcome;
      if (doinkKind === 'post') kind = 'doink';
      if (result.outcome === 'BLOCKED') kind = 'blocked';
      showBanner(text, kind);
      flashAlpha = reduced ? 0 : 0.55; flashColor = made ? pal('gold') : pal('red');
      refPose = made ? 'up' : 'wave';
      crowdMode = made && !ctx.away ? 'cheer' : (made ? 'cheer' : 'groan');
      if (made) { Audio().stingerGood(); if (clutch) Audio().crowdRoar(); else Audio().crowd(0.35); }
      else { Audio().stingerBad(); Audio().crowd(0.08); }
      Audio().heartbeatStop();
      showFeedback(result);
      var ariaText = text + (result.feedback && result.feedback.missBy && result.feedback.missBy.text ? '. ' + result.feedback.missBy.text : '') + '. ' + ctx.distance + ' yards.';
      setAria(ariaText);
      announce(ariaText);
      if (opts.onResult) { try { opts.onResult(result); } catch (e) { if (root.console) root.console.error('onResult failed', e); } }
      var beat = reduced ? TIMING.resultReducedMs : TIMING.resultMs;
      setTimer(finish, beat);
    }
    function finish() {
      if (destroyed || phase !== 'RESULT') return;
      setPhase('DONE');
      skipHint.hidden = true;
      if (opts.onDone) { try { opts.onDone(result); } catch (e) { if (root.console) root.console.error('onDone failed', e); } }
    }

    function skip() {
      if (phase === 'FLIGHT' && elapsed() >= TIMING.skipAfterMs) { endFlight(); return true; }
      if (phase === 'FREEZE') { startResult(); return true; }
      if (phase === 'RESULT') { clearTimers(); finish(); return true; }
      return false;
    }
    function onStagePointer(e) {
      if (phase === 'FLIGHT' || phase === 'FREEZE' || phase === 'RESULT') { if (skip()) e.preventDefault(); }
    }
    function onKey(e) {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'Spacebar') {
        var t = e.target, tag = t && t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
        if (phase === 'FLIGHT' || phase === 'FREEZE' || phase === 'RESULT') { if (skip()) e.preventDefault(); }
      }
    }

    // ───────────────────────────── store: forced / auto results ─────────────────────────────
    function onStore(info) {
      if (destroyed || !info || !info.forced) return;
      if (!inputActive()) return;
      if (info.fnName !== 'applyUserKick' && info.fnName !== 'sessionKick') return;
      var res = info.fnName === 'sessionKick' ? (info.result && info.result.result) : info.result;
      if (opts.onForced) {
        try { var r2 = opts.onForced(info); if (r2 && typeof r2.outcome === 'string') res = r2; } catch (e) { if (root.console) root.console.error('onForced failed', e); }
      }
      if (res && typeof res.outcome === 'string') beginKick(res, { power: num(res.power, 0.9), aim: num(res.aim, 0), quality: num(res.quality, 0.85) });
    }
    if (store && typeof store.subscribe === 'function') unsub = store.subscribe(onStore);

    // ───────────────────────────── drawing ─────────────────────────────
    function drawSky() {
      var W = L.W, H = L.H;
      var dome = ctx.dome || ctx.weather === 'dome';
      var grey = ctx.weather === 'rain' || ctx.weather === 'fog' || ctx.weather === 'snow';
      g.fillStyle = dome ? pal('navy2') : (grey ? pal('grey') : pal('sky'));
      g.fillRect(0, 0, W, L.yH);
      if (!dome && !grey) {
        g.fillStyle = pal('dusk');
        g.globalAlpha = ctx.weather === 'cold' ? 0.55 : 0.25;
        g.fillRect(0, Math.round(L.yH * 0.55), W, L.yH - Math.round(L.yH * 0.55));
        g.globalAlpha = 1;
      }
      if (dome) {
        g.fillStyle = pal('chalk');
        for (var x = 8; x < W; x += 24) g.fillRect(x, 4, 3, 2);
      }
    }
    function drawCrowd() {
      var tile = crowdMode === 'groan' ? crowdDim : (crowdFrame ? crowdB : crowdA);
      var y = L.yH - 8;
      for (var x = 0; x < L.W; x += 32) g.drawImage(tile, x, y);
    }
    function drawField() {
      var W = L.W, H = L.H;
      g.fillStyle = pal('grass');
      g.fillRect(0, L.yH, W, H - L.yH);
      var D = L.D, endZone = D - 10;
      // 5-yard bands (alternate), from 10 yd behind the ball to the goal line
      var band = 0;
      for (var d = -10; d < endZone; d += 5, band++) {
        if (band % 2 === 1) continue;
        var y1 = Math.round(yAt(Math.min(d + 5, endZone))), y2 = Math.round(yAt(d));
        g.fillStyle = pal('grass2');
        g.fillRect(0, y1, W, Math.max(1, y2 - y1));
      }
      // end zone
      var yGoal = Math.round(yAt(endZone));
      g.fillStyle = pal('grass2'); g.globalAlpha = 0.6;
      g.fillRect(0, L.yG, W, Math.max(1, yGoal - L.yG));
      g.globalAlpha = 1;
      // yard lines + hashes
      g.fillStyle = pal('chalk');
      var lines = 0;
      for (var d2 = -10; d2 <= endZone && lines < 16; d2 += 5, lines++) {
        var y = Math.round(yAt(d2));
        var th = d2 >= endZone - 0.5 ? 2 : (d2 < 15 ? 1 : 1);
        g.fillRect(0, y, W, th);
        if (d2 % 10 === 0 || d2 === endZone) continue;
      }
      // hash marks (two per 5 yd)
      var hashYd = ctx.league === 'NFL' ? T().kick.hash.ballXNfl : T().kick.hash.ballXCollege;
      g.globalAlpha = 0.8;
      for (var d3 = 0; d3 <= endZone && d3 < 60; d3 += 5) {
        var yy = Math.round(yAt(d3)), cx = centreXAt(d3), sc = pxPerYdAt(d3) * hashYd;
        g.fillRect(Math.round(cx - sc), yy - 1, 1, 2);
        g.fillRect(Math.round(cx + sc), yy - 1, 1, 2);
      }
      g.globalAlpha = 1;
      // wall behind the end line
      g.fillStyle = pal('navy2');
      g.fillRect(0, L.yH, W, 1);
    }
    function drawUprights() {
      var up = L.uprights;
      g.drawImage(up, Math.round(L.xPost - up.width / 2), L.yPostTop);
    }
    function drawPeople() {
      // snapper (far), holder, kicker
      if (phase !== 'FLIGHT' || elapsed() < 400) g.drawImage(snapperSpr, L.snapper.x, L.snapper.y);
      g.drawImage(holderSpr, L.holder.x, L.holder.y);
      var spr = kickerSpr[kickerPose] || kickerSpr.idle;
      if (mirror) {
        g.save(); g.translate(kickerX + spr.width, kickerY); g.scale(-1, 1); g.drawImage(spr, 0, 0); g.restore();
      } else g.drawImage(spr, kickerX, kickerY);
    }
    function drawRushers() {
      if (rushS < 0) return;
      var n = 3;
      for (var i = 0; i < n; i++) {
        var sx = L.xBall + (i === 0 ? -34 : (i === 1 ? 30 : -10)), sy = L.snapper.y - 6 + i * 3;
        var ex = L.xBall + (i === 0 ? -12 : (i === 1 ? 8 : -2)), ey = L.yT - 24 + i * 2;
        var u = clamp(rushS * 1.2 - i * 0.1, 0, 1);
        g.drawImage(rusherSpr, Math.round(lerp(sx, ex, u)), Math.round(lerp(sy, ey, u)));
      }
    }
    function drawBall() {
      if (ballHidden) return;
      if (phase === 'PRE' && !reduced && snapS < 1) {
        // snap: ball travels from the snapper to the holder
        var bx = Math.round(lerp(L.snapper.x + 4, L.xBall, snapS)), by = Math.round(lerp(L.snapper.y + 4, L.yT, snapS) - 6 * Math.sin(Math.PI * snapS));
        g.drawImage(balls[5], bx - 2, by - 2);
        return;
      }
      if (phase === 'FLIGHT' || phase === 'FREEZE' || phase === 'RESULT' || phase === 'DONE') {
        if (phase !== 'FLIGHT' || !blockedKick || elapsed() < flightMs) {
          // shadow
          g.fillStyle = 'rgba(16,18,38,0.45)';
          var sw = Math.max(2, Math.round(ballSize * 0.8));
          if (!ballBehind && (phase === 'FLIGHT')) g.fillRect(ballX - (sw >> 1), shadowY, sw, 1);
        }
        if (squash) { if (doinkKind === 'post') g.drawImage(ballSquashV, ballX - (num(result.xYd, 0) < 0 ? 0 : 3), ballY - 4); else g.drawImage(ballSquash, ballX - 4, ballY - 2); return; }
        var spr = ballSize < 4.5 ? balls[3] : (ballSize < 7 ? balls[5] : (ballSize < 10 ? balls[8] : balls[11]));
        if (doinkDrop > 0.2) g.globalAlpha = clamp(1 - (doinkDrop - 0.2), 0.25, 1);
        g.drawImage(spr, ballX - (spr.width >> 1), ballY - (spr.height >> 1));
        g.globalAlpha = 1;
        return;
      }
      // on the tee (setup / pull): the tee mark + ball
      g.drawImage(balls[5], L.xBall - 2, L.yT - 3);
    }
    function drawContactFlash() {
      if (flashFrames <= 0) return;
      g.fillStyle = pal('chalk');
      g.globalAlpha = flashFrames / TIMING.contactFlashFrames;
      var r = 3 + (TIMING.contactFlashFrames - flashFrames) * 2;
      g.fillRect(L.xBall - r, L.yT - 1, r * 2, 2);
      g.fillRect(L.xBall - 1, L.yT - r, 2, r * 2);
      g.globalAlpha = 1;
      flashFrames--;
    }
    function drawRef() {
      if (!refPose) return;
      var spr = refSpr[refPose];
      g.drawImage(spr, Math.round(L.xPost + L.upW / 2 + 6), L.yG - spr.height + 2);
    }
    function drawAim() {
      if (ctx.type === 'KO') return;
      var showAim = inputActive() || phase === 'PRE';
      if (!showAim) return;
      var t = now();
      var sway = swayAmp ? swayAmp * Math.sin(t / 700 * Math.PI * 2) : 0;
      var a = (inputMode === 'meter' || phase === 'PRE' ? aimDeg : 0) + sway;
      var xA = aimToX(a);
      // ghost drift line (full preview): where a centre-aimed ball lands with the wind
      if (row.driftPreview === 'full' && model && Math.abs(num(model.windDriftYd, 0)) >= 0.05 && phase !== 'PRE') {
        var xD = L.xPost + model.windDriftYd * L.pxPerYd;
        g.fillStyle = pal('sky'); g.globalAlpha = 0.7;
        for (var j = 0; j < 12; j++) {
          var uj = 0.15 + 0.8 * j / 11;
          g.fillRect(Math.round(lerp(L.xBall, xD, uj)), Math.round(lerp(L.yT - 6, L.yXbar, uj)), 1, 1);
        }
        g.globalAlpha = 1;
      }
      // aim line (dotted chalk) + marker on the crossbar
      g.fillStyle = pal('chalk'); g.globalAlpha = 0.85;
      for (var i = 0; i < 14; i++) {
        var u = 0.12 + 0.8 * i / 13;
        g.fillRect(Math.round(lerp(L.xBall, xA, u)), Math.round(lerp(L.yT - 6, L.yXbar, u)), 1, 1);
      }
      g.globalAlpha = 1;
      g.drawImage(markerSpr, Math.round(xA - 3), L.yXbar - 6);
      // needle bar (meter mode) under the posts
      if (inputMode === 'meter' && (phase === 'NEEDLE' || phase === 'POWER')) {
        var nb = L.needle;
        g.fillStyle = pal('navy'); g.fillRect(nb.x - 1, nb.y - 1, nb.w + 2, nb.h + 2);
        g.fillStyle = pal('chalk'); g.fillRect(nb.x, nb.y, nb.w, nb.h);
        g.fillStyle = pal('mint'); g.fillRect(Math.round(nb.x + nb.w / 2 - nb.w * 0.05), nb.y, Math.max(2, Math.round(nb.w * 0.1)), nb.h);
        if (phase === 'NEEDLE') { g.fillStyle = pal('red'); g.fillRect(Math.round(nb.x + (needleVal + 1) / 2 * (nb.w - 2)), nb.y - 2, 2, nb.h + 4); }
      }
    }
    function drawPowerBar() {
      if (ctx.type === 'KO') return;
      if (!(phase === 'SETUP' || phase === 'PULL' || phase === 'POWER' || phase === 'NEEDLE' || phase === 'PRE')) return;
      var b = L.bar, R = T().kick.range;
      var P = inputMode === 'meter' ? meterP : (phase === 'PRE' ? kickInput.power : pullP);
      g.fillStyle = pal('navy'); g.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
      g.fillStyle = pal('navy2'); g.fillRect(b.x, b.y, b.w, b.h);
      var pxOf = function (p) { return Math.round(b.y + b.h - (p / R.powerMax) * b.h); };
      if (row.greenZone && model) {
        var y1 = pxOf(Math.min(R.powerMax, model.pNeed + 0.15)), y2 = pxOf(Math.max(0, model.pNeed));
        g.fillStyle = pal('mint'); g.globalAlpha = 0.55; g.fillRect(b.x, y1, b.w, Math.max(1, y2 - y1)); g.globalAlpha = 1;
      }
      var yr = pxOf(1.0);
      g.fillStyle = pal('red'); g.globalAlpha = 0.5; g.fillRect(b.x, b.y, b.w, Math.max(1, yr - b.y)); g.globalAlpha = 1;
      g.fillStyle = pal('gold');
      var yf = pxOf(clamp(P, 0, R.powerMax));
      g.fillRect(b.x, yf, b.w, b.y + b.h - yf);
      g.fillStyle = pal('chalk');
      for (var i = 1; i <= 11; i++) { var ty = pxOf(i * 0.1); if (ty > b.y) g.fillRect(b.x, ty, i % 5 === 0 ? b.w : 3, 1); }
      Sp.drawText(g, 'PWR', b.x - 2, b.y + b.h + 4, pal('chalk'), 1);
    }
    function drawClockRing() {
      if (ctx.type === 'KO' || !clockOwner) return;
      if (!(phase === 'PULL' || phase === 'POWER' || phase === 'NEEDLE')) return;
      var total = clockOwner.clockTotal(); if (!total) return;
      var rem = clockOwner.clockRemaining() / total;
      var r = L.ring;
      g.lineWidth = 2;
      g.strokeStyle = pal('navy'); g.globalAlpha = 0.5;
      g.beginPath(); g.arc(L.xBall, L.yT, r, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 1;
      g.strokeStyle = rem < 0.3 ? pal('red') : pal('gold');
      g.beginPath(); g.arc(L.xBall, L.yT, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * rem); g.stroke();
    }
    function drawSock() {
      var speed = num(ctx.wind && ctx.wind.speed, 0);
      if (ctx.dome) return;
      var comp = RTG.Weather && RTG.Weather.components ? RTG.Weather.components(ctx.wind) : { cross: 0, along: 0 };
      var frame = speed < 1 ? 0 : (speed < 7 ? 1 : (speed < 14 ? 2 : 3));
      var flip = comp.cross < -0.5;
      var spr = socks[frame];
      if (flip) { g.save(); g.translate(L.sock.x + spr.width, L.sock.y); g.scale(-1, 1); g.drawImage(spr, 0, 0); g.restore(); }
      else g.drawImage(spr, L.sock.x, L.sock.y);
      g.fillStyle = pal('steel') || '#c9ccd6'; g.fillRect(L.sock.x + (flip ? spr.width - 1 : 0), L.sock.y + 8, 1, 10);
      if (speed >= 1 && row.driftPreview !== 'arrow') Sp.drawText(g, String(Math.round(speed)), L.sock.x + 2, L.sock.y + 10, pal('chalk'), 1);
    }
    function drawParticles() {
      if (!pCount) return;
      var spr = pKind === 'rain' ? rainSpr : snowSpr;
      for (var i = 0; i < pCount; i++) g.drawImage(spr, Math.round(particles[i * 4]), Math.round(particles[i * 4 + 1]));
      if (ctx.weather === 'fog') { g.fillStyle = pal('chalk'); g.globalAlpha = 0.18; g.fillRect(0, L.yH - 12, L.W, L.yG - L.yH + 24); g.globalAlpha = 1; }
    }
    function drawOverlays() {
      if (ctx.weather === 'fog' && !pCount) { g.fillStyle = pal('chalk'); g.globalAlpha = 0.18; g.fillRect(0, L.yH - 12, L.W, L.yG - L.yH + 30); g.globalAlpha = 1; }
      if (vignette && (inputActive() || phase === 'PRE' || phase === 'FLIGHT')) g.drawImage(vignette, 0, 0);
      if (flashAlpha > 0) { g.fillStyle = flashColor; g.globalAlpha = flashAlpha; g.fillRect(0, 0, L.W, L.H); g.globalAlpha = 1; flashAlpha = Math.max(0, flashAlpha - 0.06); }
    }

    function draw() {
      g.save();
      g.translate(camX, camY);
      drawSky();
      drawCrowd();
      drawField();
      var ballFront = !ballBehind;
      if (ballFront) drawUprights();
      drawPeople();
      drawRushers();
      drawBall();
      if (!ballFront) drawUprights();
      drawRef();
      drawAim();
      drawContactFlash();
      drawPowerBar();
      drawClockRing();
      drawSock();
      drawParticles();
      g.restore();
      drawOverlays();
    }

    function update(dt, t) {
      // crowd animation
      var period = crowdMode === 'cheer' ? TIMING.crowdCheerMs : TIMING.crowdIdleMs;
      if (t - crowdAt > period) { crowdAt = t; crowdFrame = crowdMode === 'groan' ? 0 : 1 - crowdFrame; }
      // shake (pressure while aiming; contact)
      var amp = 0;
      if (!reduced) {
        if (inputActive()) amp = 2 * pressure;
        if (shakeAmp > 0) { amp = Math.max(amp, shakeAmp); shakeAmp = Math.max(0, shakeAmp - dt / 60); }
      }
      camX = amp ? Math.round((rnd() - 0.5) * 2 * amp) : 0;
      if (phase !== 'FLIGHT') camY = amp ? Math.round((rnd() - 0.5) * 2 * amp) : 0;
      if (meter) meter.update(t);
      if (inputMode === 'meter' && phase === 'POWER') lean = Math.min(3, Math.floor(meterP * 3));
      if (inputActive()) {
        kickerPose = (phase === 'PULL' || phase === 'POWER' || phase === 'NEEDLE') && lean > 0 ? 'lean' + Math.min(3, lean) : 'idle';
        kickerX = L.kickerIdle.x; kickerY = L.kickerIdle.y;
      }
      if (phase === 'PRE') updatePre();
      else if (phase === 'FLIGHT') updateFlight();
      else if (phase === 'FREEZE') updateFreeze();
      if (pCount) updateParticles(dt);
    }

    function loop(dt, t) { update(dt, t); draw(); }

    // ───────────────────────────── (re)arm for a context ─────────────────────────────
    function arm(newCtx, newModel, newSession) {
      clearTimers();
      teardownInput();
      ctx = newCtx; model = newModel || (K ? K.model(ctx, null) : null); sessionInfo = newSession || null;
      row = diffRow(ctx);
      pressure = num(ctx.pressure, 0);
      clu = num(ctx.kicker && ctx.kicker.attrs && ctx.kicker.attrs.CLU, 50);
      swayAmp = T().kick.pressure.swayDeg * pressure * (1 - clu / T().kick.pressure.swayCluDiv);
      bpm = T().kick.pressure.heartbeatMin + T().kick.pressure.heartbeatRange * pressure;
      clutch = pressure >= T().kick.pressure.clutchThreshold;
      result = null; kickInput = null; blockedKick = false; doinkKind = null; refPose = null; crowdMode = 'idle'; squash = false; doinkDrop = 0; rushS = -1;
      pullP = 0; lean = 0; aimDeg = 0; needleVal = 0; meterP = 0; flashAlpha = 0; camX = 0; camY = 0; ballBehind = false; ballAlpha = 1;
      elRoot.classList.remove('kv-rush');
      hideBanner(); feedback.hidden = true; subBanner.hidden = true; skipHint.hidden = true; rangePanel.hidden = true; rangeOpen = false;
      relayout();
      initParticles();
      placeIdle();
      buildHud();
      setPhase('SETUP');
      setupInput();
      if (ctx.type === 'KO') setHint('');
      setAria(situationLabel(ctx, model));
      Audio().heartbeatStop();
      if (clutch) { Audio().heartbeat(bpm); Audio().crowd(0.12); }
      else Audio().crowd(0.2 + 0.4 * pressure);
      if (ctx.iced) { showSub('ICED!', 'iced'); Audio().whistle(); setTimer(function () { if (ctx.decisive) showSub('GAME ON THE LINE', 'clutch'); }, TIMING.subBannerMs + 100); }
      else if (ctx.decisive) showSub('GAME ON THE LINE', 'clutch');
      else if (clutch) showSub('CLUTCH', 'clutch', 900);
      // auto kicks (RTG.debug.autoKick) are handled by the screens; nothing to do here
    }

    stage.addEventListener('pointerdown', onStagePointer);
    root.addEventListener('keydown', onKey);
    relayout();
    arm(ctx, model, sessionInfo);
    cv.start(loop);

    var view = {
      el: elRoot, canvas: canvas, cv: cv,
      phase: function () { return phase; },
      layout: function () { return L; },
      ctx: function () { return ctx; },
      result: function () { return result; },
      skip: skip,
      next: function (c2, m2, s2) { arm(c2, m2, s2); return view; },
      /** Animate an externally resolved result (auto kicks, forced kicks). */
      playResult: function (res, triple) { if (res && typeof res.outcome === 'string') beginKick(res, triple); return view; },
      resize: function () { cv.resize(); },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        clearTimers();
        teardownInput();
        if (unsub) { unsub(); unsub = null; }
        stage.removeEventListener('pointerdown', onStagePointer);
        root.removeEventListener('keydown', onKey);
        Audio().heartbeatStop(); Audio().crowdStop();
        cv.destroy();
        if (elRoot.parentNode) elRoot.parentNode.removeChild(elRoot);
        if (live === view) live = null;
      }
    };
    live = view;
    return view;
  };

  KickView.current = function () { return live; };

  // ═══════════════════════════════ kickoff timing bar (§2.3.10) ═══════════════════════════════
  /**
   * One-tap timing bar: a needle sweeps −1..+1 (900 ms per sweep, looping); tap / Space locks `timing`.
   * Green zone width = Kick.kickoffGreenZone(KO) percent of the bar (centred). opts: {KO, onLock(timing), reduced, label}
   */
  KickView.kickoffBar = function (parent, opts) {
    opts = opts || {};
    var K = RTG.Kick;
    var KO = num(opts.KO, 50);
    var zonePct = K && K.kickoffGreenZone ? K.kickoffGreenZone(KO) : 12 + 0.35 * KO;
    var wrap = el('div', { class: 'ko-bar', role: 'group', 'aria-label': 'Kickoff timing' });
    wrap.appendChild(el('div', { class: 'ko-label', text: opts.label || 'KICKOFF — TAP IN THE GREEN' }));
    var track = el('div', { class: 'ko-track' });
    var zone = el('div', { class: 'ko-zone', style: { left: (50 - zonePct / 2) + '%', width: zonePct + '%' } });
    var needle = el('div', { class: 'ko-needle' });
    track.appendChild(zone); track.appendChild(needle);
    wrap.appendChild(track);
    var btn = el('button', { class: 'btn btn-primary btn-block ko-btn', type: 'button', text: 'KICK!' });
    wrap.appendChild(btn);
    parent.appendChild(wrap);
    var t0 = now(), locked = false, timer = 0, val = -1, destroyed = false;
    var period = opts.reduced ? 1400 : 900;
    function tick() {
      if (locked || destroyed) return;
      var ph = ((now() - t0) / period) % 2;
      val = -1 + 2 * (ph < 1 ? ph : 2 - ph);
      needle.style.left = ((val + 1) / 2 * 100).toFixed(1) + '%';
    }
    function lock() {
      if (locked || destroyed) return;
      locked = true;
      root.clearInterval(timer);
      needle.classList.add('locked');
      btn.disabled = true;
      var inZone = Math.abs(val) <= zonePct / 100;
      wrap.appendChild(el('div', { class: 'ko-verdict ' + (inZone ? 'txt-mint' : 'txt-red'), text: inZone ? 'IN THE ZONE' : (val < 0 ? 'EARLY' : 'LATE') }));
      if (opts.onLock) opts.onLock(Math.round(val * 1000) / 1000);
    }
    function onKey(e) { if ((e.key === ' ' || e.key === 'Enter') && !locked) { e.preventDefault(); lock(); } }
    btn.addEventListener('click', lock);
    track.addEventListener('pointerdown', function (e) { e.preventDefault(); lock(); });
    root.addEventListener('keydown', onKey);
    timer = root.setInterval(tick, 16);
    return {
      el: wrap,
      value: function () { return val; },
      destroy: function () {
        destroyed = true;
        root.clearInterval(timer);
        root.removeEventListener('keydown', onKey);
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      }
    };
  };

  /** Short text for a KickoffResult. */
  KickView.kickoffText = function (ko) {
    if (!ko) return '';
    if (ko.onside) return ko.recovered ? 'ONSIDE KICK RECOVERED!' : 'Onside kick — not recovered';
    if (ko.returnTd) return 'RETURNED FOR A TOUCHDOWN';
    if (ko.oob) return 'Out of bounds — ball at the ' + ko.startYard;
    if (ko.touchback) return 'TOUCHBACK · ' + Math.round(ko.dist) + ' yd · hang ' + num(ko.hang, 0).toFixed(1) + ' s';
    return 'Returned to the ' + ko.startYard + ' · hang ' + num(ko.hang, 0).toFixed(1) + ' s';
  };

  // ═══════════════════════════════ shared session screen ═══════════════════════════════
  /**
   * The screen shared by showcase / camp battle / combine / halftime-70 / tryout sessions: plays
   * state.pending.session one context at a time through store.dispatch('sessionKick', input).
   * opts: {
   *   className, title,
   *   header(state, session) → el            built once (slots strip / scoreboard / ladder)
   *   update(headerEl, state, session, info) called after every kick (info = sessionKick return) and at start (info null)
   *   tutorial: boolean                      showcase tutorial overlays (dismissed by the first kick)
   *   onComplete(outcome, session, state)    default: Router.sync()
   *   nextDelayMs                            pause after the result beat before the next kick (default 700)
   * }
   */
  KickView.sessionScreen = function (store, opts) {
    opts = opts || {};
    var c = C();
    var K = RTG.Kick;
    var state = store.state;
    var rootEl = el('div', { class: 'screen-session ' + (opts.className || '') });
    var header = el('div', { class: 'session-header' });
    var stageWrap = el('div', { class: 'session-stage' });
    var koSlot = el('div', { class: 'session-ko', hidden: true });
    rootEl.appendChild(header); rootEl.appendChild(stageWrap); rootEl.appendChild(koSlot);
    var view = null, koBar = null, destroyed = false, timers = [], tut = null, headerEl = null, lastInfo = null;

    function setTimer(fn, ms) { var id = root.setTimeout(function () { if (!destroyed) fn(); }, ms); timers.push(id); }
    function session() { var s = store.state; return s && s.pending && s.pending.kind === 'KICKS' ? s.pending.session : null; }
    function nextIdx(sess) {
      if (sess.kind && sess.kind.indexOf('COMBINE') === 0 && RTG.Draft && typeof RTG.Draft.combineNextIdx === 'function') return RTG.Draft.combineNextIdx(sess);
      var i = sess.results.length;
      return i < sess.contexts.length ? i : -1;
    }
    function refreshHeader(info) {
      var sess = session();
      if (opts.update && headerEl) { try { opts.update(headerEl, store.state, sess, info); } catch (e) { if (root.console) root.console.error('session header update failed', e); } }
    }
    function complete(info) {
      refreshHeader(info);
      setTimer(function () {
        if (opts.onComplete) opts.onComplete(info ? info.outcome : null, info, store.state);
        else RTG.UI.Router.sync();
      }, opts.completeDelayMs !== undefined ? opts.completeDelayMs : 900);
    }
    function afterKick(info) {
      lastInfo = info;
      refreshHeader(info);
      if (!info) { RTG.UI.Router.sync(); return; }
      if (info.done) { complete(info); return; }
      setTimer(startKick, opts.nextDelayMs !== undefined ? opts.nextDelayMs : 700);
    }
    function dismissTutorial() {
      if (!tut) return;
      if (tut.parentNode) tut.parentNode.removeChild(tut);
      tut = null;
      root.removeEventListener('keydown', dismissTutorial, true);
    }
    function buildTutorial() {
      var steps = [
        { icon: 'arrow-d', text: 'PULL DOWN\nfor power' },
        { icon: 'arrow-u', text: 'FLICK UP\nto aim' },
        { icon: 'wind', text: 'WIND SOCK\ntop right' }
      ];
      var t = el('div', { class: 'tut-overlay', role: 'note' });
      for (var i = 0; i < steps.length; i++) {
        var s = el('div', { class: 'tut-step' + (i === 2 ? ' tut-wind' : '') });
        s.appendChild(el('span', { class: 'tut-num', text: String(i + 1) }));
        s.appendChild(icon(steps[i].icon, 12));
        s.appendChild(el('span', { class: 'tut-text', text: steps[i].text }));
        t.appendChild(s);
      }
      if (store.settings && store.settings.inputMode === 'meter') {
        t.textContent = '';
        t.appendChild(el('div', { class: 'tut-step' }, el('span', { class: 'tut-text', text: '◄ ► AIM · SPACE ×3\npower · strike' })));
      }
      return t;
    }
    function startKick() {
      var sess = session();
      if (!sess) { RTG.UI.Router.sync(); return; }
      var idx = nextIdx(sess);
      if (idx < 0) { afterKick(null); return; }
      var ctx = sess.contexts[idx];
      var info = { label: ctx.label || ((idx + 1) + '/' + sess.contexts.length), idx: idx, total: sess.contexts.length };
      if (koBar) { koBar.destroy(); koBar = null; }
      koSlot.hidden = true;
      if (ctx.type === 'KO') { startKickoff(ctx, info); return; }
      var model = K.model(ctx, null);
      if (!view) {
        view = KickView.mount(stageWrap, {
          ctx: ctx, model: model, settings: store.settings, store: store, sessionInfo: info, mode: 'session',
          onInput: function (input) {
            dismissTutorial();
            var r = store.dispatch('sessionKick', input);
            lastInfo = r;
            return r ? r.result : null;
          },
          onForced: function (notice) { dismissTutorial(); lastInfo = notice.result; return notice.result && notice.result.result; },
          onDone: function () { afterKick(lastInfo); }
        });
        if (opts.tutorial && !tut) {
          tut = buildTutorial();
          view.el.querySelector('.kv-stage').appendChild(tut);
          view.el.addEventListener('pointerdown', dismissTutorial, true);   // first touch dismisses (non-blocking overlay)
          root.addEventListener('keydown', dismissTutorial, true);
        }
      } else view.next(ctx, model, info);
      if (store.autoKickAll) {
        setTimer(function () {
          if (destroyed || view.phase() !== 'SETUP') return;
          var r = store.dispatch('sessionKick', null);
          lastInfo = r;
          view.playResult(r.result);
        }, 30);
      }
    }
    function startKickoff(ctx, info) {
      koSlot.hidden = false;
      while (koSlot.firstChild) koSlot.removeChild(koSlot.firstChild);
      var KO = num(ctx.kicker && ctx.kicker.attrs && ctx.kicker.attrs.KO, 50);
      if (view) view.next(ctx, K.geometry ? null : null, info);
      var reduced = reducedMotion(store.settings);
      koBar = KickView.kickoffBar(koSlot, { KO: KO, reduced: reduced, label: (info.label || 'KICKOFF') + ' — TAP IN THE GREEN', onLock: function (timing) {
        var r = store.dispatch('sessionKick', { timing: timing });
        var txt = KickView.kickoffText(r.result);
        koSlot.appendChild(el('div', { class: 'ko-result', text: txt }));
        announce(txt);
        setTimer(function () { afterKick(r); }, reduced ? 400 : 1400);
      } });
      if (store.autoKickAll) setTimer(function () { if (!destroyed && koBar) { var r = store.dispatch('sessionKick', null); afterKick(r); } }, 30);
    }
    function onStore(info) {
      if (destroyed) return;
      // a forced kickoff (RTG.debug.forceKick with a KO context) dispatches sessionKick without the view
      if (info.fnName === 'sessionKick' && koBar && !view) { afterKick(info.result); }
    }
    var unsub = store.subscribe(onStore);

    var sess0 = session();
    if (opts.header && sess0) { headerEl = opts.header(state, sess0); header.appendChild(headerEl); refreshHeader(null); }
    if (!sess0) { rootEl.appendChild(el('p', { class: 'txt-grey', text: 'No kick session is pending.' })); }
    else startKick();

    return {
      el: rootEl,
      view: function () { return view; },
      onResize: function () { if (view) view.resize(); },
      destroy: function () {
        destroyed = true;
        for (var i = 0; i < timers.length; i++) root.clearTimeout(timers[i]);
        unsub();
        dismissTutorial();
        if (koBar) koBar.destroy();
        if (view) view.destroy();
        view = null;
      }
    };
  };

  RTG.UI.KickView = KickView;
})(typeof window !== 'undefined' ? window : globalThis);
