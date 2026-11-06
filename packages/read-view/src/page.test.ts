// SPDX-License-Identifier: Apache-2.0
import { render } from '@inlay-md/md-render';
import { describe, expect, it } from 'vitest';
import { composePage, devBarHtml } from './page.ts';
import { parseRange } from './scroll.ts';

describe('composePage', () => {
  const { html, meta } = render('# T\n\n$x$\n');
  const base = {
    docId: 'doc-1',
    baseURL: 'mdview://doc-1/',
    title: meta.title,
    bodyHtml: html,
    meta,
    runtimeBaseURL: 'mdview://doc-1/__inlay/',
    quarantined: false,
  };

  it('builds a full page with theme CSS, KaTeX stylesheet and the article wrapper', () => {
    const page = composePage({ ...base, theme: 'system' });
    expect(page.startsWith('<!doctype html>\n<html lang="en">')).toBe(true);
    expect(page).toContain('<title>T — Inlay</title>');
    expect(page).toContain('<style id="inlay-theme">');
    expect(page).toContain(
      '<link rel="stylesheet" href="mdview://doc-1/__inlay/vendor/katex/katex.min.css">',
    );
    expect(page).toContain(
      '<article id="inlay-root" class="inlay-doc" data-doc-id="doc-1" data-base-url="mdview://doc-1/">',
    );
    expect(page).not.toContain('inlay-dev-bar');
  });

  it('writes data-theme for forced themes and the dev bar when requested', () => {
    const page = composePage({
      ...base,
      theme: 'dark',
      devBarHtml: devBarHtml(['a.md', 'b.md'], 'b.md'),
      quarantined: true,
    });
    expect(page).toContain('<html lang="en" data-theme="dark">');
    expect(page).toContain('<option value="b.md" selected>b.md</option>');
    expect(page).toContain('data-quarantined="true"');
  });

  it('omits the KaTeX stylesheet without math and escapes the title', () => {
    const r = render('# <b>&</b>\n');
    const page = composePage({
      ...base,
      theme: 'light',
      title: r.meta.title,
      bodyHtml: r.html,
      meta: r.meta,
    });
    expect(page).not.toContain('katex.min.css');
    expect(page).toContain('<title>&amp; — Inlay</title>');
  });
});

describe('parseRange', () => {
  it('parses start-end and single lines', () => {
    expect(parseRange('3-7')).toEqual([3, 7]);
    expect(parseRange('12')).toEqual([12, 12]);
    expect(parseRange('0-1')).toBeNull();
    expect(parseRange('x')).toBeNull();
    expect(parseRange(undefined)).toBeNull();
  });
});
