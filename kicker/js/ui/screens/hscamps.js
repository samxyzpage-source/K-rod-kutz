/**
 * Road to Glory: Kicker — screen 'hscamps' (SPEC §4.5, §2.7.0 D23: the recruiting camps).
 *
 * Where the career pauses between camps, once the senior season is in: the star rating the tape earned, the tour
 * so far (camps played, offers earned), and the itinerary — every invite as a row with the crest, the school, its
 * prestige stars, what the staff wants to see, and the verdict once played (OFFER EARNED / NO OFFER with the
 * line). One button: GO TO CAMP → dispatch('hsStartCamp'), which opens the next unplayed camp and routes to
 * 'hscamp'. When the last camp closes the engine has already moved on to the offers, so the router leaves here.
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

  function factory(store) {
    var c = C(), R = RTG.UI.Router;
    var el = c.el('div', { class: 'screen scr-hscamps' });
    var unsub = null, destroyed = false;

    function hs() { var s = store.state; return s && HS() ? HS().current(s) : null; }

    function inviteRows(h, camps) {
      return camps.invites.map(function (inv, i) {
        var next = i === camps.idx;
        var cls = 'hsc-row' + (inv.done ? (inv.earned ? ' earned' : ' missed') : (next ? ' next' : ''));
        var verdict = inv.done ? (inv.earned ? 'offer earned' : 'no offer') : (next ? 'next camp' : 'to come');
        var row = c.el('div', { class: cls, 'data-camp': String(i), role: 'listitem',
          'aria-label': inv.school + ', ' + inv.prestige + ' star programme: ' + HS().askOf(inv) + '. ' + verdict });
        row.appendChild(c.crest ? c.crest(inv.teamId, 22) : c.el('span', { class: 'crest' }));
        row.appendChild(c.el('span', { class: 'hsc-name' },
          c.el('span', { class: 'hsc-school', text: inv.school }),
          c.el('span', { class: 'hsc-stars', text: starText(inv.prestige), 'aria-hidden': 'true' })));
        row.appendChild(c.el('span', { class: 'hsc-ask small txt-grey', text: 'They want: ' + HS().askOf(inv) }));
        var v = c.el('span', { class: 'hsc-verdict' });
        if (inv.done) v.appendChild(c.chip(inv.earned ? 'OFFER EARNED' : 'NO OFFER', inv.earned ? 'mint' : 'red'));
        else if (next) v.appendChild(c.chip('NEXT', 'gold'));
        else v.appendChild(c.el('span', { class: 'txt-grey', text: '—' }));
        row.appendChild(v);
        row.appendChild(c.el('span', { class: 'hsc-line small' + (inv.done ? (inv.earned ? ' txt-mint' : ' txt-red') : ' txt-grey'), text: inv.done ? inv.line : '' }));
        return row;
      });
    }

    function render() {
      if (destroyed) return;
      var h = hs();
      c.clear(el);
      var camps = h && h.camps;
      if (!h || !camps || !h.summary) {
        el.appendChild(c.el('p', { class: 'txt-grey', style: 'padding:16px', text: 'No camp invites on this career yet — the senior season decides them.' }));
        return;
      }
      var p = store.state.player, t = h.totals, sum = h.summary;
      var n = camps.invites.length, played = camps.idx, earned = camps.earned.length;
      var next = HS().nextCamp(store.state);
      var head = c.el('header', { class: 'screen-head' });
      head.appendChild(c.el('h1', { class: 'screen-title', text: 'RECRUITING CAMPS' }));
      head.appendChild(c.el('div', { class: 'screen-head-right' }, c.chip(sum.stars + '★ RECRUIT', 'gold')));
      el.appendChild(head);

      var copy = played === 0
        ? n + ' school' + (n === 1 ? ' wants' : 's want') + ' a closer look at ' + p.name.full + '. Five kicks in front of each staff — make their bar and that school’s offer is yours.'
        : (earned ? earned + ' offer' + (earned === 1 ? '' : 's') + ' in hand, ' : 'No offer yet, ') + (n - played) + ' camp' + (n - played === 1 ? '' : 's') + ' to go.';
      el.appendChild(c.card({
        title: 'CAMP TOUR', right: c.el('span', { class: 'num', text: played + '/' + n }),
        body: [
          c.el('p', { class: 'small txt-grey', text: copy }),
          c.el('div', { class: 'hsc-tot row' },
            c.el('span', { class: 'hsc-tot-cell' }, c.el('b', { class: 'num', text: String(earned) }), c.el('span', { class: 'small txt-grey', text: 'OFFERS EARNED' })),
            c.el('span', { class: 'hsc-tot-cell' }, c.el('b', { class: 'num', text: String(n - played) }), c.el('span', { class: 'small txt-grey', text: 'CAMPS LEFT' })),
            c.el('span', { class: 'hsc-tot-cell' }, c.el('b', { class: 'num', text: sum.record }), c.el('span', { class: 'small txt-grey', text: 'SENIOR YEAR' })),
            c.el('span', { class: 'hsc-tot-cell' }, c.el('b', { class: 'num', text: t.fgm + '/' + t.fga }), c.el('span', { class: 'small txt-grey', text: 'FIELD GOALS' })))
        ],
        footer: next ? [
          c.button({ label: 'GO TO ' + next.school.toUpperCase() + ' CAMP', kind: 'primary', icon: 'ball', action: 'go-camp', onClick: function () {
            store.dispatch('hsStartCamp');
            RTG.UI.Router.sync();
          } })
        ] : null
      }));

      el.appendChild(c.card({
        title: 'ITINERARY',
        right: c.el('span', { class: 'small txt-grey', text: 'small camps first, the big ones last' }),
        body: [c.el('div', { class: 'hsc-list', role: 'list' }, inviteRows(h, camps))]
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

  Screens.hscamps = factory;
  if (RTG.UI.Router) RTG.UI.Router.register('hscamps', factory);
})(typeof window !== 'undefined' ? window : globalThis);
