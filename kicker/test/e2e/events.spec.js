/**
 * events.spec (SPEC §5.2): RTG.debug.triggerEvent('NIL_TRUCK') → the styled event modal with 3 big choice buttons
 * opens on whatever screen is live; choose 0 → player.fame +30 (the catalog effect), the consequence headline is
 * toasted and sits in state.headlines / history.timeline, and it survives endWeek. Also: the effect preview follows
 * Tuning.difficulty[d].effectPreview (rookie → the choice text, pro → signed icons), the inbox screen renders the
 * chat bubbles and marks them read. Runs on file:// and http at 390×844 and 1280×800.
 */
'use strict';
const { test, after } = require('node:test');
const H = require('./_harness');
const assert = H.assert;

after(async () => { await H.closeBrowser(); });

H.matrix(({ mode, vp }) => {
  test(`events ${mode} ${vp}: NIL_TRUCK modal → choice 0 → fame +30 → consequence headline after endWeek`, async () => {
    const app = await H.openApp({ mode, viewport: vp });
    const { page } = app;
    try {
      await H.debug(page, 'newCareer', { seed: 777, name: 'Event Tester', archetype: 'CANNON', difficulty: 'pro' });
      await H.debug(page, 'jumpTo', { stage: 'COLLEGE', phase: 'REG', week: 1 });
      await H.debug(page, 'setSoft', { fame: 120 });
      // the modal must open on any screen: trigger it from the stats screen
      await H.debug(page, 'go', 'stats');
      await H.waitForScreen(page, 'stats');
      const before = (await H.debug(page, 'getState')).player.fame;
      const ev = await H.debug(page, 'triggerEvent', 'NIL_TRUCK');
      assert.equal(ev.id, 'NIL_TRUCK');
      await page.locator('.styled-event').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => RTG.UI.Router.current()), 'stats', 'the live screen stays put under the modal');
      const buttons = page.locator('.styled-event .event-choice-btn');
      assert.equal(await buttons.count(), 3, 'three choice buttons');
      assert.match(await page.locator('.styled-event .modal-title').textContent(), /NIL/i);
      // pro difficulty → icons preview (signed chips), never the numbers
      assert.ok(await page.locator('.styled-event .event-fx').count() >= 1, 'icon preview rendered on pro');
      const box = await buttons.first().boundingBox();
      assert.ok(box.height >= 44, 'choice button is a 44-px touch target (' + box.height + ')');
      if (mode === 'http') await H.shot(page, 'events_modal_' + vp);
      // Escape must not close an event modal
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.styled-event').count(), 1, 'event modal is not closable');
      await buttons.nth(0).click();
      await page.waitForFunction(() => document.querySelectorAll('.styled-event').length === 0);
      const st = await H.debug(page, 'getState');
      assert.equal(st.pending, null, 'event resolved');
      assert.equal(st.player.fame, before + 30, 'fame +30 from the SIGN choice');
      const consequence = st.headlines[st.headlines.length - 1];
      assert.ok(consequence && consequence.text, 'consequence headline pushed');
      await page.locator('.toast', { hasText: consequence.text.slice(0, 20) }).waitFor({ state: 'visible', timeout: 3000 });
      // play the week and end it: the consequence headline is still on the wire / timeline
      await H.debug(page, 'simGame');
      await page.evaluate(() => RTG.UI.store.dispatch('endWeek'));
      await H.debug(page, 'settle');
      const st2 = await H.debug(page, 'getState');
      assert.ok(st2.headlines.some(h => h.id === consequence.id), 'consequence headline kept after endWeek');
      assert.ok(st2.history.timeline.some(t => t.kind === 'EVENT' && t.eventId === 'NIL_TRUCK'), 'timeline entry for the event');
      await H.debug(page, 'go', 'hub');
      await H.waitForScreen(page, 'hub');
      assert.ok(await page.locator('.scr-hub').count() === 1, 'hub screen (not the fallback)');
      assert.deepEqual(app.errors, [], 'console errors');
    } finally { await app.close(); }
  });
}, H.MODES, ['phone', 'desktop']);

test('events http phone: rookie difficulty shows the numeric preview; inbox bubbles and unread marking', async () => {
  const app = await H.openApp({ mode: 'http', viewport: 'phone' });
  const { page } = app;
  try {
    await H.debug(page, 'newCareer', { seed: 31, name: 'Rookie Tester', difficulty: 'rookie' });
    await H.debug(page, 'jumpTo', { stage: 'COLLEGE', phase: 'REG', week: 2 });
    await H.debug(page, 'setSoft', { fame: 150 });
    await H.debug(page, 'triggerEvent', 'NIL_TRUCK');
    await page.locator('.styled-event').waitFor({ state: 'visible' });
    const previews = await page.locator('.styled-event .event-preview').allTextContents();
    assert.ok(previews.some(t => /\+\s?30|fame|\d/i.test(t)), 'rookie preview carries the numbers: ' + previews.join(' | '));
    await page.locator('.styled-event [data-action="choice-1"]').click();
    await page.waitForFunction(() => document.querySelectorAll('.styled-event').length === 0);
    // inbox
    const unreadBefore = await page.evaluate(() => RTG.UI.store.state.inbox.filter(m => !m.read).length);
    assert.ok(unreadBefore > 0, 'unread messages exist');
    await H.debug(page, 'go', 'inbox');
    await H.waitForScreen(page, 'inbox');
    assert.ok(await page.locator('.scr-inbox .bubble').count() >= 1, 'chat bubbles rendered');
    assert.ok(await page.locator('.scr-inbox .kit-avatar').count() >= 1, 'pixel avatars rendered');
    await page.waitForFunction(() => RTG.UI.store.state.inbox.every(m => m.read), null, { timeout: 3000 });
    await page.click('[data-filter="coach"]');
    const senders = await page.locator('.scr-inbox .bubble-row').evaluateAll(rows => rows.map(r => r.className));
    assert.ok(senders.every(c => /bubble-coach/.test(c)), 'coach filter keeps only coach bubbles');
    await H.shot(page, 'events_inbox_phone');
    await H.noHorizontalScroll(page, 'inbox');
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});
