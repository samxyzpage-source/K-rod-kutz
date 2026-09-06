/**
 * Road to Glory: Kicker — screen 'stats' (SPEC §4.5 stats row).
 *
 * Tabs: SEASON (stats.season: line, buckets table, clutch / decisive / outcomes) · CAREER (stats.career with the
 * college / NFL blocks and one row per completed season from history.seasons) · SPLITS (distance buckets, weather,
 * hash, pressure from RTG.Stats.rebuildSplits — a rebuildable cache, so calling it is read-only for the game) ·
 * KICK LOG (stats.kicks newest first: week, distance, wind, result, tags — inside a fixed-height scrolling panel).
 * Every number carries a tooltip; every table scrolls inside .scroll-x.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Screens = RTG.UI.Screens = RTG.UI.Screens || {};

  function C() { return RTG.UI.C; }
  function K() { return RTG.UI.Kit; }

  var BUCKETS = ['0-29', '30-39', '40-49', '50-59', '60+'];

  function factory(store, params) {
    var c = C(), Kit = K();
    var el = c.el('div', { class: 'screen scr-stats' });
    var unsub = null, destroyed = false;
    var tab = params && params.tab || 'season';

    function pct(m, a) { return Kit.pctText(m, a); }

    function lineCard(title, s, extra) {
      s = s || {};
      var kv = c.kv([
        ['FG', Kit.numEl(Kit.num(s.fgm) + ' / ' + Kit.num(s.fga) + ' (' + pct(s.fgm, s.fga) + ')', 'Field goals made / attempted')],
        ['PAT', Kit.numEl(Kit.num(s.patMade) + ' / ' + Kit.num(s.pat) + ' (' + pct(s.patMade, s.pat) + ')', 'Extra points made / attempted')],
        ['POINTS', Kit.numEl(Kit.num(s.pts), '3 per field goal, 1 per PAT')],
        ['LONG', Kit.numEl(Kit.num(s.long) + ' yd', 'Longest made field goal')],
        ['50+', Kit.numEl(Kit.num(s.made50plus), 'Makes from 50 yards or more')],
        ['CLUTCH', Kit.numEl(Kit.num(s.clutchM) + ' / ' + Kit.num(s.clutchA), 'Kicks at pressure 0.6 or more')],
        ['DECISIVE', Kit.numEl(Kit.num(s.decisiveM) + ' / ' + Kit.num(s.decisiveA), 'Game-deciding kicks')],
        ['GAME-WINNERS', Kit.numEl(Kit.num(s.gameWinners) + (s.tieForcers ? ' · TF ' + s.tieForcers : ''), 'Game-winning kicks (and tie-forcers)')],
        ['STREAK', Kit.numEl(Kit.num(s.consecutive) + ' (best ' + Kit.num(s.bestConsecutive) + ')', 'Consecutive field goals made')],
        ['MISSES', Kit.numEl('L ' + Kit.num(s.wideL) + ' · R ' + Kit.num(s.wideR) + ' · SHORT ' + Kit.num(s.short) + ' · BLK ' + Kit.num(s.blocked), 'Wide left · wide right · short · blocked')],
        ['DOINKS', Kit.numEl(Kit.num(s.doinks) + ' (' + Kit.num(s.doinkIn) + ' in)', 'Kicks off the uprights')],
        ['GAMES', Kit.numEl(Kit.num(s.games) + ' (' + Kit.num(s.gamesStarted) + ' starts) · ' + Kit.num(s.wins) + '-' + Kit.num(s.losses), 'Games played (started) · team record in those games')],
        ['KICKOFFS', Kit.numEl(Kit.num(s.koTouchbacks) + ' / ' + Kit.num(s.koCount) + ' TB', 'Touchbacks / kickoffs')]
      ]);
      return c.card({ title: title, icon: 'stats', body: [kv].concat(extra || []) });
    }

    function bucketTable(s, caption) {
      var rows = BUCKETS.map(function (b) { var cell = s && s.buckets && s.buckets[b] || { a: 0, m: 0 }; return { bucket: b, a: cell.a, m: cell.m }; });
      return c.table([
        { key: 'bucket', label: 'YARDS' },
        { key: 'm', label: 'MADE', align: 'r' }, { key: 'a', label: 'ATT', align: 'r' },
        { key: 'pct', label: 'PCT', align: 'r', render: function (r) { return pct(r.m, r.a); } },
        { key: 'bar', label: '', render: function (r) { return c.bar({ label: '', value: r.a ? Math.round(100 * r.m / r.a) : 0, max: 100, noValue: true, kind: r.a && r.m / r.a >= 0.85 ? 'mint' : (r.a && r.m / r.a < 0.6 ? 'red' : '') }); } }
      ], rows, { compact: true, caption: caption });
    }

    function seasonTab(state) {
      var s = state.stats.season;
      return [lineCard('SEASON · Y' + state.year + ' (' + Kit.calYear(state.year) + ')', s, [c.el('h3', { class: 'section-title', text: 'By distance' }), bucketTable(s, 'Season field goals by distance')])];
    }

    function careerTab(state) {
      var st = state.stats, h = state.history.seasons || [];
      var out = [lineCard('CAREER', st.career, [c.el('h3', { class: 'section-title', text: 'By distance' }), bucketTable(st.career, 'Career field goals by distance')])];
      var blocks = c.el('div', { class: 'grid-2' });
      [['COLLEGE', st.college], ['PRO', st.nfl]].forEach(function (b) {
        var s = b[1] || {};
        blocks.appendChild(c.card({ title: b[0], kind: 'flat', body: c.kv([['FG', Kit.num(s.fgm) + '/' + Kit.num(s.fga) + ' (' + pct(s.fgm, s.fga) + ')'], ['PTS', Kit.num(s.pts)], ['LONG', Kit.num(s.long)], ['GW', Kit.num(s.gameWinners)], ['GAMES', Kit.num(s.games)]]) }));
      });
      out.push(blocks);
      var rows = h.slice().reverse().map(function (l) { return l; });
      out.push(c.card({ title: 'SEASONS', icon: 'clock', body: c.table([
        { key: 'year', label: 'YEAR', render: function (l) { return Kit.calYear(l.year); } },
        { key: 'team', label: 'TEAM', render: function (l) { return c.el('span', { class: 'row' }, c.crest(l.teamId, 16), c.el('span', { text: Kit.abbr(l.teamId) })); } },
        { key: 'role', label: 'ROLE' },
        { key: 'fg', label: 'FG', align: 'r', render: function (l) { return l.stats.fgm + '/' + l.stats.fga; } },
        { key: 'pct', label: 'PCT', align: 'r', render: function (l) { return pct(l.stats.fgm, l.stats.fga); } },
        { key: 'long', label: 'LONG', align: 'r', render: function (l) { return l.stats.long; } },
        { key: 'pts', label: 'PTS', align: 'r', render: function (l) { return l.stats.pts; } },
        { key: 'rec', label: 'TEAM', align: 'r', render: function (l) { return c.el('span', { class: 'row', style: 'justify-content:flex-end' }, c.el('span', { text: l.teamRecord }), l.champion ? Kit.tip(c.icon('trophy', 12), 'Champions') : null); } },
        { key: 'grade', label: 'GRD', align: 'r' },
        { key: 'awards', label: 'AWARDS', render: function (l) { return (l.awards || []).length ? (l.awards || []).map(Kit.awardName).join(', ') : '—'; } }
      ], rows, { compact: true, caption: 'Season by season', empty: 'No completed seasons yet.' }) }));
      return out;
    }

    function splitTable(title, map, order, tips) {
      var keys = order || Object.keys(map || {});
      var rows = keys.map(function (k) { var cell = map && map[k] || { a: 0, m: 0 }; return { key: k, a: cell.a, m: cell.m }; }).filter(function (r) { return r.a > 0 || (order && order.length); });
      return c.card({ title: title, kind: 'flat', body: c.table([
        { key: 'key', label: 'SPLIT', render: function (r) { return Kit.tip(c.el('span', { text: String(r.key).toUpperCase() }), tips && tips[r.key] || ''); } },
        { key: 'm', label: 'MADE', align: 'r' }, { key: 'a', label: 'ATT', align: 'r' },
        { key: 'pct', label: 'PCT', align: 'r', render: function (r) { return pct(r.m, r.a); } }
      ], rows, { compact: true, caption: title, empty: 'No kicks yet.' }) });
    }

    function splitsTab(state) {
      var sp = null;
      try { sp = RTG.Stats && RTG.Stats.rebuildSplits ? RTG.Stats.rebuildSplits(state) : state.stats.splits; } catch (e) { sp = state.stats.splits; }
      sp = sp || { byBucket: {}, byWeather: {}, byHash: {}, byPressure: {} };
      return [
        c.el('p', { class: 'small txt-grey mb-1', text: 'Field goals only, whole career (the kick log plus the archived rows).' }),
        splitTable('BY DISTANCE', sp.byBucket, BUCKETS),
        splitTable('BY WEATHER', sp.byWeather, null, { clear: 'Clear skies', rain: 'Rain: slick ball', snow: 'Snow: range and error penalties', wind: 'Windy', dome: 'Indoors', cold: 'Below 40 °F', heat: 'Hot', fog: 'Fog' }),
        splitTable('BY HASH', sp.byHash, ['L', 'M', 'R'], { L: 'Left hash', M: 'Middle', R: 'Right hash' }),
        splitTable('BY PRESSURE', sp.byPressure, ['calm', 'tense', 'clutch'], { calm: 'Low pressure', tense: 'Medium pressure', clutch: 'Pressure 0.6 or more' })
      ];
    }

    function kickLogTab(state) {
      var rows = (state.stats.kicks || []).slice().reverse();
      var tbl = c.table([
        { key: 'wk', label: 'WK', render: function (k) { return 'Y' + k.year + ' W' + k.week; } },
        { key: 'opp', label: 'OPP', render: function (k) { return Kit.abbr(k.oppId); } },
        { key: 'd', label: 'D', align: 'r', render: function (k) { return k.type === 'PAT' ? 'PAT' : k.distance + (k.hash ? (k.hash < 0 ? 'L' : 'R') : ''); } },
        { key: 'wind', label: 'WIND', align: 'r', render: function (k) { return k.wind && k.wind.speed >= 1 ? Math.round(k.wind.speed) + (k.weather && k.weather !== 'clear' ? ' ' + k.weather : '') : (k.weather && k.weather !== 'clear' ? k.weather : '—'); } },
        { key: 'res', label: 'RESULT', render: function (k) { return c.el('span', { class: k.made ? 'txt-mint' : 'txt-red', text: Kit.outcomeText(k.outcome) }); } },
        { key: 'tags', label: 'TAGS', render: function (k) { var t = (k.tags || []).filter(function (x) { return x !== 'auto'; }); return t.length ? c.el('span', { class: 'chips' }, t.map(function (x) { return c.chip(x, x === 'gameWinner' ? 'gold' : x === 'decisive' || x === 'clutch' ? 'red' : 'grey'); })) : (k.auto ? c.el('span', { class: 'txt-grey', text: 'auto' }) : '—'); } }
      ], rows, { compact: true, caption: 'Kick log', empty: 'No kicks logged yet.' });
      tbl.classList.add('kicklog-scroll');
      return [c.el('p', { class: 'small txt-grey mb-1', text: rows.length + ' kick' + (rows.length === 1 ? '' : 's') + ' logged (newest first; older rows are folded into the totals).' }), tbl];
    }

    function render() {
      if (destroyed) return;
      var state = store.state;
      var parts = [c.el('header', { class: 'screen-head' }, c.el('h1', { class: 'screen-title', text: 'STATS' }))];
      if (!state) { parts.push(c.card({ body: c.el('p', { text: 'No career loaded.' }) })); c.replace(el, parts); return; }
      parts.push(c.tabs({ items: [{ id: 'season', label: 'SEASON' }, { id: 'career', label: 'CAREER' }, { id: 'splits', label: 'SPLITS' }, { id: 'log', label: 'KICK LOG' }], active: tab, onChange: function (id) { tab = id; render(); } }));
      var body = tab === 'career' ? careerTab(state) : tab === 'splits' ? splitsTab(state) : tab === 'log' ? kickLogTab(state) : seasonTab(state);
      parts.push(c.el('div', { class: 'stats-body' }, body));
      c.replace(el, parts);
    }

    render();
    unsub = store.subscribe(function () { render(); });
    return { el: el, destroy: function () { destroyed = true; if (unsub) unsub(); unsub = null; } };
  }

  Screens.stats = factory;
  RTG.UI.Router.register('stats', factory);
})(typeof window !== 'undefined' ? window : globalThis);
