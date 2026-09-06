/**
 * a11y.spec (SPEC §5.2 / §4.8): Tab reaches every hub button and the focus ring is visible on keyboard focus;
 * reduced motion (prefers-reduced-motion emulation and the setting) makes the postgame stamp / awards envelopes /
 * draft ticker instant; the aria-live region announces results (after a simmed game and after a forced kick);
 * the colour-blind class keeps text in the result banners; the event modal traps focus and every icon-only button
 * carries an aria-label. Runs on file:// and http at 390×844 and 1280×800.
 */
'use strict';
const { test, after } = require('node:test');
const H = require('./_harness');
const assert = H.assert;

after(async () => { await H.closeBrowser(); });

H.matrix(({ mode, vp }) => {
  test(`a11y ${mode} ${vp}: Tab reaches every hub button, focus ring, aria-live, colour-blind text`, async () => {
    const app = await H.openApp({ mode, viewport: vp });
    const { page } = app;
    try {
      await H.debug(page, 'jumpTo', { stage: 'COLLEGE', phase: 'REG', week: 1, seed: 4242 });
      await H.waitForScreen(page, 'hub');
      // every visible hub button is reachable with Tab
      const targets = await page.locator('.scr-hub button').evaluateAll(bs => bs.filter(b => b.offsetParent !== null && !b.disabled).map(b => b.getAttribute('data-action') || b.getAttribute('aria-label') || b.textContent.trim()));
      assert.ok(targets.length >= 5, 'hub has buttons: ' + targets.join(', '));
      await page.evaluate(() => { document.body.focus(); });
      const reached = new Set();
      let ringSeen = false;
      for (let i = 0; i < 80 && reached.size < targets.length; i++) {
        await page.keyboard.press('Tab');
        const info = await page.evaluate(() => {
          const a = document.activeElement;
          if (!a || !a.closest('.scr-hub') || a.tagName !== 'BUTTON') return null;
          const cs = getComputedStyle(a);
          return { id: a.getAttribute('data-action') || a.getAttribute('aria-label') || a.textContent.trim(), outline: cs.outlineStyle, width: cs.outlineWidth, color: cs.outlineColor };
        });
        if (info) { reached.add(info.id); if (info.outline !== 'none' && parseFloat(info.width) >= 2) ringSeen = true; }
      }
      const missing = targets.filter(t => !reached.has(t));
      assert.deepEqual(missing, [], 'every hub button reached by Tab');
      assert.ok(ringSeen, 'focus ring visible on keyboard focus (outline ≥ 2 px)');
      // icon-only buttons carry a label
      const unlabeled = await page.locator('.scr-hub button').evaluateAll(bs => bs.filter(b => !b.textContent.trim() && !b.getAttribute('aria-label')).length);
      assert.equal(unlabeled, 0, 'no unlabeled icon-only buttons on the hub');
      // aria-live: the postgame announces the final score
      const liveBefore = await page.locator('#live').textContent();
      await page.locator('[data-action="sim-game"]').click();
      await H.waitForScreen(page, 'postgame');
      await page.waitForFunction(b => document.getElementById('live').textContent !== b && /Final/.test(document.getElementById('live').textContent), liveBefore, { timeout: 3000 });
      // colour-blind mode: the banners keep their text
      await page.evaluate(() => RTG.UI.store.setSetting('colorblind', true));
      assert.ok(await page.evaluate(() => document.body.classList.contains('cb')), 'body.cb applied');
      const result = await page.locator('.scr-postgame .pg-result').textContent();
      assert.match(result, /WIN|LOSS|TIE/, 'result text present in colour-blind mode');
      const stampCount = await page.locator('.scr-postgame .pg-stamp').count();
      if (stampCount) assert.match(await page.locator('.scr-postgame .pg-stamp').getAttribute('data-grade'), /^[A-F]$/, 'grade stamp carries the letter');
      await page.evaluate(() => RTG.UI.store.setSetting('colorblind', false));
      // Enter activates CONTINUE (screen onKey) → hub
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => RTG.UI.store.state.week === 2 || RTG.UI.store.state.pending !== null, null, { timeout: 5000 });
      // the event modal traps focus and has no close button
      await H.debug(page, 'settle');
      await H.debug(page, 'triggerEvent', 'KID_LESSON');
      await page.locator('.styled-event').waitFor({ state: 'visible' });
      assert.equal(await page.locator('.styled-event .modal-x').count(), 0, 'no close button on an event modal');
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press('Tab');
        assert.ok(await page.evaluate(() => !!document.activeElement.closest('.styled-event')), 'focus stays inside the event modal');
      }
      await page.locator('.styled-event [data-action="choice-0"]').click();
      await page.waitForFunction(() => document.querySelectorAll('.styled-event').length === 0);
      // aria-live after a forced kick in a game
      await H.debug(page, 'settle');
      const st = await H.debug(page, 'getState');
      if (st.phase === 'REG' && !st.game) {
        await page.evaluate(() => RTG.UI.store.dispatch('startUserGame'));
        await H.waitForScreen(page, 'game');
        for (let g = 0; g < 40; g++) {
          const cur = await H.screenId(page);
          if (cur === 'kick') break;
          if (cur !== 'game' || await page.evaluate(() => !RTG.UI.store.state.game)) break;
          await page.locator('button[data-action="next-kick"]').click();
          await page.waitForTimeout(80);
        }
        if (await H.screenId(page) === 'kick') {
          const before = await page.locator('#live').textContent();
          await page.waitForTimeout(300);
          await H.debug(page, 'forceKick', { outcome: 'GOOD' });
          await page.waitForFunction(b => document.getElementById('live').textContent !== b, before, { timeout: 4000 });
        }
      }
      assert.deepEqual(app.errors, [], 'console errors');
    } finally { await app.close(); }
  });
}, H.MODES, ['phone', 'desktop']);

test('a11y http phone: reduced motion makes the stamp, the envelopes and the draft ticker instant', async () => {
  const app = await H.openApp({ mode: 'http', viewport: 'phone', reducedMotion: 'reduce' });
  const { page } = app;
  try {
    assert.ok(await page.evaluate(() => RTG.UI.Shell.reducedMotion()), 'Shell.reducedMotion() honours prefers-reduced-motion');
    await H.debug(page, 'jumpTo', { stage: 'COLLEGE', phase: 'REG', week: 1, seed: 999 });
    await H.waitForScreen(page, 'hub');
    await page.locator('[data-action="sim-game"]').click();
    await H.waitForScreen(page, 'postgame');
    const stamp = page.locator('.scr-postgame .pg-stamp');
    if (await stamp.count()) {
      assert.ok(await stamp.evaluate(e => e.classList.contains('stamp-instant')), 'stamp is instant under reduced motion');
      assert.ok(await stamp.evaluate(e => !e.classList.contains('stamp-pre')), 'no pre-animation state');
    }
    // awards: envelopes open at once
    await H.debug(page, 'jumpTo', { stage: 'COLLEGE', phase: 'AWARDS' });
    await H.waitForScreen(page, 'awards');
    const env = await page.locator('.scr-awards .envelope').count();
    const open = await page.locator('.scr-awards .envelope.open').count();
    assert.equal(open, env, 'every envelope is open immediately (' + open + '/' + env + ')');
    await H.shot(page, 'a11y_awards_reduced_phone');
    // the draft ticker: all picks at once
    await H.debug(page, 'jumpTo', { stage: 'DRAFT', phase: 'DRAFT' });
    await H.waitForScreen(page, 'draft');
    await page.locator('[data-action="start-draft"]').click();
    await page.waitForFunction(() => !!(RTG.UI.store.state.flags && RTG.UI.store.state.flags.draftResult), null, { timeout: 10000 });
    const total = await page.evaluate(() => RTG.UI.store.state.flags.draftResult.ticker.length);
    await page.waitForTimeout(50);
    assert.equal(await page.locator('.scr-draft .pick-row').count(), total, 'every pick shown at once under reduced motion');
    // the setting alone also switches it
    await page.evaluate(() => RTG.UI.store.setSetting('reducedMotion', true));
    assert.ok(await page.evaluate(() => document.body.classList.contains('reduced-motion')), 'body.reduced-motion applied');
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});
