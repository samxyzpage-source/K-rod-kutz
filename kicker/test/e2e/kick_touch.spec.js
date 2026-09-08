/**
 * kick_touch.spec (SPEC §5.2): the same flick through real touch events (CDP Input.dispatchTouchEvent →
 * pointerType 'touch') on iPhone 12 portrait and landscape (844×390), plus a 375×667 small phone; the canvas fits the
 * viewport (integer scale — or, on the small phone where 1× would leave a 192-px scene, the fractional fit ≥ 1.35 that
 * fills ≥ 85 % of the width — fully inside the viewport) and document.documentElement.scrollWidth <= innerWidth.
 */
'use strict';
const { test, after } = require('node:test');
const H = require('./_harness');
const K = require('./_kickhelpers');
const { devices } = require('/opt/node22/lib/node_modules/playwright');
const assert = H.assert;

after(async () => { await H.closeBrowser(); });

const IPHONE = devices['iPhone 12'];
const CASES = [
  { label: 'portrait', viewport: { width: IPHONE.viewport.width, height: IPHONE.viewport.height, hasTouch: true, isMobile: true }, dpr: IPHONE.deviceScaleFactor },
  { label: 'landscape', viewport: { width: 844, height: 390, hasTouch: true, isMobile: true }, dpr: IPHONE.deviceScaleFactor },
  // iPhone SE / small Android class: the integer fit would be 1× (a 192-px scene on a 375-px screen) → fractional fit
  { label: 'small', viewport: { width: 375, height: 667, hasTouch: true, isMobile: true }, dpr: 2, fractional: true }
];

for (const mode of H.MODES) {
  for (const cs of CASES) {
    test(`kick_touch ${mode} ${cs.label}: touch flick → result, canvas fits, no horizontal scroll`, async () => {
      const app = await H.openApp({ mode, viewport: cs.viewport, hasTouch: true, isMobile: true, dpr: cs.dpr });
      const { page } = app;
      try {
        await K.useFlick(page); await K.openShowcase(page, 77);
        const g = await K.geometry(page);
        assert.ok(g.scale >= 2 ? Number.isInteger(g.scale) : (g.scale === 1 || g.scale >= 1.35), 'integer scale, or the fractional phone fit ≥ 1.35 (' + g.scale + ')');
        if (cs.label !== 'landscape') assert.ok(g.rect.w >= g.innerWidth * 0.8, 'the portrait scene fills the phone width (' + g.rect.w + ' of ' + g.innerWidth + ')');
        if (cs.fractional) {
          assert.ok(g.scale >= 1.35 && g.scale < 2 && !Number.isInteger(g.scale), 'small phone: fractional fit in [1.35, 2) instead of 1× (' + g.scale + ')');
          assert.ok(g.rect.w >= g.innerWidth * 0.85, 'small phone: the scene fills ≥ 85 % of the width (' + g.rect.w + ' of ' + g.innerWidth + ')');
        }
        assert.ok(g.rect.x >= 0 && g.rect.x + g.rect.w <= g.innerWidth + 0.5, 'canvas inside the viewport horizontally');
        assert.ok(g.rect.y >= 0 && g.rect.y + g.rect.h <= g.innerHeight + 0.5, 'canvas inside the viewport vertically (' + g.rect.y + '+' + g.rect.h + ' vs ' + g.innerHeight + ')');
        assert.equal(g.landscape, cs.label === 'landscape', 'orientation by container aspect');
        assert.equal(g.w, cs.label === 'landscape' ? 320 : 192, 'virtual width');
        await H.noHorizontalScroll(page, 'showcase ' + cs.label);
        // touch-action none on the canvas so the page does not scroll under the pull
        assert.equal(await page.evaluate(() => getComputedStyle(RTG.UI.KickView.current().canvas).touchAction), 'none');
        if (mode === 'http') await H.shot(page, 'kick_touch_' + cs.label);
        await K.touchFlick(page, { drag: cs.label === 'landscape' ? 80 : 120, dragMs: 300, flick: 50, flickMs: 80 });
        await K.waitPhase(page, 'RESULT', 8000);
        assert.ok(await page.locator('.kv-banner').isVisible(), 'banner visible');
        const st = await H.debug(page, 'getState');
        assert.equal(st.pending.session.results.length, 1);
        const r = st.pending.session.results[0];
        assert.equal(r.auto, false);
        assert.ok(r.power > 0 && r.power <= 1.15, 'power ' + r.power);
        await H.noHorizontalScroll(page, 'showcase result ' + cs.label);
        if (mode === 'http') await H.shot(page, 'kick_touch_result_' + cs.label);
        assert.deepEqual(app.errors, [], 'console errors');
      } finally { await app.close(); }
    });
  }
}

test('kick_touch file portrait: the page never scrolls during the pull (touch-action + pointer capture)', async () => {
  const app = await H.openApp({ mode: 'file', viewport: CASES[0].viewport, hasTouch: true, isMobile: true, dpr: 2 });
  const { page } = app;
  try {
    await K.useFlick(page); await K.openShowcase(page, 78);
    const before = await page.evaluate(() => window.scrollY);
    await K.touchFlick(page, { drag: 140, dragMs: 300, flick: 60, flickMs: 80 });
    const after = await page.evaluate(() => window.scrollY);
    assert.equal(after, before, 'no scroll during the gesture');
    await K.waitPhase(page, 'RESULT', 8000);
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});

/** Press on the ball, pull down `drag` px, hold still for `holdMs`, flick up and release (real CDP touch). */
async function pullHoldFlick(page, o) {
  const g = await K.geometry(page);
  const b = g.ball;
  const cdp = await page.context().newCDPSession(page);
  const tp = (x, y) => ({ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(b.x, b.y)] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(b.x, b.y + o.drag * i / 8)] });
  if (o.holdMs) await page.waitForTimeout(o.holdMs);
  for (const up of (o.flickSteps || [24, 60, 120])) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(b.x, b.y + o.drag - up)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(120);
  return g;
}

// §4.6: P is the pull DEPTH reached (clamp(dy / D_full)), whatever the finger did before the flick, and a draw held
// at ≥ 0.95 for more than 1.2 s reports holdMs. Both used to be read off the flick samples alone: a natural
// "draw, aim, release" lost ~13 % of the power and the hesitation clock was zeroed by every flick sample.
test('kick_touch file portrait: a pause at full draw keeps the pull depth, a 1.5 s hold reports holdMs', async () => {
  const app = await H.openApp({ mode: 'file', viewport: CASES[0].viewport, hasTouch: true, isMobile: true, dpr: 2 });
  const { page } = app;
  const read = () => page.evaluate(() => RTG.UI.KickView.current().lastInput());
  try {
    // the same gesture with and without a pause at the bottom — D_full varies with the viewport, the power must not
    await K.useFlick(page); await K.openShowcase(page, 4242);
    await pullHoldFlick(page, { drag: 90, holdMs: 0 });
    const noPause = await read();
    await K.waitPhase(page, 'RESULT', 8000);

    await K.useFlick(page); await K.openShowcase(page, 4242);
    const g = await pullHoldFlick(page, { drag: 90, holdMs: 600 });
    const paused = await read();
    assert.ok(noPause.power > 0.3, 'the 90-px pull registers (' + noPause.power + ')');
    assert.ok(Math.abs(paused.power - noPause.power) < 0.02, 'a 600 ms pause at the bottom does not change the power (' + paused.power + ' vs ' + noPause.power + ')');
    assert.ok(!paused.holdMs, 'a 600 ms pause is under the 1.2 s hesitation line (' + paused.holdMs + ')');
    await K.waitPhase(page, 'RESULT', 8000);

    // held at full draw for 1.5 s → holdMs reaches Kick.resolve
    await K.useFlick(page); await K.openShowcase(page, 4242);
    const deep = Math.floor(g.innerHeight - g.ball.y - 14);   // past D_full whatever the cap, so P ≥ 0.95
    await pullHoldFlick(page, { drag: deep, holdMs: 1500, flickSteps: [3, 40, 110] });
    const held = await read();
    assert.ok(held.holdMs > 1200, 'hesitation passed to the engine (' + held.holdMs + ')');
    assert.ok(held.power > 0.9, 'the held draw keeps its power (' + held.power + ')');
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});

// §4.6 on a landscape phone: the scene must leave 1.15 × D_full of screen under the tee. A stage stretched to the
// full 390 px put the ball 90 px off the bottom edge, collapsing D_full to ~68 px with overswing on the very edge.
test('kick_touch file landscape: D_full stays controllable and the HUD column does not clip', async () => {
  const app = await H.openApp({ mode: 'file', viewport: CASES[1].viewport, hasTouch: true, isMobile: true, dpr: 2 });
  const { page } = app;
  try {
    await K.useFlick(page); await K.openShowcase(page, 4242);
    const g = await K.geometry(page);
    const room = g.innerHeight - g.ball.y;
    assert.ok(room >= 150, 'room below the ball for the pull (' + room + ' px)');
    const hud = await page.evaluate(() => {
      const h = document.querySelector('.kv-hud');
      return { sw: h.scrollWidth, cw: h.clientWidth, clipped: Array.prototype.filter.call(h.querySelectorAll('.kv-chip'), c => c.scrollWidth > c.clientWidth + 1).map(c => c.textContent) };
    });
    assert.deepEqual(hud.clipped, [], 'no HUD chip is cut off in the landscape side column');
    assert.ok(hud.sw <= hud.cw + 1, 'the HUD column does not overflow (' + hud.sw + ' > ' + hud.cw + ')');
    // the session header must stay off the scene: it used to float over the top of the right upright
    const overlap = await page.evaluate(() => {
      const h = document.querySelector('.session-header'), c = RTG.UI.KickView.current().canvas;
      if (!h) return null;
      const a = h.getBoundingClientRect(), b = c.getBoundingClientRect();
      return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    });
    assert.equal(overlap, false, 'the session header does not overlap the kick scene');

    await pullHoldFlick(page, { drag: 130, holdMs: 0, flickSteps: [20, 60, 120] });
    const inp = await page.evaluate(() => RTG.UI.KickView.current().lastInput());
    assert.ok(inp.power > 0.85 && inp.power <= 1.15, 'a 130-px pull is about full power, not clamped overswing (' + inp.power + ')');
    const dFull = 130 / inp.power;
    assert.ok(dFull >= 105, 'D_full ≥ 105 css px in landscape (' + dFull.toFixed(0) + ')');
    assert.ok(g.ball.y + 1.15 * dFull <= g.innerHeight - 10, 'the overswing depth is not on the physical screen edge');
    await K.waitPhase(page, 'RESULT', 8000);
    // the result panel must not bury the TAP TO SKIP hint
    const hit = await page.evaluate(() => {
      const f = document.querySelector('.kv-feedback'), s = document.querySelector('.kv-skip');
      if (!f || f.hidden || !s || s.hidden) return null;
      const a = f.getBoundingClientRect(), b = s.getBoundingClientRect();
      return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    });
    assert.equal(hit, false, 'the result feedback panel does not cover TAP TO SKIP');
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});
