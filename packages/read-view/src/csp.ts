// SPDX-License-Identifier: Apache-2.0
/**
 * Content-Security-Policy for Read view pages (ADR-0007). Mirrors
 * `MDViewSchemeHandler.contentSecurityPolicy` in apps/macos so the browser dev
 * server and Playwright exercise the same policy the app enforces. `self` is the
 * source expression for our own origin: `mdview:` in the app, `'self'` on http.
 */
export const CDN_ALLOWLIST = [
  'https://cdnjs.cloudflare.com',
  'https://cdn.jsdelivr.net',
  'https://unpkg.com',
] as const;

export interface CspOptions {
  /** Source expression for the page's own origin. */
  self: string;
  /** False for quarantined documents that are not trusted yet: no inline scripts. */
  trusted: boolean;
  /** Per-document "Allow network": widens connect/script/style/font to https:. */
  allowNetwork: boolean;
  nonce?: string;
  /** Vite dev server needs its HMR websocket. Never set in preview or in the app. */
  devConnect?: string;
}

export function contentSecurityPolicy(o: CspOptions): string {
  const cdn = CDN_ALLOWLIST.join(' ');
  const wide = o.allowNetwork ? ' https:' : '';
  const scriptSrc = o.trusted
    ? `'unsafe-inline' ${o.self} ${cdn}${wide}`
    : `'nonce-${o.nonce ?? 'none'}' ${o.self}`;
  let connect = o.allowNetwork ? 'https:' : "'none'";
  if (o.devConnect) connect = o.allowNetwork ? `https: ${o.devConnect}` : o.devConnect;
  return [
    "default-src 'none'",
    `script-src ${scriptSrc}`,
    `style-src 'unsafe-inline' ${o.self} ${cdn}${wide}`,
    `font-src ${o.self} data: ${cdn}${wide}`,
    `img-src ${o.self} data: blob: https:`,
    `media-src ${o.self} data: blob:`,
    `connect-src ${connect}`,
    "frame-src 'none'",
    "child-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}
