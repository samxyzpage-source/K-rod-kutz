/**
 * Road to Glory: Kicker — screen 'showcase' (SPEC §4.5 showcase row, §2.7.1).
 * KickView full-screen with a 6-slot result strip on top and tutorial overlays ("PULL to power", "FLICK to
 * aim", "Wind sock") dismissed by the first kick. Drives state.pending.session (kind SHOWCASE) through
 * dispatch('sessionKick', input); when the session completes → Router.sync() (→ offers).
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Screens = RTG.UI.Screens = RTG.UI.Screens || {};

  function C() { return RTG.UI.C; }

  function header(state, sess) {
    var c = C();
    var wrap = c.el('div', { class: 'showcase-header' });
    var name = state && state.player ? state.player.name.full : 'Recruit';
    wrap.appendChild(c.el('div', { class: 'session-title' }, c.el('span', { text: 'HS SHOWCASE · ' + name.toUpperCase() }), c.el('span', { class: 'showcase-tally num', text: '' })));
    wrap.appendChild(c.el('div', { class: 'slot-strip', role: 'list', 'aria-label': 'Showcase kicks' }));
    return wrap;
  }
  function update(headerEl, state, sess) {
    var c = C();
    var strip = headerEl.querySelector('.slot-strip'), tally = headerEl.querySelector('.showcase-tally');
    if (!strip) return;
    c.clear(strip);
    if (!sess) return;
    var next = sess.results.length, makes = 0;
    for (var i = 0; i < sess.contexts.length; i++) {
      var ctx = sess.contexts[i], r = sess.results[i];
      if (r && r.made) makes++;
      var cls = 'slot' + (r ? (r.made ? ' made' : ' miss') : (i === next ? ' current' : ''));
      var slot = c.el('span', { class: cls, role: 'listitem', 'aria-label': ctx.distance + ' yards ' + (r ? (r.made ? 'made' : 'missed') : 'pending') },
        c.el('span', { class: 'slot-d', text: ctx.distance + ' YD' }),
        c.el('span', { class: 'slot-r', text: r ? (r.made ? '✓' : '✗') : (ctx.pressure >= 0.5 ? '★' : '·') }));
      strip.appendChild(slot);
    }
    if (tally) tally.textContent = makes + '/' + sess.contexts.length;
  }

  function factory(store) {
    var c = C();
    var state = store.state;
    if (!state || !state.pending || state.pending.kind !== 'KICKS') {
      var el = c.el('div', { class: 'screen-session' }, c.el('p', { class: 'txt-grey', style: 'padding:16px', text: 'No showcase pending.' }));
      var t = root.setTimeout(function () { RTG.UI.Router.sync(); }, 0);
      return { el: el, destroy: function () { root.clearTimeout(t); } };
    }
    return RTG.UI.KickView.sessionScreen(store, {
      className: 'session-showcase', header: header, update: update, tutorial: true,
      onComplete: function (outcome) {
        if (outcome && outcome.kind === 'SHOWCASE') {
          c.toast(outcome.makes + '/' + outcome.kicks + ' · ' + outcome.stars + '★ recruit' + (outcome.walkon ? ' (walk-on)' : ''), 'gold', 3200);
        }
        RTG.UI.Router.sync();
      }
    });
  }

  Screens.showcase = factory;
  if (RTG.UI.Router) RTG.UI.Router.register('showcase', factory);
})(typeof window !== 'undefined' ? window : globalThis);
