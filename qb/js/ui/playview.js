/**
 * Road to Glory: QB — RTG.UI.PlayView (the QB moment scene; modelled on kicker/js/ui/kickview.js)
 *
 *   var view = RTG.UI.PlayView.mount(container, {
 *     ctx,                        PlayContext (Play.buildContext): situation, real, shown, options, pressure, receivers …
 *     settings, store?,           the shell settings (reducedMotion, colorblind, highContrast, leftHanded, keys, greenAssist, audio)
 *     onPick(playId) → PlaySim,   the shell calls Play.snap (a run option returns {run:true, yards, td, firstDown, text})
 *     onThrow(input) → PlayResult the shell calls Play.throw (input.kind: 'THROW' | 'THROWAWAY' | 'SCRAMBLE' | 'SACK')
 *     onDone(result),             fired after the result beat (a run option's result is built here: outcome 'RUN')
 *     onResult?(result),          fired when the banner appears
 *     onSettings?(),              Escape from the chromeless scene (§4.8); RTG.UI.app.openSettings is the fallback
 *     reduced?: bool, tints?: {home:[a,b], opp:[a,b]}, uiRng?
 *   }) → {el, canvas, cv, destroy(), phase(), skip(), layout(), current() → {sim, target, t}, ctx(), sim(), result(),
 *         pick(idx | playId), target(slot), holdStart(), holdEnd(), throwAway(), scramble(), playResult(result),
 *         input(), greenZone(), actors(), project(xYd, yYd), resize()}
 *
 * Phases: SITUATION (a DOM card over the dimmed field; TAP TO READ) → READ (the canvas shows the SHOWN look; the play
 * cards in the panel; tap one → onPick) → SNAP (t runs 0 → 4 s in real time: routes, rings from revealAt, rushers, the
 * pressure meter; tap / 1–5 / arrows / Tab pick a receiver) → THROW (the velocity bar climbs while the finger or key is
 * held, a drag sets lead / loft, the release throws; THROW AWAY after 1.2 s, SCRAMBLE with the mobility) → FLIGHT (the
 * ball arcs in perspective to result.landing over flight × 0.75 s, the target runs under it, then the catch / YAC /
 * pick / bounce beat) | SACK | RUN → RESULT (banner, feedback line, crowd; skippable after 300 ms) → DONE (onDone).
 *
 * Camera: fixed behind and above the quarterback. project(xYd, yYd) puts the line of scrimmage at 0.78 × H, the horizon
 * at 0.28 × H, 45 yards of depth in view and 53⅓ yards across the width at the line, narrowing with depth; every sprite
 * goes through it and shrinks with its scale (receivers 11 → 4 px). The stands above the horizon are the kicker's venues
 * in miniature (HS bleacher · college bowl · NFL decks), pre-rendered per layout into three crowd frames; the field with
 * its yard lines, hashes, numbers and the end zone is pre-rendered per layout + yard line. Per frame: two drawImages of
 * those layers, then ≤ 40 sprites / rects. No per-frame text on the canvas (the HUD is DOM), no allocations in the loop.
 *
 * The engine's shapes (RTG.Play): ctx.look is the SHOWN look (ctx.shown the coverage id; ctx.real is never drawn),
 * ctx.receivers the READ picture (shotgun), sim.receivers[].path is absolute (x from the ball, y from the line, t
 * scaled by speed; extrapolated along the last segment and capped at capY exactly like Play.pathAt), open[] is the
 * openness over the ARRIVAL time (Play.openAt reads it, the ring colours come from Tuning.qb.open.ring), rushers
 * {lane −1|0|1, arriveAt}, sim.hot / checkdown slots, ctx.hash offsets the field. A run option's sim IS the result
 * (outcome 'RUN', no onThrow). The green band follows Play.need every frame of the hold (the arrival at full power and
 * the route's ideal loft, needFor, greenBand — computed here without allocating), so the band the player releases in
 * is the band the engine verifies for input.green. A scratch fixture with RELATIVE paths (x, y from the alignment,
 * no capY / family) still works: it is offset by x0 / y0 and the scene's own needFor stands in.
 *
 * Extra phases: SACK (the rusher arrives; ≈ 0.4 s) and RUN (a scramble / SNEAK / DRAW beat) sit between THROW and
 * RESULT. At the pick the offence slides from the READ picture into the play's formation over TIMING.alignMs (0 with
 * reduced motion) before t starts; a back / slot released from the backfield joins the engine's line-of-scrimmage
 * path over TIMING.releaseS.
 *
 * Also exported: PlayView.TIMING, PlayView.FIELD, PlayView.VENUES, PlayView.OUTCOME_TEXT, PlayView.hudParts(ctx),
 * PlayView.needFor(distYd, ARM), PlayView.greenBandFor(ACC), PlayView.current(), PlayView.escapeToSettings(ev).
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var doc = root.document;
  var PlayView = {};
  var live = null;

  var TIMING = {
    alignMs: 420, dropMs: 450, rotateMs: 600, releaseS: 0.5, playMaxS: 4, throwAwayAfterS: 1.2, scrambleAfterS: 0.3,
    flightScale: 0.75, reducedFlightMs: 80, minFlightMs: 260, throwPoseMs: 250,
    catchHoldMs: 250, yacBaseMs: 140, yacPerYdMs: 55, yacMaxMs: 900, intReturnMs: 320, bounceMs: 220,
    sackMs: 380, runMs: 720, resultMs: 1200, resultReducedMs: 400, skipAfterMs: 300, bannerFadeMs: 300, subBannerMs: 1400,
    crowdIdleMs: 700, crowdCheerMs: 180, runFrameMs: 110, hintMs: 1600,
    armMs: 200,                          // a phase ignores a confirm key / a field tap this long after it mounts (a double tap on NEXT, three quick Enters)
    pausePollMs: 100                     // a beat's timer re-arms in these steps while a modal is open (the play clock freezes under Settings)
  };
  PlayView.TIMING = TIMING;

  /** The camera / field geometry (presentation only — nothing here reaches the engine). */
  var FIELD = {
    widthYd: 53.33, depthYd: 45, losFrac: 0.78, horizonFrac: 0.28, farScale: 0.36, k: 1.2,
    hitRadius: 28,                       // virtual px: the nearest receiver within this radius takes a tap
    ringW: 12, ringMinW: 6,
    hashNfl: 3.083, hashCollege: 6.667, numbersIn: 8.5,
    qbUnderCentre: -1.6, qbShotgun: -5, qbDrop: -6, qbGunDrop: -6.5, ballHandYd: 1.8,
    arcMin: 1.5, arcPerLoft: 10          // the flight's apex (yards) = arcMin + arcPerLoft × loft
  };
  PlayView.FIELD = FIELD;

  /** Where the eleven defenders line up for a LOOK {safeties, press, box, showBlitz} and where roles send them after the snap. */
  var LOOK = {
    dlX: [-4.5, -1.5, 1.5, 4.5], dlY: 1, lbY: 4.5, lbX: { 1: [0], 2: [-3, 3], 3: [-4, 0, 4] }, blitzY: 1.5,
    cbPressY: 1.5, cbOffY: 7, cbShade: 1, nickelY: 5, nickelPressY: 2, safeties2: [[-9, 12], [9, 12]], safeties1: [[0, 13]]
  };
  var DEEP = {
    COVER2: [[-9, 14], [9, 14]], COVER3: [[0, 17], [9, 7]], COVER4: [[-7, 15], [7, 15]],
    MAN: [[0, 15], [0, 8]], BLITZ: [[0, 14], [-9, 6]], PREVENT: [[-8, 20], [8, 20]]
  };
  var CUSHION = { base: 0.8, perOpen: 6.5, inside: 0.35, converge: 9 };   // a shadow stands base + perOpen × open(t) yards off its man
  var ALIGN = { WR1: [-22, 0], WR2: [22, 0], SLOT: [-12, -1], TE: [6, 0], RB: [2, -5] };
  var SLOT_ORDER = ['WR1', 'WR2', 'SLOT', 'TE', 'RB'];

  var OUTCOME_TEXT = {
    CATCH: 'CATCH', INCOMPLETE: 'INCOMPLETE', INT: 'INTERCEPTED', SACK: 'SACKED', THROWAWAY: 'THROWN AWAY',
    SCRAMBLE: 'SCRAMBLE', RUN: 'RUN', DROP: 'DROPPED'
  };
  PlayView.OUTCOME_TEXT = OUTCOME_TEXT;

  // ───────────────────────────── helpers ─────────────────────────────
  function C() { return RTG.UI.C; }
  function Sprites() { return RTG.UI.Sprites; }
  function Audio() { return RTG.UI.Audio || {}; }
  function T() { return RTG.Tuning || {}; }
  function TQ() { return (RTG.Tuning && RTG.Tuning.qb) || {}; }
  function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function num(v, d) { return typeof v === 'number' && v === v ? v : d; }
  function now() { return (root.performance && root.performance.now) ? root.performance.now() : Date.now(); }
  function cue(name, a) { var A = Audio(); if (typeof A[name] === 'function') { try { A[name](a); } catch (e) { /* audio is optional */ } } }
  function pal(tok) {
    var P = RTG.UI.Palette;
    if (P && typeof P.get === 'function') return P.get(tok);
    var S = Sprites();
    return S && S.PALETTE && S.PALETTE[tok] ? S.PALETTE[tok] : '#ff00ff';
  }
  function reducedMotion(settings) {
    if (settings && settings.reducedMotion) return true;
    try { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
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
  /** A kit modal (Settings) is open: the scene freezes its clocks and takes no input. */
  function paused() { var c = C(); return !!(c && typeof c.modalOpen === 'function' && c.modalOpen()); }
  function icon(name, size) { var c = C(); return c && c.icon ? c.icon(name, size) : doc.createTextNode(''); }
  function coarsePointerNow() {
    try { return !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches); } catch (e) { return false; }
  }
  function keyLabelOf(k) {
    if (k === ' ' || k === 'Spacebar' || k === 'Space' || !k) return 'SPACE';
    return String(k).replace('Arrow', '').toUpperCase();
  }
  /** Deterministic 0..1 for a seat or a star (the crowd frames agree and nothing here touches the rng). */
  function noise(i, j, k) {
    var n = (i * 374761393 + j * 668265263 + (k || 0) * 1274126177) | 0;
    n = Math.imul(n ^ (n >>> 13), 1103515245);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  function ordinal(n) { return n === 1 ? '1ST' : n === 2 ? '2ND' : n === 3 ? '3RD' : n + 'TH'; }
  function clockText(sec) { sec = Math.max(0, Math.round(num(sec, 0))); var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; }
  function ylText(yl) { yl = Math.round(num(yl, 50)); if (yl === 50) return 'THE 50'; return yl < 50 ? 'OWN ' + yl : 'OPP ' + (100 - yl); }
  function fx1(v) { return (Math.round(v * 100) / 100).toFixed(2); }

  /** HUD strip parts: ['3RD & 7', 'OWN 34', 'Q4 0:48', '21-24', 'WIND ← 8', 'RAIN']. */
  PlayView.hudParts = function (ctx) {
    var s = (ctx && ctx.situation) || ctx || {};
    var parts = [], Pl = RTG.Play;
    var toGo = num(s.toGo, 10);
    parts.push(Pl && typeof Pl.downText === 'function' ? Pl.downText(s) : ordinal(num(s.down, 1)) + ' & ' + (toGo >= 100 - num(s.yl, 50) ? 'GOAL' : toGo));
    parts.push(Pl && typeof Pl.spotText === 'function' ? Pl.spotText(s.yl) : ylText(s.yl));
    var q = num(s.quarter, 4);
    parts.push((q > 4 ? 'OT' : 'Q' + q) + ' ' + clockText(s.clock));
    var sc = s.score || {};
    parts.push(num(sc.us, 0) + '-' + num(sc.them, 0));
    var w = s.weather;
    if (w) {
      var W = RTG.Weather;
      var label = W && typeof W.label === 'function' ? W.label(w) : '';
      if (label) parts.push(label);
      var kind = String(w.weather || '').toLowerCase();
      if (kind === 'rain' || kind === 'snow' || kind === 'fog' || kind === 'cold' || kind === 'heat') parts.push(kind.toUpperCase());
    }
    return parts;
  };

  /**
   * The on-time velocity for a throw of `distYd` yards with an ARM rating: the bottom of the green band. Reads
   * Tuning.qb.throw.need {base, span, rangeBase, rangePerArm} when the engine provides it; the fallback is the same
   * shape (a 99-ARM arm reaches 65 yards at full power, a 50-ARM arm 52).
   */
  PlayView.needFor = function (distYd, ARM) {
    var th = TQ().throw || {};
    var N = th.need || {};
    var rangeBase = num(N.rangeBase, 40), rangePerArm = num(N.rangePerArm, 25), base = num(N.base, 0.2), span = num(N.span, 0.8);
    var range = rangeBase + rangePerArm * clamp(num(ARM, 50), 0, 99) / 99;
    return clamp(base + span * Math.max(0, num(distYd, 10)) / range, 0.15, 1.0);
  };
  /** Width of the green band by ACC: Tuning.qb.throw.greenBand ({base, perAcc} or a number); fallback 0.16 + 0.10 × ACC/99. */
  PlayView.greenBandFor = function (ACC) {
    var gb = (TQ().throw || {}).greenBand;
    if (typeof gb === 'number') return gb;
    var base = num(gb && gb.base, 0.16), per = num(gb && gb.perAcc, 0.10);
    return base + per * clamp(num(ACC, 50), 0, 99) / 99;
  };

  // ═══════════════════════════════ the stands (the kicker's venues in miniature) ═══════════════════════════════
  var VENUES = {
    HS: { night: true, bleacher: { width: 0.56, rows: 2 }, fill: 0.35, perPressure: 0.45, awayShare: 0.15, stars: 18, trees: true, poles: [[0.12, 0.62, 6], [0.88, 0.62, 6], [0.985, 0.92, 8]] },
    COLLEGE: { night: false, lower: 0.30, upper: 0.18, edgeRise: 0.35, fill: 0.6, perPressure: 0.2, awayShare: 0.1, band: true, towers: [0.1, 0.9] },
    NFL: { night: true, lower: 0.30, upper: 0.32, roof: 0.10, edgeRise: 0.35, fill: 0.9, perPressure: 0.1, awayShare: 0.15, jumbotron: { width: 0.42, maxWidth: 96, height: 0.30 }, lampEvery: 20 }
  };
  PlayView.VENUES = VENUES;
  function venueOf(ctx) {
    var s = (ctx && ctx.situation) || {};
    var v = s.venue || (ctx && ctx.venue);
    return (v === 'HS' || v === 'COLLEGE' || v === 'NFL') ? v : 'COLLEGE';
  }
  PlayView.venueOf = venueOf;

  // ═══════════════════════════════ the scene ═══════════════════════════════
  PlayView.mount = function (container, opts) {
    opts = opts || {};
    var store = opts.store || RTG.UI.store || null;
    var settings = opts.settings || (store && store.settings) || {};
    var Sp = Sprites(); Sp.init();
    if (typeof Audio().init === 'function') Audio().init();
    var Cv = RTG.UI.Canvas;
    var Inp = RTG.UI.PlayInput;

    var ctx = opts.ctx || {};
    var sit = ctx.situation || {};
    var reduced = opts.reduced !== undefined ? !!opts.reduced : reducedMotion(settings);
    var mirror = !!(settings.leftHanded || settings.leftFooted || settings.mirror);
    var qb = ctx.qb || sit.qb || {};
    var attrs = qb.attrs || {};
    var ARM = num(attrs.ARM, 50), ACC = num(attrs.ACC, 50), MOB = num(attrs.MOB, 50);
    var qbAttrs = { ARM: ARM, ACC: ACC, IQ: num(attrs.IQ, 50), MOB: MOB, POI: num(attrs.POI, 50) };   // what the green band is computed with

    function liveSettings() { return (store && store.settings) || settings || {}; }
    function pressLabel() { return coarsePointerNow() ? 'TAP' : keyLabelOf(Inp.resolveKeys(liveSettings().keys).confirm); }

    // ── DOM ──
    var elRoot = el('div', { class: 'playview', 'data-phase': 'SITUATION' });
    var hud = el('div', { class: 'pv-hud', role: 'group', 'aria-label': 'Situation' });
    var stage = el('div', { class: 'pv-stage' });
    var overlay = el('div', { class: 'pv-overlay', 'aria-hidden': 'true' });
    var banner = el('div', { class: 'pv-banner', hidden: true });
    var subBanner = el('div', { class: 'pv-sub', hidden: true });
    var toastLine = el('div', { class: 'pv-toast', hidden: true });
    var skipHint = el('div', { class: 'pv-skip', text: 'TAP TO SKIP', hidden: true });
    var situationCard = el('div', { class: 'pv-situation', role: 'group', 'aria-label': 'The situation' });
    var panel = el('div', { class: 'pv-panel' });
    var lookLine = el('div', { class: 'pv-look', role: 'status', hidden: true });
    var cards = el('div', { class: 'pv-cards', role: 'group', 'aria-label': 'Pick a play', hidden: true });
    var throwBox = el('div', { class: 'pv-throwbox', hidden: true });
    var feedback = el('div', { class: 'pv-feedback', hidden: true });
    overlay.appendChild(subBanner); overlay.appendChild(banner); overlay.appendChild(toastLine); overlay.appendChild(skipHint);
    stage.appendChild(overlay); stage.appendChild(situationCard);
    panel.appendChild(lookLine); panel.appendChild(cards); panel.appendChild(throwBox); panel.appendChild(feedback);
    elRoot.appendChild(hud); elRoot.appendChild(stage); elRoot.appendChild(panel);
    container.appendChild(elRoot);

    var cv = Cv.create(stage, { w: 192, h: 320, onResize: function () { if (cv) relayout(); } });
    var canvas = cv.canvas, g = cv.ctx;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('tabindex', '0');
    canvas.setAttribute('aria-label', 'The field');
    stage.insertBefore(canvas, overlay);

    // ── tints (Palette.teamTint rules: a team object with colors, else the palette's defaults) ──
    var teamTint = [pal('red'), pal('chalk')], oppTint = [pal('grey'), pal('cream')];
    try {
      var P = RTG.UI.Palette;
      var home = (opts.tints && opts.tints.home) || (sit.team && sit.team.colors) || null;
      var away = (opts.tints && opts.tints.opp) || (sit.opp && sit.opp.colors) || null;
      if (home && home[0]) teamTint = [home[0], home[1] || pal('chalk')];
      else if (P && sit.team && sit.team.id) teamTint = P.teamTint(sit.team);
      if (away && away[0]) oppTint = [away[0], away[1] || pal('cream')];
      else if (P && sit.opp && sit.opp.id) oppTint = P.teamTint(sit.opp);
    } catch (e) { /* cosmetic */ }
    var look = (qb.look) || (store && store.state && store.state.player && store.state.player.look) || null;

    // ── sprites ──
    var qbSpr = [Sp.get('qb_back0', { tint: teamTint, look: look }), Sp.get('qb_back1', { tint: teamTint, look: look }), Sp.get('qb_back2', { tint: teamTint, look: look })];
    var recSpr = [Sp.get('receiver_run0', { tint: teamTint }), Sp.get('receiver_run1', { tint: teamTint }), Sp.get('receiver_catch', { tint: teamTint })];
    var defSpr = [Sp.get('defender_run0', { tint: oppTint }), Sp.get('defender_run1', { tint: oppTint }), Sp.get('defender_set', { tint: oppTint })];
    var rusherSpr = [Sp.get('rusher', { tint: oppTint }), Sp.get('defender_run1', { tint: oppTint })];
    var olSpr = Sp.get('lineman_block', { tint: teamTint });
    var balls = { 2: Sp.get('ball_2'), 3: Sp.get('ball_3'), 5: Sp.get('ball_5'), 8: Sp.get('ball_8'), 11: Sp.get('ball_11') };
    var rings = {};
    /** The palette-tinted tiles (re-read on every arm and on a settings change, so a palette toggled mid-moment shows at once). */
    function loadRings() {
      rings.open = Sp.get('ring_open', { tint: [pal('mint'), pal('mint')] }); rings.closing = Sp.get('ring_closing', { tint: [pal('gold'), pal('gold')] });
      rings.closed = Sp.get('ring_closed', { tint: [pal('red'), pal('red')] }); rings.pick = Sp.get('ring_closing', { tint: [pal('chalk'), pal('chalk')] });
      rings.range = Sp.get('ring_closed', { tint: [pal('grey'), pal('grey')] });   // beyond the arm: grey (the closed shape, so cb / hc read it as "no")
    }
    loadRings();
    var pickSpr = Sp.get('target_pick'), hotSpr = Sp.get('hot_flag'), leadAhead = Sp.get('lead_ahead'), leadBehind = Sp.get('lead_behind');
    var rainSpr = Sp.get('rain'), snowSpr = Sp.get('snow');

    // ── scene state ──
    var L = {};
    var phase = 'SITUATION', tPhase = 0;
    var sim = null, result = null, pickedId = null, pickedOpt = null;
    var input = null;
    var tSnap = 0, tPlay = 0, tThrow = 0, thrown = false, sacked = false;
    var target = -1, hold = false, meterP = 0, lead = 0, loft = 0.5, zone = null, lastTick = -1;
    var lastInput = null;
    var flightMs = 0, flightS = 0, landBeat = null, landAt = 0, landMs = 0;
    var ballX = 0, ballY = 0, ballH = 0, ballSize = 0, ballShown = false, ballGround = 0, ballCarrier = -1;
    var qbX = 0, qbY = FIELD.qbUnderCentre, qbPose = 0, qbDown = 0, qbFace = 1;
    var shakeAmp = 0, camX = 0, camY = 0, flashAlpha = 0, flashColor = null;
    var crowdFrame = 0, crowdAt = 0, crowdMode = 'idle';
    var stadium = null, fieldLayer = null, vignette = null, posts = null;
    var destroyed = false, timers = [];
    var venue = venueOf(ctx);
    var clutch = !!(ctx.clutch || (ctx.pressure && ctx.pressure.clutch) || sit.clutch);
    var pressure = clamp(num(sit.pressure, num(ctx.pressureLevel, clutch ? 0.7 : 0.35)), 0, 1);
    if (pressure >= 0.6) clutch = true;
    var particles = null, pCount = 0, pKind = null, pSeed = 1;
    var lastAria = '';
    var hudPressureFill = null, hudPressureVal = -1, velFill = null, velGreen = null, velRed = null, velLabel = null, aimLead = null, aimLoft = null, hintEl = null, btnAway = null, btnScr = null, playChip = null;
    var lastLeadTxt = '', lastLoftTxt = '';
    var runYards = 0, runFrom = 0, runActor = -1, runX = 0, runT0 = 0;
    var hotSlot = -1, rotateMs = TIMING.rotateMs;
    var gun = false, alignMs = 0, alignU = 1, qbFromY = 0, zoneLive = { lo: 0, hi: 0, dist: 0 }, zoneStatic = false, lastZoneLo = -1;

    // actors: 0..10 defenders · 11..15 receivers · 16..20 O-line · 21 QB
    var NDEF = 11, NREC = 5, NOL = 5, NACT = 22, IREC = 11, IOL = 16, IQB = 21;
    var aX = new Float64Array(NACT), aY = new Float64Array(NACT), aSX = new Float64Array(NACT), aSY = new Float64Array(NACT), aS = new Float64Array(NACT);
    var aFrame = new Int8Array(NACT), aShow = new Int8Array(NACT), order = new Int16Array(NACT);
    var recOpen = new Float64Array(NREC), recRing = new Int8Array(NREC), recVX = new Float64Array(NREC), recVY = new Float64Array(NREC);
    // recOpen is the openness a ball RELEASED NOW would find (Play.openIfThrown: the arrival at full power and the
    // route's ideal loft) — what the rings show and what the INT gate judges; recOpenNow is the openness at this
    // instant (the shadow's cushion); recDist the arrival distance (yd), recLoft the route's ideal loft.
    var recOpenNow = new Float64Array(NREC), recDist = new Float64Array(NREC), recLoft = new Float64Array(NREC);
    var arrDist = 0, maxDistYd = Infinity, rushFirst = -1, clockChip = null, clockShown = -1, unsubSettings = null;
    var recX0 = new Float64Array(NREC), recY0 = new Float64Array(NREC), recReveal = new Float64Array(NREC), recSlot = [], recPathFn = [], recPathArr = [], recOpenFn = [], recOpenArr = [], recOpenDt = new Float64Array(NREC), recSpeed = new Float64Array(NREC), recLastX = new Float64Array(NREC), recLastY = new Float64Array(NREC);
    var recAbs = new Int8Array(NREC), recCap = new Float64Array(NREC), recFromX = new Float64Array(NREC), recFromY = new Float64Array(NREC), recRoute = [], recObj = [];
    var defPreX = new Float64Array(NDEF), defPreY = new Float64Array(NDEF), defRole = new Int8Array(NDEF), defArg = new Int16Array(NDEF), defZX = new Float64Array(NDEF), defZY = new Float64Array(NDEF), defArrive = new Float64Array(NDEF), defLaneX = new Float64Array(NDEF), defRush = new Int8Array(NDEF);
    var olX0 = [-4, -2, 0, 2, 4], olPush = new Int8Array(NOL);
    var ROLE_SHADOW = 1, ROLE_DEEP = 2, ROLE_RUSH = 3, ROLE_BLITZ = 4, ROLE_HOLD = 5;
    var recCount = 0, defCount = 0;
    var pt = { x: 0, y: 0, s: 1 }, pt2 = { x: 0, y: 0 };
    var converge = -1, convergeX = 0, convergeY = 0, intMan = -1, dropMan = -1, tThrowPlay = 0;

    /** A beat's timer; while a modal is open it re-arms in pausePollMs steps instead of firing (the beat waits for the player). */
    function setTimer(fn, ms) {
      var id = root.setTimeout(function () {
        if (destroyed) return;
        if (paused()) { setTimer(fn, TIMING.pausePollMs); return; }
        fn();
      }, ms);
      timers.push(id);
      return id;
    }
    function clearTimers() { for (var i = 0; i < timers.length; i++) root.clearTimeout(timers[i]); timers.length = 0; }
    function setPhase(p) { phase = p; tPhase = now(); elRoot.setAttribute('data-phase', p); }
    function elapsed() { return now() - tPhase; }
    function inPlay() { return phase === 'SNAP' || phase === 'THROW'; }

    // ───────────────────────────── the camera ─────────────────────────────
    function relayout() {
      var W = cv.w, H = cv.h, land = cv.landscape;
      L.W = W; L.H = H; L.land = land;
      L.yHor = Math.round(H * FIELD.horizonFrac);
      L.yLOS = Math.round(H * FIELD.losFrac);
      L.xC = Math.round(W / 2);
      L.pxPerYd = W / FIELD.widthYd;
      L.kv = 0.8;
      L.hashYd = venue === 'NFL' ? FIELD.hashNfl : FIELD.hashCollege;
      L.hashShift = -clamp(num(ctx.hash, 0), -1, 1) * L.hashYd;   // the ball sits on a hash: the field's centre is offset from the camera
      L.yl = num(sit.yl, 50);
      L.goalD = 100 - L.yl;                       // yards from the line to the goal line
      L.endZone = L.goalD <= FIELD.depthYd;
      buildVignette();
      buildStadium();
      buildField();
      buildPosts();
    }
    /** Field yards (x lateral from the centre, y downfield from the line) → virtual px + sprite scale (shared object). */
    function project(xYd, yYd, out) {
      out = out || pt;
      var u = yYd / FIELD.depthYd;
      if (u < -0.3) u = -0.3; else if (u > 1) u = 1;
      var p = u * (1 + FIELD.k) / (1 + FIELD.k * u);
      var s = 1 - p * (1 - FIELD.farScale);
      out.x = L.xC + xYd * L.pxPerYd * s;
      out.y = L.yLOS - (L.yLOS - L.yHor) * p;
      out.s = s;
      return out;
    }
    function buildVignette() {
      if (reduced || !clutch) { vignette = null; return; }
      var c = doc.createElement('canvas'); c.width = L.W; c.height = L.H;
      var vc = c.getContext('2d');
      var grd = vc.createRadialGradient(L.W / 2, L.H * 0.6, L.H * 0.25, L.W / 2, L.H * 0.6, L.H * 0.8);
      grd.addColorStop(0, 'rgba(16,18,38,0)'); grd.addColorStop(1, 'rgba(16,18,38,0.85)');
      vc.fillStyle = grd; vc.fillRect(0, 0, L.W, L.H);
      vignette = c;
    }

    // ───────────────────────────── the field (pre-rendered per layout + yard line) ─────────────────────────────
    function sidelineX(y, side) {
      // the field's half width at screen row y: invert the projection's depth term
      var p = (L.yLOS - y) / (L.yLOS - L.yHor);
      var s = 1 - p * (1 - FIELD.farScale);
      return L.xC + (L.hashShift + side * (FIELD.widthYd / 2)) * L.pxPerYd * s;
    }
    function buildField() {
      var W = L.W, H = L.H, y0 = L.yHor;
      var c = doc.createElement('canvas'); c.width = W; c.height = H - y0;
      var f = c.getContext('2d'); f.imageSmoothingEnabled = false;
      f.translate(0, -y0);
      var yl = L.yl;
      // out of bounds: the darker green, then the field's stripes clipped to the trapezoid
      f.fillStyle = pal('grass2'); f.fillRect(0, y0, W, H - y0);
      f.save(); f.beginPath();
      f.moveTo(sidelineX(y0, -1), y0); f.lineTo(sidelineX(y0, 1), y0); f.lineTo(sidelineX(H, 1), H); f.lineTo(sidelineX(H, -1), H); f.closePath(); f.clip();
      f.fillStyle = pal('grass'); f.fillRect(0, y0, W, H - y0);
      var k0 = Math.floor((yl - 10) / 5), k1 = Math.ceil((yl + FIELD.depthYd) / 5), k, A, y1, y2;
      f.fillStyle = pal('grass2');
      for (k = k0; k <= k1; k++) {
        if (k % 2 === 0) continue;
        A = k * 5;
        if (A < 0 || A >= 100) continue;
        y1 = Math.round(project(0, Math.min(100, A + 5) - yl).y); y2 = Math.round(project(0, A - yl).y);
        if (y2 > y1) f.fillRect(0, y1, W, y2 - y1);
      }
      // the end zone and the wall beyond it
      if (L.endZone) {
        var yG = Math.round(project(0, L.goalD).y), yE = Math.round(project(0, L.goalD + 10).y);
        f.fillStyle = teamTint[0]; f.globalAlpha = 0.8; f.fillRect(0, yE, W, Math.max(1, yG - yE)); f.globalAlpha = 1;
        f.fillStyle = pal('navy2'); f.fillRect(0, y0, W, Math.max(0, yE - y0));
      }
      // yard lines every 5, the goal line 2 px, hashes every yard
      f.fillStyle = pal('chalk');
      for (k = k0; k <= k1; k++) {
        A = k * 5;
        if (A < 0 || A > 100) continue;
        var d = A - yl, y = Math.round(project(0, d).y), th = A === 100 || A === 0 ? 2 : 1;
        if (y < y0 || y > H) continue;
        f.fillRect(Math.round(sidelineX(y, -1)), y, Math.round(sidelineX(y, 1)) - Math.round(sidelineX(y, -1)), th);
      }
      f.globalAlpha = 0.8;
      for (A = Math.max(1, Math.floor(yl - 8)); A < Math.min(100, yl + FIELD.depthYd); A++) {
        if (A % 5 === 0) continue;
        project(L.hashShift - L.hashYd, A - yl); f.fillRect(Math.round(pt.x), Math.round(pt.y), 1, 1);
        project(L.hashShift + L.hashYd, A - yl); f.fillRect(Math.round(pt.x), Math.round(pt.y), 1, 1);
      }
      f.globalAlpha = 1;
      // the numbers at the tens (both sides), scaled with depth
      var numX = FIELD.widthYd / 2 - FIELD.numbersIn;
      for (A = 10; A <= 90; A += 10) {
        var dd = A - yl;
        if (dd < -7 || dd > FIELD.depthYd) continue;
        var label = A <= 50 ? A : 100 - A;
        var digits = String(label);
        for (var side = -1; side <= 1; side += 2) {
          project(L.hashShift + side * numX, dd);
          var sc = pt.s, gh = Math.max(3, Math.round(7 * sc * 1.1)), gw = Math.max(2, Math.round(5 * sc * 1.1));
          var total = digits.length * gw + (digits.length - 1);
          var x = Math.round(pt.x - total / 2), yy = Math.round(pt.y - gh / 2);
          f.globalAlpha = 0.85;
          for (var di = 0; di < digits.length; di++) { f.drawImage(Sp.get('yard' + digits.charAt(di)), x + di * (gw + 1), yy, gw, gh); }
          f.globalAlpha = 1;
        }
      }
      f.restore();
      // sidelines
      f.fillStyle = pal('chalk');
      for (var ry = y0; ry < H; ry++) { f.fillRect(Math.round(sidelineX(ry, -1)), ry, 1, 1); f.fillRect(Math.round(sidelineX(ry, 1)) - 1, ry, 1, 1); }
      fieldLayer = c;
    }
    function buildPosts() {
      posts = null;
      if (!L.endZone) return;
      project(L.hashShift, L.goalD + 10);
      var w = Math.max(6, Math.round(6.17 * L.pxPerYd * pt.s)), h = Math.max(6, Math.round(10 * L.pxPerYd * pt.s * L.kv * 0.6));
      posts = { img: Sp.uprights(w, h, { thick: 1, xbar: Math.max(3, Math.round(h * 0.55)), base: 2 }), x: Math.round(pt.x - w / 2), y: Math.round(pt.y) - h - Math.max(3, Math.round(h * 0.55)) - 2 };
    }

    // ───────────────────────────── the stands (pre-rendered) ─────────────────────────────
    function buildStadium() {
      var spec = VENUES[venue] || VENUES.COLLEGE;
      var dimTint = [pal('navy2'), pal('grey')];
      stadium = {
        a: paintStadium(spec, 'fans_a', 'fansfar_a', 'band_a', teamTint, oppTint),
        b: paintStadium(spec, 'fans_b', 'fansfar_b', 'band_b', teamTint, oppTint),
        dim: paintStadium(spec, 'fans_a', 'fansfar_a', 'band_a', dimTint, dimTint)
      };
    }
    function paintStadium(spec, fansName, farName, bandName, homeTint, visitTint) {
      var W = L.W, h = Math.max(1, L.yHor);
      var c = doc.createElement('canvas'); c.width = W; c.height = h;
      var s = c.getContext('2d'); s.imageSmoothingEnabled = false;
      var tiles = {
        seats: Sp.get('seats'), bench: Sp.get('bench'), seatsFar: Sp.get('seatsfar'), band: Sp.get(bandName),
        fans: Sp.get(fansName, { tint: homeTint }), fansAway: Sp.get(fansName, { tint: visitTint }),
        far: Sp.get(farName, { tint: homeTint }), farAway: Sp.get(farName, { tint: visitTint })
      };
      var fill = clamp(num(spec.fill, 0.5) + num(spec.perPressure, 0) * pressure + (clutch ? 0.1 : 0), 0, 1);
      paintSky(s, spec, W, h);
      if (spec.bleacher) paintSchool(s, spec, tiles, fill, W, h);
      else paintBowl(s, spec, tiles, fill, W, h);
      return c;
    }
    function steel() { return pal('steel') || '#c9ccd6'; }
    function weatherKind() { var w = sit.weather; return String((w && w.weather) || '').toLowerCase(); }
    function isDome() { var w = sit.weather; return !!(w && (w.dome || w.weather === 'dome')); }
    function paintSky(s, spec, W, h) {
      var wk = weatherKind(), grey = wk === 'rain' || wk === 'fog' || wk === 'snow';
      if (isDome()) {
        s.fillStyle = pal('navy2'); s.fillRect(0, 0, W, h);
        s.fillStyle = pal('chalk');
        for (var x = 8; x < W; x += 24) s.fillRect(x, 4, 3, 2);
        return;
      }
      if (spec.night) {
        s.fillStyle = grey ? pal('navy2') : pal('night'); s.fillRect(0, 0, W, h);
        if (grey) return;
        s.fillStyle = pal('navy'); s.fillRect(0, Math.round(h * 0.45), W, h);
        s.fillStyle = pal('dusk'); s.globalAlpha = 0.6; s.fillRect(0, Math.round(h * 0.72), W, h);
        s.fillStyle = pal('sunset'); s.globalAlpha = 0.35; s.fillRect(0, Math.round(h * 0.9), W, h);
        s.globalAlpha = 0.7; s.fillStyle = pal('chalk');
        for (var i = 0; i < num(spec.stars, 0); i++) s.fillRect(Math.floor(noise(i, 2, 9) * W), Math.floor(noise(i, 3, 9) * h * 0.55), 1, 1);
        s.globalAlpha = 1;
        return;
      }
      s.fillStyle = grey ? pal('grey') : pal('sky'); s.fillRect(0, 0, W, h);
      if (!grey) { s.fillStyle = pal('dusk'); s.globalAlpha = wk === 'cold' ? 0.55 : 0.25; s.fillRect(0, Math.round(h * 0.55), W, h - Math.round(h * 0.55)); s.globalAlpha = 1; }
    }
    function fillColumns(s, W, topAt, botAt, color, alpha) {
      s.fillStyle = color;
      if (alpha) s.globalAlpha = alpha;
      var x = 0;
      while (x < W) {
        var t = topAt(x), b = botAt(x), x1 = x + 1;
        while (x1 < W && topAt(x1) === t && botAt(x1) === b) x1++;
        if (b > t) s.fillRect(x, t, x1 - x, b - t);
        x = x1;
      }
      if (alpha) s.globalAlpha = 1;
    }
    function clippedColumns(s, W, topAt, botAt, paint) {
      s.save(); s.beginPath();
      var x = 0;
      while (x < W) {
        var t = topAt(x), b = botAt(x), x1 = x + 1;
        while (x1 < W && topAt(x1) === t && botAt(x1) === b) x1++;
        if (b > t) s.rect(x, t, x1 - x, b - t);
        x = x1;
      }
      s.clip(); paint(); s.restore();
    }
    function paintTier(s, o) {
      var base = o.base, tw = base.width, th = base.height, slot = 8, x, r, y, w, sx, t, k;
      for (r = 0; r < o.rows; r++) {
        y = o.yBot - th * (r + 1);
        for (x = o.x0; x < o.x1; x += tw) { w = Math.min(tw, o.x1 - x); s.drawImage(base, 0, 0, w, th, x, y, w, th); }
        for (x = o.x0; x < o.x1; x += slot) {
          w = Math.min(slot, o.x1 - x);
          if (o.band && r < o.band.rows && x >= o.band.x0 && x < o.band.x1) {
            t = o.band.tile; sx = (x - o.band.x0) % t.width;
            s.drawImage(t, sx, 0, Math.min(w, t.width - sx), t.height, x, y, Math.min(w, t.width - sx), t.height);
            continue;
          }
          k = (x - o.x0) / slot;
          if (noise(k, r, o.key) >= o.fill) continue;
          t = noise(k, r, o.key + 7) < o.awayShare ? o.fansAway : o.fans;
          sx = (x - o.x0) % t.width;
          s.drawImage(t, sx, 0, Math.min(w, t.width - sx), t.height, x, y, Math.min(w, t.width - sx), t.height);
        }
      }
    }
    function scoreLine(labelHome, labelGuest) {
      var sc = sit.score || {}, us = num(sc.us, 0), them = num(sc.them, 0);
      var home = sit.away ? them : us, guest = sit.away ? us : them;
      return { home: home, guest: guest, text: labelHome + ' ' + home + '  ' + labelGuest + ' ' + guest };
    }
    function periodText() { var q = num(sit.quarter, 1); return q > 4 ? 'OT' : 'Q' + q; }
    function paintBoard(s, cx, yBot, text, bh, frame, fillCol, textCol, W) {
      var bw = Sp.textWidth(text, 1) + 8;
      var x0 = clamp(Math.round(cx - bw / 2), 1, Math.max(1, W - bw - 1)), y0 = yBot - bh;
      s.fillStyle = frame; s.fillRect(x0 - 1, y0 - 1, bw + 2, bh + 2);
      s.fillStyle = fillCol; s.fillRect(x0, y0, bw, bh);
      Sp.drawText(s, text, x0 + 4, y0 + Math.round((bh - 5) / 2), textCol, 1);
      return { x0: x0, x1: x0 + bw, y0: y0, y1: yBot };
    }
    function paintLamp(s, x, top, w, night) {
      s.fillStyle = pal('chalk'); s.fillRect(x - (w >> 1), top, w, 2);
      if (!night) return;
      s.fillStyle = pal('gold');
      s.globalAlpha = 0.45; s.fillRect(x - (w >> 1) - 1, top + 2, w + 2, 1);
      s.globalAlpha = 0.2; s.fillRect(x - (w >> 1) - 2, top + 3, w + 4, 2);
      s.globalAlpha = 1;
    }
    function paintSchool(s, spec, tiles, fill, W, h) {
      var cx = Math.round(W / 2), x, i;
      if (spec.trees) {
        s.fillStyle = pal('ink');
        for (x = 0; x < W; x += 4) { var treeH = 5 + Math.round(noise(x >> 2, 1, 3) * 7); s.fillRect(x, h - treeH, 4, treeH); s.fillRect(x + 1, h - treeH - 1, 2, 1); }
      }
      s.fillStyle = pal('grey'); s.fillRect(0, h - 3, W, 1);
      s.fillStyle = steel();
      for (x = 2; x < W; x += 12) s.fillRect(x, h - 4, 1, 4);
      var poles = spec.poles || [];
      for (i = 0; i < poles.length; i++) {
        var pole = poles[i], px = Math.round(W * pole[0]), top = h - Math.round(h * pole[1]);
        s.fillStyle = pal('grey'); s.fillRect(px, top, 1, h - top);
        paintLamp(s, px, top, pole[2], spec.night);
      }
      var rows = spec.bleacher.rows, bh = rows * tiles.bench.height;
      var bw = Math.round(W * spec.bleacher.width), x0 = cx - (bw >> 1), x1 = x0 + bw;
      var line = scoreLine('HOME', 'GUEST');
      var board = paintBoard(s, cx, h - bh - 6, line.text, 11, pal('gold'), pal('navy'), pal('chalk'), W);
      s.fillStyle = pal('grey');
      s.fillRect(board.x0 + 5, board.y1, 1, h - board.y1); s.fillRect(board.x1 - 6, board.y1, 1, h - board.y1);
      paintTier(s, { x0: x0, x1: x1, yBot: h, rows: rows, base: tiles.bench, fans: tiles.fans, fansAway: tiles.fansAway, fill: fill, awayShare: spec.awayShare, key: 1, band: null });
      s.fillStyle = steel(); s.fillRect(x0, h - bh - 1, bw, 1);
      s.fillStyle = pal('grey'); s.fillRect(x0 - 1, h - bh - 1, 1, bh + 1); s.fillRect(x1, h - bh - 1, 1, bh + 1);
    }
    function paintBowl(s, spec, tiles, fill, W, h) {
      var cx = W / 2, flatHalf = Math.round(W * 0.22), x, i;
      var lowC = Math.round(h * spec.lower), upC = Math.round(h * num(spec.upper, 0)), conc = h >= 70 ? 3 : 2, roofH = Math.round(h * num(spec.roof, 0));
      var rise = num(spec.edgeRise, 0);
      function edge(xx) { var d = Math.abs(xx - cx) - flatHalf; return d <= 0 ? 0 : Math.min(1, d / Math.max(1, cx - flatHalf)); }
      function lowerTop(xx) { return h - Math.round(lowC * (1 + rise * edge(xx))); }
      function upperBot(xx) { return lowerTop(xx) - conc; }
      function upperTop(xx) { return upperBot(xx) - Math.round(upC * (1 + rise * edge(xx))); }
      function roofTop(xx) { return upperTop(xx) - roofH; }
      function horizon() { return h; }
      var rimTop = upC > 0 ? upperTop : lowerTop;
      var seatH = tiles.seats.height, farH = tiles.seatsFar.height;
      if (upC > 0) {
        clippedColumns(s, W, upperTop, upperBot, function () {
          paintTier(s, { x0: 0, x1: W, yBot: upperBot(cx), rows: Math.ceil((upC * (1 + rise) + lowC * rise) / farH) + 1, base: tiles.seatsFar, fans: tiles.far, fansAway: tiles.farAway, fill: fill, awayShare: spec.awayShare, key: 3, band: null });
        });
        fillColumns(s, W, upperBot, lowerTop, pal('navy'));
        if (spec.night && conc >= 3) { s.fillStyle = pal('gold'); for (x = 3; x < W; x += 6) s.fillRect(x, upperBot(x) + 1, 2, 1); }
      }
      var band = spec.band ? { x0: Math.round(cx + flatHalf) - 48, x1: Math.round(cx + flatHalf), rows: 2, tile: tiles.band } : null;
      clippedColumns(s, W, lowerTop, horizon, function () {
        paintTier(s, { x0: 0, x1: W, yBot: h, rows: Math.ceil(Math.round(lowC * (1 + rise)) / seatH) + 1, base: tiles.seats, fans: tiles.fans, fansAway: tiles.fansAway, fill: fill, awayShare: spec.awayShare, key: 5, band: band });
      });
      fillColumns(s, W, lowerTop, function (xx) { return lowerTop(xx) + 1; }, steel());
      fillColumns(s, W, rimTop, function (xx) { return rimTop(xx) + 1; }, steel());
      if (roofH > 0) {
        fillColumns(s, W, roofTop, upperTop, pal('navy'));
        fillColumns(s, W, roofTop, function (xx) { return roofTop(xx) + 1; }, steel());
        fillColumns(s, W, function (xx) { return upperTop(xx) - 1; }, upperTop, pal('ink'));
        for (x = 10; x < W; x += num(spec.lampEvery, 20)) paintLamp(s, x, upperTop(x) - 3, 3, spec.night);
      }
      var line = scoreLine('HOME', spec.jumbotron ? 'AWAY' : 'GUEST');
      if (spec.jumbotron) {
        var jw = Math.min(spec.jumbotron.maxWidth, Math.round(W * spec.jumbotron.width)), jh = Math.round(h * spec.jumbotron.height);
        var jx = clamp(Math.round(cx - jw / 2), 2, W - jw - 2), jy1 = upperBot(cx), jy0 = jy1 - jh;
        s.fillStyle = steel(); s.fillRect(jx + (jw >> 2), roofTop(cx), 1, jy0 - roofTop(cx)); s.fillRect(jx + jw - (jw >> 2), roofTop(cx), 1, jy0 - roofTop(cx));
        s.fillStyle = pal('ink'); s.fillRect(jx, jy0, jw, jh);
        s.fillStyle = pal('navy2'); s.fillRect(jx + 2, jy0 + 2, jw - 4, jh - 4);
        var qs = periodText();
        if (jh - 4 >= 18) {
          Sp.drawText(s, 'HOME', jx + 5, jy0 + 4, pal('chalk'), 1);
          Sp.drawText(s, 'AWAY', jx + jw - 5 - Sp.textWidth('AWAY', 1), jy0 + 4, pal('chalk'), 1);
          Sp.drawText(s, String(line.home), jx + 5, jy0 + 11, pal('gold'), 2);
          Sp.drawText(s, String(line.guest), jx + jw - 5 - Sp.textWidth(String(line.guest), 2), jy0 + 11, pal('gold'), 2);
          Sp.drawText(s, qs, jx + Math.round(jw / 2 - Sp.textWidth(qs, 1) / 2), jy0 + 13, pal('sky'), 1);
        } else {
          var one = 'HOME ' + line.home + ' ' + qs + ' ' + line.guest + ' AWAY';
          Sp.drawText(s, one, jx + Math.round(jw / 2 - Sp.textWidth(one, 1) / 2), jy0 + Math.round((jh - 5) / 2), pal('gold'), 1);
        }
      } else {
        var bh = h >= 70 ? 12 : 10;
        var bd = paintBoard(s, cx, rimTop(Math.round(cx)) - 2, line.text, bh, pal('gold'), pal('navy'), pal('chalk'), W);
        s.fillStyle = steel(); s.fillRect(bd.x0 + 6, bd.y1, 1, 3); s.fillRect(bd.x1 - 7, bd.y1, 1, 3);
        if (upC > 0) {
          var pw = 20, ph = 5, boxes = [4, W - 4 - pw];
          for (i = 0; i < boxes.length; i++) {
            var bx = boxes[i], by = rimTop(bx + (pw >> 1)) - ph;
            s.fillStyle = pal('navy'); s.fillRect(bx, by, pw, ph);
            s.fillStyle = steel(); s.fillRect(bx, by, pw, 1);
            s.fillStyle = pal('chalk'); for (x = bx + 2; x < bx + pw - 1; x += 3) s.fillRect(x, by + 2, 2, 1);
          }
        }
        if (spec.towers) {
          for (i = 0; i < spec.towers.length; i++) {
            var tx = Math.round(W * spec.towers[i]), tt = rimTop(tx) - Math.round(h * 0.18);
            s.fillStyle = pal('grey'); s.fillRect(tx, tt, 1, rimTop(tx) - tt);
            paintLamp(s, tx, tt, 5, spec.night);
          }
        }
      }
    }

    // ───────────────────────────── particles (rain / snow; a tiny LCG so nothing here touches the rng) ─────────────────────────────
    function rnd() { pSeed = (pSeed * 1664525 + 1013904223) >>> 0; return pSeed / 4294967296; }
    function initParticles() {
      var wk = weatherKind();
      pKind = wk === 'rain' ? 'rain' : (wk === 'snow' ? 'snow' : null);
      if (!pKind || isDome()) { pCount = 0; return; }
      pCount = 32; pSeed = 7;
      particles = new Float32Array(pCount * 4);
      for (var i = 0; i < pCount; i++) seedParticle(i, true);
    }
    function seedParticle(i, anywhere) {
      var w = sit.weather, comp = RTG.Weather && RTG.Weather.components ? RTG.Weather.components(w && w.wind) : { cross: 0 };
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

    // ───────────────────────────── the sim's shapes (paths, openness, windows) ─────────────────────────────
    function slotOf(r, i) { return (r && (r.slot || r.id)) || SLOT_ORDER[i] || ('R' + i); }
    function ctxReceiver(slot) {
      var list = ctx.receivers || [];
      for (var i = 0; i < list.length; i++) if (slotOf(list[i], i) === slot) return list[i];
      return null;
    }
    /** The receiver's alignment (yards): the sim's x0/y0, the context's, or the slot default. */
    function alignmentOf(r, i) {
      var slot = slotOf(r, i), cr = ctxReceiver(slot), d = ALIGN[slot] || [0, 0];
      var x0 = num(r && r.x0, num(cr && cr.x0, d[0]));
      var side = (r && r.side) || (cr && cr.side);
      if (side === 'L' && x0 > 0) x0 = -x0; else if (side === 'R' && x0 < 0) x0 = -x0; else if (typeof side === 'number' && side !== 0 && (x0 < 0) !== (side < 0)) x0 = -x0;
      var y0 = num(r && r.y0, num(cr && cr.y0, d[1]));
      return { x: x0, y: y0 };
    }
    /**
     * Route position at play time t (yards, field frame: x from the ball, y from the line) → out {x, y}.
     * The engine's paths are absolute (x0 folded in, y from the line; detected by capY / family / absolute) and
     * are extrapolated along the last segment with y capped at capY, exactly like Play.pathAt; a relative path
     * (x, y from the alignment) is offset by x0 / y0. `raw` skips the visual backfield release (the engine starts
     * every receiver on the line; the scene shows a back / slot leaving his spot over releaseS).
     */
    function pathAt(i, t, out, raw) {
      var fn = recPathFn[i], arr = recPathArr[i];
      var px = 0, py = 0;
      if (fn) { var p = fn(t); if (p) { px = num(p.x, 0); py = num(p.y, 0); } }
      else if (arr && arr.length) {
        var n = arr.length, a = arr[0];
        if (t <= num(a.t, 0)) { px = num(a.x, 0); py = num(a.y, 0); }
        else {
          var found = false;
          for (var k = 1; k < n; k++) {
            var w1 = arr[k];
            if (t <= num(w1.t, 0)) { var w0 = arr[k - 1], t0 = num(w0.t, 0), t1 = num(w1.t, t0); var u = t1 > t0 ? (t - t0) / (t1 - t0) : 1; px = lerp(num(w0.x, 0), num(w1.x, 0), u); py = lerp(num(w0.y, 0), num(w1.y, 0), u); found = true; break; }
          }
          if (!found) {
            var l = arr[n - 1], k2 = n > 1 ? arr[n - 2] : l, dt = num(l.t, 0) - num(k2.t, 0);
            if (dt <= 0) { px = num(l.x, 0); py = num(l.y, 0); }
            else { var over = (t - num(l.t, 0)) / dt; px = num(l.x, 0) + (num(l.x, 0) - num(k2.x, 0)) * over; py = Math.min(recCap[i], num(l.y, 0) + (num(l.y, 0) - num(k2.y, 0)) * over); }
          }
        }
      }
      if (recAbs[i]) { out.x = px; out.y = py + (raw ? 0 : recY0[i] * Math.max(0, 1 - t / TIMING.releaseS)); }
      else { out.x = recX0[i] + px; out.y = recY0[i] + py; }
      return out;
    }
    /** Openness 0..1 at play time t. */
    function openAt(i, t) {
      var fn = recOpenFn[i], arr = recOpenArr[i], Pl = RTG.Play;
      if (fn) return clamp(num(fn(t), 0), 0, 1);
      if (arr && Pl && typeof Pl.openAt === 'function' && recObj[i] && recObj[i].open === arr) return clamp(num(Pl.openAt(recObj[i], t), 0), 0, 1);
      if (arr && arr.length) {
        var dt = recOpenDt[i] || 0.1, u = t / dt, k = Math.floor(u), n = arr.length;
        if (k < 0) return clamp(num(arr[0], 0), 0, 1);
        if (k >= n - 1) return clamp(num(arr[n - 1], 0), 0, 1);
        return clamp(lerp(num(arr[k], 0), num(arr[k + 1], 0), u - k), 0, 1);
      }
      if (sim && typeof sim.open === 'function') return clamp(num(sim.open(recSlot[i], t), 0), 0, 1);
      return 0.5;
    }
    function ringKind(open) { var R = (TQ().open || {}).ring || {}; return open >= num(R.open, 0.45) ? 0 : (open >= num(R.closing, 0.25) ? 1 : 2); }
    /**
     * The flight (s) of a ball released NOW (play time t) at full power and the route's ideal loft to receiver i,
     * solved exactly like Play.arrival (fixed-point rounds until it settles: Play.ARRIVAL, mirrored here so the
     * band and the rings agree with the engine to the same tolerance) without allocating; arrDist holds the
     * distance (yd) of the arrival spot. Without the engine: a flat 0.7 s.
     */
    function arrivalFlight(i, t) {
      var Pl = RTG.Play;
      if (!Pl || typeof Pl.flightTime !== 'function') { pathAt(i, t + 0.7, pt2, true); var dx = pt2.x - qbX, dy = pt2.y - qbY; arrDist = Math.sqrt(dx * dx + dy * dy); return 0.7; }
      var A = Pl.ARRIVAL || {}, eps = num(A.eps, 1e-4), rounds = num(A.maxRounds, 24);
      var drop = num((TQ().route || {}).qbDrop, 7), flight = 0, loft = recLoft[i];
      for (var k = 0; k < rounds; k++) {
        pathAt(i, t + flight, pt2, true);
        arrDist = Math.sqrt(pt2.x * pt2.x + (pt2.y + drop) * (pt2.y + drop));
        var next = Pl.flightTime(arrDist, qbAttrs, 1, loft), done = Math.abs(next - flight) < eps;
        flight = next;
        if (done) break;
      }
      return flight;
    }
    function isLook(o) { return !!(o && typeof o === 'object' && (o.safeties !== undefined || o.press !== undefined || o.box !== undefined)); }
    function lookOf() {
      if (isLook(ctx.look)) return ctx.look;
      var sh = ctx.shown;
      if (isLook(sh)) return sh;
      var id = typeof sh === 'string' ? sh : (sh && sh.id) || (typeof ctx.real === 'string' ? ctx.real : (ctx.real && ctx.real.id));
      var D = RTG.Data && RTG.Data.plays && RTG.Data.plays.coverages;
      var cov = D && id && D[id];
      return (cov && cov.look) || { safeties: 2, press: false, box: 7, showBlitz: false };
    }
    function realId() { var r = ctx.real; return typeof r === 'string' ? r : (r && r.id) || 'COVER3'; }
    function shownId() { var r = ctx.shown; return typeof r === 'string' ? r : (r && r.id) || ''; }
    function coverageNameOf(id) { var D = RTG.Data && RTG.Data.plays && RTG.Data.plays.coverages; var c = D && D[id]; return (c && c.name) || String(id); }

    // ───────────────────────────── the actors ─────────────────────────────
    /** Receivers from the sim (SNAP) or the context (READ): alignments, paths, openness. */
    function buildReceivers(src) {
      var list = (src && src.receivers) || ctx.receivers || [];
      recCount = Math.min(NREC, list.length);
      for (var i = 0; i < NREC; i++) {
        var r = i < recCount ? list[i] : null;
        aShow[IREC + i] = r ? 1 : 0;
        recSlot[i] = r ? slotOf(r, i) : SLOT_ORDER[i];
        var al = alignmentOf(r, i);
        recX0[i] = al.x; recY0[i] = al.y;
        var path = r && (r.path || r.waypoints || (typeof r.route === 'object' ? r.route : null));
        recPathFn[i] = typeof path === 'function' ? path : null;
        recPathArr[i] = Array.isArray(path) ? path : (path && Array.isArray(path.path) ? path.path : null);
        recAbs[i] = r && (r.absolute === true || typeof r.capY === 'number' || typeof r.family === 'string') ? 1 : 0;
        recCap[i] = num(r && r.capY, Infinity);
        recRoute[i] = r && typeof r.route === 'string' ? r.route : (r && r.route && r.route.id) || null;
        recObj[i] = r;
        var op = r && (r.open !== undefined ? r.open : r.openness);
        recOpenFn[i] = typeof op === 'function' ? op : null;
        recOpenArr[i] = Array.isArray(op) ? op : (op && Array.isArray(op.samples) ? op.samples : null);
        recOpenDt[i] = num(op && op.dt, num(r && r.openDt, 0.1));
        recReveal[i] = num(r && r.revealAt, num(src && src.revealAt, 0.6));
        recSpeed[i] = num(r && r.speed, 50);
        var RR = RTG.Data && RTG.Data.plays && RTG.Data.plays.routes, rt = RR && recRoute[i] ? RR[recRoute[i]] : null;
        recLoft[i] = rt && rt.ideal ? num(rt.ideal.loft, 0) : 0;
        aX[IREC + i] = al.x; aY[IREC + i] = al.y; recLastX[i] = al.x; recLastY[i] = al.y;
        recOpen[i] = 0; recOpenNow[i] = 0; recDist[i] = 0; recRing[i] = -1; aFrame[IREC + i] = 0;
      }
      maxDistYd = RTG.Play && typeof RTG.Play.maxDist === 'function' ? RTG.Play.maxDist(qbAttrs) : Infinity;
      hotSlot = -1;
      var hot = src && src.hot;
      if (hot) for (var h = 0; h < recCount; h++) if (recSlot[h] === hot || recSlot[h] === (hot.slot || hot)) hotSlot = h;
    }
    function recIndexOf(slot) { for (var i = 0; i < recCount; i++) if (recSlot[i] === slot) return i; return -1; }
    function outsideReceivers() {
      // the two widest receivers (the corners' men), by |x0| with opposite signs when possible
      var l = -1, r = -1;
      for (var i = 0; i < recCount; i++) {
        if (recX0[i] < 0 && (l < 0 || recX0[i] < recX0[l])) l = i;
        if (recX0[i] > 0 && (r < 0 || recX0[i] > recX0[r])) r = i;
      }
      return [l, r];
    }
    /** The pre-snap look: eleven defenders placed from ctx.shown, roles from ctx.real for the snap. */
    function buildDefence() {
      var lk = lookOf(), i, j;
      var S = clamp(num(lk.safeties, 2), 1, 2), press = !!lk.press, box = clamp(num(lk.box, 7), 5, 8), blitz = !!lk.showBlitz;
      var nLB = clamp(box - 4, 1, 3), nCB = 2, nN = Math.max(0, 7 - S - nCB - nLB);
      defCount = 11;
      var out = outsideReceivers(), assigned = [];
      for (i = 0; i < NREC; i++) assigned[i] = false;
      var d = 0;
      // 0..3 the line
      for (i = 0; i < 4; i++, d++) { defPreX[d] = LOOK.dlX[i]; defPreY[d] = LOOK.dlY; defRole[d] = ROLE_HOLD; defArg[d] = -1; defRush[d] = 0; }
      // linebackers
      var lbx = LOOK.lbX[nLB] || LOOK.lbX[3];
      var lbs = [];
      for (i = 0; i < nLB; i++, d++) { defPreX[d] = lbx[i]; defPreY[d] = LOOK.lbY; defRole[d] = ROLE_SHADOW; defArg[d] = -1; defRush[d] = 0; lbs.push(d); }
      if (blitz && lbs.length) { var creep = lbs[Math.floor(lbs.length / 2)]; defPreY[creep] = LOOK.blitzY; defPreX[creep] = defPreX[creep] < 0 ? -1 : 1; }
      // corners over the outside receivers
      var cbs = [];
      for (i = 0; i < nCB; i++, d++) {
        var ri = out[i];
        var x0 = ri >= 0 ? recX0[ri] : (i === 0 ? -22 : 22);
        defPreX[d] = x0 - (x0 < 0 ? -LOOK.cbShade : LOOK.cbShade); defPreY[d] = press ? LOOK.cbPressY : LOOK.cbOffY;
        defRole[d] = ROLE_SHADOW; defArg[d] = ri; if (ri >= 0) assigned[ri] = true; cbs.push(d); defRush[d] = 0;
      }
      // nickels over the inside receivers
      var inside = [];
      for (i = 0; i < recCount; i++) if (!assigned[i] && recY0[i] >= -2) inside.push(i);
      inside.sort(function (a, b) { return Math.abs(recX0[b]) - Math.abs(recX0[a]); });
      for (i = 0; i < nN; i++, d++) {
        var ni = i < inside.length ? inside[i] : -1;
        defPreX[d] = ni >= 0 ? recX0[ni] + (recX0[ni] < 0 ? 1.5 : -1.5) : (i === 0 ? -8 : 8); defPreY[d] = press ? LOOK.nickelPressY : LOOK.nickelY;
        defRole[d] = ROLE_SHADOW; defArg[d] = ni; if (ni >= 0) assigned[ni] = true; defRush[d] = 0;
      }
      // safeties
      var sp = S === 2 ? LOOK.safeties2 : LOOK.safeties1;
      var safeties = [];
      for (i = 0; i < S && d < defCount; i++, d++) { defPreX[d] = sp[i][0]; defPreY[d] = sp[i][1]; defRole[d] = ROLE_DEEP; defArg[d] = i; safeties.push(d); defRush[d] = 0; }
      while (d < defCount) { defPreX[d] = 0; defPreY[d] = 8; defRole[d] = ROLE_DEEP; defArg[d] = 1; d++; }
      // the linebackers shadow the receivers nobody has yet (nearest by x), the rest hold the middle
      for (j = 0; j < lbs.length; j++) {
        var best = -1, bd = 1e9;
        for (i = 0; i < recCount; i++) if (!assigned[i]) { var dx = Math.abs(recX0[i] - defPreX[lbs[j]]); if (dx < bd) { bd = dx; best = i; } }
        if (best >= 0) { defArg[lbs[j]] = best; assigned[best] = true; } else { defRole[lbs[j]] = ROLE_DEEP; defArg[lbs[j]] = 1; }
      }
      // any receiver still free (more receivers than coverage men) is watched by the last safety
      for (i = 0; i < recCount; i++) if (!assigned[i] && safeties.length) { var sd = safeties[safeties.length - 1]; defRole[sd] = ROLE_SHADOW; defArg[sd] = i; assigned[i] = true; }
      // the real coverage's deep landmarks
      var deep = DEEP[realId()] || DEEP.COVER3;
      var di = 0;
      for (j = 0; j < defCount; j++) if (defRole[j] === ROLE_DEEP) { var z = deep[Math.min(di, deep.length - 1)]; defZX[j] = z[0]; defZY[j] = z[1]; di++; }
      // a real blitz sends the linebacker on the back (the hot read is his man)
      if (realId() === 'BLITZ') {
        var sent = -1;
        for (j = 0; j < lbs.length; j++) if (defArg[lbs[j]] >= 0 && recY0[defArg[lbs[j]]] < -2) sent = lbs[j];
        if (sent < 0 && lbs.length) sent = lbs[0];
        if (sent >= 0) { defRole[sent] = ROLE_BLITZ; defArg[sent] = -1; defLaneX[sent] = defPreX[sent] < 0 ? -2.5 : 2.5; defArrive[sent] = num(sim && sim.sackAt, 3.2) * 1.05; }
      }
      for (j = 0; j < defCount; j++) { aX[j] = defPreX[j]; aY[j] = defPreY[j]; aShow[j] = 1; aFrame[j] = 2; }
    }
    /** The sim's rushers take lanes through the line; each lane's blocker is pushed back in front of him. */
    function buildRush() {
      var list = (sim && sim.rushers) || [];
      var i, j, used = [0, 0, 0, 0];
      for (j = 0; j < NOL; j++) olPush[j] = -1;
      for (i = 0; i < 4; i++) { defRole[i] = ROLE_HOLD; defRush[i] = 0; }
      var n = Math.min(3, list.length);
      if (!n) { n = 2; }
      rushFirst = -1;
      var firstAt = Infinity;
      for (i = 0; i < n; i++) {
        var r = list[i] || {};
        var laneX = num(r.x, typeof r.lane === 'number' ? (Math.abs(r.lane) <= 2 ? r.lane * 3 : r.lane) : (i === 0 ? -1.5 : (i === 1 ? 4.5 : -4.5)));
        var arrive = num(r.arriveAt, num(r.arrival, num(r.at, num(r.t, num(sim && sim.sackAt, 3.2)))));
        var best = -1, bd = 1e9;
        for (j = 0; j < 4; j++) if (!used[j]) { var dx = Math.abs(LOOK.dlX[j] - laneX); if (dx < bd) { bd = dx; best = j; } }
        if (best < 0) continue;
        used[best] = 1;
        defRole[best] = ROLE_RUSH; defRush[best] = 1; defLaneX[best] = laneX; defArrive[best] = Math.max(0.6, arrive);
        if (defArrive[best] < firstAt) { firstAt = defArrive[best]; rushFirst = best; }   // the first to arrive IS the sack: he ends on the quarterback
        var bo = -1, bdo = 1e9;
        for (j = 0; j < NOL; j++) if (olPush[j] < 0) { var dxo = Math.abs(olX0[j] - laneX); if (dxo < bdo) { bdo = dxo; bo = j; } }
        if (bo >= 0) olPush[bo] = best;
      }
    }
    function placeLine() {
      for (var j = 0; j < NOL; j++) { aX[IOL + j] = olX0[j]; aY[IOL + j] = -1; aShow[IOL + j] = 1; aFrame[IOL + j] = 0; }
      aShow[IQB] = 1; aFrame[IQB] = 0;
      qbX = 0; qbY = gun ? FIELD.qbShotgun : FIELD.qbUnderCentre; qbPose = 0; qbDown = 0;
      if (alignU < 1) qbY = qbFromY;                   // the slide from the READ picture starts where he stood
      aX[IQB] = qbX; aY[IQB] = qbY;
    }

    /** Everyone's field position at play time t (seconds since the snap). */
    function positionsAt(t) {
      var i, j, u;
      // the quarterback: the drop, then set
      var dropS = reduced ? 0 : TIMING.dropMs / 1000;
      var dropTo = gun ? FIELD.qbGunDrop : FIELD.qbDrop, dropFrom = gun ? FIELD.qbShotgun : FIELD.qbUnderCentre;
      if (phase === 'RUN') { /* placed by the run beat */ }
      else if (alignU < 1) { qbY = lerp(qbFromY, dropFrom, ease(alignU)); qbPose = 0; }
      else if (t < dropS) { u = t / dropS; qbY = lerp(dropFrom, dropTo, ease(u)); qbPose = (Math.floor(t * 1000 / 110) & 1); }
      else { qbY = dropTo; qbPose = 1; }
      if (sacked) qbPose = 0;
      else if (thrown && phase !== 'RUN') { qbPose = (now() - tThrow) < TIMING.throwPoseMs ? 2 : 0; }
      aX[IQB] = qbX; aY[IQB] = qbY;
      // receivers
      for (i = 0; i < recCount; i++) {
        if ((ballCarrier === i || dropMan === i) && landBeat) continue;    // the man at the ball is placed by the landing beat
        pathAt(i, t, pt2);
        if (alignU < 1) { pt2.x = lerp(recFromX[i], pt2.x, ease(alignU)); pt2.y = lerp(recFromY[i], pt2.y, ease(alignU)); }
        recVX[i] = pt2.x - recLastX[i]; recVY[i] = pt2.y - recLastY[i];
        recLastX[i] = pt2.x; recLastY[i] = pt2.y;
        aX[IREC + i] = pt2.x; aY[IREC + i] = pt2.y;
        // the ring is coloured by the openness a ball released NOW would find at its arrival (the engine's INT gate
        // judges open(t + flight), so a green ring means "cannot be picked"); grey when the arrival is beyond the arm
        recOpenNow[i] = openAt(i, t);
        recOpen[i] = openAt(i, t + arrivalFlight(i, t));
        recDist[i] = arrDist;
        recRing[i] = t >= recReveal[i] ? (recDist[i] > maxDistYd ? 3 : ringKind(recOpen[i])) : -1;
        aFrame[IREC + i] = (Math.abs(recVX[i]) > 0.01 || Math.abs(recVY[i]) > 0.01) ? (Math.floor((t + alignU) * 1000 / TIMING.runFrameMs) & 1) : 0;
      }
      // the rush and the line: the first rusher ends on the quarterback's near side (drawn over him: the sack reads
      // as a tackle), the others land a step wide of him
      var rot = ease(rotateMs > 0 ? t / (rotateMs / 1000) : 1);
      for (j = 0; j < 4; j++) {
        if (defRole[j] === ROLE_RUSH) {
          var p = clamp(t / defArrive[j], 0, 1);
          var first = j === rushFirst || rushFirst < 0;
          var yEnd = first ? qbY - 0.4 : qbY + 0.4, xEnd = first ? qbX : qbX + (defLaneX[j] < 0 ? -0.8 : 0.8);
          var yR = p < 0.25 ? lerp(LOOK.dlY, -0.6, p * 4) : lerp(-0.6, yEnd, (p - 0.25) / 0.75);
          aX[j] = lerp(defLaneX[j], xEnd, p * 0.9); aY[j] = yR; aFrame[j] = (Math.floor(t * 1000 / TIMING.runFrameMs) & 1);
        } else { aX[j] = LOOK.dlX[j]; aY[j] = 0.3 - 0.2 * Math.sin(t * 6 + j); aFrame[j] = 0; }
      }
      for (j = 0; j < NOL; j++) {
        var r = olPush[j];
        if (r >= 0) { aY[IOL + j] = Math.min(-1, Math.max(qbY + 0.5, aY[r] - 1.0)); aX[IOL + j] = lerp(olX0[j], aX[r], 0.6); }
        else { aY[IOL + j] = -1 - 0.15 * Math.sin(t * 5 + j); aX[IOL + j] = olX0[j]; }
      }
      // coverage: roles blend in from the pre-snap spots over rotateMs
      for (j = 4; j < defCount; j++) {
        var tx, ty, role = defRole[j];
        if (j === intMan && landBeat) continue;      // the interceptor is placed by the landing beat once the ball is his
        if (role === ROLE_SHADOW && defArg[j] >= 0) {
          var k = defArg[j], op = recOpenNow[k], cushion = CUSHION.base + CUSHION.perOpen * op;
          var rx = aX[IREC + k], ry = aY[IREC + k];
          var dxn = (rx < 0 ? 1 : -1) * CUSHION.inside, dyn = 1, nn = Math.sqrt(dxn * dxn + dyn * dyn);
          tx = rx + dxn / nn * cushion; ty = ry + dyn / nn * cushion;
        } else if (role === ROLE_BLITZ) {
          var pb = clamp(t / defArrive[j], 0, 1);
          tx = lerp(defLaneX[j], qbX, pb); ty = lerp(defPreY[j], qbY + 0.8, pb);
          aX[j] = tx; aY[j] = ty; aFrame[j] = (Math.floor(t * 1000 / TIMING.runFrameMs) & 1);
          continue;
        } else { tx = defZX[j]; ty = defZY[j]; }
        if (converge >= 0 && (j === intMan || role === ROLE_DEEP || defArg[j] === converge)) {
          // the flight: the man on the target and the deep help close on the landing spot; the interceptor (chosen
          // at the throw) runs all the way, so he arrives with the ball instead of popping onto it
          var cu = clamp((t - tThrowPlay) / Math.max(0.3, flightS), 0, 1);
          if (j !== intMan) cu *= 0.8;
          tx = lerp(tx, convergeX, cu); ty = lerp(ty, convergeY, cu);
        }
        aX[j] = lerp(defPreX[j], tx, rot); aY[j] = lerp(defPreY[j], ty, rot);
        aFrame[j] = t < 0.05 ? 2 : (Math.floor(t * 1000 / TIMING.runFrameMs) & 1);
      }
    }
    /** Project every actor and sort far → near (insertion sort: the order barely changes between frames). */
    function projectAll() {
      var i, j, k;
      for (i = 0; i < NACT; i++) {
        if (!aShow[i]) continue;
        project(aX[i], aY[i]);
        aSX[i] = pt.x; aSY[i] = pt.y; aS[i] = pt.s;
      }
      for (i = 1; i < NACT; i++) {
        k = order[i]; j = i - 1;
        while (j >= 0 && aY[order[j]] < aY[k]) { order[j + 1] = order[j]; j--; }
        order[j + 1] = k;
      }
    }

    // ───────────────────────────── HUD (DOM) ─────────────────────────────
    function buildHud() {
      while (hud.firstChild) hud.removeChild(hud.firstChild);
      var parts = PlayView.hudParts(ctx);
      var strip = el('div', { class: 'pv-strip' });
      clockChip = null; clockShown = -1;
      for (var i = 0; i < parts.length; i++) {
        var chip = el('span', { class: 'chip pv-chip' + (i === 0 ? ' chip-gold' : ''), text: parts[i] });
        if (i === 2) clockChip = chip;               // 'Q4 0:48': runs down during a two-minute snap
        strip.appendChild(chip);
      }
      playChip = el('span', { class: 'chip pv-chip pv-play', hidden: true });
      strip.appendChild(playChip);
      hud.appendChild(strip);
      var right = el('div', { class: 'pv-hud-right' });
      var pm = el('div', { class: 'pv-pressure' + (clutch ? ' clutch' : ''), role: 'meter', 'aria-label': 'Pressure', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' });
      pm.appendChild(el('span', { class: 'pv-pressure-label', text: 'RUSH' }));
      hudPressureFill = el('span', { class: 'pv-pressure-fill' });
      pm.appendChild(el('span', { class: 'pv-pressure-track', 'aria-hidden': 'true' }, hudPressureFill));
      right.appendChild(pm);
      hud.appendChild(right);
      hudPressureVal = -1;
      setPressure(0);
    }
    /** The HUD clock during a two-minute snap: the situation's clock minus the play time (whole seconds, DOM text only when it changes). */
    function runClock() {
      if (!clockChip || !sit.twoMinute) return;
      var left = Math.max(0, Math.round(num(sit.clock, 0)) - Math.floor(tPlay));
      if (left === clockShown) return;
      clockShown = left;
      clockChip.textContent = periodText() + ' ' + clockText(left);
    }
    function setPressure(v) {
      var pct = Math.round(clamp(v, 0, 1) * 100);
      if (pct === hudPressureVal) return;
      hudPressureVal = pct;
      hudPressureFill.style.width = pct + '%';
      hudPressureFill.parentNode.parentNode.setAttribute('aria-valuenow', String(pct));
      hudPressureFill.parentNode.parentNode.classList.toggle('hot', pct >= 70);
    }
    function buildThrowBox() {
      while (throwBox.firstChild) throwBox.removeChild(throwBox.firstChild);
      hintEl = el('div', { class: 'pv-hint', role: 'status' });
      throwBox.appendChild(hintEl);
      var vb = el('div', { class: 'pv-vbar', role: 'meter', 'aria-label': 'Velocity', 'aria-valuemin': '0', 'aria-valuemax': '115', 'aria-valuenow': '0' });
      velLabel = el('span', { class: 'pv-vbar-label', text: 'VEL' });
      vb.appendChild(velLabel);
      var track = el('span', { class: 'pv-vbar-track', 'aria-hidden': 'true' });
      velGreen = el('span', { class: 'pv-vbar-green', hidden: true });
      velRed = el('span', { class: 'pv-vbar-red', style: { left: (100 / 1.15).toFixed(1) + '%' } });
      velFill = el('span', { class: 'pv-vbar-fill' });
      track.appendChild(velRed); track.appendChild(velGreen); track.appendChild(velFill);
      for (var i = 1; i < 11; i++) track.appendChild(el('span', { class: 'pv-vbar-tick' + (i === 5 || i === 10 ? ' big' : ''), style: { left: (i * 10 / 1.15).toFixed(1) + '%' } }));
      vb.appendChild(track);
      throwBox.appendChild(vb);
      var row = el('div', { class: 'pv-throwrow' });
      var aim = el('div', { class: 'pv-aim', role: 'group', 'aria-label': 'Lead and loft' });
      aimLead = el('span', { class: 'chip pv-chip pv-aim-lead num', text: 'LEAD 0' });
      aimLoft = el('span', { class: 'chip pv-chip pv-aim-loft num', text: 'LOFT 0.5' });
      aim.appendChild(aimLead); aim.appendChild(aimLoft);
      row.appendChild(aim);
      var actions = el('div', { class: 'pv-actions' });
      btnAway = el('button', { class: 'btn btn-ghost btn-sm pv-btn-away', type: 'button', text: 'THROW AWAY', 'data-action': 'throwaway', hidden: true, onClick: function () { if (input) input.throwAway(); } });
      btnScr = el('button', { class: 'btn btn-secondary btn-sm pv-btn-scramble', type: 'button', text: 'SCRAMBLE', 'data-action': 'scramble', hidden: true, onClick: function () { if (input) input.scramble(); } });
      actions.appendChild(btnAway); actions.appendChild(btnScr);
      row.appendChild(actions);
      throwBox.appendChild(row);
      lastLeadTxt = ''; lastLoftTxt = '';
      setVel(0); setAimReadout(0, 0.5);
    }
    function setVel(p) {
      velFill.style.width = (clamp(p, 0, 1.15) / 1.15 * 100).toFixed(1) + '%';
      velFill.parentNode.parentNode.setAttribute('aria-valuenow', String(Math.round(p * 100)));
      var inG = zone && p >= zone.lo && p <= zone.hi;
      velFill.classList.toggle('in-green', !!inG);
    }
    function setZone(z) {
      zone = z;
      if (!z) { velGreen.hidden = true; lastZoneLo = -1; return; }
      if (Math.abs(z.lo - lastZoneLo) < 0.004) return;
      lastZoneLo = z.lo;
      velGreen.hidden = false;
      velGreen.style.left = (z.lo / 1.15 * 100).toFixed(1) + '%';
      velGreen.style.width = ((z.hi - z.lo) / 1.15 * 100).toFixed(1) + '%';
    }
    function setAimReadout(ld, lf) {
      var lt = 'LEAD ' + (ld > 0.05 ? '►' : (ld < -0.05 ? '◄' : '')) + Math.abs(Math.round(ld * 10) / 10);
      var ft = 'LOFT ' + (Math.round(lf * 10) / 10);
      if (lt !== lastLeadTxt) { lastLeadTxt = lt; aimLead.textContent = lt; }
      if (ft !== lastLoftTxt) { lastLoftTxt = ft; aimLoft.textContent = ft; }
    }
    function setHint(text) { if (hintEl) { hintEl.textContent = text || ''; hintEl.hidden = !text; } }
    function snapHint() {
      return coarsePointerNow() ? 'TAP A RECEIVER · HOLD · DRAG TO LEAD & LOFT · LET GO' : '1-5 PICK · HOLD ' + pressLabel() + ' · ARROWS LEAD & LOFT · LET GO IN THE GREEN';
    }
    function showBanner(text, kind) {
      banner.textContent = '';
      banner.className = 'pv-banner pv-banner-' + kind;
      var ic = kind === 'good' || kind === 'gold' ? 'check' : (kind === 'neutral' ? 'ball' : 'x');
      banner.appendChild(icon(ic, 14));
      banner.appendChild(el('span', { text: text }));
      banner.hidden = false;
    }
    function hideBanner() { banner.hidden = true; }
    function showSub(text, kind, ms) {
      subBanner.textContent = text; subBanner.className = 'pv-sub pv-sub-' + (kind || 'info'); subBanner.hidden = false;
      setTimer(function () { subBanner.hidden = true; }, ms || TIMING.subBannerMs);
    }
    function showToast(text) {
      toastLine.textContent = text; toastLine.hidden = false;
      setTimer(function () { toastLine.hidden = true; }, TIMING.hintMs);
    }
    function setAria(text) { if (text !== lastAria) { lastAria = text; canvas.setAttribute('aria-label', text); } }
    function lookText() {
      var lk = lookOf(), parts = [];
      if (lk.text) return String(lk.text);
      parts.push(lk.safeties === 1 ? 'one safety deep' : 'two safeties deep');
      parts.push(lk.press ? 'press on the outside' : 'corners off');
      parts.push(num(lk.box, 7) + ' in the box');
      if (lk.showBlitz) parts.push('a blitz look');
      return parts.join(', ');
    }
    function situationLabel() {
      var parts = PlayView.hudParts(ctx);
      var s = parts.join(', ');
      if (sit.stakes || sit.text) s += '. ' + (sit.stakes || sit.text);
      return s;
    }

    // ───────────────────────────── the situation card (SITUATION) ─────────────────────────────
    /** A keyboard-made click (detail 0) inside armMs of the phase mounting is the tail of an earlier Enter: ignored. */
    function tooSoon(ev) { return !!ev && ev.detail === 0 && elapsed() < TIMING.armMs; }
    /** The whole card reads (the text a thumb lands on, not only the button; the button's click bubbles here). */
    function onSituationClick(ev) {
      if (phase !== 'SITUATION' || tooSoon(ev)) return;
      startRead();
    }
    function buildSituation() {
      while (situationCard.firstChild) situationCard.removeChild(situationCard.firstChild);
      var parts = PlayView.hudParts(ctx);
      situationCard.appendChild(el('div', { class: 'pv-sit-down', text: parts[0] }));
      situationCard.appendChild(el('div', { class: 'pv-sit-line', text: parts.slice(1, 4).join(' · ') }));
      var stakes = sit.stakes || sit.text || '';
      if (stakes) situationCard.appendChild(el('div', { class: 'pv-sit-stakes', text: stakes }));
      var go = el('button', { class: 'btn btn-primary pv-go', type: 'button', text: 'TAP TO READ', 'data-action': 'read' });
      situationCard.appendChild(go);
      situationCard.hidden = false;
      setTimer(function () { try { go.focus(); } catch (e) { /* ignore */ } }, 0);
    }
    /** The READ panel's look line: the shown look's copy, the pocket warning, the coach's tell. */
    function buildLookLine() {
      while (lookLine.firstChild) lookLine.removeChild(lookLine.firstChild);
      var lk = lookOf(), hot = !!(ctx.pressure && ctx.pressure.hot);
      var head = 'THEY SHOW: ' + lookText().replace(/\.$/, '').toUpperCase() + (hot ? ' · POCKET: SHORT' : '');
      lookLine.appendChild(el('span', { class: 'pv-look-head' + (hot ? ' hot' : ''), text: head }));
      if (lk.tell) lookLine.appendChild(el('span', { class: 'pv-look-tell', text: String(lk.tell) }));
      lookLine.hidden = false;
    }

    // ───────────────────────────── the play cards (READ) ─────────────────────────────
    function routePathFor(assignment) {
      if (!assignment) return null;
      if (Array.isArray(assignment.path)) return assignment.path;
      var id = typeof assignment === 'string' ? assignment : (assignment.route || assignment.id);
      var R = RTG.Data && RTG.Data.plays && RTG.Data.plays.routes;
      var route = R && id && R[id];
      if (route && Array.isArray(route.path)) return route.path;
      if (assignment.route && typeof assignment.route === 'object' && Array.isArray(assignment.route.path)) return assignment.route.path;
      return null;
    }
    function routeThumb(opt) {
      var SVG = 'http://www.w3.org/2000/svg';
      var svg = doc.createElementNS(SVG, 'svg');
      var VW = 60, VH = 40, yLos = 30;
      svg.setAttribute('viewBox', '0 0 ' + VW + ' ' + VH);
      svg.setAttribute('class', 'pv-routes');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('shape-rendering', 'crispEdges');
      var los = doc.createElementNS(SVG, 'rect');
      los.setAttribute('x', '0'); los.setAttribute('y', String(yLos)); los.setAttribute('width', String(VW)); los.setAttribute('height', '1'); los.setAttribute('class', 'pv-routes-los');
      svg.appendChild(los);
      var isRun = opt && (opt.id === 'SNEAK' || opt.id === 'DRAW' || (opt.tags && opt.tags.indexOf('RUN') >= 0));
      if (isRun) {
        var arrow = doc.createElementNS(SVG, 'polyline');
        arrow.setAttribute('points', (VW / 2) + ',' + (yLos + 8) + ' ' + (VW / 2) + ',' + (yLos - 10) + ' ' + (VW / 2 - 4) + ',' + (yLos - 6) + ' ' + (VW / 2) + ',' + (yLos - 10) + ' ' + (VW / 2 + 4) + ',' + (yLos - 6));
        arrow.setAttribute('class', 'pv-routes-run');
        svg.appendChild(arrow);
        return svg;
      }
      var list = (opt && (opt.routes || opt.assignments)) || [];
      for (var i = 0; i < list.length; i++) {
        var a = list[i], slot = (a && (a.slot || a.id)) || SLOT_ORDER[i], al = ALIGN[slot] || [0, 0];
        var cr = ctxReceiver(slot);
        var x0 = num(cr && cr.x0, al[0]), y0 = num(cr && cr.y0, al[1]);
        var side = cr && cr.side;
        if (side === 'L' && x0 > 0) x0 = -x0; else if (side === 'R' && x0 < 0) x0 = -x0;
        var mirrorX = x0 < 0 ? -1 : 1;
        var path = routePathFor(a);
        var pts = '';
        var px0 = VW / 2 + x0 / 27 * (VW / 2 - 2), py0 = yLos - y0 * 1.2;
        pts += px0.toFixed(1) + ',' + py0.toFixed(1);
        if (path) {
          for (var k = 0; k < path.length; k++) {
            var w = path[k], wx = num(w.x, 0) * (a.mirrored ? 1 : mirrorX), wy = num(w.y, 0);
            pts += ' ' + (px0 + wx / 27 * (VW / 2 - 2)).toFixed(1) + ',' + (py0 - wy * 1.2).toFixed(1);
          }
        } else pts += ' ' + px0.toFixed(1) + ',' + (py0 - 8).toFixed(1);
        var pl = doc.createElementNS(SVG, 'polyline');
        pl.setAttribute('points', pts);
        pl.setAttribute('class', 'pv-routes-line');
        svg.appendChild(pl);
        var dot = doc.createElementNS(SVG, 'rect');
        dot.setAttribute('x', (px0 - 1).toFixed(1)); dot.setAttribute('y', (py0 - 1).toFixed(1)); dot.setAttribute('width', '2'); dot.setAttribute('height', '2'); dot.setAttribute('class', 'pv-routes-dot');
        svg.appendChild(dot);
      }
      return svg;
    }
    function adviceKind(adv) {
      var a = String(adv || '?').toUpperCase();
      return a === 'GOOD' ? 'mint' : (a === 'OK' ? 'gold' : (a === 'BAD' ? 'red' : 'grey'));
    }
    function buildCards() {
      while (cards.firstChild) cards.removeChild(cards.firstChild);
      var options = ctx.options || [];
      for (var i = 0; i < options.length; i++) (function (opt, idx) {
        var adv = String(opt.advice || '?').toUpperCase();
        var unsure = opt.sure === false && adv !== '?';          // the engine read it off the shown look and this play rates differently against what the look can hide
        var name = opt.name || opt.id || ('PLAY ' + (idx + 1));
        var tags = (opt.tags || []).slice(0, 3);
        var label = name + '. ' + (adv === '?' ? 'Unsure against this look' : adv + ' against this look' + (unsure ? ' — if the look is honest' : '')) + (tags.length ? '. ' + tags.join(', ') : '') + '. Press ' + (idx + 1) + ' to run it.';
        var card = el('button', { class: 'pv-card', type: 'button', 'data-play': opt.id, 'data-idx': String(idx), 'data-sure': unsure ? '0' : '1', 'aria-label': label, onClick: function (ev) { if (!tooSoon(ev)) pick(idx); } });
        card.appendChild(el('span', { class: 'pv-card-key num', text: String(idx + 1) }));
        card.appendChild(el('span', { class: 'pv-card-name', text: name }));
        card.appendChild(routeThumb(opt));
        if (opt.line) card.appendChild(el('span', { class: 'pv-card-line', text: opt.line }));
        var meta = el('span', { class: 'pv-card-meta' });
        meta.appendChild(el('span', { class: 'chip pv-advice chip-' + adviceKind(adv) + (unsure ? ' unsure' : ''), text: adv === '?' ? '?' : adv }));
        if (unsure) meta.appendChild(el('span', { class: 'pv-unsure', text: '?', title: 'If the look is honest' }));
        for (var t = 0; t < tags.length; t++) meta.appendChild(el('span', { class: 'pv-tag', text: tags[t] }));
        card.appendChild(meta);
        cards.appendChild(card);
      })(options[i], i);
      cards.hidden = false;
    }
    function setCardsEnabled(on) {
      var b = cards.querySelectorAll('button');
      for (var i = 0; i < b.length; i++) b[i].disabled = !on;
    }

    // ───────────────────────────── phases ─────────────────────────────
    function startSituation() {
      setPhase('SITUATION');
      buildSituation();
      cards.hidden = true; lookLine.hidden = true; throwBox.hidden = true; feedback.hidden = true;
      setAria(situationLabel());
      announce(situationLabel());
    }
    function startRead() {
      if (destroyed || phase !== 'SITUATION') return;
      situationCard.hidden = true;
      setPhase('READ');
      buildLookLine();
      buildCards();
      throwBox.hidden = true; feedback.hidden = true;
      var lt = 'The defence shows ' + lookText() + (ctx.pressure && ctx.pressure.hot ? ' The pocket will be short.' : '') + ' Pick a play.';
      setAria(lt);
      announce(lt);
      if (ctx.options && ctx.options.length) setTimer(function () { var b = cards.querySelector('button'); if (b) { try { b.focus(); } catch (e) { /* ignore */ } } }, 0);
      showSub('READ THE LOOK', 'info', 900);
    }
    function pick(idxOrId) {
      if (destroyed || phase !== 'READ') return false;
      var options = ctx.options || [], idx = -1;
      if (typeof idxOrId === 'number') idx = idxOrId;
      else for (var i = 0; i < options.length; i++) if (options[i].id === idxOrId) idx = i;
      if (idx < 0 || idx >= options.length) return false;
      var opt = options[idx];
      setCardsEnabled(false);
      var s = null;
      try { s = opts.onPick ? opts.onPick(opt.id, opt) : null; }
      catch (e) { if (root.console) root.console.error('PlayView onPick failed', e); }
      if (!s || typeof s !== 'object') { setCardsEnabled(true); return false; }
      pickedId = opt.id; pickedOpt = opt;
      cue('click');
      if (s.run) { startRun(s, opt); return true; }
      startSnap(s, opt);
      return true;
    }
    function formationOf(s, opt) { return String((s && s.play && s.play.formation) || (s && s.formation) || (opt && opt.formation) || ''); }
    function isGun(formation) { return !/SINGLEBACK|I_FORM|UNDER|CENTRE|CENTER/i.test(formation); }
    /** Remember where everyone stands (the READ picture) so the snap can slide them into the play's formation. */
    function captureFrom() {
      var i, j;
      for (i = 0; i < NREC; i++) { recFromX[i] = aX[IREC + i]; recFromY[i] = aY[IREC + i]; }
      qbFromY = qbY;
      // by slot: the READ picture and the play's formation list the same slots in the same order, but be safe
      var fromBySlot = {};
      for (j = 0; j < recCount; j++) fromBySlot[recSlot[j]] = j;
      return fromBySlot;
    }
    function startSnap(s, opt) {
      sim = s; result = null; thrown = false; sacked = false; target = -1; hold = false; meterP = 0; lead = 0; loft = 0.5; lastTick = -1;
      ballCarrier = -1; landBeat = null; converge = -1; ballShown = false; intMan = -1; dropMan = -1;
      var fromBySlot = captureFrom();
      gun = isGun(formationOf(s, opt));
      rotateMs = reduced ? 0 : TIMING.rotateMs;
      alignMs = reduced ? 0 : TIMING.alignMs; alignU = alignMs ? 0 : 1;
      buildReceivers(s);
      for (var i = 0; i < recCount; i++) { var fi = fromBySlot[recSlot[i]]; if (fi === undefined) fi = i; if (fi !== i) { var fx = recFromX[fi], fy = recFromY[fi]; recFromX[i] = fx; recFromY[i] = fy; } }
      buildDefence();
      buildRush();
      placeLine();
      cards.hidden = true; lookLine.hidden = true; subBanner.hidden = true; toastLine.hidden = true;
      buildThrowBox();
      throwBox.hidden = false;
      if (playChip) { playChip.textContent = (opt && (opt.name || opt.id)) || ''; playChip.hidden = false; }
      setZone(null);
      setHint(snapHint());
      setupInput();
      tSnap = now() + alignMs; tPlay = 0; clockShown = -1;
      setPhase('SNAP');
      // a disguised look rotates into the real coverage at the snap: say so, so the fool is visible
      var shownNow = s && typeof s.shown === 'string' ? s.shown : shownId(), realNow = s && typeof s.real === 'string' ? s.real : realId();
      if (shownNow && realNow && shownNow !== realNow) showSub('ROTATION · ' + coverageNameOf(realNow), 'clutch', alignMs + rotateMs + 400);
      setAria('Snap. ' + (recCount ? 'Receivers running.' : ''));
      cue('click'); cue('haptic', 15);
      try { canvas.focus({ preventScroll: true }); } catch (e) { try { canvas.focus(); } catch (e2) { /* ignore */ } }
      if (btnScr) btnScr.hidden = true;
      if (btnAway) btnAway.hidden = true;
    }
    function canScramble() { var sc = (TQ().throw || {}).scramble || {}; return MOB >= num(sc.minMob, 55) && tPlay >= TIMING.scrambleAfterS; }
    function canThrowAway() { return tPlay >= TIMING.throwAwayAfterS; }
    function hitTest(clientX, clientY) {
      var v = cv.toVirtual(clientX, clientY), vx = v.x, vy = v.y;
      var best = -1, bd = FIELD.hitRadius * FIELD.hitRadius;
      for (var i = 0; i < recCount; i++) {
        if (!aShow[IREC + i]) continue;
        var h = Math.max(4, Math.round(12 * aS[IREC + i]));
        var cx = aSX[IREC + i], cy = aSY[IREC + i] - h / 2;
        var d = (vx - cx) * (vx - cx) + (vy - cy) * (vy - cy);
        if (d < bd) { bd = d; best = i; }
      }
      return best >= 0 ? recSlot[best] : null;
    }
    /**
     * The green band for a throw to receiver i released at t, written into zoneLive: the engine's Play.need rule
     * (the arrival at full power and the route's ideal loft — arrivalFlight — then needFor / greenBand),
     * computed here without allocating so it can follow the receiver every frame of the hold — the band the
     * player sees at the release is the band the engine verifies. Without the engine: the scene's own needFor.
     */
    function greenZoneFor(i, t) {
      if (i < 0) return null;
      var Pl = RTG.Play;
      var need, band, dist;
      if (Pl && typeof Pl.flightTime === 'function' && typeof Pl.needFor === 'function' && typeof Pl.greenBand === 'function') {
        arrivalFlight(i, t);
        dist = arrDist;
        need = Pl.needFor(dist, qbAttrs); band = Pl.greenBand(ACC);
        zoneStatic = false;
      } else {
        pathAt(i, t + 0.7, pt2, true);
        var dx = pt2.x - qbX, dy = pt2.y - qbY;
        dist = Math.sqrt(dx * dx + dy * dy);
        need = PlayView.needFor(dist, ARM); band = PlayView.greenBandFor(ACC);
        zoneStatic = true;
      }
      var pm = num((TQ().throw || {}).powerMax, 1.15);
      zoneLive.hi = Math.min(pm, need + band); zoneLive.lo = Math.max(0.05, zoneLive.hi - band); zoneLive.dist = dist;
      return zoneLive;
    }
    /** The hold's hint: the band, or the range warning when the target's arrival is beyond the arm. */
    function holdHint() { return target >= 0 && recDist[target] > maxDistYd ? 'OUT OF RANGE · ' + Math.round(maxDistYd) + ' YD ARM' : 'RELEASE IN THE GREEN'; }
    function setupInput() {
      teardownInput();
      input = Inp.create({
        canvasEl: canvas,
        hitTest: hitTest,
        active: function () { return inPlay() && !paused(); },
        holdMs: function () { return num((TQ().throw || {}).meterHoldMs, 1300); },
        greenZone: function () { return zone; },
        assist: function () { return liveSettings().greenAssist !== false; },
        keys: function () { return liveSettings().keys; },
        canThrowAway: canThrowAway,
        canScramble: canScramble,
        playTime: function () { return tPlay; },
        onTarget: function (slot) {
          target = recIndexOf(slot);
          if (target < 0) return;
          setPhase('THROW');
          setAria('Target ' + slot + '.');
          cue('click');
        },
        onHoldStart: function () {
          hold = true; meterP = 0; lastTick = -1; lastZoneLo = -1;
          setZone(greenZoneFor(target, tPlay));
          setHint(holdHint());
          cue('click');
        },
        onHold: function (p) {
          meterP = p; setVel(p);
          var tick = Math.floor(p * 10);
          if (tick !== lastTick) { lastTick = tick; cue('click'); }
        },
        onAim: function (ld, lf) { lead = ld; loft = lf; setAimReadout(ld, lf); },
        onHoldCancel: function () { hold = false; meterP = 0; setVel(0); setHint(snapHint()); },
        onRelease: function (inp) { hold = false; onRelease(inp); },
        onThrowAway: function () { resolve({ kind: 'THROWAWAY', target: target >= 0 ? recSlot[target] : null, t: tPlay, lead: 0, loft: 0.5, power: 0.6, quality: 0.5, green: false }); },
        onScramble: function () { resolve({ kind: 'SCRAMBLE', target: null, t: tPlay, lead: 0, loft: 0, power: 0, quality: 0.5, green: false }); },
        onStray: function () { showToast(coarsePointerNow() ? 'TAP A RECEIVER FIRST' : 'PICK A RECEIVER: 1-5'); }
      });
      input.slots(recSlot.slice(0, recCount));
    }
    function teardownInput() { if (input) { input.destroy(); input = null; } }
    function onRelease(inp) {
      if (destroyed || !inPlay()) return;
      var t = inp.target !== null && inp.target !== undefined ? inp.target : (target >= 0 ? recSlot[target] : null);
      resolve({ kind: 'THROW', target: t, t: tPlay, lead: inp.lead, loft: inp.loft, power: inp.power, quality: inp.quality, green: !!inp.green });
    }
    /** Hand the input to the shell (Play.throw) and start the resolution beat for the result that comes back. */
    function resolve(inp) {
      if (destroyed || thrown || !inPlay()) return;
      thrown = true; tThrow = now(); tThrowPlay = tPlay;
      lastInput = inp;
      teardownInput();
      if (btnAway) btnAway.hidden = true;
      if (btnScr) btnScr.hidden = true;
      var res = null;
      try { res = opts.onThrow ? opts.onThrow(inp, sim) : null; }
      catch (e) { if (root.console) root.console.error('PlayView onThrow failed', e); }
      if (!res || typeof res.outcome !== 'string') {
        if (inp.kind === 'SACK') res = { outcome: 'SACK', target: null, yards: -num((TQ().throw || {}).sackYards, 7), td: false, firstDown: false, turnover: false, feedback: { coachSaw: 'Held it too long.' } };
        else { thrown = false; setupInput(); setPhase('SNAP'); target = -1; hold = false; return; }   // the shell refused: re-arm
      }
      beginResolution(res, inp);
    }
    function beginResolution(res, inp) {
      result = res;
      setHint('');
      hideBanner(); feedback.hidden = true; subBanner.hidden = true; skipHint.hidden = true;
      var out = res.outcome;
      if (out === 'SACK') { startSack(); return; }
      if (out === 'SCRAMBLE' || out === 'RUN') { startRunBeat(res); return; }
      startFlight(res, inp);
    }
    function startSack() {
      sacked = true;
      setPhase('SACK');
      shakeAmp = reduced ? 0 : 2 + Math.min(4, Math.abs(num(result && result.yards, 7)) * 0.4);   // the shake scales with the yards lost
      flashAlpha = reduced ? 0 : 0.4; flashColor = pal('red');
      qbDown = 1;
      cue('thunk', 1.0); cue('haptic', 60);
      setAria('Sacked.');
      setTimer(startResult, reduced ? 120 : TIMING.sackMs);
    }
    function startRunBeat(res) {
      setPhase('RUN');
      runYards = num(res.yards, 0);
      runFrom = qbY; runX = qbX; runT0 = tPlay;
      runActor = IQB;
      qbFace = 1;
      cue('whoosh');
      setAria(res.outcome === 'SCRAMBLE' ? 'Scramble.' : 'Run.');
    }
    function startRun(s, opt) {
      // a run option (SNEAK / DRAW) resolves straight from the snap: no throw, the result is built here
      sim = s; thrown = true; tThrow = now();
      var yards = num(s.yards, 0);
      if (typeof s.outcome === 'string') { result = s; if (!result.playId) result.playId = opt.id; }
      else result = { outcome: 'RUN', playId: opt.id, play: { id: opt.id, name: opt.name }, target: null, yards: yards, airYards: 0, yac: 0, td: !!s.td, firstDown: !!s.firstDown, turnover: !!s.turnover, flight: 0, landing: null, text: s.text || '', feedback: s.feedback || { coachSaw: s.text || '' }, run: true };
      var fromBySlot = captureFrom();
      gun = isGun(formationOf(s, opt));
      alignMs = reduced ? 0 : TIMING.alignMs; alignU = alignMs ? 0 : 1;
      buildReceivers(s.receivers && s.receivers.length ? s : null); buildDefence(); buildRush(); placeLine();
      for (var ri = 0; ri < recCount; ri++) { var fri = fromBySlot[recSlot[ri]]; if (fri !== undefined && fri !== ri) { recFromX[ri] = recFromX[fri]; recFromY[ri] = recFromY[fri]; } }
      cards.hidden = true; throwBox.hidden = true;
      if (playChip) { playChip.textContent = opt.name || opt.id; playChip.hidden = false; }
      tSnap = now() + alignMs; tPlay = 0; runT0 = 0;
      setPhase('RUN');
      runYards = yards; runFrom = gun ? FIELD.qbShotgun : FIELD.qbUnderCentre; runX = qbX;
      var runId = (result.playId || (result.play && result.play.id) || opt.id);
      runActor = runId === 'DRAW' && recIndexOf('RB') >= 0 ? IREC + recIndexOf('RB') : IQB;
      if (runActor !== IQB) { runFrom = aY[runActor]; runX = aX[runActor]; }
      cue('thunk', 0.8);
      setAria(opt.id === 'SNEAK' ? 'Quarterback sneak.' : 'Draw play.');
    }
    function updateRun() {
      var ms = reduced ? 120 : TIMING.runMs + Math.min(600, Math.abs(runYards) * 25);
      if (alignU < 1) {                                  // a run option from READ: the offence slides into the formation first
        if (runActor === IQB) { qbY = lerp(qbFromY, runFrom, ease(alignU)); aX[IQB] = qbX; aY[IQB] = qbY; qbPose = 0; }
        return;
      }
      var e = (tPlay - runT0) * 1000;
      var u = ease(clamp(e / ms, 0, 1));
      var y = lerp(runFrom, runYards, u);
      var maxY = Math.max(runFrom, L.goalD);
      if (y > maxY) y = maxY;
      if (runActor === IQB) { qbY = y; qbX = runX + (runYards > 0 ? Math.sin(u * Math.PI) * 2 : 0); aX[IQB] = qbX; aY[IQB] = qbY; qbPose = (Math.floor(e / TIMING.runFrameMs) & 1); }
      else { aY[runActor] = y; aX[runActor] = runX; aFrame[runActor] = (Math.floor(e / TIMING.runFrameMs) & 1); }
      ballCarrier = runActor === IQB ? -2 : runActor - IREC;
      if (u >= 1) startResult();
    }
    function startFlight(res, inp) {
      setPhase('FLIGHT');
      var ft = num(res.flight, 0.9);
      flightS = ft;
      flightMs = reduced ? TIMING.reducedFlightMs : Math.max(TIMING.minFlightMs, Math.round(ft * TIMING.flightScale * 1000));
      var land = res.landing;
      var ti = res.target ? recIndexOf(res.target) : (inp && inp.target ? recIndexOf(inp.target) : target);
      if (!land || typeof land.x !== 'number') {
        // no landing from the engine: aim where the target will be at the catch, or the sideline for a throwaway
        if (res.outcome === 'THROWAWAY' || ti < 0) land = { x: (lead < 0 ? -1 : 1) * 32, y: 12 };
        else { pathAt(ti, tPlay + ft, pt2); land = { x: pt2.x, y: pt2.y }; }
      }
      convergeX = land.x; convergeY = land.y; converge = ti;
      ballShown = true; ballCarrier = -1; landBeat = null;
      intMan = -1;
      if (res.outcome === 'INT') {
        // the interceptor is chosen at the throw (the deep help or the man on the target, else the nearest) and runs
        // to the landing spot under the ball — nobody teleports onto it
        var best = -1, bs = Infinity;
        for (var j = 4; j < defCount; j++) {
          var dx = aX[j] - land.x, dy = aY[j] - land.y, d = dx * dx + dy * dy;
          if (defRole[j] === ROLE_DEEP || (ti >= 0 && defArg[j] === ti)) d *= 0.5;
          if (d < bs) { bs = d; best = j; }
        }
        intMan = best;
      }
      qbPose = 2;
      cue('whoosh'); cue('haptic', 20);
      skipHint.hidden = reduced;
      setAria('Ball in the air.');
      result.landing = land;
    }
    function flightProgress() { return clamp(elapsed() / flightMs, 0, 1); }
    function placeBall(s) {
      var land = result.landing;
      var x0 = qbX + (mirror ? -0.6 : 0.6), y0 = qbY + 0.5;
      var gx = lerp(x0, land.x, s), gy = lerp(y0, land.y, s);
      var apex = FIELD.arcMin + FIELD.arcPerLoft * clamp(num(lastInput && lastInput.loft, 0.5), 0, 1);
      var h = FIELD.ballHandYd * (1 - s) + 4 * apex * s * (1 - s);
      project(gx, gy);
      ballGround = Math.round(pt.y);
      ballX = Math.round(pt.x);
      ballY = Math.round(pt.y - h * L.pxPerYd * pt.s * L.kv);
      ballH = h;
      ballSize = lerp(8, 3, 1 - pt.s) * (1 + 0.35 * 4 * s * (1 - s));
      camY = reduced ? 0 : -Math.round(3 * Math.sin(Math.PI * s));
    }
    function updateFlight() {
      var s = flightProgress();
      tPlay = tThrow === 0 ? tPlay : Math.max(0, (tThrow - tSnap) / 1000) + s * flightS;
      if (landBeat) { updateLanding(); return; }
      placeBall(s);
      if (s >= 1) land();
    }
    function land() {
      placeBall(1);
      camY = 0;
      var out = result.outcome, ti = converge;
      landAt = now();
      if (out === 'CATCH') {
        if (ti >= 0) { ballCarrier = ti; aX[IREC + ti] = result.landing.x; aY[IREC + ti] = result.landing.y; aFrame[IREC + ti] = 2; }
        landBeat = 'catch';
        landMs = reduced ? 60 : TIMING.catchHoldMs;
        cue('thunk', 0.6);
        return;
      }
      if (out === 'DROP') {
        if (ti >= 0) { dropMan = ti; aX[IREC + ti] = result.landing.x; aY[IREC + ti] = result.landing.y; aFrame[IREC + ti] = 2; }
        landBeat = 'bounce'; landMs = reduced ? 40 : TIMING.bounceMs;
        cue('whistle');
        return;
      }
      if (out === 'INT') {
        // the interceptor chosen at the throw (startFlight) is under the ball; the nearest man stands in otherwise
        var best = intMan, bd = 1e9;
        if (best < 0) for (var j = 4; j < defCount; j++) { var dx = aX[j] - result.landing.x, dy = aY[j] - result.landing.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = j; } }
        if (best >= 0) { aX[best] = result.landing.x; aY[best] = result.landing.y; aFrame[best] = 2; ballCarrier = -3 - best; intMan = best; }
        landBeat = 'int'; landMs = reduced ? 60 : TIMING.intReturnMs;
        cue('thunk', 0.6); cue('stingerBad');
        return;
      }
      landBeat = out === 'THROWAWAY' ? 'away' : 'bounce';
      landMs = reduced ? 40 : TIMING.bounceMs;
      if (out === 'THROWAWAY') cue('whistle');
    }
    function updateLanding() {
      var e = now() - landAt, u = clamp(e / Math.max(1, landMs), 0, 1);
      if (landBeat === 'catch') {
        if (u >= 1) {
          var yac = num(result.yac, 0);
          if (yac > 0.5 && ballCarrier >= 0) {
            landBeat = 'yac'; landAt = now(); landMs = reduced ? 80 : clamp(TIMING.yacBaseMs + TIMING.yacPerYdMs * yac, 0, TIMING.yacMaxMs);
            runFrom = aY[IREC + ballCarrier]; runX = aX[IREC + ballCarrier]; runYards = Math.min(yac, Math.max(0, L.goalD - runFrom));
            return;
          }
          startResult();
        }
        return;
      }
      if (landBeat === 'yac') {
        var i = ballCarrier;
        aY[IREC + i] = lerp(runFrom, runFrom + runYards, ease(u)); aX[IREC + i] = runX;
        aFrame[IREC + i] = (Math.floor(e / TIMING.runFrameMs) & 1);
        if (u >= 1) startResult();
        return;
      }
      if (landBeat === 'int') {
        var j = -3 - ballCarrier;
        if (j >= 0 && j < defCount) { aY[j] = result.landing.y - 3 * ease(u); aFrame[j] = (Math.floor(e / TIMING.runFrameMs) & 1); }
        if (u >= 1) startResult();
        return;
      }
      // a bounce / a throwaway: the ball hops
      ballY = ballGround - Math.round(3 * Math.abs(Math.sin(u * Math.PI * 2)) * (1 - u));
      ballSize = 3;
      if (u >= 1) startResult();
    }
    function bannerFor(res) {
      var b = ownBanner(res);
      // the engine's copy wins when it speaks: banner ('TOUCHDOWN!' · 'FIRST DOWN' · else text) and text ('CATCH +14' …);
      // a 'FIRST DOWN' on the last play is refused either way (the game was lost)
      if (typeof res.banner === 'string' && res.banner && !(sit.lastPlay && res.banner === 'FIRST DOWN' && !res.td)) { b.text = res.banner; b.sub = (typeof res.text === 'string' && res.text && res.text !== res.banner) ? res.text : b.sub; }
      if (res.fumble || (res.turnover && res.outcome !== 'INT')) b.kind = 'blocked';
      return b;
    }
    function ownBanner(res) {
      var o = res.outcome, y = Math.round(num(res.yards, 0)), sign = y >= 0 ? '+' : '';
      var fd = !!res.firstDown && !sit.lastPlay;    // on the last play a first down that does not score loses: never 'FIRST DOWN'
      if (res.td) return { text: 'TOUCHDOWN!', kind: 'gold', sub: o === 'CATCH' ? 'CATCH ' + sign + y : (o === 'SCRAMBLE' ? 'SCRAMBLE ' + sign + y : '') };
      if (o === 'CATCH') return fd ? { text: 'FIRST DOWN', kind: 'good', sub: 'CATCH ' + sign + y } : { text: 'CATCH ' + sign + y, kind: sit.lastPlay ? 'bad' : 'good', sub: sit.lastPlay ? 'SHORT' : '' };
      if (o === 'INT') return { text: 'INTERCEPTED', kind: 'blocked', sub: '' };
      if (o === 'SACK') return { text: 'SACKED ' + (y > 0 ? '-' : sign) + Math.abs(y), kind: 'bad', sub: '' };
      if (o === 'DROP') return { text: 'DROPPED', kind: 'bad', sub: '' };
      if (o === 'THROWAWAY') return { text: 'THROWN AWAY', kind: 'neutral', sub: '' };
      if (o === 'SCRAMBLE') return fd ? { text: 'FIRST DOWN', kind: 'good', sub: 'SCRAMBLE ' + sign + y } : { text: 'SCRAMBLE ' + sign + y, kind: y > 0 && !sit.lastPlay ? 'good' : 'bad', sub: res.turnover ? 'FUMBLE' : (sit.lastPlay ? 'SHORT' : '') };
      if (o === 'RUN') { var pid = res.playId || (res.play && res.play.id) || res.play; var nm = pid === 'SNEAK' ? 'SNEAK' : (pid === 'DRAW' ? 'DRAW' : 'RUN'); return fd ? { text: 'FIRST DOWN', kind: 'good', sub: nm + ' ' + sign + y } : { text: nm + ' ' + sign + y, kind: y > 0 && !sit.lastPlay ? 'good' : 'bad', sub: '' }; }
      return { text: 'INCOMPLETE', kind: 'bad', sub: '' };
    }
    function showFeedback(res) {
      var fb = res.feedback || {}, parts = [];
      if (fb.timing) parts.push(fb.timing);
      if (fb.touch) parts.push(fb.touch);
      if (typeof res.window === 'number') parts.push('WINDOW ' + Math.round(res.window * 100) + '%');
      if (typeof res.accuracy === 'number') parts.push('ACC ' + Math.round(res.accuracy * 100) + '%');
      if (typeof res.airYards === 'number' && res.outcome === 'CATCH') parts.push('AIR ' + Math.round(res.airYards) + ' · YAC ' + Math.round(num(res.yac, 0)));
      feedback.textContent = '';
      if (parts.length) feedback.appendChild(el('div', { class: 'pv-feedback-line', text: parts.join(' · ') }));
      var coach = fb.coachSaw || res.text || '';
      if (coach) feedback.appendChild(el('div', { class: 'pv-feedback-coach small', text: coach }));
      feedback.hidden = !parts.length && !coach;
    }
    function startResult() {
      if (destroyed || phase === 'RESULT' || phase === 'DONE') return;
      setPhase('RESULT');
      landBeat = null;
      var b = bannerFor(result);
      showBanner(b.text, b.kind);
      if (b.sub) showSub(b.sub, b.kind === 'gold' ? 'clutch' : 'info', TIMING.subBannerMs);
      var good = result.td || result.outcome === 'CATCH' || (result.outcome === 'SCRAMBLE' && num(result.yards, 0) > 0 && !result.turnover) || (result.outcome === 'RUN' && num(result.yards, 0) > 0) || result.firstDown;
      var bad = result.outcome === 'INT' || result.outcome === 'SACK' || result.turnover;
      flashAlpha = reduced ? 0 : (result.td ? 0.55 : (bad ? 0.45 : 0.25)); flashColor = good ? pal('gold') : pal('red');
      crowdMode = good ? 'cheer' : (bad ? 'groan' : 'idle');
      if (result.td) { cue('stingerGood'); cue('crowdRoar'); }
      else if (good) { cue('stingerGood'); cue('crowd', 0.35); }
      else if (bad) { cue('stingerBad'); cue('crowd', 0.08); }
      else cue('crowd', 0.15);
      throwBox.hidden = true;
      showFeedback(result);
      skipHint.hidden = reduced;
      var ariaText = b.text + (b.sub ? '. ' + b.sub : '') + (result.feedback && result.feedback.coachSaw ? '. ' + result.feedback.coachSaw : '');
      setAria(ariaText);
      announce(ariaText);
      if (opts.onResult) { try { opts.onResult(result); } catch (e) { if (root.console) root.console.error('onResult failed', e); } }
      setTimer(finish, reduced ? TIMING.resultReducedMs : TIMING.resultMs);
    }
    function finish() {
      if (destroyed || phase !== 'RESULT') return;
      setPhase('DONE');
      skipHint.hidden = true;
      if (opts.onDone) { try { opts.onDone(result); } catch (e) { if (root.console) root.console.error('onDone failed', e); } }
    }
    function skip() {
      if (phase === 'FLIGHT' && elapsed() >= TIMING.skipAfterMs) {
        if (!landBeat) land();
        startResult();
        return true;
      }
      if (phase === 'RUN' || phase === 'SACK') { clearTimers(); startResult(); return true; }
      if (phase === 'RESULT') { clearTimers(); finish(); return true; }
      return false;
    }
    function onStagePointer(e) {
      // the field around the card reads too — but not inside armMs of the card mounting (a double tap on NEXT lands here)
      if (phase === 'SITUATION') { if (e.target === canvas && elapsed() >= TIMING.armMs) { e.preventDefault(); startRead(); } return; }
      if (phase === 'FLIGHT' || phase === 'RESULT' || phase === 'RUN' || phase === 'SACK') { if (skip()) e.preventDefault(); }
    }
    function onKey(e) {
      if (destroyed || e.repeat) return;
      if (e.key === 'Escape' && !e.altKey && !e.ctrlKey && !e.metaKey) {
        if (opts.onSettings) { e.preventDefault(); opts.onSettings(); return; }
        if (PlayView.escapeToSettings(e)) e.preventDefault();
        return;
      }
      var t = e.target, tag = t && t.tagName;
      var confirmKey = e.key === ' ' || e.key === 'Enter' || Inp.keyMatches(e, Inp.resolveKeys(liveSettings().keys).confirm);
      var soon = elapsed() < TIMING.armMs;             // a key inside armMs of the phase mounting is the tail of an earlier press
      if (phase === 'READ') {
        if (e.key >= '1' && e.key <= '9' && e.key.length === 1 && tag !== 'INPUT' && tag !== 'TEXTAREA') { e.preventDefault(); if (!soon) pick(e.key.charCodeAt(0) - 49); }
        return;
      }
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || (t && t.isContentEditable)) return;
      if (!confirmKey) return;
      if (phase === 'SITUATION') { e.preventDefault(); if (!soon) startRead(); return; }
      if (phase === 'FLIGHT' || phase === 'RESULT' || phase === 'RUN' || phase === 'SACK') { if (skip()) e.preventDefault(); }
    }

    // ───────────────────────────── drawing ─────────────────────────────
    function drawStadium() {
      if (!stadium) buildStadium();
      g.drawImage(crowdMode === 'groan' ? stadium.dim : (crowdFrame ? stadium.b : stadium.a), 0, 0);
    }
    function drawField() {
      g.drawImage(fieldLayer, 0, L.yHor);
      if (posts) g.drawImage(posts.img, posts.x, posts.y);
    }
    function drawRing(i) {
      var k = recRing[i], spr = null;
      if (k === 0) spr = rings.open; else if (k === 1) spr = rings.closing; else if (k === 2) spr = rings.closed; else if (k === 3) spr = rings.range;
      if (!spr && i === target && inPlay()) spr = rings.pick;
      if (!spr) return;
      var s = aS[IREC + i], w = Math.max(FIELD.ringMinW, Math.round(FIELD.ringW * s)), h = Math.max(3, Math.round(5 * s));
      g.drawImage(spr, Math.round(aSX[IREC + i] - w / 2), Math.round(aSY[IREC + i] - h / 2), w, h);
    }
    function drawActor(a) {
      if (!aShow[a]) return;
      var s = aS[a], x = aSX[a], y = aSY[a];
      if (a === IQB) {
        var spr = qbSpr[qbPose] || qbSpr[0];
        if (qbDown) {
          // sacked: the set pose on its side (rotated a quarter turn, the tackler drawn over him) and the ball loose
          g.save(); g.translate(Math.round(x), Math.round(y)); g.rotate(Math.PI / 2);
          g.drawImage(spr, -spr.width, -(spr.height >> 1));
          g.restore();
          g.drawImage(balls[3], Math.round(x) + (spr.height >> 1) + 2, Math.round(y) - 3);
          return;
        }
        var qx = Math.round(x - spr.width / 2), qy = Math.round(y - spr.height);
        if (mirror) { g.save(); g.translate(qx + spr.width, qy); g.scale(-1, 1); g.drawImage(spr, 0, 0); g.restore(); }
        else g.drawImage(spr, qx, qy);
        if (ballCarrier === -2) g.drawImage(balls[3], qx + (mirror ? 1 : spr.width - 4), qy + 9);
        return;
      }
      if (a >= IOL) { g.drawImage(olSpr, Math.round(x - olSpr.width / 2), Math.round(y - olSpr.height)); return; }
      var w = Math.max(3, Math.round(8 * s)), h = Math.max(4, Math.round(12 * s));
      if (a >= IREC) {
        var i = a - IREC;
        drawRing(i);
        var rs = recSpr[aFrame[a]] || recSpr[0];
        g.drawImage(rs, Math.round(x - w / 2), Math.round(y - h), w, h);
        if (hotSlot === i && inPlay() && tPlay < 1.5) g.drawImage(hotSpr, Math.round(x - 1), Math.round(y - h - 5));
        if (ballCarrier === i && (phase !== 'FLIGHT' || landBeat)) g.drawImage(balls[3], Math.round(x - 1), Math.round(y - h + 2));
        if (i === target && inPlay()) {
          g.drawImage(pickSpr, Math.round(x - pickSpr.width / 2), Math.round(y - h - 1 - (pickSpr.height - h) / 2 - 2));
          if (hold) {
            // the lead arrow ahead of / behind the receiver along its run
            var vx = recVX[i], vy = recVY[i], n = Math.sqrt(vx * vx + vy * vy) || 1;
            var ux = vy === 0 && vx === 0 ? 0 : vx / n, uy = vy === 0 && vx === 0 ? 1 : vy / n;
            var off = 3 + 6 * Math.abs(lead), sign = lead >= 0 ? 1 : -1;
            var ax = Math.round(x + ux * off * sign), ay = Math.round(y - h / 2 - uy * off * sign);
            if (Math.abs(lead) > 0.05) g.drawImage(lead >= 0 ? leadAhead : leadBehind, ax - 2, ay - 2);
          }
        }
        return;
      }
      // a defender
      var ds = defRole[a] === ROLE_RUSH || defRole[a] === ROLE_BLITZ ? rusherSpr[aFrame[a] & 1] : (aFrame[a] === 2 ? defSpr[2] : defSpr[aFrame[a] & 1]);
      g.drawImage(ds, Math.round(x - w / 2), Math.round(y - h), w, h);
      if (ballCarrier <= -3 && (-3 - ballCarrier) === a) g.drawImage(balls[3], Math.round(x - 1), Math.round(y - h + 2));
    }
    function drawActors() {
      for (var k = 0; k < NACT; k++) drawActor(order[k]);
    }
    function drawAim() {
      if (!hold || target < 0) return;
      // the loft arc: dots from the hand to the target, rising with the loft
      var i = target, tx = aSX[IREC + i], ty = aSY[IREC + i] - Math.max(4, Math.round(12 * aS[IREC + i])) / 2;
      var qx = aSX[IQB], qy = aSY[IQB] - 14;
      var apex = (FIELD.arcMin + FIELD.arcPerLoft * loft) * L.pxPerYd * L.kv * 0.6;
      g.fillStyle = pal('chalk'); g.globalAlpha = 0.85;
      for (var j = 0; j < 12; j++) {
        var u = 0.1 + 0.85 * j / 11;
        g.fillRect(Math.round(lerp(qx, tx, u)), Math.round(lerp(qy, ty, u) - 4 * apex * u * (1 - u)), 1, 1);
      }
      g.globalAlpha = 1;
    }
    function drawBall() {
      if (!ballShown) return;
      if (phase === 'FLIGHT' && !landBeat) {
        g.fillStyle = 'rgba(16,18,38,0.45)';
        var sw = Math.max(2, Math.round(ballSize * 0.6));
        g.fillRect(ballX - (sw >> 1), ballGround, sw, 1);
      }
      if (ballCarrier !== -1) return;   // in someone's hands
      var spr = ballSize < 2.5 ? balls[2] : (ballSize < 4.5 ? balls[3] : (ballSize < 7 ? balls[5] : balls[8]));
      g.drawImage(spr, ballX - (spr.width >> 1), ballY - (spr.height >> 1));
    }
    function drawParticles() {
      if (!pCount) return;
      var spr = pKind === 'rain' ? rainSpr : snowSpr;
      for (var i = 0; i < pCount; i++) g.drawImage(spr, Math.round(particles[i * 4]), Math.round(particles[i * 4 + 1]));
    }
    function drawOverlays() {
      if (weatherKind() === 'fog') { g.fillStyle = pal('chalk'); g.globalAlpha = 0.18; g.fillRect(0, L.yHor - 12, L.W, Math.round((L.yLOS - L.yHor) * 0.6)); g.globalAlpha = 1; }
      if (vignette && (inPlay() || phase === 'FLIGHT')) g.drawImage(vignette, 0, 0);
      if (phase === 'SITUATION') { g.fillStyle = pal('ink'); g.globalAlpha = 0.55; g.fillRect(0, 0, L.W, L.H); g.globalAlpha = 1; }
      if (flashAlpha > 0) { g.fillStyle = flashColor; g.globalAlpha = flashAlpha; g.fillRect(0, 0, L.W, L.H); g.globalAlpha = 1; flashAlpha = Math.max(0, flashAlpha - 0.05); }
    }
    function draw() {
      g.save();
      g.translate(camX, camY);
      drawStadium();
      drawField();
      drawActors();
      drawAim();
      drawBall();
      drawParticles();
      g.restore();
      drawOverlays();
    }

    /** A modal is open: freeze every clock (the play clock, the flight, the landing beat, the skip timer) and cancel a live hold. */
    function holdPaused(dt) {
      if (inPlay()) {
        tSnap += dt;
        if (hold && input) {
          input.reset();
          if (target >= 0) input.setTarget(recSlot[target], 'key');   // the target stays, the climb starts over on resume
          hold = false; meterP = 0; setVel(0); setZone(null); setHint(snapHint());
        }
      } else if (phase === 'RUN') tSnap += dt;
      else if (phase === 'FLIGHT') { tPhase += dt; landAt += dt; }
      else if (phase === 'SACK' || phase === 'RESULT') tPhase += dt;
      projectAll();
    }
    function update(dt, t) {
      if (paused()) { holdPaused(dt); return; }
      var period = crowdMode === 'cheer' ? TIMING.crowdCheerMs : TIMING.crowdIdleMs;
      if (t - crowdAt > period) { crowdAt = t; crowdFrame = crowdMode === 'groan' ? 0 : 1 - crowdFrame; }
      var amp = 0;
      if (!reduced && shakeAmp > 0) { amp = shakeAmp; shakeAmp = Math.max(0, shakeAmp - dt / 80); }
      camX = amp ? Math.round((rnd() - 0.5) * 2 * amp) : 0;
      if (phase !== 'FLIGHT') camY = amp ? Math.round((rnd() - 0.5) * 2 * amp) : 0;
      if (input) input.update(t);
      if (inPlay()) {
        var raw = tSnap === 0 ? 0 : (t - tSnap) / 1000;
        tPlay = Math.max(0, raw);
        alignU = alignMs > 0 ? clamp(1 + raw * 1000 / alignMs, 0, 1) : 1;
        positionsAt(tPlay);
        if (hold && target >= 0 && !zoneStatic) { setZone(greenZoneFor(target, tPlay)); setHint(holdHint()); }
        runClock();
        var sackAt = num(sim && sim.sackAt, TIMING.playMaxS);
        setPressure(sackAt > 0 ? tPlay / sackAt : 0);
        if (btnAway && btnAway.hidden && canThrowAway()) btnAway.hidden = false;
        if (btnScr && btnScr.hidden && canScramble()) btnScr.hidden = false;
        var limit = Math.max(TIMING.playMaxS, sackAt);
        if (tPlay >= sackAt || tPlay >= limit) {
          resolve({ kind: 'SACK', target: target >= 0 ? recSlot[target] : null, t: tPlay, lead: lead, loft: loft, power: meterP, quality: 0.3, green: false });
        }
      } else if (phase === 'FLIGHT') { updateFlight(); positionsAt(tPlay); }
      else if (phase === 'RUN') { var rr = (t - tSnap) / 1000; tPlay = Math.max(0, rr); alignU = alignMs > 0 ? clamp(1 + rr * 1000 / alignMs, 0, 1) : 1; positionsAt(tPlay); updateRun(); }
      else if (phase === 'SACK') { positionsAt(num(sim && sim.sackAt, tPlay)); }
      else if (phase === 'RESULT' || phase === 'DONE') { /* frozen */ }
      projectAll();
      if (pCount) updateParticles(dt);
    }
    function loop(dt, t) { update(dt, t); draw(); }

    // ───────────────────────────── arm ─────────────────────────────
    function arm() {
      clearTimers();
      teardownInput();
      sit = ctx.situation || {};
      venue = venueOf(ctx);
      clutch = !!(ctx.clutch || (ctx.pressure && ctx.pressure.clutch) || sit.clutch);
      pressure = clamp(num(sit.pressure, num(ctx.pressureLevel, clutch ? 0.7 : 0.35)), 0, 1);
      if (pressure >= 0.6) clutch = true;
      sim = null; result = null; pickedId = null; pickedOpt = null; thrown = false; sacked = false; target = -1; hold = false; meterP = 0; zone = null;
      ballShown = false; ballCarrier = -1; landBeat = null; converge = -1; intMan = -1; dropMan = -1; crowdMode = 'idle'; flashAlpha = 0; shakeAmp = 0; camX = 0; camY = 0; qbDown = 0;
      for (var i = 0; i < NACT; i++) { order[i] = i; aShow[i] = 0; }
      gun = true; alignMs = 0; alignU = 1;             // the READ picture is the shotgun (the engine's default alignment)
      buildReceivers(null);
      buildDefence();
      placeLine();
      hotSlot = -1;
      loadRings();
      relayout();
      initParticles();
      buildHud();
      hideBanner(); subBanner.hidden = true; toastLine.hidden = true; skipHint.hidden = true; feedback.hidden = true; throwBox.hidden = true; cards.hidden = true;
      startSituation();
      if (clutch) { showSub('CLUTCH', 'clutch', 900); cue('crowd', 0.12); }
      else cue('crowd', 0.2 + 0.4 * pressure);
    }

    stage.addEventListener('pointerdown', onStagePointer);
    situationCard.addEventListener('click', onSituationClick);
    root.addEventListener('keydown', onKey);
    // a setting toggled from the scene's own Escape → Settings (palette, high contrast, reduced motion, the mirror)
    // reaches the canvas at once, not on the next moment
    if (store && typeof store.subscribe === 'function') {
      unsubSettings = store.subscribe(function (info) {
        if (destroyed || !info || info.fnName !== 'settings') return;
        var s = liveSettings();
        reduced = reducedMotion(s);
        mirror = !!(s.leftHanded || s.leftFooted || s.mirror);
        loadRings();
        relayout();
      });
    }
    arm();
    cv.start(loop);

    var view = {
      el: elRoot, canvas: canvas, cv: cv,
      phase: function () { return phase; },
      layout: function () { return L; },
      ctx: function () { return ctx; },
      sim: function () { return sim; },
      result: function () { return result; },
      /** {sim, target, t}: what the scene is playing right now (RTG.debug / the e2e harness). */
      current: function () { return { sim: sim, target: target >= 0 ? recSlot[target] : null, t: tPlay, phase: phase, play: pickedId, hold: hold, power: meterP, lead: lead, loft: loft }; },
      lastInput: function () { return lastInput; },
      greenZone: function () { return zone; },
      input: function () { return input; },
      /** Field yards → virtual px (a copy). */
      project: function (x, y) { project(x, y); return { x: pt.x, y: pt.y, s: pt.s }; },
      /** Receivers and the QB in css px relative to the canvas element (tapReceiver in the e2e helpers). */
      actors: function () {
        var out = { receivers: [], qb: null, scale: cv.scale };
        for (var i = 0; i < recCount; i++) {
          var h = Math.max(4, Math.round(12 * aS[IREC + i]));
          out.receivers.push({ slot: recSlot[i], x: aSX[IREC + i] * cv.scale, y: (aSY[IREC + i] - h / 2) * cv.scale, fieldX: aX[IREC + i], fieldY: aY[IREC + i], open: recOpen[i], openNow: recOpenNow[i], dist: recDist[i], ring: recRing[i] });
        }
        out.qb = { x: aSX[IQB] * cv.scale, y: (aSY[IQB] - 10) * cv.scale };
        return out;
      },
      read: startRead,
      pick: pick,
      target: function (slot) { return input ? input.setTarget(slot, 'key') : false; },
      holdStart: function () { return input ? input.holdStart() : false; },
      holdEnd: function () { return input ? input.holdEnd() : false; },
      throwAway: function () { return input ? input.throwAway() : false; },
      scramble: function () { return input ? input.scramble() : false; },
      /** Animate an externally resolved result (RTG.debug.forceResult): from READ it snaps the first option first. */
      playResult: function (res) {
        if (!res || typeof res.outcome !== 'string') return view;
        if (phase === 'SITUATION') startRead();
        if (phase === 'READ') {
          var s = null;
          try { s = opts.onPick && ctx.options && ctx.options.length ? opts.onPick(ctx.options[0].id, ctx.options[0]) : null; } catch (e) { s = null; }
          if (s && !s.run) startSnap(s, ctx.options[0]); else startSnap(s || { receivers: ctx.receivers, sackAt: 3 }, ctx.options && ctx.options[0]);
        }
        if (inPlay()) { thrown = true; tThrow = now(); teardownInput(); if (btnAway) btnAway.hidden = true; if (btnScr) btnScr.hidden = true; beginResolution(res, lastInput || { target: res.target, lead: 0, loft: 0.5 }); }
        return view;
      },
      skip: skip,
      resize: function () { cv.resize(); },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        clearTimers();
        teardownInput();
        if (unsubSettings) { unsubSettings(); unsubSettings = null; }
        stage.removeEventListener('pointerdown', onStagePointer);
        situationCard.removeEventListener('click', onSituationClick);
        root.removeEventListener('keydown', onKey);
        cue('crowdStop'); cue('heartbeatStop');
        cv.destroy();
        if (elRoot.parentNode) elRoot.parentNode.removeChild(elRoot);
        if (live === view) live = null;
      }
    };
    live = view;
    return view;
  };

  PlayView.current = function () { return live; };

  /**
   * §4.8: the moment screen is chromeless, so Escape is its route to Settings. The shell provides
   * RTG.UI.app.openSettings() (or passes onSettings to mount); without either the key is not handled.
   * @returns {boolean} true when the key was handled
   */
  PlayView.escapeToSettings = function (ev) {
    if (!ev || ev.key !== 'Escape' || ev.altKey || ev.ctrlKey || ev.metaKey) return false;
    var app = RTG.UI.app;
    if (app && typeof app.openSettings === 'function') { app.openSettings(); return true; }
    return false;
  };

  RTG.UI.PlayView = PlayView;
})(typeof window !== 'undefined' ? window : globalThis);
