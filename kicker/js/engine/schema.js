/**
 * Road to Glory: Kicker — RTG.Schema (SPEC §3.4, §3.5.4)
 *
 * Typedefs for every state type, factories with sensible defaults, `validate`
 * and `reindex`. Pure over plain JSON. Later modules (Data, Names, Player,
 * Career, Kick) are resolved AT CALL TIME, never at load time.
 *
 * Conventions:
 *   - Teams are referenced by id. `league.teamIndex` and `league.kickers` are
 *     caches: `teamIndex` is non-enumerable (never serialised); `kickers[id]`
 *     is the SAME object as `team.kicker` and is re-linked by `reindex`.
 *   - Everything in `state` is JSON-serialisable: no functions, undefined,
 *     NaN, Infinity or cycles (validate checks this).
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  var Util = RTG.Util, Tuning = RTG.Tuning;
  var Schema = {};
  // Cached globals: inside a vm sandbox (test/load.js) every global lookup is slow, and validate is hot.
  var isArray = Array.isArray, hasOwn = Object.prototype.hasOwnProperty, mfloor = Math.floor, INF = 1 / 0;

  // ═══════════════════════════════ TYPEDEFS (§3.4) ═══════════════════════════════

  /**
   * @typedef {Object} CareerState
   * @property {number} v                 save schema version (mirrors RTG.SAVE_VERSION)
   * @property {number} seed              career seed (uint32, shareable)
   * @property {number} rngState          rng state after the last engine call
   * @property {'rookie'|'pro'|'allpro'|'legend'} difficulty
   * @property {number} createdAt         ms, supplied by the UI
   * @property {number} playtimeSec
   * @property {'HS'|'COLLEGE'|'DRAFT'|'NFL'|'RETIRED'} stage
   * @property {string} phase             HS: SHOWCASE|OFFERS · COLLEGE/NFL: PRE|REG|POST|AWARDS|OFF · DRAFT: DECLARE|COMBINE|DRAFT|UDFA · RETIRED: LEGACY
   * @property {number} year              1 = first college season; calendar = 2026 + year − 1
   * @property {number} week              1-based; PRE = 0; POST continues numbering
   * @property {Player} player
   * @property {{college: League, nfl: League}} leagues
   * @property {SeasonState} season
   * @property {GameState|null} game
   * @property {null|{kind:'EVENT', event: EventInstance}|{kind:'DECISION', decision: Decision}|{kind:'KICKS', session: KickSession}} pending
   * @property {History} history
   * @property {Stats} stats
   * @property {Records} records
   * @property {Message[]} inbox          capped Tuning.save.inboxCap
   * @property {Headline[]} headlines     capped Tuning.save.headlinesCap
   * @property {string[]} recentHeadlineIds  ring ≤ 40
   * @property {string[]} recentEventIds     ring ≤ 12
   * @property {Settings} settings
   * @property {Object<string, *>} flags  WALKON, UDFA, giveMe60, under55, ultimatum, farewell, …
   */

  /**
   * @typedef {Object} Player
   * @property {string} id
   * @property {{first:string, last:string, full:string}} name
   * @property {{city:string, state:string, region:string}} hometown
   * @property {'CANNON'|'SURGEON'|'ICEMAN'|'SOCCER'} archetype
   * @property {{skin:number, hair:number, boot:number}} look
   * @property {'R'|'L'} foot
   * @property {number} age
   * @property {number} stars 2..5
   * @property {Attrs} attrs   ints 1–99
   * @property {Attrs} pot     hidden caps
   * @property {number} xp @property {number} xpSpent @property {number} form  hidden float −6..6
   * @property {number} morale @property {number} trust @property {number} fans  0..100
   * @property {number} fame 0..1000 @property {number} js 0..100
   * @property {string[]} traits @property {Modifier[]} mods @property {Object<string,*>} flags
   * @property {null|{type:string, weeksLeft:number, careerThreat:boolean}} injury
   * @property {0|1|2} agentTier @property {string} agentName
   * @property {number} missStreak @property {number} makeStreak
   * @property {'K1'|'K2'|'NONE'} role
   * @property {string|null} teamId @property {'COLLEGE'|'NFL'|null} league
   * @property {Contract|null} contract
   * @property {number} nil        $k per year (college)
   * @property {boolean} redshirt @property {number} collegeSeasons @property {number} nflSeasons @property {number} seasonsAsStarter
   * @property {number} tags       franchise tags applied (max 2)
   */

  /** @typedef {{POW:number, ACC:number, CON:number, CLU:number, KO:number}} Attrs */

  /**
   * @typedef {Object} Contract
   * @property {'SCHOLARSHIP'|'WALKON'|'ROOKIE'|'UDFA'|'VET'|'TAG'|'MIN'} type
   * @property {number} years @property {number} yearIdx @property {number} aav $M
   * @property {number} gtdPct @property {number} signingBonus @property {number} startYear @property {number} [round]
   */

  /**
   * @typedef {Object} League
   * @property {'COLLEGE'|'NFL'} kind @property {number} year
   * @property {Team[]} teams
   * @property {Object<string, number>} teamIndex   cache (non-enumerable; rebuilt by reindex)
   * @property {number} [cap] @property {number} [vetMin] @property {number} [tagValue]   NFL only
   * @property {{year:number, championId:string, userTeamId:string|null, userLine:string}[]} seasonHistory
   * @property {Object<string, AIKicker>} kickers   K1 per team — same objects as team.kicker (re-linked by reindex)
   */

  /**
   * @typedef {Object} Team  (§2.5.1)
   * @property {string} id @property {string} name @property {string} city @property {string} nick @property {string} abbr
   * @property {string[]} colors [primary, secondary]
   * @property {string} conf @property {string|null} div @property {number|null} prestige  college 1–5
   * @property {number} OFF @property {number} DEF @property {number} ST @property {number} coachAgg 0..1
   * @property {'warm'|'temperate'|'cold'|'dome'} climate @property {boolean} dome @property {boolean} altitude @property {boolean} windy @property {boolean} rainy
   * @property {'grass'|'turf'} surface
   * @property {AIKicker|null} kicker @property {AIKicker|null} kicker2
   * @property {string} coach    display name ("Coach Halloran")
   * @property {string} [region] @property {number} [confIdx] @property {number} [divIdx] @property {string} [rival] @property {boolean} [bigMarket]
   */

  /**
   * @typedef {Object} AIKicker
   * @property {string} name @property {number} age @property {number} ovr
   * @property {Attrs} attrs @property {number} contractYears @property {KickerStats} seasonStats
   */

  /**
   * @typedef {Object} SeasonState
   * @property {'COLLEGE'|'NFL'} league @property {number} year
   * @property {Game[]} schedule
   * @property {Object<string, TeamResult>} results
   * @property {Object<string, {score:number, rank:number, prev:number}>} rankings   college only
   * @property {Object[]} standings
   * @property {Object|null} playoffs @property {Object[]|null} bowls
   * @property {{id:string, text:string, target:number, progress:number, met:boolean, xp:number}[]} goals
   * @property {boolean} trainingDone @property {'POW'|'ACC'|'CON'|'CLU'|'KO'|'REST'|null} focus
   * @property {string|null} userGameId @property {boolean} weekGameDone
   * @property {Object<string, KickerStats>} kickerStats   AI kickers this season
   */

  /**
   * @typedef {Object} Game
   * @property {string} id @property {number} week @property {string} homeId @property {string} awayId
   * @property {'REG'|'CCG'|'BOWL'|'PLAYOFF'|'WC'|'DIV'|'CONF'|'CHAMP'} kind
   * @property {string} [venue] @property {boolean} played @property {{home:number, away:number}} [score]
   * @property {boolean} [ot] @property {Object} [weather] @property {string[]} [log]
   */

  /** @typedef {{w:number, l:number, t:number, pf:number, pa:number, confW:number, confL:number, divW:number, divL:number, h2h:Object<string, number[]>, streak:number}} TeamResult */

  /**
   * @typedef {Object} GameState
   * @property {string} id @property {'COLLEGE'|'NFL'} league @property {number} week @property {string} kind
   * @property {string} homeId @property {string} awayId @property {'home'|'away'|null} userSide
   * @property {{home:number, away:number}} score @property {number} q @property {number} clock @property {1|2} half
   * @property {'home'|'away'} possession @property {'home'|'away'} receivedFirst
   * @property {{home:number, away:number}} timeouts
   * @property {{ytg:number, down:number, toGo:number}|null} ball
   * @property {{n:number, startYtg:number, plays:number, side:string}} drive
   * @property {DriveLogRow[]} driveLog   capped Tuning.save.driveLogCap
   * @property {KickLogRow[]} kicks
   * @property {null|{type:'USER_KICK'|'USER_KICKOFF', ctx: KickContext}} pending
   * @property {{side:string}|null} pendingKickoff
   * @property {null|{ytg:number, down:number, toGo:number, plays:number, timeouts:number}} script
   * @property {null|{period:number, mode:'NFL_REG'|'NFL_PLAYOFF'|'COLLEGE', firstPossession:string, bothPossessed:boolean, possessions:number}} ot
   * @property {{weather:string, tempF:number, wind:{speed:number, dir:number}, surface:string, altitude:boolean, dome:boolean}} weather
   * @property {boolean} iced @property {boolean} done
   * @property {{home: TeamGameStats, away: TeamGameStats}} stats
   * @property {{home:number, away:number}} offRating @property {{home:number, away:number}} defRating
   */

  /** @typedef {{q:number, clock:number, side:string, text:string, ytg:number, result:string}} DriveLogRow */
  /** @typedef {{drives:number, td:number, fga:number, fgm:number, pat:number, patMade:number, punts:number, to:number}} TeamGameStats */

  /**
   * @typedef {Object} KickContext
   * @property {'FG'|'PAT'|'KO'} type @property {'COLLEGE'|'NFL'} league @property {number} distance
   * @property {-1|0|1} hash @property {number} ballX
   * @property {{speed:number, dir:number}} wind @property {string} weather @property {number} tempF
   * @property {string} surface @property {boolean} altitude @property {boolean} dome
   * @property {number} pressure @property {boolean} clutch @property {boolean} decisive @property {boolean} iced
   * @property {boolean} playoff @property {boolean} rivalry @property {boolean} away @property {boolean} asTimeExpires @property {boolean} ot
   * @property {number} oppST @property {boolean} isUser @property {string} difficulty
   * @property {{q:number, clock:number, scoreFor:number, scoreAgainst:number, week:number, oppId:string|null, teamId:string|null}} game
   * @property {{attrs:Attrs, form:number, mods:Modifier[], traits:string[], foot:'R'|'L', flags:Object}} kicker
   */

  /** @typedef {{power:number, aim:number, quality:number, holdMs?:number}} KickInput */

  /**
   * @typedef {Object} KickResult
   * @property {'GOOD'|'WIDE_L'|'WIDE_R'|'SHORT'|'BLOCKED'|'DOINK_IN'|'DOINK_OUT'|'XBAR_IN'|'XBAR_OUT'} outcome
   * @property {boolean} made @property {number} points @property {number} distance
   * @property {number} xYd @property {number} hYd @property {number} launchDeg @property {number} errDeg @property {boolean} shank
   * @property {number} contactDeg @property {number} windDriftYd @property {number} power @property {number} quality @property {number} flightTime
   * @property {''|'DEAD_CENTER'|'SNEAKS'|'LINE_DRIVE'} sub @property {boolean} blockReturnTd
   * @property {string[]} tags   'clutch','decisive','iced','gameWinner','tieForcer','asTimeExpires','playoff','fiftyPlus','auto'
   * @property {{timing:string, power:string, missBy:{yd:number, side:string|null}, coachSaw:string}} feedback
   */

  /**
   * @typedef {Object} KickLogRow
   * @property {string} id @property {number} year @property {number} week @property {'COLLEGE'|'NFL'} league
   * @property {string|null} gameId @property {string|null} teamId @property {string|null} oppId
   * @property {'FG'|'PAT'|'KO'} type @property {number} distance @property {number} hash
   * @property {{speed:number, dir:number}} wind @property {string} weather @property {number} pressure
   * @property {string} outcome @property {boolean} made @property {string[]} tags
   * @property {{power:number, aim:number, quality:number}} input @property {boolean} auto @property {number} rngState
   * @property {number} q @property {number} clock @property {number} scoreFor @property {number} scoreAgainst
   */

  /**
   * @typedef {Object} KickerStats
   * @property {number} fga @property {number} fgm @property {number} pat @property {number} patMade @property {number} pts @property {number} long
   * @property {Object<string, {a:number, m:number}>} buckets   '0-29','30-39','40-49','50-59','60+'
   * @property {number} clutchA @property {number} clutchM @property {number} decisiveA @property {number} decisiveM
   * @property {number} gameWinners @property {number} tieForcers @property {number} blocked @property {number} doinks @property {number} doinkIn
   * @property {number} wideL @property {number} wideR @property {number} short @property {number} made50plus
   * @property {number} consecutive @property {number} bestConsecutive @property {number} games @property {number} gamesStarted
   * @property {number} koTouchbacks @property {number} koCount @property {number} wins @property {number} losses
   */

  /**
   * @typedef {Object} SeasonLine
   * @property {number} year @property {'COLLEGE'|'NFL'} league @property {string} teamId @property {string} teamName
   * @property {number} age @property {number} ovr @property {string} role @property {KickerStats} stats @property {string[]} awards
   * @property {string} teamRecord @property {boolean} champion @property {string} playoffResult @property {string} grade @property {number} salary
   */

  /** @typedef {{seasons:SeasonLine[], awards:Award[], contracts:Object[], teams:TeamStint[], timeline:TimelineEntry[], earnings:number, moments:Moment[]}} History */
  /** @typedef {{year:number, league:string, id:string, name:string, teamId:string|null}} Award */
  /** @typedef {{teamId:string, league:string, fromYear:number, toYear:number|null, reason:string}} TeamStint */
  /** @typedef {{year:number, week:number, kind:string, text:string, impact:number, teamId:string|null}} TimelineEntry */
  /** @typedef {{id:string, year:number, week:number, league:string, text:string, score:number, distance:number, made:boolean, tags:string[]}} Moment */
  /** @typedef {{season:KickerStats, career:KickerStats, college:KickerStats, nfl:KickerStats, kicks:KickLogRow[], splits:{byBucket:Object, byWeather:Object, byHash:Object, byPressure:Object}}} Stats */
  /** @typedef {{college:Object<string, RecordEntry>, nfl:Object<string, RecordEntry>, personal:Object<string, number>}} Records */
  /** @typedef {{value:number, holder:string, holderTeam:string|null, year:number, isUser:boolean}} RecordEntry */
  /** @typedef {{id:string, week:number, year:number, from:string, avatar:string, text:string, kind:'note'|'event'|'result', read:boolean}} Message */
  /** @typedef {{id:string, year:number, week:number, text:string, tag:string}} Headline */
  /** @typedef {{kind:string, payload:*, options:{id:string, label:string, detail:string}[]}} Decision */
  /** @typedef {{kind:'SHOWCASE'|'CAMP'|'COMBINE_LADDER'|'COMBINE_ACC'|'COMBINE_KO'|'HALFTIME70'|'PRACTICE'|'TRYOUT', contexts:KickContext[], results:KickResult[], rival?:{name:string, results:KickResult[]}, idx:number}} KickSession */
  /** @typedef {{id:string, text:string, sender:string, choices:{label:string, preview:string}[], rolledWeek:number, rolledYear:number}} EventInstance */
  /** @typedef {{id:string, key:string, op:'mul'|'add', value:number, expires:{type:'week'|'game'|'season'|'never', at:number}, label:string, source:string}} Modifier */
  /** @typedef {{autoPat:'off'|'safe'|'all', playKickoffs:boolean, simSpeed:1|2|4}} Settings  (per-career mirror of the UI settings) */

  // ═══════════════════════════════ ENUMS ═══════════════════════════════

  var ENUM = {
    stages: ['HS', 'COLLEGE', 'DRAFT', 'NFL', 'RETIRED'],
    phases: {
      HS: ['SHOWCASE', 'OFFERS'],
      COLLEGE: ['PRE', 'REG', 'POST', 'AWARDS', 'OFF'],
      NFL: ['PRE', 'REG', 'POST', 'AWARDS', 'OFF'],
      DRAFT: ['DECLARE', 'COMBINE', 'DRAFT', 'UDFA'],
      RETIRED: ['LEGACY']
    },
    difficulties: ['rookie', 'pro', 'allpro', 'legend'],
    archetypes: ['CANNON', 'SURGEON', 'ICEMAN', 'SOCCER'],
    leagues: ['COLLEGE', 'NFL'],
    roles: ['K1', 'K2', 'NONE'],
    feet: ['R', 'L'],
    climates: ['warm', 'temperate', 'cold', 'dome'],
    surfaces: ['grass', 'turf'],
    contractTypes: ['SCHOLARSHIP', 'WALKON', 'ROOKIE', 'UDFA', 'VET', 'TAG', 'MIN'],
    gameKinds: ['REG', 'CCG', 'BOWL', 'PLAYOFF', 'WC', 'DIV', 'CONF', 'CHAMP'],
    kickTypes: ['FG', 'PAT', 'KO'],
    outcomes: ['GOOD', 'WIDE_L', 'WIDE_R', 'SHORT', 'BLOCKED', 'DOINK_IN', 'DOINK_OUT', 'XBAR_IN', 'XBAR_OUT'],
    subs: ['', 'DEAD_CENTER', 'SNEAKS', 'LINE_DRIVE'],
    pendingKinds: ['EVENT', 'DECISION', 'KICKS'],
    gamePendingTypes: ['USER_KICK', 'USER_KICKOFF'],
    sessionKinds: ['SHOWCASE', 'CAMP', 'COMBINE_LADDER', 'COMBINE_ACC', 'COMBINE_KO', 'HALFTIME70', 'PRACTICE', 'TRYOUT'],
    decisionKinds: ['OFFERS_COLLEGE', 'REDSHIRT', 'DECLARE', 'TRANSFER', 'COMBINE_PLAN', 'UDFA', 'EXTENSION', 'FREE_AGENCY', 'TAG',
                    'RETIRE', 'OFFSEASON_PLAN', 'CUT_NOTICE', 'HOF', 'TRAINING_BLOCKS', 'BODY_CHECK', 'CAMP'],
    focus: ['POW', 'ACC', 'CON', 'CLU', 'KO', 'REST'],
    modKeys: ['sigma', 'windDrift', 'pressure', 'block', 'range', 'trainMult', 'moraleTarget', 'injury', 'iceImmune'],
    modExpires: ['week', 'game', 'season', 'never'],
    sides: ['home', 'away'],
    buckets: ['0-29', '30-39', '40-49', '50-59', '60+'],
    messageKinds: ['note', 'event', 'result'],
    autoPat: ['off', 'safe', 'all']
  };
  Schema.ENUM = ENUM;

  var ATTRS = ['POW', 'ACC', 'CON', 'CLU', 'KO'];
  var STAT_KEYS = ['fga', 'fgm', 'pat', 'patMade', 'pts', 'long', 'clutchA', 'clutchM', 'decisiveA', 'decisiveM', 'gameWinners',
    'tieForcers', 'blocked', 'doinks', 'doinkIn', 'wideL', 'wideR', 'short', 'made50plus', 'consecutive', 'bestConsecutive',
    'games', 'gamesStarted', 'koTouchbacks', 'koCount', 'wins', 'losses'];

  // ═══════════════════════════════ SMALL FACTORIES ═══════════════════════════════

  /**
   * A zeroed KickerStats.
   * @returns {KickerStats}
   */
  Schema.emptyKickerStats = function () {
    var s = {};
    for (var i = 0; i < STAT_KEYS.length; i++) s[STAT_KEYS[i]] = 0;
    s.buckets = {};
    for (var b = 0; b < ENUM.buckets.length; b++) s.buckets[ENUM.buckets[b]] = { a: 0, m: 0 };
    return s;
  };

  /**
   * A zeroed TeamResult row for season.results.
   * @returns {TeamResult}
   */
  Schema.emptyTeamResult = function () {
    return { w: 0, l: 0, t: 0, pf: 0, pa: 0, confW: 0, confL: 0, divW: 0, divL: 0, h2h: {}, streak: 0 };
  };

  /**
   * An empty SeasonState for a league/year (no schedule yet).
   * @param {'COLLEGE'|'NFL'} league @param {number} year @returns {SeasonState}
   */
  Schema.emptySeason = function (league, year) {
    return {
      league: league === 'NFL' ? 'NFL' : 'COLLEGE', year: year || 1,
      schedule: [], results: {}, rankings: {}, standings: [],
      playoffs: null, bowls: null, goals: [],
      trainingDone: false, focus: null,
      userGameId: null, weekGameDone: false,
      kickerStats: {}
    };
  };

  /** @returns {History} */
  Schema.emptyHistory = function () {
    return { seasons: [], awards: [], contracts: [], teams: [], timeline: [], earnings: 0, moments: [] };
  };

  /** @returns {Stats} */
  Schema.emptyStats = function () {
    return {
      season: Schema.emptyKickerStats(), career: Schema.emptyKickerStats(),
      college: Schema.emptyKickerStats(), nfl: Schema.emptyKickerStats(),
      kicks: [],
      splits: { byBucket: {}, byWeather: {}, byHash: {}, byPressure: {} }
    };
  };

  /** @returns {Settings} per-career defaults */
  Schema.defaultSettings = function () {
    return { autoPat: 'off', playKickoffs: false, simSpeed: 1 };
  };

  /**
   * Coerce user settings into the per-career mirror.
   * @param {Object} [s] @returns {Settings}
   */
  Schema.mirrorSettings = function (s) {
    var d = Schema.defaultSettings();
    if (!s) return d;
    if (ENUM.autoPat.indexOf(s.autoPat) >= 0) d.autoPat = s.autoPat;
    if (typeof s.playKickoffs === 'boolean') d.playKickoffs = s.playKickoffs;
    if (s.simSpeed === 1 || s.simSpeed === 2 || s.simSpeed === 4) d.simSpeed = s.simSpeed;
    return d;
  };

  // ═══════════════════════════════ NAMES FALLBACKS ═══════════════════════════════

  /** Names module, or a tiny deterministic stand-in (tests without data files). */
  function names() {
    if (RTG.Names && typeof RTG.Names.player === 'function') return RTG.Names;
    var FIRST = ['Sam', 'Alex', 'Jordan', 'Casey', 'Riley', 'Drew', 'Morgan', 'Reese', 'Quinn', 'Avery', 'Otis', 'Walter', 'Gus', 'Lou'];
    var LAST = ['Booter', 'Pollard', 'Hensley', 'Marek', 'Okafor', 'Lindqvist', 'Barros', 'Whitcombe', 'Delgado', 'Fenwick', 'Abernathy', 'Kowalczyk'];
    var gen = function (rng) {
      var f = rng.pick(FIRST), l = rng.pick(LAST);
      return { first: f, last: l, full: f + ' ' + l };
    };
    return {
      player: gen,
      legend: gen,
      coach: function (rng) { return 'Coach ' + rng.pick(LAST); },
      hometown: function () { return { city: 'Springfield', state: 'IL', region: 'MW' }; }
    };
  }

  // ═══════════════════════════════ TEAMS & LEAGUES ═══════════════════════════════

  /**
   * Generate an AI kicker (§2.5.1). Draws: name (Names.player 3–4), age 1, ovr 2, attrs 5×2, contract 1.
   * @param {RNG} rng @param {number} anchor ovr anchor (college 52 + 4·prestige, NFL 74) @returns {AIKicker}
   */
  Schema.createAiKicker = function (rng, anchor) {
    var K = Tuning.league.aiKicker;
    var nm = names().player(rng);
    var age = rng.int(K.age[0], K.age[1]);
    var ovr = Util.clamp(Math.round(rng.gauss(anchor, K.ovrSd)), K.attrMin, K.attrMax);
    var attrs = {};
    for (var i = 0; i < ATTRS.length; i++) {
      attrs[ATTRS[i]] = Util.clamp(Math.round(ovr + rng.gauss(0, K.attrSd)), K.attrMin, K.attrMax);
    }
    return {
      name: nm.full, age: age, ovr: ovr, attrs: attrs,
      contractYears: rng.int(K.contractYears[0], K.contractYears[1]),
      seasonStats: Schema.emptyKickerStats()
    };
  };

  /** Surface rule (§2.12.2): dome → turf; cold/windy outdoor → 50 % turf (1 draw); else grass. */
  function surfaceFor(team, rng) {
    var S = Tuning.weather.surface;
    if (team.dome) return 'turf';
    if ((team.climate === 'cold' || team.windy) && rng.chance(S.coldOrWindyTurf)) return 'turf';
    return 'grass';
  }

  /**
   * Build a Team from a data row (§2.5.1, §2.12). Draw order (fixed):
   *   NFL only: OFF gauss 2, DEF gauss 2, ST gauss 2
   *   coachAgg float 1 · surface chance 1 (only cold/windy outdoor) · kicker (Schema.createAiKicker) · coach name 1
   * The kicker's OVR is blended into ST: round(0.5·ST_base + 0.5·kicker.ovr).
   * @param {Object} data data row (RTG.Data.colleges[i] / RTG.Data.nfl[i]) @param {RNG} rng @param {'COLLEGE'|'NFL'} league
   * @returns {Team}
   */
  Schema.createTeam = function (data, rng, league) {
    var L = Tuning.league, init = L.nflInit;
    var isCollege = league === 'COLLEGE';
    var colors = Array.isArray(data.colors) ? data.colors.slice() : [data.primary || '#888888', data.secondary || '#f4e9d0'];
    var team = {
      id: data.id || ((isCollege ? 'C' : 'N') + data.abbr),
      name: data.name || (data.city + ' ' + data.nick),
      city: data.city || '', nick: data.nick || '', abbr: data.abbr || '',
      colors: colors,
      conf: data.conf || '', div: data.div || null,
      prestige: isCollege ? (data.prestige || 3) : null,
      OFF: data.OFF, DEF: data.DEF, ST: data.ST,
      coachAgg: 0,
      climate: data.climate || (data.dome ? 'dome' : 'temperate'),
      dome: !!data.dome || data.climate === 'dome',
      altitude: !!data.altitude, windy: !!data.windy, rainy: !!data.rainy,
      surface: 'grass', kicker: null, kicker2: null,
      coach: '',
      region: data.region || ''
    };
    if (isCollege) {
      team.confIdx = typeof data.confIdx === 'number' ? data.confIdx : 0;
      team.rival = data.rival || null;
      team.school = data.school || team.name;
    } else {
      team.confIdx = typeof data.confIdx === 'number' ? data.confIdx : 0;
      team.divIdx = typeof data.divIdx === 'number' ? data.divIdx : 0;
      team.bigMarket = !!data.bigMarket || L.bigMarkets.indexOf(team.abbr) >= 0;
      team.OFF = Util.clamp(Math.round(rng.gauss(init.off.mean, init.off.sd)), init.off.min, init.off.max);
      team.DEF = Util.clamp(Math.round(rng.gauss(init.def.mean, init.def.sd)), init.def.min, init.def.max);
      team.ST = Math.round(rng.gauss(init.st.mean, init.st.sd));
    }
    if (typeof team.OFF !== 'number') team.OFF = L.drift.nflAnchor;
    if (typeof team.DEF !== 'number') team.DEF = L.drift.nflAnchor;
    if (typeof team.ST !== 'number') team.ST = init.st.mean;
    team.coachAgg = Math.round(rng.float(init.coachAgg[0], init.coachAgg[1]) * 100) / 100;
    team.surface = surfaceFor(team, rng);
    var K = L.aiKicker;
    var anchor = isCollege ? K.collegeAnchorBase + K.collegeAnchorPerPrestige * team.prestige : K.nflAnchor;
    team.kicker = Schema.createAiKicker(rng, anchor);
    team.ST = Math.round(L.stBlend * team.ST + (1 - L.stBlend) * team.kicker.ovr);
    team.coach = names().coach(rng);
    return team;
  };

  /**
   * Build a League from data rows (college teams carry their ratings; NFL ratings are generated).
   * @param {'COLLEGE'|'NFL'} kind @param {Object[]} rows @param {RNG} rng @param {number} [year=1] @returns {League}
   */
  Schema.createLeague = function (kind, rows, rng, year) {
    var teams = [];
    for (var i = 0; i < rows.length; i++) teams.push(Schema.createTeam(rows[i], rng, kind));
    var league = { kind: kind, year: year || 1, teams: teams, seasonHistory: [], kickers: {} };
    if (kind === 'NFL') {
      var C = Tuning.contracts;
      league.cap = C.capStart;
      league.vetMin = C.vetMinStart;
      league.tagValue = C.tag.base;
    }
    Schema.reindexLeague(league);
    return league;
  };

  /**
   * Rebuild a league's caches: non-enumerable `teamIndex` and `kickers[id] → team.kicker`.
   * @param {League} league @returns {League}
   */
  Schema.reindexLeague = function (league) {
    var idx = {}, kickers = {};
    for (var i = 0; i < league.teams.length; i++) {
      var t = league.teams[i];
      idx[t.id] = i;
      if (t.kicker) kickers[t.id] = t.kicker;
    }
    Object.defineProperty(league, 'teamIndex', { value: idx, enumerable: false, configurable: true, writable: true });
    league.kickers = kickers;
    return league;
  };

  /**
   * Rebuild every non-persisted cache after a load (teamIndex, kickers links).
   * @param {CareerState} state @returns {CareerState}
   */
  Schema.reindex = function (state) {
    if (state.leagues) {
      if (state.leagues.college) Schema.reindexLeague(state.leagues.college);
      if (state.leagues.nfl) Schema.reindexLeague(state.leagues.nfl);
    }
    return state;
  };

  /**
   * Replace a team's kicker (K1 by default, or 'kicker2') keeping league.kickers in sync
   * and re-blending ST. Pass the new base ST via team.STbase when known; otherwise the
   * blend uses the current ST as the base.
   * @param {League} league @param {string} teamId @param {AIKicker|null} kicker @param {'kicker'|'kicker2'} [slot='kicker']
   */
  Schema.setKicker = function (league, teamId, kicker, slot) {
    var team = Schema.teamIn(league, teamId);
    if (!team) return;
    slot = slot === 'kicker2' ? 'kicker2' : 'kicker';
    team[slot] = kicker;
    if (slot === 'kicker') {
      if (kicker) league.kickers[teamId] = kicker; else delete league.kickers[teamId];
      if (kicker) team.ST = Math.round(Tuning.league.stBlend * team.ST + (1 - Tuning.league.stBlend) * kicker.ovr);
    }
  };

  /**
   * Team lookup within one league (uses teamIndex when valid, else scans).
   * @param {League} league @param {string} id @returns {Team|null}
   */
  Schema.teamIn = function (league, id) {
    if (!league || !league.teams) return null;
    var idx = league.teamIndex && league.teamIndex[id];
    if (typeof idx === 'number' && league.teams[idx] && league.teams[idx].id === id) return league.teams[idx];
    for (var i = 0; i < league.teams.length; i++) if (league.teams[i].id === id) return league.teams[i];
    return null;
  };

  /**
   * Team lookup across both leagues (college first).
   * @param {CareerState} state @param {string} id @returns {Team|null}
   */
  Schema.teamById = function (state, id) {
    if (!id || !state.leagues) return null;
    return Schema.teamIn(state.leagues.college, id) || Schema.teamIn(state.leagues.nfl, id);
  };

  /**
   * The league object for a kind ('COLLEGE'|'NFL').
   * @param {CareerState} state @param {string} kind @returns {League|null}
   */
  Schema.leagueOf = function (state, kind) {
    if (!state.leagues) return null;
    return kind === 'NFL' ? state.leagues.nfl : (kind === 'COLLEGE' ? state.leagues.college : null);
  };

  /**
   * The league the player currently belongs to (season.league as a fallback).
   * @param {CareerState} state @returns {League|null}
   */
  Schema.activeLeague = function (state) {
    return Schema.leagueOf(state, state.player.league || (state.season && state.season.league));
  };

  /**
   * The user's team (or null before signing).
   * @param {CareerState} state @returns {Team|null}
   */
  Schema.userTeam = function (state) {
    var p = state.player;
    return p.teamId ? Schema.teamIn(Schema.leagueOf(state, p.league), p.teamId) : null;
  };

  /**
   * Calendar year for a career year (2026 + year − 1).
   * @param {number} year @returns {number}
   */
  Schema.calendarYear = function (year) {
    return Tuning.schedule.firstYear + year - 1;
  };

  // ═══════════════════════════════ RECORDS ═══════════════════════════════

  /**
   * Build state.records from RTG.Data.records.base (or a {college, nfl} override) with
   * fictional legend holders. Draws per record: Names.legend (3–4), holder team 1, year 1.
   * @param {RNG} rng @param {{college: League, nfl: League}} leagues @param {Object} [base] {college:{key:value}, nfl:{…}}
   * @returns {Records}
   */
  Schema.createRecords = function (rng, leagues, base) {
    var data = base || (RTG.Data && RTG.Data.records && RTG.Data.records.base) || { college: {}, nfl: {} };
    var years = Tuning.names.legendYears;
    var N = names();
    var out = { college: {}, nfl: {}, personal: {} };
    ['college', 'nfl'].forEach(function (lg) {
      var vals = data[lg] || {};
      var keys = Object.keys(vals);
      var teams = leagues && leagues[lg] ? leagues[lg].teams : [];
      for (var i = 0; i < keys.length; i++) {
        var holder = N.legend(rng);
        var team = teams.length ? rng.pick(teams) : null;
        var yr = rng.int(years[lg][0], years[lg][1]);
        out[lg][keys[i]] = { value: vals[keys[i]], holder: holder.full, holderTeam: team ? team.id : null, year: yr, isUser: false };
      }
    });
    return out;
  };

  // ═══════════════════════════════ CAREER ═══════════════════════════════

  /**
   * Create a brand-new CareerState at HS.SHOWCASE (§3.5.4).
   * RNG draw order (fixed): player (Player.create) → college teams (Data.colleges order)
   * → NFL teams (Data.nfl order) → records/legends (college then NFL, key order)
   * → showcase session (Career.showcaseSession when present, else Kick.buildContext ×6, else pending null).
   * @param {{name?:string|Object, archetype?:string, difficulty?:string, seed?:number, hometown?:Object, look?:Object, foot?:'R'|'L',
   *          createdAt?:number, settings?:Object, data?:{colleges?:Object[], nfl?:Object[], records?:Object}}} opts
   * @param {RNG} rng
   * @returns {CareerState}
   */
  Schema.createCareer = function (opts, rng) {
    opts = opts || {};
    var Player = RTG.Player;
    Util.assert(Player && typeof Player.create === 'function', 'Schema.createCareer: RTG.Player is required');
    var data = opts.data || {};
    var colleges = data.colleges || (RTG.Data && RTG.Data.colleges) || [];
    var nflRows = data.nfl || (RTG.Data && RTG.Data.nfl) || [];
    Util.assert(colleges.length && nflRows.length, 'Schema.createCareer: team data (RTG.Data.colleges / RTG.Data.nfl) is required');
    var difficulty = ENUM.difficulties.indexOf(opts.difficulty) >= 0 ? opts.difficulty : 'pro';
    var seed = opts.seed === undefined ? rng.state() : RTG.RNG.toSeed(opts.seed);

    // 1. player
    var player = Player.create(rng, {
      name: opts.name, archetype: opts.archetype, hometown: opts.hometown, look: opts.look, foot: opts.foot
    });
    // 2./3. leagues
    var college = Schema.createLeague('COLLEGE', colleges, rng, 1);
    var nfl = Schema.createLeague('NFL', nflRows, rng, 1);

    var state = {
      v: RTG.SAVE_VERSION,
      seed: seed,
      rngState: rng.state(),
      difficulty: difficulty,
      createdAt: typeof opts.createdAt === 'number' ? opts.createdAt : 0,
      playtimeSec: 0,
      stage: 'HS', phase: 'SHOWCASE',
      year: 1, week: 0,
      player: player,
      leagues: { college: college, nfl: nfl },
      season: Schema.emptySeason('COLLEGE', 1),
      game: null,
      pending: null,
      history: Schema.emptyHistory(),
      stats: Schema.emptyStats(),
      records: null,
      inbox: [], headlines: [], recentHeadlineIds: [], recentEventIds: [],
      settings: Schema.mirrorSettings(opts.settings),
      flags: {}
    };
    // 4. records & legends
    state.records = Schema.createRecords(rng, state.leagues, data.records);
    // 5. showcase
    state.pending = Schema.showcasePending(state, rng);
    state.rngState = rng.state();
    return state;
  };

  /**
   * Build the HS showcase pending payload: Career.showcaseSession if present, else a
   * KickSession from Kick.buildContext, else null (reported by tests).
   * @param {CareerState} state @param {RNG} rng @returns {Object|null}
   */
  Schema.showcasePending = function (state, rng) {
    if (RTG.Career && typeof RTG.Career.showcaseSession === 'function') {
      var session = RTG.Career.showcaseSession(state, rng);
      if (state.pending && state.pending.kind === 'KICKS') return state.pending;
      return session ? { kind: 'KICKS', session: session } : null;
    }
    if (RTG.Kick && typeof RTG.Kick.buildContext === 'function') {
      var S = Tuning.draft.showcase;
      var contexts = [];
      for (var i = 0; i < S.distances.length; i++) {
        var last = i === S.distances.length - 1;
        contexts.push(RTG.Kick.buildContext(state, null, {
          type: 'FG', distance: S.distances[i], hash: 0, isUser: true, forSession: true,
          pressure: last ? S.pressureLast : 0, calm: true
        }));
      }
      return { kind: 'KICKS', session: { kind: 'SHOWCASE', contexts: contexts, results: [], idx: 0 } };
    }
    return null;
  };

  // ═══════════════════════════════ GAME STATE / KICK LOG ═══════════════════════════════

  /**
   * A fresh GameState (pre-kickoff). Sim.startGame fills weather/ratings and the coin toss.
   * @param {{id:string, league:'COLLEGE'|'NFL', week:number, kind?:string, homeId:string, awayId:string, userSide?:'home'|'away'|null,
   *          weather?:Object, offRating?:Object, defRating?:Object, timeouts?:number, receivedFirst?:'home'|'away'}} opts
   * @returns {GameState}
   */
  Schema.createGameState = function (opts) {
    opts = opts || {};
    var C = Tuning.sim.clock;
    var received = opts.receivedFirst === 'away' ? 'away' : 'home';
    var tos = typeof opts.timeouts === 'number' ? opts.timeouts : 3;
    return {
      id: opts.id || (opts.league === 'NFL' ? 'n' : 'c') + (opts.week || 0) + '-' + opts.homeId + '-' + opts.awayId,
      league: opts.league === 'NFL' ? 'NFL' : 'COLLEGE',
      week: opts.week || 1,
      kind: ENUM.gameKinds.indexOf(opts.kind) >= 0 ? opts.kind : 'REG',
      homeId: opts.homeId, awayId: opts.awayId,
      userSide: opts.userSide === 'home' || opts.userSide === 'away' ? opts.userSide : null,
      score: { home: 0, away: 0 },
      q: 1, clock: C.quarterSec, half: 1,
      possession: received, receivedFirst: received,
      timeouts: { home: tos, away: tos },
      ball: null,
      drive: { n: 0, startYtg: 0, plays: 0, side: received },
      driveLog: [],
      kicks: [],
      pending: null,
      pendingKickoff: { side: received === 'home' ? 'away' : 'home' },
      script: null,
      ot: null,
      weather: opts.weather || { weather: 'clear', tempF: 70, wind: { speed: 0, dir: 0 }, surface: 'grass', altitude: false, dome: false },
      iced: false, done: false,
      stats: { home: Schema.emptyTeamGameStats(), away: Schema.emptyTeamGameStats() },
      offRating: opts.offRating || { home: 0, away: 0 },
      defRating: opts.defRating || { home: 0, away: 0 }
    };
  };

  /** @returns {TeamGameStats} */
  Schema.emptyTeamGameStats = function () {
    return { drives: 0, td: 0, fga: 0, fgm: 0, pat: 0, patMade: 0, punts: 0, to: 0 };
  };

  /**
   * A KickLogRow from a context + result (+ meta: {id, year, week, gameId, teamId, oppId, auto, rngState, input}).
   * Missing meta falls back to ctx.game / ctx fields.
   * @param {KickContext} ctx @param {KickResult} result @param {Object} [meta] @returns {KickLogRow}
   */
  Schema.createKickLogRow = function (ctx, result, meta) {
    meta = meta || {};
    var g = ctx.game || {};
    var input = meta.input || { power: result.power, aim: result.aim, quality: result.quality };
    return {
      id: meta.id || ('k' + Util.fnv1a((meta.year || 0) + ':' + (meta.week || g.week || 0) + ':' + (meta.gameId || '') + ':' + (meta.rngState || 0) + ':' + ctx.distance)),
      year: meta.year || 0,
      week: typeof meta.week === 'number' ? meta.week : (g.week || 0),
      league: ctx.league || 'COLLEGE',
      gameId: meta.gameId !== undefined ? meta.gameId : null,
      teamId: meta.teamId !== undefined ? meta.teamId : (g.teamId || null),
      oppId: meta.oppId !== undefined ? meta.oppId : (g.oppId || null),
      type: ctx.type || 'FG',
      distance: ctx.distance,
      hash: ctx.hash || 0,
      wind: ctx.wind ? { speed: ctx.wind.speed, dir: ctx.wind.dir } : { speed: 0, dir: 0 },
      weather: ctx.weather || 'clear',
      pressure: typeof ctx.pressure === 'number' ? Util.roundN(ctx.pressure, 3) : 0,
      outcome: result.outcome,
      made: !!result.made,
      tags: (result.tags || []).slice(),
      input: { power: Util.roundN(input.power || 0, 3), aim: Util.roundN(input.aim || 0, 2), quality: Util.roundN(input.quality || 0, 3) },
      auto: !!meta.auto,
      rngState: typeof meta.rngState === 'number' ? meta.rngState >>> 0 : 0,
      q: g.q || 0, clock: g.clock || 0,
      scoreFor: g.scoreFor || 0, scoreAgainst: g.scoreAgainst || 0
    };
  };

  // ═══════════════════════════════ VALIDATE ═══════════════════════════════
  //
  // Performance note: every check takes (container, key, prefix) and only builds
  // the path string when it fails, so a clean 20-season state validates in ~1 ms.

  function isObj(v) { return v !== null && typeof v === 'object' && !isArray(v); }
  function isNum(v) { return typeof v === 'number' && v === v && v !== INF && v !== -INF; }
  function isInt(v) { return isNum(v) && mfloor(v) === v; }

  /**
   * Validate a CareerState: types, enums, ranges, referential integrity, caps and
   * JSON-safety (no cycles / functions / undefined / NaN). Runs in well under 5 ms
   * on a 20-season state. Never throws.
   * @param {CareerState} state @returns {{ok:boolean, errors:string[]}}
   */
  Schema.validate = function (state) {
    var errors = [];
    var MAX = 200;
    function err(pfx, key, msg) {
      if (errors.length >= MAX) return;
      errors.push((typeof key === 'number' ? pfx + '[' + key + ']' : (key === '' ? pfx : pfx + '.' + key)) + ': ' + msg);
    }
    function num(o, k, lo, hi, pfx) { var v = o[k]; if (!isNum(v)) { err(pfx, k, 'not a number'); return false; } if (v < lo || v > hi) { err(pfx, k, v + ' out of [' + lo + ',' + hi + ']'); return false; } return true; }
    function int(o, k, lo, hi, pfx) { var v = o[k]; if (!isInt(v)) { err(pfx, k, 'not an integer'); return false; } return num(o, k, lo, hi, pfx); }
    function str(o, k, pfx) { if (typeof o[k] !== 'string') { err(pfx, k, 'not a string'); return false; } return true; }
    function bool(o, k, pfx) { if (typeof o[k] !== 'boolean') { err(pfx, k, 'not a boolean'); return false; } return true; }
    function enm(o, k, list, pfx) { if (list.indexOf(o[k]) < 0) { err(pfx, k, '"' + o[k] + '" not in [' + list.join('|') + ']'); return false; } return true; }
    function arr(o, k, pfx, cap) { var v = o[k]; if (!isArray(v)) { err(pfx, k, 'not an array'); return false; } if (cap !== undefined && v.length > cap) err(pfx, k, 'length ' + v.length + ' > cap ' + cap); return true; }
    function obj(o, k, pfx) { if (!isObj(o[k])) { err(pfx, k, 'not an object'); return false; } return true; }
    function nullable(o, k) { return o[k] === null || o[k] === undefined; }

    var ids = {};                                   // teamId → 'COLLEGE'|'NFL'
    var leagueIds = { COLLEGE: {}, NFL: {} };
    function teamExists(id, kind) { return kind ? leagueIds[kind] !== undefined && !!leagueIds[kind][id] : !!ids[id]; }

    function validateAttrs(o, k, pfx) {
      if (!obj(o, k, pfx)) return;
      var a = o[k], p = pfx + '.' + k;
      for (var i = 0; i < ATTRS.length; i++) int(a, ATTRS[i], 1, 99, p);
    }
    function validateStats(o, k, pfx) {
      if (!obj(o, k, pfx)) return;
      var s = o[k], p = pfx + '.' + k;
      for (var i = 0; i < STAT_KEYS.length; i++) if (!isNum(s[STAT_KEYS[i]])) err(p, STAT_KEYS[i], 'not a number');
      if (obj(s, 'buckets', p)) {
        for (var b = 0; b < ENUM.buckets.length; b++) {
          var bk = s.buckets[ENUM.buckets[b]];
          if (!isObj(bk) || !isNum(bk.a) || !isNum(bk.m)) err(p + '.buckets', ENUM.buckets[b], 'bad bucket');
        }
      }
    }
    function validateAiKicker(o, k, pfx) {
      if (!obj(o, k, pfx)) return;
      var kk = o[k], p = pfx + '.' + k;
      str(kk, 'name', p); int(kk, 'age', 15, 60, p); num(kk, 'ovr', 1, 99, p);
      validateAttrs(kk, 'attrs', p); int(kk, 'contractYears', 0, 10, p);
      if (kk.seasonStats !== undefined) validateStats(kk, 'seasonStats', p);
    }
    function validateMod(m, pfx) {
      if (!isObj(m)) { err(pfx, '', 'not an object'); return; }
      str(m, 'id', pfx); str(m, 'key', pfx); enm(m, 'op', ['mul', 'add'], pfx);
      if (!isNum(m.value)) err(pfx, 'value', 'not a number');
      if (obj(m, 'expires', pfx)) enm(m.expires, 'type', ENUM.modExpires, pfx + '.expires');
    }
    function validateCtx(o, k, pfx) {
      if (!obj(o, k, pfx)) return;
      var c = o[k], p = pfx + '.' + k;
      enm(c, 'type', ENUM.kickTypes, p); num(c, 'distance', 1, 99, p);
      if (c.pressure !== undefined) num(c, 'pressure', 0, 1, p);
      if (c.kicker !== undefined && obj(c, 'kicker', p)) validateAttrs(c.kicker, 'attrs', p + '.kicker');
    }
    function validateKickRow(r, pfx) {
      if (!isObj(r)) { err(pfx, '', 'not an object'); return; }
      str(r, 'id', pfx); enm(r, 'type', ENUM.kickTypes, pfx); num(r, 'distance', 1, 99, pfx);
      enm(r, 'outcome', ENUM.outcomes, pfx); bool(r, 'made', pfx);
      if (r.teamId !== null && r.teamId !== undefined && !ids[r.teamId]) err(pfx, 'teamId', 'unknown team ' + r.teamId);
      if (!isArray(r.tags)) err(pfx, 'tags', 'not an array');
    }
    function validateSession(o, k, pfx) {
      if (!obj(o, k, pfx)) return;
      var s = o[k], p = pfx + '.' + k;
      enm(s, 'kind', ENUM.sessionKinds, p);
      if (arr(s, 'contexts', p)) for (var i = 0; i < s.contexts.length; i++) validateCtx(s.contexts, i, p + '.contexts');
      arr(s, 'results', p); int(s, 'idx', 0, 1000, p);
    }

    try {
      if (!isObj(state)) return { ok: false, errors: ['state: not an object'] };
      var R = 'state';

      // ── scalars
      if (state.v !== RTG.SAVE_VERSION) err(R, 'v', state.v + ' ≠ SAVE_VERSION ' + RTG.SAVE_VERSION);
      int(state, 'seed', 0, 4294967295, R); int(state, 'rngState', 0, 4294967295, R);
      enm(state, 'difficulty', ENUM.difficulties, R);
      num(state, 'createdAt', 0, INF, R); num(state, 'playtimeSec', 0, INF, R);
      if (enm(state, 'stage', ENUM.stages, R)) enm(state, 'phase', ENUM.phases[state.stage], R);
      int(state, 'year', 1, 100, R); int(state, 'week', 0, 30, R);

      // ── leagues & team ids
      if (obj(state, 'leagues', R)) {
        var lgs = ['college', 'nfl'];
        for (var li = 0; li < lgs.length; li++) {
          var lg = lgs[li], kind = lg === 'nfl' ? 'NFL' : 'COLLEGE';
          if (!obj(state.leagues, lg, 'leagues')) continue;
          var L = state.leagues[lg], LP = 'leagues.' + lg;
          if (L.kind !== kind) err(LP, 'kind', String(L.kind));
          int(L, 'year', 1, 100, LP);
          if (kind === 'NFL') { num(L, 'cap', 0, INF, LP); num(L, 'vetMin', 0, INF, LP); num(L, 'tagValue', 0, INF, LP); }
          arr(L, 'seasonHistory', LP);
          if (!arr(L, 'teams', LP)) continue;
          var TP = LP + '.teams';
          for (var i = 0; i < L.teams.length; i++) {
            var t = L.teams[i];
            if (!isObj(t)) { err(TP, i, 'not an object'); continue; }
            if (typeof t.id !== 'string' || !t.id) { err(TP, i, 'missing id'); continue; }
            if (ids[t.id]) err(TP, i, 'duplicate id "' + t.id + '"');
            ids[t.id] = kind; leagueIds[kind][t.id] = true;
            var tp = TP + '[' + i + ']';
            str(t, 'name', tp); str(t, 'abbr', tp);
            if (!isArray(t.colors) || t.colors.length !== 2) err(tp, 'colors', 'need [primary, secondary]');
            num(t, 'OFF', 1, 99, tp); num(t, 'DEF', 1, 99, tp); num(t, 'ST', 1, 99, tp); num(t, 'coachAgg', 0, 1, tp);
            enm(t, 'climate', ENUM.climates, tp); bool(t, 'dome', tp); enm(t, 'surface', ENUM.surfaces, tp);
            if (kind === 'COLLEGE') int(t, 'prestige', 1, 5, tp);
            if (!nullable(t, 'kicker')) validateAiKicker(t, 'kicker', tp);
            if (!nullable(t, 'kicker2')) validateAiKicker(t, 'kicker2', tp);
          }
          if (L.kickers !== undefined && obj(L, 'kickers', LP)) {
            for (var kid in L.kickers) if (!leagueIds[kind][kid]) err(LP + '.kickers', kid, 'unknown team');
          }
        }
      }

      // ── player
      if (obj(state, 'player', R)) {
        var p = state.player, PP = 'player';
        if (typeof p.id !== 'string' || !p.id) err(PP, 'id', 'missing');
        if (obj(p, 'name', PP)) str(p.name, 'full', PP + '.name');
        obj(p, 'hometown', PP);
        enm(p, 'archetype', ENUM.archetypes, PP);
        if (obj(p, 'look', PP)) { int(p.look, 'skin', 0, 3, PP + '.look'); int(p.look, 'hair', 0, 5, PP + '.look'); int(p.look, 'boot', 0, 3, PP + '.look'); }
        enm(p, 'foot', ENUM.feet, PP); int(p, 'age', 15, 60, PP); int(p, 'stars', 2, 5, PP);
        validateAttrs(p, 'attrs', PP); validateAttrs(p, 'pot', PP);
        num(p, 'xp', 0, INF, PP); num(p, 'xpSpent', 0, INF, PP);
        num(p, 'form', -Tuning.progression.form.max, Tuning.progression.form.max, PP);
        num(p, 'morale', 0, 100, PP); num(p, 'trust', 0, 100, PP); num(p, 'fans', 0, 100, PP);
        num(p, 'fame', 0, Tuning.soft.fame.max, PP); num(p, 'js', 0, 100, PP);
        if (arr(p, 'traits', PP)) for (var ti = 0; ti < p.traits.length; ti++) if (typeof p.traits[ti] !== 'string') err(PP + '.traits', ti, 'not a string');
        if (arr(p, 'mods', PP)) for (var mi = 0; mi < p.mods.length; mi++) validateMod(p.mods[mi], PP + '.mods[' + mi + ']');
        obj(p, 'flags', PP);
        if (p.injury !== null && obj(p, 'injury', PP)) { str(p.injury, 'type', PP + '.injury'); int(p.injury, 'weeksLeft', 0, 52, PP + '.injury'); bool(p.injury, 'careerThreat', PP + '.injury'); }
        int(p, 'agentTier', 0, 2, PP); str(p, 'agentName', PP);
        int(p, 'missStreak', 0, INF, PP); int(p, 'makeStreak', 0, INF, PP);
        enm(p, 'role', ENUM.roles, PP);
        if (p.league !== null) enm(p, 'league', ENUM.leagues, PP);
        if (p.teamId !== null) {
          if (typeof p.teamId !== 'string') err(PP, 'teamId', 'not a string');
          else if (!teamExists(p.teamId, p.league)) err(PP, 'teamId', '"' + p.teamId + '" not in ' + p.league);
        }
        if (p.contract !== null && obj(p, 'contract', PP)) {
          var c = p.contract, CP = PP + '.contract';
          enm(c, 'type', ENUM.contractTypes, CP); int(c, 'years', 0, 10, CP); int(c, 'yearIdx', 0, 10, CP);
          num(c, 'aav', 0, INF, CP); num(c, 'gtdPct', 0, 1, CP);
        }
        num(p, 'nil', 0, INF, PP); bool(p, 'redshirt', PP);
        int(p, 'collegeSeasons', 0, 10, PP); int(p, 'nflSeasons', 0, 40, PP); int(p, 'seasonsAsStarter', 0, 50, PP);
        int(p, 'tags', 0, Tuning.contracts.tag.max, PP);
      }

      // ── season
      if (obj(state, 'season', R)) {
        var s = state.season, SP = 'season';
        var okLeague = enm(s, 'league', ENUM.leagues, SP);
        int(s, 'year', 1, 100, SP);
        if (arr(s, 'schedule', SP)) {
          var seenGame = {}, GP = SP + '.schedule';
          for (var gi = 0; gi < s.schedule.length; gi++) {
            var g = s.schedule[gi];
            if (!isObj(g)) { err(GP, gi, 'not an object'); continue; }
            if (typeof g.id !== 'string') err(GP, gi, 'missing id'); else if (seenGame[g.id]) err(GP, gi, 'duplicate id ' + g.id); else seenGame[g.id] = true;
            if (!isInt(g.week) || g.week < 0 || g.week > 30) err(GP, gi, 'bad week');
            if (okLeague && !teamExists(g.homeId, s.league)) err(GP, gi, 'unknown homeId ' + g.homeId);
            if (okLeague && !teamExists(g.awayId, s.league)) err(GP, gi, 'unknown awayId ' + g.awayId);
            if (g.homeId === g.awayId) err(GP, gi, 'team plays itself');
            if (ENUM.gameKinds.indexOf(g.kind) < 0) err(GP, gi, 'bad kind ' + g.kind);
            if (typeof g.played !== 'boolean') err(GP, gi, 'played not boolean');
            if (g.played && (!isObj(g.score) || !isNum(g.score.home) || !isNum(g.score.away))) err(GP, gi, 'played without score');
          }
        }
        if (obj(s, 'results', SP)) for (var rid in s.results) { if (okLeague && !teamExists(rid, s.league)) err(SP + '.results', rid, 'unknown team'); var rr = s.results[rid]; if (!isObj(rr) || !isNum(rr.w) || !isNum(rr.l)) err(SP + '.results', rid, 'bad row'); }
        obj(s, 'rankings', SP); arr(s, 'standings', SP);
        if (!nullable(s, 'playoffs')) obj(s, 'playoffs', SP);
        if (!nullable(s, 'bowls')) arr(s, 'bowls', SP);
        arr(s, 'goals', SP); bool(s, 'trainingDone', SP);
        if (s.focus !== null) enm(s, 'focus', ENUM.focus, SP);
        if (s.userGameId !== null) str(s, 'userGameId', SP);
        bool(s, 'weekGameDone', SP);
        if (obj(s, 'kickerStats', SP)) for (var ksid in s.kickerStats) { if (okLeague && !teamExists(ksid, s.league)) err(SP + '.kickerStats', ksid, 'unknown team'); validateStats(s.kickerStats, ksid, SP + '.kickerStats'); }
      }

      // ── game
      if (!nullable(state, 'game') && obj(state, 'game', R)) {
        var gs = state.game, GSP = 'game';
        str(gs, 'id', GSP);
        var okGl = enm(gs, 'league', ENUM.leagues, GSP);
        if (okGl && !teamExists(gs.homeId, gs.league)) err(GSP, 'homeId', 'unknown ' + gs.homeId);
        if (okGl && !teamExists(gs.awayId, gs.league)) err(GSP, 'awayId', 'unknown ' + gs.awayId);
        if (gs.userSide !== null) enm(gs, 'userSide', ENUM.sides, GSP);
        if (obj(gs, 'score', GSP)) { num(gs.score, 'home', 0, 200, GSP + '.score'); num(gs.score, 'away', 0, 200, GSP + '.score'); }
        int(gs, 'q', 1, 20, GSP); num(gs, 'clock', 0, Tuning.sim.clock.quarterSec, GSP);
        enm(gs, 'half', [1, 2], GSP); enm(gs, 'possession', ENUM.sides, GSP);
        if (obj(gs, 'timeouts', GSP)) { int(gs.timeouts, 'home', 0, 3, GSP + '.timeouts'); int(gs.timeouts, 'away', 0, 3, GSP + '.timeouts'); }
        arr(gs, 'driveLog', GSP, Tuning.save.driveLogCap);
        if (arr(gs, 'kicks', GSP)) for (var gk = 0; gk < gs.kicks.length; gk++) validateKickRow(gs.kicks[gk], GSP + '.kicks[' + gk + ']');
        if (!nullable(gs, 'pending') && obj(gs, 'pending', GSP)) { enm(gs.pending, 'type', ENUM.gamePendingTypes, GSP + '.pending'); validateCtx(gs.pending, 'ctx', GSP + '.pending'); }
        bool(gs, 'done', GSP);
        if (obj(gs, 'weather', GSP)) { num(gs.weather, 'tempF', -40, 130, GSP + '.weather'); if (!isObj(gs.weather.wind) || !isNum(gs.weather.wind.speed)) err(GSP + '.weather', 'wind', 'bad wind'); }
      }

      // ── pending
      if (!nullable(state, 'pending') && obj(state, 'pending', R)) {
        var pd = state.pending, PDP = 'pending';
        enm(pd, 'kind', ENUM.pendingKinds, PDP);
        if (pd.kind === 'EVENT' && obj(pd, 'event', PDP)) { str(pd.event, 'id', PDP + '.event'); arr(pd.event, 'choices', PDP + '.event'); }
        if (pd.kind === 'DECISION' && obj(pd, 'decision', PDP)) { str(pd.decision, 'kind', PDP + '.decision'); arr(pd.decision, 'options', PDP + '.decision'); }
        if (pd.kind === 'KICKS') validateSession(pd, 'session', PDP);
      }

      // ── history
      if (obj(state, 'history', R)) {
        var h = state.history, HP = 'history';
        arr(h, 'seasons', HP); arr(h, 'awards', HP); arr(h, 'contracts', HP); arr(h, 'teams', HP); arr(h, 'timeline', HP);
        arr(h, 'moments', HP, Tuning.save.momentsCap); num(h, 'earnings', 0, INF, HP);
        if (isArray(h.awards)) for (var ai = 0; ai < h.awards.length; ai++) { var aw = h.awards[ai]; if (!isObj(aw) || typeof aw.id !== 'string' || !isInt(aw.year)) err(HP + '.awards', ai, 'bad award'); }
      }

      // ── stats
      if (obj(state, 'stats', R)) {
        var st = state.stats, STP = 'stats';
        validateStats(st, 'season', STP); validateStats(st, 'career', STP); validateStats(st, 'college', STP); validateStats(st, 'nfl', STP);
        if (arr(st, 'kicks', STP, Tuning.save.kickLogCap)) for (var ki = 0; ki < st.kicks.length; ki++) validateKickRow(st.kicks[ki], STP + '.kicks[' + ki + ']');
        obj(st, 'splits', STP);
      }

      // ── records
      if (obj(state, 'records', R)) {
        var rc = state.records;
        var rlg = ['college', 'nfl'];
        for (var ri = 0; ri < rlg.length; ri++) {
          if (!obj(rc, rlg[ri], 'records')) continue;
          var RP = 'records.' + rlg[ri];
          for (var key in rc[rlg[ri]]) {
            var e = rc[rlg[ri]][key];
            if (!isObj(e)) { err(RP, key, 'not an object'); continue; }
            if (!isNum(e.value)) err(RP, key, 'value not a number');
            if (typeof e.holder !== 'string') err(RP, key, 'holder not a string');
            if (typeof e.isUser !== 'boolean') err(RP, key, 'isUser not boolean');
            if (e.holderTeam !== null && e.holderTeam !== undefined && !ids[e.holderTeam]) err(RP, key, 'unknown holderTeam ' + e.holderTeam);
          }
        }
        obj(rc, 'personal', 'records');
      }

      // ── caps & misc
      if (arr(state, 'inbox', R, Tuning.save.inboxCap)) for (var ii = 0; ii < state.inbox.length; ii++) { var msg = state.inbox[ii]; if (!isObj(msg) || typeof msg.id !== 'string' || typeof msg.text !== 'string') err('inbox', ii, 'bad message'); }
      if (arr(state, 'headlines', R, Tuning.save.headlinesCap)) for (var hi = 0; hi < state.headlines.length; hi++) { var hl = state.headlines[hi]; if (!isObj(hl) || typeof hl.text !== 'string') err('headlines', hi, 'bad headline'); }
      arr(state, 'recentHeadlineIds', R, Tuning.save.recentHeadlineIds);
      arr(state, 'recentEventIds', R, Tuning.save.recentEventIds);
      if (obj(state, 'settings', R)) enm(state.settings, 'autoPat', ENUM.autoPat, 'settings');
      obj(state, 'flags', R);

      // ── JSON-safety: cycles, functions, undefined, non-finite numbers
      jsonSafe(state, errors);
    } catch (e) {
      errors.push('validate threw: ' + (e && e.message));
    }
    return { ok: errors.length === 0, errors: errors };
  };

  /**
   * Walk a value checking JSON-safety without building path strings (a key stack
   * is joined only when an offender is found). Reports at most 20 offenders.
   */
  function jsonSafe(rootVal, errors) {
    var ancestors = [];   // objects on the current path (cycle detection)
    var keys = [];        // keys on the current path (for error messages)
    var reported = 0;
    function report(msg) { if (reported++ < 20) errors.push('state.' + keys.join('.') + ': ' + msg); }
    function walk(v) {
      if (reported > 20) return;
      var t = typeof v;
      if (t === 'object') {
        if (v === null) return;
        for (var a = 0; a < ancestors.length; a++) if (ancestors[a] === v) { report('cycle'); return; }
        ancestors.push(v);
        if (isArray(v)) {
          for (var i = 0; i < v.length; i++) { keys.push(i); walk(v[i]); keys.pop(); }
        } else {
          for (var k in v) if (hasOwn.call(v, k)) { keys.push(k); walk(v[k]); keys.pop(); }
        }
        ancestors.pop();
        return;
      }
      if (t === 'number') { if (v !== v || v === INF || v === -INF) report('non-finite number'); return; }
      if (t === 'function') { report('function in state'); return; }
      if (t === 'undefined') { report('undefined in state'); return; }
    }
    walk(rootVal);
  }

  /**
   * Convenience: validate and throw on the first error (used by debug/store).
   * @param {CareerState} state @returns {CareerState}
   */
  Schema.assertValid = function (state) {
    var r = Schema.validate(state);
    if (!r.ok) throw new Error('Schema.validate: ' + r.errors.slice(0, 5).join('; ') + (r.errors.length > 5 ? ' (+' + (r.errors.length - 5) + ' more)' : ''));
    return state;
  };

  /**
   * Valid phases for a stage.
   * @param {string} stage @returns {string[]}
   */
  Schema.phasesFor = function (stage) {
    return (ENUM.phases[stage] || []).slice();
  };

  Schema.ATTRS = ATTRS;
  Schema.STAT_KEYS = STAT_KEYS;
  RTG.Schema = Schema;
})(typeof window !== 'undefined' ? window : globalThis);
