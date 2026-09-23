/**
 * Road to Glory: QB — RTG.Data.plays (routes, plays, coverages)
 *
 * Pure data: no DOM, no rng, no Tuning writes. Everything the play engine (engine/play.js) and the scene read
 * about football itself lives here; the numbers that BALANCE it live in Tuning.qb.
 *
 *   routes     { GO, POST, CORNER, OUT, IN, CURL, COMEBACK, SLANT, FLAT, WHEEL, SCREEN, DRAG, SEAM, FADE, CHECKDOWN }
 *              each { id, name, family: 'SHORT'|'MID'|'DEEP', depth (yd at the break),
 *                     path: [{t, x, y}] waypoints — t seconds for an AVERAGE receiver (speed 50), x lateral yards
 *                     from the receiver's alignment (+ = toward his sideline, − = inside), y yards downfield —
 *                     ideal: { lead: -1..1 (behind ← → ahead), loft: 0..1 (bullet ← → touch) },
 *                     window: { open, close } the base ARRIVAL-time window (s) in which the route is "there" }
 *   formations { name: { WR1, WR2, SLOT, TE, RB } } alignment in yards from the ball (+ right); ctx.sign mirrors it
 *   plays      [{ id, name, formation, assignments: [{slot, route}], tags, vs: { COVER2, COVER3, COVER4, MAN, BLITZ, PREVENT },
 *                 line (the card's one-liner) }] — thirteen pass plays, then the two run options
 *                 { id: 'SNEAK' | 'DRAW', run: true, tags: ['RUN', 'SHORT_YDG'], vs, line }
 *   coverages  { COVER2, COVER3, COVER4, MAN, BLITZ, PREVENT }
 *              each { id, name, look: { safeties: 1|2, press, box, showBlitz }, disguises: [coverageId],
 *                     pressureMul, tightness: { SHORT, MID, DEEP } (0 soft … 1 blanketed), text (what you see), tell }
 *   order      the six coverage ids in a fixed order (weighted picks iterate it)
 *   slots      ['WR1', 'WR2', 'SLOT', 'TE', 'RB']
 *
 * Copy is in the kicker's voice: short, second person, the coach talking.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.Data = RTG.Data || {};

  /** Shorthand: a waypoint. */
  function w(t, x, y) { return { t: t, x: x, y: y }; }

  /** Shorthand: a route. */
  var WINDOW = 'window';   // the contract's field name; the purity scan forbids the bare identifier, so it is a string key
  function route(id, name, family, depth, path, lead, loft, open, close) {
    var r = { id: id, name: name, family: family, depth: depth, path: path, ideal: { lead: lead, loft: loft } };
    r[WINDOW] = { open: open, close: close };
    return r;
  }

  var routes = {
    // deep
    GO:       route('GO', 'Go', 'DEEP', 20, [w(0, 0, 0), w(1.0, 0, 6), w(2.0, 0, 14.5), w(3.0, 0, 23.5), w(4.0, 0, 32.5)], 0.7, 0.7, 3.3, 4.0),      // full stride by the third second (≈ 9 yd/s); the window is the deep third, 26–32 yd out
    POST:     route('POST', 'Post', 'DEEP', 12, [w(0, 0, 0), w(1.6, 0, 12), w(2.6, -6, 21), w(4.0, -12, 32)], 0.6, 0.55, 3.0, 3.9),
    CORNER:   route('CORNER', 'Corner', 'DEEP', 12, [w(0, 0, 0), w(1.6, 0, 12), w(2.6, 6, 20), w(4.0, 12, 30)], 0.6, 0.7, 2.9, 3.8),
    SEAM:     route('SEAM', 'Seam', 'DEEP', 15, [w(0, 0, 0), w(1.2, -1, 8), w(2.2, -2, 16.5), w(3.2, -2, 25), w(4.0, -2, 32)], 0.6, 0.5, 2.9, 3.85),
    WHEEL:    route('WHEEL', 'Wheel', 'DEEP', 5, [w(0, 0, 0), w(0.8, 6, 2), w(1.6, 9, 8), w(2.6, 9, 17), w(4.0, 9, 30)], 0.7, 0.75, 3.1, 3.9),
    FADE:     route('FADE', 'Fade', 'DEEP', 8, [w(0, 0, 0), w(1.0, 3, 7), w(2.0, 5, 15), w(3.0, 5, 23), w(4.0, 5, 30)], 0.3, 0.9, 1.7, 2.8),          // the back-shoulder ball: the one vertical route that is there early
    // intermediate
    OUT:      route('OUT', 'Out', 'MID', 10, [w(0, 0, 0), w(1.4, 0, 10), w(2.1, 6, 11), w(3.0, 12, 11), w(4.0, 16, 11)], 0.4, 0.15, 1.6, 2.5),
    IN:       route('IN', 'Dig', 'MID', 12, [w(0, 0, 0), w(1.6, 0, 12), w(2.4, -6, 13), w(3.4, -14, 13), w(4.0, -18, 13)], 0.5, 0.2, 2.0, 3.0),
    CURL:     route('CURL', 'Curl', 'MID', 10, [w(0, 0, 0), w(1.4, 0, 10), w(1.9, -1, 8), w(4.0, -1, 8)], -0.2, 0.25, 1.7, 2.7),
    COMEBACK: route('COMEBACK', 'Comeback', 'MID', 14, [w(0, 0, 0), w(1.8, 0, 14), w(2.4, 3, 12), w(4.0, 3, 12)], -0.3, 0.2, 2.2, 3.2),
    // short
    SLANT:    route('SLANT', 'Slant', 'SHORT', 3, [w(0, 0, 0), w(0.5, 0, 3), w(1.3, -6, 8), w(2.2, -12, 12), w(4.0, -22, 18)], 0.5, 0.05, 1.1, 2.0),
    FLAT:     route('FLAT', 'Flat', 'SHORT', 1, [w(0, 0, 0), w(0.7, 4, 2), w(1.5, 9, 3), w(4.0, 18, 4)], 0.4, 0.3, 1.0, 2.2),
    SCREEN:   route('SCREEN', 'Screen', 'SHORT', -2, [w(0, 0, 0), w(0.6, 2, -2), w(1.2, 5, -3), w(2.0, 7, -3), w(4.0, 9, 4)], 0.0, 0.4, 1.3, 2.4),
    DRAG:     route('DRAG', 'Drag', 'SHORT', 4, [w(0, 0, 0), w(0.6, 0, 4), w(1.8, -10, 5), w(3.0, -20, 6), w(4.0, -28, 7)], 0.6, 0.1, 1.4, 2.8),
    CHECKDOWN: route('CHECKDOWN', 'Checkdown', 'SHORT', 3, [w(0, 0, 0), w(1.0, -1, 1), w(1.8, 2, 4), w(3.0, 4, 5), w(4.0, 8, 6)], 0.2, 0.35, 1.6, 3.4)
  };

  /** Alignment in yards from the ball (+ = right); ctx.sign flips the whole formation. */
  var formations = {
    SHOTGUN:    { WR1: -22, WR2: 22, SLOT: 12, TE: 5, RB: -3 },      // 3 wide, TE on the line, back offset weak
    TRIPS:      { WR1: -22, WR2: 22, SLOT: 10, TE: 15, RB: -3 },     // TE flexed outside the slot
    SINGLEBACK: { WR1: -20, WR2: 20, SLOT: 9, TE: 4, RB: 0 },        // under centre, back home
    I_FORM:     { WR1: -20, WR2: 20, SLOT: -9, TE: 4, RB: 0 },       // play action: slot flanked weak, back deep
    EMPTY:      { WR1: -24, WR2: 24, SLOT: 14, TE: -12, RB: 8 }      // everybody out
  };

  /** Shorthand: a pass play. */
  function play(id, name, formation, a, tags, vs, line) {
    var assignments = [];
    for (var i = 0; i < a.length; i += 2) assignments.push({ slot: a[i], route: a[i + 1] });
    return { id: id, name: name, formation: formation, assignments: assignments, tags: tags, run: false, vs: vs, line: line };
  }
  /** Shorthand: a vs table in the fixed coverage order. */
  function vs(c2, c3, c4, man, blitz, prevent) {
    return { COVER2: c2, COVER3: c3, COVER4: c4, MAN: man, BLITZ: blitz, PREVENT: prevent };
  }

  var plays = [
    play('FOUR_VERTS', 'FOUR VERTS', 'SHOTGUN',
      ['WR1', 'GO', 'WR2', 'GO', 'SLOT', 'SEAM', 'TE', 'SEAM', 'RB', 'CHECKDOWN'],
      ['DEEP'], vs('GOOD', 'BAD', 'BAD', 'OK', 'BAD', 'BAD'),
      'Four go. Find the one the safety forgot.'),
    play('SLANT_FLAT', 'SLANT-FLAT', 'SHOTGUN',
      ['WR1', 'SLANT', 'WR2', 'SLANT', 'SLOT', 'FLAT', 'TE', 'CHECKDOWN', 'RB', 'FLAT'],
      ['QUICK'], vs('OK', 'GOOD', 'GOOD', 'OK', 'GOOD', 'GOOD'),
      'Three steps and gone. Beats a blitz every time.'),
    play('SMASH', 'SMASH', 'SHOTGUN',
      ['WR1', 'CURL', 'WR2', 'CURL', 'SLOT', 'CORNER', 'TE', 'CORNER', 'RB', 'CHECKDOWN'],
      [], vs('GOOD', 'OK', 'OK', 'OK', 'OK', 'BAD'),
      'Hitch under, corner over. Make the flat corner choose.'),
    play('MESH', 'MESH', 'SHOTGUN',
      ['WR1', 'DRAG', 'SLOT', 'DRAG', 'WR2', 'CORNER', 'TE', 'OUT', 'RB', 'WHEEL'],
      ['QUICK'], vs('OK', 'OK', 'OK', 'GOOD', 'OK', 'OK'),
      'Two crossers rub. Man coverage hates it.'),
    play('CURL_FLAT', 'CURL-FLAT', 'SINGLEBACK',
      ['WR1', 'CURL', 'WR2', 'CURL', 'SLOT', 'FLAT', 'TE', 'SEAM', 'RB', 'FLAT'],
      ['QUICK'], vs('OK', 'GOOD', 'OK', 'BAD', 'GOOD', 'OK'),
      'Curl sits in the hole, flat pulls the corner. Soft zone food.'),
    play('PA_POST', 'PA POST', 'I_FORM',
      ['WR1', 'POST', 'WR2', 'GO', 'SLOT', 'IN', 'TE', 'CHECKDOWN', 'RB', 'FLAT'],
      ['PA', 'DEEP'], vs('GOOD', 'OK', 'BAD', 'GOOD', 'BAD', 'BAD'),
      'Sell the run, throw the post. Needs time you may not have.'),
    play('SCREEN', 'SCREEN', 'SHOTGUN',
      ['RB', 'SCREEN', 'WR1', 'GO', 'WR2', 'GO', 'SLOT', 'OUT', 'TE', 'FLAT'],
      ['SCREEN', 'QUICK'], vs('BAD', 'OK', 'GOOD', 'BAD', 'GOOD', 'GOOD'),
      'Let them come. The back slips out behind the rush.'),
    play('TE_SEAM', 'TE SEAM', 'SINGLEBACK',
      ['TE', 'SEAM', 'WR1', 'OUT', 'WR2', 'COMEBACK', 'SLOT', 'FLAT', 'RB', 'CHECKDOWN'],
      [], vs('GOOD', 'OK', 'BAD', 'OK', 'OK', 'BAD'),
      'The tight end splits the safeties. Two-high only.'),
    play('STICK', 'STICK', 'TRIPS',
      ['SLOT', 'OUT', 'TE', 'CURL', 'RB', 'FLAT', 'WR1', 'CURL', 'WR2', 'SLANT'],
      ['QUICK', 'SHORT_YDG'], vs('OK', 'GOOD', 'GOOD', 'OK', 'GOOD', 'GOOD'),
      'Stick, out, flat. Somebody is open by the second step.'),
    play('DIG', 'DIG', 'SHOTGUN',
      ['WR1', 'IN', 'WR2', 'GO', 'SLOT', 'CURL', 'TE', 'CHECKDOWN', 'RB', 'FLAT'],
      [], vs('OK', 'OK', 'GOOD', 'OK', 'BAD', 'OK'),
      'The dig runs under the quarters. Hold the safety with your eyes.'),
    play('FADE', 'FADE', 'SHOTGUN',
      ['WR1', 'FADE', 'WR2', 'FADE', 'SLOT', 'OUT', 'TE', 'FLAT', 'RB', 'CHECKDOWN'],
      ['SHORT_YDG'], vs('BAD', 'BAD', 'OK', 'GOOD', 'GOOD', 'BAD'),
      'Back shoulder, high and outside. Only your guy can get it.'),
    play('FLOOD', 'FLOOD', 'TRIPS',
      ['RB', 'WHEEL', 'SLOT', 'OUT', 'WR1', 'GO', 'WR2', 'COMEBACK', 'TE', 'DRAG'],
      [], vs('OK', 'GOOD', 'OK', 'GOOD', 'BAD', 'BAD'),
      'Three levels on one side. Whoever is uncovered, that is the read.'),
    play('QUICK_OUTS', 'QUICK OUTS', 'EMPTY',
      ['WR1', 'OUT', 'WR2', 'OUT', 'SLOT', 'SLANT', 'TE', 'FLAT', 'RB', 'CHECKDOWN'],
      ['QUICK', 'SHORT_YDG'], vs('BAD', 'GOOD', 'GOOD', 'OK', 'GOOD', 'GOOD'),
      'Everybody out, ball out. Off coverage gives it to you.'),
    // the run options (the engine resolves them in Play.snap; no throw follows)
    { id: 'SNEAK', name: 'QB SNEAK', formation: 'SINGLEBACK', assignments: [], tags: ['RUN', 'SHORT_YDG'], run: true,
      vs: vs('OK', 'OK', 'OK', 'OK', 'OK', 'GOOD'), line: 'Get under the pile. A yard is a yard.' },
    { id: 'DRAW', name: 'DRAW', formation: 'SHOTGUN', assignments: [], tags: ['RUN', 'SHORT_YDG'], run: true,
      vs: vs('OK', 'OK', 'GOOD', 'OK', 'GOOD', 'GOOD'), line: 'Show pass, hand it off. Blitzers run right past it.' }
  ];

  /** Shorthand: a coverage. */
  function coverage(id, name, safeties, press, box, showBlitz, disguises, pressureMul, tShort, tMid, tDeep, text, tell) {
    return {
      id: id, name: name,
      look: { safeties: safeties, press: press, box: box, showBlitz: showBlitz },
      disguises: disguises, pressureMul: pressureMul,
      tightness: { SHORT: tShort, MID: tMid, DEEP: tDeep },
      text: text, tell: tell
    };
  }

  var coverages = {
    COVER2:  coverage('COVER2', 'COVER 2', 2, true, 7, false, ['COVER4', 'MAN'], 1.0, 0.60, 0.40, 0.35,
      'Two high, corners pressed, seven in the box.', 'The corners are squatting on the flats. The hole is behind them.'),
    COVER3:  coverage('COVER3', 'COVER 3', 1, false, 8, false, ['MAN', 'BLITZ'], 1.0, 0.35, 0.50, 0.50,   // deep 0.50: one high safety cannot cover two seams — the last play is winnable against it
      'One high, corners off, eight in the box.', 'Three deep and soft underneath. Take the curls all day.'),
    COVER4:  coverage('COVER4', 'COVER 4', 2, false, 6, false, ['COVER2'], 0.9, 0.30, 0.50, 0.70,        // deep 0.70: quarters takes the deep ball away, not the game
      'Two high and deep, corners off, six in the box.', 'Four deep. Nothing over the top — everything under it.'),
    MAN:     coverage('MAN', 'MAN', 1, true, 7, false, ['COVER3', 'BLITZ'], 1.1, 0.55, 0.55, 0.50,
      'One high, everybody pressed, seven in the box.', 'They are in their faces. Your best guy against their guy.'),
    BLITZ:   coverage('BLITZ', 'BLITZ', 1, true, 8, true, ['COVER3', 'MAN'], 1.6, 0.30, 0.45, 0.55,
      'One high, pressed, eight in the box and the nickel is creeping.', 'They are bringing the house. Hot read, now.'),
    PREVENT: coverage('PREVENT', 'PREVENT', 2, false, 5, false, ['COVER4'], 0.7, 0.15, 0.40, 0.80,       // deep 0.80: they will not give you thirty — a gunslinger still takes it 1 time in 10
      'Two high and backing up, corners way off, five in the box.', 'They will give you ten yards all day. They will not give you thirty.')
  };

  RTG.Data.plays = {
    routes: routes,
    formations: formations,
    plays: plays,
    coverages: coverages,
    order: ['COVER2', 'COVER3', 'COVER4', 'MAN', 'BLITZ', 'PREVENT'],
    slots: ['WR1', 'WR2', 'SLOT', 'TE', 'RB'],
    families: ['SHORT', 'MID', 'DEEP']
  };
})(typeof window !== 'undefined' ? window : globalThis);
