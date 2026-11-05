// SPDX-License-Identifier: Apache-2.0
/**
 * Known-library CDN URL rewriting (ADR-0008). `<script src>` and
 * `<link rel=stylesheet href>` pointing at Chart.js, ECharts, D3, Mermaid or
 * KaTeX on cdnjs, jsDelivr or unpkg are redirected to bundled copies under
 * `vendorBaseURL` so documents render offline. The requested major version must
 * match the bundled one (or be unspecified); otherwise the URL is left intact.
 */
import type { Root } from 'hast';
import { visit } from 'unist-util-visit';

export interface VendorLibrary {
  /** npm package name (jsDelivr/unpkg path segment). */
  npm: string;
  /** cdnjs library name (case-insensitive). */
  cdnjs: string;
  /** Bundled major version. For 0.x libraries (KaTeX) every 0.x request is accepted. */
  major: number;
  /** Folder under the vendor base. */
  dir: string;
  /** CDN file basename (or `""` for a bare package URL) → vendored file (relative to `dir`). */
  files: Record<string, string>;
}

export const VENDOR_LIBRARIES: readonly VendorLibrary[] = [
  {
    npm: 'chart.js',
    cdnjs: 'chart.js',
    major: 4,
    dir: 'chart.js',
    files: {
      '': 'chart.umd.js',
      'chart.umd.js': 'chart.umd.js',
      'chart.umd.min.js': 'chart.umd.js',
      'chart.min.js': 'chart.umd.js',
      'chart.js': 'chart.umd.js',
    },
  },
  {
    npm: 'echarts',
    cdnjs: 'echarts',
    major: 6,
    dir: 'echarts',
    files: {
      '': 'echarts.min.js',
      'echarts.min.js': 'echarts.min.js',
      'echarts.js': 'echarts.min.js',
      'echarts.common.min.js': 'echarts.min.js',
      'echarts.common.js': 'echarts.min.js',
      'echarts.simple.min.js': 'echarts.min.js',
      'echarts.simple.js': 'echarts.min.js',
    },
  },
  {
    npm: 'd3',
    cdnjs: 'd3',
    major: 7,
    dir: 'd3',
    files: { '': 'd3.min.js', 'd3.min.js': 'd3.min.js', 'd3.js': 'd3.min.js' },
  },
  {
    npm: 'mermaid',
    cdnjs: 'mermaid',
    major: 12,
    dir: 'mermaid',
    files: {
      '': 'mermaid.min.js',
      'mermaid.min.js': 'mermaid.min.js',
      'mermaid.js': 'mermaid.min.js',
    },
  },
  {
    npm: 'katex',
    cdnjs: 'katex',
    major: 0,
    dir: 'katex',
    files: {
      '': 'katex.min.js',
      'katex.min.js': 'katex.min.js',
      'katex.js': 'katex.min.js',
      'katex.min.css': 'katex.min.css',
      'katex.css': 'katex.min.css',
      'auto-render.min.js': 'contrib/auto-render.min.js',
      'auto-render.js': 'contrib/auto-render.min.js',
      'mhchem.min.js': 'contrib/mhchem.min.js',
      'mhchem.js': 'contrib/mhchem.min.js',
      'copy-tex.min.js': 'contrib/copy-tex.min.js',
      'copy-tex.js': 'contrib/copy-tex.min.js',
    },
  },
];

export interface ParsedCdnUrl {
  host: 'cdnjs' | 'jsdelivr' | 'unpkg';
  library: string;
  /** Raw version/range text as written, or null when unspecified. */
  version: string | null;
  /** Path after the package/version segment, without a leading slash ("" for bare package URLs). */
  path: string;
}

/** Parses a URL on one of the three allow-listed CDNs; null for anything else. */
export function parseCdnUrl(url: string): ParsedCdnUrl | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  const segments = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (host === 'cdnjs.cloudflare.com') {
    // /ajax/libs/<lib>/<version>/<path>
    if (segments[0] !== 'ajax' || segments[1] !== 'libs' || !segments[2] || !segments[3])
      return null;
    return {
      host: 'cdnjs',
      library: segments[2],
      version: segments[3],
      path: segments.slice(4).join('/'),
    };
  }
  let rest: string[];
  let cdn: 'jsdelivr' | 'unpkg';
  if (host === 'cdn.jsdelivr.net') {
    if (segments[0] !== 'npm') return null;
    rest = segments.slice(1);
    cdn = 'jsdelivr';
  } else if (host === 'unpkg.com') {
    rest = segments;
    cdn = 'unpkg';
  } else {
    return null;
  }
  let spec = rest[0];
  if (!spec) return null;
  let consumed = 1;
  if (spec.startsWith('@') && rest[1]) {
    spec = `${spec}/${rest[1]}`;
    consumed = 2;
  }
  const at = spec.lastIndexOf('@');
  let library = spec;
  let version: string | null = null;
  if (at > 0) {
    library = spec.slice(0, at);
    version = spec.slice(at + 1) || null;
  }
  return { host: cdn, library, version, path: rest.slice(consumed).join('/') };
}

/** Leading major of a version/range: "4.4.1" → 4, "^4" → 4, "latest" | null → null (= any). Unparseable → NaN. */
export function requestedMajor(version: string | null): number | null {
  if (version === null) return null;
  const v = version.trim().toLowerCase();
  if (v === '' || v === 'latest' || v === 'next' || v === '*' || v === 'x') return null;
  const m = /^[\^~=v]*(\d+)/.exec(v);
  if (!m?.[1]) return Number.NaN;
  return Number(m[1]);
}

function majorCompatible(lib: VendorLibrary, version: string | null): boolean {
  const major = requestedMajor(version);
  if (major === null) return true;
  if (Number.isNaN(major)) return false;
  return major === lib.major;
}

/** Returns the vendored path (relative to the vendor base) for a CDN URL, or null when it must stay as is. */
export function vendorPathFor(url: string): string | null {
  const parsed = parseCdnUrl(url);
  if (!parsed) return null;
  const name = parsed.library.toLowerCase();
  const lib = VENDOR_LIBRARIES.find((l) =>
    parsed.host === 'cdnjs' ? l.cdnjs === name : l.npm === name,
  );
  if (!lib) return null;
  if (!majorCompatible(lib, parsed.version)) return null;
  const path = parsed.path.split('?')[0] ?? '';
  const base = path === '' ? '' : (path.split('/').pop() ?? '');
  const file = lib.files[base];
  if (file === undefined) return null;
  return `${lib.dir}/${file}`;
}

export function rewriteVendorUrl(url: string, vendorBaseURL: string): string | null {
  const path = vendorPathFor(url);
  if (path === null) return null;
  return vendorBaseURL.endsWith('/') ? vendorBaseURL + path : `${vendorBaseURL}/${path}`;
}

/** rehype plugin: rewrites script/link URLs; counts rewrites into `counter.count`. */
export function rehypeVendorRewrite(vendorBaseURL: string, counter: { count: number }) {
  return (tree: Root) => {
    visit(tree, 'element', (node) => {
      let attr: 'src' | 'href' | null = null;
      if (node.tagName === 'script') attr = 'src';
      else if (node.tagName === 'link') {
        const rel = node.properties.rel;
        const rels = Array.isArray(rel) ? rel.map(String) : typeof rel === 'string' ? [rel] : [];
        if (
          rels.includes('stylesheet') ||
          rels.includes('preload') ||
          rels.includes('modulepreload')
        )
          attr = 'href';
      }
      if (!attr) return;
      const value = node.properties[attr];
      if (typeof value !== 'string') return;
      const rewritten = rewriteVendorUrl(value, vendorBaseURL);
      if (rewritten === null) return;
      node.properties[attr] = rewritten;
      node.properties.dataInlayVendor = value;
      // Subresource integrity hashes were computed for the CDN file, not our copy.
      delete node.properties.integrity;
      delete node.properties.crossOrigin;
      counter.count++;
    });
  };
}
