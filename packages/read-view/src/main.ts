// SPDX-License-Identifier: Apache-2.0
/**
 * Read view shell (M0). In the app the native scheme handler embeds the document
 * source in this page; in the browser (`pnpm dev` / Playwright) a fixture picker
 * feeds MockHost. Either way the page renders through md-render and never
 * touches `window.webkit` or a hardcoded scheme: the base URL comes from Host.
 */
import { type Host, MockHost } from '@inlay-md/host-api';
import { render } from '@inlay-md/md-render';

interface EmbeddedSource {
  docId: string;
  text: string;
  baseURL: string;
  path?: string;
  bom?: boolean;
  quarantined?: boolean;
}

interface FixtureManifest {
  fixtures: Array<{ file: string; render?: boolean; utf8?: boolean }>;
}

const root = document.getElementById('inlay-root') as HTMLElement;
const devBar = document.getElementById('inlay-dev-bar') as HTMLElement;
const picker = document.getElementById('inlay-fixture-picker') as HTMLSelectElement;
const status = document.getElementById('inlay-dev-status') as HTMLElement;

function readEmbeddedSource(): EmbeddedSource | null {
  const el = document.getElementById('inlay-source');
  if (!el?.textContent) return null;
  return JSON.parse(el.textContent) as EmbeddedSource;
}

async function show(host: Host): Promise<void> {
  const doc = await host.openDocument();
  const started = performance.now();
  const { html, meta } = render(doc.text, { mode: doc.quarantined ? 'static' : 'full' });
  root.innerHTML = html;
  root.dataset.docId = doc.docId;
  root.dataset.baseUrl = doc.baseURL;
  if (meta.title) document.title = `${meta.title} — Inlay`;
  status.textContent = `${meta.lineCount} lines · rendered in ${(performance.now() - started).toFixed(1)} ms`;
}

async function devMode(): Promise<void> {
  // Browser development: MockHost plays native. The fixtures route is served by the Vite plugin.
  devBar.hidden = false;
  const manifest = (await (await fetch('/__fixtures/manifest.json')).json()) as FixtureManifest;
  const renderable = manifest.fixtures.filter((f) => f.render !== false && f.utf8 !== false);
  for (const f of renderable) {
    const opt = document.createElement('option');
    opt.value = f.file;
    opt.textContent = f.file;
    picker.append(opt);
  }
  const open = async (file: string) => {
    const bytes = new Uint8Array(
      await (await fetch(`/__fixtures/md/${encodeURIComponent(file)}`)).arrayBuffer(),
    );
    const bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bom ? bytes.subarray(3) : bytes);
    const baseURL = new URL('/__fixtures/md/', location.href).toString();
    const host = new MockHost({
      docId: file.replace(/\.md$/, ''),
      path: `/fixtures/md/${file}`,
      text,
      bom,
      baseURL,
    });
    history.replaceState(null, '', `?fixture=${encodeURIComponent(file)}`);
    await show(host);
  };
  const initial = new URLSearchParams(location.search).get('fixture') ?? renderable[0]?.file ?? '';
  if (initial) {
    picker.value = initial;
    await open(initial);
  }
  picker.addEventListener('change', () => void open(picker.value));
}

const embedded = readEmbeddedSource();
if (embedded) {
  void show(
    new MockHost({
      docId: embedded.docId,
      text: embedded.text,
      baseURL: embedded.baseURL,
      path: embedded.path ?? null,
      bom: embedded.bom ?? false,
      quarantined: embedded.quarantined ?? false,
    }),
  );
} else {
  void devMode();
}
