/**
 * kick_keyboard.spec (SPEC §5.2): aim-then-hold mode — ArrowLeft ×4 aims to −2°, then the confirm key is HELD
 * while the power bar climbs and released inside the green band. Aim comes from the arrows alone, power from
 * the release time, and quality from how close the release landed to the middle of the green; the mode emits
 * the same {power, aim, quality} triple as the flick.
 */
'use strict';
const { test, after } = require('node:test');
const H = require('./_harness');
const K = require('./_kickhelpers');
const assert = H.assert;

after(async () => { await H.closeBrowser(); });

async function setMeter(page) {
  await page.evaluate(() => RTG.UI.store.setSetting('inputMode', 'meter'));
}

/** Green band of the armed kick: [pNeed, pNeed + 0.15] capped at the top of the bar. */
async function green(page) {
  return page.evaluate(() => {
    var m = RTG.UI.KickView.current().model();
    return { lo: m.pNeed, hi: Math.min(RTG.Tuning.kick.range.powerMax, m.pNeed + 0.15) };
  });
}

/**
 * Hold `key` until the bar should read `target` power, then let go. The fill is linear over
 * Input.CONST.meter.holdMs, so the hold time is target/powerMax of that; timers are coarse, hence the
 * generous tolerances at the call sites.
 */
async function holdFor(page, key, target) {
  const ms = await page.evaluate((t) => {
    var M = RTG.UI.Input.CONST.meter, C = RTG.UI.Input.CONST;
    return Math.round(t / C.powerMax * M.holdMs);
  }, target);
  await page.keyboard.down(key);
  await page.waitForFunction(() => RTG.UI.KickView.current().phase() === 'POWER', null, { timeout: 4000 });
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

H.matrix(({ mode, vp }) => {
  test(`kick_keyboard ${mode} ${vp}: ArrowLeft×4 aims −2°, then hold-and-release in the green kicks`, async () => {
    const app = await H.openApp({ mode, viewport: vp });
    const { page } = app;
    try {
      await setMeter(page);
      await K.openShowcase(page, 99);
      assert.equal(await page.evaluate(() => document.querySelector('.kickview').classList.contains('kv-mode-meter')), true, 'meter mode scene');
      for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
      assert.equal(await page.evaluate(() => RTG.UI.KickView.current().phase()), 'SETUP');
      assert.ok(Math.abs(await page.evaluate(() => RTG.UI.KickView.current().aim()) + 2) < 1e-6, 'four taps aim −2°');
      const g = await green(page);
      await holdFor(page, 'Space', (g.lo + g.hi) / 2);
      await K.waitPhase(page, 'RESULT', 8000);
      const st = await H.debug(page, 'getState');
      assert.equal(st.pending.session.results.length, 1);
      const r = st.pending.session.results[0];
      assert.equal(r.auto, false);
      // aim is the arrows alone now — no accuracy needle to shift it
      assert.ok(Math.abs(r.aim + 2) < 0.06, 'aim −2 from four taps, got ' + r.aim);
      assert.ok(r.power > 0 && r.power <= 1.15, 'power from the release (' + r.power + ')');
      // released around the middle of the green ⇒ a good strike (timer slop keeps this loose)
      assert.ok(r.quality >= 0.7, 'release near the middle of the green is a clean strike, got ' + r.quality);
      assert.ok(await page.locator('.kv-banner').isVisible(), 'banner visible');
      if (mode === 'http') await H.shot(page, 'kick_keyboard_result_' + vp);
      assert.deepEqual(app.errors, [], 'console errors');
    } finally { await app.close(); }
  });
}, H.MODES, ['phone', 'desktop']);

test('kick_keyboard file desktop: Enter holds like Space; Space skips the flight after 300 ms', async () => {
  const app = await H.openApp({ mode: 'file', viewport: 'desktop' });
  const { page } = app;
  try {
    await setMeter(page);
    await K.openShowcase(page, 100);
    const g = await green(page);
    await holdFor(page, 'Enter', (g.lo + g.hi) / 2);
    await K.waitPhase(page, 'FLIGHT', 8000);
    await page.waitForTimeout(350);
    await page.keyboard.press('Space');            // skip
    await K.waitPhase(page, 'RESULT', 1500);
    const r = (await H.debug(page, 'getState')).pending.session.results[0];
    assert.equal(typeof r.outcome, 'string');
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});

test('kick_keyboard file phone: left-footed mirror flips the arrow nudge', async () => {
  const app = await H.openApp({ mode: 'file', viewport: 'phone' });
  const { page } = app;
  try {
    await page.evaluate(() => { RTG.UI.store.setSetting('inputMode', 'meter'); RTG.UI.store.setSetting('leftFooted', true); });
    await K.openShowcase(page, 101);
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
    const g = await green(page);
    await holdFor(page, 'Space', (g.lo + g.hi) / 2);
    await K.waitPhase(page, 'RESULT', 8000);
    const r = (await H.debug(page, 'getState')).pending.session.results[0];
    assert.ok(Math.abs(r.aim - 2) < 0.06, 'mirrored: four ArrowLeft taps aim +2°, got ' + r.aim);
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});

// Settings ▸ KEYS: Input.meter used to hard-code Space/Enter/←/→, so a remap changed the label and nothing else.
test('kick_keyboard file desktop: remapped keys drive the hold and the defaults step aside', async () => {
  const app = await H.openApp({ mode: 'file', viewport: 'desktop' });
  const { page } = app;
  try {
    await page.evaluate(() => {
      RTG.UI.store.setSetting('inputMode', 'meter');
      RTG.UI.store.setSetting('keys', { confirm: 'k', left: 'j', right: 'l' });
    });
    await K.openShowcase(page, 102);
    for (let i = 0; i < 2; i++) await page.keyboard.press('j');      // −1° through the remapped aim key
    await page.keyboard.press('ArrowLeft');                          // the old binding must no longer aim
    const g = await green(page);
    await holdFor(page, 'k', (g.lo + g.hi) / 2);
    await K.waitPhase(page, 'RESULT', 8000);
    const r = (await H.debug(page, 'getState')).pending.session.results[0];
    assert.ok(Math.abs(r.aim + 1) < 0.06, 'aim −1 (two j taps only, ArrowLeft ignored) — got ' + r.aim);
    assert.ok(r.power > 0 && r.power <= 1.15, 'power from the remapped hold (' + r.power + ')');
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});

// §4.8: the flick needs a pointer, so a keyboard-only player was stuck on the first showcase kick (chromeless
// screen, nothing to tab to, the play clock never starts). Confirm now swaps this scene to aim-and-hold.
test('kick_keyboard file desktop: Space in FLICK mode starts the hold and completes the kick', async () => {
  const app = await H.openApp({ mode: 'file', viewport: 'desktop' });
  const { page } = app;
  try {
    await page.evaluate(() => RTG.UI.store.setSetting('inputMode', 'flick'));   // aim-and-hold is the default now
    await K.openShowcase(page, 103);
    assert.equal(await page.evaluate(() => document.querySelector('.kickview').classList.contains('kv-mode-flick')), true, 'starts in flick mode');
    await page.keyboard.down('Space');
    await page.waitForFunction(() => RTG.UI.KickView.current().phase() === 'POWER', null, { timeout: 4000 });
    assert.equal(await page.evaluate(() => document.querySelector('.kickview').classList.contains('kv-mode-meter')), true, 'the scene switched to aim-and-hold');
    assert.match(await page.locator('#live').textContent(), /Keyboard kick mode/i, 'the swap is announced');
    assert.equal(await page.evaluate(() => RTG.UI.store.settings.inputMode), 'flick', 'the stored setting is untouched');
    await page.waitForTimeout(250);
    await page.keyboard.up('Space');                 // the fallback started the hold; letting go kicks
    await K.waitPhase(page, 'RESULT', 8000);
    const st = await H.debug(page, 'getState');
    assert.equal(st.pending.session.results.length, 1, 'the keyboard-only kick was recorded');
    assert.equal(st.pending.session.results[0].auto, false, 'it counts as a played kick');
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});

// §4.8, the other half of QA2-07: the kick screens are chromeless (no tab bar, no rail), so a player who needs
// METERS, a bigger font or the colour-blind palette has no way in — Escape is that route, and it must come back
// to the still-pending session rather than dropping the kick.
test('kick_keyboard file desktop: Escape on a chromeless kick screen opens Settings and comes back (QA2-07)', async () => {
  const app = await H.openApp({ mode: 'file', viewport: 'desktop' });
  const { page } = app;
  try {
    await K.openShowcase(page, 104);
    assert.equal(await page.evaluate(() => document.getElementById('app').classList.contains('chromeless')), true, 'the showcase is chromeless');
    await page.keyboard.press('Escape');
    await H.waitForScreen(page, 'settings');
    // the player switches to METERS while they are there, then goes back
    await page.evaluate(() => RTG.UI.store.setSetting('inputMode', 'meter'));
    await page.evaluate(() => RTG.UI.Router.back());
    await H.waitForScreen(page, 'showcase');
    await K.waitPhase(page, 'SETUP', 8000);
    const st = await H.debug(page, 'getState');
    assert.equal(st.pending.kind, 'KICKS', 'the kick session is still pending');
    assert.equal(st.pending.session.results.length, 0, 'no kick was lost');
    // and the newly chosen mode is live on the scene
    assert.equal(await page.evaluate(() => document.querySelector('.kickview').classList.contains('kv-mode-meter')), true, 'the scene came back in meter mode');
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});
