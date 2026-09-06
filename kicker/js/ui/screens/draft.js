/**
 * Road to Glory: Kicker — screen 'draft' (SPEC §4.5 draft row, §2.7.6).
 *
 * Before the draft (DRAFT.DRAFT, nothing pending): the projection card (RTG.Draft.projection), the combine
 * breakdown (state.flags.combine) and START THE DRAFT → dispatch('nextPhase') (Career.runDraft). The store's sync
 * routes to the rookie's screen at once, so the screen re-enters itself with Router.go('draft', {result}) where
 * `result` is state.flags.draftResult, and plays the picks ticker: one pick per 250 ms (×4 button → 62.5 ms;
 * reduced motion → all at once), your card pulses when it is reached, the "YOU'RE GOING TO {CITY}" stinger, the
 * agent's texts from the inbox, then CONTINUE → Router.sync(). Undrafted: the UDFA camp invites (pending UDFA
 * decision) as cards → dispatch('decide', {kind:'UDFA', optionId}), or the minicamp tryout hand-off.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Screens = RTG.UI.Screens = RTG.UI.Screens || {};

  function C() { return RTG.UI.C; }
  function K() { return RTG.UI.Kit; }

  var POS_KIND = { QB: 'gold', K: 'gold', P: 'gold', WR: 'sky', RB: 'sky', TE: 'sky', OL: 'grey', DL: 'red', LB: 'red', DB: 'red' };

  function factory(store, params) {
    var c = C(), Kit = K(), R = RTG.UI.Router;
    var el = c.el('div', { class: 'screen scr-draft' });
    var unsub = null, destroyed = false, timer = null;
    var result = params && params.result || null;
    var shown = 0, speed = 1, finished = false;

    function stop() { if (timer) { root.clearTimeout(timer); timer = null; } }

    function projectionCard(state) {
      var proj = null;
      try { proj = RTG.Draft.projection(state); } catch (e) { proj = null; }
      var cb = state.flags && state.flags.combine;
      var body = [];
      if (proj) body.push(c.el('p', { class: 'small' }, 'Projection: ', c.el('strong', { class: 'txt-gold', text: proj.label }), c.el('span', { class: 'txt-grey', text: ' · draft value ' + proj.value.toFixed(1) })));
      if (cb) body.push(c.kv([
        ['RANGE LADDER', Kit.tip(c.el('span', { text: Kit.num(cb.ladderMakes) + ' rung' + (cb.ladderMakes === 1 ? '' : 's') + (cb.plan ? ' (' + cb.plan + ')' : '') }), '45 / 50 / 55 / 60 / 65 until a miss')],
        ['ACCURACY SET', Kit.num(cb.accMakes) + ' / 5'],
        ['KICKOFF HANG', Kit.tip(c.el('span', { text: (typeof cb.hang === 'number' ? cb.hang.toFixed(2) : '—') + ' s' }), 'Anchor 3.9 s')],
        ['COMBINE SCORE', Kit.tip(c.el('span', { class: 'txt-gold', text: c.fmt.signed(Math.round(Kit.num(cb.score) * 10) / 10) }), '(ladder − 3)·2 + (accuracy − 3)·2 + (hang − 3.9)·5, clamped ±8')]
      ]));
      body.push(c.el('p', { class: 'small txt-grey mt-1', text: 'Teams that need a leg (old kicker, low rating or an expiring deal) pick in draft order. Rookie deals are signed automatically.' }));
      return c.card({ title: 'DRAFT DAY', kind: 'gold', icon: 'star', body: body, footer: [c.button({ label: 'START THE DRAFT', kind: 'primary', block: true, icon: 'arrow-r', action: 'start-draft', onClick: Kit.safe(runDraft) })] });
    }

    function runDraft() {
      var r = store.dispatch('nextPhase');
      if (!r) return;
      var st = store.state;
      var res = st.flags && st.flags.draftResult;
      if (!res) { c.toast('The draft moved on without a result card.', 'info'); return; }
      R.go('draft', { result: res }, { replace: true });
    }

    function pickRow(row) {
      var li = c.el('li', { class: 'pick-row' + (row.isUser ? ' mine' : '') });
      li.appendChild(c.el('span', { class: 'pick-no num', text: '#' + row.pick }));
      li.appendChild(c.el('span', { class: 'small txt-grey pick-round', text: 'R' + row.round }));
      li.appendChild(c.crest(row.teamId, 18));
      li.appendChild(c.el('span', { class: 'pick-team', text: Kit.abbr(row.teamId) }));
      li.appendChild(c.chip(row.pos, POS_KIND[row.pos] || 'grey'));
      li.appendChild(c.el('span', { class: 'pick-name ellipsis' + (row.isUser ? ' txt-gold' : ''), text: row.name }));
      return li;
    }

    function tickerCard(state) {
      var rows = result.ticker || [];
      var list = c.el('ul', { class: 'picks', 'aria-live': 'polite', 'aria-label': 'Draft picks' });
      var reduced = Kit.reduced();
      var box = c.el('div', { class: 'picks-box' }, list);
      var controls = c.el('div', { class: 'row row-between mt-1' },
        c.el('span', { class: 'small txt-grey picks-status', text: rows.length ? 'On the clock…' : 'Undrafted' }),
        rows.length ? c.button({ label: speed === 4 ? '×4' : '×1', kind: 'ghost', small: true, class: 'pill' + (speed === 4 ? ' active' : ''), action: 'speed', ariaLabel: 'Ticker speed', 'aria-pressed': speed === 4 ? 'true' : 'false', onClick: function () { speed = speed === 4 ? 1 : 4; render(); } }) : null);
      var card = c.card({ title: 'THE DRAFT', kind: 'gold', icon: 'clock', body: [box, controls] });
      function reveal(n) {
        while (shown < n && shown < rows.length) { var r = rows[shown++]; var li = pickRow(r); list.appendChild(li); if (r.isUser) { li.classList.add('pulse'); li.classList.add('reached'); } }
        box.scrollTop = box.scrollHeight;
        if (shown >= rows.length && !finished) { finished = true; stop(); onFinished(state, card); }
      }
      if (reduced || shown >= rows.length) { reveal(rows.length); }
      else {
        reveal(Math.min(shown || 1, rows.length));
        var step = function () {
          timer = null;
          if (destroyed) return;
          reveal(shown + 1);
          if (shown < rows.length) timer = root.setTimeout(step, 250 / speed);
        };
        if (shown < rows.length) timer = root.setTimeout(step, 250 / speed);
      }
      if (!rows.length && !finished) { finished = true; onFinished(state, card); }
      return card;
    }

    function stinger(state) {
      var t = Kit.team(result.teamId);
      var city = t ? (t.city || t.name) : result.teamId;
      var wrap = c.el('div', { class: 'stinger banner banner-gold' + (Kit.reduced() ? '' : ' stinger-in'), role: 'status' },
        c.el('div', { class: 'row', style: 'justify-content:center' }, c.crest(t || result.teamId, 40), c.el('span', { class: 'col', style: 'gap:2px' }, c.el('span', { class: 'small', text: 'ROUND ' + result.round + ' · PICK ' + result.pick + (result.shock ? ' · FIRST-ROUND SHOCK!' : '') }), c.el('span', { class: 'big', text: 'YOU’RE GOING TO ' + String(city).toUpperCase() }))));
      return wrap;
    }

    function agentTexts(state) {
      var msgs = (state.inbox || []).filter(function (m) { return (m.from || m.avatar) === 'agent'; }).slice(-2);
      if (!msgs.length) return null;
      return c.card({ title: 'AGENT', kind: 'flat', icon: 'envelope', body: c.list(msgs, function (m) { return c.el('span', { class: 'row grow' }, Kit.avatar('agent', 28), c.el('span', { class: 'small bubble-inline', text: m.text })); }) });
    }

    function udfaCards(state) {
      var pd = state.pending, dec = pd && pd.kind === 'DECISION' && pd.decision.kind === 'UDFA' ? pd.decision : null;
      if (!dec) return null;
      var offers = dec.payload.offers || [];
      var wrap = c.el('div', { class: 'stack' });
      offers.forEach(function (o) {
        var card = Screens.proOfferCard ? Screens.proOfferCard(state, o, { pickLabel: 'SIGN', onPick: function () { Kit.dispatch(store, 'decide', { kind: 'UDFA', optionId: o.id }); } })
          : c.card({ kind: 'flat', body: c.el('p', { text: o.teamName + ' — ' + c.fmt.money(o.aav) + ' × ' + o.years }), footer: [c.button({ label: 'SIGN', kind: 'primary', onClick: function () { Kit.dispatch(store, 'decide', { kind: 'UDFA', optionId: o.id }); } })] });
        wrap.appendChild(card);
      });
      return c.card({ title: 'CAMP INVITES', kind: 'sky', icon: 'envelope', body: [c.el('p', { class: 'small txt-grey mb-1', text: 'Undrafted — but ' + offers.length + ' team' + (offers.length === 1 ? '' : 's') + ' want to see the leg in camp. UDFA deals: 3 years at the minimum, you start as K2 and the camp battle decides.' }), wrap] });
    }

    var finishedParts = null;
    function onFinished(state, card) {
      var st = store.state;
      var status = card.querySelector('.picks-status');
      var extra = [];
      if (result.teamId) {
        if (status) status.textContent = 'Pick ' + result.pick + ' — ' + Kit.teamName(result.teamId);
        extra.push(stinger(st));
        var ct = st.player.contract;
        if (ct) extra.push(c.card({ title: 'ROOKIE DEAL', kind: 'flat', icon: 'money', body: c.kv([['CONTRACT', Kit.contractText(ct)], ['TOTAL', c.fmt.money(Kit.num(ct.aav) * Kit.num(ct.years))], ['SIGNING BONUS', c.fmt.money(Kit.num(ct.signingBonus))], ['ROLE', st.player.role]]) }));
        c.announce('Drafted in round ' + result.round + ', pick ' + result.pick + ', by ' + Kit.teamName(result.teamId) + '.');
      } else {
        if (status) status.textContent = 'The picks ran out.';
        extra.push(c.el('div', { class: 'banner banner-bad', text: 'UNDRAFTED' }));
        var ud = udfaCards(st);
        if (ud) extra.push(ud);
        else if (st.pending && st.pending.kind === 'KICKS') extra.push(c.card({ title: 'MINICAMP TRYOUT', kind: 'sky', body: c.el('p', { class: 'small', text: 'One tryout: six kicks, four makes gets a deal.' }) }));
        c.announce('Undrafted.');
      }
      var at = agentTexts(st);
      if (at) extra.push(at);
      var needsPick = st.pending && st.pending.kind === 'DECISION';
      if (!needsPick) extra.push(c.el('div', { class: 'btn-row' }, c.button({ label: 'CONTINUE', kind: 'primary', block: true, icon: 'arrow-r', action: 'continue', onClick: function () { R.sync({ force: true }); } })));
      finishedParts = extra;
      extra.forEach(function (e) { el.appendChild(e); });
    }

    function render() {
      if (destroyed) return;
      stop();
      var state = store.state;
      var parts = [c.el('header', { class: 'screen-head' }, c.el('h1', { class: 'screen-title', text: 'THE DRAFT' }), state ? c.el('div', { class: 'screen-head-right small txt-grey' }, c.el('span', { class: 'num', text: Kit.calYear(state.year) })) : null)];
      if (!state) { parts.push(c.card({ body: c.el('p', { text: 'No career loaded.' }) })); c.replace(el, parts); return; }
      if (result) {
        finished = false; finishedParts = null;          // the tail is rebuilt from the live state on every render
        parts.push(tickerCard(state));
        c.replace(el, parts);
        if (finishedParts) finishedParts.forEach(function (e) { el.appendChild(e); });
        return;
      }
      if (state.stage === 'DRAFT' && state.phase === 'DRAFT' && !state.pending) parts.push(projectionCard(state));
      else if (state.flags && state.flags.draftResult && state.flags.draftResult.ticker && state.flags.draftResult.ticker.length) {
        parts.push(c.card({ title: 'DRAFT RESULT', kind: 'gold', body: c.el('p', { class: 'small', text: 'Round ' + state.flags.draftResult.round + ', pick ' + state.flags.draftResult.pick + ' — ' + Kit.teamName(state.flags.draftResult.teamId) }), footer: [c.button({ label: 'REPLAY THE TICKER', kind: 'secondary', onClick: function () { R.go('draft', { result: state.flags.draftResult }, { replace: true }); } }), c.button({ label: 'CONTINUE', kind: 'primary', action: 'continue', onClick: function () { R.sync({ force: true }); } })] }));
      } else parts.push(c.card({ kind: 'sky', body: c.el('p', { text: 'The draft is not on the calendar right now.' }), footer: [c.button({ label: 'BACK', kind: 'primary', onClick: function () { R.sync({ force: true }); } })] }));
      c.replace(el, parts);
    }

    render();
    unsub = store.subscribe(function () { if (!result || finished) render(); });
    return {
      el: el,
      destroy: function () { destroyed = true; stop(); if (unsub) unsub(); unsub = null; },
      onKey: function (ev) { if (ev.key === 'Enter' && !ev.repeat) { var b = el.querySelector('[data-action="continue"], [data-action="start-draft"]'); if (b) { b.click(); return true; } } return false; }
    };
  }

  Screens.draft = factory;
  RTG.UI.Router.register('draft', factory);
})(typeof window !== 'undefined' ? window : globalThis);
