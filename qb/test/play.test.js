/**
 * RTG.Play — the QB moment engine: draw counts, determinism, the read (coverage, disguise, advice, cards), the
 * sack clock, the snap (openness windows, hot read, checkdown, runs), the throw (sack / throwaway / scramble /
 * pass rules, interception gate, completion monotonicity), the drive script and the passer rating.
 *   node qb/test/play.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RTG = require('./load')();
const Play = RTG.Play, Tuning = RTG.Tuning, Dp = RTG.Data.plays;
const T = Tuning.qb;

/** Realm-agnostic deep copy (engine objects live in a vm context; functions are dropped). */
const J = (o) => JSON.parse(JSON.stringify(o));
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ': expected ' + b + ' ±' + tol + ', got ' + a);
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

/** RNG that counts its draws. */
function counting(seed) {
  const r = RTG.RNG.create(seed);
  const next = r.next.bind(r);
  r.draws = 0;
  r.next = () => { r.draws++; return next(); };
  return r;
}
/** RNG whose forks count their own draws (r.children[i].draws). */
function forkCounting(seed) {
  const r = counting(seed);
  const fork = r.fork.bind(r);
  r.children = [];
  r.fork = (label) => {
    const c = fork(label);
    const cnext = c.next.bind(c);
    c.draws = 0; c.label = label;
    c.next = () => { c.draws++; return cnext(); };
    r.children.push(c);
    return c;
  };
  return r;
}

const QB55 = { attrs: { ARM: 55, ACC: 55, IQ: 55, MOB: 55, POI: 55 }, archetype: 'FIELD_GENERAL' };
const SIT = { down: 3, toGo: 6, yl: 40, quarter: 2, clock: 500, score: { us: 7, them: 10 } };
function sit(extra) { return Object.assign({}, SIT, { qb: QB55, team: T.demo.teams.AVERAGE, opp: T.demo.teams.AVERAGE }, extra || {}); }
function withAttrs(a, extra) { return sit(Object.assign({ qb: { attrs: Object.assign({}, QB55.attrs, a) } }, extra || {})); }
function best(sim) { return sim.receivers.slice().sort((a, b) => b.peak - a.peak)[0]; }
function playOf(id) { return Dp.plays.find((p) => p.id === id); }
/** A perfect input for a receiver at release time t (ideal lead/loft, the middle of the green band). */
function perfect(sim, rec, t, extra) {
  const route = Dp.routes[rec.route], need = Play.need(sim, rec.slot, t);
  return Object.assign({ target: rec.slot, t, lead: route.ideal.lead, loft: route.ideal.loft, power: need.need + need.band / 2, quality: 1, green: true }, extra || {});
}
/** ctx + sim for a seed on a play of a given rating vs the real coverage (or any pass play). */
function snapFor(seed, rating, situation) {
  const rng = RTG.RNG.create(seed);
  const ctx = Play.buildContext(situation || sit(), rng);
  const cands = Dp.plays.filter((p) => !p.run && (!rating || p.vs[ctx.real] === rating));
  if (!cands.length) return null;
  const sim = Play.snap(ctx, cands[seed % cands.length].id, rng);
  return { rng, ctx, sim };
}

// ═══════════════════════════════ DATA ═══════════════════════════════

test('data: every route has ideal lead in −1..1, loft in 0..1, a window inside [0, 4] and a path starting at the alignment', () => {
  const ids = ['GO', 'POST', 'CORNER', 'OUT', 'IN', 'CURL', 'COMEBACK', 'SLANT', 'FLAT', 'WHEEL', 'SCREEN', 'DRAG', 'SEAM', 'FADE', 'CHECKDOWN'];
  for (const id of ids) {
    const r = Dp.routes[id];
    assert.ok(r, id + ' missing');
    assert.equal(r.id, id);
    assert.ok(r.ideal.lead >= -1 && r.ideal.lead <= 1, id + ' lead');
    assert.ok(r.ideal.loft >= 0 && r.ideal.loft <= 1, id + ' loft');
    assert.ok(r.window.open >= 0 && r.window.close <= 4 && r.window.open < r.window.close, id + ' window ' + JSON.stringify(r.window));
    assert.ok(['SHORT', 'MID', 'DEEP'].includes(r.family), id + ' family');
    assert.deepEqual(J(r.path[0]), { t: 0, x: 0, y: 0 }, id + ' path start');
    for (let i = 1; i < r.path.length; i++) assert.ok(r.path[i].t > r.path[i - 1].t, id + ' path times ascend');
    assert.ok(r.path[r.path.length - 1].t <= 4.2, id + ' path ends by 4 s');
  }
});

test('data: about 12 pass plays, every one assigns all five slots to known routes with a full vs table; SNEAK and DRAW are the run options', () => {
  const passes = Dp.plays.filter((p) => !p.run), runs = Dp.plays.filter((p) => p.run);
  assert.ok(passes.length >= 11 && passes.length <= 14, passes.length + ' pass plays');
  for (const p of passes) {
    assert.equal(p.assignments.length, 5, p.id);
    assert.deepEqual(J(p.assignments.map((a) => a.slot).sort()), ['RB', 'SLOT', 'TE', 'WR1', 'WR2'], p.id + ' slots');
    for (const a of p.assignments) assert.ok(Dp.routes[a.route], p.id + ' route ' + a.route);
    for (const c of Dp.order) assert.ok(['GOOD', 'OK', 'BAD'].includes(p.vs[c]), p.id + ' vs ' + c);
    assert.ok(Dp.formations[p.formation], p.id + ' formation');
    assert.equal(typeof p.line, 'string');
  }
  assert.deepEqual(J(runs.map((r) => r.id)), ['SNEAK', 'DRAW']);
  for (const r of runs) assert.deepEqual(J(r.tags), ['RUN', 'SHORT_YDG']);
  for (const c of Dp.order) {
    assert.ok(passes.some((p) => p.vs[c] === 'GOOD'), 'a GOOD play vs ' + c);
    assert.ok(passes.some((p) => p.vs[c] === 'BAD'), 'a BAD play vs ' + c);
  }
});

test('data: the six coverages carry looks, disguises among the six, pressureMul (BLITZ 1.6, PREVENT 0.7) and tightness by family', () => {
  assert.deepEqual(J(Object.keys(Dp.coverages).sort()), ['BLITZ', 'COVER2', 'COVER3', 'COVER4', 'MAN', 'PREVENT']);
  for (const id of Dp.order) {
    const c = Dp.coverages[id];
    assert.ok(c.look.safeties === 1 || c.look.safeties === 2, id + ' safeties');
    assert.equal(typeof c.look.press, 'boolean'); assert.equal(typeof c.look.showBlitz, 'boolean');
    assert.ok(c.look.box >= 4 && c.look.box <= 9, id + ' box');
    assert.ok(c.disguises.length >= 1 && c.disguises.every((d) => Dp.coverages[d] && d !== id), id + ' disguises');
    for (const f of ['SHORT', 'MID', 'DEEP']) assert.ok(c.tightness[f] >= 0 && c.tightness[f] <= 1, id + ' tightness ' + f);
    assert.equal(typeof c.text, 'string'); assert.equal(typeof c.tell, 'string');
  }
  assert.equal(Dp.coverages.BLITZ.pressureMul, 1.6);
  assert.equal(Dp.coverages.PREVENT.pressureMul, 0.7);
  assert.equal(Dp.coverages.BLITZ.look.showBlitz, true);
});

// ═══════════════════════════════ DRAW COUNTS & DETERMINISM ═══════════════════════════════

test('draw counts: buildContext / snap / throw / driveScript each cost the parent exactly 1 draw (the fork)', () => {
  const r = counting(7);
  const ctx = Play.buildContext(sit(), r);
  assert.equal(r.draws, 1, 'buildContext');
  const sim = Play.snap(ctx, ctx.options.filter((o) => !o.run)[0].id, r);
  assert.equal(r.draws, 2, 'snap');
  Play.throw(sim, perfect(sim, best(sim), 1.5), r);
  assert.equal(r.draws, 3, 'throw');
  Play.driveScript({}, r);
  assert.equal(r.draws, 4, 'driveScript');
  Play.rating({ att: 1, cmp: 1, yds: 10, td: 0, int: 0 });
  assert.equal(r.draws, 4, 'rating draws nothing');
});

test('draw counts: the child draws are fixed — ctx 8 + 3·cards (pick, shuffle, clarity roll), pass snap 28, SNEAK 3, DRAW 4, drive 25', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const r = forkCounting(seed);
    const ctx = Play.buildContext(sit(), r);
    const nPass = ctx.options.filter((o) => !o.run).length;
    assert.equal(r.children[0].label, 'play:ctx');
    assert.equal(r.children[0].draws, 8 + 3 * nPass, 'ctx child, seed ' + seed);
    Play.snap(ctx, ctx.options.filter((o) => !o.run)[0].id, r);
    assert.equal(r.children[1].label, 'play:snap');
    assert.equal(r.children[1].draws, 28, 'snap child, seed ' + seed);
  }
  const r = forkCounting(9);
  const ctx = Play.buildContext(sit({ down: 4, toGo: 1 }), r);
  Play.snap(ctx, 'SNEAK', r);
  assert.equal(r.children[r.children.length - 1].draws, 3, 'SNEAK');
  Play.snap(ctx, 'DRAW', r);
  assert.equal(r.children[r.children.length - 1].draws, 4, 'DRAW');
  Play.driveScript({ venue: 'NFL' }, r);
  assert.equal(r.children[r.children.length - 1].label, 'play:drive');
  assert.equal(r.children[r.children.length - 1].draws, 25, 'drive');
});

test('draw counts: throw child — THROW 9 · SACK 2 · THROWAWAY 0 · SCRAMBLE 3 (+1 escape roll past the sack clock)', () => {
  const r = forkCounting(11);
  const ctx = Play.buildContext(sit(), r);
  const sim = Play.snap(ctx, ctx.options.filter((o) => !o.run)[0].id, r);
  const rec = best(sim);
  const last = () => r.children[r.children.length - 1].draws;
  Play.throw(sim, perfect(sim, rec, 1.0), r); assert.equal(last(), 9, 'THROW');
  Play.throw(sim, perfect(sim, rec, sim.sackAt + 0.1), r); assert.equal(last(), 2, 'SACK by the clock');
  Play.throw(sim, { kind: 'SACK', t: 0.5 }, r); assert.equal(last(), 2, 'SACK by kind');
  Play.throw(sim, { kind: 'THROWAWAY', t: 1 }, r); assert.equal(last(), 0, 'THROWAWAY');
  Play.throw(sim, { kind: 'THROW', t: 1 }, r); assert.equal(last(), 0, 'THROW without a target is a throwaway');
  Play.throw(sim, { kind: 'SCRAMBLE', t: 1 }, r); assert.equal(last(), 3, 'SCRAMBLE');
  const late = Play.throw(sim, { kind: 'SCRAMBLE', t: sim.sackAt + 0.1 }, r);
  assert.equal(last(), late.outcome === 'SACK' ? 3 : 4, 'SCRAMBLE past the clock: escape roll + (sack 2 | scramble 3)');
  Play.throw(Play.snap(Play.buildContext(sit({ toGo: 1 }), r), 'SNEAK', r), { t: 1 }, r);
  assert.equal(last(), 0, 'a run sim passes through throw with no child draws');
});

test('determinism: the same seed gives the same context, sim and result; a different seed differs', () => {
  const run = (seed) => {
    const r = RTG.RNG.create(seed);
    const ctx = Play.buildContext(sit(), r);
    const sim = Play.snap(ctx, ctx.options[0].id, r);
    const res = sim.run ? sim : Play.throw(sim, perfect(sim, best(sim), 1.2), r);
    return { ctx: J(ctx), sim: J(sim), res: J(res), state: r.state() };
  };
  const a = run(2024), b = run(2024), c = run(2025);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.ctx, c.ctx);
  assert.ok(JSON.stringify(a.sim).length > 1000, 'the sim serialises (JSON drops the helper closures)');
});

// ═══════════════════════════════ THE READ ═══════════════════════════════

test('buildContext: shape — real/shown among the six, look, 2–3 cards with advice, pressure, receivers, hash, sign, revealAt', () => {
  const ctx = Play.buildContext(sit(), RTG.RNG.create(3));
  assert.ok(Dp.coverages[ctx.real] && Dp.coverages[ctx.shown]);
  assert.equal(ctx.disguised, ctx.real !== ctx.shown);
  assert.deepEqual(J(Object.keys(ctx.look).sort()), ['box', 'name', 'press', 'safeties', 'showBlitz', 'tell', 'text']);
  assert.ok(ctx.options.length >= 2 && ctx.options.length <= 3);
  for (const o of ctx.options) {
    assert.ok(['GOOD', 'OK', 'BAD'].includes(o.advice), o.id + ' advice');
    assert.equal(o.routes.length, o.run ? 0 : 5);
    assert.ok(Array.isArray(o.tags) && typeof o.line === 'string');
  }
  assert.ok(ctx.pressure.sackAt >= T.pressure.min && ctx.pressure.sackAt <= T.pressure.max);
  assert.equal(typeof ctx.pressure.hot, 'boolean');
  assert.deepEqual(J(ctx.receivers.map((r) => r.slot)), ['WR1', 'WR2', 'SLOT', 'TE', 'RB']);
  for (const r of ctx.receivers) assert.ok(r.name && r.skill >= 0 && r.speed >= 0 && (r.side === 1 || r.side === -1));
  assert.ok([-1, 0, 1].includes(ctx.hash));
  assert.ok(ctx.sign === 1 || ctx.sign === -1);
  near(ctx.revealAt, T.read.revealBase - 55 / 99 * T.read.revealIq, 0.002, 'revealAt at IQ 55');
  assert.equal(ctx.situation.down, 3); assert.equal(ctx.situation.toGo, 6); assert.equal(ctx.situation.yl, 40);
  assert.equal(ctx.qb.attrs.ACC, 55); assert.equal(ctx.team.ol, T.demo.teams.AVERAGE.ol); assert.equal(ctx.opp.db, T.demo.teams.AVERAGE.db);
  assert.equal(ctx.adviceFrom, 'SHOWN');
  assert.equal(Play.buildContext(withAttrs({ IQ: 90 }), RTG.RNG.create(3)).adviceFrom, 'REAL');
});

test('buildContext: the disguise rate falls with IQ (disguise × (1 − IQ/99 × iqSees))', () => {
  const N = 1500;
  const rate = (iq) => {
    let n = 0;
    for (let i = 0; i < N; i++) if (Play.buildContext(withAttrs({ IQ: iq }), RTG.RNG.create(100 + i)).disguised) n++;
    return n / N;
  };
  const lo = rate(10), mid = rate(55), hi = rate(95);
  const expect = (iq) => T.read.disguise * (1 - iq / 99 * T.read.iqSees);
  near(lo, expect(10), 0.04, 'IQ 10'); near(mid, expect(55), 0.04, 'IQ 55'); near(hi, expect(95), 0.03, 'IQ 95');
  assert.ok(lo > mid && mid > hi, 'falls with IQ: ' + [lo, mid, hi]);
});

test('buildContext: the advice matches the SHOWN look below iqExact and the REAL coverage at or above it', () => {
  let disguisedSeen = 0;
  for (let i = 0; i < 400; i++) {
    const low = Play.buildContext(withAttrs({ IQ: T.read.iqExact - 1 }), RTG.RNG.create(300 + i));
    for (const o of low.options.filter((x) => !x.run)) assert.equal(o.advice, playOf(o.id).vs[low.shown], 'low IQ ' + o.id);
    const high = Play.buildContext(withAttrs({ IQ: T.read.iqExact }), RTG.RNG.create(300 + i));
    for (const o of high.options.filter((x) => !x.run)) assert.equal(o.advice, playOf(o.id).vs[high.real], 'high IQ ' + o.id);
    if (low.disguised) disguisedSeen++;
  }
  assert.ok(disguisedSeen > 20, 'the low-IQ sample includes disguises (' + disguisedSeen + ')');
  const ctx = Play.buildContext(sit({ down: 4, toGo: 1 }), RTG.RNG.create(1));
  assert.equal(ctx.options.find((o) => o.id === 'SNEAK').advice, 'GOOD', 'SNEAK on 4th and 1 is GOOD');
});

test('buildContext: at least one GOOD-vs-real card is offered about goodOffered of the time', () => {
  const N = 2000;
  let good = 0;
  for (let i = 0; i < N; i++) {
    const ctx = Play.buildContext(sit(), RTG.RNG.create(50000 + i));
    if (ctx.options.some((o) => !o.run && playOf(o.id).vs[ctx.real] === 'GOOD')) good++;
  }
  near(good / N, T.read.goodOffered, 0.03, 'GOOD offered');
});

test('buildContext: SNEAK is offered only at toGo ≤ 2, DRAW at 3, neither beyond; two pass cards stay next to a run card', () => {
  const ids = (toGo, seed) => Play.buildContext(sit({ toGo, down: 3 }), RTG.RNG.create(seed)).options.map((o) => o.id);
  for (let s = 0; s < 30; s++) {
    assert.ok(ids(1, s).includes('SNEAK') && ids(2, s).includes('SNEAK'), 'SNEAK at 1–2');
    assert.ok(!ids(2, s).includes('DRAW'), 'no DRAW next to SNEAK');
    assert.ok(ids(3, s).includes('DRAW') && !ids(3, s).includes('SNEAK'), 'DRAW at 3');
    assert.ok(!ids(4, s).includes('DRAW') && !ids(4, s).includes('SNEAK'), 'no run card at 4');
    const short = Play.buildContext(sit({ toGo: 1 }), RTG.RNG.create(s));
    assert.equal(short.options.filter((o) => !o.run).length, T.read.runCardsMin);
    assert.equal(short.options.length, T.read.runCardsMin + 1);
  }
});

test('buildContext: the coverage follows the situation — BLITZ more on 3rd and long, COVER4 less in the red zone, PREVENT late with a lead; opp.tendency forces it', () => {
  const N = 1500;
  const share = (extra, id) => {
    let n = 0;
    for (let i = 0; i < N; i++) if (Play.buildContext(sit(extra), RTG.RNG.create(700 + i)).real === id) n++;
    return n / N;
  };
  assert.ok(share({ toGo: 11 }, 'BLITZ') > share({ toGo: 5 }, 'BLITZ') * 1.4, 'BLITZ on 3rd and long');
  assert.ok(share({ yl: 88 }, 'COVER4') < share({ yl: 40 }, 'COVER4') * 0.6, 'COVER4 in the red zone');
  assert.ok(share({ quarter: 4, clock: 50, score: { us: 20, them: 24 } }, 'PREVENT') > share({}, 'PREVENT') * 3, 'PREVENT late with a lead');
  assert.equal(share({ opp: { dl: 55, db: 55, tendency: { COVER3: 1, COVER2: 0, COVER4: 0, MAN: 0, BLITZ: 0, PREVENT: 0 } } }, 'COVER3'), 1, 'tendency');
});

test('buildContext: sackAt shrinks with a worse line and a blitz and grows with POI; clutch shortens it for a nervous QB', () => {
  const A = T.demo.teams;
  const mean = (extra) => {
    let s = 0, n = 300;
    for (let i = 0; i < n; i++) s += Play.buildContext(sit(extra), RTG.RNG.create(900 + i)).pressure.sackAt;
    return s / n;
  };
  const bad = mean({ team: A.BAD, opp: A.BAD }), avg = mean({}), great = mean({ team: A.GREAT, opp: A.GREAT });
  assert.ok(bad < avg - 0.6 && avg < great, 'line: ' + [bad, avg, great]);
  const blitz = mean({ opp: { dl: 55, db: 55, tendency: { BLITZ: 1, COVER2: 0, COVER3: 0, COVER4: 0, MAN: 0, PREVENT: 0 } } });
  const c3 = mean({ opp: { dl: 55, db: 55, tendency: { COVER3: 1, COVER2: 0, BLITZ: 0, COVER4: 0, MAN: 0, PREVENT: 0 } } });
  assert.ok(blitz < c3 - 0.3, 'blitz: ' + blitz + ' vs ' + c3);
  assert.ok(mean({ qb: { attrs: Object.assign({}, QB55.attrs, { POI: 95 }) } }) > mean({ qb: { attrs: Object.assign({}, QB55.attrs, { POI: 10 }) } }) + 0.2, 'POI');
  // deterministic pocket time
  assert.ok(Play.pocketTime(30, 78, 'COVER3', QB55.attrs, false) < Play.pocketTime(58, 55, 'COVER3', QB55.attrs, false));
  assert.ok(Play.pocketTime(58, 55, 'BLITZ', QB55.attrs, false) < Play.pocketTime(58, 55, 'COVER3', QB55.attrs, false));
  assert.ok(Play.pocketTime(58, 55, 'PREVENT', QB55.attrs, false) > Play.pocketTime(58, 55, 'COVER3', QB55.attrs, false));
  assert.ok(Play.pocketTime(58, 55, 'COVER3', { POI: 90 }, false) > Play.pocketTime(58, 55, 'COVER3', { POI: 20 }, false));
  assert.ok(Play.pocketTime(58, 55, 'COVER3', { POI: 20 }, true) < Play.pocketTime(58, 55, 'COVER3', { POI: 20 }, false), 'clutch, low POI');
  near(Play.pocketTime(58, 55, 'COVER3', { POI: 99 }, true), Play.pocketTime(58, 55, 'COVER3', { POI: 99 }, false), 1e-9, 'clutch costs a 99-POI QB nothing');
  const clutch = Play.buildContext(sit({ quarter: 4, clock: 40, score: { us: 20, them: 23 } }), RTG.RNG.create(1));
  assert.equal(clutch.clutch, true); assert.equal(clutch.pressure.clutch, true);
  assert.equal(Play.buildContext(sit(), RTG.RNG.create(1)).clutch, false);
});

test('buildContext: tolerant inputs — no qb / team / opp uses the demo defaults; a numeric team.wr becomes a roster; the sign mirrors the alignment', () => {
  const ctx = Play.buildContext({ down: 2, toGo: 8, yl: 30 }, RTG.RNG.create(5));
  assert.equal(ctx.qb.archetype, T.demo.defaultArchetype);
  assert.equal(ctx.team.ol, T.demo.teams[T.demo.defaultTeam].ol);
  assert.equal(ctx.receivers.length, 5);
  const num = Play.buildContext({ team: { ol: 70, wr: 80 }, opp: { dl: 40 } }, RTG.RNG.create(5));
  assert.equal(num.team.wr[0].skill, 80 + T.demo.defaultRoster[0].skillAdd);
  assert.equal(num.opp.db, T.demo.teams[T.demo.defaultTeam].db, 'missing db falls back');
  const f = Dp.formations.SHOTGUN;
  for (const r of ctx.receivers) assert.equal(r.x0, f[r.slot] * ctx.sign || 0, r.slot + ' aligned by sign');
  assert.throws(() => Play.buildContext(sit(), null), /rng/);
});

// ═══════════════════════════════ THE SNAP ═══════════════════════════════

test('snap: shape — five receivers with paths, 41 openness samples in 0..1, windows inside [0, 4], release windows, sackAt, rushers, scramble, checkdown', () => {
  const { sim } = snapFor(21, null);
  assert.equal(sim.run, false);
  assert.equal(sim.receivers.length, 5);
  for (const r of sim.receivers) {
    assert.equal(r.open.length, Math.round(T.open.maxT / T.open.sampleDt) + 1);
    for (const v of r.open) assert.ok(v >= 0 && v <= 1);
    assert.ok(r.window.from >= 0 && r.window.to <= 4 && r.window.from <= r.window.peakAt && r.window.peakAt <= r.window.to, r.slot + ' window');
    assert.ok(r.release.from >= 0 && r.release.from <= r.window.from + 1e-9, r.slot + ' release before arrival');
    assert.ok(r.release.peakAt <= r.window.peakAt + 1e-9);
    near(r.peak, Math.max.apply(null, r.open), 1e-9, r.slot + ' peak is the max sample');
    assert.ok(Dp.routes[r.route] && r.family === Dp.routes[r.route].family);
    assert.deepEqual(J(r.path[0]), { t: 0, x: r.x0, y: 0 }, r.slot + ' path starts at the alignment');
    for (const p of r.path) assert.ok(p.y <= r.capY);
  }
  assert.ok(sim.sackAt >= T.pressure.min && sim.sackAt <= T.pressure.max);
  assert.ok(sim.rushers.length >= 2 && sim.rushers.length <= 3);
  assert.equal(sim.rushers[0].arriveAt, sim.sackAt, 'the first rusher IS the sack');
  for (let i = 1; i < sim.rushers.length; i++) assert.ok(sim.rushers[i].arriveAt > sim.rushers[i - 1].arriveAt);
  assert.ok(sim.scrambleYards >= T.throw.scramble.min && sim.scrambleYards <= T.throw.scramble.max);
  assert.equal(sim.checkdown, 'RB', 'the back is the checkdown when he runs a short route');
  assert.ok(sim.receivers.find((r) => r.slot === 'RB').peak >= T.open.checkdownFloor - 1e-9, 'the checkdown floor');
  assert.equal(typeof sim.open, 'function'); assert.equal(typeof sim.path, 'function'); assert.equal(typeof sim.need, 'function');
  const rb = sim.receivers.find((r) => r.slot === 'RB');
  near(sim.open('RB', 99), T.open.floor + (rb.peak - T.open.floor) * T.open.lateFrac, 0.002, 'past 4 s the envelope continues analytically to the late floor');
  near(sim.open('RB', 4), rb.open[40], 1e-9, 'at 4 s the last sample');
  assert.ok(sim.open('RB', 99) < rb.peak, 'a late ball finds the window closed');
  assert.equal(sim.revealAt, sim.ctx.revealAt);
  assert.throws(() => Play.snap(sim.ctx, 'NOT_A_PLAY', RTG.RNG.create(1)), /unknown play/);
});

test('snap: a GOOD play vs the real coverage opens wider windows than a BAD one', () => {
  let good = 0, bad = 0, n = 0;
  for (let i = 0; i < 400; i++) {
    const g = snapFor(2000 + i, 'GOOD'), b = snapFor(2000 + i, 'BAD');
    if (!g || !b) continue;
    good += best(g.sim).peak; bad += best(b.sim).peak; n++;
  }
  assert.ok(n > 300);
  assert.ok(good / n > bad / n + 0.3, 'best peak GOOD ' + (good / n).toFixed(2) + ' vs BAD ' + (bad / n).toFixed(2));
  assert.ok(good / n >= 0.7 && bad / n <= 0.5);
});

test('snap: the reveal comes earlier with IQ; under a real BLITZ the quickest route is the hot read and opens earlier', () => {
  const lowIq = Play.buildContext(withAttrs({ IQ: 20 }), RTG.RNG.create(4)), highIq = Play.buildContext(withAttrs({ IQ: 90 }), RTG.RNG.create(4));
  assert.ok(highIq.revealAt < lowIq.revealAt - 0.5);
  const blitz = { dl: 55, db: 55, tendency: { BLITZ: 1, COVER2: 0, COVER3: 0, COVER4: 0, MAN: 0, PREVENT: 0 } };
  let hotSeen = 0;
  for (let i = 0; i < 40; i++) {
    const rng = RTG.RNG.create(400 + i);
    const ctx = Play.buildContext(sit({ opp: blitz }), rng);
    assert.equal(ctx.real, 'BLITZ');
    assert.equal(ctx.pressure.hot, true);
    const sim = Play.snap(ctx, 'FOUR_VERTS', rng);
    assert.equal(sim.hot, 'RB', 'the checkdown is the quickest route on FOUR VERTS');
    assert.equal(sim.rushers.length, T.pressure.rushers.blitz);
    const hot = sim.receivers.find((r) => r.hot);
    assert.ok(hot && hot.slot === 'RB');
    hotSeen++;
  }
  assert.equal(hotSeen, 40);
});

test('snap: scramble yards scale with MOB and the look; SNEAK on 4th and 1 succeeds about 70 %; DRAW is a run result', () => {
  const meanScramble = (mob) => {
    let s = 0;
    for (let i = 0; i < 300; i++) { const r = snapFor(600 + i, null, withAttrs({ MOB: mob })); s += r.sim.scrambleYards; }
    return s / 300;
  };
  const lo = meanScramble(20), hi = meanScramble(95);
  assert.ok(hi > lo + 4, 'MOB 95 ' + hi.toFixed(1) + ' vs MOB 20 ' + lo.toFixed(1));
  let ok = 0, n = 1500;
  for (let i = 0; i < n; i++) {
    const rng = RTG.RNG.create(800 + i);
    const res = Play.snap(Play.buildContext(sit({ down: 4, toGo: 1, yl: 50 }), rng), 'SNEAK', rng);
    assert.equal(res.run, true); assert.equal(res.outcome, 'RUN'); assert.equal(res.turnover, false);
    assert.ok(typeof res.text === 'string' && res.banner && res.feedback.coachSaw);
    if (res.firstDown) { ok++; assert.ok(res.yards >= 1); } else assert.ok(res.yards <= 0);
  }
  near(ok / n, 0.70, 0.05, 'SNEAK 4th and 1');
  const rng = RTG.RNG.create(1);
  const draw = Play.snap(Play.buildContext(sit({ toGo: 3 }), rng), 'DRAW', rng);
  assert.equal(draw.run, true); assert.equal(draw.playId, 'DRAW');
  assert.ok(draw.yards >= T.run.draw.min && draw.yards <= T.run.draw.max);
  assert.equal(Play.throw(draw, {}, rng), draw, 'throw returns a run sim unchanged');
});

// ═══════════════════════════════ THE THROW ═══════════════════════════════

test('throw: t ≥ sackAt is a SACK whatever the input (kinds THROW / THROWAWAY / SACK; a 0-MOB SCRAMBLE too), with negative yards and TOO LATE', () => {
  for (let i = 0; i < 60; i++) {
    const { rng, sim } = snapFor(3000 + i, 'GOOD', withAttrs({ MOB: 0 }));
    const rec = best(sim);
    for (const kind of ['THROW', 'THROWAWAY', 'SCRAMBLE']) {
      const res = Play.throw(sim, Object.assign(perfect(sim, rec, sim.sackAt), { kind }), rng);
      assert.equal(res.outcome, 'SACK', kind + ' at the clock');
      assert.ok(res.yards <= T.throw.sackYards.max && res.yards >= T.throw.sackYards.min, 'sack yards ' + res.yards);
      assert.equal(res.turnover, false); assert.equal(res.td, false); assert.equal(res.firstDown, false);
      assert.equal(res.feedback.timing, 'TOO LATE');
      assert.ok(/^SACKED -\d+$/.test(res.text), res.text);
    }
    assert.equal(Play.throw(sim, { kind: 'SACK', t: 0.2 }, rng).outcome, 'SACK', 'kind SACK before the clock');
    assert.equal(Play.throw(sim, perfect(sim, rec, sim.sackAt - 0.01), rng).outcome === 'SACK', false, 'a hair before the clock is a throw');
  }
});

test('throw: a throwaway is never a turnover and gains nothing; a stray release (no target / no power) is a throwaway too', () => {
  for (let i = 0; i < 200; i++) {
    const { rng, sim } = snapFor(4000 + i, null);
    const t = 0.3 + (i % 20) * 0.1;
    if (t >= sim.sackAt) continue;
    const a = Play.throw(sim, { kind: 'THROWAWAY', t, target: best(sim).slot, quality: 0, lead: 1, loft: 1 }, rng);
    assert.equal(a.outcome, 'THROWAWAY'); assert.equal(a.turnover, false); assert.equal(a.yards, 0); assert.equal(a.text, 'THROWN AWAY');
    const b = Play.throw(sim, { kind: 'THROW', t }, rng);
    assert.equal(b.outcome, 'THROWAWAY', 'no target');
    const c = Play.throw(sim, { kind: 'THROW', t, target: best(sim).slot, power: 0.01 }, rng);
    assert.equal(c.outcome, 'THROWAWAY', 'no power');
  }
});

test('throw: an on-time green throw into an open window (≥ intWindow) is never intercepted — pInt is exactly 0', () => {
  let n = 0, catches = 0;
  for (let i = 0; i < 1500; i++) {
    const s = snapFor(5000 + i, 'GOOD');
    if (!s) continue;
    const rec = best(s.sim);
    if (rec.peak < T.throw.intWindow || rec.release.peakAt >= s.sim.sackAt) continue;
    const res = Play.throw(s.sim, perfect(s.sim, rec, rec.release.peakAt), s.rng);
    n++;
    assert.equal(res.green, true, 'the band claim is verified');
    assert.ok(res.window >= T.throw.intWindow - 1e-9, 'arrives in the open window (' + res.window + ')');
    assert.equal(res.pInt, 0);
    assert.notEqual(res.outcome, 'INT');
    assert.equal(res.feedback.timing, 'ON TIME');
    if (res.outcome === 'CATCH') catches++;
  }
  assert.ok(n > 800, 'sample ' + n);
  assert.ok(catches / n > 0.5, 'and mostly caught: ' + (catches / n).toFixed(2));
  // the gate in general: whenever the window is open the interception probability is 0
  for (let i = 0; i < 300; i++) {
    const s = snapFor(6000 + i, null), rec = best(s.sim), t = Math.min(rec.release.peakAt, s.sim.sackAt - 0.05);
    const res = Play.throw(s.sim, perfect(s.sim, rec, t, { quality: 0.4, green: false }), s.rng);
    if (res.outcome !== 'SACK' && res.window >= T.throw.intWindow) assert.equal(res.pInt, 0);
  }
});

test('throw: a late throw into a closed window is picked far more often (about 25–40 % of throws) than an on-time one', () => {
  let onInt = 0, onN = 0, lateInt = 0, lateN = 0;
  for (let i = 0; i < 2500; i++) {
    const s = snapFor(7000 + i, 'GOOD');
    if (!s) continue;
    const rec = best(s.sim);
    const on = Play.throw(s.sim, perfect(s.sim, rec, rec.release.peakAt), s.rng);
    if (on.outcome !== 'SACK') { onN++; if (on.outcome === 'INT') onInt++; }
    const late = Play.throw(s.sim, perfect(s.sim, rec, rec.release.to + 0.6), s.rng);
    if (late.outcome !== 'SACK') { lateN++; if (late.outcome === 'INT') lateInt++; assert.ok(late.window < 0.5, 'the window has closed'); }
  }
  const onRate = onInt / onN, lateRate = lateInt / lateN;
  assert.ok(lateN > 1500, 'late sample ' + lateN);
  assert.ok(lateRate >= 0.25 && lateRate <= 0.40, 'late INT ' + lateRate.toFixed(3));
  assert.ok(lateRate > onRate * 8, 'far more often than on time (' + onRate.toFixed(3) + ')');
});

test('throw: completion rises with ACC, with quality and with the window (GOOD > OK > BAD); the on-time targets after the balance pass hold (ACC 55 ≈ 84 %, SURGEON ≈ 86 %)', () => {
  const meanP = (rating, attrs, quality) => {
    let s = 0, n = 0, caught = 0;
    for (let i = 0; i < 1200; i++) {
      const x = snapFor(8000 + i, rating, withAttrs(attrs));
      if (!x) continue;
      const rec = best(x.sim), t = rec.release.peakAt;
      if (t >= x.sim.sackAt) continue;
      const res = Play.throw(x.sim, perfect(x.sim, rec, t, { quality, green: quality >= 1 }), x.rng);
      s += res.pComplete; n++; if (res.outcome === 'CATCH') caught++;
    }
    return { p: s / n, cmp: caught / n, n };
  };
  const acc40 = meanP('GOOD', { ACC: 40 }, 1), acc55 = meanP('GOOD', { ACC: 55 }, 1), acc72 = meanP('GOOD', { ACC: 72 }, 1), acc90 = meanP('GOOD', { ACC: 90 }, 1);
  assert.ok(acc40.p < acc55.p && acc55.p < acc72.p && acc72.p < acc90.p, 'ACC: ' + [acc40.p, acc55.p, acc72.p, acc90.p].map((v) => v.toFixed(3)));
  const q3 = meanP('GOOD', {}, 0.3), q6 = meanP('GOOD', {}, 0.6);
  assert.ok(q3.p < q6.p && q6.p < acc55.p, 'quality: ' + [q3.p, q6.p, acc55.p].map((v) => v.toFixed(3)));
  const ok = meanP('OK', {}, 1), bad = meanP('BAD', {}, 1);
  assert.ok(bad.p < ok.p && ok.p < acc55.p, 'window: ' + [bad.p, ok.p, acc55.p].map((v) => v.toFixed(3)));
  near(acc55.cmp, 0.84, 0.05, 'on time, GOOD play, ACC 55, an expert release (target 80–88 %)');
  near(acc72.cmp, 0.86, 0.05, 'SURGEON (target 82–90 %)');
});

test('throw: pressure and weather cost accuracy; power outside the band costs the fit; a throw beyond the arm dies', () => {
  const s = snapFor(31, 'GOOD'), rec = best(s.sim), route = Dp.routes[rec.route];
  const early = Play.throw(s.sim, perfect(s.sim, rec, 0.6), RTG.RNG.create(1));
  const underRush = Play.throw(s.sim, perfect(s.sim, rec, s.sim.sackAt - 0.05), RTG.RNG.create(1));
  assert.ok(underRush.accuracy < early.accuracy - 0.03, 'pressure: ' + underRush.accuracy + ' vs ' + early.accuracy);
  const wet = Object.assign({}, s.sim, { ctx: Object.assign({}, s.sim.ctx, { weather: { weather: 'snow', wind: { speed: 18, dir: 90 }, tempF: 20 } }) });
  const snowy = Play.throw(wet, perfect(s.sim, rec, 0.6), RTG.RNG.create(1));
  assert.ok(snowy.accuracy < early.accuracy - 0.08, 'weather: ' + snowy.accuracy + ' vs ' + early.accuracy);
  const dome = Object.assign({}, s.sim, { ctx: Object.assign({}, s.sim.ctx, { weather: { weather: 'dome', wind: { speed: 30, dir: 90 }, tempF: 0 } }) });
  near(Play.throw(dome, perfect(s.sim, rec, 0.6), RTG.RNG.create(1)).accuracy, early.accuracy, 1e-9, 'a dome costs nothing');
  const hot = Play.throw(s.sim, perfect(s.sim, rec, 0.6, { power: 1.15, green: false }), RTG.RNG.create(1));
  assert.ok(hot.fit < 1 && hot.accuracy < early.accuracy, 'a hot ball');
  const offLead = Play.throw(s.sim, perfect(s.sim, rec, 0.6, { lead: clamp(route.ideal.lead + 0.6, -1, 1), green: false }), RTG.RNG.create(1));
  assert.ok(offLead.fit < early.fit, 'lead off the ideal');
  assert.ok(['OVERTHROWN', 'LED', 'UNDERTHROWN', 'BEHIND'].includes(offLead.feedback.touch), offLead.feedback.touch);
  const floated = Play.throw(s.sim, perfect(s.sim, rec, 0.6, { loft: 1, green: false }), RTG.RNG.create(1));
  assert.ok(route.ideal.loft > 0.6 || floated.feedback.touch === 'FLOATED', floated.feedback.touch);
  // the deep range: a GO route thrown very late in its path is beyond a weak arm
  const go = snapFor(32, null, withAttrs({ ARM: 10 }));
  const goSim = Play.snap(go.ctx, 'FOUR_VERTS', RTG.RNG.create(2));
  const deep = Play.throw(goSim, { target: 'WR1', t: Math.min(2.4, goSim.sackAt - 0.05), lead: 0.7, loft: 0.7, power: 1.15, quality: 1 }, RTG.RNG.create(3));
  assert.ok(deep.outcome === 'SACK' || deep.dist > Play.maxDist({ ARM: 10 }) - 1e-9 || deep.accuracy < 0.7, 'beyond the range ' + deep.dist);
});

test('throw: result shape and bookkeeping — yards = air + yac on a catch, clamped at the goal line, td / firstDown / banner precedence, feedback labels', () => {
  const labels = { timing: ['EARLY', 'ON TIME', 'LATE', 'TOO LATE'], touch: ['BULLET', 'GOOD', 'FLOATED', 'OVERTHROWN', 'UNDERTHROWN', 'BEHIND', 'LED'] };
  let td = 0, fd = 0, catches = 0, drops = 0;
  for (let i = 0; i < 600; i++) {
    const s = snapFor(9000 + i, null, sit({ yl: 85, toGo: 6, down: 2 })), rec = best(s.sim);
    const t = Math.min(rec.release.peakAt, s.sim.sackAt - 0.05);
    const res = Play.throw(s.sim, perfect(s.sim, rec, t), s.rng);
    assert.ok(Play.OUTCOMES.includes(res.outcome));
    assert.ok(labels.timing.includes(res.feedback.timing) && labels.touch.includes(res.feedback.touch) && res.feedback.coachSaw.startsWith('Coach saw'));
    assert.ok(typeof res.landing.x === 'number' && typeof res.landing.y === 'number' && typeof res.flight === 'number');
    assert.equal(res.target, rec.slot); assert.equal(res.playId, s.sim.playId);
    assert.ok(res.yards + 85 <= 100, 'never past the goal line');
    if (res.outcome === 'CATCH') {
      catches++;
      assert.equal(res.yards, res.airYards + res.yac);
      assert.ok(res.yac >= 0);
      assert.equal(res.td, res.yards + 85 >= 100);
      assert.equal(res.firstDown, res.td || res.yards >= 6);
      assert.equal(res.banner, res.td ? 'TOUCHDOWN!' : (res.firstDown ? 'FIRST DOWN' : res.text));
      assert.ok(/^CATCH [+-]?\d+$/.test(res.text), res.text);
      if (res.td) td++; if (res.firstDown) fd++;
    } else {
      assert.equal(res.yards, 0); assert.equal(res.td, false); assert.equal(res.firstDown, false);
      assert.equal(res.turnover, res.outcome === 'INT');
      if (res.outcome === 'DROP') { drops++; assert.equal(res.text, 'DROPPED'); }
    }
  }
  assert.ok(catches > 200 && td > 10 && fd > td, 'catches ' + catches + ' td ' + td + ' fd ' + fd);
  assert.ok(drops > 0, 'drops happen');
});

test('throw: SCRAMBLE yields about sim.scrambleYards once the pocket is used (a tuck at the snap is worth useMin of it), fumbles more at low MOB and never under the floor, and escapes a sack more often with MOB', () => {
  const SC = T.throw.scramble;
  const run = (mob, n, pastClock, t) => {
    const c = { n: 0, y: 0, fumble: 0, sack: 0 };
    for (let i = 0; i < n; i++) {
      const s = snapFor(10000 + i, null, withAttrs({ MOB: mob })), sim = s.sim;
      const res = Play.throw(sim, { kind: 'SCRAMBLE', t: pastClock ? sim.sackAt + 0.1 : (t === undefined ? SC.useT : t) }, s.rng);
      c.n++;
      if (res.outcome === 'SACK') { c.sack++; continue; }
      assert.equal(res.outcome, 'SCRAMBLE');
      c.y += res.yards - sim.scrambleYards;
      if (res.fumble) { c.fumble++; assert.equal(res.turnover, true); assert.equal(res.text, 'FUMBLE'); }
      else assert.ok(/^SCRAMBLE [+-]?\d+$/.test(res.text) || res.banner === 'FIRST DOWN' || res.banner === 'TOUCHDOWN!', res.text);
    }
    return c;
  };
  const low = run(20, 600, false), high = run(90, 600, false);
  near(low.y / low.n, 0, 0.6, 'mean scramble tracks sim.scrambleYards at t = useT');
  assert.ok(low.fumble > 5, 'fumbles at MOB 20: ' + low.fumble);
  near(high.fumble / high.n, SC.fumbleMin, 0.015, 'the fumble floor at MOB 90 (' + high.fumble + ')');
  assert.ok(low.fumble > high.fumble, 'more fumbles at low MOB: ' + low.fumble + ' vs ' + high.fumble);
  // a tuck at the snap is worth useMin of the yards: the tuck-and-run is a bail-out, not a play
  const early = run(72, 600, false, 0.35), late = run(72, 600, false, SC.useT);
  const meanY = (c, fallback) => c.y / c.n;   // mean of (yards − sim.scrambleYards)
  assert.ok(meanY(early) < meanY(late) - 1.5, 'the snap tuck gains less: ' + meanY(early).toFixed(2) + ' vs ' + meanY(late).toFixed(2));
  const lowLate = run(20, 400, true), highLate = run(95, 400, true);
  assert.ok(lowLate.sack / lowLate.n > highLate.sack / highLate.n + 0.3, 'escape by MOB: ' + lowLate.sack + ' vs ' + highLate.sack);
});

test('green band: need grows with distance and shrinks with ARM, the band widens with ACC and always fits under powerMax; inGreen verifies a claim', () => {
  const s = snapFor(41, null), sim = s.sim;
  const short = sim.receivers.find((r) => r.family === 'SHORT'), deep = sim.receivers.find((r) => r.family === 'DEEP') || sim.receivers.find((r) => r.family === 'MID');
  const nShort = Play.need(sim, short.slot, 1.0), nDeep = Play.need(sim, deep.slot, 1.0);
  assert.ok(nDeep.dist > nShort.dist && nDeep.need > nShort.need, 'need by distance');
  assert.ok(nShort.top <= T.throw.powerMax + 1e-9 && nDeep.top <= T.throw.powerMax + 1e-9);
  near(nShort.band, Play.greenBand(55), 1e-3, 'the band (3 decimals)');
  near(Play.greenBand(99), T.throw.greenBand.base + T.throw.greenBand.perAcc, 1e-9);
  assert.ok(Play.greenBand(99) > Play.greenBand(30));
  assert.ok(Play.needFor(30, { ARM: 90 }) < Play.needFor(30, { ARM: 30 }), 'a big arm needs less');
  assert.equal(Play.inGreen(nShort.need + 0.01, nShort.need, nShort.band), true);
  assert.equal(Play.inGreen(nShort.need - 0.01, nShort.need, nShort.band), false);
  assert.equal(Play.inGreen(nShort.need + nShort.band + 0.01, nShort.need, nShort.band), false);
  assert.equal(Play.need(sim, 'NOPE', 1), null);
  const claimed = Play.throw(sim, perfect(sim, short, 0.8, { quality: 0.3, green: true, power: nShort.need + nShort.band / 2 }), RTG.RNG.create(1));
  assert.equal(claimed.green, true); assert.equal(claimed.quality, T.throw.greenQuality, 'a verified claim floors quality');
  const bogus = Play.throw(sim, perfect(sim, short, 0.8, { quality: 0.3, green: true, power: 0.2 }), RTG.RNG.create(1));
  assert.equal(bogus.green, false); assert.equal(bogus.quality, 0.3, 'an unverifiable claim is ignored');
});

test('geometry: pathAt interpolates and extrapolates, openAt clamps, flightTime scales with arm / power / loft, arrival converges', () => {
  const rec = { path: [{ t: 0, x: 0, y: 0 }, { t: 1, x: 2, y: 10 }, { t: 2, x: 2, y: 20 }], capY: 25 };
  assert.deepEqual(J(Play.pathAt(rec, -1)), { x: 0, y: 0 });
  assert.deepEqual(J(Play.pathAt(rec, 0.5)), { x: 1, y: 5 });
  assert.deepEqual(J(Play.pathAt(rec, 1.5)), { x: 2, y: 15 });
  near(Play.pathAt(rec, 2.3).y, 23, 1e-9); assert.equal(Play.pathAt(rec, 2.3).x, 2);
  assert.deepEqual(J(Play.pathAt(rec, 5)), { x: 2, y: 25 }, 'capped at the end zone');
  const curve = { open: [0, 0.5, 1].concat(new Array(38).fill(1)) };
  near(Play.openAt(curve, 0.05), 0.25, 1e-9); assert.equal(Play.openAt(curve, -5), 0); assert.equal(Play.openAt(curve, 9), 1);
  const f = (a, p, l) => Play.flightTime(30, { ARM: a }, p, l);
  assert.ok(f(90, 1, 0) < f(30, 1, 0) && f(50, 1.1, 0) < f(50, 0.5, 0) && f(50, 1, 1) > f(50, 1, 0));
  near(f(99, 1, 0), 30 / (T.throw.velocity * (T.throw.armBase + T.throw.armPer) * (T.throw.powerBase + T.throw.powerPer)), 1e-9);
  const a = Play.arrival(rec, { ARM: 55 }, 0.5, 1, 0.3);
  near(a.arrive, 0.5 + a.flight, 1e-9);
  near(a.dist, Math.hypot(a.pos.x, a.pos.y + T.route.qbDrop), 1e-6);
});

test('forcedResult builds consistent debug results without rng (CATCH / FIRST_DOWN / TD / INT / SACK / DROP / THROWAWAY / SCRAMBLE / FUMBLE)', () => {
  const s = snapFor(51, null), sim = s.sim, sitn = sim.ctx.situation;
  const r = counting(1);
  const want = { CATCH: ['CATCH', false, false], FIRST_DOWN: ['CATCH', true, false], TD: ['CATCH', true, true], INT: ['INT', false, false], SACK: ['SACK', false, false], DROP: ['DROP', false, false], THROWAWAY: ['THROWAWAY', false, false], SCRAMBLE: ['SCRAMBLE', null, false], FUMBLE: ['SCRAMBLE', false, false] };
  for (const kind of Object.keys(want)) {
    const res = Play.forcedResult(sim, kind);
    assert.equal(res.outcome, want[kind][0], kind);
    if (want[kind][1] !== null) assert.equal(res.firstDown, want[kind][1], kind + ' firstDown');
    assert.equal(res.td, want[kind][2], kind + ' td');
    assert.equal(res.forced, true);
    assert.ok(res.banner && res.feedback);
  }
  assert.equal(Play.forcedResult(sim, 'INT').turnover, true);
  assert.equal(Play.forcedResult(sim, 'FUMBLE').turnover, true);
  assert.equal(Play.forcedResult(sim, 'TD').yards, 100 - sitn.yl);
  assert.equal(r.draws, 0);
});

// ═══════════════════════════════ THE DRIVE SCRIPT ═══════════════════════════════

test('driveScript: the six kinds in order, short yardage offers SNEAK, the two-minute clock is under 1:00, the last play is winnable by a TD and not by a FG', () => {
  for (let seed = 0; seed < 50; seed++) {
    const script = Play.driveScript({ venue: 'NFL' }, RTG.RNG.create(seed));
    assert.deepEqual(J(script.map((s) => s.kind)), ['THIRD_MEDIUM', 'THIRD_LONG', 'RED_ZONE', 'SHORT_YARDAGE', 'TWO_MINUTE', 'LAST_PLAY']);
    for (let i = 0; i < script.length; i++) {
      const s = script[i];
      assert.equal(s.idx, i); assert.equal(s.venue, 'NFL');
      assert.ok(s.down >= 1 && s.down <= 4 && s.toGo >= 1 && s.yl >= 1 && s.yl <= 99 && s.quarter >= 1 && s.quarter <= 4);
      assert.ok(s.score.us >= 0 && s.score.them >= 0 && typeof s.stakes === 'string' && s.stakes.length > 8);
      assert.ok(s.yl + s.toGo <= 100);
    }
    assert.ok(script[0].down === 3 && script[0].toGo >= 4 && script[0].toGo <= 6);
    assert.ok(script[1].down === 3 && script[1].toGo >= 8);
    assert.ok(script[2].yl >= 80, 'red zone');
    assert.ok(script[3].toGo <= 2 && Play.buildContext(script[3], RTG.RNG.create(seed)).options.some((o) => o.id === 'SNEAK'), 'SNEAK offered');
    assert.ok(script[4].quarter === 4 && script[4].clock < 60 && script[4].twoMinute, 'two-minute drill');
    const last = script[5];
    assert.ok(last.lastPlay && last.quarter === 4 && last.clock <= 10);
    assert.ok(100 - last.yl >= 30 && 100 - last.yl <= 45, 'from the 30–45');
    const deficit = last.score.them - last.score.us;
    assert.ok(deficit > 3 && deficit < 6, 'a TD wins (' + deficit + '), a FG does not');
    assert.ok(script[4].score.them - script[4].score.us >= 1 && script[4].score.them - script[4].score.us <= 3, 'the drill is within a FG');
  }
  assert.deepEqual(J(Play.driveScript({}, RTG.RNG.create(3))), J(Play.driveScript({}, RTG.RNG.create(3))), 'deterministic');
  assert.equal(Play.driveScript({}, RTG.RNG.create(3))[0].venue, 'COLLEGE', 'default venue');
});

test('text helpers: downText / spotText', () => {
  assert.equal(Play.downText({ down: 3, toGo: 7, yl: 40 }), '3RD & 7');
  assert.equal(Play.downText({ down: 1, toGo: 10, yl: 20 }), '1ST & 10');
  assert.equal(Play.downText({ down: 4, toGo: 3, yl: 97 }), '4TH & GOAL');
  assert.equal(Play.spotText(34), 'OWN 34'); assert.equal(Play.spotText(50), 'MIDFIELD'); assert.equal(Play.spotText(82), 'OPP 18');
});

// ═══════════════════════════════ PASSER RATING ═══════════════════════════════

test('rating reproduces known passer ratings (NFL formula): perfect 158.3 · 20/30 190 2 1 → 92.4 · 20/30 250 2 1 → 100.7 · Brady 2007 → 117.2 · 0 att → 0', () => {
  assert.equal(Play.rating({ att: 40, cmp: 31, yds: 500, td: 5, int: 0 }), 158.3);
  assert.equal(Play.rating({ att: 30, cmp: 20, yds: 190, td: 2, int: 1 }), 92.4);
  assert.equal(Play.rating({ att: 30, cmp: 20, yds: 250, td: 2, int: 1 }), 100.7);
  assert.equal(Play.rating({ att: 578, cmp: 398, yds: 4806, td: 50, int: 8 }), 117.2);
  assert.equal(Play.rating({ att: 10, cmp: 0, yds: 0, td: 0, int: 5 }), 0, 'floor');
  assert.equal(Play.rating({ att: 0, cmp: 0, yds: 0, td: 0, int: 0 }), 0);
  assert.equal(Play.rating(null), 0);
  assert.equal(Play.rating({ att: 1, cmp: 1, yds: 99, td: 1, int: 0 }), 158.3, 'capped components');
});
