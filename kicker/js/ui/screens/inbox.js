/**
 * Road to Glory: Kicker — screen 'inbox' (SPEC §4.5 inbox row, §2.10–2.11) + the styled EVENT modal.
 *
 * Inbox: chat-bubble list of state.inbox (newest at the bottom, auto-scrolled) with procedural pixel avatars per
 * sender kind (coach / agent / gm / press / fan / family — RTG.UI.Kit.avatar), sender filter pills, unread dots.
 * Opening the screen marks every message read through dispatch('markRead', '*') (Engine.markRead; NO_SYNC in the
 * store, so the route never changes) — subscribers see fnName 'markRead' and the hub badge updates.
 *
 * Event modal: replaces the shell's generic Router.eventModal hook. app.js assigns the hook at boot (after this file
 * has run), so the hook is installed as an accessor property: the shell's assignment is kept as the fallback and this
 * modal always wins. The modal is idempotent per event id@year/week (Router.sync calls the hook after every dispatch
 * while an EVENT is pending), closes itself when the pending changes, shows one big button per choice with the
 * effect preview per Tuning.difficulty[d].effectPreview ('full' = the choice's preview text, 'icons' = signed icons
 * from the catalog effects, 'hidden' = nothing), dispatches chooseEvent(idx) and toasts the consequence headline.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Screens = RTG.UI.Screens = RTG.UI.Screens || {};

  function C() { return RTG.UI.C; }
  function K() { return RTG.UI.Kit; }

  // ═══════════════════════════════ event modal ═══════════════════════════════

  var openEvent = null;     // {key, handle, unsub}

  function eventKey(ev) { return ev ? ev.id + '@' + ev.rolledYear + '/' + ev.rolledWeek : ''; }

  var EFFECT_ICON = { morale: 'heart', trust: 'team', fans: 'star', fame: 'trophy', js: 'flag', xp: 'bolt', money: 'money' };
  var EFFECT_LABEL = { morale: 'Morale', trust: 'Trust', fans: 'Fans', fame: 'Fame', js: 'Job security', xp: 'XP', money: 'Money' };

  /** Signed icon row from the catalog effects of a choice (icons mode). */
  function iconPreview(choice) {
    var c = C();
    var fx = choice && choice.effects;
    if (!fx || typeof fx !== 'object') return null;
    var row = c.el('span', { class: 'event-fx chips' });
    var any = false;
    for (var k in EFFECT_ICON) {
      if (!Object.prototype.hasOwnProperty.call(fx, k) || typeof fx[k] !== 'number' || !fx[k]) continue;
      var up = fx[k] > 0;
      row.appendChild(K().tip(c.chip((up ? '▲' : '▼'), up ? 'mint' : 'red', EFFECT_ICON[k]), EFFECT_LABEL[k] + (up ? ' up' : ' down')));
      any = true;
    }
    if (fx.attrs) for (var a in fx.attrs) if (Object.prototype.hasOwnProperty.call(fx.attrs, a)) { row.appendChild(K().tip(c.chip(a + (fx.attrs[a] > 0 ? ' ▲' : ' ▼'), fx.attrs[a] > 0 ? 'mint' : 'red'), 'Attribute ' + a)); any = true; }
    if (fx.mods && fx.mods.length) { row.appendChild(K().tip(c.chip('MOD', 'sky', 'gear'), 'A temporary modifier')); any = true; }
    if (fx.trait) { row.appendChild(K().tip(c.chip('TRAIT', 'gold', 'star'), 'A new trait')); any = true; }
    if (fx.action) { row.appendChild(K().tip(c.chip(typeof fx.action === 'string' ? fx.action.replace(/_/g, ' ') : 'ACTION', 'gold', 'bolt'), 'A career action')); any = true; }
    if (choice.branches && choice.branches.length) { row.appendChild(K().tip(c.chip('?', 'grey', 'dice'), 'Chance outcome')); any = true; }
    return any ? row : null;
  }

  function previewFor(state, event, choice, i) {
    var c = C();
    var d = state && state.difficulty, row = RTG.Tuning && RTG.Tuning.difficulty && RTG.Tuning.difficulty[d];
    var mode = row && row.effectPreview ? row.effectPreview : 'full';
    if (mode === 'hidden') return c.el('span', { class: 'event-preview small txt-grey', text: '· · ·' });
    var cat = RTG.Data && RTG.Data.eventsById && RTG.Data.eventsById[event.id];
    var catChoice = cat && cat.choices && cat.choices[i];
    if (mode === 'icons') {
      var ic = iconPreview(catChoice);
      return ic ? c.el('span', { class: 'event-preview' }, ic) : c.el('span', { class: 'event-preview small txt-grey', text: choice.preview ? 'Effects hidden until it plays out' : '' });
    }
    return choice.preview ? c.el('span', { class: 'event-preview small txt-grey', text: choice.preview }) : null;
  }

  function closeEventModal() {
    if (!openEvent) return;
    var oe = openEvent;
    openEvent = null;
    if (oe.unsub) oe.unsub();
    oe.handle.close();
  }

  function openEventModal(event, store) {
    var c = C(), Kit = K();
    store = store || RTG.UI.store;
    var key = eventKey(event);
    if (openEvent && openEvent.key === key) return openEvent.handle;
    closeEventModal();
    var state = store.state;
    var sender = String(event.sender || 'press');
    var body = c.el('div', { class: 'event-body' });
    body.appendChild(c.el('div', { class: 'event-sender row' }, Kit.avatar(sender, 28), c.el('span', { text: Kit.senderName(sender) }), c.el('span', { class: 'txt-grey small', text: '· ' + Kit.weekLabel(event.rolledYear, event.rolledWeek) })));
    body.appendChild(c.el('p', { class: 'event-text', text: event.text }));
    var choices = c.el('div', { class: 'event-choices' });
    var busy = false;
    (event.choices || []).forEach(function (ch, idx) {
      var b = c.button({ label: ch.label, kind: idx === 0 ? 'primary' : 'secondary', block: true, class: 'event-choice-btn', action: 'choice-' + idx, onClick: function () {
        if (busy) return;
        busy = true;
        try {
          var r = store.dispatch('chooseEvent', idx);
          var text = r && r.headline && r.headline.text ? r.headline.text : null;
          if (text) { c.toast(text, 'gold', 4500); c.announce(text); }
          else c.announce('Chose ' + ch.label + '.');
          if (r && r.session) c.toast('One kick — make it count.', 'info');
        } catch (e) { busy = false; c.toast(String(e && e.message || e), 'bad', 4000); if (root.console) root.console.error(e); }
      } });
      var wrap = c.el('div', { class: 'event-choice' }, b);
      var pv = previewFor(state, event, ch, idx);
      if (pv) wrap.appendChild(pv);
      choices.appendChild(wrap);
    });
    body.appendChild(choices);
    var handle = c.modal({ title: event.title || 'EVENT', body: body, closable: false, class: 'event-modal styled-event' });
    var unsub = store.subscribe(function () {
      var pd = store.state && store.state.pending;
      if (!pd || pd.kind !== 'EVENT' || eventKey(pd.event) !== key) closeEventModal();
    });
    openEvent = { key: key, handle: handle, unsub: unsub };
    c.announce('Event from ' + Kit.senderName(sender) + ': ' + (event.title || '') + '. ' + event.text);
    return handle;
  }

  /** Install the hook as an accessor: the shell's later assignment becomes the fallback (never used while this file is loaded). */
  (function install() {
    var Router = RTG.UI.Router;
    var fallback = typeof Router.eventModal === 'function' ? Router.eventModal : null;
    try {
      Object.defineProperty(Router, 'eventModal', {
        configurable: true, enumerable: true,
        get: function () { return function (event, store) { return openEventModal(event, store); }; },
        set: function (v) { if (typeof v === 'function') fallback = v; }
      });
    } catch (e) { Router.eventModal = function (event, store) { return openEventModal(event, store); }; }
    Screens.eventModal = openEventModal;
    Screens.eventModalFallback = function () { return fallback; };
    Screens.closeEventModal = closeEventModal;
  })();

  // ═══════════════════════════════ inbox screen ═══════════════════════════════

  var FILTERS = [{ id: 'all', label: 'ALL' }, { id: 'coach', label: 'COACH' }, { id: 'agent', label: 'AGENT' }, { id: 'gm', label: 'GM' }, { id: 'press', label: 'PRESS' }, { id: 'fan', label: 'FANS' }, { id: 'family', label: 'FAMILY' }];

  function factory(store, params) {
    var c = C(), Kit = K(), R = RTG.UI.Router;
    var el = c.el('div', { class: 'screen scr-inbox' });
    var unsub = null, destroyed = false;
    var filter = params && params.filter || 'all';

    function markAllRead() {
      var state = store.state;
      if (!state) return;
      var unread = (state.inbox || []).filter(function (m) { return m && !m.read; }).length;
      if (!unread) return;
      try { store.dispatch('markRead', '*'); }
      catch (e) { if (root.console) root.console.error('markRead failed', e); }
    }

    function bubble(m) {
      var kind = m.avatar || m.from || 'press';
      var mine = kind === 'you';
      var row = c.el('li', { class: 'bubble-row bubble-' + kind + (m.read ? '' : ' unread') });
      row.appendChild(Kit.avatar(kind, 32));
      var b = c.el('div', { class: 'bubble' });
      b.appendChild(c.el('div', { class: 'bubble-meta small' }, c.el('span', { class: 'txt-sky', text: Kit.senderName(kind) }), c.el('span', { class: 'txt-grey', text: ' · ' + Kit.weekLabel(m.year, m.week) }), m.kind && m.kind !== 'note' ? c.chip(String(m.kind).toUpperCase(), m.kind === 'result' ? 'grey' : 'gold') : null, m.read ? null : c.el('span', { class: 'bubble-dot', 'aria-label': 'unread' })));
      b.appendChild(c.el('p', { class: 'bubble-text', text: m.text }));
      row.appendChild(b);
      if (mine) row.classList.add('mine');
      return row;
    }

    function pendingCard(state) {
      var pd = state.pending;
      if (!pd || pd.kind !== 'EVENT') return null;
      var ev = pd.event;
      return c.card({ title: 'WAITING ON YOU', kind: 'gold', icon: 'envelope', body: [c.el('p', { class: 'small' }, c.el('strong', { text: ev.title || ev.id }), ' — ' + Kit.senderName(ev.sender) + ' needs an answer.')],
        footer: [c.button({ label: 'OPEN', kind: 'primary', action: 'open-event', onClick: function () { openEventModal(ev, store); } })] });
    }

    function render() {
      if (destroyed) return;
      var state = store.state;
      var parts = [c.el('header', { class: 'screen-head' }, c.el('h1', { class: 'screen-title', text: 'INBOX' }))];
      if (!state) { parts.push(c.card({ body: c.el('p', { text: 'No career loaded.' }) })); c.replace(el, parts); return; }
      var pc = pendingCard(state);
      if (pc) parts.push(pc);
      var pills = c.el('div', { class: 'pills inbox-filters', role: 'radiogroup', 'aria-label': 'Filter by sender' });
      FILTERS.forEach(function (f) {
        var on = filter === f.id;
        pills.appendChild(c.el('button', { type: 'button', class: 'btn btn-ghost pill' + (on ? ' active' : ''), role: 'radio', 'aria-checked': on ? 'true' : 'false', 'data-filter': f.id, text: f.label, onClick: function () { filter = f.id; render(); } }));
      });
      parts.push(pills);
      var msgs = (state.inbox || []).filter(function (m) { return filter === 'all' || (m.from || m.avatar) === filter; });
      var ul = c.el('ul', { class: 'bubbles', 'aria-label': 'Messages' });
      if (!msgs.length) ul.appendChild(c.el('li', { class: 'list-empty', text: 'Nothing here yet — the coach will write after the first game.' }));
      msgs.forEach(function (m) { ul.appendChild(bubble(m)); });
      parts.push(ul);
      c.replace(el, parts);
      var host = el.closest ? el.closest('.screen-host') : null;
      if (host && host.scrollTo) { try { host.scrollTo(0, host.scrollHeight); } catch (e) { /* ignore */ } }
      if (root.scrollTo) { try { root.scrollTo(0, root.document.body.scrollHeight); } catch (e2) { /* ignore */ } }
    }

    render();
    var readTimer = root.setTimeout(function () { readTimer = null; if (!destroyed) { markAllRead(); render(); } }, 0);
    unsub = store.subscribe(function (info) { if (info.fnName !== 'markRead') render(); });
    return {
      el: el,
      destroy: function () { destroyed = true; if (unsub) unsub(); unsub = null; if (readTimer) root.clearTimeout(readTimer); }
    };
  }

  Screens.inbox = factory;
  RTG.UI.Router.register('inbox', factory);
})(typeof window !== 'undefined' ? window : globalThis);
