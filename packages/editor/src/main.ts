// SPDX-License-Identifier: Apache-2.0
/**
 * Editor page entry. In the app the page is served at `<base>/__inlay/editor/`
 * and talks to native through the WebKit Host adapter; in the browser (dev server,
 * Playwright) a MockHost loads a fixture named by `?fixture=<file>` from the dev
 * route `/__fixtures/md/<file>`, or starts with an empty document.
 */
import { createWebKitHost, detectEol, type Host, MockHost } from '@inlay-md/host-api';
import { decodeDocument } from './document.ts';
import { createSourceEditor } from './editor.ts';
import { PAGE_CSS } from './theme.ts';

async function browserHost(): Promise<Host> {
  const params = new URLSearchParams(location.search);
  const fixture = params.get('fixture');
  let text = params.get('text') ?? '';
  let bom = false;
  let readOnly = false;
  if (fixture) {
    const bytes = new Uint8Array(
      await (await fetch(`/__fixtures/md/${encodeURIComponent(fixture)}`)).arrayBuffer(),
    );
    const decoded = decodeDocument(bytes);
    text = decoded.text;
    bom = decoded.bom;
    readOnly = !decoded.decodable;
  }
  const host = new MockHost({
    docId: fixture ?? 'untitled',
    path: fixture ? `/fixtures/md/${fixture}` : null,
    text,
    bom,
    eol: detectEol(text),
    readOnly,
    baseURL: new URL('/__fixtures/md/', location.href).href,
  });
  // Browser-only probe so tests can look at what the editor told the host.
  (window as unknown as { inlayMockHost?: MockHost }).inlayMockHost = host;
  return host;
}

async function boot(): Promise<void> {
  const style = document.createElement('style');
  style.id = 'inlay-editor-theme';
  style.textContent = PAGE_CSS;
  document.head.append(style);
  const host = createWebKitHost() ?? (await browserHost());
  const doc = await host.openDocument();
  const params = new URLSearchParams(location.search);
  const theme = params.get('theme');
  const parent = document.getElementById('inlay-editor');
  if (!parent) throw new Error('editor mount point missing');
  const api = createSourceEditor({
    parent,
    host,
    doc,
    theme: theme === 'dark' || theme === 'light' ? theme : 'system',
  });
  api.focus();
}

void boot();
