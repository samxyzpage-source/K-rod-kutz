/**
 * Road to Glory: Kicker — RTG.Schedule (SPEC §2.6, §3.5.9)
 *
 * Regular-season schedule generation for both leagues. Pure: no DOM, no
 * clocks; all randomness comes from the rng passed in (NFL slotting only —
 * the college schedule is fully determined by `year`).
 *
 * Game (§3.4):
 *   { id, week, homeId, awayId, kind:'REG', venue (= homeId), played:false,
 *     conf: bool (same-conference game), div: bool (NFL same-division),
 *     rivalry: bool (college week-12 rival game) }
 * Ids look like 'C1-w03-ATT-CHS' / 'N4-w12-BOS-PIT' (league letter + year,
 * week, home abbr, away abbr).
 *
 * College (§2.6.1): 13 weeks; conference round robin by the circle method
 * with round 0 (rival pairs (0,7)(1,6)(2,5)(3,4)) in week 12; non-conference
 * games by a 5-round circle method among the 6 conferences with
 * `A[t] vs B[(t + r + year) mod 8]`, home = A if (t + year) even.
 * Conference home/away is then assigned greedily so every team ends 6/6 ±1.
 *
 * NFL (§2.6.2): 17 games / 18 weeks. The 272-game list is built from the
 * division/rotation rules, decomposed into 17 perfect-matching "rounds"
 * (6 divisional, 4 + 4 rotating divisions, 2 + 1 place-based), the rounds are
 * shuffled into 17 of the 18 weeks, and byes are created by pulling a random
 * perfect matching of games out of the rounds that landed in the bye window
 * (weeks 5–14) into the spare week. Restarts (seeded) only happen inside the
 * bye-matching search. Deterministic for a seed; < 50 ms.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  var Util = RTG.Util, Tuning = RTG.Tuning;

  var Schedule = {};

  // ─────────────────────────────── helpers ───────────────────────────────

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  /** Positive modulo. */
  function mod(a, m) { return ((a % m) + m) % m; }

  /** @returns {Object<string, Team>} id → team */
  function byId(league) {
    var map = {};
    for (var i = 0; i < league.teams.length; i++) map[league.teams[i].id] = league.teams[i];
    return map;
  }

  /**
   * League letter used in game ids ('C' college, 'N' NFL).
   * @param {'COLLEGE'|'NFL'} kind
   */
  function letterFor(kind) { return kind === 'NFL' ? 'N' : 'C'; }

  /**
   * Build a regular-season Game object.
   * @param {string} letter 'C'|'N' @param {number} year @param {number} week
   * @param {Team} home @param {Team} away @param {{conf?:boolean, div?:boolean, rivalry?:boolean}} [flags]
   * @returns {Game}
   */
  function makeGame(letter, year, week, home, away, flags) {
    flags = flags || {};
    return {
      id: letter + year + '-w' + pad2(week) + '-' + home.abbr + '-' + away.abbr,
      week: week,
      homeId: home.id,
      awayId: away.id,
      kind: 'REG',
      venue: home.id,
      played: false,
      conf: !!flags.conf,
      div: !!flags.div,
      rivalry: !!flags.rivalry
    };
  }

  /**
   * Circle-method rounds for an even number of slots. Round 0 pairs
   * (0,n−1), (1,n−2), … which is exactly the rival pairing for n = 8.
   * @param {number} n even @returns {number[][][]} rounds[r] = [[i, j], …]
   */
  function circleRounds(n) {
    var rounds = [];
    var rot = [];
    for (var i = 1; i < n; i++) rot.push(i);
    for (var r = 0; r < n - 1; r++) {
      var pos = [0].concat(rot);
      var pairs = [];
      for (var k = 0; k < n / 2; k++) pairs.push([pos[k], pos[n - 1 - k]]);
      rounds.push(pairs);
      rot.unshift(rot.pop());      // rotate clockwise
    }
    return rounds;
  }

  // ─────────────────────────────── college ───────────────────────────────

  /**
   * Conference ids in data order, derived from the league's teams.
   * @param {League} league @returns {string[]}
   */
  function conferenceOrder(league) {
    var seen = {}, out = [];
    for (var i = 0; i < league.teams.length; i++) {
      var c = league.teams[i].conf;
      if (!seen[c]) { seen[c] = true; out.push(c); }
    }
    return out;
  }

  /**
   * Teams of each conference indexed by confIdx (0..7).
   * @param {League} league @param {string[]} confs @returns {Object<string, Team[]>}
   */
  function conferenceTables(league, confs) {
    var tables = {};
    for (var c = 0; c < confs.length; c++) tables[confs[c]] = [];
    for (var i = 0; i < league.teams.length; i++) {
      var t = league.teams[i];
      var idx = typeof t.confIdx === 'number' ? t.confIdx : tables[t.conf].length;
      tables[t.conf][idx] = t;
    }
    return tables;
  }

  /**
   * Greedy conference home/away assignment so that every team lands on 6/6 ±1
   * for the season. Games are visited in a fixed order; the team with fewer
   * home games so far hosts (ties: the lower confIdx hosts when the round
   * index is even, else the higher).
   * @param {{a:Team, b:Team, week:number, round:number}[]} pairs
   * @param {Object<string, number>} homeCount running home-game count per team id (mutated)
   * @returns {{home:Team, away:Team, week:number, round:number}[]}
   */
  function assignConferenceHomes(pairs, homeCount) {
    var out = [];
    for (var i = 0; i < pairs.length; i++) {
      var p = pairs[i];
      var ha = homeCount[p.a.id] || 0, hb = homeCount[p.b.id] || 0;
      var aHome;
      if (ha !== hb) aHome = ha < hb;
      else aHome = (p.round % 2 === 0) ? (p.a.confIdx < p.b.confIdx) : (p.a.confIdx > p.b.confIdx);
      var home = aHome ? p.a : p.b, away = aHome ? p.b : p.a;
      homeCount[home.id] = (homeCount[home.id] || 0) + 1;
      out.push({ home: home, away: away, week: p.week, round: p.round });
    }
    return out;
  }

  /**
   * College regular season (§2.6.1): 12 games per team over weeks 1–12
   * (7 conference, 5 non-conference), rivalry week 12. Week 13 (CCGs) is
   * added later by Standings.conferenceChampionshipGames.
   * Deterministic: `rng` is accepted for API symmetry but not drawn from.
   * @param {League} league college league (48 teams, 6 conferences × 8)
   * @param {number} year career year (1-based)
   * @param {RNG} [rng] unused (no draws)
   * @returns {Game[]}
   */
  Schedule.college = function (league, year, rng) {
    var C = Tuning.schedule.college;
    var confs = conferenceOrder(league);
    var tables = conferenceTables(league, confs);
    var perConf = C.perConf;
    var games = [];
    var homeCount = {};
    var i, c, r, t;

    // 1. Non-conference: 5-round circle method among the 6 conferences.
    //    Pair (A, B) in round r: A[t] vs B[(t + r + year) mod 8], home = A if (t + year) even.
    var confRounds = circleRounds(confs.length);
    var ncWeeks = C.nonConfWeeks;
    for (r = 0; r < confRounds.length; r++) {
      var week = ncWeeks[r];
      for (i = 0; i < confRounds[r].length; i++) {
        var A = tables[confs[confRounds[r][i][0]]];
        var B = tables[confs[confRounds[r][i][1]]];
        for (t = 0; t < perConf; t++) {
          var ta = A[t], tb = B[mod(t + r + year, perConf)];
          var aHome = (t + year) % 2 === 0;
          var home = aHome ? ta : tb, away = aHome ? tb : ta;
          homeCount[home.id] = (homeCount[home.id] || 0) + 1;
          games.push(makeGame('C', year, week, home, away, { conf: false }));
        }
      }
    }

    // 2. Conference round robin: circle method, round 0 (rival pairs) in week 12,
    //    rounds 1..6 in the remaining conference weeks in order.
    var rounds = circleRounds(perConf);
    var confWeeks = C.confWeeks;         // [4, 6, 7, 8, 10, 11, 12]
    var rivalryWeek = C.rivalryWeek;
    var otherWeeks = [];
    for (i = 0; i < confWeeks.length; i++) if (confWeeks[i] !== rivalryWeek) otherWeeks.push(confWeeks[i]);
    var pairs = [];
    for (c = 0; c < confs.length; c++) {
      var table = tables[confs[c]];
      for (r = 0; r < rounds.length; r++) {
        var wk = r === 0 ? rivalryWeek : otherWeeks[r - 1];
        for (i = 0; i < rounds[r].length; i++) {
          pairs.push({ a: table[rounds[r][i][0]], b: table[rounds[r][i][1]], week: wk, round: r });
        }
      }
    }
    var oriented = assignConferenceHomes(pairs, homeCount);
    for (i = 0; i < oriented.length; i++) {
      var o = oriented[i];
      games.push(makeGame('C', year, o.week, o.home, o.away, { conf: true, rivalry: o.round === 0 }));
    }

    games.sort(function (x, y) { return x.week - y.week || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0); });
    return games;
  };

  // ─────────────────────────────── NFL ───────────────────────────────

  /** The three perfect matchings of 4 divisions (pairs of division indices). */
  var DIV_MATCHINGS = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
  /** The complementary 4-cycle of each matching, as a cyclic order of divisions. */
  var DIV_CYCLES = [[0, 2, 1, 3], [0, 1, 2, 3], [0, 1, 3, 2]];

  /**
   * Same-conference partner division for `d` this year (§2.6.2 rotation).
   * The spec's `(year + divIdx) mod 3` is not symmetric, so the rotation
   * cycles through the three perfect matchings of the four divisions.
   * @param {number} d @param {number} year @returns {number}
   */
  function intraPartner(d, year) {
    var m = DIV_MATCHINGS[mod(year, 3)];
    for (var i = 0; i < m.length; i++) {
      if (m[i][0] === d) return m[i][1];
      if (m[i][1] === d) return m[i][0];
    }
    return -1;
  }

  /**
   * Group teams by 'confIdx:divIdx' and order them by place (previous
   * standing; data order in year 1 / when no standings are given).
   * @param {League} league @param {Array|Object|null} prevStandings
   * @returns {Object<string, Team[]>}
   */
  function divisionTables(league, prevStandings) {
    var place = {};
    var i;
    if (Array.isArray(prevStandings)) {
      for (i = 0; i < prevStandings.length; i++) {
        var row = prevStandings[i];
        if (row && row.teamId !== undefined) place[row.teamId] = typeof row.divRank === 'number' ? row.divRank : i;
      }
    } else if (prevStandings && typeof prevStandings === 'object') {
      for (var id in prevStandings) place[id] = Number(prevStandings[id]);
    }
    var tables = {};
    for (i = 0; i < league.teams.length; i++) {
      var t = league.teams[i];
      var key = t.confIdx + ':' + t.divIdx;
      (tables[key] = tables[key] || []).push({ team: t, order: i, place: place[t.id] });
    }
    for (var k in tables) {
      tables[k].sort(function (x, y) {
        var px = x.place === undefined ? 1e9 : x.place, py = y.place === undefined ? 1e9 : y.place;
        return px - py || x.order - y.order;
      });
      tables[k] = tables[k].map(function (e) { return e.team; });
    }
    return tables;
  }

  /**
   * One round of a random 1-factorization of K4,4 between two divisions:
   * X[i] plays Y[perm[(i + j) mod 4]] in round j. Home: X hosts when
   * (i + perm[..] + year) is even → 2/2 for everybody, symmetric.
   * @returns {{home:Team, away:Team}[][]} 4 rounds of 4 games
   */
  function bipartiteRounds(X, Y, perm, year) {
    var rounds = [];
    for (var j = 0; j < 4; j++) {
      var g = [];
      for (var i = 0; i < 4; i++) {
        var k = perm[(i + j) % 4];
        var xHome = (i + k + year) % 2 === 0;
        g.push({ home: xHome ? X[i] : Y[k], away: xHome ? Y[k] : X[i] });
      }
      rounds.push(g);
    }
    return rounds;
  }

  /**
   * Build the 17 perfect-matching rounds of an NFL season (§2.6.2 opponent
   * rules). Draws: per division a shuffle of 3 matchings (2 draws) + 1 chance;
   * per division pair a shuffle of 4 (3 draws); per (conference, place) 1 chance.
   * @returns {{games: {home:Team, away:Team, div:boolean, conf:boolean}[], tag:string}[]}
   */
  function nflRounds(league, year, prevStandings, rng) {
    var tables = divisionTables(league, prevStandings);
    var nConf = Tuning.schedule.nfl.conferences, nDiv = Tuning.schedule.nfl.divisions;
    var rounds = [];
    var c, d, i, j, k, r;
    var div = function (cc, dd) { return tables[cc + ':' + dd]; };

    // 1. Divisional: 6 rounds. Each division picks its own order of the 3
    //    matchings and which orientation comes first.
    for (r = 0; r < 6; r++) rounds.push({ games: [], tag: 'DIV' + r });
    for (c = 0; c < nConf; c++) {
      for (d = 0; d < nDiv; d++) {
        var T = div(c, d);
        var order = rng.shuffle([0, 1, 2]);
        var flip = rng.chance(0.5);
        for (i = 0; i < 3; i++) {
          var m = DIV_MATCHINGS[order[i]];
          for (var half = 0; half < 2; half++) {
            var first = (half === 0) !== flip;
            for (j = 0; j < m.length; j++) {
              var a = T[m[j][0]], b = T[m[j][1]];
              rounds[i * 2 + half].games.push({ home: first ? a : b, away: first ? b : a, div: true, conf: true });
            }
          }
        }
      }
    }

    // 2. Same-conference rotating division: 4 rounds (K4,4 per division pair).
    for (r = 0; r < 4; r++) rounds.push({ games: [], tag: 'INTRA' + r });
    for (c = 0; c < nConf; c++) {
      for (d = 0; d < nDiv; d++) {
        var pd = intraPartner(d, year);
        if (pd < d) continue;
        var perm = rng.shuffle([0, 1, 2, 3]);
        var br = bipartiteRounds(div(c, d), div(c, pd), perm, year);
        for (r = 0; r < 4; r++) for (k = 0; k < 4; k++) {
          rounds[6 + r].games.push({ home: br[r][k].home, away: br[r][k].away, div: false, conf: true });
        }
      }
    }

    // 3. Other-conference rotating division: conf 0 division d ↔ conf 1 division (year + d) mod 4.
    for (r = 0; r < 4; r++) rounds.push({ games: [], tag: 'CROSS' + r });
    for (d = 0; d < nDiv; d++) {
      var xd = mod(year + d, nDiv);
      var perm2 = rng.shuffle([0, 1, 2, 3]);
      var br2 = bipartiteRounds(div(0, d), div(1, xd), perm2, year);
      for (r = 0; r < 4; r++) for (k = 0; k < 4; k++) {
        rounds[10 + r].games.push({ home: br2[r][k].home, away: br2[r][k].away, div: false, conf: false });
      }
    }

    // 4. Same-conference place-based: the two divisions not matched with d form,
    //    with d and its partner, a 4-cycle; each place plays its counterparts in
    //    the two adjacent divisions of the cycle. Orientation alternates by year.
    rounds.push({ games: [], tag: 'PLACE0' });
    rounds.push({ games: [], tag: 'PLACE1' });
    var cycle = DIV_CYCLES[mod(year, 3)];
    for (c = 0; c < nConf; c++) {
      for (var p = 0; p < 4; p++) {
        var swap = rng.chance(0.5);
        for (i = 0; i < 4; i++) {
          var from = cycle[i], to = cycle[(i + 1) % 4];
          var fromHome = year % 2 === 0;
          var home = fromHome ? div(c, from)[p] : div(c, to)[p];
          var away = fromHome ? div(c, to)[p] : div(c, from)[p];
          var slot = ((i % 2 === 0) !== swap) ? 14 : 15;
          rounds[slot].games.push({ home: home, away: away, div: false, conf: true });
        }
      }
    }

    // 5. Other-conference place-based: conf 0 division d ↔ conf 1 division
    //    (year + d + 2) mod 4, hosted by Liberty (conf 0) in even years.
    rounds.push({ games: [], tag: 'XPLACE' });
    var libertyHosts = year % 2 === 0;
    for (d = 0; d < nDiv; d++) {
      var yd = mod(year + d + 2, nDiv);
      for (p = 0; p < 4; p++) {
        var L = div(0, d)[p], F = div(1, yd)[p];
        rounds[16].games.push({ home: libertyHosts ? L : F, away: libertyHosts ? F : L, div: false, conf: false });
      }
    }
    return rounds;
  }

  /**
   * Pull a perfect matching of games (one per team) out of the rounds sitting
   * in the bye window, capped at `maxByesPerWeek / 2` games per round.
   * Randomised greedy with seeded restarts; returns null when it fails.
   * @param {{games:Object[], week:number}[]} windowRounds
   * @param {number} nTeams @param {number} capPerRound @param {number} tries @param {RNG} rng
   * @returns {{round:number, game:number}[]|null}
   */
  function pullByeMatching(windowRounds, nTeams, capPerRound, tries, rng) {
    var candidates = [];
    var r, g;
    for (r = 0; r < windowRounds.length; r++) {
      for (g = 0; g < windowRounds[r].games.length; g++) candidates.push({ round: r, game: g });
    }
    var need = nTeams / 2;
    for (var attempt = 0; attempt < tries; attempt++) {
      rng.shuffle(candidates);
      var busy = {}, used = [], picked = [];
      for (r = 0; r < windowRounds.length; r++) used.push(0);
      for (var i = 0; i < candidates.length && picked.length < need; i++) {
        var cnd = candidates[i];
        if (used[cnd.round] >= capPerRound) continue;
        var game = windowRounds[cnd.round].games[cnd.game];
        if (busy[game.home.id] || busy[game.away.id]) continue;
        busy[game.home.id] = busy[game.away.id] = true;
        used[cnd.round]++;
        picked.push(cnd);
      }
      if (picked.length === need) return picked;
    }
    return null;
  }

  /**
   * NFL regular season (§2.6.2): 17 games per team in 18 weeks, one bye per
   * team in weeks 5–14, ≤ 16 games per week.
   * RNG: round construction shuffles (see nflRounds), a shuffle of the 17
   * rounds into 18 week slots (17 draws), then the bye-matching search
   * (a shuffle of ~150 candidates per attempt; restarts up to
   * Tuning.schedule.nfl.maxRestarts, relaxing the per-week bye cap after
   * slotShuffles attempts).
   * @param {League} league NFL league (32 teams)
   * @param {number} year career year
   * @param {Array|Object|null} prevStandings previous season StandingRow[] (uses divRank), a {teamId: place} map, or null (data order)
   * @param {RNG} rng
   * @returns {Game[]}
   */
  Schedule.nfl = function (league, year, prevStandings, rng) {
    var N = Tuning.schedule.nfl;
    var nTeams = league.teams.length;
    var rounds = nflRounds(league, year, prevStandings, rng);
    var totalWeeks = N.regWeeks;
    var lo = N.byeWeeks[0], hi = N.byeWeeks[1];
    var i, r;

    // Slot the 17 rounds into 18 weeks: one week stays spare for the pulled games.
    var slots = [];
    for (i = 1; i <= totalWeeks; i++) slots.push(i);
    rng.shuffle(slots);
    var spareWeek = slots[rounds.length];
    for (r = 0; r < rounds.length; r++) rounds[r].week = slots[r];

    var windowRounds = [];
    for (r = 0; r < rounds.length; r++) if (rounds[r].week >= lo && rounds[r].week <= hi) windowRounds.push(rounds[r]);

    var cap = Math.floor(N.maxByesPerWeek / 2);
    var picked = pullByeMatching(windowRounds, nTeams, cap, N.slotShuffles, rng);
    if (!picked) picked = pullByeMatching(windowRounds, nTeams, nTeams / 2, N.maxRestarts, rng);
    if (!picked) throw new Error('Schedule.nfl: bye matching failed');

    var moved = {};
    for (i = 0; i < picked.length; i++) {
      var key = picked[i].round + ':' + picked[i].game;
      moved[key] = true;
    }

    var games = [];
    for (r = 0; r < rounds.length; r++) {
      var wr = windowRounds.indexOf(rounds[r]);
      for (var g = 0; g < rounds[r].games.length; g++) {
        var e = rounds[r].games[g];
        var week = (wr >= 0 && moved[wr + ':' + g]) ? spareWeek : rounds[r].week;
        games.push(makeGame('N', year, week, e.home, e.away, { conf: e.conf, div: e.div }));
      }
    }
    games.sort(function (x, y) { return x.week - y.week || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0); });
    return games;
  };

  // ─────────────────────────────── queries ───────────────────────────────

  /**
   * Week counts for a league.
   * @param {League|'COLLEGE'|'NFL'} league league object or kind
   * @returns {{reg:number, post:number, total:number, playoffWeeks:number[]}}
   */
  Schedule.weeksFor = function (league) {
    var kind = typeof league === 'string' ? league : (league && league.kind);
    var T = kind === 'NFL' ? Tuning.schedule.nfl : Tuning.schedule.college;
    return { reg: T.regWeeks, post: T.playoffWeeks.length, total: T.totalWeeks, playoffWeeks: T.playoffWeeks.slice() };
  };

  /**
   * Games scheduled in a week (any kind).
   * @param {Game[]} schedule @param {number} week @returns {Game[]}
   */
  Schedule.gamesInWeek = function (schedule, week) {
    var out = [];
    for (var i = 0; i < schedule.length; i++) if (schedule[i].week === week) out.push(schedule[i]);
    return out;
  };

  /**
   * Games involving a team, in week order.
   * @param {Game[]} schedule @param {string} teamId @returns {Game[]}
   */
  Schedule.teamGames = function (schedule, teamId) {
    var out = [];
    for (var i = 0; i < schedule.length; i++) {
      if (schedule[i].homeId === teamId || schedule[i].awayId === teamId) out.push(schedule[i]);
    }
    out.sort(function (x, y) { return x.week - y.week; });
    return out;
  };

  /**
   * The game a team plays in a week, or null (bye).
   * @param {Game[]} schedule @param {string} teamId @param {number} week @returns {Game|null}
   */
  Schedule.gameFor = function (schedule, teamId, week) {
    for (var i = 0; i < schedule.length; i++) {
      var g = schedule[i];
      if (g.week === week && (g.homeId === teamId || g.awayId === teamId)) return g;
    }
    return null;
  };

  /**
   * Find a game by id.
   * @param {Game[]} schedule @param {string} gameId @returns {Game|null}
   */
  Schedule.findGame = function (schedule, gameId) {
    for (var i = 0; i < schedule.length; i++) if (schedule[i].id === gameId) return schedule[i];
    return null;
  };

  /**
   * Structural validation of a regular-season schedule (used by tests and
   * debug). Returns {ok, errors[]}.
   * @param {Game[]} schedule @param {League} league @returns {{ok:boolean, errors:string[]}}
   */
  Schedule.validate = function (schedule, league) {
    var errors = [];
    var kind = league.kind;
    var T = kind === 'NFL' ? Tuning.schedule.nfl : Tuning.schedule.college;
    var teams = byId(league);
    var perTeam = {}, perWeek = {}, weekTeam = {};
    var ids = {};
    var i, id;
    for (i = 0; i < schedule.length; i++) {
      var g = schedule[i];
      if (ids[g.id]) errors.push('duplicate id ' + g.id);
      ids[g.id] = true;
      if (!teams[g.homeId]) errors.push('unknown home ' + g.homeId);
      if (!teams[g.awayId]) errors.push('unknown away ' + g.awayId);
      if (g.homeId === g.awayId) errors.push('self game ' + g.id);
      if (g.kind !== 'REG') continue;
      if (g.week < 1 || g.week > T.regWeeks) errors.push('bad week ' + g.id);
      perWeek[g.week] = (perWeek[g.week] || 0) + 1;
      var sides = [g.homeId, g.awayId];
      for (var s = 0; s < 2; s++) {
        id = sides[s];
        var wk = g.week + ':' + id;
        if (weekTeam[wk]) errors.push('team twice in week ' + wk);
        weekTeam[wk] = true;
        perTeam[id] = (perTeam[id] || 0) + 1;
      }
    }
    var expected = kind === 'NFL' ? T.games : T.confGames + T.nonConfGames;
    for (id in teams) if ((perTeam[id] || 0) !== expected) errors.push('team ' + id + ' has ' + (perTeam[id] || 0) + ' games');
    for (var w in perWeek) if (perWeek[w] > league.teams.length / 2) errors.push('too many games in week ' + w);
    return { ok: errors.length === 0, errors: errors };
  };

  RTG.Schedule = Schedule;
})(typeof window !== 'undefined' ? window : globalThis);
