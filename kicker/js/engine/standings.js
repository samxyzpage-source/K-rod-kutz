/**
 * Road to Glory: Kicker — RTG.Standings (SPEC §2.6, §3.5.10)
 *
 * Standings with full tiebreak chains, the college Top-25 poll, conference
 * championship games, the 12-team college playoff, bowls, the 14-team NFL
 * playoff, bracket advancement and the draft order. Pure over plain JSON:
 * nothing here touches the DOM or clocks, every coin toss comes from
 * `rng.fork('tiebreak')` (or a deterministic hash when no rng is passed so the
 * module never throws), and NO function mutates `season` — callers (Season)
 * store what they get back (`season.standings = Standings.compute(...)`,
 * `season.playoffs = Standings.playoffField(...)`, push the returned Games
 * into `season.schedule`). The one deliberate exception is
 * `Standings.recordResult`, whose whole job is to update `season.results`.
 *
 * ── Shapes (the spec leaves Bracket / BowlGame / StandingRow open) ──
 *
 * StandingRow = {
 *   teamId, conf, div (NFL) | null, w, l, t, pct, pf, pa, diff,
 *   confW, confL, divW, divL, streak,
 *   rank        overall 1..N (pct → diff → pf → id),
 *   confRank    1..16 NFL (seeding order) / 1..8 college (conference record),
 *   divRank     1..4 NFL, null college,
 *   divChamp    NFL division winner,
 *   seed        NFL 1..7 or null; college null (seeds live in the Bracket),
 *   pollRank, rankScore   college poll (from season.rankings) or null,
 *   note        '' or the tiebreak step that decided this team's slot
 * }
 *
 * Bracket = {
 *   league, year, name,
 *   seeds: [{seed, teamId, conf, champion:bool (conference champion / NFL
 *            division winner), autoBid:bool, rank (poll rank|confRank),
 *            alive:bool, exitRound:string|null, won:bool}],
 *   byes: [teamId],                       // seeds that skip round 0
 *   rounds: [{name, week, kind, games: Matchup[], complete:bool}],
 *   roundIdx: int,                        // current (first incomplete) round
 *   championId: string|null, complete: bool,
 *   venues: {title|champ: Venue}          // neutral final-site descriptor
 * }
 * Matchup = { id, round, week, kind, homeId, awayId, homeSeed, awaySeed,
 *             venue: Venue, winnerId:null|string, score:null|{home, away} }
 * Venue   = { type:'HOME'|'BOWL'|'NEUTRAL', id, name, hostTeamId:string|null,
 *             site: null | {id, name, city, state?, climate, dome, altitude, windy, rainy} }
 * NFL seeds: 1..7 per conference (seed numbers repeat across conferences; use
 * `conf` to tell them apart). College seeds: 1..12.
 *
 * BowlGame = Game & { bowlId, bowlName, neutral:true, site, homeRank, awayRank,
 *                     playoff:true }  — schedule-ready (kind 'BOWL', week 14).
 *
 * Game objects produced here (CCG, bowls, `roundGames`) are schedule-ready:
 * {id, week, homeId, awayId, kind, venue, played:false, ...extras}. For neutral
 * games `venue` is the bowl/site id and `site` carries the climate flags; for
 * home games `venue` is the home team id.
 *
 * RNG: `compute` forks the rng once (`rng.fork('tiebreak')`, 1 parent draw) and
 * draws one `chance(coinP)` per coin toss in a fixed group-processing order
 * (conferences in data order → divisions → division winners → wild cards).
 * `playoffField` / `nflPlayoffField` / `conferenceChampionshipGames` /
 * `draftOrder` only draw when they have to recompute standings.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  var Util = RTG.Util, Tuning = RTG.Tuning;

  var Standings = {};

  // ═══════════════════════════════ helpers ═══════════════════════════════

  var EPS = 1e-9;

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function mod(a, m) { return ((a % m) + m) % m; }

  /** @returns {Object<string, Team>} id → team */
  function teamMap(league) {
    var m = {};
    for (var i = 0; i < league.teams.length; i++) m[league.teams[i].id] = league.teams[i];
    return m;
  }

  /** Conference ids in data order (first appearance). */
  function confOrder(league) {
    var seen = {}, out = [];
    for (var i = 0; i < league.teams.length; i++) {
      var c = league.teams[i].conf;
      if (!seen[c]) { seen[c] = true; out.push(c); }
    }
    return out;
  }

  /** Empty TeamResult (mirrors Schema.emptyTeamResult without depending on it at load time). */
  function emptyResult() {
    return { w: 0, l: 0, t: 0, pf: 0, pa: 0, confW: 0, confL: 0, divW: 0, divL: 0, h2h: {}, streak: 0 };
  }

  /** The results row of a team (zeroed when it has none yet). */
  function resultOf(season, id) {
    return (season.results && season.results[id]) || emptyResult();
  }

  /** Win percentage with ties counting half. 0 when no games. */
  function pct(w, l, t) {
    var g = w + l + (t || 0);
    return g > 0 ? (w + 0.5 * (t || 0)) / g : 0;
  }

  /** Games played by a results row. */
  function gamesOf(r) { return r.w + r.l + r.t; }

  /** Summed head-to-head record of `row` against a set of ids → {w, l, t, g}. */
  function h2hVs(row, ids) {
    var out = { w: 0, l: 0, t: 0, g: 0 };
    for (var i = 0; i < ids.length; i++) {
      var h = row.h2h && row.h2h[ids[i]];
      if (!h) continue;
      out.w += h[0] || 0; out.l += h[1] || 0; out.t += h[2] || 0;
    }
    out.g = out.w + out.l + out.t;
    return out;
  }

  /** Opponent ids a results row has actually played. */
  function opponentsOf(row) {
    var out = [];
    for (var id in row.h2h) {
      var h = row.h2h[id];
      if (h && ((h[0] || 0) + (h[1] || 0) + (h[2] || 0)) > 0) out.push(id);
    }
    return out;
  }

  /** Intersection of the opponents of every row in `rows`. */
  function commonOpponents(rows) {
    if (!rows.length) return [];
    var common = opponentsOf(rows[0]);
    for (var i = 1; i < rows.length && common.length; i++) {
      var set = {};
      var opps = opponentsOf(rows[i]);
      for (var j = 0; j < opps.length; j++) set[opps[j]] = true;
      common = common.filter(function (id) { return set[id]; });
    }
    return common;
  }

  /**
   * Coin-toss source. With an rng: one fork ('tiebreak'), then one
   * `chance(coinP)` per toss. Without: a deterministic fnv1a parity so the
   * module stays pure and never throws.
   * @param {RNG} [rng] @returns {function(string, string): boolean} true → first id wins
   */
  function makeCoin(rng) {
    var p = Tuning.schedule.tiebreak.coinP;
    if (rng && typeof rng.fork === 'function') {
      var child = rng.fork('tiebreak');
      return function () { return child.chance(p); };
    }
    return function (a, b) { return (Util.fnv1a32(String(a) + '|' + String(b)) & 1) === 0; };
  }

  function sortIds(ids) { return ids.slice().sort(); }

  // ═══════════════════════════════ tiebreak engine ═══════════════════════════════

  /**
   * A tiebreak step: (group ids, ctx) → {[id]: metric} (higher is better) or
   * null when the step does not apply to this group.
   * @typedef {{label:string, fn:function(string[], Object): (Object<string, number>|null)}} TieStep
   */

  /** Metric: win pct in games played among the group (null when someone has none). */
  var stepHeadToHead = {
    label: 'head-to-head',
    fn: function (group, ctx) {
      var out = {};
      for (var i = 0; i < group.length; i++) {
        var others = group.filter(function (id) { return id !== group[i]; });
        var h = h2hVs(ctx.res(group[i]), others);
        if (h.g === 0) return null;
        out[group[i]] = pct(h.w, h.l, h.t);
      }
      return out;
    }
  };

  /**
   * Wild-card head-to-head: two teams → their game(s); three or more → only a
   * sweep counts (a team that beat every other tied team ranks first, one that
   * lost to every other ranks last), and only when all pairs have played.
   */
  var stepHeadToHeadSweep = {
    label: 'head-to-head sweep',
    fn: function (group, ctx) {
      if (group.length === 2) return stepHeadToHead.fn(group, ctx);
      var out = {}, i, j, anyFlag = false;
      for (i = 0; i < group.length; i++) {
        var beatAll = true, lostAll = true;
        for (j = 0; j < group.length; j++) {
          if (i === j) continue;
          var h = ctx.res(group[i]).h2h[group[j]];
          var w = h ? (h[0] || 0) : 0, l = h ? (h[1] || 0) : 0, t = h ? (h[2] || 0) : 0;
          if (w + l + t === 0) return null;            // not all pairs have played
          if (!(w > 0 && l === 0 && t === 0)) beatAll = false;
          if (!(l > 0 && w === 0 && t === 0)) lostAll = false;
        }
        out[group[i]] = beatAll ? 1 : (lostAll ? -1 : 0);
        if (beatAll || lostAll) anyFlag = true;
      }
      return anyFlag ? out : null;
    }
  };

  var stepDivisionRecord = {
    label: 'division record',
    fn: function (group, ctx) {
      var out = {};
      for (var i = 0; i < group.length; i++) { var r = ctx.res(group[i]); out[group[i]] = pct(r.divW, r.divL, 0); }
      return out;
    }
  };

  var stepConferenceRecord = {
    label: 'conference record',
    fn: function (group, ctx) {
      var out = {};
      for (var i = 0; i < group.length; i++) { var r = ctx.res(group[i]); out[group[i]] = pct(r.confW, r.confL, 0); }
      return out;
    }
  };

  /** Record vs common opponents; `ctx.commonMin` games required for each team (0 = none). */
  var stepCommonGames = {
    label: 'common games',
    fn: function (group, ctx) {
      var rows = group.map(ctx.res);
      var common = commonOpponents(rows);
      if (!common.length) return null;
      var out = {};
      for (var i = 0; i < group.length; i++) {
        var h = h2hVs(rows[i], common);
        if (h.g < (ctx.commonMin || 0) || h.g === 0) return null;
        out[group[i]] = pct(h.w, h.l, h.t);
      }
      return out;
    }
  };

  var stepPointDiff = {
    label: 'point differential',
    fn: function (group, ctx) {
      var out = {};
      for (var i = 0; i < group.length; i++) { var r = ctx.res(group[i]); out[group[i]] = r.pf - r.pa; }
      return out;
    }
  };

  /** College: the poll score (null when no rankings exist yet). */
  var stepRankingScore = {
    label: 'ranking',
    fn: function (group, ctx) {
      if (!ctx.rankings) return null;
      var out = {}, any = false;
      for (var i = 0; i < group.length; i++) {
        var rk = ctx.rankings[group[i]];
        out[group[i]] = rk && typeof rk.score === 'number' ? rk.score : 0;
        if (rk) any = true;
      }
      return any ? out : null;
    }
  };

  var NFL_DIVISION_STEPS = [stepHeadToHead, stepDivisionRecord, stepCommonGames, stepConferenceRecord, stepPointDiff];
  var NFL_WILDCARD_STEPS = [stepHeadToHeadSweep, stepConferenceRecord, stepCommonGames, stepPointDiff];
  var COLLEGE_CONF_STEPS = [stepHeadToHead, stepCommonGames, stepRankingScore];

  /** Order a tied group by coin tosses (sequential "king of the hill", fixed draw order). */
  function coinOrder(group, ctx) {
    var ids = sortIds(group);
    var out = [];
    while (ids.length > 1) {
      var king = ids[0];
      for (var i = 1; i < ids.length; i++) if (!ctx.coin(king, ids[i])) king = ids[i];
      out.push(king);
      ids = ids.filter(function (id) { return id !== king; });
      ctx.note(king, 'coin toss');
    }
    if (ids.length) out.push(ids[0]);
    return out;
  }

  /**
   * NFL-style tiebreak procedure: apply steps in order; when a step separates
   * part of the group, the leaders and the rest each restart from step 1.
   * @param {string[]} group tied team ids @param {TieStep[]} steps @param {Object} ctx
   * @param {number} [stepIdx=0] @returns {string[]} ordered ids
   */
  function orderGroup(group, steps, ctx, stepIdx) {
    if (group.length <= 1) return group.slice();
    stepIdx = stepIdx || 0;
    if (stepIdx >= steps.length) return coinOrder(group, ctx);
    var metric = steps[stepIdx].fn(group, ctx);
    if (!metric) return orderGroup(group, steps, ctx, stepIdx + 1);
    var best = -Infinity, i;
    for (i = 0; i < group.length; i++) if (metric[group[i]] > best) best = metric[group[i]];
    var top = [], rest = [];
    for (i = 0; i < group.length; i++) (metric[group[i]] >= best - EPS ? top : rest).push(group[i]);
    if (top.length === group.length) return orderGroup(group, steps, ctx, stepIdx + 1);
    for (i = 0; i < top.length; i++) ctx.note(top[i], steps[stepIdx].label);
    return orderGroup(top, steps, ctx, 0).concat(orderGroup(rest, steps, ctx, 0));
  }

  /**
   * Wild-card ordering of a tied group: only the best-placed team of each
   * division takes part in each comparison (division tiebreak first), the
   * winner takes the slot, then everyone left restarts.
   * @param {string[]} group @param {Object} ctx ctx.divRankOf(id) → number, ctx.divOf(id) → string
   */
  function orderWildcardGroup(group, ctx) {
    var out = [];
    var remaining = group.slice();
    while (remaining.length > 1) {
      var bestByDiv = {}, i;
      for (i = 0; i < remaining.length; i++) {
        var id = remaining[i], d = ctx.divOf(id);
        if (!bestByDiv[d] || ctx.divRankOf(id) < ctx.divRankOf(bestByDiv[d])) bestByDiv[d] = id;
      }
      var contenders = [];
      for (var d2 in bestByDiv) contenders.push(bestByDiv[d2]);
      contenders = sortIds(contenders);
      var winner;
      if (contenders.length === 1) { winner = contenders[0]; ctx.note(winner, 'division tiebreak'); }
      else winner = orderGroup(contenders, NFL_WILDCARD_STEPS, ctx, 0)[0];
      out.push(winner);
      remaining = remaining.filter(function (x) { return x !== winner; });
    }
    if (remaining.length) out.push(remaining[0]);
    return out;
  }

  /**
   * Sort ids by a primary key (desc), then break every tied run with `breaker`.
   * @param {string[]} ids @param {function(string): number} keyFn
   * @param {function(string[]): string[]} breaker
   */
  function rankByKey(ids, keyFn, breaker) {
    var sorted = ids.slice().sort(function (a, b) { return keyFn(b) - keyFn(a) || (a < b ? -1 : a > b ? 1 : 0); });
    var out = [];
    var i = 0;
    while (i < sorted.length) {
      var j = i + 1;
      while (j < sorted.length && Math.abs(keyFn(sorted[j]) - keyFn(sorted[i])) < EPS) j++;
      var run = sorted.slice(i, j);
      out = out.concat(run.length > 1 ? breaker(run) : run);
      i = j;
    }
    return out;
  }

  // ═══════════════════════════════ compute ═══════════════════════════════

  /** Build a StandingRow skeleton from a results row. */
  function rowFor(team, r) {
    return {
      teamId: team.id, conf: team.conf, div: team.div || null,
      w: r.w, l: r.l, t: r.t, pct: pct(r.w, r.l, r.t), pf: r.pf, pa: r.pa, diff: r.pf - r.pa,
      confW: r.confW, confL: r.confL, divW: r.divW, divL: r.divL, streak: r.streak,
      rank: 0, confRank: 0, divRank: null, divChamp: false, seed: null,
      pollRank: null, rankScore: null, note: ''
    };
  }

  /** Shared tiebreak context for one compute pass. */
  function makeCtx(season, league, rng) {
    var notes = {};
    return {
      res: function (id) { return resultOf(season, id); },
      rankings: season.rankings && Object.keys(season.rankings).length ? season.rankings : null,
      commonMin: Tuning.schedule.tiebreak.commonGamesMin,
      coin: makeCoin(rng),
      notes: notes,
      note: function (id, label) { if (!notes[id]) notes[id] = label; },
      divOf: function (id) { return this._div[id]; },
      divRankOf: function (id) { return this._divRank[id] || 99; },
      _div: {}, _divRank: {}
    };
  }

  /** Assign the overall `rank` (pct → diff → pf → id) and sort a copy by it. */
  function assignOverallRank(rows) {
    var sorted = rows.slice().sort(function (a, b) {
      return b.pct - a.pct || b.diff - a.diff || b.pf - a.pf || (a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0);
    });
    for (var i = 0; i < sorted.length; i++) sorted[i].rank = i + 1;
  }

  /** NFL: division standings → division winners seeded 1–4 → wild cards 5–7 → confRank 1..16. */
  function computeNfl(season, league, rng) {
    var teams = league.teams;
    var ctx = makeCtx(season, league, rng);
    var rows = {}, i;
    for (i = 0; i < teams.length; i++) {
      rows[teams[i].id] = rowFor(teams[i], resultOf(season, teams[i].id));
      ctx._div[teams[i].id] = teams[i].conf + ':' + teams[i].div;
    }
    var pctOf = function (id) { return rows[id].pct; };
    var confs = confOrder(league);
    var ordered = [];
    for (var c = 0; c < confs.length; c++) {
      var confTeams = teams.filter(function (t) { return t.conf === confs[c]; });
      var divs = [];
      var seenDiv = {};
      for (i = 0; i < confTeams.length; i++) if (!seenDiv[confTeams[i].div]) { seenDiv[confTeams[i].div] = true; divs.push(confTeams[i].div); }
      var winners = [], others = [];
      for (var d = 0; d < divs.length; d++) {
        var divIds = confTeams.filter(function (t) { return t.div === divs[d]; }).map(function (t) { return t.id; });
        var divOrder = rankByKey(divIds, pctOf, function (run) { return orderGroup(run, NFL_DIVISION_STEPS, ctx, 0); });
        for (i = 0; i < divOrder.length; i++) {
          rows[divOrder[i]].divRank = i + 1;
          ctx._divRank[divOrder[i]] = i + 1;
          if (i === 0) { rows[divOrder[i]].divChamp = true; winners.push(divOrder[i]); }
          else others.push(divOrder[i]);
        }
      }
      // Division winners are seeded against each other with the wild-card procedure (different divisions).
      var seeded = rankByKey(winners, pctOf, function (run) { return orderGroup(run, NFL_WILDCARD_STEPS, ctx, 0); });
      var wild = rankByKey(others, pctOf, function (run) { return orderWildcardGroup(run, ctx); });
      var confList = seeded.concat(wild);
      var perConf = Tuning.schedule.nfl.playoffPerConf;
      for (i = 0; i < confList.length; i++) {
        var row = rows[confList[i]];
        row.confRank = i + 1;
        row.seed = i < perConf ? i + 1 : null;
        ordered.push(row);
      }
    }
    for (var id in ctx.notes) rows[id].note = ctx.notes[id];
    assignOverallRank(ordered);
    return ordered;
  }

  /** College: conference standings by conference record with §2.6.1 tiebreakers. */
  function computeCollege(season, league, rng) {
    var teams = league.teams;
    var ctx = makeCtx(season, league, rng);
    var rows = {}, i;
    for (i = 0; i < teams.length; i++) {
      var r = resultOf(season, teams[i].id);
      var row = rowFor(teams[i], r);
      var rk = season.rankings && season.rankings[teams[i].id];
      if (rk) { row.pollRank = rk.rank; row.rankScore = rk.score; }
      rows[teams[i].id] = row;
    }
    var confPct = function (id) { var rr = rows[id]; return pct(rr.confW, rr.confL, 0); };
    var confs = confOrder(league);
    var ordered = [];
    for (var c = 0; c < confs.length; c++) {
      var ids = teams.filter(function (t) { return t.conf === confs[c]; }).map(function (t) { return t.id; });
      var order = rankByKey(ids, confPct, function (run) { return orderGroup(run, COLLEGE_CONF_STEPS, ctx, 0); });
      for (i = 0; i < order.length; i++) { rows[order[i]].confRank = i + 1; ordered.push(rows[order[i]]); }
    }
    for (var id in ctx.notes) rows[id].note = ctx.notes[id];
    assignOverallRank(ordered);
    return ordered;
  }

  /**
   * Standings with tiebreaks (§2.6.1 college conference chain, §2.6.2 NFL
   * division + wild-card chains). Rows come back grouped by conference in data
   * order and sorted by `confRank`; `rank` is the overall order. Pure: does not
   * write `season.standings` (the caller does).
   * @param {SeasonState} season @param {League} league
   * @param {RNG} [rng] source of the seeded coin (forked once as 'tiebreak'); a deterministic hash coin when omitted
   * @returns {StandingRow[]}
   */
  Standings.compute = function (season, league, rng) {
    return league.kind === 'NFL' ? computeNfl(season, league, rng) : computeCollege(season, league, rng);
  };

  /** Standings rows: `season.standings` when present, else a fresh compute. */
  function rowsFor(season, league, rng) {
    if (season.standings && season.standings.length === league.teams.length) return season.standings;
    return Standings.compute(season, league, rng);
  }

  /**
   * Record a played game into `season.results` (creates rows as needed).
   * REG games count everywhere; CCG/BOWL/playoff games count toward the overall
   * record, points, streak and head-to-head but NOT conference/division marks.
   * Idempotency is the caller's job (call once per game, after `played`/`score` are set).
   * @param {SeasonState} season @param {League} league @param {Game} game played game with `score`
   */
  Standings.recordResult = function (season, league, game) {
    if (!game || !game.score) throw new Error('Standings.recordResult: game has no score');
    var tm = teamMap(league);
    var home = tm[game.homeId], away = tm[game.awayId];
    if (!home || !away) throw new Error('Standings.recordResult: unknown team in ' + game.id);
    if (!season.results) season.results = {};
    var h = season.results[home.id] || (season.results[home.id] = emptyResult());
    var a = season.results[away.id] || (season.results[away.id] = emptyResult());
    var hs = game.score.home, as = game.score.away;
    var reg = game.kind === 'REG' || game.kind === undefined;
    var sameConf = home.conf === away.conf;
    var sameDiv = sameConf && !!home.div && home.div === away.div;
    h.pf += hs; h.pa += as; a.pf += as; a.pa += hs;
    h.h2h[away.id] = h.h2h[away.id] || [0, 0, 0];
    a.h2h[home.id] = a.h2h[home.id] || [0, 0, 0];
    if (hs === as) {
      h.t++; a.t++; h.streak = 0; a.streak = 0;
      h.h2h[away.id][2]++; a.h2h[home.id][2]++;
      return;
    }
    var win = hs > as ? h : a, loss = hs > as ? a : h;
    var winId = hs > as ? home.id : away.id, lossId = hs > as ? away.id : home.id;
    win.w++; loss.l++;
    win.streak = win.streak > 0 ? win.streak + 1 : 1;
    loss.streak = loss.streak < 0 ? loss.streak - 1 : -1;
    win.h2h[lossId][0]++; loss.h2h[winId][1]++;
    if (reg && sameConf) { win.confW++; loss.confL++; }
    if (reg && sameDiv) { win.divW++; loss.divL++; }
  };

  /**
   * 'W-L' or 'W-L-T' text for a results/standing row.
   * @param {{w:number, l:number, t?:number}} r @returns {string}
   */
  Standings.recordString = function (r) {
    return r.w + '-' + r.l + (r.t ? '-' + r.t : '');
  };

  // ═══════════════════════════════ rankings (college poll) ═══════════════════════════════

  /**
   * College poll (§2.6.1), all 48 teams ranked (the UI shows the Top 25):
   *   raw   = winW·winPct + sosW·SOS + marginW·clamp(avgMargin/marginDiv, −1, 1) + prestigeW·prestige/5
   *   score = sticky·raw + (1 − sticky)·prevScore
   * SOS = mean opponent winPct over games played. A team with no games uses
   * prestige/5 as its winPct (and its scheduled opponents' prestige/5 as SOS),
   * which is also the preseason `prevScore` when `prev` is null.
   * @param {SeasonState} season @param {League} league
   * @param {Object<string, {score:number, rank:number}>|null} prev last week's rankings (null → preseason)
   * @returns {Object<string, {score:number, rank:number, prev:number}>}
   */
  Standings.rankings = function (season, league, prev) {
    var R = Tuning.schedule.ranking;
    var teams = league.teams;
    var i, j, id;
    var base = {};          // id → {winPct, prestigeP, games, margin}
    for (i = 0; i < teams.length; i++) {
      var r = resultOf(season, teams[i].id);
      var g = gamesOf(r);
      var pP = (teams[i].prestige || 3) / 5;
      base[teams[i].id] = { g: g, winPct: g > 0 ? pct(r.w, r.l, r.t) : pP, pP: pP, margin: g > 0 ? (r.pf - r.pa) / g : 0, res: r };
    }
    // Scheduled opponents (for the preseason SOS).
    var sched = {};
    var schedule = season.schedule || [];
    for (i = 0; i < schedule.length; i++) {
      var gm = schedule[i];
      if (gm.kind && gm.kind !== 'REG') continue;
      (sched[gm.homeId] = sched[gm.homeId] || []).push(gm.awayId);
      (sched[gm.awayId] = sched[gm.awayId] || []).push(gm.homeId);
    }
    var out = {};
    var list = [];
    for (i = 0; i < teams.length; i++) {
      id = teams[i].id;
      var b = base[id];
      var sos = 0, n = 0;
      if (b.g > 0) {
        for (var opp in b.res.h2h) {
          var h = b.res.h2h[opp];
          var k = (h[0] || 0) + (h[1] || 0) + (h[2] || 0);
          if (!k || !base[opp]) continue;
          sos += k * base[opp].winPct; n += k;
        }
      } else {
        var opps = sched[id] || [];
        for (j = 0; j < opps.length; j++) if (base[opps[j]]) { sos += base[opps[j]].pP; n++; }
      }
      sos = n > 0 ? sos / n : b.pP;
      var marginTerm = Util.clamp(b.margin / R.marginDiv, -1, 1);
      var raw = R.winW * b.winPct + R.sosW * sos + R.marginW * marginTerm + R.prestigeW * b.pP;
      var preseason = R.winW * b.pP + R.sosW * sos + R.prestigeW * b.pP;
      var prevScore = prev && prev[id] && typeof prev[id].score === 'number' ? prev[id].score : preseason;
      var score = R.sticky * raw + (1 - R.sticky) * prevScore;
      out[id] = { score: Math.round(score * 1e6) / 1e6, rank: 0, prev: 0 };
      list.push(id);
    }
    list.sort(function (a, c) {
      return out[c].score - out[a].score || base[c].winPct - base[a].winPct || (a < c ? -1 : a > c ? 1 : 0);
    });
    for (i = 0; i < list.length; i++) {
      id = list[i];
      out[id].rank = i + 1;
      out[id].prev = prev && prev[id] && typeof prev[id].rank === 'number' ? prev[id].rank : i + 1;
    }
    return out;
  };

  /** Rankings map: `season.rankings` when populated, else a fresh preseason-style compute. */
  function rankingsFor(season, league) {
    if (season.rankings && Object.keys(season.rankings).length === league.teams.length) return season.rankings;
    return Standings.rankings(season, league, null);
  }

  /** Poll rank of a team (1 = best). */
  function pollRank(rankings, id) {
    return rankings[id] ? rankings[id].rank : 999;
  }

  // ═══════════════════════════════ games / venues ═══════════════════════════════

  /** Venue descriptor for a home game. */
  function homeVenue(team) {
    return { type: 'HOME', id: team.id, name: team.name, hostTeamId: team.id, site: null };
  }

  /** Copy the weather-relevant fields of a bowl/site row. */
  function siteOf(b) {
    return {
      id: b.id, name: b.name, city: b.city || '', state: b.state || '',
      climate: b.climate || 'temperate', dome: !!b.dome, altitude: !!b.altitude, windy: !!b.windy, rainy: !!b.rainy
    };
  }

  /** Venue descriptor for a bowl site. */
  function bowlVenue(b, name) {
    return { type: 'BOWL', id: b.id, name: name || b.name, hostTeamId: null, site: siteOf(b) };
  }

  /** Data.bowls by tier, with a generated fallback when the data file is absent. */
  function bowlsByTier(tier, count) {
    var Data = RTG.Data || {};
    var list = (Data.bowls || []).filter(function (b) { return b.tier === tier; });
    if (list.length >= count) return list.slice(0, count);
    var out = list.slice();
    for (var i = out.length; i < count; i++) {
      out.push({ id: tier + i, name: (tier === 'major' ? 'Major Bowl ' : 'Bowl ') + (i + 1), city: '', climate: 'temperate', dome: false, altitude: false, windy: false, rainy: false });
    }
    return out;
  }

  /**
   * Schedule-ready Game for a postseason matchup.
   * @param {'C'|'N'} letter @param {number} year @param {Matchup} m @param {Object<string, Team>} tm
   * @returns {Game}
   */
  function gameFromMatchup(letter, year, m, tm) {
    var home = tm[m.homeId], away = tm[m.awayId];
    var neutral = m.venue.type !== 'HOME';
    var g = {
      id: m.id, week: m.week, homeId: m.homeId, awayId: m.awayId, kind: m.kind,
      venue: neutral ? m.venue.id : m.homeId, played: false,
      playoff: true, neutral: neutral, round: m.round,
      homeSeed: m.homeSeed, awaySeed: m.awaySeed, venueName: m.venue.name,
      site: m.venue.site ? siteOf(m.venue.site) : null
    };
    if (!home || !away) throw new Error('Standings: unknown team in matchup ' + m.id);
    return g;
  }

  /** Playoff game id: 'C3-w14-FIRST-ATT-CHS'. */
  function playoffId(letter, year, week, round, home, away) {
    return letter + year + '-w' + pad2(week) + '-' + round + '-' + home.abbr + '-' + away.abbr;
  }

  // ═══════════════════════════════ conference championships ═══════════════════════════════

  /**
   * Week-13 conference championship games: confRank 1 hosts confRank 2 in
   * every conference (§2.6.1). Uses `season.standings` when populated.
   * @param {SeasonState} season @param {League} league college league
   * @param {RNG} [rng] only used when standings must be recomputed
   * @returns {Game[]} kind 'CCG', with `ccgConf` (conference id)
   */
  Standings.conferenceChampionshipGames = function (season, league, rng) {
    var C = Tuning.schedule.college;
    var rows = rowsFor(season, league, rng);
    var tm = teamMap(league);
    var confs = confOrder(league);
    var out = [];
    for (var c = 0; c < confs.length; c++) {
      var one = null, two = null;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].conf !== confs[c]) continue;
        if (rows[i].confRank === 1) one = rows[i];
        else if (rows[i].confRank === 2) two = rows[i];
      }
      if (!one || !two) continue;
      var home = tm[one.teamId], away = tm[two.teamId];
      out.push({
        id: 'C' + season.year + '-w' + pad2(C.ccgWeek) + '-CCG-' + confs[c] + '-' + home.abbr + '-' + away.abbr,
        week: C.ccgWeek, homeId: home.id, awayId: away.id, kind: 'CCG', venue: home.id, played: false,
        conf: true, ccgConf: confs[c], playoff: true, neutral: false
      });
    }
    return out;
  };

  /**
   * Conference champions: winners of played CCG games, else the conference's
   * confRank-1 team. @returns {Object<string, string>} conf → teamId
   */
  function conferenceChampions(season, league, rng) {
    var champs = {};
    var tm = teamMap(league);
    var schedule = season.schedule || [];
    for (var i = 0; i < schedule.length; i++) {
      var g = schedule[i];
      if (g.kind !== 'CCG' || !g.played || !g.score) continue;
      var winner = g.score.home >= g.score.away ? g.homeId : g.awayId;
      var conf = g.ccgConf || (tm[winner] && tm[winner].conf);
      if (conf) champs[conf] = winner;
    }
    var confs = confOrder(league);
    var rows = null;
    for (var c = 0; c < confs.length; c++) {
      if (champs[confs[c]]) continue;
      rows = rows || rowsFor(season, league, rng);
      for (var r = 0; r < rows.length; r++) if (rows[r].conf === confs[c] && rows[r].confRank === 1) champs[confs[c]] = rows[r].teamId;
    }
    return champs;
  }

  // ═══════════════════════════════ college playoff ═══════════════════════════════

  /**
   * Select the 12-team field (§2.6.1): the `autoBids` highest-ranked conference
   * champions qualify automatically, the rest of the field is at-large by poll
   * rank (the remaining champion is eligible as an at-large). Seeds 1–byes are
   * the highest-ranked champions; the other seeds follow poll order.
   * @returns {{seeds: Object[], champions: Object<string, string>}}
   */
  function selectCollegeField(season, league, rng) {
    var C = Tuning.schedule.college;
    var rankings = rankingsFor(season, league);
    var champs = conferenceChampions(season, league, rng);
    var tm = teamMap(league);
    var byRank = function (a, b) { return pollRank(rankings, a) - pollRank(rankings, b); };
    var champIds = [];
    for (var conf in champs) champIds.push(champs[conf]);
    champIds.sort(byRank);
    var autoIds = champIds.slice(0, C.autoBids);
    var inField = {};
    var i;
    for (i = 0; i < autoIds.length; i++) inField[autoIds[i]] = true;
    var pool = league.teams.map(function (t) { return t.id; }).filter(function (id) { return !inField[id]; }).sort(byRank);
    var atLarge = pool.slice(0, C.playoffTeams - autoIds.length);
    for (i = 0; i < atLarge.length; i++) inField[atLarge[i]] = true;
    var isChamp = {};
    for (i = 0; i < champIds.length; i++) isChamp[champIds[i]] = true;
    var top = autoIds.slice(0, C.byes);
    var rest = autoIds.slice(C.byes).concat(atLarge).sort(byRank);
    var order = top.concat(rest);
    var seeds = [];
    for (i = 0; i < order.length; i++) {
      seeds.push({
        seed: i + 1, teamId: order[i], conf: tm[order[i]].conf,
        champion: !!isChamp[order[i]], autoBid: autoIds.indexOf(order[i]) >= 0,
        rank: pollRank(rankings, order[i]), alive: true, exitRound: null, won: false
      });
    }
    return { seeds: seeds, champions: champs };
  }

  /** Empty round shells for a bracket. @param {{name, week, kind}[]} defs */
  function makeRounds(defs) {
    return defs.map(function (d) { return { name: d.name, week: d.week, kind: d.kind, games: [], complete: false }; });
  }

  /** Seed entry lookup. */
  function seedOf(bracket, teamId) {
    for (var i = 0; i < bracket.seeds.length; i++) if (bracket.seeds[i].teamId === teamId) return bracket.seeds[i];
    return null;
  }

  /**
   * The 12-team college playoff bracket (§2.6.1). Round 0 (week 14): 5v12,
   * 6v11, 7v10, 8v9 at the higher seed; quarterfinals (week 15) at four major
   * bowls, semifinals (week 16) at two, the National Title Game (week 17) at
   * the major bowl `year mod 6`. Later rounds are filled by `advanceBracket`.
   * Pure: does not touch `season`; get round-0 Games with `roundGames(bracket, 0)`.
   * @param {SeasonState} season @param {League} league college league (needs `season.rankings`
   *        and played CCG games in `season.schedule`; falls back to standings)
   * @param {RNG} [rng] only for a standings recompute fallback
   * @returns {Bracket}
   */
  Standings.playoffField = function (season, league, rng) {
    var C = Tuning.schedule.college;
    var tm = teamMap(league);
    var sel = selectCollegeField(season, league, rng);
    var weeks = C.playoffWeeks;
    var majors = bowlsByTier('major', C.majorBowls);
    var rot = function (i) { return majors[mod(season.year + i, majors.length)]; };
    var bracket = {
      league: 'COLLEGE', year: season.year, name: 'College Playoff',
      seeds: sel.seeds, champions: sel.champions,
      byes: sel.seeds.slice(0, C.byes).map(function (s) { return s.teamId; }),
      rounds: makeRounds([
        { name: 'FIRST', week: weeks[0], kind: 'PLAYOFF' },
        { name: 'QF', week: weeks[1], kind: 'PLAYOFF' },
        { name: 'SF', week: weeks[2], kind: 'PLAYOFF' },
        { name: 'TITLE', week: weeks[3], kind: 'CHAMP' }
      ]),
      roundIdx: 0, championId: null, complete: false,
      venues: {
        qf: [rot(1), rot(2), rot(3), rot(4)].map(function (b) { return bowlVenue(b); }),
        sf: [rot(5), rot(0)].map(function (b) { return bowlVenue(b); }),
        title: bowlVenue(rot(0), C.titleGameName)
      }
    };
    // First round: seed k (k = byes+1 .. byes + (n−byes)/2) hosts seed n+byes+1−k → (5,12) (6,11) (7,10) (8,9).
    var n = C.playoffTeams, b = C.byes;
    var r0 = bracket.rounds[0];
    for (var k = b + 1; k <= b + (n - b) / 2; k++) {
      var hi = sel.seeds[k - 1], lo = sel.seeds[n + b - k];
      if (!hi || !lo) continue;
      r0.games.push(makeMatchup('C', season.year, r0, hi, lo, homeVenue(tm[hi.teamId]), tm));
    }
    return bracket;
  };

  /**
   * Build a matchup record with its game id.
   * @param {'C'|'N'} letter @param {number} year @param {Object} round @param {Object} hi seed entry (listed as home)
   * @param {Object} lo seed entry @param {Venue} venue @param {Object<string, Team>} tm
   */
  function makeMatchup(letter, year, round, hi, lo, venue, tm) {
    return {
      id: playoffId(letter, year, round.week, round.name, tm[hi.teamId], tm[lo.teamId]),
      round: round.name, week: round.week, kind: round.kind,
      homeId: hi.teamId, awayId: lo.teamId, homeSeed: hi.seed, awaySeed: lo.seed,
      conf: hi.conf === lo.conf ? hi.conf : null,
      venue: venue, winnerId: null, score: null
    };
  }

  // ═══════════════════════════════ bowls ═══════════════════════════════

  /**
   * Bowl pairings (§2.6.1): teams with ≥ `bowlMinWins` wins that are not in
   * the playoff, sorted by poll rank, paired best vs next-best from a different
   * conference, into the 12 minor bowls in data order (best pairing → first
   * bowl). Teams that cannot be paired cross-conference, or beyond 12 pairs,
   * get no bowl. Requires the playoff field: `season.playoffs` when set, else
   * the field is selected on the fly.
   * @param {SeasonState} season @param {League} league college league
   * @param {RNG} [rng] only for a standings recompute fallback
   * @returns {BowlGame[]} schedule-ready Games (kind 'BOWL', week 14)
   */
  Standings.bowls = function (season, league, rng) {
    var C = Tuning.schedule.college;
    var rankings = rankingsFor(season, league);
    var tm = teamMap(league);
    var inPlayoff = {};
    var seeds = season.playoffs && season.playoffs.seeds ? season.playoffs.seeds : selectCollegeField(season, league, rng).seeds;
    var i;
    for (i = 0; i < seeds.length; i++) inPlayoff[seeds[i].teamId] = true;
    var eligible = [];
    for (i = 0; i < league.teams.length; i++) {
      var id = league.teams[i].id;
      if (inPlayoff[id]) continue;
      if (resultOf(season, id).w >= C.bowlMinWins) eligible.push(id);
    }
    eligible.sort(function (a, b) { return pollRank(rankings, a) - pollRank(rankings, b); });
    var minors = bowlsByTier('minor', C.minorBowls);
    var out = [];
    while (eligible.length > 1 && out.length < minors.length) {
      var a = eligible.shift();
      var partner = -1;
      for (i = 0; i < eligible.length; i++) if (tm[eligible[i]].conf !== tm[a].conf) { partner = i; break; }
      if (partner < 0) break;                       // everyone left shares a's conference: no more pairings
      var b = eligible.splice(partner, 1)[0];
      var bowl = minors[out.length];
      var home = tm[a], away = tm[b];
      out.push({
        id: 'C' + season.year + '-w' + pad2(C.bowlWeek) + '-BOWL-' + bowl.id + '-' + home.abbr + '-' + away.abbr,
        week: C.bowlWeek, homeId: home.id, awayId: away.id, kind: 'BOWL', venue: bowl.id, played: false,
        bowlId: bowl.id, bowlName: bowl.name, venueName: bowl.name, neutral: true, playoff: true,
        site: siteOf(bowl), homeRank: pollRank(rankings, a), awayRank: pollRank(rankings, b)
      });
    }
    return out;
  };

  // ═══════════════════════════════ NFL playoff ═══════════════════════════════

  /**
   * The 14-team NFL bracket (§2.6.2): per conference the 4 division winners
   * seeded 1–4 and 3 wild cards 5–7 (from `season.standings`), seed 1 bye.
   * Wild Card (week 19): 2v7, 3v6, 4v5 at the higher seed → Divisional (1 vs
   * the lowest remaining seed, other two; re-seeded by `advanceBracket`) →
   * Conference Championship → The Championship Bowl (neutral, week 22, host
   * `Data.championshipHosts[year mod 10]`). Pure: use `roundGames(bracket, 0)`.
   * @param {SeasonState} season @param {League} league NFL league
   * @param {RNG} [rng] only for a standings recompute fallback
   * @returns {Bracket}
   */
  Standings.nflPlayoffField = function (season, league, rng) {
    var N = Tuning.schedule.nfl;
    var rows = rowsFor(season, league, rng);
    var tm = teamMap(league);
    var confs = confOrder(league);
    var weeks = N.playoffWeeks;
    var Data = RTG.Data || {};
    var hosts = Data.championshipHosts || [];
    var host = hosts.length ? hosts[mod(season.year, hosts.length)] : null;
    var champName = (Data.nflStructure && Data.nflStructure.championshipName) || 'The Championship Bowl';
    var hostTeam = host && tm[host.teamId] ? tm[host.teamId] : null;
    var site = host ? {
      id: 'champ-' + season.year, name: champName, city: host.city, state: '',
      climate: host.climate || (hostTeam ? hostTeam.climate : 'dome'), dome: !!host.dome,
      altitude: hostTeam ? !!hostTeam.altitude : false, windy: false, rainy: false
    } : { id: 'champ-' + season.year, name: champName, city: '', state: '', climate: 'dome', dome: true, altitude: false, windy: false, rainy: false };
    var bracket = {
      league: 'NFL', year: season.year, name: champName,
      seeds: [], byes: [],
      rounds: makeRounds([
        { name: 'WC', week: weeks[0], kind: 'WC' },
        { name: 'DIV', week: weeks[1], kind: 'DIV' },
        { name: 'CONF', week: weeks[2], kind: 'CONF' },
        { name: 'CHAMP', week: weeks[3], kind: 'CHAMP' }
      ]),
      roundIdx: 0, championId: null, complete: false,
      venues: { champ: { type: 'NEUTRAL', id: site.id, name: champName, hostTeamId: hostTeam ? hostTeam.id : null, site: site } }
    };
    var r0 = bracket.rounds[0];
    for (var c = 0; c < confs.length; c++) {
      var confSeeds = [];
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (row.conf !== confs[c] || !row.seed) continue;
        confSeeds.push({
          seed: row.seed, teamId: row.teamId, conf: row.conf, champion: row.divChamp, autoBid: row.divChamp,
          rank: row.confRank, alive: true, exitRound: null, won: false
        });
      }
      confSeeds.sort(function (a, b) { return a.seed - b.seed; });
      bracket.seeds = bracket.seeds.concat(confSeeds);
      if (confSeeds.length) bracket.byes.push(confSeeds[0].teamId);
      // Seed k (k = 2 .. (n+1)/2) hosts seed n+2−k → 2v7, 3v6, 4v5 at the higher seed.
      var n = confSeeds.length;
      for (var k = 2; k <= Math.floor((n + 1) / 2); k++) {
        var hi = confSeeds[k - 1], lo = confSeeds[n + 1 - k];
        if (!hi || !lo || hi === lo) continue;
        r0.games.push(makeMatchup('N', season.year, r0, hi, lo, homeVenue(tm[hi.teamId]), tm));
      }
    }
    return bracket;
  };

  // ═══════════════════════════════ bracket advancement ═══════════════════════════════

  /**
   * Normalise `results` into gameId → {home, away, winnerId}.
   * Accepts: an array of Games (`{id, played, score}` — e.g. `season.schedule`),
   * or a map gameId → {home, away} score, or gameId → winner teamId.
   */
  function normaliseResults(results, bracket) {
    var out = {};
    var i, g;
    var byId = {};
    for (i = 0; i < bracket.rounds.length; i++) for (var j = 0; j < bracket.rounds[i].games.length; j++) byId[bracket.rounds[i].games[j].id] = bracket.rounds[i].games[j];
    if (Array.isArray(results)) {
      for (i = 0; i < results.length; i++) {
        g = results[i];
        if (!g || !byId[g.id] || !g.score || g.played === false) continue;
        out[g.id] = { home: g.score.home, away: g.score.away, winnerId: g.score.home >= g.score.away ? byId[g.id].homeId : byId[g.id].awayId };
      }
    } else if (results && typeof results === 'object') {
      for (var id in results) {
        var m = byId[id];
        if (!m) continue;
        var v = results[id];
        if (typeof v === 'string') out[id] = { home: null, away: null, winnerId: v };
        else if (v && typeof v.home === 'number') out[id] = { home: v.home, away: v.away, winnerId: v.home >= v.away ? m.homeId : m.awayId };
        else if (v && typeof v.winnerId === 'string') out[id] = { home: null, away: null, winnerId: v.winnerId };
      }
    }
    return out;
  }

  /** Alive seed entries of a bracket (optionally one conference), best seed first. */
  function aliveSeeds(bracket, conf) {
    return bracket.seeds.filter(function (s) { return s.alive && (conf === undefined || s.conf === conf); })
      .sort(function (a, b) { return a.seed - b.seed; });
  }

  /** Fill the next round of a college bracket from the surviving seeds. */
  function fillCollegeRound(bracket, round, tm) {
    var alive = aliveSeeds(bracket);
    var n = alive.length;
    var k;
    if (round.name === 'QF') {
      // Fixed bracket: bye seed k (1..4) meets the winner of first-round game (byes − k),
      // i.e. 1 vs (8/9), 2 vs (7/10), 3 vs (6/11), 4 vs (5/12).
      var byes = bracket.byes.map(function (id) { return seedOf(bracket, id); });
      var first = bracket.rounds[0].games;
      for (k = 0; k < byes.length; k++) {
        var fr = first[byes.length - 1 - k];
        var opp = fr && fr.winnerId ? seedOf(bracket, fr.winnerId) : null;
        if (!byes[k] || !opp) continue;
        round.games.push(makeMatchup('C', bracket.year, round, byes[k], opp, bracket.venues.qf[k], tm));
      }
    } else if (round.name === 'SF') {
      // Winners of QF k meet: (QF0 vs QF3), (QF1 vs QF2) — by higher-seed position in the previous round.
      var prev = bracket.rounds[1].games;
      var pairs = [[0, 3], [1, 2]];
      for (k = 0; k < pairs.length; k++) {
        var a = prev[pairs[k][0]] && seedOf(bracket, prev[pairs[k][0]].winnerId);
        var b = prev[pairs[k][1]] && seedOf(bracket, prev[pairs[k][1]].winnerId);
        if (!a || !b) continue;
        var hi = a.seed <= b.seed ? a : b, lo = hi === a ? b : a;
        round.games.push(makeMatchup('C', bracket.year, round, hi, lo, bracket.venues.sf[k], tm));
      }
    } else if (round.name === 'TITLE') {
      if (n >= 2) round.games.push(makeMatchup('C', bracket.year, round, alive[0], alive[1], bracket.venues.title, tm));
    }
  }

  /** Fill the next round of an NFL bracket (re-seeding: 1 vs lowest remaining). */
  function fillNflRound(bracket, round, tm) {
    var confs = [];
    for (var i = 0; i < bracket.seeds.length; i++) if (confs.indexOf(bracket.seeds[i].conf) < 0) confs.push(bracket.seeds[i].conf);
    if (round.name === 'CHAMP') {
      var finalists = aliveSeeds(bracket);
      if (finalists.length >= 2) {
        // Conference order decides the listed "home" side of the neutral final.
        finalists.sort(function (a, b) { return confs.indexOf(a.conf) - confs.indexOf(b.conf); });
        round.games.push(makeMatchup('N', bracket.year, round, finalists[0], finalists[1], bracket.venues.champ, tm));
      }
      return;
    }
    for (var c = 0; c < confs.length; c++) {
      var alive = aliveSeeds(bracket, confs[c]);
      // Re-seed: best plays worst, then next best plays next worst, at the higher seed.
      var lo = 0, hi = alive.length - 1;
      while (lo < hi) {
        round.games.push(makeMatchup('N', bracket.year, round, alive[lo], alive[hi], homeVenue(tm[alive[lo].teamId]), tm));
        lo++; hi--;
      }
    }
  }

  /**
   * Apply results to the current round and, when it is complete, build the
   * next one (college: fixed bracket; NFL: re-seeded — the 1 seed plays the
   * lowest remaining seed). Losers get `alive=false, exitRound=<round name>`;
   * the last team standing becomes `championId`. Mutates and returns `bracket`.
   * Get the new round's schedule-ready Games with `roundGames(bracket)`.
   * @param {Bracket} bracket
   * @param {Game[]|Object<string, {home:number, away:number}|string>} results played Games
   *        (e.g. `season.schedule`), or gameId → score / winner teamId
   * @param {League} [league] needed to build later rounds (team lookups); when
   *        omitted, `RTG.Data` is used to resolve abbreviations by team id
   * @returns {Bracket}
   */
  Standings.advanceBracket = function (bracket, results, league) {
    if (!bracket || bracket.complete) return bracket;
    var tm = league ? teamMap(league) : dataTeamMap(bracket.league);
    var res = normaliseResults(results, bracket);
    var progressed = true;
    while (progressed && !bracket.complete) {
      progressed = false;
      var round = bracket.rounds[bracket.roundIdx];
      if (!round) { bracket.complete = true; break; }
      if (!round.games.length) {
        // Round not built yet (e.g. bracket loaded from an older save): build it now.
        if (bracket.league === 'NFL') fillNflRound(bracket, round, tm); else fillCollegeRound(bracket, round, tm);
        if (!round.games.length) { bracket.complete = true; break; }
      }
      var allDone = true;
      for (var i = 0; i < round.games.length; i++) {
        var m = round.games[i];
        if (m.winnerId) continue;
        var r = res[m.id];
        if (!r) { allDone = false; continue; }
        m.winnerId = r.winnerId;
        m.score = typeof r.home === 'number' ? { home: r.home, away: r.away } : null;
        var loserId = r.winnerId === m.homeId ? m.awayId : m.homeId;
        var loser = seedOf(bracket, loserId);
        if (loser) { loser.alive = false; loser.exitRound = round.name; }
        var winner = seedOf(bracket, m.winnerId);
        if (winner) winner.won = true;
      }
      if (!allDone) break;
      round.complete = true;
      if (bracket.roundIdx === bracket.rounds.length - 1) {
        var alive = aliveSeeds(bracket);
        if (alive.length === 1) bracket.championId = alive[0].teamId;
        bracket.complete = true;
        break;
      }
      bracket.roundIdx++;
      var next = bracket.rounds[bracket.roundIdx];
      if (bracket.league === 'NFL') fillNflRound(bracket, next, tm); else fillCollegeRound(bracket, next, tm);
      progressed = true;
    }
    return bracket;
  };

  /** Team lookup from RTG.Data when no League is passed (id → {id, abbr, name, conf}). */
  function dataTeamMap(kind) {
    var Data = RTG.Data || {};
    var rows = kind === 'NFL' ? (Data.nfl || []) : (Data.colleges || []);
    var m = {};
    for (var i = 0; i < rows.length; i++) m[rows[i].id] = rows[i];
    return m;
  }

  /**
   * Schedule-ready Games for a bracket round (default: the current round).
   * Games whose matchup already has a winner are still returned (the caller
   * de-duplicates against `season.schedule` by id).
   * @param {Bracket} bracket @param {number} [roundIdx=bracket.roundIdx] @param {League} [league]
   * @returns {Game[]}
   */
  Standings.roundGames = function (bracket, roundIdx, league) {
    var idx = typeof roundIdx === 'number' ? roundIdx : bracket.roundIdx;
    var round = bracket.rounds[idx];
    if (!round) return [];
    var tm = league ? teamMap(league) : dataTeamMap(bracket.league);
    var letter = bracket.league === 'NFL' ? 'N' : 'C';
    return round.games.map(function (m) { return gameFromMatchup(letter, bracket.year, m, tm); });
  };

  /**
   * Alive team ids of a bracket (optionally one conference), best seed first.
   * @param {Bracket} bracket @param {string} [conf] @returns {string[]}
   */
  Standings.aliveTeams = function (bracket, conf) {
    return aliveSeeds(bracket, conf).map(function (s) { return s.teamId; });
  };

  /**
   * The bracket matchup a team plays in the current round, or null (bye / out).
   * @param {Bracket} bracket @param {string} teamId @returns {Matchup|null}
   */
  Standings.bracketGameFor = function (bracket, teamId) {
    var round = bracket && bracket.rounds[bracket.roundIdx];
    if (!round) return null;
    for (var i = 0; i < round.games.length; i++) {
      var m = round.games[i];
      if (!m.winnerId && (m.homeId === teamId || m.awayId === teamId)) return m;
    }
    return null;
  };

  // ═══════════════════════════════ draft order ═══════════════════════════════

  /**
   * Draft order (§2.6.2): non-playoff teams by record, worst first (ties: point
   * differential, then the seeded coin), then playoff teams by exit round
   * (earliest exit first; within a round worse record first), the champion last.
   * Teams still alive in an unfinished bracket come after the eliminated ones.
   * @param {SeasonState} season @param {League} league
   * @param {RNG} [rng] seeded coin (forked as 'tiebreak'); deterministic hash when omitted
   * @returns {string[]} teamIds, pick 1 first
   */
  Standings.draftOrder = function (season, league, rng) {
    var coin = makeCoin(rng);
    var bracket = season.playoffs;
    var roundOrder = bracket ? bracket.rounds.map(function (r) { return r.name; }) : [];
    var exitIdx = {};        // teamId → exit round index (alive: rounds.length; champion: rounds.length + 1)
    if (bracket) {
      for (var i = 0; i < bracket.seeds.length; i++) {
        var s = bracket.seeds[i];
        if (s.teamId === bracket.championId) exitIdx[s.teamId] = roundOrder.length + 1;
        else if (s.alive) exitIdx[s.teamId] = roundOrder.length;
        else exitIdx[s.teamId] = Math.max(0, roundOrder.indexOf(s.exitRound));
      }
    }
    var ids = league.teams.map(function (t) { return t.id; });
    var key = function (id) {
      var r = resultOf(season, id);
      return { tier: exitIdx[id] === undefined ? -1 : exitIdx[id], pct: pct(r.w, r.l, r.t), diff: r.pf - r.pa };
    };
    ids.sort(function (a, b) {
      var ka = key(a), kb = key(b);
      if (ka.tier !== kb.tier) return ka.tier - kb.tier;
      if (Math.abs(ka.pct - kb.pct) > EPS) return ka.pct - kb.pct;
      if (ka.diff !== kb.diff) return ka.diff - kb.diff;
      return a < b ? -1 : 1;                 // provisional; true ties are coin-flipped below
    });
    // Coin-flip runs that are still tied after record and point differential (fixed order).
    var out = [];
    var i2 = 0;
    while (i2 < ids.length) {
      var j = i2 + 1;
      var k0 = key(ids[i2]);
      while (j < ids.length) {
        var kj = key(ids[j]);
        if (kj.tier !== k0.tier || Math.abs(kj.pct - k0.pct) > EPS || kj.diff !== k0.diff) break;
        j++;
      }
      var run = ids.slice(i2, j);
      if (run.length > 1) run = coinOrder(run, { coin: coin, note: function () {} });
      out = out.concat(run);
      i2 = j;
    }
    return out;
  };

  // ═══════════════════════════════ misc queries ═══════════════════════════════

  /**
   * Rows of one conference (and optionally division), in standings order.
   * @param {StandingRow[]} rows @param {string} conf @param {string} [div] @returns {StandingRow[]}
   */
  Standings.rowsIn = function (rows, conf, div) {
    return rows.filter(function (r) { return r.conf === conf && (div === undefined || r.div === div); })
      .sort(function (a, b) { return div === undefined ? a.confRank - b.confRank : a.divRank - b.divRank; });
  };

  /**
   * Top-N poll slice, best first.
   * @param {Object<string, {score, rank, prev}>} rankings @param {number} [n=25]
   * @returns {{teamId:string, rank:number, prev:number, score:number}[]}
   */
  Standings.topN = function (rankings, n) {
    var list = [];
    for (var id in rankings) list.push({ teamId: id, rank: rankings[id].rank, prev: rankings[id].prev, score: rankings[id].score });
    list.sort(function (a, b) { return a.rank - b.rank; });
    return list.slice(0, n || 25);
  };

  RTG.Standings = Standings;
})(typeof window !== 'undefined' ? window : globalThis);
