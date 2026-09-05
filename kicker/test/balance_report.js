#!/usr/bin/env node
/**
 * Balance report (E1) — prints the §2.3.6 calibration table as measured by Monte Carlo and the
 * season-level AI make rates of §2.3.6 / §2.13 under a realistic NFL mix of distances, wind, hash
 * and pressure (checked-in output lives in README.md after the final balance pass).
 *
 *   node kicker/test/balance_report.js            # full: 30k kicks per table cell, 40k attempts per profile
 *   node kicker/test/balance_report.js --fast     # 6k / 8k
 *   node kicker/test/balance_report.js --json     # machine-readable
 *
 * Season mix (approximates Sim §2.5.2/§2.5.3/§2.5.6 without the Sim module):
 *   · stall distance D = clamp(round(N(25, 12)), 1, 50) + 17; decisive drills D ≈ N(41, 8) + 0
 *   · coach attempts when D ≤ maxFG + 3 and Kick.model(ctx).pMake ≥ 0.40 (trust 50, agg 0.5);
 *     end-of-half kicks (5 %) need only 0.20 − 0.35 → 0.15; decisive drills (4 %) need 0.15
 *   · 20 % of games in domes; otherwise Weather.forGame for a climate mix (warm .3 / temperate .4 / cold .3),
 *     month mix (Sep–Dec), windy venues 25 %, turf 40 %; per-kick wind via Weather.perKick
 *   · hash 40/20/40 · away 50 % · late 18 % · playoff 6 % · rivalry 35 % (division games)
 *   · inputs from Kick.aiInput (the full AI rule, quality N(0.80 + 0.15·CON/99, 0.06))
 */
'use strict';
const DEFAULT_RTG = require('./load')();
const kfx = require('./fixtures/kick');

const args = process.argv.slice(2);
const FAST = args.includes('--fast');
const JSON_OUT = args.includes('--json');

/** §2.13 season-level bands (FG %). "rookie" is the first NFL season of a drafted kicker (OVR ≈ 66–70, §2.1.2). */
const SEASON_BANDS = { rookie: [78, 83], draftedRookie: [78, 83], vet: [84, 88], elite: [89, 93] };
const DRAFTED_ROOKIE = { POW: 70, ACC: 68, CON: 64, CLU: 62, KO: 66 };   // OVR 67
const PAT_BANDS = { NFL: [93, 97], COLLEGE: [98, 100] };

const MIX = {
  domeShare: 0.20, climates: [['warm', 0.3], ['temperate', 0.4], ['cold', 0.3]], months: [[2, 0.22], [6, 0.22], [11, 0.28], [16, 0.28]],
  windyShare: 0.25, turfShare: 0.40, hash: { L: 0.40, M: 0.20, R: 0.40 },
  away: 0.5, late: 0.18, decisive: 0.04, asTimeExpires: 0.05, playoff: 0.06, rivalry: 0.35,
  stall: { mean: 25, sd: 12, min: 1, max: 50 }, drill: { mean: 41, sd: 8 },
  trust01: 0.5, coachAgg: 0.5
};

function pickWeighted(rng, pairs) {
  return rng.weighted(pairs, (p) => p[1])[0];
}

/** One game environment (weather object as GameState.weather). */
function gameEnv(rng, league, rtg) {
  const RTG = rtg || DEFAULT_RTG;
  const Weather = RTG.Weather, T = RTG.Tuning;
  if (rng.chance(MIX.domeShare)) return { weather: 'dome', tempF: 70, wind: { speed: 0, dir: 0 }, surface: 'turf', altitude: false, dome: true };
  const climate = pickWeighted(rng, MIX.climates);
  const week = pickWeighted(rng, MIX.months);
  const venue = { climate, dome: false, windy: rng.chance(MIX.windyShare), surface: rng.chance(MIX.turfShare) ? 'turf' : 'grass', altitude: false };
  return Weather.forGame(rng, venue, week, league, T.difficulty.pro.windCap);
}

/** Pressure from sampled flags with the §2.3.7 constants (AI kicker: no streak/fans/mods/difficulty terms). */
function pressureFor(flags, D, T) {
  const P = T.kick.pressure;
  const p = P.base + (flags.late ? P.late : 0) + (flags.decisive ? P.decisive : 0) + (flags.asTimeExpires ? P.asTimeExpires : 0)
    + (flags.playoff ? P.playoff : 0) + (flags.rivalry ? P.rivalry : 0) + (flags.away ? P.away : 0) + (D >= P.longDistFrom ? P.longDist : 0);
  return Math.min(1, Math.max(0, p));
}

/** Coach threshold (§2.5.6) for the sampled situation. */
function coachThreshold(league, flags, T) {
  const C = T.sim.coach;
  if (flags.decisive) return T.sim.script.fourthDownPMake;
  let thr = C.thrBase - C.trustW * MIX.trust01 - C.aggW * MIX.coachAgg + (league === 'COLLEGE' ? C.collegeAdd : 0) - (flags.asTimeExpires ? C.asTimeExpiresSub : 0);
  return Math.min(C.thrMax, Math.max(C.thrMin, thr));
}

function bucketOf(D) { return D < 30 ? '<30' : D < 40 ? '30-39' : D < 50 ? '40-49' : '50+'; }

/**
 * Season-level make rate for a profile: `n` attempted FGs (+ n/2 PATs) under the realistic mix.
 * @param {Object} attrs @param {'NFL'|'COLLEGE'} league @param {number} n attempts @param {number} seed
 * @param {Object} [rtg] an RTG namespace to use instead of this module's (tuning scans)
 * @returns {{fgPct:number, fga:number, byBucket:Object, shares:Object, declined:number, patPct:number, avgD:number}}
 */
function seasonMix(attrs, league, n, seed, rtg) {
  const RTG = rtg || DEFAULT_RTG;
  const Kick = RTG.Kick, Weather = RTG.Weather, T = RTG.Tuning;
  const rng = RTG.RNG.create(seed);
  const tally = { fga: 0, fgm: 0, declined: 0, sumD: 0, pat: 0, patMade: 0, byBucket: {} };
  for (const b of ['<30', '30-39', '40-49', '50+']) tally.byBucket[b] = { a: 0, m: 0 };
  let env = gameEnv(rng, league, RTG), kicksInGame = 0;
  while (tally.fga < n) {
    if (++kicksInGame > 4) { env = gameEnv(rng, league, RTG); kicksInGame = 0; }     // ≈ 4 kicks per game environment
    const flags = {
      decisive: rng.chance(MIX.decisive), playoff: rng.chance(MIX.playoff), rivalry: rng.chance(MIX.rivalry), away: rng.chance(MIX.away)
    };
    flags.asTimeExpires = !flags.decisive && rng.chance(MIX.asTimeExpires);
    flags.late = flags.decisive || rng.chance(MIX.late);
    const D = flags.decisive
      ? Math.max(18, Math.round(rng.gauss(MIX.drill.mean, MIX.drill.sd)))
      : Math.max(MIX.stall.min, Math.min(MIX.stall.max, Math.round(rng.gauss(MIX.stall.mean, MIX.stall.sd)))) + T.kick.distance.losToKick;
    const hashKey = pickWeighted(rng, [['L', MIX.hash.L], ['M', MIX.hash.M], ['R', MIX.hash.R]]);
    const wind = Weather.perKick(rng, env);
    const ctx = kfx.ctx(RTG, {
      league, distance: D, hash: hashKey === 'L' ? -1 : hashKey === 'R' ? 1 : 0, wind,
      weather: env.weather, tempF: env.tempF, surface: env.surface, dome: env.dome, altitude: env.altitude,
      pressure: pressureFor(flags, D, T), decisive: flags.decisive, asTimeExpires: flags.asTimeExpires, playoff: flags.playoff,
      rivalry: flags.rivalry, away: flags.away, attrs, isUser: false
    });
    const m = Kick.model(ctx, attrs);
    if (D > m.maxFG + T.sim.coach.rangeMargin || m.pMake < coachThreshold(league, flags, T)) { tally.declined++; continue; }
    const res = Kick.resolve(rng, ctx, null, Kick.aiInput(rng, ctx, attrs, m), { auto: true });
    tally.fga++; tally.sumD += D;
    const b = tally.byBucket[bucketOf(D)]; b.a++;
    if (res.made) { tally.fgm++; b.m++; }
    if (tally.fga % 2 === 0) {                                                       // ≈ 1 PAT per 2 FGA
      const pctx = kfx.ctx(RTG, {
        type: 'PAT', league, wind: Weather.perKick(rng, env), weather: env.weather, tempF: env.tempF, surface: env.surface, dome: env.dome,
        pressure: pressureFor({ away: rng.chance(MIX.away), late: rng.chance(MIX.late) }, 0, T), attrs, isUser: false
      });
      tally.pat++;
      if (Kick.resolve(rng, pctx, null, Kick.aiInput(rng, pctx, attrs), { auto: true }).made) tally.patMade++;
    }
  }
  const shares = {}, byBucket = {};
  for (const b of Object.keys(tally.byBucket)) {
    const x = tally.byBucket[b];
    shares[b] = x.a / tally.fga * 100;
    byBucket[b] = { a: x.a, m: x.m, pct: x.a ? x.m / x.a * 100 : 0 };
  }
  return { fgPct: tally.fgm / tally.fga * 100, fga: tally.fga, byBucket, shares, declined: tally.declined / (tally.declined + tally.fga) * 100, patPct: tally.patMade / tally.pat * 100, avgD: tally.sumD / tally.fga };
}

function fmt(x, d) { return (typeof x === 'number' ? x.toFixed(d === undefined ? 1 : d) : String(x)); }

function main() {
  const RTG = DEFAULT_RTG;
  const Kick = RTG.Kick, T = RTG.Tuning;
  const cells = FAST ? 6000 : kfx.table.conditions.kicksPerCell;
  const attempts = FAST ? 8000 : 40000;
  const t0 = Date.now();
  const table = kfx.measureTable(RTG, cells, 1);
  const seasons = {};
  const league = 'NFL';
  for (const name of ['rookie', 'vet', 'elite']) seasons[name] = seasonMix(kfx.profiles[name], league, attempts, 4242);
  // a drafted rookie per §2.1.2 ("OVR ≈ 66–70 by draft"), the NFL league-average kicker (anchor 74) and the college anchor (52 + 4·3)
  seasons.draftedRookie = seasonMix(DRAFTED_ROOKIE, league, attempts, 4245);
  seasons.nflAverage = seasonMix({ POW: 74, ACC: 74, CON: 74, CLU: 74, KO: 74 }, league, attempts, 4243);
  seasons.collegeAverage = seasonMix(kfx.profiles.college, 'COLLEGE', attempts, 4244);
  seasons.collegeLeagueAvg = seasonMix({ POW: 64, ACC: 64, CON: 64, CLU: 64, KO: 64 }, 'COLLEGE', attempts, 4246);
  const elapsed = Date.now() - t0;

  if (JSON_OUT) {
    console.log(JSON.stringify({ tuning: { sigma: T.kick.sigma, shank: T.kick.shank, contact: T.kick.contact, ai: T.kick.ai }, table, targets: kfx.table.targets, seasons, elapsedMs: elapsed }, null, 2));
    return;
  }
  const B = kfx.table.buckets;
  console.log('ROAD TO GLORY: KICKER — balance report (' + cells + ' kicks/cell, ' + attempts + ' attempts/profile)');
  console.log('σ_base = ' + T.kick.sigma.base + ' + ' + T.kick.sigma.spread + '·(1 − s)²   σ_dist = 1 + ' + T.kick.sigma.distPerYd + '·max(0, D − ' + T.kick.sigma.distFrom + ')   contact ' + T.kick.contact.degPerQuality + '°/quality   shank ' + T.kick.shank.base + ' − ' + T.kick.shank.perCon + '·CON\n');
  console.log('§2.3.6 table — measured / target (calm, middle hash, pressure 0.15, AI power, quality 0.85, aim N(0, 0.5°))');
  console.log('profile    maxFG σ_base' + B.map((b) => b.key.padStart(11)).join(''));
  for (const name of Object.keys(table)) {
    const a = kfx.profiles[name];
    let line = name.padEnd(10) + fmt(Kick.maxFG(a.POW, null)).padStart(6) + fmt(Kick.sigmaBase(a, 0), 2).padStart(7);
    for (const b of B) {
      const got = table[name][b.key], want = kfx.table.targets[name][b.key];
      line += (fmt(got) + '/' + want + (Math.abs(got - want) > b.tol ? '!' : ' ')).padStart(11);
    }
    console.log(line);
  }
  console.log('\nSeason-level AI make rates (realistic NFL mix: stall distances + coach decision, weather/wind, hash 40/20/40, pressure mix, Kick.aiInput)');
  console.log('profile         FG%   band     FGA  avgD  declined%   <30   30-39  40-49   50+   shares(<30/30s/40s/50+)   PAT%  band');
  for (const name of Object.keys(seasons)) {
    const s = seasons[name];
    const band = SEASON_BANDS[name];
    const lg = /^college/.test(name) ? 'COLLEGE' : 'NFL';
    const inBand = band ? (s.fgPct >= band[0] && s.fgPct <= band[1] ? ' ok' : ' !!') : '   ';
    const patBand = PAT_BANDS[lg];
    const patOk = s.patPct >= patBand[0] && s.patPct <= patBand[1] ? ' ok' : ' !!';
    console.log(name.padEnd(14) + fmt(s.fgPct).padStart(6) + (band ? (' ' + band[0] + '-' + band[1]).padEnd(8) : '        ') + inBand
      + String(s.fga).padStart(6) + fmt(s.avgD).padStart(6) + fmt(s.declined).padStart(10)
      + ['<30', '30-39', '40-49', '50+'].map((b) => fmt(s.byBucket[b].pct).padStart(7)).join('')
      + ('   ' + ['<30', '30-39', '40-49', '50+'].map((b) => fmt(s.shares[b], 0)).join('/')).padEnd(27)
      + fmt(s.patPct).padStart(6) + (' ' + patBand[0] + '-' + patBand[1]).padEnd(8) + patOk);
  }
  console.log('\nbands: rookie 78–83 · vet 84–88 · elite 89–93 · PAT NFL 93–97 · college PAT ≥ 98 (§2.3.6, §2.13). ' + (elapsed / 1000).toFixed(1) + ' s');
  console.log('note: "rookie" is the §2.3.6 NFL-rookie TABLE profile (60/55/55/62, OVR ≈ 58): its own table targets (75 % at 40–49, 59 % at 50–55) put it below the 78–83 season band by construction;');
  console.log('      the season-level "rookie" band applies to a drafted rookie (OVR ≈ 66–70 per §2.1.2) — the draftedRookie row. PAT bands are league-level (nflAverage / collegeLeagueAvg rows).');
}

if (require.main === module) main();
module.exports = { seasonMix, gameEnv, MIX, SEASON_BANDS, PAT_BANDS, DRAFTED_ROOKIE };
