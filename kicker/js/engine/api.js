/**
 * Road to Glory: Kicker — RTG.Engine (SPEC §3.5.20 facade, §3.6 flow, §3.8 what RTG.debug calls)
 *
 * Every UI dispatch goes through one of these functions; each validates its preconditions (descriptive Errors),
 * mutates `state` in place, writes `state.rngState` back and returns a plain result. Nothing here derives game
 * rules — the facade only sequences Schema / Player / Kick / Sim / Season / Events / Career / Save.
 *
 * Auto-play (tests, RTG.debug): autoPlayGame (Season.simUserGameAuto), autoPlayWeek (train with an auto focus,
 * greedy XP spend, game, endWeek, event choice 0), autoPlaySeason (PRE → OFF), autoPlayOffseason (default choices from
 * Tuning.career.autoplay: best offer, redshirt when offered, declare as soon as eligible — see the DEVIATION note in
 * autoOption — accept the extension, retire when forced or from 34 unless still elite), autoPlayCareer (HS → RETIRED).
 *
 * Pure over plain JSON + rng: no DOM, no clock (the UI passes `now`), no ambient randomness.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  var Util = RTG.Util, Tuning = RTG.Tuning;
  var Engine = {};

  var ATTRS = ['POW', 'ACC', 'CON', 'CLU', 'KO'];
  var IN_SEASON = { REG: true, POST: true };
  var PLAYING = { COLLEGE: true, NFL: true };
  var MAX_SETTLE = 60;          // pendings resolved per settle loop (guard against a stuck chain)
  var MAX_SPEND = 400;          // XP raises per auto spend (guard)

  // ═══════════════════════════════ late-bound modules & helpers ═══════════════════════════════

  function Schema() { return RTG.Schema; }
  function Player() { return RTG.Player; }
  function Kick() { return RTG.Kick; }
  function Sim() { return RTG.Sim; }
  function Season() { return RTG.Season; }
  function Events() { return RTG.Events; }
  function Career() { return RTG.Career; }
  function Contracts() { return RTG.Contracts; }
  function Draft() { return RTG.Draft; }
  function Save() { return RTG.Save; }
  function TA() { return Tuning.career.autoplay; }
  function isFn(f) { return typeof f === 'function'; }
  function num(v, d) { return typeof v === 'number' && v === v ? v : d; }
  function has(arr, v) { return Array.isArray(arr) && arr.indexOf(v) >= 0; }
  function fail(fn, msg) { throw new Error('Engine.' + fn + ': ' + msg); }
  function need(mod, name, fn) { if (!mod) fail(fn, 'RTG.' + name + ' is required'); return mod; }
  function checkState(state, fn) {
    if (!state || typeof state !== 'object' || !state.player) fail(fn, 'a CareerState is required');
    return state;
  }
  function checkRng(rng, fn) {
    if (!rng || !isFn(rng.next) || !isFn(rng.state)) fail(fn, 'an RTG.RNG instance is required');
    return rng;
  }
  /** Write the rng state back (the store does it too; keeping the two in sync makes saves exact). */
  function sync(state, rng, value) {
    if (rng && isFn(rng.state)) state.rngState = rng.state();
    return value;
  }
  function cur(state) { return { stage: state.stage, phase: state.phase, year: state.year, week: state.week, pending: state.pending ? state.pending.kind : null }; }
  function sflags(state) { state.flags = state.flags || {}; return state.flags; }
  function pflags(state) { state.player.flags = state.player.flags || {}; return state.player.flags; }
  function pendingKind(state) { return state.pending ? state.pending.kind : null; }
  function userInLeague(state) {
    var p = state.player, s = state.season;
    return !!(p.teamId && s && p.league === s.league);
  }
  function ovrOf(attrs) {
    var P = Player();
    if (P && isFn(P.ovr)) return P.ovr(attrs);
    var W = Tuning.progression.ovrWeights, s = 0;
    for (var k in W) if (Object.prototype.hasOwnProperty.call(W, k)) s += W[k] * num(attrs[k], 0);
    return Math.round(s);
  }

  // ═══════════════════════════════ skipped games (HOLDOUT / SKIP_GAME) ═══════════════════════════════

  /** A skipGame flag for this week: the user sits (role K2 for the game; the AI leg kicks); restored by afterUserGame. */
  function beforeUserGame(state) {
    var f = sflags(state), p = state.player, sg = f.skipGame;
    if (!sg || sg.year !== state.year || sg.week !== state.week || sg.active) return;
    sg.active = true;
    sg.restoreRole = p.role;
    if (p.role === 'K1') p.role = 'K2';
  }
  function afterUserGame(state) {
    var f = sflags(state), p = state.player, sg = f.skipGame;
    if (!sg || !sg.active) return;
    if (sg.restoreRole && p.role === 'K2') p.role = sg.restoreRole;
    delete f.skipGame;
  }

  // ═══════════════════════════════ §3.5.20 newCareer / save / load ═══════════════════════════════

  /**
   * Create a career (§3.5.4 / §3.5.20). Seed: opts.seed (number or string, via RNG.toSeed), default fnv1a32(String(now)).
   * @param {{name?:string|Object, archetype?:string, difficulty?:string, seed?:number|string, hometown?:Object, look?:Object, foot?:'R'|'L', settings?:Object}} opts
   * @param {number} now ms (supplied by the UI)
   * @returns {{state:Object, rng:Object}}
   */
  Engine.newCareer = function (opts, now) {
    opts = opts || {};
    var S = need(Schema(), 'Schema', 'newCareer'), R = need(RTG.RNG, 'RNG', 'newCareer');
    var given = opts.seed !== undefined && opts.seed !== null && opts.seed !== '';
    var seed = given ? R.toSeed(typeof opts.seed === 'string' && /^\d+$/.test(opts.seed) ? Number(opts.seed) : opts.seed) : Util.fnv1a32(String(typeof now === 'number' ? now : 0));
    var rng = R.create(seed);
    var o = {};
    for (var k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k];
    o.seed = seed;
    o.createdAt = typeof now === 'number' ? now : 0;
    var state = S.createCareer(o, rng);
    state.rngState = rng.state();
    return { state: state, rng: rng };
  };

  /**
   * Save blob (Save.serialize). @param {Object} state @param {Object} rng @param {number} now @returns {Object} SaveBlob
   */
  Engine.save = function (state, rng, now) {
    checkState(state, 'save');
    return need(Save(), 'Save', 'save').serialize(state, rng || null, now);
  };

  /**
   * Load a blob (Save.deserialize) into {state, rng}; throws on CHECKSUM / NEWER / INVALID.
   * @param {Object|string} blob @returns {{state:Object, rng:Object, migrated:boolean, warnings:string[]}}
   */
  Engine.load = function (blob) {
    var r = need(Save(), 'Save', 'load').deserialize(blob);
    if (!r || r.error) fail('load', (r && r.error) || 'INVALID' + (r && r.errors ? ': ' + r.errors.slice(0, 3).join('; ') : '') + (r && r.message ? ' — ' + r.message : ''));
    return { state: r.state, rng: RTG.RNG.create(r.rngState), migrated: !!r.migrated, warnings: r.warnings || [] };
  };

  // ═══════════════════════════════ training & XP ═══════════════════════════════

  /**
   * Weekly training focus (§2.1.2): once per in-season week, no pending. @returns {{xp:number, moraleDelta:number, focus:string}}
   */
  Engine.train = function (state, rng, focus) {
    checkState(state, 'train');
    if (state.pending) fail('train', 'resolve the pending ' + pendingKind(state) + ' first');
    if (!IN_SEASON[state.phase] || !PLAYING[state.stage]) fail('train', 'training happens in season (phase ' + state.phase + ')');
    if (!state.season || state.season.trainingDone) fail('train', 'training is done for week ' + state.week);
    var r = need(Player(), 'Player', 'train').applyTraining(state, focus);
    return sync(state, rng, r);
  };

  /**
   * Spend XP on one attribute (Player.spendXp; the week's focus earns the 25 % discount).
   * @returns {{ok:boolean, cost:number, newValue:number, reason?:string}}
   */
  Engine.spendXp = function (state, attr) {
    checkState(state, 'spendXp');
    if (!has(ATTRS, attr)) fail('spendXp', 'unknown attribute ' + attr);
    var focus = state.season && IN_SEASON[state.phase] && state.season.trainingDone ? state.season.focus : null;
    return need(Player(), 'Player', 'spendXp').spendXp(state.player, attr, { focus: focus });
  };

  // ═══════════════════════════════ games ═══════════════════════════════

  /**
   * Start the user's game of the week (Sim.startGame). Errors: pending, out of season, game in progress, bye, already played.
   * @returns {Object} GameState
   */
  Engine.startUserGame = function (state, rng) {
    checkState(state, 'startUserGame'); checkRng(rng, 'startUserGame');
    if (state.pending) fail('startUserGame', 'resolve the pending ' + pendingKind(state) + ' first');
    if (!IN_SEASON[state.phase] || !PLAYING[state.stage]) fail('startUserGame', 'not in season (phase ' + state.phase + ')');
    if (state.game) fail('startUserGame', 'a game is already in progress');
    var Se = need(Season(), 'Season', 'startUserGame');
    var ref = Se.userGameRef(state);
    if (!ref) fail('startUserGame', state.player.teamId ? 'bye week' : 'the player has no team');
    if (ref.played || state.season.weekGameDone) fail('startUserGame', 'this week\'s game is already done (weekGameDone)');
    beforeUserGame(state);
    var gs = need(Sim(), 'Sim', 'startUserGame').startGame(state, rng, { league: ref.league, gameId: ref.gameId });
    return sync(state, rng, gs);
  };

  function game(state, fn) {
    if (!state.game) fail(fn, 'no game in progress');
    return state.game;
  }

  /** One sim step (Sim.step) on state.game. @returns {Object} SimEvent */
  Engine.simStep = function (state, rng) {
    checkState(state, 'simStep'); checkRng(rng, 'simStep');
    var gs = game(state, 'simStep');
    return sync(state, rng, need(Sim(), 'Sim', 'simStep').step(gs, state, rng));
  };

  /** Sim to the next user kick / kickoff / end (Sim.simToNextUserKick). @returns {Object} SimEvent */
  Engine.simToKick = function (state, rng) {
    checkState(state, 'simToKick'); checkRng(rng, 'simToKick');
    var gs = game(state, 'simToKick');
    return sync(state, rng, need(Sim(), 'Sim', 'simToKick').simToNextUserKick(gs, state, rng));
  };

  /**
   * Resolve the pending user kick with a kick triple (Kick.resolve on the context's kicker snapshot), then
   * Sim.applyKick (which logs the row via Stats.recordKick and applies Player.applyKickMeters).
   * @param {Object} state @param {Object} rng @param {{power:number, aim:number, quality:number, holdMs?:number}} input
   * @returns {Object} KickResult
   */
  Engine.applyUserKick = function (state, rng, input, opts) {
    checkState(state, 'applyUserKick'); checkRng(rng, 'applyUserKick');
    var gs = game(state, 'applyUserKick');
    if (!gs.pending) fail('applyUserKick', 'no pending kick (sim to the next kick first)');
    if (gs.pending.type !== 'USER_KICK') fail('applyUserKick', 'the pending play is a ' + gs.pending.type + ' — use applyUserKickoff');
    var forced = opts && opts.forced ? opts.forced : null;
    if (!forced && (!input || typeof input !== 'object')) fail('applyUserKick', 'a KickInput {power, aim, quality} is required');
    var K = need(Kick(), 'Kick', 'applyUserKick'), Sm = need(Sim(), 'Sim', 'applyUserKick');
    var inp = input && typeof input === 'object' ? input : neutralInput(K, gs.pending.ctx);
    var result = forced ? K.resolve(rng, gs.pending.ctx, null, inp, { forced: forced }) : K.resolve(rng, gs.pending.ctx, null, inp);
    Sm.applyKick(gs, state, rng, result);
    return sync(state, rng, result);
  };

  /** A neutral kick triple (AI power for the distance, aim 0, quality 0.85) — used when a forced outcome is requested without an input. */
  function neutralInput(K, ctx) {
    var g = K.geometry(ctx, null);
    return { power: K.aiPower(g.pNeed), aim: 0, quality: Tuning.kick.ai.modelQuality };
  }

  /** Resolve the pending kick / kickoff with the AI rule (auto-PAT, sim mode). @returns {Object} KickResult|KickoffResult */
  Engine.autoKick = function (state, rng) {
    checkState(state, 'autoKick'); checkRng(rng, 'autoKick');
    var gs = game(state, 'autoKick');
    if (!gs.pending) fail('autoKick', 'no pending kick');
    return sync(state, rng, need(Sim(), 'Sim', 'autoKick').autoResolvePending(gs, state, rng));
  };

  /**
   * Resolve the pending user kickoff (settings.playKickoffs): input {timing} or null for a simulated kick.
   * @returns {Object} KickoffResult
   */
  Engine.applyUserKickoff = function (state, rng, input) {
    checkState(state, 'applyUserKickoff'); checkRng(rng, 'applyUserKickoff');
    var gs = game(state, 'applyUserKickoff');
    if (!gs.pending) fail('applyUserKickoff', 'no pending kickoff');
    if (gs.pending.type !== 'USER_KICKOFF') fail('applyUserKickoff', 'the pending play is a ' + gs.pending.type + ' — use applyUserKick');
    var K = need(Kick(), 'Kick', 'applyUserKickoff'), Sm = need(Sim(), 'Sim', 'applyUserKickoff');
    var res = K.resolveKickoff(rng, gs.pending.ctx, null, input || null);
    Sm.applyKickoff(gs, state, rng, res);
    return sync(state, rng, res);
  };

  /** Close the finished game (Sim.finishGame). @returns {Object} GameSummary */
  Engine.finishUserGame = function (state, rng) {
    checkState(state, 'finishUserGame'); checkRng(rng, 'finishUserGame');
    var gs = game(state, 'finishUserGame');
    if (!gs.done) fail('finishUserGame', 'the game is not over yet');
    var summary = need(Sim(), 'Sim', 'finishUserGame').finishGame(gs, state, rng);
    afterUserGame(state);
    return sync(state, rng, summary);
  };

  // ═══════════════════════════════ week / events / sessions / decisions ═══════════════════════════════

  /**
   * Close the week (Season.endWeek) then the career's weekly hook (Career.afterWeek). Errors: pending, a game in
   * progress, or the week's game unplayed. @returns {Object} WeekReport
   */
  Engine.endWeek = function (state, rng) {
    checkState(state, 'endWeek'); checkRng(rng, 'endWeek');
    if (state.pending) fail('endWeek', 'resolve the pending ' + pendingKind(state) + ' first');
    if (state.game) fail('endWeek', state.game.done ? 'call finishUserGame first' : 'the game is not done');
    if (!IN_SEASON[state.phase] || !PLAYING[state.stage]) fail('endWeek', 'not in season (phase ' + state.phase + ')');
    var Se = need(Season(), 'Season', 'endWeek');
    var ref = Se.userGameRef(state);
    if (ref && !ref.played) fail('endWeek', 'play or sim this week\'s game first');
    var report = Se.endWeek(state, rng);
    var C = Career();
    if (C && isFn(C.afterWeek)) report.career = C.afterWeek(state, rng);
    return sync(state, rng, report);
  };

  /**
   * Resolve the pending event with a choice (Events.apply → Career.handleActions → chain resume).
   * @returns {Object} EventOutcome (+ actionResults)
   */
  Engine.chooseEvent = function (state, rng, idx) {
    checkState(state, 'chooseEvent'); checkRng(rng, 'chooseEvent');
    if (!state.pending || state.pending.kind !== 'EVENT') fail('chooseEvent', 'no pending event');
    var E = need(Events(), 'Events', 'chooseEvent'), C = Career();
    var out = E.apply(state, rng, num(idx, 0));
    out.actionResults = C && isFn(C.handleActions) ? C.handleActions(state, rng, out.actions) : [];
    if (C && isFn(C.resume)) C.resume(state, rng);
    return sync(state, rng, out);
  };

  /** Next context index of a session (combine ladders skip rungs after a miss). −1 when complete. */
  function nextSessionIdx(sess) {
    var D = Draft();
    if (sess.kind && sess.kind.indexOf('COMBINE') === 0 && D && isFn(D.combineNextIdx)) return D.combineNextIdx(sess);
    var i = sess.results.length;
    return i < sess.contexts.length ? i : -1;
  }

  /**
   * Play one kick of the pending KickSession (showcase / camp / combine / halftime-70 / tryout / practice). `input`
   * = a kick triple ({timing} for a kickoff), or null for the AI rule. The last kick calls Career.finishSession.
   * @returns {{result:Object, idx:number, done:boolean, outcome:Object|null, remaining:number}}
   */
  Engine.sessionKick = function (state, rng, input, opts) {
    checkState(state, 'sessionKick'); checkRng(rng, 'sessionKick');
    if (!state.pending || state.pending.kind !== 'KICKS') fail('sessionKick', 'no pending kick session');
    var sess = state.pending.session;
    var idx = nextSessionIdx(sess);
    if (idx < 0) fail('sessionKick', 'the session is complete');
    var K = need(Kick(), 'Kick', 'sessionKick'), C = need(Career(), 'Career', 'sessionKick');
    var ctx = sess.contexts[idx];
    var forced = opts && opts.forced ? opts.forced : null;
    var result;
    if (ctx.type === 'KO') result = K.resolveKickoff(rng, ctx, null, input || null);
    else if (forced) result = K.resolve(rng, ctx, null, input || neutralInput(K, ctx), { forced: forced });   // debug: 0 draws
    else result = K.resolve(rng, ctx, null, input || K.aiInput(rng, ctx, null), input ? {} : { auto: true });
    sess.results[idx] = result;
    sess.idx = sess.results.length;
    var done = nextSessionIdx(sess) < 0;
    var outcome = null;
    if (done) {
      outcome = C.finishSession(state, rng);
      if (isFn(C.resume)) C.resume(state, rng);
    }
    return sync(state, rng, { result: result, idx: idx, done: done, outcome: outcome, remaining: done ? 0 : sess.contexts.length - sess.results.length });
  };

  /** Resolve the pending decision (Career.decide). @returns {Object} DecisionOutcome */
  Engine.decide = function (state, rng, arg) {
    checkState(state, 'decide'); checkRng(rng, 'decide');
    return sync(state, rng, need(Career(), 'Career', 'decide').decide(state, rng, arg));
  };

  // ═══════════════════════════════ §3.6 nextPhase ═══════════════════════════════

  /**
   * Drive the career flow (§3.6): PRE → REG (Season.beginRegular); AWARDS → OFF (Season.offseason → chain);
   * OFF → chain → next year (Season.advanceYear) or the draft; DRAFT.COMBINE (done) → DRAFT.DRAFT → Career.runDraft;
   * RETIRED stays. Idempotent while something is pending (returns the current position). Throws in REG / POST
   * (play the week and call endWeek) and before the showcase / combine are played.
   * @returns {{stage:string, phase:string, year:number, week:number, pending:string|null}}
   */
  Engine.nextPhase = function (state, rng) {
    checkState(state, 'nextPhase'); checkRng(rng, 'nextPhase');
    if (state.pending) return cur(state);
    var Se = need(Season(), 'Season', 'nextPhase'), C = need(Career(), 'Career', 'nextPhase');
    var stage = state.stage, phase = state.phase;
    if (stage === 'HS') fail('nextPhase', phase === 'SHOWCASE' ? 'play the showcase first' : 'pick a college offer first');
    if (stage === 'RETIRED') return sync(state, rng, cur(state));
    if (stage === 'DRAFT') {
      if (phase === 'DECLARE') { C.enterDraft(state, rng); return sync(state, rng, cur(state)); }
      if (phase === 'COMBINE') {
        if (sflags(state).combineScore === undefined) fail('nextPhase', 'play the combine first');
        state.phase = 'DRAFT';
        return sync(state, rng, cur(state));
      }
      if (phase === 'DRAFT') { C.runDraft(state, rng); return sync(state, rng, cur(state)); }
      if (phase === 'UDFA') {
        if (!state.player.teamId) fail('nextPhase', 'no NFL deal yet — a pending invite / tryout was expected');
        return sync(state, rng, cur(state));
      }
    }
    if (!PLAYING[stage]) fail('nextPhase', 'unknown stage ' + stage);
    if (phase === 'PRE') { Se.beginRegular(state, rng); return sync(state, rng, cur(state)); }
    if (IN_SEASON[phase]) fail('nextPhase', 'in season (week ' + state.week + ') — play the week and call endWeek');
    if (phase === 'AWARDS') { Se.offseason(state, rng); return sync(state, rng, cur(state)); }
    if (phase === 'OFF') {
      var ch = sflags(state).offseason;
      var key = state.year + ':' + (state.player.league || (state.season && state.season.league) || 'COLLEGE');
      if (!ch || ch.key !== key) { C.offseasonChain(state, rng); return sync(state, rng, cur(state)); }
      if (!ch.done) { C.resume(state, rng); return sync(state, rng, cur(state)); }
      if (state.stage !== stage) return sync(state, rng, cur(state));           // the chain moved the stage (draft / retired)
      delete sflags(state).offseason;
      Se.advanceYear(state, rng);
      return sync(state, rng, cur(state));
    }
    fail('nextPhase', 'unknown phase ' + phase);
    return null;
  };

  // ═══════════════════════════════ auto-play policies ═══════════════════════════════

  /** Attribute with the best OVR weight per XP among those below their cap (null when everything is capped). */
  function bestAttr(state, affordableOnly) {
    var P = Player(), p = state.player, W = Tuning.progression.ovrWeights, order = TA().spendOrder;
    var focus = state.season && IN_SEASON[state.phase] && state.season.trainingDone ? state.season.focus : null;
    var best = null, bestV = -1;
    for (var i = 0; i < order.length; i++) {
      var a = order[i], v = p.attrs[a];
      if (v >= Tuning.progression.attrMax || v >= num(p.pot[a], Tuning.progression.attrMax)) continue;
      var cost = P.costToRaise(a, v, p.age, focus);
      if (affordableOnly && cost > p.xp) continue;
      var val = num(W[a], 0.1) / Math.max(1, cost);
      if (val > bestV) { bestV = val; best = a; }
    }
    return best;
  }

  /** Greedy XP spend: keep buying the best OVR-per-XP point until nothing is affordable. @returns {number} points bought */
  function autoSpend(state) {
    var P = Player(), n = 0;
    if (!P || !isFn(P.spendXp)) return 0;
    for (var i = 0; i < MAX_SPEND; i++) {
      var a = bestAttr(state, true);
      if (!a) break;
      var r = P.spendXp(state.player, a, { focus: state.season && state.season.trainingDone ? state.season.focus : null });
      if (!r.ok) break;
      n++;
    }
    return n;
  }
  Engine.autoSpend = autoSpend;

  /** Weekly focus: REST when morale is low, else the attribute the greedy spend would buy next. */
  function autoFocus(state) {
    if (state.player.morale < TA().restMoraleBelow) return 'REST';
    return bestAttr(state, false) || 'ACC';
  }

  function offerScore(o) { return num(o.aav, 0) * num(o.years, 1) + (o.startsK1 ? 0.5 : 0) + (o.hometown ? 0.1 : 0); }

  /** Default option for a pending decision (§3.5.20 autoPlayOffseason defaults). */
  function autoOption(state, dec) {
    var pl = dec.payload || {}, opts = dec.options || [], A = TA(), p = state.player;
    var first = opts[0] ? opts[0].id : null;
    var best, i, o;
    switch (dec.kind) {
      case 'OFFERS_COLLEGE': case 'TRANSFER': {
        var offers = pl.offers || [];
        if (dec.kind === 'TRANSFER' && pflags(state).lostJob !== state.year && p.js >= Tuning.soft.js.benchBelow) return 'STAY';
        best = null;
        for (i = 0; i < offers.length; i++) {
          o = offers[i];
          var s = o.prestige * 10 + (o.depth === 'OPEN' ? 25 : (o.depth === 'VET' ? 8 : 0)) + (o.coach === 'WHISPERER' ? 3 : 0) + (o.nearHome ? 2 : 0) + (o.safety ? -5 : 0);
          if (!best || s > best.s) best = { id: o.id, s: s };
        }
        return best ? best.id : (dec.kind === 'TRANSFER' ? 'STAY' : first);
      }
      case 'REDSHIRT': return A.redshirtAccept ? 'REDSHIRT' : 'PLAY';
      case 'DECLARE': {
        // DEVIATION (§3.5.20 "stay in college until senior unless projected round ≤ 4"): with the §2.7.6 draftValue a
        // college kicker never projects to round ≤ 4, so that rule keeps every auto career in school for four seasons
        // and puts rookies well above the §2.13 rookie band; the default declares as soon as eligible (Tuning.career.autoplay.declare).
        var proj = pl.projection;
        if (A.declare.whenEligible) return 'DECLARE';
        return proj && num(proj.round, 9) <= A.declare.roundMax ? 'DECLARE' : 'STAY';
      }
      case 'COMBINE_PLAN': return num(pl.pMakeFar, 0) >= A.showLadderPMake ? 'SHOW' : 'SAFE';
      case 'UDFA': case 'FREE_AGENCY': {
        var list = pl.offers || [];
        best = null;
        for (i = 0; i < list.length; i++) { o = list[i]; if (!best || offerScore(o) > offerScore(best)) best = o; }
        if (best) return best.id;
        if (dec.kind === 'FREE_AGENCY') {
          var waited = num(pl.round, 1) - 1;
          if (waited < A.faWaitRounds && findOpt(dec, 'WAIT')) return 'WAIT';
          return findOpt(dec, 'SIT_OUT') ? 'SIT_OUT' : first;
        }
        return first;
      }
      case 'EXTENSION': return 'ACCEPT';
      case 'RETIRE': {
        if (pl.forced) return 'RETIRE';
        var R = A.retire, ovr = ovrOf(p.attrs), age = num(pl.age, p.age);
        if (age >= R.hardAge) return 'RETIRE';
        if (age >= R.age && ovr < R.keepOvr) return 'RETIRE';
        if (age >= R.age && !p.contract) return findOpt(dec, 'RING_CHASE') ? 'RING_CHASE' : 'RETIRE';
        return 'ONE_MORE_YEAR';
      }
      case 'TRAINING_BLOCKS': return bestAttr(state, false) || 'BANK';
      default: return first;
    }
  }
  function findOpt(dec, id) {
    for (var i = 0; i < dec.options.length; i++) if (dec.options[i].id === id) return dec.options[i];
    return null;
  }
  Engine.autoOption = autoOption;

  /** Resolve one pending thing with the default policy. @returns {Object} what was done */
  function settleOne(state, rng, opts) {
    var pd = state.pending;
    if (!pd) return null;
    if (pd.kind === 'EVENT') {
      var idx = isFn(opts.eventChoice) ? opts.eventChoice(state, pd.event) : num(opts.eventChoice, TA().eventChoice);
      var n = pd.event.choices ? pd.event.choices.length : 1;
      idx = Math.max(0, Math.min(n - 1, idx | 0));
      var ev = Engine.chooseEvent(state, rng, idx);
      return { kind: 'EVENT', id: pd.event.id, choice: idx, actions: ev.actions };
    }
    if (pd.kind === 'KICKS') {
      var sess = pd.session, guard = sess.contexts.length + 2, last = null;
      while (state.pending === pd && guard-- > 0) last = Engine.sessionKick(state, rng, null);
      return { kind: 'KICKS', session: sess.kind, outcome: last ? last.outcome : null };
    }
    var dec = pd.decision;
    var optionId = isFn(opts.decide) ? opts.decide(state, dec) : null;
    if (!optionId || !findOpt(dec, optionId)) optionId = autoOption(state, dec);
    var out = Engine.decide(state, rng, { kind: dec.kind, optionId: optionId });
    return { kind: 'DECISION', decision: dec.kind, optionId: optionId, next: out.next, result: out.result };
  }

  /** Resolve every pending thing in turn. @returns {Object[]} */
  function settle(state, rng, opts, log) {
    opts = opts || {};
    for (var i = 0; i < MAX_SETTLE && state.pending; i++) {
      var r = settleOne(state, rng, opts);
      if (log) log.push(r);
    }
    if (state.pending) fail('autoPlay', 'could not resolve the pending ' + pendingKind(state));
    return log || [];
  }
  /**
   * Resolve everything pending with the default policy (events → choice 0, kick sessions → AI kicks, decisions →
   * Engine.autoOption); opts.eventChoice (number | fn(state, event)) and opts.decide (fn(state, decision) → optionId) override it.
   * @returns {Object[]} what was resolved, in order
   */
  Engine.settlePending = function (state, rng, opts) { checkState(state, 'settlePending'); checkRng(rng, 'settlePending'); return sync(state, rng, settle(state, rng, opts, [])); };

  // ═══════════════════════════════ §3.5.20 autoPlay* ═══════════════════════════════

  /**
   * Play the user's game with auto kicks (Season.simUserGameAuto: start if needed → AI kicks → finish).
   * @returns {Object|null} GameSummary (null on a bye / already played)
   */
  Engine.autoPlayGame = function (state, rng) {
    checkState(state, 'autoPlayGame'); checkRng(rng, 'autoPlayGame');
    if (state.pending) fail('autoPlayGame', 'resolve the pending ' + pendingKind(state) + ' first');
    if (!IN_SEASON[state.phase] || !PLAYING[state.stage]) fail('autoPlayGame', 'not in season (phase ' + state.phase + ')');
    var Se = need(Season(), 'Season', 'autoPlayGame');
    if (!state.game) beforeUserGame(state);
    var summary = Se.simUserGameAuto(state, rng);
    afterUserGame(state);
    return sync(state, rng, summary);
  };

  /**
   * One week on auto (§3.5.20): pendings → (PRE → REG) → train (auto focus) → spend XP → game → endWeek → pendings.
   * @param {Object} state @param {Object} rng @param {{autoChoices?:boolean, eventChoice?:number|Function, decide?:Function}} [opts]
   * @returns {Object} WeekReport (+ decisions[])
   */
  Engine.autoPlayWeek = function (state, rng, opts) {
    checkState(state, 'autoPlayWeek'); checkRng(rng, 'autoPlayWeek');
    opts = opts || {};
    var log = settle(state, rng, opts, []);
    if (state.phase === 'PRE' && PLAYING[state.stage]) Engine.nextPhase(state, rng);
    if (!IN_SEASON[state.phase] || !PLAYING[state.stage]) fail('autoPlayWeek', 'not in season (stage ' + state.stage + ', phase ' + state.phase + ')');
    var P = Player();
    if (state.season && !state.season.trainingDone && P && isFn(P.applyTraining)) Engine.train(state, rng, autoFocus(state));
    autoSpend(state);
    var Se = need(Season(), 'Season', 'autoPlayWeek');
    var ref = Se.userGameRef(state);
    if (ref && !ref.played && !state.season.weekGameDone) Engine.autoPlayGame(state, rng);
    var report = Engine.endWeek(state, rng);
    settle(state, rng, opts, log);
    autoSpend(state);
    report.decisions = log;
    return sync(state, rng, report);
  };

  /**
   * A whole season on auto: PRE → weeks → postseason → AWARDS → OFF (stops there, with the wizard's first
   * decision pending). @returns {Object|null} the SeasonLine just written to history.seasons
   */
  Engine.autoPlaySeason = function (state, rng, opts) {
    checkState(state, 'autoPlaySeason'); checkRng(rng, 'autoPlaySeason');
    opts = opts || {};
    if (!PLAYING[state.stage]) fail('autoPlaySeason', 'not in a playing stage (' + state.stage + ')');
    settle(state, rng, opts, []);
    if (state.phase === 'PRE') Engine.nextPhase(state, rng);
    var total = (Tuning.schedule.nfl.totalWeeks + Tuning.schedule.college.totalWeeks) * 2;
    for (var i = 0; i < total && IN_SEASON[state.phase] && PLAYING[state.stage]; i++) Engine.autoPlayWeek(state, rng, opts);
    if (IN_SEASON[state.phase]) fail('autoPlaySeason', 'the season did not end (week ' + state.week + ')');
    if (state.phase === 'AWARDS') Engine.nextPhase(state, rng);
    var lines = state.history.seasons;
    return sync(state, rng, lines.length ? lines[lines.length - 1] : null);
  };

  /**
   * The offseason on auto (§3.5.20 defaults): resolves the wizard chain, the draft (combine, draft, invites, tryout)
   * and the roll-over until a new season is ready (PRE) or the career is over. @returns {{decisions:Object[], stage, phase, year}}
   */
  Engine.autoPlayOffseason = function (state, rng, opts) {
    checkState(state, 'autoPlayOffseason'); checkRng(rng, 'autoPlayOffseason');
    opts = opts || {};
    var ok = state.phase === 'OFF' || state.phase === 'AWARDS' || state.stage === 'DRAFT' || state.stage === 'RETIRED';
    if (!ok) fail('autoPlayOffseason', 'not in the offseason (stage ' + state.stage + ', phase ' + state.phase + ')');
    var log = [], guard = 400;
    while (guard-- > 0) {
      if (state.stage === 'RETIRED') { settle(state, rng, opts, log); break; }
      if (opts.untilStage && state.stage === opts.untilStage && !PLAYING[state.stage]) break;     // e.g. stop at DRAFT.DECLARE
      if (state.pending) { var r = settleOne(state, rng, opts); if (r) log.push(r); continue; }
      if (PLAYING[state.stage] && state.phase === 'PRE') break;
      var before = state.stage + '/' + state.phase + '/' + state.year;
      Engine.nextPhase(state, rng);
      if (!state.pending && state.stage + '/' + state.phase + '/' + state.year === before) fail('autoPlayOffseason', 'stuck at ' + before);
    }
    if (guard <= 0) fail('autoPlayOffseason', 'guard exceeded at ' + state.stage + '/' + state.phase);
    return sync(state, rng, { decisions: log, stage: state.stage, phase: state.phase, year: state.year });
  };

  /**
   * A whole career on auto (HS showcase → college → draft → NFL → retirement).
   * @param {Object} state @param {Object} rng @param {{untilStage?:string, maxYears?:number, eventChoice?:number|Function, decide?:Function, onSeason?:Function}} [opts]
   *   untilStage stops as soon as the stage is reached (default 'RETIRED'); maxYears caps the career years played (default Tuning.career.balance.maxYears);
   *   onSeason(state, line) runs after every completed season (tests use it for save/load round trips).
   * @returns {Object} state
   */
  Engine.autoPlayCareer = function (state, rng, opts) {
    checkState(state, 'autoPlayCareer'); checkRng(rng, 'autoPlayCareer');
    opts = opts || {};
    var until = opts.untilStage || 'RETIRED';
    var maxYears = num(opts.maxYears, Tuning.career.balance.maxYears);
    var startYear = state.year, guard = maxYears * 4 + 20;
    while (guard-- > 0) {
      if (state.stage === until) { if (until === 'RETIRED') settle(state, rng, opts, []); break; }
      if (state.stage === 'RETIRED') { settle(state, rng, opts, []); break; }
      if (state.year - startYear >= maxYears) break;
      if (state.stage === 'HS') { settle(state, rng, opts, []); continue; }
      if (PLAYING[state.stage] && (state.phase === 'PRE' || IN_SEASON[state.phase])) {
        var line = Engine.autoPlaySeason(state, rng, opts);
        if (isFn(opts.onSeason)) opts.onSeason(state, line);
        continue;
      }
      Engine.autoPlayOffseason(state, rng, opts);
    }
    return sync(state, rng, state);
  };

  RTG.Engine = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
