/**
 * integration.test.js — the whole engine end to end through the RTG.Engine facade (SPEC §3.5.20, §3.6, §6.3).
 *
 *  (a) a hand-driven career start: Engine.newCareer → the 6 showcase kicks via Engine.sessionKick (Kick.aiInput
 *      triples) → college offers → Engine.decide → COLLEGE.PRE (camp battle via sessionKick when the §2.2 rule
 *      applies) → Engine.nextPhase → week 1 via startUserGame / simToKick / applyUserKick (+ applyUserKickoff,
 *      ICE_TIMEOUT) until END_GAME → finishUserGame → endWeek. Schema.validate passes after EVERY Engine call,
 *      state.rngState is kept in sync with the rng and changes on every drawing call.
 *  (b) Engine.autoPlayCareer for seeds 1..5 to RETIRED: deep scan for NaN / Infinity / undefined / functions,
 *      Schema.validate, Save.serialize → deserialize equality (caches stripped).
 *  (c) JSON round-trip equality of the state after every season of those careers.
 *  (d) a mid-game save/load: serialize while state.game.pending is a USER_KICK, deserialize, apply the same kick on
 *      both copies (identical results), finish the game and the week on the loaded copy — nothing throws.
 *  (e) determinism: two autoPlayCareer runs with the same seed and difficulty produce identical final stats.
 *
 * The engine is evaluated in this process's main context (load({realm:'this'})): it is the realm a browser runs it
 * in and ~3× faster than the contextified sandbox the unit suites use (purity.test.js covers the sandbox load).
 *
 *   node kicker/test/integration.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load');
const RTG = load({ realm: 'this' });

const { Engine, Schema, Kick, Save, Util, RNG } = RTG;
const NOW = 1757000000000;
const SEEDS = [1, 2, 3, 4, 5];

// ═══════════════════════════════ helpers ═══════════════════════════════

function validate(state, where) {
  const v = Schema.validate(state);
  assert.ok(v.ok, where + ': Schema.validate → ' + v.errors.slice(0, 6).join('; '));
}

/** Deep scan for values that must never appear in a CareerState (JSON-safety). */
function scanBad(obj, out, p, depth) {
  if (out.length >= 25 || obj === null) return;
  const t = typeof obj;
  if (t === 'number') { if (obj !== obj || obj === Infinity || obj === -Infinity) out.push(p + '=' + obj); return; }
  if (t === 'undefined') { out.push(p + '=undefined'); return; }
  if (t === 'function') { out.push(p + '=function'); return; }
  if (t === 'bigint' || t === 'symbol') { out.push(p + '=' + t); return; }
  if (t !== 'object' || depth > 60) return;
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) scanBad(obj[keys[i]], out, p + '.' + keys[i], depth + 1);
}

/** Serialisable view of a state (non-persisted caches stripped) for equality checks. */
function canon(state) {
  const c = Util.deepClone(state);
  Save.stripCaches(c);
  return c;
}

/**
 * Wraps one Engine call: runs it, asserts Schema.validate and rngState sync afterwards and (when `draws`) that the
 * rng advanced. Returns the call's result.
 */
function step(track, name, draws, fn) {
  const { state, rng } = track;
  const before = rng.state();
  const out = fn();
  track.calls++;
  validate(state, name + ' (call ' + track.calls + ')');
  assert.equal(state.rngState, rng.state(), name + ': state.rngState mirrors the rng');
  if (draws) assert.notEqual(rng.state(), before, name + ': the rng advanced');
  if (draws) track.drawing++;
  return out;
}

/** Play every kick of the pending KickSession with AI triples through Engine.sessionKick. */
function playSession(track) {
  const { state, rng } = track;
  assert.equal(state.pending && state.pending.kind, 'KICKS');
  const sess = state.pending.session;
  const kind = sess.kind;
  let last = null, guard = sess.contexts.length + 2;
  while (state.pending && state.pending.kind === 'KICKS' && state.pending.session === sess && guard-- > 0) {
    const idx = sess.results.length;
    const ctx = sess.contexts[idx];
    assert.ok(ctx, kind + ': a context for kick ' + idx);
    const input = ctx.type === 'KO' ? null : Kick.aiInput(rng, ctx, null);
    last = step(track, 'sessionKick(' + kind + ' #' + idx + ')', true, () => Engine.sessionKick(state, rng, input));
    assert.ok(last.result && typeof last.result.made === 'boolean', 'a KickResult per session kick');
    if (last.done) break;
  }
  assert.ok(last && last.done, kind + ': the session completed');
  assert.ok(last.outcome, kind + ': Career.finishSession produced an outcome');
  return last;
}

/** Drive the in-progress user game with AI triples until END_GAME; returns the number of user kicks applied. */
function playGame(track, onPending) {
  const { state, rng } = track;
  let kicks = 0, guard = 400, ev = null;
  while (guard-- > 0) {
    ev = step(track, 'simToKick', true, () => Engine.simToKick(state, rng));
    if (ev.type === 'END_GAME' || ev.type === 'END') break;
    if (ev.type === 'ICE_TIMEOUT') continue;                    // the queued USER_KICK arrives on the next simToKick
    const gs = state.game;
    assert.ok(gs && gs.pending, ev.type + ' comes with a pending kick');
    if (onPending) onPending(ev);
    if (ev.type === 'USER_KICK') {
      const input = Kick.aiInput(rng, gs.pending.ctx, null);
      const res = step(track, 'applyUserKick', true, () => Engine.applyUserKick(state, rng, input));
      assert.ok(res && typeof res.made === 'boolean' && res.tags, 'applyUserKick returns a KickResult');
      kicks++;
    } else if (ev.type === 'USER_KICKOFF') {
      const res = step(track, 'applyUserKickoff', true, () => Engine.applyUserKickoff(state, rng, null));
      assert.equal(res.type, 'KO');
    } else {
      assert.fail('simToKick yielded ' + ev.type);
    }
  }
  assert.equal(ev.type, 'END_GAME', 'the game reached END_GAME');
  assert.ok(state.game && state.game.done, 'state.game.done after END_GAME');
  return kicks;
}

// ═══════════════════════════════ (a) hand-driven career start ═══════════════════════════════

test('(a) newCareer → showcase → offers → COLLEGE.PRE → week 1 game → endWeek, validating after every Engine call', () => {
  const created = Engine.newCareer({ name: 'Sam Page', archetype: 'CANNON', difficulty: 'pro', seed: 42 }, NOW);
  const track = { state: created.state, rng: created.rng, calls: 0, drawing: 0 };
  const { state, rng } = track;
  validate(state, 'newCareer');
  assert.equal(state.seed, 42); assert.equal(state.rngState, rng.state());
  assert.equal(state.stage, 'HS'); assert.equal(state.phase, 'SHOWCASE');
  assert.equal(state.pending && state.pending.kind, 'KICKS');
  assert.equal(state.pending.session.kind, 'SHOWCASE');
  assert.equal(state.pending.session.contexts.length, 6, 'six showcase kicks');

  // showcase → stars + college offers
  const show = playSession(track);
  assert.equal(show.outcome.kind, 'SHOWCASE');
  assert.ok(state.player.stars >= 2 && state.player.stars <= 5, 'stars ' + state.player.stars);
  assert.equal(state.stage, 'HS'); assert.equal(state.phase, 'OFFERS');
  assert.equal(state.pending && state.pending.kind, 'DECISION');
  const dec = state.pending.decision;
  assert.equal(dec.kind, 'OFFERS_COLLEGE');
  assert.ok(dec.options.length >= 1, 'at least one offer');
  assert.ok(dec.payload.offers.every((o) => Schema.teamIn(state.leagues.college, o.teamId)), 'offers reference college teams');

  // pick the first offer → COLLEGE.PRE
  const out = step(track, 'decide(OFFERS_COLLEGE)', true, () => Engine.decide(state, rng, { kind: 'OFFERS_COLLEGE', optionId: dec.options[0].id }));
  assert.equal(out.kind, 'OFFERS_COLLEGE');
  assert.equal(state.stage, 'COLLEGE'); assert.equal(state.phase, 'PRE'); assert.equal(state.week, 0);
  assert.equal(state.player.league, 'COLLEGE');
  assert.equal(state.player.teamId, dec.payload.offers[0].teamId);
  assert.equal(state.season.league, 'COLLEGE');
  assert.ok(state.season.schedule.length >= 288, 'a college schedule exists');
  assert.equal(state.season.goals.length, 3, 'three season goals');
  if (state.pending) {                                            // §2.2 preseason camp battle
    assert.equal(state.pending.kind, 'KICKS');
    assert.equal(state.pending.session.kind, 'CAMP');
    const camp = playSession(track);
    assert.equal(camp.outcome.kind, 'CAMP');
  }
  assert.equal(state.pending, null);
  assert.ok(state.player.role === 'K1' || state.player.role === 'K2');

  // PRE → REG week 1
  const np = step(track, 'nextPhase(PRE→REG)', false, () => Engine.nextPhase(state, rng));
  assert.equal(np.phase, 'REG'); assert.equal(state.phase, 'REG'); assert.equal(state.week, 1);
  assert.throws(() => Engine.nextPhase(state, rng), /in season/, 'nextPhase refuses in season');
  assert.throws(() => Engine.endWeek(state, rng), /play or sim/, 'endWeek refuses before the game');

  // training + XP
  const xpBefore = state.player.xp;
  const tr = step(track, 'train(ACC)', false, () => Engine.train(state, rng, 'ACC'));
  assert.ok(tr.xp > 0 && state.player.xp === xpBefore + tr.xp, 'training XP credited');
  assert.equal(state.season.focus, 'ACC'); assert.equal(state.season.trainingDone, true);
  assert.throws(() => Engine.train(state, rng, 'POW'), /done/, 'one training per week');
  const acc0 = state.player.attrs.ACC;
  const sp = step(track, 'spendXp(ACC)', false, () => Engine.spendXp(state, 'ACC'));
  if (sp.ok) assert.equal(state.player.attrs.ACC, acc0 + 1);
  else assert.ok(sp.reason, 'a reason when the raise is refused');

  // the week-1 game
  assert.throws(() => Engine.applyUserKick(state, rng, { power: 1, aim: 0, quality: 0.9 }), /no game/, 'applyUserKick without a game');
  const ref = RTG.Season.userGameRef(state);
  assert.ok(ref && ref.week === 1 && !ref.played, 'a week-1 game');
  const gs = step(track, 'startUserGame', true, () => Engine.startUserGame(state, rng));
  assert.equal(state.game, gs); assert.equal(gs.id, ref.gameId);
  assert.ok(gs.userSide === 'home' || gs.userSide === 'away');
  assert.throws(() => Engine.applyUserKick(state, rng, { power: 1, aim: 0, quality: 0.9 }), /no pending kick/, 'applyUserKick without a pending kick');
  assert.throws(() => Engine.endWeek(state, rng), /not done|in progress/, 'endWeek refuses with a game in progress');
  const kicks = playGame(track, (ev) => {
    const ctx = state.game.pending.ctx;
    assert.ok(ctx.kicker && ctx.kicker.attrs, 'the context snapshots the kicker');
    assert.equal(ctx.isUser, true);
    assert.equal(ctx.league, 'COLLEGE');
    if (ev.type === 'USER_KICK') assert.ok(ctx.type === 'FG' || ctx.type === 'PAT');
  });
  const summary = step(track, 'finishUserGame', true, () => Engine.finishUserGame(state, rng));
  assert.equal(state.game, null); assert.equal(state.season.weekGameDone, true);
  assert.equal(summary.gameId, ref.gameId);
  assert.ok(summary.score && typeof summary.won === 'boolean' && summary.userLine && typeof summary.grade === 'string');
  assert.equal(summary.userLine.fga + summary.userLine.pat, kicks, 'every applied kick is on the user line');
  assert.equal(state.stats.kicks.filter((r) => r.gameId === ref.gameId && r.type !== 'KO').length, kicks, 'kick log rows for the game');
  assert.equal(state.stats.season.fga + state.stats.season.pat, kicks);
  const game = state.season.schedule.find((g) => g.id === ref.gameId);
  assert.ok(game.played && game.score, 'the schedule game is marked played');
  assert.throws(() => Engine.startUserGame(state, rng), /already done/, 'no second game this week');

  // close the week (an event may roll → choice 0)
  const rep = step(track, 'endWeek', true, () => Engine.endWeek(state, rng));
  assert.equal(rep.week, 1); assert.equal(state.week, 2); assert.equal(state.phase, 'REG');
  assert.ok(Array.isArray(rep.headlines) && Array.isArray(rep.messages));
  assert.equal(state.season.weekGameDone, false); assert.equal(state.season.trainingDone, false);
  const others = state.season.schedule.filter((g) => g.week === 1);
  assert.ok(others.every((g) => g.played), 'every week-1 game was simulated');
  assert.ok(state.season.standings.length === 48, 'standings for 48 teams');
  if (state.pending) {
    assert.equal(state.pending.kind, 'EVENT');
    const ev = step(track, 'chooseEvent(0)', false, () => Engine.chooseEvent(state, rng, 0));
    assert.ok(ev && ev.effects !== undefined);
    assert.equal(state.pending, null);
  }
  assert.ok(track.calls >= 20 && track.drawing >= 12, track.calls + ' Engine calls, ' + track.drawing + ' drawing');
});

// ═══════════════════════════════ (b) (c) (e) auto careers ═══════════════════════════════

const careers = new Map();

/** A full auto career for `seed`; `jsonEvery` checks the JSON round-trip after every season. */
function runCareer(seed, jsonEvery) {
  const created = Engine.newCareer({ name: 'Auto ' + seed, archetype: ['CANNON', 'SURGEON', 'ICEMAN', 'SOCCER'][seed % 4], difficulty: 'pro', seed }, NOW + seed);
  const { state, rng } = created;
  const seasons = [];
  const t0 = Date.now();
  Engine.autoPlayCareer(state, rng, {
    onSeason(st, line) {
      seasons.push({ year: st.year, league: line && line.league, fga: line && line.stats.fga, fgm: line && line.stats.fgm, ovr: line && line.ovr });
      if (jsonEvery) {
        const j = JSON.parse(JSON.stringify(st));
        const diff = Util.deepDiff(j, st);
        assert.equal(diff, '', 'seed ' + seed + ' year ' + st.year + ': JSON round trip differs at ' + diff);
        assert.equal(st.rngState, rng.state(), 'seed ' + seed + ' year ' + st.year + ': rngState synced after the season');
      }
    }
  });
  return { state, rng, seasons, ms: Date.now() - t0 };
}

test('(b) autoPlayCareer seeds 1..5 reach RETIRED with JSON-safe, valid states that survive Save.serialize → deserialize', (t) => {
  for (const seed of SEEDS) {
    const run = runCareer(seed, true);
    careers.set(seed, run);
    const { state, rng } = run;
    assert.equal(state.stage, 'RETIRED', 'seed ' + seed + ' retired (' + state.stage + '/' + state.phase + ' y' + state.year + ')');
    assert.equal(state.phase, 'LEGACY');
    assert.equal(state.pending, null, 'seed ' + seed + ': nothing pending after retirement');
    assert.ok(run.seasons.length >= 4, 'seed ' + seed + ': ' + run.seasons.length + ' seasons');
    assert.equal(run.seasons[0].league, 'COLLEGE', 'seed ' + seed + ' starts in college');
    assert.ok(state.history.seasons.length === run.seasons.length, 'one SeasonLine per season');
    const bad = [];
    scanBad(state, bad, 'state', 0);
    assert.deepEqual(bad, [], 'seed ' + seed + ': NaN / undefined / functions in state: ' + bad.join(', '));
    validate(state, 'seed ' + seed + ' final state');
    assert.ok(state.flags.legacy || state.history.timeline.some((e) => e.kind === 'RETIRED' || /retire/i.test(e.text)), 'seed ' + seed + ': a retirement record');
    const hof = RTG.Awards.hofScore(state);
    assert.ok(typeof hof.score === 'number' && isFinite(hof.score) && hof.verdict, 'seed ' + seed + ': a HOF verdict');

    // save → load equality (caches stripped)
    const blob = Save.serialize(state, rng, NOW + 99);
    assert.equal(blob.v, RTG.SAVE_VERSION); assert.equal(blob.seed, seed); assert.equal(blob.rngState, rng.state());
    const back = Save.deserialize(JSON.parse(JSON.stringify(blob)));
    assert.ok(back && !back.error, 'seed ' + seed + ': deserialize ok (' + (back && back.error) + ')');
    assert.equal(back.rngState, rng.state());
    const diff = Util.deepDiff(canon(back.state), canon(state));
    assert.equal(diff, '', 'seed ' + seed + ': save/load round trip differs at ' + diff);
    validate(back.state, 'seed ' + seed + ' loaded state');
    t.diagnostic('seed ' + seed + ': ' + run.seasons.length + ' seasons, ' + run.ms + ' ms, career ' + state.stats.career.fgm + '/' + state.stats.career.fga + ' FG, long ' + state.stats.career.long + ', HOF ' + hof.verdict + ' (' + hof.score + '), ' + (JSON.stringify(blob).length / 1024).toFixed(0) + ' KB');
  }
});

test('(c) the state after every season of those careers survives a JSON round trip (checked inside the (b) runs)', () => {
  assert.equal(careers.size, SEEDS.length, 'the (b) careers ran');
  for (const seed of SEEDS) {
    const run = careers.get(seed);
    assert.ok(run.seasons.length >= 4);
    for (const s of run.seasons) assert.ok(s.league === 'COLLEGE' || s.league === 'NFL', 'seed ' + seed + ' season line league');
  }
});

test('(e) determinism: the same seed and difficulty produce identical final stats, history and rng state', () => {
  const a = careers.get(1) || runCareer(1, false);
  const b = runCareer(1, false);
  assert.equal(b.rng.state(), a.rng.state(), 'identical rng state');
  const pick = (s) => ({ stats: s.stats, seasons: s.history.seasons, awards: s.history.awards, earnings: s.history.earnings, teams: s.history.teams, player: s.player, year: s.year, records: s.records });
  const diff = Util.deepDiff(JSON.parse(JSON.stringify(pick(b.state))), JSON.parse(JSON.stringify(pick(a.state))));
  assert.equal(diff, '', 'careers differ at ' + diff);
  const full = Util.deepDiff(canon(b.state), canon(a.state));
  assert.equal(full, '', 'whole states differ at ' + full);
});

// ═══════════════════════════════ (d) mid-game save / load ═══════════════════════════════

test('(d) a save taken while a USER_KICK is pending loads and the game / week finish on the loaded copy', () => {
  const created = Engine.newCareer({ name: 'Mid Game', archetype: 'SURGEON', difficulty: 'pro', seed: 77 }, NOW);
  const { state, rng } = created;
  Engine.settlePending(state, rng);                               // showcase + offer → COLLEGE.PRE (camp battle settled)
  assert.equal(state.stage, 'COLLEGE'); assert.equal(state.phase, 'PRE');
  Engine.nextPhase(state, rng);
  assert.equal(state.phase, 'REG');
  if (state.player.role !== 'K1') state.player.role = 'K1';       // a lost auto camp battle would bench the user: make sure they kick
  // play weeks until a game offers the user a kick (a team may never attempt one in a given game)
  let ref = null, ev = null, weeks = 6;
  while (weeks-- > 0) {
    ref = RTG.Season.userGameRef(state);
    if (ref) {
      Engine.startUserGame(state, rng);
      ev = Engine.simToKick(state, rng);
      let steps = 60;
      while (ev.type !== 'USER_KICK' && ev.type !== 'END_GAME' && steps-- > 0) {
        if (ev.type === 'USER_KICKOFF') Engine.applyUserKickoff(state, rng, null);
        ev = Engine.simToKick(state, rng);
      }
      if (ev.type === 'USER_KICK') break;
      Engine.finishUserGame(state, rng);
    }
    Engine.endWeek(state, rng);
    Engine.settlePending(state, rng);
  }
  assert.ok(ev && ev.type === 'USER_KICK', 'reached a pending user kick');
  assert.equal(state.game.pending.type, 'USER_KICK');
  validate(state, 'mid-game state');

  const blob = Save.serialize(state, rng, NOW + 1);
  const json = JSON.stringify(blob);
  const loaded = Save.deserialize(json);
  assert.ok(loaded && !loaded.error, 'mid-game deserialize ok (' + (loaded && loaded.error) + ')');
  const s2 = loaded.state, r2 = RNG.create(loaded.rngState);
  assert.equal(r2.state(), rng.state());
  assert.ok(s2.game && s2.game.pending && s2.game.pending.type === 'USER_KICK', 'the pending kick survived the round trip');
  assert.equal(Util.deepDiff(canon(s2), canon(state)), '', 'loaded state equals the saved one');

  // the same triple on both copies gives the same result and the same game afterwards
  const input = Kick.aiInput(RNG.create(5), state.game.pending.ctx, null);
  const res1 = Engine.applyUserKick(state, rng, input);
  const res2 = Engine.applyUserKick(s2, r2, input);
  assert.equal(Util.deepDiff(JSON.parse(JSON.stringify(res2)), JSON.parse(JSON.stringify(res1))), '', 'identical KickResults');
  assert.equal(r2.state(), rng.state());
  validate(s2, 'loaded copy after the kick');

  // finish the game and the week on the loaded copy
  const track = { state: s2, rng: r2, calls: 0, drawing: 0 };
  let ev2 = Engine.simToKick(s2, r2), guard2 = 400;
  while (ev2.type !== 'END_GAME' && ev2.type !== 'END' && guard2-- > 0) {
    if (ev2.type === 'USER_KICK') Engine.applyUserKick(s2, r2, Kick.aiInput(r2, s2.game.pending.ctx, null));
    else if (ev2.type === 'USER_KICKOFF') Engine.applyUserKickoff(s2, r2, null);
    ev2 = step(track, 'simToKick', false, () => Engine.simToKick(s2, r2));
  }
  assert.equal(ev2.type, 'END_GAME');
  const summary = Engine.finishUserGame(s2, r2);
  assert.ok(summary && summary.gameId === ref.gameId);
  assert.equal(s2.game, null);
  const rep = Engine.endWeek(s2, r2);
  assert.ok(rep && rep.week >= 1);
  Engine.settlePending(s2, r2);
  validate(s2, 'loaded copy after the week');
  assert.equal(Util.deepDiff(JSON.parse(JSON.stringify(s2)), s2), '', 'JSON round trip after the week');
});
