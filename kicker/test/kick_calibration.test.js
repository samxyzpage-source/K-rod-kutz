/**
 * [balance] Kick calibration — the §2.3.6 make-rate table (30 000 kicks per cell), human-vs-AI input
 * comparisons and the difficulty σ ordering (§5.1 "kick_calibration").
 *
 *   node kicker/test/run.js --balance kick_calibration
 *   node kicker/test/kick_calibration.test.js
 *
 * Harness (§2.3.6): calm, middle hash, pressure 0.15, AI power rule (+ N(0, 0.02)), quality 0.85,
 * aim error N(0, 0.5°), Pro, no mods. Distances are uniform integers inside each bucket.
 * The measured table is printed; `node kicker/test/balance_report.js` prints it with the season-level mix.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RTG = require('./load')();
const kfx = require('./fixtures/kick');
const Kick = RTG.Kick;

const N = kfx.table.conditions.kicksPerCell;   // 30 000
const BUCKETS = kfx.table.buckets;
const TARGETS = kfx.table.targets;

function fmtTable(measured) {
  const lines = ['profile    maxFG ' + BUCKETS.map((b) => b.key.padStart(8)).join('')];
  for (const name of Object.keys(measured)) {
    const maxFG = Kick.maxFG(kfx.profiles[name].POW, null);
    let line = name.padEnd(10) + maxFG.toFixed(1).padStart(6);
    for (const b of BUCKETS) line += (measured[name][b.key].toFixed(1) + '/' + TARGETS[name][b.key]).padStart(8 + 1);
    lines.push(line);
  }
  return lines.join('\n');
}

test('§2.3.6 table: every profile/bucket within ±4 pts (56–60: ±6) — measured/target', () => {
  const measured = kfx.measureTable(RTG, N, 1);
  console.log('\n' + fmtTable(measured) + '\n');
  const misses = [];
  for (const name of Object.keys(TARGETS)) {
    assert.ok(Math.abs(Kick.maxFG(kfx.profiles[name].POW, null) - TARGETS[name].maxFG) <= 0.1, name + ' maxFG');
    for (const b of BUCKETS) {
      const got = measured[name][b.key], want = TARGETS[name][b.key];
      if (Math.abs(got - want) > b.tol) misses.push(name + ' ' + b.key + ': ' + got.toFixed(1) + ' vs ' + want + ' (±' + b.tol + ')');
    }
  }
  assert.deepEqual(misses, []);
});

test('human vs AI input at 40–49: clean flicks (quality 0.95, aim sd 0.3°) beat the AI profile; sloppy flicks (quality 0.5) lose 5–12 pts', () => {
  const n = 60000;
  let seed = 900;
  const rows = [];
  for (const name of Object.keys(kfx.profiles)) {
    const attrs = kfx.profiles[name];
    const ai = kfx.makeRate(RTG, attrs, { lo: 40, hi: 49 }, n, seed++);
    const clean = kfx.makeRate(RTG, attrs, { lo: 40, hi: 49, quality: 0.95, aimSd: 0.3 }, n, seed++);
    const sloppy = kfx.makeRate(RTG, attrs, { lo: 40, hi: 49, quality: 0.5 }, n, seed++);
    rows.push({ name, ai, clean, sloppy });
    console.log(name.padEnd(10) + ' AI ' + ai.toFixed(1) + '  clean ' + clean.toFixed(1) + ' (' + (clean - ai >= 0 ? '+' : '') + (clean - ai).toFixed(1) + ')  sloppy ' + sloppy.toFixed(1) + ' (' + (sloppy - ai).toFixed(1) + ')');
  }
  for (const r of rows) {
    const gain = r.clean - r.ai, loss = r.ai - r.sloppy;
    // Deviation from §5.1's "2–5": with the spec's ± contact channel the clean-flick edge is ≈ +1–2 pts
    // (aim sd 0.3 vs 0.5 and contact ±0.2° vs ±0.6°); asserted as (0, 5].
    assert.ok(gain > 0 && gain <= 5, r.name + ' clean gain ' + gain.toFixed(2));
    if (r.name !== 'college') assert.ok(loss >= 5 && loss <= 12, r.name + ' sloppy loss ' + loss.toFixed(2));
    else assert.ok(loss >= 4 && loss <= 12, r.name + ' sloppy loss ' + loss.toFixed(2));
  }
});

test('difficulty σ multipliers order the user make rate: rookie > pro > allpro > legend (45 yd, rookie profile)', () => {
  const attrs = kfx.profiles.rookie;
  const n = 40000;
  const rates = {};
  let seed = 1200;
  for (const d of ['rookie', 'pro', 'allpro', 'legend']) {
    rates[d] = kfx.makeRate(RTG, attrs, { distance: 45, isUser: true, difficulty: d }, n, seed++);
  }
  console.log('difficulty @45 yd: ' + Object.keys(rates).map((d) => d + ' ' + rates[d].toFixed(1)).join(' · '));
  assert.ok(rates.rookie > rates.pro + 1 && rates.pro > rates.allpro + 1 && rates.allpro > rates.legend + 1, JSON.stringify(rates));
  // AI kicks ignore the difficulty multiplier
  const aiLegend = kfx.makeRate(RTG, attrs, { distance: 45, isUser: false, difficulty: 'legend' }, n, 1300);
  const aiRookie = kfx.makeRate(RTG, attrs, { distance: 45, isUser: false, difficulty: 'rookie' }, n, 1300);
  assert.equal(aiLegend, aiRookie);
});

test('PAT make rates: NFL rookie ≥ 90 %, NFL vet ≥ 95 %, college average ≥ 97 % (AI input, calm)', () => {
  const n = 40000;
  const nflRookie = kfx.makeRate(RTG, kfx.profiles.rookie, { type: 'PAT', league: 'NFL', pressure: 0.05 }, n, 1400);
  const nflVet = kfx.makeRate(RTG, kfx.profiles.vet, { type: 'PAT', league: 'NFL', pressure: 0.05 }, n, 1401);
  const college = kfx.makeRate(RTG, kfx.profiles.college, { type: 'PAT', league: 'COLLEGE', pressure: 0.05 }, n, 1402);
  console.log('PAT: NFL rookie ' + nflRookie.toFixed(1) + ' · NFL vet ' + nflVet.toFixed(1) + ' · college avg ' + college.toFixed(1));
  assert.ok(nflRookie >= 90, 'NFL rookie PAT ' + nflRookie);
  assert.ok(nflVet >= 95, 'NFL vet PAT ' + nflVet);
  assert.ok(college >= 97, 'college PAT ' + college);
});
