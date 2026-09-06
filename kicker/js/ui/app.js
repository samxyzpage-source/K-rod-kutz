/**
 * Road to Glory: Kicker — app shell boot (SPEC §4.3 / §4.4 / §4.8, UI_API.md §Shell).
 *
 * Builds the singleton store (RTG.UI.store), mounts the router into #app, renders the chrome around the screens
 * (sticky top bar · desktop left-rail nav · desktop right rail · phone bottom tab bar · MORE sheet), applies the
 * accessibility body classes from settings, routes resize (debounced 100 ms) and keys to the live screen,
 * autosaves on visibilitychange / pagehide, opens the generic EVENT modal, and mounts the debug panel with ?debug=1.
 *
 *   RTG.UI.uiRng            — the cosmetics RNG (same instance as store.uiRng)
 *   RTG.UI.Shell            — {applySettings(), setChrome(), openMore(), openEventModal(event), isLandscape(), layout()}
 *   RTG.UI.boot()           — idempotent boot (called on DOMContentLoaded / immediately when the DOM is ready)
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var doc = root.document;

  var Shell = {};
  var store = null;
  var els = {};
  var openEvent = null;       // {key, handle} of the live event modal
  var resizeTimer = null;
  var booted = false;

  function C() { return RTG.UI.C; }
  function Router() { return RTG.UI.Router; }

  // ─────────────────────────── settings → body classes ───────────────────────────

  Shell.applySettings = function () {
    var s = store.settings, b = doc.body, h = doc.documentElement;
    var targets = [b, h];
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      t.classList.toggle('cb', !!s.colorblind);
      t.classList.toggle('hc', !!s.highContrast);
      t.classList.toggle('reduced-motion', !!s.reducedMotion);
      t.classList.toggle('font-scale-125', s.fontScale === 1.25);
      t.classList.toggle('font-scale-150', s.fontScale === 1.5);
      t.classList.toggle('left-footed', !!s.leftFooted);
      t.classList.toggle('no-tooltips', s.tooltips === false);
    }
    b.setAttribute('data-input-mode', s.inputMode || 'flick');
  };

  /** Reduced motion is on when the setting says so or the OS asks for it. */
  Shell.reducedMotion = function () {
    if (store && store.settings.reducedMotion) return true;
    try { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  };

  // ─────────────────────────── layout ───────────────────────────

  Shell.isLandscape = function () { return root.innerHeight < 500 && root.innerWidth > root.innerHeight; };
  Shell.isDesktop = function () { return root.innerWidth >= 900; };
  Shell.layout = function () { return Shell.isDesktop() ? 'desktop' : (Shell.isLandscape() ? 'landscape' : 'portrait'); };

  function applyLayoutClasses() {
    var h = doc.documentElement;
    h.classList.toggle('is-landscape', Shell.isLandscape());
    h.classList.toggle('is-desktop', Shell.isDesktop());
    h.classList.toggle('is-phone', !Shell.isDesktop());
  }

  // ─────────────────────────── chrome ───────────────────────────

  var TABS = [
    { id: 'hub', label: 'HOME', icon: 'home' },
    { id: 'team', label: 'TEAM', icon: 'team' },
    { id: 'training', label: 'TRAIN', icon: 'train' },
    { id: 'stats', label: 'STATS', icon: 'stats' },
    { id: 'more', label: 'MORE', icon: 'more' }
  ];
  var MORE_ITEMS = [
    { id: 'schedule', label: 'Schedule', icon: 'clock' },
    { id: 'standings', label: 'Standings', icon: 'flag' },
    { id: 'records', label: 'Records', icon: 'trophy' },
    { id: 'timeline', label: 'Timeline', icon: 'star' },
    { id: 'inbox', label: 'Inbox', icon: 'envelope' },
    { id: 'saves', label: 'Saves', icon: 'save' },
    { id: 'settings', label: 'Settings', icon: 'gear' },
    { id: 'practice', label: 'Practice', icon: 'ball' }
  ];
  var MORE_SET = {};
  MORE_ITEMS.forEach(function (m) { MORE_SET[m.id] = 1; });

  function activeTab(screenId) {
    if (!screenId) return null;
    if (screenId === 'hub' || screenId === 'postgame' || screenId === 'game') return 'hub';
    if (screenId === 'team' || screenId === 'training' || screenId === 'stats') return screenId;
    if (MORE_SET[screenId]) return 'more';
    return null;
  }

  function nav(id) {
    var R = Router();
    if (R.current() === id) return;
    R.go(id, {});
  }

  function buildTabbar() {
    var c = C();
    var bar = c.el('nav', { class: 'tabbar', 'aria-label': 'Main' });
    TABS.forEach(function (t) {
      var b = c.el('button', { class: 'tab-btn', type: 'button', 'data-tab': t.id, 'aria-label': t.label, onClick: function () { if (t.id === 'more') Shell.openMore(); else nav(t.id); } });
      b.appendChild(c.icon(t.icon, 14));
      b.appendChild(c.el('span', { class: 'tab-label', text: t.label }));
      bar.appendChild(b);
    });
    return bar;
  }

  function buildRailLeft() {
    var c = C();
    var rail = c.el('nav', { class: 'rail rail-left', 'aria-label': 'Sections' });
    rail.appendChild(c.el('div', { class: 'rail-logo', text: 'RTG: KICKER' }));
    TABS.slice(0, 4).concat(MORE_ITEMS).forEach(function (t) {
      var b = c.el('button', { class: 'rail-btn', type: 'button', 'data-nav': t.id, onClick: function () { nav(t.id); } });
      b.appendChild(c.icon(t.icon, 12));
      b.appendChild(c.el('span', { text: t.label.toUpperCase() }));
      rail.appendChild(b);
    });
    rail.appendChild(c.el('div', { class: 'rail-foot small txt-grey', text: 'v' + (RTG.VERSION || '?') }));
    return rail;
  }

  function buildRailRight() {
    var c = C();
    return c.el('aside', { class: 'rail rail-right', 'aria-label': 'Ticker and meters' });
  }

  function buildTopbar() {
    var c = C();
    return c.el('header', { class: 'topbar', role: 'banner' });
  }

  Shell.openMore = function () {
    var c = C();
    var body = c.el('div', { class: 'more-grid' });
    var h;
    MORE_ITEMS.forEach(function (m) {
      body.appendChild(c.button({ label: m.label.toUpperCase(), icon: m.icon, kind: 'secondary', block: true, onClick: function () { h.close(); nav(m.id); } }));
    });
    body.appendChild(c.button({ label: 'TITLE SCREEN', icon: 'arrow-l', kind: 'ghost', block: true, onClick: function () {
      h.close();
      c.confirm({ title: 'Back to the title?', text: 'Your career is autosaved. You can continue any time.', okLabel: 'TITLE' })
        .onOk(function () { store.autosave(); store.clear(); });
    } }));
    h = c.modal({ title: 'MORE', body: body, class: 'sheet', closable: true });
    return h;
  };

  function recordText(state) {
    var p = state.player;
    var res = state.season && state.season.results && p.teamId ? state.season.results[p.teamId] : null;
    if (!res) return '';
    return RTG.Standings && RTG.Standings.recordString ? RTG.Standings.recordString(res) : (res.w + '-' + res.l);
  }

  function renderTopbar() {
    var c = C(), top = els.topbar, state = store.state;
    c.clear(top);
    if (!state) return;
    var p = state.player, team = RTG.Schema && RTG.Schema.userTeam ? RTG.Schema.userTeam(state) : null;
    var left = c.el('button', { class: 'topbar-team', type: 'button', 'aria-label': 'Team', onClick: function () { nav('team'); } });
    left.appendChild(c.crest(team || null, 24));
    left.appendChild(c.el('span', { class: 'topbar-abbr', text: team ? (team.abbr || team.id) : 'FA' }));
    var rec = recordText(state);
    if (rec) left.appendChild(c.el('span', { class: 'topbar-rec num', text: rec }));
    top.appendChild(left);
    top.appendChild(c.el('div', { class: 'topbar-mid' }, c.el('span', { class: 'topbar-week', text: c.fmt.week(state) }), c.el('span', { class: 'topbar-stage small txt-grey', text: (state.stage === 'NFL' ? 'PRO' : state.stage) + (p.role && p.role !== 'NONE' ? ' · ' + p.role : '') })));
    var right = c.el('div', { class: 'topbar-right' });
    var xp = c.el('button', { class: 'topbar-stat', type: 'button', 'aria-label': 'XP ' + p.xp, onClick: function () { nav('training'); } }, c.icon('bolt', 10), c.el('span', { class: 'num', text: String(p.xp) }));
    right.appendChild(xp);
    var money = c.el('span', { class: 'topbar-stat', 'aria-label': 'Earnings' }, c.icon('money', 10), c.el('span', { class: 'num', text: c.fmt.money(state.history && state.history.earnings || 0) }));
    right.appendChild(money);
    top.appendChild(right);
  }

  function renderRailRight() {
    var c = C(), rail = els.railRight, state = store.state;
    c.clear(rail);
    if (!state) return;
    var p = state.player;
    var heads = (state.headlines || []).slice(-3).reverse();
    var ticker = c.card({ title: 'THE WIRE', kind: 'flat', body: c.list(heads, function (h) { return c.el('span', { class: 'small' }, h.text); }, { empty: 'No news is good news.' }) });
    rail.appendChild(ticker);
    var meters = c.card({ title: 'METERS', kind: 'flat', body: [
      c.meter({ label: 'TRUST', value: p.trust }),
      c.meter({ label: 'FANS', value: p.fans }),
      c.meter({ label: 'MORALE', value: p.morale }),
      c.meter({ label: 'JOB', value: p.js, kind: p.js < 25 ? 'red' : '' })
    ] });
    rail.appendChild(meters);
    var ovr = RTG.Player && RTG.Player.ovr ? RTG.Player.ovr(p.attrs) : 0;
    var st = state.stats && state.stats.season;
    var quick = c.card({ title: 'QUICK STATS', kind: 'flat', body: c.kv([
      ['OVR', c.el('span', { class: 'txt-gold num', text: String(ovr) })],
      ['FAME', (RTG.Player && RTG.Player.fameTierName ? RTG.Player.fameTierName(p.fame) : '') + ' (' + p.fame + ')'],
      ['SEASON FG', st ? (st.fgm + '/' + st.fga) : '—'],
      ['LONG', st && st.long ? st.long + ' yd' : '—'],
      ['AGE', String(p.age)]
    ]) });
    rail.appendChild(quick);
  }

  Shell.setChrome = function (screenId) {
    var R = Router();
    var wanted = screenId;
    if (screenId === '_fallback' && R.params() && R.params().wanted) wanted = R.params().wanted;
    var chromeless = !!R.CHROMELESS[wanted] || !store.state;
    els.app.classList.toggle('chromeless', chromeless);
    els.app.setAttribute('data-screen', String(wanted || ''));
    var tab = activeTab(wanted);
    var btns = els.tabbar.querySelectorAll('.tab-btn');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-tab') === tab;
      btns[i].classList.toggle('active', on);
      if (on) btns[i].setAttribute('aria-current', 'page'); else btns[i].removeAttribute('aria-current');
    }
    var rb = els.railLeft.querySelectorAll('.rail-btn');
    for (var j = 0; j < rb.length; j++) rb[j].classList.toggle('active', rb[j].getAttribute('data-nav') === wanted);
    if (!chromeless) { renderTopbar(); renderRailRight(); }
    doc.title = store.state && store.state.player ? (store.state.player.name.full + ' — Road to Glory: Kicker') : 'Road to Glory: Kicker';
  };

  // ─────────────────────────── event modal (generic; inbox.js may override Router.eventModal) ───────────────────────────

  function eventKey(ev) { return ev ? ev.id + '@' + ev.rolledYear + '/' + ev.rolledWeek : ''; }

  Shell.openEventModal = function (event) {
    var c = C();
    var key = eventKey(event);
    if (openEvent && openEvent.key === key) return openEvent.handle;
    if (openEvent) { openEvent.handle.close(); openEvent = null; }
    var sender = String(event.sender || 'press').toUpperCase();
    var body = c.el('div', { class: 'event-body' });
    body.appendChild(c.el('div', { class: 'event-sender' }, c.icon('envelope', 12), c.el('span', { text: sender })));
    body.appendChild(c.el('p', { class: 'event-text', text: event.text }));
    var choices = c.el('div', { class: 'event-choices' });
    (event.choices || []).forEach(function (ch, idx) {
      var b = c.button({ label: ch.label, kind: idx === 0 ? 'primary' : 'secondary', block: true, onClick: function () {
        try { store.dispatch('chooseEvent', idx); } catch (e) { c.toast(String(e.message || e), 'bad'); }
      } });
      var wrap = c.el('div', { class: 'event-choice' }, b);
      if (ch.preview) wrap.appendChild(c.el('div', { class: 'event-preview small txt-grey', text: ch.preview }));
      choices.appendChild(wrap);
    });
    body.appendChild(choices);
    var handle = c.modal({ title: event.title || 'EVENT', body: body, closable: false, class: 'event-modal' });
    openEvent = { key: key, handle: handle };
    c.announce('Event: ' + (event.title || '') + '. ' + event.text);
    return handle;
  };

  function closeStaleEventModal() {
    if (!openEvent) return;
    var pd = store.state && store.state.pending;
    if (!pd || pd.kind !== 'EVENT' || eventKey(pd.event) !== openEvent.key) { openEvent.handle.close(); openEvent = null; }
  }

  // ─────────────────────────── global handlers ───────────────────────────

  function onResize() {
    if (resizeTimer) root.clearTimeout(resizeTimer);
    resizeTimer = root.setTimeout(function () {
      resizeTimer = null;
      applyLayoutClasses();
      Router().resize();
    }, 100);
  }

  function onKey(ev) {
    if (C().modalOpen()) return;
    var t = ev.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    if (Router().key(ev)) { ev.preventDefault(); return; }
    // Shell shortcuts: Escape → back on browsing screens; '?' toggles the debug panel when debug is on.
    if (ev.key === 'Escape' && store.state && Router().FREE[Router().current()] && Router().current() !== 'hub') { Router().go('hub'); }
  }

  function onHide() { if (store.state) store.autosave(); }

  var lastTeam = null;
  function onStore(info) {
    var state = store.state;
    var teamId = state && state.player ? state.player.teamId : null;
    if (teamId !== lastTeam) { lastTeam = teamId; RTG.UI.Palette.setTeamVars(teamId); }
    if (info.fnName === 'settings') Shell.applySettings();
    closeStaleEventModal();
    Shell.setChrome(Router().current());
  }

  // ─────────────────────────── boot ───────────────────────────

  RTG.UI.boot = function () {
    if (booted) return store;
    booted = true;
    var c = C();
    var app = doc.getElementById('app');
    if (!app) { app = c.el('div', { id: 'app' }); doc.body.appendChild(app); }
    els.app = app;
    store = new RTG.UI.Store();
    RTG.UI.store = store;
    RTG.UI.uiRng = store.uiRng;
    RTG.UI.Shell = Shell;

    els.topbar = buildTopbar();
    els.railLeft = buildRailLeft();
    els.host = c.el('main', { class: 'screen-host', id: 'screen-host' });
    els.railRight = buildRailRight();
    els.tabbar = buildTabbar();
    app.appendChild(els.topbar);
    app.appendChild(els.railLeft);
    app.appendChild(els.host);
    app.appendChild(els.railRight);
    app.appendChild(els.tabbar);

    Shell.applySettings();
    applyLayoutClasses();
    RTG.UI.Palette.setTeamVars(null);

    var R = Router();
    R.mount(els.host);
    R.eventModal = function (event) { return Shell.openEventModal(event); };
    R.onChange(function (info) { Shell.setChrome(info.id); c.hideTooltip(); });
    store.subscribe(onStore);

    root.addEventListener('resize', onResize);
    root.addEventListener('orientationchange', onResize);
    root.addEventListener('keydown', onKey);
    root.addEventListener('pagehide', onHide);
    doc.addEventListener('visibilitychange', function () { if (doc.visibilityState === 'hidden') onHide(); });

    // ?load=auto resumes the autosave straight away (used by tests); otherwise start on the title.
    var q = root.location && root.location.search || '';
    if (/[?&]load=auto\b/.test(q)) {
      var r = store.load('auto');
      if (!r.ok) R.sync();
    } else {
      R.sync();
    }
    if (store.isDebug() && RTG.debug && typeof RTG.debug.mountPanel === 'function') RTG.debug.mountPanel();
    return store;
  };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', function () { RTG.UI.boot(); });
  else RTG.UI.boot();
})(typeof window !== 'undefined' ? window : globalThis);
