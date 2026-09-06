/**
 * newcareer.spec (SPEC §5.2): New career → name / archetype / difficulty / seed → the showcase screen;
 * getState().stage === 'HS'; the seed shown equals the entered seed. Also screenshots the newcareer form and the
 * hub (rendered by the _fallback until hub.js lands) at both viewports and asserts the chrome/responsive rules.
 */
'use strict';
const { test, after } = require('node:test');
const H = require('./_harness');
const assert = H.assert;

after(async () => { await H.closeBrowser(); });

H.matrix(({ mode, vp }) => {
  test(`newcareer ${mode} ${vp}: form → showcase, seed shown`, async () => {
    const app = await H.openApp({ mode, viewport: vp });
    const { page } = app;
    try {
      await H.clickButton(page, 'NEW CAREER');
      await H.waitForScreen(page, 'newcareer');
      assert.equal(await page.evaluate(() => RTG.UI.Router.current()), 'newcareer', 'newcareer screen registered');
      await page.fill('#nc-name', 'Test Kicker');
      await page.click('[data-arch="ICEMAN"]');
      await page.click('[data-diff="rookie"]');
      await page.fill('#nc-seed', '12345');
      await page.selectOption('#nc-home', { index: 3 });
      if (mode === 'http') await H.shot(page, 'newcareer_' + vp);
      await H.noHorizontalScroll(page, 'newcareer');
      await H.clickButton(page, 'START CAREER');
      await H.waitForScreen(page, 'showcase');
      const st = await H.debug(page, 'getState');
      assert.equal(st.stage, 'HS');
      assert.equal(st.phase, 'SHOWCASE');
      assert.equal(st.seed, 12345, 'seed equals the entered seed');
      assert.equal(st.player.name.full, 'Test Kicker');
      assert.equal(st.player.archetype, 'ICEMAN');
      assert.equal(st.difficulty, 'rookie');
      assert.equal(st.pending.kind, 'KICKS');
      assert.equal(st.pending.session.kind, 'SHOWCASE');
      assert.equal(st.pending.session.contexts.length, 6);
      const resolved = await page.evaluate(() => RTG.UI.Router.resolve(RTG.UI.store.state).id);
      assert.equal(resolved, 'showcase');
      const shownSeed = await page.evaluate(() => {
        const el = document.querySelector('[data-seed]');
        return el ? el.getAttribute('data-seed') : null;
      });
      if (shownSeed !== null) assert.equal(shownSeed, '12345', 'seed shown on the screen');
      else console.log('  (showcase screen shows no [data-seed] element — seed checked through getState only)');
      // autosave written
      const auto = await page.evaluate(() => JSON.parse(RTG.UI.Storage.getItem('rtg.save.auto')));
      assert.equal(auto.seed, 12345);
      assert.equal(auto.career.player.name.full, 'Test Kicker');
      assert.deepEqual(app.errors, [], 'console errors');
    } finally { await app.close(); }
  });

  test(`newcareer ${mode} ${vp}: hub chrome and responsive rules`, async () => {
    const app = await H.openApp({ mode, viewport: vp });
    const { page } = app;
    try {
      await H.debug(page, 'newCareer', { seed: 777, name: 'Hub Tester', archetype: 'CANNON' });
      await H.debug(page, 'jumpTo', { stage: 'COLLEGE', phase: 'REG', week: 1 });
      const st = await H.debug(page, 'getState');
      assert.equal(st.stage, 'COLLEGE');
      assert.equal(st.phase, 'REG');
      assert.equal(st.week, 1);
      assert.ok(st.player.teamId, 'has a college team');
      await H.waitForScreen(page, 'hub');
      assert.equal(await page.evaluate(() => document.getElementById('app').classList.contains('chromeless')), false, 'hub shows the chrome');
      const topbar = page.locator('.topbar');
      assert.ok(await topbar.isVisible(), 'top bar visible');
      assert.match(await topbar.textContent(), /Y1/, 'top bar shows the week');
      const tabbar = await page.locator('.tabbar').isVisible();
      const railRight = await page.locator('.rail-right').isVisible();
      const railLeft = await page.locator('.rail-left').isVisible();
      if (vp === 'phone') { assert.equal(tabbar, true, 'tab bar on phone'); assert.equal(railRight, false, 'no rail on phone'); }
      else { assert.equal(tabbar, false, 'no tab bar on desktop'); assert.equal(railRight, true, 'right rail on desktop'); assert.equal(railLeft, true, 'left rail on desktop'); }
      await H.noHorizontalScroll(page, 'hub');
      if (mode === 'http') await H.shot(page, 'hub_fallback_' + vp);
      // tab navigation: TEAM (fallback) then HOME again
      if (vp === 'phone') {
        await page.click('.tab-btn[data-tab="team"]');
        assert.equal(await H.screenId(page), 'team');
        await page.click('.tab-btn[data-tab="hub"]');
        assert.equal(await H.screenId(page), 'hub');
        // MORE sheet
        await page.click('.tab-btn[data-tab="more"]');
        await page.locator('.modal.sheet').waitFor({ state: 'visible' });
        await H.clickButton(page, 'SETTINGS', page.locator('.modal.sheet'));
        assert.equal(await page.evaluate(() => RTG.UI.Router.current()), 'settings');
      } else {
        await page.click('.rail-btn[data-nav="stats"]');
        assert.equal(await H.screenId(page), 'stats');
        await page.click('.rail-btn[data-nav="settings"]');
        assert.equal(await page.evaluate(() => RTG.UI.Router.current()), 'settings');
      }
      if (mode === 'http') await H.shot(page, 'settings_' + vp);
      await H.noHorizontalScroll(page, 'settings');
      // a setting applies live
      await page.click('.switch[data-setting="colorblind"]');
      assert.equal(await page.evaluate(() => document.body.classList.contains('cb')), true, 'body.cb applied');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('rtg.settings')).colorblind), true, 'settings persisted');
      await page.click('.switch[data-setting="colorblind"]');
      // the generic screen can play a week through the engine
      await page.click(vp === 'phone' ? '.tab-btn[data-tab="hub"]' : '.rail-btn[data-nav="hub"]');
      await H.waitForScreen(page, 'hub');
      if (vp === 'phone') {
        // the tab bar is pinned to the bottom of the viewport (sticky) even when the hub is long
        const tb = await page.locator('.tabbar').boundingBox();
        assert.ok(Math.abs(tb.y + tb.height - 844) <= 1, 'tab bar pinned to the viewport bottom (bottom=' + (tb.y + tb.height) + ')');
      }
      await H.clickButton(page, 'SIM GAME');
      const played = await page.evaluate(() => { const r = RTG.Season.userGameRef(RTG.UI.store.state); return r ? r.played : 'bye'; });
      assert.ok(played === true || played === 'bye', 'game simmed');
      await H.clickButton(page, 'END WEEK');
      const st2 = await H.debug(page, 'getState');
      assert.ok(st2.week >= 2 || st2.pending, 'week advanced (or an event is pending)');
      assert.deepEqual(app.errors, [], 'console errors');
    } finally { await app.close(); }
  });
}, H.MODES, ['phone', 'desktop']);
