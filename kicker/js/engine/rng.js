/**
 * Road to Glory: Kicker — RTG.RNG (SPEC §3.5.2)
 *
 * Seeded mulberry32. The engine's ONLY source of randomness. The integer
 * state is persisted in `state.rngState` and restored with `setState`.
 *
 * Draw accounting (binding for replay determinism):
 *   next 1 · int 1 · float 1 · chance 1 · pick 1 · weighted 1 · gauss 2 (always)
 *   shuffle n−1 · fork 1 (on the parent)
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  var Util = RTG.Util;

  var TWO_PI = 2 * Math.PI;

  /**
   * @constructor
   * @param {number} seed uint32 (anything is coerced with >>> 0)
   */
  function RNG(seed) {
    this._s = toSeed(seed);
  }

  /** Coerce a seed: numbers → uint32; strings → fnv1a32 of the string. */
  function toSeed(seed) {
    if (typeof seed === 'string') return Util.fnv1a32(seed);
    if (typeof seed !== 'number' || seed !== seed) return 0;
    return seed >>> 0;
  }

  /**
   * One mulberry32 step → float in [0, 1). 1 draw.
   * @returns {number}
   */
  RNG.prototype.next = function () {
    this._s = (this._s + 0x6D2B79F5) >>> 0;
    var t = this._s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /**
   * Integer in [lo, hi] inclusive. 1 draw.
   * @param {number} lo @param {number} hi @returns {number}
   */
  RNG.prototype.int = function (lo, hi) {
    lo = Math.ceil(lo); hi = Math.floor(hi);
    if (hi < lo) { var t = lo; lo = hi; hi = t; }
    return lo + Math.floor(this.next() * (hi - lo + 1));
  };

  /**
   * Float in [lo, hi). 1 draw.
   * @param {number} lo @param {number} hi @returns {number}
   */
  RNG.prototype.float = function (lo, hi) {
    return lo + this.next() * (hi - lo);
  };

  /**
   * Bernoulli(p). Always consumes exactly 1 draw (even for p ≤ 0 or ≥ 1).
   * @param {number} p @returns {boolean}
   */
  RNG.prototype.chance = function (p) {
    return this.next() < p;
  };

  /**
   * Gaussian N(mu, sd) via Box–Muller. Exactly 2 draws every call; no caching.
   * @param {number} [mu=0] @param {number} [sd=1] @returns {number}
   */
  RNG.prototype.gauss = function (mu, sd) {
    var u1 = this.next();      // draw 1
    var u2 = this.next();      // draw 2
    var r = Math.sqrt(-2 * Math.log(1 - u1));   // 1 − u1 ∈ (0, 1] avoids log(0)
    var z = r * Math.cos(TWO_PI * u2);
    return (mu === undefined ? 0 : mu) + (sd === undefined ? 1 : sd) * z;
  };

  /**
   * Uniform pick from an array (undefined for empty). 1 draw.
   * @template T @param {T[]} arr @returns {T}
   */
  RNG.prototype.pick = function (arr) {
    var u = this.next();
    if (!arr || !arr.length) return undefined;
    return arr[Math.floor(u * arr.length)];
  };

  /**
   * Weighted pick. weightFnOrKey is a function(item) → weight, or a property
   * name holding the weight. Non-positive/NaN weights count as 0; if every
   * weight is 0 the pick is uniform. 1 draw.
   * @template T @param {T[]} items @param {function(T): number|string} weightFnOrKey @returns {T}
   */
  RNG.prototype.weighted = function (items, weightFnOrKey) {
    var u = this.next();
    if (!items || !items.length) return undefined;
    var wf = typeof weightFnOrKey === 'function'
      ? weightFnOrKey
      : function (it) { return it[weightFnOrKey]; };
    var total = 0, i, w;
    var ws = new Array(items.length);
    for (i = 0; i < items.length; i++) {
      w = Number(wf(items[i]));
      if (!(w > 0)) w = 0;
      ws[i] = w;
      total += w;
    }
    if (total <= 0) return items[Math.floor(u * items.length)];
    var r = u * total;
    for (i = 0; i < items.length; i++) {
      r -= ws[i];
      if (r < 0) return items[i];
    }
    return items[items.length - 1];
  };

  /**
   * Fisher–Yates shuffle in place; returns the same array. n−1 draws.
   * @template T @param {T[]} arr @returns {T[]}
   */
  RNG.prototype.shuffle = function (arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(this.next() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };

  /** @returns {number} current uint32 state */
  RNG.prototype.state = function () {
    return this._s >>> 0;
  };

  /**
   * Restore a state previously returned by state().
   * @param {number} s uint32
   */
  RNG.prototype.setState = function (s) {
    this._s = (typeof s === 'number' && s === s) ? (s >>> 0) : 0;
  };

  /**
   * Child RNG for an isolated sub-simulation. The child seed is
   * fnv1a32(String(parentState) + label); the parent then advances by exactly 1 draw.
   * @param {string} label @returns {RNG}
   */
  RNG.prototype.fork = function (label) {
    var seed = Util.fnv1a32(String(this.state()) + String(label === undefined ? '' : label));
    this.next();   // advance the parent by exactly one draw
    return new RNG(seed);
  };

  /**
   * Convenience: N(mu, sd) rounded and clamped. 2 draws.
   * @param {number} mu @param {number} sd @param {number} lo @param {number} hi @returns {number}
   */
  RNG.prototype.gaussInt = function (mu, sd, lo, hi) {
    return Util.clamp(Math.round(this.gauss(mu, sd)), lo, hi);
  };

  var API = {
    /**
     * Create a seeded RNG.
     * @param {number} seed uint32 @returns {RNG}
     */
    create: function (seed) { return new RNG(seed); },
    RNG: RNG,
    /** Coerce a seed value to uint32 (strings hash via fnv1a32). */
    toSeed: toSeed
  };

  RTG.RNG = API;
})(typeof window !== 'undefined' ? window : globalThis);
