/**
 * Road to Glory: Kicker — record base values (SPEC §2.9).
 *
 * RTG.Data.records = {
 *   keys:  ordered record keys (display order),
 *   meta:  {[key]: {label, short, unit:'yd'|'count'|'pts'|'pct'|'seasons', scope:'season'|'career'|'game',
 *                   minFga?: number, fmt:'int'|'pct1', note}},
 *   base:  { college: {[key]: number}, nfl: {[key]: number} }   // legend values per league
 *   leagues: ['college', 'nfl'],
 *   keysFor(league) → keys that exist for that league (college has no careerSeasons).
 * }
 *
 * Schema.createCareer builds `state.records.{college,nfl}` from `base` with
 * legend holders from `Names.legend(rng)` (RecordEntry = {value, holder,
 * holderTeam, year, isUser}). Stats.checkRecords compares against `value`
 * respecting `meta[key].minFga`. Pure data.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.Data = RTG.Data || {};

  var keys = [
    'longFG', 'seasonFGM', 'seasonPts', 'seasonFGpct', 'season50plus',
    'careerFGM', 'careerPts', 'careerFGpct', 'consecutiveFGM', 'careerGW', 'careerSeasons'
  ];

  var meta = {
    longFG:         { label: 'Longest Field Goal', short: 'LONG', unit: 'yd', scope: 'game', fmt: 'int', note: 'Longest made field goal' },
    seasonFGM:      { label: 'Field Goals Made, Season', short: 'FGM/SZN', unit: 'count', scope: 'season', fmt: 'int', note: 'Regular season + postseason' },
    seasonPts:      { label: 'Points by a Kicker, Season', short: 'PTS/SZN', unit: 'pts', scope: 'season', fmt: 'int', note: 'FG ×3 + PAT ×1' },
    seasonFGpct:    { label: 'Field Goal %, Season', short: 'FG%/SZN', unit: 'pct', scope: 'season', fmt: 'pct1', minFga: 20, note: 'Minimum 20 attempts' },
    season50plus:   { label: '50+ Yard Makes, Season', short: '50+/SZN', unit: 'count', scope: 'season', fmt: 'int', note: 'Made field goals from 50 yards or more' },
    careerFGM:      { label: 'Field Goals Made, Career', short: 'FGM', unit: 'count', scope: 'career', fmt: 'int', note: '' },
    careerPts:      { label: 'Points, Career', short: 'PTS', unit: 'pts', scope: 'career', fmt: 'int', note: '' },
    careerFGpct:    { label: 'Field Goal %, Career', short: 'FG%', unit: 'pct', scope: 'career', fmt: 'pct1', minFga: 100, note: 'Minimum 100 attempts' },
    consecutiveFGM: { label: 'Consecutive Field Goals Made', short: 'STREAK', unit: 'count', scope: 'career', fmt: 'int', note: 'Across seasons' },
    careerGW:       { label: 'Game-Winning Kicks, Career', short: 'GW', unit: 'count', scope: 'career', fmt: 'int', note: 'Decisive makes that gave the lead in a win' },
    careerSeasons:  { label: 'Seasons Played', short: 'SEASONS', unit: 'seasons', scope: 'career', fmt: 'int', note: 'NFL only' }
  };

  /** Base (legend) values per §2.9. Percentages are stored as 0–100 numbers. */
  var base = {
    college: {
      longFG: 62, seasonFGM: 29, seasonPts: 140, seasonFGpct: 96.0, season50plus: 8,
      careerFGM: 90, careerPts: 460, careerFGpct: 89.5, consecutiveFGM: 26, careerGW: 7
    },
    nfl: {
      longFG: 66, seasonFGM: 40, seasonPts: 166, seasonFGpct: 97.2, season50plus: 12,
      careerFGM: 560, careerPts: 2600, careerFGpct: 91.0, consecutiveFGM: 44, careerGW: 30,
      careerSeasons: 22
    }
  };

  /**
   * Record keys that exist for a league (college has no careerSeasons record).
   * @param {'college'|'nfl'} league
   * @returns {string[]}
   */
  function keysFor(league) {
    var b = base[league] || {};
    var out = [];
    for (var i = 0; i < keys.length; i++) if (b[keys[i]] !== undefined) out.push(keys[i]);
    return out;
  }

  RTG.Data.records = {
    keys: keys,
    meta: meta,
    base: base,
    leagues: ['college', 'nfl'],
    keysFor: keysFor
  };
})(typeof window !== 'undefined' ? window : globalThis);
