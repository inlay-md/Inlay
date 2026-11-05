// SPDX-License-Identifier: Apache-2.0
/** Composes the full HTML page the runtime writes with document.open/write/close (ADR-0001). */
import { escapeHtml, type RenderMeta, THEME_CSS } from '@inlay-md/md-render';

export const DEV_BAR_CSS = String.raw`
#inlay-dev-bar { position: sticky; top: 0; z-index: 2147483000; display: flex; gap: 1rem; align-items: center; padding: 0.4rem 1rem; border-bottom: 1px solid var(--inlay-border); background: var(--inlay-bg); font: 0.85rem var(--inlay-font); color: var(--inlay-muted); }
#inlay-dev-bar select { font: inherit; }
`;

export interface PageParts {
  docId: string;
  baseURL: string;
  title: string | null;
  theme: 'light' | 'dark' | 'system';
  bodyHtml: string;
  meta: RenderMeta;
  /** Absolute URL of the runtime assets folder (ends with '/'); vendor files live under `vendor/`. */
  runtimeBaseURL: string;
  devBarHtml?: string;
  /** True for quarantined documents (used by the trust banner CSS hook). */
  quarantined: boolean;
}

export function composePage(p: PageParts): string {
  const themeAttr = p.theme === 'system' ? '' : ` data-theme="${p.theme}"`;
  const title = p.title ? `${p.title} — Inlay` : 'Inlay';
  const katex = p.meta.hasMath
    ? `<link rel="stylesheet" href="${escapeHtml(p.runtimeBaseURL)}vendor/katex/katex.min.css">`
    : '';
  return [
    '<!doctype html>',
    `<html lang="en"${themeAttr}>`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light dark">',
    `<title>${escapeHtml(title)}</title>`,
    `<style id="inlay-theme">${THEME_CSS}${p.devBarHtml ? DEV_BAR_CSS : ''}</style>`,
    katex,
    '</head>',
    '<body>',
    p.devBarHtml ?? '',
    `<article id="inlay-root" class="inlay-doc" data-doc-id="${escapeHtml(p.docId)}" data-base-url="${escapeHtml(p.baseURL)}"${p.quarantined ? ' data-quarantined="true"' : ''}>`,
    p.bodyHtml,
    '</article>',
    '</body>',
    '</html>',
  ].join('\n');
}

export function devBarHtml(fixtures: string[], current: string): string {
  const options = fixtures
    .map(
      (f) =>
        `<option value="${escapeHtml(f)}"${f === current ? ' selected' : ''}>${escapeHtml(f)}</option>`,
    )
    .join('');
  return `<header id="inlay-dev-bar"><label>Fixture <select id="inlay-fixture-picker">${options}</select></label><span id="inlay-dev-status"></span></header>`;
}
