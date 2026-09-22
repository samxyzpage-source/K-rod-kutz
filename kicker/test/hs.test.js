/**
 * hs.test.js — RTG.HS (SPEC §2.7.0, D23): the high-school senior season that opens a career.
 * Five games, a live scoreboard inside each, a recruiting board that moves game by game, and the star rating
 * and college offers that fall out of the whole stretch.
 *
 *   node kicker/test/hs.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RTG = require('./load')();
const kfx = require('./fixtures/career');

const { HS, Engine, Schema, Tuning, Career, Player } = RTG;
const T = Tuning.hs;
const J = (v) => JSON.parse(JSON.stringify(v));

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

// ═══════════════════════════════ the season ═══════════════════════════════

test('§3.5 public API', () => {
  for (const f of ['season', 'startGame', 'afterKick', 'finishGame', 'finishSeason', 'ratingOf', 'tierOf', 'inSeason', 'current']) {
    assert.equal(typeof HS[f], 'function', 'HS.' + f);
  }
  assert.ok(T && T.games === 5 && T.interest && T.rating, 'Tuning.hs block');
});

test('season: a school, five dated games with a rivalry and a playoff opener, and a recruiting board', () => {
  const { state } = kfx.newCareer(RTG, { seed: 3 });
  const hs = HS.current(state);
  assert.ok(hs, 'flags.hs');
  assert.equal(hs.idx, 0);
  assert.equal(hs.games.length, T.games);
  assert.ok(hs.school.full.indexOf(state.player.hometown.city) === 0, 'the school is named for the hometown: ' + hs.school.full);
  assert.ok(['warm', 'temperate', 'cold', 'dome'].indexOf(hs.school.climate) >= 0);
  const weeks = hs.games.map((g) => g.week);
  assert.deepEqual(J(weeks), J([0, 1, 2, 3, 4].map((i) => T.firstWeek + i)), 'weeks 6-10');
  assert.equal(hs.games.filter((g) => g.rivalry).length, 1);
  assert.equal(hs.games.filter((g) => g.playoff).length, 1);
  assert.equal(hs.games[T.rivalryIdx].rivalry, true);
  assert.equal(hs.games[T.playoffIdx].playoff, true);
  assert.ok(hs.games.every((g) => g.opp && g.opp !== hs.school.full), 'real opponents');
  assert.ok(hs.games.some((g) => g.home) && hs.games.some((g) => !g.home), 'home and away');
  assert.equal(hs.board.length, Math.min(T.interest.board, state.leagues.college.teams.length));
  assert.ok(hs.board.every((b) => Schema.teamIn(state.leagues.college, b.teamId)), 'the board names real colleges');
  assert.ok(hs.board.every((b) => b.interest >= T.interest.min && b.interest <= T.interest.max));
  for (let i = 1; i < hs.board.length; i++) assert.ok(hs.board[i - 1].interest >= hs.board[i].interest, 'sorted by interest');
  ok(state, 'a fresh senior season');
});

test('season costs the parent rng exactly one draw (a fork), and is deterministic for a seed', () => {
  const a = kfx.newCareer(RTG, { seed: 5 }).state;
  const b = kfx.newCareer(RTG, { seed: 5 }).state;
  assert.equal(RTG.Util.deepDiff(J(a.flags.hs), J(b.flags.hs)), '');
  const c = kfx.newCareer(RTG, { seed: 6 }).state;
  assert.notEqual(RTG.Util.deepDiff(J(a.flags.hs), J(c.flags.hs)), '');
  // a second season on the same state: one draw on the parent
  const rng = counting(11);
  HS.season(a, rng);
  assert.equal(rng.draws, 1, 'HS.season: 1 parent draw');
});

// ═══════════════════════════════ a game ═══════════════════════════════

test('startGame: one fork, contexts for every chance, no pending twice, nothing after the fifth', () => {
  const { state, rng } = kfx.newCareer(RTG, { seed: 4 });
  const count = counting(9);
  const sess = HS.startGame(state, count);
  assert.equal(count.draws, 1, 'HS.startGame: 1 parent draw');
  assert.equal(sess.kind, 'HS_GAME');
  assert.equal(state.pending.kind, 'KICKS');
  assert.equal(state.pending.session, sess);
  assert.ok(sess.contexts.length >= T.chances[0] && sess.contexts.length <= T.chances[1], 'chances in range');
  assert.equal(sess.contexts.length, sess.chances.length);
  assert.ok(sess.contexts.every((c) => c.isUser === true && (c.type === 'FG' || c.type === 'PAT')));
  assert.ok(sess.contexts.every((c) => c.label && c.label.length > 3), 'every kick is labelled');
  assert.ok(sess.contexts.filter((c) => c.type === 'FG').every((c) => c.distance >= T.fgRange[0] && c.distance <= T.fgRange[1] + 0),
    'FG distances in range: ' + sess.contexts.map((c) => c.distance).join(','));
  assert.throws(() => HS.startGame(state, rng), /already pending/);
  const done = kfx.newCareer(RTG, { seed: 4 }).state;
  done.flags.hs.idx = T.games;
  assert.throws(() => HS.startGame(done, rng), /season is over/);
  ok(state, 'game open');
});

test('the scoreboard runs live: every kick moves it, and the next context sees the real score', () => {
  const { state, rng, session } = kfx.hsGame(RTG, { seed: 12 });
  const seen = [];
  for (let i = 0; i < session.contexts.length; i++) {
    const before = { us: session.score.us, them: session.score.them };
    const ctx = session.contexts[i];
    assert.equal(ctx.game.scoreFor, before.us, 'kick ' + i + ' sees the live score');
    assert.equal(ctx.game.scoreAgainst, before.them, 'kick ' + i + ' sees the live opponent score');
    const r = Engine.sessionKick(state, rng, null, { forced: { outcome: i % 2 === 0 ? 'GOOD' : 'WIDE_L' } });
    const pts = ctx.type === 'PAT' ? 1 : 3;
    seen.push({ made: i % 2 === 0, pts: pts });
    if (i % 2 === 0) assert.equal(session.score.us >= before.us + pts, true, 'a make adds ' + pts);
    if (r.done) break;
  }
  const g = state.flags.hs.games[0];
  assert.equal(g.played, true);
  assert.equal(g.us, session.score.us);
  assert.equal(g.fgm + g.xpm, seen.filter((x) => x.made).length, 'the tally matches the makes');
  assert.equal(g.kicks.length, session.contexts.length, 'a drive-log row per kick');
  ok(state, 'after a game');
});

test('the rivalry and playoff games end on the kicker: the last chance is a field goal with the game on it', () => {
  for (const seed of [1, 2, 3, 7, 21]) {
    const { state, rng } = kfx.newCareer(RTG, { seed: seed });
    for (let g = 0; g < T.games; g++) {
      const sess = HS.startGame(state, rng);
      const last = sess.chances[sess.chances.length - 1];
      if (g >= T.finish.fromIdx) {
        assert.equal(last.type, 'FG', 'seed ' + seed + ' game ' + g + ': the last chance is a field goal');
        assert.ok(last.trail >= T.finish.trail[0] && last.trail <= T.finish.trail[1], 'trailing by 1-2');
        assert.equal(sess.oppAfter, 0, 'no answering drive after a walk-off');
      }
      while (state.pending && state.pending.kind === 'KICKS') Engine.sessionKick(state, rng, null, { forced: { outcome: 'GOOD' } });
    }
    const games = state.flags.hs.games;
    assert.ok(games[T.finish.fromIdx].gwa >= 1, 'seed ' + seed + ': a game-winning attempt in the rivalry game');
  }
});

// ═══════════════════════════════ the recruiting board ═══════════════════════════════

test('the board moves after every game: up on makes and wins, down on misses, each school at its own pace', () => {
  const good = kfx.newCareer(RTG, { seed: 31 });
  const before = J(HS.current(good.state).board);
  const sessG = Engine.hsStartGame(good.state, good.rng);
  while (good.state.pending) Engine.sessionKick(good.state, good.rng, null, { forced: { outcome: 'GOOD' } });
  const after = HS.current(good.state).board;
  assert.ok(after.every((r) => r.interest >= (before.filter((b) => b.teamId === r.teamId)[0] || { interest: 0 }).interest),
    'a perfect game never costs interest');
  assert.ok(after.some((r) => r.moved > 0), 'somebody moved');
  const moves = after.map((r) => r.moved);
  assert.ok(Math.max.apply(null, moves) > Math.min.apply(null, moves), 'schools move at different rates');

  const bad = kfx.newCareer(RTG, { seed: 31 });
  const b0 = J(HS.current(bad.state).board);
  Engine.hsStartGame(bad.state, bad.rng);
  while (bad.state.pending) Engine.sessionKick(bad.state, bad.rng, null, { forced: { outcome: 'WIDE_L' } });
  const b1 = HS.current(bad.state).board;
  assert.ok(b1.some((r) => r.interest < (b0.filter((b) => b.teamId === r.teamId)[0] || { interest: 100 }).interest),
    'a game of misses costs interest');
  assert.ok(b1.every((r) => r.interest >= T.interest.min && r.interest <= T.interest.max), 'clamped 0-100');
});

test('tierOf names the four bands', () => {
  assert.equal(HS.tierOf(T.interest.offerAt), 'OFFER');
  assert.equal(HS.tierOf(T.interest.highAt), 'HIGH');
  assert.equal(HS.tierOf(T.interest.warmAt), 'WARM');
  assert.equal(HS.tierOf(T.interest.warmAt - 1), 'COLD');
});

// ═══════════════════════════════ stars and offers ═══════════════════════════════

test('ratingOf: a perfect season maxes the 0-6 scale, a blank one floors it, extra points alone are not enough', () => {
  const R = T.rating;
  const mk = (t) => ({ totals: Object.assign({ fgm: 0, fga: 0, xpm: 0, xpa: 0, long: 0, gw: 0, gwa: 0, wins: 0, losses: 0, ties: 0 }, t) });
  assert.equal(HS.ratingOf(mk({ fgm: 10, fga: 10, xpm: 12, xpa: 12, gw: 2, gwa: 2, long: 4 })), R.scale);
  assert.equal(HS.ratingOf(mk({ fgm: 0, fga: 10, xpm: 0, xpa: 12, gw: 0, gwa: 2 })), 0);
  const patsOnly = HS.ratingOf(mk({ fgm: 0, fga: 8, xpm: 12, xpa: 12, gw: 0, gwa: 1 }));
  assert.ok(patsOnly > 0 && patsOnly < 2, 'extra points alone: ' + patsOnly);
  assert.ok(HS.ratingOf(mk({ fgm: 8, fga: 10, xpm: 12, xpa: 12, gw: 1, gwa: 2 })) > patsOnly);
});

test('a perfect senior season earns a real programme; a season of misses earns walk-on offers', () => {
  const good = kfx.newCareer(RTG, { seed: 44 });
  const out = kfx.playHsSeason(RTG, good.state, good.rng, true);
  assert.equal(out.kind, 'HS_SEASON');
  const hs = HS.current(good.state);
  assert.equal(hs.idx, T.games);
  assert.equal(hs.rating, T.rating.scale);
  assert.equal(hs.summary.stars, good.state.player.stars);
  assert.ok(hs.summary.stars >= 4, 'a perfect season is worth at least 4 stars: ' + hs.summary.stars);
  assert.equal(hs.summary.walkon, false);
  assert.match(hs.summary.record, /^\d-\d$/, 'a W-L record: ' + hs.summary.record);
  assert.equal(hs.totals.wins + hs.totals.losses, T.games, 'five decisions — high-school football does not tie');
  assert.equal(hs.totals.ties, 0);
  assert.equal(good.state.stage, 'HS'); assert.equal(good.state.phase, 'OFFERS');
  assert.equal(good.state.pending.decision.kind, 'OFFERS_COLLEGE');
  const offers = good.state.pending.decision.payload.offers;
  assert.ok(offers.length >= 1);
  assert.ok(offers.some((o) => o.prestige >= 3), 'a perfect season reaches a prestige-3+ programme: ' + offers.map((o) => o.school + '(' + o.prestige + ')').join(', '));
  ok(good.state, 'after a perfect senior season');

  const bad = kfx.newCareer(RTG, { seed: 44 });
  kfx.playHsSeason(RTG, bad.state, bad.rng, false);
  const bhs = HS.current(bad.state);
  assert.equal(bhs.rating, 0);
  assert.equal(bhs.summary.stars, 2);
  assert.equal(bhs.summary.walkon, true);
  assert.equal(bad.state.flags.WALKON, true);
  assert.equal(bad.state.pending.decision.payload.offers.length, Tuning.draft.offers.walkon);
  ok(bad.state, 'after a senior season of misses');
});

test('every school that reached the offer line is a candidate, but the board never fills the whole list', () => {
  const r = kfx.newCareer(RTG, { seed: 64 });
  kfx.playHsSeason(RTG, r.state, r.rng, true);
  const hs = HS.current(r.state);
  const committed = hs.board.filter((b) => HS.tierOf(b.interest) === 'OFFER').map((b) => b.teamId);
  assert.ok(committed.length >= 2, 'a perfect season puts several schools over the line');
  const offers = r.state.pending.decision.payload.offers;
  const fromBoard = offers.filter((o) => committed.indexOf(o.teamId) >= 0).length;
  assert.ok(fromBoard >= 1, 'the board is represented');
  assert.ok(fromBoard <= Math.ceil(offers.length / 2) + 1, 'the board does not crowd out the prestige band (' + fromBoard + '/' + offers.length + ')');
});

// ═══════════════════════════════ the rest of the career ═══════════════════════════════

test('the senior season survives a save / load round trip mid-season', () => {
  const r = kfx.hsGame(RTG, { seed: 71 });
  Engine.sessionKick(r.state, r.rng, null, { forced: { outcome: 'GOOD' } });
  const blob = Engine.save(r.state, r.rng, 0);
  const loaded = Engine.load(blob);
  assert.ok(!loaded.error, JSON.stringify(loaded.error || ''));
  assert.equal(RTG.Util.deepDiff(J(r.state), J(loaded.state)), '', 'the open game round-trips');
  // and the loaded career finishes the season
  const rng2 = RTG.RNG.create(loaded.rngState);
  while (loaded.state.pending && loaded.state.pending.kind === 'KICKS') Engine.sessionKick(loaded.state, rng2, null, { forced: { outcome: 'GOOD' } });
  assert.equal(loaded.state.flags.hs.idx, 1);
  ok(loaded.state, 'loaded mid-season');
});

test('autoPlayCareer walks through the senior season without help', () => {
  const r = kfx.newCareer(RTG, { seed: 88 });
  Engine.autoPlayCareer(r.state, r.rng, { untilStage: 'COLLEGE' });
  assert.equal(r.state.stage, 'COLLEGE');
  assert.equal(HS.current(r.state).idx, T.games, 'all five games were played');
  assert.ok(HS.current(r.state).summary, 'the season was closed');
  assert.ok(r.state.history.timeline.some((t) => t.kind === 'HS_SEASON'), 'the season is on the timeline');
  ok(r.state, 'in college');
});
