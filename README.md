# Peel it! — Sticker art ASMR

A satisfying ASMR sticker game: **peel** each sticker off its backing sheet and place it to
assemble a picture. Curated procedural vector art, a soft synthesized ambient soundtrack, and
hand-tuned game feel (peel haptics, combo rewards, a sticker album to collect).

Built with **Vite**. Art is drawn with canvas vector paths ([src/sticker.js](src/sticker.js));
all audio is synthesized at runtime with Web Audio ([src/audio.js](src/audio.js)) — no binary
image or audio assets.

## Run locally

```bash
npm install
npm run dev        # -> http://localhost:8000 (Vite dev server, HMR)
```

Production build + local preview of the built output:

```bash
npm run build      # -> dist/
npm run preview    # serves dist/ on http://localhost:8000
```

Locally the Playgama bridge script fails to load, so [src/sdk.js](src/sdk.js) falls back to the
`web` adapter: progress goes to `localStorage` and the rewarded/interstitial ads are simulated
with a short delay. Gameplay is identical.

## Deploy

This builds to a static `dist/` folder — host it anywhere. `vercel.json` is preconfigured
(framework **Vite**, build command `vite build`, output `dist`). It sends `frame-ancestors *`
(no `X-Frame-Options`) so Playgama / Poki / CrazyGames / YouTube Playables can embed the game in
an iframe, hashed assets get long-cache headers, and `index.html` is never cached.

## Playgama submission

The Bridge SDK is loaded from `https://bridge.playgama.com/v2/stable/playgama-bridge.js`
(v2 — the current stable line). `public/playgama-bridge-config.json` (copied to the deploy root
by Vite) declares the three ad placements referenced in [src/sdk.js](src/sdk.js):

- `rewarded_hint` — watch an ad to reveal where the next piece goes
- `rewarded_foil_pack` — watch an ad to unlock a permanent holographic **foil** finish on a level
- `interstitial_level_transition` — shown at a natural break every 3rd level completion

Every rewarded ad is opt-in: the control carries an **AD** badge and a confirm dialog states the
ad will play and names the reward. The ad plays first; the reward is granted only on the bridge's
`rewarded` state (never when the ad is closed early). Sound and gameplay are paused for every
full-screen ad. Validate the config against the
[bridge config editor](https://playgama.github.io/bridge-config-editor/) before submitting, and
keep the placement id strings in sync between that file and the constants in `src/sdk.js`.

## Project layout

```
index.html                     Vite entry; loads the bridge + /src/main.js
vite.config.js                 build config (+ a dev-only snapshot middleware, serve only)
public/playgama-bridge-config.json   ad placement declarations (served at root)
src/main.js                    imports the modules in dependency order
src/style.css                  DOM overlay (top bar, menus, album, complete, confirm dialog)
src/tokens.js                  shared design system (palette, light, shadow language)
src/sdk.js                     platform abstraction (Playgama / YouTube / Poki / web)
src/save.js                    progress persistence, built on the SDK
src/audio.js                   procedural Web Audio: ambient music bed + peel/place SFX
src/particles.js               pooled confetti + sparkle systems
src/sticker.js                 vector shape registry + the Sticker entity (peel/settle/foil)
src/scene.js                   renders a level's finished picture (ghost ref / thumbnails)
src/levels.js                  pure data: 12 levels
src/album.js                   sticker-album meta screen
src/game.js                    main loop, layout, input, rendering, game feel
```

Gameplay is drawn in a fixed **720×1280** design space and letterboxed onto the real screen, so
game math never needs to know the device resolution. The completed picture is always shown to the
player as a faint **ghost reference** under the board plus a top-bar thumbnail, so it's clear what
you're assembling.

### Adding a level

Append an object to `LEVELS` in [src/levels.js](src/levels.js). Each sticker needs a `shape` key
that exists in `PeelIt.Sticker.SHAPES`, a `z` (placement order — a piece is only grabbable once
every lower `z` is placed), and `tx`/`ty` target coordinates expressed as a **fraction** of the
scene rect so the layout survives any aspect ratio. Position related parts so their drawn
footprints touch/overlap — pieces that float apart won't read as one object.

## Debugging

`PeelIt.Game._debug()` returns a read-only snapshot of game state. `PeelIt.Game._renderOnce()`
forces one synchronous frame (used by automated QA in headless environments). In the console:

```js
PeelIt.Save.unlockNext(11)   // unlock every level, then return to the level list
```
