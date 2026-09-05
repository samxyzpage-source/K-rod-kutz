/**
 * RTG.Weather — game-day weather and per-kick wind (§2.5.5, §3.5.6, §5.1 "weather").
 *   node kicker/test/weather.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RTG = require('./load')();
const W = RTG.Weather, T = RTG.Tuning.weather;

/** A venue-like object (Team subset). */
function venue(o) {
  return Object.assign({ id: 'v', climate: 'temperate', dome: false, altitude: false, windy: false, surface: 'grass' }, o || {});
}

/** RNG that counts its own draws. */
function counting(seed) {
  const r = RTG.RNG.create(seed);
  const next = r.next.bind(r);
  r.draws = 0;
  r.next = () => { r.draws++; return next(); };
  return r;
}

const NFL_DEC = 16;   // an NFL December week (14–18)

test('monthFor: college 1–4 Sep, 5–8 Oct, 9–12 Nov, 13+ Dec; NFL 1–4, 5–8, 9–13, 14–18, playoffs Jan', () => {
  const c = (w) => W.monthFor(w, 'COLLEGE'), n = (w) => W.monthFor(w, 'NFL');
  assert.equal(c(0), 'Sep'); assert.equal(c(1), 'Sep'); assert.equal(c(4), 'Sep');
  assert.equal(c(5), 'Oct'); assert.equal(c(8), 'Oct');
  assert.equal(c(9), 'Nov'); assert.equal(c(12), 'Nov');
  assert.equal(c(13), 'Dec'); assert.equal(c(14), 'Dec'); assert.equal(c(17), 'Dec');
  assert.equal(n(1), 'Sep'); assert.equal(n(4), 'Sep');
  assert.equal(n(5), 'Oct'); assert.equal(n(8), 'Oct');
  assert.equal(n(9), 'Nov'); assert.equal(n(13), 'Nov');
  assert.equal(n(14), 'Dec'); assert.equal(n(18), 'Dec');
  assert.equal(n(19), 'Jan'); assert.equal(n(22), 'Jan');
});

test('dome: weather "dome", wind 0, 70 °F, turf by default, zero draws', () => {
  const rng = counting(3);
  const w = W.forGame(rng, venue({ climate: 'cold', dome: true, surface: undefined }), NFL_DEC, 'NFL', 20);
  assert.equal(w.weather, 'dome');
  assert.equal(w.dome, true);
  assert.equal(w.wind.speed, 0);
  assert.equal(w.tempF, 70);
  assert.equal(w.surface, 'turf');
  assert.equal(rng.draws, 0);
  const pk = counting(4);
  const pkw = W.perKick(pk, w);
  assert.equal(pkw.speed, 0);
  assert.equal(pk.draws, 2, 'perKick always consumes exactly 2 draws');
});

test('outdoors: 6 draws, 7 when the snow line is reached (tempF < 34)', () => {
  for (let seed = 1; seed <= 2000; seed++) {
    const rng = counting(seed);
    const w = W.forGame(rng, venue({ climate: 'cold' }), NFL_DEC, 'NFL', 20);
    assert.equal(rng.draws, w.tempF < T.snowTempBelow ? 7 : 6, 'seed ' + seed);
  }
});

test('wind speed never exceeds the difficulty cap (also for windy venues); direction is an int 0..359', () => {
  for (const cap of [15, 20, 25, 30]) {
    const rng = RTG.RNG.create(cap);
    for (let i = 0; i < 5000; i++) {
      const w = W.forGame(rng, venue({ climate: 'warm', windy: true }), 3, 'NFL', cap);
      assert.ok(w.wind.speed <= cap && w.wind.speed >= 0, 'cap ' + cap + ' speed ' + w.wind.speed);
      assert.ok(Number.isInteger(w.wind.dir) && w.wind.dir >= 0 && w.wind.dir <= 359);
    }
  }
  const r = RTG.RNG.create(9);
  const w = W.forGame(r, venue(), 5, 'COLLEGE');   // default cap = Pro
  assert.ok(w.wind.speed <= RTG.Tuning.difficulty.pro.windCap);
});

test('snow only when tempF < 34; heat only above 88; cold only below 35 without precipitation; warm climates never fog or snow', () => {
  const rng = RTG.RNG.create(11);
  for (const climate of ['warm', 'temperate', 'cold']) {
    for (let i = 0; i < 8000; i++) {
      const w = W.forGame(rng, venue({ climate }), i % 2 ? NFL_DEC : 2, 'NFL', 20);
      if (w.weather === 'snow') assert.ok(w.tempF < T.snowTempBelow, 'snow at ' + w.tempF);
      if (w.weather === 'heat') assert.ok(w.tempF > T.heatAbove);
      if (w.weather === 'cold') assert.ok(w.tempF < T.coldBelow);
      if (w.tempF < T.coldBelow) assert.ok(['snow', 'rain', 'cold'].indexOf(w.weather) >= 0, 'cold temp must be snow/rain/cold, got ' + w.weather);
      if (climate === 'warm') assert.ok(w.weather !== 'fog' && w.weather !== 'snow');
      assert.ok(['clear', 'rain', 'snow', 'cold', 'heat', 'fog'].indexOf(w.weather) >= 0);
      assert.equal(w.dome, false);
      assert.equal(w.climate, climate);
    }
  }
});

test('distribution: cold-climate December snow share 25–45 % (10k games)', () => {
  const rng = RTG.RNG.create(2024);
  let snow = 0;
  const n = 10000;
  for (let i = 0; i < n; i++) if (W.forGame(rng, venue({ climate: 'cold' }), NFL_DEC, 'NFL', 20).weather === 'snow') snow++;
  const share = snow / n * 100;
  assert.ok(share >= 25 && share <= 45, 'snow share ' + share.toFixed(1) + '%');
});

test('distribution: Rayleigh(σ = 5) wind mean ≈ 6.3 mph (windy venues ×1.4)', () => {
  const rng = RTG.RNG.create(77);
  const n = 20000;
  let sum = 0, sumWindy = 0;
  for (let i = 0; i < n; i++) sum += W.forGame(rng, venue({ climate: 'warm' }), 2, 'NFL', 30).wind.speed;
  for (let i = 0; i < n; i++) sumWindy += W.forGame(rng, venue({ climate: 'warm', windy: true }), 2, 'NFL', 30).wind.speed;
  const mean = sum / n, meanWindy = sumWindy / n;
  assert.ok(Math.abs(mean - 6.27) < 0.25, 'mean wind ' + mean.toFixed(2));
  assert.ok(Math.abs(meanWindy - 6.27 * T.wind.windyMult) < 0.35, 'windy mean ' + meanWindy.toFixed(2));
  // direct Rayleigh sampler
  let s = 0;
  const r2 = RTG.RNG.create(5);
  for (let i = 0; i < n; i++) s += W.rayleigh(r2, 5);
  assert.ok(Math.abs(s / n - 5 * Math.sqrt(Math.PI / 2)) < 0.15);
});

test('temperature follows the climate/month table (mean within ±0.5 °F over 20k games)', () => {
  const rng = RTG.RNG.create(31);
  const cases = [['warm', 2, 'NFL', 82], ['cold', NFL_DEC, 'NFL', 32], ['temperate', 10, 'COLLEGE', 52], ['cold', 20, 'NFL', 26]];
  for (const [climate, week, league, mean] of cases) {
    let s = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) s += W.forGame(rng, venue({ climate }), week, league, 20).tempF;
    assert.ok(Math.abs(s / n - mean) < 0.5, climate + ' week ' + week + ' mean ' + (s / n).toFixed(2));
  }
});

test('fog appears only in temperate/cold climates and roughly 3 % of mild dry games', () => {
  const rng = RTG.RNG.create(13);
  let mild = 0, fog = 0;
  for (let i = 0; i < 30000; i++) {
    const w = W.forGame(rng, venue({ climate: 'temperate' }), 2, 'NFL', 20);
    if (['clear', 'fog'].indexOf(w.weather) >= 0) { mild++; if (w.weather === 'fog') fog++; }
  }
  const rate = fog / mild;
  assert.ok(rate > 0.02 && rate < 0.04, 'fog rate ' + rate.toFixed(4));
});

test('perKick: exactly 2 draws, N(0, 1.5) jitter floored at 0, direction untouched', () => {
  const game = { weather: 'clear', wind: { speed: 10, dir: 123 }, dome: false };
  const rng = counting(8);
  let sum = 0;
  const n = 20000;
  for (let i = 0; i < n; i++) {
    const w = W.perKick(rng, game);
    assert.equal(w.dir, 123);
    assert.ok(w.speed >= 0);
    sum += w.speed;
  }
  assert.equal(rng.draws, 2 * n);
  assert.ok(Math.abs(sum / n - 10) < 0.1, 'mean per-kick wind ' + (sum / n).toFixed(3));
  const calm = W.perKick(RTG.RNG.create(1), { wind: { speed: 0, dir: 0 } });
  assert.ok(calm.speed >= 0 && calm.speed < 8);
  const none = W.perKick(RTG.RNG.create(1), null);
  assert.deepEqual(JSON.parse(JSON.stringify(none)), { speed: none.speed, dir: 0 });
});

test('components / flipDir / label helpers', () => {
  const c0 = W.components({ speed: 10, dir: 0 });
  assert.ok(Math.abs(c0.along - 10) < 1e-9 && Math.abs(c0.cross) < 1e-9);
  const c90 = W.components({ speed: 10, dir: 90 });
  assert.ok(Math.abs(c90.cross - 10) < 1e-9 && Math.abs(c90.along) < 1e-9);
  const c180 = W.components({ speed: 10, dir: 180 });
  assert.ok(Math.abs(c180.along + 10) < 1e-9);
  assert.deepEqual(JSON.parse(JSON.stringify(W.components(null))), { along: 0, cross: 0 });
  assert.equal(W.flipDir(350), 170);
  assert.equal(W.flipDir(90), 270);
  assert.equal(W.label({ weather: 'dome', wind: { speed: 0, dir: 0 } }), 'DOME');
  assert.equal(W.label({ weather: 'clear', wind: { speed: 0.4, dir: 0 } }), 'CALM');
  assert.equal(W.label({ weather: 'clear', wind: { speed: 12, dir: 90 } }), 'WIND → 12');
  assert.equal(W.label({ weather: 'clear', wind: { speed: 7, dir: 270 } }), 'WIND ← 7');
  assert.equal(W.label({ weather: 'clear', wind: { speed: 9, dir: 10 } }), 'WIND ↑ 9');
});

test('deterministic and JSON-safe', () => {
  const a = W.forGame(RTG.RNG.create(555), venue({ climate: 'cold', altitude: true }), NFL_DEC, 'NFL', 25);
  const b = W.forGame(RTG.RNG.create(555), venue({ climate: 'cold', altitude: true }), NFL_DEC, 'NFL', 25);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  assert.equal(a.altitude, true);
  const walk = (o, p) => {
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (v && typeof v === 'object') walk(v, p + '.' + k);
      else assert.ok(v !== undefined && !(typeof v === 'number' && !isFinite(v)), p + '.' + k);
    }
  };
  walk(a, 'weather');
  assert.equal(typeof a.month, 'string');
});
