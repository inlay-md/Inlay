// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'vite';
import { fixturesPlugin } from './fixtures-plugin.ts';

export default defineConfig({
  plugins: [fixturesPlugin()],
  // Runtime assets live under the reserved /__inlay/ prefix (ADR-0002), both in the app and on the dev server.
  base: '/__inlay/',
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: true, target: 'es2022' },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
