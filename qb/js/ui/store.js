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
 *   store.snap(playId) → PlaySim                      Play.snap on the armed context (1 parent draw)
 *   store.live(sim) → Live                            Play.live(sim, rng) (1 parent draw; the scene steps it)
 *   store.noteLive(live, rngState)                    a host made the moment's Live itself (Moment.mount): the fork is spent
 *   store.autoPlan(sim) → plan                        Play.autoPlan (a sensible pass for the headless paths; 0 draws)
 *   store.resolve(sim, plan) → PlayResult             Play.resolve (1 parent draw — the live fork)
 *   store.record(result, sim, {plan, liveRng, liveForked}) → story
 *                                         the box score, the story line, the next moment's yardage, the plan in the
 *                                         drive log (replayable: Play.resolve(sims[idx], results[idx].plan, rng at liveRng));
 *                                         pending → STORY | DONE
 *   store.replay(idx) → PlayResult | null             Play.resolve of a recorded moment (a scratch rng at its liveRng; 0 draws on the drive)
 *   store.next()                          arms the next moment (pending → PLAY)
 *   store.autoResolve() → result          ctx → snap the first pass card → resolve(autoPlan) → record (headless)
 *   store.force(result, sim) → story      record a forced result (RTG.debug.forceResult headless); spends the live fork
 *   store.summary() → {line, rating, best, verdict, results, won, seed, …}
 *   store.line() · store.results()
 *
 * RNG draw accounting on the drive's parent rng (deterministic per seed, independent of the player's inputs):
 *   driveScript fork 1 · weather fork 1 · then per moment: buildContext 1 · snap 1 · live 1 (a run card, a forced
 *   result and the headless paths spend the live fork too — record() spends it when nobody did — so every moment
 *   costs exactly 3 parent draws whatever was drawn on the field).
 *
 * The box score: a PASS / THROWAWAY is an attempt (a catch a completion); a SACK is a sack; a SCRAMBLE (the QB
 * crossed the line with the ball, or ran it out of bounds) and a run card (SNEAK / DRAW) are rushes — scramble
 * yards count as rushing, never as passing.
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
      aimAssist: true,               // a drawn pass line ending near the spot its receiver can reach snaps onto it
      haptics: true,
      tooltips: true,
      // the draw hand's keys (RTG.UI.PlayInput.DEFAULT_KEYS): confirm = throw / commit the draft; the arrows nudge
      // the line's end 1 yd; bend = a control point in the middle; loft cycles BULLET / TOUCH / LOB; run starts a
      // RUN draft (scramble is its old alias); cancel drops the draft
      keys: {
        confirm: ' ', confirmAlt: 'Enter', left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown',
        throwAway: 'x', scramble: 'z', run: 'r', bendLeft: 'q', bendRight: 'e', loft: 'l', cancel: 'Backspace'
      }
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
      live: null, liveIdx: -1, liveRng: null,                // the armed moment's Live, the moment whose live fork is spent, the parent state before it
      results: [], sims: [], line: emptyLine(), story: null, lastResult: null
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
    d.live = null;
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
    this.drive.live = null;
    return sim;
  };

  /** The live fork of the armed moment is spent (by Play.live, a host's own Play.live, or a plain fork). */
  function spendLive(d, rngState, live) {
    d.liveIdx = d.idx;
    d.liveRng = typeof rngState === 'number' ? rngState : null;
    d.live = live || null;
  }

  /** Play.live on a sim of the armed moment (1 parent draw — the moment's live fork). The scene steps it. */
  Store.prototype.live = function (sim) {
    var d = this.drive;
    if (!d) throw new Error('Store.live: no drive');
    sim = sim || d.sim;
    if (!sim) throw new Error('Store.live: no sim (snap first)');
    var st = this.rng.state();
    var live = Play().live(sim, this.rng);                                               // 1 parent draw
    spendLive(d, st, live);
    return live;
  };

  /**
   * A host made the armed moment's Live itself (RTG.UI.Moment calls Play.live with the drive's rng, the career seam):
   * the live fork is spent. `rngState` is the parent state just before it (the replay key). 0 draws.
   */
  Store.prototype.noteLive = function (live, rngState) {
    if (!this.drive) return;
    spendLive(this.drive, rngState, live);
  };

  /** The first pass card of the armed context (the run card is skipped so a forced result has receivers). */
  Store.prototype.firstPassOption = function () {
    var ctx = this.context(), opts = ctx && ctx.options || [];
    for (var i = 0; i < opts.length; i++) if (!opts[i].run) return opts[i];
    return opts[0] || null;
  };

  /**
   * A sensible plan for a pass sim with no hand on the screen (skipTo, the headless paths): Play.autoPlan (a straight
   * touch pass to the receiver with the best race at the first of a few release times, else a throw-away before
   * the pocket folds). 0 draws. A missing engine helper falls back to the throw-away.
   */
  Store.prototype.autoPlan = function (sim) {
    sim = sim || (this.drive && this.drive.sim);
    if (!sim || sim.run) return { runs: [], pass: null, away: null };
    if (Play() && typeof Play().autoPlan === 'function') {
      try { var p = Play().autoPlan(sim); if (p && typeof p === 'object') return p; }
      catch (e) { if (root.console) root.console.error('Play.autoPlan failed', e); }
    }
    var dt = (T().field && T().field.dt) || (1 / 60);
    return { runs: [], pass: null, away: Math.round(Math.max(0, num(sim.sackAt, 2) - 0.4) / dt) * dt };
  };

  /** Play.resolve on a sim of the armed moment with a plan (1 parent draw — the moment's live fork). */
  Store.prototype.resolve = function (sim, plan) {
    var d = this.drive;
    if (!d) throw new Error('Store.resolve: no drive');
    sim = sim || d.sim;
    if (!sim) throw new Error('Store.resolve: no sim (snap first)');
    var st = this.rng.state();
    var res = Play().resolve(sim, plan || { runs: [], pass: null, away: null }, this.rng);   // 1 parent draw
    spendLive(d, st, null);
    d.lastResult = res;
    return res;
  };

  /**
   * Replay a recorded moment: Play.resolve(the sim, the recorded plan, a scratch rng at the recorded liveRng). The
   * drive's rng is untouched (0 draws). null for a run card, a forced result or a moment without a plan.
   */
  Store.prototype.replay = function (idx) {
    var d = this.drive;
    if (!d) return null;
    var e = d.results[idx], sim = d.sims[idx];
    if (!e || !sim || sim.run || e.forced || !e.plan || typeof e.liveRng !== 'number') return null;
    var r = RTG.RNG.create(0);
    r.setState(e.liveRng);
    return Play().resolve(sim, e.plan, r);
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
    else if (res.firstDown) { text = 'FIRST DOWN at the ' + spot + (o === 'SCRAMBLE' ? ' — on your own legs' : '') + '. The drive rolls on.'; continues = true; }
    else if (sit.down >= 3) {
      if (o === 'SACK') text = 'Sacked. That is the drive — the punt team is jogging on.';
      else if (o === 'THROWAWAY') text = 'Thrown away. Short of the sticks; the defence holds. Next possession.';
      else if (o === 'SCRAMBLE') text = 'You took off and came up short of the sticks. The defence holds — next possession.';
      else text = 'Short of the sticks. The defence holds — next possession.';
      continues = false;
    } else { text = (y > 0 ? 'Gain of ' + y + '. ' : (y < 0 ? 'A loss of ' + Math.abs(y) + '. ' : 'No gain. ')) + 'The chains stay put and the clock keeps running.'; continues = true; }
    var story = { text: text, continues: continues, td: !!res.td, won: last && !!res.td, lost: last && !res.td, spot: spot };
    if (next) story.nextText = 'Q' + next.quarter + ' · ' + downText(next) + ' · ' + spotText(next.yl) + ' · ' + next.score.us + '-' + next.score.them;
    return story;
  }

  /** A drawn line as a compact copy (points rounded to 0.01 yd) for the drive log. */
  function planCopy(plan) {
    if (!plan || typeof plan !== 'object') return null;
    function pts(a) {
      var out = [];
      if (!a || typeof a.length !== 'number') return out;
      for (var i = 0; i < a.length; i++) if (a[i] && typeof a[i].x === 'number' && typeof a[i].y === 'number') out.push({ x: a[i].x, y: a[i].y });
      return out;
    }
    var runs = [];
    if (Array.isArray(plan.runs)) for (var i = 0; i < plan.runs.length; i++) if (plan.runs[i]) runs.push({ t: num(plan.runs[i].t, 0), points: pts(plan.runs[i].points) });
    return {
      runs: runs,
      pass: plan.pass ? { t: num(plan.pass.t, 0), points: pts(plan.pass.points), loft: num(plan.pass.loft, 0.5) } : null,
      away: typeof plan.away === 'number' && plan.away === plan.away ? plan.away : null
    };
  }

  /**
   * Record a moment's result: the line, the story, the next moment's advance, the plan (live.plan()) in the drive log.
   * pending → 'STORY' (or 'DONE' after the sixth moment). Returns the story {text, continues, nextText, …}.
   * `how` = {plan?, liveRng? (the parent state before the live fork — the replay key), liveForked? (the host spent the
   * live fork itself)}. The moment's live fork is spent here when nobody spent it (a run card, a forced result from a
   * headless path): every moment costs exactly 3 parent draws.
   */
  Store.prototype.record = function (res, sim, how) {
    var d = this.drive;
    if (!d) throw new Error('Store.record: no drive');
    if (!res || typeof res.outcome !== 'string') throw new Error('Store.record: a PlayResult is required');
    how = how || {};
    sim = sim || d.sim;
    if (how.liveForked && d.liveIdx !== d.idx) spendLive(d, how.liveRng, null);
    if (d.liveIdx !== d.idx && this.rng) { this.rng.fork('play:live'); spendLive(d, null, null); }   // 1 parent draw (nobody made a Live)
    var liveRng = typeof how.liveRng === 'number' ? how.liveRng : d.liveRng;
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
    var fb = res.feedback || null;
    var entry = {
      idx: d.idx, kind: sit.kind, down: sit.down, toGo: sit.toGo, yl: sit.yl, quarter: sit.quarter, clock: sit.clock,
      stakes: sit.stakes, play: res.playId || (res.play && res.play.id) || res.play || (sim && sim.playId) || null,
      playName: (sim && sim.play && sim.play.name) || (res.play && res.play.name) || null,
      outcome: res.outcome, resultKind: res.kind || null, yards: y, airYards: num(res.airYards, 0), yac: num(res.yac, 0),
      td: !!res.td, firstDown: !!res.firstDown, turnover: !!res.turnover, fumble: !!res.fumble,
      rush: res.outcome === 'SCRAMBLE' || res.outcome === 'RUN',
      target: info ? info.slot : (res.target || null), targetName: info ? info.name : null, route: info ? info.route : null,
      text: res.text || '', banner: res.banner || '', feedback: fb,
      timing: fb && fb.timing || null, touch: fb && fb.touch || null, placement: fb && fb.placement || null,
      loft: num(res.loft, null), length: num(res.length, null), t: num(res.t, null),
      plan: res.forced || (sim && sim.run) ? null : planCopy(how.plan),
      liveRng: res.forced || (sim && sim.run) || typeof liveRng !== 'number' ? null : liveRng,
      story: story.text, forced: !!res.forced
    };
    d.results.push(entry);
    d.sims[d.idx] = sim || null;
    d.lastResult = res;
    d.story = story;
    d.advance = story.continues ? clamp(y, ADVANCE_MIN, ADVANCE_MAX) : 0;
    d.idx++;
    d.situation = null; d.ctx = null; d.sim = null; d.live = null;
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

  /** Record a forced result (a headless RTG.debug path): record() spends the live fork when nobody did. */
  Store.prototype.force = function (res, sim) {
    return this.record(res, sim, {});
  };

  /**
   * Resolve the armed moment headlessly (skipTo): snap the first pass card, resolve the auto plan (Play.resolve —
   * the live fork), record with the plan. A run card is its own result (record spends the live fork).
   */
  Store.prototype.autoResolve = function () {
    var d = this.drive;
    if (!d) throw new Error('Store.autoResolve: no drive');
    if (d.pending === 'STORY') this.next();
    if (d.pending === 'DONE') return null;
    var opt = this.firstPassOption();
    var sim = this.snap(opt.id);
    var res, plan = null, st = null;
    if (sim.run) res = sim;
    else {
      plan = this.autoPlan(sim);
      st = this.rng.state();
      res = this.resolve(sim, plan);
    }
    this.record(res, sim, { plan: plan, liveRng: st });
    return res;
  };

  // ─────────────────────────── the summary ───────────────────────────

  /** The best completion (a TD first, then the yards); with no completion, the best rush that gained (a scramble counts). */
  function bestThrow(results) {
    var best = null, rush = null, i, r;
    for (i = 0; i < results.length; i++) {
      r = results[i];
      if (r.outcome === 'CATCH') { if (!best || (r.td && !best.td) || (r.td === best.td && r.yards > best.yards)) best = r; }
      else if ((r.outcome === 'SCRAMBLE' || r.outcome === 'RUN') && r.yards > 0 && !r.turnover) { if (!rush || (r.td && !rush.td) || (r.td === rush.td && r.yards > rush.yards)) rush = r; }
    }
    var kindText = function (e) { return e.kind ? ' · ' + e.kind.replace(/_/g, ' ') : ''; };
    if (best) {
      var route = best.route ? String(best.route).replace(/_/g, ' ') : '';
      var touch = best.touch ? ' · ' + best.touch : '';
      return {
        text: best.yards + ' YD ' + (best.td ? 'TD ' : '') + (best.targetName ? 'TO ' + best.targetName.toUpperCase() : '') + (route ? ' ON THE ' + route : ''),
        sub: (best.playName || '') + kindText(best) + touch,
        result: best, rush: false
      };
    }
    if (!rush) return null;
    var what = rush.outcome === 'SCRAMBLE' ? 'SCRAMBLE' : (rush.play || 'RUN');
    return { text: rush.yards + ' YD ' + (rush.td ? 'TD ' : '') + what, sub: (rush.playName || '') + kindText(rush), result: rush, rush: true };
  }

  function verdictFor(won, rating, line, last) {
    if (won && last && last.rush) return 'You won it with your legs. Nobody drew that one up — you did.';
    if (won && rating >= 100) return 'You won it with the last throw of the night. Coach is already on the phone about the papers.';
    if (won) return 'Ugly for three quarters, then the throw that mattered. They will remember the ending.';
    if (rating >= 100) return 'The numbers say you were the best player on the field. The scoreboard says the other thing.';
    if (line.int + line.fumbles >= 2) return 'Two turnovers is two too many. Coach saw every one of them.';
    if (rating >= 70) return 'Some good, some bad, no ending. Coach saw enough to run it back.';
    return 'That one goes in the tape and not the highlight reel. Take what they give you.';
  }

  /**
   * The box score: {seed, seedNum, archetype, team, venue, weather, done, played, total, line, rating (Play.rating on
   * the PASSING line only), passing {cmp, att, yds, td, int}, rushing {att, yds, td} (scrambles and run cards), best,
   * won, verdict, results}.
   */
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
      line: line, rating: rating,
      passing: { cmp: line.cmp, att: line.att, yds: line.yds, td: line.td, int: line.int },
      rushing: { att: line.rushes, yds: line.rushYds, td: line.rushTd },
      best: bestThrow(d.results), won: won,
      verdict: done ? verdictFor(won, rating, line, last) : 'The drive is not over.',
      results: d.results.slice()
    };
  };

  RTG.UI.Store = Store;
})(typeof window !== 'undefined' ? window : globalThis);
