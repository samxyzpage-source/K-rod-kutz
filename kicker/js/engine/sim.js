/**
 * Road to Glory: Kicker — RTG.Sim (SPEC §2.5, §3.4 GameState, §3.5.11)
 *
 * The game simulation: an explicit, JSON-serialisable GameState advanced one
 * drive / one script play / one kickoff per `step` (no generators, decision D1),
 * so a game can be autosaved and reloaded mid-drive. Every kick — AI or user —
 * goes through Kick.buildContext → (Kick.aiInput) → Kick.resolve; the sim never
 * reads attributes itself (§6.4 checklist). Teams are referenced by id.
 *
 * Extension fields on GameState (all JSON-safe; created by startGame):
 *   gs.announce  null | {type, text, side}   event queued for the next `step`: ICE_TIMEOUT → USER_KICK,
 *                                            END_QUARTER after a drive that straddles a quarter break,
 *                                            END_HALF / OT_START / END_GAME reached inside applyKick.
 *   gs.meta      {gw, tf, koTouchbacks, metersAtStart}  game-winner / tie-forcer candidates (resolved
 *                                            in finishGame), user-played touchbacks, meter snapshot.
 *   row.ai       true on KickLogRows kicked by an AI kicker (the user's rows come from Stats.recordKick).
 *
 * RNG draw order (binding for replay determinism; every draw comes from the rng passed in):
 *   startGame   : Weather.forGame (0 dome · 6–7 outdoors) → rating noise gauss ×4 in the order
 *                 home OFF, home DEF, away OFF, away DEF (8 draws) → coin toss 1
 *   kickoff     : KO context (wind 2) → Kick.resolveKickoff (hang 2 · dist 2 · [return 2 · TD 1] | onside 1)
 *   drive       : [kneel 1] → outcome 1 → time 2 → per outcome
 *                   TD    : 2-pt 1 | PAT context (wind 2) → [ice 1] → AI: aiInput 6 · resolve 5+
 *                   STALL : spot 2 → FG context (hash 1 · wind 2) → attempt: [ice 1] → AI: aiInput 6 · resolve 5+
 *                           no attempt: [go-for-it 1] → [convert 1 → TD-or-STALL 1 → (decision again)] | punt 2
 *                   PUNT  : start 2 · TO: spot 2 · DOWNS: spot 2
 *   script play : turnover 1 → incomplete 1 → [gain 2 → runoff 1] → [4th-down convert 1] → FG as above
 *                 (the two-minute drill runs in regulation Q4 only; OT possessions use the drive engine)
 *   college OT  : 2-pt 1 (period 3+) | outcome 1 → STALL: spot 2 → FG context … · TD: [2-pt 1] | PAT …
 *   OT start    : coin toss 1
 *   finishGame  : [injury 1–2 (Player.rollInjury)] → [headline 1 (Events.headline)]
 *
 * NFL OT (§2.5.4): any touchdown is a walk-off; a first-possession FG hands the other team a possession;
 * from the second possession on, any lead ends the game; a tied 10-minute period ends a regular-season
 * game (tie) and adds a period in the playoffs. College OT alternates possessions from the 25 and is
 * decided after each pair; PAT/2-pt rules follow the period (§2.5.4).
 *
 * Bookkeeping split with Season: finishGame writes season.schedule[game] AND season.results
 * (Standings.recordResult) for the user's game; simAiGame only marks the schedule game played and
 * records kicker stats — Season.simOtherGames owns results/standings for AI games.
 *
 * Dependencies (load order §3.2): Util, Tuning, Schema, Weather, Kick. Stats / Player / Events /
 * Standings are resolved at call time (E3 modules; optional in isolated tests).
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  var Util = RTG.Util, Tuning = RTG.Tuning;
  var Sim = {};

  var FIELD_YARDS = 100;                 // goal line to goal line (unit constant)
  var HALF_TURN = 180, FULL_TURN = 360;  // degrees (unit constants)
  var PERCENT = 100;                     // trust 0..100 → trust01
  var PERIOD_EVENTS = { END_QUARTER: true, END_HALF: true, OT_START: true, END_GAME: true };
  var DOINKS = { DOINK_IN: true, DOINK_OUT: true, XBAR_IN: true, XBAR_OUT: true };
  var hasOwn = Object.prototype.hasOwnProperty;

  // ═══════════════════════════════ late-bound modules & small helpers ═══════════════════════════════

  function S() { return Tuning.sim; }
  function KT() { return Tuning.kick; }
  function Kick() { return RTG.Kick; }
  function Schema() { return RTG.Schema; }
  function Stats() { return RTG.Stats; }
  function Player() { return RTG.Player; }
  function Events() { return RTG.Events; }
  function Standings() { return RTG.Standings; }
  function isFn(f) { return typeof f === 'function'; }
  function has(arr, v) { return Array.isArray(arr) && arr.indexOf(v) >= 0; }
  function num(v, d) { return typeof v === 'number' && v === v ? v : d; }
  function other(side) { return side === 'home' ? 'away' : 'home'; }
  function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
  function diffRow(state) { return Tuning.difficulty[state && state.difficulty] || Tuning.difficulty.pro; }

  function leagueObj(state, league) {
    if (!state || !state.leagues) return null;
    return league === 'NFL' ? state.leagues.nfl : state.leagues.college;
  }
  function teamIn(lg, id) {
    if (!lg || !lg.teams || !id) return null;
    var idx = lg.teamIndex && lg.teamIndex[id];
    if (typeof idx === 'number' && lg.teams[idx] && lg.teams[idx].id === id) return lg.teams[idx];
    for (var i = 0; i < lg.teams.length; i++) if (lg.teams[i].id === id) return lg.teams[i];
    return null;
  }
  function teamOf(state, gs, side) { return teamIn(leagueObj(state, gs.league), gs[side + 'Id']); }
  function findGame(schedule, id) {
    if (!Array.isArray(schedule)) return null;
    for (var i = 0; i < schedule.length; i++) if (schedule[i] && schedule[i].id === id) return schedule[i];
    return null;
  }
  function findRow(rows, id) {
    if (!Array.isArray(rows)) return null;
    for (var i = rows.length - 1; i >= 0; i--) if (rows[i] && rows[i].id === id) return rows[i];
    return null;
  }

  /** Does the user kick for `side` right now? (own team, K1, healthy) */
  function userKicks(gs, state, side) {
    if (!gs.userSide || gs.userSide !== side || !state || !state.player) return false;
    return state.player.role === 'K1' && !state.player.injury;
  }

  /** The AI kicker who kicks for `side` (on the user's team: the rival, per Player.rivalOvr's rule). */
  function aiKickerFor(state, gs, side) {
    var team = teamOf(state, gs, side);
    if (!team) return null;
    if (gs.userSide === side && state && state.player) {
      var p = state.player;
      return (p.role === 'K1' ? (team.kicker2 || team.kicker) : (team.kicker || team.kicker2)) || null;
    }
    return team.kicker || team.kicker2 || null;
  }

  function deficit(gs, side) { return gs.score[other(side)] - gs.score[side]; }
  function scoreText(gs) { return gs.homeId + ' ' + gs.score.home + ' - ' + gs.awayId + ' ' + gs.score.away; }
  function spotText(ytg) { return ytg > FIELD_YARDS / 2 ? 'own ' + (FIELD_YARDS - ytg) : 'the ' + ytg; }
  function sideOfCtx(gs, ctx) { return ctx && ctx.game && ctx.game.teamId === gs.awayId ? 'away' : 'home'; }

  // ═══════════════════════════════ clock ═══════════════════════════════

  function inFirstHalf(gs) { return !gs.ot && gs.q <= S().clock.halfQuarter; }
  function isQ4(gs) { return !gs.ot && gs.q >= S().clock.quarters; }
  function hasClock(gs) { return !(gs.ot && gs.ot.mode === 'COLLEGE'); }

  /** Seconds left in the current half (or OT period). */
  function timeLeftInHalf(gs) {
    var C = S().clock;
    if (gs.ot) return gs.clock;
    var firstOfHalf = gs.q === 1 || gs.q === C.halfQuarter + 1;
    return gs.clock + (firstOfHalf ? C.quarterSec : 0);
  }

  /**
   * Run `dt` seconds off the clock (dt already clipped to the half). A drive that straddles the
   * Q1→Q2 / Q3→Q4 break carries over; returns true in that case (the caller announces END_QUARTER).
   */
  function advanceClock(gs, dt) {
    var C = S().clock;
    if (!(dt > 0)) return false;
    if (gs.ot || dt < gs.clock) { gs.clock = Math.max(0, gs.clock - dt); return false; }
    if (gs.q === 1 || gs.q === C.halfQuarter + 1) {
      var rem = dt - gs.clock;
      gs.clock = 0;
      pushLog(gs, null, 'End of the ' + Util.ordinal(gs.q) + ' quarter - ' + scoreText(gs), 0, 'END_QUARTER');
      gs.q += 1;
      gs.clock = clamp(C.quarterSec - rem, 0, C.quarterSec);
      return true;
    }
    gs.clock = 0;
    return false;
  }

  // ═══════════════════════════════ log & events ═══════════════════════════════

  function pushLog(gs, side, text, ytg, result) {
    var row = { q: gs.q, clock: gs.clock, side: side || gs.possession, text: text, ytg: num(ytg, 0), result: result || '' };
    gs.driveLog.push(row);
    var cap = Tuning.save.driveLogCap;
    while (gs.driveLog.length > cap) gs.driveLog.shift();
    return row;
  }

  function ev(gs, type, text, extra) {
    var e = { type: type, text: text, gs: gs };
    if (extra) for (var k in extra) if (hasOwn.call(extra, k)) e[k] = extra[k];
    return e;
  }

  /** Queue an event for the next step (first come, first served — a USER_KICK announce is set directly). */
  function announce(gs, type, text, side) {
    if (!gs.announce) gs.announce = { type: type, text: text, side: side || null };
  }

  // ═══════════════════════════════ possession & scoring ═══════════════════════════════

  function newPossession(gs, side, ytg) {
    gs.possession = side;
    gs.ball = { ytg: clamp(Math.round(ytg), 1, FIELD_YARDS - 1), down: 1, toGo: S().script.toGo };
    gs.drive = { n: gs.drive.n + 1, startYtg: gs.ball.ytg, plays: 0, side: side };
    gs.stats[side].drives++;
    if (gs.ot && gs.ot.mode !== 'COLLEGE') {
      gs.ot.possessions++;
      if (gs.ot.possessions > 2) gs.ot.bothPossessed = true;
    }
  }

  /** Add points and invalidate game-winner / tie-forcer candidates the new score contradicts. */
  function addPoints(gs, side, pts) {
    gs.score[side] += pts;
    var m = gs.meta;
    if (!m) return;
    if (m.gw && gs.score[m.gw.side] <= gs.score[other(m.gw.side)]) m.gw = null;
    if (m.tf && !gs.ot && gs.score.home !== gs.score.away) m.tf = null;   // a later regulation score undoes the tie; OT scores do not
  }

  function endGame(gs, text) {
    gs.done = true; gs.pendingKickoff = null; gs.script = null; gs.ball = null; gs.iced = false;
    pushLog(gs, null, text + ' - ' + scoreText(gs), 0, 'END_GAME');
    return ev(gs, 'END_GAME', text + ': ' + scoreText(gs));
  }

  /** Halftime: the team that kicked off to start the game receives (§2.5.2). */
  function halftime(gs) {
    var C = S().clock;
    pushLog(gs, null, 'Halftime - ' + scoreText(gs), 0, 'END_HALF');
    gs.q = C.halfQuarter + 1; gs.clock = C.quarterSec; gs.half = 2;
    gs.timeouts = { home: C.timeoutsPerHalf, away: C.timeoutsPerHalf };
    gs.script = null; gs.ball = null; gs.iced = false;
    var recv = other(gs.receivedFirst);
    gs.possession = recv;
    gs.pendingKickoff = { side: gs.receivedFirst };
    return ev(gs, 'END_HALF', 'Halftime: ' + scoreText(gs), { side: recv });
  }

  /** §2.5.4 — NFL: kickoff + 10-minute period; college: alternating possessions from the 25. 1 draw (toss). */
  function startOvertime(gs, rng) {
    var O = S().ot, C = S().clock;
    var first = rng.chance(C.coinP) ? 'home' : 'away';                                          // draw: OT coin toss
    gs.q = Math.min(C.quarters + 1, O.maxQ); gs.script = null; gs.iced = false;
    if (gs.league === 'COLLEGE') {
      gs.ot = { period: 1, mode: 'COLLEGE', firstPossession: first, bothPossessed: false, possessions: 0 };
      gs.clock = 0; gs.pendingKickoff = null;
      pushLog(gs, first, 'Overtime - ' + gs[first + 'Id'] + ' starts from the ' + O.college.ytg, O.college.ytg, 'OT_START');
      newPossession(gs, first, O.college.ytg);
      return ev(gs, 'OT_START', 'Overtime: alternating possessions from the ' + O.college.ytg, { side: first });
    }
    gs.ot = { period: 1, mode: gs.kind === 'REG' ? 'NFL_REG' : 'NFL_PLAYOFF', firstPossession: first, bothPossessed: false, possessions: 0 };
    gs.clock = O.nfl.periodSec;
    gs.timeouts = { home: O.nfl.timeouts, away: O.nfl.timeouts };
    gs.possession = first; gs.ball = null;
    gs.pendingKickoff = { side: other(first) };
    pushLog(gs, first, 'Overtime - ' + gs[first + 'Id'] + ' wins the toss and receives', 0, 'OT_START');
    return ev(gs, 'OT_START', 'Overtime: ' + scoreText(gs), { side: first });
  }

  /** NFL playoff OT: another full period; the team that kicked off the last period receives. */
  function nextOtPeriod(gs) {
    var O = S().ot;
    gs.ot.period++; gs.q = Math.min(gs.q + 1, O.maxQ); gs.clock = O.nfl.periodSec;
    gs.timeouts = { home: O.nfl.timeouts, away: O.nfl.timeouts };
    var recv = other(gs.ot.firstPossession);
    gs.ot.firstPossession = recv; gs.ot.possessions = 0; gs.ot.bothPossessed = false;
    gs.possession = recv; gs.ball = null; gs.script = null;
    gs.pendingKickoff = { side: other(recv) };
    pushLog(gs, recv, 'Overtime period ' + gs.ot.period + ' - ' + scoreText(gs), 0, 'OT_START');
    return ev(gs, 'OT_START', 'Overtime period ' + gs.ot.period, { side: recv });
  }

  /** Period bookkeeping when the clock may have expired; null while play simply continues. */
  function checkPeriodEnd(gs, rng) {
    var C = S().clock;
    if (gs.done) return null;
    if (gs.ot) {
      if (gs.ot.mode === 'COLLEGE' || gs.clock > 0) return null;
      if (gs.score.home !== gs.score.away) return endGame(gs, 'Final in overtime');
      if (gs.ot.mode === 'NFL_REG') return endGame(gs, 'Tie - nobody wins in overtime');
      return nextOtPeriod(gs);
    }
    if (gs.clock > 0) return null;
    if (gs.q === C.halfQuarter) return halftime(gs);
    if (gs.q >= C.quarters) return gs.score.home !== gs.score.away ? endGame(gs, 'Final') : startOvertime(gs, rng);
    return null;
  }

  /** A scoring play is complete (PAT/2-pt tried or FG made): decide OT, end of period, or kick off. */
  function afterScore(gs, state, rng, side, event) {
    if (gs.ot && gs.ot.mode === 'COLLEGE') return endOtPossession(gs, state, rng, event);
    if (gs.ot && gs.ot.possessions >= 2 && gs.score.home !== gs.score.away) return endGame(gs, 'Final in overtime');
    var end = checkPeriodEnd(gs, rng);
    if (end) return end;
    gs.pendingKickoff = { side: side }; gs.ball = null; gs.script = null;
    return event;
  }

  /** The defence takes over at `ytg` (its yards to goal) unless the period / game just ended. */
  function flipPossession(gs, state, rng, toSide, ytg, event) {
    var end = checkPeriodEnd(gs, rng);
    if (end) return end;
    if (gs.ot && gs.ot.mode !== 'COLLEGE' && gs.ot.possessions >= 2) {
      if (gs.score.home !== gs.score.away) return endGame(gs, 'Final in overtime');
      gs.ot.bothPossessed = true;
    }
    newPossession(gs, toSide, ytg);
    return event;
  }

  function scoreTouchdown(gs, state, rng, side, text) {
    addPoints(gs, side, S().points.TD);
    gs.stats[side].td++;
    pushLog(gs, side, text, 0, 'TD');
    gs.script = null; gs.ball = null;
    if (gs.ot && gs.ot.mode !== 'COLLEGE') return endGame(gs, 'Walk-off touchdown');   // any NFL OT touchdown decides it
    return afterTouchdown(gs, state, rng, side, text);
  }

  /** §2.5.3 two-point rule (Q4 deficits 2/5/8/10/16 after the TD) · §2.5.4 college OT period 2+ must go for two. */
  function afterTouchdown(gs, state, rng, side, text) {
    var goTwo = gs.ot ? gs.ot.period >= S().ot.college.twoPtFromPeriod
      : (isQ4(gs) && has(S().twoPoint.deficits, deficit(gs, side)));
    if (goTwo) return twoPointTry(gs, state, rng, side, text);
    var ctx = buildCtx(gs, state, rng, side, { type: 'PAT' });                                    // wind 2
    return attemptKick(gs, state, rng, side, ctx, { text: text + ' - PAT attempt', prefix: text, eventType: 'SCORE' });
  }

  function twoPointTry(gs, state, rng, side, prefix) {
    var good = rng.chance(S().twoPoint.convert);                                                 // draw: conversion
    if (good) addPoints(gs, side, S().points.twoPoint);
    var text = good ? 'two-point conversion is GOOD' : 'two-point try FAILS';
    pushLog(gs, side, text, 0, good ? '2PT' : '2PT_FAIL');
    return afterScore(gs, state, rng, side, ev(gs, 'SCORE', (prefix ? prefix + ' - ' : '') + text, { side: side, result: good ? '2PT' : '2PT_FAIL' }));
  }

  // ═══════════════════════════════ kick contexts ═══════════════════════════════

  /**
   * KickContext for `side` via Kick.buildContext (§3.5.8). Draws: hash 1 (FG without an explicit hash) ·
   * wind 2 (game weather, no explicit wind). `sit` may carry type, distance, hash, wind, decisive, iced,
   * asTimeExpires, late, ot, onside.
   */
  function buildCtx(gs, state, rng, side, sit) {
    var isUser = userKicks(gs, state, side);
    var situation = {};
    for (var k in sit) if (hasOwn.call(sit, k) && sit[k] !== undefined) situation[k] = sit[k];
    situation.side = side;
    situation.teamId = gs[side + 'Id'];
    situation.oppId = gs[other(side) + 'Id'];
    situation.isUser = isUser;
    situation.league = gs.league;
    if (!isUser) {
      var kicker = aiKickerFor(state, gs, side);
      if (kicker) situation.kicker = kicker;
    }
    var ctx = Kick().buildContext(state, gs, situation, rng);
    if (sit.onside) ctx.onside = true;
    return ctx;
  }

  /** The same kick after an icing timeout: identical hash/wind (0 draws), pressure recomputed with `iced`. */
  function icedCtx(gs, state, rng, side, ctx) {
    return buildCtx(gs, state, rng, side, {
      type: ctx.type, distance: ctx.distance, hash: ctx.hash, wind: ctx.wind, iced: true,
      asTimeExpires: ctx.asTimeExpires, decisive: ctx.decisive, ot: ctx.ot
    });
  }

  /** The game wind as the kicker on `side` sees it (flipped for the away side and the second half). */
  function orientedWind(gs, side) {
    var w = gs.weather && gs.weather.wind ? gs.weather.wind : null;
    if (!w || gs.weather.dome) return { speed: 0, dir: 0 };
    var dir = num(w.dir, 0);
    if ((side === 'away') !== (gs.half === 2)) dir = (dir + HALF_TURN) % FULL_TURN;
    return { speed: num(w.speed, 0), dir: dir };
  }

  /** Draw-free context (middle hash, unjittered wind) for range / pMake probes. */
  function probeCtx(gs, state, side, distance, extra) {
    var sit = { type: 'FG', distance: distance, hash: 0, wind: orientedWind(gs, side) };
    if (extra) for (var k in extra) if (hasOwn.call(extra, k)) sit[k] = extra[k];
    return buildCtx(gs, state, null, side, sit);
  }

  function kickLabel(ctx) { return ctx.type === 'PAT' ? 'PAT' : ctx.distance + '-yd field goal'; }

  function kickText(ctx, result) {
    var what = ctx.type === 'PAT' ? 'PAT' : ctx.distance + '-yd FG';
    var o = result.outcome, tail;
    if (o === 'GOOD') tail = 'is GOOD';
    else if (o === 'DOINK_IN') tail = 'doinks off the upright and IN';
    else if (o === 'XBAR_IN') tail = 'bounces off the crossbar and IN';
    else if (o === 'DOINK_OUT') tail = 'doinks off the upright - NO GOOD';
    else if (o === 'XBAR_OUT') tail = 'hits the crossbar - NO GOOD';
    else if (o === 'WIDE_L') tail = 'is WIDE LEFT';
    else if (o === 'WIDE_R') tail = 'is WIDE RIGHT';
    else if (o === 'SHORT') tail = 'is SHORT';
    else if (o === 'BLOCKED') tail = result.blockReturnTd ? 'is BLOCKED and returned!' : 'is BLOCKED';
    else tail = result.made ? 'is good' : 'is no good';
    return (has(result.tags, 'iced') ? 'Iced - ' : '') + what + ' ' + tail;
  }

  // ═══════════════════════════════ kicks ═══════════════════════════════

  /**
   * A FG / PAT attempt for `side` with a built context. Icing (§2.3.7): once per decisive kick when the
   * defence has a timeout (1 draw). User → pending USER_KICK (ICE_TIMEOUT first when iced);
   * AI → aiInput (6) + resolve (5+) and settle immediately.
   */
  function attemptKick(gs, state, rng, side, ctx, opts) {
    opts = opts || {};
    var K = Kick(), opp = other(side);
    if (ctx.decisive && gs.timeouts[opp] > 0) {
      if (rng.chance(K.iceProb(state, ctx.isUser))) {                                            // draw: ice
        gs.timeouts[opp] = gs.timeouts[opp] - 1;
        gs.iced = true;
        ctx = icedCtx(gs, state, rng, side, ctx);
        pushLog(gs, opp, 'Timeout ' + gs[opp + 'Id'] + ' - icing the kicker', ctx.distance - KT().distance.losToKick, 'ICE');
      }
    }
    if (ctx.isUser) {
      gs.pending = { type: 'USER_KICK', ctx: ctx };
      var text = opts.text || kickLabel(ctx) + ' attempt';
      if (gs.iced) {
        gs.announce = { type: 'USER_KICK', text: text, side: side };
        return ev(gs, 'ICE_TIMEOUT', 'ICED! ' + gs[opp + 'Id'] + ' calls timeout before the ' + kickLabel(ctx), { side: side, ctx: ctx });
      }
      return ev(gs, 'USER_KICK', text, { side: side, ctx: ctx });
    }
    // aiInput only reads pNeed / windDriftDeg, so the cheap geometry stands in for the full erf model
    var input = K.aiInput(rng, ctx, null, K.geometry(ctx));                                       // draws: power 2 · aim 2 · quality 2
    var result = K.resolve(rng, ctx, null, input, { auto: true });                                // draws: block · shank · err 2 · contact · doinks
    return settleKick(gs, state, rng, ctx, result, true, { prefix: opts.prefix, eventType: opts.eventType || 'AI_KICK' });
  }

  /**
   * Score, log, record and hand the ball on after a resolved kick (AI or user).
   * Blocked NFL PAT with blockReturnTd → 2 points for the defence; blocked FG with blockReturnTd → defensive TD.
   */
  function settleKick(gs, state, rng, ctx, result, ai, opts) {
    opts = opts || {};
    var side = sideOfCtx(gs, ctx), opp = other(side), st = gs.stats[side];
    var KP = KT().points, P = S().possession;
    var isPat = ctx.type === 'PAT', made = !!result.made;
    if (isPat) { st.pat++; if (made) st.patMade++; } else { st.fga++; if (made) st.fgm++; }
    if (made) addPoints(gs, side, num(result.points, isPat ? KP.PAT : KP.FG));
    var returnTd = !made && !!result.blockReturnTd && !isPat;
    if (!made && result.blockReturnTd && isPat) addPoints(gs, opp, KP.blockReturnPat);
    var row = recordRow(gs, state, rng, ctx, result, ai);
    if (ctx.decisive && made && gs.meta) {
      var lead = gs.score[side] - gs.score[opp];
      if (lead > 0) gs.meta.gw = { id: row.id, side: side };
      else if (lead === 0) gs.meta.tf = { id: row.id, side: side };
    }
    if (ctx.isUser && !ai) userKickMeters(state, ctx, result);
    gs.iced = false; gs.pending = null;
    var ytg = ctx.distance - KT().distance.losToKick;
    var text = kickText(ctx, result);
    pushLog(gs, side, text, ytg, isPat ? (made ? 'PAT' : 'PAT_MISS') : (made ? 'FG' : 'FG_MISS'));
    if (!isPat && hasClock(gs)) advanceClock(gs, Math.min(S().clock.fgPlaySec, timeLeftInHalf(gs)));
    var type = opts.eventType || (ai ? 'AI_KICK' : (made ? 'SCORE' : 'DRIVE'));
    var event = ev(gs, type, (opts.prefix ? opts.prefix + ' - ' : '') + text, { side: side, kick: result, ctx: ctx });
    if (returnTd) return scoreTouchdown(gs, state, rng, opp, 'Blocked kick scooped up and returned for a TOUCHDOWN');
    if (made || isPat) return afterScore(gs, state, rng, side, event);
    if (gs.ot && gs.ot.mode === 'COLLEGE') return endOtPossession(gs, state, rng, event);
    var own = result.outcome === 'BLOCKED' ? ytg : Math.max(P.missedFgMinOwn, ytg + P.holdYards);
    return flipPossession(gs, state, rng, opp, FIELD_YARDS - clamp(own, 1, FIELD_YARDS - 1), event);
  }

  /** Log a kick: the user's through Stats.recordKick (shared row object), AI kicks through Stats.recordAiKick. */
  function recordRow(gs, state, rng, ctx, result, ai) {
    var side = sideOfCtx(gs, ctx);
    var teamId = gs[side + 'Id'], oppId = gs[other(side) + 'Id'];
    var St = Stats(), row = null;
    var meta = {
      gameId: gs.id, teamId: teamId, oppId: oppId,
      auto: !!result.auto || has(result.tags, 'auto'),
      rngState: rng && isFn(rng.state) ? rng.state() : 0,
      week: gs.week, year: state ? num(state.year, 0) : 0
    };
    var userRow = ctx.isUser && !ai;
    if (userRow) {
      if (St && isFn(St.recordKick) && state && state.stats) row = St.recordKick(state, ctx, result, meta);
    } else if (St && isFn(St.recordAiKick) && state && state.season && state.season.league === gs.league) {
      St.recordAiKick(state.season, teamId, ctx, result);
    }
    if (!row) {
      var Sc = Schema();
      meta.id = 'g' + gs.id + ':' + (gs.kicks.length + 1);
      row = Sc && isFn(Sc.createKickLogRow) ? Sc.createKickLogRow(ctx, result, meta) : fallbackRow(ctx, result, meta);
      row.ai = !userRow;
    }
    gs.kicks.push(row);
    return row;
  }

  /** Minimal KickLogRow when Schema is unavailable (isolated tests). */
  function fallbackRow(ctx, result, meta) {
    var g = ctx.game || {};
    return {
      id: meta.id, year: meta.year, week: meta.week, league: ctx.league, gameId: meta.gameId, teamId: meta.teamId, oppId: meta.oppId,
      type: ctx.type, distance: ctx.distance, hash: ctx.hash || 0, wind: { speed: ctx.wind.speed, dir: ctx.wind.dir }, weather: ctx.weather,
      pressure: num(ctx.pressure, 0), outcome: result.outcome, made: !!result.made, tags: (result.tags || []).slice(),
      input: { power: num(result.power, 0), aim: num(result.aim, 0), quality: num(result.quality, 0) }, auto: !!meta.auto,
      rngState: meta.rngState >>> 0, q: g.q || 0, clock: g.clock || 0, scoreFor: g.scoreFor || 0, scoreAgainst: g.scoreAgainst || 0
    };
  }

  /** Per-kick meters for the user (§2.2 via Player.applyKickMeters) + the "Give me 60" fame bonus (event #35). */
  function userKickMeters(state, ctx, result) {
    var P = Player();
    if (P && isFn(P.applyKickMeters)) P.applyKickMeters(state, ctx, result);
    var C = S().coach;
    if (state.flags && state.flags.giveMe60 && ctx.type === 'FG' && ctx.distance >= C.giveMe60Dist) {
      state.player.fame = clamp(Util.round1(num(state.player.fame, 0) + C.giveMe60Fame), 0, Tuning.soft.fame.max);
    }
  }

  // ═══════════════════════════════ kickoffs (§2.3.10, D16) ═══════════════════════════════

  /** Onside kicks only in end-game situations: the kicking team trails in Q4 with ≤ 2:00 left. */
  function shouldOnside(gs, side) {
    if (gs.ot) return false;
    return isQ4(gs) && gs.clock <= S().kickoffRules.onsideClockSec && deficit(gs, side) > 0;
  }

  function doKickoff(gs, state, rng) {
    var side = gs.pendingKickoff.side;
    var onside = shouldOnside(gs, side);
    var ctx = buildCtx(gs, state, rng, side, { type: 'KO', onside: onside });                     // wind 2
    if (ctx.isUser && state.settings && state.settings.playKickoffs) {
      gs.pending = { type: 'USER_KICKOFF', ctx: ctx };
      return ev(gs, 'USER_KICKOFF', onside ? 'Onside kick - your leg' : 'Kickoff - your leg', { side: side, ctx: ctx });
    }
    var res = Kick().resolveKickoff(rng, ctx, null, onside ? { onside: true } : null);
    return settleKickoff(gs, state, rng, ctx, res, false);
  }

  function kickoffText(res) {
    if (res.onside) return res.recovered ? 'Onside kick RECOVERED by the kicking team!' : 'Onside kick fails';
    if (res.returnTd) return 'Kickoff returned all the way - TOUCHDOWN';
    if (res.oob) return 'Kickoff out of bounds - ball at the ' + res.startYard;
    if (res.touchback) return 'Kickoff: touchback, ball at the ' + res.startYard;
    return 'Kickoff returned to the ' + res.startYard;
  }

  function settleKickoff(gs, state, rng, ctx, res, played) {
    var kicking = gs.pendingKickoff ? gs.pendingKickoff.side : sideOfCtx(gs, ctx);
    var recv = other(kicking);
    gs.pendingKickoff = null; gs.pending = null;
    if (ctx.isUser) recordKickoff(gs, state, ctx, res, played);
    var text = kickoffText(res);
    pushLog(gs, kicking, text, num(res.ytg, 0), 'KO');
    if (res.returnTd) return scoreTouchdown(gs, state, rng, recv, 'Kickoff returned for a TOUCHDOWN');
    var poss = res.possession === 'kicking' ? kicking : recv;
    newPossession(gs, poss, num(res.ytg, FIELD_YARDS - KT().kickoff.touchbackYard[gs.league]));
    return ev(gs, 'DRIVE', text, { side: kicking, result: 'KO', kickoff: res });
  }

  /** The user's own kickoffs count toward KO stats (Stats.recordKick handles type 'KO'); played touchbacks earn XP. */
  function recordKickoff(gs, state, ctx, res, played) {
    var St = Stats();
    if (St && isFn(St.recordKick) && state && state.stats) St.recordKick(state, ctx, res, { gameId: gs.id, auto: !played });
    if (played && res.touchback && gs.meta) gs.meta.koTouchbacks++;
  }

  // ═══════════════════════════════ drives (§2.5.2, §2.5.3) ═══════════════════════════════

  function edgeFor(gs, side) {
    var D = S().drive;
    return (gs.offRating[side] - gs.defRating[other(side)] + (side === 'home' ? D.homeAdv : 0)) / D.edgeDiv;
  }

  /** Hurry-up: either team in the first half, the trailing team afterwards, with ≤ 5:00 left in the half. */
  function isHurryUp(gs, side) {
    if (timeLeftInHalf(gs) > S().hurryUp.clockSec) return false;
    if (inFirstHalf(gs)) return true;
    return deficit(gs, side) > 0;
  }

  /** Drive outcome (1 draw): p_k = max(0.02, base_k + shift_k·edge + hurry_k), normalised by rng.weighted. */
  function rollOutcome(gs, rng, side) {
    var D = S().drive, base = D.base[gs.league] || D.base.NFL;
    var hurry = isHurryUp(gs, side) ? S().hurryUp.shifts : null;
    var edge = edgeFor(gs, side), items = [];
    for (var i = 0; i < D.outcomes.length; i++) {
      var k = D.outcomes[i];
      items.push({ k: k, w: Math.max(D.pMin, base[k] + D.shift[k] * edge + (hurry && hurry[k] ? hurry[k] : 0)) });
    }
    return rng.weighted(items, 'w').k;
  }

  /** Drive time (2 draws): max(30, N(mean, sd)) · 0.55 in hurry-up, clipped to the time left in the half. */
  function driveTime(gs, rng, side, outcome) {
    var D = S().drive, t = D.time[outcome] || D.time.PUNT;
    var dt = Math.max(D.minTimeSec, rng.gauss(t.mean, t.sd));
    if (isHurryUp(gs, side)) dt *= S().hurryUp.timeMult;
    return Math.min(Math.round(dt), timeLeftInHalf(gs));
  }

  /** Kneel (§2.5.3): leading team with the ball, Q4 ≤ 2:00 — p 0.5 (0.9 if the opponent has no timeouts). 1 draw. */
  function shouldKneel(gs, rng, side) {
    var Kn = S().kneel;
    if (!isQ4(gs) || gs.clock > Kn.clockSec || deficit(gs, side) >= 0) return false;
    return rng.chance(gs.timeouts[other(side)] === 0 ? Kn.pNoTimeouts : Kn.p);
  }

  /** End-of-game script trigger (§2.5.3): ball in Q4 with ≤ 4:00 left, trailing by 0–3 (regulation only). */
  function shouldStartScript(gs, side) {
    var T = S().script;
    if (!isQ4(gs)) return false;
    if (gs.clock > T.triggerClockSec) return false;
    var d = deficit(gs, side);
    return d >= 0 && d <= T.maxDeficit;
  }

  /** Burn what is left of the half / game (kneel, heave). */
  function runOutClock(gs, rng, side, text, result) {
    var left = hasClock(gs) ? timeLeftInHalf(gs) : 0;
    advanceClock(gs, left);
    pushLog(gs, side, text, gs.ball ? gs.ball.ytg : 0, result || 'KNEEL');
    var end = checkPeriodEnd(gs, rng);
    return end || ev(gs, 'DRIVE', text, { side: side, result: result || 'KNEEL' });
  }

  function stepDrive(gs, state, rng) {
    var side = gs.possession, P = S().possession;
    if (!gs.ball) newPossession(gs, side, P.defaultStartYtg);
    if (timeLeftInHalf(gs) <= P.minPossessionSec) {
      var d = deficit(gs, side);
      if (inFirstHalf(gs)) return runOutClock(gs, rng, side, gs[side + 'Id'] + ' runs out the half', 'KNEEL');
      if (gs.ot || d > S().script.maxDeficit) return runOutClock(gs, rng, side, 'Hail Mary falls incomplete - time expires', 'HEAVE');
      if (d < 0) return runOutClock(gs, rng, side, 'Victory formation', 'KNEEL');
      // Q4, tied or trailing by ≤ 3: the two-minute drill plays out the final seconds
    }
    if (shouldStartScript(gs, side)) return initScript(gs, rng, side);
    if (shouldKneel(gs, rng, side)) return runOutClock(gs, rng, side, 'Victory formation - ' + gs[side + 'Id'] + ' kneels it out', 'KNEEL');
    var outcome = rollOutcome(gs, rng, side);                                                    // draw 1
    var dt = driveTime(gs, rng, side, outcome);                                                  // draws 2, 3
    var straddled = advanceClock(gs, dt);
    var event = resolveDrive(gs, state, rng, side, outcome);
    if (straddled && !gs.pending) announce(gs, 'END_QUARTER', 'End of the ' + Util.ordinal(gs.q - 1) + ' quarter: ' + scoreText(gs), null);
    return event;
  }

  function resolveDrive(gs, state, rng, side, outcome) {
    var D = S().drive, opp = other(side), spot, own, text;
    switch (outcome) {
      case 'TD':
        return scoreTouchdown(gs, state, rng, side, 'Touchdown drive by ' + gs[side + 'Id']);
      case 'STALL':
        return handleStall(gs, state, rng, side);
      case 'PUNT':
        own = clamp(Math.round(rng.gauss(D.puntStart.mean, D.puntStart.sd)), D.puntStart.min, D.puntStart.max);   // draws 4, 5
        gs.stats[side].punts++;
        text = 'Punt - ' + gs[opp + 'Id'] + ' takes over at own ' + own;
        pushLog(gs, side, text, FIELD_YARDS - own, 'PUNT');
        return flipPossession(gs, state, rng, opp, FIELD_YARDS - own, ev(gs, 'DRIVE', text, { side: side, result: 'PUNT' }));
      case 'TO':
        spot = clamp(Math.round(rng.gauss(D.turnoverYtg.mean, D.turnoverYtg.sd)), 1, FIELD_YARDS - 1);           // draws 4, 5
        gs.stats[side].to++;
        text = 'Turnover at ' + spotText(spot);
        pushLog(gs, side, text, spot, 'TO');
        return flipPossession(gs, state, rng, opp, FIELD_YARDS - spot, ev(gs, 'DRIVE', text, { side: side, result: 'TO' }));
      default:
        spot = clamp(Math.round(rng.gauss(D.downsYtg.mean, D.downsYtg.sd)), 1, FIELD_YARDS - 1);                 // draws 4, 5
        text = 'Turnover on downs at ' + spotText(spot);
        pushLog(gs, side, text, spot, 'DOWNS');
        return flipPossession(gs, state, rng, opp, FIELD_YARDS - spot, ev(gs, 'DRIVE', text, { side: side, result: 'DOWNS' }));
    }
  }

  /** STALL: the drive dies in scoring range — spot (2 draws), then the coach decision (§2.5.6). */
  function handleStall(gs, state, rng, side) {
    var D = S().drive, Y = D.stallYtg[gs.league] || D.stallYtg.NFL;
    var ytg = clamp(Math.round(rng.gauss(Y.mean, Y.sd)), D.stallYtg.min, D.stallYtg.max);
    return stallDecision(gs, state, rng, side, ytg, 0);
  }

  /**
   * §2.5.6 threshold: 0.55 − 0.20·trust01 − 0.10·coachAgg (+0.05 college), clamped 0.15..0.60, with the
   * event #35 flags (giveMe60 −0.10 / under55 +0.10) for the user. End-of-half kicks use §2.5.3's flat 0.20.
   */
  function coachThreshold(gs, state, side, asTimeExpires, dist) {
    var C = S().coach;
    if (asTimeExpires) return S().endHalfFg.pMakeMin;
    var team = teamOf(state, gs, side);
    var isUser = userKicks(gs, state, side);
    var trust01 = isUser ? clamp(num(state.player.trust, C.defaultTrust01 * PERCENT), 0, PERCENT) / PERCENT : C.defaultTrust01;
    var agg = team ? num(team.coachAgg, C.defaultAgg) : C.defaultAgg;
    var thr = C.thrBase - C.trustW * trust01 - C.aggW * agg + (gs.league === 'COLLEGE' ? C.collegeAdd : 0);
    if (dist !== undefined && C.longAttemptFrom !== undefined && dist >= C.longAttemptFrom) thr += num(C.longAttemptAdd, 0);   // very long tries need extra confidence
    if (isUser && state.flags) {
      if (state.flags.giveMe60) thr += C.giveMe60Thr;
      if (state.flags.under55) thr += C.under55Thr;
    }
    return clamp(thr, C.thrMin, C.thrMax);
  }

  function stallDecision(gs, state, rng, side, ytg, depth) {
    var C = S().coach, D = S().drive, opp = other(side);
    var dist = ytg + KT().distance.losToKick;
    var asTimeExpires = hasClock(gs) && timeLeftInHalf(gs) <= S().endHalfFg.clockSec;
    var ctx = buildCtx(gs, state, rng, side, { type: 'FG', distance: dist, asTimeExpires: asTimeExpires });   // hash 1 · wind 2
    var m = Kick().model(ctx, null);
    var thr = coachThreshold(gs, state, side, asTimeExpires, dist);
    var stallText = 'Drive stalls at ' + spotText(ytg);
    if (dist <= m.maxFG + C.rangeMargin && m.pMake >= thr) {
      return attemptKick(gs, state, rng, side, ctx, { text: stallText + ' - ' + dist + '-yd FG attempt', prefix: stallText });
    }
    if (hasClock(gs) && timeLeftInHalf(gs) <= 0) {                     // too far out and the half is over
      pushLog(gs, side, stallText + ' as time expires', ytg, 'CLOCK');
      return flipPossession(gs, state, rng, opp, FIELD_YARDS - ytg, ev(gs, 'DRIVE', stallText, { side: side, result: 'CLOCK' }));
    }
    var trailingQ4 = isQ4(gs) && deficit(gs, side) > 0;
    if (ytg <= C.goForItYtg && depth === 0 && (trailingQ4 || rng.chance(C.goForItProb))) {          // draw: go for it (skipped when trailing in Q4)
      if (rng.chance(C.convertProb)) {                                                              // draw: conversion
        if (hasClock(gs)) advanceClock(gs, Math.min(C.convertTimeSec, timeLeftInHalf(gs)));
        pushLog(gs, side, 'Fourth down converted at ' + spotText(ytg), ytg, 'CONVERT');
        var base = D.base[gs.league] || D.base.NFL;
        if (rng.chance(base.TD / (base.TD + base.STALL))) {                                         // draw: fresh TD-or-STALL roll
          return scoreTouchdown(gs, state, rng, side, 'Touchdown after the fourth-down gamble');
        }
        return stallDecision(gs, state, rng, side, Math.max(1, ytg - C.convertYtgGain), depth + 1);
      }
      var failText = 'Fourth-down gamble fails at ' + spotText(ytg);
      pushLog(gs, side, failText, ytg, 'DOWNS');
      return flipPossession(gs, state, rng, opp, FIELD_YARDS - ytg, ev(gs, 'DRIVE', failText, { side: side, result: 'DOWNS' }));
    }
    var own = clamp(Math.round(FIELD_YARDS - ytg - rng.gauss(C.puntNet.mean, C.puntNet.sd)), C.puntCapOwn, D.puntStart.max);   // draws: punt
    gs.stats[side].punts++;
    var puntText = stallText + ' - punt, ' + gs[opp + 'Id'] + ' at own ' + own;
    pushLog(gs, side, puntText, ytg, 'PUNT');
    return flipPossession(gs, state, rng, opp, FIELD_YARDS - own, ev(gs, 'DRIVE', puntText, { side: side, result: 'PUNT' }));
  }

  // ═══════════════════════════════ end-of-game script (§2.5.3) ═══════════════════════════════

  function initScript(gs, rng, side) {
    var T = S().script;
    var ytg = gs.ball && gs.ball.ytg ? gs.ball.ytg
      : clamp(Math.round(rng.gauss(T.ytg.mean, T.ytg.sd)), 1, FIELD_YARDS - 1);                    // draws (only without a known spot)
    gs.script = { ytg: ytg, down: 1, toGo: T.toGo, plays: 0, timeouts: gs.timeouts[side] };
    var d = deficit(gs, side);
    var text = 'Two-minute drill - ' + gs[side + 'Id'] + ' from ' + spotText(ytg) + ', ' + Util.fmtClock(gs.clock) + ' left, '
      + (d === 0 ? 'tied' : 'down ' + d);
    pushLog(gs, side, text, ytg, 'SCRIPT');
    return ev(gs, 'DRIVE', text, { side: side, result: 'SCRIPT' });
  }

  function withPressure(ctx, pressure) {
    var c = {};
    for (var k in ctx) if (hasOwn.call(ctx, k)) c[k] = ctx[k];
    c.pressure = pressure; c.clutch = pressure >= KT().pressure.clutchThreshold; c.decisive = true;
    return c;
  }

  function stepScriptPlay(gs, state, rng) {
    var T = S().script, sc = gs.script, side = gs.possession, opp = other(side);
    var downText = Util.ordinal(sc.down) + ' & ' + sc.toGo + ' at ' + spotText(sc.ytg);
    sc.plays++; gs.drive.plays++;
    if (rng.chance(T.toProb)) {                                                                    // draw 1: turnover
      gs.script = null; gs.stats[side].to++;
      gs.clock = Math.max(0, gs.clock - T.playSec);
      var toText = downText + ' - TURNOVER';
      pushLog(gs, side, toText, sc.ytg, 'TO');
      return flipPossession(gs, state, rng, opp, FIELD_YARDS - sc.ytg, ev(gs, 'DRIVE', toText, { side: side, result: 'TO' }));
    }
    var incomplete = rng.chance(T.incompleteProb);                                                 // draw 2
    var gain = 0, runoff = 0;
    if (!incomplete) {
      gain = Math.round(rng.gauss(T.gain.mean, T.gain.sd));                                        // draws 3, 4
      if (rng.chance(T.runoffProb)) runoff = T.runoffSec;                                          // draw 5
    }
    var playText = incomplete ? 'incomplete' : (gain >= 0 ? 'gain of ' + gain : 'loss of ' + (-gain));
    if (runoff && sc.timeouts > 0 && gs.clock < T.timeoutClockSec) {
      sc.timeouts--; gs.timeouts[side] = Math.max(0, gs.timeouts[side] - 1); runoff = 0;
      playText += ', timeout';
    }
    gs.clock = Math.max(0, gs.clock - (T.playSec + runoff));
    sc.ytg -= gain;
    if (sc.ytg <= 0) {
      gs.script = null;
      return scoreTouchdown(gs, state, rng, side, downText + ' - ' + playText + ', TOUCHDOWN');
    }
    if (gain >= sc.toGo) { sc.down = 1; sc.toGo = T.toGo; } else { sc.down++; sc.toGo -= gain; }
    var dist = sc.ytg + KT().distance.losToKick;
    var probe = probeCtx(gs, state, side, dist);
    var inRange = dist <= Kick().geometry(probe).maxFG + T.rangeMargin;
    var decision = null;
    if (gs.clock <= T.clockFgSec) decision = inRange ? 'FG' : 'CLOCK';
    else if (sc.down >= 4) {
      if (inRange && Kick().model(withPressure(probe, 1), null).pMake >= T.fourthDownPMake) decision = 'FG';
      else if (rng.chance(T.fourthDownConvert)) { sc.down = 1; sc.toGo = T.toGo; playText += ' - fourth down converted'; }   // draw: 4th-down gamble
      else decision = 'DOWNS';
    }
    if (!decision && inRange && (gs.clock <= T.fgClockSec || (sc.down >= 3 && gs.clock <= T.fgDown3ClockSec))) decision = 'FG';
    pushLog(gs, side, downText + ' - ' + playText, sc.ytg, 'PLAY');
    if (decision === 'FG') {
      gs.script = null;
      var d = deficit(gs, side);
      var aim = d === 0 ? 'win it' : (d === KT().points.FG ? 'tie it' : 'take the lead');
      var ctx = buildCtx(gs, state, rng, side, { type: 'FG', distance: dist, decisive: true, late: true });   // hash 1 · wind 2
      return attemptKick(gs, state, rng, side, ctx, { text: dist + '-yd field goal to ' + aim, prefix: 'Field goal to ' + aim });
    }
    if (decision === 'CLOCK') {
      gs.script = null; gs.clock = 0;
      pushLog(gs, side, 'Time expires on the drive', sc.ytg, 'CLOCK');
      return checkPeriodEnd(gs, rng) || ev(gs, 'DRIVE', 'Time expires', { side: side, result: 'CLOCK' });
    }
    if (decision === 'DOWNS') {
      gs.script = null;
      var dText = 'Fourth down fails at ' + spotText(sc.ytg);
      pushLog(gs, side, dText, sc.ytg, 'DOWNS');
      return flipPossession(gs, state, rng, opp, FIELD_YARDS - sc.ytg, ev(gs, 'DRIVE', dText, { side: side, result: 'DOWNS' }));
    }
    return ev(gs, 'DRIVE', downText + ' - ' + playText, { side: side, result: 'PLAY' });
  }

  // ═══════════════════════════════ college overtime (§2.5.4) ═══════════════════════════════

  function stepCollegeOt(gs, state, rng) {
    var O = S().ot.college, ot = gs.ot, side = gs.possession;
    var second = ot.possessions % 2 === 1;
    if (ot.period >= O.onlyTwoPtFromPeriod) {
      var good = rng.chance(S().twoPoint.convert);                                                 // draw 1
      if (good) addPoints(gs, side, S().points.twoPoint);
      var t2 = 'OT two-point try ' + (good ? 'is GOOD' : 'FAILS');
      pushLog(gs, side, t2, 0, good ? '2PT' : '2PT_FAIL');
      return endOtPossession(gs, state, rng, ev(gs, good ? 'SCORE' : 'DRIVE', t2, { side: side, result: good ? '2PT' : '2PT_FAIL' }));
    }
    var items = [];
    for (var k in O.table) if (hasOwn.call(O.table, k)) items.push({ k: k, w: O.table[k] });
    var outcome = rng.weighted(items, 'w').k;                                                      // draw 1
    if (outcome === 'TD') return scoreTouchdown(gs, state, rng, side, 'Overtime touchdown by ' + gs[side + 'Id']);
    if (outcome === 'STALL') {
      var Y = O.stallYtg;
      var ytg = clamp(Math.round(rng.gauss(Y.mean, Y.sd)), Y.min, Y.max);                          // draws 2, 3
      var dist = ytg + KT().distance.losToKick;
      var sit = { type: 'FG', distance: dist };
      if (!second) sit.decisive = false;                              // a first-possession FG neither wins nor extends the game
      var ctx = buildCtx(gs, state, rng, side, sit);                                               // hash 1 · wind 2
      var stallText = 'OT drive stalls at the ' + ytg;
      return attemptKick(gs, state, rng, side, ctx, { text: stallText + ' - ' + dist + '-yd FG attempt', prefix: stallText });
    }
    if (outcome === 'TO') gs.stats[side].to++;
    var text = outcome === 'TO' ? 'Overtime possession ends in a turnover' : 'Overtime possession ends on downs';
    pushLog(gs, side, text, gs.ball ? gs.ball.ytg : O.ytg, outcome);
    return endOtPossession(gs, state, rng, ev(gs, 'DRIVE', text, { side: side, result: outcome }));
  }

  /** A college OT possession is over: decide after each pair, otherwise hand the ball to the other team. */
  function endOtPossession(gs, state, rng, event) {
    var O = S().ot.college, ot = gs.ot;
    ot.possessions++;
    if (ot.possessions % 2 === 0) {
      ot.bothPossessed = true;
      if (gs.score.home !== gs.score.away) return endGame(gs, 'Final in overtime');
      ot.period++; gs.q = Math.min(gs.q + 1, S().ot.maxQ);
      ot.firstPossession = other(ot.firstPossession);
      pushLog(gs, ot.firstPossession, 'Overtime period ' + ot.period + ' - ' + scoreText(gs), O.ytg, 'OT_START');
      newPossession(gs, ot.firstPossession, O.ytg);
      if (!gs.pending) announce(gs, 'OT_START', 'Overtime period ' + ot.period, ot.firstPossession);
      return event;
    }
    newPossession(gs, other(gs.possession), O.ytg);
    return event;
  }

  // ═══════════════════════════════ game refs & summaries ═══════════════════════════════

  function resolveGameRef(state, ref) {
    ref = ref || {};
    var game = ref.game || null;
    var season = state.season;
    var league = ref.league || (game && game.league) || (season && season.league) || (state.player && state.player.league) || 'COLLEGE';
    league = league === 'NFL' ? 'NFL' : 'COLLEGE';
    if (!game && ref.gameId && season && season.schedule) game = findGame(season.schedule, ref.gameId);
    if (!game && ref.homeId && ref.awayId) {
      var week = num(ref.week, num(state.week, 1));
      game = { id: ref.gameId || ref.id || ((league === 'NFL' ? 'n' : 'c') + week + '-' + ref.homeId + '-' + ref.awayId),
        week: week, kind: ref.kind, homeId: ref.homeId, awayId: ref.awayId };
    }
    if (!game) throw new Error('Sim.startGame: game not found (' + (ref.gameId || '?') + ')');
    return { id: game.id, league: league, week: num(game.week, num(state.week, 1)), kind: game.kind || 'REG',
      homeId: game.homeId, awayId: game.awayId, site: game.site || null };
  }

  function metersOf(p) {
    return { morale: num(p.morale, 0), trust: num(p.trust, 0), fans: num(p.fans, 0), js: num(p.js, 0), fame: num(p.fame, 0) };
  }

  function meterDeltas(gs, p) {
    var now = metersOf(p), start = gs.meta && gs.meta.metersAtStart ? gs.meta.metersAtStart : now, d = {};
    for (var k in now) if (hasOwn.call(now, k)) d[k] = Util.round1(now[k] - num(start[k], now[k]));
    return d;
  }

  function emptyLine() { return { fga: 0, fgm: 0, pat: 0, patMade: 0, long: 0, gw: 0, tf: 0, pts: 0, made50plus: 0, clutchA: 0, clutchM: 0 }; }

  /** The user's own rows of this game (not the rival's, not the opponent's). */
  function userKickRows(gs) {
    var out = [];
    if (!gs.userSide) return out;
    var teamId = gs[gs.userSide + 'Id'];
    for (var i = 0; i < gs.kicks.length; i++) {
      var r = gs.kicks[i];
      if (r && r.teamId === teamId && !r.ai && r.type !== 'KO') out.push(r);
    }
    return out;
  }

  function lineFrom(rows) {
    var l = emptyLine(), KP = KT().points, fifty = KT().pressure.longDistFrom;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.type === 'PAT') { l.pat++; if (r.made) { l.patMade++; l.pts += KP.PAT; } continue; }
      l.fga++;
      if (has(r.tags, 'clutch')) l.clutchA++;
      if (r.made) {
        l.fgm++; l.pts += KP.FG;
        if (r.distance > l.long) l.long = r.distance;
        if (r.distance >= fifty) l.made50plus++;
        if (has(r.tags, 'clutch')) l.clutchM++;
        if (has(r.tags, 'gameWinner')) l.gw++;
        if (has(r.tags, 'tieForcer')) l.tf++;
      }
    }
    return l;
  }

  /** Resolve the gameWinner / tieForcer candidates now that the final score is known (§2.5.3). */
  function finalizeDecisive(gs, state) {
    var m = gs.meta, out = { gw: null, tf: null };
    if (!m) return out;
    var winner = gs.score.home > gs.score.away ? 'home' : (gs.score.away > gs.score.home ? 'away' : null);
    if (m.gw && winner === m.gw.side) out.gw = tagRow(gs, state, m.gw, 'gameWinner', 'gameWinners');
    if (m.tf && gs.ot) out.tf = tagRow(gs, state, m.tf, 'tieForcer', 'tieForcers');
    m.gw = null; m.tf = null;
    return out;
  }

  function tagRow(gs, state, cand, tag, statKey) {
    var row = findRow(gs.kicks, cand.id);
    if (!row) return null;
    if (has(row.tags, tag)) return row;
    row.tags.push(tag);
    var teamId = gs[cand.side + 'Id'];
    if (!row.ai) {
      if (state && state.stats) {
        var logged = findRow(state.stats.kicks, cand.id);                  // after a mid-game reload the rows are distinct objects
        if (logged && logged !== row && !has(logged.tags, tag)) logged.tags.push(tag);
        var keys = ['season', 'career', gs.league === 'NFL' ? 'nfl' : 'college'];
        for (var i = 0; i < keys.length; i++) if (state.stats[keys[i]]) state.stats[keys[i]][statKey] = num(state.stats[keys[i]][statKey], 0) + 1;
      }
    } else if (state && state.season && state.season.kickerStats && state.season.kickerStats[teamId]) {
      state.season.kickerStats[teamId][statKey] = num(state.season.kickerStats[teamId][statKey], 0) + 1;
    }
    return row;
  }

  /** §2.1.2 XP for the game (Pro values × difficulty.xpMult on the total); adds to player.xp. */
  function awardXp(state, gs, rows, won, tied) {
    var X = Tuning.progression.xp, mult = diffRow(state).xpMult, fifty = KT().pressure.longDistFrom;
    var items = [], sum = 0;
    function add(label, xp) { if (!xp) return; items.push({ label: label, xp: xp }); sum += xp; }
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], D = r.distance;
      if (r.type === 'PAT') { add(r.made ? 'PAT good' : 'PAT missed', r.made ? X.patMade : X.patMissed); continue; }
      if (r.type !== 'FG') continue;
      if (!r.made) { add(D + '-yd FG missed', X.fgMissed); continue; }
      add(D + '-yd FG made', Util.round1(X.fgMade + X.fgMadePerYd * Math.max(0, D - X.fgMadeFrom)));
      if (D >= fifty) add('50+ bonus', X.fifty);
      if (has(r.tags, 'clutch')) add('Clutch make', X.clutch);
      if (has(r.tags, 'gameWinner')) add('GAME-WINNER', X.gameWinner);
      else if (has(r.tags, 'tieForcer')) add('Tie-forcer', X.tieForcer);
    }
    if (gs.meta && gs.meta.koTouchbacks) add('Kickoff touchbacks', X.koTouchback * gs.meta.koTouchbacks);
    add(won ? 'Team win' : (tied ? 'Team tie' : 'Team loss'), won ? X.teamWin : X.teamLoss);
    var total = Math.round(sum * mult);
    state.player.xp = num(state.player.xp, 0) + total;
    return { items: items, total: total, mult: mult };
  }

  /**
   * Pure: the post-game headline tag from the kicker's OWN line (the team result is only the fallback, and is always
   * returned as `secondary`). Order: game_winner → decisive_miss → perfect_day (every FG and PAT made, FGA ≥
   * Tuning.sim.summary.perfectMinFga) → bad_day (FG% ≤ badDayPct on ≥ badDayMinFga FGA) → doink / blocked /
   * fifty_plus (from the kick rows, `key` = that row) → postgame_win / postgame_loss (a tie reads as a loss).
   * @param {{userLine:Object, kicks?:Object[], decisiveMiss?:boolean, won?:boolean, tied?:boolean}} summary
   * @returns {{tag:string, secondary:string, key:Object|null}}
   */
  Sim.headlineTag = function (summary) {
    var H = S().summary, line = summary.userLine || {}, rows = summary.kicks || [], fifty = KT().pressure.longDistFrom;
    var fga = num(line.fga, 0), fgm = num(line.fgm, 0), pat = num(line.pat, 0), patMade = num(line.patMade, 0);
    var secondary = summary.won ? 'postgame_win' : 'postgame_loss';
    var tag = null, key = null, i;
    if (num(line.gw, 0) > 0) tag = 'game_winner';
    else if (summary.decisiveMiss) tag = 'decisive_miss';
    else if (fga >= H.perfectMinFga && fgm === fga && patMade === pat) tag = 'perfect_day';
    else if (fga >= H.badDayMinFga && fgm <= fga * H.badDayPct) tag = 'bad_day';
    for (i = 0; i < rows.length && !tag; i++) if (DOINKS[rows[i].outcome]) { tag = 'doink'; key = rows[i]; }
    for (i = 0; i < rows.length && !tag; i++) if (rows[i].outcome === 'BLOCKED') { tag = 'blocked'; key = rows[i]; }
    for (i = 0; i < rows.length && !tag; i++) if (rows[i].type === 'FG' && rows[i].made && rows[i].distance >= fifty) { tag = 'fifty_plus'; key = rows[i]; }
    return { tag: tag || secondary, secondary: secondary, key: key };
  };

  /** The `{line}` slot text for a user line: '2-for-3' (+ ' and 2-for-2 on PATs' when PATs were kicked; PAT-only days read '3-for-3 on PATs'). */
  Sim.lineText = function (line) {
    line = line || {};
    var fga = num(line.fga, 0), fgm = num(line.fgm, 0), pat = num(line.pat, 0), patMade = num(line.patMade, 0);
    if (!fga && !pat) return '0-for-0';
    if (!fga) return patMade + '-for-' + pat + ' on PATs';
    var s = fgm + '-for-' + fga;
    if (pat) s += ' and ' + patMade + '-for-' + pat + ' on PATs';
    return s;
  };

  /** Post-game headline via Events.headline (1 draw) — the tag follows the kicker's day (Sim.headlineTag). */
  function makeHeadline(state, rng, gs, summary) {
    var E = Events();
    if (!E || !isFn(E.headline)) return null;
    var line = summary.userLine, rows = summary.kicks;
    var pick = Sim.headlineTag(summary), tag = pick.tag, key = pick.key;
    var oppSide = other(gs.userSide), oppTeam = teamOf(state, gs, oppSide);
    var us = gs.score[gs.userSide], them = gs.score[oppSide];
    var vars = {
      opp: oppTeam ? (oppTeam.school || oppTeam.name) : gs[oppSide + 'Id'],
      score: (summary.won ? 'W ' : (summary.tied ? 'T ' : 'L ')) + us + '-' + them,
      dist: key ? key.distance : (line.long || (rows.length ? rows[rows.length - 1].distance : 0)),
      line: Sim.lineText(line), secondary: pick.secondary,
      week: gs.week, won: summary.won, tied: summary.tied, fgm: line.fgm, fga: line.fga, gw: line.gw
    };
    if (line.fga) vars.pct = Math.round(PERCENT * line.fgm / line.fga) + ' %';
    return E.headline(state, rng, tag, vars);
  }

  /** Mark the schedule game played; user games also write results (Standings.recordResult) and the log. */
  function writeSchedule(state, gs) {
    var season = state.season;
    if (!season || season.league !== gs.league || !Array.isArray(season.schedule)) return null;
    var g = findGame(season.schedule, gs.id);
    if (!g) return null;
    var fresh = !g.played;
    g.played = true;
    g.score = { home: gs.score.home, away: gs.score.away };
    g.ot = !!gs.ot;
    g.weather = { weather: gs.weather.weather, tempF: gs.weather.tempF, wind: { speed: gs.weather.wind.speed, dir: gs.weather.wind.dir } };
    if (gs.userSide) {
      g.log = [];
      for (var i = 0; i < gs.driveLog.length; i++) g.log.push(Sim.driveLogLine(gs, gs.driveLog[i]));
      if (fresh) recordResult(state, season, gs.league, g);
    }
    return g;
  }

  function recordResult(state, season, league, g) {
    var St = Standings(), lg = leagueObj(state, league);
    if (St && isFn(St.recordResult) && lg) { St.recordResult(season, lg, g); return; }
    if (!season.results) season.results = {};
    var Sc = Schema();
    var ids = [g.homeId, g.awayId];
    for (var i = 0; i < ids.length; i++) {
      if (!season.results[ids[i]]) season.results[ids[i]] = Sc && isFn(Sc.emptyTeamResult) ? Sc.emptyTeamResult()
        : { w: 0, l: 0, t: 0, pf: 0, pa: 0, confW: 0, confL: 0, divW: 0, divL: 0, h2h: {}, streak: 0 };
    }
    var h = season.results[g.homeId], a = season.results[g.awayId];
    h.pf += g.score.home; h.pa += g.score.away; a.pf += g.score.away; a.pa += g.score.home;
    if (g.score.home === g.score.away) { h.t++; a.t++; }
    else if (g.score.home > g.score.away) { h.w++; a.l++; } else { a.w++; h.l++; }
  }

  // ═══════════════════════════════ public API (§3.5.11) ═══════════════════════════════

  /**
   * Start a game (§3.5.11). Draws: Weather.forGame (0 dome · 6–7 outdoors) → rating noise gauss ×4
   * (home OFF, home DEF, away OFF, away DEF) → coin toss 1. Sets `state.game` when the user's team plays
   * (never with opts.ai). `gameRef` = {league, gameId} (looked up in state.season.schedule), or
   * {league, game: Game}, or {league, homeId, awayId, week?, kind?, gameId?}.
   * @param {Object} state CareerState @param {RNG} rng @param {Object} gameRef @param {{ai?:boolean}} [opts]
   * @returns {Object} GameState
   */
  Sim.startGame = function (state, rng, gameRef, opts) {
    opts = opts || {};
    var g = resolveGameRef(state, gameRef);
    var lg = leagueObj(state, g.league);
    var home = teamIn(lg, g.homeId), away = teamIn(lg, g.awayId);
    if (!home || !away) throw new Error('Sim.startGame: unknown team in ' + g.id);
    var userSide = null;
    if (!opts.ai && state.player && state.player.teamId) {
      userSide = state.player.teamId === home.id ? 'home' : (state.player.teamId === away.id ? 'away' : null);
    }
    var D = S().drive, C = S().clock;
    var wx = RTG.Weather.forGame(rng, g.site || home, g.week, g.league, diffRow(state).windCap);
    var off = { home: 0, away: 0 }, def = { home: 0, away: 0 };
    off.home = Util.round1(num(home.OFF, Tuning.league.drift.nflAnchor) + rng.gauss(0, D.ratingNoiseSd));   // noise 1
    def.home = Util.round1(num(home.DEF, Tuning.league.drift.nflAnchor) + rng.gauss(0, D.ratingNoiseSd));   // noise 2
    off.away = Util.round1(num(away.OFF, Tuning.league.drift.nflAnchor) + rng.gauss(0, D.ratingNoiseSd));   // noise 3
    def.away = Util.round1(num(away.DEF, Tuning.league.drift.nflAnchor) + rng.gauss(0, D.ratingNoiseSd));   // noise 4
    var recv = rng.chance(C.coinP) ? 'home' : 'away';                                                     // coin toss
    var gs = Schema().createGameState({
      id: g.id, league: g.league, week: g.week, kind: g.kind, homeId: home.id, awayId: away.id, userSide: userSide,
      weather: { weather: wx.weather, tempF: wx.tempF, wind: { speed: wx.wind.speed, dir: wx.wind.dir }, surface: wx.surface, altitude: !!wx.altitude, dome: !!wx.dome },
      offRating: off, defRating: def, timeouts: C.timeoutsPerHalf, receivedFirst: recv
    });
    gs.announce = null;
    gs.meta = { gw: null, tf: null, koTouchbacks: 0, metersAtStart: userSide && state.player ? metersOf(state.player) : null };
    pushLog(gs, recv, gs[recv + 'Id'] + ' wins the toss and receives', 0, 'TOSS');
    if (userSide) state.game = gs;
    return gs;
  };

  /**
   * Advance the game by one drive / one script play / one kickoff (§2.5.7). Throws while a user kick is
   * pending (except to deliver the queued USER_KICK after an ICE_TIMEOUT). Returns {type:'END'} once the
   * END_GAME event has been delivered.
   * @param {Object} gs GameState @param {Object} state CareerState @param {RNG} rng
   * @returns {{type:string, text:string, side?:string, kick?:Object, ctx?:Object, gs:Object}} SimEvent
   */
  Sim.step = function (gs, state, rng) {
    if (gs.announce) {
      var a = gs.announce, extra = a.side ? { side: a.side } : null;
      if (gs.pending && a.type === 'USER_KICK') extra.ctx = gs.pending.ctx;
      gs.announce = null;
      return ev(gs, a.type, a.text, extra);
    }
    if (gs.pending) throw new Error('Sim.step: pending kick must be applied first');
    if (gs.done) return ev(gs, 'END', 'Final: ' + scoreText(gs));
    if (gs.pendingKickoff) return doKickoff(gs, state, rng);
    if (gs.ot && gs.ot.mode === 'COLLEGE') return stepCollegeOt(gs, state, rng);
    if (gs.script) return stepScriptPlay(gs, state, rng);
    return stepDrive(gs, state, rng);
  };

  /**
   * Loop `step` until USER_KICK, USER_KICKOFF, ICE_TIMEOUT (the next call yields USER_KICK), END_GAME or END.
   * @param {Object} gs @param {Object} state @param {RNG} rng @returns {Object} SimEvent
   */
  Sim.simToNextUserKick = function (gs, state, rng) {
    var guard = S().summary.maxSteps;
    for (var i = 0; i < guard; i++) {
      var e = Sim.step(gs, state, rng);
      if (e.type === 'USER_KICK' || e.type === 'USER_KICKOFF' || e.type === 'ICE_TIMEOUT' || e.type === 'END_GAME' || e.type === 'END') return e;
    }
    throw new Error('Sim.simToNextUserKick: step guard exceeded');
  };

  /**
   * Apply the user's resolved kick (§3.5.11): scores it, logs via Stats.recordKick, applies per-kick meters,
   * appends to gs.kicks, clears `pending`, queues the kickoff / possession change; blocked NFL PAT returned
   * for two scores for the defence. A period event reached here (END_HALF/OT_START/END_GAME) is queued for
   * the next `step`. Returns the resulting SimEvent (callers may ignore it).
   * @param {Object} gs @param {Object} state @param {RNG} rng @param {Object} result KickResult
   * @returns {Object} SimEvent
   */
  Sim.applyKick = function (gs, state, rng, result) {
    if (!gs.pending || gs.pending.type !== 'USER_KICK') throw new Error('Sim.applyKick: no pending user kick');
    if (!result || typeof result.made !== 'boolean') throw new Error('Sim.applyKick: a KickResult is required');
    var ctx = gs.pending.ctx;
    var e = settleKick(gs, state, rng, ctx, result, false);
    if (PERIOD_EVENTS[e.type]) gs.announce = { type: e.type, text: e.text, side: e.side || null };
    return e;
  };

  /**
   * Apply the user's kickoff result (settings.playKickoffs). Sets the new possession or the return TD.
   * @param {Object} gs @param {Object} state @param {RNG} rng @param {Object} koResult Kick.resolveKickoff result
   * @returns {Object} SimEvent
   */
  Sim.applyKickoff = function (gs, state, rng, koResult) {
    if (!gs.pending || gs.pending.type !== 'USER_KICKOFF') throw new Error('Sim.applyKickoff: no pending user kickoff');
    if (!koResult) throw new Error('Sim.applyKickoff: a KickoffResult is required');
    var ctx = gs.pending.ctx;
    var e = settleKickoff(gs, state, rng, ctx, koResult, true);
    if (PERIOD_EVENTS[e.type]) gs.announce = { type: e.type, text: e.text, side: e.side || null };
    return e;
  };

  /**
   * Resolve the pending user kick / kickoff with the AI rule on the user's own snapshot (auto-PAT, sim mode,
   * injured-in-game). Draws: aiInput 6 + resolve 5+ (kickoff: resolveKickoff). Tags the result 'auto'.
   * @param {Object} gs @param {Object} state @param {RNG} rng @returns {Object} KickResult | KickoffResult
   */
  Sim.autoResolvePending = function (gs, state, rng) {
    if (!gs.pending) throw new Error('Sim.autoResolvePending: nothing pending');
    var K = Kick(), ctx = gs.pending.ctx;
    if (gs.pending.type === 'USER_KICKOFF') {
      var ko = K.resolveKickoff(rng, ctx, null, null);
      Sim.applyKickoff(gs, state, rng, ko);
      return ko;
    }
    var input = K.aiInput(rng, ctx, null);
    var result = K.resolve(rng, ctx, null, input, { auto: true });
    Sim.applyKick(gs, state, rng, result);
    return result;
  };

  /**
   * Close the user's game (§3.5.11): resolves gameWinner / tieForcer tags, writes season.schedule[game]
   * (played, score, ot, weather, log) and season.results (Standings.recordResult), builds the GameSummary —
   * grade (Stats.grade), XP items (§2.1.2), meter deltas, headline (Events.headline, 1 draw), injury roll
   * (Player.rollInjury, 1–2 draws) — records the game (Stats.recordGame), checks records, then sets
   * state.game = null and season.weekGameDone = true.
   * @param {Object} gs @param {Object} state @param {RNG} rng
   * @returns {Object} GameSummary
   */
  Sim.finishGame = function (gs, state, rng) {
    if (!gs.done) throw new Error('Sim.finishGame: the game is not over');
    var userSide = gs.userSide, oppSide = userSide ? other(userSide) : null;
    var tied = gs.score.home === gs.score.away;
    var won = !!userSide && !tied && gs.score[userSide] > gs.score[oppSide];
    var decisive = finalizeDecisive(gs, state);
    writeSchedule(state, gs);
    var summary = {
      gameId: gs.id, league: gs.league, week: gs.week, kind: gs.kind,
      homeId: gs.homeId, awayId: gs.awayId, userSide: userSide, oppId: oppSide ? gs[oppSide + 'Id'] : null,
      score: { home: gs.score.home, away: gs.score.away }, won: won, tied: tied, ot: !!gs.ot,
      userLine: emptyLine(), grade: null, xp: { items: [], total: 0, mult: diffRow(state).xpMult },
      meters: { morale: 0, trust: 0, fans: 0, js: 0, fame: 0 }, headline: null,
      kicks: [], drives: gs.driveLog.slice(), teamStats: gs.stats,
      gameWinner: decisive.gw ? decisive.gw.id : null, tieForcer: decisive.tf ? decisive.tf.id : null,
      played: false, decisiveMiss: false, injury: null, milestones: []
    };
    if (userSide && state.player) {
      var p = state.player, St = Stats(), P = Player();
      var rows = userKickRows(gs);
      summary.kicks = rows;
      summary.userLine = lineFrom(rows);
      summary.played = rows.length > 0 || userKicks(gs, state, userSide);
      for (var i = 0; i < rows.length; i++) if (!rows[i].made && has(rows[i].tags, 'decisive')) summary.decisiveMiss = true;
      summary.grade = St && isFn(St.grade) ? St.grade({ userLine: summary.userLine, decisiveMiss: summary.decisiveMiss }) : null;
      summary.xp = awardXp(state, gs, rows, won, tied);
      if (P && isFn(P.applyGameResultMeters)) P.applyGameResultMeters(state, won, tied);
      if (summary.played && P && isFn(P.rollInjury) && !p.injury) summary.injury = P.rollInjury(state, rng) || null;   // 1–2 draws
      if (St && isFn(St.recordGame)) St.recordGame(state, { won: won, tied: tied, started: summary.played, userLine: summary.userLine });
      if (St && isFn(St.checkRecords)) summary.milestones = St.checkRecords(state) || [];
      summary.meters = meterDeltas(gs, p);
      summary.headline = makeHeadline(state, rng, gs, summary);                                        // 1 draw
    }
    if (state.game && state.game.id === gs.id) state.game = null;
    if (userSide && state.season && state.season.league === gs.league) state.season.weekGameDone = true;
    return summary;
  };

  /**
   * A full AI-vs-AI game (§3.5.11; used by Season.simOtherGames with a forked rng). Every kick is resolved
   * through Kick.model/aiInput/resolve and recorded into season.kickerStats (Stats.recordAiKick); the schedule
   * game is marked played with its score/ot. Season.results are NOT written here (Season owns standings).
   * @param {Object} state @param {RNG} rng @param {Object} gameRef see startGame
   * @returns {{score:{home:number, away:number}, ot:boolean, kicks:Object[], homeId:string, awayId:string, gs:Object}}
   */
  Sim.simAiGame = function (state, rng, gameRef) {
    var gs = Sim.startGame(state, rng, gameRef, { ai: true });
    var guard = S().summary.maxSteps;
    for (var i = 0; i < guard && !gs.done; i++) {
      Sim.step(gs, state, rng);
      if (gs.pending) throw new Error('Sim.simAiGame: unexpected pending kick in an AI game');
    }
    if (!gs.done) throw new Error('Sim.simAiGame: step guard exceeded');
    finalizeDecisive(gs, state);
    writeSchedule(state, gs);
    return { score: { home: gs.score.home, away: gs.score.away }, ot: !!gs.ot, kicks: gs.kicks, homeId: gs.homeId, awayId: gs.awayId, gs: gs };
  };

  /**
   * One-line text for a SimEvent or a DriveLogRow, e.g. "Q2 3:12 · BOS · Drive stalls at the 31 - punt".
   * Pure; the UI may use it for the drive log.
   * @param {Object} gs @param {Object} event SimEvent or DriveLogRow ({q, clock, side, text})
   * @returns {string}
   */
  Sim.driveLogLine = function (gs, event) {
    var e = event || {};
    var Q = S().clock.quarters;
    var q = num(e.q, gs.q), clock = num(e.clock, gs.clock);
    var otN = q - Q;
    var period = otN > 0 ? 'OT' + (otN > 1 ? otN : '') : 'Q' + q;
    var showClock = !(gs.ot && gs.ot.mode === 'COLLEGE' && otN > 0);
    var parts = [period + (showClock ? ' ' + Util.fmtClock(clock) : '')];
    if (e.side && (e.side === 'home' || e.side === 'away')) parts.push(gs[e.side + 'Id'] || e.side);
    parts.push(e.text || '');
    return parts.join(' · ');
  };

  RTG.Sim = Sim;
})(typeof window !== 'undefined' ? window : globalThis);
