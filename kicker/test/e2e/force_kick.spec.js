/**
 * force_kick.spec (SPEC §5.2): RTG.debug.forceKick({outcome:'DOINK_IN'}) → the banner contains "DOINK";
 * {outcome:'BLOCKED'} → the rush overlay class is present; stats increment (stats.career.doinks / blocked); the
 * doink freeze + TING beat and the 6-frame rush happen before the ruling.
 */
'use strict';
const { test, after } = require('node:test');
const H = require('./_harness');
const K = require('./_kickhelpers');
const assert = H.assert;

after(async () => { await H.closeBrowser(); });

/** Force an outcome on the armed showcase kick and wait for the ruling banner. */
async function force(page, outcome) {
  const res = await H.debug(page, 'forceKick', { outcome: outcome });
  await K.waitPhase(page, 'RESULT', 12000);
  await page.waitForTimeout(80);
  return res;
}

H.matrix(({ mode, vp }) => {
  test(`force_kick ${mode} ${vp}: DOINK_IN banner, BLOCKED rush overlay, stats`, async () => {
    const app = await H.openApp({ mode, viewport: vp });
    const { page } = app;
    try {
      await K.openShowcase(page, 314);
      // 1. DOINK_IN → freeze on the post then "DOINK"
      const doinkP = page.waitForFunction(() => RTG.UI.KickView.current().phase() === 'FREEZE', null, { timeout: 12000 });
      const r1 = await H.debug(page, 'forceKick', { outcome: 'DOINK_IN' });
      assert.equal(r1.outcome, 'DOINK_IN');
      assert.equal(r1.made, true);
      await doinkP;   // the 500 ms freeze on the post happened
      if (mode === 'http' && vp === 'phone') await H.shot(page, 'force_doink_freeze');
      await K.waitPhase(page, 'RESULT', 8000);
      await page.waitForTimeout(80);
      const b1 = (await page.locator('.kv-banner').textContent()).trim();
      assert.match(b1, /DOINK/, 'banner contains DOINK (' + b1 + ')');
      assert.ok(await page.locator('.kv-banner').isVisible());
      assert.equal(await page.evaluate(() => document.querySelector('.kv-banner').classList.contains('kv-banner-doink')), true);
      if (mode === 'http') await H.shot(page, 'force_doink_' + vp);
      // 2. BLOCKED → rush overlay class before/through the ruling
      await K.waitSetup(page, 1, 12000);
      const rushSeen = page.waitForFunction(() => document.querySelector('.kickview').classList.contains('kv-rush'), null, { timeout: 8000 });
      const r2 = await H.debug(page, 'forceKick', { outcome: 'BLOCKED' });
      assert.equal(r2.outcome, 'BLOCKED');
      await rushSeen;
      await K.waitPhase(page, 'RESULT', 8000);
      await page.waitForTimeout(80);
      assert.equal(await page.evaluate(() => document.querySelector('.kickview').classList.contains('kv-rush')), true, 'rush overlay class present');
      assert.match((await page.locator('.kv-banner').textContent()).trim(), /BLOCKED/);
      if (mode === 'http') await H.shot(page, 'force_blocked_' + vp);
      // 3. GOOD and a WIDE_R for the stats
      await K.waitSetup(page, 2, 12000);
      await force(page, 'GOOD');
      assert.match((await page.locator('.kv-banner').textContent()).trim(), /GOOD/);
      await K.waitSetup(page, 3, 12000);
      await force(page, 'WIDE_R');
      assert.match((await page.locator('.kv-banner').textContent()).trim(), /WIDE RIGHT/);
      assert.match(await page.locator('.kv-feedback').textContent(), /Wide right by/);
      const st = await H.debug(page, 'getState');
      const res = st.pending.session.results;
      assert.equal(res.length, 4);
      assert.deepEqual(res.map(r => r.outcome), ['DOINK_IN', 'BLOCKED', 'GOOD', 'WIDE_R']);
      assert.ok(res.every(r => r.forced === true), 'forced flag');
      assert.deepEqual(app.errors, [], 'console errors');
    } finally { await app.close(); }
  });
}, H.MODES, ['phone', 'desktop']);

test('force_kick file desktop: in-game forced kicks increment career stats (doinks, blocked, fgm)', async () => {
  const app = await H.openApp({ mode: 'file', viewport: 'desktop' });
  const { page } = app;
  try {
    await H.debug(page, 'jumpTo', { stage: 'COLLEGE', phase: 'REG', week: 1, seed: 4242 });
    await page.evaluate(() => RTG.UI.store.dispatch('startUserGame'));
    await H.waitForScreen(page, 'game');
    const before = await H.debug(page, 'getState');
    const outcomes = ['DOINK_IN', 'BLOCKED', 'GOOD'];
    let i = 0, guard = 0;
    while (i < outcomes.length && guard++ < 40) {
      const cur = await page.evaluate(() => RTG.UI.Router.current());
      if (cur === 'game') {
        if (await page.evaluate(() => !RTG.UI.store.state.game)) break;
        await page.locator('button[data-action="next-kick"]').click();
        await page.waitForTimeout(100);
      } else if (cur === 'kick') {
        await K.waitPhase(page, 'SETUP', 6000);
        const ctx = await page.evaluate(() => RTG.UI.store.state.game.pending.ctx);
        const oc = ctx.type === 'PAT' ? 'GOOD' : outcomes[i++];
        if (oc !== 'GOOD' || ctx.type !== 'PAT') { /* count */ }
        const r = await H.debug(page, 'forceKick', { outcome: oc });
        assert.equal(r.outcome, oc);
        await K.waitPhase(page, 'RESULT', 12000);
        assert.match((await page.locator('.kv-banner').textContent()).trim(), oc === 'DOINK_IN' ? /DOINK/ : oc === 'BLOCKED' ? /BLOCKED/ : /GOOD/);
        if (oc === 'BLOCKED') assert.equal(await page.evaluate(() => document.querySelector('.kickview').classList.contains('kv-rush')), true);
        await page.waitForFunction(() => RTG.UI.Router.current() !== 'kick', null, { timeout: 15000 });
      } else break;
    }
    const after = await H.debug(page, 'getState');
    assert.ok(i >= 2, 'at least two FG attempts were forced (' + i + ')');
    assert.ok(after.stats.career.doinks >= before.stats.career.doinks + 1, 'career doinks incremented');
    assert.ok(after.stats.career.doinkIn >= before.stats.career.doinkIn + 1, 'career doinkIn incremented');
    if (i >= 2) assert.ok(after.stats.career.blocked >= before.stats.career.blocked + 1, 'career blocked incremented');
    assert.ok(after.stats.career.fga >= before.stats.career.fga + i, 'fga incremented');
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});
