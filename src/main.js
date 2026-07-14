/*
 * main.js - Vite entry point.
 *
 * The game's modules keep the original global `window.PeelIt.*` IIFE pattern;
 * this entry just imports them for their side effects in strict dependency
 * order (each module registers itself on window.PeelIt, later modules use the
 * earlier ones at runtime). Vite/Rollup bundles + minifies them into one
 * hashed asset, and CSS is imported here so it's bundled too.
 *
 * The Playgama bridge stays a plain external <script> in index.html (loaded
 * before this module), so window.bridge exists by the time sdk.js runs its
 * platform detection - see the note in index.html.
 */
import './style.css';

import './tokens.js';     // design system (palette / shadows / outline weights)
import './sdk.js';        // platform abstraction (Playgama / web / ...)
import './save.js';       // progress persistence, built on SDK
import './audio.js';      // procedural Web Audio (SFX + ambient music bed)
import './particles.js';  // pooled confetti / sparkle / burst effects
import './sticker.js';    // vector shape registry + Sticker entity
import './levels.js';     // pure level data
import './scene.js';      // shared "solved picture" renderer (ghost / thumbnails)
import './album.js';      // sticker-album meta screen
import './game.js';       // main loop, state machine, input, render (self-boots)
