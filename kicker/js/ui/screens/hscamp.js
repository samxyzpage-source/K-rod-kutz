/**
 * Road to Glory: Kicker — screen 'hscamp' (SPEC §4.5, §2.7.0 D23: one recruiting camp).
 * Five kicks at a college in front of its staff: KickView full-screen with a small header — the school and its
 * prestige, what they want to see ("make 4 of 5, one from 55+"), the running tally — and a slot strip of the five
 * distances, the long one starred. Drives state.pending.session (kind RECRUIT_CAMP) through
 * dispatch('sessionKick', input); when the camp closes the screen hands back to 'hscamps' (or, after the last
 * camp, to the offers).
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Screens = RTG.UI.Screens = RTG.UI.Screens || {};

  function C() { return RTG.UI.C; }
  function HS() { return RTG.HS; }

  function starText(n) {
    var s = '';
    for (var i = 0; i < n; i++) s += '★';
    return s;
  }

  function header(state, sess) {
    var c = C();
    var wrap = c.el('div', { class: 'hsc-header' });
    var ask = HS() && HS().askOf ? HS().askOf(sess) : ('make ' + sess.bar.makes + ' of ' + sess.kicks);
    wrap.appendChild(c.el('div', { class: 'session-title' },
      c.el('span', { class: 'hsc-school' },
        c.crest ? c.crest(sess.teamId, 16) : null,
        c.el('span', { text: String(sess.school || sess.teamId).toUpperCase() + ' CAMP' }),
        c.el('span', { class: 'hsc-stars', text: starText(sess.prestige), 'aria-hidden': 'true' })),
      c.el('span', { class: 'small txt-grey hsc-ask', text: ask.toUpperCase() }),
      c.el('span', { class: 'hsc-tally num', 'data-camp': 'tally', text: '0/' + sess.contexts.length })));
    wrap.appendChild(c.el('div', { class: 'slot-strip', role: 'list', 'aria-label': 'Camp kicks' }));
    return wrap;
  }

  function update(headerEl, state, sess) {
    var c = C();
    if (!sess) return;
    var strip = headerEl.querySelector('.slot-strip');
    var tally = headerEl.querySelector('[data-camp="tally"]');
    var next = sess.results.length, n = sess.contexts.length;
    var v = HS() && HS().judgeCamp ? HS().judgeCamp(sess) : null;
    if (tally && v) tally.textContent = v.makes + '/' + n + (sess.bar.long ? (v.longMade ? ' · long ✓' : '') : '');
    if (!strip) return;
    c.clear(strip);
    for (var i = 0; i < n; i++) {
      var ctx = sess.contexts[i], r = sess.results[i];
      var isLong = !!sess.bar.long && i === n - 1;
      var label = ctx.distance + ' YD';
      var cls = 'slot' + (r ? (r.made ? ' made' : ' miss') : (i === next ? ' current' : ''));
      strip.appendChild(c.el('span', { class: cls, role: 'listitem', 'aria-label': label + (isLong ? ', the long one' : '') + ' ' + (r ? (r.made ? 'made' : 'missed') : 'to come') },
        c.el('span', { class: 'slot-d', text: label }),
        c.el('span', { class: 'slot-r', text: r ? (r.made ? '✓' : '✗') : (isLong ? '★' : '·') })));
    }
  }

  function factory(store) {
    var c = C();
    var state = store.state;
    if (!state || !state.pending || state.pending.kind !== 'KICKS') {
      var el = c.el('div', { class: 'screen-session' }, c.el('p', { class: 'txt-grey', style: 'padding:16px', text: 'No camp is open.' }));
      var t = root.setTimeout(function () { RTG.UI.Router.sync(); }, 0);
      return { el: el, destroy: function () { root.clearTimeout(t); } };
    }
    return RTG.UI.KickView.sessionScreen(store, {
      className: 'session-hscamp', header: header, update: update,
      onComplete: function (outcome) {
        if (outcome && outcome.kind === 'RECRUIT_CAMP') {
          c.toast((outcome.earned ? 'Offer earned from ' : 'No offer from ') + outcome.school + ' — ' + outcome.makes + '/' + outcome.kicks, outcome.earned ? 'good' : 'bad', 3200);
          c.announce(outcome.earned ? outcome.school + ' offer earned' : 'No offer from ' + outcome.school);
        }
        RTG.UI.Router.sync();
      }
    });
  }

  Screens.hscamp = factory;
  if (RTG.UI.Router) RTG.UI.Router.register('hscamp', factory);
})(typeof window !== 'undefined' ? window : globalThis);
