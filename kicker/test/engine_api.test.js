/**
 * engine_api.test.js — RTG.Engine facade (SPEC §3.5.20, §3.6, §3.8, §5.1 "engine_api"): every function exists;
 * newCareer seeds; preconditions throw descriptive Errors (endWeek before the game is played, applyUserKick without a
 * pending kick, train twice, …); the game loop (start → simToKick → applyUserKick / autoKick → finish); sessionKick
 * on the showcase; chooseEvent; nextPhase idempotent with a pending decision and the PRE → REG / AWARDS → OFF / OFF →
 * next year transitions; autoPlayWeek / Season / Offseason / Career reach the expected phases with a valid, NaN-free
 * state; save / load round trip.
 *
 *   node kicker/test/engine_api.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RTG = require('./load')();
const kfx = require('./fixtures/career');
const schemaFx = require('./fixtures/schema');

const { Engine, Schema, Tuning, Util } = RTG;
const J = (v) => JSON.parse(JSON.stringify(v));

function ok(state, where) {
  const v = Schema.validate(state);
  assert.ok(v.ok, (where || 'state') + ' validates: ' + v.errors.slice(0, 6).join('; '));
}
/** Deep scan for NaN / Infinity / undefined / functions. */
function scanBad(obj, out, p) {
  if (out.length >= 10 || obj === null) return;
  const t = typeof obj;
  if (t === 'number') { if (obj !== obj || obj === Infinity || obj === -Infinity) out.push(p + '=' + obj); return; }
  if (t === 'undefined' || t === 'function') { out.push(p + '=' + t); return; }
  if (t !== 'object') return;
  for (const k of Object.keys(obj)) scanBad(obj[k], out, p + '.' + k);
}
function clean(state, where) {
  const bad = [];
  scanBad(state, bad, 'state');
  assert.deepEqual(bad, [], (where || 'state') + ' has NaN/undefined: ' + bad.join(', '));
}
/** Play the pending user game with the facade's step / kick calls (a user input for the first kick, auto for the rest). */
function playGame(state, rng, firstInput) {
  let userKicks = 0, first = true, guard = 400;
  while (guard-- > 0) {
    let e = Engine.simToKick(state, rng);
    if (e.type === 'ICE_TIMEOUT') e = Engine.simToKick(state, rng);
    if (e.type === 'END_GAME' || e.type === 'END') break;
    if (e.type === 'USER_KICK') {
      if (first && firstInput) { Engine.applyUserKick(state, rng, firstInput); first = false; } else Engine.autoKick(state, rng);
      userKicks++;
    } else if (e.type === 'USER_KICKOFF') Engine.applyUserKickoff(state, rng, null);
  }
  return { summary: Engine.finishUserGame(state, rng), userKicks };
}

// ═══════════════════════════════ surface & creation ═══════════════════════════════

test('§3.5.20 every Engine function exists', () => {
  const fns = ['newCareer', 'train', 'spendXp', 'startUserGame', 'simStep', 'simToKick', 'applyUserKick', 'autoKick', 'applyUserKickoff',
    'finishUserGame', 'endWeek', 'chooseEvent', 'sessionKick', 'decide', 'nextPhase', 'autoPlayGame', 'autoPlayWeek', 'autoPlaySeason',
    'autoPlayOffseason', 'autoPlayCareer', 'save', 'load', 'settlePending', 'autoOption', 'autoSpend'];
  for (const f of fns) assert.equal(typeof Engine[f], 'function', 'Engine.' + f);
});

test('newCareer: default seed fnv1a32(String(now)); explicit numeric / string seeds; {state, rng} at HS.SHOWCASE with the showcase pending', () => {
  const now = 1757000000000;
  const a = Engine.newCareer({ name: 'Ada Kickwell', archetype: 'ICEMAN', difficulty: 'allpro' }, now);
  assert.equal(a.state.seed, Util.fnv1a32(String(now)));
  assert.equal(a.state.createdAt, now); assert.equal(a.state.difficulty, 'allpro'); assert.equal(a.state.player.archetype, 'ICEMAN');
  assert.equal(a.state.stage, 'HS'); assert.equal(a.state.phase, 'SHOWCASE');
  assert.equal(a.state.pending.kind, 'KICKS'); assert.equal(a.state.pending.session.kind, 'SHOWCASE'); assert.equal(a.state.pending.session.contexts.length, 6);
  assert.equal(a.state.rngState, a.rng.state());
  ok(a.state, 'new career');
  const b = Engine.newCareer({ seed: 4242 }, now), c = Engine.newCareer({ seed: '4242' }, now), d = Engine.newCareer({ seed: 'road to glory' }, now);
  assert.equal(b.state.seed, 4242); assert.equal(c.state.seed, 4242); assert.equal(d.state.seed, RTG.RNG.toSeed('road to glory'));
  assert.equal(Util.deepDiff(J(b.state), J(c.state)), '', 'same seed → same career');
  assert.notEqual(Util.deepDiff(J(b.state), J(Engine.newCareer({ seed: 4243 }, now).state)), '');
});

// ═══════════════════════════════ preconditions ═══════════════════════════════

test('preconditions throw descriptive Errors: endWeek before the game is played / with a pending / in OFF; applyUserKick without a game or a pending kick; train twice; nextPhase in season', () => {
  const r = kfx.nflReg(RTG);
  assert.throws(() => Engine.endWeek(r.state, r.rng), /play or sim this week's game first/);
  assert.throws(() => Engine.applyUserKick(r.state, r.rng, { power: 1, aim: 0, quality: 1 }), /no game in progress/);
  assert.throws(() => Engine.autoKick(r.state, r.rng), /no game in progress/);
  assert.throws(() => Engine.finishUserGame(r.state, r.rng), /no game in progress/);
  assert.throws(() => Engine.nextPhase(r.state, r.rng), /in season/);
  assert.throws(() => Engine.spendXp(r.state, 'SPEED'), /unknown attribute/);
  assert.throws(() => Engine.startUserGame(r.state, null), /RNG instance/);
  assert.throws(() => Engine.endWeek(null, r.rng), /CareerState/);
  assert.throws(() => Engine.train(r.state, r.rng, 'ACC'), /training is done for week 9/, 'the fixture already trained this week');
  r.state.season.trainingDone = false; r.state.season.focus = null;
  Engine.train(r.state, r.rng, 'ACC');
  assert.throws(() => Engine.train(r.state, r.rng, 'ACC'), /training is done for week 9/);
  Engine.startUserGame(r.state, r.rng);
  assert.throws(() => Engine.startUserGame(r.state, r.rng), /already in progress/);
  assert.throws(() => Engine.applyUserKick(r.state, r.rng, { power: 1, aim: 0, quality: 1 }), /no pending kick/);
  assert.throws(() => Engine.endWeek(r.state, r.rng), /game is not done/);
  assert.throws(() => Engine.finishUserGame(r.state, r.rng), /not over yet/);
  assert.throws(() => Engine.train(r.state, r.rng, 'POW'), /training is done/);
  r.state.pending = { kind: 'EVENT', event: { id: 'KID_LESSON', title: 't', text: 'x', sender: 'fan', choices: [{ label: 'a', preview: '' }], rolledWeek: 9, rolledYear: 5 } };
  assert.throws(() => Engine.endWeek(r.state, r.rng), /resolve the pending EVENT first/);
  assert.throws(() => Engine.startUserGame(r.state, r.rng), /resolve the pending EVENT first/);
  r.state.pending = null;
  const off = kfx.nflOff(RTG);
  assert.throws(() => Engine.endWeek(off.state, off.rng), /not in season/);
  assert.throws(() => Engine.train(off.state, off.rng, 'ACC'), /in season/);
  assert.throws(() => Engine.startUserGame(off.state, off.rng), /not in season/);
  assert.throws(() => Engine.decide(off.state, off.rng, { kind: 'NOPE' }), /unknown decision kind/);
  assert.throws(() => Engine.chooseEvent(off.state, off.rng, 0), /no pending event/);
  assert.throws(() => Engine.sessionKick(off.state, off.rng, null), /no pending kick session/);
  const hs = kfx.newCareer(RTG).state;
  assert.equal(Engine.nextPhase(hs, RTG.RNG.create(1)).pending, 'KICKS', 'idempotent while the showcase is pending');
  hs.pending = null;
  assert.throws(() => Engine.nextPhase(hs, RTG.RNG.create(1)), /play the showcase first/);
});

// ═══════════════════════════════ the game loop ═══════════════════════════════

test('game loop: startUserGame → simToKick (USER_KICK) → applyUserKick logs the kick and meters → autoKick → finishUserGame → endWeek', () => {
  const r = kfx.nflReg(RTG);
  const p = r.state.player;
  r.state.season.trainingDone = false; r.state.season.focus = null;
  const trained = Engine.train(r.state, r.rng, 'ACC');
  assert.equal(trained.focus, 'ACC'); assert.ok(trained.xp > 0);
  const spend = Engine.spendXp(r.state, 'ACC');
  assert.ok(spend.ok || spend.reason === 'NO_XP' || spend.reason === 'POT_CAP', JSON.stringify(spend));
  const gs = Engine.startUserGame(r.state, r.rng);
  assert.equal(r.state.game, gs); assert.equal(gs.userSide === 'home' ? gs.homeId : gs.awayId, p.teamId);
  const kicksBefore = r.state.stats.kicks.length, fgaBefore = r.state.stats.season.fga + r.state.stats.season.pat;
  const { summary, userKicks } = playGame(r.state, r.rng, { power: 1.0, aim: 0, quality: 0.9 });
  assert.ok(userKicks >= 1, 'the user kicked at least once');
  assert.ok(r.state.stats.kicks.length > kicksBefore, 'kicks logged once (via Sim.applyKick → Stats.recordKick)');
  assert.equal(r.state.stats.season.fga + r.state.stats.season.pat - fgaBefore, r.state.stats.kicks.length - kicksBefore, 'one log row per attempt');
  assert.equal(r.state.game, null); assert.equal(r.state.season.weekGameDone, true);
  assert.ok(summary && typeof summary.won === 'boolean' && summary.userLine && summary.xp);
  assert.equal(r.state.rngState, r.rng.state(), 'rngState written back');
  ok(r.state, 'after the game');
  const week = r.state.week;
  const rep = Engine.endWeek(r.state, r.rng);
  assert.equal(rep.week, week); assert.equal(r.state.week, week + 1);
  assert.ok(rep.career && typeof rep.career.callUp === 'boolean', 'Career.afterWeek ran');
  assert.equal(r.state.season.weekGameDone, false); assert.equal(r.state.season.trainingDone, false);
  ok(r.state, 'after endWeek');
  // simStep advances one drive at a time on a fresh game
  if (r.state.pending) Engine.settlePending(r.state, r.rng);
  if (RTG.Season.userGameRef(r.state)) {
    Engine.startUserGame(r.state, r.rng);
    const e = Engine.simStep(r.state, r.rng);
    assert.ok(typeof e.type === 'string' && e.gs === r.state.game);
    assert.ok(Engine.autoPlayGame(r.state, r.rng), 'autoPlayGame resumes and finishes the game in progress');
    assert.equal(r.state.game, null);
  }
});

test('applyUserKick with a pending kickoff throws (and vice versa); autoKick resolves either', () => {
  const r = kfx.nflReg(RTG);
  r.state.settings.playKickoffs = true;
  Engine.startUserGame(r.state, r.rng);
  let e = Engine.simToKick(r.state, r.rng), guard = 200, sawKickoff = false;
  while (guard-- > 0 && e.type !== 'END_GAME' && e.type !== 'END') {
    if (e.type === 'USER_KICKOFF') {
      sawKickoff = true;
      assert.throws(() => Engine.applyUserKick(r.state, r.rng, { power: 1, aim: 0, quality: 1 }), /use applyUserKickoff/);
      const ko = Engine.applyUserKickoff(r.state, r.rng, { timing: 0.1 });
      assert.equal(ko.type, 'KO'); assert.equal(ko.auto, false);
    } else if (e.type === 'USER_KICK') {
      assert.throws(() => Engine.applyUserKickoff(r.state, r.rng, null), /use applyUserKick/);
      Engine.autoKick(r.state, r.rng);
    }
    e = Engine.simToKick(r.state, r.rng);
  }
  assert.ok(sawKickoff, 'the user kicked off at least once with playKickoffs on');
  Engine.finishUserGame(r.state, r.rng);
  ok(r.state, 'after a kickoff game');
});

// ═══════════════════════════════ sessions, events, decisions ═══════════════════════════════

test('sessionKick: six showcase kicks (AI input when null) → done with the SHOWCASE outcome and the OFFERS_COLLEGE decision; a complete session throws', () => {
  const { state, rng } = kfx.newCareer(RTG, { seed: 8 });
  const results = [];
  for (let i = 0; i < 6; i++) {
    const r = Engine.sessionKick(state, rng, i === 0 ? { power: 1.0, aim: 0, quality: 0.95 } : null);
    results.push(r);
    assert.equal(r.idx, i); assert.equal(r.done, i === 5); assert.equal(r.remaining, 5 - i);
    assert.ok(r.result && typeof r.result.made === 'boolean');
    if (i === 0) assert.equal(r.result.auto, false); else assert.equal(r.result.auto, true);
  }
  assert.equal(results[5].outcome.kind, 'SHOWCASE');
  assert.equal(state.phase, 'OFFERS'); assert.equal(state.pending.decision.kind, 'OFFERS_COLLEGE');
  assert.throws(() => Engine.sessionKick(state, rng, null), /no pending kick session/);
  ok(state, 'after the showcase');
});

test('chooseEvent applies the choice, runs the actions and resumes the offseason chain', () => {
  const r = kfx.nflReg(RTG);
  RTG.Events.force(r.state, r.rng, 'FAN_MAIL');
  const fans = r.state.player.fans;
  const out = Engine.chooseEvent(r.state, r.rng, 0);
  assert.equal(out.id, 'FAN_MAIL'); assert.deepEqual(J(out.actionResults), []);
  assert.equal(r.state.player.fans, Math.min(100, fans + 6)); assert.equal(r.state.pending, null);
  assert.throws(() => Engine.chooseEvent(r.state, r.rng, 0), /no pending event/);
  // an out-of-range choice throws (Events.apply)
  RTG.Events.force(r.state, r.rng, 'FAN_MAIL');
  assert.throws(() => Engine.chooseEvent(r.state, r.rng, 7), /out of range/);
});

test('nextPhase: idempotent with a pending decision; PRE → REG; AWARDS → OFF (chain); OFF → next year PRE once the chain is done; RETIRED stays', () => {
  // PRE → REG
  const c = kfx.collegePre(RTG, { seed: 2, depth: 'OPEN' });
  assert.equal(c.state.pending, null);
  const a = Engine.nextPhase(c.state, c.rng);
  assert.deepEqual(J(a), { stage: 'COLLEGE', phase: 'REG', year: 1, week: 1, pending: null });
  // OFF with the chain pending → idempotent
  const o = kfx.nflOff(RTG);
  const p1 = Engine.nextPhase(o.state, o.rng);
  assert.equal(p1.phase, 'OFF'); assert.equal(p1.pending, 'DECISION');
  const snap = J(o.state), rs = o.rng.state();
  const p2 = Engine.nextPhase(o.state, o.rng);
  assert.deepEqual(J(p2), J(p1));
  assert.equal(Util.deepDiff(J(o.state), snap), '', 'no mutation while a decision is pending');
  assert.equal(o.rng.state(), rs, 'no rng draws while pending');
  // resolve the chain → OFF done → nextPhase rolls the year
  const year = o.state.year, age = o.state.player.age;
  Engine.settlePending(o.state, o.rng);
  assert.equal(o.state.pending, null); assert.equal(o.state.phase, 'OFF'); assert.equal(o.state.flags.offseason.done, true);
  const p3 = Engine.nextPhase(o.state, o.rng);
  assert.deepEqual(J(p3), { stage: 'NFL', phase: 'PRE', year: year + 1, week: 0, pending: o.state.pending ? o.state.pending.kind : null });
  assert.equal(o.state.player.age, age + 1); assert.equal(o.state.flags.offseason, undefined);
  ok(o.state, 'year rolled');
  // AWARDS → OFF
  const aw = kfx.nflOff(RTG); aw.state.phase = 'AWARDS'; aw.state.season.finished = true;
  const p4 = Engine.nextPhase(aw.state, aw.rng);
  assert.equal(p4.phase, 'OFF'); assert.equal(aw.state.pending.decision.kind, 'BODY_CHECK');
  // RETIRED stays
  const rt = kfx.retired(RTG);
  assert.deepEqual(J(Engine.nextPhase(rt.state, rt.rng)), { stage: 'RETIRED', phase: 'LEGACY', year: rt.state.year, week: rt.state.week, pending: 'DECISION' });
  Engine.decide(rt.state, rt.rng, { kind: 'HOF', optionId: 'OK' });
  assert.equal(Engine.nextPhase(rt.state, rt.rng).stage, 'RETIRED');
});

// ═══════════════════════════════ auto-play ═══════════════════════════════

test('autoPlayWeek trains, spends, plays, closes the week and resolves the event; autoPlaySeason ends at OFF with a season line; autoPlayOffseason reaches the next PRE', () => {
  const c = kfx.collegePre(RTG, { seed: 4 });
  const rep = Engine.autoPlayWeek(c.state, c.rng);
  assert.equal(c.state.phase, 'REG'); assert.equal(c.state.week, 2); assert.equal(rep.week, 1);
  assert.equal(c.state.pending, null); assert.ok(Array.isArray(rep.decisions));
  assert.ok(c.state.player.xpSpent > 0 || c.state.player.xp < 5, 'XP spent greedily');
  ok(c.state, 'after week 1');
  const line = Engine.autoPlaySeason(c.state, c.rng);
  assert.equal(c.state.phase, 'OFF'); assert.equal(c.state.stage, 'COLLEGE');
  assert.equal(c.state.history.seasons.length, 1); assert.equal(line, c.state.history.seasons[0]);
  assert.equal(line.league, 'COLLEGE'); assert.equal(line.year, 1);
  assert.ok(c.state.season.playoffs && c.state.season.playoffs.championId, 'a champion was crowned');
  assert.equal(c.state.pending.decision.kind, 'BODY_CHECK', 'the wizard starts');
  ok(c.state, 'at OFF'); clean(c.state, 'at OFF');
  const off = Engine.autoPlayOffseason(c.state, c.rng);
  assert.equal(c.state.stage, 'COLLEGE'); assert.equal(c.state.phase, 'PRE'); assert.equal(c.state.year, 2);
  assert.ok(off.decisions.some((d) => d.kind === 'DECISION' && d.decision === 'BODY_CHECK'));
  assert.ok(off.decisions.some((d) => d.kind === 'DECISION' && d.decision === 'TRAINING_BLOCKS'));
  assert.equal(c.state.player.age, 19);
  ok(c.state, 'year 2 PRE'); clean(c.state, 'year 2 PRE');
});

test('autoPlayCareer reaches the requested stage, then RETIRED.LEGACY with a valid, NaN-free state; deterministic for a seed', () => {
  const a = kfx.newCareer(RTG, { seed: 17, archetype: 'CANNON' });
  const t0 = Date.now();
  Engine.autoPlayCareer(a.state, a.rng, { untilStage: 'DRAFT', maxYears: 12 });
  assert.equal(a.state.stage, 'DRAFT');
  assert.ok(a.state.history.seasons.length >= Tuning.draft.declare.seasonsMin && a.state.history.seasons.every((s) => s.league === 'COLLEGE'));
  ok(a.state, 'at the draft'); clean(a.state, 'at the draft');
  const b = kfx.newCareer(RTG, { seed: 17, archetype: 'CANNON' });
  Engine.autoPlayCareer(b.state, b.rng, { untilStage: 'DRAFT', maxYears: 12 });
  assert.equal(Util.deepDiff(J(a.state), J(b.state)), '', 'same seed → identical state at the draft');
  assert.equal(a.rng.state(), b.rng.state());
  Engine.autoPlayCareer(a.state, a.rng, { untilStage: 'NFL', maxYears: 12 });
  assert.equal(a.state.stage, 'NFL'); assert.equal(a.state.phase, 'PRE');
  assert.ok(a.state.player.contract && ['ROOKIE', 'UDFA', 'MIN', 'VET'].includes(a.state.player.contract.type));
  assert.ok(a.state.flags.draftResult, 'a draft result is recorded');
  Engine.autoPlayCareer(a.state, a.rng, { maxYears: 30 });
  assert.equal(a.state.stage, 'RETIRED'); assert.equal(a.state.phase, 'LEGACY'); assert.equal(a.state.pending, null, 'the HOF card is acknowledged');
  assert.ok(a.state.history.seasons.filter((s) => s.league === 'NFL').length >= 1, 'at least one NFL season');
  assert.ok(a.state.flags.legacy && typeof a.state.flags.legacy.score === 'number');
  ok(a.state, 'retired'); clean(a.state, 'retired');
  assert.ok(Date.now() - t0 < 60000, 'a whole career in well under a minute');
});

// ═══════════════════════════════ save / load ═══════════════════════════════

test('save / load round trip (Engine.save → Engine.load) restores the state and the rng; a tampered blob is refused', () => {
  const r = kfx.collegePre(RTG, { seed: 6 });
  Engine.autoPlayWeek(r.state, r.rng);
  const blob = Engine.save(r.state, r.rng, 1757000000123);
  assert.equal(blob.v, RTG.SAVE_VERSION); assert.equal(blob.savedAt, 1757000000123); assert.equal(blob.rngState, r.rng.state());
  const loaded = Engine.load(blob);
  assert.equal(loaded.rng.state(), r.rng.state()); assert.equal(loaded.migrated, false);
  const a = RTG.Save.stripCaches(Util.deepClone(r.state)), b = RTG.Save.stripCaches(Util.deepClone(loaded.state));
  assert.equal(Util.deepDiff(J(a), J(b)), '', 'round trip preserves the state');
  // the loaded copy continues identically
  Engine.autoPlayWeek(r.state, r.rng);
  Engine.autoPlayWeek(loaded.state, loaded.rng);
  assert.equal(Util.deepDiff(J(RTG.Save.stripCaches(Util.deepClone(r.state))), J(RTG.Save.stripCaches(Util.deepClone(loaded.state)))), '');
  assert.equal(loaded.rng.state(), r.rng.state());
  const bad = J(blob); bad.career.player.xp += 1;
  assert.throws(() => Engine.load(bad), /CHECKSUM/);
  assert.throws(() => Engine.load({ v: 99, career: {}, checksum: 'x' }), /NEWER|INVALID/);
  // the retired fixture round-trips too
  const rt = kfx.retired(RTG);
  const l2 = Engine.load(Engine.save(rt.state, rt.rng, 5));
  assert.equal(l2.state.stage, 'RETIRED');
  void schemaFx;
});

test('applyUserKick / sessionKick accept opts.forced (debug): requested outcome, no input needed, zero rng draws, state stays valid', () => {
  const { state, rng } = Engine.newCareer({ name: 'Forced Kicker', archetype: 'CANNON', difficulty: 'pro', seed: 4242 }, 1757000000000);
  assert.equal(state.pending.kind, 'KICKS');
  const before = rng.state();
  const r = Engine.sessionKick(state, rng, null, { forced: { outcome: 'DOINK_IN' } });
  assert.equal(r.result.outcome, 'DOINK_IN'); assert.equal(r.result.made, true); assert.equal(r.result.forced, true);
  assert.equal(rng.state(), before, 'a forced session kick consumes no rng draws');
  while (state.pending && state.pending.kind === 'KICKS') Engine.sessionKick(state, rng, null, { forced: { outcome: 'GOOD' } });
  assert.equal(state.stage, 'HS'); assert.equal(state.phase, 'OFFERS');
  Engine.autoPlayCareer(state, rng, { untilStage: 'COLLEGE' });
  Engine.nextPhase(state, rng);
  Engine.startUserGame(state, rng);
  const ev = Engine.simToKick(state, rng);
  assert.equal(ev.type, 'USER_KICK');
  const b2 = rng.state();
  const k = Engine.applyUserKick(state, rng, null, { forced: { outcome: 'WIDE_L' } });
  assert.equal(k.outcome, 'WIDE_L'); assert.equal(k.made, false); assert.equal(k.forced, true);
  assert.equal(rng.state(), b2, 'a forced game kick consumes no rng draws');
  assert.equal(state.game.pending, null);
  assert.ok(RTG.Schema.validate(state).ok);
  assert.throws(() => Engine.applyUserKick(state, rng, null), /pending/);
});
