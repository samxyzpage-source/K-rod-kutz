/**
 * camps.spec (SPEC §2.7.0 D23, §5.2): the recruiting camps through the REAL screens.
 *
 *   newCareer → the senior season (forced makes, every game opened from the store) → 'hscamps' (the itinerary: a row
 *   per invite with the school, its prestige stars, what the staff wants and a NEXT chip; GO TO <SCHOOL> CAMP) →
 *   'hscamp' (the scene: the header names the school and the bar, five slots in the strip, the tally moves) →
 *   the verdict lands on the row (OFFER EARNED / NO OFFER with the judge's line) → every camp → 'offers' shows
 *   exactly the schools whose staff was won over → an HS.OFFERS save from before the camps still routes to the
 *   offers → COMMIT. The first and the last camp are kicked one armed scene at a time; the camps in between are
 *   forced straight through (the scene animates the first kick and hands back to the itinerary). One camp is
 *   failed on the makes bar and the last on the long one, so both refusals show on the itinerary and the offers
 *   list is shorter than the invites. Schema.validate runs after every dispatch (RTG.debug.strict); no console /
 *   page errors. Runs on file:// and http at 390×844 and 1280×800.
 */
'use strict';
const { test, after } = require('node:test');
const H = require('./_harness');
const K = require('./_kickhelpers');
const assert = H.assert;

after(async () => { await H.closeBrowser(); });

const SEED = 4242;

/** The tour as the store sees it. */
function tour(page) {
  return page.evaluate(() => {
    const s = RTG.UI.store.state, hs = s.flags.hs, c = hs.camps;
    return {
      stage: s.stage, phase: s.phase, pending: s.pending ? s.pending.kind : null, screen: RTG.UI.Router.current(),
      stars: hs.summary ? hs.summary.stars : null, idx: c ? c.idx : 0, n: c ? c.invites.length : 0, earned: c ? c.earned.slice() : [],
      invites: c ? c.invites.map(i => ({ teamId: i.teamId, school: i.school, abbr: i.abbr, prestige: i.prestige, bar: i.bar, kicks: i.kicks, done: i.done, earned: i.earned, makes: i.makes, longMade: i.longMade, line: i.line, ask: RTG.HS.askOf(i) })) : []
    };
  });
}

function noErrors(app, where) { assert.deepEqual(app.errors.concat(app.foreignErrors), [], where + ': console / page errors'); }

/** The five senior-season games with forced makes: each game opened through the store, every kick forced straight through. */
async function playSeason(page) {
  for (let g = 0; g < 60; g++) {
    const st = await page.evaluate(() => { const s = RTG.UI.store.state; return { phase: s.phase, open: !!(s.pending && s.pending.kind === 'KICKS') }; });
    if (st.phase !== 'SEASON') return;
    if (!st.open) { await page.evaluate(() => { RTG.UI.store.dispatch('hsStartGame'); RTG.UI.Router.sync(); }); await page.waitForTimeout(60); continue; }
    await H.debug(page, 'forceKick', { outcome: 'GOOD' });
    await page.waitForTimeout(30);
  }
  throw new Error('the senior season did not finish');
}

/** From the itinerary: GO TO CAMP, and the scene must be up for that school. Returns the invite it opened. */
async function goToCamp(page, idx) {
  await H.waitForScreen(page, 'hscamps', 15000);
  const t = await tour(page);
  assert.equal(t.idx, idx, 'camp ' + idx + ' is next (' + t.idx + ' played)');
  const inv = t.invites[idx];
  const btn = page.locator('.scr-hscamps [data-action="go-camp"]');
  assert.equal(await btn.count(), 1, 'one GO TO CAMP button');
  assert.match(await btn.textContent(), new RegExp('GO TO ' + inv.school.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' CAMP'), 'the button names the next school');
  await btn.click();
  await H.waitForScreen(page, 'hscamp', 15000);
  const t2 = await tour(page);
  assert.equal(t2.pending, 'KICKS', 'a camp session is pending');
  const school = (await page.locator('.hsc-header .hsc-school').textContent()).trim();
  assert.ok(school.indexOf(inv.school.toUpperCase() + ' CAMP') >= 0, 'the header names the school: ' + school);
  assert.equal((await page.locator('.hsc-header .hsc-ask').textContent()).trim(), inv.ask.toUpperCase(), 'the header states the bar');
  assert.equal(await page.locator('.hsc-header .hsc-stars').count(), 1, 'prestige stars in the header');
  assert.equal(await page.locator('.hsc-header .slot-strip .slot').count(), inv.kicks, 'a slot per kick');
  if (inv.bar.long) assert.equal((await page.locator('.hsc-header .slot-strip .slot').last().locator('.slot-r').textContent()).trim(), '★', 'the long one is starred');
  return inv;
}

/** Kick the open camp one armed scene at a time: `pattern[i]` true = GOOD, false = WIDE_L. Checks the tally on the way. */
async function kickCampForReal(page, inv, pattern) {
  let makes = 0;
  for (let i = 0; i < inv.kicks; i++) {
    await K.waitSetup(page, i, 20000);
    if (i > 0) {
      const tally = (await page.locator('.hsc-header [data-camp="tally"]').textContent()).trim();
      assert.ok(tally.indexOf(makes + '/' + inv.kicks) === 0, 'the tally after ' + i + ' kicks reads ' + makes + '/' + inv.kicks + ' (' + tally + ')');
      assert.equal(await page.locator('.hsc-header .slot-strip .slot.made').count(), makes, 'made slots so far');
      assert.equal(await page.locator('.hsc-header .slot-strip .slot.miss').count(), i - makes, 'missed slots so far');
      assert.equal(await page.locator('.hsc-header .slot-strip .slot.current').count(), 1, 'the current slot is marked');
    }
    const r = await H.debug(page, 'forceKick', { outcome: pattern[i] ? 'GOOD' : 'WIDE_L' });
    assert.equal(r.made, !!pattern[i]);
    if (pattern[i]) makes++;
  }
  await page.waitForFunction(() => RTG.UI.Router.current() !== 'hscamp', null, { timeout: 20000 });
  return makes;
}

/** Force the open camp straight through (no waiting on the scene); the screen hands back to the itinerary by itself. */
async function kickCampFast(page, inv, pattern) {
  for (let i = 0; i < inv.kicks; i++) {
    const open = await page.evaluate(() => { const s = RTG.UI.store.state; return !!(s.pending && s.pending.kind === 'KICKS'); });
    if (!open) break;
    await H.debug(page, 'forceKick', { outcome: pattern[i] ? 'GOOD' : 'WIDE_L' });
    await page.waitForTimeout(40);
  }
  await page.waitForFunction(() => RTG.UI.Router.current() !== 'hscamp', null, { timeout: 20000 });
}

/** The itinerary row for camp `idx` once it is played: the class, the chip and the judge's line. */
async function checkVerdictRow(page, idx, want) {
  await H.waitForScreen(page, 'hscamps', 15000);
  const t = await tour(page);
  const inv = t.invites[idx];
  assert.equal(inv.done, true); assert.equal(inv.earned, want.earned, inv.school + ': earned ' + inv.earned + ' (' + inv.line + ')');
  assert.equal(inv.makes, want.makes, inv.school + ': makes');
  if (want.line) assert.match(inv.line, want.line);
  const row = page.locator('.scr-hscamps .hsc-row[data-camp="' + idx + '"]');
  assert.equal(await row.count(), 1, 'a row for camp ' + idx);
  assert.equal(await row.evaluate((el, cls) => el.classList.contains(cls), want.earned ? 'earned' : 'missed'), true, 'the row is marked ' + (want.earned ? 'earned' : 'missed'));
  assert.match((await row.locator('.hsc-verdict .chip').textContent()).trim(), want.earned ? /^OFFER EARNED$/ : /^NO OFFER$/, 'the verdict chip');
  assert.equal((await row.locator('.hsc-line').textContent()).trim(), inv.line, 'the judge\'s line on the row');
  assert.equal(await page.locator('.scr-hscamps .hsc-row.next').count(), t.idx < t.n ? 1 : 0, 'the next camp is marked');
  return t;
}

H.matrix(({ mode, vp }) => {
  const shots = mode === 'http';
  test(`camps ${mode} ${vp}: season → itinerary → camp scene → verdicts → offers show the earned schools`, async () => {
    const app = await H.openApp({ mode, viewport: vp });
    const { page } = app;
    try {
      await page.evaluate(() => { RTG.debug.strict = true; });   // Schema.validate after every dispatch (throws → page error)
      await H.debug(page, 'newCareer', { seed: SEED, name: 'Camp Kicker', archetype: 'CANNON' });
      await H.waitForScreen(page, 'hsseason');

      // ── the senior season, every kick good → a 5★ recruit with a full itinerary
      await playSeason(page);
      await page.evaluate(() => RTG.UI.Router.sync());
      await H.waitForScreen(page, 'hscamps', 20000);
      let t = await tour(page);
      assert.equal(t.stage + '.' + t.phase, 'HS.CAMPS');
      assert.equal(t.pending, null, 'nothing pending on the itinerary');
      assert.equal(t.stars, 5, 'a perfect senior year rates 5★');
      assert.ok(t.n >= 6, 'a perfect season fills the itinerary (' + t.n + ' invites)');
      assert.ok(t.invites.filter(i => i.prestige === 5).length >= 2, 'the blue bloods came calling');
      assert.ok(t.invites.some(i => i.bar.long === 0) && t.invites.some(i => i.bar.long > 0), 'schools with and without a long-kick ask');
      noErrors(app, 'itinerary');

      // ── the itinerary screen: a row per invite, the ask in words, the first one marked NEXT
      assert.equal(await page.locator('.scr-hscamps .hsc-row').count(), t.n, 'a row per invite');
      assert.equal(await page.locator('.scr-hscamps .hsc-row.next').count(), 1, 'the first camp is next');
      assert.match((await page.locator('.scr-hscamps .hsc-row.next .hsc-verdict .chip').textContent()).trim(), /^NEXT$/);
      for (let i = 0; i < t.n; i++) {
        const row = page.locator('.scr-hscamps .hsc-row[data-camp="' + i + '"]');
        assert.equal((await row.locator('.hsc-school').textContent()).trim(), t.invites[i].school, 'row ' + i + ' names the school');
        assert.equal((await row.locator('.hsc-stars').textContent()).length, t.invites[i].prestige, 'row ' + i + ' shows the prestige stars');
        assert.equal((await row.locator('.hsc-ask').textContent()).trim(), 'They want: ' + t.invites[i].ask, 'row ' + i + ' states the bar');
      }
      for (let i = 1; i < t.n; i++) assert.ok(t.invites[i].prestige >= t.invites[i - 1].prestige, 'small camps first');
      assert.match(await page.locator('.scr-hscamps .card-title-right .num').first().textContent(), new RegExp('^0/' + t.n + '$'), 'the tour counter starts at 0/' + t.n);
      await H.noHorizontalScroll(page, 'hscamps');
      if (shots) await H.shot(page, 'camps_itinerary_' + vp);

      // instant flights from here: the scene is exercised through its real phases, just without the wait
      await page.evaluate(() => RTG.UI.store.setSetting('reducedMotion', true));

      // ── camp 0 kick by kick: five makes clear any bar → OFFER EARNED on the row
      let inv = await goToCamp(page, 0);
      if (shots) { await K.waitSetup(page, 0, 20000); await page.waitForTimeout(150); await H.shot(page, 'camps_scene_' + vp); }
      const pat0 = [true, true, true, true, true];
      assert.equal(await kickCampForReal(page, inv, pat0), 5);
      t = await checkVerdictRow(page, 0, { earned: true, makes: 5, line: /offer earned/ });
      assert.deepEqual(t.earned, [inv.teamId], 'the first school is earned');
      assert.match(await page.locator('.scr-hscamps .card-title-right .num').first().textContent(), new RegExp('^1/' + t.n + '$'), 'the tour counter moved');
      if (shots) await H.shot(page, 'camps_verdict_' + vp);
      noErrors(app, 'camp 0');

      // ── camp 1 forced through, one make short of the bar → NO OFFER ("they wanted N")
      inv = await goToCamp(page, 1);
      const short = inv.bar.makes - 1;
      const pat1 = []; for (let i = 0; i < inv.kicks; i++) pat1.push(i < short);
      await kickCampFast(page, inv, pat1);
      t = await checkVerdictRow(page, 1, { earned: false, makes: short, line: new RegExp('wanted ' + inv.bar.makes) });
      assert.equal(t.earned.length, 1, 'nothing earned at camp 1');

      // ── the camps in between, forced through with every kick good
      for (let c = 2; c < t.n - 1; c++) {
        inv = await goToCamp(page, c);
        await kickCampFast(page, inv, [true, true, true, true, true]);
        t = await checkVerdictRow(page, c, { earned: true, makes: 5 });
      }
      assert.equal(t.idx, t.n - 1, 'one camp to go');
      assert.equal(t.earned.length, t.n - 2);
      noErrors(app, 'middle camps');

      // ── the last camp (the biggest programme) kick by kick: four makes but not the long one → NO OFFER when the
      //    staff asked for it; the last kick hands straight to the offers
      inv = await goToCamp(page, t.n - 1);
      const patLast = [true, true, true, true, false];
      assert.equal(await kickCampForReal(page, inv, patLast), 4);
      await H.waitForScreen(page, 'offers', 20000);
      t = await tour(page);
      assert.equal(t.stage + '.' + t.phase, 'HS.OFFERS');
      assert.equal(t.pending, 'DECISION');
      const last = t.invites[t.n - 1];
      assert.equal(last.done, true); assert.equal(last.makes, 4); assert.equal(last.longMade, false);
      if (last.bar.long) { assert.equal(last.earned, false, 'four of five without the long one: ' + last.line); assert.match(last.line, new RegExp('nothing from ' + last.bar.long + '\\+')); }
      else assert.equal(last.earned, true, 'no long one asked: ' + last.line);
      const wantEarned = t.invites.filter(i => i.earned).map(i => i.teamId).sort();
      assert.deepEqual(t.earned.slice().sort(), wantEarned);
      assert.equal(t.earned.length, last.bar.long ? t.n - 2 : t.n - 1);
      noErrors(app, 'tour done');

      // ── the offers: exactly the earned schools, each marked as earned, no safety school, no walk-on
      const dec = await page.evaluate(() => { const d = RTG.UI.store.state.pending.decision; return { kind: d.kind, walkon: d.payload.walkon, offers: d.payload.offers.map(o => ({ id: o.id, teamId: o.teamId, earned: !!o.earned, safety: !!o.safety, walkon: !!o.walkon, school: o.school })), labels: d.options.map(o => o.label) }; });
      assert.equal(dec.kind, 'OFFERS_COLLEGE');
      assert.deepEqual(dec.offers.map(o => o.teamId).sort(), wantEarned, 'the offers are the earned schools, no more, no less');
      assert.ok(dec.offers.every(o => o.earned && !o.safety && !o.walkon), 'every offer was earned at camp');
      assert.ok(dec.labels.every(l => /earned at camp/.test(l)), 'every option says so');
      assert.equal(dec.walkon, false);
      for (const i of t.invites.filter(x => !x.earned)) assert.ok(!dec.offers.some(o => o.teamId === i.teamId), i.school + ' passed and is not on the table');
      assert.equal(await page.locator('.scr-offers .offer-card').count(), dec.offers.length, 'an offer card per earned school');
      const cards = await page.locator('.scr-offers .offer-card').evaluateAll(els => els.map(el => ({ id: el.getAttribute('data-offer'), name: (el.querySelector('.offer-name') || {}).textContent || '' })));
      assert.deepEqual(cards.map(c => c.id).sort(), dec.offers.map(o => o.id).sort(), 'a card per offer, by id');
      assert.ok(cards.every(c => c.name.trim().length > 0), 'every card names its school');
      assert.equal(await page.locator('.scr-offers .offer-card .chip', { hasText: /^SAFETY$/ }).count(), 0, 'no safety chip');
      assert.equal(await page.locator('.scr-offers .offer-card .chip', { hasText: /^WALK-ON$/ }).count(), 0, 'no walk-on chip');
      await H.noHorizontalScroll(page, 'offers');
      if (shots) await H.shot(page, 'camps_offers_' + vp);

      // ── an HS.OFFERS save from before the camps (no tour on the record) still lands on the offers
      await page.evaluate(() => {
        const s = RTG.debug.getState();
        delete s.flags.hs.camps; delete s.flags.hs.summary.camps; delete s.flags.hs.summary.earned;
        RTG.debug.setState(s);
      });
      await H.waitForScreen(page, 'offers', 10000);
      assert.equal(await page.evaluate(() => !!RTG.UI.store.state.flags.hs.camps), false, 'the old save has no camps');
      assert.equal(await page.locator('.scr-offers .offer-card').count(), dec.offers.length, 'the same offers on the old save');
      noErrors(app, 'old save');

      // ── COMMIT
      await page.locator('.carousel-slide.active [data-action^="pick-"]').click();
      await H.clickButton(page, 'COMMIT', page.locator('.modal'));
      await page.waitForFunction(() => RTG.UI.store.state.stage === 'COLLEGE', null, { timeout: 10000 });
      const st = await H.debug(page, 'getState');
      assert.equal(st.stage + '.' + st.phase, 'COLLEGE.PRE');
      assert.ok(dec.offers.some(o => o.teamId === st.player.teamId), 'enrolled at one of the earned schools');
      const v = await page.evaluate(() => RTG.Schema.validate(RTG.UI.store.state));
      assert.ok(v.ok, 'valid after the commit: ' + v.errors.slice(0, 4).join(' | '));
      noErrors(app, 'end');
    } catch (e) {
      try {
        const where = await page.evaluate(() => { const s = RTG.UI.store.state; return { screen: RTG.UI.Router.current(), stage: s && s.stage + '.' + s.phase, pending: s && s.pending ? s.pending.kind : null, camps: s && s.flags.hs.camps ? s.flags.hs.camps.idx + '/' + s.flags.hs.camps.invites.length : null }; });
        console.log('  camps ' + mode + ' ' + vp + ' FAILED at ' + JSON.stringify(where) + '\n  errors: ' + JSON.stringify(app.errors.concat(app.foreignErrors)).slice(0, 600));
        await H.shot(page, 'camps_FAILED_' + mode + '_' + vp);
      } catch (e2) { /* ignore */ }
      throw e;
    } finally { await app.close(); }
  });
}, H.MODES, ['phone', 'desktop']);

/** RTG.debug.jumpTo lands on the itinerary, and a save taken mid-camp comes back on the scene. */
test('camps file phone: jumpTo HS.CAMPS opens the itinerary; a mid-camp save reloads on the camp scene', async () => {
  const app = await H.openApp({ mode: 'file', viewport: 'phone' });
  const { page } = app;
  try {
    await page.evaluate(() => { RTG.debug.strict = true; });
    const st = await H.debug(page, 'jumpTo', { stage: 'HS', phase: 'CAMPS', seed: SEED + 1 });
    assert.equal(st.stage + '.' + st.phase, 'HS.CAMPS');
    assert.equal(st.pending, null);
    assert.ok(st.flags.hs.camps && st.flags.hs.camps.invites.length >= 1, 'invites after the auto-played season');
    await H.waitForScreen(page, 'hscamps', 10000);
    assert.equal(await page.locator('.scr-hscamps .hsc-row').count(), st.flags.hs.camps.invites.length, 'a row per invite');
    // open the first camp, kick once, save to slot 1, reload the slot: still on the scene with one kick on the record
    await page.evaluate(() => RTG.UI.store.setSetting('reducedMotion', true));
    await page.locator('.scr-hscamps [data-action="go-camp"]').click();
    await H.waitForScreen(page, 'hscamp', 15000);
    await K.waitSetup(page, 0, 20000);
    await H.debug(page, 'forceKick', { outcome: 'GOOD' });
    await K.waitSetup(page, 1, 20000);
    const saved = await page.evaluate(() => { RTG.UI.store.save(1); return RTG.UI.store.state.pending.session.results.length; });
    assert.equal(saved, 1);
    await page.evaluate(() => { RTG.UI.store.load(1); });
    await H.waitForScreen(page, 'hscamp', 15000);
    await K.waitSetup(page, 1, 20000);
    const back = await tour(page);
    assert.equal(back.phase, 'CAMPS'); assert.equal(back.pending, 'KICKS'); assert.equal(back.idx, 0);
    assert.equal(await page.locator('.hsc-header .slot-strip .slot.made').count(), 1, 'the made kick is back on the strip');
    assert.deepEqual(app.errors.concat(app.foreignErrors), [], 'console / page errors');
  } finally { await app.close(); }
});
