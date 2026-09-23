/**
 * RTG.Data.plays lint — the play book as data, checked field by field so a typo in plays.js fails here and not
 * in a moment: every play's assignments name existing routes and slots (each slot exactly once), every coverage
 * carries a look and a pressureMul, every route's ideal lead / loft is in range and its window sits inside [0, 4],
 * every formation places all five slots, tags come from the known set, ids are unique, and the run options are
 * SNEAK and DRAW. Also cross-checks the tables the engine reads by name (Tuning.qb.open.vs keys, the coverage
 * order, the tightness families) so the data and the tuning cannot drift apart.
 *   node qb/test/plays_lint.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RTG = require('./load')();
const Dp = RTG.Data.plays, T = RTG.Tuning.qb;

const SLOTS = ['WR1', 'WR2', 'SLOT', 'TE', 'RB'];
const COVERAGES = ['COVER2', 'COVER3', 'COVER4', 'MAN', 'BLITZ', 'PREVENT'];
const FAMILIES = ['SHORT', 'MID', 'DEEP'];
const ADVICE = ['GOOD', 'OK', 'BAD'];
const TAGS = ['QUICK', 'DEEP', 'PA', 'SCREEN', 'SHORT_YDG', 'RUN'];
const num = (v) => typeof v === 'number' && isFinite(v);
/** Realm-agnostic copy (engine arrays live in a vm context, whose Array prototype deepStrictEqual rejects). */
const J = (o) => JSON.parse(JSON.stringify(o));

test('lint: the namespace carries routes, formations, plays, coverages, order, slots and families', () => {
  assert.equal(typeof Dp.routes, 'object');
  assert.equal(typeof Dp.formations, 'object');
  assert.ok(Array.isArray(Dp.plays) && Dp.plays.length >= 12, 'about 12 plays plus the runs');
  assert.equal(typeof Dp.coverages, 'object');
  assert.deepEqual(J(Dp.order), COVERAGES, 'the six coverages in the fixed order');
  assert.deepEqual(J(Dp.slots), SLOTS);
  assert.deepEqual(J(Dp.families), FAMILIES);
});

test('lint: every route — id matches its key, family known, depth numeric, ideal lead in −1..1 and loft in 0..1, window inside [0, 4] and open < close', () => {
  const ids = Object.keys(Dp.routes);
  assert.ok(ids.length >= 15, ids.length + ' routes');
  for (const id of ids) {
    const r = Dp.routes[id];
    assert.equal(r.id, id, id + ': id');
    assert.equal(typeof r.name, 'string', id + ': name');
    assert.ok(FAMILIES.includes(r.family), id + ': family ' + r.family);
    assert.ok(num(r.depth), id + ': depth');
    assert.ok(r.ideal && num(r.ideal.lead) && r.ideal.lead >= -1 && r.ideal.lead <= 1, id + ': ideal.lead ' + JSON.stringify(r.ideal));
    assert.ok(num(r.ideal.loft) && r.ideal.loft >= 0 && r.ideal.loft <= 1, id + ': ideal.loft ' + JSON.stringify(r.ideal));
    const w = r.window;
    assert.ok(w && num(w.open) && num(w.close), id + ': window ' + JSON.stringify(w));
    assert.ok(w.open >= 0 && w.close <= 4 && w.open < w.close, id + ': window inside [0, 4] ' + JSON.stringify(w));
  }
});

test('lint: every route path — starts at (0, 0, 0), times strictly ascend and end by 4.2 s, x / y numeric, at least three waypoints', () => {
  for (const id of Object.keys(Dp.routes)) {
    const p = Dp.routes[id].path;
    assert.ok(Array.isArray(p) && p.length >= 3, id + ': path length');
    assert.deepEqual(J(p[0]), { t: 0, x: 0, y: 0 }, id + ': path starts at the alignment');
    for (let i = 0; i < p.length; i++) {
      assert.ok(num(p[i].t) && num(p[i].x) && num(p[i].y), id + ': waypoint ' + i + ' numeric');
      if (i) assert.ok(p[i].t > p[i - 1].t, id + ': waypoint ' + i + ' time ascends');
    }
    assert.ok(p[p.length - 1].t <= 4.2, id + ': path ends by 4.2 s');
    assert.ok(p[p.length - 1].t >= Dp.routes[id].window.close - 0.01, id + ': the path covers its own window');
  }
});

test('lint: every formation places all five slots (numeric, WR1 left of WR2) and every play names a formation', () => {
  for (const name of Object.keys(Dp.formations)) {
    const f = Dp.formations[name];
    for (const s of SLOTS) assert.ok(num(f[s]), name + ': ' + s);
    assert.ok(f.WR1 < f.WR2, name + ': WR1 lines up left of WR2');
  }
  for (const p of Dp.plays) assert.ok(Dp.formations[p.formation], p.id + ': formation ' + p.formation);
});

test('lint: every pass play assigns each of the five slots exactly once to an existing route; run plays assign nothing', () => {
  for (const p of Dp.plays) {
    assert.ok(Array.isArray(p.assignments), p.id + ': assignments');
    if (p.run) { assert.equal(p.assignments.length, 0, p.id + ': a run assigns nothing'); continue; }
    assert.equal(p.assignments.length, 5, p.id + ': five assignments');
    const seen = {};
    for (const a of p.assignments) {
      assert.ok(SLOTS.includes(a.slot), p.id + ': slot ' + a.slot);
      assert.ok(!seen[a.slot], p.id + ': slot ' + a.slot + ' assigned twice');
      seen[a.slot] = true;
      assert.ok(Dp.routes[a.route], p.id + ': route ' + a.route + ' does not exist');
    }
  }
});

test('lint: play ids and names are unique strings; tags come from the known set; vs tables rate all six coverages; run flag is boolean', () => {
  const ids = {}, names = {};
  for (const p of Dp.plays) {
    assert.equal(typeof p.id, 'string'); assert.equal(typeof p.name, 'string'); assert.equal(typeof p.line, 'string');
    assert.ok(!ids[p.id], 'duplicate play id ' + p.id); ids[p.id] = true;
    assert.ok(!names[p.name], 'duplicate play name ' + p.name); names[p.name] = true;
    assert.equal(typeof p.run, 'boolean', p.id + ': run');
    assert.ok(Array.isArray(p.tags), p.id + ': tags');
    for (const t of p.tags) assert.ok(TAGS.includes(t), p.id + ': tag ' + t);
    for (const c of COVERAGES) assert.ok(ADVICE.includes(p.vs[c]), p.id + ': vs ' + c + ' = ' + p.vs[c]);
    assert.deepEqual(J(Object.keys(p.vs)).sort(), COVERAGES.slice().sort(), p.id + ': vs keys');
  }
});

test('lint: the run options are exactly SNEAK and DRAW, tagged RUN + SHORT_YDG', () => {
  const runs = J(Dp.plays.filter((p) => p.run).map((p) => p.id));
  assert.deepEqual(runs.sort(), ['DRAW', 'SNEAK']);
  for (const p of Dp.plays.filter((p) => p.run)) {
    assert.ok(p.tags.includes('RUN') && p.tags.includes('SHORT_YDG'), p.id + ': tags');
  }
});

test('lint: every coverage has a look {safeties 1|2, press, box, showBlitz}, a pressureMul > 0, disguises among the other five, tightness per family, text and tell', () => {
  assert.deepEqual(J(Object.keys(Dp.coverages)).sort(), COVERAGES.slice().sort());
  for (const id of COVERAGES) {
    const c = Dp.coverages[id];
    assert.equal(c.id, id, id + ': id');
    assert.equal(typeof c.name, 'string', id + ': name');
    assert.ok(c.look, id + ': look');
    assert.ok(c.look.safeties === 1 || c.look.safeties === 2, id + ': look.safeties');
    assert.equal(typeof c.look.press, 'boolean', id + ': look.press');
    assert.ok(num(c.look.box) && c.look.box >= 4 && c.look.box <= 9, id + ': look.box');
    assert.equal(typeof c.look.showBlitz, 'boolean', id + ': look.showBlitz');
    assert.ok(num(c.pressureMul) && c.pressureMul > 0, id + ': pressureMul');
    assert.ok(Array.isArray(c.disguises) && c.disguises.length >= 1, id + ': disguises');
    for (const d of c.disguises) assert.ok(COVERAGES.includes(d) && d !== id, id + ': disguise ' + d);
    for (const f of FAMILIES) assert.ok(num(c.tightness[f]) && c.tightness[f] >= 0 && c.tightness[f] <= 1, id + ': tightness ' + f);
    assert.equal(typeof c.text, 'string', id + ': text'); assert.equal(typeof c.tell, 'string', id + ': tell');
  }
  assert.equal(Dp.coverages.BLITZ.look.showBlitz, true, 'the blitz shows a tell');
  assert.ok(Dp.coverages.BLITZ.pressureMul > Dp.coverages.PREVENT.pressureMul, 'a blitz brings more pressure than a prevent');
});

test('lint: the tables the engine reads by name agree with the data — Tuning.qb.open.vs / coverage.base / scramble.look / draw.look keys, the yac families', () => {
  assert.deepEqual(J(Object.keys(T.open.vs)).sort(), ADVICE.slice().sort(), 'open.vs keyed by advice');
  assert.deepEqual(J(Object.keys(T.coverage.base)).sort(), COVERAGES.slice().sort(), 'coverage.base keyed by the six coverages');
  assert.deepEqual(J(Object.keys(T.throw.scramble.look)).sort(), COVERAGES.slice().sort(), 'scramble.look keyed by the six coverages');
  assert.deepEqual(J(Object.keys(T.run.draw.look)).sort(), COVERAGES.slice().sort(), 'draw.look keyed by the six coverages');
  assert.deepEqual(J(Object.keys(T.throw.yac.base)).sort(), FAMILIES.slice().sort(), 'yac.base keyed by family');
  for (const k of ['short', 'long', 'redZone', 'lastPlay']) for (const tag of Object.keys(T.read.weights[k])) assert.ok(TAGS.includes(tag), 'read.weights.' + k + ' tag ' + tag);
  for (const k of ['long', 'short', 'redZone', 'late']) for (const c of Object.keys(T.coverage[k])) assert.ok(COVERAGES.includes(c), 'coverage.' + k + ' key ' + c);
  for (const id of Object.keys(T.demo.teams)) {
    const wr = T.demo.teams[id].wr;
    assert.deepEqual(J(wr.map((r) => r.slot)), SLOTS, 'demo roster ' + id + ' in slot order');
  }
});

test('lint: the play book gives every coverage at least one GOOD and one BAD answer, and short yardage has a SHORT_YDG pass', () => {
  const passes = Dp.plays.filter((p) => !p.run);
  for (const c of COVERAGES) {
    assert.ok(passes.some((p) => p.vs[c] === 'GOOD'), 'a GOOD pass play vs ' + c);
    assert.ok(passes.some((p) => p.vs[c] === 'BAD'), 'a BAD pass play vs ' + c);
  }
  assert.ok(passes.some((p) => p.tags.includes('SHORT_YDG')), 'a SHORT_YDG pass play');
  assert.ok(passes.some((p) => p.tags.includes('DEEP')), 'a DEEP pass play');
  assert.ok(passes.some((p) => p.tags.includes('QUICK')), 'a QUICK pass play');
});
