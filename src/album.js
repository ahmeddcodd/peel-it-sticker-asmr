window.PeelIt = window.PeelIt || {};

/*
 * album.js - the "sticker album" meta screen (progression payoff).
 *
 * Every completed level's finished picture is collected as a card in an album,
 * mirroring the real-world sticker-book fantasy the game is themed around. It
 * renders each collected sticker's solved artwork to a small canvas thumbnail,
 * marks 3-star / foil (holographic) status, and shows overall completion.
 *
 * Wired up in game.js (album button on the level-select screen). Kept as its
 * own module so the meta layer is separable from the core play loop.
 */
PeelIt.Album = (function () {
  'use strict';

  var el = {};

  function cacheDom() {
    el.screen = document.getElementById('screen-album');
    el.grid = document.getElementById('album-grid');
    el.progress = document.getElementById('album-progress');
  }

  // Renders a level's fully-assembled picture into a small square canvas,
  // reusing the exact shape draw() calls the live game uses so the album
  // thumbnail is a faithful miniature of what the player built.
  function renderThumb(canvas, level, foil) {
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var CSS = 132;
    canvas.width = CSS * dpr;
    canvas.height = CSS * dpr;
    canvas.style.width = CSS + 'px';
    canvas.style.height = CSS + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    PeelIt.SceneRender.drawSolved(ctx, level, CSS, CSS, { foil: foil, background: true });
  }

  function build() {
    cacheDom();
    var save = PeelIt.Save.get();
    el.grid.innerHTML = '';
    var collected = 0;

    PeelIt.Levels.LEVELS.forEach(function (lvl) {
      var stars = save.stars[lvl.id] || 0;
      var owned = stars > 0;
      if (owned) collected++;

      var card = document.createElement('div');
      card.className = 'album-card' + (owned ? '' : ' empty');

      if (owned) {
        var thumb = document.createElement('canvas');
        thumb.className = 'album-thumb';
        card.appendChild(thumb);
        renderThumb(thumb, lvl, PeelIt.Save.hasFoil(lvl.id));

        var name = document.createElement('div');
        name.className = 'album-name';
        name.textContent = lvl.name;
        card.appendChild(name);

        var starsRow = document.createElement('div');
        starsRow.className = 'album-stars';
        for (var s = 0; s < 3; s++) {
          var st = document.createElement('span');
          st.className = 'star' + (s < stars ? ' filled' : '');
          st.textContent = '★';
          starsRow.appendChild(st);
        }
        card.appendChild(starsRow);

        if (PeelIt.Save.hasFoil(lvl.id)) card.classList.add('foil');
      } else {
        var q = document.createElement('div');
        q.className = 'album-locked';
        q.textContent = '?';
        card.appendChild(q);
      }

      el.grid.appendChild(card);
    });

    el.progress.textContent = collected + ' / ' + PeelIt.Levels.count() + ' collected';
  }

  return { build: build };
})();
