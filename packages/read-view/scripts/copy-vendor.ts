#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copies the bundled copies of known libraries (ADR-0008) from node_modules into
// public/vendor/<lib>/… so Vite serves them at <base>/vendor/… in dev and copies
// them into dist/. Writes public/vendor/manifest.json with the exact versions.
// Run with Node ≥ 22.18 type stripping: node scripts/copy-vendor.ts
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));

interface VendorSpec {
  /** npm package name. */
  pkg: string;
  /** Folder under public/vendor. */
  dir: string;
  /** Files relative to the package root → path relative to `dir`. */
  files: Record<string, string>;
  /** Directories copied whole (filtered by extension). */
  dirs?: Array<{ from: string; to: string; ext: string[] }>;
}

export const VENDOR_SPECS: VendorSpec[] = [
  { pkg: 'chart.js', dir: 'chart.js', files: { 'dist/chart.umd.js': 'chart.umd.js' } },
  { pkg: 'echarts', dir: 'echarts', files: { 'dist/echarts.min.js': 'echarts.min.js' } },
  { pkg: 'd3', dir: 'd3', files: { 'dist/d3.min.js': 'd3.min.js' } },
  { pkg: 'mermaid', dir: 'mermaid', files: { 'dist/mermaid.min.js': 'mermaid.min.js' } },
  {
    pkg: 'katex',
    dir: 'katex',
    files: {
      'dist/katex.min.js': 'katex.min.js',
      'dist/katex.min.css': 'katex.min.css',
      'dist/contrib/auto-render.min.js': 'contrib/auto-render.min.js',
      'dist/contrib/mhchem.min.js': 'contrib/mhchem.min.js',
      'dist/contrib/copy-tex.min.js': 'contrib/copy-tex.min.js',
    },
    dirs: [{ from: 'dist/fonts', to: 'fonts', ext: ['.woff2'] }],
  },
];

function packageRoot(pkg: string): string {
  // `exports` may hide package.json; resolve the package directory from its main entry instead.
  const entry = require.resolve(pkg);
  let dir = dirname(entry);
  while (!readdirSync(dir).includes('package.json') || !isPackage(dir, pkg)) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`cannot locate package root for ${pkg}`);
    dir = parent;
  }
  return dir;
}

function isPackage(dir: string, pkg: string): boolean {
  try {
    return (
      (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name?: string }).name ===
      pkg
    );
  } catch {
    return false;
  }
}

export function copyVendor(
  outDir = join(root, 'public', 'vendor'),
): Record<string, { version: string; files: string[] }> {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const manifest: Record<string, { version: string; files: string[] }> = {};
  for (const spec of VENDOR_SPECS) {
    const pkgRoot = packageRoot(spec.pkg);
    const version = (
      JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')) as { version: string }
    ).version;
    const files: string[] = [];
    for (const [from, to] of Object.entries(spec.files)) {
      const dest = join(outDir, spec.dir, to);
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(join(pkgRoot, from), dest);
      files.push(to);
    }
    for (const d of spec.dirs ?? []) {
      const destDir = join(outDir, spec.dir, d.to);
      mkdirSync(destDir, { recursive: true });
      for (const name of readdirSync(join(pkgRoot, d.from)).sort()) {
        if (!d.ext.some((e) => name.endsWith(e))) continue;
        cpSync(join(pkgRoot, d.from, name), join(destDir, name));
        files.push(`${d.to}/${name}`);
      }
    }
    manifest[spec.pkg] = { version, files: files.sort() };
  }
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const manifest = copyVendor();
  const summary = Object.entries(manifest)
    .map(([k, v]) => `${k}@${v.version} (${v.files.length} files)`)
    .join(', ');
  console.log(`read-view: vendored ${summary}`);
}
