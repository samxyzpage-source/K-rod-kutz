/**
 * Road to Glory: Kicker — 'settings' screen (SPEC §4.5 / §4.8).
 *
 * Every Settings key (rtg.settings), applied live through store.setSetting → app.js body classes. Key remap rows
 * capture the next key press. RESET restores the defaults.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};

  function factory(store) {
    var C = RTG.UI.C, Router = RTG.UI.Router;
    var el = C.screen({ title: 'SETTINGS', back: function () { if (store.state) Router.back(); else Router.go('title'); } });
    el.classList.add('settings-screen');
    var unsub = null;

    function s() { return store.settings; }

    function toggle(key, label, hint) {
      var sw = C.el('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': s()[key] ? 'true' : 'false', 'aria-label': label, 'data-setting': key, onClick: function () {
        store.setSetting(key, !s()[key]);
        sw.setAttribute('aria-checked', s()[key] ? 'true' : 'false');
      } });
      return C.el('div', { class: 'toggle' }, C.el('span', { class: 'toggle-label' }, label, hint ? C.el('span', { class: 'toggle-hint', text: hint }) : null), sw);
    }

    function pills(key, label, options, hint) {
      var row = C.el('div', { class: 'pills', role: 'radiogroup', 'aria-label': label });
      var btns = [];
      options.forEach(function (o) {
        var b = C.el('button', { type: 'button', class: 'btn btn-ghost pill', role: 'radio', 'data-setting': key, 'data-value': String(o.value), text: o.label, onClick: function () {
          store.setSetting(key, o.value);
          btns.forEach(function (x, j) { var on = options[j].value === o.value; x.classList.toggle('active', on); x.setAttribute('aria-checked', on ? 'true' : 'false'); });
        } });
        var on = s()[key] === o.value;
        b.classList.toggle('active', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
        btns.push(b); row.appendChild(b);
      });
      return C.el('div', { class: 'toggle', style: 'flex-wrap:wrap' }, C.el('span', { class: 'toggle-label' }, label, hint ? C.el('span', { class: 'toggle-hint', text: hint }) : null), row);
    }

    function keyName(k) { return k === ' ' ? 'SPACE' : String(k).replace('Arrow', '').toUpperCase(); }
    function keyRow(key, label) {
      var b = C.button({ label: keyName(s().keys[key]), kind: 'secondary', small: true, ariaLabel: label + ' key: ' + keyName(s().keys[key]) + ', press to remap' });
      b.addEventListener('click', function () {
        b.textContent = 'PRESS A KEY…';
        b.classList.add('blink');
        function onKey(ev) {
          ev.preventDefault(); ev.stopPropagation();
          root.removeEventListener('keydown', onKey, true);
          b.classList.remove('blink');
          if (ev.key !== 'Escape') { var k = {}; k[key] = ev.key; store.setSetting('keys', k); }
          b.textContent = keyName(s().keys[key]);
        }
        root.addEventListener('keydown', onKey, true);
      });
      return C.el('div', { class: 'toggle' }, C.el('span', { class: 'toggle-label', text: label }), b);
    }

    el.appendChild(C.card({ title: 'GAMEPLAY', body: [
      toggle('audio', 'Audio', 'WebAudio bleeps; never required to play'),
      pills('autoPat', 'Auto-PAT', [{ value: 'off', label: 'OFF' }, { value: 'safe', label: 'SAFE' }, { value: 'all', label: 'ALL' }], 'SAFE auto-kicks extra points unless the pressure is on'),
      toggle('playKickoffs', 'Play kickoffs', 'One-tap timing bar instead of a simulated kickoff'),
      pills('simSpeed', 'Sim speed', [{ value: 1, label: '×1' }, { value: 2, label: '×2' }, { value: 4, label: '×4' }]),
      pills('inputMode', 'Kick input', [{ value: 'flick', label: 'FLICK' }, { value: 'meter', label: 'METERS' }], 'Flick: pull back and flick. Meters: keyboard power + accuracy'),
      pills('playClockMult', 'Play clock', [{ value: 1, label: '×1' }, { value: 2, label: '×2' }], 'Double the time to set up a kick'),
      toggle('leftFooted', 'Left-footed mirror', 'Mirror the kick scene for a left-footed feel')
    ] }));

    el.appendChild(C.card({ title: 'ACCESSIBILITY', body: [
      toggle('colorblind', 'Colour-blind palette', 'Okabe–Ito reds / greens / golds'),
      toggle('highContrast', 'High contrast', 'Black, white and yellow only'),
      toggle('reducedMotion', 'Reduced motion', 'No shake, instant flight, no vignette'),
      pills('fontScale', 'Font scale', [{ value: 1, label: '100%' }, { value: 1.25, label: '125%' }, { value: 1.5, label: '150%' }]),
      toggle('tooltips', 'Tooltips', 'Hover / long-press explanations on numbers'),
      toggle('haptics', 'Haptics', 'Vibrate on contact and doinks when the device supports it')
    ] }));

    el.appendChild(C.card({ title: 'KEYS', body: [
      keyRow('confirm', 'Kick / confirm'),
      keyRow('confirmAlt', 'Kick / confirm (alt)'),
      keyRow('left', 'Aim left'),
      keyRow('right', 'Aim right')
    ] }));

    el.appendChild(C.card({ title: 'DATA', body: [
      C.el('p', { class: 'small txt-grey', text: 'Settings live in ' + RTG.UI.Store.KEYS.settings + (RTG.UI.Storage.available ? '' : ' (storage unavailable: memory only)') + '. Saves are on the Saves screen.' })
    ], footer: [
      C.button({ label: 'SAVES', kind: 'secondary', icon: 'save', onClick: function () { Router.go('saves'); } }),
      C.button({ label: 'RESET SETTINGS', kind: 'danger', onClick: function () {
        C.confirm({ title: 'Reset settings?', text: 'Every setting goes back to its default. Saves are untouched.', okLabel: 'RESET', kind: 'danger' }).onOk(function () {
          store.resetSettings();
          Router.go('settings', {}, { replace: true });
          C.toast('Settings reset', 'good');
        });
      } })
    ] }));

    unsub = store.subscribe(function (info) { if (info.fnName === 'settings') sync(); });
    function sync() {
      var sws = el.querySelectorAll('.switch[data-setting]');
      for (var i = 0; i < sws.length; i++) sws[i].setAttribute('aria-checked', s()[sws[i].getAttribute('data-setting')] ? 'true' : 'false');
      var ps = el.querySelectorAll('.pill[data-setting]');
      for (var j = 0; j < ps.length; j++) { var on = String(s()[ps[j].getAttribute('data-setting')]) === ps[j].getAttribute('data-value'); ps[j].classList.toggle('active', on); ps[j].setAttribute('aria-checked', on ? 'true' : 'false'); }
    }

    return { el: el, destroy: function () { if (unsub) unsub(); unsub = null; } };
  }

  RTG.UI.Router.register('settings', factory);
})(typeof window !== 'undefined' ? window : globalThis);
