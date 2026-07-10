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

  // ---- Background music: procedural mellow lo-fi loop -------------------
  // Fully synthesized, zero audio files. Rebuilt around a CORRECT musical
  // foundation: every pitch is a MIDI note number from one C-major scale, so
  // the melody, bass and chords are guaranteed in-key and consonant (the prior
  // version multiplied frequencies by arbitrary ratios and produced clashing,
  // shrill notes). Warm, gentle, and coherent - a real little tune that loops.
  //
  // Bus:  voices -> musicGain -> duckGain -> saturator -> busLowpass -> master
  //   - musicGain : fixed music level, sits UNDER the SFX feedback.
  //   - duckGain  : dipped while peeling so the ASMR crinkle leads (duckMusic).
  //   - saturator + busLowpass : soft warmth/glue, rolled-off highs.
  //   - master    : shared bus, so mute + ad/background suspend already apply.
  var MUSIC_LEVEL = 0.42;
  var DUCK_LEVEL = 0.45;
  var BPM = 84;                // relaxed but with a clear groove
  var SWING = 0.56;            // gentle lo-fi shuffle on the off-8ths
  var SCHEDULE_AHEAD = 0.25;
  var LOOKAHEAD_MS = 30;
  var STEPS_PER_BAR = 8;       // 8th-note grid (2 per beat) - simpler + tighter
  var BARS = 4;
  var TOTAL_STEPS = STEPS_PER_BAR * BARS;

  // MIDI note -> frequency. Everything below is written as MIDI numbers so it
  // stays strictly in key; 60 = C4, 69 = A4 (440Hz).
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // Progression (4 bars), the warm/uplifting C-major turnaround: C  G  Am  F.
  // Each entry: { bass: MIDI root, chord: [MIDI chord tones] } in a cosy octave.
  var PROG = [
    { bass: 36, chord: [48, 52, 55] },  // C   (C3 E3 G3)
    { bass: 43, chord: [47, 50, 55] },  // G   (B2 D3 G3)
    { bass: 33, chord: [48, 52, 57] },  // Am  (C3 E3 A3)
    { bass: 41, chord: [45, 48, 53] }   // F   (A2 C3 F3)
  ];

  // A written melody: one MIDI note (or null=rest) per 8th step, across all
  // 4 bars (32 slots). All notes are C-major scale tones that resolve over the
  // chords - a simple, singable, repeating hook that actually makes sense.
  // Bars:      C            |      G            |      Am           |      F
  var MELODY = [
    67, null, 64, 67,  62, null, 64, null,   // C: G4 . E4 G4  D4 . E4 .
    71, null, 67, null, 69, 67, 64, null,   // G: B4 . G4 .   A4 G4 E4 .
    72, null, 69, 72,  71, null, 69, null,   // Am: C5 . A4 C5  B4 . A4 .
    69, 67, 64, null,  62, null, 60, null    // F: A4 G4 E4 .  D4 . C4 .
  ];

  // Bass rhythm within a bar (8th-note indices that fire). Root-driven with a
  // little pickup on the "and" of beat 2 for movement - consistent every bar.
  var BASS_HITS = [0, 3, 4, 6];

  var music = null;

  function makeSaturationCurve(amount) {
    var n = 1024, curve = new Float32Array(n), k = amount;
    for (var i = 0; i < n; i++) {
      var x = (i / (n - 1)) * 2 - 1;
      curve[i] = (1 + k) * x / (1 + k * Math.abs(x));
    }
    return curve;
  }

  function startMusic() {
    ensureContext();
    if (!ctx || music) return;

    var musicGain = ctx.createGain();
    musicGain.gain.value = MUSIC_LEVEL;
    var duckGain = ctx.createGain();
    duckGain.gain.value = 1;
    var sat = ctx.createWaveShaper();
    sat.curve = makeSaturationCurve(0.4);
    sat.oversample = '2x';
    var busLp = ctx.createBiquadFilter();
    busLp.type = 'lowpass';
    busLp.frequency.value = 4200;   // mellow, rounded top end
    busLp.Q.value = 0.3;
    musicGain.connect(duckGain);
    duckGain.connect(sat);
    sat.connect(busLp);
    busLp.connect(master);

    // Quiet vinyl-crackle texture bed.
    var vinylSrc = ctx.createBufferSource();
    vinylSrc.buffer = noiseBuffer;
    vinylSrc.loop = true;
    var vinylHp = ctx.createBiquadFilter();
    vinylHp.type = 'highpass';
    vinylHp.frequency.value = 4000;
    var vinylGain = ctx.createGain();
    vinylGain.gain.value = 0.009;
    vinylSrc.connect(vinylHp); vinylHp.connect(vinylGain); vinylGain.connect(musicGain);
    vinylSrc.start();

    music = {
      timer: null,
      nextNoteTime: now() + 0.08,
      step: 0,
      musicGain: musicGain,
      duckGain: duckGain,
      vinylSrc: vinylSrc
    };
    music.timer = window.setInterval(scheduleMusic, LOOKAHEAD_MS);
  }

  function eighthDur() { return (60 / BPM) / 2; }

  function scheduleMusic() {
    if (!music || !ctx) return;
    if (ctx.state !== 'running') { music.nextNoteTime = now(); return; }
    while (music.nextNoteTime < now() + SCHEDULE_AHEAD) {
      var step = music.step;
      // Swing: delay the off-8th (odd steps) for a lo-fi shuffle.
      var swingOffset = (step % 2 === 1) ? (SWING - 0.5) * 2 * eighthDur() : 0;
      playMusicStep(step, music.nextNoteTime + swingOffset);
      music.nextNoteTime += eighthDur();
      music.step = (music.step + 1) % TOTAL_STEPS;
    }
  }

  // ---- voices -----------------------------------------------------------
  function voiceKick(t, gain) {
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.11);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    osc.connect(g); g.connect(music.musicGain);
    osc.start(t); osc.stop(t + 0.3);
  }

  function voiceSnare(t, gain) {
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1700;
    bp.Q.value = 0.7;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    src.connect(bp); bp.connect(g); g.connect(music.musicGain);
    src.start(t); src.stop(t + 0.18);
  }

  function voiceHat(t, gain) {
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    var hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 8000;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    src.connect(hp); hp.connect(g); g.connect(music.musicGain);
    src.start(t); src.stop(t + 0.06);
  }

  function voiceBass(t, midi, dur) {
    var freq = mtof(midi);
    var osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.42, t + 0.02);
    g.gain.setTargetAtTime(0.0001, t + dur * 0.6, 0.1);
    osc.connect(lp); lp.connect(g); g.connect(music.musicGain);
    osc.start(t); osc.stop(t + dur + 0.1);
  }

  // Warm Rhodes-ish chord: stacked sines with a gentle vibrato, soft attack,
  // lowpassed. Held across the bar so the harmony is a smooth bed.
  function voiceChord(t, midis, dur, level) {
    var out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(level, t + 0.05);
    out.gain.setTargetAtTime(0.0001, t + dur * 0.7, 0.2);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    out.connect(lp); lp.connect(music.musicGain);

    var lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 4.6;
    var lfoGain = ctx.createGain();
    lfoGain.gain.value = 1.6;
    lfo.connect(lfoGain);
    lfo.start(t); lfo.stop(t + dur + 0.2);

    midis.forEach(function (m) {
      var osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = mtof(m);
      var vg = ctx.createGain();
      vg.gain.value = 0.34;
      lfoGain.connect(osc.frequency);
      osc.connect(vg); vg.connect(out);
      osc.start(t); osc.stop(t + dur + 0.2);
    });
  }

  // Soft mellow bell/marimba-ish lead: sine + a quiet octave for body, gentle
  // attack, natural decay. Warm rather than piercing.
  function voiceLead(t, midi, level) {
    var freq = mtof(midi);
    var out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(level, t + 0.02);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    out.connect(lp); lp.connect(music.musicGain);
    [[1, 0.6], [2, 0.12]].forEach(function (v) {
      var osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * v[0];
      var vg = ctx.createGain();
      vg.gain.value = v[1];
      osc.connect(vg); vg.connect(out);
      osc.start(t); osc.stop(t + 0.6);
    });
  }

  // ---- pattern ----------------------------------------------------------
  // 8 steps/bar x 4 bars = 32 steps. Deterministic, in-key, and coherent: a
  // relaxed boom-bap kick, backbeat snare, steady hats, a rooted bass, a held
  // warm chord per bar, and the written MELODY on top.
  function playMusicStep(step, t) {
    var bar = Math.floor(step / STEPS_PER_BAR);
    var s = step % STEPS_PER_BAR; // 0..7 within the bar (8th notes)
    var prog = PROG[bar % PROG.length];
    var barDur = eighthDur() * STEPS_PER_BAR;

    // -- Kick: beats 1 and 3 (steps 0 and 4), with a soft pickup on the "and"
    //    of 4 (step 7) for a gentle lo-fi bounce.
    if (s === 0 || s === 4) voiceKick(t, 0.9);
    if (s === 7) voiceKick(t, 0.5);

    // -- Snare: backbeat on 2 and 4 (steps 2 and 6).
    if (s === 2 || s === 6) voiceSnare(t, 0.5);

    // -- Hats: every 8th, accented on the beat. Steady and consistent.
    voiceHat(t, (s % 2 === 0) ? 0.12 : 0.08);

    // -- Bass: rooted pattern each bar.
    if (BASS_HITS.indexOf(s) !== -1) {
      voiceBass(t, prog.bass, eighthDur() * (s === 0 ? 2.0 : 1.2));
    }

    // -- Chord: one warm held stab at the top of each bar.
    if (s === 0) voiceChord(t, prog.chord, barDur * 0.95, 0.16);

    // -- Melody: the written hook, in key.
    var mel = MELODY[step];
    if (mel != null) voiceLead(t, mel, 0.2);
  }

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
