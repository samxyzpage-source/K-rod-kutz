/**
 * Road to Glory: Kicker — RTG.UI.Storage (SPEC §3.7, UI_API.md §Storage).
 *
 * A localStorage adapter that never throws: private-mode Safari, quota errors and "storage disabled" all fall
 * back to an in-memory map for the rest of the session. Every call returns synchronously.
 *
 *   Storage.getItem(key) → string|null          Storage.setItem(key, value) → boolean (false = fell back / failed)
 *   Storage.removeItem(key) → void              Storage.keys() → string[] (own keys, sorted)
 *   Storage.getJSON(key) → any|null             Storage.setJSON(key, obj) → boolean
 *   Storage.available → boolean (false when running on the memory fallback)
 *   Storage.clear(prefix?) → void  (only keys starting with prefix, default 'rtg.')
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};

  var mem = {};
  var backend = null;
  var available = false;

  function probe() {
    try {
      var ls = root.localStorage;
      if (!ls) return null;
      var k = '__rtg_probe__';
      ls.setItem(k, '1');
      ls.removeItem(k);
      return ls;
    } catch (e) {
      return null;
    }
  }

  backend = probe();
  available = !!backend;

  var Storage = {
    /** True while the real localStorage is in use. */
    available: available,

    getItem: function (key) {
      if (backend) {
        try { var v = backend.getItem(key); return v === undefined ? null : v; } catch (e) { /* fall through */ }
      }
      return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null;
    },

    setItem: function (key, value) {
      value = String(value);
      if (backend) {
        try { backend.setItem(key, value); return true; } catch (e) { /* quota / private mode: fall back */ }
      }
      mem[key] = value;
      return false;
    },

    removeItem: function (key) {
      if (backend) {
        try { backend.removeItem(key); } catch (e) { /* ignore */ }
      }
      delete mem[key];
    },

    /** Own keys (real storage + memory fallback), sorted. */
    keys: function () {
      var out = {}, i, k;
      if (backend) {
        try {
          for (i = 0; i < backend.length; i++) { k = backend.key(i); if (k !== null) out[k] = 1; }
        } catch (e) { /* ignore */ }
      }
      for (k in mem) if (Object.prototype.hasOwnProperty.call(mem, k)) out[k] = 1;
      return Object.keys(out).sort();
    },

    /** Parse a JSON value; null when missing or malformed. */
    getJSON: function (key) {
      var raw = Storage.getItem(key);
      if (raw === null) return null;
      try { return JSON.parse(raw); } catch (e) { return null; }
    },

    setJSON: function (key, obj) {
      return Storage.setItem(key, JSON.stringify(obj));
    },

    /** Remove every key with a prefix (default 'rtg.'). */
    clear: function (prefix) {
      prefix = prefix === undefined ? 'rtg.' : String(prefix);
      var ks = Storage.keys();
      for (var i = 0; i < ks.length; i++) if (ks[i].indexOf(prefix) === 0) Storage.removeItem(ks[i]);
    }
  };

  RTG.UI.Storage = Storage;
})(typeof window !== 'undefined' ? window : globalThis);
