// SPDX-License-Identifier: Apache-2.0
// Shared dependency inventory for the license check and the notices generator.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { licenseString } from './spdx.mjs';

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Declared-license corrections for packages whose package.json lacks a usable license field (scripts/license-policy.json). */
function licenseOverrides() {
  try {
    return readJson('scripts/license-policy.json').licenseOverrides ?? [];
  } catch {
    return [];
  }
}

/** @returns {Array<{name:string, versions:string[], license:string, paths:string[], homepage?:string, author?:string}>} */
export function npmPackages({ prod }) {
  const args = ['licenses', 'list', '--json', '--long', '-r'];
  if (prod) args.push('--prod');
  let out;
  try {
    out = execFileSync('pnpm', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    out = error.stdout?.toString() ?? '';
  }
  if (!out.trim() || out.trim().startsWith('No ')) return [];
  const grouped = JSON.parse(out);
  const list = [];
  for (const pkgs of Object.values(grouped)) {
    for (const p of pkgs) {
      if (p.name?.startsWith('@inlay-md/')) continue; // workspace packages
      const paths = p.paths ?? (p.path ? [p.path] : []);
      let license = p.license ?? 'UNKNOWN';
      const first = paths[0];
      if (first && existsSync(join(first, 'package.json'))) {
        try {
          license = licenseString(JSON.parse(readFileSync(join(first, 'package.json'), 'utf8')));
        } catch {
          /* keep pnpm's value */
        }
      }
      if (license === 'UNKNOWN') {
        const override = licenseOverrides().find(
          (o) =>
            o.name === p.name && (!o.version || (p.versions ?? [p.version]).includes(o.version)),
        );
        if (override) license = override.license;
      }
      list.push({
        name: p.name,
        versions: p.versions ?? [p.version].filter(Boolean),
        license,
        paths,
        homepage: p.homepage,
        author: p.author,
      });
    }
  }
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

export function readJson(relPath) {
  return JSON.parse(readFileSync(join(repoRoot, relPath), 'utf8'));
}

/** Swift packages pinned by any Package.resolved in apps/macos (identity → pin). */
export function swiftPins() {
  const candidates = [
    'apps/macos/InlayCore/Package.resolved',
    'apps/macos/Inlay.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved',
  ];
  const pins = new Map();
  for (const rel of candidates) {
    const abs = join(repoRoot, rel);
    if (!existsSync(abs)) continue;
    const json = JSON.parse(readFileSync(abs, 'utf8'));
    for (const pin of json.pins ?? json.object?.pins ?? []) {
      const identity = pin.identity ?? pin.package?.toLowerCase();
      pins.set(identity, {
        identity,
        url: pin.location ?? pin.repositoryURL,
        version: pin.state?.version ?? pin.state?.revision,
      });
    }
  }
  return [...pins.values()].sort((a, b) => a.identity.localeCompare(b.identity));
}

/** Finds a license text file inside a package directory. */
export function licenseText(dir) {
  if (!dir || !existsSync(dir)) return null;
  const names = readdirSync(dir).filter((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
  names.sort((a, b) => a.length - b.length);
  for (const n of names) {
    try {
      return readFileSync(join(dir, n), 'utf8').replace(/\r\n/g, '\n').trim();
    } catch {
      /* try next */
    }
  }
  return null;
}
