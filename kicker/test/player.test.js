/**
 * RTG.Player — attributes, XP, meters, Job Security, aging, injuries, modifiers (§2.1, §2.2, §3.5.7).
 *   node kicker/test/player.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RTG = require('./load')();
/** deep-equal that ignores realm prototypes (engine objects live in a vm context). */
const deq = (a, b, msg) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg);
const pfx = require('./fixtures/player');
const Player = RTG.Player, Tuning = RTG.Tuning, Util = RTG.Util;

const hasData = !!(RTG.Data && Array.isArray(RTG.Data.colleges) && RTG.Data.colleges.length && Array.isArray(RTG.Data.nfl) && RTG.Data.nfl.length);
const dataNote = 'state fixtures need data/colleges.js + data/nfl.js (E2)';

/** RNG state after n plain draws from state s0. */
function stateAfter(s0, n) {
  const r = RTG.RNG.create(0); r.setState(s0);
  for (let i = 0; i < n; i++) r.next();
  return r.state();
}

test('ovr formula: round(0.30·ACC + 0.25·POW + 0.20·CON + 0.17·CLU + 0.08·KO)', () => {
  assert.equal(Player.ovr({ POW: 60, ACC: 60, CON: 60, CLU: 60, KO: 60 }), 60);
  assert.equal(Player.ovr({ POW: 82, ACC: 92, CON: 90, CLU: 88, KO: 80 }), Math.round(0.30 * 92 + 0.25 * 82 + 0.20 * 90 + 0.17 * 88 + 0.08 * 80));
  assert.equal(Player.ovr({ POW: 99, ACC: 99, CON: 99, CLU: 99, KO: 99 }), 99);
  assert.equal(Player.ovr({ POW: 1, ACC: 1, CON: 1, CLU: 1, KO: 1 }), 1);
});

test('fameTier tiers and names', () => {
  assert.equal(Player.fameTier(0), 0);
  assert.equal(Player.fameTier(99), 0);
  assert.equal(Player.fameTier(100), 1);
  assert.equal(Player.fameTier(249), 1);
  assert.equal(Player.fameTier(250), 2);
  assert.equal(Player.fameTier(500), 3);
  assert.equal(Player.fameTier(799), 3);
  assert.equal(Player.fameTier(800), 4);
  assert.equal(Player.fameTier(1000), 4);
  assert.equal(Player.fameTierName(600), 'Star');
});

test('ageMult table', () => {
  assert.equal(Player.ageMult(18), 0.85);
  assert.equal(Player.ageMult(22), 0.85);
  assert.equal(Player.ageMult(23), 1.0);
  assert.equal(Player.ageMult(26), 1.0);
  assert.equal(Player.ageMult(27), 1.2);
  assert.equal(Player.ageMult(30), 1.2);
  assert.equal(Player.ageMult(31), 1.6);
  assert.equal(Player.ageMult(33), 1.6);
  assert.equal(Player.ageMult(34), 2.4);
  assert.equal(Player.ageMult(36), 2.4);
  assert.equal(Player.ageMult(37), 3.5);
  assert.equal(Player.ageMult(45), 3.5);
});

test('costToRaise follows Tuning.progression.cost (base + over50 + over70 + over80, age and focus multipliers)', () => {
  const c = RTG.Tuning.progression.cost;
  const nominal = (v) => c.base + c.over50 * Math.max(0, v - 50) + (c.over70 || 0) * Math.max(0, v - 70) + c.over80 * Math.max(0, v - 80);
  for (const v of [40, 50, 60, 69, 70, 75, 80, 85, 90, 98]) assert.equal(Player.costToRaise('ACC', v, 24), Math.round(nominal(v)), 'v=' + v);
  assert.ok(Player.costToRaise('ACC', 60, 24) < Player.costToRaise('ACC', 75, 24) && Player.costToRaise('ACC', 75, 24) < Player.costToRaise('ACC', 85, 24), 'monotone');
  assert.equal(Player.costToRaise('POW', 40, 24), c.base, 'flat below 50');
  assert.equal(Player.costToRaise('ACC', 60, 18), Math.round(nominal(60) * 0.85), 'age ≤ 22 ×0.85');
  assert.equal(Player.costToRaise('ACC', 60, 35), Math.round(nominal(60) * 2.4), 'age 34–36 ×2.4');
  assert.equal(Player.costToRaise('ACC', 60, 24, 'ACC'), Math.round(nominal(60) * c.focusMult), 'focus discount');
  assert.equal(Player.costToRaise('ACC', 60, 24, 'POW'), Math.round(nominal(60)), 'other focus: no discount');
});

test('spendXp respects XP balance, POT cap, the 99 ceiling and the focus discount', () => {
  const p = pfx.player(RTG, { attrs: { ACC: 60 }, pot: { ACC: 61 }, age: 24, xp: 100 });
  let r = Player.spendXp(p, 'ACC');
  const c60 = Player.costToRaise('ACC', 60, 24);
  deq(r, { ok: true, cost: c60, newValue: 61 });
  assert.equal(p.xp, 100 - c60);
  assert.equal(p.xpSpent, c60);
  assert.equal(p.attrs.ACC, 61);
  r = Player.spendXp(p, 'ACC');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'POT_CAP');
  assert.equal(p.attrs.ACC, 61);
  p.pot.ACC = 99; p.xp = 5;
  r = Player.spendXp(p, 'ACC');
  assert.equal(r.reason, 'NO_XP');
  assert.equal(r.cost, Player.costToRaise('ACC', 61, 24));
  p.xp = 1000; p.attrs.POW = 99; p.pot.POW = 99;
  assert.equal(Player.spendXp(p, 'POW').reason, 'MAXED');
  assert.equal(Player.spendXp(p, 'XYZ').reason, 'BAD_ATTR');
  p.attrs.CON = 60; p.pot.CON = 99;
  r = Player.spendXp(p, 'CON', { focus: 'CON' });
  assert.equal(r.cost, Math.round(Player.costToRaise('CON', 60, 24) * RTG.Tuning.progression.cost.focusMult));
});

test('create: archetype means, creation clamp 30–75, POT ~N(pot.mean, pot.sd) clamped, trait rate ≈ 25 %, fixed draw order', () => {
  const P = Tuning.progression;
  for (const arch of ['CANNON', 'SURGEON', 'ICEMAN', 'SOCCER']) {
    const rng = RTG.RNG.create(100);
    const sums = { POW: 0, ACC: 0, CON: 0, CLU: 0, KO: 0 };
    let potSum = 0, traits = 0, bigLeg = 0, ice = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const p = Player.create(rng, { archetype: arch, name: 'A B' });
      for (const a of Player.ATTRS) {
        sums[a] += p.attrs[a];
        assert.ok(p.attrs[a] >= P.creation.attrMin && p.attrs[a] <= P.creation.attrMax);
        assert.ok(p.pot[a] >= P.pot.min && p.pot[a] <= P.pot.max);
        potSum += p.pot[a];
      }
      if (p.traits.length) { traits++; if (p.traits[0] === 'BIG_LEG') bigLeg++; if (p.traits[0] === 'ICE_VEINS') ice++; }
      assert.equal(p.stars, 3);
      assert.equal(p.fame, Tuning.soft.start.fameByStars[3]);
      assert.equal(p.morale, 60);
      assert.equal(p.role, 'K1');
      assert.equal(p.teamId, null);
    }
    for (const a of Player.ATTRS) assert.ok(Math.abs(sums[a] / N - P.archetypes[arch][a][0]) < 0.6, arch + ' ' + a + ' mean ' + sums[a] / N);
    assert.ok(Math.abs(potSum / (N * 5) - P.pot.mean) < 0.7);
    assert.ok(Math.abs(traits / N - 0.25) < 0.03, arch + ' trait rate ' + traits / N);
    if (arch === 'CANNON') assert.ok(bigLeg / traits > 0.45, 'Cannon BIG_LEG share ' + bigLeg / traits);
    if (arch === 'ICEMAN') assert.ok(ice / traits > 0.45, 'Iceman ICE_VEINS share ' + ice / traits);
  }
  // draw order: 10 (attrs) + 10 (POT) + 1 (trait chance) [+ 1 weighted]
  for (let seed = 1; seed < 40; seed++) {
    const rng = RTG.RNG.create(seed);
    const s0 = rng.state();
    const p = Player.create(rng, { archetype: 'SURGEON' });
    assert.equal(rng.state(), stateAfter(s0, 21 + (p.traits.length ? 1 : 0)), 'seed ' + seed);
  }
  // opts are honoured
  const p = Player.create(RTG.RNG.create(1), { name: 'Lee Ann Booter', archetype: 'soccer', foot: 'L', look: { skin: 2, hair: 3, boot: 1 }, hometown: { city: 'Reno', state: 'NV', region: 'W' }, id: 'pid' });
  deq(p.name, { first: 'Lee', last: 'Ann Booter', full: 'Lee Ann Booter' });
  assert.equal(p.archetype, 'SOCCER');
  assert.equal(p.foot, 'L');
  deq(p.look, { skin: 2, hair: 3, boot: 1 });
  assert.equal(p.hometown.city, 'Reno');
  assert.equal(p.id, 'pid');
});

test('applyStars: +4 attrs per star above 3, POT bonus, fame start', () => {
  const p = pfx.player(RTG, { attrs: { POW: 50, ACC: 50, CON: 50, CLU: 50, KO: 50 }, pot: { POW: 80, ACC: 80, CON: 80, CLU: 80, KO: 80 } });
  Player.applyStars(p, 5);
  assert.equal(p.attrs.POW, 58);
  assert.equal(p.pot.POW, 86);
  assert.equal(p.fame, 60);
  assert.equal(p.stars, 5);
  Player.applyStars(p, 2);
  assert.equal(p.attrs.POW, 46);
  assert.equal(p.pot.POW, 77);
  assert.equal(p.fame, 0);
  Player.applyStars(p, 3);
  assert.equal(p.attrs.POW, 50);
  assert.equal(p.pot.POW, 80);
  assert.equal(p.fame, 20);
  const q = Player.create(RTG.RNG.create(2), { archetype: 'CANNON', stars: 4 });
  assert.equal(q.stars, 4);
  assert.equal(q.fame, 40);
});

test('effectiveAttrs applies Form to ACC only, clamped 1–99; formText thresholds', () => {
  const p = pfx.player(RTG, { attrs: { ACC: 60, POW: 70 }, form: 3.4 });
  const e = Player.effectiveAttrs(p);
  assert.equal(e.ACC, 63.4);
  assert.equal(e.POW, 70);
  p.attrs.ACC = 98; p.form = 5;
  assert.equal(Player.effectiveAttrs(p).ACC, 99);
  p.attrs.ACC = 2; p.form = -5;
  assert.equal(Player.effectiveAttrs(p).ACC, 1);
  p.form = 3; assert.equal(Player.formText(p), "You've looked sharp in practice");
  p.form = -3; assert.equal(Player.formText(p), 'Coach is watching your plant foot');
  p.form = 0; assert.equal(Player.formText(p), '');
});

test('modifiers: addMod defaults, modValue product/sum, expireMods by week/game/season/never', () => {
  const p = pfx.player(RTG);
  Player.addMod(p, { key: 'sigma', op: 'mul', value: 1.1, expires: { type: 'week', at: 6 }, label: 'a' });
  Player.addMod(p, { key: 'sigma', op: 'mul', value: 0.9, expires: { type: 'game', at: 3 } });
  Player.addMod(p, { key: 'pressure', op: 'add', value: 0.1, expires: { type: 'season', at: 2 } });
  Player.addMod(p, { key: 'pressure', op: 'add', value: 0.05 });
  Player.addMod(p, { key: 'windDrift', op: 'mul', value: 0.95, expires: { type: 'never' } });
  assert.equal(p.mods.length, 5);
  assert.equal(p.mods[3].expires.type, 'never');
  assert.equal(typeof p.mods[1].id, 'string');
  assert.ok(Math.abs(Player.modValue(p, 'sigma', 'mul') - 0.99) < 1e-12);
  assert.ok(Math.abs(Player.modValue(p, 'pressure', 'add') - 0.15) < 1e-12);
  assert.equal(Player.modValue(p, 'sigma', 'add'), 0);
  assert.equal(Player.modValue(p, 'range', 'mul'), 1);
  assert.equal(Player.modValue({ mods: null }, 'range', 'mul'), 1);
  assert.equal(Player.expireMods(p, { type: 'week', at: 5 }).length, 0);
  assert.equal(Player.expireMods(p, { type: 'week', at: 6 }).length, 1);
  assert.equal(Player.modValue(p, 'sigma', 'mul'), 0.9);
  assert.equal(Player.expireMods(p, { type: 'game', at: 2 }).length, 0);
  assert.equal(Player.expireMods(p, { type: 'game', at: 9 }).length, 1);
  assert.equal(Player.expireMods(p, { type: 'season', at: 1 }).length, 0);
  assert.equal(Player.expireMods(p, { type: 'season', at: 2 }).length, 1);
  assert.equal(Player.expireMods(p, { type: 'never' }).length, 2);   // explicit request removes 'never' mods
  assert.equal(p.mods.length, 0);
  assert.equal(Player.modValue(p, 'pressure', 'add'), 0);
});

test('ageTick decline lines by age (§2.1.3) and CLU never declines', (t) => {
  if (!hasData) { t.skip(dataNote); return; }
  const base = { POW: 70, ACC: 70, CON: 70, CLU: 70, KO: 70 };
  const pot = { POW: 99, ACC: 99, CON: 99, CLU: 99, KO: 99 };
  const run = (age, traits) => {
    const state = pfx.stateWith(RTG, { attrs: base, pot: pot, age: age, traits: traits || [] });
    const rng = RTG.RNG.create(age);
    const s0 = rng.state();
    const log = Player.ageTick(state, rng);
    return { state: state, log: log, draws: rng.state() === stateAfter(s0, 2) ? 2 : (rng.state() === s0 ? 0 : -1) };
  };
  const deltas = (log) => { const d = {}; for (const e of log) d[e.attr] = (d[e.attr] || 0) + e.delta; return d; };

  let r = run(25);
  deq(r.log, []);
  assert.equal(r.draws, 0);
  r = run(32); deq(deltas(r.log), { KO: -1 });
  r = run(33); deq(deltas(r.log), { POW: -1, KO: -1 });
  r = run(34); deq(deltas(r.log), { POW: -1, KO: -1 });
  r = run(35); deq(deltas(r.log), { POW: -2, CON: -1, KO: -2 });
  r = run(36); deq(deltas(r.log), { POW: -2, CON: -1, KO: -2 });
  r = run(37); deq(deltas(r.log), { POW: -3, CON: -1, ACC: -1, KO: -2 });
  r = run(40);
  assert.equal(r.state.player.attrs.CLU, 70);
  assert.equal(r.log.filter((e) => e.attr === 'CLU').length, 0);
  for (const e of r.log) assert.equal(typeof e.text, 'string');
  // LEGS_OF_STEEL: decline starts at 35
  r = run(33, ['LEGS_OF_STEEL']); deq(deltas(r.log), { KO: -1 });
  r = run(35, ['LEGS_OF_STEEL']); deq(deltas(r.log), { POW: -2, KO: -2 });
  r = run(37, ['LEGS_OF_STEEL']); deq(deltas(r.log), { POW: -3, CON: -1, KO: -2 });
  // growth: age ≤ 24 → +1 to two distinct attributes with exactly 2 draws
  r = run(24);
  assert.equal(r.draws, 2);
  assert.equal(r.log.length, 2);
  assert.notEqual(r.log[0].attr, r.log[1].attr);
  for (const e of r.log) assert.equal(e.delta, 1);
  assert.equal(Util.sum(Player.ATTRS.map((a) => r.state.player.attrs[a])), 352);
  // LATE_BLOOMER extends the window to 26
  assert.equal(run(26).log.length, 0);
  assert.equal(run(26, ['LATE_BLOOMER']).log.length, 2);
  // growth is capped by POT and floors never go below 1
  const capped = pfx.stateWith(RTG, { attrs: base, pot: base, age: 20 });
  deq(Player.ageTick(capped, RTG.RNG.create(1)), []);
  const floor = pfx.stateWith(RTG, { attrs: { POW: 1, ACC: 1, CON: 1, CLU: 1, KO: 1 }, pot: pot, age: 38 });
  Player.ageTick(floor, RTG.RNG.create(1));
  for (const a of Player.ATTRS) assert.equal(floor.player.attrs[a], 1);
  // WHISPERER coach adds ACC +1 in the offseason
  const w = pfx.stateWith(RTG, { attrs: base, pot: pot, age: 28, flags: { coachStyle: 'WHISPERER' } });
  deq(deltas(Player.ageTick(w, RTG.RNG.create(1))), { ACC: 1 });
});

test('injury probabilities: 100k rolls within ±10 % (base, rested ×0.5, age ≥ 32 ×1.5); types/weeks; draw counts', (t) => {
  if (!hasData) { t.skip(dataNote); return; }
  const I = Tuning.progression.injury;
  const roll = (age, rested, difficulty, N) => {
    const state = pfx.stateWith(RTG, { age: age, difficulty: difficulty || 'pro' });
    const rng = RTG.RNG.create(age * 7 + (rested ? 1 : 0));
    let n = 0, career = 0;
    const weeks = {};
    for (let i = 0; i < N; i++) {
      state.player.injury = null;
      state.player.flags.rested = rested;
      const s0 = rng.state();
      const inj = Player.rollInjury(state, rng);
      assert.equal(rng.state(), stateAfter(s0, inj ? 2 : 1), 'draw count');
      assert.equal(state.player.flags.rested, undefined, 'rest flag is consumed');
      if (inj) {
        n++;
        assert.equal(state.player.injury, inj);
        if (inj.careerThreat) { career++; assert.ok(inj.weeksLeft >= I.careerThreat.weeks[0] && inj.weeksLeft <= I.careerThreat.weeks[1]); }
        else {
          const def = I.types.filter((x) => x.type === inj.type)[0];
          assert.ok(def, 'unknown injury type ' + inj.type);
          assert.ok(inj.weeksLeft >= def.weeks[0] && inj.weeksLeft <= def.weeks[1], inj.type + ' ' + inj.weeksLeft);
          weeks[inj.type] = (weeks[inj.type] || 0) + 1;
        }
      }
    }
    return { n: n, career: career, weeks: weeks };
  };
  const N = 100000;
  let r = roll(25, false, 'pro', N);
  assert.ok(Math.abs(r.n - N * I.pPerGame) < N * I.pPerGame * 0.1, 'base ' + r.n);
  assert.equal(r.career, 0, 'no career-threatening injuries on pro under 34');
  assert.equal(Object.keys(r.weeks).length, 3, 'all three injury types occur');
  r = roll(25, true, 'pro', N);
  assert.ok(Math.abs(r.n - N * I.pPerGame * I.restMult) < N * I.pPerGame * I.restMult * 0.1, 'rested ' + r.n);
  r = roll(33, false, 'pro', N);
  assert.ok(Math.abs(r.n - N * I.pPerGame * I.ageMult) < N * I.pPerGame * I.ageMult * 0.1, 'age 33 ' + r.n);
  // career-threatening: legend at any age, pro only from 34, rookie never
  assert.equal(Player.careerThreatProb(pfx.stateWith(RTG, { age: 25, difficulty: 'legend' })), I.careerThreat.p);
  assert.equal(Player.careerThreatProb(pfx.stateWith(RTG, { age: 25, difficulty: 'allpro' })), I.careerThreat.p);
  assert.equal(Player.careerThreatProb(pfx.stateWith(RTG, { age: 25, difficulty: 'pro' })), 0);
  assert.equal(Player.careerThreatProb(pfx.stateWith(RTG, { age: 34, difficulty: 'pro' })), I.careerThreat.p);
  assert.equal(Player.careerThreatProb(pfx.stateWith(RTG, { age: 36, difficulty: 'rookie' })), 0);
  r = roll(25, false, 'legend', 200000);
  assert.ok(Math.abs(r.career - 200000 * I.careerThreat.p) < 200000 * I.careerThreat.p * 0.25, 'career-threat count ' + r.career);
  // career-threatening injury costs POW −3 permanently
  const state = pfx.stateWith(RTG, { age: 30, difficulty: 'legend', attrs: { POW: 70 } });
  const rng = RTG.RNG.create(1);
  let inj = null;
  for (let i = 0; i < 20000 && !(inj && inj.careerThreat); i++) { state.player.injury = null; state.player.attrs.POW = 70; inj = Player.rollInjury(state, rng); }
  assert.ok(inj && inj.careerThreat);
  assert.equal(state.player.attrs.POW, 67);
  assert.equal(state.player.flags.comebackArc, true);
  // already injured → no new roll
  assert.equal(Player.rollInjury(state, rng), null);
  // injury multiplier mods
  const mod = pfx.stateWith(RTG, { age: 25 });
  Player.addMod(mod.player, { key: 'injury', op: 'mul', value: 0.5 });
  assert.ok(Math.abs(Player.injuryProb(mod) - I.pPerGame * 0.5) < 1e-12);
});

test('Job Security: exact update rule, floor trust/5, difficulty scaling of negatives', (t) => {
  if (!hasData) { t.skip(dataNote); return; }
  const J = Tuning.soft.js;
  const fresh = (o) => {
    const state = pfx.stateWith(RTG, o);
    const team = RTG.Schema.userTeam(state);
    team.kicker2.ovr = Player.ovr(state.player.attrs);          // rival OVR == mine → gap term 50
    return state;
  };
  // js 60, trust 50: two makes (one 50+) → 60 + 4 → 0.9·64 + 0.1·50 = 62.6
  let state = fresh({ js: 60, trust: 50 });
  let r = Player.updateJobSecurity(state, pfx.gameSummary([{ distance: 42, made: true }, { distance: 52, made: true }]));
  assert.equal(r.js, 62.6);
  assert.equal(state.player.js, 62.6);
  assert.equal(r.benched, false);
  assert.equal(r.cutWarning, false);
  assert.equal(state.player.role, 'K1');
  // misses by bucket + decisive + blocked
  state = fresh({ js: 60, trust: 50 });
  r = Player.updateJobSecurity(state, pfx.gameSummary([{ distance: 38, made: false }, { distance: 45, made: false }, { distance: 55, made: false }, { distance: 41, made: false, blocked: true }, { distance: 40, made: false, decisive: true }]));
  // 60 − 6 − 3 − 1 − 4 − 3 − 10 = 33 → 0.9·33 + 5 = 34.7
  assert.equal(r.js, 34.7);
  // decisive make: 60 + 2 + 8 = 70 → 63 + 5 = 68
  state = fresh({ js: 60, trust: 50 });
  assert.equal(Player.updateJobSecurity(state, pfx.gameSummary([{ distance: 44, made: true, decisive: true }])).js, 68);
  // PATs never move JS; a bye (null summary) only regresses
  state = fresh({ js: 60, trust: 50 });
  assert.equal(Player.updateJobSecurity(state, pfx.gameSummary([{ distance: 33, made: false, type: 'PAT' }])).js, 59);
  state = fresh({ js: 60, trust: 50 });
  assert.equal(Player.updateJobSecurity(state, null).js, 59);
  // floor = trust/5
  state = fresh({ js: 0, trust: 100 });
  r = Player.updateJobSecurity(state, pfx.gameSummary([{ distance: 30, made: false }, { distance: 31, made: false }, { distance: 32, made: false }]));
  assert.equal(r.js, 20);
  assert.equal(r.benched, true);
  // rating-gap regression: rival 10 OVR better → gap term 0
  state = fresh({ js: 50, trust: 0 });
  RTG.Schema.userTeam(state).kicker2.ovr = Player.ovr(state.player.attrs) + 10;
  assert.equal(Player.updateJobSecurity(state, null).js, 45);
  // difficulty scaling of the negative deltas
  const negCase = (difficulty) => {
    const s = fresh({ js: 30, trust: 50, difficulty: difficulty });
    return Player.updateJobSecurity(s, pfx.gameSummary([{ distance: 30, made: false }, { distance: 31, made: false }, { distance: 32, made: false }])).js;
  };
  assert.equal(negCase('pro'), Util.round1(0.9 * (30 - 18) + 5));
  assert.equal(negCase('legend'), Math.max(10, Util.round1(0.9 * (30 - 18 * 1.6) + 5)));   // floor trust/5 = 10 applies
  assert.equal(negCase('rookie'), Util.round1(0.9 * (30 - 18 * 0.6) + 5));
  assert.equal(negCase('allpro'), Util.round1(0.9 * (30 - 18 * 1.3) + 5));
  // userLine fallback when no kick rows are given
  deq(Player.kickCounts({ userLine: { fga: 3, fgm: 2, gw: 1 } }), { makes: 2, missesLt40: 0, misses40s: 1, misses50: 0, decisiveMakes: 1, decisiveMisses: 0, blocked: 0 });
  void J;
});

test('Job Security: bench at < 25 (role K2), regain K1 at ≥ 40, cut warning after 3 weeks < 10', (t) => {
  if (!hasData) { t.skip(dataNote); return; }
  const state = pfx.stateWith(RTG, { js: 30, trust: 50 });
  RTG.Schema.userTeam(state).kicker2.ovr = Player.ovr(state.player.attrs);
  const misses = pfx.gameSummary([{ distance: 30, made: false }, { distance: 31, made: false }, { distance: 32, made: false }]);
  let r = Player.updateJobSecurity(state, misses);
  assert.equal(r.js, 15.8);
  assert.equal(r.benched, true);
  assert.equal(state.player.role, 'K2');
  assert.equal(state.player.flags.benched, true);
  // stays benched below 40
  r = Player.updateJobSecurity(state, null);
  assert.equal(state.player.role, 'K2');
  assert.equal(r.benched, true);
  // regains K1 once js ≥ 40
  state.player.js = 45;
  r = Player.updateJobSecurity(state, null);
  assert.equal(r.js, 45.5);
  assert.equal(state.player.role, 'K1');
  assert.equal(state.player.flags.benched, undefined);
  assert.equal(r.benched, false);
  // a legitimate K2 (camp loser) is not flagged as benched
  const backup = pfx.stateWith(RTG, { js: 35, trust: 50, role: 'K2' });
  RTG.Schema.userTeam(backup).kicker2.ovr = Player.ovr(backup.player.attrs);
  r = Player.updateJobSecurity(backup, null);
  assert.equal(backup.player.role, 'K2');
  assert.equal(r.benched, false);
  // cut warning: three consecutive weeks under 10
  const cut = pfx.stateWith(RTG, { js: 5, trust: 0 });
  RTG.Schema.userTeam(cut).kicker2.ovr = Player.ovr(cut.player.attrs);
  const two = pfx.gameSummary([{ distance: 30, made: false }, { distance: 31, made: false }]);
  r = Player.updateJobSecurity(cut, two); assert.equal(r.lowWeeks, 1); assert.equal(r.cutWarning, false);
  r = Player.updateJobSecurity(cut, two); assert.equal(r.lowWeeks, 2); assert.equal(r.cutWarning, false);
  r = Player.updateJobSecurity(cut, two); assert.equal(r.lowWeeks, 3); assert.equal(r.cutWarning, true);
  // a decent week resets the counter
  cut.player.js = 40;
  r = Player.updateJobSecurity(cut, pfx.gameSummary([{ distance: 40, made: true }]));
  assert.equal(r.lowWeeks, 0);
  assert.equal(cut.player.flags.jsLowWeeks, undefined);
});

test('weeklyTick: 2 draws, form bounds, drifts, slump flag, injury countdown, week-mod expiry', (t) => {
  if (!hasData) { t.skip(dataNote); return; }
  const F = Tuning.progression.form;
  let state = pfx.stateWith(RTG, { morale: 20, trust: 60, fans: 50 });
  state.season.results = {};                                      // no team record → fans do not drift
  const rng = RTG.RNG.create(77);
  const s0 = rng.state();
  let r = Player.weeklyTick(state, rng);
  assert.equal(rng.state(), stateAfter(s0, 2));
  assert.equal(state.player.morale, 24);                          // 20 + (60 − 20)·0.1
  assert.equal(state.player.trust, 59);
  assert.equal(state.player.fans, 50);
  assert.equal(r.slump, false);
  state.player.trust = 40;
  Player.weeklyTick(state, rng);
  assert.equal(state.player.trust, 41);
  // form stays within ±6 and is not stuck at 0
  let moved = false;
  for (let i = 0; i < 300; i++) { Player.weeklyTick(state, rng); assert.ok(Math.abs(state.player.form) <= F.max); if (Math.abs(state.player.form) > 0.5) moved = true; }
  assert.ok(moved);
  // sleep-study routine drifts toward 65; moraleTarget mods add to the target
  state = pfx.stateWith(RTG, { morale: 60, flags: { sleepStudy: true } });
  state.season.results = {};
  Player.weeklyTick(state, rng);
  assert.equal(state.player.morale, 60.5);
  Player.addMod(state.player, { key: 'moraleTarget', op: 'add', value: 5 });
  Player.weeklyTick(state, rng);
  assert.equal(state.player.morale, Util.round1(60.5 + (70 - 60.5) * 0.1));
  // fans drift toward team win % · 100 by 10 %
  state = pfx.stateWith(RTG, { fans: 50 });
  state.season.results = {}; state.season.results[state.player.teamId] = { w: 4, l: 0, t: 0, pf: 0, pa: 0, confW: 0, confL: 0, divW: 0, divL: 0, h2h: {}, streak: 4 };
  Player.weeklyTick(state, rng);
  assert.equal(state.player.fans, 55);
  // slump: morale < 30 for 3 consecutive weeks → SLUMP; cleared at ≥ 45
  state = pfx.stateWith(RTG, { morale: 10 });
  state.season.results = {};
  Player.weeklyTick(state, rng); assert.equal(state.player.flags.SLUMP, undefined);
  Player.weeklyTick(state, rng); assert.equal(state.player.flags.SLUMP, undefined);
  r = Player.weeklyTick(state, rng); assert.equal(state.player.flags.SLUMP, true); assert.equal(r.slump, true);
  Player.weeklyTick(state, rng); assert.equal(state.player.flags.SLUMP, true);     // still under 45
  state.player.morale = 50;
  r = Player.weeklyTick(state, rng); assert.equal(state.player.flags.SLUMP, undefined); assert.equal(r.slump, false);
  // guilt flag: −2 morale per week for 3 weeks
  state = pfx.stateWith(RTG, { morale: 60, flags: { guilt: 3 } });
  state.season.results = {};
  Player.weeklyTick(state, rng); assert.equal(state.player.morale, 58); assert.equal(state.player.flags.guilt, 2);
  Player.weeklyTick(state, rng); Player.weeklyTick(state, rng);
  assert.equal(state.player.flags.guilt, undefined);
  Player.weeklyTick(state, rng); assert.ok(state.player.morale > 54);
  // injury countdown with js −3 / trust −2 per week
  state = pfx.stateWith(RTG, { js: 50, trust: 50, injury: { type: 'QUAD', weeksLeft: 2, careerThreat: false } });
  state.season.results = {};
  r = Player.weeklyTick(state, rng);
  assert.equal(state.player.injury.weeksLeft, 1);
  assert.equal(r.injuryCleared, false);
  r = Player.weeklyTick(state, rng);
  assert.equal(state.player.injury, null);
  assert.equal(r.injuryCleared, true);
  assert.equal(state.player.js, 44);                              // 50 − 3 − 3 (no drift on js)
  assert.equal(state.player.trust, 47);                           // (50 − 2) → drift +1 → 49 − 2
  // week mods expire at state.week
  state = pfx.stateWith(RTG, {});
  state.season.results = {};
  Player.addMod(state.player, { key: 'sigma', op: 'mul', value: 1.2, expires: { type: 'week', at: state.week } });
  Player.addMod(state.player, { key: 'sigma', op: 'mul', value: 1.3, expires: { type: 'week', at: state.week + 1 } });
  Player.addMod(state.player, { key: 'block', op: 'add', value: 0.02, expires: { type: 'game', at: 1 } });
  r = Player.weeklyTick(state, rng);
  assert.equal(r.expiredMods, 1);
  assert.equal(state.player.mods.length, 2);
  assert.equal(Player.modValue(state.player, 'sigma', 'mul'), 1.3);
  assert.equal(RTG.Schema.validate(state).ok, true);
});

test('applyTraining: focus XP = 20·moraleMult·coachMult·trainMult·xpMult, ACC/CON trust +2, REST morale +8', (t) => {
  if (!hasData) { t.skip(dataNote); return; }
  let state = pfx.stateWith(RTG, { morale: 60, trust: 50, xp: 0 });
  let r = Player.applyTraining(state, 'ACC');
  assert.equal(r.xp, Math.round(20 * (0.7 + 0.006 * 60)));
  assert.equal(r.xp, 21);
  assert.equal(state.player.xp, 21);
  assert.equal(state.player.trust, 52);
  assert.equal(state.season.focus, 'ACC');
  assert.equal(state.season.trainingDone, true);
  assert.equal(state.player.flags.rested, false);
  state = pfx.stateWith(RTG, { morale: 60, trust: 50 });
  r = Player.applyTraining(state, 'POW');
  assert.equal(state.player.trust, 50);
  assert.equal(r.xp, 21);
  state = pfx.stateWith(RTG, { morale: 60, flags: { coachStyle: 'WHISPERER' } });
  assert.equal(Player.applyTraining(state, 'CLU').xp, Math.round(20 * 1.06 * 1.15));
  state = pfx.stateWith(RTG, { morale: 60 });
  Player.addMod(state.player, { key: 'trainMult', op: 'mul', value: 0.7 });
  assert.equal(Player.applyTraining(state, 'KO').xp, Math.round(21.2 * 0.7));
  state = pfx.stateWith(RTG, { morale: 60, difficulty: 'legend' });
  assert.equal(Player.applyTraining(state, 'CON').xp, Math.round(21.2 * 0.8));
  state = pfx.stateWith(RTG, { morale: 60, xp: 5 });
  r = Player.applyTraining(state, 'REST');
  deq(r, { xp: 0, moraleDelta: 8, focus: 'REST' });
  assert.equal(state.player.morale, 68);
  assert.equal(state.player.xp, 5);
  assert.equal(state.player.flags.rested, true);
  assert.equal(state.season.focus, 'REST');
  assert.equal(Player.applyTraining(state, 'garbage').focus, 'REST');
  assert.ok(Math.abs(Player.moraleMult(100) - 1.3) < 1e-12);
});

test('applyKickMeters: trust / fans / morale / fame deltas per §2.2', (t) => {
  if (!hasData) { t.skip(dataNote); return; }
  const S = Tuning.soft;
  const fresh = (o) => pfx.stateWith(RTG, Object.assign({ trust: 50, fans: 50, morale: 50, fame: 100, makeStreak: 0 }, o || {}));
  const ctx = (o) => pfx.kickContext(RTG, Object.assign({ league: 'COLLEGE' }, o));
  const res = (o) => pfx.kickResult(o);
  // plain 42-yd make (prestige-3 school → marketMult 1)
  let state = fresh();
  let d = Player.applyKickMeters(state, ctx({ distance: 42 }), res({ distance: 42 }));
  deq(d, { trust: 2, fans: 1, morale: 0, fame: 4.2, js: 0 });
  assert.equal(state.player.trust, 52);
  assert.equal(state.player.fans, 51);
  assert.equal(state.player.fame, 104.2);
  // 52-yd decisive clutch make
  state = fresh();
  d = Player.applyKickMeters(state, ctx({ distance: 52, decisive: true, pressure: 0.9 }), res({ distance: 52, tags: ['decisive', 'clutch', 'fiftyPlus'] }));
  deq(d, { trust: S.trust.make50 + S.trust.decisiveMake, fans: S.fans.make + S.fans.decisiveMake, morale: S.morale.clutchMake, fame: 5.2 + S.fame.fifty + S.fame.decisiveMake, js: 0 });
  // misses by bucket
  state = fresh();
  deq(Player.applyKickMeters(state, ctx({ distance: 38 }), res({ outcome: 'WIDE_L', distance: 38 })), { trust: -4, fans: -3, morale: 0, fame: 0, js: 0 });
  state = fresh();
  assert.equal(Player.applyKickMeters(state, ctx({ distance: 45 }), res({ outcome: 'SHORT', distance: 45 })).trust, -3);
  state = fresh();
  assert.equal(Player.applyKickMeters(state, ctx({ distance: 55 }), res({ outcome: 'WIDE_R', distance: 55 })).trust, -1);
  state = fresh();
  assert.equal(Player.applyKickMeters(state, ctx({ distance: 45 }), res({ outcome: 'BLOCKED', distance: 45 })).trust, -6);
  // decisive miss under pressure
  state = fresh();
  d = Player.applyKickMeters(state, ctx({ distance: 45, decisive: true, pressure: 1 }), res({ outcome: 'WIDE_R', distance: 45 }));
  deq(d, { trust: -3 - 8, fans: -3 - 10, morale: -6, fame: 0, js: 0 });
  // PATs: neutral when made, a short miss when missed
  state = fresh();
  deq(Player.applyKickMeters(state, ctx({ type: 'PAT', distance: 20 }), res({ type: 'PAT', distance: 20 })), { trust: 0, fans: 0, morale: 0, fame: 0, js: 0 });
  state = fresh();
  deq(Player.applyKickMeters(state, ctx({ type: 'PAT', distance: 20 }), res({ type: 'PAT', outcome: 'WIDE_L', distance: 20 })), { trust: -4, fans: -3, morale: 0, fame: 0, js: 0 });
  // doink-in fans +3 (+2 with DOINK_KING)
  state = fresh();
  assert.equal(Player.applyKickMeters(state, ctx({ distance: 40 }), res({ outcome: 'DOINK_IN', distance: 40 })).fans, 1 + 3);
  state = fresh({ traits: ['DOINK_KING'] });
  assert.equal(Player.applyKickMeters(state, ctx({ distance: 40 }), res({ outcome: 'XBAR_IN', distance: 40 })).fans, 1 + 3 + 2);
  // make streak ≥ 5 → morale +2 (this make is the 5th)
  state = fresh({ makeStreak: 4 });
  assert.equal(Player.applyKickMeters(state, ctx({ distance: 30 }), res({ distance: 30 })).morale, 2);
  state = fresh({ makeStreak: 3 });
  assert.equal(Player.applyKickMeters(state, ctx({ distance: 30 }), res({ distance: 30 })).morale, 0);
  // market multipliers: prestige-5 college ×1.3; NFL big market ×1.2; ctx.marketMult overrides
  state = fresh();
  state.player.teamId = state.leagues.college.teams[0].id;           // prestige 5
  assert.equal(Player.marketMult(state), 1.3);
  assert.equal(Player.applyKickMeters(state, ctx({ distance: 40 }), res({ distance: 40 })).fame, Util.round1(4 * 1.3));
  const nfl = pfx.stateWith(RTG, { stage: 'NFL', fame: 100 });
  nfl.player.teamId = 'NYE';
  assert.equal(Player.marketMult(nfl), 1.2);
  nfl.player.teamId = 'BOS';                                       // Boston is a big market per §2.2's list
  assert.equal(Player.marketMult(nfl), 1.2);
  nfl.player.teamId = 'PIT';
  assert.equal(Player.marketMult(nfl), 1);
  assert.equal(Player.marketMult(nfl, { marketMult: 1.5 }), 1.5);
  // clamps
  state = fresh({ fame: 999, trust: 99, fans: 99 });
  Player.applyKickMeters(state, ctx({ distance: 55, decisive: true }), res({ distance: 55, tags: ['decisive'] }));
  assert.equal(state.player.fame, 1000);
  assert.equal(state.player.trust, 100);
  assert.equal(state.player.fans, 100);
  state = fresh({ trust: 2, fans: 1 });
  Player.applyKickMeters(state, ctx({ distance: 45, decisive: true }), res({ outcome: 'WIDE_L', distance: 45 }));
  assert.equal(state.player.trust, 0);
  assert.equal(state.player.fans, 0);
  // team result meters
  state = fresh();
  deq(Player.applyGameResultMeters(state, true), { morale: 3, fans: 2 });
  deq(Player.applyGameResultMeters(state, false), { morale: -2, fans: 0 });
  deq(Player.applyGameResultMeters(state, false, true), { morale: 0, fans: 0 });
  assert.equal(RTG.Schema.validate(state).ok, true);
});
