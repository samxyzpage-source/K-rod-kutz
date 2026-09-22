/**
 * Road to Glory: Kicker — RTG.UI.Input (SPEC §4.6 pointer flick + keyboard meters → the kick triple, D6)
 *
 * Both input modes emit the same KickInput {power 0..1.15, aim −12..12 (deg, 0 = post centre), quality 0..1,
 * holdMs?} through onRelease(input, meta). They never touch state; the kick scene hands the triple to
 * store.dispatch('applyUserKick' | 'sessionKick', input).
 *
 * RTG.UI.Input.flick(canvasEl, opts) — Pointer Events with setPointerCapture, first pointer only.
 *   opts: {
 *     ballAt()          → {x, y}  CSS px of the ball relative to the canvas element
 *     cssHeight()       → canvas CSS height (px)          landscape() → bool
 *     playClockMs()     → ms (0 = no clock)               uiRng       → RTG.RNG (gauss) for the mishit aim
 *     leftFooted()      → bool                            active()    → bool (input accepted right now)
 *     onStart(), onPull(P, leanFrame), onTick(pct), onClock(remainingMs, totalMs),
 *     onRelease(input, meta {kind:'flick'|'mishit'|'forced'|'clock', speed, rmsPerp, weak, yanked}), onCancel()
 *   }
 *   returns {destroy(), reset(), pulling(), power(), clockRemaining(), clockTotal(), state()}
 *
 * §4.6 rules implemented verbatim: pointerdown within 96 css px of the ball → PULL and the play clock starts;
 * P = clamp(dy / D_full, 0, 1.15), D_full = 0.32·cssHeight (portrait) or 0.45·cssHeight (landscape); lean =
 * floor(P·3); 32-sample ring buffer; flick segment = last 120 ms or last 6 samples, whichever is larger — but never
 * starting before the pull's reversal (DEVIATION: the deepest sample of the last 300 ms is where the flick begins; a
 * fast pull that snaps straight up would otherwise drag downward samples into the window and read as WEAK);
 * v.y > −0.12 → mishit {0.5, N(0, 2°), 0.3}; aim = clamp(atan2(vx, −vy)·180/π, −12, 12) (mirrored when
 * left-footed); speed < 0.35 → power ×0.85 (WEAK); speed > 2.2 → quality −0.15 (YANKED);
 * quality = 1 − clamp(rmsPerp / 14, 0, 1) − yank; P ≥ 0.95 held > 1.2 s → holdMs; no cancel after P > 0.20
 * (pointercancel / capture loss → kick with the current values, quality 0.5); play clock at 0 → kick with
 * the current values or mishit if never pulled.
 *
 * RTG.UI.Input.meter(opts) — aim-then-hold mode, the default (also works with a mouse or a finger on the canvas).
 *   ←/→ (A/D) nudge aim ±0.5° per tap, hold sweeps 6°/s — aim is the arrows ALONE. Then the confirm key (or a
 *   pointer on the canvas) is HELD while power climbs linearly 0 → 1.15 over meter.holdMs (1300 ms; 1050 ms at
 *   pressure ≥ 0.6) and parks at the top; the release sets power, and quality comes from that release relative
 *   to the green band [pNeed, pNeed + Tuning.kick.range.greenBand]: 1.0 at its middle, `edge` at the rim, then
 *   falling away outside it (floor `min`). A release under meter.minCommit is a stray tap — back to AIM, no kick.
 *   With opts.assist() on, a release inside the band also sets `input.green`, which the engine honours as a
 *   guaranteed make (SPEC D21). The play clock starts on the first hold; running it out kicks at the current fill.
 *   Bindings come from `keys()` → store.settings.keys {confirm, confirmAlt, left, right} (Settings ▸ KEYS);
 *   unset entries fall back to Space/Enter/←/→ and A/D stay as arrow aliases only while ←/→ are unremapped.
 *   opts: {pressure, playClockMs(), leftFooted(), active(), canvasEl?, keys(), greenZone(), assist(),
 *          onAim(aim), onPowerStart(), onPower(P), onPowerCancel(), onRelease(input, meta), onClock(rem, total)}
 *   returns {destroy(), reset(), update(now), press(), holdStart(), holdEnd(), nudge(dir), state(), aim(), power(),
 *            qualityNow(), inGreenNow(), clockRemaining(), clockTotal()}
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Input = {};

  var CONST = {
    grabRadiusCss: 96, powerMax: 1.15, aimMax: 12,
    dFullPortrait: 0.32, dFullLandscape: 0.45,
    ring: 32, flickWindowMs: 120, flickMinSamples: 6, powerWindowMs: 300, dFullMinCss: 60, dFullMarginCss: 12,
    reversalTolCss: 2, pauseGapMs: 60,
    noFlickVy: -0.12, weakSpeed: 0.35, yankSpeed: 2.2, weakMult: 0.85, yankPenalty: 0.15,
    rmsPerpDiv: 14, holdFromP: 0.95, holdMs: 1200, noCancelP: 0.20,
    mishit: { power: 0.5, aimSd: 2, quality: 0.3 }, cancelQuality: 0.5,
    // Aim-then-hold meter: arrows aim, then hold the confirm key/finger while the power bar fills and let go
    // inside the green band. `holdMs` is the time to fill 0 → powerMax; `holdMsPressure` is the quicker fill
    // under pressure. Quality comes from where the release landed relative to the green zone (§4.6).
    meter: {
      nudgeDeg: 0.5, sweepDegPerSec: 6, sweepAfterMs: 220,
      holdMs: 1300, holdMsPressure: 1050, pressureFast: 0.6,
      minCommit: 0.08,                                   // a release below this is a stray tap: back to AIM, no kick
      quality: { center: 1.0, edge: 0.88, missSlope: 2.2, min: 0.3, halfFallback: 0.075 }
    }
  };
  Input.CONST = CONST;

  /** The out-of-the-box keyboard bindings; Settings ▸ KEYS overrides confirm / left / right in `store.settings.keys`. */
  var DEFAULT_KEYS = { confirm: ' ', confirmAlt: 'Enter', left: 'ArrowLeft', right: 'ArrowRight' };
  Input.DEFAULT_KEYS = DEFAULT_KEYS;

  /**
   * Does the KeyboardEvent `e` match the configured binding `key`? Bindings are stored as `KeyboardEvent.key`
   * values by the settings screen (' ', 'Enter', 'ArrowLeft', 'k', …), so match on `.key` first (case-insensitive
   * for single characters, so a remap to 'k' still fires with caps lock on), then on `.code` for the space bar
   * and for callers that store codes.
   */
  Input.keyMatches = function (e, key) {
    if (!e || !key) return false;
    var k = e.key;
    if (key === ' ' || key === 'Space' || key === 'Spacebar') return k === ' ' || k === 'Spacebar' || e.code === 'Space';
    if (k === key) return true;
    if (typeof k === 'string' && k.length === 1 && key.length === 1 && k.toLowerCase() === key.toLowerCase()) return true;
    return !!e.code && e.code === key;
  };
  /** Merge a settings.keys object over the defaults (unset / non-string entries keep the default). */
  Input.resolveKeys = function (raw) {
    var out = { confirm: DEFAULT_KEYS.confirm, confirmAlt: DEFAULT_KEYS.confirmAlt, left: DEFAULT_KEYS.left, right: DEFAULT_KEYS.right };
    if (raw && typeof raw === 'object') {
      for (var k in out) if (typeof raw[k] === 'string' && raw[k]) out[k] = raw[k];
    }
    return out;
  };

  function now() { return (root.performance && root.performance.now) ? root.performance.now() : Date.now(); }
  function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
  function call(fn, a, b, c) { if (typeof fn === 'function') return fn(a, b, c); return undefined; }
  function gauss(rng, mu, sd) {
    if (rng && typeof rng.gauss === 'function') return rng.gauss(mu, sd);
    var u = Math.random() || 1e-9, v = Math.random();
    return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // ═══════════════════════════════ flick ═══════════════════════════════
  Input.flick = function (canvasEl, opts) {
    opts = opts || {};
    var N = CONST.ring;
    var sx = new Float64Array(N), sy = new Float64Array(N), st = new Float64Array(N);
    var head = 0, count = 0;
    var pointerId = null, pulling = false, P = 0, peakP = 0, lean = -1, lastTick = 0;
    var x0 = 0, y0 = 0, rectLeft = 0, rectTop = 0;
    var holdSince = 0, holdEnd = 0, everPulled = false;   // hold at full draw: first sample with P ≥ 0.95 … first sample back under it (the flick)
    var clockStart = 0, clockTotal = 0, clockTimer = 0;
    var destroyed = false;
    var state = 'IDLE';
    var out = { power: 0, aim: 0, quality: 0, holdMs: 0 };   // reused output object
    var meta = { kind: 'flick', speed: 0, rmsPerp: 0, weak: false, yanked: false, samples: 0, windowMs: 0 };

    canvasEl.style.touchAction = 'none';

    function push(x, y, t) {
      sx[head] = x; sy[head] = y; st[head] = t;
      head = (head + 1) % N;
      if (count < N) count++;
    }
    function at(i) { // i = 0 oldest … count-1 newest
      var idx = (head - count + i + N * 2) % N;
      return idx;
    }
    var roomBelow = 0;   // css px from the ball to the bottom of the viewport, measured at pointerdown
    function dFull() {
      var h = call(opts.cssHeight) || canvasEl.clientHeight || 320;
      var d = (call(opts.landscape) ? CONST.dFullLandscape : CONST.dFullPortrait) * h;
      // DEVIATION (playability): a finger cannot leave the screen, so the whole power range — the overswing zone
      // included (P up to powerMax) — must be reachable within the room below the ball. Cap D_full so that
      // powerMax · D_full still fits in that room minus a margin (a landscape phone leaves ~150 px under the ball).
      if (roomBelow > 0) d = Math.min(d, Math.max(CONST.dFullMinCss, (roomBelow - CONST.dFullMarginCss) / CONST.powerMax));
      return d;
    }
    function isActive() { return opts.active ? !!opts.active() : true; }

    function startClock() {
      var total = call(opts.playClockMs) || 0;
      clockTotal = total;
      clockStart = now();
      if (clockTimer) root.clearTimeout(clockTimer);
      if (total > 0) clockTimer = root.setTimeout(onClockOut, total);
    }
    function stopClock() {
      if (clockTimer) root.clearTimeout(clockTimer);
      clockTimer = 0; clockStart = 0; clockTotal = 0;
    }
    function onClockOut() {
      clockTimer = 0;
      if (destroyed || state !== 'PULL') return;
      if (everPulled && P > 0.02) finishWith(P, 0, CONST.cancelQuality, 'clock');
      else mishit('clock');
    }

    function mishit(kind) {
      out.power = CONST.mishit.power;
      out.aim = clamp(gauss(opts.uiRng, 0, CONST.mishit.aimSd), -CONST.aimMax, CONST.aimMax);
      out.quality = CONST.mishit.quality;
      out.holdMs = 0;
      meta.kind = kind || 'mishit'; meta.speed = 0; meta.rmsPerp = 0; meta.weak = false; meta.yanked = false;
      release();
    }
    function finishWith(power, aim, quality, kind) {
      out.power = clamp(power, 0, CONST.powerMax);
      out.aim = clamp(aim, -CONST.aimMax, CONST.aimMax);
      out.quality = clamp(quality, 0, 1);
      out.holdMs = 0;
      meta.kind = kind; meta.speed = 0; meta.rmsPerp = 0; meta.weak = false; meta.yanked = false;
      release();
    }
    function release() {
      state = 'DONE';
      pulling = false;
      stopClock();
      releaseCapture();
      call(opts.onRelease, out, meta);
    }
    function releaseCapture() {
      if (pointerId !== null) {
        try { if (canvasEl.hasPointerCapture && canvasEl.hasPointerCapture(pointerId)) canvasEl.releasePointerCapture(pointerId); } catch (e) { /* ignore */ }
      }
      pointerId = null;
    }

    function onDown(e) {
      if (destroyed || !isActive() || state === 'PULL' || pointerId !== null) return;
      if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
      var r = canvasEl.getBoundingClientRect();
      rectLeft = r.left; rectTop = r.top;
      var px = e.clientX - rectLeft, py = e.clientY - rectTop;
      var b = call(opts.ballAt) || { x: r.width / 2, y: r.height * 0.78 };
      var dx = px - b.x, dy = py - b.y;
      if (dx * dx + dy * dy > CONST.grabRadiusCss * CONST.grabRadiusCss) return;
      var vh = root.innerHeight || (root.document && root.document.documentElement.clientHeight) || 0;
      roomBelow = vh ? vh - (rectTop + b.y) : 0;
      pointerId = e.pointerId !== undefined ? e.pointerId : 1;
      try { if (canvasEl.setPointerCapture) canvasEl.setPointerCapture(pointerId); } catch (err) { /* ignore */ }
      if (e.preventDefault) e.preventDefault();
      x0 = px; y0 = py; head = 0; count = 0;
      P = 0; peakP = 0; lean = -1; lastTick = 0; holdSince = 0; holdEnd = 0; everPulled = false;
      push(px, py, now());
      state = 'PULL'; pulling = true;
      startClock();
      call(opts.onStart);
      updatePull(px, py, now());
    }
    function updatePull(px, py, t) {
      var dy = py - y0;
      P = clamp(dy / dFull(), 0, CONST.powerMax);
      if (P > peakP) peakP = P;
      if (P > 0.02) everPulled = true;
      // hesitation clock: starts when P first reaches the full-draw line, stops at the first sample back under it
      // (that sample IS the flick — the flick samples run through here too, so the clock must never be zeroed by
      // them); easing back up and pulling again restarts it
      if (P >= CONST.holdFromP) { if (!holdSince || holdEnd) { holdSince = t; holdEnd = 0; } }
      else if (holdSince && !holdEnd) holdEnd = t;
      var l = Math.min(3, Math.floor(P * 3));
      var tick = Math.floor(P * 10 + 1e-9);
      if (tick !== lastTick) { lastTick = tick; call(opts.onTick, tick * 10); }
      if (l !== lean) lean = l;
      call(opts.onPull, P, lean);
    }
    function onMove(e) {
      if (state !== 'PULL' || pointerId === null) return;
      if (e.pointerId !== undefined && e.pointerId !== pointerId) return;
      var px = e.clientX - rectLeft, py = e.clientY - rectTop;
      var t = now();
      push(px, py, t);
      updatePull(px, py, t);
      if (e.preventDefault) e.preventDefault();
    }
    function onUp(e) {
      if (state !== 'PULL' || pointerId === null) return;
      if (e.pointerId !== undefined && e.pointerId !== pointerId) return;
      var px = e.clientX - rectLeft, py = e.clientY - rectTop;
      var t = now();
      // a release at the last move's position adds no motion: keep the segment's end at the last real sample
      // (a late pointerup — common on touch — would otherwise dilute the flick speed)
      var li = at(count - 1);
      if (!count || Math.abs(sx[li] - px) > 0.5 || Math.abs(sy[li] - py) > 0.5) push(px, py, t);
      if (e.preventDefault) e.preventDefault();
      computeFlick(t);
    }
    function onCancel(e) {
      if (state !== 'PULL' || pointerId === null) return;
      if (e && e.pointerId !== undefined && e.pointerId !== pointerId) return;
      if (peakP > CONST.noCancelP) finishWith(P, 0, CONST.cancelQuality, 'forced');
      else { state = 'IDLE'; pulling = false; stopClock(); releaseCapture(); call(opts.onCancel); }
    }

    function computeFlick(tEnd) {
      // flick segment: samples within the last 120 ms, or the last 6 samples, whichever is the larger set
      var n = count, last = n - 1, first = last;
      var tLast = st[at(last)];
      for (var i = last; i >= 0; i--) { if (tLast - st[at(i)] <= CONST.flickWindowMs) first = i; else break; }
      var byCount = Math.max(0, n - CONST.flickMinSamples);
      if (byCount < first) first = byCount;
      // power = the pull depth where the flick began, i.e. the reversal: walk back from the release while the
      // samples keep getting deeper (a 2-px jitter tolerance) — that is the bottom of the pull whatever its age
      // (a player who draws, aims for a second and then flicks leaves no samples during the pause, so a time
      // window would skip the bottom and read power off the first flick sample instead). A deeper sample inside
      // the last powerWindowMs still wins (a fast pull snapping straight into the flick).
      var deepestQ = last, dF = dFull();
      for (var q = last - 1; q >= 0; q--) { if (sy[at(q)] >= sy[at(deepestQ)] - CONST.reversalTolCss) { if (sy[at(q)] > sy[at(deepestQ)]) deepestQ = q; } else break; }
      for (var q2 = last; q2 >= 0; q2--) { if (tLast - st[at(q2)] > CONST.powerWindowMs) break; if (sy[at(q2)] > sy[at(deepestQ)]) deepestQ = q2; }
      // DEVIATION (fairness, see the header): the segment never starts before that reversal. A fast pull that snaps
      // straight into the flick would otherwise carry its last downward samples into the 120 ms window, and the chord
      // across the turn would read as WEAK (or, pulled hard enough, as no flick at all). After a pause at the bottom
      // (no samples while the finger is still) the chord starts at the first moving sample instead, so the time the
      // finger rested is not counted as flick time.
      var startQ = deepestQ;
      if (deepestQ < last && st[at(deepestQ + 1)] - st[at(deepestQ)] > CONST.pauseGapMs) startQ = deepestQ + 1;
      if (startQ > first) first = startQ;
      var i0 = at(first), i1 = at(last);
      var dt = st[i1] - st[i0];
      var vx = 0, vy = 0;
      if (dt > 0) { vx = (sx[i1] - sx[i0]) / dt; vy = (sy[i1] - sy[i0]) / dt; }
      if (vy > CONST.noFlickVy || dt <= 0) { mishit('mishit'); return; }
      var deepest = at(deepestQ);
      var power = clamp((sy[deepest] - y0) / dF, 0, CONST.powerMax);
      var aim = Math.atan2(vx, -vy) * 180 / Math.PI;
      if (call(opts.leftFooted)) aim = -aim;
      aim = clamp(aim, -CONST.aimMax, CONST.aimMax);
      var speed = Math.sqrt(vx * vx + vy * vy);
      var weak = speed < CONST.weakSpeed, yanked = speed > CONST.yankSpeed;
      if (weak) power *= CONST.weakMult;
      var yank = yanked ? CONST.yankPenalty : 0;
      // RMS perpendicular deviation of the segment samples from its chord
      var cx = sx[i1] - sx[i0], cy = sy[i1] - sy[i0], clen = Math.sqrt(cx * cx + cy * cy) || 1;
      var sum = 0, m = 0;
      for (var j = first; j <= last; j++) {
        var k = at(j);
        var d = ((sx[k] - sx[i0]) * cy - (sy[k] - sy[i0]) * cx) / clen;
        sum += d * d; m++;
      }
      var rms = m ? Math.sqrt(sum / m) : 0;
      var quality = clamp(1 - clamp(rms / CONST.rmsPerpDiv, 0, 1) - yank, 0, 1);
      // hesitation (§4.6): time spent at P ≥ 0.95 before the flick started (the first sample back under the line)
      var hEnd = holdEnd || tEnd;
      var hold = holdSince && (hEnd - holdSince) > CONST.holdMs ? Math.round(hEnd - holdSince) : 0;
      out.power = clamp(power, 0, CONST.powerMax); out.aim = aim; out.quality = quality; out.holdMs = hold;
      meta.kind = 'flick'; meta.speed = speed; meta.rmsPerp = rms; meta.weak = weak; meta.yanked = yanked; meta.samples = last - first + 1; meta.windowMs = dt;
      release();
    }

    canvasEl.addEventListener('pointerdown', onDown);
    canvasEl.addEventListener('pointermove', onMove);
    canvasEl.addEventListener('pointerup', onUp);
    canvasEl.addEventListener('pointercancel', onCancel);
    canvasEl.addEventListener('lostpointercapture', onCancel);
    root.addEventListener('blur', onCancel);

    return {
      destroy: function () {
        destroyed = true;
        stopClock();
        releaseCapture();
        canvasEl.removeEventListener('pointerdown', onDown);
        canvasEl.removeEventListener('pointermove', onMove);
        canvasEl.removeEventListener('pointerup', onUp);
        canvasEl.removeEventListener('pointercancel', onCancel);
        canvasEl.removeEventListener('lostpointercapture', onCancel);
        root.removeEventListener('blur', onCancel);
      },
      reset: function () { stopClock(); releaseCapture(); state = 'IDLE'; pulling = false; P = 0; peakP = 0; lean = -1; count = 0; head = 0; roomBelow = 0; },
      /** The current D_full in css px (after the viewport-room cap); 0 before the first pointerdown. */
      dFull: function () { return roomBelow ? dFull() : 0; },
      pulling: function () { return pulling; },
      power: function () { return P; },
      lean: function () { return lean < 0 ? 0 : lean; },
      state: function () { return state; },
      clockRemaining: function () { return clockTotal ? Math.max(0, clockTotal - (now() - clockStart)) : 0; },
      clockTotal: function () { return clockTotal; },
      /** Fire the kick with the current values (used by the scene when its own play clock expires). */
      forceRelease: function () { if (state === 'PULL') onClockOut(); }
    };
  };

  // ═══════════════════════════════ meter (aim with the arrows, then hold) ═══════════════════════════════
  /**
   * Aim-then-hold kick input (§4.6). The player aims with ◄ ► (or A/D, or the remapped keys), then holds the
   * confirm key — or a finger anywhere on the canvas — while the power bar climbs from 0 to `powerMax`, and
   * lets go inside the green band. Release timing is the ONLY power input, so contact quality is read from the
   * same release: dead centre of the green is a pure strike, and the further outside it lands the worse the
   * contact. Holding past 1.0 leaves the bar in the red, where the engine's overswing penalty takes over.
   */
  Input.meter = function (opts) {
    opts = opts || {};
    var M = CONST.meter;
    // the aim range is the scene's to set: a punt aims wider than a field goal (Tuning.punt.aimMax), and the
    // nudge and sweep scale with it so the far edge takes the same time to reach
    function aimMax() { var v = typeof opts.aimMax === 'function' ? opts.aimMax() : opts.aimMax; return typeof v === 'number' && v > 0 ? v : CONST.aimMax; }
    function aimScale() { return aimMax() / CONST.aimMax; }
    var state = 'AIM';                 // AIM → POWER → DONE
    var aim = 0, P = 0, tPower = 0;
    var heldDir = 0, heldSince = 0, lastUpdate = 0;
    var holdKey = null, holdPointer = false;
    var clockStart = 0, clockTotal = 0, clockTimer = 0;
    var destroyed = false;
    var out = { power: 0, aim: 0, quality: 0, holdMs: 0 };
    var meta = { kind: 'meter', speed: 0, rmsPerp: 0, weak: false, yanked: false };

    function isActive() { return opts.active ? !!opts.active() : true; }
    function fillMs() { return (opts.pressure || 0) >= M.pressureFast ? M.holdMsPressure : M.holdMs; }
    /** Power after holding for `ms`, clamped at the top of the bar (an over-hold parks in the red). */
    function powerAt(ms) { return clamp(CONST.powerMax * (ms / fillMs()), 0, CONST.powerMax); }

    /**
     * Contact quality for a release at power `p`: 1.0 at the middle of the green band, easing to `edge` at its
     * rim, then falling away outside it. With no green zone to aim at (assists off) every release is `edge`.
     */
    function qualityFor(p) {
      var Q = M.quality;
      var z = call(opts.greenZone);
      if (!z || typeof z.lo !== 'number' || typeof z.hi !== 'number' || z.hi <= z.lo) return Q.edge;
      if (p >= z.lo && p <= z.hi) {
        var mid = (z.lo + z.hi) / 2, half = (z.hi - z.lo) / 2 || Q.halfFallback;
        return Q.edge + (Q.center - Q.edge) * (1 - clamp(Math.abs(p - mid) / half, 0, 1));
      }
      var d = p < z.lo ? z.lo - p : p - z.hi;
      return clamp(Q.edge - Q.missSlope * d, Q.min, Q.edge);
    }

    function startClock() {
      var total = call(opts.playClockMs) || 0;
      clockTotal = total; clockStart = now();
      if (clockTimer) root.clearTimeout(clockTimer);
      if (total > 0) clockTimer = root.setTimeout(onClockOut, total);
    }
    function stopClock() { if (clockTimer) root.clearTimeout(clockTimer); clockTimer = 0; clockStart = 0; clockTotal = 0; }
    function onClockOut() {
      clockTimer = 0;
      if (destroyed || state === 'AIM' || state === 'DONE') return;
      P = powerAt(now() - tPower);
      finish(CONST.cancelQuality, 'clock');
    }
    /** Did this release land inside the green band? (Only then can the assist guarantee the kick.) */
    function releasedInGreen(p) {
      var z = call(opts.greenZone);
      return !!(z && typeof z.lo === 'number' && typeof z.hi === 'number' && p >= z.lo && p <= z.hi);
    }
    function finish(qualityOverride, kind) {
      out.power = clamp(P, 0, CONST.powerMax);
      out.aim = clamp(aim, -aimMax(), aimMax());
      out.quality = qualityOverride !== undefined ? qualityOverride : qualityFor(out.power);
      out.holdMs = 0;
      // §4.6 assist: a release in the green is a guaranteed make unless the player turned it off
      out.green = kind !== 'clock' && releasedInGreen(out.power) && (opts.assist ? !!call(opts.assist) : false);
      meta.kind = kind || 'meter';
      state = 'DONE';
      holdKey = null; holdPointer = false;
      stopClock();
      call(opts.onRelease, out, meta);
    }

    /** Begin the power climb (confirm key down, or a finger on the canvas). */
    function holdStart() {
      if (destroyed || !isActive() || state !== 'AIM') return;
      state = 'POWER'; tPower = now(); P = 0;
      startClock();
      call(opts.onPowerStart);
    }
    /** Let go: kick at the power the bar reached — unless it was a stray tap, which just returns to aiming. */
    function holdEnd() {
      if (destroyed || state !== 'POWER') return;
      P = powerAt(now() - tPower);
      if (P < M.minCommit) {
        state = 'AIM'; P = 0;
        holdKey = null; holdPointer = false;
        call(opts.onPower, 0);
        call(opts.onPowerCancel);
        return;
      }
      finish(undefined, 'meter');
    }
    /** Legacy one-shot entry (RTG.debug / tests): hold and release immediately at the current fill. */
    function press() { if (state === 'AIM') holdStart(); else holdEnd(); }
    function nudge(dir) {
      if (destroyed || !isActive() || state === 'DONE') return;
      if (call(opts.leftFooted)) dir = -dir;
      aim = clamp(aim + dir * M.nudgeDeg * aimScale(), -aimMax(), aimMax());
      call(opts.onAim, aim);
    }
    function keys() { return Input.resolveKeys(call(opts.keys)); }
    function keyDir(e) {
      var k = keys();
      if (Input.keyMatches(e, k.left)) return -1;
      if (Input.keyMatches(e, k.right)) return 1;
      // A / D stay as aliases of the arrows while the arrows are the configured keys (§4.6); once the player has
      // remapped a direction the letter aliases step aside so they cannot shadow the new binding
      var raw = e.key || e.code;
      if (k.left === DEFAULT_KEYS.left && (raw === 'a' || raw === 'A' || raw === 'KeyA')) return -1;
      if (k.right === DEFAULT_KEYS.right && (raw === 'd' || raw === 'D' || raw === 'KeyD')) return 1;
      return 0;
    }
    function isPress(e) {
      var k = keys();
      return Input.keyMatches(e, k.confirm) || Input.keyMatches(e, k.confirmAlt);
    }
    function editable(e) {
      var t = e.target;
      return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    }
    function onKeyDown(e) {
      if (destroyed || editable(e) || !isActive()) return;
      var dir = keyDir(e);
      if (dir) {
        e.preventDefault();
        if (e.repeat) return;
        nudge(dir);
        heldDir = dir; heldSince = now();
        return;
      }
      if (isPress(e)) {
        e.preventDefault();
        if (e.repeat) return;                 // auto-repeat while held must not restart the climb
        if (state === 'AIM' && holdKey === null) { holdKey = e.key || e.code; holdStart(); }
      }
    }
    function onKeyUp(e) {
      var dir = keyDir(e);
      if (dir && dir === heldDir) { heldDir = 0; heldSince = 0; }
      if (holdKey !== null && isPress(e)) { holdKey = null; holdEnd(); }
    }
    function onPointerDown(e) {
      if (destroyed || !isActive() || state !== 'AIM') return;
      if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      holdPointer = true;
      holdStart();
    }
    function onPointerUp() {
      if (!holdPointer) return;
      holdPointer = false;
      holdEnd();
    }

    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('keyup', onKeyUp);
    // the release is caught on the window so dragging off the canvas mid-hold still kicks
    root.addEventListener('pointerup', onPointerUp);
    root.addEventListener('pointercancel', onPointerUp);
    if (opts.canvasEl) opts.canvasEl.addEventListener('pointerdown', onPointerDown);

    return {
      /** Advance the sweeps; call once per frame. */
      update: function (t) {
        if (destroyed || state === 'DONE') return;
        t = t || now();
        var dt = lastUpdate ? Math.min(100, t - lastUpdate) : 0;
        lastUpdate = t;
        if (heldDir && (t - heldSince) > M.sweepAfterMs) {
          var d = heldDir * (call(opts.leftFooted) ? -1 : 1);
          aim = clamp(aim + d * M.sweepDegPerSec * aimScale() * dt / 1000, -aimMax(), aimMax());
          call(opts.onAim, aim);
        }
        if (state === 'POWER') { P = powerAt(t - tPower); call(opts.onPower, P); }
      },
      press: press,
      holdStart: holdStart,
      holdEnd: holdEnd,
      power: function () { return P; },
      state: function () { return state; },
      /** Quality a release would earn right now — the scene tints the bar with it. */
      qualityNow: function () { return qualityFor(P); },
      /** Would a release right now land in the green band? (the scene brightens the bar with it) */
      inGreenNow: function () { return releasedInGreen(P); },
      nudge: nudge,
      destroy: function () {
        destroyed = true; stopClock();
        root.removeEventListener('keydown', onKeyDown);
        root.removeEventListener('keyup', onKeyUp);
        root.removeEventListener('pointerup', onPointerUp);
        root.removeEventListener('pointercancel', onPointerUp);
        if (opts.canvasEl) opts.canvasEl.removeEventListener('pointerdown', onPointerDown);
      },
      reset: function () { stopClock(); state = 'AIM'; P = 0; heldDir = 0; lastUpdate = 0; holdKey = null; holdPointer = false; },
      aim: function () { return aim; },
      clockRemaining: function () { return clockTotal ? Math.max(0, clockTotal - (now() - clockStart)) : 0; },
      clockTotal: function () { return clockTotal; }
    };
  };

  RTG.UI.Input = Input;
})(typeof window !== 'undefined' ? window : globalThis);
