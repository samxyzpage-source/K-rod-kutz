/**
 * Road to Glory: Kicker — RTG.Player (SPEC §2.1, §2.2, §3.5.7)
 *
 * Attributes, XP economy, soft stats (meters), Job Security, aging, injuries,
 * modifiers. Pure over `state`; every random draw comes from the rng passed in.
 *
 * Dependencies (load order): Util, Tuning. Nothing from later modules.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  var Util = RTG.Util, Tuning = RTG.Tuning;
  var Player = {};

  var ATTRS = ['POW', 'ACC', 'CON', 'CLU', 'KO'];
  var clamp = Util.clamp;

  // ───────────────────────────── helpers ─────────────────────────────

  /** Soft-stat clamp 0..100. */
  function soft(v) { return clamp(v, Tuning.soft.min, Tuning.soft.max); }

  /** Difficulty row (falls back to pro). */
  function diff(state) {
    var d = state && state.difficulty;
    return Tuning.difficulty[d] || Tuning.difficulty.pro;
  }

  /** The team object for the user's current team (or null). */
  function userTeam(state) {
    var p = state.player;
    if (!p || !p.teamId || !p.league) return null;
    var league = p.league === 'NFL' ? state.leagues.nfl : state.leagues.college;
    if (!league || !league.teams) return null;
    var idx = league.teamIndex && league.teamIndex[p.teamId];
    if (typeof idx === 'number' && league.teams[idx] && league.teams[idx].id === p.teamId) return league.teams[idx];
    for (var i = 0; i < league.teams.length; i++) if (league.teams[i].id === p.teamId) return league.teams[i];
    return null;
  }

  /** True when the current coach is a "kicker-whisperer" (offer coach type WHISPERER). */
  function coachIsWhisperer(state, team) {
    var p = state.player;
    if (p && p.flags && p.flags.coachStyle) return p.flags.coachStyle === 'WHISPERER';
    if (team && team.coach && typeof team.coach === 'object' && team.coach.style) return team.coach.style === 'WHISPERER';
    if (team && team.coachStyle) return team.coachStyle === 'WHISPERER';
    return false;
  }

  /** Distance bucket for meter deltas: 'lt40' | '40s' | '50'. */
  function distBucket(D) {
    return D < 40 ? 'lt40' : (D < 50 ? '40s' : '50');
  }

  function has(arr, v) { return arr.indexOf(v) >= 0; }

  // ───────────────────────────── derived numbers ─────────────────────────────

  /**
   * Overall rating: round(0.30·ACC + 0.25·POW + 0.20·CON + 0.17·CLU + 0.08·KO).
   * @param {{POW:number,ACC:number,CON:number,CLU:number,KO:number}} attrs
   * @returns {number}
   */
  Player.ovr = function (attrs) {
    var w = Tuning.progression.ovrWeights;
    return Math.round(w.ACC * attrs.ACC + w.POW * attrs.POW + w.CON * attrs.CON + w.CLU * attrs.CLU + w.KO * attrs.KO);
  };

  /**
   * Fame tier 0..4 (Unknown < 100, Local Hero, Household Name, Star, Icon 800+).
   * @param {number} fame 0..1000 @returns {number}
   */
  Player.fameTier = function (fame) {
    var tiers = Tuning.soft.fame.tiers;
    var t = 0;
    for (var i = 0; i < tiers.length; i++) if (fame >= tiers[i]) t = i + 1;
    return t;
  };

  /**
   * Fame tier display name.
   * @param {number} fame @returns {string}
   */
  Player.fameTierName = function (fame) {
    return Tuning.soft.fame.tierNames[Player.fameTier(fame)];
  };

  /**
   * XP cost age multiplier (§2.1.2): ≤22 0.85 · 23–26 1.00 · 27–30 1.20 · 31–33 1.60 · 34–36 2.40 · 37+ 3.50.
   * @param {number} age @returns {number}
   */
  Player.ageMult = function (age) {
    var rows = Tuning.progression.cost.ageMult;
    for (var i = 0; i < rows.length; i++) if (age <= rows[i].maxAge) return rows[i].mult;
    return rows[rows.length - 1].mult;
  };

  /**
   * XP cost to raise `attr` from `value` to `value + 1`.
   * cost = round((12 + 0.6·max(0, v−50) + 2.0·max(0, v−80)) · ageMult(age) · focusMult)
   * @param {string} attr
   * @param {number} value current value
   * @param {number} age
   * @param {boolean|string|null} [focus] true, or the focus attribute name (0.75 when it equals attr)
   * @returns {number}
   */
  Player.costToRaise = function (attr, value, age, focus) {
    var c = Tuning.progression.cost;
    var isFocus = focus === true || (typeof focus === 'string' && focus === attr);
    var base = c.base + c.over50 * Math.max(0, value - 50) + c.over80 * Math.max(0, value - 80);
    return Math.round(base * Player.ageMult(age) * (isFocus ? c.focusMult : 1));
  };

  /**
   * Training morale multiplier: 0.7 + 0.006·morale.
   * @param {number} morale @returns {number}
   */
  Player.moraleMult = function (morale) {
    var x = Tuning.progression.xp;
    return x.moraleMultBase + x.moraleMultPer * morale;
  };

  // ───────────────────────────── creation ─────────────────────────────

  /**
   * Create a recruit (§2.1.1). RNG draw order (fixed):
   *   1. attrs: gauss ×5 in order POW, ACC, CON, CLU, KO (10 draws)
   *   2. POT:   gauss ×5 in the same order (10 draws)
   *   3. trait: chance(0.25) (1 draw); if it fires, weighted pick (1 draw)
   * Star bonus (+4·(stars−3) attrs, POT bonus, fame start) uses opts.stars (default 3).
   * @param {RNG} rng
   * @param {{name?:{first,last,full}|string, archetype?:string, hometown?:object, look?:object, foot?:'R'|'L', stars?:number, id?:string, age?:number}} opts
   * @returns {object} Player
   */
  Player.create = function (rng, opts) {
    opts = opts || {};
    var P = Tuning.progression;
    var arch = String(opts.archetype || 'SURGEON').toUpperCase();
    if (arch === 'SOCCER_CONVERT' || arch === 'SOCCER CONVERT') arch = 'SOCCER';
    if (!P.archetypes[arch]) arch = 'SURGEON';
    var table = P.archetypes[arch];

    // 1. attributes
    var attrs = {};
    var i, a;
    for (i = 0; i < ATTRS.length; i++) {
      a = ATTRS[i];
      attrs[a] = clamp(Math.round(table[a][0] + rng.gauss(0, table[a][1])), P.creation.attrMin, P.creation.attrMax);
    }
    // 2. potential
    var pot = {};
    for (i = 0; i < ATTRS.length; i++) {
      a = ATTRS[i];
      pot[a] = clamp(Math.round(rng.gauss(P.pot.mean, P.pot.sd)), P.pot.min, P.pot.max);
    }
    // 3. trait roll
    var traits = [];
    if (rng.chance(P.traits.creationProb)) {
      var cw = P.traits.creationWeights;
      var items = Object.keys(cw).map(function (id) {
        var w = cw[id][arch] !== undefined ? cw[id][arch] : cw[id].def;
        return { id: id, w: w };
      });
      traits.push(rng.weighted(items, 'w').id);
    }

    var name = opts.name;
    if (typeof name === 'string') {
      var parts = name.trim().split(/\s+/);
      name = { first: parts[0] || 'Kicker', last: parts.slice(1).join(' ') || '', full: name.trim() };
    } else if (!name) {
      name = { first: 'Sam', last: 'Booter', full: 'Sam Booter' };
    }
    var look = opts.look || { skin: 0, hair: 0, boot: 0 };
    var hometown = opts.hometown || { city: 'Springfield', state: 'IL', region: 'MW' };

    var player = {
      id: opts.id || ('p' + Util.fnv1a(name.full + '|' + arch)),
      name: { first: name.first, last: name.last, full: name.full },
      hometown: { city: hometown.city, state: hometown.state, region: hometown.region },
      archetype: arch,
      look: { skin: look.skin | 0, hair: look.hair | 0, boot: look.boot | 0 },
      foot: opts.foot === 'L' ? 'L' : 'R',
      age: opts.age === undefined ? 18 : opts.age,
      stars: P.creation.starBase,
      attrs: attrs,
      pot: pot,
      xp: 0, xpSpent: 0, form: 0,
      morale: Tuning.soft.start.morale,
      trust: Tuning.soft.start.trust,
      fans: Tuning.soft.start.fans,
      fame: Tuning.soft.start.fameByStars[P.creation.starBase],
      js: Tuning.soft.start.jsStarter,
      traits: traits, mods: [], flags: {},
      injury: null,
      agentTier: 0, agentName: '',
      missStreak: 0, makeStreak: 0,
      role: 'K1',
      teamId: null, league: null,
      contract: null,
      nil: 0,
      redshirt: false, collegeSeasons: 0, nflSeasons: 0, seasonsAsStarter: 0,
      tags: 0,
      gamesPlayed: 0
    };
    if (opts.stars !== undefined && opts.stars !== P.creation.starBase) Player.applyStars(player, opts.stars);
    return player;
  };

  /**
   * Apply (or re-apply) the star rating bonus relative to the player's current
   * stars: attrs +4·Δstars, POT bonus per §2.1.1, fame start per §2.2.
   * Intended to be called once after the showcase (Career.finishShowcase).
   * @param {object} player @param {number} stars 2..5
   * @returns {object} player
   */
  Player.applyStars = function (player, stars) {
    var P = Tuning.progression;
    stars = clamp(Math.round(stars), Tuning.draft.stars.min, Tuning.draft.stars.max);
    var prev = player.stars || P.creation.starBase;
    var dAttr = P.creation.starPer * (stars - prev);
    var dPot = (P.pot.starBonus[stars] || 0) - (P.pot.starBonus[prev] || 0);
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      player.attrs[a] = clamp(player.attrs[a] + dAttr, P.attrMin, P.attrMax);
      player.pot[a] = clamp(player.pot[a] + dPot, P.attrMin, P.attrMax);
    }
    player.stars = stars;
    player.fame = Tuning.soft.start.fameByStars[stars] !== undefined ? Tuning.soft.start.fameByStars[stars] : player.fame;
    return player;
  };

  // ───────────────────────────── XP spending & training ─────────────────────────────

  /**
   * Spend XP to raise one attribute by 1 (respects POT and the 99 cap). No rng.
   * @param {object} player
   * @param {string} attr POW|ACC|CON|CLU|KO
   * @param {{focus?:string|boolean}} [opts] this week's training focus (25 % discount)
   * @returns {{ok:boolean, cost:number, newValue:number, reason?:string}}
   */
  Player.spendXp = function (player, attr, opts) {
    opts = opts || {};
    if (!has(ATTRS, attr)) return { ok: false, cost: 0, newValue: 0, reason: 'BAD_ATTR' };
    var v = player.attrs[attr];
    var cost = Player.costToRaise(attr, v, player.age, opts.focus);
    if (v >= Tuning.progression.attrMax) return { ok: false, cost: cost, newValue: v, reason: 'MAXED' };
    if (v >= player.pot[attr]) return { ok: false, cost: cost, newValue: v, reason: 'POT_CAP' };
    if (player.xp < cost) return { ok: false, cost: cost, newValue: v, reason: 'NO_XP' };
    player.xp -= cost;
    player.xpSpent += cost;
    player.attrs[attr] = v + 1;
    return { ok: true, cost: cost, newValue: v + 1 };
  };

  /**
   * Weekly training XP: 20 · moraleMult · coachMult · trainMult mods · difficulty xpMult.
   * @param {object} state @returns {number} rounded XP
   */
  Player.trainingXp = function (state) {
    var p = state.player;
    var x = Tuning.progression.xp;
    var team = userTeam(state);
    var coachMult = coachIsWhisperer(state, team) ? x.whispererMult : 1.0;
    var xp = x.trainingBase * Player.moraleMult(p.morale) * coachMult
      * Player.modValue(p, 'trainMult', 'mul') * diff(state).xpMult;
    return Math.round(xp);
  };

  /**
   * Apply the weekly training focus (§2.1.2). Sets season.focus/trainingDone.
   * REST: 0 XP, morale +8, flags.rested = true (injury ×0.5 next game).
   * ACC/CON focus: trust +2. Adds XP to player.xp.
   * @param {object} state @param {'POW'|'ACC'|'CON'|'CLU'|'KO'|'REST'} focus
   * @returns {{xp:number, moraleDelta:number, focus:string}}
   */
  Player.applyTraining = function (state, focus) {
    var p = state.player;
    var x = Tuning.progression.xp;
    focus = String(focus || 'REST').toUpperCase();
    if (!has(ATTRS, focus)) focus = 'REST';
    var xp = 0, moraleDelta = 0;
    if (focus === 'REST') {
      moraleDelta = x.restMorale;
      p.morale = soft(p.morale + moraleDelta);
      p.flags.rested = true;
    } else {
      xp = Player.trainingXp(state);
      p.xp += xp;
      if (focus === 'ACC' || focus === 'CON') p.trust = soft(p.trust + Tuning.soft.trust.trainingAccCon);
      p.flags.rested = false;
    }
    if (state.season) {
      state.season.focus = focus;
      state.season.trainingDone = true;
    }
    return { xp: xp, moraleDelta: moraleDelta, focus: focus };
  };

  // ───────────────────────────── weekly tick ─────────────────────────────

  /**
   * Weekly upkeep (called from Season.endWeek BEFORE week++). RNG: exactly 2 draws
   * (the form gauss). Order: form → morale drift (+guilt) → trust drift → fans drift
   * → slump flag → injury countdown (js/trust penalties while injured) → week mods expiry.
   * @param {object} state @param {RNG} rng
   * @returns {{form:number, slump:boolean, injuryCleared:boolean, expiredMods:number}}
   */
  Player.weeklyTick = function (state, rng) {
    var p = state.player;
    var S = Tuning.soft, F = Tuning.progression.form;
    // form: 0.7·form + N(0, 3.5·(1 − CON/130)), clamped ±6 — 2 draws
    p.form = clamp(F.decay * p.form + rng.gauss(0, F.sdBase * (1 - p.attrs.CON / F.sdConDiv)), -F.max, F.max);

    // morale drift toward 60 (65 with the sleep-study routine; + moraleTarget mods) by 10 %/week
    var target = (p.flags.sleepStudy ? S.drift.moraleTargetSleep : S.drift.moraleTarget) + Player.modValue(p, 'moraleTarget', 'add');
    p.morale = p.morale + (target - p.morale) * S.drift.moraleRate;
    if (p.flags.guilt > 0) { p.morale += S.morale.guiltPerWeek; p.flags.guilt -= 1; if (p.flags.guilt <= 0) delete p.flags.guilt; }
    p.morale = soft(Util.round1(p.morale));

    // trust toward 50 by 1/week
    if (p.trust > S.drift.trustTarget) p.trust = Math.max(S.drift.trustTarget, p.trust - S.drift.trustStep);
    else if (p.trust < S.drift.trustTarget) p.trust = Math.min(S.drift.trustTarget, p.trust + S.drift.trustStep);

    // fans toward team win % · 100 by 10 %/week
    var wp = teamWinPct(state);
    if (wp !== null) p.fans = soft(Util.round1(p.fans + (wp * 100 - p.fans) * S.drift.fansRate));

    // slump: morale < 30 for 3 consecutive weeks → SLUMP (σ ×1.12) until morale ≥ 45
    if (p.morale < S.morale.slumpBelow) p.flags.lowMoraleWeeks = (p.flags.lowMoraleWeeks || 0) + 1;
    else delete p.flags.lowMoraleWeeks;
    if ((p.flags.lowMoraleWeeks || 0) >= S.morale.slumpWeeks) p.flags.SLUMP = true;
    if (p.flags.SLUMP && p.morale >= S.morale.slumpClearAt) delete p.flags.SLUMP;

    // injury countdown
    var injuryCleared = false;
    if (p.injury) {
      var I = Tuning.progression.injury;
      p.js = soft(p.js + I.jsPerWeek);
      p.trust = soft(p.trust + I.trustPerWeek);
      p.injury.weeksLeft -= 1;
      if (p.injury.weeksLeft <= 0) { p.injury = null; injuryCleared = true; }
    }

    // week-scoped modifiers
    var before = p.mods.length;
    Player.expireMods(p, { type: 'week', at: state.week });
    return { form: p.form, slump: !!p.flags.SLUMP, injuryCleared: injuryCleared, expiredMods: before - p.mods.length };
  };

  /** Current team win percentage from season.results (null if no games). */
  function teamWinPct(state) {
    var p = state.player;
    var season = state.season;
    if (!p.teamId || !season || !season.results || !season.results[p.teamId]) return null;
    var r = season.results[p.teamId];
    var g = (r.w || 0) + (r.l || 0) + (r.t || 0);
    if (!g) return null;
    return ((r.w || 0) + 0.5 * (r.t || 0)) / g;
  }

  // ───────────────────────────── job security ─────────────────────────────

  /**
   * Aggregate a game's user kicks into the JS delta inputs.
   * Accepts a GameSummary with `.kicks` (KickLogRow[]), or one already shaped as
   * {makes, missesLt40, misses40s, misses50, decisiveMakes, decisiveMisses, blocked},
   * or a bare `.userLine` {fga, fgm} (misses land in the 40–49 bucket).
   * @param {object|null} summary @returns {object} counts
   */
  Player.kickCounts = function (summary) {
    var c = { makes: 0, missesLt40: 0, misses40s: 0, misses50: 0, decisiveMakes: 0, decisiveMisses: 0, blocked: 0 };
    if (!summary) return c;
    if (typeof summary.makes === 'number') {
      for (var k in c) if (typeof summary[k] === 'number') c[k] = summary[k];
      return c;
    }
    var kicks = summary.kicks;
    if (Array.isArray(kicks) && kicks.length) {
      for (var i = 0; i < kicks.length; i++) {
        var r = kicks[i];
        if (r.type !== 'FG' && r.type !== undefined) continue;   // PATs do not move Job Security
        var tags = r.tags || [];
        var decisive = !!r.decisive || has(tags, 'decisive');
        if (r.made) { c.makes++; if (decisive) c.decisiveMakes++; continue; }
        if (r.outcome === 'BLOCKED') { c.blocked++; if (decisive) c.decisiveMisses++; continue; }
        var b = distBucket(r.distance);
        if (b === 'lt40') c.missesLt40++; else if (b === '40s') c.misses40s++; else c.misses50++;
        if (decisive) c.decisiveMisses++;
      }
      return c;
    }
    var line = summary.userLine || summary;
    if (typeof line.fgm === 'number') {
      c.makes = line.fgm;
      c.misses40s = Math.max(0, (line.fga || 0) - line.fgm);
      if (line.gw) c.decisiveMakes = 1;
    }
    return c;
  };

  /** OVR of the user's rival kicker (the team's other leg) or null. */
  Player.rivalOvr = function (state) {
    var p = state.player;
    var team = userTeam(state);
    if (!team) return null;
    var rival = null;
    if (p.role === 'K1') rival = team.kicker2 || team.kicker || null;
    else rival = team.kicker || team.kicker2 || null;
    if (!rival) return null;
    if (typeof rival.ovr === 'number') return rival.ovr;
    if (rival.attrs) return Player.ovr(rival.attrs);
    return null;
  };

  /**
   * Weekly Job Security update (§2.2). Called from Season.endWeek for the user.
   *   js += 2·makes − 6·miss<40 − 3·miss40s − 1·miss50 + 8·decisiveMakes − 10·decisiveMisses − 4·blocked
   *   js  = 0.9·js + 0.1·clamp(50 + 5·(myOVR − rivalOVR), 0, 100)
   *   js  = clamp(max(js, trust/5), 0, 100)
   * Negative deltas × difficulty.jsNegMult. Tracks flags.jsLowWeeks (< 10) and
   * flags.benched; benches at js < 25 (role K2) and restores K1 at js ≥ 40.
   * @param {object} state @param {object|null} gameSummary (null on a bye)
   * @returns {{js:number, benched:boolean, cutWarning:boolean, delta:number, lowWeeks:number}}
   */
  Player.updateJobSecurity = function (state, gameSummary) {
    var p = state.player;
    var J = Tuning.soft.js;
    var neg = diff(state).jsNegMult;
    var c = Player.kickCounts(gameSummary);
    var pos = J.make * c.makes + J.decisiveMake * c.decisiveMakes;
    var negSum = J.missLt40 * c.missesLt40 + J.miss40s * c.misses40s + J.miss50 * c.misses50
      + J.decisiveMiss * c.decisiveMisses + J.blocked * c.blocked;
    var before = p.js;
    var js = p.js + pos + negSum * neg;

    var myOvr = Player.ovr(p.attrs);
    var rival = Player.rivalOvr(state);
    if (rival === null) rival = myOvr - J.defaultRivalGap;
    var gap = clamp(J.gapBase + J.gapPer * (myOvr - rival), Tuning.soft.min, Tuning.soft.max);
    js = J.keep * js + J.gapWeight * gap;
    js = clamp(Math.max(js, p.trust / J.floorTrustDiv), Tuning.soft.min, Tuning.soft.max);
    p.js = Util.round1(js);

    // bench / restore
    var benched = false;
    if (p.js < J.benchBelow && p.role === 'K1') {
      p.role = 'K2';
      p.flags.benched = true;
      benched = true;
    } else if (p.flags.benched && p.role === 'K2' && p.js >= J.regainAt) {
      p.role = 'K1';
      delete p.flags.benched;
    }
    // cut warning: js < 10 for 3 consecutive weeks
    if (p.js < J.cutBelow) p.flags.jsLowWeeks = (p.flags.jsLowWeeks || 0) + 1;
    else delete p.flags.jsLowWeeks;
    var lowWeeks = p.flags.jsLowWeeks || 0;
    return { js: p.js, benched: benched || p.role === 'K2' && !!p.flags.benched, cutWarning: lowWeeks >= J.cutWeeks, delta: Util.round1(p.js - before), lowWeeks: lowWeeks };
  };

  // ───────────────────────────── per-kick meters ─────────────────────────────

  /**
   * Fame market multiplier for the user's team: college 1 + 0.15·(prestige − 3);
   * NFL 1.2 for big markets else 1. ctx.marketMult overrides.
   * @param {object} state @param {object} [ctx] @returns {number}
   */
  Player.marketMult = function (state, ctx) {
    if (ctx && typeof ctx.marketMult === 'number') return ctx.marketMult;
    var F = Tuning.soft.fame;
    var team = userTeam(state);
    if (!team) return 1;
    if (state.player.league === 'COLLEGE') return 1 + F.collegePrestigePer * ((team.prestige || F.prestigeAnchor) - F.prestigeAnchor);
    return team.bigMarket ? F.bigMarketMult : 1;
  };

  /**
   * Apply trust / fans / morale / fame deltas for ONE kick (§2.2). Job Security is
   * updated weekly by updateJobSecurity, so js is always 0 here.
   * Interpretation: base make/miss deltas apply to FG only (a PAT is neutral when made
   * and counts as a <40 miss when missed); decisive/clutch/doink/50+ bonuses apply to any type.
   * Fame per make = D/10 · marketMult (FG only), decisive +40, 50+ make +10.
   * @param {object} state @param {object} ctx KickContext @param {object} result KickResult
   * @returns {{trust:number, fans:number, morale:number, fame:number, js:number}}
   */
  Player.applyKickMeters = function (state, ctx, result) {
    var p = state.player;
    var S = Tuning.soft;
    var D = ctx.distance;
    var isFg = ctx.type !== 'PAT';
    var tags = result.tags || [];
    var decisive = !!ctx.decisive || has(tags, 'decisive');
    var clutch = has(tags, 'clutch') || (ctx.pressure !== undefined && ctx.pressure >= Tuning.kick.pressure.clutchThreshold);
    var d = { trust: 0, fans: 0, morale: 0, fame: 0, js: 0 };

    if (result.made) {
      if (isFg) {
        d.trust += D >= 50 ? S.trust.make50 : S.trust.make;
        d.fans += S.fans.make;
        d.fame += D / S.fame.perMakeDiv * Player.marketMult(state, ctx);
        if (D >= 50) d.fame += S.fame.fifty;
      }
      if (decisive) { d.trust += S.trust.decisiveMake; d.fans += S.fans.decisiveMake; d.fame += S.fame.decisiveMake; }
      if (clutch) d.morale += S.morale.clutchMake;
      if (result.outcome === 'DOINK_IN' || result.outcome === 'XBAR_IN') {
        d.fans += S.fans.doinkIn;
        if (has(p.traits, 'DOINK_KING')) d.fans += Tuning.progression.traits.doinkKingFans;
      }
      var streak = (p.makeStreak || 0) + 1;    // Stats increments makeStreak after this; count this make
      if (streak >= S.morale.streakFrom) d.morale += S.morale.streakBonus;
    } else {
      if (result.outcome === 'BLOCKED') d.trust += S.trust.blocked;
      else {
        var b = distBucket(isFg ? D : 0);
        d.trust += b === 'lt40' ? S.trust.missLt40 : (b === '40s' ? S.trust.miss40s : S.trust.miss50);
      }
      d.fans += S.fans.miss;
      if (decisive) { d.trust += S.trust.decisiveMiss; d.fans += S.fans.decisiveMiss; }
      if (clutch) d.morale += S.morale.clutchMiss;
    }

    p.trust = soft(p.trust + d.trust);
    p.fans = soft(p.fans + d.fans);
    p.morale = soft(p.morale + d.morale);
    d.fame = Util.round1(d.fame);
    p.fame = clamp(Util.round1(p.fame + d.fame), 0, S.fame.max);
    return d;
  };

  /**
   * Team result deltas after a game: morale +3/−2, fans +2 on a win (§2.2).
   * @param {object} state @param {boolean} won @param {boolean} [tied]
   * @returns {{morale:number, fans:number}}
   */
  Player.applyGameResultMeters = function (state, won, tied) {
    var p = state.player, S = Tuning.soft;
    var d = { morale: 0, fans: 0 };
    if (tied) return d;
    d.morale = won ? S.morale.teamWin : S.morale.teamLoss;
    d.fans = won ? S.fans.teamWin : 0;
    p.morale = soft(p.morale + d.morale);
    p.fans = soft(p.fans + d.fans);
    return d;
  };

  // ───────────────────────────── aging ─────────────────────────────

  /**
   * Offseason growth & decline (§2.1.3). Call AFTER age += 1.
   * RNG: 2 draws (rng.pick ×2, distinct attributes) only when the growth window applies.
   *   age ≤ 24 (26 with LATE_BLOOMER): +1 to two distinct random attributes, capped by POT
   *   declineStart = 33 (+2 with LEGS_OF_STEEL)
   *   age ≥ declineStart:   POW −(age < 35 ? 1 : age < 37 ? 2 : 3)
   *   age ≥ declineStart+2: CON −1 ; age ≥ declineStart+4: ACC −1
   *   age ≥ 32:             KO −(age < 35 ? 1 : 2) ; CLU never declines
   * WHISPERER coach: ACC +1 (capped by POT).
   * @param {object} state @param {RNG} rng
   * @returns {{attr:string, delta:number, text:string}[]}
   */
  Player.ageTick = function (state, rng) {
    var p = state.player;
    var A = Tuning.progression.aging;
    var log = [];
    var age = p.age;
    var growthMax = A.growthMaxAge + (has(p.traits, 'LATE_BLOOMER') ? Tuning.progression.traits.lateBloomerYears : 0);
    var declineStart = A.declineStart + (has(p.traits, 'LEGS_OF_STEEL') ? Tuning.progression.traits.legsOfSteelYears : 0);

    function bump(attr, delta, text) {
      var v = p.attrs[attr];
      var nv = clamp(v + delta, Tuning.progression.attrMin, Math.max(Tuning.progression.attrMin, delta > 0 ? p.pot[attr] : Tuning.progression.attrMax));
      if (nv === v) return;
      p.attrs[attr] = nv;
      log.push({ attr: attr, delta: nv - v, text: text });
    }

    if (age <= growthMax) {
      var pool = ATTRS.slice();
      var first = rng.pick(pool);                                   // draw 1
      pool.splice(pool.indexOf(first), 1);
      var second = rng.pick(pool);                                  // draw 2
      bump(first, A.growthDelta, 'Another year in the weight room: ' + first + ' +1');
      bump(second, A.growthDelta, 'Another year in the weight room: ' + second + ' +1');
    }
    if (age >= declineStart) {
      var dPow = age < 35 ? A.powDecline.below35 : (age < 37 ? A.powDecline.below37 : A.powDecline.else);
      bump('POW', -dPow, 'Your leg lost a step this winter (POW −' + dPow + ')');
    }
    if (age >= declineStart + A.conOffsetYears) bump('CON', -A.conDelta, 'The swing is a little less repeatable (CON −1)');
    if (age >= declineStart + A.accOffsetYears) bump('ACC', -A.accDelta, 'The fine aim is going (ACC −1)');
    if (age >= A.koFrom) {
      var dKo = age < 35 ? A.koDecline.below35 : A.koDecline.else;
      bump('KO', -dKo, 'Kickoffs are not what they were (KO −' + dKo + ')');
    }
    if (coachIsWhisperer(state, userTeam(state))) bump('ACC', A.whispererAcc, 'The kicker-whisperer tuned your plant foot (ACC +1)');
    return log;
  };

  // ───────────────────────────── injuries ─────────────────────────────

  /**
   * Per-game injury probability for the user (§2.1.4):
   * 0.012 · (rested ? 0.5 : 1) · (age ≥ 32 ? 1.5 : 1) · Π mods[injury, mul].
   * @param {object} state @returns {number}
   */
  Player.injuryProb = function (state) {
    var p = state.player, I = Tuning.progression.injury;
    return I.pPerGame * (p.flags.rested ? I.restMult : 1) * (p.age >= I.ageFrom ? I.ageMult : 1)
      * Player.modValue(p, 'injury', 'mul');
  };

  /**
   * Career-threatening injury probability by difficulty (§2.4 table): off / age ≥ 34 only / on.
   * @param {object} state @returns {number}
   */
  Player.careerThreatProb = function (state) {
    var mode = diff(state).careerInjury;
    var I = Tuning.progression.injury.careerThreat;
    if (mode === 'on') return I.p;
    if (mode === 'age34' && state.player.age >= I.ageFrom) return I.p;
    return 0;
  };

  /**
   * Roll for an injury after a game. RNG: 1 draw when healthy, 2 when injured.
   *   draw 1: u < pCareer → career-threatening; u < pCareer + pInjury → regular
   *   draw 2: one float selects the type (thirds) and the weeks inside the type's range
   * Sets player.injury; career-threatening also applies POW −3 permanently and flags.comebackArc.
   * Clears flags.rested.
   * @param {object} state @param {RNG} rng
   * @returns {{type:string, label:string, weeksLeft:number, careerThreat:boolean}|null}
   */
  Player.rollInjury = function (state, rng) {
    var p = state.player, I = Tuning.progression.injury;
    if (p.injury) return null;
    var pCareer = Player.careerThreatProb(state);
    var pInjury = Player.injuryProb(state);
    var u = rng.next();                                               // draw 1
    delete p.flags.rested;
    if (u >= pCareer + pInjury) return null;
    var v = rng.next();                                               // draw 2
    var inj;
    if (u < pCareer) {
      var ct = I.careerThreat;
      inj = { type: 'CAREER_THREAT', label: ct.label, weeksLeft: ct.weeks[0] + Math.floor(v * (ct.weeks[1] - ct.weeks[0] + 1)), careerThreat: true };
      p.attrs.POW = clamp(p.attrs.POW - ct.powLoss, Tuning.progression.attrMin, Tuning.progression.attrMax);
      p.flags.comebackArc = true;
    } else {
      var n = I.types.length;
      var idx = Math.min(n - 1, Math.floor(v * n));
      var t = I.types[idx];
      var frac = v * n - idx;
      inj = { type: t.type, label: t.label, weeksLeft: t.weeks[0] + Math.floor(frac * (t.weeks[1] - t.weeks[0] + 1)), careerThreat: false };
    }
    p.injury = inj;
    return inj;
  };

  // ───────────────────────────── modifiers ─────────────────────────────

  /**
   * Append a Modifier {id, key, op, value, expires:{type, at}, label, source}. Missing
   * fields get defaults (id from key+label, expires never). Returns the stored mod.
   * @param {object} player @param {object} mod @returns {object}
   */
  Player.addMod = function (player, mod) {
    var m = {
      id: mod.id || (mod.key + ':' + (mod.label || mod.source || player.mods.length)),
      key: mod.key,
      op: mod.op === 'add' ? 'add' : 'mul',
      value: typeof mod.value === 'number' ? mod.value : (mod.op === 'add' ? 0 : 1),
      expires: mod.expires ? { type: mod.expires.type || 'never', at: typeof mod.expires.at === 'number' ? mod.expires.at : 0 } : { type: 'never', at: 0 },
      label: mod.label || '',
      source: mod.source || ''
    };
    player.mods.push(m);
    return m;
  };

  /**
   * Remove mods whose expires.type matches and (when `at` is given) expires.at ≤ at.
   * Returns the removed mods.
   * @param {object} player @param {{type:'week'|'game'|'season'|'never', at?:number}} when
   * @returns {object[]}
   */
  Player.expireMods = function (player, when) {
    var keep = [], gone = [];
    for (var i = 0; i < player.mods.length; i++) {
      var m = player.mods[i];
      var e = m.expires || { type: 'never' };
      var hit = e.type === when.type && (when.at === undefined || e.at === undefined || e.at <= when.at);
      (hit ? gone : keep).push(m);
    }
    if (gone.length) player.mods = keep;
    return gone;
  };

  /**
   * Combined modifier value for a key: product of 'mul' values (identity 1) or
   * sum of 'add' values (identity 0).
   * @param {object} player @param {string} key @param {'mul'|'add'} op @returns {number}
   */
  Player.modValue = function (player, key, op) {
    var v = op === 'add' ? 0 : 1;
    var mods = player && player.mods;
    if (!mods) return v;
    for (var i = 0; i < mods.length; i++) {
      var m = mods[i];
      if (m.key !== key || m.op !== op) continue;
      if (op === 'add') v += m.value; else v *= m.value;
    }
    return v;
  };

  /**
   * Attributes with Form applied to ACC (ACC_eff = clamp(ACC + form, 1, 99)); mods are NOT applied.
   * @param {object} player @returns {{POW:number,ACC:number,CON:number,CLU:number,KO:number}}
   */
  Player.effectiveAttrs = function (player) {
    var a = player.attrs;
    return {
      POW: a.POW,
      ACC: clamp(a.ACC + (player.form || 0), Tuning.progression.attrMin, Tuning.progression.attrMax),
      CON: a.CON, CLU: a.CLU, KO: a.KO
    };
  };

  /**
   * Coach text for the current form (§2.1.1) or '' when unremarkable.
   * @param {object} player @returns {string}
   */
  Player.formText = function (player) {
    var F = Tuning.progression.form;
    if (player.form >= F.sharpAt) return "You've looked sharp in practice";
    if (player.form <= F.watchAt) return 'Coach is watching your plant foot';
    return '';
  };

  Player.ATTRS = ATTRS;
  RTG.Player = Player;
})(typeof window !== 'undefined' ? window : globalThis);
