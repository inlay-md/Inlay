#!/usr/bin/env node
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// SPDX-License-Identifier: Apache-2.0
// Builds the JavaScriptCore bundle (run with Node ≥ 22.18 type stripping: node scripts/build-jsc.ts): one IIFE, no DOM APIs, exposing the global
// `InlayRender` with `render(markdown, options) -> { html, meta }`.
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export async function buildJsc({
  outfile = join(root, 'dist', 'md-render.jsc.js'),
  write = true,
} = {}) {
  return build({
    entryPoints: [join(root, 'src', 'jsc-entry.ts')],
    bundle: true,
    format: 'iife',
    globalName: 'InlayRender',
    platform: 'neutral',
    mainFields: ['module', 'main'],
    conditions: ['import', 'default'],
    // JavaScriptCore on macOS 14 (Safari 17 era) is the oldest runtime for the Quick Look extension.
    target: ['safari17'],
    outfile,
    write,
    sourcemap: false,
    minify: false,
    legalComments: 'inline',
    logLevel: 'warning',
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await buildJsc();
  console.log('md-render: built dist/md-render.jsc.js');
}
