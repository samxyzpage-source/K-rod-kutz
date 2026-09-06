/**
 * sim.test.js — RTG.Sim (SPEC §2.5, §3.4 GameState, §3.5.11, §5.1 "sim") — the fast, deterministic part.
 *
 * startGame draw accounting · replay determinism (same seed → identical driveLog, score, kicks) · clock
 * never negative and drives/team 10–14 · simToNextUserKick yields only user-kick / end events (PATs
 * included) · applyKick scoring, logging, possession and the blocked-PAT return for two · ICE_TIMEOUT
 * before a decisive USER_KICK · gameWinner / tieForcer tags · NFL OT (first-possession FG does not end
 * it, sudden death does, regular-season tie, playoff periods) · college OT (from the 25, 18–42 yd FGs,
 * 2-pt from period 2, tries only from period 3) · scripted-rng rules (two-point, kneel, punt, stall → AI FG)
 * · finishGame summary / season writes · simAiGame kicker stats · a scripted applyKick sequence reproduces
 * an exact final score. The 2 000 / 1 000-game Monte Carlo lives in sim_balance.test.js (balance-tagged).
 *
 *   node kicker/test/sim.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RTG = require('./load')();
const gfx = require('./fixtures/game');

/** Cross-realm deep equality: engine objects come from a vm context, so normalise through JSON first. */
const J = (v) => JSON.parse(JSON.stringify(v));
const deq = (a, b, m) => assert.deepEqual(J(a), J(b), m);

const { Sim, Kick, Schema, Tuning } = RTG;
const T = Tuning.sim;
const hasData = !!(RTG.Data && RTG.Data.colleges && RTG.Data.nfl);
const hasStats = !!(RTG.Stats && typeof RTG.Stats.recordKick === 'function');

/** An RTG.RNG whose raw draws are counted (every method funnels through next()). */
function counting(seed) {
  const r = RTG.RNG.create(seed);
  const orig = r.next.bind(r);
  r.draws = 0;
  r.next = () => { r.draws++; return orig(); };
  return r;
}

function otherSide(s) { return s === 'home' ? 'away' : 'home'; }

/** Step an AI game to the end, asserting clock / quarter invariants after every step. */
function runAiGame(state, rng, ref) {
  const gs = Sim.startGame(state, rng, ref, { ai: true });
  let steps = 0, ev;
  while (!gs.done && steps++ < 2000) {
    ev = Sim.step(gs, state, rng);
    assert.ok(gs.clock >= 0, 'clock never negative');
    assert.ok(gs.clock <= T.clock.quarterSec, 'clock within a quarter');
    assert.ok(gs.q >= 1 && gs.q <= T.ot.maxQ, 'quarter in range');
    assert.equal(gs.pending, null, 'AI games never pend');
    assert.ok(typeof ev.type === 'string' && typeof ev.text === 'string' && ev.gs === gs, 'SimEvent shape');
  }
  assert.ok(gs.done, 'game finishes');
  assert.equal(ev.type, 'END_GAME');
  assert.equal(Sim.step(gs, state, rng).type, 'END', 'after END_GAME step returns END');
  return gs;
}

test('§3.5.11 public API', () => {
  for (const f of ['startGame', 'step', 'simToNextUserKick', 'applyKick', 'applyKickoff', 'autoResolvePending', 'finishGame', 'simAiGame', 'driveLogLine']) {
    assert.equal(typeof Sim[f], 'function', 'Sim.' + f);
  }
});

test('startGame: weather, rating noise, coin toss, userSide, state.game; draw count 9 in a dome (8 noise + 1 toss)', (t) => {
  if (!hasData) { t.skip('team data not loaded'); return; }
  const state = gfx.aiState(RTG, { league: 'NFL' });
  const nfl = state.leagues.nfl;
  const dome = nfl.teams.find((x) => x.dome);
  const outdoor = nfl.teams.find((x) => !x.dome && x !== dome);
  assert.ok(dome && outdoor, 'data has a dome team and an outdoor team');
  const r1 = counting(5);
  const gs = Sim.startGame(state, r1, { league: 'NFL', homeId: dome.id, awayId: outdoor.id, week: 3 }, { ai: true });
  assert.equal(r1.draws, 2 * T.drive.perGameNoiseDraws + 1, 'dome: no weather draws, 4 gauss (8) + toss (1)');
  assert.equal(gs.weather.weather, 'dome'); assert.equal(gs.weather.wind.speed, 0);
  assert.ok(Math.abs(gs.offRating.home - dome.OFF) < 5 * T.drive.ratingNoiseSd && gs.offRating.home !== dome.OFF || gs.offRating.home === dome.OFF, 'noisy OFF');
  assert.ok(Math.abs(gs.defRating.away - outdoor.DEF) < 5 * T.drive.ratingNoiseSd, 'noisy DEF');
  assert.ok(gs.receivedFirst === 'home' || gs.receivedFirst === 'away');
  assert.equal(gs.possession, gs.receivedFirst);
  deq(gs.pendingKickoff, { side: otherSide(gs.receivedFirst) }, 'the other team kicks off');
  assert.equal(gs.userSide, null); assert.equal(state.game, null, 'AI games never become state.game');
  assert.equal(gs.q, 1); assert.equal(gs.clock, T.clock.quarterSec); assert.equal(gs.done, false);
  deq(gs.timeouts, { home: T.clock.timeoutsPerHalf, away: T.clock.timeoutsPerHalf });
  // outdoors: 6 or 7 weather draws on top
  const r2 = counting(6);
  Sim.startGame(state, r2, { league: 'NFL', homeId: outdoor.id, awayId: dome.id, week: 12 }, { ai: true });
  assert.ok(r2.draws === 9 + 6 || r2.draws === 9 + 7, 'outdoors: weather 6–7 draws, got ' + r2.draws);
  // user game: userSide + state.game
  const g = gfx.startUserGame(RTG, { seed: 2 });
  assert.ok(g.gs.userSide === 'home' || g.gs.userSide === 'away');
  assert.equal(g.gs[g.gs.userSide + 'Id'], g.state.player.teamId);
  assert.equal(g.state.game, g.gs, 'the user game is stored on state');
  assert.equal(g.gs.id, g.state.season.userGameId);
  assert.ok(Schema.validate(g.state).ok, Schema.validate(g.state).errors.join('; '));
});

test('determinism: same seed → identical driveLog, score and kicks (AI game and auto-kicked user game)', (t) => {
  if (!hasData) { t.skip('team data not loaded'); return; }
  const mk = () => gfx.aiState(RTG, { league: 'NFL', seed: 9 });
  const s1 = mk(), s2 = mk();
  const ref = { league: 'NFL', homeId: s1.leagues.nfl.teams[4].id, awayId: s1.leagues.nfl.teams[9].id, week: 6 };
  const a = Sim.simAiGame(s1, RTG.RNG.create(777), ref);
  const b = Sim.simAiGame(s2, RTG.RNG.create(777), ref);
  deq(a.gs.driveLog, b.gs.driveLog); deq(a.score, b.score); deq(a.kicks, b.kicks);
  assert.ok(a.gs.driveLog.length > 15, 'a real game has many log rows');
  const c = Sim.simAiGame(mk(), RTG.RNG.create(778), ref);
  assert.notDeepEqual(J(c.gs.driveLog), J(a.gs.driveLog), 'a different seed plays a different game');
  // user game, auto-resolved kicks
  const u1 = gfx.playGame(RTG, gfx.startUserGame(RTG, { seed: 21 }));
  const u2 = gfx.playGame(RTG, gfx.startUserGame(RTG, { seed: 21 }));
  deq(u1.summary.score, u2.summary.score);
  deq(u1.summary.drives, u2.summary.drives);
  deq(u1.summary.kicks.map((k) => [k.type, k.distance, k.outcome]), u2.summary.kicks.map((k) => [k.type, k.distance, k.outcome]));
});

test('clock never negative, quarters advance in order, halves flip possession, drives/team 10–14 (30 AI games)', (t) => {
  if (!hasData) { t.skip('team data not loaded'); return; }
  const state = gfx.aiState(RTG, { league: 'NFL' });
  const teams = state.leagues.nfl.teams;
  const rng = RTG.RNG.create(31);
  let drives = 0, n = 0;
  for (let i = 0; i < 30; i++) {
    const h = teams[(i * 7) % teams.length], a = teams[(i * 11 + 3) % teams.length];
    if (h === a) continue;
    const gs = runAiGame(state, rng, { league: 'NFL', homeId: h.id, awayId: a.id, week: 1 + (i % 17), gameId: 'ai' + i });
    drives += gs.stats.home.drives + gs.stats.away.drives; n += 2;
    // halftime: the team that kicked off to start the game received the second-half kickoff
    const half = gs.driveLog.findIndex((r) => r.result === 'END_HALF');
    assert.ok(half > 0, 'halftime logged');
    const ko2 = gs.driveLog.slice(half).find((r) => r.result === 'KO');
    assert.equal(ko2.side, gs.receivedFirst, 'the team that received first kicks off in the second half');
    assert.ok(gs.driveLog.length <= Tuning.save.driveLogCap, 'drive log capped');
    for (const r of gs.driveLog) assert.ok(r.clock >= 0 && typeof r.text === 'string' && r.q >= 1, 'log row shape');
    assert.equal(gs.stats.home.fgm <= gs.stats.home.fga, true);
    assert.ok(gs.kicks.every((k) => k.ai === true), 'AI rows are flagged');
    assert.ok(gs.score.home !== gs.score.away || gs.ot, 'a tie only after overtime');
  }
  const perTeam = drives / n;
  assert.ok(perTeam >= T.expected.harness.drives[0] && perTeam <= T.expected.harness.drives[1], 'drives/team ' + perTeam.toFixed(2));
});

test('simToNextUserKick returns only USER_KICK / USER_KICKOFF / ICE_TIMEOUT / END_GAME; PATs yield USER_KICK; mid-game state validates', (t) => {
  if (!hasData) { t.skip('team data not loaded'); return; }
  const allowed = { USER_KICK: 1, USER_KICKOFF: 1, ICE_TIMEOUT: 1, END_GAME: 1, END: 1 };
  let sawPat = false, sawFg = false;
  for (let seed = 1; seed <= 6; seed++) {
    const g = gfx.startUserGame(RTG, { seed });
    const { events } = gfx.playGame(RTG, g, {
      onEvent: (e) => {
        assert.ok(allowed[e.type], 'unexpected event ' + e.type);
        if (e.type === 'USER_KICK') {
          const ctx = g.gs.pending.ctx;
          assert.equal(ctx.isUser, true); assert.equal(ctx.game.teamId, g.state.player.teamId);
          assert.equal(ctx.difficulty, g.state.difficulty);
          if (ctx.type === 'PAT') { sawPat = true; assert.equal(ctx.distance, Tuning.kick.distance.patNfl); }
          if (ctx.type === 'FG') sawFg = true;
          const v = Schema.validate(g.state);
          assert.ok(v.ok, v.errors.join('; '));
          deq(JSON.parse(JSON.stringify(g.state.game)), g.state.game, 'GameState is JSON-safe mid-game');
        }
      },
    });
    assert.equal(events[events.length - 1].type, 'END_GAME');
    assert.equal(g.state.game, null, 'finishGame clears state.game');
  }
  assert.ok(sawPat, 'a PAT was offered to the user across 6 games');
  assert.ok(sawFg, 'a FG was offered to the user across 6 games');
});

test('applyKick: forced GOOD scores 3, logs into gs.kicks and stats.kicks, clears pending, queues the kickoff; a miss flips possession at the spot', (t) => {
  if (!hasData) { t.skip('team data not loaded'); return; }
  const g = gfx.pendingUserFg(RTG, { distance: 44, hash: 1 });
  const { gs, state, rng } = g;
  const us = gs.userSide, them = otherSide(us);
  assert.equal(gs.pending.type, 'USER_KICK');
  const ctx = gs.pending.ctx;
  assert.equal(ctx.distance, 44); assert.equal(ctx.hash, 1); assert.equal(ctx.ballX, Tuning.kick.hash.ballXNfl);
  const before = { score: gs.score[us], fgm: state.stats.season.fgm, rows: state.stats.kicks.length, gsRows: gs.kicks.length };
  const res = Kick.resolve(rng, ctx, null, { power: 1, aim: 0, quality: 0.9 }, { forced: 'GOOD' });
  assert.throws(() => Sim.step(gs, state, rng), /pending/, 'step refuses while a kick is pending');
  Sim.applyKick(gs, state, rng, res);
  assert.equal(gs.score[us], before.score + Tuning.kick.points.FG);
  assert.equal(gs.pending, null);
  deq(gs.pendingKickoff, { side: us }, 'the scoring team kicks off');
  assert.equal(gs.kicks.length, before.gsRows + 1);
  assert.equal(gs.stats[us].fga, 3); assert.equal(gs.stats[us].fgm, 3);
  const row = gs.kicks[gs.kicks.length - 1];
  assert.equal(row.made, true); assert.equal(row.distance, 44); assert.equal(row.teamId, state.player.teamId); assert.ok(!row.ai);
  if (hasStats) {
    assert.equal(state.stats.kicks.length, before.rows + 1, 'Stats.recordKick appended the row');
    assert.equal(state.stats.kicks[state.stats.kicks.length - 1].id, row.id, 'the same row');
    assert.equal(state.stats.season.fgm, before.fgm + 1);
  }
  assert.throws(() => Sim.applyKick(gs, state, rng, res), /no pending/, 'nothing pending any more');
  // a miss: the defence takes over at the spot of the kick (LOS + 7, at least its own 20)
  const g2 = gfx.pendingUserFg(RTG, { distance: 44, hash: 0, seed: 4 });
  const miss = Kick.resolve(g2.rng, g2.gs.pending.ctx, null, { power: 1, aim: 0, quality: 0.9 }, { forced: 'WIDE_R' });
  Sim.applyKick(g2.gs, g2.state, g2.rng, miss);
  const them2 = otherSide(g2.gs.userSide);
  assert.equal(g2.gs.possession, them2);
  const ytg = 44 - Tuning.kick.distance.losToKick;
  assert.equal(g2.gs.ball.ytg, 100 - Math.max(T.possession.missedFgMinOwn, ytg + T.possession.holdYards));
  assert.equal(g2.gs.pendingKickoff, null);
  assert.equal(g2.gs.stats[g2.gs.userSide].fgm, 2, 'a miss is not a make');
  assert.equal(g2.gs.stats[g2.gs.userSide].fga, 3);
  assert.equal(g2.gs.score[g2.gs.userSide], 10);
  // a blocked FG: the defence takes over at the line of scrimmage
  const g3 = gfx.pendingUserFg(RTG, { distance: 50, seed: 5 });
  const blk = Kick.resolve(g3.rng, g3.gs.pending.ctx, null, { power: 1, aim: 0, quality: 0.9 }, { forced: { outcome: 'BLOCKED', blockReturnTd: false } });
  Sim.applyKick(g3.gs, g3.state, g3.rng, blk);
  assert.equal(g3.gs.ball.ytg, 100 - (50 - Tuning.kick.distance.losToKick));
});

test('blocked NFL PAT returned for two: defence scores 2, the kicking team still kicks off; auto-PAT via autoResolvePending is tagged auto', (t) => {
  if (!hasData) { t.skip('team data not loaded'); return; }
  const g = gfx.pendingPat(RTG);
  const { gs, state, rng } = g;
  const us = gs.userSide, them = otherSide(us);
  assert.equal(gs.pending.ctx.type, 'PAT'); assert.equal(gs.pending.ctx.distance, Tuning.kick.distance.patNfl);
  const res = Kick.resolve(rng, gs.pending.ctx, null, { power: 1, aim: 0, quality: 0.9 }, { forced: { outcome: 'BLOCKED', blockReturnTd: true } });
  assert.equal(res.blockReturnTd, true);
  Sim.applyKick(gs, state, rng, res);
  assert.equal(gs.score[them], Tuning.kick.points.blockReturnPat, 'returned for two');
  assert.equal(gs.score[us], 6, 'no point for the offence');
  deq(gs.pendingKickoff, { side: us });
  assert.equal(gs.stats[us].pat, 1); assert.equal(gs.stats[us].patMade, 0);
  // auto PAT
  const g2 = gfx.pendingPat(RTG, { seed: 8 });
  const r2 = Sim.autoResolvePending(g2.gs, g2.state, g2.rng);
  assert.ok(r2.tags.indexOf('auto') >= 0, 'auto tag');
  assert.equal(g2.gs.pending, null);
  const row = g2.gs.kicks[g2.gs.kicks.length - 1];
  assert.equal(row.auto, true); assert.equal(row.type, 'PAT');
  assert.throws(() => Sim.autoResolvePending(g2.gs, g2.state, g2.rng), /nothing pending/);
});

test('ICE_TIMEOUT precedes USER_KICK on a decisive kick, burns an opponent timeout and re-arms the context as iced', (t) => {
  if (!hasData) { t.skip('team data not loaded'); return; }
  const saved = Tuning.difficulty.pro.iceProb;
  Tuning.difficulty.pro.iceProb = 1;                       // Tuning is mutable by design (debug.tune contract)
  try {
    let found = false;
    for (let seed = 1; seed <= 30 && !found; seed++) {
      const g = gfx.q4TrailingBy2(RTG, { seed, clock: 7, ytg: 20 });   // two-minute drill: one play, then a decisive FG to take the lead
      const { gs, state, rng } = g;
      const them = otherSide(gs.userSide);
      const toBefore = gs.timeouts[them];
      const e1 = Sim.simToNextUserKick(gs, state, rng);
      if (e1.type !== 'ICE_TIMEOUT') continue;             // a rare turnover / out-of-range roll: try another seed
      found = true;
      assert.ok(gs.pending && gs.pending.type === 'USER_KICK', 'the kick is already pending when ICED');
      assert.equal(gs.iced, true);
      assert.equal(gs.timeouts[them], toBefore - 1, 'the defence burned a timeout');
      const e2 = Sim.step(gs, state, rng);
      assert.equal(e2.type, 'USER_KICK', 'the very next step yields USER_KICK');
      const ctx = gs.pending.ctx;
      assert.equal(ctx.iced, true); assert.equal(ctx.decisive, true);
      assert.ok(ctx.tags === undefined);
      assert.ok(ctx.pressure >= Tuning.kick.pressure.clutchThreshold, 'decisive + iced is clutch');
      const res = Kick.resolve(rng, ctx, null, { power: 1, aim: 0, quality: 0.9 }, { forced: 'GOOD' });
      assert.ok(res.tags.indexOf('iced') >= 0 && res.tags.indexOf('decisive') >= 0);
      Sim.applyKick(gs, state, rng, res);
      assert.equal(gs.iced, false, 'iced flag cleared after the kick');
      assert.equal(gs.score[gs.userSide], 23);
    }
    assert.ok(found, 'an iced decisive kick was produced within 30 seeds');
  } finally {
    Tuning.difficulty.pro.iceProb = saved;
  }
});

test('gameWinner: a decisive sudden-death OT make ends the game and is tagged after finishGame (stats bumped)', (t) => {
  if (!hasData) { t.skip('team data not loaded'); return; }
  const g = gfx.overtimeNfl(RTG, { sudden: true, seed: 3 });
  const { gs, state, rng } = g;
  const us = gs.userSide, them = otherSide(us);
  const ctx = Kick.buildContext(state, gs, { type: 'FG', distance: 40, hash: 0, isUser: true, side: us, teamId: gs[us + 'Id'], oppId: gs[them + 'Id'] }, rng);
  assert.equal(ctx.decisive, true, 'a sudden-death FG that takes the lead is decisive');
  assert.equal(ctx.ot, true); assert.equal(ctx.late, true);
  gs.pending = { type: 'USER_KICK', ctx };
  const gwBefore = state.stats.season.gameWinners;
  const res = Kick.resolve(rng, ctx, null, { power: 1, aim: 0, quality: 0.9 }, { forced: 'GOOD' });
  Sim.applyKick(gs, state, rng, res);
  assert.equal(gs.done, true, 'sudden death: the game is over');
  assert.equal(Sim.step(gs, state, rng).type, 'END_GAME', 'END_GAME is announced on the next step');
  const summary = Sim.finishGame(gs, state, rng);
  assert.equal(summary.won, true);
  assert.ok(summary.gameWinner, 'summary names the game-winning kick');
  const row = gs.kicks.find((k) => k.id === summary.gameWinner);
  assert.ok(row.tags.indexOf('gameWinner') >= 0);
  assert.equal(summary.userLine.gw, 1);
  if (hasStats) assert.equal(state.stats.season.gameWinners, gwBefore + 1, 'season gameWinners bumped');
  assert.ok(summary.xp.items.some((i) => /GAME-WINNER/.test(i.label)), 'game-winner XP item');
  assert.equal(summary.grade, 'A', '100 % with a game-winner grades A');
});

test('tieForcer: a decisive tying make at 0:03 sends the game to OT and is tagged after the game', (t) => {
  if (!hasData) { t.skip('team data not loaded'); return; }
  const g = gfx.pendingUserFg(RTG, { distance: 38, q: 4, clock: 3, user: 17, opp: 20, seed: 12, timeouts: { home: 0, away: 0 } });
  const { gs, state, rng } = g;
  const ctx = gs.pending.ctx;
  assert.equal(ctx.decisive, true, 'ties the game in the last two minutes');
  const res = Kick.resolve(rng, ctx, null, { power: 1, aim: 0, quality: 0.9 }, { forced: 'GOOD' });
  Sim.applyKick(gs, state, rng, res);
  assert.equal(gs.score.home, gs.score.away);
  assert.ok(gs.ot, 'overtime started');
  assert.equal(Sim.step(gs, state, rng).type, 'OT_START', 'OT_START announced next');
  const done = gfx.playGame(RTG, g);
  assert.ok(done.summary.tieForcer, 'the tying kick is the tie-forcer');
  const row = gs.kicks.find((k) => k.id === done.summary.tieForcer);
  assert.ok(row.tags.indexOf('tieForcer') >= 0);
  assert.equal(done.summary.userLine.tf, 1);
  assert.equal(done.summary.ot, true);
});

test('NFL OT: first-possession FG does not end the game; regular season ends tied when the period expires; playoffs add a period', (t) => {
  if (!hasData) { t.skip('team data not loaded'); return; }
  // (a) first possession, FG → not over, kickoff to the other team
  const a = gfx.overtimeNfl(RTG, { possessions: 1, possession: 'user', ytg: 30, seed: 6 });
  const us = a.gs.userSide, them = otherSide(us);
  const ctxA = Kick.buildContext(a.state, a.gs, { type: 'FG', distance: 47, hash: 0, isUser: true, side: us, teamId: a.gs[us + 'Id'], oppId: a.gs[them + 'Id'], decisive: false }, a.rng);
  a.gs.pending = { type: 'USER_KICK', ctx: ctxA };
  Sim.applyKick(a.gs, a.state, a.rng, Kick.resolve(a.rng, ctxA, null, { power: 1, aim: 0, quality: 0.9 }, { forced: 'GOOD' }));
  assert.equal(a.gs.done, false, 'the other team gets a possession');
  deq(a.gs.pendingKickoff, { side: us });
  assert.equal(a.gs.score[us], 23);
  // (b) second possession, trailing by 3, FG ties → sudden death continues
  const b = gfx.overtimeNfl(RTG, { possessions: 2, possession: 'user', ytg: 25, seed: 7 });
  b.gs.score[otherSide(b.gs.userSide)] += 3;
  const ctxB = Kick.buildContext(b.state, b.gs, { type: 'FG', distance: 42, hash: 0, isUser: true, side: b.gs.userSide, teamId: b.gs[b.gs.userSide + 'Id'], oppId: b.gs[otherSide(b.gs.userSide) + 'Id'] }, b.rng);
  assert.equal(ctxB.decisive, true, 'a tying second-possession kick is decisive (it extends the game)');
  b.gs.pending = { type: 'USER_KICK', ctx: ctxB };
  Sim.applyKick(b.gs, b.state, b.rng, Kick.resolve(b.rng, ctxB, null, { power: 1, aim: 0, quality: 0.9 }, { forced: 'GOOD' }));
  assert.equal(b.gs.done, false); assert.equal(b.gs.score.home, b.gs.score.away);
  deq(b.gs.pendingKickoff, { side: b.gs.userSide });
  // (b2) second possession, trailing by 3, missed FG → first team wins
  const b2 = gfx.overtimeNfl(RTG, { possessions: 2, possession: 'user', ytg: 25, seed: 7 });
  b2.gs.score[otherSide(b2.gs.userSide)] += 3;
  const ctxB2 = Kick.buildContext(b2.state, b2.gs, { type: 'FG', distance: 42, hash: 0, isUser: true, side: b2.gs.userSide, teamId: b2.gs[b2.gs.userSide + 'Id'], oppId: b2.gs[otherSide(b2.gs.userSide) + 'Id'] }, b2.rng);
  b2.gs.pending = { type: 'USER_KICK', ctx: ctxB2 };
  Sim.applyKick(b2.gs, b2.state, b2.rng, Kick.resolve(b2.rng, ctxB2, null, { power: 1, aim: 0, quality: 0.9 }, { forced: 'WIDE_L' }));
  assert.equal(b2.gs.done, true, 'both possessed, scores differ: over');
  // (c) regular season: period expires tied → END_GAME with a tie
  const c = gfx.overtimeNfl(RTG, { sudden: true, ytg: 85, clock: 3, seed: 8 });
  const cDone = gfx.playGame(RTG, c, { forced: () => 'WIDE_R' });
  assert.equal(c.gs.done, true); assert.equal(c.gs.ot.mode, 'NFL_REG');
  assert.equal(cDone.summary.tied, true); assert.equal(cDone.summary.won, false);
  assert.equal(c.gs.score.home, c.gs.score.away);
  const sched = c.state.season.schedule.find((x) => x.id === c.gs.id);
  assert.equal(sched.played, true); assert.equal(sched.ot, true); deq(sched.score, c.gs.score);
  // (d) playoff: another period instead
  const d = gfx.overtimeNfl(RTG, { sudden: true, ytg: 85, clock: 3, seed: 8, kind: 'WC' });
  assert.equal(d.gs.ot.mode, 'NFL_PLAYOFF');
  let guard = 0;
  while (d.gs.ot.period === 1 && !d.gs.done && guard++ < 50) {
    const e = Sim.step(d.gs, d.state, d.rng);
    if (e.type === 'USER_KICK') Sim.applyKick(d.gs, d.state, d.rng, Kick.resolve(d.rng, d.gs.pending.ctx, null, { power: 1, aim: 0, quality: 0.9 }, { forced: 'WIDE_R' }));
  }
  assert.equal(d.gs.done, false, 'playoff OT continues');
  assert.equal(d.gs.ot.period, 2); assert.equal(d.gs.q, T.clock.quarters + 2); assert.equal(d.gs.clock, T.ot.nfl.periodSec);
  assert.ok(d.gs.driveLog.some((r) => r.result === 'OT_START' && /period 2/.test(r.text)));
  const dDone = gfx.playGame(RTG, d);
  assert.notEqual(d.gs.score.home, d.gs.score.away, 'playoff games are decided');
  assert.ok(dDone.summary.won || !dDone.summary.won);
});

test('college OT: alternating possessions from the 25, FGs 18–42 yd, PATs only in period 1, two-point tries only from period 3, always decided', (t) => {
  if (!hasData) { t.skip('team data not loaded'); return; }
  const Q = T.clock.quarters, O = T.ot.college;
  let reachedThird = 0, games = 0;
  for (let seed = 1; seed <= 40 && (reachedThird < 2 || games < 12); seed++) {
    const g = gfx.overtimeCollege(RTG, { seed });
    const { gs } = g;
    const done = gfx.playGame(RTG, g);
    games++;
    assert.equal(gs.ot.mode, 'COLLEGE');
    assert.ok(gs.done && gs.score.home !== gs.score.away, 'college OT is always decided');
    assert.equal(done.summary.tied, false);
    for (const k of gs.kicks) {
      if (k.q <= Q) continue;
      if (k.type === 'FG') {
        assert.ok(k.distance >= O.stallYtg.min + Tuning.kick.distance.losToKick && k.distance <= O.stallYtg.max + Tuning.kick.distance.losToKick, 'OT FG ' + k.distance);
        assert.ok(k.q < Q + O.onlyTwoPtFromPeriod, 'no FGs from the tries-only period');
      } else {
        assert.equal(k.type, 'PAT');
        assert.ok(k.q < Q + O.twoPtFromPeriod, 'no PATs from period 2 on');
      }
    }
    const periods = gs.ot.period;
    if (periods >= O.onlyTwoPtFromPeriod) {
      reachedThird++;
      const lateRows = gs.driveLog.filter((r) => r.q >= Q + O.onlyTwoPtFromPeriod);
      assert.ok(lateRows.length > 0);
      for (const r of lateRows) assert.ok(['2PT', '2PT_FAIL', 'OT_START', 'END_GAME'].indexOf(r.result) >= 0, 'period 3+ rows: ' + r.result);
    }
    // possessions alternate: no side has the ball twice in a row within OT (a TD's own two-point try is the same possession)
    const ends = (r) => (r.q >= Q + O.onlyTwoPtFromPeriod ? ['2PT', '2PT_FAIL'] : ['FG', 'FG_MISS', 'TD', 'TO', 'DOWNS']).indexOf(r.result) >= 0;
    const otRows = gs.driveLog.filter((r) => r.q > Q && ends(r));
    for (let i = 1; i < otRows.length; i++) {
      if (otRows[i].q !== otRows[i - 1].q) continue;                       // a new period starts with the team that went second
      assert.notEqual(otRows[i].side, otRows[i - 1].side, 'alternating possessions within a period');
    }
    const firsts = [];
    for (const r of otRows) if (!firsts.length || firsts[firsts.length - 1].q !== r.q) firsts.push(r);
    for (let i = 1; i < firsts.length; i++) assert.notEqual(firsts[i].side, firsts[i - 1].side, 'periods alternate who starts');
  }
  assert.ok(reachedThird >= 1, 'at least one game reached the tries-only period');
});

test('scripted rng: two-point rule after a TD, kneel, punt field position, stall → AI field goal', (t) => {
  if (!hasData) { t.skip('team data not loaded'); return; }
  // (a) Q4, the opponent trails by 14, scores a TD → deficit 8 → two-point try (fails: chance false), no PAT
  const a = gfx.q4TrailingBy2(RTG, { seed: 2 });
  const us = a.gs.userSide, them = otherSide(us);
  a.gs.clock = 300; a.gs.score[us] = 28; a.gs.score[them] = 14; a.gs.possession = them; a.gs.ball = { ytg: 70, down: 1, toGo: 10 }; a.gs.drive.side = them;
  const rTd = gfx.scriptedRng({ weighted: 'TD', chance: false });
  const eA = Sim.step(a.gs, a.state, rTd);
  assert.equal(a.gs.score[them], 20, 'TD + failed two-point try');
  assert.ok(a.gs.driveLog.some((r) => r.result === '2PT_FAIL'));
  assert.ok(!a.gs.driveLog.some((r) => r.q === 4 && (r.result === 'PAT' || r.result === 'PAT_MISS')), 'no PAT was kicked');
  assert.equal(eA.type, 'SCORE');
  deq(a.gs.pendingKickoff, { side: them });
  // (a2) same TD trailing by 13 → PAT (AI, chance false → good)
  const a2 = gfx.q4TrailingBy2(RTG, { seed: 2 });
  a2.gs.clock = 300; a2.gs.score[a2.gs.userSide] = 27; a2.gs.score[otherSide(a2.gs.userSide)] = 14;
  a2.gs.possession = otherSide(a2.gs.userSide); a2.gs.ball = { ytg: 70, down: 1, toGo: 10 };
  const patBefore = a2.gs.stats[otherSide(a2.gs.userSide)].patMade;
  Sim.step(a2.gs, a2.state, gfx.scriptedRng({ weighted: 'TD', chance: false }));
  assert.equal(a2.gs.score[otherSide(a2.gs.userSide)], 21, 'TD + PAT');
  assert.equal(a2.gs.stats[otherSide(a2.gs.userSide)].patMade, patBefore + 1);
  assert.ok(a2.gs.driveLog.some((r) => r.q === 4 && r.result === 'PAT'), 'the PAT was kicked');
  // (b) kneel: leading with the ball, Q4 1:40, opponent out of timeouts → p 0.9 → chance true → END_GAME
  const b = gfx.q4Leading(RTG, { seed: 3 });
  const eB = Sim.step(b.gs, b.state, gfx.scriptedRng({ chance: true }));
  assert.equal(eB.type, 'END_GAME'); assert.equal(b.gs.done, true); assert.equal(b.gs.clock, 0);
  assert.ok(b.gs.driveLog.some((r) => r.result === 'KNEEL'));
  // (c) punt: opponent starts at own 30 (gauss → mean)
  const c = gfx.q4TrailingBy2(RTG, { seed: 4 });
  c.gs.q = 2; c.gs.clock = 600; c.gs.half = 1;
  const eC = Sim.step(c.gs, c.state, gfx.scriptedRng({ weighted: 'PUNT', chance: false }));
  assert.equal(eC.type, 'DRIVE'); assert.equal(eC.result, 'PUNT');
  assert.equal(c.gs.possession, otherSide(c.gs.userSide));
  assert.equal(c.gs.ball.ytg, 100 - T.drive.puntStart.mean);
  assert.equal(c.gs.stats[c.gs.userSide].punts, 1);
  assert.equal(c.gs.clock, 600 - Math.round(T.drive.time.PUNT.mean), 'drive time = mean (gauss → mean)');
  // (d) stall by the opponent → coach decision → AI FG (gauss 0 error, no block/shank → GOOD)
  const d = gfx.q4TrailingBy2(RTG, { seed: 5 });
  d.gs.q = 3; d.gs.clock = 700; d.gs.half = 2; d.gs.possession = otherSide(d.gs.userSide); d.gs.ball = { ytg: 60, down: 1, toGo: 10 };
  const eD = Sim.step(d.gs, d.state, gfx.scriptedRng({ weighted: 'STALL', chance: false }));
  assert.equal(eD.type, 'AI_KICK');
  assert.ok(eD.kick && eD.kick.made, 'AI kick resolved and made');
  assert.equal(eD.kick.distance, T.drive.stallYtg.NFL.mean + Tuning.kick.distance.losToKick);
  assert.equal(d.gs.score[otherSide(d.gs.userSide)], 22 + Tuning.kick.points.FG);
  const row = d.gs.kicks[d.gs.kicks.length - 1];
  assert.equal(row.ai, true); assert.equal(row.teamId, d.gs[otherSide(d.gs.userSide) + 'Id']);
  if (hasStats) assert.ok(d.state.season.kickerStats[row.teamId].fgm >= 1, 'AI kick recorded into season.kickerStats');
  deq(d.gs.pendingKickoff, { side: otherSide(d.gs.userSide) });
});

test('end-of-half: a stall in the last 40 s attempts as time expires when pMake ≥ 0.20 (USER_KICK with asTimeExpires)', (t) => {
  if (!hasData) { t.skip('team data not loaded'); return; }
  const g = gfx.endOfHalf(RTG, { seed: 2, clock: 35, ytg: 30 });
  const e = Sim.step(g.gs, g.state, gfx.scriptedRng({ weighted: 'STALL', chance: false }));
  assert.equal(e.type, 'USER_KICK');
  const ctx = g.gs.pending.ctx;
  assert.equal(ctx.asTimeExpires, true); assert.equal(ctx.decisive, false, 'end-of-half kicks are not decisive');
  assert.equal(ctx.type, 'FG'); assert.equal(g.gs.clock, 0, 'the drive ran the half out');
  Sim.applyKick(g.gs, g.state, g.rng, Kick.resolve(g.rng, ctx, null, { power: 1, aim: 0, quality: 0.9 }, { forced: 'GOOD' }));
  assert.equal(g.gs.q, T.clock.halfQuarter + 1, 'halftime reached');
  assert.equal(g.gs.half, 2);
  assert.equal(Sim.step(g.gs, g.state, g.rng).type, 'END_HALF', 'END_HALF announced after the applied kick');
  deq(g.gs.pendingKickoff, { side: g.gs.receivedFirst }, 'the team that received first kicks off');
  deq(g.gs.timeouts, { home: T.clock.timeoutsPerHalf, away: T.clock.timeoutsPerHalf }, 'timeouts reset');
});

test('two-minute drill: trailing by 2 at 2:00 with the ball starts the script; plays decrement the clock; it ends in FG / TD / TO / DOWNS / CLOCK', (t) => {
  if (!hasData) { t.skip('team data not loaded'); return; }
  const g = gfx.q4TrailingBy2(RTG, { seed: 9 });
  const e0 = Sim.step(g.gs, g.state, g.rng);
  assert.equal(e0.type, 'DRIVE'); assert.equal(e0.result, 'SCRIPT');
  assert.ok(g.gs.script && g.gs.script.ytg === 45 && g.gs.script.down === 1 && g.gs.script.toGo === T.script.toGo);
  let clock = g.gs.clock, plays = 0, ev;
  while (g.gs.script) {
    ev = Sim.step(g.gs, g.state, g.rng);
    assert.ok(g.gs.clock <= clock, 'clock only runs down');
    clock = g.gs.clock; plays++;
    assert.ok(plays < 60);
  }
  assert.ok(['USER_KICK', 'ICE_TIMEOUT', 'SCORE', 'DRIVE', 'END_GAME', 'OT_START', 'AI_KICK'].indexOf(ev.type) >= 0, ev.type);
  if (ev.type === 'USER_KICK' || ev.type === 'ICE_TIMEOUT') {
    assert.equal(g.gs.pending.ctx.decisive, true, 'a script FG is decisive');
    assert.ok(g.gs.pending.ctx.pressure >= Tuning.kick.pressure.clutchThreshold);
  }
  assert.ok(g.gs.driveLog.some((r) => r.result === 'PLAY'), 'plays are logged');
});

test('headlineTag: the tag follows the kicker\'s own line, the team result is only the secondary tag; lineText renders the real line', () => {
  const H = Tuning.sim.summary;
  const line = (o) => Object.assign({ fga: 0, fgm: 0, pat: 0, patMade: 0, long: 0, gw: 0, tf: 0 }, o);
  const tag = (o, extra) => Sim.headlineTag(Object.assign({ userLine: line(o), kicks: [], won: false, tied: false }, extra || {}));
  // a perfect day in a team loss is still a perfect day (never bad_day / postgame_loss)
  let r = tag({ fga: 2, fgm: 2, pat: 3, patMade: 3 });
  assert.equal(r.tag, 'perfect_day'); assert.equal(r.secondary, 'postgame_loss');
  assert.equal(tag({ fga: H.perfectMinFga, fgm: H.perfectMinFga }, { won: true }).tag, 'perfect_day');
  // a missed PAT spoils the perfect day but is not a bad day either → the team result
  assert.equal(tag({ fga: 2, fgm: 2, pat: 2, patMade: 1 }, { won: true }).tag, 'postgame_win');
  assert.equal(tag({ fga: 2, fgm: 2, pat: 2, patMade: 1 }).tag, 'postgame_loss');
  // bad_day only at ≤ badDayPct on ≥ badDayMinFga attempts (a 2-of-3 day in a loss is a plain loss)
  assert.equal(tag({ fga: 2, fgm: 1 }, { won: true }).tag, 'bad_day', '1-for-2 is a bad day even in a win');
  assert.equal(tag({ fga: 3, fgm: 1 }).tag, 'bad_day');
  assert.equal(tag({ fga: 3, fgm: 2 }).tag, 'postgame_loss');
  assert.equal(tag({ fga: 1, fgm: 0 }).tag, H.badDayMinFga <= 1 ? 'bad_day' : 'postgame_loss', 'a single miss is not a bad day (badDayMinFga ' + H.badDayMinFga + ')');
  // decisive miss / game-winner beat everything
  assert.equal(tag({ fga: 3, fgm: 2 }, { decisiveMiss: true }).tag, 'decisive_miss');
  assert.equal(tag({ fga: 1, fgm: 0 }, { decisiveMiss: true }).tag, 'decisive_miss');
  assert.equal(tag({ fga: 2, fgm: 2, gw: 1 }, { won: true }).tag, 'game_winner');
  // kick-row tags when the line is neither perfect nor bad
  const rows = [{ type: 'FG', made: true, distance: 33, outcome: 'GOOD' }, { type: 'FG', made: false, distance: 44, outcome: 'DOINK_OUT' }, { type: 'FG', made: true, distance: 52, outcome: 'GOOD' }];
  r = tag({ fga: 3, fgm: 2 }, { kicks: rows, won: true });
  assert.equal(r.tag, 'doink'); assert.equal(r.key.distance, 44);
  r = tag({ fga: 3, fgm: 2 }, { kicks: [rows[0], { type: 'FG', made: false, distance: 40, outcome: 'BLOCKED' }, rows[2]] });
  assert.equal(r.tag, 'blocked');
  r = tag({ fga: 3, fgm: 2 }, { kicks: [rows[0], { type: 'FG', made: false, distance: 40, outcome: 'WIDE_L' }, rows[2]] });
  assert.equal(r.tag, 'fifty_plus'); assert.equal(r.key.distance, 52);
  // the {line} slot is the real line, never the template fallback
  assert.equal(Sim.lineText(line({ fga: 3, fgm: 2 })), '2-for-3');
  assert.equal(Sim.lineText(line({ fga: 2, fgm: 2, pat: 2, patMade: 2 })), '2-for-2 and 2-for-2 on PATs');
  assert.equal(Sim.lineText(line({ pat: 3, patMade: 3 })), '3-for-3 on PATs');
  assert.equal(Sim.lineText(line({})), '0-for-0');
  assert.equal(Sim.lineText(null), '0-for-0');
});

test('finishGame: summary shape, schedule/results written once, meters/xp applied, state.game cleared, weekGameDone, headline', (t) => {
  if (!hasData) { t.skip('team data not loaded'); return; }
  const g = gfx.startUserGame(RTG, { seed: 14 });
  const { state, gs } = g;
  const teamId = state.player.teamId;
  const before = { xp: state.player.xp, games: state.stats.season.games, res: J(state.season.results[teamId]) };
  assert.throws(() => Sim.finishGame(gs, state, g.rng), /not over/);
  const { summary } = gfx.playGame(RTG, g);
  assert.equal(summary.gameId, gs.id);
  deq(summary.score, gs.score);
  assert.equal(typeof summary.won, 'boolean');
  for (const k of ['fga', 'fgm', 'pat', 'patMade', 'long', 'gw']) assert.equal(typeof summary.userLine[k], 'number', 'userLine.' + k);
  assert.ok(Array.isArray(summary.xp.items) && typeof summary.xp.total === 'number');
  assert.equal(state.player.xp, before.xp + summary.xp.total, 'xp credited');
  assert.ok(summary.xp.total > 0);
  for (const k of ['morale', 'trust', 'fans', 'js', 'fame']) assert.equal(typeof summary.meters[k], 'number');
  assert.ok(Array.isArray(summary.kicks) && Array.isArray(summary.drives));
  assert.ok(summary.kicks.every((k) => k.teamId === teamId && !k.ai), 'summary.kicks are the user\'s own');
  if (RTG.Stats) assert.ok(['A', 'B', 'C', 'D', 'F'].indexOf(summary.grade) >= 0, 'grade ' + summary.grade);
  if (RTG.Events) { assert.ok(summary.headline && typeof summary.headline.text === 'string' && summary.headline.text.length > 0); assert.equal(state.headlines[state.headlines.length - 1].id, summary.headline.id); }
  assert.equal(state.game, null); assert.equal(state.season.weekGameDone, true);
  const sched = state.season.schedule.find((x) => x.id === gs.id);
  assert.equal(sched.played, true); deq(sched.score, gs.score); assert.ok(Array.isArray(sched.log) && sched.log.length > 0);
  const res = state.season.results[teamId];
  assert.equal(res.w + res.l + res.t, before.res.w + before.res.l + before.res.t + 1, 'one result recorded');
  if (hasStats) assert.equal(state.stats.season.games, before.games + 1, 'Stats.recordGame');
  const v = Schema.validate(state);
  assert.ok(v.ok, v.errors.join('; '));
  // calling finishGame twice must not double-record the result
  gs.done = true;
  Sim.finishGame(gs, state, g.rng);
  assert.equal(res.w + res.l + res.t, before.res.w + before.res.l + before.res.t + 1, 'still one result');
});

test('user benched or injured: the rival kicks (AI rows), no USER_KICK events; the user kicks nothing', (t) => {
  if (!hasData) { t.skip('team data not loaded'); return; }
  const g = gfx.startUserGame(RTG, { seed: 15 });
  g.state.player.injury = { type: 'QUAD', weeksLeft: 2, careerThreat: false };
  const done = gfx.playGame(RTG, g);
  assert.equal(done.userKicks, 0);
  assert.ok(done.events.every((e) => e.type !== 'USER_KICK' && e.type !== 'ICE_TIMEOUT'));
  const teamId = g.state.player.teamId;
  const teamRows = g.gs.kicks.filter((k) => k.teamId === teamId);
  assert.ok(teamRows.every((k) => k.ai === true), 'the rival\'s kicks are AI rows');
  assert.equal(done.summary.kicks.length, 0); assert.equal(done.summary.played, false);
});

test('simAiGame: both kickers\' stats land in season.kickerStats, the schedule game is marked played, results are left to Season', (t) => {
  if (!hasData) { t.skip('team data not loaded'); return; }
  const state = gfx.aiState(RTG, { league: 'COLLEGE' });
  const teams = state.leagues.college.teams;
  const game = { id: 'C1-w03-TST', week: 3, homeId: teams[1].id, awayId: teams[20].id, kind: 'REG', played: false };
  state.season.schedule.push(game);
  const res = Sim.simAiGame(state, RTG.RNG.create(99), { league: 'COLLEGE', gameId: game.id });
  assert.equal(game.played, true); deq(game.score, res.score); assert.equal(game.ot, res.ot);
  assert.equal(game.log, undefined, 'no drive log kept for AI games');
  assert.deepEqual(Object.keys(state.season.results), [], 'results are written by Season.simOtherGames');
  if (hasStats) {
    const ks = state.season.kickerStats;
    const kicks = res.kicks.length;
    const recorded = (ks[teams[1].id] ? ks[teams[1].id].fga + ks[teams[1].id].pat : 0) + (ks[teams[20].id] ? ks[teams[20].id].fga + ks[teams[20].id].pat : 0);
    assert.equal(recorded, kicks, 'every kick recorded once');
  }
  assert.equal(res.gs.userSide, null); assert.equal(state.game, null);
  // college PAT distance
  assert.ok(res.kicks.filter((k) => k.type === 'PAT').every((k) => k.distance === Tuning.kick.distance.patCollege));
});

test('a scripted applyKick sequence reproduces an exact final score (points recomputed from the log) and replays identically', (t) => {
  if (!hasData) { t.skip('team data not loaded'); return; }
  const script = (ctx, i) => (i % 3 === 2 ? 'WIDE_R' : (ctx.type === 'PAT' && i % 4 === 1 ? { outcome: 'BLOCKED', blockReturnTd: true } : 'GOOD'));
  const run = () => gfx.playGame(RTG, gfx.startUserGame(RTG, { seed: 33 }), { forced: script, finish: false });
  const g1 = gfx.startUserGame(RTG, { seed: 33 });
  gfx.playGame(RTG, g1, { forced: script, finish: false });
  const g2 = gfx.startUserGame(RTG, { seed: 33 });
  gfx.playGame(RTG, g2, { forced: script, finish: false });
  deq(g1.gs.score, g2.gs.score); deq(g1.gs.driveLog, g2.gs.driveLog);
  void run;
  // recompute the score from the log rows and the kick rows
  const gs = g1.gs;
  const pts = { home: 0, away: 0 };
  for (const r of gs.driveLog) {
    if (r.result === 'TD') pts[r.side] += T.points.TD;
    if (r.result === '2PT') pts[r.side] += T.points.twoPoint;
    if (r.result === 'PAT_MISS' && /returned/.test(r.text)) pts[otherSide(r.side)] += Tuning.kick.points.blockReturnPat;
  }
  for (const k of gs.kicks) {
    const side = k.teamId === gs.homeId ? 'home' : 'away';
    if (k.made) pts[side] += k.type === 'PAT' ? Tuning.kick.points.PAT : Tuning.kick.points.FG;
  }
  deq(pts, gs.score, 'log + kicks account for every point');
  assert.ok(gs.kicks.some((k) => !k.ai && !k.made), 'the script produced user misses');
});

test('driveLogLine renders period, clock, side and text for events and log rows', (t) => {
  if (!hasData) { t.skip('team data not loaded'); return; }
  const g = gfx.q4TrailingBy2(RTG, { seed: 1 });
  const line = Sim.driveLogLine(g.gs, { type: 'DRIVE', text: 'Punt', side: 'home' });
  assert.match(line, /^Q4 2:00 · /); assert.ok(line.indexOf(g.gs.homeId) >= 0 && /Punt$/.test(line));
  const row = Sim.driveLogLine(g.gs, { q: 1, clock: 754, side: 'away', text: 'Touchdown drive', ytg: 0, result: 'TD' });
  assert.match(row, /^Q1 12:34 · /);
  const o = gfx.overtimeNfl(RTG, { seed: 1 });
  assert.match(Sim.driveLogLine(o.gs, { text: 'x' }), /^OT 10:00/);
  const c = gfx.overtimeCollege(RTG, { seed: 1 });
  assert.match(Sim.driveLogLine(c.gs, { text: 'x' }), /^OT · x$/);
});

test('fixtures: every named moment is a valid, JSON-safe state', (t) => {
  if (!hasData) { t.skip('team data not loaded'); return; }
  const all = gfx.all(RTG);
  for (const name of Object.keys(all)) {
    const { state, gs } = all[name];
    const v = Schema.validate(state);
    assert.ok(v.ok, name + ': ' + v.errors.join('; '));
    deq(JSON.parse(JSON.stringify(gs)), gs, name + ' JSON-safe');
    assert.equal(state.game, gs);
  }
});
