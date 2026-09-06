/**
 * Road to Glory: Kicker — screen 'records' (SPEC §4.5 records row, §2.8–2.9).
 *
 * Tabs COLLEGE / NFL over RTG.Stats.compareToLegends(state): record, holder (team, year) and your value — yours in
 * gold when you hold it. Chase lines ("3 more 50+ makes for the season record") from the `gap` of the season and
 * career records of the league you are playing in. Milestones (100/200/… FGM, 1000/1500/2000 pts, first 50+, first
 * 60+, 20 straight, 10 game-winners) with their fired flags (state.flags['ms:<id>']) and the current progress.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Screens = RTG.UI.Screens = RTG.UI.Screens || {};

  function C() { return RTG.UI.C; }
  function K() { return RTG.UI.Kit; }

  var CHASE = {
    seasonFGM: function (g) { return g + ' more make' + (g === 1 ? '' : 's') + ' for the season FGM record'; },
    season50plus: function (g) { return g + ' more 50+ make' + (g === 1 ? '' : 's') + ' for the season record'; },
    seasonPts: function (g) { return g + ' more point' + (g === 1 ? '' : 's') + ' for the season scoring record'; },
    careerFGM: function (g) { return g + ' more make' + (g === 1 ? '' : 's') + ' for the career FGM record'; },
    careerPts: function (g) { return g + ' more point' + (g === 1 ? '' : 's') + ' for the career scoring record'; },
    careerGW: function (g) { return g + ' more game-winner' + (g === 1 ? '' : 's') + ' for the career record'; },
    longFG: function (g, r) { return 'A ' + (r.record + 1) + '-yarder beats the longest field goal'; },
    consecutiveFGM: function (g) { return g + ' more in a row for the streak record'; }
  };

  function factory(store, params) {
    var c = C(), Kit = K();
    var el = c.el('div', { class: 'screen scr-records' });
    var unsub = null, destroyed = false;
    var tab = params && params.tab || null;

    function fmtVal(r, v) {
      if (v === null || v === undefined) return '—';
      if (r.key === 'seasonFGpct' || r.key === 'careerFGpct') return (Math.round(v * 10) / 10).toFixed(1) + '%';
      if (r.key === 'longFG') return v + ' yd';
      return String(v);
    }

    function recordsTable(state, rows) {
      return c.table([
        { key: 'label', label: 'RECORD', render: function (r) { return c.el('span', { class: 'rec-label', text: r.label }); } },
        { key: 'record', label: 'MARK', align: 'r', render: function (r) { return c.el('span', { class: r.isUser ? 'txt-gold' : '', text: fmtVal(r, r.record) }); } },
        { key: 'holder', label: 'HOLDER', render: function (r) { return c.el('span', { class: 'col' + (r.isUser ? ' txt-gold' : ''), style: 'gap:0' }, c.el('span', { class: 'ellipsis', text: r.holder || '—' }), c.el('span', { class: 'small txt-grey', text: (r.holderTeam ? Kit.abbr(r.holderTeam) + ' · ' : '') + (r.year || '') })); } },
        { key: 'yours', label: 'YOURS', align: 'r', render: function (r) { return Kit.tip(c.el('span', { class: 'txt-gold num', text: fmtVal(r, r.yours) }), r.isUser ? 'You hold this record' : (typeof r.gap === 'number' && r.gap > 0 ? 'Gap: ' + fmtVal(r, r.gap) : '')); } }
      ], rows, { rowClass: function (r) { return r.isUser ? 'user' : ''; }, compact: true, caption: 'League records' });
    }

    function chaseLines(state, rows, league) {
      var mine = (state.season && state.season.league) === league;
      var out = [];
      rows.forEach(function (r) {
        if (r.isUser || !CHASE[r.key] || typeof r.gap !== 'number' || r.gap <= 0) return;
        var seasonKey = r.key.indexOf('season') === 0;
        if (seasonKey && !mine) return;
        if (!mine && (state.player.league !== league && state.stage !== 'RETIRED')) return;
        if (typeof r.yours !== 'number' || r.yours <= 0) return;
        var g = Math.floor(r.gap) + 1;   // records fall to a strictly better mark
        out.push(c.el('li', { class: 'list-row' }, c.icon('flag', 12), c.el('span', { class: 'small', text: CHASE[r.key](g, r) })));
      });
      if (!out.length) return null;
      var ul = c.el('ul', { class: 'list chase-list' });
      out.forEach(function (li) { ul.appendChild(li); });
      return c.card({ title: 'THE CHASE', kind: 'gold', icon: 'bolt', body: ul });
    }

    function milestones(state) {
      var M = RTG.Tuning && RTG.Tuning.awards && RTG.Tuning.awards.milestones || { fgm: [100, 200, 300, 400, 500], pts: [1000, 1500, 2000], consecutive: 20, gw: 10 };
      var f = state.flags || {}, car = state.stats.career || {};
      var items = [];
      (M.fgm || []).forEach(function (n) { items.push({ id: 'FGM' + n, text: n + ' career field goals', done: !!f['ms:FGM' + n] || car.fgm >= n, prog: Kit.num(car.fgm) + ' / ' + n }); });
      (M.pts || []).forEach(function (n) { items.push({ id: 'PTS' + n, text: n + ' career points', done: !!f['ms:PTS' + n] || car.pts >= n, prog: Kit.num(car.pts) + ' / ' + n }); });
      items.push({ id: 'first50', text: 'First 50-yarder', done: !!f['ms:first50'] || car.made50plus > 0, prog: car.made50plus ? 'done' : 'long ' + Kit.num(car.long) });
      items.push({ id: 'first60', text: 'First 60-yarder', done: !!f['ms:first60'] || car.long >= 60, prog: car.long >= 60 ? 'done' : 'long ' + Kit.num(car.long) });
      items.push({ id: 'streak', text: (M.consecutive || 20) + ' straight makes', done: !!f['ms:STREAK' + (M.consecutive || 20)] || !!f['ms:streak'] || car.bestConsecutive >= (M.consecutive || 20), prog: 'best ' + Kit.num(car.bestConsecutive) });
      items.push({ id: 'gw', text: (M.gw || 10) + ' game-winners', done: !!f['ms:GW' + (M.gw || 10)] || car.gameWinners >= (M.gw || 10), prog: Kit.num(car.gameWinners) + ' / ' + (M.gw || 10) });
      return c.card({ title: 'MILESTONES', icon: 'star', body: c.list(items, function (m) {
        return c.el('span', { class: 'row row-between grow ms-row' + (m.done ? ' done' : '') }, c.el('span', { class: 'row' }, c.icon(m.done ? 'check' : 'more', 12), c.el('span', { class: 'small', text: m.text })), Kit.tip(c.el('span', { class: 'small num ' + (m.done ? 'txt-mint' : 'txt-grey'), text: m.done ? 'DONE' : m.prog }), 'Each milestone pays fame once'));
      }) });
    }

    function render() {
      if (destroyed) return;
      var state = store.state;
      var parts = [c.el('header', { class: 'screen-head' }, c.el('h1', { class: 'screen-title', text: 'RECORDS' }))];
      if (!state) { parts.push(c.card({ body: c.el('p', { text: 'No career loaded.' }) })); c.replace(el, parts); return; }
      var all = [];
      try { all = RTG.Stats.compareToLegends(state); } catch (e) { all = []; }
      if (!tab) tab = (state.player.league === 'NFL' || state.stage === 'NFL' || state.stage === 'RETIRED') ? 'NFL' : 'COLLEGE';
      parts.push(c.tabs({ items: [{ id: 'COLLEGE', label: 'COLLEGE' }, { id: 'NFL', label: 'PRO' }], active: tab, onChange: function (id) { tab = id; render(); } }));
      var rows = all.filter(function (r) { return r.league === tab; });
      var held = rows.filter(function (r) { return r.isUser; }).length;
      parts.push(c.el('p', { class: 'small txt-grey mb-1', text: held ? 'You hold ' + held + ' ' + (tab === 'NFL' ? 'pro' : 'college') + ' record' + (held === 1 ? '' : 's') + '.' : 'Legends of the ' + (tab === 'NFL' ? 'pro game' : 'college game') + ' — beat a mark and your name goes up in gold.' }));
      parts.push(recordsTable(state, rows));
      parts.push(chaseLines(state, rows, tab));
      parts.push(milestones(state));
      c.replace(el, parts);
    }

    render();
    unsub = store.subscribe(function () { render(); });
    return { el: el, destroy: function () { destroyed = true; if (unsub) unsub(); unsub = null; } };
  }

  Screens.records = factory;
  RTG.UI.Router.register('records', factory);
})(typeof window !== 'undefined' ? window : globalThis);
