/**
 * Engine purity (the kicker's SPEC §3.1 / §5.1 "purity", applied to qb/).
 *
 * Scans EVERY file that exists under qb/js/engine and qb/js/data (including files added later by the
 * engine agent) for DOM / clock / random references, checks the UMD shim and ES2017-only syntax, verifies
 * that only tuning.js assigns into RTG.Tuning, loads the engine through test/load.js and asserts the
 * namespaces of every module that has been delivered.
 *
 *   node qb/test/purity.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const load = require('./load');

const JS_ROOT = path.resolve(__dirname, '..', 'js');
const SHIM = "typeof window !== 'undefined' ? window : globalThis";

/** Every .js file under js/engine and js/data (recursive), relative to js/. */
function engineFiles() {
  const out = [];
  for (const dir of ['engine', 'data']) {
    const abs = path.join(JS_ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    const walk = (d) => {
      for (const name of fs.readdirSync(d).sort()) {
        const p = path.join(d, name);
        if (fs.statSync(p).isDirectory()) walk(p);
        else if (name.endsWith('.js')) out.push(path.relative(JS_ROOT, p).replace(/\\/g, '/'));
      }
    };
    walk(abs);
  }
  out.push('00_namespace.js');
  return out;
}

/**
 * Remove comments and the contents of string literals so that tokens inside
 * prose ("Date", "performance") are not flagged. Template literal `${…}` code is kept.
 */
function stripLiterals(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; out += ' '; continue; }
    if (c === '"' || c === "'") {
      i++;
      while (i < n && src[i] !== c) { if (src[i] === '\\') i++; i++; }
      i++; out += c + c; continue;
    }
    if (c === '`') {
      i++;
      while (i < n && src[i] !== '`') {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '$' && src[i + 1] === '{') {
          // copy the expression code until the matching brace
          i += 2; let depth = 1; out += '${';
          while (i < n && depth > 0) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}') depth--;
            if (depth > 0) out += src[i];
            i++;
          }
          out += '}';
          continue;
        }
        i++;
      }
      i++; out += '``'; continue;
    }
    out += c; i++;
  }
  return out;
}

const FORBIDDEN = [
  /\bdocument\b/, /\blocalStorage\b/, /\bsessionStorage\b/, /\bMath\.random\b/, /\bDate\b/, /\bsetTimeout\b/, /\bsetInterval\b/,
  /\brequestAnimationFrame\b/, /\bperformance\b/, /\bnavigator\b/, /\balert\b/, /\bconsole\.log\b/, /\bfetch\s*\(/, /\bXMLHttpRequest\b/
];
const ES_NEWER = [
  { re: /\?\./, what: 'optional chaining ?.' },
  { re: /\?\?/, what: 'nullish coalescing ??' },
  { re: /^\s*(import|export)\s/m, what: 'ES module syntax' },
  { re: /\b\d+n\b/, what: 'BigInt literal' },
  { re: /\bstatic\s*\{/, what: 'class static block' },
  { re: /\bcatch\s*\{/, what: 'optional catch binding' }
];

const files = engineFiles();

test('there are engine files to scan', () => {
  assert.ok(files.length > 0);
});

for (const rel of files) {
  test('purity: ' + rel, () => {
    const src = fs.readFileSync(path.join(JS_ROOT, rel), 'utf8');
    const code = stripLiterals(src);
    // the UMD shim
    assert.ok(src.indexOf(SHIM) >= 0, rel + ': missing the shim string');
    assert.ok(/\(function\s*\(root\)\s*\{/.test(src), rel + ': not wrapped in (function (root) { … })');
    assert.ok(/['"]use strict['"]/.test(src), rel + ': missing "use strict"');
    // `window` only in the shim
    const noShim = src.split(SHIM).join('');
    assert.ok(!/\bwindow\b/.test(stripLiterals(noShim)), rel + ': references `window` outside the shim');
    // DOM / clocks / randomness
    for (const re of FORBIDDEN) {
      const m = code.match(re);
      assert.ok(!m, rel + ': forbidden reference ' + (m && m[0]));
    }
    // syntax level
    for (const rule of ES_NEWER) assert.ok(!rule.re.test(code), rel + ': uses ' + rule.what);
    // no class fields (ES2022): `class X { foo = 1` — heuristic on class bodies
    const classBody = code.match(/\bclass\s+\w*\s*(?:extends\s+[\w.]+\s*)?\{([^]*?)\n\s*\}/g) || [];
    for (const body of classBody) assert.ok(!/^\s+[A-Za-z_$][\w$]*\s*=/m.test(body), rel + ': class field syntax');
  });
}

test('only tuning.js assigns into RTG.Tuning', () => {
  const offenders = [];
  const patterns = [
    /\bRTG\.Tuning\s*=[^=]/,
    /\bTuning(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])+\s*(?:=[^=]|\+=|-=|\*=|\/=)/,
    /\bRTG\.Tuning(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])+\s*(?:=[^=]|\+=|-=|\*=|\/=)/,
    /Object\.(?:assign|freeze|defineProperty)\(\s*(?:RTG\.)?Tuning\b/,
    /\bdelete\s+(?:RTG\.)?Tuning\b/
  ];
  for (const rel of files) {
    if (rel === 'engine/tuning.js') continue;
    const code = stripLiterals(fs.readFileSync(path.join(JS_ROOT, rel), 'utf8'));
    for (const re of patterns) {
      const m = code.match(re);
      if (m) offenders.push(rel + ': ' + m[0].trim());
    }
  }
  assert.deepEqual(offenders, []);
});

test('every file parses on its own (syntax) and the engine loads without throwing', () => {
  const vm = require('vm');
  for (const rel of files) {
    const src = fs.readFileSync(path.join(JS_ROOT, rel), 'utf8');
    assert.doesNotThrow(() => new vm.Script(src, { filename: rel }), rel + ' does not parse');
  }
  let RTG;
  assert.doesNotThrow(() => { RTG = load(); });
  assert.ok(RTG && RTG.VERSION);
});

test('every file of load.js ORDER exists (the engine is complete)', () => {
  const RTG = load();
  assert.deepEqual(RTG.__missing, [], 'missing engine files: ' + RTG.__missing.join(', '));
});

/** Namespaces and their binding functions, checked only for delivered files. */
const CONTRACT = {
  'engine/tuning': { ns: 'Tuning', keys: ['qb'] },
  'engine/util': { ns: 'Util', fns: ['clamp', 'lerp', 'round1', 'sum', 'mean', 'deepClone', 'fnv1a', 'erf', 'phi', 'fmtClock', 'ordinal', 'pad', 'assert'] },
  'engine/rng': { ns: 'RNG', fns: ['create'] },
  'engine/weather': { ns: 'Weather', fns: ['forGame', 'perKick', 'monthFor'] },
  'data/plays': { ns: 'Data.plays', type: 'object', keys: ['routes', 'plays', 'coverages'] },
  'engine/field': { ns: 'Field', fns: ['create', 'replay', 'setup', 'ghost', 'frame', 'alignment', 'alignReceivers', 'pathAt', 'clean', 'length', 'truncate', 'resample', 'smooth', 'qbSpeed', 'recSpeed', 'defSpeed', 'ballSpeed', 'maxLen', 'apex', 'heightAt', 'loftFor', 'weatherPenalty'] },
  'engine/play': { ns: 'Play', fns: ['buildContext', 'snap', 'live', 'resolve', 'autoPlan', 'forcedResult', 'driveScript', 'rating', 'pathAt', 'pocketTime', 'isClutch', 'downText', 'spotText'] }
};

const RTG = load();

for (const name of Object.keys(CONTRACT)) {
  const c = CONTRACT[name];
  test('namespace ' + c.ns + ' (' + name + ')', (t) => {
    if (RTG.__loaded.indexOf(name) < 0) { t.skip(name + '.js not delivered yet'); return; }
    const target = c.ns.split('.').reduce((o, k) => (o ? o[k] : undefined), RTG);
    assert.ok(target !== undefined && target !== null, 'RTG.' + c.ns + ' missing');
    if (c.type === 'array') assert.ok(Array.isArray(target), 'RTG.' + c.ns + ' should be an array');
    if (c.type === 'object') assert.equal(typeof target, 'object');
    if (c.keys) for (const k of c.keys) assert.ok(target[k] !== undefined, 'RTG.' + c.ns + '.' + k + ' missing');
    if (c.fns) {
      const missing = c.fns.filter((f) => typeof target[f] !== 'function');
      assert.deepEqual(missing, [], 'RTG.' + c.ns + ' missing functions: ' + missing.join(', '));
    }
  });
}

/** Dotted path of the first finite-number leaf of an object tree (depth-first, key order), or null. */
function firstNumericLeaf(o, p) {
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (v && typeof v === 'object') { const r = firstNumericLeaf(v, p.concat(k)); if (r) return r; }
    else if (typeof v === 'number' && isFinite(v)) return p.concat(k);
  }
  return null;
}
function getPath(o, p) { return p.reduce((x, k) => x[k], o); }
function setPath(o, p, v) { getPath(o, p.slice(0, -1))[p[p.length - 1]] = v; }

test('Tuning is a plain mutable object with a defaults factory (debug.tune contract)', () => {
  assert.equal(typeof RTG.TuningDefaults, 'function');
  assert.ok(!Object.isFrozen(RTG.Tuning));
  assert.equal(typeof RTG.Tuning.qb, 'object');
  const fresh = RTG.TuningDefaults();
  assert.notEqual(fresh, RTG.Tuning);
  assert.notEqual(fresh.qb, RTG.Tuning.qb);
  const leaf = firstNumericLeaf(RTG.Tuning, []);
  if (!leaf) return;   // an empty stub tree has nothing to mutate
  const before = getPath(RTG.Tuning, leaf);
  setPath(RTG.Tuning, leaf, before + 1);
  assert.equal(getPath(RTG.Tuning, leaf), before + 1, 'Tuning.' + leaf.join('.') + ' is not writable');
  setPath(RTG.Tuning, leaf, before);
  assert.equal(getPath(fresh, leaf), before, 'TuningDefaults() must return the pristine value');
});

test('no number-typed Tuning leaf is NaN/undefined', () => {
  const bad = [];
  const walk = (o, p) => {
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (v && typeof v === 'object') walk(v, p + '.' + k);
      else if (v === undefined || (typeof v === 'number' && !isFinite(v))) bad.push(p + '.' + k);
    }
  };
  walk(RTG.Tuning, 'Tuning');
  assert.deepEqual(bad, []);
});
