/**
 * Road to Glory: Kicker — screen 'training' (SPEC §4.5 training row, §2.1.2, §4.8 undo).
 *
 * Six focus tiles (POW / ACC / CON / CLU / KO / REST) with the projected XP (RTG.Player.trainingXp) and the 25 %
 * focus-discount tag → dispatch('train', focus); attribute panel: 5 rows with bars, the POT hint by agent tier
 * (tier 0 none · tier 1 a ±5 band · tier 2 the exact cap), the cost from RTG.Player.costToRaise(attr, value, age,
 * focus), "+" → dispatch('spendXp', attr), AUTO → dispatch('autoSpend'), the XP balance, traits with descriptions,
 * active modifiers, PRACTICE → Router.go('practice') when registered.
 *
 * UNDO: before every spend the serialized state (RTG.Save.serialize) is pushed on an undo stack; UNDO pops it,
 * restores through store.replace(Save.deserialize(blob)) and re-mounts this screen with the remaining stack in the
 * route params (store.replace forces a Router.sync, so the screen is re-entered explicitly). Leaving the screen any
 * other way drops the stack — undo is only available until you leave the Training screen (§4.8).
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Screens = RTG.UI.Screens = RTG.UI.Screens || {};

  function C() { return RTG.UI.C; }
  function K() { return RTG.UI.Kit; }

  var ATTR_INFO = {
    POW: { name: 'POWER', text: 'Range (maxFG), carry, kickoff distance, overswing tolerance' },
    ACC: { name: 'ACCURACY', text: 'Base angular error (70 % weight) and wind compensation' },
    CON: { name: 'CONSISTENCY', text: 'Base error (30 %), shank tail, block get-off, weekly form swings' },
    CLU: { name: 'COMPOSURE', text: 'Pressure multiplier, aim sway, ice immunity at 90+, hesitation penalty' },
    KO: { name: 'KICKOFF', text: 'Touchback zone, hang time, opponent field position' }
  };
  var TRAITS = {
    BIG_LEG: 'Big Leg — maxFG +2, error ×1.04',
    ICE_VEINS: 'Ice Veins — pressure multiplier ×0.85',
    COLD_WEATHER: 'Cold Weather — cold / snow penalties halved',
    DOME_BABY: 'Dome Baby — error ×0.97 indoors, maxFG −1 outdoors',
    LATE_BLOOMER: 'Late Bloomer — growth window shifts +2 years',
    LEGS_OF_STEEL: 'Legs of Steel — decline starts 2 years later',
    DOINK_KING: 'Doink King — doink headlines, fans +2 per doink-in'
  };
  var FOCI = [
    { id: 'POW', text: 'Power' }, { id: 'ACC', text: 'Accuracy' }, { id: 'CON', text: 'Consistency' },
    { id: 'CLU', text: 'Composure' }, { id: 'KO', text: 'Kickoff' }, { id: 'REST', text: 'Rest' }
  ];

  function factory(store, params) {
    var c = C(), Kit = K(), R = RTG.UI.Router;
    var el = c.el('div', { class: 'screen scr-training' });
    var unsub = null, destroyed = false;
    var undoStack = params && Array.isArray(params.undoStack) ? params.undoStack : [];
    var MAX_UNDO = 20;

    function snapshot() {
      try { return RTG.Save.serialize(store.state, store.rng, Date.now()); } catch (e) { if (root.console) root.console.error(e); return null; }
    }
    function pushUndo() {
      var b = snapshot();
      if (!b) return;
      undoStack.push(b);
      if (undoStack.length > MAX_UNDO) undoStack.shift();
    }
    function undo() {
      var blob = undoStack.pop();
      if (!blob) { c.toast('Nothing to undo', 'info'); return; }
      var r = RTG.Save.deserialize(blob);
      if (!r || r.error) { c.toast('Undo failed: ' + (r && r.error), 'bad'); return; }
      var stack = undoStack.slice();
      store.replace(r.state, RTG.RNG.create(r.rngState >>> 0));   // forces Router.sync → re-enter training with the stack
      if (R.current() !== 'training') R.go('training', { undoStack: stack }, { replace: true });
      c.toast('Undid the last spend', 'info');
      c.announce('Last XP spend undone. XP ' + store.state.player.xp);
    }

    function inSeason(state) { return (state.phase === 'REG' || state.phase === 'POST') && (state.stage === 'COLLEGE' || state.stage === 'NFL'); }
    function focusNow(state) { return state.season && inSeason(state) && state.season.trainingDone ? state.season.focus : null; }

    function focusTiles(state) {
      var season = state.season, p = state.player;
      var canTrain = inSeason(state) && season && !season.trainingDone && !state.pending && !(p.flags && p.flags.skipTraining);
      var xp = RTG.Player && RTG.Player.trainingXp ? RTG.Player.trainingXp(state) : 0;
      var grid = c.el('div', { class: 'grid-3 focus-grid', role: 'group', 'aria-label': 'Weekly training focus' });
      FOCI.forEach(function (f) {
        var done = season && season.trainingDone && season.focus === f.id;
        var tile = c.el('button', { type: 'button', class: 'focus-tile' + (done ? ' active' : ''), 'data-focus': f.id, disabled: !canTrain, 'aria-pressed': done ? 'true' : 'false', onClick: Kit.safe(function () {
          var r = store.dispatch('train', f.id);
          if (r) {
            c.toast(f.id === 'REST' ? 'Rested: morale +' + r.moraleDelta + ', injury risk halved' : 'Trained ' + f.id + ': +' + r.xp + ' XP' + (r.moraleDelta ? ' · morale ' + c.fmt.signed(r.moraleDelta) : ''), 'good');
            c.announce('Training focus ' + f.text + '. ' + (f.id === 'REST' ? 'Rested.' : '+' + r.xp + ' XP.'));
          }
          render();
        }) });
        tile.appendChild(c.el('span', { class: 'focus-id', text: f.id }));
        tile.appendChild(c.el('span', { class: 'focus-name small', text: f.text }));
        if (f.id === 'REST') {
          tile.appendChild(c.el('span', { class: 'focus-xp num', text: '0 XP' }));
          tile.appendChild(c.el('span', { class: 'focus-tag chip chip-mint', text: 'MORALE +8' }));
        } else {
          tile.appendChild(c.el('span', { class: 'focus-xp num', text: '+' + xp + ' XP' }));
          tile.appendChild(c.el('span', { class: 'focus-tag chip chip-gold', text: '−25 % COST' }));
          if (f.id === 'ACC' || f.id === 'CON') tile.appendChild(c.el('span', { class: 'focus-tag2 small txt-mint', text: 'trust +2' }));
        }
        Kit.tip(tile, f.id === 'REST' ? 'No XP; morale +8; injury chance halved next game' : 'Earn ' + xp + ' XP (20 × morale × coach × difficulty) and pay 25 % less to raise ' + f.id + ' this week' + ((f.id === 'ACC' || f.id === 'CON') ? '; coach trust +2' : ''));
        grid.appendChild(tile);
      });
      var note = !inSeason(state) ? 'Weekly training happens in season.' : (state.pending ? 'Resolve the pending event first.' : (season && season.trainingDone ? 'Training done for week ' + state.week + ' — focus ' + season.focus + '.' : (p.flags && p.flags.skipTraining ? 'No training this week (family matters).' : 'Pick one focus per week.')));
      return c.card({ title: 'TRAINING FOCUS · WEEK ' + state.week, icon: 'train', body: [c.el('p', { class: 'small txt-grey mb-1', text: note }), grid] });
    }

    function potHint(p, a) {
      var tier = p.agentTier | 0, pot = p.pot ? p.pot[a] : null;
      if (typeof pot !== 'number') return { pot: undefined, text: '' };
      if (tier >= 2) return { pot: pot, text: 'cap ' + pot };
      if (tier === 1) { var band = RTG.Tuning && RTG.Tuning.contracts && RTG.Tuning.contracts.agent ? RTG.Tuning.contracts.agent.potBandTier1 : 5; return { pot: pot, band: band, text: 'cap ' + Math.max(p.attrs[a], pot - band) + '–' + Math.min(99, pot + band) }; }
      return { pot: undefined, text: '' };
    }

    function attrPanel(state) {
      var p = state.player, focus = focusNow(state);
      var rows = c.el('div', { class: 'stack attr-rows' });
      RTG.Schema.ATTRS.forEach(function (a) {
        var v = p.attrs[a], cost = RTG.Player.costToRaise(a, v, p.age, focus);
        var hint = potHint(p, a);
        var capped = hint.pot !== undefined ? v >= hint.pot : false;
        var maxed = v >= 99;
        var canBuy = !maxed && !capped && p.xp >= cost;
        var bar = c.bar({ label: a, value: v, pot: p.agentTier >= 2 ? hint.pot : undefined, kind: focus === a ? 'sky' : '' });
        if (p.agentTier === 1 && hint.pot !== undefined) {
          var track = bar.querySelector('.bar-track');
          if (track) track.appendChild(c.el('span', { class: 'bar-band', style: { left: (Math.max(0, hint.pot - hint.band) / 99 * 100).toFixed(1) + '%', width: (Math.min(99, hint.pot + hint.band) - Math.max(0, hint.pot - hint.band)) / 99 * 100 + '%' } }));
        }
        Kit.tip(bar, ATTR_INFO[a].name + ': ' + ATTR_INFO[a].text + (hint.text ? ' · ' + hint.text : ''));
        var costChip = Kit.tip(c.chip(maxed ? 'MAX' : (capped ? 'CAP' : cost + ' XP'), maxed || capped ? 'grey' : (focus === a ? 'sky' : 'dark')), maxed ? 'At 99' : capped ? 'At the potential cap' : 'Cost to raise ' + a + ' from ' + v + ' to ' + (v + 1) + (focus === a ? ' (25 % focus discount)' : '') + ' · age multiplier ×' + (RTG.Player.ageMult ? RTG.Player.ageMult(p.age) : 1));
        var plus = c.button({ label: '+', kind: canBuy ? 'primary' : 'ghost', small: true, class: 'attr-plus', ariaLabel: 'Raise ' + a + ' for ' + cost + ' XP', action: 'spend-' + a, disabled: !canBuy, onClick: Kit.safe(function () {
          pushUndo();
          var r = store.dispatch('spendXp', a);
          if (!r || !r.ok) { undoStack.pop(); c.toast(r && r.reason === 'NO_XP' ? 'Not enough XP' : r && r.reason === 'POT_CAP' ? a + ' is at its potential cap' : 'Cannot raise ' + a, 'bad'); }
          else c.announce(a + ' ' + r.newValue + '. XP ' + store.state.player.xp + '.');
          render();
        }) });
        var row = c.el('div', { class: 'row attr-row' }, c.el('div', { class: 'grow' }, bar, hint.text && p.agentTier === 1 ? c.el('span', { class: 'small txt-grey attr-hint', text: hint.text }) : null), costChip, plus);
        rows.appendChild(row);
      });
      var tier = p.agentTier | 0;
      var agentNote = tier === 0 ? 'Potential caps are hidden — an agent (fame 250+) reveals them.' : (tier === 1 ? 'Your agent estimates each cap within ±5.' : 'Your agent knows the exact caps (ticks on the bars).');
      var head = c.el('div', { class: 'row row-between row-wrap attr-head' },
        c.el('span', { class: 'row' }, c.icon('bolt', 14), c.el('span', { class: 'big txt-gold num xp-balance', 'data-xp': String(p.xp), text: p.xp + ' XP' })),
        c.el('span', { class: 'row' }, Kit.tip(c.chip('OVR ' + Kit.ovr(p), 'gold'), 'Overall rating'), Kit.tip(c.chip('AGE ' + p.age, 'grey'), 'XP cost multiplier ×' + (RTG.Player.ageMult ? RTG.Player.ageMult(p.age) : 1) + ' at this age')));
      var footer = [
        c.button({ label: 'AUTO', kind: 'secondary', icon: 'dice', action: 'auto', disabled: p.xp <= 0, onClick: Kit.safe(function () {
          pushUndo();
          var n = store.dispatch('autoSpend');
          if (!n) undoStack.pop();
          c.toast(n ? 'Bought ' + n + ' point' + (n === 1 ? '' : 's') : 'Nothing affordable', n ? 'good' : 'info');
          c.announce(n ? 'Auto spend bought ' + n + ' points.' : 'Nothing affordable.');
          render();
        }) }),
        c.button({ label: 'UNDO', kind: 'ghost', icon: 'arrow-l', action: 'undo', disabled: !undoStack.length, onClick: Kit.safe(undo) })
      ];
      if (R.has('practice')) footer.push(c.button({ label: 'PRACTICE', kind: 'ghost', icon: 'ball', action: 'practice', onClick: function () { R.go('practice'); } }));
      return c.card({ title: 'ATTRIBUTES', icon: 'stats', body: [head, c.el('p', { class: 'small txt-grey mb-1', text: agentNote }), rows], footer: footer });
    }

    function traitsCard(state) {
      var p = state.player;
      var traits = c.list(p.traits || [], function (t) { return c.el('span', { class: 'row grow' }, c.icon('star', 12), c.el('span', { class: 'small', text: TRAITS[t] || t })); }, { empty: 'No traits yet — three game-winners in a season earn Ice Veins.' });
      var mods = (p.mods || []).filter(function (m) { return m && m.key; });
      var modList = mods.length ? c.list(mods, function (m) {
        var exp = m.expires ? (m.expires.type === 'never' ? 'permanent' : 'until ' + m.expires.type + ' ' + m.expires.at) : '';
        return c.el('span', { class: 'row grow row-between' }, c.el('span', { class: 'small', text: (m.label || m.key) }), c.el('span', { class: 'small txt-grey', text: m.key + ' ' + (m.op === 'mul' ? '×' : '+') + m.value + (exp ? ' · ' + exp : '') }));
      }) : null;
      var ft = RTG.Player && RTG.Player.formText ? RTG.Player.formText(p) : '';
      return c.card({ title: 'TRAITS & FORM', icon: 'star', body: [traits, ft ? c.el('p', { class: 'small txt-sky mt-1', text: '“' + ft + '”' }) : null, modList ? c.el('h3', { class: 'section-title', text: 'Active modifiers' }) : null, modList] });
    }

    function render() {
      if (destroyed) return;
      var state = store.state;
      var parts = [c.el('header', { class: 'screen-head' }, c.el('h1', { class: 'screen-title', text: 'TRAINING' }), c.el('div', { class: 'screen-head-right small txt-grey' }, state ? c.el('span', { class: 'num', text: c.fmt.week(state) }) : null))];
      if (!state) { parts.push(c.card({ body: c.el('p', { text: 'No career loaded.' }) })); c.replace(el, parts); return; }
      parts.push(focusTiles(state));
      parts.push(attrPanel(state));
      parts.push(traitsCard(state));
      c.replace(el, parts);
    }

    render();
    unsub = store.subscribe(function (info) { if (info.fnName !== 'spendXp' && info.fnName !== 'train' && info.fnName !== 'autoSpend') render(); });
    return {
      el: el,
      destroy: function () { destroyed = true; if (unsub) unsub(); unsub = null; undoStack.length = 0; }
    };
  }

  Screens.training = factory;
  RTG.UI.Router.register('training', factory);
})(typeof window !== 'undefined' ? window : globalThis);
