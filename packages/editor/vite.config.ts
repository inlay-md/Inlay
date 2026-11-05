// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'vite';
import { fixtureFilesPlugin } from './fixtures-plugin.ts';

export default defineConfig({
  plugins: [fixtureFilesPlugin()],
  // The editor page lives under the reserved runtime prefix (ADR-0002), as a sibling of the Read view assets.
  base: '/__inlay/editor/',
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: true, target: 'es2022' },
  server: { port: 5174, strictPort: true },
  preview: { port: 4174, strictPort: true },
});
