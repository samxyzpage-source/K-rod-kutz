/**
 * Engine purity (SPEC §3.1, §5.1 "purity").
 *
 * Scans EVERY file that exists under kicker/js/engine and kicker/js/data
 * (including files added later by other engineers) for DOM / clock / random
 * references, checks the §3.3 shim and ES2017-only syntax, verifies that only
 * tuning.js assigns into RTG.Tuning, loads the engine through test/load.js and
 * asserts the §3.5 namespaces of every module that has been delivered.
 *
 *   node kicker/test/purity.test.js
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
  const tplDepth = [];   // stack of brace depths for nested template ${}
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
  void tplDepth;
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
  { re: /\bstatic\s*\{/, what: 'class static block' }
];

const files = engineFiles();

test('there are engine files to scan', () => {
  assert.ok(files.length > 0);
});

for (const rel of files) {
  test('purity: ' + rel, () => {
    const src = fs.readFileSync(path.join(JS_ROOT, rel), 'utf8');
    const code = stripLiterals(src);
    // shim (§3.3)
    assert.ok(src.indexOf(SHIM) >= 0, rel + ': missing the §3.3 shim string');
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
  assert.ok(RTG && RTG.VERSION && RTG.SAVE_VERSION);
});

/** §3.5 namespaces and their binding functions, checked only for delivered files. */
const CONTRACT = {
  'engine/tuning': { ns: 'Tuning', keys: ['kick', 'sim', 'progression', 'soft', 'contracts', 'draft', 'hof', 'difficulty', 'save', 'events'] },
  'engine/util': { ns: 'Util', fns: ['clamp', 'lerp', 'round1', 'sum', 'mean', 'indexBy', 'deepClone', 'fnv1a', 'erf', 'phi', 'fmtMoney', 'fmtPct', 'fmtClock', 'ordinal', 'template', 'pad', 'assert'] },
  'engine/rng': { ns: 'RNG', fns: ['create'] },
  'engine/schema': { ns: 'Schema', fns: ['createCareer', 'createTeam', 'createGameState', 'createKickLogRow', 'emptyKickerStats', 'validate', 'reindex'] },
  'data/blocklist': { ns: 'Data.blockedNicknames', type: 'array' },
  'data/names': { ns: 'Data.names', type: 'object' },
  'data/colleges': { ns: 'Data.colleges', type: 'array' },
  'data/nfl': { ns: 'Data.nfl', type: 'array' },
  'data/records': { ns: 'Data.records', type: 'object' },
  'data/awards': { ns: 'Data.awards', type: 'any' },
  'data/events': { ns: 'Data.events', type: 'any' },
  'data/headlines': { ns: 'Data.headlines', type: 'any' },
  'engine/names': { ns: 'Names', fns: ['player', 'coach', 'reporter', 'legend', 'hometown', 'unique'] },
  'engine/weather': { ns: 'Weather', fns: ['forGame', 'perKick', 'monthFor'] },
  'engine/player': { ns: 'Player', fns: ['create', 'ovr', 'fameTier', 'ageMult', 'costToRaise', 'spendXp', 'applyTraining', 'weeklyTick', 'updateJobSecurity', 'applyKickMeters', 'ageTick', 'rollInjury', 'addMod', 'expireMods', 'modValue', 'effectiveAttrs'] },
  'engine/kick': { ns: 'Kick', fns: ['buildContext', 'model', 'aiInput', 'resolve', 'resolveKickoff', 'pMakeAt', 'feedbackFor'] },
  'engine/schedule': { ns: 'Schedule', fns: ['college', 'nfl', 'weeksFor', 'gamesInWeek'] },
  'engine/standings': { ns: 'Standings', fns: ['compute', 'rankings', 'conferenceChampionshipGames', 'playoffField', 'bowls', 'nflPlayoffField', 'advanceBracket', 'draftOrder'] },
  'engine/sim': { ns: 'Sim', fns: ['startGame', 'step', 'simToNextUserKick', 'applyKick', 'applyKickoff', 'autoResolvePending', 'finishGame', 'simAiGame', 'driveLogLine'] },
  'engine/stats': { ns: 'Stats', fns: ['recordKick', 'recordGame', 'recordAiKick', 'finishSeason', 'rebuildSplits', 'bucketOf', 'checkRecords', 'topMoments', 'grade', 'seasonFgPct', 'careerLine', 'compareToLegends'] },
  'engine/awards': { ns: 'Awards', fns: ['compute', 'weekly', 'hofScore', 'seasonGoals', 'checkGoals'] },
  'engine/events': { ns: 'Events', fns: ['roll', 'apply', 'force', 'headline', 'message', 'markRead', 'renderText'] },
  'engine/contracts': { ns: 'Contracts', fns: ['marketValue', 'rookieDeal', 'tagValue', 'teamSatisfaction', 'extensionOffer', 'generateOffers', 'counter', 'applyTag', 'cutCheck', 'sign', 'payoutSeason', 'teamsNeedingK'] },
  'engine/draft': { ns: 'Draft', fns: ['combineSession', 'scoreCombine', 'draftValue', 'projection', 'run', 'tryout'] },
  'engine/season': { ns: 'Season', fns: ['start', 'beginRegular', 'userGameRef', 'simOtherGames', 'endWeek', 'startPostseason', 'postseasonWeek', 'finishSeason', 'offseason', 'advanceYear'] },
  'engine/career': { ns: 'Career', fns: ['showcaseSession', 'finishShowcase', 'generateCollegeOffers', 'decide', 'campBattle', 'finishSession', 'offseasonChain', 'changeTeam', 'handleActions', 'enterDraft', 'runDraft', 'enterNfl', 'retire', 'stageInfo'] },
  'engine/save': { ns: 'Save', fns: ['serialize', 'deserialize', 'migrate', 'exportString', 'importString', 'slotSummary'] },
  'engine/api': { ns: 'Engine', fns: ['newCareer', 'train', 'spendXp', 'startUserGame', 'simStep', 'simToKick', 'applyUserKick', 'autoKick', 'applyUserKickoff', 'finishUserGame', 'endWeek', 'chooseEvent', 'sessionKick', 'decide', 'nextPhase', 'autoPlayGame', 'autoPlayWeek', 'autoPlaySeason', 'autoPlayOffseason', 'autoPlayCareer', 'save', 'load'] }
};

const RTG = load();

for (const name of Object.keys(CONTRACT)) {
  const c = CONTRACT[name];
  test('§3.5 namespace ' + c.ns + ' (' + name + ')', (t) => {
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

test('Tuning is a plain mutable object with a defaults factory (debug.tune contract)', () => {
  assert.equal(typeof RTG.TuningDefaults, 'function');
  assert.ok(!Object.isFrozen(RTG.Tuning));
  const before = RTG.Tuning.kick.geometry.H;
  RTG.Tuning.kick.geometry.H = 9;
  assert.equal(RTG.Tuning.kick.geometry.H, 9);
  RTG.Tuning.kick.geometry.H = before;
  const fresh = RTG.TuningDefaults();
  assert.equal(fresh.kick.geometry.H, before);
  assert.notEqual(fresh, RTG.Tuning);
  assert.notEqual(fresh.kick, RTG.Tuning.kick);
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
