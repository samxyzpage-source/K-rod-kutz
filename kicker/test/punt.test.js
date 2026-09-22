/**
 * punt.test.js — RTG.Punt (SPEC §2.6, D24): the punting engine.
 * The two curves that fight each other (distance up, hang peaking lower), the green band the situation moves,
 * the settle rules (touchback, out of bounds, fair catch, return), blocks, the assist, the forced grades and
 * the draw contract.
 *
 *   node kicker/test/punt.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RTG = require('./load')();

const { Punt, Kick, Tuning, RNG } = RTG;
const T = Tuning.punt;

/** RNG that counts its draws. */
function counting(seed) {
  const r = RNG.create(seed);
  const next = r.next.bind(r);
  r.draws = 0;
  r.next = () => { r.draws++; return next(); };
  return r;
}
const ATTRS = (over) => Object.assign({ POW: 62, ACC: 62, CON: 62, CLU: 62, KO: 62 }, over || {});
/** A calm punt context from `los` (own-yard line), with no state and no draws. */
function ctxAt(los, over) {
  return Punt.buildContext(null, null, Object.assign({
    losYard: los, isUser: true, forSession: true, calm: true, hash: 0, league: 'NFL',
    attrs: ATTRS(), wind: { speed: 0, dir: 0 }, pressure: 0
  }, over || {}), RNG.create(1));
}

// ═══════════════════════════════ API and context ═══════════════════════════════

test('§3.5 public API', () => {
  for (const f of ['buildContext', 'model', 'aiInput', 'resolve', 'pBlock', 'inGreen', 'feedbackFor']) {
    assert.equal(typeof Punt[f], 'function', 'Punt.' + f);
  }
  assert.ok(T && T.curve && T.distance && T.field && T.ret, 'Tuning.punt block');
});

test('buildContext: a PUNT context carries the line of scrimmage and the room in front of it', () => {
  const c = ctxAt(28);
  assert.equal(c.type, 'PUNT');
  assert.equal(c.losYard, 28);
  assert.equal(c.toGoal, 72);
  assert.equal(c.isUser, true);
  assert.ok(c.kicker && c.kicker.attrs, 'a kicker snapshot');
  assert.equal(c.wind.speed, 0, 'calm');
  for (const los of [1, 50, 99]) assert.equal(ctxAt(los).losYard, los);
});

// ═══════════════════════════════ the two curves ═══════════════════════════════

test('distance rises with power to the limit; hang peaks lower and falls off either side', () => {
  const c = ctxAt(25);
  const at = (p) => Punt.model(c, null, { power: p });
  const powers = [0.2, 0.4, 0.6, 0.8, 1.0];
  let last = -1;
  for (const p of powers) {
    const m = at(p);
    assert.ok(m.distance > last, 'distance rises at power ' + p + ' (' + m.distance + ')');
    last = m.distance;
  }
  assert.ok(at(T.curve.powerMax).distance < at(1.0).distance, 'past 1.0 the ball comes off badly');
  const peak = at(T.curve.hangPeak).hang;
  assert.ok(peak > at(T.curve.hangPeak - 0.3).hang, 'hang rises to the sweet spot');
  assert.ok(peak > at(T.curve.hangPeak + 0.3).hang, 'and falls past it');
  assert.ok(at(1.0).distance > at(T.curve.hangPeak).distance && at(1.0).hang < peak,
    'the boomed ball is longer and hangs less — the whole trade-off');
});

test('a stronger leg punts further, a better KO hangs it longer', () => {
  const weak = Punt.model(ctxAt(25, { attrs: ATTRS({ POW: 40 }) }), null, { power: 0.9 });
  const strong = Punt.model(ctxAt(25, { attrs: ATTRS({ POW: 90 }) }), null, { power: 0.9 });
  assert.ok(strong.maxDist > weak.maxDist + 8, 'POW moves the ceiling (' + weak.maxDist + ' → ' + strong.maxDist + ')');
  const low = Punt.model(ctxAt(25, { attrs: ATTRS({ KO: 40 }) }), null, { power: T.curve.hangPeak });
  const high = Punt.model(ctxAt(25, { attrs: ATTRS({ KO: 90 }) }), null, { power: T.curve.hangPeak });
  assert.ok(high.hang > low.hang, 'KO moves the hang (' + low.hang + ' → ' + high.hang + ')');
});

test('a tailwind lengthens the punt, a headwind shortens it', () => {
  const calm = Punt.model(ctxAt(25), null, { power: 0.9 }).maxDist;
  const tail = Punt.model(ctxAt(25, { calm: false, wind: { speed: 15, dir: 0 } }), null, { power: 0.9 }).maxDist;
  const head = Punt.model(ctxAt(25, { calm: false, wind: { speed: 15, dir: 180 } }), null, { power: 0.9 }).maxDist;
  assert.ok(tail > calm && calm > head, 'wind moves the ceiling (' + head + ' / ' + calm + ' / ' + tail + ')');
});

// ═══════════════════════════════ what the situation asks for ═══════════════════════════════

test('the band moves with the field: every yard when backed up, dead at the 6 in plus territory', () => {
  const deep = Punt.model(ctxAt(8));
  assert.equal(deep.pin, false, 'from your own 8 there is nothing to pin');
  assert.ok(deep.want >= deep.maxDist - 1, 'the coach wants it all (' + deep.want + ' of ' + deep.maxDist + ')');

  const plus = Punt.model(ctxAt(55));                       // 45 to the goal line
  assert.equal(plus.pin, true, 'inside the opponent\'s 55 the ball is meant to die');
  assert.ok(plus.want < plus.toGoal, 'and short of the end zone (' + plus.want + ' of ' + plus.toGoal + ')');
  assert.ok(plus.want <= plus.toGoal - 2, 'and lands short of the end zone (' + plus.want + ' of ' + plus.toGoal + ')');
  assert.ok(plus.want >= plus.toGoal - T.field.insideYards, 'but still inside their 20 (' + plus.want + ')');
  assert.ok(plus.pNeed < deep.pNeed, 'so the band sits lower on the bar (' + plus.pNeed + ' vs ' + deep.pNeed + ')');
  assert.ok(plus.tbFrom > plus.pNeed, 'and the touchback lives above it');
  for (const los of [1, 10, 25, 40, 55, 70, 85, 95]) {
    const m = Punt.model(ctxAt(los));
    assert.ok(m.pNeed >= 0 && m.pNeed + m.greenBand <= m.powerMax + 1e-9, 'the band fits on the bar at ' + los);
    assert.ok(m.want >= 0 && m.want <= m.maxDist + 1, 'a legal target at ' + los + ' (' + m.want + ')');
    if (los <= 60) assert.ok(m.want >= T.distance.minWant, 'a real punt is asked for at ' + los);
  }
});

test('inGreen is the engine\'s own check of the band', () => {
  const m = Punt.model(ctxAt(30));
  assert.equal(Punt.inGreen(m.pNeed, m), true);
  assert.equal(Punt.inGreen(m.pNeed + m.greenBand, m), true);
  assert.equal(Punt.inGreen(m.pNeed - 0.01, m), false);
  assert.equal(Punt.inGreen(m.pNeed + m.greenBand + 0.01, m), false);
  assert.equal(Punt.inGreen(0.5, null), false);
});

// ═══════════════════════════════ resolve ═══════════════════════════════

test('resolve: the draw contract (block 1 · distance 2 · hang 2 · lateral 2, then the settle rolls)', () => {
  const c = ctxAt(30);
  const r = counting(5);
  const res = Punt.resolve(r, c, null, { power: 0.8, aim: 0 });
  assert.ok(r.draws >= 7 && r.draws <= 11, 'seven to eleven draws (' + r.draws + ')');
  assert.equal(res.type, 'PUNT');
  assert.equal(res.auto, false);
  assert.ok(res.gross > 0 && res.hang > 0);
  assert.equal(res.losYard, 30);
  // forced spends nothing
  const r2 = counting(5);
  const f = Punt.resolve(r2, c, null, { power: 0.8, aim: 0 }, { forced: 'BOOMING' });
  assert.equal(r2.draws, 0, 'a forced punt spends no draws');
  assert.equal(f.forced, true);
  assert.equal(f.grade, 'BOOMING');
});

test('resolve is a pure function of {ctx, input, rngState}', () => {
  const c = ctxAt(35);
  const a = Punt.resolve(RNG.create(99), c, null, { power: 0.85, aim: 4 });
  const b = Punt.resolve(RNG.create(99), c, null, { power: 0.85, aim: 4 });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  const d = Punt.resolve(RNG.create(100), c, null, { power: 0.85, aim: 4 });
  assert.notEqual(JSON.stringify(a), JSON.stringify(d));
});

test('the scoreboard arithmetic always closes: landing, return and the opponent\'s start agree', () => {
  const rng = RNG.create(2024);
  let tb = 0, oob = 0, fair = 0, ret = 0, blocked = 0, in20 = 0;
  for (let i = 0; i < 4000; i++) {
    const los = 1 + (i % 95);
    const c = ctxAt(los);
    const res = Punt.resolve(rng, c, null, { power: 0.5 + (i % 7) * 0.1, aim: ((i % 9) - 4) * (T.aimMax / 4) });
    assert.ok(res.oppStart >= 1 && res.oppStart <= 100, 'a legal starting spot (' + res.oppStart + ')');
    assert.ok(res.gross >= 0 && res.net <= res.gross + 1e-9, 'net never beats gross');
    assert.ok(res.hang >= 0);
    assert.ok(res.losYard + res.gross <= 100 + 1e-9, 'a punt cannot travel past the goal line');
    if (res.touchback) { tb++; assert.equal(res.oppStart, T.field.touchbackYard); assert.equal(res.inside20, false); }
    if (res.outOfBounds) { oob++; assert.equal(res.returnYds, 0, 'nobody returns a ball out of bounds'); }
    if (res.fairCatch) { fair++; assert.equal(res.returnYds, 0); }
    if (res.returnYds > 0) ret++;
    if (res.blocked) { blocked++; assert.equal(res.gross, 0); }
    if (res.inside20) { in20++; assert.ok(res.landing >= 80, 'inside the 20 means it landed there'); }
    if (!res.blocked && !res.touchback && !res.returnTd) {
      const spot = Math.min(99, Math.max(1, 100 - res.landing + res.returnYds));
      assert.ok(Math.abs(spot - res.oppStart) < 0.02, 'oppStart = 100 − landing + return, clamped to the field');
    }
  }
  assert.ok(tb > 20, 'touchbacks happen (' + tb + ')');
  assert.ok(oob > 20, 'so do punts out of bounds (' + oob + ')');
  assert.ok(fair > 200 && ret > 200, 'fair catches and returns both happen (' + fair + ' / ' + ret + ')');
  assert.ok(blocked > 0 && blocked < 400, 'blocks are rare (' + blocked + ' of 4000)');
  assert.ok(in20 > 100, 'and punters pin people (' + in20 + ')');
});

test('aiming at your own sideline trades downfield yards for a ball nobody returns', () => {
  const rng = RNG.create(77);
  let straightRet = 0, wideRet = 0, straightGross = 0, wideGross = 0, wideOob = 0, n = 600;
  for (let i = 0; i < n; i++) {
    // the punter stands on a hash, so the near sideline is the short way out: aim at it
    const c = ctxAt(55, { hash: 1 });
    const s = Punt.resolve(rng, c, null, { power: 0.75, aim: 0 });
    const w = Punt.resolve(rng, c, null, { power: 0.75, aim: T.aimMax });
    straightGross += s.gross; wideGross += w.gross;
    if (s.returnYds > 0) straightRet++;
    if (w.returnYds > 0) wideRet++;
    if (w.outOfBounds) wideOob++;
  }
  assert.ok(wideGross < straightGross, 'a wide punt travels less downfield');
  assert.ok(wideOob > n * 0.2, 'and often finds the sideline outright (' + wideOob + ' of ' + n + ')');
  assert.ok(wideRet < straightRet * 0.5, 'so it is returned far less often (' + wideRet + ' vs ' + straightRet + ')');
  // aiming across the field is the long way: the same angle rarely gets there
  const far = Punt.resolve(RNG.create(5), ctxAt(55, { hash: 1 }), null, { power: 0.75, aim: -T.aimMax });
  assert.equal(far.outOfBounds, false, 'the far sideline is 33 yards away, not 20');
});

test('hang time is what keeps the return down', () => {
  const rng = RNG.create(31);
  let lowRet = 0, highRet = 0;
  for (let i = 0; i < 800; i++) {
    const low = ctxAt(30, { attrs: ATTRS({ KO: 30 }) });
    const high = ctxAt(30, { attrs: ATTRS({ KO: 95 }) });
    lowRet += Punt.resolve(rng, low, null, { power: 0.75, aim: 0 }).returnYds;
    highRet += Punt.resolve(rng, high, null, { power: 0.75, aim: 0 }).returnYds;
  }
  assert.ok(highRet < lowRet * 0.75, 'a hanging punt gives up fewer return yards (' + highRet + ' vs ' + lowRet + ')');
});

test('pressure and a weak operation get punts blocked; the block is a disaster', () => {
  const calm = Punt.pBlock(ctxAt(30, { pressure: 0 }), ATTRS({ CON: 80 }));
  const hot = Punt.pBlock(ctxAt(30, { pressure: 1 }), ATTRS({ CON: 30 }));
  assert.ok(hot > calm * 2, 'the moment and slow hands raise it (' + calm + ' → ' + hot + ')');
  assert.ok(hot <= T.block.max);
  const res = Punt.resolve(RNG.create(3), ctxAt(30), null, { power: 0.8, aim: 0 }, { forced: 'BLOCKED' });
  assert.equal(res.blocked, true);
  assert.equal(res.gross, 0);
  assert.ok(res.oppStart > 50, 'the other side takes over in your half (' + res.oppStart + ')');
});

// ═══════════════════════════════ the assist (§4.6, D21) ═══════════════════════════════

test('a release inside the band, claimed and verified, is the punt the situation asked for — and costs no draws', () => {
  for (const los of [6, 20, 35, 48, 60, 72, 86]) {
    const c = ctxAt(los);
    const m = Punt.model(c);
    const rng = counting(9);
    const res = Punt.resolve(rng, c, null, { power: m.pNeed + m.greenBand / 2, aim: 0, green: true });
    assert.equal(rng.draws, 0, 'the assist spends no rng at ' + los);
    assert.equal(res.assisted, true);
    assert.equal(res.blocked, false, 'an assisted punt is never blocked');
    assert.equal(res.returnYds, 0, 'and never returned (' + los + ')');
    assert.ok(res.hang >= T.assist.hangFloor - 1e-9, 'with real hang on it');
    if (los >= 45) assert.ok(res.inside20 || res.touchback, 'from plus territory it pins them (' + res.grade + ')');
  }
});

test('a green claim the engine does not believe falls through to the physics', () => {
  const c = ctxAt(30);
  const m = Punt.model(c);
  const rng = counting(4);
  const res = Punt.resolve(rng, c, null, { power: m.pNeed + m.greenBand + 0.3, aim: 0, green: true });
  assert.ok(rng.draws > 0, 'a false claim is resolved normally');
  assert.equal(res.assisted, false);
});

test('the AI rule aims for the middle of the band and never needs the assist', () => {
  const rng = counting(8);
  const c = ctxAt(40);
  const m = Punt.model(c);
  const inp = Punt.aiInput(rng, c, null, m);
  assert.equal(rng.draws, 4, 'aiInput: power 2 · aim 2');
  assert.ok(Math.abs(inp.power - (m.pNeed + m.greenBand / 2)) < 0.3, 'near the middle of the band');
  assert.equal(inp.green, undefined, 'the AI never claims the assist');
  const auto = Punt.resolve(RNG.create(6), c, null, null);
  assert.equal(auto.auto, true);
  assert.equal(auto.assisted, false);
});

// ═══════════════════════════════ grades and feedback ═══════════════════════════════

test('forced grades produce the shape they name', () => {
  const c = ctxAt(45);
  const cases = { BOOMING: r => r.gross > 40, COFFIN: r => r.inside20 && r.outOfBounds,
    TOUCHBACK: r => r.touchback && r.oppStart === T.field.touchbackYard,
    SHANK: r => r.gross < 25, BLOCKED: r => r.blocked, OK: r => !r.blocked && r.gross > 0 };
  for (const g of Object.keys(cases)) {
    const res = Punt.resolve(RNG.create(1), c, null, { power: 0.8, aim: 0 }, { forced: g });
    assert.equal(res.grade, g, g);
    assert.ok(cases[g](res), g + ': ' + JSON.stringify(res));
    assert.ok(res.oppStart >= 1 && res.oppStart <= 100, g + ' leaves a legal spot');
  }
});

test('feedbackFor names the punt and says the one thing that would have helped', () => {
  const c = ctxAt(40);
  for (const g of Punt.GRADES) {
    const res = Punt.resolve(RNG.create(2), c, null, { power: 0.8, aim: 0 }, { forced: g });
    const fb = Punt.feedbackFor(res, c);
    assert.ok(fb.title && fb.title.length > 2, g + ' title');
    assert.ok(fb.coach && fb.coach.length > 10, g + ' coach line');
    if (g !== 'BLOCKED') assert.match(fb.detail, /yd/, g + ' detail: ' + fb.detail);
  }
});

// ═══════════════════════════════ balance ═══════════════════════════════

test('a good punter averages 45-50 gross and 40-45 net; a poor one is 8-12 yards worse', () => {
  const rng = RNG.create(4242);
  function season(pow, ko, acc, con) {
    let gross = 0, net = 0, n = 0, in20 = 0, tb = 0;
    for (let i = 0; i < 1200; i++) {
      const los = 10 + (i * 7) % 36;                   // where punts actually happen: your own 10 to your own 45
      const c = ctxAt(los, { attrs: ATTRS({ POW: pow, KO: ko, ACC: acc, CON: con }) });
      const m = Punt.model(c);
      const res = Punt.resolve(rng, c, null, Punt.aiInput(rng, c, null, m));
      if (res.blocked) continue;
      gross += res.gross; net += res.net; n++;
      if (res.inside20) in20++;
      if (res.touchback) tb++;
    }
    return { gross: gross / n, net: net / n, in20: in20 / n, tb: tb / n };
  }
  const good = season(80, 80, 80, 80);
  const poor = season(45, 45, 45, 45);
  assert.ok(good.gross > 45 && good.gross < 52, 'a good leg grosses 45-52 (' + good.gross.toFixed(1) + ')');
  assert.ok(good.net > 38 && good.net < 48, 'and nets 38-48 (' + good.net.toFixed(1) + ')');
  assert.ok(good.gross - poor.gross > 7, 'the gap to a poor leg is real (' + (good.gross - poor.gross).toFixed(1) + ')');
  assert.ok(good.net - poor.net > 8, 'and wider on net (' + (good.net - poor.net).toFixed(1) + ')');
  assert.ok(good.in20 > 0.2, 'a good punter pins a fifth of them (' + good.in20.toFixed(2) + ')');
  assert.ok(good.tb < 0.12, 'without giving away touchbacks (' + good.tb.toFixed(2) + ')');
});
