/**
 * Stats / Awards / Save fixtures (E3). Plain factories that take RTG (from test/load.js) and
 * return valid states or objects for kicker bookkeeping tests:
 *
 *   const fx = require('./fixtures/stats');
 *   const s = fx.cleanCollege(RTG);                 // COLLEGE.REG week 5, zero kicks recorded
 *   const { ctx, result } = fx.kick(RTG, s, { distance: 47, outcome: 'GOOD', tags: ['clutch'] });
 *   const a = fx.nflAwardsState(RTG);              // NFL.AWARDS with synthetic season.kickerStats for all 32 teams
 *   const h = fx.hofFirstBallot(RTG);              // the §2.7.9 worked example (score 877)
 *
 * Every builder is deterministic and returns a fresh object.
 */
'use strict';
const schemaFx = require('./schema');

/** Zero every KickerStats block and the kick log of a state (fixtures pre-fill them). */
function resetStats(RTG, state) {
  const S = RTG.Schema;
  state.stats = S.emptyStats();
  state.history.moments = [];
  state.player.missStreak = 0;
  state.player.makeStreak = 0;
  return state;
}

/**
 * COLLEGE.REG week 5 with a clean stat sheet (user is K1 on a prestige-3 school).
 * @param {object} RTG @param {{seed?:number}} [opts] @returns {object} CareerState
 */
function cleanCollege(RTG, opts) {
  return resetStats(RTG, schemaFx.collegeRegWeek5(RTG, opts));
}

/**
 * NFL.REG week 9 with no game in progress and a clean stat sheet.
 * @param {object} RTG @param {{seed?:number}} [opts] @returns {object} CareerState
 */
function cleanNfl(RTG, opts) {
  const state = schemaFx.nflRegWeek9InGame(RTG, opts);
  state.game = null;
  return resetStats(RTG, state);
}

/**
 * A {ctx, result} pair for the user's team in the state's league.
 * o: {distance, outcome, tags, type:'FG'|'PAT', pressure, decisive, playoff, away, week, q, clock, scoreFor, scoreAgainst, weather, hash, oppId}
 * @param {object} RTG @param {object} state @param {object} [o] @returns {{ctx:object, result:object}}
 */
function kick(RTG, state, o) {
  o = o || {};
  const p = state.player;
  const league = state.season.league;
  const type = o.type || 'FG';
  const distance = o.distance !== undefined ? o.distance : (type === 'PAT' ? (league === 'NFL' ? RTG.Tuning.kick.distance.patNfl : RTG.Tuning.kick.distance.patCollege) : 40);
  const oppId = o.oppId || (league === 'NFL' ? 'PIT' : 'COA5');
  const week = o.week !== undefined ? o.week : state.week;
  const ctx = schemaFx.kickContext(RTG, {
    type, league, distance, hash: o.hash || 0, pressure: o.pressure !== undefined ? o.pressure : 0.15,
    decisive: !!o.decisive, playoff: !!o.playoff, away: !!o.away, iced: !!o.iced, weather: o.weather || 'clear',
    attrs: p.attrs, teamId: p.teamId, oppId, week,
    game: { q: o.q || 2, clock: o.clock !== undefined ? o.clock : 400, scoreFor: o.scoreFor || 7, scoreAgainst: o.scoreAgainst || 3, week, oppId, teamId: p.teamId }
  });
  const result = schemaFx.kickResult({ outcome: o.outcome || 'GOOD', distance, type, tags: o.tags || [] });
  return { ctx, result };
}

/**
 * Deterministic synthetic KickerStats for AI kickers: fga 14–26, fgm ≈ 75–92 %, long 41–60.
 * @param {object} RTG @param {number} i team index @param {object} [over] overrides
 * @returns {object} KickerStats
 */
function aiStats(RTG, i, over) {
  const s = RTG.Schema.emptyKickerStats();
  s.fga = 14 + (i * 7) % 13;
  s.fgm = s.fga - 1 - (i % 4);
  s.pat = 30 + i % 9; s.patMade = s.pat - (i % 3);
  s.long = 41 + (i * 5) % 20;
  s.made50plus = s.long >= 50 ? 1 + (i % 3) : 0;
  s.clutchA = 2 + i % 3; s.clutchM = 1 + i % 2;
  s.gameWinners = i % 5 === 0 ? 1 : 0;
  s.pts = s.fgm * 3 + s.patMade;
  s.games = 17; s.gamesStarted = 17;
  s.clutchBest = 20 + (i * 3) % 15;
  s.clutchBestDist = 40 + i % 15;
  if (over) Object.assign(s, over);
  return s;
}

/**
 * Fill season.kickerStats for every team of the state's league (except the user's team) with aiStats.
 * @param {object} RTG @param {object} state @param {function(object, number):object} [fn] custom per-team builder
 */
function fillKickerStats(RTG, state, fn) {
  const league = RTG.Schema.leagueOf(state, state.season.league);
  state.season.kickerStats = {};
  league.teams.forEach((t, i) => {
    if (t.id === state.player.teamId) return;
    state.season.kickerStats[t.id] = fn ? fn(t, i) : aiStats(RTG, i);
  });
  return state.season.kickerStats;
}

/**
 * NFL.AWARDS: user with a solid season (20/24, long 54, 2 GW), every other team filled with
 * synthetic stats. `opts.best` = teamId to make a clear #1 (score far ahead, ≥ 3 GW).
 * @param {object} RTG @param {{seed?:number, best?:string, second?:string}} [opts] @returns {object} CareerState
 */
function nflAwardsState(RTG, opts) {
  opts = opts || {};
  const state = cleanNfl(RTG, opts);
  state.phase = 'AWARDS'; state.week = 22;
  state.season.schedule.forEach((g) => { if (!g.played) { g.played = true; g.score = { home: 24, away: 20 }; } });
  const u = state.stats.season;
  u.fga = 24; u.fgm = 20; u.pat = 36; u.patMade = 35; u.long = 54; u.made50plus = 3; u.clutchA = 4; u.clutchM = 3; u.gameWinners = 2; u.pts = 60 + 35;
  u.games = 17; u.gamesStarted = 17; u.clutchBest = 30.1; u.clutchBestDist = 43;
  state.stats.career = RTG.Util.deepClone(u); state.stats.nfl = RTG.Util.deepClone(u);
  fillKickerStats(RTG, state, (t, i) => {
    if (opts.best && t.id === opts.best) return aiStats(RTG, i, { fga: 40, fgm: 39, long: 61, made50plus: 9, clutchM: 6, gameWinners: 4, pts: 39 * 3 + 40, clutchBest: 61 });
    if (opts.second && t.id === opts.second) return aiStats(RTG, i, { fga: 34, fgm: 31, long: 57, made50plus: 5, clutchM: 4, gameWinners: 2, pts: 31 * 3 + 38 });
    return aiStats(RTG, i);
  });
  return state;
}

/**
 * COLLEGE.AWARDS in year 1 (freshman) with synthetic stats for the other 47 teams and a user
 * season of 18/21 (eligible for every rank award).
 * @param {object} RTG @param {{seed?:number}} [opts] @returns {object} CareerState
 */
function collegeAwardsState(RTG, opts) {
  const state = cleanCollege(RTG, opts);
  state.phase = 'AWARDS'; state.week = 17;
  state.season.schedule.forEach((g) => { if (!g.played) { g.played = true; g.score = { home: 27, away: 17 }; } });
  const u = state.stats.season;
  u.fga = 21; u.fgm = 18; u.pat = 40; u.patMade = 40; u.long = 52; u.made50plus = 2; u.clutchA = 3; u.clutchM = 2; u.gameWinners = 1; u.pts = 54 + 40;
  u.games = 12; u.gamesStarted = 12; u.clutchBest = 28.5; u.clutchBestDist = 38;
  state.stats.career = RTG.Util.deepClone(u); state.stats.college = RTG.Util.deepClone(u);
  fillKickerStats(RTG, state);
  return state;
}

/**
 * The §2.7.9 worked example: 14 NFL seasons as K1 at 86 %, 320 FGM, 40 50+, 12 GW,
 * 2 All-League 1st, 1 title, 2 NFL records held → 256+120+27+144+50+30+210+40 = 877 (FIRST_BALLOT).
 * @param {object} RTG @returns {object} CareerState
 */
function hofFirstBallot(RTG) {
  const state = schemaFx.retiredLegacy(RTG);
  const S = RTG.Schema;
  state.history.seasons = state.history.seasons.filter((l) => l.league !== 'NFL');
  for (let y = 5; y <= 18; y++) {
    const st = S.emptyKickerStats();
    st.fga = 27; st.fgm = 23; st.games = 17; st.gamesStarted = 17;
    state.history.seasons.push({ year: y, league: 'NFL', teamId: 'BOS', teamName: 'Boston Harbormen', age: 17 + y, ovr: 84, role: 'K1', stats: st, awards: [], teamRecord: '11-6', champion: y === 14, playoffResult: y === 14 ? 'CHAMP' : '', grade: 'B', salary: 3.4 });
  }
  state.history.awards = [
    { year: 10, league: 'NFL', id: 'ALL_LEAGUE_1', name: 'All-League First Team K', teamId: 'BOS' },
    { year: 12, league: 'NFL', id: 'ALL_LEAGUE_1', name: 'All-League First Team K', teamId: 'BOS' }
  ];
  const n = S.emptyKickerStats();
  n.fga = 372; n.fgm = 320; n.pat = 390; n.patMade = 390; n.pts = 320 * 3 + 390; n.long = 63; n.made50plus = 40; n.gameWinners = 12; n.games = 238; n.gamesStarted = 238;
  state.stats.nfl = n;
  state.stats.career = RTG.Util.deepClone(n);
  Object.keys(state.records.nfl).forEach((k) => { state.records.nfl[k].isUser = false; });
  state.records.nfl.careerGW.isUser = true; state.records.nfl.careerGW.holder = state.player.name.full; state.records.nfl.careerGW.value = 31;
  state.records.nfl.careerFGM.isUser = true; state.records.nfl.careerFGM.holder = state.player.name.full; state.records.nfl.careerFGM.value = 561;
  state.flags = {}; state.player.flags = {}; state.history.contracts = [];
  return state;
}

/**
 * A 6-season 82 % journeyman: 120 FGM, 8 50+, 2 GW, 6 seasons as K1, no awards → ≈ 244 (Solid Starter).
 * @param {object} RTG @returns {object} CareerState
 */
function hofJourneyman(RTG) {
  const state = hofFirstBallot(RTG);
  const S = RTG.Schema;
  state.history.seasons = state.history.seasons.filter((l) => l.league !== 'NFL');
  for (let y = 5; y <= 10; y++) {
    const st = S.emptyKickerStats();
    st.fga = 24; st.fgm = 20;
    state.history.seasons.push({ year: y, league: 'NFL', teamId: 'BOS', teamName: 'Boston Harbormen', age: 17 + y, ovr: 72, role: 'K1', stats: st, awards: [], teamRecord: '8-9', champion: false, playoffResult: '', grade: 'C', salary: 1.1 });
  }
  state.history.awards = [];
  const n = S.emptyKickerStats();
  n.fga = 146; n.fgm = 120; n.pat = 150; n.patMade = 148; n.pts = 120 * 3 + 148; n.long = 56; n.made50plus = 8; n.gameWinners = 2;
  state.stats.nfl = n; state.stats.career = RTG.Util.deepClone(n);
  Object.keys(state.records.nfl).forEach((k) => { state.records.nfl[k].isUser = false; });
  return state;
}

module.exports = { resetStats, cleanCollege, cleanNfl, kick, aiStats, fillKickerStats, nflAwardsState, collegeAwardsState, hofFirstBallot, hofJourneyman };
