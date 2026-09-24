/**
 * Road to Glory: Kicker — screen 'awards' (SPEC §4.5 awards row, §2.8).
 *
 * The awards ceremony at phase AWARDS from state.season.awardsList (Awards.compute output): your awards as
 * envelopes that open one after another (600 ms flap animation, staggered; instant under reduced motion — the
 * timers are cancelled in destroy) revealing the trophy, the award name / description and the XP / fame chips;
 * the season goals with their met / missed results and XP; the league honours (other winners, "a punter won it").
 * CONTINUE → dispatch('nextPhase') (→ the offseason wizard).
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Screens = RTG.UI.Screens = RTG.UI.Screens || {};

  function C() { return RTG.UI.C; }
  function K() { return RTG.UI.Kit; }

  function factory(store) {
    var c = C(), Kit = K(), R = RTG.UI.Router;
    var el = c.el('div', { class: 'screen scr-awards' });
    var unsub = null, destroyed = false, timers = [];
    var opened = {};

    function clearTimers() { timers.forEach(function (t) { root.clearTimeout(t); }); timers = []; }

    function desc(id) { var d = RTG.Data && RTG.Data.awardsById && RTG.Data.awardsById[id]; return d ? d.description : ''; }

    function envelope(a, i, instant) {
      var key = a.id + ':' + (a.week || 0) + ':' + i;
      var isOpen = instant || opened[key];
      var card = c.el('div', { class: 'envelope' + (isOpen ? ' open' : ''), 'data-award': a.id, role: 'group', 'aria-label': a.name });
      var flap = c.el('div', { class: 'env-flap', 'aria-hidden': 'true' }, c.icon('envelope', 28));
      var inner = c.el('div', { class: 'env-inner' },
        c.el('div', { class: 'env-trophy' }, c.icon('trophy', 28)),
        c.el('strong', { class: 'env-name', text: a.name || Kit.awardName(a.id) }),
        a.week ? c.el('span', { class: 'small txt-grey', text: 'Week ' + a.week }) : null,
        c.el('span', { class: 'small env-desc', text: desc(a.id) }),
        c.el('span', { class: 'chips mt-1' }, a.xp ? Kit.tip(c.chip('+' + a.xp + ' XP', 'sky', 'bolt'), 'XP added to your pool') : null, a.fame ? Kit.tip(c.chip('+' + a.fame + ' FAME', 'gold', 'star'), 'Fame added') : null, a.value ? Kit.tip(c.chip(a.value + ' YD', 'grey'), 'The season long') : null));
      card.appendChild(flap);
      card.appendChild(inner);
      var openIt = function () { if (opened[key]) return; opened[key] = true; card.classList.add('open'); c.announce('Award: ' + (a.name || a.id)); };
      card.addEventListener('click', openIt);
      card.setAttribute('tabindex', '0');
      card.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openIt(); } });
      if (!isOpen) timers.push(root.setTimeout(function () { if (!destroyed) openIt(); }, 400 + i * 700));
      return card;
    }

    function render() {
      if (destroyed) return;
      clearTimers();
      var state = store.state;
      var parts = [c.el('header', { class: 'screen-head' }, c.el('h1', { class: 'screen-title', text: 'AWARDS' }), state ? c.el('div', { class: 'screen-head-right small txt-grey' }, c.el('span', { class: 'num', text: 'Y' + state.year + ' · ' + Kit.calYear(state.year) })) : null)];
      if (!state) { parts.push(c.card({ body: c.el('p', { text: 'No career loaded.' }) })); c.replace(el, parts); return; }
      var list = state.season && state.season.awardsList || [];
      var mine = list.filter(function (a) { return a.isUser && !a.goal; });
      var goals = list.filter(function (a) { return a.goal; });
      var others = list.filter(function (a) { return !a.isUser && !a.goal; });
      var instant = Kit.reduced();
      var p = state.player;
      parts.push(c.card({ kind: 'flat', body: c.el('div', { class: 'row' }, c.pixelAvatar(p.look, 40), c.el('div', { class: 'col grow', style: 'gap:2px' }, c.el('strong', { text: p.name.full }), c.el('span', { class: 'small txt-grey', text: Kit.teamName(p.teamId) + ' · ' + Kit.fgLine(state.history.seasons.length && state.history.seasons[state.history.seasons.length - 1].year === state.year ? state.history.seasons[state.history.seasons.length - 1].stats : state.stats.season) }))) }));
      if (mine.length) {
        var grid = c.el('div', { class: 'env-grid' });
        mine.forEach(function (a, i) { grid.appendChild(envelope(a, i, instant)); });
        parts.push(c.card({ title: 'YOUR HARDWARE', kind: 'gold', icon: 'trophy', body: [c.el('p', { class: 'small txt-grey mb-1', text: instant ? '' : 'Tap an envelope to open it early.' }), grid] }));
      } else {
        parts.push(c.card({ title: 'YOUR HARDWARE', kind: 'flat', icon: 'trophy', body: c.el('p', { class: 'small txt-grey', text: 'No trophies this season. The voters remember the misses.' }) }));
      }
      var goalRows = (state.season && state.season.goals || []).map(function (g) {
        var paid = goals.filter(function (a) { return a.goalId === g.id; })[0];
        return { g: g, paid: paid };
      });
      parts.push(c.card({ title: 'SEASON GOALS', icon: 'flag', body: c.list(goalRows, function (r) {
        var g = r.g, isPct = g.id === 'FG_PCT';
        var prog = isPct ? c.fmt.pct(Kit.num(g.progress), 0) : String(Math.round(Kit.num(g.progress)));
        var tgt = isPct ? c.fmt.pct(Kit.num(g.target), 0) : String(g.target);
        return c.el('span', { class: 'row row-between grow goal-row' + (g.met ? ' met' : ' missed') }, c.el('span', { class: 'row' }, c.icon(g.met ? 'check' : 'x', 12), c.el('span', { class: 'small', text: g.text })), c.el('span', { class: 'row small' }, Kit.numEl(prog + ' / ' + tgt, 'Final progress'), Kit.tip(c.chip(g.met ? '+' + (r.paid ? r.paid.xp : g.xp) + ' XP' : 'MISSED', g.met ? 'mint' : 'red'), g.met ? 'Paid now' : 'No XP for a missed goal')));
      }, { empty: 'No goals were set this season.' }) }));
      if (others.length) {
        parts.push(c.card({ title: 'LEAGUE HONOURS', kind: 'flat', body: c.list(others, function (a) {
          return c.el('span', { class: 'row grow' }, a.teamId ? c.crest(a.teamId, 20) : c.icon('trophy', 14), c.el('span', { class: 'col grow', style: 'gap:0' }, c.el('span', { class: 'small', text: a.name }), c.el('span', { class: 'small txt-grey', text: (a.note ? a.kickerName + ' — no kicker qualified' : (a.kickerName || '—') + (a.teamId ? ' · ' + Kit.abbr(a.teamId) : '') + (a.conf ? ' · ' + a.conf : '')) })));
        }) }));
      }
      var canGo = state.phase === 'AWARDS' && !state.pending;
      parts.push(c.el('div', { class: 'btn-row' }, c.button({ label: canGo ? 'CONTINUE' : 'GO ON', kind: 'primary', block: true, icon: 'arrow-r', action: 'continue', onClick: Kit.safe(function () {
        if (canGo) { var r = store.dispatch('nextPhase'); c.announce('Offseason. ' + (r && r.pending ? 'A decision is waiting.' : '')); }
        else R.sync({ force: true });
      }) })));
      c.replace(el, parts);
    }

    render();
    unsub = store.subscribe(function () { render(); });
    return {
      el: el,
      destroy: function () { destroyed = true; clearTimers(); if (unsub) unsub(); unsub = null; },
      onKey: function (ev) { if (ev.target && ev.target !== root.document.body && ev.target !== root.document.documentElement) return false; if (ev.key === 'Enter' && !ev.repeat) { var b = el.querySelector('[data-action="continue"]'); if (b) { b.click(); return true; } } return false; }
    };
  }

  Screens.awards = factory;
  RTG.UI.Router.register('awards', factory);
})(typeof window !== 'undefined' ? window : globalThis);
