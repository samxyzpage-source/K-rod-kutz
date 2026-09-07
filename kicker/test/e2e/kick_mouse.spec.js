/**
 * kick_mouse.spec (SPEC §5.2): on the showcase, page.mouse presses on the ball, drags down 120 px over 300 ms,
 * flicks up 60 px in 80 ms and releases → the result banner is visible; getState().pending.session.results.length
 * === 1 with input.power within 0.5–1.15 and auto === false. Overswing: a drag to the bottom of the viewport (past
 * D_full) → power > 1 and feedback.power === 'OVERSWING'. Runs on file:// and http at the phone and desktop viewports.
 */
'use strict';
const { test, after } = require('node:test');
const H = require('./_harness');
const K = require('./_kickhelpers');
const assert = H.assert;

after(async () => { await H.closeBrowser(); });

H.matrix(({ mode, vp }) => {
  test(`kick_mouse ${mode} ${vp}: press, pull 120 px, flick → banner + result`, async () => {
    const app = await H.openApp({ mode, viewport: vp });
    const { page } = app;
    try {
      await K.openShowcase(page, 4242);
      const g = await K.geometry(page);
      assert.ok(g.scale >= 2 ? Number.isInteger(g.scale) : (g.scale === 1 || g.scale >= 1.35), 'integer scale, or the fractional phone fit ≥ 1.35 (' + g.scale + ')');
      if (vp === 'desktop') assert.ok(Number.isInteger(g.scale) && g.scale >= 2, 'desktop integer-scales (' + g.scale + ')');
      await K.mouseFlick(page, { drag: 120, dragMs: 300, flick: 60, flickMs: 80 });
      await K.waitPhase(page, 'RESULT', 8000);
      const banner = page.locator('.kv-banner');
      assert.ok(await banner.isVisible(), 'result banner visible');
      const text = (await banner.textContent()).trim();
      assert.ok(text.length > 0, 'banner has text');
      const st = await H.debug(page, 'getState');
      assert.equal(st.pending.session.results.length, 1, 'one result recorded');
      const r = st.pending.session.results[0];
      assert.equal(r.auto, false, 'not an auto kick');
      assert.ok(r.power >= 0.5 && r.power <= 1.15, 'input.power within 0.5–1.15 (' + r.power + ')');
      assert.ok(Math.abs(r.aim) <= 12, 'aim clamped');
      assert.ok(r.quality >= 0 && r.quality <= 1, 'quality 0..1');
      assert.equal(typeof r.outcome, 'string');
      // the banner text matches the outcome family
      const made = r.made;
      assert.ok(made ? /GOOD/.test(text) : !/^✓?\s*GOOD!$/.test(text), 'banner matches made=' + made + ' (' + text + ')');
      // feedback line rendered from result.feedback
      const fb = await page.locator('.kv-feedback').textContent();
      assert.match(fb, /Timing: (PURE|GOOD|FAIR|POOR)/);
      assert.match(fb, /Power: \d+ %/);
      // aria-live announced the result
      const live = await page.locator('#live').textContent();
      assert.ok(live.length > 0, 'aria-live announced');
      if (mode === 'http') await H.shot(page, 'kick_mouse_result_' + vp);
      assert.deepEqual(app.errors, [], 'console errors');
    } finally { await app.close(); }
  });

  test(`kick_mouse ${mode} ${vp}: 200 px overswing → feedback.power OVERSWING`, async () => {
    const app = await H.openApp({ mode, viewport: vp });
    const { page } = app;
    try {
      await K.openShowcase(page, 4243);
      const g = await K.geometry(page);
      // D_full = 0.32 × css height (portrait) / 0.45 (landscape), capped at the room below the ball minus 12 px (a
      // finger cannot leave the screen). Pulling to 4 px above the viewport's bottom edge is therefore always past
      // D_full — by 8 px when the room cap binds (desktop), by a lot when 0.32 × height binds (phone) — and power
      // clamps at 1.15, so the exact depth does not matter.
      const room = g.innerHeight - g.ball.y;
      const drag = Math.floor(room - 4);
      assert.ok(drag >= 60, 'room below the ball for an overswing (' + room + ' px)');
      await K.mouseFlick(page, { drag: drag, dragMs: 300, flick: 60, flickMs: 80 });
      await K.waitPhase(page, 'RESULT', 8000);
      const st = await H.debug(page, 'getState');
      const r = st.pending.session.results[0];
      assert.ok(r.power > 1.0, 'power above 1.0 (' + r.power + ')');
      assert.equal(r.feedback.power, 'OVERSWING');
      assert.match(await page.locator('.kv-feedback').textContent(), /Power: 1\d\d %/);
      assert.deepEqual(app.errors, [], 'console errors');
    } finally { await app.close(); }
  });
}, H.MODES, ['phone', 'desktop']);

test('kick_mouse file desktop: no forward flick → mishit (power 0.5, quality 0.3)', async () => {
  const app = await H.openApp({ mode: 'file', viewport: 'desktop' });
  const { page } = app;
  try {
    await K.openShowcase(page, 4244);
    const g = await K.geometry(page);
    await page.mouse.move(g.ball.x, g.ball.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(g.ball.x, g.ball.y + 15 * i); await page.waitForTimeout(30); }
    await page.waitForTimeout(200);
    await page.mouse.up();   // released without flicking up
    await K.waitPhase(page, 'RESULT', 8000);
    const r = (await H.debug(page, 'getState')).pending.session.results[0];
    assert.equal(r.power, 0.5, 'mishit power');
    assert.equal(r.quality, 0.3, 'mishit quality');
    assert.ok(Math.abs(r.aim) <= 12);
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});
