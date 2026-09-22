/**
 * punter.spec (SPEC §2.14, §5.2): the punter in the real browser. NEW CAREER with the PUNTER card selected starts a
 * punter career ([data-pos="P"]); the senior-season screen shows a punter's line (punts, net average, inside the 20)
 * and its schedule rows say punts; a senior-season game mounts the scene with a PUNT HUD and a slot per punt, and
 * RTG.debug.forceKick drives every punt grade through the result banner and the slot strip; in the NFL a USER_PUNT
 * reaches the kick screen and resolves on the aim-then-hold meter. Zero console errors throughout. One run keeps the
 * full punt flight; the others cut the motion to stay inside the time budget. The two `todo` tests record what the
 * scene does not do yet for an in-game punt: play the result of a real release (store.js NO_SYNC lacks applyUserPunt,
 * so the dispatch re-routes to the game screen first) and play a forced one (kickview.js onStore listens for
 * applyUserKick / sessionKick only).
 */
'use strict';
const { test, after } = require('node:test');
const H = require('./_harness');
const K = require('./_kickhelpers');
const assert = H.assert;

after(async () => { await H.closeBrowser(); });

const GRADES = ['BLOCKED', 'SHANK', 'TOUCHBACK', 'POOR', 'OK', 'GOOD', 'BOOMING', 'COFFIN'];

/** The banner text the scene prints for a punt grade (Punt.GRADE_TEXT). */
function gradeText(page, grade) { return page.evaluate((g) => RTG.Punt.GRADE_TEXT[g], grade); }

/** What the hsgame slot strip prints for a resolved punt (screens/hsgame.js puntMark). */
function slotMark(r) {
  if (r.blocked) return '✗';
  if (r.touchback) return 'TB';
  if (r.inside20) return '★';
  return String(Math.round(r.net));
}

H.matrix(({ mode, vp }) => {
  test(`punter ${mode} ${vp}: PUNTER card → a punter's senior season, a punted game with every grade on the banner`, async () => {
    const app = await H.openApp({ mode, viewport: vp });
    const { page } = app;
    const fullMotion = mode === 'file' && vp === 'phone';
    try {
      if (!fullMotion) await page.evaluate(() => RTG.UI.store.setSetting('reducedMotion', true));
      // ── the form: the PUNTER card renames the attribute bars and starts a punter career
      await H.clickButton(page, 'NEW CAREER');
      await H.waitForScreen(page, 'newcareer');
      await page.fill('#nc-name', 'Pat Punter');
      assert.equal(await page.locator('.pos-card[data-pos="K"]').getAttribute('aria-checked'), 'true', 'the kicker is the default');
      assert.equal(await page.locator('.arch-grid .bar-label[data-attr="POW"]').first().textContent(), 'POW');
      await page.click('[data-pos="P"]');
      assert.equal(await page.locator('.pos-card[data-pos="P"]').getAttribute('aria-checked'), 'true', 'the punter card is selected');
      assert.equal(await page.locator('.pos-card[data-pos="K"]').getAttribute('aria-checked'), 'false');
      assert.equal(await page.locator('.arch-grid .bar-label[data-attr="POW"]').first().textContent(), 'LEG', 'the bars carry a punter\'s labels');
      assert.equal(await page.locator('.arch-grid .bar-label[data-attr="KO"]').first().textContent(), 'HANG');
      await page.fill('#nc-seed', '4242');
      await H.noHorizontalScroll(page, 'newcareer');
      await H.clickButton(page, 'START CAREER');
      await H.waitForScreen(page, 'hsseason');
      let st = await H.debug(page, 'getState');
      assert.equal(st.player.position, 'P', 'a punter career');
      assert.equal(st.stage, 'HS'); assert.equal(st.phase, 'SEASON');
      assert.equal(st.player.name.full, 'Pat Punter');
      assert.equal(st.flags.hs.position, 'P', 'the senior season is a punter\'s');
      assert.equal(st.pending, null);
      const auto = await page.evaluate(() => JSON.parse(RTG.UI.Storage.getItem('rtg.save.auto')));
      assert.equal(auto.career.player.position, 'P', 'the autosave carries the position');

      // ── the senior-season screen: a punter's line and no field goals
      const labels = await page.locator('.scr-hsseason .hs-tot-cell .small').allTextContents();
      assert.deepEqual(labels, ['PUNTS', 'NET AVERAGE', 'INSIDE THE 20', 'PINNED IT'], 'the totals are a punter\'s');
      const values = await page.locator('.scr-hsseason .hs-tot-cell b').allTextContents();
      assert.deepEqual(values, ['0', '0.0', '0', '0/0'], 'nothing punted yet');
      const card = await page.locator('.scr-hsseason .card').first().innerText();
      assert.match(card, /Every punt is on tape/, 'the copy says punt');
      assert.ok(!/FIELD GOALS|EXTRA POINTS/.test(card), 'and never field goals');
      assert.equal(await page.locator('.hs-sched .hs-grow').count(), 5, 'five schedule rows');
      if (mode === 'http') await H.shot(page, 'punter_hsseason_' + vp);
      await H.noHorizontalScroll(page, 'hsseason');

      // ── the game: the scene mounts on a punt, the HUD reads PUNT with the line of scrimmage, a slot per punt
      await page.locator('button[data-action="play-hs-game"]').click();
      await page.waitForFunction(() => RTG.UI.Router.current() === 'hsgame' && RTG.UI.KickView && RTG.UI.KickView.current() && RTG.UI.KickView.current().phase() === 'SETUP', null, { timeout: 12000 });
      await page.waitForTimeout(150);
      st = await H.debug(page, 'getState');
      const sess = st.pending.session;
      assert.equal(sess.kind, 'HS_GAME'); assert.equal(sess.position, 'P');
      assert.ok(sess.chances.length >= 3 && sess.chances.every((c) => c.type === 'PUNT' && c.losYard >= 1), 'a night of punts');
      const hud = (await page.locator('.kv-strip').textContent()).replace(/\s+/g, ' ');
      assert.match(hud, /PUNT · OWN \d+/, 'HUD reads PUNT with the line of scrimmage (' + hud + ')');
      assert.ok(!/YDS/.test(hud), 'and not a field-goal distance');
      assert.match(hud, new RegExp('OWN ' + sess.chances[0].losYard), 'the HUD spot is the first chance\'s');
      assert.match(hud, /HASH|MIDDLE/, 'the hash is on the strip');
      const slots = page.locator('.hs-header .slot-strip .slot');
      assert.equal(await slots.count(), sess.chances.length, 'one slot per punt');
      const slotLabels = await page.locator('.hs-header .slot-strip .slot .slot-d').allTextContents();
      slotLabels.forEach((t, i) => assert.equal(t, 'OWN ' + sess.chances[i].losYard, 'slot ' + i + ' names the spot'));
      assert.equal(await slots.nth(0).evaluate((el) => el.classList.contains('current')), true, 'the first punt is up');
      if (mode === 'http') await H.shot(page, 'punter_hsgame_' + vp);

      // ── force every grade in turn; the banner and the slot strip follow the result
      let checkedRow = false;
      for (const grade of GRADES) {
        const n = await K.hsArm(page, 15000);                 // opens the next game when this one has run out of punts
        const cur = await page.evaluate(() => { const ss = RTG.UI.store.state.pending.session; return { idx: ss.results.length, total: ss.chances.length }; });
        const idx = cur.idx, lastOfGame = idx === cur.total - 1;
        assert.equal(idx, n);
        const r = await H.debug(page, 'forceKick', { outcome: grade });
        assert.equal(r.type, 'PUNT'); assert.equal(r.forced, true);
        // a coffin corner is only honoured where the leg can reach the 20; elsewhere the engine prints the true grade
        if (grade !== 'COFFIN') assert.equal(r.grade, grade, 'forced ' + grade);
        else assert.ok(GRADES.indexOf(r.grade) >= 0, 'COFFIN from own ' + r.losYard + ' read as ' + r.grade);
        await K.waitPhase(page, 'RESULT', 15000);
        await page.waitForTimeout(80);
        const banner = (await page.locator('.kv-banner').textContent()).trim();
        assert.equal(banner, await gradeText(page, r.grade), 'banner for ' + grade);
        assert.ok(await page.locator('.kv-banner').isVisible(), 'banner visible');
        const kind = await page.evaluate(() => document.querySelector('.kv-banner').className);
        if (r.blocked) assert.match(kind, /kv-banner-blocked/, 'a block is a block');
        else if (r.grade === 'COFFIN') assert.match(kind, /kv-banner-good/, 'a coffin corner is a good punt');
        else assert.match(kind, r.made ? /kv-banner-good/ : /kv-banner-bad/, grade + ' banner kind');
        const fb = await page.locator('.kv-feedback').textContent();
        if (!r.blocked) assert.match(fb, /yd/, grade + ' feedback names the yards (' + fb.trim() + ')');
        if (fullMotion && grade === 'BOOMING' && mode === 'file') await H.shot(page, 'punter_booming_' + vp);
        // the slot updates once the scene hands back (a game's last punt hands back to the season screen instead)
        if (!lastOfGame) {
          await page.waitForFunction((i) => { const s = document.querySelectorAll('.hs-header .slot-strip .slot')[i]; return !!s && (s.classList.contains('made') || s.classList.contains('miss')); }, idx, { timeout: 8000 });
          const slot = page.locator('.hs-header .slot-strip .slot').nth(idx);
          assert.equal(await slot.evaluate((el) => el.classList.contains('made')), r.made, grade + ' slot made/miss');
          assert.equal(await slot.locator('.slot-r').textContent(), slotMark(r), grade + ' slot mark');
          assert.equal(await page.locator('.hs-header .slot-strip .slot').nth(idx + 1).evaluate((el) => el.classList.contains('current')), true, 'the next punt is up');
        }
        // when that was the game's last punt, the season screen shows the row in a punter's words
        const open = await page.evaluate(() => { const s = RTG.UI.store.state; return !!(s.pending && s.pending.kind === 'KICKS'); });
        if (!open && !checkedRow) {
          await H.waitForScreen(page, 'hsseason', 12000);
          const g0 = await page.locator('.hs-sched .hs-grow[data-game="0"]').innerText();
          assert.match(g0, /\d+ punts · [\d.]+ net/, 'the schedule row says punts (' + g0.replace(/\s+/g, ' ') + ')');
          assert.ok(!/FG|XP/.test(g0), 'and not field goals');
          assert.match(g0, /^WK \d+/, 'a played row');
          const tot = await page.locator('.scr-hsseason .hs-tot-cell b').allTextContents();
          assert.ok(Number(tot[0]) >= 3, 'the PUNTS total counts the game (' + tot[0] + ')');
          checkedRow = true;
        }
      }
      assert.ok(checkedRow, 'a game finished during the eight grades and its row was checked');
      st = await H.debug(page, 'getState');
      assert.equal(st.player.position, 'P');
      assert.ok(st.flags.hs.games[0].played && st.flags.hs.games[0].punts >= 3, 'game 1 is on the record');
      assert.ok(st.flags.hs.games[0].kicks.every((k) => k.type === 'PUNT' && typeof k.net === 'number'), 'a punt row per punt');
      const logged = st.flags.hs.games.reduce((n, g) => n + (g.kicks || []).length, 0);
      const openN = st.pending && st.pending.kind === 'KICKS' ? st.pending.session.results.length : 0;
      assert.equal(logged + openN, GRADES.length, 'eight punts in all (' + logged + ' logged + ' + openN + ' open)');
      assert.equal(st.flags.hs.totals.fga + st.flags.hs.totals.xpa, 0, 'no field goals or extra points on a punter\'s tape');
      assert.deepEqual(app.errors, [], 'console errors');
    } finally { await app.close(); }
  });
}, H.MODES, ['phone', 'desktop']);

/**
 * Aim-then-hold on the keyboard: hold Space while the bar fills and let go in the middle of the green band. The
 * fill is linear over Input.CONST.meter.holdMs (quicker under pressure), so the hold is target / powerMax of that.
 * Returns once the release has been handed to the engine (the pending play is gone) or the scene shows the result.
 */
async function meterPunt(page) {
  await K.waitPhase(page, 'SETUP', 8000);
  await page.waitForTimeout(120);
  const ms = await page.evaluate(() => {
    var v = RTG.UI.KickView.current(), m = v.model(), M = RTG.UI.Input.CONST.meter, C = RTG.UI.Input.CONST;
    var ctx = RTG.UI.store.state.game.pending.ctx;
    var fill = ctx.pressure >= M.pressureFast ? M.holdMsPressure : M.holdMs;
    return Math.round((m.pNeed + m.greenBand / 2) / C.powerMax * fill);
  });
  await page.keyboard.down('Space');
  await page.waitForFunction(() => RTG.UI.KickView.current() && RTG.UI.KickView.current().phase() === 'POWER', null, { timeout: 4000 });
  await page.waitForTimeout(ms);
  await page.keyboard.up('Space');
  await page.waitForFunction(() => {
    const g = RTG.UI.store.state.game, v = RTG.UI.KickView.current();
    return !g || !g.pending || (v && v.phase() === 'RESULT');
  }, null, { timeout: 15000 });
  await page.waitForTimeout(80);
}

/** A punter career fast-forwarded to NFL week 1 with the job in hand. */
async function punterInNfl(page) {
  await H.debug(page, 'newCareer', { seed: 7, name: 'Pat Punter', position: 'P' });
  await page.evaluate(() => { RTG.UI.store.setSetting('reducedMotion', true); RTG.UI.store.setSetting('inputMode', 'meter'); });
  await H.debug(page, 'jumpTo', { stage: 'NFL', phase: 'REG', week: 1 });
  const st = await H.debug(page, 'getState');
  assert.equal(st.stage, 'NFL'); assert.equal(st.phase, 'REG'); assert.equal(st.week, 1);
  assert.equal(st.player.position, 'P', 'still a punter in the pros');
  assert.equal(await H.ensureStarter(page), 'K1', 'the punter holds the job');
  return st;
}

/** NEXT KICK ▶ until the kick screen opens on a pending game play; returns its type (or null when the game ended). */
async function nextUserPlay(page) {
  for (let guard = 0; guard < 60; guard++) {
    const cur = await H.screenId(page);
    if (cur === 'kick') return page.evaluate(() => { const g = RTG.UI.store.state.game; return g && g.pending ? g.pending.type : null; });
    if (cur !== 'game' || await page.evaluate(() => !RTG.UI.store.state.game)) return null;
    await page.locator('button[data-action="next-kick"]').click();
    await page.waitForTimeout(100);
  }
  return null;
}

test('punter file desktop: an NFL game hands the punter a USER_PUNT on the kick screen, and the meter resolves it', async () => {
  const app = await H.openApp({ mode: 'file', viewport: 'desktop' });
  const { page } = app;
  try {
    const st0 = await punterInNfl(page);
    assert.equal(st0.stats.career.fga, 0, 'never kicked a field goal on the way');
    assert.ok(st0.stats.career.punts > 0, 'punted through college (' + st0.stats.career.punts + ')');
    const before = await H.debug(page, 'getState');
    await page.evaluate(() => RTG.UI.store.dispatch('startUserGame'));
    await H.waitForScreen(page, 'game');
    assert.ok(await page.locator('.led').first().isVisible(), 'LED scoreboard');
    let punts = 0;
    while (punts < 2) {
      const pend = await nextUserPlay(page);
      if (pend === null) break;
      assert.equal(pend, 'USER_PUNT', 'a punter is only ever handed a punt (' + pend + ')');
      await K.waitPhase(page, 'SETUP', 8000);
      const ctx = await page.evaluate(() => RTG.UI.store.state.game.pending.ctx);
      assert.equal(ctx.type, 'PUNT'); assert.equal(ctx.isUser, true); assert.equal(ctx.league, 'NFL');
      const hud = (await page.locator('.kv-strip').textContent()).replace(/\s+/g, ' ');
      assert.match(hud, new RegExp('PUNT · OWN ' + ctx.losYard), 'HUD reads the punt (' + hud + ')');
      assert.equal(await page.evaluate(() => document.querySelector('.kickview').classList.contains('kv-mode-meter')), true, 'meter mode scene');
      const kicksBefore = await page.evaluate(() => RTG.UI.store.state.stats.kicks.length);
      if (punts === 0) await H.shot(page, 'punter_nfl_kick_desktop');
      await meterPunt(page);
      const st = await H.debug(page, 'getState');
      assert.equal(st.game.pending, null, 'the punt resolved');
      assert.equal(st.stats.kicks.length, kicksBefore + 1, 'one punt row logged');
      const row = st.stats.kicks[st.stats.kicks.length - 1];
      assert.equal(row.type, 'PUNT'); assert.equal(row.league, 'NFL'); assert.equal(row.auto, false, 'a real input, not the AI rule');
      assert.ok(row.input.power > 0, 'the meter set the power (' + row.input.power + ')');
      assert.ok(GRADES.indexOf(row.outcome) >= 0, 'graded (' + row.outcome + ')');
      assert.equal(row.punt.losYard, ctx.losYard, 'punted from the spot the HUD showed');
      punts++;
      await page.waitForFunction(() => RTG.UI.Router.current() !== 'kick', null, { timeout: 15000 });
      if ((await H.screenId(page)) === 'game') {
        // the game screen rebuilds its log from the sim's rows, where the punt reads like every other punt
        const log = await page.locator('.drivelog-line').allTextContents();
        assert.ok(log.some((l) => /\d+-yd punt|PUNT BLOCKED/.test(l)), 'the drive log carries the punt: ' + JSON.stringify(log.slice(-3)));
      }
    }
    assert.ok(punts >= 1, 'at least one punt reached the kick screen (' + punts + ')');
    // the rest of the game on auto, then the books
    await page.evaluate(() => { const s = RTG.UI.store.state; if (s.game) RTG.UI.store.dispatch('autoPlayGame'); });
    const st = await H.debug(page, 'getState');
    assert.equal(st.game, null, 'game closed');
    assert.equal(st.season.weekGameDone, true);
    assert.ok(st.stats.season.punts >= punts, 'the punts are on the season block (' + st.stats.season.punts + ')');
    assert.equal(st.stats.season.fga + st.stats.season.pat, 0, 'no user kicks');
    assert.equal(st.stats.career.punts, before.stats.career.punts + st.stats.season.punts, 'and on the career block');
    assert.ok(st.stats.kicks.slice(-st.stats.season.punts).every((k) => k.type === 'PUNT' && k.league === 'NFL'), 'NFL punt rows in the log');
    assert.ok(!st.season.punterStats[st.player.teamId], 'the user\'s team has no AI punting line');
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});

test('punter file desktop: a real in-game punt plays its result on the scene before the game screen returns',
  { todo: 'store.js NO_SYNC lacks applyUserPunt: the dispatch re-routes to the game screen and destroys the scene before RESULT' }, async () => {
    const app = await H.openApp({ mode: 'file', viewport: 'desktop' });
    const { page } = app;
    try {
      await punterInNfl(page);
      await page.evaluate(() => RTG.UI.store.dispatch('startUserGame'));
      await H.waitForScreen(page, 'game');
      const pend = await nextUserPlay(page);
      assert.equal(pend, 'USER_PUNT');
      await meterPunt(page);
      assert.equal(await page.evaluate(() => RTG.UI.Router.current()), 'kick', 'the scene is still up after the release');
      await K.waitPhase(page, 'RESULT', 4000);
      const row = await page.evaluate(() => { const k = RTG.UI.store.state.stats.kicks; return k[k.length - 1]; });
      assert.equal((await page.locator('.kv-banner').textContent()).trim(), await gradeText(page, row.outcome), 'the banner names the grade');
      assert.match(await page.locator('.kv-feedback').textContent(), row.punt.blocked ? /./ : /yd/, 'the feedback names the yards');
      await page.waitForFunction(() => RTG.UI.Router.current() !== 'kick', null, { timeout: 15000 });
      assert.deepEqual(app.errors, [], 'console errors');
    } finally { await app.close(); }
  });

test('punter file desktop: RTG.debug.forceKick on an in-game punt plays through the scene like a forced kick does',
  { todo: 'kickview.js onStore ignores the applyUserPunt notice, so a forced game punt resolves in the engine but the scene stays in SETUP' }, async () => {
    const app = await H.openApp({ mode: 'file', viewport: 'desktop' });
    const { page } = app;
    try {
      await punterInNfl(page);
      await page.evaluate(() => RTG.UI.store.dispatch('startUserGame'));
      await H.waitForScreen(page, 'game');
      const pend = await nextUserPlay(page);
      assert.equal(pend, 'USER_PUNT');
      await K.waitPhase(page, 'SETUP', 8000);
      const r = await H.debug(page, 'forceKick', { outcome: 'BOOMING' });
      assert.equal(r.grade, 'BOOMING', 'the engine resolved the forced punt');
      assert.equal(await page.evaluate(() => RTG.UI.store.state.game.pending), null, 'and cleared the pending play');
      await K.waitPhase(page, 'RESULT', 4000);
      assert.match((await page.locator('.kv-banner').textContent()).trim(), /BOOMING/, 'the scene shows the forced result');
      await page.waitForFunction(() => RTG.UI.Router.current() !== 'kick', null, { timeout: 8000 });
      assert.deepEqual(app.errors, [], 'console errors');
    } finally { await app.close(); }
  });
