/**
 * Road to Glory: Kicker — screen 'finances' (SPEC §4.5 finances row; the money system).
 *
 * Two modes, decided from state: DECISION when state.pending is a FINANCES decision (the offseason 'MONEY' step),
 * REVIEW otherwise (opened from the hub). Both render, top to bottom, phone-first: the header card (BANK, NET WORTH,
 * this year's take-home, the lifestyle chip, a red debt banner when the bank is negative); THIS YEAR (the tick
 * report: every holding's move as a delta chip with its %, the lifestyle cost, upkeep, interest, liquidations —
 * REVIEW mode shows the last ledger instead); LIFESTYLE (four tier cards, the current one marked; DECISION mode
 * picks the plan for the coming year); GAME PLAN (the three services — DECISION mode only); BIG BUYS (purchase
 * cards: price, upkeep/yr, effects, OWNED or BUY); INVEST (the opportunities with a source avatar, the pitch, a risk
 * chip, an amount stepper with MAX, INVEST; then HOLDINGS with SELL); LEDGER (last 12 rows).
 *
 * DECISION mode stages every action locally as a draft — {lifestyle, buy[], services[], invest[{oppId, amount}],
 * sell[]} — and nothing is dispatched until CLOSE THE BOOKS: store.dispatch('decide', {kind:'FINANCES',
 * optionId:'DONE', extra: draft}) then Router.sync(). staged(payload, draft) recomputes the bank after the draft in
 * the engine's apply order (sell → lifestyle → services → buy → invest), so the sticky footer ('BANK AFTER $X') and
 * the disabled states are exact; the staged bank never goes below $0 (the buttons disable first). The draft lives in
 * a module-level cache keyed by career + year (DRAFTS), so leaving the books mid-draft — the HUB tab, the desktop
 * rail, Escape, the wizard's door card — and coming back keeps everything staged; it is dropped when the books close
 * or a new year opens. A dearer lifestyle plan cannot be picked while the bank is red (the engine refuses it too).
 * REVIEW mode has no action buttons except BACK.
 *
 * Test hooks: data-tier="<id>", data-buy="<id>", data-service="<id>", data-invest="<oppId>", data-sell="<holdingId>",
 * data-step="<oppId>:-1|+1", data-max="<oppId>", data-action="close-books" / "reset-draft" / "back";
 * .fin-bank, .fin-networth, .fin-after, .fin-debt.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Screens = RTG.UI.Screens = RTG.UI.Screens || {};

  function C() { return RTG.UI.C; }
  function K() { return RTG.UI.Kit; }
  function num(v, d) { return typeof v === 'number' && v === v ? v : (d === undefined ? 0 : d); }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function isObj(o) { return !!o && typeof o === 'object'; }
  function isFn(f) { return typeof f === 'function'; }
  function Fin() { return typeof RTG.Finance === 'object' && RTG.Finance ? RTG.Finance : null; }
  function TF() { return RTG.Tuning && RTG.Tuning.finance ? RTG.Tuning.finance : null; }
  function DF() { return RTG.Data && RTG.Data.finance ? RTG.Data.finance : null; }

  var TIER_ORDER = ['FRUGAL', 'COMFORTABLE', 'FLASHY', 'BALLER'];
  var TIER_TEXT = {
    FRUGAL: 'Rent, ramen and film study. Costs nothing, gives nothing.',
    COMFORTABLE: 'A nice place, a reliable car, dinner out. A little lift every year.',
    FLASHY: 'The car people photograph. The town knows your name.',
    BALLER: 'Jets, chains and an entourage. Everyone knows your name — the coach included.'
  };
  var RISK_KIND = { LOW: 'mint', MED: 'gold', HIGH: 'warn', WILD: 'red' };
  var RISK_TIP = {
    LOW: 'Low risk: steady, small returns',
    MED: 'Medium risk: it can lose a year',
    HIGH: 'High risk: it can go to zero',
    WILD: 'Wild: most of these die, one in a while explodes'
  };
  var SOURCE_AVATAR = { AGENT: 'agent', TEAMMATE: 'teammate', BOOSTER: 'sponsor', BANK: 'gm', DM: 'fan' };
  var SOURCE_NAME = { AGENT: 'YOUR AGENT', TEAMMATE: 'A TEAMMATE', BOOSTER: 'A BOOSTER', BANK: 'THE BANK', DM: 'A DM' };
  // what a pitch calls itself on the card: the engine's SCAM kind is the first-tick bust key and must never print
  var KIND_LABEL = { INDEX: 'FUND', PROPERTY: 'PROPERTY', BUSINESS: 'BUSINESS', CRYPTO: 'CRYPTO', STARTUP: 'STARTUP', SCAM: 'FUND' };
  var ONES = { 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five' };
  /** The drafts in progress, keyed by career + year: a route away and back must not lose what was staged. */
  var DRAFTS = {};
  var KIND_ICON = { INCOME: 'money', LIFESTYLE: 'home', PURCHASE: 'star', UPKEEP: 'gear', SERVICE: 'train', INVEST: 'stats', RETURN: 'stats', SELL: 'money', EVENT: 'envelope', DEBT: 'flag', LIQUIDATION: 'x' };
  var EFFECT_KEYS = ['morale', 'fame', 'fans', 'trust'];
  var FOCUS_ATTRS = ['data-tier', 'data-buy', 'data-service', 'data-invest', 'data-sell', 'data-step', 'data-max', 'data-action'];

  // ─────────────────────────── view model ───────────────────────────

  function scaleOf(state, pl) {
    if (pl && typeof pl.scale === 'number') return pl.scale;
    var F = Fin();
    if (F && isFn(F.scale)) { try { return num(F.scale(state), 1); } catch (e) { /* fall through */ } }
    var T = TF();
    var league = state.player && state.player.league || state.stage;
    if (T && T.scale && typeof T.scale[league] === 'number') return T.scale[league];
    return league === 'NFL' ? 10 : 1;
  }

  function netWorthOf(state, fin, scale) {
    var F = Fin();
    if (F && isFn(F.netWorth)) { try { return num(F.netWorth(state), 0); } catch (e) { /* fall through */ } }
    var T = TF(), resale = T && typeof T.resale === 'number' ? T.resale : 0.5;
    var nw = num(fin.bank);
    (fin.holdings || []).forEach(function (h) { nw += num(h.value); });
    var byId = purchasesById();
    (fin.owned || []).forEach(function (id) { var p = byId[id]; if (p) nw += num(p.price) * scale * resale; });
    return Math.round(nw);
  }

  function purchasesById() {
    var D = DF(), out = {};
    ((D && D.purchases) || []).forEach(function (p) { out[p.id] = p; });
    return out;
  }

  function tiersFrom(state, scale, current) {
    var T = TF(), tiers = T && T.lifestyle && T.lifestyle.tiers;
    return TIER_ORDER.map(function (id) {
      var t = tiers && tiers[id] || { cost: 0 };
      return { id: id, cost: Math.round(num(t.cost) * scale), effects: { morale: num(t.morale), fame: num(t.fame), fans: num(t.fans), trust: num(t.trust) }, text: TIER_TEXT[id] };
    });
  }

  function purchasesFrom(state, fin, scale) {
    var D = DF();
    var league = state.player && state.player.league || state.stage;
    return ((D && D.purchases) || []).filter(function (p) { return !p.leagues || p.leagues.indexOf(league) >= 0; }).map(function (p) {
      var owned = (fin.owned || []).indexOf(p.id) >= 0;
      var paid = owned && fin.paid && typeof fin.paid[p.id] === 'number' ? fin.paid[p.id] : null;
      // an owned purchase pays upkeep off what was PAID (the engine's rule), not off today's scale
      var upkeep = paid !== null && num(p.price) > 0 ? Math.round(paid * num(p.upkeep) / num(p.price)) : Math.round(num(p.upkeep) * scale);
      return { id: p.id, name: p.name, price: Math.round(num(p.price) * scale), upkeep: upkeep, effects: p.effects || {}, yearly: p.yearly || {}, text: p.text || '', icon: p.icon, owned: owned, affordable: false };
    });
  }

  function servicesFrom(state, fin, scale) {
    var D = DF();
    return ((D && D.services) || []).map(function (s) {
      return { id: s.id, name: s.name, price: Math.round(num(s.price) * scale), text: s.text || '', effect: s.effect || '', active: (fin.services || []).indexOf(s.id) >= 0 };
    });
  }

  function holdingsFrom(fin) {
    return (fin.holdings || []).map(function (h) {
      var log = h.log || [];
      return { id: h.id, name: h.name, kind: h.kind, risk: h.risk, invested: num(h.invested), value: num(h.value), year: h.year, lastPct: log.length ? log[log.length - 1] : null };
    });
  }

  /** Take-home this year: the INCOME entries of the full ledger for the current career year. */
  function takeHome(state, fin) {
    var sum = 0, found = false;
    (fin.ledger || []).forEach(function (e) { if (e && e.kind === 'INCOME' && e.year === state.year) { sum += num(e.delta); found = true; } });
    return found ? sum : null;
  }

  /**
   * One shape for both modes. DECISION mode reads the decision payload (the contract's shapes) and falls back to
   * state for anything the payload leaves out; REVIEW mode builds the same shape from state.finance + the data.
   */
  function model(state) {
    var pd = state.pending;
    var dec = pd && pd.kind === 'DECISION' && pd.decision && pd.decision.kind === 'FINANCES' ? pd.decision : null;
    var pl = dec && isObj(dec.payload) ? dec.payload : null;
    var fin = isObj(state.finance) ? state.finance : { bank: 0, lifestyle: 'FRUGAL', owned: [], services: [], holdings: [], ledger: [], totals: {}, debtYears: 0 };
    var scale = scaleOf(state, pl);
    // the live bank wins over the payload's snapshot: Finance.apply settles against state.finance.bank, so the header,
    // the staged BANK AFTER and the disabled states must follow it when money moves while the decision is pending
    // (RTG.debug.money, an event settled from the hub); the payload only stands in when the block is missing
    var live = isObj(state.finance) && typeof state.finance.bank === 'number';
    var bank = live ? state.finance.bank : (pl && typeof pl.bank === 'number' ? pl.bank : num(fin.bank));
    var m = {
      mode: dec ? 'DECISION' : 'REVIEW',
      dec: dec,
      hasBooks: isObj(state.finance) || !!pl,
      bank: Math.round(bank),
      netWorth: live ? netWorthOf(state, fin, scale) : (pl && typeof pl.netWorth === 'number' ? Math.round(pl.netWorth) : netWorthOf(state, fin, scale)),
      scale: scale,
      takeHome: pl && typeof pl.income === 'number' ? Math.round(pl.income) : takeHome(state, fin),
      report: pl ? (pl.report || null) : null,
      lifestyle: { current: (pl && pl.lifestyle && pl.lifestyle.current) || fin.lifestyle || 'FRUGAL', tiers: null },
      purchases: pl && Array.isArray(pl.purchases) ? pl.purchases : purchasesFrom(state, fin, scale),
      services: pl && Array.isArray(pl.services) ? pl.services : servicesFrom(state, fin, scale),
      opportunities: pl && Array.isArray(pl.opportunities) ? pl.opportunities : [],
      holdings: pl && Array.isArray(pl.holdings) ? pl.holdings : holdingsFrom(fin),
      ledger: pl && Array.isArray(pl.ledger) ? pl.ledger : (fin.ledger || []).slice(-12),
      debtYears: pl && typeof pl.debtYears === 'number' ? pl.debtYears : num(fin.debtYears),
      totals: (pl && pl.totals) || fin.totals || {}
    };
    var tiers = pl && pl.lifestyle && Array.isArray(pl.lifestyle.tiers) ? pl.lifestyle.tiers : tiersFrom(state, scale, m.lifestyle.current);
    m.lifestyle.tiers = tiers.map(function (t) {
      return { id: t.id, cost: Math.round(num(t.cost)), effects: t.effects || {}, text: t.text || TIER_TEXT[t.id] || '' };
    });
    return m;
  }

  // ─────────────────────────── the draft ───────────────────────────

  function emptyDraft() { return { lifestyle: null, buy: [], services: [], invest: [], sell: [] }; }
  function cloneDraft(d) {
    return { lifestyle: d.lifestyle, buy: d.buy.slice(), services: d.services.slice(), invest: d.invest.map(function (i) { return { oppId: i.oppId, amount: i.amount }; }), sell: d.sell.slice() };
  }
  function draftSize(d) { return (d.lifestyle ? 1 : 0) + d.buy.length + d.services.length + d.invest.length + d.sell.length; }
  function byId(list, id, key) {
    key = key || 'id';
    for (var i = 0; i < (list || []).length; i++) if (list[i] && list[i][key] === id) return list[i];
    return null;
  }

  /**
   * The bank after the draft, recomputed in the engine's apply order (sell → lifestyle → services → buy → invest),
   * re-checking affordability at each step against the running bank exactly as Finance.apply does.
   * @returns {{bank:number, list:{what:string,id:string,label:string,delta:number}[], skipped:Object[]}}
   */
  function staged(m, draft) {
    var bank = m.bank, list = [], skipped = [];
    draft.sell.forEach(function (id) {
      var h = byId(m.holdings, id);
      if (!h) { skipped.push({ what: 'sell', id: id, reason: 'no such holding' }); return; }
      bank += Math.round(num(h.value));
      list.push({ what: 'sell', id: id, label: 'Sell ' + h.name, delta: Math.round(num(h.value)) });
    });
    if (draft.lifestyle && draft.lifestyle !== m.lifestyle.current) {
      var t = byId(m.lifestyle.tiers, draft.lifestyle), cur = byId(m.lifestyle.tiers, m.lifestyle.current);
      if (!t) skipped.push({ what: 'lifestyle', id: draft.lifestyle, reason: 'no such tier' });
      else if (bank < 0 && num(t.cost) > num(cur ? cur.cost : 0)) skipped.push({ what: 'lifestyle', id: draft.lifestyle, reason: 'in debt — clear the overdraft first' });   // Finance.apply refuses it too
      else list.push({ what: 'lifestyle', id: t.id, label: 'Live ' + t.id.toLowerCase() + ' next year', delta: 0, yearly: -t.cost });
    }
    draft.services.forEach(function (id) {
      var s = byId(m.services, id);
      if (!s || s.active) { skipped.push({ what: 'service', id: id, reason: s ? 'already booked' : 'no such service' }); return; }
      if (bank - s.price < 0) { skipped.push({ what: 'service', id: id, reason: 'cannot afford' }); return; }
      bank -= s.price;
      list.push({ what: 'service', id: id, label: s.name, delta: -s.price });
    });
    draft.buy.forEach(function (id) {
      var p = byId(m.purchases, id);
      if (!p || p.owned) { skipped.push({ what: 'buy', id: id, reason: p ? 'already owned' : 'no such purchase' }); return; }
      if (bank - p.price < 0) { skipped.push({ what: 'buy', id: id, reason: 'cannot afford' }); return; }
      bank -= p.price;
      list.push({ what: 'buy', id: id, label: 'Buy ' + p.name, delta: -p.price });
    });
    draft.invest.forEach(function (inv) {
      var o = byId(m.opportunities, inv.oppId, 'oppId');
      if (!o) { skipped.push({ what: 'invest', id: inv.oppId, reason: 'no such opportunity' }); return; }
      var amt = Math.round(Math.max(num(o.min), Math.min(num(o.max), num(inv.amount))));
      if (bank - amt < 0) { skipped.push({ what: 'invest', id: inv.oppId, reason: 'cannot afford' }); return; }
      bank -= amt;
      list.push({ what: 'invest', id: inv.oppId, label: 'Invest in ' + o.name, delta: -amt });
    });
    return { bank: Math.round(bank), list: list, skipped: skipped };
  }

  /** A sensible stepper step for an amount range in $k: the 1 / 2 / 5 × 10^n value at or above a tenth of the range. */
  function stepFor(o) {
    var range = Math.max(1, num(o.max) - num(o.min));
    var raw = range / 10;
    if (raw <= 1) return 1;
    var p = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var f = raw / p;
    var step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
    return Math.max(1, Math.round(step));
  }

  // ─────────────────────────── screen ───────────────────────────

  function factory(store) {
    var c = C(), Kit = K(), R = RTG.UI.Router;
    var el = c.el('div', { class: 'screen scr-finances' });
    var unsub = null, destroyed = false;
    var draft = emptyDraft();
    var amounts = {};          // oppId → the stepper amount ($k)
    var draftKey = null;       // the draft belongs to one decision (career + year): a new one resets it
    var lastMode = null;       // DECISION | REVIEW of the previous render
    var closing = false;       // CLOSE THE BOOKS is in flight (re-entrancy guard)

    /** The cache entry for this decision; every other career / year is dropped (only one set of books is ever open). */
    function draftEntry(key) {
      for (var k in DRAFTS) if (has(DRAFTS, k) && k !== key) delete DRAFTS[k];
      if (!DRAFTS[key]) DRAFTS[key] = { draft: emptyDraft(), amounts: {} };
      return DRAFTS[key];
    }
    function saveDraft() { if (draftKey) DRAFTS[draftKey] = { draft: draft, amounts: amounts }; }

    function money(k) { return Kit.money ? Kit.money(k) : c.fmt.money(k / 1000); }
    function signedMoney(k) { return (k > 0 ? '+' : k < 0 ? '−' : '') + money(Math.abs(k)); }
    function pctChip(pct) {
      var v = typeof pct === 'number' ? Math.round(pct * 1000) / 10 : 0;
      return c.deltaChip(v, '%');
    }

    function effectChips(fx, tipPrefix) {
      var chips = [];
      EFFECT_KEYS.forEach(function (k) {
        var v = fx && typeof fx[k] === 'number' ? fx[k] : 0;
        if (!v) return;
        var e = c.deltaChip(v);
        e.appendChild(c.el('span', { class: 'fin-fx-key', text: ' ' + k.toUpperCase() }));
        Kit.tip(e, (tipPrefix || '') + k + ' ' + (v > 0 ? '+' : '') + v);
        chips.push(e);
      });
      return chips;
    }

    /** The floor the staged bank may never go under: $0 — or the starting bank when the year opens in debt. */
    function floorOf(m) { return Math.min(0, m.bank); }
    /**
     * Is the draft over the floor — under it, or carrying items the bank can no longer pay (the bank moved while the
     * decision was pending: RTG.debug.money, an event settled from the hub)? CLOSE disables until they are undone.
     * (In debt, closing with nothing staged must always be possible.)
     */
    function overdrawn(m, st) { return st.bank < floorOf(m) || st.skipped.length > 0; }

    /** Would the draft still be valid (nothing skipped, bank not under the floor) after `mutate(copy)`? Returns the copy or null. */
    function tryDraft(m, mutate) {
      var copy = cloneDraft(draft);
      mutate(copy);
      var s = staged(m, copy);
      if (overdrawn(m, s)) return null;
      return copy;
    }
    function commit(m, mutate) {
      var copy = tryDraft(m, mutate);
      if (!copy) {
        var probe = cloneDraft(draft); mutate(probe);
        var why = staged(m, probe).skipped[0];
        c.toast(why && why.reason ? 'Not possible: ' + why.reason + '.' : 'That would put the bank below $0.', 'bad');
        return false;
      }
      draft = copy;
      saveDraft();
      render();
      return true;
    }

    function toggleIn(list, id) {
      var i = list.indexOf(id);
      if (i >= 0) list.splice(i, 1); else list.push(id);
    }

    // ── header

    function headerCard(state, m) {
      var st = m.mode === 'DECISION' ? staged(m, draft) : null;
      var stats = c.el('div', { class: 'fin-stats' },
        c.el('div', { class: 'fin-stat' }, c.el('span', { class: 'small txt-grey', text: 'BANK' }), Kit.tip(c.el('b', { class: 'num fin-bank' + (m.bank < 0 ? ' txt-red' : ' txt-gold'), text: money(m.bank) }), 'Cash in the bank right now')),
        c.el('div', { class: 'fin-stat' }, c.el('span', { class: 'small txt-grey', text: 'NET WORTH' }), Kit.tip(c.el('b', { class: 'num fin-networth', text: money(m.netWorth) }), 'Bank + holdings at value + what the things you own would fetch')),
        c.el('div', { class: 'fin-stat' }, c.el('span', { class: 'small txt-grey', text: 'TAKE-HOME Y' + state.year }), Kit.tip(c.el('b', { class: 'num', text: m.takeHome === null ? '—' : money(m.takeHome) }), 'This year’s pay after tax and the agent’s cut')));
      var chips = c.el('div', { class: 'chips mt-1' },
        Kit.tip(c.chip(m.lifestyle.current, 'sky', 'home'), 'Lifestyle this year'),
        m.scale > 1 ? Kit.tip(c.chip('PRO PRICES ×' + m.scale, 'dark'), 'Everything costs more at this level — and pays more') : null,
        m.holdings.length ? Kit.tip(c.chip(m.holdings.length + ' HOLDING' + (m.holdings.length === 1 ? '' : 'S'), 'grey', 'stats'), 'Investments you hold') : null);
      var body = [stats, chips];
      if (m.bank < 0) {
        // the rule as the engine plays it (Tuning.finance.debt): interest, the plan back to frugal (and no dearer one
        // while the bank is red), the forced sale after N red years or once the debt is more than what you own
        var TD = TF() && TF().debt ? TF().debt : {};
        var after = typeof TD.liquidateAfter === 'number' ? TD.liquidateAfter : 2;
        var grace = Math.round(num(TD.grace) * m.scale);
        var within = grace > 0 && -m.bank <= grace;
        var rule = within
          ? ' Within the ' + money(grace) + ' grace: no interest yet — past it, interest is charged, the lifestyle drops to frugal and stays there until the overdraft clears, and after ' + (ONES[after] || after) + ' year' + (after === 1 ? '' : 's') + ' in the red, or once the debt is more than what you own, the bank sells your assets.'
          : ' Interest is charged, the lifestyle drops to frugal and stays there until the overdraft clears, and after ' + (ONES[after] || after) + ' year' + (after === 1 ? '' : 's') + ' in the red, or once the debt is more than what you own, the bank sells your assets.';
        body.push(c.el('div', { class: 'banner banner-bad small mt-1 fin-debt', role: 'alert' }, c.icon('flag', 12), ' IN DEBT — ' + money(-m.bank) + ' owed' + (m.debtYears ? ' · ' + m.debtYears + ' year' + (m.debtYears === 1 ? '' : 's') + ' in the red' : '') + '.' + rule));
      }
      if (m.mode === 'DECISION') body.push(c.el('p', { class: 'small txt-grey mt-1', text: 'Stage what you want below — nothing is spent until you close the books.' + (st.list.length ? ' ' + st.list.length + ' change' + (st.list.length === 1 ? '' : 's') + ' staged.' : '') }));
      return c.card({ title: 'THE BOOKS · Y' + state.year, kind: m.bank < 0 ? 'red' : 'gold', icon: 'money', class: 'fin-head', body: body });
    }

    // ── this year

    function reportRow(label, value, tip, cls) {
      return c.el('span', { class: 'row row-between grow' }, c.el('span', { class: 'small', text: label }), Kit.tip(c.el('span', { class: 'num small ' + (cls || ''), text: value }), tip || ''));
    }

    function ledgerRow(e) {
      var d = Math.round(num(e.delta));
      return c.el('span', { class: 'row grow fin-ledger-row' },
        c.icon(KIND_ICON[e.kind] || 'more', 12),
        c.el('span', { class: 'col grow', style: 'gap:0' }, c.el('span', { class: 'small ellipsis', text: e.label || String(e.kind || '') }), c.el('span', { class: 'small txt-grey', text: 'Y' + num(e.year) + ' · ' + String(e.kind || '').toLowerCase() })),
        c.el('span', { class: 'num small ' + (d < 0 ? 'txt-red' : d > 0 ? 'txt-mint' : 'txt-grey'), text: signedMoney(d) }));
    }

    function thisYearCard(state, m) {
      var rep = m.report;
      var rows = [];
      if (m.mode !== 'DECISION') {
        // REVIEW: no tick report to show — this year's ledger stands in for it (the full ledger is the LEDGER card)
        var full = isObj(state.finance) && Array.isArray(state.finance.ledger) ? state.finance.ledger : m.ledger;
        var mine = full.filter(function (e) { return e && e.year === state.year; }).slice(-8).reverse();
        return c.card({ title: 'THIS YEAR', icon: 'clock', kind: 'flat', right: c.el('span', { class: 'small txt-grey', text: 'from the ledger' }),
          body: c.list(mine, ledgerRow, { empty: 'Nothing on the books this year yet — the books are settled once a year, in the offseason.' }) });
      }
      if (rep) {
        (rep.returns || []).forEach(function (r) {
          rows.push(c.el('span', { class: 'row row-between grow fin-return' },
            c.el('span', { class: 'row small grow' }, c.icon('stats', 12), c.el('span', { class: 'ellipsis', text: r.name || r.holdingId })),
            c.el('span', { class: 'row' }, pctChip(r.pct), Kit.tip(c.el('span', { class: 'num small ' + (num(r.delta) < 0 ? 'txt-red' : num(r.delta) > 0 ? 'txt-mint' : 'txt-grey'), text: signedMoney(Math.round(num(r.delta))) }), 'Change in value this year'))));
        });
        if (rep.lifestyle) rows.push(reportRow('Lifestyle · ' + String(rep.lifestyle.tier || m.lifestyle.current).toLowerCase(), signedMoney(-Math.round(num(rep.lifestyle.cost))), 'What living like that cost this year', num(rep.lifestyle.cost) ? 'txt-red' : 'txt-grey'));
        if (num(rep.upkeep)) rows.push(reportRow('Upkeep on what you own', signedMoney(-Math.round(num(rep.upkeep))), 'Insurance, taxes, maintenance', 'txt-red'));
        if (num(rep.interest)) rows.push(reportRow('Interest on the debt', signedMoney(-Math.round(num(rep.interest))), 'Charged while the bank is below zero', 'txt-red'));
        (rep.liquidated || []).forEach(function (l) {
          rows.push(reportRow('Sold by the bank · ' + (l.name || l.id || ''), signedMoney(Math.round(num(l.value !== undefined ? l.value : l.delta))), 'Liquidated to cover the debt', 'txt-gold'));
        });
        if (rep.effects) {
          var fx = effectChips(rep.effects, 'This year: ');
          if (fx.length) rows.push(c.el('span', { class: 'row row-between grow' }, c.el('span', { class: 'small', text: 'The lifestyle did this to you' }), c.el('span', { class: 'chips' }, fx)));
        }
      }
      var body = [];
      if (rep && rep.broke) body.push(c.el('div', { class: 'banner banner-bad small mb-1', text: 'THE BANK CALLED — you closed the year in the red' }));
      body.push(c.list(rows, function (r) { return r; }, { empty: rep ? 'Nothing moved this year.' : 'No report yet — the books are settled once a year, in the offseason.' }));
      return c.card({ title: 'THIS YEAR', icon: 'clock', kind: 'flat', body: body });
    }

    // ── lifestyle

    function tierCard(m, t) {
      var isCurrent = t.id === m.lifestyle.current;
      var planned = m.mode === 'DECISION' ? (draft.lifestyle || m.lifestyle.current) : m.lifestyle.current;
      var selected = t.id === planned;
      var fx = effectChips(t.effects, 'Every year: ');
      var inner = [
        c.el('span', { class: 'row row-between fin-tier-head' }, c.el('strong', { class: 'fin-tier-name', text: t.id }), isCurrent ? Kit.tip(c.chip('NOW', 'sky'), 'How you live this year') : null),
        c.el('span', { class: 'num fin-tier-cost' + (t.cost ? ' txt-red' : ' txt-mint'), text: t.cost ? '−' + money(t.cost) + '/yr' : 'free' }),
        fx.length ? c.el('span', { class: 'chips fin-tier-fx' }, fx) : c.el('span', { class: 'small txt-grey', text: 'no effects' }),
        c.el('span', { class: 'small txt-grey fin-tier-text', text: t.text })
      ];
      // in the red a dearer plan is off the table (Finance.apply refuses it): the tier dims and disables
      var cur = byId(m.lifestyle.tiers, m.lifestyle.current);
      var blocked = m.mode === 'DECISION' && m.bank < 0 && num(t.cost) > num(cur ? cur.cost : 0);
      var cls = 'fin-tier' + (selected ? ' selected' : '') + (isCurrent ? ' current' : '') + (blocked ? ' dim' : '');
      if (m.mode !== 'DECISION') return c.el('div', { class: cls, 'data-tier': t.id }, inner);
      if (blocked) inner.push(c.el('span', { class: 'small txt-red', text: 'not while in debt' }));
      var btn = c.el('button', { type: 'button', class: cls, 'data-tier': t.id, 'aria-pressed': selected ? 'true' : 'false', disabled: blocked,
        'aria-label': t.id + ' lifestyle, ' + (t.cost ? money(t.cost) + ' a year' : 'free') + (selected ? ', selected' : '') + (blocked ? ', not while in debt' : ''),
        onClick: function () { commit(m, function (d) { d.lifestyle = t.id === m.lifestyle.current ? null : t.id; }); } }, inner);
      if (blocked) Kit.tip(btn, 'Clear the overdraft first — a dearer plan cannot be picked while the bank is red');
      return btn;
    }

    function lifestyleCard(state, m) {
      var grid = c.el('div', { class: 'fin-tiers' }, m.lifestyle.tiers.map(function (t) { return tierCard(m, t); }));
      var note = c.el('p', { class: 'small txt-grey mt-1', text: m.mode === 'DECISION' ? 'The plan for the coming year: charged at the next close of the books, every year, until you change it.' : 'Change the plan when the books open in the offseason.' });
      return c.card({ title: 'LIFESTYLE', icon: 'home', body: [grid, note] });
    }

    // ── game plan (services)

    function servicesCard(state, m) {
      var rows = m.services.map(function (s) {
        var on = draft.services.indexOf(s.id) >= 0;
        var can = s.active || on || !!tryDraft(m, function (d) { d.services.push(s.id); });
        var right;
        if (s.active) right = Kit.tip(c.chip('BOOKED', 'mint', 'check'), 'Already booked for the coming season');
        else right = c.button({ label: on ? 'REMOVE' : 'ADD', kind: on ? 'primary' : 'secondary', small: true, disabled: !can, class: 'fin-service-btn',
          ariaLabel: (on ? 'Remove ' : 'Add ') + s.name + ', ' + money(s.price),
          onClick: function () { commit(m, function (d) { toggleIn(d.services, s.id); }); } });
        right.setAttribute('data-service', s.id);
        if (!s.active) right.setAttribute('aria-pressed', on ? 'true' : 'false');
        return c.el('span', { class: 'row row-between grow fin-service' + (on ? ' staged' : '') + (can || s.active ? '' : ' dim') },
          c.el('span', { class: 'col grow', style: 'gap:2px' },
            c.el('span', { class: 'row row-wrap' }, c.el('strong', { text: s.name }), Kit.tip(c.chip(s.effect || '', 'dark'), 'The mod for the coming season')),
            c.el('span', { class: 'small txt-grey', text: s.text }),
            c.el('span', { class: 'num small ' + (can || s.active ? 'txt-gold' : 'txt-red'), text: money(s.price) + (can || s.active ? '' : ' · can’t afford') })),
          right);
      });
      return c.card({ title: 'GAME PLAN', icon: 'train', right: c.el('span', { class: 'small txt-grey', text: 'for the coming season' }), body: c.list(rows, function (r) { return r; }, { empty: 'No services on offer.' }) });
    }

    // ── big buys

    function buyCard(m, p) {
      var on = draft.buy.indexOf(p.id) >= 0;
      var can = p.owned || on || !!tryDraft(m, function (d) { d.buy.push(p.id); });
      var iconName = p.icon && C().ICONS && C().ICONS[p.icon] ? p.icon : 'money';
      var head = c.el('span', { class: 'row fin-buy-head' }, c.el('span', { class: 'fin-buy-icon' }, c.icon(iconName, 16)), c.el('strong', { class: 'fin-buy-name', text: p.name }));
      var price = c.el('span', { class: 'row row-wrap small fin-buy-price' },
        Kit.tip(c.el('span', { class: 'num ' + (p.owned ? 'txt-grey' : can ? 'txt-gold' : 'txt-red'), text: money(p.price) }), 'Price'),
        p.upkeep ? Kit.tip(c.el('span', { class: 'num txt-grey', text: '+' + money(p.upkeep) + '/yr' }), 'Upkeep every year while you own it') : null);
      var fx = effectChips(p.effects, 'On purchase: ').concat(effectChips(p.yearly, 'Every year: ').map(function (e) { e.classList.add('fin-fx-yearly'); return e; }));
      var body = [head, price, fx.length ? c.el('span', { class: 'chips fin-buy-fx' }, fx) : null, c.el('span', { class: 'small txt-grey fin-buy-text', text: p.text })];
      var foot;
      if (p.owned) foot = Kit.tip(c.chip('OWNED', 'mint', 'check'), 'Yours. Upkeep is charged every year.' + (typeof p.resale === 'number' ? ' Worth ' + money(p.resale) + ' in a forced sale.' : ''));
      else if (m.mode === 'DECISION') {
        foot = c.button({ label: on ? 'UNDO' : 'BUY', kind: on ? 'primary' : 'secondary', small: true, block: true, disabled: !can, icon: on ? 'x' : 'money',
          ariaLabel: (on ? 'Undo buy ' : 'Buy ') + p.name + ', ' + money(p.price),
          onClick: function () { commit(m, function (d) { toggleIn(d.buy, p.id); }); } });
        foot.setAttribute('data-buy', p.id);
        foot.setAttribute('aria-pressed', on ? 'true' : 'false');
        if (!can) Kit.tip(foot, 'Not enough in the bank');
      } else foot = c.el('span', { class: 'small txt-grey', text: can ? '' : 'can’t afford' });
      var card = c.el('div', { class: 'fin-buy' + (p.owned ? ' owned' : '') + (on ? ' staged' : '') + (!p.owned && !can ? ' dim' : '') }, body, c.el('span', { class: 'fin-buy-foot' }, foot));
      if (m.mode !== 'DECISION' || p.owned) card.setAttribute('data-buy', p.id);
      return card;
    }

    function buysCard(state, m) {
      var grid = c.el('div', { class: 'fin-buys' }, m.purchases.map(function (p) { return buyCard(m, p); }));
      return c.card({ title: 'BIG BUYS', icon: 'star', right: c.el('span', { class: 'small txt-grey', text: 'lifestyle, not training' }), body: m.purchases.length ? grid : c.el('p', { class: 'small txt-grey', text: 'Nothing for sale.' }) });
    }

    // ── invest

    function availFor(m, oppId) {
      var copy = cloneDraft(draft);
      copy.invest = copy.invest.filter(function (i) { return i.oppId !== oppId; });
      return staged(m, copy).bank;
    }

    function oppCard(m, o) {
      var inv = byId(draft.invest, o.oppId, 'oppId');
      var on = !!inv;
      var step = stepFor(o);
      var avail = availFor(m, o.oppId);
      var lo = Math.round(num(o.min)), hi = Math.round(num(o.max));
      if (amounts[o.oppId] === undefined) amounts[o.oppId] = lo;
      var amt = Math.round(Math.max(lo, Math.min(hi, amounts[o.oppId])));
      amounts[o.oppId] = amt;
      var cap = Math.min(hi, avail);          // the most that can be staged right now
      var canInvest = on || (cap >= lo && amt <= cap);
      var risk = String(o.risk || 'MED');
      var head = c.el('span', { class: 'row fin-opp-head' },
        Kit.avatar(SOURCE_AVATAR[o.source] || 'press', 32),
        c.el('span', { class: 'col grow', style: 'gap:2px' },
          c.el('span', { class: 'small txt-sky', text: (SOURCE_NAME[o.source] || String(o.source || 'A CONTACT')) + ' · ' + (KIND_LABEL[o.kind] || String(o.kind || 'BUSINESS').replace(/_/g, ' ')) }),
          c.el('strong', { class: 'fin-opp-name', text: o.name })),
        Kit.tip(c.chip(risk, RISK_KIND[risk] || 'grey'), RISK_TIP[risk] || 'Risk'));
      var pitch = c.el('p', { class: 'small fin-opp-pitch', text: '“' + (o.pitch || '') + '”' });
      var range = c.el('span', { class: 'small txt-grey', text: 'Buy-in ' + money(lo) + ' – ' + money(hi) + ' · you can spare ' + money(Math.max(0, avail)) });
      var body = [head, pitch, range];
      if (m.mode === 'DECISION') {
        var minus = c.button({ kind: 'secondary', small: true, icon: 'arrow-l', ariaLabel: 'Less for ' + o.name, disabled: on || amt <= lo, onClick: function () { amounts[o.oppId] = Math.max(lo, amt - step); saveDraft(); render(); } });
        minus.setAttribute('data-step', o.oppId + ':-1');
        var plus = c.button({ kind: 'secondary', small: true, icon: 'arrow-r', ariaLabel: 'More for ' + o.name, disabled: on || amt >= cap, onClick: function () { amounts[o.oppId] = Math.min(cap, amt + step); saveDraft(); render(); } });
        plus.setAttribute('data-step', o.oppId + ':+1');
        var maxBtn = c.button({ label: 'MAX', kind: 'ghost', small: true, ariaLabel: 'Max for ' + o.name, disabled: on || cap < lo || amt === cap, onClick: function () { amounts[o.oppId] = cap; saveDraft(); render(); } });
        maxBtn.setAttribute('data-max', o.oppId);
        var amountEl = c.el('span', { class: 'num fin-amount' + (on ? ' txt-gold' : ''), text: money(on ? Math.round(num(inv.amount)) : amt), role: 'status', 'aria-live': 'polite', 'aria-label': 'Amount ' + money(amt) });
        var stepper = c.el('span', { class: 'fin-stepper', role: 'group', 'aria-label': 'Amount to invest in ' + o.name }, minus, amountEl, plus, maxBtn);
        var go = c.button({ label: on ? 'UNDO' : 'INVEST', kind: on ? 'primary' : 'secondary', small: true, icon: on ? 'x' : 'stats', disabled: !canInvest,
          ariaLabel: (on ? 'Undo ' : 'Invest in ') + o.name,
          onClick: function () { commit(m, function (d) { d.invest = d.invest.filter(function (i) { return i.oppId !== o.oppId; }); if (!on) d.invest.push({ oppId: o.oppId, amount: amt }); }); } });
        go.setAttribute('data-invest', o.oppId);
        go.setAttribute('aria-pressed', on ? 'true' : 'false');
        if (!canInvest) Kit.tip(go, cap < lo ? 'Not enough in the bank for the buy-in' : 'Lower the amount');
        body.push(c.el('span', { class: 'row row-between row-wrap fin-opp-act' }, stepper, go));
      }
      return c.el('div', { class: 'fin-opp' + (on ? ' staged' : '') + (m.mode === 'DECISION' && !canInvest ? ' dim' : ''), 'data-opp': o.oppId }, body);
    }

    function holdingRow(m, h) {
      var on = draft.sell.indexOf(h.id) >= 0;
      var risk = String(h.risk || 'MED');
      var right;
      if (m.mode === 'DECISION') {
        var can = on ? !!tryDraft(m, function (d) { toggleIn(d.sell, h.id); }) : true;
        right = c.button({ label: on ? 'UNDO' : 'SELL', kind: on ? 'primary' : 'secondary', small: true, disabled: !can, ariaLabel: (on ? 'Undo sell ' : 'Sell ') + h.name,
          onClick: function () { commit(m, function (d) { toggleIn(d.sell, h.id); }); } });
        right.setAttribute('data-sell', h.id);
        right.setAttribute('aria-pressed', on ? 'true' : 'false');
        if (!can) Kit.tip(right, 'Something staged is paid for with this sale');
      } else right = c.el('span', { class: 'small txt-grey', text: 'Y' + num(h.year) });
      var lp = h.lastPct;
      var dead = h.dead === true || (typeof h.value === 'number' && h.value <= 0 && num(h.invested) > 0);
      var row = c.el('span', { class: 'row row-between grow fin-holding' + (on ? ' staged' : '') + (dead ? ' dead' : '') },
        c.el('span', { class: 'col grow', style: 'gap:2px' },
          c.el('span', { class: 'row row-wrap' }, c.el('strong', { class: 'ellipsis', text: h.name }), Kit.tip(c.chip(risk, RISK_KIND[risk] || 'grey'), RISK_TIP[risk] || 'Risk'), dead ? Kit.tip(c.chip('BUST', 'red', 'x'), 'Gone to zero — nothing left to sell') : null, c.el('span', { class: 'small txt-grey', text: String(h.kind || '').replace(/_/g, ' ') })),
          c.el('span', { class: 'row row-wrap small' }, Kit.tip(c.el('span', { class: 'num txt-grey', text: money(Math.round(num(h.invested))) + ' →' }), 'What you put in'), Kit.tip(c.el('span', { class: 'num ' + (num(h.value) >= num(h.invested) ? 'txt-mint' : 'txt-red'), text: money(Math.round(num(h.value))) }), 'What it is worth now'), typeof lp === 'number' ? Kit.tip(pctChip(lp), 'Last year’s move') : Kit.tip(c.chip('NEW', 'grey'), 'No year on the books yet'))),
        right);
      row.setAttribute('data-holding', h.id);
      return row;
    }

    function investCard(state, m) {
      var body = [];
      if (m.mode === 'DECISION') {
        body.push(c.el('p', { class: 'small txt-grey mb-1', text: m.opportunities.length ? 'Three pitches a year. Real risk, real loss — what you put in can go to zero.' : 'Nobody pitched anything this year.' }));
        body.push(c.el('div', { class: 'fin-opps' }, m.opportunities.map(function (o) { return oppCard(m, o); })));
      }
      body.push(c.el('h3', { class: 'section-title fin-sub', text: 'HOLDINGS' }));
      body.push(c.list(m.holdings, function (h) { return holdingRow(m, h); }, { empty: 'You hold nothing yet.' }));
      return c.card({ title: 'INVEST', icon: 'stats', body: body });
    }

    // ── ledger

    function ledgerCard(state, m) {
      var rows = m.ledger.slice(-12).reverse();
      var list = c.list(rows, ledgerRow, { empty: 'No entries yet.' });
      return c.card({ title: 'LEDGER', icon: 'save', kind: 'flat', right: c.el('span', { class: 'small txt-grey', text: 'last ' + Math.min(12, rows.length) }), body: list });
    }

    // ── footer

    function closeBooks(m, btn) {
      // re-entrancy: a second click on a detached button (or a stale render) must never reach Engine.decide
      var pd = store.state && store.state.pending;
      if (closing || !pd || pd.kind !== 'DECISION' || !pd.decision || pd.decision.kind !== 'FINANCES') return;
      var st = staged(m, draft);
      if (overdrawn(m, st)) { c.toast(st.skipped.length ? 'Undo what the bank can no longer pay first: ' + st.skipped.map(function (s) { return s.id; }).join(', ') : 'The draft would put the bank below $0.', 'bad'); return; }
      closing = true;
      if (btn) btn.disabled = true;
      var extra = { buy: draft.buy.slice(), services: draft.services.slice(), invest: draft.invest.map(function (i) { return { oppId: i.oppId, amount: Math.round(num(i.amount)) }; }), sell: draft.sell.slice() };
      if (draft.lifestyle && draft.lifestyle !== m.lifestyle.current) extra.lifestyle = draft.lifestyle;
      var r;
      try { r = Kit.dispatch(store, 'decide', { kind: 'FINANCES', optionId: 'DONE', extra: extra }); }
      finally { closing = false; }
      if (r === undefined) { if (btn) btn.disabled = false; return; }
      draft = emptyDraft();
      amounts = {};
      if (draftKey) delete DRAFTS[draftKey];
      var receipt = r && r.result;
      var skipped = receipt && Array.isArray(receipt.skipped) ? receipt.skipped : [];
      if (skipped.length) c.toast('Skipped: ' + skipped.map(function (s) { return (s.id || s.what) + (s.reason ? ' (' + s.reason + ')' : ''); }).join(', '), 'bad', 5000);
      else c.toast('Books closed' + (receipt && typeof receipt.bankAfter === 'number' ? ' · bank ' + money(receipt.bankAfter) : ''), 'gold', 3500);
      if (r && r.headline && r.headline.text) c.toast(r.headline.text, 'gold', 4000);
      c.announce('Books closed.' + (skipped.length ? ' ' + skipped.length + ' item' + (skipped.length === 1 ? '' : 's') + ' skipped.' : ''));
      R.sync();
      // the finances screen is a hub-family screen (it stays while the state routes to 'hub'): once the decision is
      // gone the wizard / hub owns the flow, so leave explicitly when the sync kept us here
      if (R.current() === 'finances') {
        var next = R.resolve(store.state);
        if (next.id !== 'finances') R.go(next.id, next.params, { replace: true });
      }
    }

    function footer(state, m) {
      var st = staged(m, draft);
      var n = draftSize(draft);
      var summary = c.el('div', { class: 'col grow fin-footer-sum', style: 'gap:2px' },
        c.el('span', { class: 'small txt-grey', text: 'BANK AFTER' }),
        c.el('b', { class: 'num fin-after' + (st.bank < 0 ? ' txt-red' : ' txt-gold'), text: money(st.bank) }),
        c.el('span', { class: 'small fin-footer-note' + (st.skipped.length ? ' txt-red' : ' txt-grey'), text: (n ? n + ' change' + (n === 1 ? '' : 's') + ' staged' : 'nothing staged — closing spends nothing') + (st.skipped.length ? ' · ' + st.skipped.length + ' the bank can’t pay — undo to close' : '') }));
      var over = overdrawn(m, st);
      var reset = c.button({ label: 'RESET DRAFT', kind: 'ghost', small: true, icon: 'x', action: 'reset-draft', disabled: !n, onClick: function () { draft = emptyDraft(); amounts = {}; saveDraft(); render(); c.announce('Draft cleared.'); } });
      var close = c.button({ label: 'CLOSE THE BOOKS', kind: 'primary', icon: 'check', action: 'close-books', disabled: over, onClick: Kit.safe(function () { closeBooks(m, close); }) });
      if (over && st.skipped.length) Kit.tip(close, 'Undo what the bank can no longer pay first');
      // the button row is a .card-footer on purpose: the house convention (and the career e2e's generic decision
      // path) is that the primary button in a card footer is the step's default action
      return c.el('div', { class: 'fin-footer' + (over ? ' over' : ''), role: 'region', 'aria-label': 'Draft' }, summary, c.el('div', { class: 'fin-footer-btns card-footer' }, reset, close));
    }

    // ── render

    function focusKey(node) {
      if (!node || node === root.document.body || !el.contains(node)) return null;
      for (var i = 0; i < FOCUS_ATTRS.length; i++) {
        var v = node.getAttribute && node.getAttribute(FOCUS_ATTRS[i]);
        if (v !== null && v !== undefined) return { attr: FOCUS_ATTRS[i], value: v };
      }
      return null;
    }
    function focusEl(node) { try { node.focus({ preventScroll: true }); } catch (e) { try { node.focus(); } catch (e2) { /* ignore */ } } }
    function restoreFocus(key) {
      if (!key) return;
      var all = el.querySelectorAll('[' + key.attr + ']');
      for (var i = 0; i < all.length; i++) {
        if (all[i].getAttribute(key.attr) !== key.value) continue;
        if (!all[i].disabled) { focusEl(all[i]); return; }
        // the control just disabled itself (a stepper at its cap, a BUY that can no longer be paid): keep the
        // keyboard user in the same group — the nearest enabled button of that card, else the card itself
        var grp = all[i].closest ? all[i].closest('.fin-stepper, .fin-opp-act, .fin-buy, .fin-service, .fin-holding, .fin-tiers, .fin-footer') : null;
        var alt = grp && grp.querySelector('button:not([disabled])');
        if (alt) focusEl(alt);
        else { var host = grp || all[i].parentNode || all[i]; host.setAttribute('tabindex', '-1'); focusEl(host); }
        return;
      }
    }

    function render() {
      if (destroyed) return;
      var state = store.state;
      var parts = [];
      if (!state) { parts.push(c.el('header', { class: 'screen-head' }, c.el('h1', { class: 'screen-title', text: 'FINANCES' }))); parts.push(c.card({ body: c.el('p', { text: 'No career loaded.' }) })); c.replace(el, parts); return; }
      var m = model(state);
      var decision = m.mode === 'DECISION';
      // the books just closed under us (autoplay / debug from the open books): this screen is a hub-family FREE
      // screen, so Router.sync keeps it — leave the way closeBooks does once the decision is gone
      if (lastMode === 'DECISION' && !decision && R && R.current() === 'finances') {
        var next = R.resolve(state);
        if (next.id !== 'finances') { lastMode = m.mode; R.go(next.id, next.params, { replace: true }); return; }
      }
      lastMode = m.mode;
      // the draft belongs to one decision (career + year) and survives a route away and back (DRAFTS)
      var yearKey = decision ? num(state.createdAt) + ':' + state.year : null;
      if (draftKey !== yearKey) {
        draftKey = yearKey;
        if (yearKey) { var entry = draftEntry(yearKey); draft = entry.draft; amounts = entry.amounts; }
        else { draft = emptyDraft(); amounts = {}; }
      }
      var key = focusKey(root.document.activeElement);
      var head = c.el('header', { class: 'screen-head' },
        decision ? null : c.button({ kind: 'ghost', small: true, icon: 'arrow-l', ariaLabel: 'Back', class: 'back-btn', action: 'back', onClick: function () { R.back(); } }),
        c.el('h1', { class: 'screen-title', text: decision ? 'THE BOOKS' : 'FINANCES' }),
        c.el('div', { class: 'screen-head-right small txt-grey' }, c.el('span', { class: 'num', text: (decision ? 'OFFSEASON · ' : '') + 'Y' + state.year + ' · ' + Kit.calYear(state.year) })));
      parts.push(head);
      if (!m.hasBooks) {
        parts.push(c.card({ kind: 'sky', body: c.el('p', { class: 'small', text: 'No books on this career yet — the money system opens with the first offseason.' }), footer: [c.button({ label: 'BACK', kind: 'primary', icon: 'arrow-l', action: 'back', onClick: function () { R.back(); } })] }));
        c.replace(el, parts);
        return;
      }
      parts.push(headerCard(state, m));
      parts.push(thisYearCard(state, m));
      parts.push(lifestyleCard(state, m));
      if (decision) parts.push(servicesCard(state, m));
      parts.push(buysCard(state, m));
      parts.push(investCard(state, m));
      parts.push(ledgerCard(state, m));
      if (decision) parts.push(footer(state, m));
      else parts.push(c.el('div', { class: 'btn-row fin-actions' }, c.button({ label: 'BACK', kind: 'primary', icon: 'arrow-l', action: 'back', onClick: function () { R.back(); } })));
      c.replace(el, parts);
      restoreFocus(key);
    }

    render();
    unsub = store.subscribe(function () { render(); });
    return {
      el: el,
      destroy: function () { destroyed = true; if (unsub) unsub(); unsub = null; }
    };
  }

  factory.model = model;
  factory.staged = staged;
  factory.stepFor = stepFor;
  Screens.finances = factory;
  if (RTG.UI.Router) RTG.UI.Router.register('finances', factory);
})(typeof window !== 'undefined' ? window : globalThis);
