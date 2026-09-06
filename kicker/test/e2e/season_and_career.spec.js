/**
 * season_and_career.spec (SPEC §5.2): simSeason ×N (college) until the offseason declare card → DECLARE → combine
 * (the one COMBINE_LADDER session, played with forceKick) → the draft screen shows a pick (ticker + stinger, or the
 * undrafted branch) → contract / hub / camp in the NFL; then simCareer({untilStage:'RETIRED'}) → the legacy screen
 * shows the tier and the HOF score and rtg.records is updated. No console errors throughout (U2's kick-scene errors are
 * reported separately by the harness). Runs on file:// and http at 390×844 and 1280×800.
 */
'use strict';
const { test, after } = require('node:test');
const H = require('./_harness');
const assert = H.assert;

after(async () => { await H.closeBrowser(); });

const SEED = 2024;

/** Walk the offseason chain one pending at a time until a DECLARE decision (or PRE / DRAFT). */
async function walkToDeclare(page) {
  for (let g = 0; g < 60; g++) {
    const st = await H.debug(page, 'getState');
    if (st.pending && st.pending.kind === 'DECISION' && st.pending.decision.kind === 'DECLARE') return true;
    if (st.pending && st.pending.kind === 'DECISION') {
      await page.evaluate(() => { const s = RTG.UI.store, st = s.state, d = st.pending.decision; s.dispatch('decide', { kind: d.kind, optionId: RTG.Engine.autoOption(st, d) }); });
      continue;
    }
    if (st.pending && st.pending.kind === 'EVENT') { await H.debug(page, 'choose', 0); continue; }
    if (st.pending) { await page.evaluate(() => RTG.UI.store.dispatch('sessionKick', null)); continue; }
    if (st.phase === 'PRE' || st.stage === 'DRAFT') return false;
    await H.debug(page, 'nextPhase');
  }
  return false;
}

H.matrix(({ mode, vp }) => {
  test(`season_and_career ${mode} ${vp}: college seasons → declare → combine → draft → NFL → legacy`, async () => {
    const app = await H.openApp({ mode, viewport: vp });
    const { page } = app;
    try {
      await H.debug(page, 'newCareer', { seed: SEED, name: 'Career Tester', archetype: 'SURGEON' });
      for (let i = 0; i < 6; i++) await H.debug(page, 'forceKick', { outcome: 'GOOD' });
      await page.evaluate(() => RTG.UI.Router.sync());
      await H.waitForScreen(page, 'offers');
      assert.ok(await page.locator('.scr-offers .offer-card').count() >= 1, 'offer cards rendered');
      await page.locator('.carousel-slide.active [data-action^="pick-"]').click();
      await H.clickButton(page, 'COMMIT', page.locator('.modal'));
      await page.waitForFunction(() => RTG.UI.store.state.stage === 'COLLEGE');
      await H.debug(page, 'settle');   // camp battle (auto kicks) when the incumbent is close

      // college seasons until the declare card (3 by default; a redshirt year adds one)
      let declared = false;
      for (let season = 0; season < 5 && !declared; season++) {
        const st = await H.debug(page, 'getState');
        if (st.phase === 'PRE') await H.debug(page, 'nextPhase');
        const line = await H.debug(page, 'simSeason');
        assert.ok(line && typeof line.year === 'number', 'simSeason returned a season line');
        declared = await walkToDeclare(page);
      }
      assert.ok(declared, 'the DECLARE decision appeared within 5 college seasons');
      await H.waitForScreen(page, 'offseason');
      assert.ok(await page.locator('.scr-offseason [data-action="opt-DECLARE"]').isVisible(), 'declare card with a DECLARE button');
      assert.ok(await page.locator('.scr-offseason .proj-scale').count() === 1, 'projection scale shown');
      if (mode === 'http') await H.shot(page, 'career_declare_' + vp);
      await page.locator('[data-action="opt-DECLARE"]').click();
      await page.waitForFunction(() => RTG.UI.store.state.stage === 'DRAFT' && RTG.UI.store.state.phase === 'COMBINE');

      // combine: plan (through the engine — the combine screen belongs to U2) + the ladder / accuracy / kickoff session
      let st = await H.debug(page, 'getState');
      if (st.pending && st.pending.kind === 'DECISION') await page.evaluate(() => RTG.UI.store.dispatch('decide', { kind: 'COMBINE_PLAN', optionId: 'SHOW' }));
      let kicks = 0;
      for (let i = 0; i < 20; i++) {
        st = await H.debug(page, 'getState');
        if (!st.pending || st.pending.kind !== 'KICKS') break;
        await H.debug(page, 'forceKick', { outcome: 'GOOD' });
        kicks++;
        await page.waitForTimeout(60);
      }
      assert.ok(kicks >= 6, 'combine session played with forced kicks (' + kicks + ')');
      st = await H.debug(page, 'getState');
      assert.equal(typeof st.flags.combineScore, 'number', 'combine score recorded');
      if (st.stage === 'DRAFT' && st.phase === 'COMBINE') await H.debug(page, 'nextPhase');
      st = await H.debug(page, 'getState');
      assert.equal(st.stage + '.' + st.phase, 'DRAFT.DRAFT');
      await page.evaluate(() => RTG.UI.Router.sync({ force: true }));
      await H.waitForScreen(page, 'draft');
      assert.ok(await page.locator('.scr-draft [data-action="start-draft"]').isVisible(), 'START THE DRAFT button');

      // the draft: ticker → your pick
      await page.locator('[data-action="start-draft"]').click();
      await page.waitForFunction(() => !!(RTG.UI.store.state.flags && RTG.UI.store.state.flags.draftResult), null, { timeout: 10000 });
      const res = await page.evaluate(() => RTG.UI.store.state.flags.draftResult);
      assert.equal(await page.evaluate(() => RTG.UI.Router.current()), 'draft', 'the draft screen replays the ticker');
      if (res.teamId) {
        await page.locator('.scr-draft .pick-row.mine').waitFor({ state: 'visible', timeout: 10000 });
        await page.locator('.scr-draft .stinger').waitFor({ state: 'visible', timeout: 10000 });
        assert.match(await page.locator('.scr-draft .stinger').textContent(), /GOING TO/);
        assert.match(await page.locator('.scr-draft .pick-row.mine').textContent(), /Career Tester/);
      } else {
        await page.locator('.scr-draft .banner-bad').waitFor({ state: 'visible', timeout: 10000 });
      }
      if (mode === 'http') await H.shot(page, 'career_draft_' + vp);
      const cont = page.locator('.scr-draft [data-action="continue"]');
      if (await cont.count()) await cont.click();
      else await page.evaluate(() => RTG.UI.Router.sync({ force: true }));
      await page.waitForTimeout(200);
      const after1 = await H.screenId(page);
      assert.ok(['hub', 'campbattle', 'contract', 'kick', 'combine'].indexOf(after1) >= 0, 'landed on the rookie flow: ' + after1);
      st = await H.debug(page, 'getState');
      assert.ok(st.stage === 'NFL' || st.stage === 'DRAFT', 'stage after the draft: ' + st.stage);

      // the rest of the career on auto → legacy
      await H.debug(page, 'simCareer', { untilStage: 'RETIRED' });
      await H.waitForScreen(page, 'legacy');
      st = await H.debug(page, 'getState');
      assert.equal(st.stage, 'RETIRED');
      const tier = await page.locator('.scr-legacy .bust-tier').textContent();
      assert.ok(tier && tier.trim().length > 0, 'legacy tier shown');
      const hof = await page.locator('.scr-legacy .hof-meter').getAttribute('class');
      assert.ok(hof, 'HOF meter shown');
      const score = await page.evaluate(() => RTG.Awards.hofScore(RTG.UI.store.state).score);
      const shown = await page.locator('.scr-legacy .hof-score').getAttribute('data-hof');
      assert.equal(shown, String(Math.round(score)), 'HOF score on screen equals Awards.hofScore');
      const ack = page.locator('.scr-legacy [data-action="ack"]');
      if (await ack.count()) await ack.click();
      await page.waitForFunction(() => RTG.UI.store.getRecords().careers.length >= 1, null, { timeout: 5000 });
      const recs = await page.evaluate(() => RTG.UI.store.getRecords());
      assert.equal(recs.careers[recs.careers.length - 1].name, 'Career Tester', 'rtg.records updated with this career');
      assert.equal(typeof recs.best.hof.value, 'number');
      if (mode === 'http') await H.shot(page, 'career_legacy_' + vp);
      await H.noHorizontalScroll(page, 'legacy');
      assert.deepEqual(app.errors, [], 'console errors');
    } finally { await app.close(); }
  });
}, H.MODES, ['phone', 'desktop']);
