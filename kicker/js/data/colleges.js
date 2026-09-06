/**
 * Road to Glory: Kicker — college data (SPEC §2.12.1, §2.12.3).
 *
 * RTG.Data.conferences : 6 conferences in spec order [{id, name, idx}]
 * RTG.Data.colleges    : 48 teams in the EXACT spec order (conference by
 *                        conference, idx 0..7 within each). Index within the
 *                        conference is load-bearing: rivals are (0,7) (1,6)
 *                        (2,5) (3,4) and the circle-method schedule uses it.
 * RTG.Data.rivalPairs  : [[0,7],[1,6],[2,5],[3,4]]
 * RTG.Data.bowls       : 6 major + 12 minor bowls with venue climate.
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
    { id: 'COA', name: 'Coastal Alliance', idx: 0 },
    { id: 'HRT', name: 'Heartland Conference', idx: 1 },
    { id: 'BFR', name: 'Big Frontier', idx: 2 },
    { id: 'PAC', name: 'Pacific Crest', idx: 3 },
    { id: 'SOU', name: 'Southern Union', idx: 4 },
    { id: 'GLL', name: 'Great Lakes League', idx: 5 }
  ];

  var rivalPairs = [[0, 7], [1, 6], [2, 5], [3, 4]];

  /**
   * Compact rows: [school, nick, city, state, region, prestige, OFF, DEF, ST,
   *                climate code ('W'|'T'|'C' + optional 'D' dome, 'A' altitude,
   *                '!' windy, '~' rainy), primary, secondary, abbr]
   * Grouped by conference in spec order.
   */
  var ROWS = {
    COA: [
      ['Atlantic Tech', 'Tidewaters', 'Norfolk', 'VA', 'SE', 5, 88, 85, 78, 'T', '#0b3d91', '#f2c14e', 'ATT'],
      ['Chesapeake State', 'Admirals', 'Annapolis', 'MD', 'NE', 4, 82, 80, 74, 'T', '#14213d', '#c0c0c0', 'CHS'],
      ['Carolina Pines', 'Foxhounds', 'Raleigh', 'NC', 'SE', 3, 76, 74, 70, 'T', '#1d4d2b', '#f4e9d0', 'CPN'],
      ['Savannah Marsh', 'Herons', 'Savannah', 'GA', 'SE', 3, 74, 76, 68, 'W', '#2a6f5c', '#f7f3e3', 'SAV'],
      ['James River', 'Ironclads', 'Richmond', 'VA', 'SE', 4, 80, 82, 72, 'T', '#7a1f2b', '#d4af37', 'JRV'],
      ['Jersey Shore', 'Boardwalkers', 'Atlantic City', 'NJ', 'NE', 2, 68, 66, 64, 'C', '#005f73', '#ee9b00', 'JSH'],
      ['Beacon Hill', 'Lamplighters', 'Boston', 'MA', 'NE', 3, 75, 72, 70, 'C', '#1b263b', '#e0e1dd', 'BHL'],
      ['Newport Bay', 'Schooners', 'Newport', 'RI', 'NE', 2, 66, 68, 64, 'C~', '#003049', '#fcbf49', 'NPB']
    ],
    HRT: [
      ['Prairie Tech', 'Sodbusters', 'Lincoln', 'NE', 'MW', 5, 90, 86, 80, 'C', '#d00000', '#f4e9d0', 'PRT'],
      ['Great Plains Tech', 'Windmills', 'Wichita', 'KS', 'MW', 4, 84, 80, 76, 'C!', '#ffb703', '#023047', 'GPT'],
      ['Iowa Ridge', 'Harvesters', 'Des Moines', 'IA', 'MW', 4, 82, 84, 74, 'C', '#1a1a1a', '#f6c445', 'IWR'],
      ['Twin Cities', 'Northmen', 'Minneapolis', 'MN', 'MW', 3, 76, 78, 72, 'C', '#2a3d66', '#e4c580', 'TWC'],
      ['Ozark', 'Ridgerunners', 'Springfield', 'MO', 'MW', 2, 68, 70, 66, 'T', '#4e6e3f', '#f2e8cf', 'OZK'],
      ['Missouri Valley', 'Steamboats', 'St. Louis', 'MO', 'MW', 3, 74, 72, 70, 'T', '#0b3954', '#bfd7ea', 'MOV'],
      ['Cornbelt State', 'Reapers', 'Cedar Rapids', 'IA', 'MW', 2, 64, 66, 62, 'C', '#386641', '#f2e8cf', 'CBS'],
      ['Dakota Frontier', 'Drovers', 'Fargo', 'ND', 'MW', 1, 60, 62, 60, 'C!', '#5c4033', '#e9d8a6', 'DKF']
    ],
    BFR: [
      ['Lone Star Tech', 'Longriders', 'Lubbock', 'TX', 'SW', 5, 91, 85, 80, 'W!', '#8b0000', '#e8d5a3', 'LST'],
      ['Red River State', 'Rustlers', 'Denison', 'TX', 'SW', 4, 84, 80, 74, 'W', '#7b2d26', '#e6b422', 'RRS'],
      ['Hill Country', 'Armadillos', 'Austin', 'TX', 'SW', 3, 74, 76, 70, 'W', '#5b8c5a', '#f4e9d0', 'HCA'],
      ['Cimarron', 'Twisters', 'Stillwater', 'OK', 'SW', 4, 83, 82, 76, 'T!', '#e07a1f', '#2b2b2b', 'CIM'],
      ['Rio Bravo', 'Mesquites', 'Laredo', 'TX', 'SW', 2, 66, 64, 62, 'W', '#2b6a4d', '#f5d49b', 'RIO'],
      ['Gulf Shore', 'Squalls', 'Corpus Christi', 'TX', 'SW', 3, 78, 72, 70, 'W!', '#006d77', '#ffddd2', 'GSS'],
      ['Panhandle', 'Dusters', 'Amarillo', 'TX', 'SW', 1, 58, 60, 58, 'T!', '#9c6644', '#f1dca7', 'PAN'],
      ['Sonoran Tech', 'Sidewinders', 'Tucson', 'AZ', 'SW', 2, 66, 68, 64, 'W', '#b35c1e', '#f2e2c4', 'SNT']
    ],
    PAC: [
      ['Golden Coast', 'Condors', 'Los Angeles', 'CA', 'W', 5, 89, 84, 80, 'W', '#ffb100', '#1c3f60', 'GCC'],
      ['Bay Area Tech', 'Fog', 'San Francisco', 'CA', 'W', 4, 82, 80, 74, 'T', '#4a6d7c', '#dfe7ea', 'BAT'],
      ['Cascadia', 'Stormcrows', 'Portland', 'OR', 'W', 4, 83, 83, 76, 'T~', '#1d3b2a', '#a9c5b3', 'CAS'],
      ['Sierra State', 'Prospectors', 'Reno', 'NV', 'W', 3, 76, 74, 70, 'CA', '#5e503f', '#eae2b7', 'SRS'],
      ['Desert Vista', 'Scorpions', 'Phoenix', 'AZ', 'SW', 3, 75, 75, 70, 'W', '#6b2737', '#e9c46a', 'DVS'],
      ['Emerald City', 'Orcas', 'Seattle', 'WA', 'W', 3, 74, 76, 72, 'T~', '#0b3d2e', '#7fc7ff', 'EMC'],
      ['High Desert', 'Kestrels', 'Boise', 'ID', 'W', 2, 66, 66, 64, 'C', '#1f4e79', '#f4a259', 'HDK'],
      ['Sonoma', 'Vintners', 'Santa Rosa', 'CA', 'W', 1, 60, 58, 58, 'T', '#6a1b4d', '#f1e3d3', 'SNM']
    ],
    SOU: [
      ['Crimson Bluff', 'Boars', 'Tuscaloosa', 'AL', 'SE', 5, 92, 88, 82, 'W', '#8b1a1a', '#f4e9d0', 'CRB'],
      ['Magnolia', 'Thoroughbreds', 'Jackson', 'MS', 'SE', 4, 84, 85, 76, 'W', '#2d3a8c', '#e8e3d3', 'MAG'],
      ['Bayou Tech', 'Egrets', 'Baton Rouge', 'LA', 'SE', 4, 82, 80, 74, 'W', '#2f1f5e', '#e5b83b', 'BYT'],
      ['Tennessee Ridge', 'Copperheads', 'Knoxville', 'TN', 'SE', 3, 76, 78, 70, 'T', '#d1541e', '#f4e9d0', 'TNR'],
      ['Peachtree', 'Kingfishers', 'Atlanta', 'GA', 'SE', 3, 78, 74, 72, 'W', '#0d5c63', '#f6ae2d', 'PCH'],
      ['Blue Ridge', 'Colliers', 'Asheville', 'NC', 'SE', 2, 68, 70, 64, 'C', '#22333b', '#c6ac8f', 'BLR'],
      ['Gulfport', 'Sailfish', 'Gulfport', 'MS', 'SE', 2, 66, 64, 62, 'W', '#0077b6', '#caf0f8', 'GPS'],
      ['Everglades Tech', 'Manatees', 'Miami', 'FL', 'SE', 5, 90, 84, 78, 'W', '#0a6b5e', '#f7a823', 'EVT']
    ],
    GLL: [
      ['Lakeshore State', 'Freighters', 'Cleveland', 'OH', 'MW', 5, 87, 89, 80, 'C', '#4b2e1e', '#f5b400', 'LKS'],
      ['Motor City Tech', 'Gears', 'Detroit', 'MI', 'MW', 4, 82, 84, 76, 'CD', '#0f4c81', '#c0c0c0', 'MCT'],
      ['Scioto Valley', 'Ironmen', 'Columbus', 'OH', 'MW', 4, 84, 84, 78, 'C', '#9c1c1c', '#e6e6e6', 'SCV'],
      ['Northwoods', 'Voyageurs', 'Green Bay', 'WI', 'MW', 3, 74, 76, 72, 'C', '#1e3a2f', '#c8a951', 'NWV'],
      ['Rust Belt', 'Foundrymen', 'Pittsburgh', 'PA', 'NE', 3, 72, 76, 70, 'C', '#3a3a3a', '#d9a520', 'RBF'],
      ['Erie Shore', 'Lightkeepers', 'Erie', 'PA', 'NE', 2, 66, 68, 64, 'C~', '#234e70', '#fbd1a2', 'ERI'],
      ['Wabash Valley', 'Pacesetters', 'Indianapolis', 'IN', 'MW', 2, 68, 64, 64, 'CD', '#0e2a47', '#b9c6d2', 'WAB'],
      ['Superior Bay', 'Icebreakers', 'Duluth', 'MN', 'MW', 1, 60, 62, 60, 'C!', '#274c77', '#e7ecef', 'SUP']
    ]
  };

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
      verifiedFictional: true
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
    ['citrus', 'Citrus Grove Bowl', 'Orlando', 'FL', 'major', 'W~'],
    ['cactus', 'Cactus Sun Bowl', 'Phoenix', 'AZ', 'major', 'WD'],
    ['harbor', 'Harbor Bowl', 'San Diego', 'CA', 'major', 'W'],
    ['peach', 'Peach Blossom Bowl', 'Atlanta', 'GA', 'major', 'WD'],
    ['alamo', 'Alamo Plaza Bowl', 'San Antonio', 'TX', 'major', 'WD'],
    ['frontier', 'Frontier Bowl', 'Dallas', 'TX', 'major', 'TD'],
    ['lakeshore', 'Lakeshore Bowl', 'Chicago', 'IL', 'minor', 'C!'],
    ['silverdollar', 'Silver Dollar Bowl', 'Reno', 'NV', 'minor', 'CA'],
    ['gulfcoast', 'Gulf Coast Bowl', 'Mobile', 'AL', 'minor', 'W~'],
    ['pioneer', 'Pioneer Bowl', 'Boise', 'ID', 'minor', 'C'],
    ['redwood', 'Redwood Bowl', 'San Jose', 'CA', 'minor', 'T'],
    ['independence', 'Independence Day Bowl', 'Shreveport', 'LA', 'minor', 'W'],
    ['boardwalk', 'Boardwalk Bowl', 'Atlantic City', 'NJ', 'minor', 'C!'],
    ['bluegrass', 'Bluegrass Bowl', 'Louisville', 'KY', 'minor', 'T'],
    ['musicrow', 'Music Row Bowl', 'Nashville', 'TN', 'minor', 'T'],
    ['sunshine', 'Sunshine Bowl', 'Tampa', 'FL', 'minor', 'W~'],
    ['prairie', 'Prairie Bowl', 'Kansas City', 'MO', 'minor', 'C'],
    ['steel', 'Steel Bowl', 'Pittsburgh', 'PA', 'minor', 'C']
  ];

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
