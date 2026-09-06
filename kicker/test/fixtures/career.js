/**
 * Career fixtures (E3). Plain factories that take RTG (from test/load.js) and return VALID CareerStates at the
 * points the Career / Engine modules operate on, plus small helpers to drive sessions and chains deterministically.
 *
 *   const kfx = require('./fixtures/career');
 *   const { state, rng } = kfx.hsOffers(RTG);          // HS.OFFERS with the OFFERS_COLLEGE decision pending
 *   const c = kfx.collegePre(RTG);                     // COLLEGE.PRE right after committing (camp session may be pending)
 *   const b = kfx.campBattle(RTG);                     // COLLEGE.PRE with a pending CAMP session vs a strong rival
 *   const o = kfx.collegeOff(RTG, { seasons: 3 });     // COLLEGE.OFF, season finished, chain not started
 *   const n = kfx.nflOff(RTG);                         // NFL.OFF (final rookie year), season finished, chain not started
 *   kfx.fillSession(session, [true, false, ...]);      // deterministic results for a pending KickSession
 *
 * Every builder returns fresh objects and is deterministic for a seed.
 */
'use strict';

var schemaFx = require('./schema');
var eventsFx = require('./events');
var contractFx = require('./contract');

var DEFAULT_SEED = 7;
var NOW = 1757000000000;

/** {state, rng} of a brand-new career (Engine.newCareer). */
function newCareer(RTG, opts) {
  opts = opts || {};
  var seed = opts.seed === undefined ? DEFAULT_SEED : opts.seed;
  var r = RTG.Engine.newCareer({ name: opts.name || 'Sam Booter', archetype: opts.archetype || 'SURGEON', difficulty: opts.difficulty || 'pro', seed: seed }, NOW);
  return r;
}

/**
 * Play every kick of the pending KICKS session with the AI rule (Engine.sessionKick with null input).
 * @returns {Object|null} the last sessionKick result
 */
function playSession(RTG, state, rng) {
  var last = null, guard = 40;
  var pd = state.pending;
  while (state.pending === pd && state.pending && state.pending.kind === 'KICKS' && guard-- > 0) last = RTG.Engine.sessionKick(state, rng, null);
  return last;
}

/**
 * Deterministic results for a KickSession from a make pattern (true/false per context; kickoff contexts get a
 * TOUCHBACK with `hang`). Sets session.idx. Same shape as fixtures/contract.fillResults.
 */
function fillSession(session, pattern, hang) {
  return contractFx.fillResults(session, pattern, hang);
}

/** HS.OFFERS — showcase played with AI kicks, OFFERS_COLLEGE decision pending. @returns {{state, rng}} */
function hsOffers(RTG, opts) {
  var r = newCareer(RTG, opts);
  playSession(RTG, r.state, r.rng);
  return r;
}

/** The offer the default policy would pick (Engine.autoOption). */
function bestOfferId(RTG, state) {
  return RTG.Engine.autoOption(state, state.pending.decision);
}

/**
 * COLLEGE.PRE — the best offer accepted (Season.start ran; a camp session may be pending when the incumbent is close).
 * opts.depth forces an offer of that depth when one exists ('OPEN' → K1 without a camp battle).
 * @returns {{state, rng, offer}}
 */
function collegePre(RTG, opts) {
  opts = opts || {};
  var r = hsOffers(RTG, opts);
  var dec = r.state.pending.decision;
  var pick = null;
  if (opts.depth) for (var i = 0; i < dec.payload.offers.length; i++) if (dec.payload.offers[i].depth === opts.depth) { pick = dec.payload.offers[i]; break; }
  var id = pick ? pick.id : bestOfferId(RTG, r.state);
  var offer = null;
  for (var j = 0; j < dec.payload.offers.length; j++) if (dec.payload.offers[j].id === id) offer = dec.payload.offers[j];
  RTG.Engine.decide(r.state, r.rng, { kind: 'OFFERS_COLLEGE', optionId: id });
  r.offer = offer;
  return r;
}

/**
 * COLLEGE.PRE with a pending CAMP session against a strong incumbent (K2 slot, OVR ≈ user + 10), user K1.
 * @returns {{state, rng, session}}
 */
function campBattle(RTG, opts) {
  opts = opts || {};
  var state = eventsFx.collegePre(RTG, opts);
  var rng = RTG.RNG.create((opts.seed === undefined ? DEFAULT_SEED : opts.seed) + 300);
  var team = RTG.Schema.userTeam(state);
  var my = RTG.Player.ovr(state.player.attrs);
  var rival = contractFx.calmKicker(RTG, 'Rival Legg');
  var target = my + (opts.rivalDelta === undefined ? 10 : opts.rivalDelta);
  for (var a in rival.attrs) rival.attrs[a] = Math.max(30, Math.min(99, target));
  rival.ovr = RTG.Player.ovr(rival.attrs);
  rival.age = 21; rival.contractYears = 2;
  team.kicker = null; team.kicker2 = rival;
  RTG.Schema.reindexLeague(state.leagues.college);
  state.player.role = opts.role || 'K1';
  state.pending = null;
  var session = RTG.Career.campBattle(state, rng);
  return { state: state, rng: rng, session: session, rival: rival };
}

/**
 * COLLEGE.OFF with the season finished and the chain NOT started (opts.seasons = collegeSeasons, default 3;
 * opts.role, opts.js, opts.trust patch the player).
 * @returns {{state, rng}}
 */
function collegeOff(RTG, opts) {
  opts = opts || {};
  var state = eventsFx.collegeOff(RTG, opts);
  var p = state.player;
  p.collegeSeasons = opts.seasons === undefined ? 3 : opts.seasons;
  state.year = p.collegeSeasons; state.season.year = state.year; state.leagues.college.year = state.year; state.leagues.nfl.year = state.year;
  p.age = 18 + p.collegeSeasons - 1;
  if (opts.role) p.role = opts.role;
  if (typeof opts.js === 'number') p.js = opts.js;
  if (typeof opts.trust === 'number') p.trust = opts.trust;
  if (opts.redshirt) p.redshirt = true;
  state.season.finished = true;
  state.season.weekGameDone = true;
  delete state.flags.offseason;
  return { state: state, rng: RTG.RNG.create((opts.seed === undefined ? DEFAULT_SEED : opts.seed) + 400) };
}

/**
 * NFL.OFF, final year of the rookie deal (age 26), season finished, chain not started, no pending.
 * @returns {{state, rng}}
 */
function nflOff(RTG, opts) {
  opts = opts || {};
  var state = contractFx.nflFinalYear(RTG, opts);
  state.season.finished = true;
  state.season.weekGameDone = true;
  delete state.flags.offseason;
  if (typeof opts.age === 'number') state.player.age = opts.age;
  return { state: state, rng: RTG.RNG.create((opts.seed === undefined ? DEFAULT_SEED : opts.seed) + 500) };
}

/** NFL.REG week 9, no game in progress (from the events fixtures). @returns {{state, rng}} */
function nflReg(RTG, opts) {
  opts = opts || {};
  return { state: eventsFx.nflReg(RTG, opts), rng: RTG.RNG.create((opts.seed === undefined ? DEFAULT_SEED : opts.seed) + 600) };
}

/** COLLEGE.REG week 5, no game in progress. @returns {{state, rng}} */
function collegeReg(RTG, opts) {
  opts = opts || {};
  return { state: eventsFx.collegeReg(RTG, opts), rng: RTG.RNG.create((opts.seed === undefined ? DEFAULT_SEED : opts.seed) + 700) };
}

/**
 * DRAFT.DECLARE — a junior (3 seasons) with the DECLARE decision pending (Career.enterDraft).
 * @returns {{state, rng}}
 */
function draftDeclare(RTG, opts) {
  var r = collegeOff(RTG, Object.assign({ seasons: 3 }, opts || {}));
  RTG.Career.enterDraft(r.state, r.rng);
  return r;
}

/** DRAFT.COMBINE — declared, COMBINE_PLAN decision pending. @returns {{state, rng}} */
function draftCombine(RTG, opts) {
  var r = draftDeclare(RTG, opts);
  RTG.Engine.decide(r.state, r.rng, { kind: 'DECLARE', optionId: 'DECLARE' });
  return r;
}

/**
 * Drive every pending thing with the default policy (Engine.settlePending) and return the log of what was resolved.
 */
function settle(RTG, state, rng, opts) {
  return RTG.Engine.settlePending(state, rng, opts || {});
}

/** RETIRED.LEGACY (from the schema fixtures). */
function retired(RTG, opts) {
  return { state: schemaFx.retiredLegacy(RTG, opts), rng: RTG.RNG.create(900) };
}

module.exports = {
  DEFAULT_SEED: DEFAULT_SEED,
  NOW: NOW,
  newCareer: newCareer,
  playSession: playSession,
  fillSession: fillSession,
  hsOffers: hsOffers,
  bestOfferId: bestOfferId,
  collegePre: collegePre,
  campBattle: campBattle,
  collegeOff: collegeOff,
  nflOff: nflOff,
  nflReg: nflReg,
  collegeReg: collegeReg,
  draftDeclare: draftDeclare,
  draftCombine: draftCombine,
  settle: settle,
  retired: retired
};
