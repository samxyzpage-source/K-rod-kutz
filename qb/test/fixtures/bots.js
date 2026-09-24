/**
 * qb/test/fixtures/bots.js — headless players for QB v2 ("draw the pass"), reusable by tests and balance probes.
 *
 *   const Bots = require('./fixtures/bots')(RTG);     // RTG from qb/test/load.js (either realm)
 *   const res = Bots.playSnap('EXPERT', sim, live, botRng);        // one snap, driven step by step
 *   const d = Bots.drive('DECENT', { seed, archetype, team, venue });   // a six-moment drive through RTG.UI.Store
 *   Bots.withStore(RTG)                                  // evaluates qb/js/ui/store.js into the main realm (realm 'this')
 *
 * THE RULE: a bot decides from what a player can SEE — the live's positions and velocities (who is blocked, who is
 * running at the QB), the separation rings once they are shown (t ≥ revealAt), the routes on the play card
 * (sim.receivers[i].path: the card draws them), the RUSH chip (live.pressure), the draft chip (live.classify's kind and
 * target — everybody sees PASS / RUN and who it is for) and the preview colour ONLY when live.previewShown (the
 * FIELD GENERAL's perk). It never reads the real coverage, a defender's role / skill / react / trail, the rush's beatAt,
 * the ghost curves, sim.fit or the Live's rng, and it never rehearses the future on a private Live.
 * Every input goes through the scene's own rules: a finger line is classified, aim assist snaps a PASS line's end
 * within draw.assistYd of the spot its receiver can reach (settings default ON), and the commit is what the scene would
 * do with the line (PASS → throwAlong, THROWAWAY → throwAway, RUN → setRun). A decision costs real sim time: the
 * read interval (how often the player re-reads the field) and the draw time (a stroke takes real time; at slowMo it is
 * a few hundredths of a sim second for a flick, a tenth and more for a slow lob).
 *
 * The bots (Bots.BOTS; every one is a parameter set of the same brain, so their differences are the skill, not code):
 *   NOVICE      any card at random; looks up late (1.3–2.3 s), then waits for a man who LOOKS wide open (noisy eyes,
 *               3.6 yd) until his patience runs out (2.2–3.2 s) — a fast, flat line at where the man IS, dragged toward him
 *               until the chip says PASS (aim assist does the rest); no lane reading, no throw-aways, notices a free
 *               rusher late (0.45–0.8 s); on the last play he heaves it past the deepest man into the end zone
 *   DECENT      the best-advice card; a ring reader from 1.0–1.2 s: on a money down only past the sticks (the end zone on
 *               the last play) until 2.0 s, then anyone; the spot he can reach, loft by distance (a lob over a man in the
 *               lane); waits for green (3.2 yd), settles for gold (2.3) late, at 2.7 s or a noticed rusher (0.3–0.5 s)
 *               throws the best he has or throws it away
 *   EXPERT      the best-advice card; every read (0.08 s) he races the ball against the defence for every man × BULLET /
 *               TOUCH / LOB × straight or bent around a man in the lane × on him or led away from the nearest defender
 *               (his own eyes: the visible positions with a little noise, his arm's speed and arc, the hot ball); the
 *               FIELD GENERAL's preview colour confirms GREEN or vetoes RED; a progression (the big play first, the
 *               short one by 1.7 s; the sticks on a money down, only the end zone on the last play), settles as the
 *               pocket shrinks, slides away from a free rusher (noticed in 0.15–0.3 s), throws it away rather than into
 *               coverage
 *   CHECKDOWN   the back (the checkdown) every snap, as soon as he is reachable
 *   SCRAMBLER   (built for the DUAL THREAT) never throws: at the first moment the front shows a gap he draws a run
 *               through the widest one and up the field
 *   ROLLOUT     DECENT, plus: when a rusher is free he draws a rollout away from him and throws on the run
 *   LOB_ONLY / BULLET_ONLY   EXPERT restricted to one loft (1 / 0): the same reads, one touch
 *   DECENT_GOOD / DECENT_BAD DECENT forced onto a play rated GOOD / BAD vs the REAL coverage (the call experiment only —
 *               it reads ctx.real, which no player can; the probe uses it to measure what the call is worth)
 *   STATUE      never throws (the sack clock)
 *
 * Metrics: Bots.tally(records) → the box score plus sack %, tips, air yards, the decision rate (the share of pass
 * snaps that end in a pass the engine rated GREEN / GOLD at the release, a throw-away or a positive scramble — never a
 * RED ball, a sack or a pick), the intended air yards (aydPerAtt: the landing's depth past the line on every pass, caught
 * or not; deepPct: the share landing 20+ yd downfield) and EPA (Bots.epa: a linear first-and-ten expected-points curve, documented there).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const STORE_FILE = path.resolve(__dirname, '..', '..', 'js', 'ui', 'store.js');

function makeBots(RTG) {
  const Play = RTG.Play, Field = RTG.Field;
  const Q = () => RTG.Tuning.qb;
  const F = () => RTG.Tuning.qb.field;
  const W = () => RTG.Tuning.qb.draw;
  const hyp = Math.hypot;
  const clamp = (x, lo, hi) => (x < lo ? lo : (x > hi ? hi : x));
  const RANK = { GOOD: 0, OK: 1, BAD: 2 };
  const PREV = { GREEN: 2, GOLD: 1, RED: 0 };

  // ─────────────────────────── the brains ───────────────────────────
  //   card         'RANDOM' (any offered card) | 'BEST' (the best advice, pass cards) | 'GOOD' | 'BAD' (a pass play with that
  //                rating vs the REAL coverage — the probe's call experiment only; not a player's choice)
  //   every        s between reads · from: the first read · drawS: sim s a stroke costs at loft 0 / 1 (slowMo)
  //   eye          yd sd of his distance judgments (0 = exact) · sepSd: the extra noise on a ring not shown yet
  //   judge        'SEP' (the rings) | 'RACE' (the race to the spot and the lane, from his eyes; the preview when shown)
  //   lofts/bends/leads   the lines he considers (bends in yd off the chord's middle; leads: 0 = on him, 1 = led
  //                away from the nearest defender by leadYd)
  //   settle/clock the time he wants a safe ball until / settles by · need: the safety he wants early / late
  //   notice       s (a range, drawn per snap): how long after a rusher gets free (unblocked and closing) he acts on it —
  //                seeing him, and the finger getting to the QB (full speed: the slow motion only starts with the stroke)
  //   rollout      a rollout away from the pressure when the RUSH chip reaches rollAt or a free rusher is noticed; his
  //                clock runs rollClock s longer after it
  //   rollout      true: a free rusher → a rollout away from him (then keep reading)
  const BRAINS = {
    NOVICE: {
      card: 'RANDOM', every: 0.25, from: [1.3, 2.3], drawS: [0.04, 0.14], eye: 1.8, sepSd: 1.2, judge: 'SEP',
      lofts: 'NOVICE', target: 'WHERE', openSep: 3.6, clock: [2.2, 3.2],
      notice: [0.45, 0.8], away: false, sticks: false
    },
    DECENT: {
      card: 'BEST', every: 0.15, from: [1.0, 1.2], drawS: [0.03, 0.12], eye: 0.8, sepSd: 0.8, judge: 'SEP',
      lofts: 'DECENT', target: 'AIM', openSep: 3.2, lateSep: 2.3, settle: 2.0, clock: [2.7, 2.7], awaySep: 1.8,
      notice: [0.3, 0.5], away: true, sticks: true, laneCheck: true
    },
    EXPERT: {
      card: 'BEST', every: 0.08, from: 0.55, drawS: [0.02, 0.1], eye: 0.35, sepSd: 0.4, judge: 'RACE',
      lofts: [0, 0.5, 0.95], bends: [0, -4, 4], leads: [0, 1], leadYd: 1.5,
      need: [0.8, 0.55], settle: 1.7, clock: 2.7, vWant: [14, 6],
      notice: [0.15, 0.3], away: true, sticks: true, slide: true
    },
    CHECKDOWN: {
      card: 'BEST', every: 0.1, from: 0.6, drawS: [0.03, 0.1], eye: 0.8, sepSd: 0.8, judge: 'CHECKDOWN',
      lofts: [0.4], notice: [0.3, 0.5], away: true
    },
    SCRAMBLER: {
      card: 'BEST', every: 0.1, from: 0.7, drawS: [0.03, 0.1], eye: 0.8, sepSd: 0.8, judge: 'RUN', runBy: 1.5, notice: [0.3, 0.5]
    },
    STATUE: { card: 'BEST', judge: 'NONE' }
  };
  BRAINS.ROLLOUT = Object.assign({}, BRAINS.DECENT, { rollout: true, rollAt: 0.45, rollClock: 0.8 });
  BRAINS.DECENT_GOOD = Object.assign({}, BRAINS.DECENT, { card: 'GOOD' });   // the call experiment: DECENT forced onto a GOOD / BAD play vs the real coverage
  BRAINS.DECENT_BAD = Object.assign({}, BRAINS.DECENT, { card: 'BAD' });
  BRAINS.LOB_ONLY = Object.assign({}, BRAINS.EXPERT, { lofts: [1] });
  BRAINS.BULLET_ONLY = Object.assign({}, BRAINS.EXPERT, { lofts: [0] });
  for (const k of Object.keys(BRAINS)) BRAINS[k].name = k;
  const BOTS = Object.keys(BRAINS);

  // ─────────────────────────── seeing ───────────────────────────

  function stepTo(live, t) {
    const DT = F().dt;
    let guard = 0;
    while (live.phase !== 'DONE' && live.t < t - 1e-9 && guard++ < 2000) live.step(DT);
  }
  function finish(live) {
    let guard = 0;
    while (live.phase !== 'DONE' && guard++ < 2000) live.step(F().dt);
    return live.result();
  }
  function canPass(live) { return live.phase === 'PRE_THROW' && !live.ball && live.qb.hasBall && !live.qb.down && live.qb.y <= 0; }
  function attrsOf(sim) { return sim.ctx.qb.attrs; }
  function recIndex(sim, slot) { for (let i = 0; i < sim.receivers.length; i++) if (sim.receivers[i].slot === slot) return i; return -1; }

  /** The man's position on his route (the card draws the route) at time t. */
  function routeAt(sim, i, t) { return Field.pathAt(sim.receivers[i], t); }

  /**
   * The separation a player sees for receiver i: the ring's distance once it is shown, his own eyes before (the nearest
   * defender who is not in the backfield going after the QB), with his noise.
   */
  function sepSeen(live, i, brain, rng) {
    const r = live.receivers[i];
    if (r.shown) return r.sep + rng.gauss(0, brain.eye * 0.5);
    let best = Infinity;
    for (const d of live.defenders) {
      if (d.blocked || d.y < 0.5) continue;
      const dd = hyp(d.x - r.x, d.y - r.y);
      if (dd < best) best = dd;
    }
    return (isFinite(best) ? best : 8) + rng.gauss(0, brain.sepSd);
  }

  /** The nearest free threat to the QB: {ttc (s to contact at the closing speed), d (yd), x, y} or null. Visible: who is unblocked and closing. */
  function threat(live) {
    const q = live.qb, R = F().tackleR;
    let best = null;
    for (const d of live.defenders) {
      if (d.blocked) continue;
      const dx = q.x - d.x, dy = q.y - d.y, dist = hyp(dx, dy);
      if (dist > 9) continue;
      const closing = dist > 1e-6 ? ((d.vx - q.vx) * dx + (d.vy - q.vy) * dy) / dist : 0;
      if (closing <= 0.5 && dist > R + 1) continue;
      const ttc = Math.max(0, dist - R) / Math.max(closing, 3);
      if (!best || ttc < best.ttc) best = { ttc: ttc, d: dist, x: d.x, y: d.y };
    }
    return best;
  }

  /**
   * The free rusher he has NOTICED: a defender seen unblocked, closing on the QB within 8 yd, for at least the snap's
   * notice delay (st.notice). st keeps the first time each one was seen free. → threat() of the noticed ones or null.
   */
  function aware(live, st) {
    const q = live.qb;
    let noticed = false;
    for (const d of live.defenders) {
      if (d.blocked) continue;
      const dx = q.x - d.x, dy = q.y - d.y, dist = hyp(dx, dy);
      const closing = dist > 1e-6 ? ((d.vx - q.vx) * dx + (d.vy - q.vy) * dy) / dist : 0;
      if (dist < 8 && (closing > 1 || dist < 3)) {
        if (st.free[d.id] === undefined) st.free[d.id] = live.t;
        if (live.t - st.free[d.id] >= st.notice) noticed = true;
      }
    }
    return noticed ? threat(live) : null;
  }
  function watcher(brain, rng) { const n = brain.notice || [0.3, 0.3]; return { free: {}, notice: rng.float(n[0], n[1]) }; }

  /** A quadratic bend: QB → end with the middle bent `bend` yd off the chord (a drawn curve), 12 segments. */
  function bent(a, b, bend) {
    if (!bend) return [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, l = hyp(dx, dy) || 1;
    const cx = mx - dy / l * bend * 2, cy = my + dx / l * bend * 2;   // the control point: twice the bend (a quadratic's middle sits halfway)
    const out = [];
    for (let k = 0; k <= 12; k++) {
      const u = k / 12;
      out.push({ x: (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * cx + u * u * b.x, y: (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * cy + u * u * b.y });
    }
    return out;
  }
  function lengthOf(pts) { let s = 0; for (let k = 1; k < pts.length; k++) s += hyp(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y); return s; }

  /**
   * Where receiver i meets a ball of `loft` over a line bent `bend` yd, `lead` yd further along a unit direction (ux, uy):
   * the fixed point of the flight time (the card's route + the ball's speed he knows). → {end, pts, flight}.
   */
  function meet(live, sim, i, loft, bend, lead, ux, uy) {
    const q = live.qb, v = Field.ballSpeed(attrsOf(sim), loft);
    let end = routeAt(sim, i, live.t + 0.5), pts = null, fl = 0.5;
    for (let it = 0; it < 5; it++) {
      pts = bent(q, end, bend);
      fl = lengthOf(pts) / v;
      const p = routeAt(sim, i, live.t + fl);
      end = { x: clamp(p.x + ux * lead, sim.field.sideL + 0.5, sim.field.sideR - 0.5), y: p.y + uy * lead };
    }
    pts = bent(q, end, bend);
    return { end: end, pts: pts, flight: lengthOf(pts) / v };
  }

  /**
   * The scene's aim assist on a finger line (playview.js assistFor): a PASS line to a target whose end is within
   * draw.assistYd of the spot he can reach has its tail shifted onto that spot (the offset growing along the line),
   * kept only when it still classifies as a PASS to him. → {pts, c} (the original when nothing snaps).
   */
  function assist(live, sim, pts, loft, c) {
    if (!c || c.kind !== 'PASS' || !c.target || pts.length < 2) return { pts: pts, c: c };
    const i = recIndex(sim, c.target);
    if (i < 0) return { pts: pts, c: c };
    const q = live.qb, e = pts[pts.length - 1], straight = hyp(e.x - q.x, e.y - q.y) || 1, len = lengthOf(pts), stretch = Math.max(1, len / straight);
    let spot;
    if (stretch < 1.04) { const a = live.aim(c.target, loft); if (!a) return { pts: pts, c: c }; spot = a; }
    else {
      spot = { x: live.receivers[i].x, y: live.receivers[i].y };
      for (let k = 0; k < 6; k++) spot = routeAt(sim, i, live.t + hyp(spot.x - q.x, spot.y - q.y) * stretch / Field.ballSpeed(attrsOf(sim), loft));
    }
    const ox = spot.x - e.x, oy = spot.y - e.y, R = W().assistYd;
    if (ox * ox + oy * oy > R * R || ox * ox + oy * oy < 0.0025) return { pts: pts, c: c };
    const out = [];
    let acc = 0;
    for (let k = 0; k < pts.length; k++) {
      if (k) acc += hyp(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
      const w = len > 0 ? acc / len : 1;
      out.push({ x: pts[k].x + ox * w, y: pts[k].y + oy * w });
    }
    const c2 = live.classify(out, loft);
    return c2.kind === 'PASS' && c2.target === c.target ? { pts: out, c: c2 } : { pts: pts, c: c };
  }

  /**
   * His own race (the RACE judge without the preview): from the visible positions only, the ball's flight (his arm he
   * knows), the defenders' distance to the spot and to the low part of the flight (rule of thumb: a defender needs
   * about 0.35 s to see it and runs about 8 yd/s; the ball is under a man's hands below ~3.2 yd). → {p (0..1 his
   * confidence the ball is safe), lane, spot} (0 draws on the game).
   */
  function eyeRace(live, sim, pts, loft, targetIdx, brain, rng) {
    const attrs = attrsOf(sim), v = Field.ballSpeed(attrs, loft), len = lengthOf(pts), fl = len / v, apex = Field.apex(fl, loft);
    const end = pts[pts.length - 1], rec = live.receivers[targetIdx];
    // the spot: the ball's lead on the first defender who can get there (the target excluded)
    let spotLead = Infinity;
    for (const d of live.defenders) {
      if (d.blocked) continue;
      const dd = Math.max(0, hyp(d.x - end.x, d.y - end.y) + rng.gauss(0, brain.eye) - 1.6);
      const tDef = 0.35 + dd / 8.2;
      if (tDef - fl < spotLead) spotLead = tDef - fl;
    }
    // the target: he gets there (the chip said PASS); his lead is the room between him and the spot's first defender
    const p = routeAt(sim, targetIdx, live.t + fl), recLate = Math.max(0, hyp(p.x - end.x, p.y - end.y) - 1.0) / 8.5;
    // the lane: the low part of the flight (under a man's hands) passing a defender who can get there
    let lane = 0;
    const cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + hyp(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
    const steps = Math.max(4, Math.ceil(len / 1.5));
    for (let s = 1; s < steps; s++) {
      const arc = len * s / steps;
      if (arc > len - 2.5) break;
      const u = arc / len, h = Field.heightAt(u, apex);
      if (h > 3.2) continue;
      let k = 1;
      while (k < cum.length - 1 && cum[k] < arc) k++;
      const f = (arc - cum[k - 1]) / Math.max(1e-9, cum[k] - cum[k - 1]);
      const x = pts[k - 1].x + (pts[k].x - pts[k - 1].x) * f, y = pts[k - 1].y + (pts[k].y - pts[k - 1].y) * f;
      const tau = arc / v, reachYd = 1.3 + Math.max(0, tau - 0.35) * 3;
      for (const d of live.defenders) {
        const dd = hyp(d.x - x, d.y - y) + rng.gauss(0, brain.eye * 0.5);
        if (dd > reachYd) continue;
        const low = clamp((3.2 - h) / 0.8, 0.2, 1) * (d.blocked ? 0.15 : 1) * (1 - dd / (reachYd + 0.5));
        if (low > lane) lane = low;
      }
    }
    const pSpot = clamp((spotLead - recLate + 0.05) / 0.45, 0, 1);
    // a hot ball: he has learned that a flat, fast ball over a short flight is hard to handle (the coach says so)
    const C = F().catch, hot = (C.heat || 0) * clamp(1 - fl / Math.max(1e-9, C.heatT || 1), 0, 1) * clamp(1 - loft / Math.max(1e-9, C.heatLoft || 1), 0, 1);
    return { p: pSpot * (1 - 0.85 * lane) * (1 - hot), lane: lane, spot: spotLead - recLate, flight: fl };
  }

  /** The value of a completion at the end of a line: air yards, the sticks on a money down, the end zone when only a TD counts. */
  function valueOf(sim, end, room) {
    const sit = sim.ctx.situation, goal = sim.field.goalY, y = Math.min(end.y, goal);
    const yac = clamp(room * 2.5, 0, 8);
    const gain = y + yac;
    if (sit.lastPlay) return end.y >= goal - 0.3 ? 100 : (gain >= goal ? 12 : 1 + gain * 0.05);   // only a TD counts; a run after the catch rarely gets there
    let v = Math.max(0.5, gain);
    if (end.y >= goal - 0.3) v += 25;
    if (sit.down >= 3) v = gain >= sit.toGo ? v + 12 : v * 0.35;
    return v;
  }

  // ─────────────────────────── acting (the scene's rules) ───────────────────────────

  /** Wait `s` sim seconds (the stroke's time), then commit the line as the scene would. → the commit's kind. */
  function commitAfter(live, sim, pts, loft, s, brain) {
    stepTo(live, live.t + s);
    if (!canPass(live) && live.phase !== 'SCRAMBLE') return null;
    const q = live.qb;
    const line = [{ x: q.x, y: q.y }].concat(pts.slice(1));
    let c = live.classify(line, loft), use = line;
    const a = assist(live, sim, line, loft, c);
    c = a.c; use = a.pts;
    if (c.kind === 'PASS') { live.throwAlong(use, loft); return 'PASS'; }
    if (c.kind === 'THROWAWAY') { live.throwAway(); return 'THROWAWAY'; }
    if (c.kind === 'RUN') { live.setRun(use); return 'RUN'; }
    return null;
  }

  function throwAway(live, brain) {
    stepTo(live, live.t + brain.drawS[0]);
    if (canPass(live)) { live.throwAway(); return true; }
    return false;
  }

  /** Where the pressure comes from (the RUSH chip's side): the nearest rusher still engaged or free, as a threat-like {x, y}. */
  function pressureSide(live) {
    const q = live.qb;
    let best = null, bd = Infinity;
    for (const d of live.defenders) { if (d.y > 2.5) continue; const dd = hyp(d.x - q.x, d.y - q.y); if (dd < bd) { bd = dd; best = d; } }
    return best ? { x: best.x, y: best.y, ttc: 1, d: bd } : { x: q.x + 1, y: q.y, ttc: 1, d: 9 };
  }
  /** A rollout / slide away from the free threat: lateral `yd` away from him, `back` yd deeper. */
  function rollAway(live, sim, th, yd, back) {
    const q = live.qb, dir = th.x > q.x ? -1 : 1, f = sim.field;
    const x = clamp(q.x + dir * yd, f.sideL + 4, f.sideR - 4);
    live.setRun([{ x: q.x, y: q.y }, { x: x, y: Math.min(-1.5, q.y - back) }]);
  }

  // ─────────────────────────── the policies ───────────────────────────

  function loftsOf(brain, dist, rng) {
    if (brain.lofts === 'NOVICE') return [clamp(rng.float(0, 0.45), 0, 1)];
    if (brain.lofts === 'DECENT') return [dist < 12 ? 0.25 : (dist < 22 ? 0.5 : 0.75)];
    return brain.lofts;
  }

  /**
   * NOVICE / DECENT / ROLLOUT: the ring reader. From `from` (a range: drawn per snap) he reads every `every` s: the man
   * who looks most open (past the sticks on a money down when he knows the sticks); he throws when that man's seen
   * separation reaches openSep (lateSep after `settle`), and at his clock (a range) or when a free rusher is about to
   * hit him (threatTtc) he throws the best he has — or throws it away when that is under awaySep and he knows to.
   */
  function ringReader(live, sim, brain, rng, note) {
    const sit = sim.ctx.situation, from = rng.float(brain.from[0], brain.from[1]);
    let clock = rng.float(brain.clock[0], brain.clock[1]);
    const st = watcher(brain, rng);
    let rolled = false;
    stepTo(live, brain.rollout ? Math.min(from, 0.6) : from);
    while (live.phase === 'PRE_THROW') {
      if (!canPass(live)) break;
      const th = aware(live, st);
      let forced = !!th || live.t >= clock;
      if (brain.rollout && !rolled && (th || (live.t >= 1.0 && live.pressure >= brain.rollAt))) {
        rollAway(live, sim, th || pressureSide(live), 10, 1); rolled = true; note.rolled = true; st.free = {};
        clock += brain.rollClock; forced = live.t >= clock;
      }
      if (live.t >= from - 1e-9 || forced) {
        const need = brain.settle && live.t >= brain.settle ? brain.lateSep : brain.openSep;
        // a money down: until he settles he only looks past the sticks (the end zone on the last play)
        const sticksY = brain.sticks && brain.settle && live.t < brain.settle && !forced ? (sit.lastPlay ? sim.field.goalY - 1 : (sit.down >= 3 ? sit.toGo : -Infinity)) : -Infinity;
        let best = null;
        for (let i = 0; i < live.receivers.length; i++) {
          const sep = sepSeen(live, i, brain, rng);
          const r = live.receivers[i];
          const dist = hyp(r.x - live.qb.x, r.y - live.qb.y);
          const loft = loftsOf(brain, dist, rng)[0];
          let pts;
          if (brain.target === 'WHERE' && sit.lastPlay) {   // the heave: a long line past the deepest man into the end zone
            const f = sim.field, ey = clamp(Math.max(r.y + 6, f.goalY + 2), 0, f.endY - 1);
            pts = [{ x: live.qb.x, y: live.qb.y }, { x: clamp(r.x + rng.gauss(0, 1.5), f.sideL + 1, f.sideR - 1), y: ey + rng.gauss(0, 1) }];
          } else if (brain.target === 'WHERE') pts = [{ x: live.qb.x, y: live.qb.y }, { x: r.x + rng.gauss(0, 0.8), y: r.y + rng.gauss(0, 0.8) }];
          else { const a = live.aim(r.slot, loft); if (!a || a.tooLong) continue; pts = a.points; }
          if (pts[pts.length - 1].y < sticksY) continue;
          let score = sep;
          if (!brain.sticks && sit.lastPlay) score = r.y / 4 + Math.min(sep, 3);   // even a novice knows the last play is a shot at the end zone
          if (brain.sticks && sit.down >= 3 && !sit.lastPlay && pts[1].y >= sit.toGo) score += 1.2;
          if (brain.sticks && sit.lastPlay) score += pts[1].y >= sim.field.goalY - 1 ? 3 : -2;
          if (!best || score > best.score) best = { i, sep, loft, pts, score };
        }
        if (best && !brain.sticks && sit.lastPlay) best.loft = rng.float(0.45, 1);   // a heave
        const go = best && (best.sep >= need || forced || (!brain.sticks && sit.lastPlay && best.sep >= 2.2));
        if (go && forced && best.sep < need && brain.away && best.sep < brain.awaySep && !sit.lastPlay) {
          if (throwAway(live, brain)) { note.commit = 'AWAY'; break; }
        } else if (go) {
          if (brain.laneCheck) {                               // a man in the lane: loft it over him
            const e = eyeRace(live, sim, best.pts, best.loft, best.i, brain, rng);
            if (e.lane > 0.5) best.loft = Math.max(best.loft, 0.85);
          }
          let pts = best.pts;
          if (brain.target === 'WHERE') pts = dragToPass(live, sim, pts, best.loft, best.i);
          note.decision = { t: live.t, slot: live.receivers[best.i].slot, loft: best.loft, sep: best.sep };
          const k = commitAfter(live, sim, pts, best.loft, brain.drawS[0] + (brain.drawS[1] - brain.drawS[0]) * best.loft, brain);
          if (k) { note.commit = k; if (k !== 'RUN') break; }
        }
      }
      stepTo(live, live.t + brain.every);
    }
    return finish(live);
  }

  /** The novice's adjustment: he drew at the man; he drags the end along the man's route until the chip says PASS (for him). */
  function dragToPass(live, sim, pts, loft, i) {
    const q = live.qb;
    for (let k = 0; k < 8; k++) {
      const c = live.classify(pts, loft);
      if (c.kind === 'PASS' && c.target === sim.receivers[i].slot) return pts;
      const p = routeAt(sim, i, live.t + 0.15 * (k + 1));
      const e = pts[pts.length - 1];
      pts = [{ x: q.x, y: q.y }, { x: e.x + (p.x - e.x) * 0.5, y: e.y + (p.y - e.y) * 0.5 }];
    }
    return pts;
  }

  /** EXPERT (and the one-loft variants): the race for every line he can draw. */
  function racer(live, sim, brain, rng, note) {
    const sit = sim.ctx.situation, st = watcher(brain, rng);
    let slid = false;
    stepTo(live, brain.from);
    while (live.phase === 'PRE_THROW') {
      if (!canPass(live)) break;
      const th = aware(live, st);
      if (brain.slide && !slid && th && th.ttc >= 0.3) { rollAway(live, sim, th, 6, 0.5); slid = true; note.rolled = true; }
      const panic = !!th && th.ttc < 0.3;
      const t = live.t, u = clamp((t - brain.settle) / Math.max(0.05, brain.clock - brain.settle), 0, 1);
      const need = brain.need[0] + (brain.need[1] - brain.need[0]) * u;
      let best = null, bestAny = null;
      for (let i = 0; i < live.receivers.length; i++) {
        const r = live.receivers[i];
        // the direction away from the nearest defender (throw him open)
        let nd = null, ndD = Infinity;
        for (const d of live.defenders) { if (d.blocked) continue; const dd = hyp(d.x - r.x, d.y - r.y); if (dd < ndD) { ndD = dd; nd = d; } }
        const ax = nd ? r.x - nd.x : 0, ay = nd ? r.y - nd.y : 1, al = hyp(ax, ay) || 1;
        for (const loft of brain.lofts) {
          for (const bend of brain.bends) {
            for (const lead of brain.leads) {
              if (lead && ndD > 4) continue;
              const m = meet(live, sim, i, loft, bend, lead ? brain.leadYd : 0, ax / al, ay / al);
              if (m.end.y > sim.field.endY - 0.5) continue;
              let c = live.classify(m.pts, loft);
              if (c.kind !== 'PASS' || c.target !== r.slot || c.tooLong) continue;
              const e = eyeRace(live, sim, m.pts, loft, i, brain, rng);
              let p = e.p;
              const room = e.spot;
              if (live.previewShown) p = c.preview === 'GREEN' ? Math.max(p, 0.92) : (c.preview === 'RED' ? Math.min(p, 0.3) : p);   // the FIELD GENERAL: the colour confirms or vetoes his eyes
              const val = valueOf(sim, m.end, room);
              const cand = { i, loft, bend, lead, pts: m.pts, p, val, score: p * val - (1 - p) * 6 };
              if (!bestAny || cand.score > bestAny.score) bestAny = cand;
              if (p >= need && (!best || cand.score > best.score)) best = cand;
            }
          }
        }
        if (sit.lastPlay) {                                   // the last play: a ball into the end zone he can run under
          const f = sim.field;
          for (const loft of brain.lofts) {
            for (const dy of [2, 5]) {
              const fl0 = (hyp(r.x - live.qb.x, f.goalY + dy - live.qb.y)) / Field.ballSpeed(attrsOf(sim), loft);
              const p0 = routeAt(sim, i, live.t + fl0);
              const pts = [{ x: live.qb.x, y: live.qb.y }, { x: clamp(p0.x, f.sideL + 1, f.sideR - 1), y: Math.min(f.endY - 1, f.goalY + dy) }];
              const c = live.classify(pts, loft);
              if (c.kind !== 'PASS' || c.target !== r.slot || c.tooLong) continue;
              const e = eyeRace(live, sim, pts, loft, i, brain, rng);
              let p = e.p;
              if (live.previewShown) p = c.preview === 'GREEN' ? Math.max(p, 0.92) : (c.preview === 'RED' ? Math.min(p, 0.3) : p);
              const cand = { i, loft, bend: 0, lead: 0, pts, p, val: 100, score: p * 100 - (1 - p) * 6 };
              if (!bestAny || cand.score > bestAny.score) bestAny = cand;
              if (p >= need && (!best || cand.score > best.score)) best = cand;
            }
          }
        }
      }
      // a progression: early he wants the big play, then works down to the short one (vWant: the value he wants at the
      // first read → at settle)
      if (sit.lastPlay && best && best.val < 50) best = null;   // the last play: a ball short of the end zone is not an answer until he has to
      const vWant = sit.lastPlay ? 50 : brain.vWant[0] + (brain.vWant[1] - brain.vWant[0]) * clamp((t - brain.from) / Math.max(0.05, brain.settle - brain.from), 0, 1);
      const wantsMore = best && !panic && t < brain.settle && valueOf(sim, best.pts[best.pts.length - 1], 0) < vWant;
      if (best && !wantsMore) { if (fire(live, sim, best, brain, note)) break; }
      else if (panic || t >= brain.clock) {
        if (bestAny && bestAny.p >= 0.4 && !(sit.lastPlay && bestAny.val < 50)) { if (fire(live, sim, bestAny, brain, note)) break; }
        else if (sit.lastPlay && bestAny && (panic || t >= brain.clock + 0.3)) { if (fire(live, sim, bestAny, brain, note)) break; }
        else if (!sit.lastPlay && brain.away && throwAway(live, brain)) { note.commit = 'AWAY'; break; }
      }
      stepTo(live, live.t + brain.every);
    }
    return finish(live);
  }
  function fire(live, sim, cand, brain, note) {
    note.decision = { t: live.t, slot: live.receivers[cand.i].slot, loft: cand.loft, bend: cand.bend, lead: cand.lead, p: cand.p };
    const k = commitAfter(live, sim, cand.pts, cand.loft, brain.drawS[0] + (brain.drawS[1] - brain.drawS[0]) * cand.loft, brain);
    note.commit = k;
    return k === 'PASS' || k === 'THROWAWAY';
  }

  /** CHECKDOWN: the checkdown man, as soon as the chip says PASS to him. */
  function checkdown(live, sim, brain, rng, note) {
    const slot = sim.checkdown || 'RB', i = recIndex(sim, slot), st = watcher(brain, rng);
    stepTo(live, brain.from);
    while (live.phase === 'PRE_THROW' && canPass(live)) {
      const a = live.aim(slot, brain.lofts[0]);
      const th = aware(live, st);
      if (a && !a.tooLong) {
        const c = live.classify(a.points, brain.lofts[0]);
        if (c.kind === 'PASS' && c.target === slot) { note.decision = { t: live.t, slot, loft: brain.lofts[0] }; if (commitAfter(live, sim, a.points, brain.lofts[0], brain.drawS[0], brain) === 'PASS') break; }
      }
      if (th && throwAway(live, brain)) { note.commit = 'AWAY'; break; }
      stepTo(live, live.t + brain.every);
    }
    if (i < 0) note.noCheckdown = true;
    return finish(live);
  }

  /**
   * SCRAMBLER: the widest gap in the front (the visible defenders between the QB and 7 yd downfield, blocked ones where
   * they stand), a run through it at the line and 12 yd up the field (the engine's carrier logic takes over after).
   */
  function scrambler(live, sim, brain, rng, note) {
    stepTo(live, brain.from);
    const f = sim.field, st = watcher(brain, rng);
    let ran = false;
    while (live.phase === 'PRE_THROW' && !ran) {
      const q = live.qb, xs = [f.sideL + 1, f.sideR - 1];
      for (const d of live.defenders) if (d.y > q.y - 1 && d.y < 7) xs.push(d.x);
      xs.sort((a, b) => a - b);
      let best = null;
      for (let k = 1; k < xs.length; k++) {
        const w = xs[k] - xs[k - 1], mid = (xs[k] + xs[k - 1]) / 2;
        const score = w - Math.abs(mid - q.x) * 0.35;
        if (w >= 3 && (!best || score > best.score)) best = { mid, w, score };
      }
      const th = aware(live, st);
      if ((best && best.w >= 6) || live.t >= brain.runBy || th) {
        const gx = best ? best.mid : q.x;
        note.decision = { t: live.t, gap: best ? best.w : 0 };
        const pts = [{ x: q.x, y: q.y }, { x: gx, y: 1 }, { x: clamp(gx, f.sideL + 3, f.sideR - 3), y: 13 }];
        stepTo(live, live.t + brain.drawS[0]);
        if (live.phase === 'PRE_THROW') { const r = live.setRun([{ x: live.qb.x, y: live.qb.y }].concat(pts.slice(1))); ran = r.ok; note.commit = 'RUN'; }
        break;
      }
      stepTo(live, live.t + brain.every);
    }
    return finish(live);
  }

  /** Play one snap with a bot: sim + live (Play.live) + the bot's own rng (never the game's). → the PlayResult (+ .bot note). */
  function playSnap(name, sim, live, rng) {
    const brain = typeof name === 'object' ? name : BRAINS[name];
    if (!brain) throw new Error('bots: unknown bot ' + name);
    const note = { bot: brain.name || name };
    let res;
    if (sim.run) return sim;
    switch (brain.judge) {
      case 'SEP': res = ringReader(live, sim, brain, rng, note); break;
      case 'RACE': res = racer(live, sim, brain, rng, note); break;
      case 'CHECKDOWN': res = checkdown(live, sim, brain, rng, note); break;
      case 'RUN': res = scrambler(live, sim, brain, rng, note); break;
      default: res = finish(live);
    }
    res.botNote = note;
    return res;
  }

  /** The card a bot calls from ctx.options (the scene's cards). */
  function pickCard(name, ctx, rng) {
    const brain = typeof name === 'object' ? name : BRAINS[name];
    const pass = ctx.options.filter((o) => !o.run);
    if (brain.card === 'RANDOM') return rng.pick(ctx.options).id;
    if (brain.card === 'GOOD' || brain.card === 'BAD') {
      const cands = RTG.Data.plays.plays.filter((p) => !p.run && p.vs[ctx.real] === brain.card);
      return cands.length ? rng.pick(cands).id : pass[0].id;
    }
    const s = pass.slice().sort((a, b) => RANK[a.advice] - RANK[b.advice]);
    return s[0].id;
  }

  // ─────────────────────────── single snaps and drives ───────────────────────────

  const QB_ATTRS = { AVG: { ARM: 55, ACC: 55, IQ: 55, MOB: 55, POI: 55 } };
  /** A situation for single-snap probes: {team, archetype, attrs, sit, tendency}. */
  function situation(opts) {
    opts = opts || {};
    const T = Q(), team = T.demo.teams[opts.team || 'AVERAGE'], arch = opts.archetype || 'FIELD_GENERAL';
    return Object.assign({ down: 3, toGo: 6, yl: 40, quarter: 2, clock: 500, score: { us: 7, them: 10 } }, opts.sit || {}, {
      qb: { archetype: arch, attrs: Object.assign({}, opts.attrs || T.archetypes[arch]) },
      team: { ol: team.ol, wr: team.wr }, opp: Object.assign({ dl: team.dl, db: team.db }, opts.tendency ? { tendency: opts.tendency } : {})
    });
  }
  /** One snap end to end: buildContext → card → snap → live → the bot. 3 parent draws on the game rng. */
  function snapWith(name, gameSeed, botSeed, opts) {
    const rng = RTG.RNG.create(gameSeed), brng = RTG.RNG.create(botSeed === undefined ? gameSeed * 7 + 1 : botSeed);
    const ctx = Play.buildContext(situation(opts), rng);
    const sim = Play.snap(ctx, (opts && opts.card) || pickCard(name, ctx, brng), rng);
    const live = Play.live(sim, rng);
    const res = sim.run ? sim : playSnap(name, sim, live, brng);
    return { ctx, sim, live, res };
  }

  /** Evaluate qb/js/ui/store.js into the main realm (RTG must be globalThis.RTG, i.e. load({realm: 'this'})). */
  function withStore() {
    if (RTG.UI && RTG.UI.Store) return RTG.UI.Store;
    if (globalThis.RTG !== RTG) throw new Error('bots.withStore: load the engine with {realm: "this"}');
    vm.runInThisContext(fs.readFileSync(STORE_FILE, 'utf8'), { filename: STORE_FILE });
    return RTG.UI.Store;
  }

  /**
   * A six-moment drive through the real store (situations, the yard-line advance, the scoreboard, the box score):
   * opts {seed, archetype, team, venue, botSeed}. → {summary, records: [{kind, sit, res (lean), note, run}]}.
   */
  function drive(name, opts) {
    const Store = withStore();
    const store = new Store();
    store.newDrive({ seed: opts.seed, archetype: opts.archetype, team: opts.team, venue: opts.venue || 'COLLEGE' });
    const brng = RTG.RNG.create(opts.botSeed === undefined ? (opts.seed * 2654435761) >>> 0 : opts.botSeed);
    const records = [];
    let guard = 0;
    while (!store.isDone() && guard++ < 12) {
      if (store.pending() === 'STORY') store.next();
      const ctx = store.context();
      const sit = ctx.situation;
      const card = pickCard(name, ctx, brng);
      const sim = store.snap(card);
      let res, plan = null;
      if (sim.run) res = sim;
      else {
        const live = store.live(sim);
        res = playSnap(name, sim, live, brng);
        plan = live.plan();
      }
      store.record(res, sim, { plan: plan });
      records.push({ kind: ctx.kind, sit: { down: sit.down, toGo: sit.toGo, yl: sit.yl, lastPlay: !!sit.lastPlay }, card, run: !!sim.run, real: ctx.real, fit: sim.fit || null, res: lean(res), note: res.botNote || null });
    }
    return { summary: store.summary(), records };
  }
  /** The fields of a result the tallies need. */
  function lean(r) {
    return { outcome: r.outcome, kind: r.kind, yards: r.yards, airYards: r.airYards, yac: r.yac, td: r.td, firstDown: r.firstDown, turnover: r.turnover,
      text: r.text, ended: r.ended, preview: r.preview || null, loft: r.loft, target: r.target, t: r.t, endT: r.endT, escaped: r.escaped || 0,
      landingY: r.landing ? r.landing.y : 0, running: r.release ? r.release.running : 0, sd: r.release ? r.release.sd : 0, miss: r.miss, tooLong: r.tooLong, placement: r.feedback ? r.feedback.placement : null, timing: r.feedback ? r.feedback.timing : null };
  }

  // ─────────────────────────── the numbers ───────────────────────────

  /**
   * Expected points, a linear first-and-ten curve: EP1(yl) = −0.4 + 0.066 × yl (own goal 0: ≈ 0.9 at the 20, 2.9 at
   * midfield, 4.9 at their 20, 6.1 at their 1); a later down costs [0, 0.45, 1.1, 2.0] and 0.05 per yard to go past 10
   * (× down / 2). After the snap: a TD 7; a pick −EP1 of their spot (the ball at our yl + 10); a first down EP1 of the new
   * spot; a failed 3rd down a field goal from their 35 in (3 × a make rate from 40 % at the 35 to 95 %) or a punt 40 yd
   * (a touchback at their 20); a failed 4th down −EP1 of their spot; else the next down. The last play is excluded
   * (only a TD counts there; see lastPlayWin).
   */
  function ep1(yl) { return -0.4 + 0.066 * clamp(yl, 1, 99); }
  function epDown(yl, down, toGo) { return ep1(yl) - [0, 0.45, 1.1, 2.0][clamp(down, 1, 4) - 1] - 0.05 * Math.max(0, toGo - 10) * down / 2; }
  function epa(sit, r) {
    const before = epDown(sit.yl, sit.down, sit.toGo);
    const spot = clamp(sit.yl + (r.yards || 0), 1, 99);
    let after;
    if (r.td) after = 7;
    else if (r.outcome === 'INT' || r.turnover) after = -ep1(100 - clamp(sit.yl + 10, 1, 99));
    else if (r.firstDown) after = ep1(spot);
    else if (sit.down === 3) after = spot >= 65 ? 3 * clamp(0.4 + (spot - 65) / 40, 0, 0.95) : -ep1(Math.max(20, 100 - spot - 40));
    else if (sit.down >= 4) after = -ep1(100 - spot);
    else after = epDown(spot, sit.down + 1, sit.toGo - (r.yards || 0));
    return after - before;
  }

  /**
   * The tallies over drive records (or single-snap {res, sit}): passing (att / cmp / int / tips / air yards), sacks per
   * pass snap, scrambles, yards per play, first downs, TDs, the last-play win rate, the decision rate, EPA per play
   * (the last play excluded) and the call.
   */
  function counters() {
    return { snaps: 0, passSnaps: 0, att: 0, cmp: 0, int: 0, tip: 0, drop: 0, away: 0, sack: 0, scr: 0, scrYds: 0, runCards: 0, yds: 0, playYds: 0,
      air: 0, airCmp: 0, ayd: 0, aydN: 0, deep: 0, fd: 0, td: 0, last: 0, lastWin: 0, good: 0, epa: 0, epaN: 0, rolled: 0, missSum: 0, missN: 0, sdSum: 0, sdN: 0 };
  }
  /** Add raw counters b into a (both from counters() / tally(…, acc)). */
  function merge(a, b) { for (const k of Object.keys(counters())) a[k] += b[k] || 0; return a; }
  function tally(records, acc) {
    const c = acc || counters();
    for (const rec of records) {
      const r = rec.res, sit = rec.sit;
      c.snaps++;
      c.playYds += r.yards || 0;
      if (sit && sit.lastPlay) { c.last++; if (r.td) c.lastWin++; }
      else if (sit) { c.epa += epa(sit, r); c.epaN++; }
      if (r.firstDown) c.fd++;
      if (r.td) c.td++;
      if (rec.run) { c.runCards++; continue; }
      c.passSnaps++;
      if (rec.note && rec.note.rolled) c.rolled++;
      const o = r.outcome;
      if (o === 'SACK') { c.sack++; continue; }
      if (o === 'SCRAMBLE') { c.scr++; c.scrYds += r.yards || 0; if ((r.yards || 0) > 0) c.good++; continue; }
      c.att++;
      if (o === 'THROWAWAY') { c.away++; c.good++; continue; }
      if (r.preview === 'GREEN' || r.preview === 'GOLD') { if (o !== 'INT') c.good++; }
      if (r.sd) { c.sdSum += r.sd; c.sdN++; }
      if (typeof r.miss === 'number') { c.missSum += r.miss; c.missN++; }
      c.air += Math.max(0, r.airYards || 0);
      if (r.kind === 'PASS') { c.ayd += r.landingY || 0; c.aydN++; if ((r.landingY || 0) >= 20) c.deep++; }
      if (o === 'CATCH') { c.cmp++; c.yds += r.yards || 0; c.airCmp += r.airYards || 0; }
      if (o === 'INT') c.int++;
      if (o === 'DROP') c.drop++;
      if (r.text === 'TIPPED' || r.ended === 'TIPPED') c.tip++;
    }
    return acc ? c : derive(c);
  }
  /** The rates from raw counters (a copy). */
  function derive(c0) {
    const c = Object.assign({}, c0);
    const pct = (a, b) => (b ? a / b : 0);
    return Object.assign(c, {
      cmpPct: pct(c.cmp, c.att), intPct: pct(c.int, c.att), tipPct: pct(c.tip, c.att), sackPct: pct(c.sack, c.passSnaps), awayPct: pct(c.away, c.passSnaps),
      scrPct: pct(c.scr, c.passSnaps), ydsPerAtt: pct(c.yds, c.att), ydsPerPlay: pct(c.playYds, c.snaps), scrPerPlay: pct(c.scrYds, c.scr),
      airPerAtt: pct(c.air, c.att - c.away), airPerCmp: pct(c.airCmp, c.cmp), aydPerAtt: pct(c.ayd, c.aydN), deepPct: pct(c.deep, c.aydN), fdPct: pct(c.fd, c.snaps), lastWinPct: pct(c.lastWin, c.last),
      decision: pct(c.good, c.passSnaps), epaPerPlay: pct(c.epa, c.epaN), rollPct: pct(c.rolled, c.passSnaps), missAvg: pct(c.missSum, c.missN), sdAvg: pct(c.sdSum, c.sdN)
    });
  }

  return {
    BRAINS, BOTS, PREV, playSnap, pickCard, situation, snapWith, drive, withStore, tally, counters, merge, derive, epa, ep1, lean,
    stepTo, finish, threat, sepSeen, eyeRace, meet, assist, bent, commitAfter, QB_ATTRS
  };
}

module.exports = makeBots;
