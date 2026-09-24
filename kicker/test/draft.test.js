/**
 * RTG.Draft — draftValue → round table boundaries, first-round shock 1 %, team selection by need, ticker,
 * UDFA invites, tryout branch, combine sessions & score clamp, projection bands (§2.7.5, §2.7.6, §5.1 "draft").
 *   node kicker/test/draft.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RTG = require('./load')();
const cfx = require('./fixtures/contract');
const Draft = RTG.Draft, Contracts = RTG.Contracts, Tuning = RTG.Tuning, Schema = RTG.Schema;
const D = Tuning.draft;

const J = (o) => JSON.parse(JSON.stringify(o));
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ': expected ' + b + ' ±' + tol + ', got ' + a);

/** RNG that counts its draws. */
function counting(seed) {
  const r = RTG.RNG.create(seed);
  const next = r.next.bind(r);
  r.draws = 0;
  r.next = () => { r.draws++; return next(); };
  return r;
}

/** Fresh copy of a state (fixture creation is slow; JSON copy + reindex is cheap). */
function copy(state) {
  const s = J(state);
  Schema.reindex(s);
  return s;
}

/** A prospect whose draftValue lands in a given band: set the combine score to hit `target`. */
function prospectAt(target, extra) {
  const state = cfx.draftProspect(RTG, extra);
  const base = Draft.draftValue(state);
  state.flags.combineScore = 0;
  state.flags.combineScore = target - base;   // combineScore is added linearly (tests may exceed ±8 on purpose)
  near(Draft.draftValue(state), target, 0.02, 'prospect at ' + target);
  return state;
}

// ───────────────────────────── value & rounds ─────────────────────────────

test('draftValue formula on the prospect fixture', () => {
  const state = cfx.draftProspect(RTG, { combineScore: 2 });
  const p = state.player, V = D.value;
  const ovr = RTG.Player.ovr(p.attrs);
  const team = Schema.teamIn(state.leagues.college, p.teamId);
  const want = (V.offset || 0) + V.ovrW * ovr + V.powW * p.attrs.POW + V.cluW * p.attrs.CLU + V.fameW * RTG.Player.fameTier(p.fame) * V.fameTierMult
    + V.fgW * (state.stats.college.fgm / state.stats.college.fga * 100 - V.fgAnchor) + 2 + D.offers.prestigeBumpPer * (team.prestige - D.offers.prestigeAnchor);
  near(Draft.draftValue(state), want, 0.01);
  // walk-on penalty only below OVR 70
  const w = cfx.draftProspect(RTG, { combineScore: 2 });
  w.player.flags.WALKON = true;
  near(Draft.draftValue(w), want, 0.01, 'OVR ≥ 70: no penalty');
  const w2 = cfx.draftProspect(RTG, { combineScore: 2, player: { attrs: { POW: 60, ACC: 60, CON: 60, CLU: 60, KO: 60 } } });
  const before = Draft.draftValue(w2);
  w2.player.flags.WALKON = true;
  near(Draft.draftValue(w2), before - V.walkonPenalty, 0.01, 'walk-on penalty');
  // no college attempts → FG term is 0
  const z = cfx.draftProspect(RTG, { fga: 0, fgm: 0 });
  z.stats.career = Schema.emptyKickerStats();
  const zWant = (V.offset || 0) + V.ovrW * ovr + V.powW * p.attrs.POW + V.cluW * p.attrs.CLU + V.fameW * RTG.Player.fameTier(p.fame) * V.fameTierMult
    + D.offers.prestigeBumpPer * (team.prestige - D.offers.prestigeAnchor);
  near(Draft.draftValue(z), zWant, 0.01, 'no attempts');
});

test('round table boundaries (§2.7.6)', () => {
  const r = (v) => Draft.roundFor(v);
  assert.equal(r(92).round, 3); assert.equal(r(92).shock, true); assert.equal(r(99).shock, true);
  assert.equal(r(91).round, 3); assert.equal(r(91).altRound, 4); assert.equal(r(91).roundProb, 0.4); assert.equal(r(91).shock, false);
  assert.equal(r(86).round, 3); assert.equal(r(86).altRound, 4);
  assert.equal(r(85).round, 4); assert.equal(r(85).altRound, null);
  assert.equal(r(80).round, 4);
  assert.equal(r(79).round, 5); assert.equal(r(75).round, 5);
  assert.equal(r(74).round, 6); assert.equal(r(70).round, 6);
  assert.equal(r(69).round, 7); assert.equal(r(66).round, 7);
  assert.equal(r(65).udfa, true); assert.equal(r(60).udfa, true); assert.equal(r(65.9).round, 8);
  assert.equal(r(59.9).undrafted, true); assert.equal(r(59.9).round, 9); assert.equal(r(0).undrafted, true);
  assert.equal(Draft.roundLabel(3), 'Round 3'); assert.equal(Draft.roundLabel(8), 'UDFA'); assert.equal(Draft.roundLabel(9), 'Undrafted');
});

test('run() lands in the table round for every band (and the 86–91 band splits 40/60 between rounds 3 and 4)', () => {
  const cases = [[85, 4], [80, 4], [79, 5], [75, 5], [74, 6], [70, 6], [69, 7], [66, 7]];
  for (const [v, round] of cases) {
    const base = prospectAt(v);
    for (let s = 0; s < 20; s++) {
      const state = copy(base);
      const res = Draft.run(state, RTG.RNG.create(s));
      assert.equal(res.undrafted, false);
      assert.equal(res.round, round, 'value ' + v);
      assert.equal(res.contract.type, 'ROOKIE');
      assert.equal(res.contract.round, round);
      assert.equal(res.contract.aav, Tuning.contracts.rookie.byRound[round].aav);
      assert.deepEqual(J(state.flags.draft), { round: round, pick: res.pick, teamId: res.teamId, value: Draft.draftValue(state), shock: false });
      assert.ok(Schema.validate(state).ok, Schema.validate(state).errors.join('; '));
    }
  }
  const base = prospectAt(88);          // run() only writes flags.draft (and fame on a shock, impossible here) → reuse the state
  let r3 = 0;
  for (let s = 0; s < 2000; s++) {
    const res = Draft.run(base, RTG.RNG.create(s));
    assert.ok(res.round === 3 || res.round === 4);
    if (res.round === 3) r3++;
  }
  near(r3 / 2000, D.rounds[1].roundProb, 0.03, 'round 3 share in the 86–91 band');
});

// Full 100k-trial check (±0.2 %) in balance mode (RTG_BALANCE=1); 5k trials (±0.5 %) otherwise — every run draws
// ~9 ticker names, which makes 100k full runs take ~60 s. Seeds are fixed, so either mode is deterministic.
const BALANCE = !!process.env.RTG_BALANCE;
test('first-round shock fires 1 % of the time at draftValue ≥ 92 (' + (BALANCE ? '100k trials ±0.2 %' : '5k trials ±0.5 %') + '), never below', () => {
  const base = prospectAt(93);
  const state = copy(base);
  const fame0 = state.player.fame;
  let shocks = 0;
  const N = BALANCE ? 100000 : 5000;
  for (let s = 0; s < N; s++) {
    state.player.fame = fame0;
    const res = Draft.run(state, RTG.RNG.create(s));
    if (res.firstRoundShock) {
      shocks++;
      assert.equal(res.round, 1);
      assert.ok(res.pick >= D.shock.pickMin && res.pick <= D.shock.pickMax, 'pick ' + res.pick);
      assert.equal(state.player.fame, Math.min(1000, fame0 + D.shock.fame), 'fame +150');
      assert.equal(res.contract.round, 1);
      assert.equal(res.contract.aav, Tuning.contracts.rookie.byRound[1].aav);
      assert.equal(res.teamId, state.leagues.nfl.teams[res.pick - 1].id, 'the team holding that pick');
    } else {
      assert.equal(res.round, 3);
      assert.equal(state.player.fame, fame0);
    }
  }
  near(shocks / N, D.shock.prob, BALANCE ? 0.002 : 0.005, 'shock rate');
  const low = prospectAt(90);
  for (let s = 0; s < 300; s++) assert.equal(Draft.run(copy(low), RTG.RNG.create(s)).firstRoundShock, false);
});

// ───────────────────────────── team selection ─────────────────────────────

test('team selection prefers needy teams in draft order; pick = (round − 1)·32 + position', () => {
  const base = prospectAt(77);        // round 5
  // exactly one needy team at data index 10 → always that team
  let state = copy(base);
  cfx.setNeedy(RTG, state, 0);
  const L = state.leagues.nfl;
  L.teams[10].kicker.ovr = 60;
  for (let s = 0; s < 30; s++) {
    const res = Draft.run(copy(state), RTG.RNG.create(s));
    assert.equal(res.teamId, L.teams[10].id);
    assert.equal(res.pick, 4 * 32 + 11);
    assert.equal(res.round, 5);
  }
  // needy teams at indices 4, 6, 9, 20: the pick is one of the needy teams within jitter of the first
  state = copy(base);
  cfx.setNeedy(RTG, state, 0);
  const needyIdx = [4, 6, 9, 20];
  needyIdx.forEach((i) => { state.leagues.nfl.teams[i].kicker.age = 36; });
  const seen = {};
  for (let s = 0; s < 200; s++) {
    const res = Draft.run(copy(state), RTG.RNG.create(s));
    const idx = state.leagues.nfl.teams.findIndex((t) => t.id === res.teamId);
    assert.ok(needyIdx.indexOf(idx) >= 0, 'needy team chosen (index ' + idx + ')');
    assert.ok(idx <= 4 + D.pickSlot.jitterMax, 'within jitter of the first needy team');
    assert.equal(res.pick, 4 * 32 + idx + 1);
    seen[idx] = true;
  }
  assert.ok(seen[4] && seen[6] && seen[9], 'jitter spreads across the nearby needy teams');
  assert.ok(!seen[20]);
  // no needy team → lowest kicker.ovr
  state = copy(base);
  cfx.setNeedy(RTG, state, 0);
  state.leagues.nfl.teams[17].kicker.ovr = 73;   // still not needy (≥ 72) but the weakest
  for (let s = 0; s < 20; s++) {
    const res = Draft.run(copy(state), RTG.RNG.create(s));
    assert.equal(res.teamId, state.leagues.nfl.teams[17].id);
    assert.equal(res.pick, 4 * 32 + 18);
  }
});

test('draft order: data order without an NFL season; Standings.draftOrder when one exists', (t) => {
  const state = cfx.draftProspect(RTG);
  assert.deepEqual(J(Draft.draftOrder(state)), J(state.leagues.nfl.teams.map((x) => x.id)));
  if (!RTG.Standings || typeof RTG.Standings.draftOrder !== 'function') { t.skip('RTG.Standings (E2) not loaded'); return; }
  const sfx = require('./fixtures/schema');
  const nfl = sfx.nflOff(RTG);
  const order = Draft.draftOrder(nfl, RTG.RNG.create(1));
  assert.equal(order.length, 32);
  assert.deepEqual(J(order), J(RTG.Standings.draftOrder(nfl.season, nfl.leagues.nfl, RTG.RNG.create(1))));
});

// ───────────────────────────── ticker ─────────────────────────────

test('ticker: before + 1 + after rows around the user pick, ascending, fictional names and weighted positions', () => {
  const base = prospectAt(82);       // round 4
  const posSet = new Set(D.positions.map((p) => p.pos));
  const posCount = {};
  let total = 0;
  for (let s = 0; s < 200; s++) {
    const res = Draft.run(copy(base), RTG.RNG.create(s));
    const tk = res.picksTicker;
    assert.equal(tk.length, D.ticker.before + 1 + D.ticker.after);
    for (let i = 1; i < tk.length; i++) assert.equal(tk[i].pick, tk[i - 1].pick + 1, 'consecutive picks');
    const user = tk.filter((r) => r.isUser);
    assert.equal(user.length, 1);
    assert.equal(user[0].pick, res.pick); assert.equal(user[0].teamId, res.teamId); assert.equal(user[0].pos, 'K'); assert.equal(user[0].round, res.round);
    assert.equal(user[0].name, base.player.name.full);
    tk.forEach((row) => {
      assert.equal(row.round, Math.floor((row.pick - 1) / 32) + 1);
      assert.equal(row.teamId, base.leagues.nfl.teams[(row.pick - 1) % 32].id);
      if (!row.isUser) {
        assert.ok(posSet.has(row.pos), 'position ' + row.pos);
        assert.equal(typeof row.name, 'string'); assert.ok(row.name.length > 2);
        posCount[row.pos] = (posCount[row.pos] || 0) + 1; total++;
      }
    });
  }
  const wTotal = D.positions.reduce((a, p) => a + p.w, 0);
  near((posCount.OL || 0) / total, 18 / wTotal, 0.05, 'OL share');
  near((posCount['K/P'] || 0) / total, 1 / wTotal, 0.02, 'K/P share');
});

test('run() is deterministic for a seed and JSON-clean', () => {
  const base = prospectAt(82);
  const a = Draft.run(copy(base), RTG.RNG.create(42));
  const b = Draft.run(copy(base), RTG.RNG.create(42));
  assert.deepEqual(J(a), J(b));
  assert.ok(RTG.Util.deepEqual(J(a), a));
});

// ───────────────────────────── UDFA / tryout ─────────────────────────────

test('UDFA band (60–65): undrafted with 2–3 camp invites (kind UDFA)', () => {
  const base = prospectAt(63);
  const seen = {};
  for (let s = 0; s < 60; s++) {
    const state = copy(base);
    const res = Draft.run(state, RTG.RNG.create(s));
    assert.equal(res.undrafted, true);
    assert.equal(res.tryout, false);
    assert.equal(res.invites.kind, 'UDFA');
    const n = res.invites.payload.offers.length;
    assert.ok(n >= D.udfaInvites[0] && n <= D.udfaInvites[1], 'invites ' + n);
    seen[n] = true;
    res.invites.payload.offers.forEach((o) => { assert.equal(o.type, 'UDFA'); assert.equal(o.years, Tuning.contracts.rookie.udfa.years); });
    assert.equal(state.flags.draft.round, 8);
    state.pending = { kind: 'DECISION', decision: res.invites };
    assert.ok(Schema.validate(state).ok, Schema.validate(state).errors.join('; '));
  }
  assert.ok(seen[2] && seen[3]);
});

test('below 60: undrafted → tryout branch; tryout session has 6 calm kicks; pass at ≥ 4 makes', () => {
  const state = prospectAt(55);
  const rng = counting(3);
  const res = Draft.run(state, rng);
  assert.deepEqual(J(res), { undrafted: true, invites: null, tryout: true, value: Draft.draftValue(state) });
  assert.equal(rng.draws, 0);
  const ses = Draft.tryout(state, rng);
  assert.equal(rng.draws, 0, 'tryout draws nothing');
  assert.equal(ses.kind, 'TRYOUT');
  assert.equal(ses.contexts.length, D.tryout.kicks);
  ses.contexts.forEach((c, i) => {
    assert.equal(c.type, 'FG'); assert.equal(c.distance, D.tryout.distances[i]); assert.equal(c.hash, 0);
    assert.equal(c.wind.speed, 0); assert.equal(c.isUser, true); near(c.pressure, D.tryout.pressure, 1e-9);
  });
  state.pending = { kind: 'KICKS', session: ses };
  assert.ok(Schema.validate(state).ok, Schema.validate(state).errors.join('; '));
  cfx.fillResults(ses, [1, 1, 1, 1, 0, 0]);
  assert.deepEqual(J(Draft.scoreTryout(ses)), { makes: 4, kicks: 6, passed: true });
  cfx.fillResults(ses, [1, 1, 1, 0, 0, 0]);
  assert.equal(Draft.scoreTryout(ses).passed, false);
});

// ───────────────────────────── combine ─────────────────────────────

test('combine session: ladder 45–65 (SAFE stops at 55), 5 × 40 from alternating hashes, one kickoff; 0 draws', () => {
  const state = cfx.draftProspect(RTG);
  const rng = counting(1);
  const ses = Draft.combineSession(state, rng);
  assert.equal(rng.draws, 0);
  assert.equal(ses.kind, 'COMBINE_LADDER');
  assert.equal(ses.plan, 'SHOW');
  assert.equal(ses.contexts.length, D.combine.ladder.length + D.combine.accKicks + 1);
  assert.deepEqual(J(ses.parts), { ladder: [0, 1, 2, 3, 4], acc: [5, 6, 7, 8, 9], ko: [10] });
  D.combine.ladder.forEach((d, i) => { assert.equal(ses.contexts[i].distance, d); assert.equal(ses.contexts[i].hash, 0); assert.equal(ses.contexts[i].combine, 'LADDER'); });
  for (let i = 0; i < D.combine.accKicks; i++) {
    const c = ses.contexts[D.combine.ladder.length + i];
    assert.equal(c.distance, D.combine.accDist); assert.equal(c.hash, i % 2 === 0 ? -1 : 1); assert.equal(c.combine, 'ACC');
    assert.equal(c.league, 'NFL');
  }
  const ko = ses.contexts[ses.contexts.length - 1];
  assert.equal(ko.type, 'KO'); assert.equal(ko.combine, 'KO');
  ses.contexts.forEach((c) => { assert.equal(c.wind.speed, 0); assert.equal(c.isUser, true); near(c.pressure, D.combine.pressure, 1e-9); });
  state.pending = { kind: 'KICKS', session: ses };
  assert.ok(Schema.validate(state).ok, Schema.validate(state).errors.join('; '));
  assert.ok(RTG.Util.deepEqual(J(ses), ses), 'JSON-clean');

  const safe = Draft.combineSession(cfx.draftProspect(RTG, { plan: 'SAFE' }), rng);
  assert.equal(safe.plan, 'SAFE');
  assert.deepEqual(J(safe.parts.ladder), [0, 1, 2]);
  assert.equal(safe.contexts[2].distance, D.combine.safeStop);
  assert.equal(safe.contexts.length, 3 + D.combine.accKicks + 1);
  assert.equal(Draft.combineSession(state, rng, { plan: 'SAFE' }).contexts.length, 9, 'opts.plan override');

  const part = Draft.combineSession(state, rng, { part: 'ACC' });
  assert.equal(part.kind, 'COMBINE_ACC'); assert.equal(part.contexts.length, D.combine.accKicks);
  assert.equal(Draft.combineSession(state, rng, { part: 'KO' }).kind, 'COMBINE_KO');
  assert.equal(Draft.combineSession(state, rng, { part: 'LADDER' }).contexts.length, D.combine.ladder.length);
});

test('combineScore = (ladder − 3)·2 + (acc − 3)·2 + (hang − 3.9)·5 clamped to ±8; ladder counts until the first miss', () => {
  const state = cfx.draftProspect(RTG);
  const mk = () => Draft.combineSession(state, null);
  let ses = cfx.fillResults(mk(), [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 4.5);
  assert.equal(Draft.scoreCombine(ses), D.combine.clamp, 'upper clamp');
  assert.deepEqual(J(Draft.combineBreakdown(ses)), { ladderMakes: 5, accMakes: 5, hang: 4.5, score: 8 });
  ses = cfx.fillResults(mk(), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 3.0);
  assert.equal(Draft.scoreCombine(ses), -D.combine.clamp, 'lower clamp');
  ses = cfx.fillResults(mk(), [1, 1, 1, 1, 0, 1, 1, 1, 0, 0, 0], 3.9);
  near(Draft.scoreCombine(ses), (4 - 3) * 2 + (3 - 3) * 2 + 0, 1e-9, 'neutral hang');
  ses = cfx.fillResults(mk(), [1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0], 4.1);
  const b = Draft.combineBreakdown(ses);
  assert.equal(b.ladderMakes, 1, 'rungs after a miss do not count');
  near(b.score, (1 - 3) * 2 + (5 - 3) * 2 + 0.2 * 5, 1e-6);
  // hang defaults to the anchor when the kickoff was not played; missing results are misses
  ses = mk(); ses.results = [{ made: true }, { made: true }, { made: true }];
  near(Draft.scoreCombine(ses), (3 - 3) * 2 + (0 - 3) * 2, 1e-9);
  // three part sessions score the same as one combined session
  const parts = ['LADDER', 'ACC', 'KO'].map((part) => Draft.combineSession(state, null, { part }));
  cfx.fillResults(parts[0], [1, 1, 1, 1, 0]); cfx.fillResults(parts[1], [1, 1, 1, 0, 0]); cfx.fillResults(parts[2], [0], 4.1);
  near(Draft.scoreCombine(parts), (4 - 3) * 2 + (3 - 3) * 2 + 0.2 * 5, 1e-6, 'part sessions');
  // SAFE plan caps the ladder contribution at 0
  const safe = cfx.fillResults(Draft.combineSession(state, null, { plan: 'SAFE' }), [1, 1, 1, 1, 1, 1, 1, 1, 0], 3.9);
  near(Draft.scoreCombine(safe), 0 + (5 - 3) * 2, 1e-9);
});

test('combineNextIdx skips the remaining ladder rungs after a miss and ends at −1', () => {
  const ses = Draft.combineSession(cfx.draftProspect(RTG), null);
  assert.equal(Draft.combineNextIdx(ses), 0);
  ses.results.push({ made: true });
  assert.equal(Draft.combineNextIdx(ses), 1);
  ses.results.push({ made: false });
  assert.equal(Draft.combineNextIdx(ses), 5, 'jumps to the accuracy set');
  assert.equal(ses.results.length, 5, 'skipped rungs recorded as null');
  assert.equal(ses.results[3], null);
  for (let i = 5; i < 11; i++) { assert.equal(Draft.combineNextIdx(ses), i); ses.results.push({ made: true, hang: 4.0 }); }
  assert.equal(Draft.combineNextIdx(ses), -1);
  assert.equal(Draft.combineBreakdown(ses).ladderMakes, 1);
});

// ───────────────────────────── projection ─────────────────────────────

test('projection: round ± 2 at agent tier 0, ± 1 at tiers 1–2; UDFA/undrafted as rounds 8/9', () => {
  let state = prospectAt(77);
  state.player.agentTier = 0;
  let pj = Draft.projection(state);
  assert.equal(pj.round, 5); assert.equal(pj.low, 3); assert.equal(pj.high, 7); assert.equal(pj.label, 'Round 3 – 7');
  state.player.agentTier = 1;
  pj = Draft.projection(state);
  assert.equal(pj.low, 4); assert.equal(pj.high, 6);
  state.player.agentTier = 2;
  pj = Draft.projection(state);
  assert.equal(pj.low, 4); assert.equal(pj.high, 6);
  state = prospectAt(88); state.player.agentTier = 2;
  assert.equal(Draft.projection(state).round, 4, '86–91 shows the likelier round');
  state = prospectAt(94); state.player.agentTier = 0;
  pj = Draft.projection(state);
  assert.equal(pj.round, 3); assert.equal(pj.low, 1); assert.equal(pj.high, 5);
  state = prospectAt(62);
  pj = Draft.projection(state);
  assert.equal(pj.round, 8); assert.equal(pj.udfa, true); assert.equal(pj.high, 9); assert.equal(pj.low, 6);
  state = prospectAt(50); state.player.agentTier = 2;
  pj = Draft.projection(state);
  assert.equal(pj.round, 9); assert.equal(pj.undrafted, true); assert.equal(pj.high, 9); assert.equal(pj.label, 'Round 8 – Undrafted'.replace('Round 8', 'UDFA'));
});
