/**
 * Road to Glory: Kicker — screen 'hsseason' (SPEC §4.5, §2.7.0 D23).
 *
 * Where the career starts and where it pauses between the five games of the senior year: the school, the
 * five-game schedule with what your leg did in each, the season line, and the recruiting board — every school
 * following the tape, its interest bar and how far it moved after the last game. PLAY WEEK n →
 * dispatch('hsStartGame'), which opens the game and routes to 'hsgame'.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Screens = RTG.UI.Screens = RTG.UI.Screens || {};

  var TIER_LABEL = { OFFER: 'OFFERED', HIGH: 'HIGH', WARM: 'WARM', COLD: 'COLD' };

  function C() { return RTG.UI.C; }
  function HS() { return RTG.HS; }

  function factory(store) {
    var c = C(), R = RTG.UI.Router;
    var el = c.el('div', { class: 'screen scr-hsseason' });
    var unsub = null, destroyed = false;

    function hs() { var s = store.state; return s && RTG.HS ? RTG.HS.current(s) : null; }

    function scheduleRows(h) {
      return h.games.map(function (g, i) {
        var next = i === h.idx;
        var row = c.el('div', {
          class: 'hs-grow' + (g.played ? (g.won ? ' won' : ' lost') : '') + (next ? ' next' : ''),
          'data-game': String(i), role: 'listitem'
        });
        row.appendChild(c.el('span', { class: 'hs-gwk num', text: 'WK ' + g.week }));
        row.appendChild(c.el('span', { class: 'hs-gopp' },
          c.el('span', { class: 'hs-gat txt-grey', text: g.home ? 'vs' : '@' }), ' ', g.opp,
          g.rivalry ? c.chip('RIVALRY', 'warn') : null,
          g.playoff ? c.chip('PLAYOFFS', 'gold') : null));
        if (g.played) {
          row.appendChild(c.el('span', { class: 'hs-gres num', text: (g.won ? 'W ' : 'L ') + g.us + '–' + g.them + (g.ot ? ' OT' : '') }));
          var line = g.fgm + '/' + g.fga + ' FG';
          if (g.xpa) line += ' · ' + g.xpm + '/' + g.xpa + ' XP';
          if (g.gw) line += ' · GW';
          row.appendChild(c.el('span', { class: 'hs-gline small txt-grey', text: line }));
        } else {
          row.appendChild(c.el('span', { class: 'hs-gres num txt-grey', text: next ? 'NEXT' : '—' }));
          row.appendChild(c.el('span', { class: 'hs-gline small txt-grey', text: '' }));
        }
        return row;
      });
    }

    function boardRows(h) {
      return h.board.map(function (b) {
        var tier = RTG.HS.tierOf(b.interest);
        var row = c.el('div', { class: 'hs-brow tier-' + tier.toLowerCase(), role: 'listitem',
          'aria-label': b.school + ': ' + TIER_LABEL[tier] + ', interest ' + b.interest + ' of 100' });
        row.appendChild(c.crest ? c.crest(b.teamId, 18) : c.el('span'));
        row.appendChild(c.el('span', { class: 'hs-bname', text: b.school }));
        row.appendChild(c.el('span', { class: 'hs-bstars', text: b.prestige + '★' }));
        var track = c.el('span', { class: 'hs-btrack' });
        track.appendChild(c.el('span', { class: 'hs-bfill', style: 'width:' + Math.max(2, b.interest) + '%' }));
        row.appendChild(track);
        row.appendChild(c.el('span', { class: 'hs-btier', text: TIER_LABEL[tier] }));
        row.appendChild(b.moved ? c.deltaChip(b.moved) : c.el('span', { class: 'hs-bmove' }));
        return row;
      });
    }

    function render() {
      if (destroyed) return;
      var h = hs();
      c.clear(el);
      if (!h) {
        el.appendChild(c.el('p', { class: 'txt-grey', style: 'padding:16px', text: 'No senior season on this career.' }));
        return;
      }
      var p = store.state.player;
      var t = h.totals, done = h.idx >= h.games.length;
      var head = c.el('header', { class: 'screen-head' });
      head.appendChild(c.el('h1', { class: 'screen-title', text: h.school.full.toUpperCase() }));
      head.appendChild(c.el('div', { class: 'screen-head-right' },
        c.el('span', { class: 'small txt-grey', text: h.school.city + ', ' + h.school.state })));
      el.appendChild(head);

      el.appendChild(c.card({
        title: 'SENIOR SEASON', right: c.el('span', { class: 'num', text: t.wins + '–' + t.losses }),
        body: [
          c.el('p', { class: 'small txt-grey', text: done
            ? 'The tape is in. ' + p.name.full + ' finished ' + t.wins + '–' + t.losses + '.'
            : 'Five games left of ' + p.name.full + '’s senior year. Every kick is on tape — colleges are watching.' }),
          c.el('div', { class: 'hs-tot row' },
            c.el('span', { class: 'hs-tot-cell' }, c.el('b', { class: 'num', text: t.fgm + '/' + t.fga }), c.el('span', { class: 'small txt-grey', text: 'FIELD GOALS' })),
            c.el('span', { class: 'hs-tot-cell' }, c.el('b', { class: 'num', text: t.xpm + '/' + t.xpa }), c.el('span', { class: 'small txt-grey', text: 'EXTRA POINTS' })),
            c.el('span', { class: 'hs-tot-cell' }, c.el('b', { class: 'num', text: String(t.long) }), c.el('span', { class: 'small txt-grey', text: '45+ MADE' })),
            c.el('span', { class: 'hs-tot-cell' }, c.el('b', { class: 'num', text: t.gw + '/' + t.gwa }), c.el('span', { class: 'small txt-grey', text: 'GAME-WINNERS' })))
        ],
        footer: done ? null : [
          c.button({ label: 'PLAY WEEK ' + h.games[h.idx].week, kind: 'primary', icon: 'ball', action: 'play-hs-game', onClick: function () {
            store.dispatch('hsStartGame');
            RTG.UI.Router.sync();
          } })
        ]
      }));

      el.appendChild(c.card({ title: 'SCHEDULE', body: [c.el('div', { class: 'hs-sched', role: 'list' }, scheduleRows(h))] }));

      el.appendChild(c.card({
        title: 'RECRUITING BOARD',
        right: c.el('span', { class: 'small txt-grey', text: h.idx ? 'after week ' + h.games[h.idx - 1].week : 'before week ' + h.games[0].week }),
        body: [
          c.el('p', { class: 'small txt-grey', text: 'How hard each programme is following the tape. Reach ' + RTG.Tuning.hs.interest.warmAt + ' (WARM) and the school invites you to its camp after the season — the offer is earned there.' }),
          c.el('div', { class: 'hs-board-list', role: 'list' }, boardRows(h))
        ]
      }));

      el.appendChild(c.el('div', { class: 'row row-end', style: 'gap:8px' },
        c.button({ label: 'SETTINGS', kind: 'ghost', icon: 'gear', onClick: function () { R.go('settings'); } })));
    }

    unsub = store.subscribe(function () { render(); });
    render();

    return {
      el: el,
      destroy: function () { destroyed = true; if (unsub) unsub(); unsub = null; }
    };
  }

  Screens.hsseason = factory;
  if (RTG.UI.Router) RTG.UI.Router.register('hsseason', factory);
})(typeof window !== 'undefined' ? window : globalThis);
