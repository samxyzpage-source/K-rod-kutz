/**
 * Playwright harness for the Road to Glory: QB e2e specs. Dev-only; the game never depends on npm.
 *
 *   const H = require('./_harness');
 *   const app = await H.openApp({ mode: 'file' | 'http', viewport: 'phone' | 'desktop' | 'landscape' | {width, height},
 *                                 seed, query, hasTouch, isMobile, dpr, debug, blockFonts, reducedMotion });
 *   app.page · app.errors (console errors + page errors, minus the 404s of scripts that do not exist yet)
 *   · app.foreignErrors (errors raised inside the scene agent's files, printed and kept apart) · await app.close()
 *   const app = await H.openDemo({ mode, viewport, seed })     → openApp with ?seed=<seed>; resolves once RTG.UI.app.ready
 *   await H.openDemo(page, mode, viewport, { seed })            → re-navigates an EXISTING page to the demo (same wait) → {page, url}
 *   await H.waitReady(page)                                     → resolves when RTG.UI.app.ready is true
 *   await H.waitForScreen(page, 'moment')                       → resolves when RTG.UI.app.screen() === id
 *   await H.waitPhase(page, 'READ', timeout)                    → resolves when RTG.UI.PlayView.current().phase() === phase
 *   await H.sleep(ms)                                           → a plain real-time wait
 *   await H.debug(page, 'current')                              → page.evaluate on RTG.debug[fn](...args) (JSON-serialisable)
 *   await H.shot(page, 'read_phone')                            → test/e2e/shots/<name>.png
 *   await H.noHorizontalScroll(page)                            → asserts scrollWidth <= innerWidth
 *   await H.clickButton(page, 'START THE DRIVE')                → click a button by its visible label
 *   H.MODES · H.VIEWPORTS · H.matrix(fn)                        → runs fn({mode, vp}) for every mode × viewport
 *   await H.closeBrowser()                                      → call from an `after` hook
 *   H.startServer(port) / H.ensureServer()                      → static server for the http mode (run.js starts one for all specs)
 *
 * The static server serves the REPO ROOT (so /qb/index.html resolves like GitHub Pages and the kicker's specs
 * can share a port). The Chromium binary is the preinstalled one (/opt/pw-browsers); Playwright 1.56 from /opt/node22.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const assert = require('node:assert/strict');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const E2E = __dirname;
const QB = path.resolve(E2E, '..', '..');          // qb/
const ROOT = path.resolve(QB, '..');               // the repo root
const SHOTS = path.join(E2E, 'shots');
let PORT = Number(process.env.RTG_PORT || 8080);   // may move to a free port when the shared one is unusable

const MODES = ['file', 'http'];
const VIEWPORTS = {
  phone: { width: 390, height: 844, hasTouch: true, isMobile: true },
  desktop: { width: 1280, height: 800, hasTouch: false, isMobile: false },
  landscape: { width: 844, height: 390, hasTouch: true, isMobile: true },
  narrow: { width: 320, height: 568, hasTouch: true, isMobile: true },
  tablet: { width: 768, height: 1024, hasTouch: true, isMobile: false }
};

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8'
};

let server = null;

/** Tiny static server for ROOT (the repo root, so /qb/ resolves like GitHub Pages). */
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
    const req = http.get({ host: '127.0.0.1', port, path: '/qb/index.html', timeout: 1500 }, res => { res.resume(); resolve(res.statusCode === 200); });
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
  if (mode === 'file') return 'file://' + path.join(QB, 'index.html') + q;
  return 'http://127.0.0.1:' + PORT + '/qb/' + q;
}

/** `query` plus `seed=<seed>` (and `debug=1`) as one query string. */
function buildQuery(opts) {
  let query = opts.query || '';
  if (opts.seed !== undefined && opts.seed !== null) query += (query ? '&' : '') + 'seed=' + encodeURIComponent(String(opts.seed));
  if (opts.debug) query += (query ? '&' : '') + 'debug=1';
  return query;
}

/** Basenames of the <script src> / stylesheet files of index.html that do not exist on disk yet (their 404s are expected). */
function missingScripts() {
  const html = fs.readFileSync(path.join(QB, 'index.html'), 'utf8');
  const out = [];
  const re = /<(?:script src|link rel="stylesheet" href)="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    if (/^https?:/.test(m[1])) continue;
    if (!fs.existsSync(path.join(QB, m[1]))) out.push(m[1]);
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

/** Files owned by the scene agent: their errors are collected separately (app.foreignErrors). */
const FOREIGN_RE = /ui\/(?:sprites|canvas|audio|playinput|playview)\.js/;

/** Resolves when the shell has mounted its first screen (RTG.UI.app.ready). */
function waitReady(page, timeout) {
  return page.waitForFunction(() => !!(window.RTG && RTG.UI && RTG.UI.app && RTG.UI.app.ready === true), null, { timeout: timeout || 20000 });
}

/**
 * Open the app. Returns {page, context, errors, foreignErrors, url, mode, vp, close()}. `errors` collects console
 * errors and page errors from the shell / engine, excluding "Failed to load resource" lines for scripts/styles that
 * are not written yet; errors raised inside the scene agent's files go to `foreignErrors` (printed, not asserted here).
 */
async function openApp(opts) {
  opts = opts || {};
  const mode = opts.mode || 'file';
  if (mode === 'http') await ensureServer();
  const vp = typeof opts.viewport === 'string' ? VIEWPORTS[opts.viewport] : (opts.viewport || VIEWPORTS.desktop);
  if (!vp) throw new Error('openApp: unknown viewport ' + opts.viewport);
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
    if (FOREIGN_RE.test(line)) { foreignErrors.push(line); console.log('  [foreign error, scene file] ' + line.split('\n')[0].slice(0, 160)); }
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
  const query = buildQuery(opts);
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
  await waitReady(page);
  return { page, context, errors, foreignErrors, url, mode, vp, close: () => context.close() };
}

/**
 * Open the demo with a seed. Two forms:
 *   H.openDemo({ mode, viewport, seed, ...openApp opts })  → a new app handle (openApp with ?seed=)
 *   H.openDemo(page, mode, viewport, { seed, query })      → navigates an existing page to qb/index.html?seed=…
 *                                                            and waits for RTG.UI.app.ready → {page, url}
 * (`viewport` is ignored in the page form — the page's context already has one.)
 */
async function openDemo(a, mode, viewport, extra) {
  if (a && typeof a.goto === 'function') {
    const page = a;
    extra = extra || {};
    mode = mode || 'file';
    if (mode === 'http') await ensureServer();
    const url = urlFor(mode, buildQuery(extra));
    await page.goto(url, { waitUntil: 'load' });
    await waitReady(page);
    return { page, url, mode, vp: viewport };
  }
  return openApp(Object.assign({}, a || {}));
}

/** page.evaluate(RTG.debug[fn](...args)); the result must be JSON-serialisable. */
function debug(page, fn, ...args) {
  return page.evaluate(([f, a]) => {
    const r = RTG.debug[f].apply(RTG.debug, a);
    return r === undefined ? null : JSON.parse(JSON.stringify(r));
  }, [fn, args]);
}

/** Resolves when the live screen is `id` (RTG.UI.app.screen()). */
function waitForScreen(page, id, timeout) {
  return page.waitForFunction(wanted => {
    const A = window.RTG && RTG.UI && RTG.UI.app;
    return !!A && typeof A.screen === 'function' && A.screen() === wanted;
  }, id, { timeout: timeout || 10000 });
}

/** The id of the live screen. */
function screenId(page) {
  return page.evaluate(() => { const A = RTG.UI.app; return A && typeof A.screen === 'function' ? A.screen() : null; });
}

/** Resolves when the live PlayView's phase is `phase` (v2: SITUATION · READ · PLAY · RUN · RESULT · DONE). */
function waitPhase(page, phase, timeout) {
  return page.waitForFunction(p => {
    const PV = window.RTG && RTG.UI && RTG.UI.PlayView;
    const v = PV && typeof PV.current === 'function' ? PV.current() : null;
    return !!v && typeof v.phase === 'function' && v.phase() === p;
  }, phase, { timeout: timeout || 8000 });
}

/** A plain timer (real ms). */
function sleep(ms) { return new Promise(r => setTimeout(r, Math.max(0, ms || 0))); }

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

module.exports = {
  QB, ROOT, SHOTS, MODES, VIEWPORTS,
  get PORT() { return PORT; },
  startServer, ensureServer, urlFor, missingScripts, getBrowser, closeBrowser,
  openApp, openDemo, waitReady, debug, waitForScreen, screenId, waitPhase, shot, noHorizontalScroll, clickButton, matrix, assert, sleep
};
