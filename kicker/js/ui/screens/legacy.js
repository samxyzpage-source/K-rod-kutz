/**
 * Road to Glory: Kicker — screen 'legacy' (SPEC §4.5 legacy row, §2.7.9).
 *
 * The retirement report: bust portrait from player.look, the legacy tier, the HOF score meter with tick marks at
 * the verdict thresholds (Tuning.hof.verdicts), the verdict text and breakdown (Awards.hofScore), the career line
 * (Stats.careerLine), the top-10 moments carousel (Stats.topMoments), the records held (Stats.compareToLegends),
 * the documentary title, the seed code (tap to copy) and NEW CAREER. The pending HOF decision is acknowledged with
 * dispatch('decide', {kind:'HOF', optionId:'OK'}); the cross-save record (rtg.records) is written once per
 * seed + retirement year through store.addCareerRecord(...).
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Screens = RTG.UI.Screens = RTG.UI.Screens || {};

  function C() { return RTG.UI.C; }
  function K() { return RTG.UI.Kit; }

  var VERDICT_TEXT = {
    FIRST_BALLOT: 'First-ballot Hall of Famer. The bust is already being cast.',
    INDUCTED: 'Inducted into the Hall of Fame.',
    FINALIST: 'A finalist — the debate rages on every winter.',
    NOT_ON_BALLOT: 'Not on the ballot. The film room remembers.'
  };

  function factory(store) {
    var c = C(), Kit = K(), R = RTG.UI.Router;
    var el = c.el('div', { class: 'screen scr-legacy' });
    var unsub = null, destroyed = false, momentIdx = 0;

    function report(state) {
      var pd = state.pending, dec = pd && pd.kind === 'DECISION' && pd.decision.kind === 'HOF' ? pd.decision : null;
      var pl = dec ? dec.payload : (state.flags && state.flags.legacy) || {};
      var hof = null;
      try { hof = RTG.Awards && RTG.Awards.hofScore ? RTG.Awards.hofScore(state) : null; } catch (e) { hof = null; }
      return {
        pending: !!dec,
        score: typeof pl.score === 'number' ? pl.score : (hof ? hof.score : 0),
        verdict: pl.verdict || (hof ? hof.verdict : 'NOT_ON_BALLOT'),
        tier: pl.tier || (hof ? hof.tier : ''),
        inductionYear: pl.inductionYear !== undefined ? pl.inductionYear : (hof ? hof.inductionYear : null),
        breakdown: pl.breakdown || (hof ? hof.breakdown : []),
        multiplier: hof ? hof.multiplier : 1,
        docTitle: pl.docTitle || '',
        reason: pl.reason || '',
        age: pl.age || state.player.age
      };
    }

    function bust(state, rep) {
      var p = state.player;
      var wrap = c.el('div', { class: 'bust' });
      wrap.appendChild(c.el('div', { class: 'bust-frame' }, c.pixelAvatar(p.look, 96)));
      wrap.appendChild(c.el('div', { class: 'bust-plate' }, c.el('strong', { class: 'bust-name', text: p.name.full }), c.el('span', { class: 'small', text: (p.hometown ? p.hometown.city + ', ' + p.hometown.state + ' · ' : '') + 'K · ' + p.foot + ' foot' })));
      wrap.appendChild(Kit.tip(c.el('div', { class: 'bust-tier chip chip-gold', text: rep.tier || '—' }), 'Legacy tier: Journeyman · Solid Starter · Franchise Leg · Legend · Immortal'));
      return wrap;
    }

    function hofMeter(rep) {
      var V = RTG.Tuning && RTG.Tuning.hof && RTG.Tuning.hof.verdicts || { finalist: 400, inducted: 550, firstBallot: 750 };
      var max = Math.max(V.firstBallot * 1.15, rep.score * 1.05, 1);
      var pct = function (v) { return Math.max(0, Math.min(100, v / max * 100)).toFixed(1) + '%'; };
      var track = c.el('div', { class: 'hof-track', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': Math.round(max), 'aria-valuenow': Math.round(rep.score), 'aria-label': 'Hall of Fame score' });
      track.appendChild(c.el('div', { class: 'hof-fill', style: { width: pct(rep.score) } }));
      [['finalist', 'FINALIST'], ['inducted', 'INDUCTED'], ['firstBallot', 'FIRST BALLOT']].forEach(function (t) {
        var tick = c.el('div', { class: 'hof-tick' + (rep.score >= V[t[0]] ? ' passed' : ''), style: { left: pct(V[t[0]]) } }, c.el('span', { class: 'hof-tick-label', text: t[1] + ' ' + V[t[0]] }));
        track.appendChild(tick);
      });
      var val = c.el('div', { class: 'row row-between mt-1' }, c.el('span', { class: 'small txt-grey', text: 'HOF SCORE' }), Kit.numEl(String(Math.round(rep.score)), 'Base × ' + (rep.multiplier || 1) + ' (walk-on ×1.15, UDFA ×1.10)', 'txt-gold big'));
      return c.el('div', { class: 'hof-meter' }, val, track);
    }

    function breakdown(rep) {
      var rows = (rep.breakdown || []).filter(function (b) { return b.points; });
      return c.table([
        { key: 'label', label: 'INPUT' },
        { key: 'count', label: 'COUNT', align: 'r', render: function (b) { return String(Math.round(b.count * 100) / 100); } },
        { key: 'weight', label: '×', align: 'r' },
        { key: 'points', label: 'PTS', align: 'r', render: function (b) { return c.el('span', { class: 'txt-gold', text: String(b.points) }); } }
      ], rows, { compact: true, caption: 'Hall of Fame score breakdown', empty: 'No Hall of Fame credit — the pro game never saw the leg.' });
    }

    function careerCard(state) {
      var line = null;
      try { line = RTG.Stats.careerLine(state); } catch (e) { line = null; }
      if (!line) return null;
      var kv = c.kv([
        ['FG', Kit.numEl(line.fgm + ' / ' + line.fga + ' (' + c.fmt.pct(line.pct) + ')', 'Career field goals')],
        ['PAT', Kit.numEl(line.patMade + ' / ' + line.pat, 'Career extra points')],
        ['POINTS', Kit.numEl(String(line.pts), 'Career points')],
        ['LONG', Kit.numEl(line.long + ' yd', 'Longest make')],
        ['50+', Kit.numEl(String(line.made50plus), 'Makes from 50+')],
        ['GAME-WINNERS', Kit.numEl(String(line.gameWinners), 'Game-winning kicks')],
        ['SEASONS', Kit.numEl(line.seasons + ' (' + line.collegeSeasons + ' college · ' + line.nflSeasons + ' pro)', 'Seasons played')],
        ['GAMES', Kit.numEl(String(line.games), 'Games played')],
        ['EARNINGS', Kit.numEl(c.fmt.money(Kit.num(state.history.earnings)), 'Career earnings')]
      ]);
      return c.card({ title: 'CAREER LINE', icon: 'stats', body: [c.el('p', { class: 'small txt-gold mb-1', text: line.text }), kv] });
    }

    function momentsCard(state) {
      var list = [];
      try { list = RTG.Stats.topMoments(state, 10); } catch (e) { list = []; }
      if (!list.length) return c.card({ title: 'TOP MOMENTS', kind: 'flat', body: c.el('p', { class: 'small txt-grey', text: 'No moments to speak of.' }) });
      if (momentIdx >= list.length) momentIdx = 0;
      var m = list[momentIdx];
      var slide = c.el('div', { class: 'moment', role: 'group', 'aria-label': 'Moment ' + (momentIdx + 1) + ' of ' + list.length },
        c.el('div', { class: 'row row-between small txt-grey' }, c.el('span', { text: '#' + (momentIdx + 1) + ' · ' + Kit.calYear(m.year) + ' · WK ' + m.week + ' · ' + (m.league === 'NFL' ? 'PRO' : m.league) }), Kit.tip(c.el('span', { class: 'num txt-gold', text: Math.round(m.score) + ' pts' }), 'Moment score: pressure × distance (× 0.6 on a miss) + 40 decisive + 20 doink + 15 playoff')),
        c.el('p', { class: 'moment-text', text: m.text }),
        c.el('div', { class: 'chips' }, c.chip(m.distance + ' YD', m.made ? 'mint' : 'red'), (m.tags || []).filter(function (t) { return t !== 'auto'; }).map(function (t) { return c.chip(t, t === 'gameWinner' ? 'gold' : 'grey'); })));
      var nav = c.el('div', { class: 'carousel-nav row row-between mt-1' },
        c.button({ kind: 'ghost', icon: 'arrow-l', ariaLabel: 'Previous moment', small: true, disabled: momentIdx === 0, onClick: function () { momentIdx--; render(); } }),
        c.el('span', { class: 'small txt-grey num', text: (momentIdx + 1) + ' / ' + list.length }),
        c.button({ kind: 'ghost', icon: 'arrow-r', ariaLabel: 'Next moment', small: true, disabled: momentIdx >= list.length - 1, onClick: function () { momentIdx++; render(); } }));
      return c.card({ title: 'TOP MOMENTS', icon: 'bolt', body: [slide, nav] });
    }

    function recordsCard(state) {
      var held = [];
      try { held = RTG.Stats.compareToLegends(state).filter(function (r) { return r.isUser; }); } catch (e) { held = []; }
      return c.card({ title: 'RECORDS HELD', icon: 'star', kind: held.length ? 'gold' : 'flat', body: c.list(held, function (r) { return c.el('span', { class: 'row row-between grow' }, c.el('span', { class: 'small', text: (r.league === 'NFL' ? 'PRO · ' : 'COLLEGE · ') + r.label }), c.el('span', { class: 'txt-gold num', text: String(r.record) + (r.key === 'longFG' ? ' yd' : '') })); }, { empty: 'The record book kept its old names.' }) });
    }

    function copySeed(seed) {
      var text = String(seed);
      var done = function () { c.toast('Seed ' + text + ' copied', 'good'); c.announce('Seed copied.'); };
      if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) { root.navigator.clipboard.writeText(text).then(done, function () { fallback(); }); }
      else fallback();
      function fallback() {
        var ta = c.el('textarea', { value: text, style: 'position:fixed;left:-1000px;top:0', 'aria-hidden': 'true' });
        root.document.body.appendChild(ta); ta.select();
        try { root.document.execCommand('copy'); done(); } catch (e) { c.toast('Seed: ' + text, 'info', 4000); }
        root.document.body.removeChild(ta);
      }
    }

    function writeRecord(state, rep) {
      var key = String(state.seed) + ':' + (rep.retiredYear || state.year);
      var recs = store.getRecords();
      for (var i = 0; i < recs.careers.length; i++) if (String(recs.careers[i].seed) + ':' + recs.careers[i].retiredYear === key) return false;
      var line = null;
      try { line = RTG.Stats.careerLine(state); } catch (e) { line = {}; }
      store.addCareerRecord({ seed: state.seed, name: state.player.name.full, tier: rep.tier, hof: Math.round(rep.score), fgm: Kit.num(line && line.fgm), long: Kit.num(line && line.long), gw: Kit.num(line && line.gameWinners), seasons: Kit.num(line && line.seasons), retiredYear: rep.retiredYear || state.year, verdict: rep.verdict });
      return true;
    }

    function ack(state) {
      var rep = report(state);
      rep.retiredYear = state.year;
      var r = Kit.dispatch(store, 'decide', { kind: 'HOF', optionId: 'OK' });
      if (r === undefined) return;
      writeRecord(store.state, rep);
      c.announce('Career recorded. ' + (VERDICT_TEXT[rep.verdict] || ''));
      c.toast('Career saved to the records board', 'gold', 3000);
    }

    function render() {
      if (destroyed) return;
      var state = store.state;
      var parts = [c.el('header', { class: 'screen-head' }, c.el('h1', { class: 'screen-title', text: 'LEGACY' }))];
      if (!state) { parts.push(c.card({ body: c.el('p', { text: 'No career loaded.' }) })); c.replace(el, parts); return; }
      var rep = report(state);
      if (state.stage !== 'RETIRED' && !rep.pending) {
        parts.push(c.card({ kind: 'sky', body: c.el('p', { text: 'The legacy report is written at retirement. Until then: the timeline.' }), footer: [c.button({ label: 'TIMELINE', kind: 'primary', icon: 'star', onClick: function () { R.go('timeline'); } })] }));
        c.replace(el, parts);
        return;
      }
      var head = c.card({ kind: 'gold', class: 'legacy-head', body: [bust(state, rep), hofMeter(rep),
        c.el('p', { class: 'legacy-verdict center mt-1', text: VERDICT_TEXT[rep.verdict] || rep.verdict }),
        rep.inductionYear ? c.el('p', { class: 'small center txt-grey', text: 'Induction: year ' + rep.inductionYear + ' of eligibility' }) : null,
        c.el('p', { class: 'small center txt-grey', text: 'Retired at ' + rep.age + (rep.reason && rep.reason !== 'CHOICE' ? ' · ' + String(rep.reason).replace(/_/g, ' ').toLowerCase() : '') })] });
      parts.push(head);
      if (rep.docTitle) parts.push(c.card({ kind: 'flat', class: 'doc-card', body: c.el('div', { class: 'center' }, c.el('span', { class: 'small txt-grey', text: 'THE DOCUMENTARY' }), c.el('p', { class: 'doc-title', text: '“' + rep.docTitle + '”' })) }));
      if (rep.pending) parts.push(c.el('div', { class: 'btn-row' }, c.button({ label: 'TAKE A BOW', kind: 'primary', block: true, icon: 'trophy', action: 'ack', onClick: Kit.safe(function () { ack(state); }) })));
      parts.push(careerCard(state));
      parts.push(momentsCard(state));
      parts.push(c.card({ title: 'HALL OF FAME MATH', kind: 'flat', body: breakdown(rep) }));
      parts.push(recordsCard(state));
      var seedBtn = c.el('button', { type: 'button', class: 'btn btn-secondary seed-btn', 'data-seed': String(state.seed), 'aria-label': 'Copy seed ' + state.seed, onClick: function () { copySeed(state.seed); } }, c.icon('save', 12), c.el('span', { class: 'btn-label num', text: 'SEED ' + state.seed }));
      parts.push(c.card({ title: 'REPLAY THIS CAREER', kind: 'flat', body: [c.el('p', { class: 'small txt-grey mb-1', text: 'Same seed, same showcase, same offers — different choices. Tap to copy.' }), seedBtn] }));
      parts.push(c.el('div', { class: 'btn-row legacy-actions' },
        c.button({ label: 'TIMELINE', kind: 'ghost', icon: 'clock', onClick: function () { R.go('timeline'); } }),
        c.button({ label: 'NEW CAREER', kind: rep.pending ? 'secondary' : 'primary', icon: 'boot', action: 'new-career', onClick: function () {
          c.confirm({ title: 'Start a new career?', text: rep.pending ? 'Take a bow first to record this one on the board.' : 'This career stays in the records board and its autosave is kept until the next one saves.', okLabel: 'NEW CAREER' })
            .onOk(function () { store.autosave(); store.clear(); R.go('newcareer'); });
        } })));
      c.replace(el, parts);
    }

    render();
    unsub = store.subscribe(function () { render(); });
    return { el: el, destroy: function () { destroyed = true; if (unsub) unsub(); unsub = null; } };
  }

  Screens.legacy = factory;
  RTG.UI.Router.register('legacy', factory);
})(typeof window !== 'undefined' ? window : globalThis);
