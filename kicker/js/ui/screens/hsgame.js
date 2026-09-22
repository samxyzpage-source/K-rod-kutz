/**
 * Road to Glory: Kicker — screen 'hsgame' (SPEC §4.5, §2.7.0 D23).
 * One game of the high-school senior season: KickView full-screen with a live scoreboard on top (your school,
 * the opponent, the quarter and the running score) and a slot strip of the night's scoring chances. Drives
 * state.pending.session (kind HS_GAME) through dispatch('sessionKick', input); when the game ends the screen
 * hands back to 'hsseason' (or, after the fifth game, to the offers).
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Screens = RTG.UI.Screens = RTG.UI.Screens || {};

  function C() { return RTG.UI.C; }
  function hs(state) { return RTG.HS && RTG.HS.current ? RTG.HS.current(state) : null; }

  function header(state, sess) {
    var c = C();
    var h = hs(state);
    var mine = h ? h.school.abbr : 'YOU';
    var wrap = c.el('div', { class: 'hs-header' });
    // one line, like every other session header: the scene needs the vertical room more than the scoreboard does
    var board = c.el('span', { class: 'hs-board', role: 'group', 'aria-label': 'Scoreboard' },
      c.el('span', { class: 'hs-team you', text: mine }),
      c.el('span', { class: 'hs-score num', 'data-hs': 'us', text: '0' }),
      c.el('span', { class: 'hs-sep', text: '–' }),
      c.el('span', { class: 'hs-score num', 'data-hs': 'them', text: '0' }),
      c.el('span', { class: 'hs-team', text: sess.oppAbbr || 'OPP' }));
    wrap.appendChild(c.el('div', { class: 'session-title' },
      c.el('span', { class: 'hs-week', text: 'WK ' + sess.week + (sess.playoff ? ' · PLAYOFFS' : sess.rivalry ? ' · RIVALRY' : '') }),
      board,
      c.el('span', { class: 'small txt-grey', 'data-hs': 'clock', text: '' })));
    wrap.appendChild(c.el('div', { class: 'slot-strip', role: 'list', 'aria-label': 'Scoring chances' }));
    return wrap;
  }

  function update(headerEl, state, sess) {
    var c = C();
    if (!sess) return;
    var strip = headerEl.querySelector('.slot-strip');
    var us = headerEl.querySelector('[data-hs="us"]'), them = headerEl.querySelector('[data-hs="them"]');
    var clock = headerEl.querySelector('[data-hs="clock"]');
    if (us) us.textContent = String(sess.score.us);
    if (them) them.textContent = String(sess.score.them);
    var next = sess.results.length;
    var ch = sess.chances[Math.min(next, sess.chances.length - 1)];
    if (clock && ch) clock.textContent = next >= sess.chances.length ? 'FINAL' : ('Q' + ch.q + (ch.last ? ' · last play' : ''));
    if (!strip) return;
    c.clear(strip);
    for (var i = 0; i < sess.chances.length; i++) {
      var k = sess.chances[i], r = sess.results[i];
      var label = k.type === 'PAT' ? 'XP' : (sess.contexts[i] ? sess.contexts[i].distance : k.distance) + ' YD';
      var cls = 'slot' + (r ? (r.made ? ' made' : ' miss') : (i === next ? ' current' : ''));
      strip.appendChild(c.el('span', { class: cls, role: 'listitem', 'aria-label': label + ' ' + (r ? (r.made ? 'made' : 'missed') : 'to come') },
        c.el('span', { class: 'slot-d', text: label }),
        c.el('span', { class: 'slot-r', text: r ? (r.made ? '✓' : '✗') : (k.trail ? '★' : '·') })));
    }
  }

  function factory(store) {
    var c = C();
    var state = store.state;
    if (!state || !state.pending || state.pending.kind !== 'KICKS') {
      var el = c.el('div', { class: 'screen-session' }, c.el('p', { class: 'txt-grey', style: 'padding:16px', text: 'No senior-season game is open.' }));
      var t = root.setTimeout(function () { RTG.UI.Router.sync(); }, 0);
      return { el: el, destroy: function () { root.clearTimeout(t); } };
    }
    var first = !state.flags || !state.flags.hs || state.flags.hs.idx === 0;
    return RTG.UI.KickView.sessionScreen(store, {
      className: 'session-hsgame', header: header, update: update, tutorial: first,
      onComplete: function (outcome) {
        if (outcome && outcome.kind === 'HS_GAME') {
          var line = (outcome.won ? 'W ' : 'L ') + outcome.us + '–' + outcome.them + (outcome.ot ? ' OT' : '')
            + ' · ' + outcome.fgm + '/' + outcome.fga + ' FG' + (outcome.gw ? ' · game-winner' : '');
          c.toast(line, outcome.won ? 'good' : 'bad', 3200);
        }
        RTG.UI.Router.sync();
      }
    });
  }

  Screens.hsgame = factory;
  if (RTG.UI.Router) RTG.UI.Router.register('hsgame', factory);
})(typeof window !== 'undefined' ? window : globalThis);
