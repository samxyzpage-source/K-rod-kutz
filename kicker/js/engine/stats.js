/**
 * Road to Glory: Kicker — RTG.Stats (SPEC §3.5.12, §2.8 milestones, §2.9 records, §3.4 KickerStats)
 *
 * Bookkeeping for every kick: the user's season / career / per-league KickerStats,
 * the capped kick log (older rows are folded into `stats.archived` so split totals
 * stay exact), derived splits, moments, season lines, records and milestones.
 *
 * Pure over plain JSON: no rng (nothing here is random), no DOM, no clock.
 * Other modules (Schema, Player) are resolved AT CALL TIME.
 *
 * Extensions to the §3.4 typedefs made by this module (all JSON-safe, all optional):
 *   KickerStats.clutchBest / clutchBestDist   max pressure·D of a made FG (Clutch Kick of the Year)
 *   KickerStats.decisiveMakeWeeks[]           weeks with a decisive made kick (championship MVP awards)
 *   Stats.archived = {n, m, byBucket, byWeather, byHash, byPressure}   totals of kick rows dropped by the cap
 *   Stats.kickSeq                             monotonically increasing row counter (unique ids)
 *   state.flags['ms:<id>']                    milestone fired flags
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  var Util = RTG.Util, Tuning = RTG.Tuning;
  var Stats = {};

  var BUCKETS = ['0-29', '30-39', '40-49', '50-59', '60+'];
  var DOINKS = { DOINK_IN: true, DOINK_OUT: true, XBAR_IN: true, XBAR_OUT: true };
  var DOINK_IN = { DOINK_IN: true, XBAR_IN: true };
  var GRADES = ['A', 'B', 'C', 'D', 'F'];

  // ═══════════════════════════════ helpers ═══════════════════════════════

  function schema() { return RTG.Schema; }
  function TS() { return Tuning.stats; }
  function has(arr, v) { return Array.isArray(arr) && arr.indexOf(v) >= 0; }
  function num(v, d) { return typeof v === 'number' && v === v ? v : d; }

  /** Lower-case league key ('college'|'nfl') for a league kind. */
  function lgKey(kind) { return kind === 'NFL' ? 'nfl' : 'college'; }

  /** The league kind a kick belongs to (ctx → player → season). */
  function leagueOfKick(state, ctx) {
    return (ctx && ctx.league) || state.player.league || (state.season && state.season.league) || 'COLLEGE';
  }

  /** A zeroed KickerStats (Schema when loaded, else a literal with the same keys). */
  function emptyStats() {
    var S = schema();
    if (S && typeof S.emptyKickerStats === 'function') return S.emptyKickerStats();
    var s = { fga: 0, fgm: 0, pat: 0, patMade: 0, pts: 0, long: 0, clutchA: 0, clutchM: 0, decisiveA: 0, decisiveM: 0,
      gameWinners: 0, tieForcers: 0, blocked: 0, doinks: 0, doinkIn: 0, wideL: 0, wideR: 0, short: 0, made50plus: 0,
      consecutive: 0, bestConsecutive: 0, games: 0, gamesStarted: 0, koTouchbacks: 0, koCount: 0, wins: 0, losses: 0, buckets: {} };
    for (var i = 0; i < BUCKETS.length; i++) s.buckets[BUCKETS[i]] = { a: 0, m: 0 };
    return s;
  }

  /** Counter keys of a KickerStats (cached on first use — no allocation per kick). */
  var STAT_KEYS = null;
  function statKeys() {
    if (!STAT_KEYS) {
      STAT_KEYS = [];
      var e = emptyStats();
      for (var k in e) if (Object.prototype.hasOwnProperty.call(e, k) && k !== 'buckets') STAT_KEYS.push(k);
    }
    return STAT_KEYS;
  }

  /** Ensure a stats object has every counter (older saves / hand-built fixtures). Allocation-free on a complete object. */
  function ensureStats(s) {
    var keys = statKeys(), i;
    for (i = 0; i < keys.length; i++) if (s[keys[i]] === undefined) s[keys[i]] = 0;
    var b = s.buckets;
    if (!b || typeof b !== 'object') b = s.buckets = {};
    for (i = 0; i < BUCKETS.length; i++) if (!b[BUCKETS[i]]) b[BUCKETS[i]] = { a: 0, m: 0 };
    return s;
  }

  function isClutch(ctx, result) {
    var tags = result && result.tags;
    return has(tags, 'clutch') || !!(ctx && ctx.clutch) || num(ctx && ctx.pressure, 0) >= Tuning.kick.pressure.clutchThreshold;
  }
  function isDecisive(ctx, result) { return !!(ctx && ctx.decisive) || has(result && result.tags, 'decisive'); }
  function isPlayoff(ctx, result) { return !!(ctx && ctx.playoff) || has(result && result.tags, 'playoff'); }

  /** Points a made kick is worth (result.points when present, else the Tuning default). */
  function pointsFor(ctx, result) {
    if (typeof result.points === 'number' && result.points > 0) return result.points;
    return ctx.type === 'PAT' ? Tuning.kick.points.PAT : Tuning.kick.points.FG;
  }

  /** Team name lookup without throwing (Schema may be absent in isolated tests). */
  function teamName(state, id) {
    var S = schema();
    var t = S && typeof S.teamById === 'function' ? S.teamById(state, id) : null;
    return t ? t.name : (id || 'the opponent');
  }

  function calendarYear(year) {
    var S = schema();
    return S && typeof S.calendarYear === 'function' ? S.calendarYear(year) : Tuning.schedule.firstYear + year - 1;
  }

  function pushTimeline(state, entry) {
    var h = state.history;
    if (!h || !Array.isArray(h.timeline)) return;
    h.timeline.push(entry);
    var cap = Tuning.save.timelineCap;
    while (h.timeline.length > cap) h.timeline.shift();
  }

  function addFame(state, amount) {
    var p = state.player;
    p.fame = Util.clamp(Util.round1(num(p.fame, 0) + amount), 0, Tuning.soft.fame.max);
  }

  // ═══════════════════════════════ core counter update ═══════════════════════════════

  /**
   * Distance bucket for a field goal ('0-29' | '30-39' | '40-49' | '50-59' | '60+').
   * @param {number} distance yards
   * @returns {string}
   */
  Stats.bucketOf = function (distance) {
    var d = num(distance, 0);
    if (d < 30) return BUCKETS[0];
    if (d < 40) return BUCKETS[1];
    if (d < 50) return BUCKETS[2];
    if (d < 60) return BUCKETS[3];
    return BUCKETS[4];
  };

  /**
   * Apply one kick (FG / PAT / KO) to a KickerStats object in place.
   * FG: attempts, makes, bucket, long, 50+, consecutive streak. PAT: pat / patMade.
   * Both: points, clutch / decisive counters, game-winner / tie-forcer tags, outcome counters.
   * KO: koCount / koTouchbacks only.
   * @param {KickerStats} s @param {KickContext} ctx @param {KickResult} result @returns {KickerStats}
   */
  Stats.applyKick = function (s, ctx, result) {
    ensureStats(s);
    if (ctx.type === 'KO') {
      s.koCount++;
      if (result && result.touchback) s.koTouchbacks++;
      return s;
    }
    var made = !!result.made;
    var D = num(ctx.distance, 0);
    var tags = result.tags || [];
    var isFg = ctx.type !== 'PAT';

    if (isFg) {
      s.fga++;
      var b = Stats.bucketOf(D);
      s.buckets[b].a++;
      if (made) {
        s.fgm++;
        s.buckets[b].m++;
        if (D > s.long) s.long = D;
        if (D >= Tuning.kick.pressure.longDistFrom) s.made50plus++;
        s.consecutive++;
        if (s.consecutive > s.bestConsecutive) s.bestConsecutive = s.consecutive;
        var cb = num(ctx.pressure, 0) * D;
        if (cb > num(s.clutchBest, 0)) { s.clutchBest = Util.roundN(cb, 2); s.clutchBestDist = D; }
      } else {
        s.consecutive = 0;
      }
    } else {
      s.pat++;
      if (made) s.patMade++;
    }
    if (made) s.pts += pointsFor(ctx, result);

    if (isClutch(ctx, result)) { s.clutchA++; if (made) s.clutchM++; }
    if (isDecisive(ctx, result)) {
      s.decisiveA++;
      if (made) {
        s.decisiveM++;
        var wk = ctx.game && typeof ctx.game.week === 'number' ? ctx.game.week : null;
        if (wk !== null) {
          if (!Array.isArray(s.decisiveMakeWeeks)) s.decisiveMakeWeeks = [];
          if (s.decisiveMakeWeeks.indexOf(wk) < 0) s.decisiveMakeWeeks.push(wk);
        }
      }
    }
    if (made && has(tags, 'gameWinner')) s.gameWinners++;
    if (made && has(tags, 'tieForcer')) s.tieForcers++;

    var o = result.outcome;
    if (o === 'BLOCKED') s.blocked++;
    else if (DOINKS[o]) { s.doinks++; if (DOINK_IN[o]) s.doinkIn++; }
    else if (o === 'WIDE_L') s.wideL++;
    else if (o === 'WIDE_R') s.wideR++;
    else if (o === 'SHORT') s.short++;
    return s;
  };

  // ═══════════════════════════════ splits ═══════════════════════════════

  function emptySplits() { return { byBucket: {}, byWeather: {}, byHash: {}, byPressure: {} }; }

  function hashKey(h) { return h < 0 ? 'L' : (h > 0 ? 'R' : 'M'); }

  function pressureKey(p) {
    p = num(p, 0);
    if (p >= Tuning.kick.pressure.clutchThreshold) return 'clutch';
    if (p >= TS().splitPressureTense) return 'tense';
    return 'calm';
  }

  function bump(map, key, made) {
    var cell = map[key] || (map[key] = { a: 0, m: 0 });
    cell.a++;
    if (made) cell.m++;
  }

  /** Add one log row (FG only) to a splits object. */
  function addRowToSplits(splits, row) {
    if (row.type !== 'FG') return;
    bump(splits.byBucket, Stats.bucketOf(row.distance), row.made);
    bump(splits.byWeather, row.weather || 'clear', row.made);
    bump(splits.byHash, hashKey(num(row.hash, 0)), row.made);
    bump(splits.byPressure, pressureKey(row.pressure), row.made);
  }

  /** Fold an archived splits block (or another splits object) into `into`. */
  function mergeSplits(into, from) {
    if (!from) return into;
    var names = ['byBucket', 'byWeather', 'byHash', 'byPressure'];
    for (var i = 0; i < names.length; i++) {
      var src = from[names[i]] || {};
      var dst = into[names[i]] || (into[names[i]] = {});
      for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) {
        var cell = dst[k] || (dst[k] = { a: 0, m: 0 });
        cell.a += num(src[k].a, 0);
        cell.m += num(src[k].m, 0);
      }
    }
    return into;
  }

  function ensureSplits(st) {
    if (!st.splits || typeof st.splits !== 'object') st.splits = emptySplits();
    var names = ['byBucket', 'byWeather', 'byHash', 'byPressure'];
    for (var i = 0; i < names.length; i++) if (!st.splits[names[i]]) st.splits[names[i]] = {};
    return st.splits;
  }

  function ensureArchived(st) {
    if (!st.archived) st.archived = { n: 0, m: 0, byBucket: {}, byWeather: {}, byHash: {}, byPressure: {} };
    return st.archived;
  }

  /**
   * Rebuild `stats.splits` from the archived block plus every row in the kick log.
   * @param {CareerState} state @returns {{byBucket:Object, byWeather:Object, byHash:Object, byPressure:Object}}
   */
  Stats.rebuildSplits = function (state) {
    var st = state.stats;
    var splits = emptySplits();
    if (st.archived) mergeSplits(splits, st.archived);
    var rows = st.kicks || [];
    for (var i = 0; i < rows.length; i++) addRowToSplits(splits, rows[i]);
    st.splits = splits;
    return splits;
  };

  /** Drop the oldest rows beyond the cap, folding them into `stats.archived`. */
  function enforceKickCap(st) {
    var cap = Tuning.save.kickLogCap;
    if (st.kicks.length <= cap) return 0;
    var arch = ensureArchived(st);
    var drop = st.kicks.length - cap;
    var dropped = st.kicks.splice(0, drop);
    var tmp = emptySplits();
    for (var i = 0; i < dropped.length; i++) {
      arch.n++;
      if (dropped[i].made) arch.m++;
      addRowToSplits(tmp, dropped[i]);
    }
    mergeSplits(arch, tmp);
    return drop;
  }

  // ═══════════════════════════════ moments ═══════════════════════════════

  /**
   * Moment score (§2.7.9): pressure·D·(made ? 1 : 0.6) + 40·decisive + 20·doink + 15·playoff.
   * @param {KickContext} ctx @param {KickResult} result @returns {number}
   */
  Stats.momentScore = function (ctx, result) {
    var M = Tuning.hof.moments;
    var D = num(ctx.distance, 0);
    var s = num(ctx.pressure, 0) * D * (result.made ? 1 : M.missMult);
    if (isDecisive(ctx, result)) s += M.decisive;
    if (DOINKS[result.outcome]) s += M.doink;
    if (isPlayoff(ctx, result)) s += M.playoff;
    return Util.round1(s);
  };

  /** One-line description of a kick for moments / timeline. */
  function momentText(state, ctx, result) {
    var D = num(ctx.distance, 0);
    var tags = result.tags || [];
    var opp = ctx.game && ctx.game.oppId ? teamName(state, ctx.game.oppId) : null;
    var where = opp ? ((ctx.away ? ' at ' : ' vs ') + opp) : '';
    var what;
    if (ctx.type === 'PAT') what = (result.made ? 'Converted' : 'Missed') + ' a PAT';
    else if (result.outcome === 'BLOCKED') what = 'Blocked on a ' + D + '-yarder';
    else if (DOINK_IN[result.outcome]) what = 'Doinked in a ' + D + '-yarder';
    else if (DOINKS[result.outcome]) what = 'Doinked out a ' + D + '-yarder';
    else if (result.made) what = (has(tags, 'gameWinner') ? 'Game-winner from ' : (has(tags, 'tieForcer') ? 'Tie-forcing kick from ' : 'Drilled a ')) + D + (has(tags, 'gameWinner') || has(tags, 'tieForcer') ? ' yards' : '-yarder');
    else what = 'Missed from ' + D + (isDecisive(ctx, result) ? ' with the game on the line' : '');
    var extra = [];
    if (isPlayoff(ctx, result)) extra.push('playoff');
    if (has(tags, 'iced')) extra.push('after a timeout');
    if (ctx.weather && ctx.weather !== 'clear' && ctx.weather !== 'dome') extra.push('in the ' + ctx.weather);
    return what + where + (extra.length ? ' (' + extra.join(', ') + ')' : '');
  }

  /** Keep a kick as a career moment when its score clears the floor; prune to the cap by score. */
  function recordMoment(state, ctx, result, row) {
    var score = Stats.momentScore(ctx, result);
    if (score < TS().momentMinScore) return null;
    var h = state.history;
    if (!h) return null;
    if (!Array.isArray(h.moments)) h.moments = [];
    var m = {
      id: row ? row.id : ('m' + h.moments.length), year: state.year, week: state.week,
      league: leagueOfKick(state, ctx), text: momentText(state, ctx, result), score: score,
      distance: num(ctx.distance, 0), made: !!result.made, tags: (result.tags || []).slice()
    };
    h.moments.push(m);
    h.moments.sort(function (a, b) { return b.score - a.score; });
    var cap = Tuning.save.momentsCap;
    if (h.moments.length > cap) h.moments.length = cap;
    return m;
  }

  /**
   * The top moments of the career, best first.
   * @param {CareerState} state @param {number} [n=Tuning.hof.moments.keep]
   * @returns {Moment[]} copies
   */
  Stats.topMoments = function (state, n) {
    var list = (state.history && state.history.moments) || [];
    var sorted = Util.stableSort(list, function (a, b) { return b.score - a.score; });
    return Util.deepClone(sorted.slice(0, n === undefined ? Tuning.hof.moments.keep : n));
  };

  // ═══════════════════════════════ recordKick / recordAiKick / recordGame ═══════════════════════════════

  /**
   * Record one user kick: append a KickLogRow to `stats.kicks` (cap → archive), update
   * season / career / league KickerStats, `player.makeStreak/missStreak` (FG only), splits
   * and career moments. Kickoffs update the KO counters only and return null (no log row).
   * ICE_VEINS is earned at Tuning.progression.traits.iceVeinsGwPerSeason game-winners in a season.
   * @param {CareerState} state @param {KickContext} ctx @param {KickResult} result
   * @param {{id?:string, gameId?:string, teamId?:string, oppId?:string, auto?:boolean, rngState?:number, input?:Object, week?:number, year?:number}} [meta]
   * @returns {KickLogRow|null}
   */
  Stats.recordKick = function (state, ctx, result, meta) {
    meta = meta || {};
    var st = state.stats, p = state.player;
    var kind = leagueOfKick(state, ctx);
    var targets = [st.season, st.career, st[lgKey(kind)]];
    for (var i = 0; i < targets.length; i++) if (targets[i]) Stats.applyKick(targets[i], ctx, result);

    if (ctx.type === 'KO') return null;

    if (ctx.type !== 'PAT') {
      if (result.made) { p.makeStreak = num(p.makeStreak, 0) + 1; p.missStreak = 0; }
      else { p.missStreak = num(p.missStreak, 0) + 1; p.makeStreak = 0; }
    }
    var TR = Tuning.progression.traits;
    if (st.season.gameWinners >= TR.iceVeinsGwPerSeason && Array.isArray(p.traits) && p.traits.indexOf('ICE_VEINS') < 0 && p.traits.length < TR.max) {
      p.traits.push('ICE_VEINS');
    }

    var seq = num(st.kickSeq, st.kicks.length) + 1;
    st.kickSeq = seq;
    var week = typeof meta.week === 'number' ? meta.week : state.week;
    var year = typeof meta.year === 'number' ? meta.year : state.year;
    var g = ctx.game || {};
    var rowMeta = {
      id: meta.id || ('k' + year + 'w' + week + 'n' + seq),
      year: year, week: week,
      gameId: meta.gameId !== undefined ? meta.gameId : (state.game ? state.game.id : null),
      teamId: meta.teamId !== undefined ? meta.teamId : (p.teamId || g.teamId || null),
      oppId: meta.oppId !== undefined ? meta.oppId : (g.oppId || null),
      auto: meta.auto !== undefined ? !!meta.auto : has(result.tags, 'auto'),
      rngState: typeof meta.rngState === 'number' ? meta.rngState : num(state.rngState, 0),
      input: meta.input
    };
    var S = schema();
    var row = S && typeof S.createKickLogRow === 'function' ? S.createKickLogRow(ctx, result, rowMeta) : fallbackRow(ctx, result, rowMeta);
    st.kicks.push(row);
    enforceKickCap(st);
    addRowToSplits(ensureSplits(st), row);
    recordMoment(state, ctx, result, row);
    return row;
  };

  /** Minimal KickLogRow when Schema is not loaded (isolated tests). */
  function fallbackRow(ctx, result, meta) {
    var g = ctx.game || {};
    var input = meta.input || { power: result.power, aim: 0, quality: result.quality };
    return {
      id: meta.id, year: meta.year, week: meta.week, league: ctx.league || 'COLLEGE', gameId: meta.gameId, teamId: meta.teamId, oppId: meta.oppId,
      type: ctx.type || 'FG', distance: ctx.distance, hash: ctx.hash || 0, wind: ctx.wind ? { speed: ctx.wind.speed, dir: ctx.wind.dir } : { speed: 0, dir: 0 },
      weather: ctx.weather || 'clear', pressure: Util.roundN(num(ctx.pressure, 0), 3), outcome: result.outcome, made: !!result.made,
      tags: (result.tags || []).slice(), input: { power: num(input.power, 0), aim: num(input.aim, 0), quality: num(input.quality, 0) },
      auto: !!meta.auto, rngState: meta.rngState >>> 0, q: g.q || 0, clock: g.clock || 0, scoreFor: g.scoreFor || 0, scoreAgainst: g.scoreAgainst || 0
    };
  }

  /**
   * Record an AI kicker's kick into `season.kickerStats[teamId]` (created on demand).
   * @param {SeasonState} season @param {string} teamId @param {KickContext} ctx @param {KickResult} result
   * @returns {KickerStats}
   */
  Stats.recordAiKick = function (season, teamId, ctx, result) {
    if (!season.kickerStats) season.kickerStats = {};
    var s = season.kickerStats[teamId] || (season.kickerStats[teamId] = emptyStats());
    return Stats.applyKick(s, ctx, result);
  };

  /**
   * Record a finished user game: games / gamesStarted / wins / losses on season, career and
   * league stats, plus `player.gamesPlayed`.
   * summary = GameSummary (§3.5.11): {won, tied?, started?, userLine, ...}. `started` defaults to
   * role === 'K1' or any user attempt in the game.
   * @param {CareerState} state @param {Object} summary
   */
  Stats.recordGame = function (state, summary) {
    summary = summary || {};
    var st = state.stats, p = state.player;
    var line = summary.userLine || {};
    var started = summary.started !== undefined ? !!summary.started : (p.role === 'K1' || num(line.fga, 0) + num(line.pat, 0) > 0);
    var won = !!summary.won, tied = !!summary.tied;
    var kind = state.season ? state.season.league : p.league;
    var targets = [st.season, st.career, st[lgKey(kind)]];
    for (var i = 0; i < targets.length; i++) {
      var s = targets[i];
      if (!s) continue;
      ensureStats(s);
      s.games++;
      if (started) s.gamesStarted++;
      if (won) s.wins++; else if (!tied) s.losses++;
    }
    p.gamesPlayed = num(p.gamesPlayed, 0) + 1;
  };

  // ═══════════════════════════════ grades & lines ═══════════════════════════════

  /**
   * FG percentage of a stats object (0 when there are no attempts).
   * @param {KickerStats} stats @returns {number} 0..1
   */
  Stats.seasonFgPct = function (stats) {
    if (!stats || !stats.fga) return 0;
    return stats.fgm / stats.fga;
  };

  /**
   * Game grade (§3.5.12): A = 100 % with ≥ 2 FGA or a game-winner · B ≥ 85 % · C ≥ 70 % ·
   * D ≥ 50 % · F otherwise; a decisive miss caps the grade at D. With no FG attempt the PAT
   * percentage is graded instead (never an A).
   * @param {{userLine?:{fga,fgm,pat,patMade,gw}, decisiveMiss?:boolean, kicks?:KickLogRow[]}} summary
   * @returns {'A'|'B'|'C'|'D'|'F'}
   */
  Stats.grade = function (summary) {
    var G = TS().grade;
    summary = summary || {};
    var l = summary.userLine || summary;
    var fga = num(l.fga, 0), fgm = num(l.fgm, 0), pat = num(l.pat, 0), patMade = num(l.patMade, 0);
    var gw = num(l.gw, 0) || num(l.gameWinners, 0);
    var pct;
    if (fga > 0) pct = fgm / fga;
    else pct = pat > 0 ? patMade / pat : 1;
    var decisiveMiss = !!summary.decisiveMiss || !!l.decisiveMiss;
    if (!decisiveMiss && Array.isArray(summary.kicks)) {
      for (var i = 0; i < summary.kicks.length; i++) {
        var k = summary.kicks[i];
        if (!k.made && has(k.tags, 'decisive') && (k.teamId === undefined || summary.teamId === undefined || k.teamId === summary.teamId)) { decisiveMiss = true; break; }
      }
    }
    var g;
    if (pct >= 1 && (fga >= G.aMinFga || gw > 0)) g = 'A';
    else if (pct >= G.b) g = 'B';
    else if (pct >= G.c) g = 'C';
    else if (pct >= G.d) g = 'D';
    else g = 'F';
    if (decisiveMiss && GRADES.indexOf(g) < GRADES.indexOf(G.decisiveMissCap)) g = G.decisiveMissCap;
    return g;
  };

  /** Season grade letter from FG% (Tuning.stats.seasonGrade). */
  function seasonGrade(s) {
    var G = TS().seasonGrade;
    var pct = s.fga > 0 ? s.fgm / s.fga : (s.pat > 0 ? s.patMade / s.pat : 0);
    if (pct >= G.a) return 'A';
    if (pct >= G.b) return 'B';
    if (pct >= G.c) return 'C';
    if (pct >= G.d) return 'D';
    return 'F';
  }

  /** "w-l" or "w-l-t" for the user's team this season. */
  function teamRecordText(state, teamId) {
    var r = state.season && state.season.results && state.season.results[teamId];
    if (!r) return '0-0';
    return r.w + '-' + r.l + (r.t ? '-' + r.t : '');
  }

  /** Postseason outcome for the user's team from the schedule ('' | 'CHAMP' | '<KIND>_W' | '<KIND>_L'). */
  function playoffResult(state, teamId) {
    var games = (state.season && state.season.schedule) || [];
    var last = null;
    for (var i = 0; i < games.length; i++) {
      var g = games[i];
      if (g.kind === 'REG' || !g.played || !g.score) continue;
      if (g.homeId !== teamId && g.awayId !== teamId) continue;
      if (!last || g.week > last.week) last = g;
    }
    if (!last) return '';
    var won = last.homeId === teamId ? last.score.home > last.score.away : last.score.away > last.score.home;
    if (last.kind === 'CHAMP' && won) return 'CHAMP';
    return last.kind + (won ? '_W' : '_L');
  }

  /** Did the user's team win the title this season? */
  function isChampion(state, teamId) {
    var po = state.season && state.season.playoffs;
    if (po && po.championId) return po.championId === teamId;
    var L = schema() && schema().leagueOf ? schema().leagueOf(state, state.season.league) : null;
    var hist = L && L.seasonHistory;
    if (hist) for (var i = 0; i < hist.length; i++) if (hist[i].year === state.season.year && hist[i].championId) return hist[i].championId === teamId;
    return playoffResult(state, teamId) === 'CHAMP';
  }

  function ovrOf(attrs) {
    if (RTG.Player && typeof RTG.Player.ovr === 'function') return RTG.Player.ovr(attrs);
    var W = Tuning.progression.ovrWeights, s = 0;
    for (var k in W) if (Object.prototype.hasOwnProperty.call(W, k)) s += W[k] * num(attrs[k], 0);
    return Math.round(s);
  }

  /**
   * Close the user's season: build the SeasonLine (snapshot of `stats.season`), append it to
   * `history.seasons`, run the season-end records check (FG% and career-seasons records), then
   * reset `stats.season` and the in-season streak counters. Awards for the year must already be
   * in `history.awards` (Season.finishSeason calls Awards.compute first).
   * @param {CareerState} state @returns {SeasonLine} (+ `milestones` from the records check)
   */
  Stats.finishSeason = function (state) {
    var p = state.player, season = state.season;
    var s = ensureStats(state.stats.season);
    var teamId = p.teamId || null;
    var kind = season ? season.league : p.league;
    var awards = [];
    var hist = state.history.awards || [];
    for (var i = 0; i < hist.length; i++) if (hist[i].year === state.year && hist[i].league === kind && !hist[i].week) awards.push(hist[i].id);
    var line = {
      year: state.year, league: kind, teamId: teamId, teamName: teamId ? teamName(state, teamId) : '',
      age: p.age, ovr: ovrOf(p.attrs), role: p.role,
      stats: Util.deepClone(s), awards: awards,
      teamRecord: teamRecordText(state, teamId), champion: teamId ? isChampion(state, teamId) : false,
      playoffResult: teamId ? playoffResult(state, teamId) : '',
      grade: seasonGrade(s), salary: p.contract ? num(p.contract.aav, 0) : 0
    };
    state.history.seasons.push(line);
    line.milestones = Stats.checkRecords(state, null, null, { final: true });
    state.stats.season = emptyStats();
    p.missStreak = 0;
    p.makeStreak = 0;
    return line;
  };

  /**
   * Career totals for the legacy screen.
   * @param {CareerState} state
   * @returns {{fga, fgm, pct, pat, patMade, patPct, pts, long, made50plus, gameWinners, games, seasons, collegeSeasons, nflSeasons, text}}
   */
  Stats.careerLine = function (state) {
    var c = ensureStats(state.stats.career);
    var seasons = state.history.seasons || [];
    var college = 0, nfl = 0;
    for (var i = 0; i < seasons.length; i++) { if (seasons[i].league === 'NFL') nfl++; else college++; }
    var pct = Stats.seasonFgPct(c);
    var line = {
      fga: c.fga, fgm: c.fgm, pct: pct, pat: c.pat, patMade: c.patMade, patPct: c.pat ? c.patMade / c.pat : 0,
      pts: c.pts, long: c.long, made50plus: c.made50plus, gameWinners: c.gameWinners, games: c.games,
      seasons: seasons.length, collegeSeasons: college, nflSeasons: nfl
    };
    line.text = c.fgm + '/' + c.fga + ' FG (' + Util.fmtPct(pct) + ') · ' + c.patMade + '/' + c.pat + ' PAT · ' + c.pts + ' pts · long ' + c.long + ' · ' + c.gameWinners + ' GW';
    return line;
  };

  // ═══════════════════════════════ records & milestones ═══════════════════════════════

  /**
   * The user's current value for every record key of a league. Percentage records are only
   * reported when `final` and the minimum attempts are met; careerSeasons only for the NFL.
   * @param {CareerState} state @param {'college'|'nfl'} lg @param {boolean} final
   * @returns {Object<string, number>}
   */
  function userRecordValues(state, lg, final) {
    var st = state.stats;
    var L = ensureStats(st[lg] || emptyStats()), S = ensureStats(st.season);
    var R = Tuning.records;
    var sameLeague = lgKey(state.season ? state.season.league : state.player.league) === lg;
    var v = {
      longFG: L.long, careerFGM: L.fgm, careerPts: L.pts, consecutiveFGM: L.bestConsecutive, careerGW: L.gameWinners
    };
    if (sameLeague) { v.seasonFGM = S.fgm; v.seasonPts = S.pts; v.season50plus = S.made50plus; }
    if (final) {
      if (sameLeague && S.fga >= R.minFgaSeasonPct) v.seasonFGpct = Util.round1(100 * S.fgm / S.fga);
      if (L.fga >= R.minFgaCareerPct) v.careerFGpct = Util.round1(100 * L.fgm / L.fga);
      if (lg === 'nfl') {
        var n = 0, hs = state.history.seasons || [];
        for (var i = 0; i < hs.length; i++) if (hs[i].league === 'NFL') n++;
        v.careerSeasons = n;
      }
    }
    return v;
  }

  function recordLabel(key) {
    var D = RTG.Data && RTG.Data.records && RTG.Data.records.meta;
    return D && D[key] ? D[key].label : key;
  }

  /** Fire one milestone (once, via state.flags) and return its payload. */
  function fireMilestone(state, id, vars, text) {
    var flagKey = 'ms:' + id;
    if (!state.flags) state.flags = {};
    if (state.flags[flagKey]) return null;
    state.flags[flagKey] = true;
    var fame = Tuning.awards.milestones.fame;
    addFame(state, fame);
    var m = { kind: 'MILESTONE', id: id, tag: 'milestone', vars: vars, text: text, fame: fame, impact: TS().milestoneImpact };
    pushTimeline(state, { year: state.year, week: state.week, kind: 'MILESTONE', text: text, impact: m.impact, teamId: state.player.teamId || null });
    return m;
  }

  /**
   * Compare the user's stats to the league records and career milestones (§2.8, §2.9).
   * Records beaten flip to the user (`isUser`, holder, year) and `records.personal` tracks
   * personal bests. Milestones (100/200/… FGM, 1000/1500/2000 pts, first 50+, first 60+,
   * 20 straight, 10 game-winners) fire once each via `state.flags['ms:<id>']`; each adds
   * Tuning.awards.milestones.fame. Percentage / seasons records are checked only with
   * `opts.final` (Stats.finishSeason). No rng — headlines are fired by the caller from the payloads.
   * @param {CareerState} state @param {KickContext} [ctx] @param {KickResult} [result] @param {{final?:boolean}} [opts]
   * @returns {Array<{kind:'RECORD'|'MILESTONE', id?:string, key?:string, tag:string, vars:Object, text:string, fame:number}>}
   */
  Stats.checkRecords = function (state, ctx, result, opts) {
    opts = opts || {};
    var out = [];
    var p = state.player, R = state.records;
    if (!R) return out;
    var kind = (state.season && state.season.league) || p.league || 'COLLEGE';
    var lg = lgKey(kind);
    if (!R.personal) R.personal = {};
    var table = R[lg] || {};
    var vals = userRecordValues(state, lg, !!opts.final);
    var last = p.name && p.name.last ? p.name.last : (p.name && p.name.full) || 'The kicker';
    for (var key in vals) {
      if (!Object.prototype.hasOwnProperty.call(vals, key)) continue;
      var v = vals[key];
      if (typeof v !== 'number' || v !== v) continue;
      if (v > num(R.personal[key], 0)) R.personal[key] = v;
      var entry = table[key];
      if (!entry || typeof entry.value !== 'number' || v <= entry.value) continue;
      var wasUser = !!entry.isUser;
      var oldHolder = entry.holder, oldValue = entry.value;
      entry.value = v;
      entry.holder = p.name.full;
      entry.holderTeam = p.teamId || null;
      entry.year = calendarYear(state.year);
      entry.isUser = true;
      if (wasUser) continue;                       // extending your own record is not news
      var label = recordLabel(key);
      var text = last + ' breaks the ' + kind + ' record for ' + label.toLowerCase() + ' (' + v + '; ' + oldHolder + ' had ' + oldValue + ')';
      var fame = Tuning.awards.milestones.fame;
      addFame(state, fame);
      pushTimeline(state, { year: state.year, week: state.week, kind: 'RECORD', text: text, impact: TS().recordImpact, teamId: p.teamId || null });
      out.push({ kind: 'RECORD', key: key, league: kind, value: v, prev: oldValue, prevHolder: oldHolder, tag: 'rare',
        vars: { record: label, holder: oldHolder, n: v }, text: text, fame: fame, impact: TS().recordImpact });
    }

    // career milestones (career-wide totals)
    var c = ensureStats(state.stats.career);
    var M = Tuning.awards.milestones;
    var m, i;
    for (i = 0; i < M.fgm.length; i++) if (c.fgm >= M.fgm[i]) {
      m = fireMilestone(state, 'FGM' + M.fgm[i], { n: M.fgm[i], milestone: 'fgm' }, last + ' reaches ' + M.fgm[i] + ' career field goals');
      if (m) out.push(m);
    }
    for (i = 0; i < M.pts.length; i++) if (c.pts >= M.pts[i]) {
      m = fireMilestone(state, 'PTS' + M.pts[i], { n: M.pts[i], milestone: 'pts' }, M.pts[i] + ' career points for ' + last);
      if (m) out.push(m);
    }
    if (c.made50plus >= 1) { m = fireMilestone(state, 'first50', { n: 50, milestone: 'first50' }, 'First 50-plus for ' + last); if (m) out.push(m); }
    if (c.long >= 60) { m = fireMilestone(state, 'first60', { n: 60, milestone: 'first60' }, 'First 60-yarder for ' + last); if (m) out.push(m); }
    if (c.bestConsecutive >= M.consecutive) { m = fireMilestone(state, 'streak' + M.consecutive, { n: M.consecutive, milestone: 'streak' }, M.consecutive + ' straight makes for ' + last); if (m) out.push(m); }
    if (c.gameWinners >= M.gw) { m = fireMilestone(state, 'gw' + M.gw, { n: M.gw, milestone: 'gw10' }, M.gw + ' game-winners for ' + last); if (m) out.push(m); }
    return out;
  };

  /**
   * The records board: every record of both leagues with the holder and the user's own value.
   * @param {CareerState} state
   * @returns {Array<{league:'COLLEGE'|'NFL', key:string, label:string, record:number, holder:string, holderTeam:string|null, year:number, isUser:boolean, yours:number|null, gap:number|null}>}
   */
  Stats.compareToLegends = function (state) {
    var out = [];
    var R = state.records || {};
    var lgs = ['college', 'nfl'];
    for (var i = 0; i < lgs.length; i++) {
      var lg = lgs[i], table = R[lg] || {};
      var vals = userRecordValues(state, lg, true);
      var keys = Tuning.records.keys;
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k], e = table[key];
        if (!e) continue;
        var yours = typeof vals[key] === 'number' ? vals[key] : null;
        out.push({
          league: lg === 'nfl' ? 'NFL' : 'COLLEGE', key: key, label: recordLabel(key),
          record: e.value, holder: e.holder, holderTeam: e.holderTeam === undefined ? null : e.holderTeam, year: e.year, isUser: !!e.isUser,
          yours: yours, gap: yours === null ? null : Util.round1(e.value - yours)
        });
      }
    }
    return out;
  };

  Stats.BUCKETS = BUCKETS;
  Stats.emptyStats = emptyStats;
  Stats.ensureStats = ensureStats;
  RTG.Stats = Stats;
})(typeof window !== 'undefined' ? window : globalThis);
