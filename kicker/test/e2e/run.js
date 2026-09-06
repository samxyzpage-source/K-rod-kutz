#!/usr/bin/env node
/**
 * Playwright e2e runner: starts the static http server, runs every kicker/test/e2e/*.spec.js in its own Node
 * process (like kicker/test/run.js), stops the server, exits non-zero when any spec fails.
 *
 *   /opt/node22/bin/node kicker/test/e2e/run.js            # every spec
 *   /opt/node22/bin/node kicker/test/e2e/run.js boot save  # only specs whose name contains one of the args
 *   RTG_PORT=8081 node kicker/test/e2e/run.js              # another port
 *
 * Each spec uses node:test + node:assert/strict and is also runnable directly: node kicker/test/e2e/boot.spec.js
 * (the harness starts its own server when none is listening). When RTG_PORT is already taken by a server that
 * serves /kicker/ (another engineer's spec run), that server is reused; otherwise the next free port is used.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const H = require('./_harness');

const DIR = __dirname;
const args = process.argv.slice(2);
const filters = args.filter(a => !a.startsWith('--'));

const files = fs.readdirSync(DIR)
  .filter(f => f.endsWith('.spec.js'))
  .sort()
  .filter(f => filters.length === 0 || filters.some(x => f.includes(x)));

if (files.length === 0) {
  console.log('e2e/run.js: no spec files matched');
  process.exit(0);
}

/** Start our server on H.PORT; when the port is busy, reuse the server there if it serves the app, else try the next ports. */
async function serverFor() {
  const http = require('http');
  const probe = port => new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: '/kicker/index.html', timeout: 1500 }, res => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
  for (let port = H.PORT; port < H.PORT + 10; port++) {
    try { return await H.startServer(port); }
    catch (err) {
      if (err.code !== 'EADDRINUSE') throw err;
      if (await probe(port)) { console.log('e2e/run.js: reusing the server already listening on ' + port); return { port, external: true, close: async () => {} }; }
    }
  }
  throw new Error('no free port in ' + H.PORT + '-' + (H.PORT + 9));
}

(async () => {
  const srv = await serverFor().catch(err => { console.error('e2e/run.js: could not start the http server: ' + err.message); process.exit(2); });
  console.log('e2e/run.js: http://127.0.0.1:' + srv.port + '/kicker/ · ' + files.length + ' spec(s)');
  let failed = 0;
  const started = Date.now();
  for (const f of files) {
    const t0 = Date.now();
    // async spawn: the parent's event loop must keep serving http while the child runs
    const status = await new Promise(resolve => {
      const child = spawn(process.execPath, [path.join(DIR, f)], {
        stdio: 'inherit',
        env: Object.assign({}, process.env, { RTG_PORT: String(srv.port) })
      });
      child.on('exit', code => resolve(code));
      child.on('error', () => resolve(1));
    });
    const ok = status === 0;
    if (!ok) failed++;
    console.log((ok ? 'PASS ' : 'FAIL ') + f + ' (' + (Date.now() - t0) + ' ms)');
  }
  await srv.close();
  console.log('\n' + (files.length - failed) + '/' + files.length + ' e2e spec files passed in ' + (Date.now() - started) + ' ms');
  process.exit(failed ? 1 : 0);
})();
