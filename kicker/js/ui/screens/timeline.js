/**
 * Road to Glory: Kicker — screen 'timeline' (SPEC §4.5 timeline row).
 *
 * A vertical strip, newest first: the season in progress ("NOW") then one node per completed season from
 * history.seasons (crest, year, team, record, role, FG line and %, grade, award icons, contract chip, playoff
 * result / title), each with its moments from history.timeline (week, text, impact stars) — the newest seasons
 * expanded, the rest collapsed behind a <details>. Read-only.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Screens = RTG.UI.Screens = RTG.UI.Screens || {};

  function C() { return RTG.UI.C; }
  function K() { return RTG.UI.Kit; }

  var KIND_ICON = { AWARD: 'trophy', RECORD: 'star', MILESTONE: 'star', EVENT: 'envelope', TEAM: 'team', CAMP: 'bolt', BENCHED: 'flag', SEASON: 'clock', TRAINING: 'train', CONTRACT: 'money', DRAFTED: 'star', UNDRAFTED: 'x', CUT: 'x', TAG: 'flag', FA: 'money', RETIRED: 'heart', SHOWCASE: 'boot', RETIRE: 'clock', INJURY: 'heart' };
  var RESULT_TEXT = { BOWL_W: 'Bowl win', BOWL_L: 'Bowl loss', CHAMP: 'CHAMPIONS', NONE: '' };

  function factory(store) {
    var c = C(), Kit = K();
    var el = c.el('div', { class: 'screen scr-timeline' });
    var unsub = null, destroyed = false;

    function contractFor(state, year) {
      var list = state.history.contracts || [], best = null;
      for (var i = 0; i < list.length; i++) {
        var ct = list[i];
        if (ct.year <= year && (ct.endYear === null || ct.endYear === undefined || ct.endYear >= year)) best = ct;
      }
      return best;
    }

    function moments(state, year) {
      return (state.history.timeline || []).filter(function (t) { return t.year === year; });
    }

    function momentList(items) {
      return c.list(items, function (t) {
        return c.el('span', { class: 'row grow tl-moment' }, c.icon(KIND_ICON[t.kind] || 'more', 12), c.el('span', { class: 'col grow', style: 'gap:0' }, c.el('span', { class: 'small', text: t.text }), c.el('span', { class: 'small txt-grey', text: (t.week ? 'WK ' + t.week : 'PRE') + ' · ' + String(t.kind || '').toLowerCase() })), Kit.impactStars(t.impact));
      }, { empty: 'A quiet year.' });
    }

    function playoffChip(l) {
      if (!l) return null;
      if (l.champion) return Kit.tip(c.chip('CHAMPIONS', 'gold', 'trophy'), 'Won the title');
      var pr = l.playoffResult;
      if (!pr || pr === 'NONE') return null;
      var txt = RESULT_TEXT[pr] || String(pr).replace(/_L$/, ' exit').replace(/_W$/, ' win').replace(/_/g, ' ');
      return Kit.tip(c.chip(txt.toUpperCase(), pr.indexOf('_W') > 0 || pr === 'CHAMP' ? 'mint' : 'grey'), 'Postseason result');
    }

    function node(state, l, opts) {
      opts = opts || {};
      var year = l.year, s = l.stats || {};
      var ct = contractFor(state, year);
      var head = c.el('div', { class: 'row tl-head' }, c.crest(l.teamId, 36),
        c.el('div', { class: 'col grow', style: 'gap:2px' },
          c.el('strong', { class: 'ellipsis', text: (opts.now ? 'NOW · ' : '') + Kit.calYear(year) + ' · ' + (l.teamName || Kit.teamName(l.teamId)) }),
          c.el('span', { class: 'row row-wrap small' }, Kit.tip(c.chip(l.league === 'NFL' ? 'PRO' : 'COLLEGE', 'dark'), 'League'), c.el('span', { class: 'txt-grey', text: 'Y' + year + ' · age ' + Kit.num(l.age) + ' · ' + (l.role || '') + ' · OVR ' + Kit.num(l.ovr) }))));
      var line = c.el('div', { class: 'row row-wrap small tl-line' },
        Kit.numEl(l.teamRecord || Kit.recordOf(state, l.teamId) || '—', 'Team record'),
        Kit.numEl('FG ' + Kit.num(s.fgm) + '/' + Kit.num(s.fga) + ' (' + Kit.pctText(s.fgm, s.fga) + ')', 'Field goals', 'txt-gold'),
        Kit.numEl('LONG ' + Kit.num(s.long), 'Longest make'),
        l.grade ? Kit.tip(c.chip('GRADE ' + l.grade, l.grade === 'A' || l.grade === 'B' ? 'mint' : l.grade === 'C' ? 'grey' : 'red'), 'Season grade') : null,
        playoffChip(l));
      var awards = (l.awards || []).map(function (id) { return Kit.tip(c.el('span', { class: 'tl-award' }, c.icon('trophy', 14)), Kit.awardName(id)); });
      var chips = c.el('div', { class: 'chips mt-1' }, awards.length ? c.el('span', { class: 'row tl-awards' }, awards, c.el('span', { class: 'small txt-grey', text: awards.length + ' award' + (awards.length === 1 ? '' : 's') })) : null,
        ct ? Kit.tip(c.chip(Kit.contractText(ct).split(' · ').slice(0, 2).join(' · '), ct.type === 'ROOKIE' || ct.type === 'UDFA' ? 'sky' : ct.type === 'TAG' ? 'red' : ct.type === 'VET' ? 'gold' : 'grey', 'money'), (ct.reason || ct.type) + ' · signed Y' + ct.year + (ct.total ? ' · ' + c.fmt.money(ct.total) + ' total' : '')) : null,
        typeof l.salary === 'number' && l.salary ? Kit.tip(c.chip(c.fmt.money(l.salary), 'grey'), 'Paid this season') : null);
      var ms = moments(state, year);
      var det = c.el('details', { class: 'tl-moments', open: opts.open ? '' : null });
      det.appendChild(c.el('summary', { class: 'small txt-sky', text: ms.length + ' moment' + (ms.length === 1 ? '' : 's') }));
      det.appendChild(momentList(ms));
      var body = [head, line, chips, det];
      var card = c.card({ kind: opts.now ? 'gold' : (l.champion ? 'mint' : 'flat'), class: 'tl-node', body: body });
      return c.el('li', { class: 'tl-item' + (opts.now ? ' now' : '') }, c.el('span', { class: 'tl-dot', 'aria-hidden': 'true' }), card);
    }

    function nowLine(state) {
      var p = state.player;
      if (state.stage === 'RETIRED') return null;
      var last = state.history.seasons.length ? state.history.seasons[state.history.seasons.length - 1] : null;
      if (last && last.year === state.year) return null;   // the season just closed (AWARDS/OFF) is already in history
      return { year: state.year, league: state.season ? state.season.league : p.league, teamId: p.teamId, teamName: p.teamId ? Kit.teamName(p.teamId) : (state.stage === 'HS' ? 'High school' : 'Free agent'), age: p.age, ovr: Kit.ovr(p), role: p.role, stats: state.stats.season, awards: [], teamRecord: Kit.recordOf(state, p.teamId), champion: false, playoffResult: null, grade: null, salary: 0 };
    }

    function render() {
      if (destroyed) return;
      var state = store.state;
      var parts = [c.el('header', { class: 'screen-head' }, c.el('h1', { class: 'screen-title', text: 'TIMELINE' }))];
      if (!state) { parts.push(c.card({ body: c.el('p', { text: 'No career loaded.' }) })); c.replace(el, parts); return; }
      var ul = c.el('ul', { class: 'tl-strip', 'aria-label': 'Career timeline' });
      var now = nowLine(state);
      if (now) ul.appendChild(node(state, now, { now: true, open: true }));
      var seasons = (state.history.seasons || []).slice().reverse();
      seasons.forEach(function (l, i) { ul.appendChild(node(state, l, { open: i < 2 })); });
      var pre = (state.history.timeline || []).filter(function (t) { return t.year < 1 || (t.year === 1 && t.week === 0 && (t.kind === 'SHOWCASE' || t.kind === 'TEAM')); });
      if (!seasons.length && !now) ul.appendChild(c.el('li', { class: 'list-empty', text: 'The story starts with the first kick.' }));
      parts.push(c.el('div', { class: 'row row-wrap small txt-grey mb-1' }, c.el('span', { text: (state.history.seasons || []).length + ' season' + ((state.history.seasons || []).length === 1 ? '' : 's') + ' · ' + (state.history.timeline || []).length + ' moments · ' + c.fmt.money(Kit.num(state.history.earnings)) + ' earned' })));
      parts.push(ul);
      if (pre.length && !seasons.length) parts.push(c.card({ title: 'THE BEGINNING', kind: 'flat', body: momentList(pre) }));
      c.replace(el, parts);
    }

    render();
    unsub = store.subscribe(function () { render(); });
    return { el: el, destroy: function () { destroyed = true; if (unsub) unsub(); unsub = null; } };
  }

  Screens.timeline = factory;
  RTG.UI.Router.register('timeline', factory);
})(typeof window !== 'undefined' ? window : globalThis);
