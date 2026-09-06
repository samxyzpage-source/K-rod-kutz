/**
 * kick_touch.spec (SPEC §5.2): the same flick through real touch events (CDP Input.dispatchTouchEvent →
 * pointerType 'touch') on iPhone 12 portrait and landscape (844×390); the canvas fits the viewport (integer
 * scale, fully inside the viewport) and document.documentElement.scrollWidth <= innerWidth.
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
  { label: 'landscape', viewport: { width: 844, height: 390, hasTouch: true, isMobile: true }, dpr: IPHONE.deviceScaleFactor }
];

for (const mode of H.MODES) {
  for (const cs of CASES) {
    test(`kick_touch ${mode} ${cs.label}: touch flick → result, canvas fits, no horizontal scroll`, async () => {
      const app = await H.openApp({ mode, viewport: cs.viewport, hasTouch: true, isMobile: true, dpr: cs.dpr });
      const { page } = app;
      try {
        await K.openShowcase(page, 77);
        const g = await K.geometry(page);
        assert.ok(Number.isInteger(g.scale) && g.scale >= 1, 'integer scale ' + g.scale);
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
    await K.openShowcase(page, 78);
    const before = await page.evaluate(() => window.scrollY);
    await K.touchFlick(page, { drag: 140, dragMs: 300, flick: 60, flickMs: 80 });
    const after = await page.evaluate(() => window.scrollY);
    assert.equal(after, before, 'no scroll during the gesture');
    await K.waitPhase(page, 'RESULT', 8000);
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});
