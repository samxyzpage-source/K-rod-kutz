/**
 * League fixtures (E2). Plain factories that take RTG (from test/load.js) and
 * return valid League objects built from RTG.Data.colleges / RTG.Data.nfl so
 * that Schedule/Standings/Sim/Season tests and UI screens can run before
 * Schema.createCareer is complete.
 *
 *   const fx = require('./fixtures/league');
 *   const rng = fx.testRng(RTG, 42);
 *   const { college, nfl } = fx.buildLeagues(RTG, rng);
 *
 * Every factory is deterministic for a given rng. When RTG.Schema exists its
 * emptyKickerStats() is used; otherwise a minimal KickerStats literal.
 */
'use strict';

/**
 * A seeded RNG for tests: RTG.RNG when loaded, else a tiny mulberry32 with the
 * same §3.5.2 draw contract (next/int/float/chance/gauss/pick/weighted/shuffle/state/setState).
 * @param {object} RTG
 * @param {number} seed
 */
function testRng(RTG, seed) {
  if (RTG && RTG.RNG && typeof RTG.RNG.create === 'function') return RTG.RNG.create(seed >>> 0);
  let s = seed >>> 0;
  const r = {
    next() {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(lo, hi) { return lo + Math.floor(r.next() * (hi - lo + 1)); },
    float(lo, hi) { return lo + r.next() * (hi - lo); },
    chance(p) { return r.next() < p; },
    gauss(mu, sd) {
      const u1 = r.next(), u2 = r.next();
      return (mu || 0) + (sd === undefined ? 1 : sd) * Math.sqrt(-2 * Math.log(1 - u1)) * Math.cos(2 * Math.PI * u2);
    },
    pick(arr) { const u = r.next(); return arr[Math.floor(u * arr.length)]; },
    weighted(items, wk) {
      const u = r.next();
      const wf = typeof wk === 'function' ? wk : (it) => it[wk];
      let total = 0;
      for (const it of items) total += Math.max(0, Number(wf(it)) || 0);
      if (total <= 0) return items[Math.floor(u * items.length)];
      let acc = u * total;
      for (const it of items) { acc -= Math.max(0, Number(wf(it)) || 0); if (acc < 0) return it; }
      return items[items.length - 1];
    },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r.next() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
      return arr;
    },
    state() { return s >>> 0; },
    setState(v) { s = v >>> 0; },
    fork() { r.next(); return testRng(null, s ^ 0x9e3779b9); },
  };
  return r;
}

function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }

function emptyKickerStats(RTG) {
  if (RTG && RTG.Schema && typeof RTG.Schema.emptyKickerStats === 'function') return RTG.Schema.emptyKickerStats();
  const b = () => ({ a: 0, m: 0 });
  return {
    fga: 0, fgm: 0, pat: 0, patMade: 0, pts: 0, long: 0,
    buckets: { '0-29': b(), '30-39': b(), '40-49': b(), '50-59': b(), '60+': b() },
    clutchA: 0, clutchM: 0, decisiveA: 0, decisiveM: 0, gameWinners: 0, tieForcers: 0,
    blocked: 0, doinks: 0, doinkIn: 0, wideL: 0, wideR: 0, short: 0, made50plus: 0,
    consecutive: 0, bestConsecutive: 0, games: 0, gamesStarted: 0, koTouchbacks: 0, koCount: 0, wins: 0, losses: 0,
  };
}

/**
 * Generate an AI kicker (§2.5.1). Draws: name 3–4, age 1, ovr 2, attrs 5×2, contract 1.
 * @param {object} RTG
 * @param {object} rng
 * @param {number} anchor ovr anchor (college 52 + 4·prestige, NFL 74)
 */
function makeAiKicker(RTG, rng, anchor) {
  const T = (RTG.Tuning && RTG.Tuning.league && RTG.Tuning.league.aiKicker) || {};
  const ageBand = T.age || [22, 36];
  const name = RTG.Names ? RTG.Names.player(rng).full : 'Kicker ' + rng.int(100, 999);
  const age = rng.int(ageBand[0], ageBand[1]);
  const ovr = clamp(Math.round(rng.gauss(anchor, T.ovrSd || 7)), 30, 99);
  const attrs = {};
  for (const k of ['POW', 'ACC', 'CON', 'CLU', 'KO']) {
    attrs[k] = clamp(Math.round(ovr + rng.gauss(0, T.attrSd || 4)), T.attrMin || 30, T.attrMax || 99);
  }
  const cy = T.contractYears || [1, 4];
  return { name, age, ovr, attrs, contractYears: rng.int(cy[0], cy[1]), seasonStats: emptyKickerStats(RTG) };
}

function surfaceFor(team, rng) {
  if (team.dome) return 'turf';
  if ((team.climate === 'cold' || team.windy) && rng.chance(0.5)) return 'turf';
  return 'grass';
}

/**
 * Build a Team (§2.5.1) from a data row plus generated fields.
 * @param {object} RTG @param {object} rng @param {object} d data row @param {'COLLEGE'|'NFL'} league
 */
function makeTeam(RTG, rng, d, league) {
  const T = (RTG.Tuning && RTG.Tuning.league) || {};
  const init = T.nflInit || { off: { mean: 72, sd: 7, min: 58, max: 88 }, def: { mean: 72, sd: 7, min: 58, max: 88 }, st: { mean: 70, sd: 5 }, coachAgg: [0.3, 0.8] };
  const team = {
    id: d.id, name: d.name, city: d.city, nick: d.nick, abbr: d.abbr, colors: d.colors.slice(),
    conf: d.conf, div: d.div || null, prestige: d.prestige || null,
    OFF: d.OFF, DEF: d.DEF, ST: d.ST,
    coachAgg: 0, climate: d.climate, dome: !!d.dome, altitude: !!d.altitude, windy: !!d.windy, rainy: !!d.rainy,
    surface: 'grass', kicker: null, kicker2: null, region: d.region,
  };
  if (league === 'COLLEGE') {
    team.confIdx = d.confIdx; team.rival = d.rival; team.school = d.school;
  } else {
    team.confIdx = d.confIdx; team.divIdx = d.divIdx; team.bigMarket = !!d.bigMarket;
    team.OFF = clamp(Math.round(rng.gauss(init.off.mean, init.off.sd)), init.off.min, init.off.max);
    team.DEF = clamp(Math.round(rng.gauss(init.def.mean, init.def.sd)), init.def.min, init.def.max);
    team.ST = Math.round(rng.gauss(init.st.mean, init.st.sd));
  }
  const agg = init.coachAgg || [0.3, 0.8];
  team.coachAgg = Math.round(rng.float(agg[0], agg[1]) * 100) / 100;
  team.surface = surfaceFor(team, rng);
  const K = T.aiKicker || {};
  const anchor = league === 'COLLEGE'
    ? (K.collegeAnchorBase || 52) + (K.collegeAnchorPerPrestige || 4) * (d.prestige || 3)
    : (K.nflAnchor || 74);
  team.kicker = makeAiKicker(RTG, rng, anchor);
  team.ST = Math.round((T.stBlend || 0.5) * team.ST + (1 - (T.stBlend || 0.5)) * team.kicker.ovr);
  team.coach = RTG.Names ? RTG.Names.coach(rng) : 'Coach ' + d.abbr;
  return team;
}

function indexOf(teams) {
  const idx = {};
  teams.forEach((t, i) => { idx[t.id] = i; });
  return idx;
}

/** @returns {object} College League per §3.4 */
function collegeLeague(RTG, rng, year) {
  const teams = RTG.Data.colleges.map((d) => makeTeam(RTG, rng, d, 'COLLEGE'));
  const kickers = {};
  teams.forEach((t) => { kickers[t.id] = t.kicker; });
  return { kind: 'COLLEGE', year: year || 1, teams, teamIndex: indexOf(teams), seasonHistory: [], kickers };
}

/** @returns {object} NFL League per §3.4 */
function nflLeague(RTG, rng, year) {
  const C = (RTG.Tuning && RTG.Tuning.contracts) || {};
  const teams = RTG.Data.nfl.map((d) => makeTeam(RTG, rng, d, 'NFL'));
  const kickers = {};
  teams.forEach((t) => { kickers[t.id] = t.kicker; });
  return {
    kind: 'NFL', year: year || 1, teams, teamIndex: indexOf(teams),
    cap: C.cap || 255, vetMin: C.vetMin || 1.1, tagValue: C.tagValueBase || 5.5,
    seasonHistory: [], kickers,
  };
}

/**
 * Both leagues from one rng (college first, then NFL — same order as Schema.createCareer).
 * @param {object} RTG @param {object} rng @param {number} [year=1]
 * @returns {{college: object, nfl: object}}
 */
function buildLeagues(RTG, rng, year) {
  const college = collegeLeague(RTG, rng, year);
  const nfl = nflLeague(RTG, rng, year);
  return { college, nfl };
}

module.exports = { testRng, buildLeagues, collegeLeague, nflLeague, makeTeam, makeAiKicker, emptyKickerStats };
