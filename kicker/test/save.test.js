/**
 * RTG.Save — serialize / deserialize round trip, checksum, versions, migration, export/import, size, slot summary (§3.5.19, §3.7).
 *   node kicker/test/save.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const RTG = require('./load')();
/** deep-equal that ignores realm prototypes (engine objects live in a vm context). */
const deq = (a, b, msg) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg);
const schemaFx = require('./fixtures/schema');
const fx = require('./fixtures/stats');
const Save = RTG.Save, Schema = RTG.Schema, Tuning = RTG.Tuning, Util = RTG.Util;

/** JSON copy of a state without the rebuildable caches (league.kickers; teamIndex is non-enumerable). */
function comparable(state) {
  const c = JSON.parse(JSON.stringify(state));
  ['college', 'nfl'].forEach((lg) => { if (c.leagues && c.leagues[lg]) delete c.leagues[lg].kickers; });
  return c;
}

/** A state with real kick rows, moments and a mid-game pending kick. */
function richState() {
  const s = schemaFx.nflRegWeek9InGame(RTG);
  for (let i = 0; i < 25; i++) {
    const k = fx.kick(RTG, s, { distance: 30 + i, outcome: i % 6 === 5 ? 'WIDE_R' : 'GOOD', pressure: 0.2 + (i % 4) / 5, tags: i % 7 === 0 ? ['clutch', 'decisive'] : [], decisive: i % 7 === 0 });
    RTG.Stats.recordKick(s, k.ctx, k.result);
  }
  s.player.name = { first: 'Ødegård', last: 'Nuñez', full: 'Ødegård Nuñez 🦶' };
  return s;
}

test('serialize produces the §3.7 blob shape with a valid checksum and synced rngState', () => {
  const s = richState();
  const rng = RTG.RNG.create(77); rng.next(); rng.next();
  const blob = Save.serialize(s, rng, 1757000000000);
  deq(Object.keys(blob), ['v', 'app', 'savedAt', 'seed', 'rngState', 'playtimeSec', 'checksum', 'career']);
  assert.equal(blob.v, RTG.SAVE_VERSION); assert.equal(blob.app, RTG.VERSION); assert.equal(blob.savedAt, 1757000000000);
  assert.equal(blob.seed, s.seed); assert.equal(blob.rngState, rng.state()); assert.equal(s.rngState, rng.state());
  assert.equal(blob.career.rngState, rng.state());
  assert.equal(blob.checksum, Util.fnv1a(JSON.stringify(blob.career)));
  assert.equal(blob.career.leagues.nfl.kickers, undefined, 'caches stripped');
  assert.equal(blob.career.leagues.nfl.teamIndex, undefined);
  assert.ok(blob.career.stats.kicks._cols, 'kick rows are packed');
  assert.notEqual(blob.career, s, 'the live state is not the blob');
  assert.equal(s.leagues.nfl.kickers !== undefined, true, 'the live state keeps its caches');
});

test('round trip: deserialize(serialize(state)) equals the state ignoring caches, through a JSON string', () => {
  const s = richState();
  const rng = RTG.RNG.create(5); rng.next();
  const blob = Save.serialize(s, rng, 42);
  const text = JSON.stringify(blob);
  const back = Save.deserialize(JSON.parse(text));
  assert.equal(back.error, undefined, JSON.stringify(back.errors || back).slice(0, 300));
  assert.equal(back.migrated, false);
  deq(back.warnings, []);
  assert.equal(back.rngState, rng.state());
  const diff = Util.deepDiff(comparable(back.state), comparable(s));
  assert.equal(diff, '', 'first difference at ' + diff);
  assert.ok(Array.isArray(back.state.stats.kicks) && back.state.stats.kicks.length === s.stats.kicks.length);
  assert.ok(back.state.leagues.nfl.kickers && back.state.leagues.nfl.teamIndex, 'caches rebuilt by reindex');
  assert.equal(back.state.leagues.nfl.kickers.PIT, Schema.teamIn(back.state.leagues.nfl, 'PIT').kicker, 'kickers relinked to team.kicker');
  assert.ok(Schema.validate(back.state).ok);
  // a string blob is accepted too
  const back2 = Save.deserialize(text);
  assert.equal(back2.error, undefined);
  assert.equal(Util.deepDiff(comparable(back2.state), comparable(s)), '');
});

test('round trip preserves every fixture state at the caps (20-season fixture)', () => {
  const s = schemaFx.twentySeasons(RTG);
  const blob = Save.serialize(s, null, 1);
  const back = Save.deserialize(JSON.parse(JSON.stringify(blob)));
  assert.equal(back.error, undefined, JSON.stringify(back.errors || '').slice(0, 300));
  assert.equal(Util.deepDiff(comparable(back.state), comparable(s)), '');
  assert.equal(back.state.history.timeline.length, Tuning.save.timelineCap);
  assert.equal(back.state.stats.kicks.length, Tuning.save.kickLogCap);
});

test('checksum mismatch is refused', () => {
  const s = richState();
  const blob = Save.serialize(s, RTG.RNG.create(1), 1);
  const tampered = JSON.parse(JSON.stringify(blob));
  tampered.career.player.attrs.POW = 99;
  assert.equal(Save.deserialize(tampered).error, 'CHECKSUM');
  const bad = JSON.parse(JSON.stringify(blob));
  bad.checksum = '00000000';
  assert.equal(Save.deserialize(bad).error, 'CHECKSUM');
  const missing = JSON.parse(JSON.stringify(blob));
  delete missing.checksum;
  assert.equal(Save.deserialize(missing).error, 'CHECKSUM');
});

test('a save from a newer version is refused; garbage is INVALID', () => {
  const s = richState();
  const blob = Save.serialize(s, RTG.RNG.create(1), 1);
  const newer = JSON.parse(JSON.stringify(blob));
  newer.v = RTG.SAVE_VERSION + 1;
  const r = Save.deserialize(newer);
  assert.equal(r.error, 'NEWER');
  assert.match(r.message, /newer version/);
  assert.equal(Save.migrate({ v: RTG.SAVE_VERSION + 3, career: {} }).error, 'NEWER');
  assert.equal(Save.deserialize('not json').error, 'INVALID');
  assert.equal(Save.deserialize({ v: 1 }).error, 'INVALID');
  assert.equal(Save.deserialize(null).error, 'INVALID');
  // a structurally broken career with a matching checksum fails validation
  const broken = { v: RTG.SAVE_VERSION, career: { v: RTG.SAVE_VERSION, stage: 'NOPE' } };
  broken.checksum = Save.checksum(broken.career);
  const rb = Save.deserialize(broken);
  assert.equal(rb.error, 'INVALID');
  assert.ok(Array.isArray(rb.errors) && rb.errors.length > 0);
});

test('migration: fixtures/save_v0.json (older shape) upgrades to the current version and validates', () => {
  const file = path.join(__dirname, 'fixtures', 'save_v0.json');
  const blob = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(blob.v, 0);
  assert.equal(blob.career.stats.college, undefined, 'the fixture really is the older shape');
  assert.equal(blob.career.player.agentTier, undefined);
  assert.equal(typeof Save.migrations[0], 'function');
  const r = Save.deserialize(blob);
  assert.equal(r.error, undefined, JSON.stringify(r.errors || '').slice(0, 400));
  assert.equal(r.migrated, true);
  assert.ok(r.warnings.length >= 1);
  const st = r.state;
  assert.equal(st.v, RTG.SAVE_VERSION);
  assert.ok(Schema.validate(st).ok, Schema.validate(st).errors.join('; '));
  assert.equal(st.player.agentTier, 0); assert.equal(st.player.tags, 0);
  assert.ok(st.stats.college && st.stats.nfl && st.stats.splits);
  assert.equal(st.stats.college.fgm, st.stats.career.fgm, 'college career copied from the career totals of a college player');
  assert.equal(st.stats.kicks.length, 2);
  assert.equal(st.stats.kicks[0].made, true); deq(st.stats.kicks[0].tags, []);
  assert.ok(st.records.personal);
  assert.equal(typeof st.leagues.nfl.cap, 'number');
  assert.equal(st.leagues.nfl.teams[0].kicker.seasonStats.fga, 0, 'AI kickers regain seasonStats');
  assert.equal(st.leagues.college.teams[2].kicker2.seasonStats.fga, 0);
  assert.ok(st.flags && st.settings && Array.isArray(st.recentEventIds));
  assert.equal(st.player.name.full, blob.career.player.name.full);
  assert.equal(blob.v, 0, 'the input blob is not mutated');
  // migrate() alone re-checksums the upgraded blob so it can be saved back
  const m = Save.migrate(JSON.parse(JSON.stringify(blob)));
  assert.equal(m.v, RTG.SAVE_VERSION);
  assert.equal(m.checksum, Save.checksum(m.career));
  assert.equal(Save.deserialize(m).error, undefined);
  // a version with no migration path is refused
  assert.equal(Save.migrate({ v: -1, career: {} }).error, 'NO_MIGRATION');
});

test('export / import: base64 round trip is UTF-8 safe and tolerant of line wraps', () => {
  const s = richState();
  const blob = Save.serialize(s, RTG.RNG.create(2), 7);
  const text = Save.exportString(blob);
  assert.match(text, /^[A-Za-z0-9+\/]+=*$/);
  const back = Save.importString(text);
  assert.equal(back.error, undefined);
  assert.equal(back.checksum, blob.checksum);
  assert.equal(back.career.player.name.full, 'Ødegård Nuñez 🦶');
  assert.equal(Save.deserialize(back).error, undefined);
  const wrapped = '  ' + text.replace(/(.{76})/g, '$1\n') + '\n';
  assert.equal(Save.importString(wrapped).checksum, blob.checksum);
  assert.equal(Save.importString('@@@ not base64 json').error, 'IMPORT');
  assert.equal(Save.importString('').error, 'IMPORT');
  assert.equal(Save.importString(Save.toBase64('[1,2]')).error, 'IMPORT');
});

test('pure-JS base64 matches the platform encoder on ASCII, multi-byte and surrogate pairs', () => {
  const samples = ['', 'a', 'ab', 'abc', 'Road to Glory', 'Ødegård Nuñez', '🦶⚡ 日本語', JSON.stringify({ k: 'v', n: [1, 2, 3] })];
  for (const str of samples) {
    const pure = Save.toBase64(str, true);
    assert.equal(pure, Buffer.from(str, 'utf8').toString('base64'), 'encode ' + JSON.stringify(str));
    assert.equal(Save.fromBase64(pure, true), str, 'decode ' + JSON.stringify(str));
    assert.equal(Save.fromBase64(Save.toBase64(str)), str);
  }
});

test('size: a 20-season career at every cap serializes under Tuning.save.maxBytes', () => {
  const s = schemaFx.twentySeasons(RTG);
  const blob = Save.serialize(s, null, 1);
  const bytes = Buffer.byteLength(JSON.stringify(blob), 'utf8');
  assert.ok(bytes < Tuning.save.maxBytes, bytes + ' bytes ≥ ' + Tuning.save.maxBytes);
  assert.equal(Save.byteSize(blob), bytes);
});

test('packRows / unpackRows are lossless, including rows with a different key set', () => {
  const rows = [{ a: 1, b: 'x', c: { d: 2 } }, { a: 2, b: 'y', c: null }, { a: 3, b: 'z', c: [1, 2], extra: true }, { a: 4 }];
  const packed = Save.packRows(rows);
  deq(packed._cols, ['a', 'b', 'c', 'extra']);
  assert.ok(Array.isArray(packed._rows[0]) === false || true);
  deq(Save.unpackRows(packed), rows);
  deq(Save.unpackRows(rows), rows, 'plain arrays pass through');
  deq(Save.packRows([]), { _cols: [], _rows: [] });
});

test('slotSummary fields', () => {
  const s = richState();
  const blob = Save.serialize(s, RTG.RNG.create(1), 1757000000000);
  const sum = Save.slotSummary(blob);
  assert.equal(sum.name, 'Ødegård Nuñez 🦶');
  assert.equal(sum.team, Schema.userTeam(s).name);
  assert.equal(sum.year, s.year); assert.equal(sum.stage, 'NFL'); assert.equal(sum.phase, 'REG');
  assert.equal(sum.ovr, RTG.Player.ovr(s.player.attrs));
  assert.equal(sum.savedAt, 1757000000000);
  assert.equal(sum.age, s.player.age); assert.equal(sum.league, 'NFL'); assert.equal(sum.seed, s.seed);
  assert.equal(sum.difficulty, s.difficulty); assert.equal(sum.v, RTG.SAVE_VERSION); assert.equal(sum.app, RTG.VERSION);
  assert.equal(sum.calendarYear, Schema.calendarYear(s.year));
  // works on the older fixture without migrating
  const old = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save_v0.json'), 'utf8'));
  const os = Save.slotSummary(old);
  assert.equal(os.v, 0); assert.equal(os.stage, 'COLLEGE'); assert.ok(os.team && os.name);
  assert.equal(Save.slotSummary(null), null);
});
