/**
 * Road to Glory: Kicker — the high-school senior season (SPEC §2.7.0, decision D23).
 *
 * A career opens on the last five games of the senior year instead of a six-kick showcase. Every kick is a
 * scoring chance inside a real game with a live scoreboard, and the recruiting board moves after each game —
 * so the offers that follow are earned game by game rather than in one afternoon.
 *
 *   state.flags.hs = {
 *     school   {name, town, mascot, abbr, climate}      the player's high school
 *     idx      games completed (0..5)
 *     games    [{week, opp, home, rivalry, playoff, us, them, won, tie, fgm, fga, xpm, xpa, long, gw, gwa}]
 *     board    [{teamId, school, abbr, prestige, interest, moved}]   recruiting interest, 0..100
 *     totals   {fgm, fga, xpm, xpa, long, gw, gwa, wins, losses, ties}
 *     rating   0..6 once the season is done (what Career.starsFor reads)
 *     summary  {stars, walkon, rating, record} once the season is done
 *   }
 *
 * RNG draw contract (the parent rng only ever sees forks; everything else is drawn from the child):
 *   HS.season        : 1 parent draw — rng.fork('hs:season')
 *   HS.startGame     : 1 parent draw — rng.fork('hs:game:<idx>')
 *   HS.afterKick     : 0
 *   HS.finishGame    : headline 1 (0 when RTG.Events is absent)
 *   HS.finishSeason  : Career.generateCollegeOffers 1 → headline 1
 *
 * DOM-free and pure: every random value comes from the rng that is passed in.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  var Util = RTG.Util, Tuning = RTG.Tuning;
  var HS = {};

  var PAT_PTS = 1, FG_PTS = 3, TD_PTS = 6;
  var REGION_CLIMATE = { NE: 'cold', MW: 'cold', SE: 'warm', SW: 'warm', W: 'temperate' };

  function T() { return Tuning.hs; }
  function isFn(f) { return typeof f === 'function'; }
  function num(v, d) { return typeof v === 'number' && v === v ? v : d; }
  function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
  function fail(fn, msg) { throw new Error('HS.' + fn + ': ' + msg); }
  function Kick() { return RTG.Kick; }
  function Career() { return RTG.Career; }
  function Player() { return RTG.Player; }
  function Events() { return RTG.Events; }
  function names() { return (RTG.Data && RTG.Data.names) || {}; }
  function sflags(state) { state.flags = state.flags || {}; return state.flags; }

  /** Headline via Events.headline (1 draw); null when Events is absent (0 draws). */
  function headline(state, rng, tag, vars) {
    var E = Events();
    if (!E || !isFn(E.headline) || !Array.isArray(state.headlines)) return null;
    return E.headline(state, rng, tag, vars || {});
  }
  function timeline(state, kind, text, impact) {
    var h = state.history;
    if (!h || !Array.isArray(h.timeline)) return null;
    var row = { year: state.year, week: state.week, kind: kind, text: text, impact: impact, teamId: null };
    h.timeline.push(row);
    var cap = Tuning.save.timelineCap;
    while (h.timeline.length > cap) h.timeline.shift();
    return row;
  }

  /** The live HS record, or null before Schema.createCareer has built one. */
  HS.current = function (state) { return state && state.flags && state.flags.hs ? state.flags.hs : null; };

  /** True while the senior season still has games left to play. */
  HS.inSeason = function (state) {
    var hs = HS.current(state);
    return !!hs && hs.idx < hs.games.length;
  };

  // ═══════════════════════════════ names ═══════════════════════════════

  function schoolName(child, town) {
    var N = names();
    var q = child.pick(N.hsQualifiers || ['']);
    var mascot = child.pick(N.hsMascots || ['Ravens']);
    return { town: town, name: (town + (q ? ' ' + q : '')), mascot: mascot, full: town + (q ? ' ' + q : '') + ' ' + mascot };
  }
  function abbrOf(name) {
    var parts = String(name).split(' '), out = '';
    for (var i = 0; i < parts.length && out.length < 3; i++) if (parts[i]) out += parts[i].charAt(0).toUpperCase();
    while (out.length < 3) out += String(name).charAt(out.length).toUpperCase() || 'X';
    return out.slice(0, 3);
  }

  // ═══════════════════════════════ §2.7.0 the season ═══════════════════════════════

  /**
   * Build the senior-season record: the player's school, the five-game schedule and the recruiting board.
   * Does NOT set state.pending — HS.startGame opens each game. Draws: 1 (fork).
   * @param {Object} state @param {RNG} rng @returns {Object} state.flags.hs
   */
  HS.season = function (state, rng) {
    var child = rng.fork('hs:season');                                              // 1 parent draw
    var C = T(), N = names(), p = state.player;
    var home = (p && p.hometown) || { city: 'Springfield', state: 'IL', region: 'MW' };
    var school = schoolName(child, home.city);
    var towns = (N.hsTowns || ['Brookfield']).slice();
    var games = [], used = {};
    for (var i = 0; i < C.games; i++) {
      var town = child.pick(towns);
      while (used[town] && towns.length > C.games) { towns.splice(towns.indexOf(town), 1); town = child.pick(towns); }
      used[town] = true;
      var opp = schoolName(child, town);
      games.push({
        week: C.firstWeek + i,
        opp: opp.full, oppAbbr: abbrOf(opp.full),
        home: i % 2 === 0,
        rivalry: i === C.rivalryIdx,
        playoff: i === C.playoffIdx,
        played: false, us: 0, them: 0, won: false, tie: false,
        fgm: 0, fga: 0, xpm: 0, xpa: 0, long: 0, gw: 0, gwa: 0, kicks: []
      });
    }
    var hs = {
      school: {
        name: school.name, town: school.town, mascot: school.mascot, full: school.full,
        abbr: abbrOf(school.full), city: home.city, state: home.state,
        climate: REGION_CLIMATE[home.region] || 'temperate'
      },
      idx: 0,
      games: games,
      board: buildBoard(state, child),
      totals: { fgm: 0, fga: 0, xpm: 0, xpa: 0, long: 0, gw: 0, gwa: 0, wins: 0, losses: 0, ties: 0 },
      rating: 0,
      summary: null
    };
    sflags(state).hs = hs;
    return hs;
  };

  /** The schools following the senior tape: a spread of prestige, with the home region favoured. */
  function buildBoard(state, child) {
    var C = T().interest, lg = state.leagues && state.leagues.college;
    if (!lg || !lg.teams || !lg.teams.length) return [];
    var region = state.player && state.player.hometown ? state.player.hometown.region : null;
    var pool = lg.teams.slice();
    var weight = function (t) { return 1 + (region && t.region === region ? 1.2 : 0) + (5 - num(t.prestige, 3)) * 0.25; };
    var board = [], n = Math.min(C.board, pool.length);
    for (var i = 0; i < n; i++) {
      var t = child.weighted(pool, weight);
      pool.splice(pool.indexOf(t), 1);
      var start = C.start.base + C.start.perPrestige * num(t.prestige, 3) + child.int(-C.start.jitter, C.start.jitter);
      board.push({
        teamId: t.id, school: t.school || t.name, abbr: t.abbr || t.id, prestige: num(t.prestige, 3),
        interest: clamp(Math.round(start), C.min, C.max), moved: 0,
        pull: Math.round(child.float(C.pull[0], C.pull[1]) * 100) / 100
      });
    }
    return Util.stableSort(board, function (a, b) { return b.interest - a.interest; });
  }

  // ═══════════════════════════════ game scripts ═══════════════════════════════

  /**
   * Open the next game of the senior season: builds the KickSession and sets state.pending.
   * Draws: 1 (fork). Every context is built with an explicit hash and wind, so the parent rng never moves.
   * @param {Object} state @param {RNG} rng @returns {Object} KickSession (kind HS_GAME)
   */
  HS.startGame = function (state, rng) {
    var hs = HS.current(state);
    if (!hs) fail('startGame', 'no senior season on this career');
    if (hs.idx >= hs.games.length) fail('startGame', 'the senior season is over');
    if (state.pending) fail('startGame', 'a ' + state.pending.kind + ' is already pending');
    var g = hs.games[hs.idx];
    var child = rng.fork('hs:game:' + hs.idx);                                      // 1 parent draw
    var C = T();
    var venue = { climate: hs.school.climate, surface: 'grass' };
    var weather = RTG.Weather.forGame(child, venue, g.week, 'COLLEGE', Tuning.difficulty.pro.windCap);
    var wind = { speed: weather.wind.speed, dir: weather.wind.dir };
    var script = scriptChances(child, hs, g);
    var chances = script.chances;
    var sess = {
      kind: 'HS_GAME', gameIdx: hs.idx, week: g.week, opp: g.opp, oppAbbr: g.oppAbbr,
      home: g.home, rivalry: g.rivalry, playoff: g.playoff,
      weather: weather, wind: wind,
      score: { us: 0, them: 0 }, cursor: 0, oppAfter: script.oppAfter, otWin: script.otWin,
      chances: chances, contexts: [], results: [], idx: 0, log: []
    };
    // every context is built up front (the generic session machinery needs the full length); the scoreboard on
    // each one after the first is a projection that afterKick corrects from what actually happened.
    var probe = { us: 0, them: 0 };
    for (var i = 0; i < chances.length; i++) {
      advanceScore(probe, chances[i]);
      sess.contexts.push(contextFor(state, sess, chances[i], i, probe));
      probe.us += chances[i].type === 'PAT' ? PAT_PTS : FG_PTS;                     // the projection assumes a make
    }
    applyChance(sess, 0);
    sess.contexts[0] = contextFor(state, sess, chances[0], 0, sess.score);
    state.pending = { kind: 'KICKS', session: sess };
    return sess;
  };

  /**
   * The scoring chances the offence hands the kicker, and the opponent's answer. The opponent's total is scaled
   * off what your offence set up, so the games stay games: below 1.0 you are favoured, above it you are not.
   * The rivalry and playoff weeks end on the kicker.
   */
  function scriptChances(child, hs, g) {
    var C = T(), out = [];
    var n = child.int(C.chances[0], C.chances[1]);
    var scripted = hs.idx >= C.finish.fromIdx;                                     // rivalry / playoff: the last one decides it
    var projected = 0;
    for (var i = 0; i < n; i++) {
      var last = i === n - 1;
      var isPat = !(scripted && last) && child.chance(C.patShare);
      var trail = scripted && last ? child.int(C.finish.trail[0], C.finish.trail[1]) : 0;
      out.push({
        type: isPat ? 'PAT' : 'FG',
        distance: isPat ? 0 : child.int(C.fgRange[0], C.fgRange[1]),
        q: C.clock.q[Math.min(C.clock.q.length - 1, Math.floor(i * C.clock.q.length / n))],
        clock: last ? C.clock.lastSec : child.int(60, Tuning.sim.clock.quarterSec),
        oppBefore: 0,
        tdBefore: isPat ? TD_PTS : 0,
        trail: trail,
        last: last
      });
      projected += (isPat ? TD_PTS + PAT_PTS : FG_PTS);
    }
    // the opponent's scores, dropped into the gaps between your chances (and, in a game that does not end on
    // your kick, after the last one)
    var slots = scripted ? n - 1 : n + 1;                                          // the scripted finish takes the trail instead
    var left = Math.max(0, Math.round(projected * child.float(C.opp.ratio[0], C.opp.ratio[1])));
    // a game meant to end on your kick cannot be out of reach before you take it: the opponent stays level with
    // what your offence set up, and the trail is their answering score
    if (scripted) left = Math.min(left, projected - (out[n - 1].type === 'PAT' ? PAT_PTS : FG_PTS));
    var tail = 0;
    while (left >= FG_PTS && slots > 0) {
      var td = left >= TD_PTS + PAT_PTS && child.chance(C.opp.tdShare);
      var pts = td ? TD_PTS + PAT_PTS : FG_PTS;
      var slot = child.int(0, slots - 1);
      if (slot >= n) tail += pts; else out[slot].oppBefore += pts;
      left -= pts;
    }
    return { chances: out, oppAfter: tail, otWin: child.chance(C.ot.win) };
  }

  /**
   * Points that land on the board right before a chance. On the scripted finish the opponent's answering score
   * puts them exactly `trail` in front — unless a bad night already left them further ahead, in which case the
   * kick is honestly not a game-winner and the scoreboard says so.
   */
  function advanceScore(score, ch) {
    score.them += ch.oppBefore;
    score.us += ch.tdBefore;
    if (ch.trail) score.them = Math.max(score.them, score.us + ch.trail);
    return score;
  }
  function applyChance(sess, i) {
    if (sess.cursor > i) return sess.score;
    sess.cursor = i + 1;
    return advanceScore(sess.score, sess.chances[i]);
  }

  /** A KickContext for one chance, with the scoreboard as it stands. Draws: 0 (explicit hash and wind). */
  function contextFor(state, sess, ch, i, score) {
    var K = Kick();
    var pts = ch.type === 'PAT' ? PAT_PTS : FG_PTS;
    var behind = score.them - score.us;
    var decisive = ch.last && behind >= 0 && behind < pts;                          // making it takes the lead
    var ctx = K.buildContext(state, null, {
      type: ch.type, distance: ch.distance || undefined, hash: 0, isUser: true, forSession: true,
      league: 'COLLEGE', side: sess.home ? 'home' : 'away', away: !sess.home,
      gameWeather: sess.weather, weather: sess.weather.weather, tempF: sess.weather.tempF,
      surface: sess.weather.surface, altitude: false, dome: false, wind: sess.wind,
      rivalry: sess.rivalry, playoff: sess.playoff,
      decisive: decisive, asTimeExpires: !!ch.trail && ch.last, late: ch.q >= 4,
      game: { q: ch.q, clock: ch.clock, scoreFor: score.us, scoreAgainst: score.them, week: sess.week }
    });
    ctx.label = labelFor(sess, ch, i, decisive);
    ctx.hsChance = i;
    return ctx;
  }

  function labelFor(sess, ch, i, decisive) {
    var n = sess.chances.length;
    var what = ch.type === 'PAT' ? 'Extra point' : ch.distance + ' yd';
    var when = 'Q' + ch.q + (ch.last ? ' · final play' : '');
    return what + ' · ' + when + (decisive ? ' · to win it' : ' · ' + (i + 1) + '/' + n);
  }

  // ═══════════════════════════════ playing a game ═══════════════════════════════

  /**
   * Fold a kick into the scoreboard and rebuild the next context from what actually happened. Draws: 0.
   * @param {Object} state @param {RNG} rng @param {Object} sess @param {number} idx @param {Object} result
   */
  HS.afterKick = function (state, rng, sess, idx, result) {
    var ch = sess.chances[idx];
    if (!ch) return sess;
    applyChance(sess, idx);
    var pts = ch.type === 'PAT' ? PAT_PTS : FG_PTS;
    var made = !!(result && result.made);
    if (made) sess.score.us += pts;
    sess.log.push({
      q: ch.q, type: ch.type, distance: sess.contexts[idx] ? sess.contexts[idx].distance : ch.distance,
      made: made, decisive: !!(sess.contexts[idx] && sess.contexts[idx].decisive),
      us: sess.score.us, them: sess.score.them
    });
    var next = idx + 1;
    if (next < sess.chances.length) {
      applyChance(sess, next);
      sess.contexts[next] = contextFor(state, sess, sess.chances[next], next, sess.score);
    }
    return sess;
  };

  /**
   * Close a senior-season game: final score, the game record, and the recruiting board's move.
   * Draws: headline 1. The fifth game hands off to HS.finishSeason.
   * @param {Object} state @param {RNG} rng @param {Object} sess @returns {Object} SessionOutcome
   */
  HS.finishGame = function (state, rng, sess) {
    var hs = HS.current(state);
    if (!hs) fail('finishGame', 'no senior season on this career');
    var g = hs.games[sess.gameIdx];
    if (!g) fail('finishGame', 'no game ' + sess.gameIdx);
    var C = T();
    sess.score.them += num(sess.oppAfter, 0);
    // high-school football does not tie: overtime ends on a walk-off touchdown
    var ot = sess.score.us === sess.score.them;
    if (ot) { if (sess.otWin) sess.score.us += C.ot.pts; else sess.score.them += C.ot.pts; }
    var tally = { fgm: 0, fga: 0, xpm: 0, xpa: 0, long: 0, gw: 0, gwa: 0 };
    for (var i = 0; i < sess.contexts.length; i++) {
      var ctx = sess.contexts[i], r = sess.results[i];
      if (!ctx || !r) continue;
      var made = !!r.made;
      if (ctx.type === 'PAT') { tally.xpa++; if (made) tally.xpm++; }
      else {
        tally.fga++;
        if (made) { tally.fgm++; if (ctx.distance >= C.longFrom) tally.long++; }
      }
      if (ctx.decisive) { tally.gwa++; if (made) tally.gw++; }
    }
    g.played = true;
    g.us = sess.score.us; g.them = sess.score.them;
    g.won = g.us > g.them; g.tie = g.us === g.them; g.ot = ot;
    g.fgm = tally.fgm; g.fga = tally.fga; g.xpm = tally.xpm; g.xpa = tally.xpa;
    g.long = tally.long; g.gw = tally.gw; g.gwa = tally.gwa;
    g.kicks = sess.log.slice();
    var t = hs.totals;
    t.fgm += tally.fgm; t.fga += tally.fga; t.xpm += tally.xpm; t.xpa += tally.xpa;
    t.long += tally.long; t.gw += tally.gw; t.gwa += tally.gwa;
    if (g.won) t.wins++; else if (g.tie) t.ties++; else t.losses++;
    var movers = moveBoard(hs, g, tally);
    hs.idx = sess.gameIdx + 1;
    if (state.pending && state.pending.kind === 'KICKS' && state.pending.session === sess) state.pending = null;
    state.week = g.week;
    var line = tally.fgm + '/' + tally.fga + ' FG' + (tally.gw ? ', the game-winner' : '');
    timeline(state, 'HS_GAME', 'Week ' + g.week + ' vs ' + g.opp + ': ' + (g.won ? 'W ' : g.tie ? 'T ' : 'L ') + g.us + '-' + g.them + (ot ? ' OT' : '') + ' (' + line + ')', g.gw ? 3 : 1);
    headline(state, rng, 'hsGame', {                                               // 1 draw
      text: '{last} goes ' + tally.fgm + '-for-' + tally.fga + ' as ' + hs.school.full + (g.won ? ' beat ' : ' fall to ') + g.opp + ' ' + g.us + '-' + g.them
    });
    var out = {
      kind: 'HS_GAME', gameIdx: sess.gameIdx, week: g.week, opp: g.opp, home: g.home,
      us: g.us, them: g.them, won: g.won, tie: g.tie, ot: ot,
      fgm: tally.fgm, fga: tally.fga, xpm: tally.xpm, xpa: tally.xpa, long: tally.long,
      gw: tally.gw, gwa: tally.gwa, movers: movers, seasonDone: hs.idx >= hs.games.length, season: null
    };
    if (out.seasonDone) out.season = HS.finishSeason(state, rng);
    return out;
  };

  /** Move every board school by what the tape showed, scaled by how hard that school is to impress. Draws: 0. */
  function moveBoard(hs, g, tally) {
    var C = T().interest, movers = [];
    var base = tally.fgm * C.make + (tally.fga - tally.fgm) * C.miss
      + tally.xpm * C.pat + (tally.xpa - tally.xpm) * C.patMiss
      + tally.long * C.long + tally.gw * C.gw + (tally.gwa - tally.gw) * C.gwMiss
      + (g.won ? C.win : g.tie ? 0 : C.loss);
    for (var i = 0; i < hs.board.length; i++) {
      var row = hs.board[i];
      var resist = 1 - clamp((row.prestige - 1) * C.prestigeResist, 0, 0.8);
      var pull = num(row.pull, 1);
      var delta = Math.round(base * pull * (base > 0 ? resist : 1));                // bad tape costs everyone the same
      var before = row.interest;
      row.interest = clamp(row.interest + delta, C.min, C.max);
      row.moved = row.interest - before;
      if (row.moved) movers.push({ teamId: row.teamId, school: row.school, abbr: row.abbr, moved: row.moved, interest: row.interest });
    }
    hs.board = Util.stableSort(hs.board, function (a, b) { return b.interest - a.interest; });
    return Util.stableSort(movers, function (a, b) { return Math.abs(b.moved) - Math.abs(a.moved); }).slice(0, 3);
  }

  /** Interest tier for the UI: OFFER / HIGH / WARM / COLD. */
  HS.tierOf = function (interest) {
    var C = T().interest;
    if (interest >= C.offerAt) return 'OFFER';
    if (interest >= C.highAt) return 'HIGH';
    if (interest >= C.warmAt) return 'WARM';
    return 'COLD';
  };

  // ═══════════════════════════════ §2.7.1 stars & offers ═══════════════════════════════

  /**
   * The 0-6 rating the star formula reads, from the whole five-game stretch: field-goal rate carries it, extra
   * points and the games you won with your leg fill the rest, long makes are the bonus.
   * @param {Object} hs @returns {number}
   */
  HS.ratingOf = function (hs) {
    var R = T().rating, t = hs.totals;
    var fg = t.fga ? t.fgm / t.fga : 0;
    var pat = t.xpa ? t.xpm / t.xpa : 1;
    var gw = t.gwa ? t.gw / t.gwa : 0;
    var core = R.scale * (R.fgW * fg + R.patW * pat + R.gwW * gw);
    return clamp(Util.round1(core + Math.min(t.long * R.longAdd, R.longMax)), 0, R.scale);
  };

  /**
   * Close the senior season (§2.7.1): stars from the five-game rating, Player.applyStars, the walk-on path, then
   * the college offers decision — with every school that reached the offer line on the board already in it.
   * Draws: Career.generateCollegeOffers 1 → headline 1.
   * @param {Object} state @param {RNG} rng @returns {Object} {kind:'HS_SEASON', rating, stars, walkon, record, decision}
   */
  HS.finishSeason = function (state, rng) {
    var hs = HS.current(state);
    if (!hs) fail('finishSeason', 'no senior season on this career');
    var C = Career(), P = Player();
    if (!C || !P) fail('finishSeason', 'RTG.Career and RTG.Player are required');
    var p = state.player, t = hs.totals;
    var rating = HS.ratingOf(hs);
    var ovr = P.ovr(p.attrs);
    var stars = C.starsFor(ovr, rating);
    P.applyStars(p, stars);
    var walkon = stars <= Tuning.draft.stars.walkon;
    var f = sflags(state);
    if (walkon) { f.WALKON = true; p.morale = clamp(p.morale + Tuning.soft.start.walkonMorale, Tuning.soft.min, Tuning.soft.max); }
    var record = t.wins + '-' + t.losses + (t.ties ? '-' + t.ties : '');
    hs.rating = rating;
    hs.summary = { stars: stars, walkon: walkon, rating: rating, record: record, ovr: ovr };
    state.pending = null;
    state.stage = 'HS';
    state.phase = 'OFFERS';
    var committed = [];
    for (var i = 0; i < hs.board.length; i++) if (HS.tierOf(hs.board[i].interest) === 'OFFER') committed.push(hs.board[i]);
    committed = Util.stableSort(committed, function (a, b) { return (b.prestige - a.prestige) || (b.interest - a.interest); });
    for (var j = 0; j < committed.length; j++) committed[j] = committed[j].teamId;
    var dec = C.generateCollegeOffers(state, rng, 'RECRUIT', { from: committed, interest: hs.board });   // 1 draw
    state.pending = { kind: 'DECISION', decision: dec };
    headline(state, rng, 'hsSeason', {                                             // 1 draw
      text: '{last} finishes the senior year ' + t.fgm + '-for-' + t.fga + ' and rates a ' + stars + '-star recruit' + (walkon ? '; walk-on offers only' : '')
    });
    timeline(state, 'HS_SEASON', 'Senior year: ' + record + ', ' + t.fgm + '/' + t.fga + ' FG — ' + stars + '★' + (walkon ? ' (walk-on)' : ''), 3);
    return { kind: 'HS_SEASON', rating: rating, stars: stars, walkon: walkon, record: record, totals: t, decision: dec };
  };

  RTG.HS = HS;
})(typeof window !== 'undefined' ? window : globalThis);
