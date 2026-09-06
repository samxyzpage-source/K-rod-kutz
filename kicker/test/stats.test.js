/**
 * RTG.Stats — kick bookkeeping, kick-log cap, splits, grades, moments, records, milestones (§3.5.12, §2.8, §2.9).
 *   node kicker/test/stats.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RTG = require('./load')();
/** deep-equal that ignores realm prototypes (engine objects live in a vm context). */
const deq = (a, b, msg) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg);
const fx = require('./fixtures/stats');
const Stats = RTG.Stats, Tuning = RTG.Tuning, Schema = RTG.Schema;

/** Record one kick described by `o` and return the row. */
function rec(state, o, meta) {
  const k = fx.kick(RTG, state, o);
  return Stats.recordKick(state, k.ctx, k.result, meta);
}

test('bucketOf boundaries', () => {
  assert.equal(Stats.bucketOf(17), '0-29');
  assert.equal(Stats.bucketOf(29), '0-29');
  assert.equal(Stats.bucketOf(30), '30-39');
  assert.equal(Stats.bucketOf(39.9), '30-39');
  assert.equal(Stats.bucketOf(40), '40-49');
  assert.equal(Stats.bucketOf(49), '40-49');
  assert.equal(Stats.bucketOf(50), '50-59');
  assert.equal(Stats.bucketOf(59), '50-59');
  assert.equal(Stats.bucketOf(60), '60+');
  assert.equal(Stats.bucketOf(71), '60+');
});

test('recordKick: FG make updates attempts, makes, points, bucket, long, streaks on season/career/league', () => {
  const s = fx.cleanCollege(RTG);
  const row = rec(s, { distance: 47, outcome: 'GOOD' });
  for (const st of [s.stats.season, s.stats.career, s.stats.college]) {
    assert.equal(st.fga, 1); assert.equal(st.fgm, 1); assert.equal(st.pts, Tuning.kick.points.FG); assert.equal(st.long, 47);
    deq(st.buckets['40-49'], { a: 1, m: 1 });
    assert.equal(st.consecutive, 1); assert.equal(st.bestConsecutive, 1);
    assert.equal(st.made50plus, 0);
  }
  assert.equal(s.stats.nfl.fga, 0, 'the other league is untouched');
  assert.equal(s.player.makeStreak, 1); assert.equal(s.player.missStreak, 0);
  assert.equal(row.type, 'FG'); assert.equal(row.distance, 47); assert.equal(row.made, true);
  assert.equal(row.year, s.year); assert.equal(row.week, s.week); assert.equal(row.teamId, s.player.teamId);
  assert.equal(s.stats.kicks.length, 1);
  assert.ok(Schema.validate(s).ok, Schema.validate(s).errors.join('; '));
});

test('recordKick: 50+ counts, misses by side/short/blocked/doink, streak reset, PAT', () => {
  const s = fx.cleanCollege(RTG);
  rec(s, { distance: 52, outcome: 'GOOD', tags: ['fiftyPlus'] });
  rec(s, { distance: 33, outcome: 'GOOD' });
  rec(s, { distance: 41, outcome: 'WIDE_L' });
  rec(s, { distance: 45, outcome: 'WIDE_R' });
  rec(s, { distance: 58, outcome: 'SHORT' });
  rec(s, { distance: 38, outcome: 'BLOCKED' });
  rec(s, { distance: 44, outcome: 'DOINK_OUT' });
  rec(s, { distance: 49, outcome: 'DOINK_IN' });
  rec(s, { distance: 36, outcome: 'XBAR_IN' });
  rec(s, { type: 'PAT', outcome: 'GOOD' });
  rec(s, { type: 'PAT', outcome: 'WIDE_R' });
  const st = s.stats.season;
  assert.equal(st.fga, 9); assert.equal(st.fgm, 4);
  assert.equal(st.made50plus, 1);
  assert.equal(st.wideL, 1); assert.equal(st.wideR, 2, 'wideR counts the PAT miss too'); assert.equal(st.short, 1); assert.equal(st.blocked, 1);
  assert.equal(st.doinks, 3); assert.equal(st.doinkIn, 2);
  assert.equal(st.pat, 2); assert.equal(st.patMade, 1);
  assert.equal(st.pts, 4 * 3 + 1);
  assert.equal(st.long, 52);
  assert.equal(st.bestConsecutive, 2, 'the two opening makes');
  assert.equal(st.consecutive, 2, 'the two doink-ins at the end');
  deq(st.buckets['50-59'], { a: 2, m: 1 });
  assert.equal(s.player.missStreak, 0, 'PAT miss does not touch the FG streaks');
  assert.equal(s.player.makeStreak, 2);
  // a miss resets the make streak
  rec(s, { distance: 40, outcome: 'WIDE_L' });
  assert.equal(s.player.makeStreak, 0); assert.equal(s.player.missStreak, 1); assert.equal(s.stats.season.consecutive, 0);
});

test('recordKick: clutch / decisive counters, game-winners, tie-forcers, clutchBest and decisiveMakeWeeks', () => {
  const s = fx.cleanCollege(RTG);
  rec(s, { distance: 44, outcome: 'GOOD', pressure: 0.75, tags: ['clutch', 'decisive', 'gameWinner'], decisive: true, week: 5 });
  rec(s, { distance: 30, outcome: 'WIDE_L', pressure: 0.9, tags: ['clutch', 'decisive'], decisive: true });
  rec(s, { distance: 25, outcome: 'GOOD', pressure: 0.2 });
  rec(s, { distance: 35, outcome: 'GOOD', pressure: 0.65, tags: ['clutch', 'decisive', 'tieForcer'], decisive: true });
  const st = s.stats.season;
  assert.equal(st.clutchA, 3); assert.equal(st.clutchM, 2);
  assert.equal(st.decisiveA, 3); assert.equal(st.decisiveM, 2);
  assert.equal(st.gameWinners, 1); assert.equal(st.tieForcers, 1);
  assert.equal(st.clutchBest, 33); assert.equal(st.clutchBestDist, 44);
  deq(st.decisiveMakeWeeks, [5]);
  // pressure alone (≥ clutchThreshold) marks a clutch attempt even without the tag
  rec(s, { distance: 40, outcome: 'GOOD', pressure: Tuning.kick.pressure.clutchThreshold });
  assert.equal(s.stats.season.clutchA, 4);
});

test('recordKick: kickoffs only touch the KO counters and return null', () => {
  const s = fx.cleanCollege(RTG);
  const k = fx.kick(RTG, s, {});
  k.ctx.type = 'KO';
  const r1 = Stats.recordKick(s, k.ctx, { type: 'KO', outcome: 'TOUCHBACK', touchback: true, made: true, tags: [] });
  const r2 = Stats.recordKick(s, k.ctx, { type: 'KO', outcome: 'RETURN', touchback: false, made: false, tags: [] });
  assert.equal(r1, null); assert.equal(r2, null);
  assert.equal(s.stats.season.koCount, 2); assert.equal(s.stats.season.koTouchbacks, 1);
  assert.equal(s.stats.season.fga, 0); assert.equal(s.stats.kicks.length, 0);
});

test('recordKick: ICE_VEINS is earned at 3 game-winners in a season', () => {
  const s = fx.cleanCollege(RTG);
  s.player.traits = [];
  for (let i = 0; i < Tuning.progression.traits.iceVeinsGwPerSeason; i++) rec(s, { distance: 40, outcome: 'GOOD', tags: ['decisive', 'gameWinner'], decisive: true });
  assert.ok(s.player.traits.indexOf('ICE_VEINS') >= 0);
});

test('kick-log cap: rows beyond Tuning.save.kickLogCap are archived; totals and splits stay exact', () => {
  const s = fx.cleanCollege(RTG);
  const cap = Tuning.save.kickLogCap;
  const n = cap + 50;
  for (let i = 0; i < n; i++) rec(s, { distance: 25 + (i % 40), outcome: i % 5 === 4 ? 'WIDE_L' : 'GOOD', weather: i % 3 ? 'clear' : 'rain', hash: (i % 3) - 1, pressure: (i % 10) / 10 });
  assert.equal(s.stats.kicks.length, cap);
  assert.equal(s.stats.career.fga, n, 'career totals are exact');
  assert.equal(s.stats.archived.n, 50);
  const ids = new Set(s.stats.kicks.map((r) => r.id));
  assert.equal(ids.size, cap, 'row ids stay unique');
  const sum = (m) => Object.keys(m).reduce((t, k) => t + m[k].a, 0);
  const sumM = (m) => Object.keys(m).reduce((t, k) => t + m[k].m, 0);
  assert.equal(sum(s.stats.splits.byBucket), n);
  assert.equal(sumM(s.stats.splits.byBucket), s.stats.career.fgm);
  assert.equal(sum(s.stats.splits.byWeather), n);
  assert.equal(sum(s.stats.splits.byHash), n);
  assert.equal(sum(s.stats.splits.byPressure), n);
  assert.ok(s.stats.splits.byHash.L.a > 0 && s.stats.splits.byHash.R.a > 0 && s.stats.splits.byHash.M.a > 0);
  assert.ok(s.stats.splits.byPressure.calm.a > 0 && s.stats.splits.byPressure.tense.a > 0 && s.stats.splits.byPressure.clutch.a > 0);
  // rebuild reproduces the incremental splits exactly
  const before = JSON.stringify(s.stats.splits);
  Stats.rebuildSplits(s);
  assert.equal(JSON.stringify(s.stats.splits), before);
  assert.ok(Schema.validate(s).ok, Schema.validate(s).errors.join('; '));
});

test('recordAiKick creates the team entry on demand and mirrors applyKick', () => {
  const s = fx.cleanCollege(RTG);
  const k = fx.kick(RTG, s, { distance: 51, outcome: 'GOOD', tags: ['fiftyPlus'] });
  k.ctx.isUser = false;
  Stats.recordAiKick(s.season, 'COA5', k.ctx, k.result);
  const k2 = fx.kick(RTG, s, { distance: 33, outcome: 'BLOCKED' });
  Stats.recordAiKick(s.season, 'COA5', k2.ctx, k2.result);
  const ai = s.season.kickerStats.COA5;
  assert.equal(ai.fga, 2); assert.equal(ai.fgm, 1); assert.equal(ai.long, 51); assert.equal(ai.made50plus, 1); assert.equal(ai.blocked, 1);
  assert.equal(s.stats.season.fga, 0, 'the user is untouched');
  assert.ok(Schema.validate(s).ok);
});

test('recordGame increments games / starts / wins / losses on every level', () => {
  const s = fx.cleanCollege(RTG);
  Stats.recordGame(s, { won: true, userLine: { fga: 2, fgm: 2, pat: 3, patMade: 3 } });
  Stats.recordGame(s, { won: false, userLine: { fga: 1, fgm: 0, pat: 0, patMade: 0 } });
  Stats.recordGame(s, { won: false, tied: true, started: false, userLine: {} });
  for (const st of [s.stats.season, s.stats.career, s.stats.college]) {
    assert.equal(st.games, 3); assert.equal(st.gamesStarted, 2); assert.equal(st.wins, 1); assert.equal(st.losses, 1);
  }
  assert.equal(s.player.gamesPlayed, 3);
});

test('grade table: A needs 100 % with ≥ 2 FGA or a GW; B ≥ 85; C ≥ 70; D ≥ 50; F; decisive miss caps at D', () => {
  const G = Tuning.stats.grade;
  assert.equal(Stats.grade({ userLine: { fga: 2, fgm: 2 } }), 'A');
  assert.equal(Stats.grade({ userLine: { fga: 1, fgm: 1, gw: 1 } }), 'A');
  assert.equal(Stats.grade({ userLine: { fga: 1, fgm: 1 } }), 'B', '1/1 without a GW is not an A');
  assert.equal(Stats.grade({ userLine: { fga: 0, fgm: 0, pat: 4, patMade: 4 } }), 'B', 'PAT-only perfect day');
  assert.equal(Stats.grade({ userLine: { fga: 7, fgm: 6 } }), 'B');      // 0.857
  assert.equal(Stats.grade({ userLine: { fga: 4, fgm: 3 } }), 'C');      // 0.75
  assert.equal(Stats.grade({ userLine: { fga: 2, fgm: 1 } }), 'D');      // 0.5
  assert.equal(Stats.grade({ userLine: { fga: 3, fgm: 1 } }), 'F');      // 0.33
  assert.equal(Stats.grade({ userLine: { fga: 2, fgm: 2 }, decisiveMiss: true }), G.decisiveMissCap);
  assert.equal(Stats.grade({ userLine: { fga: 3, fgm: 2 }, kicks: [{ made: false, tags: ['decisive'] }] }), 'D', 'decisive miss detected from the kick rows');
  assert.equal(Stats.grade({ userLine: { fga: 3, fgm: 1 }, decisiveMiss: true }), 'F', 'the cap never lifts a grade');
});

test('topMoments orders by score, keeps ≤ momentsCap, and the score formula holds', () => {
  const s = fx.cleanCollege(RTG);
  const M = Tuning.hof.moments;
  const gw = fx.kick(RTG, s, { distance: 55, outcome: 'GOOD', pressure: 1.0, tags: ['clutch', 'decisive', 'gameWinner', 'playoff'], decisive: true, playoff: true });
  assert.equal(Stats.momentScore(gw.ctx, gw.result), 55 + M.decisive + M.playoff);
  const miss = fx.kick(RTG, s, { distance: 50, outcome: 'DOINK_OUT', pressure: 0.8, tags: ['decisive'], decisive: true });
  assert.equal(Stats.momentScore(miss.ctx, miss.result), RTG.Util.round1(0.8 * 50 * M.missMult + M.decisive + M.doink));
  for (let i = 0; i < Tuning.save.momentsCap + 20; i++) rec(s, { distance: 40 + (i % 25), outcome: 'GOOD', pressure: 0.5 + (i % 5) / 10, tags: ['decisive'], decisive: true });
  Stats.recordKick(s, gw.ctx, gw.result);
  assert.ok(s.history.moments.length <= Tuning.save.momentsCap);
  const top = Stats.topMoments(s, 10);
  assert.equal(top.length, 10);
  for (let i = 1; i < top.length; i++) assert.ok(top[i - 1].score >= top[i].score);
  assert.equal(top[0].distance, 55);
  assert.ok(/55/.test(top[0].text));
  assert.notEqual(top[0], s.history.moments[0], 'copies, not live references');
  assert.ok(Schema.validate(s).ok);
});

test('checkRecords: beating a legend flips the record to the user once; personal bests track', () => {
  const s = fx.cleanCollege(RTG);
  const legend = s.records.college.longFG.holder;
  s.records.college.longFG.value = 62;
  rec(s, { distance: 63, outcome: 'GOOD', tags: ['fiftyPlus'] });
  const ms = Stats.checkRecords(s);
  const rec63 = ms.find((m) => m.kind === 'RECORD' && m.key === 'longFG');
  assert.ok(rec63, 'a RECORD payload for longFG');
  assert.equal(rec63.prev, 62); assert.equal(rec63.prevHolder, legend); assert.equal(rec63.value, 63);
  assert.equal(rec63.tag, 'rare'); assert.equal(rec63.vars.holder, legend);
  const e = s.records.college.longFG;
  assert.equal(e.isUser, true); assert.equal(e.holder, s.player.name.full); assert.equal(e.holderTeam, s.player.teamId); assert.equal(e.value, 63);
  assert.equal(e.year, Schema.calendarYear(s.year));
  assert.equal(s.records.personal.longFG, 63);
  assert.equal(s.records.nfl.longFG.isUser, false, 'the other league is untouched');
  // extending your own record is silent
  rec(s, { distance: 64, outcome: 'GOOD', tags: ['fiftyPlus'] });
  const again = Stats.checkRecords(s);
  assert.equal(again.filter((m) => m.kind === 'RECORD').length, 0);
  assert.equal(s.records.college.longFG.value, 64);
  assert.ok(Schema.validate(s).ok);
});

test('checkRecords: FG% and seasons records only at season end with the minimum attempts', () => {
  const s = fx.cleanCollege(RTG);
  s.records.college.seasonFGpct.value = 90;
  for (let i = 0; i < 19; i++) rec(s, { distance: 30, outcome: 'GOOD' });
  assert.equal(Stats.checkRecords(s).filter((m) => m.key === 'seasonFGpct').length, 0, 'not during the season');
  assert.equal(Stats.checkRecords(s, null, null, { final: true }).filter((m) => m.key === 'seasonFGpct').length, 0, '19 FGA < minimum 20');
  rec(s, { distance: 30, outcome: 'GOOD' });
  const ms = Stats.checkRecords(s, null, null, { final: true });
  assert.equal(ms.filter((m) => m.key === 'seasonFGpct').length, 1);
  assert.equal(s.records.college.seasonFGpct.value, 100);
});

test('milestones fire exactly once and add fame', () => {
  const s = fx.cleanCollege(RTG);
  const fame0 = s.player.fame;
  const M = Tuning.awards.milestones;
  s.stats.career.fgm = M.fgm[0] - 1; s.stats.career.fga = M.fgm[0] - 1;
  rec(s, { distance: 30, outcome: 'GOOD' });
  let ms = Stats.checkRecords(s);
  const hit = ms.filter((m) => m.kind === 'MILESTONE' && m.id === 'FGM' + M.fgm[0]);
  assert.equal(hit.length, 1);
  assert.equal(hit[0].tag, 'milestone'); assert.equal(hit[0].vars.n, M.fgm[0]);
  assert.equal(s.player.fame, fame0 + M.fame);
  assert.equal(s.flags['ms:FGM' + M.fgm[0]], true);
  ms = Stats.checkRecords(s);
  assert.equal(ms.filter((m) => m.id === 'FGM' + M.fgm[0]).length, 0, 'fires once');
  assert.equal(s.player.fame, fame0 + M.fame);
  // first 50+, first 60+, streak, game-winners
  rec(s, { distance: 61, outcome: 'GOOD', tags: ['fiftyPlus'] });
  ms = Stats.checkRecords(s);
  deq(ms.filter((m) => m.kind === 'MILESTONE').map((m) => m.id).sort(), ['first50', 'first60']);
  s.stats.career.bestConsecutive = M.consecutive; s.stats.career.gameWinners = M.gw; s.stats.career.pts = M.pts[0];
  ms = Stats.checkRecords(s);
  deq(ms.map((m) => m.id).sort(), ['PTS' + M.pts[0], 'gw' + M.gw, 'streak' + M.consecutive].sort());
  assert.equal(Stats.checkRecords(s).length, 0);
  assert.ok(s.history.timeline.some((t) => t.kind === 'MILESTONE'));
  assert.ok(Schema.validate(s).ok);
});

test('finishSeason builds a SeasonLine, appends history, resets the season sheet and streaks', () => {
  const s = fx.cleanCollege(RTG);
  for (let i = 0; i < 10; i++) rec(s, { distance: 30 + i * 3, outcome: i === 7 ? 'WIDE_L' : 'GOOD' });
  s.history.awards.push({ year: s.year, league: 'COLLEGE', id: 'ALL_CONF_1', name: 'All-Conference First Team K', teamId: s.player.teamId });
  s.history.awards.push({ year: s.year, league: 'COLLEGE', id: 'ST_PLAYER_OF_WEEK', name: 'weekly', teamId: s.player.teamId, week: 3 });
  s.season.results[s.player.teamId] = Object.assign(Schema.emptyTeamResult(), { w: 8, l: 4 });
  s.player.makeStreak = 2;
  const before = s.history.seasons.length;
  const line = Stats.finishSeason(s);
  assert.equal(s.history.seasons.length, before + 1);
  assert.equal(s.history.seasons[before], line);
  assert.equal(line.year, s.year); assert.equal(line.league, 'COLLEGE'); assert.equal(line.teamId, s.player.teamId);
  assert.equal(line.teamName, Schema.userTeam(s).name);
  assert.equal(line.age, s.player.age); assert.equal(line.ovr, RTG.Player.ovr(s.player.attrs)); assert.equal(line.role, 'K1');
  assert.equal(line.stats.fga, 10); assert.equal(line.stats.fgm, 9);
  deq(line.awards, ['ALL_CONF_1'], 'weekly awards are not season awards');
  assert.equal(line.teamRecord, '8-4'); assert.equal(line.champion, false); assert.equal(line.playoffResult, '');
  assert.equal(line.grade, 'A'); assert.equal(line.salary, 0);
  assert.equal(s.stats.season.fga, 0, 'season sheet reset');
  assert.equal(s.stats.career.fga, 10, 'career keeps the totals');
  assert.equal(s.player.makeStreak, 0);
  assert.ok(Array.isArray(line.milestones));
  assert.ok(Schema.validate(s).ok, Schema.validate(s).errors.join('; '));
});

test('finishSeason reads the postseason result and champion from the schedule', () => {
  const s = fx.cleanCollege(RTG);
  const me = s.player.teamId;
  s.season.schedule.push({ id: 'ccg', week: 13, homeId: me, awayId: 'COA5', kind: 'CCG', played: true, score: { home: 24, away: 20 } });
  s.season.schedule.push({ id: 'champ', week: 17, homeId: 'PAC0', awayId: me, kind: 'CHAMP', played: true, score: { home: 20, away: 23 } });
  const line = Stats.finishSeason(s);
  assert.equal(line.playoffResult, 'CHAMP'); assert.equal(line.champion, true);
});

test('seasonFgPct, careerLine and compareToLegends', () => {
  const s = fx.cleanCollege(RTG);
  assert.equal(Stats.seasonFgPct({ fga: 0, fgm: 0 }), 0);
  assert.equal(Stats.seasonFgPct({ fga: 8, fgm: 6 }), 0.75);
  for (let i = 0; i < 4; i++) rec(s, { distance: 40 + i, outcome: 'GOOD' });
  rec(s, { type: 'PAT', outcome: 'GOOD' });
  const line = Stats.careerLine(s);
  assert.equal(line.fga, 4); assert.equal(line.fgm, 4); assert.equal(line.pct, 1); assert.equal(line.pat, 1); assert.equal(line.pts, 13); assert.equal(line.long, 43);
  assert.match(line.text, /4\/4 FG/);
  const cmp = Stats.compareToLegends(s);
  const keysCollege = RTG.Data.records.keysFor('college');
  assert.equal(cmp.filter((r) => r.league === 'COLLEGE').length, keysCollege.length);
  assert.equal(cmp.filter((r) => r.league === 'NFL').length, RTG.Data.records.keysFor('nfl').length);
  const lf = cmp.find((r) => r.league === 'COLLEGE' && r.key === 'longFG');
  assert.equal(lf.yours, 43); assert.equal(lf.record, s.records.college.longFG.value); assert.equal(lf.isUser, false);
  assert.equal(lf.gap, RTG.Util.round1(lf.record - 43));
  assert.equal(cmp.find((r) => r.league === 'COLLEGE' && r.key === 'careerFGpct').yours, null, 'below the minimum attempts');
  assert.equal(typeof lf.label, 'string');
});

test('recordKick uses no randomness and keeps the state JSON-safe', () => {
  const s = fx.cleanNfl(RTG);
  const rng = RTG.RNG.create(3);
  const s0 = rng.state();
  for (let i = 0; i < 30; i++) rec(s, { distance: 30 + i, outcome: i % 4 ? 'GOOD' : 'SHORT' });
  assert.equal(rng.state(), s0);
  const clone = JSON.parse(JSON.stringify(s));
  assert.ok(RTG.Util.deepEqual(clone.stats, JSON.parse(JSON.stringify(s.stats))));
  assert.ok(Schema.validate(s).ok, Schema.validate(s).errors.join('; '));
  assert.equal(s.stats.nfl.fga, 30); assert.equal(s.stats.college.fga, 0);
});
