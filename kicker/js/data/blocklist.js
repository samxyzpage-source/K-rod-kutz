/**
 * Road to Glory: Kicker — trademark blocklist (SPEC §2.12.5, decision D15).
 *
 * RTG.Data.blockedNicknames : nicknames (any case, singular or plural) that no
 *                             fictional team may use.
 * RTG.Data.blockedWords     : extra words that may not appear anywhere in a
 *                             team's school/city/name/nick.
 * RTG.Data.blockedCityNick  : [city, nick] pairs = real professional / FBS
 *                             teams whose nick is NOT globally blocked but must
 *                             not be paired with that city.
 * RTG.Data.nickKey(s)       : normaliser used by the lint (lowercase, letters
 *                             only, singularised).
 * RTG.Data.isBlockedNick(nick, city?) → bool
 *
 * Pure data + pure helpers. Used by test/data_lint.test.js and (optionally) by
 * any UI that lets the user rename a team.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.Data = RTG.Data || {};

  /** Every nickname listed in §2.12.5 (NFL, NCAA FBS, NBA, MLB, NHL extras). */
  var blockedNicknames = [
    // --- real NFL ---
    'Cardinals', 'Falcons', 'Ravens', 'Bills', 'Panthers', 'Bears', 'Bengals', 'Browns',
    'Cowboys', 'Broncos', 'Lions', 'Packers', 'Texans', 'Colts', 'Jaguars', 'Chiefs',
    'Raiders', 'Chargers', 'Rams', 'Dolphins', 'Vikings', 'Patriots', 'Saints', 'Giants',
    'Jets', 'Eagles', 'Steelers', '49ers', 'Seahawks', 'Buccaneers', 'Titans', 'Commanders',
    'Redskins', 'Oilers', 'Niners',
    // --- NCAA FBS (common) ---
    'Tigers', 'Bulldogs', 'Wildcats', 'Cougars', 'Huskies', 'Aggies', 'Trojans', 'Bruins',
    'Ducks', 'Beavers', 'Sooners', 'Longhorns', 'Gators', 'Seminoles', 'Hurricanes',
    'Volunteers', 'Razorbacks', 'Rebels', 'Crimson Tide', 'Buckeyes', 'Wolverines',
    'Spartans', 'Hawkeyes', 'Badgers', 'Cornhuskers', 'Cyclones', 'Jayhawks',
    'Mountaineers', 'Hokies', 'Cavaliers', 'Tar Heels', 'Blue Devils', 'Wolfpack',
    'Demon Deacons', 'Yellow Jackets', 'Gamecocks', 'Commodores', 'Red Raiders',
    'Horned Frogs', 'Bearcats', 'Knights', 'Bulls', 'Owls', 'Lobos', 'Utes',
    'Rainbow Warriors', 'Aztecs', 'Minutemen', 'Roadrunners', 'Bison', 'Jackrabbits',
    'Coyotes', 'Lumberjacks', 'Mustangs', 'Miners', 'Vaqueros', 'Rattlers', 'Racers',
    'Blackhawks', 'Timberwolves', 'Fighting Irish', 'Nittany Lions', 'Golden Gophers',
    'Boilermakers', 'Hoosiers', 'Illini', 'Fighting Illini', 'Scarlet Knights', 'Terrapins',
    'Orange', 'Cardinal', 'Sun Devils', 'Golden Bears', 'Cowgirls', 'Sooner Schooners',
    'Green Wave', 'Golden Hurricane', 'Midshipmen', 'Black Knights', 'Rockets', 'Zips',
    'Chippewas', 'Broncos', 'Golden Flashes', 'RedHawks', 'Redhawks', 'Bobcats', 'Thundering Herd',
    'Mean Green', 'Blazers', 'Hilltoppers', 'Golden Eagles', 'Ragin Cajuns', "Ragin' Cajuns",
    'Warhawks', 'Red Wolves', 'Trojans', 'Mocs', 'Paladins', 'Cornhuskers', 'Hurricane',
    // --- NBA / WNBA ---
    'Lakers', 'Clippers', 'Kings', 'Suns', 'Heat', 'Thunder', 'Hornets', 'Pelicans',
    'Warriors', 'Magic', 'Rockets', 'Pistons', 'Celtics', 'Nets', 'Knicks', '76ers', 'Sixers',
    'Raptors', 'Bucks', 'Pacers', 'Cavaliers', 'Hawks', 'Wizards', 'Grizzlies', 'Mavericks',
    'Spurs', 'Nuggets', 'Jazz', 'Trail Blazers', 'Timberwolves', 'Mystics', 'Liberty',
    'Sparks', 'Storm', 'Mercury', 'Dream', 'Fever', 'Sky', 'Lynx', 'Wings', 'Aces',
    // --- MLB ---
    'Marlins', 'Brewers', 'Twins', 'Cubs', 'Reds', 'Yankees', 'Braves', 'Astros', 'Rangers',
    'Angels', 'Padres', 'Royals', 'Blue Jays', 'Indians', 'Guardians', 'Nationals', 'Orioles',
    'Phillies', 'Pirates', 'Mets', 'Rockies', 'Diamondbacks', 'Athletics', 'Mariners',
    'Dodgers', 'White Sox', 'Red Sox', 'Tigers', 'Rays', 'Devil Rays', 'Expos',
    // --- NHL / MLS (extra scrub) ---
    'Lightning', 'Sabres', 'Bruins', 'Canadiens', 'Senators', 'Maple Leafs', 'Flyers',
    'Penguins', 'Capitals', 'Hurricanes', 'Islanders', 'Devils', 'Red Wings', 'Blue Jackets',
    'Predators', 'Blues', 'Wild', 'Avalanche', 'Oilers', 'Flames', 'Canucks',
    'Sharks', 'Golden Knights', 'Kraken', 'Ducks', 'Whalers', 'Nordiques', 'Sounders',
    'Timbers', 'Galaxy', 'Earthquakes', 'Revolution', 'Fire', 'Crew', 'Dynamo', 'Union',
    'Rapids', 'Real Salt Lake', 'Red Bulls', 'Impact', 'Whitecaps', 'Toronto FC', 'Inter'
  ];

  /** Extra blocked words: may not appear in any team name/city/nick (§2.12.5). */
  var blockedWords = [
    'Hoosier', 'Buckeye', 'Sooner', 'Old Dominion', 'Delta State', 'Boston Common',
    'Crimson Tide', 'Fighting Irish', 'Notre Dame', 'Tar Heel'
  ];

  /**
   * Real professional / FBS "city + nick" pairs whose nick is not globally blocked
   * (or is blocked but listed here too for clarity). A fictional team may use the
   * nick with a different city, but never this exact pairing.
   */
  var blockedCityNick = [
    ['Milwaukee', 'Admirals'], ['Bakersfield', 'Condors'], ['Dallas', 'Stars'],
    ['Toronto', 'Argonauts'], ['Buffalo', 'Sabres'], ['Nashville', 'Predators'],
    ['Columbus', 'Blue Jackets'], ['Vegas', 'Golden Knights'], ['Boston', 'Celtics'],
    ['Chicago', 'Fire'], ['Portland', 'Timbers'], ['Seattle', 'Sounders'],
    ['Houston', 'Dynamo'], ['San Jose', 'Sharks'], ['Anaheim', 'Ducks'],
    ['Tampa Bay', 'Rowdies'], ['Philadelphia', 'Union'], ['Charlotte', 'Hornets'],
    ['Memphis', 'Grizzlies'], ['Oklahoma City', 'Thunder'], ['Utah', 'Jazz'],
    ['Denver', 'Nuggets'], ['Minnesota', 'Wild'], ['Colorado', 'Avalanche'],
    ['Detroit', 'Red Wings'], ['Cleveland', 'Cavaliers'], ['Sacramento', 'Kings'],
    ['Toronto', 'Raptors'], ['Brooklyn', 'Nets'], ['New Jersey', 'Devils'],
    ['Philadelphia', 'Flyers'], ['Pittsburgh', 'Penguins'], ['St. Louis', 'Blues'],
    ['Winnipeg', 'Jets'], ['Calgary', 'Flames'], ['Edmonton', 'Oilers'],
    ['Montreal', 'Canadiens'], ['Ottawa', 'Senators'], ['Washington', 'Capitals'],
    ['Washington', 'Wizards'], ['Washington', 'Mystics'], ['Carolina', 'Hurricanes'],
    ['Florida', 'Panthers'], ['Arizona', 'Coyotes'], ['Indiana', 'Pacers'],
    ['Milwaukee', 'Bucks'], ['Golden State', 'Warriors'], ['Los Angeles', 'Clippers'],
    ['Phoenix', 'Mercury'], ['Atlanta', 'Dream'], ['Seattle', 'Storm'],
    ['San Diego', 'Wave'], ['Kansas City', 'Current'], ['Houston', 'Dash'],
    ['Chicago', 'Red Stars'], ['Portland', 'Thorns'], ['Philadelphia', 'Soul'],
    ['Arizona', 'Rattlers'], ['Tampa Bay', 'Storm'], ['Orlando', 'Predators'],
    ['Boston', 'Cannons'], ['Denver', 'Outlaws'], ['Baltimore', 'Stallions'],
    ['Birmingham', 'Stallions'], ['Michigan', 'Panthers'], ['Houston', 'Gamblers'],
    ['New Jersey', 'Generals'], ['Orlando', 'Apollos'], ['San Antonio', 'Brahmas'],
    ['St. Louis', 'BattleHawks'], ['Arlington', 'Renegades'], ['Vegas', 'Vipers'],
    ['DC', 'Defenders'], ['Memphis', 'Showboats'], ['Houston', 'Roughnecks'],
    ['Seattle', 'Dragons'], ['Orlando', 'Guardians'], ['Sacramento', 'Republic'],
    ['Las Vegas', 'Aviators'], ['Rochester', 'Red Wings'], ['Toledo', 'Mud Hens'],
    ['Durham', 'Bulls'], ['Iowa', 'Cubs'], ['Omaha', 'Storm Chasers'],
    // FBS pairings by common city/school word
    ['Syracuse', 'Orange'], ['Tulane', 'Green Wave'], ['Navy', 'Midshipmen'],
    ['Army', 'Black Knights'], ['Toledo', 'Rockets'], ['Akron', 'Zips'],
    ['Texas', 'Longhorns'], ['Houston', 'Cougars'], ['Memphis', 'Tigers'],
    ['Cincinnati', 'Bearcats'], ['Buffalo', 'Bulls'], ['Temple', 'Owls'], ['Rice', 'Owls'],
    ['SMU', 'Mustangs'], ['UTEP', 'Miners'], ['Charlotte', '49ers'], ['Miami', 'Hurricanes'],
    ['Pittsburgh', 'Panthers'], ['Louisville', 'Cardinals'], ['Boise State', 'Broncos'],
    ['Tulsa', 'Golden Hurricane'], ['Wake Forest', 'Demon Deacons'], ['Georgia Tech', 'Yellow Jackets'],
    ['Air Force', 'Falcons'], ['Nevada', 'Wolf Pack'], ['Hawaii', 'Rainbow Warriors'],
    ['Fresno State', 'Bulldogs'], ['San Diego State', 'Aztecs'], ['New Mexico', 'Lobos'],
    ['Utah', 'Utes'], ['Wyoming', 'Cowboys'], ['Colorado State', 'Rams'], ['Ohio', 'Bobcats'],
    ['Kent State', 'Golden Flashes'], ['Miami (OH)', 'RedHawks'], ['Ball State', 'Cardinals'],
    ['Western Michigan', 'Broncos'], ['Central Michigan', 'Chippewas'], ['Eastern Michigan', 'Eagles'],
    ['Northern Illinois', 'Huskies'], ['Bowling Green', 'Falcons'], ['Marshall', 'Thundering Herd'],
    ['Old Dominion', 'Monarchs'], ['Coastal Carolina', 'Chanticleers'], ['Appalachian State', 'Mountaineers'],
    ['Georgia Southern', 'Eagles'], ['Georgia State', 'Panthers'], ['Troy', 'Trojans'],
    ['South Alabama', 'Jaguars'], ['Texas State', 'Bobcats'], ['Arkansas State', 'Red Wolves'],
    ['Louisiana', "Ragin' Cajuns"], ['Louisiana Tech', 'Bulldogs'], ['Southern Miss', 'Golden Eagles'],
    ['North Texas', 'Mean Green'], ['UTSA', 'Roadrunners'], ['UAB', 'Blazers'],
    ['Florida Atlantic', 'Owls'], ['FIU', 'Panthers'], ['Middle Tennessee', 'Blue Raiders'],
    ['Western Kentucky', 'Hilltoppers'], ['Liberty', 'Flames'], ['James Madison', 'Dukes'],
    ['Jacksonville State', 'Gamecocks'], ['Sam Houston', 'Bearkats'], ['Kennesaw State', 'Owls'],
    ['New Mexico State', 'Aggies'], ['Massachusetts', 'Minutemen'], ['Connecticut', 'Huskies'],
    ['South Florida', 'Bulls'], ['East Carolina', 'Pirates'], ['Navy', 'Mids']
  ];

  /**
   * Normalise a nickname for comparison: lowercase, letters/digits only,
   * singularised (Tigers→tiger, Cowboys→cowboy, Wolves→wolf, Utes→ute).
   * @param {string} s
   * @returns {string}
   */
  function nickKey(s) {
    var k = String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (k.length > 4 && /ies$/.test(k)) return k.slice(0, -3) + 'y';
    if (k.length > 4 && /ves$/.test(k)) return k.slice(0, -3) + 'f';
    if (k.length > 3 && /(ches|shes|xes|sses)$/.test(k)) return k.slice(0, -2);
    if (k.length > 3 && /s$/.test(k) && !/ss$/.test(k)) return k.slice(0, -1);
    return k;
  }

  var keySet = null;
  function keys() {
    if (keySet) return keySet;
    keySet = {};
    for (var i = 0; i < blockedNicknames.length; i++) keySet[nickKey(blockedNicknames[i])] = true;
    return keySet;
  }

  /**
   * True when `nick` (any case / plurality) is a blocked nickname, contains a
   * blocked word, or forms a blocked city+nick pairing with `city`.
   * @param {string} nick
   * @param {string} [city]
   * @returns {boolean}
   */
  function isBlockedNick(nick, city) {
    var k = nickKey(nick);
    if (!k) return false;
    if (keys()[k]) return true;
    var low = String(nick).toLowerCase();
    for (var w = 0; w < blockedWords.length; w++) {
      if (low.indexOf(blockedWords[w].toLowerCase()) >= 0) return true;
    }
    if (city) {
      var c = nickKey(city);
      for (var p = 0; p < blockedCityNick.length; p++) {
        if (nickKey(blockedCityNick[p][0]) === c && nickKey(blockedCityNick[p][1]) === k) return true;
      }
    }
    return false;
  }

  RTG.Data.blockedNicknames = blockedNicknames;
  RTG.Data.blockedWords = blockedWords;
  RTG.Data.blockedCityNick = blockedCityNick;
  RTG.Data.nickKey = nickKey;
  RTG.Data.isBlockedNick = isBlockedNick;
})(typeof window !== 'undefined' ? window : globalThis);
