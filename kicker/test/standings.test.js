/**
 * standings.test.js — RTG.Standings (SPEC §2.6, §3.5.10, §5.1)
 *
 * Tiebreak fixtures (H2H, division record, common games, conference record,
 * point diff, coin) for NFL divisions and wild cards; college ranking formula
 * & stickiness; 5-champs + 7-at-large selection with the 6th champion as
 * at-large; seeds 1–4 byes; bracket advancement; bowl pairing never
 * same-conference; draft order (worst first, playoff exits).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RTG = require('./load')();
const fx = require('./fixtures/season');
const leagueFx = require('./fixtures/league');

const St = RTG.Standings;
const T = RTG.Tuning.schedule;

/** Empty NFL season (no games) plus handy lookups. */
function emptyNfl(seed) {
  const s = fx.seasonState(RTG, { league: 'NFL', weeks: 0, seed: seed || 1 });
  s.byId = Object.fromEntries(s.league.teams.map((t) => [t.id, t]));
  s.div = (conf, div) => s.league.teams.filter((t) => t.conf === conf && t.div === div).map((t) => t.id);
  s.row = (id) => St.compute(s.season, s.league, leagueFx.testRng(RTG, 9)).find((r) => r.teamId === id);
  return s;
}

/** Give a team a record without touching h2h (pf/pa spread evenly). */
function record(season, id, w, l, extra) {
  fx.setResult(season, id, Object.assign({ w, l, t: 0, pf: 20 * (w + l), pa: 20 * (w + l) }, extra || {}));
}

// ─────────────────────────────── NFL division tiebreaks ───────────────────────────────

test('nfl division: head-to-head decides a two-way tie', () => {
  const s = emptyNfl();
  const [a, b, c, d] = s.div('Liberty', 'North');
  record(s.season, a, 10, 7); record(s.season, b, 10, 7); record(s.season, c, 5, 12); record(s.season, d, 4, 13);
  fx.h2h(s.season, b, a, { div: true });         // b beat a → b wins the division despite alphabetical order
  fx.h2h(s.season, b, a, { div: true });
  // keep the records equal after the h2h bookkeeping
  record(s.season, a, 10, 7, { h2h: s.season.results[a].h2h, divW: 0, divL: 2 });
  record(s.season, b, 10, 7, { h2h: s.season.results[b].h2h, divW: 2, divL: 0 });
  const rows = St.compute(s.season, s.league, leagueFx.testRng(RTG, 1));
  const rb = rows.find((r) => r.teamId === b), ra = rows.find((r) => r.teamId === a);
  assert.equal(rb.divRank, 1); assert.equal(rb.divChamp, true); assert.equal(rb.seed >= 1 && rb.seed <= 4, true);
  assert.equal(ra.divRank, 2); assert.equal(ra.divChamp, false);
  assert.equal(rb.note, 'head-to-head');
});

test('nfl division: division record when head-to-head is split', () => {
  const s = emptyNfl();
  const [a, b] = s.div('Frontier', 'West');
  fx.h2h(s.season, a, b, { div: true }); fx.h2h(s.season, b, a, { div: true });
  record(s.season, a, 9, 8, { h2h: s.season.results[a].h2h, divW: 3, divL: 3 });
  record(s.season, b, 9, 8, { h2h: s.season.results[b].h2h, divW: 5, divL: 1 });
  const rows = St.compute(s.season, s.league, leagueFx.testRng(RTG, 1));
  assert.equal(rows.find((r) => r.teamId === b).divRank, 1);
  assert.equal(rows.find((r) => r.teamId === b).note, 'division record');
});

test('nfl division: common games need ≥ 4 games, else conference record, else point differential', () => {
  const s = emptyNfl();
  const [a, b, c, d] = s.div('Liberty', 'South');
  const [x1, x2, x3, x4] = s.div('Frontier', 'North');
  // a and b: split h2h, same division record, then common opponents x1..x4 (4 games each).
  fx.h2h(s.season, a, b, { div: true }); fx.h2h(s.season, b, a, { div: true });
  for (const x of [x1, x2, x3, x4]) fx.h2h(s.season, a, x);            // a 4-0 vs common
  fx.h2h(s.season, b, x1); fx.h2h(s.season, x2, b); fx.h2h(s.season, b, x3); fx.h2h(s.season, x4, b);   // b 2-2
  record(s.season, a, 10, 7, { h2h: s.season.results[a].h2h, divW: 3, divL: 3, confW: 6, confL: 6, pf: 300, pa: 300 });
  record(s.season, b, 10, 7, { h2h: s.season.results[b].h2h, divW: 3, divL: 3, confW: 8, confL: 4, pf: 400, pa: 200 });
  record(s.season, c, 3, 14); record(s.season, d, 2, 15);
  for (const x of [x1, x2, x3, x4]) record(s.season, x, 8, 9, { h2h: s.season.results[x].h2h });
  let rows = St.compute(s.season, s.league, leagueFx.testRng(RTG, 1));
  assert.equal(rows.find((r) => r.teamId === a).divRank, 1, 'common games (4-0 vs 2-2) beat the better conference record');
  assert.equal(rows.find((r) => r.teamId === a).note, 'common games');
  // Only 3 common games → step skipped → conference record decides for b.
  delete s.season.results[a].h2h[x4]; delete s.season.results[b].h2h[x4];
  rows = St.compute(s.season, s.league, leagueFx.testRng(RTG, 1));
  assert.equal(rows.find((r) => r.teamId === b).divRank, 1, 'with < 4 common games, conference record decides');
  assert.equal(rows.find((r) => r.teamId === b).note, 'conference record');
  // Equal conference record → point differential.
  s.season.results[a].confW = 8; s.season.results[a].confL = 4;
  rows = St.compute(s.season, s.league, leagueFx.testRng(RTG, 1));
  assert.equal(rows.find((r) => r.teamId === b).divRank, 1, 'point differential (+200 vs 0)');
  assert.equal(rows.find((r) => r.teamId === b).note, 'point differential');
});

test('nfl division: seeded coin when everything is equal — deterministic per rng, both outcomes reachable', () => {
  const s = emptyNfl();
  const [a, b] = s.div('Frontier', 'East');
  record(s.season, a, 9, 8); record(s.season, b, 9, 8);
  const winners = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const r1 = St.compute(s.season, s.league, leagueFx.testRng(RTG, seed));
    const r2 = St.compute(s.season, s.league, leagueFx.testRng(RTG, seed));
    assert.deepEqual(r1, r2, 'same rng seed → same standings');
    const top = r1.find((r) => r.conf === 'Frontier' && r.div === 'East' && r.divRank === 1);
    assert.equal(top.note, 'coin toss');
    winners.add(top.teamId);
  }
  assert.equal(winners.size, 2, 'coin lands both ways across seeds');
  // The parent rng advances by exactly one draw (the fork).
  const rng = leagueFx.testRng(RTG, 3);
  const probe = leagueFx.testRng(RTG, 3); probe.next();
  St.compute(s.season, s.league, rng);
  assert.equal(rng.state(), probe.state(), 'compute forks once and draws nothing else from the parent');
  // No rng → deterministic hash coin, never throws.
  assert.deepEqual(St.compute(s.season, s.league), St.compute(s.season, s.league));
});

// ─────────────────────────────── NFL wild cards ───────────────────────────────

test('nfl wild card: division winners seeded 1–4 by record, wild cards 5–7, sweep rule and conference record', () => {
  const s = emptyNfl();
  const L = s.league.teams.filter((t) => t.conf === 'Liberty');
  const divs = ['North', 'South', 'East', 'West'].map((d) => s.div('Liberty', d));
  // Division winners with distinct records: West 13-4, North 12-5, South 11-6, East 8-9 (weak division).
  record(s.season, divs[3][0], 13, 4); record(s.season, divs[0][0], 12, 5); record(s.season, divs[1][0], 11, 6); record(s.season, divs[2][0], 8, 9);
  // Wild-card contenders: North#2 10-7, South#2 10-7, West#2 10-7, East#2 7-10 — three-way tie for seeds 5–7.
  const n2 = divs[0][1], s2 = divs[1][1], w2 = divs[3][1];
  // Sweep: s2 beat both n2 and w2; n2 and w2 split nothing (they did not play).
  fx.h2h(s.season, s2, n2, { conf: true }); fx.h2h(s.season, s2, w2, { conf: true });
  record(s.season, n2, 10, 7, { h2h: s.season.results[n2].h2h, confW: 7, confL: 5 });
  record(s.season, s2, 10, 7, { h2h: s.season.results[s2].h2h, confW: 6, confL: 6 });
  record(s.season, w2, 10, 7, { h2h: s.season.results[w2].h2h, confW: 8, confL: 4 });
  for (const t of L) if (!s.season.results[t.id] || (s.season.results[t.id].w + s.season.results[t.id].l) === 0) record(s.season, t.id, 4, 13);
  const rows = St.compute(s.season, s.league, leagueFx.testRng(RTG, 1));
  const seed = (id) => rows.find((r) => r.teamId === id).seed;
  assert.equal(seed(divs[3][0]), 1); assert.equal(seed(divs[0][0]), 2); assert.equal(seed(divs[1][0]), 3);
  assert.equal(seed(divs[2][0]), 4, 'the 8-9 division winner is still seeded 4');
  assert.equal(seed(s2), 5, 'head-to-head sweep takes the first wild card');
  assert.equal(seed(w2), 6, 'then conference record (8-4 over 7-5)');
  assert.equal(seed(n2), 7);
  assert.equal(rows.find((r) => r.teamId === s2).note, 'head-to-head sweep');
  assert.equal(rows.find((r) => r.teamId === w2).note, 'conference record');
  assert.equal(rows.filter((r) => r.conf === 'Liberty' && r.seed).length, 7);
  assert.equal(rows.filter((r) => r.conf === 'Frontier' && r.seed).length, 7);
  assert.deepEqual(rows.filter((r) => r.conf === 'Liberty').map((r) => r.confRank), Array.from({ length: 16 }, (_, i) => i + 1));
});

test('nfl wild card: two-way tie without a game → conference record → common games → point differential → coin', () => {
  const s = emptyNfl();
  const a = s.div('Frontier', 'North')[1], b = s.div('Frontier', 'South')[1];
  for (const t of s.league.teams) record(s.season, t.id, 4, 13);
  for (const d of ['North', 'South', 'East', 'West']) record(s.season, s.div('Frontier', d)[0], 12, 5);
  record(s.season, a, 10, 7, { confW: 7, confL: 5, pf: 350, pa: 300 });
  record(s.season, b, 10, 7, { confW: 7, confL: 5, pf: 340, pa: 300 });
  let rows = St.compute(s.season, s.league, leagueFx.testRng(RTG, 1));
  assert.equal(rows.find((r) => r.teamId === a).seed, 5, 'point differential');
  assert.equal(rows.find((r) => r.teamId === a).note, 'point differential');
  s.season.results[b].confW = 8; s.season.results[b].confL = 4;
  rows = St.compute(s.season, s.league, leagueFx.testRng(RTG, 1));
  assert.equal(rows.find((r) => r.teamId === b).seed, 5, 'conference record beats point differential');
  s.season.results[b].confW = 7; s.season.results[b].confL = 5; s.season.results[b].pf = 350;
  const seen = new Set();
  for (let seed = 1; seed <= 30; seed++) seen.add(St.compute(s.season, s.league, leagueFx.testRng(RTG, seed)).find((r) => r.seed === 5 && r.conf === 'Frontier').teamId);
  assert.equal(seen.size, 2, 'coin decides when all else is equal');
});

test('nfl wild card: same-division teams are ordered by the division tiebreak first', () => {
  const s = emptyNfl();
  const [n1, n2, n3] = s.div('Liberty', 'North');
  const e2 = s.div('Liberty', 'East')[1];
  for (const t of s.league.teams) record(s.season, t.id, 4, 13);
  for (const d of ['North', 'South', 'East', 'West']) record(s.season, s.div('Liberty', d)[0], 13, 4);
  // n2, n3 (same division) and e2 all 10-7. n3 beat n2 (division tiebreak); e2 has the best conference record.
  fx.h2h(s.season, n3, n2, { div: true });
  record(s.season, n2, 10, 7, { h2h: s.season.results[n2].h2h, confW: 9, confL: 3, divW: 2, divL: 4 });
  record(s.season, n3, 10, 7, { h2h: s.season.results[n3].h2h, confW: 6, confL: 6, divW: 4, divL: 2 });
  record(s.season, e2, 10, 7, { confW: 8, confL: 4 });
  const rows = St.compute(s.season, s.league, leagueFx.testRng(RTG, 1));
  const seed = (id) => rows.find((r) => r.teamId === id).seed;
  assert.equal(seed(e2), 5, 'e2 (8-4 conf) beats n3 (6-6), the North representative');
  assert.equal(seed(n3), 6, 'n3 ranks ahead of n2 because it won the division tiebreak');
  assert.equal(seed(n2), 7);
});

test('nfl ties count half a win and show in the record string', () => {
  const s = emptyNfl();
  const [a, b] = s.div('Liberty', 'West');
  record(s.season, a, 9, 7, { t: 1 }); record(s.season, b, 9, 8);
  const rows = St.compute(s.season, s.league, leagueFx.testRng(RTG, 1));
  assert.equal(rows.find((r) => r.teamId === a).divRank, 1);
  assert.equal(St.recordString(rows.find((r) => r.teamId === a)), '9-7-1');
  assert.equal(St.recordString({ w: 10, l: 7, t: 0 }), '10-7');
});

// ─────────────────────────────── recordResult ───────────────────────────────

test('recordResult updates both rows (REG counts conf/div marks, postseason does not)', () => {
  const s = emptyNfl();
  const [a, b] = s.div('Liberty', 'North');
  const c = s.div('Frontier', 'South')[0];
  St.recordResult(s.season, s.league, { id: 'g1', kind: 'REG', homeId: a, awayId: b, played: true, score: { home: 27, away: 20 } });
  St.recordResult(s.season, s.league, { id: 'g2', kind: 'REG', homeId: a, awayId: c, played: true, score: { home: 17, away: 17 } });
  St.recordResult(s.season, s.league, { id: 'g3', kind: 'WC', homeId: a, awayId: b, played: true, score: { home: 10, away: 13 } });
  const ra = s.season.results[a], rb = s.season.results[b], rc = s.season.results[c];
  assert.deepEqual([ra.w, ra.l, ra.t, ra.pf, ra.pa, ra.divW, ra.divL, ra.confW, ra.confL], [1, 1, 1, 54, 50, 1, 0, 1, 0]);
  assert.deepEqual([rb.w, rb.l, rb.divW, rb.divL, rb.confW, rb.confL], [1, 1, 0, 1, 0, 1]);
  assert.deepEqual(ra.h2h[b], [1, 1, 0]); assert.deepEqual(rb.h2h[a], [1, 1, 0]); assert.deepEqual(ra.h2h[c], [0, 0, 1]);
  assert.equal(rc.t, 1); assert.equal(ra.streak, -1); assert.equal(rb.streak, 1);
  assert.throws(() => St.recordResult(s.season, s.league, { id: 'x', homeId: a, awayId: b }));
});

// ─────────────────────────────── college rankings ───────────────────────────────

test('college rankings: §2.6.1 formula, preseason uses prestige/5, weekly score is sticky', () => {
  const R = T.ranking;
  const s = fx.seasonState(RTG, { league: 'COLLEGE', weeks: 0, seed: 3 });
  const pre = s.season.rankings;
  assert.equal(Object.keys(pre).length, 48);
  for (const t of s.league.teams) {
    const p = t.prestige / 5;
    const raw = pre[t.id].score;
    // With no games, score collapses to winW·p + sosW·SOS + prestigeW·p where SOS is the scheduled opponents' prestige/5.
    const opps = s.season.schedule.filter((g) => g.homeId === t.id || g.awayId === t.id).map((g) => (g.homeId === t.id ? g.awayId : g.homeId));
    const sos = opps.reduce((acc, id) => acc + s.league.teams.find((x) => x.id === id).prestige / 5, 0) / opps.length;
    assert.ok(Math.abs(raw - (R.winW * p + R.sosW * sos + R.prestigeW * p)) < 1e-6, `${t.id} preseason score`);
    assert.equal(pre[t.id].prev, pre[t.id].rank, 'preseason prev = own rank');
  }
  const ranks = Object.values(pre).map((r) => r.rank).sort((a, b) => a - b);
  assert.deepEqual(ranks, Array.from({ length: 48 }, (_, i) => i + 1), 'ranks are a permutation of 1..48');
  const best = Object.entries(pre).sort((a, b) => a[1].rank - b[1].rank)[0][0];
  assert.equal(s.league.teams.find((t) => t.id === best).prestige, 5, 'a prestige-5 team is preseason #1');

  // Play two weeks, then verify the formula for every team against the results.
  fx.playWeeks(RTG, s.season, s.league, s.rng, 1, 2);
  const cur = s.season.rankings;
  const prevWeek = St.rankings(s.season, s.league, null);      // not the sticky one, just to get structure
  assert.equal(Object.keys(prevWeek).length, 48);
  const winPct = (id) => { const r = s.season.results[id]; const g = r.w + r.l + r.t; return g ? (r.w + 0.5 * r.t) / g : s.league.teams.find((t) => t.id === id).prestige / 5; };
  // Recompute week 2 from the week-1 rankings and compare.
  const s1 = fx.seasonState(RTG, { league: 'COLLEGE', weeks: 1, seed: 3 });
  const week1 = s1.season.rankings;
  for (const t of s.league.teams) {
    const r = s.season.results[t.id];
    const g = r.w + r.l + r.t;
    let sos = 0, n = 0;
    for (const [opp, h] of Object.entries(r.h2h)) { const k = h[0] + h[1] + h[2]; sos += k * winPct(opp); n += k; }
    sos /= n;
    const margin = Math.max(-1, Math.min(1, (r.pf - r.pa) / g / R.marginDiv));
    const raw = R.winW * winPct(t.id) + R.sosW * sos + R.marginW * margin + R.prestigeW * t.prestige / 5;
    const expected = R.sticky * raw + (1 - R.sticky) * week1[t.id].score;
    assert.ok(Math.abs(cur[t.id].score - expected) < 1e-5, `${t.id} week-2 score ${cur[t.id].score} vs ${expected}`);
    assert.equal(cur[t.id].prev, week1[t.id].rank, 'prev = last week rank');
  }
  // Stickiness: an unbeaten low-prestige team does not jump straight to the top after two wins.
  const top5 = St.topN(cur, 5);
  assert.equal(top5.length, 5);
  assert.ok(top5[0].rank === 1 && top5[4].rank === 5);
});

test('college conference standings: conference record first, then head-to-head, then ranking score', () => {
  const s = fx.seasonState(RTG, { league: 'COLLEGE', weeks: 0, seed: 4 });
  const conf = s.league.teams.filter((t) => t.conf === 'HRT').map((t) => t.id);
  const [a, b, c] = conf;
  for (const id of conf) record(s.season, id, 5, 7, { confW: 2, confL: 5 });
  record(s.season, a, 9, 3, { confW: 6, confL: 1 });          // worse overall than b but better in conference
  record(s.season, b, 11, 1, { confW: 5, confL: 2 });
  record(s.season, c, 7, 5, { confW: 5, confL: 2 });
  fx.h2h(s.season, c, b, { conf: true });
  record(s.season, b, 11, 1, { confW: 5, confL: 2, h2h: s.season.results[b].h2h });
  record(s.season, c, 7, 5, { confW: 5, confL: 2, h2h: s.season.results[c].h2h });
  const rows = St.compute(s.season, s.league, leagueFx.testRng(RTG, 1));
  const cr = (id) => rows.find((r) => r.teamId === id).confRank;
  assert.equal(cr(a), 1, 'conference record wins');
  assert.equal(cr(c), 2, 'head-to-head over b');
  assert.equal(cr(b), 3);
  assert.equal(rows.find((r) => r.teamId === c).note, 'head-to-head');
  assert.equal(rows.find((r) => r.teamId === b).divRank, null);
  assert.equal(rows.find((r) => r.teamId === b).pollRank, s.season.rankings[b].rank);
  // Ranking score tiebreak: two teams 5-2 in conference with no game between them.
  const d = conf[3], e = conf[4];
  record(s.season, d, 8, 4, { confW: 5, confL: 2 }); record(s.season, e, 8, 4, { confW: 5, confL: 2 });
  s.season.rankings[d].score = 0.9; s.season.rankings[e].score = 0.2;
  const rows2 = St.compute(s.season, s.league, leagueFx.testRng(RTG, 1));
  assert.ok(rows2.find((r) => r.teamId === d).confRank < rows2.find((r) => r.teamId === e).confRank);
  assert.equal(rows2.find((r) => r.teamId === d).note, 'ranking');
});

test('conferenceChampionshipGames: six week-13 CCG games, confRank 1 hosts confRank 2', () => {
  const s = fx.fullRegularSeason(RTG, { league: 'COLLEGE', seed: 5 });
  const games = St.conferenceChampionshipGames(s.season, s.league, s.rng);
  assert.equal(games.length, 6);
  const byId = Object.fromEntries(s.league.teams.map((t) => [t.id, t]));
  for (const g of games) {
    assert.equal(g.kind, 'CCG'); assert.equal(g.week, T.college.ccgWeek); assert.equal(g.played, false);
    assert.equal(g.venue, g.homeId);
    assert.equal(byId[g.homeId].conf, byId[g.awayId].conf); assert.equal(g.ccgConf, byId[g.homeId].conf);
    const rows = s.season.standings;
    assert.equal(rows.find((r) => r.teamId === g.homeId).confRank, 1);
    assert.equal(rows.find((r) => r.teamId === g.awayId).confRank, 2);
    assert.match(g.id, /^C1-w13-CCG-[A-Z]{3}-[A-Z]{3}-[A-Z]{3}$/);
  }
});

// ─────────────────────────────── college playoff ───────────────────────────────

/** A finished college regular season with CCGs played and rankings forced to a chosen order. */
function collegeWithChampions(seed, rankOrderFn) {
  const s = fx.fullRegularSeason(RTG, { league: 'COLLEGE', seed });
  const ccg = St.conferenceChampionshipGames(s.season, s.league, s.rng);
  for (const g of ccg) { s.season.schedule.push(g); fx.playGame(RTG, s.season, s.league, g, s.rng); }
  fx.refresh(RTG, s.season, s.league, s.rng);
  const champs = {};
  for (const g of ccg) champs[g.ccgConf] = g.score.home > g.score.away ? g.homeId : g.awayId;
  s.champs = champs;
  if (rankOrderFn) {
    const order = rankOrderFn(s);
    order.forEach((id, i) => { s.season.rankings[id].rank = i + 1; s.season.rankings[id].score = 1 - i / 100; });
  }
  return s;
}

test('playoffField: 5 champions auto-qualify, 7 at-large by rank, the 6th champion is eligible as an at-large', () => {
  // Force a poll: champions of 5 conferences ranked 1..5, the 6th champion ranked 8th (in as at-large).
  const s = collegeWithChampions(6, (st) => {
    const champIds = Object.values(st.champs);
    const others = st.league.teams.map((t) => t.id).filter((id) => !champIds.includes(id));
    return champIds.slice(0, 5).concat(others.slice(0, 2), [champIds[5]], others.slice(2));
  });
  const b = St.playoffField(s.season, s.league, s.rng);
  const champIds = Object.values(s.champs);
  assert.equal(b.league, 'COLLEGE'); assert.equal(b.seeds.length, 12); assert.equal(b.roundIdx, 0);
  assert.deepEqual(b.seeds.slice(0, 4).map((x) => x.teamId), champIds.slice(0, 4), 'seeds 1–4 = four highest-ranked champions');
  assert.deepEqual(b.byes, champIds.slice(0, 4));
  assert.ok(b.seeds.slice(0, 5).every((x) => x.autoBid && x.champion));
  const sixth = b.seeds.find((x) => x.teamId === champIds[5]);
  assert.ok(sixth, '6th champion is in the field');
  assert.equal(sixth.autoBid, false, '…as an at-large');
  assert.equal(sixth.champion, true);
  assert.equal(sixth.seed, 8, 'seeded by poll rank among the non-bye seeds (5th champ #5, two at-large #6/#7, then #8)');
  for (let i = 4; i < 12; i++) assert.ok(b.seeds[i].rank < (b.seeds[i + 1] ? b.seeds[i + 1].rank : 999), 'seeds 5–12 in poll order');
  assert.equal(b.seeds.filter((x) => !x.autoBid).length, 7, '7 at-large');
  // First round: 5v12, 6v11, 7v10, 8v9 at the higher seed, week 14.
  const r0 = b.rounds[0];
  assert.deepEqual(r0.games.map((m) => [m.homeSeed, m.awaySeed]), [[5, 12], [6, 11], [7, 10], [8, 9]]);
  assert.ok(r0.games.every((m) => m.venue.type === 'HOME' && m.venue.hostTeamId === m.homeId && m.week === T.college.playoffWeeks[0]));
  assert.deepEqual(b.rounds.map((r) => r.week), T.college.playoffWeeks);
  assert.equal(b.rounds[3].kind, 'CHAMP'); assert.equal(b.venues.title.name, T.college.titleGameName);
  assert.deepEqual(JSON.parse(JSON.stringify(b)), b, 'bracket is JSON-serialisable');
});

test('playoffField: a low-ranked 6th champion is left out', () => {
  const s = collegeWithChampions(7, (st) => {
    const champIds = Object.values(st.champs);
    const others = st.league.teams.map((t) => t.id).filter((id) => !champIds.includes(id));
    return champIds.slice(0, 5).concat(others, [champIds[5]]);       // 6th champ ranked dead last
  });
  const b = St.playoffField(s.season, s.league, s.rng);
  const champIds = Object.values(s.champs);
  assert.ok(!b.seeds.some((x) => x.teamId === champIds[5]), '6th champion not in the field');
  assert.equal(b.seeds.filter((x) => x.autoBid).length, 5);
  assert.equal(b.seeds.filter((x) => x.champion).length, 5);
  assert.equal(new Set(b.seeds.map((x) => x.teamId)).size, 12);
});

test('advanceBracket (college): fixed bracket 1v(8/9) … 4v(5/12), bowl venues, champion crowned, exit rounds', () => {
  const s = collegeWithChampions(8);
  const b = St.playoffField(s.season, s.league, s.rng);
  const games0 = St.roundGames(b, 0, s.league);
  assert.equal(games0.length, 4);
  for (const g of games0) { assert.equal(g.kind, 'PLAYOFF'); assert.equal(g.week, 14); assert.equal(g.venue, g.homeId); assert.equal(g.played, false); }
  // Upsets everywhere: the lower seed wins every first-round game.
  const results = {};
  for (const m of b.rounds[0].games) results[m.id] = { home: 10, away: 20 };
  St.advanceBracket(b, results, s.league);
  assert.equal(b.roundIdx, 1); assert.equal(b.rounds[0].complete, true);
  const seedOf = (id) => b.seeds.find((x) => x.teamId === id);
  for (const m of b.rounds[0].games) { assert.equal(m.winnerId, m.awayId); assert.equal(seedOf(m.homeId).alive, false); assert.equal(seedOf(m.homeId).exitRound, 'FIRST'); }
  const qf = b.rounds[1].games;
  assert.deepEqual(qf.map((m) => [m.homeSeed, m.awaySeed]), [[1, 9], [2, 10], [3, 11], [4, 12]], 'QF pairings with all upsets');
  assert.ok(qf.every((m) => m.venue.type === 'BOWL' && m.venue.site && m.venue.site.id), 'quarterfinals at major bowls');
  assert.equal(new Set(qf.map((m) => m.venue.id)).size, 4, 'four different major bowls');
  const qfGames = St.roundGames(b, 1, s.league);
  assert.ok(qfGames.every((g) => g.neutral === true && g.venue === g.site.id && g.week === 15));
  // Favourites win the rest of the way — feed results as schedule-style Game objects.
  const play = () => St.roundGames(b, b.roundIdx, s.league).map((g) => Object.assign(g, { played: true, score: { home: 30, away: 3 } }));
  St.advanceBracket(b, play(), s.league);
  assert.deepEqual(b.rounds[2].games.map((m) => [m.homeSeed, m.awaySeed]), [[1, 4], [2, 3]], 'semifinals');
  St.advanceBracket(b, play(), s.league);
  assert.deepEqual(b.rounds[3].games.map((m) => [m.homeSeed, m.awaySeed]), [[1, 2]]);
  assert.equal(b.rounds[3].games[0].venue.name, T.college.titleGameName);
  assert.equal(St.roundGames(b, 3, s.league)[0].kind, 'CHAMP');
  St.advanceBracket(b, play(), s.league);
  assert.equal(b.complete, true);
  assert.equal(b.championId, b.seeds[0].teamId);
  assert.equal(seedOf(b.championId).exitRound, null);
  assert.equal(seedOf(b.seeds[1].teamId).exitRound, 'TITLE');
  assert.equal(b.seeds.filter((x) => x.alive).length, 1);
  assert.equal(St.advanceBracket(b, {}, s.league), b, 'advancing a complete bracket is a no-op');
  // Partial results do not advance the round.
  const b2 = St.playoffField(s.season, s.league, s.rng);
  St.advanceBracket(b2, { [b2.rounds[0].games[0].id]: { home: 21, away: 7 } }, s.league);
  assert.equal(b2.roundIdx, 0); assert.equal(b2.rounds[0].games[0].winnerId, b2.rounds[0].games[0].homeId);
  assert.equal(St.bracketGameFor(b2, b2.rounds[0].games[1].homeId).id, b2.rounds[0].games[1].id);
  assert.equal(St.bracketGameFor(b2, b2.rounds[0].games[0].homeId), null, 'already played this round');
});

test('bowls: ≥ 6 wins, not in the playoff, paired across conferences into the minor bowls, week 14', () => {
  const byConf = Object.fromEntries(RTG.Data.colleges.map((t) => [t.id, t.conf]));
  let total = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const s = collegeWithChampions(100 + seed);
    s.season.playoffs = St.playoffField(s.season, s.league, s.rng);
    const inPlayoff = new Set(s.season.playoffs.seeds.map((x) => x.teamId));
    const bowls = St.bowls(s.season, s.league, s.rng);
    total += bowls.length;
    assert.ok(bowls.length <= T.college.minorBowls);
    const used = new Set();
    for (const g of bowls) {
      assert.notEqual(byConf[g.homeId], byConf[g.awayId], `bowl ${g.bowlId} pairs different conferences`);
      assert.ok(!inPlayoff.has(g.homeId) && !inPlayoff.has(g.awayId), 'no playoff teams in bowls');
      assert.ok(s.season.results[g.homeId].w >= T.college.bowlMinWins && s.season.results[g.awayId].w >= T.college.bowlMinWins);
      assert.ok(!used.has(g.homeId) && !used.has(g.awayId), 'a team plays one bowl'); used.add(g.homeId); used.add(g.awayId);
      assert.equal(g.kind, 'BOWL'); assert.equal(g.week, T.college.bowlWeek); assert.equal(g.played, false);
      assert.equal(g.neutral, true); assert.equal(g.venue, g.bowlId); assert.ok(g.site && g.site.climate);
      assert.ok(RTG.Data.bowls.find((b) => b.id === g.bowlId && b.tier === 'minor'), 'a named minor bowl');
      assert.ok(g.homeRank <= g.awayRank, 'higher-ranked team listed first');
      assert.match(g.id, /^C1-w14-BOWL-[a-z]+-[A-Z]{3}-[A-Z]{3}$/);
    }
    assert.equal(new Set(bowls.map((g) => g.bowlId)).size, bowls.length, 'each bowl used once');
    // Best eligible pairing gets the first bowl in data order.
    if (bowls.length) assert.equal(bowls[0].bowlId, RTG.Data.bowls.filter((b) => b.tier === 'minor')[0].id);
    // Without season.playoffs set, the field is selected on the fly and the result is identical.
    s.season.playoffs = null;
    assert.deepEqual(St.bowls(s.season, s.league, s.rng), bowls);
  }
  assert.ok(total / 20 >= 4, 'a typical season produces several bowls');
});

test('full college postseason via fixtures produces a champion and validates', () => {
  const s = fx.fullRegularSeason(RTG, { league: 'COLLEGE', seed: 21 });
  const out = fx.playCollegePostseason(RTG, s);
  assert.ok(out.bracket.complete && out.bracket.championId);
  assert.equal(s.season.schedule.filter((g) => g.kind === 'CCG').length, 6);
  assert.equal(s.season.schedule.filter((g) => g.kind === 'PLAYOFF').length, 10);
  assert.equal(s.season.schedule.filter((g) => g.kind === 'CHAMP').length, 1);
  assert.equal(new Set(s.season.schedule.map((g) => g.id)).size, s.season.schedule.length, 'unique game ids');
  assert.deepEqual(JSON.parse(JSON.stringify(s.season)), s.season);
});

// ─────────────────────────────── NFL playoff ───────────────────────────────

test('nflPlayoffField + advanceBracket: 7 per conference, seed 1 bye, 2v7/3v6/4v5, re-seeding, Championship Bowl', () => {
  const s = fx.fullRegularSeason(RTG, { league: 'NFL', seed: 31 });
  const b = St.nflPlayoffField(s.season, s.league, s.rng);
  assert.equal(b.league, 'NFL'); assert.equal(b.seeds.length, 14);
  for (const conf of ['Liberty', 'Frontier']) {
    const cs = b.seeds.filter((x) => x.conf === conf).sort((x, y) => x.seed - y.seed);
    assert.deepEqual(cs.map((x) => x.seed), [1, 2, 3, 4, 5, 6, 7]);
    assert.ok(cs.slice(0, 4).every((x) => x.champion), 'seeds 1–4 are division winners');
    assert.ok(cs.slice(4).every((x) => !x.champion), 'seeds 5–7 are wild cards');
    assert.ok(b.byes.includes(cs[0].teamId));
    const wc = b.rounds[0].games.filter((m) => m.conf === conf);
    assert.deepEqual(wc.map((m) => [m.homeSeed, m.awaySeed]), [[2, 7], [3, 6], [4, 5]]);
    assert.ok(wc.every((m) => m.venue.type === 'HOME' && m.venue.hostTeamId === m.homeId));
  }
  assert.deepEqual(b.rounds.map((r) => [r.name, r.week, r.kind]), [['WC', 19, 'WC'], ['DIV', 20, 'DIV'], ['CONF', 21, 'CONF'], ['CHAMP', 22, 'CHAMP']]);
  assert.equal(b.venues.champ.name, RTG.Data.nflStructure.championshipName);
  assert.equal(b.venues.champ.site.city, RTG.Data.championshipHosts[s.season.year % 10].city);
  const games0 = St.roundGames(b, 0, s.league);
  assert.equal(games0.length, 6);
  assert.ok(games0.every((g) => g.kind === 'WC' && g.week === 19 && g.venue === g.homeId && !g.neutral));
  assert.match(games0[0].id, /^N1-w19-WC-[A-Z]{2,3}-[A-Z]{2,3}$/);
  // Wild card: 7 upsets 2, 6 upsets 3, 4 beats 5 in both conferences → Divisional: 1 vs 7 (lowest remaining), 4 vs 6.
  const res = {};
  for (const m of b.rounds[0].games) res[m.id] = m.homeSeed === 4 ? { home: 24, away: 10 } : { home: 10, away: 24 };
  St.advanceBracket(b, res, s.league);
  assert.equal(b.roundIdx, 1);
  for (const conf of ['Liberty', 'Frontier']) {
    const dv = b.rounds[1].games.filter((m) => m.conf === conf);
    assert.deepEqual(dv.map((m) => [m.homeSeed, m.awaySeed]), [[1, 7], [4, 6]], `${conf} divisional round re-seeded`);
    assert.ok(dv.every((m) => m.venue.hostTeamId === m.homeId), 'higher seed hosts');
    const seed2 = b.seeds.find((x) => x.conf === conf && x.seed === 2);
    assert.equal(seed2.alive, false); assert.equal(seed2.exitRound, 'WC');
  }
  assert.ok(St.roundGames(b, 1, s.league).every((g) => g.kind === 'DIV' && g.week === 20));
  // Divisional: higher seeds win → Conference: 1 vs 4.
  const fav = () => { const r = {}; for (const m of b.rounds[b.roundIdx].games) r[m.id] = m.homeId; return r; };
  St.advanceBracket(b, fav(), s.league);
  for (const conf of ['Liberty', 'Frontier']) assert.deepEqual(b.rounds[2].games.filter((m) => m.conf === conf).map((m) => [m.homeSeed, m.awaySeed]), [[1, 4]]);
  St.advanceBracket(b, fav(), s.league);
  const final = b.rounds[3].games;
  assert.equal(final.length, 1);
  assert.equal(final[0].venue.type, 'NEUTRAL'); assert.equal(final[0].conf, null);
  assert.notEqual(b.seeds.find((x) => x.teamId === final[0].homeId).conf, b.seeds.find((x) => x.teamId === final[0].awayId).conf, 'one finalist per conference');
  const fg = St.roundGames(b, 3, s.league)[0];
  assert.equal(fg.kind, 'CHAMP'); assert.equal(fg.week, 22); assert.equal(fg.neutral, true); assert.equal(fg.venueName, RTG.Data.nflStructure.championshipName);
  St.advanceBracket(b, { [final[0].id]: final[0].awayId }, s.league);
  assert.equal(b.complete, true); assert.equal(b.championId, final[0].awayId);
  assert.equal(b.seeds.find((x) => x.teamId === final[0].homeId).exitRound, 'CHAMP');
  assert.equal(St.aliveTeams(b).length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(b)), b);
});

test('nfl bracket matches the standings seeds and works without a league argument (Data lookup)', () => {
  const s = fx.fullRegularSeason(RTG, { league: 'NFL', seed: 32 });
  const b = St.nflPlayoffField(s.season, s.league);
  for (const x of b.seeds) {
    const row = s.season.standings.find((r) => r.teamId === x.teamId);
    assert.equal(row.seed, x.seed); assert.equal(row.conf, x.conf); assert.equal(row.divChamp, x.champion);
  }
  const g = St.roundGames(b, 0);
  assert.equal(g.length, 6);
  const res = {}; for (const m of b.rounds[0].games) res[m.id] = m.homeId;
  St.advanceBracket(b, res);
  assert.equal(b.rounds[1].games.length, 4);
});

// ─────────────────────────────── draft order ───────────────────────────────

test('draftOrder: worst record first (point differential, then coin), playoff teams by exit round, champion last', () => {
  const s = fx.fullRegularSeason(RTG, { league: 'NFL', seed: 41 });
  const b = fx.playNflPostseason(RTG, s);
  const order = St.draftOrder(s.season, s.league, leagueFx.testRng(RTG, 1));
  assert.equal(order.length, 32); assert.equal(new Set(order).size, 32);
  const playoff = new Set(b.seeds.map((x) => x.teamId));
  const pctOf = (id) => { const r = s.season.results[id]; return (r.w + 0.5 * r.t) / (r.w + r.l + r.t); };
  const nonPlayoff = order.slice(0, 18), post = order.slice(18);
  assert.ok(nonPlayoff.every((id) => !playoff.has(id)), 'first 18 picks are the non-playoff teams');
  for (let i = 1; i < nonPlayoff.length; i++) {
    const a = nonPlayoff[i - 1], c = nonPlayoff[i];
    const pa = pctOf(a), pc = pctOf(c);
    assert.ok(pa < pc + 1e-9, 'non-descending record');
    if (Math.abs(pa - pc) < 1e-9) {
      const da = s.season.results[a].pf - s.season.results[a].pa, dc = s.season.results[c].pf - s.season.results[c].pa;
      assert.ok(da <= dc, 'ties by point differential');
    }
  }
  const roundIdx = { WC: 0, DIV: 1, CONF: 2, CHAMP: 3 };
  const exitOf = (id) => { const x = b.seeds.find((y) => y.teamId === id); return x.teamId === b.championId ? 4 : roundIdx[x.exitRound]; };
  for (let i = 1; i < post.length; i++) assert.ok(exitOf(post[i - 1]) <= exitOf(post[i]), 'playoff teams ordered by exit round');
  assert.equal(post.slice(0, 6).filter((id) => exitOf(id) === 0).length, 6, 'six wild-card losers first');
  assert.equal(order[31], b.championId, 'champion picks last');
  assert.equal(exitOf(order[30]), 3, 'runner-up picks 31st');
  // Deterministic for a seed; independent of standings order; a bracket-less season still orders by record.
  assert.deepEqual(St.draftOrder(s.season, s.league, leagueFx.testRng(RTG, 1)), order);
  s.season.playoffs = null;
  const plain = St.draftOrder(s.season, s.league);
  for (let i = 1; i < plain.length; i++) assert.ok(pctOf(plain[i - 1]) <= pctOf(plain[i]) + 1e-9);
});

test('draftOrder coin: equal records and point differential are split by the seeded coin', () => {
  const s = emptyNfl();
  const [a, b] = s.div('Liberty', 'North');
  for (const t of s.league.teams) record(s.season, t.id, 9, 8, { pf: 350, pa: 300 });
  record(s.season, a, 2, 15, { pf: 200, pa: 400 }); record(s.season, b, 2, 15, { pf: 210, pa: 410 });
  const firsts = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const o = St.draftOrder(s.season, s.league, leagueFx.testRng(RTG, seed));
    assert.ok([a, b].includes(o[0]) && [a, b].includes(o[1]));
    firsts.add(o[0]);
  }
  assert.equal(firsts.size, 2);
});

// ─────────────────────────────── misc ───────────────────────────────

test('compute rows are complete, JSON-safe and grouped by conference', () => {
  const s = fx.seasonState(RTG, { league: 'NFL', weeks: 9, seed: 51 });
  const rows = s.season.standings;
  assert.equal(rows.length, 32);
  assert.deepEqual(JSON.parse(JSON.stringify(rows)), rows);
  for (const r of rows) {
    for (const k of ['teamId', 'conf', 'div', 'w', 'l', 't', 'pct', 'pf', 'pa', 'diff', 'confW', 'confL', 'divW', 'divL', 'streak', 'rank', 'confRank', 'divRank', 'divChamp', 'seed', 'note']) assert.ok(k in r, `row has ${k}`);
    assert.ok(Number.isFinite(r.pct) && r.rank >= 1 && r.rank <= 32);
    assert.equal(r.w + r.l + r.t, 9 - (s.season.schedule.some((g) => g.week <= 9 && !g.played && (g.homeId === r.teamId || g.awayId === r.teamId)) ? 1 : 0) - (RTG.Schedule.teamGames(s.season.schedule, r.teamId).filter((g) => g.week <= 9).length === 8 ? 1 : 0));
  }
  assert.deepEqual(rows.map((r) => r.rank).sort((x, y) => x - y), Array.from({ length: 32 }, (_, i) => i + 1));
  assert.deepEqual(St.rowsIn(rows, 'Liberty').map((r) => r.confRank), Array.from({ length: 16 }, (_, i) => i + 1));
  assert.deepEqual(St.rowsIn(rows, 'Liberty', 'North').map((r) => r.divRank), [1, 2, 3, 4]);
  // rows[0..15] are Liberty in confRank order (data order of conferences).
  assert.ok(rows.slice(0, 16).every((r) => r.conf === 'Liberty'));
  const c = fx.seasonState(RTG, { league: 'COLLEGE', weeks: 6, seed: 52 }).season.standings;
  assert.equal(c.length, 48);
  assert.ok(c.every((r) => r.divRank === null && r.seed === null && typeof r.pollRank === 'number'));
});
