/**
 * Road to Glory: Kicker — RTG.UI.Canvas (SPEC §3.9, §4.2)
 *
 * The virtual pixel canvas: 192×320 (portrait) or 320×192 (landscape, chosen by the container's aspect),
 * scaled by an integer factor `scale = floor(min(containerW / w, containerH / h))` (min 1) with the device
 * pixel ratio capped at 2. Drawing happens in virtual pixels through ctx.setTransform(scale·dpr, …);
 * imageSmoothingEnabled is false and the element carries `image-rendering: pixelated`.
 *
 *   var cv = RTG.UI.Canvas.create(container, {w:192, h:320, onResize: fn(cv)});
 *   cv.start(function (dt, now) { ... draw ... });   cv.stop();
 *   cv.toVirtual(clientX, clientY) → {x, y}          (shared object — copy if you keep it)
 *   cv.stats → {fps, frameP95Ms}                     cv.resize()   cv.destroy()
 *   RTG.UI.Canvas.active() → true while any loop runs (RTG.debug.perf().rafActive)
 *   RTG.UI.Canvas.perf()   → {fps, frameP95Ms, rafActive, canvases}
 *
 * The RAF loop only runs between start() and stop(); screens must stop it in destroy(). The loop measures
 * frame times in a ring buffer (120 frames) for the p95 read by RTG.debug.perf().
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Canvas = {};

  var instances = [];
  var RING = 120;

  function now() { return (root.performance && root.performance.now) ? root.performance.now() : Date.now(); }

  /**
   * Create a virtual canvas inside `container` (the canvas is centred by the container's CSS; we only set its size).
   * opts: {w, h (portrait pair; landscape swaps them), orientation:'auto'|'portrait'|'landscape', maxScale, onResize}
   */
  Canvas.create = function (container, opts) {
    opts = opts || {};
    var doc = root.document;
    var canvas = doc.createElement('canvas');
    canvas.className = 'rtg-canvas';
    canvas.style.imageRendering = 'pixelated';
    canvas.style.display = 'block';
    canvas.style.touchAction = 'none';
    container.appendChild(canvas);
    var ctx = canvas.getContext('2d', { alpha: false });
    var pw = opts.w || 192, ph = opts.h || 320;

    var api = {
      canvas: canvas, ctx: ctx, container: container,
      w: pw, h: ph, scale: 1, dpr: 1, landscape: false, running: false,
      stats: { fps: 0, frameP95Ms: 0, frames: 0 },
      _loop: null, _raf: 0, _last: 0, _times: new Float32Array(RING), _ti: 0, _tn: 0, _sorted: new Float32Array(RING),
      _statAt: 0, _fpsCount: 0, _fpsAt: 0, _pt: { x: 0, y: 0 }
    };

    function measure() {
      var cw = container.clientWidth, ch = container.clientHeight;
      if (!cw || !ch) {
        var r = container.getBoundingClientRect();
        cw = cw || r.width || root.innerWidth || pw;
        ch = ch || r.height || root.innerHeight || ph;
      }
      return { cw: cw, ch: ch };
    }

    api.resize = function () {
      var m = measure();
      var landscape;
      if (opts.orientation === 'portrait') landscape = false;
      else if (opts.orientation === 'landscape') landscape = true;
      else landscape = m.cw > m.ch;
      var w = landscape ? Math.max(pw, ph) : Math.min(pw, ph);
      var h = landscape ? Math.min(pw, ph) : Math.max(pw, ph);
      var scale = Math.floor(Math.min(m.cw / w, m.ch / h));
      if (!(scale >= 1)) scale = 1;
      if (opts.maxScale && scale > opts.maxScale) scale = opts.maxScale;
      var dpr = Math.min(root.devicePixelRatio || 1, 2);
      var changed = (w !== api.w || h !== api.h || scale !== api.scale || dpr !== api.dpr || landscape !== api.landscape);
      api.w = w; api.h = h; api.scale = scale; api.dpr = dpr; api.landscape = landscape;
      var bw = Math.round(w * scale * dpr), bh = Math.round(h * scale * dpr);
      if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
      canvas.style.width = (w * scale) + 'px';
      canvas.style.height = (h * scale) + 'px';
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      if (changed && opts.onResize) opts.onResize(api);
      return api;
    };

    /** Client (CSS px) → virtual pixel coordinates. Returns a shared object. */
    api.toVirtual = function (clientX, clientY) {
      var r = canvas.getBoundingClientRect();
      var s = api.scale || 1;
      api._pt.x = (clientX - r.left) / s;
      api._pt.y = (clientY - r.top) / s;
      return api._pt;
    };
    /** Virtual → CSS px offset within the canvas element (shared object). */
    api.toCss = function (vx, vy) {
      api._pt.x = vx * api.scale; api._pt.y = vy * api.scale;
      return api._pt;
    };
    api.cssWidth = function () { return api.w * api.scale; };
    api.cssHeight = function () { return api.h * api.scale; };

    function frame(t) {
      if (!api.running) return;
      api._raf = root.requestAnimationFrame(frame);
      var dt = api._last ? Math.min(100, t - api._last) : 16.7;
      api._last = t;
      var t0 = now();
      try {
        api._loop(dt, t);
      } catch (e) {
        api.stop();
        if (root.console) root.console.error('Canvas loop error', e);
        return;
      }
      var cost = now() - t0;
      api._times[api._ti] = cost;
      api._ti = (api._ti + 1) % RING;
      if (api._tn < RING) api._tn++;
      api.stats.frames++;
      api._fpsCount++;
      if (t - api._fpsAt >= 1000) {
        api.stats.fps = Math.round(api._fpsCount * 1000 / (t - api._fpsAt));
        api._fpsCount = 0; api._fpsAt = t;
      }
      if (t - api._statAt >= 500) { api._statAt = t; api.stats.frameP95Ms = p95(api); }
    }

    function p95(a) {
      var n = a._tn;
      if (!n) return 0;
      for (var i = 0; i < n; i++) a._sorted[i] = a._times[i];
      var s = a._sorted.subarray(0, n);
      Array.prototype.sort.call(s, function (x, y) { return x - y; });
      return Math.round(s[Math.min(n - 1, Math.floor(n * 0.95))] * 100) / 100;
    }
    api.p95 = function () { return p95(api); };

    api.start = function (loopFn) {
      api._loop = loopFn;
      if (api.running) return api;
      api.running = true;
      api._last = 0; api._fpsAt = now(); api._fpsCount = 0;
      api._raf = root.requestAnimationFrame(frame);
      return api;
    };
    api.stop = function () {
      if (!api.running) return api;
      api.running = false;
      if (api._raf) root.cancelAnimationFrame(api._raf);
      api._raf = 0;
      return api;
    };
    api.destroy = function () {
      api.stop();
      var i = instances.indexOf(api);
      if (i >= 0) instances.splice(i, 1);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };

    instances.push(api);
    api.resize();
    return api;
  };

  /** True while any RAF loop runs (debug perf `rafActive`). */
  Canvas.active = function () {
    for (var i = 0; i < instances.length; i++) if (instances[i].running) return true;
    return false;
  };
  Canvas.instances = function () { return instances.slice(); };
  /** Aggregate perf of the running canvas (or the last one). */
  Canvas.perf = function () {
    var a = null;
    for (var i = 0; i < instances.length; i++) if (instances[i].running) a = instances[i];
    if (!a && instances.length) a = instances[instances.length - 1];
    return {
      fps: a ? a.stats.fps : 0,
      frameP95Ms: a ? a.p95() : 0,
      rafActive: Canvas.active(),
      canvases: instances.length
    };
  };

  RTG.UI.Canvas = Canvas;
})(typeof window !== 'undefined' ? window : globalThis);
