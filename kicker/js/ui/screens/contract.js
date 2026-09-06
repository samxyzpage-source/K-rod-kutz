/**
 * Road to Glory: Kicker — screen 'contract' (SPEC §4.5 contract row, §2.7.7).
 *
 * The pending EXTENSION / FREE_AGENCY (modes FA and MIN) / TAG / CUT_NOTICE / UDFA decisions. Offer cards (AAV,
 * years, guaranteed %, total, team quality stars from the ratings, climate / dome tag, starter guarantee, market /
 * hometown / need tags, the engine's note), the market value line (RTG.Contracts.marketValue, read-only), the
 * agent's advice (a display comparison of the offer to the market value), the team-mood face (5 states from the
 * satisfaction / market read) and the buttons: ACCEPT · COUNTER (once; +10 % AAV or +1 year) · DECLINE for
 * extensions, SIGN / HOMETOWN DISCOUNT / WAIT A ROUND / SIT OUT for free agency, SIGN THE TENDER / RELEASED for the
 * informational kinds. Everything resolves through dispatch('decide', {kind, optionId, extra}).
 * RTG.UI.Screens.proOfferCard is shared with the draft screen's UDFA invites.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Screens = RTG.UI.Screens = RTG.UI.Screens || {};

  function C() { return RTG.UI.C; }
  function K() { return RTG.UI.Kit; }

  var TITLES = { EXTENSION: 'EXTENSION OFFER', FREE_AGENCY: 'FREE AGENCY', TAG: 'FRANCHISE TAG', CUT_NOTICE: 'RELEASED', UDFA: 'CAMP INVITES', MIN: 'VET-MINIMUM OFFERS' };

  /** Pro offer card (FA / UDFA / MIN / extension). opts: {pickLabel, onPick, homeOption, onHome, primary} */
  Screens.proOfferCard = function (state, o, opts) {
    opts = opts || {};
    var c = C(), Kit = K(), t = Kit.team(o.teamId);
    var head = c.el('div', { class: 'row offer-head' }, c.crest(t || o.teamId, 40),
      c.el('div', { class: 'col grow', style: 'gap:2px' },
        c.el('strong', { class: 'offer-name ellipsis', text: o.teamName || Kit.teamName(o.teamId) }),
        c.el('span', { class: 'row row-wrap small' }, Kit.teamStars(t), t ? c.el('span', { class: 'txt-grey', text: (t.conf || '') + (t.div ? ' ' + t.div : '') + (t.city ? ' · ' + t.city : '') }) : null)));
    var money = c.el('div', { class: 'row row-wrap offer-money' },
      Kit.tip(c.el('span', { class: 'big txt-gold num', text: c.fmt.money(Kit.num(o.aav)) + '/yr' }), 'Average annual value'),
      Kit.tip(c.el('span', { class: 'num', text: '× ' + Kit.num(o.years) + ' yr' }), 'Contract length'),
      Kit.tip(c.chip(Math.round(Kit.num(o.gtdPct) * 100) + '% GTD', 'grey'), 'Guaranteed share — paid even if you are cut'),
      Kit.tip(c.chip(c.fmt.money(Kit.num(o.total, Kit.num(o.aav) * Kit.num(o.years))) + ' TOTAL', 'dark'), 'Total value of the deal'));
    var tags = o.tags || [];
    var chips = c.el('div', { class: 'chips mt-1' },
      Kit.tip(c.chip(o.startsK1 ? 'STARTER' : 'CAMP BATTLE', o.startsK1 ? 'mint' : 'red'), o.startsK1 ? 'You start as K1' : 'You arrive as K2 — the camp battle decides'),
      t ? Kit.climateChip(t) : null,
      tags.indexOf('market') >= 0 || (t && t.bigMarket) ? Kit.tip(c.chip('BIG MARKET', 'gold', 'star'), 'Fame ×1.2') : null,
      tags.indexOf('hometown') >= 0 || o.hometown ? Kit.tip(c.chip('HOMETOWN', 'mint', 'home'), 'Your home region — a hometown discount is on the table') : null,
      tags.indexOf('need') >= 0 ? Kit.tip(c.chip('NEEDS A K', 'sky'), 'The current kicker is old, weak or expiring') : null,
      o.type ? Kit.tip(c.chip(o.type, 'grey'), 'Contract type') : null);
    var note = o.note ? c.el('p', { class: 'small txt-grey mt-1', text: o.note }) : null;
    var footer = [];
    if (opts.onPick) footer.push(c.button({ label: opts.pickLabel || 'SIGN', kind: opts.primary === false ? 'secondary' : 'primary', icon: 'check', block: !opts.homeOption, action: 'sign-' + o.id, onClick: function () { opts.onPick(o); } }));
    if (opts.homeOption && opts.onHome) footer.push(Kit.tip(c.button({ label: 'HOMETOWN DISCOUNT', kind: 'secondary', icon: 'home', action: 'sign-' + o.id + '-home', onClick: function () { opts.onHome(o, opts.homeOption); } }), opts.homeOption.detail || ''));
    var card = c.card({ kind: opts.kind || 'flat', class: 'offer-card pro-offer', body: [head, money, chips, note], footer: footer.length ? footer : null });
    card.setAttribute('data-offer', o.id);
    return card;
  };

  function factory(store, params) {
    var c = C(), Kit = K(), R = RTG.UI.Router;
    var el = c.el('div', { class: 'screen scr-contract' });
    var unsub = null, destroyed = false;

    function decision(state) { var pd = state && state.pending; return pd && pd.kind === 'DECISION' ? pd.decision : null; }

    function decide(kind, optionId, extra) {
      var arg = { kind: kind, optionId: optionId };
      if (extra) arg.extra = extra;
      var r = Kit.dispatch(store, 'decide', arg);
      if (r && r.headline && r.headline.text) c.toast(r.headline.text, 'gold', 4500);
      if (r && r.result && r.result.countered) {
        if (r.result.signed) c.toast('Counter accepted!', 'good', 3500);
        else if (r.result.stands) c.toast('Counter rejected — the original offer stands', 'info', 4000);
        else c.toast('Counter rejected — the offer is withdrawn' + (r.result.tagged ? ' · TAGGED' : ''), 'bad', 4000);
      } else if (r && r.result && r.result.declined && r.result.tagged) c.toast('The team used the franchise tag', 'info', 4000);
      return r;
    }

    function market(state) { try { return RTG.Contracts && RTG.Contracts.marketValue ? RTG.Contracts.marketValue(state) : null; } catch (e) { return null; } }

    function moodLevel(state, dec) {
      var pl = dec.payload || {};
      if (dec.kind === 'EXTENSION') { var s = Kit.num(pl.satisfaction, 0.6); return s >= 0.85 ? 4 : s >= 0.72 ? 3 : s >= 0.6 ? 2 : s >= 0.45 ? 1 : 0; }
      if (dec.kind === 'FREE_AGENCY' || dec.kind === 'UDFA') { var n = (pl.offers || []).length; return Math.min(4, n); }
      if (dec.kind === 'TAG') return 1;
      if (dec.kind === 'CUT_NOTICE') return 0;
      return 2;
    }
    function moodLabel(dec) { return dec.kind === 'EXTENSION' ? 'Front office mood' : dec.kind === 'FREE_AGENCY' || dec.kind === 'UDFA' ? 'The market' : 'The team'; }

    function marketCard(state, dec) {
      var mv = market(state), pl = dec.payload || {};
      var rows = [];
      if (mv) {
        rows.push(['MARKET VALUE', Kit.tip(c.el('span', { class: 'txt-gold num', text: c.fmt.money(mv.aav) + '/yr · ' + Math.round(mv.gtdPct * 100) + '% gtd · ' + mv.years + ' yr' }), 'AAV from OVR ' + mv.ovr + ' × age ' + mv.ageMul + ' × fame ' + mv.fameMul.toFixed(2) + ' × market ' + mv.marketMul.toFixed(2) + ' (' + mv.needy + ' teams need a kicker)')]);
      }
      if (typeof pl.marketAav === 'number' && (!mv || pl.marketAav !== mv.aav)) rows.push(['AT THE TIME', c.fmt.money(pl.marketAav) + '/yr']);
      if (typeof pl.satisfaction === 'number') rows.push(['TEAM SATISFACTION', Kit.tip(c.el('span', { class: 'num', text: Math.round(pl.satisfaction * 100) + '%' }), '0.5·FG% + 0.3·trust + 0.2·fans — extensions need 72 %')]);
      if (typeof pl.round === 'number' && dec.kind === 'FREE_AGENCY') rows.push(['ROUND', String(pl.round)]);
      if (state.flags && state.flags.cutFa) rows.push(['NOTE', 'Cut this offseason — market ×0.8']);
      var mood = Kit.moodFace(moodLevel(state, dec), 40, moodLabel(dec));
      return c.card({ kind: 'flat', class: 'market-card', body: c.el('div', { class: 'row row-wrap' }, mood, c.el('div', { class: 'grow' }, c.kv(rows))) });
    }

    function advice(state, dec, offer) {
      var p = state.player, mv = market(state), pl = dec.payload || {};
      var ref = typeof pl.marketAav === 'number' ? pl.marketAav : (mv ? mv.aav : null);
      var lines = [];
      if (offer && ref) {
        var d = (offer.aav - ref) / ref;
        lines.push(d >= 0.05 ? 'Above market by ' + Math.round(d * 100) + '% — take the money.' : d <= -0.08 ? 'Below market by ' + Math.round(-d * 100) + '% — you are worth more.' : 'Right around market value.');
      }
      if (offer && offer.startsK1 === false) lines.push('No starter guarantee: a camp battle awaits.');
      if (offer && offer.startsK1) lines.push('You would start on day one.');
      if (dec.kind === 'EXTENSION' && pl.counter) lines.push('A counter lands about ' + Math.round(Kit.num(pl.counter.p) * 100) + '% of the time; a rejection may pull the offer.');
      if (dec.kind === 'FREE_AGENCY' && (pl.offers || []).length > 1) lines.push('Weigh the starter guarantee against the money — job security starts at 60 for a starter, 35 for a backup.');
      if (dec.kind === 'FREE_AGENCY' && !(pl.offers || []).length) lines.push('Nobody called this round. Waiting can bring a new offer (40 %).');
      var tier = p.agentTier | 0;
      var who = tier ? (p.agentName || 'Your agent') + ' (tier ' + tier + ')' : 'No agent yet — gut feeling';
      return c.el('div', { class: 'row advice' }, Kit.avatar('agent', 32), c.el('div', { class: 'col grow', style: 'gap:0' }, c.el('span', { class: 'small txt-sky', text: who }), c.el('span', { class: 'small', text: lines.join(' ') || 'Read the fine print.' })));
    }

    function extension(state, dec) {
      var pl = dec.payload || {}, o = pl.offer;
      var parts = [marketCard(state, dec)];
      var card = Screens.proOfferCard(state, o, { kind: 'gold' });
      parts.push(card);
      parts.push(c.card({ kind: 'flat', body: advice(state, dec, o) }));
      var opts = dec.options || [];
      var countered = !!pl.countered;
      var buttons = [];
      opts.forEach(function (op) {
        if (op.id === 'ACCEPT') buttons.push(c.button({ label: 'ACCEPT', kind: 'primary', icon: 'check', action: 'accept', onClick: Kit.safe(function () { decide(dec.kind, 'ACCEPT'); c.announce('Extension signed.'); }) }));
        else if (op.id === 'COUNTER') buttons.push(Kit.tip(c.button({ label: countered ? 'COUNTERED' : 'COUNTER', kind: 'secondary', icon: 'money', action: 'counter', disabled: countered, onClick: function () { counterModal(dec); } }), op.detail || ''));
        else if (op.id === 'DECLINE') buttons.push(c.button({ label: 'DECLINE', kind: 'danger', icon: 'x', action: 'decline', onClick: function () { c.confirm({ title: 'Decline the extension?', text: op.detail || 'You test free agency. The team may tag you.', okLabel: 'DECLINE', kind: 'danger' }).onOk(Kit.safe(function () { decide(dec.kind, 'DECLINE'); })); } }));
      });
      parts.push(c.el('div', { class: 'btn-row contract-actions' }, buttons));
      return parts;
    }

    function counterModal(dec) {
      var pl = dec.payload || {}, ct = pl.counter || { aavBump: 0.1, yearBump: 1, p: 0.5 }, o = pl.offer;
      var body = c.el('div', null,
        c.el('p', { class: 'small', text: 'One counter. Acceptance about ' + Math.round(Kit.num(ct.p) * 100) + '%. If they say no, the original offer stands half the time; otherwise it is withdrawn and you hit free agency.' }));
      c.modal({ title: 'COUNTER', body: body, buttons: [
        { label: '+' + Math.round(Kit.num(ct.aavBump) * 100) + '% AAV (' + c.fmt.money(Math.round(Kit.num(o.aav) * (1 + Kit.num(ct.aavBump)) * 10) / 10) + ')', kind: 'primary', onClick: function () { Kit.safe(function () { decide(dec.kind, 'COUNTER', { mode: 'AAV' }); })(); } },
        { label: '+' + Kit.num(ct.yearBump) + ' YEAR (' + (Kit.num(o.years) + Kit.num(ct.yearBump)) + ' yrs)', kind: 'secondary', onClick: function () { Kit.safe(function () { decide(dec.kind, 'COUNTER', { mode: 'YEARS' }); })(); } },
        { label: 'BACK', kind: 'ghost' }
      ] });
    }

    function freeAgency(state, dec) {
      var pl = dec.payload || {}, offers = pl.offers || [], opts = dec.options || [];
      var parts = [marketCard(state, dec)];
      if (pl.mode === 'MIN') parts.push(c.el('p', { class: 'small txt-grey', text: 'Mid-season: one-year deals at the veteran minimum.' }));
      if (pl.ringChase) parts.push(c.el('div', { class: 'banner banner-gold small', text: 'RING CHASE — contenders only' }));
      if (!offers.length) parts.push(c.card({ kind: 'sky', body: c.el('p', { class: 'small', text: 'No offers on the table' + (pl.round > 1 ? ' after round ' + (pl.round - 1) : '') + '.' }) }));
      offers.forEach(function (o) {
        var home = opts.filter(function (x) { return x.offerId === o.id && x.hometownDiscount; })[0];
        parts.push(Screens.proOfferCard(state, o, {
          pickLabel: 'SIGN', onPick: function () { c.confirm({ title: 'Sign with ' + o.teamName + '?', text: Kit.num(o.years) + ' years at ' + c.fmt.money(o.aav) + '/yr · ' + (o.startsK1 ? 'you start' : 'camp battle for the job'), okLabel: 'SIGN' }).onOk(Kit.safe(function () { decide(dec.kind, o.id); c.announce('Signed with ' + o.teamName + '.'); })); },
          homeOption: home || null, onHome: function (offer, opt) { c.confirm({ title: 'Hometown discount?', text: opt.detail || '−8 % AAV · morale +10 · fans +10', okLabel: 'SIGN' }).onOk(Kit.safe(function () { decide(dec.kind, opt.id); })); }
        }));
      });
      parts.push(c.card({ kind: 'flat', body: advice(state, dec, offers[0] || null) }));
      var buttons = [];
      opts.forEach(function (op) {
        if (op.id === 'WAIT') buttons.push(Kit.tip(c.button({ label: op.label.toUpperCase(), kind: 'secondary', icon: 'clock', action: 'wait', onClick: Kit.safe(function () { var r = decide(dec.kind, 'WAIT'); if (r) c.announce('Waited a round.'); }) }), op.detail || ''));
        else if (op.id === 'SIT_OUT') buttons.push(c.button({ label: 'SIT OUT', kind: 'danger', icon: 'x', action: 'sit-out', onClick: function () { c.confirm({ title: 'Sit the year out?', text: op.detail || 'No contract this season.', okLabel: 'SIT OUT', kind: 'danger' }).onOk(Kit.safe(function () { decide(dec.kind, 'SIT_OUT'); })); } }));
      });
      if (buttons.length) parts.push(c.el('div', { class: 'btn-row contract-actions' }, buttons));
      return parts;
    }

    function udfa(state, dec) {
      var pl = dec.payload || {}, offers = pl.offers || [];
      var parts = [marketCard(state, dec), c.el('p', { class: 'small txt-grey', text: 'Undrafted free agent: three years at the minimum, no guarantee, you arrive as K2 and the camp battle decides.' })];
      offers.forEach(function (o) {
        parts.push(Screens.proOfferCard(state, o, { pickLabel: 'SIGN', onPick: function () { Kit.safe(function () { decide('UDFA', o.id); c.announce('Signed with ' + o.teamName + '.'); })(); } }));
      });
      parts.push(c.card({ kind: 'flat', body: advice(state, dec, offers[0] || null) }));
      return parts;
    }

    function info(state, dec) {
      var pl = dec.payload || {}, parts = [marketCard(state, dec)];
      if (dec.kind === 'TAG') {
        parts.push(c.card({ title: 'TAGGED', kind: 'gold', icon: 'flag', body: [c.kv([['TENDER', c.fmt.money(Kit.num(pl.aav)) + ' · 1 year · fully guaranteed'], ['CONSECUTIVE', String(Kit.num(pl.consecutive, pl.tags))], ['MORALE', '−8']]), c.el('p', { class: 'small txt-grey mt-1', text: 'Talks failed, so the team kept you with the franchise tag. Two tags is the maximum; the second one pays 20 % more.' })] }));
      } else if (dec.kind === 'CUT_NOTICE') {
        parts.push(c.card({ title: 'RELEASED', kind: 'red', icon: 'x', body: [c.el('p', { text: pl.text || 'The team released you.' }), c.kv([['REASON', String(pl.reason || '').replace(/_/g, ' ')], ['SEASON FG%', c.fmt.pct(Kit.num(pl.fgPct))], ['OVR', String(Kit.num(pl.ovr))], ['JOB SECURITY', String(Math.round(Kit.num(pl.js)))], pl.deadMoney ? ['DEAD MONEY', c.fmt.money(pl.deadMoney) + ' still paid'] : null].filter(Boolean))] }));
      } else {
        parts.push(c.card({ title: dec.kind.replace(/_/g, ' '), kind: 'gold', body: c.kv(Object.keys(pl).filter(function (k) { return pl[k] === null || typeof pl[k] !== 'object'; }).map(function (k) { return [k.toUpperCase(), String(pl[k])]; })) }));
      }
      var buttons = (dec.options || []).map(function (op, i) { return c.button({ label: op.label.toUpperCase(), kind: i === 0 ? 'primary' : 'secondary', block: true, action: 'opt-' + op.id, title: op.detail, onClick: Kit.safe(function () { decide(dec.kind, op.id); }) }); });
      parts.push(c.el('div', { class: 'btn-row contract-actions' }, buttons));
      return parts;
    }

    function render() {
      if (destroyed) return;
      var state = store.state, dec = decision(state);
      var title = dec ? (dec.kind === 'FREE_AGENCY' && dec.payload && dec.payload.mode === 'MIN' ? TITLES.MIN : (TITLES[dec.kind] || dec.kind.replace(/_/g, ' '))) : 'CONTRACT';
      var parts = [c.el('header', { class: 'screen-head' }, c.el('h1', { class: 'screen-title', text: title }), state ? c.el('div', { class: 'screen-head-right small txt-grey' }, c.el('span', { class: 'num', text: 'Y' + state.year + ' · ' + Kit.calYear(state.year) })) : null)];
      if (!state) { parts.push(c.card({ body: c.el('p', { text: 'No career loaded.' }) })); c.replace(el, parts); return; }
      if (!dec || ['EXTENSION', 'FREE_AGENCY', 'TAG', 'CUT_NOTICE', 'UDFA', 'MIN'].indexOf(dec.kind) < 0) {
        var p = state.player;
        parts.push(c.card({ title: 'YOUR DEAL', kind: 'flat', icon: 'money', body: c.kv([['CONTRACT', Kit.contractText(p.contract)], ['EARNINGS', c.fmt.money(Kit.num(state.history && state.history.earnings))]]), footer: [c.button({ label: 'BACK', kind: 'primary', onClick: function () { R.sync({ force: true }); } })] }));
        c.replace(el, parts);
        return;
      }
      var body;
      if (dec.kind === 'EXTENSION') body = extension(state, dec);
      else if (dec.kind === 'FREE_AGENCY' || dec.kind === 'MIN') body = freeAgency(state, dec);
      else if (dec.kind === 'UDFA') body = udfa(state, dec);
      else body = info(state, dec);
      parts = parts.concat(body);
      c.replace(el, parts);
    }

    render();
    unsub = store.subscribe(function () { render(); });
    return { el: el, destroy: function () { destroyed = true; if (unsub) unsub(); unsub = null; } };
  }

  Screens.contract = factory;
  RTG.UI.Router.register('contract', factory);
})(typeof window !== 'undefined' ? window : globalThis);
