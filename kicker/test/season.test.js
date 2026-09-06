/**
 * season.test.js — RTG.Season (SPEC §3.5.17 API, §2.2 weekly order & bench/cut rules, §2.5.1 yearly drift and
 * AI kickers, §2.6 postseason, §2.7.3 phase flow, §5.1 "season").
 *
 * A full college season with auto kicks (Season.start → beginRegular → weekly userGameRef / simUserGameAuto /
 * endWeek → offseason): 13 REG weeks + the week-13 CCGs + bowls / 12-team playoff produce a champion, phases
 * PRE→REG→POST→AWARDS→OFF, season.kickerStats for all 48 teams, awards, user stats consistent with the kick
 * log, determinism; the NFL season likewise (18 weeks + 4 playoff weeks, Championship Bowl winner); endWeek
 * refusals (pending, unplayed game, game in progress); injuries tick; modifiers expire; simOtherGames forks
 * and idempotency; bench / cut / lost-job rules; advanceYear; runtime (reported for the vm harness, asserted
 * < 250 ms with the engine in the main context — see the runtime test for why).
 *
 * Career (RTG.Career) is not required: the camp battle and the offseason chain are skipped when it is absent.
 *
 *   node kicker/test/season.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const load = require('./load');
const RTG = load();
const schemaFx = require('./fixtures/schema');

/** Cross-realm deep equality: engine objects live in a vm context, so normalise through JSON first. */
const J = (v) => JSON.parse(JSON.stringify(v));
const deq = (a, b, m) => assert.deepEqual(J(a), J(b), m);

const { Season, Schema, Tuning } = RTG;
const TS = Tuning.schedule;
const hasCareer = !!(RTG.Career && typeof RTG.Career.campBattle === 'function');

function ok(state, where) {
  const v = Schema.validate(state);
  assert.ok(v.ok, (where || 'state') + ' validates: ' + v.errors.slice(0, 6).join('; '));
}

/**
 * A career state enrolled on a team of `kind`, at PRE before Season.start. The user is K1 and the data K1 becomes
 * the backup (kicker2), as fixtures/schema does. opts.strong makes the user's team a 95/95 juggernaut so it
 * reaches the postseason (bowl eligibility ≥ 6 wins) in every seed tried.
 */
function enrol(R, kind, opts) {
  opts = opts || {};
  const seed = opts.seed === undefined ? 7 : opts.seed;
  const state = schemaFx.hsShowcase(R, { seed });
  state.pending = null;
  const lg = kind === 'NFL' ? state.leagues.nfl : state.leagues.college;
  const team = lg.teams[opts.teamIdx || 0];
  if (opts.strong) { team.OFF = 95; team.DEF = 95; }
  const p = state.player;
  state.stage = kind; state.year = kind === 'NFL' ? 5 : 1; state.week = 0; state.phase = 'PRE';
  state.leagues.college.year = state.year; state.leagues.nfl.year = state.year;
  p.teamId = team.id; p.league = kind; p.role = 'K1'; p.trust = 55; p.js = 60; p.fame = 20; p.flags.coachStyle = 'TRUSTING';
  if (kind === 'NFL') {
    p.age = 22; p.attrs = { POW: 66, ACC: 68, CON: 62, CLU: 60, KO: 64 }; p.collegeSeasons = 4;
    p.contract = { type: 'ROOKIE', years: 4, yearIdx: 0, aav: 0.98, gtdPct: 0.25, signingBonus: 0.98, startYear: 4, round: 5 };
  } else {
    p.contract = { type: 'SCHOLARSHIP', years: 4, yearIdx: 0, aav: 0, gtdPct: 0, signingBonus: 0, startYear: 1 };
  }
  team.kicker2 = team.kicker; team.kicker = null;
  R.Schema.reindex(state);
  state.history.teams.push({ teamId: team.id, league: kind, fromYear: state.year, toYear: null, reason: 'SIGNED' });
  return state;
}

/** Resolve whatever is pending so the loop can go on: events → choice 0; KICKS sessions → auto kicks; decisions → cleared. */
function settle(R, state, rng) {
  const pd = state.pending;
  if (!pd) return;
  if (pd.kind === 'EVENT') { R.Events.apply(state, rng, 0); return; }
  if (pd.kind === 'KICKS') {
    const sess = pd.session;
    while (sess.idx < sess.contexts.length) {
      const ctx = sess.contexts[sess.idx];
      sess.results.push(R.Kick.resolve(rng, ctx, null, R.Kick.aiInput(rng, ctx, null), { auto: true }));
      sess.idx++;
    }
    if (sess.kind === 'HALFTIME70' && typeof R.Events.resolveHalftime70 === 'function') R.Events.resolveHalftime70(state, rng, sess.results[0]);
    if (state.pending === pd) state.pending = null;
    return;
  }
  state.pending = null;
}

/** Drive a started season to the offseason with auto kicks. */
function playSeason(R, state, rng, opts) {
  opts = opts || {};
  const out = { phases: [state.phase], weeks: 0, userGames: 0, reports: [], byes: 0, validated: 0 };
  R.Season.beginRegular(state, rng);
  out.phases.push(state.phase);
  let guard = 0;
  while ((state.phase === 'REG' || state.phase === 'POST') && guard++ < 40) {
    while (state.pending) settle(R, state, rng);
    const ref = R.Season.userGameRef(state);
    if (ref) { R.Season.simUserGameAuto(state, rng); out.userGames++; } else out.byes++;
    const rep = R.Season.endWeek(state, rng);
    out.reports.push(rep);
    out.weeks++;
    if (out.phases[out.phases.length - 1] !== state.phase) out.phases.push(state.phase);
    if (opts.validateEvery && out.weeks % opts.validateEvery === 0) { ok(state, 'week ' + rep.week); out.validated++; }
  }
  while (state.pending) settle(R, state, rng);
  R.Season.offseason(state, rng);
  if (out.phases[out.phases.length - 1] !== state.phase) out.phases.push(state.phase);
  return out;
}

function byKind(schedule) {
  const m = {};
  for (const g of schedule) { const e = m[g.kind] || (m[g.kind] = { n: 0, played: 0, weeks: {} }); e.n++; if (g.played) e.played++; e.weeks[g.week] = (e.weeks[g.week] || 0) + 1; }
  return m;
}

function userRows(state, year, league) {
  return state.stats.kicks.filter((r) => r.year === year && r.league === league && r.type !== 'KO');
}

const stash = {};

// ═══════════════════════════════ API ═══════════════════════════════

test('§3.5.17 public API', () => {
  for (const f of ['start', 'beginRegular', 'userGameRef', 'simOtherGames', 'simUserGameAuto', 'endWeek', 'startPostseason', 'postseasonWeek', 'finishSeason', 'offseason', 'advanceYear', 'ageTick']) {
    assert.equal(typeof Season[f], 'function', 'Season.' + f);
  }
  assert.ok(Tuning.season && Tuning.season.inbox, 'Tuning.season constants exist');
});

// ═══════════════════════════════ start ═══════════════════════════════

test('Season.start: PRE week 0, fresh schedule, zeroed tables, goals, kickerStats rows, camp-battle rule (§2.2)', () => {
  const state = enrol(RTG, 'COLLEGE', { seed: 3 });
  const rng = RTG.RNG.create(3);
  const season = Season.start(state, rng);
  assert.equal(state.season, season);
  assert.equal(state.phase, 'PRE'); assert.equal(state.week, 0); assert.equal(state.game, null);
  assert.equal(season.league, 'COLLEGE'); assert.equal(season.year, 1);
  assert.equal(season.schedule.length, TS.college.teams * (TS.college.confGames + TS.college.nonConfGames) / 2, '288 regular-season games');
  assert.ok(season.schedule.every((g) => g.kind === 'REG' && !g.played));
  assert.equal(Object.keys(season.results).length, 48); assert.ok(Object.values(season.results).every((r) => r.w === 0 && r.l === 0));
  assert.equal(Object.keys(season.kickerStats).length, 48, 'a KickerStats row for every team');
  assert.equal(Object.keys(season.rankings).length, 48, 'preseason poll'); assert.equal(season.standings.length, 48);
  deq(season.rankingsPrev, season.rankings, 'the preseason poll is the first "previous week"');
  assert.equal(season.goals.length, 3);
  deq(season.goals.map((g) => g.id), ['TEAM_WINS', 'FG_PCT', 'FANS']);
  assert.equal(season.userGameId, null); assert.equal(season.weekGameDone, false); assert.equal(season.trainingDone, false);
  assert.equal(state.flags.seasonInjuryWeeks, 0);
  deq(season.contractAtStart, { type: 'SCHOLARSHIP', startYear: 1, yearIdx: 0 });
  ok(state, 'PRE');

  // camp battle rule: rival OVR ≥ myOVR − 5 → required; a much weaker rival → not required; backup → required
  const myOvr = RTG.Player.ovr(state.player.attrs);
  const team = Schema.userTeam(state);
  assert.equal(season.campBattle.myOvr, myOvr);
  assert.equal(season.campBattle.rivalOvr, team.kicker2.ovr);
  assert.equal(season.campBattle.required, team.kicker2.ovr >= myOvr - Tuning.soft.camp.triggerOvrMargin);
  if (!hasCareer) assert.equal(state.pending, null, 'no Career → no camp session, start still succeeds');

  const weak = enrol(RTG, 'COLLEGE', { seed: 3 });
  Schema.userTeam(weak).kicker2.ovr = RTG.Player.ovr(weak.player.attrs) - Tuning.soft.camp.triggerOvrMargin - 10;
  Season.start(weak, RTG.RNG.create(3));
  assert.equal(weak.season.campBattle.required, false);
  const strong = enrol(RTG, 'COLLEGE', { seed: 3 });
  Schema.userTeam(strong).kicker2.ovr = RTG.Player.ovr(strong.player.attrs) - Tuning.soft.camp.triggerOvrMargin;
  Season.start(strong, RTG.RNG.create(3));
  assert.equal(strong.season.campBattle.required, true); assert.equal(strong.season.campBattle.reason, 'RIVAL');
  const backup = enrol(RTG, 'COLLEGE', { seed: 3 });
  backup.player.role = 'K2'; const bt = Schema.userTeam(backup); bt.kicker = bt.kicker2; bt.kicker2 = null; Schema.reindex(backup);
  Season.start(backup, RTG.RNG.create(3));
  assert.equal(backup.season.campBattle.reason, 'BACKUP');

  // NFL: previous NFL standings feed Schedule.nfl; the schedule is 272 games over 18 weeks
  const nfl = enrol(RTG, 'NFL', { seed: 4 });
  Season.start(nfl, RTG.RNG.create(4));
  assert.equal(nfl.season.schedule.length, TS.nfl.teams * TS.nfl.games / 2);
  assert.equal(Object.keys(nfl.season.kickerStats).length, 32);
  deq(nfl.season.rankings, {}, 'no poll in the NFL');
  ok(nfl, 'NFL PRE');
});

// ═══════════════════════════════ full seasons ═══════════════════════════════

test('a full college season with auto kicks: PRE→REG→POST→AWARDS→OFF, 13 REG weeks + CCG + bowls/playoff → champion, kicker stats for 48 teams, awards, stats vs kick log, determinism', () => {
  const run = (seed) => {
    const state = enrol(RTG, 'COLLEGE', { seed, strong: true });
    const rng = RTG.RNG.create(seed);
    Season.start(state, rng);
    const t0 = process.hrtime.bigint();
    const res = playSeason(RTG, state, rng, { validateEvery: 5 });
    res.ms = Number(process.hrtime.bigint() - t0) / 1e6;
    return { state, res };
  };
  const { state, res } = run(7);
  stash.college = state;
  stash.collegeMs = res.ms;
  const season = state.season, p = state.player;

  deq(res.phases, ['PRE', 'REG', 'POST', 'AWARDS', 'OFF'], 'phase sequence');
  assert.ok(res.validated >= 2, 'validated during the season');
  ok(state, 'OFF');

  // weeks: 13 REG endWeeks (the week-13 report flips to POST), then postseason weeks until AWARDS
  const regReports = res.reports.filter((r) => r.week <= TS.college.regWeeks);
  assert.equal(regReports.length, TS.college.regWeeks, '13 regular-season weeks');
  assert.equal(regReports[TS.college.regWeeks - 1].phaseChange, 'POST', 'week 13 closes into the postseason');
  assert.equal(res.reports[res.reports.length - 1].phaseChange, 'AWARDS', 'the last postseason week closes into AWARDS');
  assert.equal(state.week, TS.college.totalWeeks, 'POST numbering ends at week 17');

  // schedule: 288 REG + 6 CCG (week 13) + bowls (week 14) + 4+4+2 playoff + title (week 17), everything played
  const k = byKind(season.schedule);
  assert.equal(k.REG.n, 288); assert.equal(k.REG.played, 288);
  assert.equal(k.CCG.n, TS.college.conferences); assert.equal(k.CCG.played, k.CCG.n); deq(Object.keys(k.CCG.weeks), [String(TS.college.ccgWeek)]);
  assert.ok(k.BOWL.n >= 1 && k.BOWL.n <= TS.college.minorBowls, 'bowls 1–12'); assert.equal(k.BOWL.played, k.BOWL.n); deq(Object.keys(k.BOWL.weeks), [String(TS.college.bowlWeek)]);
  assert.equal(k.PLAYOFF.n, 10); assert.equal(k.PLAYOFF.played, 10);
  assert.equal(k.CHAMP.n, 1); assert.equal(k.CHAMP.played, 1); deq(Object.keys(k.CHAMP.weeks), [String(TS.college.playoffWeeks[3])]);
  assert.ok(season.playoffs && season.playoffs.complete, 'bracket complete');
  const champ = season.playoffs.championId;
  assert.ok(Schema.teamIn(state.leagues.college, champ), 'champion is a league team');
  const title = season.schedule.find((g) => g.kind === 'CHAMP');
  assert.equal(title.score.home > title.score.away ? title.homeId : title.awayId, champ, 'the champion won the title game');
  assert.equal(season.bowls.length, k.BOWL.n); assert.ok(season.bowls.every((b) => b.id && b.bowlName && !('played' in b)), 'bowl descriptors, not game copies');

  // results consistent with the schedule
  let wins = 0, games = 0;
  for (const id of Object.keys(season.results)) { wins += season.results[id].w; games += season.results[id].w + season.results[id].l + season.results[id].t; }
  const played = season.schedule.filter((g) => g.played);
  const ties = played.filter((g) => g.score.home === g.score.away).length;
  assert.equal(wins, played.length - ties); assert.equal(games, 2 * played.length);

  // AI kicker stats for every team (D14)
  assert.equal(Object.keys(season.kickerStats).length, 48);
  const withKicks = Object.keys(season.kickerStats).filter((id) => season.kickerStats[id].fga + season.kickerStats[id].pat > 0);
  assert.ok(withKicks.length >= 44, 'AI kickers kicked for ≥ 44 of 48 teams, got ' + withKicks.length);
  const other = state.leagues.college.teams.find((t) => t.id !== p.teamId && season.kickerStats[t.id].fga > 0);
  assert.equal(other.kicker.seasonStats.fga, season.kickerStats[other.id].fga, 'AIKicker.seasonStats is the season tick copy');

  // awards
  assert.ok(season.awardsList.length > 0, 'awards computed');
  const boot = season.awardsList.find((a) => a.id === 'GOLDEN_BOOT');
  assert.ok(boot && Schema.teamIn(state.leagues.college, boot.teamId), 'Golden Boot went to a league kicker');
  assert.ok(season.awardsList.some((a) => a.id === 'ALL_CONF_1'));
  for (const a of state.history.awards) { assert.equal(a.year, 1); assert.equal(a.league, 'COLLEGE'); }

  // the user's line vs the kick log
  assert.equal(state.history.seasons.length, 1);
  const line = state.history.seasons[0];
  assert.equal(line.year, 1); assert.equal(line.league, 'COLLEGE'); assert.equal(line.teamId, p.teamId);
  const rows = userRows(state, 1, 'COLLEGE');
  const fg = rows.filter((r) => r.type === 'FG'), pat = rows.filter((r) => r.type === 'PAT');
  assert.equal(line.stats.fga, fg.length, 'FGA equals the FG rows');
  assert.equal(line.stats.fgm, fg.filter((r) => r.made).length);
  assert.equal(line.stats.pat, pat.length); assert.equal(line.stats.patMade, pat.filter((r) => r.made).length);
  assert.equal(line.stats.pts, Tuning.kick.points.FG * line.stats.fgm + Tuning.kick.points.PAT * line.stats.patMade);
  assert.equal(line.stats.games, res.userGames, 'one game per user week');
  assert.ok(line.stats.fga >= 8 && line.stats.pat >= 20, 'a real workload: ' + line.stats.fga + ' FGA, ' + line.stats.pat + ' PAT');
  assert.equal(state.stats.season.fga, 0, 'stats.season reset for the next year');
  assert.equal(state.stats.career.fga, line.stats.fga);
  assert.equal(line.teamRecord, season.results[p.teamId].w + '-' + season.results[p.teamId].l + (season.results[p.teamId].t ? '-' + season.results[p.teamId].t : ''));
  assert.equal(line.champion, champ === p.teamId);
  assert.equal(p.collegeSeasons, 1); assert.equal(p.nflSeasons, 0);
  assert.equal(state.leagues.college.seasonHistory.length, 1);
  assert.equal(state.leagues.college.seasonHistory[0].championId, champ);
  assert.equal(state.leagues.college.seasonHistory[0].userTeamId, p.teamId);
  assert.ok(state.history.timeline.some((t) => t.kind === 'SEASON'));
  assert.ok(state.inbox.length > 0 && state.headlines.length > 0, 'inbox and headlines were written');
  assert.ok(state.inbox.length <= Tuning.save.inboxCap && state.headlines.length <= Tuning.save.headlinesCap);

  // WeekReport shape
  for (const r of res.reports) {
    assert.equal(typeof r.year, 'number'); assert.equal(typeof r.week, 'number'); assert.equal(r.league, 'COLLEGE');
    assert.ok(Array.isArray(r.headlines) && Array.isArray(r.messages) && Array.isArray(r.milestones));
    assert.equal(typeof r.event, 'boolean'); assert.equal(typeof r.bench, 'boolean'); assert.equal(typeof r.bye, 'boolean');
    assert.ok(r.injuries && typeof r.injuries.active === 'boolean');
    assert.ok(r.phaseChange === null || typeof r.phaseChange === 'string');
    assert.equal(typeof r.nextWeek, 'number');
    if (!r.bye) assert.ok(r.userGame && typeof r.userGame.won === 'boolean' && r.userGame.line);
  }
  assert.ok(res.reports.some((r) => r.messages.length > 0), 'weekly notes reach the inbox');

  // determinism: the same seed replays the identical season
  const again = run(7);
  assert.equal(again.state.season.playoffs.championId, champ);
  deq(again.state.history.seasons[0].stats, line.stats);
  deq(again.state.season.schedule.map((g) => [g.id, g.score.home, g.score.away]), season.schedule.map((g) => [g.id, g.score.home, g.score.away]));
  deq(again.res.phases, res.phases);
});

test('a full NFL season: 18 REG weeks with a bye, 4 playoff weeks (WC/DIV/CONF), Championship Bowl winner, 32 kicker stat lines, awards', () => {
  const state = enrol(RTG, 'NFL', { seed: 11 });
  const rng = RTG.RNG.create(11);
  Season.start(state, rng);
  const t0 = process.hrtime.bigint();
  const res = playSeason(RTG, state, rng, { validateEvery: 6 });
  stash.nflMs = Number(process.hrtime.bigint() - t0) / 1e6;
  stash.nfl = state;
  const season = state.season, p = state.player;
  ok(state, 'NFL OFF');

  assert.equal(res.phases[0], 'PRE'); assert.equal(res.phases[1], 'REG');
  deq(res.phases.slice(-2), ['AWARDS', 'OFF']);
  if (res.phases.length === 5) assert.equal(res.phases[2], 'POST');
  const regReports = res.reports.filter((r) => r.week <= TS.nfl.regWeeks);
  assert.equal(regReports.length, TS.nfl.regWeeks, '18 regular-season weeks');
  assert.equal(regReports.filter((r) => r.bye).length, 1, 'exactly one bye week');
  const bye = regReports.find((r) => r.bye);
  assert.ok(bye.week >= TS.nfl.byeWeeks[0] && bye.week <= TS.nfl.byeWeeks[1], 'bye inside weeks 5–14');
  assert.equal(res.userGames + (res.phases.indexOf('POST') >= 0 ? 0 : 0) >= TS.nfl.games, true);
  assert.equal(state.week, TS.nfl.totalWeeks, 'ends at week 22');

  const k = byKind(season.schedule);
  assert.equal(k.REG.n, 272); assert.equal(k.REG.played, 272);
  assert.equal(k.WC.n, 6); assert.equal(k.DIV.n, 4); assert.equal(k.CONF.n, 2); assert.equal(k.CHAMP.n, 1);
  for (const kind of ['WC', 'DIV', 'CONF', 'CHAMP']) assert.equal(k[kind].played, k[kind].n, kind + ' games played');
  deq(Object.keys(k.WC.weeks), [String(TS.nfl.playoffWeeks[0])]); deq(Object.keys(k.CHAMP.weeks), [String(TS.nfl.playoffWeeks[3])]);
  assert.ok(season.playoffs.complete); assert.equal(season.bowls, null);
  const champ = season.playoffs.championId;
  assert.ok(Schema.teamIn(state.leagues.nfl, champ), 'Championship Bowl winner is a league team');
  const title = season.schedule.find((g) => g.kind === 'CHAMP');
  assert.equal(title.score.home > title.score.away ? title.homeId : title.awayId, champ);
  assert.ok(title.neutral && title.site, 'the final is at a neutral site');
  assert.equal(season.playoffs.seeds.length, 2 * TS.nfl.playoffPerConf);

  assert.equal(Object.keys(season.kickerStats).length, 32);
  assert.ok(Object.values(season.kickerStats).filter((s) => s.fga + s.pat > 0).length >= 30);
  assert.ok(season.awardsList.some((a) => a.id === 'GOLDEN_LEG'));
  assert.ok(season.awardsList.some((a) => a.id === 'STPOY'), 'STPOY (winner or "a punter won it")');
  assert.equal(state.history.seasons.length, 1);
  const line = state.history.seasons[0];
  const rows = userRows(state, 5, 'NFL');
  assert.equal(line.stats.fga, rows.filter((r) => r.type === 'FG').length);
  assert.equal(line.stats.pat, rows.filter((r) => r.type === 'PAT').length);
  assert.equal(p.nflSeasons, 1);
  assert.equal(state.leagues.nfl.seasonHistory[0].championId, champ);
  assert.ok(state.inbox.some((m) => m.tpl && String(m.tpl).indexOf('ar') === 0) || state.inbox.some((m) => /Rookie deal|Welcome to the league/.test(m.text)), 'week-1 agent rookie note');
});

// ═══════════════════════════════ endWeek guards ═══════════════════════════════

test('endWeek refuses with a pending event, in PRE, with an unplayed game, or with a game in progress', () => {
  const state = enrol(RTG, 'COLLEGE', { seed: 5 });
  const rng = RTG.RNG.create(5);
  Season.start(state, rng);
  // With RTG.Career loaded, Season.start opens the §2.2 preseason camp battle (the data K1 is the rival) as a
  // pending KICKS session; endWeek refuses on any pending first, so settle it before probing the phase guard.
  if (state.pending) assert.throws(() => Season.endWeek(state, rng), /pending KICKS/);
  while (state.pending) settle(RTG, state, rng);
  assert.throws(() => Season.endWeek(state, rng), /not in season/);
  Season.beginRegular(state, rng);
  assert.equal(state.phase, 'REG'); assert.equal(state.week, 1);
  state.pending = { kind: 'EVENT', event: { id: 'KID_LESSON', text: 'x', sender: 'fan', choices: [{ label: 'a', preview: '' }], rolledWeek: 1, rolledYear: 1 } };
  assert.throws(() => Season.endWeek(state, rng), /pending EVENT/);
  state.pending = null;
  const ref = Season.userGameRef(state);
  assert.ok(ref && !ref.played, 'week 1 game scheduled');
  assert.throws(() => Season.endWeek(state, rng), /play or sim/);
  const gs = RTG.Sim.startGame(state, rng, { league: 'COLLEGE', gameId: ref.gameId });
  assert.equal(state.game, gs);
  assert.throws(() => Season.endWeek(state, rng), /in progress/);
  const summary = Season.simUserGameAuto(state, rng);        // resumes state.game
  assert.ok(summary && summary.gameId === ref.gameId);
  assert.equal(state.game, null); assert.equal(state.season.weekGameDone, true);
  assert.equal(Season.simUserGameAuto(state, rng), null, 'the week\'s game is done → null');
  const rep = Season.endWeek(state, rng);
  assert.equal(rep.week, 1); assert.equal(state.week, 2); assert.equal(rep.nextWeek, 2);
  assert.equal(rep.userGame.gameId, ref.gameId);
  assert.ok(Object.keys(state.season.rankings).length === 48 && state.season.rankings[state.player.teamId].rank >= 1);
  deq(state.season.rankingsPrev, state.season.rankings, 'the poll snapshot for next week');
  ok(state, 'week 2');
});

test('userGameRef: the game of the week, null on a bye (NFL bye week; college week 13 without a CCG), null outside REG/POST', () => {
  const nfl = enrol(RTG, 'NFL', { seed: 6 });
  const rng = RTG.RNG.create(6);
  Season.start(nfl, rng);
  assert.equal(Season.userGameRef(nfl), null, 'PRE → null');
  Season.beginRegular(nfl, rng);
  const ref = Season.userGameRef(nfl);
  assert.ok(ref); assert.equal(ref.week, 1); assert.equal(ref.league, 'NFL'); assert.equal(ref.kind, 'REG');
  assert.equal(ref.isHome ? ref.homeId : ref.awayId, nfl.player.teamId); assert.notEqual(ref.oppId, nfl.player.teamId);
  assert.equal(ref.gameId, nfl.season.userGameId);
  const weeks = new Set(nfl.season.schedule.filter((g) => g.homeId === nfl.player.teamId || g.awayId === nfl.player.teamId).map((g) => g.week));
  let byeWeek = 0;
  for (let w = 1; w <= TS.nfl.regWeeks; w++) if (!weeks.has(w)) byeWeek = w;
  assert.ok(byeWeek >= TS.nfl.byeWeeks[0] && byeWeek <= TS.nfl.byeWeeks[1]);
  nfl.week = byeWeek; nfl.season.userGameId = null;
  assert.equal(Season.userGameRef(nfl), null, 'bye → null');
  assert.equal(Season.simUserGameAuto(nfl, rng), null, 'nothing to play on a bye');

  const col = enrol(RTG, 'COLLEGE', { seed: 6 });
  Season.start(col, RTG.RNG.create(6)); Season.beginRegular(col, RTG.RNG.create(6));
  col.week = TS.college.ccgWeek; col.season.userGameId = null;
  assert.equal(Season.userGameRef(col), null, 'week 13 without a conference title game → null');
  col.phase = 'AWARDS';
  assert.equal(Season.userGameRef(col), null);
});

// ═══════════════════════════════ injuries & modifiers ═══════════════════════════════

test('injuries tick down in endWeek (the rival kicks meanwhile) and count toward flags.seasonInjuryWeeks', () => {
  const state = enrol(RTG, 'COLLEGE', { seed: 12 });
  const rng = RTG.RNG.create(12);
  Season.start(state, rng);
  while (state.pending) settle(RTG, state, rng);          // camp battle (Career loaded) → auto kicks
  Season.beginRegular(state, rng);
  const p = state.player;
  p.injury = { type: 'QUAD', label: 'quad', weeksLeft: 2, careerThreat: false };
  Season.simUserGameAuto(state, rng);
  assert.equal(userRows(state, 1, 'COLLEGE').length, 0, 'an injured user does not kick');
  let rep = Season.endWeek(state, rng);
  assert.ok(p.injury && p.injury.weeksLeft === 1);
  deq(rep.injuries, { active: true, weeksLeft: 1, cleared: false, isNew: true });
  assert.ok(state.inbox.some((m) => m.from === 'family'), 'the family worries');
  assert.ok(state.history.timeline.some((t) => t.kind === 'INJURY'));
  Season.simUserGameAuto(state, rng);
  rep = Season.endWeek(state, rng);
  assert.equal(p.injury, null);
  assert.equal(rep.injuries.cleared, true); assert.equal(rep.injuries.active, false);
  assert.equal(state.flags.seasonInjuryWeeks, 2);
  assert.ok(state.history.timeline.some((t) => t.kind === 'RETURN'));
  ok(state, 'after injury');
});

test('modifiers expire: week-scoped in endWeek, season-scoped in finishSeason, never-expiring stay', () => {
  const state = enrol(RTG, 'COLLEGE', { seed: 13 });
  const rng = RTG.RNG.create(13);
  Season.start(state, rng);
  while (state.pending) settle(RTG, state, rng);          // camp battle (Career loaded) → auto kicks
  Season.beginRegular(state, rng);
  const p = state.player, P = RTG.Player;
  P.addMod(p, { id: 'w-now', key: 'sigma', op: 'mul', value: 0.9, expires: { type: 'week', at: state.week }, label: 'this week' });
  P.addMod(p, { id: 'w-later', key: 'sigma', op: 'mul', value: 0.95, expires: { type: 'week', at: state.week + 3 }, label: 'later' });
  P.addMod(p, { id: 's-season', key: 'pressure', op: 'add', value: 0.05, expires: { type: 'season', at: state.year }, label: 'season' });
  P.addMod(p, { id: 'never', key: 'windDrift', op: 'mul', value: 0.95, expires: { type: 'never', at: 0 }, label: 'forever' });
  Season.simUserGameAuto(state, rng);
  Season.endWeek(state, rng);
  const ids = () => p.mods.map((m) => m.id).sort();
  deq(ids(), ['never', 's-season', 'w-later']);
  const line = Season.finishSeason(state, rng);
  assert.equal(state.phase, 'AWARDS');
  assert.ok(line && line.year === 1);
  deq(ids(), ['never', 'w-later'], 'season mods expire at the season close');
  assert.equal(Season.finishSeason(state, rng), line, 'finishSeason is idempotent');
  assert.equal(state.history.seasons.length, 1);
  assert.equal(Season.offseason(state, rng), hasCareer ? Season.offseason(state, rng) : null);
  assert.equal(state.phase, 'OFF');
  ok(state, 'OFF after early finish');
});

// ═══════════════════════════════ simOtherGames ═══════════════════════════════

test('simOtherGames: skips the user\'s game, records results, refreshes tables, is idempotent, forks per game deterministically', () => {
  const mk = () => { const s = enrol(RTG, 'COLLEGE', { seed: 14 }); const r = RTG.RNG.create(14); Season.start(s, r); Season.beginRegular(s, r); return { s, r }; };
  const a = mk(), b = mk();
  const weekGames = RTG.Schedule.gamesInWeek(a.s.season.schedule, 1);
  const before = a.r.state();
  const out = Season.simOtherGames(a.s, a.r);
  assert.equal(out.length, weekGames.length - 1, 'every game but the user\'s');
  const userGame = Season.userGameRef(a.s).game;
  assert.equal(userGame.played, false, 'the user\'s game is left to the user');
  assert.ok(weekGames.filter((g) => g !== userGame).every((g) => g.played && g.score));
  let w = 0, l = 0;
  for (const id of Object.keys(a.s.season.results)) { w += a.s.season.results[id].w; l += a.s.season.results[id].l; }
  assert.equal(w + l + Object.values(a.s.season.results).reduce((n, r) => n + r.t, 0), 2 * out.length, 'one result row per team per game');
  assert.equal(a.s.season.standings.length, 48);
  assert.ok(a.s.season.standings.some((row) => row.w === 1));
  const snap = J(weekGames);
  const again = Season.simOtherGames(a.s, a.r);
  assert.equal(again.length, 0, 'nothing left to simulate');
  deq(weekGames, snap, 'played games untouched');
  // same seed, independent state → identical scores (rng.fork per game)
  const out2 = Season.simOtherGames(b.s, b.r);
  deq(out2, out);
  assert.notEqual(a.r.state(), before, 'the parent rng advanced');
});

// ═══════════════════════════════ job security: bench / cut / lost job ═══════════════════════════════

test('§2.2 NFL: js < 25 benches (K2 + coach note); js < 10 for 3 weeks → released: no team/contract, vet-minimum offers pending or the cut-day event', () => {
  const state = enrol(RTG, 'NFL', { seed: 15 });
  const rng = RTG.RNG.create(15);
  Season.start(state, rng); Season.beginRegular(state, rng);
  const p = state.player, teamId = p.teamId;
  p.js = 5; p.trust = 0;                                       // floor trust/5 = 0
  p.injury = { type: 'HIP_FLEXOR', label: 'hip flexor', weeksLeft: 10, careerThreat: false };   // no kicks → no positive deltas
  let cutRep = null, benchRep = null;
  for (let i = 0; i < 4 && !cutRep; i++) {
    while (state.pending) settle(RTG, state, rng);
    if (Season.userGameRef(state)) Season.simUserGameAuto(state, rng);
    const rep = Season.endWeek(state, rng);
    if (rep.bench && !benchRep) benchRep = rep;
    if (rep.cut) cutRep = rep;
  }
  assert.ok(benchRep, 'benched on the way down');
  assert.equal(benchRep.week, 1);
  assert.ok(state.inbox.some((m) => m.tpl === 'cb1' || m.tpl === 'cb2'), 'coach_bench note');
  assert.ok(cutRep, 'cut after three weeks under the line');
  assert.equal(cutRep.week, Tuning.soft.js.cutWeeks);
  assert.equal(cutRep.cut.league, 'NFL'); assert.equal(cutRep.cut.teamId, teamId);
  assert.equal(p.teamId, null); assert.equal(p.role, 'NONE'); assert.equal(p.contract, null);
  assert.equal(state.flags.midSeasonCut.teamId, teamId);
  const stint = state.history.teams[state.history.teams.length - 1];
  assert.equal(stint.teamId, teamId); assert.equal(stint.toYear, state.year);
  assert.ok(state.headlines.some((h) => h.tag === 'cut'));
  if (cutRep.cut.offers > 0) {
    assert.ok(state.pending && state.pending.kind === 'DECISION');
    assert.equal(state.pending.decision.kind, 'FREE_AGENCY');
    assert.equal(state.pending.decision.payload.mode, 'MIN');
    assert.ok(state.pending.decision.payload.offers.every((o) => o.teamId !== teamId), 'the releasing team does not bid');
  } else {
    assert.equal(state.flags.cutNoOffers, true);
    assert.ok(state.pending && state.pending.kind === 'EVENT' && state.pending.event.id === 'CUT_DAY_CALL');
  }
  ok(state, 'after cut');
  assert.throws(() => Season.endWeek(state, rng), /pending/);
  state.pending = null;
  const rep = Season.endWeek(state, rng);                      // no team → the week is a bye for the user
  assert.equal(rep.bye, true);
  assert.equal(Season.userGameRef(state), null);
  ok(state, 'released, week after');
});

test('§2.2 college: three weeks under the cut line lose the job for the season (K2, no restore, portal flag)', () => {
  const state = enrol(RTG, 'COLLEGE', { seed: 16 });
  const rng = RTG.RNG.create(16);
  Season.start(state, rng); Season.beginRegular(state, rng);
  const p = state.player;
  p.js = 5; p.trust = 0;
  p.injury = { type: 'HIP_FLEXOR', label: 'hip flexor', weeksLeft: 10, careerThreat: false };
  let lost = null;
  for (let i = 0; i < 4 && !lost; i++) {
    while (state.pending) settle(RTG, state, rng);
    if (Season.userGameRef(state)) Season.simUserGameAuto(state, rng);
    const rep = Season.endWeek(state, rng);
    if (rep.cut) lost = rep;
  }
  assert.ok(lost && lost.cut.lostJob, 'lost the job');
  assert.equal(p.role, 'K2'); assert.equal(p.flags.lostJob, 1); assert.equal(p.teamId, Schema.userTeam(state).id, 'still on the roster');
  assert.equal(p.contract.type, 'SCHOLARSHIP');
  p.js = 90; p.injury = null;
  while (state.pending) settle(RTG, state, rng);
  if (Season.userGameRef(state)) Season.simUserGameAuto(state, rng);
  Season.endWeek(state, rng);
  assert.equal(p.role, 'K2', 'no restore this season');
  ok(state, 'lost job');
});

// ═══════════════════════════════ advanceYear ═══════════════════════════════

test('advanceYear: age +1 (ageTick once), coach churn, both leagues drift within 50–92, AI kickers age / retire / rookies re-sign, contract tick, cap +5 % / vetMin +4 %, year++ → PRE', (t) => {
  const state = stash.college;
  if (!state) { t.skip('needs the full college season'); return; }
  const rng = RTG.RNG.create(77);
  const p = state.player;
  const age0 = p.age, year0 = state.year;
  const college = state.leagues.college, nfl = state.leagues.nfl;
  const cap0 = nfl.cap, vet0 = nfl.vetMin;
  // forced AI kicker cases (not the user's team)
  const others = college.teams.filter((tm) => tm.id !== p.teamId);
  const oldK = others[0].kicker, badK = others[1].kicker, expK = others[2].kicker;
  oldK.age = Tuning.season.aiForceRetireAge - 1; badK.attrs = { POW: 40, ACC: 40, CON: 40, CLU: 40, KO: 40 }; expK.contractYears = 1;
  const oldName = oldK.name, badName = badK.name;
  // ageTick is idempotent within the year
  const bc = Season.ageTick(state, rng);
  assert.equal(p.age, age0 + 1); assert.equal(bc.year, year0); assert.ok(Array.isArray(bc.changes));
  assert.equal(Season.ageTick(state, rng), bc); assert.equal(p.age, age0 + 1, 'no double aging');

  const rep = Season.advanceYear(state, rng);
  assert.equal(state.year, year0 + 1); assert.equal(p.age, age0 + 1, 'advanceYear did not age again');
  assert.equal(state.phase, 'PRE'); assert.equal(state.week, 0);
  assert.equal(state.season.year, year0 + 1); assert.equal(college.year, year0 + 1); assert.equal(nfl.year, year0 + 1);
  assert.equal(state.season.schedule.length, 288); assert.ok(state.season.schedule.every((g) => !g.played));
  assert.equal(state.season.finished, false); assert.equal(state.season.playoffs, null);
  assert.equal(state.history.seasons.length, 1, 'the finished season stays in history');
  for (const lg of [college, nfl]) for (const tm of lg.teams) {
    assert.ok(tm.OFF >= Tuning.league.ratingMin && tm.OFF <= Tuning.league.ratingMax, tm.id + ' OFF');
    assert.ok(tm.DEF >= Tuning.league.ratingMin && tm.DEF <= Tuning.league.ratingMax, tm.id + ' DEF');
    assert.ok(tm.kicker || tm.kicker2, 'every team keeps an AI kicker');
  }
  assert.ok(rep.retirements.some((r) => r.teamId === others[0].id) && others[0].kicker.name !== oldName && others[0].kicker.age === Tuning.league.aiKicker.rookie.age, 'the 45-year-old retired for a 22-year-old rookie');
  assert.ok(rep.retirements.some((r) => r.teamId === others[1].id) && others[1].kicker.name !== badName, 'ovr < 55 → replaced');
  assert.ok(others[2].kicker.contractYears >= Tuning.season.aiResignYears[0] && others[2].kicker.contractYears <= Tuning.season.aiResignYears[1], 'an expired deal is re-signed');
  assert.ok(rep.rookies.length >= 2);
  const kept = others.find((tm) => tm.kicker && tm.kicker.name !== oldName && tm !== others[0] && tm !== others[1] && rep.retirements.every((r) => r.teamId !== tm.id));
  assert.ok(kept, 'most kickers stay');
  deq(rep.contract, { type: 'SCHOLARSHIP', yearIdx: 1, years: 4, expired: false });
  assert.equal(p.contract.yearIdx, 1);
  assert.equal(nfl.cap, RTG.Util.round1(cap0 * (1 + Tuning.contracts.capGrowth)));
  assert.equal(nfl.vetMin, RTG.Util.roundN(vet0 * (1 + Tuning.contracts.vetMinGrowth), 2));
  assert.equal(nfl.tagValue, RTG.Contracts.tagValue(nfl));
  assert.equal(p.flags.agedYear, year0); assert.equal(state.flags.bodyCheck.year, year0);
  assert.equal(state.flags.seasonInjuryWeeks, 0);
  assert.equal(Object.keys(state.season.kickerStats).length, 48);
  assert.ok(Array.isArray(rep.coachChanges));
  ok(state, 'year 2 PRE');
  // year 2 opens normally
  Season.beginRegular(state, rng);
  assert.ok(Season.userGameRef(state), 'a week-1 game in year 2');
});

// ═══════════════════════════════ runtime ═══════════════════════════════

test('runtime: a full college season < 250 ms (engine in the main context; the vm harness time is reported)', () => {
  // test/load.js evaluates the engine inside a vm context whose global lookups are ~5× slower than a browser or a
  // plain script (schema.js notes the same). The §2.13 budget is an engine budget, so it is asserted on the same
  // files evaluated in this process's main context; the harness numbers are printed for the record.
  const files = load.ORDER.map((n) => path.join(load.ROOT, n + '.js')).filter((f) => fs.existsSync(f));
  for (const f of files) vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
  const M = globalThis.RTG;
  assert.ok(M && M.Season && M.Season.start, 'engine loaded in the main context');
  const run = (seed) => {
    const state = enrol(M, 'COLLEGE', { seed, strong: true });
    const rng = M.RNG.create(seed);
    M.Season.start(state, rng);
    const t0 = process.hrtime.bigint();
    const res = playSeason(M, state, rng);
    return { ms: Number(process.hrtime.bigint() - t0) / 1e6, res, state };
  };
  const cold = run(21);
  const warm = run(22);
  assert.equal(warm.state.phase, 'OFF'); assert.ok(warm.state.season.playoffs.championId);
  console.log('season runtime — main context: cold ' + cold.ms.toFixed(0) + ' ms, warm ' + warm.ms.toFixed(0) + ' ms · vm harness: college '
    + (stash.collegeMs === undefined ? '?' : stash.collegeMs.toFixed(0)) + ' ms, NFL ' + (stash.nflMs === undefined ? '?' : stash.nflMs.toFixed(0)) + ' ms');
  assert.ok(warm.ms < 250, 'full college season (warm) ' + warm.ms.toFixed(0) + ' ms < 250 ms');
  if (stash.collegeMs !== undefined) assert.ok(stash.collegeMs < 2000, 'vm-harness season under a sanity bound: ' + stash.collegeMs.toFixed(0) + ' ms');
});
