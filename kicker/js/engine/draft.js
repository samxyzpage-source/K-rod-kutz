/**
 * Road to Glory: Kicker — RTG.Draft (SPEC §2.7.5, §2.7.6, §3.5.16)
 *
 * Combine sessions (range ladder, accuracy set, kickoff hang), combine scoring,
 * draft value / projection, the draft itself (team by need in draft order, a
 * ticker of fictional picks) and the undrafted minicamp tryout. Pure over
 * `state`; later modules (Kick, Names, Standings, Contracts, Schema) resolve AT
 * CALL TIME.
 *
 * Draw accounting:
 *   combineSession / tryout : 0 (hashes are explicit and the sessions are calm)
 *   run (drafted)           : shock chance 1 · alt-round chance 1 (86–91 band only) · shock pick int 1 | slot jitter int 1
 *                             · ticker: per fictional pick Names.player (3–4) + position weighted 1
 *   run (UDFA band)         : Contracts.generateOffers(…, 'UDFA') draws
 *   run (undrafted)         : 0
 *
 * Round numbering in projections: 1–7 are draft rounds, 8 = UDFA camp invites, 9 = undrafted (tryout).
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  var Util = RTG.Util, Tuning = RTG.Tuning;
  var Draft = {};

  var clamp = Util.clamp;
  var ROUND_UDFA = 8, ROUND_UNDRAFTED = 9, PCT = 100;
  var LADDER = 'LADDER', ACC = 'ACC', KO = 'KO';

  // ───────────────────────────── helpers ─────────────────────────────

  /** Tuning.draft (read at call time). */
  function D() { return Tuning.draft; }

  /** The NFL league object. */
  function nfl(state) { return state.leagues ? state.leagues.nfl : null; }

  /** Team lookup in a league. */
  function teamIn(league, id) {
    if (!league) return null;
    if (RTG.Schema && typeof RTG.Schema.teamIn === 'function') return RTG.Schema.teamIn(league, id);
    for (var i = 0; i < league.teams.length; i++) if (league.teams[i].id === id) return league.teams[i];
    return null;
  }

  /** The player's college team: current team while in college, else the last college stint. */
  function collegeTeam(state) {
    var p = state.player;
    var L = state.leagues ? state.leagues.college : null;
    if (p.league === 'COLLEGE' && p.teamId) return teamIn(L, p.teamId);
    var stints = state.history.teams || [];
    for (var i = stints.length - 1; i >= 0; i--) if (stints[i].league === 'COLLEGE') return teamIn(L, stints[i].teamId);
    return p.teamId ? teamIn(L, p.teamId) : null;
  }

  /** College FG% (career college block, else career, else the anchor → 0 contribution). */
  function collegeFgPct(state) {
    var V = D().value;
    var st = state.stats || {};
    var b = st.college && st.college.fga > 0 ? st.college : (st.career && st.career.fga > 0 ? st.career : null);
    return b ? b.fgm / b.fga : V.fgAnchor / PCT;
  }

  /** A calm, for-session KickContext for the user (0 draws: explicit hash, calm). */
  function sessionCtx(state, sit) {
    var s = Object.assign({ isUser: true, forSession: true, calm: true, league: 'NFL' }, sit);
    return RTG.Kick.buildContext(state, null, s);
  }

  /** Did a result count as a make (missing result → not attempted)? */
  function made(r) { return !!(r && r.made); }

  /** Team "needy" rule (§2.7.6), via Contracts when loaded. */
  function needy(team) {
    var Contracts = RTG.Contracts;
    if (Contracts && typeof Contracts.teamsNeedingK === 'function') return Contracts.teamsNeedingK({ teams: [team] }).length === 1;
    var N = Tuning.contracts.need, k = team.kicker;
    return !k || k.age >= N.ageFrom || k.ovr < N.ovrBelow || k.contractYears <= N.yearsLeftMax;
  }

  // ───────────────────────────── §2.7.5 combine ─────────────────────────────

  /**
   * The combine as one KickSession (kind 'COMBINE_LADDER') holding all three mini-events in order — range
   * ladder 45/50/55/60/65 (plan 'SAFE' stops at 55), accuracy set 5 × 40 yd from alternating hashes, one
   * kickoff — with `parts` {ladder, acc, ko} index lists and `plan`. Each context carries `combine`
   * ('LADDER'|'ACC'|'KO') and `label`. Pass opts.part ('LADDER'|'ACC'|'KO') for a single-part session
   * (kinds COMBINE_LADDER / COMBINE_ACC / COMBINE_KO). Plan: opts.plan, else state.flags.combinePlan, else 'SHOW'.
   * Draws: 0.
   * @param {Object} state @param {RNG} rng (unused; kept for the §3.5.16 signature) @param {{part?:string, plan?:'SAFE'|'SHOW'}} [opts]
   * @returns {Object} KickSession
   */
  Draft.combineSession = function (state, rng, opts) {
    void rng;
    opts = opts || {};
    var CB = D().combine;
    var plan = opts.plan || (state.flags && state.flags.combinePlan) || 'SHOW';
    var part = opts.part || null;
    var contexts = [], parts = { ladder: [], acc: [], ko: [] };
    var i, ctx;
    if (!part || part === LADDER) {
      for (i = 0; i < CB.ladder.length; i++) {
        if (plan === 'SAFE' && CB.ladder[i] > CB.safeStop) break;
        ctx = sessionCtx(state, { type: 'FG', distance: CB.ladder[i], hash: 0, pressure: CB.pressure });
        ctx.combine = LADDER; ctx.label = 'Ladder ' + CB.ladder[i];
        parts.ladder.push(contexts.length); contexts.push(ctx);
      }
    }
    if (!part || part === ACC) {
      for (i = 0; i < CB.accKicks; i++) {
        ctx = sessionCtx(state, { type: 'FG', distance: CB.accDist, hash: i % 2 === 0 ? -1 : 1, pressure: CB.pressure });
        ctx.combine = ACC; ctx.label = 'Accuracy ' + (i + 1) + '/' + CB.accKicks;
        parts.acc.push(contexts.length); contexts.push(ctx);
      }
    }
    if (!part || part === KO) {
      ctx = sessionCtx(state, { type: 'KO', pressure: CB.pressure });
      ctx.combine = KO; ctx.label = 'Kickoff hang';
      parts.ko.push(contexts.length); contexts.push(ctx);
    }
    var kind = part === ACC ? 'COMBINE_ACC' : (part === KO ? 'COMBINE_KO' : 'COMBINE_LADDER');
    return { kind: kind, contexts: contexts, results: [], idx: 0, plan: plan, parts: parts, stopOnMiss: parts.ladder.slice() };
  };

  /**
   * Next context index to play in a combine session, honouring "ladder until a miss": after a ladder miss the
   * remaining ladder rungs are skipped. −1 when the session is complete.
   * @param {Object} session @returns {number}
   */
  Draft.combineNextIdx = function (session) {
    var n = session.contexts.length;
    var stop = session.stopOnMiss || [];
    var i = session.results.length;
    while (i < n) {
      var ctx = session.contexts[i];
      var skip = false;
      if (ctx.combine === LADDER && stop.indexOf(i) >= 0) {
        for (var j = 0; j < i; j++) if (stop.indexOf(j) >= 0 && session.results[j] && !session.results[j].made) { skip = true; break; }
      }
      if (!skip) return i;
      session.results.push(null);            // skipped rung: not attempted
      i++;
    }
    return -1;
  };

  /** Merge one or many sessions into a flat list of {ctx, result} pairs tagged by part. */
  function combinePairs(sessionOrList) {
    var list = Array.isArray(sessionOrList) ? sessionOrList : [sessionOrList];
    var pairs = [];
    for (var s = 0; s < list.length; s++) {
      var ses = list[s];
      if (!ses || !ses.contexts) continue;
      var kindPart = ses.kind === 'COMBINE_ACC' ? ACC : (ses.kind === 'COMBINE_KO' ? KO : LADDER);
      for (var i = 0; i < ses.contexts.length; i++) {
        var ctx = ses.contexts[i];
        pairs.push({ part: ctx.combine || kindPart, ctx: ctx, result: ses.results ? ses.results[i] : null });
      }
    }
    return pairs;
  }

  /**
   * Combine breakdown: ladderMakes (consecutive makes from the first rung), accMakes, hang (s; the KO
   * result's `hang`, anchor 3.9 when not kicked) and the clamped score.
   * @param {Object|Object[]} session combine session (or a list of part sessions) @returns {{ladderMakes:number, accMakes:number, hang:number, score:number}}
   */
  Draft.combineBreakdown = function (session) {
    var CB = D().combine;
    var pairs = combinePairs(session);
    var ladderMakes = 0, ladderDone = false, accMakes = 0, hang = CB.hangAnchor;
    for (var i = 0; i < pairs.length; i++) {
      var p = pairs[i];
      if (p.part === LADDER) {
        if (!ladderDone && made(p.result)) ladderMakes++; else ladderDone = true;
      } else if (p.part === ACC) {
        if (made(p.result)) accMakes++;
      } else if (p.part === KO && p.result && typeof p.result.hang === 'number') {
        hang = p.result.hang;
      }
    }
    var raw = (ladderMakes - CB.ladderAnchor) * CB.perMake + (accMakes - CB.accAnchor) * CB.perMake + (hang - CB.hangAnchor) * CB.hangW;
    return { ladderMakes: ladderMakes, accMakes: accMakes, hang: hang, score: Util.roundN(clamp(raw, -CB.clamp, CB.clamp), 2) };
  };

  /**
   * combineScore = (ladderMakes − 3)·2 + (accMakes − 3)·2 + (hang − 3.9)·5, clamped to ±8 (§2.7.5).
   * @param {Object|Object[]} session @returns {number}
   */
  Draft.scoreCombine = function (session) {
    return Draft.combineBreakdown(session).score;
  };

  // ───────────────────────────── §2.7.6 value & projection ─────────────────────────────

  /**
   * draftValue = 0.55·OVR + 0.15·POW + 0.10·CLU + 0.10·fameTier·5 + 0.10·(collegeFG%·100 − 70) + combineScore
   *              + prestigeBump − 4·(WALKON && OVR < 70). combineScore from state.flags.combineScore (0 until played);
   *              prestigeBump = 2·(collegePrestige − 3).
   * @param {Object} state @returns {number} (2 decimals)
   */
  Draft.draftValue = function (state) {
    var V = D().value, O = D().offers;
    var p = state.player;
    var Player = RTG.Player;
    var ovr = Player.ovr(p.attrs);
    var team = collegeTeam(state);
    var prestige = team && typeof team.prestige === 'number' ? team.prestige : O.prestigeAnchor;
    var combine = state.flags && typeof state.flags.combineScore === 'number' ? state.flags.combineScore : 0;
    var walkon = !!((p.flags && p.flags.WALKON) || (state.flags && state.flags.WALKON));
    var v = V.ovrW * ovr + V.powW * p.attrs.POW + V.cluW * p.attrs.CLU
      + V.fameW * Player.fameTier(p.fame) * V.fameTierMult
      + V.fgW * (collegeFgPct(state) * PCT - V.fgAnchor)
      + combine
      + O.prestigeBumpPer * (prestige - O.prestigeAnchor)
      - (walkon && ovr < V.walkonOvrBelow ? V.walkonPenalty : 0);
    return Util.roundN(v, 2);
  };

  /**
   * The round band for a draft value (§2.7.6 table).
   * @param {number} value
   * @returns {{round:number, udfa:boolean, undrafted:boolean, shock:boolean, altRound:number|null, roundProb:number|null, min:number}}
   */
  Draft.roundFor = function (value) {
    var rows = D().rounds;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (value >= r.min) {
        if (r.udfa) return { round: ROUND_UDFA, udfa: true, undrafted: false, shock: false, altRound: null, roundProb: null, min: r.min };
        return {
          round: r.round, udfa: false, undrafted: false, shock: !!r.shock,
          altRound: typeof r.altRound === 'number' ? r.altRound : null, roundProb: typeof r.roundProb === 'number' ? r.roundProb : null, min: r.min
        };
      }
    }
    return { round: ROUND_UNDRAFTED, udfa: false, undrafted: true, shock: false, altRound: null, roundProb: null, min: -Infinity };
  };

  /**
   * Label for a projection round number (1–7 → "Round n", 8 → "UDFA", 9 → "Undrafted").
   * @param {number} n @returns {string}
   */
  Draft.roundLabel = function (n) {
    if (n >= ROUND_UNDRAFTED) return 'Undrafted';
    if (n === ROUND_UDFA) return 'UDFA';
    return 'Round ' + n;
  };

  /**
   * Projection card (§2.7.4): the expected round with a ±band (agent tier 0: ±2, tiers 1–2: ±1), rounds
   * numbered 1–7, 8 = UDFA, 9 = undrafted. For the 86–91 band the more likely round (4) is shown.
   * @param {Object} state @returns {{value:number, round:number, low:number, high:number, label:string, udfa:boolean, undrafted:boolean}}
   */
  Draft.projection = function (state) {
    var PB = D().projectionBand;
    var value = Draft.draftValue(state);
    var band = Draft.roundFor(value);
    var round = band.round;
    if (band.altRound !== null && band.roundProb !== null && band.roundProb < 0.5) round = band.altRound;
    var tier = state.player.agentTier || 0;
    var spread = tier >= 2 ? PB.tier2 : (tier === 1 ? PB.tier1 : PB.tier0);
    var low = clamp(round - spread, 1, ROUND_UNDRAFTED), high = clamp(round + spread, 1, ROUND_UNDRAFTED);
    var label = low === high ? Draft.roundLabel(round) : Draft.roundLabel(low) + ' – ' + Draft.roundLabel(high).replace('Round ', '');
    return { value: value, round: round, low: low, high: high, label: label, udfa: band.udfa, undrafted: band.undrafted };
  };

  // ───────────────────────────── §2.7.6 the draft ─────────────────────────────

  /**
   * Draft order (team ids, pick 1 first): Standings.draftOrder when an NFL season with results exists,
   * else the league's data order.
   * @param {Object} state @param {RNG} [rng] passed to Standings.draftOrder for its tiebreak coin (1 fork draw)
   * @returns {string[]}
   */
  Draft.draftOrder = function (state, rng) {
    var L = nfl(state);
    if (!L) return [];
    var Standings = RTG.Standings;
    var season = state.season;
    var hasSeason = season && season.league === 'NFL' && Array.isArray(season.schedule) && season.schedule.length > 0
      && season.results && Object.keys(season.results).length > 0;
    if (hasSeason && Standings && typeof Standings.draftOrder === 'function') return Standings.draftOrder(season, L, rng);
    return L.teams.map(function (t) { return t.id; });
  };

  /**
   * Fictional pick rows around the user's pick. Draws per row: Names.player (3–4) + position weighted 1.
   * @param {Object} state @param {RNG} rng @param {string[]} order @param {number} userPick @param {Object} userRow
   * @returns {Object[]} [{round, pick, teamId, pos, name, isUser}]
   */
  function ticker(state, rng, order, userPick, userRow) {
    var T = D().ticker, PS = D().pickSlot, positions = D().positions;
    var Names = RTG.Names;
    var per = order.length || PS.teamsPerRound;
    var rows = [];
    var from = Math.max(1, userPick - T.before), to = userPick + T.after;
    for (var n = from; n <= to; n++) {
      if (n === userPick) { rows.push(userRow); continue; }
      var round = Math.floor((n - 1) / per) + 1;
      var teamId = order[(n - 1) % per];
      var name = Names.player(rng).full;                                                  // draws: 3–4
      var pos = rng.weighted(positions, 'w').pos;                                          // draw: 1
      rows.push({ round: round, pick: n, teamId: teamId, pos: pos, name: name, isUser: false });
    }
    return rows;
  }

  /**
   * The team that takes the user in `round` (§2.7.6): needy teams in draft order; the target slot is
   * position(first needy) + jitter, and the needy team nearest at or before that slot picks. Without a needy
   * team: the lowest kicker.ovr team. Returns {teamId, index} (index = 0-based position in the order).
   */
  function pickTeam(state, order, jitter) {
    var L = nfl(state);
    var needyIdx = [];
    for (var i = 0; i < order.length; i++) if (needy(teamIn(L, order[i]))) needyIdx.push(i);
    if (needyIdx.length) {
      var target = needyIdx[0] + jitter;
      var chosen = needyIdx[0];
      for (var j = 0; j < needyIdx.length; j++) if (needyIdx[j] <= target) chosen = needyIdx[j];
      return { teamId: order[chosen], index: chosen, needy: true };
    }
    var best = 0, bestOvr = Infinity;
    for (var k = 0; k < order.length; k++) {
      var t = teamIn(L, order[k]);
      var o = t && t.kicker ? t.kicker.ovr : -1;
      if (o < bestOvr) { bestOvr = o; best = k; }
    }
    return { teamId: order[best], index: best, needy: false };
  }

  /**
   * Run the draft (§2.7.6). Does not sign or move the player — the result carries the rookie `contract`
   * for Career.enterNfl. Sets state.flags.draft = {round, pick, teamId, value, shock}; a first-round shock
   * adds Tuning.draft.shock.fame fame.
   * Draws: shock chance 1 · alt-round chance 1 (86–91 band) · shock pick int 1 | jitter int 1 · ticker (Names + positions).
   * @param {Object} state @param {RNG} rng
   * @returns {Object} {round, pick, teamId, picksTicker, firstRoundShock, value, contract, undrafted:false}
   *                 | {undrafted:true, invites: Decision|null, tryout: boolean, value}
   */
  Draft.run = function (state, rng) {
    var S = D().shock, PS = D().pickSlot;
    var value = Draft.draftValue(state);
    var band = Draft.roundFor(value);
    var flags = state.flags = state.flags || {};
    if (band.undrafted) {
      flags.draft = { round: ROUND_UNDRAFTED, pick: 0, teamId: null, value: value, shock: false };
      return { undrafted: true, invites: null, tryout: true, value: value };
    }
    if (band.udfa) {
      flags.draft = { round: ROUND_UDFA, pick: 0, teamId: null, value: value, shock: false };
      return { undrafted: true, invites: RTG.Contracts.generateOffers(state, rng, 'UDFA'), tryout: false, value: value };
    }
    var order = Draft.draftOrder(state, rng);
    var per = order.length || PS.teamsPerRound;
    var shock = rng.chance(S.prob) && band.shock;                                          // draw 1 (always)
    var round = band.round;
    if (band.altRound !== null) round = rng.chance(band.roundProb) ? band.round : band.altRound;   // draw (86–91 only)
    var pick, teamId;
    if (shock) {
      round = 1;
      pick = rng.int(S.pickMin, S.pickMax);                                                // draw: shock pick
      teamId = order[(pick - 1) % per];
      state.player.fame = clamp(state.player.fame + S.fame, 0, Tuning.soft.fame.max);
    } else {
      var jitter = rng.int(0, PS.jitterMax);                                               // draw: slot jitter
      var pt = pickTeam(state, order, jitter);
      teamId = pt.teamId;
      pick = (round - 1) * per + pt.index + 1;
    }
    var userRow = { round: round, pick: pick, teamId: teamId, pos: 'K', name: state.player.name.full, isUser: true };
    var picksTicker = ticker(state, rng, order, pick, userRow);
    var contract = RTG.Contracts.rookieDeal(round, state.year);
    flags.draft = { round: round, pick: pick, teamId: teamId, value: value, shock: shock };
    return { undrafted: false, round: round, pick: pick, teamId: teamId, picksTicker: picksTicker, firstRoundShock: shock, value: value, contract: contract };
  };

  // ───────────────────────────── undrafted tryout ─────────────────────────────

  /**
   * Undrafted minicamp tryout (§2.7.6): a 'TRYOUT' KickSession of 6 calm middle-hash kicks
   * (Tuning.draft.tryout.distances); pass = ≥ 4 makes (scoreTryout). Draws: 0.
   * @param {Object} state @param {RNG} rng (unused; signature per §3.5.16) @returns {Object} KickSession
   */
  Draft.tryout = function (state, rng) {
    void rng;
    var T = D().tryout;
    var contexts = [];
    for (var i = 0; i < T.kicks; i++) {
      var d = T.distances[Math.min(i, T.distances.length - 1)];
      var ctx = sessionCtx(state, { type: 'FG', distance: d, hash: 0, pressure: T.pressure });
      ctx.label = 'Tryout ' + (i + 1) + '/' + T.kicks;
      contexts.push(ctx);
    }
    return { kind: 'TRYOUT', contexts: contexts, results: [], idx: 0, passMakes: T.passMakes };
  };

  /**
   * Score a tryout session: makes and whether it passed (≥ Tuning.draft.tryout.passMakes).
   * @param {Object} session @returns {{makes:number, kicks:number, passed:boolean}}
   */
  Draft.scoreTryout = function (session) {
    var T = D().tryout;
    var makes = 0;
    for (var i = 0; i < session.results.length; i++) if (made(session.results[i])) makes++;
    return { makes: makes, kicks: session.contexts.length, passed: makes >= T.passMakes };
  };

  RTG.Draft = Draft;
})(typeof window !== 'undefined' ? window : globalThis);
