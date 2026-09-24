/**
 * Road to Glory: QB — 'moment' screen (chromeless): the QB moment for the armed situation, and between moments the
 * short DRIVE interstitial (the story line from the last result, the running box score, NEXT UP, NEXT).
 *
 * The moment itself is hosted by RTG.UI.Moment, which depends ONLY on { ctx, Play, PlayView } (+ the rng that the
 * engine's forks draw from), so the future career can mount it unchanged:
 *
 *   var m = RTG.UI.Moment.mount(container, {
 *     ctx,                         PlayContext (Play.buildContext)
 *     Play, PlayView,              RTG.Play / RTG.UI.PlayView (defaults to the globals)
 *     rng,                         the rng the snap / live forks draw from (it never leaves the host)
 *     settings?, store?, reduced?, tints?, uiRng?,
 *     onSnap?(sim), onLive?(live, sim, rngState), onResult?(result, sim), onDone(result, sim, how), onSettings?()
 *   }) → { el, view, ctx(), sim(), live(), plan(), result(), setSim(s), destroy() }
 *
 *   The host hands the scene onPick = Play.snap(ctx, playId, rng) and makeLive = Play.live(sim, rng): the engine
 *   owns every position and the rng stays here. At the end, onDone(result, sim, how) with
 *   how = { plan: live.plan() (the drawn runs / the pass / the throw-away at their sim times — Play.resolve(sim,
 *   plan, rng at liveRng) replays the moment exactly) | null, liveRng (the parent state before the live fork),
 *   liveForked: true, forced }. A run card (SNEAK / DRAW) never makes a Live: the host spends the live fork itself
 *   at the end, so every moment costs the rng exactly 3 parent draws (buildContext · snap · live).
 *
 * The screen: RTG.UI.Screens.moment(store) → {el, destroy, onResize, onKey}. It reads store.pending():
 * 'PLAY' mounts the Moment for store.context(); onDone → store.record(result, sim, how) → the interstitial
 * ('STORY') or, after the sixth moment, RTG.UI.app.go('summary'). NEXT → store.next() → the next Moment in place (the
 * screen id stays 'moment' throughout; RTG.UI.PlayView.current() is the live scene while one is mounted).
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Screens = RTG.UI.Screens = RTG.UI.Screens || {};

  function C() { return RTG.UI.C; }
  function app() { return RTG.UI.app; }
  function logError(what, e) { if (root.console) root.console.error(what, e); }

  // ─────────────────────────── the reusable moment host ───────────────────────────

  var Moment = {};

  Moment.mount = function (container, o) {
    o = o || {};
    var Play = o.Play || RTG.Play, PV = o.PlayView || RTG.UI.PlayView;
    if (!o.ctx) throw new Error('Moment.mount: a PlayContext is required');
    if (!o.rng || typeof o.rng.fork !== 'function') throw new Error('Moment.mount: an rng is required');
    if (!Play || typeof Play.snap !== 'function' || typeof Play.live !== 'function') throw new Error('Moment.mount: RTG.Play (snap / live) is missing');
    if (!PV || typeof PV.mount !== 'function') throw new Error('Moment.mount: RTG.UI.PlayView is missing');
    var ctx = o.ctx, rng = o.rng;
    var sim = null, live = null, liveRng = null, liveForked = false, result = null, destroyed = false, done = false;
    var wrap = C().el('div', { class: 'moment-host' });
    container.appendChild(wrap);

    /** The live fork is spent exactly once per moment (by Play.live, or here for a run card / a result without a Live). */
    function spendLive() {
      if (liveForked) return;
      liveRng = rng.state();
      rng.fork('play:live');                                                            // 1 parent draw
      liveForked = true;
      if (o.onLive) { try { o.onLive(null, sim, liveRng); } catch (e) { logError('Moment onLive failed', e); } }
    }
    function planOf() {
      if (!live || typeof live.plan !== 'function') return null;
      try { return live.plan(); } catch (e) { logError('live.plan failed', e); return null; }
    }

    var view = PV.mount(wrap, {
      ctx: ctx, settings: o.settings, store: o.store, reduced: o.reduced, tints: o.tints, uiRng: o.uiRng,
      onPick: function (playId) {
        sim = Play.snap(ctx, playId, rng);                                               // 1 parent draw
        if (o.onSnap) { try { o.onSnap(sim); } catch (e) { logError('Moment onSnap failed', e); } }
        return sim;
      },
      makeLive: function (s) {
        if (s) sim = s;
        if (liveForked && live) return live;                                              // one Live per moment
        liveRng = rng.state();
        live = Play.live(sim, rng);                                                        // 1 parent draw
        liveForked = true;
        if (o.onLive) { try { o.onLive(live, sim, liveRng); } catch (e) { logError('Moment onLive failed', e); } }
        return live;
      },
      onResult: function (res) { result = res; if (o.onResult) o.onResult(res, sim); },
      onDone: function (res) {
        result = res;
        if (destroyed || done) return;
        done = true;
        spendLive();
        var forced = !!(res && res.forced), run = !!(sim && sim.run);
        var how = { plan: forced || run ? null : planOf(), liveRng: forced || run ? null : liveRng, liveForked: true, forced: forced };
        if (o.onDone) o.onDone(res, sim, how);
      },
      onSettings: o.onSettings
    });
    return {
      el: wrap, view: view,
      ctx: function () { return ctx; },
      sim: function () { return sim; },
      live: function () { return live; },
      /** The input log so far (live.plan()) or null before the snap / on a run card. */
      plan: planOf,
      result: function () { return result; },
      /** Tell the host about a sim produced outside the view (RTG.debug). */
      setSim: function (s) { sim = s; },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        try { view.destroy(); } catch (e) { /* ignore */ }
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      }
    };
  };

  RTG.UI.Moment = Moment;

  // ─────────────────────────── the interstitial ───────────────────────────

  var KIND_LABEL = { THIRD_MEDIUM: 'THIRD AND MEDIUM', THIRD_LONG: 'THIRD AND LONG', RED_ZONE: 'THE RED ZONE', SHORT_YARDAGE: 'SHORT YARDAGE', TWO_MINUTE: 'THE TWO-MINUTE DRILL', LAST_PLAY: 'THE LAST PLAY' };

  function bannerKind(r) {
    if (r.td) return 'gold';
    if (r.outcome === 'INT' || r.turnover) return 'bad';
    if (r.outcome === 'CATCH' || r.firstDown || ((r.outcome === 'SCRAMBLE' || r.outcome === 'RUN') && r.yards > 0)) return 'good';
    if (r.outcome === 'THROWAWAY') return '';
    return 'bad';
  }

  /** 'ON THE MONEY · ON TIME · BULLET' — what the pass looked like (placement · timing · touch); '' for a run / a sack. */
  function feedbackLine(r) {
    var f = r && r.feedback;
    if (!f || r.outcome === 'RUN' || r.outcome === 'SACK' || r.outcome === 'SCRAMBLE') return '';
    var parts = [];
    if (f.placement && f.placement !== '—') parts.push(f.placement);
    if (f.timing && f.timing !== '—') parts.push(f.timing);
    if (f.touch && f.touch !== '—' && r.outcome !== 'THROWAWAY') parts.push(f.touch);
    return parts.join(' · ');
  }

  /** The running line as chips: 12/18 · 141 YDS · 1 TD · 0 INT · 2 SACK · RATING 98.4 */
  function lineChips(store) {
    var c = C(), l = store.line(), P = RTG.Play;
    var rating = P && P.rating ? P.rating(l) : 0;
    var chips = c.el('div', { class: 'chips drive-line', role: 'group', 'aria-label': 'Passing line' });
    chips.appendChild(c.chip(l.cmp + '/' + l.att, 'dark'));
    chips.appendChild(c.chip(l.yds + ' YDS', 'dark'));
    chips.appendChild(c.chip(l.td + ' TD', l.td ? 'mint' : 'dark'));
    chips.appendChild(c.chip(l.int + ' INT', l.int ? 'red' : 'dark'));
    if (l.sacks) chips.appendChild(c.chip(l.sacks + ' SACK', 'dark'));
    if (l.rushes) chips.appendChild(c.chip(l.rushYds + ' RUSH', 'dark'));
    chips.appendChild(c.chip('RTG ' + rating.toFixed(1), 'gold'));
    return chips;
  }

  function buildStory(store, onNext) {
    var c = C(), d = store.drive, story = d.story || {}, last = d.results[d.results.length - 1];
    var el = c.el('div', { class: 'drive-card-wrap' });
    var card = c.card({ title: 'THE DRIVE', class: 'drive-card', kind: story.won ? 'gold' : (story.td ? 'gold' : (story.continues ? 'mint' : '')), right: c.el('span', { class: 'num', text: 'MOMENT ' + d.idx + ' OF ' + d.script.length }) });
    if (last) {
      var bk = bannerKind(last);
      card.body.appendChild(c.el('div', { class: 'banner drive-banner' + (bk ? ' banner-' + bk : ''), 'data-outcome': last.outcome, text: last.banner || last.text || last.outcome }));
      var sub = [];
      if (last.playName) sub.push(last.playName);
      if (last.targetName) sub.push('to ' + last.targetName);
      if (last.text && last.text !== last.banner) sub.push(last.text);
      if (sub.length) card.body.appendChild(c.el('p', { class: 'small txt-grey center drive-sub', text: sub.join(' · ') }));
      var fl = feedbackLine(last);
      if (fl) card.body.appendChild(c.el('p', { class: 'small drive-feedback center', 'data-feedback': '1', text: fl }));
      if (last.feedback && last.feedback.coachSaw) card.body.appendChild(c.el('p', { class: 'small drive-coach', text: last.feedback.coachSaw }));
    }
    card.body.appendChild(c.el('p', { class: 'drive-story', 'data-story': '1', text: story.text || '' }));
    card.body.appendChild(lineChips(store));
    var next = d.pending === 'STORY' ? d.script[d.idx] : null;
    if (next) {
      card.body.appendChild(c.el('div', { class: 'drive-next' },
        c.el('span', { class: 'section-title drive-next-title', text: 'NEXT UP: ' + (KIND_LABEL[next.kind] || next.kind) }),
        c.el('span', { class: 'drive-next-line num', text: story.nextText || '' }),
        c.el('span', { class: 'small txt-sky', text: next.stakes || '' })));
    }
    var btn = c.button({ label: next ? 'NEXT' : 'THE BOX SCORE', kind: 'primary', block: true, icon: 'arrow-r', action: 'next', onClick: onNext });
    // a touch player has no Escape: the interstitial is the one place between START and the summary to reach Settings
    var settings = c.button({ label: 'SETTINGS', kind: 'ghost', block: true, icon: 'gear', action: 'settings', onClick: function () { app().openSettings(); } });
    card.appendChild(c.el('div', { class: 'card-footer drive-actions' }, btn, settings));
    el.appendChild(card);
    el.appendChild(c.el('p', { class: 'small txt-grey center drive-hint', text: 'Escape · settings' }));
    root.setTimeout(function () { try { btn.focus(); } catch (e) { /* ignore */ } }, 0);
    return el;
  }

  // ─────────────────────────── the screen ───────────────────────────

  function factory(store) {
    var c = C();
    var el = c.el('div', { class: 'screen-moment', 'data-stage': '' });
    var host = null, storyEl = null, destroyed = false;

    function clear() {
      if (host) { host.destroy(); host = null; }
      if (storyEl && storyEl.parentNode) storyEl.parentNode.removeChild(storyEl);
      storyEl = null;
    }

    function renderPlay() {
      clear();
      var ctx = store.context();
      if (!ctx) { app().go('summary'); return; }
      el.setAttribute('data-stage', 'play');
      host = Moment.mount(el, {
        ctx: ctx, rng: store.rng, Play: RTG.Play, PlayView: RTG.UI.PlayView,
        settings: store.settings, store: store, reduced: app().reducedMotion(), tints: store.tints(), uiRng: store.uiRng,
        onSnap: function (sim) { store.drive.sim = sim; store.drive.live = null; },
        onLive: function (live, sim, rngState) { store.noteLive(live, rngState); },
        onDone: function (res, sim, how) {
          if (destroyed) return;
          try { store.record(res, sim, how); }
          catch (e) { logError('record failed', e); c.toast('Could not record the result: ' + (e.message || e), 'bad', 5000); return; }
          if (store.isDone()) app().go('summary');
          else renderStory();
        },
        onSettings: function () { app().openSettings(); }
      });
    }

    function renderStory() {
      clear();
      el.setAttribute('data-stage', 'story');
      storyEl = buildStory(store, function () {
        if (store.pending() === 'DONE') { app().go('summary'); return; }
        store.next();
        renderPlay();
      });
      el.appendChild(storyEl);
      var d = store.drive;
      c.announce((d.story && d.story.text ? d.story.text + ' ' : '') + (d.pending === 'STORY' ? 'Next: ' + (d.story.nextText || '') : 'The drive is over.'));
    }

    var pending = store.pending();
    if (!pending) { root.setTimeout(function () { app().go('title'); }, 0); }
    else if (pending === 'DONE') { root.setTimeout(function () { app().go('summary'); }, 0); }
    else if (pending === 'STORY') renderStory();
    else renderPlay();

    return {
      el: el,
      host: function () { return host; },
      view: function () { return host ? host.view : null; },
      renderPlay: renderPlay,
      renderStory: renderStory,
      onResize: function () { if (host && host.view && host.view.resize) host.view.resize(); },
      onKey: function (ev) {
        // the interstitial: Enter / Space on the body → NEXT (the button already has the focus, this is the fallback)
        if (storyEl && (ev.key === 'Enter' || ev.key === ' ') && ev.target === root.document.body) {
          var b = storyEl.querySelector('[data-action="next"]');
          if (b) { b.click(); return true; }
        }
        return false;
      },
      destroy: function () { destroyed = true; clear(); }
    };
  }

  Screens.moment = factory;
})(typeof window !== 'undefined' ? window : globalThis);
