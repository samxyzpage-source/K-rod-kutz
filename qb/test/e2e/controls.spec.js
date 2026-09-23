/**
 * controls.spec: the hands moment.spec does not exercise, through the real screens.
 *
 *   file + http × phone + desktop: one whole drive with DUAL_THREAT / GREAT LINE (a long pocket and the mobility for
 *   SCRAMBLE): THROW AWAY by its button → SCRAMBLE by its button → the SACK (a receiver tapped, the hold never let go,
 *   the rush arrives) → a swipe down on empty grass (CDP touch on the phone, the mouse on the desktop) = SCRAMBLE →
 *   the X key = THROW AWAY → the Z key = SCRAMBLE → the summary's line adds up (attempts + sacks + rushes = 6).
 *   file desktop: the keyboard-only moment (Enter starts, 1–3 picks the play, a stray Space shows the hint, arrows /
 *   Tab / 1–5 cycle and pick the target, Space held climbs the bar, arrows aim, Space up throws, Space skips the
 *   result, Enter is NEXT); reduced motion from the OS hint and from the setting (no align beat, a flight in tens of
 *   ms); the same ?seed twice reproduces the whole sim (coverage, cards, sack clock, windows, rushers); the summary's
 *   NEW DRIVE and TITLE actions. file narrow (320 px): no horizontal scroll in SITUATION / READ / SNAP / THROW /
 *   RESULT / the story. http desktop: the canvas loop's frame p95 stays under 4 ms through a play and its flight.
 *   Zero console / page errors everywhere.
 *
 *   /opt/node22/bin/node qb/test/e2e/controls.spec.js
 */
'use strict';
const { test, after } = require('node:test');
const H = require('./_harness');
const Q = require('./_playhelpers');
const assert = H.assert;

after(async () => { await H.closeBrowser(); });

const FRAME_P95_BUDGET_MS = 4;

function noErrors(app, where) { assert.deepEqual(app.errors.concat(app.foreignErrors), [], where + ': console / page errors'); }

/** The title picks + START → the first SITUATION. */
async function startWith(page, arch, team, venue) {
  await H.waitForScreen(page, 'title');
  await Q.pickArchetype(page, arch);
  await Q.pickTeam(page, team);
  await Q.pickVenue(page, venue);
  await Q.startDrive(page);
}

/** SITUATION → READ → the best pass card → SNAP (a run card would resolve itself, so the pass card is forced). */
async function readAndSnap(page, where) {
  await H.waitPhase(page, 'SITUATION');
  await Q.tapToRead(page);
  const list = await Q.cards(page);
  const card = list.find(c => !c.run && c.advice === 'GOOD') || list.find(c => !c.run) || list[0];
  const ph = await Q.pickPlay(page, card.idx);
  assert.equal(ph, 'SNAP', where + ': a pass play snaps (' + card.id + ')');
  return card;
}

/** Skip the result, wait for the interstitial (or the summary), return {result, screen, story}. */
async function finishMoment(page, where) {
  const res = await Q.waitResult(page);
  const banner = (await page.locator('.pv-banner').textContent()).trim();
  // read the input the scene emitted while the scene is still live (the shell destroys it after onDone)
  const lastInput = await page.evaluate(() => { const v = RTG.UI.PlayView.current(); return v ? JSON.parse(JSON.stringify(v.lastInput())) : null; });
  await page.waitForTimeout(350);
  await page.evaluate(() => { const v = RTG.UI.PlayView.current(); if (v && v.phase() === 'RESULT') v.skip(); });
  const screen = await Q.waitDone(page);
  const story = screen === 'moment' ? (await page.locator('.screen-moment [data-story]').textContent()).trim() : '';
  assert.ok(story.length > 10 || screen === 'summary', where + ': a story line');
  return { result: res, banner, screen, story, lastInput };
}

/** A swipe down on empty grass: CDP touch on the phone, the mouse on the desktop. */
async function swipeDown(page, touch) {
  const g = await Q.geometry(page);
  const x = g.rect.x + 6, y0 = g.rect.y + g.rect.h - 90;    // start high enough for the swipe to stay on the canvas
  const dy = 64;
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    const tp = (px, py) => ({ x: px, y: py, id: 1, radiusX: 4, radiusY: 4, force: 1 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(x, y0)] });
    for (let i = 1; i <= 4; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(x, y0 + dy * i / 4)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(x, y0);
    await page.mouse.down();
    await page.mouse.move(x, y0 + dy, { steps: 4 });
    await page.mouse.up();
  }
}

H.matrix(({ mode, vp }) => {
  test(`controls ${mode} ${vp}: throw away, scramble (button, swipe, key), the sack — a whole drive`, async () => {
    const app = await H.openDemo({ mode, viewport: vp, seed: 1717 });
    const { page } = app;
    const phone = vp === 'phone';
    try {
      await startWith(page, 'DUAL_THREAT', 'GREAT', 'HS');
      const st0 = await Q.state(page);
      assert.equal(st0.drive.archetype, 'DUAL_THREAT');

      // 1 · THROW AWAY by its button (hidden until 1.2 s of play time)
      await readAndSnap(page, 'm1');
      assert.equal(await page.locator('.pv-btn-away').isHidden(), true, 'm1: THROW AWAY hidden right after the snap');
      await page.locator('.pv-btn-away').waitFor({ state: 'visible', timeout: 5000 });
      const t1 = (await Q.current(page)).t;
      assert.ok(t1 >= 1.1, 'm1: the button appears at 1.2 s of play time (t ' + t1 + ')');
      await page.locator('.pv-btn-away').click();
      const m1 = await finishMoment(page, 'm1');
      assert.equal(m1.result.outcome, 'THROWAWAY'); assert.equal(m1.result.yards, 0); assert.equal(m1.result.turnover, false);
      assert.equal(m1.lastInput.kind, 'THROWAWAY');
      assert.match(m1.banner, /THROWN AWAY/);
      assert.match(m1.story, /Thrown away/i, 'm1: the story says thrown away on third down');
      await Q.next(page);

      // 2 · SCRAMBLE by its button (MOB 72 ≥ minMob; hidden until 0.3 s of play time)
      await readAndSnap(page, 'm2');
      await page.locator('.pv-btn-scramble').waitFor({ state: 'visible', timeout: 5000 });
      await page.locator('.pv-btn-scramble').click();
      await page.waitForFunction(() => { const v = RTG.UI.PlayView.current(); const p = v && v.phase(); return p === 'RUN' || p === 'RESULT' || p === 'DONE'; }, null, { timeout: 4000 });
      const m2 = await finishMoment(page, 'm2');
      assert.equal(m2.result.outcome, 'SCRAMBLE'); assert.equal(m2.lastInput.kind, 'SCRAMBLE');
      assert.match(m2.banner, /SCRAMBLE [+-]?\d+|FIRST DOWN|TOUCHDOWN|FUMBLE/);
      await Q.next(page);

      // 3 · the SACK: a receiver tapped, the hold never let go, the rush arrives at sim.sackAt
      await readAndSnap(page, 'm3');
      const tgt = await Q.chooseTarget(page);
      await Q.tapReceiver(page, tgt.slot);
      const g = await Q.geometry(page);
      await page.mouse.move(g.rect.x + 6, g.rect.y + g.rect.h - 6);
      await page.mouse.down();
      await page.waitForFunction(() => { const v = RTG.UI.PlayView.current(); return !!v && v.current().hold; }, null, { timeout: 3000 });
      await H.waitPhase(page, 'SACK', 8000);
      await page.mouse.up();
      const cur3 = await Q.current(page);
      const sackAt = cur3.sim.sackAt;
      assert.ok(cur3.t >= sackAt - 0.05, 'm3: the sack fires at the sack clock (t ' + cur3.t + ' vs ' + sackAt + ')');
      assert.ok(Number((await page.locator('.pv-pressure').getAttribute('aria-valuenow'))) >= 95, 'm3: the pressure meter is full');
      const m3 = await finishMoment(page, 'm3');
      assert.equal(m3.result.outcome, 'SACK'); assert.ok(m3.result.yards < 0, 'm3: yards lost');
      assert.equal(m3.lastInput.kind, 'SACK'); assert.equal(m3.result.feedback.timing, 'TOO LATE');
      assert.match(m3.banner, /SACKED -\d+/);
      await Q.next(page);

      // 4 · a swipe down on empty grass with no target = SCRAMBLE (after 0.3 s of play time)
      await readAndSnap(page, 'm4');
      await Q.waitPlayTime(page, 0.4);
      await swipeDown(page, phone);
      await page.waitForFunction(() => { const v = RTG.UI.PlayView.current(); const p = v && v.phase(); return p === 'RUN' || p === 'RESULT' || p === 'DONE'; }, null, { timeout: 4000 });
      const m4 = await finishMoment(page, 'm4');
      assert.equal(m4.result.outcome, 'SCRAMBLE'); assert.equal(m4.lastInput.kind, 'SCRAMBLE');
      await Q.next(page);

      // 5 · the X key = THROW AWAY (once the pocket allows it)
      await readAndSnap(page, 'm5');
      await Q.waitPlayTime(page, 1.25);
      await page.keyboard.press('x');
      const m5 = await finishMoment(page, 'm5');
      assert.equal(m5.result.outcome, 'THROWAWAY'); assert.equal(m5.lastInput.kind, 'THROWAWAY');
      await Q.next(page);

      // 6 · the Z key = SCRAMBLE (the last play: the drive ends on it)
      await readAndSnap(page, 'm6');
      await Q.waitPlayTime(page, 0.4);
      await page.keyboard.press('z');
      const m6 = await finishMoment(page, 'm6');
      assert.equal(m6.result.outcome, 'SCRAMBLE'); assert.equal(m6.lastInput.kind, 'SCRAMBLE');
      assert.equal(m6.screen, 'summary', 'the sixth result leads to the summary');

      const sum = await H.debug(page, 'summary');
      assert.equal(sum.line.att, 2, 'two throwaways are two attempts');
      assert.equal(sum.line.sacks, 1); assert.equal(sum.line.rushes, 3);
      assert.equal(sum.line.att + sum.line.sacks + sum.line.rushes, 6, 'every moment is on the line');
      assert.deepEqual(sum.results.map(r => r.outcome), ['THROWAWAY', 'SCRAMBLE', 'SACK', 'SCRAMBLE', 'THROWAWAY', 'SCRAMBLE']);
      if (phone) await H.noHorizontalScroll(page, 'summary');
      noErrors(app, 'drive');
    } finally { await app.close(); }
  });
});

test('controls file desktop: the keyboard-only moment — Enter, 1–3, a stray Space, arrows / Tab / 1–5, Space held, arrows aim, Space up, Space skips, Enter is NEXT', async () => {
  const app = await H.openDemo({ mode: 'file', viewport: 'desktop', seed: 2024 });
  const { page } = app;
  try {
    await H.waitForScreen(page, 'title');
    await page.keyboard.press('Enter');                                   // START THE DRIVE from the body
    await H.waitForScreen(page, 'moment');
    await H.waitPhase(page, 'SITUATION');
    const armMs = await page.evaluate(() => RTG.UI.PlayView.TIMING.armMs || 0);
    await page.waitForTimeout(armMs + 80);                                // a confirm key inside armMs of the card mounting is the tail of the last Enter: ignored
    await page.keyboard.press('Enter');                                   // TAP TO READ (focused) / the confirm key
    await H.waitPhase(page, 'READ');
    const list = await Q.cards(page);
    const card = list.find(c => !c.run && c.advice === 'GOOD') || list.find(c => !c.run) || list[0];
    await page.waitForTimeout(armMs + 80);
    await page.keyboard.press(String(card.idx + 1));                       // the card's number
    await H.waitPhase(page, 'SNAP');
    const slots = (await Q.current(page)).sim.receivers.map(r => r.slot);
    // a stray confirm with no target: the hint toast, no hold
    await page.keyboard.press('Space');
    await page.locator('.pv-toast').waitFor({ state: 'visible', timeout: 2000 });
    assert.match(await page.locator('.pv-toast').textContent(), /PICK A RECEIVER/, 'the stray-tap hint');
    assert.equal((await Q.current(page)).hold, false, 'no hold without a target');
    // arrows cycle from nothing to the first receiver, then on; Tab cycles too (the canvas has the focus)
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(s => { const v = RTG.UI.PlayView.current(); return v.phase() === 'THROW' && v.current().target === s; }, slots[0], { timeout: 2000 });
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(s => RTG.UI.PlayView.current().current().target === s, slots[1], { timeout: 2000 });
    await page.keyboard.press('Tab');
    await page.waitForFunction(s => RTG.UI.PlayView.current().current().target === s, slots[2], { timeout: 2000 });
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(s => RTG.UI.PlayView.current().current().target === s, slots[1], { timeout: 2000 });
    // the number keys pick straight, then the throw: Space held, arrows nudge toward the route's ideal, Space up
    const tgt = await Q.chooseTarget(page);
    const thrown = await Q.keyThrow(page, { slot: tgt.slot });
    assert.equal(thrown.slot, tgt.slot);
    assert.equal(thrown.input.kind, 'THROW'); assert.equal(thrown.input.target, tgt.slot);
    assert.ok(Math.abs(thrown.input.lead - tgt.ideal.lead) <= 0.06, 'lead nudged to the ideal (' + thrown.input.lead + ' vs ' + tgt.ideal.lead + ')');
    assert.ok(Math.abs(thrown.input.loft - tgt.ideal.loft) <= 0.06, 'loft nudged to the ideal (' + thrown.input.loft + ' vs ' + tgt.ideal.loft + ')');
    if (thrown.zone) assert.ok(thrown.input.power >= thrown.zone.lo - 0.03 && thrown.input.power <= thrown.zone.hi + 0.03, 'released in the green');
    await Q.waitResult(page);
    await page.waitForTimeout(350);
    await page.keyboard.press('Space');                                   // the confirm key skips the result
    await Q.waitDone(page);
    assert.equal(await page.evaluate(() => document.querySelector('.screen-moment').getAttribute('data-stage')), 'story');
    await page.keyboard.press('Enter');                                   // NEXT (focused button or the body fallback)
    await H.waitPhase(page, 'SITUATION');
    assert.equal((await Q.state(page)).drive.idx, 1, 'the second moment is armed');
    noErrors(app, 'keyboard');
  } finally { await app.close(); }
});

test('controls file desktop: a green ring is honest — a ball released while the ring is green arrives in an open window (≥ intWindow) and can never be picked', async () => {
  const app = await H.openDemo({ mode: 'file', viewport: 'desktop', seed: 4242 });
  const { page } = app;
  try {
    await startWith(page, 'FIELD_GENERAL', 'AVERAGE', 'COLLEGE');
    let greens = 0, samples = 0, violations = [];
    for (let m = 0; m < 3 && greens < 40; m++) {
      await readAndSnap(page, 'ring m' + (m + 1));
      // every frame of the play: for each receiver whose ring is green NOW, the engine's own verdict on a ball
      // released now (full power, the route's ideal loft — what the ring is coloured by)
      const out = await page.evaluate(() => new Promise(resolve => {
        const res = { samples: 0, greens: 0, violations: [] };
        const T = RTG.Tuning.qb.throw;
        (function poll() {
          const v = RTG.UI.PlayView.current();
          const p = v && v.phase();
          if (!v || (p !== 'SNAP' && p !== 'THROW')) return resolve(res);
          const sim = v.sim(), c = v.current(), a = v.actors();
          if (sim && !sim.run) {
            for (const r of a.receivers) {
              res.samples++;
              if (r.ring !== 0) continue;
              res.greens++;
              const rec = sim.receivers.find(x => x.slot === r.slot), route = RTG.Data.plays.routes[rec.route];
              const th = RTG.Play.throw(sim, { target: r.slot, t: c.t, lead: route.ideal.lead, loft: route.ideal.loft, power: 1, quality: 1, green: true }, RTG.RNG.create(7));
              if (th.outcome !== 'SACK' && (th.window < T.intWindow - 1e-6 || th.pInt > 0)) res.violations.push({ slot: r.slot, t: c.t, window: th.window, pInt: th.pInt, ringOpen: r.open });
            }
          }
          if (res.samples > 4000) return resolve(res);
          requestAnimationFrame(poll);
        })();
      }));
      greens += out.greens; samples += out.samples; violations = violations.concat(out.violations);
      await Q.waitResult(page);                                           // nothing was thrown: the sack ends the play
      await page.waitForTimeout(350);
      await page.evaluate(() => { const v = RTG.UI.PlayView.current(); if (v && v.phase() === 'RESULT') v.skip(); });
      if ((await Q.waitDone(page)) === 'summary') break;
      await Q.next(page);
    }
    assert.ok(samples > 50, 'the rings were sampled (' + samples + ')');
    assert.ok(greens > 0, 'at least one green ring was shown (' + greens + ' green of ' + samples + ' samples)');
    assert.deepEqual(violations, [], 'a green ring means an open window at the arrival');
    noErrors(app, 'ring');
  } finally { await app.close(); }
});

test('controls file desktop: reduced motion — the OS hint and the setting drop the align beat and shorten the flight', async () => {
  // the OS hint
  const app = await H.openDemo({ mode: 'file', viewport: 'desktop', seed: 55, reducedMotion: 'reduce' });
  const { page } = app;
  try {
    assert.equal(await page.evaluate(() => RTG.UI.app.reducedMotion()), true, 'prefers-reduced-motion is honoured');
    await startWith(page, 'SURGEON', 'GREAT', 'NFL');
    await readAndSnap(page, 'reduced');
    await page.waitForTimeout(150);
    assert.ok((await Q.current(page)).t > 0.05, 'no 420 ms align beat: the play clock runs at once');
    const tgt = await Q.chooseTarget(page);
    await Q.tapReceiver(page, tgt.slot);
    await Q.holdRelease(page, { lead: tgt.ideal.lead, loft: tgt.ideal.loft, releaseAt: tgt.releaseAt });
    const t0 = Date.now();
    await page.waitForFunction(() => { const v = RTG.UI.PlayView.current(); const p = v && v.phase(); return p === 'RESULT' || p === 'DONE'; }, null, { timeout: 4000 });
    const flightMs = Date.now() - t0;
    assert.ok(flightMs < 700, 'the flight and its landing beat take tens of ms with reduced motion (' + flightMs + ' ms)');
    assert.equal(await page.locator('.pv-skip').isHidden(), true, 'no TAP TO SKIP hint under reduced motion');
    const t1 = Date.now();
    await Q.waitDone(page);
    assert.ok(Date.now() - t1 < 1000, 'the result beat is the reduced 400 ms (' + (Date.now() - t1) + ' ms)');
    noErrors(app, 'reduced (OS)');
  } finally { await app.close(); }

  // the setting, toggled from the title
  const app2 = await H.openDemo({ mode: 'file', viewport: 'desktop', seed: 56 });
  const p2 = app2.page;
  try {
    assert.equal(await p2.evaluate(() => RTG.UI.app.reducedMotion()), false);
    await H.debug(p2, 'setSettings', { reducedMotion: true });
    assert.equal(await p2.evaluate(() => document.body.classList.contains('reduced-motion')), true, 'the body class follows the setting');
    await startWith(p2, 'GUNSLINGER', 'AVERAGE', 'COLLEGE');
    await readAndSnap(p2, 'reduced setting');
    await p2.waitForTimeout(150);
    assert.ok((await Q.current(p2)).t > 0.05, 'the setting drops the align beat too');
    await H.debug(p2, 'forceResult', 'CATCH');
    const t2 = Date.now();
    await p2.waitForFunction(() => { const v = RTG.UI.PlayView.current(); const p = v && v.phase(); return p === 'RESULT' || p === 'DONE'; }, null, { timeout: 4000 });
    assert.ok(Date.now() - t2 < 700, 'a forced catch lands in tens of ms (' + (Date.now() - t2) + ' ms)');
    noErrors(app2, 'reduced (setting)');
  } finally { await app2.close(); }
});

test('controls file desktop: the same ?seed twice reproduces the whole sim — coverage, cards, sack clock, windows, rushers', async () => {
  async function firstSim(seed) {
    const app = await H.openDemo({ mode: 'file', viewport: 'desktop', seed });
    try {
      await startWith(app.page, 'FIELD_GENERAL', 'AVERAGE', 'COLLEGE');
      await Q.tapToRead(app.page);
      const cur0 = await Q.current(app.page);
      await Q.pickPlay(app.page, 0);
      const cur = await Q.current(app.page);
      const sim = cur.sim;
      noErrors(app, 'seed ' + seed);
      return {
        real: cur0.ctx.real, shown: cur0.ctx.shown, cards: cur0.ctx.options.map(o => o.id + '=' + o.advice), revealAt: cur0.ctx.revealAt,
        play: sim.playId, sackAt: sim.sackAt, hot: sim.hot, checkdown: sim.checkdown, scramble: sim.scrambleYards,
        rushers: sim.rushers, receivers: sim.receivers.map(r => [r.slot, r.route, r.x0, r.peak, JSON.stringify(r.window), JSON.stringify(r.release)].join(':'))
      };
    } finally { await app.close(); }
  }
  const a = await firstSim(31337), b = await firstSim(31337), c = await firstSim(31338);
  assert.deepEqual(a, b, 'seed 31337 twice: the same read and the same sim');
  assert.notDeepEqual(a, c, 'a different seed differs');
});

test('controls file narrow (320 px): no horizontal scroll in SITUATION, READ, SNAP, THROW, RESULT and the story', async () => {
  const app = await H.openDemo({ mode: 'file', viewport: 'narrow', seed: 320 });
  const { page } = app;
  try {
    await startWith(page, 'GUNSLINGER', 'AVERAGE', 'COLLEGE');
    await H.noHorizontalScroll(page, 'situation 320');
    await Q.tapToRead(page);
    await H.noHorizontalScroll(page, 'read 320');
    const list = await Q.cards(page);
    assert.ok(list.length >= 2, '2-3 cards at 320 px');
    const card = list.find(c => !c.run && c.advice === 'GOOD') || list.find(c => !c.run) || list[0];
    await Q.pickPlay(page, card.idx);
    await H.noHorizontalScroll(page, 'snap 320');
    const tgt = await Q.chooseTarget(page);
    await Q.tapReceiver(page, tgt.slot);
    await Q.holdRelease(page, { lead: tgt.ideal.lead, loft: tgt.ideal.loft, releaseAt: tgt.releaseAt, onHold: async () => { await H.noHorizontalScroll(page, 'throw 320'); } });
    await Q.waitResult(page);
    await H.noHorizontalScroll(page, 'result 320');
    await page.waitForTimeout(350);
    await page.evaluate(() => { const v = RTG.UI.PlayView.current(); if (v && v.phase() === 'RESULT') v.skip(); });
    await Q.waitDone(page);
    await H.noHorizontalScroll(page, 'story 320');
    noErrors(app, 'narrow');
  } finally { await app.close(); }
});

test('controls http desktop: the frame p95 stays under ' + FRAME_P95_BUDGET_MS + ' ms through the play and the flight', async () => {
  const app = await H.openDemo({ mode: 'http', viewport: 'desktop', seed: 4242 });
  const { page } = app;
  try {
    await startWith(page, 'GUNSLINGER', 'AVERAGE', 'NFL');
    await readAndSnap(page, 'perf');
    // sample the loop's p95 (the canvas keeps the last 120 frame costs) until the result is up
    const sampler = page.evaluate(() => new Promise(resolve => {
      const out = { maxP95: 0, samples: 0, frames0: RTG.UI.PlayView.current().cv.stats.frames, flightP95: 0, fps: 0 };
      (function poll() {
        const v = RTG.UI.PlayView.current();
        if (!v) return resolve(out);
        const p = v.phase();
        const p95 = v.cv.p95();
        out.samples++;
        if (p95 > out.maxP95) out.maxP95 = p95;
        if (p === 'FLIGHT' && p95 > out.flightP95) out.flightP95 = p95;
        out.fps = v.cv.stats.fps || out.fps;
        if (p === 'RESULT' || p === 'DONE') { out.frames1 = v.cv.stats.frames; return resolve(out); }
        setTimeout(poll, 40);
      })();
    }));
    const tgt = await Q.chooseTarget(page);
    await Q.tapReceiver(page, tgt.slot);
    await Q.holdRelease(page, { lead: tgt.ideal.lead, loft: tgt.ideal.loft, releaseAt: tgt.releaseAt });
    await Q.waitResult(page);
    const perf = await sampler;
    console.log('  frame p95 max ' + perf.maxP95 + ' ms (flight ' + perf.flightP95 + ' ms) over ' + (perf.frames1 - perf.frames0) + ' frames, ' + perf.samples + ' samples, fps ' + perf.fps);
    assert.ok(perf.frames1 - perf.frames0 > 30, 'the loop ran during the play');
    assert.ok(perf.maxP95 < FRAME_P95_BUDGET_MS, 'frame p95 ' + perf.maxP95 + ' ms under ' + FRAME_P95_BUDGET_MS + ' ms');
    const dbg = await H.debug(page, 'perf');
    assert.equal(dbg.rafActive, true, 'RTG.debug.perf().rafActive');
    noErrors(app, 'perf');
  } finally { await app.close(); }
});

test('controls file desktop: the summary — NEW DRIVE rolls a fresh seed with the same picks, TITLE keeps them selected', async () => {
  const app = await H.openDemo({ mode: 'file', viewport: 'desktop', seed: 8080 });
  const { page } = app;
  try {
    await startWith(page, 'SURGEON', 'BAD', 'HS');
    await H.debug(page, 'skipTo', 'summary');
    await H.waitForScreen(page, 'summary');
    assert.equal(await page.locator('.sum-row').count(), 6);
    await H.clickButton(page, 'NEW DRIVE');
    await H.waitForScreen(page, 'moment');
    await H.waitPhase(page, 'SITUATION');
    const st = await Q.state(page);
    assert.notEqual(st.drive.seed, '8080', 'a new seed');
    assert.equal(st.drive.archetype, 'SURGEON'); assert.equal(st.drive.team, 'BAD'); assert.equal(st.drive.venue, 'HS');
    assert.equal(st.results.length, 0);
    await H.debug(page, 'skipTo', 'summary');
    await H.waitForScreen(page, 'summary');
    await H.clickButton(page, 'TITLE');
    await H.waitForScreen(page, 'title');
    assert.equal(await page.locator('.arch-card[data-arch="SURGEON"]').getAttribute('aria-checked'), 'true', 'the archetype stays picked');
    assert.equal(await page.locator('[data-team="BAD"]').getAttribute('aria-checked'), 'true');
    assert.equal(await page.locator('[data-venue="HS"]').getAttribute('aria-checked'), 'true');
    noErrors(app, 'summary actions');
  } finally { await app.close(); }
});

test('controls file phone: forced INT and DROP beats, then the SNEAK card on short yardage runs without a throw and lands on the line as a rush', async () => {
  const app = await H.openDemo({ mode: 'file', viewport: 'phone', seed: 606 });
  const { page } = app;
  try {
    await startWith(page, 'FIELD_GENERAL', 'AVERAGE', 'COLLEGE');
    // moments 1–3 by forced results from the situation card (the debug API reads and snaps the first pass card)
    const beats = [['INT', /INTERCEPTED/, /Picked off/i], ['DROP', /DROPPED/, /defence holds|chains stay put/i], ['INCOMPLETE', /INCOMPLETE/, /defence holds|chains stay put/i]];
    for (let i = 0; i < beats.length; i++) {
      await H.waitPhase(page, 'SITUATION');
      const res = await H.debug(page, 'forceResult', beats[i][0]);
      assert.equal(res.outcome, beats[i][0], 'moment ' + (i + 1) + ': the forced outcome');
      const m = await finishMoment(page, 'moment ' + (i + 1));
      assert.match(m.banner, beats[i][1], 'moment ' + (i + 1) + ': the banner');
      assert.match(m.story, beats[i][2], 'moment ' + (i + 1) + ': the story');
      await Q.next(page);
    }
    const st3 = await Q.state(page);
    assert.equal(st3.line.int, 1); assert.equal(st3.line.turnovers, 1); assert.equal(st3.line.att, 3);
    // moment 4 is SHORT_YARDAGE: toGo 1–2 → SNEAK is always among the cards
    await H.waitPhase(page, 'SITUATION');
    assert.equal(st3.situation.kind, 'SHORT_YARDAGE'); assert.ok(st3.situation.toGo <= 2, 'toGo ' + st3.situation.toGo);
    await Q.tapToRead(page);
    const list = await Q.cards(page);
    const sneak = list.find(c => c.id === 'SNEAK');
    assert.ok(sneak, 'the SNEAK card is offered (' + list.map(c => c.id).join(', ') + ')');
    assert.ok(list.filter(c => !c.run).length >= 2, 'two pass cards next to the run card');
    assert.ok(sneak.tags.includes('RUN'), 'the card shows the RUN tag');
    const ph = await Q.pickPlay(page, sneak.idx);
    assert.ok(ph === 'RUN' || ph === 'RESULT' || ph === 'DONE', 'a run card resolves in the scene (' + ph + ')');
    await H.noHorizontalScroll(page, 'run phase');
    const m4 = await finishMoment(page, 'moment 4');
    assert.equal(m4.result.outcome, 'RUN'); assert.equal(m4.result.playId, 'SNEAK');
    assert.equal(m4.lastInput, null, 'no throw input for a run option');
    assert.match(m4.banner, /SNEAK [+-]\d+|STUFFED|FIRST DOWN|TOUCHDOWN/);
    const st4 = await Q.state(page);
    assert.equal(st4.line.rushes, 1, 'the sneak is a rush on the line');
    assert.equal(st4.results[3].outcome, 'RUN'); assert.equal(st4.results[3].play, 'SNEAK');
    assert.equal(st4.line.att, 3, 'not an attempt');
    noErrors(app, 'run card');
  } finally { await app.close(); }
});
