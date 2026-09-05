/**
 * Schema fixtures (E1). Plain factories that take RTG (from test/load.js) and
 * return VALID CareerStates at each stage/phase, so other engineers' tests and
 * UI screens can run before the whole career flow exists.
 *
 *   const fx = require('./fixtures/schema');
 *   const state = fx.collegeRegWeek5(RTG);        // deterministic (seed 7)
 *   const all   = fx.all(RTG);                     // {hsShowcase, collegeRegWeek5, nflRegWeek9InGame, nflOff, retiredLegacy}
 *
 * Every builder returns a fresh object; `Schema.validate` passes on each.
 * When RTG.Schedule exists it is used for schedules; otherwise a circle-method
 * stand-in produces a structurally valid one.
 */
'use strict';

var DEFAULT_SEED = 7;

/** A seeded RNG. */
function rngFor(RTG, seed) {
  return RTG.RNG.create((seed === undefined ? DEFAULT_SEED : seed) >>> 0);
}

/**
 * A complete KickContext (§3.4) with overrides. Calm, middle hash, clear, 40 yd by default.
 * @param {object} RTG @param {object} [o] overrides @returns {object}
 */
function kickContext(RTG, o) {
  o = o || {};
  var T = RTG.Tuning;
  var league = o.league || 'COLLEGE';
  var type = o.type || 'FG';
  var distance = o.distance !== undefined ? o.distance : (type === 'PAT' ? (league === 'NFL' ? T.kick.distance.patNfl : T.kick.distance.patCollege) : 40);
  var hash = o.hash !== undefined ? o.hash : 0;
  var ballX = hash === 0 ? 0 : hash * (league === 'NFL' ? T.kick.hash.ballXNfl : T.kick.hash.ballXCollege);
  var attrs = o.attrs || { POW: 62, ACC: 60, CON: 55, CLU: 55, KO: 55 };
  var ctx = {
    type: type, league: league, distance: distance, hash: hash, ballX: ballX,
    wind: o.wind || { speed: 0, dir: 0 }, weather: o.weather || 'clear', tempF: o.tempF !== undefined ? o.tempF : 70,
    surface: o.surface || 'grass', altitude: !!o.altitude, dome: !!o.dome,
    pressure: o.pressure !== undefined ? o.pressure : 0.15, clutch: !!o.clutch, decisive: !!o.decisive, iced: !!o.iced,
    playoff: !!o.playoff, rivalry: !!o.rivalry, away: !!o.away, asTimeExpires: !!o.asTimeExpires, ot: !!o.ot,
    oppST: o.oppST !== undefined ? o.oppST : 70, isUser: o.isUser !== undefined ? o.isUser : true,
    difficulty: o.difficulty || 'pro',
    game: o.game || { q: 1, clock: 900, scoreFor: 0, scoreAgainst: 0, week: o.week || 1, oppId: o.oppId || null, teamId: o.teamId || null },
    kicker: o.kicker || { attrs: attrs, form: 0, mods: [], traits: [], foot: 'R', flags: {} }
  };
  if (o.marketMult !== undefined) ctx.marketMult = o.marketMult;
  return ctx;
}

/**
 * A complete KickResult (§3.4) with overrides (GOOD by default).
 * @param {object} [o] @returns {object}
 */
function kickResult(o) {
  o = o || {};
  var outcome = o.outcome || 'GOOD';
  var made = o.made !== undefined ? o.made : (outcome === 'GOOD' || outcome === 'DOINK_IN' || outcome === 'XBAR_IN');
  var type = o.type || 'FG';
  return {
    outcome: outcome, made: made, points: made ? (type === 'PAT' ? 1 : 3) : 0, distance: o.distance !== undefined ? o.distance : 40,
    xYd: o.xYd !== undefined ? o.xYd : 0.4, hYd: o.hYd !== undefined ? o.hYd : 8.1, launchDeg: 0.3, errDeg: 0.3, shank: false,
    contactDeg: 0.1, windDriftYd: 0, power: o.power !== undefined ? o.power : 0.95, quality: o.quality !== undefined ? o.quality : 0.85,
    flightTime: 2.04, sub: o.sub || '', blockReturnTd: false,
    tags: o.tags ? o.tags.slice() : [],
    feedback: { timing: 'GOOD', power: 'SMOOTH', missBy: { yd: 0, side: null }, coachSaw: 'Clean strike.' }
  };
}

/** Circle-method schedule stand-in: every team plays once per week for `weeks` weeks. */
function syntheticSchedule(RTG, league, weeks, prefix) {
  var ids = league.teams.map(function (t) { return t.id; });
  var n = ids.length, games = [];
  var arr = ids.slice();
  for (var w = 1; w <= weeks; w++) {
    for (var i = 0; i < n / 2; i++) {
      var a = arr[i], b = arr[n - 1 - i];
      var home = (w + i) % 2 === 0 ? a : b, away = home === a ? b : a;
      games.push({ id: prefix + w + '-' + home + '-' + away, week: w, homeId: home, awayId: away, kind: 'REG', played: false });
    }
    arr = [arr[0]].concat([arr[n - 1]], arr.slice(1, n - 1));
  }
  return games;
}

/** Schedule via RTG.Schedule when available, else synthetic. */
function scheduleFor(RTG, state, league, rng) {
  var S = RTG.Schedule;
  try {
    if (S && league.kind === 'COLLEGE' && typeof S.college === 'function') {
      var g = S.college(league, state.year, rng);
      if (Array.isArray(g) && g.length) return g;
    }
    if (S && league.kind === 'NFL' && typeof S.nfl === 'function') {
      var g2 = S.nfl(league, state.year, null, rng);
      if (Array.isArray(g2) && g2.length) return g2;
    }
  } catch (e) { /* fall through to the stand-in */ }
  return syntheticSchedule(RTG, league, league.kind === 'NFL' ? RTG.Tuning.schedule.nfl.regWeeks : RTG.Tuning.schedule.college.regWeeks - 1, league.kind === 'NFL' ? 'n' : 'c');
}

/** Play every scheduled game before `week` with deterministic scores; fills season.results. */
function playWeeksBefore(RTG, state, week, rng) {
  var season = state.season;
  var Schema = RTG.Schema;
  season.schedule.forEach(function (g) {
    if (g.week >= week) return;
    var hs = 10 + rng.int(0, 27), as = 7 + rng.int(0, 27);
    if (hs === as) hs += 3;
    g.played = true; g.score = { home: hs, away: as }; g.ot = false;
    [g.homeId, g.awayId].forEach(function (id) { if (!season.results[id]) season.results[id] = Schema.emptyTeamResult(); });
    var h = season.results[g.homeId], a = season.results[g.awayId];
    h.pf += hs; h.pa += as; a.pf += as; a.pa += hs;
    if (hs > as) { h.w++; a.l++; h.streak = h.streak > 0 ? h.streak + 1 : 1; a.streak = a.streak < 0 ? a.streak - 1 : -1; }
    else { a.w++; h.l++; a.streak = a.streak > 0 ? a.streak + 1 : 1; h.streak = h.streak < 0 ? h.streak - 1 : -1; }
    h.h2h[g.awayId] = h.h2h[g.awayId] || [0, 0, 0]; a.h2h[g.homeId] = a.h2h[g.homeId] || [0, 0, 0];
    if (hs > as) { h.h2h[g.awayId][0]++; a.h2h[g.homeId][1]++; } else { a.h2h[g.homeId][0]++; h.h2h[g.awayId][1]++; }
  });
  season.schedule.forEach(function (g) {
    [g.homeId, g.awayId].forEach(function (id) { if (!season.results[id]) season.results[id] = Schema.emptyTeamResult(); });
  });
}

/** Append n user kick rows (alternating makes) to stats.kicks and bump season/career totals. */
function addKicks(RTG, state, n, league, teamId, oppId, week) {
  var Schema = RTG.Schema;
  var rows = [];
  for (var i = 0; i < n; i++) {
    var dist = 28 + (i * 7) % 30;
    var made = i % 4 !== 3;
    var ctx = kickContext(RTG, { league: league, distance: dist, teamId: teamId, oppId: oppId, week: week, game: { q: 1 + (i % 4), clock: 600 - i * 30, scoreFor: 3 * i, scoreAgainst: 7, week: week, oppId: oppId, teamId: teamId } });
    var res = kickResult({ outcome: made ? 'GOOD' : 'WIDE_R', distance: dist, tags: dist >= 50 ? ['fiftyPlus'] : [] });
    var row = Schema.createKickLogRow(ctx, res, { id: 'fx' + league + '-' + week + '-' + i, year: state.year, week: week, gameId: 'fxg' + week, teamId: teamId, oppId: oppId, auto: false, rngState: 1000 + i });
    rows.push(row);
    var bucket = dist < 30 ? '0-29' : dist < 40 ? '30-39' : dist < 50 ? '40-49' : dist < 60 ? '50-59' : '60+';
    [state.stats.season, state.stats.career, league === 'NFL' ? state.stats.nfl : state.stats.college].forEach(function (s) {
      s.fga++; s.buckets[bucket].a++;
      if (made) { s.fgm++; s.pts += 3; s.buckets[bucket].m++; if (dist > s.long) s.long = dist; if (dist >= 50) s.made50plus++; s.consecutive++; if (s.consecutive > s.bestConsecutive) s.bestConsecutive = s.consecutive; }
      else { s.wideR++; s.consecutive = 0; }
    });
  }
  state.stats.kicks = state.stats.kicks.concat(rows);
  return rows;
}

/**
 * HS.SHOWCASE — a freshly created career (pending KICKS showcase session).
 * @param {object} RTG @param {{seed?:number, archetype?:string, difficulty?:string, name?:string}} [opts]
 * @returns {object} CareerState
 */
function hsShowcase(RTG, opts) {
  opts = opts || {};
  var rng = rngFor(RTG, opts.seed);
  var state = RTG.Schema.createCareer({
    name: opts.name || 'Sam Booter', archetype: opts.archetype || 'SURGEON', difficulty: opts.difficulty || 'pro',
    seed: opts.seed === undefined ? DEFAULT_SEED : opts.seed, createdAt: 1757000000000,
    hometown: { city: 'Springfield', state: 'IL', region: 'MW' }, look: { skin: 1, hair: 2, boot: 0 }, foot: 'R'
  }, rng);
  if (!state.pending) {
    var S = RTG.Tuning.draft.showcase;
    state.pending = {
      kind: 'KICKS',
      session: {
        kind: 'SHOWCASE',
        contexts: S.distances.map(function (d, i) {
          return kickContext(RTG, { league: 'COLLEGE', distance: d, pressure: i === S.distances.length - 1 ? S.pressureLast : 0.05, attrs: state.player.attrs, week: 0 });
        }),
        results: [], idx: 0
      }
    };
  }
  state.rngState = rng.state();
  return state;
}

/**
 * COLLEGE.REG week 5, year 1 — enrolled at a prestige-3 school, K1, 4 games played.
 * @param {object} RTG @param {{seed?:number}} [opts] @returns {object} CareerState
 */
function collegeRegWeek5(RTG, opts) {
  opts = opts || {};
  var state = hsShowcase(RTG, opts);
  var rng = rngFor(RTG, (opts.seed === undefined ? DEFAULT_SEED : opts.seed) + 101);
  var Schema = RTG.Schema, T = RTG.Tuning;
  var league = state.leagues.college;
  var team = league.teams[2];                       // COA2 (prestige 3)
  var p = state.player;
  Schema.reindex(state);
  state.stage = 'COLLEGE'; state.phase = 'REG'; state.year = 1; state.week = 5;
  state.pending = null;
  p.stars = 3; p.teamId = team.id; p.league = 'COLLEGE'; p.role = 'K1';
  p.trust = T.soft.start.trustByCoach.TRUSTING; p.js = T.soft.start.jsOpen; p.fame = T.soft.start.fameByStars[3];
  p.flags.coachStyle = 'TRUSTING';
  p.contract = { type: 'SCHOLARSHIP', years: 4, yearIdx: 0, aav: 0, gtdPct: 0, signingBonus: 0, startYear: 1 };
  p.nil = 12; p.xp = 120;
  team.kicker2 = team.kicker; team.kicker = null;    // the incumbent becomes the backup
  Schema.reindexLeague(league);
  state.history.teams.push({ teamId: team.id, league: 'COLLEGE', fromYear: 1, toYear: null, reason: 'SIGNED' });
  state.history.timeline.push({ year: 1, week: 0, kind: 'SIGNED', text: 'Committed to ' + team.name, impact: 2, teamId: team.id });
  state.season = Schema.emptySeason('COLLEGE', 1);
  state.season.schedule = scheduleFor(RTG, state, league, rng);
  playWeeksBefore(RTG, state, 5, rng);
  var userGame = null;
  for (var i = 0; i < state.season.schedule.length; i++) {
    var g = state.season.schedule[i];
    if (g.week === 5 && (g.homeId === team.id || g.awayId === team.id)) { userGame = g; break; }
  }
  state.season.userGameId = userGame ? userGame.id : null;
  state.season.goals = [
    { id: 'TEAM_WINS', text: 'Win 7 games', target: 7, progress: 3, met: false, xp: T.awards.goalXp[0] },
    { id: 'FG_PCT', text: 'Kick 80 %', target: 0.8, progress: 0.75, met: false, xp: T.awards.goalXp[1] },
    { id: 'FANS', text: 'Reach 65 Fan Approval', target: 65, progress: 52, met: false, xp: T.awards.goalXp[2] }
  ];
  var opp = league.teams[9].id;
  addKicks(RTG, state, 8, 'COLLEGE', team.id, opp, 4);
  state.stats.season.games = 4; state.stats.season.gamesStarted = 4; state.stats.career.games = 4; state.stats.career.gamesStarted = 4;
  state.stats.college.games = 4; state.stats.college.gamesStarted = 4;
  state.headlines.push({ id: 'h1', year: 1, week: 4, text: 'Freshman leg goes 2-for-2 in the rain', tag: 'postgame_win' });
  state.recentHeadlineIds.push('h1');
  state.inbox.push({ id: 'm1', week: 4, year: 1, from: 'coach', avatar: 'coach', text: "You've looked sharp in practice.", kind: 'note', read: false });
  state.rngState = rng.state();
  return state;
}

/**
 * NFL.REG week 9, year 5 (age 22, rookie deal, BOS) with a game in progress and a
 * pending USER_KICK (44-yd FG, Q2).
 * @param {object} RTG @param {{seed?:number}} [opts] @returns {object} CareerState
 */
function nflRegWeek9InGame(RTG, opts) {
  opts = opts || {};
  var state = hsShowcase(RTG, opts);
  var rng = rngFor(RTG, (opts.seed === undefined ? DEFAULT_SEED : opts.seed) + 202);
  var Schema = RTG.Schema, T = RTG.Tuning;
  var league = state.leagues.nfl;
  var team = league.teams[0];                       // BOS
  var oppTeam = league.teams[1];                    // PIT
  var p = state.player;
  Schema.reindex(state);
  state.stage = 'NFL'; state.phase = 'REG'; state.year = 5; state.week = 9;
  state.pending = null;
  p.age = 22; p.stars = 4; p.teamId = team.id; p.league = 'NFL'; p.role = 'K1';
  p.attrs = { POW: 66, ACC: 68, CON: 62, CLU: 60, KO: 64 };
  p.trust = 55; p.js = 62; p.fans = 58; p.morale = 64; p.fame = 140; p.xp = 210; p.xpSpent = 900;
  p.collegeSeasons = 4; p.nflSeasons = 0; p.seasonsAsStarter = 3;
  p.contract = { type: 'ROOKIE', years: 4, yearIdx: 0, aav: T.contracts.rookie.byRound[5].aav, gtdPct: T.contracts.rookie.byRound[5].gtd, signingBonus: 0.98, startYear: 5, round: 5 };
  p.mods.push({ id: 'sigma:dinner', key: 'sigma', op: 'mul', value: 0.98, expires: { type: 'week', at: 12 }, label: 'Holder dinner', source: 'HOLDER_BEEF' });
  team.kicker2 = team.kicker; team.kicker = null;
  Schema.reindexLeague(league);
  league.year = 5; state.leagues.college.year = 5;
  state.history.teams.push({ teamId: 'COA2', league: 'COLLEGE', fromYear: 1, toYear: 4, reason: 'SIGNED' });
  state.history.teams.push({ teamId: team.id, league: 'NFL', fromYear: 5, toYear: null, reason: 'DRAFTED' });
  for (var y = 1; y <= 4; y++) {
    var st = Schema.emptyKickerStats();
    st.fga = 20 + y; st.fgm = 15 + y; st.pat = 30; st.patMade = 29; st.pts = st.fgm * 3 + 29; st.long = 48 + y; st.games = 12; st.gamesStarted = 12;
    state.history.seasons.push({ year: y, league: 'COLLEGE', teamId: 'COA2', teamName: 'Carolina Pines Foxhounds', age: 17 + y, ovr: 52 + 4 * y, role: 'K1', stats: st, awards: [], teamRecord: '8-4', champion: false, playoffResult: '', grade: 'B', salary: 0 });
  }
  state.history.awards.push({ year: 4, league: 'COLLEGE', id: 'ALL_CONF_1', name: 'All-Conference First Team K', teamId: 'COA2' });
  state.history.contracts.push({ year: 5, league: 'NFL', teamId: team.id, type: 'ROOKIE', years: 4, aav: 0.98 });
  state.history.earnings = 0.98;
  state.season = Schema.emptySeason('NFL', 5);
  state.season.schedule = scheduleFor(RTG, state, league, rng);
  playWeeksBefore(RTG, state, 9, rng);
  var userGame = null;
  for (var i = 0; i < state.season.schedule.length; i++) {
    var g = state.season.schedule[i];
    if (g.week === 9 && (g.homeId === team.id || g.awayId === team.id)) { userGame = g; break; }
  }
  if (!userGame) {
    userGame = { id: 'n9-' + team.id + '-' + oppTeam.id, week: 9, homeId: team.id, awayId: oppTeam.id, kind: 'REG', played: false };
    state.season.schedule.push(userGame);
  }
  state.season.userGameId = userGame.id;
  state.season.trainingDone = true; state.season.focus = 'ACC';
  var userSide = userGame.homeId === team.id ? 'home' : 'away';
  var oppId = userSide === 'home' ? userGame.awayId : userGame.homeId;
  var gs = Schema.createGameState({
    id: userGame.id, league: 'NFL', week: 9, kind: 'REG', homeId: userGame.homeId, awayId: userGame.awayId, userSide: userSide,
    weather: { weather: 'rain', tempF: 48, wind: { speed: 9, dir: 120 }, surface: 'grass', altitude: false, dome: false },
    offRating: { home: 74, away: 70 }, defRating: { home: 71, away: 73 }
  });
  gs.q = 2; gs.clock = 214; gs.score = { home: 10, away: 7 }; gs.possession = userSide; gs.timeouts = { home: 2, away: 3 };
  gs.drive = { n: 7, startYtg: 62, plays: 8, side: userSide };
  gs.pendingKickoff = null;
  gs.ball = { ytg: 27, down: 4, toGo: 6 };
  gs.driveLog = [
    { q: 1, clock: 900, side: 'away', text: 'Kickoff: touchback', ytg: 70, result: 'KO' },
    { q: 1, clock: 712, side: 'away', text: 'Drive stalls at the 31', ytg: 31, result: 'STALL' },
    { q: 1, clock: 690, side: 'home', text: 'Touchdown drive, 8 plays', ytg: 0, result: 'TD' },
    { q: 2, clock: 420, side: 'away', text: 'Touchdown, 65 yards', ytg: 0, result: 'TD' }
  ];
  gs.stats.home.drives = 4; gs.stats.away.drives = 3; gs.stats[userSide].fga = 1; gs.stats[userSide].fgm = 1;
  gs.stats[userSide].pat = 1; gs.stats[userSide].patMade = 1;
  var scoreFor = userSide === 'home' ? gs.score.home : gs.score.away;
  var scoreAgainst = userSide === 'home' ? gs.score.away : gs.score.home;
  var ctx = kickContext(RTG, {
    type: 'FG', league: 'NFL', distance: 44, hash: 1, wind: { speed: 9, dir: 120 }, weather: 'rain', tempF: 48,
    pressure: 0.13, away: userSide === 'away', oppST: 72, isUser: true, difficulty: state.difficulty,
    game: { q: 2, clock: 214, scoreFor: scoreFor, scoreAgainst: scoreAgainst, week: 9, oppId: oppId, teamId: team.id },
    kicker: { attrs: p.attrs, form: 0.8, mods: p.mods.slice(), traits: p.traits.slice(), foot: p.foot, flags: {} }
  });
  gs.pending = { type: 'USER_KICK', ctx: ctx };
  var earlyCtx = kickContext(RTG, { type: 'PAT', league: 'NFL', teamId: team.id, oppId: oppId, week: 9, game: { q: 1, clock: 690, scoreFor: 6, scoreAgainst: 0, week: 9, oppId: oppId, teamId: team.id } });
  gs.kicks.push(Schema.createKickLogRow(earlyCtx, kickResult({ type: 'PAT', distance: 33 }), { id: 'g9pat1', year: 5, week: 9, gameId: gs.id, teamId: team.id, oppId: oppId, auto: false, rngState: 5551 }));
  state.game = gs;
  addKicks(RTG, state, 20, 'NFL', team.id, oppId, 8);
  state.stats.season.games = 8; state.stats.season.gamesStarted = 8; state.stats.season.pat = 18; state.stats.season.patMade = 17; state.stats.season.pts += 17;
  state.stats.career.games = 60; state.stats.career.gamesStarted = 56; state.stats.nfl.games = 8; state.stats.nfl.gamesStarted = 8;
  state.records.college.longFG = { value: 57, holder: p.name.full, holderTeam: 'COA2', year: Schema.calendarYear(3), isUser: true };
  state.records.personal.longFG = 57;
  state.headlines.push({ id: 'h9', year: 5, week: 8, text: 'Rookie leg holds up in the wind', tag: 'postgame_win' });
  state.recentHeadlineIds.push('h9');
  state.rngState = rng.state();
  return state;
}

/**
 * NFL.OFF — offseason wizard with a pending EXTENSION decision (year 9, age 26).
 * @param {object} RTG @param {{seed?:number}} [opts] @returns {object} CareerState
 */
function nflOff(RTG, opts) {
  opts = opts || {};
  var state = nflRegWeek9InGame(RTG, opts);
  var Schema = RTG.Schema;
  var p = state.player;
  state.stage = 'NFL'; state.phase = 'OFF'; state.year = 9; state.week = 22;
  state.game = null;
  state.season.userGameId = null; state.season.weekGameDone = true; state.season.year = 9;
  state.season.schedule.forEach(function (g) { if (!g.played) { g.played = true; g.score = { home: 21, away: 17 }; } });
  state.leagues.nfl.year = 9; state.leagues.college.year = 9;
  p.age = 26; p.nflSeasons = 4; p.seasonsAsStarter = 7; p.xp = 340;
  p.attrs = { POW: 76, ACC: 81, CON: 75, CLU: 70, KO: 70 };
  p.trust = 72; p.js = 74; p.fans = 71; p.fame = 330; p.agentTier = 1; p.agentName = 'Dana Whitcombe';
  p.contract = { type: 'ROOKIE', years: 4, yearIdx: 3, aav: 0.98, gtdPct: 0.25, signingBonus: 0.98, startYear: 5, round: 5 };
  p.mods = [];
  for (var y = 5; y <= 8; y++) {
    var st = Schema.emptyKickerStats();
    st.fga = 28 + y; st.fgm = 23 + y; st.pat = 38; st.patMade = 37; st.pts = st.fgm * 3 + 37; st.long = 52 + (y % 3); st.games = 17; st.gamesStarted = 17; st.gameWinners = 1;
    state.history.seasons.push({ year: y, league: 'NFL', teamId: 'BOS', teamName: 'Boston Harbormen', age: 17 + y, ovr: 60 + 3 * (y - 4), role: 'K1', stats: st, awards: [], teamRecord: '10-7', champion: false, playoffResult: 'WC', grade: 'B', salary: 0.98 });
  }
  state.history.earnings = 4.9;
  state.pending = {
    kind: 'DECISION',
    decision: {
      kind: 'EXTENSION',
      payload: { years: 4, aav: 3.4, gtdPct: 0.46, teamId: 'BOS' },
      options: [
        { id: 'ACCEPT', label: 'Accept', detail: '4 yrs · $3.4M/yr · 46 % gtd' },
        { id: 'COUNTER', label: 'Counter', detail: '+10 % AAV' },
        { id: 'DECLINE', label: 'Decline', detail: 'Test free agency' }
      ]
    }
  };
  state.inbox.push({ id: 'm9', week: 22, year: 9, from: 'agent', avatar: 'agent', text: 'Boston put a number on the table.', kind: 'event', read: false });
  return state;
}

/**
 * RETIRED.LEGACY — a finished 14-season career with a pending HOF acknowledgement.
 * @param {object} RTG @param {{seed?:number}} [opts] @returns {object} CareerState
 */
function retiredLegacy(RTG, opts) {
  opts = opts || {};
  var state = nflOff(RTG, opts);
  var Schema = RTG.Schema;
  var p = state.player;
  state.stage = 'RETIRED'; state.phase = 'LEGACY'; state.year = 19; state.week = 22;
  state.leagues.nfl.year = 19; state.leagues.college.year = 19; state.season.year = 19;
  p.age = 36; p.nflSeasons = 14; p.seasonsAsStarter = 17; p.role = 'NONE'; p.contract = null;
  p.attrs = { POW: 74, ACC: 88, CON: 84, CLU: 82, KO: 62 };
  p.fame = 720; p.agentTier = 2;
  for (var y = 9; y <= 18; y++) {
    var st = Schema.emptyKickerStats();
    st.fga = 30; st.fgm = 27; st.pat = 40; st.patMade = 40; st.pts = 121; st.long = 55 + (y % 4); st.games = 17; st.gamesStarted = 17; st.gameWinners = 1; st.made50plus = 4;
    state.history.seasons.push({ year: y, league: 'NFL', teamId: 'BOS', teamName: 'Boston Harbormen', age: 17 + y, ovr: 84, role: 'K1', stats: st, awards: y === 12 ? ['ALL_LEAGUE_1'] : [], teamRecord: '11-6', champion: y === 14, playoffResult: y === 14 ? 'CHAMP' : 'DIV', grade: 'A', salary: 3.4 });
  }
  state.history.awards.push({ year: 12, league: 'NFL', id: 'ALL_LEAGUE_1', name: 'All-League First Team K', teamId: 'BOS' });
  state.history.awards.push({ year: 14, league: 'NFL', id: 'CHAMPIONSHIP_MVP', name: 'Championship Bowl MVP', teamId: 'BOS' });
  state.history.earnings = 41.2;
  state.history.moments = [
    { id: 'mo1', year: 14, week: 22, league: 'NFL', text: '58-yarder as time expires wins the Championship Bowl', score: 158, distance: 58, made: true, tags: ['decisive', 'gameWinner', 'playoff'] },
    { id: 'mo2', year: 7, week: 11, league: 'NFL', text: 'Doinks in a 51-yarder in the snow', score: 91, distance: 51, made: true, tags: ['doink'] }
  ];
  var c = state.stats.career;
  c.fga = 412; c.fgm = 361; c.pat = 520; c.patMade = 514; c.pts = 361 * 3 + 514; c.long = 62; c.made50plus = 48; c.gameWinners = 13; c.games = 238; c.gamesStarted = 236;
  state.records.nfl.careerGW = { value: 30, holder: state.records.nfl.careerGW.holder, holderTeam: state.records.nfl.careerGW.holderTeam, year: state.records.nfl.careerGW.year, isUser: false };
  state.records.nfl.longFG = { value: 66, holder: state.records.nfl.longFG.holder, holderTeam: state.records.nfl.longFG.holderTeam, year: state.records.nfl.longFG.year, isUser: false };
  state.records.personal.careerFGM = 361;
  state.pending = {
    kind: 'DECISION',
    decision: {
      kind: 'HOF',
      payload: { score: 812, verdict: 'FIRST_BALLOT', tier: 'Legend' },
      options: [{ id: 'OK', label: 'Take a bow', detail: '' }]
    }
  };
  return state;
}

/**
 * A synthetic "20 seasons in" state at the save caps: 600 kick rows, 20 season
 * lines, 600 timeline entries, 50 moments, 60 inbox, 40 headlines, AI kicker
 * stats for every NFL team. Used for validate/save timing and size tests.
 * @param {object} RTG @param {{seed?:number}} [opts] @returns {object} CareerState
 */
function twentySeasons(RTG, opts) {
  var state = nflOff(RTG, opts);
  var Schema = RTG.Schema, T = RTG.Tuning;
  var rng = rngFor(RTG, 909);
  state.year = 24; state.leagues.nfl.year = 24; state.leagues.college.year = 24; state.season.year = 24;
  state.player.age = 41; state.player.nflSeasons = 19; state.player.seasonsAsStarter = 22;
  state.stats.kicks = [];
  var ctx = kickContext(RTG, { league: 'NFL', distance: 44, teamId: 'BOS', oppId: 'PIT', wind: { speed: 5, dir: 90 }, game: { q: 2, clock: 300, scoreFor: 3, scoreAgainst: 7, week: 3, oppId: 'PIT', teamId: 'BOS' } });
  for (var i = 0; i < T.save.kickLogCap; i++) {
    var made = rng.chance(0.85);
    var res = kickResult({ outcome: made ? 'GOOD' : 'WIDE_L', distance: 25 + (i % 35), tags: made && i % 9 === 0 ? ['clutch'] : [] });
    ctx.distance = 25 + (i % 35);
    state.stats.kicks.push(Schema.createKickLogRow(ctx, res, { id: 'k' + i, year: 5 + (i % 19), week: 1 + (i % 18), gameId: 'g' + i, teamId: 'BOS', oppId: 'PIT', auto: i % 3 === 0, rngState: 100000 + i }));
  }
  for (var y = 9; y <= 23; y++) {
    var st = Schema.emptyKickerStats();
    st.fga = 30; st.fgm = 26; st.pat = 40; st.patMade = 39; st.pts = 117; st.long = 55; st.games = 17; st.gamesStarted = 17;
    state.history.seasons.push({ year: y, league: 'NFL', teamId: 'BOS', teamName: 'Boston Harbormen', age: 17 + y, ovr: 84, role: 'K1', stats: st, awards: [], teamRecord: '10-7', champion: false, playoffResult: '', grade: 'B', salary: 3.4 });
  }
  state.history.timeline = [];
  for (var tl = 0; tl < T.save.timelineCap; tl++) state.history.timeline.push({ year: 1 + (tl % 23), week: tl % 22, kind: 'GAME', text: 'Week ' + (tl % 22) + ': 2-for-2, 44 long', impact: tl % 4, teamId: 'BOS' });
  state.history.moments = [];
  for (var m = 0; m < T.save.momentsCap; m++) state.history.moments.push({ id: 'mo' + m, year: 1 + (m % 23), week: 1 + (m % 18), league: 'NFL', text: 'A big kick', score: 150 - m, distance: 40 + (m % 20), made: true, tags: ['decisive'] });
  state.inbox = [];
  for (var ib = 0; ib < T.save.inboxCap; ib++) state.inbox.push({ id: 'in' + ib, week: 1 + (ib % 18), year: 20, from: 'coach', avatar: 'coach', text: 'Keep your plant foot quiet this week, the wind is up.', kind: 'note', read: ib % 2 === 0 });
  state.headlines = [];
  for (var hd = 0; hd < T.save.headlinesCap; hd++) state.headlines.push({ id: 'hd' + hd, year: 20, week: 1 + (hd % 18), text: 'LEG OF GOLD: veteran drills three in the snow', tag: 'postgame_win' });
  state.recentHeadlineIds = state.headlines.map(function (h) { return h.id; });
  state.recentEventIds = ['NIL_TRUCK', 'MENTOR', 'PODCAST', 'KID_LESSON', 'FAN_MAIL', 'SLEEP_STUDY', 'CHARITY_KICKATHON', 'GURU', 'PSYCH', 'PARADE', 'WIND_TUNNEL', 'HOLDER_BEEF'];
  state.leagues.nfl.teams.forEach(function (t) { state.season.kickerStats[t.id] = Schema.emptyKickerStats(); });
  state.rngState = rng.state();
  return state;
}

/**
 * Every stage fixture keyed by name.
 * @param {object} RTG @param {{seed?:number}} [opts] @returns {Object<string, object>}
 */
function all(RTG, opts) {
  return {
    hsShowcase: hsShowcase(RTG, opts),
    collegeRegWeek5: collegeRegWeek5(RTG, opts),
    nflRegWeek9InGame: nflRegWeek9InGame(RTG, opts),
    nflOff: nflOff(RTG, opts),
    retiredLegacy: retiredLegacy(RTG, opts)
  };
}

module.exports = {
  DEFAULT_SEED: DEFAULT_SEED,
  rngFor: rngFor,
  kickContext: kickContext,
  kickResult: kickResult,
  syntheticSchedule: syntheticSchedule,
  hsShowcase: hsShowcase,
  collegeRegWeek5: collegeRegWeek5,
  nflRegWeek9InGame: nflRegWeek9InGame,
  nflOff: nflOff,
  retiredLegacy: retiredLegacy,
  twentySeasons: twentySeasons,
  all: all
};
