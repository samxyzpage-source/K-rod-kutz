/**
 * Road to Glory: Kicker — global namespace.
 * Every other file (engine, data, ui) attaches to window.RTG (or globalThis in Node tests).
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.VERSION = '1.0.0';
  RTG.SAVE_VERSION = 1;
  RTG.Data = RTG.Data || {};
  RTG.UI = RTG.UI || {};
})(typeof window !== 'undefined' ? window : globalThis);
