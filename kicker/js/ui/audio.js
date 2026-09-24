/**
 * Road to Glory: Kicker — RTG.UI.Audio (SPEC §4.7)
 *
 * WebAudio-only bleeps, no files. The AudioContext is created on the first user gesture (pointerdown /
 * keydown / touchstart, registered once by Audio.init()), so nothing plays before the user touches the
 * page. Every call is a silent no-op when WebAudio is missing, the context is not unlocked yet, or the
 * master toggle (settings.audio) is off.
 *
 *   Audio.init(settingsProvider?)   settingsProvider() → {audio: bool}; default reads RTG.UI.store.settings
 *   Audio.setEnabled(bool) · Audio.enabled() · Audio.available() · Audio.unlock()
 *   Audio.click() · thunk(power 0..1.15) · whoosh() · ting() · whistle() · stingerGood() · stingerBad()
 *   Audio.crowd(level 0..1) (starts the filtered-noise loop / sets its gain) · crowdRoar() · crowdStop()
 *   Audio.heartbeat(bpm) · heartbeatStop()
 *   Audio.haptic(ms) — navigator.vibrate when available
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Audio = {};

  var AC = root.AudioContext || root.webkitAudioContext || null;
  var ctx = null, master = null, unlocked = false, enabledOverride = null, settingsProvider = null, inited = false;
  var crowdNode = null, crowdGain = null, crowdFilter = null, crowdLevel = 0;
  var hbTimer = 0, hbBpm = 0;
  var lastClick = 0;

  function settingOn() {
    if (enabledOverride !== null) return enabledOverride;
    try {
      var s = settingsProvider ? settingsProvider() : (RTG.UI.store && RTG.UI.store.settings);
      if (s && typeof s.audio === 'boolean') return s.audio;
    } catch (e) { /* ignore */ }
    return true;
  }
  function ok() { return !!(ctx && unlocked && settingOn() && ctx.state !== 'closed'); }

  function ensureContext() {
    if (ctx || !AC) return !!ctx;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; }
    return !!ctx;
  }

  /** Create / resume the context (call from a user gesture handler). */
  Audio.unlock = function () {
    if (!ensureContext()) return false;
    if (ctx.state === 'suspended' && ctx.resume) {
      try { ctx.resume(); } catch (e) { /* ignore */ }
    }
    unlocked = true;
    return true;
  };

  function onGesture() {
    Audio.unlock();
    if (unlocked) removeGestureListeners();
  }
  function removeGestureListeners() {
    root.removeEventListener('pointerdown', onGesture, true);
    root.removeEventListener('keydown', onGesture, true);
    root.removeEventListener('touchstart', onGesture, true);
  }

  Audio.init = function (provider) {
    if (provider) settingsProvider = provider;
    if (inited || !AC) { inited = true; return Audio; }
    inited = true;
    root.addEventListener('pointerdown', onGesture, true);
    root.addEventListener('keydown', onGesture, true);
    root.addEventListener('touchstart', onGesture, true);
    return Audio;
  };
  Audio.available = function () { return !!AC; };
  Audio.enabled = function () { return ok(); };
  Audio.setEnabled = function (on) {
    enabledOverride = (on === null || on === undefined) ? null : !!on;
    if (!settingOn()) { Audio.crowdStop(); Audio.heartbeatStop(); }
  };
  Audio.unlocked = function () { return unlocked; };

  // ───────────────────────────── primitives ─────────────────────────────
  function tone(type, freq, t0, dur, gain, freqEnd) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + Math.min(0.01, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  var noiseBuf = null;
  function noise() {
    if (noiseBuf) return noiseBuf;
    var len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    var seed = 12345;
    for (var i = 0; i < len; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; d[i] = (seed / 4294967296) * 2 - 1; }
    noiseBuf = buf;
    return buf;
  }
  function burst(t0, dur, gain, filterHz, type) {
    var src = ctx.createBufferSource(); src.buffer = noise(); src.loop = true;
    var f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = filterHz; f.Q.value = 0.8;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  // ───────────────────────────── §4.7 sounds ─────────────────────────────
  /** Bar tick (rate-limited to 25 ms). */
  Audio.click = function () {
    if (!ok()) return;
    var t = ctx.currentTime;
    if (t - lastClick < 0.025) return;
    lastClick = t;
    tone('square', 1200, t, 0.03, 0.12);
  };
  /** Contact thunk: pitch 180–320 Hz by power (0..1.15). */
  Audio.thunk = function (power) {
    if (!ok()) return;
    var p = Math.max(0, Math.min(1.15, +power || 0.8));
    var f = 180 + (p / 1.15) * 140;
    var t = ctx.currentTime;
    tone('triangle', f, t, 0.16, 0.6, f * 0.5);
    burst(t, 0.08, 0.35, 900, 'lowpass');
  };
  Audio.whoosh = function () {
    if (!ok()) return;
    burst(ctx.currentTime, 0.45, 0.22, 1800, 'bandpass');
  };
  /** Doink: 2.2 kHz metallic ring decaying over ~0.8 s. */
  Audio.ting = function () {
    if (!ok()) return;
    var t = ctx.currentTime;
    tone('sine', 2200, t, 0.8, 0.5);
    tone('sine', 3300, t, 0.5, 0.2);
    tone('square', 2200, t, 0.05, 0.15);
  };
  Audio.whistle = function () {
    if (!ok()) return;
    var t = ctx.currentTime;
    tone('sine', 2600, t, 0.35, 0.3, 2900);
    tone('sine', 2650, t + 0.05, 0.3, 0.2, 2950);
  };
  function arpeggio(notes, gap, dur, type) {
    var t = ctx.currentTime;
    for (var i = 0; i < notes.length; i++) tone(type || 'square', notes[i], t + i * gap, dur, 0.25);
  }
  Audio.stingerGood = function () { if (ok()) arpeggio([523, 659, 784, 1047], 0.09, 0.28, 'square'); };
  Audio.stingerBad = function () { if (ok()) arpeggio([392, 311, 262], 0.14, 0.4, 'sawtooth'); };

  /** Crowd loop: filtered noise; level 0..1 sets the gain (0 fades it out). */
  Audio.crowd = function (level) {
    if (!ok()) return;
    level = Math.max(0, Math.min(1, +level || 0));
    var t = ctx.currentTime;
    if (!crowdNode) {
      crowdNode = ctx.createBufferSource(); crowdNode.buffer = noise(); crowdNode.loop = true;
      crowdFilter = ctx.createBiquadFilter(); crowdFilter.type = 'lowpass'; crowdFilter.frequency.value = 600;
      crowdGain = ctx.createGain(); crowdGain.gain.value = 0.0001;
      crowdNode.connect(crowdFilter); crowdFilter.connect(crowdGain); crowdGain.connect(master);
      crowdNode.start(t);
    }
    crowdLevel = level;
    crowdGain.gain.cancelScheduledValues(t);
    crowdGain.gain.setValueAtTime(Math.max(0.0001, crowdGain.gain.value), t);
    crowdGain.gain.linearRampToValueAtTime(Math.max(0.0001, level * 0.35), t + 0.4);
    crowdFilter.frequency.setValueAtTime(400 + 900 * level, t);
  };
  /** Swell to a roar then settle back to the current level. */
  Audio.crowdRoar = function () {
    if (!ok()) return;
    Audio.crowd(Math.max(crowdLevel, 0.3));
    var t = ctx.currentTime;
    crowdGain.gain.cancelScheduledValues(t);
    crowdGain.gain.setValueAtTime(Math.max(0.0001, crowdGain.gain.value), t);
    crowdGain.gain.linearRampToValueAtTime(0.5, t + 0.3);
    crowdGain.gain.linearRampToValueAtTime(Math.max(0.0001, crowdLevel * 0.35), t + 2.2);
    crowdFilter.frequency.setValueAtTime(1600, t);
    crowdFilter.frequency.linearRampToValueAtTime(400 + 900 * crowdLevel, t + 2.2);
  };
  Audio.crowdStop = function () {
    if (!crowdNode) return;
    try {
      var t = ctx.currentTime;
      crowdGain.gain.cancelScheduledValues(t);
      crowdGain.gain.setValueAtTime(Math.max(0.0001, crowdGain.gain.value), t);
      crowdGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      crowdNode.stop(t + 0.35);
    } catch (e) { /* ignore */ }
    crowdNode = null; crowdGain = null; crowdFilter = null; crowdLevel = 0;
  };

  /** Heartbeat at bpm (two low thumps per beat). */
  Audio.heartbeat = function (bpm) {
    Audio.heartbeatStop();
    if (!ok()) return;
    hbBpm = Math.max(40, Math.min(200, +bpm || 60));
    var beat = function () {
      if (!ok()) { Audio.heartbeatStop(); return; }
      var t = ctx.currentTime;
      tone('sine', 55, t, 0.12, 0.7, 40);
      tone('sine', 50, t + 0.16, 0.12, 0.5, 38);
    };
    beat();
    hbTimer = root.setInterval(beat, Math.round(60000 / hbBpm));
  };
  Audio.heartbeatStop = function () {
    if (hbTimer) root.clearInterval(hbTimer);
    hbTimer = 0; hbBpm = 0;
  };
  Audio.stopAll = function () { Audio.crowdStop(); Audio.heartbeatStop(); };

  /** Haptic pulse when available and audio is enabled (the setting doubles as the haptics switch). */
  Audio.haptic = function (ms) {
    if (!settingOn()) return;
    try { if (root.navigator && root.navigator.vibrate) root.navigator.vibrate(ms || 30); } catch (e) { /* ignore */ }
  };

  RTG.UI.Audio = Audio;
})(typeof window !== 'undefined' ? window : globalThis);
