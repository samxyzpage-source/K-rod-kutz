/**
 * saveload.spec (SPEC §5.2): Save to slot 2 → reload page → Load slot 2 → getState() equals the saved state
 * (ignoring playtimeSec); slots 1/3 untouched; export string → clear storage → import → same state; a
 * checksum-tampered blob is refused with a message. Runs on file:// and http at 390×844 and 1280×800.
 */
'use strict';
const { test, after } = require('node:test');
const H = require('./_harness');
const assert = H.assert;

after(async () => { await H.closeBrowser(); });

function tamper(exportString) {
  const json = Buffer.from(exportString, 'base64').toString('utf8');
  const blob = JSON.parse(json);
  blob.career.player.name.full = 'Tampered Name';
  return Buffer.from(JSON.stringify(blob), 'utf8').toString('base64');
}

H.matrix(({ mode, vp }) => {
  test(`saveload ${mode} ${vp}: slot 2 round trip, export/import, tamper refused`, async () => {
    const app = await H.openApp({ mode, viewport: vp });
    const { page } = app;
    try {
      await H.debug(page, 'newCareer', { seed: 777, name: 'Save Tester', archetype: 'SURGEON' });
      await H.debug(page, 'jumpTo', { stage: 'COLLEGE', phase: 'REG', week: 2 });
      await H.debug(page, 'go', 'saves');
      await H.waitForScreen(page, 'saves');
      assert.equal(await page.evaluate(() => RTG.UI.Router.current()), 'saves', 'saves screen registered');
      await page.click('[data-action="save-2"]');
      await page.locator('.save-msg', { hasText: /Saved to SLOT 2/ }).waitFor();
      const before = H.stripVolatile(await H.debug(page, 'getState'));
      const keys = await page.evaluate(() => RTG.UI.Storage.keys());
      assert.ok(keys.includes('rtg.save.2'), 'rtg.save.2 written');
      assert.ok(!keys.includes('rtg.save.1') && !keys.includes('rtg.save.3'), 'slots 1/3 untouched');
      if (mode === 'http') await H.shot(page, 'saves_' + vp);
      await H.noHorizontalScroll(page, 'saves');

      // reload → title → LOAD → slot 2
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => window.RTG && RTG.UI && RTG.UI.store && RTG.UI.Router.current() === 'title');
      assert.equal(await page.evaluate(() => RTG.UI.store.state), null, 'no career after reload');
      await H.clickButton(page, 'LOAD');
      await H.waitForScreen(page, 'saves');
      const slot2 = page.locator('.slot-card', { hasText: 'SLOT 2' });
      assert.match(await slot2.textContent(), /Save Tester/, 'slot 2 summary shows the name');
      await page.click('[data-action="load-2"]');
      await page.waitForFunction(() => RTG.UI.store.state !== null);
      const loaded = H.stripVolatile(await H.debug(page, 'getState'));
      assert.deepEqual(loaded, before, 'loaded state equals the saved state (ignoring playtimeSec)');
      assert.equal(await page.evaluate(() => RTG.UI.store.rng.state()), before.rngState, 'rng restored');
      await H.waitForScreen(page, 'hub');

      // export → clear storage → import → same state
      await H.debug(page, 'go', 'saves');
      await page.click('[data-action="export"]');
      const exported = await page.locator('.export-area').inputValue();
      assert.ok(exported.length > 1000, 'export string filled');
      await H.debug(page, 'clearStorage');
      assert.deepEqual(await page.evaluate(() => RTG.UI.Storage.keys().filter(k => k.indexOf('rtg.') === 0)), [], 'storage cleared');
      await page.fill('.import-area', exported);
      await page.click('[data-action="import"]');
      await page.locator('.modal', { hasText: /Import this save/ }).waitFor();
      await H.clickButton(page, 'IMPORT', page.locator('.modal'));
      await page.locator('.save-msg', { hasText: /Imported/ }).waitFor();
      const imported = H.stripVolatile(await H.debug(page, 'getState'));
      assert.deepEqual(imported, before, 'imported state equals the saved state');
      // debug import path too
      const dr = await H.debug(page, 'importString', exported);
      assert.equal(dr.ok, true);

      // checksum-tampered blob refused with a message
      const bad = tamper(exported);
      const rej = await H.debug(page, 'importString', bad);
      assert.equal(rej.ok, false);
      assert.equal(rej.code, 'CHECKSUM');
      assert.match(rej.error, /checksum/i);
      await H.debug(page, 'go', 'saves');
      await page.fill('.import-area', bad);
      await page.click('[data-action="import"]');
      await H.clickButton(page, 'IMPORT', page.locator('.modal'));
      await page.locator('.save-msg', { hasText: /checksum/i }).waitFor();
      const still = H.stripVolatile(await H.debug(page, 'getState'));
      assert.deepEqual(still, before, 'state unchanged after a refused import');
      assert.deepEqual(app.errors, [], 'console errors');
    } finally { await app.close(); }
  });
}, H.MODES, ['phone', 'desktop']);

test('saveload http phone: CONTINUE on the title resumes the autosave', async () => {
  const app = await H.openApp({ mode: 'http', viewport: 'phone' });
  const { page } = app;
  try {
    await H.debug(page, 'newCareer', { seed: 31337, name: 'Auto Saver' });
    await H.debug(page, 'jumpTo', { stage: 'COLLEGE', phase: 'PRE' });
    const before = H.stripVolatile(await H.debug(page, 'getState'));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.RTG && RTG.UI && RTG.UI.Router && RTG.UI.Router.current() === 'title');
    const summary = await page.locator('.title-summary').textContent();
    assert.match(summary, /Auto Saver/, 'title shows the autosave summary');
    await H.clickButton(page, 'CONTINUE');
    await page.waitForFunction(() => RTG.UI.store.state !== null);
    const after1 = H.stripVolatile(await H.debug(page, 'getState'));
    assert.deepEqual(after1, before);
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});
