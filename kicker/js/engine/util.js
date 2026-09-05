/**
 * Road to Glory: Kicker — RTG.Util (SPEC §3.5.1)
 *
 * Small pure helpers shared by every module. No DOM, no rng, no state.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  var Util = {};

  var SQRT2 = Math.sqrt(2);
  var SQRT_PI = Math.sqrt(Math.PI);

  /**
   * Clamp x into [lo, hi].
   * @param {number} x @param {number} lo @param {number} hi @returns {number}
   */
  Util.clamp = function (x, lo, hi) {
    return x < lo ? lo : (x > hi ? hi : x);
  };

  /**
   * Linear interpolation a→b at t (not clamped).
   * @param {number} a @param {number} b @param {number} t @returns {number}
   */
  Util.lerp = function (a, b, t) {
    return a + (b - a) * t;
  };

  /**
   * Round to 1 decimal (half away from zero for positive numbers).
   * @param {number} x @returns {number}
   */
  Util.round1 = function (x) {
    return Math.round(x * 10) / 10;
  };

  /**
   * Round to n decimals.
   * @param {number} x @param {number} n @returns {number}
   */
  Util.roundN = function (x, n) {
    var m = Math.pow(10, n);
    return Math.round(x * m) / m;
  };

  /**
   * Sum of an array of numbers (empty → 0).
   * @param {number[]} arr @returns {number}
   */
  Util.sum = function (arr) {
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s;
  };

  /**
   * Arithmetic mean (empty → 0).
   * @param {number[]} arr @returns {number}
   */
  Util.mean = function (arr) {
    return arr.length ? Util.sum(arr) / arr.length : 0;
  };

  /**
   * Index an array of objects by a key (string) or key function.
   * Later items overwrite earlier ones with the same key.
   * @param {object[]} arr @param {string|function(object):string} key
   * @returns {Object<string, object>}
   */
  Util.indexBy = function (arr, key) {
    var out = {};
    var fn = typeof key === 'function' ? key : function (o) { return o[key]; };
    for (var i = 0; i < arr.length; i++) out[fn(arr[i])] = arr[i];
    return out;
  };

  /**
   * Deep clone via JSON (drops functions/undefined; state must be JSON-safe anyway).
   * @template T @param {T} obj @returns {T}
   */
  Util.deepClone = function (obj) {
    return obj === undefined ? undefined : JSON.parse(JSON.stringify(obj));
  };

  /**
   * 32-bit FNV-1a hash of the UTF-8 encoding of a string.
   * @param {string} str @returns {number} uint32
   */
  Util.fnv1a32 = function (str) {
    str = String(str);
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      // inline UTF-8 encoding so the vectors match byte-oriented references
      if (c < 0x80) {
        h = Math.imul(h ^ c, 0x01000193);
      } else if (c < 0x800) {
        h = Math.imul(h ^ (0xc0 | (c >> 6)), 0x01000193);
        h = Math.imul(h ^ (0x80 | (c & 0x3f)), 0x01000193);
      } else if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) {
        var lo = str.charCodeAt(i + 1);
        var cp = 0x10000 + ((c - 0xd800) << 10) + (lo - 0xdc00);
        i++;
        h = Math.imul(h ^ (0xf0 | (cp >> 18)), 0x01000193);
        h = Math.imul(h ^ (0x80 | ((cp >> 12) & 0x3f)), 0x01000193);
        h = Math.imul(h ^ (0x80 | ((cp >> 6) & 0x3f)), 0x01000193);
        h = Math.imul(h ^ (0x80 | (cp & 0x3f)), 0x01000193);
      } else {
        h = Math.imul(h ^ (0xe0 | (c >> 12)), 0x01000193);
        h = Math.imul(h ^ (0x80 | ((c >> 6) & 0x3f)), 0x01000193);
        h = Math.imul(h ^ (0x80 | (c & 0x3f)), 0x01000193);
      }
    }
    return h >>> 0;
  };

  /**
   * FNV-1a as an 8-char lowercase hex string (the form used by Save checksums and rng.fork).
   * @param {string} str @returns {string}
   */
  Util.fnv1a = function (str) {
    var h = Util.fnv1a32(str).toString(16);
    while (h.length < 8) h = '0' + h;
    return h;
  };

  /**
   * Error function, |err| < 1e-9 over the real line.
   * |x| < 3: the all-positive series erf(x) = 2/√π · e^{−x²} · Σ 2^n x^{2n+1} / (1·3·…·(2n+1));
   * |x| ≥ 3: continued fraction for erfc evaluated backwards (60 terms).
   * @param {number} x @returns {number}
   */
  Util.erf = function (x) {
    if (x !== x) return NaN;
    if (x === Infinity) return 1;
    if (x === -Infinity) return -1;
    var ax = Math.abs(x);
    var r;
    if (ax < 3) {
      var x2 = ax * ax;
      var term = ax;   // n = 0 term: x
      var sum = ax;
      for (var n = 1; n < 200; n++) {
        term *= 2 * x2 / (2 * n + 1);
        sum += term;
        if (term < sum * 1e-17) break;
      }
      r = 2 / SQRT_PI * Math.exp(-x2) * sum;
    } else {
      // erfc(x) = e^{−x²}/√π · 1/(x + (1/2)/(x + 1/(x + (3/2)/(x + …))))
      var t = ax;
      for (var k = 60; k >= 1; k--) t = ax + (k / 2) / t;
      r = 1 - Math.exp(-ax * ax) / SQRT_PI / t;
    }
    return x < 0 ? -r : r;
  };

  /**
   * Standard normal CDF Φ(z).
   * @param {number} z @returns {number}
   */
  Util.phi = function (z) {
    return 0.5 * (1 + Util.erf(z / SQRT2));
  };

  /**
   * P(lo < N(mu, sd) < hi).
   * @param {number} lo @param {number} hi @param {number} mu @param {number} sd @returns {number}
   */
  Util.gaussCdfBetween = function (lo, hi, mu, sd) {
    if (!(sd > 0)) return (mu > lo && mu < hi) ? 1 : 0;
    return Util.phi((hi - mu) / sd) - Util.phi((lo - mu) / sd);
  };

  /** @param {number} deg @returns {number} radians */
  Util.degToRad = function (deg) { return deg * Math.PI / 180; };

  /** @param {number} rad @returns {number} degrees */
  Util.radToDeg = function (rad) { return rad * 180 / Math.PI; };

  /**
   * Money in $M → "$3.2M"; below 1 → "$850k"; negatives keep the sign.
   * @param {number} m millions @returns {string}
   */
  Util.fmtMoney = function (m) {
    if (m === null || m === undefined || m !== m) return '$0';
    var sign = m < 0 ? '-' : '';
    var a = Math.abs(m);
    if (a === 0) return '$0';
    if (a < 1) return sign + '$' + Math.round(a * 1000) + 'k';
    return sign + '$' + Util.round1(a).toFixed(1) + 'M';
  };

  /**
   * Fraction 0..1 → "87.5%" (1 decimal). Accepts NaN → "—".
   * @param {number} x @param {number} [decimals=1] @returns {string}
   */
  Util.fmtPct = function (x, decimals) {
    if (x === null || x === undefined || x !== x) return '—';
    var d = decimals === undefined ? 1 : decimals;
    return (x * 100).toFixed(d) + '%';
  };

  /**
   * Seconds → "m:ss" (e.g. 754 → "12:34"; 65 → "1:05").
   * @param {number} sec @returns {string}
   */
  Util.fmtClock = function (sec) {
    sec = Math.max(0, Math.round(sec || 0));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  };

  /**
   * 1 → "1st", 2 → "2nd", 11 → "11th", 23 → "23rd".
   * @param {number} n @returns {string}
   */
  Util.ordinal = function (n) {
    n = Math.round(n);
    var a = Math.abs(n) % 100, b = Math.abs(n) % 10;
    var suf = 'th';
    if (a < 11 || a > 13) {
      if (b === 1) suf = 'st'; else if (b === 2) suf = 'nd'; else if (b === 3) suf = 'rd';
    }
    return n + suf;
  };

  /**
   * Replace `{slot}` tokens with vars[slot]; unknown slots are left intact.
   * @param {string} str @param {Object<string, *>} vars @returns {string}
   */
  Util.template = function (str, vars) {
    vars = vars || {};
    return String(str).replace(/\{([A-Za-z0-9_]+)\}/g, function (m, k) {
      return Object.prototype.hasOwnProperty.call(vars, k) && vars[k] !== undefined && vars[k] !== null
        ? String(vars[k]) : m;
    });
  };

  /**
   * Left-pad n to width w with ch (default '0').
   * @param {number|string} n @param {number} w @param {string} [ch='0'] @returns {string}
   */
  Util.pad = function (n, w, ch) {
    var s = String(n);
    ch = ch === undefined ? '0' : ch;
    while (s.length < w) s = ch + s;
    return s;
  };

  /**
   * Throw an Error with msg when cond is falsy.
   * @param {*} cond @param {string} msg
   */
  Util.assert = function (cond, msg) {
    if (!cond) throw new Error(msg || 'Assertion failed');
  };

  /**
   * True for objects created by {} or Object.create(null) (not arrays, not null).
   * @param {*} v @returns {boolean}
   */
  Util.isPlainObject = function (v) {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
    // realm-agnostic: a plain object's prototype is null or is itself a root (its prototype is null)
    var p = Object.getPrototypeOf(v);
    return p === null || Object.getPrototypeOf(p) === null;
  };

  /**
   * Own enumerable keys of an object (empty for non-objects).
   * @param {object} o @returns {string[]}
   */
  Util.keys = function (o) {
    return o && typeof o === 'object' ? Object.keys(o) : [];
  };

  /**
   * Stable sort (returns a new array). cmp returns <0, 0, >0.
   * @template T @param {T[]} arr @param {function(T, T): number} cmp @returns {T[]}
   */
  Util.stableSort = function (arr, cmp) {
    var idx = arr.map(function (v, i) { return { v: v, i: i }; });
    idx.sort(function (a, b) { return cmp(a.v, b.v) || (a.i - b.i); });
    return idx.map(function (x) { return x.v; });
  };

  /**
   * Nearest-integer round then clamp — the idiom used everywhere for attributes.
   * @param {number} x @param {number} lo @param {number} hi @returns {number}
   */
  Util.roundClamp = function (x, lo, hi) {
    return Util.clamp(Math.round(x), lo, hi);
  };

  /**
   * Get a nested value by dotted path ("difficulty.pro.sigmaMult").
   * @param {object} obj @param {string} path @returns {*}
   */
  Util.getPath = function (obj, path) {
    var parts = String(path).split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur === null || cur === undefined) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  };

  /**
   * Set a nested value by dotted path, creating intermediate objects.
   * @param {object} obj @param {string} path @param {*} value
   */
  Util.setPath = function (obj, path, value) {
    var parts = String(path).split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] === null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  };

  /**
   * Count of items where pred is true.
   * @template T @param {T[]} arr @param {function(T): boolean} pred @returns {number}
   */
  Util.count = function (arr, pred) {
    var n = 0;
    for (var i = 0; i < arr.length; i++) if (pred(arr[i])) n++;
    return n;
  };

  /**
   * Shallow-check that a value is a finite number.
   * @param {*} v @returns {boolean}
   */
  Util.isNum = function (v) {
    return typeof v === 'number' && isFinite(v);
  };

  /**
   * Structural deep equality over JSON-like values: strict primitives, same own
   * enumerable keys, arrays by index. Ignores prototypes (so objects from a vm
   * context compare equal to JSON.parse'd copies) and non-enumerable properties.
   * @param {*} a @param {*} b @returns {boolean}
   */
  Util.deepEqual = function (a, b) {
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return a !== a && b !== b;   // NaN
    var aArr = Array.isArray(a), bArr = Array.isArray(b);
    if (aArr !== bArr) return false;
    if (aArr) {
      if (a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) if (!Util.deepEqual(a[i], b[i])) return false;
      return true;
    }
    var ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (var j = 0; j < ka.length; j++) {
      if (!Object.prototype.hasOwnProperty.call(b, ka[j])) return false;
      if (!Util.deepEqual(a[ka[j]], b[ka[j]])) return false;
    }
    return true;
  };

  /**
   * First differing path between two JSON-like values ('' when equal). Test helper.
   * @param {*} a @param {*} b @param {string} [path] @returns {string}
   */
  Util.deepDiff = function (a, b, path) {
    path = path || '$';
    if (a === b) return '';
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return (a !== a && b !== b) ? '' : path;
    var keys = {}, k;
    for (k in a) if (Object.prototype.hasOwnProperty.call(a, k)) keys[k] = 1;
    for (k in b) if (Object.prototype.hasOwnProperty.call(b, k)) keys[k] = 1;
    for (k in keys) {
      var d = Util.deepDiff(a[k], b[k], path + '.' + k);
      if (d) return d;
    }
    return '';
  };

  RTG.Util = Util;
})(typeof window !== 'undefined' ? window : globalThis);
