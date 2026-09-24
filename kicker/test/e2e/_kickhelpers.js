/**
 * Shared helpers for the kick-scene specs (U2): open the first senior-season game, read the scene geometry, drive
 * a flick with the mouse or with CDP touch events, wait for a scene phase, and loop a game with forced kicks.
 *
 *   const K = require('./_kickhelpers');
 *   await K.useFlick(page)                           → pin the flick mechanic (aim-then-hold is the default, D20)
 *   await K.openHsGame(page, seed)                   → new career via RTG.debug, week-6 game open, KickView in SETUP
 *   await K.geometry(page)                           → {scale, w, h, landscape, cssHeight, rect, ball:{x,y}}
 *   await K.mouseFlick(page, {drag, dragMs, flick, flickMs, dx})
 *   await K.touchFlick(page, {drag, dragMs, flick, flickMs})   CDP Input.dispatchTouchEvent (real touch pointers)
 *   await K.waitPhase(page, 'RESULT', timeout)       resolves when KickView.current().phase() === phase
 *   await K.waitSetup(page, resultsLen, timeout)     resolves when the scene is armed for kick #resultsLen+1
 */
'use strict';

/**
 * Pin flick as the kick input for a spec that tests it. Aim-then-hold (`inputMode: 'meter'`) is the default
 * since SPEC D20, and the scene reads the mode when it mounts — so this must run before `openHsGame`.
 */
async function useFlick(page) {
  await page.evaluate(() => RTG.UI.store.setSetting('inputMode', 'flick'));
}

/** A fresh career with week 6 of the senior season open and the kick scene armed (§2.7.0). */
async function openHsGame(page, seed) {
  await page.evaluate(s => { RTG.debug.newCareer({ seed: s, name: 'E2E Kicker' }); RTG.UI.store.dispatch('hsStartGame'); RTG.UI.Router.sync(); }, seed || 4242);
  await page.waitForFunction(() => RTG.UI.Router.current() === 'hsgame' && RTG.UI.KickView && RTG.UI.KickView.current() && RTG.UI.KickView.current().phase() === 'SETUP', null, { timeout: 10000 });
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
  const drag = o.drag || 120, dragMs = o.dragMs || 300, flick = o.flick || 60, dx = o.dx || 0;
  const g = await geometry(page);
  const b = g.ball;
  await page.mouse.move(b.x, b.y);
  await page.mouse.down();
  // The pull: dense samples like a real 300 ms drag (each CDP move costs ~15 ms → 12 steps ≈ 180–300 ms)
  await page.mouse.move(b.x, b.y + drag, { steps: Math.max(6, Math.round(dragMs / 25)) });
  // The flick: the  px up in a few back-to-back moves (each CDP mouse event costs ~15 ms, so 4 steps ≈ 60–80 ms;
  // a real flick is 0.35–2.2 css-px/ms — slower reads as WEAK, faster as YANKED).
  await page.mouse.move(b.x + dx, b.y + drag - flick, { steps: 6 });
  await page.mouse.up();
  return g;
}

/** The same gesture through CDP touch events (Chromium turns them into pointer events with pointerType 'touch'). */
async function touchFlick(page, o) {
  o = o || {};
  const drag = o.drag || 120, dragMs = o.dragMs || 300, flick = o.flick || 60;
  const g = await geometry(page);
  const b = g.ball;
  const cdp = await page.context().newCDPSession(page);
  const tp = (x, y) => ({ x: x, y: y, id: 1, radiusX: 4, radiusY: 4, force: 1 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(b.x, b.y)] });
  const n1 = Math.max(6, Math.round(dragMs / 25));
  for (let i = 1; i <= n1; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(b.x, b.y + drag * i / n1)] });
  const n2 = 6;   // see mouseFlick
  for (let i = 1; i <= n2; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(b.x + i / 4, b.y + drag - flick * i / n2)] });
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

/**
 * Wait until a senior-season kick is armed, opening the next game when the current one has run out of chances
 * (a game has 3-5, so a spec that needs more kicks than that crosses into the following week).
 */
async function hsArm(page, timeout) {
  const ms = timeout || 12000;
  await page.waitForFunction(() => {
    const s = RTG.UI.store.state, v = RTG.UI.KickView.current();
    const open = !!(s.pending && s.pending.kind === 'KICKS');
    return open ? (!!v && v.phase() === 'SETUP') : RTG.UI.Router.current() === 'hsseason';
  }, null, { timeout: ms });
  const open = await page.evaluate(() => { const s = RTG.UI.store.state; return !!(s.pending && s.pending.kind === 'KICKS'); });
  if (!open) {
    await page.evaluate(() => { RTG.UI.store.dispatch('hsStartGame'); RTG.UI.Router.sync(); });
    await page.waitForFunction(() => {
      const v = RTG.UI.KickView.current();
      return RTG.UI.Router.current() === 'hsgame' && !!v && v.phase() === 'SETUP';
    }, null, { timeout: ms });
  }
  return page.evaluate(() => RTG.UI.store.state.pending.session.results.length);
}

module.exports = { useFlick, openHsGame, geometry, mouseFlick, touchFlick, waitPhase, waitSetup, hsArm };
