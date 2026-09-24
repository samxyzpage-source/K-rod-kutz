/**
 * Shared hands for the QB moment specs (v2 "DRAW THE PASS"): the title picks, the situation card, the play cards, and
 * the DRAW — real pointer gestures (the mouse, or CDP touch on a touch context) from the quarterback along a timed path
 * of moves: fast (as quick as the harness moves, ≤ ~120 ms) → a BULLET, slow (~0.9 s or more, from Tuning.qb.draw.loft)
 * → a LOB. The target's reachable spot comes from RTG.debug.reachSpot (the engine's live.aim checked with
 * live.classify, else a classify loop over his route); field yards become css px through the view's fieldToCss.
 * Everything reads the live scene through RTG.UI.PlayView.current() / RTG.debug.
 *
 *   const Q = require('./_playhelpers');
 *   await Q.pickArchetype(page, 'GUNSLINGER') · Q.pickTeam(page, 'AVERAGE') · Q.pickVenue(page, 'COLLEGE')
 *   await Q.startDrive(page)                       → START THE DRIVE, waits for screen 'moment' + phase SITUATION
 *   await Q.tapToRead(page)                        → TAP TO READ → phase READ
 *   await Q.cards(page)                            → [{idx, id, name, advice, tags, run}] from the DOM
 *   await Q.pickPlay(page, idx)                    → click a card → the phase reached ('PLAY' | 'RUN' | 'RESULT' | 'DONE')
 *   await Q.pickPassCard(page)                     → the first GOOD (else OK, else any) PASS card → {card, phase, cards}
 *   await Q.waitCanDraw(page)                      → the offence has slid into the formation and the QB has the ball
 *   await Q.waitPlayTime(page, t)                  → the live's clock reached t (or the QB lost the ball / the play ended)
 *   await Q.chooseTarget(page, {loft, minT, maxT}) → {slot, spot, preview, margin, t, sackAt}: waits (full speed) until a
 *                                                     receiver's race is GREEN (or maxT) and returns the best one
 *   await Q.drawPass(page, slot, {speed: 'fast'|'slow', touch, bend, loft, durationMs, offsetYd, onMid, keepDown})
 *                                                  → {drawing (the draft just before the release), mid, released, ball, timeScaleMid, ms}
 *   await Q.drawRun(page, fieldPts | 'rollout' | 'scramble' | 'stepUp', {touch, durationMs, keepDown}) → {drawing, ok, qbBefore, up}
 *   await Q.drawThrowAway(page, {touch})          → a line from the QB out of bounds (a THROWAWAY by classify)
 *   await Q.gesture(page, cssPts, {touch, durationMs, onMid, beforeUp, keepDown}) → the raw timed press / moves / release
 *   await Q.keyPass(page, slot, {touch: 'BULLET'|'TOUCH'|'LOB', bend, nudge: [dx, dy]}) → the keyboard-only pass
 *   await Q.keyRun(page, {steps: ['ArrowRight', …]}) → the keyboard run draft (R, arrows, Enter)
 *   await Q.waitReleased(page) · Q.waitResult(page) · Q.waitDone(page) · Q.skipResult(page) · Q.next(page)
 *   await Q.playMoment(page, {how: 'mouse'|'touch'|'key', speed, cardIdx, skip}) → one whole moment, a drawn pass
 *   await Q.geometry(page) · Q.current(page) / Q.state(page) / Q.drawing(page) / Q.live(page) · Q.touchTap(page, x, y)
 */
'use strict';
const H = require('./_harness');

const SLOTS = ['WR1', 'WR2', 'SLOT', 'TE', 'RB'];
const sleep = ms => new Promise(r => setTimeout(r, Math.max(0, ms)));

function current(page) { return H.debug(page, 'current'); }
function state(page) { return H.debug(page, 'state'); }
function phase(page) { return page.evaluate(() => { const v = RTG.UI.PlayView.current(); return v ? v.phase() : null; }); }
function drawing(page) { return page.evaluate(() => { const v = RTG.UI.PlayView.current(); return v && v.drawing ? JSON.parse(JSON.stringify(v.drawing())) : null; }); }
function live(page) { return H.debug(page, 'live'); }

// ─────────────────────────── title ───────────────────────────

async function pickArchetype(page, id) {
  await page.locator('.arch-card[data-arch="' + id + '"]').click();
  H.assert.equal(await page.locator('.arch-card[data-arch="' + id + '"]').getAttribute('aria-checked'), 'true', 'archetype ' + id + ' selected');
}
async function pickTeam(page, id) {
  await page.locator('[data-team="' + id + '"]').click();
  H.assert.equal(await page.locator('[data-team="' + id + '"]').getAttribute('aria-checked'), 'true', 'team ' + id + ' selected');
}
async function pickVenue(page, id) {
  await page.locator('[data-venue="' + id + '"]').click();
  H.assert.equal(await page.locator('[data-venue="' + id + '"]').getAttribute('aria-checked'), 'true', 'venue ' + id + ' selected');
}
async function startDrive(page) {
  await H.clickButton(page, 'START THE DRIVE');
  await H.waitForScreen(page, 'moment');
  await H.waitPhase(page, 'SITUATION');
}

// ─────────────────────────── the situation / the read ───────────────────────────

async function tapToRead(page) {
  await page.locator('.pv-situation .pv-go').click();
  await H.waitPhase(page, 'READ');
}

/** The play cards as the DOM shows them. */
function cards(page) {
  return page.$$eval('.pv-card', els => els.map((b, i) => ({
    idx: Number(b.getAttribute('data-idx') || i), id: b.getAttribute('data-play'),
    name: (b.querySelector('.pv-card-name') || {}).textContent || '',
    advice: ((b.querySelector('.pv-advice') || {}).textContent || '').trim(),
    tags: Array.from(b.querySelectorAll('.pv-tag')).map(t => t.textContent),
    run: b.getAttribute('data-play') === 'SNEAK' || b.getAttribute('data-play') === 'DRAW'
  })));
}

const AFTER_PICK = ['PLAY', 'RUN', 'RESULT', 'DONE'];
/** Click a card; resolves with the phase reached (PLAY for a pass play; a run card goes RUN → RESULT on its own). */
async function pickPlay(page, idx) {
  await page.locator('.pv-card[data-idx="' + idx + '"]').click();
  await page.waitForFunction(ok => { const v = RTG.UI.PlayView.current(); return !!v && ok.indexOf(v.phase()) >= 0; }, AFTER_PICK, { timeout: 5000 });
  return phase(page);
}

/** The card a sensible player picks: the first GOOD pass card, else the first OK one, else the first pass card, else card 0. */
function bestCard(list) {
  return list.find(c => c.advice === 'GOOD' && !c.run) || list.find(c => c.advice === 'OK' && !c.run) || list.find(c => !c.run) || list[0];
}

/** Pick bestCard(cards) → {card, phase, cards}. */
async function pickPassCard(page) {
  const list = await cards(page);
  const pick = bestCard(list);
  const ph = await pickPlay(page, pick.idx);
  return { card: pick, phase: ph, cards: list };
}

// ─────────────────────────── the live play ───────────────────────────

/** The offence has slid into the formation, the QB has the ball, no modal: a draft may start. */
async function waitCanDraw(page, timeout) {
  await page.waitForFunction(() => {
    const v = RTG.UI.PlayView.current();
    if (!v || v.phase() !== 'PLAY') return false;
    if (typeof v.canDraw === 'function') return v.canDraw();
    return v.el.getAttribute('data-can-draw') === '1';
  }, null, { timeout: timeout || 6000 });
}

/** The live's clock reached t sim-seconds (or the QB no longer holds the ball, or the scene left PLAY). */
async function waitPlayTime(page, t, timeout) {
  await page.waitForFunction(tt => {
    const v = RTG.UI.PlayView.current(), l = v && v.live && v.live();
    return !v || v.phase() !== 'PLAY' || !l || !l.qb.hasBall || l.t >= tt;
  }, t, { timeout: timeout || 8000 });
}

/** Canvas geometry + the actors (css px relative to the canvas element; field yards). */
function geometry(page) {
  return page.evaluate(() => {
    const v = RTG.UI.PlayView.current();
    const r = v.canvas.getBoundingClientRect();
    return { rect: { x: r.x, y: r.y, w: r.width, h: r.height }, scale: v.cv.scale, w: v.cv.w, h: v.cv.h, landscape: v.cv.landscape, actors: v.actors(), phase: v.phase() };
  });
}

/**
 * The receiver to throw to: polls (at full speed, every ~60 ms) every receiver's reachSpot and returns the best race
 * (GREEN > GOLD > RED, then the engine's margin) once one is GREEN at t ≥ minT, or the best there is at maxT
 * (default min(2.0, sackAt − 0.7)). → {slot, spot, preview, margin, t, sackAt}
 */
async function chooseTarget(page, opts) {
  opts = opts || {};
  const loft = typeof opts.loft === 'number' ? opts.loft : 0.5;
  const minT = typeof opts.minT === 'number' ? opts.minT : 0.7;
  return page.evaluate(([loft, minT, maxT0]) => new Promise(resolve => {
    const t0 = performance.now();
    (function poll() {
      const v = RTG.UI.PlayView.current(), l = v && v.live && v.live(), sim = v && v.sim && v.sim();
      if (!v || v.phase() !== 'PLAY' || !l || !sim || !sim.receivers || !l.qb.hasBall || l.phase !== 'PRE_THROW') return resolve(null);
      const maxT = typeof maxT0 === 'number' ? maxT0 : Math.max(minT, Math.min(2.0, (sim.sackAt || 2.5) - 0.7));
      let best = null, bestScore = -Infinity;
      for (const r of sim.receivers) {
        const sp = RTG.debug.reachSpot(r.slot, loft);
        if (!sp || sp.kind !== 'PASS' || sp.target !== r.slot || sp.tooLong) continue;
        const score = (sp.preview === 'GREEN' ? 2 : (sp.preview === 'GOLD' ? 1 : 0)) * 100 + (sp.margin || 0);
        if (score > bestScore) { bestScore = score; best = sp; }
      }
      const t = l.t;
      if ((best && best.preview === 'GREEN' && t >= minT) || t >= maxT || performance.now() - t0 > 6000) {
        return resolve(best ? { slot: best.target, spot: best, preview: best.preview, margin: best.margin, t, sackAt: sim.sackAt } : { slot: null, spot: null, preview: null, margin: null, t, sackAt: sim.sackAt });
      }
      setTimeout(poll, 60);
    })();
  }), [loft, minT, typeof opts.maxT === 'number' ? opts.maxT : null]);
}

/** Wait until the ball is out (the live has a ball) or the play ended / the QB went down; → the ball snapshot or null. */
async function waitReleased(page, timeout) {
  await page.waitForFunction(() => {
    const v = RTG.UI.PlayView.current(), l = v && v.live && v.live();
    return !v || v.phase() !== 'PLAY' || !l || !!l.ball || l.phase === 'DONE' || l.qb.down;
  }, null, { timeout: timeout || 3000 });
  return page.evaluate(() => { const b = RTG.debug.live(); return b ? b.ball : null; });
}

// ─────────────────────────── gestures ───────────────────────────

/** One CDP touch tap (touchStart + touchEnd) at a client point. */
async function touchTap(page, x, y) {
  const cdp = await page.context().newCDPSession(page);
  const tp = { x, y, id: 1, radiusX: 2, radiusY: 2, force: 1 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/**
 * A timed stroke: press at css[0] (the mouse, or a CDP touch), move through css[1..] spreading the moves over
 * durationMs (0 = as fast as the harness moves), call onMid() half way and beforeUp() before the release, then let go
 * (unless keepDown: the caller releases with the returned up()). → {mid, before, ms, up}
 */
async function gesture(page, css, opts) {
  opts = opts || {};
  const cdp = opts.touch ? await page.context().newCDPSession(page) : null;
  const tp = p => ({ x: p.x, y: p.y, id: 1, radiusX: 2, radiusY: 2, force: 1 });
  const moveTo = p => cdp ? cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(p)] }) : page.mouse.move(p.x, p.y);
  const start = css[0];
  if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(start)] });
  else { await page.mouse.move(start.x, start.y); await page.mouse.down(); }
  const dur = opts.durationMs || 0, n = css.length - 1, t0 = Date.now(), half = Math.max(1, Math.ceil(n / 2));
  let mid = null;
  if (dur > 0) {
    for (let i = 1; i <= n; i++) {
      await sleep(t0 + dur * i / n - Date.now());
      await moveTo(css[i]);
      if (opts.onMid && i === half) mid = await opts.onMid();
    }
  } else if (cdp) {
    // a burst: a CDP touch round trip is slow (tens of ms), so the moves go out back to back (CDP keeps their order)
    await Promise.all(css.slice(1, half + 1).map(moveTo));
    if (opts.onMid) mid = await opts.onMid();
    await Promise.all(css.slice(half + 1).map(moveTo));
  } else {
    for (let i = 1; i <= n; i++) { await moveTo(css[i]); if (opts.onMid && i === half) mid = await opts.onMid(); }
  }
  const ms = Date.now() - t0;
  const before = opts.beforeUp ? await opts.beforeUp(async p => { await moveTo(p); }) : null;
  const up = async () => {
    if (cdp) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach(); }
    else await page.mouse.up();
  };
  if (!opts.keepDown) await up();
  return { mid, before, ms, up };
}

/**
 * Plan a stroke in the page: the press on the QB (fieldToCss of his feet) and a field polyline from him to `end`
 * (straight, or bent `bend` yd off the chord's middle) converted to client css px; plus the canvas' css height and
 * the Tuning.qb.draw loft speeds.
 */
function planStroke(page, end, opts) {
  return page.evaluate(([end, bend, n]) => {
    const v = RTG.UI.PlayView.current(), l = v.live();
    const q = { x: l.qb.x, y: l.qb.y };
    const f = [];
    const cx = end.x - q.x, cy = end.y - q.y, cl = Math.hypot(cx, cy) || 1;
    const px = (q.x + end.x) / 2 + (cy / cl) * bend * 2, py = (q.y + end.y) / 2 - (cx / cl) * bend * 2;
    for (let i = 0; i <= n; i++) {
      const u = i / n, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
      f.push(bend ? { x: a * q.x + b * px + c * end.x, y: a * q.y + b * py + c * end.y } : { x: q.x + cx * u, y: q.y + cy * u });
    }
    const css = f.map(p => v.fieldToCss(p.x, p.y));
    let len = 0;
    for (let i = 1; i < css.length; i++) len += Math.hypot(css[i].x - css[i - 1].x, css[i].y - css[i - 1].y);
    const D = RTG.UI.PlayInput.draw();
    return { css, field: f, qb: q, lenCss: len, cssH: v.canvas.getBoundingClientRect().height, fastHps: D.loft.fastHps, slowHps: D.loft.slowHps, slowMo: D.slowMo };
  }, [end, opts.bend || 0, opts.steps || 12]);
}

/** The draft right now + the live's time scale (one evaluate). */
function draftNow(page) {
  return page.evaluate(() => {
    const v = RTG.UI.PlayView.current();
    if (!v) return null;
    return { drawing: v.drawing ? JSON.parse(JSON.stringify(v.drawing())) : null, timeScale: v.timeScale ? v.timeScale() : null, t: v.live() ? v.live().t : null,
      chip: (() => { const c = document.querySelector('.pv-draft'); return c ? { text: c.textContent, hidden: c.hidden, kind: c.getAttribute('data-kind'), preview: c.getAttribute('data-preview'), assist: c.getAttribute('data-assist'), touch: c.getAttribute('data-touch') } : null; })(),
      slow: (() => { const s = document.querySelector('.pv-slowmo'); return s ? { hidden: s.hidden, active: s.getAttribute('data-active'), out: s.classList.contains('out'), pct: Number(s.getAttribute('aria-valuenow')) } : null; })(),
      stageSlow: !!document.querySelector('.pv-stage.is-slow') };
  });
}

/** How long a stroke of lenCss must take for the wanted loft (the scene's rule: canvas-heights per second). */
function strokeMs(p, speed, override) {
  if (typeof override === 'number') return override;
  if (speed === 'slow') return Math.min(2600, Math.max(900, 1000 * (p.lenCss / p.cssH) / (p.slowHps * 0.7)));
  return 0;                                        // fast: as quick as the harness moves (a bullet)
}

/**
 * Draw a PASS to `slot` with a real gesture: the spot he can reach (RTG.debug.reachSpot at the loft the speed will
 * give), the press on the QB, a timed stroke (fast → BULLET, slow → LOB), a correction move before the release when
 * the draft is not (yet) a PASS to him (the play ran on in slow motion), the release. `offsetYd` moves the end off the
 * spot ({x, y} yd; the aim-assist tests). `keepDown` leaves the finger down (the caller releases with .up()).
 * → {spot, drawing (just before the release), mid ({drawing, timeScale, slow, stageSlow, chip} half way), ms, released,
 *    ball (the ball snapshot after the release, or null), up}
 */
async function drawPass(page, slot, opts) {
  opts = opts || {};
  const speed = opts.speed || 'fast';
  const loft = typeof opts.loft === 'number' ? opts.loft : (speed === 'slow' ? 0.9 : 0.1);
  const spot = await H.debug(page, 'reachSpot', slot, loft);
  if (!spot) throw new Error('drawPass: no spot for ' + slot + ' (is a play live?)');
  const off = opts.offsetYd || { x: 0, y: 0 };
  const end = { x: spot.x + (off.x || 0), y: spot.y + (off.y || 0) };
  const p = await planStroke(page, end, { bend: opts.bend || 0, steps: opts.steps || (speed === 'slow' ? 20 : (opts.bend ? 10 : 6)) });
  const durationMs = strokeMs(p, speed, opts.durationMs);
  const g = await gesture(page, p.css, {
    touch: opts.touch, durationMs, keepDown: !!opts.keepDown,
    onMid: async () => { const d = await draftNow(page); if (opts.onMid) await opts.onMid(d); return d; },
    beforeUp: async move => {
      let d = await draftNow(page);
      if (opts.correct !== false && !opts.offsetYd && d && d.drawing && !(d.drawing.kind === 'PASS' && d.drawing.target === slot)) {
        // the play ran on while the finger drew: re-aim the end at the spot for the loft the stroke really has
        const sp2 = await H.debug(page, 'reachSpot', slot, d.drawing.loft);
        if (sp2) { const c = await page.evaluate(([x, y]) => RTG.UI.PlayView.current().fieldToCss(x, y), [sp2.x, sp2.y]); await move(c); await sleep(40); d = await draftNow(page); d.corrected = true; }
      }
      if (opts.beforeUp) await opts.beforeUp(d);
      return d;
    }
  });
  const out = { spot, end, stroke: { lenCss: p.lenCss, cssH: p.cssH, durationMs }, drawing: g.before && g.before.drawing, before: g.before, mid: g.mid, ms: g.ms, up: g.up, released: false, ball: null };
  if (opts.keepDown) return out;
  out.ball = await waitReleased(page).catch(() => null);
  out.released = !!(out.ball && out.ball.kind);
  return out;
}

/**
 * Field points for a run of a kind, found in the page so that live.classify calls the line a RUN (no receiver can
 * reach its end) — checked at loft 1, the slowest ball (if nobody gets there under a lob, nobody gets there at all),
 * with every end within 1.5 yd of it a RUN too (robust to the play running on while the finger draws); of those the
 * shortest line; retried for ~1 s while no candidate holds. 'rollout' (5–9 yd to either side, behind the line),
 * 'stepUp' (3–5 yd up, still behind the line), 'scramble' (out of the pocket behind the line, then 1.5–5 yd past it).
 */
function runLine(page, kind) {
  return page.evaluate(kind => new Promise(resolve => {
    const t0 = performance.now();
    (function find() {
      const v = RTG.UI.PlayView.current(), l = v && v.live();
      if (!l || !l.qb.hasBall) return resolve(null);
      const q = { x: l.qb.x, y: l.qb.y }, f = l.field || v.sim().field;
      const side = (f.sideR - q.x) >= (q.x - f.sideL) ? 1 : -1;
      const cands = [];
      const inField = x => Math.max(f.sideL + 1.5, Math.min(f.sideR - 1.5, x));
      if (kind === 'rollout') { for (const dx of [7, 6, 8, 5, 9]) for (const dy of [0.5, 0, 1, -0.5, -1.5]) for (const s of [side, -side]) cands.push([{ x: q.x + s * dx * 0.5, y: q.y + dy * 0.5 }, { x: inField(q.x + s * dx), y: Math.min(-0.8, q.y + dy) }]); }
      else if (kind === 'stepUp') { for (const dy of [4.5, 4, 5, 3.5, 3]) for (const dx of [0, 1, -1, 2, -2]) cands.push([{ x: q.x + dx, y: Math.min(-0.8, q.y + dy) }]); }
      else {
        for (const past of [2, 3, 1.5, 4, 5]) for (const dx of [5, 6, 4, 7, 8, 9, 3, 11]) for (const s of [side, -side]) {
          const x = inField(q.x + s * dx);
          cands.push([{ x: q.x + (x - q.x) * 0.6, y: Math.min(q.y + 1.5, -1.5) }, { x, y: -0.5 }, { x, y: past }]);
        }
      }
      const isRun = pts => { const k = l.classify(pts, 1); return !!k && k.kind === 'RUN'; };
      let best = null, bestLen = Infinity;
      for (const c of cands) {
        const pts = [q].concat(c);
        if (!isRun(pts)) continue;
        const e = c[c.length - 1];
        let robust = true;
        for (const d of [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]]) {
          const alt = pts.slice(0, -1).concat([{ x: e.x + d[0], y: e.y + d[1] }]);
          if (!isRun(alt)) { robust = false; break; }
        }
        if (!robust) continue;
        let len = 0;
        for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        if (len < bestLen) { bestLen = len; best = pts; }
      }
      if (best || performance.now() - t0 > 1000) return resolve(best || [q].concat(cands[0]));
      setTimeout(find, 80);
    })();
  }), kind);
}

/**
 * Draw a RUN with a real gesture: `pts` field yards (the first point is replaced by the QB's feet) or a kind
 * ('rollout' | 'stepUp' | 'scramble', see runLine). → {drawing (before the release), ok (the live took the run: a RUN
 * event), qbBefore, points}
 */
async function drawRun(page, pts, opts) {
  opts = opts || {};
  const field = typeof pts === 'string' ? await runLine(page, pts) : pts;
  const plan = await page.evaluate(field => {
    const v = RTG.UI.PlayView.current(), l = v.live(), q = { x: l.qb.x, y: l.qb.y };
    const f = [q].concat(field.slice(1));
    // densify: a css point every ~1 yd
    const dense = [f[0]];
    for (let i = 1; i < f.length; i++) {
      const a = f[i - 1], b = f[i], d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(d));
      for (let k = 1; k <= n; k++) dense.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n });
    }
    const runsBefore = (l.plan().runs || []).length;
    return { css: dense.map(p => v.fieldToCss(p.x, p.y)), qb: q, runsBefore, field: f };
  }, field);
  // a quick stroke by default: the line is where he runs, and a fast line is what classify gives the least reach to
  const g = await gesture(page, plan.css, { touch: opts.touch, keepDown: !!opts.keepDown, durationMs: typeof opts.durationMs === 'number' ? opts.durationMs : 0, beforeUp: async () => draftNow(page) });
  if (opts.keepDown) return { drawing: g.before && g.before.drawing, before: g.before, ok: null, qbBefore: plan.qb, points: plan.field, up: g.up };
  await sleep(60);
  const after = await page.evaluate(() => { const l = RTG.UI.PlayView.current().live(); return l ? { runs: l.plan().runs.length, phase: l.phase, events: l.events.map(e => e.kind) } : null; });
  return { drawing: g.before && g.before.drawing, before: g.before, ok: !!(after && after.runs > plan.runsBefore), qbBefore: plan.qb, points: plan.field, after };
}

/**
 * An end out of bounds that live.classify calls a THROWAWAY and that sits on the canvas (the near field is wider than
 * the screen, so the ends are 6–24 yd downfield), as far from every receiver as possible; retried for ~1.5 s while
 * the receivers are still close enough to reach every candidate. → {x, y} or null
 */
function awayEnd(page) {
  return page.evaluate(() => new Promise(resolve => {
    const t0 = performance.now();
    (function find() {
      const v = RTG.UI.PlayView.current(), l = v && v.live();
      if (!l || !l.qb.hasBall || l.phase !== 'PRE_THROW') return resolve(null);
      const q = { x: l.qb.x, y: l.qb.y }, f = l.field || v.sim().field, r = v.canvas.getBoundingClientRect();
      let best = null, bestD = -1;
      for (const s of [-1, 1]) for (const out of [1.5, 3, 5, 7, 9]) for (let y = -2; y <= 26; y += 2) {
        const e = { x: s < 0 ? f.sideL - out : f.sideR + out, y };
        const c = v.fieldToCss(e.x, e.y);
        if (c.x < r.x + 3 || c.x > r.x + r.width - 3 || c.y < r.y + 3 || c.y > r.y + r.height - 3) continue;
        const k = l.classify([q, e], 0.3);
        if (!k || k.kind !== 'THROWAWAY' || k.tooLong) continue;
        let dMin = Infinity;
        for (const rc of l.receivers) dMin = Math.min(dMin, Math.hypot(rc.x - e.x, rc.y - e.y));
        if (dMin > bestD) { bestD = dMin; best = e; }
      }
      if (best || performance.now() - t0 > 1500) return resolve(best);
      setTimeout(find, 100);
    })();
  }));
}

/** Draw a line from the QB out of bounds (an end that classify calls a THROWAWAY, inside the canvas) and let go. */
async function drawThrowAway(page, opts) {
  opts = opts || {};
  const end = await awayEnd(page);
  if (!end) throw new Error('drawThrowAway: no out-of-bounds end on the canvas that nobody can reach');
  const p = await planStroke(page, end, { steps: 10 });
  const g = await gesture(page, p.css, { touch: opts.touch, durationMs: typeof opts.durationMs === 'number' ? opts.durationMs : 200, beforeUp: async () => draftNow(page) });
  const ball = await waitReleased(page).catch(() => null);
  return { end, drawing: g.before && g.before.drawing, before: g.before, ball, released: !!(ball && ball.kind) };
}

// ─────────────────────────── the keyboard hand ───────────────────────────

async function focusCanvas(page) { await page.evaluate(() => { const v = RTG.UI.PlayView.current(); try { v.canvas.focus(); } catch (e) { /* ignore */ } }); }

/**
 * The keyboard-only pass: the slot's number key (slot order WR1 WR2 SLOT TE RB) proposes a straight line to the spot
 * he can reach; L cycles BULLET / TOUCH / LOB until `touch`; E / Q bend (`bend` presses, + = E); the arrows nudge
 * (`nudge` [dx, dy] yd); Enter throws. → {drawing (before Enter), released, ball}
 */
async function keyPass(page, slot, opts) {
  opts = opts || {};
  await focusCanvas(page);
  const n = SLOTS.indexOf(slot) + 1;
  if (n < 1) throw new Error('keyPass: unknown slot ' + slot);
  await page.keyboard.press(String(n));
  await page.waitForFunction(s => { const v = RTG.UI.PlayView.current(), d = v && v.drawing(); return !!d && d.mode === 'PASS' && d.source === 'key' && d.target === s; }, slot, { timeout: 3000 });
  const want = opts.touch || 'TOUCH';
  for (let i = 0; i < 3; i++) {
    const d = await drawing(page);
    if (d && d.touch === want) break;
    await page.keyboard.press('l');
    await sleep(40);
  }
  const bend = opts.bend || 0;
  for (let i = 0; i < Math.abs(bend); i++) await page.keyboard.press(bend > 0 ? 'e' : 'q');
  const nd = opts.nudge || [0, 0];
  for (let i = 0; i < Math.abs(nd[0]); i++) await page.keyboard.press(nd[0] > 0 ? 'ArrowRight' : 'ArrowLeft');
  for (let i = 0; i < Math.abs(nd[1]); i++) await page.keyboard.press(nd[1] > 0 ? 'ArrowUp' : 'ArrowDown');
  await sleep(50);
  const before = await draftNow(page);
  if (opts.beforeEnter) await opts.beforeEnter(before);
  await page.keyboard.press(opts.key || 'Enter');
  const ball = await waitReleased(page).catch(() => null);
  return { drawing: before && before.drawing, before, ball, released: !!(ball && ball.kind) };
}

/** The keyboard run: R starts a RUN draft 5 yd ahead, the arrows steer its end, Enter commits. → {drawing, ok} */
async function keyRun(page, opts) {
  opts = opts || {};
  await focusCanvas(page);
  const runsBefore = await page.evaluate(() => RTG.UI.PlayView.current().live().plan().runs.length);
  await page.keyboard.press('r');
  await page.waitForFunction(() => { const v = RTG.UI.PlayView.current(), d = v && v.drawing(); return !!d && d.mode === 'RUN'; }, null, { timeout: 3000 });
  for (const k of opts.steps || []) await page.keyboard.press(k);
  await sleep(50);
  const before = await draftNow(page);
  await page.keyboard.press('Enter');
  await sleep(60);
  const runs = await page.evaluate(() => { const l = RTG.UI.PlayView.current().live(); return l ? l.plan().runs.length : 0; });
  return { drawing: before && before.drawing, before, ok: runs > runsBefore };
}

// ─────────────────────────── the result / the story ───────────────────────────

async function waitResult(page, timeout) {
  await page.waitForFunction(() => { const v = RTG.UI.PlayView.current(); const p = v && v.phase(); return p === 'RESULT' || p === 'DONE'; }, null, { timeout: timeout || 15000 });
  return page.evaluate(() => { const v = RTG.UI.PlayView.current(); return v ? JSON.parse(JSON.stringify(v.result())) : null; });
}

/** Skip the result beat (once it is up and past the arm time). */
async function skipResult(page) {
  await sleep(350);
  await page.evaluate(() => { const v = RTG.UI.PlayView.current(); if (v && v.phase() === 'RESULT') v.skip(); });
}

/** The scene handed the result to the shell: the interstitial is up, or the drive is over and the summary is up. */
async function waitDone(page, timeout) {
  await page.waitForFunction(() => {
    const sm = document.querySelector('.screen-moment');
    return (sm && sm.getAttribute('data-stage') === 'story') || (RTG.UI.app.screen() === 'summary');
  }, null, { timeout: timeout || 15000 });
  return H.screenId(page);
}

/** NEXT on the interstitial → the next situation (or the summary when the drive is over). */
async function next(page) {
  const sc = await H.screenId(page);
  if (sc === 'summary') return 'summary';
  const btn = page.locator('.screen-moment [data-action="next"]');
  await btn.waitFor({ state: 'visible', timeout: 5000 });
  await btn.click();
  await page.waitForFunction(() => {
    if (RTG.UI.app.screen() === 'summary') return true;
    const v = RTG.UI.PlayView.current();
    return !!v && v.phase() === 'SITUATION';
  }, null, { timeout: 8000 });
  return H.screenId(page);
}

/**
 * One whole moment from SITUATION: read, pick the best pass card (opts.cardIdx overrides), wait for a window
 * (chooseTarget), draw the pass (opts.how: 'mouse' | 'touch' | 'key'; opts.speed 'fast' | 'slow'), wait for the
 * result and the story. → {card, phase, cards, target, pass, result, screen}
 */
async function playMoment(page, opts) {
  opts = opts || {};
  await H.waitPhase(page, 'SITUATION');
  await tapToRead(page);
  const list = await cards(page);
  const card = typeof opts.cardIdx === 'number' ? list[opts.cardIdx] : bestCard(list);
  const ph = await pickPlay(page, card.idx);
  const out = { card, phase: ph, cards: list, target: null, pass: null, result: null };
  if (ph === 'PLAY') {
    await waitCanDraw(page);
    const speed = opts.speed || 'fast';
    const tgt = await chooseTarget(page, { loft: speed === 'slow' ? 0.9 : 0.1 });
    out.target = tgt;
    if (tgt && tgt.slot) {
      if (opts.how === 'key') out.pass = await keyPass(page, tgt.slot, { touch: speed === 'slow' ? 'LOB' : 'BULLET' });
      else out.pass = await drawPass(page, tgt.slot, { speed, touch: opts.how === 'touch' });
    }
  }
  out.result = await waitResult(page);
  if (opts.skip !== false) await skipResult(page);
  out.screen = await waitDone(page);
  return out;
}

module.exports = {
  SLOTS, sleep, current, state, phase, drawing, live, geometry,
  pickArchetype, pickTeam, pickVenue, startDrive,
  tapToRead, cards, bestCard, pickPlay, pickPassCard, pickFirstGood: pickPassCard,
  waitCanDraw, waitPlayTime, chooseTarget, waitReleased,
  touchTap, gesture, planStroke, draftNow, drawPass, runLine, drawRun, awayEnd, drawThrowAway, focusCanvas, keyPass, keyRun,
  waitResult, skipResult, waitDone, next, playMoment
};
