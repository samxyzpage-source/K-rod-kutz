/**
 * Season fixtures (E2). Plain factories that take RTG (from test/load.js) and
 * build a valid SeasonState with N weeks of plausible results so standings,
 * rankings, playoff and bowl logic can be exercised quickly.
 *
 *   const fx = require('./fixtures/season');
 *   const s = fx.seasonState(RTG, { league: 'COLLEGE', weeks: 12, seed: 7 });
 *   s.season.standings, s.season.rankings, s.league, s.rng
 *
 * Scores come from the teams' OFF/DEF ratings plus rng noise, so good teams
 * win more often but nothing is scripted. Every factory is deterministic for a
 * given seed. Standings/rankings are recomputed after every played week the
 * same way Season.endWeek does (Standings.rankings → Standings.compute).
 */
'use strict';
const leagueFx = require('./league');

/**
 * Plausible final score for a game from the two teams' ratings.
 * Draws: 2 gauss (4 draws) + 1 chance (NFL tie check) = 5 draws.
 * @param {object} RTG @param {object} rng @param {object} home Team @param {object} away Team
 * @param {'COLLEGE'|'NFL'} kind @param {{allowTie?: boolean}} [opts]
 * @returns {{home: number, away: number}}
 */
function scoreFor(RTG, rng, home, away, kind, opts) {
  opts = opts || {};
  const homeAdv = (RTG.Tuning && RTG.Tuning.league && RTG.Tuning.league.homeAdv) || 3;
  const base = kind === 'NFL' ? 23 : 28;
  const edgeH = (home.OFF - away.DEF + homeAdv) / 100;
  const edgeA = (away.OFF - home.DEF) / 100;
  let hs = Math.round(base + 40 * edgeH + rng.gauss(0, 9));
  let as = Math.round(base + 40 * edgeA + rng.gauss(0, 9));
  hs = Math.max(0, hs); as = Math.max(0, as);
  const tie = rng.chance(0.03);
  if (hs === as) {
    if (kind === 'NFL' && (opts.allowTie === undefined ? true : opts.allowTie) && tie) return { home: hs, away: as };
    hs += 3;                                     // OT: home wins by a field goal
  }
  return { home: hs, away: as };
}

/**
 * Play one scheduled game: sets played/score/ot and records the result into
 * season.results via Standings.recordResult.
 * @param {object} RTG @param {object} season @param {object} league @param {object} game @param {object} rng
 * @param {{score?: {home:number, away:number}, allowTie?: boolean}} [opts] force a score
 * @returns {object} the game
 */
function playGame(RTG, season, league, game, rng, opts) {
  opts = opts || {};
  const tm = league.teamIndex || {};
  const home = league.teams[tm[game.homeId]] || league.teams.find((t) => t.id === game.homeId);
  const away = league.teams[tm[game.awayId]] || league.teams.find((t) => t.id === game.awayId);
  const isPostseason = game.kind !== 'REG';
  const score = opts.score || scoreFor(RTG, rng, home, away, league.kind, { allowTie: isPostseason ? false : opts.allowTie });
  if (isPostseason && score.home === score.away) score.home += 3;
  game.played = true;
  game.score = { home: score.home, away: score.away };
  game.ot = false;
  RTG.Standings.recordResult(season, league, game);
  return game;
}

/**
 * Recompute rankings (college) and standings the way Season.endWeek does.
 * @param {object} RTG @param {object} season @param {object} league @param {object} rng
 */
function refresh(RTG, season, league, rng) {
  if (league.kind === 'COLLEGE') {
    const prev = season.rankings && Object.keys(season.rankings).length ? season.rankings : null;
    season.rankings = RTG.Standings.rankings(season, league, prev);
  }
  season.standings = RTG.Standings.compute(season, league, rng);
}

/**
 * Play every unplayed REG game in weeks [from, to] and refresh standings after each week.
 * @param {object} RTG @param {object} season @param {object} league @param {object} rng
 * @param {number} from @param {number} to
 */
function playWeeks(RTG, season, league, rng, from, to) {
  for (let w = from; w <= to; w++) {
    let any = false;
    for (const g of season.schedule) {
      if (g.week !== w || g.played || g.kind !== 'REG') continue;
      playGame(RTG, season, league, g, rng);
      any = true;
    }
    if (any) refresh(RTG, season, league, rng);
  }
}

/**
 * A SeasonState with `weeks` regular-season weeks played.
 * @param {object} RTG
 * @param {{league?: 'COLLEGE'|'NFL', weeks?: number, seed?: number, year?: number, prevStandings?: object[]|null, leagues?: {college, nfl}}} [opts]
 * @returns {{season: object, league: object, leagues: {college: object, nfl: object}, rng: object}}
 */
function seasonState(RTG, opts) {
  opts = opts || {};
  const kind = opts.league === 'NFL' ? 'NFL' : 'COLLEGE';
  const seed = opts.seed === undefined ? 1234 : opts.seed;
  const year = opts.year || 1;
  const rng = leagueFx.testRng(RTG, seed);
  const leagues = opts.leagues || leagueFx.buildLeagues(RTG, rng, year);
  const league = kind === 'NFL' ? leagues.nfl : leagues.college;
  league.year = year;
  const season = RTG.Schema ? RTG.Schema.emptySeason(kind, year) : {
    league: kind, year, schedule: [], results: {}, rankings: {}, standings: [], playoffs: null, bowls: null,
    goals: [], trainingDone: false, focus: null, userGameId: null, weekGameDone: false, kickerStats: {},
  };
  season.schedule = kind === 'NFL'
    ? RTG.Schedule.nfl(league, year, opts.prevStandings || null, rng)
    : RTG.Schedule.college(league, year, rng);
  for (const t of league.teams) season.results[t.id] = RTG.Schema ? RTG.Schema.emptyTeamResult() : { w: 0, l: 0, t: 0, pf: 0, pa: 0, confW: 0, confL: 0, divW: 0, divL: 0, h2h: {}, streak: 0 };
  refresh(RTG, season, league, rng);           // preseason poll + zeroed standings
  const weeks = opts.weeks === undefined ? 0 : opts.weeks;
  if (weeks > 0) playWeeks(RTG, season, league, rng, 1, weeks);
  return { season, league, leagues, rng };
}

/**
 * A complete regular season (college 12 weeks, NFL 18 weeks), standings final.
 * @param {object} RTG @param {object} [opts] same as seasonState
 */
function fullRegularSeason(RTG, opts) {
  opts = Object.assign({}, opts || {});
  const kind = opts.league === 'NFL' ? 'NFL' : 'COLLEGE';
  const T = RTG.Tuning.schedule;
  opts.weeks = kind === 'NFL' ? T.nfl.regWeeks : T.college.regWeeks - 1;
  return seasonState(RTG, opts);
}

/**
 * Run a whole college postseason on a finished regular season: CCGs → playoff
 * field + bowls → play every bracket round to a champion. Mutates `s.season`.
 * @param {object} RTG @param {{season, league, rng}} s from fullRegularSeason
 * @returns {{bracket: object, bowls: object[], ccg: object[]}}
 */
function playCollegePostseason(RTG, s) {
  const St = RTG.Standings;
  const { season, league, rng } = s;
  const ccg = St.conferenceChampionshipGames(season, league, rng);
  for (const g of ccg) { season.schedule.push(g); playGame(RTG, season, league, g, rng); }
  refresh(RTG, season, league, rng);
  season.playoffs = St.playoffField(season, league, rng);
  season.bowls = St.bowls(season, league, rng);
  for (const g of season.bowls) { season.schedule.push(g); playGame(RTG, season, league, g, rng); }
  playBracket(RTG, s);
  return { bracket: season.playoffs, bowls: season.bowls, ccg };
}

/**
 * Run a whole NFL postseason on a finished regular season. Mutates `s.season`.
 * @param {object} RTG @param {{season, league, rng}} s
 * @returns {object} the completed bracket
 */
function playNflPostseason(RTG, s) {
  const { season, league } = s;
  season.playoffs = RTG.Standings.nflPlayoffField(season, league, s.rng);
  playBracket(RTG, s);
  return season.playoffs;
}

/**
 * Play every round of season.playoffs (pushing round games into the schedule)
 * until the bracket is complete.
 * @param {object} RTG @param {{season, league, rng}} s
 */
function playBracket(RTG, s) {
  const St = RTG.Standings;
  const { season, league, rng } = s;
  let guard = 0;
  while (!season.playoffs.complete && guard++ < 10) {
    const games = St.roundGames(season.playoffs, undefined, league);
    for (const g of games) {
      if (season.schedule.some((x) => x.id === g.id)) continue;
      season.schedule.push(g);
      playGame(RTG, season, league, g, rng);
    }
    St.advanceBracket(season.playoffs, season.schedule, league);
  }
}

/**
 * Overwrite a team's results row with explicit numbers (for tiebreak fixtures).
 * @param {object} season @param {string} teamId @param {object} fields partial TeamResult
 */
function setResult(season, teamId, fields) {
  const r = season.results[teamId] || (season.results[teamId] = { w: 0, l: 0, t: 0, pf: 0, pa: 0, confW: 0, confL: 0, divW: 0, divL: 0, h2h: {}, streak: 0 });
  Object.assign(r, fields);
  return r;
}

/**
 * Record a head-to-head result directly into season.results (no schedule game).
 * @param {object} season @param {string} winnerId @param {string} loserId @param {{conf?: boolean, div?: boolean, pf?: number, pa?: number}} [o]
 */
function h2h(season, winnerId, loserId, o) {
  o = o || {};
  const w = setResult(season, winnerId, {}), l = setResult(season, loserId, {});
  const pf = o.pf === undefined ? 24 : o.pf, pa = o.pa === undefined ? 17 : o.pa;
  w.w++; l.l++; w.pf += pf; w.pa += pa; l.pf += pa; l.pa += pf;
  w.h2h[loserId] = w.h2h[loserId] || [0, 0, 0]; l.h2h[winnerId] = l.h2h[winnerId] || [0, 0, 0];
  w.h2h[loserId][0]++; l.h2h[winnerId][1]++;
  if (o.conf || o.div) { w.confW++; l.confL++; }
  if (o.div) { w.divW++; l.divL++; }
}

module.exports = {
  seasonState, fullRegularSeason, playWeeks, playGame, scoreFor, refresh,
  playCollegePostseason, playNflPostseason, playBracket, setResult, h2h,
};
