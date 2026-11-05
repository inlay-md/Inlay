// SPDX-License-Identifier: Apache-2.0
/**
 * Read view runtime (ADR-0001): takes the embedded document source, renders it
 * with md-render and replaces the shell page with the rendered document via
 * document.open/write/close, so the document's own <style> and <script> run at
 * page level exactly as on a navigated page and relative URLs resolve against
 * the document folder (the page URL is the document base URL).
 *
 * Nothing here touches `window.webkit` or hardcodes a scheme: the base URL comes
 * from the host payload and runtime assets resolve from Vite's BASE_URL against
 * the page location (`mdview://<docId>/__inlay/` in the app, `/__inlay/` in dev).
 */
import { type Host, MockHost } from '@inlay-md/host-api';
import { MD_RENDER_VERSION, type RenderOptions, render } from '@inlay-md/md-render';
import { composePage, devBarHtml } from './page.ts';
import {
  getPosition,
  loadPosition,
  restorePosition,
  savePosition,
  scrollToSourceLine,
} from './scroll.ts';
import type { EmbeddedSource, ReadViewApi } from './types.ts';

export const QUARANTINE_PLACEHOLDER =
  'Interactive content (scripts stay off until you trust this document)';

/** Absolute URL of the runtime assets folder (`<base>/`), derived from the page location. */
export function runtimeBaseURL(): string {
  return new URL(import.meta.env.BASE_URL, location.href).href;
}

export function hostFromEmbedded(source: EmbeddedSource): Host {
  return new MockHost({
    docId: source.docId,
    text: source.text,
    baseURL: source.baseURL,
    path: source.path ?? null,
    bom: source.bom ?? false,
    quarantined: source.quarantined ?? false,
  });
}

function whenParsed(callback: () => void): void {
  if (document.readyState !== 'loading') callback();
  else document.addEventListener('DOMContentLoaded', callback, { once: true });
}

export async function boot(
  source: EmbeddedSource,
  host: Host = hostFromEmbedded(source),
): Promise<ReadViewApi> {
  const doc = await host.openDocument();
  const theme = source.theme ?? 'system';
  const runtimeBase = runtimeBaseURL();
  const options: RenderOptions = doc.quarantined
    ? {
        mode: 'static',
        scriptPlaceholder: QUARANTINE_PLACEHOLDER,
        vendorBaseURL: `${runtimeBase}vendor/`,
      }
    : { mode: 'full', vendorBaseURL: `${runtimeBase}vendor/` };

  const started = performance.now();
  const { html, meta } = render(doc.text, options);
  const renderMs = performance.now() - started;

  const page = composePage({
    docId: doc.docId,
    baseURL: doc.baseURL,
    title: meta.title,
    theme,
    bodyHtml: html,
    meta,
    runtimeBaseURL: runtimeBase,
    quarantined: doc.quarantined,
    ...(source.dev ? { devBarHtml: devBarHtml(source.dev.fixtures, source.dev.current) } : {}),
  });

  // Replace the shell with the rendered page. The Window (and this module) survive; the
  // old document's listeners are dropped, so everything below attaches to the new document.
  document.open();
  document.write(page);
  document.close();

  const api: ReadViewApi = {
    version: MD_RENDER_VERSION,
    docId: doc.docId,
    stats: { renderMs, lineCount: meta.lineCount, highlighted: 0, mermaid: 0 },
    refresh() {
      savePosition(doc.docId, { line: getPosition().line, scrollY: window.scrollY });
      location.reload();
    },
    getPosition: () => getPosition(),
    scrollToSourceLine: (line) => scrollToSourceLine(line),
    setTheme(next) {
      if (next === 'system') delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = next;
    },
  };
  window.inlayReadView = api;

  await new Promise<void>((resolve) => whenParsed(resolve));

  const saved = loadPosition(doc.docId);
  if (saved) restorePosition(saved);
  let scheduled = false;
  window.addEventListener(
    'scroll',
    () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        savePosition(doc.docId, { line: getPosition().line, scrollY: window.scrollY });
      });
    },
    { passive: true },
  );
  window.addEventListener('pagehide', () => {
    savePosition(doc.docId, { line: getPosition().line, scrollY: window.scrollY });
  });

  if (source.dev) installDevBar(api);
  return api;
}

function installDevBar(api: ReadViewApi): void {
  const picker = document.getElementById('inlay-fixture-picker') as HTMLSelectElement | null;
  const status = document.getElementById('inlay-dev-status');
  if (status) {
    status.textContent = `${api.stats.lineCount} lines · rendered in ${api.stats.renderMs.toFixed(1)} ms`;
  }
  picker?.addEventListener('change', () => {
    // Same folder as the current view URL, so relative assets keep resolving.
    location.href = new URL(encodeURIComponent(picker.value) + location.search, location.href).href;
  });
}
