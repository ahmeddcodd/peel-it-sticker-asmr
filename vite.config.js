import { defineConfig } from 'vite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// DEV-ONLY: lets an in-page script POST a canvas snapshot (base64) so it can be
// written straight to disk and inspected during development. Never runs in the
// production build (apply: 'serve'). Harmless if unused.
function snapshotPlugin() {
  return {
    name: 'peelit-snapshot',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__snap', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('POST only'); return; }
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          try {
            const b64 = body.replace(/^data:image\/\w+;base64,/, '');
            const out = path.join(os.tmpdir(), 'peelit-snap.png');
            fs.writeFileSync(out, Buffer.from(b64, 'base64'));
            res.end(out);
          } catch (e) { res.statusCode = 500; res.end(String(e)); }
        });
      });
    }
  };
}

// Static HTML5 game bundled for Playgama / Poki / YouTube Playables embedding.
// - base './'    : all asset URLs are relative, so the build works from any
//                  sub-path an embedding platform serves it under (not just /).
// - outDir dist  : what gets uploaded / deployed.
// - target es2019: broad support for older mobile webviews on ad platforms.
export default defineConfig({
  base: './',
  plugins: [snapshotPlugin()],
  build: {
    outDir: 'dist',
    target: 'es2019',
    assetsInlineLimit: 4096, // inline small SVG/data assets to cut request count
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        // Predictable, hashed asset names for long-cache headers (see vercel.json).
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash][extname]'
      }
    }
  },
  server: { port: 8000, host: true }
});
