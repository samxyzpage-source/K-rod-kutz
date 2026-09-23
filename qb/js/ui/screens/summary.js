/**
 * Road to Glory: QB — 'summary' screen: the drive's box score. The line (CMP/ATT, YDS, TD, INT, SACKS, RUSH), the
 * passer rating (Play.rating, NFL formula), the best throw, the verdict line, the six moments one per row, and
 * PLAY AGAIN (the same seed, the same picks — the same script) / NEW DRIVE (a new seed, the same picks) / TITLE.
 *
 *   RTG.UI.Screens.summary(store) → {el, destroy, onKey}
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Screens = RTG.UI.Screens = RTG.UI.Screens || {};

  var KIND_SHORT = { THIRD_MEDIUM: '3RD & MED', THIRD_LONG: '3RD & LONG', RED_ZONE: 'RED ZONE', SHORT_YARDAGE: 'SHORT YDG', TWO_MINUTE: '2-MIN DRILL', LAST_PLAY: 'LAST PLAY' };
  var TEAM_LABEL = { BAD: 'BAD LINE', AVERAGE: 'AVERAGE', GREAT: 'GREAT LINE' };

  function ratingTier(r) {
    if (r >= 120) return 'LIGHTS OUT';
    if (r >= 100) return 'SHARP';
    if (r >= 80) return 'SOLID';
    if (r >= 60) return 'SHAKY';
    return 'ROUGH';
  }

  function rowKind(r) {
    if (r.td) return 'gold';
    if (r.outcome === 'INT' || r.turnover) return 'red';
    if (r.outcome === 'CATCH' || r.firstDown || ((r.outcome === 'SCRAMBLE' || r.outcome === 'RUN') && r.yards > 0)) return 'mint';
    return 'grey';
  }

  function factory(store) {
    var C = RTG.UI.C, app = RTG.UI.app;
    var s = store.summary();
    var el = C.el('div', { class: 'screen summary-screen' });
    if (!s) {
      el.appendChild(C.card({ title: 'THE BOX SCORE', body: C.el('p', { class: 'txt-grey', text: 'No drive to score. Start one from the title.' }), footer: C.button({ label: 'TITLE', kind: 'primary', onClick: function () { app.go('title'); } }) }));
      return { el: el, destroy: function () {} };
    }
    var l = s.line;

    el.appendChild(C.el('header', { class: 'screen-head summary-head' },
      C.el('h1', { class: 'screen-title', text: s.won ? 'YOU WON IT' : (s.done ? 'THE BOX SCORE' : 'THE DRIVE SO FAR') }),
      C.el('div', { class: 'screen-head-right' }, C.chip(s.archetype.replace('_', ' '), 'gold'), C.chip(TEAM_LABEL[s.team] || s.team, 'dark'), C.chip(s.venue, 'dark'))));

    // ── the line ──
    var big = C.el('div', { class: 'sum-rating', role: 'group', 'aria-label': 'Passer rating ' + s.rating });
    big.appendChild(C.el('span', { class: 'sum-rating-num huge num', 'data-rating': String(s.rating), text: s.rating.toFixed(1) }));
    big.appendChild(C.el('span', { class: 'sum-rating-label small', text: 'PASSER RATING · ' + ratingTier(s.rating) }));
    var stats = C.el('div', { class: 'sum-stats', role: 'group', 'aria-label': 'The line' });
    function stat(label, value, kind) { stats.appendChild(C.el('div', { class: 'sum-stat' + (kind ? ' sum-stat-' + kind : '') }, C.el('b', { class: 'num', text: String(value) }), C.el('span', { class: 'small txt-grey', text: label }))); }
    stat('CMP / ATT', l.cmp + '/' + l.att);
    stat('YARDS', l.yds);
    stat('TD', l.td, l.td ? 'mint' : '');
    stat('INT', l.int, l.int ? 'red' : '');
    stat('SACKS', l.sacks + (l.sackYds ? ' (' + l.sackYds + ')' : ''));
    stat('RUSH', l.rushes ? l.rushYds + ' on ' + l.rushes : '—');
    var lineCard = C.card({ title: 'THE LINE', class: 'sum-line', body: [big, stats,
      C.el('p', { class: 'small txt-grey center mt-1', text: 'LONG ' + (l.long || '—') + ' · FIRST DOWNS ' + l.firstDowns + ' · TURNOVERS ' + l.turnovers }) ] });
    el.appendChild(lineCard);

    // ── the best throw + the verdict ──
    var best = s.best;
    el.appendChild(C.card({ title: 'THE BEST THROW', kind: best ? 'gold' : '', class: 'sum-best', body: [
      C.el('p', { class: 'sum-best-text' + (best ? ' txt-gold' : ' txt-grey'), 'data-best': best ? '1' : '0', text: best ? best.text : 'No completion to speak of.' }),
      best && best.sub ? C.el('p', { class: 'small txt-grey', text: best.sub }) : null
    ] }));
    el.appendChild(C.card({ title: 'THE VERDICT', class: 'sum-verdict', body: C.el('p', { class: 'sum-verdict-text', 'data-verdict': '1', text: s.verdict }) }));

    // ── the six moments ──
    var rows = C.el('div', { class: 'sum-moments' });
    s.results.forEach(function (r) {
      var row = C.el('div', { class: 'sum-row sum-row-' + rowKind(r), 'data-idx': String(r.idx), 'data-outcome': r.outcome });
      row.appendChild(C.el('span', { class: 'sum-row-kind small', text: (r.idx + 1) + ' · ' + (KIND_SHORT[r.kind] || r.kind) }));
      row.appendChild(C.el('span', { class: 'sum-row-sit small txt-grey', text: 'Q' + r.quarter + ' ' + (RTG.Play.downText ? RTG.Play.downText(r) : r.down + ' & ' + r.toGo) + ' · ' + (RTG.Play.spotText ? RTG.Play.spotText(r.yl) : r.yl) }));
      row.appendChild(C.el('span', { class: 'sum-row-play small', text: (r.playName || r.play || '') + (r.targetName ? ' → ' + r.targetName : '') }));
      row.appendChild(C.el('span', { class: 'sum-row-res num', text: r.banner || r.text || r.outcome }));
      rows.appendChild(row);
    });
    el.appendChild(C.card({ title: 'SIX SNAPS', class: 'sum-snaps', body: rows }));

    // ── actions ──
    var again = C.button({ label: 'PLAY AGAIN', kind: 'primary', block: true, icon: 'ball', action: 'again', onClick: function () {
      app.startDrive({ seed: s.seed, archetype: s.archetype, team: s.team, venue: s.venue });
    } });
    var fresh = C.button({ label: 'NEW DRIVE', kind: 'secondary', block: true, icon: 'dice', action: 'new', onClick: function () {
      app.startDrive({ seed: '', archetype: s.archetype, team: s.team, venue: s.venue });
    } });
    var title = C.button({ label: 'TITLE', kind: 'ghost', block: true, icon: 'arrow-l', action: 'title', onClick: function () { app.go('title', { seed: s.seed, archetype: s.archetype, team: s.team, venue: s.venue }); } });
    el.appendChild(C.el('div', { class: 'sum-actions stack' }, again, fresh, title));
    el.appendChild(C.el('p', { class: 'small txt-grey center', text: 'seed ' + s.seed + ' · PLAY AGAIN replays this script' }));

    root.setTimeout(function () { try { again.focus(); } catch (e) { /* ignore */ } }, 0);
    C.announce('The box score. Passer rating ' + s.rating.toFixed(1) + '. ' + s.verdict);

    return {
      el: el,
      destroy: function () {},
      onKey: function (ev) {
        if (ev.key === 'Enter' && ev.target === root.document.body) { again.click(); return true; }
        return false;
      }
    };
  }

  Screens.summary = factory;
})(typeof window !== 'undefined' ? window : globalThis);
