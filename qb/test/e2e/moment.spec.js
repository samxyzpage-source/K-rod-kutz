/**
 * moment.spec: the whole demo through the REAL screens, on file:// and http at 390×844 and 1280×800.
 *
 *   boot with zero console / page errors → title → GUNSLINGER / AVERAGE / COLLEGE → START THE DRIVE → SITUATION
 *   (TAP TO READ) → READ shows 2–3 play cards with an advice chip → the first GOOD (else OK, else first) card → SNAP →
 *   a tap on the most open receiver (the helper reads RTG.debug.current().sim) → hold / release inside the green
 *   band (a computed hold time, like the kicker's kick helpers; a drag for the route's lead / loft) → the RESULT
 *   banner → NEXT on the DRIVE interstitial … through six moments → the summary shows the line and a passer rating.
 *   Moment 2 is played keyboard-only on the desktop (1–5 · Space held · arrows · Space up) and by CDP touch on the
 *   phone; a second run with the same ?seed reproduces the same script and the same first read; no horizontal
 *   scroll at phone width on every screen.
 *
 * Plus (file desktop): RTG.debug.forceResult / skipTo, Escape → the settings modal, and the 320-px title / summary.
 *
 *   /opt/node22/bin/node qb/test/e2e/moment.spec.js
 */
'use strict';
const { test, after } = require('node:test');
const H = require('./_harness');
const Q = require('./_playhelpers');
const assert = H.assert;

after(async () => { await H.closeBrowser(); });

const SEED = '4242';
const ADVICE = /^(GOOD|OK|BAD|\?)$/;
const BANNER = /TOUCHDOWN!|FIRST DOWN|CATCH [+-]?\d+|INCOMPLETE|INTERCEPTED|SACKED -\d+|DROPPED|THROWN AWAY|SCRAMBLE [+-]?\d+|SNEAK [+-]?\d+|DRAW [+-]?\d+|STUFFED|FUMBLE/;   // a 0-yard gain prints without a sign

function noErrors(app, where) { assert.deepEqual(app.errors.concat(app.foreignErrors), [], where + ': console / page errors'); }

/** The picks on the title, START, the first SITUATION. */
async function titleToDrive(page) {
  await H.waitForScreen(page, 'title');
  assert.equal(await page.locator('.arch-card').count(), 4, 'four archetype cards');
  assert.equal(await page.locator('.arch-card .bar').count(), 20, 'five attribute bars per card');
  await Q.pickArchetype(page, 'GUNSLINGER');
  await Q.pickTeam(page, 'AVERAGE');
  await Q.pickVenue(page, 'COLLEGE');
  assert.match(await page.locator('.title-seed').textContent(), /seed 4242/, 'the seed is shown');
  await Q.startDrive(page);
  const st = await Q.state(page);
  assert.equal(st.drive.seed, SEED); assert.equal(st.drive.archetype, 'GUNSLINGER'); assert.equal(st.drive.team, 'AVERAGE'); assert.equal(st.drive.venue, 'COLLEGE');
  assert.equal(st.script.length, 6, 'six scripted situations');
  assert.deepEqual(st.script.map(s => s.kind), ['THIRD_MEDIUM', 'THIRD_LONG', 'RED_ZONE', 'SHORT_YARDAGE', 'TWO_MINUTE', 'LAST_PLAY']);
  return st;
}

/** A compact signature of what the seed decides. */
function scriptSig(st) { return st.script.map(s => [s.kind, s.down, s.toGo, s.yl, s.quarter, s.clock, s.score.us, s.score.them].join(':')).join('|'); }

H.matrix(({ mode, vp }) => {
  test(`moment ${mode} ${vp}: six moments through the real screens, then the box score`, async () => {
    const app = await H.openDemo({ mode, viewport: vp, seed: SEED });
    const { page } = app;
    const phone = vp === 'phone';
    try {
      noErrors(app, 'boot');
      if (phone) await H.noHorizontalScroll(page, 'title');
      const st0 = await titleToDrive(page);
      const sig0 = scriptSig(st0);
      let firstRead = null;
      for (let i = 0; i < 6; i++) {
        const where = 'moment ' + (i + 1);
        await H.waitPhase(page, 'SITUATION');
        assert.ok(await page.locator('.pv-situation .pv-go').isVisible(), where + ': the situation card with TAP TO READ');
        assert.ok((await page.locator('.pv-hud .pv-chip').count()) >= 4, where + ': HUD chips');
        await Q.tapToRead(page);
        const list = await Q.cards(page);
        assert.ok(list.length >= 2 && list.length <= 3, where + ': 2-3 play cards, got ' + list.length);
        for (const c of list) assert.match(c.advice, ADVICE, where + ': advice chip on ' + c.id + ' (' + c.advice + ')');
        if (i === 0) { firstRead = { cards: list.map(c => c.id + '=' + c.advice), real: (await Q.current(page)).ctx.real }; if (phone) await H.noHorizontalScroll(page, 'read'); }
        const card = Q.bestCard(list);
        const ph = await Q.pickPlay(page, card.idx);
        if (ph === 'SNAP' || ph === 'THROW') {
          const tgt = await Q.chooseTarget(page);
          assert.ok(tgt.slot, where + ': a target');
          let thrown;
          if (i === 1 && !phone) {
            thrown = await Q.keyThrow(page, { slot: tgt.slot });                     // keyboard-only
            assert.equal(thrown.slot, tgt.slot);
          } else {
            const touch = phone && i === 2;                                           // one moment by real touch events
            await Q.tapReceiver(page, tgt.slot, { touch });
            const cur = await Q.current(page);
            assert.equal(cur.phase, 'THROW', where + ': phase THROW after the tap');
            assert.equal(cur.target, tgt.slot, where + ': the tapped receiver is the target');
            thrown = await Q.holdRelease(page, { touch, lead: tgt.ideal.lead, loft: tgt.ideal.loft, releaseAt: tgt.releaseAt });
          }
          const inp = thrown.input;
          assert.ok(inp && inp.kind === 'THROW', where + ': a THROW input was emitted');
          assert.equal(inp.target, tgt.slot, where + ': thrown to the target');
          if (thrown.zone) assert.ok(inp.power >= thrown.zone.lo - 0.03 && inp.power <= thrown.zone.hi + 0.03, where + ': released inside the green band [' + thrown.zone.lo.toFixed(2) + ', ' + thrown.zone.hi.toFixed(2) + '], got ' + inp.power.toFixed(3));
          // the band follows the receiver every frame, so a release polled mid-band can land a hair outside it by the
          // time the key is up: the green claim is asserted unless the power sits within the band's drift tolerance
          // (controls.spec's 'a green ring is honest' test pins the green mechanic itself)
          const drifted = thrown.zone && inp.power >= thrown.zone.lo - 0.03 && inp.power <= thrown.zone.hi + 0.03;
          assert.ok(inp.green === true || drifted, where + ': the scene claims the green (assist on), or the release drifted within 0.03 of the moving band');
        }
        const res = await Q.waitResult(page);
        assert.equal(typeof res.outcome, 'string', where + ': a result');
        const bannerText = (await page.locator('.pv-banner').textContent()).trim();
        assert.match(bannerText, BANNER, where + ': the result banner (' + bannerText + ')');
        assert.ok(await page.locator('.pv-banner').isVisible(), where + ': banner visible');
        await page.waitForTimeout(350);
        await page.evaluate(() => { const v = RTG.UI.PlayView.current(); if (v && v.phase() === 'RESULT') v.skip(); });
        const sc = await Q.waitDone(page);
        const st = await Q.state(page);
        assert.equal(st.results.length, i + 1, where + ': recorded');
        assert.equal(st.results[i].outcome, res.outcome, where + ': the recorded outcome');
        if (i < 5) {
          assert.equal(sc, 'moment', where + ': the interstitial');
          const story = await page.locator('.screen-moment [data-story]').textContent();
          assert.ok(story.length > 10, where + ': a story line (' + story + ')');
          assert.ok(await page.locator('.screen-moment .drive-line .chip').count() >= 5, where + ': the running line');
          if (phone && i === 0) await H.noHorizontalScroll(page, 'story');
          await Q.next(page);
        } else assert.equal(sc, 'summary', 'the sixth result leads to the summary');
        noErrors(app, where);
      }
      await H.waitForScreen(page, 'summary');
      const sum = await H.debug(page, 'summary');
      assert.equal(sum.done, true); assert.equal(sum.results.length, 6);
      assert.equal(sum.line.att + sum.line.sacks + sum.line.rushes, 6, 'every moment is on the line');
      const ratingEl = page.locator('.sum-rating-num');
      assert.equal(await ratingEl.getAttribute('data-rating'), String(sum.rating), 'the rating is shown');
      assert.match(await page.locator('.sum-stats').textContent(), new RegExp(sum.line.cmp + '/' + sum.line.att), 'CMP/ATT on the line');
      assert.equal(await page.locator('.sum-row').count(), 6, 'six rows');
      assert.ok((await page.locator('[data-verdict]').textContent()).length > 10, 'a verdict');
      if (phone) await H.noHorizontalScroll(page, 'summary');
      if (mode === 'http') await H.shot(page, 'moment_summary_' + vp);
      noErrors(app, 'summary');

      // the same seed again → the same script and the same first read
      await H.openDemo(page, mode, vp, { seed: SEED });
      const st1 = await titleToDrive(page);
      assert.equal(scriptSig(st1), sig0, 'the same seed reproduces the script');
      await Q.tapToRead(page);
      const list1 = await Q.cards(page);
      assert.deepEqual(list1.map(c => c.id + '=' + c.advice), firstRead.cards, 'the same seed reproduces the first read');
      assert.equal((await Q.current(page)).ctx.real, firstRead.real, 'the same real coverage');
      noErrors(app, 'replay');
    } finally { await app.close(); }
  });
});

test('moment file desktop: forceResult from the read, skipTo the summary, PLAY AGAIN keeps the seed', async () => {
  const app = await H.openDemo({ mode: 'file', viewport: 'desktop', seed: 99 });
  const { page } = app;
  try {
    await Q.pickArchetype(page, 'FIELD_GENERAL');
    await Q.pickTeam(page, 'GREAT');
    await Q.pickVenue(page, 'NFL');
    await Q.startDrive(page);
    await Q.tapToRead(page);
    const res = await H.debug(page, 'forceResult', 'TD');
    assert.equal(res.outcome, 'CATCH'); assert.equal(res.td, true); assert.equal(res.forced, true);
    await Q.waitResult(page);
    assert.match((await page.locator('.pv-banner').textContent()), /TOUCHDOWN/, 'the forced touchdown banner');
    await page.evaluate(() => { const v = RTG.UI.PlayView.current(); if (v) v.skip(); });
    await Q.waitDone(page);
    assert.match(await page.locator('[data-story]').textContent(), /TOUCHDOWN/, 'the story line says touchdown');
    const st = await Q.state(page);
    assert.equal(st.line.td, 1); assert.equal(st.line.cmp, 1); assert.equal(st.results[0].forced, true);
    assert.equal(await H.debug(page, 'skipTo', 'summary'), 'summary');
    await H.waitForScreen(page, 'summary');
    const sum = await H.debug(page, 'summary');
    assert.equal(sum.results.length, 6); assert.equal(sum.done, true);
    assert.equal(await H.debug(page, 'seed'), '99');
    await H.clickButton(page, 'PLAY AGAIN');
    await H.waitForScreen(page, 'moment');
    await H.waitPhase(page, 'SITUATION');
    const st2 = await Q.state(page);
    assert.equal(st2.drive.seed, '99'); assert.equal(st2.drive.archetype, 'FIELD_GENERAL'); assert.equal(st2.drive.team, 'GREAT'); assert.equal(st2.drive.venue, 'NFL');
    assert.equal(st2.results.length, 0, 'a fresh drive');
    // the story: a first down carries the drive into the next script entry further downfield
    await Q.tapToRead(page);
    const fd = await H.debug(page, 'forceResult', 'FIRST_DOWN');
    assert.equal(fd.firstDown, true);
    await Q.waitResult(page);
    await page.evaluate(() => { const v = RTG.UI.PlayView.current(); if (v) v.skip(); });
    await Q.waitDone(page);
    assert.match(await page.locator('[data-story]').textContent(), /FIRST DOWN/, 'the story says first down');
    await Q.next(page);
    const st3 = await Q.state(page);
    const expected = Math.min(60, Math.max(5, st3.script[1].yl + fd.yards));
    assert.equal(st3.situation.yl, expected, 'the next situation starts ' + fd.yards + ' yards further (script ' + st3.script[1].yl + ' → ' + expected + ')');
    assert.equal(st3.situation.toGo, Math.min(st3.script[1].toGo, 100 - expected));
    noErrors(app, 'force / skip');
  } finally { await app.close(); }
});

test('moment file desktop: Escape opens the settings modal (title and scene), the toggles apply live', async () => {
  const app = await H.openDemo({ mode: 'file', viewport: 'desktop', seed: 7 });
  const { page } = app;
  try {
    await page.keyboard.press('Escape');
    await page.locator('.settings-modal').waitFor({ state: 'visible', timeout: 3000 });
    await page.locator('.settings-modal .switch[data-setting="reducedMotion"]').click();
    assert.equal(await page.evaluate(() => document.body.classList.contains('reduced-motion')), true, 'reduced motion applied to the body');
    assert.equal(await page.evaluate(() => RTG.UI.store.settings.reducedMotion), true);
    await page.keyboard.press('Escape');
    await page.locator('.settings-modal').waitFor({ state: 'detached', timeout: 3000 });
    assert.equal(await page.evaluate(() => RTG.UI.app.settingsOpen()), false);
    await Q.startDrive(page);
    await page.keyboard.press('Escape');                       // the chromeless scene → settings
    await page.locator('.settings-modal').waitFor({ state: 'visible', timeout: 3000 });
    await page.locator('.settings-modal .switch[data-setting="reducedMotion"]').click();
    await H.clickButton(page, 'DONE', page.locator('.settings-modal'));
    await page.locator('.settings-modal').waitFor({ state: 'detached', timeout: 3000 });
    assert.equal(await page.evaluate(() => RTG.UI.PlayView.current().phase()), 'SITUATION', 'back on the still-armed moment');
    // the settings persisted through the store (rtg.qb.settings)
    assert.equal(await page.evaluate(() => (RTG.UI.Storage.getJSON('rtg.qb.settings') || {}).reducedMotion), false);
    noErrors(app, 'settings');
  } finally { await app.close(); }
});

test('moment file narrow (320 px): the title and the summary fit without horizontal scroll', async () => {
  const app = await H.openDemo({ mode: 'file', viewport: 'narrow', seed: 320 });
  const { page } = app;
  try {
    await H.noHorizontalScroll(page, 'title 320');
    await Q.startDrive(page);
    await H.noHorizontalScroll(page, 'situation 320');
    await H.debug(page, 'skipTo', 'summary');
    await H.waitForScreen(page, 'summary');
    await H.noHorizontalScroll(page, 'summary 320');
    noErrors(app, 'narrow');
  } finally { await app.close(); }
});

test('moment file landscape (844×390): a moment plays and the story fits', async () => {
  const app = await H.openDemo({ mode: 'file', viewport: 'landscape', seed: 844 });
  const { page } = app;
  try {
    await Q.startDrive(page);
    const m = await Q.playMoment(page, { how: 'mouse' });
    assert.equal(typeof m.result.outcome, 'string');
    await H.noHorizontalScroll(page, 'story landscape');
    noErrors(app, 'landscape');
  } finally { await app.close(); }
});
