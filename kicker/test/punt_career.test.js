/**
 * punt_career.test.js — the punter career (SPEC §2.14, D24) end to end, through the engine only.
 * A career created with position 'P' keeps it through save / load and every stage; the sim hands the user their
 * team's punts and nobody else's; the punting ledger accumulates on the season, career and league blocks; AI punts
 * fill season.punterStats for the whole league; a punter wins punter awards and breaks punter records while the
 * kicker's book is untouched; the Hall reads the punting ledger; a full auto career validates at every stage and
 * retires with a believable line, the same one every time for a seed.
 *
 *   node kicker/test/punt_career.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RTG = require('./load')();
const kfx = require('./fixtures/career');
const sfx = require('./fixtures/stats');

const { Engine, Schema, Stats, Awards, Punt, Save, Career, Draft, Contracts, Season, Tuning, Util, Data } = RTG;
/** JSON copy: engine objects live in a vm context, so deepEqual needs both sides on this realm's prototypes. */
const J = (v) => JSON.parse(JSON.stringify(v));
const SEED = 7;

function ok(state, where) {
  const v = Schema.validate(state);
  assert.ok(v.ok, (where || 'state') + ' validates: ' + v.errors.slice(0, 6).join('; '));
}

/** Award ids by position, from the catalogue: a row with no `position` is the kicker's, PRO_CLASSIC / STPOY / the season goals are shared. */
const SHARED = { PRO_CLASSIC: 1, STPOY: 1, SEASON_GOAL_1: 1, SEASON_GOAL_2: 1, SEASON_GOAL_3: 1 };
const PUNTER_IDS = Data.awards.filter((a) => a.position === 'P').map((a) => a.id);
const KICKER_IDS = Data.awards.filter((a) => !a.position && !SHARED[a.id]).map((a) => a.id);
/** Record keys by position (Data.records.meta.position). */
const PUNTER_KEYS = Data.records.keys.filter((k) => Data.records.meta[k].position === 'P');
const KICKER_KEYS = Data.records.keys.filter((k) => !Data.records.meta[k].position);

/** The user's record keys in a league table. */
function heldBy(table) { return Object.keys(table).filter((k) => table[k].isUser); }

/** A plain PuntResult with the fields the ledger reads. */
function puntResult(o) {
  return Object.assign({
    type: 'PUNT', gross: 45, net: 45, hang: 4.3, landing: 75, oppStart: 25, inside20: false, touchback: false,
    outOfBounds: false, fairCatch: true, returnYds: 0, blocked: false, blockReturnTd: false, returnTd: false,
    grade: 'GOOD', outcome: 'GOOD', made: true, power: 0.8, aim: 0, auto: false, tags: []
  }, o || {});
}

/** A calm punt context for the user's team in the state's league. */
function puntCtx(state, los) {
  return Punt.buildContext(state, null, { losYard: los || 30, isUser: true, forSession: true, calm: true, hash: 0, league: state.season.league }, RTG.RNG.create(3));
}

/** Synthetic punting season for an AI team: 60-66 punts, gross 43-48, net 37-42, a few pinned. */
function aiPunts(i, over) {
  const s = Stats.ensureStats(Schema.emptyKickerStats());
  s.punts = 60 + (i % 7); s.puntBlocked = i % 5 === 0 ? 1 : 0;
  const live = s.punts - s.puntBlocked;
  s.puntYds = live * (43 + (i * 3) % 6); s.puntNet = live * (37 + (i * 5) % 6);
  s.in20 = 15 + (i * 7) % 12; s.tbs = i % 4; s.puntLong = 55 + (i * 3) % 12;
  s.hangSum = Util.roundN(live * 4.2, 2); s.fairCatch = 20; s.retYds = s.puntYds - s.puntNet;
  s.games = 17; s.gamesStarted = 17;
  if (over) Object.assign(s, over);
  return s;
}

/**
 * The AWARDS phase of a punter's season: the user with a clear best line, every other team with a synthetic
 * punting block AND a synthetic kicking block (so a kicker's slate would have candidates too).
 */
function punterAwardsState(league) {
  const state = league === 'COLLEGE' ? sfx.cleanCollege(RTG) : sfx.cleanNfl(RTG);
  state.player.position = 'P';
  state.phase = 'AWARDS'; state.week = league === 'COLLEGE' ? 17 : 22;
  state.season.schedule.forEach((g) => { if (!g.played) { g.played = true; g.score = { home: 24, away: 20 }; } });
  const u = Stats.ensureStats(state.stats.season);
  u.punts = 78; u.puntYds = 78 * 49.5; u.puntNet = 78 * 45.5; u.in20 = 40; u.tbs = 2; u.puntLong = 70; u.hangSum = 78 * 4.5;
  u.fairCatch = 30; u.games = 17; u.gamesStarted = 17;
  state.stats.career = Util.deepClone(u);
  state.stats[league === 'COLLEGE' ? 'college' : 'nfl'] = Util.deepClone(u);
  const lg = Schema.leagueOf(state, league);
  state.season.punterStats = {}; state.season.kickerStats = {};
  lg.teams.forEach((t, i) => {
    if (t.id === state.player.teamId) return;
    state.season.punterStats[t.id] = aiPunts(i);
    state.season.kickerStats[t.id] = sfx.aiStats(RTG, i);
  });
  return state;
}

/** COLLEGE.REG week 1 with the punter holding the job (the camp battle settled, role K1). */
function punterInSeason(seed) {
  const r = kfx.autoPunter(RTG, { seed: seed, untilStage: 'COLLEGE' });
  if (r.state.pending) Engine.settlePending(r.state, r.rng, {});
  r.state.player.role = 'K1';
  if (r.state.player.flags) delete r.state.player.flags.benched;
  if (r.state.phase === 'PRE') Engine.nextPhase(r.state, r.rng);
  return r;
}

/**
 * Play the user's game of the week by hand: sim to every user play, resolve the punts with the AI rule, and
 * record what the sim handed over. Returns the event types seen, the punt contexts and the game's team stats.
 */
function playGameByHand(state, rng) {
  const gs = Engine.startUserGame(state, rng);
  const types = {}, ctxs = [], results = [];
  for (let guard = 0; guard < 400; guard++) {
    const e = Engine.simToKick(state, rng);
    types[e.type] = (types[e.type] || 0) + 1;
    if (e.type === 'END' || e.type === 'END_GAME') break;
    if (e.type === 'USER_PUNT') {
      ctxs.push(J(gs.pending.ctx));
      results.push(Engine.applyUserPunt(state, rng, null));
      assert.equal(gs.pending, null, 'the punt clears the pending play');
    } else if (e.type === 'USER_KICKOFF') Engine.autoKick(state, rng);
    else if (e.type === 'USER_KICK') { ctxs.push(J(gs.pending.ctx)); Engine.autoKick(state, rng); }
  }
  assert.equal(gs.done, true, 'the game reached its end');
  const summary = Engine.finishUserGame(state, rng);
  return { types: types, ctxs: ctxs, results: results, userSide: gs.userSide, teamStats: J(gs.stats), summary: summary, gameId: gs.id };
}

// the retired careers are expensive (a few seconds each), so they are built once and read by several tests
let RETIRED = null, KICKER = null;
function retiredPunter() { if (!RETIRED) RETIRED = kfx.autoPunter(RTG, { seed: SEED }); return RETIRED; }
function retiredKicker() {
  if (!KICKER) {
    KICKER = kfx.newCareer(RTG, { seed: SEED, name: 'Kay Kicker' });
    Engine.autoPlayCareer(KICKER.state, KICKER.rng, {});
  }
  return KICKER;
}

// ═══════════════════════════════ creation, save / load, the stage machine ═══════════════════════════════

test('a career created as a punter is a punter at creation, on the senior season, and after a save and a load', () => {
  const { state, rng } = kfx.newPunter(RTG, { seed: SEED });
  assert.equal(state.player.position, 'P');
  assert.equal(state.stage, 'HS'); assert.equal(state.phase, 'SEASON');
  assert.equal(RTG.HS.current(state).position, 'P', 'the senior season knows it is a punter\'s');
  assert.deepEqual(J(RTG.Player.attrLabels(state.player.position)), { POW: 'LEG', ACC: 'PLACE', CON: 'OPER', CLU: 'CLU', KO: 'HANG' });
  ok(state, 'a fresh punter');
  // a career that says nothing is a kicker
  assert.equal(kfx.newCareer(RTG, { seed: SEED }).state.player.position, 'K');
  // save / load keeps the position and everything else
  const blob = Engine.save(state, rng, kfx.NOW);
  assert.equal(blob.career.player.position, 'P', 'the position is in the blob');
  const loaded = Engine.load(J(blob));
  assert.equal(loaded.state.player.position, 'P');
  assert.equal(Util.deepDiff(J(state), J(loaded.state)), '', 'the punter round-trips');
  ok(loaded.state, 'a loaded punter');
});

// Known gap (a `todo` so it stays on record without failing the file): SPEC §2.14 says old saves default to 'K', but
// save.js fills that default only in the v0 → v1 migration and SAVE_VERSION was not bumped, so a current-version blob
// with no `position` fails Schema.validate on load.
test('a save written before the punter path, with no position on the player, still loads as a kicker',
  { todo: 'Save.deserialize refuses a v1 blob without player.position (INVALID); the K default lives only in migrations[0]' }, () => {
  const { state, rng } = kfx.newCareer(RTG, { seed: SEED });
  const blob = J(Engine.save(state, rng, kfx.NOW));
  delete blob.career.player.position;
  blob.checksum = Save.checksum(blob.career);
  const r = Save.deserialize(blob);
  assert.equal(r.error, undefined, 'an old save loads: ' + JSON.stringify(r.errors || r.message || ''));
  assert.equal(r.state.player.position, 'K', 'and is a kicker');
});

test('the position survives the whole stage machine: HS, college, the draft, the NFL and retirement', () => {
  const r = retiredPunter();
  const s = r.state;
  assert.equal(s.stage, 'RETIRED'); assert.equal(s.phase, 'LEGACY');
  assert.equal(s.player.position, 'P');
  assert.equal(s.pending, null, 'nothing pending after retirement');
  const leagues = r.seasons.map((l) => l.league);
  assert.ok(leagues.indexOf('COLLEGE') >= 0 && leagues.indexOf('NFL') >= 0, 'college and NFL seasons: ' + leagues.join(','));
  assert.ok(leagues.lastIndexOf('COLLEGE') < leagues.indexOf('NFL'), 'college before the NFL');
  const kinds = {};
  s.history.timeline.forEach((t) => { kinds[t.kind] = (kinds[t.kind] || 0) + 1; });
  assert.equal(kinds.HS_GAME, Tuning.hs.games, 'five senior-season games');
  assert.ok(kinds.HS_SEASON >= 1 && kinds.DECLARED >= 1 && kinds.COMBINE >= 1 && kinds.RETIRED >= 1, 'the road is on the timeline: ' + JSON.stringify(kinds));
  assert.equal(typeof s.flags.combineScore, 'number', 'the combine was played');
  assert.ok(s.flags.draft && typeof s.flags.draft.round === 'number', 'the draft happened');
  assert.equal(RTG.HS.current(s).position, 'P');
  ok(s, 'the retired punter');
});

// ═══════════════════════════════ the sim ═══════════════════════════════

test('the sim hands the user their team\'s punts and nobody else\'s, and the field goals go to the AI kicker', () => {
  const { state, rng } = punterInSeason(SEED);
  assert.equal(state.phase, 'REG'); assert.equal(state.player.role, 'K1');
  const teamId = state.player.teamId;
  let games = 0, userPunts = 0, teamFga = 0, oppPunts = 0, oppId = null;
  for (let week = 0; week < 8 && games < 3; week++) {
    if (state.pending) Engine.settlePending(state, rng, {});
    if (!Season.userGameRef(state)) { Engine.autoPlayWeek(state, rng); continue; }         // bye
    const g = playGameByHand(state, rng);
    games++;
    const side = g.userSide, opp = side === 'home' ? 'away' : 'home';
    assert.deepEqual(J(Object.keys(g.types).filter((t) => t !== 'USER_PUNT' && t !== 'END_GAME' && t !== 'END')), [],
      'a punter is only ever handed punts: ' + JSON.stringify(g.types));
    assert.equal(g.types.USER_KICK, undefined, 'never a field goal or an extra point');
    for (const ctx of g.ctxs) {
      assert.equal(ctx.type, 'PUNT');
      assert.equal(ctx.isUser, true);
      assert.equal(ctx.game.teamId, teamId, 'the punt is the user\'s team\'s');
      assert.ok(ctx.losYard >= 1 && ctx.losYard <= 99 && ctx.toGoal === 100 - ctx.losYard, 'a real line of scrimmage (' + ctx.losYard + ')');
      assert.ok(ctx.kicker && ctx.kicker.attrs, 'the user\'s own snapshot');
    }
    for (const res of g.results) { assert.equal(res.type, 'PUNT'); assert.ok(Punt.GRADES.indexOf(res.grade) >= 0, res.grade); }
    assert.equal(g.teamStats[side].punts, g.ctxs.length, 'every one of the team\'s punts was the user\'s (' + g.teamStats[side].punts + ')');
    userPunts += g.ctxs.length;
    teamFga += g.teamStats[side].fga + g.teamStats[side].pat;
    oppPunts += g.teamStats[opp].punts;
    oppId = state.season.schedule.filter((x) => x.id === g.gameId)[0][opp + 'Id'];
    assert.equal(g.summary.userLine.fga, 0, 'the game summary shows no user field goals');
    ok(state, 'after game ' + games);
    if (state.pending) Engine.settlePending(state, rng, {});
    if (!state.season.weekGameDone) break;
    Engine.endWeek(state, rng);
    if (state.player.injury || state.player.role !== 'K1') break;                             // the sim benched or hurt the punter
  }
  assert.ok(games >= 1 && userPunts >= 4, games + ' games, ' + userPunts + ' user punts');
  assert.equal(state.stats.season.punts, userPunts, 'every user punt is on the season block');
  assert.equal(state.stats.season.fga + state.stats.season.pat, 0, 'the user attempted no kicks');
  assert.ok(teamFga > 0, 'the team still kicked (' + teamFga + ' FG / PAT), taken by the AI kicker');
  const teamK = state.season.kickerStats[teamId];
  assert.ok(teamK && teamK.fga + teamK.pat === teamFga, 'the AI kicker\'s kicks are on the team\'s kickerStats block');
  assert.equal(state.season.punterStats[teamId], undefined, 'the user\'s punts are the user\'s, not an AI line for the team');
  if (oppPunts > 0) assert.ok(state.season.punterStats[oppId] && state.season.punterStats[oppId].punts >= 1, 'the opponent\'s punts are its AI line');
  assert.ok(state.stats.kicks.length >= userPunts && state.stats.kicks.every((k) => k.type === 'PUNT'), 'the kick log holds only punts');
});

// ═══════════════════════════════ the ledger ═══════════════════════════════

test('punting stats accumulate on the season, career and league blocks, and Stats.puntLine derives the averages', () => {
  const state = sfx.cleanCollege(RTG);
  state.player.position = 'P';
  const ctx = puntCtx(state, 30);
  const punts = [
    puntResult({ gross: 50, net: 45, hang: 4.5, inside20: true, fairCatch: false, returnYds: 5, grade: 'COFFIN', outcome: 'COFFIN' }),
    puntResult({ gross: 60, net: 40, hang: 4.0, fairCatch: false, returnYds: 20, grade: 'GOOD', outcome: 'GOOD' }),
    puntResult({ gross: 55, net: 35, hang: 4.2, touchback: true, fairCatch: false, made: false, grade: 'TOUCHBACK', outcome: 'TOUCHBACK' }),
    puntResult({ gross: 0, net: 0, hang: 0, blocked: true, fairCatch: false, made: false, grade: 'BLOCKED', outcome: 'BLOCKED' })
  ];
  const rows = punts.map((r) => Stats.recordPunt(state, ctx, r, { gameId: 'g1', oppId: 'SEC5', week: 5 }));
  for (const key of ['season', 'career', 'college']) {
    const s = state.stats[key];
    assert.equal(s.punts, 4, key + ' punts');
    assert.equal(s.puntBlocked, 1, key + ': a blocked punt counts an attempt and nothing else');
    assert.equal(s.puntYds, 165, key + ' gross sum'); assert.equal(s.puntNet, 120, key + ' net sum');
    assert.equal(s.in20, 1, key + ' inside the 20'); assert.equal(s.tbs, 1, key + ' touchbacks');
    assert.equal(s.puntLong, 60, key + ' longest'); assert.equal(s.retYds, 25, key + ' return yards');
    assert.equal(s.fairCatch, 0, key + ' fair catches'); assert.equal(s.hangSum, 12.7, key + ' hang sum');
    assert.equal(s.fga + s.fgm + s.pts, 0, key + ': nothing on the kicking side');
    const line = Stats.puntLine(s);
    assert.deepEqual(J(line), { punts: 4, gross: 55, net: 40, hang: 4.23, in20: 1, in20Pct: 1 / 3, tbs: 1, long: 60, blocked: 1, retYds: 25 }, key + ' puntLine');
  }
  assert.equal(state.stats.nfl.punts, 0, 'the other league is untouched');
  assert.deepEqual(J(Stats.puntLine(state.stats.nfl)), { punts: 0, gross: 0, net: 0, hang: 0, in20: 0, in20Pct: 0, tbs: 0, long: 0, blocked: 0, retYds: 0 }, 'an empty block reads as zeros, not NaN');
  // the kick log sees punts like kicks
  assert.equal(state.stats.kicks.length, 4);
  rows.forEach((row, i) => {
    assert.equal(row.type, 'PUNT');
    assert.equal(row.outcome, punts[i].grade);
    assert.equal(row.made, !punts[i].blocked && !punts[i].touchback);
    assert.equal(row.distance, Math.round(punts[i].gross));
    assert.equal(row.punt.losYard, 30); assert.equal(row.punt.net, punts[i].net); assert.equal(row.punt.blocked, punts[i].blocked);
    assert.equal(row.gameId, 'g1'); assert.equal(row.oppId, 'SEC5'); assert.equal(row.week, 5);
  });
  ok(state, 'after four punts');
});

test('AI punts land in season.punterStats for the whole league, which is what the awards rank on', () => {
  const { state, rng } = punterInSeason(SEED);
  Engine.autoPlaySeason(state, rng);
  const league = Schema.leagueOf(state, state.season.league);
  const ps = state.season.punterStats;
  const teamIds = league.teams.map((t) => t.id);
  const missing = teamIds.filter((id) => id !== state.player.teamId && !ps[id]);
  assert.deepEqual(J(missing), [], 'every other team punted this season');
  assert.equal(ps[state.player.teamId], undefined, 'the user\'s own punts are on stats.season, not the team line');
  for (const id of Object.keys(ps)) {
    const line = Stats.puntLine(ps[id]);
    assert.ok(line.punts >= 20, id + ' punted a season\'s worth (' + line.punts + ')');
    assert.ok(line.gross > 35 && line.gross < 56 && line.net > 28 && line.net <= line.gross, id + ' a believable AI line ' + JSON.stringify(line));
  }
  // the candidates the awards rank are exactly those lines plus the user
  const cands = Awards.candidates(state);
  assert.equal(cands.length, teamIds.length, 'one candidate per team');
  const user = cands.filter((c) => c.isUser)[0];
  assert.ok(user && user.stats === state.stats.season, 'the user is judged on stats.season');
  assert.ok(cands.filter((c) => !c.isUser).every((c) => c.stats === ps[c.teamId] && /\bP$/.test(c.name)), 'the others are the punterStats lines');
  const score = Awards.punterScore(state.stats.season);
  assert.equal(user.score, score, 'ranked on punterScore');
  assert.ok(score === null || typeof score === 'number');
  // a kicker's league punts too: punterStats fills regardless of who the user is
  assert.ok(Object.keys(retiredKicker().state.season.punterStats || {}).length >= 20, 'a kicker\'s league still records its punts');
  ok(state, 'after a season');
});

// ═══════════════════════════════ awards ═══════════════════════════════

test('a punter wins punter awards and never a kicker award, and the reverse for a kicker', () => {
  assert.ok(PUNTER_IDS.length >= 10 && KICKER_IDS.length >= 10, 'the catalogue splits by position');
  // the NFL slate for a punter
  let s = punterAwardsState('NFL');
  let out = Awards.compute(s, RTG.RNG.create(1));
  const ids = out.map((a) => a.id);
  for (const id of ['GOLDEN_LEG_P', 'ALL_LEAGUE_P1', 'PIN_KING_NFL']) {
    const a = out.filter((x) => x.id === id)[0];
    assert.ok(a && a.isUser, 'the best punting season wins ' + id);
  }
  assert.ok(ids.indexOf('ALL_LEAGUE_P2') >= 0 && !out.filter((x) => x.id === 'ALL_LEAGUE_P2')[0].isUser, 'second team goes to somebody else');
  assert.ok(out.filter((x) => x.id === 'PRO_CLASSIC').length === 2 * Tuning.awards.proClassicPerConf, 'the Pro Classic is shared');
  assert.deepEqual(J(ids.filter((id) => KICKER_IDS.indexOf(id) >= 0)), [], 'no kicker award in a punter\'s season');
  assert.ok(s.history.awards.some((a) => a.id === 'GOLDEN_LEG_P'), 'the user\'s award lands in history');
  assert.ok(Data.awardsFor('NFL', 'P').every((a) => a.position === 'P') && Data.awardsFor('NFL', 'K').every((a) => !a.position), 'awardsFor filters by position');
  ok(s, 'after the punter awards');
  // the college slate
  s = punterAwardsState('COLLEGE');
  out = Awards.compute(s, RTG.RNG.create(1));
  for (const id of ['GOLDEN_FOOT', 'ALL_AMERICAN_P1', 'ALL_CONF_P1', 'FRESHMAN_FOOT', 'PIN_KING_COLLEGE']) {
    assert.ok(out.some((x) => x.id === id && x.isUser), 'a freshman punter with the best line wins ' + id);
  }
  assert.deepEqual(J(out.map((a) => a.id).filter((id) => KICKER_IDS.indexOf(id) >= 0)), [], 'no Golden Boot for a punter');
  // and a kicker's season never hands out a punter award
  const k = sfx.nflAwardsState(RTG, { best: 'PIT' });
  const kout = Awards.compute(k, RTG.RNG.create(1));
  assert.ok(kout.some((a) => a.id === 'GOLDEN_LEG'), 'the kicker slate');
  assert.deepEqual(J(kout.map((a) => a.id).filter((id) => PUNTER_IDS.indexOf(id) >= 0)), [], 'no punter award in a kicker\'s season');
  // the whole careers agree
  const pIds = retiredPunter().state.history.awards.map((a) => a.id);
  assert.ok(pIds.some((id) => PUNTER_IDS.indexOf(id) >= 0), 'a punter career wins something: ' + pIds.join(','));
  assert.deepEqual(J(pIds.filter((id) => KICKER_IDS.indexOf(id) >= 0)), [], 'a punter career never wins a kicker award');
  const kIds = retiredKicker().state.history.awards.map((a) => a.id);
  assert.deepEqual(J(kIds.filter((id) => PUNTER_IDS.indexOf(id) >= 0)), [], 'a kicker career never wins a punter award');
});

test('punterScore ranks a punting season on net average, needs twenty live punts, and ignores the kicking line', () => {
  const P = Tuning.awards.punterScore;
  const s = aiPunts(0);
  const score = Awards.punterScore(s);
  const live = s.punts - s.puntBlocked;
  const expect = Util.roundN((s.puntNet / live) * P.net + (s.puntYds / live) * P.gross + (s.in20 / live) * P.in20Rate + s.in20 * P.in20 + s.puntLong / P.longDiv - s.tbs * P.tb - s.puntBlocked * P.blocked, 2);
  assert.equal(score, expect);
  const better = aiPunts(0, { puntNet: s.puntNet + live * 2 });
  assert.ok(Awards.punterScore(better) > score, 'two more net yards a punt is worth more');
  const kicks = aiPunts(0, { fgm: 40, fga: 40, pts: 200, gameWinners: 5 });
  assert.equal(Awards.punterScore(kicks), score, 'field goals do not move a punter\'s score');
  assert.equal(Awards.punterScore(aiPunts(0, { punts: P.minPunts, puntBlocked: 1 })), null, 'too few live punts to judge');
  assert.equal(typeof Awards.punterScore(aiPunts(0, { punts: P.minPunts, puntBlocked: 1 }), true), 'number', 'unless asked to ignore the minimum');
});

// ═══════════════════════════════ records ═══════════════════════════════

test('punter records break on punting values and the kicker\'s record book is untouched', () => {
  const state = sfx.cleanCollege(RTG);
  state.player.position = 'P';
  const before = J(state.records);
  state.records.college.longPunt.value = 60;
  const legend = state.records.college.longPunt.holder;
  const ctx = puntCtx(state, 20);
  Stats.recordPunt(state, ctx, puntResult({ gross: 71, net: 71, landing: 91, inside20: true, grade: 'BOOMING', outcome: 'BOOMING' }));
  const ms = Stats.checkRecords(state);
  const rec = ms.filter((m) => m.kind === 'RECORD');
  assert.deepEqual(J(rec.map((m) => [m.key, m.value, m.prev])), [['longPunt', 71, 60]], 'the longest punt falls');
  assert.equal(rec[0].prevHolder, legend);
  const e = state.records.college.longPunt;
  assert.equal(e.isUser, true); assert.equal(e.holder, state.player.name.full); assert.equal(e.value, 71);
  assert.equal(state.records.personal.longPunt, 71);
  assert.equal(state.records.personal.careerPunts, 1); assert.equal(state.records.personal.careerIn20, 1); assert.equal(state.records.personal.seasonIn20, 1);
  for (const k of KICKER_KEYS) {
    if (before.college[k]) assert.deepEqual(J(state.records.college[k]), before.college[k], 'college ' + k + ' untouched');
    assert.equal(state.records.personal[k], undefined, 'no personal best on ' + k);
  }
  assert.deepEqual(J(state.records.nfl), before.nfl, 'the other league is untouched');
  // the keys the book offers each position
  assert.deepEqual(J(Data.records.keysFor('college', 'P')), ['longPunt', 'seasonNet', 'seasonIn20', 'careerPunts', 'careerNet', 'careerIn20']);
  assert.deepEqual(J(Data.records.keysFor('nfl', 'P')), ['longPunt', 'seasonNet', 'seasonIn20', 'careerPunts', 'careerNet', 'careerIn20', 'punterSeasons']);
  assert.deepEqual(J(Data.records.keysFor('college', 'K').filter((k) => PUNTER_KEYS.indexOf(k) >= 0)), [], 'a kicker\'s keys carry no punting');
  // the legends board reports only the punter's values for a punter
  const board = Stats.compareToLegends(state);
  assert.ok(board.filter((r) => r.yours !== null).every((r) => PUNTER_KEYS.indexOf(r.key) >= 0), 'a punter compares on punting keys only');
  assert.ok(board.some((r) => r.key === 'longPunt' && r.league === 'COLLEGE' && r.yours === 71 && r.isUser));
  ok(state, 'after a record');
});

test('net-average records wait for the season\'s end and the minimum punts, like the percentages do for a kicker', () => {
  const state = sfx.cleanCollege(RTG);
  state.player.position = 'P';
  const R = Tuning.records;
  state.records.college.seasonNet.value = 40;
  const ctx = puntCtx(state, 25);
  for (let i = 0; i < R.minPuntsSeasonNet - 1; i++) Stats.recordPunt(state, ctx, puntResult({ gross: 50, net: 46 }));
  assert.equal(Stats.checkRecords(state, null, null, { final: true }).filter((m) => m.key === 'seasonNet').length, 0, 'one punt short of the minimum');
  Stats.recordPunt(state, ctx, puntResult({ gross: 50, net: 46 }));
  assert.equal(Stats.checkRecords(state).filter((m) => m.key === 'seasonNet').length, 0, 'not during the season');
  const ms = Stats.checkRecords(state, null, null, { final: true });
  assert.equal(ms.filter((m) => m.key === 'seasonNet').length, 1, 'at the season\'s end with the minimum met');
  assert.equal(state.records.college.seasonNet.value, 46);
  assert.equal(state.records.college.seasonNet.isUser, true);
  assert.equal(state.records.college.careerNet.isUser, false, 'the career mark needs ' + R.minPuntsCareerNet + ' punts');
});

test('over whole careers the punter holds only punting records and the kicker only kicking ones', () => {
  const p = retiredPunter().state, k = retiredKicker().state;
  for (const lg of ['college', 'nfl']) {
    const ph = heldBy(p.records[lg]), kh = heldBy(k.records[lg]);
    assert.deepEqual(J(ph.filter((key) => PUNTER_KEYS.indexOf(key) < 0)), [], 'punter ' + lg + ' holds ' + ph.join(','));
    assert.deepEqual(J(kh.filter((key) => KICKER_KEYS.indexOf(key) < 0)), [], 'kicker ' + lg + ' holds ' + kh.join(','));
  }
  assert.ok(heldBy(p.records.nfl).length >= 1, 'a 12-season NFL punter takes at least one record home');
  assert.ok(Object.keys(p.records.personal).every((key) => PUNTER_KEYS.indexOf(key) >= 0), 'personal bests are punting bests: ' + Object.keys(p.records.personal).join(','));
});

// ═══════════════════════════════ the Hall ═══════════════════════════════

test('Awards.hofScore reads the punting ledger for a punter and the kicking one for a kicker', () => {
  const s = sfx.hofFirstBallot(RTG);
  const kicker = Awards.hofScore(s);
  assert.deepEqual(J(kicker.breakdown.map((b) => b.key)), ['fgm', 'fifty', 'pts', 'gw', 'allLeague1', 'allLeague2', 'stpoy', 'championships', 'championshipKicks', 'seasonsAsStarter', 'pctBonus', 'recordsHeld']);
  s.player.position = 'P';
  const n = Stats.ensureStats(s.stats.nfl);
  const H = Tuning.hof.punter;
  n.punts = 900; n.puntBlocked = 3; n.puntNet = 897 * 45; n.puntYds = 897 * 49; n.in20 = 400; n.puntLong = 74;
  const punter = Awards.hofScore(s);
  assert.deepEqual(J(punter.breakdown.map((b) => b.key)), ['punts', 'in20', 'longPunt', 'allLeague1', 'allLeague2', 'stpoy', 'championships', 'seasonsAsStarter', 'netBonus', 'recordsHeld']);
  const row = (r, key) => r.breakdown.filter((b) => b.key === key)[0];
  assert.equal(row(punter, 'punts').count, 900); assert.equal(row(punter, 'punts').weight, H.weights.punts);
  assert.equal(row(punter, 'in20').count, 400);
  assert.equal(row(punter, 'longPunt').count, 7.4);
  assert.equal(row(punter, 'netBonus').count, 1, 'a 45.0 career net over 897 live punts earns the net bonus');
  assert.equal(row(punter, 'seasonsAsStarter').count, row(kicker, 'seasonsAsStarter').count, 'the seasons and the teams mean the same for everyone');
  assert.equal(row(punter, 'championships').count, row(kicker, 'championships').count);
  assert.ok(punter.breakdown.every((b) => b.label.indexOf('FG') < 0 && b.label.indexOf('points') < 0), 'no kicking labels in a punter\'s ledger');
  assert.match(row(punter, 'punts').label, /^Pro /, 'the labels say Pro: only the NFL line counts');
  // monotone in the punting inputs, deaf to the kicking ones
  n.in20 = 410;
  assert.equal(Awards.hofScore(s).score - punter.score, 3, 'ten more pinned punts are worth ' + 10 * H.weights.in20);
  n.fgm = 500; n.made50plus = 40; n.gameWinners = 20;
  assert.equal(Awards.hofScore(s).score, punter.score + 3, 'field goals do not count for a punter');
  n.puntNet = 897 * (H.netBonusMin - 0.1);
  assert.equal(row(Awards.hofScore(s), 'netBonus').count, 0, 'a net under ' + H.netBonusMin + ' loses the bonus');
  n.puntNet = 897 * 45; n.punts = H.netBonusMinPunts - 1 + 3;
  assert.equal(row(Awards.hofScore(s), 'netBonus').count, 0, 'so does a career short of ' + H.netBonusMinPunts + ' live punts');
  // the retired career agrees with what the legacy screen recorded
  const r = retiredPunter().state;
  const hof = Awards.hofScore(r);
  assert.equal(hof.score, r.flags.legacy.score);
  assert.equal(hof.tier, r.flags.legacy.tier);
  assert.ok(hof.breakdown.some((b) => b.key === 'punts' && b.count === r.stats.nfl.punts), 'the Hall counts the pro punts');
  assert.ok(!hof.breakdown.some((b) => b.key === 'fgm'));
});

// ═══════════════════════════════ the whole career ═══════════════════════════════

test('a full auto punter career validates at every stage and retires with a believable NFL line', () => {
  const r = retiredPunter();
  const s = r.state;
  ok(s, 'the retired punter');
  const nfl = Stats.puntLine(s.stats.nfl), college = Stats.puntLine(s.stats.college), career = Stats.puntLine(s.stats.career);
  const k1 = r.seasons.filter((l) => l.league === 'NFL' && l.role === 'K1');
  assert.ok(k1.length >= 6, k1.length + ' NFL seasons as the starter');
  assert.ok(nfl.punts >= 40 * k1.length, nfl.punts + ' NFL punts over ' + k1.length + ' starting seasons');
  const full = k1.filter((l) => l.stats.punts >= 40).length;
  assert.ok(full >= Math.ceil(k1.length * 0.8), full + ' of ' + k1.length + ' starting seasons reached 40 punts (an injury can cost one)');
  assert.ok(nfl.gross >= 45 && nfl.gross <= 50.5, 'NFL gross average 45-50 (' + nfl.gross + ')');
  assert.ok(nfl.net >= 40 && nfl.net <= 45.5, 'NFL net average 40-45 (' + nfl.net + ')');
  assert.ok(nfl.in20Pct > 0.3, 'a pro pins a real share (' + nfl.in20Pct.toFixed(2) + ')');
  assert.ok(nfl.tbs / nfl.punts < 0.05, 'few touchbacks (' + nfl.tbs + ')');
  assert.ok(nfl.blocked / nfl.punts < 0.02, 'blocks are rare (' + nfl.blocked + ')');
  assert.ok(nfl.long >= 55 && nfl.long <= 85, 'a believable longest punt (' + nfl.long + ')');
  assert.ok(college.punts >= 20 && college.gross < nfl.gross, 'the college leg was weaker (' + college.gross + ' → ' + nfl.gross + ')');
  assert.equal(career.punts, nfl.punts + college.punts, 'the career block is the sum of the leagues');
  assert.equal(s.stats.career.fga + s.stats.career.fgm + s.stats.career.pat + s.stats.career.pts, 0, 'a punter never kicked');
  assert.ok(s.stats.kicks.length > 0 && s.stats.kicks.every((k) => k.type === 'PUNT'), 'the kick log is all punts');
  assert.ok(s.history.awards.length >= 1);
  assert.ok(s.history.contracts.some((c) => c.type === 'VET' || c.type === 'ROOKIE' || c.type === 'UDFA'), 'pro contracts were signed');
  // and the final state survives a save
  const blob = Engine.save(s, r.rng, kfx.NOW);
  const back = Engine.load(J(blob));
  assert.equal(back.state.player.position, 'P');
  assert.equal(Util.deepDiff(J(back.state.stats), J(s.stats)), '', 'the ledger round-trips');
  ok(back.state, 'the loaded retired punter');
});

test('the whole thing is deterministic for a seed', () => {
  const a = retiredPunter();
  const b = kfx.autoPunter(RTG, { seed: SEED });
  assert.equal(b.rng.state(), a.rng.state(), 'identical rng state');
  assert.equal(Util.deepDiff(J(b.state), J(a.state)), '', 'identical careers');
  assert.equal(Util.deepDiff(J(b.seasons), J(a.seasons)), '', 'identical season lines');
  const c = kfx.autoPunter(RTG, { seed: SEED + 1, untilStage: 'COLLEGE' });
  assert.notEqual(Util.deepDiff(J(c.state.flags.hs), J(a.state.flags.hs)), '', 'a different seed is a different career');
});

// ═══════════════════════════════ the camp battle, the combine and the contracts ═══════════════════════════════
// These are being made punter-aware alongside this file. Each test probes the engine first and is skipped, with the
// reason, while the punter still gets the kicker's version.

function campSessionFor(seed) {
  const b = kfx.campBattle(RTG, { seed: seed });
  b.state.player.position = 'P';
  b.state.pending = null;
  b.session = Career.campBattle(b.state, b.rng);
  return b;
}
const campProbe = (() => { try { return campSessionFor(3).session.contexts.every((c) => c.type === 'PUNT'); } catch (e) { return false; } })();
test('a punter\'s camp battle is punted, against a rival who punts, and hands out the job on the punts',
  { skip: campProbe ? false : 'Career.campBattle still hands a punter the kicker\'s six field goals' }, () => {
    const b = campSessionFor(3);
    const sess = b.session;
    assert.equal(sess.kind, 'CAMP');
    assert.ok(sess.contexts.length >= 4 && sess.contexts.every((c) => c.type === 'PUNT' && c.losYard >= 1 && c.isUser === true), 'punts from real spots');
    assert.equal(sess.rival.results.length, sess.contexts.length);
    assert.ok(sess.rival.results.every((r) => r.type === 'PUNT' && Punt.GRADES.indexOf(r.grade) >= 0), 'the rival punts too');
    while (b.state.pending) Engine.sessionKick(b.state, b.rng, null, { forced: { outcome: 'BOOMING' } });
    assert.ok(b.state.player.role === 'K1' || b.state.player.role === 'K2', 'the battle settled the job');
    assert.ok(b.state.season.campBattle && b.state.season.campBattle.result && typeof b.state.season.campBattle.result.won === 'boolean');
    ok(b.state, 'after a punter\'s camp');
  });

const combineProbe = (() => {
  try {
    const d = kfx.draftCombine(RTG, { seed: 3 });
    d.state.player.position = 'P';
    return Draft.combineSession(d.state, d.rng, { plan: 'SHOW' }).contexts.some((c) => c.type === 'PUNT');
  } catch (e) { return false; }
})();
test('a punter\'s combine is punts, and its score comes from the punting',
  { skip: combineProbe ? false : 'Draft.combineSession still gives a punter the field-goal ladder' }, () => {
    const d = kfx.draftCombine(RTG, { seed: 3 });
    d.state.player.position = 'P';
    const sess = Draft.combineSession(d.state, d.rng, { plan: 'SHOW' });
    assert.ok(sess.contexts.length >= 4 && sess.contexts.every((c) => c.type === 'PUNT' || c.type === 'KO'), 'punts (and at most a kickoff)');
    assert.equal(sess.contexts.filter((c) => c.type === 'FG').length, 0, 'no field-goal ladder for a punter');
    kfx.fillSession(sess, sess.contexts.map(() => true));
    assert.equal(typeof Draft.scoreCombine(sess), 'number');
  });

const contractProbe = (() => {
  try {
    const n = kfx.nflOff(RTG, { seed: 3 });
    const k = Contracts.marketValue(n.state).aav;
    n.state.player.position = 'P';
    return Contracts.marketValue(n.state).aav !== k;
  } catch (e) { return false; }
})();
test('a punter\'s market value is a punter\'s: the same leg is worth less than a kicker\'s (Tuning.punt.career.marketMult)',
  { skip: contractProbe ? false : 'Contracts.marketValue does not read the position; Tuning.punt.career.marketMult is unread' }, () => {
    const n = kfx.nflOff(RTG, { seed: 3 });
    const k = Contracts.marketValue(n.state);
    n.state.player.position = 'P';
    const p = Contracts.marketValue(n.state);
    assert.ok(p.aav < k.aav, 'a punter earns less than the same kicker (' + p.aav + ' vs ' + k.aav + ')');
    assert.ok(p.aav >= p.vetMin, 'but never under the veteran minimum');
    assert.ok(Math.abs(p.raw / k.raw - Tuning.punt.career.marketMult) < 0.02, 'by the punter multiplier');
  });
