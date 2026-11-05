// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { isTrustedOrigin, originOf } from './origin.ts';

describe('originOf', () => {
  it('handles http(s) with default and explicit ports', () => {
    expect(originOf('https://example.com/a/b')).toBe('https://example.com');
    expect(originOf('http://localhost:4173/x')).toBe('http://localhost:4173');
  });
  it('builds scheme://host for custom schemes', () => {
    expect(originOf('mdview://ABC-123/index.html')).toBe('mdview://abc-123');
    expect(originOf('MDVIEW://Doc/')).toBe('mdview://doc');
  });
  it('is "null" for opaque or invalid URLs', () => {
    expect(originOf('data:text/html,hi')).toBe('null');
    expect(originOf('not a url')).toBe('null');
    expect(originOf('file:///Users/x/doc.md')).toBe('null');
  });
});

describe('isTrustedOrigin', () => {
  const customBase = 'mdview://doc-42/';
  const tauriBase = 'http://mdview.localhost/doc-42/';
  const devBase = 'http://localhost:4173/docs/doc-42/';

  it('accepts the matching custom-scheme origin', () => {
    expect(isTrustedOrigin('mdview://doc-42', customBase)).toBe(true);
    expect(isTrustedOrigin('MDVIEW://DOC-42', customBase)).toBe(true);
  });
  it('rejects other documents and other schemes', () => {
    expect(isTrustedOrigin('mdview://doc-43', customBase)).toBe(false);
    expect(isTrustedOrigin('https://doc-42', customBase)).toBe(false);
    expect(isTrustedOrigin('https://evil.example', customBase)).toBe(false);
  });
  it('accepts the Tauri localhost mapping and dev server origins', () => {
    expect(isTrustedOrigin('http://mdview.localhost', tauriBase)).toBe(true);
    expect(isTrustedOrigin('http://localhost:4173', devBase)).toBe(true);
    expect(isTrustedOrigin('http://localhost:5173', devBase)).toBe(false);
  });
  it('treats "null", empty and missing origins as untrusted for tuple bases', () => {
    expect(isTrustedOrigin('null', customBase)).toBe(false);
    expect(isTrustedOrigin('null', devBase)).toBe(false);
    expect(isTrustedOrigin('', customBase)).toBe(false);
    expect(isTrustedOrigin(null, customBase)).toBe(false);
    expect(isTrustedOrigin(undefined, customBase)).toBe(false);
  });
  it('accepts "null" only when the base itself is opaque and not http(s)', () => {
    expect(isTrustedOrigin('null', 'file:///Users/x/doc.md')).toBe(true);
    expect(isTrustedOrigin('mdview://x', 'file:///Users/x/doc.md')).toBe(false);
  });
});
