/**
 * Road to Glory: Kicker — screen 'hub' (SPEC §4.5 hub row) + RTG.UI.Kit, the helpers shared by the DOM screens
 * (offers, inbox, training, postgame, schedule, standings, team, stats, records, awards, offseason, draft, contract,
 * timeline, legacy). The kit is attached at parse time and read lazily (at factory time) by the other screen files,
 * so the script order inside the screens block does not matter.
 *
 * Hub: team bar (crest, record, rank / seed), the week card (opponent, venue, home-stadium climate / dome / surface
 * as the "forecast" — the weather itself is rolled at kickoff — storylines from the latest headlines, ratings),
 * meters row (Trust / Fans / Morale / Job Security as 5-block meters, Fame tier / XP / money chips), inbox preview,
 * the phase actions (TRAIN · PLAY GAME · SIM GAME · SIM TO END OF SEASON · END WEEK · START SEASON), the bye-week
 * Rest / Grind card, the PRE goals + camp-battle card, the POST bracket card, injured / benched / free-agent banners.
 * Re-renders from state on every store change. The shell chrome (top bar / tab bar / rails) is NOT redrawn here.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Screens = RTG.UI.Screens = RTG.UI.Screens || {};

  // ═══════════════════════════════ RTG.UI.Kit ═══════════════════════════════

  var Kit = {};

  function C() { return RTG.UI.C; }
  function Router() { return RTG.UI.Router; }
  function Shell() { return RTG.UI.Shell; }
  function num(v, d) { return typeof v === 'number' && v === v ? v : (d === undefined ? 0 : d); }
  function isFn(f) { return typeof f === 'function'; }

  Kit.num = num;

  /** Wrap a UI handler: engine preconditions become toasts, not crashes. */
  Kit.safe = function (fn) {
    return function () {
      try { return fn.apply(this, arguments); }
      catch (e) { C().toast(String(e && e.message || e), 'bad', 4000); if (root.console) root.console.error(e); }
    };
  };

  /** store.dispatch with the toast wrapper; returns the result or undefined on failure. */
  Kit.dispatch = function (store, fnName) {
    var args = Array.prototype.slice.call(arguments, 1);
    try { return store.dispatch.apply(store, args); }
    catch (e) { C().toast(String(e && e.message || e), 'bad', 4000); if (root.console) root.console.error(e); return undefined; }
  };

  Kit.team = function (id) { return C().team(id); };
  Kit.teamName = function (id) { return C().teamName(id); };
  Kit.abbr = function (id) { return C().teamAbbr(id); };
  Kit.userTeam = function (state) { return state && RTG.Schema && RTG.Schema.userTeam ? RTG.Schema.userTeam(state) : null; };
  Kit.ovr = function (p) { return p && RTG.Player && RTG.Player.ovr ? RTG.Player.ovr(p.attrs) : 0; };
  Kit.fameTier = function (fame) { return RTG.Player && RTG.Player.fameTierName ? RTG.Player.fameTierName(fame) : ''; };
  Kit.reduced = function () { return !!(Shell() && Shell().reducedMotion && Shell().reducedMotion()); };
  Kit.calYear = function (year) { return C().fmt.calYear(year); };

  /** Tooltip helper honouring the settings (C.tooltip already does); returns the element. */
  Kit.tip = function (el, text) { if (el && text) C().tooltip(el, text); return el; };

  /** A tabular number with a tooltip. */
  Kit.numEl = function (text, tipText, cls) {
    var e = C().el('span', { class: 'num' + (cls ? ' ' + cls : ''), text: String(text) });
    return Kit.tip(e, tipText);
  };

  Kit.pctText = function (m, a, d) { return a > 0 ? C().fmt.pct(m / a, d === undefined ? 1 : d) : '—'; };
  Kit.fgLine = function (s) {
    if (!s) return '—';
    return 'FG ' + num(s.fgm) + '/' + num(s.fga) + ' · LONG ' + num(s.long) + ' · PAT ' + num(s.patMade) + '/' + num(s.pat);
  };

  Kit.recordOf = function (state, teamId) {
    var res = state && state.season && state.season.results && teamId ? state.season.results[teamId] : null;
    if (!res) return '';
    return RTG.Standings && RTG.Standings.recordString ? RTG.Standings.recordString(res) : (res.w + '-' + res.l);
  };

  /** Standing row of a team in the current season (or null). */
  Kit.standingRow = function (state, teamId) {
    var rows = state && state.season && state.season.standings || [];
    for (var i = 0; i < rows.length; i++) if (rows[i].teamId === teamId) return rows[i];
    return null;
  };

  /** '#4' (college poll) or 'SEED 2' / 'DIV 3rd' (NFL) chip, or null. */
  Kit.rankChip = function (state, teamId) {
    if (!state || !teamId || !state.season) return null;
    var c = C();
    if (state.season.league === 'COLLEGE') {
      var r = state.season.rankings && state.season.rankings[teamId];
      if (r && r.rank && r.rank <= 25) return Kit.tip(c.chip('#' + r.rank, 'gold'), 'Poll rank ' + r.rank + (r.prev ? ' (was ' + r.prev + ')' : ''));
      return null;
    }
    var row = Kit.standingRow(state, teamId);
    if (!row) return null;
    if (row.seed) return Kit.tip(c.chip('SEED ' + row.seed, 'gold'), 'Conference seed ' + row.seed + (row.divChamp ? ' · division champion' : ''));
    if (row.divRank) return Kit.tip(c.chip(c.fmt.ordinal(row.divRank) + ' ' + (row.div || 'DIV'), 'grey'), 'Division rank ' + row.divRank + ' · conference rank ' + row.confRank);
    return null;
  };

  Kit.climateName = function (t) {
    if (!t) return '—';
    if (t.dome) return 'DOME';
    var k = String(t.climate || 'temperate').toUpperCase();
    return k;
  };
  Kit.climateIcon = function (t) {
    if (!t) return 'cloud';
    if (t.dome || t.climate === 'dome') return 'dome';
    if (t.climate === 'cold') return 'snow';
    if (t.windy) return 'wind';
    if (t.climate === 'warm') return 'sun';
    return 'cloud';
  };
  Kit.climateChip = function (t, kind) {
    var c = C();
    var chip = c.chip(Kit.climateName(t), kind || 'sky', Kit.climateIcon(t));
    return Kit.tip(chip, (t && t.dome ? 'Indoor stadium: no wind, no weather' : 'Home climate: ' + Kit.climateName(t).toLowerCase()) + (t && t.windy ? ' · windy venue' : '') + (t && t.rainy ? ' · rainy venue' : '') + (t && t.altitude ? ' · altitude (ball carries)' : ''));
  };

  /** Team quality stars from the OFF / DEF / ST ratings (display only; the raw numbers are in the tooltip). */
  Kit.teamStars = function (t) {
    if (!t) return null;
    var avg = (num(t.OFF, 60) + num(t.DEF, 60) + num(t.ST, 60)) / 3;
    var n = Math.max(1, Math.min(5, Math.round((avg - 45) / 10)));
    var s = C().stars(n);
    return Kit.tip(s, 'Team quality: OFF ' + num(t.OFF) + ' · DEF ' + num(t.DEF) + ' · ST ' + num(t.ST));
  };

  /** Crest + name row. */
  Kit.crestName = function (id, size, opts) {
    opts = opts || {};
    var c = C(), t = Kit.team(id);
    var row = c.el('span', { class: 'row kit-crestname' + (opts.class ? ' ' + opts.class : '') });
    row.appendChild(c.crest(t || id, size || 24));
    row.appendChild(c.el('span', { class: 'kit-teamname' + (opts.small ? ' small' : ''), text: opts.abbr ? Kit.abbr(id) : (t ? t.name : String(id || '—')) }));
    return row;
  };

  var SENDER_NAMES = { coach: 'COACH', agent: 'AGENT', gm: 'GM', press: 'PRESS', fan: 'FAN', family: 'FAMILY', sponsor: 'SPONSOR', teammate: 'TEAMMATE' };
  Kit.senderName = function (k) { return SENDER_NAMES[k] || String(k || 'PRESS').toUpperCase(); };

  /** Procedural 8×8 pixel avatar per sender kind (coach cap, agent shades, GM tie, press mic, fan paint, family heart …). */
  var AV = {
    coach: { rows: ['..CCCC..', '.CCCCCC.', '..SSSS..', '..SESE..', '..SSSS..', '.RRRRRR.', 'RRRWWRRR', 'RRRRRRRR'], col: { C: '#d8433a', S: '#f1c9a5', E: '#101226', R: '#262b4d', W: '#f2f2e6' } },
    agent: { rows: ['..HHHH..', '.HHHHHH.', '.SGGGGS.', '..SSSS..', '..SSSS..', '.BBWWBB.', 'BBBTTBBB', 'BBBBBBBB'], col: { H: '#2b1d12', S: '#d9a066', G: '#101226', B: '#12142a', W: '#f2f2e6', T: '#d8433a' } },
    gm: { rows: ['..HHHH..', '.HHHHHH.', '..SSSS..', '..SESE..', '..SSSS..', '.GGWWGG.', 'GGGTTGGG', 'GGGGGGGG'], col: { H: '#8a8f9e', S: '#f1c9a5', E: '#101226', G: '#5b3a6e', W: '#f2f2e6', T: '#f6c445' } },
    press: { rows: ['..HHHH..', '.HHHHHH.', '..SSSS..', '..SESE..', '.MSSSS..', '.MPPPPP.', '.MPPPPP.', '..PPPP..'], col: { H: '#6b4a2b', S: '#a3683a', E: '#101226', M: '#8a8f9e', P: '#7fc7ff' } },
    fan: { rows: ['..HHHH..', '.HHHHHH.', '..SSSS..', '.PSESEP.', '..SSSS..', '.JJJJJJ.', 'JJJ11JJJ', 'JJJJJJJJ'], col: { H: '#d8b45a', S: '#f1c9a5', E: '#101226', P: '#f6c445', J: 'var(--team-1, #f6c445)', 1: 'var(--team-2, #f4e9d0)' } },
    family: { rows: ['..HHHH..', '.HHHHHH.', '..SSSS..', '..SESE..', '..SSSS..', '.KK.KK..', 'KKKKKKK.', '.KKKKK..'], col: { H: '#8a8f9e', S: '#d9a066', E: '#101226', K: '#d8433a' } },
    sponsor: { rows: ['..HHHH..', '.HHHHHH.', '..SSSS..', '..SESE..', '..SSSS..', '.GG$$GG.', 'GG$$$$GG', 'GGGGGGGG'], col: { H: '#111111', S: '#f1c9a5', E: '#101226', G: '#4dbb63', $: '#f6c445' } },
    teammate: { rows: ['.JJJJJJ.', 'JJJJJJJJ', 'JSSSSSSJ', '.SESESS.', '..SSSS..', '.JJJJJJ.', 'JJJ00JJJ', 'JJJJJJJJ'], col: { J: 'var(--team-1, #f6c445)', S: '#a3683a', E: '#101226', 0: 'var(--team-2, #f4e9d0)' } }
  };
  Kit.avatar = function (kind, size) {
    var c = C();
    var def = AV[kind] || AV.press;
    size = size || 32;
    var px = size / 8;
    var wrap = c.el('span', { class: 'avatar kit-avatar kit-avatar-' + (AV[kind] ? kind : 'press'), style: { width: size + 'px', height: size + 'px' }, 'aria-hidden': 'true' });
    for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) {
      var ch = def.rows[y].charAt(x);
      if (ch === '.') continue;
      wrap.appendChild(c.el('i', { style: { left: (x * px) + 'px', top: (y * px) + 'px', width: px + 'px', height: px + 'px', background: def.col[ch] || '#fff' } }));
    }
    return wrap;
  };

  /** ★ per impact point (0..3). */
  Kit.impactStars = function (n) {
    var c = C();
    n = Math.max(0, Math.min(3, num(n)));
    var s = '';
    for (var i = 0; i < n; i++) s += '★';
    return c.el('span', { class: 'kit-impact txt-gold', text: s, 'aria-label': 'impact ' + n + ' of 3' });
  };

  /** 'Y3 · WK 5' style label for a year/week pair. */
  Kit.weekLabel = function (year, week) { return 'Y' + year + (week ? ' · WK ' + week : ' · PRE'); };

  Kit.awardName = function (id) {
    var d = RTG.Data && RTG.Data.awardsById && RTG.Data.awardsById[id];
    return d ? d.name : String(id || '').replace(/_/g, ' ');
  };

  Kit.contractText = function (ct) {
    if (!ct) return 'No contract';
    if (ct.type === 'SCHOLARSHIP' || ct.type === 'WALKON') return ct.type + ' · year ' + (num(ct.yearIdx) + 1) + '/' + ct.years;
    return ct.type + ' · ' + C().fmt.money(ct.aav) + '/yr · year ' + (num(ct.yearIdx) + 1) + '/' + ct.years + (ct.gtdPct ? ' · ' + Math.round(ct.gtdPct * 100) + '% gtd' : '');
  };

  /** Coach type description (college coach style from the offer). */
  var COACH_STYLE = {
    TRUSTING: 'Trusting — lets you try the long ones (trust starts 60)',
    CAUTIOUS: 'Cautious — punts from the 35 (trust starts 40)',
    WHISPERER: 'Kicker-whisperer — +15 % training XP, +1 ACC every offseason'
  };
  Kit.coachStyleText = function (style) { return COACH_STYLE[style] || ''; };
  Kit.aggressionText = function (agg) {
    agg = num(agg, 0.5);
    if (agg >= 0.58) return 'AGGRESSIVE';
    if (agg <= 0.42) return 'CONSERVATIVE';
    return 'BALANCED';
  };

  /** 5-state team-mood face (0 furious … 4 delighted) as a tiny pixel grid. */
  var FACES = [
    ['........', '.XX..XX.', '..X..X..', '........', '........', '..XXXX..', '.X....X.', '........'],
    ['........', '.XX..XX.', '........', '........', '........', '..XXXX..', '.X....X.', '........'],
    ['........', '.XX..XX.', '........', '........', '........', '.XXXXXX.', '........', '........'],
    ['........', '.XX..XX.', '........', '........', '.X....X.', '..XXXX..', '........', '........'],
    ['........', '.XX..XX.', '........', '........', 'X......X', '.X....X.', '..XXXX..', '........']
  ];
  var FACE_LABEL = ['FURIOUS', 'UNHAPPY', 'NEUTRAL', 'PLEASED', 'DELIGHTED'];
  var FACE_COL = ['#d8433a', '#d9773b', '#8a8f9e', '#4dbb63', '#f6c445'];
  Kit.moodFace = function (level, size, label) {
    var c = C();
    level = Math.max(0, Math.min(4, Math.round(num(level, 2))));
    size = size || 40;
    var px = size / 8;
    var wrap = c.el('span', { class: 'kit-face', style: { width: size + 'px', height: size + 'px', background: FACE_COL[level] }, role: 'img', 'aria-label': (label || 'Team mood') + ': ' + FACE_LABEL[level].toLowerCase() });
    var rows = FACES[level];
    for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) {
      if (rows[y].charAt(x) !== 'X') continue;
      wrap.appendChild(c.el('i', { style: { left: (x * px) + 'px', top: (y * px) + 'px', width: px + 'px', height: px + 'px' } }));
    }
    var out = c.el('span', { class: 'kit-mood' }, wrap, c.el('span', { class: 'small kit-mood-label', text: FACE_LABEL[level] }));
    return out;
  };
  Kit.FACE_LABEL = FACE_LABEL;

  /** A college offer card (offers screen + TRANSFER step). opts: {onPick, pickLabel, selected, compact}. */
  Kit.offerCard = function (o, opts) {
    opts = opts || {};
    var c = C(), t = Kit.team(o.teamId);
    var head = c.el('div', { class: 'row offer-head' }, c.crest(t || o.teamId, 40),
      c.el('div', { class: 'col grow', style: 'gap:2px' },
        c.el('strong', { class: 'offer-name', text: o.teamName || Kit.teamName(o.teamId) }),
        c.el('span', { class: 'row row-wrap small' }, Kit.tip(c.stars(num(o.prestige)), 'Prestige ' + num(o.prestige) + ' of 5: wins, fame multiplier and draft bump'), c.el('span', { class: 'txt-grey', text: (o.conf || '') + (t && t.city ? ' · ' + t.city : '') }))));
    var depthKind = o.depth === 'OPEN' ? 'mint' : (o.depth === 'STAR' ? 'red' : 'grey');
    var depthTip = o.depth === 'OPEN' ? 'Open job: you start' : (o.depth === 'STAR' ? 'A star incumbent (OVR ' + (o.incumbent ? o.incumbent.ovr : '?') + '): expect a year as K2' : 'Veteran incumbent (OVR ' + (o.incumbent ? o.incumbent.ovr : '?') + ', 1 year left): camp battle');
    var chips = c.el('div', { class: 'chips mt-1' },
      Kit.tip(c.chip(o.depth || '—', depthKind), depthTip),
      Kit.tip(c.chip('NIL $' + num(o.nil) + 'k', 'gold', 'money'), 'Name-image-likeness money per year: +fame, +morale, unlocks NIL events'),
      Kit.climateChip(t || o),
      o.nearHome ? Kit.tip(c.chip('NEAR HOME', 'mint', 'home'), 'Hometown region: morale +5 per season, family events') : null,
      o.safety ? Kit.tip(c.chip('SAFETY', 'grey'), 'The safety school: always available') : null,
      o.walkon ? Kit.tip(c.chip('WALK-ON', 'red'), 'No scholarship') : null);
    var coach = c.el('p', { class: 'small offer-coach mt-1' }, c.el('span', { class: 'txt-sky', text: (t && t.coach ? t.coach : 'Coach') + ': ' }), c.el('span', { text: Kit.coachStyleText(o.coach) || o.coach }));
    var inc = o.incumbent ? c.el('p', { class: 'small txt-grey', text: 'Kicker room: ' + o.incumbent.name + ' (OVR ' + o.incumbent.ovr + ', age ' + o.incumbent.age + ')' + (typeof o.myOvr === 'number' ? ' · you ' + o.myOvr : '') }) : null;
    var body = [head, chips, coach, inc];
    var footer = opts.onPick ? [c.button({ label: opts.pickLabel || 'COMMIT', kind: 'primary', block: true, icon: 'check', action: 'pick-' + o.id, onClick: function () { opts.onPick(o); } })] : null;
    var card = c.card({ kind: opts.selected ? 'gold' : 'flat', class: 'offer-card' + (opts.compact ? ' offer-compact' : ''), body: body, footer: footer });
    card.setAttribute('data-offer', o.id);
    return card;
  };

  /** Compact bracket (rounds as columns inside .scroll-x). */
  Kit.bracketEl = function (state) {
    var c = C(), b = state && state.season && state.season.playoffs;
    if (!b || !b.rounds) return null;
    var me = state.player.teamId;
    var wrap = c.el('div', { class: 'bracket' });
    b.rounds.forEach(function (r, ri) {
      var col = c.el('div', { class: 'bracket-round' + (ri === b.roundIdx ? ' current' : '') });
      col.appendChild(c.el('div', { class: 'bracket-round-name small txt-grey', text: r.name + ' · WK ' + r.week }));
      if (!r.games.length) col.appendChild(c.el('div', { class: 'bracket-tbd small txt-grey', text: 'TBD' }));
      r.games.forEach(function (g) {
        var box = c.el('div', { class: 'bracket-game' + (g.homeId === me || g.awayId === me ? ' mine' : '') });
        function line(id, seed, isHome) {
          var won = g.winnerId && g.winnerId === id, lost = g.winnerId && g.winnerId !== id;
          var sc = g.score ? (isHome ? g.score.home : g.score.away) : null;
          return c.el('div', { class: 'bracket-line' + (won ? ' won' : '') + (lost ? ' lost' : '') + (id === me ? ' me' : '') },
            c.el('span', { class: 'small txt-grey bracket-seed', text: seed ? String(seed) : '' }), c.crest(id, 14), c.el('span', { class: 'bracket-abbr', text: Kit.abbr(id) }),
            sc !== null ? c.el('span', { class: 'num bracket-score', text: String(sc) }) : null);
        }
        box.appendChild(line(g.awayId, g.awaySeed, false));
        box.appendChild(line(g.homeId, g.homeSeed, true));
        if (g.venue && g.venue.type !== 'HOME' && g.venue.name) box.appendChild(c.el('div', { class: 'small txt-grey bracket-venue ellipsis', text: g.venue.name }));
        col.appendChild(box);
      });
      wrap.appendChild(col);
    });
    if (b.championId) wrap.appendChild(c.el('div', { class: 'bracket-round' }, c.el('div', { class: 'bracket-round-name small txt-grey', text: 'CHAMPION' }), c.el('div', { class: 'bracket-game champion' }, c.el('div', { class: 'bracket-line won' }, c.icon('trophy', 12), c.crest(b.championId, 16), c.el('span', { text: Kit.teamName(b.championId) })))));
    return c.el('div', { class: 'scroll-x bracket-scroll' }, wrap);
  };

  /** Season goals list (PRE card / awards). */
  Kit.goalsList = function (goals) {
    var c = C();
    return c.list(goals || [], function (g) {
      var isPct = g.id === 'FG_PCT';
      var prog = isPct ? c.fmt.pct(num(g.progress), 0) : String(Math.round(num(g.progress)));
      var tgt = isPct ? c.fmt.pct(num(g.target), 0) : String(g.target);
      return c.el('span', { class: 'row row-between grow goal-row' + (g.met ? ' met' : '') },
        c.el('span', { class: 'row' }, c.icon(g.met ? 'check' : 'flag', 12), c.el('span', { text: g.text })),
        c.el('span', { class: 'row small' }, Kit.numEl(prog + ' / ' + tgt, 'Progress toward the goal'), Kit.tip(c.chip('+' + num(g.xp) + ' XP', g.met ? 'mint' : 'grey'), 'XP paid at the awards ceremony when met')));
    }, { empty: 'No season goals set yet.' });
  };

  /** The user's kicks of one game from the kick log. */
  Kit.gameKicks = function (state, gameId) {
    var rows = state && state.stats && state.stats.kicks || [];
    var out = [];
    for (var i = 0; i < rows.length; i++) if (rows[i].gameId === gameId) out.push(rows[i]);
    return out;
  };
  Kit.lineFromKicks = function (kicks) {
    var l = { fga: 0, fgm: 0, pat: 0, patMade: 0, long: 0 };
    for (var i = 0; i < kicks.length; i++) {
      var k = kicks[i];
      if (k.type === 'FG') { l.fga++; if (k.made) { l.fgm++; if (k.distance > l.long) l.long = k.distance; } }
      else if (k.type === 'PAT') { l.pat++; if (k.made) l.patMade++; }
    }
    return l;
  };

  var OUTCOME_TEXT = { GOOD: 'GOOD', WIDE_L: 'WIDE LEFT', WIDE_R: 'WIDE RIGHT', SHORT: 'SHORT', BLOCKED: 'BLOCKED', DOINK_IN: 'DOINK · IN', DOINK_OUT: 'DOINK · OUT', XBAR_IN: 'CROSSBAR · IN', XBAR_OUT: 'CROSSBAR · OUT' };
  Kit.outcomeText = function (o) { return OUTCOME_TEXT[o] || String(o || ''); };

  /** Kick log row → chip row (distance/type, outcome, tags). */
  Kit.kickChip = function (k) {
    var c = C();
    return Kit.tip(c.chip((k.type === 'PAT' ? 'PAT' : k.distance + ' YD') + ' ' + (k.made ? '✓' : '✗'), k.made ? 'mint' : 'red'), Kit.outcomeText(k.outcome) + (k.tags && k.tags.length ? ' · ' + k.tags.join(', ') : '') + (k.wind && k.wind.speed ? ' · wind ' + Math.round(k.wind.speed) : ''));
  };

  /** Venue / forecast description for a game of the user's team. */
  Kit.venueInfo = function (state, ref) {
    var g = ref && ref.game;
    var site = null, hostTeam = null, label = '';
    if (g && g.venue && typeof g.venue === 'object') {
      if (g.venue.site) site = g.venue.site;
      else if (g.venue.hostTeamId) hostTeam = Kit.team(g.venue.hostTeamId);
      label = g.venue.name || '';
    } else if (g && g.site) { site = g.site; label = g.bowlName || g.site.name || ''; }
    else if (g) { hostTeam = Kit.team(g.venue || g.homeId); label = hostTeam ? (hostTeam.city ? hostTeam.city : hostTeam.name) : ''; }
    var v = site || hostTeam || {};
    var W = RTG.Tuning && RTG.Tuning.weather, climates = W && W.climates;
    var key = v.dome ? 'dome' : (v.climate || 'temperate');
    var mi = RTG.Weather && RTG.Weather.monthIndex ? RTG.Weather.monthIndex(ref.week, ref.league) : 0;
    var temp = climates && climates[key] ? climates[key].temp[Math.min(4, mi)] : null;
    return { label: label, venue: v, climateKey: key, tempF: temp, month: RTG.Weather && RTG.Weather.monthFor ? RTG.Weather.monthFor(ref.week, ref.league) : '', neutral: !!site };
  };

  Kit.kindLabel = function (kind) {
    var K = { REG: 'REGULAR SEASON', CCG: 'CONFERENCE CHAMPIONSHIP', BOWL: 'BOWL GAME', PLAYOFF: 'PLAYOFF', WC: 'WILD CARD', DIV: 'DIVISIONAL', CONF: 'CONFERENCE CHAMPIONSHIP', CHAMP: 'THE CHAMPIONSHIP' };
    return K[kind] || String(kind || '');
  };

  RTG.UI.Kit = Kit;

  // ═══════════════════════════════ hub screen ═══════════════════════════════

  function factory(store) {
    var c = C(), R = Router();
    var el = c.el('div', { class: 'screen scr-hub' });
    var unsub = null, destroyed = false;
    var dispatch = function () { return Kit.dispatch.apply(null, [store].concat(Array.prototype.slice.call(arguments))); };

    function teamBar(state) {
      var p = state.player, t = Kit.userTeam(state);
      var bar = c.el('button', { type: 'button', class: 'hub-teambar card card-team', 'aria-label': 'Team page', onClick: function () { R.go('team'); } });
      bar.appendChild(c.crest(t || null, 44));
      var mid = c.el('div', { class: 'col grow', style: 'gap:2px' });
      mid.appendChild(c.el('strong', { class: 'hub-teamname ellipsis', text: t ? t.name : (p.league === 'NFL' || state.stage === 'NFL' ? 'FREE AGENT' : 'NO TEAM') }));
      var line = c.el('span', { class: 'row row-wrap small' });
      var rec = Kit.recordOf(state, p.teamId);
      if (rec) line.appendChild(Kit.numEl(rec, 'Team record this season', 'txt-cream'));
      var rk = Kit.rankChip(state, p.teamId);
      if (rk) line.appendChild(rk);
      if (t && t.coach) line.appendChild(c.el('span', { class: 'txt-grey ellipsis', text: t.coach }));
      mid.appendChild(line);
      bar.appendChild(mid);
      var right = c.el('div', { class: 'col hub-teambar-right', style: 'gap:4px; align-items:flex-end' });
      right.appendChild(Kit.tip(c.chip(p.role === 'NONE' ? 'FA' : p.role, p.role === 'K1' ? 'gold' : 'grey'), p.role === 'K1' ? 'Starting kicker' : (p.role === 'K2' ? 'Backup: the rival kicks the field goals' : 'No team')));
      right.appendChild(Kit.tip(c.chip('OVR ' + Kit.ovr(p), 'dark'), 'Overall rating: 0.30 ACC + 0.25 POW + 0.20 CON + 0.17 CLU + 0.08 KO'));
      bar.appendChild(right);
      return bar;
    }

    function banners(state) {
      var p = state.player, out = [];
      if (p.injury) out.push(c.el('div', { class: 'banner banner-bad small hub-banner', role: 'status' }, c.icon('heart', 12), ' INJURED — ' + (p.injury.label || p.injury.type) + ' · ' + p.injury.weeksLeft + ' week' + (p.injury.weeksLeft === 1 ? '' : 's') + (p.injury.careerThreat ? ' · CAREER THREAT' : '')));
      if (p.role === 'K2' && p.teamId && (state.phase === 'REG' || state.phase === 'POST')) out.push(c.el('div', { class: 'banner banner-gold small hub-banner', role: 'status' }, c.icon('team', 12), ' BENCHED — the other leg starts this week. Job security ' + Math.round(p.js)));
      if (!p.teamId && state.stage === 'NFL') out.push(c.el('div', { class: 'banner banner-sky small hub-banner', role: 'status' }, c.icon('envelope', 12), ' FREE AGENT — ' + (p.flags && p.flags.practiceSquad ? 'on a practice squad, waiting for the call-up' : 'waiting for the phone to ring')));
      var ft = RTG.Player && RTG.Player.formText ? RTG.Player.formText(p) : '';
      if (ft) out.push(c.el('div', { class: 'small txt-sky hub-form', text: '“' + ft + '”' }));
      return out;
    }

    function forecastRow(state, ref) {
      var vi = Kit.venueInfo(state, ref);
      var v = vi.venue;
      var row = c.el('div', { class: 'row row-wrap hub-forecast' });
      row.appendChild(Kit.tip(c.el('span', { class: 'row small' }, c.icon('home', 12), c.el('span', { class: 'ellipsis', text: vi.neutral ? vi.label : (ref.isHome ? 'HOME · ' : 'AWAY · ') + (vi.label || '—') })), vi.neutral ? 'Neutral site' : (ref.isHome ? 'Your stadium' : 'Their stadium')));
      var chips = c.el('span', { class: 'chips' });
      chips.appendChild(Kit.climateChip(v));
      if (vi.tempF !== null) chips.appendChild(Kit.tip(c.chip(Math.round(vi.tempF) + '°F', 'grey'), 'Typical ' + vi.month + ' temperature at this venue — the real weather and wind are rolled at kickoff'));
      if (v.surface) chips.appendChild(Kit.tip(c.chip(String(v.surface).toUpperCase(), 'grey'), 'Playing surface'));
      if (v.altitude) chips.appendChild(Kit.tip(c.chip('ALTITUDE', 'sky', 'arrow-u'), 'Thin air: the ball carries further'));
      row.appendChild(chips);
      return row;
    }

    function ratingsRow(state, ref) {
      var mine = Kit.team(state.player.teamId), opp = Kit.team(ref.oppId);
      if (!mine || !opp) return null;
      function cell(t) {
        return c.el('span', { class: 'row small hub-rating' }, c.el('span', { class: 'txt-grey', text: Kit.abbr(t.id) }),
          Kit.numEl('OFF ' + num(t.OFF), 'Offense rating'), Kit.numEl('DEF ' + num(t.DEF), 'Defense rating'), Kit.numEl('ST ' + num(t.ST), 'Special teams rating (blends the kicker)'));
      }
      return c.el('div', { class: 'col hub-ratings', style: 'gap:2px' }, cell(mine), cell(opp));
    }

    function storylines(state) {
      var hs = (state.headlines || []).slice(-2).reverse();
      if (!hs.length) return null;
      var wrap = c.el('div', { class: 'hub-storylines mt-1' });
      hs.forEach(function (h) { wrap.appendChild(c.el('div', { class: 'headline small' }, c.el('span', { class: 'headline-tag', text: 'Y' + h.year + (h.week ? ' · WK ' + h.week : '') + ' · ' + String(h.tag || '').replace(/_/g, ' ') }), h.text)); });
      return wrap;
    }

    function actionButtons(state, ref) {
      var season = state.season, p = state.player, buttons = [];
      var inSeason = state.phase === 'REG' || state.phase === 'POST';
      var canTrain = inSeason && !season.trainingDone && !state.pending && !(p.flags && p.flags.skipTraining);
      if (canTrain) buttons.push(c.button({ label: 'TRAIN', kind: 'secondary', icon: 'train', action: 'train', onClick: function () { R.go('training'); } }));
      var gameOpen = ref && !ref.played && !season.weekGameDone && !state.pending;
      if (gameOpen) {
        buttons.push(c.button({ label: 'PLAY GAME', kind: 'primary', icon: 'boot', action: 'play', onClick: Kit.safe(function () { dispatch('startUserGame'); }) }));
        buttons.push(c.button({ label: 'SIM GAME', kind: 'secondary', icon: 'dice', action: 'sim-game', onClick: Kit.safe(function () {
          var s = dispatch('autoPlayGame');
          if (s) { c.announce('Final ' + s.score.away + '-' + s.score.home + (s.won ? ', a win' : s.tied ? ', a tie' : ', a loss')); R.go('postgame', { summary: s }); }
        }) }));
      } else if (inSeason && !state.pending) {
        buttons.push(c.button({ label: 'END WEEK', kind: 'primary', icon: 'arrow-r', action: 'end-week', onClick: Kit.safe(function () {
          var r = dispatch('endWeek');
          if (r) {
            var h = r.headlines && r.headlines.length ? r.headlines[0].text : null;
            if (h) c.toast(h, 'gold', 4000);
            c.announce(h || ('Week ' + r.week + ' done.'));
            if (r.injuries && r.injuries.isNew) c.toast('INJURED — out ' + r.injuries.weeksLeft + ' weeks', 'bad', 4000);
            if (r.bench) c.toast('Benched next week', 'bad', 3500);
            if (r.award) c.toast('Award: ' + (r.award.name || r.award.id), 'good', 3500);
          }
        }) }));
      }
      if (inSeason && !state.pending) {
        buttons.push(c.button({ label: 'SIM TO END OF SEASON', kind: 'ghost', action: 'sim-season', onClick: function () {
          c.confirm({ title: 'Sim to the end of the season?', text: 'Every remaining game is played with auto kicks. Training is chosen for you.', okLabel: 'SIM SEASON' })
            .onOk(Kit.safe(function () { var line = dispatch('autoPlaySeason', {}); if (line) c.announce('Season over: ' + (line.teamRecord || '')); }));
        } }));
      }
      return buttons;
    }

    function weekCard(state) {
      var ref = RTG.Season && RTG.Season.userGameRef ? RTG.Season.userGameRef(state) : null;
      var season = state.season, p = state.player;
      var body = [], title;
      if (!p.teamId) {
        title = 'WEEK ' + state.week;
        body.push(c.el('p', { class: 'small txt-grey', text: state.stage === 'NFL' ? 'No team this week. End the week and wait for a call.' : 'No team.' }));
        return c.card({ title: title, kind: 'sky', body: body, footer: actionButtons(state, null) });
      }
      if (!ref) {
        // bye / eliminated
        var post = state.phase === 'POST';
        title = post ? 'POSTSEASON · WEEK ' + state.week : 'BYE WEEK · WEEK ' + state.week;
        if (post) {
          var alive = season.playoffs && season.playoffs.seeds ? season.playoffs.seeds.filter(function (s) { return s.teamId === p.teamId; })[0] : null;
          body.push(c.el('p', { class: 'small' }, alive && alive.alive ? 'Bye this round — the seed earned a week off.' : 'Your season is over. Watch the bracket play out, then the awards.'));
        } else {
          body.push(c.el('p', { class: 'small', text: season.trainingDone ? (season.focus === 'REST' ? 'You rested this week: morale up, fresh legs.' : 'You ground it out this week: focus ' + season.focus + '.') : 'No game. Rest the leg or grind in the film room.' }));
          if (!season.trainingDone && !state.pending) {
            body.push(c.el('div', { class: 'btn-row mt-1 hub-bye' },
              Kit.tip(c.button({ label: 'REST', kind: 'secondary', icon: 'heart', action: 'rest', onClick: Kit.safe(function () { var r = dispatch('train', 'REST'); if (r) c.toast('Rested: morale +' + r.moraleDelta + ', injury risk halved next game', 'good'); }) }), '0 XP · morale +8 · injury chance ×0.5 next game'),
              Kit.tip(c.button({ label: 'GRIND', kind: 'secondary', icon: 'train', action: 'grind', onClick: function () { R.go('training'); } }), 'Pick a training focus for the week')));
          }
        }
        return c.card({ title: title, kind: post ? 'gold' : 'sky', body: body, footer: actionButtons(state, ref) });
      }
      var opp = Kit.team(ref.oppId);
      title = 'WEEK ' + state.week + ' · ' + Kit.kindLabel(ref.kind);
      var head = c.el('div', { class: 'row hub-opp' }, c.crest(opp || ref.oppId, 44),
        c.el('div', { class: 'col grow', style: 'gap:2px' },
          c.el('strong', { class: 'ellipsis', text: (ref.isHome ? 'vs ' : '@ ') + (opp ? opp.name : ref.oppId) }),
          c.el('span', { class: 'row row-wrap small' }, Kit.numEl(Kit.recordOf(state, ref.oppId) || '0-0', 'Opponent record'), Kit.rankChip(state, ref.oppId), ref.game && ref.game.rivalry ? Kit.tip(c.chip('RIVALRY', 'red', 'bolt'), 'Rivalry week: extra pressure, extra fame') : null)));
      body.push(head);
      body.push(forecastRow(state, ref));
      body.push(ratingsRow(state, ref));
      if (ref.played && ref.game.score) {
        var us = ref.isHome ? ref.game.score.home : ref.game.score.away, them = ref.isHome ? ref.game.score.away : ref.game.score.home;
        var line = Kit.lineFromKicks(Kit.gameKicks(state, ref.gameId));
        body.push(c.el('div', { class: 'banner ' + (us > them ? 'banner-good' : us < them ? 'banner-bad' : 'banner-gold') + ' small mt-1' }, (us > them ? 'WIN ' : us < them ? 'LOSS ' : 'TIE ') + us + '-' + them + (ref.game.ot ? ' (OT)' : '') + ' · ' + Kit.fgLine(line)));
      } else if (season.trainingDone) {
        body.push(c.el('p', { class: 'small txt-grey mt-1', text: 'Training done: ' + season.focus + (season.focus !== 'REST' ? ' (−25 % XP cost on ' + season.focus + ' this week)' : '') }));
      }
      body.push(storylines(state));
      return c.card({ title: title, kind: 'team', body: body, footer: actionButtons(state, ref) });
    }

    function preCard(state) {
      var season = state.season, cb = season.campBattle, body = [];
      body.push(c.el('p', { class: 'small txt-grey', text: 'Season goals — met goals pay XP at the awards ceremony.' }));
      body.push(Kit.goalsList(season.goals));
      var buttons = [];
      if (cb && cb.required) {
        var pendingCamp = state.pending && state.pending.kind === 'KICKS' && state.pending.session && state.pending.session.kind === 'CAMP';
        var res = cb.result;
        body.push(c.el('div', { class: 'card card-red card-flat mt-1 hub-camp' }, c.el('div', { class: 'card-title' }, c.icon('bolt'), 'CAMP BATTLE'),
          c.el('p', { class: 'small', text: (cb.reason || 'The coach wants a competition.') + ' ' + (cb.rivalName || 'The rival') + ' (OVR ' + num(cb.rivalOvr) + ') vs you (OVR ' + num(cb.myOvr) + ').' }),
          res ? c.el('p', { class: 'small ' + (res.won ? 'txt-mint' : 'txt-red'), text: (res.won ? 'WON ' : 'LOST ') + res.myMakes + '-' + res.rivalMakes + ' · you are ' + res.role }) : null));
        if (pendingCamp) buttons.push(c.button({ label: 'CAMP BATTLE', kind: 'primary', icon: 'boot', action: 'camp', onClick: function () { if (R.has('campbattle')) R.go('campbattle'); else R.sync(); } }));
      }
      if (!state.pending) buttons.push(c.button({ label: 'START SEASON', kind: 'primary', icon: 'arrow-r', action: 'start-season', onClick: Kit.safe(function () { dispatch('nextPhase'); c.announce('Regular season, week 1.'); }) }));
      return c.card({ title: 'PRESEASON · Y' + state.year + ' (' + Kit.calYear(state.year) + ')', kind: 'gold', body: body, footer: buttons });
    }

    function bracketCard(state) {
      var b = Kit.bracketEl(state);
      if (!b) return null;
      return c.card({ title: state.season.playoffs.name || 'PLAYOFFS', icon: 'trophy', body: b, footer: [c.button({ label: 'STANDINGS', kind: 'ghost', onClick: function () { R.go('standings', { tab: 'bracket' }); } })] });
    }

    function metersCard(state) {
      var p = state.player;
      var meters = c.el('div', { class: 'meters-row hub-meters' },
        Kit.tip(c.meter({ label: 'TRUST', value: p.trust }), 'Coach trust ' + Math.round(p.trust) + ': attempt range, job-security floor, extensions'),
        Kit.tip(c.meter({ label: 'FANS', value: p.fans, kind: 'sky' }), 'Fan approval ' + Math.round(p.fans) + ': crowd noise, endorsements, pressure relief at 80+'),
        Kit.tip(c.meter({ label: 'MORALE', value: p.morale, kind: 'mint' }), 'Morale ' + Math.round(p.morale) + ': training multiplier; below 30 for 3 weeks = slump'),
        Kit.tip(c.meter({ label: 'JOB', value: p.js, kind: p.js < 25 ? 'red' : '' }), 'Job security ' + Math.round(p.js) + ': below 25 = benched, below 10 for 3 weeks = cut'));
      var chips = c.el('div', { class: 'chips mt-1 hub-chips' },
        Kit.tip(c.chip(Kit.fameTier(p.fame), 'gold', 'star'), 'Fame ' + Math.round(p.fame) + ' / 1000 — tiers at 100 / 250 / 500 / 800'),
        Kit.tip(c.el('button', { type: 'button', class: 'chip chip-sky hub-xp', 'aria-label': 'XP ' + p.xp + ', open training', onClick: function () { R.go('training'); } }, c.icon('bolt', 10), ' XP ' + p.xp), 'Unspent XP — tap to train'),
        Kit.tip(c.chip(c.fmt.money(num(state.history && state.history.earnings)), 'grey', 'money'), 'Career earnings'),
        p.injury ? null : (p.flags && p.flags.rested ? Kit.tip(c.chip('RESTED', 'mint', 'heart'), 'Injury chance halved next game') : null));
      return c.card({ title: 'METERS', kind: 'flat', body: [meters, chips] });
    }

    function inboxCard(state) {
      var msgs = (state.inbox || []).slice(-3).reverse();
      var unread = (state.inbox || []).filter(function (m) { return !m.read; }).length;
      var list = c.list(msgs, function (m) {
        return c.el('span', { class: 'row grow hub-msg' + (m.read ? '' : ' unread') }, Kit.avatar(m.avatar || m.from, 24),
          c.el('span', { class: 'col grow', style: 'gap:0' }, c.el('span', { class: 'small txt-sky', text: Kit.senderName(m.from) + ' · ' + Kit.weekLabel(m.year, m.week) }), c.el('span', { class: 'small hub-msg-text', text: m.text })));
      }, { empty: 'No messages yet.' });
      return c.card({ title: 'INBOX', icon: 'envelope', right: unread ? Kit.tip(c.chip(unread + ' NEW', 'red'), 'Unread messages') : null, body: list, footer: [c.button({ label: 'OPEN INBOX', kind: 'ghost', icon: 'envelope', action: 'inbox', onClick: function () { R.go('inbox'); } })] });
    }

    function elsewhereCard(state) {
      var where = R.resolve(state);
      var msg = state.stage === 'HS' ? 'The showcase and the college offers come first.' : (state.stage === 'DRAFT' ? 'The draft process is under way.' : state.stage === 'RETIRED' ? 'Career over — the legacy report is waiting.' : state.phase === 'AWARDS' ? 'The awards ceremony is on.' : state.phase === 'OFF' ? 'The offseason wizard is open.' : (state.pending ? 'Something needs your answer first.' : ''));
      return c.card({ title: 'ELSEWHERE', kind: 'sky', body: c.el('p', { class: 'small', text: msg || 'Nothing to do here right now.' }), footer: [c.button({ label: 'GO THERE', kind: 'primary', icon: 'arrow-r', onClick: function () { R.sync({ force: true }); } })] });
    }

    function render() {
      if (destroyed) return;
      var state = store.state;
      if (!state) { c.replace(el, c.card({ body: c.el('p', { text: 'No career loaded.' }), footer: [c.button({ label: 'TITLE', kind: 'primary', onClick: function () { R.go('title'); } })] })); return; }
      var parts = [];
      var head = c.el('header', { class: 'screen-head' }, c.el('h1', { class: 'screen-title', text: state.stage === 'NFL' ? 'PRO' : (state.stage === 'COLLEGE' ? 'COLLEGE' : state.stage) }),
        c.el('div', { class: 'screen-head-right small txt-grey' }, c.el('span', { class: 'num', text: c.fmt.week(state) + ' · ' + Kit.calYear(state.year) })));
      parts.push(head);
      parts.push(teamBar(state));
      parts = parts.concat(banners(state));
      var playing = state.stage === 'COLLEGE' || state.stage === 'NFL';
      var here = playing && (state.phase === 'PRE' || state.phase === 'REG' || state.phase === 'POST') && !state.game;
      if (!here) parts.push(elsewhereCard(state));
      else if (state.phase === 'PRE') parts.push(preCard(state));
      else {
        if (state.phase === 'POST') parts.push(bracketCard(state));
        parts.push(weekCard(state));
      }
      parts.push(metersCard(state));
      parts.push(inboxCard(state));
      c.replace(el, parts);
    }

    render();
    unsub = store.subscribe(function () { render(); });
    return {
      el: el,
      destroy: function () { destroyed = true; if (unsub) unsub(); unsub = null; },
      onKey: function (ev) {
        if (ev.target && ev.target !== root.document.body && ev.target !== root.document.documentElement) return false;
        if (ev.key === 'Enter' && !ev.repeat) {
          var b = el.querySelector('.card-footer .btn-primary');
          if (b) { b.click(); return true; }
        }
        return false;
      }
    };
  }

  Screens.hub = factory;
  RTG.UI.Router.register('hub', factory);
})(typeof window !== 'undefined' ? window : globalThis);
