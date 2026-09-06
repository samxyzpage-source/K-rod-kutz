/**
 * RTG.Schema — factories, validate, reindex, fixtures (§3.4, §3.5.4, §5.1).
 *   node kicker/test/schema.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RTG = require('./load')();
/** deep-equal that ignores realm prototypes (engine objects live in a vm context). */
const deq = (a, b, msg) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg);
const fx = require('./fixtures/schema');
const Schema = RTG.Schema, Util = RTG.Util, Tuning = RTG.Tuning;

const hasData = !!(RTG.Data && Array.isArray(RTG.Data.colleges) && RTG.Data.colleges.length && Array.isArray(RTG.Data.nfl) && RTG.Data.nfl.length);
const dataNote = 'needs data/colleges.js + data/nfl.js (E2)';

function roundTrip(state) {
  const copy = JSON.parse(JSON.stringify(state));
  Schema.reindex(copy);
  return copy;
}

/** Collect every object reachable from v into a Set (enumerable own props). */
function collectObjects(v, set) {
  if (!v || typeof v !== 'object') return set;
  if (set.has(v)) return set;
  set.add(v);
  for (const k of Object.keys(v)) collectObjects(v[k], set);
  return set;
}

test('createCareer produces a state that validates and starts at HS.SHOWCASE', (t) => {
  if (!hasData) { t.skip(dataNote); return; }
  const rng = RTG.RNG.create(4242);
  const state = Schema.createCareer({ name: 'Ada Kickwell', archetype: 'ICEMAN', difficulty: 'allpro', seed: 4242, createdAt: 123 }, rng);
  const v = Schema.validate(state);
  deq(v.errors, []);
  assert.equal(v.ok, true);
  assert.equal(state.stage, 'HS');
  assert.equal(state.phase, 'SHOWCASE');
  assert.equal(state.seed, 4242);
  assert.equal(state.difficulty, 'allpro');
  assert.equal(state.v, RTG.SAVE_VERSION);
  assert.equal(state.rngState, rng.state());
  assert.equal(state.player.name.full, 'Ada Kickwell');
  assert.equal(state.player.archetype, 'ICEMAN');
  assert.equal(state.leagues.college.teams.length, 48);
  assert.equal(state.leagues.nfl.teams.length, 32);
  assert.equal(typeof state.leagues.nfl.cap, 'number');
  assert.equal(state.leagues.nfl.cap, Tuning.contracts.capStart);
  assert.ok(Object.keys(state.records.nfl).length >= 10);
  assert.ok(Object.keys(state.records.college).length >= 10);
  if (state.pending === null) {
    t.diagnostic('pending is null: neither Career.showcaseSession (E3) nor Kick.buildContext (E1 kick.js) is loaded yet');
  } else {
    assert.equal(state.pending.kind, 'KICKS');
    assert.equal(state.pending.session.kind, 'SHOWCASE');
    assert.equal(state.pending.session.contexts.length, 6);
  }
});

test('createCareer is deterministic for a seed', (t) => {
  if (!hasData) { t.skip(dataNote); return; }
  const a = Schema.createCareer({ name: 'X Y', archetype: 'CANNON', seed: 9, createdAt: 5 }, RTG.RNG.create(9));
  const b = Schema.createCareer({ name: 'X Y', archetype: 'CANNON', seed: 9, createdAt: 5 }, RTG.RNG.create(9));
  assert.equal(Util.deepDiff(a, b), '');
  const c = Schema.createCareer({ name: 'X Y', archetype: 'CANNON', seed: 10, createdAt: 5 }, RTG.RNG.create(10));
  assert.notEqual(Util.deepDiff(a, c), '');
});

test('JSON round trip deep-equals the state after reindex; caches are non-enumerable / re-linked', (t) => {
  if (!hasData) { t.skip(dataNote); return; }
  const state = fx.nflRegWeek9InGame(RTG);
  const copy = roundTrip(state);
  assert.equal(Util.deepDiff(state, copy), '');
  assert.ok(Util.deepEqual(state, copy));
  // teamIndex is a non-enumerable cache and is rebuilt
  assert.equal(Object.prototype.propertyIsEnumerable.call(state.leagues.nfl, 'teamIndex'), false);
  assert.equal(JSON.stringify(state).indexOf('teamIndex'), -1);
  assert.equal(copy.leagues.nfl.teamIndex.BOS, 0);
  assert.equal(copy.leagues.college.teamIndex[copy.leagues.college.teams[5].id], 5);
  // kickers map points at the same objects as team.kicker after reindex
  for (const lg of ['college', 'nfl']) {
    for (const team of copy.leagues[lg].teams) {
      if (team.kicker) assert.equal(copy.leagues[lg].kickers[team.id], team.kicker);
      else assert.equal(copy.leagues[lg].kickers[team.id], undefined);
    }
  }
});

test('no object identity is shared between the two leagues; all 80 team ids unique', (t) => {
  if (!hasData) { t.skip(dataNote); return; }
  const state = fx.hsShowcase(RTG);
  const a = collectObjects(state.leagues.college, new Set());
  const b = collectObjects(state.leagues.nfl, new Set());
  for (const o of a) assert.ok(!b.has(o), 'shared object between leagues');
  const ids = state.leagues.college.teams.concat(state.leagues.nfl.teams).map((x) => x.id);
  assert.equal(new Set(ids).size, 80);
  // teams do not alias the data rows
  for (let i = 0; i < 48; i++) assert.notEqual(state.leagues.college.teams[i], RTG.Data.colleges[i]);
  assert.notEqual(state.leagues.college.teams[0].colors, RTG.Data.colleges[0].colors);
});

test('createTeam: NFL ratings generated within §2.12.2 bounds, AI kicker per §2.5.1, ST blend', (t) => {
  if (!hasData) { t.skip(dataNote); return; }
  const rng = RTG.RNG.create(3);
  const init = Tuning.league.nflInit;
  for (let i = 0; i < 200; i++) {
    const row = RTG.Data.nfl[i % 32];
    const team = Schema.createTeam(row, rng, 'NFL');
    assert.ok(team.OFF >= init.off.min && team.OFF <= init.off.max);
    assert.ok(team.DEF >= init.def.min && team.DEF <= init.def.max);
    assert.ok(team.coachAgg >= init.coachAgg[0] && team.coachAgg <= init.coachAgg[1]);
    assert.ok(team.surface === 'grass' || team.surface === 'turf');
    if (team.dome) assert.equal(team.surface, 'turf');
    const k = team.kicker;
    assert.ok(k.age >= 22 && k.age <= 36);
    for (const a of ['POW', 'ACC', 'CON', 'CLU', 'KO']) assert.ok(k.attrs[a] >= 30 && k.attrs[a] <= 99);
    assert.ok(k.contractYears >= 1 && k.contractYears <= 4);
    assert.equal(typeof k.name, 'string');
    assert.ok(team.coach.indexOf('Coach ') === 0);
  }
  const college = Schema.createTeam(RTG.Data.colleges[0], rng, 'COLLEGE');
  assert.equal(college.OFF, RTG.Data.colleges[0].OFF);
  assert.equal(college.prestige, RTG.Data.colleges[0].prestige);
  assert.equal(college.ST, Math.round(Tuning.league.stBlend * RTG.Data.colleges[0].ST + (1 - Tuning.league.stBlend) * college.kicker.ovr));
  // big markets get the fame flag
  const ny = Schema.createTeam(RTG.Data.nfl.filter((r) => r.abbr === 'NYE')[0], rng, 'NFL');
  assert.equal(ny.bigMarket, true);
});

test('AI kicker ovr distribution follows the anchors (college 52 + 4·prestige, NFL 74)', () => {
  const rng = RTG.RNG.create(5);
  let s = 0;
  for (let i = 0; i < 2000; i++) s += Schema.createAiKicker(rng, 74).ovr;
  assert.ok(Math.abs(s / 2000 - 74) < 1);
  s = 0;
  for (let i = 0; i < 2000; i++) s += Schema.createAiKicker(rng, 52 + 4 * 5).ovr;
  assert.ok(Math.abs(s / 2000 - 72) < 1);
});

test('fixtures for every stage/phase validate and survive a JSON round trip', (t) => {
  if (!hasData) { t.skip(dataNote); return; }
  const all = fx.all(RTG);
  const expected = {
    hsShowcase: ['HS', 'SHOWCASE'], collegeRegWeek5: ['COLLEGE', 'REG'], nflRegWeek9InGame: ['NFL', 'REG'],
    nflOff: ['NFL', 'OFF'], retiredLegacy: ['RETIRED', 'LEGACY']
  };
  for (const name of Object.keys(expected)) {
    const state = all[name];
    const v = Schema.validate(state);
    deq(v.errors, [], name);
    assert.equal(state.stage, expected[name][0], name);
    assert.equal(state.phase, expected[name][1], name);
    assert.equal(Util.deepDiff(state, roundTrip(state)), '', name + ' round trip');
  }
  assert.equal(all.collegeRegWeek5.week, 5);
  assert.equal(all.nflRegWeek9InGame.week, 9);
  assert.ok(all.nflRegWeek9InGame.game && all.nflRegWeek9InGame.game.pending.type === 'USER_KICK');
  assert.equal(all.nflRegWeek9InGame.game.pending.ctx.distance, 44);
  assert.equal(all.nflOff.pending.kind, 'DECISION');
  assert.equal(all.retiredLegacy.pending.decision.kind, 'HOF');
  assert.equal(all.hsShowcase.pending.kind, 'KICKS');
  // fixtures are fresh objects each call
  assert.notEqual(fx.collegeRegWeek5(RTG), fx.collegeRegWeek5(RTG));
  const big = fx.twentySeasons(RTG);
  deq(Schema.validate(big).errors, []);
  assert.equal(big.stats.kicks.length, Tuning.save.kickLogCap);
});

test('validate reports type / range / enum / referential / cap / JSON-safety errors', (t) => {
  if (!hasData) { t.skip(dataNote); return; }
  const state = fx.collegeRegWeek5(RTG);
  assert.equal(Schema.validate(state).ok, true);
  const check = (mutate, re) => {
    const s = roundTrip(state);
    mutate(s);
    const v = Schema.validate(s);
    assert.equal(v.ok, false, 'expected failure for ' + re);
    assert.ok(v.errors.some((e) => re.test(e)), 'expected /' + re.source + '/ in ' + JSON.stringify(v.errors.slice(0, 5)));
  };
  check((s) => { s.player.attrs.POW = 120; }, /player\.attrs\.POW/);
  check((s) => { s.player.attrs.ACC = 60.5; }, /player\.attrs\.ACC.*integer/);
  check((s) => { s.player.morale = -1; }, /player\.morale/);
  check((s) => { s.player.fame = 1001; }, /player\.fame/);
  check((s) => { s.player.teamId = 'NOPE'; }, /player\.teamId/);
  check((s) => { s.player.league = 'NFL'; }, /player\.teamId/);          // team id not in that league
  check((s) => { s.player.role = 'K3'; }, /player\.role/);
  check((s) => { s.stage = 'NFL'; s.phase = 'SHOWCASE'; }, /phase/);
  check((s) => { s.difficulty = 'insane'; }, /difficulty/);
  check((s) => { s.leagues.nfl.teams[1].id = s.leagues.nfl.teams[0].id; }, /duplicate id/);
  check((s) => { s.season.schedule[0].homeId = 'GHOST'; }, /schedule\[0\].*homeId/);
  check((s) => { s.season.schedule[0].kind = 'FRIENDLY'; }, /schedule\[0\].*kind/);
  check((s) => { s.stats.kicks[0].outcome = 'MEH'; }, /stats\.kicks\[0\]\.outcome/);
  check((s) => { s.stats.kicks[0].teamId = 'GHOST'; }, /stats\.kicks\[0\]\.teamId/);
  check((s) => { for (let i = 0; i < Tuning.save.inboxCap + 1; i++) s.inbox.push({ id: 'x' + i, week: 1, year: 1, from: 'a', avatar: 'a', text: 't', kind: 'note', read: false }); }, /inbox.*cap/);
  check((s) => { s.recentEventIds = new Array(Tuning.save.recentEventIds + 1).fill('E'); }, /recentEventIds.*cap/);
  check((s) => { s.player.mods.push({ id: 'm', key: 'sigma', op: 'mul', value: 1.1, expires: { type: 'decade', at: 1 }, label: '', source: '' }); }, /mods\[0\]\.expires\.type/);
  check((s) => { s.flags.fn = function () {}; }, /function in state/);
  check((s) => { s.flags.self = s.flags; }, /cycle/);
  check((s) => { s.flags.bad = NaN; }, /non-finite/);
  check((s) => { s.flags.u = undefined; }, /undefined in state/);
  check((s) => { s.game = { id: 'g' }; }, /game\./);
  check((s) => { s.pending = { kind: 'NOPE' }; }, /pending\.kind/);
  check((s) => { s.records.nfl.longFG.holderTeam = 'GHOST'; }, /records\.nfl\.longFG/);
  // never throws on garbage
  assert.equal(Schema.validate(null).ok, false);
  assert.equal(Schema.validate('x').ok, false);
  assert.equal(Schema.validate({}).ok, false);
  assert.throws(() => Schema.assertValid({}), /Schema\.validate/);
});

test('validate runs in < 5 ms on a 20-season state (median of 15 runs)', (t) => {
  if (!hasData) { t.skip(dataNote); return; }
  const big = fx.twentySeasons(RTG);
  for (let i = 0; i < 5; i++) Schema.validate(big);        // warm-up
  const times = [];
  for (let i = 0; i < 15; i++) {
    const t0 = process.hrtime.bigint();
    const v = Schema.validate(big);
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    assert.equal(v.ok, true);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  t.diagnostic('validate median ' + median.toFixed(2) + ' ms on ' + Math.round(JSON.stringify(big).length / 1024) + ' KB');
  assert.ok(median < 5, 'median ' + median + ' ms');
});

test('emptyKickerStats / emptySeason / emptyHistory shapes', () => {
  const s = Schema.emptyKickerStats();
  for (const k of Schema.STAT_KEYS) assert.equal(s[k], 0, k);
  deq(Object.keys(s.buckets), ['0-29', '30-39', '40-49', '50-59', '60+']);
  deq(s.buckets['50-59'], { a: 0, m: 0 });
  assert.notEqual(Schema.emptyKickerStats().buckets, s.buckets);
  const season = Schema.emptySeason('NFL', 3);
  assert.equal(season.league, 'NFL');
  assert.equal(season.year, 3);
  assert.equal(season.trainingDone, false);
  assert.equal(season.focus, null);
  deq(season.kickerStats, {});
  assert.equal(Schema.emptySeason('bogus', 1).league, 'COLLEGE');
  const h = Schema.emptyHistory();
  deq(h, { seasons: [], awards: [], contracts: [], teams: [], timeline: [], earnings: 0, moments: [] });
  deq(Schema.defaultSettings(), { autoPat: 'off', playKickoffs: false, simSpeed: 1 });
  deq(Schema.mirrorSettings({ autoPat: 'safe', playKickoffs: true, simSpeed: 4, audio: true }), { autoPat: 'safe', playKickoffs: true, simSpeed: 4 });
  deq(Schema.mirrorSettings({ autoPat: 'nope', simSpeed: 3 }), Schema.defaultSettings());
});

test('createGameState defaults and createKickLogRow shape', () => {
  const gs = Schema.createGameState({ id: 'g1', league: 'NFL', week: 3, kind: 'REG', homeId: 'BOS', awayId: 'PIT', userSide: 'home' });
  assert.equal(gs.q, 1);
  assert.equal(gs.clock, Tuning.sim.clock.quarterSec);
  assert.equal(gs.half, 1);
  deq(gs.score, { home: 0, away: 0 });
  deq(gs.timeouts, { home: 3, away: 3 });
  assert.equal(gs.pending, null);
  assert.equal(gs.done, false);
  assert.equal(gs.pendingKickoff.side, 'away');       // home receives by default → away kicks
  assert.equal(gs.driveLog.length, 0);
  assert.equal(Schema.createGameState({ league: 'NFL', homeId: 'A', awayId: 'B', receivedFirst: 'away' }).possession, 'away');
  assert.equal(Schema.createGameState({ league: 'x', homeId: 'A', awayId: 'B', kind: 'nope' }).kind, 'REG');

  const ctx = fx.kickContext(RTG, { league: 'NFL', distance: 47, hash: -1, pressure: 0.4321, wind: { speed: 12, dir: 45 }, weather: 'rain', game: { q: 4, clock: 90, scoreFor: 17, scoreAgainst: 19, week: 3, oppId: 'PIT', teamId: 'BOS' } });
  const res = fx.kickResult({ outcome: 'DOINK_IN', distance: 47, tags: ['decisive', 'gameWinner'], power: 1.0123456, aim: -0.456, quality: 0.87654 });
  const row = Schema.createKickLogRow(ctx, res, { year: 5, gameId: 'g1', auto: false, rngState: 99, input: { power: 1.0123456, aim: -0.456, quality: 0.87654 } });
  assert.equal(row.year, 5);
  assert.equal(row.week, 3);
  assert.equal(row.league, 'NFL');
  assert.equal(row.gameId, 'g1');
  assert.equal(row.teamId, 'BOS');
  assert.equal(row.oppId, 'PIT');
  assert.equal(row.type, 'FG');
  assert.equal(row.distance, 47);
  assert.equal(row.hash, -1);
  deq(row.wind, { speed: 12, dir: 45 });
  assert.equal(row.weather, 'rain');
  assert.equal(row.pressure, 0.432);
  assert.equal(row.outcome, 'DOINK_IN');
  assert.equal(row.made, true);
  deq(row.tags, ['decisive', 'gameWinner']);
  assert.notEqual(row.tags, res.tags);
  deq(row.input, { power: 1.012, aim: -0.46, quality: 0.877 });
  assert.equal(row.auto, false);
  assert.equal(row.rngState, 99);
  assert.equal(row.q, 4);
  assert.equal(row.clock, 90);
  assert.equal(row.scoreFor, 17);
  assert.equal(row.scoreAgainst, 19);
  assert.equal(typeof row.id, 'string');
  assert.ok(row.id.length > 1);
  // JSON-safe and stable ids
  assert.equal(Util.deepDiff(row, JSON.parse(JSON.stringify(row))), '');
  assert.equal(Schema.createKickLogRow(ctx, res, { year: 5, gameId: 'g1', rngState: 99 }).id, row.id);
  assert.notEqual(Schema.createKickLogRow(ctx, res, { year: 5, gameId: 'g1', rngState: 100 }).id, row.id);
  // meta falls back to ctx.game
  const bare = Schema.createKickLogRow(ctx, res);
  assert.equal(bare.teamId, 'BOS');
  assert.equal(bare.week, 3);
  assert.equal(bare.gameId, null);
  assert.equal(bare.auto, false);
});

test('createRecords uses data base values and legend holders; records are per league', (t) => {
  if (!hasData) { t.skip(dataNote); return; }
  const state = fx.hsShowcase(RTG);
  const base = RTG.Data.records.base;
  for (const lg of ['college', 'nfl']) {
    for (const key of Object.keys(base[lg])) {
      const e = state.records[lg][key];
      assert.equal(e.value, base[lg][key], lg + '.' + key);
      assert.equal(typeof e.holder, 'string');
      assert.equal(e.isUser, false);
      assert.ok(e.year >= Tuning.names.legendYears[lg][0] && e.year <= Tuning.names.legendYears[lg][1]);
      assert.ok(Schema.teamById(state, e.holderTeam));
    }
  }
  assert.equal(state.records.college.careerSeasons, undefined);
  assert.equal(state.records.nfl.careerSeasons.value, base.nfl.careerSeasons);
});

test('lookup helpers: teamIn / teamById / leagueOf / userTeam / activeLeague / calendarYear / phasesFor', (t) => {
  if (!hasData) { t.skip(dataNote); return; }
  const state = fx.collegeRegWeek5(RTG);
  assert.equal(Schema.teamById(state, 'BOS').abbr, 'BOS');
  assert.equal(Schema.teamById(state, 'COA0').conf, 'COA');
  assert.equal(Schema.teamById(state, 'nope'), null);
  assert.equal(Schema.teamIn(state.leagues.nfl, 'COA0'), null);
  assert.equal(Schema.leagueOf(state, 'NFL'), state.leagues.nfl);
  assert.equal(Schema.userTeam(state).id, state.player.teamId);
  assert.equal(Schema.activeLeague(state).kind, 'COLLEGE');
  assert.equal(Schema.calendarYear(1), 2026);
  assert.equal(Schema.calendarYear(10), 2035);
  deq(Schema.phasesFor('DRAFT'), ['DECLARE', 'COMBINE', 'DRAFT', 'UDFA']);
  deq(Schema.phasesFor('nope'), []);
  // setKicker keeps the cache in sync and re-blends ST
  const league = state.leagues.nfl;
  const before = league.teams[3].ST;
  const rookie = Schema.createAiKicker(RTG.RNG.create(1), 60);
  Schema.setKicker(league, league.teams[3].id, rookie);
  assert.equal(league.teams[3].kicker, rookie);
  assert.equal(league.kickers[league.teams[3].id], rookie);
  assert.equal(league.teams[3].ST, Math.round(Tuning.league.stBlend * before + (1 - Tuning.league.stBlend) * rookie.ovr));
  assert.equal(Schema.validate(state).ok, true);
});
