/**
 * Road to Glory: Kicker — screen 'postgame' (SPEC §4.5 postgame row).
 *
 * The GameSummary comes from params.summary (game.js / the hub's SIM GAME pass the finishUserGame / autoPlayGame
 * result), else from store.lastDispatch when its fnName is finishUserGame / autoPlayGame, else it is rebuilt from
 * state (the week's played game + the kick log) so a reload never leaves a blank screen. Big score with crests
 * (your side in gold), your line in gold (FG x/y · LONG · PAT · GW ★), the letter-grade stamp (300 ms stamp-in;
 * instant under reduced motion), headline card, XP breakdown, meter deltas with arrows, the coach's line, injury /
 * milestone banners, the kick chips. CONTINUE → dispatch('endWeek') then Router.go('hub') + Router.sync() (the
 * postgame is a hub-family screen, so the automatic sync would otherwise stay here).
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Screens = RTG.UI.Screens = RTG.UI.Screens || {};

  function C() { return RTG.UI.C; }
  function K() { return RTG.UI.Kit; }

  /** UI flavour only (no rules): a coach line by grade / result. */
  var COACH_LINES = {
    A: ['“That’s the leg I recruited.”', '“Automatic. Keep it boring.”'],
    B: ['“Good day. Not a great day. Good.”', '“I’ll take it. Clean up the plant foot.”'],
    C: ['“We won’t talk about the one you missed. Everyone else will.”', '“Fine. Fine is not the goal.”'],
    D: ['“I need to trust the leg. Right now I trust the punter.”', '“We’ll look at the film. You won’t enjoy it.”'],
    F: ['“Nothing to say. The scoreboard said it.”', '“There are other kickers, you know.”'],
    NONE: ['“Stay ready. You never know.”']
  };

  function factory(store, params) {
    var c = C(), Kit = K(), R = RTG.UI.Router;
    var el = c.el('div', { class: 'screen scr-postgame' });
    var unsub = null, destroyed = false, stampTimer = null;

    function fromState(state) {
      var ref = RTG.Season && RTG.Season.userGameRef ? RTG.Season.userGameRef(state) : null;
      if (!ref || !ref.played || !ref.game.score) return null;
      var kicks = Kit.gameKicks(state, ref.gameId);
      var line = Kit.lineFromKicks(kicks);
      var us = ref.isHome ? ref.game.score.home : ref.game.score.away, them = ref.isHome ? ref.game.score.away : ref.game.score.home;
      return { gameId: ref.gameId, league: ref.league, week: ref.week, kind: ref.kind, homeId: ref.homeId, awayId: ref.awayId, userSide: ref.isHome ? 'home' : 'away', oppId: ref.oppId,
        score: ref.game.score, won: us > them, tied: us === them, ot: !!ref.game.ot, userLine: { fga: line.fga, fgm: line.fgm, pat: line.pat, patMade: line.patMade, long: line.long, gw: 0, tf: 0 },
        grade: null, xp: null, meters: null, headline: null, kicks: kicks, played: kicks.length > 0, rebuilt: true };
    }

    function summaryOf(state) {
      if (params && params.summary && params.summary.score) return params.summary;
      var ld = store.lastDispatch;
      if (ld && (ld.fnName === 'finishUserGame' || ld.fnName === 'autoPlayGame') && ld.result && ld.result.score) return ld.result;
      return fromState(state);
    }

    function scoreBoard(s) {
      function side(id, sc, isHome) {
        var mine = s.userSide === (isHome ? 'home' : 'away');
        return c.el('div', { class: 'pg-side' + (mine ? ' mine' : '') }, c.crest(id, 48), c.el('span', { class: 'pg-abbr', text: Kit.abbr(id) }), c.el('span', { class: 'pg-score num huge', text: String(sc) }));
      }
      var res = s.tied ? 'TIE' : (s.won ? 'WIN' : 'LOSS');
      return c.el('div', { class: 'pg-board' },
        side(s.awayId, s.score.away, false),
        c.el('div', { class: 'pg-mid' }, c.el('span', { class: 'pg-result ' + (s.won ? 'txt-mint' : s.tied ? 'txt-gold' : 'txt-red'), text: res }), c.el('span', { class: 'small txt-grey', text: 'FINAL' + (s.ot ? ' · OT' : '') })),
        side(s.homeId, s.score.home, true));
    }

    function yourLine(s) {
      var l = s.userLine || {};
      if (s.played === false) return c.el('p', { class: 'pg-line txt-grey center', text: 'You did not kick this week.' });
      var parts = [c.el('span', { class: 'num' }, 'FG ' + Kit.num(l.fgm) + '/' + Kit.num(l.fga)), c.el('span', { class: 'num' }, 'LONG ' + Kit.num(l.long)), c.el('span', { class: 'num' }, 'PAT ' + Kit.num(l.patMade) + '/' + Kit.num(l.pat))];
      if (l.gw) parts.push(Kit.tip(c.el('span', { class: 'pg-gw' }, c.icon('star', 12), ' GW'), 'Game-winning kick'));
      if (l.tf) parts.push(Kit.tip(c.el('span', { class: 'pg-gw' }, c.icon('clock', 12), ' TF'), 'Tie-forcing kick'));
      if (l.made50plus) parts.push(Kit.tip(c.chip(l.made50plus + '× 50+', 'gold'), 'Makes from 50 yards or more'));
      var row = c.el('div', { class: 'pg-line txt-gold row row-wrap center' }, parts);
      Kit.tip(row, 'Your line: field goals made/attempted, longest make, extra points' + (l.pts ? ' · ' + l.pts + ' points' : ''));
      return row;
    }

    function gradeStamp(s) {
      if (!s.grade) return null;
      var st = c.el('div', { class: 'stamp stamp-' + s.grade + ' pg-stamp' + (Kit.reduced() ? ' stamp-instant' : ''), text: s.grade, role: 'img', 'aria-label': 'Game grade ' + s.grade, 'data-grade': s.grade });
      Kit.tip(st, 'A = perfect with 2+ attempts or a game-winner · B ≥ 85 % · C ≥ 70 % · D ≥ 50 % · a decisive miss caps at D');
      return c.el('div', { class: 'pg-stamp-wrap center' }, st);
    }

    function xpCard(s) {
      if (!s.xp) return null;
      var items = c.list(s.xp.items || [], function (it) { return c.el('span', { class: 'row row-between grow' }, c.el('span', { class: 'small', text: it.label }), Kit.numEl('+' + it.xp, 'XP for ' + it.label, 'txt-gold')); }, { empty: 'No XP this game.' });
      var total = c.el('div', { class: 'row row-between pg-xp-total mt-1' }, c.el('strong', { text: 'TOTAL' }), Kit.numEl('+' + Kit.num(s.xp.total) + ' XP', 'Difficulty multiplier ×' + (s.xp.mult || 1), 'txt-gold big'));
      return c.card({ title: 'XP', icon: 'bolt', body: [items, total] });
    }

    function metersCard(s) {
      if (!s.meters) return null;
      var keys = [['morale', 'MORALE'], ['trust', 'TRUST'], ['fans', 'FANS'], ['js', 'JOB'], ['fame', 'FAME']];
      var row = c.el('div', { class: 'chips pg-meters' });
      keys.forEach(function (k) {
        var v = Kit.num(s.meters[k[0]]);
        var chip = c.el('span', { class: 'chip ' + (v > 0 ? 'chip-mint' : v < 0 ? 'chip-red' : 'chip-grey') }, c.icon(v > 0 ? 'arrow-u' : v < 0 ? 'arrow-d' : 'more', 10), ' ' + k[1] + ' ' + (v > 0 ? '+' : '') + Math.round(v * 10) / 10);
        chip.setAttribute('aria-label', k[1] + (v > 0 ? ' up ' : v < 0 ? ' down ' : ' unchanged ') + Math.abs(v));
        row.appendChild(Kit.tip(chip, k[1] + ' change from this game'));
      });
      return c.card({ title: 'METERS', kind: 'flat', body: row });
    }

    function coachLine(state, s) {
      var lines = COACH_LINES[s.played === false ? 'NONE' : (s.grade || 'NONE')] || COACH_LINES.NONE;
      var pick = lines[(Kit.num(s.week) + Kit.num(s.score && s.score.home)) % lines.length];
      var t = Kit.userTeam(state);
      return c.el('div', { class: 'row pg-coach' }, Kit.avatar('coach', 32), c.el('div', { class: 'col grow', style: 'gap:0' }, c.el('span', { class: 'small txt-sky', text: (t && t.coach) || 'COACH' }), c.el('span', { class: 'small', text: pick })));
    }

    function kicksCard(s) {
      var kicks = s.kicks || [];
      if (!kicks.length) return null;
      var wrap = c.el('div', { class: 'chips' });
      kicks.forEach(function (k) { wrap.appendChild(Kit.kickChip(k)); });
      return c.card({ title: 'YOUR KICKS', kind: 'flat', body: wrap });
    }

    function goOn() {
      var r = Kit.dispatch(store, 'endWeek');
      if (r === undefined) return;
      var h = r.headlines && r.headlines.length ? r.headlines[0].text : null;
      if (h) c.toast(h, 'gold', 4000);
      if (r.injuries && r.injuries.isNew) c.toast('INJURED — out ' + r.injuries.weeksLeft + ' week' + (r.injuries.weeksLeft === 1 ? '' : 's'), 'bad', 4000);
      if (r.bench) c.toast('Benched next week', 'bad', 3500);
      if (r.award) c.toast('Award: ' + (r.award.name || r.award.id), 'good', 3500);
      c.announce(h || ('Week ' + r.week + ' is over.'));
      if (R.current() === 'postgame') { R.go('hub', {}, { replace: true }); R.sync(); }
    }

    function render() {
      if (destroyed) return;
      var state = store.state;
      var parts = [];
      if (!state) { c.replace(el, c.card({ body: c.el('p', { text: 'No career loaded.' }) })); return; }
      var s = summaryOf(state);
      parts.push(c.el('header', { class: 'screen-head' }, c.el('h1', { class: 'screen-title', text: 'FINAL' }), c.el('div', { class: 'screen-head-right small txt-grey' }, c.el('span', { class: 'num', text: s ? 'WK ' + s.week + ' · ' + Kit.kindLabel(s.kind) : c.fmt.week(state) }))));
      if (!s) {
        parts.push(c.card({ kind: 'sky', body: c.el('p', { text: 'No game summary to show for this week.' }), footer: [c.button({ label: 'BACK TO HUB', kind: 'primary', onClick: function () { R.go('hub', {}, { replace: true }); } })] }));
        c.replace(el, parts);
        return;
      }
      var board = c.card({ kind: 'team', class: 'pg-card', body: [scoreBoard(s), yourLine(s), gradeStamp(s)] });
      parts.push(board);
      if (s.headline && s.headline.text) parts.push(c.card({ kind: 'gold', class: 'pg-headline', body: c.el('div', { class: 'headline' }, c.el('span', { class: 'headline-tag', text: 'THE WIRE · ' + String(s.headline.tag || '').replace(/_/g, ' ') }), s.headline.text) }));
      if (s.injury) parts.push(c.el('div', { class: 'banner banner-bad small' }, c.icon('heart', 12), ' INJURED — ' + (s.injury.label || s.injury.type) + ' · ' + s.injury.weeksLeft + ' weeks'));
      (s.milestones || []).forEach(function (m) { parts.push(c.el('div', { class: 'banner banner-gold small' }, c.icon('trophy', 12), ' ' + (m.text || m.id))); });
      parts.push(xpCard(s));
      parts.push(metersCard(s));
      parts.push(kicksCard(s));
      parts.push(c.card({ kind: 'flat', body: coachLine(state, s) }));
      var canEnd = !state.game && (state.phase === 'REG' || state.phase === 'POST') && !state.pending;
      parts.push(c.el('div', { class: 'btn-row pg-actions' },
        canEnd ? c.button({ label: 'CONTINUE', kind: 'primary', icon: 'arrow-r', block: true, action: 'continue', onClick: Kit.safe(goOn) })
          : c.button({ label: 'BACK TO HUB', kind: 'primary', icon: 'home', block: true, action: 'continue', onClick: function () { R.go('hub', {}, { replace: true }); R.sync(); } })));
      c.replace(el, parts);
      var stamp = el.querySelector('.pg-stamp');
      if (stamp && !Kit.reduced()) {
        stamp.classList.add('stamp-pre');
        stampTimer = root.setTimeout(function () { stampTimer = null; stamp.classList.remove('stamp-pre'); stamp.classList.add('stamp-in'); }, 60);
      }
      if (!announced) {
        announced = true;
        var l = s.userLine || {};
        c.announce('Final ' + s.score.away + ' ' + s.score.home + '. ' + (s.won ? 'A win.' : s.tied ? 'A tie.' : 'A loss.') + ' You went ' + Kit.num(l.fgm) + ' of ' + Kit.num(l.fga) + ' on field goals' + (s.grade ? ', grade ' + s.grade : '') + '.');
      }
    }
    var announced = false;

    render();
    unsub = store.subscribe(function (info) { if (info.fnName !== 'markRead') render(); });
    return {
      el: el,
      destroy: function () { destroyed = true; if (unsub) unsub(); unsub = null; if (stampTimer) root.clearTimeout(stampTimer); },
      onKey: function (ev) { if (ev.target && ev.target !== root.document.body && ev.target !== root.document.documentElement) return false; if (ev.key === 'Enter' && !ev.repeat) { var b = el.querySelector('[data-action="continue"]'); if (b) { b.click(); return true; } } return false; }
    };
  }

  Screens.postgame = factory;
  RTG.UI.Router.register('postgame', factory);
})(typeof window !== 'undefined' ? window : globalThis);
