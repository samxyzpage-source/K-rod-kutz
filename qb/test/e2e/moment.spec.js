/**
 * moment.spec (v2 "DRAW THE PASS"): the whole demo through the REAL screens, on file:// and http at 390×844 and
 * 1280×800, every throw and every run DRAWN with real pointer gestures from the quarterback.
 *
 *   boot with zero console / page errors → title → GUNSLINGER / AVERAGE / COLLEGE → START THE DRIVE → six moments:
 *     1 · a BULLET: a fast stroke to the receiver with the best race (the mouse on the desktop, CDP touch on the
 *         phone) — the play runs in slow motion while the finger is down, the draft is a PASS to him, the ball flies
 *     2 · a LOB: a slow stroke (the loft from the draw speed) — the same receiver rule, a lofted ball
 *     3 · desktop: keyboard-only (the slot's number key, L to the touch, Enter) · phone: a BENT line by touch
 *     4 · a drawn ROLLOUT (a RUN line behind the line: the QB runs it), then a pass from where he got to
 *     5 · a drawn SCRAMBLE past the line of scrimmage (a RUN line: the QB crosses → SCRAMBLE, rushing yards)
 *     6 · a THROW-AWAY line out of bounds (THROWN AWAY, never a turnover)
 *   each: the situation card + HUD chips, 2–3 cards with an advice chip, the result banner, the result recorded with
 *   the live's plan (and Play.resolve of that plan replays the same result), the interstitial with the story and the
 *   running line (or the summary after the sixth) → the summary: the line adds up (attempts + sacks + rushes = 6, a
 *   scramble is a rush), the rating, six rows, a verdict. A second run with the same ?seed reproduces the script, the
 *   first read (cards, advice, the real coverage) and the READ picture (ctx.alignment). No horizontal scroll at phone
 *   width on every screen.
 *
 * Plus (file desktop): RTG.debug.forceResult / skipTo, PLAY AGAIN, the first-down story advance; the draw accounting
 * (a hand-played moment and a headless one cost the drive's rng the same 3 draws); Escape → the settings modal (aim
 * assist among the toggles); the 320-px title / summary; the 844×390 landscape moment.
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
const BANNER = /TOUCHDOWN!|FIRST DOWN|CATCH [+-]?\d+|INCOMPLETE|TIPPED|INTERCEPTED|SACKED [+-]?\d+|DROPPED|THROWN AWAY|SCRAMBLE [+-]?\d+|SNEAK [+-]?\d+|DRAW [+-]?\d+|STUFFED|FUMBLE/;   // a 0-yard gain prints without a sign
const PASS_OUTCOMES = ['CATCH', 'INCOMPLETE', 'INT', 'DROP'];

function noErrors(app, where) { assert.deepEqual(app.errors.concat(app.foreignErrors), [], where + ': console / page errors'); }

/** The picks on the title, START, the first SITUATION. */
async function titleToDrive(page) {
  await H.waitForScreen(page, 'title');
  assert.equal(await page.locator('.arch-card').count(), 4, 'four archetype cards');
  assert.equal(await page.locator('.arch-card .bar').count(), 20, 'five attribute bars per card');
  assert.match(await page.locator('.title-blurb').textContent(), /draw/i, 'the blurb says how to play: draw');
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

/** The draft was a PASS to `slot` drawn while the play ran in slow motion, and the ball is out to him. */
function assertPass(where, r, slot, touch) {
  assert.ok(r.drawing, where + ': a draft existed before the release');
  assert.equal(r.drawing.kind, 'PASS', where + ': the line classifies as a PASS (' + JSON.stringify(r.drawing && { kind: r.drawing.kind, target: r.drawing.target, reason: r.drawing.reason }) + ')');
  assert.equal(r.drawing.target, slot, where + ': … to ' + slot);
  if (touch) assert.equal(r.drawing.touch, touch, where + ': the draw speed made a ' + touch + ' (loft ' + r.drawing.loft + ', ' + r.drawing.speedHps + ' heights/s)');
  if (r.mid) {
    assert.ok(r.mid.timeScale !== null && r.mid.timeScale < 1, where + ': slow motion while the finger draws (timeScale ' + r.mid.timeScale + ')');
    assert.equal(r.mid.slow && r.mid.slow.active, '1', where + ': the SLOW-MO chip is up while drawing');
  }
  assert.ok(r.released, where + ': the ball is out');
  assert.equal(r.ball.kind, 'PASS', where + ': a PASS in the air');
  assert.equal(r.ball.target, slot, where + ': thrown to ' + slot);
  if (touch === 'BULLET') assert.ok(r.ball.loft < 1 / 3, where + ': a bullet has a low loft (' + r.ball.loft + ')');
  if (touch === 'LOB') assert.ok(r.ball.loft >= 2 / 3, where + ': a lob has a high loft (' + r.ball.loft + ')');
}

/** Read, check the situation card / HUD / cards, pick the best PASS card → PLAY, wait until a draft may start. */
async function readAndSnap(page, where, i, firstRead, phone) {
  await H.waitPhase(page, 'SITUATION');
  assert.ok(await page.locator('.pv-situation .pv-go').isVisible(), where + ': the situation card with TAP TO READ');
  assert.ok((await page.locator('.pv-hud .pv-chip').count()) >= 4, where + ': HUD chips');
  await Q.tapToRead(page);
  const list = await Q.cards(page);
  assert.ok(list.length >= 2 && list.length <= 3, where + ': 2-3 play cards, got ' + list.length);
  for (const c of list) assert.match(c.advice, ADVICE, where + ': advice chip on ' + c.id + ' (' + c.advice + ')');
  if (i === 0) {
    const cur = await Q.current(page);
    firstRead.cards = list.map(c => c.id + '=' + c.advice);
    firstRead.real = cur.ctx.real;
    firstRead.alignment = JSON.stringify(cur.ctx.alignment || null);
    assert.ok(cur.ctx.alignment && cur.ctx.alignment.defenders && cur.ctx.alignment.defenders.length === 11, where + ': the READ picture is the engine\'s alignment (11 defenders)');
    if (phone) await H.noHorizontalScroll(page, 'read');
  }
  const card = list.find(c => !c.run && c.advice === 'GOOD') || list.find(c => !c.run && c.advice === 'OK') || list.find(c => !c.run);
  const ph = await Q.pickPlay(page, card.idx);
  assert.equal(ph, 'PLAY', where + ': a pass card snaps into the live play (' + card.id + ')');
  await Q.waitCanDraw(page);
  assert.match(await page.locator('.pv-hint').textContent(), /DRAW FROM THE QB — TO A RECEIVER TO PASS, INTO SPACE TO RUN/, where + ': the one-line hint');
  if (i === 0) {
    assert.ok(await page.locator('.pv-toast').isVisible(), where + ': the first moment says how to play over the field');
    assert.match(await page.locator('.pv-toast').textContent(), /DRAW FROM THE QB/, where + ': the first-moment hint');
  }
  return card;
}

H.matrix(({ mode, vp }) => {
  test(`moment ${mode} ${vp}: six drawn moments (bullet, lob, key / bent, rollout + pass, scramble, throw-away) through the real screens, then the box score`, async () => {
    const app = await H.openDemo({ mode, viewport: vp, seed: SEED });
    const { page } = app;
    const phone = vp === 'phone';
    const touch = phone;
    try {
      noErrors(app, 'boot');
      if (phone) await H.noHorizontalScroll(page, 'title');
      const st0 = await titleToDrive(page);
      const sig0 = scriptSig(st0);
      const firstRead = {};
      const expect = [];
      for (let i = 0; i < 6; i++) {
        const where = 'moment ' + (i + 1);
        await readAndSnap(page, where, i, firstRead, phone);
        let res;
        if (i === 0 || i === 1) {
          const slow = i === 1;
          const tgt = await Q.chooseTarget(page, { loft: slow ? 0.9 : 0.1 });
          assert.ok(tgt && tgt.slot, where + ': a receiver can be reached');
          const r = await Q.drawPass(page, tgt.slot, { speed: slow ? 'slow' : 'fast', touch });
          assertPass(where, r, tgt.slot, slow ? 'LOB' : 'BULLET');
          expect.push('PASS');
        } else if (i === 2) {
          const tgt = await Q.chooseTarget(page, { loft: 0.5 });
          assert.ok(tgt && tgt.slot, where + ': a receiver can be reached');
          if (!phone) {
            const r = await Q.keyPass(page, tgt.slot, { touch: 'TOUCH' });           // keyboard-only: the number key, Enter
            assert.equal(r.drawing && r.drawing.source, 'key', where + ': a keyboard draft');
            assertPass(where, r, tgt.slot, 'TOUCH');
          } else {
            const r = await Q.drawPass(page, tgt.slot, { speed: 'fast', touch, bend: 2 });   // a bent line by touch
            assertPass(where, r, tgt.slot);
            const pts = r.drawing.points, a = pts[0], b = pts[pts.length - 1];
            let dev = 0;
            for (const p of pts) dev = Math.max(dev, Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / (Math.hypot(b.x - a.x, b.y - a.y) || 1));
            assert.ok(dev > 0.5, where + ': the drawn line bends (' + dev.toFixed(2) + ' yd off its chord)');
          }
          expect.push('PASS');
        } else if (i === 3) {
          const run = await Q.drawRun(page, 'rollout', { touch });
          assert.equal(run.drawing && run.drawing.kind, 'RUN', where + ': a line into space behind the line is a RUN (' + JSON.stringify(run.drawing && run.drawing.kind) + ')');
          assert.ok(run.ok, where + ': the QB took the run (a RUN event, the plan logs it)');
          await page.waitForFunction(x0 => { const l = RTG.UI.PlayView.current().live(); return !l || !l.qb.hasBall || Math.abs(l.qb.x - x0) >= 2; }, run.qbBefore.x, { timeout: 4000 });
          const lv = await Q.live(page);
          if (lv && lv.qb && lv.qb.hasBall && lv.phase === 'PRE_THROW') {
            assert.ok(Math.abs(lv.qb.x - run.qbBefore.x) >= 2, where + ': the QB rolled out (x ' + run.qbBefore.x + ' → ' + lv.qb.x + ')');
            const tgt = await Q.chooseTarget(page, { loft: 0.3, minT: 0, maxT: Math.min(2.2, lv.t + 0.6) });
            if (tgt && tgt.slot) { const r = await Q.drawPass(page, tgt.slot, { speed: 'fast', touch }); assertPass(where + ' (after the rollout)', r, tgt.slot); expect.push('PASS'); }
            else expect.push('ANY');
          } else expect.push('ANY');                                                  // the rush got home first: a sack is a legal ending
        } else if (i === 4) {
          const run = await Q.drawRun(page, 'scramble', { touch });
          assert.equal(run.drawing && run.drawing.kind, 'RUN', where + ': a line past the line of scrimmage nobody can catch is a RUN');
          assert.ok(run.ok, where + ': the QB took the run');
          assert.ok(run.points[run.points.length - 1].y > 0, where + ': the line ends past the line of scrimmage');
          expect.push('RUN');
        } else {
          const r = await Q.drawThrowAway(page, { touch });
          assert.equal(r.drawing && r.drawing.kind, 'THROWAWAY', where + ': a line out of bounds nobody can reach is a THROW AWAY');
          assert.ok(r.released && r.ball.kind === 'THROWAWAY', where + ': the ball is thrown away');
          expect.push('AWAY');
        }
        res = await Q.waitResult(page);
        assert.equal(typeof res.outcome, 'string', where + ': a result');
        const bannerText = (await page.locator('.pv-banner').textContent()).trim();
        assert.match(bannerText, BANNER, where + ': the result banner (' + bannerText + ')');
        assert.ok(await page.locator('.pv-banner').isVisible(), where + ': banner visible');
        const kind = expect[i];
        if (kind === 'PASS') assert.ok(PASS_OUTCOMES.indexOf(res.outcome) >= 0, where + ': a thrown ball ends in a pass outcome (' + res.outcome + ')');
        if (kind === 'RUN') assert.ok(res.outcome === 'SCRAMBLE' || res.outcome === 'SACK', where + ': a drawn scramble is a SCRAMBLE (or a sack behind the line): ' + res.outcome);
        if (kind === 'AWAY') { assert.equal(res.outcome, 'THROWAWAY', where + ': thrown away'); assert.equal(res.turnover, false); assert.match(bannerText, /THROWN AWAY/); }
        if (res.outcome === 'SCRAMBLE') assert.ok((await Q.current(page)).events.some(e => e.kind === 'SCRAMBLE'), where + ': the live logged the QB crossing the line');
        await Q.skipResult(page);
        const sc = await Q.waitDone(page);
        const st = await Q.state(page);
        assert.equal(st.results.length, i + 1, where + ': recorded');
        const rec = st.results[i];
        assert.equal(rec.outcome, res.outcome, where + ': the recorded outcome');
        assert.ok(rec.plan, where + ': the live\'s plan is in the drive log');
        if (kind === 'PASS') assert.ok(rec.plan.pass && rec.plan.pass.points.length >= 2, where + ': the plan holds the drawn pass');
        if (i === 3 || i === 4) assert.ok(rec.plan.runs.length >= 1, where + ': the plan holds the drawn run');
        if (kind === 'AWAY') assert.ok(rec.plan.away !== null || rec.plan.pass, where + ': the plan holds the throw-away');
        const rp = await H.debug(page, 'replay', i);
        assert.equal(rp.same, true, where + ': Play.resolve(sim, the recorded plan) replays the same result (' + JSON.stringify(rp) + ')');
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
      assert.equal(sum.line.att + sum.line.sacks + sum.line.rushes, 6, 'every moment is on the line (' + JSON.stringify(sum.line) + ')');
      const scrambles = sum.results.filter(r => r.outcome === 'SCRAMBLE');
      assert.equal(sum.line.rushes, scrambles.length + sum.results.filter(r => r.outcome === 'RUN').length, 'a scramble counts as a rush');
      assert.equal(sum.line.rushYds, sum.results.filter(r => r.rush).reduce((s, r) => s + r.yards, 0), 'scramble yards are rushing yards');
      assert.equal(sum.line.yds, sum.results.filter(r => r.outcome === 'CATCH').reduce((s, r) => s + r.yards, 0), 'passing yards are only the catches');
      assert.equal(await page.locator('.sum-rating-num').getAttribute('data-rating'), String(sum.rating), 'the rating is shown');
      assert.match(await page.locator('.sum-stats').textContent(), new RegExp(sum.line.cmp + '/' + sum.line.att), 'CMP/ATT on the line');
      assert.equal(await page.locator('.sum-stat[data-rush]').getAttribute('data-rush'), String(sum.line.rushYds), 'the RUSH stat carries the rushing yards');
      assert.equal(await page.locator('.sum-row').count(), 6, 'six rows');
      assert.ok((await page.locator('[data-verdict]').textContent()).length > 10, 'a verdict');
      if (phone) await H.noHorizontalScroll(page, 'summary');
      if (mode === 'http') await H.shot(page, 'moment_summary_' + vp);
      noErrors(app, 'summary');

      // the same seed again → the same script, the same first read, the same READ picture
      await H.openDemo(page, mode, vp, { seed: SEED });
      const st1 = await titleToDrive(page);
      assert.equal(scriptSig(st1), sig0, 'the same seed reproduces the script');
      await Q.tapToRead(page);
      const list1 = await Q.cards(page);
      assert.deepEqual(list1.map(c => c.id + '=' + c.advice), firstRead.cards, 'the same seed reproduces the first read');
      const cur1 = await Q.current(page);
      assert.equal(cur1.ctx.real, firstRead.real, 'the same real coverage');
      assert.equal(JSON.stringify(cur1.ctx.alignment || null), firstRead.alignment, 'the same pre-snap picture');
      noErrors(app, 'replay');
    } finally { await app.close(); }
  });
});

test('moment file desktop: forceResult from the read, skipTo the summary, PLAY AGAIN keeps the seed, a first down moves the next snap', async () => {
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
    assert.equal(st.results[0].plan, null, 'a forced result has no plan to replay');
    assert.equal(await H.debug(page, 'skipTo', 'summary'), 'summary');
    await H.waitForScreen(page, 'summary');
    const sum = await H.debug(page, 'summary');
    assert.equal(sum.results.length, 6); assert.equal(sum.done, true);
    for (let i = 1; i < 6; i++) {
      const rp = await H.debug(page, 'replay', i);
      if (sum.results[i].play === 'SNEAK' || sum.results[i].play === 'DRAW') continue;
      assert.equal(rp.same, true, 'the headless moment ' + (i + 1) + ' replays from its plan');
    }
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

test('moment file desktop: every moment costs the drive 3 parent draws — a hand-drawn moment, a run card and a headless one end on the same rng state', async () => {
  async function endState(seed, playFirst, runCard) {
    const app = await H.openDemo({ mode: 'file', viewport: 'desktop', seed });
    const { page } = app;
    try {
      await Q.startDrive(page);
      if (runCard) {
        // three forced results (each snaps the first pass card: the live fork is spent by its Live), then the SNEAK
        for (let i = 0; i < 3; i++) {
          await H.waitPhase(page, 'SITUATION');
          await H.debug(page, 'forceResult', 'INCOMPLETE');
          await Q.waitResult(page); await Q.skipResult(page); await Q.waitDone(page); await Q.next(page);
        }
        await Q.tapToRead(page);
        const list = await Q.cards(page);
        const run = list.find(c => c.run);
        assert.ok(run, 'short yardage offers a run card (' + list.map(c => c.id).join(', ') + ')');
        const ph = await Q.pickPlay(page, run.idx);
        assert.ok(ph === 'RUN' || ph === 'RESULT' || ph === 'DONE', 'the run card resolves at the snap (' + ph + ')');
        await Q.waitResult(page); await Q.skipResult(page); await Q.waitDone(page);
      }
      if (playFirst) {
        await Q.tapToRead(page);
        const list = await Q.cards(page);
        const card = list.find(c => !c.run);
        await Q.pickPlay(page, card.idx);
        await Q.waitCanDraw(page);
        const tgt = await Q.chooseTarget(page, { loft: 0.4 });
        if (tgt && tgt.slot) await Q.drawPass(page, tgt.slot, { speed: 'fast' });
        await Q.waitResult(page);
        await Q.skipResult(page);
        await Q.waitDone(page);
      }
      await H.debug(page, 'skipTo', 'summary');
      const st = await Q.state(page);
      noErrors(app, 'draws ' + seed);
      return { rng: st.rngState, results: st.results.length };
    } finally { await app.close(); }
  }
  const a = await endState(4242, false, false), b = await endState(4242, true, false), c = await endState(4242, false, true);
  assert.equal(a.results, 6); assert.equal(b.results, 6); assert.equal(c.results, 6);
  assert.equal(b.rng, a.rng, 'the drawn moment spent exactly the headless moment\'s draws (ctx · snap · live)');
  assert.equal(c.rng, a.rng, 'forced results and a run card spend the live fork too');
});

test('moment file desktop: Escape opens the settings modal (title and scene), the toggles apply live, aim assist is a setting', async () => {
  const app = await H.openDemo({ mode: 'file', viewport: 'desktop', seed: 7 });
  const { page } = app;
  try {
    await page.keyboard.press('Escape');
    await page.locator('.settings-modal').waitFor({ state: 'visible', timeout: 3000 });
    assert.equal(await page.locator('.settings-modal .switch[data-setting="aimAssist"]').getAttribute('aria-checked'), 'true', 'aim assist defaults on');
    assert.equal(await page.locator('.settings-modal .switch[data-setting="greenAssist"]').count(), 0, 'the v1 green band is gone');
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
    await page.locator('.settings-modal .switch[data-setting="aimAssist"]').click();
    assert.equal(await page.evaluate(() => RTG.UI.store.settings.aimAssist), false, 'aim assist toggles off');
    assert.equal(await page.evaluate(() => document.body.getAttribute('data-aim-assist')), '0');
    await H.clickButton(page, 'DONE', page.locator('.settings-modal'));
    await page.locator('.settings-modal').waitFor({ state: 'detached', timeout: 3000 });
    assert.equal(await page.evaluate(() => RTG.UI.PlayView.current().phase()), 'SITUATION', 'back on the still-armed moment');
    // the settings persisted through the store (rtg.qb.settings)
    const saved = await page.evaluate(() => RTG.UI.Storage.getJSON('rtg.qb.settings') || {});
    assert.equal(saved.reducedMotion, false); assert.equal(saved.aimAssist, false);
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

test('moment file landscape (844×390): a drawn moment plays and the story fits', async () => {
  const app = await H.openDemo({ mode: 'file', viewport: 'landscape', seed: 844 });
  const { page } = app;
  try {
    await Q.startDrive(page);
    const m = await Q.playMoment(page, { how: 'touch' });
    assert.equal(typeof m.result.outcome, 'string');
    if (m.pass) assert.equal(m.pass.drawing && m.pass.drawing.kind, 'PASS', 'a drawn pass in landscape');
    await H.noHorizontalScroll(page, 'story landscape');
    noErrors(app, 'landscape');
  } finally { await app.close(); }
});
