import { readFileSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/**
 * A brotli (`.br`) and a gzip (`.gz`) copy of every text file in the build.
 *
 * Made here, once, at the highest settings — brotli's best takes seconds on
 * the roster, far too slow to do per request. The server sends the `.br` to
 * any browser that takes brotli (all current ones) and the `.gz` otherwise;
 * see `serveStatic` in server/index.ts. Brotli is about a third smaller than
 * the gzip the server used to make on the fly.
 */
function precompress(): Plugin {
  const brotli = promisify(brotliCompress);
  const gz = promisify(gzip);
  let outDir = 'dist';
  return {
    name: 'offspawn-precompress',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const files = (await readdir(outDir, { recursive: true }))
        .map(String)
        .filter((file) => /\.(html|js|css|json|svg|txt)$/.test(file));
      let before = 0;
      let after = 0;
      await Promise.all(
        files.map(async (file) => {
          const full = path.join(outDir, file);
          const raw = await readFile(full);
          if (raw.length < 1024) return;
          const [br, gzipped] = await Promise.all([
            brotli(raw, {
              params: {
                [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
                [constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
              },
            }),
            gz(raw, { level: 9 }),
          ]);
          await Promise.all([writeFile(`${full}.br`, br), writeFile(`${full}.gz`, gzipped)]);
          before += gzipped.length;
          after += br.length;
        }),
      );
      console.log(`precompress: ${files.length} files, brotli ${Math.round(after / 1024)} KB vs gzip ${Math.round(before / 1024)} KB`);
    },
  };
}

export default defineConfig({
  plugins: [react(), precompress()],
  define: {
    // Stamped on every analytics record, so the dashboard can tell builds apart.
    __APP_BUILD__: JSON.stringify(`${version}+${new Date().toISOString().slice(0, 10)}`),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // The cleaned Liquipedia export, read in place — no copy, no build step.
      '@data': fileURLToPath(new URL('./liquipedia_data/clean_data/fortnite', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // The analytics and support endpoints live in `server/`. Run `npm run api`
    // beside `npm run dev` to use them locally; without it the calls simply fail.
    proxy: { '/api': 'http://localhost:3000' },
    // build_data.py stages its files in a hidden folder beside the data, and a
    // 154 MB placements.json locked mid-write crashed the dev server's watcher
    // (EBUSY). The raw dump never changes what the site loads either.
    watch: {
      ignored: ['**/liquipedia_data/raw_data/**', '**/liquipedia_data/clean_data/.*/**', '**/placements.json'],
    },
  },
});
