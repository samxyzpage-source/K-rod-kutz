/**
 * data_lint.test.js — SPEC §5.1 row data_lint (E2).
 *
 * Asserts the static data: 48 colleges (6×8) in spec order, 32 NFL (2×4×4),
 * no trademark collisions (blocklist + city/nick pairs), unique ids/abbrs/names,
 * valid hex colours with primary/secondary contrast ≥ 2.5 (WCAG relative
 * luminance), name-list sizes, no blocked kicker surnames, valid regions,
 * record base values, and a small RTG.Names determinism/draw-count suite.
 * Event/headline checks run only when RTG.Data.events / RTG.Data.headlines
 * exist (owned by E3).
 *
 *   node kicker/test/data_lint.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RTG = require('./load')();
const fx = require('./fixtures/league');

const D = RTG.Data;
const REGIONS = ['NE', 'SE', 'MW', 'SW', 'W'];
const CLIMATES = ['warm', 'temperate', 'cold'];
const HEX = /^#[0-9a-f]{6}$/;

function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
  const l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
/** Cross-realm safe deep equality (vm arrays have a foreign Array.prototype). */
function same(a, b, msg) {
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg);
}
function dupes(arr) {
  const seen = new Set(); const out = [];
  for (const x of arr) { if (seen.has(x)) out.push(x); seen.add(x); }
  return out;
}

// ───────────────────────────── colleges ─────────────────────────────

test('colleges: 48 teams, 6 conferences × 8, spec order and indices', () => {
  assert.equal(D.conferences.length, 6);
  same(D.conferences.map((c) => c.id), ['COA', 'HRT', 'BFR', 'PAC', 'SOU', 'GLL']);
  assert.equal(D.colleges.length, 48);
  D.colleges.forEach((t, i) => {
    const conf = D.conferences[Math.floor(i / 8)].id;
    assert.equal(t.conf, conf, `team ${i} conf`);
    assert.equal(t.confIdx, i % 8, `team ${i} confIdx`);
    assert.equal(t.id, conf + (i % 8));
    assert.equal(t.rival, conf + (7 - (i % 8)));
    assert.ok(D.collegeById[t.rival], 'rival exists');
  });
  same(D.rivalPairs, [[0, 7], [1, 6], [2, 5], [3, 4]]);
  // spot-check spec order
  assert.equal(D.colleges[0].name, 'Atlantic Tech Tidewaters');
  assert.equal(D.colleges[8].name, 'Prairie Tech Sodbusters');
  assert.equal(D.colleges[16].name, 'Lone Star Tech Longriders');
  assert.equal(D.colleges[24].name, 'Golden Coast Condors');
  assert.equal(D.colleges[32].name, 'Crimson Bluff Boars');
  assert.equal(D.colleges[40].name, 'Lakeshore State Freighters');
  assert.equal(D.colleges[47].name, 'Superior Bay Icebreakers');
});

test('colleges: field ranges, climate flags, regions', () => {
  for (const t of D.colleges) {
    assert.ok(t.prestige >= 1 && t.prestige <= 5, t.id + ' prestige');
    for (const k of ['OFF', 'DEF', 'ST']) assert.ok(t[k] >= 50 && t[k] <= 92, `${t.id} ${k} in 50–92`);
    assert.ok(CLIMATES.includes(t.climate), t.id + ' climate');
    assert.ok(REGIONS.includes(t.region), t.id + ' region');
    for (const k of ['dome', 'altitude', 'windy', 'rainy', 'verifiedFictional']) assert.equal(typeof t[k], 'boolean', `${t.id} ${k}`);
    assert.ok(t.school && t.nick && t.city && t.state && t.name === t.school + ' ' + t.nick, t.id + ' name parts');
    assert.match(t.abbr, /^[A-Z]{3}$/, t.id + ' abbr 3 letters');
  }
  // spec spot checks
  const mct = D.collegeById.GLL1;
  assert.equal(mct.dome, true); assert.equal(mct.climate, 'cold');
  const srs = D.collegeById.PAC3;
  assert.equal(srs.altitude, true);
  const npb = D.collegeById.COA7;
  assert.equal(npb.rainy, true);
  assert.equal(D.collegeById.HRT1.windy, true);
});

test('bowls: 6 major + 12 minor with venue climate', () => {
  const majors = D.bowls.filter((b) => b.tier === 'major');
  const minors = D.bowls.filter((b) => b.tier === 'minor');
  assert.equal(majors.length, 6);
  assert.equal(minors.length, 12);
  same(majors.map((b) => b.name), ['Citrus Grove Bowl', 'Cactus Sun Bowl', 'Harbor Bowl', 'Peach Blossom Bowl', 'Alamo Plaza Bowl', 'Frontier Bowl']);
  assert.equal(dupes(D.bowls.map((b) => b.id)).length, 0);
  for (const b of D.bowls) {
    assert.ok(CLIMATES.includes(b.climate), b.id);
    assert.equal(typeof b.dome, 'boolean');
    assert.ok(b.city && b.state);
  }
});

// ───────────────────────────── NFL ─────────────────────────────

test('nfl: 32 teams, 2 conferences × 4 divisions × 4, spec order', () => {
  assert.equal(D.nfl.length, 32);
  same(D.nflStructure.conferences, ['Liberty', 'Frontier']);
  same(D.nflStructure.divisions, ['North', 'South', 'East', 'West']);
  D.nfl.forEach((t, i) => {
    assert.equal(t.conf, D.nflStructure.conferences[Math.floor(i / 16)], t.id + ' conf');
    assert.equal(t.div, D.nflStructure.divisions[Math.floor((i % 16) / 4)], t.id + ' div');
    assert.equal(t.confIdx, Math.floor(i / 16));
    assert.equal(t.divIdx, Math.floor((i % 16) / 4));
    assert.equal(t.id, t.abbr);
    assert.match(t.abbr, /^[A-Z]{2,3}$/, t.id + ' abbr');
    assert.ok(REGIONS.includes(t.region), t.id + ' region');
    assert.ok(CLIMATES.concat(['dome']).includes(t.climate), t.id + ' climate');
    assert.equal(t.dome, t.climate === 'dome', t.id + ' dome flag');
    assert.equal(t.name, t.city + ' ' + t.nick);
    for (const k of ['bigMarket', 'windy', 'rainy', 'altitude', 'verifiedFictional']) assert.equal(typeof t[k], 'boolean', `${t.id} ${k}`);
  });
  for (const conf of D.nflStructure.conferences) {
    for (const div of D.nflStructure.divisions) {
      assert.equal(D.nflStructure.byConf[conf][div].length, 4, conf + ' ' + div);
    }
  }
  assert.equal(D.nfl[0].name, 'Boston Harbormen');
  assert.equal(D.nfl[15].name, 'Salt Lake Peaks');
  assert.equal(D.nfl[16].name, 'Chicago Wind');
  assert.equal(D.nfl[31].name, 'Phoenix Firebirds');
  same(D.nfl.filter((t) => t.bigMarket).map((t) => t.id), ['NYE', 'CHI', 'DAL', 'LA', 'SF']);
  same(D.nfl.filter((t) => t.altitude).map((t) => t.id), ['DEN', 'SLC']);
  assert.equal(D.nfl.filter((t) => t.dome).length, 9);
});

test('nfl: championship hosts are 10 real team cities (domes + Miami + LA)', () => {
  assert.equal(D.championshipHosts.length, 10);
  for (const h of D.championshipHosts) {
    const t = D.nflById[h.teamId];
    assert.ok(t, h.city + ' host team exists');
    assert.equal(t.city, h.city);
    assert.equal(h.dome, t.dome);
  }
  assert.equal(D.championshipHosts.filter((h) => h.dome).length, 8);
  assert.ok(D.championshipHosts.some((h) => h.teamId === 'MIA'));
  assert.ok(D.championshipHosts.some((h) => h.teamId === 'LA'));
});

// ───────────────────────────── trademark blocklist ─────────────────────────────

test('blocklist: contains every §2.12.5 nickname and the extra words; helper normalises plurals', () => {
  const must = ['Tigers', 'Bulldogs', 'Minutemen', 'Aces', 'Gators', 'Broncos', 'Lakers', 'Bison', 'Cavaliers',
    'Roadrunners', 'Mustangs', 'Hurricanes', 'Timberwolves', 'Lightning', 'Mariners', 'Cowboys', '49ers',
    'Commanders', 'Crimson Tide', 'Rainbow Warriors', 'Blue Jays', 'Dodgers'];
  for (const n of must) assert.ok(D.isBlockedNick(n), n + ' blocked');
  assert.ok(D.blockedNicknames.length >= 150);
  for (const w of ['Hoosier', 'Buckeye', 'Sooner', 'Old Dominion', 'Delta State', 'Boston Common']) {
    assert.ok(D.blockedWords.includes(w), w);
    assert.ok(D.isBlockedNick(w), w + ' blocked as word');
  }
  assert.ok(D.isBlockedNick('tiger'));
  assert.ok(D.isBlockedNick('TIGERS'));
  assert.ok(D.isBlockedNick('Wolverine'));
  assert.ok(D.isBlockedNick('Timberwolf'));
  assert.ok(D.isBlockedNick('Grizzly'));
  assert.ok(D.isBlockedNick('Buckeye State Foxes'));
  assert.ok(D.isBlockedNick('Admirals', 'Milwaukee'), 'city+nick pair');
  assert.ok(!D.isBlockedNick('Admirals', 'Annapolis'));
  assert.ok(!D.isBlockedNick('Foxhounds'));
  assert.ok(Array.isArray(D.blockedCityNick) && D.blockedCityNick.length >= 40);
  for (const p of D.blockedCityNick) assert.ok(Array.isArray(p) && p.length === 2 && p[0] && p[1]);
});

test('teams: no nickname, name or city+nick collides with the blocklist', () => {
  for (const t of D.colleges.concat(D.nfl)) {
    assert.ok(!D.isBlockedNick(t.nick, t.city), `${t.id} nick "${t.nick}" is blocked`);
    for (const w of D.blockedWords) {
      assert.ok(t.name.toLowerCase().indexOf(w.toLowerCase()) < 0, `${t.id} name contains "${w}"`);
    }
    // a nick that merely contains a blocked nick as a whole word is also out (e.g. "Sea Lions")
    for (const word of t.nick.split(/[\s-]+/)) {
      assert.ok(!D.isBlockedNick(word), `${t.id} nick word "${word}" is blocked`);
    }
    assert.equal(t.verifiedFictional, true, t.id);
  }
});

// ───────────────────────────── uniqueness, colours ─────────────────────────────

test('teams: ids unique across both leagues; abbrs and names unique per league', () => {
  const all = D.colleges.concat(D.nfl);
  same(dupes(all.map((t) => t.id)), []);
  same(dupes(D.colleges.map((t) => t.abbr)), []);
  same(dupes(D.nfl.map((t) => t.abbr)), []);
  same(dupes(D.colleges.map((t) => t.name)), []);
  same(dupes(D.nfl.map((t) => t.name)), []);
  same(dupes(D.colleges.map((t) => t.nick)), []);
  same(dupes(D.nfl.map((t) => t.nick)), []);
  // no exact nickname shared between the two leagues (the spec's own Tidewater /
  // Tidewaters near-duplicate is tolerated and reported in the package notes)
  const cn = new Set(D.colleges.map((t) => t.nick.toLowerCase()));
  for (const t of D.nfl) assert.ok(!cn.has(t.nick.toLowerCase()), t.nick + ' shared with a college');
});

test('teams: hex colours valid and primary/secondary contrast ≥ 2.5', () => {
  for (const t of D.colleges.concat(D.nfl)) {
    assert.equal(t.colors.length, 2, t.id);
    for (const c of t.colors) assert.match(c, HEX, `${t.id} colour ${c}`);
    const r = contrast(t.colors[0], t.colors[1]);
    assert.ok(r >= 2.5, `${t.id} ${t.name} ${t.colors.join('/')} contrast ${r.toFixed(2)} < 2.5`);
  }
});

test('data: team/name/bowl objects are JSON round-trippable', () => {
  for (const [k, v] of Object.entries({ colleges: D.colleges, nfl: D.nfl, bowls: D.bowls, hometowns: D.names.hometowns, first: D.names.first })) {
    assert.equal(JSON.stringify(JSON.parse(JSON.stringify(v))), JSON.stringify(v), k);
  }
});

// ───────────────────────────── names ─────────────────────────────

test('names: list sizes, shapes, uniqueness', () => {
  const N = D.names;
  assert.ok(N.first.length >= 220, 'first ≥ 220: ' + N.first.length);
  assert.ok(N.last.length >= 320, 'last ≥ 320: ' + N.last.length);
  same(N.suffix, ['Jr.', 'III', 'II']);
  assert.ok(N.nicknames.length >= 30);
  assert.ok(N.outlets.length >= 12);
  assert.equal(N.hometowns.length, 60);
  same(dupes(N.first.map((f) => f.n)), []);
  same(dupes(N.last), []);
  same(dupes(N.hometowns.map((h) => h.city + ',' + h.state)), []);
  for (const f of N.first) {
    assert.ok(['modern', 'classic', 'any'].includes(f.era), f.n + ' era');
    assert.ok(f.w >= 1 && f.w <= 3, f.n + ' weight');
    assert.match(f.n, /^[A-Z][A-Za-z']+$/, f.n);
  }
  const eras = { modern: 0, classic: 0, any: 0 };
  for (const f of N.first) eras[f.era]++;
  assert.ok(eras.modern >= 60 && eras.classic >= 40 && eras.any >= 40, JSON.stringify(eras));
  for (const h of N.hometowns) {
    assert.ok(REGIONS.includes(h.region), h.city + ' region');
    assert.match(h.state, /^[A-Z]{2}$/);
  }
  for (const r of REGIONS) assert.ok(N.hometowns.some((h) => h.region === r), 'region ' + r + ' represented');
  assert.ok(N.nicknames.some((n) => n.indexOf('{city}') >= 0), 'a {city} nickname exists');
  assert.ok(N.nicknames.includes('Iceman') && N.nicknames.includes('The Mailman') && N.nicknames.includes('Doink King'));
  assert.ok(N.outlets.includes('Gridiron Daily') && N.outlets.includes('The Snap Count') && N.outlets.includes('KickCast'));
  same(N.regions, REGIONS);
});

test('names: no blocked real-kicker surnames (allowCommon exempt)', () => {
  const N = D.names;
  const spec = ['Tucker', 'Butker', 'Vinatieri', 'Janikowski', 'Aubrey', 'Gostkowski', 'Prater', 'Zuerlein', 'Lutz',
    'McManus', 'Boswell', 'Koo', 'Carlson', 'Gould', 'Crosby', 'Dicker', 'Fairbairn', 'Slye', 'Folk', 'Andersen',
    'Stenerud', 'Akers', 'Kaeding', 'Hauschka', 'Gano', 'Succop', 'Badgley', 'Maher', 'Blankenship', 'Ficken',
    'Moody', 'Pineiro', 'Reichard', 'Karty'];
  same(N.blockedLast, spec);
  same(N.allowCommon, ['Bailey', 'Jones', 'Myers', 'Little', 'Elliott', 'Joseph', 'Santos', 'York', 'Bass']);
  const blocked = new Set(N.blockedLast.map((s) => s.toLowerCase()));
  const allow = new Set(N.allowCommon.map((s) => s.toLowerCase()));
  for (const l of N.last) {
    const k = l.toLowerCase().replace(/[^a-z]/g, '');
    if (allow.has(k)) continue;
    assert.ok(!blocked.has(k), 'blocked surname in last: ' + l);
  }
  for (const a of N.allowCommon) assert.ok(N.last.includes(a), a + ' present (allowed)');
});

// ───────────────────────────── records ─────────────────────────────

test('records: §2.9 base values, labels and minimum-attempt notes', () => {
  const R = D.records;
  same(R.base.college, { longFG: 62, seasonFGM: 29, seasonPts: 140, seasonFGpct: 96.0, season50plus: 8, careerFGM: 90, careerPts: 460, careerFGpct: 89.5, consecutiveFGM: 26, careerGW: 7 });
  same(R.base.nfl, { longFG: 66, seasonFGM: 40, seasonPts: 166, seasonFGpct: 97.2, season50plus: 12, careerFGM: 560, careerPts: 2600, careerFGpct: 91.0, consecutiveFGM: 44, careerGW: 30, careerSeasons: 22 });
  assert.equal(R.keys.length, 11);
  for (const k of R.keys) assert.ok(R.meta[k] && R.meta[k].label, k + ' label');
  assert.equal(R.meta.seasonFGpct.minFga, 20);
  assert.equal(R.meta.careerFGpct.minFga, 100);
  assert.equal(R.keysFor('college').length, 10);
  same(R.keysFor('nfl'), R.keys);
});

// ───────────────────────────── events / headlines (E3, conditional) ─────────────────────────────

const EFFECT_KEYS = new Set(['morale', 'trust', 'fans', 'fame', 'js', 'xp', 'money', 'attrs', 'mods', 'flags', 'action', 'headline', 'trait', 'traits', 'injury']);

test('events: ≥ 30 with ≥ 1 choice each, cond functions, known effect keys', { skip: !D.events && 'RTG.Data.events not delivered yet (E3, data/events.js)' }, () => {
  const events = Array.isArray(D.events) ? D.events : Object.values(D.events);
  assert.ok(events.length >= 30, 'events ≥ 30: ' + events.length);
  same(dupes(events.map((e) => e.id)), []);
  for (const e of events) {
    assert.ok(e.id && e.title && e.text, e.id + ' fields');
    assert.equal(typeof e.cond, 'function', e.id + ' cond');
    assert.ok(Array.isArray(e.choices) && e.choices.length >= 1, e.id + ' choices');
    for (const c of e.choices) {
      assert.ok(c.label, e.id + ' choice label');
      const effs = [c.effects || {}].concat((c.branches || []).map((b) => b.effects || {}));
      for (const eff of effs) for (const k of Object.keys(eff)) assert.ok(EFFECT_KEYS.has(k), `${e.id}: unknown effect key "${k}"`);
    }
  }
});

test('headlines: ≥ 160 templates with tags', { skip: !D.headlines && 'RTG.Data.headlines not delivered yet (E3, data/headlines.js)' }, () => {
  const hl = Array.isArray(D.headlines) ? D.headlines : Object.values(D.headlines).reduce((a, b) => a.concat(b), []);
  assert.ok(hl.length >= 160, 'headlines ≥ 160: ' + hl.length);
  for (const h of hl) {
    assert.ok(h.text && Array.isArray(h.tags) && h.tags.length >= 1, (h.id || '?') + ' shape');
  }
});

// ───────────────────────────── RTG.Names ─────────────────────────────

function counting(rng) {
  let n = 0;
  const next = rng.next.bind(rng);
  rng.next = function () { n++; return next(); };
  return { count: () => n, reset: () => { n = 0; } };
}

test('Names: deterministic for a seed', () => {
  const a = fx.testRng(RTG, 1234), b = fx.testRng(RTG, 1234);
  const seqA = [], seqB = [];
  for (let i = 0; i < 40; i++) {
    seqA.push(RTG.Names.player(a, { era: i % 2 ? 'modern' : 'classic' }).full, RTG.Names.coach(a), RTG.Names.reporter(a).outlet, RTG.Names.hometown(a).city);
    seqB.push(RTG.Names.player(b, { era: i % 2 ? 'modern' : 'classic' }).full, RTG.Names.coach(b), RTG.Names.reporter(b).outlet, RTG.Names.hometown(b).city);
  }
  same(seqA, seqB);
  const c = fx.testRng(RTG, 99);
  assert.notEqual(JSON.stringify([RTG.Names.player(c).full, RTG.Names.player(c).full]), JSON.stringify([seqA[0], seqA[4]]));
});

test('Names: shapes, eras, draw counts', () => {
  const rng = fx.testRng(RTG, 7);
  const ctr = counting(rng);
  const classicSet = new Set(D.names.first.filter((f) => f.era !== 'modern').map((f) => f.n));
  const modernSet = new Set(D.names.first.filter((f) => f.era !== 'classic').map((f) => f.n));
  for (let i = 0; i < 300; i++) {
    ctr.reset();
    const p = RTG.Names.player(rng, { era: 'modern' });
    assert.ok(ctr.count() === 3 || ctr.count() === 4, 'player draws 3–4: ' + ctr.count());
    assert.ok(p.first && p.last && p.full.indexOf(p.first + ' ' + p.last) === 0, JSON.stringify(p));
    assert.ok(modernSet.has(p.first), 'modern first: ' + p.first);
    ctr.reset();
    const l = RTG.Names.legend(rng);
    assert.ok(ctr.count() === 3 || ctr.count() === 4);
    assert.ok(classicSet.has(l.first), 'classic first: ' + l.first);
    ctr.reset();
    const coach = RTG.Names.coach(rng);
    assert.equal(ctr.count(), 1);
    assert.match(coach, /^Coach [A-Z]/);
    ctr.reset();
    const rep = RTG.Names.reporter(rng);
    assert.equal(ctr.count(), 3);
    assert.ok(rep.name.indexOf(' ') > 0 && D.names.outlets.includes(rep.outlet));
    ctr.reset();
    const h = RTG.Names.hometown(rng);
    assert.equal(ctr.count(), 1);
    assert.ok(REGIONS.includes(h.region) && h.city && h.state);
    assert.ok(D.names.hometowns.every((x) => x !== h), 'hometown is a copy');
    ctr.reset();
    const nick = RTG.Names.nickname(rng, 'Boise');
    assert.equal(ctr.count(), 1);
    assert.ok(nick.indexOf('{') < 0, nick);
  }
});

test('Names: suffix/hyphen rate ≈ Tuning.names.suffixRate', () => {
  const rng = fx.testRng(RTG, 2024);
  const rate = (RTG.Tuning && RTG.Tuning.names && RTG.Tuning.names.suffixRate) || 0.08;
  let hits = 0, hyph = 0; const N = 20000;
  for (let i = 0; i < N; i++) {
    const p = RTG.Names.player(rng);
    const special = p.full !== p.first + ' ' + p.last || p.last.indexOf('-') > 0;
    if (special) hits++;
    if (p.last.indexOf('-') > 0) hyph++;
  }
  assert.ok(Math.abs(hits / N - rate) < 0.01, 'suffix/hyphen rate ' + (hits / N));
  assert.ok(hyph > 0 && hyph < hits, 'both hyphen and suffix variants occur');
});

test('Names: unique() retries and records the taken key', () => {
  const rng = fx.testRng(RTG, 5);
  const taken = new Set();
  const names = [];
  for (let i = 0; i < 200; i++) names.push(RTG.Names.unique(rng, taken, RTG.Names.player).full);
  same(dupes(names), []);
  assert.equal(taken.size, 200);
  // a generator that always collides gives up after Tuning.names.uniqueRetries retries
  const retries = (RTG.Tuning && RTG.Tuning.names && RTG.Tuning.names.uniqueRetries) || 10;
  let calls = 0;
  const stuck = RTG.Names.unique(rng, new Set(["X"]), () => { calls++; return "X"; });
  assert.equal(stuck, "X");
  assert.equal(calls, retries + 1);
  // arrays and plain objects work as `taken` too
  const arr = ['Coach Hale'];
  const c = RTG.Names.unique(rng, arr, RTG.Names.coach);
  assert.ok(arr.includes(c) && arr.length === 2);
});

test('fixtures/league: buildLeagues yields valid, JSON-safe leagues', () => {
  const rng = fx.testRng(RTG, 11);
  const { college, nfl } = fx.buildLeagues(RTG, rng);
  assert.equal(college.teams.length, 48);
  assert.equal(nfl.teams.length, 32);
  for (const L of [college, nfl]) {
    for (const t of L.teams) {
      assert.ok(t.kicker && t.kicker.name && t.kicker.attrs.POW >= 30, t.id + ' kicker');
      assert.ok(t.coachAgg >= 0.3 && t.coachAgg <= 0.8, t.id + ' coachAgg');
      assert.ok(['grass', 'turf'].includes(t.surface));
      if (t.dome) assert.equal(t.surface, 'turf');
      assert.equal(L.teamIndex[t.id], L.teams.indexOf(t));
      assert.equal(L.kickers[t.id], t.kicker);
    }
    assert.equal(JSON.stringify(JSON.parse(JSON.stringify(L))), JSON.stringify(L));
  }
  for (const t of nfl.teams) assert.ok(t.OFF >= 58 && t.OFF <= 88 && t.DEF >= 58 && t.DEF <= 88, t.id + ' ratings');
  const again = fx.buildLeagues(RTG, fx.testRng(RTG, 11));
  same(again, { college, nfl });
});
