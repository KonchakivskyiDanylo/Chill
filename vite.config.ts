import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // The cleaned Liquipedia export, read in place — no copy, no build step.
      '@data': fileURLToPath(new URL('./liquipedia_data/clean_data/fortnite', import.meta.url)),
    },
  },
  server: { port: 5173 },
});
