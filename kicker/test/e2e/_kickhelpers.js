/**
 * Shared helpers for the kick-scene specs (U2): open the showcase, read the scene geometry, drive a flick with the
 * mouse or with CDP touch events, wait for a scene phase, and loop a game with forced kicks.
 *
 *   const K = require('./_kickhelpers');
 *   await K.openShowcase(page, seed)                 → new career via RTG.debug, waits for the KickView in SETUP
 *   await K.geometry(page)                           → {scale, w, h, landscape, cssHeight, rect, ball:{x,y}}
 *   await K.mouseFlick(page, {drag, dragMs, flick, flickMs, dx})
 *   await K.touchFlick(page, {drag, dragMs, flick, flickMs})   CDP Input.dispatchTouchEvent (real touch pointers)
 *   await K.waitPhase(page, 'RESULT', timeout)       resolves when KickView.current().phase() === phase
 *   await K.waitSetup(page, resultsLen, timeout)     resolves when the scene is armed for kick #resultsLen+1
 */
'use strict';

async function openShowcase(page, seed) {
  await page.evaluate(s => RTG.debug.newCareer({ seed: s, name: 'E2E Kicker' }), seed || 4242);
  await page.waitForFunction(() => RTG.UI.Router.current() === 'showcase' && RTG.UI.KickView && RTG.UI.KickView.current() && RTG.UI.KickView.current().phase() === 'SETUP', null, { timeout: 10000 });
  await page.waitForTimeout(250);
}

function geometry(page) {
  return page.evaluate(() => {
    const v = RTG.UI.KickView.current();
    const r = v.canvas.getBoundingClientRect();
    const L = v.layout();
    return {
      scale: v.cv.scale, w: v.cv.w, h: v.cv.h, landscape: v.cv.landscape, cssHeight: v.cv.cssHeight(),
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      ball: { x: r.x + L.xBall * v.cv.scale, y: r.y + L.yT * v.cv.scale },
      innerWidth: innerWidth, innerHeight: innerHeight
    };
  });
}

/** Press on the ball, drag down `drag` px over `dragMs`, flick up `flick` px over `flickMs`, release. */
async function mouseFlick(page, o) {
  o = o || {};
  const drag = o.drag || 120, dragMs = o.dragMs || 300, flick = o.flick || 60, flickMs = o.flickMs || 80, dx = o.dx || 0;
  const g = await geometry(page);
  const b = g.ball;
  await page.mouse.move(b.x, b.y);
  await page.mouse.down();
  const n1 = 10;
  for (let i = 1; i <= n1; i++) { await page.mouse.move(b.x, b.y + drag * i / n1); await page.waitForTimeout(dragMs / n1); }
  // the flick:  px in ~flickMs (a real flick is 0.35–2.2 css-px/ms; slower reads as WEAK, faster as YANKED).
  // Each CDP mouse event costs a few ms on its own, so use few steps and short waits.
  const n2 = 3;
  for (let i = 1; i <= n2; i++) { await page.mouse.move(b.x + dx * i / n2, b.y + drag - flick * i / n2); if (i < n2) await page.waitForTimeout(Math.max(4, flickMs / n2 - 12)); }
  await page.mouse.up();
  return g;
}

/** The same gesture through CDP touch events (Chromium turns them into pointer events with pointerType 'touch'). */
async function touchFlick(page, o) {
  o = o || {};
  const drag = o.drag || 120, dragMs = o.dragMs || 300, flick = o.flick || 60, flickMs = o.flickMs || 80;
  const g = await geometry(page);
  const b = g.ball;
  const cdp = await page.context().newCDPSession(page);
  const tp = (x, y) => ({ x: x, y: y, id: 1, radiusX: 4, radiusY: 4, force: 1 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(b.x, b.y)] });
  const n1 = 10;
  for (let i = 1; i <= n1; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(b.x, b.y + drag * i / n1)] }); await page.waitForTimeout(dragMs / n1); }
  const n2 = 3;
  for (let i = 1; i <= n2; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(b.x + i, b.y + drag - flick * i / n2)] }); if (i < n2) await page.waitForTimeout(Math.max(4, flickMs / n2 - 12)); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  return g;
}

function waitPhase(page, phase, timeout) {
  return page.waitForFunction(p => { const v = RTG.UI.KickView.current(); return !!v && v.phase() === p; }, phase, { timeout: timeout || 8000 });
}

/** Wait until the session scene is armed (SETUP) with `n` results already recorded. */
function waitSetup(page, n, timeout) {
  return page.waitForFunction(k => {
    const v = RTG.UI.KickView.current(), s = RTG.UI.store.state;
    return !!v && v.phase() === 'SETUP' && !!s.pending && s.pending.kind === 'KICKS' && s.pending.session.results.length === k;
  }, n, { timeout: timeout || 10000 });
}

module.exports = { openShowcase, geometry, mouseFlick, touchFlick, waitPhase, waitSetup };
