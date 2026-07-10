# Peel it! — Sticker art ASMR

A satisfying ASMR sticker-peeling hypercasual game. Drag sticker pieces from the tray
onto their outlines to assemble a picture.

**Zero dependencies, zero build step, zero binary assets.** Every sticker is drawn with
canvas vector paths ([js/sticker.js](js/sticker.js)); every sound is synthesized at
runtime with Web Audio ([js/audio.js](js/audio.js)).

## Run locally

Any static file server works. From this directory:

```bash
npm run dev          # -> http://localhost:8000
```

or, without Node:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>.

> Don't open `index.html` as a `file://` URL — `localStorage` (progress saving) is
> unreliable on that origin and the Playgama bridge script may be blocked.

Locally the bridge script fails to load, so [js/sdk.js](js/sdk.js) falls back to the
`web` adapter: progress goes to `localStorage` and the rewarded/interstitial ads are
simulated with a short delay. Gameplay is identical.

## Deploy to Vercel

This is a pure static site. Vercel serves it with no build step.

**From the dashboard:** import the Git repo. When asked for a framework preset choose
**Other**. Leave *Build Command* empty and set *Output Directory* to `.` (the repo root).

**From the CLI:**

```bash
npm i -g vercel
vercel          # preview deployment
vercel --prod   # production
```

`package.json` intentionally declares **no `build` script**, which is what tells Vercel
to treat the project as static and skip the build phase.

### What `vercel.json` does

| Concern | Setting | Why |
| --- | --- | --- |
| Iframe embedding | `frame-ancestors *`, **no** `X-Frame-Options` | Playgama, Poki, CrazyGames and YouTube Playables all load the game in an iframe. Sending `X-Frame-Options` would break every embed. |
| Script allowlist | `script-src 'self' https://bridge.playgama.com` | The one external runtime dependency. |
| HTML caching | `max-age=0, must-revalidate` | New deploys must be picked up immediately. |
| Asset caching | `max-age=3600, must-revalidate` | Filenames are **not** content-hashed (`game.js`, not `game.a1b2.js`), so `immutable` would strand returning players on stale JS after a redeploy. |

## Playgama submission

`playgama-bridge-config.json` declares the two ad placements referenced in
[js/sdk.js](js/sdk.js):

- `rewarded_foil_pack` — watch an ad to unlock a permanent foil shimmer on a level
- `interstitial_level_transition` — shown on every 3rd level completion

Validate that file against the
[bridge config editor](https://playgama.github.io/bridge-config-editor/) before
submitting. The two placement id strings must stay in sync between the JSON and the
constants at the top of the Playgama adapter in `js/sdk.js`.

## Project layout

```
index.html                     entry point; loads the 7 modules in dependency order
css/style.css                  DOM overlay (top bar, level select, complete screen)
js/sdk.js                      platform abstraction (Playgama / YouTube / Poki / web)
js/save.js                     progress persistence, built only on top of SDK
js/audio.js                    procedural Web Audio sound design
js/particles.js                confetti + sparkle systems
js/sticker.js                  vector shape registry + the Sticker entity
js/levels.js                   pure data: 12 levels
js/game.js                     main loop, layout, input, rendering
playgama-bridge-config.json    ad placement declarations
vercel.json                    static hosting headers
```

Gameplay is drawn in a fixed **720×1280** design space and letterboxed onto the real
screen, so game math never needs to know the device resolution.

### Adding a level

Append an object to `LEVELS` in [js/levels.js](js/levels.js). Each sticker needs a
`shape` key that exists in `PeelIt.Sticker.SHAPES`, a `z` (placement order — a piece is
only grabbable once every lower `z` is placed), and `tx`/`ty` target coordinates
expressed as a **fraction** of the scene rect so the layout survives any aspect ratio.

## Debugging

`PeelIt.Game._debug()` returns a read-only snapshot of game state (current level, each
sticker's state, tray geometry). In the console:

```js
PeelIt.Save.unlockNext(11)   // unlock every level, then return to the level list
```
