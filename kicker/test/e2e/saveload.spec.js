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
      // a successful import replaces the state → Router.sync({force}) lands on the career's screen; the toast carries the message
      await page.locator('.toast', { hasText: /Imported/ }).waitFor();
      await H.waitForScreen(page, 'hub');
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

test('saveload http desktop: a quota-failed save is still listed, summarised and loadable (QA1-01)', async () => {
  const app = await H.openApp({ mode: 'http', viewport: 'desktop' });
  const { page } = app;
  try {
    await H.debug(page, 'newCareer', { seed: 11, name: 'Quota Tester' });
    await H.debug(page, 'jumpTo', { stage: 'COLLEGE', phase: 'REG', week: 1 });
    const r1 = await page.evaluate(() => RTG.UI.store.save('1'));
    assert.equal(r1.persisted, true, 'the first save reaches localStorage');
    // every rtg.save.* write now throws QuotaExceededError
    await page.evaluate(() => {
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (String(k).indexOf('rtg.save.') === 0) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
        return orig.call(this, k, v);
      };
    });
    await H.debug(page, 'jumpTo', { stage: 'COLLEGE', phase: 'REG', week: 4 });
    const out = await page.evaluate(() => {
      const st = RTG.UI.store;
      const r2 = st.save('2');
      return { r2: r2, summary: st.slotSummary('2'), load: st.load('2'), week: st.state.week };
    });
    assert.equal(out.r2.ok, true);
    assert.equal(out.r2.persisted, false, 'store.save reports persisted:false honestly');
    assert.ok(out.summary, 'the memory-only slot still has a summary');
    assert.equal(out.summary.week, 4, 'the summary is the week-4 save, not the stale slot content');
    assert.equal(out.load.ok, true, 'the memory-only slot loads');
    assert.equal(await page.evaluate(() => RTG.UI.store.state.week), 4, 'loading it restores week 4');
    // the player is warned once (shell toast)
    await page.locator('.toast', { hasText: /memory only/i }).waitFor({ timeout: 3000 });
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});

test('saveload http desktop: loading a save applies the CURRENT UI settings, not the saved mirror (QA1-02)', async () => {
  const app = await H.openApp({ mode: 'http', viewport: 'desktop' });
  const { page } = app;
  try {
    await H.debug(page, 'newCareer', { seed: 77, name: 'Mirror Tester' });
    const r = await page.evaluate(() => {
      const st = RTG.UI.store;
      st.setSetting('playKickoffs', false);
      st.setSetting('autoPat', 'off');
      st.save('1');                                        // saved with kickoffs off
      st.setSetting('playKickoffs', true);
      st.setSetting('autoPat', 'all');
      st.setSetting('simSpeed', 2);
      const load = st.load('1');
      return { ok: load.ok, ui: JSON.parse(JSON.stringify(st.settings)), mirror: JSON.parse(JSON.stringify(st.state.settings)) };
    });
    assert.equal(r.ok, true);
    assert.equal(r.ui.playKickoffs, true);
    assert.deepEqual(r.mirror, { autoPat: 'all', playKickoffs: true, simSpeed: 2 },
      'state.settings is rebuilt from the UI settings on load (UI_API §2.2)');
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});

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
    // QA1-08: human copy, never the raw enum ('Y1 COLLEGE.PRE')
    assert.doesNotMatch(summary, /COLLEGE|RETIRED|LEGACY|\bREG\b|\bPRE\b/, 'no raw stage/phase enum: ' + summary);
    assert.match(summary, /College · Preseason/, 'stage and phase in human copy: ' + summary);
    await H.clickButton(page, 'CONTINUE');
    await page.waitForFunction(() => RTG.UI.store.state !== null);
    const after1 = H.stripVolatile(await H.debug(page, 'getState'));
    assert.deepEqual(after1, before);
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});

// QA1-10 (the title screen's share of it): "LONG 0" is not a 0-yard field goal, it is no field goal at all —
// the records ticker must read the em dash like every other surface (RTG.UI.Kit.longText).
test('saveload http desktop: the title records ticker never prints "LONG 0"', async () => {
  const app = await H.openApp({ mode: 'http', viewport: 'desktop' });
  const { page } = app;
  try {
    await page.evaluate(() => {
      RTG.UI.Storage.setJSON(RTG.UI.Store.KEYS.records, {
        careers: [
          { seed: 1, name: 'No Makes', tier: 'Journeyman', hof: 120, fgm: 0, long: 0, gw: 0, seasons: 2 },
          { seed: 2, name: 'Big Leg', tier: 'Legend', hof: 1900, fgm: 480, long: 62, gw: 14, seasons: 15 }
        ],
        best: {}
      });
      RTG.UI.Router.go('title', {}, { replace: true });
    });
    await H.waitForScreen(page, 'title');
    const ticker = await page.locator('.ticker-inner').textContent();
    assert.match(ticker, /No Makes .* LONG —/, 'a career with no makes shows an em dash: ' + ticker.slice(0, 160));
    assert.doesNotMatch(ticker, /LONG 0(?!\d)/, 'no "LONG 0" anywhere in the ticker');
    assert.match(ticker, /Big Leg .* LONG 62/, 'a real long is still a number');
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});
