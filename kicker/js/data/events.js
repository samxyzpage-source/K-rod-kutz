/**
 * Road to Glory: Kicker — narrative event catalog (SPEC §2.10.2, 39 events incl. 9b).
 *
 * RTG.Data.events     : Event[] in catalog order
 * RTG.Data.eventsById : {[id]: Event}
 *
 * Event = { id, n (catalog number), stage:[...], phase:[...], once, weight:number|fn(state),
 *           cond: fn(state)→bool, sender, title, text, headline?, choices:[Choice] }
 * Choice = { label, preview, effects: Effects, headline?, branches?: [Branch] }
 * Branch = { p, effects, headline?, else?: {effects, headline?} }   // 1 rng draw each (Events.apply)
 * Effects = { morale?, trust?, fans?, fame?, js?, xp?, money? ($k), attrs?:{ACC:+2}, mods?:[Mod],
 *             flags?:{k:v}, action?: string|fn(state)→string, headline?, trait?, injury? }
 * Mod    = Modifier literal whose `expires` may be RELATIVE: {type:'week'|'game', n} — the engine
 *          converts it to an absolute `at` when the effect is applied (Events.apply).
 *
 * Every `cond` is a pure function over `state` (no rng, no clock). Thresholds come from
 * Tuning.events.gates; the numbers inside effects ARE the §2.10.2 table.
 * Templates may use {name} {first} {last} {coach} {team} {city} {rival} {opp} {dist} {agent} {week}.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.Data = RTG.Data || {};

  // ───────────────────────────── helpers over state (call-time) ─────────────────────────────

  function G() { return RTG.Tuning.events.gates; }
  function T() { return RTG.Tuning; }
  function P(s) { return s.player; }
  function flags(s) { return (s.flags || {}); }
  function pflags(s) { return (s.player && s.player.flags) || {}; }
  function flag(s, k) { var v = flags(s)[k]; return v !== undefined ? v : pflags(s)[k]; }
  function ovr(s) { return RTG.Player ? RTG.Player.ovr(P(s).attrs) : 50; }
  function money(s) { return ((s.history && s.history.earnings) || 0) * 1000; }   // $k
  function inNfl(s) { return s.stage === 'NFL'; }
  function inCollege(s) { return s.stage === 'COLLEGE'; }

  function league(s) {
    if (!s.leagues) return null;
    return P(s).league === 'NFL' ? s.leagues.nfl : s.leagues.college;
  }
  function teamById(lg, id) {
    if (!lg || !id) return null;
    var idx = lg.teamIndex && lg.teamIndex[id];
    if (typeof idx === 'number' && lg.teams[idx] && lg.teams[idx].id === id) return lg.teams[idx];
    for (var i = 0; i < lg.teams.length; i++) if (lg.teams[i].id === id) return lg.teams[i];
    return null;
  }
  function team(s) { return teamById(league(s), P(s).teamId); }

  /** This week's scheduled game for the user's team (or null on a bye). */
  function thisWeekGame(s) {
    var sched = s.season && s.season.schedule, tid = P(s).teamId;
    if (!sched || !tid) return null;
    for (var i = 0; i < sched.length; i++) {
      var g = sched[i];
      if (g.week === s.week && (g.homeId === tid || g.awayId === tid)) return g;
    }
    return null;
  }
  function nextOppId(s) {
    var g = thisWeekGame(s), tid = P(s).teamId;
    if (!g) return null;
    return g.homeId === tid ? g.awayId : g.homeId;
  }
  function nextGameAway(s) {
    var g = thisWeekGame(s);
    return !!g && g.awayId === P(s).teamId;
  }
  /** Forecast for the next game: in-progress game weather, a pre-rolled schedule weather, or a flag. */
  function nextWeather(s) {
    if (s.game && s.game.weather) return s.game.weather;
    var g = thisWeekGame(s);
    if (g && g.weather) return g.weather;
    var f = flag(s, 'nextWeather');
    return f && typeof f === 'object' ? f : (typeof f === 'string' ? { weather: f } : null);
  }
  function nextWeatherIs(s, list) {
    var w = nextWeather(s);
    return !!w && list.indexOf(w.weather) >= 0;
  }
  function nextGameCold(s) {
    var w = nextWeather(s);
    return !!w && (w.weather === 'snow' || (typeof w.tempF === 'number' && w.tempF < G().coldTempF));
  }

  /** Kick rows of the user's last game (most recent gameId in the log). */
  function lastGameRows(s) {
    var rows = s.stats && s.stats.kicks;
    if (!rows || !rows.length) return [];
    var last = rows[rows.length - 1];
    var out = [];
    for (var i = rows.length - 1; i >= 0; i--) {
      if (rows[i].gameId !== last.gameId) break;
      out.push(rows[i]);
    }
    return out;
  }
  function lastGameHad(s, pred) {
    var rows = lastGameRows(s);
    for (var i = 0; i < rows.length; i++) if (pred(rows[i])) return true;
    return false;
  }
  function decisiveMissLastGame(s) {
    return lastGameHad(s, function (r) { return !r.made && r.type === 'FG' && (r.tags || []).indexOf('decisive') >= 0; });
  }
  function doinkLastGame(s) {
    return lastGameHad(s, function (r) { return typeof r.outcome === 'string' && r.outcome.indexOf('DOINK') === 0; });
  }

  function rivalryWeek(s) {
    var tm = team(s), opp = nextOppId(s);
    if (!tm || !opp) return false;
    if (inCollege(s)) return tm.rival === opp;
    var o = teamById(league(s), opp);
    return !!o && o.conf === tm.conf && o.div === tm.div;
  }
  function teamWinPct(s) {
    var r = s.season && s.season.results && s.season.results[P(s).teamId];
    if (!r) return null;
    var n = r.w + r.l + (r.t || 0);
    return n ? (r.w + 0.5 * (r.t || 0)) / n : null;
  }
  function gamesPlayed(s) {
    var r = s.season && s.season.results && s.season.results[P(s).teamId];
    return r ? r.w + r.l + (r.t || 0) : 0;
  }
  function finalContractYear(s) {
    var c = P(s).contract;
    return !!c && c.yearIdx >= c.years - 1;
  }
  function awardThisYear(s) {
    var aw = s.history && s.history.awards;
    if (!aw) return false;
    for (var i = aw.length - 1; i >= 0; i--) if (aw[i].year === s.year || aw[i].year === s.year - 1) return true;
    return false;
  }
  function wonTitle(s) {
    if (flag(s, 'wonTitle') === s.year) return true;
    var lines = s.history && s.history.seasons;
    if (!lines || !lines.length) return false;
    var last = lines[lines.length - 1];
    return !!last.champion && last.year === s.year;
  }
  function draftEligible(s) {
    var p = P(s);
    return (p.collegeSeasons || 0) - (p.redshirt ? 1 : 0) >= G().draftEligibleSeasons && !s.flags.declared;
  }
  function rivalKickerCold(s) {
    if (flag(s, 'rivalCold')) return true;
    var ks = s.season && s.season.kickerStats && s.season.kickerStats[P(s).teamId];
    if (!ks || ks.fga < G().coachShoppingMinFga) return false;
    return ks.fgm / ks.fga < T().soft.js.rivalFgPctBelow;
  }
  var MONTH_NUM = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
  /** Calendar month number (1–12) of the current week; Weather.monthFor returns a name ('Sep'). */
  function month(s) {
    var W = RTG.Weather;
    if (W && typeof W.monthFor === 'function') {
      var m = W.monthFor(s.week, P(s).league || 'COLLEGE');
      if (typeof m === 'number') return m;
      if (MONTH_NUM[m]) return MONTH_NUM[m];
    }
    return s.week <= 4 ? 9 : (s.week <= 8 ? 10 : 11);
  }
  function warmClimate(s) {
    var tm = team(s);
    return !!tm && tm.climate === 'warm';
  }
  function collegePrestige(s) {
    var tm = team(s);
    return tm && typeof tm.prestige === 'number' ? tm.prestige : 3;
  }
  function inSeasonWeek(s) { return s.phase === 'REG' || s.phase === 'POST'; }
  function hasTeam(s) { return !!P(s).teamId; }

  var IN_SEASON = ['PRE', 'REG', 'POST'];
  var ANY = ['PRE', 'REG', 'POST', 'OFF'];
  var BOTH = ['COLLEGE', 'NFL'];

  // ───────────────────────────── the catalog ─────────────────────────────

  var events = [
    { id: 'NIL_TRUCK', n: 1, stage: ['COLLEGE'], phase: ['REG', 'OFF'], once: false, weight: 3, sender: 'sponsor',
      cond: function (s) { return inCollege(s) && hasTeam(s) && P(s).fame >= G().nilFame; },
      title: 'NIL Offer: Big Rig Randy Wants Your Leg',
      text: "Randy's Trucks & Ladders in {city} wants you on a billboard next to the interstate. 'Kickin' Prices!' is the slogan. {coach} has heard about it and is making a face.",
      choices: [
        { label: 'Sign', preview: '+$40k · Fame +30 · Trust −4 · training ×0.7 for 2 weeks',
          effects: { money: 40, fame: 30, trust: -4, mods: [{ key: 'trainMult', op: 'mul', value: 0.7, expires: { type: 'week', n: 2 }, label: 'Billboard shoots' }] },
          headline: "KICKIN' PRICES: {last} signs NIL deal with truck lot, misses two practices for photo shoot" },
        { label: 'Decline', preview: 'Morale −2 · Trust +3', effects: { morale: -2, trust: 3 },
          headline: '{last} turns down truck money; {coach} approves, teammates baffled' },
        { label: 'Negotiate', preview: '60 %: +$60k, Fame +40 · 40 %: deal dies, Morale −4', effects: {},
          branches: [{ p: 0.6, effects: { money: 60, fame: 40 }, headline: '{last} squeezes truck dealer for a bigger billboard. Face now visible from space.',
            else: { effects: { morale: -4 }, headline: "Randy's Trucks pulls NIL offer after kicker 'got greedy'" } }] }
      ] },

    { id: 'PORTAL_WHISPER', n: 2, stage: ['COLLEGE'], phase: ['OFF'], once: false, weight: 4, sender: 'agent',
      cond: function (s) { return inCollege(s) && hasTeam(s) && (P(s).js < G().portalJs || P(s).trust < G().portalTrust); },
      title: 'Transfer Portal Whisper',
      text: "A 'family friend' texts: three schools would love a kicker who can actually kick. Your job at {team} is not exactly nailed down. The portal is right there.",
      choices: [
        { label: 'Enter the portal', preview: 'Look for a new school (TRANSFER)', effects: { action: 'TRANSFER' },
          headline: 'PORTAL PARTY: {last} enters transfer portal after rocky season at {team}' },
        { label: 'Stay and fight', preview: 'Morale +5 · camp battle for the job', effects: { morale: 5, action: 'CAMP_BATTLE' },
          headline: '{last} stays at {team}, tells reporters "I don\'t run from a competition. I jog."' }
      ] },

    { id: 'MEDIA_SCRUM_MISS', n: 3, stage: BOTH, phase: ['REG', 'POST'], once: false, weight: 6, sender: 'press',
      cond: function (s) { return hasTeam(s) && decisiveMissLastGame(s); },
      title: 'Media Scrum After The Miss',
      text: 'Fourteen microphones, one question, asked six ways: what happened on the kick? The holder is standing behind the reporters, listening very carefully.',
      choices: [
        { label: '"My fault."', preview: 'Fans +5 · Trust +3 · Morale −3', effects: { fans: 5, trust: 3, morale: -3 },
          headline: '{last} owns the miss: "That one\'s on me." Fans grudgingly respect it' },
        { label: 'Blame the hold', preview: 'Trust −8 · Fans +2 · the holder hears about it', effects: { trust: -8, fans: 2, flags: { holderBeef: true } },
          headline: "LACES OUT: {last} blames holder for miss; locker room 'a bit frosty'" },
        { label: 'Joke it off', preview: 'Fame +10 · 50 %: Fans +4 / 50 %: Fans −6', effects: { fame: 10 },
          branches: [{ p: 0.5, effects: { fans: 4 }, headline: '{last} jokes about the miss, internet decides he\'s "kind of a vibe"',
            else: { effects: { fans: -6 }, headline: '{last} jokes about the miss; {city} not laughing' } }] }
      ] },

    { id: 'HOLDER_BEEF', n: 4, stage: BOTH, phase: IN_SEASON, once: false, weight: 3, sender: 'teammate',
      cond: function (s) { return hasTeam(s) && (!!flag(s, 'holderBeef') || awardThisYear(s)); },
      title: 'The Holder Is Mad',
      text: "Your holder saw the special-teams award ceremony. He did not see his name. He has started spinning the laces 'accidentally'. This is a problem you can eat your way out of.",
      choices: [
        { label: 'Buy dinner', preview: 'Morale +3 · −$2k · σ ×0.98 for 4 weeks', effects: { morale: 3, money: -2, flags: { holderBeef: false }, mods: [{ key: 'sigma', op: 'mul', value: 0.98, expires: { type: 'week', n: 4 }, label: 'Holder dinner' }] },
          headline: '{last} takes holder to steakhouse; laces mysteriously perfect again' },
        { label: 'Ignore it', preview: '10 %: block risk +2 % for 3 games', effects: {},
          branches: [{ p: 0.1, effects: { mods: [{ key: 'block', op: 'add', value: 0.02, expires: { type: 'game', n: 3 }, label: 'Slow holds' }] }, headline: 'Holder and kicker "not speaking"; snaps oddly slow at {team} practice',
            else: { effects: {}, headline: '{last} ignores holder drama; drama ignores him back' } }] },
        { label: 'Confront him', preview: '50 %: Morale +6 / 50 %: Morale −6, Trust −3', effects: {},
          branches: [{ p: 0.5, effects: { morale: 6, flags: { holderBeef: false } }, headline: '{last} and holder clear the air; team reports "hug lasted a while"',
            else: { effects: { morale: -6, trust: -3 }, headline: 'Shouting match at {team} facility; {coach} "would like everyone to grow up"' } }] }
      ] },

    { id: 'HOLDOUT', n: 5, stage: ['NFL'], phase: ['OFF'], once: false, weight: 3, sender: 'agent',
      cond: function (s) { return inNfl(s) && hasTeam(s) && finalContractYear(s) && ovr(s) >= G().holdoutOvr; },
      title: 'Contract Holdout',
      text: "{agent} calls: 'You're the best leg in the building and they're paying you like a punter's cousin. Skip week one. Make them sweat.' Kickers holding out is not traditional. Neither are you.",
      choices: [
        { label: 'Hold out', preview: 'Skip week 1 · 55 %: extension at +10 % / 45 %: tag threat, Trust −12', effects: { action: 'HOLDOUT' },
          branches: [{ p: 0.55, effects: { flags: { holdoutExtension: true } }, headline: 'HOLDOUT WORKS: {team} blink, {last} gets his raise',
            else: { effects: { trust: -12, flags: { tagThreat: true } }, headline: '{team} respond to kicker holdout with two words: "franchise tag"' } }] },
        { label: 'Report to camp', preview: 'Trust +5', effects: { trust: 5 },
          headline: '{last} reports on time, says "the money will come." Agent unavailable for comment' }
      ] },

    { id: 'CHARITY_KICKATHON', n: 6, stage: BOTH, phase: ANY, once: false, weight: 3, sender: 'fan',
      cond: function (s) { return hasTeam(s); },
      title: 'Charity Kick-a-thon',
      text: "The {city} children's hospital wants a kick-a-thon: you kick, people pledge per make, a mascot cries. It costs you a Saturday and the catering.",
      choices: [
        { label: 'Host it', preview: '−$5k · Fans +10 · Fame +20 · Morale +4', effects: { money: -5, fans: 10, fame: 20, morale: 4 },
          headline: '{last} kicks for 6 hours straight at charity event, raises small fortune, mascot "still crying"' },
        { label: 'Skip', preview: 'Nothing happens', effects: {},
          headline: 'Kick-a-thon goes ahead without {last}; punter fills in, raises $400' }
      ] },

    { id: 'FAMILY_ILLNESS', n: 7, stage: BOTH, phase: IN_SEASON, once: false, weight: 2, sender: 'family',
      cond: function (s) { return hasTeam(s); },
      title: 'Call From Home',
      text: "Mom's voice is too calm. Grandpa is in the hospital and it's 'probably nothing' in the way that things are never nothing. Flying home means missing this week's training.",
      choices: [
        { label: 'Fly home', preview: 'No training this week · Morale target +5 this season · σ ×1.05 next game', effects: { flags: { skipTraining: true }, mods: [
          { key: 'moraleTarget', op: 'add', value: 5, expires: { type: 'season' }, label: 'Family first' },
          { key: 'sigma', op: 'mul', value: 1.05, expires: { type: 'game', n: 1 }, label: 'Jet lag' }] },
          headline: '{last} misses practice for family matter; {coach}: "Some things are bigger than a 45-yarder"' },
        { label: 'Stay and practice', preview: 'Morale −10 · guilt for 3 weeks', effects: { morale: -10, flags: { guilt: 3 } },
          headline: '{last} stays with the team; teammates describe him as "quiet" and "kicking angrily"' }
      ] },

    { id: 'KID_LESSON', n: 8, stage: BOTH, phase: ANY, once: false, weight: 3, sender: 'fan',
      cond: function (s) { return hasTeam(s); },
      title: 'A Young Fan Wants A Lesson',
      text: "A ten-year-old in a {team} jersey two sizes too big has been waiting by the parking lot with a football and a note from his dad. He wants to learn 'the swoosh thing'.",
      choices: [
        { label: 'Teach the kid', preview: 'Fans +8 · Morale +5', effects: { fans: 8, morale: 5 },
          headline: '{last} spends an hour teaching ten-year-old to kick; kid now "better than the punter"' },
        { label: 'Politely decline', preview: 'Fans −2', effects: { fans: -2 },
          headline: 'Local kid "sad" after {last} skips lesson; dad "understands, kind of"' }
      ] },

    { id: 'COACH_ULTIMATUM', n: 9, stage: BOTH, phase: ['REG'], once: false, weight: 5, sender: 'coach',
      cond: function (s) { return hasTeam(s) && inSeasonWeek(s) && P(s).trust < G().ultimatumTrust && !flag(s, 'ultimatum'); },
      title: "{coach}'s Ultimatum",
      text: "{coach} closes the door. 'I've got a walk-on who can hit 45. I'm not saying I'll use him. I'm saying I'm counting.' You have three weeks to make 85 percent.",
      choices: [
        { label: '"Give me three more weeks."', preview: 'FG% ≥ 85 % over 3 weeks → Trust +20; else camp battle / NFL: JS −20', effects: { flags: { ultimatum: 'START' } },
          headline: '{coach} puts {last} on notice: "Three weeks. Then we\'ll talk."' },
        { label: 'Request a transfer / trade', preview: 'College: enter the portal · NFL: request a trade (40 % executed, Trust −15)',
          effects: { action: function (s) { return inNfl(s) ? 'TRADE' : 'TRANSFER'; } },
          headline: '{last} asks out of {team} after ultimatum; {coach} "wishes him the best, honestly"' }
      ] },

    { id: 'COACH_SHOPPING', n: 9.5, stage: BOTH, phase: ['REG'], once: false, weight: 6, sender: 'gm',
      cond: function (s) { return hasTeam(s) && P(s).role === 'K2' && rivalKickerCold(s); },
      title: '{coach} Is Shopping For A New Leg',
      text: "The starter has missed everything but the team bus for three weeks. {coach} has been seen watching your warm-ups with the face of a man doing math.",
      choices: [
        { label: 'Challenge for the job', preview: 'Camp battle: 6 kicks vs the starter', effects: { action: 'CAMP_BATTLE' },
          headline: 'KICK-OFF: {team} open competition for kicking job; {last} "ready, allegedly"' },
        { label: 'Wait your turn', preview: 'Job Security +5', effects: { js: 5 },
          headline: '{last} keeps his head down as {team} kicking situation "remains fluid"' }
      ] },

    { id: 'RIVAL_TRASH_TALK', n: 10, stage: BOTH, phase: ['REG', 'POST'], once: false, weight: 5, sender: 'press',
      cond: function (s) { return hasTeam(s) && rivalryWeek(s); },
      title: "Rival's Trash Talk",
      text: "{rival}'s kicker told a podcast you 'kick like you're apologizing to the ball'. It's rivalry week. The clip has 400k views and a remix.",
      choices: [
        { label: 'Respond', preview: 'Fame +15 · Fans +5 · pressure +0.10 this game', effects: { fame: 15, fans: 5, mods: [{ key: 'pressure', op: 'add', value: 0.10, expires: { type: 'game', n: 1 }, label: 'Trash talk' }] },
          headline: 'WAR OF WORDS: {last} fires back at {rival} kicker: "At least the ball knows my name"' },
        { label: 'Silence', preview: 'XP +20 · let the leg talk', effects: { xp: 20 },
          headline: '{last} declines to respond to {rival} trash talk; coaches call it "composure", teammates call it "boring"' }
      ] },

    { id: 'WIND_TUNNEL', n: 11, stage: ['NFL'], phase: ['OFF'], once: true, weight: 2, sender: 'agent',
      cond: function (s) { return inNfl(s) && money(s) >= G().windTunnelMoneyK; },
      title: 'Wind Tunnel Study',
      text: 'An aerospace lab in {city} will put you and a ball in a wind tunnel for a weekend. Findings will be scientific. The invoice will be $10k. {agent} says "it\'s a write-off, probably".',
      choices: [
        { label: 'Pay $10k', preview: '−$10k · wind drift ×0.95 permanently', effects: { money: -10, mods: [{ key: 'windDrift', op: 'mul', value: 0.95, expires: { type: 'never' }, label: 'Wind tunnel study' }] },
          headline: 'SCIENCE LEG: {last} spends weekend in wind tunnel, emerges "aerodynamically informed"' },
        { label: 'No', preview: 'Keep the money', effects: {},
          headline: '{last} passes on wind tunnel study, says "I\'ll just aim left like everyone else"' }
      ] },

    { id: 'MENTOR', n: 12, stage: ['NFL'], phase: ['PRE', 'REG'], once: true, weight: 6, sender: 'teammate',
      cond: function (s) { return inNfl(s) && hasTeam(s) && (P(s).nflSeasons || 0) <= G().mentorNflSeasons; },
      title: 'The Old Kicker',
      text: "A 41-year-old former league kicker now 'consults' for {team}, which means he stands near the goalposts with a coffee. He offers to watch your swing. 'Kid, you're leaning like a bad fence.'",
      choices: [
        { label: 'Listen', preview: 'XP +90 · mentored', effects: { xp: 90, flags: { mentored: true } },
          headline: '{last} takes swing tips from league legend; "the fence is fixed", sources say' },
        { label: '"I\'ve got this."', preview: 'XP +40 · Morale +4', effects: { xp: 40, morale: 4 },
          headline: 'Rookie {last} declines veteran advice, "respectfully"; veteran finishes coffee' }
      ] },

    { id: 'DOINK_VIRAL', n: 13, stage: BOTH, phase: ['REG', 'POST'], once: false, weight: 6, sender: 'press',
      cond: function (s) { return hasTeam(s) && doinkLastGame(s); },
      title: 'The Doink Goes Viral',
      text: "Your kick hit the upright with a TING heard in three counties. The slow-motion clip is scored to opera. A brand wants to sell shirts. The shirts say 'DOINK'.",
      choices: [
        { label: 'Lean in', preview: 'Fame +40 · Fans +5 · trait DOINK KING', effects: { fame: 40, fans: 5, trait: 'DOINK_KING' },
          headline: 'DOINK KING: {last} embraces upright fame, releases t-shirt, sells out in {city}' },
        { label: 'Delete your socials', preview: 'Morale +2', effects: { morale: 2 },
          headline: '{last} goes dark online after doink clip hits 5 million views; agent "handling it"' }
      ] },

    { id: 'SNOW_BOOTS', n: 14, stage: BOTH, phase: ['REG', 'POST'], once: false, weight: 6, sender: 'coach',
      cond: function (s) { return hasTeam(s) && nextWeatherIs(s, ['snow']); },
      title: 'Snow Game Boots',
      text: "Forecast: snow, heavy. The equipment guy holds up two boots. 'Long studs. Grip like a goat. You'll lose a yard or two of leg.' The other boot is your normal boot. It is looking at you.",
      choices: [
        { label: 'Long studs', preview: 'σ ×0.92 · range ×0.97 for 1 game', effects: { mods: [
          { key: 'sigma', op: 'mul', value: 0.92, expires: { type: 'game', n: 1 }, label: 'Long studs' },
          { key: 'range', op: 'mul', value: 0.97, expires: { type: 'game', n: 1 }, label: 'Long studs' }] },
          headline: '{last} goes full goat-mode with snow studs; equipment manager "vindicated"' },
        { label: 'Normal boots', preview: 'Trust the plant foot', effects: {},
          headline: '{last} sticks with regular boots in the snow, cites "tradition" and "not liking change"' }
      ] },

    { id: 'CAPTAIN_VOTE', n: 15, stage: BOTH, phase: ['PRE'], once: false, weight: 4, sender: 'coach',
      cond: function (s) { return hasTeam(s) && P(s).trust >= G().captainTrust; },
      title: 'Locker Room Vote: Captaincy',
      text: "The team voted. A kicker got votes. YOU got votes. {coach} is offering the special-teams captaincy, which comes with a 'C' patch and every single onside-kick argument.",
      choices: [
        { label: 'Accept', preview: 'Trust +8 · Morale +5 · pressure +0.05 this season', effects: { trust: 8, morale: 5, mods: [{ key: 'pressure', op: 'add', value: 0.05, expires: { type: 'season' }, label: 'Captain' }] },
          headline: 'CAPTAIN LEG: {last} named {team} special-teams captain; punter "processing"' },
        { label: 'Decline', preview: 'Stay in your lane', effects: {},
          headline: '{last} turns down captaincy: "I\'d rather be a quiet menace"' }
      ] },

    { id: 'HALFTIME_70', n: 16, stage: BOTH, phase: ['REG'], once: false, weight: 3, sender: 'sponsor',
      cond: function (s) { return hasTeam(s) && P(s).fame >= G().halftimeFame && !s.game; },
      title: 'Sponsor Wants A 70-Yarder At Halftime',
      text: "A soda company will pay for a halftime stunt: you, a ball, 70 yards, 60,000 phones. Make it and you're a legend. Miss it and you're a GIF. The marketing person says 'no pressure' in a way that adds pressure.",
      choices: [
        { label: 'Try it', preview: 'One 70-yd kick · make: Fame +80, Fans +15 · miss: Fans −5, Morale −3', effects: { action: 'HALFTIME70' },
          headline: 'HALFTIME SHOW: {last} lines up 70-yarder for a soda company; stadium "extremely into it"' },
        { label: 'No thanks', preview: 'Skip the stunt', effects: {},
          headline: 'Soda company\'s 70-yard stunt falls through; {last} "not a circus act"' }
      ] },

    { id: 'AGENT_UPGRADE', n: 17, stage: ['NFL'], phase: ANY, once: true, weight: 6, sender: 'agent',
      cond: function (s) { return inNfl(s) && P(s).fame >= G().agentFame && (P(s).agentTier || 0) === 0; },
      title: 'Agent Upgrade',
      text: "A big agency with an office made entirely of glass wants to represent you. They know your potential 'to the decimal'. They take 5 percent. Your current agent is your cousin.",
      choices: [
        { label: 'Sign with the big agency', preview: 'Agent tier 1 · 5 % fee · potential revealed', effects: { flags: { agentTier: 1, agentFee: 0.05 } },
          headline: '{last} signs with mega-agency; cousin "supportive" and "seeking new clients"' },
        { label: 'Stay loyal', preview: 'Morale +4', effects: { morale: 4 },
          headline: '{last} sticks with family agent; the agent\'s mom "so proud of both of them"' }
      ] },

    { id: 'TAG_REACTION', n: 18, stage: ['NFL'], phase: ['OFF'], once: false, weight: 8, sender: 'gm',
      cond: function (s) { return inNfl(s) && !!P(s).contract && P(s).contract.type === 'TAG' && P(s).contract.yearIdx === 0; },
      title: 'Franchise Tag Frustration',
      text: "They tagged you. A kicker. One year, fully guaranteed, zero commitment. The GM calls it 'a compliment'. {agent} calls it 'several unprintable things'.",
      choices: [
        { label: 'Sign the tender', preview: 'Take the year, move on', effects: {},
          headline: '{last} signs franchise tender without comment; GM "relieved"' },
        { label: 'Skip OTAs', preview: 'Trust −10 · Fame +2 · Morale +5', effects: { trust: -10, fame: 2, morale: 5 },
          headline: 'TAGGED AND TICKED: {last} skips OTAs, posts beach photos with the caption "guaranteed"' }
      ] },

    { id: 'SLEEP_STUDY', n: 19, stage: BOTH, phase: ANY, once: true, weight: 2, sender: 'coach',
      cond: function (s) { return hasTeam(s) && !flag(s, 'sleepStudy'); },
      title: 'Sleep Study',
      text: "The team's performance staff want you in a sleep lab for a week. Sensors, dark curtains, a very calm scientist. Results suggest you are 'a solid 6/10 sleeper' with room to grow.",
      choices: [
        { label: 'Adopt the routine', preview: 'Morale target +5 permanently', effects: { flags: { sleepStudy: true }, mods: [{ key: 'moraleTarget', op: 'add', value: 5, expires: { type: 'never' }, label: 'Sleep routine' }] },
          headline: '{last} adopts strict sleep routine; teammates report he "leaves parties at 8:45"' },
        { label: 'Nah', preview: 'Sleep is for punters', effects: {},
          headline: '{last} declines sleep study: "I sleep fine. On the bench. During games."' }
      ] },

    { id: 'TRADE_RUMOR', n: 20, stage: ['NFL'], phase: ['REG'], once: false, weight: 5, sender: 'press',
      cond: function (s) { return inNfl(s) && hasTeam(s) && (P(s).js < G().tradeRumorJs || P(s).trust < G().tradeRumorTrust); },
      title: 'Trade Rumor',
      text: "An insider tweets that {team} are 'exploring the kicker market'. You are the kicker. You are the market. Your phone is a slot machine of notifications.",
      choices: [
        { label: 'Request a trade', preview: '40 % executed · Trust −15', effects: { action: 'TRADE' },
          headline: '{last} requests trade from {team}; front office "aware, surprised, aware"' },
        { label: 'Deny publicly', preview: 'Fans +3 · Trust +5', effects: { fans: 3, trust: 5 },
          headline: '{last} shuts down trade talk: "I\'m a {team} guy. I own the hoodie."' }
      ] },

    { id: 'DRAFT_PRESSURE', n: 21, stage: ['COLLEGE'], phase: ['OFF'], once: false, weight: 6, sender: 'family',
      cond: function (s) { return inCollege(s) && draftEligible(s); },
      title: 'Parents Want The Degree',
      text: "Dinner. Dad has printed a graph of NFL kicker career lengths. Mom has printed the tuition refund policy. Both want you to finish the degree. Both are also 'so proud, whatever you choose'.",
      choices: [
        { label: 'Stay in school', preview: 'Morale +6 · STAY pre-selected', effects: { morale: 6, flags: { draftLean: 'STAY' } },
          headline: '{last} tells family he\'ll stay at {team} for another year; dad "frames the graph"' },
        { label: 'Declare for the draft', preview: 'Fame +10 · DECLARE pre-selected', effects: { fame: 10, flags: { draftLean: 'DECLARE' } },
          headline: 'GOING PRO: {last} informs parents he\'s draft-bound; mom "still doing the laundry though"' }
      ] },

    { id: 'PARADE', n: 22, stage: BOTH, phase: ['OFF'], once: false, weight: 8, sender: 'fan',
      cond: function (s) { return hasTeam(s) && wonTitle(s); },
      title: 'Hometown Parade',
      text: "Your hometown is throwing a parade. For you. There is a fire truck and a banner with your face, slightly stretched. The mayor wants a speech. The mayor is your old gym teacher.",
      choices: [
        { label: 'Attend', preview: 'Fans +15 · Fame +30', effects: { fans: 15, fame: 30 },
          headline: 'HOMETOWN HERO: {last} rides fire truck through parade; gym teacher gives 40-minute speech' },
        { label: 'Skip it for training', preview: 'XP +50', effects: { xp: 50 },
          headline: '{last} skips his own parade to train; parade goes ahead with cardboard cut-out' }
      ] },

    { id: 'CONTENDER_CALL', n: 23, stage: ['NFL'], phase: ['REG'], once: false, weight: 5, sender: 'gm',
      cond: function (s) {
        var wp = teamWinPct(s), w = G().contenderWeeks;
        return inNfl(s) && hasTeam(s) && s.week >= w[0] && s.week <= w[1] && gamesPlayed(s) >= G().contenderMinGames
          && wp !== null && wp < G().contenderWinPct && ovr(s) >= G().contenderOvr;
      },
      title: 'A Contender Wants Your Leg',
      text: "{team} are going nowhere. A contender's GM has offered a sixth-round pick for you, which is either an insult or the best thing that's ever happened to a kicker. Your GM is 'listening'.",
      choices: [
        { label: 'Accept the trade', preview: 'Join the best needy contender · Morale +3 · Fame +20', effects: { action: 'CHANGE_TEAM', morale: 3, fame: 20 },
          headline: 'CONTENDER CALLS: {last} shipped to a playoff team for a sixth-rounder; {city} fans "fine, actually"' },
        { label: 'Decline', preview: 'Trust +5 · ride it out', effects: { trust: 5 },
          headline: '{last} turns down move to a contender: "I started this. I\'ll finish it. Badly, maybe."' }
      ] },

    { id: 'CUT_DAY_CALL', n: 24, stage: ['NFL'], phase: ANY, once: false, weight: 10, sender: 'gm',
      cond: function (s) { return inNfl(s) && !P(s).teamId && !!flag(s, 'cutNoOffers'); },
      title: 'Cut Day Phone Call',
      text: "You've been released and the phone has not rung in a way that matters. Then it does: a practice squad spot. Half the XP, a locker near the boiler, a 30 percent chance a week that somebody gets hurt and you get the call.",
      choices: [
        { label: 'Practice squad', preview: '30 % call-up per week for 6 weeks · XP ×0.5', effects: { flags: { practiceSquad: { weeksLeft: 6 } } },
          headline: '{last} signs to a practice squad: "It\'s a foot in the door. My foot. The good one."' },
        { label: 'Refuse and wait', preview: 'Stay a free agent', effects: { flags: { faWait: true } },
          headline: '{last} passes on practice squad, waits by the phone "with dignity"' }
      ] },

    { id: 'FAN_MAIL', n: 25, stage: BOTH, phase: ANY, once: false, weight: 3, sender: 'fan',
      cond: function (s) { return hasTeam(s); },
      title: 'Fan Mail: The Kid Who Wears Your Number',
      text: "A hand-written letter, crayon on the envelope. A kid in {city} wears your number to school and gets teased because 'kickers aren't players'. He wants to know if that's true.",
      choices: [
        { label: 'Write back', preview: 'Fans +6 · Morale +6', effects: { fans: 6, morale: 6 },
          headline: '{last} writes to young fan: "Kickers are players. We just save the best for last." Letter goes viral' }
      ] },

    { id: 'ROOKIE_HAZING', n: 26, stage: ['NFL'], phase: ['PRE'], once: true, weight: 8, sender: 'teammate',
      cond: function (s) { return inNfl(s) && hasTeam(s) && (P(s).nflSeasons || 0) <= G().mentorNflSeasons; },
      title: 'Carry The Pads',
      text: "Rookie tradition: carry the veterans' pads off the field. All of them. The linebackers' pads smell like a decision you didn't make. The punter is already carrying his own, weeping.",
      choices: [
        { label: 'Carry them', preview: 'Morale −2 · Trust +4', effects: { morale: -2, trust: 4 },
          headline: 'Rookie {last} hauls pads for the whole defense; linebackers "impressed by the calf strength"' },
        { label: 'Refuse', preview: 'Trust −4 · Fame +5', effects: { trust: -4, fame: 5 },
          headline: 'Rookie kicker {last} refuses hazing, cites "leg preservation"; veterans "keeping a list"' }
      ] },

    { id: 'WEATHER_SESSION', n: 27, stage: BOTH, phase: ['REG', 'POST'], once: false, weight: 5, sender: 'coach',
      cond: function (s) { return hasTeam(s) && nextGameAway(s) && nextGameCold(s); },
      title: 'Weather Sim Session',
      text: "Next week is away, cold, and possibly snowing sideways. {coach} offers a Tuesday outdoors: 60 kicks, 30 degrees, no gloves, a fan blowing wind in your face 'for realism'.",
      choices: [
        { label: 'Practice outdoors', preview: 'σ ×0.85 next game · Morale −3', effects: { morale: -3, mods: [{ key: 'sigma', op: 'mul', value: 0.85, expires: { type: 'game', n: 1 }, label: 'Cold-weather session' }] },
          headline: '{last} kicks 60 balls in the freezing rain to prep for {opp}; "can\'t feel my toe, feel great"' },
        { label: 'Skip it', preview: 'Stay warm', effects: {},
          headline: '{last} skips outdoor session before trip to {opp}; "I\'ve seen cold before. On TV."' }
      ] },

    { id: 'COMEBACK', n: 28, stage: BOTH, phase: IN_SEASON, once: false, weight: 8, sender: 'coach',
      cond: function (s) { return hasTeam(s) && !!P(s).injury && P(s).injury.weeksLeft >= G().comebackWeeks && !flag(s, 'comebackChoice'); },
      title: 'The Comeback Question',
      text: "The trainer says the leg is 'about 80 percent'. {coach} says the backup is 'about 60 percent'. Nobody says what they mean, which is: come back early?",
      choices: [
        { label: 'Rush back', preview: 'Injury −2 weeks · σ ×1.15 for 2 games · Fans +5', effects: { injury: -2, fans: 5, flags: { comebackChoice: 'RUSH' }, mods: [{ key: 'sigma', op: 'mul', value: 1.15, expires: { type: 'game', n: 2 }, label: 'Rushed back' }] },
          headline: 'GUTSY OR GOOFY? {last} returning early from injury; trainer "not thrilled"' },
        { label: 'Full recovery', preview: 'Injury +2 weeks · come back right', effects: { injury: 2, flags: { comebackChoice: 'FULL' } },
          headline: '{last} takes the long road back; {coach} "respects it" while looking at the backup nervously' }
      ] },

    { id: 'PODCAST', n: 29, stage: BOTH, phase: ANY, once: false, weight: 3, sender: 'press',
      cond: function (s) { return hasTeam(s) && P(s).fame >= G().podcastFame; },
      title: 'Podcast Appearance',
      text: "'Two Guys One Ball' wants you for 90 minutes. They will ask about your process, your pregame meal, and 'what a kicker actually does all week'. One of them will do an impression of your kick.",
      choices: [
        { label: 'Do it', preview: 'Fame +25 · 20 %: a gaffe, Fans −8', effects: { fame: 25 },
          branches: [{ p: 0.2, effects: { fans: -8 }, headline: 'PODCAST PROBLEM: {last} says {city} fans "boo like they\'re gargling"; apology forthcoming',
            else: { effects: {}, headline: '{last} charms podcast crowd, reveals pregame meal is "cereal, no milk, like a psycho"' } }] },
        { label: 'Pass', preview: 'No microphone', effects: {},
          headline: '{last} declines podcast invite; hosts do 90 minutes on his kicking form anyway' }
      ] },

    { id: 'RETIREMENT_RUMOR', n: 30, stage: ['NFL'], phase: ['PRE', 'REG'], once: false, weight: 6, sender: 'press',
      cond: function (s) { return inNfl(s) && hasTeam(s) && P(s).age >= G().retirementAge && !flag(s, 'farewell'); },
      title: 'Retirement Rumor',
      text: "A columnist wrote that you're 'kicking on borrowed time'. A radio host asked if you should 'go out on top'. You are {age}, which in kicker years is either ancient or a rookie, depending on who's talking.",
      choices: [
        { label: '"I\'m not done."', preview: 'Morale +5 · pressure +0.05 this season', effects: { morale: 5, mods: [{ key: 'pressure', op: 'add', value: 0.05, expires: { type: 'season' }, label: 'Something to prove' }] },
          headline: '{last} to retirement talk: "I\'ll retire when the ball stops going through. Hasn\'t yet."' },
        { label: 'Announce a farewell tour', preview: 'Fame +40 · retire after this season · pressure +0.05', effects: { fame: 40, flags: { farewell: true }, mods: [{ key: 'pressure', op: 'add', value: 0.05, expires: { type: 'season' }, label: 'Farewell tour' }] },
          headline: 'ONE LAST RIDE: {last} announces farewell season; {city} plans "several statues"' }
      ] },

    { id: 'HURRICANE', n: 31, stage: BOTH, phase: ['REG'], once: false, weight: 4, sender: 'gm',
      cond: function (s) { var m = G().hurricaneMonths; var mo = month(s); return hasTeam(s) && warmClimate(s) && mo >= m[0] && mo <= m[1]; },
      title: 'Wild Weather Warning: Game Postponed',
      text: "A storm the size of a small country is parked over {city}. This week's game is off. You have seven unexpected days and a very quiet stadium.",
      choices: [
        { label: 'Stay sharp', preview: 'XP +25', effects: { xp: 25, flags: { postponedGame: true } },
          headline: 'Game postponed by storm; {last} spotted kicking in an underground garage "for the echo"' },
        { label: 'Relax', preview: 'Morale +6', effects: { morale: 6, flags: { postponedGame: true } },
          headline: 'Storm week: {last} "rested, hydrated, saw three movies"' }
      ] },

    { id: 'ONSIDE_PRACTICE', n: 32, stage: BOTH, phase: ['PRE'], once: true, weight: 4, sender: 'coach',
      cond: function (s) { return hasTeam(s) && !flag(s, 'ONSIDE_TRAINED'); },
      title: '{coach} Wants An Onside Trick',
      text: "{coach} has drawn a play on a napkin. It involves you, a dribbler kick, and 'chaos'. Learning it means two weeks of practice kicking a ball 11 yards, which feels like an insult.",
      choices: [
        { label: 'Learn it', preview: 'ONSIDE TRAINED flag', effects: { flags: { ONSIDE_TRAINED: true } },
          headline: '{team} install "the napkin play"; {last} now "surprisingly good at 11 yards"' },
        { label: 'No', preview: 'XP +20 · keep the reps for real kicks', effects: { xp: 20 },
          headline: '{last} passes on onside trick; {coach} "keeping the napkin"' }
      ] },

    { id: 'PSYCH', n: 33, stage: BOTH, phase: ANY, once: true, weight: 4, sender: 'coach',
      cond: function (s) { return hasTeam(s) && P(s).attrs.CLU < G().psychClu && !flag(s, 'psych'); },
      title: 'Sports Psychologist',
      text: "Dr. Okafor specialises in 'athletes who think too much before doing one thing'. Six weeks of sessions. Breathing, visualisation, a laminated card that says NARROW YOUR WORLD.",
      choices: [
        { label: 'Enroll', preview: '−$15k (free at a big program) · Composure +3 over 6 weeks',
          effects: { money: function (s) { return inCollege(s) && collegePrestige(s) >= G().psychFreePrestige ? 0 : -15; }, flags: { psych: 'START' } },
          headline: '{last} starts seeing sports psychologist; teammates "also want the laminated card"' },
        { label: 'Decline', preview: 'Your brain is fine', effects: {},
          headline: '{last} passes on psychologist: "I don\'t think before kicks. Or after."' }
      ] },

    { id: 'FAN_PETITION', n: 34, stage: BOTH, phase: ['REG'], once: false, weight: 6, sender: 'fan',
      cond: function (s) { return hasTeam(s) && P(s).fans < G().petitionFans; },
      title: 'Fan Petition To Bench You',
      text: "An online petition titled 'Bench {last} (Please)' has 3,000 signatures and a surprisingly well-designed logo. The top comment is from someone claiming to be your high school coach.",
      choices: [
        { label: 'Post a practice video', preview: 'Fans +6 · 20 %: it backfires, Fans −6', effects: {},
          branches: [{ p: 0.2, effects: { fans: -6 }, headline: '{last} posts practice video to silence critics; video includes a miss, critics louder',
            else: { effects: { fans: 6 }, headline: '{last} answers petition with 20-for-20 practice video; signatures "mysteriously declining"' } }] },
        { label: 'Stay quiet', preview: 'XP +10', effects: { xp: 10 },
          headline: 'Petition to bench {last} hits 5,000; {last} "has not read it, has read it"' }
      ] },

    { id: 'AGGRESSIVE_PLAN', n: 35, stage: BOTH, phase: ['PRE'], once: false, weight: 5, sender: 'coach',
      cond: function (s) { return hasTeam(s) && P(s).trust >= G().aggressiveTrust; },
      title: "{coach}'s Aggressive Plan",
      text: "{coach} trusts you. Dangerously. 'I want to send you out from 60 this year. Tell me your number.' This is the conversation your leg has been waiting for. Or dreading.",
      choices: [
        { label: '"Give me 60."', preview: 'Coach attempt threshold −0.10 · Fame +15 per 55+ attempt', effects: { flags: { giveMe60: true, under55: false } },
          headline: 'BOMBS AWAY: {coach} promises to let {last} attempt from 60 this season' },
        { label: '"Keep me under 55."', preview: 'Threshold +0.10 · Trust +3', effects: { trust: 3, flags: { under55: true, giveMe60: false } },
          headline: '{last} asks {coach} to keep attempts under 55: "I like my percentages like I like my coffee. High."' }
      ] },

    { id: 'GURU', n: 36, stage: BOTH, phase: ['OFF'], once: false, weight: 3, sender: 'agent',
      cond: function (s) { return hasTeam(s) && !flag(s, 'guru'); },
      title: 'Kick Camp Guru: Swing Change',
      text: "A guru in the desert charges silly money to rebuild swings. His pitch: 'You'll be worse for two weeks. Then you'll be better forever.' He has a ponytail and a 70 percent success rate.",
      choices: [
        { label: 'Overhaul the swing', preview: 'σ ×1.2 for 2 weeks, then Accuracy +2', effects: { flags: { guru: 'START' }, mods: [{ key: 'sigma', op: 'mul', value: 1.2, expires: { type: 'week', n: 2 }, label: 'Swing change' }] },
          headline: '{last} rebuilds swing with desert guru; early results "wobbly but spiritual"' },
        { label: 'Keep it', preview: 'If it ain\'t broke', effects: {},
          headline: '{last} declines swing overhaul: "My swing is a classic. Like a jukebox. Sometimes it skips."' }
      ] },

    { id: 'FOG_DELAY', n: 37, stage: BOTH, phase: ['REG', 'POST'], once: false, weight: 6, sender: 'press',
      cond: function (s) { return hasTeam(s) && nextWeatherIs(s, ['fog']); },
      title: 'Fog Rolls In',
      text: "The forecast says fog. The kind where you can see the ball, the holder, and then a wall of soup. The wind flag will be somewhere in there, doing whatever it wants, unseen.",
      choices: [
        { label: 'OK', preview: 'Next game: hidden wind', effects: { flags: { hiddenWind: 1 } },
          headline: 'FOG BOWL: visibility near zero for {team} vs {opp}; {last} "aiming at a sound"' }
      ] },

    { id: 'ENDORSEMENT_DRINK', n: 38, stage: ['NFL'], phase: ANY, once: true, weight: 3, sender: 'sponsor',
      cond: function (s) { return inNfl(s) && hasTeam(s) && P(s).fame >= G().drinkFame && P(s).fans >= G().drinkFans; },
      title: 'Energy Drink Endorsement',
      text: "VOLTZ Energy wants you as the face of 'LEG DAY'. Quarter of a million dollars. The drink tastes like a battery. You will have to drink it on camera and say 'that's the kick I needed'.",
      choices: [
        { label: 'Sign', preview: '+$250k · Fame +30 · 5 %: bad PR, Fans −10', effects: { money: 250, fame: 30 },
          branches: [{ p: 0.05, effects: { fans: -10 }, headline: 'VOLTZ ad backfires: {last} visibly gags on camera; brand "reviewing the cut"',
            else: { effects: {}, headline: 'THAT\'S THE KICK: {last} lands quarter-million energy drink deal' } }] },
        { label: 'Decline', preview: 'Keep your teeth', effects: {},
          headline: '{last} turns down energy drink deal, endorses "water, mostly"' }
      ] },

    // Internal follow-up (never rolled randomly; forced by the ultimatum tracker when the 3 weeks fail in college).
    { id: 'ULTIMATUM_FAILED', n: 9.9, stage: ['COLLEGE'], phase: ['REG'], once: false, weight: 0, sender: 'coach', internal: true,
      cond: function () { return false; },
      title: 'Three Weeks Are Up',
      text: "{coach} does not close the door this time. He doesn't need to. 'The numbers aren't there. Thursday, you and the walk-on, six kicks. Best leg starts Saturday.'",
      choices: [
        { label: 'Report for the camp battle', preview: 'Camp battle for the job', effects: { action: 'CAMP_BATTLE' },
          headline: 'ULTIMATUM EXPIRES: {last} faces walk-on in six-kick shootout for {team} job' }
      ] }
  ];

  var byId = {};
  for (var i = 0; i < events.length; i++) byId[events[i].id] = events[i];

  RTG.Data.events = events;
  RTG.Data.eventsById = byId;
  /** Helper accessors exported for tests and the engine (pure over state). */
  RTG.Data.eventHelpers = {
    lastGameRows: lastGameRows, decisiveMissLastGame: decisiveMissLastGame, doinkLastGame: doinkLastGame,
    rivalryWeek: rivalryWeek, nextWeather: nextWeather, teamWinPct: teamWinPct, thisWeekGame: thisWeekGame,
    nextOppId: nextOppId, team: team, teamById: teamById, league: league, money: money, wonTitle: wonTitle,
    draftEligible: draftEligible, rivalKickerCold: rivalKickerCold, month: month
  };
})(typeof window !== 'undefined' ? window : globalThis);
