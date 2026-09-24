/**
 * Loads the engine (everything before ui/) into a DOM-free vm context, in the
 * canonical script order of qb/index.html, and returns the RTG namespace.
 *
 *   const RTG = require('./load')();            // tolerant: skips files that do not exist yet
 *   const RTG = require('./load')({ strict: true });   // throws if any listed file is missing
 *   const RTG = require('./load')({ upTo: 'engine/play' });  // stop after a given file
 *   const RTG = require('./load')({ realm: 'this' });  // evaluate in THIS process's main context (see below)
 *   const RTG = require('./load')({ shadow: false });  // vm context without the builtin-shadowing speed wrapper
 *
 * The default context deliberately has NO window/document/localStorage, so any DOM
 * reference inside engine code throws at load or call time.
 *
 * realm 'this' (perf / integration tests): the same files are evaluated with vm.runInThisContext, i.e. on this
 * process's globalThis. A contextified sandbox makes every global lookup (Math, Object, Array, isFinite, …) several
 * times slower than a browser or a plain script, so engine budgets are only meaningful in the main realm.
 * The main-realm engine is created once per process and cached (globalThis.RTG); pass { fresh: true } to re-evaluate.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', 'js');   // qb/js

/** Canonical load order (qb/index.html). ui/* files are never loaded here. */
const ORDER = [
  '00_namespace',
  'engine/tuning', 'engine/util', 'engine/rng', 'engine/weather',
  'data/plays',
  'engine/field',
  'engine/play',
];

/** Evaluate every existing engine file in order with `run(src, file)`; returns {loaded, missing}. */
function evalAll(opts, run) {
  const missing = [];
  const loaded = [];
  for (const name of ORDER) {
    const file = path.join(ROOT, name + '.js');
    if (!fs.existsSync(file)) {
      missing.push(name);
      if (opts.strict) throw new Error('load.js: missing engine file ' + name + '.js');
      continue;
    }
    run(fs.readFileSync(file, 'utf8'), file);
    loaded.push(name);
    if (opts.upTo && name === opts.upTo) break;
  }
  return { loaded, missing };
}

function tag(RTG, info) {
  Object.defineProperty(RTG, '__loaded', { value: info.loaded, enumerable: false, configurable: true });
  Object.defineProperty(RTG, '__missing', { value: info.missing, enumerable: false, configurable: true });
  return RTG;
}

let mainRealm = null;

/**
 * Builtins shadowed inside each file when evaluating in a vm context. A contextified sandbox resolves every
 * global identifier through an interceptor, which makes `Math.round`, `Object.keys`, `isFinite`… 4–5× slower
 * than in a browser. Wrapping the file in a function whose parameters are the context's OWN builtins turns
 * those lookups into closure lookups with identical semantics (same objects) and brings the sandbox to
 * main-realm speed. The wrapper prefix shares line 1 with the source, so stack-trace line numbers are unchanged.
 */
const SHADOWED = ['Math', 'Object', 'Array', 'JSON', 'Number', 'String', 'Boolean', 'isFinite', 'isNaN',
  'parseInt', 'parseFloat', 'Error', 'TypeError', 'RangeError'];
function shadowWrap(src) {
  return '(function (' + SHADOWED.join(', ') + ') {' + src + '\n})(' + SHADOWED.join(', ') + ');';
}

function load(opts) {
  opts = opts || {};
  if (opts.realm === 'this') {
    if (mainRealm && !opts.fresh && !opts.upTo) return mainRealm;
    const info = evalAll(opts, (src, file) => vm.runInThisContext(src, { filename: file }));
    const RTG = globalThis.RTG;
    if (!RTG) throw new Error('load.js: RTG namespace was not created');
    mainRealm = tag(RTG, info);
    return mainRealm;
  }
  const sandbox = {};
  // Minimal, DOM-free global. Builtins (Math, JSON, Object, ...) come from the new context itself.
  const context = vm.createContext(sandbox);
  // `globalThis` inside the context resolves to the sandbox's global object.
  const wrap = opts.shadow === false ? (src) => src : shadowWrap;
  const info = evalAll(opts, (src, file) => vm.runInContext(wrap(src), context, { filename: file }));
  const RTG = vm.runInContext('globalThis.RTG', context);
  if (!RTG) throw new Error('load.js: RTG namespace was not created');
  return tag(RTG, info);
}

load.ORDER = ORDER;
load.ROOT = ROOT;
module.exports = load;
