// SPDX-License-Identifier: Apache-2.0
// Guards two brief rules across the web core: every `message` listener must check
// origins with isTrustedOrigin (ADR-0009), and runtime code must not assume https.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packagesDir = fileURLToPath(new URL('../..', import.meta.url));

/** Drops block and line comments so prose about the rules does not trip them. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === 'public' || name === '__snapshots__')
      continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) out.push(full);
  }
  return out;
}

/** `window.webkit` / `w.webkit?.` property access; not `-webkit-` CSS or the adapter's file name. */
const WEBKIT = /\.webkit\b(?!\.ts)/;

describe('web core audit', () => {
  const files = sourceFiles(packagesDir);

  it('finds the runtime sources', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('exactly one file is the WebKit adapter', () => {
    const adapters = files.filter((f) => WEBKIT.test(stripComments(readFileSync(f, 'utf8'))));
    expect(adapters.map((f) => f.replace(packagesDir, ''))).toEqual(['host-api/src/webkit.ts']);
  });

  it("every 'message' listener checks the origin with isTrustedOrigin", () => {
    for (const file of files) {
      const text = stripComments(readFileSync(file, 'utf8'));
      if (/addEventListener\(\s*['"]message['"]/.test(text) || /\bonmessage\s*=/.test(text)) {
        expect(text, file).toContain('isTrustedOrigin');
      }
    }
  });

  it('no runtime code hardcodes a custom scheme or assumes https', () => {
    for (const file of files) {
      const text = stripComments(readFileSync(file, 'utf8'));
      // The dev-server plugins play native and may build http URLs; everything else gets its base from Host.
      if (file.endsWith('fixtures-plugin.ts')) continue;
      // The WebKit adapter is the one place allowed to touch window.webkit (brief, ADR-0002).
      const isAdapter = file.endsWith('/host-api/src/webkit.ts');
      expect(text, file).not.toMatch(/['"`]mdview:\/\//);
      expect(text, file).not.toMatch(/location\.protocol\s*===?\s*['"]https:/);
      if (!isAdapter) expect(text, file).not.toMatch(WEBKIT);
    }
  });
});
