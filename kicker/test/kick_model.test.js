/**
 * Kick.model — the closed form vs Monte Carlo (§2.3.9, §5.1 "kick_model").
 *   node kicker/test/kick_model.test.js            (12k kicks per cell)
 *   RTG_BALANCE=1 node kicker/test/kick_model.test.js   (the spec's 50k kicks per cell)
 * Both sizes use the spec's ±2 pt tolerance (MC sd ≤ 0.46 pt at 12k).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RTG = require('./load')();
const kfx = require('./fixtures/kick');
const Kick = RTG.Kick, Tuning = RTG.Tuning;

const N = process.env.RTG_BALANCE ? 50000 : 12000;
const TOL = 2;

function pct(x) { return (x * 100).toFixed(2); }

for (const name of ['rookie', 'elite']) {
  test('pMake vs ' + N + '-kick Monte Carlo within ±2 pts at 25/35/45/52/58 yd (' + name + ')', () => {
    const attrs = kfx.profiles[name];
    let seed = name === 'rookie' ? 100 : 200;
    for (const D of [25, 35, 45, 52, 58]) {
      const ctx = kfx.ctx(RTG, { distance: D, attrs, isUser: false });
      const model = Kick.model(ctx, attrs);
      const mc = kfx.makeRate(RTG, attrs, { distance: D }, N, seed++);
      const diff = Math.abs(model.pMake * 100 - mc);
      assert.ok(diff <= TOL, name + ' ' + D + ' yd: model ' + pct(model.pMake) + ' vs MC ' + mc.toFixed(2));
    }
  });
}

test('pMake vs Monte Carlo with a crosswind (AI compensation) and a quartering wind', () => {
  const attrs = kfx.profiles.rookie;
  let seed = 300;
  for (const wind of [{ speed: 12, dir: 90 }, { speed: 15, dir: 45 }, { speed: 10, dir: 300 }]) {
    const ctx = kfx.ctx(RTG, { distance: 45, attrs, wind, isUser: false });
    const model = Kick.model(ctx, attrs);
    const mc = kfx.makeRate(RTG, attrs, { distance: 45, wind }, N, seed++);
    assert.ok(Math.abs(model.pMake * 100 - mc) <= TOL, 'wind ' + JSON.stringify(wind) + ': model ' + pct(model.pMake) + ' vs MC ' + mc.toFixed(2));
    assert.ok(Math.abs(model.aimMean + model.windDriftDeg * Kick.aiWindComp(attrs.ACC)) < 1e-9, 'aimMean compensates the drift');
  }
});

test('pMake vs Monte Carlo from the hashes (college right hash 40 yd, NFL left hash 48 yd)', () => {
  const cases = [
    { attrs: kfx.profiles.college, o: { league: 'COLLEGE', distance: 40, hash: 1 } },
    { attrs: kfx.profiles.vet, o: { league: 'NFL', distance: 48, hash: -1 } },
    { attrs: kfx.profiles.elite, o: { league: 'COLLEGE', distance: 52, hash: -1, wind: { speed: 8, dir: 270 } } }
  ];
  let seed = 400;
  for (const c of cases) {
    const ctx = kfx.ctx(RTG, Object.assign({ attrs: c.attrs, isUser: false }, c.o));
    const model = Kick.model(ctx, c.attrs);
    const mc = kfx.makeRate(RTG, c.attrs, c.o, N, seed++);
    assert.ok(Math.abs(model.pMake * 100 - mc) <= TOL, JSON.stringify(c.o) + ': model ' + pct(model.pMake) + ' vs MC ' + mc.toFixed(2));
  }
});

test('pMake vs Monte Carlo under pressure, in snow and with overrides (quality 0.5, aim sd 0.3)', () => {
  const attrs = kfx.profiles.vet;
  const snow = kfx.snowGame(RTG, { attrs, hash: 0, wind: { speed: 0, dir: 0 }, isUser: false });
  const mcSnow = kfx.makeRate(RTG, attrs, { league: 'COLLEGE', distance: 42, weather: 'snow', tempF: 28, surface: 'turf', pressure: 0.25 }, N, 500);
  assert.ok(Math.abs(Kick.model(snow, attrs).pMake * 100 - mcSnow) <= TOL, 'snow');
  const ctx = kfx.ctx(RTG, { distance: 47, attrs, pressure: 0.8, isUser: false });
  const mcPress = kfx.makeRate(RTG, attrs, { distance: 47, pressure: 0.8, quality: 0.5, aimSd: 0.3 }, N, 501);
  const m = Kick.model(ctx, attrs, { quality: 0.5, aimSd: 0.3 });
  assert.ok(Math.abs(m.pMake * 100 - mcPress) <= TOL, 'pressure/quality: model ' + pct(m.pMake) + ' vs MC ' + mcPress.toFixed(2));
  assert.equal(m.quality, 0.5);
  assert.ok(Math.abs(m.contactDeg - 0.5 * Tuning.kick.contact.degPerQuality) < 1e-12);
});

test('windowDeg: symmetric from the middle, asymmetric from a hash (college R hash @ 30 yd → −5.47 / +5.72), mirrored L/R', () => {
  const H = Tuning.kick.geometry.H;
  const mid = Kick.windowDeg({ distance: 30, ballX: 0 });
  const a = Math.atan(H / 30) * 180 / Math.PI;
  assert.ok(Math.abs(mid.left + a) < 1e-9 && Math.abs(mid.right - a) < 1e-9);
  const r = Kick.windowDeg(kfx.ctx(RTG, { league: 'COLLEGE', distance: 30, hash: 1 }));
  assert.ok(Math.abs(r.left - -5.47) < 0.01, 'left ' + r.left);
  assert.ok(Math.abs(r.right - 5.72) < 0.01, 'right ' + r.right);
  assert.ok(Math.abs(r.left) < Math.abs(r.right), 'the near post subtends less');
  const l = Kick.windowDeg(kfx.ctx(RTG, { league: 'COLLEGE', distance: 30, hash: -1 }));
  assert.ok(Math.abs(l.left + r.right) < 1e-9 && Math.abs(l.right + r.left) < 1e-9, 'mirror');
  const n = Kick.windowDeg(kfx.ctx(RTG, { league: 'NFL', distance: 30, hash: 1 }));
  assert.ok(Math.abs(n.left) < Math.abs(n.right) && Math.abs(n.right - n.left) > Math.abs(r.right - r.left), 'NFL hash is closer to the middle → wider window');
  assert.deepEqual(Kick.model(kfx.ctx(RTG, { league: 'COLLEGE', distance: 30, hash: 1 })).windowDeg, r);
});

test('pClear = 0.5 exactly at pNeed (carry = Rneed); 1/0 step with no power noise', () => {
  for (const name of Object.keys(kfx.profiles)) {
    const attrs = kfx.profiles[name];
    for (const D of [30, 45, 55]) {
      const ctx = kfx.ctx(RTG, { distance: D, attrs });
      const m0 = Kick.model(ctx, attrs);
      const m = Kick.model(ctx, attrs, { power: m0.pNeed, quality: 1 });
      assert.ok(Math.abs(m.pClear - 0.5) < 1e-9, name + ' ' + D + ': pClear ' + m.pClear);
      assert.ok(Math.abs(m.peff * m.carryMax - m.rneed) < 1e-9, 'carry equals Rneed');
      assert.equal(Kick.model(ctx, attrs, { power: m0.pNeed * 1.01, quality: 1, powerSd: 0 }).pClear, 1);
      assert.equal(Kick.model(ctx, attrs, { power: m0.pNeed * 0.99, quality: 1, powerSd: 0 }).pClear, 0);
    }
  }
});

test('model invariants: probabilities in range, pMake ≤ (1 − pBlock), monotone in distance, σ matches sigmaFor, pure', () => {
  const attrs = kfx.profiles.rookie;
  let prev = 1;
  for (let D = 18; D <= 66; D++) {
    const ctx = kfx.ctx(RTG, { distance: D, attrs });
    const snap = JSON.stringify(ctx);
    const m = Kick.model(ctx, attrs);
    assert.equal(JSON.stringify(ctx), snap, 'model must not mutate ctx');
    assert.ok(m.pLateral >= 0 && m.pLateral <= 1 && m.pClear >= 0 && m.pClear <= 1);
    assert.ok(m.pBlock >= Tuning.kick.block.min && m.pBlock <= Tuning.kick.block.max);
    assert.ok(m.pMake <= 1 - m.pBlock + 1e-12 && m.pMake >= 0);
    assert.ok(m.pMake <= prev + 1e-9, 'pMake must not increase with distance at ' + D);
    prev = m.pMake;
    assert.ok(Math.abs(m.sigmaDeg - Kick.sigmaFor(ctx, { power: m.power }, attrs)) < 1e-12);
    assert.ok(Math.abs(m.power - Kick.aiPower(m.pNeed)) < 1e-12);
    assert.ok(Math.abs(m.flightTime - (1 + 0.026 * D)) < 1e-9);
    assert.deepEqual(JSON.parse(JSON.stringify(Kick.model(ctx, attrs))), JSON.parse(JSON.stringify(m)), 'deterministic');
  }
});

test('the AI power rule: pNeed + 0.15 up to the floor 1.0, then pNeed + 0.05, capped at 1.08', () => {
  assert.ok(Math.abs(Kick.aiPower(0.5) - 0.65) < 1e-12);
  assert.ok(Math.abs(Kick.aiPower(0.85) - 1.0) < 1e-12);
  assert.ok(Math.abs(Kick.aiPower(0.9) - 1.0) < 1e-12);
  assert.ok(Math.abs(Kick.aiPower(0.97) - 1.02) < 1e-12);
  assert.ok(Math.abs(Kick.aiPower(1.0) - 1.05) < 1e-12);
  assert.ok(Math.abs(Kick.aiPower(1.1) - 1.08) < 1e-12);
  assert.ok(Math.abs(Kick.aiWindComp(99) - 0.95) < 1e-12);
  assert.ok(Math.abs(Kick.aiWindComp(0) - 0.65) < 1e-12);
});
