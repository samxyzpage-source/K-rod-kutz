/**
 * Road to Glory: Kicker — screen 'combine' (SPEC §4.5 combine row, §2.7.5).
 * Plan card first (DECISION COMBINE_PLAN: SAFE / SHOW via dispatch('decide', {kind:'COMBINE_PLAN', optionId})),
 * then the one COMBINE_LADDER session (range ladder → accuracy set → kickoff hang) in a KickView with a
 * ladder header; ladder rungs after a miss are skipped (Draft.combineNextIdx). Done → Router.sync().
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Screens = RTG.UI.Screens = RTG.UI.Screens || {};

  function C() { return RTG.UI.C; }

  function planCard(store, decision) {
    var c = C();
    var el = c.el('div', { class: 'screen-session session-combine' });
    var payload = decision.payload || {};
    var body = c.el('div', { class: 'plan-options' });
    (decision.options || []).forEach(function (o, i) {
      var b = c.el('button', { class: 'plan-option', type: 'button', 'data-option': o.id, onClick: function () {
        try { store.dispatch('decide', { kind: 'COMBINE_PLAN', optionId: o.id }); }
        catch (e) { c.toast(String(e.message || e), 'bad'); }
      } });
      b.appendChild(c.el('span', { class: 'plan-label', text: o.label || o.id }));
      if (o.detail) b.appendChild(c.el('span', { class: 'plan-detail', text: o.detail }));
      body.appendChild(b);
    });
    var note = typeof payload.pMakeFar === 'number' ? 'Your make chance from 60+: ' + Math.round(payload.pMakeFar * 100) + '%' : '';
    var card = c.card({ title: 'COMBINE PLAN', kind: 'gold', class: 'plan-card', body: [
      c.el('p', { class: 'small', text: 'Range ladder 45 → 65, five accuracy kicks from the hashes, one kickoff. The ladder stops at your first miss.' }),
      note ? c.el('p', { class: 'small txt-gold', text: note }) : null,
      body
    ] });
    el.appendChild(card);
    return { el: el, destroy: function () {} };
  }

  function header(state, sess) {
    var c = C();
    var wrap = c.el('div', { class: 'combine-header' });
    wrap.appendChild(c.el('div', { class: 'session-title' }, c.el('span', { text: 'COMBINE · ' + (sess.plan === 'SAFE' ? 'SAFE PLAN' : 'SHOW OUT') }), c.el('span', { class: 'combine-score small txt-grey', text: '' })));
    ['ladder', 'acc', 'ko'].forEach(function (part) {
      var r = c.el('div', { class: 'ladder-part' });
      r.appendChild(c.el('span', { class: 'ladder-label', text: part === 'ladder' ? 'LADDER' : (part === 'acc' ? 'ACCURACY' : 'KICKOFF') }));
      r.appendChild(c.el('span', { class: 'slot-strip', 'data-part': part }));
      wrap.appendChild(r);
    });
    return wrap;
  }
  function update(headerEl, state, sess) {
    var c = C();
    if (!sess) return;
    var next = -1;
    if (RTG.Draft && RTG.Draft.combineNextIdx) next = RTG.Draft.combineNextIdx(sess);
    else next = sess.results.length < sess.contexts.length ? sess.results.length : -1;
    var parts = sess.parts || { ladder: [], acc: [], ko: [] };
    ['ladder', 'acc', 'ko'].forEach(function (part) {
      var strip = headerEl.querySelector('[data-part="' + part + '"]');
      if (!strip) return;
      c.clear(strip);
      var idxs = parts[part] || [];
      var missed = false;
      for (var j = 0; j < idxs.length; j++) {
        var i = idxs[j], ctx = sess.contexts[i], r = sess.results[i];
        var skipped = part === 'ladder' && missed && !r;
        var cls = 'slot' + (r ? (r.made || (ctx.type === 'KO' && r.type === 'KO') ? ' made' : ' miss') : (i === next ? ' current' : '')) + (skipped ? ' skipped' : '');
        var txt = r ? (ctx.type === 'KO' ? (r.hang ? r.hang.toFixed(1) + 's' : '✓') : (r.made ? '✓' : '✗')) : (skipped ? '—' : '·');
        strip.appendChild(c.el('span', { class: cls },
          c.el('span', { class: 'slot-d', text: ctx.type === 'KO' ? 'KO' : ctx.distance + (part === 'acc' ? (ctx.hash < 0 ? 'L' : 'R') : '') }),
          c.el('span', { class: 'slot-r', text: txt })));
        if (r && !r.made && part === 'ladder') missed = true;
      }
    });
    var sc = headerEl.querySelector('.combine-score');
    if (sc && RTG.Draft && RTG.Draft.combineBreakdown) {
      try { var b = RTG.Draft.combineBreakdown(sess); sc.textContent = 'SCORE ' + (b.score > 0 ? '+' : '') + b.score; } catch (e) { /* ignore */ }
    }
  }

  function factory(store) {
    var c = C();
    var state = store.state;
    var pd = state && state.pending;
    if (pd && pd.kind === 'DECISION' && pd.decision && pd.decision.kind === 'COMBINE_PLAN') return planCard(store, pd.decision);
    if (pd && pd.kind === 'KICKS') {
      return RTG.UI.KickView.sessionScreen(store, {
        className: 'session-combine', header: header, update: update,
        onComplete: function (outcome) {
          if (outcome && typeof outcome.combineScore === 'number') c.toast('Combine score ' + (outcome.combineScore > 0 ? '+' : '') + outcome.combineScore, 'gold', 3000);
          RTG.UI.Router.sync();
        }
      });
    }
    // DRAFT.COMBINE with nothing pending (session already played) → continue the draft flow
    var el = c.el('div', { class: 'screen-session session-combine' });
    el.appendChild(c.card({ title: 'COMBINE', body: [
      c.el('p', { class: 'small', text: 'The combine is done. Next up: the draft.' }),
      c.button({ label: 'CONTINUE ▶', kind: 'primary', onClick: function () {
        try { store.dispatch('nextPhase'); } catch (e) { c.toast(String(e.message || e), 'bad'); RTG.UI.Router.sync(); }
      } })
    ] }));
    return { el: el, destroy: function () {} };
  }

  Screens.combine = factory;
  if (RTG.UI.Router) RTG.UI.Router.register('combine', factory);
})(typeof window !== 'undefined' ? window : globalThis);
