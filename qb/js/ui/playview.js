/**
 * Road to Glory: QB — RTG.UI.PlayView (the QB moment scene, v2 "DRAW THE PASS"; modelled on kicker/js/ui/kickview.js)
 *
 *   var view = RTG.UI.PlayView.mount(container, {
 *     ctx,                          PlayContext (Play.buildContext): situation, shown look, options, alignment …
 *     settings, store?,             the shell settings (reducedMotion, colorblind, highContrast, leftHanded, keys, aimAssist, audio)
 *     onPick(playId, option) → PlaySim   the shell calls Play.snap (a run card returns the resolved sim: run true)
 *     makeLive(sim) → Live          the shell calls Play.live(sim, rng) (the rng stays in the shell)
 *     onDone(result),               fired after the result beat (a run card's result is its sim)
 *     onResult?(result),            fired when the banner appears
 *     onSettings?(),                Escape from the chromeless scene; RTG.UI.app.openSettings is the fallback
 *     reduced?: bool, tints?: {home:[a,b], opp:[a,b]}, uiRng?, rng? (only when makeLive is missing: Play.live(sim, rng))
 *   }) → { el, canvas, cv, destroy(), phase(), skip(), layout(), resize(), ctx(), sim(), live(), result(), pick(idx | playId),
 *          timeScale(), drawing(), fieldToCss(x, y) → {x, y}, cssToField(px, py) → {x, y}, commitPass(points, loft),
 *          commitRun(points), throwAway(), project(x, y) → {x, y, s}, current(), actors(), read(), playResult(result) }
 *   PlayView.current() → the live view (null after destroy).
 *
 * THE CORE RULE: the engine owns every position. From the snap the scene calls live.step(realDt × timeScale) once a
 * frame and draws exactly what the live says (22 players and the ball in field yards); nothing here computes where a
 * player is — only sprite anchors and the offence's slide into the formation before t starts (alignMs, from the READ
 * picture to the live's t = 0 spots). After the whistle the scene keeps stepping the live, which coasts (everyone slows
 * down, an interceptor runs it back, a tipped ball pops and falls) under the banner. The gap you thread on screen is
 * the gap the engine checks.
 *
 * Phases (.playview[data-phase]): SITUATION (a DOM card over the dimmed field; TAP TO READ) → READ (the canvas draws
 * ctx.alignment — the SHOWN look; the play cards; tap one → onPick) → PLAY (the live runs; draw from the QB) | RUN (a
 * run card's beat: SNEAK / DRAW, resolved at the snap) → RESULT (banner, feedback: placement · timing · touch, the
 * coach, the crowd) → DONE (onDone). The live's own phase is mirrored on .playview[data-live] (PRE_THROW |
 * BALL_IN_AIR | AFTER_CATCH | SCRAMBLE | DONE) and the draft on [data-draft] (PASS | RUN | THROWAWAY | INVALID | '').
 *
 * DRAWING (RTG.UI.PlayInput): a press within Tuning.qb.draw.startR of the quarterback (css px at his depth, ≥ 22 px)
 * starts a draft; while it lasts the play runs at Tuning.qb.draw.slowMo (until slowMoBudgetS of real time per play is
 * spent — then 1.0 and the SLOW-MO chip says OUT); every frame (never per pointermove) the draft is classified by
 * live.classify(points, loft) and drawn: PASS = gold dots, thin for a bullet, fat in the middle for a lob, the landing
 * marker coloured by the preview when previewShown, the target bracketed; RUN = chalk footprints; THROWAWAY = grey
 * dots out of bounds; the part past the arm (tooLong) in red; INVALID = nothing. The release commits: PASS →
 * live.throwAlong, THROWAWAY → live.throwAway, RUN → live.setRun (the QB runs it; draw again for another run or the
 * pass). Aim assist (settings.aimAssist, default on): a PASS line's end within Tuning.qb.draw.assistYd of the spot the
 * target can reach snaps onto it (the magnet tick) — only when the snapped line still classifies as a PASS to him.
 *
 * Camera: fixed behind and above the quarterback. project(xYd, yYd) puts the line of scrimmage at 0.73 × H, the
 * horizon at 0.26 × H, 50 yards of depth in view (the longest arm's line stays on screen) and 53⅓ yards across the
 * width at the line, narrowing with depth; cssToField is its exact inverse on the field (u in [−0.3, 1]). The stands
 * above the horizon are the kicker's venues in miniature, pre-rendered per layout into three crowd frames; the field
 * with its yard lines, hashes, numbers and the end zone is pre-rendered per layout + yard line. Per frame: two
 * drawImages of those layers, ≤ 30 sprites and the draft's dots. No per-frame text on the canvas (the HUD is DOM), no
 * allocations in the loop (the draft lives in pooled buffers; classify runs at most once a frame).
 *
 * Also exported: PlayView.TIMING, PlayView.FIELD, PlayView.VENUES, PlayView.OUTCOME_TEXT, PlayView.hudParts(ctx),
 * PlayView.venueOf(ctx), PlayView.current(), PlayView.escapeToSettings(ev).
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var doc = root.document;
  var PlayView = {};
  var current = null;

  var TIMING = {
    alignMs: 420,                        // the offence slides from the READ picture into the play's formation before t starts (0 reduced)
    throwPoseS: 0.3, catchPoseS: 0.35,   // sim s: the QB's throw frame after the release · a receiver's catch frame
    doneHoldMs: 650, doneHoldReducedMs: 150,   // the live is DONE: the last beat reads this long before the banner
    tipMs: 480, sackShakeMs: 380,         // the tip's star shows for 0.4 × tipMs · the sack's shake decays over this
    runMs: 720, runPerYdMs: 25, runMaxExtraMs: 600,   // a run card's beat (SNEAK / DRAW)
    resultMs: 1200, resultReducedMs: 400, skipAfterMs: 300, bannerFadeMs: 300, subBannerMs: 1400,
    crowdIdleMs: 700, crowdCheerMs: 180, runFrameMs: 110, hintMs: 1600, firstHintMs: 3600,
    fastForwardS: 0.25, fastForwardMax: 80,    // skip after the release: step the live in these chunks until DONE
    armMs: 200,                          // a phase ignores a confirm key / a field tap this long after it mounts (a double tap on NEXT)
    pausePollMs: 100                     // a beat's timer re-arms in these steps while a modal is open (the play freezes under Settings)
  };
  PlayView.TIMING = TIMING;

  /** The camera / presentation geometry (nothing here reaches the engine). */
  var FIELD = {
    widthYd: 53.33, depthYd: 50, losFrac: 0.73, horizonFrac: 0.26, farScale: 0.36, k: 1.2, kv: 0.8, uMin: -0.3,
    hashNfl: 3.083, hashCollege: 6.667, numbersIn: 8.5,
    ringW: 12, ringMinW: 6, ringOpen: 0.6, ringTight: 0.25,  // ring thresholds on live.receivers[i].open (Tuning.qb.open.ring {open, closing} wins)
    startMinCss: 22,                     // the QB's start radius never under this many css px
    qbRefYd: -4,                         // the QB sprite is 1:1 at this depth and behind it, scaled with depth past it
    qbBodyVpx: 10,                       // the start radius is measured from the QB's feet up to his chest (virtual px)
    passDotPx: 3, awayDotPx: 2, footYd: 1.1, footSide: 0.4,   // a run line's chalk prints: every footYd, a step either side
    rushRange: 8,                        // RUSH meter: a rusher this far (yd past tackleR) reads 0 %, at tackleR 100 % …
    rushHeld: 0.5,                       // … × this while he is still blocked (t < beatAt; Tuning.qb.field.heldPressure wins)
    moveEps: 0.25                        // (yd/s)² — slower than this a sprite stands
  };
  PlayView.FIELD = FIELD;

  /** The READ picture's fallback when a context carries no ctx.alignment (an older engine): the v1 LOOK table. */
  var LOOK = {
    dlX: [-4.5, -1.5, 1.5, 4.5], dlY: 1, lbY: 4.5, lbX: { 1: [0], 2: [-3, 3], 3: [-4, 0, 4] }, blitzY: 1.5,
    cbPressY: 1.5, cbOffY: 7, cbShade: 1, nickelY: 5, nickelPressY: 2, safeties2: [[-9, 12], [9, 12]], safeties1: [[0, 13]]
  };
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
  function TQ() { return (RTG.Tuning && RTG.Tuning.qb) || {}; }
  function TF() { return TQ().field || {}; }
  function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function num(v, d) { return typeof v === 'number' && v === v && v !== Infinity && v !== -Infinity ? v : d; }
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
  /** A kit modal (Settings) is open: the scene freezes the play and takes no input. */
  function paused() { var c = C(); return !!(c && typeof c.modalOpen === 'function' && c.modalOpen()); }
  function icon(name, size) { var c = C(); return c && c.icon ? c.icon(name, size) : doc.createTextNode(''); }
  function coarsePointerNow() {
    try { return !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches); } catch (e) { return false; }
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
  function copyPts(arr) {
    var out = [];
    if (!arr) return out;
    for (var i = 0; i < arr.length; i++) if (arr[i]) out.push({ x: Math.round(num(arr[i].x, 0) * 1000) / 1000, y: Math.round(num(arr[i].y, 0) * 1000) / 1000 });
    return out;
  }

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
    var qbInfo = ctx.qb || sit.qb || {};
    var attrs = qbInfo.attrs || {};
    var ARM = num(attrs.ARM, 50);

    function liveSettings() { return (store && store.settings) || settings || {}; }

    // ── DOM ──
    var elRoot = el('div', { class: 'playview', 'data-phase': 'SITUATION', 'data-live': '', 'data-draft': '', 'data-can-draw': '0' });
    var hud = el('div', { class: 'pv-hud', role: 'group', 'aria-label': 'Situation' });
    var stage = el('div', { class: 'pv-stage' });
    var overlay = el('div', { class: 'pv-overlay', 'aria-hidden': 'true' });
    var banner = el('div', { class: 'pv-banner', hidden: true });
    var subBanner = el('div', { class: 'pv-sub', hidden: true });
    var toastLine = el('div', { class: 'pv-toast', hidden: true });
    var skipHint = el('div', { class: 'pv-skip', text: 'TAP TO SKIP', hidden: true });
    // the draw HUD over the field: the SLOW-MO chip + its budget bar, the draft chip
    var drawHud = el('div', { class: 'pv-drawhud', hidden: true });
    var slowEl = el('div', { class: 'pv-slowmo', role: 'meter', 'aria-label': 'Slow motion left', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '100', 'data-active': '0', hidden: true });
    var slowLabel = el('span', { class: 'pv-slowmo-label', text: 'SLOW-MO' });
    var slowFill = el('span', { class: 'pv-slowmo-fill' });
    slowEl.appendChild(slowLabel); slowEl.appendChild(el('span', { class: 'pv-slowmo-track', 'aria-hidden': 'true' }, slowFill));
    var draftChip = el('div', { class: 'pv-draft', 'data-kind': '', hidden: true });
    drawHud.appendChild(slowEl); drawHud.appendChild(draftChip);
    var situationCard = el('div', { class: 'pv-situation', role: 'group', 'aria-label': 'The situation' });
    var panel = el('div', { class: 'pv-panel' });
    var lookLine = el('div', { class: 'pv-look', role: 'status', hidden: true });
    var cards = el('div', { class: 'pv-cards', role: 'group', 'aria-label': 'Pick a play', hidden: true });
    var drawBox = el('div', { class: 'pv-drawbox', hidden: true });
    var feedback = el('div', { class: 'pv-feedback', hidden: true });
    overlay.appendChild(drawHud); overlay.appendChild(subBanner); overlay.appendChild(banner); overlay.appendChild(toastLine); overlay.appendChild(skipHint);
    stage.appendChild(overlay); stage.appendChild(situationCard);
    panel.appendChild(lookLine); panel.appendChild(cards); panel.appendChild(drawBox); panel.appendChild(feedback);
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
    var look = (qbInfo.look) || (store && store.state && store.state.player && store.state.player.look) || null;

    // ── sprites ──
    var qbSpr = [Sp.get('qb_back0', { tint: teamTint, look: look }), Sp.get('qb_back1', { tint: teamTint, look: look }), Sp.get('qb_back2', { tint: teamTint, look: look })];
    var recSpr = [Sp.get('receiver_run0', { tint: teamTint }), Sp.get('receiver_run1', { tint: teamTint }), Sp.get('receiver_catch', { tint: teamTint })];
    var defSpr = [Sp.get('defender_run0', { tint: oppTint }), Sp.get('defender_run1', { tint: oppTint }), Sp.get('defender_set', { tint: oppTint })];
    var rusherSpr = [Sp.get('rusher', { tint: oppTint }), Sp.get('defender_run1', { tint: oppTint })];
    var olSpr = Sp.get('lineman_block', { tint: teamTint });
    var balls = { 2: Sp.get('ball_2'), 3: Sp.get('ball_3'), 5: Sp.get('ball_5'), 8: Sp.get('ball_8') };
    var spinSpr = [Sp.get('ball_spin0'), Sp.get('ball_spin1')], tipStar = Sp.get('tip_star');
    var rings = {}, marks = {};
    /** The palette-tinted tiles (re-read on every arm and on a settings change, so a palette toggled mid-moment shows at once). */
    function loadTinted() {
      rings.open = Sp.get('ring_open', { tint: [pal('mint'), pal('mint')] }); rings.tight = Sp.get('ring_closing', { tint: [pal('gold'), pal('gold')] });
      rings.covered = Sp.get('ring_closed', { tint: [pal('red'), pal('red')] });
      marks.pass = Sp.get('land_x', { tint: [pal('gold'), pal('gold')] }); marks.away = Sp.get('land_x', { tint: [pal('grey'), pal('grey')] });
      marks.chalk = Sp.get('land_x', { tint: [pal('chalk'), pal('chalk')] }); marks.tick = Sp.get('aim_tick', { tint: [pal('chalk'), pal('chalk')] });
      marks.red = Sp.get('land_x', { tint: [pal('red'), pal('red')] });
    }
    loadTinted();
    var pickSpr = Sp.get('target_pick'), hotSpr = Sp.get('hot_flag');
    var rainSpr = Sp.get('rain'), snowSpr = Sp.get('snow');

    // ── scene state ──
    var L = {};
    var phase = 'SITUATION', tPhase = 0;
    var sim = null, lv = null, result = null, pickedId = null, pickedOpt = null, frozen = false;
    var input = null, evIdx = 0, livePhase = '', draftAttr = '';
    var alignMs = 0, alignU = 1, tAlign0 = 0;
    var slowUsed = 0, slowBudget = 4, curScale = 1, lastSlowPct = -1, slowOut = false;
    var cls = null, dkind = '', clsAssist = false, dispArr = null, dispN = 0, firstHintShown = false;
    var releaseReal = 0, releaseT = -1, doneAt = 0, resultAt = 0, tipReal = 0, catchT = -1, catchSlot = -1;
    var shakeAmp = 0, camX = 0, camY = 0, flashAlpha = 0, flashColor = null;
    var crowdFrame = 0, crowdAt = 0, crowdMode = 'idle';
    var stadium = null, fieldLayer = null, posts = null, slowBands = false;
    var destroyed = false, timers = [];
    var venue = venueOf(ctx);
    var clutch = !!(ctx.clutch || (ctx.pressure && ctx.pressure.clutch) || sit.clutch);
    var pressure = clamp(num(sit.pressure, num(ctx.pressureLevel, clutch ? 0.7 : 0.35)), 0, 1);
    if (pressure >= 0.6) clutch = true;
    var particles = null, pCount = 0, pKind = null, pSeed = 1;
    var lastAria = '';
    var hudPressureFill = null, hudPressureVal = -1, hintEl = null, keysEl = null, btnAway = null, playChip = null, clockChip = null, clockShown = -1, unsubSettings = null;
    var runYards = 0, runFrom = 0, runActor = -1, runX = 0, runT0 = 0;

    // actors: 0..10 defenders · 11..15 receivers · 16..20 O-line · 21 QB
    var NDEF = 11, NREC = 5, NOL = 5, NACT = 22, IREC = 11, IOL = 16, IQB = 21;
    var aX = new Float64Array(NACT), aY = new Float64Array(NACT), aSX = new Float64Array(NACT), aSY = new Float64Array(NACT), aS = new Float64Array(NACT);
    var fromX = new Float64Array(NACT), fromY = new Float64Array(NACT), baseX = new Float64Array(NACT), baseY = new Float64Array(NACT);
    var aFrame = new Int8Array(NACT), aShow = new Int8Array(NACT), order = new Int16Array(NACT);
    var recSlot = [], defId = [], defPos = [], recCount = 0, defCount = 0, olCount = 0;
    var recIdx = {}, defIdx = {};                         // slot → receiver index · defender id → actor index (built at the snap)
    var carrier = -1;                                     // −1 nobody / in the air · −2 the QB · 0..4 a receiver · −3 − j defender j
    var hotSlot = -1, qbFace = 1;
    var pt = { x: 0, y: 0, s: 1 }, pt2 = { x: 0, y: 0, s: 1 }, fpt = { x: 0, y: 0 };
    var ringOpen = FIELD.ringOpen, ringTight = FIELD.ringTight;
    // the committed run (field yd), drawn ahead of the QB as faint footprints while he runs it
    var RUNMAX = 256, runBufX = new Float64Array(RUNMAX), runBufY = new Float64Array(RUNMAX), runBufN = 0, runBufI = 0;
    // aim assist: the snapped copy of the draft (pooled)
    var AMAX = 256, assistPool = [], assistArr = [];
    for (var ai = 0; ai < AMAX; ai++) assistPool.push({ x: 0, y: 0 });
    // canvas rect cache for the css ↔ field mapping during a stroke
    var rectL = 0, rectT = 0;

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
    function setLiveAttr(p) { if (p !== livePhase) { livePhase = p; elRoot.setAttribute('data-live', p); } }
    var canDrawAttr = '0';
    function setCanDrawAttr(v) { if (v !== canDrawAttr) { canDrawAttr = v; elRoot.setAttribute('data-can-draw', v); } }
    function setDraftAttr(k) { if (k !== draftAttr) { draftAttr = k; elRoot.setAttribute('data-draft', k); } }

    // ───────────────────────────── the camera ─────────────────────────────
    function relayout() {
      var W = cv.w, H = cv.h, land = cv.landscape;
      L.W = W; L.H = H; L.land = land;
      L.yHor = Math.round(H * FIELD.horizonFrac);
      L.yLOS = Math.round(H * FIELD.losFrac);
      L.xC = Math.round(W / 2);
      L.pxPerYd = W / FIELD.widthYd;
      L.kv = FIELD.kv;
      L.hashYd = venue === 'NFL' ? FIELD.hashNfl : FIELD.hashCollege;
      // the ball sits on a hash: the field's centre is offset from the camera (the engine's sidelines win once it has them)
      var fd = (sim && sim.field) || ctx.field || null;
      L.hashShift = fd && typeof fd.sideL === 'number' && typeof fd.sideR === 'number' ? (fd.sideL + fd.sideR) / 2 : -clamp(num(ctx.hash, 0), -1, 1) * L.hashYd;
      L.yl = num(sit.yl, 50);
      L.goalD = 100 - L.yl;                       // yards from the line to the goal line
      L.endZone = L.goalD <= FIELD.depthYd;
      L.qbRefS = project(0, FIELD.qbRefYd).s;     // the depth scale at which the QB sprite is drawn 1:1
      buildStadium();
      buildField();
      buildPosts();
    }
    /** Field yards (x lateral from the ball, y downfield from the line) → virtual px + sprite scale (shared object). */
    function project(xYd, yYd, out) {
      out = out || pt;
      var u = yYd / FIELD.depthYd;
      if (u < FIELD.uMin) u = FIELD.uMin; else if (u > 1) u = 1;
      var p = u * (1 + FIELD.k) / (1 + FIELD.k * u);
      var s = 1 - p * (1 - FIELD.farScale);
      out.x = L.xC + xYd * L.pxPerYd * s;
      out.y = L.yLOS - (L.yLOS - L.yHor) * p;
      out.s = s;
      return out;
    }
    /** Virtual px → field yards: the exact inverse of project inside u ∈ [uMin, 1] (above the horizon reads as the deepest yard). */
    function unproject(vx, vy, out) {
      var pMin = FIELD.uMin * (1 + FIELD.k) / (1 + FIELD.k * FIELD.uMin);
      var p = (L.yLOS - vy) / (L.yLOS - L.yHor);
      if (p > 1) p = 1; else if (p < pMin) p = pMin;
      var u = p / (1 + FIELD.k - FIELD.k * p);
      var s = 1 - p * (1 - FIELD.farScale);
      out.x = (vx - L.xC) / (L.pxPerYd * s);
      out.y = u * FIELD.depthYd;
      return out;
    }
    function refreshRect() { var r = canvas.getBoundingClientRect(); rectL = r.left; rectT = r.top; }
    /** Client (css px) → field yards, with the rect cached at the stroke's start (pointer samples). */
    function cssToFieldCached(px, py, out) { var s = cv.scale || 1; return unproject((px - rectL) / s, (py - rectT) / s, out); }
    function fieldToCss(x, y) { refreshRect(); project(num(x, 0), num(y, 0)); var s = cv.scale || 1; return { x: rectL + pt.x * s, y: rectT + pt.y * s }; }
    function cssToField(px, py) { refreshRect(); cssToFieldCached(num(px, 0), num(py, 0), fpt); return { x: fpt.x, y: fpt.y }; }

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
      var k0 = Math.floor((yl - 12) / 5), k1 = Math.ceil((yl + FIELD.depthYd) / 5), k, A, y1, y2;
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
      for (A = Math.max(1, Math.floor(yl - 10)); A < Math.min(100, yl + FIELD.depthYd); A++) {
        if (A % 5 === 0) continue;
        project(L.hashShift - L.hashYd, A - yl); f.fillRect(Math.round(pt.x), Math.round(pt.y), 1, 1);
        project(L.hashShift + L.hashYd, A - yl); f.fillRect(Math.round(pt.x), Math.round(pt.y), 1, 1);
      }
      f.globalAlpha = 1;
      // the numbers at the tens (both sides), scaled with depth
      var numX = FIELD.widthYd / 2 - FIELD.numbersIn;
      for (A = 10; A <= 90; A += 10) {
        var dd = A - yl;
        if (dd < -9 || dd > FIELD.depthYd) continue;
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
      var homeS = sit.away ? them : us, guest = sit.away ? us : them;
      return { home: homeS, guest: guest, text: labelHome + ' ' + homeS + '  ' + labelGuest + ' ' + guest };
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
      var k = curScale;                                        // the weather slows down with the play
      for (var i = 0; i < pCount; i++) {
        particles[i * 4] += particles[i * 4 + 2] * dt * k;
        particles[i * 4 + 1] += particles[i * 4 + 3] * dt * k;
        if (particles[i * 4 + 1] > L.H || particles[i * 4] < -4 || particles[i * 4] > L.W + 4) seedParticle(i, false);
      }
    }

    // ───────────────────────────── the READ picture (ctx.alignment) ─────────────────────────────
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
    function shownId() { var r = ctx.shown; return typeof r === 'string' ? r : (r && r.id) || ''; }
    function coverageNameOf(id) { var D = RTG.Data && RTG.Data.plays && RTG.Data.plays.coverages; var c = D && D[id]; return (c && c.name) || String(id); }
    /** ctx.alignment, or (an engine without it) the v1 LOOK table's picture of the shown look. */
    function alignmentOf() {
      var a = ctx.alignment;
      if (a && a.defenders && a.defenders.length && a.receivers && a.receivers.length) return a;
      var lk = lookOf(), recs = [], defs = [], id = 0, i;
      var list = ctx.receivers || [];
      for (i = 0; i < list.length && i < NREC; i++) {
        var r = list[i], slot = r.slot || SLOT_ORDER[i], d = ALIGN[slot] || [0, 0];
        recs.push({ slot: slot, x: num(r.x0, num(r.x, d[0])), y: num(r.y0, d[1]) });
      }
      function add(pos, x, y) { defs.push({ id: 'D' + (id++), pos: pos, x: x, y: y }); }
      for (i = 0; i < 4; i++) add('DL', LOOK.dlX[i], LOOK.dlY);
      var nLB = clamp(num(lk.box, 7) - 4, 1, 3), lbx = LOOK.lbX[nLB];
      for (i = 0; i < nLB; i++) { var creep = lk.showBlitz && i === (nLB >> 1); add('LB', creep ? (lbx[i] < 0 ? -1 : 1) : lbx[i], creep ? LOOK.blitzY : LOOK.lbY); }
      var minX = 0, maxX = 0;
      for (i = 0; i < recs.length; i++) { if (recs[i].x < minX) minX = recs[i].x; if (recs[i].x > maxX) maxX = recs[i].x; }
      add('CB', (minX || -22) + LOOK.cbShade, lk.press ? LOOK.cbPressY : LOOK.cbOffY);
      add('CB', (maxX || 22) - LOOK.cbShade, lk.press ? LOOK.cbPressY : LOOK.cbOffY);
      var S = clamp(num(lk.safeties, 2), 1, 2), nN = Math.max(0, 7 - S - 2 - nLB);
      for (i = 0; i < nN; i++) add('NB', i === 0 ? 10 : -10, lk.press ? LOOK.nickelPressY : LOOK.nickelY);
      var sp = S === 2 ? LOOK.safeties2 : LOOK.safeties1;
      for (i = 0; i < S; i++) add('S', sp[i][0], sp[i][1]);
      while (defs.length < NDEF) add('S', 0, 9);
      return { qb: { x: 0, y: -5 }, receivers: recs, linemen: [{ x: -4, y: -1 }, { x: -2, y: -1 }, { x: 0, y: -1 }, { x: 2, y: -1 }, { x: 4, y: -1 }], defenders: defs };
    }
    /** Place the READ picture (static until the snap). */
    function placeAlignment() {
      var a = alignmentOf(), i;
      recCount = Math.min(NREC, a.receivers.length); defCount = Math.min(NDEF, a.defenders.length); olCount = Math.min(NOL, (a.linemen || []).length);
      for (i = 0; i < NACT; i++) { aShow[i] = 0; aFrame[i] = 0; }
      for (i = 0; i < defCount; i++) { var d = a.defenders[i]; aX[i] = num(d.x, 0); aY[i] = num(d.y, 1); aShow[i] = 1; aFrame[i] = 2; defId[i] = String(d.id); defPos[i] = String(d.pos || ''); }
      for (i = 0; i < recCount; i++) { var r = a.receivers[i]; aX[IREC + i] = num(r.x, 0); aY[IREC + i] = num(r.y, 0); aShow[IREC + i] = 1; recSlot[i] = r.slot || SLOT_ORDER[i]; }
      for (i = 0; i < olCount; i++) { var o = a.linemen[i]; aX[IOL + i] = num(o.x, 0); aY[IOL + i] = num(o.y, -1); aShow[IOL + i] = 1; }
      var q = a.qb || { x: 0, y: -5 };
      aX[IQB] = num(q.x, 0); aY[IQB] = num(q.y, -5); aShow[IQB] = 1; aFrame[IQB] = 0;
      carrier = -2;
    }

    // ───────────────────────────── the live → the actors ─────────────────────────────
    /** At the snap: index the live's receivers / defenders and remember where the READ picture had them (the slide). */
    function bindLive() {
      var i, j;
      for (i = 0; i < NACT; i++) { fromX[i] = aX[i]; fromY[i] = aY[i]; }
      var fromBySlot = {}, fromById = {};
      for (i = 0; i < recCount; i++) fromBySlot[recSlot[i]] = i;
      for (j = 0; j < defCount; j++) fromById[defId[j]] = j;
      var fx = [], fy = [];
      for (i = 0; i < NACT; i++) { fx.push(fromX[i]); fy.push(fromY[i]); }
      recIdx = {}; defIdx = {};
      recCount = Math.min(NREC, lv.receivers.length);
      for (i = 0; i < recCount; i++) {
        var r = lv.receivers[i]; recSlot[i] = r.slot || SLOT_ORDER[i]; recIdx[recSlot[i]] = i; aShow[IREC + i] = 1;
        var fi = fromBySlot[recSlot[i]];
        if (fi !== undefined) { fromX[IREC + i] = fx[IREC + fi]; fromY[IREC + i] = fy[IREC + fi]; } else { fromX[IREC + i] = num(r.x, 0); fromY[IREC + i] = num(r.y, 0); }
      }
      for (i = recCount; i < NREC; i++) aShow[IREC + i] = 0;
      defCount = Math.min(NDEF, lv.defenders.length);
      for (j = 0; j < defCount; j++) {
        var d = lv.defenders[j]; defId[j] = String(d.id); defPos[j] = String(d.pos || ''); defIdx[defId[j]] = j; aShow[j] = 1;
        var fj = fromById[defId[j]];
        if (fj !== undefined) { fromX[j] = fx[fj]; fromY[j] = fy[fj]; } else { fromX[j] = num(d.x, 0); fromY[j] = num(d.y, 1); }
      }
      for (j = defCount; j < NDEF; j++) aShow[j] = 0;
      olCount = Math.min(NOL, (lv.linemen || []).length);
      for (j = 0; j < NOL; j++) aShow[IOL + j] = j < olCount ? 1 : 0;
      hotSlot = sim && sim.hot ? (recIdx[sim.hot] !== undefined ? recIdx[sim.hot] : -1) : -1;
    }
    function moving(vx, vy) { return num(vx, 0) * num(vx, 0) + num(vy, 0) * num(vy, 0) > FIELD.moveEps; }
    /** Copy the live's positions into the actor arrays (every frame; no allocation), blended from the READ picture during the slide. */
    function readLive() {
      var i, t = num(lv.t, 0), step = (Math.floor(t * 1000 / TIMING.runFrameMs) & 1);
      var q = lv.qb;
      aX[IQB] = num(q.x, 0); aY[IQB] = num(q.y, -5);
      for (i = 0; i < recCount; i++) {
        var r = lv.receivers[i];
        aX[IREC + i] = num(r.x, 0); aY[IREC + i] = num(r.y, 0);
        aFrame[IREC + i] = catchSlot === i && catchT >= 0 && t - catchT < TIMING.catchPoseS ? 2 : (moving(r.vx, r.vy) ? step : 0);
      }
      for (i = 0; i < defCount; i++) {
        var d = lv.defenders[i];
        aX[i] = num(d.x, 0); aY[i] = num(d.y, 1);
        aFrame[i] = t < 0.05 ? 2 : (moving(d.vx, d.vy) ? step : 2);
      }
      for (i = 0; i < olCount; i++) { var o = lv.linemen[i]; aX[IOL + i] = num(o.x, 0); aY[IOL + i] = num(o.y, -1); }
      if (alignU < 1) {
        var e = ease(alignU);
        for (i = 0; i < NACT; i++) if (aShow[i]) { aX[i] = lerp(fromX[i], aX[i], e); aY[i] = lerp(fromY[i], aY[i], e); }
      }
      // who has the ball
      var c = lv.carrier;
      if (c === 'QB') carrier = -2;
      else if (c === null || c === undefined || c === '') carrier = -1;
      else if (recIdx[c] !== undefined) carrier = recIdx[c];
      else if (defIdx[c] !== undefined) carrier = -3 - defIdx[c];
      else carrier = -1;
      if (lv.ball && !lv.ball.caught && lv.phase === 'BALL_IN_AIR') carrier = -1;
      if (q.hasBall) carrier = -2;
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
    /** The sim's route position of receiver i at play time t (the engine's receivers run their sim paths) → out. */
    function routeAt(i, t, out) {
      var rs = sim && sim.receivers, r = rs && rs[i], p = r && r.path;
      if (!p || !p.length) { out.x = aX[IREC + i]; out.y = aY[IREC + i]; return out; }
      var n = p.length;
      if (t <= p[0].t) { out.x = p[0].x; out.y = p[0].y; return clampRoute(r, out); }
      for (var k = 1; k < n; k++) if (t <= p[k].t) {
        var a = p[k - 1], b = p[k], u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
        out.x = a.x + (b.x - a.x) * u; out.y = a.y + (b.y - a.y) * u; return clampRoute(r, out);
      }
      var l = p[n - 1], m = n > 1 ? p[n - 2] : l, dt = l.t - m.t;
      if (dt <= 0) { out.x = l.x; out.y = l.y; return clampRoute(r, out); }
      var over = (t - l.t) / dt;
      out.x = l.x + (l.x - m.x) * over; out.y = Math.min(num(r.capY, Infinity), l.y + (l.y - m.y) * over);
      return clampRoute(r, out);
    }
    /** The engine's pathInto holds x inside [xMin, xMax] and y under capY. */
    function clampRoute(r, out) {
      out.x = clamp(out.x, num(r.xMin, -Infinity), num(r.xMax, Infinity));
      out.y = Math.min(num(r.capY, Infinity), out.y);
      return out;
    }
    /**
     * The ball's flight (s) over `len` yards at `loft` — for the aim assist on a BENT line only (a straight line asks
     * live.aim). RTG.Field.ballSpeed(attrs, loft) when the engine has it; else Tuning.qb.field.ballSpeed {base, perArm,
     * loftSlow}: (base + perArm × ARM/99) × (1 − loftSlow × loft) yd/s. Every spot is re-checked with live.classify.
     */
    function flightEst(len, loftV) {
      var Fd = RTG.Field;
      if (Fd && typeof Fd.ballSpeed === 'function') { var bs = num(Fd.ballSpeed(attrs, loftV), 0); if (bs > 0) return len / bs; }
      var B = TF().ballSpeed || {};
      var v = (num(B.base, 21) + num(B.perArm, 10) * ARM / 99) * (1 - num(B.loftSlow, 0.48) * clamp(loftV, 0, 1));
      return len / Math.max(4, v);
    }
    /** Where receiver i and a ball of `loftV` thrown from the QB now over a line of `stretch` × the straight distance meet (fixed point) → out. */
    function meetSpot(i, loftV, stretch, out) {
      var t = num(lv.t, 0), qx = num(lv.qb.x, 0), qy = num(lv.qb.y, 0);
      out.x = aX[IREC + i]; out.y = aY[IREC + i];
      for (var k = 0; k < 6; k++) {
        var dx = out.x - qx, dy = out.y - qy;
        routeAt(i, t + flightEst(Math.sqrt(dx * dx + dy * dy) * stretch, loftV), out);
      }
      return out;
    }
    function nearestSideline(x) { var sL = sim && sim.field ? num(sim.field.sideL, -26.7) : L.hashShift - FIELD.widthYd / 2, sR = sim && sim.field ? num(sim.field.sideR, 26.7) : L.hashShift + FIELD.widthYd / 2; return x - sL < sR - x ? sL : sR; }

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
      var pm = el('div', { class: 'pv-pressure' + (clutch ? ' clutch' : ''), role: 'meter', 'aria-label': 'Rush', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' });
      pm.appendChild(el('span', { class: 'pv-pressure-label', text: 'RUSH' }));
      hudPressureFill = el('span', { class: 'pv-pressure-fill' });
      pm.appendChild(el('span', { class: 'pv-pressure-track', 'aria-hidden': 'true' }, hudPressureFill));
      right.appendChild(pm);
      hud.appendChild(right);
      hudPressureVal = -1;
      setPressure(0);
    }
    /** The HUD clock during a two-minute snap: the situation's clock minus the play time (whole seconds; DOM text only when it changes). */
    function runClock(t) {
      if (!clockChip || !sit.twoMinute) return;
      var left = Math.max(0, Math.round(num(sit.clock, 0)) - Math.floor(t));
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
    /** RUSH: the nearest unblocked rusher's closeness (sim.rushers' beatAt holds a blocked man under rushHeldCap). */
    function rushLevel() {
      if (typeof lv.pressure === 'number' && lv.pressure === lv.pressure) return clamp(lv.pressure, 0, 1);   // the engine's own (the throw's scatter reads the same)
      var q = lv.qb, t = num(lv.t, 0), best = 0, tackleR = num(TF().tackleR, 1), i, v, d, dx, dy;
      var rs = sim && sim.rushers;
      var useList = rs && rs.length && rs[0] && rs[0].defId !== undefined;
      for (i = 0; i < defCount; i++) {
        var df = lv.defenders[i];
        var beatAt = -1;
        if (useList) {
          beatAt = -2;
          for (var k = 0; k < rs.length; k++) if (String(rs[k].defId) === defId[i]) { beatAt = num(rs[k].beatAt, 0); break; }
          if (beatAt === -2) continue;
        } else if (df.role !== 'RUSH') continue;
        dx = num(df.x, 0) - num(q.x, 0); dy = num(df.y, 0) - num(q.y, 0); d = Math.sqrt(dx * dx + dy * dy);
        v = clamp(1 - (d - tackleR) / FIELD.rushRange, 0, 1);
        if (beatAt > 0 && t < beatAt) v *= num(TF().heldPressure, FIELD.rushHeld);
        if (v > best) best = v;
      }
      return best;
    }
    function buildDrawBox() {
      while (drawBox.firstChild) drawBox.removeChild(drawBox.firstChild);
      hintEl = el('div', { class: 'pv-hint', role: 'status' });
      drawBox.appendChild(hintEl);
      keysEl = el('div', { class: 'pv-keys', text: keysLegend() });
      drawBox.appendChild(keysEl);
      var actions = el('div', { class: 'pv-actions' });
      btnAway = el('button', { class: 'btn btn-ghost btn-sm pv-btn-away', type: 'button', text: 'THROW AWAY', 'data-action': 'throwaway', hidden: true, onClick: function () { doThrowAway(); } });
      actions.appendChild(btnAway);
      drawBox.appendChild(actions);
    }
    function keyName(k) { return k === ' ' || k === 'Spacebar' || k === 'Space' ? 'SPACE' : String(k || '').replace('Arrow', '').toUpperCase(); }
    /** The keyboard legend from the live bindings (Settings ▸ KEYS remaps show here). */
    function keysLegend() {
      var K = Inp.resolveKeys(liveSettings().keys);
      return '1-5 AIM · ARROWS NUDGE · ' + keyName(K.bendLeft) + '/' + keyName(K.bendRight) + ' BEND · ' + keyName(K.loft) + ' LOFT · ' +
        keyName(K.confirmAlt) + '/' + keyName(K.confirm) + ' THROW · ' + keyName(K.run) + ' RUN · ' + keyName(K.throwAway) + ' AWAY · ' + keyName(K.cancel) + ' UNDO';
    }
    function setHint(text) { if (hintEl && hintEl.textContent !== (text || '')) { hintEl.textContent = text || ''; hintEl.hidden = !text; } }
    function playHint() { return coarsePointerNow() ? 'DRAW FROM THE QB — TO A RECEIVER TO PASS, INTO SPACE TO RUN' : 'DRAW FROM THE QB — TO A RECEIVER TO PASS, INTO SPACE TO RUN · OR 1-5'; }
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
    function showToast(text, ms) {
      toastLine.textContent = text; toastLine.hidden = false;
      setTimer(function () { toastLine.hidden = true; }, ms || TIMING.hintMs);
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
    /** The draw HUD: the SLOW-MO chip (active while drafting; OUT once the budget is spent) and the draft chip. */
    function setSlowHud(drafting) {
      var left = slowBudget > 0 ? clamp(1 - slowUsed / slowBudget, 0, 1) : 0;
      var pct = Math.round(left * 100);
      var active = drafting ? '1' : '0';
      if (slowEl.getAttribute('data-active') !== active) { slowEl.setAttribute('data-active', active); slowEl.hidden = !drafting; }
      if (pct !== lastSlowPct) {
        lastSlowPct = pct;
        slowFill.style.width = pct + '%';
        slowEl.setAttribute('aria-valuenow', String(pct));
      }
      var out = left <= 0;
      if (out !== slowOut) { slowOut = out; slowEl.classList.toggle('out', out); slowLabel.textContent = out ? 'SLOW-MO OUT' : 'SLOW-MO'; }
      var stageSlow = drafting && !out;
      if (stageSlow !== slowBands) { slowBands = stageSlow; stage.classList.toggle('is-slow', stageSlow); }
    }
    /** The draft chip: PASS → WR1 · BULLET · RUN · THROW AWAY · TOO LONG (DOM writes only when something changed; no per-frame strings). */
    var chipK = null, chipTarget = null, chipTouch = null, chipLong = false, chipPrev = null, chipAssist = false;
    function setDraftChip() {
      var k = cls ? dkind : '';
      var target = k === 'PASS' && cls.target ? cls.target : '';
      var touch = k === 'PASS' ? Inp.touchName(input ? input.loft() : 0.5) : '';
      var tooLong = !!(k === 'PASS' && cls.tooLong);
      var prev = k === 'PASS' && cls.previewShown && cls.preview ? cls.preview : '';
      if (k === chipK && target === chipTarget && touch === chipTouch && tooLong === chipLong && prev === chipPrev && clsAssist === chipAssist) return;
      chipK = k; chipTarget = target; chipTouch = touch; chipLong = tooLong; chipPrev = prev; chipAssist = clsAssist;
      var text = '';
      if (k === 'PASS') text = tooLong ? 'TOO LONG' : 'PASS → ' + (target || '?') + ' · ' + touch;
      else if (k === 'RUN') text = 'RUN';
      else if (k === 'THROWAWAY') text = 'THROW AWAY';
      draftChip.textContent = text;
      draftChip.hidden = !text;
      draftChip.setAttribute('data-kind', k || '');
      draftChip.setAttribute('data-target', target);
      draftChip.setAttribute('data-touch', touch);
      if (prev) draftChip.setAttribute('data-preview', String(prev)); else draftChip.removeAttribute('data-preview');
      draftChip.setAttribute('data-assist', clsAssist ? '1' : '0');
      draftChip.className = 'pv-draft pv-draft-' + (k ? k.toLowerCase() : 'none') + (tooLong ? ' too-long' : '') + (prev ? ' pv-preview-' + String(prev).toLowerCase() : '');
    }
    function setHidden(e, h) { if (e.hidden !== h) e.hidden = h; }

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
    function ctxReceiver(slot) {
      var list = ctx.receivers || [];
      for (var i = 0; i < list.length; i++) if ((list[i].slot || SLOT_ORDER[i]) === slot) return list[i];
      return null;
    }
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
      cards.hidden = true; lookLine.hidden = true; drawBox.hidden = true; feedback.hidden = true;
      setAria(situationLabel());
      announce(situationLabel());
    }
    function startRead() {
      if (destroyed || phase !== 'SITUATION') return;
      situationCard.hidden = true;
      setPhase('READ');
      buildLookLine();
      buildCards();
      drawBox.hidden = true; feedback.hidden = true;
      var lt = 'The defence shows ' + lookText() + (ctx.pressure && ctx.pressure.hot ? ' The pocket will be short.' : '') + ' Pick a play.';
      setAria(lt);
      announce(lt);
      if (ctx.options && ctx.options.length) setTimer(function () { var b = cards.querySelector('button'); if (b) { try { b.focus(); } catch (e) { /* ignore */ } } }, 0);
      showSub('READ THE LOOK', 'info', 900);
    }
    function makeLiveFor(s) {
      if (typeof opts.makeLive === 'function') return opts.makeLive(s);
      if (RTG.Play && typeof RTG.Play.live === 'function' && opts.rng) return RTG.Play.live(s, opts.rng);
      throw new Error('PlayView: no makeLive (the shell must pass makeLive(sim) → Play.live(sim, rng))');
    }
    function pick(idxOrId) {
      if (destroyed || phase !== 'READ') return false;
      var options = ctx.options || [], idx = -1;
      if (typeof idxOrId === 'number') idx = idxOrId;
      else for (var i = 0; i < options.length; i++) if (options[i].id === idxOrId) idx = i;
      if (idx < 0 || idx >= options.length) return false;
      var opt = options[idx];
      setCardsEnabled(false);
      var s = null, l = null;
      try { s = opts.onPick ? opts.onPick(opt.id, opt) : null; }
      catch (e) { if (root.console) root.console.error('PlayView onPick failed', e); }
      if (!s || typeof s !== 'object') { setCardsEnabled(true); return false; }
      pickedId = opt.id; pickedOpt = opt;
      cue('click');
      if (s.run) { startRunCard(s, opt); return true; }
      try { l = makeLiveFor(s); }
      catch (e2) { if (root.console) root.console.error('PlayView makeLive failed', e2); }
      if (!l || typeof l.step !== 'function' || !l.qb || !l.receivers || !l.defenders) { setCardsEnabled(true); return false; }
      startPlay(s, l, opt);
      return true;
    }
    function startPlay(s, l, opt) {
      sim = s; lv = l; result = null; frozen = false; evIdx = 0;
      slowUsed = 0; slowBudget = Inp.draw().slowMoBudgetS; curScale = 1; lastSlowPct = -1; slowOut = false;
      cls = null; clsAssist = false; dispArr = null; dispN = 0; chipK = null;
      releaseReal = 0; releaseT = -1; doneAt = 0; resultAt = 0; tipReal = 0; catchT = -1; catchSlot = -1; runBufN = 0; runBufI = 0;
      if (s.field && typeof s.field.sideL === 'number' && Math.abs((s.field.sideL + s.field.sideR) / 2 - L.hashShift) > 0.25) relayout();
      bindLive();
      alignMs = reduced ? 0 : TIMING.alignMs; alignU = alignMs ? 0 : 1; tAlign0 = now();
      readLive();
      cards.hidden = true; lookLine.hidden = true; subBanner.hidden = true; toastLine.hidden = true;
      buildDrawBox();
      drawBox.hidden = false;
      drawHud.hidden = false; draftChip.hidden = true; slowEl.hidden = true; slowEl.setAttribute('data-active', '0');
      if (playChip) { playChip.textContent = (opt && (opt.name || opt.id)) || ''; playChip.hidden = false; }
      setHint(playHint());
      keysEl.hidden = coarsePointerNow();
      setupInput();
      setPhase('PLAY');
      setLiveAttr(String(lv.phase || 'PRE_THROW')); setDraftAttr('');
      clockShown = -1;
      var shownNow = s && typeof s.shown === 'string' ? s.shown : shownId(), realNow = s && typeof s.real === 'string' ? s.real : (typeof ctx.real === 'string' ? ctx.real : '');
      if (shownNow && realNow && shownNow !== realNow) showSub('ROTATION · ' + coverageNameOf(realNow), 'clutch', alignMs + 1400);
      if (!firstHintShown && num(sit.idx, -1) === 0) { firstHintShown = true; showToast('DRAW FROM THE QB — TO A RECEIVER TO PASS, INTO SPACE TO RUN', TIMING.firstHintMs); }
      setAria('Snap. Draw from the quarterback: to a receiver to pass, into space to run.');
      cue('click'); cue('haptic', 15);
      try { canvas.focus({ preventScroll: true }); } catch (e) { try { canvas.focus(); } catch (e2) { /* ignore */ } }
    }

    // ── the draw input ──
    /** The QB's start radius in css px at his depth (Tuning.qb.draw.startR yd), never under startMinCss. */
    function startRadiusCss() {
      var s = cv.scale || 1, r = Inp.draw().startR * L.pxPerYd * aS[IQB] * s;
      return Math.max(FIELD.startMinCss, r);
    }
    /** A press counts when it is within the start radius of the QB's feet-to-chest segment (css px). */
    function qbHit(cx, cy) {
      refreshRect();
      var s = cv.scale || 1, fx = rectL + aSX[IQB] * s, fy = rectT + aSY[IQB] * s, top = fy - FIELD.qbBodyVpx * s;
      var y = cy < top ? top : (cy > fy ? fy : cy);
      var dx = cx - fx, dy = cy - y, r = startRadiusCss();
      return dx * dx + dy * dy <= r * r;
    }
    function canDraw() { return phase === 'PLAY' && !!lv && !frozen && alignU >= 1 && !paused() && !!lv.qb.hasBall && !lv.qb.down && lv.phase !== 'DONE'; }
    function canPass() { return canDraw() && lv.phase === 'PRE_THROW' && num(lv.qb.y, -1) < 0; }
    function setupInput() {
      teardownInput();
      input = Inp.create({
        canvasEl: canvas,
        active: canDraw,
        qbHit: qbHit,
        toField: cssToFieldCached,
        cssHeight: function () { return cv.h * (cv.scale || 1); },
        qbAt: function (out) { out.x = num(lv.qb.x, 0); out.y = num(lv.qb.y, 0); return out; },
        propose: proposeSpot,
        keys: function () { return liveSettings().keys; },
        onDraftStart: function (src) { if (src === 'pointer') refreshRect(); cls = null; clsAssist = false; toastLine.hidden = true; },
        onDraftEnd: function () { cls = null; dkind = ''; clsAssist = false; dispArr = null; dispN = 0; setDraftChip(); setDraftAttr(''); },
        onCommit: onCommit,
        onThrowAway: doThrowAway,
        onStray: function (reason) {
          if (reason === 'START ON THE QB') showToast('START ON THE QB');
          else showToast(coarsePointerNow() ? 'DRAW FROM THE QB' : '1-5 AIM · R RUN · OR DRAW FROM THE QB');
        }
      });
    }
    function teardownInput() { if (input) { input.destroy(); input = null; } }
    /**
     * Keyboard: the spot receiver `slot` can reach for a straight line at `loftV`: the engine's live.aim (fast: that
     * alone — the keyboard line follows it every frame), else checked with classify, else the middle of the run of ends
     * along his route that classify as a pass to him.
     */
    function proposeSpot(slot, loftV, out, fast) {
      if (!lv) return null;
      var i = recIdx[slot];
      if (i === undefined) return null;
      var qx = num(lv.qb.x, 0), qy = num(lv.qb.y, 0), c;
      var aim = typeof lv.aim === 'function' ? lv.aim(slot, loftV) : null;     // the engine's spot for a straight ball
      if (fast) {
        if (aim && typeof aim.x === 'number') { out.x = aim.x; out.y = aim.y; return out; }
        return meetSpot(i, loftV, 1, out);
      }
      if (aim && typeof aim.x === 'number') {
        out.x = aim.x; out.y = aim.y;
        c = lv.classify([{ x: qx, y: qy }, { x: out.x, y: out.y }], loftV);
        if (c && c.kind === 'PASS' && c.target === slot) return out;
      }
      meetSpot(i, loftV, 1, out);
      c = lv.classify([{ x: qx, y: qy }, { x: out.x, y: out.y }], loftV);
      if (c && c.kind === 'PASS' && c.target === slot) return out;
      // search his route for the ends that classify as a pass to him; take the middle of the first run of them
      var t0 = num(lv.t, 0), first = -1, last = -1;
      for (var k = 1; k <= 20; k++) {
        routeAt(i, t0 + k * 0.2, pt2);
        var ck = lv.classify([{ x: qx, y: qy }, { x: pt2.x, y: pt2.y }], loftV);
        if (ck && ck.kind === 'PASS' && ck.target === slot) { if (first < 0) first = k; last = k; }
        else if (first >= 0) break;
      }
      if (first >= 0) { routeAt(i, t0 + (first + last) / 2 * 0.2, out); return out; }
      return out;
    }
    /**
     * Aim assist: when the draft is a PASS to a target and its end is within assistYd of the spot he can reach, shift
     * the line's tail onto that spot (the offset grows linearly along the line, so the start stays on the QB) into the
     * pooled assistArr; kept only when the snapped line still classifies as a PASS to him. → the classify of the
     * snapped line or null.
     */
    function assistFor(src, n, c, loftV) {
      if (liveSettings().aimAssist === false || !c || c.kind !== 'PASS' || !c.target || n < 2 || n > AMAX) return null;
      var i = recIdx[c.target];
      if (i === undefined) return null;
      var qx = num(lv.qb.x, 0), qy = num(lv.qb.y, 0), ex = src[n - 1].x, ey = src[n - 1].y;
      var straight = Math.sqrt((ex - qx) * (ex - qx) + (ey - qy) * (ey - qy)) || 1, len = 0, k;
      for (k = 1; k < n; k++) { var dx = src[k].x - src[k - 1].x, dy = src[k].y - src[k - 1].y; len += Math.sqrt(dx * dx + dy * dy); }
      var stretch = Math.max(1, len / straight), aim = stretch < 1.04 && typeof lv.aim === 'function' ? lv.aim(c.target, loftV) : null;
      if (aim && typeof aim.x === 'number') { pt2.x = aim.x; pt2.y = aim.y; }
      else meetSpot(i, loftV, stretch, pt2);
      var ox = pt2.x - ex, oy = pt2.y - ey, R = Inp.draw().assistYd;
      if (ox * ox + oy * oy > R * R || (ox * ox + oy * oy) < 0.0025) return null;
      assistArr.length = n;
      var acc = 0;
      for (k = 0; k < n; k++) {
        if (k > 0) { var ddx = src[k].x - src[k - 1].x, ddy = src[k].y - src[k - 1].y; acc += Math.sqrt(ddx * ddx + ddy * ddy); }
        var w = len > 0 ? acc / len : 1, p = assistPool[k];
        p.x = src[k].x + ox * w; p.y = src[k].y + oy * w;
        assistArr[k] = p;
      }
      var c2 = lv.classify(assistArr, loftV);
      return c2 && c2.kind === 'PASS' && c2.target === c.target ? c2 : null;
    }
    /** Once a frame while a draft exists: classify it (and the aim assist's snapped copy) — never per pointermove. */
    function classifyDraft() {
      var arr = input.points(), n = input.count(), lf = input.loft();
      if (n < 1) { cls = null; clsAssist = false; dispArr = null; dispN = 0; return; }
      var c = lv.classify(arr, lf);
      var a = input.source() === 'pointer' ? assistFor(arr, n, c, lf) : null;   // a keyboard line is built on the engine's spot already (and its nudges must stick)
      if (a) { if (!clsAssist) cue('click'); cls = a; clsAssist = true; dispArr = assistArr; }
      else { cls = c; clsAssist = false; dispArr = arr; }
      dispN = n;
      dkind = cls ? String(cls.kind || '') : '';
      // a keyboard RUN draft is a run whatever it crosses (the classify still says what a finger's line would be)
      if (dkind && dkind !== 'INVALID' && input.source() === 'key' && input.mode() === 'RUN') dkind = 'RUN';
      setDraftAttr(dkind);
    }
    /** The draft was released (a finger lifted, Enter): classify the final line and hand it to the engine. */
    function onCommit(info) {
      if (!canDraw()) return;
      var pts = info.points, lf = info.loft;
      var c = lv.classify(pts, lf);
      var a = info.source === 'pointer' ? assistFor(pts, pts.length, c, lf) : null;
      if (a) { pts = copyPts(assistArr); c = a; }
      var kind = c ? c.kind : 'INVALID';
      if (info.source === 'key' && info.mode === 'RUN' && kind !== 'INVALID') kind = 'RUN';   // a keyboard RUN draft is a run whatever it crosses
      if (info.source === 'key' && info.mode === 'PASS' && kind === 'RUN') { showToast('NOBODY GETS THERE'); return; }   // … and a keyboard PASS never turns into a run
      applyCommit(kind, pts, lf);
    }
    function keepRun(points) {
      runBufN = Math.min(RUNMAX, points.length); runBufI = 0;
      for (var i = 0; i < runBufN; i++) { runBufX[i] = num(points[i].x, 0); runBufY[i] = num(points[i].y, 0); }
    }
    /** → the engine's answer ({ok, …}); INVALID does nothing. */
    function applyCommit(kind, points, lf) {
      if (!lv) return { ok: false, reason: 'NO PLAY' };
      var r = null;
      try {
        if (kind === 'PASS') r = lv.throwAlong(points, lf);
        // a DRAWN throw-away flies the line the player drew (the engine flies a THROWAWAY-classified line as one: no
        // scatter, never a turnover); the button / the X key have no line: the engine's own, past the nearer sideline
        else if (kind === 'THROWAWAY') r = points && points.length >= 2 ? lv.throwAlong(points, lf) : lv.throwAway();
        else if (kind === 'RUN') { r = lv.setRun(points); if (r && r.ok) { keepRun(points); cue('whoosh'); } }
        else r = { ok: false, reason: 'INVALID' };
      } catch (e) { if (root.console) root.console.error('PlayView commit failed', e); r = { ok: false, reason: 'ERROR' }; }
      if (r && !r.ok && r.reason && kind !== 'INVALID') showToast(String(r.reason).toUpperCase());
      return r || { ok: false };
    }
    function doThrowAway() {
      if (!canPass()) return { ok: false, reason: 'NOT NOW' };
      if (input) input.cancel();
      return applyCommit('THROWAWAY', null, 0.5);
    }

    // ── the live's events → the beats ──
    function onEvent(e) {
      var k = e && e.kind;
      switch (k) {
        case 'RELEASE':
          releaseReal = now(); releaseT = num(e.t, num(lv.t, 0));
          cue('whoosh'); cue('haptic', 20);
          setAria('Ball in the air.');
          if (input) input.cancel();
          setHint('');
          break;
        case 'TIP':
          tipReal = now();
          cue('thunk', 0.4); showSub('TIPPED!', 'clutch', 900);
          break;
        case 'INT':
          cue('thunk', 0.6); cue('stingerBad');
          flashAlpha = reduced ? 0 : 0.35; flashColor = pal('red');
          break;
        case 'CATCH':
          catchT = num(e.t, num(lv.t, 0)); catchSlot = recIdx[e.who] !== undefined ? recIdx[e.who] : -1;
          cue('thunk', 0.6); setAria('Caught.');
          break;
        case 'DROP': case 'INCOMPLETE': case 'OUT_OF_BOUNDS': case 'THROWAWAY':
          cue('whistle');
          break;
        case 'SACK':
          shakeAmp = reduced ? 0 : 3; flashAlpha = reduced ? 0 : 0.4; flashColor = pal('red');
          cue('thunk', 1.0); cue('haptic', 60); setAria('Sacked.');
          if (input) input.cancel();
          break;
        case 'ESCAPE':
          showSub('SLIPPED IT!', 'good', 900); cue('whoosh');
          break;
        case 'SCRAMBLE':
          showSub('SCRAMBLE!', 'good', 900); cue('whoosh'); setAria('Scramble.');
          break;
        case 'TACKLE':
          cue('thunk', 0.8);
          break;
        case 'BROKEN_TACKLE':
          showSub('BROKE A TACKLE!', 'good', 900); cue('thunk', 0.5);
          break;
        case 'TD':
          flashAlpha = reduced ? 0 : 0.3; flashColor = pal('gold'); cue('crowd', 0.6);   // the banner and the roar follow at the result
          break;
        default: break;
      }
    }
    function drainEvents() {
      var evs = lv.events;
      if (!evs) return;
      while (evIdx < evs.length) onEvent(evs[evIdx++]);
    }
    function timeScaleNow(drafting) {
      if (!drafting) return 1;
      return slowUsed < slowBudget ? Inp.draw().slowMo : 1;
    }
    function updatePlay(dt, t) {
      var q = lv.qb;
      if (alignU < 1) {
        alignU = alignMs > 0 ? clamp((t - tAlign0) / alignMs, 0, 1) : 1;
        readLive();
        return;
      }
      if (input) input.update(t);
      var drafting = !!(input && input.drafting());
      var ts = frozen ? 0 : timeScaleNow(drafting);
      if (drafting && ts < 1) slowUsed += dt / 1000;
      curScale = ts;
      if (!frozen) {
        try { lv.step(dt / 1000 * ts); }                       // after DONE the live coasts (presentation only)
        catch (e) { if (root.console) root.console.error('PlayView live.step failed', e); frozen = true; }
      }
      drainEvents();
      readLive();
      if (drafting && input && input.drafting()) classifyDraft();
      else if (cls) { cls = null; dkind = ''; clsAssist = false; dispArr = null; dispN = 0; setDraftAttr(''); }
      setDraftChip();
      setSlowHud(!!(input && input.drafting()));
      setLiveAttr(String(lv.phase || ''));
      setCanDrawAttr(canDraw() ? '1' : '0');
      runClock(num(lv.t, 0));
      if (q.hasBall && !frozen) setPressure(rushLevel());
      var showAway = canPass();
      if (btnAway && btnAway.hidden === showAway) btnAway.hidden = !showAway;
      if (!q.hasBall && hintEl && hintEl.textContent) setHint('');
      setHidden(skipHint, !(canSkipPlay() && !reduced));
      if (lv.phase === 'DONE' && !doneAt) {
        doneAt = t;
        if (input) input.cancel();
        var res = null;
        try { res = lv.result(); } catch (e2) { if (root.console) root.console.error('PlayView live.result failed', e2); }
        result = res && typeof res === 'object' ? res : fallbackResult();
        if (lv.qb.down && result.outcome === 'SACK') setAria('Sacked.');
      }
      if (doneAt && !resultAt && t - doneAt >= (reduced ? TIMING.doneHoldReducedMs : TIMING.doneHoldMs)) startResult();
    }
    /** RESULT / DONE: the live keeps coasting under the banner (everyone slows down; the engine runs an interception back). */
    function coastLive(dt) {
      try { lv.step(dt / 1000); } catch (e) { frozen = true; return; }
      drainEvents();
      readLive();
    }
    function fallbackResult() {
      return { run: false, playId: pickedId, outcome: 'INCOMPLETE', kind: 'PASS', target: null, yards: 0, airYards: 0, yac: 0, td: false, firstDown: false, turnover: false, fumble: false, text: 'INCOMPLETE', banner: 'INCOMPLETE', feedback: { timing: '—', touch: '—', placement: '—', coachSaw: '' } };
    }
    function canSkipPlay() { return phase === 'PLAY' && !!lv && alignU >= 1 && (lv.phase === 'DONE' || (!lv.qb.hasBall && releaseReal > 0 && now() - releaseReal >= TIMING.skipAfterMs)); }
    /** Skip after the release: step the live to its end in fixed chunks (the same sim, only faster), then the result. */
    function fastForward() {
      if (!lv || frozen) return;
      for (var i = 0; i < TIMING.fastForwardMax && lv.phase !== 'DONE'; i++) {
        try { lv.step(TIMING.fastForwardS); } catch (e) { frozen = true; break; }
      }
      drainEvents();
      readLive();
      if (lv.phase === 'DONE' && !doneAt) {
        doneAt = now();
        try { result = lv.result(); } catch (e2) { result = null; }
        if (!result || typeof result !== 'object') result = fallbackResult();
      }
    }

    // ── a run card (SNEAK / DRAW): resolved at the snap, the v1 RUN beat ──
    function startRunCard(s, opt) {
      sim = s; lv = null; frozen = true;
      var yards = num(s.yards, 0);
      if (typeof s.outcome === 'string') { result = s; if (!result.playId) result.playId = opt.id; }
      else result = { outcome: 'RUN', playId: opt.id, play: { id: opt.id, name: opt.name }, target: null, yards: yards, airYards: 0, yac: 0, td: !!s.td, firstDown: !!s.firstDown, turnover: !!s.turnover, text: s.text || '', feedback: s.feedback || { coachSaw: s.text || '' }, run: true };
      for (var i = 0; i < NACT; i++) { baseX[i] = aX[i]; baseY[i] = aY[i]; }
      cards.hidden = true; lookLine.hidden = true; drawBox.hidden = true;
      if (playChip) { playChip.textContent = opt.name || opt.id; playChip.hidden = false; }
      setPhase('RUN');
      runYards = yards; runT0 = now();
      var runId = (result.playId || (result.play && result.play.id) || opt.id);
      var rb = -1;
      for (var r = 0; r < recCount; r++) if (recSlot[r] === 'RB') rb = r;
      runActor = runId === 'DRAW' && rb >= 0 ? IREC + rb : IQB;
      runFrom = aY[runActor]; runX = aX[runActor];
      carrier = runActor === IQB ? -2 : runActor - IREC;
      cue('thunk', 0.8);
      setAria(opt.id === 'SNEAK' ? 'Quarterback sneak.' : 'Draw play.');
    }
    function updateRunCard(t) {
      var ms = reduced ? 120 : TIMING.runMs + Math.min(TIMING.runMaxExtraMs, Math.abs(runYards) * TIMING.runPerYdMs);
      var e = t - runT0, u = ease(clamp(e / ms, 0, 1));
      var y = lerp(runFrom, runYards, u);
      var maxY = Math.max(runFrom, L.goalD);
      if (y > maxY) y = maxY;
      aY[runActor] = y; aX[runActor] = runX + (runYards > 0 ? Math.sin(u * Math.PI) * 1.5 : 0);
      aFrame[runActor] = (Math.floor(e / TIMING.runFrameMs) & 1);
      // presentation of a resolved run: the defence closes on the runner, the line fires out a yard
      for (var j = 0; j < defCount; j++) { aX[j] = lerp(baseX[j], aX[runActor], u * 0.35); aY[j] = lerp(baseY[j], y + 1, u * 0.35); aFrame[j] = u > 0 && u < 1 ? (Math.floor(e / TIMING.runFrameMs) & 1) : 2; }
      for (var o = 0; o < olCount; o++) aY[IOL + o] = baseY[IOL + o] + u;
      if (u >= 1 && !resultAt) startResult();
    }

    // ───────────────────────────── the result ─────────────────────────────
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
    /** The feedback strip: placement · timing · touch (+ AIR / YAC on a catch), then the coach's line. */
    function showFeedback(res) {
      var fb = res.feedback || {}, parts = [], o = res.outcome;
      var thrown = !(res.run || o === 'RUN' || o === 'SACK' || o === 'SCRAMBLE');   // placement / timing / touch describe a throw
      if (thrown && fb.placement && fb.placement !== '—') parts.push(fb.placement);
      if (thrown && fb.timing && fb.timing !== '—') parts.push(fb.timing);
      if (thrown && fb.touch && fb.touch !== '—' && o !== 'THROWAWAY') parts.push(fb.touch);   // (the interstitial's rule: a throw-away has no touch)
      if (typeof res.airYards === 'number' && res.outcome === 'CATCH') parts.push('AIR ' + Math.round(res.airYards) + ' · YAC ' + Math.round(num(res.yac, 0)));
      feedback.textContent = '';
      if (parts.length) feedback.appendChild(el('div', { class: 'pv-feedback-line', text: parts.join(' · ') }));
      var coach = fb.coachSaw || res.text || '';
      if (coach) feedback.appendChild(el('div', { class: 'pv-feedback-coach small', text: coach }));
      feedback.hidden = !parts.length && !coach;
    }
    function startResult() {
      if (destroyed || phase === 'RESULT' || phase === 'DONE' || !result) return;
      resultAt = now();
      if (input) input.cancel();
      teardownInput();
      setCanDrawAttr('0');
      setPhase('RESULT');
      drawHud.hidden = true; stage.classList.remove('is-slow'); slowBands = false; curScale = 1;
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
      drawBox.hidden = true;
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
      if (phase === 'PLAY') {
        if (!canSkipPlay()) return false;
        fastForward();
        if (result) startResult();
        return true;
      }
      if (phase === 'RUN') { if (!resultAt) startResult(); return true; }
      if (phase === 'RESULT') { clearTimers(); finish(); return true; }
      return false;
    }
    function onStagePointer(e) {
      // the field around the card reads too — but not inside armMs of the card mounting (a double tap on NEXT lands here)
      if (phase === 'SITUATION') { if (e.target === canvas && elapsed() >= TIMING.armMs) { e.preventDefault(); startRead(); } return; }
      if (phase === 'PLAY') { if (canSkipPlay() && skip()) e.preventDefault(); return; }
      if (phase === 'RESULT' || phase === 'RUN') { if (skip()) e.preventDefault(); }
    }
    function onKey(e) {
      if (destroyed || e.repeat) return;
      if (e.key === 'Escape' && !e.altKey && !e.ctrlKey && !e.metaKey) {
        if (opts.onSettings) { e.preventDefault(); if (input) input.cancel(); opts.onSettings(); return; }
        if (PlayView.escapeToSettings(e)) { e.preventDefault(); if (input) input.cancel(); }
        return;
      }
      var t = e.target, tag = t && t.tagName;
      var K = Inp.resolveKeys(liveSettings().keys);
      var confirmKey = e.key === ' ' || e.key === 'Enter' || Inp.keyMatches(e, K.confirm) || Inp.keyMatches(e, K.confirmAlt);
      var soon = elapsed() < TIMING.armMs;             // a key inside armMs of the phase mounting is the tail of an earlier press
      if (phase === 'READ') {
        if (e.key >= '1' && e.key <= '9' && e.key.length === 1 && tag !== 'INPUT' && tag !== 'TEXTAREA') { e.preventDefault(); if (!soon) pick(e.key.charCodeAt(0) - 49); }
        return;
      }
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || (t && t.isContentEditable)) return;
      if (!confirmKey) return;
      if (phase === 'SITUATION') { e.preventDefault(); if (!soon) startRead(); return; }
      if (phase === 'PLAY') { if (!canDraw() && canSkipPlay() && skip()) e.preventDefault(); return; }   // while the QB has the ball the confirm key is the draw input's
      if (phase === 'RESULT' || phase === 'RUN') { if (skip()) e.preventDefault(); }
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
    /** The ring colours' thresholds on live.receivers[i].open: Tuning.qb.open.ring {open, closing} (the scene's FIELD values stand in). */
    function ringThresholds() { var R = (TQ().open && TQ().open.ring) || {}; ringOpen = num(R.open, FIELD.ringOpen); ringTight = num(R.closing, FIELD.ringTight); }
    function drawRing(i) {
      if (phase !== 'PLAY' || !lv || alignU < 1 || lv.phase === 'AFTER_CATCH' || lv.phase === 'DONE') return;   // the race is over: no rings
      var r = lv.receivers[i];
      if (!r || !r.shown) return;
      var o = num(r.open, 0), spr = o >= ringOpen ? rings.open : (o >= ringTight ? rings.tight : rings.covered);
      var s = aS[IREC + i], w = Math.max(FIELD.ringMinW, Math.round(FIELD.ringW * s)), h = Math.max(3, Math.round(5 * s));
      g.drawImage(spr, Math.round(aSX[IREC + i] - w / 2), Math.round(aSY[IREC + i] - h / 2), w, h);
    }
    function isTarget(i) {
      if (phase !== 'PLAY' || !lv) return false;
      if (cls && dkind === 'PASS' && cls.target === recSlot[i]) return true;
      var r = lv.receivers[i];
      return !!(r && r.target && lv.ball && !lv.ball.caught && lv.phase === 'BALL_IN_AIR');
    }
    function qbPose() {
      if (phase !== 'PLAY' || !lv) return 0;
      var t = num(lv.t, 0), q = lv.qb;
      if (releaseT >= 0 && t - releaseT < TIMING.throwPoseS) return 2;
      if (moving(q.vx, q.vy)) return (Math.floor(t * 1000 / TIMING.runFrameMs) & 1);
      return q.hasBall ? 1 : 0;
    }
    function drawActor(a) {
      if (!aShow[a]) return;
      var s = aS[a], x = aSX[a], y = aSY[a];
      if (a === IQB) {
        var spr = qbSpr[phase === 'RUN' && runActor === IQB ? aFrame[IQB] : qbPose()] || qbSpr[0];
        if (lv && lv.qb.down) {
          // sacked / tackled: the set pose on his side (rotated a quarter turn, the tackler drawn over him) and the ball loose
          g.save(); g.translate(Math.round(x), Math.round(y)); g.rotate(Math.PI / 2);
          g.drawImage(spr, -spr.width, -(spr.height >> 1));
          g.restore();
          if (!lv.ball) g.drawImage(balls[3], Math.round(x) + (spr.height >> 1) + 2, Math.round(y) - 3);
          return;
        }
        // full size in the backfield (his sprite is drawn for the drop), shrinking with depth once he scrambles upfield
        var qs = s < L.qbRefS ? s / L.qbRefS : 1, qw = qs < 1 ? Math.max(4, Math.round(spr.width * qs)) : spr.width, qh = qs < 1 ? Math.max(6, Math.round(spr.height * qs)) : spr.height;
        var qx = Math.round(x - qw / 2), qy = Math.round(y - qh);
        if (mirror) { g.save(); g.translate(qx + qw, qy); g.scale(-1, 1); g.drawImage(spr, 0, 0, qw, qh); g.restore(); }
        else g.drawImage(spr, qx, qy, qw, qh);
        if (carrier === -2 && lv && (lv.phase === 'SCRAMBLE' || moving(lv.qb.vx, lv.qb.vy))) g.drawImage(balls[3], qx + (mirror ? 1 : qw - 4), qy + Math.round(9 * qh / spr.height));
        return;
      }
      if (a >= IOL) { g.drawImage(olSpr, Math.round(x - olSpr.width / 2), Math.round(y - olSpr.height)); return; }
      var w = Math.max(3, Math.round(8 * s)), h = Math.max(4, Math.round(12 * s));
      if (a >= IREC) {
        var i = a - IREC;
        drawRing(i);
        var rs = recSpr[aFrame[a]] || recSpr[0];
        g.drawImage(rs, Math.round(x - w / 2), Math.round(y - h), w, h);
        if (hotSlot === i && phase === 'PLAY' && lv && num(lv.t, 0) < 1.5) g.drawImage(hotSpr, Math.round(x - 1), Math.round(y - h - 5));
        if (carrier === i) drawCarried(x, y, w, h, s);
        if (isTarget(i)) g.drawImage(pickSpr, Math.round(x - pickSpr.width / 2), Math.round(y - h - 1 - (pickSpr.height - h) / 2 - 2));
        return;
      }
      // a defender: the rush tile for a rusher (the READ crouch for the line), run frames once he moves
      var role = phase === 'PLAY' && lv && lv.defenders[a] ? lv.defenders[a].role : '';
      var ds = role === 'RUSH' ? rusherSpr[aFrame[a] & 1] : (aFrame[a] === 2 ? defSpr[2] : defSpr[aFrame[a] & 1]);
      g.drawImage(ds, Math.round(x - w / 2), Math.round(y - h), w, h);
      if (carrier === -3 - a) drawCarried(x, y, w, h, s);   // an interception (the engine runs him back)
    }
    /** The ball tucked under a runner's arm (a caught ball, a pick being returned): at his side, a size that reads. */
    function drawCarried(x, y, w, h, s) {
      var spr = s >= 0.6 ? balls[5] : balls[3];
      g.drawImage(spr, Math.round(x + w / 2 - spr.width / 2), Math.round(y - h * 0.55 - spr.height / 2));
    }
    function drawActors() {
      for (var k = 0; k < NACT; k++) drawActor(order[k]);
    }
    /**
     * Dots along a field polyline arr[0..n) whose first point is drawn from (sx, sy) (the QB now): every `gap` virtual
     * px, `color`, turning red past `maxLen` yd; `arcLoft` > 0 fattens the middle (1 → 3 px) to show the arc.
     */
    function drawDots(arr, n, sx, sy, color, gap, arcLoft, maxLen, alpha, fromLen) {
      if (n < 2) return;
      var total = 0, k, ax, ay, bx, by;
      ax = sx; ay = sy;
      for (k = 1; k < n; k++) { bx = arr[k].x; by = arr[k].y; total += Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)); ax = bx; ay = by; }
      if (!(total > 0)) return;
      g.globalAlpha = alpha;
      var red = false, ink = pal('ink'), redC = pal('red');
      var cum = 0, fx0 = sx, fy0 = sy;
      project(fx0, fy0); var px0 = pt.x, py0 = pt.y, carry = 0;
      for (k = 1; k < n; k++) {
        var fx1 = arr[k].x, fy1 = arr[k].y;
        var segYd = Math.sqrt((fx1 - fx0) * (fx1 - fx0) + (fy1 - fy0) * (fy1 - fy0));
        project(fx1, fy1); var px1 = pt.x, py1 = pt.y;
        var segPx = Math.sqrt((px1 - px0) * (px1 - px0) + (py1 - py0) * (py1 - py0));
        if (segPx > 0) {
          var d = gap - carry;
          while (d <= segPx) {
            var u = d / segPx, yd = cum + segYd * u;
            if (yd >= fromLen) {
              red = yd > maxLen;
              var want = red ? redC : color;
              var tu = yd / total, th = arcLoft > 0 ? 1 + Math.round(2 * arcLoft * 4 * tu * (1 - tu)) : 1;
              var dx0 = Math.round(px0 + (px1 - px0) * u - (th >> 1)), dy0 = Math.round(py0 + (py1 - py0) * u - (th >> 1));
              g.fillStyle = ink; g.fillRect(dx0 + 1, dy0 + 1, th, th);            // a hard shadow: the line reads over grass and the chalk hashes
              g.fillStyle = want; g.fillRect(dx0, dy0, th, th);
            }
            d += gap;
          }
          carry = segPx - (d - gap);
        }
        cum += segYd; fx0 = fx1; fy0 = fy1; px0 = px1; py0 = py1;
      }
      g.globalAlpha = 1;
    }
    /** Chalk footprints every footYd along a field polyline (alternating a step either side). */
    function drawFeet(arr, n, sx, sy, alpha, fromIdx) {
      if (n < 2) return;
      g.globalAlpha = alpha;
      var fx0 = sx, fy0 = sy, carry = 0, side = 1, ink = pal('ink'), chalk = pal('chalk');
      for (var k = Math.max(1, fromIdx); k < n; k++) {
        var fx1 = arr === null ? runBufX[k] : arr[k].x, fy1 = arr === null ? runBufY[k] : arr[k].y;
        var dx = fx1 - fx0, dy = fy1 - fy0, d = Math.sqrt(dx * dx + dy * dy);
        if (d > 0) {
          var s = FIELD.footYd - carry;
          while (s <= d) {
            var u = s / d, nx = -dy / d * FIELD.footSide * side, ny = dx / d * FIELD.footSide * side;
            project(fx0 + dx * u + nx, fy0 + dy * u + ny);
            var fw = pt.s > 0.7 ? 3 : 2, fh = pt.s > 0.7 ? 3 : 2, px = Math.round(pt.x) - (fw >> 1), py = Math.round(pt.y) - fh + 1;
            g.fillStyle = ink; g.fillRect(px + 1, py + 1, fw, fh);      // a hard shadow: chalk on grass reads at phone size
            g.fillStyle = chalk; g.fillRect(px, py, fw, fh);
            side = -side; s += FIELD.footYd;
          }
          carry = d - (s - FIELD.footYd);
        }
        fx0 = fx1; fy0 = fy1;
      }
      g.globalAlpha = 1;
    }
    function drawMark(spr, x, y, sc) {
      var w = Math.max(3, Math.round(spr.width * sc)), h = Math.max(3, Math.round(spr.height * sc));
      g.drawImage(spr, Math.round(x - w / 2), Math.round(y - h / 2), w, h);
    }
    /** The landing marker at a field point (the preview's ring shapes for a FIELD GENERAL, else the X). */
    function drawLanding(x, y, kind, preview, previewShown, assisted) {
      project(x, y);
      var sc = clamp(pt.s * 1.1, 0.6, 1.2);
      if (kind === 'PASS' && previewShown && preview) {
        var spr = preview === 'GREEN' ? rings.open : (preview === 'GOLD' ? rings.tight : rings.covered);
        var w = Math.max(7, Math.round(FIELD.ringW * pt.s * 1.2)), h = Math.max(4, Math.round(5 * pt.s * 1.2));
        g.drawImage(spr, Math.round(pt.x - w / 2), Math.round(pt.y - h / 2), w, h);
      } else drawMark(kind === 'THROWAWAY' ? marks.away : marks.pass, pt.x, pt.y, sc);
      if (assisted) drawMark(marks.tick, pt.x, pt.y - 5, 1);
    }
    function drawDraft() {
      if (phase !== 'PLAY' || !lv || !cls || !dispArr || dispN < 2) return;
      var k = dkind, qx = num(lv.qb.x, 0), qy = num(lv.qb.y, 0);
      if (k === 'RUN') {                                     // chalk prints to a chalk X: where he will run
        drawFeet(dispArr, dispN, qx, qy, 1, 1);
        var re = dispArr[dispN - 1]; project(num(re.x, 0), num(re.y, 0)); drawMark(marks.chalk, pt.x, pt.y, clamp(pt.s * 1.1, 0.6, 1.2));
        return;
      }
      if (k === 'THROWAWAY') {
        drawDots(dispArr, dispN, qx, qy, pal('grey'), FIELD.awayDotPx, 0, Infinity, 1, 0);
        var e = dispArr[dispN - 1]; drawLanding(e.x, e.y, 'THROWAWAY', null, false, false);
        return;
      }
      if (k !== 'PASS') return;
      var maxLen = num(cls.maxLen, Infinity);
      drawDots(dispArr, dispN, qx, qy, pal('gold'), FIELD.passDotPx, input ? input.loft() : 0.5, maxLen, 1, 0);
      // the landing: the end of the engine's (truncated) line
      var cp = cls.points && cls.points.length ? cls.points[cls.points.length - 1] : dispArr[dispN - 1];
      drawLanding(num(cp.x, 0), num(cp.y, 0), 'PASS', cls.preview, !!cls.previewShown, clsAssist);
      if (cls.tooLong) { var last = dispArr[dispN - 1]; project(last.x, last.y); drawMark(marks.red, pt.x, pt.y, 0.8); }
    }
    /** The committed run: faint footprints from the QB along what is left of it. */
    function drawRunPath() {
      if (phase !== 'PLAY' || !lv || runBufN < 2 || !lv.qb.hasBall || (cls && input && input.drafting())) return;
      var qx = num(lv.qb.x, 0), qy = num(lv.qb.y, 0);
      // the nearest point ahead of the QB (monotonic: he only moves along it)
      var best = runBufI, bd = Infinity;
      for (var i = runBufI; i < runBufN; i++) { var dx = runBufX[i] - qx, dy = runBufY[i] - qy, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } else if (d > bd + 16) break; }
      runBufI = best;
      if (runBufI >= runBufN - 1) return;
      drawFeet(null, runBufN, qx, qy, 0.6, runBufI + 1);
    }
    function drawBall() {
      if (phase !== 'PLAY' && phase !== 'RESULT' && phase !== 'DONE') return;
      if (!lv || !lv.ball) return;
      var b = lv.ball;
      if (b.caught && carrier !== -1) return;                     // in someone's hands (drawn on him)
      var dead = num(b.deadAt, -1) >= 0;
      var bx = num(b.x, 0), by = num(b.y, 0), h = Math.max(0, num(b.h, 0));
      if (!dead && lv.phase === 'BALL_IN_AIR') {
        // the rest of the flown path, faint, and where it lands
        if (b.path && b.path.length > 1) {
          var tot = 0;
          for (var k = 1; k < b.path.length; k++) { var ddx = b.path[k].x - b.path[k - 1].x, ddy = b.path[k].y - b.path[k - 1].y; tot += Math.sqrt(ddx * ddx + ddy * ddy); }
          drawDots(b.path, b.path.length, num(b.path[0].x, 0), num(b.path[0].y, 0), pal('gold'), 4, 0, Infinity, 0.45, num(b.u, 0) * tot);
        }
        if (b.landing) drawLanding(num(b.landing.x, 0), num(b.landing.y, 0), b.kind === 'THROWAWAY' ? 'THROWAWAY' : 'PASS', null, false, false);
      }
      project(bx, by);
      var groundY = Math.round(pt.y), sx = Math.round(pt.x), s = pt.s, lift = h * L.pxPerYd * s * L.kv;
      if (b.tipped && tipReal && now() - tipReal < TIMING.tipMs * 0.4) drawMark(tipStar, pt.x, groundY - lift, 1);   // the hand on it
      // the shadow on the ground (narrower the higher the ball) and the ball above it (a tipped ball tumbles)
      var size = 3 + 5 * s * (1 + 0.04 * h);
      // the shadow on the ground: two rows (a flat oval), so the gap between it and the ball reads as height
      g.fillStyle = 'rgba(16,18,38,0.55)';
      var sw = Math.max(2, Math.round(size * 0.7 / (1 + h * 0.06)));
      g.fillRect(sx - (sw >> 1), groundY, sw, 1);
      if (sw > 2) g.fillRect(sx - (sw >> 1) + 1, groundY + 1, sw - 2, 1);
      var spr = b.tipped && h > 0.05 ? spinSpr[(Math.floor(now() / 70) & 1)] : (size < 3.2 ? balls[2] : (size < 5 ? balls[3] : (size < 7.2 ? balls[5] : balls[8])));
      g.drawImage(spr, sx - (spr.width >> 1), Math.round(groundY - lift) - (spr.height >> 1));
    }
    function drawParticles() {
      if (!pCount) return;
      var spr = pKind === 'rain' ? rainSpr : snowSpr;
      for (var i = 0; i < pCount; i++) g.drawImage(spr, Math.round(particles[i * 4]), Math.round(particles[i * 4 + 1]));
    }
    function drawOverlays() {
      if (weatherKind() === 'fog') { g.fillStyle = pal('chalk'); g.globalAlpha = 0.18; g.fillRect(0, L.yHor - 12, L.W, Math.round((L.yLOS - L.yHor) * 0.6)); g.globalAlpha = 1; }
      if (slowBands) {
        // slow motion: letterbox bands (the stage's CSS also desaturates the canvas)
        var bh = Math.max(6, Math.round(L.H * 0.035));
        g.fillStyle = pal('ink'); g.globalAlpha = 0.55; g.fillRect(0, 0, L.W, bh); g.fillRect(0, L.H - bh, L.W, bh); g.globalAlpha = 1;
        g.fillStyle = pal('gold'); g.fillRect(0, bh, L.W, 1); g.fillRect(0, L.H - bh - 1, L.W, 1);
      }
      if (phase === 'SITUATION') { g.fillStyle = pal('ink'); g.globalAlpha = 0.55; g.fillRect(0, 0, L.W, L.H); g.globalAlpha = 1; }
      if (flashAlpha > 0) { g.fillStyle = flashColor; g.globalAlpha = flashAlpha; g.fillRect(0, 0, L.W, L.H); g.globalAlpha = 1; flashAlpha = Math.max(0, flashAlpha - 0.05); }
    }
    function draw() {
      g.save();
      g.translate(camX, camY);
      drawStadium();
      drawField();
      drawRunPath();
      drawDraft();
      drawActors();
      drawBall();
      drawParticles();
      g.restore();
      drawOverlays();
    }

    /** A modal is open: freeze the play (no step), the slide and the beats' clocks; a finger's draft is dropped. */
    function holdPaused(dt) {
      if (phase === 'PLAY') {
        if (alignU < 1) tAlign0 += dt;
        if (doneAt) doneAt += dt;
        if (releaseReal) releaseReal += dt;
        if (input && input.drafting() && input.source() === 'pointer') input.cancel();
        if (slowBands) { slowBands = false; stage.classList.remove('is-slow'); }
        curScale = 0;
      } else if (phase === 'RUN') runT0 += dt;
      else if (phase === 'RESULT') tPhase += dt;
      projectAll();
    }
    function update(dt, t) {
      if (paused()) { holdPaused(dt); return; }
      var period = crowdMode === 'cheer' ? TIMING.crowdCheerMs : TIMING.crowdIdleMs;
      if (t - crowdAt > period) { crowdAt = t; crowdFrame = crowdMode === 'groan' ? 0 : 1 - crowdFrame; }
      var amp = 0;
      if (!reduced && shakeAmp > 0) { amp = shakeAmp; shakeAmp = Math.max(0, shakeAmp - dt / (TIMING.sackShakeMs / 3)); }
      camX = amp ? Math.round((rnd() - 0.5) * 2 * amp) : 0;
      camY = amp ? Math.round((rnd() - 0.5) * 2 * amp) : 0;
      if (phase === 'PLAY' && lv) updatePlay(dt, t);
      else if (phase === 'RUN') updateRunCard(t);
      else if ((phase === 'RESULT' || phase === 'DONE') && lv && !frozen) coastLive(dt);
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
      sim = null; lv = null; result = null; pickedId = null; pickedOpt = null; frozen = false; cls = null;
      crowdMode = 'idle'; flashAlpha = 0; shakeAmp = 0; camX = 0; camY = 0; resultAt = 0; doneAt = 0;
      for (var i = 0; i < NACT; i++) order[i] = i;
      alignMs = 0; alignU = 1;
      placeAlignment();
      hotSlot = -1;
      loadTinted();
      ringThresholds();
      relayout();
      initParticles();
      buildHud();
      hideBanner(); subBanner.hidden = true; toastLine.hidden = true; skipHint.hidden = true; feedback.hidden = true; drawBox.hidden = true; cards.hidden = true; drawHud.hidden = true;
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
        loadTinted();
        relayout();
      });
    }
    arm();
    cv.start(loop);

    /** A JSON copy of the draft (RTG.debug / the e2e): {mode, kind, target, preview, previewShown, points, loft, tooLong, …} or null. */
    function drawing() {
      if (!input || !input.drafting()) return null;
      var k = cls ? dkind : null;
      var mode = input.mode() || (k === 'PASS' || k === 'THROWAWAY' ? 'PASS' : (k === 'RUN' ? 'RUN' : null));
      return {
        mode: mode, source: input.source(), kind: k, target: cls ? (cls.target || null) : null,
        preview: cls ? (cls.preview || null) : null, previewShown: !!(cls && cls.previewShown),
        points: copyPts(cls && cls.points ? cls.points : input.points()), raw: copyPts(input.points()),
        loft: Math.round(input.loft() * 1000) / 1000, touch: Inp.touchName(input.loft()), speedHps: Math.round(input.speedHps() * 100) / 100,
        tooLong: !!(cls && cls.tooLong), length: cls ? num(cls.length, 0) : 0, maxLen: cls ? num(cls.maxLen, 0) : 0,
        assisted: clsAssist, reason: cls ? (cls.reason || '') : ''
      };
    }
    function timeScale() { return paused() && phase === 'PLAY' ? 0 : (phase === 'PLAY' && lv && !frozen ? curScale : 1); }

    var view = {
      el: elRoot, canvas: canvas, cv: cv,
      phase: function () { return phase; },
      layout: function () { return L; },
      ctx: function () { return ctx; },
      sim: function () { return sim; },
      live: function () { return lv; },
      result: function () { return result; },
      timeScale: timeScale,
      drawing: drawing,
      /** {sim, t, phase, livePhase, play, timeScale, drafting, target}: what the scene is playing right now (RTG.debug). */
      current: function () { return { sim: sim, t: lv ? num(lv.t, 0) : 0, phase: phase, livePhase: lv ? lv.phase : null, play: pickedId, timeScale: timeScale(), drafting: !!(input && input.drafting()), target: cls && cls.kind === 'PASS' ? cls.target : null, slowLeftS: Math.max(0, slowBudget - slowUsed) }; },
      /** Field yards → client css px (the viewport coordinates a pointer event carries). */
      fieldToCss: fieldToCss,
      /** True while a draft may start: PLAY, the slide done, the QB has the ball, no modal (also .playview[data-can-draw="1"]). */
      canDraw: function () { return canDraw(); },
      /** Where to press to start a draft: the QB's feet in client css px, his chest (10 virtual px up) and the start radius (css px). */
      qbPoint: function () {
        refreshRect();
        var s = cv.scale || 1, fx = rectL + aSX[IQB] * s, fy = rectT + aSY[IQB] * s;
        return { x: fx, y: fy, chestY: fy - FIELD.qbBodyVpx * s, r: startRadiusCss(), fieldX: aX[IQB], fieldY: aY[IQB] };
      },
      /** Client css px → field yards (the exact inverse of fieldToCss on the field). */
      cssToField: cssToField,
      /** Field yards → virtual px + scale (a copy). */
      project: function (x, y) { project(num(x, 0), num(y, 0)); return { x: pt.x, y: pt.y, s: pt.s }; },
      /** Receivers and the QB in css px relative to the canvas element (sprite centres) + field yards. */
      actors: function () {
        var out = { receivers: [], defenders: [], qb: null, scale: cv.scale };
        for (var i = 0; i < recCount; i++) {
          var h = Math.max(4, Math.round(12 * aS[IREC + i])), r = lv ? lv.receivers[i] : null;
          out.receivers.push({ slot: recSlot[i], x: aSX[IREC + i] * cv.scale, y: (aSY[IREC + i] - h / 2) * cv.scale, fieldX: aX[IREC + i], fieldY: aY[IREC + i], open: r ? num(r.open, 0) : null, sep: r ? num(r.sep, 0) : null, shown: !!(r && r.shown) });
        }
        for (var j = 0; j < defCount; j++) out.defenders.push({ id: defId[j], pos: defPos[j], fieldX: aX[j], fieldY: aY[j], x: aSX[j] * cv.scale, y: aSY[j] * cv.scale });
        out.qb = { x: aSX[IQB] * cv.scale, y: (aSY[IQB] - 10) * cv.scale, fieldX: aX[IQB], fieldY: aY[IQB], startR: startRadiusCss() };
        return out;
      },
      read: startRead,
      pick: pick,
      /** Programmatic pass along field points (tests / RTG.debug.drawPass): straight to live.throwAlong. */
      commitPass: function (points, loft) {
        if (!canPass()) return { ok: false, reason: 'NOT NOW' };
        if (input) input.cancel();
        return applyCommit('PASS', copyPts(points), clamp(num(loft, 0.5), 0, 1));
      },
      /** Programmatic run along field points: live.setRun. */
      commitRun: function (points) {
        if (!canDraw()) return { ok: false, reason: 'NOT NOW' };
        if (input) input.cancel();
        return applyCommit('RUN', copyPts(points), 0.5);
      },
      throwAway: doThrowAway,
      /**
       * The spot receiver `slot` can reach for a straight line from the QB at `loft` (the keyboard's proposal: his route
       * at the ball's estimated arrival, re-checked with live.classify, else the middle of the ends that classify as a
       * pass to him) → {x, y, kind, target} (the classify of that straight line) or null.
       */
      reachSpot: function (slot, loft) {
        if (phase !== 'PLAY' || !lv) return null;
        var lf = clamp(num(loft, 0.5), 0, 1), o = { x: 0, y: 0 };
        if (!proposeSpot(String(slot), lf, o, false)) return null;
        var c = lv.classify([{ x: num(lv.qb.x, 0), y: num(lv.qb.y, 0) }, { x: o.x, y: o.y }], lf);
        return { x: Math.round(o.x * 1000) / 1000, y: Math.round(o.y * 1000) / 1000, kind: c ? c.kind : null, target: c ? (c.target || null) : null };
      },
      /** Animate an externally resolved result (RTG.debug.forceResult): from SITUATION / READ it snaps the first card first; the live freezes. */
      playResult: function (res) {
        if (!res || typeof res.outcome !== 'string') return view;
        if (phase === 'SITUATION') startRead();
        if (phase === 'READ') {
          var opts0 = ctx.options || [], k = 0;
          for (var i = 0; i < opts0.length; i++) if (!opts0[i].run) { k = i; break; }
          pick(k);
        }
        if (phase === 'PLAY' || phase === 'READ') {
          frozen = true; if (input) input.cancel();
          result = res; alignU = 1;
          if (res.outcome === 'SACK' && lv) shakeAmp = reduced ? 0 : 3;
          startResult();
        } else if (phase === 'RUN') { result = res; startResult(); }
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
        if (current === view) current = null;
      }
    };
    current = view;
    return view;
  };

  PlayView.current = function () { return current; };

  /**
   * The moment screen is chromeless, so Escape is its route to Settings. The shell provides
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
