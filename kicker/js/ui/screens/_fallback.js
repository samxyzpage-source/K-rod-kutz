/**
 * Road to Glory: Kicker — the '_fallback' screen (UI_API.md §Screens).
 *
 * A generic renderer for ANY CareerState, mounted by the Router whenever the intended screen is not registered
 * yet (params.wanted = the intended id). It shows the position in the career, the player, the pending object as
 * cards with the buttons that resolve it, the in-progress game with sim controls, and the phase actions — enough
 * to complete a whole career through the engine before the real screens exist. Re-renders on every store change.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};

  function factory(store, params) {
    var C = RTG.UI.C, Router = RTG.UI.Router;
    var el = C.el('div', { class: 'screen fallback-screen' });
    var unsub = null, destroyed = false;

    function safe(fn) {
      return function () {
        try { return fn.apply(null, arguments); }
        catch (e) { C.toast(String(e.message || e), 'bad', 4000); if (root.console) root.console.error(e); }
      };
    }
    function dispatch() { var s = store; return s.dispatch.apply(s, arguments); }
    function goIfBuilt(id, p) { if (Router.has(id)) { Router.go(id, p || {}); return true; } C.toast('The ' + id + ' screen is not built yet — use the generic buttons.', 'info'); return false; }

    // ───────────────────────── header ─────────────────────────
    function header(state) {
      var wanted = params && params.wanted ? params.wanted : null;
      var info = RTG.Career && RTG.Career.stageInfo ? RTG.Career.stageInfo(state) : { label: '' };
      var head = C.el('header', { class: 'screen-head' });
      head.appendChild(C.el('h1', { class: 'screen-title', text: C.fmt.stage(state) }));
      head.appendChild(C.el('div', { class: 'screen-head-right col small' },
        C.el('span', { class: 'txt-gold num', text: C.fmt.week(state) + ' · ' + C.fmt.calYear(state.year) }),
        C.el('span', { class: 'txt-grey', text: info.label || '' })));
      var out = [head];
      if (wanted && wanted !== 'hub') out.push(C.el('div', { class: 'banner banner-sky small', text: 'GENERIC VIEW — "' + wanted + '" screen not built yet' }));
      if (params && params.error) out.push(C.el('div', { class: 'banner banner-bad small', text: 'Screen error: ' + params.error }));
      return out;
    }

    // ───────────────────────── player ─────────────────────────
    function playerCard(state) {
      var p = state.player, team = RTG.Schema.userTeam(state);
      var ovr = RTG.Player.ovr(p.attrs);
      var top = C.el('div', { class: 'row row-between row-wrap' },
        C.el('div', { class: 'row' }, C.pixelAvatar(p.look, 40), C.el('div', { class: 'col', style: 'gap:2px' },
          C.el('strong', { class: 'txt-gold', text: p.name.full }),
          C.el('span', { class: 'small txt-grey', text: p.archetype + ' · ' + p.foot + ' foot · age ' + p.age + ' · ' + C.stars(p.stars).textContent }))),
        C.el('div', { class: 'row' }, team ? C.crest(team, 32) : null, C.el('div', { class: 'col', style: 'gap:2px' },
          C.el('span', { text: team ? team.name : 'No team' }),
          C.el('span', { class: 'small txt-grey', text: (p.role || 'NONE') + (p.contract ? ' · ' + p.contract.type + ' ' + C.fmt.money(p.contract.aav) + ' × ' + p.contract.years : '') }))));
      var attrs = C.el('div', { class: 'stack mt-1' });
      RTG.Schema.ATTRS.forEach(function (a) { attrs.appendChild(C.bar({ label: a, value: p.attrs[a], pot: p.pot ? p.pot[a] : undefined })); });
      var meters = C.el('div', { class: 'meters-row mt-1' },
        C.meter({ label: 'TRUST', value: p.trust }), C.meter({ label: 'FANS', value: p.fans }),
        C.meter({ label: 'MORALE', value: p.morale }), C.meter({ label: 'JOB', value: p.js, kind: p.js < 25 ? 'red' : '' }));
      var chips = C.el('div', { class: 'chips mt-1' },
        C.chip('OVR ' + ovr, 'gold'), C.chip('XP ' + p.xp, 'sky'), C.chip(RTG.Player.fameTierName(p.fame) + ' ' + p.fame, 'grey'),
        p.injury ? C.chip('INJURED ' + p.injury.weeksLeft + 'w', 'red') : null,
        C.chip('SEED ' + state.seed, 'dark'));
      chips.lastChild.setAttribute('data-seed', String(state.seed));
      return C.card({ title: 'PLAYER', body: [top, attrs, meters, chips] });
    }

    // ───────────────────────── pending ─────────────────────────
    function ctxLine(ctx) {
      if (!ctx) return '—';
      var s = C.fmt.kickType(ctx);
      if (ctx.type !== 'KO') s += ' · ' + C.fmt.hash(ctx.hash);
      if (ctx.wind && ctx.wind.speed) s += ' · wind ' + Math.round(ctx.wind.speed);
      if (ctx.pressure) s += ' · pressure ' + Math.round(ctx.pressure * 100) + '%';
      if (ctx.decisive) s += ' · DECISIVE';
      if (ctx.iced) s += ' · ICED';
      return s;
    }
    function nextIdx(sess) {
      if (sess.kind.indexOf('COMBINE') === 0 && RTG.Draft && RTG.Draft.combineNextIdx) return RTG.Draft.combineNextIdx(sess);
      return sess.results.length < sess.contexts.length ? sess.results.length : -1;
    }
    function resultRow(r, i) {
      if (!r) return C.el('span', { class: 'txt-grey small', text: (i + 1) + '. skipped' });
      var made = r.made || r.touchback;
      return C.el('span', { class: 'row small' }, C.el('span', { class: 'num', text: (i + 1) + '.' }),
        C.chip(r.type === 'KO' ? (r.outcome + (r.hang ? ' ' + r.hang.toFixed(2) + 's' : '')) : (r.distance + ' yd ' + r.outcome), made ? 'mint' : 'red'),
        r.feedback && r.feedback.missBy && r.feedback.missBy.text ? C.el('span', { class: 'txt-grey', text: r.feedback.missBy.text }) : null);
    }
    function sessionCard(state) {
      var sess = state.pending.session, idx = nextIdx(sess), ctx = idx >= 0 ? sess.contexts[idx] : null;
      var body = [];
      body.push(C.el('p', null, C.chip(sess.kind, 'gold'), ' ', C.el('span', { class: 'num', text: sess.results.length + ' / ' + sess.contexts.length + ' kicks' })));
      if (ctx) {
        var model = ctx.type === 'KO' ? null : RTG.Kick.model(ctx, null);
        body.push(C.el('p', { class: 'mt-1' }, C.el('strong', { text: 'NEXT: ' + ctxLine(ctx) })));
        if (model) body.push(C.el('p', { class: 'small txt-grey', text: 'model pMake ' + C.fmt.pct(model.pMake) + ' · max FG ' + Math.round(model.maxFG) + ' yd · σ ' + model.sigmaDeg.toFixed(2) + '°' }));
      }
      if (sess.rival) body.push(C.el('p', { class: 'small mt-1' }, 'Rival ' + (sess.rival.name || '') + ': ' + (sess.rival.results || []).filter(function (r) { return r && r.made; }).length + ' / ' + (sess.rival.results || []).length + ' made'));
      var rows = C.el('div', { class: 'stack mt-1' });
      for (var i = 0; i < sess.results.length; i++) rows.appendChild(resultRow(sess.results[i], i));
      body.push(rows);
      var buttons = [];
      if (ctx) {
        buttons.push(C.button({ label: 'PLAY', kind: 'primary', icon: 'boot', onClick: safe(function () {
          if (RTG.UI.KickView && Router.has('kick')) Router.go('kick', { mode: 'session' });
          else goIfBuilt('kick', { mode: 'session' });
        }) }));
        buttons.push(C.button({ label: 'AUTO KICK', kind: 'secondary', onClick: safe(function () {
          var r = dispatch('sessionKick', null);
          C.announce((r.result.made ? 'Good' : r.result.outcome) + ' from ' + r.result.distance);
          if (r.done) Router.sync(); else render();
        }) }));
        buttons.push(C.button({ label: 'AUTO ALL', kind: 'ghost', onClick: safe(function () {
          var guard = 40, r = null, pd = state.pending;
          while (store.state.pending === pd && guard-- > 0) { r = dispatch('sessionKick', null); if (r.done) break; }
          Router.sync(); render();
        }) }));
      } else {
        buttons.push(C.button({ label: 'CONTINUE', kind: 'primary', onClick: safe(function () { Router.sync(); render(); }) }));
      }
      return C.card({ title: 'KICK SESSION', kind: 'gold', body: body, footer: buttons });
    }

    function eventCard(state) {
      var ev = state.pending.event;
      var body = [C.el('p', { class: 'small txt-sky', text: String(ev.sender || '').toUpperCase() }), C.el('p', { text: ev.text })];
      var buttons = (ev.choices || []).map(function (ch, i) {
        return C.button({ label: ch.label, kind: i === 0 ? 'primary' : 'secondary', title: ch.preview, onClick: safe(function () { dispatch('chooseEvent', i); }) });
      });
      return C.card({ title: ev.title || 'EVENT', kind: 'sky', body: body, footer: buttons });
    }

    function offerCard(o) {
      return C.card({ kind: 'flat', class: 'offer', body: [
        C.el('div', { class: 'row' }, C.crest(o.teamId, 28), C.el('strong', { text: o.teamName || C.teamName(o.teamId) }), o.prestige ? C.stars(o.prestige) : null),
        C.el('div', { class: 'chips mt-1' },
          o.depth ? C.chip(o.depth, o.depth === 'OPEN' ? 'mint' : o.depth === 'STAR' ? 'red' : 'grey') : null,
          o.coach ? C.chip(o.coach, 'sky') : null,
          typeof o.nil === 'number' ? C.chip('NIL $' + o.nil + 'k', 'gold') : null,
          typeof o.aav === 'number' ? C.chip(C.fmt.money(o.aav) + ' × ' + o.years + 'y', 'gold') : null,
          typeof o.gtdPct === 'number' ? C.chip(Math.round(o.gtdPct * 100) + '% gtd', 'grey') : null,
          o.nearHome ? C.chip('NEAR HOME', 'mint') : null, o.safety ? C.chip('SAFETY', 'grey') : null,
          o.startsK1 ? C.chip('STARTER', 'mint') : null)
      ] });
    }
    function payloadKv(payload) {
      var rows = [];
      for (var k in payload) {
        if (!Object.prototype.hasOwnProperty.call(payload, k)) continue;
        var v = payload[k];
        if (v === null || typeof v !== 'object') rows.push([k, typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v)]);
        else if (k === 'projection' && v.label) rows.push([k, v.label]);
        else if (k === 'offer' && typeof v.aav === 'number') rows.push([k, C.fmt.money(v.aav) + ' × ' + v.years + 'y · ' + Math.round((v.gtdPct || 0) * 100) + '% gtd']);
        else if (k === 'counter' && v) rows.push([k, '+' + Math.round((v.aavBump || 0) * 100) + '% AAV / +' + (v.yearBump || 0) + 'y · p ' + C.fmt.pct(v.p || 0, 0)]);
      }
      return rows.length ? C.kv(rows) : null;
    }
    function decisionCard(state) {
      var dec = state.pending.decision, pl = dec.payload || {};
      var body = [];
      var offers = Array.isArray(pl.offers) ? pl.offers : null;
      if (offers) { var grid = C.el('div', { class: 'stack' }); offers.forEach(function (o) { grid.appendChild(offerCard(o)); }); body.push(grid); }
      var kv = payloadKv(pl);
      if (kv) body.push(kv);
      if (pl.report && pl.report.tier) body.push(C.el('p', { class: 'txt-gold', text: 'Legacy tier: ' + pl.report.tier }));
      var buttons = [];
      (dec.options || []).forEach(function (opt, i) {
        if (opt.id === 'COUNTER') {
          buttons.push(C.button({ label: opt.label + ' (+AAV)', kind: 'secondary', title: opt.detail, onClick: safe(function () { dispatch('decide', { kind: dec.kind, optionId: 'COUNTER', extra: { mode: 'AAV' } }); }) }));
          buttons.push(C.button({ label: opt.label + ' (+YEARS)', kind: 'secondary', title: opt.detail, onClick: safe(function () { dispatch('decide', { kind: dec.kind, optionId: 'COUNTER', extra: { mode: 'YEARS' } }); }) }));
          return;
        }
        var wrap = C.el('div', { class: 'col', style: 'gap:2px; flex:1 1 45%' },
          C.button({ label: opt.label, kind: i === 0 ? 'primary' : 'secondary', block: true, onClick: safe(function () { dispatch('decide', { kind: dec.kind, optionId: opt.id }); }) }),
          opt.detail ? C.el('span', { class: 'small txt-grey', text: opt.detail }) : null);
        buttons.push(wrap);
      });
      return C.card({ title: 'DECISION · ' + dec.kind, kind: 'gold', body: body, footer: buttons });
    }

    // ───────────────────────── game ─────────────────────────
    function gameCard(state) {
      var gs = state.game;
      var home = C.team(gs.homeId), away = C.team(gs.awayId);
      var led = C.el('div', { class: 'led' },
        C.el('div', { class: 'led-team' }, C.crest(gs.awayId, 20), C.el('span', { text: away ? away.abbr : gs.awayId }), gs.possession === 'away' ? C.el('span', { class: 'poss' }) : null, C.el('span', { class: 'led-score num', text: String(gs.score.away) })),
        C.el('div', { class: 'led-mid' }, C.el('div', { text: (gs.q > 4 ? 'OT' + (gs.q - 4) : 'Q' + gs.q) }), C.el('div', { class: 'num', text: C.fmt.clock(gs.clock) })),
        C.el('div', { class: 'led-team right' }, C.el('span', { class: 'led-score num', text: String(gs.score.home) }), gs.possession === 'home' ? C.el('span', { class: 'poss' }) : null, C.el('span', { text: home ? home.abbr : gs.homeId }), C.crest(gs.homeId, 20)));
      var log = C.el('div', { class: 'drivelog mt-1', 'aria-live': 'polite' });
      var rows = (gs.driveLog || []).slice(-12);
      rows.forEach(function (r) { log.appendChild(C.el('div', { class: 'dl-line ' + (r.side === gs.userSide ? 'dl-home' : 'dl-away'), text: RTG.Sim.driveLogLine ? RTG.Sim.driveLogLine(gs, r) : r.text })); });
      if (!rows.length) log.appendChild(C.el('div', { class: 'dl-muted', text: 'Kickoff coming up…' }));
      var body = [led, log];
      var buttons = [];
      var last = store.lastDispatch && store.lastDispatch.result && store.lastDispatch.result.type ? store.lastDispatch.result : null;
      if (gs.pending) {
        var ctx = gs.pending.ctx;
        body.push(C.el('p', { class: 'mt-1' }, C.el('strong', { text: (gs.pending.type === 'USER_KICKOFF' ? 'YOUR KICKOFF' : 'YOUR KICK: ') + (gs.pending.type === 'USER_KICKOFF' ? '' : ctxLine(ctx)) })));
        if (gs.pending.type === 'USER_KICK') {
          var m = RTG.Kick.model(ctx, null);
          body.push(C.el('p', { class: 'small txt-grey', text: 'model pMake ' + C.fmt.pct(m.pMake) }));
          buttons.push(C.button({ label: 'KICK', kind: 'primary', icon: 'boot', onClick: safe(function () { goIfBuilt('kick', { mode: 'game' }); }) }));
        }
        buttons.push(C.button({ label: 'AUTO KICK', kind: 'secondary', onClick: safe(function () {
          var r = dispatch('autoKick');
          C.announce(r.type === 'KO' ? 'Kickoff ' + r.outcome : (r.made ? 'Good' : r.outcome));
          render();
        }) }));
      } else if (gs.done || (last && last.type === 'END_GAME')) {
        buttons.push(C.button({ label: 'FINISH GAME', kind: 'primary', onClick: safe(function () { var s = dispatch('finishUserGame'); C.toast('Final ' + s.score.away + '-' + s.score.home + (s.played ? ' · grade ' + s.grade : ''), s.won ? 'good' : 'info', 3500); Router.sync(); render(); }) }));
      } else {
        buttons.push(C.button({ label: 'NEXT KICK', kind: 'primary', onClick: safe(function () { var e = dispatch('simToKick'); if (e.type === 'ICE_TIMEOUT') C.toast('ICED!', 'bad'); render(); }) }));
        buttons.push(C.button({ label: 'STEP', kind: 'secondary', onClick: safe(function () { dispatch('simStep'); render(); }) }));
      }
      buttons.push(C.button({ label: 'SIM REST', kind: 'ghost', onClick: safe(function () { var s = dispatch('autoPlayGame'); if (s) C.toast('Final ' + s.score.away + '-' + s.score.home + (s.played ? ' · grade ' + s.grade : ''), s.won ? 'good' : 'info', 3500); render(); }) }));
      if (last && last.text) body.push(C.el('p', { class: 'small txt-sky mt-1', text: last.text }));
      return C.card({ title: 'GAME · WEEK ' + gs.week, kind: 'team', body: body, footer: buttons });
    }

    // ───────────────────────── phase actions ─────────────────────────
    var FOCI = ['POW', 'ACC', 'CON', 'CLU', 'KO', 'REST'];
    function actionsCard(state) {
      var ph = state.phase, st = state.stage, buttons = [], body = [];
      var inSeason = ph === 'REG' || ph === 'POST';
      if (st === 'RETIRED') {
        body.push(C.el('p', { text: 'Career over. The legacy screen will show the Hall of Fame verdict.' }));
        buttons.push(C.button({ label: 'NEW CAREER', kind: 'primary', onClick: function () { store.clear(); Router.go('newcareer'); } }));
      } else if (inSeason) {
        var ref = RTG.Season.userGameRef(state), season = state.season;
        if (!ref) body.push(C.el('p', { class: 'txt-grey', text: ph === 'POST' ? 'Postseason bye / eliminated — end the week.' : 'BYE WEEK — rest or grind, then end the week.' }));
        else {
          var opp = C.team(ref.oppId);
          body.push(C.el('div', { class: 'row' }, C.crest(ref.oppId, 28), C.el('span', { text: (ref.isHome ? 'vs ' : '@ ') + (opp ? opp.name : ref.oppId) + ' · ' + ref.kind + (ref.played ? ' · PLAYED' : '') })));
          if (ref.played && ref.game.score) body.push(C.el('p', { class: 'txt-gold num', text: 'Final ' + ref.game.score.away + '-' + ref.game.score.home }));
        }
        if (!season.trainingDone) {
          var pills = C.el('div', { class: 'pills mt-1' });
          FOCI.forEach(function (f) { pills.appendChild(C.button({ label: f, kind: 'ghost', small: true, class: 'pill', onClick: safe(function () { var r = dispatch('train', f); C.toast('Trained ' + f + ': +' + r.xp + ' XP', 'good'); render(); }) })); });
          body.push(C.el('p', { class: 'small txt-grey mt-1', text: 'Weekly training focus' }));
          body.push(pills);
        } else body.push(C.el('p', { class: 'small txt-grey mt-1', text: 'Training done (' + season.focus + ')' }));
        if (state.player.xp > 0) {
          var spend = C.el('div', { class: 'pills mt-1' });
          RTG.Schema.ATTRS.forEach(function (a) {
            var cost = RTG.Player.costToRaise(a, state.player.attrs[a], state.player.age, season.focus);
            spend.appendChild(C.button({ label: '+' + a + ' (' + cost + ')', kind: 'ghost', small: true, class: 'pill', disabled: cost > state.player.xp, onClick: safe(function () { var r = dispatch('spendXp', a); if (!r.ok) C.toast(r.reason || 'Cannot raise', 'bad'); render(); }) }));
          });
          body.push(spend);
        }
        if (ref && !ref.played) {
          buttons.push(C.button({ label: 'PLAY GAME', kind: 'primary', icon: 'boot', onClick: safe(function () { dispatch('startUserGame'); render(); }) }));
          buttons.push(C.button({ label: 'SIM GAME', kind: 'secondary', onClick: safe(function () { var s = dispatch('autoPlayGame'); if (s) C.toast('Final ' + s.score.away + '-' + s.score.home + (s.played ? ' · grade ' + s.grade : ''), s.won ? 'good' : 'info', 3500); render(); }) }));
        } else {
          buttons.push(C.button({ label: 'END WEEK', kind: 'primary', onClick: safe(function () { var r = dispatch('endWeek'); if (r.headlines && r.headlines.length) C.toast(r.headlines[0].text, 'gold', 4000); render(); }) }));
        }
        buttons.push(C.button({ label: 'SIM WEEK', kind: 'ghost', onClick: safe(function () { dispatch('autoPlayWeek', {}); render(); }) }));
        buttons.push(C.button({ label: 'SIM SEASON', kind: 'ghost', onClick: function () { C.confirm({ title: 'Sim to the end of the season?', text: 'Every remaining game is played with auto kicks.', okLabel: 'SIM' }).onOk(safe(function () { dispatch('autoPlaySeason', {}); render(); })); } }));
      } else if (ph === 'PRE') {
        var goals = state.season && state.season.goals || [];
        if (goals.length) body.push(C.list(goals, function (g) { return C.el('span', { class: 'small' }, g.text + ' (' + g.progress + '/' + g.target + ')'); }));
        buttons.push(C.button({ label: 'START SEASON', kind: 'primary', onClick: safe(function () { dispatch('nextPhase'); render(); }) }));
      } else if (ph === 'AWARDS') {
        var aw = state.season && state.season.awardsList || [];
        body.push(C.list(aw.filter(function (a) { return a && a.isUser !== false; }).slice(0, 8), function (a) { return C.el('span', { class: 'small' }, (a.name || a.id) + (a.kickerName ? ' — ' + a.kickerName : '')); }, { empty: 'No awards this season.' }));
        buttons.push(C.button({ label: 'CONTINUE', kind: 'primary', onClick: safe(function () { dispatch('nextPhase'); render(); }) }));
      } else {
        body.push(C.el('p', { class: 'txt-grey small', text: 'Nothing pending. Continue to the next phase.' }));
        buttons.push(C.button({ label: 'NEXT PHASE', kind: 'primary', onClick: safe(function () { dispatch('nextPhase'); render(); }) }));
        if (ph === 'OFF' || st === 'DRAFT') buttons.push(C.button({ label: 'SIM OFFSEASON', kind: 'ghost', onClick: safe(function () { dispatch('autoPlayOffseason', {}); render(); }) }));
      }
      return C.card({ title: 'ACTIONS', body: body, footer: buttons });
    }

    function headlinesCard(state) {
      var hs = (state.headlines || []).slice(-4).reverse();
      if (!hs.length) return null;
      return C.card({ title: 'THE WIRE', kind: 'flat', body: C.list(hs, function (h) { return C.el('span', { class: 'small' }, h.text); }) });
    }

    function jsonCard(state) {
      var det = C.el('details', { class: 'card card-flat' });
      det.appendChild(C.el('summary', { class: 'card-title', text: 'RAW STATE (JSON)' }));
      var pre = C.el('pre', { class: 'dbg-dump', style: 'max-height:50vh' });
      det.addEventListener('toggle', function () {
        if (!det.open) return;
        var txt = JSON.stringify(state, function (k, v) { return k === 'leagues' ? '[leagues omitted]' : v; }, 1);
        pre.textContent = txt.length > 200000 ? txt.slice(0, 200000) + '\n… (truncated)' : txt;
      });
      det.appendChild(pre);
      return det;
    }

    function noCareer() {
      return [C.el('header', { class: 'screen-head' }, C.el('h1', { class: 'screen-title', text: 'NO CAREER' })),
        C.card({ body: C.el('p', { text: 'Start a new career or load a save.' }), footer: [
          C.button({ label: 'NEW CAREER', kind: 'primary', onClick: function () { Router.go('newcareer'); } }),
          C.button({ label: 'TITLE', kind: 'ghost', onClick: function () { Router.go('title'); } })] })];
    }

    function render() {
      if (destroyed) return;
      var state = store.state;
      var parts;
      if (!state) parts = noCareer();
      else {
        parts = header(state);
        if (state.game) parts.push(gameCard(state));
        else if (state.pending) {
          if (state.pending.kind === 'KICKS') parts.push(sessionCard(state));
          else if (state.pending.kind === 'EVENT') parts.push(eventCard(state));
          else if (state.pending.kind === 'DECISION') parts.push(decisionCard(state));
        } else parts.push(actionsCard(state));
        parts.push(playerCard(state));
        parts.push(headlinesCard(state));
        parts.push(jsonCard(state));
      }
      C.replace(el, parts);
    }

    render();
    unsub = store.subscribe(function () { render(); });

    return {
      el: el,
      destroy: function () { destroyed = true; if (unsub) unsub(); unsub = null; },
      onKey: function (ev) {
        if (ev.key === 'Enter' && store.state && !store.state.pending && !store.state.game) {
          var b = el.querySelector('.card-footer .btn-primary');
          if (b) { b.click(); return true; }
        }
        return false;
      }
    };
  }

  RTG.UI.Router.register('_fallback', factory);
})(typeof window !== 'undefined' ? window : globalThis);
