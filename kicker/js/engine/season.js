/**
 * Road to Glory: Kicker — RTG.Season (SPEC §3.5.17; §2.2 weekly order; §2.5.1 yearly drift & AI kickers;
 * §2.6 postseason structures; §2.7.3 season flow; §3.6 phase transitions)
 *
 * The week loop of the active league: season reset + schedule build (start), the regular-season week
 * (endWeek, in the binding §3.5.17 order), every other game of the league simulated through Sim.simAiGame
 * on a forked rng (D14: awards and records come from real simulated stats), the postseason (college CCG week
 * 13, bowls + 12-team playoff weeks 14–17; NFL weeks 19–22 with re-seeding), the season close (finishSeason →
 * AWARDS), the offseason hand-off (offseason → Career.offseasonChain) and the yearly roll-over (advanceYear →
 * start). Season.simUserGameAuto plays the user's game with auto kicks (Career and the Engine facade both use it).
 *
 * Pure over plain JSON + the rng passed in: no DOM, no clock, no ambient randomness. Sibling modules (Sim,
 * Standings, Schedule, Stats, Awards, Events, Player, Contracts, Names) and Career are resolved AT CALL TIME;
 * Career is optional (camp battle / offseason chain are skipped when it is absent).
 *
 * Phase model (§2.7.3 / §3.6):
 *   PRE (week 0) → REG (weeks 1..regWeeks; the college conference championship games are scheduled for week 13
 *   when week 12 closes, so week 13 is the last REG week) → POST (college: bowls + playoff round 1 in week 14,
 *   QF 15, SF 16, National Title Game 17; NFL: WC 19, DIV 20, CONF 21, Championship Bowl 22) → AWARDS → OFF →
 *   advanceYear → PRE of year + 1. A user whose team is eliminated (or has no bowl) skips straight to AWARDS:
 *   the rest of the bracket is simulated at once (fastForward) so a champion always exists.
 *
 * State extensions (all JSON-safe, all optional):
 *   season.rankingsPrev     last week's poll (college) — the weekly rankings refresh is idempotent within a week
 *   season.campBattle       {required, reason, rivalName, rivalOvr, myOvr, pending}   (§2.2 preseason rule)
 *   season.contractAtStart  {type, startYear, yearIdx} — the contract that covered this season (advanceYear tick)
 *   season.rivalTrack       [{week, fga, fgm}] cumulative line of the team's other kicker (§2.2 "rival cold")
 *   season.awardsList       Awards.compute output for the awards screen
 *   season.finished         finishSeason ran (idempotency)
 *   season.bowls            bowl descriptors (id, bowlName, teams, week, site); the playable Games live in the schedule
 *   state.flags.seasonInjuryWeeks · bodyCheck · midSeasonCut · cutNoOffers · rivalCold · wonTitle
 *   player.flags.agedYear · benchNoted · formNote · jsNote · hotSeatNoted · injuryNoted · cutWarnNoted · hotNoted ·
 *                slumpNoted · lostJob · coldSeasons · domeSeasons
 *
 * RNG draw order (binding for replay determinism; every draw comes from the rng passed in):
 *   start         : Schedule (NFL slotting shuffles; college 0) → Standings.compute fork 1 → Awards.seasonGoals 3
 *                   (when the user has a team in the league) → Career.campBattle (rule applies and Career exists)
 *   simOtherGames : per unplayed non-user game in schedule order: rng.fork('wk<week>:<gameId>') = 1 parent draw
 *                   (the child plays the whole game) → Standings.compute fork 1
 *   endWeek       : simOtherGames → Player.weeklyTick 2 → Player.updateJobSecurity 0 → bench headline 1 |
 *                   cut: Contracts.applyCut 0 · headline 1 · Contracts.generateOffers 1 + 1 per offer
 *                   (· Events.force 0) | lost job: headline 1 → Awards.weekly 0 → Stats.checkRecords 0 + 1 headline
 *                   per milestone → messages 0 (+ hot-seat headline 1, injury headline 1) → Events.roll 1–2 →
 *                   week++ → [college week 13: CCG scheduling 0 | past the last REG week: startPostseason
 *                   (Standings.playoffField / bowls / nflPlayoffField 0 with populated tables) → postseasonWeek
 *                   (fastForward: simOtherGames per remaining week → finishSeason)]
 *   finishSeason  : [fastForward] → Awards.compute 0–1 → user award headline 1 → Stats.finishSeason 0 + 1 headline
 *                   per record milestone
 *   advanceYear   : Season.ageTick 2 (growth window only) → coach churn per ≤ 35 %-win team in league order:
 *                   chance 1 → Names.coach 1 (+ user headline 1) → rating drift per team, college then NFL:
 *                   OFF gauss 2 · DEF gauss 2 → AI kickers per team (K1 then K2), college then NFL:
 *                   [expired deal re-sign int 1] → [retire chance 1 at ≥ 38] → [rookie: Names.player 3–4 · ovr
 *                   gauss 2 · attrs gauss 2×5] → start
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  var Util = RTG.Util, Tuning = RTG.Tuning;
  var Season = {};

  var ATTRS = ['POW', 'ACC', 'CON', 'CLU', 'KO'];
  var IN_SEASON = { REG: true, POST: true };

  // ═══════════════════════════════ late-bound modules & small helpers ═══════════════════════════════

  function Schema() { return RTG.Schema; }
  function Sim() { return RTG.Sim; }
  function Standings() { return RTG.Standings; }
  function Schedule() { return RTG.Schedule; }
  function Stats() { return RTG.Stats; }
  function Awards() { return RTG.Awards; }
  function Events() { return RTG.Events; }
  function Player() { return RTG.Player; }
  function Contracts() { return RTG.Contracts; }
  function Career() { return RTG.Career; }
  function Names() { return RTG.Names; }
  function isFn(f) { return typeof f === 'function'; }
  function num(v, d) { return typeof v === 'number' && v === v ? v : d; }
  function has(arr, v) { return Array.isArray(arr) && arr.indexOf(v) >= 0; }
  function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
  function TS() { return Tuning.schedule; }
  function TSea() { return Tuning.season; }
  function schedT(kind) { return kind === 'NFL' ? TS().nfl : TS().college; }
  function clone(v) { return Util.deepClone(v); }

  /** The active league kind: the player's league, else the season's (§3.5.17 "active league"). */
  function activeKind(state) {
    var p = state.player;
    var k = (p && p.league) || (state.season && state.season.league) || 'COLLEGE';
    return k === 'NFL' ? 'NFL' : 'COLLEGE';
  }

  function leagueObj(state, kind) {
    if (!state || !state.leagues) return null;
    return kind === 'NFL' ? state.leagues.nfl : state.leagues.college;
  }

  function teamIn(lg, id) {
    if (!lg || !lg.teams || !id) return null;
    var idx = lg.teamIndex && lg.teamIndex[id];
    if (typeof idx === 'number' && lg.teams[idx] && lg.teams[idx].id === id) return lg.teams[idx];
    for (var i = 0; i < lg.teams.length; i++) if (lg.teams[i].id === id) return lg.teams[i];
    return null;
  }

  /** Does the user belong to a team of the season's league? */
  function userInLeague(state) {
    var p = state.player, s = state.season;
    return !!(p && p.teamId && s && p.league === s.league);
  }

  function userTeam(state) {
    return userInLeague(state) ? teamIn(leagueObj(state, state.season.league), state.player.teamId) : null;
  }

  function findGame(schedule, id) {
    if (!Array.isArray(schedule) || !id) return null;
    for (var i = 0; i < schedule.length; i++) if (schedule[i] && schedule[i].id === id) return schedule[i];
    return null;
  }

  function gameFor(schedule, teamId, week) {
    if (!Array.isArray(schedule) || !teamId) return null;
    for (var i = 0; i < schedule.length; i++) {
      var g = schedule[i];
      if (g.week === week && (g.homeId === teamId || g.awayId === teamId)) return g;
    }
    return null;
  }

  function gamesInWeek(schedule, week) {
    var out = [];
    if (!Array.isArray(schedule)) return out;
    for (var i = 0; i < schedule.length; i++) if (schedule[i].week === week) out.push(schedule[i]);
    return out;
  }

  /** Append schedule-ready games not already in the schedule (by id). @returns {Object[]} the added games */
  function pushGames(season, games) {
    var added = [];
    if (!Array.isArray(games)) return added;
    for (var i = 0; i < games.length; i++) {
      var g = games[i];
      if (!g || findGame(season.schedule, g.id)) continue;
      if (typeof g.played !== 'boolean') g.played = false;
      season.schedule.push(g);
      added.push(g);
    }
    return added;
  }

  function teamName(state, id) {
    var S = Schema();
    var t = S && isFn(S.teamById) ? S.teamById(state, id) : null;
    return t ? (t.school || t.name) : String(id || 'the opponent');
  }

  function pushTimeline(state, entry) {
    var h = state.history;
    if (!h || !Array.isArray(h.timeline)) return null;
    h.timeline.push(entry);
    var cap = Tuning.save.timelineCap;
    while (h.timeline.length > cap) h.timeline.shift();
    return entry;
  }

  function timelineRow(state, kind, text, impact) {
    return { year: state.year, week: state.week, kind: kind, text: text, impact: impact, teamId: state.player ? state.player.teamId || null : null };
  }

  /** Inbox note via Events.message (0 draws); null when Events is absent. */
  function message(state, kind, vars) {
    var E = Events();
    if (!E || !isFn(E.message) || !Array.isArray(state.inbox)) return null;
    return E.message(state, kind, vars || {});
  }

  /** Headline via Events.headline (exactly 1 draw); null when Events is absent (0 draws). */
  function headline(state, rng, tag, vars) {
    var E = Events();
    if (!E || !isFn(E.headline) || !Array.isArray(state.headlines)) return null;
    return E.headline(state, rng, tag, vars || {});
  }

  function emptyKickerStats() {
    var S = Schema();
    if (S && isFn(S.emptyKickerStats)) return S.emptyKickerStats();
    var St = Stats();
    if (St && isFn(St.emptyStats)) return St.emptyStats();
    return { fga: 0, fgm: 0, pat: 0, patMade: 0, pts: 0, long: 0, buckets: {}, clutchA: 0, clutchM: 0, decisiveA: 0, decisiveM: 0,
      gameWinners: 0, tieForcers: 0, blocked: 0, doinks: 0, doinkIn: 0, wideL: 0, wideR: 0, short: 0, made50plus: 0,
      consecutive: 0, bestConsecutive: 0, games: 0, gamesStarted: 0, koTouchbacks: 0, koCount: 0, wins: 0, losses: 0 };
  }

  function emptyTeamResult() {
    var S = Schema();
    if (S && isFn(S.emptyTeamResult)) return S.emptyTeamResult();
    return { w: 0, l: 0, t: 0, pf: 0, pa: 0, confW: 0, confL: 0, divW: 0, divL: 0, h2h: {}, streak: 0 };
  }

  function ovrOf(attrs) {
    var P = Player();
    if (P && isFn(P.ovr)) return P.ovr(attrs);
    var W = Tuning.progression.ovrWeights, s = 0;
    for (var k in W) if (Object.prototype.hasOwnProperty.call(W, k)) s += W[k] * num(attrs[k], 0);
    return Math.round(s);
  }

  function recordText(r) {
    return r ? num(r.w, 0) + '-' + num(r.l, 0) + (r.t ? '-' + r.t : '') : '0-0';
  }

  /** "24/28 FG · 41/42 PAT · long 54" for a KickerStats block. */
  function lineText(s) {
    if (!s) return '';
    return num(s.fgm, 0) + '/' + num(s.fga, 0) + ' FG · ' + num(s.patMade, 0) + '/' + num(s.pat, 0) + ' PAT · long ' + num(s.long, 0);
  }

  /** The user's kick rows of one game (newest rows of stats.kicks). */
  function userRowsForGame(state, gameId) {
    var rows = state.stats && state.stats.kicks, out = [];
    if (!Array.isArray(rows) || !gameId) return out;
    for (var i = rows.length - 1; i >= 0; i--) {
      if (rows[i] && rows[i].gameId === gameId) out.unshift(rows[i]);
      else if (out.length) break;
    }
    return out;
  }

  /** {fga, fgm, pat, patMade, long} from a game's user rows. */
  function gameLine(rows) {
    var l = { fga: 0, fgm: 0, pat: 0, patMade: 0, long: 0 };
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.type === 'PAT') { l.pat++; if (r.made) l.patMade++; }
      else if (r.type === 'FG') { l.fga++; if (r.made) { l.fgm++; if (r.distance > l.long) l.long = r.distance; } }
    }
    return l;
  }

  /** The AI kicker object whose kicks land in season.kickerStats[team.id] (mirrors Sim's aiKickerFor). */
  function aiKickerOf(state, team) {
    if (!team) return null;
    var p = state.player;
    if (userInLeague(state) && p.teamId === team.id) {
      return (p.role === 'K1' ? (team.kicker2 || team.kicker) : (team.kicker || team.kicker2)) || null;
    }
    return team.kicker || team.kicker2 || null;
  }

  /** Recompute the poll (college, from last week's snapshot) and the standings. Idempotent within a week. */
  function refreshTables(state, rng) {
    var season = state.season, lg = leagueObj(state, season.league), St = Standings();
    if (!lg || !St) return;
    if (season.league === 'COLLEGE' && isFn(St.rankings)) season.rankings = St.rankings(season, lg, season.rankingsPrev || null);
    if (isFn(St.compute)) season.standings = St.compute(season, lg, rng);           // fork 1
  }

  function resetWeekFlags(state) {
    var s = state.season;
    s.weekGameDone = false;
    s.trainingDone = false;
    s.focus = null;
    s.userGameId = null;
  }

  /** Point season.userGameId at the user's game of the current week (null on a bye). */
  function setUserGame(state) {
    var s = state.season;
    if (!userInLeague(state)) { s.userGameId = null; return null; }
    var g = gameFor(s.schedule, state.player.teamId, state.week);
    s.userGameId = g ? g.id : null;
    return g;
  }

  // ═══════════════════════════════ start / beginRegular ═══════════════════════════════

  /**
   * Camp-battle rule (§2.2): preseason battle when the team's other kicker has OVR ≥ myOVR − 5, when the user
   * is the backup, or when the job was lost last season.
   * @param {Object} state @returns {{required:boolean, reason:string|null, rivalName:string|null, rivalOvr:number|null, myOvr:number, pending:boolean}}
   */
  function campBattleInfo(state) {
    var p = state.player, team = userTeam(state);
    var info = { required: false, reason: null, rivalName: null, rivalOvr: null, myOvr: ovrOf(p.attrs), pending: false };
    if (!team) return info;
    var rival = p.role === 'K1' ? (team.kicker2 || team.kicker) : (team.kicker || team.kicker2);
    if (!rival) return info;
    info.rivalName = rival.name || null;
    info.rivalOvr = num(rival.ovr, rival.attrs ? ovrOf(rival.attrs) : null);
    var margin = Tuning.soft.camp.triggerOvrMargin;
    if (p.flags && p.flags.lostJob === state.year - 1) { info.required = true; info.reason = 'LOST_JOB'; }
    else if (p.role === 'K2') { info.required = true; info.reason = 'BACKUP'; }
    else if (info.rivalOvr !== null && info.rivalOvr >= info.myOvr - margin) { info.required = true; info.reason = 'RIVAL'; }
    return info;
  }

  /**
   * Start a season (§3.5.17): builds the active league's schedule (Schedule.college / Schedule.nfl with last
   * season's standings), resets `state.season` (results and kickerStats rows for every team, preseason poll,
   * zeroed standings), sets phase 'PRE' and week 0, sets the three season goals (Awards.seasonGoals) and, when
   * the §2.2 rule applies and RTG.Career is present, opens the camp battle (Career.campBattle → pending KICKS).
   * Draws: Schedule (NFL only) → Standings.compute fork 1 → seasonGoals 3 (with a team) → Career.campBattle.
   * @param {Object} state CareerState (stage COLLEGE or NFL) @param {RNG} rng
   * @returns {Object} the new SeasonState
   */
  Season.start = function (state, rng) {
    var p = state.player;
    var kind = activeKind(state);
    var lg = leagueObj(state, kind);
    if (!lg) throw new Error('Season.start: league ' + kind + ' is missing');
    var S = Schema(), Sch = Schedule(), A = Awards();
    if (!Sch || !isFn(Sch.college) || !isFn(Sch.nfl)) throw new Error('Season.start: RTG.Schedule is required');
    var old = state.season || null;
    var prevStandings = kind === 'NFL' && old && old.league === 'NFL' && old.year === state.year - 1
      && Array.isArray(old.standings) && old.standings.length ? old.standings : null;

    var season = S && isFn(S.emptySeason) ? S.emptySeason(kind, state.year) : {
      league: kind, year: state.year, schedule: [], results: {}, rankings: {}, standings: [], playoffs: null, bowls: null,
      goals: [], trainingDone: false, focus: null, userGameId: null, weekGameDone: false, kickerStats: {}
    };
    lg.year = state.year;
    season.schedule = kind === 'NFL' ? Sch.nfl(lg, state.year, prevStandings, rng) : Sch.college(lg, state.year, rng);
    for (var i = 0; i < lg.teams.length; i++) {
      season.results[lg.teams[i].id] = emptyTeamResult();
      season.kickerStats[lg.teams[i].id] = emptyKickerStats();
    }
    season.rankingsPrev = null;
    season.rivalTrack = [];
    season.awardsList = [];
    season.finished = false;
    season.contractAtStart = p && p.contract
      ? { type: p.contract.type, startYear: num(p.contract.startYear, state.year), yearIdx: num(p.contract.yearIdx, 0) }
      : null;

    state.season = season;
    state.game = null;
    state.phase = 'PRE';
    state.week = 0;
    refreshTables(state, rng);                                                                   // fork 1
    if (kind === 'COLLEGE') season.rankingsPrev = clone(season.rankings);

    state.flags = state.flags || {};
    state.flags.seasonInjuryWeeks = 0;
    p.flags = p.flags || {};
    var notes = ['formNote', 'jsNote', 'hotSeatNoted', 'injuryNoted', 'cutWarnNoted', 'hotNoted', 'slumpNoted'];
    for (var n = 0; n < notes.length; n++) delete p.flags[notes[n]];
    if (p.flags.lostJob !== undefined && p.flags.lostJob < state.year - 1) delete p.flags.lostJob;

    if (userInLeague(state) && A && isFn(A.seasonGoals)) season.goals = A.seasonGoals(state, rng);   // 3 draws
    season.campBattle = campBattleInfo(state);
    if (season.campBattle.required) {
      message(state, 'coach_camp', { rival: season.campBattle.rivalName || 'the other guy' });
      var C = Career();
      if (C && isFn(C.campBattle)) {
        var sess = C.campBattle(state, rng);
        if (sess && !state.pending) state.pending = { kind: 'KICKS', session: sess };
        season.campBattle.pending = !!state.pending;
      }
    }
    resetWeekFlags(state);
    return season;
  };

  /**
   * Open the regular season: phase 'REG', week 1, the user's week-1 game (or bye) selected.
   * Draws: 0.
   * @param {Object} state @param {RNG} rng unused (signature parity) @returns {Object|null} the user's game ref
   */
  Season.beginRegular = function (state, rng) {
    void rng;
    if (!state.season) throw new Error('Season.beginRegular: no season (call Season.start first)');
    state.phase = 'REG';
    state.week = 1;
    resetWeekFlags(state);
    setUserGame(state);
    weekOpenMessages(state);
    return Season.userGameRef(state);
  };

  /** Week-1 agent notes (0 draws). */
  function weekOpenMessages(state) {
    var p = state.player, C = Contracts();
    if (!userInLeague(state) || state.season.league !== 'NFL') return;
    if (num(p.nflSeasons, 0) === 0) message(state, 'agent_rookie', {});
    else if (C && isFn(C.inFinalYear) && C.inFinalYear(state)) message(state, 'agent_final_year', {});
  }

  // ═══════════════════════════════ game refs ═══════════════════════════════

  /**
   * The user's game this week, or null on a bye / without a team / outside REG-POST.
   * @param {Object} state
   * @returns {{league:string, gameId:string, game:Object, week:number, kind:string, homeId:string, awayId:string,
   *            isHome:boolean, oppId:string, played:boolean, venue:string|null, neutral:boolean}|null}
   */
  Season.userGameRef = function (state) {
    var season = state.season, p = state.player;
    if (!season || !userInLeague(state) || !IN_SEASON[state.phase]) return null;
    var g = season.userGameId ? findGame(season.schedule, season.userGameId) : null;
    if (!g || g.week !== state.week) g = gameFor(season.schedule, p.teamId, state.week);
    if (!g) return null;
    var home = g.homeId === p.teamId;
    return {
      league: season.league, gameId: g.id, game: g, week: g.week, kind: g.kind || 'REG',
      homeId: g.homeId, awayId: g.awayId, isHome: home, oppId: home ? g.awayId : g.homeId,
      played: !!g.played, venue: g.venue || null, neutral: !!g.neutral
    };
  };

  /**
   * Play the user's game of the week with auto kicks (Sim.startGame → simToNextUserKick / autoResolvePending
   * loop → finishGame). Resumes `state.game` when a game is in progress. Returns null on a bye or when the
   * week's game is already done. Draws: the whole game (Sim) + finishGame.
   * @param {Object} state @param {RNG} rng @returns {Object|null} GameSummary
   */
  Season.simUserGameAuto = function (state, rng) {
    var Sm = Sim();
    if (!Sm) throw new Error('Season.simUserGameAuto: RTG.Sim is required');
    var gs = state.game || null;
    if (!gs) {
      var ref = Season.userGameRef(state);
      if (!ref || ref.played || state.season.weekGameDone) return null;
      gs = Sm.startGame(state, rng, { league: ref.league, gameId: ref.gameId });
    }
    // A resumed mid-game save may hold an un-announced pending kick: Sim.step refuses until it is applied.
    if (gs.pending && !gs.announce && !gs.done) Sm.autoResolvePending(gs, state, rng);
    var guard = Tuning.sim.summary.maxSteps;
    for (var i = 0; i < guard && !gs.done; i++) {
      var e = Sm.simToNextUserKick(gs, state, rng);
      if (e.type === 'END_GAME' || e.type === 'END') break;
      if ((e.type === 'USER_KICK' || e.type === 'USER_KICKOFF') && gs.pending) Sm.autoResolvePending(gs, state, rng);
      // ICE_TIMEOUT: the next simToNextUserKick delivers the announced USER_KICK
    }
    if (!gs.done) throw new Error('Season.simUserGameAuto: step guard exceeded');
    return Sm.finishGame(gs, state, rng);
  };

  // ═══════════════════════════════ other games ═══════════════════════════════

  /**
   * Simulate every unplayed game of the current week that is not the user's (Sim.simAiGame on
   * rng.fork('wk<week>:<gameId>'), schedule order), record the results (Standings.recordResult) and refresh
   * standings / rankings. Skips games already played, so calling it twice in a week is harmless.
   * Draws: 1 per simulated game (the fork) + Standings.compute fork 1.
   * @param {Object} state @param {RNG} rng
   * @returns {{gameId:string, homeId:string, awayId:string, score:{home:number, away:number}, ot:boolean}[]}
   */
  Season.simOtherGames = function (state, rng) {
    var season = state.season, Sm = Sim(), St = Standings();
    if (!season || !Sm) throw new Error('Season.simOtherGames: season and RTG.Sim are required');
    var lg = leagueObj(state, season.league);
    var userId = userInLeague(state) ? state.player.teamId : null;
    var games = gamesInWeek(season.schedule, state.week);
    var out = [];
    for (var i = 0; i < games.length; i++) {
      var g = games[i];
      if (g.played) continue;
      if (userId && (g.homeId === userId || g.awayId === userId)) continue;         // the user plays this one
      var child = rng.fork('wk' + state.week + ':' + g.id);                          // 1 parent draw
      var res = Sm.simAiGame(state, child, { league: season.league, gameId: g.id, game: g });
      if (!g.played) { g.played = true; g.score = { home: res.score.home, away: res.score.away }; g.ot = !!res.ot; }
      if (St && isFn(St.recordResult)) St.recordResult(season, lg, g);
      out.push({ gameId: g.id, homeId: g.homeId, awayId: g.awayId, score: { home: g.score.home, away: g.score.away }, ot: !!g.ot });
    }
    refreshTables(state, rng);                                                        // fork 1
    return out;
  };

  // ═══════════════════════════════ endWeek ═══════════════════════════════

  /**
   * Close the week (§3.5.17, order binding): simOtherGames → Standings.compute / rankings → Player.weeklyTick
   * → Player.updateJobSecurity → bench / cut checks (§2.2) → Awards.weekly → Stats.checkRecords → inbox
   * messages → Events.roll('week') → week++ (college week 13 schedules the CCGs; past the last regular week →
   * startPostseason; in POST → postseasonWeek). Refuses while something is pending, outside REG/POST, with a
   * game in progress, or while the user's game of the week is unplayed.
   * @param {Object} state @param {RNG} rng
   * @returns {Object} WeekReport {year, week, league, headlines, messages, event, eventId, injuries, bench,
   *   unbenched, cut, milestones, award, phaseChange, nextWeek, nextGame, userGame, bye, standingsUpdated}
   */
  Season.endWeek = function (state, rng) {
    var season = state.season, p = state.player;
    if (state.pending) throw new Error('Season.endWeek: resolve the pending ' + state.pending.kind + ' first');
    if (!season || !IN_SEASON[state.phase]) throw new Error('Season.endWeek: not in season (phase ' + state.phase + ')');
    if (state.game) throw new Error('Season.endWeek: finish the game in progress first');
    var ref = Season.userGameRef(state);
    if (ref && !ref.played) throw new Error('Season.endWeek: play or sim this week\'s game first (' + ref.gameId + ')');

    var P = Player(), A = Awards(), St = Stats(), E = Events();
    var hlBefore = Array.isArray(state.headlines) ? state.headlines.slice() : [];
    var msgBefore = Array.isArray(state.inbox) ? state.inbox.slice() : [];
    var outcome = ref ? gameOutcome(ref) : null;
    var report = {
      year: state.year, week: state.week, league: season.league,
      headlines: [], messages: [], event: false, eventId: null,
      injuries: { active: false, weeksLeft: 0, cleared: false, isNew: false },
      bench: false, unbenched: false, cut: null, milestones: [], award: null,
      phaseChange: null, nextWeek: null, nextGame: null, bye: !ref,
      userGame: ref ? { gameId: ref.gameId, oppId: ref.oppId, isHome: ref.isHome, kind: ref.kind, won: outcome ? outcome.won : false,
        tied: outcome ? outcome.tied : false, score: outcome ? { us: outcome.us, them: outcome.them } : null,
        line: gameLine(userRowsForGame(state, ref.gameId)) } : null,
      standingsUpdated: true
    };

    // 1. every other game of the week, then the tables
    Season.simOtherGames(state, rng);

    // 2. weekly tick (form, drifts, slump, injury countdown, week mods) — 2 draws
    var wasInjured = !!p.injury;
    var injuryKey = wasInjured ? state.year + ':' + state.week + ':' + p.injury.type : null;
    var isNewInjury = wasInjured && !p.flags.injuryNoted;
    if (isNewInjury) p.flags.injuryNoted = injuryKey;
    var tick = P && isFn(P.weeklyTick) ? P.weeklyTick(state, rng) : { injuryCleared: false, expiredMods: 0 };
    if (wasInjured) state.flags.seasonInjuryWeeks = num(state.flags.seasonInjuryWeeks, 0) + 1;
    report.injuries = { active: !!p.injury, weeksLeft: p.injury ? p.injury.weeksLeft : 0, cleared: !!tick.injuryCleared, isNew: isNewInjury };

    // 3. job security + bench / cut checks (user with a job in this league)
    var jsRes = null;
    if (userInLeague(state) && p.role !== 'NONE' && P && isFn(P.updateJobSecurity)) {
      jsRes = P.updateJobSecurity(state, ref ? { kicks: userRowsForGame(state, ref.gameId) } : null);
      jobChecks(state, rng, jsRes, report);
    }

    // 4. weekly award
    report.award = A && isFn(A.weekly) ? A.weekly(state) : null;

    // 5. records & milestones (headline per payload, 1 draw each)
    if (St && isFn(St.checkRecords)) {
      report.milestones = St.checkRecords(state) || [];
      for (var m = 0; m < report.milestones.length; m++) headline(state, rng, report.milestones[m].tag || 'milestone', report.milestones[m].vars);
    }

    // 6. inbox notes (0 draws; hot-seat / injury headlines 1 each)
    weeklyMessages(state, rng, ref, outcome, tick, isNewInjury, report);
    if (A && isFn(A.checkGoals)) goalNotes(state);

    // 7. the week's event (1–2 draws; 0 when a decision is already pending)
    var ev = E && isFn(E.roll) ? E.roll(state, rng, 'week') : null;
    report.event = !!ev;
    report.eventId = ev ? ev.id : null;

    // 8. next week / phase transition
    finalizeWeek(state, rng, report);

    report.headlines = newEntries(hlBefore, state.headlines);
    report.messages = newEntries(msgBefore, state.inbox);
    return report;
  };

  /** Entries of `after` that were not in `before` (object identity; caps may have shifted the arrays). */
  function newEntries(before, after) {
    var out = [];
    if (!Array.isArray(after)) return out;
    for (var i = 0; i < after.length; i++) if (before.indexOf(after[i]) < 0) out.push(after[i]);
    return out;
  }

  /** {won, tied, us, them} of the user's played game. */
  function gameOutcome(ref) {
    var g = ref.game;
    if (!g || !g.score) return null;
    var us = ref.isHome ? g.score.home : g.score.away, them = ref.isHome ? g.score.away : g.score.home;
    return { won: us > them, tied: us === them, us: us, them: them };
  }

  /** Bench notices, the "rival cold" tracker and the cut / lost-job rules (§2.2). */
  function jobChecks(state, rng, jsRes, report) {
    var p = state.player, kind = state.season.league, TI = TSea().timelineImpact;
    if (!jsRes) return;
    if (jsRes.benched && p.role === 'K2' && !p.flags.benchNoted) {
      p.flags.benchNoted = true;
      report.bench = true;
      message(state, 'coach_bench', {});
      headline(state, rng, 'bench', {});                                                        // 1 draw
      pushTimeline(state, timelineRow(state, 'BENCHED', 'Benched: Job Security down to ' + Math.round(p.js), TI.bench));
    } else if (p.flags.benchNoted && p.role === 'K1') {
      delete p.flags.benchNoted;
      report.unbenched = true;
      message(state, 'coach_unbench', {});
      pushTimeline(state, timelineRow(state, 'UNBENCHED', 'Back to K1: Job Security ' + Math.round(p.js), TI.unbench));
    }
    trackRival(state);
    if (jsRes.cutWarning) {
      if (kind === 'NFL') midSeasonCut(state, rng, report); else loseJob(state, rng, report);
    } else if (kind === 'NFL' && jsRes.lowWeeks >= TSea().inbox.cutWarnLowWeeks && !p.flags.cutWarnNoted) {
      p.flags.cutWarnNoted = true;
      message(state, 'gm_cut_warning', {});
    }
    if (!jsRes.lowWeeks) delete p.flags.cutWarnNoted;
  }

  /**
   * §2.2 "rival cold": the team's other kicker under 70 % over the last 3 weeks (min attempts from
   * Tuning.events.gates.coachShoppingMinFga) sets state.flags.rivalCold for event #9b (COACH_SHOPPING).
   * @returns {boolean}
   */
  function trackRival(state) {
    var season = state.season, p = state.player, J = Tuning.soft.js;
    var ks = season.kickerStats && p.teamId ? season.kickerStats[p.teamId] : null;
    var track = season.rivalTrack = season.rivalTrack || [];
    track.push({ week: state.week, fga: ks ? num(ks.fga, 0) : 0, fgm: ks ? num(ks.fgm, 0) : 0 });
    var n = track.length, baseIdx = n - 1 - J.rivalWeeks;
    var base = baseIdx >= 0 ? track[baseIdx] : { fga: 0, fgm: 0 };
    var fga = track[n - 1].fga - base.fga, fgm = track[n - 1].fgm - base.fgm;
    var cold = fga >= Tuning.events.gates.coachShoppingMinFga && fgm / fga < J.rivalFgPctBelow;
    state.flags = state.flags || {};
    if (cold) state.flags.rivalCold = true; else delete state.flags.rivalCold;
    return cold;
  }

  /** Close the open stint in history.teams. */
  function closeStint(state, endReason) {
    var st = state.history && state.history.teams;
    if (!Array.isArray(st)) return;
    for (var i = st.length - 1; i >= 0; i--) {
      if (st[i].toYear === null || st[i].toYear === undefined) { st[i].toYear = state.year; st[i].endReason = endReason; return; }
    }
  }

  /**
   * NFL mid-season cut (§2.2: js < 10 for 3 weeks): Contracts.applyCut (dead money), released from the roster
   * (teamId null, role NONE), headline + notes, then 0–2 vet-minimum offers as a pending FREE_AGENCY decision;
   * with no offer state.flags.cutNoOffers is set and event #24 (CUT_DAY_CALL) is forced when the catalog has it.
   * Career resumes from state.flags.midSeasonCut / the decision.
   */
  function midSeasonCut(state, rng, report) {
    var p = state.player, C = Contracts(), E = Events(), TI = TSea().timelineImpact;
    var teamId = p.teamId, team = userTeam(state);
    var info = { league: 'NFL', teamId: teamId, teamName: team ? team.name : String(teamId), week: state.week, year: state.year,
      deadMoney: 0, offers: 0, decision: null, noOffers: false };
    if (C && isFn(C.applyCut)) info.deadMoney = num(C.applyCut(state, 'CUT').deadMoney, 0);
    else p.contract = null;
    p.role = 'NONE';
    p.teamId = null;
    delete p.flags.benched; delete p.flags.benchNoted; delete p.flags.jsLowWeeks; delete p.flags.cutWarnNoted;
    closeStint(state, 'CUT');
    state.flags = state.flags || {};
    state.flags.midSeasonCut = { year: state.year, week: state.week, teamId: teamId, deadMoney: info.deadMoney };
    state.season.userGameId = null;
    message(state, 'gm_release', { team: info.teamName });
    message(state, 'agent_cut', { team: info.teamName });
    headline(state, rng, 'cut', { team: info.teamName });                                       // 1 draw
    pushTimeline(state, { year: state.year, week: state.week, kind: 'CUT', text: 'Released by ' + info.teamName, impact: TI.cut, teamId: teamId });
    if (C && isFn(C.generateOffers)) {
      var decision = C.generateOffers(state, rng, 'MIN', { exclude: [teamId] });                // 1 + 1 per offer
      info.offers = decision && decision.payload && Array.isArray(decision.payload.offers) ? decision.payload.offers.length : 0;
      if (info.offers > 0) {
        state.pending = { kind: 'DECISION', decision: decision };
        info.decision = decision.kind;
      }
    }
    if (info.offers === 0) {
      info.noOffers = true;
      state.flags.cutNoOffers = true;
      var cat = RTG.Data && RTG.Data.eventsById;
      if (E && isFn(E.force) && cat && cat.CUT_DAY_CALL && !state.pending) E.force(state, rng, 'CUT_DAY_CALL');   // 0 draws
    }
    report.cut = info;
  }

  /** College: lose the kicking job for the season (§2.2) — K2, no restore this year, portal unlocked (js/trust). */
  function loseJob(state, rng, report) {
    var p = state.player, TI = TSea().timelineImpact;
    if (p.flags.lostJob === state.year) return;
    p.role = 'K2';
    p.flags.lostJob = state.year;
    delete p.flags.benched;
    delete p.flags.jsLowWeeks;
    p.flags.benchNoted = true;                                                // the team still plays; the rival kicks
    message(state, 'coach_bench', {});
    headline(state, rng, 'bench', {});                                                          // 1 draw
    pushTimeline(state, timelineRow(state, 'LOST_JOB', 'Lost the kicking job for the season', TI.lostJob));
    report.cut = { league: 'COLLEGE', teamId: p.teamId, week: state.week, year: state.year, lostJob: true };
    report.bench = true;
  }

  /** Coach / press / family notes for the week (0 draws; hot-seat and injury headlines 1 draw each). */
  function weeklyMessages(state, rng, ref, outcome, tick, isNewInjury, report) {
    var p = state.player, I = TSea().inbox, F = Tuning.progression.form, T = Tuning.soft.trust, TI = TSea().timelineImpact;
    if (!userInLeague(state) && !isNewInjury && !tick.injuryCleared) return;
    if (userInLeague(state)) {
      if (ref && ref.played && outcome) {
        var oppName = teamName(state, ref.oppId);
        var line = report.userGame ? report.userGame.line : gameLine([]);
        var lineStr = line.fga + ' FG att, ' + line.fgm + ' made' + (line.pat ? ', ' + line.patMade + '/' + line.pat + ' PAT' : '');
        var score = (outcome.won ? 'W ' : (outcome.tied ? 'T ' : 'L ')) + outcome.us + '-' + outcome.them;
        message(state, outcome.won ? 'result_win' : 'result_loss', { opp: oppName, score: score, line: lineStr });
        message(state, outcome.won ? 'coach_win' : 'coach_loss', { opp: oppName, score: score });
      } else if (!ref) {
        message(state, 'coach_rest', {});
      }
      // form (§2.1.1 coach texts), once per crossing
      var fnote = p.form >= F.sharpAt ? 'sharp' : (p.form <= F.watchAt ? 'watch' : null);
      if (fnote && p.flags.formNote !== fnote) message(state, fnote === 'sharp' ? 'coach_form_sharp' : 'coach_form_watch', {});
      if (fnote) p.flags.formNote = fnote; else delete p.flags.formNote;
      if (p.role !== 'NONE') {
        var jnote = p.js < I.jsLowBelow ? 'low' : (p.js >= I.jsHighFrom ? 'high' : null);
        if (jnote && p.flags.jsNote !== jnote) message(state, jnote === 'low' ? 'coach_js_low' : 'coach_js_high', {});
        if (jnote) p.flags.jsNote = jnote; else delete p.flags.jsNote;
        if (p.trust < T.hotSeatBelow) {
          if (!p.flags.hotSeatNoted) {
            p.flags.hotSeatNoted = true;
            message(state, 'coach_hot_seat', {});
            headline(state, rng, 'slump', {});                                                  // 1 draw
          }
        } else delete p.flags.hotSeatNoted;
      }
      // streak notes
      if (p.makeStreak >= I.hotStreakFrom) { if (!p.flags.hotNoted) { p.flags.hotNoted = true; message(state, 'press_hot', { n: p.makeStreak }); } }
      else delete p.flags.hotNoted;
      if (p.missStreak >= I.slumpMissesFrom) { if (!p.flags.slumpNoted) { p.flags.slumpNoted = true; message(state, 'press_slump', { n: p.missStreak }); } }
      else delete p.flags.slumpNoted;
    }
    // injuries (the roll happens in Sim.finishGame; the week closes with the news)
    if (isNewInjury) {
      var inj = p.injury || { label: 'injury', weeksLeft: 0 };
      message(state, 'family_worry', { injury: inj.label || inj.type });
      headline(state, rng, 'injury', { injury: inj.label || inj.type, n: inj.weeksLeft });      // 1 draw
      pushTimeline(state, timelineRow(state, 'INJURY', 'Injured: ' + (inj.label || inj.type) + ' (' + inj.weeksLeft + ' wk)', TI.injury));
    }
    if (tick.injuryCleared) {
      delete p.flags.injuryNoted;
      pushTimeline(state, timelineRow(state, 'RETURN', 'Cleared to kick again', TI.returned));
    }
  }

  /** Goal progress refresh; a newly met goal earns a family note (0 draws). */
  function goalNotes(state) {
    var goals = state.season.goals || [];
    var before = [];
    for (var i = 0; i < goals.length; i++) before.push(!!goals[i].met);
    var after = Awards().checkGoals(state);
    for (var j = 0; j < after.length; j++) if (after[j].met && !before[j]) message(state, 'family_proud', { n: j + 1 });
  }

  // ═══════════════════════════════ week transitions ═══════════════════════════════

  /** week++ and the phase machine (REG → CCG week → POST → AWARDS). */
  function finalizeWeek(state, rng, report) {
    var season = state.season, kind = season.league, T = schedT(kind);
    if (kind === 'COLLEGE') season.rankingsPrev = clone(season.rankings);
    state.week += 1;
    resetWeekFlags(state);
    if (state.phase === 'REG') {
      if (kind === 'COLLEGE' && state.week === T.ccgWeek) scheduleCcg(state, rng);
      if (state.week > T.regWeeks) {
        Season.startPostseason(state, rng);
        report.phaseChange = state.phase;
      } else {
        setUserGame(state);
      }
    } else if (state.phase === 'POST') {
      Season.postseasonWeek(state, rng);
      if (state.phase !== 'POST') report.phaseChange = state.phase;
    }
    report.nextWeek = state.week;
    report.nextGame = Season.userGameRef(state);
  }

  /** College week 13: conference championship games from the final standings (Standings, 0 draws with tables). */
  function scheduleCcg(state, rng) {
    var season = state.season, lg = leagueObj(state, season.league), St = Standings();
    if (!St || !isFn(St.conferenceChampionshipGames)) return [];
    return pushGames(season, St.conferenceChampionshipGames(season, lg, rng));
  }

  /** Bowl descriptor kept in season.bowls (the playable Game object lives in the schedule). */
  function bowlDescriptor(g) {
    return { id: g.id, week: g.week, homeId: g.homeId, awayId: g.awayId, bowlId: g.bowlId || g.venue || null,
      bowlName: g.bowlName || g.venueName || '', venue: g.venue || null, homeRank: num(g.homeRank, 0), awayRank: num(g.awayRank, 0),
      site: g.site ? clone(g.site) : null };
  }

  /**
   * Enter the postseason (§2.6): phase 'POST', the first playoff week; college → Standings.playoffField +
   * Standings.bowls (bowl games and round-1 games into the schedule at week 14); NFL → Standings.nflPlayoffField
   * (Wild Card games at week 19). Then postseasonWeek selects the user's game / bye or fast-forwards.
   * Draws: 0 when the tables are populated (Standings recomputes only as a fallback) + fastForward sims.
   * @param {Object} state @param {RNG} rng @returns {Object|null} the postseasonWeek result
   */
  Season.startPostseason = function (state, rng) {
    var season = state.season, kind = season.league, T = schedT(kind), lg = leagueObj(state, kind), St = Standings();
    if (!St) throw new Error('Season.startPostseason: RTG.Standings is required');
    if (!season.playoffs) {
      if (state.week < T.playoffWeeks[0]) state.week = T.playoffWeeks[0];
      state.phase = 'POST';
      resetWeekFlags(state);
      if (kind === 'COLLEGE') {
        season.playoffs = St.playoffField(season, lg, rng);
        var bowls = St.bowls(season, lg, rng) || [];
        pushGames(season, bowls);
        season.bowls = bowls.map(bowlDescriptor);
      } else {
        season.playoffs = St.nflPlayoffField(season, lg, rng);
        season.bowls = null;
      }
      pushGames(season, St.roundGames(season.playoffs, 0, lg));
    }
    return Season.postseasonWeek(state, rng);
  };

  /** Apply played results to the bracket and push the next round's games (0 draws). */
  function advanceBracketState(state) {
    var season = state.season, lg = leagueObj(state, season.league), St = Standings(), b = season.playoffs;
    if (!b || b.complete) return;
    St.advanceBracket(b, season.schedule, lg);
    if (!b.complete) pushGames(season, St.roundGames(b, b.roundIdx, lg));
  }

  /**
   * Simulate the remaining postseason at once (the user is out of it): every week's games → bracket advance,
   * jumping to each round's week, until a champion exists.
   */
  function fastForward(state, rng) {
    var season = state.season, b = season.playoffs, guard = TSea().fastForwardGuard;
    while (b && !b.complete && guard-- > 0) {
      Season.simOtherGames(state, rng);
      advanceBracketState(state);
      if (!b.complete) state.week = Math.max(state.week + 1, num(b.rounds[b.roundIdx] && b.rounds[b.roundIdx].week, state.week + 1));
    }
  }

  /**
   * A postseason week (§3.5.17): advance the bracket with the results so far, build the next round, then either
   * point season.userGameId at the user's game this week, mark a bye (the user's team is still alive: seeds 1–4
   * college / seed 1 NFL in round 1), or — user eliminated / without a bowl / bracket complete — fast-forward the
   * rest of the postseason and finishSeason (phase 'AWARDS').
   * @param {Object} state @param {RNG} rng
   * @returns {{done:boolean, bye:boolean, gameId:string|null, championId:string|null}}
   */
  Season.postseasonWeek = function (state, rng) {
    var season = state.season, St = Standings();
    var out = { done: false, bye: false, gameId: null, championId: null };
    if (!season || state.phase !== 'POST' || !season.playoffs) return out;
    advanceBracketState(state);
    var b = season.playoffs;
    if (!b.complete) {
      var teamId = userInLeague(state) ? state.player.teamId : null;
      var g = teamId ? gameFor(season.schedule, teamId, state.week) : null;
      if (g) { season.userGameId = g.id; out.gameId = g.id; return out; }
      var alive = !!teamId && St.aliveTeams(b).indexOf(teamId) >= 0;
      if (alive) { season.userGameId = null; out.bye = true; return out; }
      fastForward(state, rng);
    }
    Season.finishSeason(state, rng);
    out.done = true;
    out.championId = b.championId || null;
    return out;
  };

  // ═══════════════════════════════ finishSeason ═══════════════════════════════

  function lastLine(state) {
    var lines = state.history && state.history.seasons;
    if (!Array.isArray(lines) || !lines.length) return null;
    var l = lines[lines.length - 1];
    return l.year === state.year && l.league === state.season.league ? l : null;
  }

  /** seasonsAsStarter rule: K1 at season end or gamesStarted ≥ starterShare·games. */
  function isStarterSeason(line, p) {
    var s = line.stats || {};
    if (p.role === 'K1' && num(s.games, 0) > 0) return true;
    return num(s.games, 0) > 0 && num(s.gamesStarted, 0) >= TSea().starterShare * num(s.games, 0);
  }

  /** Copy season.kickerStats into each AI kicker's seasonStats (§2.5.1 AIKicker.seasonStats). */
  function aiSeasonTick(state, lg) {
    var ks = state.season.kickerStats || {};
    for (var i = 0; i < lg.teams.length; i++) {
      var team = lg.teams[i], s = ks[team.id];
      if (!s) continue;
      var k = aiKickerOf(state, team);
      if (k) k.seasonStats = clone(s);
    }
  }

  /** Traits earned at season end (§2.1.1): ICE_VEINS (3 GW), COLD_WEATHER / DOME_BABY (3 seasons). */
  function traitsEarned(state, line) {
    var p = state.player, TR = Tuning.progression.traits, team = userTeam(state), added = [];
    p.traits = p.traits || [];
    function add(t) { if (!has(p.traits, t) && p.traits.length < TR.max) { p.traits.push(t); added.push(t); } }
    if (num(line.stats && line.stats.gameWinners, 0) >= TR.iceVeinsGwPerSeason) add('ICE_VEINS');
    if (team) {
      if (team.climate === 'cold') { p.flags.coldSeasons = num(p.flags.coldSeasons, 0) + 1; if (p.flags.coldSeasons >= TR.coldWeatherSeasons) add('COLD_WEATHER'); }
      if (team.dome) { p.flags.domeSeasons = num(p.flags.domeSeasons, 0) + 1; if (p.flags.domeSeasons >= TR.domeBabySeasons) add('DOME_BABY'); }
    }
    return added;
  }

  /** Minimal SeasonLine when RTG.Stats is absent (isolated tests). */
  function minimalLine(state) {
    var p = state.player, s = state.stats && state.stats.season ? clone(state.stats.season) : emptyKickerStats();
    var r = state.season.results && p.teamId ? state.season.results[p.teamId] : null;
    var line = { year: state.year, league: state.season.league, teamId: p.teamId || null, teamName: p.teamId ? teamName(state, p.teamId) : '',
      age: p.age, ovr: ovrOf(p.attrs), role: p.role, stats: s, awards: [], teamRecord: recordText(r), champion: false,
      playoffResult: '', grade: 'C', salary: p.contract ? num(p.contract.aav, 0) : 0, milestones: [] };
    if (state.history && Array.isArray(state.history.seasons)) state.history.seasons.push(line);
    if (state.stats) state.stats.season = emptyKickerStats();
    return line;
  }

  /**
   * Close the season (§3.5.17): completes the bracket if games remain (fastForward), phase 'AWARDS',
   * Awards.compute (→ season.awardsList, XP / fame / history.awards for the user), Stats.finishSeason (SeasonLine
   * into history.seasons, stats.season reset), league.seasonHistory, AI kicker season tick (kickerStats →
   * kicker.seasonStats), player season counters (collegeSeasons / nflSeasons / seasonsAsStarter), earned traits,
   * state.flags.wonTitle, season-scoped modifier expiry, timeline. Idempotent (season.finished).
   * Draws: fastForward sims → Awards.compute 0–1 → user award headline 1 → 1 headline per record milestone.
   * @param {Object} state @param {RNG} rng @returns {Object} SeasonLine
   */
  Season.finishSeason = function (state, rng) {
    var season = state.season, p = state.player;
    if (!season) throw new Error('Season.finishSeason: no season');
    if (season.finished) return lastLine(state);
    var kind = season.league, lg = leagueObj(state, kind);
    var A = Awards(), St = Stats(), P = Player(), TI = TSea().timelineImpact;
    if (season.playoffs && !season.playoffs.complete) fastForward(state, rng);

    state.phase = 'AWARDS';
    state.game = null;
    season.userGameId = null;
    season.weekGameDone = true;
    if (state.week > schedT(kind).totalWeeks) state.week = schedT(kind).totalWeeks;     // POST numbering ends at the final week

    var awards = A && isFn(A.compute) ? A.compute(state, rng) || [] : [];                    // 0–1 draw
    season.awardsList = awards;
    var userAward = null;
    for (var a = 0; a < awards.length; a++) if (awards[a].isUser && !awards[a].goal && !awards[a].note) { userAward = awards[a]; break; }
    if (userAward) headline(state, rng, 'award', { award: userAward.name });                   // 1 draw

    var line = St && isFn(St.finishSeason) ? St.finishSeason(state) : minimalLine(state);
    var ms = line.milestones || [];
    for (var m = 0; m < ms.length; m++) headline(state, rng, ms[m].tag || 'milestone', ms[m].vars);   // 1 each

    var champId = season.playoffs ? season.playoffs.championId || null : null;
    var inLeague = userInLeague(state);
    if (lg && Array.isArray(lg.seasonHistory)) {
      lg.seasonHistory.push({ year: season.year, championId: champId, userTeamId: inLeague ? p.teamId : null, userLine: lineText(line.stats) });
    }
    if (lg) aiSeasonTick(state, lg);

    if (kind === 'COLLEGE') p.collegeSeasons = num(p.collegeSeasons, 0) + 1; else p.nflSeasons = num(p.nflSeasons, 0) + 1;
    if (inLeague && isStarterSeason(line, p)) p.seasonsAsStarter = num(p.seasonsAsStarter, 0) + 1;
    p.flags = p.flags || {};
    var traits = inLeague ? traitsEarned(state, line) : [];
    var champion = !!(champId && inLeague && champId === p.teamId);
    state.flags = state.flags || {};
    if (champion) state.flags.wonTitle = state.year; else delete state.flags.wonTitle;
    if (P && isFn(P.expireMods)) P.expireMods(p, { type: 'season', at: state.year });

    var team = userTeam(state);
    var text = (team ? team.name + ' ' : '') + line.teamRecord + ' · ' + lineText(line.stats) +
      (line.awards && line.awards.length ? ' · ' + line.awards.join(', ') : '') + (champion ? ' · CHAMPIONS' : '');
    pushTimeline(state, { year: state.year, week: state.week, kind: 'SEASON', text: text, impact: champion ? TI.champion : TI.season, teamId: p.teamId || null });
    line.traitsEarned = traits;
    season.finished = true;
    return line;
  };

  // ═══════════════════════════════ offseason / advanceYear ═══════════════════════════════

  /**
   * Enter the offseason (§3.5.17): phase 'OFF' (finishing the season first when needed), then the wizard
   * decision chain via Career.offseasonChain when RTG.Career is present (its return value is passed through).
   * @param {Object} state @param {RNG} rng @returns {*} the Career chain (or null without Career)
   */
  Season.offseason = function (state, rng) {
    var season = state.season;
    if (season && !season.finished && IN_SEASON[state.phase]) Season.finishSeason(state, rng);
    state.phase = 'OFF';
    state.game = null;
    if (season) { season.userGameId = null; season.weekGameDone = true; }
    var C = Career();
    return C && isFn(C.offseasonChain) ? C.offseasonChain(state, rng) : null;
  };

  /**
   * Age the player one year and apply §2.1.3 growth / decline (Player.ageTick). Idempotent per career year
   * (player.flags.agedYear), so Career may call it early for the Body Check card and advanceYear will not age
   * twice. Stores the change log in state.flags.bodyCheck. Draws: 2 (growth picks) only in the growth window.
   * @param {Object} state @param {RNG} rng @returns {{year:number, age:number, changes:Object[]}}
   */
  Season.ageTick = function (state, rng) {
    var p = state.player, P = Player();
    p.flags = p.flags || {};
    state.flags = state.flags || {};
    if (p.flags.agedYear === state.year && state.flags.bodyCheck) return state.flags.bodyCheck;
    p.age += 1;
    var changes = P && isFn(P.ageTick) ? P.ageTick(state, rng) : [];
    p.flags.agedYear = state.year;
    state.flags.bodyCheck = { year: state.year, age: p.age, changes: changes };
    return state.flags.bodyCheck;
  };

  /** §2.5.1 coaches: fired with p 0.30 after a ≤ 35 % season (names only; the user's coach → trust reset + headline). */
  function coachChurn(state, rng, report) {
    var season = state.season, p = state.player, C = Tuning.sim.coach, N = Names(), TI = TSea().timelineImpact;
    if (!season || !season.results || !N || !isFn(N.coach)) return;
    var lg = leagueObj(state, season.league);
    for (var i = 0; i < lg.teams.length; i++) {
      var team = lg.teams[i], r = season.results[team.id];
      if (!r) continue;
      var g = num(r.w, 0) + num(r.l, 0) + num(r.t, 0);
      if (!g) continue;
      var pct = (num(r.w, 0) + 0.5 * num(r.t, 0)) / g;
      if (pct > C.firedAfterWinPct) continue;
      if (!rng.chance(C.firedProb)) continue;                                                 // 1 draw per bad team
      var old = team.coach;
      team.coach = N.coach(rng);                                                              // 1 draw
      report.coachChanges.push({ teamId: team.id, from: old, to: team.coach });
      if (userInLeague(state) && p.teamId === team.id) {
        p.trust = clamp(C.firedTrustReset, Tuning.soft.min, Tuning.soft.max);
        headline(state, rng, 'coach_fired', { text: '{team} fire ' + old + ' after a ' + recordText(r) + ' season; ' + team.coach + ' takes over, wants "a leg he can trust"' });   // 1 draw
        pushTimeline(state, timelineRow(state, 'COACH', old + ' fired; ' + team.coach + ' hired', TI.coach));
        message(state, 'gm_welcome', {});
      }
    }
  }

  /** §2.5.1 yearly rating drift for one team: r' = clamp(round(0.6·r + 0.4·(anchor + N(0, 6))), 50, 92). 4 draws. */
  function driftTeam(team, kind, rng) {
    var L = Tuning.league, D = L.drift;
    var anchor = kind === 'COLLEGE' ? D.collegeAnchorBase + D.collegeAnchorPerPrestige * num(team.prestige, 3) : D.nflAnchor;
    team.OFF = clamp(Math.round(D.keep * num(team.OFF, anchor) + D.anchorW * (anchor + rng.gauss(0, D.sd))), L.ratingMin, L.ratingMax);   // 2
    team.DEF = clamp(Math.round(D.keep * num(team.DEF, anchor) + D.anchorW * (anchor + rng.gauss(0, D.sd))), L.ratingMin, L.ratingMax);   // 2
  }

  /** A §2.5.1 replacement rookie: ovr N(60, 5), age 22, attrs = ovr + N(0, 4). Draws: name 3–4 · ovr 2 · attrs 10. */
  function makeRookie(rng) {
    var K = Tuning.league.aiKicker, N = Names();
    var name = N && isFn(N.player) ? N.player(rng).full : 'Rookie Kicker';
    var ovr = clamp(Math.round(rng.gauss(K.rookie.mean, K.rookie.sd)), K.attrMin, K.attrMax);
    var attrs = {};
    for (var i = 0; i < ATTRS.length; i++) attrs[ATTRS[i]] = clamp(Math.round(ovr + rng.gauss(0, K.attrSd)), K.attrMin, K.attrMax);
    return { name: name, age: K.rookie.age, ovr: ovr, attrs: attrs, contractYears: TSea().aiRookieContractYears, seasonStats: emptyKickerStats() };
  }

  /**
   * §2.5.1 AI kicker year: age +1, contract −1 (expired → re-sign int(1, 3), 1 draw), −1 POW/yr from 34 (ovr
   * recomputed), retire at 38+ (p 0.5, 1 draw) / ovr < 55 / age ≥ 45 → replaced by a rookie (Schema.setKicker
   * re-blends ST). Every team keeps at least one AI kicker.
   */
  function aiKickerYear(state, lg, rng, report) {
    var K = Tuning.league.aiKicker, R = TSea().aiResignYears, S = Schema();
    var slots = ['kicker', 'kicker2'];
    for (var i = 0; i < lg.teams.length; i++) {
      var team = lg.teams[i];
      for (var s = 0; s < slots.length; s++) {
        var k = team[slots[s]];
        if (!k) continue;
        k.age = num(k.age, K.rookie.age) + 1;
        k.contractYears = Math.max(0, num(k.contractYears, 1) - 1);
        if (k.contractYears === 0) k.contractYears = rng.int(R[0], R[1]);                     // 1 draw
        if (k.age >= K.declineFrom && k.attrs) k.attrs.POW = clamp(num(k.attrs.POW, 50) - 1, K.attrMin, K.attrMax);
        if (k.attrs) k.ovr = clamp(ovrOf(k.attrs), K.attrMin, K.attrMax);
        var retire = k.age >= TSea().aiForceRetireAge || k.ovr < K.retireOvrBelow;
        if (!retire && k.age >= K.retireAge) retire = rng.chance(K.retireProb);               // 1 draw
        if (!retire) continue;
        var rookie = makeRookie(rng);                                                         // 15–16 draws
        report.retirements.push({ teamId: team.id, name: k.name, age: k.age, ovr: k.ovr, slot: slots[s] });
        report.rookies.push({ teamId: team.id, name: rookie.name, ovr: rookie.ovr, slot: slots[s] });
        if (S && isFn(S.setKicker)) S.setKicker(lg, team.id, rookie, slots[s]); else team[slots[s]] = rookie;
      }
      if (!team.kicker && !team.kicker2) {
        var extra = makeRookie(rng);
        var slot = userInLeague(state) && state.player.teamId === team.id ? 'kicker2' : 'kicker';
        if (S && isFn(S.setKicker)) S.setKicker(lg, team.id, extra, slot); else team[slot] = extra;
        report.rookies.push({ teamId: team.id, name: extra.name, ovr: extra.ovr, slot: slot });
      }
    }
    if (S && isFn(S.reindexLeague)) S.reindexLeague(lg);
  }

  /**
   * Contract year tick: only the contract that covered the season (season.contractAtStart) advances, so a deal
   * signed during the offseason starts at yearIdx 0 next season. yearIdx stops at `years` (= expired; Career
   * resolves extension / free agency before the roll-over).
   */
  function tickContract(state, report) {
    var p = state.player, c = p.contract, a = state.season && state.season.contractAtStart;
    if (!c || !a) return;
    if (a.type === c.type && a.startYear === num(c.startYear, state.year) && a.yearIdx === num(c.yearIdx, 0)) {
      c.yearIdx = Math.min(num(c.yearIdx, 0) + 1, Math.max(1, num(c.years, 1)));
      report.contract = { type: c.type, yearIdx: c.yearIdx, years: c.years, expired: c.yearIdx >= c.years };
    }
  }

  /** NFL money growth (§2.7.7): cap +5 %/yr, vetMin +4 %/yr, tag value for the new year. */
  function growMoney(state, report) {
    var nfl = state.leagues && state.leagues.nfl, C = Tuning.contracts, Ct = Contracts();
    if (!nfl) return;
    nfl.cap = Util.round1(num(nfl.cap, C.capStart) * (1 + C.capGrowth));
    nfl.vetMin = Util.roundN(num(nfl.vetMin, C.vetMinStart) * (1 + C.vetMinGrowth), 2);
    nfl.tagValue = Ct && isFn(Ct.tagValue) ? Ct.tagValue(nfl) : Util.round1(num(nfl.tagValue, C.tag.base) * C.tag.growth);
    report.money = { cap: nfl.cap, vetMin: nfl.vetMin, tagValue: nfl.tagValue };
  }

  /**
   * Roll the career over one year (§3.5.17): age +1 and Player.ageTick (Season.ageTick, idempotent), coach churn
   * (§2.5.1), team rating drift for BOTH leagues, AI kicker aging / retirements / rookies, the user's contract
   * year tick, cap +5 % / vetMin +4 %, year++ (both leagues), then Season.start. Finishes the season first if
   * it is still running. Draw order in the file header.
   * @param {Object} state @param {RNG} rng
   * @returns {{year:number, bodyCheck:Object, coachChanges:Object[], retirements:Object[], rookies:Object[], contract:Object|null, money:Object|null}}
   */
  Season.advanceYear = function (state, rng) {
    var season = state.season;
    if (season && !season.finished && IN_SEASON[state.phase]) Season.finishSeason(state, rng);
    var report = { year: state.year + 1, bodyCheck: null, coachChanges: [], retirements: [], rookies: [], contract: null, money: null };

    report.bodyCheck = Season.ageTick(state, rng);                                             // 2 draws (growth window)
    coachChurn(state, rng, report);
    var kinds = ['COLLEGE', 'NFL'];
    for (var d = 0; d < kinds.length; d++) {
      var lgd = leagueObj(state, kinds[d]);
      if (lgd) for (var t = 0; t < lgd.teams.length; t++) driftTeam(lgd.teams[t], kinds[d], rng);
    }
    for (var k = 0; k < kinds.length; k++) {
      var lgk = leagueObj(state, kinds[k]);
      if (lgk) aiKickerYear(state, lgk, rng, report);
    }
    tickContract(state, report);

    state.year += 1;
    if (state.leagues) {
      if (state.leagues.college) state.leagues.college.year = state.year;
      if (state.leagues.nfl) state.leagues.nfl.year = state.year;
    }
    growMoney(state, report);                                                                 // tag value uses the new year
    state.flags = state.flags || {};
    delete state.flags.wonTitle;
    delete state.flags.rivalCold;
    delete state.flags.midSeasonCut;
    Season.start(state, rng);
    return report;
  };

  RTG.Season = Season;
})(typeof window !== 'undefined' ? window : globalThis);
