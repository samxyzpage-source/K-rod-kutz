/**
 * Road to Glory: Kicker — RTG.UI.Palette (SPEC §4.1).
 *
 * The §4.1 tokens as JS (the same hex values as the CSS custom properties in css/style.css) so canvas code and
 * DOM code paint the same colours, plus the colour-blind (Okabe–Ito) and high-contrast variants and the team tint
 * helpers.
 *
 *   Palette.navy … Palette.dusk          — token → hex
 *   Palette.TOKENS                       — ordered token names
 *   Palette.variant(name)                — 'default' | 'cb' | 'hc' → {token: hex}
 *   Palette.current()                    — the variant matching the body classes (.cb / .hc)
 *   Palette.get(token)                   — token hex honouring the active body class
 *   Palette.teamTint(teamOrId)           — [primary, secondary] (falls back to gold / cream)
 *   Palette.setTeamVars(teamOrId)        — writes --team-1 / --team-2 on :root (null resets)
 *   Palette.hexToRgb('#abc') → [r,g,b]   Palette.luminance(hex) → 0..1   Palette.contrast(a, b) → ratio
 *   Palette.readable(bgHex)              — ink or cream, whichever contrasts more with bgHex
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};

  var BASE = {
    navy: '#1b1f3a', navy2: '#262b4d', cream: '#f4e9d0', ink: '#101226',
    grass: '#3a8c3f', grass2: '#2e7233', chalk: '#f2f2e6', gold: '#f6c445',
    red: '#d8433a', sky: '#7fc7ff', mint: '#4dbb63', grey: '#8a8f9e', dusk: '#5b3a6e',
    // extra shell tokens (documented in UI_API.md; not in the §4.1 table but used by the CSS)
    shadow: '#0b0d1c', dusk2: '#8a4b6b', sunset: '#d9773b', night: '#12142a', ball: '#a0522d'
  };
  var CB = { red: '#d55e00', mint: '#0072b2', gold: '#f0e442', sky: '#56b4e9' };
  var HC = {
    navy: '#000000', navy2: '#000000', cream: '#ffffff', ink: '#000000', grass: '#000000', grass2: '#111111',
    chalk: '#ffffff', gold: '#ffff00', red: '#ffffff', sky: '#ffff00', mint: '#ffffff', grey: '#cccccc', dusk: '#000000',
    shadow: '#ffffff', dusk2: '#000000', sunset: '#ffffff', night: '#000000', ball: '#ffffff'
  };

  var Palette = {};
  var TOKENS = Object.keys(BASE);
  for (var i = 0; i < TOKENS.length; i++) Palette[TOKENS[i]] = BASE[TOKENS[i]];
  Palette.TOKENS = TOKENS.slice();
  Palette.BASE = BASE;

  function merge(a, b) {
    var out = {}, k;
    for (k in a) if (Object.prototype.hasOwnProperty.call(a, k)) out[k] = a[k];
    for (k in b) if (Object.prototype.hasOwnProperty.call(b, k)) out[k] = b[k];
    return out;
  }

  /** @param {'default'|'cb'|'hc'} name */
  Palette.variant = function (name) {
    if (name === 'cb') return merge(BASE, CB);
    if (name === 'hc') return merge(BASE, HC);
    return merge(BASE, {});
  };

  function bodyHas(cls) {
    var b = root.document && root.document.body;
    return !!(b && b.classList && b.classList.contains(cls));
  }

  /** The variant matching the current body classes. */
  Palette.current = function () {
    if (bodyHas('hc')) return Palette.variant('hc');
    if (bodyHas('cb')) return Palette.variant('cb');
    return Palette.variant('default');
  };

  Palette.get = function (token) {
    var v = Palette.current();
    return v[token] !== undefined ? v[token] : BASE[token];
  };

  Palette.hexToRgb = function (hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    var n = parseInt(h, 16);
    if (h.length !== 6 || n !== n) return [0, 0, 0];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };

  function chan(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

  Palette.luminance = function (hex) {
    var rgb = Palette.hexToRgb(hex);
    return 0.2126 * chan(rgb[0]) + 0.7152 * chan(rgb[1]) + 0.0722 * chan(rgb[2]);
  };

  Palette.contrast = function (a, b) {
    var la = Palette.luminance(a), lb = Palette.luminance(b);
    var hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  };

  /** Ink or cream — whichever reads better on a background. */
  Palette.readable = function (bg) {
    return Palette.contrast(bg, BASE.ink) >= Palette.contrast(bg, BASE.cream) ? BASE.ink : BASE.cream;
  };

  function findTeam(teamOrId) {
    if (!teamOrId) return null;
    if (typeof teamOrId === 'object') return teamOrId;
    var store = RTG.UI.store;
    var state = store && store.state;
    if (state && RTG.Schema && typeof RTG.Schema.teamById === 'function') {
      try { var t = RTG.Schema.teamById(state, teamOrId); if (t) return t; } catch (e) { /* ignore */ }
    }
    // no career: fall back to the static data rows
    var D = RTG.Data || {}, lists = [D.colleges, D.nfl], i, j, row;
    for (i = 0; i < lists.length; i++) {
      if (!Array.isArray(lists[i])) continue;
      for (j = 0; j < lists[i].length; j++) {
        row = lists[i][j];
        if (row && (row.id === teamOrId || row.abbr === teamOrId || ('C' + row.abbr) === teamOrId || ('N' + row.abbr) === teamOrId)) return row;
      }
    }
    return null;
  }
  Palette.findTeam = findTeam;

  /** @returns {[string, string]} primary / secondary hex */
  Palette.teamTint = function (teamOrId) {
    var t = findTeam(teamOrId);
    var c = t && Array.isArray(t.colors) ? t.colors : (t && t.primary ? [t.primary, t.secondary] : null);
    if (!c || !c[0]) return [BASE.gold, BASE.cream];
    return [c[0], c[1] || BASE.cream];
  };

  /** The team colour that reads best as TEXT on the navy page background (primary or secondary; gold when neither does). */
  Palette.teamText = function (teamOrId) {
    var tint = Palette.teamTint(teamOrId);
    var c1 = Palette.contrast(tint[0], BASE.navy), c2 = Palette.contrast(tint[1], BASE.navy);
    var best = c1 >= c2 ? tint[0] : tint[1];
    return Math.max(c1, c2) >= 3 ? best : BASE.gold;
  };

  /** Write --team-1 / --team-2 / --team-ink / --team-text on :root (null → gold / cream). */
  Palette.setTeamVars = function (teamOrId) {
    var doc = root.document;
    if (!doc || !doc.documentElement) return;
    var tint = Palette.teamTint(teamOrId);
    doc.documentElement.style.setProperty('--team-1', tint[0]);
    doc.documentElement.style.setProperty('--team-2', tint[1]);
    doc.documentElement.style.setProperty('--team-ink', Palette.readable(tint[0]));
    doc.documentElement.style.setProperty('--team-text', Palette.teamText(teamOrId));
  };

  RTG.UI.Palette = Palette;
})(typeof window !== 'undefined' ? window : globalThis);
