/**
 * RTG.Play — the QB moment engine (v2, "draw the pass"): draw counts, determinism, the read (coverage, disguise,
 * advice, cards, the pre-snap alignment), the sack clock, the snap (the field cast: receivers' paths, the eleven and
 * their roles, the rush, the separation pre-run, hot read, checkdown, runs), Play.live / Play.resolve at the API
 * level (engine/field.js has its own file: field.test.js), forcedResult, autoPlan, the drive script and the passer
 * rating.
 *   node qb/test/play.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RTG = require('./load')();
const Play = RTG.Play, Field = RTG.Field, Tuning = RTG.Tuning, Dp = RTG.Data.plays;
const T = Tuning.qb;

/** Realm-agnostic deep copy (engine objects live in a vm context; functions are dropped). */
const J = (o) => JSON.parse(JSON.stringify(o));
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ': expected ' + b + ' ±' + tol + ', got ' + a);
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

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
function playOf(id) { return Dp.plays.find((p) => p.id === id); }
function only(cov) { const t = {}; for (const c of Dp.order) t[c] = c === cov ? 1 : 0; return { dl: 55, db: 56, tendency: t }; }
/** ctx + sim for a seed on a play of a given rating vs the real coverage (or any pass play). */
function snapFor(seed, rating, situation) {
  const rng = RTG.RNG.create(seed);
  const ctx = Play.buildContext(situation || sit(), rng);
  const cands = Dp.plays.filter((p) => !p.run && (!rating || p.vs[ctx.real] === rating));
  if (!cands.length) return null;
  const sim = Play.snap(ctx, cands[seed % cands.length].id, rng);
  return { rng, ctx, sim };
}
/** Step a live to t (sim seconds) in frame-sized steps. */
function stepTo(live, t) { let n = 0; while (live.phase !== 'DONE' && live.t < t - 1e-9 && n++ < 2000) live.step(1 / 60); }
function finish(live) { let n = 0; while (live.phase !== 'DONE' && n++ < 2000) live.step(0.1); return live.result(); }

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

test('draw counts: buildContext / snap / live / resolve / driveScript each cost the parent exactly 1 draw (the fork); rating, autoPlan, forcedResult 0', () => {
  const r = counting(7);
  const ctx = Play.buildContext(sit(), r);
  assert.equal(r.draws, 1, 'buildContext');
  const sim = Play.snap(ctx, ctx.options.filter((o) => !o.run)[0].id, r);
  assert.equal(r.draws, 2, 'snap');
  const live = Play.live(sim, r);
  assert.equal(r.draws, 3, 'live');
  stepTo(live, 1.4);
  const aim = live.aim(sim.receivers[0].slot, 0.4);
  live.classify(aim.points, 0.4);
  live.throwAlong(aim.points, 0.4);
  finish(live);
  assert.equal(r.draws, 3, 'the live play draws only from its own child');
  Play.resolve(sim, live.plan(), r);
  assert.equal(r.draws, 4, 'resolve');
  Play.driveScript({}, r);
  assert.equal(r.draws, 5, 'driveScript');
  Play.rating({ att: 1, cmp: 1, yds: 10, td: 0, int: 0 });
  Play.autoPlan(sim);
  Play.forcedResult(sim, 'CATCH');
  assert.equal(r.draws, 5, 'rating / autoPlan / forcedResult draw nothing');
});

test('draw counts: the child draws are fixed — ctx 8 + 3·cards, pass snap 63 (10 route clocks · 44 defender skill+reaction · 2 sack jitter · 1 first rusher · 6 gaps), SNEAK 3, DRAW 4, drive 25', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const r = forkCounting(seed);
    const ctx = Play.buildContext(sit(), r);
    const nPass = ctx.options.filter((o) => !o.run).length;
    assert.equal(r.children[0].label, 'play:ctx');
    assert.equal(r.children[0].draws, 8 + 3 * nPass, 'ctx child, seed ' + seed);
    for (const o of ctx.options.filter((x) => !x.run)) {
      Play.snap(ctx, o.id, r);
      const c = r.children[r.children.length - 1];
      assert.equal(c.label, 'play:snap');
      assert.equal(c.draws, 63, 'snap child, seed ' + seed + ' ' + o.id);
    }
  }
  const blitz = forkCounting(3);
  const bctx = Play.buildContext(sit({ opp: only('BLITZ') }), blitz);
  Play.snap(bctx, 'FOUR_VERTS', blitz);
  assert.equal(blitz.children[1].draws, 63, 'a five-man rush draws the same');
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

test('draw counts: a run sim gets a finished Live (1 parent draw, 0 child) whose result is the sim; resolve returns the sim', () => {
  const r = forkCounting(4);
  const ctx = Play.buildContext(sit({ toGo: 1 }), r);
  const run = Play.snap(ctx, 'SNEAK', r);
  const before = r.draws;
  const live = Play.live(run, r);
  assert.equal(r.draws, before + 1);
  assert.equal(r.children[r.children.length - 1].label, 'play:live');
  assert.equal(r.children[r.children.length - 1].draws, 0);
  assert.equal(live.phase, 'DONE');
  assert.equal(live.result(), run);
  assert.equal(live.step(1), 'DONE');
  assert.equal(live.throwAlong([{ x: 0, y: 0 }, { x: 5, y: 5 }], 0.5).ok, false);
  assert.equal(live.setRun([{ x: 0, y: 0 }, { x: 5, y: 5 }]).ok, false);
  assert.equal(live.classify([{ x: 0, y: 0 }, { x: 5, y: 5 }], 0.5).kind, 'INVALID');
  assert.equal(Play.resolve(run, { runs: [], pass: null, away: null }, r), run);
  assert.equal(r.draws, before + 2);
});

test('determinism: the same seed gives the same context, sim and resolved result; a different seed differs', () => {
  const run = (seed) => {
    const r = RTG.RNG.create(seed);
    const ctx = Play.buildContext(sit(), r);
    const sim = Play.snap(ctx, ctx.options.filter((o) => !o.run)[0].id, r);
    const res = Play.resolve(sim, Play.autoPlan(sim), r);
    return { ctx: J(ctx), sim: J(sim), res: J(res), state: r.state() };
  };
  const a = run(2024), b = run(2024), c = run(2025);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.ctx, c.ctx);
  assert.ok(JSON.stringify(a.sim).length > 3000, 'the sim serialises as JSON');
  assert.equal(typeof a.res.outcome, 'string');
});

// ═══════════════════════════════ THE READ ═══════════════════════════════

test('buildContext: shape — real/shown among the six, look, 2–3 cards with advice, pressure, receivers, field, alignment, hash, sign, revealAt', () => {
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
  assert.equal(ctx.pressure.meterMul, undefined, 'the meter is gone');
  assert.deepEqual(J(ctx.receivers.map((r) => r.slot)), ['WR1', 'WR2', 'SLOT', 'TE', 'RB']);
  for (const r of ctx.receivers) assert.ok(r.name && r.skill >= 0 && r.speed >= 0 && (r.side === 1 || r.side === -1) && typeof r.y0 === 'number');
  assert.ok([-1, 0, 1].includes(ctx.hash));
  assert.ok(ctx.sign === 1 || ctx.sign === -1);
  near(ctx.revealAt, T.read.revealBase - 55 / 99 * T.read.revealIq, 0.002, 'revealAt at IQ 55');
  assert.deepEqual(J(Object.keys(ctx.field).sort()), ['centerX', 'endY', 'goalY', 'losY', 'sideL', 'sideR']);
  assert.equal(ctx.field.goalY, 60); assert.equal(ctx.field.endY, 70); assert.equal(ctx.field.losY, 0);
  near(ctx.field.sideR - ctx.field.sideL, 2 * T.field.halfWidth, 0.01, 'the field is 53⅓ wide');
  assert.equal(ctx.situation.down, 3); assert.equal(ctx.situation.toGo, 6); assert.equal(ctx.situation.yl, 40);
  assert.equal(ctx.qb.attrs.ACC, 55); assert.equal(ctx.team.ol, T.demo.teams.AVERAGE.ol); assert.equal(ctx.opp.db, T.demo.teams.AVERAGE.db);
  assert.equal(ctx.adviceFrom, 'SHOWN');
  assert.equal(Play.buildContext(withAttrs({ IQ: 90 }), RTG.RNG.create(3)).adviceFrom, 'REAL');
});

test('alignment: ctx.alignment is the SHOWN look — 11 defenders with ids and groups, the box count exact, safeties deep or rolled down, corners pressed or off, the blitz tell creeps; QB, 5 receivers, 5 linemen', () => {
  const A = T.field.align;
  const inBox = (d) => Math.abs(d.x) <= A.boxX && d.y <= A.boxY;
  let seen = {};
  for (let seed = 0; seed < 300; seed++) {
    const ctx = Play.buildContext(sit(), RTG.RNG.create(seed));
    const al = ctx.alignment;
    assert.deepEqual(J(al.defenders.map((d) => d.id)), J(Dp.defenders));
    for (const d of al.defenders) {
      assert.equal(d.pos, Dp.defenderPos[d.id]);
      assert.ok(d.x >= ctx.field.sideL && d.x <= ctx.field.sideR && d.y > 0, d.id + ' on the field, on their side');
    }
    const look = ctx.look;
    assert.equal(al.defenders.filter(inBox).length, look.box, ctx.shown + ': the box count');
    const S = al.defenders.filter((d) => d.pos === 'S');
    assert.equal(S.filter((d) => d.y >= A.safetyDeep - 0.01).length >= look.safeties, true, ctx.shown + ': safeties high');
    const cb = al.defenders.filter((d) => d.pos === 'CB');
    for (const c of cb) assert.equal(c.y <= A.cbPress + 0.01, look.press, ctx.shown + ': corners pressed = ' + look.press);
    if (look.showBlitz) assert.equal(al.defenders.find((d) => d.id === 'NB').y, A.creepY, 'the nickel creeps');
    assert.equal(al.linemen.length, 5); assert.equal(al.receivers.length, 5);
    assert.deepEqual(J(al.qb), { x: 0, y: A.qbGun });
    seen[ctx.shown] = true;
  }
  assert.equal(Object.keys(seen).length >= 5, true, 'most looks seen: ' + Object.keys(seen));
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

test('buildContext: tolerant inputs — no qb / team / opp uses the demo defaults; a numeric team.wr becomes a roster; the sign mirrors the alignment inside the field', () => {
  const ctx = Play.buildContext({ down: 2, toGo: 8, yl: 30 }, RTG.RNG.create(5));
  assert.equal(ctx.qb.archetype, T.demo.defaultArchetype);
  assert.equal(ctx.team.ol, T.demo.teams[T.demo.defaultTeam].ol);
  assert.equal(ctx.receivers.length, 5);
  const numeric = Play.buildContext({ team: { ol: 70, wr: 80 }, opp: { dl: 40 } }, RTG.RNG.create(5));
  assert.equal(numeric.team.wr[0].skill, 80 + T.demo.defaultRoster[0].skillAdd);
  assert.equal(numeric.opp.db, T.demo.teams[T.demo.defaultTeam].db, 'missing db falls back');
  const f = Dp.formations.SHOTGUN;
  for (let seed = 0; seed < 40; seed++) {
    const c = Play.buildContext(sit(), RTG.RNG.create(seed));
    for (const r of c.receivers) {
      const want = Math.min(c.field.sideR - T.field.sideMargin, Math.max(c.field.sideL + T.field.sideMargin, f[r.slot] * c.sign));
      near(r.x0, want, 0.001, r.slot + ' aligned by sign, pulled inside the field');
    }
  }
  assert.throws(() => Play.buildContext(sit(), null), /rng/);
});

// ═══════════════════════════════ THE SNAP ═══════════════════════════════

test('snap: shape — the field, five receivers with absolute paths from their spots, eleven defenders with roles from the REAL coverage, the rush in beat order, the drop, the separation pre-run, fit', () => {
  for (let seed = 21; seed < 41; seed++) {
    const { ctx, sim } = snapFor(seed, null);
    assert.equal(sim.run, false);
    assert.deepEqual(J(sim.field), J(ctx.field));
    assert.equal(sim.receivers.length, 5);
    for (const r of sim.receivers) {
      assert.ok(Dp.routes[r.route] && r.family === Dp.routes[r.route].family);
      assert.deepEqual(J(r.path[0]), { t: 0, x: r.x0, y: r.y0 }, r.slot + ' path starts at his spot');
      for (let i = 1; i < r.path.length; i++) assert.ok(r.path[i].t > r.path[i - 1].t, r.slot + ' times ascend');
      for (const p of r.path) assert.ok(p.y <= r.capY);
      assert.ok(r.xMin > sim.field.sideL && r.xMax < sim.field.sideR);
      assert.equal(r.ghost.sep.length, Math.round(T.field.ghostT / T.field.sampleDt) + 1);
      for (const v of r.ghost.sep) assert.ok(Number.isFinite(v) && v >= 0);
      assert.ok(r.ghost.from <= r.ghost.peakAt && r.ghost.peakAt <= r.ghost.to && r.ghost.peak === Math.max.apply(null, r.ghost.sep.slice(Math.round(T.field.ghostFrom / T.field.sampleDt))));
    }
    assert.equal(sim.defenders.length, 11);
    const roles = Dp.coverages[ctx.real].roles;
    for (const d of sim.defenders) {
      assert.equal(d.role, roles[d.id].role, d.id + ' plays the REAL coverage');
      assert.equal(d.man, roles[d.id].man);
      const a = ctx.alignment.defenders.find((x) => x.id === d.id);
      assert.deepEqual([d.x0, d.y0], [a.x, a.y], d.id + ' starts at the shown alignment');
      assert.ok(d.speed > 5 && d.speed < 12 && d.reach > 2 && d.react > 0 && d.skill >= 0 && d.skill <= 99);
      if (d.role === 'MAN') assert.ok(d.trail > 0 && d.cushion >= 0);
      if (d.role === 'ZONE') assert.ok(d.zone && d.zone.r > 0 && d.zone.y > 0);
    }
    const rushIds = sim.defenders.filter((d) => d.role === 'RUSH').map((d) => d.id).sort();
    assert.deepEqual(J(sim.rushers.map((r) => r.defId)).sort(), J(rushIds), 'every rusher has a beat time');
    for (let i = 1; i < sim.rushers.length; i++) assert.ok(sim.rushers[i].beatAt > sim.rushers[i - 1].beatAt);
    near(sim.rushers[0].beatAt, Math.max(T.field.rush.engageT, sim.sackAt - T.field.rush.approach), 0.002, 'beatAt from the sack clock');
    assert.equal(sim.linemen.length, 5);
    assert.ok(sim.qbDrop.y === T.field.qbDrop.depth && sim.qbDrop.t > 0);
    assert.ok(['GOOD', 'OK', 'BAD'].includes(sim.fit));
    assert.equal(sim.fit, playOf(sim.playId).vs[ctx.real]);
    assert.equal(sim.revealAt, ctx.revealAt);
  }
  assert.throws(() => Play.snap(snapFor(1, null).ctx, 'NOT_A_PLAY', RTG.RNG.create(1)), /unknown play/);
});

test('snap: the gun QB starts at −5 and drops by gunT, under centre at −1.2 by underT (+ the play-action fake)', () => {
  const r = RTG.RNG.create(8);
  const ctx = Play.buildContext(sit(), r);
  const gun = Play.snap(ctx, 'SLANT_FLAT', r), under = Play.snap(ctx, 'CURL_FLAT', r), pa = Play.snap(ctx, 'PA_POST', r);
  assert.deepEqual(J(gun.qbStart), { x: 0, y: T.field.align.qbGun }); assert.equal(gun.qbDrop.t, T.field.qbDrop.gunT);
  assert.deepEqual(J(under.qbStart), { x: 0, y: T.field.align.qbUnder }); assert.equal(under.qbDrop.t, T.field.qbDrop.underT);
  near(pa.qbDrop.t, T.field.qbDrop.underT + T.field.qbDrop.paT, 1e-9, 'play action holds it longer');
});

test('snap: the call matters — a GOOD play vs the real coverage gives its primary routes +1.5–2.5 yd more median peak separation than a BAD one (geometry, not dice)', () => {
  const good = [], bad = [];
  for (let i = 0; i < 160; i++) {
    const r0 = RTG.RNG.create(50000 + i);
    const ctx = Play.buildContext(sit(), r0);
    const st = r0.state();
    for (const fit of ['GOOD', 'BAD']) {
      const cands = Dp.plays.filter((p) => !p.run && p.vs[ctx.real] === fit);
      if (!cands.length) continue;
      const r = RTG.RNG.create(0); r.setState(st);
      const sim = Play.snap(ctx, cands[i % cands.length].id, r);
      const lim = Math.round(Math.min(3, sim.sackAt) * 10);
      for (const rec of sim.receivers) {
        if (rec.checkdown) continue;
        let m = 0;
        for (let k = 5; k <= lim; k++) m = Math.max(m, rec.ghost.sep[k]);
        (fit === 'GOOD' ? good : bad).push(m);
      }
    }
  }
  const d = median(good) - median(bad);
  assert.ok(d >= 1.2 && d <= 2.8, 'GOOD − BAD median peak separation ' + d.toFixed(2) + ' (GOOD ' + median(good).toFixed(2) + ', BAD ' + median(bad).toFixed(2) + ')');
});

test('snap: under a real BLITZ the quickest route is the hot read and five rush (the nickel comes); the checkdown is the back on a short route', () => {
  const lowIq = Play.buildContext(withAttrs({ IQ: 20 }), RTG.RNG.create(4)), highIq = Play.buildContext(withAttrs({ IQ: 90 }), RTG.RNG.create(4));
  assert.ok(highIq.revealAt < lowIq.revealAt - 0.5);
  for (let i = 0; i < 20; i++) {
    const rng = RTG.RNG.create(400 + i);
    const ctx = Play.buildContext(sit({ opp: only('BLITZ') }), rng);
    assert.equal(ctx.real, 'BLITZ');
    assert.equal(ctx.pressure.hot, true);
    const sim = Play.snap(ctx, 'FOUR_VERTS', rng);
    assert.equal(sim.hot, 'RB', 'the checkdown is the quickest route on FOUR VERTS');
    assert.equal(sim.checkdown, 'RB');
    assert.equal(sim.rushers.length, 5);
    assert.ok(sim.rushers.some((r) => r.defId === 'NB'));
    assert.ok(sim.receivers.find((r) => r.slot === 'RB').hot);
  }
});

test('snap: SNEAK on 4th and 1 succeeds about 70 %; DRAW is a run result; both are the result (run: true)', () => {
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
  assert.ok(['TOUCH'].includes(draw.feedback.touch) && draw.feedback.placement === '—');
});

// ═══════════════════════════════ THE LIVE PLAY (API level; the rules are in field.test.js) ═══════════════════════════════

test('live: Play.live returns a Live at t 0 in PRE_THROW with the QB holding the ball; resolve replays the live play exactly', () => {
  const { sim } = snapFor(77, null);
  const rng = RTG.RNG.create(123);
  const live = Play.live(sim, rng);
  assert.equal(live.t, 0); assert.equal(live.phase, 'PRE_THROW'); assert.equal(live.qb.hasBall, true);
  assert.equal(live.receivers.length, 5); assert.equal(live.defenders.length, 11); assert.equal(live.linemen.length, 5);
  assert.equal(live.ball, null); assert.equal(live.carrier, null);
  assert.equal(live.events[0].kind, 'SNAP');
  for (let i = 0; i < 47; i++) live.step(0.021);
  const aim = live.aim(sim.receivers[1].slot, 0.3);
  assert.equal(live.throwAlong(aim.points, 0.3).ok, true);
  const res = finish(live);
  const again = Play.resolve(sim, live.plan(), RTG.RNG.create(123));
  assert.deepEqual(J(again), J(res));
  assert.throws(() => Play.live(null, rng), /PlaySim/);
  assert.throws(() => Play.live(sim, null), /rng/);
});

test('autoPlan: a sensible headless plan (a pass at one of the auto times, else a throw-away before the pocket folds) that resolves without a sack most of the time; 0 draws', () => {
  let sacks = 0, passes = 0, n = 60;
  for (let i = 0; i < n; i++) {
    const { sim } = snapFor(900 + i, null);
    const plan = Play.autoPlan(sim);
    assert.ok(Array.isArray(plan.runs) && plan.runs.length === 0);
    assert.ok(plan.pass || plan.away !== null);
    if (plan.pass) { passes++; assert.ok(T.field.auto.times.some((t) => Math.abs(t - plan.pass.t) < 0.02)); }
    const res = Play.resolve(sim, plan, RTG.RNG.create(i));
    if (res.outcome === 'SACK') sacks++;
  }
  assert.ok(passes >= n * 0.8, passes + ' passes');
  assert.ok(sacks <= n * 0.1, sacks + ' sacks');
  const run = Play.snap(Play.buildContext(sit({ toGo: 1 }), RTG.RNG.create(1)), 'SNEAK', RTG.RNG.create(2));
  assert.deepEqual(J(Play.autoPlan(run)), { runs: [], pass: null, away: null });
});

test('forcedResult builds consistent v2 results without rng (CATCH / FIRST_DOWN / TD / INCOMPLETE / INT / SACK / DROP / THROWAWAY / SCRAMBLE / FUMBLE)', () => {
  const s = snapFor(51, null), sim = s.sim, sitn = sim.ctx.situation;
  const want = { CATCH: ['CATCH', false, false], FIRST_DOWN: ['CATCH', true, false], TD: ['CATCH', true, true], INCOMPLETE: ['INCOMPLETE', false, false], INT: ['INT', false, false], SACK: ['SACK', false, false], DROP: ['DROP', false, false], THROWAWAY: ['THROWAWAY', false, false], SCRAMBLE: ['SCRAMBLE', null, false], FUMBLE: ['SCRAMBLE', false, false] };
  for (const kind of Object.keys(want)) {
    const res = Play.forcedResult(sim, kind);
    assert.equal(res.outcome, want[kind][0], kind);
    if (want[kind][1] !== null) assert.equal(res.firstDown, want[kind][1], kind + ' firstDown');
    assert.equal(res.td, want[kind][2], kind + ' td');
    assert.equal(res.forced, true);
    assert.ok(res.banner && res.feedback && ['EARLY', 'ON TIME', 'LATE', 'TOO LATE'].includes(res.feedback.timing));
    assert.ok(['BULLET', 'TOUCH', 'LOB'].includes(res.feedback.touch) && typeof res.feedback.placement === 'string');
    assert.ok(['PASS', 'THROWAWAY', 'SCRAMBLE', 'SACK'].includes(res.kind));
  }
  assert.equal(Play.forcedResult(sim, 'INT').turnover, true);
  assert.equal(Play.forcedResult(sim, 'FUMBLE').turnover, true);
  assert.equal(Play.forcedResult(sim, 'TD').yards, 100 - sitn.yl);
  assert.ok(Play.forcedResult(sim, 'SACK').yards < 0);
  assert.equal(Play.forcedResult(sim, 'CATCH', { target: 'TE' }).target, 'TE');
});

test('the meter is gone: Play.throw, need, needFor, greenBand, inGreen, arrival, openAt, openIfThrown are not exported', () => {
  for (const f of ['throw', 'need', 'needFor', 'greenBand', 'inGreen', 'arrival', 'openAt', 'openIfThrown', 'flightTime', 'maxDist']) assert.equal(Play[f], undefined, 'Play.' + f);
  assert.equal(T.throw, undefined, 'Tuning.qb.throw (the meter constants) is gone');
  assert.deepEqual(J(Play.KINDS), ['PASS', 'THROWAWAY', 'SCRAMBLE', 'SACK']);
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
