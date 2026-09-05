/**
 * Road to Glory: Kicker — RTG.Awards (SPEC §3.5.13, §2.8 awards, §2.7.3 season goals, §2.7.9 HOF)
 *
 * Season awards computed at the AWARDS phase from the simulated stats of every kicker in the
 * user's league (`season.kickerStats`) plus the user's own `stats.season`; the weekly ST award;
 * the three preseason goals; and the Hall-of-Fame score / verdict / legacy tier.
 *
 * RNG: `compute` draws exactly once, and only when two candidates tie on every ranking key;
 * `seasonGoals` draws 3 times (one jitter per goal); everything else is rng-free.
 * Schema / Data / Player / Stats are resolved AT CALL TIME.
 *
 * State extensions (JSON-safe, optional): season.weeklyPrev (kicker-score snapshot for the weekly
 * delta), season.awardsComputed (idempotency), goal.awarded (goal XP granted once).
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  var Util = RTG.Util, Tuning = RTG.Tuning;
  var Awards = {};

  // ═══════════════════════════════ helpers ═══════════════════════════════

  function TA() { return Tuning.awards; }
  function schema() { return RTG.Schema; }
  function num(v, d) { return typeof v === 'number' && v === v ? v : d; }
  function has(arr, v) { return Array.isArray(arr) && arr.indexOf(v) >= 0; }

  /** Catalog row for an award id (Data.awards when loaded; else a synthetic row from Tuning). */
  function catalogRow(id) {
    var D = RTG.Data && RTG.Data.awardsById;
    if (D && D[id]) return D[id];
    var r = TA().rewards[id] || { xp: 0, fame: 0 };
    return { id: id, name: id.replace(/_/g, ' '), xp: r.xp, fame: r.fame };
  }

  /** {xp, fame} for an award id — Tuning first, catalog as fallback. */
  function rewardFor(id) {
    var r = TA().rewards[id];
    if (r) return { xp: num(r.xp, 0), fame: num(r.fame, 0) };
    var row = catalogRow(id);
    return { xp: num(row.xp, 0), fame: num(row.fame, 0) };
  }

  function xpMult(state) {
    var d = Tuning.difficulty[state.difficulty];
    return d ? num(d.xpMult, 1) : 1;
  }

  function fgPct(s) { return s && s.fga ? s.fgm / s.fga : 0; }

  function ovrOf(attrs) {
    if (RTG.Player && typeof RTG.Player.ovr === 'function') return RTG.Player.ovr(attrs);
    var W = Tuning.progression.ovrWeights, s = 0;
    for (var k in W) if (Object.prototype.hasOwnProperty.call(W, k)) s += W[k] * num(attrs[k], 0);
    return Math.round(s);
  }

  function leagueObj(state, kind) {
    var S = schema();
    return S && typeof S.leagueOf === 'function' ? S.leagueOf(state, kind) : (state.leagues ? (kind === 'NFL' ? state.leagues.nfl : state.leagues.college) : null);
  }

  function teamIn(league, id) {
    var S = schema();
    if (S && typeof S.teamIn === 'function') return S.teamIn(league, id);
    if (!league) return null;
    for (var i = 0; i < league.teams.length; i++) if (league.teams[i].id === id) return league.teams[i];
    return null;
  }

  /**
   * Kicker score (§2.8): FGM·3 + FG%·40 + long/10 + clutchMakes·4 + made50plus·2 + gameWinners·6.
   * @param {KickerStats} s @param {boolean} [ignoreMin] compute even below the minimum attempts
   * @returns {number|null} null when below Tuning.awards.kickerScore.minFga
   */
  Awards.kickerScore = function (s, ignoreMin) {
    if (!s) return null;
    var K = TA().kickerScore;
    if (!ignoreMin && num(s.fga, 0) < K.minFga) return null;
    var v = num(s.fgm, 0) * K.fgm + fgPct(s) * K.fgPct + num(s.long, 0) / K.longDiv
      + num(s.clutchM, 0) * K.clutch + num(s.made50plus, 0) * K.fifty + num(s.gameWinners, 0) * K.gw;
    return Util.roundN(v, 2);
  };

  // ═══════════════════════════════ candidates & ranking ═══════════════════════════════

  /**
   * Every kicker of the active league this season: AI entries from season.kickerStats and the
   * user (using stats.season). The user's team entry in kickerStats is skipped while the user is
   * on that team's roster (it holds a backup's kicks).
   * @param {CareerState} state
   * @returns {Array<{teamId:string, conf:string, name:string, isUser:boolean, stats:KickerStats, score:number|null}>}
   */
  function candidates(state) {
    var season = state.season, p = state.player;
    var league = leagueObj(state, season.league);
    var list = [];
    var userIn = p.league === season.league && !!p.teamId && p.role !== 'NONE';
    var ks = season.kickerStats || {};
    for (var teamId in ks) {
      if (!Object.prototype.hasOwnProperty.call(ks, teamId)) continue;
      if (userIn && teamId === p.teamId) continue;
      var team = teamIn(league, teamId);
      if (!team) continue;
      list.push({ teamId: teamId, conf: team.conf || '', name: team.kicker ? team.kicker.name : (team.abbr + ' K'), isUser: false, stats: ks[teamId], score: Awards.kickerScore(ks[teamId]) });
    }
    if (userIn) {
      var ut = teamIn(league, p.teamId);
      list.push({ teamId: p.teamId, conf: ut ? ut.conf || '' : '', name: p.name.full, isUser: true, stats: state.stats.season, score: Awards.kickerScore(state.stats.season) });
    }
    return list;
  }

  /**
   * Eligible candidates sorted best first: score, then FGM, then FG%, then (exact ties only) a
   * salted hash of the team id. The salt is the single rng draw (only when a tie exists).
   */
  function rank(cands, rng) {
    var el = [];
    for (var i = 0; i < cands.length; i++) if (cands[i].score !== null) el.push(cands[i]);
    var tie = false;
    for (var a = 0; a < el.length && !tie; a++) for (var b = a + 1; b < el.length; b++) {
      if (el[a].score === el[b].score && el[a].stats.fgm === el[b].stats.fgm && fgPct(el[a].stats) === fgPct(el[b].stats)) { tie = true; break; }
    }
    var salt = tie && rng ? String(rng.next()) : '0';         // 1 draw, only on an exact tie
    el.sort(function (x, y) {
      if (y.score !== x.score) return y.score - x.score;
      if (y.stats.fgm !== x.stats.fgm) return y.stats.fgm - x.stats.fgm;
      var px = fgPct(x.stats), py = fgPct(y.stats);
      if (py !== px) return py - px;
      return Util.fnv1a32(x.teamId + ':' + salt) - Util.fnv1a32(y.teamId + ':' + salt);
    });
    return el;
  }

  function groupByConf(list) {
    var out = {}, order = [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i].conf || '';
      if (!out[c]) { out[c] = []; order.push(c); }
      out[c].push(list[i]);
    }
    return { groups: out, order: order };
  }

  // ═══════════════════════════════ granting ═══════════════════════════════

  /**
   * Build an award for a candidate; for the user also apply XP (× difficulty xpMult) and fame,
   * append `{year, league, id, name, teamId}` to history.awards and a timeline entry.
   * @returns {Object} the award (with kickerName / isUser for the awards screen)
   */
  function grant(state, id, cand, extra) {
    var row = catalogRow(id), rw = rewardFor(id);
    var award = { year: state.year, league: state.season.league, id: id, name: row.name, teamId: cand ? cand.teamId : null,
      kickerName: cand ? cand.name : null, isUser: !!(cand && cand.isUser), xp: rw.xp, fame: rw.fame };
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) award[k] = extra[k];
    if (award.isUser) applyUserReward(state, award, rw, extra && extra.week);
    return award;
  }

  function applyUserReward(state, award, rw, week) {
    var p = state.player;
    p.xp = num(p.xp, 0) + Math.round(rw.xp * xpMult(state));
    p.fame = Util.clamp(Util.round1(num(p.fame, 0) + rw.fame), 0, Tuning.soft.fame.max);
    var rec = { year: award.year, league: award.league, id: award.id, name: award.name, teamId: award.teamId };
    if (week) rec.week = week;
    state.history.awards.push(rec);
    if (Array.isArray(state.history.timeline)) {
      state.history.timeline.push({ year: state.year, week: state.week, kind: 'AWARD', text: award.name, impact: week ? TA().weeklyImpact : TA().awardImpact, teamId: award.teamId });
      while (state.history.timeline.length > Tuning.save.timelineCap) state.history.timeline.shift();
    }
  }

  /** Candidates with a decisive made kick in a given postseason game their team won. */
  function decisiveGameWinners(state, cands, gameKind) {
    var out = [];
    var games = state.season.schedule || [];
    for (var i = 0; i < games.length; i++) {
      var g = games[i];
      if (g.kind !== gameKind || !g.played || !g.score) continue;
      var winner = g.score.home > g.score.away ? g.homeId : (g.score.away > g.score.home ? g.awayId : null);
      if (!winner) continue;
      for (var c = 0; c < cands.length; c++) {
        if (cands[c].teamId !== winner) continue;
        if (has(cands[c].stats.decisiveMakeWeeks, g.week)) out.push({ cand: cands[c], game: g });
      }
    }
    return out;
  }

  /** Best candidate by a numeric key of their stats (ties → earlier in `order`). */
  function bestBy(order, all, key) {
    var best = null, bestV = 0;
    var seen = {};
    var lists = [order, all];
    for (var l = 0; l < lists.length; l++) for (var i = 0; i < lists[l].length; i++) {
      var c = lists[l][i];
      if (seen[c.teamId + (c.isUser ? 'u' : '')]) continue;
      seen[c.teamId + (c.isUser ? 'u' : '')] = true;
      var v = num(c.stats[key], 0);
      if (v > bestV) { bestV = v; best = c; }
    }
    return best;
  }

  /** Is this the user's first college season (no completed COLLEGE season line yet)? */
  function isFreshman(state) {
    var hs = state.history.seasons || [];
    for (var i = 0; i < hs.length; i++) if (hs[i].league === 'COLLEGE') return false;
    return !state.player.redshirt;
  }

  /** Weeks the user missed through injury this season (set by Player/Season; several spellings accepted). */
  function injuryWeeks(state) {
    var f = state.flags || {}, pf = state.player.flags || {};
    return Math.max(num(f.seasonInjuryWeeks, 0), num(pf.seasonInjuryWeeks, 0), num(f.injuryWeeksThisSeason, 0));
  }

  // ═══════════════════════════════ compute ═══════════════════════════════

  /**
   * Compute every §2.8 award for the season that just ended. Winners can be AI kickers; the user's
   * awards apply XP / fame and land in history.awards. Met season goals are returned (and paid)
   * as SEASON_GOAL_n entries but are not stored in history.awards. When STPOY has no qualifier a
   * `{id:'STPOY', note:true}` entry says "a punter won it". Idempotent per season
   * (season.awardsComputed). RNG: 1 draw only when candidates tie exactly.
   * @param {CareerState} state @param {RNG} rng
   * @returns {Object[]} awards for the awards screen
   */
  Awards.compute = function (state, rng) {
    var season = state.season;
    if (!season || season.awardsComputed) return [];
    var out = [];
    var kind = season.league;
    var cands = candidates(state);
    var ranked = rank(cands, rng);
    var conf = groupByConf(ranked);
    var i, c, hits;

    if (kind === 'COLLEGE') {
      if (ranked[0]) { out.push(grant(state, 'GOLDEN_BOOT', ranked[0])); out.push(grant(state, 'ALL_AMERICAN_1', ranked[0])); }
      for (i = 1; i <= 2 && i < ranked.length; i++) out.push(grant(state, 'ALL_AMERICAN_2', ranked[i], { rank: i + 1 }));
      for (i = 0; i < conf.order.length; i++) { c = conf.order[i]; out.push(grant(state, 'ALL_CONF_1', conf.groups[c][0], { conf: c })); }
      var user = null;
      for (i = 0; i < ranked.length; i++) if (ranked[i].isUser) user = ranked[i];
      if (user && isFreshman(state)) out.push(grant(state, 'FRESHMAN_LEG', user));
      var longest = bestBy(ranked, cands, 'long');
      if (longest && longest.stats.fgm >= TA().longestMinFga) out.push(grant(state, 'IRON_LEG_COLLEGE', longest, { value: longest.stats.long }));
      var clutch = bestBy(ranked, cands, 'clutchBest');
      if (clutch) out.push(grant(state, 'CLUTCH_KICK_COLLEGE', clutch, { value: clutch.stats.clutchBest, distance: clutch.stats.clutchBestDist }));
      hits = decisiveGameWinners(state, cands, 'CCG');
      for (i = 0; i < hits.length; i++) out.push(grant(state, 'CCG_MVP', hits[i].cand, { gameId: hits[i].game.id }));
      hits = decisiveGameWinners(state, cands, 'CHAMP');
      for (i = 0; i < hits.length; i++) out.push(grant(state, 'NATIONAL_MVP', hits[i].cand, { gameId: hits[i].game.id }));
    } else {
      if (ranked[0]) { out.push(grant(state, 'GOLDEN_LEG', ranked[0])); out.push(grant(state, 'ALL_LEAGUE_1', ranked[0])); }
      if (ranked[1]) out.push(grant(state, 'ALL_LEAGUE_2', ranked[1]));
      var perConf = TA().proClassicPerConf;
      for (i = 0; i < conf.order.length; i++) {
        c = conf.order[i];
        for (var j = 0; j < perConf && j < conf.groups[c].length; j++) out.push(grant(state, 'PRO_CLASSIC', conf.groups[c][j], { conf: c }));
      }
      var ST = TA().stpoy;
      if (ranked[0] && ranked[0].stats.gameWinners >= ST.minGw && (!ranked[1] || ranked[0].score >= ST.ratio * ranked[1].score)) {
        out.push(grant(state, 'STPOY', ranked[0]));
      } else {
        out.push({ year: state.year, league: kind, id: 'STPOY', name: catalogRow('STPOY').name, teamId: null, kickerName: 'a punter', isUser: false, note: true, xp: 0, fame: 0 });
      }
      var longestN = bestBy(ranked, cands, 'long');
      if (longestN && longestN.stats.fgm >= TA().longestMinFga) out.push(grant(state, 'IRON_LEG_NFL', longestN, { value: longestN.stats.long }));
      var clutchN = bestBy(ranked, cands, 'clutchBest');
      if (clutchN) out.push(grant(state, 'CLUTCH_KICK_NFL', clutchN, { value: clutchN.stats.clutchBest, distance: clutchN.stats.clutchBestDist }));
      hits = decisiveGameWinners(state, cands, 'CHAMP');
      for (i = 0; i < hits.length; i++) out.push(grant(state, 'CHAMPIONSHIP_MVP', hits[i].cand, { gameId: hits[i].game.id }));
      var CB = TA().comeback;
      for (i = 0; i < cands.length; i++) if (cands[i].isUser) {
        var us = cands[i].stats;
        if (injuryWeeks(state) >= CB.injuryWeeks && us.fga >= TA().kickerScore.minFga && fgPct(us) >= CB.minFgPct) out.push(grant(state, 'COMEBACK_LEG', cands[i]));
      }
    }

    // season goals (§2.7.3): XP once per met goal
    var goals = Awards.checkGoals(state);
    for (i = 0; i < goals.length; i++) {
      var g = goals[i];
      if (!g.met || g.awarded) continue;
      g.awarded = true;
      state.player.xp = num(state.player.xp, 0) + Math.round(num(g.xp, 0) * xpMult(state));
      var gid = 'SEASON_GOAL_' + (i + 1);
      out.push({ year: state.year, league: kind, id: gid, name: catalogRow(gid).name, teamId: state.player.teamId || null,
        kickerName: state.player.name.full, isUser: true, goal: true, goalId: g.id, text: g.text, xp: g.xp, fame: 0 });
    }

    season.awardsComputed = true;
    return out;
  };

  // ═══════════════════════════════ weekly ═══════════════════════════════

  /**
   * ST Player of the Week: best kicker-score gain since the last call among the kickers of the
   * user's conference (min Tuning.awards.weeklyMinFgm FGM this week). Stores the snapshot in
   * season.weeklyPrev. Returns the award only when the USER wins it (XP / fame applied,
   * history.awards entry carries `week`); otherwise null.
   * @param {CareerState} state @returns {Object|null}
   */
  Awards.weekly = function (state) {
    var season = state.season;
    if (!season) return null;
    var prev = season.weeklyPrev || {};
    var cands = candidates(state);
    var cur = {};
    var userConf = null, i;
    for (i = 0; i < cands.length; i++) if (cands[i].isUser) userConf = cands[i].conf;
    var best = null, bestDelta = -Infinity;
    for (i = 0; i < cands.length; i++) {
      var c = cands[i];
      var key = c.isUser ? 'user' : c.teamId;
      var score = Awards.kickerScore(c.stats, true);
      var p = prev[key] || { score: 0, fgm: 0 };
      cur[key] = { score: score, fgm: num(c.stats.fgm, 0) };
      if (userConf !== null && c.conf !== userConf) continue;
      var wkFgm = num(c.stats.fgm, 0) - num(p.fgm, 0);
      var delta = score - num(p.score, 0);
      if (wkFgm < TA().weeklyMinFgm) continue;
      if (delta > bestDelta) { bestDelta = delta; best = c; }
    }
    season.weeklyPrev = cur;
    if (!best || !best.isUser) return null;
    return grant(state, 'ST_PLAYER_OF_WEEK', best, { week: state.week, delta: Util.roundN(bestDelta, 2) });
  };

  // ═══════════════════════════════ season goals ═══════════════════════════════

  function meanRating(league) {
    if (!league || !league.teams.length) return Tuning.league.drift.nflAnchor;
    var s = 0;
    for (var i = 0; i < league.teams.length; i++) s += (num(league.teams[i].OFF, 70) + num(league.teams[i].DEF, 70)) / 2;
    return s / league.teams.length;
  }

  /**
   * Set the three preseason goals (§2.7.3) on season.goals: team wins (scaled to the team's
   * rating vs the league mean), personal FG% (scaled to OVR) and a Fan Approval target.
   * RNG: exactly 3 draws (wins jitter int, FG% jitter float, fans jitter int).
   * @param {CareerState} state @param {RNG} rng
   * @returns {Array<{id:string, text:string, target:number, progress:number, met:boolean, xp:number}>}
   */
  Awards.seasonGoals = function (state, rng) {
    var G = TA().goals, xp = TA().goalXp;
    var p = state.player, season = state.season;
    var kind = season ? season.league : p.league;
    var league = leagueObj(state, kind);
    var team = teamIn(league, p.teamId);
    var games = kind === 'NFL' ? Tuning.schedule.nfl.games : Tuning.schedule.college.confGames + Tuning.schedule.college.nonConfGames;

    // 1. team wins
    var rating = team ? (num(team.OFF, 70) + num(team.DEF, 70)) / 2 : meanRating(league);
    var expPct = Util.clamp(G.wins.base + (rating - meanRating(league)) / G.wins.perRating, G.wins.min, G.wins.max);
    var jitterW = rng.int(G.wins.jitter[0], G.wins.jitter[1]);                                  // draw 1
    var winsTarget = Util.clamp(Math.round(games * expPct * G.wins.scale) + jitterW, G.wins.floor, games - G.wins.ceilBelowGames);

    // 2. personal FG%
    var ovr = ovrOf(p.attrs);
    var jitterF = rng.float(-G.fgPct.jitter, G.fgPct.jitter);                                    // draw 2
    var fgTarget = Util.clamp(G.fgPct.base + G.fgPct.perOvr * (ovr - G.fgPct.ovrAnchor) + jitterF, G.fgPct.min, G.fgPct.max);
    fgTarget = Math.round(fgTarget / G.fgPct.step) * G.fgPct.step;
    fgTarget = Util.roundN(fgTarget, 2);

    // 3. fans
    var jitterFans = rng.int(-G.fans.jitter, G.fans.jitter);                                    // draw 3
    var fansTarget = Math.min(G.fans.max, Math.round(num(p.fans, 50) + G.fans.gain + jitterFans));

    var goals = [
      { id: 'TEAM_WINS', text: 'Win ' + winsTarget + ' games', target: winsTarget, progress: 0, met: false, xp: xp[0] },
      { id: 'FG_PCT', text: 'Kick ' + Math.round(fgTarget * 100) + ' % or better', target: fgTarget, progress: 0, met: false, xp: xp[1] },
      { id: 'FANS', text: 'Reach ' + fansTarget + ' Fan Approval', target: fansTarget, progress: num(p.fans, 50), met: false, xp: xp[2] }
    ];
    if (season) season.goals = goals;
    return goals;
  };

  /**
   * Refresh goal progress / met flags from the current state (team wins from season.results,
   * FG% from stats.season with a minimum of Tuning.awards.goals.fgPct.minFga attempts, fans from
   * the player). Once met a goal stays met.
   * @param {CareerState} state @returns {Object[]} season.goals
   */
  Awards.checkGoals = function (state) {
    var season = state.season, p = state.player;
    var goals = (season && season.goals) || [];
    var G = TA().goals;
    for (var i = 0; i < goals.length; i++) {
      var g = goals[i];
      if (g.id === 'TEAM_WINS') {
        var r = season.results && p.teamId ? season.results[p.teamId] : null;
        g.progress = r ? num(r.w, 0) : 0;
        if (g.progress >= g.target) g.met = true;
      } else if (g.id === 'FG_PCT') {
        var s = state.stats.season;
        g.progress = Util.roundN(fgPct(s), 3);
        if (num(s.fga, 0) >= G.fgPct.minFga && g.progress >= g.target) g.met = true;
      } else if (g.id === 'FANS') {
        g.progress = num(p.fans, 0);
        if (g.progress >= g.target) g.met = true;
      }
    }
    return goals;
  };

  // ═══════════════════════════════ Hall of Fame ═══════════════════════════════

  function countAwards(state, id) {
    var n = 0, a = state.history.awards || [];
    for (var i = 0; i < a.length; i++) if (a[i].id === id) n++;
    return n;
  }

  function hasFlag(state, key) {
    var f = state.flags || {}, pf = state.player.flags || {};
    if (f[key] || pf[key]) return true;
    var cs = state.history.contracts || [];
    for (var i = 0; i < cs.length; i++) if (cs[i].type === key) return true;
    return false;
  }

  /**
   * Hall-of-Fame score, verdict and legacy tier (§2.7.9). NFL-only inputs: stats.nfl, NFL season
   * lines (championships, seasons as K1), NFL awards and NFL records held.
   *   HOF = 0.8·FGM + 3·50+ + 2·pts/100 + 12·GW + 25·AL1 + 12·AL2 + 35·STPOY + 30·titles + 60·title kicks
   *       + 15·starter seasons + 40·(FG% ≥ 88 % with ≥ 300 FGA) + 20·records, × 1.15 WALKON × 1.10 UDFA
   * @param {CareerState} state
   * @returns {{score:number, verdict:'FIRST_BALLOT'|'INDUCTED'|'FINALIST'|'NOT_ON_BALLOT', tier:string, breakdown:Array<{key:string, label:string, count:number, weight:number, points:number}>, base:number, multiplier:number, inductionYear:number|null}}
   */
  Awards.hofScore = function (state) {
    var H = Tuning.hof, W = H.weights;
    var st = (state.stats && state.stats.nfl) || { fga: 0, fgm: 0, pts: 0, made50plus: 0, gameWinners: 0 };
    var seasons = state.history.seasons || [];
    var titles = 0, starter = 0;
    for (var i = 0; i < seasons.length; i++) {
      if (seasons[i].league !== 'NFL') continue;
      if (seasons[i].champion) titles++;
      if (seasons[i].role === 'K1') starter++;
    }
    var recs = 0, rn = (state.records && state.records.nfl) || {};
    for (var k in rn) if (Object.prototype.hasOwnProperty.call(rn, k) && rn[k].isUser) recs++;
    var pctOk = num(st.fga, 0) >= H.pctBonusMinFga && fgPct(st) >= H.pctBonusMin ? 1 : 0;
    var rows = [
      ['fgm', 'Career FGM', num(st.fgm, 0), W.fgm],
      ['fifty', '50+ makes', num(st.made50plus, 0), W.fifty],
      ['pts', 'Points / 100', num(st.pts, 0) / 100, W.ptsPer100],
      ['gw', 'Game-winners', num(st.gameWinners, 0), W.gw],
      ['allLeague1', 'All-League 1st', countAwards(state, 'ALL_LEAGUE_1'), W.allLeague1],
      ['allLeague2', 'All-League 2nd', countAwards(state, 'ALL_LEAGUE_2'), W.allLeague2],
      ['stpoy', 'ST Player of the Year', countAwards(state, 'STPOY'), W.stpoy],
      ['championships', 'Championships', titles, W.championships],
      ['championshipKicks', 'Title-winning kicks', countAwards(state, 'CHAMPIONSHIP_MVP'), W.championshipKicks],
      ['seasonsAsStarter', 'Seasons as starter', starter, W.seasonsAsStarter],
      ['pctBonus', 'Career 88 %+ (300 FGA)', pctOk, W.pctBonus],
      ['recordsHeld', 'Records held', recs, W.recordsHeld]
    ];
    var breakdown = [], base = 0;
    for (var r = 0; r < rows.length; r++) {
      var pts = rows[r][2] * rows[r][3];
      base += pts;
      breakdown.push({ key: rows[r][0], label: rows[r][1], count: Util.roundN(rows[r][2], 2), weight: rows[r][3], points: Util.round1(pts) });
    }
    var mult = (hasFlag(state, 'WALKON') ? H.walkonMult : 1) * (hasFlag(state, 'UDFA') ? H.udfaMult : 1);
    var score = Math.round(base * mult);
    var V = H.verdicts;
    var verdict = score >= V.firstBallot ? 'FIRST_BALLOT' : (score >= V.inducted ? 'INDUCTED' : (score >= V.finalist ? 'FINALIST' : 'NOT_ON_BALLOT'));
    var inductionYear = null;
    if (verdict === 'FIRST_BALLOT') inductionYear = H.inductionYears[0];
    else if (verdict === 'INDUCTED') {
      var IY = H.inductionYear;
      inductionYear = Util.clamp(Math.round(IY.base - IY.famePer * num(state.player.fame, 0) / Tuning.soft.fame.max), H.inductionYears[0], H.inductionYears[1]);
    }
    var tier = H.tiers[H.tiers.length - 1].name;
    for (var t = 0; t < H.tiers.length; t++) if (score >= H.tiers[t].min) { tier = H.tiers[t].name; break; }
    return { score: score, verdict: verdict, tier: tier, breakdown: breakdown, base: Util.round1(base), multiplier: mult, inductionYear: inductionYear };
  };

  Awards.candidates = candidates;
  RTG.Awards = Awards;
})(typeof window !== 'undefined' ? window : globalThis);
