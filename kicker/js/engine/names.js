/**
 * Road to Glory: Kicker — RTG.Names (SPEC §3.5.5, §2.12.4).
 *
 * Deterministic name generation over RTG.Data.names. Every function takes the
 * rng first and draws a FIXED number of times (listed per function below) so
 * replays stay deterministic:
 *
 *   player(rng, {era})  3 draws (+1 when the 8 % suffix/hyphen branch fires)
 *   legend(rng)         = player(rng, {era:'classic'})
 *   coach(rng)          1 draw
 *   reporter(rng)       3 draws
 *   hometown(rng)       1 draw
 *   nickname(rng, city) 1 draw
 *   unique(rng, taken, gen)  gen's draws × attempts (≤ Tuning.names.uniqueRetries)
 *
 * Pure: no DOM, no clock, no unseeded randomness. Data and Tuning are resolved at call
 * time (load order is data → engine, but nothing is captured at load).
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};

  /** Fallbacks if Tuning.names is absent (Tuning is the source of truth). */
  var DEFAULTS = { suffixRate: 0.08, hyphenShare: 0.5, uniqueRetries: 10 };

  function tuning() {
    return (RTG.Tuning && RTG.Tuning.names) || DEFAULTS;
  }

  function data() {
    var d = RTG.Data && RTG.Data.names;
    if (!d) throw new Error('RTG.Names: RTG.Data.names is not loaded');
    return d;
  }

  /** Per-era filtered first-name lists, built once from the data. */
  var eraCache = null;

  /**
   * First names eligible for an era: 'any' → all; 'modern'/'classic' → that
   * era plus the 'any' names.
   * @param {string} era
   * @returns {{n:string, era:string, w:number}[]}
   */
  function firstList(era) {
    if (!eraCache) eraCache = {};
    var key = era === 'modern' || era === 'classic' ? era : 'any';
    if (eraCache[key]) return eraCache[key];
    var all = data().first;
    var out = [];
    for (var i = 0; i < all.length; i++) {
      if (key === 'any' || all[i].era === key || all[i].era === 'any') out.push(all[i]);
    }
    eraCache[key] = out;
    return out;
  }

  var Names = {};

  /**
   * Generate a player name.
   * Draws: 1 weighted first, 1 last, 1 suffix/hyphen roll; +1 pick when the
   * roll (< Tuning.names.suffixRate) fires — hyphen share of that band appends
   * a second surname, the rest append a suffix ('Jr.', 'III', 'II').
   * @param {object} rng RTG.RNG instance
   * @param {{era?: 'modern'|'classic'|'any'}} [opts]
   * @returns {{first: string, last: string, full: string}}
   */
  Names.player = function (rng, opts) {
    var era = (opts && opts.era) || 'any';
    var d = data();
    var T = tuning();
    var first = rng.weighted(firstList(era), 'w').n;      // draw 1
    var last = rng.pick(d.last);                            // draw 2
    var u = rng.next();                                     // draw 3
    var full;
    if (u < T.suffixRate) {
      if (u < T.suffixRate * T.hyphenShare) {
        var second = rng.pick(d.last);                      // draw 4 (hyphen)
        if (second === last) second = d.last[(d.last.indexOf(last) + 1) % d.last.length];
        last = last + '-' + second;
        full = first + ' ' + last;
      } else {
        var suf = rng.pick(d.suffix);                       // draw 4 (suffix)
        full = first + ' ' + last + ' ' + suf;
      }
    } else {
      full = first + ' ' + last;
    }
    return { first: first, last: last, full: full };
  };

  /**
   * A classic-era name for record holders and legends (Otis, Walter, Gus, Lou…).
   * Draws: same as player().
   * @param {object} rng
   * @returns {{first: string, last: string, full: string}}
   */
  Names.legend = function (rng) {
    return Names.player(rng, { era: 'classic' });
  };

  /**
   * Head-coach display name, e.g. "Coach Halloran". Draws: 1.
   * @param {object} rng
   * @returns {string}
   */
  Names.coach = function (rng) {
    return 'Coach ' + rng.pick(data().last);
  };

  /**
   * A reporter and their outlet. Draws: 1 weighted first (all eras), 1 last, 1 outlet.
   * @param {object} rng
   * @returns {{name: string, outlet: string}}
   */
  Names.reporter = function (rng) {
    var d = data();
    var first = rng.weighted(firstList('any'), 'w').n;    // draw 1
    var last = rng.pick(d.last);                            // draw 2
    var outlet = rng.pick(d.outlets);                       // draw 3
    return { name: first + ' ' + last, outlet: outlet };
  };

  /**
   * A hometown (fresh copy, safe to store in state). Draws: 1.
   * @param {object} rng
   * @returns {{city: string, state: string, region: string}}
   */
  Names.hometown = function (rng) {
    var h = rng.pick(data().hometowns);
    return { city: h.city, state: h.state, region: h.region };
  };

  /**
   * A fan/press nickname, with the {city} slot filled. Draws: 1.
   * @param {object} rng
   * @param {string} [city] city used for "{city}" templates
   * @returns {string}
   */
  Names.nickname = function (rng, city) {
    var n = rng.pick(data().nicknames);
    return n.replace(/\{city\}/g, city || 'the City');
  };

  /**
   * Generate with `gen(rng)` until the result is not in `taken` (a Set, an
   * array, or a plain object used as a set), retrying at most
   * Tuning.names.uniqueRetries times; the last attempt is returned regardless.
   * The chosen key (`full` for name objects, else the value itself) is added to
   * `taken` when it is a Set or object.
   * Draws: gen's draws per attempt.
   * @param {object} rng
   * @param {Set|Array|Object} taken
   * @param {function(object): *} gen e.g. Names.player
   * @returns {*}
   */
  Names.unique = function (rng, taken, gen) {
    var retries = tuning().uniqueRetries;
    var out, key;
    for (var i = 0; i <= retries; i++) {
      out = gen(rng);
      key = keyOf(out);
      if (!has(taken, key)) break;
    }
    add(taken, key);
    return out;
  };

  function keyOf(v) {
    return (v && typeof v === 'object' && v.full !== undefined) ? v.full : String(v);
  }

  function has(taken, key) {
    if (!taken) return false;
    if (typeof taken.has === 'function') return taken.has(key);
    if (Array.isArray(taken)) return taken.indexOf(key) >= 0;
    return Object.prototype.hasOwnProperty.call(taken, key);
  }

  function add(taken, key) {
    if (!taken) return;
    if (typeof taken.add === 'function') taken.add(key);
    else if (Array.isArray(taken)) taken.push(key);
    else taken[key] = true;
  }

  RTG.Names = Names;
})(typeof window !== 'undefined' ? window : globalThis);
