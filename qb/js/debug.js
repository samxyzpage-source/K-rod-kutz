/**
 * Road to Glory: QB — RTG.debug (the scripted API the tests drive)
 *
 * SCAFFOLD STUB — owner: the SHELL agent (replace this file whole).
 *
 * Contract: RTG.debug.forceResult(kind), current(), seed(), state(), skipTo('summary'). Every function is
 * synchronous and JSON-serialisable in its return so the e2e harness can call it: H.debug(page, 'current').
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.debug = RTG.debug || {};
  RTG.debug.version = RTG.VERSION;
})(typeof window !== 'undefined' ? window : globalThis);
