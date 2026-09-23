/**
 * Shared helpers for the QB moment specs: drive the title picks, the situation card, the play cards, the receiver
 * tap and the aim-then-hold throw meter with a COMPUTED hold time (like the kicker's kick helpers), the interstitial
 * and the summary. Everything reads the live scene through RTG.UI.PlayView.current() / RTG.debug.
 *
 *   const Q = require('./_playhelpers');
 *   await Q.pickArchetype(page, 'GUNSLINGER') · Q.pickTeam(page, 'AVERAGE') · Q.pickVenue(page, 'COLLEGE')
 *   await Q.startDrive(page)                       → START THE DRIVE, waits for screen 'moment' + phase SITUATION
 *   await Q.tapToRead(page)                        → TAP TO READ → phase READ
 *   await Q.cards(page)                            → [{idx, id, name, advice, tags, run}] from the DOM
 *   await Q.pickPlay(page, idx)                    → click a card → the phase reached ('SNAP' | 'RUN' | 'RESULT' …)
 *   await Q.pickFirstGood(page)                    → the first GOOD pass card (else the first pass card)
 *   await Q.chooseTarget(page)                     → {slot, releaseAt, peak, …} the most open receiver whose window the pocket allows
 *   await Q.tapReceiver(page, slot, {touch})       → tap the receiver sprite (mouse, or CDP touch) → phase THROW
 *   await Q.holdRelease(page, {touch, lead, loft, releaseAt}) → press / hold until the bar is mid-green, drag for lead / loft, let go
 *   await Q.keyThrow(page, {slot, lead, loft})     → the keyboard path: 1–5 pick · Space held · arrows · Space up
 *   await Q.waitResult(page) · Q.waitDone(page)    → phase RESULT / the interstitial (data-stage="story") or the summary
 *   await Q.next(page)                             → NEXT on the interstitial → phase SITUATION (or the summary)
 *   await Q.playMoment(page, opts)                 → one whole moment: read → pick → target → throw → result → the story
 *   await Q.geometry(page)                         → {rect, scale, w, h, actors}
 *   await Q.current(page) / Q.state(page)          → RTG.debug.current() / state()
 */
'use strict';
const H = require('./_harness');

const HOLD_WAIT_MS = 3000;

function current(page) { return H.debug(page, 'current'); }
function state(page) { return H.debug(page, 'state'); }
function phase(page) { return page.evaluate(() => { const v = RTG.UI.PlayView.current(); return v ? v.phase() : null; }); }

// ─────────────────────────── title ───────────────────────────

async function pickArchetype(page, id) {
  await page.locator('.arch-card[data-arch="' + id + '"]').click();
  H.assert.equal(await page.locator('.arch-card[data-arch="' + id + '"]').getAttribute('aria-checked'), 'true', 'archetype ' + id + ' selected');
}
async function pickTeam(page, id) {
  await page.locator('[data-team="' + id + '"]').click();
  H.assert.equal(await page.locator('[data-team="' + id + '"]').getAttribute('aria-checked'), 'true', 'team ' + id + ' selected');
}
async function pickVenue(page, id) {
  await page.locator('[data-venue="' + id + '"]').click();
  H.assert.equal(await page.locator('[data-venue="' + id + '"]').getAttribute('aria-checked'), 'true', 'venue ' + id + ' selected');
}
async function startDrive(page) {
  await H.clickButton(page, 'START THE DRIVE');
  await H.waitForScreen(page, 'moment');
  await H.waitPhase(page, 'SITUATION');
}

// ─────────────────────────── the situation / the read ───────────────────────────

async function tapToRead(page) {
  await page.locator('.pv-situation .pv-go').click();
  await H.waitPhase(page, 'READ');
}

/** The play cards as the DOM shows them. */
function cards(page) {
  return page.$$eval('.pv-card', els => els.map((b, i) => ({
    idx: Number(b.getAttribute('data-idx') || i), id: b.getAttribute('data-play'),
    name: (b.querySelector('.pv-card-name') || {}).textContent || '',
    advice: ((b.querySelector('.pv-advice') || {}).textContent || '').trim(),
    tags: Array.from(b.querySelectorAll('.pv-tag')).map(t => t.textContent),
    run: b.getAttribute('data-play') === 'SNEAK' || b.getAttribute('data-play') === 'DRAW'
  })));
}

/** Click a card; resolves with the phase reached (SNAP for a pass play; a run option goes RUN → RESULT on its own). */
async function pickPlay(page, idx) {
  await page.locator('.pv-card[data-idx="' + idx + '"]').click();
  await page.waitForFunction(() => { const v = RTG.UI.PlayView.current(); const p = v && v.phase(); return p === 'SNAP' || p === 'THROW' || p === 'RUN' || p === 'RESULT' || p === 'DONE'; }, null, { timeout: 5000 });
  return phase(page);
}

/** The card a sensible player picks: the first GOOD pass card, else the first OK one, else the first pass card, else card 0. */
function bestCard(list) {
  return list.find(c => c.advice === 'GOOD' && !c.run) || list.find(c => c.advice === 'OK' && !c.run) || list.find(c => !c.run) || list[0];
}

/** Pick bestCard(cards) → {card, phase, cards}. */
async function pickFirstGood(page) {
  const list = await cards(page);
  const pick = bestCard(list);
  const ph = await pickPlay(page, pick.idx);
  return { card: pick, phase: ph, cards: list };
}

// ─────────────────────────── the throw ───────────────────────────

/** Canvas geometry + the actors in css px relative to the canvas element. */
function geometry(page) {
  return page.evaluate(() => {
    const v = RTG.UI.PlayView.current();
    const r = v.canvas.getBoundingClientRect();
    const a = v.actors();
    return { rect: { x: r.x, y: r.y, w: r.width, h: r.height }, scale: v.cv.scale, w: v.cv.w, h: v.cv.h, landscape: v.cv.landscape, actors: a, t: v.current().t, phase: v.phase() };
  });
}

/**
 * The receiver to throw to: the most open (window.peak) among those whose release peak comes before the pocket
 * folds (sackAt − margin); else the checkdown; else the first. Returns {slot, releaseAt, peak, name, route}.
 */
async function chooseTarget(page, opts) {
  opts = opts || {};
  const cur = await current(page);
  const sim = cur.sim;
  if (!sim || !sim.receivers || !sim.receivers.length) throw new Error('chooseTarget: no sim / receivers (phase ' + cur.phase + ')');
  const margin = opts.margin === undefined ? 0.35 : opts.margin;
  const limit = (sim.sackAt || 3) - margin;
  const ok = sim.receivers.filter(r => r.release && r.release.peakAt <= limit);
  let best = null;
  for (const r of ok) if (!best || (r.window && best.window && r.window.peak > best.window.peak) || (r.peak > best.peak)) best = r;
  if (!best) best = sim.receivers.find(r => r.slot === sim.checkdown) || sim.receivers[0];
  const ideal = await page.evaluate(id => { const r = RTG.Data.plays.routes[id]; return r ? r.ideal : { lead: 0, loft: 0.5 }; }, best.route);
  return { slot: best.slot, name: best.name, route: best.route, peak: best.window ? best.window.peak : best.peak, releaseAt: best.release ? best.release.peakAt : 1, sackAt: sim.sackAt, hot: best.hot, checkdown: best.checkdown, ideal: ideal };
}

/** One CDP touch tap (touchStart + touchEnd) at a client point. */
async function touchTap(page, x, y) {
  const cdp = await page.context().newCDPSession(page);
  const tp = { x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** Tap a receiver by slot (the scene's generous hit test does the rest) → phase THROW. */
async function tapReceiver(page, slot, opts) {
  opts = opts || {};
  const g = await geometry(page);
  const a = g.actors.receivers.find(r => r.slot === slot);
  if (!a) throw new Error('tapReceiver: no receiver ' + slot);
  const x = g.rect.x + a.x, y = g.rect.y + a.y;
  if (opts.touch) await touchTap(page, x, y);
  else await page.mouse.click(x, y);
  await page.waitForFunction(s => { const v = RTG.UI.PlayView.current(); return !!v && v.phase() === 'THROW' && v.current().target === s; }, slot, { timeout: 3000 });
  return { x, y, geometry: g };
}

/** A point on the canvas with no receiver near it: the bottom corner on the near side (the line is the widest band). */
function safePoint(g) {
  return { x: g.rect.x + 6, y: g.rect.y + g.rect.h - 6 };
}

/** Wait for the scene's play clock to reach t seconds (the hold should end near the receiver's release peak). */
async function waitPlayTime(page, t, timeout) {
  await page.waitForFunction(tt => { const v = RTG.UI.PlayView.current(); return !v || v.phase() !== 'SNAP' && v.phase() !== 'THROW' || v.current().t >= tt; }, t, { timeout: timeout || 5000 });
}

/**
 * The hold is on: wait until the bar sits in the green, then resolve with the live band. The band follows the
 * receiver every frame (the scene recomputes Play.need as he runs), so the wait is in two parts like the kicker's
 * kick helpers — a COMPUTED sleep to the lower part of the band read now (the bar climbs linearly over
 * Tuning.qb.throw.meterHoldMs), then a per-frame poll that fires once the bar is past the centre of the band as it
 * is at that moment. The caller lets go right after. Returns {zone, power, t} at the poll.
 */
async function waitGreen(page) {
  const m = await page.evaluate(() => {
    const v = RTG.UI.PlayView.current(), c = v.current(), z = v.greenZone();
    return { holdMs: RTG.Tuning.qb.throw.meterHoldMs, powerMax: RTG.UI.PlayInput.CONST.powerMax, power: c.power, zone: z ? { lo: z.lo, hi: z.hi } : null };
  });
  const z0 = m.zone || { lo: 0.5, hi: 0.7 };
  const early = z0.lo + 0.2 * (z0.hi - z0.lo);
  const ms = Math.round((early - m.power) / m.powerMax * m.holdMs);
  if (ms > 0) await page.waitForTimeout(ms);
  const hit = await page.evaluate(() => new Promise(resolve => {
    const t0 = performance.now();
    (function poll() {
      const v = RTG.UI.PlayView.current();
      if (!v || !v.current().hold) return resolve({ zone: null, power: null, timedOut: true });
      const c = v.current(), z = v.greenZone();
      const mid = z ? z.lo + 0.5 * (z.hi - z.lo) : 0.6;
      if (c.power >= mid || performance.now() - t0 > 2500) return resolve({ zone: z ? { lo: z.lo, hi: z.hi, dist: z.dist } : null, power: c.power, t: c.t, timedOut: c.power < mid });
      requestAnimationFrame(poll);
    })();
  }));
  return hit;
}

/**
 * Press on empty grass (a target is already chosen), let the velocity bar climb to the middle of the green band,
 * drag for lead / loft (css px past the dead zone), release. `releaseAt` (s) delays the press so the release lands
 * on the receiver's window. Returns the input the scene emitted (view.lastInput()).
 */
async function holdRelease(page, opts) {
  opts = opts || {};
  const g = await geometry(page);
  const p = safePoint(g);
  const cdp = opts.touch ? await page.context().newCDPSession(page) : null;
  const tp = (x, y) => ({ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 });
  // the hold must end near the release peak: press holdMs before it (the bar climbs linearly)
  const meter = await page.evaluate(() => ({ holdMs: RTG.Tuning.qb.throw.meterHoldMs, powerMax: RTG.UI.PlayInput.CONST.powerMax, dead: RTG.UI.PlayInput.CONST.deadCss, leadRange: RTG.UI.PlayInput.CONST.leadRangeCss, loftRange: RTG.UI.PlayInput.CONST.loftRangeCss, t: RTG.UI.PlayView.current().current().t }));
  if (typeof opts.releaseAt === 'number') {
    const pressAt = opts.releaseAt - meter.holdMs / 1000 * 0.6 - 0.05;
    if (pressAt > meter.t) await waitPlayTime(page, pressAt);
  }
  if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(p.x, p.y)] });
  else { await page.mouse.move(p.x, p.y); await page.mouse.down(); }
  await page.waitForFunction(() => { const v = RTG.UI.PlayView.current(); return !!v && v.current().hold; }, null, { timeout: HOLD_WAIT_MS });
  // drag for lead / loft while the bar climbs
  if (opts.lead || typeof opts.loft === 'number') {
    const lead = opts.lead || 0, loft = typeof opts.loft === 'number' ? opts.loft : 0.5;
    const dx = lead === 0 ? 0 : Math.sign(lead) * (meter.dead + Math.abs(lead) * meter.leadRange);
    const dy = loft === 0.5 ? 0 : -Math.sign(loft - 0.5) * (meter.dead + Math.abs(loft - 0.5) * meter.loftRange);
    if (cdp) { for (let i = 1; i <= 4; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(p.x + dx * i / 4, p.y + dy * i / 4)] }); }
    else await page.mouse.move(p.x + dx, p.y + dy, { steps: 4 });
  }
  if (typeof opts.onHold === 'function') await opts.onHold();   // e.g. a screenshot of the climbing bar
  const hit = await waitGreen(page);
  if (cdp) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach(); }
  else await page.mouse.up();
  await page.waitForFunction(() => { const v = RTG.UI.PlayView.current(); const p = v && v.phase(); return p === 'FLIGHT' || p === 'SACK' || p === 'RUN' || p === 'RESULT' || p === 'DONE'; }, null, { timeout: 4000 });
  const inp = await page.evaluate(() => { const v = RTG.UI.PlayView.current(); return v ? v.lastInput() : null; });
  return { input: inp, zone: hit.zone, powerAtPoll: hit.power, timedOut: !!hit.timedOut };
}

/** The keyboard path: a number key picks the receiver (slot order), Space is held for the climb, arrows nudge lead / loft, Space up throws. */
async function keyThrow(page, opts) {
  opts = opts || {};
  const cur = await current(page);
  const slots = cur.sim.receivers.map(r => r.slot);
  const slot = opts.slot || (await chooseTarget(page)).slot;
  const idx = slots.indexOf(slot);
  await page.keyboard.press(String(idx + 1));
  await page.waitForFunction(s => { const v = RTG.UI.PlayView.current(); return !!v && v.phase() === 'THROW' && v.current().target === s; }, slot, { timeout: 3000 });
  // the route's ideal lead / loft as arrow taps (one nudge = 0.1) unless the caller says how many
  const ideal = await page.evaluate(s => { const v = RTG.UI.PlayView.current(); const rec = v.sim().receivers.find(r => r.slot === s); const r = rec && RTG.Data.plays.routes[rec.route]; return r ? r.ideal : { lead: 0, loft: 0.5 }; }, slot);
  const leadTaps = typeof opts.leadTaps === 'number' ? opts.leadTaps : Math.round(ideal.lead / 0.1);
  const loftTaps = typeof opts.loftTaps === 'number' ? opts.loftTaps : Math.round((ideal.loft - 0.5) / 0.1);
  await page.keyboard.down(opts.key || 'Space');
  await page.waitForFunction(() => { const v = RTG.UI.PlayView.current(); return !!v && v.current().hold; }, null, { timeout: HOLD_WAIT_MS });
  for (let i = 0; i < Math.abs(leadTaps); i++) await page.keyboard.press(leadTaps > 0 ? 'ArrowRight' : 'ArrowLeft');
  for (let i = 0; i < Math.abs(loftTaps); i++) await page.keyboard.press(loftTaps > 0 ? 'ArrowUp' : 'ArrowDown');
  const hit = await waitGreen(page);
  await page.keyboard.up(opts.key || 'Space');
  await page.waitForFunction(() => { const v = RTG.UI.PlayView.current(); const p = v && v.phase(); return p === 'FLIGHT' || p === 'SACK' || p === 'RUN' || p === 'RESULT' || p === 'DONE'; }, null, { timeout: 4000 });
  const inp = await page.evaluate(() => { const v = RTG.UI.PlayView.current(); return v ? v.lastInput() : null; });
  return { slot, input: inp, zone: hit.zone, powerAtPoll: hit.power, timedOut: !!hit.timedOut };
}

// ─────────────────────────── the result / the story ───────────────────────────

async function waitResult(page, timeout) {
  await page.waitForFunction(() => { const v = RTG.UI.PlayView.current(); const p = v && v.phase(); return p === 'RESULT' || p === 'DONE'; }, null, { timeout: timeout || 12000 });
  return page.evaluate(() => { const v = RTG.UI.PlayView.current(); return v ? JSON.parse(JSON.stringify(v.result())) : null; });
}

/** The scene handed the result to the shell: the interstitial is up, or the drive is over and the summary is up. */
async function waitDone(page, timeout) {
  await page.waitForFunction(() => {
    const sm = document.querySelector('.screen-moment');
    return (sm && sm.getAttribute('data-stage') === 'story') || (RTG.UI.app.screen() === 'summary');
  }, null, { timeout: timeout || 12000 });
  return H.screenId(page);
}

/** NEXT on the interstitial → the next situation (or the summary when the drive is over). */
async function next(page) {
  const sc = await H.screenId(page);
  if (sc === 'summary') return 'summary';
  const btn = page.locator('.screen-moment [data-action="next"]');
  await btn.waitFor({ state: 'visible', timeout: 5000 });
  await btn.click();
  await page.waitForFunction(() => {
    if (RTG.UI.app.screen() === 'summary') return true;
    const v = RTG.UI.PlayView.current();
    return !!v && v.phase() === 'SITUATION';
  }, null, { timeout: 8000 });
  return H.screenId(page);
}

/**
 * One whole moment from SITUATION: read, pick the first GOOD card (opts.cardIdx overrides), tap the chosen receiver,
 * hold / release in the green (opts.how: 'mouse' | 'touch' | 'key'), wait for the result and the story. Returns
 * {card, phase, target, input, result, cards}.
 */
async function playMoment(page, opts) {
  opts = opts || {};
  await H.waitPhase(page, 'SITUATION');
  await tapToRead(page);
  const list = await cards(page);
  const card = typeof opts.cardIdx === 'number' ? list[opts.cardIdx] : bestCard(list);
  const ph = await pickPlay(page, card.idx);
  const out = { card, phase: ph, cards: list, target: null, input: null, result: null };
  if (ph === 'SNAP' || ph === 'THROW') {
    const tgt = await chooseTarget(page);
    out.target = tgt;
    if (opts.how === 'key') out.input = (await keyThrow(page, { slot: tgt.slot })).input;
    else {
      await tapReceiver(page, tgt.slot, { touch: opts.how === 'touch' });
      const lead = typeof opts.lead === 'number' ? opts.lead : tgt.ideal.lead;
      const loft = typeof opts.loft === 'number' ? opts.loft : tgt.ideal.loft;
      out.input = (await holdRelease(page, { touch: opts.how === 'touch', lead, loft, releaseAt: opts.onTime === false ? undefined : tgt.releaseAt })).input;
    }
  }
  out.result = await waitResult(page);
  if (opts.skip !== false) {
    await page.waitForTimeout(350);
    await page.evaluate(() => { const v = RTG.UI.PlayView.current(); if (v && v.phase() === 'RESULT') v.skip(); });
  }
  out.screen = await waitDone(page);
  return out;
}

module.exports = {
  current, state, phase, geometry,
  pickArchetype, pickTeam, pickVenue, startDrive,
  tapToRead, cards, bestCard, pickPlay, pickFirstGood,
  chooseTarget, tapReceiver, touchTap, holdRelease, keyThrow, waitPlayTime, waitGreen,
  waitResult, waitDone, next, playMoment
};
