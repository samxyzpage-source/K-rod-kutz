/**
 * Road to Glory: Kicker — RTG.Weather (SPEC §2.5.5, §3.5.6)
 *
 * Game-day weather for a venue and the per-kick wind jitter. Pure over plain
 * objects; every random number comes from the rng passed in.
 *
 * RNG draw accounting (binding for replay determinism):
 *   forGame  : dome venue → 0 draws (controlled environment: 70 °F, wind 0, weather 'dome').
 *              outdoors  → temp gauss 2 · wind Rayleigh 1 · dir 1
 *                          · snow roll 1 (only when tempF < snowTempBelow)
 *                          · rain roll 1 (always drawn; ignored when it snows)
 *                          · fog roll 1 (always drawn; only used when there is no
 *                            precipitation and the temperature is neither cold nor heat)
 *              i.e. 6 draws, 7 below the snow line, in that order.
 *   perKick  : exactly 2 draws (one gauss), even for domes.
 *
 * Dependencies (load order): Util, Tuning.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  var Util = RTG.Util, Tuning = RTG.Tuning;
  var Weather = {};

  var HALF_TURN = 180, FULL_TURN = 360;   // degrees (unit constants)

  /** Tuning.weather (read at call time so debug.tune edits apply). */
  function W() { return Tuning.weather; }

  /**
   * Month index for a week: 0 Sep · 1 Oct · 2 Nov · 3 Dec · 4 Jan.
   * College: weeks 1–4 Sep, 5–8 Oct, 9–12 Nov, 13+ Dec. NFL: 1–4, 5–8, 9–13, 14–18, playoffs (19+) Jan.
   * Week 0 (preseason) counts as September.
   * @param {number} week 0 preseason, 1-based otherwise
   * @param {'COLLEGE'|'NFL'} league
   * @returns {number} 0..4
   */
  Weather.monthIndex = function (week, league) {
    var T = W();
    var table = T.monthByWeek[league === 'NFL' ? 'NFL' : 'COLLEGE'];
    var w = typeof week === 'number' && week > 0 ? week : 1;
    for (var i = 0; i < table.length; i++) if (w <= table[i]) return i;
    return Math.min(table.length, T.months.length - 1);   // beyond the last entry → the following month
  };

  /**
   * Month name ('Sep' | 'Oct' | 'Nov' | 'Dec' | 'Jan') for a week (§2.5.5).
   * @param {number} week @param {'COLLEGE'|'NFL'} league @returns {string}
   */
  Weather.monthFor = function (week, league) {
    return W().months[Weather.monthIndex(week, league)];
  };

  /**
   * Climate row for a venue (dome venues → dome; unknown climates → temperate).
   * @param {{climate?:string, dome?:boolean}} venue @returns {{key:string, row:{temp:number[], rain:number, snow:number}}}
   */
  Weather.climateFor = function (venue) {
    var c = W().climates;
    var key = venue && venue.climate;
    if (venue && venue.dome) key = 'dome';
    if (!key || !c[key]) key = 'temperate';
    return { key: key, row: c[key] };
  };

  /**
   * Rayleigh(σ) sample from one uniform draw: σ·sqrt(−2·ln(1 − u)). Mean = σ·sqrt(π/2) (σ 5 → 6.27 mph).
   * @param {RNG} rng @param {number} sigma @returns {number}
   */
  Weather.rayleigh = function (rng, sigma) {
    var u = rng.next();
    return sigma * Math.sqrt(-2 * Math.log(1 - u));
  };

  /**
   * Game-day weather (§2.5.5). `homeTeam` may be a Team or any venue-like object
   * `{climate, dome, altitude, windy, surface}` (bowls / neutral sites).
   * Wind direction is uniform 0–359°, relative to the home team's kicking direction in the
   * first half (0 = tailwind, 90 = pushes the ball right); Kick.buildContext flips it per side/half.
   * @param {RNG} rng
   * @param {object} homeTeam venue
   * @param {number} week
   * @param {'COLLEGE'|'NFL'} league
   * @param {number} [cap] wind cap in mph (Tuning.difficulty[d].windCap; default the Pro cap)
   * @returns {{weather:string, tempF:number, wind:{speed:number, dir:number}, surface:string, altitude:boolean, dome:boolean, climate:string, month:string}}
   */
  Weather.forGame = function (rng, homeTeam, week, league, cap) {
    var T = W();
    var venue = homeTeam || {};
    var cl = Weather.climateFor(venue);
    var month = Weather.monthIndex(week, league);
    var meanTemp = cl.row.temp[Math.min(month, cl.row.temp.length - 1)];
    var out = {
      weather: 'clear', tempF: meanTemp,
      wind: { speed: 0, dir: 0 },
      surface: venue.surface || (cl.key === 'dome' ? 'turf' : 'grass'),
      altitude: !!venue.altitude, dome: cl.key === 'dome',
      climate: cl.key, month: T.months[month]
    };
    if (out.dome) {                                   // 0 draws
      out.weather = 'dome';
      return out;
    }
    var windCap = typeof cap === 'number' ? cap : Tuning.difficulty.pro.windCap;
    // 1. temperature (2 draws)
    out.tempF = Math.round(rng.gauss(meanTemp, T.tempSd));
    // 2. wind speed (1 draw) and direction (1 draw)
    var speed = Weather.rayleigh(rng, T.wind.rayleighSigma);
    if (venue.windy) speed *= T.wind.windyMult;
    out.wind.speed = Util.round1(Math.min(windCap, speed));
    out.wind.dir = rng.int(0, T.wind.dirMax);
    // 3. precipitation: snow roll only below the snow line (1 draw), then the rain roll (always 1 draw)
    var snow = false;
    if (out.tempF < T.snowTempBelow) snow = rng.chance(cl.row.snow);
    var rain = rng.chance(cl.row.rain) && !snow;
    // 4. fog roll (always 1 draw so the count only depends on the snow line; only temperate/cold can fog)
    var fog = rng.chance(T.fogClimates.indexOf(cl.key) >= 0 ? T.fogProb : 0);
    if (snow) out.weather = 'snow';
    else if (rain) out.weather = 'rain';
    else if (out.tempF < T.coldBelow) out.weather = 'cold';
    else if (out.tempF > T.heatAbove) out.weather = 'heat';
    else out.weather = fog ? 'fog' : 'clear';
    return out;
  };

  /**
   * Per-kick wind: the game wind jittered by N(0, perKickSd) mph, floored at 0 (exactly 2 draws,
   * also for domes, where the result is always speed 0). Direction is carried over unchanged.
   * @param {RNG} rng
   * @param {{wind?:{speed:number, dir:number}, dome?:boolean, weather?:string}} gameWeather
   * @returns {{speed:number, dir:number}}
   */
  Weather.perKick = function (rng, gameWeather) {
    var T = W();
    var base = (gameWeather && gameWeather.wind) || { speed: 0, dir: 0 };
    var jitter = rng.gauss(0, T.wind.perKickSd);                                   // draws 1, 2
    if (gameWeather && (gameWeather.dome || gameWeather.weather === 'dome')) return { speed: 0, dir: base.dir || 0 };
    return { speed: Util.round1(Math.max(0, (base.speed || 0) + jitter)), dir: base.dir || 0 };
  };

  /**
   * Wind components for a kicker facing the goal: along (+ = tailwind) and cross (+ = pushes right).
   * @param {{speed:number, dir:number}} wind dir in degrees, 0 = tailwind, 90 = left-to-right
   * @returns {{along:number, cross:number}}
   */
  Weather.components = function (wind) {
    if (!wind || !wind.speed) return { along: 0, cross: 0 };
    var rad = Util.degToRad(wind.dir || 0);
    return { along: wind.speed * Math.cos(rad), cross: wind.speed * Math.sin(rad) };
  };

  /**
   * Flip a wind direction by 180° (the other team kicks the other way / second half).
   * @param {number} dir @returns {number} 0..359
   */
  Weather.flipDir = function (dir) {
    return ((dir || 0) + HALF_TURN) % FULL_TURN;
  };

  /**
   * Short HUD label, e.g. "WIND → 12" / "CALM" / "DOME".
   * @param {{weather:string, wind:{speed:number, dir:number}}} w @returns {string}
   */
  Weather.label = function (w) {
    if (!w) return '';
    if (w.weather === 'dome' || w.dome) return 'DOME';
    var s = Math.round((w.wind && w.wind.speed) || 0);
    if (s < 1) return 'CALM';
    var c = Weather.components(w.wind);
    var arrow = Math.abs(c.cross) >= Math.abs(c.along) ? (c.cross > 0 ? '→' : '←') : (c.along > 0 ? '↑' : '↓');
    return 'WIND ' + arrow + ' ' + s;
  };

  RTG.Weather = Weather;
})(typeof window !== 'undefined' ? window : globalThis);
