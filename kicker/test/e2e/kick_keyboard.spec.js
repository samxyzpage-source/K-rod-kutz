/**
 * kick_keyboard.spec (SPEC §5.2): meter mode — ArrowLeft ×4, Space, wait 300 ms, Space, wait 200 ms, Space →
 * a result; input.aim ≈ −2 ± 6·needle (i.e. aim = −2 + 6·needle with quality = 1 − |needle|); the meter emits the
 * same {power, aim, quality} triple as the flick.
 */
'use strict';
const { test, after } = require('node:test');
const H = require('./_harness');
const K = require('./_kickhelpers');
const assert = H.assert;

after(async () => { await H.closeBrowser(); });

async function setMeter(page) {
  await page.evaluate(() => RTG.UI.store.setSetting('inputMode', 'meter'));
}

H.matrix(({ mode, vp }) => {
  test(`kick_keyboard ${mode} ${vp}: ArrowLeft×4, Space ×3 → result with aim −2 + 6·needle`, async () => {
    const app = await H.openApp({ mode, viewport: vp });
    const { page } = app;
    try {
      await setMeter(page);
      await K.openShowcase(page, 99);
      assert.equal(await page.evaluate(() => document.querySelector('.kickview').classList.contains('kv-mode-meter')), true, 'meter mode scene');
      for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
      assert.equal(await page.evaluate(() => RTG.UI.KickView.current().phase()), 'SETUP');
      await page.keyboard.press('Space');
      await page.waitForFunction(() => RTG.UI.KickView.current().phase() === 'POWER');
      await page.waitForTimeout(300);
      await page.keyboard.press('Space');
      await page.waitForFunction(() => RTG.UI.KickView.current().phase() === 'NEEDLE');
      await page.waitForTimeout(200);
      await page.keyboard.press('Space');
      await K.waitPhase(page, 'RESULT', 8000);
      const st = await H.debug(page, 'getState');
      assert.equal(st.pending.session.results.length, 1);
      const r = st.pending.session.results[0];
      assert.equal(r.auto, false);
      // aim = −2 (4 taps × 0.5°) + 6·needle, quality = 1 − |needle|  ⇒ needle recovered from quality must explain the aim
      const needleAbs = 1 - r.quality;
      const expectedA = -2 + 6 * needleAbs, expectedB = -2 - 6 * needleAbs;
      const ok = Math.abs(r.aim - expectedA) < 0.06 || Math.abs(r.aim - expectedB) < 0.06;
      assert.ok(ok, 'aim ' + r.aim + ' ≈ −2 ± 6·' + needleAbs.toFixed(3));
      assert.ok(Math.abs(r.aim + 2) <= 6.01, 'aim within −2 ± 6');
      assert.ok(r.power > 0 && r.power <= 1.15, 'power from the meter (' + r.power + ')');
      assert.ok(await page.locator('.kv-banner').isVisible(), 'banner visible');
      if (mode === 'http') await H.shot(page, 'kick_keyboard_result_' + vp);
      assert.deepEqual(app.errors, [], 'console errors');
    } finally { await app.close(); }
  });
}, H.MODES, ['phone', 'desktop']);

test('kick_keyboard file desktop: Enter works like Space; Space skips the flight after 300 ms', async () => {
  const app = await H.openApp({ mode: 'file', viewport: 'desktop' });
  const { page } = app;
  try {
    await setMeter(page);
    await K.openShowcase(page, 100);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => RTG.UI.KickView.current().phase() === 'POWER');
    await page.waitForTimeout(450);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => RTG.UI.KickView.current().phase() === 'NEEDLE');
    await page.waitForTimeout(350);
    await page.keyboard.press('Enter');
    await K.waitPhase(page, 'FLIGHT', 8000);
    await page.waitForTimeout(350);
    await page.keyboard.press('Space');            // skip
    await K.waitPhase(page, 'RESULT', 1500);
    const r = (await H.debug(page, 'getState')).pending.session.results[0];
    assert.equal(typeof r.outcome, 'string');
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});

test('kick_keyboard file phone: left-footed mirror flips the arrow nudge', async () => {
  const app = await H.openApp({ mode: 'file', viewport: 'phone' });
  const { page } = app;
  try {
    await page.evaluate(() => { RTG.UI.store.setSetting('inputMode', 'meter'); RTG.UI.store.setSetting('leftFooted', true); });
    await K.openShowcase(page, 101);
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
    await page.keyboard.press('Space');
    await K.waitPhase(page, 'RESULT', 8000);
    const r = (await H.debug(page, 'getState')).pending.session.results[0];
    const needleAbs = 1 - r.quality;
    assert.ok(Math.abs(r.aim - 2) <= 6 * needleAbs + 0.06, 'mirrored: aim ' + r.aim + ' ≈ +2 ± 6·' + needleAbs.toFixed(3));
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});
