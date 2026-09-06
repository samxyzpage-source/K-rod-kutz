/**
 * full_career.spec (integrator): one whole career through the REAL screens.
 *
 *   title → NEW CAREER form → showcase (six real mouse flicks) → offers (COMMIT) → college hub (TRAIN, XP "+")
 *   → PLAY GAME → NEXT KICK ▶ / kick screen (a real flick, then RTG.debug.forceKick) → postgame → CONTINUE → event
 *   modals → the first week, one bye and the last REG week played for real (RTG.debug.simWeek for the rest) →
 *   postseason → awards CONTINUE → the offseason wizard (every card through its real button) → simSeason until the
 *   DECLARE card → DECLARE → combine (plan card + the session) → draft ticker (×4) → rookie deal / UDFA cards /
 *   tryout → NFL hub (camp battle when offered) → START SEASON → one NFL game with the keyboard meter on the first
 *   kick → seasons on simSeason with every extension / free-agency / tag / cut / retire card clicked for real →
 *   legacy (TAKE A BOW → rtg.records) → NEW CAREER → back to the title.
 *
 * RTG.Schema.validate runs after every dispatch (RTG.debug.strict) and is asserted at every checkpoint; the run must
 * produce zero console / page errors (shell AND kick-scene files). Runs on file:// and http at 390×844 and 1280×800;
 * after the first game every combination switches to reduced motion (real input, instant flights); two of the four
 * restore the full animation for the NFL game so every animated beat runs at least once per mode.
 */
'use strict';
const { test, after } = require('node:test');
const H = require('./_harness');
const K = require('./_kickhelpers');
const assert = H.assert;

after(async () => { await H.closeBrowser(); });

const SEED = '31337';

// ─────────────────────────── page helpers ───────────────────────────

/** A compact signature of "where the career is" (stage, phase, week, game, pending) — polled to detect a change. */
const SIG_SRC = `(function () {
  var s = RTG.UI.store.state; if (!s) return 'none';
  var p = s.pending;
  return [s.stage, s.phase, s.year, s.week, s.game ? 'G' + (s.game.pending ? s.game.pending.type : '') : '-',
    p ? p.kind + ':' + (p.decision ? p.decision.kind : p.session ? p.session.kind + ':' + p.session.results.length : p.event ? p.event.id : '') : '-'].join('|');
})()`;
const sig = page => page.evaluate(SIG_SRC);
async function waitChange(page, before, timeout) {
  await page.waitForFunction(SIG_SRC + ' !== ' + JSON.stringify(before), null, { timeout: timeout || 12000 });
}

function brief(page) {
  return page.evaluate(() => {
    const s = RTG.UI.store.state;
    if (!s) return null;
    const p = s.pending;
    return {
      stage: s.stage, phase: s.phase, year: s.year, week: s.week, xp: s.player.xp, age: s.player.age, teamId: s.player.teamId, role: s.player.role,
      pending: p ? { kind: p.kind, decision: p.decision ? p.decision.kind : null, session: p.session ? p.session.kind : null, results: p.session ? p.session.results.length : 0, event: p.event ? p.event.id : null } : null,
      game: !!s.game, gamePending: s.game && s.game.pending ? s.game.pending.type : null,
      hasGame: !!RTG.Season.userGameRef(s), gameDone: !!(s.season && s.season.weekGameDone), trainingDone: !!(s.season && s.season.trainingDone),
      regWeeks: RTG.Schedule.weeksFor(s.season && s.season.league ? s.season.league : (s.stage === 'NFL' ? 'NFL' : 'COLLEGE')).reg
    };
  });
}

async function valid(page, where) {
  const v = await page.evaluate(() => { const s = RTG.UI.store.state; return s ? RTG.Schema.validate(s) : { ok: true, errors: [] }; });
  assert.ok(v.ok, where + ': Schema.validate — ' + (v.errors || []).slice(0, 4).join(' | '));
}
function noErrors(app, where) {
  assert.deepEqual(app.errors.concat(app.foreignErrors), [], where + ': console / page errors');
}
async function checkpoint(page, app, where) { await valid(page, where); noErrors(app, where); }

/** Real chrome navigation: the bottom tab bar on the phone, the left rail on the desktop. */
async function nav(page, vp, id) {
  await page.click(vp === 'phone' ? '.tab-btn[data-tab="' + id + '"]' : '.rail-btn[data-nav="' + id + '"]');
  await H.waitForScreen(page, id);
}

async function shotIf(page, on, name) { if (on) await H.shot(page, name); }

/** Answer every pending EVENT through the styled modal (choice 0). */
async function settleEvents(page) {
  for (let i = 0; i < 8; i++) {
    const pending = await page.evaluate(() => { const s = RTG.UI.store.state; return !!(s && s.pending && s.pending.kind === 'EVENT'); });
    if (!pending) return;
    const modal = page.locator('.styled-event');
    if (!(await modal.count())) {
      const open = page.locator('[data-action="open-event"]');
      if (await open.count()) await open.first().click(); else await page.evaluate(() => RTG.UI.Router.sync());
      await modal.waitFor({ state: 'visible', timeout: 5000 });
    }
    const before = await sig(page);
    await modal.locator('[data-action="choice-0"]').click();
    await waitChange(page, before);
    await page.waitForTimeout(60);
  }
}

/** A real flick on the armed kick scene (showcase or the game's kick screen). */
async function realFlick(page) {
  await K.waitPhase(page, 'SETUP', 10000);
  await page.waitForTimeout(120);
  await K.mouseFlick(page, { drag: 120, dragMs: 300, flick: 60, flickMs: 80 });
  await K.waitPhase(page, 'RESULT', 15000);
}

/** The keyboard meter: ► ×2, Space (power), Space (lock), Space (strike). */
async function keyboardKick(page) {
  await K.waitPhase(page, 'SETUP', 10000);
  await page.waitForTimeout(120);
  for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => RTG.UI.KickView.current() && RTG.UI.KickView.current().phase() === 'POWER', null, { timeout: 4000 });
  await page.waitForTimeout(320);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => RTG.UI.KickView.current() && RTG.UI.KickView.current().phase() === 'NEEDLE', null, { timeout: 4000 });
  await page.waitForTimeout(150);
  await page.keyboard.press('Space');
  await K.waitPhase(page, 'RESULT', 15000);
}

/** Drive the open game from the game screen to the postgame: NEXT KICK ▶, the kick screen per user kick. */
async function playOpenGame(page, first) {
  let kicks = 0, guard = 0;
  while (guard++ < 160) {
    const cur = await H.screenId(page);
    if (cur === 'game') {
      const open = await page.evaluate(() => !!RTG.UI.store.state.game);
      if (!open) { await page.waitForTimeout(120); if ((await H.screenId(page)) === 'game') break; continue; }
      await page.locator('button[data-action="next-kick"]').click();
      await page.waitForTimeout(60);
      continue;
    }
    if (cur === 'kick') {
      const pend = await page.evaluate(() => { const g = RTG.UI.store.state.game; return g && g.pending ? g.pending.type : null; });
      if (pend !== 'USER_KICK') { await page.waitForFunction(() => RTG.UI.Router.current() !== 'kick', null, { timeout: 12000 }); continue; }
      const hud = await page.locator('.kv-strip').textContent();
      assert.match(hud, /YDS/, 'HUD strip shows the distance (' + hud + ')');
      if (kicks === 0 && first === 'mouse') await realFlick(page);
      else if (kicks === 0 && first === 'keyboard') await keyboardKick(page);
      else { await K.waitPhase(page, 'SETUP', 10000); const r = await H.debug(page, 'forceKick', { outcome: 'GOOD' }); assert.equal(r.made, true); }
      kicks++;
      await page.waitForFunction(() => RTG.UI.Router.current() !== 'kick', null, { timeout: 25000 });
      continue;
    }
    break;
  }
  return kicks;
}

/**
 * One week through the hub: TRAIN (+ an XP spend) when asked, PLAY GAME → kick(s) → postgame → CONTINUE, or the
 * bye card (REST → END WEEK). Returns the brief taken on the hub before the week was played.
 */
async function playWeekForReal(page, vp, app, o) {
  o = o || {};
  await H.waitForScreen(page, 'hub', 15000);
  let b = await brief(page);
  if (o.train && !b.trainingDone && await page.locator('.scr-hub [data-action="train"]').count()) {
    await page.locator('.scr-hub [data-action="train"]').click();
    await H.waitForScreen(page, 'training');
    await page.locator('.scr-training .focus-tile[data-focus="ACC"]').click();
    await page.waitForFunction(() => RTG.UI.store.state.season.trainingDone, null, { timeout: 5000 });
    assert.ok(await page.locator('.scr-training .focus-tile[data-focus="ACC"].active').count() === 1, 'the trained focus tile lights up');
    // spend XP with the "+" button (top up through the debug API when the showcase left nothing to spend)
    let plus = page.locator('.scr-training [data-action^="spend-"]:not([disabled])');
    if (!(await plus.count())) { await H.debug(page, 'addXp', 400); plus = page.locator('.scr-training [data-action^="spend-"]:not([disabled])'); }
    await plus.first().waitFor({ state: 'visible', timeout: 5000 });
    const xpBefore = (await brief(page)).xp;
    await plus.first().click();
    const xpAfter = (await brief(page)).xp;
    assert.ok(xpAfter < xpBefore, 'XP spent through the + button (' + xpBefore + ' → ' + xpAfter + ')');
    assert.equal(await page.locator('.scr-training .xp-balance').getAttribute('data-xp'), String(xpAfter), 'XP balance re-rendered');
    // UNDO restores the spend, then buy it again
    await page.locator('.scr-training [data-action="undo"]').click();
    await H.waitForScreen(page, 'training');
    assert.equal((await brief(page)).xp, xpBefore, 'UNDO restored the XP');
    await page.locator('.scr-training [data-action^="spend-"]:not([disabled])').first().click();
    assert.ok((await brief(page)).xp < xpBefore, 'spent again after the undo');
    await shotIf(page, o.shots, 'full_training_' + vp);
    await nav(page, vp, 'hub');
  }
  b = await brief(page);
  if (b.hasGame && !b.gameDone) {
    await page.locator('.scr-hub [data-action="play"]').click();
    await H.waitForScreen(page, 'game');
    assert.ok(await page.locator('.game-screen .led').count() === 1, 'LED scoreboard');
    await shotIf(page, o.shots, 'full_game_' + vp);
    const kicks = await playOpenGame(page, o.first || 'force');
    await H.waitForScreen(page, 'postgame', 25000);
    assert.ok(await page.locator('.scr-postgame .pg-board').count() === 1, 'postgame board rendered');
    assert.match(await page.locator('.scr-postgame .pg-result').textContent(), /WIN|LOSS|TIE/);
    const s = await H.debug(page, 'getState');
    assert.equal(s.game, null, 'game closed'); assert.equal(s.season.weekGameDone, true, 'week game done');
    const played = await page.evaluate(() => { const r = RTG.Season.userGameRef(RTG.UI.store.state); return r && r.played; });
    assert.equal(played, true, 'the schedule marks the game played');
    await shotIf(page, o.shots, 'full_postgame_' + vp);
    b.kicks = kicks;
    const before = await sig(page);
    await page.locator('.scr-postgame [data-action="continue"]').click();
    await waitChange(page, before, 15000);
  } else {
    const rest = page.locator('.scr-hub [data-action="rest"]');
    if (await rest.count()) { await rest.click(); await page.waitForFunction(() => RTG.UI.store.state.season.trainingDone, null, { timeout: 5000 }); }
    await shotIf(page, o.shots, 'full_hub_bye_' + vp);
    const before = await sig(page);
    await page.locator('.scr-hub [data-action="end-week"]').click();
    await waitChange(page, before, 15000);
  }
  await page.waitForTimeout(80);
  await settleEvents(page);
  return b;
}

/** Play a pending KICKS session (camp battle / tryout / combine) with forced GOOD kicks, one per armed scene. */
async function forceSession(page, label) {
  let n = 0;
  for (let g = 0; g < 40; g++) {
    const b = await brief(page);
    if (!b.pending || b.pending.kind !== 'KICKS') break;
    const armed = await page.waitForFunction(() => {
      const v = RTG.UI.KickView && RTG.UI.KickView.current();
      const s = RTG.UI.store.state, p = s.pending;
      if (!p || p.kind !== 'KICKS') return 'gone';
      const ko = !!(RTG.UI.KickView && document.querySelector('.ko-bar'));
      return (v && v.phase() === 'SETUP') || ko ? 'ready' : false;
    }, null, { timeout: 15000 }).then(h => h.jsonValue());
    if (armed === 'gone') break;
    await H.debug(page, 'forceKick', { outcome: 'GOOD' });
    n++;
    await page.waitForTimeout(80);
  }
  await page.waitForFunction(() => { const s = RTG.UI.store.state; return !(s.pending && s.pending.kind === 'KICKS'); }, null, { timeout: 15000 });
  assert.ok(n >= 1, label + ': at least one kick played (' + n + ')');
  return n;
}

/** Click the real button of a pending DECISION card. */
async function clickDecision(page, kind, o) {
  const scr = await H.screenId(page);
  const first = async (sel) => { const l = page.locator(sel); if (await l.count()) { await l.first().click(); return true; } return false; };
  const confirmIf = async (label) => { const m = page.locator('.modal'); if (await m.count()) await H.clickButton(page, label, m); };
  switch (kind) {
    case 'DECLARE':
      assert.equal(scr, 'offseason', 'DECLARE card on the offseason screen');
      assert.equal(await page.locator('.scr-offseason .proj-scale').count(), 1, 'projection scale on the declare card');
      if (!(await first(o.declare ? '[data-action="opt-DECLARE"]' : '[data-action="opt-STAY"]'))) assert.ok(await first('[data-action^="opt-"]'));
      return;
    case 'TRANSFER': if (!(await first('[data-action="opt-STAY"]'))) assert.ok(await first('[data-action^="opt-"]')); return;
    case 'REDSHIRT': if (!(await first('[data-action="opt-PLAY"]'))) assert.ok(await first('[data-action^="opt-"]')); return;
    case 'TRAINING_BLOCKS': await page.locator('.scr-offseason .block-tile[data-option]').first().click(); return;
    case 'RETIRE':
      if (!(await first(o.retire ? '[data-action="opt-RETIRE"]' : '[data-action="opt-ONE_MORE_YEAR"]'))) assert.ok(await first('[data-action^="opt-"]'));
      return;
    case 'EXTENSION': {
      assert.equal(scr, 'contract');
      // COUNTER once (the +AAV counter through its modal) — the card comes back as EXTENSION when the offer stands, or
      // free agency follows when it is withdrawn; a second visit (COUNTER disabled) accepts
      const counter = page.locator('.scr-contract [data-action="counter"]:not([disabled])');
      if (!o.countered && await counter.count()) {
        o.countered = true;
        await counter.click();
        await page.locator('.modal').last().waitFor({ state: 'visible', timeout: 5000 });
        await page.locator('.modal').last().locator('.modal-buttons .btn').first().click();
        return;
      }
      assert.ok(await first('[data-action="accept"]'), 'ACCEPT on the extension card');
      return;
    }
    case 'FREE_AGENCY': case 'MIN': case 'UDFA':
      if (await first('[data-action^="sign-"]')) { await confirmIf('SIGN'); return; }
      if (await first('[data-action="wait"]')) return;
      if (await first('[data-action="sit-out"]')) { await confirmIf('SIT OUT'); return; }
      assert.ok(await first('[data-action^="opt-"]'), 'a button on the ' + kind + ' card');
      return;
    default:
      assert.ok((await first('[data-action^="opt-"]')) || (await first('.card-footer .btn-primary')), 'a button for the ' + kind + ' card on ' + scr);
  }
}

/**
 * Walk the offseason chain through the real cards until: 'PRE' (the calendar rolled over), 'kicks' (a session is
 * pending — camp battle / tryout), 'combine', 'draft', or 'legacy'.
 */
async function walkOffseason(page, app, o) {
  o = o || {};
  const seen = [];
  for (let g = 0; g < 80; g++) {
    await settleEvents(page);
    const b = await brief(page);
    if (b.stage === 'RETIRED') return { out: 'legacy', seen };
    if (b.pending && b.pending.kind === 'KICKS') return { out: 'kicks', seen };
    if (b.pending && b.pending.kind === 'DECISION') {
      const kind = b.pending.decision;
      if (kind === 'COMBINE_PLAN') return { out: 'combine', seen };
      if (kind === 'HOF') return { out: 'legacy', seen };
      seen.push(kind);
      const before = await sig(page);
      await clickDecision(page, kind, o);
      await waitChange(page, before, 20000);
      await page.waitForTimeout(60);
      continue;
    }
    if (b.phase === 'AWARDS') {
      await H.waitForScreen(page, 'awards');
      const before = await sig(page);
      await page.locator('.scr-awards [data-action="continue"]').click();
      await waitChange(page, before, 20000);
      continue;
    }
    if (b.phase === 'OFF') {
      await H.waitForScreen(page, 'offseason');
      const before = await sig(page);
      await page.locator('.scr-offseason [data-action="continue"]').click();
      await waitChange(page, before, 20000);
      continue;
    }
    if (b.stage === 'DRAFT') return { out: b.phase === 'DRAFT' ? 'draft' : 'combine', seen };
    if (b.phase === 'PRE') return { out: 'PRE', seen };
    return { out: b.stage + '.' + b.phase, seen };
  }
  throw new Error('walkOffseason made no progress: ' + JSON.stringify(await brief(page)));
}

/** From the college hub: postseason on simWeek, the awards, then every wizard card for real. */
async function finishSeasonForReal(page, vp, app, shots, o) {
  for (let g = 0; g < 12; g++) {
    const b = await brief(page);
    if (b.phase !== 'POST') break;
    await H.waitForScreen(page, 'hub');
    if (g === 0) { assert.ok(await page.locator('.scr-hub .bracket').count() >= 1, 'the POST hub shows the bracket card'); await shotIf(page, shots, 'full_hub_post_' + vp); }
    await H.debug(page, 'simWeek');
    await settleEvents(page);
  }
  const b = await brief(page);
  assert.equal(b.phase, 'AWARDS', 'season ends at AWARDS (' + b.stage + '.' + b.phase + ')');
  await H.waitForScreen(page, 'awards');
  assert.ok(await page.locator('.scr-awards .card').count() >= 2, 'awards cards');
  await shotIf(page, shots, 'full_awards_' + vp);
  return walkOffseason(page, app, o);
}

// ─────────────────────────── the career ───────────────────────────

H.matrix(({ mode, vp }) => {
  const fast = (mode === 'file' && vp === 'desktop') || (mode === 'http' && vp === 'phone');
  const shots = mode === 'http';
  test(`full_career ${mode} ${vp}: title → showcase → college → draft → NFL → legacy → title through the real screens${fast ? '' : ' (full motion for the NFL game)'}`, async () => {
    const app = await H.openApp({ mode, viewport: vp });
    const { page } = app;
    try {
      await page.evaluate(() => { RTG.debug.strict = true; });   // Schema.validate after every dispatch (throws → page error)

      // ── title → NEW CAREER form
      assert.equal(await H.screenId(page), 'title');
      await H.clickButton(page, 'NEW CAREER');
      await H.waitForScreen(page, 'newcareer');
      await page.fill('#nc-name', 'Sam Fullcareer');
      await page.click('[data-arch="CANNON"]');
      await page.click('[data-diff="pro"]');
      await page.fill('#nc-seed', SEED);
      await H.clickButton(page, 'START CAREER');
      await H.waitForScreen(page, 'showcase');
      let b = await brief(page);
      assert.equal(b.stage + '.' + b.phase, 'HS.SHOWCASE');
      assert.equal((await H.debug(page, 'getState')).seed, Number(SEED));
      await checkpoint(page, app, 'new career');

      // ── showcase: six real mouse flicks
      for (let i = 0; i < 6; i++) {
        await K.waitSetup(page, i, 15000);
        await realFlick(page);
        const s = await H.debug(page, 'getState');
        if (s.pending && s.pending.session) {
          assert.equal(s.pending.session.results.length, i + 1, 'kick ' + (i + 1) + ' recorded');
          assert.equal(s.pending.session.results[i].auto, false, 'a real input, not an auto kick');
        }
        if (i === 1) await shotIf(page, shots, 'full_showcase_' + vp);
      }
      await H.waitForScreen(page, 'offers', 15000);
      b = await brief(page);
      assert.equal(b.stage + '.' + b.phase, 'HS.OFFERS');
      await checkpoint(page, app, 'showcase done');

      // ── offers: browse, compare, commit
      assert.ok(await page.locator('.scr-offers .offer-card').count() >= 1, 'offer cards');
      const next = page.locator('.scr-offers [data-action="next"]');
      if (await next.isEnabled()) { await next.click(); await page.locator('.scr-offers [data-action="prev"]').click(); }
      await page.locator('.scr-offers [data-action="compare"]').click();
      assert.ok(await page.locator('.scr-offers .compare-tbl').count() === 1, 'compare table');
      await H.noHorizontalScroll(page, 'offers compare');
      await page.locator('.scr-offers [data-action="compare"]').click();
      await shotIf(page, shots, 'full_offers_' + vp);
      await page.locator('.carousel-slide.active [data-action^="pick-"]').click();
      await H.clickButton(page, 'COMMIT', page.locator('.modal'));
      await page.waitForFunction(() => RTG.UI.store.state.stage === 'COLLEGE', null, { timeout: 10000 });
      await checkpoint(page, app, 'committed');

      // ── preseason: camp battle when the coach wants one, then START SEASON
      b = await brief(page);
      if (b.pending && b.pending.kind === 'KICKS') { await H.waitForScreen(page, 'campbattle'); await forceSession(page, 'college camp battle'); }
      await settleEvents(page);
      await H.waitForScreen(page, 'hub', 15000);
      assert.ok(await page.locator('.scr-hub [data-action="start-season"]').count() === 1, 'PRE card with START SEASON');
      await shotIf(page, shots, 'full_hub_pre_' + vp);
      await page.locator('.scr-hub [data-action="start-season"]').click();
      await page.waitForFunction(() => RTG.UI.store.state.phase === 'REG' && RTG.UI.store.state.week === 1, null, { timeout: 10000 });
      await checkpoint(page, app, 'REG week 1');

      // ── week 1 for real: train + XP, PLAY GAME, a real flick, postgame, CONTINUE
      await shotIf(page, shots, 'full_hub_' + vp);
      const w1 = await playWeekForReal(page, vp, app, { train: true, first: 'mouse', shots });
      assert.ok(w1.hasGame, 'week 1 has a game');
      assert.ok(w1.kicks >= 1, 'the user kicked in week 1 (' + w1.kicks + ')');
      b = await brief(page);
      assert.ok(b.week === 2 || (b.pending && b.pending.kind !== 'EVENT'), 'week advanced to 2 (' + b.week + ')');
      await checkpoint(page, app, 'week 1 done');
      // from here on the flights are instant (real input, instant animation); the "real" combinations restore the full
      // motion for the NFL game below so every animated beat runs at least once per mode
      await page.evaluate(() => { RTG.UI.store.setSetting('reducedMotion', true); RTG.UI.store.setSetting('autoPat', 'safe'); });

      // ── the middle of the season on simWeek; the first bye and the last REG week for real
      let byePlayed = false;
      for (let g = 0; g < 40; g++) {
        b = await brief(page);
        if (b.phase !== 'REG') break;
        if (b.week >= b.regWeeks) { await playWeekForReal(page, vp, app, { first: 'force', shots: false }); continue; }
        if (!b.hasGame && !byePlayed) { byePlayed = true; await playWeekForReal(page, vp, app, { shots }); continue; }
        await H.debug(page, 'simWeek');
        await settleEvents(page);
      }
      b = await brief(page);
      assert.ok(b.phase === 'POST' || b.phase === 'AWARDS', 'regular season over (' + b.stage + '.' + b.phase + ' W' + b.week + ')');
      await checkpoint(page, app, 'regular season over');

      // ── postseason → awards → the wizard, every card for real
      let r = await finishSeasonForReal(page, vp, app, shots, { declare: true });
      assert.ok(r.seen.indexOf('BODY_CHECK') >= 0 && r.seen.indexOf('TRAINING_BLOCKS') >= 0, 'wizard cards clicked: ' + r.seen.join(', '));
      await checkpoint(page, app, 'first offseason');
      await shotIf(page, shots, 'full_offseason_' + vp);

      // ── more college seasons on simSeason until DECLARE
      let seasons = 1;
      while (r.out !== 'combine' && r.out !== 'draft' && seasons < 6) {
        if (r.out === 'kicks') { await forceSession(page, 'camp battle'); await settleEvents(page); r = { out: 'PRE', seen: [] }; }
        b = await brief(page);
        if (b.phase === 'PRE') {
          await H.waitForScreen(page, 'hub', 15000);
          await page.locator('.scr-hub [data-action="start-season"]').click();
          await page.waitForFunction(() => RTG.UI.store.state.phase === 'REG', null, { timeout: 10000 });
        }
        await H.debug(page, 'simSeason');
        seasons++;
        r = await walkOffseason(page, app, { declare: true });
      }
      b = await brief(page);
      assert.equal(b.stage, 'DRAFT', 'declared for the draft after ' + seasons + ' seasons (' + b.stage + '.' + b.phase + ')');
      await checkpoint(page, app, 'declared');

      // ── combine: the plan card, the session, the done card
      await H.waitForScreen(page, 'combine', 15000);
      await page.locator('.session-combine .plan-option[data-option]').first().waitFor({ state: 'visible', timeout: 10000 });
      await shotIf(page, shots, 'full_combine_plan_' + vp);
      await page.locator('.session-combine .plan-option[data-option="SHOW"], .session-combine .plan-option[data-option]').first().click();
      await page.waitForFunction(() => { const p = RTG.UI.store.state.pending; return !!(p && p.kind === 'KICKS'); }, null, { timeout: 10000 });
      const combineKicks = await forceSession(page, 'combine');
      assert.ok(combineKicks >= 6, 'combine session played (' + combineKicks + ' kicks)');
      // the last kick closes the session: the engine moves on to DRAFT.DRAFT and the screen hands over to the draft
      // (the combine's done card only shows when the phase stays at COMBINE)
      await page.waitForFunction(() => RTG.UI.store.state.phase === 'DRAFT' || !!document.querySelector('.combine-done'), null, { timeout: 15000 });
      assert.equal(typeof (await H.debug(page, 'getState')).flags.combineScore, 'number', 'combine score recorded');
      if (await page.locator('.combine-done').count()) await H.clickButton(page, 'CONTINUE ▶', page.locator('.combine-done'));
      await page.waitForFunction(() => RTG.UI.store.state.stage === 'DRAFT' && RTG.UI.store.state.phase === 'DRAFT', null, { timeout: 10000 });
      await checkpoint(page, app, 'combine done');

      // ── the draft: ticker at ×4, the stinger or the undrafted branch
      await H.waitForScreen(page, 'draft', 15000);
      await page.locator('.scr-draft [data-action="start-draft"]').click();
      await page.waitForFunction(() => !!(RTG.UI.store.state.flags && RTG.UI.store.state.flags.draftResult), null, { timeout: 15000 });
      const speed = page.locator('.scr-draft [data-action="speed"]');
      if (await speed.count()) await speed.click();
      const draftRes = await page.evaluate(() => RTG.UI.store.state.flags.draftResult);
      if (draftRes.teamId) {
        await page.locator('.scr-draft .stinger').waitFor({ state: 'visible', timeout: 90000 });
        assert.match(await page.locator('.scr-draft .stinger').textContent(), /GOING TO/);
      } else {
        await page.locator('.scr-draft .banner-bad').waitFor({ state: 'visible', timeout: 90000 });
      }
      await shotIf(page, shots, 'full_draft_' + vp);
      await checkpoint(page, app, 'drafted');
      // rookie contract / camp invites / tryout
      for (let g = 0; g < 12; g++) {
        b = await brief(page);
        if (b.stage === 'NFL' && !b.pending) break;
        if (b.pending && b.pending.kind === 'DECISION') { const before = await sig(page); await clickDecision(page, b.pending.decision, {}); await waitChange(page, before, 20000); continue; }
        if (b.pending && b.pending.kind === 'KICKS') { await forceSession(page, b.pending.session); continue; }
        if (b.pending && b.pending.kind === 'EVENT') { await settleEvents(page); continue; }
        const cont = page.locator('.scr-draft [data-action="continue"]');
        if (await cont.count()) { const before = await sig(page); await cont.click(); await page.waitForTimeout(150); if ((await sig(page)) === before) await page.evaluate(() => RTG.UI.Router.sync({ force: true })); continue; }
        await page.evaluate(() => RTG.UI.Router.sync({ force: true }));
        await page.waitForTimeout(100);
      }
      b = await brief(page);
      assert.equal(b.stage, 'NFL', 'in the NFL (' + b.stage + '.' + b.phase + ')');
      assert.ok(b.teamId, 'has a pro team');
      await checkpoint(page, app, 'rookie');

      // ── NFL preseason: camp battle when offered, START SEASON, one game with the keyboard meter
      if (b.pending && b.pending.kind === 'KICKS') { await H.waitForScreen(page, 'campbattle', 15000); await forceSession(page, 'NFL camp battle'); }
      await settleEvents(page);
      await H.waitForScreen(page, 'hub', 15000);
      await shotIf(page, shots, 'full_hub_nfl_' + vp);
      if (await page.locator('.scr-hub [data-action="start-season"]').count()) {
        await page.locator('.scr-hub [data-action="start-season"]').click();
        await page.waitForFunction(() => RTG.UI.store.state.phase === 'REG', null, { timeout: 10000 });
      }
      await page.evaluate(() => RTG.UI.store.setSetting('inputMode', 'meter'));
      if (!fast) await page.evaluate(() => RTG.UI.store.setSetting('reducedMotion', false));
      let nflWeek = null;
      for (let g = 0; g < 4 && !nflWeek; g++) {
        b = await brief(page);
        if (b.hasGame && !b.gameDone) nflWeek = await playWeekForReal(page, vp, app, { first: 'keyboard', shots });
        else { await H.debug(page, 'simWeek'); await settleEvents(page); }
      }
      assert.ok(nflWeek && nflWeek.hasGame, 'an NFL game was played for real');
      await page.evaluate(() => { RTG.UI.store.setSetting('inputMode', 'flick'); RTG.UI.store.setSetting('reducedMotion', true); });
      await checkpoint(page, app, 'NFL game');

      // ── seasons on simSeason; every contract / retire card for real; retire as soon as it is offered after 3 seasons
      let nflSeasons = 0, cards = [], retired = false;
      for (let s = 0; s < 16 && !retired; s++) {
        b = await brief(page);
        if (b.stage === 'RETIRED') { retired = true; break; }
        if (b.pending && b.pending.kind === 'KICKS') { await forceSession(page, 'session'); await settleEvents(page); }
        b = await brief(page);
        if (b.phase === 'PRE') {
          await H.waitForScreen(page, 'hub', 15000);
          const start = page.locator('.scr-hub [data-action="start-season"]');
          if (await start.count()) { await start.click(); await page.waitForFunction(() => RTG.UI.store.state.phase === 'REG', null, { timeout: 10000 }); }
        }
        b = await brief(page);
        if (b.phase === 'REG' || b.phase === 'POST') { await H.debug(page, 'simSeason'); nflSeasons++; }
        r = await walkOffseason(page, app, { retire: nflSeasons >= 3, declare: true, countered: cards.indexOf('EXTENSION') >= 0 });
        cards = cards.concat(r.seen);
        if (r.out === 'legacy') retired = true;
        if (r.seen.indexOf('EXTENSION') >= 0 || r.seen.indexOf('FREE_AGENCY') >= 0) { const cs = await H.screenId(page); if (shots && cs !== 'legacy') await H.shot(page, 'full_after_contract_' + vp); }
      }
      if (!retired) { await H.debug(page, 'simCareer', { untilStage: 'RETIRED' }); }
      const contractCards = cards.filter(k => ['EXTENSION', 'FREE_AGENCY', 'TAG', 'CUT_NOTICE', 'MIN'].indexOf(k) >= 0);
      assert.ok(contractCards.length >= 1, 'at least one contract card was clicked for real: ' + cards.join(', '));
      await checkpoint(page, app, 'retired after ' + nflSeasons + ' NFL seasons');

      // ── legacy: TAKE A BOW writes rtg.records; NEW CAREER → form → back to the title
      await H.waitForScreen(page, 'legacy', 15000);
      b = await brief(page);
      assert.equal(b.stage, 'RETIRED');
      assert.ok((await page.locator('.scr-legacy .bust-tier').textContent()).trim().length > 0, 'legacy tier');
      const hofShown = await page.locator('.scr-legacy .hof-score').getAttribute('data-hof');
      const hofScore = await page.evaluate(() => Math.round(RTG.Awards.hofScore(RTG.UI.store.state).score));
      assert.equal(hofShown, String(hofScore), 'HOF score on screen equals Awards.hofScore');
      const ack = page.locator('.scr-legacy [data-action="ack"]');
      if (await ack.count()) { await ack.click(); await page.waitForFunction(() => !RTG.UI.store.state.pending, null, { timeout: 10000 }); }
      await page.waitForFunction(() => RTG.UI.store.getRecords().careers.length >= 1, null, { timeout: 5000 });
      const recs = await page.evaluate(() => RTG.UI.store.getRecords());
      assert.equal(recs.careers[recs.careers.length - 1].name, 'Sam Fullcareer', 'rtg.records carries this career');
      await shotIf(page, shots, 'full_legacy_' + vp);
      await H.noHorizontalScroll(page, 'legacy');
      await checkpoint(page, app, 'legacy');
      await page.locator('.scr-legacy [data-action="new-career"]').click();
      await H.clickButton(page, 'NEW CAREER', page.locator('.modal'));
      await H.waitForScreen(page, 'newcareer');
      assert.equal(await page.evaluate(() => RTG.UI.store.state), null, 'career cleared');
      await page.locator('.newcareer-screen .back-btn').click();
      await H.waitForScreen(page, 'title');
      assert.ok(await page.locator('.title-screen').isVisible(), 'back on the title');
      assert.ok(await page.locator('.title-summary').count() === 1, 'the title offers CONTINUE for the autosaved career');
      noErrors(app, 'end');
    } catch (e) {
      // where did it stop? (screen, state signature, a screenshot) — printed before the assertion propagates
      try {
        const where = await page.evaluate(() => { const s = RTG.UI.store.state; return { screen: RTG.UI.Router.current(), wanted: RTG.UI.Router.params() && RTG.UI.Router.params().wanted, stage: s && s.stage + '.' + s.phase + ' Y' + s.year + ' W' + s.week, pending: s && s.pending ? s.pending.kind + ':' + (s.pending.decision ? s.pending.decision.kind : s.pending.session ? s.pending.session.kind : s.pending.event ? s.pending.event.id : '') : null, game: !!(s && s.game), modal: !!document.querySelector('.modal'), toast: (document.querySelector('.toast') || {}).textContent || '' }; });
        console.log('  full_career ' + mode + ' ' + vp + ' FAILED at ' + JSON.stringify(where) + '\n  errors: ' + JSON.stringify(app.errors.concat(app.foreignErrors)).slice(0, 600));
        await H.shot(page, 'full_FAILED_' + mode + '_' + vp);
      } catch (e2) { /* ignore */ }
      throw e;
    } finally { await app.close(); }
  });
}, H.MODES, ['phone', 'desktop']);
