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
 * RTG.UI.Input.meter(opts) — keyboard / 3-click mode (also tap on the canvas = Space).
 *   ←/→ (A/D) nudge aim ±0.5° per tap, hold sweeps 6°/s · Space/Enter #1 starts the power meter (0→1.15 in
 *   900 ms, then back, looping) · #2 locks power · accuracy needle sweeps −1..+1 over 700 ms (500 ms at
 *   pressure ≥ 0.6) · #3 locks: quality = 1 − |needle|, aim += 6°·needle.
 *   opts: {pressure, playClockMs(), leftFooted(), active(), canvasEl?, onAim(aim), onPowerStart(),
 *          onPower(P), onPowerLock(P), onNeedle(n), onRelease(input, meta), onClock(remainingMs, totalMs)}
 *   returns {destroy(), reset(), update(now), press(), nudge(dir), state(), aim(), power(), needle(), clockRemaining(), clockTotal()}
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
    noFlickVy: -0.12, weakSpeed: 0.35, yankSpeed: 2.2, weakMult: 0.85, yankPenalty: 0.15,
    rmsPerpDiv: 14, holdFromP: 0.95, holdMs: 1200, noCancelP: 0.20,
    mishit: { power: 0.5, aimSd: 2, quality: 0.3 }, cancelQuality: 0.5,
    meter: { nudgeDeg: 0.5, sweepDegPerSec: 6, sweepAfterMs: 220, powerMs: 900, needleMs: 700, needleMsPressure: 500, pressureFast: 0.6, aimPerNeedle: 6 }
  };
  Input.CONST = CONST;

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
    var holdSince = 0, everPulled = false;
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
      // DEVIATION (playability): a finger cannot leave the screen, so full power must be reachable within the
      // room below the ball (iPhone 12 portrait leaves ~100 px). Cap D_full at that room minus a margin.
      if (roomBelow > 0) d = Math.min(d, Math.max(CONST.dFullMinCss, roomBelow - CONST.dFullMarginCss));
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
      P = 0; peakP = 0; lean = -1; lastTick = 0; holdSince = 0; everPulled = false;
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
      if (P >= CONST.holdFromP) { if (!holdSince) holdSince = t; } else holdSince = 0;
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
      // power = the pull depth where the flick began: the deepest point reached in the last powerWindowMs before
      // the release (the flick itself starts after the reversal, so its own samples sit above the bottom)
      var deepestQ = first, dF = dFull();
      for (var q = last; q >= 0; q--) { if (tLast - st[at(q)] > CONST.powerWindowMs) break; if (sy[at(q)] > sy[at(deepestQ)]) deepestQ = q; }
      // DEVIATION (fairness, see the header): the segment never starts before that reversal. A fast pull that snaps
      // straight into the flick would otherwise carry its last downward samples into the 120 ms window, and the chord
      // across the turn would read as WEAK (or, pulled hard enough, as no flick at all).
      if (deepestQ > first) first = deepestQ;
      var i0 = at(first), i1 = at(last);
      var dt = st[i1] - st[i0];
      var vx = 0, vy = 0;
      if (dt > 0) { vx = (sx[i1] - sx[i0]) / dt; vy = (sy[i1] - sy[i0]) / dt; }
      if (vy > CONST.noFlickVy || dt <= 0) { mishit('mishit'); return; }
      var deepest = at(deepestQ);
      var power = clamp((sy[deepest] - y0) / dF, 0, CONST.powerMax);
      var flickStartT = st[deepest];
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
      var hold = holdSince && (flickStartT - holdSince) > CONST.holdMs ? Math.round(flickStartT - holdSince) : 0;
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

  // ═══════════════════════════════ meter (keyboard / 3-click) ═══════════════════════════════
  Input.meter = function (opts) {
    opts = opts || {};
    var M = CONST.meter;
    var state = 'AIM';                 // AIM → POWER → NEEDLE → DONE
    var aim = 0, P = 0, needle = 0, tPower = 0, tNeedle = 0, lockedP = 0;
    var heldDir = 0, heldSince = 0, lastUpdate = 0;
    var clockStart = 0, clockTotal = 0, clockTimer = 0;
    var destroyed = false;
    var out = { power: 0, aim: 0, quality: 0, holdMs: 0 };
    var meta = { kind: 'meter', speed: 0, rmsPerp: 0, weak: false, yanked: false };

    function isActive() { return opts.active ? !!opts.active() : true; }
    function needleMs() { return (opts.pressure || 0) >= M.pressureFast ? M.needleMsPressure : M.needleMs; }
    function tri(t, period) { var ph = (t / period) % 2; return ph < 1 ? ph : 2 - ph; }

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
      var t = now();
      if (state === 'POWER') { lockedP = CONST.powerMax * tri(t - tPower, M.powerMs); needle = 0; }
      else needle = -1 + 2 * tri(t - tNeedle, needleMs());
      finish(CONST.cancelQuality, 'clock');
    }
    function finish(qualityOverride, kind) {
      var q = qualityOverride !== undefined ? qualityOverride : clamp(1 - Math.abs(needle), 0, 1);
      var a = aim + M.aimPerNeedle * needle;
      out.power = clamp(lockedP, 0, CONST.powerMax);
      out.aim = clamp(a, -CONST.aimMax, CONST.aimMax);
      out.quality = q; out.holdMs = 0;
      meta.kind = kind || 'meter'; meta.needle = needle;
      state = 'DONE';
      stopClock();
      call(opts.onRelease, out, meta);
    }

    function press() {
      if (destroyed || !isActive()) return;
      var t = now();
      if (state === 'AIM') {
        state = 'POWER'; tPower = t; P = 0;
        startClock();
        call(opts.onPowerStart);
      } else if (state === 'POWER') {
        lockedP = CONST.powerMax * tri(t - tPower, M.powerMs);
        P = lockedP;
        state = 'NEEDLE'; tNeedle = t; needle = -1;
        call(opts.onPowerLock, lockedP);
      } else if (state === 'NEEDLE') {
        needle = -1 + 2 * tri(t - tNeedle, needleMs());
        finish(undefined, 'meter');
      }
    }
    function nudge(dir) {
      if (destroyed || !isActive() || state === 'DONE') return;
      if (call(opts.leftFooted)) dir = -dir;
      aim = clamp(aim + dir * M.nudgeDeg, -CONST.aimMax, CONST.aimMax);
      call(opts.onAim, aim);
    }
    function keyDir(e) {
      var k = e.key || e.code;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A' || k === 'KeyA') return -1;
      if (k === 'ArrowRight' || k === 'd' || k === 'D' || k === 'KeyD') return 1;
      return 0;
    }
    function isPress(e) {
      var k = e.key || e.code;
      return k === ' ' || k === 'Spacebar' || k === 'Space' || k === 'Enter';
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
        if (e.repeat) return;
        press();
      }
    }
    function onKeyUp(e) {
      var dir = keyDir(e);
      if (dir && dir === heldDir) { heldDir = 0; heldSince = 0; }
    }
    function onPointer(e) {
      if (destroyed || !isActive()) return;
      if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      press();
    }

    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('keyup', onKeyUp);
    if (opts.canvasEl) opts.canvasEl.addEventListener('pointerdown', onPointer);

    return {
      /** Advance the sweeps; call once per frame. */
      update: function (t) {
        if (destroyed || state === 'DONE') return;
        t = t || now();
        var dt = lastUpdate ? Math.min(100, t - lastUpdate) : 0;
        lastUpdate = t;
        if (heldDir && (t - heldSince) > M.sweepAfterMs) {
          var d = heldDir * (call(opts.leftFooted) ? -1 : 1);
          aim = clamp(aim + d * M.sweepDegPerSec * dt / 1000, -CONST.aimMax, CONST.aimMax);
          call(opts.onAim, aim);
        }
        if (state === 'POWER') { P = CONST.powerMax * tri(t - tPower, M.powerMs); call(opts.onPower, P); }
        else if (state === 'NEEDLE') { needle = -1 + 2 * tri(t - tNeedle, needleMs()); call(opts.onNeedle, needle); }
      },
      press: press,
      nudge: nudge,
      destroy: function () {
        destroyed = true; stopClock();
        root.removeEventListener('keydown', onKeyDown);
        root.removeEventListener('keyup', onKeyUp);
        if (opts.canvasEl) opts.canvasEl.removeEventListener('pointerdown', onPointer);
      },
      reset: function () { stopClock(); state = 'AIM'; P = 0; needle = 0; lockedP = 0; heldDir = 0; lastUpdate = 0; },
      state: function () { return state; },
      aim: function () { return aim; },
      power: function () { return state === 'NEEDLE' || state === 'DONE' ? lockedP : P; },
      needle: function () { return needle; },
      clockRemaining: function () { return clockTotal ? Math.max(0, clockTotal - (now() - clockStart)) : 0; },
      clockTotal: function () { return clockTotal; }
    };
  };

  RTG.UI.Input = Input;
})(typeof window !== 'undefined' ? window : globalThis);
