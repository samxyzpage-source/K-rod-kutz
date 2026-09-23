/**
 * Road to Glory: QB — RTG.UI.Store (the demo's tiny store: settings, the drive script, the moment index, the
 * box-score line, the seed, the rng). Plain functions, no career engine: the moment screen depends only on
 * { ctx, Play, PlayView } (see screens/moment.js → RTG.UI.Moment) so the future career can host it unchanged.
 *
 *   var store = new RTG.UI.Store();          // app.js creates the singleton RTG.UI.store
 *   store.settings · store.setSetting(key, value) · store.resetSettings() · store.subscribe(fn) → unsubscribe
 *   store.newDrive({seed, archetype, team, venue}) → drive       the six-snap script from the seed (Play.driveScript)
 *   store.drive · store.hasDrive() · store.pending() → 'PLAY' | 'STORY' | 'DONE' · store.isDone()
 *   store.situation() → the armed situation (script entry + qb / team / opp / weather, yl advanced by the story)
 *   store.context() → PlayContext (Play.buildContext, memoised per moment; ctx.pressureLevel added for the scene)
 *   store.snap(playId) → PlaySim · store.throwBall(input) → PlayResult      (the rng's forks, 1 parent draw each)
 *   store.record(result, sim) → story    the box score, the story line, the next moment's yardage; pending → STORY | DONE
 *   store.next()                          arms the next moment (pending → PLAY)
 *   store.autoInput(sim) → input          a sensible throw (the most open receiver on time, in the green) for debug / skipTo
 *   store.autoResolve() → result          ctx → snap the first pass card → throw autoInput → record (headless)
 *   store.force(result, sim) → story      record a forced result (RTG.debug.forceResult); consumes the throw fork
 *   store.summary() → {line, rating, best, verdict, results, won, seed, …}
 *   store.line() · store.results()
 *
 * RNG draw accounting on the drive's parent rng (deterministic per seed, independent of the player's inputs):
 *   driveScript fork 1 · weather fork 1 · then per moment: buildContext 1 · snap 1 · throw 1 (a run option and a
 *   forced result consume the throw fork too, so every moment costs exactly 3 parent draws).
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};

  var KEYS = { settings: 'rtg.qb.settings' };
  var FIELD = 100;
  var KINDS = ['THIRD_MEDIUM', 'THIRD_LONG', 'RED_ZONE', 'SHORT_YARDAGE', 'TWO_MINUTE', 'LAST_PLAY'];
  /** The scene's crowd / clutch level per moment kind (presentation only). */
  var PRESSURE = { THIRD_MEDIUM: 0.3, THIRD_LONG: 0.4, RED_ZONE: 0.55, SHORT_YARDAGE: 0.5, TWO_MINUTE: 0.75, LAST_PLAY: 0.95 };
  /** When the drive continues, the next script entry starts further downfield — but never past the yard line that
      makes the kind what it is (a red-zone snap stays a red-zone snap; a first down in the drill carries into the
      last play, which still starts at least 20 yards out — a shot at the end zone, earned). */
  var ADVANCE_CAP = { THIRD_LONG: 60, RED_ZONE: 95, SHORT_YARDAGE: 75, TWO_MINUTE: 75, LAST_PLAY: 80 };
  /** A touchdown in the two-minute drill puts the offence up; the last play's script keeps its deficit (a TD wins,
      a FG does not), so both scores move by a touchdown: "they answered, and then some". */
  var DRILL_TD_SHIFT = 7;
  var ADVANCE_MIN = -10, ADVANCE_MAX = 40;
  /** Home tints per venue for the scene (the demo has no team objects). */
  var TINTS = {
    HS: { home: ['#d8433a', '#f2f2e6'], opp: ['#8a8f9e', '#f4e9d0'] },
    COLLEGE: { home: ['#f6c445', '#101226'], opp: ['#8a8f9e', '#f4e9d0'] },
    NFL: { home: ['#7fc7ff', '#f2f2e6'], opp: ['#8a8f9e', '#f4e9d0'] }
  };

  function Storage() { return RTG.UI.Storage; }
  function Play() { return RTG.Play; }
  function T() { return RTG.Tuning && RTG.Tuning.qb; }
  function num(v, d) { return typeof v === 'number' && v === v ? v : d; }
  function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
  function nowMs() { return Date.now(); }
  function spotText(yl) { return Play() && Play().spotText ? Play().spotText(yl) : String(yl); }
  function downText(s) { return Play() && Play().downText ? Play().downText(s) : (s.down + ' & ' + s.toGo); }
  function fmtClock(sec) { return RTG.Util && RTG.Util.fmtClock ? RTG.Util.fmtClock(sec) : String(sec); }

  // ─────────────────────────── settings ───────────────────────────

  function defaultSettings() {
    return {
      audio: true,
      colorblind: false,
      highContrast: false,
      reducedMotion: false,
      fontScale: 1,
      leftHanded: false,
      greenAssist: true,             // a release inside the green band claims input.green (the engine re-checks it)
      haptics: true,
      tooltips: true,
      keys: { confirm: ' ', confirmAlt: 'Enter', left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', throwAway: 'x', scramble: 'z' }
    };
  }
  var ALLOWED = { fontScale: [1, 1.25, 1.5] };

  function sanitizeSettings(raw) {
    var d = defaultSettings();
    if (!raw || typeof raw !== 'object') return d;
    for (var k in d) {
      if (!Object.prototype.hasOwnProperty.call(d, k) || raw[k] === undefined) continue;
      if (k === 'keys') {
        if (raw.keys && typeof raw.keys === 'object') {
          for (var kk in d.keys) if (typeof raw.keys[kk] === 'string' && raw.keys[kk]) d.keys[kk] = raw.keys[kk];
        }
      } else if (typeof d[k] === 'boolean') d[k] = !!raw[k];
      else if (ALLOWED[k]) { if (ALLOWED[k].indexOf(raw[k]) >= 0) d[k] = raw[k]; }
      else d[k] = raw[k];
    }
    return d;
  }

  // ─────────────────────────── the store ───────────────────────────

  function Store() {
    this.settings = sanitizeSettings(Storage() ? Storage().getJSON(KEYS.settings) : null);
    this.uiRng = RTG.RNG.create((nowMs() ^ 0x9e3779b9) >>> 0);   // cosmetics only (title stars, a random seed)
    this.drive = null;
    this.rng = null;
    this._subs = [];
  }
  Store.KEYS = KEYS;
  Store.KINDS = KINDS;
  Store.TINTS = TINTS;
  Store.defaultSettings = defaultSettings;
  Store.sanitizeSettings = sanitizeSettings;

  Store.prototype.subscribe = function (fn) {
    if (typeof fn !== 'function') throw new Error('Store.subscribe: a function is required');
    var subs = this._subs;
    subs.push(fn);
    var done = false;
    return function () { if (done) return; done = true; var i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); };
  };
  Store.prototype._notify = function (info) {
    var list = this._subs.slice();
    info.store = this;
    for (var i = 0; i < list.length; i++) {
      try { list[i](info); } catch (e) { if (root.console) root.console.error('Store subscriber failed after ' + info.fnName, e); }
    }
  };

  Store.prototype.saveSettings = function () {
    this.settings = sanitizeSettings(this.settings);
    if (Storage()) Storage().setJSON(KEYS.settings, this.settings);
    this._notify({ fnName: 'settings', result: this.settings });
    return this.settings;
  };
  Store.prototype.setSetting = function (key, value) {
    if (key === 'keys' && value && typeof value === 'object') {
      for (var k in value) if (Object.prototype.hasOwnProperty.call(value, k)) this.settings.keys[k] = value[k];
    } else this.settings[key] = value;
    return this.saveSettings();
  };
  Store.prototype.resetSettings = function () { this.settings = defaultSettings(); return this.saveSettings(); };
  Store.prototype.isDebug = function () {
    var q = root.location && typeof root.location.search === 'string' ? root.location.search : '';
    return /[?&]debug=1\b/.test(q) || !!(RTG.debug && RTG.debug.strict);
  };

  // ─────────────────────────── the drive ───────────────────────────

  /** A fresh box-score line. */
  function emptyLine() {
    return { att: 0, cmp: 0, yds: 0, td: 0, int: 0, sacks: 0, sackYds: 0, rushes: 0, rushYds: 0, rushTd: 0, fumbles: 0, firstDowns: 0, long: 0, turnovers: 0 };
  }

  /** The demo's roster / opponent numbers for a team preset (Tuning.qb.demo.teams). */
  function presetFor(name) {
    var D = T().demo, p = D.teams[name] || D.teams[D.defaultTeam];
    return { name: D.teams[name] ? name : D.defaultTeam, ol: p.ol, dl: p.dl, db: p.db, wr: p.wr.map(function (r) { return { slot: r.slot, name: r.name, skill: r.skill, speed: r.speed }; }) };
  }

  /** The QB block for a situation: the archetype's starting attributes. */
  function qbFor(archetype) {
    var A = T().archetypes, id = A[archetype] ? archetype : T().demo.defaultArchetype, a = A[id];
    return { archetype: id, foot: 'R', attrs: { ARM: a.ARM, ACC: a.ACC, IQ: a.IQ, MOB: a.MOB, POI: a.POI } };
  }

  /**
   * Start a drive: {seed (number or string; '' → a random one), archetype, team ('BAD'|'AVERAGE'|'GREAT'), venue}.
   * Draws: driveScript fork 1 · weather fork 1.
   */
  Store.prototype.newDrive = function (opts) {
    opts = opts || {};
    var P = Play(), W = RTG.Weather;
    var seedText = opts.seed === undefined || opts.seed === null || String(opts.seed).trim() === '' ? String(this.uiRng.int(1, 999999999)) : String(opts.seed).trim();
    var seedNum = RTG.RNG.toSeed(/^\d+$/.test(seedText) ? Number(seedText) : seedText);
    var venue = opts.venue === 'HS' || opts.venue === 'NFL' ? opts.venue : 'COLLEGE';
    var rng = RTG.RNG.create(seedNum);
    var script = P.driveScript({ venue: venue }, rng);                                   // 1 parent draw
    var wr = rng.fork('drive:weather');                                                  // 1 parent draw
    var climate = wr.pick(venue === 'NFL' ? ['warm', 'temperate', 'cold', 'dome'] : ['warm', 'temperate', 'cold']);
    var week = wr.int(1, venue === 'HS' ? 8 : 12);
    var weather = W && W.forGame ? W.forGame(wr, { climate: climate, dome: climate === 'dome' }, week, venue === 'NFL' ? 'NFL' : 'COLLEGE') : null;
    this.rng = rng;
    this.drive = {
      seed: seedText, seedNum: seedNum, archetype: qbFor(opts.archetype).archetype, team: presetFor(opts.team).name, venue: venue,
      startedAt: nowMs(), script: script, weather: weather, climate: climate, week: week,
      idx: 0, pending: 'PLAY', advance: 0, ctx: null, sim: null, situation: null,
      results: [], line: emptyLine(), story: null, lastResult: null
    };
    this._notify({ fnName: 'newDrive', result: this.drive });
    return this.drive;
  };

  Store.prototype.hasDrive = function () { return !!this.drive; };
  Store.prototype.pending = function () { return this.drive ? this.drive.pending : null; };
  Store.prototype.isDone = function () { return !!this.drive && this.drive.pending === 'DONE'; };
  Store.prototype.line = function () { return this.drive ? this.drive.line : emptyLine(); };
  Store.prototype.results = function () { return this.drive ? this.drive.results : []; };
  Store.prototype.tints = function () { return this.drive ? TINTS[this.drive.venue] || TINTS.COLLEGE : TINTS.COLLEGE; };

  /** Re-word a script entry's stakes after its yard line moved (mirrors Play.driveScript's copy). */
  function restake(s) {
    var d = downText(s);
    switch (s.kind) {
      case 'RED_ZONE': return d + ' at the ' + (FIELD - s.yl) + ' — points here';
      case 'THIRD_LONG': return d + ' — a long way to the sticks';
      case 'SHORT_YARDAGE': return s.down === 4 ? d + ' — go or go home' : d + ' — a yard is a yard';
      case 'TWO_MINUTE': return fmtClock(s.clock) + ' left, down ' + (s.score.them - s.score.us) + ' — the drill';
      case 'LAST_PLAY': return fmtClock(s.clock) + ' left at the ' + (FIELD - s.yl) + ' — one shot at the end zone';
      default: return s.stakes || d;
    }
  }

  /** Did the two-minute drill end in a touchdown (the last play's scoreboard moves with it)? */
  function drillTd(d) {
    for (var i = 0; i < d.results.length; i++) if (d.results[i].kind === 'TWO_MINUTE' && d.results[i].td) return true;
    return false;
  }
  /** A script entry's score as the drive has it (the last play after a drill touchdown: both sides + 7). */
  function scoreFor(d, src) {
    var shift = src && src.kind === 'LAST_PLAY' && drillTd(d) ? DRILL_TD_SHIFT : 0;
    return { us: src.score.us + shift, them: src.score.them + shift };
  }

  /** The armed situation: the script entry + the drive's story advance + qb / team / opp / weather. Built once per moment. */
  Store.prototype.situation = function () {
    var d = this.drive;
    if (!d) throw new Error('Store.situation: no drive');
    if (d.situation && d.situation.idx === d.idx) return d.situation;
    var src = d.script[d.idx];
    if (!src) return null;
    var s = {};
    for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) s[k] = src[k];
    s.score = scoreFor(d, src);
    var cap = ADVANCE_CAP[s.kind];
    if (d.advance && cap !== undefined) {
      var yl = clamp(src.yl + d.advance, 5, cap);
      if (yl !== src.yl) { s.yl = yl; s.toGo = Math.min(src.toGo, FIELD - yl); s.stakes = restake(s); s.advanced = yl - src.yl; }
    }
    s.pressure = PRESSURE[s.kind] !== undefined ? PRESSURE[s.kind] : 0.35;
    s.weather = d.weather;
    s.venue = d.venue;
    s.qb = qbFor(d.archetype);
    var team = presetFor(d.team);
    s.team = { ol: team.ol, wr: team.wr };
    s.opp = { dl: team.dl, db: team.db };
    d.situation = s;
    d.ctx = null;
    d.sim = null;
    return s;
  };

  /** The PlayContext of the armed moment (Play.buildContext, 1 parent draw; memoised). */
  Store.prototype.context = function () {
    var d = this.drive;
    if (!d) throw new Error('Store.context: no drive');
    if (d.ctx && d.ctx.idx === d.idx) return d.ctx;
    var sit = this.situation();
    if (!sit) return null;
    var ctx = Play().buildContext(sit, this.rng);                                        // 1 parent draw
    ctx.idx = d.idx;
    ctx.kind = sit.kind;
    ctx.pressureLevel = sit.pressure;                    // the scene's crowd / vignette level
    if (ctx.clutch && ctx.situation) ctx.situation.clutch = true;
    d.ctx = ctx;
    d.pending = 'PLAY';
    this._notify({ fnName: 'context', result: ctx });
    return ctx;
  };

  /** Play.snap on the armed context (1 parent draw). */
  Store.prototype.snap = function (playId) {
    var ctx = this.context();
    var sim = Play().snap(ctx, playId, this.rng);
    this.drive.sim = sim;
    return sim;
  };

  /** Play.throw on the live sim (1 parent draw). */
  Store.prototype.throwBall = function (input) {
    var d = this.drive;
    if (!d || !d.sim) throw new Error('Store.throwBall: no sim (snap first)');
    var res = Play().throw(d.sim, input, this.rng);
    d.lastResult = res;
    return res;
  };

  /** The first pass card of the armed context (the run card is skipped so a forced result has receivers). */
  Store.prototype.firstPassOption = function () {
    var ctx = this.context(), opts = ctx && ctx.options || [];
    for (var i = 0; i < opts.length; i++) if (!opts[i].run) return opts[i];
    return opts[0] || null;
  };

  /**
   * A sensible throw for the live sim: the most open receiver whose release window the pocket allows, released at
   * its peak with the route's ideal lead / loft and the on-time power (Play.need). 0 draws.
   */
  Store.prototype.autoInput = function (sim) {
    sim = sim || (this.drive && this.drive.sim);
    if (!sim || sim.run) return null;
    var P = Play(), routes = RTG.Data.plays.routes, limit = num(sim.sackAt, 3) - 0.15;
    var best = null, i;
    for (i = 0; i < sim.receivers.length; i++) {
      var r = sim.receivers[i];
      if (!r.release || r.release.peakAt > limit) continue;
      if (!best || r.peak > best.peak) best = r;
    }
    if (!best) {
      for (i = 0; i < sim.receivers.length; i++) if (sim.receivers[i].slot === sim.checkdown) best = sim.receivers[i];
      best = best || sim.receivers[0];
    }
    if (!best) return null;
    var t = clamp(num(best.release && best.release.peakAt, 1), 0.3, Math.max(0.3, limit));
    var route = routes[best.route] || { ideal: { lead: 0, loft: 0.5 } };
    var need = P.need(sim, best.slot, t);
    var power = need ? clamp(need.need + need.band / 2, 0.1, 1.15) : 0.8;
    return { kind: 'THROW', target: best.slot, t: t, lead: route.ideal.lead, loft: route.ideal.loft, power: power, quality: 1, green: true };
  };

  // ─────────────────────────── the story ───────────────────────────

  /** The receiver a result went to (name / route) from the sim. */
  function targetInfo(res, sim) {
    if (!res || !res.target || !sim || !sim.receivers) return null;
    for (var i = 0; i < sim.receivers.length; i++) if (sim.receivers[i].slot === res.target) return { slot: res.target, name: sim.receivers[i].name, route: sim.receivers[i].route };
    return null;
  }

  /** Update the box-score line with a result. */
  function tally(line, res) {
    var o = res.outcome, y = num(res.yards, 0);
    if (o === 'CATCH') { line.att++; line.cmp++; line.yds += y; if (res.td) line.td++; if (y > line.long) line.long = y; }
    else if (o === 'INCOMPLETE' || o === 'DROP' || o === 'THROWAWAY') line.att++;
    else if (o === 'INT') { line.att++; line.int++; line.turnovers++; }
    else if (o === 'SACK') { line.sacks++; line.sackYds += y; }
    else if (o === 'SCRAMBLE' || o === 'RUN') {
      line.rushes++; line.rushYds += y;
      if (res.td) line.rushTd++;
      if (res.fumble || (res.turnover && o === 'SCRAMBLE')) { line.fumbles++; line.turnovers++; }
    }
    if (res.firstDown) line.firstDowns++;
    return line;
  }

  /** 'COVER 2' for a coverage id. */
  function coverageName(id) { var D = RTG.Data && RTG.Data.plays && RTG.Data.plays.coverages; var c = D && D[id]; return (c && c.name) || String(id); }

  /** The story line between moments, in the coach's voice. `disguised`: the look lied on that snap (sim.shown !== sim.real). */
  function storyFor(sit, res, next, disguised, sim) {
    var o = res.outcome, y = Math.round(num(res.yards, 0)), last = sit.kind === 'LAST_PLAY';
    var spot = spotText(clamp(sit.yl + y, 1, FIELD));
    var text, continues;
    if (res.td) {
      if (last) text = 'TOUCHDOWN. The clock says zero and the scoreboard says you. Game over.';
      else if (sit.kind === 'TWO_MINUTE') text = 'TOUCHDOWN. The building comes apart. It lasts a minute: they answer, and then some, and the clock hands you the ball back with seconds left and the lead gone.';
      else text = 'TOUCHDOWN. The building comes apart. Kickoff, and the next time you see the field it matters again.';
      continues = false;
    }
    else if (last) { text = 'No miracle. The clock hits zero and the other sideline is the one running onto the field.'; continues = false; }
    else if (o === 'INT') {
      text = disguised ? 'Picked off. They showed ' + coverageName(sim.shown) + ' and played ' + coverageName(sim.real) + ' — the look lied, and the defence holds. Their ball.' : 'Picked off. The defence holds — their ball, and a long walk to the bench.';
      continues = false;
    }
    else if (res.fumble || (res.turnover && o !== 'INT')) { text = 'The ball is on the ground and it is theirs. Two hands on it.'; continues = false; }
    else if (res.firstDown) { text = 'FIRST DOWN at the ' + spot + '. The drive rolls on.'; continues = true; }
    else if (sit.down >= 3) {
      text = o === 'SACK' ? 'Sacked. That is the drive — the punt team is jogging on.' : (o === 'THROWAWAY' ? 'Thrown away. Short of the sticks; the defence holds. Next possession.' : 'Short of the sticks. The defence holds — next possession.');
      continues = false;
    } else { text = (y > 0 ? 'Gain of ' + y + '. ' : (y < 0 ? 'A loss of ' + Math.abs(y) + '. ' : 'No gain. ')) + 'The chains stay put and the clock keeps running.'; continues = true; }
    var story = { text: text, continues: continues, td: !!res.td, won: last && !!res.td, lost: last && !res.td, spot: spot };
    if (next) story.nextText = 'Q' + next.quarter + ' · ' + downText(next) + ' · ' + spotText(next.yl) + ' · ' + next.score.us + '-' + next.score.them;
    return story;
  }

  /**
   * Record a moment's result: the line, the story, the next moment's advance. pending → 'STORY' (or 'DONE' after
   * the sixth moment). Returns the story {text, continues, nextText, …}.
   */
  Store.prototype.record = function (res, sim) {
    var d = this.drive;
    if (!d) throw new Error('Store.record: no drive');
    if (!res || typeof res.outcome !== 'string') throw new Error('Store.record: a PlayResult is required');
    sim = sim || d.sim;
    var sit = this.situation();
    var info = targetInfo(res, sim);
    var y = Math.round(num(res.yards, 0));
    tally(d.line, res);
    var nextSrc = d.script[d.idx + 1] || null;
    if (nextSrc && nextSrc.kind === 'LAST_PLAY' && res.td && sit.kind === 'TWO_MINUTE') {
      // the interstitial's NEXT UP line shows the scoreboard the last play will carry (situation() shifts it the same way)
      var shifted = {};
      for (var nk in nextSrc) if (Object.prototype.hasOwnProperty.call(nextSrc, nk)) shifted[nk] = nextSrc[nk];
      shifted.score = { us: nextSrc.score.us + DRILL_TD_SHIFT, them: nextSrc.score.them + DRILL_TD_SHIFT };
      nextSrc = shifted;
    }
    var disguised = !!(sim && typeof sim.shown === 'string' && typeof sim.real === 'string' && sim.shown !== sim.real);
    var story = storyFor(sit, res, nextSrc, disguised, sim);
    var entry = {
      idx: d.idx, kind: sit.kind, down: sit.down, toGo: sit.toGo, yl: sit.yl, quarter: sit.quarter, clock: sit.clock,
      stakes: sit.stakes, play: res.playId || (res.play && res.play.id) || res.play || (sim && sim.playId) || null,
      playName: (sim && sim.play && sim.play.name) || (res.play && res.play.name) || null,
      outcome: res.outcome, kind_: res.kind, yards: y, airYards: num(res.airYards, 0), yac: num(res.yac, 0),
      td: !!res.td, firstDown: !!res.firstDown, turnover: !!res.turnover, fumble: !!res.fumble,
      target: info ? info.slot : (res.target || null), targetName: info ? info.name : null, route: info ? info.route : null,
      text: res.text || '', banner: res.banner || '', feedback: res.feedback || null,
      accuracy: num(res.accuracy, null), window: num(res.window, null), quality: num(res.quality, null), green: !!res.green,
      t: num(res.t, null), story: story.text, forced: !!res.forced
    };
    d.results.push(entry);
    d.lastResult = res;
    d.story = story;
    d.advance = story.continues ? clamp(y, ADVANCE_MIN, ADVANCE_MAX) : 0;
    d.idx++;
    d.situation = null; d.ctx = null; d.sim = null;
    d.pending = d.idx >= d.script.length ? 'DONE' : 'STORY';
    this._notify({ fnName: 'record', result: entry });
    return story;
  };

  /** Arm the next moment after the interstitial. */
  Store.prototype.next = function () {
    var d = this.drive;
    if (!d || d.pending !== 'STORY') return false;
    d.pending = 'PLAY';
    this.situation();
    this._notify({ fnName: 'next', result: d.idx });
    return true;
  };

  /** Record a forced result (RTG.debug.forceResult). The throw fork is consumed so later moments replay the same. */
  Store.prototype.force = function (res, sim) {
    if (this.rng) this.rng.fork('play:throw');                                            // 1 parent draw, as Play.throw
    return this.record(res, sim);
  };

  /** Resolve the armed moment headlessly (skipTo): snap the first pass card, throw the auto input, record. */
  Store.prototype.autoResolve = function () {
    var d = this.drive;
    if (!d) throw new Error('Store.autoResolve: no drive');
    if (d.pending === 'STORY') this.next();
    if (d.pending === 'DONE') return null;
    var opt = this.firstPassOption();
    var sim = this.snap(opt.id);
    var res;
    if (sim.run) { res = sim; this.rng.fork('play:throw'); }
    else res = this.throwBall(this.autoInput(sim));
    this.record(res, sim);
    return res;
  };

  // ─────────────────────────── the summary ───────────────────────────

  function bestThrow(results) {
    var best = null;
    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      if (r.outcome !== 'CATCH') continue;
      if (!best || (r.td && !best.td) || (r.td === best.td && r.yards > best.yards)) best = r;
    }
    if (!best) return null;
    var route = best.route ? String(best.route).replace('_', ' ') : '';
    return {
      text: best.yards + ' YD ' + (best.td ? 'TD ' : '') + (best.targetName ? 'TO ' + best.targetName.toUpperCase() : '') + (route ? ' ON THE ' + route : ''),
      sub: (best.playName || '') + (best.kind ? ' · ' + best.kind.replace(/_/g, ' ') : ''),
      result: best
    };
  }

  function verdictFor(won, rating, line) {
    if (won && rating >= 100) return 'You won it with the last throw of the night. Coach is already on the phone about the papers.';
    if (won) return 'Ugly for three quarters, then the throw that mattered. They will remember the ending.';
    if (rating >= 100) return 'The numbers say you were the best player on the field. The scoreboard says the other thing.';
    if (line.int + line.fumbles >= 2) return 'Two turnovers is two too many. Coach saw every one of them.';
    if (rating >= 70) return 'Some good, some bad, no ending. Coach saw enough to run it back.';
    return 'That one goes in the tape and not the highlight reel. Take what they give you.';
  }

  Store.prototype.summary = function () {
    var d = this.drive;
    if (!d) return null;
    var P = Play(), line = d.line, rating = P.rating(line);
    var last = d.results[d.results.length - 1] || null;
    var won = !!(last && last.kind === 'LAST_PLAY' && last.td);
    var done = d.pending === 'DONE';
    return {
      seed: d.seed, seedNum: d.seedNum, archetype: d.archetype, team: d.team, venue: d.venue, weather: d.weather,
      done: done, played: d.results.length, total: d.script.length,
      line: line, rating: rating, best: bestThrow(d.results), won: won,
      verdict: done ? verdictFor(won, rating, line) : 'The drive is not over.',
      results: d.results.slice()
    };
  };

  RTG.UI.Store = Store;
})(typeof window !== 'undefined' ? window : globalThis);
