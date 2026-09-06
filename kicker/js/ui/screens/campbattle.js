/**
 * Road to Glory: Kicker — screen 'campbattle' (SPEC §4.5 campbattle row, §2.2 camp battle).
 * KickView with a live 2-line scoreboard (you vs the rival), 6 slots each; the rival's pre-resolved results
 * (session.rival.results) are revealed one at a time as quick chips after each of your kicks.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Screens = RTG.UI.Screens = RTG.UI.Screens || {};

  function C() { return RTG.UI.C; }

  function row(c, name, you) {
    var r = c.el('div', { class: 'camp-row' });
    r.appendChild(c.el('span', { class: 'camp-name' + (you ? ' you' : ''), text: name }));
    r.appendChild(c.el('span', { class: 'slot-strip', 'data-row': you ? 'you' : 'rival' }));
    r.appendChild(c.el('span', { class: 'camp-tally num', 'data-tally': you ? 'you' : 'rival', text: '0' }));
    return r;
  }
  function header(state, sess) {
    var c = C();
    var wrap = c.el('div', { class: 'camp-header' });
    var rival = sess.rival || { name: 'the other leg' };
    wrap.appendChild(c.el('div', { class: 'session-title' }, c.el('span', { text: 'CAMP BATTLE' }), c.el('span', { class: 'small txt-grey', text: 'K1 on the line' })));
    var board = c.el('div', { class: 'camp-board', role: 'table', 'aria-label': 'Camp battle scoreboard' });
    var me = state && state.player ? state.player.name.last.toUpperCase() : 'YOU';
    board.appendChild(row(c, me, true));
    board.appendChild(row(c, String(rival.name || 'RIVAL').toUpperCase() + (rival.ovr ? ' (' + rival.ovr + ')' : ''), false));
    wrap.appendChild(board);
    return wrap;
  }
  function fill(c, strip, contexts, results, upto, current, rivalRow) {
    c.clear(strip);
    var makes = 0;
    for (var i = 0; i < contexts.length; i++) {
      var r = i < upto ? results[i] : null;
      if (r && r.made) makes++;
      var cls = 'slot' + (rivalRow ? ' rival' : '') + (r ? (r.made ? ' made' : ' miss') : (i === current ? ' current' : ''));
      strip.appendChild(c.el('span', { class: cls },
        c.el('span', { class: 'slot-d', text: contexts[i].distance + '' }),
        c.el('span', { class: 'slot-r', text: r ? (r.made ? '✓' : '✗') : '·' })));
    }
    return makes;
  }
  function update(headerEl, state, sess) {
    var c = C();
    if (!sess) return;
    var mine = headerEl.querySelector('[data-row="you"]'), theirs = headerEl.querySelector('[data-row="rival"]');
    var n = sess.results.length;
    var myMakes = fill(c, mine, sess.contexts, sess.results, n, n, false);
    var rr = sess.rival && sess.rival.results ? sess.rival.results : [];
    var rivalMakes = fill(c, theirs, sess.contexts, rr, n, -1, true);
    headerEl.querySelector('[data-tally="you"]').textContent = String(myMakes);
    headerEl.querySelector('[data-tally="rival"]').textContent = String(rivalMakes);
  }

  function factory(store) {
    var c = C();
    var state = store.state;
    if (!state || !state.pending || state.pending.kind !== 'KICKS') {
      var el = c.el('div', { class: 'screen-session' }, c.el('p', { class: 'txt-grey', style: 'padding:16px', text: 'No camp battle pending.' }));
      var t = root.setTimeout(function () { RTG.UI.Router.sync(); }, 0);
      return { el: el, destroy: function () { root.clearTimeout(t); } };
    }
    return RTG.UI.KickView.sessionScreen(store, {
      className: 'session-camp', header: header, update: update,
      onComplete: function (outcome) {
        if (outcome && outcome.kind === 'CAMP') {
          c.toast((outcome.won ? 'You win the job! ' : 'The job goes to ' + outcome.rival + '. ') + outcome.myMakes + '-' + outcome.rivalMakes, outcome.won ? 'good' : 'bad', 3500);
          c.announce(outcome.won ? 'You win the camp battle' : 'You lose the camp battle');
        }
        RTG.UI.Router.sync();
      }
    });
  }

  Screens.campbattle = factory;
  if (RTG.UI.Router) RTG.UI.Router.register('campbattle', factory);
})(typeof window !== 'undefined' ? window : globalThis);
