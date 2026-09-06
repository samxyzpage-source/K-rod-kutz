/**
 * Road to Glory: Kicker — RTG.UI.Sprites (SPEC §4.2, D12)
 *
 * Procedural pixel-art atlas. Every sprite is a list of pixel-string rows ('..XX..') with a per-sprite
 * palette map; Sprites.init() renders them to offscreen canvases once at boot and Sprites.get(name, opts)
 * returns the cached canvas (re-rendered and cached per tint / look when the sprite uses tint tokens).
 *
 *   Sprites.init()                                     → renders the default atlas (idempotent)
 *   Sprites.get('kicker_idle', {tint:['#hex','#hex'], look:{skin, hair, boot}})   → HTMLCanvasElement
 *   Sprites.get('ball_5')                              → HTMLCanvasElement (untinted sprites are shared)
 *   Sprites.frames('kicker_lean')                      → ['kicker_lean1', 'kicker_lean2', 'kicker_lean3']
 *   Sprites.uprights(widthPx, heightPx, opts)          → cached canvas of goal posts at any size
 *   Sprites.crest(id, colors, size)                    → cached crest canvas (3 shapes × 2 colours by id)
 *   Sprites.drawText(ctx, str, x, y, color, scale)     → 3×5 digit font (digits, % - . : + / space)
 *   Sprites.textWidth(str, scale)
 *
 * Palette tokens (per sprite `pal`): '.' transparent · 'T1'/'T2' team tints · 'SK' skin · 'HR' hair ·
 * 'BT' boot colour; everything else is a fixed hex. Names are stable — the kick scene indexes by name.
 *
 * DOM: creates offscreen canvases only (document.createElement('canvas')). No images, no fetch.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Sprites = {};

  // ───────────────────────────── palette (§4.1) ─────────────────────────────
  var P = {
    navy: '#1b1f3a', navy2: '#262b4d', cream: '#f4e9d0', ink: '#101226', grass: '#3a8c3f', grass2: '#2e7233',
    chalk: '#f2f2e6', gold: '#f6c445', red: '#d8433a', sky: '#7fc7ff', mint: '#4dbb63', grey: '#8a8f9e', dusk: '#5b3a6e',
    orange: '#e07b28', ballBrown: '#8b4a1f', ballDark: '#4a2a12', white: '#ffffff', black: '#000000', steel: '#c9ccd6',
    shadow: 'rgba(16,18,38,0.55)'
  };
  Sprites.PALETTE = P;
  var SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524'];
  var HAIR = ['#2b1b0e', '#5a3a1a', '#a8742e', '#e8c56b', '#1a1a1a', '#b5442e'];
  var BOOT = ['#101226', '#f2f2e6', '#d8433a', '#f6c445'];
  Sprites.SKIN = SKIN; Sprites.HAIR = HAIR; Sprites.BOOT = BOOT;

  // Base letter map shared by every sprite (a sprite's own `pal` overrides / extends it).
  var BASE = {
    'k': P.ink, 'w': P.chalk, 'c': P.cream, 'g': P.gold, 'r': P.red, 'b': P.sky, 'm': P.mint, 'n': P.navy, 'v': P.navy2,
    'y': P.grey, 'o': P.orange, 'd': P.ballBrown, 'D': P.ballDark, 'W': P.white, 'K': P.black, 'e': P.steel,
    'G': P.grass, 'H': P.grass2, 'u': P.dusk,
    's': 'SK', 'h': 'HR', 'J': 'T1', 'N': 'T2', 'S': 'T1', 'B': 'BT', 'P': P.chalk, 'C': 'T2', 'A': 'T1', 'x': P.shadow
  };

  var DEFS = {};   // name → {rows, pal?, tintable}
  function def(name, rows, pal) {
    var tintable = false;
    for (var i = 0; i < rows.length && !tintable; i++) {
      if (/[JNSBCAsh]/.test(rows[i])) tintable = true;
    }
    DEFS[name] = { rows: rows, pal: pal || null, tintable: tintable };
  }

  // ───────────────────────────── kicker (12×20), seen from behind ─────────────────────────────
  def('kicker_idle', [
    '....hhhh....',
    '...hhhhhh...',
    '...hhhhhh...',
    '....ssss....',
    '..JJJJJJJJ..',
    '.JJJJJJJJJJ.',
    '.JJJJNNJJJJ.',
    '.sJJJNNJJJs.',
    '.sJJJJJJJJs.',
    '..JJJJJJJJ..',
    '...JJJJJJ...',
    '...PPPPPP...',
    '...PPPPPP...',
    '...PP..PP...',
    '...PP..PP...',
    '...PP..PP...',
    '...SS..SS...',
    '...SS..SS...',
    '...BB..BB...',
    '..BBB..BBB..'
  ]);
  def('kicker_lean1', [
    '............',
    '....hhhh....',
    '...hhhhhh...',
    '...hhhhhh...',
    '....ssss....',
    '..JJJJJJJJ..',
    '.JJJJJJJJJJ.',
    'sJJJJNNJJJJs',
    'sJJJJNNJJJJs',
    '..JJJJJJJJ..',
    '...JJJJJJ...',
    '...PPPPPP...',
    '..PPP..PPP..',
    '..PP....PP..',
    '..PP....PP..',
    '..SS....SS..',
    '..SS....SS..',
    '..BB....BB..',
    '.BBB....BBB.',
    '............'
  ]);
  def('kicker_lean2', [
    '............',
    '............',
    '....hhhh....',
    '...hhhhhh...',
    '...hhhhhh...',
    '.s..ssss..s.',
    'sJJJJJJJJJJs',
    'sJJJJNNJJJJs',
    '.JJJJNNJJJJ.',
    '..JJJJJJJJ..',
    '...JJJJJJ...',
    '..PPPPPPPP..',
    '.PPP....PPP.',
    '.PP......PP.',
    '.SS......SS.',
    '.SS......SS.',
    '.BB......BB.',
    'BBB......BBB',
    '............',
    '............'
  ]);
  def('kicker_lean3', [
    '............',
    '............',
    '............',
    's...hhhh...s',
    's..hhhhhh..s',
    'sJ.hhhhhh.Js',
    '.JJ.ssss.JJ.',
    '.JJJJJJJJJJ.',
    '.JJJJNNJJJJ.',
    '..JJJNNJJJ..',
    '..JJJJJJJJ..',
    '.PPPPPPPPPP.',
    'PPP......PPP',
    'PP........PP',
    'SS........SS',
    'SS........SS',
    'BB........BB',
    'BB........BB',
    '............',
    '............'
  ]);
  def('kicker_approach1', [
    '....hhhh....',
    '...hhhhhh...',
    '...hhhhhh...',
    '....ssss....',
    '..JJJJJJJJ..',
    '.JJJJJJJJJJ.',
    'sJJJJNNJJJJ.',
    '.JJJJNNJJJJs',
    '.JJJJJJJJJJ.',
    '..JJJJJJJJ..',
    '...JJJJJJ...',
    '...PPPPPP...',
    '...PPPPPP...',
    '..PPP..PP...',
    '..PP...PP...',
    '..SS...PP...',
    '..SS...SS...',
    '..BB...SS...',
    '.BBB...BB...',
    '.......BBB..'
  ]);
  def('kicker_approach2', [
    '....hhhh....',
    '...hhhhhh...',
    '...hhhhhh...',
    '....ssss....',
    '..JJJJJJJJ..',
    '.JJJJJJJJJJ.',
    '.JJJJNNJJJJs',
    'sJJJJNNJJJJ.',
    '.JJJJJJJJJJ.',
    '..JJJJJJJJ..',
    '...JJJJJJ...',
    '...PPPPPP...',
    '...PPPPPP...',
    '...PP..PPP..',
    '...PP...PP..',
    '...PP...SS..',
    '...SS...SS..',
    '...SS...BB..',
    '...BB...BBB.',
    '..BBB.......'
  ]);
  def('kicker_approach3', [
    '....hhhh....',
    '...hhhhhh...',
    '...hhhhhh...',
    '....ssss....',
    '..JJJJJJJJ..',
    '.JJJJJJJJJJ.',
    'sJJJJNNJJJJ.',
    '.JJJJNNJJJJs',
    '.JJJJJJJJJJ.',
    '..JJJJJJJJ..',
    '...JJJJJJ...',
    '...PPPPPP...',
    '..PPPPPPP...',
    '.PPP...PP...',
    '.PP....PP...',
    '.SS....SS...',
    '.SS....SS...',
    '.BB....BB...',
    'BBB....BBB..',
    '............'
  ]);
  def('kicker_plant', [
    '....hhhh....',
    '...hhhhhh...',
    '...hhhhhh...',
    '....ssss....',
    '..JJJJJJJJ..',
    'sJJJJJJJJJJ.',
    '.JJJJNNJJJJ.',
    '.JJJJNNJJJJs',
    '.JJJJJJJJJJ.',
    '..JJJJJJJJ..',
    '...JJJJJJ...',
    '..PPPPPPP...',
    '.PPP..PPPP..',
    '.PP.....PP..',
    '.PP......PP.',
    '.SS......PP.',
    '.SS......SS.',
    '.BB......SS.',
    'BBB......BB.',
    '.........BBB'
  ]);
  def('kicker_swing', [
    '....hhhh....',
    '...hhhhhh...',
    '...hhhhhh...',
    's...ssss....',
    'sJJJJJJJJJ..',
    '.JJJJJJJJJJ.',
    '.JJJJNNJJJJs',
    '.JJJJNNJJJJ.',
    '.JJJJJJJJ...',
    '..JJJJJJJBB.',
    '...JJJJJPSB.',
    '..PPPPPPPS..',
    '.PPP....PP..',
    '.PP.....P...',
    '.PP.........',
    '.SS.........',
    '.SS.........',
    '.BB.........',
    'BBB.........',
    '............'
  ]);
  def('kicker_follow', [
    '.........BB.',
    '........BBB.',
    '....hhhhSS..',
    's..hhhhhPP..',
    'sJ.hhhhhPP..',
    '.JJ.ssssP...',
    '.JJJJJJJP...',
    '.JJJJNNJJ...',
    '.JJJJNNJJJs.',
    '..JJJJJJJJs.',
    '...JJJJJJ...',
    '..PPPPPPP...',
    '.PPP........',
    '.PP.........',
    '.PP.........',
    '.SS.........',
    '.SS.........',
    '.BB.........',
    'BBB.........',
    '............'
  ]);

  // ───────────────────────────── holder (10×10) · snapper (10×8) · rusher (8×12) ─────────────────────────────
  def('holder', [
    '....hhh...',
    '...hhhhh..',
    '...sssss..',
    '..JJJJJJ..',
    '.sJJJJJJs.',
    '..JJJJJJ..',
    '..PPPPPP..',
    '..PP.PPP..',
    '.BBB.PPP..',
    '....BBBB..'
  ]);
  def('snapper', [
    '...hhhh...',
    '..JJJJJJ..',
    '.JJJJJJJJ.',
    '.JJJJJJJJ.',
    '.PPPPPPPP.',
    '.PP....PP.',
    '.SS....SS.',
    '.BB....BB.'
  ]);
  def('rusher', [
    '..kkkk..',
    '.kkkkkk.',
    '.kkkkkk.',
    'kkCCCCkk',
    'kkCCCCkk',
    '.kCCCCk.',
    '..kkkk..',
    '..kkkk..',
    '.kk..kk.',
    '.kk..kk.',
    '.kk..kk.',
    'kkk..kkk'
  ]);

  // ───────────────────────────── ball (3 sizes + xl + squash) ─────────────────────────────
  def('ball_3', ['.d.', 'dwd', '.d.']);
  def('ball_5', ['.ddd.', 'dDwDd', 'dddDd', '.DDD.']);
  def('ball_8', ['..dddd..', '.dddddd.', 'ddwwwwdd', 'dddDDddd', '.dDDDDd.', '..DDDD..']);
  def('ball_11', ['...ddddd...', '..ddddddd..', '.dddwwwddd.', 'ddddwdwdddd', 'dddddDddddd', '.dDDDDDDDd.', '..DDDDDDD..', '...DDDDD...']);
  def('ball_squash', ['.ddddddd.', 'dddwwwddd', 'dddDDDddd', '.DDDDDDD.']);
  def('ball_tee', ['..kk..', '.kkkk.']);

  // ───────────────────────────── crowd tiles (32×8, 2 frames) ─────────────────────────────
  def('crowd_a', [
    '.ss..ss..ss..ss..ss..ss..ss..ss.',
    '.ss..ss..ss..ss..ss..ss..ss..ss.',
    'JJJJCCCCJJJJCCCCJJJJCCCCJJJJCCCC',
    'JJJJCCCCJJJJCCCCJJJJCCCCJJJJCCCC',
    'JJJJCCCCJJJJCCCCJJJJCCCCJJJJCCCC',
    'vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv',
    'vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv',
    'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww'
  ]);
  def('crowd_b', [
    '.ss..ss..ss..ss..ss..ss..ss..ss.',
    'JssJCssCJssJCssCJssJCssCJssJCssC',
    'JJJJCCCCJJJJCCCCJJJJCCCCJJJJCCCC',
    'JJJJCCCCJJJJCCCCJJJJCCCCJJJJCCCC',
    'JJJJCCCCJJJJCCCCJJJJCCCCJJJJCCCC',
    'vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv',
    'vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv',
    'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww'
  ]);

  // ───────────────────────────── referee (8×16 ×3) ─────────────────────────────
  def('ref_up', [
    'w......w', 'w......w', 'w..kk..w', '.w.kk.w.', '.wkwwkw.', '..kwwk..', '..wkkw..', '..kwwk..',
    '..wkkw..', '..kkkk..', '..kk.kk.', '..kk.kk.', '..kk.kk.', '..kk.kk.', '..kk.kk.', '.kkk.kkk'
  ]);
  def('ref_crossed', [
    '........', '........', '...kk...', '...kk...', '.wkwwkw.', '.kkwwkk.', '..wkkw..', '..wwww..',
    '..kwwk..', '..kkkk..', '..kk.kk.', '..kk.kk.', '..kk.kk.', '..kk.kk.', '..kk.kk.', '.kkk.kkk'
  ]);
  def('ref_wave', [
    '........', '........', '...kk...', '...kk...', 'wwkwwkww', '..kwwk..', '..wkkw..', '..kwwk..',
    '..wkkw..', '..kkkk..', '..kk.kk.', '..kk.kk.', '..kk.kk.', '..kk.kk.', '..kk.kk.', '.kkk.kkk'
  ]);

  // ───────────────────────────── wind sock (14×8 ×4) ─────────────────────────────
  def('sock_0', [
    'e.............', 'eoo...........', 'eoo...........', 'eww...........', 'eww...........', 'eoo...........', 'e.............', 'e.............'
  ]);
  def('sock_1', [
    'e.............', 'eooww.........', 'eoowwoo.......', 'e...wwoo......', 'e.....oo......', 'e.............', 'e.............', 'e.............'
  ]);
  def('sock_2', [
    'e.............', 'eoowwoo.......', 'eoowwoowwo....', 'e.....wwoo....', 'e.............', 'e.............', 'e.............', 'e.............'
  ]);
  def('sock_3', [
    'e.............', 'eoowwoowwoowwo', 'eoowwoowwoowwo', 'e.............', 'e.............', 'e.............', 'e.............', 'e.............'
  ]);

  // ───────────────────────────── particles · frames · icons ─────────────────────────────
  def('rain', ['b', 'b', 'b']);
  def('snow', ['ww', 'ww']);
  def('banner_frame', [
    'gggggggggggggggggggggggg',
    'gnnnnnnnnnnnnnnnnnnnnnng',
    'gnvvvvvvvvvvvvvvvvvvvvng',
    'gnvvvvvvvvvvvvvvvvvvvvng',
    'gnvvvvvvvvvvvvvvvvvvvvng',
    'gnvvvvvvvvvvvvvvvvvvvvng',
    'gnvvvvvvvvvvvvvvvvvvvvng',
    'gnvvvvvvvvvvvvvvvvvvvvng',
    'gnvvvvvvvvvvvvvvvvvvvvng',
    'gnvvvvvvvvvvvvvvvvvvvvng',
    'gnnnnnnnnnnnnnnnnnnnnnng',
    'gggggggggggggggggggggggg'
  ]);
  def('crest_shield', [
    'NNNNNNNNNNNN', 'NJJJJJJJJJJN', 'NJJJJNNJJJJN', 'NJJJJNNJJJJN', 'NJJNNNNNNJJN', 'NJJNNNNNNJJN',
    'NJJJJNNJJJJN', 'NJJJJNNJJJJN', '.NJJJJJJJJN.', '..NJJJJJJN..', '...NJJJJN...', '....NNNN....'
  ]);
  def('crest_pennant', [
    'NNNNNNNNNNNN', 'NJJJJJJJJJJN', 'NJJNNJJJJJJN', 'NJJNNJJJJJN.', 'NJJJJJJJJJN.', 'NJJJJJJJJN..',
    'NJJJJJJJJN..', 'NJJJJJJJN...', 'NJJJJJJN....', 'NJJJJJN.....', 'NJJJNN......', 'NNNN........'
  ]);
  def('crest_circle', [
    '...NNNNNN...', '.NNJJJJJJNN.', '.NJJJJJJJJN.', 'NJJJNNNNJJJN', 'NJJNJJJJNJJN', 'NJJNJJJJNJJN',
    'NJJNJJJJNJJN', 'NJJNJJJJNJJN', 'NJJJNNNNJJJN', '.NJJJJJJJJN.', '.NNJJJJJJNN.', '...NNNNNN...'
  ]);
  def('boot', ['..kk....', '..kk....', '..kkk...', '..kkkkk.', 'kkkkkkkk', 'wwwwwwww']);
  def('trophy', ['gggggggg', 'g.gggg.g', 'g.gggg.g', 'gg.gg.gg', '..gggg..', '...gg...', '...gg...', '..gggg..', '.dddddd.', 'dddddddd']);
  def('envelope', ['cccccccccc', 'cwccccccwc', 'ccwccccwcc', 'cccwccwccc', 'ccccwwcccc', 'cccccccccc', 'cccccccccc']);
  def('pennant', ['gggggggggg', 'grrrrrrrgg', 'grrrrrgg..', 'grrrgg....', 'grgg......', 'gg........', 'g.........', 'g.........']);
  def('heart', ['.rr..rr.', 'rrrrrrrr', 'rrrrrrrr', '.rrrrrr.', '..rrrr..', '...rr...']);
  def('marker', ['...g...', '..ggg..', '.ggggg.', 'ggggggg']);
  def('marker_down', ['ggggggg', '.ggggg.', '..ggg..', '...g...']);

  // ───────────────────────────── digit font (3×5) ─────────────────────────────
  var FONT = {
    '0': ['www', 'w.w', 'w.w', 'w.w', 'www'], '1': ['.w.', 'ww.', '.w.', '.w.', 'www'], '2': ['www', '..w', 'www', 'w..', 'www'],
    '3': ['www', '..w', 'www', '..w', 'www'], '4': ['w.w', 'w.w', 'www', '..w', '..w'], '5': ['www', 'w..', 'www', '..w', 'www'],
    '6': ['www', 'w..', 'www', 'w.w', 'www'], '7': ['www', '..w', '..w', '..w', '..w'], '8': ['www', 'w.w', 'www', 'w.w', 'www'],
    '9': ['www', 'w.w', 'www', '..w', 'www'], '%': ['w.w', '..w', '.w.', 'w..', 'w.w'], '-': ['...', '...', 'www', '...', '...'],
    '.': ['...', '...', '...', '...', '.w.'], ':': ['...', '.w.', '...', '.w.', '...'], '+': ['...', '.w.', 'www', '.w.', '...'],
    '/': ['..w', '..w', '.w.', 'w..', 'w..'], ' ': ['...', '...', '...', '...', '...'],
    '<': ['..w', '.w.', 'w..', '.w.', '..w'], '>': ['w..', '.w.', '..w', '.w.', 'w..'], '^': ['.w.', 'w.w', '...', '...', '...'],
    'v': ['...', '...', '...', 'w.w', '.w.'], 'Y': ['w.w', 'w.w', '.w.', '.w.', '.w.'], 'D': ['ww.', 'w.w', 'w.w', 'w.w', 'ww.'],
    'S': ['www', 'w..', 'www', '..w', 'www'], 'P': ['www', 'w.w', 'www', 'w..', 'w..'], 'W': ['w.w', 'w.w', 'w.w', 'www', 'w.w'],
    'R': ['ww.', 'w.w', 'ww.', 'w.w', 'w.w'], 'L': ['w..', 'w..', 'w..', 'w..', 'www'], 'M': ['w.w', 'www', 'w.w', 'w.w', 'w.w'],
    'H': ['w.w', 'w.w', 'www', 'w.w', 'w.w'], 'A': ['.w.', 'w.w', 'www', 'w.w', 'w.w'], 'K': ['w.w', 'w.w', 'ww.', 'w.w', 'w.w'],
    'I': ['www', '.w.', '.w.', '.w.', 'www'], 'C': ['www', 'w..', 'w..', 'w..', 'www'], 'E': ['www', 'w..', 'www', 'w..', 'www'],
    'T': ['www', '.w.', '.w.', '.w.', '.w.'], 'O': ['www', 'w.w', 'w.w', 'w.w', 'www'], 'N': ['w.w', 'www', 'www', 'w.w', 'w.w'],
    'G': ['www', 'w..', 'w.w', 'w.w', 'www'], 'U': ['w.w', 'w.w', 'w.w', 'w.w', 'www'], 'B': ['ww.', 'w.w', 'ww.', 'w.w', 'ww.'],
    'F': ['www', 'w..', 'www', 'w..', 'w..'], 'X': ['w.w', 'w.w', '.w.', 'w.w', 'w.w'], 'Q': ['www', 'w.w', 'w.w', 'www', '..w']
  };

  // ───────────────────────────── rendering ─────────────────────────────
  var cache = {};
  var inited = false;

  function makeCanvas(w, h) {
    var c = root.document.createElement('canvas');
    c.width = Math.max(1, w); c.height = Math.max(1, h);
    return c;
  }

  function resolveColor(ch, d, tint, look) {
    var col = (d.pal && d.pal[ch]) || BASE[ch];
    if (!col) return null;
    if (col === 'T1') return (tint && tint[0]) || P.red;
    if (col === 'T2') return (tint && tint[1]) || P.chalk;
    if (col === 'SK') return SKIN[(look && look.skin) | 0] || SKIN[0];
    if (col === 'HR') return HAIR[(look && look.hair) | 0] || HAIR[0];
    if (col === 'BT') return BOOT[(look && look.boot) | 0] || BOOT[0];
    return col;
  }

  /** Render rows to a new canvas, merging horizontal runs of one colour into single fillRects. */
  function render(rows, d, tint, look) {
    var h = rows.length, w = 0, i;
    for (i = 0; i < h; i++) if (rows[i].length > w) w = rows[i].length;
    var c = makeCanvas(w, h), ctx = c.getContext('2d');
    for (var y = 0; y < h; y++) {
      var row = rows[y], x = 0;
      while (x < row.length) {
        var ch = row.charAt(x);
        if (ch === '.') { x++; continue; }
        var run = 1;
        while (x + run < row.length && row.charAt(x + run) === ch) run++;
        var col = resolveColor(ch, d, tint, look);
        if (col) { ctx.fillStyle = col; ctx.fillRect(x, y, run, 1); }
        x += run;
      }
    }
    return c;
  }

  function keyFor(name, opts) {
    if (!opts) return name;
    var t = opts.tint ? (opts.tint[0] || '') + ',' + (opts.tint[1] || '') : '';
    var l = opts.look ? ((opts.look.skin | 0) + '.' + (opts.look.hair | 0) + '.' + (opts.look.boot | 0)) : '';
    return name + '|' + t + '|' + l;
  }

  /** Render the default atlas once. Safe to call repeatedly. */
  Sprites.init = function () {
    if (inited || !root.document) return Sprites;
    for (var name in DEFS) if (Object.prototype.hasOwnProperty.call(DEFS, name)) {
      cache[name] = render(DEFS[name].rows, DEFS[name], null, null);
    }
    inited = true;
    return Sprites;
  };

  /**
   * A sprite canvas by name. Tintable sprites (team tints / look tokens) are re-rendered and cached per
   * {tint:[primary, secondary], look:{skin, hair, boot}}; untinted sprites share one canvas.
   */
  Sprites.get = function (name, opts) {
    if (!inited) Sprites.init();
    var d = DEFS[name];
    if (!d) return null;
    if (!opts || !d.tintable) return cache[name] || (cache[name] = render(d.rows, d, null, null));
    var k = keyFor(name, opts);
    return cache[k] || (cache[k] = render(d.rows, d, opts.tint || null, opts.look || null));
  };

  Sprites.has = function (name) { return !!DEFS[name]; };
  Sprites.names = function () { return Object.keys(DEFS); };

  /** Frame names of a family: frames('kicker_lean') → ['kicker_lean1','kicker_lean2','kicker_lean3']. */
  Sprites.frames = function (family) {
    var out = [];
    for (var i = 0; i < 12; i++) { if (DEFS[family + i]) out.push(family + i); }
    return out;
  };

  /** Register an extra sprite at runtime (dev / other screens). */
  Sprites.define = function (name, rows, pal) {
    def(name, rows, pal);
    delete cache[name];
    if (inited) cache[name] = render(rows, DEFS[name], null, null);
  };

  // ───────────────────────────── goal posts at any size ─────────────────────────────
  /**
   * Uprights canvas: `w` = outer width of the posts (px), `h` = height of the posts above the crossbar (px).
   * The canvas is w × (h + xbar + base) with the crossbar at row `h` and the gooseneck below it.
   * opts: {xbar (crossbar height px, default 40 % of h), base (gooseneck px), thick (post thickness px), pad (colour)}
   */
  Sprites.uprights = function (w, h, opts) {
    opts = opts || {};
    w = Math.max(6, Math.round(w)); h = Math.max(4, Math.round(h));
    var xbar = Math.max(3, Math.round(opts.xbar !== undefined ? opts.xbar : h * 0.55));
    var base = Math.max(2, Math.round(opts.base !== undefined ? opts.base : Math.max(2, h * 0.12)));
    var thick = Math.max(1, Math.round(opts.thick !== undefined ? opts.thick : Math.max(1, w / 30)));
    var k = 'up|' + w + '|' + h + '|' + xbar + '|' + base + '|' + thick + '|' + (opts.pad || '');
    if (cache[k]) return cache[k];
    var c = makeCanvas(w, h + xbar + base), ctx = c.getContext('2d');
    ctx.fillStyle = P.chalk;
    ctx.fillRect(0, 0, thick, h + thick);                       // left post
    ctx.fillRect(w - thick, 0, thick, h + thick);               // right post
    ctx.fillRect(0, h, w, thick);                               // crossbar
    var midX = Math.floor(w / 2 - thick / 2);
    ctx.fillRect(midX, h + thick, thick, xbar);                 // gooseneck
    ctx.fillStyle = opts.pad || P.gold;
    ctx.fillRect(midX - thick, h + thick + xbar, thick * 3, base);   // pad
    ctx.fillStyle = P.red;                                      // wind ribbons on the post tops
    ctx.fillRect(0, 0, thick, Math.max(1, Math.round(h * 0.08)));
    ctx.fillRect(w - thick, 0, thick, Math.max(1, Math.round(h * 0.08)));
    cache[k] = c;
    return c;
  };
  Sprites.uprightsSmall = function () { return Sprites.uprights(28, 14, { thick: 1 }); };
  Sprites.uprightsMedium = function () { return Sprites.uprights(60, 30, { thick: 2 }); };
  Sprites.uprightsLarge = function () { return Sprites.uprights(116, 58, { thick: 3 }); };

  // ───────────────────────────── crests ─────────────────────────────
  var CREST_SHAPES = ['crest_shield', 'crest_pennant', 'crest_circle'];
  function hashStr(s) {
    var h = 2166136261 >>> 0;
    s = String(s || '');
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h;
  }
  /** Procedural crest for a team id: shape by id hash, tinted [primary, secondary]; `size` px (multiple of 12 looks best). */
  Sprites.crest = function (id, colors, size) {
    var shape = CREST_SHAPES[hashStr(id) % 3];
    var tint = colors && colors.length ? [colors[0], colors[1] || P.chalk] : [P.grey, P.chalk];
    var base = Sprites.get(shape, { tint: tint });
    size = size || 12;
    if (size === 12) return base;
    var k = 'crest|' + id + '|' + tint.join(',') + '|' + size;
    if (cache[k]) return cache[k];
    var c = makeCanvas(size, size), ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(base, 0, 0, size, size);
    cache[k] = c;
    return c;
  };
  Sprites.crestShapeFor = function (id) { return CREST_SHAPES[hashStr(id) % 3]; };

  // ───────────────────────────── 3×5 font ─────────────────────────────
  var glyphCache = {};
  function glyph(ch, color) {
    var k = ch + '|' + color;
    if (glyphCache[k]) return glyphCache[k];
    var rows = FONT[ch] || FONT[ch.toUpperCase()] || FONT[' '];
    var c = makeCanvas(3, 5), ctx = c.getContext('2d');
    ctx.fillStyle = color;
    for (var y = 0; y < 5; y++) for (var x = 0; x < 3; x++) if (rows[y].charAt(x) === 'w') ctx.fillRect(x, y, 1, 1);
    glyphCache[k] = c;
    return c;
  }
  /** Draw a string with the 3×5 font (1 px spacing) at virtual (x, y); scale is an integer. Allocation-free after warm-up. */
  Sprites.drawText = function (ctx, str, x, y, color, scale) {
    scale = scale || 1; color = color || P.chalk;
    str = String(str);
    for (var i = 0; i < str.length; i++) {
      var ch = str.charAt(i);
      if (ch !== ' ') ctx.drawImage(glyph(ch, color), x, y, 3 * scale, 5 * scale);
      x += 4 * scale;
    }
    return x;
  };
  Sprites.textWidth = function (str, scale) { return String(str).length * 4 * (scale || 1) - (scale || 1); };
  Sprites.FONT_CHARS = Object.keys(FONT);

  RTG.UI.Sprites = Sprites;
})(typeof window !== 'undefined' ? window : globalThis);
