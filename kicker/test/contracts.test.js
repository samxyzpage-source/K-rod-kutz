/**
 * RTG.Contracts — AAV worked values, multipliers, rookie scale, guaranteed %, tag growth / second tag / max
 * two, extension eligibility, counter bounds, FA offer counts & withdrawal odds, cuts, earnings,
 * teamsNeedingK (§2.7.7, §5.1 "contracts").
 *   node kicker/test/contracts.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RTG = require('./load')();
const cfx = require('./fixtures/contract');
const Contracts = RTG.Contracts, Tuning = RTG.Tuning;
const C = Tuning.contracts;

/** Realm-agnostic deep copy (engine objects live in a vm context). */
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

/** RNG that first returns scripted uniforms (then real draws); counts draws. */
function scripted(values) {
  const r = counting(1);
  const real = r.next;
  let i = 0;
  r.next = () => (i < values.length ? (r.draws++, values[i++]) : real());
  return r;
}

// ───────────────────────────── AAV & multipliers ─────────────────────────────

test('AAV worked values at fame 0 / age ≤ 31 / marketMul 1 / Pro: 75 → 3.0, 85 → 5.1, 92 → 6.8, 99 → 8.0 (cap)', () => {
  const at = (ovr) => Contracts.aavFor(ovr, { age: 25, fame: 0, marketMul: 1, contractMult: 1, vetMin: C.vetMinStart });
  near(at(75), 3.0, 0.05, 'OVR 75');
  near(at(85), 5.1, 0.05, 'OVR 85');
  near(at(92), 6.8, 0.05, 'OVR 92');
  near(at(99), 8.0, 0.05, 'OVR 99');
  assert.equal(at(99), C.aav.max, 'cap is exact');
  assert.equal(Contracts.fameMul(0), C.aav.fameBase, 'fameMul at fame 0 is 0.92');
});

test('marketValue(state) reproduces the worked values through the state path (fame 0, 6 needy teams, Pro)', () => {
  const state = cfx.nflFinalYear(RTG, { needy: 6, player: { fame: 0, age: 25 } });
  assert.equal(Contracts.teamsNeedingK(state.leagues.nfl).length, 6);
  for (const [ovr, want] of [[75, 3.0], [85, 5.1], [92, 6.8], [99, 8.0]]) {
    const mv = Contracts.marketValue(state, { ovr });
    near(mv.aav, want, 0.05, 'OVR ' + ovr);
    assert.equal(mv.marketMul, 1);
    assert.equal(mv.ageMul, 1);
  }
  const mv = Contracts.marketValue(state);
  assert.equal(mv.ovr, RTG.Player.ovr(state.player.attrs));
  assert.ok(mv.years >= 1 && mv.years <= 5);
});

test('AAV never drops below the vet minimum and difficulty contractMult scales it', () => {
  const lo = Contracts.aavFor(40, { age: 40, fame: 0, marketMul: 0.9, vetMin: 1.3 });
  assert.equal(lo, 1.3);
  const pro = Contracts.aavFor(85, { age: 25, fame: 0, marketMul: 1, contractMult: Tuning.difficulty.pro.contractMult });
  const rookie = Contracts.aavFor(85, { age: 25, fame: 0, marketMul: 1, contractMult: Tuning.difficulty.rookie.contractMult });
  near(rookie / pro, Tuning.difficulty.rookie.contractMult, 1e-9, 'contractMult');
  const state = cfx.nflFinalYear(RTG, { needy: 6, player: { fame: 0, age: 25 } });
  state.difficulty = 'legend';
  near(Contracts.marketValue(state, { ovr: 85 }).aav, 5.14 * Tuning.difficulty.legend.contractMult, 0.06, 'legend');
});

test('age multiplier table: ≤31 1.00 · 32–34 0.90 · 35–37 0.75 · 38+ 0.55', () => {
  assert.equal(Contracts.ageMul(22), 1.0);
  assert.equal(Contracts.ageMul(31), 1.0);
  assert.equal(Contracts.ageMul(32), 0.9);
  assert.equal(Contracts.ageMul(34), 0.9);
  assert.equal(Contracts.ageMul(35), 0.75);
  assert.equal(Contracts.ageMul(37), 0.75);
  assert.equal(Contracts.ageMul(38), 0.55);
  assert.equal(Contracts.ageMul(45), 0.55);
});

test('fame multiplier 0.92 + 0.16·fame/1000 (clamped to the fame range)', () => {
  near(Contracts.fameMul(0), 0.92, 1e-9);
  near(Contracts.fameMul(500), 1.0, 1e-9);
  near(Contracts.fameMul(1000), 1.08, 1e-9);
  near(Contracts.fameMul(5000), 1.08, 1e-9, 'clamped');
});

test('market multiplier clamp(1 + 0.06·(needy − 6)/6, 0.90, 1.12)', () => {
  near(Contracts.marketMul(6), 1.0, 1e-9);
  near(Contracts.marketMul(0), 0.94, 1e-9);
  near(Contracts.marketMul(12), 1.06, 1e-9);
  assert.equal(Contracts.marketMul(32), 1.12, 'upper clamp');
  assert.equal(Contracts.marketMul(-100), 0.90, 'lower clamp');
});

test('a cut player carries marketMul ×0.8 (flags.cutFa) until he signs', () => {
  const state = cfx.nflFinalYear(RTG, { needy: 6, player: { fame: 0, age: 25 } });
  const base = Contracts.marketValue(state, { ovr: 85 }).aav;
  Contracts.applyCut(state, 'CUT');
  assert.equal(state.flags.cutFa, true);
  near(Contracts.marketValue(state, { ovr: 85 }).aav, base * C.cut.marketMul, 0.06, 'cut market');
  Contracts.sign(state, cfx.offer({ teamId: 'PIT' }));
  assert.equal(state.flags.cutFa, undefined);
});

// ───────────────────────────── rookie scale / gtd ─────────────────────────────

test('rookie scale by round (4 years) and the 3-year UDFA deal', () => {
  for (const round of [1, 3, 4, 5, 6, 7]) {
    const d = Contracts.rookieDeal(round, 5);
    assert.equal(d.type, 'ROOKIE');
    assert.equal(d.years, 4);
    assert.equal(d.aav, C.rookie.byRound[round].aav);
    assert.equal(d.gtdPct, C.rookie.byRound[round].gtd);
    assert.equal(d.round, round);
    assert.equal(d.yearIdx, 0);
    assert.equal(d.startYear, 5);
    near(d.signingBonus, RTG.Util.round1(C.signingBonusPct * d.aav * d.years), 1e-9, 'bonus');
  }
  assert.equal(Contracts.rookieDeal(1).aav, 2.2);
  assert.equal(Contracts.rookieDeal(1).gtdPct, 1.0);
  assert.equal(Contracts.rookieDeal(7).aav, 0.88);
  assert.equal(Contracts.rookieDeal(7).gtdPct, 0.10);
  const u = Contracts.rookieDeal('UDFA');
  assert.equal(u.type, 'UDFA');
  assert.equal(u.years, 3);
  assert.equal(u.aav, 0.8);
  assert.equal(u.gtdPct, 0);
  assert.equal(u.round, 0);
  assert.deepEqual(Contracts.rookieDeal(0).type, 'UDFA');
  assert.equal(Contracts.rookieDeal(2).round, 3, 'unlisted round 2 → the round-3 row');
});

test('guaranteed % = clamp(0.35 + 0.30·(OVR − 70)/30, 0.10, 0.80)', () => {
  near(Contracts.gtdPct(70), 0.35, 1e-9);
  near(Contracts.gtdPct(85), 0.50, 1e-9);
  near(Contracts.gtdPct(100), 0.65, 1e-9);
  assert.equal(Contracts.gtdPct(20), 0.10, 'floor');
  assert.equal(Contracts.gtdPct(200), 0.80, 'ceiling');
  const state = cfx.nflFinalYear(RTG, { needy: 6 });
  assert.equal(Contracts.marketValue(state, { ovr: 85 }).gtdPct, 0.5);
});

// ───────────────────────────── franchise tag ─────────────────────────────

test('tag value grows 5 %/yr from 6.0', () => {
  assert.equal(Contracts.tagValue({ year: 1 }), 6.0);
  assert.equal(Contracts.tagValue({ year: 2 }), 6.3);
  near(Contracts.tagValue({ year: 5 }), 6.0 * Math.pow(1.05, 4), 0.05);
  assert.equal(Contracts.tagValue({}), 6.0, 'missing year → year 1');
});

test('applyTag: eligibility rule, P 0.5 (1 draw), second consecutive tag ×1.2, morale −8, max two tags', () => {
  const eligible = () => cfx.nflFinalYear(RTG, { needy: 6, player: { attrs: { POW: 86, ACC: 88, CON: 84, CLU: 82, KO: 80 }, age: 28, fame: 200 } });
  let state = eligible();
  assert.ok(Contracts.marketValue(state).aav >= C.tag.aavMin, 'fixture AAV ≥ 4.5');
  assert.ok(Contracts.teamSatisfaction(state) >= C.extension.satisfaction.min);
  assert.equal(Contracts.tagEligible(state), true);

  // P(tag) over many seeds ≈ 0.5, exactly 1 draw each
  let tagged = 0;
  const base = eligible();
  for (let s = 0; s < 2000; s++) {
    state = JSON.parse(JSON.stringify(base)); RTG.Schema.reindex(state);
    const rng = counting(s);
    if (Contracts.applyTag(state, rng)) tagged++;
    assert.equal(rng.draws, 1);
  }
  near(tagged / 2000, C.tag.prob, 0.04, 'P(tag)');

  // a successful tag
  state = eligible();
  const morale = state.player.morale;
  assert.equal(Contracts.applyTag(state, scripted([0.1])), true);
  assert.equal(state.player.contract.type, 'TAG');
  assert.equal(state.player.contract.years, 1);
  assert.equal(state.player.contract.gtdPct, 1);
  assert.equal(state.player.contract.aav, Contracts.tagValue(state.leagues.nfl));
  assert.equal(state.player.tags, 1);
  assert.equal(state.player.morale, morale + C.tag.morale);
  assert.equal(state.player.teamId, 'BOS');
  assert.equal(state.history.contracts[state.history.contracts.length - 1].type, 'TAG');
  assert.ok(RTG.Schema.validate(state).ok, RTG.Schema.validate(state).errors.join('; '));

  // second consecutive tag ×1.2, then the maximum of two
  assert.equal(Contracts.applyTag(state, scripted([0.1])), true);
  near(state.player.contract.aav, Contracts.tagValue(state.leagues.nfl) * C.tag.secondMult, 0.05, 'second tag');
  assert.equal(state.player.tags, 2);
  const rng = counting(3);
  assert.equal(Contracts.applyTag(state, rng), false, 'max two tags');
  assert.equal(rng.draws, 0, 'ineligible → no draw');

  // ineligibility branches
  state = eligible(); state.player.age = C.tag.maxAge + 1;
  assert.equal(Contracts.tagEligible(state), false, 'age');
  state = eligible(); state.player.attrs = { POW: 60, ACC: 60, CON: 60, CLU: 60, KO: 60 };
  assert.equal(Contracts.tagEligible(state), false, 'AAV < 4.5');
  state = eligible(); state.player.trust = 10; state.player.fans = 10;
  assert.equal(Contracts.tagEligible(state), false, 'satisfaction');
});

// ───────────────────────────── extension ─────────────────────────────

test('teamSatisfaction = 0.5·FG% + 0.3·trust/100 + 0.2·fans/100 (falls back to the last season line)', () => {
  const state = cfx.nflFinalYear(RTG);
  const st = state.stats.season;
  near(Contracts.teamSatisfaction(state), 0.5 * st.fgm / st.fga + 0.3 * state.player.trust / 100 + 0.2 * state.player.fans / 100, 1e-9);
  state.stats.season = RTG.Schema.emptyKickerStats();
  const last = state.history.seasons[state.history.seasons.length - 1].stats;
  near(Contracts.teamSatisfaction(state), 0.5 * last.fgm / last.fga + 0.3 * state.player.trust / 100 + 0.2 * state.player.fans / 100, 1e-9, 'fallback');
});

test('extension eligibility: final year, satisfaction ≥ 0.72, js ≥ 50, NFL', () => {
  let state = cfx.nflFinalYear(RTG);
  assert.equal(Contracts.extensionEligible(state), true);
  const rng = counting(4);
  const d = Contracts.extensionOffer(state, rng);
  assert.ok(d && d.kind === 'EXTENSION');
  assert.equal(rng.draws, 2, 'exactly 2 draws');
  assert.deepEqual(J(d.options.map((o) => o.id)), ['ACCEPT', 'COUNTER', 'DECLINE']);
  d.options.forEach((o) => { assert.equal(typeof o.label, 'string'); assert.equal(typeof o.detail, 'string'); assert.ok(o.detail.length > 0); });
  const mv = Contracts.marketValue(state);
  const ages = C.extension.yearsByAge[0].years;
  assert.ok(d.payload.offer.years >= ages[0] && d.payload.offer.years <= ages[1], 'years by age ≤ 28');
  assert.ok(d.payload.offer.aav >= mv.aav * C.extension.aavRange[0] - 0.06 && d.payload.offer.aav <= mv.aav * C.extension.aavRange[1] + 0.06, 'aav = AAV·U(0.90, 1.05)');
  assert.equal(d.payload.offer.gtdPct, mv.gtdPct);
  assert.equal(d.payload.offer.teamId, state.player.teamId);

  state = cfx.nflFinalYear(RTG, { player: { js: 49 } });
  assert.equal(Contracts.extensionOffer(state, counting(1)), null, 'js < 50');
  state = cfx.nflFinalYear(RTG); state.player.contract.yearIdx = 1;
  assert.equal(Contracts.extensionOffer(state, counting(1)), null, 'not the final year');
  state = cfx.nflFinalYear(RTG, { player: { trust: 30, fans: 30 } });
  assert.ok(Contracts.teamSatisfaction(state) < C.extension.satisfaction.min);
  const r2 = counting(1);
  assert.equal(Contracts.extensionOffer(state, r2), null, 'satisfaction < 0.72');
  assert.equal(r2.draws, 0);
  state = cfx.nflFinalYear(RTG, { player: { age: 34 } });
  const d34 = Contracts.extensionOffer(state, counting(2));
  assert.ok(d34.payload.offer.years >= 1 && d34.payload.offer.years <= 2, '33+ → 1–2 years');
});

test('counter acceptance P = clamp(0.30 + 0.20·agentTier + 0.15·fame/1000 + 0.20·need01, 0.10, 0.90); 1 draw; stands p 0.5 on rejection', () => {
  const K = C.extension.counter;
  let state = cfx.nflFinalYear(RTG, { needy: 0, player: { agentTier: 0, fame: 0 } });
  near(Contracts.counterAcceptProb(state), K.base, 1e-9, 'floor case');
  state = cfx.nflFinalYear(RTG, { needy: 32, player: { agentTier: 2, fame: 1000 } });
  assert.equal(Contracts.counterAcceptProb(state), K.max, 'clamped to 0.90');
  for (let tier = 0; tier <= 2; tier++) {
    for (const fame of [0, 300, 1000]) {
      state = cfx.nflFinalYear(RTG, { needy: 6, player: { agentTier: tier, fame } });
      const p = Contracts.counterAcceptProb(state);
      assert.ok(p >= K.min && p <= K.max);
    }
  }
  state = cfx.nflFinalYear(RTG, { needy: 6, player: { agentTier: 1, fame: 200 } });
  const P = Contracts.counterAcceptProb(state);
  near(P, K.base + K.agentPer + K.famePer * 0.2 + K.needPer * 0.5, 1e-9, 'formula');

  const mk = () => Contracts.extensionOffer(state, RTG.RNG.create(7));
  let d = mk(), rng = scripted([P - 0.01]);
  let res = Contracts.counter(state, rng, d);
  assert.equal(rng.draws, 1);
  assert.equal(res.accepted, true);
  near(res.offer.aav, RTG.Util.round1(d.payload.offer.aav * (1 + K.aavBump)), 1e-9, '+10 % AAV');
  assert.equal(res.offer.years, d.payload.offer.years);
  assert.equal(d.payload.countered, true);

  d = mk(); res = Contracts.counter(state, scripted([P - 0.01]), d, 'YEARS');
  assert.equal(res.offer.years, d.payload.offer.years + K.yearBump, '+1 year');
  assert.equal(res.offer.aav, d.payload.offer.aav);

  d = mk(); res = Contracts.counter(state, scripted([P + 0.01]), d);
  assert.equal(res.accepted, false);
  assert.equal(res.stands, true, 'rejected: original stands');
  assert.deepEqual(J(res.offer), J(d.payload.offer));

  d = mk(); res = Contracts.counter(state, scripted([0.999]), d);
  assert.equal(res.accepted, false);
  assert.equal(res.stands, false, 'rejected: withdrawn');
  assert.equal(res.offer, null);

  // frequencies over many seeds: accept ≈ P; stands ≈ 0.5 of rejections
  let acc = 0, stands = 0, rej = 0;
  for (let s = 0; s < 4000; s++) {
    d = mk(); res = Contracts.counter(state, RTG.RNG.create(s), d);
    if (res.accepted) acc++; else { rej++; if (res.stands) stands++; }
  }
  near(acc / 4000, P, 0.03, 'accept rate');
  near(stands / rej, K.standsProb, 0.05, 'stands rate');
});

// ───────────────────────────── free agency ─────────────────────────────

test('FA offers: 1–4 offers from distinct needy teams, kind FREE_AGENCY, WAIT option, aav within U(0.85, 1.10)·capRoom', () => {
  const counts = {};
  const state = cfx.freeAgent(RTG, { needy: 12 });
  const mv = Contracts.marketValue(state);
  for (let s = 0; s < 300; s++) {
    const d = Contracts.generateOffers(state, RTG.RNG.create(s), 'FA');
    assert.equal(d.kind, 'FREE_AGENCY');
    const n = d.payload.offers.length;
    assert.ok(n >= C.fa.offersMin && n <= C.fa.offersMax, 'count ' + n);
    counts[n] = (counts[n] || 0) + 1;
    const ids = new Set(d.payload.offers.map((o) => o.teamId));
    assert.equal(ids.size, n, 'distinct teams');
    const needy = new Set(Contracts.teamsNeedingK(state.leagues.nfl).map((t) => t.id));
    d.payload.offers.forEach((o) => {
      assert.ok(needy.has(o.teamId), 'offer from a needy team');
      assert.equal(o.type, 'VET');
      assert.ok(o.years >= 1 && o.years <= 5);
      assert.ok(o.aav >= Math.max(mv.vetMin, mv.aav * C.fa.aavRange[0] * C.fa.capRoom.min - 0.06), 'aav floor ' + o.aav);
      assert.ok(o.aav <= mv.aav * C.fa.aavRange[1] * C.fa.capRoom.max + 0.06, 'aav ceiling ' + o.aav);
      assert.equal(typeof o.startsK1, 'boolean');
      assert.equal(typeof o.note, 'string');
    });
    const opt = d.options;
    assert.equal(opt[opt.length - 1].id, 'WAIT');
    opt.forEach((o) => { assert.equal(typeof o.label, 'string'); assert.equal(typeof o.detail, 'string'); });
    assert.ok(JSON.stringify(d).indexOf('undefined') < 0);
  }
  for (let n = C.fa.offersMin; n <= C.fa.offersMax; n++) assert.ok(counts[n] > 0, 'count ' + n + ' occurs');
});

test('hometown-region offers add a discount option (−8 % AAV, morale +10, fans +10) that sign() applies', () => {
  let found = false;
  for (let s = 0; s < 200 && !found; s++) {
    const state = cfx.freeAgent(RTG, { needy: 32 });          // every team needy → MW teams appear
    const d = Contracts.generateOffers(state, RTG.RNG.create(s), 'FA');
    const home = d.payload.offers.filter((o) => o.hometown);
    if (!home.length) continue;
    found = true;
    const variant = d.options.find((o) => o.id === home[0].id + '_HOME');
    assert.ok(variant, 'hometown variant option');
    assert.equal(variant.hometownDiscount, true);
    const team = RTG.Schema.teamIn(state.leagues.nfl, home[0].teamId);
    assert.equal(team.region, state.player.hometown.region);
    const offer = Contracts.offerFor(d, variant.id);
    assert.equal(offer.hometownDiscount, true);
    const morale = state.player.morale, fans = state.player.fans;
    Contracts.sign(state, offer);
    near(state.player.contract.aav, RTG.Util.round1(home[0].aav * (1 - C.fa.hometownDiscount)), 1e-9, 'discounted AAV');
    assert.equal(state.player.morale, Math.min(100, morale + C.fa.hometownMorale));
    assert.equal(state.player.fans, Math.min(100, fans + C.fa.hometownFans));
    assert.equal(state.player.teamId, home[0].teamId);
  }
  assert.ok(found, 'a hometown offer appeared within 200 seeds');
});

test('waitRound: each offer withdrawn with p 0.35, a new one appears with p 0.4', () => {
  let offers = 0, withdrawn = 0, newOnes = 0, trials = 0;
  const state = cfx.freeAgent(RTG, { needy: 20 });
  for (let s = 0; s < 3000; s++) {
    const d = Contracts.generateOffers(state, RTG.RNG.create(s), 'FA');
    const before = d.payload.offers.map((o) => o.teamId);
    const r = Contracts.waitRound(state, RTG.RNG.create(s + 100000), d);
    assert.equal(r, d, 'mutates and returns the decision');
    const after = r.payload.offers.map((o) => o.teamId);
    offers += before.length;
    withdrawn += before.filter((id) => after.indexOf(id) < 0).length;
    if (after.some((id) => before.indexOf(id) < 0)) newOnes++;
    trials++;
    assert.equal(r.payload.round, 2);
    r.payload.offers.forEach((o, i) => assert.equal(o.id, 'OFFER_' + i));
    assert.equal(r.options[r.options.length - 1].id, 'WAIT');
  }
  near(withdrawn / offers, C.fa.withdrawProb, 0.03, 'withdrawal rate');
  near(newOnes / trials, C.fa.newOfferProb, 0.03, 'new-offer rate');
});

test('UDFA invites 2–3 (kind UDFA, UDFA scale, no WAIT); MIN offers 0–2 at the vet minimum', () => {
  const seen = {};
  const state10 = cfx.freeAgent(RTG, { needy: 10 });
  for (let s = 0; s < 100; s++) {
    const state = state10;
    const d = Contracts.generateOffers(state, RTG.RNG.create(s), 'UDFA');
    assert.equal(d.kind, 'UDFA');
    const n = d.payload.offers.length;
    assert.ok(n >= Tuning.draft.udfaInvites[0] && n <= Tuning.draft.udfaInvites[1], 'invites ' + n);
    seen[n] = true;
    d.payload.offers.forEach((o) => { assert.equal(o.type, 'UDFA'); assert.equal(o.aav, C.rookie.udfa.aav); assert.equal(o.years, C.rookie.udfa.years); assert.equal(o.startsK1, false); });
    assert.ok(!d.options.some((o) => o.id === 'WAIT'));
    assert.equal(d.options.length, n);
  }
  assert.ok(seen[2] && seen[3]);
  const minSeen = {};
  for (let s = 0; s < 100; s++) {
    const state = state10;
    const d = Contracts.generateOffers(state, RTG.RNG.create(s), 'MIN');
    const n = d.payload.offers.length;
    assert.ok(n >= C.fa.minOffers[0] && n <= C.fa.minOffers[1]);
    minSeen[n] = true;
    d.payload.offers.forEach((o) => { assert.equal(o.type, 'MIN'); assert.equal(o.years, 1); assert.equal(o.aav, state.leagues.nfl.vetMin); });
    assert.equal(d.options[d.options.length - 1].id, 'WAIT');
  }
  assert.ok(minSeen[0] && minSeen[2]);
  // ring chase: top-5 teams by rating
  const state = cfx.freeAgent(RTG, { needy: 0 });
  const d = Contracts.generateOffers(state, RTG.RNG.create(2), 'MIN', { ringChase: true });
  const top = state.leagues.nfl.teams.slice().sort((a, b) => (b.OFF + b.DEF) - (a.OFF + a.DEF)).slice(0, C.retirement.ringChaseTopN).map((t) => t.id);
  d.payload.offers.forEach((o) => assert.ok(top.indexOf(o.teamId) >= 0, 'ring-chase team'));
});

test('generateOffers with no needy team and mode FA yields zero offers but a WAIT option', () => {
  const state = cfx.freeAgent(RTG, { needy: 0 });
  const d = Contracts.generateOffers(state, RTG.RNG.create(1), 'FA');
  assert.equal(d.payload.offers.length, 0);
  assert.deepEqual(J(d.options.map((o) => o.id)), ['WAIT']);
});

// ───────────────────────────── cuts ─────────────────────────────

test('cut rules: (FG% < 0.75 and OVR < 68) or js < 20; otherwise null', () => {
  const low = { POW: 60, ACC: 62, CON: 60, CLU: 58, KO: 60 };       // OVR ≈ 60
  let state = cfx.nflFinalYear(RTG, { player: { attrs: low, js: 60 } });
  state.stats.season.fga = 20; state.stats.season.fgm = 14;          // 70 %
  let r = Contracts.cutCheck(state, RTG.RNG.create(1));
  assert.ok(r && r.cut && r.reason === 'PERFORMANCE', 'performance cut');
  state.stats.season.fgm = 15;                                        // exactly 75 % → not below
  assert.equal(Contracts.cutCheck(state), null);
  state = cfx.nflFinalYear(RTG, { player: { js: 60 } });              // OVR 76
  state.stats.season.fga = 20; state.stats.season.fgm = 12;
  assert.equal(Contracts.cutCheck(state), null, 'bad % but OVR ≥ 68 survives');
  state = cfx.nflFinalYear(RTG, { player: { js: 19 } });
  r = Contracts.cutCheck(state);
  assert.ok(r && r.reason === 'JOB_SECURITY');
  state = cfx.nflFinalYear(RTG, { player: { js: 20 } });
  assert.equal(Contracts.cutCheck(state), null, 'js 20 is safe');
  state = cfx.nflFinalYear(RTG, { player: { attrs: low, js: 60 } });
  state.stats.season = RTG.Schema.emptyKickerStats();
  state.history.seasons = []; state.stats.career = RTG.Schema.emptyKickerStats();
  assert.equal(Contracts.cutCheck(state), null, 'no attempts → no performance cut');
  state = cfx.freeAgent(RTG);
  assert.equal(Contracts.cutCheck(state), null, 'no contract');
});

test('applyCut pays the unpaid guaranteed money as dead money, ends the contract and flags the market', () => {
  const state = cfx.nflFinalYear(RTG);
  state.player.contract = { type: 'VET', years: 4, yearIdx: 1, aav: 4.0, gtdPct: 0.5, signingBonus: 4.0, startYear: 8, paid: 5.0, paidThrough: 0 };
  state.history.contracts.push({ year: 8, league: 'NFL', teamId: 'BOS', type: 'VET', years: 4, aav: 4.0, total: 16, gtdPct: 0.5, signingBonus: 4.0, round: null, endYear: null, reason: 'SIGNED' });
  const earnings = state.history.earnings;
  const r = Contracts.applyCut(state, 'CUT');
  near(r.deadMoney, 16 * 0.5 - 5.0, 1e-9);
  near(state.history.earnings, earnings + r.deadMoney, 1e-9);
  assert.equal(state.player.contract, null);
  assert.equal(state.player.role, 'NONE');
  assert.equal(state.flags.cutFa, true);
  const rec = state.history.contracts[state.history.contracts.length - 1];
  assert.equal(rec.endYear, state.year);
  assert.equal(rec.reason, 'CUT');
  assert.ok(RTG.Schema.validate(state).ok, RTG.Schema.validate(state).errors.join('; '));
});

// ───────────────────────────── signing & earnings ─────────────────────────────

test('sign: sets player.contract, appends history.contracts, moves the player (no Career loaded → direct)', () => {
  const state = cfx.freeAgent(RTG);
  const nRec = state.history.contracts.length, nStints = state.history.teams.length;
  const c = Contracts.sign(state, cfx.offer({ teamId: 'PIT', years: 3, aav: 3.0, gtdPct: 0.4 }));
  assert.equal(state.player.contract, c);
  assert.equal(c.type, 'VET'); assert.equal(c.years, 3); assert.equal(c.aav, 3.0); assert.equal(c.yearIdx, 0);
  assert.equal(c.startYear, state.year);
  near(c.signingBonus, RTG.Util.round1(C.signingBonusPct * 9.0), 1e-9);
  assert.equal(state.history.contracts.length, nRec + 1);
  const rec = state.history.contracts[nRec];
  assert.equal(rec.teamId, 'PIT'); assert.equal(rec.total, 9.0); assert.equal(rec.endYear, null);
  if (!RTG.Career) {
    assert.equal(state.player.teamId, 'PIT');
    assert.equal(state.player.league, 'NFL');
    assert.equal(state.history.teams.length, nStints + 1);
    assert.equal(state.history.teams[nStints - 1].toYear, state.year, 'previous stint closed');
    assert.equal(state.player.trust, C.changeTeam.trust);
    assert.equal(state.player.js, C.changeTeam.js);
  }
  assert.equal(state.player.role, 'K1');
  assert.ok(RTG.Schema.validate(state).ok, RTG.Schema.validate(state).errors.join('; '));
  // K2 offers
  const s2 = cfx.freeAgent(RTG);
  Contracts.sign(s2, cfx.offer({ teamId: 'PIT', startsK1: false }));
  assert.equal(s2.player.role, 'K2');
  // rookie deal keeps the round
  const s3 = cfx.freeAgent(RTG);
  const deal = Object.assign(Contracts.rookieDeal(5, s3.year), { teamId: 'CLE' });
  Contracts.sign(s3, deal);
  assert.equal(s3.player.contract.round, 5);
  assert.equal(s3.player.contract.type, 'ROOKIE');
});

test('earnings accumulate: signing bonus in year 1 + salary each season, idempotent per contract year, NIL in college', () => {
  const state = cfx.freeAgent(RTG);
  state.history.earnings = 0;
  Contracts.sign(state, cfx.offer({ teamId: 'PIT', years: 4, aav: 4.0 }));
  const c = state.player.contract;
  const bonus = c.signingBonus, salary = RTG.Util.round1((16 - bonus) / 4);
  let out = Contracts.payoutSeason(state);
  near(out.bonus, bonus, 1e-9); near(out.salary, salary, 1e-9); near(out.total, bonus + salary, 1e-9);
  near(state.history.earnings, bonus + salary, 1e-9);
  out = Contracts.payoutSeason(state);
  assert.equal(out.total, 0, 'second call in the same year pays nothing');
  near(state.history.earnings, bonus + salary, 1e-9);
  for (let y = 1; y < 4; y++) { c.yearIdx = y; Contracts.payoutSeason(state); }
  near(state.history.earnings, 16, 0.2, 'whole contract paid over 4 seasons');
  near(c.paid, 16, 0.2);
  // college NIL: $k/yr → $M
  const col = require('./fixtures/schema').collegeRegWeek5(RTG);
  col.history.earnings = 0; col.player.nil = 40;
  out = Contracts.payoutSeason(col);
  near(out.nil, 0.04, 1e-9);
  near(col.history.earnings, 0.04, 1e-9);
  // no contract → nothing
  const fa = cfx.freeAgent(RTG); const e0 = fa.history.earnings;
  assert.equal(Contracts.payoutSeason(fa).total, 0); assert.equal(fa.history.earnings, e0);
});

// ───────────────────────────── need ─────────────────────────────

test('teamsNeedingK: age ≥ 34 or ovr < 72 or contractYears ≤ 1 (no kicker counts as need)', () => {
  const mk = (id, k) => ({ id, kicker: k });
  const league = { teams: [
    mk('A', { age: 34, ovr: 80, contractYears: 3 }),
    mk('B', { age: 28, ovr: 71, contractYears: 3 }),
    mk('C', { age: 28, ovr: 80, contractYears: 1 }),
    mk('D', { age: 33, ovr: 72, contractYears: 2 }),
    mk('E', null)
  ] };
  assert.deepEqual(J(Contracts.teamsNeedingK(league).map((t) => t.id)), ['A', 'B', 'C', 'E']);
  assert.deepEqual(J(Contracts.teamsNeedingK(null)), []);
  const state = cfx.nflFinalYear(RTG, { needy: 9 });
  assert.equal(Contracts.teamsNeedingK(state.leagues.nfl).length, 9);
});

test('every decision / contract this module produces is JSON-clean and the states still validate', () => {
  const state = cfx.nflFinalYear(RTG, { needy: 8 });
  const d = Contracts.extensionOffer(state, RTG.RNG.create(1));
  assert.ok(RTG.Util.deepEqual(JSON.parse(JSON.stringify(d)), d));
  const fa = cfx.freeAgent(RTG, { needy: 8 });
  const d2 = Contracts.generateOffers(fa, RTG.RNG.create(1), 'FA');
  assert.ok(RTG.Util.deepEqual(JSON.parse(JSON.stringify(d2)), d2));
  fa.pending = { kind: 'DECISION', decision: d2 };
  assert.ok(RTG.Schema.validate(fa).ok, RTG.Schema.validate(fa).errors.join('; '));
  Contracts.sign(fa, Contracts.offerFor(d2, d2.options[0].id));
  fa.pending = null;
  assert.ok(RTG.Schema.validate(fa).ok, RTG.Schema.validate(fa).errors.join('; '));
  assert.ok(RTG.Util.deepEqual(JSON.parse(JSON.stringify(fa.player.contract)), fa.player.contract));
});
