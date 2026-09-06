/**
 * qa_shots.js — visual QA driver (not a spec): opens the app at 390×844 (phone) and 1280×800 (desktop), plus
 * 844×390 (landscape) for the kick scene, walks every screen with the RTG.debug API and real clicks, and writes
 * test/e2e/shots/qa_<screen>_<size>.png for a human (or the integrator) to LOOK at.
 *
 *   node kicker/test/e2e/qa_shots.js              # file:// mode, all sizes
 *   node kicker/test/e2e/qa_shots.js --http       # http mode
 *   node kicker/test/e2e/qa_shots.js phone        # one size (phone | desktop | landscape)
 *
 * Exits non-zero when any screen produced a console / page error.
 */
'use strict';
const H = require('./_harness');
const K = require('./_kickhelpers');

const args = process.argv.slice(2);
const mode = args.includes('--http') ? 'http' : 'file';
const only = args.filter(a => !a.startsWith('--'));
const SIZES = ['phone', 'desktop', 'landscape'].filter(s => !only.length || only.includes(s));
const SEED = 4242;

async function shot(page, name, size) { await page.waitForTimeout(120); await H.shot(page, 'qa_' + name + '_' + size); console.log('  shot qa_' + name + '_' + size); }

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

/** Answer pending EVENTs (choice 0 through the modal); decisions and kick sessions are left to walk(). */
async function settle(page) {
  for (let i = 0; i < 6; i++) {
    const b = await page.evaluate(() => { const s = RTG.UI.store.state; return s && s.pending ? s.pending.kind : null; });
    if (b !== 'EVENT') return;
    const m = page.locator('.styled-event [data-action="choice-0"]');
    if (await m.count()) { await m.click(); await page.waitForTimeout(80); continue; }
    await H.debug(page, 'settle', { max: 1 });
  }
}

/** Walk the pending decisions one by one (default option) until `stop(brief)` is true or nothing is left. */
async function walk(page, stop) {
  for (let g = 0; g < 80; g++) {
    const b = await page.evaluate(() => { const s = RTG.UI.store.state, p = s.pending; return { stage: s.stage, phase: s.phase, year: s.year, week: s.week, kind: p ? p.kind : null, dec: p && p.decision ? p.decision.kind : null, sess: p && p.session ? p.session.kind : null }; });
    if (process.env.QA_TRACE) console.log('    walk ' + g + ': ' + b.stage + '.' + b.phase + ' Y' + b.year + ' W' + b.week + (b.kind ? ' [' + b.kind + ':' + (b.dec || b.sess || '') + ']' : ''));
    if (stop(b)) return b;
    if (b.kind === 'EVENT') { await settle(page); continue; }
    if (b.kind) { await H.debug(page, 'settle', { max: 1 }); continue; }
    if (b.stage === 'RETIRED') return b;
    if (b.phase === 'REG' || b.phase === 'POST') { await H.debug(page, 'simWeek'); continue; }
    await H.debug(page, 'nextPhase');
  }
  return null;
}

async function kickScene(page, size) {
  await H.debug(page, 'newCareer', { seed: SEED, name: 'QA Kicker', archetype: 'CANNON' });
  await H.waitForScreen(page, 'showcase');
  await K.waitPhase(page, 'SETUP', 10000);
  await page.waitForTimeout(400);
  await shot(page, 'showcase', size);
  const g = await K.geometry(page);
  console.log('  showcase canvas: scale ' + g.scale + ' · ' + g.rect.w + '×' + g.rect.h + ' css px in ' + g.innerWidth + '×' + g.innerHeight);
  // mid-pull
  await page.mouse.move(g.ball.x, g.ball.y);
  await page.mouse.down();
  await page.mouse.move(g.ball.x, g.ball.y + 90, { steps: 8 });
  await shot(page, 'showcase_pull', size);
  await page.mouse.move(g.ball.x, g.ball.y + 30, { steps: 6 });
  await page.mouse.up();
  await K.waitPhase(page, 'FLIGHT', 8000).catch(() => {});
  await shot(page, 'showcase_flight', size);
  await K.waitPhase(page, 'RESULT', 12000);
  await shot(page, 'showcase_result', size);
  // the range overlay
  await K.waitSetup(page, 1, 15000);
  await page.locator('.kv-range-btn').click();
  await shot(page, 'showcase_range', size);
  await page.locator('.kv-range-btn').click();
  // keyboard meter mode
  await page.evaluate(() => RTG.UI.store.setSetting('inputMode', 'meter'));
  await page.evaluate(() => RTG.UI.Router.go('showcase', {}, { replace: true }));
  await K.waitPhase(page, 'SETUP', 10000);
  await page.keyboard.press('Space');
  await page.waitForTimeout(350);
  await shot(page, 'showcase_meter', size);
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  await shot(page, 'showcase_needle', size);
  await page.keyboard.press('Space');
  await K.waitPhase(page, 'RESULT', 12000);
  await page.evaluate(() => RTG.UI.store.setSetting('inputMode', 'flick'));
}

async function run(size) {
  const vp = size === 'landscape' ? { width: 844, height: 390, hasTouch: true, isMobile: true } : size;
  const app = await H.openApp({ mode, viewport: vp, dpr: size === 'phone' ? 3 : 1 });
  const { page } = app;
  console.log('== ' + size + ' (' + mode + ') ==');
  try {
    if (size === 'landscape') {
      await kickScene(page, size);
      // an in-game kick with the score row
      await H.debug(page, 'jumpTo', { stage: 'COLLEGE', phase: 'REG', week: 1 });
      await page.evaluate(() => RTG.UI.store.dispatch('startUserGame'));
      await H.waitForScreen(page, 'game');
      await shot(page, 'game', size);
      if (await toKick(page)) { await K.waitPhase(page, 'SETUP', 8000); await page.waitForTimeout(300); await shot(page, 'kick', size); await H.debug(page, 'forceKick', { outcome: 'DOINK_IN' }); await K.waitPhase(page, 'RESULT', 12000); await shot(page, 'kick_result', size); }
      await H.debug(page, 'go', 'hub');
      await H.waitForScreen(page, 'hub');
      await shot(page, 'hub', size);
      return app;
    }
    await shot(page, 'title', size);
    await H.clickButton(page, 'NEW CAREER');
    await H.waitForScreen(page, 'newcareer');
    await shot(page, 'newcareer', size);
    await kickScene(page, size);
    // offers
    // the rest of the showcase (kickScene played two kicks for real): force alternating makes / misses until the session ends
    for (let i = 0; i < 8; i++) {
      const left = await page.evaluate(() => { const p = RTG.UI.store.state.pending; return p && p.kind === 'KICKS' ? p.session.contexts.length - p.session.results.length : 0; });
      if (!left) break;
      await K.waitSetup(page, 6 - left, 15000).catch(() => {});
      await H.debug(page, 'forceKick', { outcome: i % 2 ? 'WIDE_R' : 'GOOD' });
      await page.waitForTimeout(150);
    }
    await page.waitForFunction(() => !(RTG.UI.store.state.pending && RTG.UI.store.state.pending.kind === 'KICKS'), null, { timeout: 15000 });
    await page.evaluate(() => RTG.UI.Router.sync());
    await H.waitForScreen(page, 'offers');
    await page.waitForTimeout(200);
    await shot(page, 'offers', size);
    await page.locator('.scr-offers [data-action="compare"]').click();
    await shot(page, 'offers_compare', size);
    await page.locator('.scr-offers [data-action="compare"]').click();
    await page.locator('.carousel-slide.active [data-action^="pick-"]').click();
    await shot(page, 'modal_confirm', size);
    await H.clickButton(page, 'COMMIT', page.locator('.modal'));
    await page.waitForFunction(() => RTG.UI.store.state.stage === 'COLLEGE');
    // camp battle (when offered) else force one through a fixture-free path: skip
    let b = await page.evaluate(() => { const s = RTG.UI.store.state; return s.pending ? s.pending.kind : null; });
    if (b === 'KICKS') { await H.waitForScreen(page, 'campbattle'); await K.waitPhase(page, 'SETUP', 8000); await shot(page, 'campbattle', size); await H.debug(page, 'settle'); }
    await H.waitForScreen(page, 'hub');
    await shot(page, 'hub_pre', size);
    await page.locator('.scr-hub [data-action="start-season"]').click();
    await H.waitForScreen(page, 'hub');
    await page.waitForTimeout(150);
    await shot(page, 'hub', size);
    // MORE sheet (phone) / rails (desktop)
    if (size === 'phone') { await page.click('.tab-btn[data-tab="more"]'); await shot(page, 'more_sheet', size); await page.keyboard.press('Escape'); }
    // training
    await H.debug(page, 'addXp', 300);
    await H.debug(page, 'go', 'training');
    await H.waitForScreen(page, 'training');
    await shot(page, 'training', size);
    await page.locator('.scr-training .focus-tile[data-focus="POW"]').click();
    await shot(page, 'training_after', size);
    // inbox + event modal
    await H.debug(page, 'go', 'inbox');
    await H.waitForScreen(page, 'inbox');
    await page.waitForTimeout(150);
    await shot(page, 'inbox', size);
    await H.debug(page, 'triggerEvent', 'NIL_TRUCK');
    await page.locator('.styled-event').waitFor({ state: 'visible' });
    await shot(page, 'event_modal', size);
    await page.locator('.styled-event [data-action="choice-0"]').click();
    await page.waitForTimeout(150);
    // game + kick
    await H.debug(page, 'go', 'hub');
    await page.locator('.scr-hub [data-action="play"]').click();
    await H.waitForScreen(page, 'game');
    await shot(page, 'game', size);
    if (await toKick(page)) {
      await K.waitPhase(page, 'SETUP', 8000);
      await page.waitForTimeout(300);
      await shot(page, 'kick', size);
      const g = await K.geometry(page);
      console.log('  kick canvas: scale ' + g.scale + ' · ' + g.rect.w + '×' + g.rect.h + ' css px');
      await H.debug(page, 'forceKick', { outcome: 'BLOCKED' });
      await page.waitForTimeout(500);
      await shot(page, 'kick_rush', size);
      await K.waitPhase(page, 'RESULT', 12000);
      await shot(page, 'kick_result', size);
      await page.waitForFunction(() => RTG.UI.Router.current() !== 'kick', null, { timeout: 20000 });
    }
    // watch mode for a couple of drives
    if ((await H.screenId(page)) === 'game') {
      await page.click('.pill[data-speed="4"]');
      await page.locator('button[data-action="watch"]').click();
      await page.waitForTimeout(1500);
      await page.locator('button[data-action="watch"]').click().catch(() => {});
      await shot(page, 'game_watch', size);
    }
    // finish the game: the postgame screen rebuilds its summary from store.lastDispatch (autoPlayGame) when it is opened directly
    await page.evaluate(() => { const S = RTG.UI.store; if (S.state.game) { S.dispatch('autoPlayGame'); RTG.UI.Router.go('postgame', {}, { replace: true }); } });
    await page.waitForTimeout(200);
    await H.waitForScreen(page, 'postgame', 10000).catch(() => {});
    await page.waitForTimeout(400);
    await shot(page, 'postgame', size);
    // browsing screens
    await H.debug(page, 'go', 'schedule'); await H.waitForScreen(page, 'schedule'); await shot(page, 'schedule', size);
    const played = page.locator('.scr-schedule .sched-row[role="button"]').first();
    if (await played.count()) { await played.click(); await shot(page, 'schedule_box', size); await page.keyboard.press('Escape'); }
    await H.debug(page, 'go', 'standings'); await H.waitForScreen(page, 'standings'); await shot(page, 'standings', size);
    const top25 = page.locator('.scr-standings [data-tab="top25"]');
    if (await top25.count()) { await top25.click(); await shot(page, 'standings_top25', size); }
    await H.debug(page, 'go', 'team'); await H.waitForScreen(page, 'team'); await shot(page, 'team', size);
    await H.debug(page, 'go', 'stats'); await H.waitForScreen(page, 'stats'); await shot(page, 'stats', size);
    for (const tab of ['career', 'splits', 'log']) { await page.click('.scr-stats [data-tab="' + tab + '"]'); await shot(page, 'stats_' + tab, size); }
    await H.debug(page, 'go', 'records'); await H.waitForScreen(page, 'records'); await shot(page, 'records', size);
    await H.debug(page, 'go', 'timeline'); await H.waitForScreen(page, 'timeline'); await shot(page, 'timeline', size);
    await H.debug(page, 'go', 'saves'); await H.waitForScreen(page, 'saves'); await page.click('[data-action="save-1"]'); await shot(page, 'saves', size);
    await H.debug(page, 'go', 'settings'); await H.waitForScreen(page, 'settings'); await shot(page, 'settings', size);
    await H.debug(page, 'go', 'practice'); await H.waitForScreen(page, 'practice'); await page.waitForTimeout(400); await shot(page, 'practice', size);
    // end of season: bye card, bracket, awards
    await H.debug(page, 'go', 'hub');
    for (let g = 0; g < 20; g++) {
      const s = await page.evaluate(() => { const st = RTG.UI.store.state; return { phase: st.phase, week: st.week, bye: !RTG.Season.userGameRef(st), pending: !!st.pending }; });
      if (s.phase !== 'REG') break;
      if (s.bye && !s.pending) { await H.waitForScreen(page, 'hub'); await shot(page, 'hub_bye', size); }
      await H.debug(page, 'simWeek');
      await settle(page);
    }
    let s2 = await page.evaluate(() => RTG.UI.store.state.phase);
    if (s2 === 'POST') { await H.waitForScreen(page, 'hub'); await page.waitForTimeout(150); await shot(page, 'hub_post', size); await H.debug(page, 'go', 'standings'); await H.waitForScreen(page, 'standings'); const br = page.locator('.scr-standings [data-tab="bracket"]'); if (await br.count()) { await br.click(); await shot(page, 'standings_bracket', size); } }
    await walk(page, b2 => b2.phase === 'AWARDS');
    await H.waitForScreen(page, 'awards');
    await page.waitForTimeout(1800);
    await shot(page, 'awards', size);
    await page.locator('.scr-awards [data-action="continue"]').click();
    // offseason cards
    await walk(page, b2 => b2.dec === 'BODY_CHECK');
    await H.waitForScreen(page, 'offseason'); await shot(page, 'offseason_body', size);
    await walk(page, b2 => b2.dec === 'TRAINING_BLOCKS');
    await H.waitForScreen(page, 'offseason'); await shot(page, 'offseason_blocks', size);
    await walk(page, b2 => b2.dec === 'DECLARE' || b2.dec === 'TRANSFER' || b2.dec === 'REDSHIRT');
    await H.waitForScreen(page, 'offseason'); await shot(page, 'offseason_decision', size);
    // to the declare card (more seasons on auto). A strong leg from here on, so the draft / pro screens are reachable
    // for this seed (a weak recruit goes undrafted, fails the tryouts and is forced to retire before any of them).
    await H.debug(page, 'setAttrs', { POW: 92, ACC: 90, CON: 88, CLU: 86, KO: 86 });
    const stopAtDeclare = b2 => b2.dec === 'DECLARE' || b2.stage === 'DRAFT' || b2.stage === 'RETIRED';
    let d = await walk(page, stopAtDeclare);
    for (let g = 0; g < 4 && !(d && stopAtDeclare(d)); g++) {
      const st = await page.evaluate(() => ({ stage: RTG.UI.store.state.stage, phase: RTG.UI.store.state.phase }));
      if ((st.stage === 'COLLEGE' || st.stage === 'NFL') && (st.phase === 'PRE' || st.phase === 'REG' || st.phase === 'POST')) await H.debug(page, 'simSeason');
      d = await walk(page, stopAtDeclare);
    }
    if (!d || d.stage === 'RETIRED') throw new Error('qa_shots: the career ended before the draft (' + JSON.stringify(d) + ')');
    if (d.dec === 'DECLARE') {
      await H.waitForScreen(page, 'offseason'); await shot(page, 'offseason_declare', size);
      await page.locator('[data-action="opt-DECLARE"]').click();
    } else console.log('  (senior auto-declared: no declare card for this seed)');
    await walk(page, b2 => b2.dec === 'COMBINE_PLAN' || b2.kind === 'KICKS' || b2.phase === 'DRAFT');
    await H.waitForScreen(page, 'combine');
    await page.waitForTimeout(150);
    await shot(page, 'combine_plan', size);
    if (await page.locator('.plan-option[data-option="SHOW"]').count()) await page.locator('.plan-option[data-option="SHOW"]').click();
    await K.waitPhase(page, 'SETUP', 10000);
    await page.waitForTimeout(300);
    await shot(page, 'combine', size);
    for (let i = 0; i < 4; i++) { await H.debug(page, 'forceKick', { outcome: 'GOOD' }); await page.waitForTimeout(120); }
    await page.waitForTimeout(400);
    await shot(page, 'combine_mid', size);
    await H.debug(page, 'settle');
    await page.waitForFunction(() => RTG.UI.store.state.phase === 'DRAFT' || !!document.querySelector('.combine-done'), null, { timeout: 15000 });
    if (await page.locator('.combine-done').count()) { await shot(page, 'combine_done', size); await H.clickButton(page, 'CONTINUE ▶', page.locator('.combine-done')); }
    await H.waitForScreen(page, 'draft', 15000);
    await shot(page, 'draft_pre', size);
    await page.locator('[data-action="start-draft"]').click();
    await page.waitForTimeout(700);
    await shot(page, 'draft_ticker', size);
    await page.evaluate(() => RTG.UI.store.setSetting('reducedMotion', true));
    await page.evaluate(() => RTG.UI.Router.go('draft', { result: RTG.UI.store.state.flags.draftResult }, { replace: true }));
    await page.waitForTimeout(300);
    await shot(page, 'draft_result', size);
    await page.evaluate(() => RTG.UI.store.setSetting('reducedMotion', false));
    // rookie: UDFA cards / contract, NFL hub
    await walk(page, b2 => b2.dec === 'UDFA' || (b2.stage === 'NFL' && !b2.kind));
    if ((await H.screenId(page)) === 'contract' || (await page.locator('.scr-draft .pro-offer').count())) await shot(page, 'udfa', size);
    await walk(page, b2 => b2.stage === 'NFL' && !b2.kind);
    // the draft screen stays up after the ticker (nothing pending, no dispatch): CONTINUE hands over to the pro hub
    if ((await H.screenId(page)) !== 'hub') {
      const cont = page.locator('.scr-draft [data-action="continue"]');
      if (await cont.count()) await cont.first().click(); else await page.evaluate(() => RTG.UI.Router.sync({ force: true }));
    }
    await H.waitForScreen(page, 'hub');
    await shot(page, 'hub_nfl', size);
    // an NFL contract card: seasons on auto until an EXTENSION / FREE_AGENCY / TAG decision (rookie deal ends)
    let card = null;
    for (let g = 0; g < 8 && !card; g++) {
      const r = await walk(page, b2 => ['EXTENSION', 'FREE_AGENCY', 'TAG', 'CUT_NOTICE', 'RETIRE'].indexOf(b2.dec) >= 0 || b2.stage === 'RETIRED');
      if (r && r.dec) { card = r.dec; break; }
      if (r && r.stage === 'RETIRED') break;
    }
    if (card) { await H.waitForScreen(page, card === 'RETIRE' ? 'offseason' : 'contract'); await shot(page, 'contract_' + card.toLowerCase(), size); if (card === 'EXTENSION') { await page.locator('[data-action="counter"]').click(); await shot(page, 'contract_counter', size); await page.keyboard.press('Escape'); } }
    await H.debug(page, 'go', 'team'); await H.waitForScreen(page, 'team'); await shot(page, 'team_nfl', size);
    await H.debug(page, 'go', 'standings'); await H.waitForScreen(page, 'standings'); await shot(page, 'standings_nfl', size);
    await H.debug(page, 'go', 'records'); await H.waitForScreen(page, 'records'); await shot(page, 'records_nfl', size);
    // legacy
    await H.debug(page, 'simCareer', { untilStage: 'RETIRED' });
    await H.waitForScreen(page, 'legacy');
    await page.waitForTimeout(200);
    await shot(page, 'legacy', size);
    await H.debug(page, 'go', 'timeline'); await H.waitForScreen(page, 'timeline'); await shot(page, 'timeline_full', size);
    await H.debug(page, 'go', 'stats'); await H.waitForScreen(page, 'stats'); await page.click('.scr-stats [data-tab="career"]'); await shot(page, 'stats_career_full', size);
    // colour-blind + high contrast + font scale
    await page.evaluate(() => { RTG.UI.store.setSetting('colorblind', true); RTG.UI.store.setSetting('fontScale', 1.25); });
    await H.debug(page, 'go', 'hub'); await H.waitForScreen(page, 'hub'); await shot(page, 'hub_cb_font125', size);
    await page.evaluate(() => { RTG.UI.store.setSetting('colorblind', false); RTG.UI.store.setSetting('fontScale', 1); RTG.UI.store.setSetting('highContrast', true); });
    await shot(page, 'hub_hc', size);
    await page.evaluate(() => { RTG.UI.store.setSetting('highContrast', false); });
    return app;
  } catch (e) {
    console.error('  !! ' + size + ': ' + (e && e.message || e));
    await H.shot(page, 'qa_FAILED_' + size).catch(() => {});
    app.qaError = e;
    return app;
  }
}

(async () => {
  let bad = 0;
  for (const size of SIZES) {
    const app = await run(size);
    const errs = app.errors.concat(app.foreignErrors);
    if (errs.length) { bad++; console.error('  console/page errors at ' + size + ':\n    ' + errs.join('\n    ')); }
    if (app.qaError) bad++;
    await app.close();
  }
  await H.closeBrowser();
  console.log(bad ? 'qa_shots: ' + bad + ' problem(s)' : 'qa_shots: done, no errors');
  process.exit(bad ? 1 : 0);
})();
