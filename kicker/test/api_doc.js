#!/usr/bin/env node
/**
 * api_doc.js — prints section 3 of kicker/docs/ENGINE_API.md ("Exports by namespace") from the code: every exported
 * member of every RTG engine namespace with its real parameter list (from the function definition) and the first
 * paragraph of its JSDoc. Not a test.
 *
 *   node kicker/test/api_doc.js            # Markdown to stdout
 *   node kicker/test/api_doc.js out.md     # …or to a file
 *
 * Regenerate and paste into ENGINE_API.md §3 whenever a signature changes (sections 1–2 are hand-written).
 */
'use strict';
const fs = require('fs'), path = require('path');
const load = require('./load');
const RTG = load();
const ROOT = load.ROOT;
const FILES = {
  Util: 'engine/util', RNG: 'engine/rng', Schema: 'engine/schema', Names: 'engine/names', Weather: 'engine/weather', Player: 'engine/player',
  Kick: 'engine/kick', Schedule: 'engine/schedule', Standings: 'engine/standings', Sim: 'engine/sim', Stats: 'engine/stats', Awards: 'engine/awards',
  Events: 'engine/events', Contracts: 'engine/contracts', Draft: 'engine/draft', Season: 'engine/season', Career: 'engine/career', Save: 'engine/save', Engine: 'engine/api'
};
function paramsOf(fn) {
  const src = Function.prototype.toString.call(fn);
  let m = src.match(/^function\s*[\w$]*\s*\(([^)]*)\)/);
  if (!m) m = src.match(/^\(?([^)=]*)\)?\s*=>/);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}
function jsdocFor(src, ns, key, fn) {
  // find the assignment `ns.key = ` (or `function key(`) and the closest preceding /** */ block within 3 lines
  const candidates = [new RegExp('^\\s*' + ns + '\\.' + key.replace(/\$/g, '\\$') + '\\s*=', 'm')];
  const alias = Function.prototype.toString.call(fn).match(/^function\s+([\w$]+)\s*\(/);
  if (alias && alias[1] !== key) candidates.push(new RegExp('^\\s*function\\s+' + alias[1] + '\\s*\\(', 'm'));
  else candidates.push(new RegExp('^\\s*function\\s+' + key.replace(/\$/g, '\\$') + '\\s*\\(', 'm'));
  for (const re of candidates) {
    const m = re.exec(src);
    if (!m) continue;
    const before = src.slice(0, m.index);
    const end = before.lastIndexOf('*/');
    if (end < 0) continue;
    const between = before.slice(end + 2);
    if (between.split('\n').length > 3) continue;
    const start = before.lastIndexOf('/**', end);
    if (start < 0) continue;
    const block = before.slice(start + 3, end);
    const lines = block.split('\n').map((l) => l.replace(/^\s*\*\s?/, '').trim());
    const text = [], ret = [];
    for (const l of lines) {
      if (/^@returns?/.test(l)) ret.push(l.replace(/^@returns?\s*/, ''));
      else if (/^@/.test(l)) continue;
      else if (l) text.push(l);
    }
    let summary = text.join(' ');
    // inline tags on the summary line (e.g. "... @param {Object} state @returns {Object} SaveBlob")
    const inl = summary.match(/@returns?\s*(\{[^}]*\}\s*[^@]*)/);
    if (inl) ret.push(inl[1].trim());
    summary = summary.replace(/@param\s*\{[^}]*\}\s*\[?[\w$.]+\]?[^@]*/g, '').replace(/@returns?\s*\{[^}]*\}[^@]*/g, '').replace(/@\w+[^@]*/g, '').trim();
    return { summary, ret: ret.join(' ') };
  }
  return null;
}
const OVERRIDES = {
  'Util.degToRad': 'Degrees → radians.',
  'Util.radToDeg': 'Radians → degrees.',
  'RNG.create': 'Create a mulberry32 generator from a uint32 seed (RNG.toSeed coerces strings / numbers). Instance methods: next() [0,1) · int(lo, hi) inclusive · float(lo, hi) · chance(p) · gauss(mu, sd) (exactly 2 draws, Box–Muller, no caching) · gaussInt(mu, sd, lo, hi) · pick(arr) · weighted(items, weightFnOrKey) · shuffle(arr) in place (n−1 draws) · state() → uint32 · setState(s) · fork(label) → child rng seeded by fnv1a(state + label), advances the parent by 1 draw.',
  'RNG.RNG': 'The generator constructor (new RNG.RNG(seed)); RNG.create(seed) is the usual entry point.',
  'Schema.emptyHistory': 'An empty history block {seasons, awards, contracts, teams, timeline, earnings, moments}.',
  'Schema.emptyStats': 'An empty stats block {season, career, college, nfl, kicks, splits} of zeroed KickerStats.',
  'Schema.defaultSettings': 'Per-career settings mirror defaults {autoPat, playKickoffs, simSpeed}.',
  'Schema.emptyTeamGameStats': 'A zeroed per-team game stat line {drives, td, fga, fgm, pat, patMade, punts, to}.'
};
const out = [];
for (const ns of Object.keys(FILES)) {
  const obj = RTG[ns];
  if (!obj) { out.push('### RTG.' + ns + ' — MISSING\n'); continue; }
  const file = path.join(ROOT, FILES[ns] + '.js');
  const src = fs.readFileSync(file, 'utf8');
  out.push('### `RTG.' + ns + '` — `js/' + FILES[ns] + '.js`\n');
  out.push('| Export | Description |');
  out.push('|---|---|');
  const keys = Object.keys(obj);
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'function') {
      const doc = jsdocFor(src, ns, k, v) || { summary: '', ret: '' };
      if (!doc.summary && OVERRIDES[ns + '.' + k]) doc.summary = OVERRIDES[ns + '.' + k];
      let s = doc.summary.replace(/\|/g, '\\|');
      if (s.length > 320) s = s.slice(0, 317) + '…';
      const ret = doc.ret ? ' → ' + doc.ret.replace(/\|/g, '\\|').slice(0, 120) : '';
      out.push('| `' + ns + '.' + k + '(' + paramsOf(v) + ')`' + ret.replace(/`/g, '') + ' | ' + s + ' |');
    } else {
      const kind = Array.isArray(v) ? 'array[' + v.length + ']' : typeof v === 'object' && v ? 'object{' + Object.keys(v).slice(0, 8).join(', ') + (Object.keys(v).length > 8 ? ', …' : '') + '}' : JSON.stringify(v);
      out.push('| `' + ns + '.' + k + '` | constant: ' + kind.replace(/\|/g, '\\|') + ' |');
    }
  }
  out.push('');
}
if (process.argv[2]) fs.writeFileSync(process.argv[2], out.join('\n') + '\n');
else process.stdout.write(out.join('\n') + '\n');
