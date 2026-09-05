/**
 * Kick fixtures (E1). Plain factories that take RTG (from test/load.js) and return
 * valid KickContexts at common situations, the §2.3.6 attribute profiles, and the
 * Monte-Carlo helpers shared by kick_model / kick_calibration / balance_report.
 *
 *   const kfx = require('./fixtures/kick');
 *   const ctx = kfx.fg45Calm(RTG);                          // 45-yd FG, calm, middle hash, pressure 0.15, rookie
 *   const ctx2 = kfx.ctx(RTG, {distance: 52, hash: 1, wind: {speed: 12, dir: 90}, attrs: kfx.profiles.elite});
 *   const pct = kfx.makeRate(RTG, kfx.profiles.elite, {distance: 45}, 20000, 7);   // AI-rule Monte Carlo
 *
 * Every context passes Schema.validate's KickContext checks and is JSON-safe.
 */
'use strict';

/** §2.3.6 profiles (ACC/CON/CLU/POW, KO added so the attrs object is complete). */
var profiles = {
  college: { POW: 58, ACC: 55, CON: 50, CLU: 50, KO: 50 },
  rookie: { POW: 62, ACC: 60, CON: 55, CLU: 55, KO: 55 },
  vet: { POW: 72, ACC: 78, CON: 75, CLU: 70, KO: 70 },
  elite: { POW: 82, ACC: 92, CON: 90, CLU: 88, KO: 80 }
};

/** §2.3.6 canonical table: bucket ranges and target make rates per profile (56–60 is asserted at ±6). */
var table = {
  buckets: [
    { key: '20-29', lo: 20, hi: 29, tol: 4 },
    { key: '30-39', lo: 30, hi: 39, tol: 4 },
    { key: '40-49', lo: 40, hi: 49, tol: 4 },
    { key: '50-55', lo: 50, hi: 55, tol: 4 },
    { key: '56-60', lo: 56, hi: 60, tol: 6 }
  ],
  targets: {
    college: { maxFG: 55.0, '20-29': 95, '30-39': 85, '40-49': 70, '50-55': 52, '56-60': 29 },
    rookie: { maxFG: 56.2, '20-29': 97, '30-39': 88, '40-49': 75, '50-55': 59, '56-60': 40 },
    vet: { maxFG: 59.3, '20-29': 99, '30-39': 96, '40-49': 87, '50-55': 74, '56-60': 61 },
    elite: { maxFG: 62.4, '20-29': 99.5, '30-39': 98, '40-49': 92, '50-55': 82, '56-60': 71 }
  },
  /** Harness conditions of §2.3.6: calm, middle hash, pressure 0.15, quality 0.85, aim N(0, 0.5°), Pro, no mods. */
  conditions: { pressure: 0.15, quality: 0.85, aimSd: 0.5, hash: 0, kicksPerCell: 30000 }
};

/** A copy of a profile in canonical key order (unknown name → rookie). */
function attrs(name) {
  var p = profiles[name] || profiles.rookie;
  return { POW: p.POW, ACC: p.ACC, CON: p.CON, CLU: p.CLU, KO: p.KO };
}

/** A kicker snapshot from attrs (+ overrides: form, mods, traits, foot, flags). */
function kicker(a, o) {
  o = o || {};
  var base = a && typeof a.ACC === 'number' ? a : attrs('rookie');
  return {
    attrs: { POW: base.POW, ACC: base.ACC, CON: base.CON, CLU: base.CLU, KO: base.KO !== undefined ? base.KO : base.CON },
    form: o.form || 0,
    mods: o.mods ? JSON.parse(JSON.stringify(o.mods)) : [],
    traits: o.traits ? o.traits.slice() : [],
    foot: o.foot === 'L' ? 'L' : 'R',
    flags: o.flags ? JSON.parse(JSON.stringify(o.flags)) : {}
  };
}

/**
 * A complete KickContext (§3.4) with overrides. Defaults: college FG, 40 yd, calm, middle hash, clear,
 * 70 °F, grass, pressure 0.15, Pro, user kick, rookie profile.
 * @param {object} RTG @param {object} [o] overrides (attrs, kicker, form, mods, traits, foot, flags, and any ctx field)
 * @returns {object} KickContext
 */
function ctx(RTG, o) {
  o = o || {};
  var T = RTG.Tuning.kick;
  var league = o.league === 'NFL' ? 'NFL' : 'COLLEGE';
  var type = o.type === 'PAT' || o.type === 'KO' ? o.type : 'FG';
  var distance = type === 'PAT' ? (league === 'NFL' ? T.distance.patNfl : T.distance.patCollege)
    : (o.distance !== undefined ? o.distance : 40);
  var hash = type === 'FG' && o.hash ? (o.hash < 0 ? -1 : 1) : 0;
  var ballX = hash * (league === 'NFL' ? T.hash.ballXNfl : T.hash.ballXCollege);
  var pressure = o.pressure !== undefined ? o.pressure : table.conditions.pressure;
  var dome = !!o.dome || o.weather === 'dome';
  var kk = o.kicker || kicker(o.attrs || attrs('rookie'), o);
  var c = {
    type: type, league: league, distance: distance, hash: hash, ballX: ballX,
    wind: o.wind ? { speed: o.wind.speed, dir: o.wind.dir } : { speed: 0, dir: 0 },
    weather: o.weather || (dome ? 'dome' : 'clear'), tempF: o.tempF !== undefined ? o.tempF : 70,
    surface: o.surface || (dome ? 'turf' : 'grass'), altitude: !!o.altitude, dome: dome,
    pressure: pressure, clutch: o.clutch !== undefined ? !!o.clutch : pressure >= T.pressure.clutchThreshold,
    decisive: !!o.decisive, iced: !!o.iced, playoff: !!o.playoff, rivalry: !!o.rivalry, away: !!o.away,
    asTimeExpires: !!o.asTimeExpires, ot: !!o.ot,
    oppST: o.oppST !== undefined ? o.oppST : T.defaults.oppST,
    isUser: o.isUser !== undefined ? !!o.isUser : true,
    difficulty: o.difficulty || 'pro',
    game: o.game || { q: 1, clock: RTG.Tuning.sim.clock.quarterSec, scoreFor: 0, scoreAgainst: 0, week: o.week || 1, oppId: o.oppId || null, teamId: o.teamId || null },
    kicker: kk
  };
  if (o.wind && typeof o.wind.gust === 'number') c.wind.gust = o.wind.gust;
  return c;
}

/** College PAT (20 yd), calm, college-average kicker, pressure 0.05. */
function patCollege(RTG, o) {
  return ctx(RTG, Object.assign({ type: 'PAT', league: 'COLLEGE', attrs: attrs('college'), pressure: 0.05 }, o || {}));
}

/** NFL PAT (33 yd), calm, rookie kicker, pressure 0.05. */
function patNfl(RTG, o) {
  return ctx(RTG, Object.assign({ type: 'PAT', league: 'NFL', attrs: attrs('rookie'), pressure: 0.05 }, o || {}));
}

/** 45-yd FG, calm, middle hash, pressure 0.15, rookie (the §2.3.6 harness situation). */
function fg45Calm(RTG, o) {
  return ctx(RTG, Object.assign({ distance: 45, attrs: attrs('rookie') }, o || {}));
}

/** 55-yd decisive NFL FG from the right hash, 14 mph left-to-right crosswind, Q4 0:04, down 2, vet kicker. */
function fg55WindyDecisive(RTG, o) {
  return ctx(RTG, Object.assign({
    league: 'NFL', distance: 55, hash: 1, wind: { speed: 14, dir: 90 }, attrs: attrs('vet'),
    pressure: 0.80, decisive: true, away: true, clutch: true,
    game: { q: 4, clock: 4, scoreFor: 20, scoreAgainst: 22, week: 12, oppId: null, teamId: null }
  }, o || {}));
}

/** 42-yd college FG in a snow game: 28 °F, 9 mph wind at 210°, turf, left hash, college-average kicker. */
function snowGame(RTG, o) {
  return ctx(RTG, Object.assign({
    league: 'COLLEGE', distance: 42, hash: -1, weather: 'snow', tempF: 28, surface: 'turf',
    wind: { speed: 9, dir: 210 }, attrs: attrs('college'), pressure: 0.25, week: 13
  }, o || {}));
}

/** Kickoff context (NFL by default). */
function kickoff(RTG, o) {
  return ctx(RTG, Object.assign({ type: 'KO', league: 'NFL', attrs: attrs('rookie'), pressure: 0.05 }, o || {}));
}

/** Every named context. */
function all(RTG) {
  return { patCollege: patCollege(RTG), patNfl: patNfl(RTG), fg45Calm: fg45Calm(RTG), fg55WindyDecisive: fg55WindyDecisive(RTG), snowGame: snowGame(RTG), kickoff: kickoff(RTG) };
}

/**
 * The §2.3.6 harness input for one kick: AI power rule + N(0, 0.02), aim N(0, aimSd) (plus the AI wind
 * compensation when the context has wind), fixed quality. Draws: power gauss 2 · aim gauss 2.
 * @param {object} RTG @param {object} rng @param {object} model Kick.model(ctx, attrs) @param {object} [c] {quality, aimSd, ACC}
 * @returns {{power:number, aim:number, quality:number}}
 */
function harnessInput(RTG, rng, model, c) {
  c = c || {};
  var A = RTG.Tuning.kick.ai;
  var power = RTG.Kick.aiPower(model.pNeed) + rng.gauss(0, A.powerSd);
  var comp = c.ACC !== undefined ? -model.windDriftDeg * RTG.Kick.aiWindComp(c.ACC) : 0;
  var aim = comp + rng.gauss(0, c.aimSd !== undefined ? c.aimSd : table.conditions.aimSd);
  return { power: power, aim: aim, quality: c.quality !== undefined ? c.quality : table.conditions.quality };
}

/**
 * Monte-Carlo make rate (%) for a profile over `n` kicks at one distance (or uniformly over
 * integer distances lo..hi when `o.lo`/`o.hi` are given). Harness conditions unless overridden in `o`
 * ({quality, aimSd, pressure, hash, wind, league, isUser, difficulty, ...ctx overrides}).
 * @param {object} RTG @param {object} a attrs @param {object} o @param {number} n kicks @param {number} seed
 * @returns {number} percentage made
 */
function makeRate(RTG, a, o, n, seed) {
  o = o || {};
  var rng = RTG.RNG.create(seed === undefined ? 1 : seed);
  var Kick = RTG.Kick;
  var cache = {};
  var made = 0;
  for (var i = 0; i < n; i++) {
    var D = o.lo !== undefined ? rng.int(o.lo, o.hi) : o.distance;
    var cell = cache[D];
    if (!cell) {
      var c = ctx(RTG, Object.assign({}, o, { distance: D, attrs: a, isUser: o.isUser !== undefined ? o.isUser : false }));
      cell = cache[D] = { ctx: c, model: Kick.model(c, a) };
    }
    var input = harnessInput(RTG, rng, cell.model, { quality: o.quality, aimSd: o.aimSd, ACC: cell.ctx.wind.speed ? a.ACC : undefined });
    if (Kick.resolve(rng, cell.ctx, null, input).made) made++;
  }
  return made / n * 100;
}

/** The whole §2.3.6 table by Monte Carlo: {profile: {bucketKey: pct}}. */
function measureTable(RTG, kicksPerCell, seed) {
  var out = {};
  var s = seed === undefined ? 1 : seed;
  Object.keys(profiles).forEach(function (name) {
    out[name] = {};
    table.buckets.forEach(function (b) {
      out[name][b.key] = makeRate(RTG, profiles[name], { lo: b.lo, hi: b.hi }, kicksPerCell, s++);
    });
  });
  return out;
}

module.exports = {
  profiles: profiles, table: table, attrs: attrs, kicker: kicker, ctx: ctx,
  patCollege: patCollege, patNfl: patNfl, fg45Calm: fg45Calm, fg55WindyDecisive: fg55WindyDecisive, snowGame: snowGame, kickoff: kickoff, all: all,
  harnessInput: harnessInput, makeRate: makeRate, measureTable: measureTable
};
