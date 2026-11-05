// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'vite';

// Browser ESM build. The JavaScriptCore IIFE is built by scripts/build-jsc.mjs.
export default defineConfig({
  build: {
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'md-render.js' },
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
  },
});
