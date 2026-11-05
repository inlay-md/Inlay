// SPDX-License-Identifier: Apache-2.0
/**
 * md-render: one Markdown pipeline for every surface (Read view, Quick Look, export).
 *
 * remark-parse + gfm + math + frontmatter → remark-rehype (allowDangerousHtml)
 * → source lines → rehype-raw → [mode: script stripping + sanitize] → KaTeX
 * → Mermaid hand-off → Shiki → CDN rewriting → asset inlining → HTML.
 */
import type { Root as MdastRoot } from 'mdast';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { DEFAULT_INLINE_ASSET_MAX_BYTES, rehypeInlineAssets } from './assets.ts';
import { escapeHtml } from './escape.ts';
import { rehypeHighlight } from './highlight.ts';
import { rehypeKatex } from './math.ts';
import { rehypeMermaid } from './mermaid.ts';
import { type CollectedMeta, collectMeta, countLines } from './meta.ts';
import { rehypeStripScripts, SANITIZED_SCHEMA, STATIC_SCHEMA } from './sanitize.ts';
import { rehypeSourceLines } from './source-lines.ts';
import {
  type CodeHighlighter,
  DEFAULT_SCRIPT_PLACEHOLDER,
  type RenderMeta,
  type RenderMode,
  type RenderOptions,
  type RenderResult,
  type Theme,
} from './types.ts';
import { rehypeVendorRewrite } from './vendor.ts';

export {
  ENGINE_OPTIONS,
  EXTRA_ALIASES,
  highlightToHtml,
  resolveLanguageId,
  SHIKI_THEMES,
  shikiHighlighter,
} from './highlight.ts';
export { renderMath } from './math.ts';
export { codeLanguage, frontMatterTitle } from './meta.ts';
export { SANITIZED_SCHEMA, STATIC_SCHEMA } from './sanitize.ts';
export { injectSourceLine } from './source-lines.ts';
export { THEME_CSS } from './theme.ts';
export {
  parseCdnUrl,
  requestedMajor,
  rewriteVendorUrl,
  VENDOR_LIBRARIES,
  type VendorLibrary,
  vendorPathFor,
} from './vendor.ts';
export type { CodeHighlighter, RenderMeta, RenderMode, RenderOptions, RenderResult, Theme };
export { DEFAULT_SCRIPT_PLACEHOLDER, escapeHtml };

export const MD_RENDER_VERSION = '0.1.0-m1';

export function render(markdown: string, options: RenderOptions = {}): RenderResult {
  const mode: RenderMode = options.mode ?? 'full';
  const allowScripts = mode === 'full' && (options.allowScripts ?? true);
  const placeholder = options.scriptPlaceholder ?? DEFAULT_SCRIPT_PLACEHOLDER;
  const rewrites = { count: 0 };
  let collected: CollectedMeta | null = null;

  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)
    .use(remarkMath)
    .use(() => (tree: MdastRoot) => {
      collected = collectMeta(tree);
    })
    .use(remarkRehype, { allowDangerousHtml: true, clobberPrefix: '' })
    .use(rehypeSourceLines)
    .use(rehypeRaw);

  if (mode === 'static')
    processor.use(rehypeStripScripts, placeholder).use(rehypeSanitize, STATIC_SCHEMA);
  else if (mode === 'sanitized')
    processor.use(rehypeStripScripts, placeholder).use(rehypeSanitize, SANITIZED_SCHEMA);
  else if (!allowScripts) processor.use(rehypeStripScripts, placeholder);

  processor.use(rehypeKatex);
  if (mode === 'full') processor.use(rehypeMermaid);
  processor.use(rehypeHighlight, options.highlighter);
  if (options.vendorBaseURL) processor.use(rehypeVendorRewrite, options.vendorBaseURL, rewrites);
  if (options.inlineAssets && options.assetLoader)
    processor.use(
      rehypeInlineAssets,
      options.assetLoader,
      options.inlineAssetMaxBytes ?? DEFAULT_INLINE_ASSET_MAX_BYTES,
    );
  processor.use(rehypeStringify, { allowDangerousHtml: true });

  const html = String(processor.processSync(markdown));
  const c: CollectedMeta = collected ?? {
    frontMatter: null,
    title: null,
    hasScripts: false,
    hasRawHtml: false,
    codeLanguages: [],
    hasMermaid: false,
    hasMath: false,
  };
  const meta: RenderMeta = {
    frontMatter: c.frontMatter,
    title: c.title,
    hasScripts: c.hasScripts,
    hasRawHtml: c.hasRawHtml,
    codeLanguages: c.codeLanguages,
    hasMermaid: c.hasMermaid,
    hasMath: c.hasMath,
    lineCount: countLines(markdown),
    rewrittenUrls: rewrites.count,
  };
  return { html, meta };
}
