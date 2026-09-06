#!/usr/bin/env node
/**
 * career_report.js — the §2.13 career-balance summary over N auto-played Pro careers (Markdown to stdout).
 * Not a test (career_balance.test.js asserts; this prints the tables for docs/BALANCE.md).
 *
 *   node kicker/test/career_report.js                 # 200 careers (Tuning.career.balance.careers), seeds 1000..1199
 *   RTG_CAREERS=40 RTG_WORKERS=2 node kicker/test/career_report.js
 *
 * Every career: Engine.newCareer → Engine.autoPlayCareer (default auto policies) → RETIRED. Reported: FG% by
 * NFL career year and by college year (median, quartiles, OVR), longest-FG distribution, benching / cut rate in
 * the first 3 NFL seasons, HOF verdicts and tiers, career length and retirement reasons, draft rounds, stars, XP
 * saturation (attributes at POT), save size and engine runtime.
 */
'use strict';
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const os = require('node:os');

const ARCHETYPES = ['SURGEON', 'CANNON', 'ICEMAN', 'SOCCER'];
const NOW = 1757000000000;

function runCareer(RTG, seed) {
  const E = RTG.Engine;
  const t0 = Date.now();
  const created = E.newCareer({ name: 'Auto Kicker', archetype: ARCHETYPES[seed % ARCHETYPES.length], difficulty: 'pro', seed }, NOW + seed);
  const { state, rng } = created;
  const out = { seed, ok: true, error: null, seasons: [], stars: 0, walkon: false };
  try {
    E.autoPlayCareer(state, rng, {
      onSeason(st, line) {
        const s = line.stats || {};
        out.seasons.push({ year: line.year, league: line.league, age: line.age, ovr: line.ovr, role: line.role,
          fga: s.fga || 0, fgm: s.fgm || 0, long: s.long || 0, games: s.games || 0, pat: s.pat || 0, patMade: s.patMade || 0, awards: (line.awards || []).length });
      }
    });
  } catch (e) {
    out.ok = false; out.error = (e && e.message) + ' @ ' + state.stage + '/' + state.phase + '/y' + state.year;
  }
  out.ms = Date.now() - t0;
  out.stage = state.stage;
  out.stars = state.player.stars; out.walkon = !!state.flags.WALKON; out.udfa = !!state.flags.UDFA;
  out.draft = state.flags.draft ? state.flags.draft.round : null;
  const hof = RTG.Awards.hofScore(state);
  out.hof = { score: hof.score, verdict: hof.verdict, tier: hof.tier };
  out.retiredReason = state.flags.legacy ? state.flags.legacy.reason : null;
  out.long = state.stats.career.long || 0;
  out.nflLong = state.stats.nfl.long || 0;
  out.careerFga = state.stats.career.fga; out.careerFgm = state.stats.career.fgm;
  out.earnings = state.history.earnings;
  out.peakOvr = out.seasons.reduce((m, s) => Math.max(m, s.ovr), 0);
  out.finalAge = state.player.age;
  const p = state.player;
  out.atPot = RTG.Player.ATTRS.filter((a) => p.attrs[a] >= p.pot[a]).length;
  out.xpLeft = p.xp;
  const nflYears = out.seasons.filter((s) => s.league === 'NFL').slice(0, 3).map((s) => s.year);
  out.bench = 0; out.cut = 0; out.campLoss = 0;
  for (const t of state.history.timeline) {
    if (nflYears.indexOf(t.year) < 0) continue;
    if (t.kind === 'BENCHED' || t.kind === 'LOST_JOB') out.bench++;
    else if (t.kind === 'CUT') out.cut++;
    else if (t.kind === 'CAMP' && /^Lost/.test(t.text)) out.campLoss++;
  }
  try { out.saveKb = Math.round(JSON.stringify(RTG.Save.serialize(state, rng, NOW)).length / 1024); } catch (e) { out.saveKb = -1; }
  return out;
}

if (!isMainThread) {
  const RTG = require('./load')();
  const results = [];
  for (const seed of workerData.seeds) results.push(runCareer(RTG, seed));
  parentPort.postMessage({ done: results });
} else {
  const RTG = require('./load')();
  const T = RTG.Tuning.career.balance;
  const N = Number(process.env.RTG_CAREERS) || T.careers;
  const WORKERS = Math.max(1, Math.min(Number(process.env.RTG_WORKERS) || Math.min(4, Math.max(1, os.cpus().length - 1)), N));
  const seeds = []; for (let i = 0; i < N; i++) seeds.push(T.seedBase + i);
  const chunks = []; for (let w = 0; w < WORKERS; w++) chunks.push([]);
  seeds.forEach((s, i) => chunks[i % WORKERS].push(s));
  const started = Date.now();
  Promise.all(chunks.map((chunk) => new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData: { seeds: chunk } });
    worker.on('message', (m) => { if (m.done) resolve(m.done); });
    worker.on('error', reject);
    worker.on('exit', (code) => { if (code !== 0) reject(new Error('worker exited with ' + code)); });
  }))).then((parts) => report([].concat.apply([], parts).sort((a, b) => a.seed - b.seed))).catch((e) => { console.error(e); process.exit(1); });

  const q = (arr, p) => { if (!arr.length) return NaN; const s = arr.slice().sort((a, b) => a - b); const i = (s.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
  const med = (arr) => q(arr, 0.5);
  const pct = (x, d) => (100 * x).toFixed(d === undefined ? 1 : d) + ' %';
  const f0 = (x) => isFinite(x) ? x.toFixed(0) : '—';
  const f1 = (x) => isFinite(x) ? x.toFixed(1) : '—';
  const count = (arr, fn) => arr.filter(fn).length;
  const hist = (arr, key) => arr.reduce((m, r) => { const k = key(r); m[k] = (m[k] || 0) + 1; return m; }, {});
  const histText = (h, order) => (order || Object.keys(h).sort()).filter((k) => h[k]).map((k) => k + ': ' + h[k]).join(' · ');

  function report(R) {
    const out = [];
    const line = (s) => out.push(s === undefined ? '' : s);
    const failed = R.filter((r) => !r.ok);
    const nfl = (r) => r.seasons.filter((s) => s.league === 'NFL');
    const col = (r) => r.seasons.filter((s) => s.league === 'COLLEGE');
    line('### Career balance — ' + R.length + ' auto careers (Pro, seeds ' + R[0].seed + '–' + R[R.length - 1].seed + ', default auto policies)');
    line();
    line('Run: `node kicker/test/career_report.js` · ' + WORKERS + ' workers · ' + ((Date.now() - started) / 1000).toFixed(0) + ' s wall · ' +
      'failures: ' + failed.length + (failed.length ? ' (' + failed.slice(0, 3).map((r) => r.seed + ': ' + r.error).join('; ') + ')' : '') +
      ' · retired: ' + count(R, (r) => r.stage === 'RETIRED') + '/' + R.length);
    line();
    line('| Metric | Spec §2.13 target | Measured |');
    line('|---|---|---|');
    const rookies = R.map((r) => nfl(r).find((s) => s.fga >= T.minFga)).filter(Boolean);
    const fgp = (s) => s.fgm / s.fga;
    line('| Rookie NFL season FG% (first NFL season with ≥ ' + T.minFga + ' FGA), median | 78–83 % | ' + pct(med(rookies.map(fgp))) + ' (OVR median ' + f0(med(rookies.map((s) => s.ovr))) + ', n=' + rookies.length + ') |');
    const y4 = R.map((r) => nfl(r)[3]).filter((s) => s && s.fga >= T.minFga);
    line('| Year-4 NFL starter FG%, median | 84–88 % | ' + pct(med(y4.map(fgp))) + ' (OVR median ' + f0(med(y4.map((s) => s.ovr))) + ', n=' + y4.length + ') |');
    const elite = []; for (const r of R) for (const s of nfl(r)) if (s.ovr >= T.eliteOvrMin && s.fga >= T.minFga) elite.push(s);
    line('| Elite peak seasons (OVR ≥ ' + T.eliteOvrMin + ') FG%, median | 89–93 % | ' + (elite.length ? pct(med(elite.map(fgp))) + ' (n=' + elite.length + ' seasons from ' + count(R, (r) => r.peakOvr >= T.eliteOvrMin) + ' careers)' : 'no elite seasons') + ' |');
    const longs = R.map((r) => r.long);
    line('| Career longest FG: median · share ≥ 64 yd | 57–61 · 5 % | ' + f0(med(longs)) + ' · ' + pct(count(R, (r) => r.long >= 64) / R.length) + ' |');
    const withNfl = R.filter((r) => nfl(r).length > 0);
    const anyBench = count(withNfl, (r) => r.bench + r.cut + r.campLoss > 0) / withNfl.length;
    line('| Careers with a benching or cut in the first 3 NFL seasons | 25–45 % | ' + pct(anyBench) + ' (benched ' + pct(count(withNfl, (r) => r.bench > 0) / withNfl.length) + ', cut ' + pct(count(withNfl, (r) => r.cut > 0) / withNfl.length) + ', lost camp battle ' + pct(count(withNfl, (r) => r.campLoss > 0) / withNfl.length) + ') |');
    const good = R.filter((r) => r.peakOvr >= T.length.ovrMin);
    line('| NFL seasons (careers reaching OVR ≥ ' + T.length.ovrMin + '), median | 10–14 | ' + f0(med(good.map((r) => nfl(r).filter((s) => s.games > 0).length))) + ' (' + good.length + ' careers; all careers median ' + f0(med(R.map((r) => nfl(r).filter((s) => s.games > 0).length))) + ') |');
    const fb = count(R, (r) => r.hof.verdict === 'FIRST_BALLOT') / R.length, ind = count(R, (r) => r.hof.verdict === 'FIRST_BALLOT' || r.hof.verdict === 'INDUCTED') / R.length;
    line('| HOF verdicts: first-ballot · inducted (incl. first-ballot) | ≤ 10 % · 15–25 % | ' + pct(fb) + ' · ' + pct(ind) + ' (score median ' + f0(med(R.map((r) => r.hof.score))) + ') |');
    line('| Full auto career runtime (engine, per worker, ' + WORKERS + ' parallel) | < 4 s | median ' + f0(med(R.map((r) => r.ms))) + ' ms · max ' + f0(Math.max.apply(null, R.map((r) => r.ms))) + ' ms |');
    line('| Save size after the career | < 400 KB (20 seasons) | median ' + f0(med(R.map((r) => r.saveKb))) + ' KB · max ' + f0(Math.max.apply(null, R.map((r) => r.saveKb))) + ' KB (seasons median ' + f0(med(R.map((r) => r.seasons.length))) + ') |');
    line();
    line('#### FG% by NFL career year');
    line();
    line('| NFL year | n | age | OVR median | FGA median | FG% p25 | FG% median | FG% p75 | PAT% median | long median | starters (K1) |');
    line('|---|---|---|---|---|---|---|---|---|---|---|');
    for (let y = 0; y < 18; y++) {
      const rows = R.map((r) => nfl(r)[y]).filter((s) => s && s.games > 0);
      if (rows.length < 5) break;
      const withA = rows.filter((s) => s.fga >= T.minFga);
      const pats = rows.filter((s) => s.pat >= 10).map((s) => s.patMade / s.pat);
      line('| ' + (y + 1) + ' | ' + rows.length + ' | ' + f0(med(rows.map((s) => s.age))) + ' | ' + f0(med(rows.map((s) => s.ovr))) + ' | ' + f0(med(rows.map((s) => s.fga))) + ' | ' +
        pct(q(withA.map(fgp), 0.25)) + ' | ' + pct(med(withA.map(fgp))) + ' | ' + pct(q(withA.map(fgp), 0.75)) + ' | ' + pct(med(pats)) + ' | ' + f0(med(withA.map((s) => s.long))) + ' | ' + pct(count(rows, (s) => s.role === 'K1') / rows.length, 0) + ' |');
    }
    line();
    line('#### FG% by college year');
    line();
    line('| College year | n | age | OVR median | FGA median | FG% median | long median |');
    line('|---|---|---|---|---|---|---|');
    for (let y = 0; y < 5; y++) {
      const rows = R.map((r) => col(r)[y]).filter((s) => s && s.games > 0);
      if (rows.length < 5) break;
      const withA = rows.filter((s) => s.fga >= T.minFga);
      line('| ' + (y + 1) + ' | ' + rows.length + ' | ' + f0(med(rows.map((s) => s.age))) + ' | ' + f0(med(rows.map((s) => s.ovr))) + ' | ' + f0(med(rows.map((s) => s.fga))) + ' | ' + pct(med(withA.map(fgp))) + ' | ' + f0(med(withA.map((s) => s.long))) + ' |');
    }
    line();
    line('#### Longest FG distribution (career)');
    line();
    line('| p5 | p25 | median | p75 | p95 | ≥ 60 | ≥ 64 | ≥ 67 | NFL-only median |');
    line('|---|---|---|---|---|---|---|---|---|');
    line('| ' + [0.05, 0.25, 0.5, 0.75, 0.95].map((p) => f0(q(longs, p))).join(' | ') + ' | ' + pct(count(R, (r) => r.long >= 60) / R.length) + ' | ' + pct(count(R, (r) => r.long >= 64) / R.length) + ' | ' + pct(count(R, (r) => r.long >= 67) / R.length) + ' | ' + f0(med(R.map((r) => r.nflLong))) + ' |');
    line();
    line('#### Hall of Fame');
    line();
    line('| Verdicts | Tiers | HOF score p10 / median / p90 |');
    line('|---|---|---|');
    line('| ' + histText(hist(R, (r) => r.hof.verdict), ['FIRST_BALLOT', 'INDUCTED', 'FINALIST', 'NOT_ON_BALLOT']) + ' | ' + histText(hist(R, (r) => r.hof.tier), ['Immortal', 'Legend', 'Franchise Leg', 'Solid Starter', 'Journeyman']) + ' | ' + f0(q(R.map((r) => r.hof.score), 0.1)) + ' / ' + f0(med(R.map((r) => r.hof.score))) + ' / ' + f0(q(R.map((r) => r.hof.score), 0.9)) + ' |');
    line();
    line('#### Career shape');
    line();
    line('| Stars | Draft round (8 = UDFA, 9 = undrafted) | Retirement reasons | Final age median | Career FG% median | Peak OVR median | Attributes at POT at retirement (of 5) | Unspent XP median | Earnings $M median |');
    line('|---|---|---|---|---|---|---|---|---|');
    line('| ' + histText(hist(R, (r) => r.stars)) + ' | ' + histText(hist(R, (r) => r.draft === null ? 'none' : r.draft)) + ' | ' + histText(hist(R, (r) => r.retiredReason || 'n/a')) + ' | ' + f0(med(R.map((r) => r.finalAge))) + ' | ' +
      pct(med(R.map((r) => r.careerFgm / Math.max(1, r.careerFga)))) + ' | ' + f0(med(R.map((r) => r.peakOvr))) + ' | ' + f1(R.reduce((a, r) => a + r.atPot, 0) / R.length) + ' | ' + f0(med(R.map((r) => r.xpLeft))) + ' | ' + f1(med(R.map((r) => r.earnings))) + ' |');
    console.log(out.join('\n'));
  }
}
