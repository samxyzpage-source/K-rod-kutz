#!/usr/bin/env node
/**
 * qa_shots (v2 "DRAW THE PASS"): screenshots of every beat of the demo into qb/test/e2e/shots/, each as
 * qb_<name>_<viewport>.png — title · situation · read · snap (the formation, ready to draw) · draw_bullet (a fast pass
 * line mid-draw, the finger still down, slow motion on) · flight · catch (or the landing) · result · story ·
 * draw_lob (a slow line mid-draw) · flight_lob (the ball at the top of its arc over the underneath defenders) ·
 * draw_run (a run line) · run (the QB running it) · sack (the QB who just stood there) · int (a real interception: the
 * engine's contact odds tuned to certain for this one throw, so the scene's pick-and-return beat is the engine's) · tip
 * (the same, batted) · summary. A FIELD GENERAL is used so the preview colours show on the pass lines. Not a spec (no
 * assertions, not run by run.js): a QA tool.
 *
 *   /opt/node22/bin/node qb/test/e2e/qa_shots.js                 # phone + desktop, http mode (its own server)
 *   /opt/node22/bin/node qb/test/e2e/qa_shots.js phone file      # one viewport, one mode
 *   /opt/node22/bin/node qb/test/e2e/qa_shots.js all             # phone, desktop, landscape, narrow
 *   /opt/node22/bin/node qb/test/e2e/qa_shots.js seed=77         # another seed
 */
'use strict';
const H = require('./_harness');
const Q = require('./_playhelpers');

const args = process.argv.slice(2);
const vps = args.includes('all') ? ['phone', 'desktop', 'landscape', 'narrow'] : (args.filter(a => H.VIEWPORTS[a]).length ? args.filter(a => H.VIEWPORTS[a]) : ['phone', 'desktop']);
const mode = args.includes('file') ? 'file' : 'http';
const SEED = args.find(a => /^seed=/.test(a)) ? args.find(a => /^seed=/.test(a)).slice(5) : '4242';

async function settle(page, ms) { await page.waitForTimeout(ms || 350); }

/** SITUATION → READ → the best pass card → the QB ready to draw (false when a run card came up). */
async function toPlay(page, shot, names) {
  await H.waitPhase(page, 'SITUATION');
  if (names) { await settle(page, 450); await shot(names[0]); }
  await Q.tapToRead(page);
  if (names) { await settle(page, 450); await shot(names[1]); }
  const pc = await Q.pickPassCard(page);
  if (pc.phase !== 'PLAY') return false;
  await Q.waitCanDraw(page);
  return true;
}

/** The result beat → the story (a shot of each when named) → NEXT. */
async function finish(page, shot, names) {
  await Q.waitResult(page);
  if (names && names[0]) { await settle(page, 300); await shot(names[0]); }
  await Q.skipResult(page);
  const sc = await Q.waitDone(page);
  if (names && names[1] && sc === 'moment') { await settle(page, 300); await shot(names[1]); }
  if (sc === 'moment') await Q.next(page);
  return sc;
}

/** Make every ball that passes a defender's hands a sure touch (INT: picked · TIP: batted; the line can't reach it, so the
    linebackers either: the pick is made downfield, by the secondary) — RTG.debug.tune, reset after. */
async function sureContact(page, kind) {
  const knobs = [['reachR', 3], ['reach.DL', 0], ['reach.LB', 0], ['tip.base', 1], ['tip.near', 1], ['tip.hMin', 1], ['tip.blind', 1], ['tip.held', 1], ['tip.max', 1],
    ['int.touch', kind === 'INT' ? 1 : 0], ['int.high', 1], ['int.blind', 1], ['int.held', 1], ['int.contest', kind === 'INT' ? 5 : 0], ['int.alone', kind === 'INT' ? 1 : 0]];
  for (const [k, v] of knobs) await H.debug(page, 'tune', 'qb.field.' + k, v);
}

/** Wait (real time) until the live logged an event of `kind` (or the play is over). */
function waitEvent(page, kind, timeout) {
  return page.waitForFunction(k => { const v = RTG.UI.PlayView.current(), l = v && v.live(); return !l || l.phase === 'DONE' || l.events.some(e => e.kind === k); }, kind, { timeout: timeout || 6000 }).catch(() => null);
}

async function shootViewport(vp) {
  const app = await H.openDemo({ mode, viewport: vp, seed: SEED });
  const { page } = app;
  const touch = !!H.VIEWPORTS[vp].hasTouch;
  const shot = async name => { const f = await H.shot(page, 'qb_' + name + '_' + vp); console.log('  ' + f); };
  const step = async (label, fn) => { try { await fn(); } catch (e) { console.error('  ' + vp + ' · ' + label + ': ' + (e && e.message || e).split('\n')[0]); try { await shot('fail_' + label); } catch (e2) { /* ignore */ } } };
  try {
    await settle(page, 400);
    await shot('title');
    await Q.pickArchetype(page, 'FIELD_GENERAL'); await Q.pickTeam(page, 'AVERAGE'); await Q.pickVenue(page, 'COLLEGE');
    await Q.startDrive(page);

    // moment 1 · a bullet: the line mid-draw, the flight, the catch, the result, the story
    await step('bullet', async () => {
      if (await toPlay(page, shot, ['situation', 'read'])) {
        await settle(page, 200); await shot('snap');
        const tgt = await Q.chooseTarget(page, { loft: 0.1 });
        if (tgt && tgt.slot) {
          const r = await Q.drawPass(page, tgt.slot, { speed: 'fast', touch, keepDown: true });
          await settle(page, 60); await shot('draw_bullet');
          await r.up();
          await Q.waitReleased(page);
          await settle(page, 120); await shot('flight');
          await waitEvent(page, 'CATCH', 4000);
          await settle(page, 60); await shot('catch');
        }
      }
      await finish(page, shot, ['result', 'story']);
    });

    // moment 2 · a lob: the slow line mid-draw, the ball at the top of its arc (a deep receiver when there is one)
    await step('lob', async () => {
      if (await toPlay(page, shot)) {
        const tgt = await Q.chooseTarget(page, { loft: 0.9, minDepth: 15 });
        if (tgt && tgt.slot) {
          const r = await Q.drawPass(page, tgt.slot, { speed: 'slow', touch, keepDown: true });
          await shot('draw_lob');
          await r.up();
          await Q.waitReleased(page);
          await page.waitForFunction(() => { const l = RTG.UI.PlayView.current() && RTG.UI.PlayView.current().live(); return !l || !l.ball || l.ball.u >= 0.45 || l.phase === 'DONE'; }, null, { timeout: 4000 }).catch(() => null);
          await shot('flight_lob');
        }
      }
      await finish(page, shot, ['result_lob']);
    });

    // moment 3 · a run line, then the QB running it
    await step('run', async () => {
      if (await toPlay(page, shot)) {
        const r = await Q.drawRun(page, 'scramble', { touch, keepDown: true });
        await settle(page, 80); await shot('draw_run');                      // the finger is still down: the scene drew the whole line
        await r.up();
        await settle(page, 450); await shot('run');
      }
      await finish(page, shot, ['result_run']);
    });

    // moment 4 · the sack: nobody draws anything
    await step('sack', async () => {
      if (await toPlay(page, shot)) {
        await waitEvent(page, 'SACK', 8000);
        await settle(page, 80); await shot('sack');
      }
      await finish(page, shot, ['result_sack']);
    });

    // moment 5 · an interception by the engine (contact made certain for this throw): the pick and the return
    await step('int', async () => {
      if (await toPlay(page, shot)) {
        await Q.waitPlayTime(page, 1.0);
        await sureContact(page, 'INT');
        const tgt = await Q.chooseTarget(page, { loft: 0.1, minT: 0, maxT: 1.2 });
        if (tgt && tgt.slot) {
          await Q.drawPass(page, tgt.slot, { speed: 'fast', touch });
          await waitEvent(page, 'INT', 4000);
          await settle(page, 260); await shot('int');
        }
        await H.debug(page, 'tuningDefaults');
      }
      await finish(page, shot, ['result_int']);
    });

    // moment 6 · a tipped ball (the same, batted): the star at the defender's hands
    await step('tip', async () => {
      if (await toPlay(page, shot)) {
        await Q.waitPlayTime(page, 1.0);
        await sureContact(page, 'TIP');
        const tgt = await Q.chooseTarget(page, { loft: 0.1, minT: 0, maxT: 1.2 });
        if (tgt && tgt.slot) {
          await Q.drawPass(page, tgt.slot, { speed: 'fast', touch });
          await waitEvent(page, 'TIP', 4000);
          await settle(page, 40); await shot('tip');
        }
        await H.debug(page, 'tuningDefaults');
      }
      await finish(page, shot, []);
    });

    await step('summary', async () => {
      await H.debug(page, 'skipTo', 'summary');
      await H.waitForScreen(page, 'summary');
      await settle(page, 300); await shot('summary');
    });
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
