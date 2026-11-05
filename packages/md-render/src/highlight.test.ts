// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { BUNDLED_LANGUAGE_IDS, createBundledHighlighter } from './highlight-bundled.ts';
import { highlightToHtml, resolveLanguageId } from './index.ts';

describe('highlighter', () => {
  const hl = createBundledHighlighter();

  it('resolves Shiki aliases and our extra aliases', () => {
    for (const lang of [
      'js',
      'ts',
      'py',
      'sh',
      'bash',
      'zsh',
      'yml',
      'md',
      'rb',
      'cs',
      'c++',
      'golang',
      'objc',
      'kt',
      'docker',
      'rs',
      'console',
    ]) {
      expect(hl.supports(lang), lang).toBe(true);
    }
    expect(hl.supports('nope')).toBe(false);
    expect(hl.supports('')).toBe(false);
    expect(resolveLanguageId('GoLang', ['go'])).toBe('go');
    expect(resolveLanguageId('x', ['go'])).toBeNull();
  });

  it('every bundled id is loaded exactly once', () => {
    expect(new Set(BUNDLED_LANGUAGE_IDS).size).toBe(BUNDLED_LANGUAGE_IDS.length);
    for (const id of BUNDLED_LANGUAGE_IDS) expect(hl.supports(id), id).toBe(true);
  });

  it('produces dual-theme HTML for in-place upgrades', () => {
    const html = highlightToHtml(hl, 'let x = 1', 'js');
    expect(html).toMatch(
      /^<pre class="shiki shiki-themes github-light github-dark" style="--shiki-light:[^"]+" tabindex="0" data-lang="js"><code>/,
    );
    expect(html).toContain('</code></pre>');
    expect(highlightToHtml(hl, 'x', 'nope')).toBeNull();
  });
});
