#!/usr/bin/env node
/**
 * Test runner: runs every kicker/test/*.test.js in its own Node process.
 *
 *   node kicker/test/run.js             # fast suite (skips files tagged [balance])
 *   node kicker/test/run.js --balance   # everything, including slow statistical tests
 *   node kicker/test/run.js kick rng    # only files whose name contains one of the args
 *
 * A test file is "tagged [balance]" when the literal string "[balance]" appears
 * in its first 40 lines. Each test file uses node:test + node:assert/strict and
 * is also runnable directly:  node kicker/test/kick.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DIR = __dirname;
const args = process.argv.slice(2);
const balance = args.includes('--balance');
const filters = args.filter(a => !a.startsWith('--'));

const files = fs.readdirSync(DIR)
  .filter(f => f.endsWith('.test.js'))
  .sort()
  .filter(f => filters.length === 0 || filters.some(x => f.includes(x)))
  .filter(f => {
    if (balance) return true;
    const head = fs.readFileSync(path.join(DIR, f), 'utf8').split('\n').slice(0, 40).join('\n');
    return !head.includes('[balance]');
  });

if (files.length === 0) {
  console.log('run.js: no test files matched');
  process.exit(0);
}

let failed = 0;
const started = Date.now();
for (const f of files) {
  const t0 = Date.now();
  const res = spawnSync(process.execPath, [path.join(DIR, f)], {
    stdio: 'inherit',
    env: Object.assign({}, process.env, { RTG_BALANCE: balance ? '1' : '' }),
  });
  const ms = Date.now() - t0;
  const ok = res.status === 0;
  if (!ok) failed++;
  console.log((ok ? 'PASS ' : 'FAIL ') + f + ' (' + ms + ' ms)');
}
console.log('\n' + (files.length - failed) + '/' + files.length + ' test files passed in ' + (Date.now() - started) + ' ms');
process.exit(failed ? 1 : 0);
