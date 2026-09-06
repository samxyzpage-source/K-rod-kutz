/**
 * schedule.test.js — RTG.Schedule (SPEC §2.6, §3.5.9, §5.1)
 *
 * College: every team 12 games, 7 conference (each conference opponent once),
 * 5 non-conference vs 5 distinct other conferences, week 12 = rival, no team
 * plays twice in a week, no self-games, home/away 6/6 ±1, the §2.6.1
 * non-conference formula. NFL: 17 games, 6 divisional, 4+4 rotating divisions,
 * 2+1 place-based, 8/9 home split alternating by year, one bye in weeks 5–14,
 * 18 weeks, ≤ 16 games per week, generation < 50 ms, deterministic by seed,
 * 100 consecutive years all valid.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RTG = require('./load')();
/** Cross-realm deep equality: engine objects come from a vm context, so normalise through JSON first. */
const J = (v) => JSON.parse(JSON.stringify(v));
const deq = (a, b, m) => assert.deepEqual(J(a), J(b), m);
const ndeq = (a, b, m) => assert.notDeepEqual(J(a), J(b), m);
const leagueFx = require('./fixtures/league');

const T = RTG.Tuning.schedule;
const rng0 = leagueFx.testRng(RTG, 42);
const { college, nfl } = leagueFx.buildLeagues(RTG, rng0);
const byId = (league) => Object.fromEntries(league.teams.map((t) => [t.id, t]));
const cById = byId(college), nById = byId(nfl);

/** Per-team game lists, week sets, home counts. */
function tally(games) {
  const per = {};
  for (const g of games) {
    for (const [id, home] of [[g.homeId, true], [g.awayId, false]]) {
      per[id] = per[id] || { games: [], weeks: new Set(), home: 0, opps: [] };
      per[id].games.push(g);
      assert.ok(!per[id].weeks.has(g.week), `${id} plays twice in week ${g.week}`);
      per[id].weeks.add(g.week);
      if (home) per[id].home++;
      per[id].opps.push(home ? g.awayId : g.homeId);
    }
  }
  return per;
}

function checkCollegeYear(games, year) {
  assert.equal(games.length, 48 * 12 / 2, 'college game count');
  const per = tally(games);
  assert.equal(Object.keys(per).length, 48);
  for (const g of games) {
    assert.notEqual(g.homeId, g.awayId, 'self game');
    assert.equal(g.kind, 'REG');
    assert.equal(g.venue, g.homeId, 'venue = home team');
    assert.equal(g.played, false);
    assert.ok(g.week >= 1 && g.week <= T.college.regWeeks - 1, 'REG weeks 1–12');
    assert.match(g.id, new RegExp(`^C${year}-w\\d\\d-[A-Z]{3}-[A-Z]{3}$`), 'id format C1-w03-ATT-CHS');
    assert.equal(g.id, `C${year}-w${String(g.week).padStart(2, '0')}-${cById[g.homeId].abbr}-${cById[g.awayId].abbr}`);
    assert.equal(g.conf, cById[g.homeId].conf === cById[g.awayId].conf, 'conf flag');
  }
  for (const [id, p] of Object.entries(per)) {
    const me = cById[id];
    assert.equal(p.games.length, 12, `${id} plays 12`);
    const confOpps = p.opps.filter((o) => cById[o].conf === me.conf);
    const nonConfOpps = p.opps.filter((o) => cById[o].conf !== me.conf);
    assert.equal(confOpps.length, 7, `${id} 7 conference games`);
    assert.equal(new Set(confOpps).size, 7, `${id} each conference opponent once`);
    assert.equal(nonConfOpps.length, 5);
    assert.equal(new Set(nonConfOpps.map((o) => cById[o].conf)).size, 5, `${id} 5 distinct other conferences`);
    assert.ok(Math.abs(p.home - 6) <= 1, `${id} home games ${p.home} within 6 ±1`);
    // Week 12 = rivalry: opponent is the data rival (index pairs (0,7)(1,6)(2,5)(3,4)).
    const w12 = p.games.find((g) => g.week === T.college.rivalryWeek);
    const opp = w12.homeId === id ? w12.awayId : w12.homeId;
    assert.equal(opp, me.rival, `${id} plays its rival in week 12`);
    assert.equal(w12.rivalry, true);
    // Non-conference games only in the non-conference weeks, conference games in conference weeks.
    for (const g of p.games) {
      const isConf = cById[g.homeId].conf === cById[g.awayId].conf;
      assert.equal(T.college.nonConfWeeks.includes(g.week), !isConf, `${g.id} week type`);
    }
  }
}

test('college: one season is structurally valid (year 1)', () => {
  const games = RTG.Schedule.college(college, 1, leagueFx.testRng(RTG, 1));
  checkCollegeYear(games, 1);
  const v = RTG.Schedule.validate(games, college);
  deq(v, { ok: true, errors: [] });
});

test('college: §2.6.1 non-conference formula A[t] vs B[(t + r + year) mod 8], home = A if (t + year) even', () => {
  const confs = RTG.Data.conferences.map((c) => c.id);
  const table = (cid) => college.teams.filter((t) => t.conf === cid).sort((a, b) => a.confIdx - b.confIdx);
  for (const year of [1, 2, 7]) {
    const games = RTG.Schedule.college(college, year, leagueFx.testRng(RTG, 1));
    // Round 0 of the 6-conference circle method pairs (0,5), (1,4), (2,3) in week 1.
    const A = table(confs[0]), B = table(confs[5]);
    for (let t = 0; t < 8; t++) {
      const a = A[t], b = B[(t + 0 + year) % 8];
      const g = games.find((x) => x.week === 1 && ((x.homeId === a.id && x.awayId === b.id) || (x.homeId === b.id && x.awayId === a.id)));
      assert.ok(g, `year ${year}: ${a.id} vs ${b.id} in week 1`);
      const aHome = (t + year) % 2 === 0;
      assert.equal(g.homeId, aHome ? a.id : b.id, `home side for t=${t}, year ${year}`);
    }
  }
});

test('college: rivalry week uses circle-method round 0 → rival pairs (0,7)(1,6)(2,5)(3,4)', () => {
  const games = RTG.Schedule.college(college, 3, leagueFx.testRng(RTG, 1));
  const w12 = games.filter((g) => g.week === 12);
  assert.equal(w12.length, 24);
  for (const g of w12) {
    const h = cById[g.homeId], a = cById[g.awayId];
    assert.equal(h.conf, a.conf);
    assert.equal(h.confIdx + a.confIdx, 7, 'index pair sums to 7');
  }
});

test('college: deterministic (no rng draws) and 100 consecutive years valid in < 50 ms each', () => {
  const r1 = leagueFx.testRng(RTG, 5), r2 = leagueFx.testRng(RTG, 999);
  const s1 = r1.state();
  const a = RTG.Schedule.college(college, 4, r1);
  assert.equal(r1.state(), s1, 'college schedule draws nothing from the rng');
  const b = RTG.Schedule.college(college, 4, r2);
  deq(a.map((g) => g.id), b.map((g) => g.id), 'independent of rng');
  let worst = 0;
  for (let y = 1; y <= 100; y++) {
    const t0 = process.hrtime.bigint();
    const games = RTG.Schedule.college(college, y, r1);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    worst = Math.max(worst, ms);
    checkCollegeYear(games, y);
  }
  assert.ok(worst < T.nfl.genBudgetMs, `worst college generation ${worst.toFixed(1)} ms < 50 ms`);
});

test('college: consecutive years rotate the non-conference opponents', () => {
  const y1 = RTG.Schedule.college(college, 1, rng0), y2 = RTG.Schedule.college(college, 2, rng0);
  const opps = (games, id) => new Set(games.filter((g) => g.homeId === id || g.awayId === id).filter((g) => !g.conf).map((g) => (g.homeId === id ? g.awayId : g.homeId)));
  const id = college.teams[0].id;
  const o1 = opps(y1, id), o2 = opps(y2, id);
  const shared = [...o1].filter((x) => o2.has(x)).length;
  assert.ok(shared < 5, 'non-conference slate changes year to year');
});

// ─────────────────────────────── NFL ───────────────────────────────

function checkNflYear(games, year) {
  assert.equal(games.length, 32 * 17 / 2, 'nfl game count');
  const per = tally(games);
  assert.equal(Object.keys(per).length, 32);
  const perWeek = {};
  for (const g of games) {
    assert.notEqual(g.homeId, g.awayId);
    assert.equal(g.kind, 'REG');
    assert.equal(g.venue, g.homeId);
    assert.ok(g.week >= 1 && g.week <= T.nfl.regWeeks, '18 weeks');
    assert.equal(g.id, `N${year}-w${String(g.week).padStart(2, '0')}-${nById[g.homeId].abbr}-${nById[g.awayId].abbr}`);
    perWeek[g.week] = (perWeek[g.week] || 0) + 1;
    const h = nById[g.homeId], a = nById[g.awayId];
    assert.equal(g.conf, h.conf === a.conf);
    assert.equal(g.div, h.conf === a.conf && h.div === a.div);
  }
  assert.equal(Object.keys(perWeek).length, T.nfl.regWeeks, 'games in every one of 18 weeks');
  for (const [w, n] of Object.entries(perWeek)) {
    assert.ok(n <= T.nfl.maxGamesPerWeek, `week ${w}: ${n} games ≤ 16`);
    const byes = 32 - 2 * n;
    if (byes > 0) assert.ok(Number(w) >= T.nfl.byeWeeks[0] && Number(w) <= T.nfl.byeWeeks[1], `byes only in weeks 5–14 (week ${w})`);
    assert.ok(byes <= T.nfl.maxByesPerWeek, `≤ ${T.nfl.maxByesPerWeek} byes in week ${w}`);
  }
  for (const [id, p] of Object.entries(per)) {
    const me = nById[id];
    assert.equal(p.games.length, 17, `${id} plays 17`);
    assert.equal(p.weeks.size, 17);
    const byeWeeks = [];
    for (let w = 1; w <= T.nfl.regWeeks; w++) if (!p.weeks.has(w)) byeWeeks.push(w);
    assert.equal(byeWeeks.length, 1, `${id} exactly one bye`);
    assert.ok(byeWeeks[0] >= T.nfl.byeWeeks[0] && byeWeeks[0] <= T.nfl.byeWeeks[1], `${id} bye in 5–14`);
    // Opponent structure.
    const opps = p.opps.map((o) => nById[o]);
    const divisional = opps.filter((o) => o.conf === me.conf && o.div === me.div);
    assert.equal(divisional.length, 6, `${id} 6 divisional games`);
    for (const mate of nfl.teams.filter((t) => t.conf === me.conf && t.div === me.div && t.id !== id)) {
      const vs = p.games.filter((g) => g.homeId === mate.id || g.awayId === mate.id);
      assert.equal(vs.length, 2, `${id} plays ${mate.id} twice`);
      assert.equal(vs.filter((g) => g.homeId === id).length, 1, `${id}/${mate.id} home and away`);
    }
    const sameConfOther = opps.filter((o) => o.conf === me.conf && o.div !== me.div);
    const crossConf = opps.filter((o) => o.conf !== me.conf);
    assert.equal(sameConfOther.length, 6, `${id} 4 rotating + 2 place-based same-conference`);
    assert.equal(crossConf.length, 5, `${id} 4 rotating + 1 place-based other-conference`);
    const countBy = (arr) => arr.reduce((m, o) => ((m[o.div] = (m[o.div] || 0) + 1), m), {});
    const sc = countBy(sameConfOther), cc = countBy(crossConf);
    deq(Object.values(sc).sort(), [1, 1, 4], `${id} same-conference: one full division + one team from each of the other two`);
    deq(Object.values(cc).sort(), [1, 4], `${id} other-conference: one full division + one place-based`);
    // Home split: 8 or 9, Liberty gets 9 in even years (hosts the 17th game).
    const libertyHosts = year % 2 === 0;
    const expectHome = (me.confIdx === 0) === libertyHosts ? 9 : 8;
    assert.equal(p.home, expectHome, `${id} home games in year ${year}`);
    // Rotating divisions: 2 home / 2 away against each.
    for (const [div, n] of Object.entries(sc)) if (n === 4) {
      const home = p.games.filter((g) => g.homeId === id && nById[g.awayId].conf === me.conf && nById[g.awayId].div === div).length;
      assert.equal(home, 2, `${id} 2/2 vs same-conference rotating division`);
    }
    for (const [div, n] of Object.entries(cc)) if (n === 4) {
      const home = p.games.filter((g) => g.homeId === id && nById[g.awayId].conf !== me.conf && nById[g.awayId].div === div).length;
      assert.equal(home, 2, `${id} 2/2 vs other-conference rotating division`);
    }
    // No opponent more than twice, and only divisional opponents twice.
    const seen = {};
    for (const o of opps) seen[o.id] = (seen[o.id] || 0) + 1;
    for (const [o, n] of Object.entries(seen)) {
      assert.ok(n <= 2);
      if (n === 2) assert.equal(nById[o].div, me.div);
    }
  }
}

test('nfl: one season is structurally valid (year 1, data-order places)', () => {
  const games = RTG.Schedule.nfl(nfl, 1, null, leagueFx.testRng(RTG, 11));
  checkNflYear(games, 1);
  deq(RTG.Schedule.validate(games, nfl), { ok: true, errors: [] });
});

test('nfl: place-based opponents follow the previous standings (divRank)', () => {
  // Fake standings: reverse the data order inside every division.
  const rows = [];
  for (const t of nfl.teams) {
    const divMates = nfl.teams.filter((x) => x.conf === t.conf && x.div === t.div);
    rows.push({ teamId: t.id, divRank: divMates.length - divMates.indexOf(t) });
  }
  const year = 2;
  const games = RTG.Schedule.nfl(nfl, year, rows, leagueFx.testRng(RTG, 3));
  checkNflYear(games, year);
  const rank = Object.fromEntries(rows.map((r) => [r.teamId, r.divRank]));
  for (const t of nfl.teams) {
    const mine = games.filter((g) => g.homeId === t.id || g.awayId === t.id).map((g) => (g.homeId === t.id ? g.awayId : g.homeId)).map((o) => nById[o]);
    const byDiv = {};
    for (const o of mine) { const k = o.conf + ':' + o.div; byDiv[k] = (byDiv[k] || []).concat(o); }
    for (const [k, list] of Object.entries(byDiv)) {
      if (list.length !== 1) continue;              // place-based games are the single-opponent divisions
      assert.equal(rank[list[0].id], rank[t.id], `${t.id} (place ${rank[t.id]}) meets same-place finisher in ${k}`);
    }
  }
});

test('nfl: same-place opponents come from the two same-conference divisions NOT in the rotation', () => {
  const games = RTG.Schedule.nfl(nfl, 1, null, leagueFx.testRng(RTG, 8));
  for (const t of nfl.teams) {
    const mine = games.filter((g) => g.homeId === t.id || g.awayId === t.id).map((g) => (g.homeId === t.id ? g.awayId : g.homeId)).map((o) => nById[o]);
    const sameConf = mine.filter((o) => o.conf === t.conf && o.div !== t.div);
    const counts = {};
    for (const o of sameConf) counts[o.div] = (counts[o.div] || 0) + 1;
    const divs = Object.keys(counts);
    assert.equal(divs.length, 3, `${t.id} meets all three other divisions of its conference`);
  }
});

test('nfl: deterministic by seed, different seeds differ, and 100 consecutive years valid in < 50 ms', () => {
  const a = RTG.Schedule.nfl(nfl, 3, null, leagueFx.testRng(RTG, 77));
  const b = RTG.Schedule.nfl(nfl, 3, null, leagueFx.testRng(RTG, 77));
  deq(a, b, 'same seed → identical schedule');
  const c = RTG.Schedule.nfl(nfl, 3, null, leagueFx.testRng(RTG, 78));
  ndeq(a.map((g) => g.id), c.map((g) => g.id), 'different seed → different slotting');
  const rng = leagueFx.testRng(RTG, 2024);
  let worst = 0, prev = null;
  for (let y = 1; y <= 100; y++) {
    const t0 = process.hrtime.bigint();
    const games = RTG.Schedule.nfl(nfl, y, prev, rng);
    worst = Math.max(worst, Number(process.hrtime.bigint() - t0) / 1e6);
    checkNflYear(games, y);
    // Feed plausible standings (data order shuffled by the rng) into the next year.
    prev = nfl.teams.map((t) => ({ teamId: t.id, divRank: 1 }));
    for (const conf of ['Liberty', 'Frontier']) for (const div of ['North', 'South', 'East', 'West']) {
      const ids = rng.shuffle(nfl.teams.filter((t) => t.conf === conf && t.div === div).map((t) => t.id));
      ids.forEach((id, i) => { prev.find((r) => r.teamId === id).divRank = i + 1; });
    }
  }
  assert.ok(worst < T.nfl.genBudgetMs, `worst NFL generation ${worst.toFixed(1)} ms < 50 ms`);
});

test('nfl: rotation partners change from year to year', () => {
  const rng = leagueFx.testRng(RTG, 5);
  const partner = (games, id) => {
    const me = nById[id];
    const opps = games.filter((g) => g.homeId === id || g.awayId === id).map((g) => nById[g.homeId === id ? g.awayId : g.homeId]);
    const counts = {};
    for (const o of opps) if (o.conf !== me.conf) counts[o.div] = (counts[o.div] || 0) + 1;
    return Object.keys(counts).find((d) => counts[d] === 4);
  };
  const id = nfl.teams[0].id;
  const seen = new Set();
  for (let y = 1; y <= 4; y++) seen.add(partner(RTG.Schedule.nfl(nfl, y, null, rng), id));
  assert.equal(seen.size, 4, 'other-conference rotation visits all four divisions in four years');
});

// ─────────────────────────────── queries ───────────────────────────────

test('weeksFor and gamesInWeek', () => {
  deq(RTG.Schedule.weeksFor(college).reg, T.college.regWeeks);
  assert.equal(RTG.Schedule.weeksFor(college).post, 4);
  assert.equal(RTG.Schedule.weeksFor(college).total, T.college.totalWeeks);
  assert.equal(RTG.Schedule.weeksFor('NFL').reg, 18);
  assert.equal(RTG.Schedule.weeksFor(nfl).total, 22);
  const games = RTG.Schedule.nfl(nfl, 1, null, leagueFx.testRng(RTG, 1));
  const w1 = RTG.Schedule.gamesInWeek(games, 1);
  assert.equal(w1.length, 16);
  assert.ok(w1.every((g) => g.week === 1));
  assert.equal(RTG.Schedule.gamesInWeek(games, 19).length, 0);
  const t = nfl.teams[5].id;
  assert.equal(RTG.Schedule.teamGames(games, t).length, 17);
  const g3 = RTG.Schedule.gameFor(games, t, 3);
  assert.ok(g3 === null || g3.homeId === t || g3.awayId === t);
  assert.equal(RTG.Schedule.findGame(games, games[10].id), games[10]);
});

test('schedules are JSON-serialisable plain data', () => {
  const games = RTG.Schedule.college(college, 2, rng0).concat(RTG.Schedule.nfl(nfl, 2, null, rng0));
  deq(JSON.parse(JSON.stringify(games)), games);
});
