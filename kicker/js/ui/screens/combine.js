/**
 * Road to Glory: Kicker — screen 'combine' (SPEC §4.5 combine row, §2.7.5).
 * Plan card first (DECISION COMBINE_PLAN: SAFE / SHOW via dispatch('decide', {kind:'COMBINE_PLAN', optionId})),
 * then the one COMBINE_LADDER session (range ladder → accuracy set → kickoff hang) in a KickView with a
 * ladder header; ladder rungs after a miss are skipped (Draft.combineNextIdx). When the session is done the
 * screen shows the breakdown and CONTINUE → dispatch('nextPhase') (→ the draft).
 *
 * The route id stays 'combine' through all three states (Router.sync does not remount an identical id), so the
 * screen re-renders itself from its store subscription: plan → session → done.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Screens = RTG.UI.Screens = RTG.UI.Screens || {};

  function C() { return RTG.UI.C; }

  function planCard(store, decision) {
    var c = C();
    var el = c.el('div', { class: 'combine-plan' });
    var payload = decision.payload || {};
    var body = c.el('div', { class: 'plan-options' });
    (decision.options || []).forEach(function (o) {
      var b = c.el('button', { class: 'plan-option', type: 'button', 'data-option': o.id, onClick: function () {
        try { store.dispatch('decide', { kind: 'COMBINE_PLAN', optionId: o.id }); }
        catch (e) { c.toast(String(e.message || e), 'bad'); }
      } });
      b.appendChild(c.el('span', { class: 'plan-label', text: o.label || o.id }));
      if (o.detail) b.appendChild(c.el('span', { class: 'plan-detail', text: o.detail }));
      body.appendChild(b);
    });
    var note = typeof payload.pMakeFar === 'number' ? 'Your make chance from 60+: ' + Math.round(payload.pMakeFar * 100) + '%' : '';
    el.appendChild(c.card({ title: 'COMBINE PLAN', kind: 'gold', class: 'plan-card', body: [
      c.el('p', { class: 'small', text: 'Range ladder 45 → 65, five accuracy kicks from the hashes, one kickoff. The ladder stops at your first miss.' }),
      note ? c.el('p', { class: 'small txt-gold', text: note }) : null,
      body
    ] }));
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

  function doneCard(store) {
    var c = C(), state = store.state;
    var el = c.el('div', { class: 'combine-done' });
    var score = state.flags && typeof state.flags.combineScore === 'number' ? state.flags.combineScore : null;
    var rows = [];
    if (score !== null) rows.push(['COMBINE SCORE', c.el('span', { class: (score >= 0 ? 'txt-mint' : 'txt-red') + ' num', text: (score > 0 ? '+' : '') + score })]);
    if (RTG.Draft && RTG.Draft.projection) {
      try { var p = RTG.Draft.projection(state); if (p && p.label) rows.push(['PROJECTION', p.label]); } catch (e) { /* ignore */ }
    }
    el.appendChild(c.card({ title: 'COMBINE', kind: 'gold', class: 'plan-card', body: [
      c.el('p', { class: 'small', text: 'The combine is done. Next up: the draft.' }),
      rows.length ? c.kv(rows) : null,
      c.button({ label: 'CONTINUE ▶', kind: 'primary', block: true, onClick: function () {
        try { store.dispatch('nextPhase'); } catch (e) { c.toast(String(e.message || e), 'bad'); RTG.UI.Router.sync(); }
      } })
    ] }));
    return { el: el, destroy: function () {} };
  }

  function modeOf(state) {
    var pd = state && state.pending;
    if (pd && pd.kind === 'DECISION' && pd.decision && pd.decision.kind === 'COMBINE_PLAN') return 'plan';
    if (pd && pd.kind === 'KICKS' && pd.session && String(pd.session.kind).indexOf('COMBINE') === 0) return 'session';
    if (state && state.stage === 'DRAFT' && state.phase === 'COMBINE' && !pd) return 'done';
    return 'other';
  }

  function factory(store) {
    var c = C();
    var el = c.el('div', { class: 'screen-session session-combine' });
    var inner = null, mode = null, destroyed = false, sessionFinished = false, unsub = null, lateTimer = null;

    function swap(next) {
      if (inner) { try { inner.destroy(); } catch (e) { /* ignore */ } if (inner.el && inner.el.parentNode) inner.el.parentNode.removeChild(inner.el); }
      inner = next;
      if (next && next.el) el.appendChild(next.el);
    }
    function render(force) {
      if (destroyed) return;
      var state = store.state;
      var m = modeOf(state);
      if (m === mode && !force) return;
      if (mode === 'session' && !sessionFinished && !force) {
        // let the last kick's result beat finish; when the session ended without the view's completion (forced or
        // rapid kicks through RTG.debug), swap to the done card once the beat had its chance
        if (!lateTimer) lateTimer = root.setTimeout(function () { lateTimer = null; if (!destroyed && !sessionFinished) { sessionFinished = true; render(true); } }, 1500);
        return;
      }
      if (lateTimer) { root.clearTimeout(lateTimer); lateTimer = null; }
      mode = m;
      if (m === 'plan') swap(planCard(store, state.pending.decision));
      else if (m === 'session') {
        sessionFinished = false;
        swap(RTG.UI.KickView.sessionScreen(store, {
          className: 'session-combine-run', header: header, update: update,
          onComplete: function (outcome) {
            sessionFinished = true;
            if (outcome && typeof outcome.combineScore === 'number') c.toast('Combine score ' + (outcome.combineScore > 0 ? '+' : '') + outcome.combineScore, 'gold', 3000);
            render(true);
          }
        }));
      } else if (m === 'done') swap(doneCard(store));
      else { swap(null); RTG.UI.Router.sync(); }
    }
    unsub = store.subscribe(function () { render(false); });
    render(true);
    return {
      el: el,
      onResize: function () { if (inner && inner.onResize) inner.onResize(); },
      destroy: function () { destroyed = true; if (lateTimer) root.clearTimeout(lateTimer); if (unsub) unsub(); swap(null); }
    };
  }

  Screens.combine = factory;
  if (RTG.UI.Router) RTG.UI.Router.register('combine', factory);
})(typeof window !== 'undefined' ? window : globalThis);
