/**
 * Road to Glory: Kicker — narrative events, headlines and inbox (SPEC §2.10, §2.11, §3.5.14).
 *
 * RTG.Events.roll(state, rng, slot)          → EventInstance|null   sets state.pending = {kind:'EVENT', event}
 * RTG.Events.apply(state, rng, choiceIdx)    → EventOutcome {id, choiceIdx, label, effects, branches[], headline, actions[], session?}
 * RTG.Events.force(state, rng, eventId)      → EventInstance        (debug; ignores cond/once/recency)
 * RTG.Events.headline(state, rng, tag, vars) → Headline             pushes to state.headlines (cap 40) + recentHeadlineIds ring (40)
 * RTG.Events.message(state, kind, vars)      → Message              pushes to state.inbox (cap 60); no rng (deterministic hash pick)
 * RTG.Events.markRead(state, id)             → boolean
 * RTG.Events.renderText(template, state, vars) → string             {slot} replacement; never leaves a '{' behind
 * Extras (not in §3.5 but needed by the special mechanics; Career/Season may call them):
 *   RTG.Events.eligible(state, slot)         → Event[]  (data rows passing stage/phase/once/recency/cond, weight > 0)
 *   RTG.Events.weeklyTick(state, rng)        → EventInstance|null  (ultimatum / PSYCH / GURU trackers; run inside roll('week'))
 *   RTG.Events.halftimeSession(state, rng)   → KickSession|null    (HALFTIME_70: one 70-yd kick, pending KICKS)
 *   RTG.Events.resolveHalftime70(state, rng, result) → {made, effects, headline}
 *   RTG.Events.slots(state, vars)            → the slot table renderText uses
 *
 * RNG draw order (fixed, asserted by events.test.js):
 *   roll:  weeklyTick (0 draws) → fire chance (1) → weighted pick (1). Returns null after the fire draw when nothing is
 *          eligible; returns null with 0 draws when a pending already exists.
 *   apply: one rng.chance per branch, in catalog order → 1 draw for the fallback headline only when neither the choice
 *          nor the hit branch carries a headline template.
 *   headline: exactly 1 draw (rng.weighted), even for a single candidate.
 *   force / message / markRead / renderText / weeklyTick / resolveHalftime70: 0 draws.
 *
 * Flag routing (Effects.flags): keys listed in CAREER_FLAGS go to state.flags (WALKON, giveMe60, under55, ultimatum,
 * farewell, …); everything else goes to player.flags (SLUMP, sleepStudy, guilt, hiddenWind, psych, guru, …). `false`
 * deletes the flag. `agentTier` sets player.agentTier directly. Three flags start trackers: ultimatum / psych / guru.
 *
 * Relative modifier expiry ({type:'week'|'game', n}) becomes absolute here: week → state.week + n in season (or n when
 * the event fires in OFF/AWARDS, i.e. weeks of the next season); game → player.gamesPlayed + n; season → state.year
 * (+1 in the offseason). Modifiers carry source = event id so trackers can find them.
 *
 * Pure over state + rng. No DOM, no clock, no ambient randomness.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  var Events = {};

  // ───────────────────────────── late-bound deps ─────────────────────────────
  function T() { return RTG.Tuning; }
  function E() { return RTG.Tuning.events; }
  function U() { return RTG.Util; }
  function D() { return RTG.Data || {}; }
  function eventsById() { return D().eventsById || {}; }

  /** Flags that live on state.flags (career-level) instead of player.flags. */
  var CAREER_FLAGS = ['WALKON', 'UDFA', 'giveMe60', 'under55', 'ultimatum', 'farewell', 'declared', 'draftLean',
    'practiceSquad', 'faWait', 'holdoutExtension', 'tagThreat', 'postponedGame', 'cutNoOffers', 'wonTitle'];
  var SOFT_KEYS = ['morale', 'trust', 'fans', 'js'];
  var IN_SEASON = ['PRE', 'REG', 'POST'];

  /** Fallback text for slots nobody supplied (keeps templates free of stray braces). */
  var SLOT_FALLBACK = {
    name: 'the kicker', first: 'the', last: 'kicker', team: 'the team', nick: 'the team', city: 'town', school: 'the school',
    abbr: 'TM', coach: 'Coach', opp: 'the opponent', rival: 'the rival', agent: 'your agent', dist: '40', pct: '80 %',
    score: '20-17', line: '2-for-2', n: '3', award: 'the award', money: '$1.0M', years: '2', round: '4', pick: '120',
    injury: 'leg strain', title: 'the matter', choice: 'no comment', record: 'league', holder: 'the old holder',
    weather: 'clear', week: '1', year: '2026', age: '22'
  };

  function has(arr, v) { return !!arr && arr.indexOf(v) >= 0; }
  function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
  function isFn(v) { return typeof v === 'function'; }
  function inSeason(state) { return has(IN_SEASON, state.phase); }
  function pflags(state) { state.player.flags = state.player.flags || {}; return state.player.flags; }
  function sflags(state) { state.flags = state.flags || {}; return state.flags; }

  // ───────────────────────────── team lookups ─────────────────────────────

  function leagueOf(state, kind) {
    if (!state.leagues) return null;
    return kind === 'NFL' ? state.leagues.nfl : state.leagues.college;
  }
  function findIn(lg, id) {
    if (!lg || !id || !lg.teams) return null;
    var idx = lg.teamIndex && lg.teamIndex[id];
    if (typeof idx === 'number' && lg.teams[idx] && lg.teams[idx].id === id) return lg.teams[idx];
    for (var i = 0; i < lg.teams.length; i++) if (lg.teams[i].id === id) return lg.teams[i];
    return null;
  }
  /** Team by id in the player's league first, then the other one. */
  function teamById(state, id) {
    if (!id) return null;
    var mine = state.player.league || (state.stage === 'NFL' ? 'NFL' : 'COLLEGE');
    return findIn(leagueOf(state, mine), id) || findIn(leagueOf(state, mine === 'NFL' ? 'COLLEGE' : 'NFL'), id);
  }
  function userTeam(state) { return teamById(state, state.player.teamId); }
  function nextOppId(state) {
    var H = D().eventHelpers;
    if (H && isFn(H.nextOppId)) return H.nextOppId(state);
    var sched = state.season && state.season.schedule, tid = state.player.teamId;
    if (!sched || !tid) return null;
    for (var i = 0; i < sched.length; i++) {
      var g = sched[i];
      if (g.week === state.week && (g.homeId === tid || g.awayId === tid)) return g.homeId === tid ? g.awayId : g.homeId;
    }
    return null;
  }
  function gameWeather(state) {
    if (state.game && state.game.weather) return state.game.weather;
    var H = D().eventHelpers;
    return H && isFn(H.nextWeather) ? H.nextWeather(state) : null;
  }

  // ───────────────────────────── slots & rendering ─────────────────────────────

  /** Money in $M → display string via Util.fmtMoney when available. */
  function fmtMoney(m) {
    var Util = U();
    return Util && isFn(Util.fmtMoney) ? Util.fmtMoney(m) : ('$' + Math.round(m * 10) / 10 + 'M');
  }

  /**
   * The slot table for templates: state facts under the §2.11 slot names, overridden by `vars`.
   * @param {Object} state CareerState @param {Object} [vars] caller slots (numbers/strings) @returns {Object<string, string|number>}
   */
  Events.slots = function (state, vars) {
    var p = state.player || {}, name = p.name || {};
    var tm = userTeam(state), opp = teamById(state, nextOppId(state));
    var rival = tm && tm.rival ? teamById(state, tm.rival) : null;
    var Schema = RTG.Schema;
    var cal = Schema && isFn(Schema.calendarYear) ? Schema.calendarYear(state.year) : state.year;
    var s = {
      name: name.full || name.first || SLOT_FALLBACK.name, first: name.first || SLOT_FALLBACK.first, last: name.last || SLOT_FALLBACK.last,
      team: tm ? (tm.school || tm.name) : SLOT_FALLBACK.team, nick: tm ? (tm.nick || tm.name) : SLOT_FALLBACK.nick,
      city: tm ? (tm.city || SLOT_FALLBACK.city) : (p.hometown && p.hometown.city) || SLOT_FALLBACK.city,
      school: tm ? (tm.school || tm.name) : SLOT_FALLBACK.school, abbr: tm ? tm.abbr : SLOT_FALLBACK.abbr,
      coach: tm && tm.coach ? tm.coach : SLOT_FALLBACK.coach,
      opp: opp ? (opp.school || opp.name) : SLOT_FALLBACK.opp, rival: rival ? (rival.school || rival.name) : SLOT_FALLBACK.rival,
      agent: p.agentName || (p.agentTier > 0 ? SLOT_FALLBACK.agent : 'your cousin'),
      week: state.week, year: cal, age: p.age
    };
    if (state.stats && state.stats.season && state.stats.season.fga > 0) {
      s.pct = Math.round(100 * state.stats.season.fgm / state.stats.season.fga) + ' %';
    }
    if (vars) {
      for (var k in vars) if (Object.prototype.hasOwnProperty.call(vars, k) && vars[k] !== undefined && vars[k] !== null) {
        var v = vars[k];
        if (k === 'money' && typeof v === 'number') v = fmtMoney(v);
        s[k] = v;
      }
    }
    return s;
  };

  /**
   * Render a template with state facts + vars. Unknown slots fall back to SLOT_FALLBACK, then ''.
   * @param {string} template @param {Object} state @param {Object} [vars] @returns {string}
   */
  Events.renderText = function (template, state, vars) {
    var slots = Events.slots(state, vars);
    var Util = U();
    var out = Util && isFn(Util.template) ? Util.template(String(template), slots) : String(template);
    return out.replace(/\{([A-Za-z0-9_]+)\}/g, function (m, k) {
      if (Object.prototype.hasOwnProperty.call(slots, k) && slots[k] !== undefined && slots[k] !== null) return String(slots[k]);
      return Object.prototype.hasOwnProperty.call(SLOT_FALLBACK, k) ? SLOT_FALLBACK[k] : '';
    });
  };

  /** Monotonic per-career sequence for instance ids (persisted in state.flags._seq). */
  function nextSeq(state) {
    var f = sflags(state);
    f._seq = (f._seq || 0) + 1;
    return f._seq;
  }

  // ───────────────────────────── headlines ─────────────────────────────

  /** Facts a headline `cond` may test (merged under the caller's vars). */
  function headlineCtx(state, vars) {
    var p = state.player, c = p.contract;
    var w = gameWeather(state);
    var ctx = {
      league: p.league || (state.stage === 'NFL' ? 'NFL' : 'COLLEGE'), stage: state.stage, phase: state.phase,
      year: state.year, week: state.week, age: p.age, clu: p.attrs ? p.attrs.CLU : 0, fame: p.fame, fans: p.fans,
      trust: p.trust, role: p.role, nflSeasons: p.nflSeasons || 0, collegeSeasons: p.collegeSeasons || 0,
      rookie: state.stage === 'NFL' && (p.nflSeasons || 0) === 0,
      walkon: !!(state.flags && state.flags.WALKON),
      weather: w ? w.weather : undefined, windSpeed: w && w.wind ? w.wind.speed : undefined,
      doinkKing: has(p.traits, 'DOINK_KING'),
      contractYear: !!c && c.yearIdx >= c.years - 1
    };
    if (vars) for (var k in vars) if (Object.prototype.hasOwnProperty.call(vars, k)) ctx[k] = vars[k];
    return ctx;
  }

  function pushRing(arr, id, cap) {
    var i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1);
    arr.push(id);
    while (arr.length > cap) arr.shift();
  }
  function pushCapped(arr, item, cap) {
    arr.push(item);
    while (arr.length > cap) arr.shift();
  }

  /** Store a rendered headline (0 draws). */
  function storeHeadline(state, tplId, text, tag) {
    var S = T().save;
    state.headlines = state.headlines || [];
    state.recentHeadlineIds = state.recentHeadlineIds || [];
    var hl = { id: tplId + '#' + nextSeq(state), tpl: tplId, year: state.year, week: state.week, text: text, tag: tag };
    pushCapped(state.headlines, hl, S.headlinesCap);
    pushRing(state.recentHeadlineIds, tplId, S.recentHeadlineIds);
    return hl;
  }

  /** Templates for a tag whose cond passes; `fresh` excludes the recent ring. */
  function candidates(state, tag, ctx) {
    var byTag = D().headlinesByTag || {};
    var tpls = byTag[tag] || [];
    var recent = state.recentHeadlineIds || [];
    var ok = [], fresh = [];
    for (var i = 0; i < tpls.length; i++) {
      var t = tpls[i];
      if (t.cond && !t.cond(ctx)) continue;
      ok.push(t);
      if (!has(recent, t.id)) fresh.push(t);
    }
    return fresh.length ? fresh : ok;
  }

  /**
   * Pick a headline template for `tag` (weighted, cond-filtered, recent-ring excluded), render it, store it.
   * Exactly 1 rng draw. Unknown tags / empty pools fall back to a generated line (still 1 draw).
   * @param {Object} state @param {RNG} rng @param {string} tag @param {Object} [vars] slots + cond facts
   * @returns {{id:string, tpl:string, year:number, week:number, text:string, tag:string}} Headline
   */
  Events.headline = function (state, rng, tag, vars) {
    vars = vars || {};
    var ctx = headlineCtx(state, vars);
    var pool = candidates(state, tag, ctx);
    if (!pool.length) {
      pool = [{ id: 'gen:' + tag, text: vars.text || ('{last} in the news: ' + String(tag).replace(/_/g, ' ')) }];
    }
    var tpl = rng.weighted(pool, function (t) { return t.w !== undefined ? t.w : 1; });   // 1 draw
    var text = Events.renderText(tpl.text, state, vars);
    return storeHeadline(state, tpl.id, text, tag);
  };

  // ───────────────────────────── inbox ─────────────────────────────

  /**
   * Push an inbox message built from RTG.Data.messages[kind] (deterministic pick, no rng).
   * @param {Object} state @param {string} kind template kind (coach_form_sharp, agent_fa, result_win, …)
   * @param {Object} [vars] slots; vars.from / vars.kind override sender / message kind
   * @returns {{id:string, tpl:string, week:number, year:number, from:string, avatar:string, text:string, kind:string, read:boolean}}
   */
  Events.message = function (state, kind, vars) {
    vars = vars || {};
    var tpls = (D().messages || {})[kind];
    var seq = nextSeq(state);
    var tpl;
    if (tpls && tpls.length) {
      var Util = U();
      var h = Util && isFn(Util.fnv1a32) ? Util.fnv1a32(kind + '|' + state.year + '|' + state.week + '|' + seq) : seq;
      tpl = tpls[h % tpls.length];
    } else {
      tpl = { id: 'gen:' + kind, from: vars.from || 'press', text: vars.text || '' };
    }
    var from = vars.from || tpl.from || 'press';
    var msg = {
      id: 'm' + seq, tpl: tpl.id, week: state.week, year: state.year, from: from, avatar: tpl.avatar || from,
      text: Events.renderText(tpl.text, state, vars),
      kind: vars.kind || (String(kind).indexOf('result_') === 0 ? 'result' : 'note'), read: false
    };
    state.inbox = state.inbox || [];
    pushCapped(state.inbox, msg, T().save.inboxCap);
    return msg;
  };

  /**
   * Mark an inbox message read.
   * @param {Object} state @param {string} id @returns {boolean} found
   */
  Events.markRead = function (state, id) {
    var box = state.inbox || [];
    for (var i = 0; i < box.length; i++) if (box[i].id === id) { box[i].read = true; return true; }
    return false;
  };

  // ───────────────────────────── eligibility & roll ─────────────────────────────

  function firedCount(state, id) {
    var f = sflags(state).eventsFired;
    return f && f[id] ? f[id] : 0;
  }
  function weightOf(ev, state) {
    var w = isFn(ev.weight) ? ev.weight(state) : ev.weight;
    return typeof w === 'number' && w > 0 ? w : (w === undefined ? 1 : 0);
  }

  /**
   * Events that may fire now: stage/phase match, not `once`-used, not in the recent ring (12), cond(state) true, weight > 0.
   * @param {Object} state @param {'week'|'offseason'} [slot] @returns {Object[]} catalog rows
   */
  Events.eligible = function (state, slot) {
    var list = D().events || [];
    var recent = state.recentEventIds || [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var ev = list[i];
      if (ev.internal) continue;
      if (!has(ev.stage, state.stage) || !has(ev.phase, state.phase)) continue;
      if (slot === 'offseason' && state.phase !== 'OFF') continue;
      if (slot === 'week' && state.phase === 'OFF') continue;
      if (ev.once && firedCount(state, ev.id) > 0) continue;
      if (has(recent, ev.id)) continue;
      if (!ev.cond(state)) continue;
      if (weightOf(ev, state) <= 0) continue;
      out.push(ev);
    }
    return out;
  };

  /** Build the EventInstance, set pending, push the recent ring. 0 draws. */
  function instantiate(state, ev) {
    var choices = [];
    for (var i = 0; i < ev.choices.length; i++) {
      choices.push({ label: Events.renderText(ev.choices[i].label, state), preview: Events.renderText(ev.choices[i].preview || '', state) });
    }
    var inst = {
      id: ev.id, title: Events.renderText(ev.title, state), text: Events.renderText(ev.text, state), sender: ev.sender || 'press',
      choices: choices, rolledWeek: state.week, rolledYear: state.year
    };
    state.pending = { kind: 'EVENT', event: inst };
    state.recentEventIds = state.recentEventIds || [];
    pushRing(state.recentEventIds, ev.id, T().save.recentEventIds);
    return inst;
  }

  /**
   * Roll for an event. In-season p = weekProb (+ weekProbFameAdd at Star fame); offseason p = offseasonProb.
   * Draws: fire (1) + weighted pick (1). Returns null (0 draws) when a pending already exists.
   * @param {Object} state @param {RNG} rng @param {'week'|'offseason'} [slot] default from phase
   * @returns {Object|null} EventInstance
   */
  Events.roll = function (state, rng, slot) {
    slot = slot || (state.phase === 'OFF' ? 'offseason' : 'week');
    if (state.pending) return null;
    if (slot === 'week') {
      var forced = Events.weeklyTick(state, rng);
      if (forced) return forced;
    }
    var EV = E();
    var p = slot === 'offseason' ? EV.offseasonProb : EV.weekProb + (state.player.fame >= EV.weekProbFameFrom ? EV.weekProbFameAdd : 0);
    if (!rng.chance(p)) return null;                                   // draw 1: fire
    var pool = Events.eligible(state, slot);
    if (!pool.length) return null;
    var ev = rng.weighted(pool, function (e) { return weightOf(e, state); });   // draw 2: pick
    return instantiate(state, ev);
  };

  /**
   * Force an event regardless of cond/once/recency (debug, ultimatum follow-up). 0 draws.
   * @param {Object} state @param {RNG} rng unused (signature parity) @param {string} eventId @returns {Object} EventInstance
   */
  Events.force = function (state, rng, eventId) {
    var ev = eventsById()[eventId];
    if (!ev) throw new Error('Events.force: unknown event ' + eventId);
    return instantiate(state, ev);
  };

  // ───────────────────────────── effects ─────────────────────────────

  function addNum(out, k, v) { out[k] = (out[k] || 0) + v; }

  /** Absolute expiry for a relative modifier literal. */
  function absoluteExpiry(state, exp) {
    if (!exp) return { type: 'never', at: 0 };
    if (typeof exp.at === 'number') return { type: exp.type || 'never', at: exp.at };
    var n = typeof exp.n === 'number' ? exp.n : 0;
    var off = !inSeason(state);
    if (exp.type === 'week') return { type: 'week', at: (off ? 0 : state.week) + n };
    if (exp.type === 'game') return { type: 'game', at: ((state.player.gamesPlayed || (state.stats && state.stats.career && state.stats.career.games) || 0) + n) };
    if (exp.type === 'season') return { type: 'season', at: state.year + (off ? 1 : 0) };
    return { type: 'never', at: 0 };
  }

  function applyMods(state, mods, evId, out) {
    var Player = RTG.Player;
    for (var i = 0; i < mods.length; i++) {
      var m = mods[i];
      var mod = {
        id: (evId || 'event') + ':' + m.key + ':' + nextSeq(state), key: m.key, op: m.op || 'mul', value: m.value,
        expires: absoluteExpiry(state, m.expires), label: m.label || '', source: evId || 'event'
      };
      var stored = Player && isFn(Player.addMod) ? Player.addMod(state.player, mod) : (state.player.mods.push(mod), mod);
      (out.mods = out.mods || []).push(stored);
    }
  }

  function startTracker(state, k, evId) {
    var EV = E(), st = state.stats && state.stats.career;
    if (k === 'ultimatum') {
      sflags(state).ultimatum = { weeksLeft: EV.ultimatum.weeks, fga0: st ? st.fga : 0, fgm0: st ? st.fgm : 0, year: state.year, week: state.week };
    } else if (k === 'psych') {
      pflags(state).psych = { weeksLeft: EV.psych.weeks, progress: 0, granted: 0 };
    } else if (k === 'guru') {
      pflags(state).guru = { pending: true, source: evId };
    }
  }

  function applyFlags(state, flags, evId, out) {
    for (var k in flags) if (Object.prototype.hasOwnProperty.call(flags, k)) {
      var v = flags[k];
      (out.flags = out.flags || {})[k] = v;
      if (k === 'agentTier') { state.player.agentTier = clamp(Math.max(state.player.agentTier || 0, v), 0, 2); continue; }
      if (v === 'START' && (k === 'ultimatum' || k === 'psych' || k === 'guru')) { startTracker(state, k, evId); continue; }
      var target = has(CAREER_FLAGS, k) ? sflags(state) : pflags(state);
      if (v === false || v === null || v === undefined) delete target[k]; else target[k] = v;
    }
  }

  function applyAttrs(state, attrs, out) {
    var P = T().progression, p = state.player;
    for (var a in attrs) if (Object.prototype.hasOwnProperty.call(attrs, a) && p.attrs[a] !== undefined) {
      var cap = p.pot && typeof p.pot[a] === 'number' ? Math.min(P.attrMax, p.pot[a]) : P.attrMax;
      var before = p.attrs[a];
      p.attrs[a] = clamp(Math.round(before + attrs[a]), P.attrMin, Math.max(cap, Math.min(before, P.attrMax)));
      (out.attrs = out.attrs || {})[a] = (out.attrs[a] || 0) + (p.attrs[a] - before);
    }
  }

  /**
   * Apply one Effects object to the state (clamped). Accumulates what was applied into `out.effects`
   * and any `action` into `out.actions`.
   */
  function applyEffects(state, eff, evId, out) {
    if (!eff) return;
    var p = state.player, S = T().soft, F = T().soft.fame, res = out.effects;
    for (var i = 0; i < SOFT_KEYS.length; i++) {
      var k = SOFT_KEYS[i];
      if (typeof eff[k] === 'number') {
        var before = p[k];
        p[k] = clamp(before + eff[k], S.min, S.max);
        addNum(res, k, p[k] - before);
      }
    }
    if (typeof eff.fame === 'number') { var f0 = p.fame; p.fame = clamp(f0 + eff.fame, 0, F.max); addNum(res, 'fame', p.fame - f0); }
    if (typeof eff.xp === 'number') { var x0 = p.xp; p.xp = Math.max(0, Math.round(x0 + eff.xp)); addNum(res, 'xp', p.xp - x0); }
    var money = isFn(eff.money) ? eff.money(state) : eff.money;
    if (typeof money === 'number' && money !== 0) {
      state.history = state.history || {};
      var e0 = state.history.earnings || 0;
      state.history.earnings = Math.max(0, Math.round((e0 + money / 1000) * 1000) / 1000);   // $k → $M, 3 decimals
      addNum(res, 'money', money);
    }
    if (eff.attrs) applyAttrs(state, eff.attrs, res);
    if (eff.mods) applyMods(state, eff.mods, evId, res);
    if (eff.flags) applyFlags(state, eff.flags, evId, res);
    var trait = eff.trait || (eff.traits && eff.traits[0]);
    if (trait) {
      p.traits = p.traits || [];
      if (!has(p.traits, trait) && p.traits.length < T().progression.traits.max) { p.traits.push(trait); res.trait = trait; }
    }
    if (typeof eff.injury === 'number' && p.injury) {
      var w0 = p.injury.weeksLeft;
      p.injury.weeksLeft = Math.max(0, w0 + eff.injury);
      addNum(res, 'injury', p.injury.weeksLeft - w0);
      if (p.injury.weeksLeft === 0) p.injury = null;
    }
    var action = isFn(eff.action) ? eff.action(state) : eff.action;
    if (action) out.actions.push(action);
    if (eff.headline) out.headlineText = eff.headline;
  }

  /** Cap the timeline and push an entry. */
  function pushTimeline(state, entry) {
    state.history = state.history || {};
    state.history.timeline = state.history.timeline || [];
    pushCapped(state.history.timeline, entry, T().save.timelineCap);
    return entry;
  }

  function recordFired(state, id) {
    var f = sflags(state);
    f.eventsFired = f.eventsFired || {};
    f.eventsFired[id] = (f.eventsFired[id] || 0) + 1;
  }

  /**
   * Resolve the pending event with choice `choiceIdx`: effects (clamped), branches (1 draw each, in order),
   * trackers, the consequence headline (→ state.headlines + history.timeline), `once` bookkeeping, pending cleared.
   * HALFTIME70 builds a one-kick KickSession as the new pending (not returned as an action).
   * @param {Object} state @param {RNG} rng @param {number} choiceIdx
   * @returns {{id:string, choiceIdx:number, label:string, effects:Object, branches:boolean[], headline:Object, actions:string[], session?:Object}}
   */
  Events.apply = function (state, rng, choiceIdx) {
    var pd = state.pending;
    if (!pd || pd.kind !== 'EVENT' || !pd.event) throw new Error('Events.apply: no pending event');
    var ev = eventsById()[pd.event.id];
    if (!ev) throw new Error('Events.apply: unknown event ' + pd.event.id);
    var choice = ev.choices[choiceIdx];
    if (!choice) throw new RangeError('Events.apply: choice ' + choiceIdx + ' out of range for ' + ev.id);

    var out = { id: ev.id, choiceIdx: choiceIdx, label: choice.label, effects: {}, branches: [], headline: null, actions: [] };
    applyEffects(state, choice.effects, ev.id, out);
    var hlText = out.headlineText || choice.headline || null;
    var branches = choice.branches || [];
    for (var i = 0; i < branches.length; i++) {
      var b = branches[i];
      var hit = rng.chance(b.p);                                          // 1 draw per branch
      out.branches.push(hit);
      var side = hit ? b : b['else'];
      if (side) {
        applyEffects(state, side.effects, ev.id, out);
        if (side.headline) hlText = side.headline;
      }
    }
    state.pending = null;
    recordFired(state, ev.id);

    // special actions handled here
    var kept = [];
    for (var a = 0; a < out.actions.length; a++) {
      if (out.actions[a] === 'HALFTIME70') { out.session = Events.halftimeSession(state, rng); }
      else kept.push(out.actions[a]);
    }
    out.actions = kept;

    var vars = { title: pd.event.title || ev.title, choice: choice.label };
    var hl = hlText
      ? storeHeadline(state, ev.id + ':' + choiceIdx, Events.renderText(hlText, state, vars), 'event_consequence')
      : Events.headline(state, rng, 'event_consequence', vars);          // fallback: 1 draw
    var IM = E().timelineImpact;
    pushTimeline(state, {
      year: state.year, week: state.week, kind: 'EVENT', text: hl.text,
      impact: out.actions.length ? IM.action : IM.choice, teamId: state.player.teamId || null, eventId: ev.id
    });
    out.headline = hl;
    return out;
  };

  // ───────────────────────────── trackers (ultimatum / PSYCH / GURU) ─────────────────────────────

  function fixedHeadline(state, id, text) {
    return storeHeadline(state, id, Events.renderText(text, state), 'event_consequence');
  }

  function tickPsych(state) {
    var ps = pflags(state).psych;
    if (!ps || typeof ps !== 'object') return;
    var EV = E().psych, P = T().progression, p = state.player;
    ps.progress += EV.cluTotal / EV.weeks;
    ps.weeksLeft -= 1;
    var target = Math.min(EV.cluTotal, Math.floor(ps.progress + 1e-9));
    while (ps.granted < target) {
      var cap = p.pot && typeof p.pot.CLU === 'number' ? Math.min(P.attrMax, p.pot.CLU) : P.attrMax;
      if (p.attrs.CLU < cap) p.attrs.CLU += 1;
      ps.granted += 1;
    }
    if (ps.weeksLeft <= 0 || ps.granted >= EV.cluTotal) {
      pflags(state).psych = 'DONE';
      fixedHeadline(state, 'PSYCH:done', '{last} graduates from the sports psychologist; laminated card "framed"');
    }
  }

  function tickGuru(state) {
    var g = pflags(state).guru;
    if (!g || typeof g !== 'object' || !g.pending) return;
    var mods = state.player.mods || [];
    for (var i = 0; i < mods.length; i++) if (mods[i].source === (g.source || 'GURU') && mods[i].key === 'sigma') return;   // still wobbling
    var out = { effects: {}, actions: [] };
    applyAttrs(state, { ACC: E().guru.acc }, out.effects);
    pflags(state).guru = 'DONE';
    fixedHeadline(state, 'GURU:done', 'SWING CHANGE COMPLETE: {last} "better forever", per desert guru\'s invoice');
  }

  /** @returns {Object|null} forced EventInstance (college failure) */
  function tickUltimatum(state, rng) {
    var u = sflags(state).ultimatum;
    if (!u || typeof u !== 'object') return null;
    u.weeksLeft -= 1;
    if (u.weeksLeft > 0) return null;
    var EV = E().ultimatum, S = T().soft, st = state.stats && state.stats.career;
    var fga = st ? st.fga - u.fga0 : 0, fgm = st ? st.fgm - u.fgm0 : 0;
    var pct = fga > 0 ? fgm / fga : 0;
    delete sflags(state).ultimatum;
    var p = state.player;
    if (pct >= EV.fgPct) {
      p.trust = clamp(p.trust + EV.trust, S.min, S.max);
      fixedHeadline(state, 'ULTIMATUM:pass', '{coach} backs off: {last} answers ultimatum with {pct} over three weeks');
      return null;
    }
    if (state.stage === 'NFL') {
      p.js = clamp(p.js + EV.jsNfl, S.min, S.max);
      fixedHeadline(state, 'ULTIMATUM:fail', 'ULTIMATUM FAILED: {team} "actively evaluating" the kicker position after {last} falls short');
      return null;
    }
    if (state.pending || !eventsById().ULTIMATUM_FAILED) return null;
    return Events.force(state, rng, 'ULTIMATUM_FAILED');
  }

  /**
   * Weekly bookkeeping for tracker flags (idempotent per year/week): PSYCH (+CLU over 6 weeks), GURU (ACC +2 once the
   * swing-change mod has expired), COACH_ULTIMATUM (3-week FG% check → trust +20 / camp battle event / NFL js −20).
   * 0 draws. Runs at the start of roll('week'); Season may also call it directly.
   * @param {Object} state @param {RNG} rng @returns {Object|null} a forced EventInstance when the ultimatum fails in college
   */
  Events.weeklyTick = function (state, rng) {
    var key = state.year + ':' + state.week;
    var pf = pflags(state);
    if (pf.eventTick === key) return null;
    pf.eventTick = key;
    tickPsych(state);
    tickGuru(state);
    return tickUltimatum(state, rng);
  };

  // ───────────────────────────── HALFTIME_70 ─────────────────────────────

  /**
   * Build the one-kick HALFTIME70 session (70 yd, middle hash, calm, sponsor pressure) and set it pending.
   * Requires RTG.Kick.buildContext; returns null (and leaves pending null) when Kick is absent. 0 draws.
   * @param {Object} state @param {RNG} rng @returns {Object|null} KickSession
   */
  Events.halftimeSession = function (state, rng) {
    var Kick = RTG.Kick, EV = E();
    if (!Kick || !isFn(Kick.buildContext)) return null;
    var ctx = Kick.buildContext(state, null, {
      type: 'FG', distance: EV.halftime70Dist, hash: 0, isUser: true, forSession: true, calm: true,
      pressure: EV.halftime70.pressure, wind: { speed: 0, dir: 0 }
    }, rng);
    var session = { kind: 'HALFTIME70', contexts: [ctx], results: [], idx: 0 };
    state.pending = { kind: 'KICKS', session: session };
    return session;
  };

  /**
   * Apply the HALFTIME70 outcome (make: fame/fans; miss: fans/morale from Tuning.events.halftime70), push the headline
   * and timeline, clear the session pending. 0 draws.
   * @param {Object} state @param {RNG} rng unused @param {Object} result KickResult @returns {{made:boolean, effects:Object, headline:Object}}
   */
  Events.resolveHalftime70 = function (state, rng, result) {
    var H = E().halftime70, made = !!(result && result.made);
    var out = { effects: {}, actions: [] };
    applyEffects(state, made ? { fame: H.makeFame, fans: H.makeFans } : { fans: H.missFans, morale: H.missMorale }, 'HALFTIME_70', out);
    if (state.pending && state.pending.kind === 'KICKS' && state.pending.session && state.pending.session.kind === 'HALFTIME70') state.pending = null;
    var text = made
      ? 'SEVENTY. {last} drills the halftime stunt from {dist}; soda company "ecstatic", physics "reviewing"'
      : 'Halftime stunt falls short: {last} misses from {dist}, becomes a GIF, "at peace with it"';
    var hl = storeHeadline(state, 'HALFTIME_70:' + (made ? 'make' : 'miss'), Events.renderText(text, state, { dist: E().halftime70Dist }), 'event_consequence');
    pushTimeline(state, { year: state.year, week: state.week, kind: 'EVENT', text: hl.text, impact: made ? E().timelineImpact.action : E().timelineImpact.choice, teamId: state.player.teamId || null, eventId: 'HALFTIME_70' });
    return { made: made, effects: out.effects, headline: hl };
  };

  Events.CAREER_FLAGS = CAREER_FLAGS;
  RTG.Events = Events;
})(typeof window !== 'undefined' ? window : globalThis);
