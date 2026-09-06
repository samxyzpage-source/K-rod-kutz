/**
 * Road to Glory: Kicker — screen 'schedule' (SPEC §4.5 schedule row).
 *
 * The user's team schedule for the current season (state.season.schedule via Schedule.teamGames): one row per week
 * (byes included) with the opponent crest, home / away, kind chip, the result (W / L / T + score) and your line
 * (from the kick log rows of that game). Tap a played game → box-score modal (score, venue, weather rolled at
 * kickoff, your kicks, the drive log of a user game when the engine kept it). Past seasons live on the Timeline.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Screens = RTG.UI.Screens = RTG.UI.Screens || {};

  function C() { return RTG.UI.C; }
  function K() { return RTG.UI.Kit; }

  function factory(store) {
    var c = C(), Kit = K();
    var el = c.el('div', { class: 'screen scr-schedule' });
    var unsub = null, destroyed = false;

    function weatherText(w) {
      if (!w) return '—';
      var s = String(w.weather || 'clear').toUpperCase();
      if (w.dome) return 'DOME';
      if (typeof w.tempF === 'number') s += ' · ' + Math.round(w.tempF) + '°F';
      if (w.wind && w.wind.speed >= 1) s += ' · ' + (RTG.Weather && RTG.Weather.label ? RTG.Weather.label(w) : 'WIND ' + Math.round(w.wind.speed));
      return s;
    }

    function boxScore(state, g) {
      var me = state.player.teamId, isHome = g.homeId === me;
      var kicks = Kit.gameKicks(state, g.id);
      var body = c.el('div', { class: 'box-score' });
      var led = c.el('div', { class: 'led' },
        c.el('div', { class: 'led-team' }, c.crest(g.awayId, 20), c.el('span', { text: Kit.abbr(g.awayId) }), c.el('span', { class: 'led-score num', text: String(g.score ? g.score.away : '—') })),
        c.el('div', { class: 'led-mid' }, c.el('div', { text: g.played ? 'FINAL' + (g.ot ? ' OT' : '') : 'WK ' + g.week })),
        c.el('div', { class: 'led-team right' }, c.el('span', { class: 'led-score num', text: String(g.score ? g.score.home : '—') }), c.el('span', { text: Kit.abbr(g.homeId) }), c.crest(g.homeId, 20)));
      body.appendChild(led);
      var vi = Kit.venueInfo(state, { game: g, week: g.week, league: state.season.league, isHome: isHome, oppId: isHome ? g.awayId : g.homeId });
      body.appendChild(c.kv([
        ['KIND', Kit.kindLabel(g.kind)],
        ['VENUE', vi.label || (isHome ? 'Home' : 'Away')],
        ['WEATHER', g.played ? weatherText(g.weather) : 'Rolled at kickoff'],
        ['YOUR LINE', c.el('span', { class: 'txt-gold', text: Kit.fgLine(Kit.lineFromKicks(kicks)) })]
      ]));
      if (kicks.length) {
        body.appendChild(c.el('h3', { class: 'section-title', text: 'Your kicks' }));
        body.appendChild(c.table([
          { key: 'q', label: 'Q', render: function (k) { return (k.q > 4 ? 'OT' : 'Q' + k.q) + ' ' + c.fmt.clock(Kit.num(k.clock)); } },
          { key: 'd', label: 'KICK', render: function (k) { return k.type === 'PAT' ? 'PAT' : k.distance + ' YD' + (k.hash ? (k.hash < 0 ? ' L' : ' R') : ''); } },
          { key: 'r', label: 'RESULT', render: function (k) { return c.el('span', { class: k.made ? 'txt-mint' : 'txt-red', text: Kit.outcomeText(k.outcome) }); } },
          { key: 't', label: 'TAGS', render: function (k) { return (k.tags || []).filter(function (t) { return t !== 'auto'; }).join(', ') || '—'; } }
        ], kicks, { compact: true, caption: 'Your kicks in this game' }));
      }
      if (g.log && g.log.length) {
        body.appendChild(c.el('h3', { class: 'section-title', text: 'Drive log' }));
        var log = c.el('div', { class: 'drivelog' });
        g.log.forEach(function (line) { log.appendChild(c.el('div', { class: 'dl-line', text: typeof line === 'string' ? line : (line.text || '') })); });
        body.appendChild(log);
      }
      c.modal({ title: 'WEEK ' + g.week + ' · ' + (isHome ? 'vs ' : '@ ') + Kit.abbr(isHome ? g.awayId : g.homeId), body: body, wide: true, buttons: [{ label: 'CLOSE', kind: 'primary' }] });
    }

    function render() {
      if (destroyed) return;
      var state = store.state;
      var parts = [c.el('header', { class: 'screen-head' }, c.el('h1', { class: 'screen-title', text: 'SCHEDULE' }), state ? c.el('div', { class: 'screen-head-right small txt-grey' }, c.el('span', { class: 'num', text: 'Y' + state.year + ' · ' + Kit.calYear(state.year) })) : null)];
      if (!state || !state.season || !state.season.schedule) { parts.push(c.card({ body: c.el('p', { text: 'No season on the calendar.' }) })); c.replace(el, parts); return; }
      var me = state.player.teamId;
      if (!me) { parts.push(c.card({ kind: 'sky', body: c.el('p', { text: 'No team, no schedule. The phone might ring.' }) })); c.replace(el, parts); return; }
      var games = RTG.Schedule && RTG.Schedule.teamGames ? RTG.Schedule.teamGames(state.season.schedule, me) : [];
      var weeks = RTG.Schedule && RTG.Schedule.weeksFor ? RTG.Schedule.weeksFor(state.season.league) : { reg: 13 };
      var byWeek = {};
      games.forEach(function (g) { byWeek[g.week] = g; });
      var rows = [];
      var last = Math.max(weeks.reg, games.length ? games[games.length - 1].week : 0);
      for (var w = 1; w <= last; w++) rows.push({ week: w, game: byWeek[w] || null });
      var rec = Kit.recordOf(state, me);
      var ul = c.el('ul', { class: 'list list-clickable sched-list', 'aria-label': 'Schedule' });
      rows.forEach(function (r) {
        var g = r.game, li = c.el('li', { class: 'list-row sched-row' + (r.week === state.week ? ' current' : '') + (g && g.played ? ' played' : '') });
        li.appendChild(c.el('span', { class: 'sched-week num txt-grey', text: 'WK ' + r.week }));
        if (!g) {
          if (r.week > weeks.reg) return;
          li.appendChild(c.el('span', { class: 'grow small txt-grey', text: 'BYE' }));
          ul.appendChild(li);
          return;
        }
        var isHome = g.homeId === me, opp = isHome ? g.awayId : g.homeId;
        var mid = c.el('span', { class: 'grow col', style: 'gap:2px' },
          c.el('span', { class: 'row' }, c.crest(opp, 20), c.el('span', { class: 'ellipsis', text: (isHome ? 'vs ' : '@ ') + Kit.teamName(opp) })),
          c.el('span', { class: 'row row-wrap small' }, g.kind !== 'REG' ? c.chip(Kit.kindLabel(g.kind), 'gold') : null, g.rivalry ? c.chip('RIVALRY', 'red') : null, Kit.rankChip(state, opp)));
        li.appendChild(mid);
        var right = c.el('span', { class: 'col sched-right', style: 'gap:2px; align-items:flex-end' });
        if (g.played && g.score) {
          var us = isHome ? g.score.home : g.score.away, them = isHome ? g.score.away : g.score.home;
          var res = us > them ? 'W' : us < them ? 'L' : 'T';
          right.appendChild(c.el('span', { class: 'num ' + (res === 'W' ? 'txt-mint' : res === 'L' ? 'txt-red' : 'txt-gold'), text: res + ' ' + us + '-' + them + (g.ot ? ' OT' : '') }));
          var line = Kit.lineFromKicks(Kit.gameKicks(state, g.id));
          right.appendChild(Kit.tip(c.el('span', { class: 'small txt-gold num', text: 'FG ' + line.fgm + '/' + line.fga + (line.pat ? ' · PAT ' + line.patMade + '/' + line.pat : '') }), 'Your line' + (line.long ? ' · long ' + line.long : '')));
          li.setAttribute('tabindex', '0');
          li.setAttribute('role', 'button');
          li.addEventListener('click', function () { boxScore(state, g); });
          li.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); boxScore(state, g); } });
        } else {
          right.appendChild(c.el('span', { class: 'small txt-grey', text: r.week === state.week ? 'THIS WEEK' : '—' }));
        }
        li.appendChild(right);
        ul.appendChild(li);
      });
      parts.push(c.card({ title: Kit.teamName(me), icon: 'clock', right: rec ? Kit.numEl(rec, 'Record') : null, body: ul }));
      c.replace(el, parts);
    }

    render();
    unsub = store.subscribe(function () { render(); });
    return { el: el, destroy: function () { destroyed = true; if (unsub) unsub(); unsub = null; } };
  }

  Screens.schedule = factory;
  RTG.UI.Router.register('schedule', factory);
})(typeof window !== 'undefined' ? window : globalThis);
