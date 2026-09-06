/**
 * Road to Glory: Kicker — 'title' screen (SPEC §4.5).
 *
 * Canvas strip of goalposts at dusk (plain ctx rects, no dependency on ui/sprites) with a ball wobbling on its tee
 * via uiRng; logo; NEW CAREER · CONTINUE (autosave summary via Save.slotSummary) · LOAD · SETTINGS; a ticker of
 * the best careers from rtg.records; version + seed in the corner. The RAF loop stops in destroy().
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};

  var W = 192, H = 80;

  function factory(store) {
    var C = RTG.UI.C, Router = RTG.UI.Router, P = RTG.UI.Palette;
    var el = C.el('div', { class: 'screen screen-full title-screen' });
    var raf = 0, destroyed = false, t0 = 0, wobble = 0, wobbleTarget = 0, lastWobble = 0;
    var stars = [];
    for (var i = 0; i < 18; i++) stars.push({ x: store.uiRng.int(0, W - 1), y: store.uiRng.int(0, 28), p: store.uiRng.float(0, 6.28) });

    var canvas = C.el('canvas', { class: 'title-canvas', width: W, height: H, role: 'img', 'aria-label': 'Goalposts at dusk, a football on a tee' });
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    function reduced() { return RTG.UI.Shell && RTG.UI.Shell.reducedMotion ? RTG.UI.Shell.reducedMotion() : false; }

    function draw(now) {
      var pal = P.current();
      // sky bands (flat, no gradients)
      var bands = [pal.night, pal.navy, pal.dusk, pal.dusk2, pal.sunset];
      var bh = Math.ceil(52 / bands.length);
      for (var b = 0; b < bands.length; b++) { ctx.fillStyle = bands[b]; ctx.fillRect(0, b * bh, W, bh + 1); }
      // stars twinkle
      ctx.fillStyle = pal.chalk;
      for (var s = 0; s < stars.length; s++) {
        var st = stars[s];
        if (st.y < 24 && Math.sin(now / 700 + st.p) > 0.1) ctx.fillRect(st.x, st.y, 1, 1);
      }
      // sun sliver
      ctx.fillStyle = pal.gold; ctx.fillRect(150, 44, 14, 3); ctx.fillRect(152, 42, 10, 2);
      // stands silhouette
      ctx.fillStyle = pal.night;
      for (var x = 0; x < W; x += 6) ctx.fillRect(x, 46 + ((x / 6) % 2), 5, 8);
      // field with stripes
      for (var f = 0; f < 4; f++) { ctx.fillStyle = f % 2 ? pal.grass2 : pal.grass; ctx.fillRect(0, 54 + f * 7, W, 7); }
      ctx.fillStyle = pal.chalk;
      for (var y = 56; y < H; y += 7) ctx.fillRect(0, y, W, 1);
      // uprights
      ctx.fillStyle = pal.chalk;
      ctx.fillRect(72, 14, 2, 42); ctx.fillRect(118, 14, 2, 42); ctx.fillRect(72, 30, 48, 2); ctx.fillRect(95, 30, 2, 26);
      ctx.fillRect(94, 54, 4, 4);
      // ball on tee (wobble)
      var bx = 96 + Math.round(wobble * 2), by = 66;
      ctx.fillStyle = pal.ink; ctx.fillRect(bx - 2, by + 5, 5, 2);
      ctx.fillStyle = pal.ball;
      ctx.fillRect(bx - 1, by - 3, 3, 1); ctx.fillRect(bx - 2, by - 2, 5, 6); ctx.fillRect(bx - 1, by + 4, 3, 1);
      ctx.fillStyle = pal.chalk; ctx.fillRect(bx, by - 1, 1, 4);
      // kicker silhouette (tiny)
      ctx.fillStyle = pal.ink;
      ctx.fillRect(84, 60, 3, 3); ctx.fillRect(83, 63, 5, 6); ctx.fillRect(82, 69, 2, 4); ctx.fillRect(87, 69, 2, 4);
      ctx.fillStyle = pal.cream; ctx.fillRect(84, 60, 3, 1);
    }

    function frame(now) {
      raf = 0;
      if (destroyed) return;
      if (!t0) t0 = now;
      if (now - lastWobble > 260) { lastWobble = now; wobbleTarget = store.uiRng.gauss(0, 0.6); }
      wobble += (wobbleTarget - wobble) * 0.15;
      draw(now);
      if (!reduced()) raf = root.requestAnimationFrame(frame);
    }

    // header / logo
    var hero = C.el('div', { class: 'title-hero' }, canvas,
      C.el('div', { class: 'title-logo', 'aria-label': 'Road to Glory: Kicker' },
        C.el('span', { class: 'title-logo-1', text: 'ROAD TO GLORY' }),
        C.el('span', { class: 'title-logo-2', text: 'KICKER' })));

    // buttons
    var summary = store.slotSummary('auto');
    var menu = C.el('div', { class: 'title-menu' });
    menu.appendChild(C.button({ label: 'NEW CAREER', kind: 'primary', block: true, icon: 'boot', onClick: function () { Router.go('newcareer'); } }));
    var cont = C.button({ label: 'CONTINUE', kind: 'secondary', block: true, icon: 'arrow-r', disabled: !summary, onClick: function () {
      var r = store.load('auto');
      if (!r.ok) C.toast(r.error, 'bad', 4000);
      else if (r.warnings && r.warnings.length) C.toast(r.warnings[0], 'info');
    } });
    menu.appendChild(cont);
    if (summary) {
      menu.appendChild(C.el('div', { class: 'title-summary small txt-grey', 'data-summary': '1' },
        summary.name + ' · ' + (summary.team || 'no team') + ' · Y' + summary.year + ' ' + summary.stage + '.' + summary.phase + ' · OVR ' + summary.ovr + ' · ' + C.fmt.ago(summary.savedAt)));
    }
    menu.appendChild(C.button({ label: 'LOAD', kind: 'secondary', block: true, icon: 'save', onClick: function () { Router.go('saves'); } }));
    menu.appendChild(C.button({ label: 'SETTINGS', kind: 'secondary', block: true, icon: 'gear', onClick: function () { Router.go('settings'); } }));

    // records ticker
    var rec = store.getRecords();
    var best = rec.careers.slice().sort(function (a, b) { return (b.hof || 0) - (a.hof || 0); }).slice(0, 6);
    var tickerText = best.length ? best.map(function (c) { return (c.name || '?') + ' · ' + (c.tier || '') + ' · HOF ' + (c.hof || 0) + ' · ' + (c.fgm || 0) + ' FGM · LONG ' + (c.long || 0); }).join('   ★   ')
      : 'NO LEGENDS YET · EVERY KICK COUNTS · THE POST IS NOT YOUR FRIEND · GO KICK SOMETHING';
    var ticker = C.el('div', { class: 'ticker', 'aria-label': 'Best careers' }, C.el('div', { class: 'ticker-inner', text: tickerText + '   ★   ' + tickerText }));

    var seed = store.state ? store.state.seed : null;
    var foot = C.el('div', { class: 'title-foot small txt-grey' },
      C.el('span', { text: 'v' + RTG.VERSION + ' · save v' + RTG.SAVE_VERSION }),
      seed !== null ? C.el('span', { class: 'num', 'data-seed': String(seed), text: 'seed ' + seed }) : C.el('span', { text: RTG.UI.Storage.available ? '' : 'storage unavailable — saves live in memory' }));

    el.appendChild(hero);
    el.appendChild(menu);
    el.appendChild(ticker);
    el.appendChild(foot);

    draw(0);
    raf = root.requestAnimationFrame(frame);

    return {
      el: el,
      destroy: function () { destroyed = true; if (raf) { root.cancelAnimationFrame(raf); raf = 0; } },
      onResize: function () { draw(0); },
      onKey: function (ev) {
        if (ev.key === 'Enter' && root.document.activeElement === root.document.body) { Router.go('newcareer'); return true; }
        return false;
      }
    };
  }

  RTG.UI.Router.register('title', factory);
})(typeof window !== 'undefined' ? window : globalThis);
