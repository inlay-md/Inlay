// SPDX-License-Identifier: Apache-2.0
import type { Root as HastRoot } from 'hast';

/** Rendering surfaces. `full` = Read view (scripts allowed); `sanitized` = editor islands; `static` = Quick Look tier 3 / scripts off. */
export type RenderMode = 'full' | 'sanitized' | 'static';

export type Theme = 'light' | 'dark' | 'system';

/**
 * Pluggable syntax highlighter (Shiki behind an adapter). `highlight` returns a
 * hast tree for a loaded language or `null` when the language is unknown, in
 * which case the code block stays a plain `<pre><code class="language-x">`.
 */
export interface CodeHighlighter {
  supports(lang: string): boolean;
  highlight(code: string, lang: string): HastRoot | null;
}

export interface RenderOptions {
  mode?: RenderMode;
  /** Keep document scripts. Ignored (false) unless mode is `full`. Default true. */
  allowScripts?: boolean;
  /** Written as `data-theme` on the root `<article>` when not `system`; the theme CSS honours it. */
  theme?: Theme;
  /** Inline local images/SVGs as data URIs (Quick Look). Requires `assetLoader`. */
  inlineAssets?: boolean;
  /** Supplies bytes for a document-relative path, or null when unavailable. */
  assetLoader?: (relPath: string) => Uint8Array | null;
  /** Largest asset inlined by `inlineAssets`, in bytes (default 5 MiB; larger files keep their URL). */
  inlineAssetMaxBytes?: number;
  /** Base URL (ending in '/') where bundled copies of known libraries are served; enables CDN URL rewriting. */
  vendorBaseURL?: string;
  /** Syntax highlighter for fenced code. Without one, code blocks are emitted unhighlighted. */
  highlighter?: CodeHighlighter;
  /** Text shown where a script was removed (`static`, `sanitized`, or `allowScripts: false`). */
  scriptPlaceholder?: string;
}

export interface RenderMeta {
  /** Front matter as raw text (without the fences), if present. */
  frontMatter: string | null;
  /** Document title derived from front matter or the first heading. */
  title: string | null;
  /** Whether the document contains script elements (before any stripping). */
  hasScripts: boolean;
  /** Whether the document contains raw HTML blocks or inline HTML. */
  hasRawHtml: boolean;
  /** Languages seen in fenced code blocks (lower-cased, first word of the info string). */
  codeLanguages: string[];
  /** Whether a Mermaid block is present (client-side rendering needed). */
  hasMermaid: boolean;
  /** Whether math was rendered. */
  hasMath: boolean;
  /** Source line count. */
  lineCount: number;
  /** Known-library CDN URLs rewritten to the vendor base. */
  rewrittenUrls: number;
}

export interface RenderResult {
  html: string;
  meta: RenderMeta;
}

export const DEFAULT_SCRIPT_PLACEHOLDER = 'Interactive content: open in Inlay';
