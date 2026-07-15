window.PeelIt = window.PeelIt || {};

/*
 * game.js - main loop, state machine, input, layout and rendering.
 *
 * Design-space canvas is fixed at 720x1280 (9:16 portrait). Everything is
 * drawn in that coordinate space; resize() only changes how it's scaled
 * onto the real screen (letterboxing), so gameplay math never needs to
 * know about the device's actual resolution.
 */
PeelIt.Game = (function () {
  'use strict';

  var DESIGN_W = 720, DESIGN_H = 1280;
  var SCENE_RECT = { x: 40, y: 150, w: 640, h: 740 };
  // Tray grew (was y:960 h:260) and starts right below the scene (y+h = 890)
  // so a two-row grid has room. 900+340 = 1240, clear of the 1280 canvas.
  var TRAY_RECT = { x: 20, y: 900, w: 680, h: 340 };

  // Tray layout. Sticker `size` runs up to 220 design px, but a level has up
  // to six of them. Cramming six across a 680px tray forced each into a
  // ~107px slot, so they overlapped by 39-53% on EVERY level - which is what
  // Playgama's moderation team saw as "details overlap each other... some
  // elements are poorly visible".
  //
  // Fix has two halves:
  //  1. A grid of at most TRAY_MAX_PER_ROW pieces per row, so six pieces sit
  //     3x2 instead of 6x1. This roughly doubles each slot's width.
  //  2. Each piece is DRAWN scaled to fit its slot (trayScale) and pops back
  //     to full size the instant it's picked up (Sticker.startDrag).
  //
  // Row-wrapping matters: single-row + scaling alone fits, but squeezes a
  // 220px piece to 0.41 scale - separated, yet an illegible grey blob, which
  // just trades one half of the reviewer's complaint for the other. The 3x2
  // grid lifts that worst case to 0.69. TRAY_SLOT_GAP is the guaranteed clear
  // channel between two neighbouring pieces' drawn footprints.
  var TRAY_USABLE_FRAC = 0.94;
  var TRAY_SLOT_GAP = 18;
  var TRAY_MAX_PER_ROW = 3;
  var trayCellSize = 150; // drawn footprint budget per slot, set by layoutTray

  var canvas, ctx, frame;
  var lastTs = 0, time = 0;
  var dpr = 1;

  var gameState = 'boot'; // boot | select | playing | complete
  var currentLevelIndex = 0;
  var currentLevel = null;
  var stickers = []; // Sticker instances for the active level
  var placedCount = 0;
  var activeDrag = null;
  var lastPointerPos = null;
  var hintActive = false; // first-level onboarding tutorial only
  var adHintActive = false; // player-requested hint, unlocked by watching a rewarded ad
  var parallax = { x: 0, y: 0 };
  var completeT = 0;
  var completePanelShown = false;
  var confettiPalette = ['#FF8FB3', '#FFD8A8', '#8FB3FF', '#B7F0C1', '#FFF3B0'];
  var levelsCompletedCount = 0; // drives the every-3rd-level interstitial cadence
  var combo = 0;        // consecutive accurate placements (drives escalating reward)
  var popups = [];      // floating "Perfect!" / "Combo xN" canvas labels

  // ---- DOM references ---------------------------------------------------
  var el = {};

  function cacheDom() {
    el.frame = document.getElementById('frame');
    el.canvas = document.getElementById('game-canvas');
    el.muteBtn = document.getElementById('mute-btn');
    el.selectScreen = document.getElementById('screen-select');
    el.levelGrid = document.getElementById('level-grid');
    el.completeScreen = document.getElementById('screen-complete');
    el.completeTitle = document.getElementById('complete-title');
    el.completeStars = document.getElementById('complete-stars');
    el.nextBtn = document.getElementById('next-btn');
    el.replayBtn = document.getElementById('replay-btn');
    el.menuBtn = document.getElementById('menu-btn');
    el.foilBtn = document.getElementById('foil-btn');
    el.topBar = document.getElementById('top-bar');
    el.levelName = document.getElementById('level-name');
    el.backBtn = document.getElementById('back-btn');
    el.hintBtn = document.getElementById('hint-btn');
    el.hintBadge = document.getElementById('hint-badge');
    el.hintTip = document.getElementById('hint-tip');
    el.foilLabel = document.getElementById('foil-label');
    el.foilBadge = document.getElementById('foil-badge');
    el.refThumb = document.getElementById('ref-thumb');
    el.albumBtn = document.getElementById('album-btn');
    el.albumScreen = document.getElementById('screen-album');
    el.albumBackBtn = document.getElementById('album-back-btn');
    el.confirmOverlay = document.getElementById('confirm-overlay');
    el.confirmText = document.getElementById('confirm-text');
    el.confirmYes = document.getElementById('confirm-yes');
    el.confirmNo = document.getElementById('confirm-no');
  }

  // ---- bootstrap ----------------------------------------------------------
  function init() {
    cacheDom();
    canvas = el.canvas;
    ctx = canvas.getContext('2d');
    frame = el.frame;

    wireUi();
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    // 'load' fires after the embedding viewport is definitely established -
    // catches hosts that report a 0-size window on our first synchronous
    // resize() (which would otherwise letterbox the game to nothing until
    // some later event happened to fire).
    window.addEventListener('load', resize);
    // ResizeObserver as a second, independent detection path: some
    // hosting/embedding techniques (e.g. a platform's own "scale test"
    // resizing our iframe via a CSS transform, or certain iframe embeds
    // generally) don't reliably fire a window 'resize' event inside our own
    // document even though our visible box size changed - that leaves the
    // frame letterboxed for a stale size, reading as "shifted or cropped".
    // ResizeObserver watches the actual rendered box directly regardless of
    // what triggered the change, so it fires in cases 'resize' can miss.
    if (window.ResizeObserver) {
      new ResizeObserver(resize).observe(document.body);
    }
    // Also recheck on visibility change: an iframe resized while
    // backgrounded/hidden may not have dispatched anything we caught.
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) resize();
    });
    // Retry sizing over the next few ticks in case the very first
    // measurement came back 0 (observed on some embedded/iframe hosts) -
    // resize() is a no-op once already correctly sized.
    requestAnimationFrame(resize);
    setTimeout(resize, 60);
    setTimeout(resize, 250);

    // Fast first paint: show the menu and start the render loop IMMEDIATELY,
    // running on safe default progress. Do NOT gate the first frame on the
    // platform SDK handshake - bridge.initialize() can take up to its 3s
    // timeout, and blocking on it is what made the game feel slow to load
    // (a blank frame until the bridge answered). The real save fills in
    // unlocked levels/stars a moment later and the grid refreshes then.
    showLevelSelect();
    requestAnimationFrame(tick);

    PeelIt.SDK.init(function () {
      // Signal game_ready as soon as the bridge is up. The menu is ALREADY
      // rendered and interactive at this point (see the fast-first-paint note
      // above), so this genuinely is the first playable frame. It must NOT wait
      // on Save.load() - storage can stall for seconds (there's a 4s timeout on
      // it), and gating game_ready behind that is what previously left
      // moderation staring at a "waiting for Game Ready" screen.
      PeelIt.SDK.gameReady();

      PeelIt.Save.load(function () {
        PeelIt.Audio.setMuted(PeelIt.Save.get().muted);
        updateMuteBtn();
        buildLevelGrid(); // refresh now that real unlock/stars are known
      });
    });
  }

  function wireUi() {
    el.muteBtn.addEventListener('click', function () {
      var muted = PeelIt.Save.toggleMute();
      PeelIt.Audio.setMuted(muted);
      updateMuteBtn();
    });
    el.backBtn.addEventListener('click', showLevelSelect);
    el.menuBtn.addEventListener('click', function () { maybeShowInterstitialThen(showLevelSelect); });
    el.replayBtn.addEventListener('click', function () { startLevel(currentLevelIndex); });
    el.nextBtn.addEventListener('click', function () {
      maybeShowInterstitialThen(function () {
        if (currentLevelIndex + 1 < PeelIt.Levels.count()) {
          startLevel(currentLevelIndex + 1);
        } else {
          showLevelSelect();
        }
      });
    });
    el.foilBtn.addEventListener('click', onFoilBtnClick);
    el.hintBtn.addEventListener('click', onHintBtnClick);
    el.albumBtn.addEventListener('click', showAlbum);
    el.albumBackBtn.addEventListener('click', showLevelSelect);
    el.confirmYes.addEventListener('click', function () {
      var cb = pendingConfirm; hideConfirm(); if (cb) cb();
    });
    el.confirmNo.addEventListener('click', hideConfirm);

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
  }

  function updateMuteBtn() {
    el.muteBtn.textContent = PeelIt.Save.get().muted ? '🔇' : '🔊';
  }

  // ---- responsive letterboxing -------------------------------------------
  // Reference CSS width the DOM overlay's hand-tuned px values (font-sizes,
  // padding, gaps in style.css) were eyeballed against - a typical mobile
  // portrait width. The canvas game content always scales correctly (fixed
  // 720x1280 design space, redrawn every frame), but the DOM overlay
  // (top bar, level-select screen, complete screen) is real HTML/CSS with
  // those fixed px values - on any #frame size far from this reference,
  // they'd overlap/overflow instead of scaling with the frame. Confirmed
  // via a real Playgama review report: "UI is stretched and overlaps with
  // itself... unreadable and blend together." Fix: drive the root font-size
  // proportionally to the actual frame width and express every DOM overlay
  // size in rem (see style.css) so the whole overlay scales in lockstep
  // with the canvas instead of staying visually fixed-size.
  var UI_REFERENCE_W = 400;
  function resize() {
    // Prefer the documentElement's client box, falling back to window.inner*.
    // Some embedded/iframe hosts momentarily report window.innerWidth/Height
    // as 0 on the first measurement; sizing to that collapses the whole game
    // to a 0x0 (blank) frame. Bail until a real, non-trivial size is known -
    // one of the retry hooks in init() will call back once layout settles.
    var maxW = window.innerWidth || document.documentElement.clientWidth || 0;
    var maxH = window.innerHeight || document.documentElement.clientHeight || 0;
    if (maxW < 2 || maxH < 2) return;
    var scale = Math.min(maxW / DESIGN_W, maxH / DESIGN_H);
    var cssW = Math.floor(DESIGN_W * scale);
    var cssH = Math.floor(DESIGN_H * scale);

    frame.style.width = cssW + 'px';
    frame.style.height = cssH + 'px';
    document.documentElement.style.fontSize = (16 * cssW / UI_REFERENCE_W) + 'px';

    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(DESIGN_W * dpr);
    canvas.height = Math.floor(DESIGN_H * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    positionFirstHintTip(); // keep the coach-mark aligned to the button
  }

  function toDesignCoords(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (DESIGN_W / rect.width),
      y: (clientY - rect.top) * (DESIGN_H / rect.height)
    };
  }

  // ---- level select screen ------------------------------------------------
  function showLevelSelect() {
    // Bailing out of a level mid-play still ends the active-play period.
    // (On level completion, triggerLevelComplete already sent this.)
    if (gameState === 'playing') PeelIt.SDK.gameplayStopped();
    gameState = 'select';
    hideFirstHintTip();
    el.selectScreen.classList.add('visible');
    el.completeScreen.classList.remove('visible');
    el.albumScreen.classList.remove('visible');
    el.topBar.classList.remove('visible');
    buildLevelGrid();
  }

  // The album is a full-screen DOM overlay on top of the idle canvas, so
  // gameState stays 'select' (the canvas keeps painting its calm menu
  // background behind it) - no new game state needed.
  function showAlbum() {
    PeelIt.Album.build();
    el.selectScreen.classList.remove('visible');
    el.albumScreen.classList.add('visible');
  }

  function buildLevelGrid() {
    var save = PeelIt.Save.get();
    el.levelGrid.innerHTML = '';
    PeelIt.Levels.LEVELS.forEach(function (lvl, i) {
      var locked = i > save.unlockedIndex;
      var card = document.createElement('button');
      card.className = 'level-card' + (locked ? ' locked' : '');
      card.disabled = locked;

      if (locked) {
        var thumb = document.createElement('div');
        thumb.className = 'level-thumb locked-thumb';
        thumb.style.background = 'linear-gradient(160deg,' + lvl.bg.top + ',' + lvl.bg.bottom + ')';
        thumb.textContent = '🔒';
        card.appendChild(thumb);
      } else {
        // Show the actual finished picture on the card, so players know what
        // they're about to build (and see the curated art up front).
        var thumbC = document.createElement('canvas');
        thumbC.className = 'level-thumb';
        card.appendChild(thumbC);
        renderThumbCanvas(thumbC, lvl, 240, 22, PeelIt.Save.hasFoil(lvl.id));
      }

      var label = document.createElement('div');
      label.className = 'level-label';
      label.textContent = lvl.name;
      card.appendChild(label);

      var stars = document.createElement('div');
      stars.className = 'level-stars';
      var earned = save.stars[lvl.id] || 0;
      for (var s = 0; s < 3; s++) {
        stars.appendChild(makeStarSpan(s < earned));
      }
      card.appendChild(stars);

      if (!locked) card.addEventListener('click', function () { startLevel(i); });
      el.levelGrid.appendChild(card);
    });
  }

  // Render a level's finished picture into a square canvas (menu cards + the
  // top-bar reference). Uses the shared solved-picture renderer so every
  // thumbnail is a faithful miniature of the assembled art.
  function renderThumbCanvas(canvas, level, px, radius, foil) {
    var d = window.devicePixelRatio || 1;
    canvas.width = px * d;
    canvas.height = px * d;
    var c = canvas.getContext('2d');
    c.setTransform(d, 0, 0, d, 0, 0);
    PeelIt.SceneRender.drawSolved(c, level, px, px, {
      background: true, radius: radius, foil: !!foil
    });
  }

  function updateRefThumb() {
    if (!el.refThumb || !currentLevel) return;
    renderThumbCanvas(el.refThumb, currentLevel, 132, 16, PeelIt.Save.hasFoil(currentLevel.id));
  }

  function makeStarSpan(filled) {
    var s = document.createElement('span');
    s.className = 'star' + (filled ? ' filled' : '');
    s.textContent = '★';
    return s;
  }

  // ---- level lifecycle ------------------------------------------------------
  function startLevel(index) {
    // startLevel is always reached from a click handler (level card / replay /
    // next), so we're inside a user gesture here - the right moment to unlock
    // the AudioContext and bring up the ambient music bed (autoplay policies
    // require a gesture; the DOM click that got us here counts).
    PeelIt.Audio.resume();
    PeelIt.Audio.startMusic();

    currentLevelIndex = index;
    currentLevel = PeelIt.Levels.get(index);
    placedCount = 0;
    activeDrag = null;
    completeT = 0;
    completePanelShown = false;
    combo = 0;
    popups.length = 0;
    parallax.x = 0; parallax.y = 0;

    stickers = currentLevel.stickers.map(function (def) {
      var s = new PeelIt.Sticker.Sticker(def, currentLevel.id);
      s.targetX = SCENE_RECT.x + def.tx * SCENE_RECT.w;
      s.targetY = SCENE_RECT.y + def.ty * SCENE_RECT.h;
      s.foil = PeelIt.Save.hasFoil(currentLevel.id);
      return s;
    }).sort(function (a, b) { return a.z - b.z; });

    layoutTray();

    PeelIt.Particles.clear();

    hintActive = (index === 0 && !PeelIt.Save.get().seenHint);
    adHintActive = false;
    // On the very first onboarding hint, point the player at the hint button
    // with a small "Need a hint? Tap here" label so they learn what it does.
    if (hintActive) showFirstHintTip(); else hideFirstHintTip();

    gameState = 'playing';
    el.selectScreen.classList.remove('visible');
    el.completeScreen.classList.remove('visible');
    el.topBar.classList.add('visible');
    el.levelName.textContent = currentLevel.name;
    updateRefThumb();

    PeelIt.SDK.levelStarted(currentLevel.id);
    PeelIt.SDK.gameplayStarted(); // active play begins (Poki/CrazyGames need this)
  }

  // Re-run on level start AND after every successful placement, so the slots
  // widen as the tray empties and the remaining pieces grow back toward full
  // size. Because slot pitch only ever increases as `count` drops, trayScale
  // only ever increases too - overlap can never reappear mid-level.
  // Lays the untaken pieces out as a centered grid of at most
  // TRAY_MAX_PER_ROW per row, each drawn shrunk to fit its cell.
  //
  // Re-run on level start AND after every successful placement, so the grid
  // reflows as the tray empties. Fewer pieces means fewer rows and wider
  // cells, so trayScale only ever grows - the remaining pieces swell back
  // toward full size and overlap can never reappear mid-level.
  function layoutTray() {
    var resting = stickers.filter(function (s) { return s.state === 'tray'; });
    var count = resting.length;
    if (count === 0) return;

    var rows = Math.ceil(count / TRAY_MAX_PER_ROW);
    var perRow = Math.ceil(count / rows); // balance rows (5 -> 3+2, not 3+1+1)
    var slotW = (TRAY_RECT.w * TRAY_USABLE_FRAC) / perRow;
    var slotH = TRAY_RECT.h / rows;
    // A piece must fit its cell in BOTH axes; the tighter one governs.
    trayCellSize = Math.min(slotW, slotH) - TRAY_SLOT_GAP;

    resting.forEach(function (s, i) {
      var row = Math.floor(i / perRow);
      var col = i - row * perRow;
      // Last row may be short - center it on its own.
      var inThisRow = Math.min(perRow, count - row * perRow);
      var rowW = slotW * inThisRow;
      var startX = TRAY_RECT.x + (TRAY_RECT.w - rowW) / 2 + slotW / 2;

      s.trayX = startX + col * slotW;
      s.trayY = TRAY_RECT.y + slotH * (row + 0.5);
      // Shrink to fit the cell, but never magnify a small piece past its
      // authored size (a 50px candle flame must stay 50px).
      s.trayScale = Math.min(1, trayCellSize / s.size);
    });
  }

  // Radius of the grabbable circle around a tray sticker. Keyed to what is
  // actually DRAWN (size * trayScale), not the authored size - and capped to
  // half the cell so a tap can never land inside two neighbouring pieces'
  // hit circles at once, in either axis.
  function trayGrabRadius(s) {
    return Math.min(s.size * s.trayScale * 0.5, trayCellSize * 0.5);
  }

  function minUnplacedZ() {
    var z = Infinity;
    stickers.forEach(function (s) {
      if (s.state === 'tray' || s.state === 'dragging' || s.state === 'returning') {
        z = Math.min(z, s.z);
      }
    });
    return z;
  }

  // ---- input --------------------------------------------------------------
  function onPointerDown(e) {
    if (paused) return; // an ad is on screen - gameplay is frozen
    PeelIt.Audio.resume();
    if (gameState !== 'playing') return;
    if (activeDrag) return;

    var p = toDesignCoords(e.clientX, e.clientY);
    var activeZ = minUnplacedZ();

    var best = null, bestDist = Infinity;
    stickers.forEach(function (s) {
      if (s.state !== 'tray' || s.z !== activeZ) return;
      var d = Math.hypot(p.x - s.trayX, p.y - s.trayY);
      if (d < trayGrabRadius(s) && d < bestDist) { best = s; bestDist = d; }
    });

    if (best) {
      // Only dismiss the tutorial once the player actually grabs a sticker -
      // a miss-tap elsewhere on the canvas should not cancel the lesson.
      if (hintActive) {
        hintActive = false;
        PeelIt.Save.markHintSeen();
        hideFirstHintTip();
      }
      // Only one sticker is ever grabbable at a time (the z-gated check
      // above), so grabbing anything here IS grabbing the hinted sticker.
      adHintActive = false;
      canvas.setPointerCapture(e.pointerId);
      activeDrag = best;
      best.startDrag(p.x, p.y);
      best.peeledOff = false; // arm the "fully peeled" cue for this drag
      lastPointerPos = p;
      PeelIt.Audio.playLift();
      PeelIt.Audio.startCrinkle();
      vibrate(6); // subtle tick as the sticker starts peeling off the sheet
    }
  }

  function onPointerMove(e) {
    if (!activeDrag) return;
    var p = toDesignCoords(e.clientX, e.clientY);
    var dt = 1 / 60; // frame-scale estimate; smooths speed without needing timestamps per event
    var speed = activeDrag.dragTo(p.x, p.y, dt);
    var speed01 = Math.min(1, speed / 2500);
    PeelIt.Audio.updateCrinkle(speed01, dt);

    // The instant the sticker fully lifts off the backing sheet: a soft airy
    // pop + haptic tick makes peeling a discrete, satisfying beat (the game's
    // signature ASMR moment) instead of an undifferentiated drag.
    if (!activeDrag.peeledOff && activeDrag.peel >= 0.85) {
      activeDrag.peeledOff = true;
      PeelIt.Audio.playPeelRelease();
      vibrate(12);
    }

    parallax.x = ((p.x - DESIGN_W / 2) / DESIGN_W) * 10;
    parallax.y = ((p.y - SCENE_RECT.y - SCENE_RECT.h / 2) / SCENE_RECT.h) * 6;

    lastPointerPos = p;
  }

  function onPointerUp() {
    if (!activeDrag) return;
    PeelIt.Audio.stopCrinkle();
    var dragged = activeDrag;
    activeDrag = null;
    parallax.x = 0; parallax.y = 0;

    var p = { x: dragged.x, y: dragged.y };
    var matches = [];
    stickers.forEach(function (s) {
      if (s.state === 'placed' || s.state === 'settling') return;
      var d = Math.hypot(p.x - s.targetX, p.y - s.targetY);
      if (d <= s.snapRadius()) matches.push({ s: s, d: d });
    });
    matches.sort(function (a, b) { return a.d - b.d; });

    if (matches.length && matches[0].s === dragged) {
      dragged.dropDistance = matches[0].d;
      dragged.place();
      placedCount++;
      PeelIt.Audio.playThock();

      // Accuracy drives the reward: a near-dead-center drop is "perfect" and
      // builds a combo (escalating chime + sparkles + label); a loose-but-valid
      // drop still counts but resets the combo. This rewards deliberate,
      // careful play - the hand-tuned game-feel the review asked for.
      var acc = dragged.dropDistance / dragged.snapRadius(); // 0 = dead center
      if (acc < 0.22) {
        combo++;
        PeelIt.Audio.playChime(Math.min(9, placedCount - 1 + combo));
        PeelIt.Audio.playPerfect();
        for (var i = 0; i < 7; i++) {
          PeelIt.Particles.sparkle(
            dragged.targetX + (Math.random() - 0.5) * dragged.size * 0.5,
            dragged.targetY + (Math.random() - 0.5) * dragged.size * 0.5,
            '#FFD54A'
          );
        }
        addPopup(combo >= 2 ? 'Perfect x' + combo : 'Perfect!',
          dragged.targetX, dragged.targetY - dragged.size * 0.55, '#FF9F1C');
        vibrate([8, 18, 8]);
      } else {
        if (acc < 0.55) {
          combo++;
          if (combo >= 3) addPopup('Combo x' + combo,
            dragged.targetX, dragged.targetY - dragged.size * 0.55, '#3DBE7A');
        } else {
          combo = 0;
        }
        PeelIt.Audio.playChime(placedCount - 1);
        vibrate(15);
      }

      PeelIt.Particles.burst(dragged.targetX, dragged.targetY, dragged.color);
      layoutTray();
      if (placedCount >= stickers.length) triggerLevelComplete();
    } else if (matches.length) {
      combo = 0;
      dragged.returnToTray(true);
      PeelIt.Audio.playWrong();
      vibrate([10, 30, 10]);
    } else {
      dragged.returnToTray(false);
    }
  }

  function vibrate(pattern) {
    if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) { /* unsupported */ } }
  }

  // ---- ad / platform pause --------------------------------------------
  // Playgama requires gameplay (not just sound) to be paused while a
  // full-screen ad is on screen, and the game state preserved afterwards.
  // update() bails while paused, so the board freezes exactly as it was;
  // render() still runs, so the last frame stays on screen. Called by
  // sdk.js around every ad, and idempotent so a duplicate platform
  // pause event is harmless.
  var paused = false;
  function setPaused(value) {
    value = !!value;
    if (value === paused) return;
    paused = value;
    if (paused && activeDrag) {
      // Don't strand a half-peeled sticker under the ad overlay - send it home
      // (state is preserved; the player just re-grabs it afterwards).
      PeelIt.Audio.stopCrinkle();
      activeDrag.returnToTray(false);
      activeDrag = null;
    }
  }

  // ---- floating reward labels (game feel) ------------------------------
  function addPopup(text, x, y, color) {
    popups.push({ text: text, x: x, y: y, t: 0, life: 1.0, color: color || '#fff' });
    if (popups.length > 10) popups.shift();
  }

  function updatePopups(dt) {
    for (var i = popups.length - 1; i >= 0; i--) {
      var p = popups[i];
      p.t += dt;
      p.y -= 34 * dt;
      if (p.t >= p.life) popups.splice(i, 1);
    }
  }

  function renderPopups() {
    for (var i = 0; i < popups.length; i++) {
      var p = popups[i];
      var k = p.t / p.life;
      var a = k < 0.18 ? k / 0.18 : 1 - (k - 0.18) / 0.82;
      var pop = k < 0.18 ? 0.6 + 0.4 * (k / 0.18) : 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.translate(p.x, p.y);
      ctx.scale(pop, pop);
      ctx.font = '800 46px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 7;
      ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
  }

  // ---- level complete -------------------------------------------------------
  function triggerLevelComplete() {
    gameState = 'complete';
    completeT = 0;
    completePanelShown = false;

    var totalRatio = 0;
    stickers.forEach(function (s) {
      var r = s.dropDistance != null ? s.dropDistance / s.snapRadius() : 0;
      totalRatio += r;
    });
    var avgRatio = totalRatio / stickers.length;
    var stars = avgRatio <= 0.35 ? 3 : (avgRatio <= 0.65 ? 2 : 1);

    PeelIt.Save.setStars(currentLevel.id, stars);
    PeelIt.Save.unlockNext(Math.min(currentLevelIndex + 1, PeelIt.Levels.count() - 1));
    PeelIt.SDK.levelComplete(currentLevel.id);
    PeelIt.SDK.gameplayStopped(); // active play ends here (before any ad)
    levelsCompletedCount++;

    PeelIt.Audio.playSceneComplete();
    PeelIt.Particles.confetti(DESIGN_W, DESIGN_H, confettiPalette);

    pendingStars = stars;
  }

  var pendingStars = 3;

  // Interstitial cadence: every 3rd level completion, shown only at a
  // natural breakpoint (leaving the complete screen), never at game start -
  // see the doc note on PeelIt.SDK.showInterstitialAd in sdk.js. Bridge
  // itself also enforces bridge.advertisement.minimumDelayBetweenInterstitial
  // (default 60s) as a hard floor; a 3-level cadence at this game's ~60-120s
  // per-level session length comfortably clears that on its own, so it's
  // left at the default rather than tuned explicitly.
  var interstitialInFlight = false;
  function maybeShowInterstitialThen(next) {
    if (interstitialInFlight) return; // guard against a rapid double-click
    if (levelsCompletedCount > 0 && levelsCompletedCount % 3 === 0) {
      interstitialInFlight = true;
      PeelIt.SDK.showInterstitialAd(function () {
        interstitialInFlight = false;
        next();
      });
    } else {
      next();
    }
  }

  function showCompletePanel() {
    completePanelShown = true;
    el.completeTitle.textContent = currentLevel.name + ' complete!';
    el.completeStars.innerHTML = '';
    var starEls = [];
    for (var i = 0; i < 3; i++) {
      var sp = makeStarSpan(false);
      el.completeStars.appendChild(sp);
      starEls.push(sp);
    }
    var isLast = currentLevelIndex + 1 >= PeelIt.Levels.count();
    el.nextBtn.textContent = isLast ? 'See levels' : 'Next →';
    updateFoilBtn();
    el.completeScreen.classList.add('visible');

    // Pop the earned stars in one at a time with an ascending chime - a small
    // dopamine beat that makes the reward feel earned instead of instant.
    for (var j = 0; j < pendingStars; j++) {
      (function (idx) {
        window.setTimeout(function () {
          starEls[idx].classList.add('filled', 'pop');
          PeelIt.Audio.playChime(idx + 3);
        }, 260 + idx * 280);
      })(j);
    }
  }

  function updateFoilBtn() {
    if (PeelIt.Save.hasFoil(currentLevel.id)) {
      el.foilLabel.textContent = '✨ Foil pack unlocked';
      el.foilBadge.style.display = 'none'; // no longer an ad cost
      el.foilBtn.classList.add('unlocked');
      el.foilBtn.disabled = true;
    } else {
      el.foilLabel.textContent = '✨ Unlock foil pack';
      el.foilBadge.style.display = '';
      el.foilBtn.classList.remove('unlocked');
      el.foilBtn.disabled = false;
    }
  }

  // Rewarded-ad cosmetic: watching an ad unlocks a permanent metallic
  // shimmer sweep (see Sticker.prototype.draw's `if (this.foil)` branch)
  // on every sticker in this level, retroactively applied to the already-
  // placed stickers so the payoff is visible immediately.
  function onFoilBtnClick() {
    if (PeelIt.Save.hasFoil(currentLevel.id) || el.foilBtn.disabled) return;
    // Playgama requires the call-to-action to state plainly that an ad will
    // play AND name the reward before the ad starts - the AD badge plus this
    // explicit opt-in dialog cover both.
    showConfirm('Watch a short ad to unlock the foil pack?', function () {
      el.foilBtn.disabled = true;
      PeelIt.SDK.showRewardedAd(PeelIt.SDK.PLACEMENTS.foil, function () {
        PeelIt.Save.setFoil(currentLevel.id);
        stickers.forEach(function (s) { s.foil = true; });
        PeelIt.Audio.playChime(4);
        for (var i = 0; i < 8; i++) {
          PeelIt.Particles.sparkle(
            SCENE_RECT.x + Math.random() * SCENE_RECT.w,
            SCENE_RECT.y + Math.random() * SCENE_RECT.h,
            '#FFD700'
          );
        }
        updateFoilBtn();
      }, function () {
        el.foilBtn.disabled = false;
      });
    });
  }

  // Player-requested hint: watching a rewarded ad reveals which tray
  // sticker to place next and where, reusing the exact same visual
  // treatment as the first-level onboarding tutorial (see renderHint()) -
  // glow ring on the correct tray piece, pulsing destination outline, and
  // a looping ghost-hand demo. Dismissed the same way the tutorial is:
  // the moment the player actually grabs that sticker (see onPointerDown).
  //
  // EVERY hint is an OPT-IN rewarded ad: tapping the button asks first, then
  // plays the ad, and only reveals the hint once the ad completes (the reward
  // is granted on the 'rewarded' state - see sdk.js). The AD badge on the
  // button makes the cost unmistakable up front, satisfying the review's
  // "hint requires a reward, which is not obvious to players" note.
  // One-time coach-mark under the hint button, so a new player learns the
  // button gives hints. Positioned against the button's real on-screen box so
  // it stays aligned across layouts/orientations. Retired the moment the
  // player uses the button, finishes the first placement, or leaves the level.
  function showFirstHintTip() {
    if (!el.hintTip) return;
    el.hintTip.classList.add('visible');
    positionFirstHintTip();
  }
  function positionFirstHintTip() {
    if (!el.hintTip || !el.hintTip.classList.contains('visible') || !el.hintBtn || !frame) return;
    var hb = el.hintBtn.getBoundingClientRect();
    var fr = frame.getBoundingClientRect();
    if (!hb.width || !fr.width) return; // no layout yet
    el.hintTip.style.left = (hb.left - fr.left + hb.width / 2) + 'px';
    el.hintTip.style.top = (hb.bottom - fr.top + 10) + 'px';
  }
  function hideFirstHintTip() {
    if (el.hintTip) el.hintTip.classList.remove('visible');
  }

  function onHintBtnClick() {
    if (gameState !== 'playing' || adHintActive || el.hintBtn.disabled) return;
    hideFirstHintTip(); // player found the button - retire the onboarding label
    showConfirm('Watch a short ad to reveal the next piece?', function () {
      el.hintBtn.disabled = true;
      // Ad first, hint after: adHintActive is only set in the reward callback,
      // which fires on the 'rewarded' state (i.e. AFTER the ad is watched).
      PeelIt.SDK.showRewardedAd(PeelIt.SDK.PLACEMENTS.hint, function () {
        adHintActive = true;
        el.hintBtn.disabled = false;
      }, function () {
        el.hintBtn.disabled = false;
      });
    });
  }

  // ---- lightweight confirm dialog (rewarded-ad opt-in) -----------------
  var pendingConfirm = null;
  function showConfirm(text, onYes) {
    el.confirmText.textContent = text;
    pendingConfirm = onYes;
    el.confirmOverlay.classList.add('visible');
  }
  function hideConfirm() {
    el.confirmOverlay.classList.remove('visible');
    pendingConfirm = null;
  }

  // ---- update / render loop ---------------------------------------------
  function tick(ts) {
    var dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
    lastTs = ts;
    time += dt;

    update(dt);
    render();

    requestAnimationFrame(tick);
  }

  function update(dt) {
    // Gameplay is frozen while a full-screen ad is up (Playgama requirement).
    // render() keeps drawing the last frame, so state is preserved intact.
    if (paused) return;
    if (gameState === 'playing' || gameState === 'complete') {
      stickers.forEach(function (s) { if (s !== activeDrag) s.update(dt, time); });
    }
    PeelIt.Particles.update(dt);
    updatePopups(dt);

    if (gameState === 'complete') {
      completeT += dt;
      if (completeT >= 1.1 && !completePanelShown) showCompletePanel();
    }
  }

  function render() {
    ctx.clearRect(0, 0, DESIGN_W, DESIGN_H);
    if (gameState === 'select' || gameState === 'boot') {
      renderIdleBackground();
      return;
    }

    var zoom = 1;
    if (gameState === 'complete') {
      var t = Math.min(1, completeT / 1.1);
      zoom = 1 - 0.1 * easeOutCubic(t);
    }

    ctx.save();
    ctx.translate(DESIGN_W / 2, DESIGN_H / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-DESIGN_W / 2, -DESIGN_H / 2);

    renderBackground();
    renderGhostReference();
    renderSceneOutlines();
    renderPlacedStickers();
    renderTray();
    if (activeDrag) activeDrag.draw(ctx);
    if (hintActive || adHintActive) renderHint();
    renderPopups();

    ctx.restore();

    PeelIt.Particles.draw(ctx);

    if (gameState === 'complete') renderShimmer();
  }

  function renderIdleBackground() {
    var g = ctx.createLinearGradient(0, 0, 0, DESIGN_H);
    g.addColorStop(0, '#FDF3FF');
    g.addColorStop(1, '#F1E4FF');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
  }

  function renderBackground() {
    ctx.save();
    ctx.translate(parallax.x, parallax.y);
    var g = ctx.createLinearGradient(0, 0, 0, DESIGN_H);
    g.addColorStop(0, currentLevel.bg.top);
    g.addColorStop(1, currentLevel.bg.bottom);
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, DESIGN_W + 40, DESIGN_H + 40);

    // soft decorative blobs for atmosphere
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = currentLevel.bg.accent;
    [[90, 220, 70], [610, 900, 90], [560, 260, 50]].forEach(function (b) {
      ctx.beginPath();
      ctx.arc(b[0], b[1], b[2], 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Faint, full-color preview of every not-yet-placed piece at its final
  // position, so the player always sees the picture they're building. This is
  // the primary fix for the review's "pieces do not form the overall shape" -
  // the old build showed only dashed outlines, giving no sense of the target
  // image. The next-to-place piece (active z) reads a touch stronger to guide
  // the eye; placed pieces are drawn solid on top by renderPlacedStickers().
  function renderGhostReference() {
    var activeZ = minUnplacedZ();
    stickers.forEach(function (s) {
      if (s.state === 'placed' || s.state === 'settling') return;
      var shape = PeelIt.Sticker.SHAPES[s.shape];
      if (!shape) return;
      ctx.save();
      ctx.globalAlpha = (s.z === activeZ) ? 0.2 : 0.09;
      ctx.translate(s.targetX, s.targetY);
      ctx.rotate(s.targetRot);
      shape.draw(ctx, s.size, s.color);
      ctx.restore();
    });
  }

  function renderSceneOutlines() {
    var activeZ = minUnplacedZ();
    stickers.forEach(function (s) {
      if (s.state === 'placed' || s.state === 'settling') return;
      // Magnetic "you're close" cue: while the dragged piece is inside its snap
      // zone, replace the dim dashed preview with a bright pulsing outline, so
      // the slot reads as pulling the piece home.
      if (s === activeDrag) {
        var d = Math.hypot(s.x - s.targetX, s.y - s.targetY);
        if (d <= s.snapRadius() * 1.25) { renderSnapGlow(s); return; }
      }
      var dimmed = s.z !== activeZ;
      PeelIt.Sticker.drawOutline(ctx, s.shape, s.size, s.targetX, s.targetY, s.targetRot, dimmed);
    });
  }

  function renderSnapGlow(s) {
    var shape = PeelIt.Sticker.SHAPES[s.shape];
    if (!shape) return;
    ctx.save();
    ctx.translate(s.targetX, s.targetY);
    ctx.rotate(s.targetRot);
    shape.outline(ctx, s.size);
    ctx.strokeStyle = 'rgba(255, 200, 87, ' + (0.7 + Math.sin(time * 8) * 0.2) + ')';
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  }

  function renderPlacedStickers() {
    stickers.forEach(function (s) {
      if (s.state === 'placed' || s.state === 'settling') s.draw(ctx);
    });
  }

  function renderTray() {
    var activeZ = minUnplacedZ();
    // Tray backdrop: a soft white scrim separating the tray from the scene.
    // The gradient is anchored to the painted rect (starting TRAY_FADE px
    // ABOVE the band) rather than to the band itself, so the fade finishes
    // before the first row of pieces begins - otherwise the top row sits in
    // the still-transparent part of the ramp and looks unbacked.
    var TRAY_FADE = 40;
    var top = TRAY_RECT.y - TRAY_FADE;
    ctx.save();
    var trayG = ctx.createLinearGradient(0, top, 0, DESIGN_H);
    trayG.addColorStop(0, 'rgba(255,255,255,0.0)');
    trayG.addColorStop(0.12, 'rgba(255,255,255,0.72)');
    trayG.addColorStop(1, 'rgba(255,255,255,0.9)');
    ctx.fillStyle = trayG;
    // Run all the way to the canvas bottom so the taller band never leaves
    // an unpainted strip under the last row.
    ctx.fillRect(0, top, DESIGN_W, DESIGN_H - top);
    ctx.restore();

    stickers.forEach(function (s) {
      if (s === activeDrag) return;
      if (s.state === 'tray' || s.state === 'returning') {
        var locked = s.state === 'tray' && s.z !== activeZ;
        // A slot chip behind every piece so it is always visible on the white
        // scrim - a white piece (e.g. the rainbow's star sparkle) used to be
        // invisible in the tray until you happened to grab it. The grabbable
        // piece gets a warm accent border to call it out.
        drawTraySlot(s.trayX, s.trayY, trayCellSize, !locked);
        if (locked) {
          ctx.save();
          ctx.globalAlpha = 0.45;
          ctx.filter = 'grayscale(0.8)';
          drawTrayPiece(s);
          ctx.restore();
        } else {
          drawTrayPiece(s);
        }
      }
    });
  }

  function trayRoundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Soft raised "slot" behind a tray piece, so any color reads against the
  // white scrim. Grabbable slot = brighter fill + gold border; locked = dim.
  function drawTraySlot(cx, cy, cell, active) {
    var s = cell * 0.98;
    var r = s * 0.24;
    ctx.save();
    ctx.translate(cx, cy);
    trayRoundRect(-s / 2, -s / 2, s, s, r);
    ctx.shadowColor = 'rgba(90, 75, 130, 0.16)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = active ? 'rgba(255, 253, 249, 0.96)' : 'rgba(244, 240, 250, 0.62)';
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    trayRoundRect(-s / 2, -s / 2, s, s, r);
    ctx.lineWidth = active ? 2.5 : 1.5;
    ctx.strokeStyle = active ? 'rgba(255, 200, 87, 0.55)' : 'rgba(120, 105, 150, 0.22)';
    ctx.stroke();
    ctx.restore();
  }

  function drawTrayPiece(s) {
    // Soft drop shadow so even white/light pieces separate from the chip.
    ctx.save();
    ctx.shadowColor = 'rgba(70, 55, 100, 0.30)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    s.draw(ctx);
    ctx.restore();
  }

  // Shared visual for both the first-level onboarding tutorial (hintActive)
  // and the player-requested rewarded-ad hint (adHintActive) - same target
  // sticker logic works for either, since there's always at most one
  // grabbable (z-unlocked) tray sticker at a time. Entirely visual (no
  // text, per design spec): a glow ring calls out which tray sticker to
  // grab, a flowing dashed path + glowing outline show where it goes, and
  // a ghost hand mimes the whole tap-drag-release gesture on a loop until
  // the player performs it themselves.
  function renderHint() {
    var target = null, minZ = minUnplacedZ();
    for (var i = 0; i < stickers.length; i++) {
      if (stickers[i].state === 'tray' && stickers[i].z === minZ) { target = stickers[i]; break; }
    }
    if (!target) return;

    var midX = (target.trayX + target.targetX) / 2;
    var midY = Math.min(target.trayY, target.targetY) - 50;

    // Persistent "grab this one" glow ring around the correct tray sticker.
    // Sized off the DRAWN footprint (size * trayScale), not the authored
    // size, so it hugs the shrunk tray piece instead of engulfing its
    // neighbours.
    var ringPulse = 1 + Math.sin(time * 5) * 0.08;
    ctx.save();
    ctx.translate(target.trayX, target.trayY);
    ctx.scale(ringPulse, ringPulse);
    ctx.beginPath();
    ctx.arc(0, 0, target.size * target.trayScale * 0.5 + 6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 200, 87, 0.8)';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();

    // Glowing, pulsing version of the destination outline (brighter than
    // the regular dim dashed preview so it reads as "put it here").
    var shape = PeelIt.Sticker.SHAPES[target.shape];
    if (shape) {
      ctx.save();
      ctx.translate(target.targetX, target.targetY);
      ctx.rotate(target.targetRot);
      shape.outline(ctx, target.size);
      ctx.setLineDash([8, 6]);
      ctx.lineDashOffset = -time * 40;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(255, 200, 87, ' + (0.55 + Math.sin(time * 5) * 0.25) + ')';
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Flowing dashed guide curve from the tray sticker to its target.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(target.trayX, target.trayY);
    ctx.quadraticCurveTo(midX, midY, target.targetX, target.targetY);
    ctx.setLineDash([10, 10]);
    ctx.lineDashOffset = -time * 70;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Ghost hand: tap -> slide along the same curve -> release -> fade, loop.
    var cycle = 2.6, tapEnd = 0.12, moveEnd = 0.68, holdEnd = 0.85;
    var t = (time % cycle) / cycle;
    var hx, hy, handScale, handAlpha;

    if (t < tapEnd) {
      var tapT = t / tapEnd;
      hx = target.trayX; hy = target.trayY;
      handScale = 1 - Math.sin(tapT * Math.PI) * 0.18;
      handAlpha = Math.min(1, tapT / 0.3);
    } else if (t < moveEnd) {
      var moveT = (t - tapEnd) / (moveEnd - tapEnd);
      var ease = 1 - Math.pow(1 - moveT, 2);
      hx = quadPoint(target.trayX, midX, target.targetX, ease);
      hy = quadPoint(target.trayY, midY, target.targetY, ease);
      handScale = 0.9;
      handAlpha = 1;
    } else if (t < holdEnd) {
      var holdT = (t - moveEnd) / (holdEnd - moveEnd);
      hx = target.targetX; hy = target.targetY;
      handScale = 0.9 + Math.sin(holdT * Math.PI) * 0.15;
      handAlpha = 1;
    } else {
      var fadeT = (t - holdEnd) / (1 - holdEnd);
      hx = target.targetX; hy = target.targetY;
      handScale = 1;
      handAlpha = 1 - fadeT;
    }

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, handAlpha)) * 0.9;
    ctx.translate(hx, hy);
    ctx.scale(handScale, handScale);
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,70,110,0.65)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(90,70,110,0.65)';
    ctx.fill();
    ctx.restore();
  }

  function quadPoint(p0, p1, p2, u) {
    var v = 1 - u;
    return v * v * p0 + 2 * v * u * p1 + u * u * p2;
  }

  function renderShimmer() {
    var t = Math.min(1, completeT / 1.1);
    if (t >= 1) return;
    var sweepX = -DESIGN_W * 0.4 + t * DESIGN_W * 1.8;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var grad = ctx.createLinearGradient(sweepX - 90, 0, sweepX + 90, DESIGN_H);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,' + (0.5 * (1 - Math.abs(t - 0.5) * 2)) + ')');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
    ctx.restore();
  }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  // Read-only introspection used by automated QA smoke tests; harmless in
  // production since it only exposes references, never mutates state.
  function debugState() {
    return {
      gameState: gameState,
      paused: paused,
      currentLevelIndex: currentLevelIndex,
      placedCount: placedCount,
      levelsCompletedCount: levelsCompletedCount,
      hintActive: hintActive,
      adHintActive: adHintActive,
      trayCellSize: trayCellSize,
      stickers: stickers.map(function (s) {
        return {
          id: s.id, z: s.z, state: s.state, foil: s.foil,
          size: s.size, trayScale: s.trayScale, grabRadius: trayGrabRadius(s),
          trayX: s.trayX, trayY: s.trayY, targetX: s.targetX, targetY: s.targetY
        };
      })
    };
  }

  // Forces a single synchronous update+render outside the rAF loop. Used only
  // by automated QA to sample the canvas in headless/hidden-tab environments
  // where requestAnimationFrame is paused by the browser; harmless in
  // production (nothing calls it).
  function renderOnce(dt) {
    update(typeof dt === 'number' ? dt : 0.016);
    render();
  }

  return { init: init, setPaused: setPaused, _debug: debugState, _renderOnce: renderOnce };
})();

document.addEventListener('DOMContentLoaded', PeelIt.Game.init);
