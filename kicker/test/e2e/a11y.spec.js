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

test('a11y http phone: the cb / hc palettes clear 4.5:1 and keep mint and red apart (QA2-09, QA2-11)', async () => {
  const app = await H.openApp({ mode: 'http', viewport: 'phone' });
  const { page } = app;
  try {
    await H.debug(page, 'jumpTo', { stage: 'COLLEGE', phase: 'REG', week: 1, seed: 4242 });
    await H.waitForScreen(page, 'hub');
    const read = mode => page.evaluate(m => {
      RTG.UI.store.setSetting('colorblind', m === 'cb');
      RTG.UI.store.setSetting('highContrast', m === 'hc');
      const cs = getComputedStyle(document.documentElement);
      const tok = k => cs.getPropertyValue(k).trim();
      const probe = document.createElement('span');
      document.body.appendChild(probe);
      function rgb(x) { probe.style.color = ''; probe.style.color = x; const c = getComputedStyle(probe).color.match(/\d+/g).map(Number); return c; }
      function chan(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
      function lum(x) { const r = rgb(x); return 0.2126 * chan(r[0]) + 0.7152 * chan(r[1]) + 0.0722 * chan(r[2]); }
      function cr(a, b) { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }
      const out = {
        mintOnNavy: cr(tok('--mint'), tok('--navy')),
        mintOnCard: cr(tok('--mint'), tok('--navy-2')),
        redOnNavy: cr(tok('--red'), tok('--navy')),
        skyOnNavy: cr(tok('--sky'), tok('--navy')),
        goldOnNavy: cr(tok('--gold'), tok('--navy')),
        mintLum: lum(tok('--mint')), redLum: lum(tok('--red')), skyLum: lum(tok('--sky')), goldLum: lum(tok('--gold')),
        mint: tok('--mint'), red: tok('--red'), sky: tok('--sky'), gold: tok('--gold')
      };
      probe.remove();
      return out;
    }, mode);

    const cb = await read('cb');
    for (const k of ['mintOnNavy', 'mintOnCard', 'redOnNavy', 'skyOnNavy', 'goldOnNavy']) {
      assert.ok(cb[k] >= 4.5, 'colour-blind ' + k + ' = ' + cb[k].toFixed(2) + ' (needs ≥ 4.5 for banner / small text)');
    }
    const hc = await read('hc');
    for (const k of ['mintOnNavy', 'redOnNavy', 'skyOnNavy', 'goldOnNavy']) {
      assert.ok(hc[k] >= 4.5, 'high-contrast ' + k + ' = ' + hc[k].toFixed(2));
    }
    // the power bar's target (mint) and overswing (red) zones must not collapse into the same block, and the sky
    // band must not be the same colour as the gold power fill — in greyscale as well as in colour.
    assert.notEqual(hc.mint, hc.red, 'high contrast: mint and red are different colours');
    assert.ok(Math.abs(hc.mintLum - hc.redLum) > 0.15, 'high contrast: mint and red differ in luminance too (' + hc.mintLum.toFixed(2) + ' vs ' + hc.redLum.toFixed(2) + ')');
    assert.notEqual(hc.sky, hc.gold, 'high contrast: the sky band is not the gold accent');
    assert.ok(Math.abs(hc.skyLum - hc.goldLum) > 0.15, 'high contrast: sky and gold differ in luminance');
    // SPEC §4.1: js/ui/palette.js is the canvas's copy of the same tokens — the kick scene paints through
    // Palette.get, so a CSS-only palette change leaves the power bar / sky band on the old colours.
    for (const variant of ['default', 'cb', 'hc']) {
      const drift = await page.evaluate(v => {
        RTG.UI.store.setSetting('colorblind', v === 'cb');
        RTG.UI.store.setSetting('highContrast', v === 'hc');
        const MAP = { navy: '--navy', navy2: '--navy-2', cream: '--cream', ink: '--ink', grass: '--grass', grass2: '--grass-2',
          chalk: '--chalk', gold: '--gold', red: '--red', sky: '--sky', mint: '--mint', grey: '--grey', dusk: '--dusk',
          shadow: '--shadow', dusk2: '--dusk-2', sunset: '--sunset', night: '--night' };
        const cs = getComputedStyle(document.documentElement);
        const probe = document.createElement('span');
        document.body.appendChild(probe);
        const norm = x => { probe.style.color = ''; probe.style.color = x; return getComputedStyle(probe).color; };
        const pal = RTG.UI.Palette.variant(v), out = [];
        for (const tok in MAP) {
          const css = cs.getPropertyValue(MAP[tok]).trim();
          if (!css) continue;
          if (norm(css) !== norm(pal[tok])) out.push(tok + ': css ' + css + ' vs palette.js ' + pal[tok]);
        }
        probe.remove();
        return out;
      }, variant);
      assert.deepEqual(drift, [], 'palette.js mirrors the ' + variant + ' CSS tokens');
    }
    await page.evaluate(() => { RTG.UI.store.setSetting('highContrast', false); RTG.UI.store.setSetting('colorblind', false); });
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});

test('a11y http desktop: leaving Settings cancels a pending key remap (QA1-03)', async () => {
  const app = await H.openApp({ mode: 'http', viewport: 'desktop' });
  const { page } = app;
  try {
    await H.debug(page, 'jumpTo', { stage: 'COLLEGE', phase: 'REG', week: 2, seed: 4242 });
    await H.debug(page, 'go', 'settings');
    await H.waitForScreen(page, 'settings');
    const before = await page.evaluate(() => RTG.UI.store.settings.keys.confirm);
    const armed = await page.evaluate(() => {
      const card = Array.prototype.filter.call(document.querySelectorAll('.settings-screen .card'), c => /KEYS/.test(c.textContent))[0];
      const b = card.querySelector('button');
      b.click();
      return b.textContent;
    });
    assert.match(armed, /PRESS A KEY/, 'the row is waiting for a key');
    await H.debug(page, 'go', 'hub');
    await H.waitForScreen(page, 'hub');
    await page.keyboard.press('x');
    await page.waitForTimeout(50);
    const after = await page.evaluate(() => {
      const saved = RTG.UI.Storage.getJSON('rtg.settings');
      return { live: RTG.UI.store.settings.keys.confirm, saved: saved && saved.keys ? saved.keys.confirm : null };
    });
    assert.equal(after.live, before, 'the stray key press did not remap the setting');
    // rtg.settings is only written when a setting actually changes: either it was never written, or it still holds the old key
    assert.ok(after.saved === null || after.saved === before, 'nothing was persisted (saved=' + JSON.stringify(after.saved) + ')');
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});

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
