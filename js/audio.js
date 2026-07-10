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

  // ---- Background music: procedural lo-fi chill beat --------------------
  // Fully synthesized, zero audio files (in keeping with the whole game). A
  // proper lo-fi hip-hop bed: swung boom-bap drums, a warm walking bass, a
  // Rhodes-ish chord instrument with vibrato, and a sparse bell lead - a real
  // rhythmic pocket rather than a thin arpeggio-over-pads.
  //
  // Bus:  voices -> musicGain -> duckGain -> musicBus(lowpass+saturator) -> master
  //   - musicGain : fixed music level, well under the SFX.
  //   - duckGain  : dipped while peeling so the ASMR crinkle leads (duckMusic).
  //   - musicBus  : a gentle lowpass + soft saturation over the WHOLE mix for
  //                 that warm, rounded lo-fi glue.
  //   - master    : shared bus, so mute + ad/background suspend already apply.
  //
  // Timing: a look-ahead scheduler queues notes on the precise AudioContext
  // clock, so the groove stays tight and loops seamlessly forever. The grid is
  // 16 sixteenth-steps per bar; SWING pushes the off-eighths late for feel.
  var MUSIC_LEVEL = 0.34;      // pre-bus; sits as a bed UNDER the SFX feedback
  var DUCK_LEVEL = 0.45;       // multiplier applied to the music while peeling
  var BPM = 92;                // upbeat, driving - energetic without being frantic
  var SWING = 0.52;            // light swing only; keep the groove tight/consistent
  var SCHEDULE_AHEAD = 0.25;   // seconds of notes queued each tick
  var LOOKAHEAD_MS = 30;       // scheduler wake interval
  var STEPS_PER_BAR = 16;
  var BARS = 4;                // short, catchy loop that repeats confidently
  var TOTAL_STEPS = STEPS_PER_BAR * BARS;

  // Chord progression (4 bars): a bright, driving loop in C major / A minor.
  // Am - F - C - G  (the classic uplifting pop/hypercasual turnaround).
  // Each entry: { root: bass note (Hz), notes: [chord voicing Hz] }.
  var A2 = 110.00, C3 = 130.81, D3 = 146.83, E3 = 164.81, F3 = 174.61, G3 = 196.00;
  var A3 = 220.00, C4 = 261.63, D4 = 293.66, E4 = 329.63, F4 = 349.23, G4 = 392.00, B3 = 246.94;
  var PROG = [
    { root: A2, notes: [A3, C4, E4] },   // Am
    { root: F3, notes: [F3, A3, C4] },   // F
    { root: C3, notes: [C4, E4, G4] },   // C
    { root: G3, notes: [G3, B3, D4] }    // G
  ];

  // A FIXED, repeating melodic hook (A/C-major pentatonic) - one entry per
  // 16th step of the bar (16 slots), null = rest. Deterministic so it's a
  // real, catchy riff that repeats every bar, not random sprinkles. The riff
  // is transposed slightly per chord (see leadNote) so it sits on the harmony.
  var C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, A5 = 880.00, B4 = 493.88;
  //                0    1   2    3   4   5   6    7    8   9  10   11  12  13  14  15
  var HOOK = [     E5, null, G5, null, A5, null, G5, null, E5, null, D5, null, C5, null, D5, null];

  // Steady 16-step bass rhythm (indices that fire within each bar). A driving
  // pattern so the low end pushes the beat forward every bar, consistently.
  var BASS_HITS = [0, 3, 6, 8, 11, 14];

  var music = null;

  // Soft saturation curve for warmth/glue on the whole music bus.
  function makeSaturationCurve(amount) {
    var n = 1024, curve = new Float32Array(n), k = amount;
    for (var i = 0; i < n; i++) {
      var x = (i / (n - 1)) * 2 - 1;
      curve[i] = (1 + k) * x / (1 + k * Math.abs(x)); // gentle soft-clip
    }
    return curve;
  }

  function startMusic() {
    ensureContext();
    if (!ctx || music) return;

    // Bus chain: musicGain -> duckGain -> saturator -> busLowpass -> master.
    var musicGain = ctx.createGain();
    musicGain.gain.value = MUSIC_LEVEL;
    var duckGain = ctx.createGain();
    duckGain.gain.value = 1;
    var sat = ctx.createWaveShaper();
    sat.curve = makeSaturationCurve(0.6);
    sat.oversample = '2x';
    var busLp = ctx.createBiquadFilter();
    busLp.type = 'lowpass';
    busLp.frequency.value = 5200;   // roll off harsh highs -> mellow tape feel
    busLp.Q.value = 0.4;
    musicGain.connect(duckGain);
    duckGain.connect(sat);
    sat.connect(busLp);
    busLp.connect(master);

    // Continuous vinyl-crackle bed: quiet looped noise through a highpass, for
    // that lo-fi texture between hits. Very low level so it's felt not heard.
    var vinylSrc = ctx.createBufferSource();
    vinylSrc.buffer = noiseBuffer;
    vinylSrc.loop = true;
    var vinylHp = ctx.createBiquadFilter();
    vinylHp.type = 'highpass';
    vinylHp.frequency.value = 3000;
    var vinylGain = ctx.createGain();
    vinylGain.gain.value = 0.012;
    vinylSrc.connect(vinylHp); vinylHp.connect(vinylGain); vinylGain.connect(musicGain);
    vinylSrc.start();

    music = {
      timer: null,
      nextNoteTime: now() + 0.06,
      step: 0,
      musicGain: musicGain,
      duckGain: duckGain,
      vinylSrc: vinylSrc
    };
    music.timer = window.setInterval(scheduleMusic, LOOKAHEAD_MS);
  }

  function sixteenthDur() { return (60 / BPM) / 4; }

  function scheduleMusic() {
    if (!music || !ctx) return;
    if (ctx.state !== 'running') { music.nextNoteTime = now(); return; }

    while (music.nextNoteTime < now() + SCHEDULE_AHEAD) {
      var step = music.step;
      // Swing: delay the 2nd sixteenth of every eighth-note pair.
      var swingOffset = (step % 2 === 1) ? (SWING - 0.5) * 2 * sixteenthDur() : 0;
      playMusicStep(step, music.nextNoteTime + swingOffset);
      music.nextNoteTime += sixteenthDur();
      music.step = (music.step + 1) % TOTAL_STEPS;
    }
  }

  // ---- lo-fi voices -----------------------------------------------------
  function voiceKick(t, gain) {
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(g); g.connect(music.musicGain);
    osc.start(t); osc.stop(t + 0.34);
  }

  function voiceSnare(t, gain) {
    // Filtered noise burst + a short body tone = soft lo-fi snare/rim.
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 0.8;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    src.connect(bp); bp.connect(g); g.connect(music.musicGain);
    src.start(t); src.stop(t + 0.2);

    var body = ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(220, t);
    body.frequency.exponentialRampToValueAtTime(160, t + 0.08);
    var bg = ctx.createGain();
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.exponentialRampToValueAtTime(gain * 0.5, t + 0.006);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    body.connect(bg); bg.connect(music.musicGain);
    body.start(t); body.stop(t + 0.12);
  }

  function voiceHat(t, gain, open) {
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    var hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    var g = ctx.createGain();
    var dur = open ? 0.14 : 0.045;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(hp); hp.connect(g); g.connect(music.musicGain);
    src.start(t); src.stop(t + dur + 0.02);
  }

  function voiceBass(t, freq, dur) {
    var osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    var sub = ctx.createOscillator(); // a touch of sine sub under it
    sub.type = 'sine';
    sub.frequency.setValueAtTime(freq, t);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.03);
    g.gain.setTargetAtTime(0.0001, t + dur * 0.7, 0.12);
    osc.connect(lp); sub.connect(lp); lp.connect(g); g.connect(music.musicGain);
    osc.start(t); osc.stop(t + dur + 0.1);
    sub.start(t); sub.stop(t + dur + 0.1);
  }

  // Rhodes-ish chord stab: stacked detuned sines, soft attack, vibrato LFO,
  // through a lowpass. Longer sustain for held chords.
  function voiceChord(t, notes, dur, level) {
    var out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(level, t + 0.04);
    out.gain.setTargetAtTime(0.0001, t + dur * 0.6, 0.18);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1600;
    out.connect(lp); lp.connect(music.musicGain);

    // shared vibrato
    var lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 5.2;
    var lfoGain = ctx.createGain();
    lfoGain.gain.value = 2.4; // Hz of pitch wobble
    lfo.connect(lfoGain);
    lfo.start(t); lfo.stop(t + dur + 0.2);

    notes.forEach(function (f) {
      [0, 0.5].forEach(function (detCents, idx) {
        var osc = ctx.createOscillator();
        osc.type = idx === 0 ? 'sine' : 'triangle';
        osc.frequency.value = f * (1 + detCents / 1000);
        var vg = ctx.createGain();
        vg.gain.value = idx === 0 ? 0.5 : 0.16;
        lfoGain.connect(osc.frequency);
        osc.connect(vg); vg.connect(out);
        osc.start(t); osc.stop(t + dur + 0.2);
      });
    });
  }

  function voiceLead(t, freq, level) {
    level = level || 0.24;
    // Two detuned oscillators for a fuller, more present pluck lead that cuts
    // through the beat. Quick attack + medium decay = bright and rhythmic.
    var out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(level, t + 0.012);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    out.connect(lp); lp.connect(music.musicGain);
    [['triangle', 1, 0.7], ['square', 1.003, 0.12]].forEach(function (v) {
      var osc = ctx.createOscillator();
      osc.type = v[0];
      osc.frequency.value = freq * v[1];
      var vg = ctx.createGain();
      vg.gain.value = v[2];
      osc.connect(vg); vg.connect(out);
      osc.start(t); osc.stop(t + 0.45);
    });
  }

  // Transpose the fixed HOOK riff to lean on each chord while keeping the same
  // contour. Deterministic multipliers move the whole hook by a few scale steps
  // per chord (Am/F/C/G), so it stays recognisable but never clashes.
  function leadNote(freq, bar) {
    var mul = [1.0, 0.87055, 0.79370, 0.94387][bar % 4]; // ~0, -2.4, -4, -1 semitone-ish
    return freq * mul;
  }

  // ---- pattern ----------------------------------------------------------
  // 16 steps/bar x 4 bars. The groove is fully DETERMINISTIC and steady - a
  // driving kick, locked backbeat, constant hats, a rhythmic bass every bar,
  // chord stabs on every beat, and a fixed repeating melodic hook - so it reads
  // as an energetic, consistent loop rather than a sparse random ambience.
  function playMusicStep(step, t) {
    var bar = Math.floor(step / STEPS_PER_BAR);
    var s = step % STEPS_PER_BAR; // 0..15 within the bar
    var chord = PROG[bar % PROG.length];
    var beatDur = sixteenthDur() * 4;

    // -- Kick: a driving pulse. Beats 1 & 3 hard, plus the "and" of 2 and the
    //    "a" of 4 every bar (consistent) so the low end pushes constantly.
    if (s === 0 || s === 8) voiceKick(t, 0.95);
    if (s === 6 || s === 14) voiceKick(t, 0.62);

    // -- Snare/clap: locked backbeat on 2 and 4, every bar.
    if (s === 4 || s === 12) voiceSnare(t, 0.55);

    // -- Hats: steady on every 8th, with a firm accent on the beat. A driving
    //    16th "and-a" push into each backbeat for energy - fixed, not random.
    if (s % 2 === 0) voiceHat(t, s % 4 === 0 ? 0.16 : 0.11, false);
    if (s === 7 || s === 15) voiceHat(t, 0.13, false); // extra 16th push

    // -- Bass: a rhythmic root pattern every bar (BASS_HITS), octave-up accents
    //    on the off-beats so it grooves rather than sits on one held note.
    if (BASS_HITS.indexOf(s) !== -1) {
      var up = (s === 3 || s === 11);           // little octave pops for movement
      voiceBass(t, chord.root * (up ? 2 : 1), beatDur * (s === 0 ? 1.1 : 0.5));
    }

    // -- Chords: a rhythmic stab on every beat (0,4,8,12) - short and punchy so
    //    the harmony drives the groove instead of drifting.
    if (s % 4 === 0) voiceChord(t, chord.notes, beatDur * 0.9, 0.2);

    // -- Lead: the FIXED hook riff, one note per HOOK slot, transposed to the
    //    chord. Plays every bar so it's a real, catchy, repeating melody.
    if (HOOK[s] != null) voiceLead(t, leadNote(HOOK[s], bar), 0.22);
  }

  // Dip / restore the music under the ASMR peel sound. Called on drag start
  // (down=true) and release (down=false).
  function duckMusic(down) {
    if (!music || !ctx) return;
    music.duckGain.gain.setTargetAtTime(down ? DUCK_LEVEL : 1, now(), down ? 0.12 : 0.5);
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
    resumeAfterAd: resumeAfterAd,
    startMusic: startMusic,
    duckMusic: duckMusic
  };
})();
