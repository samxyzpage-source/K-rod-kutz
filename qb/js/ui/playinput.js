/**
 * Road to Glory: QB — RTG.UI.PlayInput (the DRAW layer of the QB moment: a line from the quarterback is the ball's
 * path or his run; modelled on kicker/js/ui/input.js's pointer rules)
 *
 * One controller per live play. It never touches the engine: it turns a finger (or the keyboard) into a DRAFT — a
 * polyline in FIELD YARDS (x lateral from the ball, y downfield from the line) plus a loft 0..1 — and hands it to the
 * scene, which classifies it with live.classify every frame and commits it through live.throwAlong / setRun /
 * throwAway. No clock lives in here (the scene owns the time scale and the slow-motion budget).
 *
 *   var inp = RTG.UI.PlayInput.create({
 *     canvasEl,                               pointer events target (touch-action: none)
 *     active() → bool                         a draft may start / continue (PLAY, the QB has the ball, no modal)
 *     qbHit(clientX, clientY) → bool          the press is within the start radius of the quarterback (css px, the scene converts)
 *     toField(clientX, clientY, out) → out    client css px → field yards {x, y} (the scene's exact inverse projection)
 *     cssHeight() → px                        the canvas' css height (the draw speed is measured in canvas-heights / s)
 *     qbAt(out) → out                         the quarterback's field position now (keyboard lines start there)
 *     propose(slot, loft, out, fast) → out | null   keyboard: the spot receiver `slot` can reach for a straight line
 *                                             (fast: the engine's live.aim only — called every frame; else classify-checked)
 *     keys() → settings.keys                  remaps (see DEFAULT_KEYS)
 *     onDraftStart(source 'pointer'|'key', mode 'PASS'|'RUN'|null) · onDraftEnd(reason 'commit'|'cancel')
 *     onCommit({source, mode, points: [{x, y}] (a fresh copy), loft})
 *     onThrowAway() · onStray(reason)          (a press away from the QB · a confirm with nothing drafted)
 *   })
 *   → { update(now) → bool (the draft changed), drafting(), source(), mode(), points() (pooled array, valid until the
 *       next update), count(), loft(), loftName(), speedHps(), cancel(), commit(), proposePass(slot), startRun(),
 *       nudge(dx, dy), bend(d), cycleLoft(), setLoft(v), reset(), destroy() }
 *
 * THE POINTER (the kicker's capture rules): a press within the start radius of the QB starts a draft (first pointer
 * only; setPointerCapture; mouse button 0); moves collect samples in css px (a sample every ≥ 1.5 px); once per
 * animation frame (update) the samples become field yards, are RESAMPLED to `draw.resampleYd` spacing (the first and
 * the last point kept) and lightly smoothed (one [¼ ½ ¼] pass over the interior); the loft is the average draw speed —
 * the stroke's css length ÷ the canvas' css height ÷ the seconds from the first move past `deadCss` to the last sample —
 * mapped linearly from `draw.loft.fastHps` (and faster: 0, a bullet) to `draw.loft.slowHps` (and slower: 1, a lob).
 * pointerup commits — unless the finger never got minStrokeCss from the press (a tap on the QB is nothing); pointercancel, a lost capture and a window blur DISCARD the draft (never a throw). A press away
 * from the QB is a stray (the scene says 'START ON THE QB').
 *
 * THE KEYBOARD (a complete path): 1–5 start a PASS draft to that receiver (slot order WR1 WR2 SLOT TE RB): a straight
 * line from the QB to the spot he can reach (opts.propose; the line FOLLOWS that spot every frame, and a new loft
 * re-aims it); ←/→/↑/↓ nudge the line's end 1 yd off it (field axes: → is +x, ↑ is downfield); Q / E bend the line (a control point at the middle, 1 yd per press, ±15); L cycles BULLET → TOUCH →
 * LOB; Enter / Space commits; Backspace cancels; R (or the scramble key, Z) starts a RUN draft (5 yd straight ahead;
 * the arrows steer, Enter commits); X throws it away. A / D and W / S alias the arrows while the arrows are unremapped.
 * Keyboard lines are rebuilt every update from the QB's CURRENT spot (he keeps dropping while you compose).
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var PlayInput = {};

  /** Presentation-side constants of the hand (the balance lives in Tuning.qb.draw; DRAW_DEFAULTS stand in until it exists). */
  var CONST = {
    maxRaw: 1024,                 // raw pointer samples kept per stroke (a sample every ≥ minStepCss)
    minStepCss: 1.5,              // css px a move must cover to be sampled
    deadCss: 4,                   // the stroke's clock starts at the first sample this far from the press
    restMs: 60, frameMs: 16.7,    // … from the sample before it when that one is this recent, else one frame before it
    minStrokeCss: 14,             // a stroke that never gets this far from the press is a tap, not a line (a twitch on the QB's helmet is not a 2-yd run)
    maxPoints: 240,               // resampled points handed to classify (a 240-yd line is already absurd)
    minDurS: 0.03,                // a stroke faster than this reads as this long (no division by ~0)
    nudgeYd: 1, bendYd: 1, bendMax: 15, runAheadYd: 5,
    lofts: [0, 0.5, 1], loftNames: ['BULLET', 'TOUCH', 'LOB'], loftKeyDefault: 1
  };
  PlayInput.CONST = CONST;
  /** Fallbacks for Tuning.qb.draw (the engine's block wins field by field). */
  var DRAW_DEFAULTS = { slowMo: 0.15, slowMoBudgetS: 4, startR: 2.5, minLen: 2, reachSlack: 0.2, greenMargin: 0.3, previewIq: 70, loft: { fastHps: 2.4, slowHps: 0.5 }, assistYd: 2.5, resampleYd: 0.75 };
  PlayInput.DRAW_DEFAULTS = DRAW_DEFAULTS;
  /** Tuning.qb.draw merged over DRAW_DEFAULTS, read at call time (RTG.debug.tune edits apply). Allocation-free: returns a shared object. */
  var drawOut = { slowMo: 0, slowMoBudgetS: 0, startR: 0, minLen: 0, reachSlack: 0, greenMargin: 0, previewIq: 0, loft: { fastHps: 0, slowHps: 0 }, assistYd: 0, resampleYd: 0 };
  function dnum(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  PlayInput.draw = function () {
    var T = (RTG.Tuning && RTG.Tuning.qb && RTG.Tuning.qb.draw) || {}, D = DRAW_DEFAULTS, L = T.loft || {};
    drawOut.slowMo = dnum(T.slowMo, D.slowMo); drawOut.slowMoBudgetS = dnum(T.slowMoBudgetS, D.slowMoBudgetS);
    drawOut.startR = dnum(T.startR, D.startR); drawOut.minLen = dnum(T.minLen, D.minLen); drawOut.reachSlack = dnum(T.reachSlack, D.reachSlack);
    drawOut.greenMargin = dnum(T.greenMargin, D.greenMargin); drawOut.previewIq = dnum(T.previewIq, D.previewIq);
    drawOut.loft.fastHps = dnum(L.fastHps, D.loft.fastHps); drawOut.loft.slowHps = dnum(L.slowHps, D.loft.slowHps);
    drawOut.assistYd = dnum(T.assistYd, D.assistYd); drawOut.resampleYd = Math.max(0.25, dnum(T.resampleYd, D.resampleYd));
    return drawOut;
  };
  /** Loft 0..1 from an average draw speed in canvas-heights / s: ≥ fastHps → 0 (bullet), ≤ slowHps → 1 (lob), linear between. */
  PlayInput.loftFor = function (hps) {
    if (RTG.Field && typeof RTG.Field.loftFor === 'function') return RTG.Field.loftFor(hps);   // the engine's rule when it has one
    var d = PlayInput.draw(), f = d.loft.fastHps, s = d.loft.slowHps;
    if (!(hps === hps)) return 0.5;
    if (f <= s) return hps >= f ? 0 : 1;
    var u = (f - hps) / (f - s);
    return u < 0 ? 0 : (u > 1 ? 1 : u);
  };
  /** 'BULLET' | 'TOUCH' | 'LOB' for a loft (thirds). */
  PlayInput.touchName = function (loft) { return loft < 1 / 3 ? 'BULLET' : (loft < 2 / 3 ? 'TOUCH' : 'LOB'); };

  var DEFAULT_KEYS = {
    confirm: ' ', confirmAlt: 'Enter', left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown',
    throwAway: 'x', scramble: 'z', run: 'r', bendLeft: 'q', bendRight: 'e', loft: 'l', cancel: 'Backspace'
  };
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

  PlayInput.create = function (opts) {
    opts = opts || {};
    var canvasEl = opts.canvasEl;
    var destroyed = false;
    // the draft
    var drafting = false, source = null, mode = null, dirty = false;
    var loft = 0.5, loftIdx = CONST.loftKeyDefault, speed = 0;
    // pointer samples (client css px, ms) and their field conversion
    var N = CONST.maxRaw;
    var rawX = new Float64Array(N), rawY = new Float64Array(N), rawT = new Float64Array(N), fX = new Float64Array(N), fY = new Float64Array(N);
    var rawN = 0, convN = 0, pointerId = null, tMove0 = 0, tLast = 0, cssLen = 0, moved = false, reach2 = 0;
    // the resampled draft (field yd) — pooled point objects in a reused array
    var M = CONST.maxPoints;
    var pool = [], pts = [], pX = new Float64Array(M), pY = new Float64Array(M), nPts = 0;
    for (var pi = 0; pi < M; pi++) pool.push({ x: 0, y: 0 });
    // the keyboard draft: the receiver (PASS) and the player's offsets from his reachable spot (RUN: from the QB), the end
    // (field yd, rebuilt every update so the line follows the receiver / the QB), the bend (yd, + = right of the direction)
    var kSlot = null, kDX = 0, kDY = 0, kEndX = 0, kEndY = 0, kBend = 0;
    var tmp = { x: 0, y: 0 }, qbPt = { x: 0, y: 0 };

    if (canvasEl) canvasEl.style.touchAction = 'none';

    function isActive() { return opts.active ? !!opts.active() : true; }
    function keys() { return PlayInput.resolveKeys(call(opts.keys)); }

    function begin(src, m) {
      drafting = true; source = src; mode = m; dirty = true;
      call(opts.onDraftStart, src, m);
    }
    function end(reason) {
      var was = drafting;
      drafting = false; source = null; mode = null; dirty = false; nPts = 0; pts.length = 0; rawN = 0; convN = 0;
      releaseCapture();
      if (was) call(opts.onDraftEnd, reason);
    }
    function releaseCapture() {
      if (pointerId !== null && canvasEl) {
        try { if (canvasEl.hasPointerCapture && canvasEl.hasPointerCapture(pointerId)) canvasEl.releasePointerCapture(pointerId); } catch (e) { /* ignore */ }
      }
      pointerId = null;
    }

    // ── building the draft's points ──
    /** Resample the field polyline fX/fY[0..n) at `step` yd into pX/pY (first and last kept) and smooth the interior once. */
    function resample(n, step) {
      nPts = 0;
      if (n <= 0) return;
      pX[0] = fX[0]; pY[0] = fY[0]; nPts = 1;
      if (n === 1) return;
      var carry = 0, i;
      for (i = 1; i < n && nPts < M - 1; i++) {
        var ax = fX[i - 1], ay = fY[i - 1], dx = fX[i] - ax, dy = fY[i] - ay, d = Math.sqrt(dx * dx + dy * dy);
        if (!(d > 0)) continue;
        var s = step - carry;
        while (s <= d && nPts < M - 1) { pX[nPts] = ax + dx * s / d; pY[nPts] = ay + dy * s / d; nPts++; s += step; }
        carry = d - (s - step);
      }
      var lx = fX[n - 1], ly = fY[n - 1], ex = pX[nPts - 1] - lx, ey = pY[nPts - 1] - ly;
      if (ex * ex + ey * ey > step * step * 0.0625 || nPts === 1) { pX[nPts] = lx; pY[nPts] = ly; nPts++; }
      else { pX[nPts - 1] = lx; pY[nPts - 1] = ly; }
      // one [¼ ½ ¼] pass over the interior (the ends stay where the finger put them)
      var prevX = pX[0], prevY = pY[0];
      for (i = 1; i < nPts - 1; i++) {
        var cx = pX[i], cy = pY[i];
        pX[i] = 0.25 * prevX + 0.5 * cx + 0.25 * pX[i + 1];
        pY[i] = 0.25 * prevY + 0.5 * cy + 0.25 * pY[i + 1];
        prevX = cx; prevY = cy;
      }
    }
    function publish() {
      pts.length = nPts;
      for (var i = 0; i < nPts; i++) { var p = pool[i]; p.x = pX[i]; p.y = pY[i]; pts[i] = p; }
    }
    function buildPointer() {
      for (; convN < rawN; convN++) {
        call(opts.toField, rawX[convN], rawY[convN], tmp);
        fX[convN] = tmp.x; fY[convN] = tmp.y;
      }
      // the line starts ON the quarterback (where he is now): the press was anywhere in the start circle (≥ 22 css
      // px, feet to chest), which can be yards from him on a small screen or over his helmet — the engine wants the
      // first point within draw.startR of him, so the draft is anchored on him, as a finger on him means
      if (typeof opts.qbAt === 'function' && rawN > 0) { call(opts.qbAt, qbPt); fX[0] = qbPt.x; fY[0] = qbPt.y; }
      resample(rawN, PlayInput.draw().resampleYd);
      publish();
      // loft from the average draw speed (canvas-heights / s)
      var h = +call(opts.cssHeight) || 320;
      var dur = moved ? Math.max(CONST.minDurS, (tLast - tMove0) / 1000) : CONST.minDurS;
      speed = moved ? (cssLen / h) / dur : 0;
      loft = moved ? PlayInput.loftFor(speed) : 0.5;
    }
    /** Keyboard line: the QB → the end, bent through a quadratic control point at the middle, sampled every resampleYd. */
    function buildKey() {
      call(opts.qbAt, qbPt);
      if (mode === 'PASS' && kSlot) {
        var sp = call(opts.propose, kSlot, CONST.lofts[loftIdx], tmp, true);    // his reachable spot NOW for this loft (the fast form)
        if (sp) { kEndX = sp.x + kDX; kEndY = sp.y + kDY; }
      } else if (mode === 'RUN') { kEndX = qbPt.x + kDX; kEndY = qbPt.y + kDY; }
      var x0 = qbPt.x, y0 = qbPt.y, x1 = kEndX, y1 = kEndY;
      var dx = x1 - x0, dy = y1 - y0, d = Math.sqrt(dx * dx + dy * dy) || 1;
      // + bend = to the right of the direction of travel (the normal (dy, −dx) / d)
      var cx = (x0 + x1) / 2 + kBend * dy / d, cy = (y0 + y1) / 2 - kBend * dx / d;
      var approx = d + Math.abs(kBend), step = PlayInput.draw().resampleYd;
      var n = clamp(Math.ceil(approx / step), 2, M - 1);
      for (var i = 0; i <= n; i++) {
        var u = i / n, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
        pX[i] = a * x0 + b * cx + c * x1; pY[i] = a * y0 + b * cy + c * y1;
      }
      nPts = n + 1;
      publish();
      loft = CONST.lofts[loftIdx]; speed = 0;
    }

    // ── keyboard drafts ──
    function proposePass(slot) {
      if (destroyed || !isActive()) return false;
      var i = SLOTS.indexOf(slot);
      if (i < 0) return false;
      var spot = call(opts.propose, slot, CONST.lofts[loftIdx], tmp, false);
      if (!spot) return false;
      if (drafting && source === 'pointer') end('cancel');
      kSlot = slot; kDX = 0; kDY = 0; kEndX = spot.x; kEndY = spot.y; kBend = 0;
      // the full proposal may have searched past the fast one: keep the difference as the player's offset
      var fast = call(opts.propose, slot, CONST.lofts[loftIdx], { x: 0, y: 0 }, true);
      if (fast) { kDX = spot.x - fast.x; kDY = spot.y - fast.y; }
      if (!drafting) begin('key', 'PASS'); else { mode = 'PASS'; source = 'key'; dirty = true; }
      dirty = true;
      return true;
    }
    function startRun() {
      if (destroyed || !isActive()) return false;
      if (drafting && source === 'pointer') end('cancel');
      call(opts.qbAt, qbPt);
      kSlot = null; kDX = 0; kDY = CONST.runAheadYd; kEndX = qbPt.x; kEndY = qbPt.y + CONST.runAheadYd; kBend = 0;
      if (!drafting) begin('key', 'RUN'); else { mode = 'RUN'; source = 'key'; }
      dirty = true;
      return true;
    }
    function nudge(dx, dy) {
      if (!drafting || source !== 'key') return false;
      kDX += (+dx || 0) * CONST.nudgeYd; kDY += (+dy || 0) * CONST.nudgeYd;
      kEndX += (+dx || 0) * CONST.nudgeYd; kEndY += (+dy || 0) * CONST.nudgeYd; dirty = true;
      return true;
    }
    function bend(d) {
      if (!drafting || source !== 'key') return false;
      kBend = clamp(kBend + (+d || 0) * CONST.bendYd, -CONST.bendMax, CONST.bendMax); dirty = true;
      return true;
    }
    function cycleLoft() {
      loftIdx = (loftIdx + 1) % CONST.lofts.length;
      if (drafting && source === 'key') { loft = CONST.lofts[loftIdx]; dirty = true; }
      return CONST.loftNames[loftIdx];
    }
    function commit() {
      if (!drafting) return false;
      if (dirty) { if (source === 'key') buildKey(); else buildPointer(); dirty = false; }
      var copy = new Array(nPts);
      for (var i = 0; i < nPts; i++) copy[i] = { x: pX[i], y: pY[i] };
      var info = { source: source, mode: mode, points: copy, loft: loft };
      end('commit');
      call(opts.onCommit, info);
      return true;
    }

    // ── pointer ──
    function stamp(e) { var t = e && typeof e.timeStamp === 'number' && e.timeStamp > 0 ? e.timeStamp : now(); return t; }
    function pushSample(x, y, t) {
      if (rawN >= N) { rawX[N - 1] = x; rawY[N - 1] = y; rawT[N - 1] = t; if (convN > N - 1) convN = N - 1; return; }
      rawX[rawN] = x; rawY[rawN] = y; rawT[rawN] = t; rawN++;
    }
    function onDown(e) {
      if (destroyed || pointerId !== null) return;
      if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
      if (!isActive()) return;
      if (!call(opts.qbHit, e.clientX, e.clientY)) { call(opts.onStray, 'START ON THE QB'); return; }
      if (e.preventDefault) e.preventDefault();
      if (drafting) end('cancel');                  // a keyboard draft gives way to the finger
      pointerId = e.pointerId !== undefined ? e.pointerId : 1;
      try { if (canvasEl.setPointerCapture) canvasEl.setPointerCapture(pointerId); } catch (err) { /* ignore */ }
      rawN = 0; convN = 0; cssLen = 0; moved = false; tMove0 = 0; reach2 = 0;
      var t = stamp(e);
      tLast = t;
      pushSample(e.clientX, e.clientY, t);
      loft = 0.5; speed = 0;
      begin('pointer', null);
    }
    function onMove(e) {
      if (pointerId === null || (e.pointerId !== undefined && e.pointerId !== pointerId)) return;
      if (e.preventDefault) e.preventDefault();
      if (!drafting || source !== 'pointer') return;
      var li = rawN - 1, dx = e.clientX - rawX[li], dy = e.clientY - rawY[li], d = Math.sqrt(dx * dx + dy * dy);
      if (d < CONST.minStepCss) return;
      var t = stamp(e);
      if (!moved) {
        var ox = e.clientX - rawX[0], oy = e.clientY - rawY[0];
        // the stroke's clock starts when the finger leaves the QB: a finger that rested on him first is not drawing
        // slowly (the previous sample counts only when it is recent; else one frame before this one)
        if (ox * ox + oy * oy >= CONST.deadCss * CONST.deadCss) { moved = true; tMove0 = t - rawT[li] < CONST.restMs ? rawT[li] : t - CONST.frameMs; }
      }
      cssLen += d; tLast = t;
      var rx = e.clientX - rawX[0], ry = e.clientY - rawY[0];
      if (rx * rx + ry * ry > reach2) reach2 = rx * rx + ry * ry;
      pushSample(e.clientX, e.clientY, t);
      dirty = true;
    }
    function onUp(e) {
      if (pointerId === null || (e.pointerId !== undefined && e.pointerId !== pointerId)) return;
      if (e.preventDefault) e.preventDefault();
      if (!drafting || source !== 'pointer') { releaseCapture(); return; }
      // a release at the last move's position adds no motion (a late pointerup would dilute the speed)
      var li = rawN - 1, dx = e.clientX - rawX[li], dy = e.clientY - rawY[li];
      if (dx * dx + dy * dy >= CONST.minStepCss * CONST.minStepCss) { cssLen += Math.sqrt(dx * dx + dy * dy); tLast = stamp(e); pushSample(e.clientX, e.clientY, tLast); if (!moved) { moved = true; tMove0 = rawT[0]; } }
      var ux = e.clientX - rawX[0], uy = e.clientY - rawY[0];
      if (ux * ux + uy * uy > reach2) reach2 = ux * ux + uy * uy;
      if (reach2 < CONST.minStrokeCss * CONST.minStrokeCss) { end('cancel'); return; }   // a tap on the QB is nothing
      dirty = true;
      commit();
    }
    function onCancel(e) {
      if (pointerId === null) return;
      if (e && e.pointerId !== undefined && e.pointerId !== pointerId) return;
      if (drafting && source === 'pointer') end('cancel'); else releaseCapture();
    }
    function onBlur() { if (drafting && source === 'pointer') end('cancel'); }

    // ── keyboard ──
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
      if (destroyed || editable(e) || !isActive()) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (drafting && source === 'pointer') {                 // the finger owns the draft; only Backspace cancels it
        if (PlayInput.keyMatches(e, keys().cancel)) { e.preventDefault(); end('cancel'); }
        return;
      }
      var k = keys(), key = e.key || '';
      if (key >= '1' && key <= '5' && key.length === 1) { e.preventDefault(); if (!e.repeat) proposePass(SLOTS[key.charCodeAt(0) - 49]); return; }
      var lr = keyLR(e), ud = keyUD(e);
      if (lr || ud) {
        if (drafting) { e.preventDefault(); nudge(lr, ud); }
        return;
      }
      if (PlayInput.keyMatches(e, k.bendLeft)) { if (drafting) { e.preventDefault(); bend(-1); } return; }
      if (PlayInput.keyMatches(e, k.bendRight)) { if (drafting) { e.preventDefault(); bend(1); } return; }
      if (PlayInput.keyMatches(e, k.loft)) { e.preventDefault(); if (!e.repeat) cycleLoft(); return; }
      if (PlayInput.keyMatches(e, k.cancel)) { if (drafting) { e.preventDefault(); end('cancel'); } return; }
      if (PlayInput.keyMatches(e, k.confirm) || PlayInput.keyMatches(e, k.confirmAlt)) {
        if (onButton(e)) return;                              // a focused THROW AWAY button keeps its own Space / Enter
        e.preventDefault();
        if (e.repeat) return;
        if (drafting) commit(); else call(opts.onStray, 'NOTHING DRAWN');
        return;
      }
      if (PlayInput.keyMatches(e, k.run) || PlayInput.keyMatches(e, k.scramble)) { e.preventDefault(); if (!e.repeat) startRun(); return; }
      if (PlayInput.keyMatches(e, k.throwAway)) { e.preventDefault(); if (!e.repeat) { if (drafting) end('cancel'); call(opts.onThrowAway); } }
    }

    if (canvasEl) {
      canvasEl.addEventListener('pointerdown', onDown);
      canvasEl.addEventListener('pointermove', onMove);
      canvasEl.addEventListener('pointerup', onUp);
      canvasEl.addEventListener('pointercancel', onCancel);
      canvasEl.addEventListener('lostpointercapture', onCancel);
    }
    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('blur', onBlur);

    return {
      /** Once per animation frame: rebuild the draft's points when samples arrived (keyboard drafts every frame: the QB moves). */
      update: function () {
        if (destroyed || !drafting) return false;
        if (!isActive()) { end('cancel'); return true; }
        if (source === 'key') { buildKey(); dirty = false; return true; }
        if (!dirty) return false;
        buildPointer(); dirty = false;
        return true;
      },
      drafting: function () { return drafting; },
      source: function () { return source; },
      mode: function () { return mode; },
      points: function () { return pts; },
      count: function () { return nPts; },
      loft: function () { return loft; },
      loftName: function () { return PlayInput.touchName(loft); },
      speedHps: function () { return speed; },
      cancel: function () { if (drafting) end('cancel'); },
      commit: commit,
      proposePass: proposePass,
      startRun: startRun,
      nudge: nudge,
      bend: bend,
      cycleLoft: cycleLoft,
      setLoft: function (v) { loft = clamp(+v || 0, 0, 1); var best = 0; for (var i = 1; i < CONST.lofts.length; i++) if (Math.abs(CONST.lofts[i] - loft) < Math.abs(CONST.lofts[best] - loft)) best = i; loftIdx = best; dirty = true; },
      reset: function () { end('cancel'); loftIdx = CONST.loftKeyDefault; kBend = 0; },
      destroy: function () {
        if (destroyed) return;
        end('cancel');
        destroyed = true;
        if (canvasEl) {
          canvasEl.removeEventListener('pointerdown', onDown);
          canvasEl.removeEventListener('pointermove', onMove);
          canvasEl.removeEventListener('pointerup', onUp);
          canvasEl.removeEventListener('pointercancel', onCancel);
          canvasEl.removeEventListener('lostpointercapture', onCancel);
        }
        root.removeEventListener('keydown', onKeyDown);
        root.removeEventListener('blur', onBlur);
      }
    };
  };

  RTG.UI.PlayInput = PlayInput;
})(typeof window !== 'undefined' ? window : globalThis);
