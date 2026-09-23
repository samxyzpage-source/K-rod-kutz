#!/usr/bin/env node
/**
 * qa_shots: screenshots of every beat of the demo at phone + desktop into qb/test/e2e/shots/ —
 * qb_title · qb_situation · qb_read · qb_snap · qb_throw (the bar climbing, the green band) · qb_flight · qb_result ·
 * qb_story · qb_summary, each as <name>_<viewport>.png. Not a spec (no assertions, not run by run.js): a QA tool.
 *
 *   /opt/node22/bin/node qb/test/e2e/qa_shots.js                 # phone + desktop, http mode (its own server)
 *   /opt/node22/bin/node qb/test/e2e/qa_shots.js phone file      # one viewport, one mode
 *   /opt/node22/bin/node qb/test/e2e/qa_shots.js all             # phone, desktop, landscape, narrow
 */
'use strict';
const H = require('./_harness');
const Q = require('./_playhelpers');

const args = process.argv.slice(2);
const vps = args.includes('all') ? ['phone', 'desktop', 'landscape', 'narrow'] : (args.filter(a => H.VIEWPORTS[a]).length ? args.filter(a => H.VIEWPORTS[a]) : ['phone', 'desktop']);
const mode = args.includes('file') ? 'file' : 'http';
const SEED = args.find(a => /^seed=/.test(a)) ? args.find(a => /^seed=/.test(a)).slice(5) : '4242';

async function settle(page, ms) { await page.waitForTimeout(ms || 350); }

async function shootViewport(vp) {
  const app = await H.openDemo({ mode, viewport: vp, seed: SEED });
  const { page } = app;
  const shot = async name => { const f = await H.shot(page, 'qb_' + name + '_' + vp); console.log('  ' + f); };
  try {
    await settle(page, 400);
    await shot('title');
    await Q.pickArchetype(page, 'GUNSLINGER'); await Q.pickTeam(page, 'AVERAGE'); await Q.pickVenue(page, 'COLLEGE');
    await Q.startDrive(page);
    await settle(page, 450);                       // the situation card pops in over 0.2 s
    await shot('situation');
    await Q.tapToRead(page);
    await settle(page, 450);
    await shot('read');
    const list = await Q.cards(page);
    const card = Q.bestCard(list);
    const ph = await Q.pickPlay(page, card.idx);
    if (ph === 'SNAP' || ph === 'THROW') {
      await settle(page, 250);
      await shot('snap');
      const tgt = await Q.chooseTarget(page);
      await Q.tapReceiver(page, tgt.slot);
      await Q.holdRelease(page, { lead: tgt.ideal.lead, loft: tgt.ideal.loft, releaseAt: tgt.releaseAt, onHold: async () => { await settle(page, 200); await shot('throw'); } });
      await shot('flight');
    }
    await Q.waitResult(page);
    await settle(page, 300);
    await shot('result');
    await page.evaluate(() => { const v = RTG.UI.PlayView.current(); if (v && v.phase() === 'RESULT') v.skip(); });
    await Q.waitDone(page);
    await settle(page, 300);
    await shot('story');
    await H.debug(page, 'skipTo', 'summary');
    await H.waitForScreen(page, 'summary');
    await settle(page, 300);
    await shot('summary');
    if (app.errors.length || app.foreignErrors.length) console.log('  errors:', app.errors.concat(app.foreignErrors));
  } catch (e) {
    console.error('  FAILED ' + vp + ': ' + (e && e.message || e));
    try { await H.shot(page, 'qb_fail_' + vp); } catch (e2) { /* ignore */ }
  } finally { await app.close(); }
}

(async () => {
  console.log('qa_shots: ' + mode + ' · ' + vps.join(', ') + ' · seed ' + SEED);
  for (const vp of vps) { console.log(vp + ':'); await shootViewport(vp); }
  await H.closeBrowser();
})();
