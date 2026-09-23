/**
 * Road to Glory: QB — app shell boot
 *
 * SCAFFOLD STUB — owner: the SHELL agent (replace this file whole). Renders one "coming up" line into #app so
 * the page is not blank while the shell is being built.
 *
 * Contract the e2e harness relies on (keep it in the real shell):
 *   RTG.UI.app.ready   → true once the first screen is mounted (H.openApp / H.openDemo wait for it)
 *   RTG.UI.app.screen() → 'title' | 'moment' | 'summary' (H.waitForScreen)
 *   RTG.UI.boot()      → idempotent boot (called on DOMContentLoaded / immediately when the DOM is ready)
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var doc = root.document;

  var app = RTG.UI.app = RTG.UI.app || {};
  app.ready = false;
  app.screen = function () { return 'stub'; };

  RTG.UI.boot = function () {
    if (app.ready) return app;
    var c = RTG.UI.C;
    var host = doc.getElementById('app');
    if (!host) { host = doc.createElement('div'); host.id = 'app'; doc.body.appendChild(host); }
    host.classList.add('chromeless');
    host.setAttribute('data-screen', 'stub');
    var main = c.el('main', { class: 'screen-host', id: 'screen-host' });
    var body = c.el('div', { class: 'stack' },
      c.el('p', { class: 'txt-gold', text: 'THE MOMENT — coming up.' }),
      c.el('p', { class: 'small txt-grey', text: 'Scaffold stub (js/ui/app.js): the shell, the play engine and the scene are being built.' }));
    main.appendChild(c.el('div', { style: 'padding: 24px 16px; max-width: 480px; margin: 0 auto;' },
      c.card({ title: 'ROAD TO GLORY: QB', body: body })));
    host.appendChild(main);
    app.ready = true;
    return app;
  };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', function () { RTG.UI.boot(); });
  else RTG.UI.boot();
})(typeof window !== 'undefined' ? window : globalThis);
