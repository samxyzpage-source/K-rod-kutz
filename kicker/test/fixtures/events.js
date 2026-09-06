/**
 * Event fixtures (E3). Valid CareerStates positioned so that specific §2.10.2 events are eligible,
 * plus small scenario helpers (decisive miss last game, doink, snow/fog forecast, rivalry week…).
 *
 *   const efx = require('./fixtures/events');
 *   const s = efx.forEvent(RTG, 'SNOW_BOOTS');       // COLLEGE.REG with snow in this week's forecast
 *   const all = efx.stages(RTG);                     // {collegeReg, collegePre, collegeOff, nflReg, nflPre, nflOff, nflPost, hs, retired}
 *
 * Every builder returns a fresh object that passes Schema.validate. Builders are deterministic (seed 7).
 */
'use strict';

var schemaFx = require('./schema');

/** Attribute sets used by the scenarios. */
var ATTRS = {
  star: { POW: 86, ACC: 90, CON: 86, CLU: 82, KO: 80 },      // OVR ≈ 87
  starter: { POW: 78, ACC: 82, CON: 78, CLU: 72, KO: 72 }    // OVR ≈ 78
};

function ovr(RTG, attrs) { return RTG.Player.ovr(attrs); }

/** Set a phase/week on a state (game cleared). */
function at(state, phase, week) {
  state.phase = phase;
  state.week = week;
  state.game = null;
  state.pending = null;
  if (state.season) { state.season.userGameId = null; state.season.weekGameDone = false; }
  return state;
}

/** This week's schedule row for the user's team, or null. */
function thisWeekGame(state) {
  var sched = state.season && state.season.schedule, tid = state.player.teamId;
  if (!sched) return null;
  for (var i = 0; i < sched.length; i++) {
    var g = sched[i];
    if (g.week === state.week && (g.homeId === tid || g.awayId === tid)) return g;
  }
  return null;
}

/** Make sure the user's team has a game this week (adds one against `oppId` or the next team when missing). */
function ensureGame(state, oppId, away) {
  var g = thisWeekGame(state);
  var tid = state.player.teamId;
  var lg = state.player.league === 'NFL' ? state.leagues.nfl : state.leagues.college;
  if (!oppId) {
    for (var i = 0; i < lg.teams.length; i++) if (lg.teams[i].id !== tid) { oppId = lg.teams[i].id; break; }
  }
  if (!g) {
    g = { id: 'efx' + state.week + '-' + tid + '-' + oppId, week: state.week, homeId: away ? oppId : tid, awayId: away ? tid : oppId, kind: 'REG', played: false };
    state.season.schedule.push(g);
  } else {
    var mine = g.homeId === tid ? 'homeId' : 'awayId', other = mine === 'homeId' ? 'awayId' : 'homeId';
    g[other] = oppId;
    if (away !== undefined) {
      var opp = g[other];
      g.homeId = away ? opp : tid; g.awayId = away ? tid : opp;
    }
  }
  return g;
}

/** Pre-roll weather onto this week's game (the event `cond`s read schedule[].weather). */
function forecast(state, weather, tempF, away) {
  var g = ensureGame(state, null, away);
  g.weather = { weather: weather, tempF: tempF, wind: { speed: 6, dir: 90 }, surface: 'grass', altitude: false, dome: false };
  return state;
}

/** Append one user kick row to the LAST game in the log (or a new game) — used for "last game" conds. */
function addKick(RTG, state, o) {
  o = o || {};
  var rows = state.stats.kicks;
  var last = rows.length ? rows[rows.length - 1] : null;
  var league = state.player.league || 'COLLEGE';
  var oppId = last ? last.oppId : ensureGame(state).awayId;
  var ctx = schemaFx.kickContext(RTG, { league: league, distance: o.distance || 44, teamId: state.player.teamId, oppId: oppId, week: state.week, decisive: !!o.decisive, pressure: o.decisive ? 0.9 : 0.2 });
  var outcome = o.outcome || (o.made === false ? 'WIDE_L' : 'GOOD');
  var res = schemaFx.kickResult({ outcome: outcome, distance: o.distance || 44, tags: o.decisive ? ['decisive'] : [] });
  var row = RTG.Schema.createKickLogRow(ctx, res, {
    id: 'efxk' + rows.length, year: state.year, week: state.week - 1, gameId: last ? last.gameId : 'efxg', teamId: state.player.teamId,
    oppId: oppId, auto: false, rngState: 77 + rows.length
  });
  rows.push(row);
  return row;
}

// ───────────────────────────── stage bases ─────────────────────────────

/** COLLEGE.REG week 5 (from the schema fixture), game cleared. */
function collegeReg(RTG, opts) { return at(schemaFx.collegeRegWeek5(RTG, opts), 'REG', 5); }
/** COLLEGE.PRE week 0. */
function collegePre(RTG, opts) { return at(schemaFx.collegeRegWeek5(RTG, opts), 'PRE', 0); }
/** COLLEGE.OFF week 17, three seasons played (draft-eligible). */
function collegeOff(RTG, opts) {
  var s = at(schemaFx.collegeRegWeek5(RTG, opts), 'OFF', RTG.Tuning.schedule.college.totalWeeks);
  s.player.collegeSeasons = 3; s.player.age = 21; s.year = 3; s.season.year = 3; s.leagues.college.year = 3; s.leagues.nfl.year = 3;
  return s;
}
/** NFL.REG week 9, rookie year, no game in progress. */
function nflReg(RTG, opts) { return at(schemaFx.nflRegWeek9InGame(RTG, opts), 'REG', 9); }
/** NFL.PRE week 0, rookie year. */
function nflPre(RTG, opts) { return at(schemaFx.nflRegWeek9InGame(RTG, opts), 'PRE', 0); }
/** NFL.POST week 19. */
function nflPost(RTG, opts) { return at(schemaFx.nflRegWeek9InGame(RTG, opts), 'POST', RTG.Tuning.schedule.nfl.regWeeks + 1); }
/** NFL.OFF (year 9, age 26, final rookie-contract year), pending cleared. */
function nflOff(RTG, opts) { var s = schemaFx.nflOff(RTG, opts); s.pending = null; return s; }

/** Every stage base keyed by name. */
function stages(RTG, opts) {
  return {
    hs: schemaFx.hsShowcase(RTG, opts),
    collegePre: collegePre(RTG, opts), collegeReg: collegeReg(RTG, opts), collegeOff: collegeOff(RTG, opts),
    nflPre: nflPre(RTG, opts), nflReg: nflReg(RTG, opts), nflPost: nflPost(RTG, opts), nflOff: nflOff(RTG, opts),
    retired: schemaFx.retiredLegacy(RTG, opts)
  };
}

// ───────────────────────────── per-event scenarios ─────────────────────────────

var SCENARIOS = {
  NIL_TRUCK: function (RTG) { var s = collegeReg(RTG); s.player.fame = 150; return s; },
  PORTAL_WHISPER: function (RTG) { var s = collegeOff(RTG); s.player.js = 30; return s; },
  MEDIA_SCRUM_MISS: function (RTG) { var s = collegeReg(RTG); addKick(RTG, s, { made: false, decisive: true, distance: 41 }); return s; },
  HOLDER_BEEF: function (RTG) { var s = collegeReg(RTG); s.player.flags.holderBeef = true; return s; },
  HOLDOUT: function (RTG) {
    var s = nflOff(RTG); s.player.attrs = ATTRS.star; s.player.contract.yearIdx = s.player.contract.years - 1; return s;
  },
  CHARITY_KICKATHON: function (RTG) { return collegeReg(RTG); },
  FAMILY_ILLNESS: function (RTG) { return collegeReg(RTG); },
  KID_LESSON: function (RTG) { return collegeReg(RTG); },
  COACH_ULTIMATUM: function (RTG) { var s = collegeReg(RTG); s.player.trust = 20; return s; },
  COACH_SHOPPING: function (RTG) {
    var s = collegeReg(RTG); s.player.role = 'K2';
    var ks = RTG.Schema.emptyKickerStats(); ks.fga = 6; ks.fgm = 3; s.season.kickerStats[s.player.teamId] = ks;
    return s;
  },
  RIVAL_TRASH_TALK: function (RTG) {
    var s = collegeReg(RTG);
    var lg = s.leagues.college, tm = null;
    for (var i = 0; i < lg.teams.length; i++) if (lg.teams[i].id === s.player.teamId) tm = lg.teams[i];
    ensureGame(s, tm.rival);
    return s;
  },
  WIND_TUNNEL: function (RTG) { var s = nflOff(RTG); s.history.earnings = 2.5; return s; },
  MENTOR: function (RTG) { var s = nflReg(RTG); s.player.nflSeasons = 0; return s; },
  DOINK_VIRAL: function (RTG) { var s = nflReg(RTG); addKick(RTG, s, { outcome: 'DOINK_OUT', made: false, distance: 47 }); return s; },
  SNOW_BOOTS: function (RTG) { return forecast(collegeReg(RTG), 'snow', 28); },
  CAPTAIN_VOTE: function (RTG) { var s = collegePre(RTG); s.player.trust = 70; return s; },
  HALFTIME_70: function (RTG) { var s = collegeReg(RTG); s.player.fame = 300; return s; },
  AGENT_UPGRADE: function (RTG) { var s = nflReg(RTG); s.player.fame = 300; s.player.agentTier = 0; return s; },
  TAG_REACTION: function (RTG) {
    var s = nflOff(RTG);
    s.player.contract = { type: 'TAG', years: 1, yearIdx: 0, aav: 6.0, gtdPct: 1, signingBonus: 0, startYear: s.year };
    s.player.tags = 1;
    return s;
  },
  SLEEP_STUDY: function (RTG) { return collegeReg(RTG); },
  TRADE_RUMOR: function (RTG) { var s = nflReg(RTG); s.player.js = 30; return s; },
  DRAFT_PRESSURE: function (RTG) { return collegeOff(RTG); },
  PARADE: function (RTG) { var s = collegeOff(RTG); s.flags.wonTitle = s.year; return s; },
  CONTENDER_CALL: function (RTG) {
    var s = nflReg(RTG); s.week = 6; s.player.attrs = ATTRS.starter;
    var r = s.season.results[s.player.teamId]; r.w = 1; r.l = 4; r.t = 0;
    return s;
  },
  CUT_DAY_CALL: function (RTG) {
    var s = nflReg(RTG); s.player.teamId = null; s.player.role = 'NONE'; s.player.contract = null; s.flags.cutNoOffers = true;
    return s;
  },
  FAN_MAIL: function (RTG) { return nflReg(RTG); },
  ROOKIE_HAZING: function (RTG) { var s = nflPre(RTG); s.player.nflSeasons = 0; return s; },
  WEATHER_SESSION: function (RTG) { return forecast(nflReg(RTG), 'clear', 30, true); },
  COMEBACK: function (RTG) { var s = nflReg(RTG); s.player.injury = { type: 'HIP_FLEXOR', weeksLeft: 5, careerThreat: false }; return s; },
  PODCAST: function (RTG) { var s = collegeReg(RTG); s.player.fame = 150; return s; },
  RETIREMENT_RUMOR: function (RTG) { var s = nflReg(RTG); s.player.age = 36; s.player.nflSeasons = 13; return s; },
  HURRICANE: function (RTG) {
    var s = collegeReg(RTG); s.week = 2;
    var lg = s.leagues.college;
    for (var i = 0; i < lg.teams.length; i++) if (lg.teams[i].id === s.player.teamId) { lg.teams[i].climate = 'warm'; lg.teams[i].dome = false; }
    return s;
  },
  ONSIDE_PRACTICE: function (RTG) { return collegePre(RTG); },
  PSYCH: function (RTG) { var s = collegeReg(RTG); s.player.attrs.CLU = 50; return s; },
  FAN_PETITION: function (RTG) { var s = collegeReg(RTG); s.player.fans = 20; return s; },
  AGGRESSIVE_PLAN: function (RTG) { var s = nflPre(RTG); s.player.trust = 75; return s; },
  GURU: function (RTG) { return nflOff(RTG); },
  FOG_DELAY: function (RTG) { return forecast(nflReg(RTG), 'fog', 50); },
  ENDORSEMENT_DRINK: function (RTG) { var s = nflReg(RTG); s.player.fame = 450; s.player.fans = 70; return s; },
  ULTIMATUM_FAILED: function (RTG) { return collegeReg(RTG); }
};

/**
 * A state on which `eventId`'s cond is true (and stage/phase match).
 * @param {object} RTG @param {string} eventId @returns {object} CareerState
 */
function forEvent(RTG, eventId) {
  var b = SCENARIOS[eventId];
  if (!b) throw new Error('fixtures/events: no scenario for ' + eventId);
  return b(RTG);
}

module.exports = {
  ATTRS: ATTRS,
  ovr: ovr,
  at: at,
  thisWeekGame: thisWeekGame,
  ensureGame: ensureGame,
  forecast: forecast,
  addKick: addKick,
  collegeReg: collegeReg,
  collegePre: collegePre,
  collegeOff: collegeOff,
  nflReg: nflReg,
  nflPre: nflPre,
  nflPost: nflPost,
  nflOff: nflOff,
  stages: stages,
  SCENARIOS: SCENARIOS,
  forEvent: forEvent
};
