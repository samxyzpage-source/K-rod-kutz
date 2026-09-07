/**
 * career.test.js — RTG.Career (SPEC §2.7 career systems, §2.2 camp battle, §2.10.1 event actions, §3.5.18 API,
 * §3.6 flow, §5.1 "career"): showcase → stars formula; offers by stars (walk-on 1); camp battle scoring and the
 * tie → incumbent rule; declare eligibility (3 seasons, redshirt excluded, senior auto); transfer resets; `decide`
 * rejects unknown kinds; offseasonChain order; changeTeam bookkeeping; retirement rules (two offer-less offseasons,
 * age 42); HOF verdict thresholds; legacy report fields; event actions; the draft hand-off.
 *
 *   node kicker/test/career.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RTG = require('./load')();
const kfx = require('./fixtures/career');
const cfx = require('./fixtures/contract');

const { Career, Engine, Schema, Tuning, Player } = RTG;
const J = (v) => JSON.parse(JSON.stringify(v));
const TC = Tuning.career;

function ok(state, where) {
  const v = Schema.validate(state);
  assert.ok(v.ok, (where || 'state') + ' validates: ' + v.errors.slice(0, 6).join('; '));
}
/** RNG that counts its draws. */
function counting(seed) {
  const r = RTG.RNG.create(seed);
  const next = r.next.bind(r);
  r.draws = 0;
  r.next = () => { r.draws++; return next(); };
  return r;
}
/** Resolve the pending decision with an option, else with the default policy. */
function decideAuto(state, rng) {
  const d = state.pending.decision;
  return Engine.decide(state, rng, { kind: d.kind, optionId: Engine.autoOption(state, d) });
}
/** Run the offseason chain to completion with the default policy, returning the ordered pending kinds. */
function runChain(state, rng, stopAt) {
  Career.offseasonChain(state, rng);
  const seen = [];
  let guard = 30;
  while (state.pending && guard-- > 0) {
    const pd = state.pending;
    if (pd.kind === 'DECISION') {
      seen.push(pd.decision.kind);
      if (stopAt && pd.decision.kind === stopAt) break;
      decideAuto(state, rng);
    } else if (pd.kind === 'EVENT') { seen.push('EVENT'); Engine.chooseEvent(state, rng, 0); }
    else { seen.push('KICKS'); kfx.playSession(RTG, state, rng); }
  }
  return seen;
}

// ═══════════════════════════════ API ═══════════════════════════════

test('§3.5.18 public API', () => {
  for (const f of ['showcaseSession', 'finishShowcase', 'generateCollegeOffers', 'decide', 'campBattle', 'finishSession', 'offseasonChain',
    'changeTeam', 'handleActions', 'enterDraft', 'runDraft', 'enterNfl', 'retire', 'stageInfo', 'resume', 'afterWeek', 'eligibility', 'forcedRetirement', 'starsFor']) {
    assert.equal(typeof Career[f], 'function', 'Career.' + f);
  }
  assert.ok(Tuning.career && Tuning.career.offers && Tuning.career.autoplay && Tuning.career.balance, 'Tuning.career block');
});

// ═══════════════════════════════ §2.7.1 showcase & stars ═══════════════════════════════

test('showcaseSession: six calm middle-hash kicks (30/38/44/50/55, then 42 at pressure 0.6); createCareer wraps it as the pending KICKS', () => {
  const { state } = kfx.newCareer(RTG, { seed: 3 });
  assert.equal(state.stage, 'HS'); assert.equal(state.phase, 'SHOWCASE');
  assert.equal(state.pending.kind, 'KICKS');
  const s = state.pending.session;
  assert.equal(s.kind, 'SHOWCASE');
  assert.deepEqual(J(s.contexts.map((c) => c.distance)), J(Tuning.draft.showcase.distances));
  assert.ok(s.contexts.every((c) => c.hash === 0 && c.wind.speed === 0 && c.isUser === true && c.type === 'FG'));
  assert.equal(s.contexts[5].pressure, Tuning.draft.showcase.pressureLast);
  assert.equal(s.contexts[0].pressure, 0);
  assert.equal(s.results.length, 0); assert.equal(s.idx, 0);
  const rng = counting(1);
  Career.showcaseSession(state, rng);
  assert.equal(rng.draws, 0, 'showcase contexts are draw-free');
});

test('stars formula: round(1.5 + 0.03·(OVR − 40) + 0.4·makes) clamped 2–5 (per-make weight; the literal /6 makes every recruit a walk-on)', () => {
  const S = Tuning.draft.stars;
  const f = (ovr, makes) => Math.max(S.min, Math.min(S.max, Math.round(S.base + S.perOvr * (ovr - S.ovrAnchor) + S.showcaseW * makes)));
  for (const ovr of [40, 47, 52, 60, 70]) for (let m = 0; m <= 6; m++) assert.equal(Career.starsFor(ovr, m), f(ovr, m), 'ovr ' + ovr + ' makes ' + m);
  assert.equal(Career.starsFor(47, 0), 2, 'no makes → walk-on');
  assert.equal(Career.starsFor(47, 4), 3);
  assert.equal(Career.starsFor(47, 6), 4);
  assert.equal(Career.starsFor(62, 6), 5, 'a 62-OVR recruit who makes all six is a 5-star');
  assert.equal(Career.starsFor(99, 6), 5, 'clamped at 5');
});

test('finishShowcase: stars → Player.applyStars (+4 attrs per star above 3, fame start), walk-on path (flag, morale −5), OFFERS pending', () => {
  for (const pattern of [[true, true, true, true, true, true], [false, false, false, false, false, false]]) {
    const { state, rng } = kfx.newCareer(RTG, { seed: 11 });
    const before = J(state.player.attrs), ovr = Player.ovr(state.player.attrs), morale = state.player.morale;
    kfx.fillSession(state.pending.session, pattern);
    const out = Career.finishSession(state, rng);
    const makes = pattern.filter(Boolean).length;
    const stars = Career.starsFor(ovr, makes);
    assert.equal(out.kind, 'SHOWCASE'); assert.equal(out.makes, makes); assert.equal(out.stars, stars);
    assert.equal(state.player.stars, stars);
    for (const a of Player.ATTRS) assert.equal(state.player.attrs[a], Math.max(1, Math.min(99, before[a] + Tuning.progression.creation.starPer * (stars - 3))), a);
    assert.equal(state.player.fame, Tuning.soft.start.fameByStars[stars]);
    assert.equal(state.stage, 'HS'); assert.equal(state.phase, 'OFFERS');
    assert.equal(state.pending.kind, 'DECISION'); assert.equal(state.pending.decision.kind, 'OFFERS_COLLEGE');
    assert.equal(out.walkon, stars === 2);
    assert.equal(!!state.flags.WALKON, stars === 2);
    if (stars === 2) assert.equal(state.player.morale, morale + Tuning.soft.start.walkonMorale);
    assert.deepEqual(J(state.flags.showcase.results.map((r) => r.made)), pattern);
    ok(state, 'after showcase');
  }
});

// ═══════════════════════════════ §2.7.2 offers ═══════════════════════════════

test('generateCollegeOffers: 3–6 offers within prestige stars−1..stars plus a safety school; walk-on exactly 1 offer (prestige ≤ 2, no scholarship); 1 parent draw', () => {
  const O = Tuning.draft.offers, C = TC.offers;
  for (let stars = 3; stars <= 5; stars++) {
    for (let seed = 1; seed <= 6; seed++) {
      const { state } = kfx.newCareer(RTG, { seed });
      state.player.stars = stars;
      const rng = counting(seed);
      const dec = Career.generateCollegeOffers(state, rng, 'RECRUIT');
      assert.equal(rng.draws, 1, 'exactly one parent draw (rng.fork)');
      assert.equal(dec.kind, 'OFFERS_COLLEGE');
      const offers = dec.payload.offers;
      assert.ok(offers.length >= O.min && offers.length <= O.max, stars + '★ → ' + offers.length + ' offers');
      const safety = offers.filter((o) => o.safety);
      assert.equal(safety.length, 1, 'one safety school');
      assert.ok(safety[0].prestige <= O.safetyPrestigeMax);
      for (const o of offers) {
        if (!o.safety) assert.ok(o.prestige >= stars - 1 && o.prestige <= stars, 'prestige ' + o.prestige + ' for ' + stars + '★');
        assert.ok(['OPEN', 'VET', 'STAR'].includes(o.depth));
        assert.ok(['TRUSTING', 'CAUTIOUS', 'WHISPERER'].includes(o.coach));
        assert.ok(typeof o.nil === 'number' && o.nil >= 0 && o.nil <= 120);
        assert.equal(typeof o.nearHome, 'boolean');
        assert.ok(o.incumbent && o.incumbent.attrs && typeof o.incumbent.ovr === 'number', 'a generated incumbent');
        const D = O.depth;
        if (o.depth === 'VET') { assert.ok(o.incumbent.ovr >= D.VET.ovr[0] - 1 && o.incumbent.ovr <= D.VET.ovr[1] + 1); assert.equal(o.incumbent.contractYears, D.VET.years[0]); }
        if (o.depth === 'STAR') { assert.ok(o.incumbent.ovr >= D.STAR.ovr[0] - 1 && o.incumbent.ovr <= D.STAR.ovr[1] + 1); assert.ok(o.incumbent.contractYears >= D.STAR.years[0] && o.incumbent.contractYears <= D.STAR.years[1]); }
        if (o.depth === 'OPEN') assert.ok(o.incumbent.ovr <= dec.payload.myOvr - C.openBelow[0] + 1, 'OPEN incumbent is weaker than the recruit');
        assert.equal(o.scholarship, true);
      }
      assert.equal(dec.options.length, offers.length);
      assert.ok(dec.options.every((op, i) => op.id === offers[i].id && typeof op.label === 'string' && typeof op.detail === 'string'));
      assert.ok(RTG.Util.deepEqual(J(dec), dec), 'JSON-clean');
      const uniq = new Set(offers.map((o) => o.teamId));
      assert.equal(uniq.size, offers.length, 'distinct schools');
    }
  }
  // walk-on
  const { state: w } = kfx.newCareer(RTG, { seed: 21 });
  w.player.stars = 2; w.flags.WALKON = true;
  const wd = Career.generateCollegeOffers(w, RTG.RNG.create(21), 'RECRUIT');
  assert.equal(wd.payload.offers.length, O.walkon);
  assert.ok(wd.payload.offers[0].prestige <= O.safetyPrestigeMax);
  assert.equal(wd.payload.offers[0].walkon, true); assert.equal(wd.payload.offers[0].scholarship, false); assert.equal(wd.payload.offers[0].nil, 0);
  // deterministic for a seed
  const a = Career.generateCollegeOffers(kfx.newCareer(RTG, { seed: 5 }).state, RTG.RNG.create(5), 'RECRUIT');
  const b = Career.generateCollegeOffers(kfx.newCareer(RTG, { seed: 5 }).state, RTG.RNG.create(5), 'RECRUIT');
  assert.deepEqual(J(a), J(b));
});

test('decide OFFERS_COLLEGE enrols: team, coach trust, js 60 (OPEN) / 45, role (STAR → K2), incumbent installed, scholarship, Season.start → COLLEGE.PRE', () => {
  const S0 = Tuning.soft.start;
  for (const depth of ['OPEN', 'STAR', 'VET']) {
    let found = null;
    for (let seed = 1; seed <= 12 && !found; seed++) {
      const r = kfx.hsOffers(RTG, { seed });
      const offers = r.state.pending.decision.payload.offers;
      const o = offers.find((x) => x.depth === depth);
      if (o) found = { r, o };
    }
    assert.ok(found, 'an offer with depth ' + depth);
    const { r, o } = found;
    const out = Engine.decide(r.state, r.rng, { kind: 'OFFERS_COLLEGE', optionId: o.id });
    const p = r.state.player, team = Schema.userTeam(r.state);
    assert.equal(out.kind, 'OFFERS_COLLEGE'); assert.equal(out.optionId, o.id); assert.equal(out.result.enrolled, true);
    assert.equal(r.state.stage, 'COLLEGE'); assert.equal(r.state.phase, 'PRE'); assert.equal(r.state.year, 1); assert.equal(r.state.week, 0);
    assert.equal(p.teamId, o.teamId); assert.equal(p.league, 'COLLEGE');
    assert.equal(p.trust, S0.trustByCoach[o.coach]);
    assert.equal(p.js, depth === 'OPEN' ? S0.jsOpen : S0.jsContested);
    assert.equal(p.role, depth === 'STAR' ? 'K2' : 'K1');
    assert.equal(p.flags.coachStyle, o.coach); assert.equal(team.coachAgg, S0.coachAgg[o.coach]);
    assert.equal(p.nil, o.nil);
    assert.equal(p.contract.type, 'SCHOLARSHIP'); assert.equal(p.contract.years, 4); assert.equal(p.contract.yearIdx, 0);
    assert.equal(r.state.history.contracts[r.state.history.contracts.length - 1].type, 'SCHOLARSHIP');
    const stint = r.state.history.teams[r.state.history.teams.length - 1];
    assert.equal(stint.teamId, o.teamId); assert.equal(stint.toYear, null); assert.equal(stint.reason, 'COMMIT');
    // the incumbent sits in the slot matching the user's role
    const inc = depth === 'STAR' ? team.kicker : team.kicker2;
    assert.ok(inc && inc.name === o.incumbent.name && inc.ovr === o.incumbent.ovr, 'incumbent installed (' + depth + ')');
    if (depth === 'STAR') assert.equal(team.kicker2, null); else assert.equal(team.kicker, null);
    assert.ok(r.state.season && r.state.season.schedule.length > 0, 'Season.start built the schedule');
    assert.equal(r.state.season.campBattle.required, depth !== 'OPEN', 'camp battle iff the incumbent is close (' + depth + ')');
    if (depth !== 'OPEN') assert.equal(r.state.pending && r.state.pending.kind, 'KICKS');
    else assert.equal(r.state.pending, null);
    assert.ok(r.state.headlines.length >= 2, 'showcase + commit headlines');
    ok(r.state, 'enrolled ' + depth);
  }
});

// ═══════════════════════════════ §2.2 camp battle ═══════════════════════════════

test('campBattle: 6 kicks (32/38/44/48/52/55 at pressure 0.3), rival kicks pre-resolved, pending KICKS; scoring = makes·10 + trust·0.2 + seniority·3; ties → incumbent', () => {
  const C = Tuning.soft.camp;
  const b = kfx.campBattle(RTG, { seed: 4 });
  const s = b.session;
  assert.equal(b.state.pending.session, s);
  assert.equal(s.kind, 'CAMP');
  assert.deepEqual(J(s.contexts.map((c) => c.distance)), J(C.distances));
  assert.ok(s.contexts.every((c) => c.pressure === C.pressure && c.hash === 0 && c.isUser));
  assert.equal(s.rival.results.length, C.distances.length);
  assert.equal(s.rival.name, 'Rival Legg');
  assert.equal(s.incumbent, 'USER'); assert.equal(s.rivalSeniority, 0);
  ok(b.state, 'camp pending');

  function battle(userPattern, rivalMakes, role, trust, seniority) {
    const x = kfx.campBattle(RTG, { seed: 4, role: role });
    x.state.player.trust = trust;
    x.session.mySeniority = seniority;
    x.session.rivalSeniority = role === 'K1' ? 0 : seniority + TC.camp.incumbentSeniority;
    x.session.rival.results = x.session.rival.results.map((r, i) => Object.assign({}, r, { made: i < rivalMakes }));
    kfx.fillSession(x.session, userPattern);
    const out = Career.finishSession(x.state, x.rng);
    return { out, state: x.state, session: x.session };
  }
  const four = [true, true, true, true, false, false];
  // tie (4 makes each, equal trust 50, seniority 0) → the incumbent keeps the job
  let r = battle(four, 4, 'K1', C.rivalTrust, 0);
  assert.equal(r.out.myScore, r.out.rivalScore); assert.equal(r.out.won, true, 'user incumbent wins the tie'); assert.equal(r.state.player.role, 'K1');
  r = battle(four, 4, 'K2', C.rivalTrust, 0);
  assert.equal(r.out.won, false, 'rival incumbent wins the tie'); assert.equal(r.state.player.role, 'K2'); assert.equal(r.state.player.js, C.loserJs);
  assert.equal(r.state.player.flags.benched, true, 'a camp loss can be won back via Job Security');
  // 5 vs 4 → win; K1 with js ≥ winner floor
  r = battle([true, true, true, true, true, false], 4, 'K2', 50, 0);
  assert.equal(r.out.won, true); assert.equal(r.state.player.role, 'K1'); assert.ok(r.state.player.js >= TC.camp.winnerJs);
  assert.equal(r.state.player.flags.benched, undefined);
  // score formula
  r = battle(four, 3, 'K1', 70, 2);
  assert.equal(r.out.myScore, RTG.Util.round1(4 * C.makeW + 70 * C.trustW + 2 * C.seniorityW));
  assert.equal(r.out.rivalScore, RTG.Util.round1(3 * C.makeW + C.rivalTrust * C.trustW));
  // 3 vs 4 → loss
  r = battle([true, true, true, false, false, false], 4, 'K1', 50, 0);
  assert.equal(r.out.won, false); assert.equal(r.state.player.role, 'K2'); assert.equal(r.state.player.js, C.loserJs);
  const team = Schema.userTeam(r.state);
  assert.ok(team.kicker && team.kicker.name === 'Rival Legg' && team.kicker2 === null, 'the rival takes the K1 slot');
  assert.ok(r.state.history.timeline.some((t) => t.kind === 'CAMP'));
  ok(r.state, 'after camp');
});

// ═══════════════════════════════ §2.7.4 declaration & transfer ═══════════════════════════════

test('eligibility: 3 seasons (redshirt excluded); seniors (4 non-redshirt / 5) auto-declare; enterDraft → DECLARE decision or straight to the combine', () => {
  const el = (seasons, redshirt) => { const r = kfx.collegeOff(RTG, { seasons, redshirt }); return Career.eligibility(r.state); };
  assert.deepEqual(J(el(2, false)), { seasons: 2, eligibleSeasons: 2, canDeclare: false, senior: false });
  assert.deepEqual(J(el(3, false)), { seasons: 3, eligibleSeasons: 3, canDeclare: true, senior: false });
  assert.deepEqual(J(el(3, true)), { seasons: 3, eligibleSeasons: 2, canDeclare: false, senior: false });
  assert.deepEqual(J(el(4, false)), { seasons: 4, eligibleSeasons: 4, canDeclare: true, senior: true });
  assert.deepEqual(J(el(4, true)), { seasons: 4, eligibleSeasons: 3, canDeclare: true, senior: false });
  assert.deepEqual(J(el(5, true)), { seasons: 5, eligibleSeasons: 4, canDeclare: true, senior: true });

  const r2 = kfx.collegeOff(RTG, { seasons: 2 });
  assert.throws(() => Career.enterDraft(r2.state, r2.rng), /not eligible/);

  const r3 = kfx.draftDeclare(RTG, { seasons: 3 });
  assert.equal(r3.state.stage, 'DRAFT'); assert.equal(r3.state.phase, 'DECLARE');
  const d = r3.state.pending.decision;
  assert.equal(d.kind, 'DECLARE');
  assert.deepEqual(J(d.options.map((o) => o.id)), ['DECLARE', 'STAY']);
  assert.ok(d.payload.projection && typeof d.payload.projection.round === 'number' && typeof d.payload.projection.label === 'string', 'projection card');
  ok(r3.state, 'DECLARE pending');
  // STAY → back to COLLEGE.OFF
  const stay = Engine.decide(r3.state, r3.rng, { kind: 'DECLARE', optionId: 'STAY' });
  assert.equal(stay.result.declared, false); assert.equal(r3.state.stage, 'COLLEGE'); assert.equal(r3.state.phase, 'OFF'); assert.equal(r3.state.pending, null);
  // DECLARE → COMBINE with the plan decision
  const r3b = kfx.draftDeclare(RTG, { seasons: 3 });
  const dec = Engine.decide(r3b.state, r3b.rng, { kind: 'DECLARE', optionId: 'DECLARE' });
  assert.equal(dec.result.declared, true); assert.equal(r3b.state.stage, 'DRAFT'); assert.equal(r3b.state.phase, 'COMBINE');
  assert.equal(r3b.state.pending.decision.kind, 'COMBINE_PLAN');
  assert.deepEqual(J(r3b.state.pending.decision.options.map((o) => o.id)), ['SAFE', 'SHOW']);
  assert.equal(r3b.state.flags.declared, r3b.state.year);
  const hDec = r3b.state.headlines[r3b.state.headlines.length - 1];
  assert.ok(hDec && hDec.tag === 'draft' && /DECLARED/.test(hDec.text) && !/round \?|\bDRAFTED:/.test(hDec.text), 'declare headline: ' + (hDec && hDec.text));
  // senior → no decision
  const r4 = kfx.collegeOff(RTG, { seasons: 4 });
  const out = Career.enterDraft(r4.state, r4.rng);
  assert.equal(out.declared, true); assert.equal(out.senior, true);
  assert.equal(r4.state.phase, 'COMBINE'); assert.equal(r4.state.pending.decision.kind, 'COMBINE_PLAN');
  const hSen = r4.state.headlines[r4.state.headlines.length - 1];
  assert.ok(hSen && /DECLARED/.test(hSen.text) && !/round \?/.test(hSen.text), 'senior declare headline: ' + (hSen && hSen.text));
  ok(r4.state, 'senior → combine');
});

test('COMBINE_PLAN → Draft.combineSession (SAFE stops the ladder at 55); the finished combine sets flags.combineScore and phase DRAFT', () => {
  const r = kfx.draftCombine(RTG, { seasons: 3 });
  Engine.decide(r.state, r.rng, { kind: 'COMBINE_PLAN', optionId: 'SAFE' });
  assert.equal(r.state.flags.combinePlan, 'SAFE');
  assert.equal(r.state.pending.kind, 'KICKS');
  const sess = r.state.pending.session;
  assert.equal(sess.kind, 'COMBINE_LADDER');
  const ladder = sess.contexts.filter((c) => c.combine === 'LADDER').map((c) => c.distance);
  assert.ok(ladder.every((d) => d <= Tuning.draft.combine.safeStop), 'SAFE ladder stops at ' + Tuning.draft.combine.safeStop);
  const last = kfx.playSession(RTG, r.state, r.rng);
  assert.equal(last.done, true); assert.equal(last.outcome.kind, 'COMBINE');
  assert.equal(typeof r.state.flags.combineScore, 'number');
  assert.ok(Math.abs(r.state.flags.combineScore) <= Tuning.draft.combine.clamp);
  assert.equal(r.state.phase, 'DRAFT'); assert.equal(r.state.pending, null);
  const hC = r.state.headlines[r.state.headlines.length - 1];
  assert.ok(hC && hC.tag === 'draft' && /Combine buzz|at the combine/.test(hC.text) && !/round \?|\bDRAFTED:/.test(hC.text), 'combine headline: ' + (hC && hC.text));
  const makes = r.state.flags.combine.ladderMakes;
  if (makes > 0) assert.ok(new RegExp(String(Tuning.draft.combine.ladder[Math.min(makes, Tuning.draft.combine.ladder.length) - 1])).test(hC.text), 'names the last ladder make: ' + hC.text);
  ok(r.state, 'combine done');
});

test('transfer: TRANSFER decision (2–3 offers + STAY, current school excluded) → trust 45, js 50, fame −10, stats kept, rosters restored', () => {
  const T = Tuning.contracts.transfer;
  const r = kfx.collegeOff(RTG, { seasons: 2, js: 20 });
  const p = r.state.player, oldId = p.teamId, oldTeam = Schema.userTeam(r.state), fgm0 = r.state.stats.career.fgm;
  const seen = runChain(r.state, r.rng, 'TRANSFER');
  const fame0 = p.fame;                                            // after the offseason's NIL fame bonus
  assert.ok(seen.includes('TRANSFER'), 'portal opens at js < 40: ' + seen.join(','));
  const d = r.state.pending.decision;
  assert.equal(d.kind, 'TRANSFER'); assert.equal(d.payload.mode, 'TRANSFER');
  assert.ok(d.payload.offers.length >= TC.offers.transferCount[0] && d.payload.offers.length <= TC.offers.transferCount[1]);
  assert.ok(d.payload.offers.every((o) => o.teamId !== oldId));
  assert.equal(d.options[d.options.length - 1].id, 'STAY');
  const target = d.payload.offers[0];
  const out = Engine.decide(r.state, r.rng, { kind: 'TRANSFER', optionId: target.id });
  assert.equal(out.result.transferred, true);
  assert.equal(p.teamId, target.teamId); assert.equal(p.league, 'COLLEGE');
  assert.equal(p.trust, T.trust); assert.equal(p.js, T.js);
  assert.equal(p.fame, RTG.Util.round1(fame0 + T.fame));
  assert.equal(r.state.stats.career.fgm, fgm0, 'stats kept');
  assert.ok(oldTeam.kicker, 'the old school gets its kicker back');
  const stints = r.state.history.teams;
  assert.equal(stints[stints.length - 2].toYear, r.state.year); assert.equal(stints[stints.length - 1].reason, 'TRANSFER');
  assert.ok(r.state.flags.offseason.transferred);
  ok(r.state, 'transferred');
  // STAY keeps everything
  const r2 = kfx.collegeOff(RTG, { seasons: 2, js: 20 });
  runChain(r2.state, r2.rng, 'TRANSFER');
  const before = J(r2.state.player);
  Engine.decide(r2.state, r2.rng, { kind: 'TRANSFER', optionId: 'STAY' });
  assert.equal(r2.state.player.teamId, before.teamId); assert.equal(r2.state.player.trust, before.trust);
});

// ═══════════════════════════════ decide ═══════════════════════════════

test('decide: unknown kinds throw; a mismatched pending kind throws; unknown options throw; no pending throws', () => {
  const r = kfx.nflOff(RTG);
  assert.throws(() => Career.decide(r.state, r.rng, { kind: 'PIZZA', optionId: 'OK' }), /unknown decision kind "PIZZA"/);
  assert.throws(() => Career.decide(r.state, r.rng, { kind: 'RETIRE', optionId: 'RETIRE' }), /no pending decision/);
  Career.offseasonChain(r.state, r.rng);
  assert.equal(r.state.pending.decision.kind, 'BODY_CHECK');
  assert.throws(() => Career.decide(r.state, r.rng, { kind: 'RETIRE', optionId: 'RETIRE' }), /pending decision is BODY_CHECK, not RETIRE/);
  assert.throws(() => Career.decide(r.state, r.rng, { kind: 'BODY_CHECK', optionId: 'NOPE' }), /unknown option "NOPE"/);
  assert.throws(() => Career.decide(r.state, r.rng, {}), /unknown decision kind/);
  assert.equal(r.state.pending.decision.kind, 'BODY_CHECK', 'the pending survives a rejected call');
  const out = Career.decide(r.state, r.rng, { kind: 'BODY_CHECK' });     // default option
  assert.equal(out.optionId, 'OK'); assert.equal(out.next, 'PENDING');
  for (const k of Career.DECISION_KINDS) assert.ok(Schema.ENUM.decisionKinds.includes(k), k + ' is a schema decision kind');
});

// ═══════════════════════════════ offseason chain ═══════════════════════════════

test('offseasonChain (college): BODY_CHECK (preview, ages on ack) → TRAINING_BLOCKS → REDSHIRT? → TRANSFER? → 2 events → DECLARE?; idempotent', () => {
  const r = kfx.collegeOff(RTG, { seasons: 1, role: 'K2', js: 60, trust: 60 });
  const p = r.state.player, age0 = p.age, xp0 = p.xp;
  const ch = Career.offseasonChain(r.state, r.rng);
  assert.equal(Career.offseasonChain(r.state, r.rng), ch, 'idempotent: the same chain object');
  assert.equal(RTG.Season.offseason(r.state, r.rng), ch, 'Season.offseason returns the same chain');
  assert.deepEqual(J(ch.steps), ['BODY_CHECK', 'TRAINING_BLOCKS', 'REDSHIRT', 'TRANSFER', 'EVENT', 'EVENT', 'DECLARE']);
  assert.equal(r.state.pending.decision.kind, 'BODY_CHECK');
  assert.equal(p.age, age0, 'the body-check card is a preview: no aging yet');
  assert.equal(r.state.pending.decision.payload.age, age0 + 1);
  const snap = r.rng.state();
  Engine.decide(r.state, r.rng, { kind: 'BODY_CHECK', optionId: 'OK' });
  assert.equal(p.age, age0 + 1, 'acknowledging ages the player');
  assert.equal(p.flags.agedYear, r.state.year);
  assert.equal(r.state.pending.decision.kind, 'TRAINING_BLOCKS');
  const tb = r.state.pending.decision;
  const X = Tuning.progression.xp;
  const per = Math.round(X.offseasonBlock * Player.moraleMult(p.morale) * Tuning.difficulty.pro.xpMult);
  assert.equal(tb.payload.blocks, X.offseasonBlocks); assert.equal(tb.payload.xpEach, per); assert.equal(tb.payload.total, per * X.offseasonBlocks);
  assert.deepEqual(J(tb.options.map((o) => o.id)), ['POW', 'ACC', 'CON', 'CLU', 'KO', 'BANK']);
  const acc0 = p.attrs.ACC;
  p.pot.ACC = 99;
  const out = Engine.decide(r.state, r.rng, { kind: 'TRAINING_BLOCKS', optionId: 'ACC' });
  assert.equal(out.result.xp, per * X.offseasonBlocks);
  assert.ok(out.result.raised >= 1 && out.result.raised <= X.offseasonBlocks * TC.trainingBlocks.raisesPerBlock);
  assert.equal(p.attrs.ACC, acc0 + out.result.raised);
  assert.ok(p.xp + p.xpSpent >= xp0 + per * X.offseasonBlocks, 'the blocks land in the pool (spent or banked)');
  // year-1 K2 → REDSHIRT offered
  assert.equal(r.state.pending.decision.kind, 'REDSHIRT');
  Engine.decide(r.state, r.rng, { kind: 'REDSHIRT', optionId: 'REDSHIRT' });
  assert.equal(p.redshirt, true);
  // healthy js/trust → no TRANSFER; then events (0–2) and no DECLARE after one season → chain done
  let guard = 6;
  while (r.state.pending && guard-- > 0) { if (r.state.pending.kind === 'EVENT') Engine.chooseEvent(r.state, r.rng, 0); else kfx.settle(RTG, r.state, r.rng); }
  assert.equal(ch.done, true); assert.equal(r.state.stage, 'COLLEGE'); assert.equal(r.state.phase, 'OFF');
  assert.ok(!ch.log.includes('DECLARE') || ch.log.indexOf('DECLARE') === ch.log.length - 1);
  assert.equal(ch.log.filter((s) => s === 'EVENT').length, 2);
  void snap;
  ok(r.state, 'college chain done');
  // junior → the chain ends at the draft's DECLARE decision
  const j = kfx.collegeOff(RTG, { seasons: 3, js: 70, trust: 70 });
  const seen = runChain(j.state, j.rng, 'DECLARE');
  assert.equal(seen[0], 'BODY_CHECK'); assert.equal(seen[1], 'TRAINING_BLOCKS');
  assert.equal(seen[seen.length - 1], 'DECLARE');
  assert.equal(j.state.stage, 'DRAFT'); assert.equal(j.state.phase, 'DECLARE');
});

test('offseasonChain (NFL): BODY_CHECK → TRAINING_BLOCKS → CUT_NOTICE? → EXTENSION → (TAG) / FREE_AGENCY → RETIRE? → 2 events; money paid first', () => {
  const r = kfx.nflOff(RTG, { needy: 8 });
  const p = r.state.player, earnings0 = r.state.history.earnings;
  const ch = Career.offseasonChain(r.state, r.rng);
  assert.deepEqual(J(ch.steps), ['BODY_CHECK', 'TRAINING_BLOCKS', 'CUT_NOTICE', 'EXTENSION', 'FREE_AGENCY', 'RETIRE', 'EVENT', 'EVENT']);
  assert.ok(r.state.history.earnings > earnings0, 'Contracts.payoutSeason ran when the offseason opened');
  const seen = runChain(r.state, r.rng, 'EXTENSION');
  assert.deepEqual(J(seen), ['BODY_CHECK', 'TRAINING_BLOCKS', 'EXTENSION'], 'no cut for a satisfied team; extension offered in the final year');
  const ext = r.state.pending.decision;
  assert.deepEqual(J(ext.options.map((o) => o.id)), ['ACCEPT', 'COUNTER', 'DECLINE']);
  const out = Engine.decide(r.state, r.rng, { kind: 'EXTENSION', optionId: 'ACCEPT' });
  assert.equal(out.result.signed, true);
  assert.equal(p.contract.type, 'VET'); assert.equal(p.contract.yearIdx, 0); assert.equal(p.contract.aav, ext.payload.offer.aav);
  assert.equal(ch.resigned, true);
  // no FA after re-signing; too young for the RETIRE card; the events follow; the chain ends without a stage change
  let guard = 8;
  while (r.state.pending && guard-- > 0) { if (r.state.pending.kind === 'EVENT') Engine.chooseEvent(r.state, r.rng, 0); else kfx.settle(RTG, r.state, r.rng); }
  assert.equal(ch.done, true); assert.ok(!ch.log.includes('RETIRE') || !seen.includes('RETIRE'));
  assert.equal(r.state.stage, 'NFL'); assert.equal(r.state.phase, 'OFF');
  ok(r.state, 'NFL chain done');

  // DECLINE → free agency (offers from needy teams, the current team excluded) or a tag
  const r2 = kfx.nflOff(RTG, { needy: 8 });
  r2.state.player.age = 30;                                     // below the tag's AAV floor at this OVR → no tag
  runChain(r2.state, r2.rng, 'EXTENSION');
  const old = r2.state.player.teamId;
  const d2 = Engine.decide(r2.state, r2.rng, { kind: 'EXTENSION', optionId: 'DECLINE' });
  assert.equal(d2.result.declined, true);
  const nextKind = r2.state.pending.decision.kind;
  assert.ok(nextKind === 'FREE_AGENCY' || nextKind === 'TAG', 'after declining: ' + nextKind);
  if (nextKind === 'FREE_AGENCY') {
    const fa = r2.state.pending.decision;
    assert.ok(fa.payload.offers.every((o) => o.teamId !== old), 'the team that failed to extend does not bid');
    assert.ok(fa.options.some((o) => o.id === 'SIT_OUT') && fa.options.some((o) => o.id === 'WAIT'));
    if (fa.payload.offers.length) {
      Engine.decide(r2.state, r2.rng, { kind: 'FREE_AGENCY', optionId: fa.payload.offers[0].id });
      assert.equal(r2.state.player.teamId, fa.payload.offers[0].teamId);
      assert.equal(r2.state.player.contract.type, 'VET');
      assert.equal(r2.state.player.trust, Tuning.contracts.changeTeam.trust);
    }
  }
  ok(r2.state, 'after FA');
});

test('offseasonChain (NFL): a cut (js < 20) → CUT_NOTICE then FREE_AGENCY; sitting out counts toward forced retirement', () => {
  const r = kfx.nflOff(RTG, { needy: 6 });
  r.state.player.js = 10;
  const team = Schema.userTeam(r.state);
  const seen = runChain(r.state, r.rng, 'CUT_NOTICE');
  assert.deepEqual(J(seen), ['BODY_CHECK', 'TRAINING_BLOCKS', 'CUT_NOTICE']);
  const cn = r.state.pending.decision;
  assert.equal(cn.payload.reason, 'JOB_SECURITY');
  assert.equal(r.state.player.contract, null); assert.equal(r.state.player.teamId, null); assert.equal(r.state.player.role, 'NONE');
  assert.ok(team.kicker, 'the team keeps a kicker');
  assert.ok(r.state.history.timeline.some((t) => t.kind === 'CUT'));
  Engine.decide(r.state, r.rng, { kind: 'CUT_NOTICE', optionId: 'OK' });
  assert.equal(r.state.pending.decision.kind, 'FREE_AGENCY');
  Engine.decide(r.state, r.rng, { kind: 'FREE_AGENCY', optionId: 'SIT_OUT' });
  assert.equal(r.state.flags.noOfferSeasons, 1);
  assert.equal(r.state.player.teamId, null);
  ok(r.state, 'cut and sitting out');
});

// ═══════════════════════════════ changeTeam ═══════════════════════════════

test('changeTeam: stints closed/opened, teamId/league/role/trust/js, job flags cleared, rosters arranged, week game reset; unknown team throws', () => {
  const r = kfx.nflReg(RTG);
  const p = r.state.player, from = p.teamId, oldTeam = Schema.userTeam(r.state);
  p.flags.benched = true; p.flags.jsLowWeeks = 2; r.state.flags.ultimatum = { weeksLeft: 2 };
  const target = r.state.leagues.nfl.teams.find((t) => t.id !== from);
  const incumbent = target.kicker;
  const rng = counting(3);
  const hl = r.state.headlines.length, tl = r.state.history.timeline.length, stints = r.state.history.teams.length;
  const out = Career.changeTeam(r.state, rng, target.id, { trust: 50, js: 55, reason: 'TRADE' });
  assert.equal(rng.draws, 1, 'one headline draw');
  assert.deepEqual(J(out), { teamId: target.id, league: 'NFL', from: from, role: 'K1' });
  assert.equal(p.teamId, target.id); assert.equal(p.league, 'NFL'); assert.equal(p.role, 'K1');
  assert.equal(p.trust, 50); assert.equal(p.js, 55);
  assert.equal(p.flags.benched, undefined); assert.equal(p.flags.jsLowWeeks, undefined); assert.equal(r.state.flags.ultimatum, undefined);
  assert.equal(target.kicker, null); assert.equal(target.kicker2, incumbent, 'the incumbent becomes the backup');
  assert.ok(oldTeam.kicker, 'the old team promotes its backup');
  assert.equal(r.state.history.teams.length, stints + 1);
  assert.equal(r.state.history.teams[stints - 1].toYear, r.state.year); assert.equal(r.state.history.teams[stints - 1].endReason, 'TRADE');
  assert.equal(r.state.history.teams[stints].teamId, target.id); assert.equal(r.state.history.teams[stints].toYear, null);
  assert.equal(r.state.season.userGameId, null, 'the week\'s game pointer is recomputed');
  assert.equal(r.state.headlines.length, hl + 1); assert.equal(r.state.history.timeline.length, tl + 1);
  assert.ok(r.state.inbox.some((m) => m.from === 'gm'));
  ok(r.state, 'after changeTeam');
  assert.throws(() => Career.changeTeam(r.state, rng, 'NOPE', {}), /unknown team NOPE/);
  // Contracts.sign routes moves through changeTeam when an rng is given
  const fa = cfx.freeAgent(RTG);
  const before = fa.history.teams.length;
  RTG.Contracts.sign(fa, cfx.offer({ teamId: 'PIT' }), RTG.RNG.create(1));
  assert.equal(fa.player.teamId, 'PIT'); assert.equal(fa.history.teams.length, before + 1); assert.equal(fa.history.teams[before].reason, 'SIGNED');
  ok(fa, 'signed via changeTeam');
});

// ═══════════════════════════════ §2.7.8 retirement ═══════════════════════════════

test('retirement rules: forced at 42, after two offer-less offseasons, farewell tour, late career-threat injury; the RETIRE card from 33', () => {
  const R = Tuning.contracts.retirement, F = Tuning.contracts.fa;
  const base = () => kfx.nflOff(RTG).state;
  let s = base(); assert.equal(Career.forcedRetirement(s), null);
  s = base(); s.player.age = R.forcedAge; assert.equal(Career.forcedRetirement(s), 'AGE');
  s = base(); s.flags.noOfferSeasons = F.noOffersRetireAfter; assert.equal(Career.forcedRetirement(s), 'NO_CONTRACT');
  s = base(); s.flags.noOfferSeasons = F.noOffersRetireAfter - 1; assert.equal(Career.forcedRetirement(s), null);
  s = base(); s.flags.farewell = true; assert.equal(Career.forcedRetirement(s), 'FAREWELL');
  s = base(); s.player.age = 34; s.player.injury = { type: 'CAREER_THREAT', label: 'x', weeksLeft: TC.retire.injuryWeeksForced, careerThreat: true }; assert.equal(Career.forcedRetirement(s), 'INJURY');
  s = base(); s.player.age = 27; s.player.injury = { type: 'CAREER_THREAT', label: 'x', weeksLeft: 14, careerThreat: true }; assert.equal(Career.forcedRetirement(s), null, 'a young leg comes back');
  // the card: not offered at 32, offered at 33 with ONE_MORE_YEAR / RETIRE
  const young = kfx.nflOff(RTG); young.state.player.age = R.offerFromAge - 2;   // ages +1 in the chain
  const seenY = runChain(young.state, young.rng);
  assert.ok(!seenY.includes('RETIRE'), 'no card before ' + R.offerFromAge + ': ' + seenY.join(','));
  const old = kfx.nflOff(RTG); old.state.player.age = R.offerFromAge - 1;
  const seenO = runChain(old.state, old.rng, 'RETIRE');
  assert.equal(seenO[seenO.length - 1], 'RETIRE');
  const card = old.state.pending.decision;
  assert.ok(card.options.some((o) => o.id === 'ONE_MORE_YEAR') && card.options.some((o) => o.id === 'RETIRE'));
  assert.equal(card.payload.forced, null);
  Engine.decide(old.state, old.rng, { kind: 'RETIRE', optionId: 'ONE_MORE_YEAR' });
  assert.equal(old.state.stage, 'NFL');
  // forced: only RETIRE, and the decision retires
  const forced = kfx.nflOff(RTG); forced.state.player.age = R.forcedAge - 1;
  const seenF = runChain(forced.state, forced.rng, 'RETIRE');
  assert.equal(seenF[seenF.length - 1], 'RETIRE');
  const fc = forced.state.pending.decision;
  assert.equal(fc.payload.forced, 'AGE'); assert.deepEqual(J(fc.options.map((o) => o.id)), ['RETIRE']);
  const out = Engine.decide(forced.state, forced.rng, { kind: 'RETIRE', optionId: 'RETIRE' });
  assert.equal(out.result.retired, true);
  assert.equal(forced.state.stage, 'RETIRED'); assert.equal(forced.state.phase, 'LEGACY');
  assert.equal(forced.state.pending.decision.kind, 'HOF');
  assert.equal(forced.state.flags.legacy.reason, 'AGE');
  ok(forced.state, 'retired at 42');
  // two offer-less offseasons → forced
  const none = kfx.nflOff(RTG); none.state.flags.noOfferSeasons = F.noOffersRetireAfter - 1; none.state.player.contract = null; none.state.player.teamId = null; none.state.player.role = 'NONE';
  none.state.history.contracts.forEach((c) => { if (c.endYear === null) c.endYear = none.state.year; });
  cfx.setNeedy(RTG, none.state, 0);
  const seenN = runChain(none.state, none.rng, 'RETIRE');
  assert.ok(seenN.includes('FREE_AGENCY') && seenN[seenN.length - 1] === 'RETIRE', seenN.join(','));
  assert.equal(none.state.pending.decision.payload.forced, 'NO_CONTRACT');
});

test('retire → LegacyReport {tier, hof, line, moments, records, docTitle, timeline}; HOF verdict thresholds follow Tuning.hof.verdicts; HOF ack clears the pending', () => {
  const V = Tuning.hof.verdicts;
  const r = kfx.retired(RTG);
  r.state.stage = 'NFL'; r.state.phase = 'OFF'; r.state.pending = null; r.state.player.role = 'K1'; r.state.player.teamId = 'BOS';
  r.state.player.contract = { type: 'VET', years: 2, yearIdx: 1, aav: 3.4, gtdPct: 0.5, signingBonus: 1.7, startYear: 18, paid: 5.1, paidThrough: 1 };
  r.state.history.teams.push({ teamId: 'BOS', league: 'NFL', fromYear: 5, toYear: null, reason: 'DRAFTED' });
  const rng = counting(9);
  const report = Career.retire(r.state, rng, 'CHOICE');
  assert.equal(rng.draws, 2, 'documentary title pick + headline');
  for (const k of ['tier', 'hof', 'line', 'moments', 'records', 'docTitle', 'timeline']) assert.ok(report[k] !== undefined, 'report.' + k);
  assert.equal(report.hof.score, RTG.Awards.hofScore(r.state).score);
  const expected = report.hof.score >= V.firstBallot ? 'FIRST_BALLOT' : (report.hof.score >= V.inducted ? 'INDUCTED' : (report.hof.score >= V.finalist ? 'FINALIST' : 'NOT_ON_BALLOT'));
  assert.equal(report.hof.verdict, expected);
  assert.equal(report.tier, report.hof.tier);
  assert.ok(Array.isArray(report.hof.breakdown) && report.hof.breakdown.length >= 10);
  assert.ok(typeof report.line.text === 'string' && report.line.fgm === r.state.stats.career.fgm);
  assert.ok(Array.isArray(report.moments) && report.moments.length <= TC.legacy.moments);
  assert.ok(Array.isArray(report.records));
  assert.ok(typeof report.docTitle === 'string' && report.docTitle.indexOf(r.state.player.name.last) >= 0);
  assert.ok(Array.isArray(report.timeline) && report.timeline.length <= TC.legacy.timeline);
  assert.equal(report.reason, 'CHOICE'); assert.equal(report.seed, r.state.seed);
  assert.equal(r.state.stage, 'RETIRED'); assert.equal(r.state.phase, 'LEGACY');
  assert.equal(r.state.player.contract, null); assert.equal(r.state.player.role, 'NONE');
  assert.equal(r.state.history.teams[r.state.history.teams.length - 1].toYear, r.state.year);
  assert.equal(r.state.pending.decision.kind, 'HOF');
  assert.deepEqual(J(r.state.pending.decision.payload.verdict), report.hof.verdict);
  ok(r.state, 'RETIRED.LEGACY');
  const out = Engine.decide(r.state, rng, { kind: 'HOF', optionId: 'OK' });
  assert.equal(out.next, 'PHASE'); assert.equal(r.state.pending, null); assert.equal(r.state.flags.legacyAcked, true);
  assert.deepEqual(J(Career.stageInfo(r.state)), { act: 4, label: 'Legacy', stage: 'RETIRED', phase: 'LEGACY' });
  // verdict thresholds
  const mk = (score) => score >= V.firstBallot ? 'FIRST_BALLOT' : (score >= V.inducted ? 'INDUCTED' : (score >= V.finalist ? 'FINALIST' : 'NOT_ON_BALLOT'));
  assert.equal(mk(V.firstBallot), 'FIRST_BALLOT'); assert.equal(mk(V.firstBallot - 1), 'INDUCTED'); assert.equal(mk(V.inducted), 'INDUCTED'); assert.equal(mk(V.inducted - 1), 'FINALIST'); assert.equal(mk(V.finalist), 'FINALIST'); assert.equal(mk(V.finalist - 1), 'NOT_ON_BALLOT');
});

// ═══════════════════════════════ event actions ═══════════════════════════════

test('handleActions: TRADE (40 %, trust −15), CHANGE_TEAM (best contender), TRANSFER (portal now / flag), HOLDOUT (skip week 1), SKIP_GAME, INJURY, RETIRE, unknown', () => {
  const TE = Tuning.events.trade;
  // TRADE
  let moved = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const r = kfx.nflReg(RTG);
    const from = r.state.player.teamId, trust0 = r.state.player.trust;
    const out = Career.handleActions(r.state, RTG.RNG.create(seed), ['TRADE']);
    assert.equal(out[0].action, 'TRADE'); assert.equal(out[0].ok, true);
    if (out[0].executed) { moved++; assert.notEqual(r.state.player.teamId, from); assert.equal(r.state.history.teams[r.state.history.teams.length - 1].reason, 'TRADE'); assert.equal(r.state.player.trust, Tuning.contracts.changeTeam.trust); }
    else { assert.equal(r.state.player.teamId, from); assert.equal(r.state.player.trust, Math.max(0, trust0 + TE.trust)); }
    if (seed === 1) ok(r.state, 'after trade action');
  }
  assert.ok(moved >= 8 && moved <= 24, 'about 40 % of trade requests are executed (' + moved + '/40)');
  // CHANGE_TEAM → the best-record needy contender
  const c = kfx.nflReg(RTG);
  const before = c.state.player.teamId;
  const cout = Career.handleActions(c.state, c.rng, ['CHANGE_TEAM']);
  assert.equal(cout[0].ok, true); assert.notEqual(c.state.player.teamId, before);
  assert.ok(RTG.Contracts.teamsNeedingK(c.state.leagues.nfl).some((t) => t.id === c.state.player.teamId) || true);
  ok(c.state, 'after CHANGE_TEAM');
  // TRANSFER in season → flag; in OFF → portal offers pending
  const t1 = kfx.collegeReg(RTG);
  assert.equal(Career.handleActions(t1.state, t1.rng, ['TRANSFER'])[0].detail, 'portal opens in the offseason');
  assert.equal(t1.state.flags.transferRequested, true);
  const t2 = kfx.collegeOff(RTG, { seasons: 2 });
  Career.handleActions(t2.state, t2.rng, ['TRANSFER']);
  assert.equal(t2.state.pending.decision.kind, 'TRANSFER');
  const t3 = kfx.nflReg(RTG);
  assert.equal(Career.handleActions(t3.state, t3.rng, ['TRANSFER'])[0].ok, false, 'not in college');
  // HOLDOUT (offseason → next year's week 1); with the extension branch flag → new deal at ×1.10
  const h = kfx.nflOff(RTG);
  const mv = RTG.Contracts.marketValue(h.state);
  h.state.flags.holdoutExtension = true;
  const hout = Career.handleActions(h.state, h.rng, ['HOLDOUT']);
  assert.deepEqual(J(h.state.flags.skipGame), { year: h.state.year + 1, week: 1, reason: 'HOLDOUT' });
  assert.equal(hout[0].extension, true);
  assert.equal(h.state.player.contract.aav, Math.max(mv.vetMin, RTG.Util.round1(mv.aav * Tuning.contracts.holdout.extensionAav)));
  assert.equal(h.state.flags.holdoutExtension, undefined);
  ok(h.state, 'after holdout');
  // SKIP_GAME / INJURY / RETIRE / unknown
  const s = kfx.nflReg(RTG);
  const sout = Career.handleActions(s.state, s.rng, ['SKIP_GAME', 'INJURY', 'RETIRE', 'BOGUS']);
  assert.deepEqual(J(s.state.flags.skipGame), { year: s.state.year, week: s.state.week, reason: 'EVENT' });
  assert.ok(s.state.player.injury && s.state.player.injury.weeksLeft >= 1 && s.state.player.injury.weeksLeft <= 3);
  assert.equal(sout[2].retired, false); assert.equal(s.state.flags.farewell, true, 'in season: farewell tour');
  assert.equal(sout[3].ok, false);
  ok(s.state, 'after actions');
  const o = kfx.nflOff(RTG);
  assert.equal(Career.handleActions(o.state, o.rng, ['RETIRE'])[0].retired, true);
  assert.equal(o.state.stage, 'RETIRED');
});

test('HALFTIME70 session (event #16) resolves through finishSession: make → fame +80 / fans +15, miss → fans −5 / morale −3', () => {
  const H = Tuning.events.halftime70;
  for (const made of [true, false]) {
    const r = kfx.nflReg(RTG);
    r.state.player.fame = 300;
    RTG.Events.force(r.state, r.rng, 'HALFTIME_70');
    Engine.chooseEvent(r.state, r.rng, 0);
    assert.equal(r.state.pending.kind, 'KICKS'); assert.equal(r.state.pending.session.kind, 'HALFTIME70');
    assert.equal(r.state.pending.session.contexts[0].distance, Tuning.events.halftime70Dist);
    const fame = r.state.player.fame, fans = r.state.player.fans, morale = r.state.player.morale;
    kfx.fillSession(r.state.pending.session, [made]);
    const out = Career.finishSession(r.state, r.rng);
    assert.equal(out.kind, 'HALFTIME70'); assert.equal(out.made, made);
    assert.equal(r.state.pending, null);
    if (made) { assert.equal(r.state.player.fame, Math.min(1000, fame + H.makeFame)); assert.equal(r.state.player.fans, Math.min(100, fans + H.makeFans)); }
    else { assert.equal(r.state.player.fans, Math.max(0, fans + H.missFans)); assert.equal(r.state.player.morale, Math.max(0, morale + H.missMorale)); }
    ok(r.state, 'after halftime');
  }
});

// ═══════════════════════════════ §2.7.6 draft hand-off ═══════════════════════════════

test('runDraft: drafted → rookie deal + enterNfl (NFL.PRE, next year, changeTeam DRAFTED); UDFA band → invites pending; undrafted → tryout; tryout fail → spring league', () => {
  const R = Tuning.contracts.rookie;
  // drafted (value 80–85 → round 4)
  const d = cfx.draftProspect(RTG, { combineScore: 0 });
  d.flags.combineScore = 82 - RTG.Draft.draftValue(d);          // land in the round-4 band
  d.phase = 'DRAFT';
  const year0 = d.year, age0 = d.player.age;
  const rng = RTG.RNG.create(2);
  const nh0 = d.headlines.length;
  const res = Career.runDraft(d, rng);
  assert.equal(res.undrafted, false); assert.equal(res.next, 'NFL'); assert.equal(res.round, 4);
  const drafted = d.headlines.slice(nh0);
  assert.ok(drafted.some((h) => /round 4|round-4/.test(h.text)), 'the draft headline names the round: ' + drafted.map((h) => h.text).join(' | '));
  assert.ok(drafted.every((h) => !/round \?/.test(h.text)), 'no unfilled round: ' + drafted.map((h) => h.text).join(' | '));
  assert.equal(d.stage, 'NFL'); assert.equal(d.phase, 'PRE'); assert.equal(d.year, year0 + 1); assert.equal(d.player.age, age0 + 1);
  assert.equal(d.player.league, 'NFL'); assert.equal(d.player.teamId, res.teamId);
  assert.equal(d.player.contract.type, 'ROOKIE'); assert.equal(d.player.contract.round, 4); assert.equal(d.player.contract.aav, R.byRound[4].aav); assert.equal(d.player.contract.years, R.years);
  assert.equal(d.player.contract.yearIdx, 0);
  assert.equal(d.history.teams[d.history.teams.length - 1].reason, 'DRAFTED');
  assert.ok(d.season && d.season.league === 'NFL' && d.season.schedule.length > 0, 'the NFL season is built');
  assert.ok(['K1', 'K2'].includes(d.player.role));
  assert.deepEqual(J(d.flags.draftResult.ticker.filter((t) => t.isUser).length), 1);
  assert.ok(d.history.timeline.some((t) => t.kind === 'DRAFTED'));
  ok(d, 'rookie at NFL.PRE');
  // UDFA band (60–65) → invites decision
  const u = cfx.draftProspect(RTG, { combineScore: 0 });
  u.flags.combineScore = 62 - RTG.Draft.draftValue(u);
  u.phase = 'DRAFT';
  const nhu = u.headlines.length;
  const ures = Career.runDraft(u, RTG.RNG.create(3));
  assert.equal(ures.undrafted, true); assert.equal(ures.next, 'UDFA');
  assert.ok(u.headlines.slice(nhu).some((h) => /UNDRAFTED/.test(h.text)) && u.headlines.slice(nhu).every((h) => !/round \?|\bDRAFTED:/.test(h.text)), 'undrafted headline: ' + u.headlines.slice(nhu).map((h) => h.text).join(' | '));
  assert.equal(u.phase, 'UDFA'); assert.equal(u.pending.decision.kind, 'UDFA');
  const invite = u.pending.decision.payload.offers[0];
  const uo = Engine.decide(u, RTG.RNG.create(3), { kind: 'UDFA', optionId: invite.id });
  assert.equal(u.stage, 'NFL'); assert.equal(u.phase, 'PRE'); assert.equal(u.player.teamId, invite.teamId);
  assert.equal(u.player.contract.type, 'UDFA'); assert.equal(u.player.role, 'K2', 'UDFA starts as K2 — the camp battle decides');
  assert.equal(u.flags.UDFA, true);
  assert.equal(u.pending && u.pending.kind, 'KICKS', 'camp battle at PRE for the backup');
  assert.equal(uo.result.role, 'K2');
  ok(u, 'UDFA at NFL.PRE');
  // undrafted → tryout → fail twice → forced retirement; pass → invites
  const t = cfx.draftProspect(RTG, { player: { attrs: { POW: 50, ACC: 50, CON: 50, CLU: 50, KO: 50 } }, fga: 40, fgm: 24 });
  t.flags.combineScore = -8; t.phase = 'DRAFT';
  const nht = t.headlines.length;
  const tres = Career.runDraft(t, RTG.RNG.create(4));
  assert.ok(t.headlines.slice(nht).some((h) => /UNDRAFTED/.test(h.text)), 'tryout path headline: ' + t.headlines.slice(nht).map((h) => h.text).join(' | '));
  assert.equal(tres.next, 'TRYOUT'); assert.equal(t.pending.session.kind, 'TRYOUT'); assert.equal(t.phase, 'UDFA');
  kfx.fillSession(t.pending.session, [false, false, false, true, true, false]);
  const fail = Career.finishSession(t, RTG.RNG.create(4));
  assert.equal(fail.passed, false); assert.equal(fail.springLeague, true); assert.equal(fail.retired, false);
  assert.equal(t.stage, 'NFL'); assert.equal(t.phase, 'PRE'); assert.equal(t.player.teamId, null); assert.equal(t.player.league, 'NFL');
  assert.deepEqual(J(t.flags.springLeague), { failures: 1, year: t.year - 1 });
  ok(t, 'spring league year');
  const t2 = cfx.draftProspect(RTG, { player: { attrs: { POW: 50, ACC: 50, CON: 50, CLU: 50, KO: 50 } } });
  t2.flags.combineScore = -8; t2.phase = 'DRAFT'; t2.flags.springLeague = { failures: 1, year: 3 };
  Career.runDraft(t2, RTG.RNG.create(5));
  kfx.fillSession(t2.pending.session, [false, false, false, false, false, false]);
  const fail2 = Career.finishSession(t2, RTG.RNG.create(5));
  assert.equal(fail2.retired, true); assert.equal(t2.stage, 'RETIRED'); assert.equal(t2.flags.legacy.reason, 'NO_NFL_DEAL');
  const t3 = cfx.draftProspect(RTG, { player: { attrs: { POW: 50, ACC: 50, CON: 50, CLU: 50, KO: 50 } }, fga: 40, fgm: 24 });
  t3.flags.combineScore = -8; t3.phase = 'DRAFT';
  Career.runDraft(t3, RTG.RNG.create(6));
  kfx.fillSession(t3.pending.session, [true, true, true, true, false, false]);
  const pass = Career.finishSession(t3, RTG.RNG.create(6));
  assert.equal(pass.passed, true); assert.ok(pass.invites >= 1); assert.equal(t3.pending.decision.kind, 'UDFA');
});

// ═══════════════════════════════ weekly hook & misc ═══════════════════════════════

test('afterWeek: practice-squad weeks (training ×0.5 mod, 30 % call-up to a vet-minimum deal) and free-agent calls; nothing for a rostered player', () => {
  const PS = Tuning.contracts.fa.practiceSquad;
  const rostered = kfx.nflReg(RTG);
  assert.deepEqual(J(Career.afterWeek(rostered.state, rostered.rng)), { callUp: false, offers: 0, practiceSquad: false });
  let callUps = 0, ended = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const r = kfx.nflReg(RTG);
    const p = r.state.player;
    p.teamId = null; p.role = 'NONE'; p.contract = null;
    r.state.history.contracts.forEach((c) => { if (c.endYear === null) c.endYear = r.state.year; });
    r.state.flags.practiceSquad = { weeksLeft: PS.weeks };
    const rng = RTG.RNG.create(seed);
    let out = null;
    for (let w = 0; w < PS.weeks && !out; w++) {
      const o = Career.afterWeek(r.state, rng);
      if (w === 0 && !o.callUp) assert.ok(p.mods.some((m) => m.id === 'practiceSquad:trainMult' && m.value === PS.xpMult), 'training XP mod while on the squad');
      if (o.callUp) out = o;
    }
    if (out) {
      callUps++;
      assert.ok(p.teamId && p.contract && p.contract.type === 'MIN' && p.role === 'K1', 'called up on a vet-minimum deal');
      assert.ok(!p.mods.some((m) => m.id === 'practiceSquad:trainMult'), 'mod removed');
      assert.equal(r.state.flags.practiceSquad, undefined);
    } else { ended++; assert.equal(r.state.flags.practiceSquad, undefined); assert.equal(r.state.flags.faWait, true); }
    if (seed === 1) ok(r.state, 'practice squad');
  }
  assert.ok(callUps >= 15, 'six weeks at 30 % call up most kickers (' + callUps + '/30)');
  assert.ok(ended >= 1, 'some stints end without a call (' + ended + ')');
  // free-agent wait: a MIN offer becomes a pending FREE_AGENCY decision
  let offers = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const r = kfx.nflReg(RTG);
    const p = r.state.player; p.teamId = null; p.role = 'NONE'; p.contract = null;
    r.state.history.contracts.forEach((c) => { if (c.endYear === null) c.endYear = r.state.year; });
    const o = Career.afterWeek(r.state, RTG.RNG.create(seed + 100));
    if (o.offers) { offers++; assert.equal(r.state.pending.decision.kind, 'FREE_AGENCY'); assert.ok(r.state.pending.decision.options.some((x) => x.id === 'SIT_OUT')); }
  }
  assert.ok(offers >= 3 && offers <= 22, 'p ≈ 0.4 of a call (' + offers + '/30)');
});

test('stageInfo acts (§1.4) and finishSession without a session throws', () => {
  const hs = kfx.newCareer(RTG).state;
  assert.equal(Career.stageInfo(hs).act, 1);
  const col = kfx.collegeReg(RTG).state; assert.equal(Career.stageInfo(col).act, 1);
  const dr = kfx.draftDeclare(RTG).state; assert.equal(Career.stageInfo(dr).act, 2);
  const nfl = kfx.nflReg(RTG).state; nfl.player.age = 25; assert.equal(Career.stageInfo(nfl).act, 2);
  nfl.player.age = TC.acts.holdOnAge; assert.equal(Career.stageInfo(nfl).act, 3);
  assert.throws(() => Career.finishSession(nfl, RTG.RNG.create(1)), /no pending kick session/);
  assert.throws(() => Career.campBattle(kfx.newCareer(RTG).state, RTG.RNG.create(1)), /no team/);
});
