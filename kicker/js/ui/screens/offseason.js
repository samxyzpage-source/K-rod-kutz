/**
 * Road to Glory: Kicker — screen 'offseason' (SPEC §4.5 offseason row, §2.1.3, §2.7.3–2.7.4, §2.7.8).
 *
 * The stepper wizard over the offseason decision chain (state.flags.offseason.steps / idx): BODY_CHECK (age deltas),
 * TRAINING_BLOCKS (3 × 70·moraleMult XP into one attribute or the bank), REDSHIRT, DECLARE (projection card from
 * RTG.Draft.projection + eligibility), TRANSFER (portal offers via Kit.offerCard + STAY), RETIRE (one more year /
 * retire / ring chase), OFFSEASON_PLAN / CAMP and any other decision kind not owned by contract / draft / legacy /
 * offers (generic option buttons). Each step → dispatch('decide', {kind, optionId, extra}) (the store syncs). When the
 * chain has ended and nothing is pending, the "next season preview" card (age, team, rival, contract year) with
 * CONTINUE → dispatch('nextPhase'). An offseason EVENT shows a re-open button for the modal.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Screens = RTG.UI.Screens = RTG.UI.Screens || {};

  function C() { return RTG.UI.C; }
  function K() { return RTG.UI.Kit; }

  var STEP_NAMES = { BODY_CHECK: 'BODY', TRAINING_BLOCKS: 'TRAINING', REDSHIRT: 'REDSHIRT', TRANSFER: 'PORTAL', EVENT: 'EVENT', DECLARE: 'DECLARE', CUT_NOTICE: 'ROSTER', EXTENSION: 'EXTENSION', REDRAFT: 'DRAFT', FREE_AGENCY: 'FREE AGENCY', RETIRE: 'RETIRE?' };
  var TITLES = { BODY_CHECK: 'BODY CHECK', TRAINING_BLOCKS: 'TRAINING BLOCKS', REDSHIRT: 'REDSHIRT?', DECLARE: 'DECLARE FOR THE DRAFT?', TRANSFER: 'TRANSFER PORTAL', RETIRE: 'ONE MORE YEAR?', OFFSEASON_PLAN: 'OFFSEASON PLAN', CAMP: 'CAMP BATTLE AHEAD', COMBINE_PLAN: 'COMBINE PLAN' };

  function factory(store, params) {
    var c = C(), Kit = K(), R = RTG.UI.Router;
    var el = c.el('div', { class: 'screen scr-offseason' });
    var unsub = null, destroyed = false;

    function decide(kind, optionId, extra) {
      var arg = { kind: kind, optionId: optionId };
      if (extra) arg.extra = extra;
      var r = Kit.dispatch(store, 'decide', arg);
      if (r && r.headline && r.headline.text) c.toast(r.headline.text, 'gold', 4000);
      if (r) c.announce(r.next === 'PHASE' ? 'Offseason step done.' : 'Next decision.');
      return r;
    }

    function stepper(state) {
      var ch = state.flags && state.flags.offseason;
      if (!ch || !ch.steps) return null;
      var wrap = c.el('ol', { class: 'stepper', 'aria-label': 'Offseason steps' });
      var cur = state.pending ? ch.idx - 1 : ch.idx;
      ch.steps.forEach(function (s, i) {
        var cls = i < cur ? 'done' : (i === cur ? 'current' : 'todo');
        wrap.appendChild(c.el('li', { class: 'step ' + cls, 'aria-current': i === cur ? 'step' : null }, c.el('span', { class: 'step-dot', text: i < cur ? '✓' : String(i + 1) }), c.el('span', { class: 'step-name', text: STEP_NAMES[s] || s })));
      });
      return c.el('div', { class: 'scroll-x stepper-scroll' }, wrap);
    }

    function optionButtons(dec, primaryId) {
      return (dec.options || []).map(function (o, i) {
        return c.el('div', { class: 'col opt', style: 'gap:2px' },
          c.button({ label: o.label, kind: (primaryId ? o.id === primaryId : i === 0) ? 'primary' : 'secondary', block: true, action: 'opt-' + o.id, onClick: Kit.safe(function () { decide(dec.kind, o.id); }) }),
          o.detail ? c.el('span', { class: 'small txt-grey opt-detail', text: o.detail }) : null);
      });
    }

    function bodyCheck(state, dec) {
      var pl = dec.payload || {}, p = state.player;
      var changes = pl.changes || [];
      var body = [c.el('div', { class: 'row' }, c.pixelAvatar(p.look, 48), c.el('div', { class: 'col grow', style: 'gap:2px' }, c.el('strong', { text: 'Age ' + pl.age + (pl.preview ? ' this winter' : '') }), c.el('span', { class: 'small txt-grey', text: 'OVR ' + Kit.num(pl.ovr) + ' · ' + (p.traits || []).join(', ') })))];
      body.push(c.list(changes, function (ch) { return c.el('span', { class: 'row row-between grow' }, c.el('span', { class: 'small', text: ch.text }), c.deltaChip(ch.delta)); }, { empty: 'Nothing new — the leg feels fine.' }));
      body.push(c.el('p', { class: 'small txt-grey mt-1', text: 'Growth until 24 (+1 to two attributes); decline from 33: power first, then consistency, accuracy and kickoff. Composure never declines.' }));
      return c.card({ title: TITLES.BODY_CHECK, kind: 'gold', icon: 'heart', body: body, footer: optionButtons(dec) });
    }

    function trainingBlocks(state, dec) {
      var pl = dec.payload || {}, p = state.player;
      var head = c.el('p', { class: 'small' }, c.el('strong', { class: 'txt-gold', text: '+' + Kit.num(pl.total) + ' XP' }), ' — ' + Kit.num(pl.blocks) + ' blocks × ' + Kit.num(pl.xpEach) + ' XP (morale ×' + (pl.moraleMult || 1) + '). Pick one attribute to spend the blocks on now, or bank the XP.');
      var grid = c.el('div', { class: 'grid-2 blocks-grid' });
      (dec.options || []).forEach(function (o) {
        var isAttr = RTG.Schema.ATTRS.indexOf(o.id) >= 0;
        var tile = c.el('button', { type: 'button', class: 'block-tile' + (isAttr ? '' : ' bank'), 'data-option': o.id, onClick: Kit.safe(function () { decide(dec.kind, o.id); }) });
        tile.appendChild(c.el('span', { class: 'block-id', text: isAttr ? o.id : 'BANK' }));
        if (isAttr) tile.appendChild(c.bar({ label: '', value: p.attrs[o.id], pot: p.agentTier >= 2 && p.pot ? p.pot[o.id] : undefined, noValue: true }));
        tile.appendChild(c.el('span', { class: 'small block-detail', text: o.detail || o.label }));
        Kit.tip(tile, isAttr ? 'Spend the three blocks on ' + o.id + ' (up to +3, respecting the cap)' : 'Keep the XP to spend on the Training screen');
        grid.appendChild(tile);
      });
      return c.card({ title: TITLES.TRAINING_BLOCKS, kind: 'gold', icon: 'train', body: [head, grid] });
    }

    function declareCard(state, dec) {
      var pl = dec.payload || {};
      var proj = null;
      try { proj = RTG.Draft && RTG.Draft.projection ? RTG.Draft.projection(state) : pl.projection; } catch (e) { proj = pl.projection; }
      proj = proj || pl.projection || {};
      var body = [];
      var scale = c.el('div', { class: 'proj-scale', role: 'img', 'aria-label': 'Projected ' + (proj.label || '') });
      var labels = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'UDFA', 'UNDR'];
      labels.forEach(function (l, i) {
        var n = i + 1;
        var inBand = n >= Kit.num(proj.low, 9) && n <= Kit.num(proj.high, 9);
        scale.appendChild(c.el('span', { class: 'proj-cell' + (inBand ? ' band' : '') + (n === proj.round ? ' round' : ''), text: l }));
      });
      body.push(c.el('p', { class: 'small' }, 'Projection: ', c.el('strong', { class: 'txt-gold', text: proj.label || '—' }), c.el('span', { class: 'txt-grey', text: ' (draft value ' + (typeof proj.value === 'number' ? proj.value.toFixed(1) : '—') + ', agent tier ' + (state.player.agentTier | 0) + (state.player.agentTier ? ' narrows the band' : ' — an agent narrows the band') + ')' })));
      body.push(scale);
      body.push(c.kv([
        ['SEASONS PLAYED', Kit.num(pl.seasons) + ' (' + Kit.num(pl.eligibleSeasons) + ' on the clock)'],
        ['AGE', String(Kit.num(pl.age, state.player.age))],
        ['OVR', String(Kit.num(pl.ovr, Kit.ovr(state.player)))],
        pl.lean ? ['COACH LEANS', pl.lean] : null
      ].filter(Boolean)));
      body.push(c.el('p', { class: 'small txt-grey mt-1', text: 'Draft value = 0.55·OVR + 0.15·POW + 0.10·CLU + fame tier + college FG% + combine score + prestige bump. Another year in school can raise it; seniors auto-declare.' }));
      return c.card({ title: TITLES.DECLARE, kind: 'gold', icon: 'star', body: body, footer: optionButtons(dec) });
    }

    function transferCard(state, dec) {
      var pl = dec.payload || {}, offers = pl.offers || [];
      var body = [c.el('p', { class: 'small txt-grey', text: offers.length ? 'The portal is open: ' + offers.length + ' school' + (offers.length === 1 ? '' : 's') + ' would take you. Transferring resets trust to 45 and job security to 50, keeps the stats, costs 10 fame.' : 'The portal is open, but nobody called.' })];
      var grid = c.el('div', { class: 'stack' });
      offers.forEach(function (o) {
        var copy = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) copy[k] = o[k];
        copy.myOvr = pl.myOvr;
        grid.appendChild(Kit.offerCard(copy, { pickLabel: 'TRANSFER', compact: true, onPick: function () {
          c.confirm({ title: 'Transfer to ' + (o.school || o.teamName) + '?', text: 'Trust 45, job security 50, fame −10. Your stats travel with you.', okLabel: 'TRANSFER' }).onOk(function () { decide(dec.kind, o.id); });
        } }));
      });
      body.push(grid);
      var stay = (dec.options || []).filter(function (o) { return o.id === 'STAY'; })[0];
      var footer = stay ? [c.button({ label: stay.label || 'STAY', kind: 'primary', block: true, icon: 'home', action: 'opt-STAY', onClick: Kit.safe(function () { decide(dec.kind, 'STAY'); }) })] : null;
      return c.card({ title: TITLES.TRANSFER, kind: 'sky', icon: 'team', body: body, footer: footer });
    }

    function retireCard(state, dec) {
      var pl = dec.payload || {}, p = state.player;
      var body = [c.el('div', { class: 'row' }, c.pixelAvatar(p.look, 48), c.el('div', { class: 'col grow', style: 'gap:2px' }, c.el('strong', { text: p.name.full + ', ' + Kit.num(pl.age, p.age) }), c.el('span', { class: 'small txt-grey', text: 'OVR ' + Kit.num(pl.ovr, Kit.ovr(p)) + ' · ' + Kit.contractText(p.contract) })))];
      if (typeof pl.hof === 'number') body.push(c.el('p', { class: 'small mt-1' }, 'Hall of Fame score so far: ', Kit.numEl(String(Math.round(pl.hof)), 'FGM, 50+ makes, points, game-winners, All-League, titles, starter seasons, records', 'txt-gold')));
      if (pl.forced) body.push(c.el('div', { class: 'banner banner-bad small mt-1', text: 'RETIREMENT IS FORCED — ' + String(pl.forced).replace(/_/g, ' ') }));
      body.push(c.el('p', { class: 'small txt-grey mt-1', text: 'Retirement is offered every offseason from 33. Forced at 42, after two offseasons without a deal, or when the leg is done.' }));
      return c.card({ title: TITLES.RETIRE, kind: pl.forced ? 'red' : 'gold', icon: 'clock', body: body, footer: optionButtons(dec, pl.forced ? 'RETIRE' : 'ONE_MORE_YEAR') });
    }

    function genericCard(state, dec) {
      var pl = dec.payload || {};
      var rows = [];
      for (var k in pl) {
        if (!Object.prototype.hasOwnProperty.call(pl, k)) continue;
        var v = pl[k];
        if (v === null || typeof v !== 'object') rows.push([k.replace(/([A-Z])/g, ' $1').toUpperCase(), typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v)]);
      }
      var body = [];
      if (dec.kind === 'CAMP') body.push(c.el('p', { class: 'small', text: 'A camp battle is coming in the preseason: six kicks each, best leg starts.' }));
      if (dec.kind === 'OFFSEASON_PLAN') body.push(c.el('p', { class: 'small', text: 'The plan for the winter is set.' }));
      if (rows.length) body.push(c.kv(rows));
      return c.card({ title: TITLES[dec.kind] || dec.kind.replace(/_/g, ' '), kind: 'gold', body: body, footer: optionButtons(dec) });
    }

    function decisionCard(state, dec) {
      switch (dec.kind) {
        case 'BODY_CHECK': return bodyCheck(state, dec);
        case 'TRAINING_BLOCKS': return trainingBlocks(state, dec);
        case 'DECLARE': return declareCard(state, dec);
        case 'TRANSFER': return transferCard(state, dec);
        case 'RETIRE': return retireCard(state, dec);
        case 'REDSHIRT': return c.card({ title: TITLES.REDSHIRT, kind: 'gold', icon: 'clock', body: [c.el('p', { class: 'small', text: 'You were the backup as a freshman. A redshirt keeps this season off the 3-season eligibility clock (it still counts toward the 5-season maximum).' })], footer: optionButtons(dec) });
        default: return genericCard(state, dec);
      }
    }

    function previewCard(state) {
      var p = state.player, t = Kit.userTeam(state);
      var rival = t ? (p.role === 'K1' ? (t.kicker2 || t.kicker) : (t.kicker || t.kicker2)) : null;
      var rows = [
        ['NEXT SEASON', 'Y' + (state.year + 1) + ' · ' + Kit.calYear(state.year + 1) + ' · age ' + (p.age + 1)],
        ['TEAM', t ? t.name : (state.stage === 'NFL' ? 'Free agent' : '—')],
        ['ROLE', p.role === 'NONE' ? 'FA' : p.role],
        ['RIVAL LEG', rival ? rival.name + ' (OVR ' + Kit.num(rival.ovr) + ')' : 'none'],
        ['CONTRACT', Kit.contractText(p.contract)],
        ['XP TO SPEND', String(p.xp)]
      ];
      return c.card({ title: 'NEXT SEASON PREVIEW', kind: 'gold', icon: 'arrow-r', body: [c.el('div', { class: 'row mb-1' }, t ? c.crest(t, 40) : c.pixelAvatar(p.look, 40), c.el('strong', { class: 'grow', text: 'The wizard is done. The calendar rolls over.' })), c.kv(rows)],
        footer: [c.button({ label: 'CONTINUE', kind: 'primary', block: true, icon: 'arrow-r', action: 'continue', onClick: Kit.safe(function () { var r = store.dispatch('nextPhase'); if (r) c.announce('Year ' + r.year + ', ' + r.stage + ' ' + r.phase + '.'); }) })] });
    }

    function render() {
      if (destroyed) return;
      var state = store.state;
      var parts = [c.el('header', { class: 'screen-head' }, c.el('h1', { class: 'screen-title', text: state && state.stage === 'DRAFT' ? 'DRAFT PROCESS' : 'OFFSEASON' }), state ? c.el('div', { class: 'screen-head-right small txt-grey' }, c.el('span', { class: 'num', text: 'Y' + state.year + ' · ' + Kit.calYear(state.year) })) : null)];
      if (!state) { parts.push(c.card({ body: c.el('p', { text: 'No career loaded.' }) })); c.replace(el, parts); return; }
      parts.push(stepper(state));
      var pd = state.pending;
      if (pd && pd.kind === 'DECISION') parts.push(decisionCard(state, pd.decision));
      else if (pd && pd.kind === 'EVENT') parts.push(c.card({ title: 'AN EVENT NEEDS YOUR ANSWER', kind: 'gold', icon: 'envelope', body: c.el('p', { class: 'small', text: pd.event.title || pd.event.id }), footer: [c.button({ label: 'OPEN', kind: 'primary', action: 'open-event', onClick: function () { if (Screens.eventModal) Screens.eventModal(pd.event, store); else R.sync(); } })] }));
      else if (pd) parts.push(c.card({ kind: 'sky', body: c.el('p', { text: 'A kick session is waiting.' }), footer: [c.button({ label: 'GO', kind: 'primary', onClick: function () { R.sync({ force: true }); } })] }));
      else if (state.phase === 'OFF' && (state.stage === 'COLLEGE' || state.stage === 'NFL')) {
        var ch = state.flags && state.flags.offseason;
        if (ch && ch.done) parts.push(previewCard(state));
        else parts.push(c.card({ title: 'OFFSEASON', kind: 'gold', body: c.el('p', { class: 'small', text: ch ? 'Continue the wizard.' : 'The season is over — open the offseason wizard.' }), footer: [c.button({ label: 'CONTINUE', kind: 'primary', block: true, icon: 'arrow-r', action: 'continue', onClick: Kit.safe(function () { store.dispatch('nextPhase'); }) })] }));
      } else if (state.stage === 'DRAFT') {
        parts.push(c.card({ title: 'DRAFT · ' + state.phase, kind: 'gold', body: c.el('p', { class: 'small', text: state.phase === 'UDFA' ? 'Waiting on a pro deal.' : 'Continue the draft process.' }), footer: [c.button({ label: 'CONTINUE', kind: 'primary', block: true, icon: 'arrow-r', action: 'continue', onClick: Kit.safe(function () { store.dispatch('nextPhase'); }) })] }));
      } else {
        parts.push(c.card({ kind: 'sky', body: c.el('p', { text: 'Nothing to decide right now.' }), footer: [c.button({ label: 'BACK', kind: 'primary', onClick: function () { R.sync({ force: true }); } })] }));
      }
      c.replace(el, parts);
    }

    // A pending COMBINE_PLAN routes here (Router.resolve: any other DECISION → offseason); the combine screen owns
    // the plan card, so hand over once it is registered (deferred: never Router.go inside a factory).
    var fwdTimer = null;
    function forwardCombine() {
      var pd = store.state && store.state.pending;
      if (pd && pd.kind === 'DECISION' && pd.decision.kind === 'COMBINE_PLAN' && R.has('combine') && R.current() !== 'combine' && !fwdTimer) {
        fwdTimer = root.setTimeout(function () { fwdTimer = null; if (!destroyed) R.go('combine', {}, { replace: true }); }, 0);
      }
    }
    render();
    forwardCombine();
    unsub = store.subscribe(function () { render(); forwardCombine(); });
    return {
      el: el,
      destroy: function () { destroyed = true; if (unsub) unsub(); unsub = null; if (fwdTimer) root.clearTimeout(fwdTimer); },
      onKey: function (ev) { if (ev.target && ev.target !== root.document.body && ev.target !== root.document.documentElement) return false; if (ev.key === 'Enter' && !ev.repeat) { var b = el.querySelector('[data-action="continue"], .card-footer .btn-primary'); if (b) { b.click(); return true; } } return false; }
    };
  }

  Screens.offseason = factory;
  RTG.UI.Router.register('offseason', factory);
})(typeof window !== 'undefined' ? window : globalThis);
