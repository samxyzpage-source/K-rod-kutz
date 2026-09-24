/**
 * balance.test.js [balance] — the QB v2 ("draw the pass") headline balance targets, pinned with small samples of
 * six-moment drives played by the headless bots (qb/test/fixtures/bots.js) through the real store (RTG.UI.Store).
 *
 * Slow (about a minute, ≈ 11 000 snaps): skipped by `node qb/test/run.js`, run with
 *   node qb/test/run.js balance --balance        or        node qb/test/balance.test.js
 *
 * Every seed is fixed, so a run is deterministic; the bands below are the targets widened for the sample size (the
 * full tables — 2000 drives per cell over 4 archetypes × 3 teams — come from the scratch probe and are in the balance
 * report). What is pinned, on the AVERAGE team unless said otherwise:
 *   the three skill tiers   EXPERT 75–85 % completions / ≤ 2 % INT · DECENT 60–70 % / 3–5 % · NOVICE 40–50 % / 8–12 % /
 *                           15–25 % sacked
 *   the line                BAD vs GREAT: fewer completions (≈ −10 points) and more sacks
 *   the last play           EXPERT wins it 35–55 %, NOVICE 5–20 %
 *   the strategies          CHECKDOWN 4–6 yd a play, never better than DECENT, (almost) never wins the last play ·
 *                           SCRAMBLER on a DUAL THREAT 4–7 yd a play but below DECENT's expected points · ROLLOUT cuts
 *                           DECENT's sacks by ≥ 30 % · LOB_ONLY and BULLET_ONLY each worse than mixing the loft (EXPERT)
 *   the no-read throw       QUICK (a touch pass at 0.7 s to whoever looks most open) completes under 72 % and is worth
 *                           at least 0.2 expected points a play less than DECENT's reading (a ball that beats the break)
 *   the call                a GOOD call vs the real coverage completes ≥ 8 points more than a BAD one (DECENT)
 *   the archetypes          SURGEON the smallest scatter, GUNSLINGER the most yards per attempt and the deepest intended
 *                           air yards (DECENT and EXPERT pooled), FIELD GENERAL the best decision rate (EXPERT)
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load');
const RTG = load({ realm: 'this' });
const Bots = require('./fixtures/bots')(RTG);

const ARCHS = ['GUNSLINGER', 'SURGEON', 'FIELD_GENERAL', 'DUAL_THREAT'];
const SEED0 = +(process.env.RTG_BALANCE_SEED || 424200);   // RTG_BALANCE_SEED=… to check the bands hold for another sample
const cache = {};

/** The raw tallies of `drives` drives of one archetype (memoised: the tests share their samples). */
function cell(bot, team, drives, arch) {
  const key = [bot, team, drives, arch].join('|');
  if (!cache[key]) {
    const acc = Bots.counters();
    for (let i = 0; i < drives; i++) Bots.tally(Bots.drive(bot, { seed: SEED0 + i, archetype: arch, team }).records, acc);
    cache[key] = acc;
  }
  return cache[key];
}
/** The rates of `drives` drives per archetype (archs, default all four) for a bot and a team preset. */
function run(bot, team, drives, archs) {
  const acc = Bots.counters();
  for (const arch of archs || ARCHS) Bots.merge(acc, cell(bot, team, drives, arch));
  return Bots.derive(acc);
}
// the sample sizes (drives per archetype): the reading bots are slow (EXPERT ≈ 45 ms a drive), the rest fast
const N = { EXPERT: 150, ONE_LOFT: 100, DECENT: 300, NOVICE: 300, LINE: 150, CHECKDOWN: 150, SCRAMBLE: 300, ROLLOUT: 300, CALL: 200, QUICK: 300 };
const pct = (x) => (100 * x).toFixed(1) + '%';
function band(x, lo, hi, what) { assert.ok(x >= lo && x <= hi, what + ' ' + (typeof x === 'number' && x < 1.5 ? pct(x) : x.toFixed(2)) + ' outside [' + lo + ', ' + hi + ']'); }

test('the tiers on AVERAGE: EXPERT 75–85 % / ≤ 2 % INT · DECENT 60–70 % / 3–5 % · NOVICE 40–50 % / 8–12 % / 15–25 % sacked', () => {
  const ex = run('EXPERT', 'AVERAGE', N.EXPERT), de = run('DECENT', 'AVERAGE', N.DECENT), no = run('NOVICE', 'AVERAGE', N.NOVICE);
  band(ex.cmpPct, 0.72, 0.88, 'EXPERT completions'); band(ex.intPct, 0, 0.03, 'EXPERT picks');
  band(de.cmpPct, 0.57, 0.73, 'DECENT completions'); band(de.intPct, 0.015, 0.065, 'DECENT picks');
  band(no.cmpPct, 0.37, 0.53, 'NOVICE completions'); band(no.intPct, 0.06, 0.14, 'NOVICE picks'); band(no.sackPct, 0.12, 0.28, 'NOVICE sacked');
  assert.ok(ex.cmpPct > de.cmpPct + 0.08 && de.cmpPct > no.cmpPct + 0.1, 'the tiers are ordered with room between them');
  assert.ok(ex.epaPerPlay > de.epaPerPlay && de.epaPerPlay > no.epaPerPlay, 'and so is the expected points');
});

test('the line: behind the BAD line fewer completions and more sacks than behind the GREAT one', () => {
  const bad = run('DECENT', 'BAD', N.LINE), great = run('DECENT', 'GREAT', N.LINE);
  assert.ok(great.cmpPct - bad.cmpPct >= 0.06, 'completions BAD ' + pct(bad.cmpPct) + ' vs GREAT ' + pct(great.cmpPct));
  assert.ok(bad.sackPct >= 1.5 * great.sackPct && bad.sackPct > great.sackPct + 0.04, 'sacks BAD ' + pct(bad.sackPct) + ' vs GREAT ' + pct(great.sackPct));
});

test('the last play (only a touchdown wins it): EXPERT 35–55 %, NOVICE 5–20 %', () => {
  band(run('EXPERT', 'AVERAGE', N.EXPERT).lastWinPct, 0.28, 0.6, 'EXPERT last-play wins');
  band(run('NOVICE', 'AVERAGE', N.NOVICE).lastWinPct, 0.04, 0.22, 'NOVICE last-play wins');
});

test('the strategies: CHECKDOWN, SCRAMBLER, ROLLOUT, one loft only — none of them beats playing it straight', () => {
  const de = run('DECENT', 'AVERAGE', N.DECENT), ck = run('CHECKDOWN', 'AVERAGE', N.CHECKDOWN);
  band(ck.ydsPerPlay, 3.5, 6.5, 'CHECKDOWN yd a play');
  assert.ok(ck.epaPerPlay < de.epaPerPlay, 'CHECKDOWN ' + ck.epaPerPlay.toFixed(2) + ' EPA below DECENT ' + de.epaPerPlay.toFixed(2));
  assert.ok(ck.lastWinPct <= 0.03, 'CHECKDOWN never wins the last play: ' + pct(ck.lastWinPct));
  const sc = run('SCRAMBLER', 'AVERAGE', N.SCRAMBLE, ['DUAL_THREAT']), deDual = run('DECENT', 'AVERAGE', N.SCRAMBLE, ['DUAL_THREAT']);
  band(sc.ydsPerPlay, 3.5, 7.5, 'SCRAMBLER (DUAL THREAT) yd a play');
  assert.ok(sc.epaPerPlay < deDual.epaPerPlay, 'SCRAMBLER ' + sc.epaPerPlay.toFixed(2) + ' EPA below DECENT passing ' + deDual.epaPerPlay.toFixed(2));
  const ro = run('ROLLOUT', 'AVERAGE', N.ROLLOUT);
  assert.ok(ro.sackPct <= 0.7 * de.sackPct, 'ROLLOUT sacked ' + pct(ro.sackPct) + ' vs standing in ' + pct(de.sackPct));
  assert.ok(ro.sdAvg >= de.sdAvg, 'at an accuracy cost (throwing on the run)');
  const ex = run('EXPERT', 'AVERAGE', N.EXPERT), lob = run('LOB_ONLY', 'AVERAGE', N.ONE_LOFT), bul = run('BULLET_ONLY', 'AVERAGE', N.ONE_LOFT);
  assert.ok(lob.epaPerPlay < ex.epaPerPlay - 0.5, 'LOB_ONLY ' + lob.epaPerPlay.toFixed(2) + ' vs mixing ' + ex.epaPerPlay.toFixed(2));
  // the bullet's cost: it cannot go over a man in the lane (tipped ≈ 2× as often) and is worth less than the mix
  assert.ok(bul.epaPerPlay < ex.epaPerPlay && bul.tipPct > 1.5 * ex.tipPct, 'BULLET_ONLY ' + bul.epaPerPlay.toFixed(2) + ' EPA, ' + pct(bul.tipPct) + ' tipped vs mixing ' + ex.epaPerPlay.toFixed(2) + ', ' + pct(ex.tipPct));
});

test('the no-read throw: QUICK at 0.7 s completes under 72 % and trails DECENT\'s reading by ≥ 0.2 expected points a play', () => {
  const qk = run('QUICK', 'AVERAGE', N.QUICK), de = run('DECENT', 'AVERAGE', N.DECENT);
  assert.ok(qk.cmpPct < 0.72, 'QUICK completions ' + pct(qk.cmpPct) + ' (the ball beats the break)');
  assert.ok(qk.epaPerPlay < de.epaPerPlay - 0.2, 'QUICK ' + qk.epaPerPlay.toFixed(2) + ' EPA vs DECENT ' + de.epaPerPlay.toFixed(2) + ': reading is worth something');
});

test('the call: a GOOD call vs the real coverage completes ≥ 8 points more than a BAD one (DECENT)', () => {
  const good = run('DECENT_GOOD', 'AVERAGE', N.CALL), bad = run('DECENT_BAD', 'AVERAGE', N.CALL);
  assert.ok(good.cmpPct >= bad.cmpPct + 0.08, 'GOOD ' + pct(good.cmpPct) + ' vs BAD ' + pct(bad.cmpPct));
});

test('the archetypes: SURGEON the least scatter, GUNSLINGER the most yards a throw and the deepest, FIELD GENERAL the best decisions', () => {
  const sd = {}, ypa = {}, ayd = {}, dec = {};
  for (const a of ARCHS) {
    const de = run('DECENT', 'AVERAGE', N.DECENT, [a]), ex = run('EXPERT', 'AVERAGE', N.EXPERT, [a]);
    const both = Bots.counters();
    Bots.merge(both, cell('DECENT', 'AVERAGE', N.DECENT, a)); Bots.merge(both, cell('EXPERT', 'AVERAGE', N.EXPERT, a));
    sd[a] = de.sdAvg; ypa[a] = de.ydsPerAtt; ayd[a] = Bots.derive(both).aydPerAtt; dec[a] = ex.decision;
  }
  for (const a of ARCHS) {
    if (a !== 'SURGEON') assert.ok(sd.SURGEON < sd[a], 'scatter SURGEON ' + sd.SURGEON.toFixed(2) + ' vs ' + a + ' ' + sd[a].toFixed(2));
    if (a !== 'GUNSLINGER') assert.ok(ypa.GUNSLINGER > ypa[a] && ayd.GUNSLINGER > ayd[a], 'GUNSLINGER ' + ypa.GUNSLINGER.toFixed(1) + ' yd/att, ' + ayd.GUNSLINGER.toFixed(1) + ' intended air yd vs ' + a + ' ' + ypa[a].toFixed(1) + ', ' + ayd[a].toFixed(1));
    if (a !== 'FIELD_GENERAL') assert.ok(dec.FIELD_GENERAL > dec[a], 'decisions FIELD GENERAL ' + pct(dec.FIELD_GENERAL) + ' vs ' + a + ' ' + pct(dec[a]));
  }
});
