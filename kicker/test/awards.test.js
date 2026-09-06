/**
 * RTG.Awards — season awards, weekly award, season goals, HOF score (§3.5.13, §2.8, §2.7.9).
 *   node kicker/test/awards.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RTG = require('./load')();
/** deep-equal that ignores realm prototypes (engine objects live in a vm context). */
const deq = (a, b, msg) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg);
const fx = require('./fixtures/stats');
const Awards = RTG.Awards, Tuning = RTG.Tuning, Schema = RTG.Schema;

const byId = (list, id) => list.filter((a) => a.id === id);

test('kickerScore formula and the minimum-attempts gate', () => {
  const K = Tuning.awards.kickerScore;
  const s = Schema.emptyKickerStats();
  s.fga = 20; s.fgm = 17; s.long = 55; s.clutchM = 3; s.made50plus = 4; s.gameWinners = 2;
  const expected = 17 * K.fgm + (17 / 20) * K.fgPct + 55 / K.longDiv + 3 * K.clutch + 4 * K.fifty + 2 * K.gw;
  assert.ok(Math.abs(Awards.kickerScore(s) - expected) < 0.01);
  s.fga = K.minFga - 1;
  assert.equal(Awards.kickerScore(s), null);
  assert.ok(Awards.kickerScore(s, true) > 0, 'ignoreMin computes anyway');
  assert.equal(Awards.kickerScore(null), null);
});

test('NFL: Golden Leg / All-League 1st go to the max kickerScore; 2nd is distinct; Pro Classic is 2 per conference', () => {
  const s = fx.nflAwardsState(RTG, { best: 'PIT', second: 'CLE' });
  const rng = RTG.RNG.create(1);
  const out = Awards.compute(s, rng);
  assert.equal(byId(out, 'GOLDEN_LEG')[0].teamId, 'PIT');
  assert.equal(byId(out, 'ALL_LEAGUE_1')[0].teamId, 'PIT');
  assert.equal(byId(out, 'ALL_LEAGUE_2').length, 1);
  assert.equal(byId(out, 'ALL_LEAGUE_2')[0].teamId, 'CLE');
  assert.notEqual(byId(out, 'ALL_LEAGUE_1')[0].teamId, byId(out, 'ALL_LEAGUE_2')[0].teamId);
  const pc = byId(out, 'PRO_CLASSIC');
  assert.equal(pc.length, 2 * Tuning.awards.proClassicPerConf);
  const confs = {};
  pc.forEach((a) => { confs[a.conf] = (confs[a.conf] || 0) + 1; });
  Object.keys(confs).forEach((c) => assert.equal(confs[c], Tuning.awards.proClassicPerConf));
  assert.equal(byId(out, 'IRON_LEG_NFL')[0].teamId, 'PIT');
  assert.equal(byId(out, 'IRON_LEG_NFL')[0].value, 61);
  assert.equal(byId(out, 'CLUTCH_KICK_NFL')[0].teamId, 'PIT');
  assert.ok(byId(out, 'GOLDEN_BOOT').length === 0, 'no college awards in the NFL');
  assert.ok(out.every((a) => typeof a.name === 'string' && a.year === s.year && a.league === 'NFL'));
  assert.ok(Schema.validate(s).ok, Schema.validate(s).errors.join('; '));
});

test('NFL: STPOY needs ≥ 1.15 × the runner-up AND ≥ 3 game-winners, else "a punter won it"', () => {
  // clear leader with 4 GW → wins
  let s = fx.nflAwardsState(RTG, { best: 'PIT' });
  let out = Awards.compute(s, RTG.RNG.create(1));
  assert.equal(byId(out, 'STPOY').length, 1);
  assert.equal(byId(out, 'STPOY')[0].teamId, 'PIT');
  assert.ok(!byId(out, 'STPOY')[0].note);
  // same leader but only 2 GW → punter
  s = fx.nflAwardsState(RTG, { best: 'PIT' });
  s.season.kickerStats.PIT.gameWinners = Tuning.awards.stpoy.minGw - 1;
  out = Awards.compute(s, RTG.RNG.create(1));
  assert.equal(byId(out, 'STPOY').length, 1);
  assert.equal(byId(out, 'STPOY')[0].note, true);
  assert.equal(byId(out, 'STPOY')[0].teamId, null);
  // leader with 4 GW but a close runner-up → punter
  s = fx.nflAwardsState(RTG, { best: 'PIT' });
  const lead = Awards.kickerScore(s.season.kickerStats.PIT);
  s.season.kickerStats.CLE = RTG.Util.deepClone(s.season.kickerStats.PIT);
  s.season.kickerStats.CLE.gameWinners = 0;
  assert.ok(Awards.kickerScore(s.season.kickerStats.CLE) > lead / Tuning.awards.stpoy.ratio);
  out = Awards.compute(s, RTG.RNG.create(1));
  assert.equal(byId(out, 'STPOY')[0].note, true);
});

test('NFL: Championship Bowl MVP goes to a decisive make in the CHAMP game the team won', () => {
  const s = fx.nflAwardsState(RTG, { best: 'PIT' });
  s.season.schedule.push({ id: 'champ', week: 22, homeId: 'PIT', awayId: 'CLE', kind: 'CHAMP', played: true, score: { home: 23, away: 20 } });
  s.season.kickerStats.PIT.decisiveMakeWeeks = [22];
  s.season.kickerStats.CLE.decisiveMakeWeeks = [22];   // the loser's decisive make does not count
  const out = Awards.compute(s, RTG.RNG.create(1));
  assert.equal(byId(out, 'CHAMPIONSHIP_MVP').length, 1);
  assert.equal(byId(out, 'CHAMPIONSHIP_MVP')[0].teamId, 'PIT');
});

test('user awards apply XP (× difficulty) and fame and land in history.awards; compute is idempotent', () => {
  const s = fx.nflAwardsState(RTG);
  // make the user the runaway best
  const u = s.stats.season;
  u.fga = 40; u.fgm = 40; u.long = 64; u.made50plus = 10; u.clutchM = 8; u.gameWinners = 5; u.pts = 120 + 35; u.clutchBest = 64;
  const xp0 = s.player.xp, fame0 = s.player.fame, n0 = s.history.awards.length;
  const out = Awards.compute(s, RTG.RNG.create(1));
  const mine = out.filter((a) => a.isUser && !a.goal);
  assert.ok(mine.some((a) => a.id === 'GOLDEN_LEG'));
  assert.ok(mine.some((a) => a.id === 'STPOY'));
  const xpMult = Tuning.difficulty[s.difficulty].xpMult;
  let xp = 0, fame = 0;
  mine.forEach((a) => { xp += Math.round(Tuning.awards.rewards[a.id].xp * xpMult); fame += Tuning.awards.rewards[a.id].fame; });
  out.filter((a) => a.goal).forEach((a) => { xp += Math.round(a.xp * xpMult); });
  assert.equal(s.player.xp, xp0 + xp);
  assert.equal(s.player.fame, Math.min(Tuning.soft.fame.max, fame0 + fame));
  assert.equal(s.history.awards.length, n0 + mine.length, 'season goals do not enter the trophy case');
  const rec = s.history.awards[n0];
  deq(Object.keys(rec).sort(), ['id', 'league', 'name', 'teamId', 'year']);
  assert.equal(rec.teamId, s.player.teamId);
  assert.ok(s.history.timeline.some((t) => t.kind === 'AWARD'));
  deq(Awards.compute(s, RTG.RNG.create(1)), [], 'second call is a no-op');
  assert.ok(Schema.validate(s).ok, Schema.validate(s).errors.join('; '));
});

test('college: Golden Boot / All-American / All-Conference per conference / Freshman Leg / Iron Leg / MVPs', () => {
  const s = fx.collegeAwardsState(RTG);
  const me = s.player.teamId;
  // user is the best kicker in the nation
  const u = s.stats.season;
  u.fga = 26; u.fgm = 25; u.long = 61; u.made50plus = 6; u.clutchM = 5; u.gameWinners = 3; u.pts = 75 + 40; u.clutchBest = 61;
  u.decisiveMakeWeeks = [13, 17];
  s.season.schedule.push({ id: 'ccg', week: 13, homeId: me, awayId: 'COA5', kind: 'CCG', played: true, score: { home: 24, away: 21 } });
  s.season.schedule.push({ id: 'champ', week: 17, homeId: 'PAC0', awayId: me, kind: 'CHAMP', played: true, score: { home: 20, away: 23 } });
  const out = Awards.compute(s, RTG.RNG.create(2));
  assert.equal(byId(out, 'GOLDEN_BOOT')[0].teamId, me);
  assert.equal(byId(out, 'ALL_AMERICAN_1')[0].teamId, me);
  assert.equal(byId(out, 'ALL_AMERICAN_2').length, 2);
  assert.ok(byId(out, 'ALL_AMERICAN_2').every((a) => a.teamId !== me));
  const conf = byId(out, 'ALL_CONF_1');
  assert.equal(conf.length, RTG.Data.conferences.length);
  assert.equal(new Set(conf.map((a) => a.conf)).size, RTG.Data.conferences.length);
  assert.equal(byId(out, 'FRESHMAN_LEG').length, 1);
  assert.equal(byId(out, 'FRESHMAN_LEG')[0].teamId, me);
  assert.equal(byId(out, 'IRON_LEG_COLLEGE')[0].teamId, me);
  assert.equal(byId(out, 'CLUTCH_KICK_COLLEGE')[0].teamId, me);
  assert.equal(byId(out, 'CCG_MVP').length, 1);
  assert.equal(byId(out, 'NATIONAL_MVP').length, 1);
  assert.equal(byId(out, 'GOLDEN_LEG').length, 0);
  // freshman award only in the first college season
  const s2 = fx.collegeAwardsState(RTG);
  s2.history.seasons.push({ year: 1, league: 'COLLEGE', teamId: me, teamName: 'x', age: 18, ovr: 50, role: 'K1', stats: Schema.emptyKickerStats(), awards: [], teamRecord: '6-6', champion: false, playoffResult: '', grade: 'C', salary: 0 });
  s2.year = 2;
  assert.equal(byId(Awards.compute(s2, RTG.RNG.create(2)), 'FRESHMAN_LEG').length, 0);
});

test('compute draws from the rng only to break an exact tie', () => {
  const s = fx.nflAwardsState(RTG, { best: 'PIT' });
  const rng = RTG.RNG.create(9);
  const st0 = rng.state();
  Awards.compute(s, rng);
  assert.equal(rng.state(), st0, 'no draw without ties');
  const t = fx.nflAwardsState(RTG, { best: 'PIT' });
  t.season.kickerStats.CLE = RTG.Util.deepClone(t.season.kickerStats.PIT);   // exact tie at the top
  const rng2 = RTG.RNG.create(9);
  const a = Awards.compute(t, rng2);
  const after = rng2.state();
  const probe = RTG.RNG.create(9); probe.next();
  assert.equal(after, probe.state(), 'exactly one draw on a tie');
  assert.ok(['PIT', 'CLE'].indexOf(byId(a, 'GOLDEN_LEG')[0].teamId) >= 0);
  // deterministic for the same seed
  const t2 = fx.nflAwardsState(RTG, { best: 'PIT' });
  t2.season.kickerStats.CLE = RTG.Util.deepClone(t2.season.kickerStats.PIT);
  assert.equal(byId(Awards.compute(t2, RTG.RNG.create(9)), 'GOLDEN_LEG')[0].teamId, byId(a, 'GOLDEN_LEG')[0].teamId);
});

test('weekly: best kicker-score gain in the conference with ≥ 2 FGM this week; user wins → award, else null', () => {
  const s = fx.cleanNfl(RTG);
  fx.fillKickerStats(RTG, s);
  assert.equal(Awards.weekly(s), null, 'first call only snapshots (deltas equal the season totals; user has 0 FGM)');
  assert.ok(s.season.weeklyPrev && s.season.weeklyPrev.user, 'snapshot stored');
  // user goes 3/3 with a 55-yarder; nobody else moves
  for (let i = 0; i < 3; i++) { const k = fx.kick(RTG, s, { distance: 45 + i * 5, outcome: 'GOOD' }); RTG.Stats.recordKick(s, k.ctx, k.result); }
  const xp0 = s.player.xp, n0 = s.history.awards.length;
  const aw = Awards.weekly(s);
  assert.ok(aw, 'user wins the week');
  assert.equal(aw.id, 'ST_PLAYER_OF_WEEK'); assert.equal(aw.isUser, true); assert.equal(aw.week, s.week);
  assert.equal(s.player.xp, xp0 + Math.round(Tuning.awards.rewards.ST_PLAYER_OF_WEEK.xp * Tuning.difficulty[s.difficulty].xpMult));
  assert.equal(s.history.awards.length, n0 + 1);
  assert.equal(s.history.awards[n0].week, s.week);
  // no change → nobody qualifies
  assert.equal(Awards.weekly(s), null);
  // a same-conference rival gains more → null; another conference's rival is ignored
  const userConf = Schema.userTeam(s).conf;
  const rival = s.leagues.nfl.teams.find((t) => t.conf === userConf && t.id !== s.player.teamId);
  const other = s.leagues.nfl.teams.find((t) => t.conf !== userConf);
  const k2 = fx.kick(RTG, s, { distance: 40, outcome: 'GOOD' }); RTG.Stats.recordKick(s, k2.ctx, k2.result);
  const k3 = fx.kick(RTG, s, { distance: 41, outcome: 'GOOD' }); RTG.Stats.recordKick(s, k3.ctx, k3.result);
  s.season.kickerStats[rival.id].fgm += 5; s.season.kickerStats[rival.id].fga += 5; s.season.kickerStats[rival.id].pts += 15;
  assert.equal(Awards.weekly(s), null, 'the rival gained more');
  const k4 = fx.kick(RTG, s, { distance: 40, outcome: 'GOOD' }); RTG.Stats.recordKick(s, k4.ctx, k4.result);
  const k5 = fx.kick(RTG, s, { distance: 41, outcome: 'GOOD' }); RTG.Stats.recordKick(s, k5.ctx, k5.result);
  s.season.kickerStats[other.id].fgm += 9; s.season.kickerStats[other.id].fga += 9; s.season.kickerStats[other.id].pts += 27;
  assert.ok(Awards.weekly(s), 'another conference does not compete');
  assert.ok(Schema.validate(s).ok, Schema.validate(s).errors.join('; '));
});

test('seasonGoals: three goals (team wins, FG%, fans) scaled to the team and player; 3 rng draws', () => {
  const s = fx.cleanCollege(RTG);
  const rng = RTG.RNG.create(4);
  const st0 = rng.state();
  const goals = Awards.seasonGoals(s, rng);
  const probe = RTG.RNG.create(4); probe.next(); probe.next(); probe.next();
  assert.equal(rng.state(), probe.state());
  assert.equal(goals.length, 3);
  deq(goals.map((g) => g.id), ['TEAM_WINS', 'FG_PCT', 'FANS']);
  deq(goals.map((g) => g.xp), Tuning.awards.goalXp);
  assert.equal(s.season.goals, goals);
  const G = Tuning.awards.goals;
  const games = Tuning.schedule.college.confGames + Tuning.schedule.college.nonConfGames;
  assert.ok(goals[0].target >= G.wins.floor && goals[0].target <= games - G.wins.ceilBelowGames);
  assert.ok(goals[1].target >= G.fgPct.min && goals[1].target <= G.fgPct.max);
  assert.ok(goals[2].target > s.player.fans && goals[2].target <= G.fans.max);
  goals.forEach((g) => { assert.equal(typeof g.text, 'string'); assert.equal(g.met, false); assert.equal(typeof g.progress, 'number'); });
  // a stronger team and a better kicker get harder targets
  const strong = fx.cleanCollege(RTG);
  const team = Schema.userTeam(strong); team.OFF = 92; team.DEF = 92;
  strong.player.attrs = { POW: 90, ACC: 92, CON: 90, CLU: 88, KO: 80 };
  const g2 = Awards.seasonGoals(strong, RTG.RNG.create(4));
  assert.ok(g2[0].target > goals[0].target, 'more wins expected from a 92-rated team');
  assert.ok(g2[1].target > goals[1].target, 'higher FG% expected from an elite leg');
  assert.ok(Schema.validate(s).ok);
  void st0;
});

test('checkGoals updates progress and met flags (FG% needs the minimum attempts); goal XP paid once at AWARDS', () => {
  const s = fx.cleanCollege(RTG);
  Awards.seasonGoals(s, RTG.RNG.create(4));
  const [wins, fg, fans] = s.season.goals;
  s.season.results[s.player.teamId] = Object.assign(Schema.emptyTeamResult(), { w: wins.target, l: 1 });
  s.player.fans = fans.target;
  for (let i = 0; i < Tuning.awards.goals.fgPct.minFga - 1; i++) { const k = fx.kick(RTG, s, { distance: 30, outcome: 'GOOD' }); RTG.Stats.recordKick(s, k.ctx, k.result); }
  let g = Awards.checkGoals(s);
  assert.equal(g[0].met, true); assert.equal(g[0].progress, wins.target);
  assert.equal(g[2].met, true);
  assert.equal(g[1].met, false, 'perfect but below the minimum attempts');
  assert.equal(g[1].progress, 1);
  const k = fx.kick(RTG, s, { distance: 30, outcome: 'GOOD' }); RTG.Stats.recordKick(s, k.ctx, k.result);
  g = Awards.checkGoals(s);
  assert.equal(g[1].met, true);
  // goal XP at AWARDS, once
  s.phase = 'AWARDS';
  fx.fillKickerStats(RTG, s);
  const xp0 = s.player.xp;
  const out = Awards.compute(s, RTG.RNG.create(1));
  const goalAwards = out.filter((a) => a.goal);
  assert.equal(goalAwards.length, 3);
  deq(goalAwards.map((a) => a.id), ['SEASON_GOAL_1', 'SEASON_GOAL_2', 'SEASON_GOAL_3']);
  const mult = Tuning.difficulty[s.difficulty].xpMult;
  let expected = 0;
  Tuning.awards.goalXp.forEach((x) => { expected += Math.round(x * mult); });
  out.filter((a) => a.isUser && !a.goal).forEach((a) => { expected += Math.round(Tuning.awards.rewards[a.id].xp * mult); });
  assert.equal(s.player.xp, xp0 + expected);
  assert.ok(s.season.goals.every((gl) => gl.awarded));
  void fg;
});

test('hofScore worked examples: 877 → FIRST_BALLOT / Legend; journeyman ≈ 244 → Solid Starter', () => {
  const first = Awards.hofScore(fx.hofFirstBallot(RTG));
  assert.equal(first.score, 877);
  assert.equal(first.verdict, 'FIRST_BALLOT');
  assert.equal(first.tier, 'Legend');
  assert.equal(first.inductionYear, 1);
  const bd = {};
  first.breakdown.forEach((b) => { bd[b.key] = b.points; });
  assert.equal(bd.fgm, 256); assert.equal(bd.fifty, 120); assert.equal(bd.pts, 27); assert.equal(bd.gw, 144);
  assert.equal(bd.allLeague1, 50); assert.equal(bd.championships, 30); assert.equal(bd.seasonsAsStarter, 210); assert.equal(bd.recordsHeld, 40);
  assert.equal(bd.pctBonus, 0, '86 % does not earn the accuracy bonus');
  const jm = Awards.hofScore(fx.hofJourneyman(RTG));
  assert.ok(jm.score >= 150 && jm.score < 300, 'score ' + jm.score);
  assert.equal(jm.tier, 'Solid Starter');
  assert.equal(jm.verdict, 'NOT_ON_BALLOT');
  assert.equal(jm.inductionYear, null);
});

test('hofScore: verdict thresholds, multipliers, accuracy bonus and monotonicity in every input', () => {
  const H = Tuning.hof;
  const base = fx.hofFirstBallot(RTG);
  const s0 = Awards.hofScore(base).score;
  // walk-on and UDFA multipliers
  base.flags.WALKON = true;
  assert.equal(Awards.hofScore(base).score, Math.round(877 * H.walkonMult));
  base.flags.UDFA = true;
  assert.equal(Awards.hofScore(base).score, Math.round(877 * H.walkonMult * H.udfaMult));
  base.flags = {};
  // accuracy bonus
  base.stats.nfl.fgm = 330; base.stats.nfl.fga = 372;   // 88.7 %
  const withBonus = Awards.hofScore(base);
  assert.equal(withBonus.breakdown.find((b) => b.key === 'pctBonus').points, H.weights.pctBonus);
  base.stats.nfl.fgm = 320;
  // thresholds
  // a state whose HOF score is exactly `score` (all points from game-winners, weight 12) — scores are multiples of 12
  const mk = (score) => { const st = fx.hofJourneyman(RTG); st.stats.nfl.fgm = 0; st.stats.nfl.pts = 0; st.stats.nfl.made50plus = 0; st.stats.nfl.gameWinners = Math.ceil(score / H.weights.gw); st.history.seasons = st.history.seasons.filter((l) => l.league !== 'NFL'); const r = Awards.hofScore(st); assert.ok(r.score >= score && r.score < score + H.weights.gw); return r; };
  assert.equal(mk(H.verdicts.firstBallot).verdict, 'FIRST_BALLOT');
  assert.equal(mk(H.verdicts.inducted).verdict, 'INDUCTED');
  assert.equal(mk(H.verdicts.finalist).verdict, 'FINALIST');
  assert.equal(mk(H.verdicts.finalist - 24).verdict, 'NOT_ON_BALLOT');
  const ind = mk(H.verdicts.inducted);
  assert.ok(ind.inductionYear >= H.inductionYears[0] && ind.inductionYear <= H.inductionYears[1]);
  // monotonicity: bumping each input never lowers the score
  const bumps = [
    (st) => { st.stats.nfl.fgm += 10; },
    (st) => { st.stats.nfl.made50plus += 3; },
    (st) => { st.stats.nfl.pts += 300; },
    (st) => { st.stats.nfl.gameWinners += 2; },
    (st) => { st.history.awards.push({ year: 9, league: 'NFL', id: 'ALL_LEAGUE_1', name: '', teamId: 'BOS' }); },
    (st) => { st.history.awards.push({ year: 9, league: 'NFL', id: 'ALL_LEAGUE_2', name: '', teamId: 'BOS' }); },
    (st) => { st.history.awards.push({ year: 9, league: 'NFL', id: 'STPOY', name: '', teamId: 'BOS' }); },
    (st) => { st.history.awards.push({ year: 9, league: 'NFL', id: 'CHAMPIONSHIP_MVP', name: '', teamId: 'BOS' }); },
    (st) => { st.history.seasons.find((l) => l.league === 'NFL' && !l.champion).champion = true; },
    (st) => { st.history.seasons.push({ year: 19, league: 'NFL', teamId: 'BOS', teamName: '', age: 36, ovr: 80, role: 'K1', stats: Schema.emptyKickerStats(), awards: [], teamRecord: '9-8', champion: false, playoffResult: '', grade: 'B', salary: 2 }); },
    (st) => { st.records.nfl.longFG.isUser = true; },
    (st) => { st.flags.WALKON = true; }
  ];
  bumps.forEach((b, i) => {
    const st = fx.hofFirstBallot(RTG);
    b(st);
    assert.ok(Awards.hofScore(st).score >= s0, 'bump #' + i + ' lowered the score');
  });
  // college-only inputs do not count
  const c = fx.hofFirstBallot(RTG);
  c.stats.college.fgm = 500; c.stats.career.fgm = 820;
  assert.equal(Awards.hofScore(c).score, s0);
});
