// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from './csp.ts';

describe('contentSecurityPolicy (mirrors MDViewSchemeHandler.contentSecurityPolicy)', () => {
  it('trusted document, no network', () => {
    expect(contentSecurityPolicy({ self: 'mdview:', trusted: true, allowNetwork: false })).toBe(
      "default-src 'none'; script-src 'unsafe-inline' mdview: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com; style-src 'unsafe-inline' mdview: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com; font-src mdview: data: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com; img-src mdview: data: blob: https:; media-src mdview: data: blob:; connect-src 'none'; frame-src 'none'; child-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
    );
  });
  it('untrusted document gets nonce-only scripts', () => {
    const csp = contentSecurityPolicy({
      self: 'mdview:',
      trusted: false,
      allowNetwork: false,
      nonce: 'abc',
    });
    expect(csp).toContain("script-src 'nonce-abc' mdview:;");
    expect(csp).not.toContain("script-src 'unsafe-inline'");
  });
  it('allow network widens connect/script/style/font to https:', () => {
    const csp = contentSecurityPolicy({ self: "'self'", trusted: true, allowNetwork: true });
    expect(csp).toContain('connect-src https:;');
    expect(csp).toContain(
      "script-src 'unsafe-inline' 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https:;",
    );
    expect(csp).toContain(
      "font-src 'self' data: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https:;",
    );
  });
  it('dev server adds its websocket to connect-src only', () => {
    const csp = contentSecurityPolicy({
      self: "'self'",
      trusted: true,
      allowNetwork: false,
      devConnect: "'self' ws: wss:",
    });
    expect(csp).toContain("connect-src 'self' ws: wss:;");
  });
});
