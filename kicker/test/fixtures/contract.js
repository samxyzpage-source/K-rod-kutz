/**
 * Contract & draft fixtures (E3). Plain factories taking RTG (from test/load.js)
 * and returning VALID CareerStates (Schema.validate passes) at the phases the
 * Contracts / Draft modules operate on, plus small helpers.
 *
 *   const cfx = require('./fixtures/contract');
 *   const state = cfx.nflFinalYear(RTG);        // NFL.OFF, final rookie year, extension-eligible, no pending
 *   const fa    = cfx.freeAgent(RTG);           // NFL.OFF, contract expired (null)
 *   const pro   = cfx.draftProspect(RTG, {attrs: {...}});   // DRAFT.COMBINE
 *   cfx.setNeedy(RTG, state, 6);                // exactly 6 needy NFL teams
 */
'use strict';

var sfx = require('./schema');

/** Deep copy (realm-agnostic). */
function J(o) { return JSON.parse(JSON.stringify(o)); }

/** Shallow-patch player fields (attrs/flags merged). */
function patchPlayer(p, o) {
  Object.keys(o || {}).forEach(function (k) {
    if ((k === 'attrs' || k === 'flags' || k === 'hometown') && o[k] && typeof o[k] === 'object') {
      Object.keys(o[k]).forEach(function (a) { p[k][a] = o[k][a]; });
    } else {
      p[k] = o[k];
    }
  });
}

/** A non-needy AI kicker (age 28, OVR 80, 3 years left). */
function calmKicker(RTG, name) {
  return {
    name: name || 'Placeholder Kicker', age: 28, ovr: 80,
    attrs: { POW: 80, ACC: 80, CON: 80, CLU: 80, KO: 80 }, contractYears: 3,
    seasonStats: RTG.Schema.emptyKickerStats()
  };
}

/**
 * Make exactly `n` NFL teams needy (§2.7.6 rule) — the first n in data order, via a low OVR — and every other
 * team non-needy. Teams without a K1 get a placeholder kicker so the count is exact.
 * @param {object} RTG @param {object} state @param {number} n @returns {string[]} needy team ids
 */
function setNeedy(RTG, state, n) {
  var L = state.leagues.nfl;
  var ids = [];
  L.teams.forEach(function (t, i) {
    if (!t.kicker) t.kicker = calmKicker(RTG, 'Placeholder ' + t.abbr);
    t.kicker.age = 28; t.kicker.ovr = 80; t.kicker.contractYears = 3;
    if (i < n) { t.kicker.ovr = 65; ids.push(t.id); }
  });
  RTG.Schema.reindexLeague(L);
  return ids;
}

/**
 * NFL.OFF, year 9 (age 26), final year of a round-5 rookie deal, satisfaction ≥ 0.72, js 74, no pending.
 * @param {object} RTG @param {{seed?:number, player?:object, needy?:number}} [o] @returns {object} CareerState
 */
function nflFinalYear(RTG, o) {
  o = o || {};
  var state = sfx.nflOff(RTG, { seed: o.seed });
  state.pending = null;
  state.flags = {};
  var p = state.player;
  p.contract = { type: 'ROOKIE', years: 4, yearIdx: 3, aav: 0.98, gtdPct: 0.25, signingBonus: 0.98, startYear: 5, round: 5, paid: 2.94, paidThrough: 2 };
  p.tags = 0;
  p.hometown = { city: 'Springfield', state: 'IL', region: 'MW' };
  if (typeof o.needy === 'number') setNeedy(RTG, state, o.needy);
  patchPlayer(p, o.player);
  return state;
}

/**
 * NFL.OFF with the contract expired (player.contract = null) — the free-agency state.
 * @param {object} RTG @param {{seed?:number, player?:object, needy?:number}} [o] @returns {object} CareerState
 */
function freeAgent(RTG, o) {
  o = o || {};
  var state = nflFinalYear(RTG, o);
  state.player.contract = null;
  state.history.contracts.forEach(function (r) { if (r.endYear === undefined || r.endYear === null) r.endYear = 9; });
  return state;
}

/**
 * DRAFT.COMBINE, year 4 (age 21): a college kicker who declared. College stats 60/75 (80 %), prestige-3 school,
 * fame 160 (tier 1), no combine played yet.
 * @param {object} RTG @param {{seed?:number, player?:object, fga?:number, fgm?:number, combineScore?:number, plan?:string}} [o]
 * @returns {object} CareerState
 */
function draftProspect(RTG, o) {
  o = o || {};
  var state = sfx.collegeRegWeek5(RTG, { seed: o.seed });
  var Schema = RTG.Schema;
  var p = state.player;
  state.stage = 'DRAFT'; state.phase = 'COMBINE'; state.year = 4; state.week = 0;
  state.pending = null; state.game = null;
  state.flags = {};
  state.season.userGameId = null; state.season.weekGameDone = true;
  p.age = 21; p.collegeSeasons = 3; p.seasonsAsStarter = 3;
  p.attrs = { POW: 74, ACC: 76, CON: 70, CLU: 66, KO: 68 };
  p.fame = 160;
  var st = Schema.emptyKickerStats();
  st.fga = typeof o.fga === 'number' ? o.fga : 75; st.fgm = typeof o.fgm === 'number' ? o.fgm : 60;
  st.pat = 120; st.patMade = 118; st.pts = st.fgm * 3 + 118; st.long = 54; st.games = 38; st.gamesStarted = 38;
  state.stats.college = J(st); state.stats.career = J(st);
  state.stats.season = Schema.emptyKickerStats();
  if (typeof o.combineScore === 'number') state.flags.combineScore = o.combineScore;
  if (o.plan) state.flags.combinePlan = o.plan;
  patchPlayer(p, o.player);
  return state;
}

/**
 * A plain FA offer object (VET, 3 years, $3.0M/yr) with overrides.
 * @param {object} [o] @returns {object}
 */
function offer(o) {
  return Object.assign({
    id: 'OFFER_0', teamId: 'PIT', teamName: 'Pittsburgh Forge', type: 'VET', years: 3, aav: 3.0, gtdPct: 0.4,
    startsK1: true, hometown: false, hometownDiscount: false, note: 'test', tags: [], total: 9.0
  }, o || {});
}

/**
 * Fill a session's results from a make pattern (true/false per context; `hang` for KO contexts).
 * @param {object} session @param {boolean[]} pattern @param {number} [hang=3.9] @returns {object} session
 */
function fillResults(session, pattern, hang) {
  session.results = session.contexts.map(function (ctx, i) {
    var m = !!pattern[i];
    if (ctx.type === 'KO') return { type: 'KO', outcome: 'TOUCHBACK', made: false, hang: hang === undefined ? 3.9 : hang, tags: [] };
    return { outcome: m ? 'GOOD' : 'WIDE_R', made: m, points: m ? 3 : 0, distance: ctx.distance, tags: [] };
  });
  session.idx = session.results.length;
  return session;
}

module.exports = {
  nflFinalYear: nflFinalYear,
  freeAgent: freeAgent,
  draftProspect: draftProspect,
  setNeedy: setNeedy,
  calmKicker: calmKicker,
  offer: offer,
  fillResults: fillResults
};
