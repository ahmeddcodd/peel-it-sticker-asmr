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
    band.frequency.value = 1400; // warmer center (was 2200 - too bright/hissy)
    band.Q.value = 0.5;

    var hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 500; // was 900 - lowering keeps some body, less hiss

    // Warmth cap: roll off the harsh top end so the peel reads as soft paper
    // rather than a bright white-noise hiss. THIS is the fix for the review's
    // "noise found in the background music" note - the game has no music track;
    // the continuous sound the reviewer heard was this crinkle bed, previously
    // a bright 900-3000 Hz+ hiss. Now band-limited and much quieter (see
    // updateCrinkle's lowered gain).
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;

    var gain = ctx.createGain();
    gain.gain.value = 0.0001;

    src.connect(band); band.connect(hp); hp.connect(lp); lp.connect(gain); gain.connect(master);
    src.start();

    crinkle = { src: src, band: band, gain: gain, jitterAcc: 0, grainAcc: 0 };
  }

  // speed01: 0-1 normalized drag speed. Call every frame while dragging.
  function updateCrinkle(speed01, dt) {
    if (!crinkle) return;
    // Much lower ceiling than before (was 0.015 + 0.19) so the peel bed is a
    // soft ASMR whisper, not a foreground hiss.
    var target = 0.008 + Math.min(1, speed01) * 0.07;
    crinkle.gain.gain.setTargetAtTime(target, now(), 0.03);

    // Re-center the bandpass every ~30ms for a grainy, papery texture instead
    // of a smooth static hiss. Range pulled well down from the old
    // 1500-5500 Hz sweep so the texture stays warm.
    crinkle.jitterAcc += dt;
    if (crinkle.jitterAcc > 0.03) {
      crinkle.jitterAcc = 0;
      var f = 900 + Math.random() * 1400 + speed01 * 900;
      crinkle.band.frequency.setTargetAtTime(f, now(), 0.015);
    }

    // Layered on top of the continuous bed: discrete micro-grain crackles,
    // like individual paper fibers catching and releasing. Faster drags fire
    // grains more often, so quick peels sound busier while slow peels stay
    // sparse and delicate. Sparser and gentler than before.
    crinkle.grainAcc += dt;
    var grainInterval = 0.16 - speed01 * 0.08;
    if (crinkle.grainAcc > grainInterval) {
      crinkle.grainAcc = 0;
      if (Math.random() < 0.25 + speed01 * 0.4) playGrain(0.03 + speed01 * 0.06);
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
    band.frequency.value = 1300 + Math.random() * 1500; // warmer clicks (was up to 6 kHz)
    band.Q.value = 1.4 + Math.random() * 2;
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

  // ---- Bright triad sparkle for a "perfect" / combo placement ----------
  function playPerfect() {
    ensureContext();
    if (!ctx) return;
    [880, 1174.66, 1567.98].forEach(function (f, i) {
      var osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      var gain = ctx.createGain();
      var t0 = now() + i * 0.05;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
      osc.connect(gain); gain.connect(master);
      osc.start(t0); osc.stop(t0 + 0.35);
    });
  }

  // ---- Soft airy "pop" as a sticker fully peels off the backing ---------
  function playPeelRelease() {
    ensureContext();
    if (!ctx) return;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1200, now());
    bp.frequency.exponentialRampToValueAtTime(2600, now() + 0.12);
    bp.Q.value = 1.2;
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now());
    gain.gain.exponentialRampToValueAtTime(0.16, now() + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now() + 0.16);
    src.connect(bp); bp.connect(gain); gain.connect(master);
    src.start(); src.stop(now() + 0.2);
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

  // ---- Background music: a real looping melody ----------------------------
  // A cozy lo-fi tune with an actual singable melody (music-box lead), soft pad
  // chords, a warm bass, and a gentle pulse - over the friendly I-V-vi-IV loop
  // in C major (16 bars = an 8-bar phrase answered by a variation). Sequenced
  // with a Web Audio LOOKAHEAD scheduler so the timing is tight (plain
  // setTimeout jitter would smear a melody into mush - which is what made the
  // previous formless pad read as "just noise"). Still fully synthesized: no
  // audio file to license, stream, or fail to load, and it ducks under the
  // peel/place SFX so it stays a background.
  var MUSIC_LEVEL = 0.19;
  var BPM = 92;
  var STEP_DUR = (60 / BPM) / 2;   // eighth-note grid
  var STEPS_PER_BAR = 8;

  var CHORD_NOTES = {
    C:  ['C4', 'E4', 'G4'],
    G:  ['G3', 'B3', 'D4'],
    Am: ['A3', 'C4', 'E4'],
    F:  ['F3', 'A3', 'C4'],
    Em: ['E3', 'G3', 'B3'],
    Dm: ['D3', 'F3', 'A3']
  };
  //  I     V     vi    IV    | I    V    IV   V     (phrase A)
  //  vi    IV    I     V     | IV   I    ii7  V     (phrase B)
  var CHORD_BARS = ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G',
                    'Am', 'F', 'C', 'G', 'F', 'C', 'Dm', 'G'];
  var BASS_BARS  = ['C2', 'G2', 'A2', 'F2', 'C2', 'G2', 'F2', 'G2',
                    'A2', 'F2', 'C2', 'G2', 'F2', 'C2', 'D3', 'G2'];
  // 8 eighth-notes per bar; '.' = rest/sustain. All notes are chord tones or
  // gentle passing tones, so the tune stays consonant and hummable.
  var MELODY_BARS = [
    'E4 . G4 . C5 . G4 .',   // C
    'D5 . B4 . G4 . . .',    // G
    'C5 . E5 . A4 . C5 .',   // Am
    'A4 . F4 . A4 . . .',    // F
    'E5 . D5 C5 . G4 . .',   // C
    'D5 . B4 . D5 . . .',    // G
    'C5 . A4 . F4 . A4 .',   // F
    'B4 . D5 . G4 . . .',    // G
    'A4 . C5 . E5 . C5 .',   // Am
    'F5 . E5 . C5 . A4 .',   // F
    'G4 . C5 . E5 . G5 .',   // C
    'D5 . B4 . G4 . D5 .',   // G
    'C5 . A4 . F4 . C5 .',   // F
    'E5 . G4 . C5 . E5 .',   // C
    'F4 . A4 . D5 . F5 .',   // Dm
    'D5 . B4 . G4 . . .'     // G (turnaround)
  ];
  var MELODY = MELODY_BARS.join(' ').trim().split(/\s+/);
  var TOTAL_STEPS = CHORD_BARS.length * STEPS_PER_BAR;

  var NOTE_SEMI = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  function noteFreq(name) {
    var m = /^([A-G]#?)(\d)$/.exec(name);
    if (!m) return 0;
    var midi = NOTE_SEMI[m[1]] + (parseInt(m[2], 10) + 1) * 12; // C4 -> 60
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  var music = null;

  function startMusic() {
    ensureContext();
    if (!ctx || music) return;
    var g = ctx.createGain();
    g.gain.value = 0.0001;
    // A gentle master low-pass keeps the tune warm/lo-fi so it never gets
    // glassy or fights the crisp SFX.
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 5000;
    g.connect(lp); lp.connect(master);
    g.gain.setTargetAtTime(MUSIC_LEVEL, now(), 1.4); // fade in
    music = { gain: g, step: 0, nextTime: ctx.currentTime + 0.15, timer: null };
    scheduler();
  }

  // Lookahead scheduler: schedule any notes falling within the next ~120ms,
  // then check again in 25ms. Web Audio plays each note at a precise
  // ctx.currentTime, immune to setTimeout jitter.
  function scheduler() {
    if (!music) return;
    // Resync if the clock jumped (tab/ad pause froze ctx.currentTime) so we
    // don't dump a burst of catch-up notes on resume.
    if (music.nextTime < ctx.currentTime - 0.3) music.nextTime = ctx.currentTime + 0.05;
    while (music.nextTime < ctx.currentTime + 0.12) {
      playStep(music.step, music.nextTime);
      music.step = (music.step + 1) % TOTAL_STEPS;
      music.nextTime += STEP_DUR;
    }
    music.timer = window.setTimeout(scheduler, 25);
  }

  function playStep(step, t) {
    var bar = Math.floor(step / STEPS_PER_BAR);
    var inBar = step % STEPS_PER_BAR;

    // Lead melody: a music-box-ish pluck that rings out via its release tail,
    // with a soft octave shimmer on top for sparkle.
    var tok = MELODY[step];
    if (tok && tok !== '.') {
      var f = noteFreq(tok);
      musicVoice(f, t, STEP_DUR * 1.1, { type: 'triangle', gain: 0.26, attack: 0.005, release: 0.55, detune: 0.004 });
      musicVoice(f * 2, t, STEP_DUR * 0.5, { type: 'sine', gain: 0.05, attack: 0.005, release: 0.25 });
    }

    // Soft pad chord, once per bar, sustained across the bar.
    if (inBar === 0) {
      var barLen = STEP_DUR * STEPS_PER_BAR;
      CHORD_NOTES[CHORD_BARS[bar]].forEach(function (n) {
        musicVoice(noteFreq(n), t, barLen * 0.9, { type: 'sine', gain: 0.05, attack: 0.09, release: 0.4 });
      });
    }

    // Warm bass + soft kick on beats 1 and 3.
    if (inBar === 0 || inBar === 4) {
      musicVoice(noteFreq(BASS_BARS[bar]), t, STEP_DUR * 1.6, { type: 'triangle', gain: 0.16, attack: 0.01, release: 0.22 });
      musicKick(t);
    }
    // Gentle lo-fi hat tick on the off-beats for a light groove.
    if (inBar === 2 || inBar === 6) musicHat(t);
  }

  function musicVoice(freq, time, dur, o) {
    if (!freq || !music) return;
    var end = time + dur + (o.release || 0.2);
    var osc = ctx.createOscillator();
    osc.type = o.type || 'triangle';
    osc.frequency.value = freq;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(o.gain, time + (o.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(g); g.connect(music.gain);
    osc.start(time); osc.stop(end + 0.05);
    if (o.detune) { // subtle chorus width on the lead
      var osc2 = ctx.createOscillator();
      osc2.type = osc.type; osc2.frequency.value = freq * (1 + o.detune);
      var g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.0001, time);
      g2.gain.exponentialRampToValueAtTime(o.gain * 0.55, time + (o.attack || 0.01));
      g2.gain.exponentialRampToValueAtTime(0.0001, end);
      osc2.connect(g2); g2.connect(music.gain);
      osc2.start(time); osc2.stop(end + 0.05);
    }
  }

  function musicKick(time) {
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.12);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.16, time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);
    osc.connect(g); g.connect(music.gain);
    osc.start(time); osc.stop(time + 0.24);
  }

  function musicHat(time) {
    if (!noiseBuffer) return;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    var hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7500;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.028, time + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    src.connect(hp); hp.connect(g); g.connect(music.gain);
    src.start(time); src.stop(time + 0.06);
  }

  function stopMusic() {
    if (!music) return;
    var m = music;
    music = null;
    window.clearTimeout(m.timer);
    m.gain.gain.setTargetAtTime(0.0001, now(), 0.4);
    window.setTimeout(function () { try { m.gain.disconnect(); } catch (e) { /* already gone */ } }, 1200);
  }

  return {
    resume: resume,
    setMuted: setMuted,
    startMusic: startMusic,
    stopMusic: stopMusic,
    startCrinkle: startCrinkle,
    updateCrinkle: updateCrinkle,
    stopCrinkle: stopCrinkle,
    playLift: playLift,
    playThock: playThock,
    playChime: playChime,
    playPerfect: playPerfect,
    playPeelRelease: playPeelRelease,
    playWrong: playWrong,
    playSceneComplete: playSceneComplete,
    pauseForAd: pauseForAd,
    resumeAfterAd: resumeAfterAd
  };
})();
