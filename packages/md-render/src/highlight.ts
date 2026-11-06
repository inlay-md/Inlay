// SPDX-License-Identifier: Apache-2.0
/**
 * Shiki adapter. The browser (read-view) builds a core highlighter and loads
 * grammars lazily; the JavaScriptCore bundle uses `createHighlighterCoreSync`
 * over a curated grammar set (see highlight-bundled.ts). Both go through the
 * JavaScript regex engine with a conservative target (ADR-0006).
 */
import { createHighlighterCoreSync, type HighlighterCore, hastToHtml } from '@shikijs/core';
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript';
import type { LanguageRegistration, ThemeRegistrationAny } from '@shikijs/types';
import type { Element, Root } from 'hast';
import { toString as hastText } from 'hast-util-to-string';
import { visit } from 'unist-util-visit';
import type { CodeHighlighter } from './types.ts';

export type { CodeHighlighter };

export const SHIKI_THEMES = { light: 'github-light', dark: 'github-dark' } as const;

/** Oniguruma → JavaScript regex translation target shared by every build so output is identical. */
export const ENGINE_OPTIONS = { target: 'ES2018', forgiving: true } as const;

/** Aliases Shiki's grammars do not declare themselves. */
export const EXTRA_ALIASES: Readonly<Record<string, string>> = {
  golang: 'go',
  'c++': 'cpp',
  h: 'c',
  hpp: 'cpp',
  cc: 'cpp',
  mjs: 'javascript',
  cjs: 'javascript',
  mts: 'typescript',
  cts: 'typescript',
  node: 'javascript',
  yml: 'yaml',
  console: 'shellscript',
  shell: 'shellscript',
  'shell-script': 'shellscript',
  text: 'txt',
  plaintext: 'txt',
  plain: 'txt',
};

export function resolveLanguageId(lang: string, loaded: readonly string[]): string | null {
  const id = lang.toLowerCase();
  if (loaded.includes(id)) return id;
  const alias = EXTRA_ALIASES[id];
  if (alias && loaded.includes(alias)) return alias;
  return null;
}

/** Wraps a Shiki core highlighter as md-render's `CodeHighlighter`. */
export function shikiHighlighter(core: HighlighterCore): CodeHighlighter {
  const resolve = (lang: string) => resolveLanguageId(lang, core.getLoadedLanguages());
  return {
    supports: (lang) => resolve(lang) !== null,
    highlight: (code, lang) => {
      const id = resolve(lang);
      if (!id) return null;
      return core.codeToHast(code, {
        lang: id,
        themes: SHIKI_THEMES,
        defaultColor: false,
        cssVariablePrefix: '--shiki-',
      }) as Root;
    },
  };
}

export function createSyncHighlighter(
  langs: LanguageRegistration[][],
  themes: ThemeRegistrationAny[],
): CodeHighlighter {
  const core = createHighlighterCoreSync({
    themes,
    langs,
    engine: createJavaScriptRegexEngine(ENGINE_OPTIONS),
  });
  return shikiHighlighter(core);
}

function languageOf(code: Element): string | null {
  const cls = code.properties.className;
  const classes = Array.isArray(cls) ? cls.map(String) : [];
  for (const c of classes) {
    if (c.startsWith('language-')) {
      const lang = c.slice('language-'.length);
      if (lang && lang !== 'math' && lang !== 'mermaid') return lang;
    }
  }
  return null;
}

/** Shiki's `<pre>` for a code string, or null when the language is not loaded. */
export function highlightedPre(
  highlighter: CodeHighlighter,
  code: string,
  lang: string,
): Element | null {
  const root = highlighter.highlight(code, lang);
  const pre = root?.children.find((c): c is Element => c.type === 'element' && c.tagName === 'pre');
  if (!pre) return null;
  pre.properties.dataLang = lang;
  return pre;
}

/** HTML string variant used by read-view to upgrade already-painted code blocks in place. */
export function highlightToHtml(
  highlighter: CodeHighlighter,
  code: string,
  lang: string,
): string | null {
  const pre = highlightedPre(highlighter, code, lang);
  return pre ? hastToHtml(pre) : null;
}

/** rehype plugin: replaces `<pre><code class="language-x">` with Shiki output for loaded languages. */
export function rehypeHighlight(highlighter: CodeHighlighter | undefined) {
  return (tree: Root) => {
    if (!highlighter) return;
    visit(tree, 'element', (node, index, parent) => {
      if (!parent || index === undefined || node.tagName !== 'pre' || node.children.length !== 1)
        return;
      const code = node.children[0];
      if (code?.type !== 'element' || code.tagName !== 'code') return;
      const lang = languageOf(code);
      if (!lang || !highlighter.supports(lang)) return;
      const pre = highlightedPre(highlighter, hastText(code).replace(/\n$/, ''), lang);
      if (!pre) return;
      const range = node.properties.dataSourceLine;
      if (range !== undefined) pre.properties.dataSourceLine = range;
      parent.children[index] = pre;
    });
  };
}
