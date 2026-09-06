/**
 * Road to Glory: Kicker — screen 'standings' (SPEC §4.5 standings row, §2.6).
 *
 * NFL: tabs DIVISION (the four divisions of a conference, with a conference switch) / CONFERENCE (16 rows with the
 * seeds) / BRACKET in POST. College: CONFERENCE (conference record + overall, with a conference switch) / TOP 25
 * (poll with movement) / PLAYOFF PICTURE (projected 12-team field from the poll and the conference leaders; the
 * bracket itself once the postseason starts). Rows come from state.season.standings (Standings.rowsIn) and
 * state.season.rankings (Standings.topN); the user's team is gold. A tiebreak note explains the chains.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Screens = RTG.UI.Screens = RTG.UI.Screens || {};

  function C() { return RTG.UI.C; }
  function K() { return RTG.UI.Kit; }

  var NOTE = {
    COLLEGE: 'Tiebreaks (conference): head-to-head → record vs common opponents → poll score → seeded coin. Playoff: the 5 best-ranked conference champions plus 7 at-large; seeds 1–4 get a bye.',
    NFL: 'Tiebreaks (division): head-to-head → division record → common games → conference record → point differential → seeded coin. Wild cards: head-to-head sweep → conference record → common games → point differential.'
  };

  function factory(store, params) {
    var c = C(), Kit = K();
    var el = c.el('div', { class: 'screen scr-standings' });
    var unsub = null, destroyed = false;
    var tab = params && params.tab || null, conf = null;

    function recText(r) { return RTG.Standings && RTG.Standings.recordString ? RTG.Standings.recordString(r) : (r.w + '-' + r.l); }
    function teamCell(state, id) { return c.el('span', { class: 'row' }, c.crest(id, 18), c.el('span', { class: 'ellipsis st-name', text: Kit.teamName(id) })); }
    function userRow(state) { return function (r) { return r.teamId === state.player.teamId ? 'user' : ''; }; }

    function confSelect(state, confs, current, onChange) {
      var sel = c.el('select', { class: 'input st-select', 'aria-label': 'Conference', onChange: function () { onChange(sel.value); } });
      confs.forEach(function (cf) { sel.appendChild(c.el('option', { value: cf.id, text: cf.name, selected: cf.id === current })); });
      return c.el('div', { class: 'field st-field' }, sel);
    }

    function collegeConfs() {
      var list = RTG.Data && RTG.Data.conferences || [];
      return list.map(function (cf) { return { id: cf.id, name: cf.name }; });
    }
    function nflConfs() { return [{ id: 'Liberty', name: 'Liberty' }, { id: 'Frontier', name: 'Frontier' }]; }
    function userConf(state) { var t = Kit.userTeam(state); return t ? t.conf : null; }

    function collegeConference(state) {
      var confs = collegeConfs();
      var cur = conf || userConf(state) || (confs[0] && confs[0].id);
      var rows = RTG.Standings.rowsIn(state.season.standings || [], cur);
      var tbl = c.table([
        { key: 'confRank', label: '#', align: 'r' },
        { key: 'team', label: 'TEAM', render: function (r) { return teamCell(state, r.teamId); } },
        { key: 'conf', label: 'CONF', align: 'r', render: function (r) { return r.confW + '-' + r.confL; } },
        { key: 'rec', label: 'OVERALL', align: 'r', render: recText },
        { key: 'pf', label: 'PF', align: 'r' }, { key: 'pa', label: 'PA', align: 'r' },
        { key: 'poll', label: 'POLL', align: 'r', render: function (r) { return r.pollRank && r.pollRank <= 25 ? '#' + r.pollRank : '—'; } }
      ], rows, { rowClass: userRow(state), compact: true, caption: 'Conference standings' });
      return [confSelect(state, confs, cur, function (v) { conf = v; render(); }), tbl];
    }

    function top25(state) {
      var list = RTG.Standings.topN(state.season.rankings || {}, 25);
      var tbl = c.table([
        { key: 'rank', label: '#', align: 'r' },
        { key: 'team', label: 'TEAM', render: function (r) { return teamCell(state, r.teamId); } },
        { key: 'rec', label: 'RECORD', align: 'r', render: function (r) { return Kit.recordOf(state, r.teamId) || '0-0'; } },
        { key: 'prev', label: 'MOVE', align: 'r', render: function (r) { var d = (r.prev || r.rank) - r.rank; return c.el('span', { class: d > 0 ? 'txt-mint' : d < 0 ? 'txt-red' : 'txt-grey', text: d > 0 ? '▲' + d : d < 0 ? '▼' + (-d) : '—' }); } },
        { key: 'score', label: 'SCORE', align: 'r', render: function (r) { return (r.score * 100).toFixed(1); } }
      ], list, { rowClass: userRow(state), compact: true, caption: 'Top 25 poll' });
      return [c.el('p', { class: 'small txt-grey mb-1', text: 'Poll score: 55 % win rate · 20 % schedule strength · 12 % margin · 13 % prestige, 70/30 sticky week to week.' }), tbl];
    }

    function playoffPicture(state) {
      if (state.season.playoffs) return [Kit.bracketEl(state)];
      var rows = state.season.standings || [], rk = state.season.rankings || {};
      var champs = {};
      rows.forEach(function (r) { if (r.confRank === 1) champs[r.teamId] = r.conf; });
      var list = RTG.Standings.topN(rk, 48);
      var champRows = list.filter(function (r) { return champs[r.teamId]; }).slice(0, 5);
      var inField = {};
      champRows.forEach(function (r) { inField[r.teamId] = 'CHAMP'; });
      var atLarge = list.filter(function (r) { return !inField[r.teamId]; }).slice(0, 7);
      atLarge.forEach(function (r) { inField[r.teamId] = 'AT-LARGE'; });
      var field = list.filter(function (r) { return inField[r.teamId]; }).map(function (r, i) { return { seed: i + 1, teamId: r.teamId, rank: r.rank, how: inField[r.teamId], conf: champs[r.teamId] || '' }; });
      var tbl = c.table([
        { key: 'seed', label: 'SEED', align: 'r', render: function (r) { return r.seed + (r.seed <= 4 ? ' (bye)' : ''); } },
        { key: 'team', label: 'TEAM', render: function (r) { return teamCell(state, r.teamId); } },
        { key: 'rank', label: 'POLL', align: 'r', render: function (r) { return '#' + r.rank; } },
        { key: 'how', label: 'BID', render: function (r) { return c.chip(r.how === 'CHAMP' ? (r.conf + ' CHAMP') : 'AT-LARGE', r.how === 'CHAMP' ? 'gold' : 'grey'); } }
      ], field, { rowClass: userRow(state), compact: true, caption: 'Projected playoff field' });
      return [c.el('p', { class: 'small txt-grey mb-1', text: 'If the season ended today: the five best-ranked conference leaders plus seven at-large teams. Week 13 decides the champions.' }), tbl];
    }

    function nflDivisions(state) {
      var confs = nflConfs();
      var cur = conf || userConf(state) || 'Liberty';
      var divs = RTG.Data && RTG.Data.nflStructure && RTG.Data.nflStructure.divisions || ['North', 'South', 'East', 'West'];
      var out = [confSelect(state, confs, cur, function (v) { conf = v; render(); })];
      divs.forEach(function (d) {
        var rows = RTG.Standings.rowsIn(state.season.standings || [], cur, d);
        out.push(c.el('h3', { class: 'section-title', text: cur + ' ' + d }));
        out.push(c.table([
          { key: 'team', label: 'TEAM', render: function (r) { return teamCell(state, r.teamId); } },
          { key: 'rec', label: 'W-L', align: 'r', render: recText },
          { key: 'pct', label: 'PCT', align: 'r', render: function (r) { return (r.pct || 0).toFixed(3).replace(/^0/, ''); } },
          { key: 'div', label: 'DIV', align: 'r', render: function (r) { return r.divW + '-' + r.divL; } },
          { key: 'confr', label: 'CONF', align: 'r', render: function (r) { return r.confW + '-' + r.confL; } },
          { key: 'diff', label: 'DIFF', align: 'r', render: function (r) { return c.fmt.signed(r.diff || 0); } },
          { key: 'streak', label: 'STRK', align: 'r', render: function (r) { return r.streak ? (r.streak > 0 ? 'W' + r.streak : 'L' + (-r.streak)) : '—'; } }
        ], rows, { rowClass: userRow(state), compact: true, caption: cur + ' ' + d + ' standings' }));
      });
      return out;
    }

    function nflConference(state) {
      var confs = nflConfs();
      var cur = conf || userConf(state) || 'Liberty';
      var rows = RTG.Standings.rowsIn(state.season.standings || [], cur);
      var tbl = c.table([
        { key: 'seed', label: 'SEED', align: 'r', render: function (r) { return r.seed ? String(r.seed) + (r.seed === 1 ? ' (bye)' : '') : '—'; } },
        { key: 'team', label: 'TEAM', render: function (r) { return c.el('span', { class: 'row' }, teamCell(state, r.teamId), r.divChamp ? c.chip(r.div, 'gold') : null); } },
        { key: 'rec', label: 'W-L', align: 'r', render: recText },
        { key: 'confr', label: 'CONF', align: 'r', render: function (r) { return r.confW + '-' + r.confL; } },
        { key: 'diff', label: 'DIFF', align: 'r', render: function (r) { return c.fmt.signed(r.diff || 0); } }
      ], rows, { rowClass: userRow(state), compact: true, caption: cur + ' conference standings' });
      return [confSelect(state, confs, cur, function (v) { conf = v; render(); }), tbl];
    }

    function render() {
      if (destroyed) return;
      var state = store.state;
      var parts = [c.el('header', { class: 'screen-head' }, c.el('h1', { class: 'screen-title', text: 'STANDINGS' }), state ? c.el('div', { class: 'screen-head-right small txt-grey' }, c.el('span', { class: 'num', text: c.fmt.week(state) })) : null)];
      if (!state || !state.season || !state.season.standings || !state.season.standings.length) { parts.push(c.card({ body: c.el('p', { text: 'No standings yet — the season has not started.' }) })); c.replace(el, parts); return; }
      var college = state.season.league === 'COLLEGE';
      var post = !!state.season.playoffs;
      var items = college
        ? [{ id: 'conf', label: 'CONFERENCE' }, { id: 'top25', label: 'TOP 25' }, { id: 'playoff', label: post ? 'BRACKET' : 'PLAYOFF PICTURE', icon: 'trophy' }]
        : [{ id: 'div', label: 'DIVISION' }, { id: 'confn', label: 'CONFERENCE' }].concat(post ? [{ id: 'bracket', label: 'BRACKET', icon: 'trophy' }] : []);
      var ids = items.map(function (i) { return i.id; });
      if (tab === 'bracket' && college) tab = 'playoff';
      if (!tab || ids.indexOf(tab) < 0) tab = post ? (college ? 'playoff' : 'bracket') : ids[0];
      parts.push(c.tabs({ items: items, active: tab, onChange: function (id) { tab = id; render(); } }));
      var body;
      if (tab === 'conf') body = collegeConference(state);
      else if (tab === 'top25') body = top25(state);
      else if (tab === 'playoff') body = playoffPicture(state);
      else if (tab === 'div') body = nflDivisions(state);
      else if (tab === 'confn') body = nflConference(state);
      else body = [Kit.bracketEl(state) || c.el('p', { class: 'txt-grey', text: 'No bracket yet.' })];
      parts.push(c.el('div', { class: 'st-body' }, body));
      parts.push(c.el('p', { class: 'small txt-grey st-note mt-1', text: NOTE[state.season.league] || '' }));
      c.replace(el, parts);
    }

    render();
    unsub = store.subscribe(function () { render(); });
    return { el: el, destroy: function () { destroyed = true; if (unsub) unsub(); unsub = null; } };
  }

  Screens.standings = factory;
  RTG.UI.Router.register('standings', factory);
})(typeof window !== 'undefined' ? window : globalThis);
