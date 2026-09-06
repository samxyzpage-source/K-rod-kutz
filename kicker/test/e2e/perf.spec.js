/**
 * perf.spec (SPEC §5.2 / §3.9): 300 game sims through the store (hub re-renders included) → heap growth < 20 MB
 * (CDP Performance.getMetrics JSHeapUsedSize after a forced GC); then a real kick → RTG.debug.perf().frameP95Ms
 * < 20 ms; 500 go('stats') / go('hub') cycles leave perf().listeners (store subscribers + window/document
 * listeners) unchanged; rafActive is false on DOM screens. Runs on file:// and http at 1280×800 (SPEC: desktop CI);
 * the listener / RAF part also runs at 390×844.
 */
'use strict';
const { test, after } = require('node:test');
const H = require('./_harness');
const K = require('./_kickhelpers');
const assert = H.assert;

after(async () => { await H.closeBrowser(); });

/** JS heap in MB after a forced GC (CDP; performance.memory is not reliable in headless runs). */
async function heapMB(cdp) {
  await cdp.send('HeapProfiler.collectGarbage');
  await new Promise(r => setTimeout(r, 150));
  await cdp.send('HeapProfiler.collectGarbage');
  const m = await cdp.send('Performance.getMetrics');
  const used = m.metrics.filter(x => x.name === 'JSHeapUsedSize')[0];
  return used ? used.value / 1048576 : NaN;
}

/** 300 user games through RTG.debug (simGame / simWeek); a new career when one retires. */
function simGames(page, n) {
  return page.evaluate(count => {
    const D = RTG.debug, S = RTG.UI.store;
    let games = 0, guard = 0, careers = 0;
    while (games < count && guard++ < 4000) {
      const s = S.state;
      if (!s || s.stage === 'RETIRED') { careers++; D.newCareer({ seed: 900 + careers, name: 'Perf ' + careers }); D.jumpTo({ stage: 'COLLEGE', phase: 'REG', week: 1 }); continue; }
      if (s.game) { D.simGame(); games++; continue; }
      if (s.pending) { D.settle(); continue; }
      const inSeason = s.phase === 'REG' || s.phase === 'POST';
      if (inSeason && RTG.Season.userGameRef(s) && !s.season.weekGameDone) { D.simGame(); games++; continue; }
      if (inSeason) { D.simWeek(); continue; }
      D.nextPhase();
    }
    return { games, careers };
  }, n);
}

/** Bring the career to a week with an unplayed game and open the game screen. */
async function openGame(page) {
  for (let g = 0; g < 40; g++) {
    const b = await page.evaluate(() => { const s = RTG.UI.store.state; return { inSeason: s.phase === 'REG' || s.phase === 'POST', has: !!RTG.Season.userGameRef(s) && !s.season.weekGameDone, pending: !!s.pending, stage: s.stage, game: !!s.game }; });
    if (b.game) break;
    if (b.pending) { await H.debug(page, 'settle'); continue; }
    if (b.inSeason && b.has) { await page.evaluate(() => RTG.UI.store.dispatch('startUserGame')); break; }
    if (b.inSeason) { await H.debug(page, 'simWeek'); continue; }
    if (b.stage === 'RETIRED') { await H.debug(page, 'newCareer', { seed: 4242, name: 'Perf Kicker' }); }
    await H.debug(page, 'jumpTo', { stage: b.stage === 'NFL' ? 'NFL' : 'COLLEGE', phase: 'REG', week: 1 });
  }
  await H.waitForScreen(page, 'game');
}

/** NEXT KICK ▶ until the kick screen (a user kick) shows, or the game ends. */
async function toKick(page) {
  for (let g = 0; g < 60; g++) {
    const cur = await H.screenId(page);
    if (cur === 'kick') {
      const t = await page.evaluate(() => { const g = RTG.UI.store.state.game; return g && g.pending ? g.pending.type : null; });
      if (t === 'USER_KICK') return true;
      await page.waitForFunction(() => RTG.UI.Router.current() !== 'kick', null, { timeout: 10000 });
      continue;
    }
    if (cur !== 'game' || await page.evaluate(() => !RTG.UI.store.state.game)) return false;
    await page.locator('button[data-action="next-kick"]').click();
    await page.waitForTimeout(50);
  }
  return false;
}

for (const mode of H.MODES) {
  test(`perf ${mode} desktop: 300 game sims → heap growth < 20 MB; kick frame p95 < 20 ms; listeners stable over 500 screen cycles; RAF idle on DOM screens`, async () => {
    const app = await H.openApp({ mode, viewport: 'desktop' });
    const { page } = app;
    try {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Performance.enable');
      await cdp.send('HeapProfiler.enable');
      await H.debug(page, 'newCareer', { seed: 4242, name: 'Perf Kicker', archetype: 'CANNON' });
      await H.debug(page, 'jumpTo', { stage: 'COLLEGE', phase: 'REG', week: 1 });
      await H.waitForScreen(page, 'hub');
      // warm-up (JIT, caches, the first autosave) then the measured run
      await simGames(page, 20);
      const heap0 = await heapMB(cdp);
      const t0 = Date.now();
      const sims = await simGames(page, 300);
      const simMs = Date.now() - t0;
      assert.ok(sims.games >= 300, '300 games simulated (' + sims.games + ')');
      const heap1 = await heapMB(cdp);
      console.log('  perf ' + mode + ': 300 sims in ' + simMs + ' ms · heap ' + heap0.toFixed(1) + ' → ' + heap1.toFixed(1) + ' MB (' + (heap1 - heap0).toFixed(1) + ' MB growth)');
      assert.ok(heap1 - heap0 < 20, 'heap growth < 20 MB after 300 game sims (' + (heap1 - heap0).toFixed(1) + ' MB)');
      assert.ok(simMs < 60000, '300 sims through the store finish within a minute (' + simMs + ' ms)');

      // a real kick: frame cost p95 of the kick scene while it animates
      await openGame(page);
      const reached = await toKick(page);
      assert.ok(reached, 'reached a user kick');
      await K.waitPhase(page, 'SETUP', 8000);
      await H.debug(page, 'perfReset');
      await page.waitForTimeout(700);   // idle scene frames
      const g = await K.geometry(page);
      assert.ok(Number.isInteger(g.scale) && g.scale >= 2, 'desktop scene integer-scaled (' + g.scale + ')');
      await K.mouseFlick(page, { drag: 120, dragMs: 300, flick: 60, flickMs: 80 });
      await K.waitPhase(page, 'RESULT', 12000);
      const perf = await H.debug(page, 'perf');
      console.log('  perf ' + mode + ': kick scene fps ' + perf.fps + ' · frame p95 ' + perf.frameP95Ms + ' ms · frames ' + perf.frames + ' · rafActive ' + perf.rafActive);
      assert.equal(perf.rafActive, true, 'RAF loop runs while the kick scene is mounted');
      assert.ok(perf.frameP95Ms < 20, 'frameP95Ms < 20 ms (' + perf.frameP95Ms + ')');
      assert.ok(perf.frames > 10, 'frames were sampled (' + perf.frames + ')');
      await page.waitForFunction(() => RTG.UI.Router.current() !== 'kick', null, { timeout: 20000 });
      await page.evaluate(() => { const s = RTG.UI.store.state; if (s.game) RTG.UI.store.dispatch('autoPlayGame'); });
      await page.waitForTimeout(150);
      await H.debug(page, 'go', 'hub');
      await H.waitForScreen(page, 'hub');
      await page.waitForTimeout(150);
      const idle = await H.debug(page, 'perf');
      assert.equal(idle.rafActive, false, 'no RAF loop on a DOM screen (outstanding ' + idle.rafOutstanding + ')');

      // 500 stats/hub cycles: listeners return to the baseline
      const before = await H.debug(page, 'perf');
      const heapA = await heapMB(cdp);
      const cyc = Date.now();
      await page.evaluate(() => { const R = RTG.UI.Router; for (let i = 0; i < 500; i++) { R.go('stats'); R.go('hub'); } });
      const cycMs = Date.now() - cyc;
      await H.waitForScreen(page, 'hub');
      const after1 = await H.debug(page, 'perf');
      const heapB = await heapMB(cdp);
      console.log('  perf ' + mode + ': 500 stats/hub cycles in ' + cycMs + ' ms · listeners ' + before.listeners + ' → ' + after1.listeners + ' (store ' + before.storeListeners + ' → ' + after1.storeListeners + ', window ' + before.windowListeners + ' → ' + after1.windowListeners + ') · heap ' + heapA.toFixed(1) + ' → ' + heapB.toFixed(1) + ' MB · tooltips ' + (await page.evaluate(() => RTG.UI.C.tooltipCount ? RTG.UI.C.tooltipCount() : -1)));
      assert.equal(after1.listeners, before.listeners, 'listeners equal before/after 500 go cycles');
      assert.equal(after1.storeListeners, before.storeListeners, 'store subscribers equal');
      assert.equal(after1.rafActive, false, 'RAF idle after the cycles');
      assert.ok(heapB - heapA < 20, 'heap growth < 20 MB over 500 screen cycles (' + (heapB - heapA).toFixed(1) + ' MB)');
      assert.ok(await page.evaluate(() => document.querySelectorAll('.screen-host > .screen').length === 1), 'exactly one live screen in the host');
      assert.deepEqual(app.errors, [], 'console errors');
    } finally { await app.close(); }
  });
}

test('perf file phone: listeners stable over 500 screen cycles; RAF idle on DOM screens; the title loop stops when leaving', async () => {
  const app = await H.openApp({ mode: 'file', viewport: 'phone' });
  const { page } = app;
  try {
    assert.equal(await H.screenId(page), 'title');
    await page.waitForTimeout(200);
    const title = await H.debug(page, 'perf');
    assert.equal(title.rafActive, true, 'the title goalpost strip animates');
    await H.debug(page, 'newCareer', { seed: 77, name: 'Perf Phone' });
    await H.debug(page, 'jumpTo', { stage: 'COLLEGE', phase: 'REG', week: 3 });
    await H.waitForScreen(page, 'hub');
    await page.waitForTimeout(150);
    const before = await H.debug(page, 'perf');
    assert.equal(before.rafActive, false, 'no RAF loop on the hub (title loop cancelled)');
    await page.evaluate(() => { const R = RTG.UI.Router; for (let i = 0; i < 500; i++) { R.go('stats'); R.go('hub'); } });
    await H.waitForScreen(page, 'hub');
    const after1 = await H.debug(page, 'perf');
    assert.equal(after1.listeners, before.listeners, 'listeners equal before/after 500 go cycles (' + before.listeners + ' → ' + after1.listeners + ')');
    assert.equal(after1.rafActive, false);
    for (const id of ['team', 'training', 'schedule', 'standings', 'records', 'timeline', 'inbox', 'saves', 'settings']) {
      await H.debug(page, 'go', id);
      await H.waitForScreen(page, id);
    }
    await H.debug(page, 'go', 'hub');
    await H.waitForScreen(page, 'hub');
    const after2 = await H.debug(page, 'perf');
    assert.equal(after2.listeners, before.listeners, 'listeners equal after a tour of every DOM screen (' + before.listeners + ' → ' + after2.listeners + ')');
    assert.equal(after2.rafActive, false, 'RAF idle after the tour');
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});
