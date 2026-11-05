// SPDX-License-Identifier: Apache-2.0
/** rehype plugin: inlines document-relative images as data URIs (Quick Look, export). */
import type { Root } from 'hast';
import { visit } from 'unist-util-visit';

export const DEFAULT_INLINE_ASSET_MAX_BYTES = 5 * 1024 * 1024;

const MIME: Record<string, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
};

/** True for URLs that are relative to the document (no scheme, not protocol-relative, not a fragment). */
export function isDocumentRelative(url: string): boolean {
  if (url === '' || url.startsWith('#') || url.startsWith('//') || url.startsWith('/'))
    return false;
  return !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url);
}

function toBase64(bytes: Uint8Array): string {
  // Works in browsers, Node and JavaScriptCore (no Buffer / btoa needed for large input).
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += `${alphabet[(n >> 18) & 63]}${alphabet[(n >> 12) & 63]}${alphabet[(n >> 6) & 63]}${alphabet[n & 63]}`;
  }
  if (i < bytes.length) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8);
    out += `${alphabet[(n >> 18) & 63]}${alphabet[(n >> 12) & 63]}`;
    out += i + 1 < bytes.length ? `${alphabet[(n >> 6) & 63]}` : '=';
    out += '=';
  }
  return out;
}

export function dataUri(bytes: Uint8Array, relPath: string): string | null {
  const ext = relPath.split('?')[0]?.split('#')[0]?.split('.').pop()?.toLowerCase() ?? '';
  const mime = MIME[ext];
  if (!mime) return null;
  return `data:${mime};base64,${toBase64(bytes)}`;
}

export function rehypeInlineAssets(
  loader: (relPath: string) => Uint8Array | null,
  maxBytes: number = DEFAULT_INLINE_ASSET_MAX_BYTES,
) {
  return (tree: Root) => {
    visit(tree, 'element', (node) => {
      if (node.tagName !== 'img') return;
      const src = node.properties.src;
      if (typeof src !== 'string' || !isDocumentRelative(src)) return;
      let relPath: string;
      try {
        relPath = decodeURIComponent(src.split('?')[0]?.split('#')[0] ?? src);
      } catch {
        return;
      }
      while (relPath.startsWith('./')) relPath = relPath.slice(2);
      const bytes = loader(relPath);
      if (!bytes || bytes.length > maxBytes) return;
      const uri = dataUri(bytes, relPath);
      if (uri) {
        node.properties.src = uri;
        node.properties.dataInlaySrc = src;
      }
    });
  };
}
