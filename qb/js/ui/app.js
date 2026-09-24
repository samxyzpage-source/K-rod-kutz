/**
 * Road to Glory: QB — app shell boot (the kicker's app.js reduced to the demo: no chrome, no router).
 *
 * Builds the singleton store (RTG.UI.store), mounts a minimal screen switcher into #app ('title' → 'moment' →
 * 'summary'), applies the accessibility body classes from the settings, routes resize (debounced 100 ms) and keys
 * to the live screen, opens the settings modal (Escape anywhere; the scene calls it too), reads ?seed= (and
 * ?arch= / ?team= / ?venue=) from the URL, and guards the engine: when RTG.Play or RTG.UI.PlayView is missing or
 * still a stub the page shows a plain 'engine not loaded' card instead of crashing.
 *
 *   RTG.UI.app.ready          → true once the first screen is mounted (the e2e harness waits on it)
 *   RTG.UI.app.screen()       → 'title' | 'moment' | 'summary' (| 'error' when the engine is missing)
 *   RTG.UI.app.go(id, params) → mount a screen (RTG.UI.Screens[id](store, params) → {el, destroy, onKey, onResize})
 *   RTG.UI.app.startDrive({seed, archetype, team, venue}) → store.newDrive + go('moment')
 *   RTG.UI.app.openSettings() · settingsOpen() · applySettings() · reducedMotion() · layout() · query() · engineStatus()
 *   RTG.UI.Shell = RTG.UI.app (the kit's name for it) · RTG.UI.boot() idempotent
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var doc = root.document;

  var app = RTG.UI.app = RTG.UI.app || {};
  var store = null;
  var els = {};
  var current = null;          // {id, screen}
  var settingsHandle = null;
  var resizeTimer = null;
  var booted = false;

  function C() { return RTG.UI.C; }
  function Screens() { return RTG.UI.Screens || {}; }

  app.ready = false;
  app.screen = function () { return current ? current.id : null; };
  app.current = function () { return current ? current.screen : null; };

  // ─────────────────────────── settings → body classes ───────────────────────────

  app.applySettings = function () {
    if (!store) return;
    var s = store.settings, targets = [doc.body, doc.documentElement];
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (!t) continue;
      t.classList.toggle('cb', !!s.colorblind);
      t.classList.toggle('hc', !!s.highContrast);
      t.classList.toggle('reduced-motion', !!s.reducedMotion);
      t.classList.toggle('font-scale-125', s.fontScale === 1.25);
      t.classList.toggle('font-scale-150', s.fontScale === 1.5);
      t.classList.toggle('left-handed', !!s.leftHanded);
      t.classList.toggle('no-tooltips', s.tooltips === false);
    }
    if (doc.body) doc.body.setAttribute('data-input-mode', 'draw');
    if (doc.body) doc.body.setAttribute('data-aim-assist', s.aimAssist === false ? '0' : '1');
  };

  /** Reduced motion is on when the setting says so or the OS asks for it. */
  app.reducedMotion = function () {
    if (store && store.settings.reducedMotion) return true;
    try { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  };

  // ─────────────────────────── layout ───────────────────────────

  app.isLandscape = function () { return root.innerHeight < 500 && root.innerWidth > root.innerHeight; };
  app.isDesktop = function () { return root.innerWidth >= 900; };
  app.layout = function () { return app.isDesktop() ? 'desktop' : (app.isLandscape() ? 'landscape' : 'portrait'); };

  function applyLayoutClasses() {
    var h = doc.documentElement;
    h.classList.toggle('is-landscape', app.isLandscape());
    h.classList.toggle('is-desktop', app.isDesktop());
    h.classList.toggle('is-phone', !app.isDesktop());
  }

  /** The URL query as {key: value} (decoded). */
  app.query = function () {
    var out = {}, q = root.location && typeof root.location.search === 'string' ? root.location.search.replace(/^\?/, '') : '';
    if (!q) return out;
    var parts = q.split('&');
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      var kv = parts[i].split('=');
      try { out[decodeURIComponent(kv[0])] = kv.length > 1 ? decodeURIComponent(kv.slice(1).join('=').replace(/\+/g, ' ')) : ''; } catch (e) { out[kv[0]] = kv[1] || ''; }
    }
    return out;
  };

  // ─────────────────────────── the engine guard ───────────────────────────

  /** {ok, missing: [what]} — is the engine / the scene really there (not the scaffold's no-op stubs)? */
  app.engineStatus = function () {
    var missing = [];
    var P = RTG.Play, PV = RTG.UI.PlayView, D = RTG.Data && RTG.Data.plays;
    var fns = ['buildContext', 'snap', 'live', 'resolve', 'driveScript', 'rating'];
    if (!P) missing.push('RTG.Play');
    else for (var i = 0; i < fns.length; i++) if (typeof P[fns[i]] !== 'function') missing.push('Play.' + fns[i]);
    if (!RTG.Field || typeof RTG.Field.create !== 'function') missing.push('RTG.Field');
    if (!D || !Array.isArray(D.plays) || !D.plays.length || !D.routes || !D.coverages) missing.push('Data.plays');
    if (!RTG.Tuning || !RTG.Tuning.qb || !RTG.Tuning.qb.archetypes || !RTG.Tuning.qb.demo) missing.push('Tuning.qb');
    if (!PV || typeof PV.mount !== 'function' || typeof PV.current !== 'function') missing.push('PlayView');
    if (!RTG.UI.PlayInput || typeof RTG.UI.PlayInput.create !== 'function') missing.push('PlayInput');
    if (!RTG.UI.Sprites || typeof RTG.UI.Sprites.get !== 'function') missing.push('Sprites');
    if (!missing.length && P && RTG.RNG) {
      // a stub returns nothing: the real driveScript returns the six situations
      try {
        var script = P.driveScript({ venue: 'COLLEGE' }, RTG.RNG.create(1));
        if (!Array.isArray(script) || !script.length) missing.push('Play.driveScript (stub)');
      } catch (e) { missing.push('Play.driveScript (' + (e.message || e) + ')'); }
    }
    return { ok: missing.length === 0, missing: missing };
  };

  function renderEngineMissing(status) {
    var c = C();
    var body = c.el('div', { class: 'stack' },
      c.el('p', { class: 'txt-red', text: 'ENGINE NOT LOADED' }),
      c.el('p', { class: 'small', text: 'The moment cannot start: ' + status.missing.join(', ') + ' — the play engine or the scene is missing or still a stub.' }),
      c.el('p', { class: 'small txt-grey', text: 'Check the script order in index.html (js/data/plays.js, js/engine/field.js, js/engine/play.js, js/ui/playinput.js, js/ui/playview.js) and the browser console.' }));
    var card = c.card({ title: 'ROAD TO GLORY: QB', kind: 'red', class: 'engine-missing', body: body });
    return c.el('div', { class: 'screen', 'data-error': 'engine' }, card);
  }

  // ─────────────────────────── the screen switcher ───────────────────────────

  app.go = function (id, params) {
    var c = C();
    var factory = Screens()[id];
    if (typeof factory !== 'function') throw new Error('app.go: unknown screen ' + id);
    var from = current ? current.id : null;
    if (current) {
      try { if (current.screen && typeof current.screen.destroy === 'function') current.screen.destroy(); }
      catch (e) { if (root.console) root.console.error('screen destroy failed', e); }
      current = null;
    }
    c.clear(els.host);
    c.hideTooltip();
    var screen;
    try { screen = factory(store, params || {}); }
    catch (e) {
      if (root.console) root.console.error('screen ' + id + ' failed to build', e);
      screen = { el: c.el('div', { class: 'screen' }, c.card({ title: 'SOMETHING BROKE', kind: 'red', body: c.el('p', { class: 'small', text: String(e && e.message || e) }), footer: c.button({ label: 'TITLE', kind: 'primary', onClick: function () { app.go('title'); } }) })), destroy: function () {} };
    }
    current = { id: id, screen: screen };
    if (id === 'moment' && from === 'title') {
      try { if (root.history && typeof root.history.pushState === 'function') root.history.pushState({ rtg: 'moment' }, ''); } catch (e) { /* ignore */ }
    }
    els.host.appendChild(screen.el);
    els.app.setAttribute('data-screen', id);
    els.app.classList.add('chromeless');
    doc.title = (id === 'moment' ? 'The Moment — ' : (id === 'summary' ? 'The Box Score — ' : '')) + 'Road to Glory: QB';
    try { root.scrollTo(0, 0); } catch (e) { /* ignore */ }
    return screen;
  };

  /**
   * Start a drive from the title / the summary: store.newDrive + the moment screen. The seed and the picks are
   * written into the URL (?seed=&arch=&team=&venue=; replaceState works on file:// and http), so a reload or a
   * forward lands on the same drive and the link reproduces it.
   */
  app.startDrive = function (opts) {
    var d = store.newDrive(opts || {});
    try {
      var q = '?seed=' + encodeURIComponent(d.seed) + '&arch=' + encodeURIComponent(d.archetype) + '&team=' + encodeURIComponent(d.team) + '&venue=' + encodeURIComponent(d.venue);
      if (root.history && typeof root.history.replaceState === 'function' && root.location) root.history.replaceState(root.history.state, '', root.location.pathname + q);
    } catch (e) { /* a host that refuses history keeps the drive anyway */ }
    return app.go('moment');
  };

  // ─────────────────────────── settings modal ───────────────────────────

  app.settingsOpen = function () { return !!settingsHandle; };
  app.openSettings = function () {
    if (settingsHandle) return settingsHandle;
    var S = Screens();
    if (typeof S.settingsModal !== 'function') return null;
    settingsHandle = S.settingsModal(store, { onClose: function () { settingsHandle = null; } });
    return settingsHandle;
  };
  app.closeSettings = function () { if (settingsHandle) settingsHandle.close(); };

  // ─────────────────────────── global handlers ───────────────────────────

  function onResize() {
    if (resizeTimer) root.clearTimeout(resizeTimer);
    resizeTimer = root.setTimeout(function () {
      resizeTimer = null;
      applyLayoutClasses();
      if (current && current.screen && typeof current.screen.onResize === 'function') {
        try { current.screen.onResize(); } catch (e) { if (root.console) root.console.error('onResize failed', e); }
      }
    }, 100);
  }

  function onKey(ev) {
    if (C().modalOpen()) return;
    var t = ev.target, tag = t && t.tagName;
    var sc = current && current.screen;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) {
      if (sc && sc.keysInFields === true && typeof sc.onKey === 'function' && sc.onKey(ev)) ev.preventDefault();
      return;
    }
    if (sc && typeof sc.onKey === 'function' && sc.onKey(ev)) { ev.preventDefault(); return; }
    // Escape → settings on every screen; the live scene handles it itself (onSettings) and stops the event, so only
    // a mounted PlayView is left alone — the DRIVE interstitial (no scene) gets the modal from here
    var PV = RTG.UI.PlayView, sceneLive = !!(PV && typeof PV.current === 'function' && PV.current());
    if (ev.key === 'Escape' && !ev.altKey && !ev.ctrlKey && !ev.metaKey && !ev.defaultPrevented && current && !sceneLive) {
      ev.preventDefault();
      app.openSettings();
    }
  }

  /**
   * The browser's back button (a phone's back gesture): entering the moment pushes one history entry, and popping
   * it returns to the title — a soft exit instead of leaving the page. The URL keeps ?seed= (startDrive), so
   * START reproduces the drive.
   */
  function onPopState() {
    if (!current || current.id === 'title' || current.id === 'error') return;
    try { app.go('title'); } catch (e) { if (root.console) root.console.error('popstate → title failed', e); }
  }

  function onStore(info) {
    if (info.fnName === 'settings') app.applySettings();
  }

  // ─────────────────────────── boot ───────────────────────────

  RTG.UI.boot = function () {
    if (booted) return store;
    booted = true;
    var c = C();
    var host = doc.getElementById('app');
    if (!host) { host = c.el('div', { id: 'app' }); doc.body.appendChild(host); }
    els.app = host;
    c.clear(host);
    host.classList.add('chromeless');
    els.host = c.el('main', { class: 'screen-host', id: 'screen-host' });
    host.appendChild(els.host);

    store = new RTG.UI.Store();
    RTG.UI.store = store;
    RTG.UI.uiRng = store.uiRng;
    RTG.UI.Shell = app;
    app.store = store;

    app.applySettings();
    applyLayoutClasses();
    if (RTG.UI.Palette && RTG.UI.Palette.setTeamVars) RTG.UI.Palette.setTeamVars(null);
    if (RTG.UI.Audio && typeof RTG.UI.Audio.init === 'function') RTG.UI.Audio.init(function () { return store.settings; });
    store.subscribe(onStore);

    root.addEventListener('resize', onResize);
    root.addEventListener('orientationchange', onResize);
    root.addEventListener('keydown', onKey);
    root.addEventListener('popstate', onPopState);

    var status = app.engineStatus();
    if (!status.ok) {
      current = { id: 'error', screen: { el: renderEngineMissing(status), destroy: function () {} } };
      els.host.appendChild(current.screen.el);
      host.setAttribute('data-screen', 'error');
      if (root.console) root.console.error('RTG QB: engine not loaded — ' + status.missing.join(', '));
    } else {
      app.go('title');
    }
    app.ready = true;
    return store;
  };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', function () { RTG.UI.boot(); });
  else RTG.UI.boot();
})(typeof window !== 'undefined' ? window : globalThis);
