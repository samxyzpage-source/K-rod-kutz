/**
 * Road to Glory: Kicker — awards catalog (SPEC §2.8).
 *
 * RTG.Data.awards      : [{id, league:'COLLEGE'|'NFL'|'BOTH', name, rule, xp, fame, description, rank?}]
 *                        `rule` is the key RTG.Awards.compute switches on; xp/fame are read from
 *                        Tuning.awards.rewards when present (the numbers below are the §2.8 table
 *                        and only serve as a fallback so the file also works standalone).
 * RTG.Data.awardsById  : {[id]: award}
 * RTG.Data.awardsFor(league) → award[]  (league rows + BOTH rows)
 *
 * Pure data. No randomness, no DOM.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.Data = RTG.Data || {};

  /** Reward override from Tuning (keeps the single-source-of-truth rule for numbers). */
  function reward(id, xp, fame) {
    var T = RTG.Tuning && RTG.Tuning.awards && RTG.Tuning.awards.rewards;
    var r = T && T[id];
    return { xp: r ? r.xp : xp, fame: r ? r.fame : fame };
  }

  /** Build one row. */
  function row(id, league, name, rule, xp, fame, description, extra) {
    var rw = reward(id, xp, fame);
    var a = { id: id, league: league, name: name, rule: rule, xp: rw.xp, fame: rw.fame, description: description };
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) a[k] = extra[k];
    return a;
  }

  var awards = [
    // ── College
    row('GOLDEN_BOOT', 'COLLEGE', 'Golden Boot Award', 'TOP_SCORE', 200, 150,
      'Highest kicker score in the nation. The one they put on the billboard.'),
    row('ALL_AMERICAN_1', 'COLLEGE', 'All-American First Team', 'RANK', 150, 100,
      'Ranked first nationally by kicker score.', { rank: [1, 1] }),
    row('ALL_AMERICAN_2', 'COLLEGE', 'All-American Second Team', 'RANK', 80, 50,
      'Ranked second or third nationally by kicker score.', { rank: [2, 3] }),
    row('ALL_CONF_1', 'COLLEGE', 'All-Conference First Team K', 'CONF_RANK', 80, 40,
      'Best kicker score in your conference.', { rank: [1, 1] }),
    row('FRESHMAN_LEG', 'COLLEGE', 'Freshman Leg of the Year', 'FRESHMAN', 100, 60,
      'Best first-year kicker in the nation (min 12 FGA).'),
    row('IRON_LEG_COLLEGE', 'COLLEGE', 'Iron Leg', 'LONGEST', 60, 40,
      'Longest made field goal of the college season.'),
    row('CLUTCH_KICK_COLLEGE', 'COLLEGE', 'Clutch Kick of the Year', 'CLUTCH', 100, 80,
      'The made kick with the highest pressure × distance in the nation.'),
    row('CCG_MVP', 'COLLEGE', 'Conference Championship MVP', 'DECISIVE_GAME', 120, 120,
      'A decisive make in the conference title game.', { gameKind: 'CCG' }),
    row('NATIONAL_MVP', 'COLLEGE', 'National Championship MVP', 'DECISIVE_GAME', 200, 250,
      'A decisive make in the national title game.', { gameKind: 'CHAMP' }),
    row('ST_PLAYER_OF_WEEK', 'COLLEGE', 'Conference ST Player of the Week', 'WEEKLY', 15, 8,
      'Weekly: best kicker-score gain in the conference (min 2 FGM).', { weekly: true }),
    // ── NFL
    row('GOLDEN_LEG', 'NFL', 'Golden Leg Award', 'TOP_SCORE', 200, 150,
      'Highest kicker score in the league. Agents start calling.'),
    row('ALL_LEAGUE_1', 'NFL', 'All-League First Team K', 'RANK', 180, 120,
      'Ranked first league-wide by kicker score.', { rank: [1, 1] }),
    row('ALL_LEAGUE_2', 'NFL', 'All-League Second Team K', 'RANK', 100, 60,
      'Ranked second league-wide by kicker score.', { rank: [2, 2] }),
    row('PRO_CLASSIC', 'NFL', 'Pro Classic selection', 'CONF_TOP_N', 60, 40,
      'Top two kickers per conference. Free trip, mediocre buffet.', { perConf: 2 }),
    row('STPOY', 'NFL', 'Special Teams Player of the Year', 'STPOY', 220, 150,
      'Kicker score ≥ 1.15 × the runner-up AND ≥ 3 game-winners. Otherwise a punter wins it.'),
    row('IRON_LEG_NFL', 'NFL', 'Iron Leg', 'LONGEST', 60, 40,
      'Longest made field goal of the NFL season.'),
    row('CLUTCH_KICK_NFL', 'NFL', 'Clutch Kick of the Year', 'CLUTCH', 100, 80,
      'The made kick with the highest pressure × distance in the league.'),
    row('CHAMPIONSHIP_MVP', 'NFL', 'Championship Bowl MVP', 'DECISIVE_GAME', 250, 300,
      'A decisive make in the Championship Bowl. Immortality, roughly.', { gameKind: 'CHAMP' }),
    row('COMEBACK_LEG', 'NFL', 'Comeback Leg', 'COMEBACK', 80, 60,
      'A ≥ 85 % season after an injury of six weeks or more.'),
    // ── Both
    row('SEASON_GOAL_1', 'BOTH', 'Season Goal I', 'GOAL', 40, 0, 'First preseason goal met.', { goalIdx: 0 }),
    row('SEASON_GOAL_2', 'BOTH', 'Season Goal II', 'GOAL', 60, 0, 'Second preseason goal met.', { goalIdx: 1 }),
    row('SEASON_GOAL_3', 'BOTH', 'Season Goal III', 'GOAL', 100, 0, 'Third preseason goal met.', { goalIdx: 2 })
  ];

  // season-goal xp comes from Tuning.awards.goalXp when present
  var goalXp = RTG.Tuning && RTG.Tuning.awards && RTG.Tuning.awards.goalXp;
  if (goalXp) for (var i = 0; i < awards.length; i++) if (awards[i].rule === 'GOAL') awards[i].xp = goalXp[awards[i].goalIdx];

  var byId = {};
  for (var j = 0; j < awards.length; j++) byId[awards[j].id] = awards[j];

  RTG.Data.awards = awards;
  RTG.Data.awardsById = byId;
  /**
   * Awards available in a league (plus the BOTH rows).
   * @param {'COLLEGE'|'NFL'} league @returns {object[]}
   */
  RTG.Data.awardsFor = function (league) {
    var out = [];
    for (var k = 0; k < awards.length; k++) if (awards[k].league === league || awards[k].league === 'BOTH') out.push(awards[k]);
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
