// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { escapeHtml, render } from './index.ts';

describe('render (M0 stub)', () => {
  it('escapes markup and reports meta', () => {
    const { html, meta } = render(
      '# Title\n\n<script>alert(1)</script>\n```mermaid\ngraph TD\n```\n$x$',
    );
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('data-source-line="1-7"');
    expect(meta.title).toBe('Title');
    expect(meta.hasScripts).toBe(true);
    expect(meta.hasMermaid).toBe(true);
    expect(meta.hasMath).toBe(true);
    expect(meta.lineCount).toBe(7);
  });
  it('handles the empty document', () => {
    const { html, meta } = render('');
    expect(meta.lineCount).toBe(0);
    expect(meta.title).toBeNull();
    expect(html).toContain('data-source-line="1-0"');
  });
  it('counts CRLF and CR lines', () => {
    expect(render('a\r\nb\rc\nd').meta.lineCount).toBe(4);
  });
  it('escapeHtml covers the five characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });
});
