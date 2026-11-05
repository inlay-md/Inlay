// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { createBundledHighlighter } from './highlight-bundled.ts';
import {
  codeLanguage,
  DEFAULT_SCRIPT_PLACEHOLDER,
  escapeHtml,
  frontMatterTitle,
  injectSourceLine,
  render,
} from './index.ts';

describe('render: meta', () => {
  it('reports front matter, title, scripts, languages, mermaid and math', () => {
    const md = [
      '---',
      'title: "From YAML"',
      'tags: [a]',
      '---',
      '',
      '# Heading title',
      '',
      '<script>alert(1)</script>',
      '',
      '```mermaid',
      'graph TD; A-->B',
      '```',
      '',
      '```TS title="x"',
      'const a = 1',
      '```',
      '',
      'Inline $x^2$ and',
      '',
      '$$',
      'E = mc^2',
      '$$',
      '',
    ].join('\n');
    const { html, meta } = render(md);
    expect(meta.frontMatter).toBe('title: "From YAML"\ntags: [a]');
    expect(meta.title).toBe('From YAML');
    expect(meta.hasScripts).toBe(true);
    expect(meta.hasRawHtml).toBe(true);
    expect(meta.codeLanguages).toEqual(['ts']);
    expect(meta.hasMermaid).toBe(true);
    expect(meta.hasMath).toBe(true);
    expect(meta.lineCount).toBe(23);
    expect(html).not.toContain('tags: [a]'); // front matter is hidden
    expect(html).toContain(
      '<pre data-source-line="10-12" class="mermaid" data-lang="mermaid">graph TD; A-->B</pre>',
    );
    expect(html).toContain('<script>alert(1)</script>');
    expect(html).toContain('class="inlay-math inlay-math-inline"');
    expect(html).toContain('<div class="inlay-math inlay-math-display" data-source-line="20-22">');
    expect(html).toContain('<span class="katex">');
  });

  it('falls back to the first heading for the title', () => {
    expect(render('Intro\n\n## Second level *em*\n').meta.title).toBe('Second level em');
    expect(render('').meta.title).toBeNull();
    expect(render('').meta.lineCount).toBe(0);
    expect(render('').html).toBe('');
  });

  it('counts CRLF and CR lines', () => {
    expect(render('a\r\nb\rc\nd').meta.lineCount).toBe(4);
    expect(render('# T\r\n\r\npara\r\n').html).toContain('<p data-source-line="3-3">para</p>');
  });

  it('normalizes fence info strings', () => {
    expect(codeLanguage('ts title="x"')).toBe('ts');
    expect(codeLanguage('{python}')).toBe('python');
    expect(codeLanguage('   ')).toBeNull();
    expect(codeLanguage(null)).toBeNull();
    expect(frontMatterTitle("title: 'quoted'\n")).toBe('quoted');
    expect(frontMatterTitle('name: x')).toBeNull();
  });
});

describe('render: source lines', () => {
  it('annotates block elements with start-end lines', () => {
    const { html } = render('# H\n\npara\nline two\n\n- a\n- b\n\n> q\n\n```js\nx\n```\n\n---\n');
    expect(html).toContain('<h1 data-source-line="1-1">H</h1>');
    expect(html).toContain('<p data-source-line="3-4">para\nline two</p>');
    expect(html).toContain('<ul data-source-line="6-7">');
    expect(html).toContain('<li data-source-line="6-6">a</li>');
    expect(html).toContain('<blockquote data-source-line="9-9">');
    expect(html).toContain(
      '<pre data-source-line="11-13"><code class="language-js">x\n</code></pre>',
    );
    expect(html).toContain('<hr data-source-line="15-15">');
  });

  it('injects data-source-line into top-level raw HTML blocks (ADR-0011) but not scripts, styles or comments', () => {
    const md =
      '<div class="box">\n\n**bold**\n\n</div>\n\n<script>1</script>\n\n<!-- c -->\n\n<style>.a{}</style>\n\npara <span>inline</span>.\n';
    const { html } = render(md);
    expect(html).toContain('<div data-source-line="1-1" class="box">');
    expect(html).toContain('<script>1</script>');
    expect(html).not.toContain('<script data-source-line');
    expect(html).toContain('<!-- c -->');
    expect(html).toContain('<style>.a{}</style>');
    expect(html).toContain('<p data-source-line="13-13">para <span>inline</span>.</p>');
    expect(html).not.toContain('<span data-source-line');
  });

  it('injectSourceLine handles the edge cases', () => {
    expect(injectSourceLine('<div>', '1-1')).toBe('<div data-source-line="1-1">');
    expect(injectSourceLine('  <my-widget a="1"/>', '2-2')).toBe(
      '  <my-widget data-source-line="2-2" a="1"/>',
    );
    expect(injectSourceLine('<svg\n viewBox="0 0 1 1">', '3-4')).toBe(
      '<svg data-source-line="3-4"\n viewBox="0 0 1 1">',
    );
    expect(injectSourceLine('</div>', '1-1')).toBe('</div>');
    expect(injectSourceLine('<!-- x --><div>', '1-1')).toBe('<!-- x --><div>');
    expect(injectSourceLine('<script>', '1-1')).toBe('<script>');
    expect(injectSourceLine('<div data-source-line="9-9">', '1-1')).toBe(
      '<div data-source-line="9-9">',
    );
  });

  it('keeps whitespace out of tables so rows stay inside', () => {
    const { html } = render('| a | b |\n|---|---|\n| 1 | 2 |\n');
    expect(html).toBe(
      '<table data-source-line="1-3"><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
    );
  });
});

describe('render: modes', () => {
  const md = [
    '<script src="x.js"></script>',
    '',
    '<div onclick="go()" style="color:red" id="widget"><svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="red"/></svg><a href="javascript:alert(1)">x</a><a href="https://ok.example/">ok</a></div>',
    '',
    '<style>.x{color:red}</style>',
    '',
    '<iframe src="https://evil.example"></iframe>',
    '',
    'Text <b onmouseover="x()">bold</b> ![i](./a.png)',
    '',
  ].join('\n');

  it('full keeps everything', () => {
    const { html } = render(md);
    expect(html).toContain('<script src="x.js"></script>');
    expect(html).toContain('onclick="go()"');
    expect(html).toContain('<iframe data-source-line="7-7" src="https://evil.example"></iframe>');
  });

  it('full with allowScripts=false strips scripts and handlers but keeps markup', () => {
    const { html } = render(md, { allowScripts: false, scriptPlaceholder: 'no scripts' });
    expect(html).not.toContain('<script');
    expect(html).toContain('<div class="inlay-script-placeholder" role="note">no scripts</div>');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('onmouseover');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('<iframe data-source-line="7-7" src="https://evil.example"></iframe>');
    expect(html).toContain('<style>.x{color:red}</style>');
  });

  it('static removes scripts, handlers, javascript: URLs and iframes but keeps style, inline styles, ids and SVG', () => {
    const { html } = render(md, { mode: 'static' });
    expect(html).toContain(
      `<div class="inlay-script-placeholder" role="note">${DEFAULT_SCRIPT_PLACEHOLDER}</div>`,
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('iframe');
    expect(html).toContain('style="color:red"');
    expect(html).toContain('id="widget"');
    expect(html).toContain('<circle cx="5" cy="5" r="4" fill="red"></circle>');
    expect(html).toContain('<a href="https://ok.example/">ok</a>');
    expect(html).toContain('<style>.x{color:red}</style>');
    expect(html).toContain('<img src="./a.png" alt="i">');
    expect(html).toContain('data-source-line="3-3"');
  });

  it('sanitized also drops style elements (with their text) and placeholders stay', () => {
    const { html } = render(md, { mode: 'sanitized' });
    expect(html).not.toContain('<style');
    expect(html).not.toContain('.x{color:red}');
    expect(html).toContain('inlay-script-placeholder');
    expect(html).toContain('<circle cx="5"');
  });

  it('allowScripts is ignored outside full mode', () => {
    expect(render('<script>1</script>', { mode: 'static', allowScripts: true }).html).not.toContain(
      '<script',
    );
  });

  it('keeps footnote ids unprefixed and renders GFM', () => {
    const { html } = render('Hi[^1]\n\n[^1]: Note\n\n- [x] done\n\n~~gone~~\n');
    expect(html).toContain('href="#fn-1"');
    expect(html).toContain('id="fn-1"');
    expect(html).toContain('<input type="checkbox" checked disabled>');
    expect(html).toContain('<del>gone</del>');
    const stat = render('Hi[^1]\n\n[^1]: Note\n', { mode: 'static' }).html;
    expect(stat).toContain('href="#fn-1"');
    expect(stat).toContain('id="fn-1"');
  });
});

describe('render: assets and highlighting', () => {
  it('inlines document-relative images through the asset loader with a size cap', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    const loader = (p: string) =>
      p === 'assets/a b.svg' ? svg : p === 'big.png' ? new Uint8Array(200) : null;
    const { html } = render(
      '![a](assets/a%20b.svg) ![b](big.png) ![c](https://x.example/c.png) ![d](missing.png)\n\n<img src="./assets/a%20b.svg">',
      { inlineAssets: true, assetLoader: loader, inlineAssetMaxBytes: 100 },
    );
    const expected = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    expect(html).toContain(`<img src="${expected}" alt="a" data-inlay-src="assets/a%20b.svg">`);
    expect(html).toContain(
      `<img data-source-line="3-3" src="${expected}" data-inlay-src="./assets/a%20b.svg">`,
    );
    expect(html).toContain('<img src="big.png" alt="b">');
    expect(html).toContain('<img src="https://x.example/c.png" alt="c">');
    expect(html).toContain('<img src="missing.png" alt="d">');
  });

  it('highlights known languages, leaves unknown ones as plain code', () => {
    const hl = createBundledHighlighter();
    const { html } = render('```js\nconst a = 1;\n```\n\n```nope\nx\n```\n\n```\nplain\n```\n', {
      highlighter: hl,
    });
    expect(html).toContain('<pre class="shiki shiki-themes github-light github-dark"');
    expect(html).toContain('data-lang="js" data-source-line="1-3"');
    expect(html).toContain('--shiki-light:');
    expect(html).toContain('--shiki-dark:');
    expect(html).toContain(
      '<pre data-source-line="5-7"><code class="language-nope">x\n</code></pre>',
    );
    expect(html).toContain('<pre data-source-line="9-11"><code>plain\n</code></pre>');
  });

  it('escapeHtml covers the five characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });
});
