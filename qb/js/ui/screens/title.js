/**
 * Road to Glory: QB — 'title' screen (ROAD TO GLORY: QB — THE MOMENT).
 *
 * A canvas strip of the field seen from behind the quarterback at dusk (plain ctx rects, no dependency on
 * ui/sprites; stars twinkle via store.uiRng), the logo, then the demo's three picks — an archetype card ×4 with
 * the five attribute bars (the signature attribute is uncapped, the kicker's D24 rule), a TEAM preset
 * (BAD LINE / AVERAGE / GREAT LINE from Tuning.qb.demo.teams), a VENUE (HS / COLLEGE / NFL) — the seed (shown,
 * editable, RANDOM), START THE DRIVE and SETTINGS. ?seed= / ?arch= / ?team= / ?venue= in the URL preselect.
 *
 *   RTG.UI.Screens.title(store, params) → {el, destroy, onResize, onKey}
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Screens = RTG.UI.Screens = RTG.UI.Screens || {};

  var W = 192, H = 112, TOP = 32;   // TOP: the night-sky rows above the dusk bands, where the logo lives

  var ARCH_ORDER = ['GUNSLINGER', 'SURGEON', 'FIELD_GENERAL', 'DUAL_THREAT'];
  var ARCH_NAME = { GUNSLINGER: 'GUNSLINGER', SURGEON: 'SURGEON', FIELD_GENERAL: 'FIELD GENERAL', DUAL_THREAT: 'DUAL THREAT' };
  var ARCH_TEXT = {
    GUNSLINGER: 'A cannon and a short memory. The longest line on the field and the hottest bullet.',
    SURGEON: 'The ball goes where the line goes. Threads it past a linebacker\'s ear.',
    FIELD_GENERAL: 'Sees the disguise before the snap, and sees his line turn green, gold or red before he lets it go.',
    DUAL_THREAT: 'Draw a run and he is gone: rolls out, slips the rush, takes the sticks himself.'
  };
  var ATTR_TEXT = { ARM: 'Ball speed and how long a line you can throw', ACC: 'How close the ball stays to the line you draw', IQ: 'Reads the look, sees windows early; 70+ sees the pass preview', MOB: 'Run speed on a drawn run, sack escapes', POI: 'Pocket time: the rush takes longer to get home' };
  var ATTRS = ['ARM', 'ACC', 'IQ', 'MOB', 'POI'];
  var TEAM_ORDER = ['BAD', 'AVERAGE', 'GREAT'];
  var TEAM_LABEL = { BAD: 'BAD LINE', AVERAGE: 'AVERAGE', GREAT: 'GREAT LINE' };
  var TEAM_TEXT = { BAD: 'the pocket folds fast; make it quick', AVERAGE: 'a fair fight up front', GREAT: 'all day to throw; the receivers can run' };
  var VENUE_ORDER = ['HS', 'COLLEGE', 'NFL'];
  var VENUE_LABEL = { HS: 'HIGH SCHOOL', COLLEGE: 'COLLEGE', NFL: 'NFL' };

  /**
   * WAI-ARIA radiogroup keys: the arrows move the selection (and the focus) to the neighbour, wrapping; the group is
   * one Tab stop (tabindex 0 on the checked radio, −1 on the rest — the select functions keep that in step).
   */
  function roving(group, order, btns, attr, select) {
    var ids = order.filter(function (id) { return !!btns[id]; });
    group.addEventListener('keydown', function (ev) {
      var k = ev.key, dir = (k === 'ArrowRight' || k === 'ArrowDown') ? 1 : ((k === 'ArrowLeft' || k === 'ArrowUp') ? -1 : 0);
      if (!dir || ev.altKey || ev.ctrlKey || ev.metaKey) return;
      var t = ev.target, id = t && t.getAttribute ? t.getAttribute(attr) : null;
      var i = ids.indexOf(id);
      if (i < 0) return;
      ev.preventDefault();
      var next = ids[(i + dir + ids.length) % ids.length];
      select(next);
      try { btns[next].focus(); } catch (e) { /* ignore */ }
    });
  }

  function factory(store, params) {
    params = params || {};
    var C = RTG.UI.C, P = RTG.UI.Palette, app = RTG.UI.app;
    var T = RTG.Tuning.qb, ARCH = T.archetypes, TEAMS = T.demo.teams;
    var q = app && app.query ? app.query() : {};
    var el = C.el('div', { class: 'screen screen-full title-screen qb-title' });
    var raf = 0, destroyed = false, wobble = 0, wobbleTarget = 0, lastWobble = 0;
    var stars = [];
    for (var i = 0; i < 26; i++) stars.push({ x: store.uiRng.int(0, W - 1), y: store.uiRng.int(0, TOP + 20), p: store.uiRng.float(0, 6.28) });

    var form = {
      archetype: ARCH[params.archetype] ? params.archetype : (ARCH[String(q.arch || '').toUpperCase()] ? String(q.arch).toUpperCase() : 'GUNSLINGER'),
      team: TEAMS[params.team] ? params.team : (TEAMS[String(q.team || '').toUpperCase()] ? String(q.team).toUpperCase() : 'AVERAGE'),
      venue: VENUE_LABEL[params.venue] ? params.venue : (VENUE_LABEL[String(q.venue || '').toUpperCase()] ? String(q.venue).toUpperCase() : 'COLLEGE'),
      seed: params.seed !== undefined && params.seed !== null ? String(params.seed) : (q.seed !== undefined ? String(q.seed) : String(store.uiRng.int(1, 999999999)))
    };

    // ── the hero canvas: the field from behind the quarterback ──
    var canvas = C.el('canvas', { class: 'title-canvas', width: W, height: H, role: 'img', 'aria-label': 'The field at dusk, seen from behind the quarterback' });
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    function reduced() { return app && app.reducedMotion ? app.reducedMotion() : false; }

    function draw(now) {
      var pal = P.current();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = pal.night; ctx.fillRect(0, 0, W, TOP + 1);
      ctx.fillStyle = pal.chalk;
      for (var s = 0; s < stars.length; s++) { var st = stars[s]; if (Math.sin(now / 700 + st.p) > 0.1) ctx.fillRect(st.x, st.y, 1, 1); }
      ctx.translate(0, TOP);
      var bands = [pal.night, pal.navy, pal.dusk, pal.dusk2, pal.sunset];
      var bh = Math.ceil(40 / bands.length);
      for (var b = 0; b < bands.length; b++) { ctx.fillStyle = bands[b]; ctx.fillRect(0, b * bh, W, bh + 1); }
      // the sun sliver and the stands silhouette
      ctx.fillStyle = pal.gold; ctx.fillRect(28, 34, 14, 3); ctx.fillRect(30, 32, 10, 2);
      ctx.fillStyle = pal.night;
      for (var x = 0; x < W; x += 6) ctx.fillRect(x, 34 + ((x / 6) % 2), 5, 8);
      ctx.fillStyle = pal.navy2; ctx.fillRect(0, 41, W, 2);
      // the field in perspective: the horizon at row 43, the line of scrimmage near the bottom
      var yH = 43, yB = H - TOP, xC = W / 2;
      function half(y) { var p = (y - yH) / (yB - yH); return 22 + (xC + 8 - 22) * p; }
      ctx.fillStyle = pal.grass2; ctx.fillRect(0, yH, W, yB - yH);
      ctx.fillStyle = pal.grass;
      for (var y = yH; y < yB; y++) { var hw = half(y); ctx.fillRect(Math.round(xC - hw), y, Math.round(hw * 2), 1); }
      // stripes every other five yards (perspective-compressed rows)
      ctx.fillStyle = pal.grass2;
      var rows = [yH + 2, yH + 6, yH + 12, yH + 20, yH + 30];
      for (var r = 0; r + 1 < rows.length; r += 2) for (y = rows[r]; y < rows[r + 1]; y++) { hw = half(y); ctx.fillRect(Math.round(xC - hw) + 1, y, Math.round(hw * 2) - 2, 1); }
      // yard lines and the sidelines
      ctx.fillStyle = pal.chalk;
      var lines = [yH + 1, yH + 3, yH + 6, yH + 10, yH + 15, yH + 21, yH + 28, yH + 36];
      for (var l = 0; l < lines.length; l++) { y = lines[l]; if (y >= yB) continue; hw = half(y); ctx.fillRect(Math.round(xC - hw), y, Math.round(hw * 2), 1); }
      for (y = yH; y < yB; y++) { hw = half(y); ctx.fillRect(Math.round(xC - hw), y, 1, 1); ctx.fillRect(Math.round(xC + hw) - 1, y, 1, 1); }
      // the uprights at the far end
      ctx.fillRect(xC - 8, yH - 9, 1, 10); ctx.fillRect(xC + 7, yH - 9, 1, 10); ctx.fillRect(xC - 8, yH - 5, 16, 1); ctx.fillRect(xC, yH - 5, 1, 6);
      // the line: five blockers, four rushers over them
      ctx.fillStyle = pal.grey;
      for (var d = 0; d < 4; d++) { var dx = Math.round(xC - 16 + d * 10); ctx.fillRect(dx, yH + 22, 3, 3); ctx.fillRect(dx - 1, yH + 25, 5, 4); }
      ctx.fillStyle = pal.red;
      for (var o = 0; o < 5; o++) { var ox = Math.round(xC - 20 + o * 10); ctx.fillRect(ox, yH + 27, 4, 3); ctx.fillRect(ox - 1, yH + 30, 6, 5); }
      // two receivers wide
      ctx.fillRect(xC - 44, yH + 24, 3, 3); ctx.fillRect(xC - 45, yH + 27, 5, 6);
      ctx.fillRect(xC + 41, yH + 24, 3, 3); ctx.fillRect(xC + 40, yH + 27, 5, 6);
      // the quarterback from behind, the ball in his hand (the wobble is his feet)
      var qx = Math.round(xC - 4 + wobble), qy = yB - 22;
      ctx.fillStyle = pal.ink; ctx.fillRect(qx + 2, qy, 5, 4);
      ctx.fillStyle = pal.red; ctx.fillRect(qx, qy + 4, 9, 8);
      ctx.fillStyle = pal.chalk; ctx.fillRect(qx + 3, qy + 6, 3, 4);
      ctx.fillStyle = pal.ink; ctx.fillRect(qx, qy + 12, 3, 6); ctx.fillRect(qx + 6, qy + 12, 3, 6);
      ctx.fillStyle = pal.cream; ctx.fillRect(qx - 2, qy + 5, 2, 5); ctx.fillRect(qx + 9, qy + 3, 2, 5);
      ctx.fillStyle = pal.ball; ctx.fillRect(qx + 10, qy + 1, 4, 3); ctx.fillRect(qx + 11, qy, 2, 5);
      ctx.fillStyle = pal.chalk; ctx.fillRect(qx + 11, qy + 2, 2, 1);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    function frame(now) {
      raf = 0;
      if (destroyed) return;
      if (now - lastWobble > 320) { lastWobble = now; wobbleTarget = store.uiRng.gauss(0, 0.6); }
      wobble += (wobbleTarget - wobble) * 0.15;
      draw(now);
      if (!reduced()) raf = root.requestAnimationFrame(frame);
    }

    var hero = C.el('div', { class: 'title-hero' }, canvas,
      C.el('div', { class: 'title-logo', 'aria-label': 'Road to Glory: QB — The Moment' },
        C.el('span', { class: 'title-logo-1', text: 'ROAD TO GLORY' }),
        C.el('span', { class: 'title-logo-2', text: 'QB' }),
        C.el('span', { class: 'title-logo-3', text: 'THE MOMENT' })));
    el.appendChild(hero);

    var col = C.el('div', { class: 'title-col' });
    el.appendChild(col);

    col.appendChild(C.el('p', { class: 'title-blurb small', text: 'Read the look. Pick the play. Then draw it: a line from the QB to a receiver is the ball\'s path — fast for a bullet, slow for a lob over the linebacker — and a line into space is your run. The play slows down while your finger draws. Six snaps decide the night.' }));

    // ── archetypes ──
    var archGrid = C.el('div', { class: 'grid-2 arch-grid', role: 'radiogroup', 'aria-label': 'Archetype' });
    var archCards = {};
    ARCH_ORDER.forEach(function (id) {
      var a = ARCH[id];
      if (!a) return;
      var bars = C.el('div', { class: 'stack arch-bars' });
      ATTRS.forEach(function (k) {
        var bar = C.bar({ label: k, value: a[k] });
        C.tooltip(bar, ATTR_TEXT[k]);
        if (a.signature === k) bar.appendChild(C.chip('NO CAP', 'gold'));
        bars.appendChild(bar);
      });
      var card = C.el('button', { type: 'button', class: 'card card-selectable arch-card', role: 'radio', 'data-arch': id, 'aria-label': ARCH_NAME[id] + '. ' + (ARCH_TEXT[id] || ''), onClick: function () { selectArch(id); } },
        C.el('div', { class: 'card-title', text: ARCH_NAME[id] }),
        bars,
        C.el('p', { class: 'small txt-grey mt-1 arch-text', text: ARCH_TEXT[id] || '' }));
      archCards[id] = card;
      archGrid.appendChild(card);
    });
    function selectArch(id) {
      form.archetype = id;
      for (var k in archCards) { archCards[k].classList.toggle('card-selected', k === id); archCards[k].setAttribute('aria-checked', k === id ? 'true' : 'false'); archCards[k].setAttribute('tabindex', k === id ? '0' : '-1'); }
    }
    selectArch(form.archetype);
    roving(archGrid, ARCH_ORDER, archCards, 'data-arch', selectArch);
    col.appendChild(C.el('div', { class: 'field' }, C.el('span', { class: 'field-label', text: 'ARCHETYPE' }), archGrid));

    // ── team ──
    var teamRow = C.el('div', { class: 'pills', role: 'radiogroup', 'aria-label': 'Team' });
    var teamDesc = C.el('p', { class: 'small txt-grey mt-1 pick-desc' });
    var teamBtns = {};
    function teamText(id) {
      var t = TEAMS[id];
      var wr = t.wr.reduce(function (s, r) { return s + r.skill; }, 0) / t.wr.length;
      return 'OL ' + t.ol + ' · WR ' + Math.round(wr) + ' vs DL ' + t.dl + ' · DB ' + t.db + ' — ' + (TEAM_TEXT[id] || '');
    }
    function setTeam(id) {
      form.team = id;
      for (var k in teamBtns) { teamBtns[k].classList.toggle('active', k === id); teamBtns[k].setAttribute('aria-checked', k === id ? 'true' : 'false'); teamBtns[k].setAttribute('tabindex', k === id ? '0' : '-1'); }
      teamDesc.textContent = teamText(id);
    }
    TEAM_ORDER.forEach(function (id) {
      if (!TEAMS[id]) return;
      teamBtns[id] = C.el('button', { type: 'button', class: 'btn btn-ghost pill', role: 'radio', 'data-team': id, text: TEAM_LABEL[id] || id, onClick: function () { setTeam(id); } });
      teamRow.appendChild(teamBtns[id]);
    });
    setTeam(form.team);
    roving(teamRow, TEAM_ORDER, teamBtns, 'data-team', setTeam);
    col.appendChild(C.el('div', { class: 'field' }, C.el('span', { class: 'field-label', text: 'TEAM' }), teamRow, teamDesc));

    // ── venue ──
    var venueRow = C.el('div', { class: 'pills', role: 'radiogroup', 'aria-label': 'Venue' });
    var venueBtns = {};
    function setVenue(id) {
      form.venue = id;
      for (var k in venueBtns) { venueBtns[k].classList.toggle('active', k === id); venueBtns[k].setAttribute('aria-checked', k === id ? 'true' : 'false'); venueBtns[k].setAttribute('tabindex', k === id ? '0' : '-1'); }
    }
    VENUE_ORDER.forEach(function (id) {
      venueBtns[id] = C.el('button', { type: 'button', class: 'btn btn-ghost pill', role: 'radio', 'data-venue': id, text: VENUE_LABEL[id], onClick: function () { setVenue(id); } });
      venueRow.appendChild(venueBtns[id]);
    });
    setVenue(form.venue);
    roving(venueRow, VENUE_ORDER, venueBtns, 'data-venue', setVenue);
    col.appendChild(C.el('div', { class: 'field' }, C.el('span', { class: 'field-label', text: 'VENUE' }), venueRow));

    // ── seed ──
    var seedInput = C.el('input', { type: 'text', class: 'input', id: 'qb-seed', autocomplete: 'off', spellcheck: 'false', value: form.seed, 'aria-label': 'Seed', onInput: function () { form.seed = seedInput.value.trim(); syncSeed(); } });
    var randomBtn = C.button({ label: 'RANDOM', kind: 'secondary', icon: 'dice', onClick: function () { form.seed = String(store.uiRng.int(1, 999999999)); seedInput.value = form.seed; syncSeed(); } });
    var seedLine = C.el('span', { class: 'num title-seed', 'data-seed': form.seed, text: 'seed ' + form.seed });
    function syncSeed() { seedLine.textContent = form.seed ? 'seed ' + form.seed : 'seed: random'; seedLine.setAttribute('data-seed', form.seed); }
    col.appendChild(C.el('div', { class: 'field' }, C.el('label', { class: 'field-label', 'for': 'qb-seed', text: 'SEED (numbers or words — same seed, same drive)' }), C.el('div', { class: 'input-row' }, seedInput, randomBtn)));

    // ── start / settings ──
    var startBtn = C.button({ label: 'START THE DRIVE', kind: 'primary', block: true, icon: 'ball', action: 'start', onClick: start });
    var settingsBtn = C.button({ label: 'SETTINGS', kind: 'ghost', block: true, icon: 'gear', action: 'settings', onClick: function () { app.openSettings(); } });
    col.appendChild(C.el('div', { class: 'title-menu qb-menu' }, startBtn, settingsBtn));

    var foot = C.el('div', { class: 'title-foot small txt-grey' },
      C.el('span', { text: 'v' + RTG.VERSION + ' · the moment demo' }),
      seedLine);
    el.appendChild(foot);

    function start() {
      startBtn.disabled = true;
      try {
        app.startDrive({ seed: form.seed, archetype: form.archetype, team: form.team, venue: form.venue });
        C.announce('The drive starts. ' + ARCH_NAME[form.archetype] + ', ' + TEAM_LABEL[form.team] + ', ' + VENUE_LABEL[form.venue] + '.');
      } catch (e) {
        startBtn.disabled = false;
        C.toast('Could not start: ' + (e.message || e), 'bad', 5000);
        if (root.console) root.console.error(e);
      }
    }

    draw(0);
    raf = root.requestAnimationFrame(frame);

    return {
      el: el,
      form: function () { return form; },
      destroy: function () { destroyed = true; if (raf) { root.cancelAnimationFrame(raf); raf = 0; } },
      onResize: function () { draw(0); },
      keysInFields: true,
      onKey: function (ev) {
        if (ev.key !== 'Enter' || ev.repeat) return false;
        var t = ev.target;
        if (t === seedInput || t === root.document.body) { start(); return true; }
        return false;
      }
    };
  }

  Screens.title = factory;
})(typeof window !== 'undefined' ? window : globalThis);
