window.PeelIt = window.PeelIt || {};

/*
 * audio.js - fully procedural Web Audio sound design. No audio files at all.
 *
 * - Paper crinkle: a looping noise buffer through a jittering bandpass
 *   filter, gain driven by drag speed, for the ASMR peel sensation.
 * - Lift / thock: short filtered noise + oscillator one-shots.
 * - Chime arpeggio: one pentatonic note per sticker placed.
 * - Wrong tone: two quick descending sine blips.
 * - Scene-complete pad: a slow, detuned chord swell.
 */
PeelIt.Audio = (function () {
  'use strict';

  var ctx = null;
  var master = null;
  var muted = false;
  var noiseBuffer = null;
  var crinkle = null; // active crinkle voice while dragging

  function ensureContext() {
    if (ctx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return; // very old browser: audio silently disabled
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);
    noiseBuffer = buildNoiseBuffer();
    registerAutoPause();
  }

  // Platform review requirement: audio must pause when the tab/app is
  // minimized or backgrounded (e.g. behind a rewarded ad overlay), and
  // resume when it's foregrounded again. Registered once, lazily, the
  // first time a real AudioContext exists.
  var autoPauseRegistered = false;
  function registerAutoPause() {
    if (autoPauseRegistered) return;
    autoPauseRegistered = true;
    document.addEventListener('visibilitychange', function () {
      if (!ctx) return;
      if (document.hidden) {
        if (ctx.state === 'running') ctx.suspend();
      } else if (!muted && ctx.state === 'suspended') {
        ctx.resume();
      }
    });
  }

  // Exposed so the SDK layer can pause/resume audio around a platform ad
  // break even when the page itself stays visible (e.g. an in-page
  // rewarded-ad overlay rather than a real tab switch).
  function pauseForAd() {
    if (ctx && ctx.state === 'running') ctx.suspend();
  }
  function resumeAfterAd() {
    if (ctx && !muted && ctx.state === 'suspended') ctx.resume();
  }

  function buildNoiseBuffer() {
    var length = ctx.sampleRate * 2; // 2s of white noise, looped as needed
    var buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  // Must be called from a user gesture (pointerdown) to satisfy autoplay
  // policies on mobile browsers and platform webviews.
  function resume() {
    ensureContext();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function setMuted(value) {
    muted = value;
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.05);
  }

  function now() { return ctx.currentTime; }

  // ---- Paper crinkle (peel drag) --------------------------------------
  function startCrinkle() {
    ensureContext();
    if (!ctx || crinkle) return;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;

    var band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2200;
    band.Q.value = 0.7;

    var hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;

    var gain = ctx.createGain();
    gain.gain.value = 0.0001;

    src.connect(band); band.connect(hp); hp.connect(gain); gain.connect(master);
    src.start();

    crinkle = { src: src, band: band, gain: gain, jitterAcc: 0, grainAcc: 0 };
  }

  // speed01: 0-1 normalized drag speed. Call every frame while dragging.
  function updateCrinkle(speed01, dt) {
    if (!crinkle) return;
    var target = 0.015 + Math.min(1, speed01) * 0.19;
    crinkle.gain.gain.setTargetAtTime(target, now(), 0.03);

    // Re-center the bandpass every ~30ms for a grainy, papery texture
    // instead of a smooth static hiss (finer-grained than the original
    // 50ms - reads as a rougher, more granular paper surface).
    crinkle.jitterAcc += dt;
    if (crinkle.jitterAcc > 0.03) {
      crinkle.jitterAcc = 0;
      var f = 1500 + Math.random() * 2600 + speed01 * 1400;
      crinkle.band.frequency.setTargetAtTime(f, now(), 0.015);
    }

    // Layered on top of the continuous bed: discrete micro-grain crackles,
    // like individual paper fibers catching and releasing. Faster drags
    // fire grains more often and louder, so quick peels sound busier/
    // crunchier while slow peels sound sparse and delicate.
    crinkle.grainAcc += dt;
    var grainInterval = 0.1 - speed01 * 0.07;
    if (crinkle.grainAcc > grainInterval) {
      crinkle.grainAcc = 0;
      if (Math.random() < 0.35 + speed01 * 0.5) playGrain(0.05 + speed01 * 0.12);
    }
  }

  // A single very short filtered noise click - the building block of the
  // granular crinkle texture layered on top of the continuous crinkle bed.
  function playGrain(amount) {
    if (!ctx) return;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    var band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2500 + Math.random() * 3500;
    band.Q.value = 3 + Math.random() * 4;
    var gain = ctx.createGain();
    var t0 = now();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(amount, t0 + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.02 + Math.random() * 0.02);
    src.connect(band); band.connect(gain); gain.connect(master);
    src.start(t0); src.stop(t0 + 0.05);
  }

  function stopCrinkle() {
    if (!crinkle) return;
    var c = crinkle;
    crinkle = null;
    c.gain.gain.setTargetAtTime(0.0001, now(), 0.05);
    window.setTimeout(function () {
      try { c.src.stop(); } catch (e) { /* already stopped */ }
    }, 200);
  }

  // ---- Airy sticky "lift" one-shot, played on pick-up ------------------
  function playLift() {
    ensureContext();
    if (!ctx) return;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    var band = ctx.createBiquadFilter();
    band.type = 'highpass';
    band.frequency.setValueAtTime(600, now());
    band.frequency.exponentialRampToValueAtTime(4000, now() + 0.18);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now());
    gain.gain.exponentialRampToValueAtTime(0.25, now() + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now() + 0.2);
    src.connect(band); band.connect(gain); gain.connect(master);
    src.start(); src.stop(now() + 0.25);
  }

  // ---- Soft low-passed "thock" on successful placement -----------------
  function playThock() {
    ensureContext();
    if (!ctx) return;
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now());
    osc.frequency.exponentialRampToValueAtTime(70, now() + 0.12);

    var noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;

    var oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.35, now());
    oscGain.gain.exponentialRampToValueAtTime(0.001, now() + 0.18);

    var noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.15, now());
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now() + 0.09);

    osc.connect(oscGain); oscGain.connect(master);
    noiseSrc.connect(lp); lp.connect(noiseGain); noiseGain.connect(master);

    osc.start(); osc.stop(now() + 0.2);
    noiseSrc.start(); noiseSrc.stop(now() + 0.1);
  }

  // ---- Pentatonic chime arpeggio, one note per sticker placed ----------
  var PENTATONIC = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00];
  function playChime(step) {
    ensureContext();
    if (!ctx) return;
    var octaveBump = Math.floor(step / PENTATONIC.length) * 0.5;
    var freq = PENTATONIC[step % PENTATONIC.length] * (1 + octaveBump);
    var osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now());
    gain.gain.exponentialRampToValueAtTime(0.28, now() + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now() + 0.5);
    osc.connect(gain); gain.connect(master);
    osc.start(); osc.stop(now() + 0.55);
  }

  // ---- Gentle "nuh-uh" wrong-placement tone -----------------------------
  function playWrong() {
    ensureContext();
    if (!ctx) return;
    [330, 220].forEach(function (f, i) {
      var osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      var gain = ctx.createGain();
      var t0 = now() + i * 0.09;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
      osc.connect(gain); gain.connect(master);
      osc.start(t0); osc.stop(t0 + 0.16);
    });
  }

  // ---- Warm pad swell on scene complete ---------------------------------
  function playSceneComplete() {
    ensureContext();
    if (!ctx) return;
    var chordFreqs = [261.63, 329.63, 392.00, 523.25]; // warm major-ish chord
    var padGain = ctx.createGain();
    padGain.gain.setValueAtTime(0.0001, now());
    padGain.gain.exponentialRampToValueAtTime(0.22, now() + 1.2);
    padGain.gain.exponentialRampToValueAtTime(0.0001, now() + 3.2);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    padGain.connect(lp); lp.connect(master);

    chordFreqs.forEach(function (f) {
      [1, 1.003, 0.997].forEach(function (detune) {
        var osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f * detune;
        osc.connect(padGain);
        osc.start();
        osc.stop(now() + 3.3);
      });
    });
  }

  return {
    resume: resume,
    setMuted: setMuted,
    startCrinkle: startCrinkle,
    updateCrinkle: updateCrinkle,
    stopCrinkle: stopCrinkle,
    playLift: playLift,
    playThock: playThock,
    playChime: playChime,
    playWrong: playWrong,
    playSceneComplete: playSceneComplete,
    pauseForAd: pauseForAd,
    resumeAfterAd: resumeAfterAd
  };
})();
