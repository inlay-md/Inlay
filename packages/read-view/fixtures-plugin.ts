// SPDX-License-Identifier: Apache-2.0
// Vite plugin (dev + preview) that plays the native side for the browser build:
//   /__fixtures/manifest.json      the fixture manifest (for the index page)
//   /__fixtures/md/<path>          raw fixture files
//   /__fixtures/view/<file>.md     the Read view shell with that fixture embedded as JSON
//                                  (what MDViewSchemeHandler serves at mdview://<docId>/),
//                                  with the app's Content-Security-Policy
//   /__fixtures/view/<other path>  files inside the fixture folder (document assets),
//                                  with the same traversal guard as the app
// Query parameters on the view route: ?quarantined=1, ?allowNetwork=1, ?theme=dark|light
import { existsSync, readFileSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { contentSecurityPolicy } from './src/csp.ts';
import type { EmbeddedSource } from './src/types.ts';

const require = createRequire(import.meta.url);
const fixturesRoot = dirname(require.resolve('@inlay-md/fixtures/package.json'));
const documentFolder = join(fixturesRoot, 'md');
const packageRoot = dirname(require.resolve('./package.json'));

const MIME: Record<string, string> = {
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.html': 'text/html; charset=utf-8',
};

/** Resolves a relative path to a file inside `root`, or null on traversal. */
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

/** Resolves a URL path under /__fixtures/ to a file inside the fixtures root, or null on traversal. */
export function resolveFixturePath(urlPath: string): string | null {
  return resolveInside(fixturesRoot, urlPath.replace(/^\/__fixtures\/?/, ''));
}

export function renderableFixtures(): string[] {
  const manifest = JSON.parse(readFileSync(join(fixturesRoot, 'manifest.json'), 'utf8')) as {
    fixtures: Array<{ file: string; render?: boolean; utf8?: boolean }>;
  };
  return manifest.fixtures.filter((f) => f.render !== false && f.utf8 !== false).map((f) => f.file);
}

/** Embeds the payload the way the native handler does: JSON in <body>, `</` escaped. */
export function embedSource(template: string, payload: EmbeddedSource): string {
  const json = JSON.stringify(payload).replace(/<\//g, '<\\/');
  const embed = `<script type="application/json" id="inlay-source">${json}</script>`;
  return template.includes('<body>')
    ? template.replace('<body>', `<body>${embed}`)
    : embed + template;
}

function sendFile(res: ServerResponse, abs: string, cache = 'no-cache'): void {
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    res.statusCode = 404;
    res.end('not found');
    return;
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', MIME[extname(abs)] ?? 'application/octet-stream');
  res.setHeader('Cache-Control', cache);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(readFileSync(abs));
}

export function fixturesPlugin(): Plugin {
  let devServer: ViteDevServer | null = null;

  async function shellTemplate(url: string): Promise<string> {
    const template = readFileSync(join(packageRoot, 'index.html'), 'utf8');
    if (devServer) return devServer.transformIndexHtml(url, template);
    return readFileSync(join(packageRoot, 'dist', 'index.html'), 'utf8');
  }

  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url ?? '';
    if (!url.startsWith('/__fixtures/')) return next();
    const [rawPath, query = ''] = url.split('?', 2) as [string, string?];
    const params = new URLSearchParams(query);
    if (rawPath === '/__fixtures/manifest.json') {
      sendFile(res, join(fixturesRoot, 'manifest.json'), 'no-store');
      return;
    }
    if (rawPath.startsWith('/__fixtures/view/')) {
      const rel = rawPath.slice('/__fixtures/view/'.length);
      const abs = resolveInside(documentFolder, rel);
      if (!abs) {
        res.statusCode = 403;
        res.end('forbidden');
        return;
      }
      if (!/\.(md|markdown)$/i.test(abs) || !existsSync(abs)) {
        sendFile(res, abs);
        return;
      }
      const bytes = readFileSync(abs);
      const bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bom ? bytes.subarray(3) : bytes);
      } catch {
        res.statusCode = 415;
        res.end('not valid UTF-8');
        return;
      }
      const file = decodeURIComponent(rel);
      const quarantined = params.get('quarantined') === '1';
      const allowNetwork = params.get('allowNetwork') === '1';
      const theme = params.get('theme');
      const payload: EmbeddedSource = {
        docId: file.replace(/\.(md|markdown)$/i, ''),
        text,
        baseURL: `http://${req.headers.host ?? 'localhost'}/__fixtures/view/`,
        path: abs,
        bom,
        quarantined,
        allowNetwork,
        dev: { fixtures: renderableFixtures(), current: file },
      };
      if (theme === 'dark' || theme === 'light') payload.theme = theme;
      const html = embedSource(await shellTemplate(url), payload);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader(
        'Content-Security-Policy',
        contentSecurityPolicy({
          self: "'self'",
          trusted: !quarantined,
          allowNetwork,
          nonce: 'dev',
          ...(devServer ? { devConnect: "'self' ws: wss:" } : {}),
        }),
      );
      res.end(html);
      return;
    }
    const abs = resolveFixturePath(rawPath);
    if (!abs) {
      res.statusCode = 403;
      res.end('forbidden');
      return;
    }
    sendFile(res, abs, 'no-store');
  };

  return {
    name: 'inlay-fixtures',
    configureServer(server) {
      devServer = server;
      server.middlewares.use((req, res, next) => void handler(req, res, next));
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => void handler(req, res, next));
    },
  };
}

export const fixturesManifestPath = join(fixturesRoot, 'manifest.json');
