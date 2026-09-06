/**
 * Playwright harness for the Road to Glory: Kicker e2e specs (SPEC §5.2). Dev-only; the game never depends on npm.
 *
 *   const H = require('./_harness');
 *   const app = await H.openApp({ mode: 'file' | 'http', viewport: 'phone' | 'desktop' | 'landscape' | {width, height},
 *                                 hasTouch, debug, blockFonts, query });
 *   app.page · app.errors (console errors + page errors, minus the 404s of scripts that do not exist yet) · await app.close()
 *   await H.debug(page, 'getState')                 → page.evaluate on RTG.debug[fn](...args)
 *   await H.waitForScreen(page, 'saves')            → resolves when Router.current() is the id (or its _fallback)
 *   await H.shot(page, 'title_phone')               → test/e2e/shots/<name>.png
 *   await H.noHorizontalScroll(page)                → asserts scrollWidth <= innerWidth
 *   H.MODES · H.VIEWPORTS · H.matrix(fn)            → runs fn({mode, vp}) for every mode × viewport
 *   await H.closeBrowser()                          → call from an `after` hook
 *   H.startServer(port) / H.ensureServer()          → static server for the http mode (run.js starts one for all specs)
 *
 * The Chromium binary is the preinstalled one (/opt/pw-browsers); Playwright 1.56 from /opt/node22.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const assert = require('node:assert/strict');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const E2E = __dirname;
const KICKER = path.resolve(E2E, '..', '..');
const ROOT = path.resolve(KICKER, '..');
const SHOTS = path.join(E2E, 'shots');
let PORT = Number(process.env.RTG_PORT || 8080);   // may move to a free port when the shared one is unusable

const MODES = ['file', 'http'];
const VIEWPORTS = {
  phone: { width: 390, height: 844, hasTouch: true, isMobile: true },
  desktop: { width: 1280, height: 800, hasTouch: false, isMobile: false },
  landscape: { width: 844, height: 390, hasTouch: true, isMobile: true },
  tablet: { width: 768, height: 1024, hasTouch: true, isMobile: false }
};

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8'
};

let server = null;

/** Tiny static server for ROOT (the repo root, so /kicker/ resolves like GitHub Pages). */
function startServer(port) {
  port = port || PORT;
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent((req.url || '/').split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.normalize(path.join(ROOT, p));
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('File not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(data);
      });
    });
    srv.on('error', reject);
    srv.listen(port, '127.0.0.1', () => resolve({ port, close: () => new Promise(r => srv.close(r)) }));
  });
}

function probe(port) {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: '/kicker/index.html', timeout: 1500 }, res => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

/** Start our own server on `from` or the next free port (a shared 8080 held by another process is not trusted). */
async function startOwnServer(from) {
  let lastErr = null;
  for (let port = from; port < from + 20; port++) {
    try { const s = await startServer(port); PORT = port; return s; }
    catch (err) { lastErr = err; if (err.code !== 'EADDRINUSE') throw err; }
  }
  throw lastErr || new Error('no free port from ' + from);
}

/** Use the runner's server when it is up (RTG_PORT), else start one in-process (specs run standalone). */
async function ensureServer() {
  if (server) return server;
  if (await probe(PORT)) { server = { port: PORT, external: true, close: async () => {} }; return server; }
  server = await startOwnServer(PORT);
  return server;
}

/** The external server went away mid-run: forget it and start our own on a free port. */
async function replaceServer() {
  if (server && !server.external) { try { await server.close(); } catch (e) { /* ignore */ } }
  server = await startOwnServer(PORT);
  return server;
}

function urlFor(mode, query) {
  const q = query ? (query.startsWith('?') ? query : '?' + query) : '';
  if (mode === 'file') return 'file://' + path.join(KICKER, 'index.html') + q;
  return 'http://127.0.0.1:' + PORT + '/kicker/' + q;
}

/** Basenames of the <script src> files of index.html that do not exist on disk yet (their 404s are expected). */
function missingScripts() {
  const html = fs.readFileSync(path.join(KICKER, 'index.html'), 'utf8');
  const out = [];
  const re = /<(?:script src|link rel="stylesheet" href)="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    if (/^https?:/.test(m[1])) continue;
    if (!fs.existsSync(path.join(KICKER, m[1]))) out.push(m[1]);
  }
  return out;
}

let browser = null;
async function getBrowser() {
  if (!browser) browser = await chromium.launch();
  return browser;
}
async function closeBrowser() {
  if (browser) { await browser.close(); browser = null; }
  if (server && !server.external) { await server.close(); server = null; }
}

/** Files owned by the kick-scene engineer (U2): their errors are collected separately (app.foreignErrors). */
const FOREIGN_RE = /(?:ui\/(?:sprites|canvas|audio|input|kickview)\.js|screens\/(?:showcase|game|kick|combine|campbattle|practice)\.js)|screen factory failed \((?:showcase|game|kick|combine|campbattle|practice)\)/;

/**
 * Open the app. Returns {page, context, errors, foreignErrors, url, close()}. `errors` collects console errors and
 * page errors from the shell / engine, excluding "Failed to load resource" lines for scripts/styles that are not
 * written yet; errors raised inside U2's kick-scene files go to `foreignErrors` (printed, not asserted here).
 */
async function openApp(opts) {
  opts = opts || {};
  const mode = opts.mode || 'file';
  if (mode === 'http') await ensureServer();
  const vp = typeof opts.viewport === 'string' ? VIEWPORTS[opts.viewport] : (opts.viewport || VIEWPORTS.desktop);
  const b = await getBrowser();
  const context = await b.newContext({
    viewport: { width: vp.width, height: vp.height },
    hasTouch: opts.hasTouch !== undefined ? !!opts.hasTouch : !!vp.hasTouch,
    isMobile: opts.isMobile !== undefined ? !!opts.isMobile : !!vp.isMobile,
    deviceScaleFactor: opts.dpr || 1,
    reducedMotion: opts.reducedMotion || 'no-preference'
  });
  const page = await context.newPage();
  const errors = [];
  const foreignErrors = [];
  const allowed = missingScripts();
  function record(text, url) {
    const line = text + (url ? ' @ ' + url : '');
    if (FOREIGN_RE.test(line)) { foreignErrors.push(line); console.log('  [foreign error, U2 file] ' + line.split('\n')[0].slice(0, 160)); }
    else errors.push(line);
  }
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const loc = msg.location() || {};
    const url = loc.url || '';
    const text = msg.text();
    if (/Failed to load resource|ERR_FILE_NOT_FOUND/.test(text) && allowed.some(f => url.endsWith(f) || url.endsWith(f.replace(/^\.\//, '')))) return;
    if (/Failed to load resource/.test(text) && /fonts\.(googleapis|gstatic)/.test(url)) return;   // fonts blocked / offline
    record(text, url);
  });
  page.on('pageerror', e => record('pageerror: ' + (e && e.message ? e.message : String(e)) + (e && e.stack ? '\n' + e.stack : ''), ''));
  if (opts.blockFonts) await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  let query = opts.query || '';
  if (opts.debug) query += (query ? '&' : '') + 'debug=1';
  let url = urlFor(mode, query);
  try { await page.goto(url, { waitUntil: 'load' }); }
  catch (err) {
    // http only: the shared server died between specs → serve it ourselves on a free port and retry once
    if (mode !== 'http' || !/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE/.test(String(err && err.message))) throw err;
    console.log('  [harness] http server unreachable (' + url + ') — starting our own and retrying');
    await replaceServer();
    url = urlFor(mode, query);
    await page.goto(url, { waitUntil: 'load' });
  }
  await page.waitForFunction(() => window.RTG && RTG.UI && RTG.UI.store && RTG.UI.Router && RTG.UI.Router.current(), null, { timeout: 20000 });
  return { page, context, errors, foreignErrors, url, mode, vp, close: () => context.close() };
}

/** page.evaluate(RTG.debug[fn](...args)); the result must be JSON-serialisable. */
function debug(page, fn, ...args) {
  return page.evaluate(([f, a]) => {
    const r = RTG.debug[f].apply(RTG.debug, a);
    return r === undefined ? null : JSON.parse(JSON.stringify(r));
  }, [fn, args]);
}

/** Resolves when the live screen is `id` (or the _fallback standing in for it). */
function waitForScreen(page, id, timeout) {
  return page.waitForFunction(wanted => {
    const R = RTG.UI.Router;
    const cur = R.current();
    if (cur === wanted) return true;
    return cur === '_fallback' && R.params() && R.params().wanted === wanted;
  }, id, { timeout: timeout || 10000 });
}

/** The id the live screen stands for ('showcase' even when the _fallback renders it). */
function screenId(page) {
  return page.evaluate(() => {
    const R = RTG.UI.Router;
    const cur = R.current();
    return cur === '_fallback' && R.params() && R.params().wanted ? R.params().wanted : cur;
  });
}

async function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const file = path.join(SHOTS, name + '.png');
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function noHorizontalScroll(page, label) {
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, bw: document.body.scrollWidth }));
  assert.ok(m.sw <= m.iw && m.bw <= m.iw, (label || '') + ' horizontal overflow: scrollWidth ' + m.sw + ' / body ' + m.bw + ' > innerWidth ' + m.iw);
  return m;
}

/** Click a button by its visible label (case-insensitive, exact match on the label span). */
async function clickButton(page, label, scope) {
  const root = scope || page;
  const loc = root.locator('button', { hasText: new RegExp('^\\s*' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i') }).first();
  await loc.waitFor({ state: 'visible', timeout: 10000 });
  await loc.click();
  return loc;
}

/** Run fn({mode, vp}) for every mode × viewport (default: MODES × phone + desktop). */
function matrix(fn, modes, vps) {
  const out = [];
  for (const mode of modes || MODES) for (const vp of vps || ['phone', 'desktop']) out.push(fn({ mode, vp }));
  return out;
}

function stripVolatile(state) {
  const s = JSON.parse(JSON.stringify(state));
  delete s.playtimeSec;
  return s;
}

module.exports = {
  KICKER, ROOT, SHOTS, MODES, VIEWPORTS,
  get PORT() { return PORT; },
  startServer, ensureServer, urlFor, missingScripts, getBrowser, closeBrowser,
  openApp, debug, waitForScreen, screenId, shot, noHorizontalScroll, clickButton, matrix, stripVolatile, assert
};
