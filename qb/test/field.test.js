/**
 * RTG.Field — the play on the field (v2, "draw the pass"): the Live's shape and in-place mutation, the fixed step,
 * determinism, live vs resolve equality, the draw contract, classify's rules (PASS / RUN / THROWAWAY / INVALID,
 * tooLong, the preview and who sees it, its cost), setRun / throwAlong / throwAway legality, the ball's physics along a
 * drawn polyline (arc length, speed from ARM and loft, the height profile, scatter), contact in flight (a bullet
 * through a linebacker vs a lob over him), the catch, the rush and the sack (rollouts, MOB escapes), the scramble,
 * tackles, the sideline, the goal line, maxT, coverage (man trails, zones sit on landmarks, the rotation from the
 * shown look), the result's shape and labels, and no NaN under garbage input.
 *   node qb/test/field.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load');
const RTG = load();
const Play = RTG.Play, Field = RTG.Field, Dp = RTG.Data.plays;
const T = RTG.Tuning.qb, F = T.field;

const J = (o) => JSON.parse(JSON.stringify(o));
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ': expected ' + b + ' ±' + tol + ', got ' + a);
const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const hyp = Math.hypot;

const QB55 = { attrs: { ARM: 55, ACC: 55, IQ: 55, MOB: 55, POI: 55 }, archetype: 'FIELD_GENERAL' };
const SIT = { down: 3, toGo: 6, yl: 40, quarter: 2, clock: 500, score: { us: 7, them: 10 } };
function only(cov) { const t = {}; for (const c of Dp.order) t[c] = c === cov ? 1 : 0; return t; }
/** A context + sim: opts {seed, cov (force the real coverage), play (id), attrs, sit (overrides), team}. */
function mk(opts) {
  opts = opts || {};
  const team = T.demo.teams[opts.team || 'AVERAGE'];
  const situation = Object.assign({}, SIT, opts.sit || {}, {
    qb: { attrs: Object.assign({}, QB55.attrs, opts.attrs || {}), archetype: 'FIELD_GENERAL' },
    team: team, opp: Object.assign({}, team, opts.cov ? { tendency: only(opts.cov) } : {})
  });
  const rng = RTG.RNG.create(opts.seed === undefined ? 1 : opts.seed);
  const ctx = Play.buildContext(situation, rng);
  const id = opts.play || ctx.options.filter((o) => !o.run)[0].id;
  const sim = Play.snap(ctx, id, rng);
  return { ctx, sim, rng };
}
function liveOf(sim, seed) { return Play.live(sim, RTG.RNG.create(seed === undefined ? 7 : seed)); }
function stepTo(live, t) { let n = 0; while (live.phase !== 'DONE' && live.t < t - 1e-9 && n++ < 5000) live.step(1 / 60); }
function finish(live) { let n = 0; while (live.phase !== 'DONE' && n++ < 5000) live.step(0.1); return live.result(); }
function line(live, x, y) { return [{ x: live.qb.x, y: live.qb.y }, { x: x, y: y }]; }

/**
 * A lab sim: a real SHOTGUN snap, JSON-cloned, with WR1 on a path to (tx, ty) by 1.0 s where he sits, the other four
 * parked on the far side, no rush, and every defender parked deep out of the play unless opts.place puts him on a spot
 * [{id, x, y, deep?}] (a zone of radius 0.1: he sits there until the ball is in the air).
 */
function lab(opts) {
  opts = opts || {};
  const base = mk({ seed: opts.seed || 3, play: 'SLANT_FLAT', sit: opts.sit, attrs: opts.attrs, cov: 'COVER3' });
  const sim = J(base.sim);
  const tx = opts.tx === undefined ? 6 : opts.tx, ty = opts.ty === undefined ? 12 : opts.ty;
  sim.receivers.forEach((r, i) => {
    if (i === 0) r.path = [{ t: 0, x: tx, y: -0.8 }, { t: 1, x: tx, y: ty }, { t: 30, x: tx, y: ty }];
    else r.path = [{ t: 0, x: -20 + i, y: -0.8 }, { t: 30, x: -20 + i, y: -0.8 }];
    r.capY = 200; r.xMin = sim.field.sideL + 0.6; r.xMax = sim.field.sideR - 0.6;
  });
  sim.rushers = [];
  const placed = {};
  for (const p of opts.place || []) placed[p.id] = p;
  sim.defenders.forEach((d, i) => {
    const p = placed[d.id];
    const x = p ? p.x : 22 - i, y = p ? p.y : 60;
    d.role = 'ZONE'; d.man = null; d.zone = { x: x, y: y, r: 0.1 }; d.x0 = x; d.y0 = y; d.deep = p ? !!p.deep : true;
    if (p && p.react !== undefined) d.react = p.react;
  });
  return sim;
}

/** Every number reachable in the live's public state is finite. */
function assertFinite(live, where) {
  const bad = [];
  const walk = (o, path, depth) => {
    if (depth > 4 || o === null || o === undefined) return;
    if (typeof o === 'number') { if (!Number.isFinite(o)) bad.push(path); return; }
    if (typeof o !== 'object') return;
    for (const k of Object.keys(o)) { if (k === 'sim' || k === 'field' || typeof o[k] === 'function') continue; walk(o[k], path + '.' + k, depth + 1); }
  };
  walk({ t: live.t, qb: live.qb, receivers: live.receivers, defenders: live.defenders, linemen: live.linemen, ball: live.ball, pressure: live.pressure, events: live.events }, 'live', 0);
  const r = live.result();
  if (r) walk(r, 'result', 0);
  assert.deepEqual(bad, [], (where || '') + ' non-finite: ' + bad.join(', '));
}

/** An rng that counts its draws (for a Live created directly with Field.create). */
function counting(seed) {
  const r = RTG.RNG.create(seed);
  const next = r.next.bind(r);
  r.draws = 0;
  r.next = () => { r.draws++; return next(); };
  return r;
}

// ═══════════════════════════════ HELPERS AND THE FRAME ═══════════════════════════════

test('polylines: clean drops garbage and duplicates and thins; length / truncate / resample / smooth; loftFor maps the draw speed', () => {
  assert.deepEqual(J(Field.clean(null)), []);
  assert.deepEqual(J(Field.clean('abc')), []);
  assert.deepEqual(J(Field.clean([{ x: 1, y: 2 }, { x: NaN, y: 1 }, null, { x: 'a', y: 3 }, [3, 4], { x: 3, y: 4 }, { x: 1e9, y: -1e9 }])), [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 1000, y: -1000 }]);
  const big = Array.from({ length: 5000 }, (_, i) => ({ x: i * 0.01, y: 0 }));
  const thin = Field.clean(big);
  assert.equal(thin.length, T.draw.maxPoints);
  assert.deepEqual(J(thin[0]), { x: 0, y: 0 }); near(thin[thin.length - 1].x, 49.99, 1e-9, 'the last point kept');
  const L = [{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 10 }];
  assert.equal(Field.length(L), 11);
  const cut = Field.truncate(L, 7);
  near(Field.length(cut), 7, 1e-9, 'truncate'); assert.deepEqual(J(cut[cut.length - 1]), { x: 3, y: 6 });
  const rs = Field.resample(L, 1);
  assert.ok(rs.length >= 11 && rs.length <= 13); near(Field.length(rs), 11, 0.3, 'resample keeps the arc');
  const sm = Field.smooth([{ x: 0, y: 0 }, { x: 1, y: 5 }, { x: 2, y: 0 }], 1);
  assert.deepEqual(J(sm[0]), { x: 0, y: 0 }); assert.ok(sm[1].y < 5, 'smoothed');
  assert.equal(Field.loftFor(T.draw.loft.fastHps + 1), 0, 'fast = bullet');
  assert.equal(Field.loftFor(T.draw.loft.slowHps / 2), 1, 'slow = lob');
  const mid = Field.loftFor((T.draw.loft.fastHps + T.draw.loft.slowHps) / 2);
  assert.ok(mid > 0.4 && mid < 0.6);
  assert.equal(Field.loftFor(NaN), mid, 'garbage → the middle');
});

test('frame: the sidelines follow the hash (and the venue), the goal line is 100 − yl, the end line 10 past it', () => {
  const mid = Field.frame(40, 0, 'COLLEGE'), left = Field.frame(40, -1, 'COLLEGE'), nfl = Field.frame(40, -1, 'NFL');
  near(mid.sideL, -F.halfWidth, 1e-3); near(mid.sideR, F.halfWidth, 1e-3);
  near(left.centerX, F.hash.COLLEGE, 1e-3, 'on the left hash the field is to the right');
  near(nfl.centerX, F.hash.NFL, 1e-3, 'the NFL hashes are narrower');
  assert.equal(mid.goalY, 60); assert.equal(mid.endY, 70); assert.equal(mid.losY, 0);
  assert.equal(Field.frame(97, 0).goalY, 3);
  assert.deepEqual(J(Field.frame('x', 'y', 'z')), J(Field.frame(25, 0, 'COLLEGE')), 'garbage → defaults');
});

// ═══════════════════════════════ THE LIVE: SHAPE, STEP, DETERMINISM ═══════════════════════════════

test('live shape: fixed-length arrays of objects mutated in place (the same objects every frame), the contract fields present', () => {
  const { sim } = mk({ seed: 11 });
  const live = liveOf(sim);
  const refs = { qb: live.qb, r0: live.receivers[0], d5: live.defenders[5], l2: live.linemen[2], rs: live.receivers, ds: live.defenders };
  assert.deepEqual(J(Object.keys(live.qb).sort()), ['down', 'escaped', 'hasBall', 'vx', 'vy', 'x', 'y']);
  for (const r of live.receivers) for (const k of ['slot', 'x', 'y', 'vx', 'vy', 'sep', 'open', 'target', 'shown']) assert.ok(k in r, 'receiver.' + k);
  for (const d of live.defenders) for (const k of ['id', 'pos', 'role', 'man', 'x', 'y', 'vx', 'vy']) assert.ok(k in d, 'defender.' + k);
  for (const l of live.linemen) assert.deepEqual(J(Object.keys(l).sort()), ['x', 'y']);
  for (const f of ['step', 'classify', 'setRun', 'throwAlong', 'throwAway', 'result', 'plan', 'aim', 'snapshot']) assert.equal(typeof live[f], 'function', f);
  stepTo(live, 1.3);
  live.throwAlong(live.aim(sim.receivers[2].slot, 0.4).points, 0.4);
  const ball = live.ball;
  for (const k of ['x', 'y', 'h', 'u', 'path', 'drawn', 'landing', 'releaseT', 'arriveT', 'loft', 'kind', 'caught', 'deadAt']) assert.ok(k in ball, 'ball.' + k);
  live.step(0.2);
  assert.equal(live.ball, ball, 'the ball object is mutated, not replaced');
  finish(live);
  assert.equal(live.qb, refs.qb); assert.equal(live.receivers[0], refs.r0); assert.equal(live.defenders[5], refs.d5);
  assert.equal(live.linemen[2], refs.l2); assert.equal(live.receivers, refs.rs); assert.equal(live.defenders, refs.ds);
  assert.equal(live.receivers.length, 5); assert.equal(live.defenders.length, 11); assert.equal(live.linemen.length, 5);
  assert.ok(Dp.defenders.every((id, i) => live.defenders[i].id === id));
});

test('step: fixed sub-steps of dt on the grid (the remainder carries), dt clamped to [0, 0.25], garbage → 0, returns the phase', () => {
  const { sim } = mk({ seed: 12 });
  const live = liveOf(sim);
  assert.equal(live.step(0.01), 'PRE_THROW');
  assert.equal(live.t, 0, 'less than one sub-step: nothing yet');
  near(live.rest, 0.01, 1e-12, 'the carried remainder is exposed (for smooth drawing)');
  live.step(0.01);
  near(live.t, F.dt, 1e-12, 'the carried remainder makes a sub-step');
  const t0 = live.t;
  live.step(10);
  near(live.t - t0, 0.25, F.dt + 1e-9, 'clamped to 0.25 s');
  const t1 = live.t;
  live.step(NaN); live.step('x'); live.step(-3); live.step(undefined); live.step(Infinity);
  near(live.t - t1, 0.25, F.dt + 1e-9, 'NaN / strings / negatives are 0; Infinity clamps');
  near(live.t / F.dt, Math.round(live.t / F.dt), 1e-6, 'on the dt grid');
  assertFinite(live, 'after garbage steps');
});

test('determinism: the same sim, rng and inputs at the same sim times give identical results, events and positions', () => {
  const run = () => {
    const { sim } = mk({ seed: 21 });
    const live = liveOf(sim, 99);
    for (let i = 0; i < 40; i++) live.step(0.017 + (i % 3) * 0.004);
    live.setRun([{ x: live.qb.x, y: live.qb.y }, { x: live.qb.x + 4, y: live.qb.y }]);
    for (let i = 0; i < 20; i++) live.step(0.02);
    const aim = live.aim(sim.receivers[0].slot, 0.6);
    live.throwAlong(aim.points, 0.6);
    finish(live);
    return J({ res: live.result(), ev: live.events, snap: live.snapshot() });
  };
  assert.deepEqual(run(), run());
});

test('live vs resolve: a drawn pass after odd-sized frames resolves to the SAME result from live.plan() (many seeds)', () => {
  for (let seed = 0; seed < 25; seed++) {
    const { sim } = mk({ seed: 300 + seed });
    const live = liveOf(sim, seed);
    const tt = 0.9 + (seed % 7) * 0.2;
    while (live.t < tt && live.phase === 'PRE_THROW') live.step(0.013 + (seed % 5) * 0.007);
    if (live.phase !== 'PRE_THROW') { finish(live); continue; }
    const rec = sim.receivers[seed % 5].slot, loft = (seed % 4) / 3;
    const aim = live.aim(rec, loft);
    live.throwAlong([aim.points[0], { x: (aim.points[0].x + aim.x) / 2 + 1, y: (aim.points[0].y + aim.y) / 2 }, { x: aim.x, y: aim.y }], loft);
    const res = finish(live);
    const again = Play.resolve(sim, J(live.plan()), RTG.RNG.create(seed));
    assert.deepEqual(J(again), J(res), 'seed ' + seed);
    if (seed % 5 === 0) assert.deepEqual(J(Play.resolve(J(sim), J(live.plan()), RTG.RNG.create(seed))), J(res), 'a JSON copy of the sim replays too');
  }
});

test('live vs resolve: a rollout then a pass, a replaced run, a scramble past the line, a throw-away — all replay exactly', () => {
  const cases = [
    (live) => { stepTo(live, 0.7); live.setRun(line(live, live.qb.x - 6, live.qb.y - 1)); stepTo(live, 1.6); const a = live.aim('WR1', 0.3); if (a) live.throwAlong(a.points, 0.3); },
    (live) => { stepTo(live, 0.5); live.setRun(line(live, 8, -8)); stepTo(live, 0.9); live.setRun(line(live, -8, -8)); },
    (live) => { stepTo(live, 1.1); live.setRun([{ x: live.qb.x, y: live.qb.y }, { x: live.qb.x + 3, y: 2 }, { x: live.qb.x + 3, y: 20 }]); },
    (live) => { stepTo(live, 1.2); live.throwAway(); }
  ];
  for (let c = 0; c < cases.length; c++) {
    for (let seed = 0; seed < 6; seed++) {
      const { sim } = mk({ seed: 500 + seed });
      const live = liveOf(sim, 40 + seed);
      cases[c](live);
      const res = finish(live);
      assert.deepEqual(J(Play.resolve(sim, live.plan(), RTG.RNG.create(40 + seed))), J(res), 'case ' + c + ' seed ' + seed);
    }
  }
});

test('plan(): sim times on the dt grid, a copy (mutating it changes nothing), only accepted inputs are logged', () => {
  const { sim } = mk({ seed: 31 });
  const live = liveOf(sim);
  for (let i = 0; i < 37; i++) live.step(0.0231);
  assert.equal(live.setRun([]).ok, false, 'an empty run is refused');
  assert.equal(live.setRun([{ x: live.qb.x + 0.2, y: live.qb.y }]).ok, false, 'a run shorter than minLen is refused');
  assert.equal(live.setRun(line(live, live.qb.x + 3, live.qb.y)).ok, true);
  stepTo(live, 1.4);
  live.throwAlong(live.aim('WR2', 0.5).points, 0.5);
  assert.equal(live.throwAway().ok, false, 'the ball is gone');
  const p = live.plan();
  assert.equal(p.runs.length, 1); assert.ok(p.pass); assert.equal(p.away, null);
  for (const t of [p.runs[0].t, p.pass.t]) near(t / F.dt, Math.round(t / F.dt), 1e-6, 'quantised to dt');
  p.runs.length = 0; p.pass.points[1].x = 999;
  const q = live.plan();
  assert.equal(q.runs.length, 1); assert.notEqual(q.pass.points[1].x, 999);
});

test('draw counts: classify / aim / plan / result / snapshot / setRun draw nothing; a PASS release draws exactly the scatter (4); a throw-away 0', () => {
  const { sim } = mk({ seed: 41 });
  const rng = counting(5);
  const live = Field.create(sim, rng);
  stepTo(live, 1.0);
  const before = rng.draws;
  for (let i = 0; i < 20; i++) { const a = live.aim(sim.receivers[i % 5].slot, i / 20); if (a) live.classify(a.points, i / 20); }
  live.classify([{ x: 0, y: -7 }, { x: 40, y: 80 }], 0.5);
  live.plan(); live.snapshot(); live.result();
  live.setRun(line(live, live.qb.x + 2, live.qb.y));
  assert.equal(rng.draws, before, 'no draws');
  const b2 = rng.draws;
  live.throwAlong(live.aim('SLOT', 0.4).points, 0.4);
  assert.equal(rng.draws - b2, 4, 'scatter: two gauss');
  const other = counting(6), l2 = Field.create(sim, other);
  stepTo(l2, 1.0);
  const b3 = other.draws;
  l2.throwAway();
  assert.equal(other.draws - b3, 0, 'a throw-away draws nothing at the release');
  finish(l2);
  assert.equal(l2.result().outcome, 'THROWAWAY');
});

// ═══════════════════════════════ CLASSIFY ═══════════════════════════════

test('classify: a line to where a receiver can be is a PASS to him (the aim spot), from the QB, with a preview and a margin', () => {
  let passes = 0;
  for (let seed = 0; seed < 20; seed++) {
    const { sim } = mk({ seed: 600 + seed });
    const live = liveOf(sim);
    stepTo(live, 1.2);
    for (const r of sim.receivers) {
      const aim = live.aim(r.slot, 0.4);
      if (!aim || aim.tooLong) continue;
      const c = live.classify([{ x: live.qb.x + 0.5, y: live.qb.y }, { x: aim.x, y: aim.y }], 0.4);
      assert.equal(c.kind, 'PASS', r.slot);
      assert.deepEqual([c.points[0].x, c.points[0].y], [live.qb.x, live.qb.y], 'the first point is the QB');
      assert.ok(['GREEN', 'GOLD', 'RED'].includes(c.preview));
      assert.equal(typeof c.margin, 'number');
      near(c.length, hyp(aim.x - live.qb.x, aim.y - live.qb.y), 1e-3, 'length');
      assert.equal(c.maxLen, Math.round(Field.maxLen(sim.ctx.qb.attrs) * 1000) / 1000);
      if (c.target === r.slot) passes++;
    }
  }
  assert.ok(passes >= 70, passes + ' of the aim spots classify to the aimed receiver');
});

test('classify: INVALID off the QB, too short, one point, garbage; never mutates the live; RUN past the line; INVALID once the ball is gone', () => {
  const { sim } = mk({ seed: 13 });
  const live = liveOf(sim);
  stepTo(live, 1.0);
  const snap = J(live.snapshot());
  const q = { x: live.qb.x, y: live.qb.y };
  const far = live.classify([{ x: q.x + T.draw.startR + 1, y: q.y }, { x: 10, y: 10 }], 0.5);
  assert.equal(far.kind, 'INVALID'); assert.ok(far.reason.length > 0);
  assert.equal(live.classify([q, { x: q.x + 0.5, y: q.y }], 0.5).kind, 'INVALID', 'shorter than minLen');
  assert.equal(live.classify([q], 0.5).kind, 'INVALID', 'one point');
  for (const g of [null, undefined, 42, 'line', {}, [null, null], [{ x: NaN, y: NaN }, { x: 'a', y: 'b' }]]) assert.equal(live.classify(g, 'loft').kind, 'INVALID');
  assert.deepEqual(J(live.snapshot()), snap, 'classify does not mutate');
  const run = liveOf(sim, 8);
  stepTo(run, 0.8);
  run.setRun([{ x: run.qb.x, y: run.qb.y }, { x: run.qb.x, y: 6 }]);
  stepTo(run, 2.2);
  if (run.phase === 'SCRAMBLE') {
    const c = run.classify([{ x: run.qb.x, y: run.qb.y }, { x: run.qb.x + 10, y: run.qb.y + 8 }], 0);
    assert.equal(c.kind, 'RUN', 'past the line only a run is legal');
    assert.equal(run.throwAlong([{ x: run.qb.x, y: run.qb.y }, { x: run.qb.x + 10, y: run.qb.y + 8 }], 0).ok, false);
  }
  stepTo(live, 1.3);
  live.throwAlong(live.aim('WR1', 0.5).points, 0.5);
  assert.equal(live.classify([{ x: live.qb.x, y: live.qb.y }, { x: 5, y: 5 }], 0.5).kind, 'INVALID', 'the ball is gone');
});

test('classify: RUN when no receiver can reach an in-bounds end, THROWAWAY when it is out of bounds, tooLong truncated at the arm (and the arm grows with ARM)', () => {
  const { sim } = mk({ seed: 14 });
  const live = liveOf(sim);
  stepTo(live, 1.0);
  const q = { x: live.qb.x, y: live.qb.y };
  const run = live.classify([q, { x: q.x + 2, y: q.y - 1 }, { x: q.x + 4, y: q.y - 1 }], 0.5);
  assert.equal(run.kind, 'RUN'); assert.equal(run.target, null); assert.equal(run.preview, null);
  const away = live.classify([q, { x: live.field.sideR + 5, y: q.y + 2 }], 0.5);
  assert.equal(away.kind, 'THROWAWAY');
  const aim = live.aim('WR1', 0.3);
  const longLine = [q, { x: aim.x, y: aim.y }, { x: aim.x, y: aim.y + 1 }, { x: aim.x - 30, y: aim.y + 1 }, { x: aim.x, y: aim.y + 2 }];
  const c = live.classify(longLine, 0.3);
  if (c.kind === 'PASS') {
    assert.equal(c.tooLong, true);
    near(Field.length(c.points), Field.maxLen(sim.ctx.qb.attrs), 1e-6, 'truncated at maxLen');
    assert.ok(c.length > c.maxLen);
  }
  assert.ok(Field.maxLen({ ARM: 99 }) > Field.maxLen({ ARM: 55 }) + 5 && Field.maxLen({ ARM: 55 }) > Field.maxLen({ ARM: 20 }));
  assert.equal(live.classify([q, { x: q.x, y: q.y + 5 }], 0.5).tooLong, false);
});

test('classify: the preview colour is shown only at IQ ≥ previewIq (the FIELD GENERAL); everyone still sees PASS and the target', () => {
  for (const [iq, shown] of [[T.draw.previewIq, true], [T.archetypes.FIELD_GENERAL.IQ, T.archetypes.FIELD_GENERAL.IQ >= T.draw.previewIq], [T.draw.previewIq - 1, false], [T.archetypes.GUNSLINGER.IQ, false]]) {
    const { sim } = mk({ seed: 15, attrs: { IQ: iq } });
    const live = liveOf(sim);
    stepTo(live, 1.2);
    assert.equal(live.previewShown, shown, 'IQ ' + iq);
    const c = live.classify(live.aim('WR1', 0.5).points, 0.5);
    assert.equal(c.previewShown, shown);
    assert.equal(c.kind, 'PASS'); assert.equal(c.target, 'WR1');
  }
  assert.equal(T.archetypes.FIELD_GENERAL.IQ >= T.draw.previewIq, true, 'the perk is the FIELD GENERAL\'s');
});

test('classify: cheap enough for every pointermove — under 0.3 ms for a 60-point line (main realm)', () => {
  const R = load({ realm: 'this' });
  const rng = R.RNG.create(3);
  const ctx = R.Play.buildContext(Object.assign({}, SIT, { qb: QB55 }), rng);
  const sim = R.Play.snap(ctx, ctx.options.filter((o) => !o.run)[0].id, rng);
  const live = R.Play.live(sim, rng);
  while (live.t < 1.2) live.step(1 / 60);
  const aim = live.aim(sim.receivers[0].slot, 0.5);
  const pts = [];
  for (let i = 0; i <= 60; i++) pts.push({ x: live.qb.x + (aim.x - live.qb.x) * i / 60 + Math.sin(i / 6), y: live.qb.y + (aim.y - live.qb.y) * i / 60 });
  for (let i = 0; i < 200; i++) live.classify(pts, i / 200);
  const n = 2000, t0 = process.hrtime.bigint();
  for (let i = 0; i < n; i++) live.classify(pts, (i % 10) / 10);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / n;
  assert.ok(ms < 0.3, 'classify ' + ms.toFixed(4) + ' ms');
});

test('the preview is honest: GREEN lines complete far more often than RED ones and are (almost) never picked', () => {
  const tally = { GREEN: { n: 0, c: 0, i: 0 }, RED: { n: 0, c: 0, i: 0 } };
  for (let seed = 0; seed < 220; seed++) {
    const { sim } = mk({ seed: 1000 + seed });
    const probe = liveOf(sim, seed);
    stepTo(probe, 1.5);
    if (probe.phase !== 'PRE_THROW') continue;
    const found = {};
    for (const r of sim.receivers) for (const loft of [0.1, 0.5, 0.9]) {
      const a = probe.aim(r.slot, loft);
      if (!a || a.tooLong) continue;
      const c = probe.classify(a.points, loft);
      if (c.kind === 'PASS' && (c.preview === 'GREEN' || c.preview === 'RED') && !found[c.preview]) found[c.preview] = { pts: a.points, loft };
    }
    for (const k of Object.keys(found)) {
      const live = liveOf(sim, seed);
      stepTo(live, 1.5);
      live.throwAlong(found[k].pts, found[k].loft);
      const res = finish(live);
      tally[k].n++; if (res.outcome === 'CATCH') tally[k].c++; if (res.outcome === 'INT') tally[k].i++;
    }
  }
  const g = tally.GREEN, r = tally.RED;
  assert.ok(g.n >= 40 && r.n >= 40, JSON.stringify(tally));
  assert.ok(g.c / g.n >= 0.75, 'GREEN completes ' + (g.c / g.n).toFixed(2));
  assert.ok(g.c / g.n > r.c / r.n + 0.3, 'GREEN ' + (g.c / g.n).toFixed(2) + ' vs RED ' + (r.c / r.n).toFixed(2));
  assert.ok(g.i / g.n <= 0.03, 'GREEN is (almost) never picked: ' + g.i + '/' + g.n);
});

// ═══════════════════════════════ RUN, THROW, THROW AWAY ═══════════════════════════════

test('setRun: the QB runs the drawn path from where he is at his speed (faster with MOB); a new run replaces the old; illegal once the ball is gone', () => {
  const speedOf = (mob) => {
    const sim = lab({ attrs: { MOB: mob } });
    const live = liveOf(sim);
    stepTo(live, 0.7);
    const x0 = live.qb.x;
    assert.equal(live.setRun([{ x: live.qb.x, y: live.qb.y }, { x: live.qb.x + 15, y: live.qb.y }]).ok, true);
    stepTo(live, 2.2);
    return (live.qb.x - x0) / 1.5;
  };
  const slow = speedOf(20), fast = speedOf(95);
  assert.ok(fast > slow + 0.8, 'MOB 95 ' + fast.toFixed(2) + ' vs MOB 20 ' + slow.toFixed(2) + ' yd/s');
  assert.ok(fast <= Field.qbSpeed({ MOB: 95 }) + 1e-6);
  const live = liveOf(lab());
  stepTo(live, 0.7);
  live.setRun(line(live, live.qb.x + 10, live.qb.y));
  stepTo(live, 1.0);
  live.setRun(line(live, live.qb.x - 10, live.qb.y));
  const x1 = live.qb.x;
  stepTo(live, 1.6);
  assert.ok(live.qb.x < x1 - 1, 'the new run replaced the old one');
  assert.equal(live.events.filter((e) => e.kind === 'RUN').length, 2);
  live.throwAlong(live.aim('WR1', 0.5).points, 0.5);
  const r = live.setRun(line(live, 0, 0));
  assert.equal(r.ok, false); assert.equal(typeof r.reason, 'string');
});

test('throwAlong: the ball flies the drawn line from the QB — drawn is the line, path the flown one (scatter), landing its end, arrive = release + length / speed; one release only', () => {
  const sim = lab();
  const live = liveOf(sim, 3);
  stepTo(live, 1.2);
  const pts = [{ x: live.qb.x, y: live.qb.y }, { x: 1, y: 3 }, { x: 6, y: 12 }];
  const r = live.throwAlong(pts, 0.4);
  assert.deepEqual(J(r), { ok: true, kind: 'PASS', target: 'WR1', reason: '' });
  const b = live.ball;
  assert.equal(live.phase, 'BALL_IN_AIR'); assert.equal(live.qb.hasBall, false); assert.equal(live.receivers[0].target, true);
  assert.deepEqual(J(b.drawn), J(pts));
  assert.deepEqual([b.path[0].x, b.path[0].y], [pts[0].x, pts[0].y], 'the flight starts at the QB');
  assert.deepEqual([b.landing.x, b.landing.y], [b.path[b.path.length - 1].x, b.path[b.path.length - 1].y]);
  near(b.arriveT, b.releaseT + Field.length(b.path) / Field.ballSpeed(sim.ctx.qb.attrs, 0.4), 0.002, 'arrive');
  assert.equal(b.kind, 'PASS'); assert.equal(b.loft, 0.4);
  assert.equal(live.events.filter((e) => e.kind === 'RELEASE').length, 1);
  assert.equal(live.throwAlong(pts, 0.4).ok, false, 'no second release');
  finish(live);
  assert.equal(live.throwAlong(pts, 0.4).ok, false, 'not after DONE');
  const bad = liveOf(sim, 4);
  stepTo(bad, 1.0);
  assert.equal(bad.throwAlong([{ x: 30, y: 30 }, { x: 40, y: 40 }], 0.5).ok, false, 'a line that does not start at the QB');
  assert.equal(bad.phase, 'PRE_THROW');
});

test('throwAway: the ball goes out of bounds past the nearer sideline — THROWAWAY, 0 yards, never a turnover; legal only while a pass is', () => {
  for (let seed = 0; seed < 30; seed++) {
    const { sim } = mk({ seed: 1400 + seed });
    const live = liveOf(sim, seed);
    stepTo(live, 1.0 + (seed % 10) * 0.15);
    if (live.phase !== 'PRE_THROW') continue;
    const r = live.throwAway();
    assert.equal(r.ok, true); assert.equal(r.kind, 'THROWAWAY');
    const land = live.ball.landing;
    assert.ok(land.x < live.field.sideL || land.x > live.field.sideR, 'out of bounds');
    const res = finish(live);
    assert.equal(res.outcome, 'THROWAWAY'); assert.equal(res.kind, 'THROWAWAY');
    assert.equal(res.yards, 0); assert.equal(res.turnover, false); assert.equal(res.text, 'THROWN AWAY');
    assert.equal(live.throwAway().ok, false);
  }
});

// ═══════════════════════════════ THE BALL ═══════════════════════════════

test('ball physics: speed from ARM and loft (a lob is slower), the apex grows with the flight time, the height runs release → apex → catch', () => {
  const a55 = { ARM: 55 }, a99 = { ARM: 99 };
  assert.ok(Field.ballSpeed(a99, 0) > Field.ballSpeed(a55, 0) + 3, 'ARM');
  near(Field.ballSpeed(a55, 1) / Field.ballSpeed(a55, 0), 1 - F.ballSpeed.loftSlow, 1e-9, 'loft slows it');
  const bullet = 20 / Field.ballSpeed(a55, 0), lob = 20 / Field.ballSpeed(a55, 1);
  assert.ok(Field.apex(lob) > Field.apex(bullet) + 1, 'a lob is higher');
  near(Field.heightAt(0, 2), F.height.release, 1e-9); near(Field.heightAt(1, 2), F.height.catch, 1e-9);
  near(Field.heightAt(0.5, 2), (F.height.release + F.height.catch) / 2 + 2, 1e-9, 'the apex at the middle');
  const sim = lab();
  const heights = {};
  for (const loft of [0.05, 0.95]) {
    const live = liveOf(sim, 1);
    stepTo(live, 1.2);
    live.throwAlong(line(live, 6, 12), loft);
    const L = Field.length(live.ball.path);
    let maxH = 0, prevU = 0, n = 0;
    while (live.phase === 'BALL_IN_AIR') {
      live.step(F.dt);
      if (live.phase !== 'BALL_IN_AIR') break;
      maxH = Math.max(maxH, live.ball.h);
      assert.ok(live.ball.u >= prevU, 'u only grows'); prevU = live.ball.u;
      n++;
    }
    heights[loft] = { maxH, flight: live.ball.arriveT - live.ball.releaseT, L, steps: n };
  }
  assert.ok(heights[0.95].flight > heights[0.05].flight * 1.5, 'the lob hangs: ' + JSON.stringify(heights));
  assert.ok(heights[0.95].maxH > heights[0.05].maxH + 1, 'and rises over the defence');
});

test('scatter: the release sd grows with pressure, running and length and shrinks with ACC; the flown path drifts off the drawn line', () => {
  const sdOf = (opts) => {
    const sim = lab({ attrs: opts.attrs, tx: opts.tx, ty: opts.ty, place: opts.place });
    const live = liveOf(sim, 2);
    stepTo(live, 0.8);
    if (opts.run) live.setRun(line(live, live.qb.x + 12, live.qb.y));
    stepTo(live, 1.3);
    live.throwAlong(line(live, opts.tx === undefined ? 6 : opts.tx, opts.ty === undefined ? 12 : opts.ty), 0.4);
    return finish(live).release;
  };
  const base = sdOf({});
  assert.ok(sdOf({ attrs: { ACC: 95 } }).sd < base.sd - 0.05, 'ACC shrinks it');
  assert.ok(sdOf({ attrs: { ACC: 15 } }).sd > base.sd + 0.05, 'low ACC grows it');
  assert.ok(sdOf({ ty: 30 }).sd > base.sd + 0.2, 'length grows it');
  const run = sdOf({ run: true });
  assert.ok(run.running > 0.3 && run.sd > base.sd + 0.1, 'throwing on the run: ' + JSON.stringify(run));
  const spy = lab({ place: [{ id: 'DL4', x: 0.5, y: -5.4 }] });
  spy.defenders.find((d) => d.id === 'DL4').role = 'SPY';
  spy.defenders.find((d) => d.id === 'DL4').zone = { x: 0, y: -5.4, r: 6 };
  const sl = liveOf(spy, 2); stepTo(sl, 1.3); sl.throwAlong(line(sl, 6, 12), 0.4);
  const sp = finish(sl).release;
  assert.ok(sp.pressure > 0.4 && sp.sd > base.sd + 0.1, 'pressure grows it: ' + JSON.stringify(sp));
  let off = 0;
  for (let seed = 0; seed < 30; seed++) {
    const live = liveOf(lab(), seed);
    stepTo(live, 1.3);
    live.throwAlong(line(live, 6, 12), 0.4);
    off += hyp(live.ball.landing.x - 6, live.ball.landing.y - 12);
  }
  assert.ok(off / 30 > 0.2 && off / 30 < 3, 'the landing scatters around the drawn end: ' + (off / 30).toFixed(2));
});

test('contact: a bullet THROUGH a linebacker is tipped or picked in flight far more often than a lob over him to the same receiver', () => {
  const q = { x: 0, y: -7 }, tgt = { x: 6, y: 12 }, u = 0.55;
  const lb = { id: 'LB1', x: q.x + (tgt.x - q.x) * u, y: q.y + (tgt.y - q.y) * u };
  const count = (loft) => {
    let hit = 0, n = 0;
    for (let seed = 0; seed < 200; seed++) {
      const live = liveOf(lab({ place: [lb] }), 7000 + seed);
      stepTo(live, 1.2);
      live.throwAlong(line(live, tgt.x, tgt.y), loft);
      const res = finish(live);
      n++;
      if (res.ended === 'TIPPED' || (res.outcome === 'INT' && res.ended === 'FLIGHT')) hit++;
    }
    return hit / n;
  };
  const bullet = count(0.05), lob = count(0.9);
  assert.ok(bullet >= 0.35, 'the bullet is got at ' + bullet.toFixed(2));
  assert.ok(lob <= 0.12, 'the lob sails over him (only a man who runs under its descent gets a hand on it): ' + lob.toFixed(2));
  assert.ok(bullet >= 3 * Math.max(lob, 0.01), 'bullet ' + bullet + ' vs lob ' + lob);
});

test('contact: each defender gets at most ONE contact roll per throw', () => {
  const q = { x: 0, y: -7 }, tgt = { x: 0, y: 14 };
  const sim = lab({ tx: 0, ty: 14, place: [{ id: 'LB1', x: 0, y: 1 }, { id: 'LB2', x: 0.3, y: 5 }] });
  const rng = counting(9);
  const live = Field.create(sim, rng);
  stepTo(live, 1.2);
  live.throwAlong([q, tgt], 0.05);
  const afterRelease = rng.draws;
  while (live.phase === 'BALL_IN_AIR' && live.ball.u < 0.9) live.step(F.dt);
  assert.ok(rng.draws - afterRelease <= 4, 'two defenders: at most a touch and a pick roll each (' + (rng.draws - afterRelease) + ')');
});

test('a lob is slower: a defender with time closes — the nearest defender is on top of a lob and yards off a bullet to the same spot', () => {
  const place = [{ id: 'CB2', x: 13, y: 12, deep: false, react: 0.3 }];
  const nearAt = (loft) => {
    const d = [];
    for (let seed = 0; seed < 40; seed++) {
      const live = liveOf(lab({ place }), 50 + seed);
      stepTo(live, 1.2);
      live.throwAlong(line(live, 6, 12), loft);
      const res = finish(live);
      if (res.nearest) d.push(res.nearest.d);
    }
    return median(d);
  };
  const bullet = nearAt(0.05), lob = nearAt(1);
  assert.ok(bullet > lob + 2, 'bullet ' + bullet.toFixed(2) + ' yd vs lob ' + lob.toFixed(2) + ' yd');
  assert.ok(lob <= F.contestR, 'the lob is contested');
});

test('the catch: an open receiver at the spot catches it almost always; a ball to nobody is incomplete; a defender alone at the spot can pick it', () => {
  let caught = 0;
  for (let seed = 0; seed < 100; seed++) {
    const live = liveOf(lab(), 900 + seed);
    stepTo(live, 1.2);
    live.throwAlong(line(live, 6, 12), 0.5);
    const res = finish(live);
    if (res.outcome === 'CATCH') caught++;
    assert.ok(['CATCH', 'DROP', 'INCOMPLETE'].includes(res.outcome), res.outcome);
  }
  assert.ok(caught >= 88, caught + '/100 open catches');
  const nobody = liveOf(lab(), 1);
  stepTo(nobody, 1.2);
  const thrown = nobody.throwAlong(line(nobody, -22, 30), 0.5);
  assert.equal(thrown.target, null, 'nobody can get near it: thrown to nobody');
  const r1 = finish(nobody);
  assert.equal(r1.outcome, 'INCOMPLETE'); assert.equal(r1.target, null); assert.equal(r1.turnover, false);
  const tries = liveOf(lab(), 2);
  stepTo(tries, 1.2);
  assert.equal(tries.classify(line(tries, -8, 14), 0.5).kind, 'RUN', 'out of his reach: the line classifies as a run');
  assert.equal(tries.throwAlong(line(tries, -8, 14), 0.5).target, 'WR1', 'thrown anyway, it is meant for the man with the best chance');
  assert.equal(tries.receivers[0].target, true);
  let picks = 0;
  for (let seed = 0; seed < 100; seed++) {
    const live = liveOf(lab({ place: [{ id: 'S1', x: -8, y: 14, deep: false }] }), 300 + seed);
    stepTo(live, 1.2);
    live.throwAlong(line(live, -8, 14), 0.5);
    const r = finish(live);
    if (r.outcome === 'INT') { picks++; assert.equal(r.turnover, true); assert.equal(r.text, 'INTERCEPTED'); assert.equal(live.carrier, 'S1'); }
  }
  assert.ok(picks >= 20, picks + '/100 thrown to a lone safety are picked');
});

// ═══════════════════════════════ THE RUSH, THE SACK, THE SCRAMBLE ═══════════════════════════════

test('sack: a QB who never throws is sacked (SACK, a loss, TOO LATE, down) — by ~3.5 s on most snaps with an average line', () => {
  const times = [];
  for (let seed = 0; seed < 150; seed++) {
    const { sim } = mk({ seed: 2000 + seed });
    const live = liveOf(sim, seed);
    const res = finish(live);
    assert.equal(res.outcome, 'SACK'); assert.equal(res.kind, 'SACK');
    assert.ok(res.yards <= 0); assert.equal(res.feedback.timing, 'TOO LATE');
    assert.equal(live.qb.down, true); assert.equal(live.qb.hasBall, true);
    assert.ok(/^SACKED/.test(res.text) && res.banner === res.text && !res.firstDown);
    assert.equal(live.events[live.events.length - 1].kind, 'SACK');
    times.push(res.endT);
  }
  const by35 = times.filter((t) => t <= 3.5).length / times.length;
  assert.ok(by35 >= 0.8, 'sacked by 3.5 s: ' + by35.toFixed(2));
  assert.ok(median(times) > 2.4 && median(times) < 3.4, 'median ' + median(times));
});

test('the rush: rushers are blocked until they beat their man (beatAt), then free; the RUSH meter rises as the pocket folds', () => {
  const { sim } = mk({ seed: 23 });
  const live = liveOf(sim, 1);
  const first = sim.rushers[0];
  const di = live.defenders.findIndex((d) => d.id === first.defId);
  stepTo(live, 0.5);
  const p0 = live.pressure;
  assert.equal(live.defenders[di].blocked, true);
  stepTo(live, first.beatAt - 0.05);
  assert.equal(live.defenders[di].blocked, true, 'still blocked just before beatAt');
  stepTo(live, first.beatAt + 0.05);
  if (live.phase !== 'DONE') {
    assert.equal(live.defenders[di].blocked, false, 'free after beatAt');
    assert.ok(live.pressure > p0 + 0.1, 'the meter rises: ' + p0.toFixed(2) + ' → ' + live.pressure.toFixed(2));
  }
  for (const d of live.defenders) if (d.role !== 'RUSH') assert.equal(d.blocked, false);
});

test('rollout: running away from the rusher who beats his block first delays the sack', () => {
  const stand = [], away = [];
  for (let seed = 0; seed < 80; seed++) {
    const { sim } = mk({ seed: 2500 + seed });
    const side = Math.sign(sim.rushers[0].line.x) || 1;
    const a = liveOf(sim, seed), b = liveOf(sim, seed);
    stand.push(finish(a).endT);
    stepTo(b, 0.9);
    b.setRun(line(b, b.qb.x - side * 12, b.qb.y - 1));
    const rb = finish(b);
    away.push(rb.outcome === 'SACK' ? rb.endT : F.maxT);
  }
  assert.ok(mean(away) > mean(stand) + 0.4, 'rollout ' + mean(away).toFixed(2) + ' s vs pocket ' + mean(stand).toFixed(2) + ' s');
});

test('MOB escapes: a mobile QB slips more sacks (ESCAPE events, the rusher shed for shedS)', () => {
  const escapes = (mob) => {
    let n = 0;
    for (let seed = 0; seed < 150; seed++) {
      const { sim } = mk({ seed: 3000 + seed, attrs: { MOB: mob } });
      const live = liveOf(sim, seed);
      const res = finish(live);
      n += res.escaped;
      assert.equal(res.escaped, live.events.filter((e) => e.kind === 'ESCAPE').length);
    }
    return n;
  };
  const lo = escapes(10), hi = escapes(99);
  assert.ok(hi > lo * 2 + 5, 'MOB 99 ' + hi + ' vs MOB 10 ' + lo);
});

test('scramble: crossing the line with the ball is a SCRAMBLE — the event, the QB carries, no more passing, the defence pursues; the result is where he goes down', () => {
  let scrambles = 0;
  for (let seed = 0; seed < 40; seed++) {
    const { sim } = mk({ seed: 3500 + seed });
    const live = liveOf(sim, seed);
    stepTo(live, 1.2);
    live.setRun([{ x: live.qb.x, y: live.qb.y }, { x: live.qb.x + 4, y: 1.5 }, { x: live.qb.x + 4, y: 25 }]);
    let crossed = false;
    while (live.phase !== 'DONE') {
      live.step(1 / 30);
      if (live.phase === 'SCRAMBLE' && !crossed) {
        crossed = true;
        assert.equal(live.carrier, 'QB');
        assert.ok(live.events.some((e) => e.kind === 'SCRAMBLE'));
        assert.equal(live.throwAlong(line(live, live.qb.x + 5, live.qb.y + 5), 0.5).ok, false, 'no passing past the line');
        assert.equal(live.throwAway().ok, false);
      }
    }
    const res = live.result();
    if (!crossed) { assert.equal(res.outcome, 'SACK'); continue; }
    scrambles++;
    assert.equal(res.outcome, 'SCRAMBLE'); assert.equal(res.kind, 'SCRAMBLE');
    assert.ok(['TACKLE', 'OUT_OF_BOUNDS', 'TD'].includes(res.ended), res.ended);
    near(res.yards, Math.round(live.qb.y), 1.01, 'yards where he went down');
    if (res.ended === 'TACKLE') assert.equal(live.qb.down, true, 'tackled: down');
    assert.equal(res.text, 'SCRAMBLE ' + (res.yards > 0 ? '+' : '') + res.yards);
  }
  assert.ok(scrambles >= 25, scrambles + ' scrambles');
});

test('the sideline: a run out of bounds ends the play OUT_OF_BOUNDS (behind the line: a SCRAMBLE for a loss, never a sack)', () => {
  const sim = lab();
  const live = liveOf(sim, 1);
  stepTo(live, 0.8);
  live.setRun(line(live, live.field.sideR + 5, live.qb.y));
  const res = finish(live);
  assert.equal(res.outcome, 'SCRAMBLE'); assert.equal(res.ended, 'OUT_OF_BOUNDS');
  assert.ok(res.yards < 0);
  assert.ok(live.events.some((e) => e.kind === 'OUT_OF_BOUNDS' && e.who === 'QB'));
});

test('the goal line: a carrier who reaches it scores — TD, yards = the distance to the goal, TOUCHDOWN! (a scramble and a catch)', () => {
  const sim = lab({ sit: { yl: 95, toGo: 5 }, tx: 3, ty: 2 });
  const live = liveOf(sim, 2);
  stepTo(live, 0.8);
  live.setRun(line(live, 0, 12));
  const res = finish(live);
  assert.equal(res.outcome, 'SCRAMBLE'); assert.equal(res.td, true); assert.equal(res.yards, 5); assert.equal(res.banner, 'TOUCHDOWN!');
  assert.ok(live.events.some((e) => e.kind === 'TD'));
  let tds = 0;
  for (let seed = 0; seed < 20; seed++) {
    const l2 = liveOf(sim, 100 + seed);
    stepTo(l2, 1.2);
    l2.throwAlong(line(l2, 3, 2), 0.3);
    const r2 = finish(l2);
    if (r2.outcome === 'CATCH') { tds++; assert.equal(r2.td, true); assert.equal(r2.yards, 5); assert.equal(r2.airYards + r2.yac, r2.yards); }
  }
  assert.ok(tds >= 15, tds + ' catch-and-runs score');
});

test('tackles: after a catch the carrier runs until he is tackled (or breaks tackles), yards = air + yac, the events tell it', () => {
  let tackles = 0, broken = 0, catches = 0;
  for (let seed = 0; seed < 120; seed++) {
    const { sim } = mk({ seed: 4000 + seed });
    const live = liveOf(sim, seed);
    stepTo(live, 1.3);
    if (live.phase !== 'PRE_THROW') continue;
    const best = live.receivers.slice().sort((a, b) => b.sep - a.sep)[0];
    live.throwAlong(live.aim(best.slot, 0.4).points, 0.4);
    const res = finish(live);
    if (res.outcome !== 'CATCH') continue;
    catches++;
    assert.equal(res.airYards + res.yac, res.yards);
    assert.ok(live.events.some((e) => e.kind === 'CATCH'));
    if (res.ended === 'TACKLE') { tackles++; assert.equal(live.events[live.events.length - 1].kind, 'TACKLE'); }
    broken += live.events.filter((e) => e.kind === 'BROKEN_TACKLE').length;
    assert.ok(['TACKLE', 'OUT_OF_BOUNDS', 'TD', 'TIMEOUT'].includes(res.ended));
  }
  assert.ok(catches >= 50 && tackles >= catches * 0.6, catches + ' catches, ' + tackles + ' tackled');
  assert.ok(broken >= 1, 'somebody breaks a tackle');
});

test('maxT: a play that never resolves ends at maxT (the QB with the ball and nobody rushing is a SACK by the clock)', () => {
  const live = liveOf(lab(), 1);
  const res = finish(live);
  assert.equal(res.outcome, 'SACK'); assert.equal(res.ended, 'TIMEOUT');
  near(res.endT, F.maxT, F.dt * 2, 'at maxT');
});

// ═══════════════════════════════ COVERAGE ═══════════════════════════════

test('coverage: the defence starts at the SHOWN alignment and rotates into the REAL roles; man defenders stay with their man; zone defenders sit near their landmarks', () => {
  const manDist = [];
  for (let seed = 0; seed < 30; seed++) {
    const { ctx, sim } = mk({ seed: 5000 + seed, cov: 'MAN' });
    const live = liveOf(sim, seed);
    for (let i = 0; i < 11; i++) assert.deepEqual([live.defenders[i].x, live.defenders[i].y], [ctx.alignment.defenders[i].x, ctx.alignment.defenders[i].y]);
    stepTo(live, 1.8);
    if (live.phase !== 'PRE_THROW') continue;
    for (const d of live.defenders) {
      if (d.role !== 'MAN') continue;
      const r = live.receivers.find((x) => x.slot === d.man);
      manDist.push(hyp(d.x - r.x, d.y - r.y));
    }
  }
  assert.ok(median(manDist) < 3.5, 'man coverage stays close: median ' + median(manDist).toFixed(2));
  const { sim } = mk({ seed: 9, cov: 'COVER3' });
  const live = liveOf(sim, 1);
  stepTo(live, 2.0);
  for (let i = 0; i < 11; i++) {
    const d = sim.defenders[i];
    if (d.role !== 'ZONE') continue;
    const o = live.defenders[i];
    assert.ok(hyp(o.x - d.zone.x, o.y - d.zone.y) <= d.zone.r + 4, d.id + ' near his landmark');
  }
});

test('receivers: the ring is shown from revealAt (IQ); open follows the separation through openSep', () => {
  const { sim } = mk({ seed: 17, attrs: { IQ: 20 } });
  const live = liveOf(sim);
  live.step(F.dt);
  assert.ok(sim.revealAt > 0.5);
  assert.ok(live.receivers.every((r) => !r.shown));
  stepTo(live, sim.revealAt + 0.02);
  assert.ok(live.receivers.every((r) => r.shown));
  for (const r of live.receivers) {
    const want = Math.max(0, Math.min(1, (r.sep - F.openSep.lo) / (F.openSep.hi - F.openSep.lo)));
    near(r.open, want, 1e-9, r.slot + ' open');
    assert.ok(r.sep >= 0);
  }
});

test('aim: the spot a receiver\'s route has him at the ball\'s arrival (a fixed point of flight time), null when passing is illegal or the slot unknown', () => {
  const sim = lab();
  const live = liveOf(sim);
  stepTo(live, 1.3);
  const a = live.aim('WR1', 0.5);
  near(a.x, 6, 1e-6); near(a.y, 12, 1e-6, 'a sitting receiver: his spot');
  near(a.flight, hyp(6 - live.qb.x, 12 - live.qb.y) / Field.ballSpeed(sim.ctx.qb.attrs, 0.5), 1e-3, 'flight');
  assert.equal(live.aim('NOPE', 0.5), null);
  const { sim: s2 } = mk({ seed: 19 });
  const l2 = liveOf(s2);
  stepTo(l2, 0.8);
  const g = l2.aim('WR1', 0);
  const at = Field.pathAt(s2.receivers[0], g.arrive);
  near(hyp(g.x - at.x, g.y - at.y), 0, 0.05, 'where the route has him at the arrival');
  l2.throwAway();
  assert.equal(l2.aim('WR1', 0.5), null, 'no aim once the ball is gone');
});

// ═══════════════════════════════ THE RESULT ═══════════════════════════════

test('result: null until DONE, then the same object; the shape, the text and banner rules, the feedback labels', () => {
  const kinds = {};
  for (let seed = 0; seed < 80; seed++) {
    const { sim } = mk({ seed: 6000 + seed });
    const live = liveOf(sim, seed);
    assert.equal(live.result(), null);
    stepTo(live, 0.8 + (seed % 12) * 0.2);
    if (live.phase === 'PRE_THROW') {
      if (seed % 5 === 0) live.throwAway();
      else { const a = live.aim(sim.receivers[seed % 5].slot, (seed % 3) / 2); live.throwAlong(a.points, (seed % 3) / 2); }
    }
    const res = finish(live);
    assert.equal(live.result(), res);
    for (const k of ['run', 'playId', 'play', 'kind', 'outcome', 'target', 'yards', 'airYards', 'yac', 'td', 'firstDown', 'turnover', 'fumble', 't', 'loft', 'length', 'text', 'banner', 'feedback']) assert.ok(k in res, 'result.' + k);
    assert.equal(res.run, false); assert.equal(res.playId, sim.playId);
    assert.ok(['PASS', 'THROWAWAY', 'SCRAMBLE', 'SACK'].includes(res.kind));
    assert.ok(['CATCH', 'INCOMPLETE', 'INT', 'SACK', 'THROWAWAY', 'SCRAMBLE', 'DROP'].includes(res.outcome));
    assert.ok(Number.isInteger(res.yards) && res.yards <= sim.field.goalY && res.yards >= -(sim.ctx.situation.yl - 1));
    assert.ok(['EARLY', 'ON TIME', 'LATE', 'TOO LATE'].includes(res.feedback.timing));
    assert.ok(['BULLET', 'TOUCH', 'LOB'].includes(res.feedback.touch));
    assert.ok(['ON THE MONEY', 'LED HIM', 'BEHIND HIM', 'OVERTHROWN', 'UNDERTHROWN', 'INTO COVERAGE', 'TIPPED', '—'].includes(res.feedback.placement), res.feedback.placement);
    assert.ok(/^Coach saw/.test(res.feedback.coachSaw), res.feedback.coachSaw);
    if (res.td) assert.equal(res.banner, 'TOUCHDOWN!');
    else if (res.firstDown) assert.equal(res.banner, 'FIRST DOWN');
    else assert.equal(res.banner, res.text);
    assert.equal(res.turnover, res.outcome === 'INT');
    const texts = { CATCH: /^CATCH [+-]?\d+$/, INCOMPLETE: /^(INCOMPLETE|TIPPED)$/, INT: /^INTERCEPTED$/, SACK: /^SACKED -?\d+$/, THROWAWAY: /^THROWN AWAY$/, SCRAMBLE: /^SCRAMBLE [+-]?\d+$/, DROP: /^DROPPED$/ };
    assert.ok(texts[res.outcome].test(res.text), res.outcome + ' → ' + res.text);
    kinds[res.outcome] = true;
  }
  assert.ok(Object.keys(kinds).length >= 4, 'a spread of outcomes: ' + Object.keys(kinds));
});

test('result: on the last play a first down that does not score is not FIRST DOWN — the banner is the text', () => {
  const sim = lab({ sit: { yl: 60, toGo: 3, lastPlay: true, quarter: 4, clock: 5 }, tx: 3, ty: 6 });
  let checked = 0;
  for (let seed = 0; seed < 30 && checked < 5; seed++) {
    const live = liveOf(sim, seed);
    stepTo(live, 1.2);
    live.throwAlong(line(live, 3, 6), 0.3);
    const res = finish(live);
    if (res.outcome === 'CATCH' && res.firstDown && !res.td) { assert.equal(res.banner, res.text); checked++; }
  }
  assert.ok(checked >= 1, 'a last-play first down seen');
});

test('events: in time order; SNAP first; RELEASE at the QB\'s spot; the play ends on its deciding event', () => {
  for (let seed = 0; seed < 30; seed++) {
    const { sim } = mk({ seed: 7000 + seed });
    const live = liveOf(sim, seed);
    stepTo(live, 1.4);
    let rel = null;
    if (live.phase === 'PRE_THROW') { rel = { x: live.qb.x, y: live.qb.y }; live.throwAlong(live.aim(sim.receivers[seed % 5].slot, 0.4).points, 0.4); }
    const res = finish(live);
    const ev = live.events;
    assert.equal(ev[0].kind, 'SNAP');
    for (let i = 1; i < ev.length; i++) assert.ok(ev[i].t >= ev[i - 1].t);
    for (const e of ev) assert.ok(Field.EVENTS.includes(e.kind), e.kind);
    if (rel) { const r = ev.find((e) => e.kind === 'RELEASE'); near(r.x, rel.x, 0.001); near(r.y, rel.y, 0.001); }
    const lastKinds = { CATCH: ['TACKLE', 'OUT_OF_BOUNDS', 'TD', 'CATCH', 'BROKEN_TACKLE'], INCOMPLETE: ['INCOMPLETE'], INT: ['INT'], DROP: ['DROP'], SACK: ['SACK'], THROWAWAY: ['THROWAWAY'], SCRAMBLE: ['TACKLE', 'OUT_OF_BOUNDS', 'TD', 'SCRAMBLE'] };
    assert.ok(lastKinds[res.outcome].includes(ev[ev.length - 1].kind), res.outcome + ' ends on ' + ev[ev.length - 1].kind);
  }
});

test('after DONE the players coast (presentation only): stepping on changes no result, draws nothing and adds no events', () => {
  const { sim } = mk({ seed: 25 });
  const rng = counting(3);
  const live = Field.create(sim, rng);
  stepTo(live, 1.3);
  live.throwAlong(live.aim('WR2', 0.4).points, 0.4);
  const res = finish(live);
  const n = live.events.length, draws = rng.draws, json = J(res);
  for (let i = 0; i < 60; i++) live.step(0.05);
  assert.equal(live.phase, 'DONE'); assert.equal(live.events.length, n); assert.equal(rng.draws, draws);
  assert.deepEqual(J(live.result()), json);
  assertFinite(live, 'coasting');
});

// ═══════════════════════════════ GARBAGE IN, NOTHING BROKEN ═══════════════════════════════

test('no NaN anywhere under garbage input — NaN / strings / empty / one-point / huge polylines, loft out of range, calls in the wrong phase → {ok:false, reason}, never a throw', () => {
  const garbage = [undefined, null, NaN, 'x', 42, {}, [], [{}], [{ x: 1 }], [{ x: NaN, y: NaN }, { x: Infinity, y: -Infinity }],
    [{ x: 0, y: -7 }], [[0, -7], [5, 5]], [{ x: 1e300, y: -1e300 }, { x: -1e300, y: 1e300 }],
    Array.from({ length: 20000 }, (_, i) => ({ x: Math.sin(i) * 40, y: Math.cos(i) * 40 })), 'not a line'];
  const lofts = [undefined, null, NaN, -5, 7, 'lob', Infinity, {}];
  for (let seed = 0; seed < 6; seed++) {
    const { sim } = mk({ seed: 8000 + seed });
    const live = liveOf(sim, seed);
    assert.doesNotThrow(() => {
      for (let i = 0; i < garbage.length; i++) {
        live.step(i % 2 ? 'x' : 0.05);
        const g = garbage[i], loft = lofts[i % lofts.length];
        const c = live.classify(g, loft);
        assert.ok(['PASS', 'RUN', 'THROWAWAY', 'INVALID'].includes(c.kind));
        const r = live.setRun(g);
        assert.equal(typeof r.ok, 'boolean'); if (!r.ok) assert.equal(typeof r.reason, 'string');
        const a = live.aim(g, loft);
        assert.ok(a === null || Number.isFinite(a.x));
        assertFinite(live, 'seed ' + seed + ' garbage ' + i);
      }
      const t = live.throwAlong(garbage[seed % garbage.length], lofts[seed % lofts.length]);
      assert.equal(typeof t.ok, 'boolean');
      for (let i = 0; i < 200 && live.phase !== 'DONE'; i++) { live.step(0.1); live.setRun(garbage[i % garbage.length]); live.throwAway(); }
      finish(live);
      assert.equal(live.throwAlong([{ x: 0, y: 0 }, { x: 5, y: 5 }], 0.5).ok, false);
      assert.equal(live.throwAway().ok, false);
      assert.equal(live.setRun([{ x: 0, y: 0 }, { x: 5, y: 5 }]).ok, false);
      assert.equal(live.classify([{ x: 0, y: 0 }, { x: 5, y: 5 }], 0.5).kind, 'INVALID');
    });
    assertFinite(live, 'seed ' + seed + ' end');
    assert.ok(live.result() && typeof live.result().outcome === 'string');
    const res = Play.resolve(sim, J(live.plan()), RTG.RNG.create(seed));
    assert.deepEqual(J(res), J(live.result()), 'garbage replays too');
  }
  for (const plan of [null, undefined, 'x', {}, { runs: 'x', pass: 5, away: 'y' }, { runs: [null, { t: -1 }, { t: NaN, points: [] }], pass: { t: 1e9 }, away: -3 }]) {
    const { sim } = mk({ seed: 8100 });
    assert.doesNotThrow(() => { const r = Play.resolve(sim, plan, RTG.RNG.create(1)); assert.equal(typeof r.outcome, 'string'); });
  }
});
