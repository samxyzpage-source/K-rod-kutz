/**
 * finances.spec (the money system, §5.2): the offseason MONEY step through the REAL screens.
 *
 *   jumpTo COLLEGE.PRE → simSeason (the store) → the wizard: BODY_CHECK OK, TRAINING_BLOCKS banked → the router lands
 *   on 'finances' (DECISION mode): the header numbers equal the store, four tiers, three services, every big buy, the
 *   three pitches, the sticky footer → RTG.debug.money(300) funds the books (the header follows the live bank) →
 *   stage a lifestyle plan (free now), one purchase, one service and one pitch at MAX → the footer's BANK AFTER equals
 *   the staged bank recomputed here in the engine's order, what is out of reach is disabled and dimmed → CLOSE THE
 *   BOOKS → the wizard moves on and state.finance carries the plan, the truck, the coach, the holding and the ledger
 *   rows in order → the next offseason (the chain settled through the store, one season on auto): the tick report
 *   renders the holding's move, the plan's cost and the upkeep; the holding moved; closing unspent spends nothing →
 *   REVIEW mode from the hub (the bank chip, the FINANCES button): no actions but BACK → jumpTo RETIRED: NET WORTH on
 *   the legacy career line and a MONEY card. Schema.validate after every dispatch (RTG.debug.strict); no console /
 *   page errors; no horizontal scroll at phone width. Runs on file:// and http at 390×844 and 1280×800, plus one
 *   overdraft flow (file, phone): the debt banner, every buy / service / pitch off, the plan still changeable, the
 *   books still closable.
 */
'use strict';
const { test, after } = require('node:test');
const H = require('./_harness');
const assert = H.assert;

after(async () => { await H.closeBrowser(); });

const SEED = 8686;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function noErrors(app, where) { assert.deepEqual(app.errors.concat(app.foreignErrors), [], where + ': console / page errors'); }

/** Kit.money as the page prints it ($k → '$30k' / '$1.5M'). */
function money(page, k) { return page.evaluate((v) => RTG.UI.Kit.money(v), k); }

/** The books as the store sees them (plus the FINANCES payload when the decision is pending). */
function books(page) {
  return page.evaluate(() => {
    const s = RTG.UI.store.state, f = s.finance, p = s.pending;
    const dec = p && p.kind === 'DECISION' && p.decision.kind === 'FINANCES' ? p.decision : null;
    return {
      stage: s.stage, phase: s.phase, year: s.year, screen: RTG.UI.Router.current(),
      pending: p ? p.kind : null, dec: p && p.decision ? p.decision.kind : null,
      bank: f.bank, netWorth: RTG.Finance.netWorth(s), lifestyle: f.lifestyle, owned: f.owned.slice(), services: f.services.slice(),
      holdings: f.holdings.map((h) => ({ id: h.id, oppId: h.oppId, invested: h.invested, value: h.value, log: h.log.slice() })),
      ledger: f.ledger.map((l) => ({ kind: l.kind, delta: l.delta, year: l.year })), lastTick: f.lastTick, debtYears: f.debtYears,
      payload: dec ? {
        bank: dec.payload.bank, report: dec.payload.report,
        opportunities: dec.payload.opportunities.map((o) => ({ oppId: o.oppId, min: o.min, max: o.max, risk: o.risk })),
        purchases: dec.payload.purchases.map((x) => ({ id: x.id, price: x.price, owned: x.owned })),
        services: dec.payload.services.map((x) => ({ id: x.id, price: x.price, active: x.active }))
      } : null
    };
  });
}

/** Settle the rest of the offseason through the store (events → choice 0, decisions → the default policy, sessions → AI kicks) until a new season is ready. */
async function toNextSeason(page) {
  for (let g = 0; g < 80; g++) {
    const b = await page.evaluate(() => { const s = RTG.UI.store.state; return { stage: s.stage, phase: s.phase, pending: s.pending ? s.pending.kind : null }; });
    if (b.stage === 'RETIRED' || b.stage === 'DRAFT') throw new Error('left college on the way to the next season (' + b.stage + ')');
    if (b.phase === 'PRE' && !b.pending) return;
    if (b.pending === 'EVENT') { await H.debug(page, 'choose', 0); continue; }
    if (b.pending === 'DECISION') { await page.evaluate(() => { const s = RTG.UI.store, st = s.state, d = st.pending.decision; s.dispatch('decide', { kind: d.kind, optionId: RTG.Engine.autoOption(st, d) }); }); continue; }
    if (b.pending === 'KICKS') { await page.evaluate(() => RTG.UI.store.dispatch('settlePending', { max: 1 })); continue; }
    await H.debug(page, 'nextPhase');
  }
  throw new Error('the offseason did not end');
}

/** From the wizard's BODY_CHECK card: OK, bank the training blocks, and the books must open on the finances screen. */
async function stepToBooks(page) {
  await H.waitForScreen(page, 'offseason', 15000);
  let b = await books(page);
  assert.equal(b.dec, 'BODY_CHECK', 'the wizard opens on the body check (' + b.dec + ')');
  await page.locator('.scr-offseason [data-action="opt-OK"]').click();
  await page.waitForFunction(() => { const p = RTG.UI.store.state.pending; return !!(p && p.decision && p.decision.kind === 'TRAINING_BLOCKS'); }, null, { timeout: 10000 });
  await page.locator('.scr-offseason .block-tile[data-option="BANK"]').click();
  await H.waitForScreen(page, 'finances', 15000);
  b = await books(page);
  assert.equal(b.dec, 'FINANCES', 'the MONEY step is pending');
  assert.equal(b.lastTick, b.year, 'the step ticked the year');
  assert.equal(b.payload.bank, b.bank, 'the payload snapshot equals the live bank');
  return b;
}

async function after_(page, expectedK) {
  const want = await money(page, expectedK);
  await page.waitForFunction((txt) => { const el = document.querySelector('.scr-finances .fin-after'); return !!el && el.textContent.trim() === txt; }, want, { timeout: 5000 });
  return want;
}

async function closeBooks(page) {
  await page.locator('.scr-finances .fin-footer [data-action="close-books"]').click();
  await page.waitForFunction(() => { const p = RTG.UI.store.state.pending; return !(p && p.decision && p.decision.kind === 'FINANCES'); }, null, { timeout: 10000 });
  await page.waitForTimeout(80);
}

H.matrix(({ mode, vp }) => {
  const shots = mode === 'http';
  test(`finances ${mode} ${vp}: the books open after the training blocks → fund, stage, close → the next tick reports → review from the hub → net worth on the legacy line`, async () => {
    const app = await H.openApp({ mode, viewport: vp });
    const { page } = app;
    try {
      await page.evaluate(() => { RTG.debug.strict = true; });   // Schema.validate after every dispatch (throws → page error)
      const TF = await page.evaluate(() => JSON.parse(JSON.stringify(RTG.Tuning.finance)));
      const truck = await page.evaluate(() => JSON.parse(JSON.stringify(RTG.Data.finance.purchasesById.USED_TRUCK)));

      // ── to the first college offseason through the store, then the wizard's real cards to the books
      const st0 = await H.debug(page, 'jumpTo', { stage: 'COLLEGE', phase: 'PRE', seed: SEED });
      assert.equal(st0.stage + '.' + st0.phase, 'COLLEGE.PRE');
      assert.ok(st0.finance && st0.finance.lifestyle === 'FRUGAL', 'the career carries the books from day one');
      await H.debug(page, 'simSeason');
      let b = await stepToBooks(page);
      assert.equal(b.stage + '.' + b.phase, 'COLLEGE.OFF');
      noErrors(app, 'the books open');

      // ── DECISION mode: header numbers, every section, the sticky footer
      assert.equal((await page.locator('.scr-finances .fin-bank').textContent()).trim(), await money(page, b.bank), 'BANK equals the store');
      assert.equal((await page.locator('.scr-finances .fin-networth').textContent()).trim(), await money(page, b.netWorth), 'NET WORTH equals Finance.netWorth');
      assert.equal(await page.locator('.scr-finances [data-tier]').count(), 4, 'four lifestyle tiers');
      assert.equal(await page.locator('.scr-finances [data-tier="' + b.lifestyle + '"].current.selected').count(), 1, 'this year\'s tier is marked and planned');
      assert.equal(await page.locator('.scr-finances button[data-service]').count(), 3, 'three services');
      assert.equal(await page.locator('.scr-finances .fin-buy').count(), b.payload.purchases.length, 'a card per purchase');
      assert.ok(b.payload.purchases.length >= 9, b.payload.purchases.length + ' purchases');
      assert.equal(b.payload.opportunities.length, TF.invest.perYear, 'the pitches of the year');
      assert.equal(await page.locator('.scr-finances .fin-opp').count(), b.payload.opportunities.length, 'a card per pitch');
      for (const o of b.payload.opportunities) {
        assert.equal(await page.locator('.scr-finances .fin-opp[data-opp="' + o.oppId + '"] [data-invest="' + o.oppId + '"]').count(), 1, 'INVEST on ' + o.oppId);
        assert.equal(await page.locator('.scr-finances .fin-opp[data-opp="' + o.oppId + '"] .fin-stepper').count(), 1, 'a stepper on ' + o.oppId);
        assert.equal(await page.locator('.scr-finances .fin-opp[data-opp="' + o.oppId + '"] .chip', { hasText: new RegExp('^' + o.risk + '$') }).count(), 1, 'the risk chip on ' + o.oppId);
      }
      assert.equal(await page.locator('.scr-finances .fin-footer [data-action="close-books"]').count(), 1, 'CLOSE THE BOOKS in the footer');
      assert.equal(await page.locator('.scr-finances .fin-footer [data-action="reset-draft"]').count(), 1, 'RESET DRAFT in the footer');
      assert.ok(await page.locator('.scr-finances .fin-footer [data-action="reset-draft"]').isDisabled(), 'nothing staged: RESET is off');
      assert.ok(!(await page.locator('.scr-finances .fin-footer [data-action="close-books"]').isDisabled()), 'CLOSE is on');
      assert.equal((await page.locator('.scr-finances .fin-after').textContent()).trim(), await money(page, b.bank), 'BANK AFTER is the bank when nothing is staged');
      assert.equal(await page.locator('.scr-finances .card', { hasText: 'LEDGER' }).count(), 1, 'the ledger card');
      const footer = await page.locator('.scr-finances .fin-footer').boundingBox();
      const view = page.viewportSize();
      assert.ok(footer && footer.y + footer.height <= view.height + 1, 'the footer is on screen (sticky)');
      await H.noHorizontalScroll(page, 'finances');
      if (shots) await H.shot(page, 'finances_decision_' + vp);
      noErrors(app, 'decision mode');

      // ── fund the books: the header follows the live bank
      const bankBefore = b.bank;
      const funded = await H.debug(page, 'money', 300);
      assert.equal(funded, bankBefore + 300);
      b = await books(page);
      assert.equal(b.bank, funded);
      await page.waitForFunction((txt) => { const el = document.querySelector('.scr-finances .fin-bank'); return !!el && el.textContent.trim() === txt; }, await money(page, b.bank), { timeout: 5000 });
      assert.equal((await page.locator('.scr-finances .fin-after').textContent()).trim(), await money(page, b.bank));

      // ── stage: a plan (free now), a truck, a coach, a pitch at MAX — the footer follows the staged bank
      const coach = b.payload.services.find((s) => s.id === 'PRIVATE_COACH');
      const truckCard = b.payload.purchases.find((p) => p.id === 'USED_TRUCK');
      assert.equal(truckCard.price, truck.price * 1, 'college prices are the catalogue\'s');
      const opp = b.payload.opportunities[0];
      await page.locator('.scr-finances [data-tier="COMFORTABLE"]').click();
      assert.equal(await page.locator('.scr-finances [data-tier="COMFORTABLE"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('.scr-finances [data-tier="COMFORTABLE"].selected').count(), 1);
      assert.equal(await page.locator('.scr-finances [data-tier="FRUGAL"].current').count(), 1, 'this year is still frugal');
      await after_(page, b.bank);   // the plan is charged at the next tick, not now
      await page.locator('.scr-finances [data-buy="USED_TRUCK"]').click();
      assert.equal(await page.locator('.scr-finances [data-buy="USED_TRUCK"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('.scr-finances .fin-buy.staged').count(), 1);
      await after_(page, b.bank - truckCard.price);
      await page.locator('.scr-finances [data-service="PRIVATE_COACH"]').click();
      assert.equal(await page.locator('.scr-finances [data-service="PRIVATE_COACH"]').getAttribute('aria-pressed'), 'true');
      const afterFixed = b.bank - truckCard.price - coach.price;
      await after_(page, afterFixed);
      const maxBtn = page.locator('.scr-finances [data-max="' + opp.oppId + '"]');
      if (!(await maxBtn.isDisabled())) await maxBtn.click();
      const amount = Math.min(opp.max, afterFixed);
      assert.ok(amount >= opp.min, 'the pitch is within reach (' + amount + ' vs min ' + opp.min + ')');
      await page.waitForFunction(([id, txt]) => { const el = document.querySelector('.scr-finances .fin-opp[data-opp="' + id + '"] .fin-amount'); return !!el && el.textContent.trim() === txt; }, [opp.oppId, await money(page, amount)], { timeout: 5000 });
      await page.locator('.scr-finances [data-invest="' + opp.oppId + '"]').click();
      assert.equal(await page.locator('.scr-finances [data-invest="' + opp.oppId + '"]').getAttribute('aria-pressed'), 'true');
      const expectedAfter = afterFixed - amount;
      await after_(page, expectedAfter);
      assert.match(await page.locator('.scr-finances .fin-footer-note').textContent(), /4 changes staged/);
      assert.ok(!(await page.locator('.scr-finances .fin-footer [data-action="reset-draft"]').isDisabled()), 'RESET is on with a draft');
      assert.ok(!(await page.locator('.scr-finances .fin-footer [data-action="close-books"]').isDisabled()), 'CLOSE is on: the draft never goes under $0');
      // what is now out of reach is disabled and dimmed; what is still affordable is not
      const dear = b.payload.purchases.filter((p) => p.id !== 'USED_TRUCK' && !p.owned && p.price > expectedAfter);
      const cheap = b.payload.purchases.filter((p) => p.id !== 'USED_TRUCK' && !p.owned && p.price <= expectedAfter);
      assert.ok(dear.length > 0, 'something is out of reach at ' + expectedAfter);
      for (const p of dear) assert.ok(await page.locator('.scr-finances [data-buy="' + p.id + '"]').isDisabled(), p.id + ' (' + p.price + ') is out of reach at ' + expectedAfter);
      for (const p of cheap) assert.ok(!(await page.locator('.scr-finances [data-buy="' + p.id + '"]').isDisabled()), p.id + ' (' + p.price + ') is still affordable at ' + expectedAfter);
      assert.equal(await page.locator('.scr-finances .fin-buy.dim').count(), dear.length, 'dimmed cards = the ones out of reach');
      for (const s of b.payload.services.filter((x) => x.id !== 'PRIVATE_COACH')) {
        assert.equal(await page.locator('.scr-finances [data-service="' + s.id + '"]').isDisabled(), s.price > expectedAfter, s.id + ' follows the staged bank');
      }
      await H.noHorizontalScroll(page, 'finances staged');
      if (shots) await H.shot(page, 'finances_staged_' + vp);
      noErrors(app, 'staged');

      // ── leaving the books mid-draft (the HUB tab / Escape / the wizard's door card all route away) keeps the draft
      await page.evaluate(() => RTG.UI.Router.go('hub'));
      await H.waitForScreen(page, 'hub', 10000);
      await page.evaluate(() => RTG.UI.Router.go('finances'));
      await H.waitForScreen(page, 'finances', 10000);
      await after_(page, expectedAfter);
      assert.match(await page.locator('.scr-finances .fin-footer-note').textContent(), /4 changes staged/, 'the draft survives a route away and back');
      assert.equal(await page.locator('.scr-finances [data-buy="USED_TRUCK"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('.scr-finances [data-invest="' + opp.oppId + '"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('.scr-finances [data-tier="COMFORTABLE"].selected').count(), 1);
      noErrors(app, 'draft kept');

      // ── CLOSE THE BOOKS: the wizard moves on, the engine agrees with the footer
      const yearClosed = b.year;
      await closeBooks(page);
      b = await books(page);
      assert.notEqual(b.screen, 'finances', 'the screen left the books (' + b.screen + ')');
      assert.equal(b.bank, expectedAfter, 'the engine\'s bank equals the footer\'s BANK AFTER');
      assert.equal(b.lifestyle, 'COMFORTABLE', 'the plan for the coming year');
      assert.deepEqual(b.owned, ['USED_TRUCK']); assert.deepEqual(b.services, ['PRIVATE_COACH']);
      assert.equal(b.holdings.length, 1);
      assert.equal(b.holdings[0].oppId, opp.oppId); assert.equal(b.holdings[0].invested, amount); assert.equal(b.holdings[0].value, amount); assert.deepEqual(b.holdings[0].log, []);
      const thisYear = b.ledger.filter((l) => l.year === yearClosed).map((l) => l.kind);
      assert.deepEqual(thisYear.slice(-3), ['SERVICE', 'PURCHASE', 'INVEST'], 'services → buy → invest on the ledger');
      assert.equal(b.ledger.filter((l) => l.year === yearClosed && l.kind === 'LIFESTYLE').length, 0, 'the plan was not charged');
      if (b.screen === 'offseason') assert.equal(await page.locator('.scr-offseason .stepper .step.done .step-name', { hasText: /^MONEY$/ }).count(), 1, 'MONEY is ticked off on the stepper');
      noErrors(app, 'closed');

      // ── the next offseason: the coach was consumed by the season start; the tick report renders and the holding moved
      await toNextSeason(page);
      b = await books(page);
      assert.equal(b.phase, 'PRE');
      assert.deepEqual(b.services, [], 'Season.start consumed the coach');
      await H.debug(page, 'simSeason');
      b = await stepToBooks(page);
      const rep = b.payload.report;
      assert.ok(rep && rep.year === b.year, 'a tick report for this year');
      assert.equal(rep.returns.length, 1, 'one holding, one move');
      assert.equal(rep.returns[0].holdingId, b.holdings[0].id);
      assert.equal(b.holdings[0].log.length, 1, 'the holding moved once');
      assert.equal(rep.lifestyle.tier, 'COMFORTABLE'); assert.equal(rep.lifestyle.cost, TF.lifestyle.tiers.COMFORTABLE.cost);
      assert.equal(rep.upkeep, truck.upkeep, 'the truck\'s upkeep');
      assert.equal(await page.locator('.scr-finances .fin-return').count(), 1, 'the move is on the THIS YEAR card');
      assert.ok((await page.locator('.scr-finances .fin-return .chip').count()) >= 1, 'with a pct chip');
      const thisYearCard = await page.locator('.scr-finances .card', { hasText: 'THIS YEAR' }).first().innerText();
      assert.match(thisYearCard, /Lifestyle · comfortable/); assert.match(thisYearCard, /Upkeep on what you own/);
      assert.equal(await page.locator('.scr-finances .fin-holding').count(), 1, 'the holding row');
      assert.equal(await page.locator('.scr-finances [data-sell="' + b.holdings[0].id + '"]').count(), 1, 'SELL on the holding');
      assert.equal(await page.locator('.scr-finances .fin-buy.owned[data-buy="USED_TRUCK"]').count(), 1, 'the truck is OWNED');
      assert.equal(await page.locator('.scr-finances [data-tier="COMFORTABLE"].current').count(), 1, 'this year\'s tier is the plan that was picked');
      assert.equal((await page.locator('.scr-finances .fin-bank').textContent()).trim(), await money(page, b.bank));
      await H.noHorizontalScroll(page, 'finances report');
      if (shots) await H.shot(page, 'finances_report_' + vp);
      const bank2 = b.bank;
      await closeBooks(page);
      b = await books(page);
      assert.equal(b.bank, bank2, 'closing with nothing staged spends nothing');
      noErrors(app, 'second offseason');

      // ── REVIEW mode from the hub: the bank chip, the FINANCES button, no actions but BACK
      await toNextSeason(page);
      await page.evaluate(() => RTG.UI.Router.sync({ force: true }));
      await H.waitForScreen(page, 'hub', 15000);
      b = await books(page);
      const chip = page.locator('.scr-hub button.hub-bank');
      assert.equal(await chip.count(), 1, 'a bank chip in the hub head');
      assert.match((await chip.textContent()).trim(), new RegExp(esc(await money(page, b.bank))), 'the chip shows the bank');
      assert.equal(await page.locator('.scr-hub [data-action="finances"]').count(), 1, 'FINANCES in the hub nav');
      await page.locator('.scr-hub [data-action="finances"]').click();
      await H.waitForScreen(page, 'finances');
      assert.equal(await page.locator('.scr-finances [data-action="close-books"]').count(), 0, 'no CLOSE THE BOOKS in review');
      assert.equal(await page.locator('.scr-finances button[data-buy], .scr-finances button[data-tier], .scr-finances button[data-service], .scr-finances button[data-invest], .scr-finances button[data-sell]').count(), 0, 'no action buttons in review');
      assert.ok((await page.locator('.scr-finances [data-action="back"]').count()) >= 1, 'BACK');
      assert.equal((await page.locator('.scr-finances .fin-bank').textContent()).trim(), await money(page, b.bank));
      assert.equal(await page.locator('.scr-finances .fin-holding').count(), b.holdings.length, 'the holdings are listed');
      assert.equal(await page.locator('.scr-finances .fin-buy.owned[data-buy="USED_TRUCK"]').count(), 1);
      assert.equal(await page.locator('.scr-finances [data-tier="' + b.lifestyle + '"].current').count(), 1);
      await H.noHorizontalScroll(page, 'finances review');
      if (shots) await H.shot(page, 'finances_review_' + vp);
      await page.locator('.scr-finances .fin-actions [data-action="back"]').click();
      await H.waitForScreen(page, 'hub');
      noErrors(app, 'review');

      // ── the legacy screen: NET WORTH on the career line, a MONEY card
      await H.debug(page, 'jumpTo', { stage: 'RETIRED' });
      await H.waitForScreen(page, 'legacy', 30000);
      b = await books(page);
      assert.equal(b.stage, 'RETIRED');
      const nw = await page.evaluate(() => {
        const dt = Array.prototype.slice.call(document.querySelectorAll('.scr-legacy dl.kv dt')).find((d) => d.textContent.trim() === 'NET WORTH');
        return dt && dt.nextElementSibling ? dt.nextElementSibling.textContent.trim() : null;
      });
      assert.equal(nw, await money(page, b.netWorth), 'NET WORTH on the career line equals Finance.netWorth');
      const moneyCard = page.locator('.scr-legacy .card', { has: page.locator('dt', { hasText: /^BEST BET$/ }) });
      assert.equal(await moneyCard.count(), 1, 'a MONEY card');
      const moneyText = await moneyCard.innerText();
      assert.match(moneyText, /LIFESTYLE/); assert.match(moneyText, /WORST BET/); assert.match(moneyText, /OWNED/);
      await H.noHorizontalScroll(page, 'legacy');
      const v = await page.evaluate(() => RTG.Schema.validate(RTG.UI.store.state));
      assert.ok(v.ok, 'valid at the end: ' + v.errors.slice(0, 4).join(' | '));
      noErrors(app, 'end');
    } catch (e) {
      try {
        const where = await page.evaluate(() => { const s = RTG.UI.store.state; return { screen: RTG.UI.Router.current(), stage: s && s.stage + '.' + s.phase, year: s && s.year, pending: s && s.pending ? s.pending.kind + ':' + (s.pending.decision ? s.pending.decision.kind : '') : null, bank: s && s.finance ? s.finance.bank : null }; });
        console.log('  finances ' + mode + ' ' + vp + ' FAILED at ' + JSON.stringify(where) + '\n  errors: ' + JSON.stringify(app.errors.concat(app.foreignErrors)).slice(0, 600));
        await H.shot(page, 'finances_FAILED_' + mode + '_' + vp);
      } catch (e2) { /* ignore */ }
      throw e;
    } finally { await app.close(); }
  });
}, H.MODES, ['phone', 'desktop']);

/** An overdraft: the banner (with the real rule), nothing to buy, no dearer plan, the books still closable — closing spends nothing. */
test('finances file phone: in debt the books still close (banner, every buy / service / pitch off, no dearer plan while in the red, nothing spent)', async () => {
  const app = await H.openApp({ mode: 'file', viewport: 'phone' });
  const { page } = app;
  try {
    await page.evaluate(() => { RTG.debug.strict = true; });
    await H.debug(page, 'jumpTo', { stage: 'COLLEGE', phase: 'PRE', seed: SEED + 1 });
    await H.debug(page, 'simSeason');
    await H.debug(page, 'settle', { max: 1 });   // BODY_CHECK
    await H.debug(page, 'settle', { max: 1 });   // TRAINING_BLOCKS
    await page.evaluate(() => RTG.UI.Router.sync({ force: true }));
    await H.waitForScreen(page, 'finances');
    let b = await books(page);
    assert.equal(b.dec, 'FINANCES');
    await H.debug(page, 'money', -(b.bank + 40));
    b = await books(page);
    assert.equal(b.bank, -40);
    await page.waitForFunction(() => !!document.querySelector('.scr-finances .fin-debt'), null, { timeout: 5000 });
    const banner = await page.locator('.scr-finances .fin-debt').textContent();
    assert.match(banner, /IN DEBT/);
    const TD = await page.evaluate(() => JSON.parse(JSON.stringify(RTG.Tuning.finance.debt)));
    const words = { 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five' };
    assert.match(banner, new RegExp('after ' + (words[TD.liquidateAfter] || TD.liquidateAfter) + ' years? in the red'), 'the banner states Tuning.finance.debt.liquidateAfter (' + TD.liquidateAfter + ')');
    assert.match(banner, /more than what you own/, 'and the insolvency rule');
    assert.equal((await page.locator('.scr-finances .fin-bank').textContent()).trim(), await money(page, -40));
    assert.ok(await page.locator('.scr-finances .fin-bank').evaluate((el) => el.classList.contains('txt-red')), 'the bank reads red');
    assert.equal(await page.locator('.scr-finances button[data-buy]:not([disabled])').count(), 0, 'nothing to buy on an overdraft');
    assert.equal(await page.locator('.scr-finances button[data-service]:not([disabled])').count(), 0, 'no service either');
    assert.equal(await page.locator('.scr-finances button[data-invest]:not([disabled])').count(), 0, 'no pitch either');
    assert.ok(!(await page.locator('.scr-finances [data-action="close-books"]').isDisabled()), 'the books can still be closed');
    // a dearer plan is off while the bank is red (the engine refuses it too); the free one stays pickable
    for (const id of ['COMFORTABLE', 'FLASHY', 'BALLER']) assert.ok(await page.locator('.scr-finances [data-tier="' + id + '"]').isDisabled(), id + ' cannot be picked in debt');
    assert.ok(!(await page.locator('.scr-finances [data-tier="FRUGAL"]').isDisabled()), 'frugal stays open');
    assert.equal(await page.locator('.scr-finances [data-tier="FRUGAL"].current.selected').count(), 1);
    await after_(page, -40);
    await H.noHorizontalScroll(page, 'finances in debt');
    await closeBooks(page);
    b = await books(page);
    assert.equal(b.bank, -40, 'nothing spent'); assert.equal(b.lifestyle, 'FRUGAL', 'still frugal'); assert.deepEqual(b.owned, []); assert.deepEqual(b.holdings, []);
    assert.notEqual(b.screen, 'finances', 'the wizard moved on');
    assert.deepEqual(app.errors.concat(app.foreignErrors), [], 'console / page errors');
  } finally { await app.close(); }
});
