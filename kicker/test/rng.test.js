/**
 * RTG.RNG — mulberry32 vectors and the §3.5.2 draw contract.
 *   node kicker/test/rng.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RTG = require('./load')();
const RNG = RTG.RNG;

/** Golden values: the first 5 mulberry32 draws for seed 1 (computed at spec time; binding for replays). */
const SEED1_FIRST5 = [
  0.6270739405881613,
  0.002735721180215478,
  0.5274470399599522,
  0.9810509674716741,
  0.9683778982143849
];
const SEED1_STATE_AFTER5 = 567894474;

test('seed 1 → first 5 draws match the golden vector', () => {
  const r = RNG.create(1);
  const got = [];
  for (let i = 0; i < 5; i++) got.push(r.next());
  assert.deepEqual(got, SEED1_FIRST5);
  assert.equal(r.state(), SEED1_STATE_AFTER5);
});

test('reference mulberry32 implementation agrees for 1 000 draws', () => {
  function ref(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  for (const seed of [0, 1, 42, 123456789, 4294967295]) {
    const a = RNG.create(seed), b = ref(seed);
    for (let i = 0; i < 1000; i++) assert.equal(a.next(), b());
  }
});

test('same seed → identical 10 000-draw sequence; different seeds differ', () => {
  const a = RNG.create(99), b = RNG.create(99), c = RNG.create(100);
  let same = 0;
  for (let i = 0; i < 10000; i++) {
    const x = a.next();
    assert.equal(x, b.next());
    if (x === c.next()) same++;
  }
  assert.ok(same < 5);
});

test('next() is in [0, 1) and reasonably uniform', () => {
  const r = RNG.create(7);
  const bins = new Array(10).fill(0);
  for (let i = 0; i < 100000; i++) {
    const x = r.next();
    assert.ok(x >= 0 && x < 1);
    bins[Math.floor(x * 10)]++;
  }
  for (const b of bins) assert.ok(Math.abs(b - 10000) < 500, 'bin ' + b);
});

test('state()/setState() resumes exactly', () => {
  const r = RNG.create(2024);
  for (let i = 0; i < 17; i++) r.next();
  const s = r.state();
  assert.ok(Number.isInteger(s) && s >= 0 && s <= 0xffffffff);
  const seq = [];
  for (let i = 0; i < 20; i++) seq.push(r.next());
  const r2 = RNG.create(0);
  r2.setState(s);
  for (let i = 0; i < 20; i++) assert.equal(r2.next(), seq[i]);
  assert.equal(r2.state(), r.state());
});

test('int(lo, hi) is inclusive, hits both ends, 1 draw', () => {
  const r = RNG.create(3);
  const seen = new Set();
  for (let i = 0; i < 5000; i++) {
    const s0 = r.state();
    const v = r.int(1, 6);
    assert.ok(Number.isInteger(v) && v >= 1 && v <= 6);
    seen.add(v);
    const probe = RNG.create(0); probe.setState(s0); probe.next();
    assert.equal(probe.state(), r.state());
  }
  assert.equal(seen.size, 6);
  assert.equal(RNG.create(5).int(4, 4), 4);
});

test('float(lo, hi) stays in range; chance(p) always consumes exactly 1 draw', () => {
  const r = RNG.create(11);
  for (let i = 0; i < 1000; i++) { const f = r.float(-2, 3); assert.ok(f >= -2 && f < 3); }
  const s0 = r.state();
  assert.equal(r.chance(0), false);
  assert.equal(r.chance(1), true);
  const probe = RNG.create(0); probe.setState(s0); probe.next(); probe.next();
  assert.equal(probe.state(), r.state());
  let hits = 0;
  for (let i = 0; i < 100000; i++) if (r.chance(0.3)) hits++;
  assert.ok(Math.abs(hits / 100000 - 0.3) < 0.01);
});

test('gauss consumes exactly 2 draws and has mean/sd within 0.02/0.03 over 100k', () => {
  const r = RNG.create(1234);
  const s0 = r.state();
  r.gauss();
  const probe = RNG.create(0); probe.setState(s0); probe.next(); probe.next();
  assert.equal(probe.state(), r.state(), 'gauss must consume exactly 2 draws');
  let sum = 0, sq = 0;
  const N = 100000;
  for (let i = 0; i < N; i++) { const z = r.gauss(); sum += z; sq += z * z; }
  const mean = sum / N, sd = Math.sqrt(sq / N - mean * mean);
  assert.ok(Math.abs(mean) < 0.02, 'mean ' + mean);
  assert.ok(Math.abs(sd - 1) < 0.03, 'sd ' + sd);
  // mu/sd scaling
  const r2 = RNG.create(5);
  let s = 0;
  for (let i = 0; i < 20000; i++) s += r2.gauss(10, 2);
  assert.ok(Math.abs(s / 20000 - 10) < 0.1);
  // no caching: consecutive gauss calls are independent of call boundaries
  const a = RNG.create(77), b = RNG.create(77);
  const x1 = a.gauss(); const x2 = a.gauss();
  b.next(); b.next();
  assert.equal(b.gauss(), x2);
  assert.notEqual(x1, x2);
});

test('pick is uniform, 1 draw; empty array → undefined but still 1 draw', () => {
  const r = RNG.create(8);
  const counts = { a: 0, b: 0, c: 0 };
  for (let i = 0; i < 30000; i++) counts[r.pick(['a', 'b', 'c'])]++;
  for (const k in counts) assert.ok(Math.abs(counts[k] - 10000) < 500);
  const s0 = r.state();
  assert.equal(r.pick([]), undefined);
  const probe = RNG.create(0); probe.setState(s0); probe.next();
  assert.equal(probe.state(), r.state());
});

test('weighted respects weights (fn or key), ignores non-positive weights, 1 draw', () => {
  const r = RNG.create(21);
  const items = [{ id: 'x', w: 1 }, { id: 'y', w: 3 }, { id: 'z', w: 0 }, { id: 'neg', w: -5 }];
  const counts = { x: 0, y: 0, z: 0, neg: 0 };
  for (let i = 0; i < 40000; i++) counts[r.weighted(items, 'w').id]++;
  assert.equal(counts.z, 0);
  assert.equal(counts.neg, 0);
  assert.ok(Math.abs(counts.y / counts.x - 3) < 0.2, 'ratio ' + counts.y / counts.x);
  const byFn = r.weighted(items, (it) => (it.id === 'z' ? 1 : 0));
  assert.equal(byFn.id, 'z');
  // all-zero weights → uniform, still one draw
  const s0 = r.state();
  const u = r.weighted([{ w: 0 }, { w: 0 }], 'w');
  assert.ok(u);
  const probe = RNG.create(0); probe.setState(s0); probe.next();
  assert.equal(probe.state(), r.state());
});

test('shuffle is an in-place permutation using n−1 draws', () => {
  const r = RNG.create(31);
  const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const s0 = r.state();
  const ret = r.shuffle(arr);
  assert.equal(ret, arr);
  assert.deepEqual(arr.slice().sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const probe = RNG.create(0); probe.setState(s0);
  for (let i = 0; i < 9; i++) probe.next();
  assert.equal(probe.state(), r.state());
  // every position gets every value roughly equally
  const pos = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  for (let i = 0; i < 20000; i++) { const a = [0, 1, 2, 3]; r.shuffle(a); for (let p = 0; p < 4; p++) pos[p][a[p]]++; }
  for (const row of pos) for (const c of row) assert.ok(Math.abs(c - 5000) < 400);
});

test('fork is deterministic, isolated, and advances the parent by exactly 1 draw', () => {
  const p1 = RNG.create(500), p2 = RNG.create(500);
  const s0 = p1.state();
  const c1 = p1.fork('game:1'), c2 = p2.fork('game:1');
  assert.equal(c1.state(), c2.state());
  assert.equal(c1.next(), c2.next());
  const probe = RNG.create(0); probe.setState(s0); probe.next();
  assert.equal(probe.state(), p1.state(), 'parent must advance by exactly one draw');
  // child draws do not perturb the parent
  for (let i = 0; i < 100; i++) c1.next();
  assert.equal(p1.state(), p2.state());
  // different labels → different children
  const p3 = RNG.create(500);
  const c3 = p3.fork('game:2');
  assert.notEqual(c3.state(), c2.state());
  // child seed = fnv1a32(String(parentState) + label)
  assert.equal(RNG.create(500).fork('game:1').state(), RTG.Util.fnv1a32(String(s0) + 'game:1'));
});

test('seeds are coerced to uint32; strings hash via fnv1a32', () => {
  assert.equal(RNG.create(-1).state(), 0xffffffff);
  assert.equal(RNG.create(2 ** 32 + 5).state(), 5);
  assert.equal(RNG.create('hello').state(), RTG.Util.fnv1a32('hello'));
  assert.equal(RNG.create(NaN).state(), 0);
});
