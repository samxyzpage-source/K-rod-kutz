/**
 * Road to Glory: Kicker — screen 'offers' (SPEC §4.5 offers row, §2.7.2).
 *
 * The pending OFFERS_COLLEGE decision as a card carousel (swipe / arrow buttons / ← → keys / dots): crest, prestige
 * stars, depth pill OPEN / VET / STAR, coach line, NIL, climate icon, near-home tag; COMPARE toggles a side-by-side
 * table (one column per offer, inside .scroll-x). COMMIT → dispatch('decide', {kind:'OFFERS_COLLEGE', optionId}).
 * Offer cards themselves come from RTG.UI.Kit.offerCard (shared with the TRANSFER step of the offseason wizard).
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
    var el = c.el('div', { class: 'screen scr-offers' });
    var unsub = null, destroyed = false;
    var idx = 0, compare = false;

    function decision(state) {
      var pd = state && state.pending;
      return pd && pd.kind === 'DECISION' && pd.decision && pd.decision.kind === 'OFFERS_COLLEGE' ? pd.decision : null;
    }

    function pick(dec, offer) {
      var t = Kit.team(offer.teamId);
      c.confirm({ title: 'Commit to ' + (offer.school || offer.teamName) + '?', text: (t && t.city ? t.city + ' · ' : '') + 'Prestige ' + offer.prestige + '★ · ' + offer.depth + ' job · NIL $' + offer.nil + 'k/yr. This is your college for the next years.', okLabel: 'COMMIT' })
        .onOk(Kit.safe(function () {
          var r = store.dispatch('decide', { kind: 'OFFERS_COLLEGE', optionId: offer.id });
          c.announce('Committed to ' + (offer.teamName || offer.teamId) + '.');
          if (r && r.headline && r.headline.text) c.toast(r.headline.text, 'gold', 4000);
        }));
    }

    function carousel(dec) {
      var offers = dec.payload.offers || [];
      if (idx >= offers.length) idx = Math.max(0, offers.length - 1);
      var wrap = c.el('div', { class: 'carousel', role: 'group', 'aria-label': 'College offers', 'aria-roledescription': 'carousel' });
      var track = c.el('div', { class: 'carousel-track' });
      offers.forEach(function (o, i) {
        var slide = c.el('div', { class: 'carousel-slide' + (i === idx ? ' active' : ''), role: 'group', 'aria-label': 'Offer ' + (i + 1) + ' of ' + offers.length, 'aria-hidden': i === idx ? 'false' : 'true' });
        var copy = {};
        for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) copy[k] = o[k];
        copy.myOvr = dec.payload.myOvr;
        slide.appendChild(Kit.offerCard(copy, { onPick: function () { pick(dec, o); }, pickLabel: 'COMMIT', selected: i === idx }));
        if (i !== idx) { var hidden = slide.querySelectorAll('button'); for (var h = 0; h < hidden.length; h++) hidden[h].setAttribute('tabindex', '-1'); }
        track.appendChild(slide);
      });
      track.style.transform = 'translateX(' + (-idx * 100) + '%)';
      wrap.appendChild(track);
      // swipe
      var x0 = null;
      wrap.addEventListener('touchstart', function (ev) { x0 = ev.touches && ev.touches[0] ? ev.touches[0].clientX : null; }, { passive: true });
      wrap.addEventListener('touchend', function (ev) {
        if (x0 === null) return;
        var t = ev.changedTouches && ev.changedTouches[0];
        if (!t) return;
        var dx = t.clientX - x0; x0 = null;
        if (Math.abs(dx) < 40) return;
        go(dx < 0 ? 1 : -1);
      }, { passive: true });
      var nav = c.el('div', { class: 'carousel-nav row row-between' },
        c.button({ kind: 'ghost', icon: 'arrow-l', ariaLabel: 'Previous offer', action: 'prev', disabled: idx === 0, onClick: function () { go(-1); } }),
        c.el('div', { class: 'carousel-dots', role: 'tablist' }, offers.map(function (o, i) {
          return c.el('button', { type: 'button', class: 'carousel-dot' + (i === idx ? ' active' : ''), role: 'tab', 'aria-selected': i === idx ? 'true' : 'false', 'aria-label': 'Offer ' + (i + 1) + ': ' + (o.school || o.teamName), onClick: function () { idx = i; render(); } });
        })),
        c.button({ kind: 'ghost', icon: 'arrow-r', ariaLabel: 'Next offer', action: 'next', disabled: idx >= offers.length - 1, onClick: function () { go(1); } }));
      return [wrap, nav];
    }

    function go(d) {
      var dec = decision(store.state);
      if (!dec) return;
      var n = (dec.payload.offers || []).length;
      idx = Math.max(0, Math.min(n - 1, idx + d));
      render();
      var s = el.querySelector('.carousel-slide.active .offer-name');
      if (s) c.announce('Offer ' + (idx + 1) + ' of ' + n + ': ' + s.textContent);
    }

    function compareTable(dec) {
      var offers = dec.payload.offers || [];
      var rows = [
        { k: 'School', f: function (o) { return o.school || o.teamName; } },
        { k: 'Prestige', f: function (o) { return c.stars(o.prestige); } },
        { k: 'Depth', f: function (o) { return c.chip(o.depth, o.depth === 'OPEN' ? 'mint' : o.depth === 'STAR' ? 'red' : 'grey'); } },
        { k: 'Incumbent', f: function (o) { return o.incumbent ? 'OVR ' + o.incumbent.ovr + ' · ' + o.incumbent.age + 'y' : 'none'; } },
        { k: 'Coach', f: function (o) { return o.coach; } },
        { k: 'NIL / yr', f: function (o) { return '$' + o.nil + 'k'; } },
        { k: 'Climate', f: function (o) { return Kit.climateChip(Kit.team(o.teamId) || o); } },
        { k: 'Near home', f: function (o) { return o.nearHome ? 'YES' : '—'; } },
        { k: 'Conference', f: function (o) { return o.conf || '—'; } },
        { k: 'Fame mult', f: function (o) { return typeof o.fameMult === 'number' ? '×' + o.fameMult.toFixed(2) : '—'; } },
        { k: 'Draft bump', f: function (o) { return typeof o.draftBump === 'number' ? c.fmt.signed(o.draftBump) : '—'; } }
      ];
      var t = c.el('table', { class: 'tbl tbl-compact compare-tbl' });
      var tr = c.el('tr', null, c.el('th', { scope: 'col', text: '' }));
      offers.forEach(function (o) { tr.appendChild(c.el('th', { scope: 'col' }, c.el('span', { class: 'row' }, c.crest(o.teamId, 16), c.el('span', { text: o.abbr || Kit.abbr(o.teamId) })))); });
      t.appendChild(c.el('thead', null, tr));
      var tb = c.el('tbody');
      rows.forEach(function (r) {
        var row = c.el('tr', null, c.el('th', { scope: 'row', text: r.k }));
        offers.forEach(function (o) { row.appendChild(c.el('td', null, r.f(o))); });
        tb.appendChild(row);
      });
      var act = c.el('tr', null, c.el('th', { scope: 'row', text: '' }));
      offers.forEach(function (o) { act.appendChild(c.el('td', null, c.button({ label: 'COMMIT', kind: 'primary', small: true, action: 'pick-' + o.id, onClick: function () { pick(dec, o); } }))); });
      tb.appendChild(act);
      t.appendChild(tb);
      return c.el('div', { class: 'scroll-x compare-scroll' }, t);
    }

    function render() {
      if (destroyed) return;
      var state = store.state, dec = decision(state);
      var parts = [];
      parts.push(c.el('header', { class: 'screen-head' }, c.el('h1', { class: 'screen-title', text: 'COLLEGE OFFERS' }),
        dec ? c.el('div', { class: 'screen-head-right' }, c.button({ label: compare ? 'CARDS' : 'COMPARE', kind: 'ghost', small: true, icon: compare ? 'team' : 'stats', action: 'compare', 'aria-pressed': compare ? 'true' : 'false', onClick: function () { compare = !compare; render(); } })) : null));
      if (!dec) {
        parts.push(c.card({ kind: 'sky', body: c.el('p', { text: 'No college offers are pending.' }), footer: [c.button({ label: 'CONTINUE', kind: 'primary', onClick: function () { R.sync({ force: true }); } })] }));
        c.replace(el, parts);
        return;
      }
      var pl = dec.payload, p = state.player;
      var intro = c.el('div', { class: 'row row-wrap offers-intro' },
        c.pixelAvatar(p.look, 40),
        c.el('div', { class: 'col grow', style: 'gap:2px' },
          c.el('strong', { text: p.name.full }),
          c.el('span', { class: 'row row-wrap small' }, Kit.tip(c.stars(pl.stars), pl.stars + '-star recruit'), Kit.numEl('OVR ' + pl.myOvr, 'Your overall rating'), c.el('span', { class: 'txt-grey', text: (pl.offers || []).length + ' offer' + ((pl.offers || []).length === 1 ? '' : 's') }))));
      parts.push(c.card({ kind: 'flat', class: 'offers-header', body: intro }));
      if (pl.walkon) parts.push(c.el('div', { class: 'banner banner-gold small' }, 'WALK-ON PATH — no scholarship, but a Hall of Fame bonus if you make it'));
      if (compare) parts.push(compareTable(dec)); else parts = parts.concat(carousel(dec));
      parts.push(c.el('p', { class: 'small txt-grey center mt-1', text: compare ? 'Tap a column to commit.' : 'Swipe or use the arrows to browse. COMMIT locks your school.' }));
      c.replace(el, parts);
    }

    render();
    unsub = store.subscribe(function () { render(); });
    return {
      el: el,
      destroy: function () { destroyed = true; if (unsub) unsub(); unsub = null; },
      onKey: function (ev) {
        if (compare) return false;
        if (ev.key === 'ArrowLeft') { go(-1); return true; }
        if (ev.key === 'ArrowRight') { go(1); return true; }
        return false;
      }
    };
  }

  Screens.offers = factory;
  RTG.UI.Router.register('offers', factory);
})(typeof window !== 'undefined' ? window : globalThis);
