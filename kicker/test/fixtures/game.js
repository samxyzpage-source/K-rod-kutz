/**
 * Game fixtures (E2). Plain factories that take RTG (from test/load.js) and return valid
 * CareerStates / GameStates at interesting moments, so the game screen, the kick scene and the
 * sim tests can be built against real data before Season/Career exist.
 *
 *   const gfx = require('./fixtures/game');
 *   const g = gfx.q4TrailingBy2(RTG);            // {state, gs, rng}: Q4 2:00, user's team trails by 2 with the ball
 *   const o = gfx.overtimeNfl(RTG, { sudden: true });
 *   const k = gfx.pendingUserFg(RTG, { distance: 47, hash: -1 });
 *   const done = gfx.playGame(RTG, g, { forced: () => 'GOOD' });   // auto/forced user kicks to END_GAME + finishGame
 *
 * Every builder is deterministic for a given seed and returns fresh objects. States come from
 * fixtures/schema.js (nflRegWeek9InGame / collegeRegWeek5) with the in-progress game removed so
 * Sim.startGame can build a real one.
 */
'use strict';
const schemaFx = require('./schema');

const DEFAULT_SEED = 11;

/** A seeded RTG.RNG. */
function rngFor(RTG, seed) {
  return RTG.RNG.create((seed === undefined ? DEFAULT_SEED : seed) >>> 0);
}

/**
 * A scripted stand-in rng for structural tests: every method returns a controlled value.
 * o: {weighted: key|fn(items), chance: bool|fn(p), gauss: 'mean'|number|fn(mu, sd), next: number, int: 'lo'|'hi'|fn}
 * `weighted` matches `item.k === key` (the sim's outcome items) or `item.h` (Kick's hash items), else the first item.
 * @param {object} [o] @returns {object} rng-like
 */
function scriptedRng(o) {
  o = o || {};
  const r = {
    draws: 0,
    next() { r.draws++; return o.next === undefined ? 0.5 : o.next; },
    int(lo, hi) { r.draws++; return typeof o.int === 'function' ? o.int(lo, hi) : (o.int === 'hi' ? hi : lo); },
    float(lo, hi) { r.draws++; return (lo + hi) / 2; },
    chance(p) { r.draws++; return typeof o.chance === 'function' ? !!o.chance(p) : !!o.chance; },
    gauss(mu, sd) {
      r.draws += 2;
      if (typeof o.gauss === 'function') return o.gauss(mu || 0, sd === undefined ? 1 : sd);
      if (typeof o.gauss === 'number') return (mu || 0) + (sd === undefined ? 1 : sd) * o.gauss;
      return mu || 0;
    },
    pick(arr) { r.draws++; return arr[0]; },
    weighted(items, key) {
      r.draws++;
      if (typeof o.weighted === 'function') return o.weighted(items, key);
      for (const it of items) if (it.k === o.weighted || it.h === o.weighted) return it;
      return items[0];
    },
    shuffle(arr) { return arr; },
    state() { return 1; },
    setState() {},
    fork() { return r; },
  };
  return r;
}

/**
 * A minimal-but-real CareerState for AI-vs-AI sims: both leagues built from data, no user team,
 * an empty SeasonState for `league`.
 * @param {object} RTG @param {{league?: 'NFL'|'COLLEGE', seed?: number, week?: number}} [opts]
 * @returns {object} CareerState
 */
function aiState(RTG, opts) {
  opts = opts || {};
  const league = opts.league === 'NFL' ? 'NFL' : 'COLLEGE';
  const state = schemaFx.hsShowcase(RTG, { seed: opts.seed === undefined ? 3 : opts.seed });
  state.pending = null;
  state.player.teamId = null; state.player.league = league; state.player.role = 'NONE';
  state.stage = league; state.phase = 'REG'; state.week = opts.week || 1;
  state.season = RTG.Schema.emptySeason(league, state.year);
  RTG.Schema.reindex(state);
  return state;
}

/**
 * NFL.REG week 9 (BOS, K1, year 5) with no game in progress — Sim.startGame builds this week's game.
 * @param {object} RTG @param {{seed?: number}} [opts] @returns {object} CareerState
 */
function nflUserState(RTG, opts) {
  const state = schemaFx.nflRegWeek9InGame(RTG, opts);
  state.game = null;
  state.season.weekGameDone = false;
  return state;
}

/**
 * COLLEGE.REG week 5 (COA2, K1, freshman) with no game in progress.
 * @param {object} RTG @param {{seed?: number}} [opts] @returns {object} CareerState
 */
function collegeUserState(RTG, opts) {
  const state = schemaFx.collegeRegWeek5(RTG, opts);
  state.game = null;
  state.season.weekGameDone = false;
  return state;
}

/** nflUserState unless opts.league === 'COLLEGE'. */
function userState(RTG, opts) {
  return opts && opts.league === 'COLLEGE' ? collegeUserState(RTG, opts) : nflUserState(RTG, opts);
}

/**
 * Start the user's scheduled game for the week (Sim.startGame). Pass opts.kind to override the game
 * kind (e.g. 'WC' for a playoff game) — the schedule game is patched before starting.
 * @param {object} RTG @param {{state?: object, league?: string, seed?: number, rng?: object, kind?: string}} [opts]
 * @returns {{state: object, gs: object, rng: object}}
 */
function startUserGame(RTG, opts) {
  opts = opts || {};
  const state = opts.state || userState(RTG, opts);
  const rng = opts.rng || rngFor(RTG, opts.seed);
  const game = state.season.schedule.find((g) => g.id === state.season.userGameId);
  if (opts.kind && game) game.kind = opts.kind;
  const gs = RTG.Sim.startGame(state, rng, { league: state.season.league, gameId: state.season.userGameId });
  return { state, gs, rng };
}

/** Sides helper: {us, them} for a user game. */
function sides(gs) {
  const us = gs.userSide || 'home';
  return { us, them: us === 'home' ? 'away' : 'home' };
}

/**
 * Move a started game to a moment. m: {q, clock, user, opp, possession: 'user'|'opp'|null, ytg, timeouts, half}
 * Clears any pending kick / kickoff / script and writes a plausible drive log + team stats.
 * @param {object} RTG @param {{state, gs, rng}} g @param {object} m @returns {{state, gs, rng}}
 */
function atMoment(RTG, g, m) {
  const gs = g.gs, { us, them } = sides(gs);
  const C = RTG.Tuning.sim.clock;
  gs.q = m.q; gs.clock = m.clock; gs.half = m.half || (m.q <= C.halfQuarter ? 1 : 2);
  gs.score[us] = m.user; gs.score[them] = m.opp;
  gs.pendingKickoff = null; gs.pending = null; gs.announce = null; gs.script = null; gs.ot = null; gs.iced = false;
  const side = m.possession === 'opp' ? them : us;
  const ytg = m.ytg || 60;
  gs.possession = side;
  gs.ball = m.possession === null ? null : { ytg, down: 1, toGo: RTG.Tuning.sim.script.toGo };
  gs.drive = { n: m.driveN || 18, startYtg: ytg, plays: 0, side };
  gs.timeouts = m.timeouts || { home: 2, away: 2 };
  gs.stats.home.drives = 9; gs.stats.away.drives = 9;
  gs.stats[us].td = Math.floor(m.user / 7); gs.stats[them].td = Math.floor(m.opp / 7);
  gs.stats[us].fga = 2; gs.stats[us].fgm = 2; gs.stats[us].pat = gs.stats[us].td; gs.stats[us].patMade = gs.stats[us].td;
  gs.stats[them].fga = 1; gs.stats[them].fgm = 1; gs.stats[them].pat = gs.stats[them].td; gs.stats[them].patMade = gs.stats[them].td;
  gs.driveLog = [
    { q: 1, clock: C.quarterSec, side: them, text: 'Kickoff: touchback, ball at the 30', ytg: 70, result: 'KO' },
    { q: 1, clock: 640, side: them, text: 'Punt - ' + gs[us + 'Id'] + ' takes over at own 28', ytg: 72, result: 'PUNT' },
    { q: 2, clock: 802, side: us, text: 'Touchdown drive by ' + gs[us + 'Id'], ytg: 0, result: 'TD' },
    { q: 2, clock: 802, side: us, text: 'PAT is GOOD', ytg: 3, result: 'PAT' },
    { q: 3, clock: 455, side: them, text: 'Drive stalls at the 24 - 41-yd FG is GOOD', ytg: 24, result: 'FG' },
    { q: 4, clock: m.clock + 95, side: them, text: 'Punt - ' + gs[us + 'Id'] + ' takes over at own ' + (100 - ytg), ytg, result: 'PUNT' },
  ];
  return g;
}

/** Q4 2:00, the user's team trails 20–22 with the ball at the opponent's 45 (two-minute drill next step). */
function q4TrailingBy2(RTG, opts) {
  opts = opts || {};
  return atMoment(RTG, startUserGame(RTG, opts), {
    q: 4, clock: opts.clock === undefined ? 120 : opts.clock, user: 20, opp: 22, possession: 'user',
    ytg: opts.ytg || 45, timeouts: { home: 2, away: 1 },
  });
}

/** Q4 1:30, tied 17–17, the user's team has the ball at its own 45. */
function q4Tied(RTG, opts) {
  opts = opts || {};
  return atMoment(RTG, startUserGame(RTG, opts), {
    q: 4, clock: opts.clock === undefined ? 90 : opts.clock, user: 17, opp: 17, possession: 'user', ytg: opts.ytg || 55,
    timeouts: { home: 1, away: 2 },
  });
}

/** Q4 1:40, the user's team leads 24–21 with the ball (kneel territory). */
function q4Leading(RTG, opts) {
  opts = opts || {};
  return atMoment(RTG, startUserGame(RTG, opts), {
    q: 4, clock: opts.clock === undefined ? 100 : opts.clock, user: 24, opp: 21, possession: 'user', ytg: 65,
    timeouts: opts.timeouts || { home: 0, away: 0 },
  });
}

/** Q2 0:35, 7–10, the user's team has the ball at the opponent's 30 (end-of-half FG territory). */
function endOfHalf(RTG, opts) {
  opts = opts || {};
  return atMoment(RTG, startUserGame(RTG, opts), {
    q: 2, clock: opts.clock === undefined ? 35 : opts.clock, user: 7, opp: 10, possession: 'user', ytg: opts.ytg || 30,
    timeouts: { home: 3, away: 2 },
  });
}

/**
 * NFL overtime, tied 20–20. Default: the kickoff to start OT is pending (the user's team receives).
 * opts.sudden → both teams have possessed (possessions 3), the user's team has the ball at the opponent's 40.
 * opts.possessions / opts.possession ('user'|'opp') / opts.ytg for custom placements; opts.kind 'WC' → NFL_PLAYOFF.
 */
function overtimeNfl(RTG, opts) {
  opts = opts || {};
  const g = startUserGame(RTG, Object.assign({}, opts, { league: 'NFL' }));
  const gs = g.gs, { us, them } = sides(gs);
  const O = RTG.Tuning.sim.ot, C = RTG.Tuning.sim.clock;
  atMoment(RTG, g, { q: C.quarters, clock: 0, user: 20, opp: 20, possession: null, timeouts: { home: 0, away: 1 } });
  gs.q = C.quarters + 1; gs.half = 2; gs.clock = opts.clock === undefined ? O.nfl.periodSec : opts.clock;
  gs.timeouts = { home: O.nfl.timeouts, away: O.nfl.timeouts };
  gs.ot = { period: 1, mode: gs.kind === 'REG' ? 'NFL_REG' : 'NFL_PLAYOFF', firstPossession: us, bothPossessed: false, possessions: 0 };
  gs.driveLog.push({ q: C.quarters, clock: 0, side: us, text: 'Final of regulation - ' + gs.homeId + ' 20 - ' + gs.awayId + ' 20', ytg: 0, result: 'END_QUARTER' });
  gs.driveLog.push({ q: gs.q, clock: gs.clock, side: us, text: 'Overtime - ' + gs[us + 'Id'] + ' wins the toss and receives', ytg: 0, result: 'OT_START' });
  const possessions = opts.sudden ? 3 : (opts.possessions || 0);
  if (possessions > 0) {
    const side = opts.possession === 'opp' ? them : us;
    gs.ot.possessions = possessions;
    gs.ot.bothPossessed = possessions > 2;
    gs.possession = side;
    gs.ball = { ytg: opts.ytg || 40, down: 1, toGo: RTG.Tuning.sim.script.toGo };
    gs.drive = { n: 19 + possessions, startYtg: gs.ball.ytg, plays: 0, side };
    gs.pendingKickoff = null;
  } else {
    gs.possession = us; gs.ball = null;
    gs.pendingKickoff = { side: them };
  }
  return g;
}

/** College overtime, tied 27–27, the user's team starts the first possession from the 25. */
function overtimeCollege(RTG, opts) {
  opts = opts || {};
  const g = startUserGame(RTG, Object.assign({}, opts, { league: 'COLLEGE' }));
  const gs = g.gs, { us } = sides(gs);
  const O = RTG.Tuning.sim.ot, C = RTG.Tuning.sim.clock;
  atMoment(RTG, g, { q: C.quarters, clock: 0, user: 27, opp: 27, possession: null, timeouts: { home: 1, away: 1 } });
  gs.q = C.quarters + 1; gs.half = 2; gs.clock = 0;
  gs.ot = { period: opts.period || 1, mode: 'COLLEGE', firstPossession: us, bothPossessed: false, possessions: opts.possessions || 0 };
  gs.q = C.quarters + gs.ot.period;
  gs.possession = us;
  gs.ball = { ytg: O.college.ytg, down: 1, toGo: RTG.Tuning.sim.script.toGo };
  gs.drive = { n: 20, startYtg: O.college.ytg, plays: 0, side: us };
  gs.pendingKickoff = null;
  gs.driveLog.push({ q: gs.q, clock: 0, side: us, text: 'Overtime - ' + gs[us + 'Id'] + ' starts from the 25', ytg: O.college.ytg, result: 'OT_START' });
  return g;
}

/**
 * A user game with a pending USER_KICK field goal (default 44 yd, Q2 3:34, 10–7).
 * opts: {distance, hash, q, clock, user, opp, decisive, asTimeExpires, league, seed}
 */
function pendingUserFg(RTG, opts) {
  opts = opts || {};
  const g = startUserGame(RTG, opts);
  const gs = g.gs, { us, them } = sides(gs);
  atMoment(RTG, g, {
    q: opts.q || 2, clock: opts.clock === undefined ? 214 : opts.clock, user: opts.user === undefined ? 10 : opts.user,
    opp: opts.opp === undefined ? 7 : opts.opp, possession: 'user', ytg: (opts.distance || 44) - RTG.Tuning.kick.distance.losToKick,
    timeouts: opts.timeouts || { home: 2, away: 3 },
  });
  gs.ball.down = 4; gs.ball.toGo = 6;
  const sit = { type: 'FG', distance: opts.distance || 44, hash: opts.hash === undefined ? 0 : opts.hash, isUser: true,
    side: us, teamId: gs[us + 'Id'], oppId: gs[them + 'Id'] };
  if (opts.decisive !== undefined) sit.decisive = opts.decisive;
  if (opts.asTimeExpires) sit.asTimeExpires = true;
  if (opts.iced) { sit.iced = true; gs.iced = true; }
  gs.pending = { type: 'USER_KICK', ctx: RTG.Kick.buildContext(g.state, gs, sit, g.rng) };
  gs.driveLog.push({ q: gs.q, clock: gs.clock, side: us, text: 'Drive stalls at the ' + gs.ball.ytg + ' - ' + (opts.distance || 44) + '-yd FG attempt', ytg: gs.ball.ytg, result: 'STALL' });
  return g;
}

/** Q4 0:04, the user's team trails 20–22 with a pending decisive 41-yd FG (pressure ≥ 0.6). */
function decisivePendingFg(RTG, opts) {
  return pendingUserFg(RTG, Object.assign({ distance: 41, q: 4, clock: 4, user: 20, opp: 22, timeouts: { home: 1, away: 1 } }, opts || {}));
}

/**
 * A user game right after the user's team scored a TD: pending USER_KICK PAT (Q1 11:30, 6–0 → PAT).
 * opts: {league, seed, user, opp, q, clock}
 */
function pendingPat(RTG, opts) {
  opts = opts || {};
  const g = startUserGame(RTG, opts);
  const gs = g.gs, { us, them } = sides(gs);
  atMoment(RTG, g, {
    q: opts.q || 1, clock: opts.clock === undefined ? 690 : opts.clock, user: opts.user === undefined ? 6 : opts.user,
    opp: opts.opp === undefined ? 0 : opts.opp, possession: 'user', ytg: 1, timeouts: { home: 3, away: 3 },
  });
  gs.ball = null;
  gs.stats[us].td = Math.max(1, gs.stats[us].td);
  gs.driveLog.push({ q: gs.q, clock: gs.clock, side: us, text: 'Touchdown drive by ' + gs[us + 'Id'], ytg: 0, result: 'TD' });
  gs.pending = { type: 'USER_KICK', ctx: RTG.Kick.buildContext(g.state, gs, { type: 'PAT', isUser: true, side: us, teamId: gs[us + 'Id'], oppId: gs[them + 'Id'] }, g.rng) };
  return g;
}

/**
 * Play a game to END_GAME through Sim.simToNextUserKick, resolving user kicks with `opts.forced(ctx, i)`
 * (an outcome string / forced object, via Kick.resolve's debug opts) or Sim.autoResolvePending.
 * Kickoffs are always auto-resolved. Calls Sim.finishGame unless opts.finish === false.
 * @param {object} RTG @param {{state, gs, rng}} g @param {{forced?: function, finish?: boolean, onEvent?: function}} [opts]
 * @returns {{events: object[], summary: object|null, userKicks: number}}
 */
function playGame(RTG, g, opts) {
  opts = opts || {};
  const { Sim, Kick } = RTG;
  const events = [];
  let userKicks = 0;
  for (let guard = 0; guard < 5000; guard++) {
    const e = Sim.simToNextUserKick(g.gs, g.state, g.rng);
    events.push(e);
    if (opts.onEvent) opts.onEvent(e);
    if (e.type === 'END_GAME' || e.type === 'END') break;
    if (e.type === 'ICE_TIMEOUT') continue;                   // the next call yields USER_KICK
    if (e.type === 'USER_KICKOFF') { Sim.autoResolvePending(g.gs, g.state, g.rng); continue; }
    if (e.type === 'USER_KICK') {
      userKicks++;
      if (opts.forced) {
        const ctx = g.gs.pending.ctx;
        const forced = opts.forced(ctx, userKicks - 1);
        const result = Kick.resolve(g.rng, ctx, null, { power: 1, aim: 0, quality: 0.9 }, { forced });
        Sim.applyKick(g.gs, g.state, g.rng, result);
      } else {
        Sim.autoResolvePending(g.gs, g.state, g.rng);
      }
    }
  }
  const summary = opts.finish === false ? null : Sim.finishGame(g.gs, g.state, g.rng);
  return { events, summary, userKicks };
}

/** Every named moment (for the UI fixture gallery). */
function all(RTG) {
  return {
    q4TrailingBy2: q4TrailingBy2(RTG), q4Tied: q4Tied(RTG), q4Leading: q4Leading(RTG), endOfHalf: endOfHalf(RTG),
    overtimeNfl: overtimeNfl(RTG), overtimeNflSudden: overtimeNfl(RTG, { sudden: true }), overtimeCollege: overtimeCollege(RTG),
    pendingUserFg: pendingUserFg(RTG), decisivePendingFg: decisivePendingFg(RTG), pendingPat: pendingPat(RTG),
  };
}

module.exports = {
  rngFor, scriptedRng, aiState, nflUserState, collegeUserState, userState, startUserGame, atMoment, sides,
  q4TrailingBy2, q4Tied, q4Leading, endOfHalf, overtimeNfl, overtimeCollege, pendingUserFg, decisivePendingFg, pendingPat,
  playGame, all,
};
