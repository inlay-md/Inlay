// SPDX-License-Identifier: Apache-2.0
/**
 * Read view entry. In the app the native scheme handler embeds the document
 * source as JSON in the shell page; the dev server's view route does the same for
 * fixtures. Without an embedded source (the bare /__inlay/ page) we show the
 * fixture index for browser development.
 */
import { boot } from './runtime.ts';
import type { EmbeddedSource } from './types.ts';

function readEmbeddedSource(): EmbeddedSource | null {
  const el = document.getElementById('inlay-source');
  if (!el?.textContent) return null;
  return JSON.parse(el.textContent) as EmbeddedSource;
}

async function fixtureIndex(): Promise<void> {
  const manifest = (await (await fetch('/__fixtures/manifest.json')).json()) as {
    fixtures: Array<{ file: string; render?: boolean; utf8?: boolean }>;
  };
  const renderable = manifest.fixtures.filter((f) => f.render !== false && f.utf8 !== false);
  const list = document.createElement('ul');
  list.id = 'inlay-fixture-index';
  for (const f of renderable) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `/__fixtures/view/${encodeURIComponent(f.file)}`;
    a.textContent = f.file;
    li.append(a);
    list.append(li);
  }
  const h1 = document.createElement('h1');
  h1.textContent = 'Inlay Read view — fixtures';
  document.body.replaceChildren(h1, list);
  document.body.style.cssText =
    'font-family: -apple-system, system-ui, sans-serif; padding: 1.5rem; color-scheme: light dark;';
}

const embedded = readEmbeddedSource();
if (embedded) {
  void boot(embedded);
} else {
  void fixtureIndex();
}
