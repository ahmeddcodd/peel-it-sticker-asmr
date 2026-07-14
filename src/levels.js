window.PeelIt = window.PeelIt || {};

/*
 * levels.js - pure data. No logic lives here.
 *
 * Level format:
 *   id     - unique string, used as the save-data key for stars/foil
 *   name   - sentence-case display name
 *   bg     - { top, bottom, accent } hex colors for the scene background
 *   stickers - array of sticker definitions, each:
 *     id    - unique within the level
 *     shape - key into PeelIt.Sticker.SHAPES (see sticker.js)
 *     color - primary hex color passed to the shape's draw()
 *     size  - reference bounding size in design pixels (canvas is 720x1280)
 *     z     - placement order; a sticker can only be dragged once every
 *             sticker with a lower z in the same level is already placed
 *     tx,ty - target position as a FRACTION (0-1) of the scene art area,
 *             so layouts stay correct across aspect ratios
 *     rot   - target rotation in degrees
 *
 * To add a new level: append an object to LEVELS following this shape.
 * See README.md for the full walkthrough with a worked example.
 */
PeelIt.Levels = (function () {
  'use strict';

  var LEVELS = [
    {
      id: 'boba-tea',
      name: 'Boba tea',
      bg: { top: '#FFEBF2', bottom: '#FFB8D2', accent: '#FF6FA3' },
      stickers: [
        { id: 'cup', shape: 'boba-cup', color: '#FCEEDD', size: 190, z: 0, tx: 0.5, ty: 0.56, rot: 0 },
        { id: 'liquid', shape: 'boba-liquid', color: '#C68A55', size: 150, z: 1, tx: 0.5, ty: 0.585, rot: 0 },
        { id: 'pearls', shape: 'boba-pearls', color: '#4B2E1E', size: 120, z: 2, tx: 0.5, ty: 0.62, rot: 0 },
        { id: 'straw', shape: 'boba-straw', color: '#FF8FB3', size: 150, z: 3, tx: 0.58, ty: 0.36, rot: 14 },
        { id: 'lid', shape: 'boba-lid', color: '#EAF0F6', size: 150, z: 4, tx: 0.5, ty: 0.47, rot: 0 },
        { id: 'face', shape: 'boba-face', color: '#7A4B2E', size: 110, z: 5, tx: 0.5, ty: 0.56, rot: 0 }
      ]
    },
    {
      id: 'smiling-cat',
      name: 'Smiling cat',
      bg: { top: '#EAF2FF', bottom: '#B9D4FF', accent: '#6FA0FF' },
      stickers: [
        { id: 'head', shape: 'cat-head', color: '#FFD8A8', size: 210, z: 0, tx: 0.5, ty: 0.50, rot: 0 },
        { id: 'ears', shape: 'cat-ears', color: '#FFD8A8', size: 210, z: 1, tx: 0.5, ty: 0.38, rot: 0 },
        { id: 'eyes', shape: 'cat-eyes', color: '#5A4636', size: 150, z: 2, tx: 0.5, ty: 0.47, rot: 0 },
        { id: 'nose', shape: 'cat-nose-mouth', color: '#FF8FB3', size: 90, z: 3, tx: 0.5, ty: 0.55, rot: 0 },
        { id: 'whiskers', shape: 'cat-whiskers', color: '#B08968', size: 200, z: 4, tx: 0.5, ty: 0.55, rot: 0 },
        { id: 'blush', shape: 'cat-blush', color: '#FF8FB3', size: 170, z: 5, tx: 0.5, ty: 0.58, rot: 0 }
      ]
    },

    {
      id: 'birthday-cake',
      name: 'Birthday cake',
      bg: { top: '#FFF3E0', bottom: '#FFC29E', accent: '#FF9466' },
      stickers: [
        { id: 'base', shape: 'cake-base', color: '#F293BE', size: 190, z: 0, tx: 0.5, ty: 0.60, rot: 0 },
        { id: 'tier', shape: 'cake-tier', color: '#FDE1EC', size: 150, z: 1, tx: 0.5, ty: 0.575, rot: 0 },
        { id: 'frosting', shape: 'cake-frosting', color: '#FFF1F7', size: 150, z: 2, tx: 0.5, ty: 0.50, rot: 0 },
        { id: 'sprinkles', shape: 'cake-sprinkles', color: '#FF8FB3', size: 120, z: 3, tx: 0.5, ty: 0.55, rot: 0 },
        { id: 'candle', shape: 'candle', color: '#FBE2F0', size: 90, z: 4, tx: 0.5, ty: 0.46, rot: 0 },
        { id: 'flame', shape: 'candle-flame', color: '#FFB347', size: 50, z: 5, tx: 0.5, ty: 0.405, rot: 0 }
      ]
    },
    {
      id: 'rainbow',
      name: 'Rainbow',
      bg: { top: '#CDEEFF', bottom: '#8FD3FF', accent: '#FFB3E6' },
      stickers: [
        { id: 'cloud-left', shape: 'cloud', color: '#FFFFFF', size: 130, z: 0, tx: 0.22, ty: 0.62, rot: 0 },
        { id: 'cloud-right', shape: 'cloud', color: '#FFFFFF', size: 130, z: 1, tx: 0.78, ty: 0.62, rot: 0 },
        { id: 'arc-outer', shape: 'rainbow-arc-outer', color: '#FF6F9E', size: 220, z: 2, tx: 0.5, ty: 0.55, rot: 0 },
        { id: 'arc-mid', shape: 'rainbow-arc-mid', color: '#FFC93D', size: 220, z: 3, tx: 0.5, ty: 0.55, rot: 0 },
        { id: 'arc-inner', shape: 'rainbow-arc-inner', color: '#5CC2FF', size: 220, z: 4, tx: 0.5, ty: 0.55, rot: 0 },
        { id: 'sparkle', shape: 'stars-sparkle', color: '#FFD54A', size: 150, z: 5, tx: 0.5, ty: 0.28, rot: 0 }
      ]
    },
    {
      id: 'sneaker',
      name: 'Sneaker',
      bg: { top: '#FFF6E8', bottom: '#FFD8A8', accent: '#FF9F66' },
      stickers: [
        // These parts are all drawn with absolute offsets from one shared shoe
        // origin, so they must share the same tx/ty to assemble into one shoe
        // (the toe cap is the only free-floating piece and sits at the front).
        { id: 'sole', shape: 'shoe-sole', color: '#EFEFEF', size: 200, z: 0, tx: 0.5, ty: 0.52, rot: -6 },
        { id: 'body', shape: 'shoe-body', color: '#4FCC9E', size: 200, z: 1, tx: 0.5, ty: 0.52, rot: -6 },
        { id: 'toe', shape: 'shoe-toe', color: '#FFFFFF', size: 150, z: 2, tx: 0.60, ty: 0.545, rot: -6 },
        { id: 'laces', shape: 'shoe-laces', color: '#F0F0F0', size: 200, z: 3, tx: 0.5, ty: 0.52, rot: -6 },
        { id: 'swoosh', shape: 'shoe-swoosh', color: '#FF8FB3', size: 200, z: 4, tx: 0.5, ty: 0.52, rot: -6 },
        { id: 'heel-tab', shape: 'shoe-heel-tab', color: '#FF9F66', size: 200, z: 5, tx: 0.5, ty: 0.52, rot: -6 }
      ]
    },
    {
      id: 'donut',
      name: 'Donut',
      bg: { top: '#FFF2DE', bottom: '#F0C48A', accent: '#C98F4E' },
      stickers: [
        { id: 'plate', shape: 'plate', color: '#FFF6E8', size: 220, z: 0, tx: 0.5, ty: 0.68, rot: 0 },
        { id: 'base', shape: 'donut-base', color: '#D89A56', size: 190, z: 1, tx: 0.5, ty: 0.48, rot: 0 },
        { id: 'icing', shape: 'donut-icing', color: '#FF6FA3', size: 190, z: 2, tx: 0.5, ty: 0.48, rot: 0 },
        { id: 'sprinkles', shape: 'donut-sprinkles', color: '#5CC2FF', size: 190, z: 3, tx: 0.5, ty: 0.48, rot: 0 },
        { id: 'shine', shape: 'donut-shine', color: '#FFFFFF', size: 190, z: 4, tx: 0.5, ty: 0.48, rot: 0 }
      ]
    },
    {
      id: 'sunflower',
      name: 'Sunflower',
      bg: { top: '#EFFCE0', bottom: '#BFE68A', accent: '#FFC53D' },
      stickers: [
        { id: 'stem', shape: 'flower-stem', color: '#5DA430', size: 160, z: 0, tx: 0.5, ty: 0.76, rot: 0 },
        { id: 'leaf', shape: 'flower-leaf', color: '#79C24A', size: 100, z: 1, tx: 0.63, ty: 0.68, rot: 10 },
        { id: 'petals-back', shape: 'flower-petals-back', color: '#FFC93D', size: 210, z: 2, tx: 0.5, ty: 0.40, rot: 0 },
        { id: 'petals-front', shape: 'flower-petals-front', color: '#FFB300', size: 200, z: 3, tx: 0.5, ty: 0.40, rot: 20 },
        { id: 'center', shape: 'flower-center', color: '#8D6E3A', size: 110, z: 4, tx: 0.5, ty: 0.40, rot: 0 }
      ]
    },
    {
      id: 'gaming-controller',
      name: 'Gaming controller',
      bg: { top: '#EDE7FF', bottom: '#B7A4FF', accent: '#8F6FFF' },
      stickers: [
        { id: 'body', shape: 'controller-body', color: '#6C56F0', size: 210, z: 0, tx: 0.5, ty: 0.52, rot: 0 },
        { id: 'dpad', shape: 'dpad', color: '#E4E4EC', size: 150, z: 1, tx: 0.40, ty: 0.52, rot: 0 },
        { id: 'buttons', shape: 'buttons', color: '#FF8FB3', size: 150, z: 2, tx: 0.60, ty: 0.52, rot: 0 },
        { id: 'joystick', shape: 'joystick', color: '#4A3B57', size: 100, z: 3, tx: 0.5, ty: 0.60, rot: 0 },
        { id: 'light', shape: 'controller-light', color: '#7CE0A0', size: 60, z: 4, tx: 0.5, ty: 0.40, rot: 0 },
        { id: 'shoulder', shape: 'shoulder-buttons', color: '#4A3B57', size: 210, z: 5, tx: 0.5, ty: 0.52, rot: 0 }
      ]
    },
    {
      id: 'ice-cream-sundae',
      name: 'Ice cream sundae',
      bg: { top: '#FFEEF5', bottom: '#FFB8D6', accent: '#FF7FAE' },
      stickers: [
        { id: 'glass', shape: 'sundae-glass', color: '#FFFFFF', size: 190, z: 0, tx: 0.5, ty: 0.60, rot: 0 },
        { id: 'scoop-bottom', shape: 'scoop', color: '#F293BE', size: 165, z: 1, tx: 0.5, ty: 0.50, rot: 0 },
        { id: 'scoop-top', shape: 'scoop', color: '#FFE066', size: 135, z: 2, tx: 0.5, ty: 0.41, rot: 0 },
        { id: 'drizzle', shape: 'syrup-drizzle', color: '#B5651D', size: 150, z: 3, tx: 0.5, ty: 0.44, rot: 0 },
        { id: 'cherry', shape: 'cherry', color: '#E63950', size: 70, z: 4, tx: 0.5, ty: 0.34, rot: 0 },
        { id: 'wafer', shape: 'wafer', color: '#E8B888', size: 110, z: 5, tx: 0.68, ty: 0.44, rot: 20 }
      ]
    },
    {
      id: 'planet',
      name: 'Planet',
      bg: { top: '#E1DBFF', bottom: '#8F72F5', accent: '#5CD6FF' },
      stickers: [
        { id: 'body', shape: 'planet-body', color: '#A374FF', size: 170, z: 0, tx: 0.5, ty: 0.50, rot: 0 },
        { id: 'ring', shape: 'planet-ring', color: '#FFC93D', size: 190, z: 1, tx: 0.5, ty: 0.50, rot: 0 },
        { id: 'spots', shape: 'planet-spots', color: '#5A3FA8', size: 150, z: 2, tx: 0.5, ty: 0.50, rot: 0 },
        { id: 'moon', shape: 'moon-small', color: '#FFE066', size: 70, z: 3, tx: 0.78, ty: 0.28, rot: 0 },
        { id: 'stars', shape: 'stars-sparkle', color: '#FFE38A', size: 160, z: 4, tx: 0.5, ty: 0.16, rot: 0 },
        { id: 'comet', shape: 'comet', color: '#BFE7FF', size: 140, z: 5, tx: 0.16, ty: 0.20, rot: -30 }
      ]
    },
    {
      id: 'butterfly',
      name: 'Butterfly',
      bg: { top: '#EFFFEE', bottom: '#A0E6D2', accent: '#B79CFF' },
      stickers: [
        { id: 'wing-lower-left', shape: 'wing-lower-left', color: '#9C7CFF', size: 160, z: 0, tx: 0.5, ty: 0.52, rot: 0 },
        { id: 'wing-lower-right', shape: 'wing-lower-right', color: '#9C7CFF', size: 160, z: 1, tx: 0.5, ty: 0.52, rot: 0 },
        { id: 'wing-upper-left', shape: 'wing-upper-left', color: '#FF6FA3', size: 170, z: 2, tx: 0.5, ty: 0.52, rot: 0 },
        { id: 'wing-upper-right', shape: 'wing-upper-right', color: '#FF6FA3', size: 170, z: 3, tx: 0.5, ty: 0.52, rot: 0 },
        { id: 'body', shape: 'butterfly-body', color: '#5A4636', size: 90, z: 4, tx: 0.5, ty: 0.52, rot: 0 },
        { id: 'pattern', shape: 'wing-pattern', color: '#FFE9A8', size: 170, z: 5, tx: 0.5, ty: 0.52, rot: 0 }
      ]
    },
    {
      id: 'aquarium',
      name: 'Aquarium',
      bg: { top: '#DFF7FF', bottom: '#5CC2FF', accent: '#2E9BFF' },
      stickers: [
        { id: 'tank', shape: 'tank', color: '#FFFFFF', size: 220, z: 0, tx: 0.5, ty: 0.50, rot: 0 },
        { id: 'water', shape: 'water-fill', color: '#5CC2FF', size: 220, z: 1, tx: 0.5, ty: 0.52, rot: 0 },
        { id: 'seaweed', shape: 'seaweed', color: '#2E9B5C', size: 120, z: 2, tx: 0.30, ty: 0.68, rot: 0 },
        { id: 'fish-tail', shape: 'fish-tail', color: '#E8590C', size: 170, z: 3, tx: 0.55, ty: 0.48, rot: 0 },
        { id: 'fish-body', shape: 'fish-body', color: '#FFA94D', size: 130, z: 4, tx: 0.55, ty: 0.48, rot: 0 },
        { id: 'bubbles', shape: 'bubbles', color: '#AEDAF0', size: 100, z: 5, tx: 0.68, ty: 0.30, rot: 0 }
      ]
    }
  ];

  return {
    LEVELS: LEVELS,
    get: function (i) { return LEVELS[i]; },
    getById: function (id) {
      for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === id) return LEVELS[i];
      return null;
    },
    count: function () { return LEVELS.length; }
  };
})();
