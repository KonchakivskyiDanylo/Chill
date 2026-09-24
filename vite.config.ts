import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  plugins: [react()],
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
  },
});
