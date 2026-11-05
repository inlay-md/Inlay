// SPDX-License-Identifier: Apache-2.0
// Vite plugin (dev + preview): serves the fixture manifest and raw fixture files so the
// browser build of the editor can open them through MockHost (`?fixture=<file>`).
import { existsSync, readFileSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, normalize, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';

const require = createRequire(import.meta.url);
const fixturesRoot = dirname(require.resolve('@inlay-md/fixtures/package.json'));

export function resolveInside(root: string, rel: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rel);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const abs = resolve(root, normalize(decoded));
  if (abs !== root && !abs.startsWith(root + sep)) return null;
  return abs;
}

export function fixtureFilesPlugin(): Plugin {
  const handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = (req.url ?? '').split('?')[0] ?? '';
    if (!url.startsWith('/__fixtures/')) return next();
    const abs = resolveInside(fixturesRoot, url.slice('/__fixtures/'.length));
    if (!abs) {
      res.statusCode = 403;
      res.end('forbidden');
      return;
    }
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    res.statusCode = 200;
    res.setHeader(
      'Content-Type',
      abs.endsWith('.json') ? 'application/json' : 'application/octet-stream',
    );
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(readFileSync(abs));
  };
  return {
    name: 'inlay-fixture-files',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
