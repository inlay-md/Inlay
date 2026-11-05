// SPDX-License-Identifier: Apache-2.0
// Entry for the JavaScriptCore IIFE. Everything exported here becomes a
// property of the global `InlayRender`. No DOM APIs may be used at render time.
// Code is highlighted synchronously with the bundled grammar set (ADR-0006).
import { createBundledHighlighter } from './highlight-bundled.ts';
import { render as baseRender, MD_RENDER_VERSION } from './index.ts';
import type { RenderOptions, RenderResult } from './types.ts';

export const version = MD_RENDER_VERSION;
export { BUNDLED_LANGUAGE_IDS as languages } from './highlight-bundled.ts';
export { THEME_CSS as themeCSS } from './theme.ts';

export function render(markdown: string, options: RenderOptions = {}): RenderResult {
  const withHighlighter = options.highlighter
    ? options
    : { ...options, highlighter: createBundledHighlighter() };
  return baseRender(markdown, withHighlighter);
}
