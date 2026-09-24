/**
 * controls.spec (v2 "DRAW THE PASS"): the hands moment.spec does not exercise, through the real screens.
 *
 *   file + http × phone + desktop — one whole drive (DUAL_THREAT / GREAT LINE / HS): THROW AWAY by its button → the
 *     SACK when the QB just stands there (the RUSH meter fills) → INVALID input does nothing (a press away from the QB,
 *     a tap on him) then a drawn scramble → a cancelled draft (touchcancel on the phone, Backspace under the mouse)
 *     then a drawn pass → the X key (desktop) / a drawn throw-away line (phone) → a keyboard run (desktop) / a drawn
 *     scramble (phone) → the summary's line adds up (attempts + sacks + rushes = 6, scrambles are rushes).
 *   file desktop — slow motion engages while a finger is down (timeScale = Tuning.qb.draw.slowMo, the play clock
 *     crawls, the SLOW-MO chip, the stage's slow band) and the per-play budget runs out (then full speed, SLOW-MO OUT);
 *     INVALID lines do nothing (strays, taps, garbage through the debug hands, no second throw); the preview colour
 *     shows only for a FIELD GENERAL (IQ ≥ Tuning.qb.draw.previewIq); aim assist on snaps the line's end onto the
 *     receiver's spot, off leaves it; keyboard composing (Enter / 1–5 / L / arrows / Q-E / Backspace / R / Enter,
 *     Space skips, Enter is NEXT, X throws away); reduced motion from the OS hint and from the setting; the same ?seed
 *     reproduces the situations, the read and the snap's cast; the summary's NEW DRIVE / TITLE.
 *   file narrow (320 px) — no horizontal scroll in SITUATION, READ, PLAY, mid-draw, flight, RESULT, the story, the summary.
 *   http desktop — the canvas loop's frame p95 stays under 4 ms while drawing and while the ball is in the air.
 *   file phone — forced INT / DROP / INCOMPLETE beats, then the SNEAK card resolves at the snap as a rush.
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

/** SITUATION → READ → the best pass card → PLAY, the QB ready to draw. */
async function readAndSnap(page, where) {
  await H.waitPhase(page, 'SITUATION');
  await Q.tapToRead(page);
  const list = await Q.cards(page);
  const card = list.find(c => !c.run && c.advice === 'GOOD') || list.find(c => !c.run) || list[0];
  const ph = await Q.pickPlay(page, card.idx);
  assert.equal(ph, 'PLAY', where + ': a pass play snaps (' + card.id + ')');
  await Q.waitCanDraw(page);
  return card;
}

/** Wait for the result, skip it, wait for the interstitial (or the summary) → {result, banner, screen, story, plan, events}. */
async function finishMoment(page, where) {
  const res = await Q.waitResult(page);
  const banner = (await page.locator('.pv-banner').textContent()).trim();
  const cur = await Q.current(page);
  await Q.skipResult(page);
  const screen = await Q.waitDone(page);
  const story = screen === 'moment' ? (await page.locator('.screen-moment [data-story]').textContent()).trim() : '';
  assert.ok(story.length > 10 || screen === 'summary', where + ': a story line');
  return { result: res, banner, screen, story, plan: cur.plan, events: (cur.events || []).map(e => e.kind) };
}

/** The live's plan + ball + QB now. */
function liveState(page) {
  return page.evaluate(() => {
    const v = RTG.UI.PlayView.current(), l = v && v.live();
    if (!l) return null;
    const p = l.plan();
    return { t: l.t, phase: l.phase, ball: !!l.ball, hasBall: l.qb.hasBall, runs: p.runs.length, pass: !!p.pass, away: p.away, qb: { x: l.qb.x, y: l.qb.y } };
  });
}

/** A press at client (x, y) and a short drag (mouse or CDP touch) → released. */
async function strayDrag(page, x, y, touch) {
  await Q.gesture(page, [{ x, y }, { x: x + 10, y: y - 20 }, { x: x + 20, y: y - 40 }], { touch, durationMs: 120 });
}

H.matrix(({ mode, vp }) => {
  test(`controls ${mode} ${vp}: throw away, the sack, invalid input, a cancelled draft, a scramble, the keys — a whole drive`, async () => {
    const app = await H.openDemo({ mode, viewport: vp, seed: 1717 });
    const { page } = app;
    const phone = vp === 'phone', touch = phone;
    try {
      await startWith(page, 'DUAL_THREAT', 'GREAT', 'HS');
      assert.equal((await Q.state(page)).drive.archetype, 'DUAL_THREAT');

      // 1 · THROW AWAY by its button (shown while a pass is legal)
      await readAndSnap(page, 'm1');
      const away = page.locator('.pv-btn-away');
      await away.waitFor({ state: 'visible', timeout: 4000 });
      if (phone) await away.tap(); else await away.click();
      const m1 = await finishMoment(page, 'm1');
      assert.equal(m1.result.outcome, 'THROWAWAY'); assert.equal(m1.result.yards, 0); assert.equal(m1.result.turnover, false);
      assert.match(m1.banner, /THROWN AWAY/);
      assert.ok(m1.plan && m1.plan.away !== null, 'm1: the plan logs the throw-away');
      assert.match(m1.story, /Thrown away/i, 'm1: the story says thrown away on third down');
      await Q.next(page);

      // 2 · the SACK: the QB just stands there; the RUSH meter fills
      await readAndSnap(page, 'm2');
      const rush = await page.evaluate(() => new Promise(resolve => {
        let max = 0;
        (function poll() {
          const v = RTG.UI.PlayView.current(), m = document.querySelector('.pv-pressure');
          if (m) max = Math.max(max, Number(m.getAttribute('aria-valuenow')) || 0);
          if (!v || v.phase() !== 'PLAY' || (v.live() && v.live().phase === 'DONE')) return resolve(max);
          requestAnimationFrame(poll);
        })();
      }));
      const m2 = await finishMoment(page, 'm2');
      assert.equal(m2.result.outcome, 'SACK', 'm2: nobody threw: the rush gets home (' + m2.result.outcome + ')');
      assert.ok(m2.result.yards < 0, 'm2: yards lost'); assert.equal(m2.result.feedback.timing, 'TOO LATE');
      assert.match(m2.banner, /SACKED -\d+/);
      assert.ok(rush >= 70, 'm2: the RUSH meter filled before the sack (' + rush + ')');
      assert.ok(m2.events.indexOf('SACK') >= 0, 'm2: the live logged the sack');
      await Q.next(page);

      // 3 · INVALID input does nothing: a press away from the QB, a tap on him; then a drawn scramble
      await readAndSnap(page, 'm3');
      const g = await Q.geometry(page);
      const qbp = await H.debug(page, 'qbPoint');
      await strayDrag(page, g.rect.x + g.rect.w * 0.5, g.rect.y + g.rect.h * 0.35, touch);
      await page.locator('.pv-toast').waitFor({ state: 'visible', timeout: 2000 });
      assert.match(await page.locator('.pv-toast').textContent(), /START ON THE QB/, 'm3: a press away from the QB is a stray');
      let ls = await liveState(page);
      assert.equal(ls.ball, false, 'm3: no ball after a stray'); assert.equal(ls.runs, 0, 'm3: no run after a stray');
      if (touch) await Q.touchTap(page, qbp.x, qbp.y); else await page.mouse.click(qbp.x, qbp.y);
      await Q.sleep(80);
      ls = await liveState(page);
      assert.equal(ls.ball, false, 'm3: a tap on the QB throws nothing'); assert.equal(ls.runs, 0, 'm3: a tap on the QB runs nowhere');
      assert.equal(await Q.drawing(page), null, 'm3: no draft left behind');
      const run3 = await Q.drawRun(page, 'scramble', { touch });
      assert.equal(run3.drawing && run3.drawing.kind, 'RUN', 'm3: the scramble line is a RUN (' + JSON.stringify({ target: run3.drawing && run3.drawing.target, loft: run3.drawing && run3.drawing.loft, t: run3.before && run3.before.t, end: run3.points[run3.points.length - 1], qb: run3.qbBefore }) + ')'); assert.ok(run3.ok, 'm3: the QB runs it');
      const m3 = await finishMoment(page, 'm3');
      assert.ok(m3.result.outcome === 'SCRAMBLE' || m3.result.outcome === 'SACK', 'm3: a scramble (or a sack behind the line): ' + m3.result.outcome);
      await Q.next(page);

      // 4 · a cancelled draft (touchcancel / Backspace) does nothing; then a drawn pass
      await readAndSnap(page, 'm4');
      const q4 = await H.debug(page, 'qbPoint');
      if (touch) {
        const cdp = await page.context().newCDPSession(page);
        const tp = (x, y) => ({ x, y, id: 1, radiusX: 2, radiusY: 2, force: 1 });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(q4.x, q4.y)] });
        for (let i = 1; i <= 4; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(q4.x + 12 * i, q4.y - 30 * i)] });
        assert.ok(await Q.drawing(page), 'm4: a draft while the finger is down');
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        await cdp.detach();
      } else {
        await page.mouse.move(q4.x, q4.y); await page.mouse.down();
        for (let i = 1; i <= 4; i++) await page.mouse.move(q4.x + 12 * i, q4.y - 30 * i);
        assert.ok(await Q.drawing(page), 'm4: a draft while the button is down');
        await page.keyboard.press('Backspace');
        await page.mouse.up();
      }
      await Q.sleep(80);
      ls = await liveState(page);
      assert.equal(await Q.drawing(page), null, 'm4: the cancelled draft is gone');
      assert.equal(ls.ball, false, 'm4: a cancelled draft throws nothing'); assert.equal(ls.runs, 0, 'm4: … and runs nowhere');
      const t4 = await Q.chooseTarget(page, { loft: 0.2, minT: 0 });
      if (t4 && t4.slot) {
        const p4 = await Q.drawPass(page, t4.slot, { speed: 'fast', touch });
        assert.equal(p4.drawing && p4.drawing.kind, 'PASS', 'm4: the drawn line is a PASS');
        assert.ok(p4.released, 'm4: the ball is out');
      }
      const m4 = await finishMoment(page, 'm4');
      assert.ok(['CATCH', 'INCOMPLETE', 'INT', 'DROP', 'SACK'].indexOf(m4.result.outcome) >= 0, 'm4: ' + m4.result.outcome);
      await Q.next(page);

      // 5 · the X key (desktop) / a drawn throw-away line out of bounds (phone)
      await readAndSnap(page, 'm5');
      if (!phone) { await Q.focusCanvas(page); await page.keyboard.press('x'); }
      else {
        const r5 = await Q.drawThrowAway(page, { touch });
        assert.equal(r5.drawing && r5.drawing.kind, 'THROWAWAY', 'm5: a line out of bounds nobody can reach is a THROW AWAY');
      }
      const m5 = await finishMoment(page, 'm5');
      assert.equal(m5.result.outcome, 'THROWAWAY', 'm5: thrown away');
      await Q.next(page);

      // 6 · a keyboard run (desktop: R, arrows, Enter) / a drawn scramble (phone) — the last play ends the drive
      await readAndSnap(page, 'm6');
      if (!phone) {
        const k6 = await Q.keyRun(page, { steps: ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp'] });
        assert.equal(k6.drawing && k6.drawing.mode, 'RUN', 'm6: R starts a RUN draft');
        assert.ok(k6.ok, 'm6: Enter commits the run');
      } else {
        const r6 = await Q.drawRun(page, 'scramble', { touch });
        assert.ok(r6.ok, 'm6: the QB runs the drawn line');
      }
      const m6 = await finishMoment(page, 'm6');
      assert.ok(m6.result.outcome === 'SCRAMBLE' || m6.result.outcome === 'SACK', 'm6: a scramble (or a sack): ' + m6.result.outcome);
      assert.equal(m6.screen, 'summary', 'the sixth result leads to the summary');

      const sum = await H.debug(page, 'summary');
      assert.equal(sum.line.att + sum.line.sacks + sum.line.rushes, 6, 'every moment is on the line (' + JSON.stringify(sum.line) + ')');
      assert.equal(sum.line.rushes, sum.results.filter(r => r.outcome === 'SCRAMBLE').length, 'each scramble is a rush');
      assert.ok(sum.line.sacks >= 1, 'the sack is on the line');
      assert.ok(sum.line.att >= 2, 'the two throw-aways are attempts');
      if (phone) await H.noHorizontalScroll(page, 'summary');
      noErrors(app, 'drive');
    } finally { await app.close(); }
  });
});

test('controls file desktop: slow motion engages while drawing — the clock crawls, the chip and the band show — and the per-play budget runs out', async () => {
  const app = await H.openDemo({ mode: 'file', viewport: 'desktop', seed: 2718 });
  const { page } = app;
  try {
    const D = await page.evaluate(() => ({ slowMo: RTG.Tuning.qb.draw.slowMo, budget: RTG.Tuning.qb.draw.slowMoBudgetS }));
    assert.ok(D.slowMo > 0 && D.slowMo < 0.5, 'Tuning.qb.draw.slowMo ' + D.slowMo);
    await H.debug(page, 'tune', 'qb.draw.slowMoBudgetS', 1.2);                 // a short budget keeps the test quick
    await startWith(page, 'SURGEON', 'GREAT', 'COLLEGE');
    await readAndSnap(page, 'slow');
    assert.equal(await H.debug(page, 'timeScale'), 1, 'full speed before a finger is down');
    const q = await H.debug(page, 'qbPoint');
    await page.mouse.move(q.x, q.y); await page.mouse.down();
    for (let i = 1; i <= 5; i++) await page.mouse.move(q.x + 6 * i, q.y - 8 * i);      // a draft (a short run line) — still drawing
    await Q.sleep(120);
    const a = await Q.draftNow(page);
    assert.ok(a.drawing, 'a draft exists');
    assert.ok(Math.abs(a.timeScale - D.slowMo) < 1e-6, 'timeScale = slowMo while drawing (' + a.timeScale + ')');
    assert.equal(a.slow.hidden, false, 'the SLOW-MO chip shows'); assert.equal(a.slow.active, '1'); assert.equal(a.slow.out, false);
    assert.equal(a.stageSlow, true, 'the stage wears the slow-motion band');
    const t0 = a.t, w0 = Date.now();
    await Q.sleep(400);
    const b = await Q.draftNow(page);
    const rate = (b.t - t0) / ((Date.now() - w0) / 1000);
    assert.ok(rate > D.slowMo * 0.4 && rate < D.slowMo * 2.2, 'the play clock crawls at about slowMo (' + rate.toFixed(3) + ' sim-s per s)');
    assert.ok(b.slow.pct < 100, 'the budget bar drains (' + b.slow.pct + '%)');
    // hold past the budget: time returns to full speed and the chip says so
    await page.waitForFunction(() => { const v = RTG.UI.PlayView.current(); return !!v && v.timeScale() === 1; }, null, { timeout: 4000 });
    const c = await Q.draftNow(page);
    assert.ok(c.drawing, 'still drawing after the budget');
    assert.equal(c.timeScale, 1, 'full speed once the budget is spent');
    assert.equal(c.slow.out, true, 'the chip says SLOW-MO OUT');
    assert.match(await page.locator('.pv-slowmo').textContent(), /OUT/);
    assert.equal(c.stageSlow, false, 'no slow band at full speed');
    await page.keyboard.press('Backspace');                                   // cancel the draft (the finger owns it; only Backspace cancels)
    await page.mouse.up();
    const ls = await liveState(page);
    assert.equal(ls.runs, 0, 'the cancelled draft ran nowhere');
    // a second draft in the same play: the budget stays spent
    if (ls.hasBall && ls.phase === 'PRE_THROW') {
      const q2 = await H.debug(page, 'qbPoint');
      await page.mouse.move(q2.x, q2.y); await page.mouse.down();
      for (let i = 1; i <= 3; i++) await page.mouse.move(q2.x - 6 * i, q2.y - 8 * i);
      await Q.sleep(80);
      const d = await Q.draftNow(page);
      if (d.drawing) assert.equal(d.timeScale, 1, 'the budget is per play: no slow motion left');
      await page.keyboard.press('Backspace'); await page.mouse.up();
    }
    await finishMoment(page, 'slow');
    // the next play gets a fresh budget
    await Q.next(page);
    await readAndSnap(page, 'slow 2');
    const q3 = await H.debug(page, 'qbPoint');
    await page.mouse.move(q3.x, q3.y); await page.mouse.down();
    for (let i = 1; i <= 3; i++) await page.mouse.move(q3.x + 6 * i, q3.y - 8 * i);
    await Q.sleep(80);
    assert.ok(Math.abs((await Q.draftNow(page)).timeScale - D.slowMo) < 1e-6, 'a new play, a new slow-motion budget');
    await page.keyboard.press('Backspace'); await page.mouse.up();
    noErrors(app, 'slow motion');
  } finally { await app.close(); }
});

test('controls file desktop: INVALID lines do nothing — strays, taps, garbage through the debug hands, no second throw', async () => {
  const app = await H.openDemo({ mode: 'file', viewport: 'desktop', seed: 3141 });
  const { page } = app;
  try {
    await startWith(page, 'GUNSLINGER', 'GREAT', 'COLLEGE');
    await readAndSnap(page, 'invalid');
    // garbage through the engine's classify and the debug hands: INVALID / {ok: false}, never a throw
    const garbage = await page.evaluate(() => {
      const out = {};
      const cls = (pts, loft) => { const c = RTG.debug.classify(pts, loft); return c ? c.kind : null; };
      out.empty = cls([], 0.5); out.one = cls([{ x: 0, y: -5 }], 0.5); out.nan = cls([{ x: NaN, y: 1 }, { x: 'a', y: null }], 0.5);
      out.str = cls('nope', 'x'); out.farStart = cls([{ x: 20, y: 20 }, { x: 25, y: 30 }], 0.5);
      const l = RTG.UI.PlayView.current().live();
      out.short = cls([{ x: l.qb.x, y: l.qb.y }, { x: l.qb.x + 0.5, y: l.qb.y }], 0.5);
      out.run = RTG.debug.drawRun([{ x: l.qb.x + 0.3, y: l.qb.y }]);
      out.passNaN = RTG.UI.PlayView.current().commitPass([{ x: NaN, y: NaN }, { x: NaN, y: 3 }], NaN);
      return out;
    });
    for (const k of ['empty', 'one', 'nan', 'str', 'farStart', 'short']) assert.equal(garbage[k], 'INVALID', 'classify(' + k + ') is INVALID');
    assert.equal(garbage.run.ok, false, 'a 0.3-yd run is refused');
    assert.equal(garbage.passNaN.ok, false, 'a NaN pass is refused');
    let ls = await liveState(page);
    assert.equal(ls.ball, false, 'no ball after garbage'); assert.equal(ls.runs, 0); assert.equal(ls.hasBall, true);
    // a press on the far field is a stray (the toast), a tap on the QB is nothing
    const g = await Q.geometry(page);
    await strayDrag(page, g.rect.x + g.rect.w * 0.8, g.rect.y + g.rect.h * 0.4, false);
    await page.locator('.pv-toast').waitFor({ state: 'visible', timeout: 2000 });
    assert.match(await page.locator('.pv-toast').textContent(), /START ON THE QB/);
    const q = await H.debug(page, 'qbPoint');
    await page.mouse.click(q.x, q.y);
    await Q.sleep(60);
    ls = await liveState(page);
    assert.equal(ls.ball, false); assert.equal(ls.runs, 0); assert.equal(await Q.drawing(page), null, 'no draft from a tap');
    // throw once; a second line after the release does nothing
    const tgt = await Q.chooseTarget(page, { loft: 0.3, minT: 0.4 });
    assert.ok(tgt && tgt.slot);
    const p = await Q.drawPass(page, tgt.slot, { speed: 'fast' });
    assert.ok(p.released, 'the first line throws');
    const before = await liveState(page);
    const second = await page.evaluate(() => { const v = RTG.UI.PlayView.current(); return { canDraw: v.canDraw ? v.canDraw() : null, pass: v.commitPass([{ x: 0, y: -5 }, { x: 5, y: 10 }], 0.5), away: v.throwAway() }; });
    assert.equal(second.canDraw, false, 'no drawing once the ball is out');
    assert.equal(second.pass.ok, false, 'no second pass'); assert.equal(second.away.ok, false, 'no throw-away after the release');
    const q2 = await H.debug(page, 'qbPoint');
    if (q2) await strayDrag(page, q2.x, q2.y, false);
    const after2 = await liveState(page);
    if (after2) { assert.equal(after2.runs, before.runs, 'no run after the release'); assert.equal(after2.pass, true); }
    await finishMoment(page, 'invalid');
    noErrors(app, 'invalid');
  } finally { await app.close(); }
});

test('controls file desktop: the pass preview colour shows only for a FIELD GENERAL (IQ ≥ previewIq); everyone sees PASS and the target', async () => {
  async function previewFor(arch) {
    const app = await H.openDemo({ mode: 'file', viewport: 'desktop', seed: 1618 });
    const { page } = app;
    try {
      await startWith(page, arch, 'AVERAGE', 'COLLEGE');
      const iq = await page.evaluate(a => ({ iq: RTG.Tuning.qb.archetypes[a].IQ, need: RTG.Tuning.qb.draw.previewIq }), arch);
      await readAndSnap(page, arch);
      const tgt = await Q.chooseTarget(page, { loft: 0.5, minT: 0.6 });
      assert.ok(tgt && tgt.slot, arch + ': a receiver can be reached');
      const r = await Q.drawPass(page, tgt.slot, { speed: 'slow' });
      await finishMoment(page, arch);
      noErrors(app, 'preview ' + arch);
      return { iq, drawing: r.drawing, chip: r.before && r.before.chip };
    } finally { await app.close(); }
  }
  const fg = await previewFor('FIELD_GENERAL'), gs = await previewFor('GUNSLINGER');
  assert.ok(fg.iq.iq >= fg.iq.need && gs.iq.iq < gs.iq.need, 'the archetypes straddle previewIq (' + fg.iq.iq + ' / ' + gs.iq.iq + ' vs ' + fg.iq.need + ')');
  assert.equal(fg.drawing.kind, 'PASS'); assert.equal(gs.drawing.kind, 'PASS');
  assert.equal(fg.drawing.previewShown, true, 'the FIELD GENERAL sees the preview');
  assert.match(String(fg.chip.preview), /^(GREEN|GOLD|RED)$/, 'the draft chip carries the colour (' + fg.chip.preview + ')');
  assert.equal(gs.drawing.previewShown, false, 'the GUNSLINGER does not');
  assert.equal(gs.chip.preview, null, 'no colour on his chip');
  assert.match(gs.chip.text, /PASS → (WR1|WR2|SLOT|TE|RB)/, 'but he sees PASS and the target (' + gs.chip.text + ')');
});

test('controls file desktop: aim assist — on, a line ending near the receiver\'s spot snaps onto it; off, it stays where the finger left it', async () => {
  async function assisted(on) {
    const app = await H.openDemo({ mode: 'file', viewport: 'desktop', seed: 5150 });
    const { page } = app;
    try {
      if (!on) await H.debug(page, 'setSettings', { aimAssist: false });
      await startWith(page, 'SURGEON', 'GREAT', 'COLLEGE');
      await readAndSnap(page, 'assist ' + on);
      const tgt = await Q.chooseTarget(page, { loft: 0.1, minT: 0.6 });
      assert.ok(tgt && tgt.slot);
      const r = await Q.drawPass(page, tgt.slot, { speed: 'fast', offsetYd: { x: 1.3, y: 0.6 } });
      const out = { slot: tgt.slot, drawing: r.drawing, chip: r.before && r.before.chip, ball: r.ball, end: r.end };
      await finishMoment(page, 'assist ' + on);
      noErrors(app, 'assist ' + on);
      return out;
    } finally { await app.close(); }
  }
  const on = await assisted(true), off = await assisted(false);
  assert.equal(on.drawing.kind, 'PASS'); assert.equal(on.drawing.target, on.slot);
  assert.equal(on.drawing.assisted, true, 'aim assist snapped the end (' + JSON.stringify({ kind: on.drawing.kind, target: on.drawing.target }) + ')');
  assert.equal(on.chip.assist, '1', 'the draft chip marks the magnet');
  assert.equal(off.drawing.assisted, false, 'no snap with aim assist off');
  assert.equal(off.chip.assist, '0');
  if (on.ball && off.ball) {
    const endOf = b => b.drawn[b.drawn.length - 1];
    const dOn = Math.hypot(endOf(on.ball).x - on.end.x, endOf(on.ball).y - on.end.y), dOff = Math.hypot(endOf(off.ball).x - off.end.x, endOf(off.ball).y - off.end.y);
    assert.ok(dOn > dOff, 'the assisted line left the finger\'s end (' + dOn.toFixed(2) + ' yd) more than the free one (' + dOff.toFixed(2) + ' yd)');
  }
});

test('controls file desktop: keyboard composing — Enter starts and reads, a number picks, 1–5 aim, L lofts, arrows nudge, Q / E bend, Backspace cancels, R runs, Enter throws, Space skips, Enter is NEXT, X throws away', async () => {
  const app = await H.openDemo({ mode: 'file', viewport: 'desktop', seed: 2024 });
  const { page } = app;
  try {
    await H.waitForScreen(page, 'title');
    await page.keyboard.press('Enter');                                   // START THE DRIVE from the body
    await H.waitForScreen(page, 'moment');
    await H.waitPhase(page, 'SITUATION');
    const armMs = await page.evaluate(() => RTG.UI.PlayView.TIMING.armMs || 0);
    await Q.sleep(armMs + 80);
    await page.keyboard.press('Enter');                                   // TAP TO READ (focused) / the confirm key
    await H.waitPhase(page, 'READ');
    const list = await Q.cards(page);
    const card = list.find(c => !c.run && c.advice === 'GOOD') || list.find(c => !c.run) || list[0];
    await Q.sleep(armMs + 80);
    await page.keyboard.press(String(card.idx + 1));                       // the card's number
    await H.waitPhase(page, 'PLAY');
    await Q.waitCanDraw(page);
    await Q.focusCanvas(page);
    // Enter with nothing drawn: the hint, no throw
    await page.keyboard.press('Enter');
    await page.locator('.pv-toast').waitFor({ state: 'visible', timeout: 2000 });
    assert.equal(await Q.drawing(page), null, 'nothing drawn');
    assert.equal((await liveState(page)).ball, false, 'Enter alone throws nothing');
    // 1 → a straight PASS draft to WR1, composing in slow motion
    await page.keyboard.press('1');
    await page.waitForFunction(() => { const d = RTG.UI.PlayView.current().drawing(); return !!d && d.mode === 'PASS' && d.source === 'key' && d.points.length >= 2; }, null, { timeout: 2000 });
    await Q.sleep(80);                                                     // the scene applies the time scale on its next frame
    const d0 = await Q.draftNow(page);
    assert.ok(d0.timeScale < 1, 'slow motion while composing (' + d0.timeScale + ')');
    assert.equal(d0.drawing.touch, 'TOUCH', 'the keyboard starts on TOUCH');
    // L cycles TOUCH → LOB → BULLET → TOUCH
    const lofts = [];
    for (let i = 0; i < 3; i++) { await page.keyboard.press('l'); await Q.sleep(40); lofts.push((await Q.drawing(page)).touch); }
    assert.deepEqual(lofts, ['LOB', 'BULLET', 'TOUCH'], 'L cycles the touch');
    // the arrows nudge the end 1 yd (measured against the engine's spot for WR1 at the same instant)
    const offset = () => page.evaluate(() => { const v = RTG.UI.PlayView.current(), d = v.drawing(), a = v.live().aim('WR1', d.loft); const e = d.points[d.points.length - 1]; return a ? { x: e.x - a.x, y: e.y - a.y } : null; });
    const o0 = await offset();
    await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowRight');
    await Q.sleep(60);
    const o1 = await offset();
    if (o0 && o1) {
      assert.ok(Math.abs(o1.y - o0.y - 1) < 0.35, 'ArrowUp moves the end 1 yd downfield (' + (o1.y - o0.y).toFixed(2) + ')');
      assert.ok(Math.abs(o1.x - o0.x - 1) < 0.35, 'ArrowRight moves it 1 yd right (' + (o1.x - o0.x).toFixed(2) + ')');
    }
    // E bends the line to the right of its direction, Q back
    await page.keyboard.press('e'); await page.keyboard.press('e'); await page.keyboard.press('e');
    await Q.sleep(60);
    const bentPts = (await Q.drawing(page)).points;
    const a = bentPts[0], b = bentPts[bentPts.length - 1];
    let dev = 0;
    for (const p of bentPts) { const cr = ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / (Math.hypot(b.x - a.x, b.y - a.y) || 1); if (Math.abs(cr) > Math.abs(dev)) dev = cr; }
    assert.ok(dev < -0.5, 'E bends the line to the right of its direction (' + dev.toFixed(2) + ' yd)');
    // Backspace cancels
    await page.keyboard.press('Backspace');
    await Q.sleep(40);
    assert.equal(await Q.drawing(page), null, 'Backspace drops the draft');
    // R → a RUN draft; the arrows steer it; Backspace
    await page.keyboard.press('r');
    await page.waitForFunction(() => { const d = RTG.UI.PlayView.current().drawing(); return !!d && d.mode === 'RUN' && d.points.length >= 2; }, null, { timeout: 2000 });
    const r0 = (await Q.drawing(page)).points;
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
    await Q.sleep(60);
    const r1 = (await Q.drawing(page)).points;
    assert.ok(r1[r1.length - 1].x - r0[r0.length - 1].x < -1.2, 'the arrows steer the run');
    await page.keyboard.press('Backspace');
    assert.equal((await liveState(page)).runs, 0, 'the cancelled run did not run');
    // the throw: the best receiver's number key, Enter
    const tgt = await Q.chooseTarget(page, { loft: 0.5, minT: 0.5 });
    assert.ok(tgt && tgt.slot);
    const kp = await Q.keyPass(page, tgt.slot, { touch: 'BULLET' });
    assert.equal(kp.drawing.kind, 'PASS'); assert.equal(kp.drawing.target, tgt.slot); assert.equal(kp.drawing.touch, 'BULLET');
    assert.ok(kp.released, 'Enter throws'); assert.equal(kp.ball.target, tgt.slot); assert.ok(kp.ball.loft < 1 / 3, 'a keyboard bullet');
    // Space skips the flight once the ball is out, Space skips the result, Enter is NEXT
    await Q.sleep(await page.evaluate(() => RTG.UI.PlayView.TIMING.skipAfterMs + 60));
    await page.keyboard.press('Space');
    await Q.waitResult(page);
    await Q.sleep(350);
    await page.keyboard.press('Space');
    await Q.waitDone(page);
    assert.equal(await page.evaluate(() => document.querySelector('.screen-moment').getAttribute('data-stage')), 'story');
    await page.keyboard.press('Enter');
    await H.waitPhase(page, 'SITUATION');
    assert.equal((await Q.state(page)).drive.idx, 1, 'the second moment is armed');
    // moment 2: X throws it away
    await readAndSnap(page, 'keys m2');
    await Q.focusCanvas(page);
    await page.keyboard.press('x');
    const m2 = await finishMoment(page, 'keys m2');
    assert.equal(m2.result.outcome, 'THROWAWAY', 'X throws it away');
    noErrors(app, 'keyboard');
  } finally { await app.close(); }
});

test('controls file desktop: reduced motion — the OS hint and the setting drop the align beat and shorten the beats; slow motion still works', async () => {
  const app = await H.openDemo({ mode: 'file', viewport: 'desktop', seed: 55, reducedMotion: 'reduce' });
  const { page } = app;
  try {
    assert.equal(await page.evaluate(() => RTG.UI.app.reducedMotion()), true, 'prefers-reduced-motion is honoured');
    await startWith(page, 'SURGEON', 'GREAT', 'NFL');
    await H.waitPhase(page, 'SITUATION');
    await Q.tapToRead(page);
    const list = await Q.cards(page);
    const card = list.find(c => !c.run) || list[0];
    await Q.pickPlay(page, card.idx);
    await Q.sleep(150);
    assert.ok((await Q.current(page)).t > 0.05, 'no align beat: the play clock runs at once');
    await Q.waitCanDraw(page);
    const tgt = await Q.chooseTarget(page, { loft: 0.3, minT: 0.6 });
    assert.ok(tgt && tgt.slot);
    const r = await Q.drawPass(page, tgt.slot, { speed: 'fast' });
    assert.ok(r.mid && r.mid.timeScale < 1, 'slow motion is gameplay, not decoration: it still engages');
    await Q.waitResult(page);
    assert.equal(await page.locator('.pv-skip').isHidden(), true, 'no TAP TO SKIP hint under reduced motion');
    const t1 = Date.now();
    await Q.waitDone(page);
    assert.ok(Date.now() - t1 < 1000, 'the result beat is the reduced one (' + (Date.now() - t1) + ' ms)');
    noErrors(app, 'reduced (OS)');
  } finally { await app.close(); }

  const app2 = await H.openDemo({ mode: 'file', viewport: 'desktop', seed: 56 });
  const p2 = app2.page;
  try {
    assert.equal(await p2.evaluate(() => RTG.UI.app.reducedMotion()), false);
    await H.debug(p2, 'setSettings', { reducedMotion: true });
    assert.equal(await p2.evaluate(() => document.body.classList.contains('reduced-motion')), true, 'the body class follows the setting');
    await startWith(p2, 'GUNSLINGER', 'AVERAGE', 'COLLEGE');
    await H.waitPhase(p2, 'SITUATION');
    await Q.tapToRead(p2);
    const list = await Q.cards(p2);
    await Q.pickPlay(p2, (list.find(c => !c.run) || list[0]).idx);
    await Q.sleep(150);
    assert.ok((await Q.current(p2)).t > 0.05, 'the setting drops the align beat too');
    await H.debug(p2, 'forceResult', 'CATCH');
    const t2 = Date.now();
    await Q.waitDone(p2);
    assert.ok(Date.now() - t2 < 1200, 'a forced catch is through its reduced beats quickly (' + (Date.now() - t2) + ' ms)');
    noErrors(app2, 'reduced (setting)');
  } finally { await app2.close(); }
});

test('controls file desktop: the same ?seed twice reproduces the situations, the read and the snap\'s cast; another seed differs', async () => {
  async function firstSim(seed) {
    const app = await H.openDemo({ mode: 'file', viewport: 'desktop', seed });
    try {
      await startWith(app.page, 'FIELD_GENERAL', 'AVERAGE', 'COLLEGE');
      const st = await Q.state(app.page);
      await Q.tapToRead(app.page);
      const cur0 = await Q.current(app.page);
      await Q.pickPlay(app.page, 0);
      const cur = await Q.current(app.page);
      const sim = cur.sim;
      noErrors(app, 'seed ' + seed);
      return {
        script: JSON.stringify(st.script), weather: JSON.stringify(st.drive.weather),
        real: cur0.ctx.real, shown: cur0.ctx.shown, cards: cur0.ctx.options.map(o => o.id + '=' + o.advice), revealAt: cur0.ctx.revealAt,
        alignment: JSON.stringify(cur0.ctx.alignment), sackAt: cur0.ctx.pressure && cur0.ctx.pressure.sackAt,
        sim: sim.run ? JSON.stringify(sim) : JSON.stringify({ playId: sim.playId, fit: sim.fit, sackAt: sim.sackAt, hot: sim.hot, checkdown: sim.checkdown,
          receivers: sim.receivers.map(r => [r.slot, r.route, r.x0, r.y0, JSON.stringify(r.ghost)].join(':')),
          defenders: sim.defenders.map(d => [d.id, d.pos, d.role, d.man, d.react, d.trail, d.cushion].join(':')), rushers: sim.rushers })
      };
    } finally { await app.close(); }
  }
  const a = await firstSim(31337), b = await firstSim(31337), c = await firstSim(31338);
  assert.deepEqual(a, b, 'seed 31337 twice: the same situations, read and cast');
  assert.notDeepEqual(a, c, 'a different seed differs');
});

test('controls file narrow (320 px): no horizontal scroll in SITUATION, READ, PLAY, mid-draw, flight, RESULT, the story and the summary', async () => {
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
    await Q.waitCanDraw(page);
    await H.noHorizontalScroll(page, 'play 320');
    const tgt = await Q.chooseTarget(page, { loft: 0.9, minT: 0.6 });
    assert.ok(tgt && tgt.slot);
    const r = await Q.drawPass(page, tgt.slot, { speed: 'slow', touch: true, onMid: async () => { await H.noHorizontalScroll(page, 'drawing 320'); } });
    if (r.released) await H.noHorizontalScroll(page, 'flight 320');
    await Q.waitResult(page);
    await H.noHorizontalScroll(page, 'result 320');
    await Q.skipResult(page);
    await Q.waitDone(page);
    await H.noHorizontalScroll(page, 'story 320');
    await H.debug(page, 'skipTo', 'summary');
    await H.waitForScreen(page, 'summary');
    await H.noHorizontalScroll(page, 'summary 320');
    noErrors(app, 'narrow');
  } finally { await app.close(); }
});

test('controls http desktop: the frame p95 stays under ' + FRAME_P95_BUDGET_MS + ' ms while drawing and while the ball is in the air', async () => {
  const app = await H.openDemo({ mode: 'http', viewport: 'desktop', seed: 4242 });
  const { page } = app;
  try {
    await startWith(page, 'GUNSLINGER', 'AVERAGE', 'NFL');
    await readAndSnap(page, 'perf');
    // sample the loop's p95 (the canvas keeps the last 120 frame costs) by window: drawing / the ball in the air
    await page.evaluate(() => {
      const out = window.__perf = { drawP95: 0, flightP95: 0, drawSamples: 0, flightSamples: 0, frames0: RTG.UI.PlayView.current().cv.stats.frames, done: false };
      (function poll() {
        const v = RTG.UI.PlayView.current();
        if (!v || v.phase() === 'RESULT' || v.phase() === 'DONE') { out.frames1 = v ? v.cv.stats.frames : out.frames0; out.done = true; return; }
        const l = v.live(), p95 = v.cv.p95();
        if (v.drawing && v.drawing()) { out.drawSamples++; out.drawP95 = Math.max(out.drawP95, p95); }
        if (l && l.phase === 'BALL_IN_AIR') { out.flightSamples++; out.flightP95 = Math.max(out.flightP95, p95); }
        out.fps = v.cv.stats.fps || out.fps;
        setTimeout(poll, 40);
      })();
    });
    const tgt = await Q.chooseTarget(page, { loft: 0.9, minT: 0.7 });
    assert.ok(tgt && tgt.slot);
    const r = await Q.drawPass(page, tgt.slot, { speed: 'slow', durationMs: 1400 });     // a long stroke: many frames of drawing
    await Q.waitResult(page);
    await page.waitForFunction(() => window.__perf.done, null, { timeout: 5000 });
    const perf = await page.evaluate(() => window.__perf);
    console.log('  frame p95 max: drawing ' + perf.drawP95 + ' ms (' + perf.drawSamples + ' samples) · flight ' + perf.flightP95 + ' ms (' + perf.flightSamples + ') over ' + (perf.frames1 - perf.frames0) + ' frames, fps ' + perf.fps);
    assert.ok(perf.frames1 - perf.frames0 > 30, 'the loop ran during the play');
    assert.ok(perf.drawSamples > 5, 'sampled while drawing');
    assert.ok(perf.drawP95 < FRAME_P95_BUDGET_MS, 'frame p95 while drawing ' + perf.drawP95 + ' ms < ' + FRAME_P95_BUDGET_MS);
    if (r.released) assert.ok(perf.flightP95 < FRAME_P95_BUDGET_MS, 'frame p95 in flight ' + perf.flightP95 + ' ms < ' + FRAME_P95_BUDGET_MS);
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

test('controls file phone: forced INT and DROP beats, then the SNEAK card on short yardage runs without a line and lands on the line as a rush', async () => {
  const app = await H.openDemo({ mode: 'file', viewport: 'phone', seed: 606 });
  const { page } = app;
  try {
    await startWith(page, 'FIELD_GENERAL', 'AVERAGE', 'COLLEGE');
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
    const cur = await Q.current(page);
    assert.equal(cur.sim && cur.sim.run, true, 'the sim is the result');
    const m4 = await finishMoment(page, 'moment 4');
    assert.equal(m4.result.outcome, 'RUN'); assert.equal(m4.result.playId, 'SNEAK');
    assert.match(m4.banner, /SNEAK [+-]\d+|STUFFED|FIRST DOWN|TOUCHDOWN/);
    const st4 = await Q.state(page);
    assert.equal(st4.line.rushes, 1, 'the sneak is a rush on the line');
    assert.equal(st4.results[3].outcome, 'RUN'); assert.equal(st4.results[3].play, 'SNEAK');
    assert.equal(st4.results[3].plan, null, 'a run card has no drawn plan');
    assert.equal(st4.line.att, 3, 'not an attempt');
    noErrors(app, 'run card');
  } finally { await app.close(); }
});
