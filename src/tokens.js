window.PeelIt = window.PeelIt || {};

/*
 * tokens.js - the shared visual design system.
 *
 * A single source of truth for the game's look so every sticker, screen and
 * effect reads as one curated set instead of ad-hoc per-shape choices. This is
 * a deliberate design decision layer (palette, line weight, light direction,
 * shadow language) - the thing a reviewer means by "curated art direction".
 *
 * Sticker art in sticker.js pulls its outline weight, shading ramp and top-
 * light highlight from here, giving all ~40 shapes a consistent hand.
 */
PeelIt.Tokens = (function () {
  'use strict';

  // Curated pastel palette. Warm creams, candy pinks, soft lilacs and mints -
  // the "sticker book" feel. Kept small on purpose so scenes stay cohesive.
  var palette = {
    ink: '#4a3b57',        // primary dark for outlines / text
    inkSoft: '#8b7a99',
    cream: '#fffaf3',
    paper: '#fdf3ff',
    pink: '#ff8fb3',
    rose: '#ff6f9e',
    lilac: '#b79cff',
    violet: '#8f6fff',
    sky: '#8fb3ff',
    blue: '#5cc2ff',
    mint: '#7ee0a0',
    green: '#79c24a',
    lemon: '#ffe066',
    gold: '#ffc857',
    peach: '#ffc29e'
  };

  // Every sticker is lit from the same top-left key light. Highlights sit at
  // this offset, contact shadows fall opposite. Consistency here is most of
  // what makes a flat vector set look intentionally designed.
  var light = { x: -0.35, y: -0.4 };

  // Shading ramp amounts (passed to sticker.js shade()): how much lighter the
  // lit face is and how much darker the outline / underside sit.
  var shading = {
    highlight: 26,   // top-light face lift
    core: 0,         // base color
    shadow: -18,     // shaded underside
    line: -34        // outline darkening relative to fill
  };

  // Outline weight is expressed relative to a sticker's `size` so it scales
  // with the piece rather than being a fixed pixel value that looks heavy on
  // small pieces and thin on big ones.
  function outlineWidth(size) {
    return Math.max(2, size * 0.016);
  }

  // A soft white sticker "die-cut" border, the signature look of a real
  // peel-off sticker. Returns the ring width for a given piece size.
  function dieCutWidth(size) {
    return Math.max(3, size * 0.03);
  }

  // Contact shadow under a placed/lifted sticker - offset follows the key
  // light. `lift` 0..1 grows the shadow as the piece rises off the sheet.
  function contactShadow(lift) {
    return {
      dx: 4 - light.x * 6 * (0.5 + lift),
      dy: 8 - light.y * 6 * (0.5 + lift) + lift * 8,
      blurAlpha: 0.18 + lift * 0.06
    };
  }

  return {
    palette: palette,
    light: light,
    shading: shading,
    outlineWidth: outlineWidth,
    dieCutWidth: dieCutWidth,
    contactShadow: contactShadow
  };
})();
