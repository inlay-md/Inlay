// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { embedSource, resolveInside } from '../fixtures-plugin.ts';

describe('dev view route', () => {
  it('embeds the payload like the native handler, escaping </ and ignoring $-patterns', () => {
    const template =
      '<!doctype html><html><head><script type="module" src="/x.js"></script></head><body></body></html>';
    const text = "Math $$x$$ and `$x$` then </script><script>alert(1)</script> and $& $' $`";
    const html = embedSource(template, { docId: 'd', text, baseURL: 'http://h/__fixtures/view/' });
    const open = '<script type="application/json" id="inlay-source">';
    const start = html.indexOf(open);
    expect(start).toBeGreaterThan(0);
    expect(html.indexOf('<body>')).toBeLessThan(start);
    const json = html.slice(start + open.length, html.indexOf('</script>', start));
    expect(json).not.toContain('</');
    expect((JSON.parse(json) as { text: string }).text).toBe(text);
    expect(html.match(/<script type="module"/g)).toHaveLength(1);
  });

  it('keeps document asset paths inside the folder', () => {
    const root = '/tmp/docs';
    expect(resolveInside(root, 'assets/a.svg')).toBe('/tmp/docs/assets/a.svg');
    expect(resolveInside(root, 'a%20b.png')).toBe('/tmp/docs/a b.png');
    expect(resolveInside(root, '../package.json')).toBeNull();
    expect(resolveInside(root, '..%2F..%2Fetc%2Fpasswd')).toBeNull();
    expect(resolveInside(root, '%2e%2e/x')).toBeNull();
    expect(resolveInside(root, 'a%00b')).toBeNull();
    expect(resolveInside(root, '%zz')).toBeNull();
  });
});
