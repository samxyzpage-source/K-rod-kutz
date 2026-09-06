/**
 * Road to Glory: Kicker — 'newcareer' screen (SPEC §4.5).
 *
 * Name + dice (Names.player with store.uiRng), 4 archetype cards with attribute previews from
 * Tuning.progression.archetypes, look swatches (skin / hair / boot) with a pixel avatar preview, foot, hometown
 * dropdown (Data.names.hometowns), difficulty pills with descriptions from Tuning.difficulty, seed field + RANDOM.
 * START → store.newCareer(opts) → the store routes to the showcase.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};

  var ARCH_TEXT = {
    CANNON: 'Big leg, wild aim. Range from day one.',
    SURGEON: 'Accurate and consistent. Short on power.',
    ICEMAN: 'Unbothered under pressure. Average tools.',
    SOCCER: 'Kickoff specialist with a live leg. Raw technique.'
  };
  var DIFF_TEXT = { rookie: 'Forgiving. Full previews.', pro: 'The intended game.', allpro: 'Sharper misses, meaner GMs.', legend: 'No green zone. Gusts. Good luck.' };

  function factory(store) {
    var C = RTG.UI.C, Router = RTG.UI.Router;
    var T = RTG.Tuning, ARCH = T.progression.archetypes, DIFF = T.difficulty;
    var hometowns = (RTG.Data.names && RTG.Data.names.hometowns) || [];
    var rng = store.uiRng;

    var form = {
      name: RTG.Names.player(rng).full,
      archetype: 'SURGEON',
      look: { skin: rng.int(0, 3), hair: rng.int(0, 5), boot: rng.int(0, 3) },
      foot: 'R',
      hometownIdx: hometowns.length ? rng.int(0, hometowns.length - 1) : -1,
      difficulty: 'pro',
      seed: ''
    };

    var el = C.screen({ title: 'NEW CAREER', back: function () { Router.go('title'); } });
    el.classList.add('newcareer-screen');

    // ── name
    var nameInput = C.el('input', { type: 'text', class: 'input', id: 'nc-name', maxlength: 28, autocomplete: 'off', spellcheck: 'false', value: form.name, 'aria-label': 'Player name', onInput: function () { form.name = nameInput.value; } });
    var dice = C.button({ kind: 'secondary', icon: 'dice', label: 'DICE', ariaLabel: 'Random name', onClick: function () { form.name = RTG.Names.player(rng).full; nameInput.value = form.name; } });
    el.appendChild(C.el('div', { class: 'field' }, C.el('label', { class: 'field-label', 'for': 'nc-name', text: 'NAME' }), C.el('div', { class: 'input-row' }, nameInput, dice)));

    // ── archetypes
    var archGrid = C.el('div', { class: 'grid-2 arch-grid', role: 'radiogroup', 'aria-label': 'Archetype' });
    var archCards = {};
    Object.keys(ARCH).forEach(function (id) {
      var bars = C.el('div', { class: 'stack', style: 'gap:2px' });
      RTG.Schema.ATTRS.forEach(function (a) { bars.appendChild(C.bar({ label: a, value: ARCH[id][a][0], noValue: true })); });
      var card = C.el('button', { type: 'button', class: 'card card-selectable arch-card', role: 'radio', 'data-arch': id, onClick: function () { selectArch(id); } },
        C.el('div', { class: 'card-title', text: id === 'SOCCER' ? 'SOCCER CONVERT' : id }),
        bars,
        C.el('p', { class: 'small txt-grey mt-1', text: ARCH_TEXT[id] || '' }));
      archCards[id] = card;
      archGrid.appendChild(card);
    });
    function selectArch(id) {
      form.archetype = id;
      for (var k in archCards) { archCards[k].classList.toggle('card-selected', k === id); archCards[k].setAttribute('aria-checked', k === id ? 'true' : 'false'); }
    }
    selectArch(form.archetype);
    el.appendChild(C.el('div', { class: 'field' }, C.el('span', { class: 'field-label', text: 'ARCHETYPE' }), archGrid));

    // ── look
    var avatarHost = C.el('div', { class: 'look-preview' });
    function renderAvatar() { C.replace(avatarHost, C.pixelAvatar(form.look, 64)); }
    function swatchRow(key, colours, label) {
      var row = C.el('div', { class: 'swatches', role: 'radiogroup', 'aria-label': label });
      var btns = [];
      colours.forEach(function (col, i) {
        var b = C.el('button', { type: 'button', class: 'swatch', role: 'radio', style: { background: col }, 'aria-label': label + ' ' + (i + 1), onClick: function () {
          form.look[key] = i; btns.forEach(function (x, j) { x.classList.toggle('active', j === i); x.setAttribute('aria-checked', j === i ? 'true' : 'false'); }); renderAvatar();
        } });
        if (form.look[key] === i) { b.classList.add('active'); b.setAttribute('aria-checked', 'true'); }
        btns.push(b); row.appendChild(b);
      });
      return C.el('div', { class: 'field' }, C.el('span', { class: 'field-label', text: label }), row);
    }
    var footBtns = {};
    function setFoot(f) { form.foot = f; footBtns.R.classList.toggle('active', f === 'R'); footBtns.L.classList.toggle('active', f === 'L'); footBtns.R.setAttribute('aria-pressed', f === 'R'); footBtns.L.setAttribute('aria-pressed', f === 'L'); }
    footBtns.R = C.button({ label: 'RIGHT', kind: 'ghost', class: 'pill', onClick: function () { setFoot('R'); } });
    footBtns.L = C.button({ label: 'LEFT', kind: 'ghost', class: 'pill', onClick: function () { setFoot('L'); } });
    setFoot('R');
    renderAvatar();
    el.appendChild(C.card({ title: 'LOOK', body: C.el('div', { class: 'row row-wrap gap-2', style: 'align-items:flex-start' }, avatarHost, C.el('div', { class: 'grow' },
      swatchRow('skin', C.LOOK.skins, 'SKIN'), swatchRow('hair', C.LOOK.hairs, 'HAIR'), swatchRow('boot', C.LOOK.boots, 'BOOTS'),
      C.el('div', { class: 'field' }, C.el('span', { class: 'field-label', text: 'KICKING FOOT' }), C.el('div', { class: 'pills' }, footBtns.R, footBtns.L)))) }));

    // ── hometown
    var select = C.el('select', { id: 'nc-home', 'aria-label': 'Hometown', onChange: function () { form.hometownIdx = parseInt(select.value, 10); } });
    hometowns.forEach(function (h, i) { select.appendChild(C.el('option', { value: String(i), text: h.city + ', ' + h.state, selected: i === form.hometownIdx })); });
    el.appendChild(C.el('div', { class: 'field' }, C.el('label', { class: 'field-label', 'for': 'nc-home', text: 'HOMETOWN' }), select));

    // ── difficulty
    var diffRow = C.el('div', { class: 'pills', role: 'radiogroup', 'aria-label': 'Difficulty' });
    var diffDesc = C.el('p', { class: 'small txt-grey mt-1' });
    var diffBtns = {};
    function diffText(d) {
      var r = DIFF[d];
      return (DIFF_TEXT[d] || '') + ' σ ×' + r.sigmaMult + ' · ice ' + Math.round(r.iceProb * 100) + '% · XP ×' + r.xpMult + ' · clock ' + r.playClockSec + 's · wind cap ' + r.windCap + ' · career injury ' + r.careerInjury;
    }
    function setDiff(d) {
      form.difficulty = d;
      for (var k in diffBtns) { diffBtns[k].classList.toggle('active', k === d); diffBtns[k].setAttribute('aria-checked', k === d ? 'true' : 'false'); }
      diffDesc.textContent = diffText(d);
    }
    ['rookie', 'pro', 'allpro', 'legend'].forEach(function (d) {
      diffBtns[d] = C.el('button', { type: 'button', class: 'btn btn-ghost pill', role: 'radio', 'data-diff': d, text: d === 'allpro' ? 'ALL-PRO' : d.toUpperCase(), onClick: function () { setDiff(d); } });
      diffRow.appendChild(diffBtns[d]);
    });
    setDiff('pro');
    el.appendChild(C.el('div', { class: 'field' }, C.el('span', { class: 'field-label', text: 'DIFFICULTY' }), diffRow, diffDesc));

    // ── seed
    var seedInput = C.el('input', { type: 'text', class: 'input', id: 'nc-seed', inputmode: 'numeric', autocomplete: 'off', placeholder: 'random', 'aria-label': 'Seed', onInput: function () { form.seed = seedInput.value.trim(); } });
    var randomBtn = C.button({ label: 'RANDOM', kind: 'secondary', onClick: function () { form.seed = String(rng.int(1, 999999999)); seedInput.value = form.seed; } });
    el.appendChild(C.el('div', { class: 'field' }, C.el('label', { class: 'field-label', 'for': 'nc-seed', text: 'SEED (numbers or words — same seed, same career)' }), C.el('div', { class: 'input-row' }, seedInput, randomBtn)));

    // ── start
    var startBtn = C.button({ label: 'START CAREER', kind: 'primary', block: true, icon: 'boot', onClick: start });
    el.appendChild(C.el('div', { class: 'mt-2' }, startBtn));

    function start() {
      var name = (form.name || '').trim() || RTG.Names.player(rng).full;
      var opts = {
        name: name, archetype: form.archetype, look: { skin: form.look.skin, hair: form.look.hair, boot: form.look.boot }, foot: form.foot,
        hometown: form.hometownIdx >= 0 ? hometowns[form.hometownIdx] : undefined,
        difficulty: form.difficulty
      };
      if (form.seed) opts.seed = form.seed;
      startBtn.disabled = true;
      try {
        store.newCareer(opts);
        C.announce('Career started. Welcome to the showcase, ' + name + '.');
      } catch (e) {
        startBtn.disabled = false;
        C.toast('Could not start: ' + (e.message || e), 'bad', 5000);
        if (root.console) root.console.error(e);
      }
    }

    return {
      el: el,
      destroy: function () {},
      onKey: function (ev) { if (ev.key === 'Enter' && ev.target === nameInput) { start(); return true; } return false; }
    };
  }

  RTG.UI.Router.register('newcareer', factory);
})(typeof window !== 'undefined' ? window : globalThis);
