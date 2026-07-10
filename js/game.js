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
  // Fraction of a tray cell a piece is grown to fill when its authored size
  // is smaller than the cell, so tiny pieces (a 50px flame, a 60px light)
  // still read clearly instead of rendering as a speck. See layoutTray().
  var TRAY_TARGET_FILL = 0.8;
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
  }

  // ---- bootstrap ----------------------------------------------------------
  function init() {
    cacheDom();
    canvas = el.canvas;
    ctx = canvas.getContext('2d');
    frame = el.frame;

    PeelIt.SDK.init(function () {
      PeelIt.Save.load(function () {
        PeelIt.Audio.setMuted(PeelIt.Save.get().muted);
        updateMuteBtn();
        PeelIt.SDK.gameReady();

        wireUi();
        resize();
        window.addEventListener('resize', resize);
        window.addEventListener('orientationchange', resize);
        // ResizeObserver as a second, independent detection path: some
        // hosting/embedding techniques (e.g. a platform's own "scale test"
        // resizing our iframe via a CSS transform, or certain iframe
        // embeds generally) don't reliably fire a window 'resize' event
        // inside our own document even though our visible box size
        // changed - that leaves the frame letterboxed for a stale size,
        // reading as "shifted or cropped". ResizeObserver watches the
        // actual rendered box directly regardless of what triggered the
        // change, so it fires in cases 'resize' can miss.
        if (window.ResizeObserver) {
          new ResizeObserver(resize).observe(document.body);
        }
        // Also recheck on visibility change: an iframe resized while
        // backgrounded/hidden may not have dispatched anything we caught.
        document.addEventListener('visibilitychange', function () {
          if (!document.hidden) resize();
        });

        showLevelSelect();
        requestAnimationFrame(tick);
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
    var maxW = window.innerWidth, maxH = window.innerHeight;
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
    gameState = 'select';
    el.selectScreen.classList.add('visible');
    el.completeScreen.classList.remove('visible');
    el.topBar.classList.remove('visible');
    buildLevelGrid();
  }

  function buildLevelGrid() {
    var save = PeelIt.Save.get();
    el.levelGrid.innerHTML = '';
    PeelIt.Levels.LEVELS.forEach(function (lvl, i) {
      var locked = i > save.unlockedIndex;
      var card = document.createElement('button');
      card.className = 'level-card' + (locked ? ' locked' : '');
      card.disabled = locked;

      var thumb = document.createElement('div');
      thumb.className = 'level-thumb';
      thumb.style.background = 'linear-gradient(160deg,' + lvl.bg.top + ',' + lvl.bg.bottom + ')';
      thumb.textContent = locked ? '🔒' : levelEmoji(lvl.id);
      card.appendChild(thumb);

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

  function levelEmoji(id) {
    var map = {
      'boba-tea': '🧋', 'smiling-cat': '🐱', 'birthday-cake': '🎂', 'rainbow': '🌈',
      'sneaker': '👟', 'donut': '🍩', 'sunflower': '🌻', 'gaming-controller': '🎮',
      'ice-cream-sundae': '🍨', 'planet': '🪐', 'butterfly': '🦋', 'aquarium': '🐠'
    };
    return map[id] || '✨';
  }

  function makeStarSpan(filled) {
    var s = document.createElement('span');
    s.className = 'star' + (filled ? ' filled' : '');
    s.textContent = '★';
    return s;
  }

  // ---- level lifecycle ------------------------------------------------------
  function startLevel(index) {
    currentLevelIndex = index;
    currentLevel = PeelIt.Levels.get(index);
    placedCount = 0;
    activeDrag = null;
    completeT = 0;
    completePanelShown = false;
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

    gameState = 'playing';
    el.selectScreen.classList.remove('visible');
    el.completeScreen.classList.remove('visible');
    el.topBar.classList.add('visible');
    el.levelName.textContent = currentLevel.name;

    PeelIt.SDK.levelStarted(currentLevel.id);
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
      // Size the piece to its cell. Two bounds:
      //  - fit:  shrink a big piece so it never exceeds the cell.
      //  - grow: magnify a small piece UP toward TRAY_TARGET_FILL of the
      //          cell so a tiny authored piece (e.g. a 50px candle flame)
      //          reads clearly in the tray instead of rendering as a speck.
      // We take the smaller of the two so a piece never overflows its cell,
      // and clamp the lower end to 1 so a piece already large enough is left
      // at (or shrunk toward) its authored size rather than being blown up.
      // startDrag() snaps scale back to 1 on pickup, so the authored size is
      // still what actually gets placed into the finished picture.
      var fit = trayCellSize / s.size;
      var grow = (trayCellSize * TRAY_TARGET_FILL) / s.size;
      s.trayScale = Math.min(fit, Math.max(1, grow));
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
    PeelIt.Audio.resume();
    // Kick off the looping background music on the first user gesture (a no-op
    // after the first call). Doing it here satisfies mobile autoplay policy -
    // the same gesture that unlocks the AudioContext starts the music.
    PeelIt.Audio.startMusic();
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
      }
      // Only one sticker is ever grabbable at a time (the z-gated check
      // above), so grabbing anything here IS grabbing the hinted sticker.
      adHintActive = false;
      canvas.setPointerCapture(e.pointerId);
      activeDrag = best;
      best.startDrag(p.x, p.y);
      lastPointerPos = p;
      PeelIt.Audio.playLift();
      PeelIt.Audio.startCrinkle();
      PeelIt.Audio.duckMusic(true); // dip the music so the ASMR crinkle leads
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

    parallax.x = ((p.x - DESIGN_W / 2) / DESIGN_W) * 10;
    parallax.y = ((p.y - SCENE_RECT.y - SCENE_RECT.h / 2) / SCENE_RECT.h) * 6;

    lastPointerPos = p;
  }

  function onPointerUp() {
    if (!activeDrag) return;
    PeelIt.Audio.stopCrinkle();
    PeelIt.Audio.duckMusic(false); // ease the music back up after the peel
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
      PeelIt.Audio.playChime(placedCount - 1);
      PeelIt.Particles.burst(dragged.targetX, dragged.targetY, dragged.color);
      vibrate(15);
      layoutTray();
      if (placedCount >= stickers.length) triggerLevelComplete();
    } else if (matches.length) {
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
    for (var i = 0; i < 3; i++) el.completeStars.appendChild(makeStarSpan(i < pendingStars));
    var isLast = currentLevelIndex + 1 >= PeelIt.Levels.count();
    el.nextBtn.textContent = isLast ? 'See levels' : 'Next →';
    updateFoilBtn();
    el.completeScreen.classList.add('visible');
  }

  function updateFoilBtn() {
    if (PeelIt.Save.hasFoil(currentLevel.id)) {
      el.foilBtn.textContent = '✨ Foil pack unlocked';
      el.foilBtn.classList.add('unlocked');
      el.foilBtn.disabled = true;
    } else {
      el.foilBtn.textContent = '✨ Unlock foil pack';
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
    el.foilBtn.disabled = true;
    PeelIt.SDK.showRewardedAd(function () {
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
  }

  // Player-requested hint: watching a rewarded ad reveals which tray
  // sticker to place next and where, reusing the exact same visual
  // treatment as the first-level onboarding tutorial (see renderHint()) -
  // glow ring on the correct tray piece, pulsing destination outline, and
  // a looping ghost-hand demo. Dismissed the same way the tutorial is:
  // the moment the player actually grabs that sticker (see onPointerDown).
  function onHintBtnClick() {
    if (gameState !== 'playing' || adHintActive || el.hintBtn.disabled) return;
    el.hintBtn.disabled = true;
    PeelIt.SDK.showRewardedAd(function () {
      adHintActive = true;
      el.hintBtn.disabled = false;
    }, function () {
      el.hintBtn.disabled = false;
    });
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
    if (gameState === 'playing' || gameState === 'complete') {
      stickers.forEach(function (s) { if (s !== activeDrag) s.update(dt, time); });
    }
    PeelIt.Particles.update(dt);

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
    renderSceneOutlines(false);   // future/locked outlines: under the placed art
    renderPlacedStickers();
    renderSceneOutlines(true);    // active (next-to-place) outline: ON TOP of placed
    renderTray();
    if (activeDrag) activeDrag.draw(ctx);
    if (hintActive || adHintActive) renderHint();

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

  // Drawn in TWO passes around renderPlacedStickers():
  //  - activeOnly=false: the dimmed future/locked outlines, painted UNDER the
  //    placed art so they don't clutter over finished pieces.
  //  - activeOnly=true: the outline(s) for the piece you place next, painted
  //    OVER the placed art. Many pieces target a spot that sits on top of an
  //    already-placed piece (the cat's eyes over its head, the planet's spots
  //    over its body); drawing every outline before the placed art buried
  //    those, so the player couldn't see where the next piece goes. Splitting
  //    the active outline into an on-top pass keeps it always visible.
  function renderSceneOutlines(activeOnly) {
    var activeZ = minUnplacedZ();
    stickers.forEach(function (s) {
      if (s.state === 'placed' || s.state === 'settling') return;
      var isActive = s.z === activeZ;
      if (activeOnly !== isActive) return;
      PeelIt.Sticker.drawOutline(ctx, s.shape, s.size, s.targetX, s.targetY, s.targetRot, !isActive);
    });
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

    // Per-piece "slot cards": a soft rounded card behind each tray piece.
    // Without this, a white/pale piece (a #FFFFFF candle, cloud, glass, tank,
    // or any shape whose art is translucent-white) is drawn white-on-white
    // over the scrim above and effectively disappears - the exact "pieces
    // hidden in the background" bug. The card gives every piece, whatever its
    // colour, an edge to read against, so the fix is structural: a future
    // level using a white piece is safe by default with no per-shape work.
    //
    // Drawn in their OWN pass, before the pieces, and always at full opacity -
    // NOT inside the z-lock dim block below. A locked (not-yet-grabbable)
    // piece is still greyed/faded to signal "wait your turn", but its card
    // stays solid underneath, so even a dimmed pale piece is clearly visible.
    ctx.save();
    stickers.forEach(function (s) {
      if (s === activeDrag) return;
      if (s.state === 'tray' || s.state === 'returning') drawTrayCard(s.trayX, s.trayY);
    });
    ctx.restore();

    stickers.forEach(function (s) {
      if (s === activeDrag) return;
      if (s.state === 'tray' || s.state === 'returning') {
        var locked = s.state === 'tray' && s.z !== activeZ;
        ctx.save();
        // Soft contrast halo around the piece ART itself: a canvas shadow set
        // on ctx makes every fill the shape paints cast a faint dark glow, so
        // a pure-white piece with no outline of its own (candle, frosting,
        // cloud, glass...) still gets a readable edge against the pale card -
        // the card alone isn't enough for white-on-light. Works for ANY shape,
        // including multi-part ones (scalloped frosting, dotted sprinkles),
        // with zero per-shape code, so future white pieces are covered too.
        // Tray-only: the shadow is on the local ctx.save() and never touches
        // the placed/dragged art. Skipped for 'returning' pieces mid-flight so
        // the halo doesn't smear across their motion.
        if (s.state === 'tray') {
          ctx.shadowColor = 'rgba(90,70,110,0.55)';
          ctx.shadowBlur = 7;
        }
        if (locked) {
          ctx.globalAlpha = 0.45;
          ctx.filter = 'grayscale(0.8)';
        }
        s.draw(ctx);
        ctx.restore();
      }
    });
  }

  // Soft rounded card drawn behind a tray piece (see renderTray). Sized off
  // trayCellSize so it tracks the reflowing grid, with a small inset so
  // neighbouring cards never touch. Faintly tinted (not pure white) so white
  // pieces gain contrast, with a soft drop shadow + hairline border. Mirrors
  // the DOM .level-card look (rounded, white, soft purple shadow) so the tray
  // feels of a piece with the rest of the UI.
  function drawTrayCard(cx, cy) {
    var side = trayCellSize + 14; // slightly larger than the piece footprint
    var half = side / 2;
    var radius = Math.min(22, half);
    ctx.save();
    // Shadow pass: draw the rounded silhouette once just for its drop shadow,
    // then paint the real fill on top with the shadow disabled (so the tinted
    // gradient below isn't itself dimmed by the shadow settings).
    ctx.shadowColor = 'rgba(70,50,90,0.20)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    roundRectPath(ctx, cx - half, cy - half, side, side, radius);
    ctx.fillStyle = '#EDE6F6';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    // Tinted lilac-grey fill (NOT near-white): a white/pale piece is drawn on
    // top of this, so the card must be clearly darker than the piece to give
    // it contrast - a near-white card would leave white pieces invisible,
    // which is the whole bug. A soft top-light/bottom-shade gradient keeps it
    // reading as a rounded "slot" rather than a flat swatch.
    var g = ctx.createLinearGradient(0, cy - half, 0, cy + half);
    g.addColorStop(0, '#F1ECF8');
    g.addColorStop(1, '#E3D9F0');
    roundRectPath(ctx, cx - half, cy - half, side, side, radius);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(120,100,150,0.28)';
    ctx.stroke();
    ctx.restore();
  }

  // Local rounded-rect path helper. Not using the native ctx.roundRect: it is
  // absent on some of the older mobile webviews Playgama distributes to, and
  // the rest of this project deliberately avoids relying on newer canvas APIs.
  function roundRectPath(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
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

  return { init: init, _debug: debugState };
})();

document.addEventListener('DOMContentLoaded', PeelIt.Game.init);
