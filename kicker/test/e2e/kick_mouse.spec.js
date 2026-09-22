/**
 * kick_mouse.spec (SPEC §5.2): in a senior-season game, page.mouse presses on the ball, drags down 120 px over 300 ms,
 * flicks up 60 px in 80 ms and releases → the result banner is visible; getState().pending.session.results.length
 * === 1 with input.power within 0.5–1.15 and auto === false. Overswing: a drag to the bottom of the viewport (past
 * D_full) → power > 1 and feedback.power === 'OVERSWING'. Runs on file:// and http at the phone and desktop viewports.
 */
'use strict';
const { test, after } = require('node:test');
const H = require('./_harness');
const K = require('./_kickhelpers');
const assert = H.assert;

after(async () => { await H.closeBrowser(); });

H.matrix(({ mode, vp }) => {
  test(`kick_mouse ${mode} ${vp}: press, pull 120 px, flick → banner + result`, async () => {
    const app = await H.openApp({ mode, viewport: vp });
    const { page } = app;
    try {
      await K.useFlick(page); await K.openHsGame(page, 4242);
      const g = await K.geometry(page);
      assert.ok(g.scale >= 2 ? Number.isInteger(g.scale) : (g.scale === 1 || g.scale >= 1.35), 'integer scale, or the fractional phone fit ≥ 1.35 (' + g.scale + ')');
      if (vp === 'desktop') assert.ok(Number.isInteger(g.scale) && g.scale >= 2, 'desktop integer-scales (' + g.scale + ')');
      await K.mouseFlick(page, { drag: 120, dragMs: 300, flick: 60, flickMs: 80 });
      await K.waitPhase(page, 'RESULT', 8000);
      const banner = page.locator('.kv-banner');
      assert.ok(await banner.isVisible(), 'result banner visible');
      const text = (await banner.textContent()).trim();
      assert.ok(text.length > 0, 'banner has text');
      const st = await H.debug(page, 'getState');
      assert.equal(st.pending.session.results.length, 1, 'one result recorded');
      const r = st.pending.session.results[0];
      assert.equal(r.auto, false, 'not an auto kick');
      assert.ok(r.power >= 0.5 && r.power <= 1.15, 'input.power within 0.5–1.15 (' + r.power + ')');
      assert.ok(Math.abs(r.aim) <= 12, 'aim clamped');
      assert.ok(r.quality >= 0 && r.quality <= 1, 'quality 0..1');
      assert.equal(typeof r.outcome, 'string');
      // the banner text matches the outcome family
      const made = r.made;
      assert.ok(made ? /GOOD/.test(text) : !/^✓?\s*GOOD!$/.test(text), 'banner matches made=' + made + ' (' + text + ')');
      // feedback line rendered from result.feedback
      const fb = await page.locator('.kv-feedback').textContent();
      assert.match(fb, /Timing: (PURE|GOOD|FAIR|POOR)/);
      assert.match(fb, /Power: \d+ %/);
      // aria-live announced the result
      const live = await page.locator('#live').textContent();
      assert.ok(live.length > 0, 'aria-live announced');
      if (mode === 'http') await H.shot(page, 'kick_mouse_result_' + vp);
      assert.deepEqual(app.errors, [], 'console errors');
    } finally { await app.close(); }
  });

  test(`kick_mouse ${mode} ${vp}: 200 px overswing → feedback.power OVERSWING`, async () => {
    const app = await H.openApp({ mode, viewport: vp });
    const { page } = app;
    try {
      await K.useFlick(page); await K.openHsGame(page, 4243);
      const g = await K.geometry(page);
      // D_full = 0.32 × css height (portrait) / 0.45 (landscape), capped at the room below the ball minus 12 px (a
      // finger cannot leave the screen). Pulling to 4 px above the viewport's bottom edge is therefore always past
      // D_full — by 8 px when the room cap binds (desktop), by a lot when 0.32 × height binds (phone) — and power
      // clamps at 1.15, so the exact depth does not matter.
      const room = g.innerHeight - g.ball.y;
      const drag = Math.floor(room - 4);
      assert.ok(drag >= 60, 'room below the ball for an overswing (' + room + ' px)');
      await K.mouseFlick(page, { drag: drag, dragMs: 300, flick: 60, flickMs: 80 });
      await K.waitPhase(page, 'RESULT', 8000);
      const st = await H.debug(page, 'getState');
      const r = st.pending.session.results[0];
      assert.ok(r.power > 1.0, 'power above 1.0 (' + r.power + ')');
      assert.equal(r.feedback.power, 'OVERSWING');
      assert.match(await page.locator('.kv-feedback').textContent(), /Power: 1\d\d %/);
      assert.deepEqual(app.errors, [], 'console errors');
    } finally { await app.close(); }
  });
}, H.MODES, ['phone', 'desktop']);

test('kick_mouse file desktop: no forward flick → mishit (power 0.5, quality 0.3)', async () => {
  const app = await H.openApp({ mode: 'file', viewport: 'desktop' });
  const { page } = app;
  try {
    await K.useFlick(page); await K.openHsGame(page, 4244);
    const g = await K.geometry(page);
    await page.mouse.move(g.ball.x, g.ball.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(g.ball.x, g.ball.y + 15 * i); await page.waitForTimeout(30); }
    await page.waitForTimeout(200);
    await page.mouse.up();   // released without flicking up
    await K.waitPhase(page, 'RESULT', 8000);
    const r = (await H.debug(page, 'getState')).pending.session.results[0];
    assert.equal(r.power, 0.5, 'mishit power');
    assert.equal(r.quality, 0.3, 'mishit quality');
    assert.ok(Math.abs(r.aim) <= 12);
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});

/** WCAG relative luminance of a computed `rgb(...)` colour. */
function lum(c) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
  if (!m) return 0;
  const f = v => { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(+m[1]) + 0.7152 * f(+m[2]) + 0.0722 * f(+m[3]);
}
function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

// §4.1 / §4.8: body.hc paints --red, --mint and --chalk all white, so `color:#fff` on `background: var(--red)`
// made the BLOCKED! banner a blank white rectangle (contrast 1:1). Filled banners must state their ink.
test('kick_mouse file phone: every result banner stays legible in high contrast and colour-blind mode', async () => {
  const app = await H.openApp({ mode: 'file', viewport: 'phone' });
  const { page } = app;
  try {
    for (const theme of ['default', 'hc', 'cb']) {
      await page.evaluate(t => {
        RTG.UI.store.setSetting('highContrast', t === 'hc');
        RTG.UI.store.setSetting('colorblind', t === 'cb');
      }, theme);
      for (const outcome of ['BLOCKED', 'GOOD', 'WIDE_L']) {
        await K.useFlick(page); await K.openHsGame(page, 4245);
        await page.evaluate(o => RTG.debug.forceKick({ outcome: o }), outcome);
        await K.waitPhase(page, 'RESULT', 9000);
        const c = await page.evaluate(() => {
          const e = document.querySelector('.kv-banner'), st = getComputedStyle(e);
          return { fg: st.color, bg: st.backgroundColor, text: e.textContent.trim() };
        });
        assert.ok(c.text.length > 0, theme + ' ' + outcome + ': the banner has text');
        assert.ok(contrast(c.fg, c.bg) >= 3, theme + ' ' + outcome + ': banner text ' + c.fg + ' on ' + c.bg + ' is ' + contrast(c.fg, c.bg).toFixed(2) + ':1');
      }
    }
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});

// The kick-screen toast band used to sit at 22 % — right on the uprights, which reach into the sky. It belongs in
// the open field between the crossbar and the tee, clear of the ball and the power bar.
test('kick_mouse file phone: a toast on the kick scene clears the uprights, the ball and the power bar', async () => {
  const app = await H.openApp({ mode: 'file', viewport: 'phone' });
  const { page } = app;
  try {
    await K.useFlick(page); await K.openHsGame(page, 4246);
    await page.evaluate(() => RTG.UI.C.toast('ICED! Timeout called', 'gold'));
    await page.waitForTimeout(150);
    const g = await page.evaluate(() => {
      const v = RTG.UI.KickView.current(), L = v.layout(), s = v.cv.scale, c = v.canvas.getBoundingClientRect();
      const t = document.querySelector('.toast-host .toast') || document.querySelector('.toast');
      const b = t.getBoundingClientRect();
      return {
        toast: { top: b.top, bottom: b.bottom, left: b.left, right: b.right },
        postTop: c.y + L.yPostTop * s, xbar: c.y + L.yXbar * s, ball: c.y + L.yT * s,
        bar: { left: c.x + L.bar.x * s, right: c.x + (L.bar.x + L.bar.w) * s, top: c.y + L.bar.y * s }
      };
    });
    assert.ok(g.toast.top >= g.xbar, 'the toast sits below the crossbar (' + Math.round(g.toast.top) + ' vs ' + Math.round(g.xbar) + ')');
    assert.ok(g.toast.bottom <= g.ball - 8, 'the toast stays above the ball (' + Math.round(g.toast.bottom) + ' vs ' + Math.round(g.ball) + ')');
    assert.ok(g.toast.left > g.bar.right || g.toast.bottom < g.bar.top, 'the toast clears the power bar');
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});

// §4.8: the canvas is tabbable, so its focus ring must be the same 3-px --sky outline every other control uses.
test('kick_mouse file desktop: the kick canvas shows the standard 3-px focus outline', async () => {
  const app = await H.openApp({ mode: 'file', viewport: 'desktop' });
  const { page } = app;
  try {
    await K.useFlick(page); await K.openHsGame(page, 4247);
    const ring = await page.evaluate(() => {
      const c = RTG.UI.KickView.current().canvas;
      c.focus();
      const st = getComputedStyle(c);
      return { style: st.outlineStyle, width: st.outlineWidth, color: st.outlineColor, focused: document.activeElement === c };
    });
    assert.equal(ring.focused, true, 'the canvas takes focus');
    assert.equal(ring.style, 'solid', 'focus outline is drawn');
    assert.equal(ring.width, '3px', 'focus outline is 3 px (' + ring.width + ')');
    assert.deepEqual(app.errors, [], 'console errors');
  } finally { await app.close(); }
});

// The practice stage was 56vh: on a 390-px phone the scene fell back to 1× (a 192-px scene in a 370-px stage) and
// on a 664-px phone the stage came out wider than tall, flipping the portrait scene to the landscape 320×192 pair.
for (const h of [844, 664, 568]) {   // 568 is the tightest phone: the 52-px HUD row (44-px RANGE? target) eats the box there
  test(`kick_mouse file 390x${h}: the practice scene stays portrait and fills the phone`, async () => {
    const app = await H.openApp({ mode: 'file', viewport: { width: 390, height: h, hasTouch: true, isMobile: true } });
    const { page } = app;
    try {
      await page.evaluate(() => RTG.debug.newCareer({ seed: 8, name: 'E2E Kicker' }));
      await page.waitForTimeout(200);
      await page.evaluate(() => RTG.UI.Router.go('practice'));
      await page.waitForFunction(() => RTG.UI.KickView && RTG.UI.KickView.current(), null, { timeout: 10000 });
      await page.waitForTimeout(400);
      const g = await page.evaluate(() => {
        const v = RTG.UI.KickView.current(), r = v.canvas.getBoundingClientRect();
        return { scale: v.cv.scale, landscape: v.cv.landscape, w: Math.round(r.width), innerWidth: innerWidth };
      });
      assert.equal(g.landscape, false, 'the practice scene is portrait inside a portrait phone');
      assert.ok(g.scale >= 1.35, 'the practice scene clears the fractional-fit floor (' + g.scale + ')');
      assert.ok(g.w >= g.innerWidth * 0.8, 'the practice scene fills the phone width (' + g.w + ' of ' + g.innerWidth + ')');
      assert.deepEqual(app.errors, [], 'console errors');
    } finally { await app.close(); }
  });
}
