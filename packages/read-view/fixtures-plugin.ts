// SPDX-License-Identifier: Apache-2.0
// Vite plugin (dev + preview) that plays the native side for the browser build:
// serves the fixture corpus under /__fixtures/ so MockHost can open documents and
// resolve relative assets exactly as the app's scheme handler would.
import { existsSync, readFileSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';

const require = createRequire(import.meta.url);
const fixturesRoot = dirname(require.resolve('@inlay-md/fixtures/package.json'));

const MIME: Record<string, string> = {
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/** Resolves a URL path under /__fixtures/ to a file inside the fixtures root, or null on traversal. */
export function resolveFixturePath(urlPath: string): string | null {
  const rel = decodeURIComponent(urlPath.replace(/^\/__fixtures\/?/, ''));
  const abs = resolve(fixturesRoot, normalize(rel));
  if (abs !== fixturesRoot && !abs.startsWith(fixturesRoot + sep)) return null;
  return abs;
}

export function fixturesPlugin(): Plugin {
  const handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url ?? '';
    if (!url.startsWith('/__fixtures/')) return next();
    const path = url.split('?')[0] ?? '';
    const abs = resolveFixturePath(path);
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
    res.setHeader('Content-Type', MIME[extname(abs)] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(readFileSync(abs));
  };
  return {
    name: 'inlay-fixtures',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export const fixturesManifestPath = join(fixturesRoot, 'manifest.json');
