// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'fixtures/**/*.test.ts', 'scripts/**/*.test.mjs'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
  },
});
