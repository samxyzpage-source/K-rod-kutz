/**
 * Road to Glory: Kicker — RTG.Career (SPEC §2.7 career systems, §2.2 camp battle, §2.10.1 event actions,
 * §3.4 Decision / KickSession / pending, §3.5.18 API, §3.6 career flow state machine)
 *
 * The stage machine of a career: the HS showcase and star rating, college offers, the single `decide` entry point
 * for every Decision kind, kick sessions (showcase / camp battle / combine / halftime-70 / tryout), the offseason
 * wizard chain, team changes, event actions, the draft hand-off into the NFL, retirement and the legacy report.
 *
 * Pure over plain JSON + the rng passed in: no DOM, no clock, no ambient randomness. Sibling modules (Schema,
 * Player, Kick, Season, Contracts, Draft, Events, Stats, Awards, Names) are resolved AT CALL TIME.
 *
 * State extensions (all JSON-safe, all optional):
 *   state.flags.showcase        {makes, kicks, stars, ovr, results:[{distance, made}]}
 *   state.flags.offseason       the wizard chain {key, year, league, steps[], idx, done, log[], resigned, talksFailed,
 *                               transferred, noOffers}   (Career.offseasonChain; stale chains are replaced by key)
 *   state.flags.noOfferSeasons  consecutive offseasons that ended without an NFL contract (forced retirement at 2)
 *   state.flags.skipGame        {year, week, reason, restoreRole?}   (HOLDOUT / SKIP_GAME actions; honoured by RTG.Engine)
 *   state.flags.transferRequested · declared · combinePlan · combineScore · combine · draftResult · springLeague
 *   state.flags.legacy          {tier, score, verdict, docTitle, retiredYear, age, reason}   (Career.retire)
 *   player.flags.coachStyle 'TRUSTING'|'CAUTIOUS'|'WHISPERER' (read by Player) · nearHome · redshirtYear · season.campBattle.result
 *
 * RNG draw accounting (binding for replay determinism):
 *   showcaseSession       : 0 (calm, explicit middle hash)
 *   finishShowcase        : generateCollegeOffers 1 (fork) → headline 1
 *   generateCollegeOffers : exactly 1 parent draw — rng.fork('offers:<year>:<mode>'); every sample (count, schools,
 *                           coach type, NIL) comes from the child
 *   campBattle            : per rival kick Kick.aiInput 6 + Kick.resolve 5+ (6 kicks) — user contexts 0
 *   finishSession CAMP    : headline 1 · COMBINE: headline 1 · TRYOUT: pass → Contracts.generateOffers | fail → spring league
 *   changeTeam            : headline 1 · retire: docTitle pick 1 → headline 1
 *   decide                : per kind (see handlers) + Career.resume (chain steps: Season.ageTick 2 in the growth window — the
 *                           BODY_CHECK card previews it from a rewound rng — Contracts.extensionOffer 2, generateOffers 1 + n, Events.roll 1–2)
 *   handleActions         : TRADE chance 1 (+ pick 1 + changeTeam 1) · INJURY int 1 · others as the functions they call
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  var Util = RTG.Util, Tuning = RTG.Tuning;
  var Career = {};

  var ATTRS = ['POW', 'ACC', 'CON', 'CLU', 'KO'];
  var IN_SEASON = { REG: true, POST: true };
  var PCT = 100;
  var DECISION_KINDS = ['OFFERS_COLLEGE', 'REDSHIRT', 'DECLARE', 'TRANSFER', 'COMBINE_PLAN', 'UDFA', 'EXTENSION', 'FREE_AGENCY',
    'TAG', 'RETIRE', 'OFFSEASON_PLAN', 'CUT_NOTICE', 'HOF', 'TRAINING_BLOCKS', 'BODY_CHECK', 'CAMP'];
  var ACTIONS = ['TRANSFER', 'TRADE', 'HOLDOUT', 'CAMP_BATTLE', 'CHANGE_TEAM', 'SKIP_GAME', 'INJURY', 'RETIRE', 'HALFTIME70'];
  var DEPTH_TEXT = { OPEN: 'job is open', VET: 'veteran incumbent (1 yr left)', STAR: 'star incumbent — likely K2 in year 1' };
  var COACH_TEXT = { TRUSTING: 'trusting coach', CAUTIOUS: 'cautious coach', WHISPERER: 'kicker-whisperer' };
  var DOC_TITLES = {
    Journeyman: ['{last}: The Leg Nobody Asked For', 'Third String: A {last} Story', '{last} — Available on Waivers'],
    'Solid Starter': ['Forty-Two Yards: The {last} Years', '{last}: Just Wide Enough', 'The Reliable {last}'],
    'Franchise Leg': ['Ice in the Boot: The {last} Files', '{last}: Three Points at a Time', 'Uprights — {name} and the Long Way Home'],
    Legend: ['{name}: Money Leg', 'The Doink Heard Round the World: {last}', '{last} Forever: A Kicking Life'],
    Immortal: ['{name}: The Hall Calls', 'Untouchable: The {last} Dynasty', '{last} — Immortal from Sixty']
  };

  // ═══════════════════════════════ late-bound modules & small helpers ═══════════════════════════════

  function Schema() { return RTG.Schema; }        function Player() { return RTG.Player; }        function Kick() { return RTG.Kick; }
  function Season() { return RTG.Season; }        function Contracts() { return RTG.Contracts; }  function Draft() { return RTG.Draft; }
  function Events() { return RTG.Events; }        function Stats() { return RTG.Stats; }          function Awards() { return RTG.Awards; }
  function TC() { return Tuning.career; }
  function isFn(f) { return typeof f === 'function'; }
  function num(v, d) { return typeof v === 'number' && v === v ? v : d; }
  function has(arr, v) { return Array.isArray(arr) && arr.indexOf(v) >= 0; }
  function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
  function soft(v) { return clamp(v, Tuning.soft.min, Tuning.soft.max); }
  function fail(fn, msg) { throw new Error('Career.' + fn + ': ' + msg); }
  function need(mod, name, fn) { if (!mod) fail(fn, 'RTG.' + name + ' is required'); return mod; }
  function sflags(state) { state.flags = state.flags || {}; return state.flags; }
  function pflags(state) { state.player.flags = state.player.flags || {}; return state.player.flags; }
  function diffRow(state) { return Tuning.difficulty[state.difficulty] || Tuning.difficulty.pro; }

  function leagueObj(state, kind) { return state.leagues ? (kind === 'NFL' ? state.leagues.nfl : state.leagues.college) : null; }
  function teamIn(lg, id) {
    var S = Schema();
    if (S && isFn(S.teamIn)) return S.teamIn(lg, id);
    if (!lg || !id) return null;
    for (var i = 0; i < lg.teams.length; i++) if (lg.teams[i].id === id) return lg.teams[i];
    return null;
  }
  /** {team, kind} for a team id in either league (college first). */
  function findTeam(state, id) {
    var t = teamIn(leagueObj(state, 'COLLEGE'), id);
    if (t) return { team: t, kind: 'COLLEGE' };
    t = teamIn(leagueObj(state, 'NFL'), id);
    return t ? { team: t, kind: 'NFL' } : null;
  }
  function userTeam(state) { return state.player.teamId ? teamIn(leagueObj(state, state.player.league), state.player.teamId) : null; }
  function teamName(team) { return team ? (team.school || team.name) : 'the team'; }
  function ovrOf(attrs) {
    var P = Player();
    if (P && isFn(P.ovr)) return P.ovr(attrs);
    var W = Tuning.progression.ovrWeights, s = 0;
    for (var k in W) if (Object.prototype.hasOwnProperty.call(W, k)) s += W[k] * num(attrs[k], 0);
    return Math.round(s);
  }
  function fgPct(s) { return s && s.fga > 0 ? s.fgm / s.fga : 0; }

  /** Headline via Events.headline (1 draw); null when Events is absent (0 draws). Unknown tags render `vars.text`. */
  function headline(state, rng, tag, vars) {
    var E = Events();
    if (!E || !isFn(E.headline) || !Array.isArray(state.headlines)) return null;
    return E.headline(state, rng, tag, vars || {});
  }
  /** Inbox note via Events.message (0 draws). */
  function message(state, kind, vars) {
    var E = Events();
    if (!E || !isFn(E.message) || !Array.isArray(state.inbox)) return null;
    return E.message(state, kind, vars || {});
  }
  function timeline(state, kind, text, impact) {
    var h = state.history;
    if (!h || !Array.isArray(h.timeline)) return null;
    var row = { year: state.year, week: state.week, kind: kind, text: text, impact: impact, teamId: state.player.teamId || null };
    h.timeline.push(row);
    var cap = Tuning.save.timelineCap;
    while (h.timeline.length > cap) h.timeline.shift();
    return row;
  }
  function option(id, label, detail) { return { id: id, label: label, detail: detail || '' }; }
  function decision(kind, payload, options) { return { kind: kind, payload: payload, options: options }; }
  function setPending(state, dec) { state.pending = { kind: 'DECISION', decision: dec }; return dec; }
  function findOption(dec, id) { for (var i = 0; i < dec.options.length; i++) if (dec.options[i].id === id) return dec.options[i]; return null; }
  function madeCount(results) { var n = 0; for (var i = 0; i < results.length; i++) if (results[i] && results[i].made) n++; return n; }

  /** A calm, for-session KickContext for the user (0 draws: explicit hash, calm). */
  function sessionCtx(state, rng, sit) {
    var K = need(Kick(), 'Kick', 'sessionCtx');
    var s = { type: 'FG', hash: 0, isUser: true, forSession: true, calm: true };
    for (var k in sit) if (Object.prototype.hasOwnProperty.call(sit, k) && sit[k] !== undefined) s[k] = sit[k];
    return K.buildContext(state, null, s, rng);
  }
  /** An AI-rule kick on a context (draws: aiInput 6 + resolve 5+). */
  function aiKick(rng, ctx, attrs) {
    var K = Kick();
    return K.resolve(rng, ctx, attrs || null, K.aiInput(rng, ctx, attrs || null), { auto: true });
  }

  // ═══════════════════════════════ roster & stints ═══════════════════════════════

  /** The user's rival on the team: the other leg (Player.rivalOvr's rule). */
  function rivalOf(state, team) {
    if (!team) return null;
    var p = state.player;
    return (p.role === 'K1' ? (team.kicker2 || team.kicker) : (team.kicker || team.kicker2)) || null;
  }

  /** Put the AI leg in the slot that matches the user's role: user K1 → AI in kicker2 (K1 slot empty); user K2/NONE → AI in kicker. */
  function arrangeRoster(state, kind, team, role) {
    var S = Schema(), lg = leagueObj(state, kind);
    if (!team || !lg) return;
    var set = function (kicker, slot) { if (S && isFn(S.setKicker)) S.setKicker(lg, team.id, kicker, slot); else team[slot] = kicker; };
    if (role === 'K1') {
      if (team.kicker) {
        var inc = team.kicker;
        set(null, 'kicker');
        if (!team.kicker2 || num(team.kicker2.ovr, 0) < num(inc.ovr, 0)) team.kicker2 = inc;
      }
    } else if (!team.kicker && team.kicker2) {
      set(team.kicker2, 'kicker');
      team.kicker2 = null;
    }
  }

  /** The user left a team: its backup takes the K1 slot back. */
  function restoreRoster(state, kind, teamId) {
    var team = teamIn(leagueObj(state, kind), teamId);
    if (team) arrangeRoster(state, kind, team, 'NONE');
  }

  function openStint(state) {
    var st = state.history && state.history.teams;
    if (!Array.isArray(st)) return null;
    for (var i = st.length - 1; i >= 0; i--) if (st[i].toYear === null || st[i].toYear === undefined) return st[i];
    return null;
  }
  function closeStint(state, reason) {
    var st = openStint(state);
    if (st) { st.toYear = state.year; st.endReason = reason; }
    return st;
  }
  function closeContractRecord(state, reason) {
    var recs = state.history && state.history.contracts;
    if (!Array.isArray(recs)) return;
    for (var i = recs.length - 1; i >= 0; i--) {
      if (recs[i].endYear === null || recs[i].endYear === undefined) { recs[i].endYear = state.year; recs[i].reason = recs[i].reason || reason; return; }
    }
  }
  function clearJobFlags(state) {
    var f = pflags(state);
    var keys = ['benched', 'benchNoted', 'jsLowWeeks', 'cutWarnNoted', 'lostJob', 'hotSeatNoted', 'jsNote'];
    for (var i = 0; i < keys.length; i++) delete f[keys[i]];
    delete sflags(state).ultimatum;
    delete sflags(state).rivalCold;
  }
  var REASON_TAG = { TRANSFER: 'transfer', TRADE: 'trade', DRAFTED: 'draft', COMMIT: 'contract', WALKON: 'contract' };
  function tagForReason(reason) { return REASON_TAG[reason] || 'fa'; }

  /**
   * Move the player to a team (§2.7.7 trades / FA / transfer / draft): closes the open stint, restores the old
   * team's roster, sets teamId / league / role / trust / js, clears job-security flags, places the new team's leg
   * in the slot matching the role, records history.teams, resets the week's game pointer, headline + note.
   * Draws: headline 1.
   * @param {Object} state @param {RNG} rng @param {string} teamId
   * @param {{trust?:number, js?:number, reason?:string, role?:'K1'|'K2'}} [opts]
   * @returns {{teamId:string, league:string, from:string|null, role:string}}
   */
  Career.changeTeam = function (state, rng, teamId, opts) {
    opts = opts || {};
    var found = findTeam(state, teamId);
    if (!found) fail('changeTeam', 'unknown team ' + teamId);
    var team = found.team, kind = found.kind, p = state.player, CT = Tuning.contracts.changeTeam;
    var from = p.teamId || null, fromKind = p.league;
    var reason = opts.reason || 'MOVED';
    if (from && (from !== teamId || fromKind !== kind)) restoreRoster(state, fromKind, from);
    if (from) closeStint(state, reason);
    p.teamId = team.id;
    p.league = kind;
    p.role = opts.role === 'K2' ? 'K2' : 'K1';
    p.trust = soft(num(opts.trust, CT.trust));
    p.js = soft(num(opts.js, CT.js));
    clearJobFlags(state);
    if (kind !== 'COLLEGE') delete pflags(state).coachStyle;
    arrangeRoster(state, kind, team, p.role);
    state.history.teams.push({ teamId: team.id, league: kind, fromYear: state.year, toYear: null, reason: reason });
    if (state.season && state.season.league === kind && IN_SEASON[state.phase]) state.season.userGameId = null;
    var vars = { team: teamName(team), city: team.city || '', text: '{last} joins ' + teamName(team) + (reason === 'TRADE' ? ' in a trade' : '') };
    headline(state, rng, tagForReason(reason), vars);                                              // 1 draw
    if (kind === 'NFL') message(state, reason === 'TRADE' ? 'gm_trade' : 'gm_welcome', { team: team.name });
    timeline(state, 'TEAM', (reason === 'TRADE' ? 'Traded to ' : reason === 'TRANSFER' ? 'Transferred to ' : 'Joined ') + teamName(team), 2);
    return { teamId: team.id, league: kind, from: from, role: p.role };
  };

  /** Leave the roster without a new team (no offers / sit out): contract closed, role NONE, teamId null. */
  function leaveTeam(state, rng, reason) {
    var p = state.player;
    if (p.contract) { closeContractRecord(state, reason); p.contract = null; }
    if (p.teamId) { restoreRoster(state, p.league, p.teamId); closeStint(state, reason); }
    p.teamId = null;
    p.role = 'NONE';
    p.nil = 0;
    clearJobFlags(state);
    if (state.season) state.season.userGameId = null;
    delete sflags(state).cutFa;
    timeline(state, 'FREE_AGENT', 'Without a team (' + reason.toLowerCase().replace(/_/g, ' ') + ')', 2);
  }

  // ═══════════════════════════════ §2.7.1 showcase & stars ═══════════════════════════════

  /**
   * Star rating (§2.7.1): clamp(round(1.5 + 0.03·(OVR − 40) + 0.4·showcaseMakes), 2, 5).
   * DEVIATION: the spec's literal `0.4·makes/6` makes every recruit a 2★ walk-on (OVR 49–52 → 2.17–2.26), which
   * contradicts §2.7.2 (3–6 offers, star bonuses); the per-make weight makes the showcase matter (3–4 makes → 3★).
   * @param {number} ovr @param {number} makes @returns {number} 2..5
   */
  Career.starsFor = function (ovr, makes) {
    var S = Tuning.draft.stars;
    return clamp(Math.round(S.base + S.perOvr * (ovr - S.ovrAnchor) + S.showcaseW * makes), S.min, S.max);
  };

  /**
   * The HS showcase session (§2.7.1): 30, 38, 44, 50, 55 yd, then a 42-yd pressure kick (0.6). Calm, middle hash.
   * Draws: 0. Does not set state.pending (Schema.createCareer wraps the session).
   * @param {Object} state @param {RNG} rng @returns {Object} KickSession
   */
  Career.showcaseSession = function (state, rng) {
    var S = Tuning.draft.showcase, contexts = [];
    for (var i = 0; i < S.distances.length; i++) {
      var last = i === S.distances.length - 1;
      var ctx = sessionCtx(state, rng, { distance: S.distances[i], pressure: last ? S.pressureLast : 0 });
      ctx.label = (last ? 'Pressure kick ' : 'Showcase ') + (i + 1) + '/' + S.distances.length;
      contexts.push(ctx);
    }
    return { kind: 'SHOWCASE', contexts: contexts, results: [], idx: 0 };
  };

  /**
   * Close the showcase (§2.7.1): stars from the makes, Player.applyStars (attrs ±4·Δ, POT, fame start), the walk-on
   * path (WALKON flag, morale −5), then the college offers decision (phase OFFERS, pending DECISION OFFERS_COLLEGE).
   * Draws: generateCollegeOffers 1 → headline 1.
   * @param {Object} state @param {RNG} rng @param {Object} [session] defaults to the pending SHOWCASE session
   * @returns {{kind:'SHOWCASE', makes:number, kicks:number, stars:number, walkon:boolean, decision:Object}}
   */
  Career.finishShowcase = function (state, rng, session) {
    var P = need(Player(), 'Player', 'finishShowcase');
    var pd = state.pending;
    var sess = session || (pd && pd.kind === 'KICKS' && pd.session && pd.session.kind === 'SHOWCASE' ? pd.session : null);
    if (!sess) fail('finishShowcase', 'no showcase session');
    var p = state.player;
    var results = sess.results || [], makes = madeCount(results), kicks = sess.contexts.length;
    var ovr = ovrOf(p.attrs);
    var stars = Career.starsFor(ovr, makes);
    P.applyStars(p, stars);
    var walkon = stars <= Tuning.draft.stars.walkon;
    var f = sflags(state);
    if (walkon) { f.WALKON = true; p.morale = soft(p.morale + Tuning.soft.start.walkonMorale); }
    var summary = [];
    for (var i = 0; i < sess.contexts.length; i++) summary.push({ distance: sess.contexts[i].distance, made: !!(results[i] && results[i].made) });
    f.showcase = { makes: makes, kicks: kicks, stars: stars, ovr: ovr, results: summary };
    state.pending = null;
    state.stage = 'HS';
    state.phase = 'OFFERS';
    var dec = Career.generateCollegeOffers(state, rng, 'RECRUIT');                                    // 1 draw
    setPending(state, dec);
    headline(state, rng, 'showcase', { text: '{last} rated a ' + stars + '-star recruit after a ' + makes + '-for-' + kicks + ' showcase' + (walkon ? '; walk-on offers only' : '') });   // 1 draw
    timeline(state, 'SHOWCASE', makes + '/' + kicks + ' at the showcase — ' + stars + '★' + (walkon ? ' (walk-on)' : ''), 2);
    return { kind: 'SHOWCASE', makes: makes, kicks: kicks, stars: stars, walkon: walkon, decision: dec };
  };

  // ═══════════════════════════════ §2.7.2 offers ═══════════════════════════════

  /** Shift a kicker's attributes so that their OVR lands on `target` (clamped to the AI kicker range). */
  function shapeKicker(k, target) {
    var K = Tuning.league.aiKicker;
    var cur = ovrOf(k.attrs), delta = target - cur;
    for (var i = 0; i < ATTRS.length; i++) k.attrs[ATTRS[i]] = clamp(Math.round(num(k.attrs[ATTRS[i]], cur) + delta), K.attrMin, K.attrMax);
    k.ovr = clamp(ovrOf(k.attrs), K.attrMin, K.attrMax);
    return k;
  }

  /**
   * The kicker room an offer describes (§2.7.2): depth sampled per prestige (OPEN / VET / STAR), then a generated
   * incumbent shaped to the band — OPEN: 6–11 OVR under the recruit (no camp battle), 1–2 yrs; VET: 66–78, 1 yr left;
   * STAR: 74–84, 2–3 yrs. Installed on the roster when the offer is accepted. Draws (child rng): depth 1 · createAiKicker 17–18 · band 1–2.
   */
  function offerRoom(state, rng, team, myOvr) {
    var C = TC().offers, D = Tuning.draft.offers.depth, S = Schema();
    var weights = C.depthWeights[num(team.prestige, 3)] || C.depthWeights[3];
    var depth = rng.weighted(C.depthOrder, function (d) { return weights[C.depthOrder.indexOf(d)]; });   // 1 draw
    var anchor = Tuning.league.aiKicker.collegeAnchorBase + Tuning.league.aiKicker.collegeAnchorPerPrestige * num(team.prestige, 3);
    var k = S && isFn(S.createAiKicker) ? S.createAiKicker(rng, anchor)
      : { name: 'Incumbent', age: 20, ovr: anchor, attrs: { POW: anchor, ACC: anchor, CON: anchor, CLU: anchor, KO: anchor }, contractYears: 1, seasonStats: null };
    var target, years;
    if (depth === 'STAR') { target = rng.int(D.STAR.ovr[0], D.STAR.ovr[1]); years = rng.int(D.STAR.years[0], D.STAR.years[1]); }
    else if (depth === 'VET') { target = rng.int(D.VET.ovr[0], D.VET.ovr[1]); years = D.VET.years[0]; }
    else { target = myOvr - rng.int(C.openBelow[0], C.openBelow[1]); years = rng.int(C.openYears[0], C.openYears[1]); }
    shapeKicker(k, target);
    k.contractYears = years;
    if (!k.seasonStats && S && isFn(S.emptyKickerStats)) k.seasonStats = S.emptyKickerStats();
    return { depth: depth, kicker: k };
  }

  /** One college offer. Draws (child rng): coach weighted 1 · NIL float 1 · offerRoom 20–22. */
  function buildCollegeOffer(state, rng, team, idx, walkon, mode) {
    var C = TC().offers, N = Tuning.contracts.nil, F = Tuning.soft.fame, O = Tuning.draft.offers;
    var p = state.player, myOvr = ovrOf(p.attrs);
    var names = Object.keys(C.coachWeights);
    var coach = rng.weighted(names, function (n) { return C.coachWeights[n]; });                     // 1 draw
    var u = rng.float(0, 1);                                                                          // 1 draw
    var band = N.byPrestige[team.prestige] || [0, 0];
    var nil = walkon ? 0 : Math.round(Util.lerp(band[0], band[1], 0.5 * u + 0.5 * Math.min(1, num(p.fame, 0) / C.nilFameDiv)));
    var room = offerRoom(state, rng, team, myOvr);
    return {
      id: 'OFFER_' + idx, teamId: team.id, teamName: team.name, school: team.school || team.name, abbr: team.abbr,
      prestige: num(team.prestige, 3), depth: room.depth, coach: coach, nil: nil,
      nearHome: !!(p.hometown && team.region && p.hometown.region === team.region),
      climate: team.climate, dome: !!team.dome, region: team.region || '', conf: team.conf || '',
      safety: false, walkon: walkon, scholarship: !walkon, mode: mode,
      incumbent: room.kicker,
      fameMult: Util.roundN(1 + F.collegePrestigePer * (num(team.prestige, 3) - F.prestigeAnchor), 2),
      draftBump: O.prestigeBumpPer * (num(team.prestige, 3) - O.prestigeAnchor)
    };
  }

  /** Put the offer's incumbent on the roster in the slot matching the user's role (user K1 → K2 slot; user K2 → K1 slot). */
  function installIncumbent(state, team, incumbent, role) {
    var S = Schema(), lg = leagueObj(state, 'COLLEGE');
    if (!team || !incumbent) return;
    var k = Util.deepClone(incumbent);
    var set = function (kicker, slot) { if (S && isFn(S.setKicker)) S.setKicker(lg, team.id, kicker, slot); else team[slot] = kicker; };
    if (role === 'K1') { set(null, 'kicker'); team.kicker2 = k; }
    else { set(k, 'kicker'); team.kicker2 = null; }
  }

  function offerLabel(o) { return o.school + ' (' + o.prestige + '★)' + (o.safety ? ' · safety school' : ''); }
  function offerDetail(o) {
    var parts = [(DEPTH_TEXT[o.depth] || o.depth) + (o.incumbent ? ' — ' + o.incumbent.name + ' (' + o.incumbent.ovr + ' OVR)' : ''), COACH_TEXT[o.coach] || o.coach];
    if (o.walkon) parts.push('walk-on, no scholarship');
    if (o.nil > 0) parts.push('NIL $' + o.nil + 'k/yr');
    if (o.nearHome) parts.push('near home');
    parts.push(o.dome ? 'dome' : o.climate + ' climate');
    return parts.join(' · ');
  }

  /**
   * College offers (§2.7.2 / §2.7.4) as a Decision (the caller sets state.pending).
   *   RECRUIT : 3–6 offers (walk-on: 1) from schools with prestige stars−1..stars, weighted 1/(1 + |prestige − (stars − 0.5)|),
   *             the last one a "safety" school of prestige ≤ 2; each with depth (from the real kicker room), coach type, NIL, nearHome.
   *   TRANSFER: 2–3 offers within ±1 of the OVR-implied tier (current school excluded) + a STAY option.
   * Draws: exactly 1 on `rng` (rng.fork); all sampling happens on the child.
   * @param {Object} state @param {RNG} rng @param {'RECRUIT'|'TRANSFER'} mode
   * @returns {Object} Decision {kind:'OFFERS_COLLEGE'|'TRANSFER', payload:{mode, stars, walkon, myOvr, offers[]}, options}
   */
  Career.generateCollegeOffers = function (state, rng, mode) {
    mode = mode === 'TRANSFER' ? 'TRANSFER' : 'RECRUIT';
    var child = rng.fork('offers:' + state.year + ':' + mode);                                        // 1 parent draw
    var O = Tuning.draft.offers, C = TC().offers, p = state.player;
    var lg = need(leagueObj(state, 'COLLEGE'), 'leagues.college', 'generateCollegeOffers');
    var myOvr = ovrOf(p.attrs), stars = num(p.stars, Tuning.progression.creation.defaultStars);
    var walkon = mode === 'RECRUIT' && !!sflags(state).WALKON;
    var lo, hi, count, center, exclude = [];
    if (mode === 'TRANSFER') {
      var tier = clamp(Math.round(C.ovrTier.base + C.ovrTier.perOvr * (myOvr - C.ovrTier.anchor)), 1, 5);
      lo = tier - C.transferBand; hi = tier + C.transferBand; center = tier;
      count = child.int(C.transferCount[0], C.transferCount[1]);
      if (p.teamId) exclude.push(p.teamId);
    } else if (walkon) {
      lo = 1; hi = O.safetyPrestigeMax; center = 1.5; count = O.walkon;
    } else {
      lo = stars - 1; hi = stars; center = stars - O.weightOffset;
      count = child.int(O.min, O.max);
    }
    lo = clamp(lo, 1, 5); hi = clamp(hi, 1, 5);
    var weight = function (t) { return 1 / (1 + Math.abs(num(t.prestige, 3) - center)); };
    var pool = [];
    for (var i = 0; i < lg.teams.length; i++) {
      var t = lg.teams[i];
      if (t.prestige >= lo && t.prestige <= hi && exclude.indexOf(t.id) < 0) pool.push(t);
    }
    var offers = [];
    var safety = mode === 'RECRUIT' && !walkon;
    var want = safety ? Math.max(1, count - 1) : count;
    while (offers.length < want && pool.length) {
      var team = child.weighted(pool, weight);
      pool.splice(pool.indexOf(team), 1);
      offers.push(buildCollegeOffer(state, child, team, offers.length, walkon, mode));
    }
    if (safety) {
      var sp = [];
      for (var j = 0; j < lg.teams.length; j++) {
        var s = lg.teams[j], taken = false;
        for (var o = 0; o < offers.length; o++) if (offers[o].teamId === s.id) taken = true;
        if (!taken && s.prestige <= O.safetyPrestigeMax) sp.push(s);
      }
      if (sp.length) {
        var st = child.weighted(sp, weight);
        var so = buildCollegeOffer(state, child, st, offers.length, false, mode);
        so.safety = true;
        offers.push(so);
      }
    }
    offers = Util.stableSort(offers, function (a, b) { return b.prestige - a.prestige; });
    for (var r = 0; r < offers.length; r++) offers[r].id = 'OFFER_' + r;
    var options = [];
    for (var q = 0; q < offers.length; q++) options.push(option(offers[q].id, offerLabel(offers[q]), offerDetail(offers[q])));
    if (mode === 'TRANSFER') options.push(option('STAY', 'Stay at ' + teamName(userTeam(state)), 'Keep the job fight where it is'));
    return decision(mode === 'TRANSFER' ? 'TRANSFER' : 'OFFERS_COLLEGE',
      { mode: mode, stars: stars, walkon: walkon, myOvr: myOvr, offers: offers }, options);
  };

  /** The offer behind an option id of an offers decision. */
  function collegeOfferFor(dec, optionId) {
    var offers = (dec.payload && dec.payload.offers) || [];
    for (var i = 0; i < offers.length; i++) if (offers[i].id === optionId) return offers[i];
    return null;
  }

  /**
   * Accept a college offer (§2.7.2 / §2.7.4): team, trust by coach, js 60 (OPEN) / 45, role K2 at a STAR school,
   * NIL, coach style, scholarship / walk-on contract; a recruit enrols (stage COLLEGE, Season.start → PRE); a
   * transfer resets trust 45 / js 50, keeps stats, costs fame 10. Draws: changeTeam 1 (+ Season.start for recruits).
   */
  function acceptCollegeOffer(state, rng, offer, mode) {
    var T = Tuning.contracts, S0 = Tuning.soft.start, p = state.player;
    var lg = leagueObj(state, 'COLLEGE'), team = teamIn(lg, offer.teamId);
    if (!team) fail('decide', 'unknown school ' + offer.teamId);
    var transfer = mode === 'TRANSFER';
    var role = offer.depth === 'STAR' ? 'K2' : 'K1';
    Career.changeTeam(state, rng, team.id, {
      trust: transfer ? T.transfer.trust : S0.trustByCoach[offer.coach],
      js: transfer ? T.transfer.js : (offer.depth === 'OPEN' ? S0.jsOpen : S0.jsContested),
      reason: transfer ? 'TRANSFER' : (offer.walkon ? 'WALKON' : 'COMMIT'), role: role
    });                                                                                               // 1 draw
    installIncumbent(state, team, offer.incumbent, role);
    pflags(state).coachStyle = offer.coach;
    pflags(state).nearHome = !!offer.nearHome;
    team.coachAgg = S0.coachAgg[offer.coach] !== undefined ? S0.coachAgg[offer.coach] : team.coachAgg;
    p.nil = num(offer.nil, 0);
    if (transfer) {
      p.fame = clamp(Util.round1(num(p.fame, 0) + T.transfer.fame), 0, Tuning.soft.fame.max);
      var ch = sflags(state).offseason;
      if (ch) ch.transferred = true;
      return { enrolled: false, transferred: true, teamId: team.id };
    }
    var type = offer.walkon ? 'WALKON' : 'SCHOLARSHIP';
    var years = Tuning.contracts.rookie.years;
    p.contract = { type: type, years: years, yearIdx: 0, aav: 0, gtdPct: 0, signingBonus: 0, startYear: state.year, paid: 0, paidThrough: -1 };
    state.history.contracts.push({ year: state.year, league: 'COLLEGE', teamId: team.id, type: type, years: years, aav: 0, total: 0,
      gtdPct: 0, signingBonus: 0, round: null, endYear: null, reason: type });
    state.stage = 'COLLEGE';
    message(state, 'coach_pregame', { team: teamName(team) });
    var Se = need(Season(), 'Season', 'decide');
    Se.start(state, rng);
    return { enrolled: true, transferred: false, teamId: team.id };
  }

  // ═══════════════════════════════ §2.2 camp battle ═══════════════════════════════

  /** Years the user has spent with the current team. */
  function userSeniority(state) {
    var st = openStint(state);
    return st ? Math.max(0, state.year - num(st.fromYear, state.year)) : 0;
  }

  /**
   * Open a camp battle (§2.2): 6 kicks (32, 38, 44, 48, 52, 55 yd, pressure 0.3) for the user; the rival's six
   * are resolved now with the AI rule on his own snapshot. Sets state.pending = {kind:'KICKS', session}.
   * Draws: per rival kick aiInput 6 + resolve 5+ (the user's contexts are calm and hash-explicit: 0).
   * @param {Object} state @param {RNG} rng @returns {Object} KickSession (kind 'CAMP')
   */
  Career.campBattle = function (state, rng) {
    var C = Tuning.soft.camp, p = state.player, team = userTeam(state);
    if (!team) fail('campBattle', 'the player has no team');
    var K = need(Kick(), 'Kick', 'campBattle'), S = Schema();
    var rival = rivalOf(state, team);
    if (!rival) {
      var anchor = p.league === 'NFL' ? Tuning.league.aiKicker.nflAnchor
        : Tuning.league.aiKicker.collegeAnchorBase + Tuning.league.aiKicker.collegeAnchorPerPrestige * num(team.prestige, 3);
      rival = S && isFn(S.createAiKicker) ? S.createAiKicker(rng, anchor) : { name: 'Walk-on Kicker', age: 20, ovr: 55, attrs: { POW: 55, ACC: 55, CON: 55, CLU: 55, KO: 55 }, contractYears: 1 };
      if (p.role === 'K1') team.kicker2 = rival; else team.kicker = rival;
    }
    var contexts = [], rivalResults = [];
    for (var i = 0; i < C.distances.length; i++) {
      var ctx = sessionCtx(state, rng, { distance: C.distances[i], pressure: C.pressure });
      ctx.label = 'Camp battle ' + (i + 1) + '/' + C.distances.length;
      contexts.push(ctx);
      var rctx = K.buildContext(state, null, { type: 'FG', distance: C.distances[i], hash: 0, pressure: C.pressure, isUser: false, forSession: true, calm: true, kicker: rival, league: p.league }, rng);
      rivalResults.push(aiKick(rng, rctx, rival.attrs));                                            // 11+ draws each
    }
    var incumbent = p.role === 'K1' ? 'USER' : 'RIVAL';
    var mySen = userSeniority(state);
    var session = {
      kind: 'CAMP', contexts: contexts, results: [], idx: 0,
      rival: { name: rival.name || 'the other leg', ovr: num(rival.ovr, rival.attrs ? ovrOf(rival.attrs) : 0), results: rivalResults, makes: madeCount(rivalResults) },
      incumbent: incumbent, mySeniority: mySen, rivalSeniority: incumbent === 'RIVAL' ? mySen + TC().camp.incumbentSeniority : 0,
      trigger: state.phase === 'PRE' ? 'PRESEASON' : 'EVENT'
    };
    if (!state.pending) state.pending = { kind: 'KICKS', session: session };                       // never clobber another pending
    return session;
  };

  /** Score the battle (§2.2) and hand out K1 / K2. Draws: headline 1. */
  function finishCamp(state, rng, sess) {
    var C = Tuning.soft.camp, p = state.player, team = userTeam(state);
    var myMakes = madeCount(sess.results), rivalMakes = sess.rival ? madeCount(sess.rival.results) : 0;
    var myScore = myMakes * C.makeW + num(p.trust, 50) * C.trustW + num(sess.mySeniority, 0) * C.seniorityW;
    var rivalScore = rivalMakes * C.makeW + C.rivalTrust * C.trustW + num(sess.rivalSeniority, 0) * C.seniorityW;
    var won = myScore > rivalScore || (myScore === rivalScore && sess.incumbent === 'USER');
    var wasK1 = p.role === 'K1';
    if (won) {
      p.role = 'K1';
      p.js = soft(Math.max(num(p.js, 0), TC().camp.winnerJs));
      delete pflags(state).benched;
    } else {
      p.role = 'K2';
      p.js = soft(C.loserJs);
      pflags(state).benched = true;                                    // §2.2: js ≥ 40 (or a cold rival) wins the job back
    }
    if (team) arrangeRoster(state, p.league, team, p.role);
    var rivalName = sess.rival ? sess.rival.name : 'the other leg';
    var line = myMakes + '-' + rivalMakes + ' vs ' + rivalName;
    headline(state, rng, won ? 'camp' : 'bench', { text: won ? '{last} wins the camp battle ' + line : '{last} loses the kicking job to ' + rivalName + ' (' + line + ')', rival: rivalName });   // 1 draw
    message(state, won ? (wasK1 ? 'coach_js_high' : 'coach_unbench') : 'coach_bench', { rival: rivalName });
    timeline(state, 'CAMP', (won ? 'Won' : 'Lost') + ' the camp battle ' + line, won ? 2 : 3);
    var out = { kind: 'CAMP', won: won, myScore: Util.round1(myScore), rivalScore: Util.round1(rivalScore), myMakes: myMakes, rivalMakes: rivalMakes, role: p.role, rival: rivalName };
    if (state.season && state.season.campBattle) { state.season.campBattle.result = out; state.season.campBattle.pending = false; }
    return out;
  }

  // ═══════════════════════════════ sessions ═══════════════════════════════

  /** Combine wrap-up (§2.7.5): combineScore → state.flags, phase 'DRAFT'. Draws: headline 1. */
  function finishCombine(state, rng, sess) {
    var D = need(Draft(), 'Draft', 'finishSession');
    var br = D.combineBreakdown(sess);
    var f = sflags(state);
    f.combineScore = br.score;
    f.combine = { ladderMakes: br.ladderMakes, accMakes: br.accMakes, hang: Util.roundN(br.hang, 2), score: br.score, plan: sess.plan || f.combinePlan || 'SHOW' };
    if (state.stage === 'DRAFT') state.phase = 'DRAFT';
    var text = '{last} at the combine: ladder ' + br.ladderMakes + '/' + Tuning.draft.combine.ladder.length + ', accuracy ' + br.accMakes + '/' + Tuning.draft.combine.accKicks + ', hang ' + Util.roundN(br.hang, 2) + ' s';
    headline(state, rng, 'draft', { text: text, round: '?', n: br.ladderMakes });                     // 1 draw
    timeline(state, 'COMBINE', 'Combine score ' + (br.score >= 0 ? '+' : '') + br.score, 1);
    return { kind: 'COMBINE', ladderMakes: br.ladderMakes, accMakes: br.accMakes, hang: br.hang, score: br.score };
  }

  /**
   * The undrafted tryout closes (§2.7.6): ≥ 4/6 → UDFA camp invites (pending UDFA decision); fail → a Pro Springs
   * League year (age passes, XP ×0.6, retry next draft); two failures → forced retirement.
   */
  function finishTryout(state, rng, sess) {
    var D = need(Draft(), 'Draft', 'finishSession'), C = need(Contracts(), 'Contracts', 'finishSession');
    var r = D.scoreTryout(sess);
    var out = { kind: 'TRYOUT', makes: r.makes, kicks: r.kicks, passed: r.passed, invites: 0, springLeague: false, retired: false };
    if (r.passed) {
      var dec = C.generateOffers(state, rng, 'UDFA');
      out.invites = dec.payload.offers.length;
      if (out.invites > 0) {
        state.phase = 'UDFA';
        setPending(state, dec);
        headline(state, rng, 'draft', { text: '{last} passes the minicamp tryout (' + r.makes + '/' + r.kicks + '); ' + out.invites + ' camp invites' });   // 1 draw
        timeline(state, 'TRYOUT', 'Tryout passed ' + r.makes + '/' + r.kicks, 2);
        return out;
      }
    }
    headline(state, rng, 'draft', { text: '{last} ' + (r.passed ? 'passes the tryout but no camp calls' : 'fails the minicamp tryout (' + r.makes + '/' + r.kicks + ')') });   // 1 draw
    timeline(state, 'TRYOUT', 'Tryout ' + (r.passed ? 'passed, no invites' : 'failed ' + r.makes + '/' + r.kicks), 3);
    var sl = springLeagueYear(state, rng);
    out.springLeague = !sl.retired;
    out.retired = sl.retired;
    return out;
  }

  /**
   * A Pro Springs League year (§2.7.6): no NFL team, XP = 3 offseason blocks × 0.6, the calendar rolls
   * (Season.advanceYear) into a teamless NFL season; a second failure ends the career.
   */
  function springLeagueYear(state, rng) {
    var SL = Tuning.draft.springLeague, X = Tuning.progression.xp, P = Player(), p = state.player, f = sflags(state);
    var prev = f.springLeague && typeof f.springLeague === 'object' ? f.springLeague : { failures: 0 };
    f.springLeague = { failures: num(prev.failures, 0) + 1, year: state.year };
    if (f.springLeague.failures >= SL.maxFailures) {
      Career.retire(state, rng, 'NO_NFL_DEAL');
      return { retired: true };
    }
    var mm = P && isFn(P.moraleMult) ? P.moraleMult(p.morale) : 1;
    var xp = Math.round(X.offseasonBlocks * X.offseasonBlock * mm * diffRow(state).xpMult * SL.xpMult);
    p.xp = num(p.xp, 0) + xp;
    if (p.teamId) { restoreRoster(state, p.league, p.teamId); closeStint(state, 'SPRING_LEAGUE'); }
    if (p.contract) { closeContractRecord(state, 'EXPIRED'); p.contract = null; }
    p.teamId = null; p.role = 'NONE'; p.league = 'NFL'; p.nil = 0;
    state.stage = 'NFL';
    delete f.offseason;
    timeline(state, 'SPRING_LEAGUE', 'A season in the Pro Springs League (+' + xp + ' XP)', 2);
    need(Season(), 'Season', 'finishSession').advanceYear(state, rng);
    return { retired: false, xp: xp };
  }

  /**
   * Resolve the pending KickSession (§3.5.18): SHOWCASE → stars & offers; CAMP → K1 / K2; COMBINE_* → combineScore;
   * HALFTIME70 → fame / fans (Events.resolveHalftime70); TRYOUT → UDFA invites / spring league; PRACTICE → nothing.
   * @param {Object} state @param {RNG} rng @returns {Object} SessionOutcome {kind, ...}
   */
  Career.finishSession = function (state, rng) {
    var pd = state.pending;
    if (!pd || pd.kind !== 'KICKS' || !pd.session) fail('finishSession', 'no pending kick session');
    var sess = pd.session;
    switch (sess.kind) {
      case 'SHOWCASE': return Career.finishShowcase(state, rng, sess);
      case 'CAMP': state.pending = null; return finishCamp(state, rng, sess);
      case 'COMBINE_LADDER': case 'COMBINE_ACC': case 'COMBINE_KO': state.pending = null; return finishCombine(state, rng, sess);
      case 'HALFTIME70': {
        var E = Events();
        var res = E && isFn(E.resolveHalftime70) ? E.resolveHalftime70(state, rng, sess.results[0]) : { made: !!(sess.results[0] && sess.results[0].made) };
        if (state.pending === pd) state.pending = null;
        return { kind: 'HALFTIME70', made: res.made, effects: res.effects || {} };
      }
      case 'TRYOUT': state.pending = null; return finishTryout(state, rng, sess);
      default: state.pending = null; return { kind: sess.kind, makes: madeCount(sess.results) };
    }
  };

  // ═══════════════════════════════ §2.7.4 eligibility / declaration ═══════════════════════════════

  /**
   * College eligibility (§2.7.4): seasons played, the redshirt season excluded from the 3-season clock, seniors
   * (5th season, or 4th non-redshirt) auto-declare.
   * @param {Object} state @returns {{seasons:number, eligibleSeasons:number, canDeclare:boolean, senior:boolean}}
   */
  Career.eligibility = function (state) {
    var D = Tuning.draft.declare, p = state.player;
    var seasons = num(p.collegeSeasons, 0);
    var eligible = seasons - (p.redshirt ? 1 : 0);
    return { seasons: seasons, eligibleSeasons: eligible, canDeclare: eligible >= D.seasonsMin, senior: eligible >= D.nonRedshirtAuto || seasons >= D.seasonsMax };
  };

  /** Declare for the draft (§2.7.5): stage DRAFT, phase COMBINE, pending COMBINE_PLAN decision. Draws: headline 1. */
  function declare(state, rng, auto) {
    var K = Kick(), CB = Tuning.draft.combine, f = sflags(state);
    f.declared = state.year;
    delete f.draftLean;
    state.stage = 'DRAFT';
    state.phase = 'COMBINE';
    state.game = null;
    var far = K && isFn(K.pMakeAt) ? Util.roundN(K.pMakeAt(state, CB.ladder[CB.ladder.length - 1], { calm: true }), 3) : 0;
    setPending(state, decision('COMBINE_PLAN', { ladder: CB.ladder.slice(), safeStop: CB.safeStop, pMakeFar: far, projection: Draft() ? Draft().projection(state) : null }, [
      option('SAFE', 'Play it safe — stop at ' + CB.safeStop, 'Range ladder ends at ' + CB.safeStop + ' yd; no miss on the tape'),
      option('SHOW', 'Show them the ' + CB.ladder[CB.ladder.length - 1], 'Kick the whole ladder until a miss (pMake at ' + CB.ladder[CB.ladder.length - 1] + ': ' + Math.round(far * PCT) + ' %)')
    ]));
    headline(state, rng, 'draft', { text: '{last} ' + (auto ? 'runs out of eligibility and heads to' : 'declares for') + ' the draft', round: '?' });   // 1 draw
    message(state, 'press_draft', {});
    timeline(state, 'DECLARED', auto ? 'Senior season over — off to the draft' : 'Declared for the draft', 2);
  }

  /**
   * Leave college for the draft process (§2.7.4 / §3.6): stage DRAFT. Seniors (or a prior DECLARE) go straight to
   * the combine (phase COMBINE, pending COMBINE_PLAN); otherwise phase DECLARE with the Declare / Stay decision
   * (projection card from Draft.projection).
   * @param {Object} state @param {RNG} rng @returns {{declared:boolean, senior:boolean, projection:Object|null}}
   */
  Career.enterDraft = function (state, rng) {
    var p = state.player, f = sflags(state);
    if (state.stage !== 'COLLEGE' && state.stage !== 'DRAFT') fail('enterDraft', 'not in college (stage ' + state.stage + ')');
    var el = Career.eligibility(state);
    if (!el.canDeclare && !f.declared) fail('enterDraft', 'not eligible to declare (' + el.eligibleSeasons + ' eligible seasons)');
    var D = Draft();
    var proj = D && isFn(D.projection) ? D.projection(state) : null;
    state.stage = 'DRAFT';
    state.game = null;
    if (el.senior || f.declared) {
      declare(state, rng, !f.declared);
      return { declared: true, senior: el.senior, projection: proj };
    }
    state.phase = 'DECLARE';
    var detail = proj ? 'Projected: ' + proj.label + ' (agent tier ' + num(p.agentTier, 0) + ')' : '';
    setPending(state, decision('DECLARE', { projection: proj, eligibleSeasons: el.eligibleSeasons, seasons: el.seasons, lean: f.draftLean || null, age: p.age, ovr: ovrOf(p.attrs) }, [
      option('DECLARE', 'Declare for the draft', detail),
      option('STAY', 'Stay in school', 'One more season of eligibility (' + (Tuning.draft.declare.nonRedshirtAuto - el.eligibleSeasons) + ' left)')
    ]));
    return { declared: false, senior: false, projection: proj };
  };

  // ═══════════════════════════════ §2.7.6 draft → NFL ═══════════════════════════════

  /** Does a rookie start ahead of the team's kicker? (Contracts.buildOffer's rule.) */
  function rookieStartsK1(team, myOvr) {
    var k = team.kicker || team.kicker2;
    return !k || num(k.ovr, 0) <= myOvr || num(k.contractYears, 1) <= 0;
  }

  /**
   * Run the draft (§2.7.6) at DRAFT.DRAFT: Draft.run → drafted → rookie deal + enterNfl; UDFA band → camp invites
   * (pending UDFA decision, phase UDFA); undrafted → the minicamp tryout (pending KICKS TRYOUT, phase UDFA).
   * @param {Object} state @param {RNG} rng @returns {Object} DraftResult (Draft.run's result + `next`)
   */
  Career.runDraft = function (state, rng) {
    if (state.stage !== 'DRAFT') fail('runDraft', 'not in the draft (stage ' + state.stage + ')');
    if (state.pending) fail('runDraft', 'resolve the pending ' + state.pending.kind + ' first');
    var D = need(Draft(), 'Draft', 'runDraft');
    state.phase = 'DRAFT';
    var res = D.run(state, rng);
    var f = sflags(state);
    if (!res.undrafted) {
      var lg = leagueObj(state, 'NFL'), team = teamIn(lg, res.teamId);
      f.draftResult = { round: res.round, pick: res.pick, teamId: res.teamId, value: res.value, shock: !!res.firstRoundShock,
        ticker: (res.picksTicker || []).map(function (r) { return { round: r.round, pick: r.pick, teamId: r.teamId, pos: r.pos, name: r.name, isUser: !!r.isUser }; }) };
      headline(state, rng, 'draft', { round: res.round, pick: res.pick, team: team ? team.name : res.teamId, text: '{last} drafted in round ' + res.round + ' (pick ' + res.pick + ') by ' + (team ? team.name : res.teamId) });   // 1 draw
      timeline(state, 'DRAFTED', 'Drafted round ' + res.round + ', pick ' + res.pick + ' by ' + (team ? team.name : res.teamId) + (res.firstRoundShock ? ' — first-round shock!' : ''), 3);
      Career.enterNfl(state, rng, res.teamId, res.contract, { reason: 'DRAFTED' });
      res.next = 'NFL';
      return res;
    }
    f.draftResult = { round: res.invites ? 8 : 9, pick: 0, teamId: null, value: res.value, shock: false, ticker: [] };
    if (res.invites && res.invites.payload && res.invites.payload.offers.length) {
      state.phase = 'UDFA';
      setPending(state, res.invites);
      headline(state, rng, 'draft', { text: '{last} goes undrafted; ' + res.invites.payload.offers.length + ' teams call with camp invites' });   // 1 draw
      timeline(state, 'UNDRAFTED', 'Undrafted — ' + res.invites.payload.offers.length + ' camp invites', 2);
      res.next = 'UDFA';
      return res;
    }
    var sess = D.tryout(state, rng);
    state.phase = 'UDFA';
    state.pending = { kind: 'KICKS', session: sess };
    headline(state, rng, 'draft', { text: '{last} goes undrafted; one minicamp tryout on the calendar' });   // 1 draw
    timeline(state, 'UNDRAFTED', 'Undrafted — minicamp tryout', 2);
    res.next = 'TRYOUT';
    return res;
  };

  /**
   * Join an NFL team as a rookie (§2.7.6 / §2.7.7): changeTeam (reason DRAFTED / UDFA), Contracts.sign of the rookie
   * deal (Contracts.rookieDeal when none is given), role K1 when the rookie is ahead of the incumbent (UDFA always
   * starts as K2 — the camp battle decides), the NFL becomes the active league and the calendar rolls into the
   * rookie season (Season.advanceYear → Season.start → NFL.PRE). Draws: changeTeam 1 + Season.advanceYear.
   * @param {Object} state @param {RNG} rng @param {string} teamId @param {Object} [contract] rookie Contract
   * @param {{reason?:string, startsK1?:boolean}} [opts]
   * @returns {{teamId:string, role:string, contract:Object}}
   */
  Career.enterNfl = function (state, rng, teamId, contract, opts) {
    opts = opts || {};
    var C = need(Contracts(), 'Contracts', 'enterNfl'), Se = need(Season(), 'Season', 'enterNfl');
    var lg = leagueObj(state, 'NFL'), team = teamIn(lg, teamId);
    if (!team) fail('enterNfl', 'unknown NFL team ' + teamId);
    var p = state.player, S0 = Tuning.soft.start, f = sflags(state);
    var deal = contract ? Util.deepClone(contract) : C.rookieDeal(f.draft && f.draft.round ? f.draft.round : 'UDFA', state.year);
    var udfa = deal.type === 'UDFA';
    var startsK1 = udfa ? false : (opts.startsK1 !== undefined ? !!opts.startsK1 : rookieStartsK1(team, ovrOf(p.attrs)));
    if (udfa) f.UDFA = true;
    if (p.contract) { closeContractRecord(state, 'EXPIRED'); p.contract = null; }
    p.nil = 0;
    delete pflags(state).nearHome;
    Career.changeTeam(state, rng, teamId, {
      trust: Tuning.contracts.changeTeam.trust, js: startsK1 ? S0.jsStarter : S0.jsBackup,
      reason: opts.reason || (udfa ? 'UDFA' : 'DRAFTED'), role: startsK1 ? 'K1' : 'K2'
    });                                                                                               // 1 draw
    deal.teamId = teamId;
    deal.startsK1 = startsK1;
    deal.reason = opts.reason || (udfa ? 'UDFA' : 'DRAFTED');
    if (deal.id === undefined) deal.id = udfa ? 'UDFA_DEAL' : 'ROOKIE_DEAL';
    C.sign(state, deal, rng);
    state.stage = 'NFL';
    p.nflSeasons = num(p.nflSeasons, 0);
    delete f.declared; delete f.combinePlan; delete f.offseason; delete f.springLeague; delete f.noOfferSeasons;
    message(state, 'agent_rookie', { team: team.name });
    Se.advanceYear(state, rng);
    return { teamId: teamId, role: p.role, contract: p.contract };
  };

  // ═══════════════════════════════ §2.7.7 contracts (chain steps & decisions) ═══════════════════════════════

  function contractExpiring(state) {
    var C = Contracts(), p = state.player;
    return !!p.contract && !!C && isFn(C.inFinalYear) && C.inFinalYear(state);
  }

  /** The team tags the player after failed talks (§2.7.7): Contracts.applyTag (1 draw when eligible) → pending TAG info. */
  function tryTag(state, rng, ch) {
    var C = Contracts(), p = state.player;
    if (!C || !isFn(C.applyTag) || !C.applyTag(state, rng)) return false;
    ch.resigned = true;
    var consecutive = num(p.tags, 0) > 1;
    setPending(state, decision('TAG', { aav: p.contract.aav, years: 1, consecutive: consecutive, tags: p.tags }, [
      option('OK', 'Sign the tender', '1 year · ' + Util.fmtMoney(p.contract.aav) + ' fully guaranteed · morale −' + Math.abs(Tuning.contracts.tag.morale))
    ]));
    headline(state, rng, 'contract', { money: p.contract.aav, years: 1, text: '{team} slap the franchise tag on {last}: ' + Util.fmtMoney(p.contract.aav) + ' for one year' });   // 1 draw
    message(state, 'agent_tag', { money: p.contract.aav });
    timeline(state, 'TAG', 'Franchise-tagged (' + Util.fmtMoney(p.contract.aav) + ')', 2);
    return true;
  }

  /** Sign an offer (extension / FA / ring chase): Contracts.sign (+ changeTeam when the team differs). Draws: changeTeam 1 when moving · headline 1. */
  function signOffer(state, rng, offer, ch, tag) {
    var C = need(Contracts(), 'Contracts', 'decide'), p = state.player;
    var contract = C.sign(state, offer, rng);
    if (ch) ch.resigned = true;
    delete sflags(state).noOfferSeasons;
    delete sflags(state).springLeague;
    var team = userTeam(state);
    headline(state, rng, tag || 'contract', { money: contract.aav, years: contract.years, team: teamName(team),
      text: '{last} signs a ' + contract.years + '-year, ' + Util.fmtMoney(Util.round1(contract.aav * contract.years)) + ' deal with ' + teamName(team) });   // 1 draw
    message(state, tag === 'fa' ? 'agent_fa' : 'agent_extension', { money: contract.aav, years: contract.years, team: teamName(team) });
    timeline(state, 'CONTRACT', contract.years + ' yr · ' + Util.fmtMoney(contract.aav) + '/yr with ' + teamName(team) + (offer.hometownDiscount ? ' (hometown discount)' : ''), 2);
    return contract;
  }

  /** The offseason ends without an NFL deal: teamless, noOfferSeasons += 1 (§2.7.7 / §2.7.8). */
  function endWithoutDeal(state, rng, ch, reason) {
    var f = sflags(state);
    leaveTeam(state, rng, reason);
    f.noOfferSeasons = num(f.noOfferSeasons, 0) + 1;
    if (ch) ch.noOffers = true;
    headline(state, rng, 'fa', { text: '{last} enters the season without a team' + (reason === 'SIT_OUT' ? ' by choice' : '; no offers on the table') });   // 1 draw
    message(state, 'agent_market', {});
  }

  /** FA decision + the SIT_OUT option every list carries (also when no offers arrive). */
  function faDecision(state, rng, opts) {
    var C = need(Contracts(), 'Contracts', 'decide');
    var dec = C.generateOffers(state, rng, 'FA', opts || {});
    dec.options.push(option('SIT_OUT', dec.payload.offers.length ? 'Sit the year out' : 'Go without a team this year', 'No contract this season (two offer-less offseasons in a row end a career)'));
    return dec;
  }

  // ═══════════════════════════════ §2.7.8 retirement ═══════════════════════════════

  /**
   * Why retirement is forced now, or null (§2.7.8): age 42, two offseasons without a contract, a career-threat
   * injury with no comeback in sight, a farewell tour, a second spring-league failure.
   * @param {Object} state @returns {string|null}
   */
  Career.forcedRetirement = function (state) {
    var R = Tuning.contracts.retirement, F = Tuning.contracts.fa, p = state.player, f = sflags(state);
    if (p.age >= R.forcedAge) return 'AGE';
    if (num(f.noOfferSeasons, 0) >= F.noOffersRetireAfter) return 'NO_CONTRACT';
    if (p.injury && p.injury.careerThreat && p.age >= R.offerFromAge && num(p.injury.weeksLeft, 0) >= TC().retire.injuryWeeksForced) return 'INJURY';
    if (f.farewell) return 'FAREWELL';
    if (f.springLeague && typeof f.springLeague === 'object' && num(f.springLeague.failures, 0) >= Tuning.draft.springLeague.maxFailures) return 'SPRING_LEAGUE';
    return null;
  };

  function docTitle(state, rng, tier) {
    var list = DOC_TITLES[tier] || DOC_TITLES.Journeyman;
    var tpl = rng.pick(list);                                                                         // 1 draw
    var p = state.player, name = p.name || {};
    return String(tpl).replace(/\{name\}/g, name.full || 'The Kicker').replace(/\{last\}/g, name.last || name.full || 'The Kicker');
  }

  /**
   * Retire (§2.7.8 / §2.7.9): closes the contract and stint, stage RETIRED / phase LEGACY, the HOF verdict as the
   * pending HOF decision, and the LegacyReport {tier, hof, line, moments, records, docTitle, timeline}. Draws: docTitle pick 1 · headline 1.
   * @param {Object} state @param {RNG} rng @param {string} [reason='CHOICE'] @returns {Object} LegacyReport
   */
  Career.retire = function (state, rng, reason) {
    var A = need(Awards(), 'Awards', 'retire'), St = Stats(), p = state.player, f = sflags(state);
    reason = reason || 'CHOICE';
    if (p.contract) { closeContractRecord(state, 'RETIRED'); p.contract = null; }
    if (p.teamId) { restoreRoster(state, p.league, p.teamId); closeStint(state, 'RETIRED'); }
    p.role = 'NONE';
    p.injury = null;
    state.game = null;
    if (state.season) { state.season.userGameId = null; state.season.weekGameDone = true; }
    delete f.offseason; delete f.skipGame; delete f.farewell;
    var hof = A.hofScore(state);
    var line = St && isFn(St.careerLine) ? St.careerLine(state) : null;
    var moments = St && isFn(St.topMoments) ? St.topMoments(state, TC().legacy.moments) : [];
    var records = [];
    if (St && isFn(St.compareToLegends)) {
      var board = St.compareToLegends(state);
      for (var i = 0; i < board.length; i++) if (board[i].isUser) records.push(board[i]);
    }
    var title = docTitle(state, rng, hof.tier);                                                       // 1 draw
    var tl = (state.history.timeline || []).slice(-TC().legacy.timeline);
    var report = {
      tier: hof.tier, hof: hof, line: line, moments: moments, records: records, docTitle: title, timeline: tl,
      seasons: (state.history.seasons || []).length, nflSeasons: num(p.nflSeasons, 0), earnings: num(state.history.earnings, 0),
      age: p.age, retiredYear: state.year, reason: reason, seed: state.seed, name: p.name ? p.name.full : ''
    };
    state.stage = 'RETIRED';
    state.phase = 'LEGACY';
    f.legacy = { tier: hof.tier, score: hof.score, verdict: hof.verdict, inductionYear: hof.inductionYear, docTitle: title, retiredYear: state.year, age: p.age, reason: reason };
    setPending(state, decision('HOF', { score: hof.score, verdict: hof.verdict, tier: hof.tier, inductionYear: hof.inductionYear, breakdown: hof.breakdown, docTitle: title, reason: reason }, [
      option('OK', 'Take a bow', hof.verdict.replace(/_/g, ' ').toLowerCase() + ' · HOF score ' + hof.score)
    ]));
    headline(state, rng, 'retire', { text: '{last} retires at ' + p.age + ' — ' + hof.tier + ', HOF verdict: ' + hof.verdict.replace(/_/g, ' ').toLowerCase(), age: p.age });   // 1 draw
    timeline(state, 'RETIRED', 'Retired at ' + p.age + ' (' + reason.toLowerCase().replace(/_/g, ' ') + ') — ' + hof.tier, 3);
    return report;
  };

  // ═══════════════════════════════ offseason chain (§3.5.18) ═══════════════════════════════

  function chainKey(state) {
    var p = state.player;
    return state.year + ':' + (p.league || (state.season && state.season.league) || 'COLLEGE');
  }

  function stepsFor(state) {
    var p = state.player, f = sflags(state);
    if (p.league === 'NFL' || state.stage === 'NFL') {
      var steps = ['BODY_CHECK', 'TRAINING_BLOCKS', 'CUT_NOTICE', 'EXTENSION'];
      if (f.springLeague && typeof f.springLeague === 'object' && !p.contract) steps.push('REDRAFT');
      return steps.concat(['FREE_AGENCY', 'RETIRE', 'EVENT', 'EVENT']);
    }
    return ['BODY_CHECK', 'TRAINING_BLOCKS', 'REDSHIRT', 'TRANSFER', 'EVENT', 'EVENT', 'DECLARE'];
  }

  /** TRAINING_BLOCKS decision (§2.1.2): 3 blocks of 70·moraleMult (× difficulty xpMult) XP, a focus attribute or the bank. */
  function trainingBlocksDecision(state) {
    var X = Tuning.progression.xp, P = Player(), p = state.player;
    var mm = P && isFn(P.moraleMult) ? P.moraleMult(p.morale) : 1;
    var per = Math.round(X.offseasonBlock * mm * diffRow(state).xpMult);
    var options = [];
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i], v = p.attrs[a];
      var cost = P && isFn(P.costToRaise) ? P.costToRaise(a, v, p.age, false) : 0;
      options.push(option(a, 'Focus ' + a, a + ' ' + v + ' → up to +' + (X.offseasonBlocks * TC().trainingBlocks.raisesPerBlock) + ' (next point ' + cost + ' XP, cap ' + p.pot[a] + ')'));
    }
    options.push(option('BANK', 'Bank the XP', 'Keep every point for the Training screen'));
    return decision('TRAINING_BLOCKS', { blocks: X.offseasonBlocks, xpEach: per, total: per * X.offseasonBlocks, moraleMult: Util.roundN(mm, 3) }, options);
  }

  function applyTrainingBlocks(state, dec, optionId) {
    var P = Player(), p = state.player, R = TC().trainingBlocks;
    var total = num(dec.payload.total, 0);
    p.xp = num(p.xp, 0) + total;
    var raised = 0;
    if (has(ATTRS, optionId) && P && isFn(P.spendXp)) {
      var n = num(dec.payload.blocks, 3) * R.raisesPerBlock;
      for (var i = 0; i < n; i++) {
        var r = P.spendXp(p, optionId);
        if (!r.ok) break;
        raised++;
      }
    }
    timeline(state, 'TRAINING', 'Offseason training: +' + total + ' XP' + (raised ? ', ' + optionId + ' +' + raised : ''), 1);
    return { xp: total, raised: raised, attr: has(ATTRS, optionId) ? optionId : null };
  }

  var STEPS = {
    BODY_CHECK: function (state, rng) {
      var Se = need(Season(), 'Season', 'offseasonChain'), p = state.player, f = sflags(state);
      var bc;
      if (pflags(state).agedYear === state.year && f.bodyCheck) {
        bc = f.bodyCheck;                                                                            // already aged this year
      } else {
        // Preview: the age tick runs on a clone from the current rng state, which is then restored, so the real
        // Season.ageTick at the acknowledgement (HANDLERS.BODY_CHECK) reproduces exactly what the card showed.
        var snap = rng.state();
        var clone = {};
        for (var k in state) if (Object.prototype.hasOwnProperty.call(state, k)) clone[k] = state[k];
        clone.player = Util.deepClone(p);
        clone.flags = Util.deepClone(f);
        var preview = Se.ageTick(clone, rng);                                                        // 2 draws in the growth window (rewound)
        rng.setState(snap);
        bc = { year: preview.year, age: preview.age, changes: preview.changes };
      }
      var lines = [];
      for (var i = 0; i < bc.changes.length; i++) lines.push(bc.changes[i].text);
      setPending(state, decision('BODY_CHECK', { age: bc.age, changes: bc.changes, ovr: ovrOf(p.attrs), preview: pflags(state).agedYear !== state.year }, [
        option('OK', 'Body check: age ' + bc.age, lines.length ? lines.join(' · ') : 'Nothing new — the leg feels fine')
      ]));
    },
    TRAINING_BLOCKS: function (state) { setPending(state, trainingBlocksDecision(state)); },
    REDSHIRT: function (state) {
      var p = state.player, R = TC().redshirt;
      if (p.redshirt || p.league !== 'COLLEGE' || num(p.collegeSeasons, 0) !== R.afterSeason || p.role !== 'K2') return;
      setPending(state, decision('REDSHIRT', { season: p.collegeSeasons, role: p.role }, [
        option('REDSHIRT', 'Take the redshirt', 'This season does not count toward the 3-season eligibility clock'),
        option('PLAY', 'No redshirt', 'Keep the clock running')
      ]));
    },
    TRANSFER: function (state, rng, ch) {
      var p = state.player, G = Tuning.events.gates, f = sflags(state);
      if (p.league !== 'COLLEGE' || !p.teamId) return;
      var open = p.js < G.portalJs || p.trust < G.portalTrust || pflags(state).lostJob === state.year || !!f.transferRequested;
      delete f.transferRequested;
      if (!open) return;
      var dec = Career.generateCollegeOffers(state, rng, 'TRANSFER');                              // 1 draw
      ch.portal = true;
      setPending(state, dec);
    },
    CUT_NOTICE: function (state, rng) {
      var C = Contracts(), p = state.player;
      if (!C || !p.contract || !p.teamId || p.league !== 'NFL') return;
      var cut = C.cutCheck(state, rng);
      if (!cut) return;
      var team = userTeam(state);
      var r = C.applyCut(state, 'CUT');
      restoreRoster(state, 'NFL', p.teamId);
      closeStint(state, 'CUT');
      var name = teamName(team);
      p.teamId = null;
      clearJobFlags(state);
      headline(state, rng, 'cut', { team: name, text: name + ' release {last}: ' + cut.text });      // 1 draw
      message(state, 'gm_release', { team: name });
      message(state, 'agent_cut', { team: name });
      timeline(state, 'CUT', 'Released by ' + name + ' — ' + cut.text, 3);
      setPending(state, decision('CUT_NOTICE', { reason: cut.reason, text: cut.text, deadMoney: r.deadMoney, teamId: team ? team.id : null, fgPct: cut.fgPct, ovr: cut.ovr, js: cut.js }, [
        option('OK', 'Released', cut.text + (r.deadMoney ? ' · ' + Util.fmtMoney(r.deadMoney) + ' guaranteed still paid' : ''))
      ]));
    },
    EXTENSION: function (state, rng, ch) {
      var C = Contracts(), p = state.player;
      if (!C || !p.contract || !p.teamId || p.league !== 'NFL' || ch.resigned) return;
      var dec = C.extensionOffer(state, rng);                                                        // 2 draws when eligible
      if (!dec) return;
      message(state, 'agent_extension', { money: dec.payload.offer.aav, years: dec.payload.offer.years });
      setPending(state, dec);
    },
    REDRAFT: function (state, rng, ch) {
      var p = state.player;
      if (p.contract || p.teamId) return;
      ch.done = true;
      delete sflags(state).offseason;
      state.stage = 'DRAFT';
      state.phase = 'DRAFT';
      Career.runDraft(state, rng);
    },
    FREE_AGENCY: function (state, rng, ch) {
      var C = Contracts(), p = state.player;
      if (!C || p.league !== 'NFL' || ch.resigned) return;
      var expiring = contractExpiring(state);
      if (p.contract && !expiring) return;
      var opts = {};
      if (p.teamId) opts.exclude = [p.teamId];
      var dec = faDecision(state, rng, opts);                                                        // 1 + n draws
      if (!dec.payload.offers.length) {
        message(state, 'agent_market', {});
        timeline(state, 'FA', 'Free agency opens — the phone stays quiet', 2);
      } else {
        message(state, 'agent_fa', { n: dec.payload.offers.length });
      }
      setPending(state, dec);
    },
    RETIRE: function (state, rng) {
      var R = Tuning.contracts.retirement, p = state.player;
      if (p.league !== 'NFL') return;
      var forced = Career.forcedRetirement(state);
      if (!forced && p.age < R.offerFromAge) return;
      var options = [];
      if (forced) {
        options.push(option('RETIRE', 'Retire', forcedText(forced)));
      } else {
        options.push(option('ONE_MORE_YEAR', 'One more year', 'Keep kicking' + (p.contract ? '' : ' — if someone calls')));
        options.push(option('RETIRE', 'Retire', 'Hang up the boots at ' + p.age));
        if (!p.contract || contractExpiring(state)) options.push(option('RING_CHASE', 'Ring chase', 'Take a vet-minimum deal from a top-' + R.ringChaseTopN + ' team, if one calls'));
      }
      setPending(state, decision('RETIRE', { age: p.age, forced: forced, ovr: ovrOf(state.player.attrs), hof: Awards() && isFn(Awards().hofScore) ? Awards().hofScore(state).score : null }, options));
    },
    EVENT: function (state, rng, ch) {
      var E = Events();
      if (!E || !isFn(E.roll)) return;
      if (E.roll(state, rng, 'offseason')) ch.events = num(ch.events, 0) + 1;                         // 1–2 draws
    },
    DECLARE: function (state, rng, ch) {
      var p = state.player;
      if (p.league !== 'COLLEGE' || !p.teamId) return;
      var el = Career.eligibility(state);
      if (!el.canDeclare) return;
      if (ch.transferred && !el.senior) return;
      ch.done = true;
      Career.enterDraft(state, rng);
    }
  };

  var FORCED_TEXT = { AGE: 'Forty-two. The league has a rule and so does gravity.', NO_CONTRACT: 'Two offseasons without a contract — the phone has stopped ringing.',
    INJURY: 'The doctors are clear: the leg is done.', FAREWELL: 'The farewell tour is over.' };
  function forcedText(reason) { return FORCED_TEXT[reason] || 'No professional deal materialised.'; }

  /** Run chain steps until one sets a pending or the chain ends. */
  function advanceChain(state, rng, ch) {
    var guard = ch.steps.length + 2;
    while (!ch.done && guard-- > 0) {
      if (state.pending) return ch;
      if (ch.idx >= ch.steps.length) { ch.done = true; break; }
      var id = ch.steps[ch.idx++];
      STEPS[id](state, rng, ch);
      ch.log.push(id);
      if (sflags(state).offseason !== ch) return ch;                                                  // a step replaced / dropped the chain (REDRAFT, spring league)
    }
    return ch;
  }

  /**
   * Open the offseason wizard chain (§3.5.18), idempotent per season (Season.offseason and Engine.nextPhase may both
   * call it; the same chain object is returned). Pays the season's money first (Contracts.payoutSeason; NIL fame /
   * morale and nearHome morale for college), then runs the steps in order until one needs the user:
   *   college: BODY_CHECK → TRAINING_BLOCKS → REDSHIRT? → TRANSFER? → EVENT ×2 → DECLARE?
   *   NFL    : BODY_CHECK → TRAINING_BLOCKS → CUT_NOTICE? → EXTENSION? → [REDRAFT] → FREE_AGENCY? → RETIRE? → EVENT ×2
   * (DEVIATION: college events roll before DECLARE because DECLARE moves the stage to DRAFT.) Each step sets
   * state.pending = {kind:'DECISION'|'EVENT'|'KICKS', …}; Career.resume continues the chain after every resolution.
   * @param {Object} state @param {RNG} rng @returns {Object} the chain {key, year, league, steps, idx, done, log}
   */
  Career.offseasonChain = function (state, rng) {
    var f = sflags(state), p = state.player, key = chainKey(state);
    if (f.offseason && f.offseason.key === key) return f.offseason;
    var C = Contracts();
    if (C && isFn(C.payoutSeason)) C.payoutSeason(state);
    if (p.league === 'COLLEGE' && p.teamId) {
      var N = Tuning.contracts.nil;
      if (num(p.nil, 0) > 0) {
        p.fame = clamp(Util.round1(num(p.fame, 0) + N.famePerYear), 0, Tuning.soft.fame.max);
        p.morale = soft(p.morale + N.moralePerYear);
      }
      if (pflags(state).nearHome) p.morale = soft(p.morale + TC().college.nearHomeMorale);
    }
    var ch = { key: key, year: state.year, league: p.league || (state.season && state.season.league) || 'COLLEGE', steps: stepsFor(state), idx: 0, done: false,
      log: [], resigned: false, talksFailed: false, transferred: false, noOffers: false, events: 0, portal: false };
    f.offseason = ch;
    advanceChain(state, rng, ch);
    return ch;
  };

  /**
   * Continue the offseason chain after a pending was resolved (Engine.decide / chooseEvent / sessionKick call it).
   * No-op outside an active chain of the current season or while something is pending.
   * @param {Object} state @param {RNG} rng @returns {Object|null} the chain
   */
  Career.resume = function (state, rng) {
    var ch = sflags(state).offseason;
    if (!ch || ch.done || state.pending || state.phase !== 'OFF' || ch.key !== chainKey(state)) return ch || null;
    return advanceChain(state, rng, ch);
  };

  // ═══════════════════════════════ §3.5.18 decide ═══════════════════════════════

  var HANDLERS = {
    OFFERS_COLLEGE: function (state, rng, dec, opt, extra, out) {
      var offer = collegeOfferFor(dec, opt.id);
      if (!offer) fail('decide', 'no offer ' + opt.id);
      out.result = acceptCollegeOffer(state, rng, offer, 'RECRUIT');
    },
    TRANSFER: function (state, rng, dec, opt, extra, out) {
      if (opt.id === 'STAY') { out.result = { transferred: false }; return; }
      var offer = collegeOfferFor(dec, opt.id);
      if (!offer) fail('decide', 'no offer ' + opt.id);
      out.result = acceptCollegeOffer(state, rng, offer, 'TRANSFER');
    },
    REDSHIRT: function (state, rng, dec, opt, extra, out) {
      var p = state.player;
      if (opt.id === 'REDSHIRT') {
        p.redshirt = true;
        pflags(state).redshirtYear = state.year;
        timeline(state, 'REDSHIRT', 'Redshirt season', 1);
      }
      out.result = { redshirt: opt.id === 'REDSHIRT' };
    },
    DECLARE: function (state, rng, dec, opt, extra, out) {
      if (opt.id === 'DECLARE') { declare(state, rng, false); out.result = { declared: true }; return; }
      state.stage = 'COLLEGE';
      state.phase = 'OFF';
      timeline(state, 'STAY', 'Stays in school for another season', 1);
      out.result = { declared: false };
    },
    COMBINE_PLAN: function (state, rng, dec, opt, extra, out) {
      var D = need(Draft(), 'Draft', 'decide');
      sflags(state).combinePlan = opt.id === 'SAFE' ? 'SAFE' : 'SHOW';
      var sess = D.combineSession(state, rng, { plan: sflags(state).combinePlan });
      state.pending = { kind: 'KICKS', session: sess };
      out.result = { plan: sflags(state).combinePlan, kicks: sess.contexts.length };
    },
    UDFA: function (state, rng, dec, opt, extra, out) {
      var C = need(Contracts(), 'Contracts', 'decide');
      var offer = C.offerFor(dec, opt.id);
      if (!offer) fail('decide', 'no invite ' + opt.id);
      timeline(state, 'UDFA', 'Signs a UDFA deal with ' + offer.teamName, 2);
      out.result = Career.enterNfl(state, rng, offer.teamId, Object.assign(C.rookieDeal('UDFA', state.year), { id: offer.id }), { reason: 'UDFA' });
    },
    EXTENSION: function (state, rng, dec, opt, extra, out) {
      var C = need(Contracts(), 'Contracts', 'decide'), ch = sflags(state).offseason || {};
      if (opt.id === 'ACCEPT') { out.result = { signed: true, contract: signOffer(state, rng, dec.payload.offer, ch, 'contract') }; return; }
      if (opt.id === 'COUNTER') {
        var r = C.counter(state, rng, dec, extra && extra.mode === 'YEARS' ? 'YEARS' : 'AAV');     // 1 draw
        if (r.accepted) { out.result = { signed: true, countered: true, contract: signOffer(state, rng, r.offer, ch, 'contract') }; return; }
        if (r.stands) {
          dec.options = [findOption(dec, 'ACCEPT'), findOption(dec, 'DECLINE')];
          dec.payload.countered = true;
          setPending(state, dec);
          headline(state, rng, 'contract', { text: '{team} reject {last}\'s counter; the original offer stands' });   // 1 draw
          out.result = { signed: false, countered: true, stands: true };
          return;
        }
        headline(state, rng, 'contract', { text: '{team} pull their extension offer after {last}\'s counter' });   // 1 draw
        out.result = { signed: false, countered: true, stands: false, tagged: tryTag(state, rng, ch) };
        ch.talksFailed = true;
        return;
      }
      ch.talksFailed = true;
      timeline(state, 'CONTRACT', 'Declines the extension — testing the market', 2);
      out.result = { signed: false, declined: true, tagged: tryTag(state, rng, ch) };
    },
    FREE_AGENCY: function (state, rng, dec, opt, extra, out) {
      var C = need(Contracts(), 'Contracts', 'decide'), ch = sflags(state).offseason || null;
      if (opt.id === 'WAIT') {
        C.waitRound(state, rng, dec);
        var hasSit = !!findOption(dec, 'SIT_OUT');
        if (!hasSit && state.phase === 'OFF') dec.options.push(option('SIT_OUT', 'Go without a team this year', 'No contract this season'));
        setPending(state, dec);
        out.result = { waited: true, round: dec.payload.round, offers: dec.payload.offers.length };
        return;
      }
      if (opt.id === 'SIT_OUT') {
        if (state.phase === 'OFF') endWithoutDeal(state, rng, ch, 'SIT_OUT'); else sflags(state).faWait = true;
        out.result = { signed: false, sitOut: true };
        return;
      }
      var offer = C.offerFor(dec, opt.id);
      if (!offer) fail('decide', 'no offer ' + opt.id);
      delete sflags(state).faWait;
      delete sflags(state).cutNoOffers;
      delete sflags(state).practiceSquad;
      out.result = { signed: true, contract: signOffer(state, rng, offer, ch, 'fa'), teamId: offer.teamId };
    },
    TAG: function (state, rng, dec, opt, extra, out) { out.result = { tagged: true }; },
    RETIRE: function (state, rng, dec, opt, extra, out) {
      var C = Contracts(), p = state.player, ch = sflags(state).offseason || null;
      if (opt.id === 'RETIRE') { out.result = { retired: true, report: Career.retire(state, rng, dec.payload && dec.payload.forced ? dec.payload.forced : 'CHOICE') }; return; }
      if (opt.id === 'RING_CHASE' && C) {
        var opts = { ringChase: true };
        if (p.teamId) opts.exclude = [p.teamId];
        var d2 = C.generateOffers(state, rng, 'MIN', opts);                                          // 1 + n draws
        if (d2.payload.offers.length) {
          d2.options.push(option('SIT_OUT', 'Never mind', 'Stay a free agent'));
          setPending(state, d2);
          out.result = { retired: false, ringChase: true, offers: d2.payload.offers.length };
          return;
        }
        message(state, 'agent_market', {});
        out.result = { retired: false, ringChase: true, offers: 0 };
        return;
      }
      timeline(state, 'RETIRE', 'One more year', 1);
      out.result = { retired: false, oneMoreYear: true };
    },
    TRAINING_BLOCKS: function (state, rng, dec, opt, extra, out) { out.result = applyTrainingBlocks(state, dec, opt.id); },
    HOF: function (state, rng, dec, opt, extra, out) { sflags(state).legacyAcked = true; out.result = { acknowledged: true }; },
    OFFSEASON_PLAN: function (state, rng, dec, opt, extra, out) { out.result = { acknowledged: true }; },
    BODY_CHECK: function (state, rng, dec, opt, extra, out) {
      var Se = Season();
      var bc = Se && isFn(Se.ageTick) ? Se.ageTick(state, rng) : null;                              // the real age tick (2 draws in the growth window)
      out.result = { acknowledged: true, age: bc ? bc.age : state.player.age, changes: bc ? bc.changes : [] };
    },
    CUT_NOTICE: function (state, rng, dec, opt, extra, out) { out.result = { acknowledged: true }; },
    CAMP: function (state, rng, dec, opt, extra, out) { out.result = { acknowledged: true }; }
  };

  /**
   * The single entry point for every Decision kind (§3.4 / §3.5.18). The pending decision must match `kind`; the
   * option id must exist (missing → the first option). Unknown kinds throw. After the handler the offseason chain
   * resumes (Career.resume). Returns {kind, optionId, next:'PENDING'|'PHASE', stage, phase, result}.
   * @param {Object} state @param {RNG} rng @param {{kind:string, optionId?:string, extra?:Object}} arg
   * @returns {Object} DecisionOutcome
   */
  Career.decide = function (state, rng, arg) {
    arg = arg || {};
    var kind = arg.kind;
    if (!has(DECISION_KINDS, kind)) fail('decide', 'unknown decision kind "' + kind + '"');
    var pd = state.pending;
    if (!pd || pd.kind !== 'DECISION' || !pd.decision) fail('decide', 'no pending decision (wanted ' + kind + ')');
    if (pd.decision.kind !== kind) fail('decide', 'the pending decision is ' + pd.decision.kind + ', not ' + kind);
    var dec = pd.decision;
    var optionId = arg.optionId === undefined || arg.optionId === null ? (dec.options[0] ? dec.options[0].id : null) : arg.optionId;
    var opt = findOption(dec, optionId);
    if (!opt) fail('decide', 'unknown option "' + optionId + '" for ' + kind);
    state.pending = null;
    var out = { kind: kind, optionId: opt.id, next: 'PHASE', headline: null, timeline: null, result: null };
    var hlBefore = Array.isArray(state.headlines) ? state.headlines.length : 0;
    var tlBefore = Array.isArray(state.history.timeline) ? state.history.timeline.length : 0;
    HANDLERS[kind](state, rng, dec, opt, arg.extra || {}, out);
    if (Array.isArray(state.headlines) && state.headlines.length > hlBefore) out.headline = state.headlines[state.headlines.length - 1];
    if (Array.isArray(state.history.timeline) && state.history.timeline.length > tlBefore) out.timeline = state.history.timeline[state.history.timeline.length - 1];
    Career.resume(state, rng);
    out.next = state.pending ? 'PENDING' : 'PHASE';
    out.stage = state.stage;
    out.phase = state.phase;
    return out;
  };

  // ═══════════════════════════════ §2.10.1 event actions ═══════════════════════════════

  /** Best-record needy NFL team other than the user's (CONTENDER_CALL). */
  function bestContender(state) {
    var C = Contracts(), lg = leagueObj(state, 'NFL'), p = state.player;
    if (!lg) return null;
    var pool = C && isFn(C.teamsNeedingK) ? C.teamsNeedingK(lg) : lg.teams.slice();
    var results = state.season && state.season.league === 'NFL' ? state.season.results || {} : {};
    var best = null, bestPct = -1;
    for (var i = 0; i < pool.length; i++) {
      var t = pool[i];
      if (t.id === p.teamId) continue;
      var r = results[t.id], g = r ? r.w + r.l + r.t : 0;
      var pct = g ? (r.w + 0.5 * r.t) / g : 0.5;
      if (pct > bestPct) { bestPct = pct; best = t; }
    }
    return best;
  }

  var ACTION = {
    TRANSFER: function (state, rng) {
      var p = state.player;
      if (p.league !== 'COLLEGE') return { ok: false, detail: 'not in college' };
      if (state.phase === 'OFF' && !state.pending) {
        setPending(state, Career.generateCollegeOffers(state, rng, 'TRANSFER'));                     // 1 draw
        return { ok: true, detail: 'portal offers' };
      }
      sflags(state).transferRequested = true;
      return { ok: true, detail: 'portal opens in the offseason' };
    },
    TRADE: function (state, rng) {
      var TE = Tuning.events.trade, CT = Tuning.contracts.changeTeam, p = state.player, C = Contracts();
      if (p.league !== 'NFL' || !p.teamId) return { ok: false, detail: 'no NFL team' };
      p.trust = soft(p.trust + TE.trust);
      if (!rng.chance(TE.execProb)) {                                                                 // 1 draw
        headline(state, rng, 'trade', { text: '{team} deny {last}\'s trade request: "he\'s our kicker"' });   // 1 draw
        return { ok: true, executed: false };
      }
      var lg = leagueObj(state, 'NFL');
      var pool = (C && isFn(C.teamsNeedingK) ? C.teamsNeedingK(lg) : lg.teams).filter(function (t) { return t.id !== p.teamId; });
      if (!pool.length) pool = lg.teams.filter(function (t) { return t.id !== p.teamId; });
      var team = rng.pick(pool);                                                                       // 1 draw
      Career.changeTeam(state, rng, team.id, { trust: CT.trust, js: CT.js, reason: 'TRADE' });        // 1 draw
      return { ok: true, executed: true, teamId: team.id };
    },
    HOLDOUT: function (state, rng) {
      var f = sflags(state), H = Tuning.contracts.holdout, C = Contracts(), p = state.player;
      var year = state.phase === 'OFF' ? state.year + 1 : state.year;
      f.skipGame = { year: year, week: 1, reason: 'HOLDOUT' };
      timeline(state, 'HOLDOUT', 'Holding out of week 1', 2);
      if (f.holdoutExtension && C && p.teamId && p.league === 'NFL') {
        delete f.holdoutExtension;
        var mv = C.marketValue(state), team = userTeam(state);
        var offer = { id: 'HOLDOUT', teamId: p.teamId, teamName: team ? team.name : p.teamId, type: 'VET', years: mv.years,
          aav: Math.max(mv.vetMin, Util.round1(mv.aav * H.extensionAav)), gtdPct: mv.gtdPct, startsK1: true, reason: 'HOLDOUT', hometownDiscount: false };
        signOffer(state, rng, offer, f.offseason || null, 'contract');                                 // 1 draw
        return { ok: true, extension: true };
      }
      if (f.tagThreat) { delete f.tagThreat; if (f.offseason) f.offseason.talksFailed = true; }
      return { ok: true, extension: false };
    },
    CAMP_BATTLE: function (state, rng) {
      if (!state.player.teamId) return { ok: false, detail: 'no team' };
      if (state.pending) return { ok: false, detail: 'something else is pending' };
      Career.campBattle(state, rng);
      return { ok: true, detail: 'camp battle' };
    },
    CHANGE_TEAM: function (state, rng) {
      var CT = Tuning.contracts.changeTeam, team = bestContender(state);
      if (!team) return { ok: false, detail: 'no contender' };
      Career.changeTeam(state, rng, team.id, { trust: CT.trust, js: CT.js, reason: 'TRADE' });        // 1 draw
      return { ok: true, teamId: team.id };
    },
    SKIP_GAME: function (state) {
      sflags(state).skipGame = { year: state.year, week: state.week, reason: 'EVENT' };
      return { ok: true };
    },
    INJURY: function (state, rng) {
      var p = state.player, I = Tuning.progression.injury.types[0];
      if (p.injury) return { ok: false, detail: 'already injured' };
      p.injury = { type: I.type, label: I.label, weeksLeft: rng.int(I.weeks[0], I.weeks[1]), careerThreat: false };   // 1 draw
      timeline(state, 'INJURY', 'Injured: ' + I.label + ' (' + p.injury.weeksLeft + ' wk)', 2);
      return { ok: true, weeks: p.injury.weeksLeft };
    },
    RETIRE: function (state, rng) {
      if (state.phase === 'OFF' || state.stage === 'DRAFT') { Career.retire(state, rng, 'CHOICE'); return { ok: true, retired: true }; }
      sflags(state).farewell = true;
      return { ok: true, retired: false, detail: 'retires after the season' };
    },
    HALFTIME70: function () { return { ok: true, detail: 'handled by Events.apply' }; }
  };

  /**
   * Execute event actions (§2.10.1): TRANSFER, TRADE (40 % executed, trust −15), HOLDOUT (skip week 1; the
   * branch flags decide extension ×1.10 / tag threat), CAMP_BATTLE, CHANGE_TEAM (best-record needy contender),
   * SKIP_GAME, INJURY, RETIRE (offseason: now; in season: farewell flag), HALFTIME70 (no-op here).
   * @param {Object} state @param {RNG} rng @param {string[]} actions
   * @returns {Array<{action:string, ok:boolean}>}
   */
  Career.handleActions = function (state, rng, actions) {
    var out = [];
    if (!Array.isArray(actions)) return out;
    for (var i = 0; i < actions.length; i++) {
      var a = actions[i];
      if (!has(ACTIONS, a)) { out.push({ action: a, ok: false, detail: 'unknown action' }); continue; }
      var r = ACTION[a](state, rng) || { ok: true };
      r.action = a;
      out.push(r);
    }
    return out;
  };

  // ═══════════════════════════════ weekly hook (practice squad / FA wait) ═══════════════════════════════

  /**
   * After Season.endWeek (RTG.Engine.endWeek calls it): a teamless NFL player's week — practice squad call-up
   * (30 %/week for 6 weeks, training XP ×0.5 via a trainMult mod) or a free-agent's vet-minimum call (p 0.4 →
   * pending FREE_AGENCY); expired skipGame flags are dropped. Draws: 1 roll (+ offers) only for a teamless NFL player.
   * @param {Object} state @param {RNG} rng @returns {{callUp:boolean, offers:number, practiceSquad:boolean}}
   */
  Career.afterWeek = function (state, rng) {
    var f = sflags(state), p = state.player, out = { callUp: false, offers: 0, practiceSquad: false };
    if (f.skipGame && (f.skipGame.year < state.year || (f.skipGame.year === state.year && f.skipGame.week < state.week))) delete f.skipGame;
    if (state.pending || p.league !== 'NFL' || p.teamId || !IN_SEASON[state.phase]) return out;
    var C = Contracts(), P = Player(), PS = Tuning.contracts.fa.practiceSquad, lg = leagueObj(state, 'NFL');
    if (f.practiceSquad && typeof f.practiceSquad === 'object') {
      out.practiceSquad = true;
      var ps = f.practiceSquad;
      if (!ps.modAdded && P && isFn(P.addMod)) {
        P.addMod(p, { id: 'practiceSquad:trainMult', key: 'trainMult', op: 'mul', value: PS.xpMult, expires: { type: 'season', at: state.year }, label: 'Practice squad', source: 'CUT_DAY_CALL' });
        ps.modAdded = true;
      }
      ps.weeksLeft = num(ps.weeksLeft, PS.weeks) - 1;
      if (rng.chance(PS.callUpProb) && C) {                                                           // 1 draw
        var pool = C.teamsNeedingK(lg);
        if (!pool.length) pool = lg.teams;
        var team = rng.pick(pool);                                                                     // 1 draw
        p.mods = (p.mods || []).filter(function (m) { return m.id !== 'practiceSquad:trainMult'; });
        delete f.practiceSquad;
        delete f.cutNoOffers;
        signOffer(state, rng, { id: 'CALL_UP', teamId: team.id, teamName: team.name, type: 'MIN', years: 1, aav: Util.round1(num(lg.vetMin, Tuning.contracts.vetMinStart)), gtdPct: 0, startsK1: true, reason: 'CALL_UP', hometownDiscount: false }, null, 'fa');
        out.callUp = true;
      } else if (ps.weeksLeft <= 0) {
        p.mods = (p.mods || []).filter(function (m) { return m.id !== 'practiceSquad:trainMult'; });
        delete f.practiceSquad;
        f.faWait = true;
        timeline(state, 'FREE_AGENT', 'Practice squad stint ends', 1);
      }
      return out;
    }
    if (C && rng.chance(Tuning.contracts.fa.newOfferProb)) {                                           // 1 draw
      var dec = C.generateOffers(state, rng, 'MIN');
      if (dec.payload.offers.length) {
        dec.options.push(option('SIT_OUT', 'Keep waiting', 'Stay a free agent'));
        setPending(state, dec);
        out.offers = dec.payload.offers.length;
        message(state, 'agent_fa', { n: out.offers });
      }
    }
    return out;
  };

  // ═══════════════════════════════ stage info ═══════════════════════════════

  /**
   * The career act (§1.4) for the current stage.
   * @param {Object} state @returns {{act:number, label:string, stage:string, phase:string}}
   */
  Career.stageInfo = function (state) {
    var s = state.stage, age = state.player ? num(state.player.age, 18) : 18;
    var act, label;
    if (s === 'HS' || s === 'COLLEGE') { act = 1; label = 'Act I — Prove it'; }
    else if (s === 'RETIRED') { act = 4; label = 'Legacy'; }
    else if (s === 'DRAFT' || age < TC().acts.holdOnAge) { act = 2; label = 'Act II — Get paid'; }
    else { act = 3; label = 'Act III — Hold on'; }
    return { act: act, label: label, stage: s, phase: state.phase };
  };

  Career.DECISION_KINDS = DECISION_KINDS.slice();
  Career.ACTIONS = ACTIONS.slice();
  RTG.Career = Career;
})(typeof window !== 'undefined' ? window : globalThis);
