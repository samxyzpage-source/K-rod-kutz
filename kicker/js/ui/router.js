/**
 * Road to Glory: Kicker — RTG.UI.Router (SPEC §3.6 / §4.4, UI_API.md §Router).
 *
 *   Router.register(id, factory)     factory(store, params) → {el, destroy(), onResize?(), onKey?(event), title?}
 *   Router.has(id) · Router.ids()
 *   Router.mount(rootEl)             the element screens are mounted into (app.js passes the .screen-host)
 *   Router.go(id, params, opts?)     opts.replace: do not push the previous screen on the back stack
 *   Router.back()                    pop the stack (≤ 8 entries); falls back to Router.sync()
 *   Router.current() → id · Router.params() · Router.screen() → the live {el, destroy, …} instance
 *   Router.resolve(state) → {id, params, event?}   the SPEC §3.6 routing table (pure)
 *   Router.sync()                    route from store.state; keeps hub-family screens; opens the event modal
 *   Router.onChange(fn) → unsubscribe   fn({id, prevId, params})
 *   Router.eventModal = fn(event, store)   hook the shell sets to open the EVENT modal (inbox.js may override)
 *   Router.FREE — screens that stay put when the state routes to 'hub' (the hub family)
 *   Router.CHROMELESS — screens without the top bar / tab bar (used by app.js)
 *
 * A screen id that is not registered falls back to '_fallback' (params.wanted = the intended id).
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};

  var factories = {};
  var rootEl = null;
  var live = null;          // {id, params, screen}
  var stack = [];
  var listeners = [];
  var MAX_STACK = 8;

  /** Hub-family screens: browsing screens that remain valid while the state routes to 'hub'. */
  var FREE = {
    hub: 1, team: 1, training: 1, stats: 1, schedule: 1, standings: 1, records: 1, timeline: 1, inbox: 1,
    saves: 1, settings: 1, practice: 1, postgame: 1
  };
  /** Screens rendered without the shell chrome. */
  var CHROMELESS = { title: 1, newcareer: 1, kick: 1, showcase: 1, campbattle: 1, combine: 1 };

  var Router = {};
  Router.FREE = FREE;
  Router.CHROMELESS = CHROMELESS;

  Router.register = function (id, factory) {
    if (typeof factory !== 'function') throw new Error('Router.register(' + id + '): factory must be a function');
    factories[id] = factory;
    return Router;
  };
  Router.has = function (id) { return Object.prototype.hasOwnProperty.call(factories, id); };
  Router.ids = function () { return Object.keys(factories).sort(); };

  Router.mount = function (el) {
    rootEl = el;
    return Router;
  };
  Router.root = function () { return rootEl; };

  Router.current = function () { return live ? live.id : null; };
  Router.params = function () { return live ? live.params : null; };
  Router.screen = function () { return live ? live.screen : null; };
  Router.stack = function () { return stack.slice(); };

  Router.onChange = function (fn) {
    listeners.push(fn);
    return function () { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
  };

  function emit(info) {
    var list = listeners.slice();
    for (var i = 0; i < list.length; i++) {
      try { list[i](info); } catch (e) { if (root.console) root.console.error('Router listener failed', e); }
    }
  }

  function destroyLive() {
    if (!live) return;
    var s = live.screen;
    try { if (s && typeof s.destroy === 'function') s.destroy(); } catch (e) { if (root.console) root.console.error('screen.destroy failed (' + live.id + ')', e); }
    if (s && s.el && s.el.parentNode) s.el.parentNode.removeChild(s.el);
    live = null;
  }

  function fallbackScreen(store, wantedId, params) {
    var p = {};
    for (var k in params) if (Object.prototype.hasOwnProperty.call(params, k)) p[k] = params[k];
    p.wanted = wantedId;
    if (!factories._fallback) {
      var div = root.document.createElement('div');
      div.className = 'screen';
      div.textContent = 'Screen "' + wantedId + '" is not available yet.';
      return { id: '_fallback', params: p, screen: { el: div, destroy: function () {} } };
    }
    return { id: '_fallback', params: p, screen: factories._fallback(store, p) };
  }

  /**
   * Navigate. Destroys the live screen, builds the new one, appends it to the mount root and emits onChange.
   * @param {string} id @param {Object} [params] @param {{replace?:boolean, noStack?:boolean}} [opts]
   */
  Router.go = function (id, params, opts) {
    params = params || {};
    opts = opts || {};
    var store = RTG.UI.store;
    if (!rootEl) throw new Error('Router.go: call Router.mount(rootEl) first');
    var prevId = live ? live.id : null;
    if (live && !opts.replace && !opts.noStack) {
      stack.push({ id: live.id, params: live.params });
      if (stack.length > MAX_STACK) stack.shift();
    }
    destroyLive();
    var next;
    if (factories[id]) {
      try {
        next = { id: id, params: params, screen: factories[id](store, params) };
      } catch (e) {
        if (root.console) root.console.error('screen factory failed (' + id + ')', e);
        next = fallbackScreen(store, id, { error: String(e && e.message || e) });
      }
    } else {
      next = fallbackScreen(store, id, params);
    }
    if (!next.screen || !next.screen.el) {
      next = fallbackScreen(store, id, { error: 'factory returned no element' });
    }
    live = next;
    next.screen.el.classList.add('screen');
    next.screen.el.setAttribute('data-screen', next.id);
    if (next.id === '_fallback') next.screen.el.setAttribute('data-wanted', String(params.wanted || id));
    rootEl.appendChild(next.screen.el);
    if (root.scrollTo && !opts.keepScroll) { try { root.scrollTo(0, 0); } catch (e) { /* ignore */ } }
    emit({ id: next.id, prevId: prevId, params: params, wanted: id });
    return next.screen;
  };

  /** Pop the back stack (skipping entries that equal the live screen); with an empty stack → sync(). */
  Router.back = function () {
    while (stack.length) {
      var top = stack.pop();
      if (!live || top.id !== live.id) return Router.go(top.id, top.params, { noStack: true });
    }
    return Router.sync();
  };

  // ─────────────────────────── routing table (SPEC §3.6 / ENGINE_API §1.1) ───────────────────────────

  var CONTRACT_KINDS = { UDFA: 1, FREE_AGENCY: 1, EXTENSION: 1, TAG: 1, CUT_NOTICE: 1, MIN: 1 };

  /**
   * Pure: which screen a state implies. `event: true` marks "keep the current screen and open the event modal".
   * @returns {{id:string, params:Object, event?:boolean}}
   */
  Router.resolve = function (state) {
    if (!state) return { id: 'title', params: {} };
    if (state.game) {
      return state.game.pending ? { id: 'kick', params: { mode: 'game' } } : { id: 'game', params: {} };
    }
    var pd = state.pending;
    if (pd) {
      if (pd.kind === 'KICKS') {
        var sk = pd.session && pd.session.kind || '';
        if (sk === 'SHOWCASE') return { id: 'showcase', params: {} };
        if (sk === 'CAMP') return { id: 'campbattle', params: {} };
        if (sk.indexOf('COMBINE') === 0) return { id: 'combine', params: {} };
        return { id: 'kick', params: { mode: 'session', session: sk } };
      }
      if (pd.kind === 'EVENT') return { id: 'hub', params: {}, event: true };
      if (pd.kind === 'DECISION') {
        var dk = pd.decision && pd.decision.kind || '';
        if (dk === 'OFFERS_COLLEGE') return { id: 'offers', params: {} };
        if (CONTRACT_KINDS[dk]) return { id: 'contract', params: { kind: dk } };
        if (dk === 'HOF') return { id: 'legacy', params: {} };
        return { id: 'offseason', params: { kind: dk } };
      }
    }
    if (state.stage === 'DRAFT') {
      if (state.phase === 'DRAFT') return { id: 'draft', params: {} };
      if (state.phase === 'COMBINE') return { id: 'combine', params: {} };
      return { id: 'offseason', params: { kind: state.phase } };
    }
    if (state.stage === 'RETIRED') return { id: 'legacy', params: {} };
    if (state.phase === 'AWARDS') return { id: 'awards', params: {} };
    return { id: 'hub', params: {} };
  };

  /** Hook: the shell (app.js) assigns fn(event, store); inbox.js may replace it with a richer modal. */
  Router.eventModal = null;

  /**
   * Route from the store's state. Rules:
   *  - the resolved screen equals the live one → no remount (screens re-render through their subscription);
   *  - resolved 'hub' while a hub-family (FREE) screen is live → stay;
   *  - EVENT pending → stay on a FREE screen (else go 'hub'), then open the event modal (Router.eventModal);
   *  - unregistered target → '_fallback' with params.wanted;
   *  - opts.force (store.replace: load / import / new career) skips the stay rules and always mounts the target.
   */
  Router.sync = function (opts) {
    opts = opts || {};
    var store = RTG.UI.store;
    var state = store ? store.state : null;
    var r = Router.resolve(state);
    var curId = live ? live.id : null;
    var curWanted = live && live.id === '_fallback' ? live.params.wanted : curId;
    var stay = false;
    if (!opts.force) {
      if (curWanted === r.id) stay = true;
      else if (r.id === 'hub' && curWanted && FREE[curWanted]) stay = true;
    }
    if (!stay) Router.go(r.id, r.params, { replace: true });
    if (r.event && state && state.pending && typeof Router.eventModal === 'function') {
      try { Router.eventModal(state.pending.event, store); } catch (e) { if (root.console) root.console.error('event modal failed', e); }
    }
    return Router.current();
  };

  /** Forward a resize to the live screen. */
  Router.resize = function () {
    var s = live && live.screen;
    if (s && typeof s.onResize === 'function') { try { s.onResize(); } catch (e) { if (root.console) root.console.error('onResize failed', e); } }
  };

  /** Forward a key event to the live screen; returns true when the screen handled it (returned true). */
  Router.key = function (ev) {
    var s = live && live.screen;
    if (s && typeof s.onKey === 'function') {
      try { return s.onKey(ev) === true; } catch (e) { if (root.console) root.console.error('onKey failed', e); }
    }
    return false;
  };

  /** Tear down the live screen (tests / hot reload). */
  Router.reset = function () { destroyLive(); stack.length = 0; };

  RTG.UI.Router = Router;
})(typeof window !== 'undefined' ? window : globalThis);
