/**
 * perf.test.js — engine budgets (SPEC §2.13 / §3.9): a full auto season < Tuning.perf.seasonMs (250 ms) and a
 * full auto career < Tuning.perf.careerMs (4 s), engine only, on Node.
 *
 * The engine is evaluated in this process's main context (load({realm:'this'})) — the realm a browser runs it in.
 * The default test loader evaluates the files in a vm context; with load.js's builtin-shadowing wrapper that realm
 * is within ~15 % of the main one, and its numbers are printed here for the record as well.
 *
 * Timing method: one warm-up season (JIT) is excluded; seasons are timed one by one (Engine.autoPlaySeason from
 * PRE, with the offseason resolved separately by Engine.autoPlayOffseason and not counted), the median per league
 * is asserted; the career budget is asserted on a second, fresh career (Engine.newCareer + Engine.autoPlayCareer).
 *
 *   node kicker/test/perf.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load');
const RTG = load({ realm: 'this' });

const { Engine, Tuning } = RTG;
const B = Tuning.perf;
const NOW = 1757000000000;

const now = () => Number(process.hrtime.bigint()) / 1e6;
const median = (arr) => { const s = arr.slice().sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const fmt = (arr) => arr.length ? 'min ' + Math.min.apply(null, arr).toFixed(0) + ' · median ' + median(arr).toFixed(0) + ' · max ' + Math.max.apply(null, arr).toFixed(0) + ' ms (n=' + arr.length + ')' : 'n/a';
const PLAYING = { COLLEGE: true, NFL: true };
const IN_SEASON = { PRE: true, REG: true, POST: true };

/** Play a career season by season with an engine `E`, timing each Engine.autoPlaySeason call. */
function timedSeasons(E, seed, warmup) {
  const { state, rng } = E.newCareer({ name: 'Perf', archetype: 'SURGEON', difficulty: 'pro', seed }, NOW);
  E.settlePending(state, rng);                                             // showcase + offer → COLLEGE.PRE
  const times = { COLLEGE: [], NFL: [], skipped: 0 };
  let guard = 60;
  while (state.stage !== 'RETIRED' && guard-- > 0) {
    if (PLAYING[state.stage] && IN_SEASON[state.phase]) {
      const league = state.stage;
      const t0 = now();
      E.autoPlaySeason(state, rng);
      const ms = now() - t0;
      if (times.skipped < warmup) times.skipped++; else times[league].push(ms);
    } else {
      E.autoPlayOffseason(state, rng);
    }
  }
  assert.equal(state.stage, 'RETIRED', 'the timed career retired');
  return times;
}

test('a full auto season runs under ' + B.seasonMs + ' ms (median per league, main realm, after ' + B.warmupSeasons + ' warm-up season)', (t) => {
  const times = timedSeasons(Engine, 21, B.warmupSeasons);
  const all = times.COLLEGE.concat(times.NFL);
  t.diagnostic('college seasons: ' + fmt(times.COLLEGE));
  t.diagnostic('NFL seasons: ' + fmt(times.NFL));
  t.diagnostic('all seasons: ' + fmt(all));
  assert.ok(times.COLLEGE.length >= 1 && times.NFL.length >= 4, 'enough seasons timed');
  assert.ok(median(times.COLLEGE) < B.seasonMs, 'college season median ' + median(times.COLLEGE).toFixed(0) + ' ms ≥ ' + B.seasonMs);
  assert.ok(median(times.NFL) < B.seasonMs, 'NFL season median ' + median(times.NFL).toFixed(0) + ' ms ≥ ' + B.seasonMs);
});

test('a full auto career runs under ' + B.careerMs + ' ms (Engine.newCareer + autoPlayCareer, main realm)', (t) => {
  const t0 = now();
  const { state, rng } = Engine.newCareer({ name: 'Perf', archetype: 'CANNON', difficulty: 'pro', seed: 22 }, NOW);
  Engine.autoPlayCareer(state, rng, {});
  const ms = now() - t0;
  assert.equal(state.stage, 'RETIRED');
  t.diagnostic('career: ' + ms.toFixed(0) + ' ms for ' + state.history.seasons.length + ' seasons (' + (ms / state.history.seasons.length).toFixed(0) + ' ms/season incl. offseasons)');
  assert.ok(ms < B.careerMs, 'career ' + ms.toFixed(0) + ' ms ≥ ' + B.careerMs);
});

test('for the record: the same season timings in the default vm-context loader (not asserted)', (t) => {
  const VM = load();                                                       // the realm every other test file uses
  const times = timedSeasons(VM.Engine, 21, B.warmupSeasons);
  t.diagnostic('vm realm college seasons: ' + fmt(times.COLLEGE));
  t.diagnostic('vm realm NFL seasons: ' + fmt(times.NFL));
});
