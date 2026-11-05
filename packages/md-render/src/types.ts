// SPDX-License-Identifier: Apache-2.0
/** Rendering surfaces. `full` = Read view (scripts allowed); `sanitized` = editor islands; `static` = Quick Look tier 3 / scripts off. */
export type RenderMode = 'full' | 'sanitized' | 'static';

export type Theme = 'light' | 'dark' | 'system';

export interface RenderOptions {
  mode?: RenderMode;
  /** Keep document scripts. Ignored (false) unless mode is `full`. */
  allowScripts?: boolean;
  theme?: Theme;
  /** Inline local images/SVGs as data URIs (Quick Look). Requires `assetLoader`. */
  inlineAssets?: boolean;
  /** Supplies bytes for a document-relative path, or null when unavailable. */
  assetLoader?: (relPath: string) => Uint8Array | null;
  /** Base URL (ending in '/') where bundled copies of known libraries are served; enables CDN URL rewriting. */
  vendorBaseURL?: string;
}

export interface RenderMeta {
  /** Front matter as raw text, if present. */
  frontMatter: string | null;
  /** Document title derived from front matter or the first heading. */
  title: string | null;
  /** Whether the document contains script elements (before any stripping). */
  hasScripts: boolean;
  /** Languages seen in fenced code blocks. */
  codeLanguages: string[];
  /** Whether a Mermaid block is present (client-side rendering needed). */
  hasMermaid: boolean;
  /** Whether math was rendered. */
  hasMath: boolean;
  /** Source line count. */
  lineCount: number;
}

export interface RenderResult {
  html: string;
  meta: RenderMeta;
}
