/**
 * hs.test.js — RTG.HS (SPEC §2.7.0, D23): the high-school senior season that opens a career.
 * Five games, a live scoreboard inside each, a recruiting board that moves game by game, the star rating the
 * whole stretch earns, the recruiting camps that follow (an invite per school that wants a look, an offer earned
 * at each camp or not at all) and the college offers that fall out of the tour.
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
/** Every camp of the tour with a fixed make pattern (kfx.playCamps): `made` is a boolean or fn(ctx, i, campIdx, session). */
function playCamps(state, rng, made) { return kfx.playCamps(RTG, state, rng, made); }

// ═══════════════════════════════ the season ═══════════════════════════════

test('§3.5 public API', () => {
  for (const f of ['season', 'startGame', 'afterKick', 'finishGame', 'finishSeason', 'ratingOf', 'tierOf', 'inSeason', 'current',
    'camps', 'inCamps', 'nextCamp', 'askOf', 'startCamp', 'judgeCamp', 'finishCamp', 'finishCamps']) {
    assert.equal(typeof HS[f], 'function', 'HS.' + f);
  }
  assert.equal(typeof Engine.hsStartCamp, 'function', 'Engine.hsStartCamp');
  assert.ok(T && T.games === 5 && T.interest && T.rating && T.camps, 'Tuning.hs block');
  assert.deepEqual(J(Schema.phasesFor('HS')), ['SEASON', 'CAMPS', 'OFFERS'], 'the HS phases');
  assert.ok(Schema.ENUM.sessionKinds.indexOf('RECRUIT_CAMP') >= 0, 'RECRUIT_CAMP is a session kind');
});

test('season: a school, five dated games with a rivalry and a playoff opener, and a recruiting board', () => {
  const { state } = kfx.newCareer(RTG, { seed: 3 });
  const hs = HS.current(state);
  assert.ok(hs, 'flags.hs');
  assert.equal(hs.idx, 0);
  assert.equal(hs.games.length, T.games);
  assert.equal(hs.camps, null, 'no camps before the season closes');
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

// ═══════════════════════════════ stars and the camp invites ═══════════════════════════════

test('ratingOf: a perfect season maxes the 0-6 scale, a blank one floors it, extra points alone are not enough', () => {
  const R = T.rating;
  const mk = (t) => ({ totals: Object.assign({ fgm: 0, fga: 0, xpm: 0, xpa: 0, long: 0, gw: 0, gwa: 0, wins: 0, losses: 0, ties: 0 }, t) });
  assert.equal(HS.ratingOf(mk({ fgm: 10, fga: 10, xpm: 12, xpa: 12, gw: 2, gwa: 2, long: 4 })), R.scale);
  assert.equal(HS.ratingOf(mk({ fgm: 0, fga: 10, xpm: 0, xpa: 12, gw: 0, gwa: 2 })), 0);
  const patsOnly = HS.ratingOf(mk({ fgm: 0, fga: 8, xpm: 12, xpa: 12, gw: 0, gwa: 1 }));
  assert.ok(patsOnly > 0 && patsOnly < 2, 'extra points alone: ' + patsOnly);
  assert.ok(HS.ratingOf(mk({ fgm: 8, fga: 10, xpm: 12, xpa: 12, gw: 1, gwa: 2 })) > patsOnly);
});

test('starsFor: a perfect senior year is a 5★ recruit at a recruit\'s OVR, a blank one a 2★ walk-on', () => {
  const S = Tuning.draft.stars, R = T.rating;
  for (const ovr of [44, 47, 50, 53, 56]) {
    assert.equal(Career.starsFor(ovr, R.scale), S.max, 'OVR ' + ovr + ': a perfect season is 5★');
    assert.equal(Career.starsFor(ovr, 0), S.walkon, 'OVR ' + ovr + ': a blank season is the walk-on line');
  }
  assert.equal(Career.starsFor(50, 3), 3, 'a middling season is a 3★');
  assert.equal(Career.starsFor(50, 4.5), 4, 'a good season is a 4★');
  for (let r = 0; r < R.scale; r += 0.5) assert.ok(Career.starsFor(50, r + 0.5) >= Career.starsFor(50, r), 'monotone in the rating');
});

test('a season of alternating makes and misses rates 3★ — between the perfect 5★ and the blank 2★ — and earns a smaller tour', () => {
  const S = Tuning.draft.stars, C = T.camps;
  for (const seed of [2, 4, 8, 21, 29, 40]) {
    const r = kfx.newCareer(RTG, { seed });
    let n = 0;
    kfx.playHsSeason(RTG, r.state, r.rng, () => (n++ % 2) === 0);
    const hs = HS.current(r.state);
    assert.ok(hs.rating > 0 && hs.rating < T.rating.scale, 'seed ' + seed + ': a rating strictly between blank and perfect (' + hs.rating + ')');
    assert.equal(hs.summary.stars, 3, 'seed ' + seed + ': ' + hs.totals.fgm + '/' + hs.totals.fga + ' FG, rating ' + hs.rating + ' at OVR ' + hs.summary.ovr + ' rates 3★');
    assert.equal(hs.summary.stars, Career.starsFor(hs.summary.ovr, hs.rating), 'the star formula read the season rating');
    assert.equal(hs.summary.walkon, false, 'a 3★ is not on the walk-on line');
    assert.ok(hs.summary.stars > S.walkon && hs.summary.stars < S.max);
    const inv = hs.camps.invites;
    assert.ok(inv.length >= 1 && inv.length <= C.maxInvites, 'seed ' + seed + ': ' + inv.length + ' invites');
    const stars = inv.filter((i) => i.from === 'STARS');
    assert.ok(stars.length >= 1 && stars.every((i) => i.prestige === C.extra[3].prestige), 'seed ' + seed + ': the 3★ rating pulls in one mid-major off the board, never a blue blood');
    assert.ok(!inv.some((i) => i.from === 'STARS' && i.prestige === 5), 'no prestige-5 camp on the strength of a 3★ tape');
    const perfect = kfx.newCareer(RTG, { seed });
    kfx.playHsSeason(RTG, perfect.state, perfect.rng, true);
    assert.ok(inv.length <= HS.current(perfect.state).camps.invites.length, 'seed ' + seed + ': a middling season earns no more camps than a perfect one');
    ok(r.state, 'a 3★ at the camps');
  }
});

test('the fifth game closes into the camps: stars, the tour, phase CAMPS with nothing pending', () => {
  const r = kfx.newCareer(RTG, { seed: 44 });
  const out = kfx.playHsSeason(RTG, r.state, r.rng, true);
  assert.equal(out.kind, 'HS_SEASON');
  assert.ok(out.camps && out.camps.invites.length >= 1, 'the outcome carries the itinerary');
  const hs = HS.current(r.state);
  assert.equal(hs.idx, T.games);
  assert.equal(hs.rating, T.rating.scale);
  assert.equal(hs.summary.stars, r.state.player.stars);
  assert.equal(hs.summary.stars, Tuning.draft.stars.max, 'a perfect season is a 5★ recruit');
  assert.equal(hs.summary.walkon, false);
  assert.match(hs.summary.record, /^\d-\d$/, 'a W-L record: ' + hs.summary.record);
  assert.equal(hs.totals.wins + hs.totals.losses, T.games, 'five decisions — high-school football does not tie');
  assert.equal(hs.totals.ties, 0);
  assert.equal(r.state.stage, 'HS'); assert.equal(r.state.phase, 'CAMPS');
  assert.equal(r.state.pending, null, 'nothing pending: the camps screen opens the first camp');
  assert.equal(r.state.flags.WALKON, undefined, 'the walk-on flag waits for the tour');
  assert.ok(HS.inCamps(r.state) && HS.nextCamp(r.state) === hs.camps.invites[0]);
  assert.equal(hs.summary.camps, hs.camps.invites.length);
  assert.throws(() => Engine.nextPhase(r.state, r.rng), /camps first/, 'nextPhase waits for the tour');
  assert.ok(r.state.history.timeline.some((t) => t.kind === 'HS_SEASON'), 'the season is on the timeline');
  ok(r.state, 'at the camps');
});

test('invites: a perfect season brings the blue bloods, a bad one still gets a small camp or two, never zero', () => {
  const C = T.camps;
  for (const seed of [44, 45, 46, 47, 48]) {
    const good = kfx.newCareer(RTG, { seed });
    kfx.playHsSeason(RTG, good.state, good.rng, true);
    const inv = HS.current(good.state).camps.invites;
    assert.ok(inv.length >= 6 && inv.length <= C.maxInvites, 'seed ' + seed + ': a perfect season earns a bunch of invites (' + inv.length + ')');
    assert.ok(inv.filter((i) => i.prestige === 5).length >= 2, 'seed ' + seed + ': at least two prestige-5 camps');
    assert.ok(inv.every((i) => Schema.teamIn(good.state.leagues.college, i.teamId)), 'real colleges');
    assert.ok(inv.every((i) => i.distances.length === C.kicks && i.kicks === C.kicks), 'five kicks each');
    assert.ok(inv.every((i) => i.bar && i.bar.makes === C.bar[i.prestige].makes && i.bar.long === C.bar[i.prestige].long), 'the bar follows the prestige');
    for (let p = 2; p <= 5; p++) {
      assert.ok(C.bar[p].makes >= C.bar[p - 1].makes && C.bar[p].long >= C.bar[p - 1].long, 'the bar never drops from prestige ' + (p - 1) + ' to ' + p);
      assert.ok(C.bar[p].makes <= C.kicks, 'a staff never asks for more than the five');
    }
    assert.ok(C.bar[5].makes > C.bar[1].makes || C.bar[5].long > C.bar[1].long, 'a blue blood asks for more than a small school');
    assert.equal(C.bar[1].long, 0, 'a small school does not ask for a long one');
    assert.ok(C.bar[5].long > 0, 'a blue blood wants to see the long one');
    for (const i of inv) {
      for (let k = 1; k < i.distances.length; k++) assert.ok(i.distances[k] > i.distances[k - 1], 'short to long');
      if (i.bar.long) assert.ok(i.distances[i.distances.length - 1] >= i.bar.long, 'the long one reaches the bar');
    }
    for (let k = 1; k < inv.length; k++) assert.ok(inv[k].prestige >= inv[k - 1].prestige, 'small camps first, the blue bloods last');
    const ids = inv.map((i) => i.teamId);
    assert.equal(new Set(ids).size, ids.length, 'no school twice');
    // every board school at WARM or above is on the itinerary (up to the cap)
    const board = HS.current(good.state).board.filter((b) => ['WARM', 'HIGH', 'OFFER'].indexOf(HS.tierOf(b.interest)) >= 0);
    if (inv.length < C.maxInvites) assert.ok(board.every((b) => ids.indexOf(b.teamId) >= 0), 'seed ' + seed + ': a WARM board school invites');

    const bad = kfx.newCareer(RTG, { seed });
    kfx.playHsSeason(RTG, bad.state, bad.rng, false);
    const bhs = HS.current(bad.state);
    assert.equal(bhs.rating, 0);
    assert.equal(bhs.summary.stars, Tuning.draft.stars.walkon);
    assert.equal(bhs.summary.walkon, true, 'rated on the walk-on line');
    const binv = bhs.camps.invites;
    assert.ok(binv.length >= 1 && binv.length <= 2, 'seed ' + seed + ': a bad season gets one or two camps (' + binv.length + ')');
    assert.ok(binv.every((i) => i.prestige <= C.fallback.prestigeMax), 'small schools only');
    ok(bad.state, 'a bad season at the camps');
  }
});

// ═══════════════════════════════ a camp ═══════════════════════════════

test('startCamp: one fork, five contexts at that school (its venue, calm-ish, the staff watching the last one)', () => {
  const r = kfx.newCareer(RTG, { seed: 52 });
  kfx.playHsSeason(RTG, r.state, r.rng, true);
  const inv = HS.nextCamp(r.state);
  const count = counting(9);
  const sess = HS.startCamp(r.state, count);
  assert.equal(count.draws, 1, 'HS.startCamp: 1 parent draw');
  assert.equal(sess.kind, 'RECRUIT_CAMP');
  assert.equal(sess.teamId, inv.teamId);
  assert.equal(sess.campIdx, 0);
  assert.equal(r.state.pending.kind, 'KICKS');
  assert.equal(r.state.pending.session, sess);
  assert.equal(sess.contexts.length, T.camps.kicks);
  const team = Schema.teamIn(r.state.leagues.college, inv.teamId);
  sess.contexts.forEach((c, i) => {
    assert.equal(c.type, 'FG'); assert.equal(c.isUser, true); assert.equal(c.league, 'COLLEGE');
    assert.equal(c.game.teamId, inv.teamId, 'the venue is that college'); assert.equal(c.game.oppId, inv.teamId);
    assert.equal(c.distance, inv.distances[i]);
    assert.ok(c.wind.speed <= T.camps.windCap, 'a breeze at most');
    assert.ok(c.label && c.label.indexOf(String(inv.distances[i])) === 0, 'labelled with the distance');
    if (team.dome) assert.equal(c.dome, true);
  });
  const last = sess.contexts[sess.contexts.length - 1];
  assert.ok(last.pressure > sess.contexts[0].pressure, 'the staff watches the last one');
  assert.throws(() => HS.startCamp(r.state, r.rng), /already pending/);
  assert.throws(() => Engine.hsStartCamp(r.state, r.rng), /already pending/);
  const early = kfx.newCareer(RTG, { seed: 52 });
  assert.throws(() => Engine.hsStartCamp(early.state, early.rng), /not over yet/, 'no camps before the season closes');
  ok(r.state, 'a camp open');
});

test('a camp is kicked at the college: every context names a COLLEGE venue carrying that school\'s prestige, so the scene draws its stadium and not the high-school field', () => {
  // Kick.buildContext (venue / prestige) reads situation.venue; while state.stage is HS it falls back to 'HS'. HS.startCamp
  // builds its contexts at the school (teamId, league COLLEGE) but never names the venue, so a camp at a blue blood is
  // drawn on the senior-year field with a HOME / GUEST board. The fix is in hs.js (situation.venue: 'COLLEGE').
  const r = kfx.newCareer(RTG, { seed: 52 });
  kfx.playHsSeason(RTG, r.state, r.rng, true);
  const inv = HS.nextCamp(r.state);
  const team = Schema.teamIn(r.state.leagues.college, inv.teamId);
  const sess = HS.startCamp(r.state, r.rng);
  sess.contexts.forEach((c, i) => {
    assert.equal(c.venue, 'COLLEGE', 'kick ' + (i + 1) + ' at ' + inv.school + ' is kicked in a college stadium (venue ' + c.venue + ')');
    assert.equal(c.prestige, team.prestige, 'kick ' + (i + 1) + ': the venue carries ' + inv.school + '\'s prestige for the bowl');
  });
  const game = kfx.hsGame(RTG, { seed: 52 }).session;
  assert.ok(game.contexts.every((c) => c.venue === 'HS' && c.prestige === null), 'a senior-season game still plays on the high-school field');
});

test('judgeCamp: makes against the bar, and the long one when the staff asked for it', () => {
  const mk = (bar, pattern, dists) => ({ bar, contexts: dists.map((d) => ({ distance: d })), results: pattern.map((m) => ({ made: m })) });
  const d5 = [34, 40, 45, 50, 55];
  let v = HS.judgeCamp(mk({ makes: 4, long: 55 }, [true, true, true, false, true], d5));
  assert.equal(v.earned, true); assert.equal(v.makes, 4); assert.equal(v.longMade, true); assert.match(v.line, /offer earned/);
  v = HS.judgeCamp(mk({ makes: 4, long: 55 }, [true, true, true, true, false], d5));
  assert.equal(v.earned, false, 'four makes but not the long one'); assert.equal(v.longMade, false); assert.match(v.line, /nothing from 55\+/);
  v = HS.judgeCamp(mk({ makes: 4, long: 55 }, [true, false, true, false, true], d5));
  assert.equal(v.earned, false, 'the long one but only three'); assert.match(v.line, /wanted 4/);
  v = HS.judgeCamp(mk({ makes: 3, long: 0 }, [true, false, true, false, true], [27, 32, 36, 40, 44]));
  assert.equal(v.earned, true, 'a small school asks for three, no long one');
  v = HS.judgeCamp(mk({ makes: 3, long: 0 }, [true, true], [27, 32, 36, 40, 44]));
  assert.equal(v.makes, 2, 'mid-session: the running tally'); assert.equal(v.kicks, 5); assert.equal(v.earned, false);
});

test('a camp closes into the itinerary: the verdict on the invite, a timeline row, the next camp opens with nothing pending', () => {
  const r = kfx.newCareer(RTG, { seed: 53 });
  kfx.playHsSeason(RTG, r.state, r.rng, true);
  const hs = HS.current(r.state), inv0 = hs.camps.invites[0];
  const sess = Engine.hsStartCamp(r.state, r.rng);
  let last = null;
  // miss everything at the first camp
  for (let i = 0; i < sess.contexts.length; i++) last = Engine.sessionKick(r.state, r.rng, null, { forced: { outcome: 'WIDE_L' } });
  assert.equal(last.done, true);
  assert.equal(last.outcome.kind, 'RECRUIT_CAMP');
  assert.equal(last.outcome.earned, false);
  assert.equal(last.outcome.teamId, inv0.teamId);
  assert.equal(inv0.done, true); assert.equal(inv0.earned, false); assert.equal(inv0.makes, 0);
  assert.match(inv0.line, /no offer/);
  assert.equal(hs.camps.idx, 1); assert.equal(hs.camps.results.length, 1); assert.equal(hs.camps.earned.length, 0);
  assert.equal(r.state.pending, null, 'back to the itinerary with nothing pending');
  assert.equal(r.state.phase, 'CAMPS');
  assert.ok(r.state.history.timeline.some((t) => t.kind === 'HS_CAMP'), 'the camp is on the timeline');
  // make everything at the second
  const sess2 = Engine.hsStartCamp(r.state, r.rng);
  assert.equal(sess2.campIdx, 1);
  for (let i = 0; i < sess2.contexts.length; i++) last = Engine.sessionKick(r.state, r.rng, null, { forced: { outcome: 'GOOD' } });
  assert.equal(last.outcome.earned, true);
  assert.equal(hs.camps.invites[1].earned, true);
  assert.deepEqual(J(hs.camps.earned), [hs.camps.invites[1].teamId]);
  assert.equal(hs.summary.earned, 1);
  ok(r.state, 'between camps');
});

test('the camps survive a save / load round trip mid-camp', () => {
  const r = kfx.newCareer(RTG, { seed: 71 });
  kfx.playHsSeason(RTG, r.state, r.rng, true);
  Engine.hsStartCamp(r.state, r.rng);
  Engine.sessionKick(r.state, r.rng, null, { forced: { outcome: 'GOOD' } });
  const blob = Engine.save(r.state, r.rng, 0);
  const loaded = Engine.load(blob);
  assert.ok(!loaded.error, JSON.stringify(loaded.error || ''));
  assert.equal(RTG.Util.deepDiff(J(r.state), J(loaded.state)), '', 'the open camp round-trips');
  const rng2 = RTG.RNG.create(loaded.rngState);
  while (loaded.state.pending && loaded.state.pending.kind === 'KICKS') Engine.sessionKick(loaded.state, rng2, null, { forced: { outcome: 'GOOD' } });
  assert.equal(loaded.state.flags.hs.camps.idx, 1);
  assert.equal(loaded.state.flags.hs.camps.invites[0].earned, true);
  ok(loaded.state, 'loaded mid-camp');
});

// ═══════════════════════════════ the offers ═══════════════════════════════

test('the offers are exactly the camps you earned: a perfect tour puts the blue bloods on the table', () => {
  const r = kfx.newCareer(RTG, { seed: 44 });
  kfx.playHsSeason(RTG, r.state, r.rng, true);
  const hs = HS.current(r.state);
  const out = playCamps(r.state, r.rng, true);
  assert.equal(out.campsDone, true);
  assert.equal(out.decision && out.decision.kind, 'OFFERS_COLLEGE', 'the last camp hands off to the offers');
  assert.equal(r.state.stage, 'HS'); assert.equal(r.state.phase, 'OFFERS');
  assert.equal(r.state.pending.decision.kind, 'OFFERS_COLLEGE');
  assert.ok(hs.camps.invites.every((i) => i.done && i.earned), 'every camp earned');
  const offers = r.state.pending.decision.payload.offers;
  const ids = offers.map((o) => o.teamId).sort();
  assert.deepEqual(ids, hs.camps.earned.slice().sort(), 'the offers are the earned schools, no more, no less');
  assert.ok(offers.every((o) => o.earned === true && !o.safety && !o.walkon && o.scholarship), 'scholarships earned at camp');
  assert.ok(offers.some((o) => o.prestige === 5), 'a prestige-5 offer: ' + offers.map((o) => o.school + '(' + o.prestige + ')').join(', '));
  assert.equal(hs.summary.walkon, false);
  assert.equal(r.state.flags.WALKON, undefined);
  assert.ok(r.state.history.timeline.some((t) => t.kind === 'HS_CAMPS'), 'the tour is on the timeline');
  ok(r.state, 'at the offers after a perfect tour');
  // and the existing decision takes it from here
  Engine.decide(r.state, r.rng, { kind: 'OFFERS_COLLEGE', optionId: Engine.autoOption(r.state, r.state.pending.decision) });
  assert.equal(r.state.stage, 'COLLEGE');
  ok(r.state, 'enrolled');
});

test('a safety school joins only when fewer than two camps were earned; nothing earned on a 3★+ season → the safety school alone', () => {
  const S = T.camps.safetyBelow, O = Tuning.draft.offers;
  // earn exactly one camp (the first), miss the rest
  const one = kfx.newCareer(RTG, { seed: 64 });
  kfx.playHsSeason(RTG, one.state, one.rng, true);
  playCamps(one.state, one.rng, (ctx, i, campIdx) => campIdx === 0);
  const hs1 = HS.current(one.state);
  assert.equal(hs1.camps.earned.length, 1);
  const o1 = one.state.pending.decision.payload.offers;
  assert.equal(o1.length, S, 'one earned + one safety');
  assert.ok(o1.some((o) => o.earned && o.teamId === hs1.camps.earned[0]));
  assert.ok(o1.some((o) => o.safety && o.prestige <= O.safetyPrestigeMax && !o.earned), 'the safety school is a small one');
  assert.equal(one.state.flags.WALKON, undefined, 'a scholarship earned: no walk-on');
  // earn nothing on a 5★ season
  const none = kfx.newCareer(RTG, { seed: 64 });
  kfx.playHsSeason(RTG, none.state, none.rng, true);
  playCamps(none.state, none.rng, false);
  const o0 = none.state.pending.decision.payload.offers;
  assert.equal(o0.length, 1); assert.equal(o0[0].safety, true); assert.equal(o0[0].walkon, false);
  assert.equal(none.state.flags.WALKON, undefined, 'a 5★ who bombs the camps is still not a walk-on');
  ok(none.state, 'safety school only');
});

test('walk-on only when the season was 2★ AND nothing was earned; a 2★ who wins a camp gets that scholarship', () => {
  const bad = kfx.newCareer(RTG, { seed: 44 });
  kfx.playHsSeason(RTG, bad.state, bad.rng, false);
  const morale = bad.state.player.morale;
  playCamps(bad.state, bad.rng, false);
  const bhs = HS.current(bad.state);
  assert.equal(bhs.summary.stars, 2);
  assert.equal(bhs.summary.walkon, true);
  assert.equal(bad.state.flags.WALKON, true);
  assert.equal(bad.state.player.morale, Math.max(Tuning.soft.min, morale + Tuning.soft.start.walkonMorale), 'the walk-on morale hit lands with the verdict');
  const bo = bad.state.pending.decision.payload.offers;
  assert.equal(bo.length, Tuning.draft.offers.walkon);
  assert.ok(bo.every((o) => o.walkon === true && !o.earned), 'walk-on offers');
  ok(bad.state, 'after a bad season and an empty tour');

  const saved = kfx.newCareer(RTG, { seed: 44 });
  kfx.playHsSeason(RTG, saved.state, saved.rng, false);
  playCamps(saved.state, saved.rng, true);
  const shs = HS.current(saved.state);
  assert.ok(shs.camps.earned.length >= 1, 'the small camp is winnable');
  assert.equal(shs.summary.walkon, false, 'kicked off the walk-on line');
  assert.equal(saved.state.flags.WALKON, undefined);
  const so = saved.state.pending.decision.payload.offers;
  assert.ok(so.every((o) => !o.walkon && o.scholarship), 'a real scholarship');
  assert.ok(so.some((o) => o.earned), 'from the camp');
  ok(saved.state, 'a 2★ with a camp offer');
});

test('generateCollegeOffers with opts.earned costs one parent draw and ignores the prestige band', () => {
  const r = kfx.newCareer(RTG, { seed: 66 });
  kfx.playHsSeason(RTG, r.state, r.rng, true);
  const lg = r.state.leagues.college;
  const low = lg.teams.filter((t) => t.prestige === 2).slice(0, 3).map((t) => t.id);
  const count = counting(3);
  const dec = Career.generateCollegeOffers(r.state, count, 'RECRUIT', { earned: low });
  assert.equal(count.draws, 1, 'exactly one parent draw');
  assert.deepEqual(dec.payload.offers.map((o) => o.teamId).sort(), low.slice().sort(), 'prestige-2 schools for a 5★: the camps decide, not the band');
  assert.deepEqual(J(dec.payload.earned), J(low));
  assert.equal(dec.options.length, 3);
  assert.ok(dec.options.every((o) => /earned at camp/.test(o.label)));
});

test('the long one is enforced through a real camp: four makes without it earn nothing where the staff asked, everything where they did not', () => {
  const r = kfx.newCareer(RTG, { seed: 9 });
  kfx.playHsSeason(RTG, r.state, r.rng, true);
  const inv = HS.current(r.state).camps.invites;
  assert.ok(inv.some((i) => i.bar.long > 0) && inv.some((i) => i.bar.long === 0), 'seed 9: schools with and without a long-kick ask');
  // miss only the last (longest) kick at every camp
  const out = playCamps(r.state, r.rng, (ctx, i, campIdx, sess) => i < sess.contexts.length - 1);
  assert.equal(out.campsDone, true);
  for (const i of inv) {
    assert.equal(i.done, true); assert.equal(i.makes, T.camps.kicks - 1, i.school + ': four of five');
    assert.equal(i.longMade, false, i.school + ': the long one was missed');
    if (i.bar.long) { assert.equal(i.earned, false, i.school + ' (' + i.prestige + '★) wanted one from ' + i.bar.long + '+'); assert.match(i.line, new RegExp('nothing from ' + i.bar.long + '\\+')); }
    else { assert.equal(i.earned, true, i.school + ' (' + i.prestige + '★) did not ask for a long one'); assert.match(i.line, /offer earned/); }
  }
  const earned = inv.filter((i) => i.earned).map((i) => i.teamId);
  assert.deepEqual(J(HS.current(r.state).camps.earned), J(earned));
  // the same tour missing only the first (shortest) kick: four makes including the long one earn everywhere
  const s = kfx.newCareer(RTG, { seed: 9 });
  kfx.playHsSeason(RTG, s.state, s.rng, true);
  playCamps(s.state, s.rng, (ctx, i) => i > 0);
  const inv2 = HS.current(s.state).camps.invites;
  assert.ok(inv2.every((i) => i.done && i.earned && i.makes === T.camps.kicks - 1 && (i.bar.long ? i.longMade : true)), 'four makes with the long one clear every bar');
  assert.equal(HS.current(s.state).camps.earned.length, inv2.length);
  ok(r.state, 'after a tour of missed long ones'); ok(s.state, 'after a tour of missed short ones');
});

test('the offers after a mixed tour are exactly the earned schools: a missed camp is gone, a made one is on the table, no safety school when two or more were earned', () => {
  const r = kfx.newCareer(RTG, { seed: 9 });
  kfx.playHsSeason(RTG, r.state, r.rng, true);
  // earn the even-numbered camps, bomb the odd ones
  const out = playCamps(r.state, r.rng, (ctx, i, campIdx) => campIdx % 2 === 0);
  const hs = HS.current(r.state), inv = hs.camps.invites;
  assert.equal(out.decision.kind, 'OFFERS_COLLEGE');
  const earned = inv.filter((i, k) => k % 2 === 0), missed = inv.filter((i, k) => k % 2 === 1);
  assert.ok(earned.length >= T.camps.safetyBelow && missed.length >= 1, 'seed 9: ' + earned.length + ' earned, ' + missed.length + ' missed');
  assert.ok(earned.every((i) => i.earned === true) && missed.every((i) => i.earned === false));
  const offers = r.state.pending.decision.payload.offers;
  assert.deepEqual(J(offers.map((o) => o.teamId)).sort(), J(earned.map((i) => i.teamId)).sort(), 'exactly the earned schools');
  for (const m of missed) assert.ok(!offers.some((o) => o.teamId === m.teamId), m.school + ' passed at camp and is not on the table');
  for (const e of earned) {
    const o = offers.filter((x) => x.teamId === e.teamId)[0];
    assert.ok(o && o.earned === true && o.scholarship === true && !o.safety && !o.walkon, e.school + ': a scholarship earned at camp');
    assert.equal(o.prestige, e.prestige);
  }
  assert.ok(!offers.some((o) => o.safety), 'no safety school with ' + earned.length + ' earned');
  assert.deepEqual(J(r.state.pending.decision.payload.earned).sort(), J(earned.map((i) => i.teamId)).sort(), 'the decision carries the earned list');
  assert.ok(r.state.pending.decision.options.every((op) => /earned at camp/.test(op.label)), 'every option says where it came from');
  assert.equal(hs.summary.earned, earned.length);
  ok(r.state, 'offers after a mixed tour');
});

test('stepping one engine call at a time, the way the debug panel does — open a camp, one forced kick, open the next — never stalls and validates after every step', () => {
  // the hand-driven path: hsStartCamp, then one forced kick per step
  const r = kfx.newCareer(RTG, { seed: 33 });
  kfx.playHsSeason(RTG, r.state, r.rng, true);
  const n = HS.current(r.state).camps.invites.length;
  let steps = 0, opened = 0, guard = 200;
  while (r.state.phase === 'CAMPS' && guard-- > 0) {
    if (!r.state.pending) { Engine.hsStartCamp(r.state, r.rng); opened++; }
    else Engine.sessionKick(r.state, r.rng, null, { forced: { outcome: 'GOOD' } });
    steps++;
    assert.equal(r.state.rngState, r.rng.state(), 'step ' + steps + ': rngState mirrors the rng');
    ok(r.state, 'step ' + steps);
  }
  assert.equal(opened, n, 'one open per camp');
  assert.equal(steps, n * (T.camps.kicks + 1), 'a step per open and per kick');
  assert.equal(r.state.phase, 'OFFERS');
  assert.equal(r.state.pending.decision.kind, 'OFFERS_COLLEGE');
  // the jumpTo path: settlePending {max:1} whenever something is pending or a camp is left to open
  const j = kfx.newCareer(RTG, { seed: 33 });
  let hops = 0; guard = 400;
  while (!(j.state.stage === 'HS' && j.state.phase === 'OFFERS') && guard-- > 0) {
    assert.ok(j.state.pending || HS.inSeason(j.state) || HS.inCamps(j.state), 'always something to step on at ' + j.state.phase);
    Engine.settlePending(j.state, j.rng, { max: 1 });
    hops++;
  }
  assert.equal(j.state.phase, 'OFFERS', 'reached the offers in ' + hops + ' hops');
  assert.equal(hops, T.games + HS.current(j.state).camps.invites.length, 'one hop per game and per camp');
  assert.equal(j.state.pending.decision.kind, 'OFFERS_COLLEGE');
  ok(j.state, 'jumped to the offers');
});

test('the tour is deterministic for a seed: the same seed and the same kicks give the same invites, verdicts, offers and rng state', () => {
  const play = (seed) => {
    const r = kfx.newCareer(RTG, { seed });
    kfx.playHsSeason(RTG, r.state, r.rng, (ctx, i) => i % 3 !== 2);
    playCamps(r.state, r.rng, (ctx, i, campIdx) => campIdx % 2 === 0 || i > 0);
    return r;
  };
  const a = play(21), b = play(21);
  assert.equal(RTG.Util.deepDiff(J(a.state.flags.hs), J(b.state.flags.hs)), '', 'the same senior year and tour');
  assert.equal(RTG.Util.deepDiff(J(a.state.pending.decision), J(b.state.pending.decision)), '', 'the same offers');
  assert.equal(RTG.Util.deepDiff(J(a.state), J(b.state)), '', 'the same state');
  assert.equal(a.rng.state(), b.rng.state(), 'the same rng state');
  const c = play(22);
  assert.notEqual(RTG.Util.deepDiff(J(a.state.flags.hs.camps), J(c.state.flags.hs.camps)), '', 'another seed, another tour');
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

test('an HS.OFFERS save from before the camps (no tour on the record) still validates with its decision pending', () => {
  const r = kfx.newCareer(RTG, { seed: 72 });
  kfx.playHsSeason(RTG, r.state, r.rng, true);
  playCamps(r.state, r.rng, true);
  const old = J(r.state);
  delete old.flags.hs.camps;                       // what a pre-camps save looks like at HS.OFFERS
  delete old.flags.hs.summary.camps; delete old.flags.hs.summary.earned;
  ok(old, 'an old HS.OFFERS state');
  const loaded = Engine.load(Engine.save(old, RTG.RNG.create(old.rngState), 0));
  assert.equal(loaded.state.phase, 'OFFERS');
  assert.equal(loaded.state.pending.decision.kind, 'OFFERS_COLLEGE');
  assert.throws(() => Engine.hsStartCamp(loaded.state, RTG.RNG.create(1)), /not over yet|already pending/);
});

test('settlePending walks the tour one camp at a time, and autoPlayCareer walks through the senior season and the camps without help', () => {
  const s = kfx.newCareer(RTG, { seed: 89 });
  kfx.playHsSeason(RTG, s.state, s.rng, true);
  const n = HS.current(s.state).camps.invites.length;
  for (let i = 0; i < n; i++) {
    assert.equal(s.state.phase, 'CAMPS'); assert.equal(s.state.pending, null);
    const log = Engine.settlePending(s.state, s.rng, { max: 1 });
    assert.equal(log.length, 1); assert.equal(log[0].session, 'RECRUIT_CAMP', 'one camp per step');
  }
  assert.equal(s.state.phase, 'OFFERS');

  const r = kfx.newCareer(RTG, { seed: 88 });
  Engine.autoPlayCareer(r.state, r.rng, { untilStage: 'COLLEGE' });
  assert.equal(r.state.stage, 'COLLEGE');
  const hs = HS.current(r.state);
  assert.equal(hs.idx, T.games, 'all five games were played');
  assert.ok(hs.summary, 'the season was closed');
  assert.ok(hs.camps && hs.camps.idx === hs.camps.invites.length, 'every camp was played');
  assert.ok(hs.camps.invites.every((i) => i.done), 'every invite has a verdict');
  assert.ok(r.state.history.timeline.some((t) => t.kind === 'HS_SEASON'), 'the season is on the timeline');
  assert.ok(r.state.history.timeline.some((t) => t.kind === 'HS_CAMPS'), 'the tour is on the timeline');
  ok(r.state, 'in college');
});
