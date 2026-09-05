/**
 * Road to Glory: Kicker — RTG.Save (SPEC §3.5.19, §3.7)
 *
 * Save blobs: `{v, app, savedAt, seed, rngState, playtimeSec, checksum, career}` where
 * `checksum = fnv1a(JSON.stringify(career))` over the career exactly as stored in the blob.
 *
 * Serialize strips the non-persisted caches (`league.kickers`, and `teamIndex` is already
 * non-enumerable) and packs the two big row arrays (`stats.kicks`, `history.timeline`) into a
 * columnar `{_cols, _rows}` form so a 20-season slot stays under Tuning.save.maxBytes; deserialize
 * unpacks, migrates, reindexes and validates. Export/import is base64 of the blob JSON (UTF-8 safe).
 *
 * Purity: no window/document/clock. Base64 uses Node's Buffer when present (typeof check) and a
 * pure-JS encoder everywhere else (browsers included) — no btoa/atob binary-string pitfalls.
 * The clock is always passed in (`now`).
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  var Util = RTG.Util, Tuning = RTG.Tuning;
  var Save = {};

  var PACK_PATHS = [['stats', 'kicks'], ['history', 'timeline']];
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  function schema() { return RTG.Schema; }
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  // ═══════════════════════════════ checksum ═══════════════════════════════

  /**
   * Checksum of a career object: fnv1a hex8 of its compact JSON.
   * @param {Object} career @returns {string}
   */
  Save.checksum = function (career) {
    return Util.fnv1a(JSON.stringify(career));
  };

  // ═══════════════════════════════ caches & packing ═══════════════════════════════

  /**
   * Remove rebuildable caches from a (cloned) career: `league.kickers` (relinked by Schema.reindex).
   * @param {Object} career @returns {Object} the same object
   */
  Save.stripCaches = function (career) {
    if (career && career.leagues) {
      var lgs = ['college', 'nfl'];
      for (var i = 0; i < lgs.length; i++) {
        var L = career.leagues[lgs[i]];
        if (L) { delete L.kickers; delete L.teamIndex; }
      }
    }
    return career;
  };

  /**
   * Columnar packing of an array of plain-object rows: `{_cols:[keys], _rows:[[values]]}`.
   * Rows lacking a key (or carrying extra keys) are stored verbatim as objects, so the transform is
   * lossless. Nested values (wind, input, tags) are kept as-is.
   * @param {Object[]} rows @returns {{_cols:string[], _rows:Array}}
   */
  Save.packRows = function (rows) {
    var cols = [], seen = {}, i, k;
    for (i = 0; i < rows.length; i++) {
      if (!isObj(rows[i])) continue;
      for (k in rows[i]) if (Object.prototype.hasOwnProperty.call(rows[i], k) && !seen[k]) { seen[k] = true; cols.push(k); }
    }
    var out = new Array(rows.length);
    for (i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!isObj(r) || Object.keys(r).length !== cols.length) { out[i] = r; continue; }
      var arr = new Array(cols.length), ok = true;
      for (k = 0; k < cols.length; k++) {
        if (!Object.prototype.hasOwnProperty.call(r, cols[k]) || r[cols[k]] === undefined) { ok = false; break; }
        arr[k] = r[cols[k]];
      }
      out[i] = ok ? arr : r;
    }
    return { _cols: cols, _rows: out };
  };

  /**
   * Inverse of packRows. Non-packed input (a plain array) is returned unchanged.
   * @param {{_cols:string[], _rows:Array}|Object[]} packed @returns {Object[]}
   */
  Save.unpackRows = function (packed) {
    if (Array.isArray(packed)) return packed;
    if (!isObj(packed) || !Array.isArray(packed._cols) || !Array.isArray(packed._rows)) return [];
    var cols = packed._cols, out = new Array(packed._rows.length);
    for (var i = 0; i < packed._rows.length; i++) {
      var r = packed._rows[i];
      if (!Array.isArray(r)) { out[i] = r; continue; }
      var o = {};
      for (var k = 0; k < cols.length; k++) o[cols[k]] = r[k];
      out[i] = o;
    }
    return out;
  };

  function getPath(obj, path) {
    var cur = obj;
    for (var i = 0; i < path.length; i++) { if (!isObj(cur)) return undefined; cur = cur[path[i]]; }
    return cur;
  }
  function setPath(obj, path, value) {
    var cur = obj;
    for (var i = 0; i < path.length - 1; i++) { if (!isObj(cur[path[i]])) cur[path[i]] = {}; cur = cur[path[i]]; }
    cur[path[path.length - 1]] = value;
  }

  function packCareer(career) {
    for (var i = 0; i < PACK_PATHS.length; i++) {
      var v = getPath(career, PACK_PATHS[i]);
      if (Array.isArray(v) && v.length) setPath(career, PACK_PATHS[i], Save.packRows(v));
    }
    return career;
  }

  function unpackCareer(career) {
    for (var i = 0; i < PACK_PATHS.length; i++) {
      var v = getPath(career, PACK_PATHS[i]);
      if (isObj(v) && Array.isArray(v._cols)) setPath(career, PACK_PATHS[i], Save.unpackRows(v));
    }
    return career;
  }

  // ═══════════════════════════════ serialize / deserialize ═══════════════════════════════

  /**
   * Build a save blob from a state (§3.7). The state itself is not mutated except `state.rngState`,
   * which is synced from `rng` so the persisted career and the blob agree.
   * @param {CareerState} state @param {RNG|null} rng @param {number} now ms (supplied by the UI)
   * @returns {{v:number, app:string, savedAt:number, seed:number, rngState:number, playtimeSec:number, checksum:string, career:Object}}
   */
  Save.serialize = function (state, rng, now) {
    var rngState = rng && typeof rng.state === 'function' ? rng.state() : (state.rngState >>> 0);
    state.rngState = rngState;
    var career = Util.deepClone(state);
    career.v = RTG.SAVE_VERSION;
    career.rngState = rngState;
    Save.stripCaches(career);
    packCareer(career);
    return {
      v: RTG.SAVE_VERSION,
      app: RTG.VERSION,
      savedAt: typeof now === 'number' ? now : 0,
      seed: state.seed,
      rngState: rngState,
      playtimeSec: typeof state.playtimeSec === 'number' ? state.playtimeSec : 0,
      checksum: Save.checksum(career),
      career: career
    };
  };

  /**
   * Turn a blob back into a live state: newer-version refusal → checksum → migrate → unpack →
   * reindex → validate. Never throws.
   * @param {Object|string} blob (a JSON string is parsed first)
   * @returns {{state:CareerState, rngState:number, migrated:boolean, warnings:string[]}|{error:'NEWER'|'CHECKSUM'|'INVALID'|'NO_MIGRATION', errors?:string[], message?:string}}
   */
  Save.deserialize = function (blob) {
    try {
      if (typeof blob === 'string') {
        try { blob = JSON.parse(blob); } catch (e) { return { error: 'INVALID', errors: ['not JSON: ' + e.message] }; }
      }
      if (!isObj(blob) || !isObj(blob.career)) return { error: 'INVALID', errors: ['blob has no career'] };
      var v = typeof blob.v === 'number' ? blob.v : (typeof blob.career.v === 'number' ? blob.career.v : 0);
      if (v > RTG.SAVE_VERSION) return { error: 'NEWER', message: 'This save is from a newer version (' + v + ' > ' + RTG.SAVE_VERSION + ')' };
      if (Save.checksum(blob.career) !== blob.checksum) return { error: 'CHECKSUM', message: 'Save checksum mismatch' };

      var work = Util.deepClone(blob);
      work.v = v;
      var migrated = v < RTG.SAVE_VERSION;
      var warnings = [];
      if (migrated) {
        var m = Save.migrate(work);
        if (m && m.error) return m;
        work = m;
        warnings.push('migrated from save version ' + v + ' to ' + RTG.SAVE_VERSION);
      }
      var state = unpackCareer(work.career);
      state.v = RTG.SAVE_VERSION;
      var S = schema();
      if (S && typeof S.reindex === 'function') S.reindex(state);
      if (S && typeof S.validate === 'function') {
        var r = S.validate(state);
        if (!r.ok) return { error: 'INVALID', errors: r.errors };
      }
      var rngState = typeof work.rngState === 'number' ? work.rngState >>> 0 : (state.rngState >>> 0);
      state.rngState = rngState;
      return { state: state, rngState: rngState, migrated: migrated, warnings: warnings };
    } catch (e) {
      return { error: 'INVALID', errors: ['deserialize threw: ' + (e && e.message)] };
    }
  };

  // ═══════════════════════════════ migrations ═══════════════════════════════

  /**
   * `Save.migrations[oldV](blob) → blob` upgrades a blob from version oldV to oldV + 1.
   * Each function may mutate and return the blob; `migrate` sets `v` and recomputes the checksum.
   */
  Save.migrations = {};

  /**
   * Apply migrations sequentially from blob.v up to RTG.SAVE_VERSION. Returns the upgraded blob
   * (same object, mutated) or `{error:'NEWER'}` / `{error:'NO_MIGRATION'}`.
   * @param {Object} blob @returns {Object}
   */
  Save.migrate = function (blob) {
    if (!isObj(blob)) return { error: 'INVALID', errors: ['not a blob'] };
    var v = typeof blob.v === 'number' ? blob.v : (blob.career && typeof blob.career.v === 'number' ? blob.career.v : 0);
    if (v > RTG.SAVE_VERSION) return { error: 'NEWER', message: 'This save is from a newer version' };
    while (v < RTG.SAVE_VERSION) {
      var fn = Save.migrations[v];
      if (typeof fn !== 'function') return { error: 'NO_MIGRATION', message: 'no migration from save version ' + v };
      var next = fn(blob) || blob;
      blob = next;
      v = v + 1;
      blob.v = v;
      if (blob.career) blob.career.v = v;
    }
    if (blob.career) blob.checksum = Save.checksum(blob.career);
    return blob;
  };

  /** Fill missing keys of `target` from `defaults` (one level; nested objects recurse when both are objects). */
  function fillDefaults(target, defaults) {
    for (var k in defaults) {
      if (!Object.prototype.hasOwnProperty.call(defaults, k)) continue;
      if (target[k] === undefined) target[k] = Util.deepClone(defaults[k]);
      else if (isObj(target[k]) && isObj(defaults[k]) && !Array.isArray(defaults[k])) fillDefaults(target[k], defaults[k]);
    }
    return target;
  }

  function emptyKickerStats() {
    var S = schema();
    if (S && typeof S.emptyKickerStats === 'function') return S.emptyKickerStats();
    return RTG.Stats && RTG.Stats.emptyStats ? RTG.Stats.emptyStats() : {};
  }

  /**
   * v0 → v1. The v0 shape (see test/fixtures/save_v0.json) predates: per-league stats
   * (`stats.college/nfl`), `stats.splits`, `history.moments/earnings`, `records.personal`,
   * `recentEventIds`, `settings`, `flags`, `player.agentTier/agentName/tags/seasonsAsStarter/mods/redshirt`,
   * `league.seasonHistory`, NFL `cap/vetMin/tagValue`, AI-kicker `seasonStats`, and the
   * `doinkIn/koTouchbacks/koCount/wins/losses` KickerStats counters. Kick rows may lack `tags/auto/input`.
   * @param {Object} blob @returns {Object}
   */
  Save.migrations[0] = function (blob) {
    var c = blob.career;
    if (!isObj(c)) return blob;
    var C = Tuning.contracts;
    var S = schema();

    fillDefaults(c, { playtimeSec: 0, createdAt: 0, week: 0, game: null, pending: null, inbox: [], headlines: [],
      recentHeadlineIds: [], recentEventIds: [], flags: {}, settings: S && S.defaultSettings ? S.defaultSettings() : { autoPat: 'off', playKickoffs: false, simSpeed: 1 } });
    if (typeof blob.playtimeSec !== 'number') blob.playtimeSec = c.playtimeSec;
    if (typeof blob.app !== 'string') blob.app = '0.0.0';

    // player
    if (isObj(c.player)) {
      fillDefaults(c.player, { agentTier: 0, agentName: '', tags: 0, seasonsAsStarter: 0, mods: [], traits: [], flags: {}, redshirt: false,
        collegeSeasons: 0, nflSeasons: 0, nil: 0, missStreak: 0, makeStreak: 0, injury: null, form: 0, xpSpent: 0, gamesPlayed: 0 });
      if (c.player.contract === undefined) c.player.contract = null;
    }

    // leagues
    if (isObj(c.leagues)) {
      var lgs = ['college', 'nfl'];
      for (var i = 0; i < lgs.length; i++) {
        var L = c.leagues[lgs[i]];
        if (!isObj(L)) continue;
        fillDefaults(L, { seasonHistory: [], year: c.year || 1, kind: lgs[i] === 'nfl' ? 'NFL' : 'COLLEGE' });
        if (lgs[i] === 'nfl') fillDefaults(L, { cap: C.capStart, vetMin: C.vetMinStart, tagValue: C.tag.base });
        delete L.kickers;
        var teams = L.teams || [];
        for (var t = 0; t < teams.length; t++) {
          var tm = teams[t];
          fillDefaults(tm, { surface: tm.dome ? 'turf' : 'grass', coach: '', kicker2: null, coachAgg: 0.5, rainy: false, windy: false, altitude: false });
          var ks = [tm.kicker, tm.kicker2];
          for (var q = 0; q < ks.length; q++) {
            if (!isObj(ks[q])) continue;
            if (!isObj(ks[q].seasonStats)) ks[q].seasonStats = emptyKickerStats();
            else fillDefaults(ks[q].seasonStats, emptyKickerStats());
            if (typeof ks[q].contractYears !== 'number') ks[q].contractYears = 1;
          }
        }
      }
    }

    // season
    if (!isObj(c.season)) c.season = S && S.emptySeason ? S.emptySeason(c.player && c.player.league, c.year) : {};
    fillDefaults(c.season, { schedule: [], results: {}, rankings: {}, standings: [], playoffs: null, bowls: null, goals: [],
      trainingDone: false, focus: null, userGameId: null, weekGameDone: false, kickerStats: {}, year: c.year || 1,
      league: (c.player && c.player.league) || 'COLLEGE' });
    for (var kid in c.season.kickerStats) if (Object.prototype.hasOwnProperty.call(c.season.kickerStats, kid)) fillDefaults(c.season.kickerStats[kid], emptyKickerStats());

    // history
    if (!isObj(c.history)) c.history = {};
    fillDefaults(c.history, { seasons: [], awards: [], contracts: [], teams: [], timeline: [], earnings: 0, moments: [] });

    // stats: v0 had only season / career / kicks
    if (!isObj(c.stats)) c.stats = {};
    var empty = emptyKickerStats();
    fillDefaults(c.stats, { season: Util.deepClone(empty), career: Util.deepClone(empty), kicks: [], splits: { byBucket: {}, byWeather: {}, byHash: {}, byPressure: {} } });
    fillDefaults(c.stats.season, empty);
    fillDefaults(c.stats.career, empty);
    var inNfl = c.player && c.player.league === 'NFL';
    if (!isObj(c.stats.college)) c.stats.college = inNfl ? Util.deepClone(empty) : Util.deepClone(c.stats.career);
    if (!isObj(c.stats.nfl)) c.stats.nfl = inNfl ? Util.deepClone(c.stats.career) : Util.deepClone(empty);
    fillDefaults(c.stats.college, empty);
    fillDefaults(c.stats.nfl, empty);
    var rows = Save.unpackRows(c.stats.kicks);
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      if (!isObj(row)) continue;
      fillDefaults(row, { tags: [], auto: false, input: { power: 0, aim: 0, quality: 0 }, wind: { speed: 0, dir: 0 }, weather: 'clear',
        pressure: 0, hash: 0, gameId: null, teamId: null, oppId: null, rngState: 0, q: 0, clock: 0, scoreFor: 0, scoreAgainst: 0,
        league: (c.player && c.player.league) || 'COLLEGE', year: c.year || 1, week: 0 });
      if (typeof row.made !== 'boolean') row.made = !!row.made;
      if (typeof row.id !== 'string') row.id = 'k0-' + r;
    }
    c.stats.kicks = rows;

    // records
    if (!isObj(c.records)) c.records = { college: {}, nfl: {}, personal: {} };
    fillDefaults(c.records, { college: {}, nfl: {}, personal: {} });
    var rl = ['college', 'nfl'];
    for (var y = 0; y < rl.length; y++) for (var key in c.records[rl[y]]) if (Object.prototype.hasOwnProperty.call(c.records[rl[y]], key)) {
      fillDefaults(c.records[rl[y]][key], { holder: 'Unknown', holderTeam: null, year: Tuning.schedule.firstYear, isUser: false });
    }
    return blob;
  };

  // ═══════════════════════════════ base64 (UTF-8 safe) ═══════════════════════════════

  /** UTF-8 encode a string into an array of byte values. */
  function utf8Bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      else if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) {
        var lo = str.charCodeAt(i + 1);
        var cp = 0x10000 + ((c - 0xd800) << 10) + (lo - 0xdc00);
        i++;
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
      } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
    return out;
  }

  /** Decode UTF-8 bytes into a string. */
  function utf8String(bytes) {
    var out = [], i = 0, chunk = [];
    function flush() { if (chunk.length) { out.push(String.fromCharCode.apply(null, chunk)); chunk = []; } }
    while (i < bytes.length) {
      var b = bytes[i++], cp;
      if (b < 0x80) cp = b;
      else if (b < 0xe0) cp = ((b & 0x1f) << 6) | (bytes[i++] & 0x3f);
      else if (b < 0xf0) cp = ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
      else cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
      if (cp >= 0x10000) { cp -= 0x10000; chunk.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff)); }
      else chunk.push(cp);
      if (chunk.length >= 4096) flush();
    }
    flush();
    return out.join('');
  }

  function bytesToBase64(bytes) {
    var out = '', i;
    for (i = 0; i + 2 < bytes.length; i += 3) {
      var n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
    }
    var rem = bytes.length - i;
    if (rem === 1) { var a = bytes[i] << 16; out += B64[(a >> 18) & 63] + B64[(a >> 12) & 63] + '=='; }
    else if (rem === 2) { var b2 = (bytes[i] << 16) | (bytes[i + 1] << 8); out += B64[(b2 >> 18) & 63] + B64[(b2 >> 12) & 63] + B64[(b2 >> 6) & 63] + '='; }
    return out;
  }

  function base64ToBytes(str) {
    var clean = String(str).replace(/[^A-Za-z0-9+\/=]/g, '');
    var out = [], buf = 0, bits = 0;
    for (var i = 0; i < clean.length; i++) {
      var ch = clean[i];
      if (ch === '=') break;
      var v = B64.indexOf(ch);
      if (v < 0) throw new Error('bad base64');
      buf = (buf << 6) | v; bits += 6;
      if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 0xff); }
    }
    return out;
  }

  function hasBuffer() {
    return typeof Buffer !== 'undefined' && Buffer && typeof Buffer.from === 'function';
  }

  /**
   * UTF-8 string → base64 (Buffer in Node, pure JS elsewhere).
   * @param {string} str @param {boolean} [pure] force the pure-JS path (tests)
   * @returns {string}
   */
  Save.toBase64 = function (str, pure) {
    if (!pure && hasBuffer()) return Buffer.from(str, 'utf8').toString('base64');
    return bytesToBase64(utf8Bytes(str));
  };

  /**
   * base64 → UTF-8 string. Whitespace and line breaks are ignored.
   * @param {string} b64 @param {boolean} [pure] force the pure-JS path (tests)
   * @returns {string}
   */
  Save.fromBase64 = function (b64, pure) {
    var clean = String(b64).replace(/\s+/g, '');
    if (!pure && hasBuffer()) return Buffer.from(clean, 'base64').toString('utf8');
    return utf8String(base64ToBytes(clean));
  };

  /**
   * Blob → base64 text for the Saves screen textarea.
   * @param {Object} blob @returns {string}
   */
  Save.exportString = function (blob) {
    return Save.toBase64(JSON.stringify(blob));
  };

  /**
   * base64 text → blob. Tolerates surrounding whitespace / line wraps. Returns `{error:'IMPORT'}`
   * (never throws) when the text is not a save.
   * @param {string} str @returns {Object|{error:'IMPORT', message:string}}
   */
  Save.importString = function (str) {
    try {
      var json = Save.fromBase64(String(str || '').trim());
      var blob = JSON.parse(json);
      if (!isObj(blob) || !isObj(blob.career)) return { error: 'IMPORT', message: 'not a save blob' };
      return blob;
    } catch (e) {
      return { error: 'IMPORT', message: 'could not read the save text: ' + (e && e.message) };
    }
  };

  // ═══════════════════════════════ slot summary ═══════════════════════════════

  function findTeamName(career, id) {
    if (!id || !career.leagues) return null;
    var lgs = ['college', 'nfl'];
    for (var i = 0; i < lgs.length; i++) {
      var L = career.leagues[lgs[i]];
      if (!L || !Array.isArray(L.teams)) continue;
      for (var t = 0; t < L.teams.length; t++) if (L.teams[t].id === id) return L.teams[t].name;
    }
    return id;
  }

  function ovrOf(attrs) {
    if (!isObj(attrs)) return 0;
    if (RTG.Player && typeof RTG.Player.ovr === 'function') return RTG.Player.ovr(attrs);
    var W = Tuning.progression.ovrWeights, s = 0;
    for (var k in W) if (Object.prototype.hasOwnProperty.call(W, k)) s += W[k] * (attrs[k] || 0);
    return Math.round(s);
  }

  /**
   * What the Saves screen shows for a slot. Works on any blob version (no migration needed).
   * @param {Object} blob
   * @returns {{name:string, team:string|null, year:number, stage:string, phase:string, ovr:number, savedAt:number, age:number, league:string|null, seed:number, difficulty:string, v:number, app:string, calendarYear:number}|null}
   */
  Save.slotSummary = function (blob) {
    if (!isObj(blob) || !isObj(blob.career)) return null;
    var c = blob.career, p = c.player || {};
    var year = typeof c.year === 'number' ? c.year : 1;
    return {
      name: p.name && p.name.full ? p.name.full : '',
      team: findTeamName(c, p.teamId),
      year: year,
      calendarYear: Tuning.schedule.firstYear + year - 1,
      stage: c.stage || '',
      phase: c.phase || '',
      ovr: ovrOf(p.attrs),
      age: typeof p.age === 'number' ? p.age : 0,
      league: p.league || null,
      savedAt: typeof blob.savedAt === 'number' ? blob.savedAt : 0,
      seed: typeof blob.seed === 'number' ? blob.seed : (c.seed || 0),
      difficulty: c.difficulty || 'pro',
      v: typeof blob.v === 'number' ? blob.v : 0,
      app: blob.app || ''
    };
  };

  /**
   * Byte size of a blob's JSON (UTF-8).
   * @param {Object} blob @returns {number}
   */
  Save.byteSize = function (blob) {
    return utf8Bytes(JSON.stringify(blob)).length;
  };

  RTG.Save = Save;
})(typeof window !== 'undefined' ? window : globalThis);
