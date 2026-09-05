/**
 * RTG.Kick — geometry, range, error model, AI input, resolve (draw order, golden vector, forced
 * outcomes), feedback, kickoffs, buildContext/pressure, pMakeAt (§2.3, §2.4, §3.4, §3.5.8, §5.1 "kick").
 *   node kicker/test/kick.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RTG = require('./load')();
const kfx = require('./fixtures/kick');
const pfx = require('./fixtures/player');
const Kick = RTG.Kick, Tuning = RTG.Tuning, Schema = RTG.Schema;
const T = Tuning.kick, G = T.geometry;
const DEG = 180 / Math.PI;

/** Realm-agnostic deep copy (engine objects live in a vm context). */
const J = (o) => JSON.parse(JSON.stringify(o));
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ': expected ' + b + ' ±' + tol + ', got ' + a);

const hasData = !!(RTG.Data && Array.isArray(RTG.Data.colleges) && RTG.Data.colleges.length && Array.isArray(RTG.Data.nfl) && RTG.Data.nfl.length);
const dataNote = 'state fixtures need data/colleges.js + data/nfl.js (E2)';

/** RNG that counts its draws. */
function counting(seed) {
  const r = RTG.RNG.create(seed);
  const next = r.next.bind(r);
  r.draws = 0;
  r.next = () => { r.draws++; return next(); };
  return r;
}

/** RNG that first returns scripted uniforms (then real draws); counts draws. */
function scripted(values) {
  const r = counting(1);
  const real = r.next;
  let i = 0;
  r.next = () => (i < values.length ? (r.draws++, values[i++]) : real());
  return r;
}

const P = kfx.profiles;
/** aim (deg) that puts the ball at lateral x from the middle at distance D with zero error. */
const aimForX = (x, D) => Math.atan2(x, D) * DEG;

// ═══════════════════════════════ GEOMETRY & RANGE (§2.3.1, §2.3.2) ═══════════════════════════════

test('maxFG at POW 40/55/62/72/82/90/99 → 49.4/54.1/56.2/59.3/62.4/64.9/67.7 (±0.05, neutral context)', () => {
  const want = { 40: 49.4, 55: 54.1, 62: 56.2, 72: 59.3, 82: 62.4, 90: 64.9, 99: 67.7 };
  // §2.3.2 prints one decimal: POW 55 is exactly 54.05 (→ "54.1"), so the table values get ±0.051; the §5.1 four are ±0.05
  for (const pow of Object.keys(want)) near(Kick.maxFG(+pow, null), want[pow], [40, 62, 82, 99].indexOf(+pow) >= 0 ? 0.05 : 0.051, 'POW ' + pow);
  near(Kick.maxFG(55, null), T.range.base + T.range.perPow * 55, 1e-9, 'exact closed form');
  const profileMax = { college: 55.0, rookie: 56.2, vet: 59.3, elite: 62.4 };
  for (const n of Object.keys(profileMax)) near(Kick.maxFG(P[n].POW, kfx.ctx(RTG, { attrs: P[n] })), profileMax[n], 0.05, n);
});

test('carryMax, Rneed and h(D) closed forms are mutually consistent (crossbar at KCB)', () => {
  near(Kick.carryMax(60), 65.4, 0.05, 'carryMax(60)');
  assert.ok(Math.abs(Kick.carryMax(60) - 3600 / (60 - T.range.KCB)) < 1e-9);
  assert.ok(Math.abs(Kick.rneed(45) - 2025 / (45 - T.range.KCB)) < 1e-9);
  assert.ok(Math.abs(Kick.rneed(3) - Kick.rneed(T.range.rneedMinD)) < 1e-9, 'tiny D treated as 8 yd');
  for (let D = 18; D <= 65; D++) {
    near(Kick.heightAt(D, Kick.rneed(D)), G.XBAR, 0.002, 'h at Rneed, D=' + D);   // tan34·KCB = XBAR
    near(Kick.heightAt(D, Kick.carryMax(D)), G.XBAR, 0.002, 'full power at maxFG=' + D + ' just clears');
  }
  assert.ok(Math.abs(Kick.heightAt(45, 60) - 0.6745 * 45 * (1 - 45 / 60)) < 1e-9);
  assert.ok(Kick.heightAt(50, 40) < 0, 'ball lands before the goal plane');
  assert.equal(Kick.heightAt(40, 0), -40);
  near(Kick.flightTime(25), 1.65, 1e-9); near(Kick.flightTime(45), 2.17, 1e-9); near(Kick.flightTime(60), 2.56, 1e-9);
  assert.equal(Kick.peff(1, 1), 1);
  near(Kick.peff(1, 0), 0.92, 1e-12);
  near(Kick.peff(0.9, 0.5), 0.9 * 0.96, 1e-12);
  assert.equal(Kick.distanceFor(28), 45);
});

test('PAT distance by league, ball offsets, hash target angle (college R hash @ 30 yd = −12.53°)', () => {
  assert.equal(Kick.patDistance('COLLEGE'), 20);
  assert.equal(Kick.patDistance('NFL'), 33);
  assert.equal(Kick.buildContext(null, null, { type: 'PAT', league: 'NFL', isUser: false, attrs: P.rookie }).distance, 33);
  assert.equal(Kick.buildContext(null, null, { type: 'PAT', league: 'COLLEGE', isUser: false, attrs: P.rookie }).distance, 20);
  assert.equal(Kick.buildContext(null, null, { type: 'PAT', league: 'NFL', isUser: false, attrs: P.rookie, hash: 1 }).hash, 0, 'PATs are from the middle');
  assert.equal(Kick.ballXFor('NFL', 1), 3.083); assert.equal(Kick.ballXFor('NFL', -1), -3.083);
  assert.equal(Kick.ballXFor('COLLEGE', 1), 6.667); assert.equal(Kick.ballXFor('COLLEGE', 0), 0);
  near(Kick.targetDeg(6.667, 30), -12.53, 0.01, 'college R hash @ 30');
  near(Kick.targetDeg(6.667, 30), Math.atan2(-6.667, 30) * DEG, 1e-12);
  near(Kick.targetDeg(-3.083, 40), 4.408, 0.005, 'NFL L hash @ 40');
  assert.equal(Kick.targetDeg(0, 40), 0);
  const w = Kick.windowDeg(kfx.ctx(RTG, { league: 'COLLEGE', distance: 30, hash: 1 }));
  near(w.left, -5.47, 0.01); near(w.right, 5.72, 0.01);
});

test('range modifiers: weather, temperature (outdoors only), altitude, traits, wind along, mods', () => {
  const base = Kick.maxFG(62, kfx.ctx(RTG, { attrs: P.rookie }));
  const mk = (o) => Kick.maxFG(62, kfx.ctx(RTG, Object.assign({ attrs: P.rookie }, o)));
  near(mk({ weather: 'rain' }) / base, 0.97, 1e-9, 'rain');
  near(mk({ weather: 'snow' }) / base, 0.93, 1e-9, 'snow');
  near(mk({ weather: 'heat', tempF: 92 }) / base, 1.01, 1e-9, 'heat');
  near(mk({ weather: 'cold', tempF: 30 }) / base, 0.95 * (1 - 0.002 * 10), 1e-9, 'cold at 30 °F');
  near(mk({ weather: 'clear', tempF: 20 }) / base, 1 - 0.002 * 20, 1e-9, 'clear but freezing');
  near(mk({ weather: 'dome', tempF: 20 }) / base, 1, 1e-9, 'no temperature penalty in a dome');
  near(mk({ altitude: true }) / base, 1.03, 1e-9, 'altitude');
  near(mk({ traits: ['BIG_LEG'] }) - base, 2, 1e-9, 'BIG_LEG +2');
  near(mk({ traits: ['DOME_BABY'] }) - base, -1, 1e-9, 'DOME_BABY −1 outdoors');
  near(mk({ traits: ['DOME_BABY'], weather: 'dome' }) - base, 0, 1e-9, 'DOME_BABY neutral indoors');
  near(mk({ wind: { speed: 20, dir: 0 } }) - base, 6, 1e-9, '20 mph tailwind +6 yd');
  near(mk({ wind: { speed: 20, dir: 180 } }) - base, -6, 1e-9, '20 mph headwind −6 yd');
  near(mk({ wind: { speed: 20, dir: 90 } }) - base, 0, 1e-9, 'pure crosswind adds nothing');
  const snowCold = mk({ weather: 'snow', tempF: 30 }) / base;
  near(mk({ weather: 'snow', tempF: 30, traits: ['COLD_WEATHER'] }) / base, 1 - (1 - snowCold) / 2, 1e-9, 'COLD_WEATHER halves the penalty');
  near(mk({ mods: [pfx.mod({ key: 'range', op: 'mul', value: 1.05 })] }) / base, 1.05, 1e-9, 'range mul mod');
  near(mk({ mods: [pfx.mod({ key: 'range', op: 'add', value: 3 })] }) - base, 3, 1e-9, 'range add mod');
  assert.equal(Kick.modValue([{ key: 'range', op: 'add', value: 2 }, { key: 'range', op: 'add', value: 1 }, { key: 'sigma', op: 'mul', value: 9 }], 'range', 'add'), 3);
  assert.equal(Kick.modValue(null, 'sigma', 'mul'), 1);
});

// ═══════════════════════════════ ERROR MODEL (§2.3.3) ═══════════════════════════════

test('σ_base at the four profiles: 2.975 / 2.720 / 2.031 / 1.780 (±0.01) before multipliers (fitted constants 1.746 + 5.82·(1 − s)²; spec 3.07/2.80/2.09/1.84 at 1.8 + 6.0); form shifts ACC', () => {
  near(Kick.sigmaBase(P.college, 0), 2.975, 0.01, 'college');
  near(Kick.sigmaBase(P.rookie, 0), 2.720, 0.01, 'rookie');
  near(Kick.sigmaBase(P.vet, 0), 2.031, 0.01, 'vet');
  near(Kick.sigmaBase(P.elite, 0), 1.780, 0.01, 'elite');
  near(T.sigma.base / 1.8, T.sigma.spread / 6.0, 1e-9, 'the fit is a uniform rescale of the spec constants (shape of the (1 − s)² law kept)');
  const s = (acc, con) => T.sigma.base + T.sigma.spread * Math.pow(1 - (0.7 * acc + 0.3 * con) / 99, 2);
  near(Kick.sigmaBase(P.rookie, 6), s(66, 55), 1e-12, 'form +6');
  near(Kick.sigmaBase({ ACC: 97, CON: 90 }, 6), s(99, 90), 1e-12, 'ACC_eff clamps at 99');
  assert.ok(Kick.sigmaBase(P.rookie, -6) > Kick.sigmaBase(P.rookie, 0));
  // σ before multipliers on a neutral context equals sigmaBase
  const ctx = kfx.ctx(RTG, { distance: 30, pressure: 0, attrs: P.rookie, isUser: false });
  near(Kick.sigmaFor(ctx, { power: 0.8 }), Kick.sigmaBase(P.rookie, 0), 1e-12);
});

test('σ multipliers: distance, pressure (CLU, ICE_VEINS), weather (turf, COLD_WEATHER), hash, power, overswing ×1.375 @ 1.15, slump, traits, hesitation, difficulty', () => {
  const parts = (o, input) => Kick.sigmaParts(kfx.ctx(RTG, Object.assign({ pressure: 0, attrs: P.rookie, isUser: false }, o)), input || { power: 0.8 });
  near(parts({ distance: 50 }).dist, 1.18, 1e-9); near(parts({ distance: 58 }).dist, 1.324, 1e-9, '58 yd: 1 + 0.018·18 (§2.3.3 prints ×1.32)'); assert.equal(parts({ distance: 30 }).dist, 1);
  near(parts({ pressure: 1, attrs: { POW: 60, ACC: 60, CON: 60, CLU: 50, KO: 60 } }).press, 1.5, 1e-9, 'CLU 50 at p=1');
  near(parts({ pressure: 1, attrs: { POW: 60, ACC: 60, CON: 60, CLU: 95, KO: 60 } }).press, 1.14, 1e-9, 'CLU 95 at p=1');
  near(parts({ pressure: 1, attrs: { POW: 60, ACC: 60, CON: 60, CLU: 50, KO: 60 }, traits: ['ICE_VEINS'] }).press, 1 + 0.5 * 0.85, 1e-9, 'ICE_VEINS');
  near(parts({ weather: 'rain' }).weather, 1.12, 1e-9); near(parts({ weather: 'snow' }).weather, 1.25, 1e-9);
  near(parts({ weather: 'snow', surface: 'turf' }).weather, 1.25 * 1.04, 1e-9, 'turf + snow');
  near(parts({ weather: 'rain', surface: 'turf' }).weather, 1.12 * 1.04, 1e-9, 'turf + rain');
  near(parts({ weather: 'clear', surface: 'turf' }).weather, 1, 1e-9, 'turf alone is neutral');
  near(parts({ weather: 'cold', tempF: 30 }).weather, 1.06, 1e-9);
  near(parts({ weather: 'cold', tempF: 30, traits: ['COLD_WEATHER'] }).weather, 1.03, 1e-9, 'COLD_WEATHER halves the excess');
  near(parts({ weather: 'snow', surface: 'turf', traits: ['COLD_WEATHER'] }).weather, 1 + (1.25 * 1.04 - 1) / 2, 1e-9);
  near(parts({ weather: 'heat', tempF: 95 }).weather, 1.02, 1e-9);
  assert.equal(parts({ hash: 0 }).hash, 1); near(parts({ league: 'NFL', hash: 1 }).hash, 1.03, 1e-9); near(parts({ league: 'COLLEGE', hash: -1 }).hash, 1.08, 1e-9);
  near(parts({}, { power: 0.9 }).power, 1.01, 1e-9); near(parts({}, { power: 1.0 }).power, 1.02, 1e-9); assert.equal(parts({}, { power: 0.7 }).power, 1);
  near(parts({}, { power: 1.15 }).over, 1.375, 1e-9, 'overswing σ ×1.375 at 1.15'); assert.equal(parts({}, { power: 1.0 }).over, 1);
  near(parts({ flags: { SLUMP: true } }).mods, 1.12, 1e-9, 'slump');
  near(parts({ traits: ['BIG_LEG'] }).mods, 1.04, 1e-9);
  near(parts({ traits: ['DOME_BABY'], weather: 'dome' }).mods, 0.97, 1e-9); assert.equal(parts({ traits: ['DOME_BABY'] }).mods, 1);
  near(parts({ mods: [pfx.mod({ key: 'sigma', op: 'mul', value: 1.1 }), pfx.mod({ key: 'sigma', op: 'mul', value: 1.2 })] }).mods, 1.32, 1e-9, 'sigma mods multiply');
  near(parts({ attrs: { POW: 60, ACC: 60, CON: 60, CLU: 60, KO: 60 } }, { power: 0.8, holdMs: 1700 }).hesitation, 0.75, 1e-9, '+0.15° per 100 ms beyond 1.2 s');
  assert.equal(parts({ attrs: { POW: 60, ACC: 60, CON: 60, CLU: 70, KO: 60 } }, { power: 0.8, holdMs: 1700 }).hesitation, 0, 'no hesitation penalty at CLU ≥ 70');
  assert.equal(parts({ attrs: { POW: 60, ACC: 60, CON: 60, CLU: 60, KO: 60 } }, { power: 0.8, holdMs: 1200 }).hesitation, 0);
  for (const d of ['rookie', 'pro', 'allpro', 'legend']) {
    assert.equal(parts({ isUser: true, difficulty: d }).diff, Tuning.difficulty[d].sigmaMult, 'user ' + d);
    assert.equal(parts({ isUser: false, difficulty: d }).diff, 1, 'AI ' + d);
  }
  const p = parts({ distance: 52, pressure: 0.4, weather: 'rain', league: 'NFL', hash: 1, isUser: true, difficulty: 'legend' }, { power: 1.1, holdMs: 1500 });
  near(p.total, p.base * p.dist * p.press * p.weather * p.hash * p.power * p.over * p.mods * p.diff + p.hesitation, 1e-12, 'total is the product plus hesitation');
});

test('shank tail: pShank = clamp(0.05 − 0.0004·CON, 0.005, 0.06); 3σ mixture shows in the tails; rate by CON in resolve', () => {
  near(Kick.pShank(50), 0.03, 1e-12); near(Kick.pShank(90), 0.014, 1e-12); near(Kick.pShank(0), 0.05, 1e-12);
  assert.equal(Kick.pShank(200), 0.005);
  for (const [CON, want] of [[50, 0.03], [90, 0.014]]) {
    const attrs = { POW: 62, ACC: 60, CON, CLU: 55, KO: 55 };
    const ctx = kfx.ctx(RTG, { distance: 40, attrs, isUser: false });
    const rng = RTG.RNG.create(CON);
    let shanks = 0;
    const n = 40000;
    for (let i = 0; i < n; i++) if (Kick.resolve(rng, ctx, null, { power: 0.9, aim: 0, quality: 0.85 }).shank) shanks++;
    near(shanks / n, want, 0.004, 'shank rate CON ' + CON);
  }
});

test('overswing bias by foot, wind drift sign & magnitude (15 mph @ 45 yd = 1.77 yd), block probability bounds & allOut bump', () => {
  near(Kick.overBias(1.15, 'R'), 1.2, 1e-12); near(Kick.overBias(1.15, 'L'), -1.2, 1e-12);
  assert.equal(Kick.overBias(1.0, 'R'), 0); assert.equal(Kick.overBias(0.9, 'L'), 0); near(Kick.overBias(1.075, 'R'), 0.6, 1e-12);
  const wd = (wind, D, o) => Kick.windDrift(kfx.ctx(RTG, Object.assign({ distance: D, wind }, o || {})));
  near(wd({ speed: 15, dir: 90 }, 45).yd, 1.77, 0.01, '15 mph crosswind @ 45');
  assert.ok(wd({ speed: 15, dir: 90 }, 45).yd > 0, '+dir (90°) pushes right');
  assert.ok(wd({ speed: 15, dir: 270 }, 45).yd < 0, '270° pushes left');
  near(wd({ speed: 15, dir: 0 }, 45).yd, 0, 1e-9, 'tailwind: no lateral drift'); near(wd({ speed: 15, dir: 0 }, 45).along, 15, 1e-9);
  near(wd({ speed: 15, dir: 90 }, 45, { mods: [pfx.mod({ key: 'windDrift', op: 'mul', value: 2 })] }).yd, 2 * wd({ speed: 15, dir: 90 }, 45).yd, 1e-9, 'windDrift mod');
  near(wd({ speed: 15, dir: 90, gust: 1.2 }, 45).yd, 1.2 * wd({ speed: 15, dir: 90 }, 45).yd, 1e-9, 'Legend gust multiplier');
  near(wd({ speed: 15, dir: 90 }, 45).deg, Math.atan2(wd({ speed: 15, dir: 90 }, 45).yd, 45) * DEG, 1e-12);
  const pb = (o, peff, maxFG) => Kick.pBlock(kfx.ctx(RTG, Object.assign({ distance: 40, attrs: P.rookie }, o)), peff === undefined ? 0.9 : peff, maxFG === undefined ? 56.2 : maxFG);
  near(pb({}), 0.006 + 0.00015 * 10 - 0.00008 * 5, 1e-12, 'default: oppST 70, CON 55');
  assert.equal(pb({ oppST: 0, attrs: { POW: 62, ACC: 60, CON: 99, CLU: 55, KO: 55 } }), T.block.min, 'lower bound 0.2 %');
  assert.equal(pb({ mods: [pfx.mod({ key: 'block', op: 'add', value: 1 })] }), T.block.max, 'upper bound 15 %');
  near(pb({ decisive: true }) - pb({}), 0.03, 1e-12, 'allOut bump');
  near(pb({ distance: 55 }, 0.99, 56.2) - pb({ distance: 55 }, 0.9, 56.2), 0.02, 1e-12, 'straining line drive');
  assert.equal(pb({ distance: 40 }, 0.99, 56.2), pb({ distance: 40 }, 0.9, 56.2), 'no lowTraj well inside range');
});

// ═══════════════════════════════ AI INPUT (§2.3.8) ═══════════════════════════════

test('aiInput: exactly 6 draws (power 2, aim 2, quality 2), clamps, and means follow the rule', () => {
  const ctx = kfx.ctx(RTG, { distance: 45, attrs: P.vet, isUser: false });
  const m = Kick.model(ctx, P.vet);
  const rng = counting(5);
  const n = 4000;
  let sp = 0, sa = 0, sq = 0;
  for (let i = 0; i < n; i++) {
    const inp = Kick.aiInput(rng, ctx, P.vet, m);
    assert.ok(inp.power >= 0 && inp.power <= T.range.powerMax && Math.abs(inp.aim) <= T.range.aimMax && inp.quality >= T.ai.qualityMin && inp.quality <= T.ai.qualityMax);
    sp += inp.power; sa += inp.aim; sq += inp.quality;
  }
  assert.equal(rng.draws, 6 * n);
  near(sp / n, Kick.aiPower(m.pNeed), 0.002, 'mean power');
  near(sa / n, 0, 0.03, 'mean aim (calm)');
  near(sq / n, 0.80 + 0.15 * P.vet.CON / 99, 0.005, 'mean quality');
  const windy = kfx.ctx(RTG, { distance: 45, attrs: P.vet, wind: { speed: 15, dir: 90 }, isUser: false });
  const mw = Kick.model(windy, P.vet);
  let saw = 0;
  for (let i = 0; i < n; i++) saw += Kick.aiInput(rng, windy, P.vet, mw).aim;
  near(saw / n, -mw.windDriftDeg * Kick.aiWindComp(P.vet.ACC), 0.03, 'mean aim compensates the drift');
  const one = Kick.aiInput(RTG.RNG.create(2), ctx);   // attrs/model optional
  assert.ok(one.power > 0.8 && one.power < 1.1);
});

// ═══════════════════════════════ RESOLVE (§2.3.4, §2.3.11) ═══════════════════════════════

test('rng draw order: block · shank · gauss(2) · contact sign · doink/return as needed (scripted uniforms)', () => {
  const ctx = kfx.ctx(RTG, { distance: 45, attrs: P.elite, pressure: 0, isUser: false });
  const clean = { power: 0.97, aim: 0, quality: 1 };        // quality 1 → no contact term; u1 = 0 → gauss error 0
  const noBlockNoShank = [0.999, 0.999, 0, 0.25, 0.999];
  let rng = scripted(noBlockNoShank);
  let r = Kick.resolve(rng, ctx, null, clean);
  assert.equal(r.outcome, 'GOOD'); assert.equal(r.sub, 'DEAD_CENTER'); assert.equal(rng.draws, 5, 'GOOD: 5 draws');
  assert.equal(r.errDeg, 0); assert.equal(r.contactDeg, 0); assert.equal(r.xYd, 0);
  rng = scripted(noBlockNoShank);
  r = Kick.resolve(rng, ctx, null, { power: 0.3, aim: 0, quality: 1 });
  assert.equal(r.outcome, 'SHORT'); assert.equal(r.sub, 'LINE_DRIVE'); assert.equal(rng.draws, 5, 'SHORT: 5 draws');
  rng = scripted([0.0, 0.999, 0, 0.25, 0.999, 0.999]);
  r = Kick.resolve(rng, ctx, null, clean);
  assert.equal(r.outcome, 'BLOCKED'); assert.equal(rng.draws, 6, 'BLOCKED: 5 + return roll'); assert.equal(r.blockReturnTd, false); assert.equal(r.made, false);
  rng = scripted([0.0, 0.999, 0, 0.25, 0.999, 0.0]);
  assert.equal(Kick.resolve(rng, ctx, null, clean).blockReturnTd, true, 'scoop-and-score on the 6th draw');
  rng = scripted(noBlockNoShank.concat([0.0]));
  r = Kick.resolve(rng, ctx, null, { power: 0.97, aim: aimForX(3.05, 45), quality: 1 });
  assert.equal(r.outcome, 'DOINK_IN'); assert.equal(rng.draws, 6, 'upright band: 6 draws'); near(r.xYd, 3.05, 0.002);
  rng = scripted(noBlockNoShank.concat([0.999]));
  r = Kick.resolve(rng, ctx, null, { power: 0.97, aim: aimForX(-3.05, 45), quality: 1 });
  assert.equal(r.outcome, 'DOINK_OUT'); assert.equal(rng.draws, 6);
  rng = scripted(noBlockNoShank);
  r = Kick.resolve(rng, ctx, null, { power: 0.97, aim: aimForX(3.5, 45), quality: 1 });
  assert.equal(r.outcome, 'WIDE_R'); assert.equal(rng.draws, 5, 'WIDE: 5 draws');
  assert.equal(Kick.resolve(scripted(noBlockNoShank), ctx, null, { power: 0.97, aim: aimForX(-3.5, 45), quality: 1 }).outcome, 'WIDE_L');
  const pNeed = Kick.geometry(ctx, P.elite).pNeed;                    // power = pNeed, quality 1 → h = XBAR exactly
  rng = scripted(noBlockNoShank.concat([0.2]));
  r = Kick.resolve(rng, ctx, null, { power: pNeed, aim: 0, quality: 1 });
  assert.equal(r.outcome, 'XBAR_IN'); assert.equal(rng.draws, 6, 'crossbar band: 6 draws'); near(r.hYd, G.XBAR, 0.002);
  rng = scripted(noBlockNoShank.concat([0.8]));
  assert.equal(Kick.resolve(rng, ctx, null, { power: pNeed, aim: 0, quality: 1 }).outcome, 'XBAR_OUT');
  // shank select on draw 2 → error drawn from N(0, 3σ) (scripted u1 gives a fixed z)
  const u1 = 0.5, u2 = 0.0;                                                // z = sqrt(−2 ln 0.5)·cos 0 = 1.1774
  const z = Math.sqrt(-2 * Math.log(1 - u1));
  const sigma = Kick.sigmaFor(ctx, clean);
  const plain = Kick.resolve(scripted([0.999, 0.999, u1, u2, 0.999]), ctx, null, clean);
  const shank = Kick.resolve(scripted([0.999, 0.0, u1, u2, 0.999]), ctx, null, clean);
  near(plain.errDeg, z * sigma, 0.002, 'plain error = z·σ'); near(shank.errDeg, 3 * z * sigma, 0.002, 'shank error = z·3σ');
  assert.equal(shank.shank, true); assert.equal(plain.shank, false);
  // contact sign on draw 5: u < 0.5 → −, else +
  const q = { power: 0.97, aim: 0, quality: 0.5 };
  near(Kick.resolve(scripted([0.999, 0.999, 0, 0.25, 0.1]), ctx, null, q).contactDeg, -0.5 * T.contact.degPerQuality, 1e-9);
  near(Kick.resolve(scripted([0.999, 0.999, 0, 0.25, 0.9]), ctx, null, q).contactDeg, 0.5 * T.contact.degPerQuality, 1e-9);
});

test('draw count per outcome branch over 3000 seeded kicks: 5, or 6 for BLOCKED / doinks / crossbar', () => {
  const ctx = kfx.ctx(RTG, { distance: 52, attrs: P.college, isUser: false });
  const rng = counting(77);
  const seen = {};
  for (let i = 0; i < 3000; i++) {
    const before = rng.draws;
    const inp = Kick.aiInput(rng, ctx, null);
    const afterInput = rng.draws;
    assert.equal(afterInput - before, 6);
    const r = Kick.resolve(rng, ctx, null, inp);
    const used = rng.draws - afterInput;
    const six = ['BLOCKED', 'DOINK_IN', 'DOINK_OUT', 'XBAR_IN', 'XBAR_OUT'].indexOf(r.outcome) >= 0;
    assert.equal(used, six ? 6 : 5, r.outcome + ' used ' + used);
    seen[r.outcome] = (seen[r.outcome] || 0) + 1;
  }
  assert.ok(seen.GOOD && seen.WIDE_L && seen.WIDE_R, 'all main branches seen ' + JSON.stringify(seen));
  assert.ok((seen.DOINK_IN || 0) + (seen.DOINK_OUT || 0) > 0, 'some doinks in 3000 kicks');
});

// Generated with the final Tuning constants (σ_base 1.746 + 5.82·(1 − s)², contact 4°/quality). Regenerate by setting GOLDEN = null and running this file.
const GOLDEN = /*GOLDEN*/[{"o":"GOOD","s":"","m":true,"x":1.259,"h":6.977,"l":1.603,"e":0.803,"k":false,"c":0.597,"p":0.959,"a":0.203,"q":0.851,"rs":2987595664},{"o":"WIDE_R","s":"","m":false,"x":4.531,"h":6.494,"l":5.749,"e":6.328,"k":false,"c":-0.758,"p":0.943,"a":0.179,"q":0.81,"rs":1659983127},{"o":"GOOD","s":"","m":true,"x":-2.158,"h":7.654,"l":-2.745,"e":-2.632,"k":false,"c":-0.375,"p":0.984,"a":0.262,"q":0.906,"rs":332370590},{"o":"WIDE_L","s":"","m":false,"x":-3.204,"h":7.123,"l":-4.073,"e":-5.049,"k":false,"c":0.967,"p":0.973,"a":0.009,"q":0.758,"rs":3299725349},{"o":"GOOD","s":"SNEAKS","m":true,"x":-2.602,"h":6.93,"l":-3.309,"e":-3.545,"k":false,"c":0.491,"p":0.955,"a":-0.255,"q":0.877,"rs":1972112812},{"o":"GOOD","s":"","m":true,"x":-1.348,"h":7.763,"l":-1.716,"e":-2.411,"k":false,"c":0.596,"p":0.993,"a":0.099,"q":0.851,"rs":644500275},{"o":"GOOD","s":"","m":true,"x":-1.141,"h":7.484,"l":-1.452,"e":-1.287,"k":false,"c":0.437,"p":0.978,"a":-0.603,"q":0.891,"rs":3611855034},{"o":"WIDE_R","s":"","m":false,"x":4.985,"h":8.368,"l":6.321,"e":5.478,"k":false,"c":0.28,"p":1.014,"a":0.454,"q":0.93,"rs":2284242497},{"o":"GOOD","s":"SNEAKS","m":true,"x":-2.921,"h":6.145,"l":-3.714,"e":-2.862,"k":true,"c":-0.303,"p":0.921,"a":-0.549,"q":0.924,"rs":956629960},{"o":"GOOD","s":"SNEAKS","m":true,"x":2.732,"h":6.815,"l":3.474,"e":3.494,"k":false,"c":-0.662,"p":0.954,"a":0.642,"q":0.835,"rs":3923984719},{"o":"GOOD","s":"","m":true,"x":0.98,"h":7.698,"l":1.248,"e":0.813,"k":false,"c":0.585,"p":0.99,"a":-0.15,"q":0.854,"rs":2596372182},{"o":"WIDE_R","s":"","m":false,"x":4.263,"h":7.152,"l":5.411,"e":5.313,"k":false,"c":0.514,"p":0.965,"a":-0.416,"q":0.872,"rs":1268759645},{"o":"GOOD","s":"","m":true,"x":0.93,"h":6.674,"l":1.184,"e":0.075,"k":false,"c":0.95,"p":0.954,"a":0.159,"q":0.762,"rs":4236114404},{"o":"GOOD","s":"DEAD_CENTER","m":true,"x":0.795,"h":6.123,"l":1.013,"e":1.799,"k":false,"c":-0.697,"p":0.927,"a":-0.089,"q":0.826,"rs":2908501867},{"o":"WIDE_R","s":"","m":false,"x":4.629,"h":8.136,"l":5.873,"e":5.302,"k":false,"c":0.021,"p":0.998,"a":0.55,"q":0.995,"rs":1580889330},{"o":"GOOD","s":"DEAD_CENTER","m":true,"x":-0.326,"h":6.937,"l":-0.416,"e":-0.189,"k":false,"c":-0.474,"p":0.955,"a":0.247,"q":0.881,"rs":253276793},{"o":"WIDE_L","s":"","m":false,"x":-5.153,"h":6.244,"l":-6.533,"e":-5.982,"k":false,"c":-0.753,"p":0.933,"a":0.203,"q":0.812,"rs":3220631552},{"o":"GOOD","s":"SNEAKS","m":true,"x":2.641,"h":7.183,"l":3.359,"e":4.463,"k":false,"c":-0.573,"p":0.967,"a":-0.531,"q":0.857,"rs":1893019015},{"o":"GOOD","s":"","m":true,"x":-0.949,"h":7.95,"l":-1.209,"e":-0.279,"k":false,"c":-0.774,"p":1.005,"a":-0.193,"q":0.806,"rs":565406478},{"o":"WIDE_L","s":"","m":false,"x":-3.72,"h":7.202,"l":-4.726,"e":-4.642,"k":false,"c":-0.599,"p":0.969,"a":0.515,"q":0.85,"rs":3532761237}]/*END*/;

test('golden: 20 deterministic results for seed 20240905 (rookie, 45 yd calm, AI input)', () => {
  const rng = RTG.RNG.create(20240905);
  const ctx = kfx.fg45Calm(RTG);
  const out = [];
  for (let i = 0; i < 20; i++) {
    const inp = Kick.aiInput(rng, ctx, null);
    const r = Kick.resolve(rng, ctx, null, inp);
    out.push({ o: r.outcome, s: r.sub, m: r.made, x: r.xYd, h: r.hYd, l: r.launchDeg, e: r.errDeg, k: r.shank, c: r.contactDeg, p: r.power, a: r.aim, q: r.quality, rs: rng.state() });
  }
  if (!GOLDEN) { console.log(JSON.stringify(out)); assert.fail('golden vector not generated'); }
  assert.deepEqual(J(out), GOLDEN);
});

test('replay determinism: {ctx, input, rngState} reproduce the result; attributes come from ctx.kicker only', () => {
  const state = hasData ? pfx.stateWith(RTG, { stage: 'NFL', attrs: P.vet }) : null;
  const ctx = kfx.fg55WindyDecisive(RTG);
  const inp = { power: 1.02, aim: -1.1, quality: 0.8, holdMs: 900 };
  const rng = RTG.RNG.create(99);
  rng.next(); rng.next();
  const s0 = rng.state();
  const a = Kick.resolve(rng, ctx, null, inp);
  const r2 = RTG.RNG.create(0); r2.setState(s0);
  const b = Kick.resolve(r2, ctx, null, inp);
  assert.deepEqual(J(a), J(b));
  assert.equal(rng.state(), r2.state());
  // a different kicker in the same ctx changes σ; passing the same attrs explicitly changes nothing
  const r3 = RTG.RNG.create(0); r3.setState(s0);
  assert.deepEqual(J(Kick.resolve(r3, ctx, ctx.kicker.attrs, inp)), J(a));
  const worse = J(ctx); worse.kicker.attrs = J(P.college);
  const r4 = RTG.RNG.create(0); r4.setState(s0);
  const c = Kick.resolve(r4, worse, null, inp);
  assert.ok(c.sigmaDeg > a.sigmaDeg);
  assert.ok(Math.abs(c.errDeg) > Math.abs(a.errDeg) - 1e-9, 'same uniforms, wider σ');
  if (state) {                                                            // the state is irrelevant to resolve
    state.player.attrs.ACC = 1;
    const r5 = RTG.RNG.create(0); r5.setState(s0);
    assert.deepEqual(J(Kick.resolve(r5, ctx, null, inp)), J(a));
  }
});

test('input clamps, points by type, tags, result shape is JSON-safe', () => {
  const ctx = kfx.fg45Calm(RTG);
  const r = Kick.resolve(RTG.RNG.create(1), ctx, null, { power: 2, aim: 50, quality: -1, holdMs: -5 });
  assert.equal(r.power, T.range.powerMax); assert.equal(r.aim, T.range.aimMax); assert.equal(r.quality, 0); assert.equal(r.holdMs, 0);
  const pat = Kick.resolve(RTG.RNG.create(3), kfx.patCollege(RTG), null, { power: 0.8, aim: 0, quality: 0.9 });
  assert.equal(pat.points, pat.made ? 1 : 0); assert.equal(pat.type, 'PAT');
  const fg = Kick.resolve(RTG.RNG.create(3), ctx, null, { power: 0.97, aim: 0, quality: 0.9 });
  assert.equal(fg.points, fg.made ? 3 : 0);
  const tagged = Kick.resolve(RTG.RNG.create(3), kfx.ctx(RTG, { distance: 52, pressure: 0.7, decisive: true, iced: true, asTimeExpires: true, playoff: true }), null, { power: 1, aim: 0, quality: 0.9 }, { auto: true });
  assert.deepEqual(J(tagged.tags), ['clutch', 'decisive', 'iced', 'asTimeExpires', 'playoff', 'fiftyPlus', 'auto']);
  assert.equal(tagged.auto, true);
  assert.deepEqual(J(Kick.tagsFor(kfx.ctx(RTG, { distance: 49, pressure: 0.59 }))), []);
  assert.deepEqual(J(Kick.tagsFor(kfx.ctx(RTG, { type: 'PAT', pressure: 0.6 }))), ['clutch']);
  const walk = (o, p) => { for (const k of Object.keys(o)) { const v = o[k]; if (v && typeof v === 'object') walk(v, p + '.' + k); else assert.ok(v !== undefined && !(typeof v === 'number' && !isFinite(v)), p + '.' + k); } };
  walk(fg, 'result'); walk(ctx, 'ctx');
  for (const k of ['outcome', 'made', 'points', 'distance', 'xYd', 'hYd', 'launchDeg', 'errDeg', 'shank', 'contactDeg', 'windDriftYd', 'power', 'quality', 'flightTime', 'sub', 'blockReturnTd', 'tags', 'feedback']) assert.ok(k in fg, 'KickResult.' + k);
  for (const k of ['timing', 'power', 'missBy', 'coachSaw']) assert.ok(k in fg.feedback, 'feedback.' + k);
});

test('classify: doink bands (x = ±3.05 → DOINK, ±3.30 → WIDE), crossbar band, subs, block return odds by type/league', () => {
  const rng = RTG.RNG.create(1);
  const fg = { type: 'FG', league: 'NFL' };
  const c = (h, x, r) => Kick.classify(false, h, x, r || rng, fg).outcome;
  for (const x of [3.05, -3.05, 3.083, -3.083, 3.18, -3.18, 2.99]) assert.ok(/^DOINK_/.test(c(8, x)), 'x ' + x);
  assert.equal(c(8, 3.30), 'WIDE_R'); assert.equal(c(8, -3.30), 'WIDE_L'); assert.equal(c(8, 3.184), 'WIDE_R');
  assert.equal(c(8, 2.98), 'GOOD'); assert.equal(c(8, 2.6), 'GOOD'); assert.equal(c(8, -2.982), 'GOOD');
  assert.equal(Kick.classify(false, 8, 0.5, rng, fg).sub, 'DEAD_CENTER');
  assert.equal(Kick.classify(false, 8, -0.79, rng, fg).sub, 'DEAD_CENTER');
  assert.equal(Kick.classify(false, 8, 2.6, rng, fg).sub, 'SNEAKS');
  assert.equal(Kick.classify(false, 8, 1.5, rng, fg).sub, '');
  assert.ok(/^XBAR_/.test(c(G.XBAR, 0))); assert.ok(/^XBAR_/.test(c(G.XBAR + 0.17, 2.0))); assert.ok(/^XBAR_/.test(c(G.XBAR - 0.17, -2.0)));
  assert.equal(c(G.XBAR - 0.19, 0), 'SHORT'); assert.equal(Kick.classify(false, G.XBAR - 0.19, 0, rng, fg).sub, '');
  assert.equal(Kick.classify(false, 1.4, 0, rng, fg).sub, 'LINE_DRIVE'); assert.equal(Kick.classify(false, -3, 0, rng, fg).outcome, 'SHORT');
  assert.ok(/^XBAR_/.test(c(G.XBAR, 3.05)), 'crossbar height and |x| < H → the crossbar rule (step 3) wins');
  assert.ok(/^DOINK_/.test(c(G.XBAR, 3.10)), 'crossbar height but |x| ≥ H within the post band → upright doink (step 4)');
  assert.ok(/^DOINK_/.test(c(G.XBAR - 0.17, -3.15)), 'upright doinks need h ≥ XBAR − 0.18');
  assert.equal(c(G.XBAR - 0.19, 3.1), 'SHORT', 'below the crossbar band the ball is short, post or not');
  assert.equal(c(G.XBAR, 3.5), 'WIDE_R', 'crossbar height but wide');
  // doink-in odds: inside edge 45 %, outside 25 %, crossbar 50 %
  const rates = (h, x) => { const r = RTG.RNG.create(9); let inn = 0; for (let i = 0; i < 20000; i++) if (Kick.classify(false, h, x, r, fg).outcome.slice(-3) === '_IN') inn++; return inn / 20000; };
  near(rates(8, 3.05), 0.45, 0.012); near(rates(8, 3.12), 0.25, 0.012); near(rates(G.XBAR, 0), 0.50, 0.012);
  // block returns: FG 3 %, NFL PAT 2 %, college PAT 0
  const ret = (ctx) => { const r = RTG.RNG.create(4); let n = 0; for (let i = 0; i < 20000; i++) if (Kick.classify(true, 8, 0, r, ctx).blockReturnTd) n++; return n / 20000; };
  near(ret(fg), 0.03, 0.005); near(ret({ type: 'PAT', league: 'NFL' }), 0.02, 0.005); assert.equal(ret({ type: 'PAT', league: 'COLLEGE' }), 0);
  assert.equal(Kick.isMade('DOINK_IN'), true); assert.equal(Kick.isMade('XBAR_OUT'), false);
});

test('forced outcomes (debug): every outcome builds a consistent result without consuming rng', () => {
  const ctx = kfx.fg45Calm(RTG);
  const inp = { power: 0.95, aim: 0, quality: 0.9 };
  for (const outcome of Kick.OUTCOMES) {
    const rng = RTG.RNG.create(5);
    const s0 = rng.state();
    const r = Kick.resolve(rng, ctx, null, inp, { forced: outcome });
    assert.equal(rng.state(), s0, 'no draws for ' + outcome);
    assert.equal(r.outcome, outcome); assert.equal(r.forced, true); assert.equal(r.made, Kick.isMade(outcome)); assert.equal(r.points, r.made ? 3 : 0);
    assert.equal(r.blocked, outcome === 'BLOCKED');
    const ax = Math.abs(r.xYd);
    if (outcome === 'GOOD') assert.ok(ax < G.H - G.R_POST && r.hYd > G.XBAR + G.XBAR_BAND);
    if (outcome === 'WIDE_L') assert.ok(r.xYd < -(G.H + G.R_POST)); if (outcome === 'WIDE_R') assert.ok(r.xYd > G.H + G.R_POST);
    if (outcome === 'SHORT') assert.ok(r.hYd < G.XBAR - G.XBAR_BAND);
    if (/^DOINK_/.test(outcome)) assert.ok(Math.abs(ax - G.H) <= G.R_POST && r.hYd > G.XBAR + G.XBAR_BAND);
    if (/^XBAR_/.test(outcome)) assert.ok(Math.abs(r.hYd - G.XBAR) <= G.XBAR_BAND && ax < G.H);
    if (outcome !== 'BLOCKED') {
      const geo = Kick.geometry(ctx);                                        // launch/err are consistent with x
      near(ctx.ballX + 45 * Math.tan(r.launchDeg / DEG) + geo.windDriftYd, r.xYd, 0.01, 'launch reproduces x');
      near(geo.targetDeg + r.aim + r.errDeg + r.contactDeg + r.overBiasDeg, r.launchDeg, 0.01, 'launch decomposition');
    }
    assert.ok(typeof r.feedback.coachSaw === 'string' && r.feedback.coachSaw.length > 10);
  }
  const sneaks = Kick.resolve(RTG.RNG.create(1), ctx, null, inp, { forced: { outcome: 'GOOD', sub: 'SNEAKS', side: -1 } });
  assert.equal(sneaks.sub, 'SNEAKS'); assert.ok(sneaks.xYd < -G.SNEAKS_X && sneaks.xYd > -(G.H - G.R_POST));
  const dc = Kick.resolve(RTG.RNG.create(1), ctx, null, inp, { forced: { outcome: 'GOOD', sub: 'DEAD_CENTER' } });
  assert.equal(dc.sub, 'DEAD_CENTER'); assert.equal(dc.xYd, 0);
  assert.equal(Kick.resolve(RTG.RNG.create(1), ctx, null, inp, { forced: { outcome: 'SHORT', sub: 'LINE_DRIVE' } }).sub, 'LINE_DRIVE');
  assert.equal(Kick.resolve(RTG.RNG.create(1), ctx, null, inp, { forced: { outcome: 'BLOCKED', blockReturnTd: true } }).blockReturnTd, true);
  assert.ok(Kick.resolve(RTG.RNG.create(1), ctx, null, inp, { forced: { outcome: 'DOINK_OUT', side: -1 } }).xYd < 0);
  assert.equal(Kick.resolve(RTG.RNG.create(1), ctx, null, inp, { forced: 'NOPE' }).outcome, 'GOOD', 'unknown outcome → GOOD');
  assert.deepEqual(J(Kick.resolve(RTG.RNG.create(1), kfx.ctx(RTG, { distance: 52, pressure: 0.7 }), null, inp, { forced: 'GOOD', auto: true }).tags), ['clutch', 'fiftyPlus', 'auto']);
});

// ═══════════════════════════════ FEEDBACK (§3.4) ═══════════════════════════════

test('feedbackFor: timing/power labels, missBy in yards + feet text, coachSaw sentences', () => {
  const ctx = kfx.fg45Calm(RTG);
  const m = Kick.model(ctx);
  const good = { outcome: 'GOOD', sub: '', xYd: 1.2, hYd: 7, shank: false, contactDeg: 0.2, overBiasDeg: 0, windDriftYd: 0, errDeg: 0.5, blockReturnTd: false };
  assert.equal(Kick.feedbackFor(ctx, m, { power: m.pNeed + 0.05, aim: 0, quality: 0.95 }, good).timing, 'PURE');
  assert.equal(Kick.feedbackFor(ctx, m, { power: 0.9, aim: 0, quality: 0.8 }, good).timing, 'GOOD');
  assert.equal(Kick.feedbackFor(ctx, m, { power: 0.9, aim: 0, quality: 0.6 }, good).timing, 'FAIR');
  assert.equal(Kick.feedbackFor(ctx, m, { power: 0.9, aim: 0, quality: 0.3 }, good).timing, 'POOR');
  assert.equal(Kick.feedbackFor(ctx, m, { power: m.pNeed - 0.05, aim: 0, quality: 0.9 }, good).power, 'WEAK');
  assert.equal(Kick.feedbackFor(ctx, m, { power: m.pNeed + 0.1, aim: 0, quality: 0.9 }, good).power, 'SMOOTH');
  assert.equal(Kick.feedbackFor(ctx, m, { power: m.pNeed + 0.16, aim: 0, quality: 0.9 }, good).power, 'FULL');
  assert.equal(Kick.feedbackFor(ctx, m, { power: 1.05, aim: 0, quality: 0.9 }, good).power, 'OVERSWING');
  const fb = Kick.feedbackFor(ctx, m, { power: 0.97, aim: 0, quality: 0.9 }, good);
  assert.deepEqual(J(fb.missBy), { yd: 0, side: null, text: '' }); assert.equal(fb.coachSaw, 'Coach saw a clean strike.');
  const wide = Object.assign({}, good, { outcome: 'WIDE_R', xYd: 4.583, errDeg: 2.5 });
  const fw = Kick.feedbackFor(ctx, m, { power: 0.97, aim: 0, quality: 0.9 }, wide);
  near(fw.missBy.yd, 1.5, 1e-9); assert.equal(fw.missBy.side, 'R'); assert.equal(fw.missBy.text, 'Wide right by 1 yd 2 ft'); assert.match(fw.coachSaw, /push it right/);
  const shortRes = Object.assign({}, good, { outcome: 'SHORT', hYd: 2 });
  const fs = Kick.feedbackFor(ctx, m, { power: 0.7, aim: 0, quality: 0.9 }, shortRes);
  assert.equal(fs.missBy.side, 'SHORT'); assert.ok(fs.missBy.yd > 0); assert.match(fs.missBy.text, /^Short by /); assert.match(fs.coachSaw, /power|leg/);
  assert.match(Kick.feedbackFor(ctx, m, { power: 0.97, aim: 0, quality: 0.9 }, Object.assign({}, good, { outcome: 'WIDE_L', xYd: -3.6, shank: true })).coachSaw, /shank/);
  assert.match(Kick.feedbackFor(ctx, m, { power: 1.15, aim: 0, quality: 0.9 }, Object.assign({}, good, { outcome: 'WIDE_R', xYd: 3.6, overBiasDeg: 1.2 })).coachSaw, /overswing/);
  assert.match(Kick.feedbackFor(ctx, m, { power: 0.97, aim: 0, quality: 0.5 }, Object.assign({}, good, { outcome: 'WIDE_L', xYd: -3.6, contactDeg: -2 })).coachSaw, /sloppy contact/);
  assert.match(Kick.feedbackFor(ctx, m, { power: 0.97, aim: 0, quality: 0.9 }, Object.assign({}, good, { outcome: 'DOINK_IN', xYd: 3.05 })).coachSaw, /doink in/);
  assert.match(Kick.feedbackFor(ctx, m, { power: 0.97, aim: 0, quality: 0.9 }, Object.assign({}, good, { outcome: 'BLOCKED', xYd: 0, hYd: 0 })).coachSaw, /rush|line/);
  assert.equal(Kick.feedbackFor(ctx, m, { power: 0.97, aim: 0, quality: 0.9 }, Object.assign({}, good, { outcome: 'XBAR_OUT' })).missBy.side, 'SHORT');
  assert.match(Kick.feedbackFor(kfx.ctx(RTG, { distance: 45, pressure: 0.8 }), m, { power: 0.97, aim: 0, quality: 0.9 }, Object.assign({}, good, { sub: 'DEAD_CENTER', xYd: 0 })).coachSaw, /ice in your veins/);
  assert.equal(Kick.fmtYards(0.5), '2 ft'); assert.equal(Kick.fmtYards(1), '1 yd'); assert.equal(Kick.fmtYards(1.34), '1 yd 1 ft'); assert.equal(Kick.fmtYards(0.05), '1 ft'); assert.equal(Kick.fmtYards(4), '4 yd');
  const auto = Kick.feedbackFor(ctx, null, { power: 0.97, aim: 0, quality: 0.9 }, good);   // model optional
  assert.equal(auto.power, 'SMOOTH');
});

// ═══════════════════════════════ KICKOFFS (§2.3.10) ═══════════════════════════════

test('kickoffs: touchback rate ≈ 35 % @ KO 50 vs ≈ 75 % @ KO 90 (auto), draws, out of bounds, returns, onside, green zone', () => {
  const rate = (KO) => {
    const ctx = kfx.kickoff(RTG, { attrs: { POW: 60, ACC: 60, CON: 60, CLU: 60, KO } });
    const rng = RTG.RNG.create(KO);
    let tb = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) if (Kick.resolveKickoff(rng, ctx, null, null).touchback) tb++;
    return tb / n;
  };
  near(rate(50), T.kickoff.autoTouchbackTarget.ko50, 0.05, 'KO 50 touchbacks'); near(rate(90), T.kickoff.autoTouchbackTarget.ko90, 0.05, 'KO 90 touchbacks');
  const ctx = kfx.kickoff(RTG, { attrs: { POW: 60, ACC: 60, CON: 60, CLU: 60, KO: 70 } });
  for (let seed = 1; seed <= 300; seed++) {
    const rng = counting(seed);
    const r = Kick.resolveKickoff(rng, ctx, null, { timing: 0.1 });
    assert.equal(rng.draws, r.touchback ? 4 : 7, r.outcome + ' draws ' + rng.draws);
    assert.ok(r.hang > 2.5 && r.hang < 6 && r.dist > 40 && r.dist < 95);
    if (r.outcome === 'RETURN') assert.ok(r.startYard >= T.kickoff.returnMin && r.startYard <= T.kickoff.returnMax);
    if (r.touchback) { assert.equal(r.startYard, 30); assert.equal(r.made, true); assert.equal(r.ytg, 70); }
    if (r.returnTd) { assert.equal(r.outcome, 'RETURN_TD'); assert.equal(r.startYard, 100); }
    assert.equal(r.possession, 'receiving'); assert.equal(r.auto, false); assert.deepEqual(J(r.tags), []);
  }
  assert.equal(Kick.resolveKickoff(RTG.RNG.create(2), kfx.kickoff(RTG, { league: 'COLLEGE', attrs: { POW: 60, ACC: 60, CON: 60, CLU: 60, KO: 99 } }), null, { timing: 0 }).startYard, 25, 'college touchback to the 25');
  const oob = Kick.resolveKickoff(RTG.RNG.create(3), ctx, null, { timing: 0.95 });
  assert.equal(oob.outcome, 'OOB'); assert.equal(oob.oob, true); assert.equal(oob.startYard, 40);
  const auto = Kick.resolveKickoff(RTG.RNG.create(3), ctx, null, null);
  assert.equal(auto.auto, true); assert.deepEqual(J(auto.tags), ['auto']); assert.equal(auto.timing, T.kickoff.autoTiming);
  let rec = 0;
  for (let i = 0; i < 20000; i++) { const rng = counting(i); const r = Kick.resolveKickoff(rng, ctx, null, { onside: true }); assert.equal(rng.draws, 1); if (r.recovered) { rec++; assert.equal(r.possession, 'kicking'); assert.equal(r.startYard, 45); } else assert.equal(r.startYard, 55); }
  near(rec / 20000, 0.10, 0.01, 'onside recovery');
  let recT = 0;
  const trained = kfx.kickoff(RTG, { attrs: { POW: 60, ACC: 60, CON: 60, CLU: 60, KO: 70 }, flags: { ONSIDE_TRAINED: true } });
  for (let i = 0; i < 20000; i++) if (Kick.resolveKickoff(RTG.RNG.create(i), trained, null, { onside: true }).recovered) recT++;
  near(recT / 20000, 0.18, 0.012, 'trained onside recovery');
  near(Kick.kickoffGreenZone(60), 12 + 0.35 * 60, 1e-12);
  const better = Kick.resolveKickoff(RTG.RNG.create(11), ctx, null, { timing: 0 }), worse = Kick.resolveKickoff(RTG.RNG.create(11), ctx, null, { timing: 0.8 });
  assert.ok(better.dist > worse.dist && better.hang > worse.hang, 'timing bonus');
});

// ═══════════════════════════════ CONTEXT & PRESSURE (§2.3.7, §3.5.8) ═══════════════════════════════

/** NFL state + a GameState for the user's team (home) vs a non-division opponent. */
function nflSetup(o) {
  o = o || {};
  const state = pfx.stateWith(RTG, Object.assign({ stage: 'NFL', attrs: P.rookie }, o.player || {}));
  if (o.difficulty) state.difficulty = o.difficulty;
  const nfl = state.leagues.nfl;
  const me = nfl.teams.find((t) => t.id === state.player.teamId);
  const opp = nfl.teams.find((t) => t.id !== me.id && !(t.conf === me.conf && t.div === me.div));
  const gs = Schema.createGameState({ league: 'NFL', week: 9, homeId: me.id, awayId: opp.id, userSide: 'home',
    weather: o.weather || { weather: 'clear', tempF: 65, wind: { speed: 10, dir: 90 }, surface: 'grass', altitude: false, dome: false } });
  Object.assign(gs, o.gs || {});
  return { state, gs, me, opp };
}

test('buildContext: snapshot, hash draw (1), per-kick wind (2), Legend gusts (2), calm/explicit wind (0), PAT hash 0', (t) => {
  if (!hasData) { t.skip(dataNote); return; }
  const { state, gs, me, opp } = nflSetup();
  const rng = counting(1);
  const ctx = Kick.buildContext(state, gs, { type: 'FG', distance: 47, isUser: true }, rng);
  assert.equal(rng.draws, 3, 'hash 1 + wind 2');
  assert.equal(ctx.type, 'FG'); assert.equal(ctx.league, 'NFL'); assert.equal(ctx.distance, 47); assert.equal(ctx.isUser, true); assert.equal(ctx.difficulty, state.difficulty);
  assert.ok([-1, 0, 1].indexOf(ctx.hash) >= 0); assert.equal(ctx.ballX, Kick.ballXFor('NFL', ctx.hash));
  assert.ok(ctx.wind.speed >= 0 && ctx.wind.speed < 20); assert.equal(ctx.wind.dir, 90, 'home side, first half: wind as given');
  assert.deepEqual(J(ctx.kicker.attrs), J(state.player.attrs)); assert.equal(ctx.kicker.foot, state.player.foot);
  assert.equal(ctx.oppST, opp.ST); assert.equal(ctx.game.teamId, me.id); assert.equal(ctx.game.oppId, opp.id); assert.equal(ctx.game.q, 1); assert.equal(ctx.game.week, 9);
  assert.equal(ctx.tempF, 65); assert.equal(ctx.weather, 'clear'); assert.equal(ctx.surface, 'grass'); assert.equal(ctx.dome, false);
  // snapshot isolation (the fixture player already carries its own mods; the snapshot is a deep copy of them)
  assert.deepEqual(J(ctx.kicker.mods), J(state.player.mods));
  const nMods = ctx.kicker.mods.length;
  state.player.attrs.ACC = 1; state.player.mods.push(pfx.mod({ key: 'sigma', op: 'mul', value: 2 })); state.player.flags.SLUMP = true; state.player.mods[0].value = 5;
  assert.equal(ctx.kicker.attrs.ACC, P.rookie.ACC); assert.equal(ctx.kicker.mods.length, nMods); assert.equal(ctx.kicker.flags.SLUMP, undefined);
  assert.notEqual(ctx.kicker.mods.length && ctx.kicker.mods[0].value, 5, 'deep copy: later edits to the player never reach the context');
  // no draws with an explicit hash + wind; 2 with hash only; oriented wind flips for the away side and the second half
  const r0 = counting(2);
  Kick.buildContext(state, gs, { type: 'FG', distance: 40, hash: 1, wind: { speed: 5, dir: 0 }, isUser: true }, r0);
  assert.equal(r0.draws, 0);
  const r2 = counting(2);
  const c2 = Kick.buildContext(state, gs, { type: 'FG', distance: 40, hash: -1, isUser: true }, r2);
  assert.equal(r2.draws, 2); assert.equal(c2.hash, -1); assert.equal(c2.ballX, -3.083);
  assert.equal(Kick.buildContext(state, gs, { type: 'FG', distance: 40, hash: 0, isUser: false, teamId: opp.id, side: 'away' }, counting(2)).wind.dir, 270, 'away side kicks the other way');
  const gs2 = J(gs); gs2.q = 3; gs2.half = 2;
  assert.equal(Kick.buildContext(state, gs2, { type: 'FG', distance: 40, hash: 0, isUser: true }, counting(2)).wind.dir, 270, 'second half flips');
  // PAT: no hash draw, distance 33, still 2 wind draws
  const rp = counting(3);
  const pat = Kick.buildContext(state, gs, { type: 'PAT', isUser: true }, rp);
  assert.equal(rp.draws, 2); assert.equal(pat.hash, 0); assert.equal(pat.distance, 33);
  // calm session context: no draws at all, no wind
  const rs = counting(4);
  const sess = Kick.buildContext(state, null, { type: 'FG', distance: 44, hash: 0, isUser: true, forSession: true, pressure: 0.3 }, rs);
  assert.equal(rs.draws, 0); assert.equal(sess.wind.speed, 0); assert.equal(sess.pressure, 0.3); assert.equal(sess.game.teamId, me.id);
  // Legend gusts: 2 extra draws for the user only, hidden multiplier
  const legend = nflSetup({ difficulty: 'legend' });
  const rl = counting(5);
  const cl = Kick.buildContext(legend.state, legend.gs, { type: 'FG', distance: 40, hash: 0, isUser: true }, rl);
  assert.equal(rl.draws, 4); assert.equal(typeof cl.wind.gust, 'number');
  const ra = counting(5);
  assert.equal(Kick.buildContext(legend.state, legend.gs, { type: 'FG', distance: 40, hash: 0, isUser: false, teamId: legend.opp.id, side: 'away' }, ra).wind.gust, undefined);
  assert.equal(ra.draws, 2);
  // situation.rng and the deterministic fallback
  const rr = counting(6);
  Kick.buildContext(state, gs, { type: 'FG', distance: 40, isUser: true, rng: rr });
  assert.equal(rr.draws, 3);
  const f1 = Kick.buildContext(state, gs, { type: 'FG', distance: 40, isUser: true }), f2 = Kick.buildContext(state, gs, { type: 'FG', distance: 40, isUser: true });
  assert.deepEqual(J(f1), J(f2), 'fallback rng is deterministic');
});

test('buildContext: hash distribution 40/20/40 (NFL) and 45/10/45 (college); AI kicker snapshot from the league', (t) => {
  if (!hasData) { t.skip(dataNote); return; }
  const { state, gs, opp } = nflSetup();
  const rng = RTG.RNG.create(8);
  const count = { '-1': 0, 0: 0, 1: 0 };
  for (let i = 0; i < 6000; i++) count[Kick.buildContext(state, gs, { type: 'FG', distance: 40, wind: { speed: 0, dir: 0 }, isUser: true }, rng).hash]++;
  near(count['-1'] / 6000, 0.40, 0.03); near(count[0] / 6000, 0.20, 0.03); near(count[1] / 6000, 0.40, 0.03);
  const college = pfx.stateWith(RTG, { attrs: P.college });
  const cc = { '-1': 0, 0: 0, 1: 0 };
  for (let i = 0; i < 6000; i++) cc[Kick.buildContext(college, null, { type: 'FG', distance: 40, isUser: true, calm: true }, rng).hash]++;
  near(cc['-1'] / 6000, 0.45, 0.03); near(cc[0] / 6000, 0.10, 0.03); near(cc[1] / 6000, 0.45, 0.03);
  const ai = Kick.buildContext(state, gs, { type: 'FG', distance: 40, hash: 0, isUser: false, teamId: opp.id, side: 'away' }, rng);
  const k = state.leagues.nfl.kickers && state.leagues.nfl.kickers[opp.id];
  if (k) assert.deepEqual(J(ai.kicker.attrs), J({ POW: k.attrs.POW, ACC: k.attrs.ACC, CON: k.attrs.CON, CLU: k.attrs.CLU, KO: k.attrs.KO }));
  assert.equal(ai.isUser, false); assert.equal(ai.away, true); assert.equal(ai.game.teamId, opp.id);
  const explicit = Kick.buildContext(state, gs, { type: 'FG', distance: 40, hash: 0, isUser: false, kicker: { attrs: P.elite, foot: 'L', traits: ['BIG_LEG'] } }, rng);
  assert.deepEqual(J(explicit.kicker.attrs), J(P.elite)); assert.equal(explicit.kicker.foot, 'L'); assert.deepEqual(J(explicit.kicker.traits), ['BIG_LEG']);
  assert.equal(Kick.buildContext(null, null, { type: 'FG', distance: 40, attrs: P.vet }).isUser, false, 'bare attrs → not the user');
  const sched = Kick.buildContext(state, gs, { type: 'FG', distance: 40, hash: 0, isUser: true, game: { q: 4, clock: 17, scoreFor: 20, scoreAgainst: 21 } }, rng);
  assert.equal(sched.game.q, 4); assert.equal(sched.game.clock, 17); assert.equal(sched.game.scoreFor, 20);
});

test('pressure (§2.3.7): terms, decisive/late detection from the game state, ice immunity, user-only terms, OT bases, clamp', (t) => {
  if (!hasData) { t.skip(dataNote); return; }
  const calm = { wind: { speed: 0, dir: 0 }, hash: 0, rivalry: false };
  const { state, gs } = nflSetup();
  const p = (sit, g, st) => Kick.buildContext(st || state, g === undefined ? gs : g, Object.assign({ type: 'FG', distance: 40, isUser: true }, calm, sit || {}));
  near(p().pressure, 0.05, 1e-9, 'base');
  near(p({ distance: 50 }).pressure, 0.12, 1e-9, 'D ≥ 50');
  near(p({ away: true }).pressure, 0.13, 1e-9);
  near(p({ playoff: true }).pressure, 0.20, 1e-9);
  near(p({ rivalry: true }).pressure, 0.15, 1e-9);
  near(p({ asTimeExpires: true }).pressure, 0.15, 1e-9); assert.equal(p({ asTimeExpires: true }).asTimeExpires, true); assert.equal(p({ asTimeExpires: true }).decisive, false);
  near(p({ iced: true }).pressure, 0.20, 1e-9); assert.equal(p({ iced: true }).iced, true);
  const late = J(gs); late.q = 4; late.clock = 290;
  const c1 = p({}, late); near(c1.pressure, 0.35, 1e-9, 'Q4 ≤ 5:00 is late'); assert.equal(c1.late, true); assert.equal(c1.decisive, false);
  const dec = J(gs); dec.q = 4; dec.clock = 100; dec.score = { home: 17, away: 20 };
  const c2 = p({}, dec); near(c2.pressure, 0.65, 1e-9, 'late + decisive (a 3 ties it)'); assert.equal(c2.decisive, true); assert.equal(c2.clutch, true);
  const lead = J(dec); lead.score = { home: 21, away: 20 };
  assert.equal(p({}, lead).decisive, false, 'already leading → not decisive');
  const down4 = J(dec); down4.score = { home: 16, away: 20 };
  assert.equal(p({}, down4).decisive, false, 'down 4 → a FG cannot tie');
  assert.equal(p({ type: 'PAT' }, Object.assign(J(dec), { score: { home: 19, away: 20 } })).decisive, true, 'a PAT that ties is decisive');
  const early = J(dec); early.clock = 121;
  assert.equal(p({}, early).decisive, false, 'decisive needs ≤ 2:00'); assert.equal(p({}, early).late, true);
  assert.equal(p({ decisive: false }, dec).decisive, false, 'explicit flags win');
  near(p({ decisive: true }).pressure, 0.35, 1e-9);
  const iced = J(dec); iced.iced = true;
  near(p({}, iced).pressure, 0.80, 1e-9, 'iced adds 0.15');
  const cool = pfx.stateWith(RTG, { stage: 'NFL', attrs: { POW: 82, ACC: 92, CON: 90, CLU: 90, KO: 80 } });
  const ci = p({}, iced, cool); near(ci.pressure, 0.65, 1e-9, 'CLU ≥ 90 ignores the ice'); assert.equal(ci.iced, true); assert.equal(ci.iceImmune, true);
  const streaky = pfx.stateWith(RTG, { stage: 'NFL', attrs: P.rookie, missStreak: 2 });
  near(p({}, gs, streaky).pressure, 0.15, 1e-9, 'missStreak ≥ 2');
  const loved = pfx.stateWith(RTG, { stage: 'NFL', attrs: P.rookie, fans: 85 });
  near(p({ away: true }, gs, loved).pressure, 0.03, 1e-9, 'fans ≥ 80 relieve 0.10');
  const modded = pfx.stateWith(RTG, { stage: 'NFL', attrs: P.rookie, mods: [pfx.mod({ key: 'pressure', op: 'add', value: 0.2 })] });
  near(p({}, gs, modded).pressure, 0.25, 1e-9, 'pressure mods');
  const legend = pfx.stateWith(RTG, { stage: 'NFL', attrs: P.rookie, difficulty: 'legend' });
  near(p({}, gs, legend).pressure, 0.10, 1e-9, 'legend +0.05');
  const rookieD = pfx.stateWith(RTG, { stage: 'NFL', attrs: P.rookie, difficulty: 'rookie' });
  near(p({}, gs, rookieD).pressure, 0.0, 1e-9, 'rookie −0.05 (clamped at 0)');
  assert.equal(p({ isUser: false, teamId: gs.awayId, side: 'away' }, gs, streaky).pressure - 0.08 - 0.05 < 1e-9, true, 'AI kicks skip the user-only terms');
  const heavy = J(dec); heavy.iced = true; heavy.kind = 'PLAYOFF';
  assert.equal(p({ distance: 52, rivalry: true, away: true }, heavy, streaky).pressure, 1, 'clamped at 1');
  const ot = J(gs); ot.q = 5; ot.ot = { period: 1, mode: 'NFL_REG' }; ot.score = { home: 20, away: 20 };
  const cot = p({}, ot); assert.equal(cot.ot, true); assert.equal(cot.late, true); assert.equal(cot.decisive, true, 'OT kick that takes the lead'); near(cot.pressure, 0.65, 1e-9);
  const college = pfx.stateWith(RTG, { attrs: P.college });
  const cgs = Schema.createGameState({ league: 'COLLEGE', week: 5, homeId: college.player.teamId, awayId: college.leagues.college.teams.find((x) => x.id !== college.player.teamId).id, userSide: 'home',
    weather: { weather: 'clear', tempF: 70, wind: { speed: 0, dir: 0 }, surface: 'grass', altitude: false, dome: false } });
  cgs.q = 5; cgs.ot = { period: 1, mode: 'COLLEGE' }; cgs.score = { home: 27, away: 27 };
  const cc = Kick.buildContext(college, cgs, { type: 'FG', distance: 30, isUser: true, hash: 0, rivalry: false, decisive: false });
  near(cc.pressure, 0.9, 1e-9, 'college OT base 0.9'); assert.equal(cc.ot, true);
  assert.equal(Kick.buildContext(college, cgs, { type: 'FG', distance: 30, isUser: true, hash: 0, rivalry: false }).pressure, 1, 'college OT decisive → 1');
  near(p({ pressure: 0.42 }).pressure, 0.42, 1e-9, 'explicit override'); assert.equal(p({ pressure: 0.7 }).clutch, true);
  const terms = Kick.pressureFor(state, dec, {}, { isUser: true, league: 'NFL', distance: 52, type: 'FG', attrs: P.rookie, side: 'home', team: null, opp: null });
  near(terms.terms.longDist, 0.07, 1e-12); near(terms.terms.late, 0.30, 1e-12); near(terms.terms.decisive, 0.30, 1e-12); assert.equal(terms.flags.decisive, true);
  near(Kick.iceProb(state, true), Tuning.difficulty[state.difficulty].iceProb, 1e-12);
  const famous = pfx.stateWith(RTG, { stage: 'NFL', attrs: P.rookie, fame: 600, difficulty: 'legend' });
  near(Kick.iceProb(famous, true), 0.85, 1e-12); near(Kick.iceProb(famous, false), Tuning.difficulty.pro.iceProb, 1e-12);
});

test('pMakeAt: monotone decreasing in distance, increasing in ACC; uses the game wind when a game is in progress', (t) => {
  if (!hasData) { t.skip(dataNote); return; }
  const state = pfx.stateWith(RTG, { stage: 'NFL', attrs: P.rookie });
  let prev = 1;
  for (let D = 20; D <= 65; D++) {
    const pm = Kick.pMakeAt(state, D);
    assert.ok(pm <= prev + 1e-9 && pm >= 0 && pm <= 1, 'D ' + D);
    prev = pm;
  }
  assert.ok(Kick.pMakeAt(state, 33, { type: 'PAT' }) > 0.85);
  let prevAcc = 0;
  for (let acc = 40; acc <= 99; acc += 5) {
    const pm = Kick.pMakeAt(state, 47, { attrs: { POW: 62, ACC: acc, CON: 55, CLU: 55, KO: 55 } });
    assert.ok(pm >= prevAcc - 1e-9, 'ACC ' + acc);
    prevAcc = pm;
  }
  const calm = Kick.pMakeAt(state, 50);
  const { gs } = nflSetup();
  gs.weather.wind = { speed: 18, dir: 90 };
  state.game = gs;
  const windy = Kick.pMakeAt(state, 50);
  assert.ok(windy < calm, 'crosswind lowers pMake');
  assert.ok(Kick.pMakeAt(state, 50, { calm: true }) > windy);
  assert.ok(Kick.pMakeAt(state, 50, { pressure: 0.9 }) < Kick.pMakeAt(state, 50, { pressure: 0.05 }));
  assert.ok(Kick.pMakeAt(null, 45, { attrs: P.elite }) > Kick.pMakeAt(null, 45, { attrs: P.college }), 'works without a state');
});

test('built contexts validate inside a KICKS session and survive JSON round trips', (t) => {
  if (!hasData) { t.skip(dataNote); return; }
  const { state, gs } = nflSetup();
  const contexts = [
    Kick.buildContext(state, gs, { type: 'FG', distance: 47, isUser: true }, RTG.RNG.create(1)),
    Kick.buildContext(state, null, { type: 'FG', distance: 55, hash: 0, isUser: true, forSession: true, pressure: 0.3 }),
    Kick.buildContext(state, gs, { type: 'PAT', isUser: true }, RTG.RNG.create(2))
  ];
  for (const c of contexts) {
    assert.deepEqual(J(c), J(JSON.parse(JSON.stringify(c))));
    for (const k of ['type', 'league', 'distance', 'hash', 'ballX', 'wind', 'weather', 'tempF', 'surface', 'altitude', 'dome', 'pressure', 'clutch', 'decisive', 'iced', 'playoff', 'rivalry', 'away', 'asTimeExpires', 'ot', 'oppST', 'isUser', 'difficulty', 'game', 'kicker']) assert.ok(k in c, 'KickContext.' + k);
  }
  state.game = null;
  state.pending = { kind: 'KICKS', session: { kind: 'PRACTICE', contexts, results: [Kick.resolve(RTG.RNG.create(3), contexts[0], null, { power: 0.95, aim: 0, quality: 0.9 })], idx: 1 } };
  const v = Schema.validate(state);
  assert.ok(v.ok, v.errors.join('; '));
  for (const name of Object.keys(kfx.all(RTG))) {
    const c = kfx.all(RTG)[name];
    state.pending.session.contexts = [c];
    assert.ok(Schema.validate(state).ok, 'fixture ' + name);
  }
});
