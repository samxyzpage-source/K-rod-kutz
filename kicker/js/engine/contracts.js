/**
 * Road to Glory: Kicker — RTG.Contracts (SPEC §2.7.7, §2.7.10, §3.5.15)
 *
 * Money is in $M with one decimal. Rookie scale, market value (AAV), extensions
 * with one counter, franchise tag, free agency / UDFA / vet-minimum offers,
 * cuts, signing and season payouts. Pure over `state`; every draw comes from
 * the rng passed in. Later modules (Player, Schema, Stats, Career) are resolved
 * AT CALL TIME, never at load time.
 *
 * Draw accounting (binding for replay determinism):
 *   extensionOffer  : years int 1 · aav float 1                     (0 when ineligible → null)
 *   counter         : 1 uniform (accept band, then "offer stands" band of the remainder)
 *   applyTag        : chance 1                                       (0 when ineligible → false)
 *   generateOffers  : count int 1 · per offer: team weighted 1 (+ FA/MIN-with-years: years int 1 · FA: aav float 1)
 *   waitRound       : per existing offer chance 1 · new-offer chance 1 (+ offer draws when it fires)
 *   everything else : 0 draws
 *
 * Contract record (player.contract): {type, years, yearIdx, aav, gtdPct, signingBonus, startYear, round?, paid, paidThrough}
 *   `paid` / `paidThrough` are bookkeeping for payoutSeason (idempotent per season) and dead money on a cut.
 * History record (history.contracts[]): {year, league, teamId, type, years, aav, total, gtdPct, signingBonus, round?, endYear, reason}
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  var Util = RTG.Util, Tuning = RTG.Tuning;
  var Contracts = {};

  var clamp = Util.clamp, round1 = Util.round1;
  var PCT = 100, PER_MILLE = 1000, K_PER_M = 1000;

  // ───────────────────────────── helpers ─────────────────────────────

  /** Tuning.contracts (read at call time so debug tuning applies). */
  function C() { return Tuning.contracts; }

  /** Difficulty row (falls back to pro). */
  function diffRow(state) {
    return Tuning.difficulty[state && state.difficulty] || Tuning.difficulty.pro;
  }

  /** The NFL league object (or null). */
  function nfl(state) {
    return state && state.leagues ? state.leagues.nfl || null : null;
  }

  /** Team lookup inside a league (Schema.teamIn when present, else a scan). */
  function teamIn(league, id) {
    if (!league || !id) return null;
    if (RTG.Schema && typeof RTG.Schema.teamIn === 'function') return RTG.Schema.teamIn(league, id);
    for (var i = 0; i < league.teams.length; i++) if (league.teams[i].id === id) return league.teams[i];
    return null;
  }

  /** User OVR via Player.ovr. */
  function userOvr(state) {
    return RTG.Player.ovr(state.player.attrs);
  }

  /** FG% of a KickerStats block (NaN-safe: 0 attempts → null). */
  function pctOf(stats) {
    if (!stats || !(stats.fga > 0)) return null;
    return stats.fgm / stats.fga;
  }

  /**
   * The FG% the front office judges you on: this season's when it has attempts, else the last
   * completed season line (offseason after Stats.finishSeason reset), else career, else 0.
   */
  function judgedFgPct(state) {
    var st = state.stats || {};
    var p = pctOf(st.season);
    if (p === null) {
      var lines = state.history && state.history.seasons;
      var last = lines && lines.length ? lines[lines.length - 1] : null;
      p = last ? pctOf(last.stats) : null;
    }
    if (p === null) p = pctOf(st.career);
    return p === null ? 0 : p;
  }

  /** Attempts behind judgedFgPct (so a 0-attempt season is never a "performance" cut). */
  function judgedFga(state) {
    var st = state.stats || {};
    if (st.season && st.season.fga > 0) return st.season.fga;
    var lines = state.history && state.history.seasons;
    var last = lines && lines.length ? lines[lines.length - 1] : null;
    if (last && last.stats && last.stats.fga > 0) return last.stats.fga;
    return st.career ? st.career.fga || 0 : 0;
  }

  /** Round to the mean of a [lo, hi] years range. */
  function yearsFromRange(range) {
    return Math.round((range[0] + range[1]) / 2);
  }

  /** Years range row for an age from a `yearsByAge` table. */
  function yearsRangeFor(rows, age) {
    for (var i = 0; i < rows.length; i++) if (age <= rows[i].maxAge) return rows[i].years;
    return rows[rows.length - 1].years;
  }

  /** Soft-stat clamp 0..100. */
  function soft(v) { return clamp(v, Tuning.soft.min, Tuning.soft.max); }

  /** Money formatting for option detail strings. */
  function money(m) { return Util.fmtMoney(m); }

  /** Does a team's kicker slot make it "needy" (§2.7.6)? A team without a K1 is needy. */
  function teamNeedsK(team) {
    var N = C().need;
    var k = team.kicker;
    if (!k) return true;
    return k.age >= N.ageFrom || k.ovr < N.ovrBelow || k.contractYears <= N.yearsLeftMax;
  }

  /** Need weight for FA offer sampling: 1 + one point per need reason, scaled by how weak the incumbent is. */
  function needWeight(team) {
    var N = C().need;
    var k = team.kicker;
    if (!k) return 3;
    var w = 1;
    if (k.age >= N.ageFrom) w += 1;
    if (k.ovr < N.ovrBelow) w += 1 + (N.ovrBelow - k.ovr) / 10;
    if (k.contractYears <= N.yearsLeftMax) w += 1;
    return w;
  }

  /** Average team rating used for cap room. */
  function teamRating(team) {
    return ((team.OFF || 0) + (team.DEF || 0)) / 2;
  }

  /** teamCapRoom01 (§2.7.7): strong rosters have less room. */
  function capRoom01(team) {
    var R = C().fa.capRoom;
    var anchor = Tuning.league.drift.nflAnchor;
    return clamp(1 - R.per * (teamRating(team) - anchor), R.min, R.max);
  }

  /** Hometown-region match between the player and a team. */
  function isHometown(state, team) {
    var h = state.player.hometown;
    return !!(h && h.region && team.region && h.region === team.region);
  }

  /** Last open stint in history.teams (toYear null), or null. */
  function openStint(state) {
    var stints = state.history.teams;
    for (var i = stints.length - 1; i >= 0; i--) if (stints[i].toYear === null || stints[i].toYear === undefined) return stints[i];
    return null;
  }

  /** Last open contract record in history.contracts (endYear null), or null. */
  function openContractRecord(state) {
    var recs = state.history.contracts;
    for (var i = recs.length - 1; i >= 0; i--) if (recs[i].endYear === null || recs[i].endYear === undefined) return recs[i];
    return null;
  }

  // ───────────────────────────── §2.7.7 market value ─────────────────────────────

  /**
   * Age multiplier: ≤31 1.00 · 32–34 0.90 · 35–37 0.75 · 38+ 0.55.
   * @param {number} age @returns {number}
   */
  Contracts.ageMul = function (age) {
    var rows = C().aav.ageMul;
    for (var i = 0; i < rows.length; i++) if (age <= rows[i].maxAge) return rows[i].mult;
    return rows[rows.length - 1].mult;
  };

  /**
   * Fame multiplier: 0.92 + 0.16·fame/1000.
   * @param {number} fame 0..1000 @returns {number}
   */
  Contracts.fameMul = function (fame) {
    var A = C().aav;
    return A.fameBase + A.famePer * clamp(fame || 0, 0, Tuning.soft.fame.max) / PER_MILLE;
  };

  /**
   * Market multiplier from league-wide need: clamp(1 + 0.06·(teamsNeedingK − 6)/6, 0.90, 1.12).
   * @param {number} needy number of teams needing a kicker @returns {number}
   */
  Contracts.marketMul = function (needy) {
    var M = C().aav.market;
    return clamp(1 + M.per * (needy - M.anchor) / M.div, M.min, M.max);
  };

  /**
   * Guaranteed share of a deal: clamp(0.35 + 0.30·(OVR − 70)/30, 0.10, 0.80), 2 decimals.
   * @param {number} ovr @returns {number}
   */
  Contracts.gtdPct = function (ovr) {
    var G = C().gtd;
    return Util.roundN(clamp(G.base + G.per * (ovr - G.ovrFrom) / G.div, G.min, G.max), 2);
  };

  /**
   * Pure AAV formula (§2.7.7), unrounded:
   *   clamp(max(vetMin, base + per·max(0, OVR − 60)^1.35) · ageMul · fameMul · marketMul · contractMult, vetMin, 8.0)
   * Worked values at fame 0 / age ≤ 31 / marketMul 1 / Pro: 75 → 3.0 · 85 → 5.1 · 92 → 6.8 · 99 → 8.0 (cap).
   * @param {number} ovr
   * @param {{age?:number, fame?:number, marketMul?:number, needy?:number, contractMult?:number, vetMin?:number, scale?:number}} [opts]
   *   `scale` multiplies the market term (cut players: Tuning.contracts.cut.marketMul).
   * @returns {number}
   */
  Contracts.aavFor = function (ovr, opts) {
    opts = opts || {};
    var A = C().aav;
    var vetMin = typeof opts.vetMin === 'number' ? opts.vetMin : C().vetMinStart;
    var age = typeof opts.age === 'number' ? opts.age : 0;
    var fame = typeof opts.fame === 'number' ? opts.fame : 0;
    var marketMul = typeof opts.marketMul === 'number' ? opts.marketMul
      : Contracts.marketMul(typeof opts.needy === 'number' ? opts.needy : A.market.anchor);
    marketMul *= typeof opts.scale === 'number' ? opts.scale : 1;
    var contractMult = typeof opts.contractMult === 'number' ? opts.contractMult : 1;
    var base = Math.max(vetMin, A.base + A.per * Math.pow(Math.max(0, ovr - A.ovrFrom), A.exp));
    return clamp(base * Contracts.ageMul(age) * Contracts.fameMul(fame) * marketMul * contractMult, vetMin, A.max);
  };

  /**
   * The player's market value (§2.7.7): AAV (1 decimal), guaranteed %, and a default term by age.
   * A player cut this offseason (state.flags.cutFa) carries marketMul ×0.8.
   * @param {Object} state CareerState
   * @param {{ovr?:number, age?:number, fame?:number, needy?:number, scale?:number}} [opts] overrides (tests / previews)
   * @returns {{aav:number, gtdPct:number, years:number, ovr:number, ageMul:number, fameMul:number, marketMul:number, needy:number, vetMin:number, raw:number}}
   */
  Contracts.marketValue = function (state, opts) {
    opts = opts || {};
    var p = state.player;
    var L = nfl(state);
    var ovr = typeof opts.ovr === 'number' ? opts.ovr : userOvr(state);
    var age = typeof opts.age === 'number' ? opts.age : p.age;
    var fame = typeof opts.fame === 'number' ? opts.fame : p.fame;
    var needy = typeof opts.needy === 'number' ? opts.needy : Contracts.teamsNeedingK(L).length;
    var vetMin = L && typeof L.vetMin === 'number' ? L.vetMin : C().vetMinStart;
    var scale = typeof opts.scale === 'number' ? opts.scale : (state.flags && state.flags.cutFa ? C().cut.marketMul : 1);
    var marketMul = Contracts.marketMul(needy) * scale;
    var raw = Contracts.aavFor(ovr, {
      age: age, fame: fame, marketMul: marketMul, contractMult: diffRow(state).contractMult, vetMin: vetMin
    });
    return {
      aav: round1(raw), gtdPct: Contracts.gtdPct(ovr), years: yearsFromRange(yearsRangeFor(C().extension.yearsByAge, age)),
      ovr: ovr, ageMul: Contracts.ageMul(age), fameMul: Contracts.fameMul(fame), marketMul: marketMul, needy: needy,
      vetMin: vetMin, raw: raw
    };
  };

  /**
   * Rookie-scale contract (§2.7.7). Rounds 1, 3–7 from the table; 'UDFA' / 0 / null → the 3-year UDFA deal;
   * an unlisted round (2) uses the nearest listed round below it in the table order (→ 3).
   * Signing bonus = signingBonusPct of the total, paid in year 1.
   * @param {number|'UDFA'|null} round @param {number} [startYear=0] career year the deal starts
   * @returns {Object} Contract
   */
  Contracts.rookieDeal = function (round, startYear) {
    var R = C().rookie;
    var udfa = round === 'UDFA' || round === 0 || round === null || round === undefined;
    var row = udfa ? null : R.byRound[round];
    if (!udfa && !row) {
      var listed = Object.keys(R.byRound).map(Number).sort(function (a, b) { return a - b; });
      var pick = listed[listed.length - 1];
      for (var i = 0; i < listed.length; i++) if (listed[i] >= round) { pick = listed[i]; break; }
      round = pick; row = R.byRound[pick];
    }
    var years = udfa ? R.udfa.years : R.years;
    var aav = udfa ? R.udfa.aav : row.aav;
    var gtd = udfa ? R.udfa.gtd : row.gtd;
    return {
      type: udfa ? 'UDFA' : 'ROOKIE', years: years, yearIdx: 0, aav: aav, gtdPct: gtd,
      signingBonus: round1(C().signingBonusPct * aav * years), startYear: startYear || 0,
      round: udfa ? 0 : round, paid: 0, paidThrough: -1
    };
  };

  /**
   * Franchise tag value for a league year: 6.0·1.05^(year − 1) ($M, 1 decimal). The second consecutive
   * tag's ×1.2 is applied by applyTag.
   * @param {{year?:number}} league NFL League (uses league.year, default 1) @returns {number}
   */
  Contracts.tagValue = function (league) {
    var T = C().tag;
    var year = league && typeof league.year === 'number' ? league.year : 1;
    return round1(T.base * Math.pow(T.growth, Math.max(0, year - 1)));
  };

  /**
   * Team satisfaction (§2.7.7): 0.5·seasonFGpct + 0.3·trust/100 + 0.2·fans/100.
   * @param {Object} state @returns {number} 0..1
   */
  Contracts.teamSatisfaction = function (state) {
    var S = C().extension.satisfaction;
    var p = state.player;
    return S.fgW * judgedFgPct(state) + S.trustW * p.trust / PCT + S.fansW * p.fans / PCT;
  };

  /**
   * Teams whose kicker slot is a need (§2.7.6): `kicker.age ≥ 34` or `kicker.ovr < 72` or `contractYears ≤ 1`
   * (a team with no K1 counts as needy).
   * @param {Object|null} league @returns {Object[]} Team[]
   */
  Contracts.teamsNeedingK = function (league) {
    if (!league || !league.teams) return [];
    return league.teams.filter(teamNeedsK);
  };

  /**
   * Is the player in the final year of a contract (yearIdx = years − 1)?
   * @param {Object} state @returns {boolean}
   */
  Contracts.inFinalYear = function (state) {
    var c = state.player.contract;
    return !!c && c.yearIdx >= c.years - 1;
  };

  // ───────────────────────────── offers ─────────────────────────────

  /** A short "why us" note for an offer card. */
  function offerNote(state, team, offer) {
    var parts = [];
    var k = team.kicker;
    if (!k) parts.push('no kicker on the roster');
    else if (k.age >= C().need.ageFrom) parts.push('incumbent is ' + k.age);
    else if (k.ovr < C().need.ovrBelow) parts.push('incumbent rated ' + k.ovr);
    else if (k.contractYears <= C().need.yearsLeftMax) parts.push('incumbent expiring');
    else parts.push('competition for the job');
    parts.push(team.dome ? 'dome' : team.climate + ' climate');
    if (team.bigMarket) parts.push('big market');
    if (offer.hometown) parts.push('near home');
    return parts.join(' · ');
  }

  /** Tags for an offer card. */
  function offerTags(state, team, offer) {
    var tags = [];
    if (team.dome) tags.push('dome');
    if (team.bigMarket) tags.push('market');
    if (offer.hometown) tags.push('hometown');
    if (offer.startsK1) tags.push('K1');
    if (teamNeedsK(team)) tags.push('need');
    return tags;
  }

  /**
   * Build one offer from a team. Draws: FA → years int 1 · aav float 1; MIN/UDFA → 0.
   * @param {Object} state @param {RNG} rng @param {Object} team @param {'FA'|'UDFA'|'MIN'} mode @param {Object} mv marketValue @param {number} idx
   * @returns {Object} offer
   */
  function buildOffer(state, rng, team, mode, mv, idx) {
    var F = C().fa;
    var ovr = mv.ovr;
    var offer = {
      id: 'OFFER_' + idx, teamId: team.id, teamName: team.name, type: 'VET', years: 1, aav: 0, gtdPct: 0,
      startsK1: !team.kicker || team.kicker.ovr <= ovr || team.kicker.contractYears <= 0,
      hometown: isHometown(state, team), hometownDiscount: false, note: '', tags: [], total: 0
    };
    if (mode === 'UDFA') {
      var deal = Contracts.rookieDeal('UDFA', state.year);
      offer.type = 'UDFA'; offer.years = deal.years; offer.aav = deal.aav; offer.gtdPct = deal.gtdPct; offer.round = 0;
      offer.startsK1 = false;                                    // camp battle decides
    } else if (mode === 'MIN') {
      offer.type = 'MIN'; offer.years = 1; offer.aav = round1(mv.vetMin); offer.gtdPct = 0;
    } else {
      var range = yearsRangeFor(F.yearsByAge, state.player.age);
      offer.years = rng.int(range[0], range[1]);                                          // draw: years
      var u = rng.float(F.aavRange[0], F.aavRange[1]);                                    // draw: aav factor
      offer.aav = Math.max(mv.vetMin, round1(mv.aav * u * capRoom01(team)));
      offer.gtdPct = mv.gtdPct;
    }
    offer.total = round1(offer.aav * offer.years);
    offer.note = offerNote(state, team, offer);
    offer.tags = offerTags(state, team, offer);
    return offer;
  }

  /** Candidate pool for a mode; needy teams by default (UDFA pads with the weakest kicker slots). */
  function offerPool(state, mode, exclude, opts) {
    var L = nfl(state);
    if (!L) return [];
    var pool;
    if (opts && opts.ringChase) {
      pool = L.teams.slice().sort(function (a, b) { return teamRating(b) - teamRating(a); }).slice(0, C().retirement.ringChaseTopN);
    } else {
      pool = Contracts.teamsNeedingK(L);
    }
    if (mode === 'UDFA') {
      var need = Tuning.draft.udfaInvites[1];
      if (pool.length < need) {
        var rest = L.teams.filter(function (t) { return pool.indexOf(t) < 0; })
          .sort(function (a, b) { return (a.kicker ? a.kicker.ovr : 0) - (b.kicker ? b.kicker.ovr : 0); });
        pool = pool.concat(rest.slice(0, need - pool.length));
      }
    }
    return pool.filter(function (t) { return exclude.indexOf(t.id) < 0; });
  }

  /** Weight for the weighted team pick: need × hometown bonus. */
  function poolWeight(state) {
    var F = C().fa;
    return function (team) { return needWeight(team) * (isHometown(state, team) ? F.hometownWeight : 1); };
  }

  /** Decision option rows for an offer list (+ hometown variants, + WAIT). */
  function offerOptions(state, offers, mode) {
    var F = C().fa;
    var options = [];
    for (var i = 0; i < offers.length; i++) {
      var o = offers[i];
      options.push({
        id: o.id, offerId: o.id, hometownDiscount: false,
        label: o.teamName + ' — ' + o.years + ' yr · ' + money(o.aav) + '/yr',
        detail: Math.round(o.gtdPct * PCT) + ' % gtd · ' + (o.startsK1 ? 'starts K1' : 'camp battle') + ' · ' + o.note
      });
      if (o.hometown && mode !== 'UDFA') {
        options.push({
          id: o.id + '_HOME', offerId: o.id, hometownDiscount: true,
          label: o.teamName + ' — hometown discount',
          detail: '−' + Math.round(F.hometownDiscount * PCT) + ' % AAV (' + money(round1(o.aav * (1 - F.hometownDiscount))) + '/yr) · morale +' +
            F.hometownMorale + ' · fans +' + F.hometownFans
        });
      }
    }
    if (mode !== 'UDFA') {
      options.push({
        id: 'WAIT', label: offers.length ? 'Wait a round' : 'Keep waiting',
        detail: 'Each offer may be withdrawn (' + Math.round(F.withdrawProb * PCT) + ' %); a new one may appear (' +
          Math.round(F.newOfferProb * PCT) + ' %)'
      });
    }
    return options;
  }

  /**
   * Generate contract offers (§2.7.7 / §2.7.6 UDFA) as a Decision (the caller sets state.pending).
   *   'FA'   → 1–4 offers from needy teams (weighted by need, hometown region ×1.5), aav = AAV·U(0.85, 1.10)·capRoom01
   *   'UDFA' → 2–3 camp invites on the UDFA scale
   *   'MIN'  → 0–2 one-year vet-minimum offers (mid-season cut; opts.ringChase = top-5 teams for "Ring chase")
   * Draws: count int 1 · per offer: team weighted 1 (+ FA: years int 1, aav float 1). Fewer offers when the pool is short.
   * @param {Object} state @param {RNG} rng @param {'FA'|'UDFA'|'MIN'} mode @param {{ringChase?:boolean, exclude?:string[]}} [opts]
   * @returns {Object} Decision {kind:'FREE_AGENCY'|'UDFA', payload:{mode, offers, round, marketAav, hometownRegion}, options}
   */
  Contracts.generateOffers = function (state, rng, mode, opts) {
    opts = opts || {};
    mode = mode === 'UDFA' || mode === 'MIN' ? mode : 'FA';
    var F = C().fa;
    var range = mode === 'UDFA' ? Tuning.draft.udfaInvites : (mode === 'MIN' ? F.minOffers : [F.offersMin, F.offersMax]);
    var count = rng.int(range[0], range[1]);                                              // draw 1: count
    var mv = Contracts.marketValue(state);
    var exclude = (opts.exclude || []).slice();
    var pool = offerPool(state, mode, exclude, opts);
    var weight = poolWeight(state);
    var offers = [];
    for (var i = 0; i < count && pool.length; i++) {
      var team = rng.weighted(pool, weight);                                              // draw: team
      pool.splice(pool.indexOf(team), 1);
      offers.push(buildOffer(state, rng, team, mode, mv, offers.length));
    }
    return {
      kind: mode === 'UDFA' ? 'UDFA' : 'FREE_AGENCY',
      payload: {
        mode: mode, offers: offers, round: 1, marketAav: mv.aav, marketGtdPct: mv.gtdPct,
        hometownRegion: state.player.hometown ? state.player.hometown.region : null, ringChase: !!opts.ringChase
      },
      options: offerOptions(state, offers, mode)
    };
  };

  /**
   * Wait one free-agency round (§2.7.7): each existing offer is withdrawn with p 0.35, a new offer appears
   * with p 0.4 (from teams not already offering). Mutates and returns the decision.
   * Draws: per offer chance 1 · new-offer chance 1 (+ team weighted 1, FA years 1, aav 1 when it fires).
   * @param {Object} state @param {RNG} rng @param {Object} decision from generateOffers @returns {Object} decision
   */
  Contracts.waitRound = function (state, rng, decision) {
    var F = C().fa;
    var pl = decision.payload;
    var mode = pl.mode || 'FA';
    var kept = [];
    for (var i = 0; i < pl.offers.length; i++) {
      if (!rng.chance(F.withdrawProb)) kept.push(pl.offers[i]);                           // draw per offer
    }
    var exclude = kept.map(function (o) { return o.teamId; });
    if (rng.chance(F.newOfferProb)) {                                                       // draw: new offer?
      var pool = offerPool(state, mode, exclude, pl);
      if (pool.length) {
        var team = rng.weighted(pool, poolWeight(state));                                   // draw: team
        kept.push(buildOffer(state, rng, team, mode, Contracts.marketValue(state), kept.length));
      }
    }
    for (var j = 0; j < kept.length; j++) kept[j].id = 'OFFER_' + j;
    pl.offers = kept;
    pl.round = (pl.round || 1) + 1;
    decision.options = offerOptions(state, kept, mode);
    return decision;
  };

  /**
   * The offer behind a decision option (hometown variants return a copy flagged `hometownDiscount`).
   * @param {Object} decision @param {string} optionId @returns {Object|null} offer
   */
  Contracts.offerFor = function (decision, optionId) {
    var opt = null;
    for (var i = 0; i < decision.options.length; i++) if (decision.options[i].id === optionId) { opt = decision.options[i]; break; }
    if (!opt || !opt.offerId) return null;
    var offers = decision.payload.offers || [];
    for (var j = 0; j < offers.length; j++) {
      if (offers[j].id === opt.offerId) {
        var o = Util.deepClone(offers[j]);
        o.hometownDiscount = !!opt.hometownDiscount;
        return o;
      }
    }
    return null;
  };

  // ───────────────────────────── extension / counter / tag ─────────────────────────────

  /**
   * Extension eligibility (§2.7.7): NFL, final contract year, teamSatisfaction ≥ 0.72, js ≥ 50.
   * @param {Object} state @returns {boolean}
   */
  Contracts.extensionEligible = function (state) {
    var p = state.player;
    var E = C().extension;
    if (p.league !== 'NFL' || !p.contract || !p.teamId) return false;
    if (!Contracts.inFinalYear(state)) return false;
    return Contracts.teamSatisfaction(state) >= E.satisfaction.min && p.js >= E.jsMin;
  };

  /**
   * The team's one extension offer as a Decision, or null when ineligible (§2.7.7).
   * years by age (≤28: 4–5, 29–32: 2–4, 33+: 1–2), aav = AAV·U(0.90, 1.05), gtdPct from OVR.
   * Draws: years int 1 · aav float 1 (none when null).
   * @param {Object} state @param {RNG} rng
   * @returns {Object|null} Decision {kind:'EXTENSION', payload:{offer, marketAav, satisfaction, counter}, options ACCEPT/COUNTER/DECLINE}
   */
  Contracts.extensionOffer = function (state, rng) {
    if (!Contracts.extensionEligible(state)) return null;
    var E = C().extension;
    var p = state.player;
    var team = teamIn(nfl(state), p.teamId);
    var mv = Contracts.marketValue(state);
    var range = yearsRangeFor(E.yearsByAge, p.age);
    var years = rng.int(range[0], range[1]);                                              // draw 1
    var aav = Math.max(mv.vetMin, round1(mv.aav * rng.float(E.aavRange[0], E.aavRange[1])));   // draw 2
    var offer = {
      id: 'EXT', teamId: p.teamId, teamName: team ? team.name : p.teamId, type: 'VET', years: years, aav: aav,
      gtdPct: mv.gtdPct, startsK1: true, hometown: team ? isHometown(state, team) : false, hometownDiscount: false,
      note: 'extension', tags: ['extension'], total: round1(aav * years)
    };
    var counterAav = round1(aav * (1 + E.counter.aavBump));
    return {
      kind: 'EXTENSION',
      payload: {
        offer: offer, marketAav: mv.aav, satisfaction: Util.roundN(Contracts.teamSatisfaction(state), 3),
        counter: { aavBump: E.counter.aavBump, yearBump: E.counter.yearBump, p: Util.roundN(Contracts.counterAcceptProb(state), 3) },
        countered: false
      },
      options: [
        { id: 'ACCEPT', label: 'Accept', detail: years + ' yrs · ' + money(aav) + '/yr · ' + Math.round(mv.gtdPct * PCT) + ' % gtd · ' + money(offer.total) + ' total' },
        { id: 'COUNTER', label: 'Counter', detail: '+' + Math.round(E.counter.aavBump * PCT) + ' % AAV (' + money(counterAav) + '/yr) or +' + E.counter.yearBump + ' year · rejection may pull the offer' },
        { id: 'DECLINE', label: 'Decline', detail: 'Test free agency' + (Contracts.tagEligible(state) ? ' (franchise tag possible)' : '') }
      ]
    };
  };

  /**
   * Counter acceptance probability: clamp(0.30 + 0.20·agentTier + 0.15·fame/1000 + 0.20·need01, 0.10, 0.90),
   * need01 = clamp(teamsNeedingK / 12, 0, 1).
   * @param {Object} state @returns {number}
   */
  Contracts.counterAcceptProb = function (state) {
    var K = C().extension.counter;
    var p = state.player;
    var need01 = clamp(Contracts.teamsNeedingK(nfl(state)).length / C().fa.needDiv, 0, 1);
    return clamp(K.base + K.agentPer * (p.agentTier || 0) + K.famePer * (p.fame || 0) / PER_MILLE + K.needPer * need01, K.min, K.max);
  };

  /**
   * Counter an extension offer (§2.7.7): +10 % AAV (mode 'AAV', default) or +1 year (mode 'YEARS').
   * Exactly 1 draw: u < P → accepted; otherwise the remainder decides whether the original offer stands (p 0.5)
   * or is withdrawn (→ free agency). Marks decision.payload.countered.
   * @param {Object} state @param {RNG} rng @param {Object} decision EXTENSION decision @param {'AAV'|'YEARS'} [mode='AAV']
   * @returns {{accepted:boolean, offer:Object|null, stands:boolean, p:number}}
   */
  Contracts.counter = function (state, rng, decision, mode) {
    var K = C().extension.counter;
    var original = decision.payload.offer;
    var P = Contracts.counterAcceptProb(state);
    var u = rng.next();                                                                    // draw 1
    decision.payload.countered = true;
    if (u < P) {
      var offer = Util.deepClone(original);
      if (mode === 'YEARS') offer.years += K.yearBump; else offer.aav = round1(offer.aav * (1 + K.aavBump));
      offer.total = round1(offer.aav * offer.years);
      offer.tags = (offer.tags || []).concat(['countered']);
      return { accepted: true, offer: offer, stands: true, p: P };
    }
    var stands = (u - P) / (1 - P) < K.standsProb;
    return { accepted: false, offer: stands ? original : null, stands: stands, p: P };
  };

  /**
   * Franchise-tag eligibility (§2.7.7): satisfaction ≥ 0.72, AAV ≥ 4.5, age ≤ 33, fewer than two tags, NFL.
   * (Whether "talks failed" is the caller's sequencing.)
   * @param {Object} state @returns {boolean}
   */
  Contracts.tagEligible = function (state) {
    var T = C().tag;
    var p = state.player;
    if (p.league !== 'NFL' || !p.teamId) return false;
    if ((p.tags || 0) >= T.max || p.age > T.maxAge) return false;
    if (Contracts.teamSatisfaction(state) < C().extension.satisfaction.min) return false;
    return Contracts.marketValue(state).aav >= T.aavMin;
  };

  /**
   * Try to franchise-tag the player (§2.7.7): P 0.5 when eligible. On success signs a 1-year fully
   * guaranteed TAG at tagValue (×1.2 when the expiring deal was itself a tag), morale −8, tags += 1.
   * Draws: chance 1 (0 when ineligible).
   * @param {Object} state @param {RNG} rng @returns {boolean} tagged
   */
  Contracts.applyTag = function (state, rng) {
    var T = C().tag;
    if (!Contracts.tagEligible(state)) return false;
    if (!rng.chance(T.prob)) return false;                                                 // draw 1
    var p = state.player;
    var consecutive = !!(p.contract && p.contract.type === 'TAG');
    var aav = round1(Contracts.tagValue(nfl(state)) * (consecutive ? T.secondMult : 1));
    var team = teamIn(nfl(state), p.teamId);
    Contracts.sign(state, {
      id: 'TAG', teamId: p.teamId, teamName: team ? team.name : p.teamId, type: 'TAG', years: 1, aav: aav, gtdPct: 1,
      startsK1: true, note: 'franchise tag', tags: ['tag'], total: aav, reason: consecutive ? 'TAG2' : 'TAG'
    }, rng);
    p.morale = soft(p.morale + T.morale);
    p.tags = (p.tags || 0) + 1;
    return true;
  };

  // ───────────────────────────── cuts ─────────────────────────────

  /**
   * Offseason cut rule (§2.7.7): (seasonFGpct < 0.75 and OVR < 68) or js < 20. Check only; no draws.
   * @param {Object} state @param {RNG} [rng] unused (signature per §3.5.15)
   * @returns {{cut:true, reason:'JOB_SECURITY'|'PERFORMANCE', fgPct:number, ovr:number, js:number, text:string}|null}
   */
  Contracts.cutCheck = function (state, rng) {
    void rng;
    var K = C().cut;
    var p = state.player;
    if (p.league !== 'NFL' || !p.contract) return null;
    var pct = judgedFgPct(state), ovr = userOvr(state);
    var base = { cut: true, fgPct: Util.roundN(pct, 3), ovr: ovr, js: p.js };
    if (p.js < K.jsBelow) {
      base.reason = 'JOB_SECURITY';
      base.text = 'Job security ' + Math.round(p.js) + ' — the staff moved on.';
      return base;
    }
    if (judgedFga(state) > 0 && pct < K.fgPctBelow && ovr < K.ovrBelow) {
      base.reason = 'PERFORMANCE';
      base.text = Util.fmtPct(pct, 0) + ' at OVR ' + ovr + ' — released.';
      return base;
    }
    return null;
  };

  /**
   * Execute a cut: the unpaid guaranteed money is paid out as dead money (counts toward earnings), the
   * contract ends in history, player.contract → null, role NONE, and flags.cutFa marks the ×0.8 market.
   * Team membership itself is left to Career.changeTeam / sign (the id must stay valid for validate).
   * @param {Object} state @param {string} [reason='CUT'] @returns {{deadMoney:number, reason:string}}
   */
  Contracts.applyCut = function (state, reason) {
    var p = state.player;
    var c = p.contract;
    var dead = 0;
    if (c) {
      var gtdTotal = c.aav * c.years * (c.gtdPct || 0);
      dead = Math.max(0, round1(gtdTotal - (c.paid || 0)));
      state.history.earnings = round1(state.history.earnings + dead);
      var rec = openContractRecord(state);
      if (rec) { rec.endYear = state.year; rec.reason = reason || 'CUT'; rec.deadMoney = dead; }
    }
    p.contract = null;
    p.role = 'NONE';
    state.flags = state.flags || {};
    state.flags.cutFa = true;
    return { deadMoney: dead, reason: reason || 'CUT' };
  };

  // ───────────────────────────── signing & payouts ─────────────────────────────

  /**
   * Sign an offer (§2.7.7): sets player.contract, appends history.contracts, applies the hometown discount
   * (−8 % AAV, morale +10, fans +10) when offer.hometownDiscount, and moves the player when the team differs
   * (Career.changeTeam when available and an rng is given, else teamId/league/history.teams directly).
   * @param {Object} state @param {Object} offer {teamId, years, aav, gtdPct, type?, startsK1?, round?, hometownDiscount?, reason?}
   * @param {RNG} [rng] needed only for Career.changeTeam's headline
   * @returns {Object} the new player.contract
   */
  Contracts.sign = function (state, offer, rng) {
    var F = C().fa;
    var p = state.player;
    var type = offer.type || 'VET';
    var aav = offer.aav;
    if (offer.hometownDiscount) {
      aav = round1(aav * (1 - F.hometownDiscount));
      p.morale = soft(p.morale + F.hometownMorale);
      p.fans = soft(p.fans + F.hometownFans);
    }
    var years = Math.max(1, Math.round(offer.years || 1));
    var gtdPct = typeof offer.gtdPct === 'number' ? offer.gtdPct : Contracts.gtdPct(userOvr(state));
    var contract = {
      type: type, years: years, yearIdx: 0, aav: aav, gtdPct: gtdPct,
      signingBonus: round1(C().signingBonusPct * aav * years), startYear: state.year, paid: 0, paidThrough: -1
    };
    if (type === 'ROOKIE' || type === 'UDFA') contract.round = typeof offer.round === 'number' ? offer.round : 0;

    var prev = openContractRecord(state);
    if (prev) { prev.endYear = state.year; prev.reason = prev.reason || 'EXPIRED'; }
    p.contract = contract;
    state.history.contracts.push({
      year: state.year, league: 'NFL', teamId: offer.teamId || p.teamId, type: type, years: years, aav: aav,
      total: round1(aav * years), gtdPct: gtdPct, signingBonus: contract.signingBonus,
      round: contract.round === undefined ? null : contract.round, endYear: null,
      reason: offer.reason || (offer.hometownDiscount ? 'HOMETOWN' : (offer.id === 'EXT' ? 'EXTENSION' : 'SIGNED'))
    });

    var moved = offer.teamId && (offer.teamId !== p.teamId || p.league !== 'NFL');
    if (moved) {
      var Career = RTG.Career;
      var CT = C().changeTeam;
      if (Career && typeof Career.changeTeam === 'function' && rng) {
        Career.changeTeam(state, rng, offer.teamId, { trust: CT.trust, js: CT.js, reason: type === 'UDFA' ? 'UDFA' : 'SIGNED' });
      } else {
        var stint = openStint(state);
        if (stint) stint.toYear = state.year;
        state.history.teams.push({ teamId: offer.teamId, league: 'NFL', fromYear: state.year, toYear: null, reason: type === 'UDFA' ? 'UDFA' : 'SIGNED' });
        p.teamId = offer.teamId; p.league = 'NFL';
        p.trust = CT.trust; p.js = CT.js;
      }
    }
    p.role = offer.startsK1 === false ? 'K2' : 'K1';
    if (state.flags) delete state.flags.cutFa;
    return contract;
  };

  /**
   * Pay this season's money into history.earnings (§2.7.7): salary = (total − signing bonus)/years, the
   * signing bonus in year 1, college NIL ($k/yr → $M). Idempotent per contract year (contract.paidThrough).
   * @param {Object} state @returns {{salary:number, bonus:number, nil:number, total:number}}
   */
  Contracts.payoutSeason = function (state) {
    var p = state.player;
    var c = p.contract;
    var out = { salary: 0, bonus: 0, nil: 0, total: 0 };
    if (p.league === 'COLLEGE' && p.nil > 0) out.nil = round1(p.nil / K_PER_M);
    if (c && c.years > 0 && c.yearIdx < c.years && c.aav > 0) {
      var paidThrough = typeof c.paidThrough === 'number' ? c.paidThrough : -1;
      if (paidThrough < c.yearIdx) {
        var total = c.aav * c.years;
        var bonus = c.signingBonus || 0;
        out.bonus = c.yearIdx === 0 ? round1(bonus) : 0;
        out.salary = round1((total - bonus) / c.years);
        c.paid = round1((c.paid || 0) + out.salary + out.bonus);
        c.paidThrough = c.yearIdx;
      }
    }
    out.total = round1(out.salary + out.bonus + out.nil);
    state.history.earnings = round1((state.history.earnings || 0) + out.total);
    return out;
  };

  RTG.Contracts = Contracts;
})(typeof window !== 'undefined' ? window : globalThis);
