/**
 * Road to Glory: Kicker — RTG.Finance (SPEC §2.7.10 money: lifestyle, big buys, gameplay services, investments)
 *
 * "Mostly lifestyle but a little bit of play." Every dollar the career earns (Contracts.payoutSeason, dead money, event
 * money) reaches the bank as take-home; the offseason FINANCES step (Career STEPS.FINANCES → Finance.decision) then lets
 * the player pick a lifestyle plan, buy things, hire a service for the coming season and put money into whatever was
 * pitched that year — with real risk and real loss. Nothing here changes a kick except the three services, and those
 * only through the ordinary Modifier machinery (Player.mods, one season).
 *
 *   state.finance = {
 *     bank         $k, integer; negative = overdraft (debt)
 *     lifestyle    'FRUGAL'|'COMFORTABLE'|'FLASHY'|'BALLER'     the plan charged at the next tick
 *     planCost     $k the plan will cost at the next tick — quoted at the scale in force when the books last closed
 *                  (Finance.apply), so the price the card showed is the price charged even across the college → NFL
 *                  jump; null = not quoted (fixtures, migrated saves): the tick prices the tier at the current scale
 *     owned        purchase ids (Data.finance.purchases), each at most once
 *     paid         {purchaseId: $k paid}   what an owned purchase cost (resale = paid × Tuning.finance.resale; upkeep
 *                  = paid × entry.upkeep / entry.price, so a college truck stays a college truck in the NFL)
 *     services     service ids bought for the coming season; Season.start → Finance.applyServices → cleared
 *     holdings     [{id 'h<n>', oppId, name, kind, risk, invested, value, year, log[yearly pct]}]
 *     closed       [{id, name, kind, risk, invested, value, year, pct}]   sold / liquidated holdings (legacy best / worst)
 *     ledger       [{year, kind, label, delta $k}]   newest last, capped Tuning.finance.ledgerCap
 *     totals       {earned, spent, invested, returned, lost, peakNetWorth}   $k
 *     debtYears    consecutive ticks closed in debt
 *     lastTick     state.year of the last Finance.tick (idempotence)
 *     nextId       next holding number
 *   }
 *
 * Units: everything in this module is $k. history.earnings ($M, gross career money) keeps its meaning and is never
 * reduced by spending. Catalogue prices are $k at scale 1 × Finance.scale(state) (Tuning.finance.scale by league).
 *
 * RNG draw contract (the parent rng only ever sees forks; every sample comes from the child):
 *   Finance.tick          : exactly 1 parent draw — rng.fork('finance:tick:<year>'); 0 when the year was already ticked.
 *                           The child takes 4 draws per live holding (bust chance, boom chance, gauss ×2) and the money
 *                           headline (Events.headline, 1 child draw, at most one per tick) — never the parent.
 *   Finance.opportunities : exactly 1 parent draw — rng.fork('finance:opps:<year>')
 *   Finance.decision      : tick + opportunities = 2 parent draws (1 when the year was already ticked)
 *   Finance.init / deposit / charge / netWorth / scale / apply / summary / applyServices : 0
 *
 * DOM-free and pure over plain JSON. RTG.Data.finance is read lazily (an empty catalogue when it is missing), so the
 * engine loads and runs without the data file; sibling modules (Player, Events, Schema) are resolved at call time.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  var Util = RTG.Util, Tuning = RTG.Tuning;
  var Finance = {};

  var K_PER_M = 1000;
  var TIERS = ['FRUGAL', 'COMFORTABLE', 'FLASHY', 'BALLER'];
  var TIER_LABEL = { FRUGAL: 'Frugal', COMFORTABLE: 'Comfortable', FLASHY: 'Flashy', BALLER: 'Baller' };
  var TIER_TEXT = {
    FRUGAL: 'Roommates, a beater and rice. The leg does not care where you sleep.',
    COMFORTABLE: 'Your own place, a car that starts, a proper bed. Nothing to post about.',
    FLASHY: 'The good building, the good table, the good watch. People notice.',
    BALLER: 'Private chef, a driver, a jet card. Everyone notices — the coach included.'
  };
  var SERVICE_IDS = ['PRIVATE_COACH', 'PHYSIO', 'PSYCH'];
  var HOLDING_KINDS = ['INDEX', 'PROPERTY', 'BUSINESS', 'CRYPTO', 'STARTUP', 'SCAM'];
  var RISKS = ['LOW', 'MED', 'HIGH', 'WILD'];
  var LEDGER_KINDS = ['INCOME', 'LIFESTYLE', 'PURCHASE', 'UPKEEP', 'SERVICE', 'INVEST', 'RETURN', 'SELL', 'EVENT', 'DEBT', 'LIQUIDATION'];
  var SOFT_KEYS = ['morale', 'fans', 'trust'];
  var EFFECT_KEYS = ['morale', 'fame', 'fans', 'trust'];

  // ═══════════════════════════════ late-bound modules & small helpers ═══════════════════════════════

  function T() { return Tuning.finance; }
  function Player() { return RTG.Player; }
  function Events() { return RTG.Events; }
  function isFn(f) { return typeof f === 'function'; }
  function num(v, d) { return typeof v === 'number' && v === v ? v : d; }
  function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
  function has(arr, v) { return Array.isArray(arr) && arr.indexOf(v) >= 0; }
  function fail(fn, msg) { throw new Error('Finance.' + fn + ': ' + msg); }
  function pct3(x) { return Math.round(x * 1000) / 1000; }
  function fmtPct(pct) { var n = Math.round(pct * 100); return (n > 0 ? '+' : '') + n + ' %'; }
  function fmtK(k) { return Util.fmtMoney(k / K_PER_M); }

  /** The catalogue (RTG.Data.finance) read lazily; an empty one when the data file is not loaded. */
  function catalogue() {
    var d = RTG.Data && RTG.Data.finance;
    return {
      purchases: d && Array.isArray(d.purchases) ? d.purchases : [],
      services: d && Array.isArray(d.services) ? d.services : [],
      investments: d && Array.isArray(d.investments) ? d.investments : []
    };
  }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i]; return null; }
  function leagueOf(state) {
    var p = state.player || {};
    if (p.league === 'NFL' || p.league === 'COLLEGE') return p.league;
    return state.stage === 'NFL' ? 'NFL' : 'COLLEGE';
  }
  function tierOf(id) { return T().lifestyle.tiers[id] || T().lifestyle.tiers.FRUGAL; }
  function modelFor(holding) {
    var entry = byId(catalogue().investments, holding.oppId);
    var m = entry && entry.model ? entry.model : (T().invest.models[holding.risk] || T().invest.models.MED);
    return { mean: num(m.mean, 0), sd: num(m.sd, 0), bust: num(m.bust, 0), boom: num(m.boom, 0), boomX: num(m.boomX, 1) };
  }
  function cloneEffects(o) {
    var out = {};
    if (!o) return out;
    for (var i = 0; i < EFFECT_KEYS.length; i++) if (typeof o[EFFECT_KEYS[i]] === 'number') out[EFFECT_KEYS[i]] = o[EFFECT_KEYS[i]];
    return out;
  }
  function addNum(o, k, v) { o[k] = num(o[k], 0) + v; }

  /** Headline via Events.headline (1 draw on the rng passed in); null when Events is absent (0 draws). */
  function headline(state, rng, vars) {
    var E = Events();
    if (!E || !isFn(E.headline) || !Array.isArray(state.headlines)) return null;
    return E.headline(state, rng, 'money', vars || {});
  }
  function timeline(state, text, impact) {
    var h = state.history;
    if (!h || !Array.isArray(h.timeline)) return null;
    var row = { year: state.year, week: state.week, kind: 'MONEY', text: text, impact: impact, teamId: (state.player && state.player.teamId) || null };
    h.timeline.push(row);
    var cap = Tuning.save.timelineCap;
    while (h.timeline.length > cap) h.timeline.shift();
    return row;
  }
  function option(id, label, detail) { return { id: id, label: label, detail: detail || '' }; }

  /** The finance block, created on first touch (old fixtures / states from before the money system). */
  function fin(state) { return state.finance && typeof state.finance === 'object' ? state.finance : Finance.init(state); }

  /** Push a ledger row (does NOT move the bank). */
  function ledger(state, kind, label, delta) {
    var f = fin(state);
    var row = { year: num(state.year, 0), kind: kind, label: String(label || kind), delta: Math.round(delta) };
    f.ledger.push(row);
    var cap = T().ledgerCap;
    while (f.ledger.length > cap) f.ledger.shift();
    return row;
  }

  /**
   * Apply meter effects {morale, fame, fans, trust} to the player (clamped: morale / fans / trust to Tuning.soft,
   * fame to 0..Tuning.soft.fame.max; morale through Player.moraleAdd when it exists). Sums what moved into `acc`.
   */
  function applyEffects(state, eff, acc) {
    if (!eff || !state.player) return acc;
    var p = state.player, S = Tuning.soft, P = Player();
    for (var i = 0; i < SOFT_KEYS.length; i++) {
      var k = SOFT_KEYS[i];
      if (typeof eff[k] !== 'number' || eff[k] === 0) continue;
      var before = num(p[k], 0);
      if (k === 'morale' && P && isFn(P.moraleAdd)) P.moraleAdd(p, eff[k]);
      else p[k] = clamp(before + eff[k], S.min, S.max);
      addNum(acc, k, num(p[k], 0) - before);
    }
    if (typeof eff.fame === 'number' && eff.fame !== 0) {
      var f0 = num(p.fame, 0);
      p.fame = clamp(Util.round1(f0 + eff.fame), 0, S.fame.max);
      addNum(acc, 'fame', p.fame - f0);
    }
    return acc;
  }

  // ═══════════════════════════════ block, bank, net worth ═══════════════════════════════

  /**
   * Create state.finance (bank 0, lifestyle FRUGAL, nothing owned). Idempotent: an existing block is returned as is.
   * Draws: 0.
   * @param {Object} state @returns {Object} state.finance
   */
  Finance.init = function (state) {
    if (state.finance && typeof state.finance === 'object') return state.finance;
    state.finance = {
      bank: 0, lifestyle: 'FRUGAL', planCost: null, owned: [], paid: {}, services: [], holdings: [], closed: [], ledger: [],
      totals: { earned: 0, spent: 0, invested: 0, returned: 0, lost: 0, peakNetWorth: 0 },
      debtYears: 0, lastTick: 0, nextId: 1
    };
    return state.finance;
  };

  /**
   * Money into the bank ($k, rounded to an integer; the sign is ignored). INCOME / EVENT count as earned; SELL and
   * LIQUIDATION are asset conversions. Draws: 0.
   * @param {Object} state @param {number} k @param {string} kind ledger kind @param {string} label
   * @returns {{year:number, kind:string, label:string, delta:number}} the ledger row
   */
  Finance.deposit = function (state, k, kind, label) {
    var f = fin(state);
    k = Math.abs(Math.round(num(k, 0)));
    f.bank = Math.round(f.bank + k);
    if (kind !== 'SELL' && kind !== 'LIQUIDATION' && kind !== 'RETURN') f.totals.earned += k;
    return ledger(state, kind || 'INCOME', label, k);
  };

  /**
   * Money out of the bank ($k, rounded to an integer; the sign is ignored; the bank may go negative). INVEST counts
   * as invested, everything else as spent. Draws: 0.
   * @param {Object} state @param {number} k @param {string} kind ledger kind @param {string} label
   * @returns {{year:number, kind:string, label:string, delta:number}} the ledger row (delta negative)
   */
  Finance.charge = function (state, k, kind, label) {
    var f = fin(state);
    k = Math.abs(Math.round(num(k, 0)));
    f.bank = Math.round(f.bank - k);
    if (kind === 'INVEST') f.totals.invested += k; else f.totals.spent += k;
    return ledger(state, kind || 'PURCHASE', label, -k);
  };

  /**
   * The money scale of the player's league (Tuning.finance.scale: COLLEGE 1, NFL 10). Pure, 0 draws.
   * @param {Object} state @returns {number}
   */
  Finance.scale = function (state) {
    return num(T().scale[leagueOf(state)], 1);
  };

  /** What was paid for an owned purchase ($k): finance.paid[id], or the catalogue price × today's scale when unknown. */
  function paidFor(state, id) {
    var f = fin(state);
    if (f.paid && typeof f.paid[id] === 'number') return f.paid[id];
    var entry = byId(catalogue().purchases, id);
    return entry ? num(entry.price, 0) * Finance.scale(state) : 0;
  }
  /** Resale value of an owned purchase ($k): paid × resale, or the catalogue price × scale when the paid price is unknown. */
  function resaleOf(state, id) { return Math.round(paidFor(state, id) * T().resale); }
  /**
   * Yearly upkeep of an owned purchase ($k): the catalogue's upkeep / price ratio applied to what was PAID — so the $25k
   * college truck keeps its $2k upkeep in the NFL instead of jumping to $20k — or upkeep × today's scale when the paid
   * price is unknown.
   */
  function upkeepOf(state, id) {
    var entry = byId(catalogue().purchases, id);
    if (!entry) return 0;
    var f = fin(state), price = num(entry.price, 0), up = num(entry.upkeep, 0);
    if (f.paid && typeof f.paid[id] === 'number' && price > 0) return Math.round(f.paid[id] * up / price);
    return Math.round(up * Finance.scale(state));
  }
  /** Quote the plan for the next tick at today's scale (the price the tier card shows is the price that gets charged). */
  function quotePlan(state) {
    var f = fin(state);
    f.planCost = Math.round(num(tierOf(f.lifestyle).cost, 0) * Finance.scale(state));
    return f.planCost;
  }

  /**
   * Net worth ($k): bank + every holding's value + every owned purchase at resale. Pure, 0 draws.
   * @param {Object} state @returns {number}
   */
  Finance.netWorth = function (state) {
    var f = fin(state), total = f.bank;
    for (var i = 0; i < f.holdings.length; i++) total += num(f.holdings[i].value, 0);
    for (var j = 0; j < f.owned.length; j++) total += resaleOf(state, f.owned[j]);
    return Math.round(total);
  };

  function holdingsValue(f) { var v = 0; for (var i = 0; i < f.holdings.length; i++) v += num(f.holdings[i].value, 0); return v; }
  function peak(state) { var f = fin(state); f.totals.peakNetWorth = Math.max(num(f.totals.peakNetWorth, 0), Finance.netWorth(state)); }

  function closeHolding(state, h) {
    var f = fin(state);
    f.closed.push({ id: h.id, name: h.name, kind: h.kind, risk: h.risk, invested: h.invested, value: h.value, year: h.year,
      pct: h.invested > 0 ? pct3(h.value / h.invested - 1) : 0 });
    var cap = T().closedCap;
    while (f.closed.length > cap) f.closed.shift();
  }

  // ═══════════════════════════════ the yearly tick ═══════════════════════════════

  /**
   * The offseason money tick, once per state.year (null when already ticked). In order: (1) revalue every live holding
   * from the fork (bust → 0 — a SCAM always busts on its first tick; boom → × boomX; else N(mean, sd), clamped ≥ −100 %;
   * RETURN ledger row when the value moved by ≥ $1k); (2) charge the lifestyle plan at the price quoted when the books
   * last closed (finance.planCost; the tier at today's scale when nothing was quoted) and clear the quote; (3) charge
   * upkeep of everything owned (paid × upkeep / price — the scale of the purchase, not of today); (4) apply the tier's
   * and each purchase's yearly meter effects; (5) in debt beyond the grace floor (Tuning.finance.debt.grace × scale):
   * interest on the whole overdraft, debtYears++, morale −Tuning.finance.debt.morale, plan back to FRUGAL, and a forced
   * sale after Tuning.finance.debt.liquidateAfter years or once the debt exceeds what could be sold (net worth < 0):
   * the smallest asset that clears what is still owed, else the largest, again until the bank is clear or nothing is
   * left; (6) peak net worth. Timeline 'MONEY' rows for busts, booms, the forced sale and any return ≥
   * Tuning.finance.timeline.minDelta × scale; one money headline per tick at most (forced sale > bust > boom).
   * Draws: exactly 1 parent draw (rng.fork('finance:tick:<year>')); 0 when lastTick === state.year. The child takes
   * 4 draws per live holding and 1 for the headline.
   * @param {Object} state @param {RNG} rng
   * @returns {{year:number, returns:Object[], lifestyle:{tier:string, cost:number}, upkeep:number, effects:Object,
   *            interest:number, broke:boolean, liquidated:Object[], bank:number, netWorth:number}|null}
   */
  Finance.tick = function (state, rng) {
    var f = fin(state);
    if (f.lastTick === state.year) return null;
    var child = rng.fork('finance:tick:' + state.year);                                    // 1 parent draw
    var F = T(), scale = Finance.scale(state), TL = F.timeline, IM = TL.impact;
    var report = { year: state.year, returns: [], lifestyle: { tier: f.lifestyle, cost: 0 }, upkeep: 0, effects: {},
      interest: 0, broke: false, liquidated: [], bank: 0, netWorth: 0 };
    var hlVars = null, hlRank = 0;                                                         // 3 liquidation · 2 bust · 1 boom

    // 1. holdings
    for (var i = 0; i < f.holdings.length; i++) {
      var h = f.holdings[i];
      if (num(h.value, 0) <= 0) continue;                                                 // dead money stays dead (no draws)
      var m = modelFor(h);
      var bust = child.chance(m.bust);                                                    // child 1
      var boom = child.chance(m.boom);                                                    // child 2
      var g = child.gauss(m.mean, m.sd);                                                  // child 3–4
      if (h.kind === 'SCAM' && (!Array.isArray(h.log) || h.log.length === 0)) bust = true;
      var pct = bust ? -1 : (boom ? Math.max(0, m.boomX - 1) : Math.max(-1, g));
      pct = pct3(pct);
      var before = h.value;
      h.value = Math.max(0, Math.round(before * (1 + pct)));
      if (!Array.isArray(h.log)) h.log = [];
      h.log.push(pct);
      var delta = h.value - before;
      if (delta >= 1) f.totals.returned += delta; else if (delta <= -1) f.totals.lost += -delta;
      if (Math.abs(delta) >= 1) ledger(state, 'RETURN', h.name + ' ' + fmtPct(pct), delta);
      report.returns.push({ holdingId: h.id, name: h.name, kind: h.kind, pct: pct, delta: delta, value: h.value, bust: bust, boom: !bust && boom });
      if (bust) {
        timeline(state, h.name + ' goes to zero — ' + fmtK(before) + ' gone', IM.bust);
        if (hlRank < 2) { hlRank = 2; hlVars = { name: h.name, money: before / K_PER_M, pct: fmtPct(-1), text: '{last}\'s ' + h.name + ' stake goes to zero: {money} gone' }; }
      } else if (boom) {
        timeline(state, h.name + ' ' + fmtPct(pct) + ' — worth ' + fmtK(h.value), IM.boom);
        if (hlRank < 1) { hlRank = 1; hlVars = { name: h.name, money: delta / K_PER_M, pct: fmtPct(pct), text: '{last}\'s ' + h.name + ' bet pays {pct}: {money} on paper' }; }
      } else if (Math.abs(delta) >= TL.minDelta * scale) {
        timeline(state, h.name + ' ' + fmtPct(pct) + ' (' + (delta > 0 ? '+' : '-') + fmtK(Math.abs(delta)) + ')', IM['return']);
      }
    }

    // 2. lifestyle — the price quoted when the books last closed (the card's number), else the tier at today's scale
    var tier = tierOf(f.lifestyle);
    var quoted = typeof f.planCost === 'number' && f.planCost >= 0 ? Math.round(f.planCost) : null;
    report.lifestyle.cost = quoted !== null ? quoted : Math.round(num(tier.cost, 0) * scale);
    f.planCost = null;                                                                    // re-quoted by Finance.apply at the close
    if (report.lifestyle.cost > 0) Finance.charge(state, report.lifestyle.cost, 'LIFESTYLE', (TIER_LABEL[f.lifestyle] || f.lifestyle) + ' living');

    // 3. upkeep (off what was paid: a college purchase keeps its college upkeep in the NFL)
    var P = catalogue().purchases;
    for (var j = 0; j < f.owned.length; j++) {
      var entry = byId(P, f.owned[j]);
      if (!entry) continue;
      var up = upkeepOf(state, f.owned[j]);
      if (up > 0) { Finance.charge(state, up, 'UPKEEP', entry.name + ' upkeep'); report.upkeep += up; }
    }

    // 4. yearly meter effects
    applyEffects(state, cloneEffects(tier), report.effects);
    for (var k = 0; k < f.owned.length; k++) {
      var own = byId(P, f.owned[k]);
      if (own && own.yearly) applyEffects(state, cloneEffects(own.yearly), report.effects);
    }

    // 5. debt — an overdraft within the grace floor (event costs before any income) is not a debt year
    var grace = Math.round(num(F.debt.grace, 0) * scale);
    if (f.bank < -grace) {
      var debt = -f.bank;
      report.interest = Math.round(debt * F.debt.rate);
      if (report.interest > 0) Finance.charge(state, report.interest, 'DEBT', 'Interest on the overdraft');
      f.debtYears = num(f.debtYears, 0) + 1;
      applyEffects(state, { morale: F.debt.morale }, report.effects);
      f.lifestyle = 'FRUGAL';                                                              // and Finance.apply refuses a dearer plan while the bank is red
      f.planCost = null;
      // the forced sale: after liquidateAfter red years, or as soon as the debt exceeds what could be sold (net worth < 0)
      if (f.debtYears >= F.debt.liquidateAfter || Finance.netWorth(state) < 0) {
        var sellables = [];
        for (var a = 0; a < f.holdings.length; a++) if (num(f.holdings[a].value, 0) > 0) sellables.push({ what: 'HOLDING', id: f.holdings[a].id, name: f.holdings[a].name, value: num(f.holdings[a].value, 0) });
        for (var b = 0; b < f.owned.length; b++) {
          var pe = byId(P, f.owned[b]);
          sellables.push({ what: 'PURCHASE', id: f.owned[b], name: pe ? pe.name : f.owned[b], value: resaleOf(state, f.owned[b]) });
        }
        sellables.sort(function (x, y) { return y.value - x.value || (x.id < y.id ? -1 : 1); });   // largest first, ties by id
        // the smallest asset that clears what is still owed; when none does, the largest — and again until the bank is clear
        while (f.bank < 0 && sellables.length) {
          var owed = -f.bank, pick = -1, s;
          for (s = 0; s < sellables.length; s++) if (sellables[s].value >= owed && (pick < 0 || sellables[s].value < sellables[pick].value)) pick = s;
          if (pick < 0) pick = 0;
          var it = sellables.splice(pick, 1)[0];
          if (it.what === 'HOLDING') {
            for (var hi = 0; hi < f.holdings.length; hi++) if (f.holdings[hi].id === it.id) { closeHolding(state, f.holdings[hi]); f.holdings.splice(hi, 1); break; }
          } else {
            f.owned.splice(f.owned.indexOf(it.id), 1);
            if (f.paid) delete f.paid[it.id];
          }
          Finance.deposit(state, it.value, 'LIQUIDATION', 'Forced sale: ' + it.name);
          report.liquidated.push(it);
        }
        if (report.liquidated.length) {
          var names = [];
          for (var n = 0; n < report.liquidated.length; n++) names.push(report.liquidated[n].name);
          timeline(state, 'The bank calls: forced sale of ' + names.join(', '), IM.liquidation);
          hlRank = 3;
          hlVars = { name: names[0], money: report.liquidated[0].value / K_PER_M, pct: fmtPct(-1), text: 'The bank comes for {last}: ' + names.join(', ') + ' sold to cover the overdraft' };
        }
      }
    } else {
      f.debtYears = 0;
    }
    report.broke = f.bank < -grace;                                                       // the year closed in the red (past the grace floor)

    // 6. bookkeeping
    f.lastTick = state.year;
    peak(state);
    if (hlVars) headline(state, child, hlVars);                                            // child 1 (at most once per tick)
    report.bank = f.bank;
    report.netWorth = Finance.netWorth(state);
    return report;
  };

  // ═══════════════════════════════ opportunities ═══════════════════════════════

  /**
   * This year's investment pitches: Tuning.finance.invest.perYear distinct catalogue entries, weighted by entry.weight,
   * gated by entry.leagues (missing = both) and entry.minFame. Amounts are scaled to the league. Pure given the fork.
   * Draws: exactly 1 parent draw (rng.fork('finance:opps:<year>')).
   * @param {Object} state @param {RNG} rng
   * @returns {{oppId:string, name:string, kind:string, risk:string, pitch:string, min:number, max:number, model:Object, source:string}[]}
   */
  Finance.opportunities = function (state, rng) {
    var child = rng.fork('finance:opps:' + state.year);                                    // 1 parent draw
    var scale = Finance.scale(state), league = leagueOf(state), fame = num(state.player && state.player.fame, 0);
    var pool = [], all = catalogue().investments;
    for (var i = 0; i < all.length; i++) {
      var e = all[i];
      if (!e || typeof e.id !== 'string') continue;
      if (Array.isArray(e.leagues) && e.leagues.indexOf(league) < 0) continue;
      if (typeof e.minFame === 'number' && fame < e.minFame) continue;
      if (num(e.weight, 1) <= 0) continue;
      pool.push(e);
    }
    var out = [], n = Math.min(T().invest.perYear, pool.length);
    for (var k = 0; k < n && pool.length; k++) {
      var pick = child.weighted(pool, function (x) { return num(x.weight, 1); });
      pool.splice(pool.indexOf(pick), 1);
      var m = pick.model || T().invest.models[pick.risk] || T().invest.models.MED;
      out.push({
        oppId: pick.id, name: String(pick.name || pick.id), kind: has(HOLDING_KINDS, pick.kind) ? pick.kind : 'BUSINESS',
        risk: has(RISKS, pick.risk) ? pick.risk : 'MED', pitch: String(pick.pitch || ''), source: String(pick.source || 'AGENT'),
        min: Math.max(1, Math.round(num(pick.min, 5) * scale)), max: Math.max(1, Math.round(num(pick.max, 50) * scale)),
        model: { mean: num(m.mean, 0), sd: num(m.sd, 0), bust: num(m.bust, 0), boom: num(m.boom, 0), boomX: num(m.boomX, 1) }
      });
    }
    return out;
  };

  // ═══════════════════════════════ the FINANCES decision ═══════════════════════════════

  function lastPctOf(h) { return Array.isArray(h.log) && h.log.length ? h.log[h.log.length - 1] : null; }
  function incomeThisYear(f, year) {
    var s = 0;
    for (var i = 0; i < f.ledger.length; i++) if (f.ledger[i].year === year && f.ledger[i].kind === 'INCOME') s += f.ledger[i].delta;
    return s;
  }

  /**
   * Build the FINANCES decision for the offseason wizard: the tick report, the lifestyle tiers at this scale, the
   * purchases (owned / affordable), the three services, this year's pitches, the holdings and the last 12 ledger rows.
   * Options: DONE first ('Close the books'), then SKIP — so Engine.settlePending / autoplay spend nothing.
   * Draws: 2 (Finance.tick 1 + Finance.opportunities 1); 1 when the year was already ticked.
   * @param {Object} state @param {RNG} rng @returns {{kind:'FINANCES', payload:Object, options:Object[]}}
   */
  Finance.decision = function (state, rng) {
    var f = fin(state);
    var report = Finance.tick(state, rng);                                                 // 1 draw (0 when ticked)
    var opps = Finance.opportunities(state, rng);                                          // 1 draw
    var scale = Finance.scale(state), league = leagueOf(state), C = catalogue(), F = T();
    var tiers = [];
    for (var i = 0; i < TIERS.length; i++) {
      var t = tierOf(TIERS[i]);
      tiers.push({ id: TIERS[i], label: TIER_LABEL[TIERS[i]], cost: Math.round(num(t.cost, 0) * scale), effects: cloneEffects(t), text: TIER_TEXT[TIERS[i]] });
    }
    var purchases = [];
    for (var j = 0; j < C.purchases.length; j++) {
      var e = C.purchases[j];
      if (!e || typeof e.id !== 'string') continue;
      if (Array.isArray(e.leagues) && e.leagues.indexOf(league) < 0) continue;
      var price = Math.round(num(e.price, 0) * scale), owned = has(f.owned, e.id);
      purchases.push({ id: e.id, name: String(e.name || e.id), price: price, upkeep: owned ? upkeepOf(state, e.id) : Math.round(num(e.upkeep, 0) * scale),
        effects: cloneEffects(e.effects), yearly: cloneEffects(e.yearly), text: String(e.text || ''), icon: e.icon || 'money',
        owned: owned, affordable: !owned && price <= f.bank, resale: owned ? resaleOf(state, e.id) : Math.round(price * F.resale) });
    }
    var services = [];
    for (var k = 0; k < C.services.length; k++) {
      var s = C.services[k];
      if (!s || typeof s.id !== 'string') continue;
      var sp = Math.round(num(s.price, 0) * scale);
      services.push({ id: s.id, name: String(s.name || s.id), price: sp, text: String(s.text || ''), effect: String(s.effect || ''),
        active: has(f.services, s.id), affordable: !has(f.services, s.id) && sp <= f.bank });
    }
    var holdings = [];
    for (var h = 0; h < f.holdings.length; h++) {
      var x = f.holdings[h];
      holdings.push({ id: x.id, oppId: x.oppId, name: x.name, kind: x.kind, risk: x.risk, invested: x.invested, value: x.value, year: x.year,
        lastPct: lastPctOf(x), log: (x.log || []).slice(), dead: num(x.value, 0) <= 0 });
    }
    var payload = {
      bank: f.bank, netWorth: Finance.netWorth(state), scale: scale, league: league, income: incomeThisYear(f, state.year),
      report: report, lifestyle: { current: f.lifestyle, tiers: tiers }, purchases: purchases, services: services,
      opportunities: opps, holdings: holdings, ledger: Util.deepClone(f.ledger.slice(-12)), debtYears: num(f.debtYears, 0),
      totals: Util.deepClone(f.totals)
    };
    return { kind: 'FINANCES', payload: payload, options: [
      option('DONE', 'Close the books', 'Keep the plan as it is'),
      option('SKIP', 'Not now', 'Same as closing the books')
    ] };
  };

  /**
   * Apply the player's staged actions to a FINANCES decision, in the order sell → lifestyle → services → buy → invest,
   * re-checking affordability against the running bank at every step. Anything unaffordable or invalid is skipped
   * (receipt.skipped [{what, id, reason}]) — nothing here throws for a user-level problem; only a decision that is
   * not FINANCES does. The lifestyle choice is the plan for the coming year (charged at the next tick, not now) and a
   * dearer plan is refused while the bank is red ('in debt — clear the overdraft first'); whatever the plan, it is
   * quoted at today's scale into finance.planCost so the next tick charges the price the card showed; services are
   * charged now and applied when the season opens (Finance.applyServices); purchases charge the price, apply their
   * one-off meter effects now and make the timeline when the price is at least Tuning.finance.timeline.minDelta ×
   * scale; investments are integers clamped to the pitch's [min, max] (the pitch itself sanitised: min ≥ 1, max ≥ min,
   * kind / risk from the enums) and can never overdraw the bank; a sale deposits the holding's value and removes it.
   * Draws: 0.
   * @param {Object} state @param {RNG} rng (unused; kept for the handler signature)
   * @param {{kind:string, payload:Object}} dec the pending FINANCES decision
   * @param {{lifestyle?:string, buy?:string[], services?:string[], invest?:{oppId:string, amount:number}[], sell?:string[]}} [actions]
   * @returns {{applied:Object[], skipped:Object[], bankAfter:number, netWorthAfter:number}}
   */
  Finance.apply = function (state, rng, dec, actions) {
    if (!dec || dec.kind !== 'FINANCES') fail('apply', 'not a FINANCES decision');
    actions = actions && typeof actions === 'object' ? actions : {};
    var f = fin(state), pl = dec.payload || {}, C = catalogue(), F = T(), scale = Finance.scale(state), league = leagueOf(state);
    var receipt = { applied: [], skipped: [], bankAfter: 0, netWorthAfter: 0 };
    function skip(what, id, reason) { receipt.skipped.push({ what: what, id: id, reason: reason }); }
    var i, id;

    // sell
    var sells = Array.isArray(actions.sell) ? actions.sell : [];
    for (i = 0; i < sells.length; i++) {
      id = sells[i];
      var hi = -1;
      for (var q = 0; q < f.holdings.length; q++) if (f.holdings[q].id === id) { hi = q; break; }
      if (hi < 0) { skip('sell', id, 'no such holding'); continue; }
      var h = f.holdings[hi];
      closeHolding(state, h);
      f.holdings.splice(hi, 1);
      var row = Finance.deposit(state, num(h.value, 0), 'SELL', (num(h.value, 0) > 0 ? 'Sold ' : 'Wrote off ') + h.name);
      receipt.applied.push({ what: 'sell', id: id, name: h.name, delta: row.delta, invested: h.invested, value: h.value });
    }

    // lifestyle (the plan for the coming year — charged at the next tick; never a dearer one while the bank is red)
    if (actions.lifestyle !== undefined && actions.lifestyle !== null) {
      if (!has(TIERS, actions.lifestyle)) skip('lifestyle', actions.lifestyle, 'unknown tier');
      else if (f.bank < 0 && num(tierOf(actions.lifestyle).cost, 0) > num(tierOf(f.lifestyle).cost, 0)) skip('lifestyle', actions.lifestyle, 'in debt — clear the overdraft first');
      else if (actions.lifestyle !== f.lifestyle) {
        var from = f.lifestyle;
        f.lifestyle = actions.lifestyle;
        receipt.applied.push({ what: 'lifestyle', id: actions.lifestyle, from: from, cost: Math.round(num(tierOf(actions.lifestyle).cost, 0) * scale) });
      }
    }
    quotePlan(state);                                                                     // the card's price is the price charged at the next tick

    // services (charged now, applied at Season.start)
    var svcs = Array.isArray(actions.services) ? actions.services : [];
    for (i = 0; i < svcs.length; i++) {
      id = svcs[i];
      var s = byId(C.services, id);
      if (!s || !has(SERVICE_IDS, id)) { skip('service', id, 'no such service'); continue; }
      if (has(f.services, id)) { skip('service', id, 'already booked'); continue; }
      var sp = Math.round(num(s.price, 0) * scale);
      if (sp > f.bank) { skip('service', id, 'not enough in the bank'); continue; }
      var srow = Finance.charge(state, sp, 'SERVICE', s.name || id);
      f.services.push(id);
      receipt.applied.push({ what: 'service', id: id, name: s.name || id, delta: srow.delta });
    }

    // buy
    var buys = Array.isArray(actions.buy) ? actions.buy : [];
    for (i = 0; i < buys.length; i++) {
      id = buys[i];
      var e = byId(C.purchases, id);
      if (!e) { skip('buy', id, 'no such purchase'); continue; }
      if (has(f.owned, id)) { skip('buy', id, 'already owned'); continue; }
      if (Array.isArray(e.leagues) && e.leagues.indexOf(league) < 0) { skip('buy', id, 'not available in ' + league); continue; }
      var price = Math.round(num(e.price, 0) * scale);
      if (price > f.bank) { skip('buy', id, 'not enough in the bank'); continue; }
      var prow = Finance.charge(state, price, 'PURCHASE', e.name || id);
      f.owned.push(id);
      f.paid = f.paid || {};
      f.paid[id] = price;
      var eff = applyEffects(state, cloneEffects(e.effects), {});
      if (price >= F.timeline.minDelta * scale) timeline(state, 'Bought ' + (e.name || id) + ' (' + fmtK(price) + ')', F.timeline.impact.purchase);
      receipt.applied.push({ what: 'buy', id: id, name: e.name || id, delta: prow.delta, effects: eff });
    }

    // invest
    var invs = Array.isArray(actions.invest) ? actions.invest : [], opps = Array.isArray(pl.opportunities) ? pl.opportunities : [], taken = {};
    for (i = 0; i < invs.length; i++) {
      var iv = invs[i] || {};
      var opp = null;
      for (var o = 0; o < opps.length; o++) if (opps[o].oppId === iv.oppId) { opp = opps[o]; break; }
      if (!opp) { skip('invest', iv.oppId, 'not on offer this year'); continue; }
      if (taken[opp.oppId]) { skip('invest', iv.oppId, 'already taken this year'); continue; }
      var amount = Math.round(num(iv.amount, 0));
      if (amount <= 0) { skip('invest', iv.oppId, 'no amount'); continue; }
      // the pitch is sanitised before it is trusted (a hand-edited save can carry anything in the payload)
      var mn = Math.max(1, Math.round(num(opp.min, 1))), mx = Math.max(mn, Math.round(num(opp.max, mn)));
      amount = clamp(amount, mn, mx);
      if (amount > f.bank) { skip('invest', iv.oppId, 'not enough in the bank'); continue; }
      var oname = String(opp.name || opp.oppId);
      var irow = Finance.charge(state, amount, 'INVEST', oname);
      var hid = 'h' + f.nextId++;
      f.holdings.push({ id: hid, oppId: String(opp.oppId), name: oname, kind: has(HOLDING_KINDS, opp.kind) ? opp.kind : 'BUSINESS',
        risk: has(RISKS, opp.risk) ? opp.risk : 'MED', invested: amount, value: amount, year: state.year, log: [] });
      taken[opp.oppId] = true;
      receipt.applied.push({ what: 'invest', id: opp.oppId, holdingId: hid, name: oname, delta: irow.delta, amount: amount });
    }

    peak(state);
    receipt.bankAfter = f.bank;
    receipt.netWorthAfter = Finance.netWorth(state);
    return receipt;
  };

  // ═══════════════════════════════ summary & services ═══════════════════════════════

  /**
   * The money line for the hub and the legacy report: bank, net worth, what is owned, the plan, and the best / worst
   * investment (live holdings and closed ones, by total return). Pure, 0 draws.
   * @param {Object} state
   * @returns {{bank:number, netWorth:number, holdingsValue:number, owned:string[], lifestyle:string, best:Object|null, worst:Object|null, totals:Object, debt:boolean}}
   */
  Finance.summary = function (state) {
    var f = fin(state), P = catalogue().purchases, names = [];
    for (var i = 0; i < f.owned.length; i++) { var e = byId(P, f.owned[i]); names.push(e ? e.name : f.owned[i]); }
    var best = null, worst = null;
    function consider(name, pct, kind) {
      if (!best || pct > best.pct) best = { name: name, pct: pct, kind: kind };
      if (!worst || pct < worst.pct) worst = { name: name, pct: pct, kind: kind };
    }
    for (var h = 0; h < f.holdings.length; h++) { var x = f.holdings[h]; if (x.invested > 0) consider(x.name, pct3(x.value / x.invested - 1), x.kind); }
    for (var c = 0; c < f.closed.length; c++) consider(f.closed[c].name, num(f.closed[c].pct, 0), f.closed[c].kind);
    return {
      bank: f.bank, netWorth: Finance.netWorth(state), holdingsValue: holdingsValue(f), owned: names, lifestyle: f.lifestyle,
      best: best, worst: worst, totals: Util.deepClone(f.totals), debt: f.bank < 0
    };
  };

  /**
   * Turn the services bought in the offseason into one-season Modifiers on the player (source 'finance', expires
   * {type:'season', at: state.year} — Season.finishSeason expires them) and clear finance.services. Season.start
   * calls this where the season begins. PRIVATE_COACH: trainMult × Tuning.finance.services.coachTrainMult and
   * +coachXp XP now · PHYSIO: injury × physioInjury · PSYCH: pressure + psychPressure (Kick reads pressure mods
   * additively, so the "×0.85" of the catalogue is expressed as a negative add). A duplicate id (only a hand-edited
   * save carries one) is applied once. Draws: 0.
   * @param {Object} state @returns {{applied:string[], mods:Object[], xp:number}}
   */
  Finance.applyServices = function (state) {
    var f = fin(state), S = T().services, p = state.player, P = Player();
    var out = { applied: [], mods: [], xp: 0 };
    if (!p) { f.services = []; return out; }
    p.mods = p.mods || [];
    var exp = { type: 'season', at: state.year }, seen = {};
    for (var i = 0; i < f.services.length; i++) {
      var id = f.services[i], mod = null;
      if (seen[id]) continue;                                                             // a duplicate id (hand-edited save) never stacks
      seen[id] = true;
      if (id === 'PRIVATE_COACH') {
        mod = { key: 'trainMult', op: 'mul', value: S.coachTrainMult, label: 'Private coach' };
        p.xp = Math.max(0, Math.round(num(p.xp, 0) + S.coachXp));
        out.xp += S.coachXp;
      } else if (id === 'PHYSIO') {
        mod = { key: 'injury', op: 'mul', value: S.physioInjury, label: 'Physio on retainer' };
      } else if (id === 'PSYCH') {
        mod = { key: 'pressure', op: 'add', value: S.psychPressure, label: 'Sports psychologist' };
      }
      if (!mod) continue;
      mod.id = 'finance:' + id + ':' + state.year;
      mod.expires = exp;
      mod.source = 'finance';
      var stored = P && isFn(P.addMod) ? P.addMod(p, mod) : (p.mods.push(mod), mod);
      out.mods.push(stored);
      out.applied.push(id);
    }
    f.services = [];
    return out;
  };

  Finance.TIERS = TIERS.slice();
  Finance.HOLDING_KINDS = HOLDING_KINDS.slice();
  Finance.RISKS = RISKS.slice();
  Finance.LEDGER_KINDS = LEDGER_KINDS.slice();
  Finance.SERVICE_IDS = SERVICE_IDS.slice();
  RTG.Finance = Finance;
})(typeof window !== 'undefined' ? window : globalThis);
