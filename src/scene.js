window.PeelIt = window.PeelIt || {};

/*
 * scene.js - renders a level's fully-assembled picture into any box.
 *
 * One shared "here is the finished sticker" renderer, reused by:
 *   - the faint ghost reference behind the play-field outlines (game.js),
 *   - the level-select card thumbnails (so players see what they'll build),
 *   - the sticker-album thumbnails (album.js).
 *
 * Having a single source of truth for "the solved picture" is a core part of
 * the readability fix: the reviewer's "pieces do not form the overall shape"
 * comes from players never being shown the target. Now the target is visible
 * everywhere - on the menu card, in the top bar, and ghosted under the board.
 *
 * It draws each piece with the same PeelIt.Sticker.SHAPES[...].draw() calls the
 * live game uses, at each piece's target position/rotation, so a thumbnail is a
 * faithful miniature of the assembled result.
 */
PeelIt.SceneRender = (function () {
  'use strict';

  // Must match SCENE_RECT in game.js (the design-space art area). Piece target
  // positions are fractions of this rect, exactly as the game computes them.
  var SCENE_RECT = { x: 40, y: 150, w: 640, h: 740 };

  function solvedItems(level) {
    return level.stickers.map(function (def) {
      return {
        shape: def.shape,
        color: def.color,
        size: def.size,
        z: def.z,
        x: SCENE_RECT.x + def.tx * SCENE_RECT.w,
        y: SCENE_RECT.y + def.ty * SCENE_RECT.h,
        rot: (def.rot || 0) * Math.PI / 180
      };
    }).sort(function (a, b) { return a.z - b.z; });
  }

  // Bounding box of the assembled art (approximate: each piece treated as a
  // `size`-diameter disc, which comfortably covers every shape's footprint).
  function bounds(items) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    items.forEach(function (it) {
      var r = it.size * 0.6;
      if (it.x - r < minX) minX = it.x - r;
      if (it.x + r > maxX) maxX = it.x + r;
      if (it.y - r < minY) minY = it.y - r;
      if (it.y + r > maxY) maxY = it.y + r;
    });
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  // Draw the completed picture, scaled to fit a w x h box.
  //   opts.background : paint the level's gradient behind the art (thumbnails)
  //   opts.alpha      : global alpha for the art (ghost reference uses ~0.12)
  //   opts.radius     : round the background corners by this many px
  function drawSolved(ctx, level, w, h, opts) {
    opts = opts || {};
    var items = solvedItems(level);
    var b = bounds(items);
    var bw = b.maxX - b.minX, bh = b.maxY - b.minY;
    var pad = 0.9;
    var scale = Math.min(w / bw, h / bh) * pad;
    var cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;

    ctx.save();

    if (opts.background) {
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, level.bg.top);
      g.addColorStop(1, level.bg.bottom);
      if (opts.radius) roundRect(ctx, 0, 0, w, h, opts.radius); else ctx.rect(0, 0, w, h);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.clip(); // keep art inside the rounded card
    }

    ctx.translate(w / 2, h / 2);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;

    items.forEach(function (it) {
      var shape = PeelIt.Sticker.SHAPES[it.shape];
      if (!shape) return;
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(it.rot);
      // Soft contact shadow gives depth AND separates light/white pieces from
      // the pastel background so they don't disappear (a key reason some
      // scenes read as incomplete). Skipped for the low-alpha ghost pass,
      // where a shadow would just muddy the preview.
      if (!opts.alpha) {
        ctx.shadowColor = 'rgba(60,45,75,0.22)';
        ctx.shadowBlur = Math.max(2, it.size * 0.05);
        ctx.shadowOffsetY = Math.max(1, it.size * 0.03);
      }
      shape.draw(ctx, it.size, it.color);
      ctx.restore();
    });

    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  return { drawSolved: drawSolved, SCENE_RECT: SCENE_RECT };
})();
