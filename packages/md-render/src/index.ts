// SPDX-License-Identifier: Apache-2.0
/**
 * md-render: one Markdown pipeline for every surface (Read view, Quick Look, export).
 *
 * M0 ships a stub renderer so the two builds (browser ESM, JavaScriptCore IIFE)
 * and the native packaging path exist end to end. M1 replaces `render` with the
 * unified/remark → rehype pipeline described in docs/BRIEF.md.
 */
import { escapeHtml } from './escape.ts';
import type { RenderMeta, RenderMode, RenderOptions, RenderResult, Theme } from './types.ts';

export type { RenderMeta, RenderMode, RenderOptions, RenderResult, Theme };
export { escapeHtml };

export const MD_RENDER_VERSION = '0.0.0-m0';

function firstHeading(markdown: string): string | null {
  const m = /^#{1,6}[ \t]+(.+?)[ \t#]*$/m.exec(markdown);
  return m?.[1]?.trim() ?? null;
}

export function render(markdown: string, options: RenderOptions = {}): RenderResult {
  const mode: RenderMode = options.mode ?? 'full';
  const lineCount = markdown.length === 0 ? 0 : markdown.split(/\r\n|\r|\n/).length;
  const hasScripts = /<script[\s>]/i.test(markdown);
  const meta: RenderMeta = {
    frontMatter: null,
    title: firstHeading(markdown),
    hasScripts,
    codeLanguages: [],
    hasMermaid: /^```+\s*mermaid\b/m.test(markdown),
    hasMath: /\$\$|(^|[^\\])\$[^$\n]+\$/m.test(markdown),
    lineCount,
  };
  const html = `<pre class="inlay-stub" data-render-mode="${mode}" data-source-line="1-${lineCount}">${escapeHtml(markdown)}</pre>`;
  return { html, meta };
}
