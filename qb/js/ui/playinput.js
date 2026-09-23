/**
 * Road to Glory: QB — RTG.UI.PlayInput (the pointer + keyboard layer of the QB moment; modelled on kicker/js/ui/input.js)
 *
 * One controller per mounted scene. It never touches state: it reads the scene through callbacks (where the
 * receivers are, whether input is accepted right now, the green band of the chosen target) and emits through
 * callbacks. The play clock IS the sack clock, which the scene owns — there is no clock in here.
 *
 *   var inp = RTG.UI.PlayInput.create({
 *     canvasEl,                          pointer events target (touch-action: none is set on it)
 *     hitTest(clientX, clientY) → slot | null     the nearest receiver within the scene's hit radius (28 virtual px)
 *     active() → bool                    input accepted right now (SNAP / THROW)
 *     holdMs() → ms                      time for the velocity bar to climb 0 → powerMax (Tuning.qb.throw.meterHoldMs)
 *     greenZone() → {lo, hi} | null      the on-time band for the current target (quality is read against it)
 *     assist() → bool                    Settings ▸ "green = on time": a release inside the band sets input.green
 *     keys() → settings.keys             remaps {confirm, confirmAlt, left, right, up, down, throwAway, scramble}
 *     canThrowAway() → bool · canScramble() → bool
 *     playTime() → s                     the scene's t since the snap (stamped on the emitted input)
 *     onTarget(slot, how)                a receiver was chosen ('tap' | 'key')
 *     onHoldStart() · onHold(P) · onAim(lead, loft) · onHoldCancel()   (a stray release under minCommit → back to ARMED)
 *     onRelease(input)                   {kind:'THROW', target, t, lead, loft, power, quality, green}
 *     onThrowAway() · onScramble() · onStray()   (a tap with no receiver near it and no target yet)
 *   })
 *   → {destroy(), reset(), update(now), state() 'IDLE'|'ARMED'|'HOLD'|'DONE', target(), power(), lead(), loft(),
 *      setTarget(slot, how), cycle(dir), holdStart(), holdEnd(), setLead(v), setLoft(v), qualityNow(), inGreenNow(),
 *      throwAway(), scramble(), slots(list)}
 *
 * The hand (the kicker's aim-then-hold, adapted): a press ON a receiver selects it and starts the velocity climb in the
 * same touch; a press anywhere on the canvas after a target was chosen (by key or by an earlier tap) also starts the
 * climb. While the finger / key is held the bar climbs linearly 0 → powerMax over holdMs and parks at the top; a drag
 * from the press point sets LEAD (dx: −1 behind … +1 ahead of the receiver, over ±leadRangeCss) and LOFT (dy: drag UP
 * for touch, DOWN for a bullet, from 0.5 over ±loftRangeCss), both past a dead zone. The release throws: power = the
 * bar, quality = the release relative to the green band (1.0 at its middle, `edge` at the rim, falling away outside,
 * floor `min`) — the kicker's meter rule verbatim. A release under minCommit is a stray tap: the target stays, no
 * throw. Losing the pointer mid-hold (pointercancel / capture loss / window blur) throws with the current values and
 * quality `cancelQuality` once the bar passed noCancelP, otherwise it is a stray tap.
 * A press with NO target on empty grass is a swipe candidate: a downward swipe of swipeCss within swipeMs is SCRAMBLE
 * (when the scene allows it); a plain release is onStray (the scene shows the hint).
 * Keys: 1–5 pick a receiver in slot order (WR1 WR2 SLOT TE RB); ←/→/↑/↓ cycle the target before the hold and set
 * lead/loft during it (nudge per tap, sweep when held); Tab / Shift+Tab cycle while the canvas or the page body has
 * the focus (never when a button has it); the confirm key held = the climb (auto-repeat ignored), released = the
 * throw; X = throw away, Z = scramble. A / D and W / S alias the arrows while the arrows are unremapped.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var PlayInput = {};

  var CONST = {
    powerMax: 1.15,                                   // the top of the bar (over-held releases park here, in the red)
    minCommit: 0.08,                                  // a release below this is a stray tap: back to ARMED, no throw
    noCancelP: 0.20,                                  // past this a lost pointer throws with the current values
    cancelQuality: 0.5,
    leadRangeCss: 44, loftRangeCss: 56, deadCss: 6,   // drag → lead (±1 over ±44 css px) / loft (0..1 over ±56 css px)
    loftStart: 0.5,
    nudge: 0.1, sweepPerSec: 1.2, sweepAfterMs: 220,  // arrows: one nudge per tap, a sweep after 220 ms held
    swipeCss: 48, swipeMs: 500,                       // swipe DOWN on empty grass without a target = SCRAMBLE
    quality: { center: 1.0, edge: 0.88, missSlope: 2.2, min: 0.3, halfFallback: 0.075 }
  };
  PlayInput.CONST = CONST;

  var DEFAULT_KEYS = { confirm: ' ', confirmAlt: 'Enter', left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', throwAway: 'x', scramble: 'z' };
  PlayInput.DEFAULT_KEYS = DEFAULT_KEYS;
  var SLOTS = ['WR1', 'WR2', 'SLOT', 'TE', 'RB'];
  PlayInput.SLOTS = SLOTS;

  /** Does a KeyboardEvent match a binding stored as a KeyboardEvent.key value (the kicker's Input.keyMatches rule)? */
  PlayInput.keyMatches = function (e, key) {
    if (!e || !key) return false;
    var k = e.key;
    if (key === ' ' || key === 'Space' || key === 'Spacebar') return k === ' ' || k === 'Spacebar' || e.code === 'Space';
    if (k === key) return true;
    if (typeof k === 'string' && k.length === 1 && key.length === 1 && k.toLowerCase() === key.toLowerCase()) return true;
    return !!e.code && e.code === key;
  };
  /** Merge a settings.keys object over the defaults (unset / non-string entries keep the default). */
  PlayInput.resolveKeys = function (raw) {
    var out = {};
    for (var k in DEFAULT_KEYS) if (Object.prototype.hasOwnProperty.call(DEFAULT_KEYS, k)) out[k] = DEFAULT_KEYS[k];
    if (raw && typeof raw === 'object') {
      for (var k2 in out) if (typeof raw[k2] === 'string' && raw[k2]) out[k2] = raw[k2];
    }
    return out;
  };

  function now() { return (root.performance && root.performance.now) ? root.performance.now() : Date.now(); }
  function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
  function call(fn, a, b, c) { if (typeof fn === 'function') return fn(a, b, c); return undefined; }
  function dz(v) { return v > CONST.deadCss ? v - CONST.deadCss : (v < -CONST.deadCss ? v + CONST.deadCss : 0); }

  PlayInput.create = function (opts) {
    opts = opts || {};
    var canvasEl = opts.canvasEl;
    var Q = CONST.quality;
    var state = 'IDLE';                 // IDLE (no target) → ARMED (target chosen) → HOLD (bar climbing) → DONE
    var target = null;
    var P = 0, tHold = 0, lead = 0, loft = CONST.loftStart;
    var pointerId = null, x0 = 0, y0 = 0, tDown = 0, swipeCandidate = false, holdPointer = false, holdKey = null;
    var heldLR = 0, heldUD = 0, heldSinceLR = 0, heldSinceUD = 0, lastUpdate = 0;
    var destroyed = false;
    var out = { kind: 'THROW', target: null, t: 0, lead: 0, loft: 0, power: 0, quality: 0, green: false };   // reused
    var slots = SLOTS.slice();

    if (canvasEl) canvasEl.style.touchAction = 'none';

    function isActive() { return opts.active ? !!opts.active() : true; }
    function holdMs() { var v = call(opts.holdMs); return typeof v === 'number' && v > 0 ? v : 1300; }
    function powerAt(ms) { return clamp(CONST.powerMax * (ms / holdMs()), 0, CONST.powerMax); }
    function zone() {
      var z = call(opts.greenZone);
      return (z && typeof z.lo === 'number' && typeof z.hi === 'number' && z.hi > z.lo) ? z : null;
    }
    /** Release quality against the green band — the kicker's meter rule. */
    function qualityFor(p) {
      var z = zone();
      if (!z) return Q.edge;
      if (p >= z.lo && p <= z.hi) {
        var mid = (z.lo + z.hi) / 2, half = (z.hi - z.lo) / 2 || Q.halfFallback;
        return Q.edge + (Q.center - Q.edge) * (1 - clamp(Math.abs(p - mid) / half, 0, 1));
      }
      var d = p < z.lo ? z.lo - p : p - z.hi;
      return clamp(Q.edge - Q.missSlope * d, Q.min, Q.edge);
    }
    function inGreen(p) { var z = zone(); return !!(z && p >= z.lo && p <= z.hi); }

    function setTarget(slot, how) {
      if (destroyed || state === 'DONE') return false;
      if (slot === null || slot === undefined) return false;
      target = slot;
      if (state === 'IDLE') state = 'ARMED';
      call(opts.onTarget, slot, how || 'key');
      return true;
    }
    function cycle(dir) {
      if (destroyed || state === 'DONE' || !isActive()) return;
      var i = slots.indexOf(target);
      var n = slots.length; if (!n) return;
      i = i < 0 ? (dir > 0 ? 0 : n - 1) : (i + dir + n) % n;
      setTarget(slots[i], 'key');
    }
    function releaseCapture() {
      if (pointerId !== null && canvasEl) {
        try { if (canvasEl.hasPointerCapture && canvasEl.hasPointerCapture(pointerId)) canvasEl.releasePointerCapture(pointerId); } catch (e) { /* ignore */ }
      }
      pointerId = null;
    }
    function holdStart() {
      if (destroyed || !isActive() || state !== 'ARMED') return false;
      state = 'HOLD'; tHold = now(); P = 0; lead = 0; loft = CONST.loftStart;
      call(opts.onHoldStart);
      call(opts.onAim, lead, loft);
      return true;
    }
    function finish(qualityOverride, kind) {
      out.kind = 'THROW';
      out.target = target;
      out.t = +call(opts.playTime) || 0;
      out.lead = clamp(lead, -1, 1); out.loft = clamp(loft, 0, 1);
      out.power = clamp(P, 0, CONST.powerMax);
      out.quality = qualityOverride !== undefined ? qualityOverride : qualityFor(out.power);
      out.green = kind !== 'cancel' && inGreen(out.power) && (opts.assist ? !!call(opts.assist) : false);
      state = 'DONE';
      holdKey = null; holdPointer = false;
      releaseCapture();
      call(opts.onRelease, out);
    }
    function holdEnd() {
      if (destroyed || state !== 'HOLD') return false;
      P = powerAt(now() - tHold);
      if (P < CONST.minCommit) {
        state = 'ARMED'; P = 0;
        holdKey = null; holdPointer = false;
        releaseCapture();
        call(opts.onHold, 0);
        call(opts.onHoldCancel);
        return false;
      }
      finish(undefined, 'release');
      return true;
    }
    function lostPointer() {
      if (state !== 'HOLD') return;
      P = powerAt(now() - tHold);
      if (P > CONST.noCancelP) finish(CONST.cancelQuality, 'cancel');
      else { state = 'ARMED'; P = 0; holdPointer = false; releaseCapture(); call(opts.onHold, 0); call(opts.onHoldCancel); }
    }
    function throwAway() {
      if (destroyed || state === 'DONE' || !isActive()) return false;
      if (opts.canThrowAway && !call(opts.canThrowAway)) return false;
      state = 'DONE'; holdKey = null; holdPointer = false; releaseCapture();
      call(opts.onThrowAway);
      return true;
    }
    function scramble() {
      if (destroyed || state === 'DONE' || !isActive()) return false;
      if (opts.canScramble && !call(opts.canScramble)) return false;
      state = 'DONE'; holdKey = null; holdPointer = false; releaseCapture();
      call(opts.onScramble);
      return true;
    }

    // ── pointer ──
    function onDown(e) {
      if (destroyed || !isActive() || state === 'DONE' || state === 'HOLD' || pointerId !== null) return;
      if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
      if (e.preventDefault) e.preventDefault();
      var slot = call(opts.hitTest, e.clientX, e.clientY);
      pointerId = e.pointerId !== undefined ? e.pointerId : 1;
      try { if (canvasEl.setPointerCapture) canvasEl.setPointerCapture(pointerId); } catch (err) { /* ignore */ }
      x0 = e.clientX; y0 = e.clientY; tDown = now();
      swipeCandidate = false; holdPointer = false;
      if (slot !== null && slot !== undefined && slot !== -1) setTarget(slot, 'tap');
      if (state === 'ARMED') { holdPointer = true; holdStart(); return; }
      swipeCandidate = true;    // nothing chosen yet: a swipe down may still scramble, a plain tap is a stray
    }
    function onMove(e) {
      if (pointerId === null || (e.pointerId !== undefined && e.pointerId !== pointerId)) return;
      if (e.preventDefault) e.preventDefault();
      var dx = e.clientX - x0, dy = e.clientY - y0;
      if (state === 'HOLD' && holdPointer) {
        lead = clamp(dz(dx) / CONST.leadRangeCss, -1, 1);
        loft = clamp(CONST.loftStart - dz(dy) / CONST.loftRangeCss, 0, 1);
        call(opts.onAim, lead, loft);
        return;
      }
      if (swipeCandidate && dy >= CONST.swipeCss && (now() - tDown) <= CONST.swipeMs) {
        swipeCandidate = false;
        if (!scramble()) { releaseCapture(); }
      }
    }
    function onUp(e) {
      if (pointerId === null || (e.pointerId !== undefined && e.pointerId !== pointerId)) return;
      if (e.preventDefault) e.preventDefault();
      if (state === 'HOLD' && holdPointer) { holdEnd(); return; }
      var stray = swipeCandidate;
      swipeCandidate = false;
      releaseCapture();
      if (stray && state !== 'DONE') call(opts.onStray);
    }
    function onCancel(e) {
      if (pointerId === null) return;
      if (e && e.pointerId !== undefined && e.pointerId !== pointerId) return;
      swipeCandidate = false;
      if (state === 'HOLD' && holdPointer) lostPointer(); else releaseCapture();
    }
    function onBlur() { if (state === 'HOLD') lostPointer(); }

    // ── keyboard ──
    function keys() { return PlayInput.resolveKeys(call(opts.keys)); }
    function isConfirm(e) { var k = keys(); return PlayInput.keyMatches(e, k.confirm) || PlayInput.keyMatches(e, k.confirmAlt); }
    function keyLR(e) {
      var k = keys(), raw = e.key || e.code;
      if (PlayInput.keyMatches(e, k.left)) return -1;
      if (PlayInput.keyMatches(e, k.right)) return 1;
      if (k.left === DEFAULT_KEYS.left && (raw === 'a' || raw === 'A' || raw === 'KeyA')) return -1;
      if (k.right === DEFAULT_KEYS.right && (raw === 'd' || raw === 'D' || raw === 'KeyD')) return 1;
      return 0;
    }
    function keyUD(e) {
      var k = keys(), raw = e.key || e.code;
      if (PlayInput.keyMatches(e, k.up)) return 1;
      if (PlayInput.keyMatches(e, k.down)) return -1;
      if (k.up === DEFAULT_KEYS.up && (raw === 'w' || raw === 'W' || raw === 'KeyW')) return 1;
      if (k.down === DEFAULT_KEYS.down && (raw === 's' || raw === 'S' || raw === 'KeyS')) return -1;
      return 0;
    }
    function editable(e) {
      var t = e.target;
      return !!(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable));
    }
    function onButton(e) { var t = e.target; return !!(t && (t.tagName === 'BUTTON' || t.tagName === 'A')); }
    function onKeyDown(e) {
      if (destroyed || editable(e) || !isActive() || state === 'DONE') return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      var k = keys(), key = e.key || '';
      if (key >= '1' && key <= '5' && key.length === 1) {
        var i = key.charCodeAt(0) - 49;
        if (i < slots.length && state !== 'HOLD') { e.preventDefault(); setTarget(slots[i], 'key'); }
        return;
      }
      if (key === 'Tab' && !onButton(e)) {
        var ae = root.document && root.document.activeElement;
        if (!ae || ae === root.document.body || ae === canvasEl) { e.preventDefault(); if (state !== 'HOLD' && !e.repeat) cycle(e.shiftKey ? -1 : 1); }
        return;
      }
      var lr = keyLR(e), ud = keyUD(e);
      if (lr || ud) {
        e.preventDefault();
        if (e.repeat) return;
        if (state === 'HOLD') {
          if (lr) { lead = clamp(lead + lr * CONST.nudge, -1, 1); heldLR = lr; heldSinceLR = now(); }
          if (ud) { loft = clamp(loft + ud * CONST.nudge, 0, 1); heldUD = ud; heldSinceUD = now(); }
          call(opts.onAim, lead, loft);
        } else cycle(lr || ud);
        return;
      }
      if (isConfirm(e)) {
        if (onButton(e)) return;              // a focused THROW AWAY / SCRAMBLE button takes Space / Enter itself
        e.preventDefault();
        if (e.repeat) return;
        if (state === 'ARMED' && holdKey === null) { holdKey = e.key || e.code; holdStart(); }
        else if (state === 'IDLE') call(opts.onStray);
        return;
      }
      if (PlayInput.keyMatches(e, k.throwAway)) { e.preventDefault(); throwAway(); return; }
      if (PlayInput.keyMatches(e, k.scramble)) { e.preventDefault(); scramble(); }
    }
    function onKeyUp(e) {
      var lr = keyLR(e), ud = keyUD(e);
      if (lr && lr === heldLR) { heldLR = 0; heldSinceLR = 0; }
      if (ud && ud === heldUD) { heldUD = 0; heldSinceUD = 0; }
      if (holdKey !== null && isConfirm(e)) { holdKey = null; holdEnd(); }
    }

    if (canvasEl) {
      canvasEl.addEventListener('pointerdown', onDown);
      canvasEl.addEventListener('pointermove', onMove);
      canvasEl.addEventListener('pointerup', onUp);
      canvasEl.addEventListener('pointercancel', onCancel);
      canvasEl.addEventListener('lostpointercapture', onCancel);
    }
    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('keyup', onKeyUp);
    root.addEventListener('blur', onBlur);

    return {
      /** Advance the bar and the arrow sweeps; call once per frame. */
      update: function (t) {
        if (destroyed || state === 'DONE') return;
        t = t || now();
        var dt = lastUpdate ? Math.min(100, t - lastUpdate) : 0;
        lastUpdate = t;
        if (state !== 'HOLD') return;
        var moved = false;
        if (heldLR && (t - heldSinceLR) > CONST.sweepAfterMs) { lead = clamp(lead + heldLR * CONST.sweepPerSec * dt / 1000, -1, 1); moved = true; }
        if (heldUD && (t - heldSinceUD) > CONST.sweepAfterMs) { loft = clamp(loft + heldUD * CONST.sweepPerSec * dt / 1000, 0, 1); moved = true; }
        if (moved) call(opts.onAim, lead, loft);
        P = powerAt(t - tHold);
        call(opts.onHold, P);
      },
      state: function () { return state; },
      target: function () { return target; },
      power: function () { return P; },
      lead: function () { return lead; },
      loft: function () { return loft; },
      setTarget: setTarget,
      cycle: cycle,
      holdStart: function () { if (state === 'IDLE') call(opts.onStray); return holdStart(); },
      holdEnd: holdEnd,
      setLead: function (v) { if (state === 'HOLD') { lead = clamp(+v || 0, -1, 1); call(opts.onAim, lead, loft); } },
      setLoft: function (v) { if (state === 'HOLD') { loft = clamp(+v || 0, 0, 1); call(opts.onAim, lead, loft); } },
      qualityNow: function () { return qualityFor(P); },
      inGreenNow: function () { return inGreen(P); },
      throwAway: throwAway,
      scramble: scramble,
      /** The slot order the number keys / cycling use (the scene passes the receivers' slot list). */
      slots: function (list) { if (Array.isArray(list) && list.length) slots = list.slice(); return slots.slice(); },
      reset: function () { state = 'IDLE'; target = null; P = 0; lead = 0; loft = CONST.loftStart; holdKey = null; holdPointer = false; swipeCandidate = false; heldLR = 0; heldUD = 0; lastUpdate = 0; releaseCapture(); },
      destroy: function () {
        destroyed = true;
        releaseCapture();
        if (canvasEl) {
          canvasEl.removeEventListener('pointerdown', onDown);
          canvasEl.removeEventListener('pointermove', onMove);
          canvasEl.removeEventListener('pointerup', onUp);
          canvasEl.removeEventListener('pointercancel', onCancel);
          canvasEl.removeEventListener('lostpointercapture', onCancel);
        }
        root.removeEventListener('keydown', onKeyDown);
        root.removeEventListener('keyup', onKeyUp);
        root.removeEventListener('blur', onBlur);
      }
    };
  };

  RTG.UI.PlayInput = PlayInput;
})(typeof window !== 'undefined' ? window : globalThis);
