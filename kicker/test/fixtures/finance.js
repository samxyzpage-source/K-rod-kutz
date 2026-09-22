/**
 * Money fixtures (the money system: engine/finance.js → RTG.Finance, state.finance). Plain factories that take RTG
 * (from test/load.js) and return VALID CareerStates at the points the money code operates on, plus helpers that
 * drive the FINANCES step deterministically.
 *
 *   const ffx = require('./fixtures/finance');
 *   const r = ffx.financesPending(RTG, { league: 'COLLEGE', bank: 300 });   // the FINANCES decision pending (year-1 chain, BODY_CHECK + TRAINING_BLOCKS done)
 *   const r = ffx.financesPending(RTG, { league: 'NFL' });                  // same in the NFL (final rookie year)
 *   const out = ffx.closeBooks(RTG, state, rng, { buy: ['USED_TRUCK'] });   // Engine.decide FINANCES / DONE with staged actions → the decide result (out.result = receipt)
 *   const s = ffx.booksOpen(RTG, { league: 'COLLEGE', bank: 100 });         // a valid state with a fresh finance block and money in the bank, nothing pending
 *   ffx.holding(RTG, state, { oppId: 'INDEX_FUND', value: 50 });            // push a live holding (validates) and return it
 *   ffx.withModels(RTG, { LOW: {...} }, fn)                                  // run fn with Tuning.finance.invest.models patched (restored after)
 *   ffx.FLAT                                                                 // a return model that never moves (mean 0, sd 0, no bust, no boom)
 *   ffx.childFor(RTG, seed, label)                                           // the RNG a fresh RNG.create(seed) forks for `label` (rng.fork is fnv1a32(state + label))
 *
 * Every builder returns fresh objects and is deterministic for a seed.
 */
'use strict';

var kfx = require('./career');

var DEFAULT_SEED = 7;

/** A return model that never moves: value stays put whatever the fork draws. */
var FLAT = { mean: 0, sd: 0, bust: 0, boom: 0, boomX: 1 };

/** Put $k in the bank as INCOME (0 draws) — the default label reads like a season's pay. */
function fund(RTG, state, k, label) {
  if (typeof k !== 'number' || k === 0) return state.finance;
  if (k > 0) RTG.Finance.deposit(state, k, 'INCOME', label || 'Fixture money');
  else RTG.Finance.charge(state, -k, 'EVENT', label || 'Fixture cost');
  return state.finance;
}

/**
 * A valid career state with a fresh finance block and `opts.bank` ($k) in it, nothing pending, chain not started:
 * COLLEGE.OFF (opts.seasons, default 1) or NFL.OFF (final rookie year). @returns {{state, rng}}
 */
function booksOpen(RTG, opts) {
  opts = opts || {};
  var r = opts.league === 'NFL' ? kfx.nflOff(RTG, opts) : kfx.collegeOff(RTG, Object.assign({ seasons: 1 }, opts));
  RTG.Finance.init(r.state);
  fund(RTG, r.state, opts.bank);
  return r;
}

/**
 * The FINANCES decision pending: the offseason chain opened on a fresh OFF state, BODY_CHECK acknowledged and
 * TRAINING_BLOCKS banked, so the next step (FINANCES) built its decision. opts.bank ($k) is deposited BEFORE the chain
 * opens (so the take-home of the season lands on top of it); opts.league 'COLLEGE' (default) | 'NFL'.
 * @returns {{state, rng, dec, chain, income}} income = the take-home the chain deposited ($k)
 */
function financesPending(RTG, opts) {
  opts = opts || {};
  var r = booksOpen(RTG, opts);
  var before = r.state.finance.bank;
  var chain = RTG.Career.offseasonChain(r.state, r.rng);
  var income = r.state.finance.bank - before;
  var guard = 6;
  while (r.state.pending && guard-- > 0) {
    var pd = r.state.pending;
    if (pd.kind !== 'DECISION') throw new Error('fixtures/finance: unexpected pending ' + pd.kind + ' on the way to FINANCES');
    var kind = pd.decision.kind;
    if (kind === 'FINANCES') break;
    if (kind === 'BODY_CHECK') RTG.Engine.decide(r.state, r.rng, { kind: 'BODY_CHECK', optionId: 'OK' });
    else if (kind === 'TRAINING_BLOCKS') RTG.Engine.decide(r.state, r.rng, { kind: 'TRAINING_BLOCKS', optionId: 'BANK' });
    else throw new Error('fixtures/finance: unexpected decision ' + kind + ' before FINANCES');
  }
  if (!r.state.pending || r.state.pending.kind !== 'DECISION' || r.state.pending.decision.kind !== 'FINANCES') {
    throw new Error('fixtures/finance: the chain did not reach FINANCES (pending ' + (r.state.pending ? r.state.pending.kind : 'none') + ')');
  }
  r.dec = r.state.pending.decision;
  r.chain = chain;
  r.income = income;
  return r;
}

/** Close the books through the facade with staged actions. @returns {Object} the Engine.decide result (result = the receipt) */
function closeBooks(RTG, state, rng, actions) {
  return RTG.Engine.decide(state, rng, { kind: 'FINANCES', optionId: 'DONE', extra: actions || {} });
}

/**
 * Push a live holding onto state.finance.holdings (ids follow finance.nextId). Defaults: an Index Fund worth what
 * was put in ($50k), bought this year, no history. Pass `oppId` outside the catalogue (e.g. 'test:flat') with a
 * `risk` to route the tick through Tuning.finance.invest.models[risk] (see withModels / FLAT).
 * @returns {Object} the holding
 */
function holding(RTG, state, opts) {
  opts = opts || {};
  var f = RTG.Finance.init(state);
  var invested = typeof opts.invested === 'number' ? opts.invested : (typeof opts.value === 'number' ? opts.value : 50);
  var h = {
    id: opts.id || ('h' + f.nextId++),
    oppId: opts.oppId || 'INDEX_FUND',
    name: opts.name || (opts.oppId ? String(opts.oppId).replace(/[_:]/g, ' ') : 'Index Fund'),
    kind: opts.kind || 'INDEX',
    risk: opts.risk || 'LOW',
    invested: invested,
    value: typeof opts.value === 'number' ? opts.value : invested,
    year: typeof opts.year === 'number' ? opts.year : state.year,
    log: Array.isArray(opts.log) ? opts.log.slice() : []
  };
  f.holdings.push(h);
  return h;
}

/** Run fn() with Tuning.finance.invest.models patched (only the risks given); the originals are restored afterwards. */
function withModels(RTG, models, fn) {
  var M = RTG.Tuning.finance.invest.models, saved = {};
  for (var k in models) if (Object.prototype.hasOwnProperty.call(models, k)) { saved[k] = M[k]; M[k] = models[k]; }
  try { return fn(); }
  finally { for (var j in saved) if (Object.prototype.hasOwnProperty.call(saved, j)) M[j] = saved[j]; }
}

/** The child rng a fresh RNG.create(seed) hands out for fork(label) — the tick's stream for that seed and year. */
function childFor(RTG, seed, label) {
  var parent = RTG.RNG.create(seed);
  return RTG.RNG.create(RTG.Util.fnv1a32(String(parent.state()) + String(label)));
}

module.exports = {
  DEFAULT_SEED: DEFAULT_SEED,
  FLAT: FLAT,
  fund: fund,
  booksOpen: booksOpen,
  financesPending: financesPending,
  closeBooks: closeBooks,
  holding: holding,
  withModels: withModels,
  childFor: childFor
};
