// SPDX-License-Identifier: Apache-2.0
/**
 * Browser-side syntax highlighting (ADR-0020): the page paints first with plain
 * `<pre><code class="language-x">`; then only the grammars the document uses are
 * imported and the blocks are upgraded in place with Shiki's dual-theme output.
 */
import {
  type CodeHighlighter,
  ENGINE_OPTIONS,
  EXTRA_ALIASES,
  highlightToHtml,
  shikiHighlighter,
} from '@inlay-md/md-render';
import { createHighlighterCore, type HighlighterCore } from '@shikijs/core';
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript';
import type { LanguageRegistration } from '@shikijs/types';
import { LAZY_LANGUAGES } from './languages.ts';

let corePromise: Promise<HighlighterCore> | null = null;

function core(): Promise<HighlighterCore> {
  corePromise ??= createHighlighterCore({
    themes: [import('@shikijs/themes/github-light'), import('@shikijs/themes/github-dark')],
    langs: [],
    engine: createJavaScriptRegexEngine(ENGINE_OPTIONS),
  });
  return corePromise;
}

/** Maps a fence language (possibly an alias) to a lazily loadable grammar id, or null. */
export function loaderIdFor(lang: string, loaded: readonly string[]): string | null {
  const id = lang.toLowerCase();
  if (loaded.includes(id) || id in LAZY_LANGUAGES) return id;
  const alias = EXTRA_ALIASES[id];
  if (alias && alias in LAZY_LANGUAGES) return alias;
  // Shiki grammar aliases (js → javascript, …) live inside the grammar files; try the
  // well-known ones here so we know which chunk to fetch.
  return SHIKI_ALIASES[id] ?? null;
}

const SHIKI_ALIASES: Readonly<Record<string, string>> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  sh: 'shellscript',
  bash: 'shellscript',
  zsh: 'shellscript',
  shell: 'shellscript',
  yml: 'yaml',
  md: 'markdown',
  rb: 'ruby',
  cs: 'csharp',
  'c#': 'csharp',
  'c++': 'cpp',
  kt: 'kotlin',
  kts: 'kotlin',
  objc: 'objective-c',
  docker: 'dockerfile',
  make: 'makefile',
  ps: 'powershell',
  ps1: 'powershell',
  rs: 'rust',
  gql: 'graphql',
  ex: 'elixir',
  exs: 'elixir',
  hs: 'haskell',
  tex: 'latex',
  properties: 'ini',
  f: 'sql',
};

/** Loads the grammars for `languages` (fence names) and returns a highlighter over them. */
export async function highlighterFor(languages: readonly string[]): Promise<CodeHighlighter> {
  const c = await core();
  const loaded = c.getLoadedLanguages();
  const wanted = new Set<string>();
  for (const lang of languages) {
    const id = loaderIdFor(lang, loaded);
    if (id && !loaded.includes(id) && id in LAZY_LANGUAGES) wanted.add(id);
  }
  const grammars = await Promise.all(
    [...wanted].map(async (id) => {
      const loader = LAZY_LANGUAGES[id];
      return loader ? (await loader()).default : ([] as LanguageRegistration[]);
    }),
  );
  if (grammars.length > 0) await c.loadLanguage(...grammars.flat());
  return shikiHighlighter(c);
}

function fenceLanguage(code: Element): string | null {
  for (const cls of code.classList) {
    if (cls.startsWith('language-')) {
      const lang = cls.slice('language-'.length);
      if (lang && lang !== 'math' && lang !== 'mermaid') return lang;
    }
  }
  return null;
}

/** Upgrades every plain fenced block under `root`; returns how many were highlighted. */
export async function upgradeCodeBlocks(
  root: ParentNode,
  languages: readonly string[],
): Promise<number> {
  if (languages.length === 0) return 0;
  const blocks = [...root.querySelectorAll<HTMLPreElement>('pre:not(.shiki):not(.mermaid) > code')];
  if (blocks.length === 0) return 0;
  const highlighter = await highlighterFor(languages);
  let count = 0;
  for (const code of blocks) {
    const pre = code.parentElement;
    const lang = fenceLanguage(code);
    if (!pre || !lang || !highlighter.supports(lang)) continue;
    const html = highlightToHtml(highlighter, (code.textContent ?? '').replace(/\n$/, ''), lang);
    if (!html) continue;
    const range = pre.dataset.sourceLine;
    const template = document.createElement('template');
    template.innerHTML = html;
    const next = template.content.firstElementChild as HTMLElement | null;
    if (!next) continue;
    if (range) next.dataset.sourceLine = range;
    pre.replaceWith(next);
    count++;
  }
  return count;
}
