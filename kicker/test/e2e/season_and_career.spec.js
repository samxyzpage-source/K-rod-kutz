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
      // the senior season: five games of forced makes, opening each one in turn (§2.7.0)
      for (let g = 0; g < 40; g++) {
        const st = await page.evaluate(() => {
          const s = RTG.UI.store.state;
          return { phase: s.phase, open: !!(s.pending && s.pending.kind === 'KICKS') };
        });
        if (st.phase !== 'SEASON') break;
        if (!st.open) { await page.evaluate(() => RTG.UI.store.dispatch('hsStartGame')); continue; }
        await H.debug(page, 'forceKick', { outcome: 'GOOD' });
      }
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
      // QA2-16: every HOF tick label is centred under its own tick (the last one used to be shoved onto INDUCTED)
      const ticks = await page.evaluate(() => [].map.call(document.querySelectorAll('.scr-legacy .hof-tick'), function (t) {
        const r = t.getBoundingClientRect(), l = t.querySelector('.hof-tick-label').getBoundingClientRect();
        return { text: t.textContent, off: Math.round((l.left + l.width / 2) - (r.left + r.width / 2)) };
      }));
      assert.equal(ticks.length, 3, 'three verdict ticks');
      ticks.forEach(t => assert.ok(Math.abs(t.off) <= 2, 'tick label centred on its tick: ' + t.text + ' off by ' + t.off + ' px'));
      // QA1-15: the math table is the pro line only and says so (the career line above is bigger)
      assert.match(await page.locator('.scr-legacy .card', { hasText: 'HALL OF FAME MATH' }).innerText(), /pro kicks only/i);
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

/**
 * The season screens must not lie about what has happened yet (QA1-07 / -10 / -11 / -12 / -13 / -14, QA2-18):
 * no "LONG 0" before a make, a game in progress keeps the week card and offers RESUME GAME, the preseason wears no
 * seed / division chips, skipped offseason steps do not read as done, the wizard preview shows NEXT season's
 * contract year, and the postgame XP rows add up to the total.
 */
H.matrix(({ mode, vp }) => {
  test(`season screens ${mode} ${vp}: no LONG 0, resume card, no preseason seeds, honest stepper / XP rows`, async () => {
    const app = await H.openApp({ mode, viewport: vp });
    const { page } = app;
    const go = async (id, params) => { await page.evaluate(([i, p]) => RTG.UI.Router.go(i, p || {}), [id, params || null]); await H.waitForScreen(page, id); };
    try {
      await H.debug(page, 'newCareer', { seed: 777, name: 'Screen Tester', difficulty: 'rookie' });
      await H.debug(page, 'jumpTo', { stage: 'COLLEGE', phase: 'REG', week: 1 });

      // ── QA1-10: nothing has been kicked yet, so the longest make is '—' everywhere (as in QUICK STATS)
      for (const [id, params] of [['team', null], ['stats', { tab: 'season' }], ['stats', { tab: 'career' }], ['timeline', null], ['records', null]]) {
        await go(id, params);
        const txt = await page.locator('.screen').first().innerText();
        assert.ok(!/LONG\s*(:|·)?\s*0(\D|$)/.test(txt), id + (params ? ' ' + params.tab : '') + ' shows "LONG 0": ' + txt.slice(0, 120));
        assert.ok(!/\b0 yd\b/.test(txt), id + ' shows a 0-yard record');
      }

      // ── QA1-14: the XP rows of the postgame add up to the total (rookie difficulty ×1.25)
      const summary = await page.evaluate(() => JSON.parse(JSON.stringify(RTG.UI.store.dispatch('autoPlayGame'))));
      assert.ok(summary && summary.xp, 'game summary with XP');
      await page.evaluate(s => RTG.UI.Router.go('postgame', { summary: s }), summary);
      await H.waitForScreen(page, 'postgame');
      const xp = await page.evaluate(() => {
        const card = [].filter.call(document.querySelectorAll('.scr-postgame .card'), c => /^XP/.test(c.textContent.trim()))[0];
        const rows = [].map.call(card.querySelectorAll('.list-row .num'), n => Number(n.textContent.replace('−', '-').replace('+', '')));
        return { rows: rows, total: Number(card.querySelector('.pg-xp-total .num').textContent.replace(/[^\d-]/g, '')) };
      });
      assert.ok(xp.rows.length >= 1, 'XP rows listed');
      xp.rows.forEach(v => assert.equal(v, Math.round(v), 'whole-number XP row (' + v + ')'));
      assert.equal(xp.rows.reduce((a, b) => a + b, 0), xp.total, 'XP rows sum to the total: ' + JSON.stringify(xp));

      // ── QA1-07: a game in progress keeps the week card and offers RESUME GAME (never "ELSEWHERE")
      await H.debug(page, 'jumpTo', { stage: 'COLLEGE', phase: 'REG', week: 3 });
      await page.evaluate(() => RTG.UI.store.dispatch('startUserGame'));
      await go('hub');
      const hub = await page.locator('.scr-hub').innerText();
      assert.ok(!/Nothing to do here/i.test(hub), 'no ELSEWHERE card while a game is open');
      assert.match(hub, /GAME IN PROGRESS/, 'the week card shows the live game');
      assert.equal(await page.locator('.scr-hub [data-action="resume-game"]').count(), 1, 'RESUME GAME button');
      assert.equal(await page.locator('.scr-hub [data-action="play"]').count(), 0, 'no second PLAY GAME while one is open');
      assert.equal(await page.locator('.scr-hub [data-action="train"]').count(), 0, 'no training mid-game');
      await page.locator('.scr-hub [data-action="resume-game"]').click();
      await page.waitForTimeout(200);
      assert.ok(['game', 'kick'].indexOf(await H.screenId(page)) >= 0, 'RESUME GAME goes back into the game');
      await page.evaluate(() => RTG.UI.store.dispatch('autoPlayGame'));

      // ── QA1-12 / QA1-13 / QA2-18: the offseason wizard
      await H.debug(page, 'jumpTo', { stage: 'COLLEGE', phase: 'OFF' });
      for (let i = 0; i < 40; i++) {
        const st = await H.debug(page, 'getState');
        if (!st.pending) break;
        if (st.pending.kind === 'DECISION') await page.evaluate(() => { const s = RTG.UI.store, d = s.state.pending.decision; s.dispatch('decide', { kind: d.kind, optionId: RTG.Engine.autoOption(s.state, d) }); });
        else if (st.pending.kind === 'EVENT') await H.debug(page, 'choose', 0);
        else await page.evaluate(() => RTG.UI.store.dispatch('sessionKick', null));
      }
      const off = await H.debug(page, 'getState');
      if (off.phase === 'OFF' && off.flags.offseason && off.flags.offseason.done) {
        await go('offseason');
        const steps = await page.evaluate(() => [].map.call(document.querySelectorAll('.scr-offseason .step'), s => ({ cls: s.className, dot: s.querySelector('.step-dot').textContent })));
        assert.equal(steps.length, off.flags.offseason.steps.length, 'one chip per chain step');
        (off.flags.offseason.skipped || []).forEach(i => {
          assert.match(steps[i].cls, /skipped/, 'step ' + off.flags.offseason.steps[i] + ' never happened but is not marked skipped');
          assert.notEqual(steps[i].dot, '✓', 'a skipped step must not wear a tick');
        });
        assert.ok(steps.some(s => /done/.test(s.cls)), 'the steps that did happen still read as done');
        const strip = await page.evaluate(() => { const s = document.querySelector('.scr-offseason .stepper-scroll'); return { sw: s.scrollWidth, cw: s.clientWidth }; });
        assert.ok(strip.sw <= strip.cw, 'the stepper fits its width instead of being cut off (' + strip.sw + ' > ' + strip.cw + ')');
        // the preview promises next season's contract year: click CONTINUE and check the state agrees
        const shownYear = (await page.locator('.scr-offseason .kv').innerText().catch(() => '')).match(/year (\d+)\/(\d+)/);
        await page.locator('.scr-offseason [data-action="continue"]').click();
        await page.waitForFunction(y => RTG.UI.store.state.year === y, off.year + 1, { timeout: 10000 });
        const ct = (await H.debug(page, 'getState')).player.contract;
        if (shownYear && ct) assert.equal(shownYear[1] + '/' + shownYear[2], (ct.yearIdx + 1) + '/' + ct.years, 'the preview showed the coming season’s contract year');
      }

      // ── QA1-11: an NFL preseason table is all 0-0, so nobody wears a seed / division chip
      const nfl = await H.debug(page, 'jumpTo', { stage: 'NFL', phase: 'PRE' });
      const played = (nfl.season.standings || []).some(r => (r.w + r.l + r.t) > 0);
      assert.equal(played, false, 'the preseason standings are all 0-0 (fixture check)');
      for (const id of ['hub', 'schedule', 'team']) {
        await go(id);
        const txt = await page.locator('.screen').first().innerText();
        assert.ok(!/SEED \d/.test(txt), id + ' wears a stale seed chip in the preseason');
        assert.ok(!/\b\d(st|nd|rd|th) [A-Z][a-z]+\b/.test(txt), id + ' wears a stale division-rank chip in the preseason');
      }
      assert.deepEqual(app.errors, [], 'console errors');
    } finally { await app.close(); }
  });
}, H.MODES, ['phone']);
