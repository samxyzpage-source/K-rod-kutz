/**
 * Road to Glory: Kicker — name lists (SPEC §2.12.4).
 *
 * RTG.Data.names = {
 *   first:       [{n, era:'modern'|'classic'|'any', w:1..3}]  (≥ 220)
 *   last:        [string]                                     (≥ 320, none blocked)
 *   suffix:      ['Jr.', 'III', 'II']
 *   nicknames:   [string] with optional {city} slot            (≥ 30)
 *   outlets:     [string]                                     (≥ 12)
 *   hometowns:   [{city, state, region}]                      (60)
 *   blockedLast: exact spec list of real-kicker surnames
 *   allowCommon: common surnames that some kickers share but are allowed
 *   regions:     ['NE','SE','MW','SW','W'], regionNames: {[id]: label}
 *   coachTitles: flavour prefixes for AI head coaches
 * }
 *
 * Compact source syntax for first names: 'Name' (w 1), 'Name+' (w 2),
 * 'Name*' (w 3), expanded at load time. Pure data.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.Data = RTG.Data || {};

  var MODERN = (
    'Tyler* Jaxon+ Mason+ Brayden Kaden Logan+ Hunter+ Colton+ Landon Cooper+ Carson+ Blake+ Chase+ ' +
    'Tanner+ Trevor Austin+ Dylan+ Cody Riley Parker+ Brody Jace Zane Kai Levi Micah Elijah+ Isaiah+ ' +
    'Jalen+ Jaylen Deshawn Darius Malik+ Marcus+ Jamal Andre+ Devin Tre Trey+ Cameron+ Kendall Ty+ ' +
    'Tyrese Xavier Jordan+ Jayden Aiden Ethan+ Noah+ Liam Owen+ Wyatt+ Grayson Hudson Easton Ryder ' +
    'Rylan Sawyer Weston Nolan Bryce+ Brock+ Braxton Kellen Kyler Dax Cade+ Cash Colt Jett Kolby Dawson ' +
    'Beau Brooks Griffin Hayden Holden Kane Knox Lincoln Maddox Nash Paxton Reid Rhett Rocco Tate Walker ' +
    'Zeke Santiago Mateo+ Diego+ Alejandro Luis+ Carlos+ Javier Emilio Cruz Rafael Tomas Nico Matteo ' +
    'Dominic Anthony+ Vincent Kwame Kofi Seun Tobi Ade Chidi Emeka Rashad Kamari Amari Zion Jabari ' +
    'Tariq Omar Yusuf Ibrahim Ahmed Hassan Ravi Arjun Dev Kiran Minh Kenji Hiro Jin Sung Andrei Luka ' +
    'Nikola Stefan Marko Dante Enzo Gianni Rocky Tobias Kaleb Jamari Tremaine Donovan Quincy Terrell ' +
    'DeAndre Keon Shane Corbin Boone Dallas Kingston'
  ).split(' ');

  var CLASSIC = (
    'Otis* Walter* Gus* Lou* Earl+ Vernon+ Clyde+ Floyd Horace Ambrose Elmer Wendell Merle Virgil Homer ' +
    'Chester Percy Rudy+ Bud+ Buck+ Red+ Slim Dutch Whitey Butch Sonny Skip Chip Buddy Lefty Dub Boomer ' +
    'Harold Herbert Leonard Lester Milton Norman Orville Roscoe Sherman Sylvester Theodore Ulysses Wilbur ' +
    'Wilfred Woodrow Alvin Bernard Clarence Cletus Delbert Elwood Ernest Eugene Gilbert Grover Hubert Ira ' +
    'Jasper Lyle Marvin Maurice Morris Reuben Rufus Stanley Vance Barney Dewey Arch Ace Duke Hank+ Mack ' +
    'Moe Ned Cornelius Augustus Ezra Silas Thaddeus Lionel Fletcher Emmett Wallace Gerald Dale Lloyd'
  ).split(' ');

  var ANY = (
    'James+ John+ Michael+ David+ Robert+ William Joseph Thomas Charles Daniel+ Matthew+ Andrew+ ' +
    'Christopher Ryan+ Nathan+ Samuel Benjamin Adam+ Aaron Patrick Sean Kevin+ Brian Eric+ Mark Paul ' +
    'Peter Simon Stephen Scott Greg Jeff+ Tim Tom+ Joe+ Nick+ Alex+ Ben Sam Max+ Leo Miles Grant Wade ' +
    'Reed Dean Luke+ Jake+ Cole+ Drew Evan Ian Jon Kyle+ Neil Ross Roy Ray Ken Wes Vic Angelo Felix ' +
    'Oscar Hugo Ivan Marco Rene Raul Jorge Pedro Sergio Zach Zeb Frank+ Jack+ Danny Jimmy Bobby Tommy ' +
    'Sammy Eddie Freddie Ricky Mickey Nate Will Matt Jay Pat Terry Randy Curtis Warren Wesley'
  ).split(' ');

  /**
   * Expand 'Name', 'Name+', 'Name*' into {n, era, w}.
   * @param {string[]} list
   * @param {string} era
   * @returns {{n:string, era:string, w:number}[]}
   */
  function expandFirst(list, era) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (!s) continue;
      var w = 1;
      if (s.charAt(s.length - 1) === '*') { w = 3; s = s.slice(0, -1); }
      else if (s.charAt(s.length - 1) === '+') { w = 2; s = s.slice(0, -1); }
      out.push({ n: s, era: era, w: w });
    }
    return out;
  }

  var first = expandFirst(MODERN, 'modern').concat(expandFirst(CLASSIC, 'classic'), expandFirst(ANY, 'any'));

  var last = (
    'Abernathy Acosta Adeyemi Aguilar Albright Alcott Aldridge Alvarado Amato Ames Appleby Archer Ashby ' +
    'Atwood Babcock Baird Banner Barlow Barnaby Barrera Bassett Baxter Beckett Bellamy Benedetto Bennett ' +
    'Berger Bianchi Birch Bishop Blackwood Blanco Bledsoe Boone Booker Bowers Boyd Bradshaw Brannigan ' +
    'Brewster Bridges Briggs Broussard Bryant Buchanan Burnside Byrne Cabrera Calloway Camacho Cardenas ' +
    'Carrington Carver Castellano Chambers Chandler Chapman Chen Choi Cisneros Clemons Cloud Cobb Coffey ' +
    'Colby Coleman Conway Cordova Corrigan Cortez Crane Crawford Crenshaw Cullen Dalton Dancy Danforth ' +
    'Darby DeLuca Delgado Dempsey Dixon Dobbs Donnelly Dorsey Doyle Drummond Duarte Duffy Dunbar Dunlap ' +
    'Easley Eckhart Edmonds Ellery Ellison Emerson Escobar Espinoza Everett Fairchild Farrow Faulkner ' +
    'Fenwick Ferraro Fielder Finch Fitzgerald Flanagan Fleming Flores Fontaine Forsythe Foster Fuentes ' +
    'Gallagher Galloway Garza Gentry Giordano Goodwin Granger Graves Greer Griffith Guerrero Gutierrez ' +
    'Hale Halloran Hammond Harlow Harrington Hartley Hawkins Hayes Hendricks Henley Hicks Hobbs Holloway ' +
    'Holt Hooper Horne Huang Hubbard Huxley Ibarra Ingram Irving Jacobs Jennings Jimenez Kaplan Keller ' +
    'Kendrick Kessler Kimura Kirby Knox Kowalski Kramer Lacey Landry Lane Langford Larkin Lawson LeBlanc ' +
    'Ledger Lennox Lindqvist Lockhart Lowry Lucero Lyle Mackey Maddox Maldonado Malone Marsh Mathis ' +
    'Maxwell McAllister McBride McCoy McGrath McKenna Medina Mendoza Mercer Merritt Middleton Molina ' +
    'Monroe Montgomery Morales Moreau Mosley Nakamura Navarro Nguyen Nichols Nolan Norwood Nunez Oakes ' +
    "O'Brien Ochoa Okafor Okoro Olsen Ortega Osborne Ostrowski Pacheco Palmer Parrish Patel Paxton " +
    'Pearson Pennington Perkins Petrov Pham Pierce Pittman Porter Prescott Pruitt Quigley Quinn Ramsey ' +
    'Randall Rasmussen Redmond Reyes Reynolds Rhodes Riggs Rivera Robles Rojas Romero Rooney Rosales ' +
    'Rowe Ruiz Rutledge Salazar Salinas Sandoval Sato Schaefer Schroeder Sexton Shepherd Sheridan ' +
    'Shields Silva Simmons Slater Sloan Snyder Solano Sorensen Sparks Spencer Stafford Stanton Stark ' +
    'Steele Stokes Strickland Sullivan Sutton Sweeney Talbot Tanaka Thornton Tillman Torres Townsend ' +
    'Tran Trask Truitt Underwood Valdez Vance Vargas Vasquez Vaughn Velasquez Vega Villanueva Vogel ' +
    'Wade Waller Walsh Ward Warner Watkins Weaver Webb Weiss Wheeler Whitaker Whitfield Wilcox Wilder ' +
    'Winslow Winters Wolfe Woodard Worthington Wyatt Yamamoto Yates Yoon Zamora Zimmerman ' +
    'Pettibone Featherstone Applewhite Goldsmith Ironside Tallchief Whitehorse Sixkiller Blackfeather ' +
    'Achterberg Oyelaran Adebayo Mbeki Diallo Toure Kimani Mwangi Haddad Nasser Farouk Rahimi Sharma ' +
    'Singh Kapoor Mehta Reddy Kim Park Lee Wong Lam Liu Zhang Fernandes Oliveira Souza Pereira Carvalho ' +
    'Kowalczyk Novak Horvath Petrakis Papadopoulos Ivanov Volkov Stoyanov Bergstrom Lindgren Halvorsen ' +
    'Jensen Aaltonen Koskinen Schmidt Bauer Vogt Dietrich DeJong Dubois Lefebvre Rossi Russo Esposito ' +
    'Marchetti Costa Bumgarner Hollingsworth Pinkerton Ravenscroft Stubblefield Threadgill Vandermeer ' +
    'Bailey Jones Myers Little Elliott Joseph Santos York Bass'
  ).split(' ');

  var suffix = ['Jr.', 'III', 'II'];

  var nicknames = [
    'The Leg of {city}', 'Iceman', 'The Mailman', 'Doink King', 'Automatic', 'Mr. Reliable',
    'The Hammer', 'Big Toe', 'Money', 'The Surgeon', 'Sniper', 'Golden Boot', 'Cannon',
    'Thunderfoot', 'The Metronome', 'Clutch', 'Cool Hand', 'Old Faithful', 'The Wind Whisperer',
    'Snowman', 'The Closer', 'Ice Water', 'The Pendulum', 'Longshot', 'Bootsy', 'The Cyborg',
    'Uprights', 'Crossbar', 'Wide Right', 'Bullseye', 'Deadeye', 'The Answer', 'Silk', 'Butter',
    'Stormproof', 'The {city} Kid', 'Captain Hook', 'Dr. Doink', 'The Toe of {city}', 'Splits',
    'The Lighthouse', 'Moonshot', 'Hang Time', 'The Pocket Rocket'
  ];

  var outlets = [
    'Gridiron Daily', 'The Snap Count', 'KickCast', 'Special Teams Weekly', 'The Uprights Report',
    'Fourth & Long', 'Pigskin Ledger', 'The Long Snap', 'Hashmark Herald', 'Sideline Signal',
    'The Coffin Corner', 'Boot & Ball', 'Red Zone Radio', 'The Morning Whistle', 'Tailgate Tribune',
    'Prime Time Gridiron', 'The Doink Dispatch', 'Leg Day Podcast'
  ];

  var regions = ['NE', 'SE', 'MW', 'SW', 'W'];
  var regionNames = { NE: 'Northeast', SE: 'Southeast', MW: 'Midwest', SW: 'Southwest', W: 'West' };

  /** 60 hometowns: [city, state, region]. */
  var HOMETOWNS = [
    // NE (12)
    ['Scranton', 'PA', 'NE'], ['Bangor', 'ME', 'NE'], ['Worcester', 'MA', 'NE'], ['Burlington', 'VT', 'NE'],
    ['Nashua', 'NH', 'NE'], ['Utica', 'NY', 'NE'], ['Hoboken', 'NJ', 'NE'], ['Allentown', 'PA', 'NE'],
    ['Waterbury', 'CT', 'NE'], ['Hagerstown', 'MD', 'NE'], ['Binghamton', 'NY', 'NE'], ['Dover', 'DE', 'NE'],
    // SE (14)
    ['Valdosta', 'GA', 'SE'], ['Tupelo', 'MS', 'SE'], ['Dothan', 'AL', 'SE'], ['Ocala', 'FL', 'SE'],
    ['Lynchburg', 'VA', 'SE'], ['Greenville', 'SC', 'SE'], ['Chattanooga', 'TN', 'SE'], ['Paducah', 'KY', 'SE'],
    ['Wilmington', 'NC', 'SE'], ['Lake Charles', 'LA', 'SE'], ['Pensacola', 'FL', 'SE'], ['Huntsville', 'AL', 'SE'],
    ['Jonesboro', 'AR', 'SE'], ['Beckley', 'WV', 'SE'],
    // MW (13)
    ['Peoria', 'IL', 'MW'], ['Dubuque', 'IA', 'MW'], ['Kalamazoo', 'MI', 'MW'], ['Sheboygan', 'WI', 'MW'],
    ['Rochester', 'MN', 'MW'], ['Sioux Falls', 'SD', 'MW'], ['Bismarck', 'ND', 'MW'], ['Kearney', 'NE', 'MW'],
    ['Salina', 'KS', 'MW'], ['Joplin', 'MO', 'MW'], ['Fort Wayne', 'IN', 'MW'], ['Toledo', 'OH', 'MW'],
    ['Youngstown', 'OH', 'MW'],
    // SW (10)
    ['Odessa', 'TX', 'SW'], ['Waco', 'TX', 'SW'], ['Beaumont', 'TX', 'SW'], ['McAllen', 'TX', 'SW'],
    ['Lawton', 'OK', 'SW'], ['Yuma', 'AZ', 'SW'], ['Flagstaff', 'AZ', 'SW'], ['Las Cruces', 'NM', 'SW'],
    ['Santa Fe', 'NM', 'SW'], ['Tyler', 'TX', 'SW'],
    // W (11)
    ['Bakersfield', 'CA', 'W'], ['Modesto', 'CA', 'W'], ['Eugene', 'OR', 'W'], ['Spokane', 'WA', 'W'],
    ['Missoula', 'MT', 'W'], ['Pocatello', 'ID', 'W'], ['Ogden', 'UT', 'W'], ['Grand Junction', 'CO', 'W'],
    ['Elko', 'NV', 'W'], ['Anchorage', 'AK', 'W'], ['Hilo', 'HI', 'W']
  ];
  var hometowns = [];
  for (var h = 0; h < HOMETOWNS.length; h++) {
    hometowns.push({ city: HOMETOWNS[h][0], state: HOMETOWNS[h][1], region: HOMETOWNS[h][2] });
  }

  /** Real well-known kicker surnames that may NOT appear in `last` (§2.12.4). */
  var blockedLast = [
    'Tucker', 'Butker', 'Vinatieri', 'Janikowski', 'Aubrey', 'Gostkowski', 'Prater', 'Zuerlein',
    'Lutz', 'McManus', 'Boswell', 'Koo', 'Carlson', 'Gould', 'Crosby', 'Dicker', 'Fairbairn', 'Slye',
    'Folk', 'Andersen', 'Stenerud', 'Akers', 'Kaeding', 'Hauschka', 'Gano', 'Succop', 'Badgley',
    'Maher', 'Blankenship', 'Ficken', 'Moody', 'Pineiro', 'Reichard', 'Karty'
  ];

  /** Common surnames some kickers share; allowed and exempt from the lint. */
  var allowCommon = ['Bailey', 'Jones', 'Myers', 'Little', 'Elliott', 'Joseph', 'Santos', 'York', 'Bass'];

  var coachTitles = ['Coach', 'Coach', 'Coach', 'Head Coach'];

  RTG.Data.names = {
    first: first,
    last: last,
    suffix: suffix,
    nicknames: nicknames,
    outlets: outlets,
    hometowns: hometowns,
    blockedLast: blockedLast,
    allowCommon: allowCommon,
    regions: regions,
    regionNames: regionNames,
    coachTitles: coachTitles,
    eras: ['modern', 'classic', 'any']
  };
})(typeof window !== 'undefined' ? window : globalThis);
