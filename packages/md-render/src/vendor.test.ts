// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseCdnUrl,
  render,
  requestedMajor,
  rewriteVendorUrl,
  VENDOR_LIBRARIES,
  vendorPathFor,
} from './index.ts';

const BASE = 'mdview://doc/__inlay/vendor/';

describe('vendor URL rewriting (ADR-0008)', () => {
  it.each([
    ['https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.js', 'chart.js/chart.umd.js'],
    ['https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js', 'chart.js/chart.umd.js'],
    ['https://cdn.jsdelivr.net/npm/chart.js', 'chart.js/chart.umd.js'],
    ['https://cdn.jsdelivr.net/npm/chart.js@latest', 'chart.js/chart.umd.js'],
    ['https://cdn.jsdelivr.net/npm/chart.js@^4.0.0/dist/chart.umd.js', 'chart.js/chart.umd.js'],
    ['https://unpkg.com/chart.js@4/dist/chart.umd.js', 'chart.js/chart.umd.js'],
    ['https://unpkg.com/chart.js', 'chart.js/chart.umd.js'],
    ['https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js', 'chart.js/chart.umd.js'],
    [
      'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
      'chart.js/chart.umd.js',
    ],
    ['https://cdn.jsdelivr.net/npm/echarts@6/dist/echarts.min.js', 'echarts/echarts.min.js'],
    ['https://cdn.jsdelivr.net/npm/echarts@6.0.0/dist/echarts.js', 'echarts/echarts.min.js'],
    [
      'https://cdnjs.cloudflare.com/ajax/libs/echarts/6.0.0/echarts.min.js',
      'echarts/echarts.min.js',
    ],
    ['https://unpkg.com/echarts@6/dist/echarts.common.min.js', 'echarts/echarts.min.js'],
    ['https://cdn.jsdelivr.net/npm/d3@7', 'd3/d3.min.js'],
    ['https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js', 'd3/d3.min.js'],
    ['https://unpkg.com/d3@7/dist/d3.js', 'd3/d3.min.js'],
    ['https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js', 'd3/d3.min.js'],
    ['https://cdn.jsdelivr.net/npm/mermaid@12/dist/mermaid.min.js', 'mermaid/mermaid.min.js'],
    ['https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js', 'mermaid/mermaid.min.js'],
    ['https://unpkg.com/mermaid@12.0.0/dist/mermaid.js', 'mermaid/mermaid.min.js'],
    ['https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js', 'katex/katex.min.js'],
    ['https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css', 'katex/katex.min.css'],
    [
      'https://cdn.jsdelivr.net/npm/katex@0.16/dist/contrib/auto-render.min.js',
      'katex/contrib/auto-render.min.js',
    ],
    ['https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css', 'katex/katex.min.css'],
    [
      'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/contrib/auto-render.min.js',
      'katex/contrib/auto-render.min.js',
    ],
    ['http://unpkg.com/katex/dist/katex.min.js?x=1', 'katex/katex.min.js'],
  ])('rewrites %s', (url, path) => {
    expect(vendorPathFor(url)).toBe(path);
    expect(rewriteVendorUrl(url, BASE)).toBe(BASE + path);
    expect(rewriteVendorUrl(url, 'cid:vendor')).toBe(`cid:vendor/${path}`);
  });

  it.each([
    'https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js', // older major
    'https://cdn.jsdelivr.net/npm/chart.js@5/dist/chart.umd.js', // newer major
    'https://cdnjs.cloudflare.com/ajax/libs/echarts/5.4.3/echarts.min.js',
    'https://cdn.jsdelivr.net/npm/d3@6',
    'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js',
    'https://cdn.jsdelivr.net/npm/mermaid@12/dist/mermaid.esm.min.mjs', // not a vendored file
    'https://cdn.jsdelivr.net/npm/chart.js@4/dist/helpers.js',
    'https://cdn.jsdelivr.net/npm/lodash@4/lodash.min.js', // unknown library
    'https://cdn.jsdelivr.net/gh/chartjs/Chart.js@4/dist/chart.umd.js', // not the npm endpoint
    'https://example.com/npm/chart.js@4/dist/chart.umd.js', // not an allow-listed CDN
    'https://cdn.jsdelivr.net/npm/chart.js@banana/dist/chart.umd.js',
    'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/chart.umd.js', // malformed cdnjs path
    'chart.umd.js',
    'mdview://doc/chart.umd.js',
  ])('leaves %s intact', (url) => {
    expect(vendorPathFor(url)).toBeNull();
    expect(rewriteVendorUrl(url, BASE)).toBeNull();
  });

  it('parses CDN URL forms', () => {
    expect(parseCdnUrl('https://cdn.jsdelivr.net/npm/@scope/pkg@1.2.3/dist/x.js')).toEqual({
      host: 'jsdelivr',
      library: '@scope/pkg',
      version: '1.2.3',
      path: 'dist/x.js',
    });
    expect(parseCdnUrl('https://unpkg.com/d3')).toEqual({
      host: 'unpkg',
      library: 'd3',
      version: null,
      path: '',
    });
    expect(parseCdnUrl('https://cdnjs.cloudflare.com/ajax/libs/d3/7.0.0/d3.min.js')).toEqual({
      host: 'cdnjs',
      library: 'd3',
      version: '7.0.0',
      path: 'd3.min.js',
    });
    expect(parseCdnUrl('not a url')).toBeNull();
    expect(parseCdnUrl('https://cdn.jsdelivr.net:443/npm/d3@7?x=1#y')).toEqual({
      host: 'jsdelivr',
      library: 'd3',
      version: '7',
      path: '',
    });
    expect(parseCdnUrl('ftp://cdn.jsdelivr.net/npm/d3')).toBeNull();
    expect(requestedMajor(null)).toBeNull();
    expect(requestedMajor('latest')).toBeNull();
    expect(requestedMajor('^4.2')).toBe(4);
    expect(requestedMajor('v7')).toBe(7);
    expect(requestedMajor('beta')).toBeNaN();
  });

  it('rewrites script and stylesheet elements in documents and drops integrity hashes', () => {
    const md = [
      '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" integrity="sha384-x" crossorigin="anonymous">',
      '<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.js" integrity="sha384-y" crossorigin="anonymous"></script>',
      '<script src="https://cdn.jsdelivr.net/npm/chart.js@3/dist/chart.min.js"></script>',
      '<script type="module" src="https://unpkg.com/d3@7"></script>',
      '<link rel="icon" href="https://cdn.jsdelivr.net/npm/d3@7">',
      '',
    ].join('\n');
    const { html, meta } = render(md, { vendorBaseURL: BASE });
    expect(meta.rewrittenUrls).toBe(3);
    expect(html).toContain(
      `<link data-source-line="1-5" rel="stylesheet" href="${BASE}katex/katex.min.css" data-inlay-vendor="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">`,
    );
    expect(html).toContain(
      `<script src="${BASE}chart.js/chart.umd.js" data-inlay-vendor="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.js"></script>`,
    );
    expect(html).toContain(
      '<script src="https://cdn.jsdelivr.net/npm/chart.js@3/dist/chart.min.js"></script>',
    );
    expect(html).toContain(`<script type="module" src="${BASE}d3/d3.min.js"`);
    expect(html).toContain('<link rel="icon" href="https://cdn.jsdelivr.net/npm/d3@7">');
    expect(html).not.toContain('integrity');
    expect(render(md).meta.rewrittenUrls).toBe(0);
  });

  it('bundled majors match the vendored package versions installed for read-view', () => {
    for (const lib of VENDOR_LIBRARIES) {
      const url = new URL(`../../read-view/node_modules/${lib.npm}/package.json`, import.meta.url);
      const pkg = JSON.parse(readFileSync(url, 'utf8')) as { version: string };
      expect(Number(pkg.version.split('.')[0]), `${lib.npm}@${pkg.version}`).toBe(lib.major);
    }
  });
});
