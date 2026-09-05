/**
 * Loads the engine (everything before ui/) into a DOM-free vm context, in the
 * canonical script order from SPEC §3.2, and returns the RTG namespace.
 *
 *   const RTG = require('./load')();            // tolerant: skips files that do not exist yet
 *   const RTG = require('./load')({ strict: true });   // throws if any listed file is missing
 *   const RTG = require('./load')({ upTo: 'engine/kick' });  // stop after a given file
 *
 * The context deliberately has NO window/document/localStorage, so any DOM
 * reference inside engine code throws at load or call time.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', 'js');

/** Canonical load order (SPEC §3.2). ui/* files are never loaded here. */
const ORDER = [
  '00_namespace',
  'engine/tuning', 'engine/util', 'engine/rng', 'engine/schema',
  'data/blocklist', 'data/names', 'data/colleges', 'data/nfl', 'data/records',
  'data/awards', 'data/events', 'data/headlines',
  'engine/names', 'engine/weather', 'engine/player', 'engine/kick',
  'engine/schedule', 'engine/standings', 'engine/sim',
  'engine/stats', 'engine/awards', 'engine/events', 'engine/contracts', 'engine/draft',
  'engine/season', 'engine/career',
  'engine/save', 'engine/api',
];

function load(opts) {
  opts = opts || {};
  const sandbox = {};
  // Minimal, DOM-free global. Builtins (Math, JSON, Object, ...) come from the new context itself.
  const context = vm.createContext(sandbox);
  // `globalThis` inside the context resolves to the sandbox's global object.
  const missing = [];
  const loaded = [];
  for (const name of ORDER) {
    const file = path.join(ROOT, name + '.js');
    if (!fs.existsSync(file)) {
      missing.push(name);
      if (opts.strict) throw new Error('load.js: missing engine file ' + name + '.js');
      continue;
    }
    const src = fs.readFileSync(file, 'utf8');
    vm.runInContext(src, context, { filename: file });
    loaded.push(name);
    if (opts.upTo && name === opts.upTo) break;
  }
  const RTG = vm.runInContext('globalThis.RTG', context);
  if (!RTG) throw new Error('load.js: RTG namespace was not created');
  Object.defineProperty(RTG, '__loaded', { value: loaded, enumerable: false });
  Object.defineProperty(RTG, '__missing', { value: missing, enumerable: false });
  return RTG;
}

load.ORDER = ORDER;
load.ROOT = ROOT;
module.exports = load;
