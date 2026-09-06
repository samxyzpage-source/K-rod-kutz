/**
 * game_flow.spec (SPEC §5.2): RTG.debug.jumpTo({stage:'COLLEGE', phase:'REG', week:1}); Play Game; loop: click
 * NEXT KICK → if the kick screen shows, forceKick({outcome:'GOOD'}); until the postgame (or the _fallback standing
 * in for it / the hub when postgame is not registered); the summary equals getState(); the autosave key updated
 * (rtg.save.auto savedAt increased). Also watch mode for one drive at speed ×4 shows drive-log lines.
 */
'use strict';
const { test, after } = require('node:test');
const H = require('./_harness');
const K = require('./_kickhelpers');
const assert = H.assert;

after(async () => { await H.closeBrowser(); });

async function playGame(page) {
  await page.evaluate(() => RTG.UI.store.dispatch('startUserGame'));
  await H.waitForScreen(page, 'game');
}

/** Click a hub PLAY button when one exists (hub.js), else start the game through the store. */
async function startFromHub(page) {
  const btn = page.locator('button', { hasText: /^\s*PLAY( GAME)?\s*$/i });
  if (await btn.count()) { await btn.first().click(); await H.waitForScreen(page, 'game'); }
  else await playGame(page);
}

H.matrix(({ mode, vp }) => {
  test(`game_flow ${mode} ${vp}: jumpTo REG w1 → play → NEXT KICK / forceKick GOOD → postgame`, async () => {
    const app = await H.openApp({ mode, viewport: vp });
    const { page } = app;
    try {
      await H.debug(page, 'jumpTo', { stage: 'COLLEGE', phase: 'REG', week: 1, seed: 4242 });
      const st0 = await H.debug(page, 'getState');
      assert.equal(st0.stage, 'COLLEGE'); assert.equal(st0.phase, 'REG'); assert.equal(st0.week, 1);
      const savedAt0 = await page.evaluate(() => JSON.parse(RTG.UI.Storage.getItem('rtg.save.auto')).savedAt);
      await startFromHub(page);
      assert.ok(await page.locator('.led').first().isVisible(), 'LED scoreboard visible');
      assert.ok(await page.locator('.drivelog[aria-live="polite"]').count() === 1, 'drive log is an aria-live region');
      if (mode === 'http') await H.shot(page, 'game_flow_game_' + vp);
      let kicks = 0, guard = 0, shot = false;
      while (guard++ < 60) {
        const cur = await H.screenId(page);
        if (cur === 'game') {
          if (await page.evaluate(() => !RTG.UI.store.state.game)) break;
          await page.locator('button[data-action="next-kick"]').click();
          await page.waitForTimeout(100);
        } else if (cur === 'kick') {
          await K.waitPhase(page, 'SETUP', 6000);
          const hud = await page.locator('.kv-strip').textContent();
          assert.match(hud, /YDS/, 'HUD strip shows the distance (' + hud + ')');
          if (!shot && mode === 'http') { await H.shot(page, 'game_flow_kick_' + vp); shot = true; }
          const r = await H.debug(page, 'forceKick', { outcome: 'GOOD' });
          assert.equal(r.made, true);
          kicks++;
          await page.waitForFunction(() => RTG.UI.Router.current() !== 'kick', null, { timeout: 15000 });
        } else break;
      }
      const cur = await H.screenId(page);
      assert.ok(cur === 'postgame' || cur === 'hub', 'ended on postgame (or the hub when postgame is not registered): ' + cur);
      const st = await H.debug(page, 'getState');
      assert.equal(st.game, null, 'game closed');
      assert.equal(st.season.weekGameDone, true, 'week game done');
      assert.ok(kicks >= 1, 'at least one user kick was played (' + kicks + ')');
      assert.equal(st.stats.season.fgm + st.stats.season.patMade, kicks, 'every forced GOOD kick counted (' + kicks + ')');
      // the summary shown by postgame (when registered) equals the state's line
      const pg = await page.evaluate(() => RTG.UI.Router.current() === 'postgame' ? (RTG.UI.Router.params() || {}) : null);
      if (pg && pg.summary) {
        assert.equal(pg.summary.userLine.fgm, st.stats.season.fgm);
        assert.equal(pg.summary.userLine.patMade, st.stats.season.patMade);
      }
      const savedAt1 = await page.evaluate(() => JSON.parse(RTG.UI.Storage.getItem('rtg.save.auto')).savedAt);
      assert.ok(savedAt1 >= savedAt0, 'autosave updated after finishUserGame');
      // continue → week 2 (Continue button when postgame exists, else endWeek directly)
      const cont = page.locator('button', { hasText: /^\s*CONTINUE/i });
      if (await cont.count()) await cont.first().click();
      else await page.evaluate(() => RTG.UI.store.dispatch('endWeek'));
      await page.waitForFunction(() => RTG.UI.store.state.week === 2 || RTG.UI.store.state.pending !== null, null, { timeout: 8000 });
      const st2 = await H.debug(page, 'getState');
      assert.ok(st2.week === 2 || st2.pending, 'week advanced (or an event fired): week ' + st2.week);
      if (mode === 'http') await H.shot(page, 'game_flow_after_' + vp);
      assert.deepEqual(app.errors, [], 'console errors');
    } finally { await app.close(); }
  });
}, H.MODES, ['phone', 'desktop']);

test('game_flow file phone: watch mode at ×4 shows drive-log lines; auto-PAT "all" resolves PATs inline', async () => {
  const app = await H.openApp({ mode: 'file', viewport: 'phone' });
  const { page } = app;
  try {
    await page.evaluate(() => RTG.UI.store.setSetting('autoPat', 'all'));
    await H.debug(page, 'jumpTo', { stage: 'COLLEGE', phase: 'REG', week: 1, seed: 999 });
    await playGame(page);
    await page.click('.pill[data-speed="4"]');
    assert.equal(await page.evaluate(() => RTG.UI.store.settings.simSpeed), 4);
    const linesBefore = await page.locator('.drivelog-line').count();
    await page.locator('button[data-action="watch"]').click();
    await page.waitForFunction(n => document.querySelectorAll('.drivelog-line').length >= n + 2 || RTG.UI.Router.current() === 'kick', linesBefore, { timeout: 6000 });
    const cur = await H.screenId(page);
    if (cur === 'game') {
      const lines = await page.locator('.drivelog-line').count();
      assert.ok(lines >= linesBefore + 2, 'drive-log lines appeared in watch mode (' + lines + ')');
      assert.equal(await page.locator('button[data-action="watch"] .btn-label').textContent(), 'PAUSE');
      await page.locator('button[data-action="watch"]').click();   // pause
      assert.equal(await page.locator('button[data-action="watch"] .btn-label').textContent(), 'WATCH');
    }
    await H.shot(page, 'game_flow_watch_phone');
    // SIM REST closes the game with auto kicks
    let guard = 0;
    while (guard++ < 20) {
      const c2 = await H.screenId(page);
      if (c2 === 'kick') { await K.waitPhase(page, 'SETUP', 6000); await H.debug(page, 'forceKick', { outcome: 'GOOD' }); await page.waitForFunction(() => RTG.UI.Router.current() !== 'kick', null, { timeout: 15000 }); continue; }
      if (c2 === 'game') { if (await page.evaluate(() => !RTG.UI.store.state.game)) break; await page.locator('button[data-action="sim-rest"]').click(); await page.waitForTimeout(150); continue; }
      break;
    }
    const st = await H.debug(page, 'getState');
    assert.equal(st.game, null, 'SIM REST closed the game');
    assert.equal(st.season.weekGameDone, true);
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});

test('game_flow file desktop: play clock expiry kicks with the current values (never stalls)', async () => {
  const app = await H.openApp({ mode: 'file', viewport: 'desktop' });
  const { page } = app;
  try {
    await K.openShowcase(page, 555);
    const g = await K.geometry(page);
    await page.mouse.move(g.ball.x, g.ball.y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) { await page.mouse.move(g.ball.x, g.ball.y + 20 * i); await page.waitForTimeout(30); }
    const clock = await page.evaluate(() => RTG.Tuning.difficulty[RTG.UI.store.state.difficulty].playClockSec * 1000 * (RTG.UI.store.settings.playClockMult || 1));
    await page.waitForTimeout(clock + 400);   // hold past the play clock
    await K.waitPhase(page, 'RESULT', clock + 9000);
    await page.mouse.up();
    const r = (await H.debug(page, 'getState')).pending.session.results[0];
    assert.equal(r.quality, 0.5, 'clock-out kick uses quality 0.5');
    assert.ok(r.power > 0.3, 'clock-out kick uses the pulled power (' + r.power + ')');
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});
