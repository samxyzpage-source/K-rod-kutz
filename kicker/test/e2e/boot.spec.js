/**
 * boot.spec (SPEC §5.2): the page loads with zero console errors on file:// and http at 390×844 and 1280×800;
 * the title renders; with fonts.googleapis.com / gstatic blocked the page still renders and a kick can be played
 * (through the engine: debug.forceKick); RTG.VERSION is defined; RTG.debug is present; no horizontal scroll.
 */
'use strict';
const { test, after } = require('node:test');
const H = require('./_harness');
const assert = H.assert;

after(async () => { await H.closeBrowser(); });

H.matrix(({ mode, vp }) => {
  test(`boot ${mode} ${vp}: zero errors, title renders`, async () => {
    const app = await H.openApp({ mode, viewport: vp });
    const { page } = app;
    try {
      assert.deepEqual(app.errors, [], 'console errors on boot');
      assert.equal(await page.evaluate(() => typeof RTG.VERSION), 'string', 'RTG.VERSION');
      assert.equal(await page.evaluate(() => typeof RTG.debug), 'object', 'RTG.debug');
      assert.equal(await page.evaluate(() => typeof RTG.debug.getState), 'function');
      assert.equal(await page.evaluate(() => RTG.UI.Router.current()), 'title');
      await page.locator('.title-screen').waitFor({ state: 'visible' });
      const logo = await page.locator('.title-logo').textContent();
      assert.match(logo, /ROAD TO GLORY/);
      assert.match(logo, /KICKER/);
      assert.ok(await page.locator('.title-canvas').isVisible(), 'title canvas visible');
      const newBtn = page.locator('button', { hasText: 'NEW CAREER' });
      assert.ok(await newBtn.isVisible(), 'NEW CAREER button visible');
      const box = await newBtn.boundingBox();
      assert.ok(box.height >= 44, 'touch target ≥ 44px (' + box.height + ')');
      await H.noHorizontalScroll(page, 'title');
      // chrome hidden on the title
      assert.ok(await page.evaluate(() => document.getElementById('app').classList.contains('chromeless')), 'title is chromeless');
      // the aria-live region exists
      assert.equal(await page.locator('#live').count(), 1);
      if (mode === 'http') await H.shot(page, 'title_' + vp);
      assert.deepEqual(app.errors, [], 'console errors after render');
    } finally { await app.close(); }
  });
}, H.MODES, ['phone', 'desktop']);

test('boot http phone: fonts blocked → still renders and a kick can be played', async () => {
  const app = await H.openApp({ mode: 'http', viewport: 'phone', blockFonts: true });
  const { page } = app;
  try {
    await page.locator('.title-screen').waitFor({ state: 'visible' });
    const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    assert.match(font, /Press Start 2P/, 'font stack declared (fallback used when blocked)');
    const st = await H.debug(page, 'newCareer', { seed: 4242, name: 'Font Fallback' });
    assert.equal(st.stage, 'HS');
    assert.equal(st.phase, 'SEASON');
    await page.evaluate(() => { RTG.UI.store.dispatch('hsStartGame'); RTG.UI.Router.sync(); });
    assert.equal((await H.debug(page, 'getState')).pending.kind, 'KICKS');
    const res = await H.debug(page, 'forceKick', { outcome: 'GOOD' });
    assert.equal(res.made, true);
    assert.equal(res.outcome, 'GOOD');
    const after1 = await H.debug(page, 'getState');
    assert.equal(after1.pending.session.results.length, 1);
    assert.equal(after1.pending.session.results[0].forced, true);
    // a real (unforced) kick through the engine with the AI rule
    await page.evaluate(() => RTG.UI.store.dispatch('sessionKick', null));
    const after2 = await H.debug(page, 'getState');
    assert.equal(after2.pending.session.results.length, 2);
    assert.equal(after2.pending.session.results[1].auto, true);
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});

test('boot http desktop: a write that falls back to memory shadows the backend (QA1-01)', async () => {
  const app = await H.openApp({ mode: 'http', viewport: 'desktop' });
  const { page } = app;
  try {
    const r = await page.evaluate(() => {
      const S = RTG.UI.Storage;
      S.setItem('rtg.probe', 'old');                       // lands in the real localStorage
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (String(k).indexOf('rtg.probe') === 0) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
        return orig.call(this, k, v);
      };
      const wrote = S.setItem('rtg.probe', 'new');         // quota → memory fallback
      const out = {
        wrote: wrote,
        read: S.getItem('rtg.probe'),                      // must be the memory copy, not the stale backend value
        json: (S.setJSON('rtg.probe.j', { a: 1 }), S.getJSON('rtg.probe.j')),
        keys: S.keys().indexOf('rtg.probe.j') >= 0,
        memoryKeys: S.memoryKeys(),
        degraded: S.degraded
      };
      Storage.prototype.setItem = orig;                    // storage recovers
      S.setItem('rtg.probe', 'fresh');
      out.afterRecovery = S.getItem('rtg.probe');
      out.shadowDropped = S.memoryKeys().indexOf('rtg.probe') < 0;
      S.removeItem('rtg.probe'); S.removeItem('rtg.probe.j');
      out.removed = S.getItem('rtg.probe.j');
      return out;
    });
    assert.equal(r.wrote, false, 'setItem reports the fallback');
    assert.equal(r.read, 'new', 'the memory copy shadows the stale backend value');
    assert.deepEqual(r.json, { a: 1 }, 'getJSON reads the memory copy');
    assert.equal(r.keys, true, 'keys() lists memory-only keys');
    assert.ok(r.memoryKeys.indexOf('rtg.probe') >= 0, 'memoryKeys() reports the fallback keys');
    assert.equal(r.degraded, true, 'Storage.degraded flips on the first fallback');
    assert.equal(r.afterRecovery, 'fresh', 'a later successful write wins');
    assert.equal(r.shadowDropped, true, 'the shadow is dropped once the backend is current again');
    assert.equal(r.removed, null, 'removeItem clears the memory copy too');
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});

test('boot file desktop: debug mode validates state after every dispatch', async () => {
  const app = await H.openApp({ mode: 'file', viewport: 'desktop', debug: true });
  const { page } = app;
  try {
    assert.ok(await page.locator('.dbg-panel').count() === 1, 'debug panel mounted with ?debug=1');
    await H.debug(page, 'newCareer', { seed: 9, name: 'Strict Mode' });
    assert.equal(await page.evaluate(() => RTG.UI.store.isDebug()), true);
    const v = await H.debug(page, 'validate');
    assert.equal(v.ok, true, (v.errors || []).join(' | '));
    // storage adapter works on file:// too
    assert.equal(await page.evaluate(() => RTG.UI.Storage.getItem('rtg.save.auto') !== null), true, 'autosave written after newCareer');
    const perf = await H.debug(page, 'perf');
    assert.equal(typeof perf.listeners, 'number');
    assert.equal(typeof perf.rafActive, 'boolean');
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});
