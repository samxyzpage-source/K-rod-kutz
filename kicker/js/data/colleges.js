/**
 * Road to Glory: Kicker — college data (SPEC §2.12.1, §2.12.3).
 *
 * RTG.Data.conferences : 6 conferences in spec order [{id, name, idx}]
 * RTG.Data.colleges    : 48 real FBS programs, 6 conferences x 8 (2026 alignment; only 48 of ~134
 *                        programs fit the engine's 6x8 structure). Order within a conference is
 *                        load-bearing: rivals are (0,7) (1,6) (2,5) (3,4) and the circle-method
 *                        schedule uses it, so each conference is ordered to put real rivalries on those
 *                        pairs (Iron Bowl, The Game, Red River, Army-Navy, Egg-Bowl-style pairings...).
 * RTG.Data.rivalPairs  : [[0,7],[1,6],[2,5],[3,4]]
 * RTG.Data.bowls       : 6 major (New Year's Six) + 12 minor real bowls with venue climate.
 * RTG.Data.collegeById : {[id]: team} lookup cache.
 *
 * Team fields (static half of §2.5.1 Team; Schema.createTeam adds coachAgg,
 * surface, kicker):
 *   id ('COA0'..'GLL7' = conf id + idx; never collides with NFL ids),
 *   name (full display name), school, nick, city, state, region,
 *   conf, confIdx (0..7), rivalIdx, rival (id), prestige 1..5, OFF, DEF, ST,
 *   climate 'warm'|'temperate'|'cold', dome, altitude, windy, rainy,
 *   colors [primary, secondary], abbr (3 letters, unique), verifiedFictional.
 *
 * Pure data. No randomness, no DOM.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.Data = RTG.Data || {};

  var conferences = [
    { id: 'SEC', name: 'Southeastern Conference', idx: 0 },
    { id: 'BIG', name: 'Big Ten Conference', idx: 1 },
    { id: 'XII', name: 'Big 12 Conference', idx: 2 },
    { id: 'ACC', name: 'Atlantic Coast Conference', idx: 3 },
    { id: 'PAC', name: 'Pac-12 Conference', idx: 4 },
    { id: 'AAC', name: 'American Conference', idx: 5 }
  ];

  var rivalPairs = [[0, 7], [1, 6], [2, 5], [3, 4]];

  /**
   * Compact rows: [school, nick, city, state, region, prestige, OFF, DEF, ST,
   *                climate code ('W'|'T'|'C' + optional 'D' dome, 'A' altitude,
   *                '!' windy, '~' rainy), primary, secondary, abbr]
   * Grouped by conference in spec order.
   */
  var ROWS = {
    SEC: [
      ['Alabama', 'Crimson Tide', 'Tuscaloosa', 'AL', 'SE', 5, 91, 88, 82, 'W', '#9e1b32', '#ffffff', 'ALA'],
      ['Georgia', 'Bulldogs', 'Athens', 'GA', 'SE', 5, 90, 89, 81, 'W', '#ba0c2f', '#000000', 'UGA'],
      ['LSU', 'Tigers', 'Baton Rouge', 'LA', 'SE', 4, 85, 82, 77, 'W', '#461d7c', '#fdd023', 'LSU'],
      ['Texas', 'Longhorns', 'Austin', 'TX', 'SW', 5, 89, 86, 80, 'W', '#bf5700', '#ffffff', 'TEX'],
      ['Oklahoma', 'Sooners', 'Norman', 'OK', 'SW', 4, 84, 81, 76, 'T!', '#841617', '#fdf9d8', 'OKL'],
      ['Tennessee', 'Volunteers', 'Knoxville', 'TN', 'SE', 4, 83, 79, 75, 'T', '#ff8200', '#4b4b4b', 'TEN'],
      ['Florida', 'Gators', 'Gainesville', 'FL', 'SE', 3, 77, 76, 72, 'W', '#0021a5', '#fa4616', 'FLA'],
      ['Auburn', 'Tigers', 'Auburn', 'AL', 'SE', 3, 78, 77, 73, 'W', '#0c2340', '#e87722', 'AUB']
    ],
    BIG: [
      ['Ohio State', 'Buckeyes', 'Columbus', 'OH', 'MW', 5, 92, 89, 82, 'C', '#bb0000', '#ffffff', 'OSU'],
      ['Penn State', 'Nittany Lions', 'University Park', 'PA', 'NE', 4, 85, 84, 77, 'C', '#041e42', '#ffffff', 'PSU'],
      ['Oregon', 'Ducks', 'Eugene', 'OR', 'W', 5, 89, 84, 80, 'T~', '#154733', '#fee123', 'ORE'],
      ['Wisconsin', 'Badgers', 'Madison', 'WI', 'MW', 3, 76, 78, 72, 'C', '#c5050c', '#ffffff', 'WIS'],
      ['Nebraska', 'Cornhuskers', 'Lincoln', 'NE', 'MW', 3, 75, 74, 71, 'C!', '#e41c38', '#ffffff', 'NEB'],
      ['Washington', 'Huskies', 'Seattle', 'WA', 'W', 4, 83, 80, 76, 'T~', '#4b2e83', '#b7a57a', 'UWA'],
      ['USC', 'Trojans', 'Los Angeles', 'CA', 'W', 4, 86, 78, 76, 'W', '#990000', '#ffcc00', 'USC'],
      ['Michigan', 'Wolverines', 'Ann Arbor', 'MI', 'MW', 5, 88, 88, 81, 'C', '#00274c', '#ffcb05', 'MIC']
    ],
    XII: [
      ['Kansas State', 'Wildcats', 'Manhattan', 'KS', 'MW', 3, 78, 76, 73, 'C!', '#512888', '#ffffff', 'KSU'],
      ['Utah', 'Utes', 'Salt Lake City', 'UT', 'W', 3, 77, 79, 73, 'CA', '#cc0000', '#ffffff', 'UTA'],
      ['Baylor', 'Bears', 'Waco', 'TX', 'SW', 3, 74, 72, 70, 'W', '#154734', '#ffb81c', 'BAY'],
      ['Iowa State', 'Cyclones', 'Ames', 'IA', 'MW', 3, 76, 75, 72, 'C!', '#c8102e', '#f1be48', 'ISU'],
      ['Oklahoma State', 'Cowboys', 'Stillwater', 'OK', 'SW', 3, 75, 73, 71, 'T!', '#ff7300', '#000000', 'OKS'],
      ['TCU', 'Horned Frogs', 'Fort Worth', 'TX', 'SW', 3, 77, 74, 72, 'W', '#4d1979', '#a3a9ac', 'TCU'],
      ['BYU', 'Cougars', 'Provo', 'UT', 'W', 3, 76, 75, 72, 'CA', '#002e5d', '#ffffff', 'BYU'],
      ['Kansas', 'Jayhawks', 'Lawrence', 'KS', 'MW', 2, 69, 66, 66, 'C!', '#0051ba', '#ffc82d', 'KAN']
    ],
    ACC: [
      ['Clemson', 'Tigers', 'Clemson', 'SC', 'SE', 5, 88, 86, 80, 'W', '#f66733', '#522d80', 'CLM'],
      ['Florida State', 'Seminoles', 'Tallahassee', 'FL', 'SE', 4, 82, 80, 76, 'W', '#782f40', '#ceb888', 'FSU'],
      ['Virginia Tech', 'Hokies', 'Blacksburg', 'VA', 'SE', 3, 74, 76, 72, 'T', '#630031', '#cf4420', 'VTC'],
      ['NC State', 'Wolfpack', 'Raleigh', 'NC', 'SE', 3, 74, 73, 70, 'T', '#cc0000', '#ffffff', 'NCS'],
      ['North Carolina', 'Tar Heels', 'Chapel Hill', 'NC', 'SE', 3, 75, 71, 70, 'T', '#7bafd4', '#13294b', 'UNC'],
      ['Virginia', 'Cavaliers', 'Charlottesville', 'VA', 'SE', 2, 68, 67, 65, 'T', '#232d4b', '#f84c1e', 'UVA'],
      ['Miami', 'Hurricanes', 'Coral Gables', 'FL', 'SE', 4, 84, 79, 76, 'W~', '#f47321', '#005030', 'CAN'],
      ['Georgia Tech', 'Yellow Jackets', 'Atlanta', 'GA', 'SE', 3, 73, 72, 70, 'W', '#b3a369', '#003057', 'GTC']
    ],
    PAC: [
      ['Boise State', 'Broncos', 'Boise', 'ID', 'W', 3, 79, 76, 74, 'C', '#0033a0', '#f1a800', 'BOI'],
      ['Oregon State', 'Beavers', 'Corvallis', 'OR', 'W', 2, 68, 69, 66, 'T~', '#dc4405', '#000000', 'ORS'],
      ['Colorado State', 'Rams', 'Fort Collins', 'CO', 'W', 2, 67, 66, 65, 'CA', '#1e4d2b', '#c8c372', 'CSU'],
      ['San Diego State', 'Aztecs', 'San Diego', 'CA', 'W', 2, 66, 70, 67, 'W', '#a6192e', '#000000', 'SDS'],
      ['Texas State', 'Bobcats', 'San Marcos', 'TX', 'SW', 2, 68, 65, 64, 'W', '#501214', '#8d774a', 'TXS'],
      ['Utah State', 'Aggies', 'Logan', 'UT', 'W', 2, 67, 64, 64, 'CA', '#00263a', '#8a8d8f', 'USU'],
      ['Washington State', 'Cougars', 'Pullman', 'WA', 'W', 2, 70, 67, 66, 'C', '#981e32', '#d3d3d3', 'WSU'],
      ['Fresno State', 'Bulldogs', 'Fresno', 'CA', 'W', 2, 69, 68, 66, 'W', '#db0032', '#ffffff', 'FRS']
    ],
    AAC: [
      ['South Florida', 'Bulls', 'Tampa', 'FL', 'SE', 2, 70, 66, 65, 'W~', '#006747', '#cfc493', 'USF'],
      ['Army', 'Black Knights', 'West Point', 'NY', 'NE', 2, 69, 70, 67, 'C', '#000000', '#d4bf91', 'ARM'],
      ['Memphis', 'Tigers', 'Memphis', 'TN', 'SE', 3, 74, 69, 69, 'T', '#003087', '#898d8d', 'MPH'],
      ['East Carolina', 'Pirates', 'Greenville', 'NC', 'SE', 2, 68, 65, 64, 'T', '#592a8a', '#fdc82f', 'ECU'],
      ['Charlotte', '49ers', 'Charlotte', 'NC', 'SE', 1, 61, 60, 60, 'T', '#006450', '#b9975b', 'CLT'],
      ['Tulane', 'Green Wave', 'New Orleans', 'LA', 'SE', 3, 73, 71, 69, 'W~', '#006747', '#8ec4ea', 'TUL'],
      ['Navy', 'Midshipmen', 'Annapolis', 'MD', 'NE', 2, 70, 68, 67, 'T', '#00205b', '#c5b783', 'NVY'],
      ['UTSA', 'Roadrunners', 'San Antonio', 'TX', 'SW', 2, 69, 64, 64, 'WD', '#0c2340', '#f15a22', 'UTS']
    ]
  };;

  var CLIMATE = { W: 'warm', T: 'temperate', C: 'cold' };

  /**
   * Expand one compact row into a Team data object.
   * @param {Array} r compact row
   * @param {string} conf conference id
   * @param {number} idx index within the conference
   */
  function expand(r, conf, idx) {
    var code = r[9];
    var rivalIdx = 7 - idx;
    return {
      id: conf + idx,
      name: r[0] + ' ' + r[1],
      school: r[0],
      nick: r[1],
      city: r[2],
      state: r[3],
      region: r[4],
      conf: conf,
      confIdx: idx,
      rivalIdx: rivalIdx,
      rival: conf + rivalIdx,
      prestige: r[5],
      OFF: r[6],
      DEF: r[7],
      ST: r[8],
      climate: CLIMATE[code.charAt(0)],
      dome: code.indexOf('D') >= 0,
      altitude: code.indexOf('A') >= 0,
      windy: code.indexOf('!') >= 0,
      rainy: code.indexOf('~') >= 0,
      colors: [r[10], r[11]],
      abbr: r[12],
      verifiedFictional: false        // real FBS programs (SPEC D22); the NFL side stays fictional
    };
  }

  var colleges = [];
  var collegeById = {};
  for (var c = 0; c < conferences.length; c++) {
    var cid = conferences[c].id;
    var rows = ROWS[cid];
    for (var i = 0; i < rows.length; i++) {
      var team = expand(rows[i], cid, i);
      colleges.push(team);
      collegeById[team.id] = team;
    }
  }

  /**
   * Bowls (§2.12.3). tier 'major' bowls host playoff quarterfinals/semis and
   * the National Title Game (year mod 6); minors are played in week 14.
   * Compact: [id, name, city, state, tier, climate code]
   */
  var BOWL_ROWS = [
    ['rose', 'Rose Bowl', 'Pasadena', 'CA', 'major', 'W'],
    ['sugar', 'Sugar Bowl', 'New Orleans', 'LA', 'major', 'WD'],
    ['orange', 'Orange Bowl', 'Miami Gardens', 'FL', 'major', 'W~'],
    ['cotton', 'Cotton Bowl', 'Arlington', 'TX', 'major', 'TD'],
    ['fiesta', 'Fiesta Bowl', 'Glendale', 'AZ', 'major', 'WD'],
    ['peach', 'Peach Bowl', 'Atlanta', 'GA', 'major', 'WD'],
    ['citrus', 'Citrus Bowl', 'Orlando', 'FL', 'minor', 'W~'],
    ['alamo', 'Alamo Bowl', 'San Antonio', 'TX', 'minor', 'WD'],
    ['holiday', 'Holiday Bowl', 'San Diego', 'CA', 'minor', 'W'],
    ['gator', 'Gator Bowl', 'Jacksonville', 'FL', 'minor', 'W'],
    ['sun', 'Sun Bowl', 'El Paso', 'TX', 'minor', 'WA'],
    ['music', 'Music City Bowl', 'Nashville', 'TN', 'minor', 'T'],
    ['libertyb', 'Liberty Bowl', 'Memphis', 'TN', 'minor', 'T'],
    ['pinstripe', 'Pinstripe Bowl', 'Bronx', 'NY', 'minor', 'C!'],
    ['lasvegas', 'Las Vegas Bowl', 'Las Vegas', 'NV', 'minor', 'WD'],
    ['texas', 'Texas Bowl', 'Houston', 'TX', 'minor', 'WD'],
    ['duke', "Duke's Mayo Bowl", 'Charlotte', 'NC', 'minor', 'T'],
    ['pop', 'Pop-Tarts Bowl', 'Orlando', 'FL', 'minor', 'W~']
  ];;

  var bowls = [];
  for (var b = 0; b < BOWL_ROWS.length; b++) {
    var br = BOWL_ROWS[b];
    var bc = br[5];
    bowls.push({
      id: br[0],
      name: br[1],
      city: br[2],
      state: br[3],
      tier: br[4],
      climate: CLIMATE[bc.charAt(0)],
      dome: bc.indexOf('D') >= 0,
      altitude: bc.indexOf('A') >= 0,
      windy: bc.indexOf('!') >= 0,
      rainy: bc.indexOf('~') >= 0
    });
  }

  RTG.Data.conferences = conferences;
  RTG.Data.colleges = colleges;
  RTG.Data.collegeById = collegeById;
  RTG.Data.rivalPairs = rivalPairs;
  RTG.Data.bowls = bowls;
})(typeof window !== 'undefined' ? window : globalThis);
