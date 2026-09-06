/**
 * Road to Glory: Kicker — NFL data (SPEC §2.12.2, §2.12.3).
 *
 * RTG.Data.nfl               : 32 teams in the EXACT spec order (Liberty N/S/E/W
 *                              then Frontier N/S/E/W, 4 per division).
 * RTG.Data.nflStructure      : {conferences, divisions, byConf} — division order
 *                              ['North','South','East','West'] is the rotation
 *                              order used by Schedule.nfl (divIdx).
 * RTG.Data.championshipHosts : 10 Championship Bowl host cities (year mod 10).
 * RTG.Data.nflById           : {[id]: team} lookup cache.
 *
 * Team fields (static half of §2.5.1; Schema.createTeam adds OFF/DEF/ST,
 * coachAgg, surface, kicker):
 *   id (= abbr), name, city, nick, abbr, conf 'Liberty'|'Frontier', confIdx,
 *   div 'North'|'South'|'East'|'West', divIdx, region, colors, climate
 *   ('dome' teams: climate 'dome', dome true), dome, bigMarket, windy, rainy,
 *   altitude, verifiedFictional.
 *
 * Pure data.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.Data = RTG.Data || {};

  var conferences = ['Liberty', 'Frontier'];
  var divisions = ['North', 'South', 'East', 'West'];

  /**
   * Compact rows in spec order:
   * [city, nick, abbr, primary, secondary, climate, region, flags]
   * flags: 'M' big market, '!' windy, '~' rainy, 'A' altitude
   */
  var ROWS = [
    // Liberty North
    ['Boston', 'Harbormen', 'BOS', '#0b2a4a', '#d8172f', 'cold', 'NE', ''],
    ['Pittsburgh', 'Forge', 'PIT', '#1a1a1a', '#f2b705', 'cold', 'NE', ''],
    ['Cleveland', 'Rockhounds', 'CLE', '#5b3a1a', '#f37021', 'cold', 'MW', '!'],
    ['Buffalo', 'Blizzard', 'BUF', '#1c3f95', '#ffffff', 'cold', 'NE', '!'],
    // Liberty South
    ['Nashville', 'Rhythm', 'NSH', '#27235c', '#c9a227', 'temperate', 'SE', ''],
    ['Jacksonville', 'Tidewater', 'JAX', '#00594c', '#c0c0c0', 'warm', 'SE', ''],
    ['Houston', 'Launch', 'HOU', '#0c2340', '#e03a3e', 'dome', 'SW', ''],
    ['Charlotte', 'Crown', 'CHA', '#1b1b1b', '#7ac142', 'temperate', 'SE', ''],
    // Liberty East
    ['New York', 'Empire', 'NYE', '#0f2c59', '#ffffff', 'cold', 'NE', 'M!'],
    ['Baltimore', 'Privateers', 'BAL', '#2e1a47', '#d4a017', 'temperate', 'NE', ''],
    ['Miami', 'Barracudas', 'MIA', '#005c6e', '#ff8552', 'warm', 'SE', '~'],
    ['Philadelphia', 'Founders', 'PHI', '#004c54', '#a5acaf', 'cold', 'NE', ''],
    // Liberty West
    ['Denver', 'Summit', 'DEN', '#e8641b', '#1b2a49', 'cold', 'W', 'A'],
    ['Kansas City', 'Stampede', 'KC', '#b3121b', '#f2c14e', 'cold', 'MW', ''],
    ['Las Vegas', 'Neon', 'LV', '#000000', '#ff2d95', 'dome', 'W', ''],
    ['Salt Lake', 'Peaks', 'SLC', '#3a5f8f', '#ffffff', 'cold', 'W', 'A'],
    // Frontier North
    ['Chicago', 'Wind', 'CHI', '#0b162a', '#c83803', 'cold', 'MW', 'M!'],
    ['Detroit', 'Motors', 'DET', '#005e91', '#c0c6ca', 'dome', 'MW', ''],
    ['Minneapolis', 'Frost', 'MIN', '#5a3d8f', '#f4d35e', 'dome', 'MW', ''],
    ['Milwaukee', 'Brewmasters', 'MIL', '#1f4d3a', '#f2c14e', 'cold', 'MW', ''],
    // Frontier South
    ['Atlanta', 'Phoenix', 'ATL', '#a71930', '#000000', 'dome', 'SE', ''],
    ['New Orleans', 'Brass', 'NO', '#d3bc8d', '#101820', 'dome', 'SE', ''],
    ['Tampa Bay', 'Cannons', 'TB', '#d50a0a', '#1f1c19', 'warm', 'SE', '~'],
    ['Memphis', 'Soul', 'MEM', '#5d76a9', '#12173f', 'temperate', 'SE', ''],
    // Frontier East
    ['Washington', 'Sentinels', 'WAS', '#5a1414', '#ffb612', 'temperate', 'NE', ''],
    ['Dallas', 'Outlaws', 'DAL', '#041e42', '#869397', 'dome', 'SW', 'M'],
    ['Cincinnati', 'Riverhawks', 'CIN', '#e5581b', '#1a1a1a', 'cold', 'MW', ''],
    ['Indianapolis', 'Speed', 'IND', '#002c5f', '#a2aaad', 'dome', 'MW', ''],
    // Frontier West
    ['Los Angeles', 'Stars', 'LA', '#1e3a8a', '#f5c518', 'warm', 'W', 'M'],
    ['San Francisco', 'Quakes', 'SF', '#9b1c1c', '#c7b07a', 'temperate', 'W', 'M!'],
    ['Seattle', 'Rain', 'SEA', '#1a2b4c', '#6cc04a', 'temperate', 'W', '~'],
    ['Phoenix', 'Firebirds', 'PHX', '#b0243c', '#1a1a1a', 'dome', 'SW', '']
  ];

  /**
   * Expand a compact row into a Team data object.
   * @param {Array} r compact row
   * @param {number} i index in the 32-team list (conf = i/16, div = (i%16)/4)
   */
  function expand(r, i) {
    var confIdx = Math.floor(i / 16);
    var divIdx = Math.floor((i % 16) / 4);
    var flags = r[7];
    return {
      id: r[2],
      name: r[0] + ' ' + r[1],
      city: r[0],
      nick: r[1],
      abbr: r[2],
      conf: conferences[confIdx],
      confIdx: confIdx,
      div: divisions[divIdx],
      divIdx: divIdx,
      region: r[6],
      colors: [r[3], r[4]],
      climate: r[5],
      dome: r[5] === 'dome',
      bigMarket: flags.indexOf('M') >= 0,
      windy: flags.indexOf('!') >= 0,
      rainy: flags.indexOf('~') >= 0,
      altitude: flags.indexOf('A') >= 0,
      verifiedFictional: true
    };
  }

  var nfl = [];
  var nflById = {};
  var byConf = {};
  for (var i = 0; i < ROWS.length; i++) {
    var t = expand(ROWS[i], i);
    nfl.push(t);
    nflById[t.id] = t;
    if (!byConf[t.conf]) byConf[t.conf] = {};
    if (!byConf[t.conf][t.div]) byConf[t.conf][t.div] = [];
    byConf[t.conf][t.div].push(t.id);
  }

  /**
   * Championship Bowl hosts (§2.12.3): "8 dome cities + Miami + LA", rotated by
   * `year mod 10`. The data has 9 dome teams; Detroit is the one left out so the
   * list is exactly 10 entries as the spec's modulus requires.
   */
  var championshipHosts = [
    { city: 'Houston', teamId: 'HOU', dome: true, climate: 'dome' },
    { city: 'Las Vegas', teamId: 'LV', dome: true, climate: 'dome' },
    { city: 'Atlanta', teamId: 'ATL', dome: true, climate: 'dome' },
    { city: 'New Orleans', teamId: 'NO', dome: true, climate: 'dome' },
    { city: 'Dallas', teamId: 'DAL', dome: true, climate: 'dome' },
    { city: 'Miami', teamId: 'MIA', dome: false, climate: 'warm' },
    { city: 'Indianapolis', teamId: 'IND', dome: true, climate: 'dome' },
    { city: 'Phoenix', teamId: 'PHX', dome: true, climate: 'dome' },
    { city: 'Los Angeles', teamId: 'LA', dome: false, climate: 'warm' },
    { city: 'Minneapolis', teamId: 'MIN', dome: true, climate: 'dome' }
  ];

  RTG.Data.nfl = nfl;
  RTG.Data.nflById = nflById;
  RTG.Data.nflStructure = {
    conferences: conferences,
    divisions: divisions,
    teamsPerDivision: 4,
    byConf: byConf,
    championshipName: 'The Championship Bowl'
  };
  RTG.Data.championshipHosts = championshipHosts;
})(typeof window !== 'undefined' ? window : globalThis);
