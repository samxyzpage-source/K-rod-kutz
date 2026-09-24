/**
 * Road to Glory: QB — the settings modal (the kicker's settings screen as a kit modal; SPEC §4.5 / §4.8).
 *
 * One input mode in the demo (draw the line from the quarterback), so the modal keeps only what changes the feel and
 * the access: sound, aim assist (a pass line ending near its receiver's spot snaps onto it), haptics, the
 * left-handed mirror, reduced motion, colour-blind palette, high contrast, font scale, tooltips, the keyboard hand's
 * keys (throw, nudge, bend, loft, run, throw away, cancel) and RESET. Every change goes through store.setSetting →
 * app.applySettings (body classes) live, so the scene behind the modal updates at once.
 *
 *   RTG.UI.Screens.settingsModal(store) → the C.modal handle ({el, close}); RTG.UI.app.openSettings() opens it once.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Screens = RTG.UI.Screens = RTG.UI.Screens || {};

  function C() { return RTG.UI.C; }

  function keyName(k) { return k === ' ' ? 'SPACE' : String(k || '').replace('Arrow', '').toUpperCase(); }

  Screens.settingsModal = function (store, opts) {
    opts = opts || {};
    var c = C();
    var cancelRemap = null;
    function s() { return store.settings; }

    function toggle(key, label, hint) {
      var sw = c.el('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': s()[key] ? 'true' : 'false', 'aria-label': label, 'data-setting': key, onClick: function () {
        store.setSetting(key, !s()[key]);
        sw.setAttribute('aria-checked', s()[key] ? 'true' : 'false');
      } });
      return c.el('div', { class: 'toggle' }, c.el('span', { class: 'toggle-label' }, label, hint ? c.el('span', { class: 'toggle-hint', text: hint }) : null), sw);
    }

    function pills(key, label, options, hint) {
      var row = c.el('div', { class: 'pills', role: 'radiogroup', 'aria-label': label });
      var btns = [];
      options.forEach(function (o) {
        var b = c.el('button', { type: 'button', class: 'btn btn-ghost pill', role: 'radio', 'data-setting': key, 'data-value': String(o.value), text: o.label, onClick: function () {
          store.setSetting(key, o.value);
          btns.forEach(function (x, j) { var on = options[j].value === o.value; x.classList.toggle('active', on); x.setAttribute('aria-checked', on ? 'true' : 'false'); });
        } });
        var on = s()[key] === o.value;
        b.classList.toggle('active', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
        btns.push(b); row.appendChild(b);
      });
      return c.el('div', { class: 'toggle', style: 'flex-wrap:wrap' }, c.el('span', { class: 'toggle-label' }, label, hint ? c.el('span', { class: 'toggle-hint', text: hint }) : null), row);
    }

    function keyRow(key, label) {
      var b = c.button({ label: keyName(s().keys[key]), kind: 'secondary', small: true, ariaLabel: label + ' key: ' + keyName(s().keys[key]) + ', press to remap' });
      b.addEventListener('click', function () {
        if (cancelRemap) cancelRemap();
        b.textContent = 'PRESS A KEY…';
        b.classList.add('blink');
        function stop() {
          root.removeEventListener('keydown', onKey, true);
          if (cancelRemap === stop) cancelRemap = null;
          b.classList.remove('blink');
          b.textContent = keyName(s().keys[key]);
        }
        function onKey(ev) {
          ev.preventDefault(); ev.stopPropagation();
          if (ev.key !== 'Escape') { var k = {}; k[key] = ev.key; store.setSetting('keys', k); }
          stop();
        }
        cancelRemap = stop;
        root.addEventListener('keydown', onKey, true);
      });
      return c.el('div', { class: 'toggle' }, c.el('span', { class: 'toggle-label', text: label }), b);
    }

    var body = c.el('div', { class: 'settings-body' });
    body.appendChild(c.card({ title: 'GAMEPLAY', kind: 'flat', body: [
      toggle('audio', 'Sound', 'WebAudio bleeps; never required to play'),
      toggle('aimAssist', 'Aim assist', 'A pass line that ends near the spot its receiver can reach snaps onto it (a small magnet tick)'),
      toggle('haptics', 'Haptics', 'Vibrate on the snap, the release and the sack when the device supports it'),
      toggle('leftHanded', 'Left-handed mirror', 'Mirror the quarterback for a left-handed feel')
    ] }));
    body.appendChild(c.card({ title: 'ACCESSIBILITY', kind: 'flat', body: [
      toggle('reducedMotion', 'Reduced motion', 'No align beat, no shake, no slow-motion vignette, a short result'),
      toggle('colorblind', 'Colour-blind palette', 'Okabe–Ito reds / greens / golds'),
      toggle('highContrast', 'High contrast', 'Black and white with four high-contrast accents'),
      pills('fontScale', 'Font scale', [{ value: 1, label: '100%' }, { value: 1.25, label: '125%' }, { value: 1.5, label: '150%' }]),
      toggle('tooltips', 'Tooltips', 'Hover / long-press explanations on numbers')
    ] }));
    body.appendChild(c.card({ title: 'KEYS', kind: 'flat', body: [
      keyRow('confirm', 'Throw / commit the line'),
      keyRow('confirmAlt', 'Throw / commit (alt)'),
      keyRow('left', 'Nudge the end left'),
      keyRow('right', 'Nudge the end right'),
      keyRow('up', 'Nudge the end deeper'),
      keyRow('down', 'Nudge the end shorter'),
      keyRow('bendLeft', 'Bend the line left'),
      keyRow('bendRight', 'Bend the line right'),
      keyRow('loft', 'Bullet / touch / lob'),
      keyRow('run', 'Draw a run'),
      keyRow('throwAway', 'Throw away'),
      keyRow('cancel', 'Cancel the line'),
      c.el('p', { class: 'small txt-grey mt-1', text: '1–5 aim a straight pass at a receiver in slot order (WR1 WR2 SLOT TE RB); the play slows down while you compose; Escape opens this panel.' })
    ] }));
    body.appendChild(c.el('p', { class: 'small txt-grey', text: 'Settings live in ' + RTG.UI.Store.KEYS.settings + (RTG.UI.Storage && !RTG.UI.Storage.available ? ' (storage unavailable: memory only)' : '') + '. The demo keeps no save; ?seed= in the URL replays a drive.' }));

    var handle = c.modal({
      title: 'SETTINGS', body: body, closable: true, class: 'settings-modal', wide: true,
      buttons: [
        { label: 'RESET', kind: 'danger', close: false, onClick: function () {
          store.resetSettings();
          c.toast('Settings reset', 'good');
          sync();
          return false;
        } },
        { label: 'DONE', kind: 'primary' }
      ],
      onClose: function () { if (cancelRemap) cancelRemap(); if (unsub) unsub(); unsub = null; if (opts.onClose) opts.onClose(); }
    });

    function sync() {
      var sws = body.querySelectorAll('.switch[data-setting]');
      for (var i = 0; i < sws.length; i++) sws[i].setAttribute('aria-checked', s()[sws[i].getAttribute('data-setting')] ? 'true' : 'false');
      var ps = body.querySelectorAll('.pill[data-setting]');
      for (var j = 0; j < ps.length; j++) { var on = String(s()[ps[j].getAttribute('data-setting')]) === ps[j].getAttribute('data-value'); ps[j].classList.toggle('active', on); ps[j].setAttribute('aria-checked', on ? 'true' : 'false'); }
    }
    var unsub = store.subscribe(function (info) { if (info.fnName === 'settings') sync(); });
    return handle;
  };
})(typeof window !== 'undefined' ? window : globalThis);
