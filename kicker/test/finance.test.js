/**
 * finance.test.js — RTG.Finance (the money system: state.finance, engine/finance.js, data/finance.js; the offseason
 * FINANCES step of the career chain). "Mostly lifestyle but a little bit of play": the bank fills from take-home pay
 * and event money, the offseason tick charges the lifestyle plan, the upkeep of what is owned and the interest on an
 * overdraft, revalues every holding from ONE fork (busts, booms, N(mean, sd)) and — Tuning.finance.debt.liquidateAfter
 * years in the red, or once the debt exceeds what could be sold — sells what the player owns, smallest-that-clears
 * first; the FINANCES decision stages a plan / services / big buys / pitches and Finance.apply settles them
 * sell → lifestyle → services → buy → invest without ever borrowing (and never a dearer plan while in the red); the
 * plan is charged at the price quoted when the books closed, upkeep off what was paid; real risk, real loss.
 *
 *   node kicker/test/finance.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RTG = require('./load')();
const kfx = require('./fixtures/career');
const ffx = require('./fixtures/finance');
const efx = require('./fixtures/events');
const cfx = require('./fixtures/contract');
const schemaFx = require('./fixtures/schema');

const { Finance, Engine, Schema, Tuning, Career, Contracts, Events, Player, Save, Util } = RTG;
const T = Tuning.finance;
const D = RTG.Data.finance;
const J = (v) => JSON.parse(JSON.stringify(v));
const deq = (a, b, m) => assert.deepEqual(J(a), J(b), m);

function ok(state, where) {
  const v = Schema.validate(state);
  assert.ok(v.ok, (where || 'state') + ' validates: ' + v.errors.slice(0, 6).join('; '));
}
function bad(state, re, where) {
  const v = Schema.validate(state);
  assert.equal(v.ok, false, (where || 'state') + ' must NOT validate');
  assert.ok(v.errors.some((e) => re.test(e)), (where || 'state') + ': an error matching ' + re + ' among: ' + v.errors.slice(0, 5).join('; '));
}
/** RNG that counts its draws. */
function counting(seed) {
  const r = RTG.RNG.create(seed);
  const next = r.next.bind(r);
  r.draws = 0;
  r.next = () => { r.draws++; return next(); };
  return r;
}
const rows = (state, kind) => state.finance.ledger.filter((l) => l.kind === kind);
const last = (arr) => arr[arr.length - 1];
const byId = (list, id) => list.find((x) => x.id === id);
const moneyRows = (state) => (state.history.timeline || []).filter((t) => t.kind === 'MONEY');
const moneyHeadlines = (state) => (state.headlines || []).filter((h) => h.tag === 'money');

/** The first seed in 1..2000 whose tick fork (year 1) satisfies `want(child)` — a deterministic search, not luck. */
function seedWhere(want, year) {
  for (let seed = 1; seed <= 2000; seed++) if (want(ffx.childFor(RTG, seed, 'finance:tick:' + (year || 1)))) return seed;
  throw new Error('no seed in 1..2000 satisfies the predicate');
}

const BUST = { mean: 0, sd: 0, bust: 0.5, boom: 0, boomX: 1 };      // half the forks bust on the first child draw
const BOOM = { mean: 0, sd: 0, bust: 0, boom: 0.5, boomX: 3 };      // half the forks boom on the second child draw
const DOUBLE = { mean: 1, sd: 0, bust: 0, boom: 0, boomX: 1 };      // +100 % every year, no noise

// ═══════════════════════════════ API, tuning, catalogue ═══════════════════════════════

test('public API, Tuning.finance, the schema enums and the exported lists', () => {
  for (const f of ['init', 'deposit', 'charge', 'netWorth', 'scale', 'tick', 'opportunities', 'decision', 'apply', 'summary', 'applyServices']) {
    assert.equal(typeof Finance[f], 'function', 'Finance.' + f);
  }
  assert.ok(T && T.scale && T.takeHome && T.lifestyle && T.lifestyle.tiers && T.debt && T.invest && T.services && T.timeline, 'Tuning.finance block');
  assert.equal(T.scale.COLLEGE, 1); assert.ok(T.scale.NFL > T.scale.COLLEGE, 'pro prices are bigger');
  assert.ok(T.takeHome.COLLEGE > 0 && T.takeHome.COLLEGE <= 1 && T.takeHome.NFL > 0 && T.takeHome.NFL <= 1);
  assert.ok(T.ledgerCap >= 12 && T.resale > 0 && T.resale < 1 && T.debt.rate > 0 && T.debt.liquidateAfter >= 1 && T.invest.perYear >= 1);
  deq(Object.keys(T.lifestyle.tiers), ['FRUGAL', 'COMFORTABLE', 'FLASHY', 'BALLER']);
  assert.equal(T.lifestyle.tiers.FRUGAL.cost, 0, 'frugal is free');
  assert.ok(T.lifestyle.tiers.COMFORTABLE.cost < T.lifestyle.tiers.FLASHY.cost && T.lifestyle.tiers.FLASHY.cost < T.lifestyle.tiers.BALLER.cost, 'tiers cost more as they go up');
  deq(Finance.TIERS, ['FRUGAL', 'COMFORTABLE', 'FLASHY', 'BALLER']);
  deq(Finance.SERVICE_IDS, ['PRIVATE_COACH', 'PHYSIO', 'PSYCH']);
  deq(Finance.HOLDING_KINDS, Schema.ENUM.holdingKinds); deq(Finance.RISKS, Schema.ENUM.holdingRisks);
  deq(Finance.LEDGER_KINDS, Schema.ENUM.ledgerKinds); deq(Finance.TIERS, Schema.ENUM.lifestyles);
  assert.ok(Schema.ENUM.decisionKinds.includes('FINANCES'), 'FINANCES is a decision kind');
  assert.ok(Career.DECISION_KINDS.includes('FINANCES'), 'Career knows the FINANCES decision');
  assert.equal(RTG.SAVE_VERSION, 2, 'the money system bumped the save version');
  assert.equal(typeof Save.migrations[1], 'function', 'a v1 → v2 migration exists');
});

test('Data.finance catalogue lint: ~10 purchases, the three services, ≥ 12 investments with sane return models, one scam, an NFL-only pitch', () => {
  assert.ok(D && Array.isArray(D.purchases) && Array.isArray(D.services) && Array.isArray(D.investments), 'RTG.Data.finance shape');
  const EFFECT_KEYS = ['morale', 'fame', 'fans', 'trust'];
  const effectsOk = (o, where) => { for (const k of Object.keys(o || {})) { assert.ok(EFFECT_KEYS.includes(k), where + ': effect key ' + k); assert.equal(typeof o[k], 'number', where + '.' + k); } };
  const uniq = (list, where) => { const seen = {}; for (const e of list) { assert.equal(typeof e.id, 'string', where + ' id'); assert.ok(!seen[e.id], where + ': duplicate id ' + e.id); seen[e.id] = true; } };
  // purchases
  assert.ok(D.purchases.length >= 9 && D.purchases.length <= 14, D.purchases.length + ' purchases');
  uniq(D.purchases, 'purchases');
  for (const p of D.purchases) {
    assert.ok(typeof p.name === 'string' && p.name.length > 2, p.id + ' name');
    assert.ok(typeof p.price === 'number' && p.price > 0 && typeof p.upkeep === 'number' && p.upkeep >= 0, p.id + ' price / upkeep');
    assert.ok(p.upkeep <= p.price, p.id + ': upkeep never exceeds the price');
    effectsOk(p.effects, p.id + '.effects'); effectsOk(p.yearly, p.id + '.yearly');
    assert.ok(typeof p.text === 'string' && p.text.length > 20, p.id + ' flavour text');
    assert.ok(typeof p.icon === 'string' && p.icon.length > 0, p.id + ' icon');
    if (p.leagues !== undefined) assert.ok(Array.isArray(p.leagues) && p.leagues.every((l) => l === 'NFL' || l === 'COLLEGE'), p.id + ' leagues');
  }
  assert.ok(D.purchases.some((p) => (p.effects.fans || 0) > 0 && (p.effects.trust || 0) > 0), 'a purchase that buys fans and trust (the foundation)');
  assert.ok(D.purchases.some((p) => p.price >= 300), 'at least one really big buy');
  assert.ok(D.purchases.some((p) => p.price <= 10), 'and one anyone can afford');
  // services
  deq(D.services.map((s) => s.id).sort(), ['PHYSIO', 'PRIVATE_COACH', 'PSYCH'], 'exactly the three services');
  for (const s of D.services) assert.ok(s.name && s.price > 0 && typeof s.effect === 'string' && s.effect.length && typeof s.text === 'string' && s.text.length > 20, s.id);
  // investments
  assert.ok(D.investments.length >= 12, D.investments.length + ' investments');
  uniq(D.investments, 'investments');
  const SOURCES = ['AGENT', 'TEAMMATE', 'BOOSTER', 'BANK', 'DM'];
  for (const e of D.investments) {
    assert.ok(Schema.ENUM.holdingKinds.includes(e.kind), e.id + ' kind ' + e.kind);
    assert.ok(Schema.ENUM.holdingRisks.includes(e.risk), e.id + ' risk ' + e.risk);
    assert.ok(typeof e.weight === 'number' && e.weight > 0, e.id + ' weight');
    assert.ok(typeof e.min === 'number' && typeof e.max === 'number' && e.min >= 1 && e.min <= e.max, e.id + ' min/max');
    assert.ok(SOURCES.includes(e.source), e.id + ' source ' + e.source);
    assert.ok(typeof e.pitch === 'string' && e.pitch.length >= 40, e.id + ' pitch');
    const m = e.model;
    assert.ok(m && ['mean', 'sd', 'bust', 'boom', 'boomX'].every((k) => typeof m[k] === 'number' && isFinite(m[k])), e.id + ' model');
    assert.ok(m.sd >= 0 && m.bust >= 0 && m.bust <= 1 && m.boom >= 0 && m.boom <= 1 && m.boomX >= 1, e.id + ' model ranges');
    if (e.minFame !== undefined) assert.ok(typeof e.minFame === 'number' && e.minFame >= 0, e.id + ' minFame');
    if (e.leagues !== undefined) assert.ok(Array.isArray(e.leagues) && e.leagues.length, e.id + ' leagues');
  }
  const scams = D.investments.filter((e) => e.kind === 'SCAM');
  assert.equal(scams.length, 1, 'one sure thing');
  assert.equal(scams[0].model.bust, 1, 'the scam always busts');
  assert.ok(!/scam|fraud|ponzi/i.test(scams[0].pitch + scams[0].name), 'the pitch never says so');
  assert.ok(D.investments.some((e) => Array.isArray(e.leagues) && e.leagues.length === 1 && e.leagues[0] === 'NFL' && typeof e.minFame === 'number'), 'an NFL-only, fame-gated pitch');
  for (const risk of ['LOW', 'MED', 'HIGH', 'WILD']) assert.ok(D.investments.some((e) => e.risk === risk), 'a ' + risk + ' pitch');
  const low = D.investments.filter((e) => e.risk === 'LOW'), wild = D.investments.filter((e) => e.risk === 'WILD');
  assert.ok(low.every((e) => e.model.bust === 0 && e.model.sd <= 0.15), 'LOW never busts and barely moves');
  assert.ok(wild.every((e) => e.model.bust >= 0.1), 'WILD can go to zero');
  // caches and JSON safety
  for (const p of D.purchases) assert.equal(D.purchasesById[p.id], p);
  for (const s of D.services) assert.equal(D.servicesById[s.id], s);
  for (const e of D.investments) assert.equal(D.investmentsById[e.id], e);
  deq(J({ p: D.purchases, s: D.services, i: D.investments }), { p: D.purchases, s: D.services, i: D.investments }, 'JSON round trip');
});

// ═══════════════════════════════ block, bank, net worth ═══════════════════════════════

test('init: a fresh block (bank 0, FRUGAL, nothing owned), idempotent, created by Schema.createCareer, validates', () => {
  const s = { year: 1 };
  const f = Finance.init(s);
  assert.equal(f, s.finance);
  deq(f, { bank: 0, lifestyle: 'FRUGAL', planCost: null, owned: [], paid: {}, services: [], holdings: [], closed: [], ledger: [],
    totals: { earned: 0, spent: 0, invested: 0, returned: 0, lost: 0, peakNetWorth: 0 }, debtYears: 0, lastTick: 0, nextId: 1 });
  f.bank = 42;
  assert.equal(Finance.init(s), f, 'idempotent: the same block');
  assert.equal(s.finance.bank, 42);
  const { state } = kfx.newCareer(RTG, { seed: 3 });
  assert.ok(state.finance && state.finance.bank === 0 && state.finance.lifestyle === 'FRUGAL', 'a new career opens the books');
  ok(state, 'new career');
});

test('deposit / charge: integers, the sign is ignored, ledger rows newest last, totals (earned / spent / invested), the ledger cap', () => {
  const { state } = ffx.booksOpen(RTG);
  const f = state.finance;
  const r1 = Finance.deposit(state, 12.4, 'INCOME', 'Pay');
  deq(r1, { year: state.year, kind: 'INCOME', label: 'Pay', delta: 12 });
  assert.equal(f.bank, 12);
  const r2 = Finance.deposit(state, -30, 'EVENT', 'Prize');
  assert.equal(r2.delta, 30); assert.equal(f.bank, 42, 'the sign of k is ignored');
  const r3 = Finance.charge(state, 5.6, 'PURCHASE', 'Thing');
  assert.equal(r3.delta, -6); assert.equal(f.bank, 36);
  Finance.charge(state, 10, 'INVEST', 'Fund');
  Finance.charge(state, 100, 'LIFESTYLE', 'Baller living');
  assert.equal(f.bank, -74, 'a charge may take the bank below zero');
  Finance.deposit(state, 7, 'SELL', 'Sold Fund');
  Finance.deposit(state, 3, 'LIQUIDATION', 'Forced sale');
  deq(f.totals, { earned: 42, spent: 106, invested: 10, returned: 0, lost: 0, peakNetWorth: 0 }, 'SELL / LIQUIDATION are conversions, INVEST is invested, the rest is spent');
  deq(f.ledger.map((l) => l.kind), ['INCOME', 'EVENT', 'PURCHASE', 'INVEST', 'LIFESTYLE', 'SELL', 'LIQUIDATION'], 'newest last');
  assert.equal(f.bank, -64);
  for (let i = 0; i < T.ledgerCap + 5; i++) Finance.deposit(state, 1, 'INCOME', 'row ' + i);
  assert.equal(f.ledger.length, T.ledgerCap, 'the ledger is capped');
  assert.equal(last(f.ledger).label, 'row ' + (T.ledgerCap + 4), 'the newest row survives the cap');
  assert.equal(Finance.deposit(state, 0, 'INCOME', 'nothing').delta, 0);
  ok(state, 'after deposits and charges');
  // a state without a block gets one lazily
  const bare = { year: 2, history: {} };
  Finance.deposit(bare, 5, 'INCOME', 'x');
  assert.equal(bare.finance.bank, 5);
});

test('netWorth = bank + holdings at value + owned purchases at paid × resale (catalogue price × scale when the paid price is unknown)', () => {
  const { state } = ffx.booksOpen(RTG, { bank: 100 });
  const f = state.finance;
  assert.equal(Finance.netWorth(state), 100);
  ffx.holding(RTG, state, { value: 30 });
  ffx.holding(RTG, state, { oppId: 'ROCKET_COIN', kind: 'CRYPTO', risk: 'WILD', invested: 20, value: 0 });
  f.owned.push('USED_TRUCK'); f.paid.USED_TRUCK = 25;
  f.owned.push('SPORTS_CAR');                                     // no paid price recorded (an older save)
  const car = byId(D.purchases, 'SPORTS_CAR'), truck = byId(D.purchases, 'USED_TRUCK');
  assert.equal(Finance.netWorth(state), 100 + 30 + 0 + Math.round(25 * T.resale) + Math.round(car.price * 1 * T.resale));
  ok(state, 'with holdings and purchases');
  state.player.league = 'NFL';
  assert.equal(Finance.netWorth(state), 100 + 30 + Math.round(25 * T.resale) + Math.round(car.price * T.scale.NFL * T.resale), 'the fallback scales with the league, the paid price does not');
  void truck;
});

test('scale: the league sets the price multiplier (COLLEGE 1, NFL ×10); the draft falls back on the stage', () => {
  assert.equal(Finance.scale({ player: { league: 'COLLEGE' }, stage: 'COLLEGE' }), T.scale.COLLEGE);
  assert.equal(Finance.scale({ player: { league: 'NFL' }, stage: 'NFL' }), T.scale.NFL);
  assert.equal(Finance.scale({ player: {}, stage: 'DRAFT' }), T.scale.COLLEGE, 'the draft is priced like college');
  assert.equal(Finance.scale({ player: {}, stage: 'NFL' }), T.scale.NFL, 'no league on the player: the stage decides');
  const c = ffx.booksOpen(RTG).state, n = ffx.booksOpen(RTG, { league: 'NFL' }).state;
  assert.equal(Finance.scale(c), 1); assert.equal(Finance.scale(n), T.scale.NFL);
});

// ═══════════════════════════════ the yearly tick ═══════════════════════════════

test('tick: exactly 1 parent draw whatever the portfolio, null (0 draws) when the year was already ticked, the report shape', () => {
  for (const n of [0, 1, 3]) {
    const { state } = ffx.booksOpen(RTG, { bank: 100 });
    for (let i = 0; i < n; i++) ffx.holding(RTG, state, { value: 10 + i });
    const rng = counting(40 + n);
    const rep = Finance.tick(state, rng);
    assert.equal(rng.draws, 1, n + ' holdings: one parent draw (a fork)');
    assert.ok(rep && rep.year === state.year && rep.returns.length === n, 'a report with a row per holding');
    for (const k of ['returns', 'lifestyle', 'upkeep', 'effects', 'interest', 'broke', 'liquidated', 'bank', 'netWorth']) assert.ok(rep[k] !== undefined, 'report.' + k);
    assert.equal(state.finance.lastTick, state.year);
    assert.equal(Finance.tick(state, rng), null, 'already ticked this year');
    assert.equal(rng.draws, 1, 'the second call draws nothing');
    ok(state, 'ticked with ' + n + ' holdings');
  }
});

test('tick charges the lifestyle plan (cost × scale, a LIFESTYLE row) and applies the tier\'s yearly meter effects, clamped', () => {
  const { state } = ffx.booksOpen(RTG, { bank: 200 });
  const p = state.player, f = state.finance;
  f.lifestyle = 'BALLER';
  p.morale = 50; p.fame = 100; p.fans = 50; p.trust = 1;
  const tier = T.lifestyle.tiers.BALLER;
  const rep = Finance.tick(state, RTG.RNG.create(1));
  assert.equal(rep.lifestyle.tier, 'BALLER'); assert.equal(rep.lifestyle.cost, tier.cost);
  assert.equal(f.bank, 200 - tier.cost);
  const row = last(rows(state, 'LIFESTYLE'));
  assert.equal(row.delta, -tier.cost); assert.match(row.label, /Baller/);
  assert.equal(p.morale, 50 + tier.morale); assert.equal(p.fame, 100 + tier.fame); assert.equal(p.fans, 50 + tier.fans);
  assert.equal(p.trust, Math.max(Tuning.soft.min, 1 + tier.trust), 'trust clamps at the floor');
  assert.equal(rep.effects.morale, tier.morale); assert.equal(rep.effects.trust, p.trust - 1);
  assert.equal(f.debtYears, 0); assert.equal(rep.broke, false);
  ok(state, 'baller year');
  // frugal costs nothing and leaves no row
  const g = ffx.booksOpen(RTG, { bank: 50 }).state;
  Finance.tick(g, RTG.RNG.create(2));
  assert.equal(g.finance.bank, 50); assert.equal(rows(g, 'LIFESTYLE').length, 0);
  // pro prices
  const n = ffx.booksOpen(RTG, { league: 'NFL', bank: 2000 }).state;
  n.finance.lifestyle = 'COMFORTABLE';
  const nr = Finance.tick(n, RTG.RNG.create(3));
  assert.equal(nr.lifestyle.cost, T.lifestyle.tiers.COMFORTABLE.cost * T.scale.NFL);
});

test('tick charges the plan at the price QUOTED when the books closed (finance.planCost) — a plan picked at the last college books costs its college price at the first NFL tick, then re-quotes at NFL scale', () => {
  // the quote: Finance.apply stores planCost at today's scale, for a new plan and for a kept one
  const r = ffx.financesPending(RTG, { bank: 400 });
  Finance.apply(r.state, RTG.RNG.create(1), r.dec, { lifestyle: 'BALLER' });
  assert.equal(r.state.finance.planCost, T.lifestyle.tiers.BALLER.cost, 'quoted at college scale');
  const kept = ffx.financesPending(RTG, { bank: 400 });
  kept.state.finance.lifestyle = 'FLASHY';
  Finance.apply(kept.state, RTG.RNG.create(1), kept.dec, {});
  assert.equal(kept.state.finance.planCost, T.lifestyle.tiers.FLASHY.cost, 'closing with nothing staged still quotes the standing plan');
  // the jump: the same books carried into the NFL — the tick charges the quote, not tier × 10
  const n = ffx.booksOpen(RTG, { league: 'NFL', bank: 2000 }).state;
  n.finance.lifestyle = 'BALLER'; n.finance.planCost = T.lifestyle.tiers.BALLER.cost;
  const rep = Finance.tick(n, RTG.RNG.create(3));
  assert.equal(rep.lifestyle.cost, T.lifestyle.tiers.BALLER.cost, 'the college price the card showed');
  assert.equal(n.finance.bank, 2000 - T.lifestyle.tiers.BALLER.cost);
  assert.equal(n.finance.planCost, null, 'the quote is consumed by the tick');
  ok(n, 'after the quoted tick');
  // the next close re-quotes at NFL scale, so the following tick charges the NFL price the card now shows
  const dec = Finance.decision(n, RTG.RNG.create(4));
  assert.equal(byId(dec.payload.lifestyle.tiers, 'BALLER').cost, T.lifestyle.tiers.BALLER.cost * T.scale.NFL, 'the card shows NFL prices');
  Finance.apply(n, RTG.RNG.create(1), dec, {});
  assert.equal(n.finance.planCost, T.lifestyle.tiers.BALLER.cost * T.scale.NFL);
  n.year += 1;
  assert.equal(Finance.tick(n, RTG.RNG.create(5)).lifestyle.cost, T.lifestyle.tiers.BALLER.cost * T.scale.NFL);
  // no quote at all (fixtures, a migrated save): the tier at today's scale, as before
  const m = ffx.booksOpen(RTG, { league: 'NFL', bank: 2000 }).state;
  m.finance.lifestyle = 'COMFORTABLE'; m.finance.planCost = null;
  assert.equal(Finance.tick(m, RTG.RNG.create(6)).lifestyle.cost, T.lifestyle.tiers.COMFORTABLE.cost * T.scale.NFL);
});

test('tick charges the upkeep of everything owned (UPKEEP rows) and applies each purchase\'s yearly effects', () => {
  const { state } = ffx.booksOpen(RTG, { bank: 300 });
  const p = state.player, f = state.finance;
  p.morale = 50; p.fame = 100; p.trust = 50;
  f.owned = ['USED_TRUCK', 'SPORTS_CAR']; f.paid = { USED_TRUCK: 25, SPORTS_CAR: 90 };
  const truck = byId(D.purchases, 'USED_TRUCK'), car = byId(D.purchases, 'SPORTS_CAR');
  const rep = Finance.tick(state, RTG.RNG.create(4));
  assert.equal(rep.upkeep, truck.upkeep + car.upkeep);
  assert.equal(f.bank, 300 - truck.upkeep - car.upkeep);
  deq(rows(state, 'UPKEEP').map((r) => r.delta), [-truck.upkeep, -car.upkeep]);
  assert.match(rows(state, 'UPKEEP')[0].label, /Used Truck upkeep/);
  assert.equal(p.morale, 50 + (truck.yearly.morale || 0) + (car.yearly.morale || 0));
  assert.equal(p.fame, 100 + (truck.yearly.fame || 0) + (car.yearly.fame || 0));
  assert.equal(p.trust, 50 + (truck.yearly.trust || 0) + (car.yearly.trust || 0));
  ok(state, 'upkeep year');
  // upkeep follows what was PAID, not today's scale: the college truck stays a $2k/yr truck in the NFL; a purchase
  // made at NFL prices pays NFL upkeep; a purchase with no paid record falls back on upkeep × scale
  const n = ffx.booksOpen(RTG, { league: 'NFL', bank: 5000 }).state;
  n.finance.owned = ['USED_TRUCK', 'SPORTS_CAR', 'GOLF_CART'];
  n.finance.paid = { USED_TRUCK: truck.price, SPORTS_CAR: car.price * T.scale.NFL };
  const cart = byId(D.purchases, 'GOLF_CART');
  const nr = Finance.tick(n, RTG.RNG.create(5));
  deq(rows(n, 'UPKEEP').map((r) => r.delta), [-truck.upkeep, -car.upkeep * T.scale.NFL, -cart.upkeep * T.scale.NFL]);
  assert.equal(nr.upkeep, truck.upkeep + car.upkeep * T.scale.NFL + cart.upkeep * T.scale.NFL);
  const pl = Finance.decision(n, RTG.RNG.create(6)).payload;
  assert.equal(byId(pl.purchases, 'USED_TRUCK').upkeep, truck.upkeep, 'the card shows the upkeep that is charged');
  assert.equal(byId(pl.purchases, 'SPORTS_CAR').upkeep, car.upkeep * T.scale.NFL);
  assert.equal(byId(pl.purchases, 'BOAT').upkeep, byId(D.purchases, 'BOAT').upkeep * T.scale.NFL, 'an unowned purchase is quoted at today\'s scale');
});

test('tick revalues every live holding from ONE fork: a bust goes to zero (RETURN row, totals.lost, MONEY timeline, money headline), a boom multiplies by boomX', () => {
  ffx.withModels(RTG, { HIGH: BUST, MED: BOOM }, () => {
    const bustSeed = seedWhere((c) => c.next() < BUST.bust);
    const boomSeed = seedWhere((c) => { c.next(); return c.next() < BOOM.boom; });
    // bust
    let r = ffx.booksOpen(RTG, { bank: 100 });
    let h = ffx.holding(RTG, r.state, { oppId: 'test:bust', name: 'Wing Joint', kind: 'BUSINESS', risk: 'HIGH', value: 40 });
    let rep = Finance.tick(r.state, RTG.RNG.create(bustSeed));
    assert.equal(h.value, 0); deq(h.log, [-1]);
    deq(rep.returns[0], { holdingId: h.id, name: 'Wing Joint', kind: 'BUSINESS', pct: -1, delta: -40, value: 0, bust: true, boom: false });
    assert.equal(last(rows(r.state, 'RETURN')).delta, -40);
    assert.equal(r.state.finance.totals.lost, 40); assert.equal(r.state.finance.totals.returned, 0);
    assert.equal(moneyRows(r.state).length, 1); assert.match(moneyRows(r.state)[0].text, /goes to zero/);
    assert.equal(moneyRows(r.state)[0].impact, T.timeline.impact.bust);
    assert.equal(moneyHeadlines(r.state).length, 1, 'one money headline'); assert.ok(!/\{/.test(moneyHeadlines(r.state)[0].text), 'every slot resolved: ' + moneyHeadlines(r.state)[0].text);
    assert.equal(r.state.finance.bank, 100, 'a paper loss never touches the bank');
    ok(r.state, 'after a bust');
    // dead money stays dead: the next tick skips it (no row, no draws on the child, the log does not grow)
    r.state.year += 1;
    rep = Finance.tick(r.state, RTG.RNG.create(bustSeed));
    assert.equal(rep.returns.length, 0); deq(h.log, [-1]); assert.equal(h.value, 0);
    // boom
    r = ffx.booksOpen(RTG, { bank: 100 });
    h = ffx.holding(RTG, r.state, { oppId: 'test:boom', name: 'Parking App', kind: 'STARTUP', risk: 'MED', value: 40 });
    rep = Finance.tick(r.state, RTG.RNG.create(boomSeed));
    assert.equal(h.value, 40 * BOOM.boomX); deq(h.log, [BOOM.boomX - 1]);
    assert.equal(rep.returns[0].boom, true); assert.equal(rep.returns[0].delta, 40 * (BOOM.boomX - 1));
    assert.equal(r.state.finance.totals.returned, 80); assert.equal(r.state.finance.totals.lost, 0);
    assert.match(moneyRows(r.state)[0].text, /\+200 %/); assert.equal(moneyRows(r.state)[0].impact, T.timeline.impact.boom);
    assert.equal(moneyHeadlines(r.state).length, 1);
    assert.equal(last(rows(r.state, 'RETURN')).delta, 80);
    ok(r.state, 'after a boom');
    // no draws on the child are wasted: a bust seed on a boom model never booms (the streams are the same for both)
    r = ffx.booksOpen(RTG, { bank: 100 });
    h = ffx.holding(RTG, r.state, { oppId: 'test:boom', kind: 'STARTUP', risk: 'MED', value: 40 });
    assert.equal(Finance.tick(r.state, RTG.RNG.create(bustSeed)).returns[0].bust, false, 'chance(bust 0) never busts');
  });
});

test('tick: the scam busts on its first tick whatever its model says; a big return makes the timeline, a small one does not; peak net worth', () => {
  ffx.withModels(RTG, { LOW: ffx.FLAT }, () => {
    const { state } = ffx.booksOpen(RTG, { bank: 50 });
    const scam = ffx.holding(RTG, state, { oppId: 'test:scam', name: 'Sure Thing Fund', kind: 'SCAM', risk: 'LOW', value: 30 });
    const rep = Finance.tick(state, RTG.RNG.create(11));
    assert.equal(scam.value, 0); deq(scam.log, [-1]); assert.equal(rep.returns[0].bust, true);
    assert.equal(state.finance.totals.lost, 30);
    assert.match(moneyRows(state)[0].text, /Sure Thing Fund goes to zero/);
  });
  ffx.withModels(RTG, { LOW: DOUBLE }, () => {
    const { state } = ffx.booksOpen(RTG, { bank: 10 });
    const big = ffx.holding(RTG, state, { oppId: 'test:big', name: 'Big One', risk: 'LOW', value: 100 });
    const small = ffx.holding(RTG, state, { oppId: 'test:small', name: 'Small One', risk: 'LOW', value: 10 });
    const rep = Finance.tick(state, RTG.RNG.create(12));
    assert.equal(big.value, 200); assert.equal(small.value, 20);
    deq(rep.returns.map((x) => x.delta), [100, 10]);
    const tl = moneyRows(state);
    assert.equal(tl.length, 1, 'only the return ≥ Tuning.finance.timeline.minDelta makes the timeline');
    assert.match(tl[0].text, /Big One \+100 %/); assert.equal(tl[0].impact, T.timeline.impact['return']);
    assert.equal(moneyHeadlines(state).length, 0, 'an ordinary return makes no headline');
    assert.equal(state.finance.totals.returned, 110);
    assert.equal(rep.netWorth, 10 + 200 + 20); assert.equal(state.finance.totals.peakNetWorth, 230);
    assert.equal(rep.bank, 10);
    ok(state, 'doubled');
  });
});

test('tick in debt: interest on the overdraft (DEBT row), debtYears++, morale −Tuning.finance.debt.morale, plan back to FRUGAL; an overdraft within the grace floor is not a debt year; a year in the black resets debtYears', () => {
  ffx.withModels(RTG, { LOW: ffx.FLAT }, () => {
    const { state } = ffx.booksOpen(RTG, { bank: -50 });
    const p = state.player, f = state.finance;
    p.morale = 50;
    f.lifestyle = 'BALLER'; f.planCost = T.lifestyle.tiers.BALLER.cost;
    ffx.holding(RTG, state, { oppId: 'test:flat', risk: 'LOW', value: 500 });        // assets, so the debt never exceeds them
    const cost = T.lifestyle.tiers.BALLER.cost;
    const rep = Finance.tick(state, RTG.RNG.create(21));
    const debt = 50 + cost, interest = Math.round(debt * T.debt.rate);
    assert.equal(rep.interest, interest);
    assert.equal(f.bank, -(debt + interest));
    assert.equal(last(rows(state, 'DEBT')).delta, -interest);
    assert.equal(f.debtYears, 1); assert.equal(rep.broke, true);
    assert.equal(p.morale, 50 + T.lifestyle.tiers.BALLER.morale + T.debt.morale, 'the tier\'s lift, then the debt hit');
    assert.equal(f.lifestyle, 'FRUGAL', 'the plan is forced back to frugal'); assert.equal(f.planCost, null, 'and its quote is gone');
    deq(rep.liquidated, [], 'no forced sale in the first year (assets cover the debt)');
    assert.equal(f.holdings.length, 1);
    ok(state, 'first year in debt');
    // back in the black next year: no interest, the counter resets
    state.year += 1;
    Finance.deposit(state, 1000, 'INCOME', 'Pay');
    const rep2 = Finance.tick(state, RTG.RNG.create(22));
    assert.equal(rep2.interest, 0); assert.equal(f.debtYears, 0); assert.equal(rep2.broke, false);
    // the grace floor (Tuning.finance.debt.grace × scale): a small overdraft from event costs is not a debt year —
    // no interest, no morale hit, the plan stays, debtYears stays 0, broke false; one dollar past it is the full step
    assert.ok(T.debt.grace > 0, 'a grace floor exists');
    const g = ffx.booksOpen(RTG, { bank: -T.debt.grace }).state;
    g.player.morale = 50; g.finance.lifestyle = 'COMFORTABLE'; g.finance.planCost = 0;   // a free quote keeps the bank where it is
    const gr = Finance.tick(g, RTG.RNG.create(23));
    assert.equal(gr.interest, 0); assert.equal(g.finance.debtYears, 0); assert.equal(gr.broke, false);
    assert.equal(g.finance.lifestyle, 'COMFORTABLE'); assert.equal(g.player.morale, 50 + T.lifestyle.tiers.COMFORTABLE.morale);
    assert.equal(rows(g, 'DEBT').length, 0);
    const h = ffx.booksOpen(RTG, { bank: -T.debt.grace - 1 }).state;
    h.finance.lifestyle = 'COMFORTABLE'; h.finance.planCost = 0;
    const hr = Finance.tick(h, RTG.RNG.create(24));
    assert.equal(h.finance.debtYears, 1); assert.equal(hr.broke, true); assert.equal(h.finance.lifestyle, 'FRUGAL');
    // the floor scales with the league
    const n = ffx.booksOpen(RTG, { league: 'NFL', bank: -T.debt.grace * T.scale.NFL }).state;
    const nr = Finance.tick(n, RTG.RNG.create(25));
    assert.equal(n.finance.debtYears, 0); assert.equal(nr.broke, false);
  });
});

test('tick liquidation: after Tuning.finance.debt.liquidateAfter years in the red (or once the debt exceeds what could be sold) the smallest asset that clears the debt goes, else the largest, until the bank clears; nothing left → still broke', () => {
  ffx.withModels(RTG, { LOW: ffx.FLAT }, () => {
    const { state } = ffx.booksOpen(RTG, { bank: -50 });
    const f = state.finance;
    f.debtYears = T.debt.liquidateAfter - 1;
    const h1 = ffx.holding(RTG, state, { oppId: 'test:flat', name: 'Small Fund', risk: 'LOW', value: 30 });
    const h2 = ffx.holding(RTG, state, { oppId: 'test:flat', name: 'Big Fund', risk: 'LOW', value: 80 });
    f.owned = ['USED_TRUCK']; f.paid = { USED_TRUCK: 25 };
    const upkeep = byId(D.purchases, 'USED_TRUCK').upkeep;
    const interest = Math.round((50 + upkeep) * T.debt.rate);
    const rep = Finance.tick(state, RTG.RNG.create(31));
    assert.equal(f.debtYears, T.debt.liquidateAfter);
    deq(rep.liquidated, [{ what: 'HOLDING', id: h2.id, name: 'Big Fund', value: 80 }], 'the biggest asset goes first, and only what is needed');
    assert.equal(f.bank, -50 - upkeep - interest + 80);
    assert.ok(f.bank >= 0, 'the sale clears the overdraft');
    deq(f.holdings.map((h) => h.id), [h1.id]); deq(f.owned, ['USED_TRUCK']);
    assert.equal(f.closed.length, 1); assert.equal(f.closed[0].id, h2.id);
    assert.equal(last(rows(state, 'LIQUIDATION')).delta, 80); assert.match(last(rows(state, 'LIQUIDATION')).label, /Forced sale: Big Fund/);
    assert.equal(rep.broke, false);
    assert.ok(moneyRows(state).some((t) => /forced sale of Big Fund/.test(t.text)), 'the forced sale makes the timeline');
    assert.equal(moneyHeadlines(state).length, 1, 'and the news');
    ok(state, 'after a forced sale');
    // a debt bigger than everything: holdings and purchases all go (largest first) and the bank is still in the red
    const r2 = ffx.booksOpen(RTG, { bank: -500 });
    const g = r2.state.finance;
    g.debtYears = T.debt.liquidateAfter - 1;
    const a = ffx.holding(RTG, r2.state, { oppId: 'test:flat', name: 'A', risk: 'LOW', value: 30 });
    const b = ffx.holding(RTG, r2.state, { oppId: 'test:flat', name: 'B', risk: 'LOW', value: 80 });
    g.owned = ['USED_TRUCK', 'SPORTS_CAR']; g.paid = { USED_TRUCK: 25, SPORTS_CAR: 90 };
    const rep2 = Finance.tick(r2.state, RTG.RNG.create(32));
    deq(rep2.liquidated.map((x) => x.id), [b.id, 'SPORTS_CAR', a.id, 'USED_TRUCK'], 'largest first across holdings and purchases');
    deq(rep2.liquidated.map((x) => x.value), [80, Math.round(90 * T.resale), 30, Math.round(25 * T.resale)]);
    deq(g.holdings, []); deq(g.owned, []); deq(g.paid, {});
    assert.ok(g.bank < 0 && rep2.broke, 'nothing left and still in the red');
    assert.equal(g.closed.length, 2);
    ok(r2.state, 'sold out');
    // the insolvency trigger fires in year one only when the debt exceeds what could be sold (net worth < 0)
    const r3 = ffx.booksOpen(RTG, { bank: -100 });
    const c = ffx.holding(RTG, r3.state, { oppId: 'test:flat', name: 'C', risk: 'LOW', value: 60 });
    const rep3 = Finance.tick(r3.state, RTG.RNG.create(33));
    assert.equal(r3.state.finance.debtYears, 1);
    deq(rep3.liquidated.map((x) => x.id), [c.id], 'the debt exceeds the assets: sold in the first year');
    // …and NOT when the assets cover the debt, even by a little (the old test compared the debt to a net worth that
    // already carried the overdraft, so anyone owning less than twice the debt was sold up in the first red year)
    const r4 = ffx.booksOpen(RTG, { bank: -100 });
    ffx.holding(RTG, r4.state, { oppId: 'test:flat', name: 'D', risk: 'LOW', value: 130 });   // > 100 + 12 interest
    const rep4 = Finance.tick(r4.state, RTG.RNG.create(34));
    assert.equal(r4.state.finance.debtYears, 1); assert.equal(rep4.broke, true);
    deq(rep4.liquidated, [], 'assets ≥ debt: a warning year, nothing sold');
    assert.equal(r4.state.finance.holdings.length, 1);
    // the sale order: the smallest asset that clears what is owed — a $7k overdraft sells the $30k fund, not the $900k one
    const r5 = ffx.booksOpen(RTG, { bank: -T.debt.grace - 7 });
    r5.state.finance.debtYears = T.debt.liquidateAfter - 1;
    const big = ffx.holding(RTG, r5.state, { oppId: 'test:flat', name: 'Big', risk: 'LOW', value: 900 });
    const small = ffx.holding(RTG, r5.state, { oppId: 'test:flat', name: 'Small', risk: 'LOW', value: 30 });
    const rep5 = Finance.tick(r5.state, RTG.RNG.create(35));
    deq(rep5.liquidated.map((x) => x.id), [small.id], 'the cheapest asset that covers the debt');
    deq(r5.state.finance.holdings.map((h) => h.id), [big.id]);
    assert.ok(r5.state.finance.bank >= 0);
    // none covers it alone: the largest goes first, then the smallest that clears the rest (95 + 90 + 10 vs 100 + interest)
    const r6 = ffx.booksOpen(RTG, { bank: -100 });
    r6.state.finance.debtYears = T.debt.liquidateAfter - 1;
    const x95 = ffx.holding(RTG, r6.state, { oppId: 'test:flat', name: 'X95', risk: 'LOW', value: 95 });
    const x90 = ffx.holding(RTG, r6.state, { oppId: 'test:flat', name: 'X90', risk: 'LOW', value: 90 });
    const x20 = ffx.holding(RTG, r6.state, { oppId: 'test:flat', name: 'X20', risk: 'LOW', value: 20 });
    const rep6 = Finance.tick(r6.state, RTG.RNG.create(36));
    deq(rep6.liquidated.map((x) => x.id), [x95.id, x20.id], 'largest, then the smallest that clears the remainder');
    deq(r6.state.finance.holdings.map((h) => h.id), [x90.id]);
    assert.ok(r6.state.finance.bank >= 0 && r6.state.finance.bank < 20);
    // a busted holding (value 0) is never "sold" by the bank
    const r7 = ffx.booksOpen(RTG, { bank: -100 });
    r7.state.finance.debtYears = T.debt.liquidateAfter - 1;
    ffx.holding(RTG, r7.state, { oppId: 'SURE_THING', name: 'Sure Thing Fund', kind: 'SCAM', risk: 'WILD', invested: 20, value: 0, log: [-1] });
    const rep7 = Finance.tick(r7.state, RTG.RNG.create(37));
    deq(rep7.liquidated, []); assert.equal(r7.state.finance.holdings.length, 1); assert.equal(rows(r7.state, 'LIQUIDATION').length, 0);
  });
});

// ═══════════════════════════════ opportunities ═══════════════════════════════

test('opportunities: perYear distinct catalogue pitches, scaled amounts, 1 parent draw, pure given the fork, deterministic per seed', () => {
  const { state } = ffx.booksOpen(RTG, { bank: 100 });
  const before = J(state);
  const rng = counting(5);
  const opps = Finance.opportunities(state, rng);
  assert.equal(rng.draws, 1, 'one parent draw (a fork)');
  assert.equal(opps.length, T.invest.perYear);
  assert.equal(new Set(opps.map((o) => o.oppId)).size, opps.length, 'distinct');
  for (const o of opps) {
    const e = D.investmentsById[o.oppId];
    assert.ok(e, o.oppId + ' is in the catalogue');
    assert.equal(o.name, e.name); assert.equal(o.kind, e.kind); assert.equal(o.risk, e.risk); assert.equal(o.pitch, e.pitch); assert.equal(o.source, e.source);
    assert.equal(o.min, e.min); assert.equal(o.max, e.max);
    deq(o.model, e.model);
  }
  deq(state, before, 'pure: the state is untouched');
  deq(Finance.opportunities(state, RTG.RNG.create(5)), opps, 'deterministic for a seed');
  assert.notEqual(JSON.stringify(Finance.opportunities(state, RTG.RNG.create(6)).map((o) => o.oppId)), JSON.stringify(opps.map((o) => o.oppId)), 'another seed, another slate');
  const nfl = ffx.booksOpen(RTG, { league: 'NFL' }).state;
  for (const o of Finance.opportunities(nfl, RTG.RNG.create(7))) {
    const e = D.investmentsById[o.oppId];
    assert.equal(o.min, e.min * T.scale.NFL); assert.equal(o.max, e.max * T.scale.NFL);
  }
});

test('opportunities honour the league and minFame gates and the weights (over many seeds)', () => {
  const gated = D.investments.filter((e) => Array.isArray(e.leagues) && e.leagues.length === 1 && e.leagues[0] === 'NFL' && typeof e.minFame === 'number')[0];
  const heavy = D.investments.reduce((a, b) => (b.weight > a.weight ? b : a));
  const light = D.investments.filter((e) => !e.leagues && e.minFame === undefined).reduce((a, b) => (b.weight < a.weight ? b : a));
  const college = ffx.booksOpen(RTG, { bank: 100 }).state, nfl = ffx.booksOpen(RTG, { league: 'NFL' }).state;
  const count = (state, id, n) => { let k = 0; for (let s = 1; s <= n; s++) if (Finance.opportunities(state, RTG.RNG.create(s)).some((o) => o.oppId === id)) k++; return k; };
  college.player.fame = 999; nfl.player.fame = gated.minFame - 1;
  assert.equal(count(college, gated.id, 200), 0, gated.id + ' is never pitched in college');
  assert.equal(count(nfl, gated.id, 200), 0, gated.id + ' is never pitched below fame ' + gated.minFame);
  nfl.player.fame = gated.minFame;
  assert.ok(count(nfl, gated.id, 200) > 0, gated.id + ' is pitched at fame ' + gated.minFame);
  const h = count(college, heavy.id, 300), l = count(college, light.id, 300);
  assert.ok(h > l * 1.5, heavy.id + ' (w ' + heavy.weight + ') pitched ' + h + '× vs ' + light.id + ' (w ' + light.weight + ') ' + l + '×');
  // every catalogue entry open to college is pitched at some point
  const seen = new Set();
  for (let s = 1; s <= 300; s++) for (const o of Finance.opportunities(college, RTG.RNG.create(s))) seen.add(o.oppId);
  for (const e of D.investments) if (!e.leagues) assert.ok(seen.has(e.id), e.id + ' is drawable');
});

// ═══════════════════════════════ the FINANCES decision ═══════════════════════════════

test('decision: kind FINANCES, DONE first then SKIP, 2 draws (1 once ticked), the payload shapes and the affordable / owned / active flags', () => {
  const { state } = ffx.booksOpen(RTG, { bank: 30 });
  const f = state.finance;
  f.owned = ['GOLF_CART']; f.paid = { GOLF_CART: 8 }; f.services = ['PSYCH'];
  const h = ffx.holding(RTG, state, { value: 10, log: [0.05, -0.02] });
  const dead = ffx.holding(RTG, state, { oppId: 'SURE_THING', kind: 'SCAM', risk: 'WILD', invested: 20, value: 0, log: [-1] });
  const rng = counting(8);
  const dec = Finance.decision(state, rng);
  assert.equal(rng.draws, 2, 'tick fork + pitches fork');
  assert.equal(dec.kind, 'FINANCES');
  deq(dec.options.map((o) => o.id), ['DONE', 'SKIP'], 'DONE first: the unattended default spends nothing');
  assert.ok(dec.options.every((o) => o.label && typeof o.detail === 'string'));
  const pl = dec.payload;
  assert.equal(pl.bank, f.bank); assert.equal(pl.netWorth, Finance.netWorth(state)); assert.equal(pl.scale, 1); assert.equal(pl.league, 'COLLEGE');
  assert.equal(pl.income, 30, 'this year\'s INCOME rows');
  assert.ok(pl.report && pl.report.year === state.year, 'the tick report rides along');
  assert.equal(pl.lifestyle.current, 'FRUGAL');
  deq(pl.lifestyle.tiers.map((t) => t.id), Finance.TIERS);
  for (const t of pl.lifestyle.tiers) { assert.equal(t.cost, T.lifestyle.tiers[t.id].cost); assert.ok(t.label && t.text && t.effects); }
  assert.equal(pl.purchases.length, D.purchases.filter((p) => !p.leagues || p.leagues.includes('COLLEGE')).length);
  const cart = byId(pl.purchases, 'GOLF_CART'), truck = byId(pl.purchases, 'USED_TRUCK'), car = byId(pl.purchases, 'SPORTS_CAR');
  assert.equal(cart.owned, true); assert.equal(cart.affordable, false); assert.equal(cart.resale, Math.round(8 * T.resale));
  assert.equal(truck.owned, false); assert.equal(truck.affordable, truck.price <= f.bank, 'affordable against the bank after the tick');
  assert.equal(car.affordable, false, 'a sports car on $30k: no');
  for (const p of pl.purchases) assert.ok(p.name && typeof p.price === 'number' && typeof p.upkeep === 'number' && p.effects && p.yearly && typeof p.text === 'string' && p.icon);
  deq(pl.services.map((s) => s.id).sort(), ['PHYSIO', 'PRIVATE_COACH', 'PSYCH']);
  assert.equal(byId(pl.services, 'PSYCH').active, true); assert.equal(byId(pl.services, 'PSYCH').affordable, false);
  assert.equal(byId(pl.services, 'PHYSIO').active, false); assert.equal(byId(pl.services, 'PHYSIO').affordable, byId(D.services, 'PHYSIO').price <= f.bank);
  assert.equal(pl.opportunities.length, T.invest.perYear);
  assert.equal(pl.holdings.length, 2);
  const ph = byId(pl.holdings, h.id), pd = byId(pl.holdings, dead.id);
  assert.equal(typeof ph.lastPct, 'number'); assert.equal(ph.dead, false); assert.equal(ph.log.length, 3, 'the tick added a year');
  assert.equal(pd.dead, true); assert.equal(pd.value, 0);
  assert.ok(Array.isArray(pl.ledger) && pl.ledger.length <= 12);
  assert.equal(pl.debtYears, 0); assert.ok(pl.totals && typeof pl.totals.earned === 'number');
  // already ticked: one draw
  const rng2 = counting(9);
  Finance.decision(state, rng2);
  assert.equal(rng2.draws, 1);
  ok(state, 'decision built');
});

// ═══════════════════════════════ apply ═══════════════════════════════

test('apply: sell → lifestyle → services → buy → invest in that order, 0 draws; the plan is stored not charged; services charged now; purchases charge, own, pay, lift the meters and make the timeline; invest opens a holding', () => {
  const r = ffx.financesPending(RTG, { bank: 400 });
  const { state, dec } = r, f = state.finance, p = state.player;
  const h = ffx.holding(RTG, state, { value: 30 });
  p.morale = 50; p.fans = 50; p.trust = 50; p.fame = 100;
  const opp = dec.payload.opportunities[0];
  const bank0 = f.bank, n0 = f.ledger.length;
  const rng = counting(1);
  const receipt = Finance.apply(state, rng, dec, { lifestyle: 'FLASHY', buy: ['PARENTS_HOUSE', 'GOLF_CART'], services: ['PHYSIO'], invest: [{ oppId: opp.oppId, amount: opp.min }], sell: [h.id] });
  assert.equal(rng.draws, 0, 'apply draws nothing');
  deq(receipt.skipped, []);
  deq(receipt.applied.map((a) => a.what), ['sell', 'lifestyle', 'service', 'buy', 'buy', 'invest'], 'the apply order');
  deq(f.ledger.slice(n0).map((l) => l.kind), ['SELL', 'SERVICE', 'PURCHASE', 'PURCHASE', 'INVEST'], 'the ledger tells the same story (the plan is not a charge)');
  const house = byId(D.purchases, 'PARENTS_HOUSE'), cart = byId(D.purchases, 'GOLF_CART'), physio = byId(D.services, 'PHYSIO');
  assert.equal(f.bank, bank0 + 30 - physio.price - house.price - cart.price - opp.min);
  assert.equal(receipt.bankAfter, f.bank); assert.equal(receipt.netWorthAfter, Finance.netWorth(state));
  // lifestyle: stored for the next tick
  assert.equal(f.lifestyle, 'FLASHY');
  deq(receipt.applied[1], { what: 'lifestyle', id: 'FLASHY', from: 'FRUGAL', cost: T.lifestyle.tiers.FLASHY.cost });
  assert.equal(rows(state, 'LIFESTYLE').length, 0, 'no LIFESTYLE charge until the tick');
  // services
  deq(f.services, ['PHYSIO']);
  // purchases
  deq(f.owned, ['PARENTS_HOUSE', 'GOLF_CART']); deq(f.paid, { PARENTS_HOUSE: house.price, GOLF_CART: cart.price });
  assert.equal(p.morale, 50 + (house.effects.morale || 0) + (cart.effects.morale || 0), 'one-off morale');
  assert.equal(p.fans, 50 + (house.effects.fans || 0) + (cart.effects.fans || 0));
  assert.equal(p.trust, 50 + (house.effects.trust || 0) + (cart.effects.trust || 0));
  const tl = moneyRows(state);
  assert.equal(tl.length, 1, 'only the buy ≥ Tuning.finance.timeline.minDelta × scale makes the timeline');
  assert.match(tl[0].text, /Bought Parents' House/);
  // invest
  assert.equal(f.holdings.length, 1);
  const nh = f.holdings[0];
  deq(nh, { id: nh.id, oppId: opp.oppId, name: opp.name, kind: opp.kind, risk: opp.risk, invested: opp.min, value: opp.min, year: state.year, log: [] });
  assert.match(nh.id, /^h\d+$/);
  assert.equal(last(rows(state, 'INVEST')).delta, -opp.min);
  assert.equal(f.totals.invested, opp.min);
  // sell
  assert.equal(last(rows(state, 'SELL')).delta, 30); assert.match(last(rows(state, 'SELL')).label, /Sold Index Fund/);
  assert.equal(f.closed.length, 1); assert.equal(f.closed[0].id, h.id);
  assert.equal(f.totals.returned, 0, 'a sale is a conversion: returned / lost move only at the tick');
  ok(state, 'applied');
});

test('apply skips (never throws) with a reason: unknown tier / service / purchase / holding, booked twice, owned twice, not on offer, taken twice, no amount, unaffordable — and only a non-FINANCES decision throws', () => {
  const r = ffx.financesPending(RTG, { bank: 300 });
  const { state, dec } = r, f = state.finance;
  f.owned = ['GOLF_CART']; f.paid = { GOLF_CART: 8 }; f.services = ['PSYCH'];
  const opp = dec.payload.opportunities[0];
  const bank0 = f.bank;
  const receipt = Finance.apply(state, RTG.RNG.create(1), dec, {
    lifestyle: 'RICH', buy: ['GOLF_CART', 'nope', 'LAKE_HOUSE'], services: ['PSYCH', 'PHYSIO', 'PHYSIO', 'MASSEUSE'],
    invest: [{ oppId: 'not-offered', amount: 10 }, { oppId: opp.oppId, amount: 0 }, { oppId: opp.oppId, amount: opp.min }, { oppId: opp.oppId, amount: opp.min }], sell: ['h99']
  });
  const reasons = {};
  for (const s of receipt.skipped) reasons[s.what + ':' + s.id + (reasons[s.what + ':' + s.id] ? '#2' : '')] = s.reason;
  assert.match(reasons['lifestyle:RICH'], /unknown tier/);
  assert.match(reasons['buy:GOLF_CART'], /already owned/);
  assert.match(reasons['buy:nope'], /no such purchase/);
  assert.match(reasons['buy:LAKE_HOUSE'], /not enough/);
  assert.match(reasons['service:PSYCH'], /already booked/);
  assert.match(reasons['service:PHYSIO'], /already booked/, 'the second PHYSIO in the same list');
  assert.match(reasons['service:MASSEUSE'], /no such service/);
  assert.match(reasons['invest:not-offered'], /not on offer/);
  assert.match(reasons['invest:' + opp.oppId], /no amount/);
  assert.match(reasons['invest:' + opp.oppId + '#2'], /already taken/);
  assert.match(reasons['sell:h99'], /no such holding/);
  deq(receipt.applied.map((a) => a.what + ':' + a.id), ['service:PHYSIO', 'invest:' + opp.oppId]);
  assert.equal(f.bank, bank0 - byId(D.services, 'PHYSIO').price - opp.min);
  assert.equal(f.lifestyle, 'FRUGAL', 'an unknown tier leaves the plan alone');
  assert.equal(f.holdings.length, 1);
  assert.throws(() => Finance.apply(state, RTG.RNG.create(1), { kind: 'BODY_CHECK', payload: {} }, {}), /not a FINANCES decision/);
  assert.throws(() => Finance.apply(state, RTG.RNG.create(1), null, {}), /not a FINANCES decision/);
  deq(Finance.apply(state, RTG.RNG.create(1), dec).skipped, [], 'no actions at all is fine');
  ok(state, 'after the skips');
});

test('apply in debt: a dearer plan is refused while the bank is red (the debt banner\'s "drops to frugal" holds), a cheaper or equal one and a sale that clears the overdraft first are fine', () => {
  const r = ffx.financesPending(RTG, { bank: 0 });
  const { state, dec } = r, f = state.finance;
  f.bank = -40; f.lifestyle = 'FRUGAL';
  const receipt = Finance.apply(state, RTG.RNG.create(1), dec, { lifestyle: 'COMFORTABLE' });
  deq(receipt.applied, []);
  deq(receipt.skipped, [{ what: 'lifestyle', id: 'COMFORTABLE', reason: 'in debt — clear the overdraft first' }]);
  assert.equal(f.lifestyle, 'FRUGAL'); assert.equal(f.planCost, 0, 'the standing plan is still quoted');
  // same or cheaper: fine
  f.lifestyle = 'FLASHY';
  deq(Finance.apply(state, RTG.RNG.create(1), dec, { lifestyle: 'COMFORTABLE' }).skipped, []);
  assert.equal(f.lifestyle, 'COMFORTABLE');
  deq(Finance.apply(state, RTG.RNG.create(1), dec, { lifestyle: 'COMFORTABLE' }).skipped, [], 'keeping the plan is never refused');
  // selling enough to clear the overdraft comes first in the apply order, so the plan goes through
  const h = ffx.holding(RTG, state, { value: 100 });
  const r2 = Finance.apply(state, RTG.RNG.create(1), dec, { sell: [h.id], lifestyle: 'BALLER' });
  deq(r2.skipped, []); deq(r2.applied.map((a) => a.what), ['sell', 'lifestyle']);
  assert.equal(f.lifestyle, 'BALLER'); assert.equal(f.bank, 60);
  ok(state, 'plan after the sale');
});

test('apply sanitises the pitch it is handed: a tampered payload (negative / zero / inverted min-max, an unknown kind or risk) can never open an invalid holding', () => {
  const r = ffx.financesPending(RTG, { bank: 500 });
  const { state, dec } = r, f = state.finance, bank0 = f.bank;
  const opps = dec.payload.opportunities;
  opps[0].min = -100; opps[0].max = -50;                      // clamps up to $1k at least
  opps[1].min = 0; opps[1].max = 0; opps[1].kind = 'LOTTERY'; opps[1].risk = 'INSANE';
  opps[2].min = 80; opps[2].max = 20;                         // inverted: max ≥ min
  const receipt = Finance.apply(state, RTG.RNG.create(1), dec, { invest: [{ oppId: opps[0].oppId, amount: 30 }, { oppId: opps[1].oppId, amount: 30 }, { oppId: opps[2].oppId, amount: 50 }] });
  deq(receipt.skipped, []);
  deq(f.holdings.map((h) => [h.invested, h.value]), [[1, 1], [1, 1], [80, 80]]);
  assert.equal(f.holdings[1].kind, 'BUSINESS'); assert.equal(f.holdings[1].risk, 'MED');
  assert.equal(f.bank, bank0 - 1 - 1 - 80);
  ok(state, 'sanitised stakes');
});

test('apply never takes the bank below zero: affordability is re-checked against the running bank at every step; amounts are integers clamped to [min, max]', () => {
  const r = ffx.financesPending(RTG);
  const { state, dec } = r, f = state.finance;
  f.bank = 30;
  const coach = byId(D.services, 'PRIVATE_COACH'), cart = byId(D.purchases, 'GOLF_CART');
  const opp = dec.payload.opportunities[0];
  const receipt = Finance.apply(state, RTG.RNG.create(1), dec, { services: ['PRIVATE_COACH'], buy: ['GOLF_CART', 'USED_TRUCK'], invest: [{ oppId: opp.oppId, amount: opp.min }] });
  assert.equal(f.bank, 30 - coach.price - cart.price);
  assert.ok(f.bank >= 0);
  deq(receipt.skipped.map((s) => s.what + ':' + s.id + ':' + s.reason), ['buy:USED_TRUCK:not enough in the bank', 'invest:' + opp.oppId + ':not enough in the bank']);
  deq(f.owned, ['GOLF_CART']); deq(f.holdings, []);
  // clamping: a tiny stake becomes the minimum, a huge one the maximum (when the bank allows it)
  const r2 = ffx.financesPending(RTG, { bank: 5000 });
  const o2 = r2.dec.payload.opportunities[0], o3 = r2.dec.payload.opportunities[1];
  const rc = Finance.apply(r2.state, RTG.RNG.create(1), r2.dec, { invest: [{ oppId: o2.oppId, amount: 0.4 + 1 }, { oppId: o3.oppId, amount: 1e9 }] });
  deq(rc.skipped, []);
  assert.equal(r2.state.finance.holdings[0].invested, o2.min, 'clamped up to the minimum');
  assert.equal(r2.state.finance.holdings[1].invested, o3.max, 'clamped down to the maximum');
  assert.ok(r2.state.finance.holdings.every((h) => Number.isInteger(h.invested)));
  // a fractional stake is rounded
  const r3 = ffx.financesPending(RTG, { bank: 5000 });
  const o4 = r3.dec.payload.opportunities[0];
  Finance.apply(r3.state, RTG.RNG.create(1), r3.dec, { invest: [{ oppId: o4.oppId, amount: o4.min + 0.6 }] });
  assert.equal(r3.state.finance.holdings[0].invested, o4.min + 1);
  ok(r2.state, 'clamped stakes');
});

test('apply sell: a live holding is sold at value (SELL row) and remembered in closed[]; a dead one is written off for nothing', () => {
  const r = ffx.financesPending(RTG, { bank: 100 });
  const { state, dec } = r, f = state.finance;
  const live = ffx.holding(RTG, state, { invested: 40, value: 60 });
  const dead = ffx.holding(RTG, state, { oppId: 'SURE_THING', name: 'Sure Thing Fund', kind: 'SCAM', risk: 'WILD', invested: 20, value: 0, log: [-1] });
  const bank0 = f.bank;
  const receipt = Finance.apply(state, RTG.RNG.create(1), dec, { sell: [live.id, dead.id] });
  assert.equal(f.bank, bank0 + 60);
  deq(f.holdings, []);
  deq(receipt.applied.map((a) => [a.what, a.id, a.delta]), [['sell', live.id, 60], ['sell', dead.id, 0]]);
  const sells = rows(state, 'SELL').slice(-2);
  assert.match(sells[0].label, /^Sold /); assert.match(sells[1].label, /^Wrote off Sure Thing Fund/);
  deq(f.closed.map((c) => [c.id, c.pct]), [[live.id, 0.5], [dead.id, -1]]);
  ok(state, 'sold and written off');
});

// ═══════════════════════════════ summary & services ═══════════════════════════════

test('summary: bank, net worth, holdings value, owned names, the plan, best / worst bet across live and closed holdings, debt flag', () => {
  const { state } = ffx.booksOpen(RTG, { bank: 100 });
  const f = state.finance;
  deq(Finance.summary(state), { bank: 100, netWorth: 100, holdingsValue: 0, owned: [], lifestyle: 'FRUGAL', best: null, worst: null, totals: f.totals, debt: false });
  ffx.holding(RTG, state, { name: 'Winner', invested: 50, value: 75 });
  ffx.holding(RTG, state, { name: 'Loser', oppId: 'WING_JOINT', kind: 'BUSINESS', risk: 'HIGH', invested: 50, value: 25 });
  f.closed.push({ id: 'h9', name: 'Middling', kind: 'INDEX', risk: 'LOW', invested: 10, value: 12, year: 1, pct: 0.2 });
  f.owned = ['USED_TRUCK']; f.paid = { USED_TRUCK: 25 };
  f.lifestyle = 'FLASHY';
  const s = Finance.summary(state);
  assert.equal(s.holdingsValue, 100); assert.equal(s.netWorth, 100 + 100 + Math.round(25 * T.resale));
  deq(s.owned, ['Used Truck']); assert.equal(s.lifestyle, 'FLASHY');
  deq(s.best, { name: 'Winner', pct: 0.5, kind: 'INDEX' }); deq(s.worst, { name: 'Loser', pct: -0.5, kind: 'BUSINESS' });
  f.closed.push({ id: 'h10', name: 'Rocket', kind: 'CRYPTO', risk: 'WILD', invested: 10, value: 40, year: 1, pct: 3 });
  assert.equal(Finance.summary(state).best.name, 'Rocket', 'a closed position can be the best bet');
  f.bank = -5;
  assert.equal(Finance.summary(state).debt, true);
});

test('applyServices: the booked services become one-season Modifiers (trainMult ×, injury ×, pressure +) with allowed keys, source finance, +coach XP; services cleared; 0 draws', () => {
  const { state } = ffx.booksOpen(RTG, { bank: 100 });
  const p = state.player, f = state.finance, S = T.services;
  p.mods = []; p.xp = 10;
  f.services = ['PRIVATE_COACH', 'PHYSIO', 'PSYCH'];
  const out = Finance.applyServices(state);
  deq(out.applied, ['PRIVATE_COACH', 'PHYSIO', 'PSYCH']); assert.equal(out.xp, S.coachXp);
  assert.equal(p.xp, 10 + S.coachXp);
  deq(f.services, [], 'consumed');
  assert.equal(p.mods.length, 3);
  const byKey = {}; for (const m of p.mods) byKey[m.key] = m;
  assert.equal(byKey.trainMult.op, 'mul'); assert.equal(byKey.trainMult.value, S.coachTrainMult);
  assert.equal(byKey.injury.op, 'mul'); assert.equal(byKey.injury.value, S.physioInjury);
  assert.equal(byKey.pressure.op, 'add'); assert.equal(byKey.pressure.value, S.psychPressure);
  for (const m of p.mods) {
    assert.ok(Schema.ENUM.modKeys.includes(m.key), m.key + ' is an allowed mod key');
    deq(m.expires, { type: 'season', at: state.year }); assert.equal(m.source, 'finance'); assert.match(m.id, /^finance:(PRIVATE_COACH|PHYSIO|PSYCH):\d+$/);
  }
  assert.equal(Player.modValue(p, 'trainMult', 'mul'), S.coachTrainMult);
  assert.equal(Player.modValue(p, 'pressure', 'add'), S.psychPressure);
  Player.expireMods(p, { type: 'season', at: state.year });
  assert.equal(p.mods.length, 0, 'gone at the season close');
  ok(state, 'services applied');
  deq(Finance.applyServices(state), { applied: [], mods: [], xp: 0 }, 'nothing booked: nothing happens');
  // a duplicate id (only a hand-edited save can carry one) never stacks the mod or the XP
  p.mods = []; p.xp = 10;
  f.services = ['PSYCH', 'PSYCH', 'PRIVATE_COACH', 'PRIVATE_COACH'];
  const dup = Finance.applyServices(state);
  deq(dup.applied, ['PSYCH', 'PRIVATE_COACH']); assert.equal(dup.xp, S.coachXp); assert.equal(p.xp, 10 + S.coachXp);
  assert.equal(p.mods.length, 2); deq(f.services, []);
});

// ═══════════════════════════════ the career: chain, take-home, events, cuts ═══════════════════════════════

test('career: FINANCES follows TRAINING_BLOCKS in both chains, the step builds the decision (2 draws) and DONE closes the books unspent', () => {
  const c = kfx.collegeOff(RTG, { seasons: 1, role: 'K2', js: 60, trust: 60 });
  const cc = Career.offseasonChain(c.state, c.rng);
  assert.equal(cc.steps.indexOf('FINANCES'), cc.steps.indexOf('TRAINING_BLOCKS') + 1, 'college: right after the blocks');
  const n = kfx.nflOff(RTG, { needy: 8 });
  const nc = Career.offseasonChain(n.state, n.rng);
  assert.equal(nc.steps.indexOf('FINANCES'), nc.steps.indexOf('TRAINING_BLOCKS') + 1, 'NFL: right after the blocks');
  // walk to it
  Engine.decide(c.state, c.rng, { kind: 'BODY_CHECK', optionId: 'OK' });
  assert.equal(c.state.pending.decision.kind, 'TRAINING_BLOCKS');
  Engine.decide(c.state, c.rng, { kind: 'TRAINING_BLOCKS', optionId: 'BANK' });
  assert.equal(c.state.pending.decision.kind, 'FINANCES', 'the books open after the blocks');
  assert.equal(c.state.finance.lastTick, c.state.year, 'the step ticked the year');
  const f = c.state.finance, bank = f.bank;
  assert.equal(Engine.autoOption(c.state, c.state.pending.decision), 'DONE', 'the default policy closes the books');
  const out = Engine.decide(c.state, c.rng, { kind: 'FINANCES', optionId: 'DONE' });
  assert.equal(out.result.bankAfter, bank); deq(out.result.applied, []); deq(out.result.skipped, []);
  assert.equal(f.bank, bank, 'an unattended close spends nothing');
  assert.notEqual(c.state.pending && c.state.pending.decision && c.state.pending.decision.kind, 'FINANCES', 'the chain moved on');
  ok(c.state, 'after the books');
  // SKIP is the same as DONE; Engine.settlePending resolves the step by itself
  const s = ffx.financesPending(RTG, { bank: 200 });
  const bank2 = s.state.finance.bank;
  Engine.settlePending(s.state, s.rng, { max: 1 });
  assert.equal(s.state.finance.bank, bank2);
  assert.ok(!s.state.pending || s.state.pending.kind !== 'DECISION' || s.state.pending.decision.kind !== 'FINANCES');
  // the step's draws: Finance.decision costs 2 on a fresh year
  const d = ffx.booksOpen(RTG);
  const rng = counting(3);
  Finance.decision(d.state, rng);
  assert.equal(rng.draws, 2);
});

test('offseasonChain deposits the take-home (payoutSeason × Tuning.finance.takeHome) as one INCOME row; history.earnings stays gross', () => {
  // college NIL
  const c = ffx.booksOpen(RTG, { bank: 0 });
  c.state.player.nil = 40;
  Career.offseasonChain(c.state, c.rng);
  const nilM = Util.roundN(40 / 1000, 3);
  assert.equal(c.state.finance.bank, Math.round(nilM * 1000 * T.takeHome.COLLEGE));
  const row = last(rows(c.state, 'INCOME'));
  assert.equal(row.delta, c.state.finance.bank); assert.match(row.label, /NIL/);
  assert.equal(c.state.finance.totals.earned, c.state.finance.bank);
  ok(c.state, 'college take-home');
  // NFL salary and bonus
  const n = ffx.booksOpen(RTG, { league: 'NFL', bank: 0 });
  const probe = J(n.state);
  const paid = Contracts.payoutSeason(probe);
  assert.ok(paid.total > 0, 'the fixture year pays');
  const gross0 = n.state.history.earnings;
  Career.offseasonChain(n.state, n.rng);
  assert.equal(n.state.finance.bank, Math.round(paid.total * 1000 * T.takeHome.NFL));
  assert.match(last(rows(n.state, 'INCOME')).label, /after tax and agent/);
  assert.ok(Math.abs(n.state.history.earnings - (gross0 + paid.total)) < 1e-9, 'earnings are still the gross career money');
  assert.equal(rows(n.state, 'INCOME').length, 1);
  assert.equal(Career.offseasonChain(n.state, n.rng), Career.offseasonChain(n.state, n.rng), 'idempotent chain: paid once');
  assert.equal(rows(n.state, 'INCOME').length, 1);
  ok(n.state, 'NFL take-home');
});

test('event money moves the bank as well as history.earnings: a prize is an EVENT deposit titled after the event, a cost an EVENT charge that may overdraw', () => {
  let s = efx.forEvent(RTG, 'NIL_TRUCK');
  const e0 = s.history.earnings, b0 = s.finance.bank;
  Events.force(s, RTG.RNG.create(1), 'NIL_TRUCK'); Events.apply(s, RTG.RNG.create(1), 0);
  assert.equal(s.finance.bank, b0 + 40);
  assert.ok(Math.abs(s.history.earnings - (e0 + 0.04)) < 1e-9);
  const row = last(rows(s, 'EVENT'));
  assert.equal(row.delta, 40); assert.match(row.label, /NIL Offer/);
  assert.equal(s.finance.totals.earned, 40);
  ok(s, 'after a prize');
  s = efx.forEvent(RTG, 'PSYCH');
  s.leagues.college.teams.find((t) => t.id === s.player.teamId).prestige = 3;
  s.finance.bank = 5;
  Events.force(s, RTG.RNG.create(1), 'PSYCH'); const out = Events.apply(s, RTG.RNG.create(1), 0);
  assert.equal(out.effects.money, -15);
  assert.equal(s.finance.bank, -10, 'the bank goes into the red');
  assert.equal(last(rows(s, 'EVENT')).delta, -15);
  assert.equal(s.finance.totals.spent, 15);
  ok(s, 'after a cost');
});

test('a cut deposits the take-home of the dead money', () => {
  const state = cfx.nflFinalYear(RTG);
  Finance.init(state);
  state.player.contract = { type: 'VET', years: 4, yearIdx: 1, aav: 4.0, gtdPct: 0.5, signingBonus: 4.0, startYear: 8, paid: 5.0, paidThrough: 0 };
  state.history.contracts.push({ year: 8, league: 'NFL', teamId: 'BOS', type: 'VET', years: 4, aav: 4.0, total: 16, gtdPct: 0.5, signingBonus: 4.0, round: null, endYear: null, reason: 'SIGNED' });
  const r = Contracts.applyCut(state, 'CUT');
  assert.ok(r.deadMoney > 0);
  assert.equal(state.finance.bank, Math.round(r.deadMoney * 1000 * T.takeHome.NFL));
  assert.match(last(rows(state, 'INCOME')).label, /Guaranteed money/);
  ok(state, 'after a cut');
});

test('retire: the legacy report carries the money line (report.finance = Finance.summary, report.netWorth $k)', () => {
  const r = kfx.retired(RTG);
  r.state.stage = 'NFL'; r.state.phase = 'OFF'; r.state.pending = null; r.state.player.role = 'K1'; r.state.player.teamId = 'BOS';
  r.state.player.contract = { type: 'VET', years: 2, yearIdx: 1, aav: 3.4, gtdPct: 0.5, signingBonus: 1.7, startYear: 18, paid: 5.1, paidThrough: 1 };
  r.state.history.teams.push({ teamId: 'BOS', league: 'NFL', fromYear: 5, toYear: null, reason: 'DRAFTED' });
  Finance.init(r.state);
  ffx.fund(RTG, r.state, 900);
  ffx.holding(RTG, r.state, { name: 'Winner', invested: 100, value: 300 });
  r.state.finance.owned = ['LAKE_HOUSE']; r.state.finance.paid = { LAKE_HOUSE: 3500 };
  const report = Career.retire(r.state, RTG.RNG.create(9), 'CHOICE');
  assert.equal(report.netWorth, Finance.netWorth(r.state));
  assert.equal(report.netWorth, 900 + 300 + Math.round(3500 * T.resale));
  deq(report.finance, Finance.summary(r.state));
  assert.equal(report.finance.best.name, 'Winner'); deq(report.finance.owned, ['Lake House']);
  assert.equal(report.earnings, r.state.history.earnings, 'gross earnings stay on the report');
  ok(r.state, 'retired with money');
});

// ═══════════════════════════════ save, schema ═══════════════════════════════

test('save migration v1 → v2: an old save gains a finance block seeded with Tuning.finance.migrateShare of the career earnings as one INCOME row "Career to date"', () => {
  const s = schemaFx.collegeRegWeek5(RTG, { seed: 5 });
  s.history.earnings = 2.5;
  const blob = Save.serialize(s, RTG.RNG.create(1), 1757000000000);
  assert.equal(blob.v, 2); assert.ok(blob.career.finance, 'the finance block is saved as is');
  const old = J(blob);
  delete old.career.finance; old.v = 1; old.career.v = 1;
  old.checksum = Save.checksum(old.career);
  const r = Save.deserialize(J(old));
  assert.equal(r.error, undefined, JSON.stringify(r.errors || '').slice(0, 300));
  assert.equal(r.migrated, true);
  const st = r.state;
  assert.equal(st.v, RTG.SAVE_VERSION);
  assert.ok(st.finance, 'the block exists after the migration');
  assert.equal(st.finance.bank, Math.round(2.5 * 1000 * T.migrateShare));
  deq(st.finance.ledger, [{ year: 0, kind: 'INCOME', label: 'Career to date', delta: st.finance.bank }], 'the seed row is stamped year 0: it is not this year\'s take-home');
  assert.equal(st.finance.totals.earned, st.finance.bank); assert.equal(st.finance.lifestyle, 'FRUGAL'); assert.equal(st.finance.planCost, null);
  deq(st.finance.owned, []); deq(st.finance.holdings, []);
  ok(st, 'migrated v1 save');
  assert.equal(Finance.decision(st, RTG.RNG.create(3)).payload.income, 0, 'the FINANCES card does not show the seed as this year\'s income');
  // a v1 save taken mid-offseason keeps its persisted step list: FINANCES is spliced in after TRAINING_BLOCKS when the
  // chain has not passed that point (idx ≤ the step after TRAINING_BLOCKS), and left alone once it has
  const oldSteps = ['BODY_CHECK', 'TRAINING_BLOCKS', 'REDSHIRT', 'TRANSFER', 'EVENT', 'EVENT', 'DECLARE'];
  const mid = (idx) => { const b = J(old); b.career.flags.offseason = { key: '1:COLLEGE', year: 1, league: 'COLLEGE', steps: oldSteps.slice(), idx, done: false, log: oldSteps.slice(0, idx), skipped: [] }; b.checksum = Save.checksum(b.career); return Save.migrate(b).career.flags.offseason.steps; };
  deq(mid(2), ['BODY_CHECK', 'TRAINING_BLOCKS', 'FINANCES', 'REDSHIRT', 'TRANSFER', 'EVENT', 'EVENT', 'DECLARE'], 'TRAINING_BLOCKS pending: the books still open this year');
  deq(mid(0), ['BODY_CHECK', 'TRAINING_BLOCKS', 'FINANCES', 'REDSHIRT', 'TRANSFER', 'EVENT', 'EVENT', 'DECLARE'], 'chain not started');
  deq(mid(3), oldSteps, 'already past the blocks: the year keeps its chain');
  deq(mid(7), oldSteps, 'chain done');
  // nothing earned yet → an empty bank and no row
  const broke = J(old);
  broke.career.history.earnings = 0;
  broke.checksum = Save.checksum(broke.career);
  const r2 = Save.deserialize(broke);
  assert.equal(r2.error, undefined); assert.equal(r2.state.finance.bank, 0); deq(r2.state.finance.ledger, []);
  // Save.migrate alone upgrades the blob in place and re-checksums it
  const m = Save.migrate(J(old));
  assert.equal(m.v, RTG.SAVE_VERSION); assert.equal(m.career.finance.bank, 1250); assert.equal(m.checksum, Save.checksum(m.career));
  // a v2 save round-trips its books untouched
  const full = ffx.booksOpen(RTG, { bank: 77 }).state;
  ffx.holding(RTG, full, { value: 20, log: [0.1] }); full.finance.owned = ['BOAT']; full.finance.paid = { BOAT: 60 }; full.finance.services = ['PSYCH'];
  const back = Save.deserialize(Save.serialize(full, RTG.RNG.create(2), 1757000000000));
  assert.equal(back.error, undefined); assert.equal(back.migrated, false);
  deq(back.state.finance, full.finance, 'the finance block survives a save / load');
});

test('Schema.validate: the finance block is required from v2 and checked (negative holding value, unknown tier, duplicate owned, bad ledger kind, over-cap ledger, nextId 0); paid / closed are nullable', () => {
  const mk = () => { const s = ffx.booksOpen(RTG, { bank: 10 }).state; ffx.holding(RTG, s, { value: 5 }); s.finance.owned = ['BOAT']; s.finance.paid = { BOAT: 60 }; return s; };
  ok(mk(), 'baseline');
  let s = mk(); s.finance.holdings[0].value = -1; bad(s, /holdings/, 'negative holding value');
  s = mk(); s.finance.lifestyle = 'RICH'; bad(s, /lifestyle/, 'unknown tier');
  s = mk(); s.finance.owned.push('BOAT'); bad(s, /owned.*duplicate|duplicate/, 'owned twice');
  s = mk(); s.finance.ledger.push({ year: 1, kind: 'BOGUS', label: 'x', delta: 1 }); bad(s, /ledger/, 'bad ledger kind');
  s = mk(); for (let i = 0; i < T.ledgerCap + 1; i++) s.finance.ledger.push({ year: 1, kind: 'INCOME', label: 'x', delta: 1 }); bad(s, /ledger/, 'over the cap');
  s = mk(); s.finance.nextId = 0; bad(s, /nextId/, 'nextId 0');
  s = mk(); s.finance.holdings[0].kind = 'LOTTERY'; bad(s, /kind/, 'unknown holding kind');
  s = mk(); s.finance.holdings[0].log = [-2]; bad(s, /log/, 'a return below −100 %');
  s = mk(); s.finance.holdings.push(J(s.finance.holdings[0])); bad(s, /duplicate/, 'duplicate holding id');
  s = mk(); s.finance.bank = 1.5; bad(s, /bank/, 'the bank is an integer');
  s = mk(); delete s.finance; bad(s, /finance/, 'no books on a v2 state');
  s = mk(); s.finance = null; bad(s, /finance/, 'null books on a v2 state');
  s = mk(); s.finance.paid = null; s.finance.closed = null; s.finance.planCost = null; ok(s, 'paid / closed / planCost are nullable');
  // the deeper checks: services unique and known, closed rows shaped, years never ahead of the career, totals ≥ 0, planCost ≥ 0
  s = mk(); s.finance.services = ['PSYCH', 'PSYCH']; bad(s, /services.*duplicate/, 'a service booked twice');
  s = mk(); s.finance.services = ['MASSEUSE']; bad(s, /services.*unknown/, 'an unknown service');
  s = mk(); s.finance.services = ['PSYCH', 'PRIVATE_COACH']; ok(s, 'two distinct services');
  s = mk(); s.finance.closed = ['sold']; bad(s, /closed/, 'a closed row that is not an object');
  s = mk(); s.finance.closed = [{ id: 'h9', name: 'X', kind: 'INDEX', risk: 'LOW', invested: -5, value: 0, year: 1, pct: -1 }]; bad(s, /closed.*invested/, 'a negative closed stake');
  s = mk(); s.finance.closed = [{ id: 'h9', name: 'X', kind: 'INDEX', risk: 'LOW', invested: 5, value: 0, year: 1, pct: -2 }]; bad(s, /closed.*pct/, 'a closed return below −100 %');
  s = mk(); s.finance.closed = [{ id: 'h9', name: 'X', kind: 'INDEX', risk: 'LOW', invested: 5, value: 6, year: 1, pct: 0.2 }]; ok(s, 'a proper closed row');
  s = mk(); s.finance.lastTick = s.year + 1; bad(s, /lastTick/, 'a tick from the future');
  s = mk(); s.finance.holdings[0].year = s.year + 1; bad(s, /holdings.*year/, 'a holding from the future');
  s = mk(); s.finance.totals.peakNetWorth = -1; bad(s, /totals.*peakNetWorth/, 'a negative total');
  s = mk(); s.finance.planCost = -1; bad(s, /planCost/, 'a negative plan quote');
  s = mk(); s.finance.planCost = 12.5; bad(s, /planCost/, 'a fractional plan quote');
  s = mk(); s.finance.planCost = 120; ok(s, 'a plan quote');
});

test('[risk] the yearly expected multiplier of every WILD model is below 1 and below every LOW model (analytic: (1 − bust) · (boom · boomX + (1 − boom) · E[1 + max(−1, N(mean, sd))]))', () => {
  // E[max(−1, X)] for X ~ N(μ, σ): μ + σ · (φ(a) − a · (1 − Φ(a))) with a = (1 + μ) / σ (Util.phi is the normal CDF)
  const clampedMean = (mu, sd) => {
    if (sd <= 0) return Math.max(-1, mu);
    const a = (1 + mu) / sd, pdf = Math.exp(-0.5 * a * a) / Math.sqrt(2 * Math.PI);
    return mu + sd * (pdf - a * (1 - Util.phi(a)));
  };
  const ev = (m) => (1 - m.bust) * (m.boom * m.boomX + (1 - m.boom) * (1 + clampedMean(m.mean, m.sd)));
  const byRisk = { LOW: [], MED: [], HIGH: [], WILD: [] };
  for (const e of D.investments) byRisk[e.risk].push({ id: e.id, ev: ev(e.model) });
  const lowMin = Math.min(...byRisk.LOW.map((x) => x.ev));
  for (const w of byRisk.WILD) {
    assert.ok(w.ev < 1, w.id + ': yearly E[×] ' + w.ev.toFixed(3) + ' must be < 1 — real risk, real loss');
    assert.ok(w.ev < lowMin, w.id + ': yearly E[×] ' + w.ev.toFixed(3) + ' must be below every LOW model (' + lowMin.toFixed(3) + ')');
  }
  assert.ok(lowMin >= 1, 'LOW compounds: ' + lowMin.toFixed(3));
  // the analytic figure matches the real tick (one live holding, one year, many seeds) within Monte-Carlo noise
  const base = ffx.booksOpen(RTG, { league: 'NFL', bank: 0 }).state;
  for (const e of D.investments.filter((x) => x.risk === 'WILD' && x.kind !== 'SCAM')) {
    let sum = 0;
    const N = 4000;
    for (let s = 0; s < N; s++) {
      const st = Util.deepClone(base);
      const h = ffx.holding(RTG, st, { oppId: e.id, kind: e.kind, risk: e.risk, name: e.name, value: 1000, log: [0] });
      Finance.tick(st, RTG.RNG.create(7919 * s + 3));
      sum += h.value;
    }
    const measured = sum / (N * 1000);
    assert.ok(Math.abs(measured - ev(e.model)) < 0.12, e.id + ': measured ' + measured.toFixed(3) + ' vs analytic ' + ev(e.model).toFixed(3));
    assert.ok(measured < 1.02, e.id + ': measured yearly E[×] ' + measured.toFixed(3));
  }
});

// ═══════════════════════════════ whole careers ═══════════════════════════════

test('autoPlayCareer to RETIRED on 3 seeds: the books validate after every season, every offseason closes them unspent (DONE), totals add up, the money is deterministic for a seed', () => {
  const run = (seed, maxYears) => {
    const { state, rng } = kfx.newCareer(RTG, { seed });
    let finances = 0, seasons = 0;
    Engine.autoPlayCareer(state, rng, {
      maxYears, onSeason: (s) => { seasons++; ok(s, 'seed ' + seed + ' after season ' + seasons); },
      decide: (s, dec) => { if (dec.kind === 'FINANCES') { finances++; assert.equal(dec.options[0].id, 'DONE'); } return Engine.autoOption(s, dec); }
    });
    return { state, finances, seasons };
  };
  for (const seed of [101, 202, 303]) {
    const { state, finances, seasons } = run(seed, 18);
    const f = state.finance;
    ok(state, 'seed ' + seed + ' final');
    assert.ok(seasons >= 4, 'seed ' + seed + ': ' + seasons + ' seasons');
    assert.ok(finances >= seasons - 1 && finances <= seasons, 'seed ' + seed + ': the books opened every offseason (' + finances + ' for ' + seasons + ' seasons)');
    assert.ok(Number.isInteger(f.bank), 'integer bank');
    deq(f.owned, []); deq(f.holdings, []); deq(f.services, []); assert.equal(f.totals.invested, 0, 'seed ' + seed + ': autoplay never spends');
    assert.equal(f.lifestyle, 'FRUGAL');
    assert.equal(f.bank, f.totals.earned - f.totals.spent, 'seed ' + seed + ': bank = earned − spent when nothing was ever invested');
    assert.ok(f.totals.earned > 0, 'seed ' + seed + ': a career earns something');
    assert.ok(f.totals.peakNetWorth >= Finance.netWorth(state) || f.bank < 0, 'seed ' + seed + ': the peak is remembered');
    assert.ok(rows(state, 'INCOME').length >= 1, 'seed ' + seed + ': take-home on the ledger');
    assert.ok(f.ledger.length <= T.ledgerCap);
    assert.equal(Finance.summary(state).netWorth, Finance.netWorth(state));
  }
  const a = run(404, 14), b = run(404, 14);
  assert.equal(Util.deepDiff(J(a.state.finance), J(b.state.finance)), '', 'same seed → identical books');
  assert.equal(a.finances, b.finances);
});

test('[risk] real risk, real loss: over ten ticks an all-WILD portfolio loses money more often than not, an all-LOW one almost never does (200 seeds each)', () => {
  const ride = (ids, seeds) => {
    let losers = 0, zero = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const { state } = ffx.booksOpen(RTG, { bank: 0 });
      for (const id of ids) { const e = D.investmentsById[id]; ffx.holding(RTG, state, { oppId: id, name: e.name, kind: e.kind, risk: e.risk, value: 50 }); }
      const rng = RTG.RNG.create(seed);
      for (let y = 0; y < 10; y++) { state.year += 1; Finance.tick(state, rng); }
      const end = state.finance.holdings.reduce((a, h) => a + h.value, 0);
      if (end < 50 * ids.length) losers++;
      if (end === 0) zero++;
      assert.equal(state.finance.bank, 0, 'paper moves never touch the bank');
    }
    return { losers, zero };
  };
  const wild = ride(D.investments.filter((e) => e.risk === 'WILD').map((e) => e.id), 200);
  assert.ok(wild.losers > 100, 'all-WILD loses money in ' + wild.losers + ' / 200 careers');
  const low = ride(D.investments.filter((e) => e.risk === 'LOW').map((e) => e.id), 200);
  assert.ok(low.losers < 20, 'all-LOW loses money in only ' + low.losers + ' / 200 careers');
  assert.equal(low.zero, 0, 'LOW never goes to zero');
});
