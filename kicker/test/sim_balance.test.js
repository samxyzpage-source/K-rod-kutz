/**
 * sim_balance.test.js [balance] — RTG.Sim Monte Carlo (SPEC §2.13, §5.1 "sim").
 *
 * Tuning.sim.expected.harness.nflGames (4 000; spec minimum 2 000) NFL games between random teams
 * (OFF/DEF 58–88, kickers 62–92, generated the §2.5.1 way) → points/team 21–27, FGA/team 1.9–2.4,
 * PAT/team 2.4–3.0, FG distance buckets (<30 / 30s / 40s / 50+) 14–19 / 26–31 / 30–35 / 19–25 %,
 * regulation ties 3–7 %, decisive attempts per game 0.10–0.25 (both teams, FG + PAT, incl. OT), ice
 * timeouts ≤ 0.6 × decisive attempts, drives/team 10–14, clock never negative. 1 000 college games with
 * the data teams → 24–32 points, 1.5–2.2 FGA, 2.8–4.2 PAT per team. Seeded (reproducible); prints the table.
 *
 *   node kicker/test/run.js sim --balance      or      node kicker/test/sim_balance.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RTG = require('./load')();
const gfx = require('./fixtures/game');

const { Sim, Tuning } = RTG;
const T = Tuning.sim, H = T.expected.harness, E = T.expected;
const hasData = !!(RTG.Data && RTG.Data.colleges && RTG.Data.nfl);
const ATTRS = ['POW', 'ACC', 'CON', 'CLU', 'KO'];

function inBand(x, band) { return x >= band[0] && x <= band[1]; }
function pct(x) { return (100 * x).toFixed(1) + ' %'; }
function fmtBand(band, isPct) { return '[' + (isPct ? pct(band[0]) + ', ' + pct(band[1]) : band[0] + ', ' + band[1]) + ']'; }

const clampN = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/**
 * Randomise both NFL teams per §5.1 "random teams 58–88, kickers 62–92", generated the §2.5.1 way:
 * ratings N(72, 7) clamped to the harness range (the nflInit clamps), kicker OVR N(74, 7) clamped to
 * kickerOvr, attrs = clamp(ovr + N(0, 4)), ST re-blended with the kicker. College games use the data
 * teams and their generated kickers as they are (prestige-anchored, like a real season).
 */
function randomise(rng, team) {
  const K = Tuning.league.aiKicker, I = Tuning.league.nflInit;
  team.OFF = clampN(Math.round(rng.gauss(I.off.mean, I.off.sd)), H.teamRating[0], H.teamRating[1]);
  team.DEF = clampN(Math.round(rng.gauss(I.def.mean, I.def.sd)), H.teamRating[0], H.teamRating[1]);
  const ovr = clampN(Math.round(rng.gauss(K.nflAnchor, K.ovrSd)), H.kickerOvr[0], H.kickerOvr[1]);
  const kicker = team.kicker || team.kicker2;
  kicker.ovr = ovr;
  for (const a of ATTRS) kicker.attrs[a] = clampN(Math.round(ovr + rng.gauss(0, K.attrSd)), K.attrMin, K.attrMax);
  team.ST = Math.round(Tuning.league.stBlend * team.ST + (1 - Tuning.league.stBlend) * ovr);
}

/** Run `n` random AI games and aggregate the §2.13 metrics (decisive attempts = FG + PAT tagged decisive, as Stats counts them). */
function harness(league, n, seed) {
  const state = gfx.aiState(RTG, { league, seed: 3 });
  const lg = league === 'NFL' ? state.leagues.nfl : state.leagues.college;
  const teams = lg.teams;
  const rng = RTG.RNG.create(seed);
  const weeks = league === 'NFL' ? Tuning.schedule.nfl.regWeeks : Tuning.schedule.college.regWeeks;
  const m = { games: 0, pts: 0, fga: 0, fgm: 0, pat: 0, patMade: 0, drives: 0, ot: 0, decisive: 0, iced: 0, gw: 0, buckets: [0, 0, 0, 0], minClock: 0, maxDriveLog: 0, twoPt: 0 };
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const a = rng.int(0, teams.length - 1);
    let b = rng.int(0, teams.length - 2); if (b >= a) b++;
    if (league === 'NFL') { randomise(rng, teams[a]); randomise(rng, teams[b]); }
    const res = Sim.simAiGame(state, rng, { league, homeId: teams[a].id, awayId: teams[b].id, week: rng.int(1, weeks), gameId: 'mc' + i });
    const gs = res.gs;
    m.games++;
    m.pts += gs.score.home + gs.score.away;
    for (const s of ['home', 'away']) {
      m.fga += gs.stats[s].fga; m.fgm += gs.stats[s].fgm; m.pat += gs.stats[s].pat; m.patMade += gs.stats[s].patMade; m.drives += gs.stats[s].drives;
    }
    if (gs.ot) m.ot++;
    for (const k of gs.kicks) {
      if (k.tags.indexOf('decisive') >= 0) m.decisive++;
      if (k.tags.indexOf('iced') >= 0) m.iced++;
      if (k.tags.indexOf('gameWinner') >= 0) m.gw++;
      if (k.type !== 'FG') continue;
      const d = k.distance;
      m.buckets[d < 30 ? 0 : d < 40 ? 1 : d < 50 ? 2 : 3]++;
    }
    for (const r of gs.driveLog) { if (r.clock < m.minClock) m.minClock = r.clock; if (r.result === '2PT' || r.result === '2PT_FAIL') m.twoPt++; }
    if (gs.clock < m.minClock) m.minClock = gs.clock;
    if (gs.driveLog.length > m.maxDriveLog) m.maxDriveLog = gs.driveLog.length;
    assert.ok(gs.done && gs.pending === null, 'every game finishes without a pending kick');
  }
  m.ms = Date.now() - t0;
  const g2 = m.games * 2, bt = m.buckets.reduce((x, y) => x + y, 0);
  return {
    raw: m, msPerGame: m.ms / m.games,
    ptsPerTeam: m.pts / g2, fgaPerTeam: m.fga / g2, patPerTeam: m.pat / g2, drivesPerTeam: m.drives / g2,
    fgPct: m.fgm / Math.max(1, m.fga), patPct: m.patMade / Math.max(1, m.pat),
    ties: m.ot / m.games, decisivePerGame: m.decisive / m.games, icedToDecisive: m.iced / Math.max(1, m.decisive), gwPerGame: m.gw / m.games,
    buckets: m.buckets.map((b) => b / Math.max(1, bt)),
  };
}

function printTable(name, r, bands) {
  const rows = [
    ['points/team', r.ptsPerTeam.toFixed(2), fmtBand(bands.pts)],
    ['FGA/team', r.fgaPerTeam.toFixed(2), fmtBand(bands.fga)],
    ['FG %', pct(r.fgPct), ''],
    ['PAT/team', r.patPerTeam.toFixed(2), fmtBand(bands.pat)],
    ['PAT %', pct(r.patPct), ''],
    ['drives/team', r.drivesPerTeam.toFixed(2), fmtBand(H.drives)],
  ];
  if (bands.ties) rows.push(['regulation ties', pct(r.ties), fmtBand(bands.ties, true)]);
  if (bands.decisive) rows.push(['decisive kicks/game', r.decisivePerGame.toFixed(3), fmtBand(bands.decisive)]);
  rows.push(['iced / decisive', r.icedToDecisive.toFixed(2), '≤ ' + H.iceToDecisiveMax]);
  rows.push(['game-winners/game', r.gwPerGame.toFixed(3), '']);
  if (bands.buckets) {
    const keys = ['lt30', 's30', 's40', 's50'], labels = ['FG <30', 'FG 30–39', 'FG 40–49', 'FG 50+'];
    keys.forEach((k, i) => rows.push([labels[i], pct(r.buckets[i]), fmtBand(bands.buckets[k], true)]));
  }
  rows.push(['ms/game', r.msPerGame.toFixed(2), '']);
  console.log('\n' + name + ' — ' + r.raw.games + ' games (seeded)');
  for (const row of rows) console.log('  ' + row[0].padEnd(20) + row[1].padStart(9) + '   ' + row[2]);
}

test('NFL: ' + H.nflGames + ' random games hit the §2.13 sim bands', (t) => {
  if (!hasData) { t.skip('team data not loaded'); return; }
  const r = harness('NFL', H.nflGames, 20260905);
  printTable('NFL', r, E.nfl);
  assert.ok(inBand(r.ptsPerTeam, E.nfl.pts), 'points/team ' + r.ptsPerTeam.toFixed(2) + ' ∉ ' + fmtBand(E.nfl.pts));
  assert.ok(inBand(r.fgaPerTeam, E.nfl.fga), 'FGA/team ' + r.fgaPerTeam.toFixed(2) + ' ∉ ' + fmtBand(E.nfl.fga));
  assert.ok(inBand(r.patPerTeam, E.nfl.pat), 'PAT/team ' + r.patPerTeam.toFixed(2) + ' ∉ ' + fmtBand(E.nfl.pat));
  assert.ok(inBand(r.drivesPerTeam, H.drives), 'drives/team ' + r.drivesPerTeam.toFixed(2) + ' ∉ ' + fmtBand(H.drives));
  assert.ok(inBand(r.ties, E.nfl.ties), 'regulation ties ' + pct(r.ties) + ' ∉ ' + fmtBand(E.nfl.ties, true));
  assert.ok(inBand(r.decisivePerGame, E.nfl.decisive), 'decisive attempts/game ' + r.decisivePerGame.toFixed(3) + ' ∉ ' + fmtBand(E.nfl.decisive));
  assert.ok(r.icedToDecisive <= H.iceToDecisiveMax, 'ice timeouts ≤ 0.6 × decisive: ' + r.icedToDecisive.toFixed(2));
  const keys = ['lt30', 's30', 's40', 's50'];
  keys.forEach((k, i) => assert.ok(inBand(r.buckets[i], E.nfl.buckets[k]), 'bucket ' + k + ' ' + pct(r.buckets[i]) + ' ∉ ' + fmtBand(E.nfl.buckets[k], true)));
  assert.ok(r.raw.minClock >= 0, 'clock never negative');
  assert.ok(r.raw.maxDriveLog <= Tuning.save.driveLogCap, 'drive log capped');
  assert.ok(r.fgPct > 0.78 && r.fgPct < 0.92, 'league FG % plausible: ' + pct(r.fgPct));
  assert.ok(r.patPct > 0.93 && r.patPct < 0.99, 'NFL PAT % 93–99: ' + pct(r.patPct));
  assert.ok(r.raw.twoPt > 0, 'two-point tries happen');
});

test('College: 1 000 random games hit the §2.13 sim bands', (t) => {
  if (!hasData) { t.skip('team data not loaded'); return; }
  const r = harness('COLLEGE', H.collegeGames, 20260906);
  printTable('College', r, E.college);
  assert.ok(inBand(r.ptsPerTeam, E.college.pts), 'points/team ' + r.ptsPerTeam.toFixed(2) + ' ∉ ' + fmtBand(E.college.pts));
  assert.ok(inBand(r.fgaPerTeam, E.college.fga), 'FGA/team ' + r.fgaPerTeam.toFixed(2) + ' ∉ ' + fmtBand(E.college.fga));
  assert.ok(inBand(r.patPerTeam, E.college.pat), 'PAT/team ' + r.patPerTeam.toFixed(2) + ' ∉ ' + fmtBand(E.college.pat));
  assert.ok(inBand(r.drivesPerTeam, H.drives), 'drives/team ' + r.drivesPerTeam.toFixed(2) + ' ∉ ' + fmtBand(H.drives));
  assert.ok(r.raw.minClock >= 0, 'clock never negative');
  assert.ok(r.icedToDecisive <= H.iceToDecisiveMax, 'ice timeouts ≤ 0.6 × decisive');
  assert.ok(r.patPct >= 0.98, 'college PAT ≥ 98 %: ' + pct(r.patPct));
  assert.ok(r.ties > 0 && r.ties < 0.10, 'college games reach OT sometimes: ' + pct(r.ties));
});

test('determinism of the harness: the same seed reproduces the same aggregate', (t) => {
  if (!hasData) { t.skip('team data not loaded'); return; }
  const a = harness('NFL', 40, 4242), b = harness('NFL', 40, 4242);
  assert.equal(a.raw.pts, b.raw.pts); assert.equal(a.raw.fga, b.raw.fga); assert.deepEqual(a.raw.buckets, b.raw.buckets);
});
