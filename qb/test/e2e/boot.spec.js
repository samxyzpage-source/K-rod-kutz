/**
 * boot.spec: the demo page loads with zero console / page errors on file:// and http at 390×844 and 1280×800,
 * RTG.UI.app.ready turns true, #app is not blank, no horizontal scroll; with fonts.googleapis.com blocked the
 * page still boots. Written by the scaffold agent against the stubs; it must keep passing with the real shell.
 *
 *   /opt/node22/bin/node qb/test/e2e/boot.spec.js
 */
'use strict';
const { test, after } = require('node:test');
const H = require('./_harness');
const assert = H.assert;

after(async () => { await H.closeBrowser(); });

H.matrix(({ mode, vp }) => {
  test(`boot ${mode} ${vp}: zero errors, page renders`, async () => {
    const app = await H.openDemo({ mode, viewport: vp, seed: 4242 });
    const { page } = app;
    try {
      assert.deepEqual(app.errors, [], 'console / page errors on boot');
      assert.deepEqual(app.foreignErrors, [], 'errors in the scene files on boot');
      assert.equal(await page.evaluate(() => typeof RTG.VERSION), 'string', 'RTG.VERSION');
      assert.equal(await page.evaluate(() => typeof RTG.debug), 'object', 'RTG.debug');
      assert.equal(await page.evaluate(() => RTG.UI.app.ready), true, 'RTG.UI.app.ready');
      assert.equal(await page.evaluate(() => typeof RTG.Play.buildContext), 'function', 'RTG.Play loaded');
      assert.equal(await page.evaluate(() => typeof RTG.UI.C.el), 'function', 'component kit loaded');
      assert.equal(await page.evaluate(() => typeof RTG.UI.Sprites.get), 'function', 'sprites loaded');
      const text = await page.evaluate(() => document.getElementById('app').textContent.trim());
      assert.ok(text.length > 0, '#app is blank');
      assert.equal(await page.locator('.boot-error').count(), 0, 'the boot error hook fired');
      await H.noHorizontalScroll(page, 'boot ' + vp);
    } finally {
      await app.close();
    }
  });
});

test('boot file phone with fonts blocked: still renders', async () => {
  const app = await H.openDemo({ mode: 'file', viewport: 'phone', seed: 7, blockFonts: true });
  try {
    assert.deepEqual(app.errors, []);
    assert.equal(await app.page.evaluate(() => RTG.UI.app.ready), true);
  } finally {
    await app.close();
  }
});
