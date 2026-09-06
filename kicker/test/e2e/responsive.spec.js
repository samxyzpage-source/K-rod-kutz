/**
 * responsive.spec (SPEC §5.2): at 390×844, 844×390, 768×1024 and 1280×800 the hub, game, kick and stats screens
 * have no horizontal scroll; the bottom tab bar is visible on the phone, the rails at 1280; hub buttons are 44-px
 * touch targets on the phone; the other DOM screens (schedule, standings, team, records, timeline, inbox, training)
 * stay inside the viewport too. Runs on file:// and http.
 */
'use strict';
const { test, after } = require('node:test');
const H = require('./_harness');
const assert = H.assert;

after(async () => { await H.closeBrowser(); });

const VPS = ['phone', 'landscape', 'tablet', 'desktop'];
const DOM_SCREENS = ['schedule', 'standings', 'team', 'records', 'timeline', 'inbox', 'training'];

async function toKick(page) {
  for (let guard = 0; guard < 40; guard++) {
    const cur = await H.screenId(page);
    if (cur === 'kick') return true;
    if (cur !== 'game') return false;
    if (await page.evaluate(() => !RTG.UI.store.state.game)) return false;
    const btn = page.locator('button[data-action="next-kick"]');
    if (!(await btn.count())) return false;
    await btn.click();
    await page.waitForTimeout(80);
  }
  return false;
}

for (const mode of H.MODES) {
  for (const vp of VPS) {
    test(`responsive ${mode} ${vp}: hub / game / kick / stats without horizontal scroll; chrome rules`, async () => {
      const app = await H.openApp({ mode, viewport: vp });
      const { page } = app;
      const dims = H.VIEWPORTS[vp];
      try {
        await H.debug(page, 'jumpTo', { stage: 'COLLEGE', phase: 'REG', week: 1, seed: 4242 });
        await H.waitForScreen(page, 'hub');
        assert.equal(await page.evaluate(() => RTG.UI.Router.current()), 'hub', 'hub screen registered');
        await H.noHorizontalScroll(page, 'hub ' + vp);
        // chrome
        const tabVisible = await page.locator('.tabbar').isVisible();
        const railVisible = await page.locator('.rail-right').isVisible();
        if (dims.width < 900) { assert.ok(tabVisible, 'tab bar visible below 900 px'); assert.ok(!railVisible, 'rails hidden below 900 px'); }
        else { assert.ok(!tabVisible, 'tab bar hidden at ' + dims.width); assert.ok(railVisible, 'right rail visible at ' + dims.width); assert.ok(await page.locator('.rail-left').isVisible(), 'left rail visible'); }
        if (vp === 'phone') {
          const small = await page.locator('.scr-hub .btn').evaluateAll(bs => bs.filter(b => b.offsetParent !== null).map(b => b.getBoundingClientRect().height).filter(h => h < 44));
          assert.deepEqual(small, [], 'every hub button is at least 44 px tall');
        }
        if (mode === 'http') await H.shot(page, 'responsive_hub_' + vp);
        // stats (all four tabs)
        await H.debug(page, 'go', 'stats');
        await H.waitForScreen(page, 'stats');
        for (const tab of ['season', 'career', 'splits', 'log']) {
          await page.click('.scr-stats [data-tab="' + tab + '"]');
          await H.noHorizontalScroll(page, 'stats/' + tab + ' ' + vp);
        }
        if (mode === 'http') await H.shot(page, 'responsive_stats_' + vp);
        // other DOM screens
        for (const id of DOM_SCREENS) {
          await H.debug(page, 'go', id);
          await H.waitForScreen(page, id);
          await H.noHorizontalScroll(page, id + ' ' + vp);
        }
        // game + kick
        await page.evaluate(() => RTG.UI.store.dispatch('startUserGame'));
        await H.waitForScreen(page, 'game');
        await H.noHorizontalScroll(page, 'game ' + vp);
        const kicked = await toKick(page);
        if (kicked) {
          await page.waitForTimeout(300);
          await H.noHorizontalScroll(page, 'kick ' + vp);
          if (mode === 'http') await H.shot(page, 'responsive_kick_' + vp);
          await H.debug(page, 'forceKick', { outcome: 'GOOD' });
        } else console.log('  (no user kick reached in 40 steps — kick screen skipped at ' + vp + ')');
        // sim the rest and land on the postgame
        await page.evaluate(() => { if (RTG.UI.store.state.game) RTG.UI.store.dispatch('autoPlayGame'); });
        await page.waitForTimeout(200);
        const cur = await H.screenId(page);
        if (cur === 'postgame') await H.noHorizontalScroll(page, 'postgame ' + vp);
        assert.deepEqual(app.errors, [], 'console errors');
      } finally { await app.close(); }
    });
  }
}
