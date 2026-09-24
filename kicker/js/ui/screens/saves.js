/**
 * Road to Glory: Kicker — 'saves' screen (SPEC §3.7 / §4.5).
 *
 * 3 manual slots + the autosave, each summarised by Save.slotSummary; SAVE / LOAD / DELETE with confirm modals;
 * EXPORT (base64 via Save.exportString into a textarea + COPY) and IMPORT (paste → Save.importString →
 * Save.deserialize through store.loadBlob → replace). Rejections (checksum, newer version, invalid) show a toast
 * and an inline message.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};

  var SLOTS = [{ id: '1', label: 'SLOT 1' }, { id: '2', label: 'SLOT 2' }, { id: '3', label: 'SLOT 3' }, { id: 'auto', label: 'AUTOSAVE' }];

  function factory(store) {
    var C = RTG.UI.C, Router = RTG.UI.Router;
    var el = C.screen({ title: 'SAVES', back: function () { if (store.state) Router.back(); else Router.go('title'); } });
    el.classList.add('saves-screen');
    var slotsHost = C.el('div', { class: 'stack-2' });
    var msg = C.el('p', { class: 'save-msg small', role: 'status' });
    var unsub = null;

    function say(text, kind) { msg.textContent = text; msg.className = 'save-msg small ' + (kind === 'bad' ? 'txt-red' : kind === 'good' ? 'txt-mint' : 'txt-grey'); C.toast(text, kind, 3500); }

    function slotCard(slot) {
      var sum = store.slotSummary(slot.id);
      var body = [];
      if (sum) {
        body.push(C.el('div', { class: 'row' }, C.el('strong', { class: 'txt-gold', text: sum.name || 'Unnamed' }), C.chip(sum.difficulty.toUpperCase(), 'grey')));
        body.push(C.kv([
          ['TEAM', sum.team || 'none'],
          ['YEAR', 'Y' + sum.year + ' (' + sum.calendarYear + ') · ' + sum.stage + '.' + sum.phase],
          ['OVR / AGE', sum.ovr + ' / ' + sum.age],
          ['SAVED', C.fmt.date(sum.savedAt) + ' · ' + C.fmt.ago(sum.savedAt)],
          ['SEED', C.el('span', { class: 'num', text: String(sum.seed) })]
        ]));
      } else body.push(C.el('p', { class: 'txt-grey', text: 'Empty slot.' }));
      var buttons = [];
      if (slot.id !== 'auto') {
        buttons.push(C.button({ label: 'SAVE', kind: 'primary', small: true, icon: 'save', disabled: !store.state, 'data-slot': slot.id, action: 'save-' + slot.id, onClick: function () {
          function doSave() {
            var r = store.save(slot.id);
            if (r.ok) { say('Saved to ' + slot.label + ' (' + Math.round(r.bytes / 1024) + ' KB' + (r.persisted ? '' : ', memory only') + ')', 'good'); render(); }
            else say(r.error, 'bad');
          }
          if (sum) C.confirm({ title: 'Overwrite ' + slot.label + '?', text: sum.name + ' · Y' + sum.year + ' will be replaced.', okLabel: 'OVERWRITE', kind: 'danger' }).onOk(doSave);
          else doSave();
        } }));
      }
      buttons.push(C.button({ label: 'LOAD', kind: 'secondary', small: true, disabled: !sum, action: 'load-' + slot.id, onClick: function () {
        function doLoad() {
          var r = store.load(slot.id);
          if (r.ok) { say('Loaded ' + (r.summary ? r.summary.name : slot.label) + (r.migrated ? ' (migrated)' : ''), 'good'); }
          else say(r.error, 'bad');
        }
        if (store.state) C.confirm({ title: 'Load ' + slot.label + '?', text: 'The current career is autosaved first.', okLabel: 'LOAD' }).onOk(function () { store.autosave(); doLoad(); });
        else doLoad();
      } }));
      buttons.push(C.button({ label: 'DELETE', kind: 'danger', small: true, icon: 'trash', disabled: !sum, action: 'delete-' + slot.id, onClick: function () {
        C.confirm({ title: 'Delete ' + slot.label + '?', text: 'This cannot be undone.', okLabel: 'DELETE', kind: 'danger' }).onOk(function () { store.deleteSlot(slot.id); say(slot.label + ' deleted', 'info'); render(); });
      } }));
      return C.card({ title: slot.label, kind: sum ? 'gold' : 'flat', class: 'slot-card', body: body, footer: buttons });
    }

    function render() {
      C.clear(slotsHost);
      SLOTS.forEach(function (s) { slotsHost.appendChild(slotCard(s)); });
    }
    render();
    el.appendChild(slotsHost);
    el.appendChild(msg);

    // ── export / import
    var exportArea = C.el('textarea', { class: 'input export-area', readOnly: true, 'aria-label': 'Export string', placeholder: 'Press EXPORT to fill this box with your save as text.' });
    var copyBtn = C.button({ label: 'COPY', kind: 'secondary', small: true, onClick: function () {
      exportArea.focus(); exportArea.select();
      var done = false;
      try { if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) { root.navigator.clipboard.writeText(exportArea.value); done = true; } } catch (e) { /* fall through */ }
      if (!done) { try { done = root.document.execCommand('copy'); } catch (e) { done = false; } }
      say(done ? 'Copied to the clipboard' : 'Select the text and copy it manually', done ? 'good' : 'info');
    } });
    el.appendChild(C.card({ title: 'EXPORT', body: [C.el('p', { class: 'small txt-grey', text: 'Turn the current career into text you can paste anywhere (file:// cannot download files).' }), exportArea], footer: [
      C.button({ label: 'EXPORT', kind: 'primary', small: true, disabled: !store.state, action: 'export', onClick: function () {
        try { exportArea.value = RTG.Save.exportString(store.blob()); say('Export ready (' + Math.round(exportArea.value.length / 1024) + ' KB)', 'good'); }
        catch (e) { say('Export failed: ' + (e.message || e), 'bad'); }
      } }), copyBtn] }));

    var importArea = C.el('textarea', { class: 'input import-area', 'aria-label': 'Import string', placeholder: 'Paste an exported save here.' });
    el.appendChild(C.card({ title: 'IMPORT', body: [importArea], footer: [
      C.button({ label: 'IMPORT', kind: 'primary', small: true, action: 'import', onClick: function () {
        var txt = importArea.value.trim();
        if (!txt) { say('Paste a save string first', 'bad'); return; }
        var blob = RTG.Save.importString(txt);
        if (!blob || blob.error) { say('Import rejected: not a save string', 'bad'); return; }
        function doImport() {
          var r = store.loadBlob(blob);
          if (r.ok) say('Imported ' + (r.summary ? r.summary.name : 'career') + (r.migrated ? ' (migrated)' : ''), 'good');
          else say(r.error, 'bad');
        }
        if (store.state) C.confirm({ title: 'Import this save?', text: 'The current career is autosaved first.', okLabel: 'IMPORT' }).onOk(function () { store.autosave(); doImport(); });
        else doImport();
      } })] }));

    unsub = store.subscribe(function (info) { if (info.fnName === 'replace') render(); });

    return { el: el, destroy: function () { if (unsub) unsub(); unsub = null; } };
  }

  RTG.UI.Router.register('saves', factory);
})(typeof window !== 'undefined' ? window : globalThis);
