// SPDX-License-Identifier: Apache-2.0
import { expect, type Page, test } from '@playwright/test';

const view = (file: string, query = '') => `/__fixtures/view/${encodeURIComponent(file)}${query}`;

async function rendered(page: Page): Promise<void> {
  await expect(page.locator('#inlay-root')).toBeAttached();
  await page.waitForFunction(() => typeof window.inlayReadView?.stats?.renderMs === 'number');
}

declare global {
  interface Window {
    inlayReadView?: {
      refresh(): void;
      getPosition(): { line: number; scrollY: number };
      scrollToSourceLine(line: number): boolean;
      setTheme(theme: 'light' | 'dark' | 'system'): void;
      stats: { renderMs: number; lineCount: number; highlighted: number; mermaid: number };
      ready: Promise<void>;
    };
  }
}

test.describe('Read view runtime', () => {
  test('the index lists renderable fixtures and links to the view route', async ({ page }) => {
    await page.goto('/__inlay/');
    const links = page.locator('#inlay-fixture-index a');
    await expect(links).not.toHaveCount(0);
    const files = await links.allTextContents();
    expect(files).toContain('gfm-basics.md');
    expect(files).not.toContain('undecodable.md');
    await links.filter({ hasText: 'gfm-basics.md' }).click();
    await expect(page).toHaveURL(/\/__fixtures\/view\/gfm-basics\.md$/);
    await expect(page.locator('#inlay-root h1')).toHaveText('GFM basics');
  });

  test('renders through document.write with the Host base URL, title and relative assets', async ({
    page,
  }) => {
    await page.goto(view('gfm-basics.md'));
    await rendered(page);
    await expect(page).toHaveTitle('GFM basics — Inlay');
    const root = page.locator('#inlay-root');
    await expect(root).toHaveAttribute(
      'data-base-url',
      /^http:\/\/localhost:\d+\/__fixtures\/view\/$/,
    );
    await expect(root.locator('table')).toBeVisible();
    await expect(root.locator('input[type=checkbox]')).toHaveCount(3);
    // The relative image resolves against the document folder and actually loads.
    const img = root.locator('img[alt="Sample"]');
    await expect(img).toBeVisible();
    await expect
      .poll(() => img.evaluate((e) => (e as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    // The shell's own markup is gone; the document is the page.
    expect(await page.locator('script#inlay-source').count()).toBe(0);
    expect(await page.evaluate(() => document.doctype?.name)).toBe('html');
  });

  test('the dev bar switches fixtures and reports render time', async ({ page }) => {
    await page.goto(view('unicode-text.md'));
    await rendered(page);
    await expect(page.locator('#inlay-root')).toContainText('Tiếng Việt có dấu');
    await expect(page.locator('#inlay-dev-status')).toHaveText(/\d+ lines · rendered in [\d.]+ ms/);
    await page.selectOption('#inlay-fixture-picker', 'tables.md');
    await expect(page).toHaveURL(/\/__fixtures\/view\/tables\.md$/);
    await expect(page.locator('#inlay-root h1')).toHaveText('Tables');
    await expect(page.locator('#inlay-root svg circle')).toBeAttached();
  });

  test('the view route carries the app CSP and refuses traversal', async ({ request }) => {
    const ok = await request.get(view('empty.md'));
    expect(ok.status()).toBe(200);
    const csp = ok.headers()['content-security-policy'] ?? '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain(
      "script-src 'unsafe-inline' 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com",
    );
    expect(csp).toContain("frame-src 'none'");
    const quarantined = await request.get(view('empty.md', '?quarantined=1'));
    const quarantinedCsp = quarantined.headers()['content-security-policy'] ?? '';
    expect(quarantinedCsp).toMatch(/script-src 'nonce-[^']+' 'self';/);
    expect(quarantinedCsp).not.toContain("script-src 'unsafe-inline'");
    const asset = await request.get('/__fixtures/view/assets/sample.svg');
    expect(asset.status()).toBe(200);
    expect(asset.headers()['content-type']).toBe('image/svg+xml');
    for (const bad of [
      '/__fixtures/view/..%2F..%2Fpackage.json',
      '/__fixtures/view/%2e%2e/%2e%2e/package.json',
      '/__fixtures/..%2F..%2Fpackage.json',
    ]) {
      const r = await request.get(bad);
      expect([403, 404], bad).toContain(r.status());
    }
    expect((await request.get('/__fixtures/view/nope.png')).status()).toBe(404);
    expect((await request.get('/__fixtures/view/nope.md')).status()).toBe(404);
  });

  test('scroll position maps to source lines and survives refresh', async ({ page }) => {
    await page.goto(view('perf-10k-lines.md'));
    await rendered(page);
    const before = await page.evaluate(() => window.inlayReadView?.getPosition());
    expect(before.line).toBe(1);
    const ok = await page.evaluate(() => window.inlayReadView?.scrollToSourceLine(5000));
    expect(ok).toBe(true);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
    const mid = await page.evaluate(() => window.inlayReadView?.getPosition());
    expect(mid.line).toBeGreaterThan(4900);
    expect(mid.line).toBeLessThan(5100);
    // refresh() reloads from the host and restores the position by source line.
    await page.evaluate(() => window.inlayReadView?.refresh());
    await rendered(page);
    await expect
      .poll(() => page.evaluate(() => window.inlayReadView?.getPosition().line))
      .toBeGreaterThan(4900);
    // A plain reload (what native does when the file changes) also restores it.
    await page.reload();
    await rendered(page);
    await expect
      .poll(() => page.evaluate(() => window.inlayReadView?.getPosition().line))
      .toBeGreaterThan(4900);
  });

  test('dark mode follows the system and can be overridden', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(view('gfm-basics.md'));
    await rendered(page);
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(await bg()).toBe('rgb(29, 29, 31)');
    await page.evaluate(() => window.inlayReadView?.setTheme('light'));
    expect(await bg()).toBe('rgb(255, 255, 255)');
    await page.evaluate(() => window.inlayReadView?.setTheme('system'));
    expect(await bg()).toBe('rgb(29, 29, 31)');
    await page.goto(view('gfm-basics.md', '?theme=light'));
    await rendered(page);
    expect(await bg()).toBe('rgb(255, 255, 255)');
  });

  test('the 10k-line fixture renders within budget', async ({ page }) => {
    await page.goto(view('perf-10k-lines.md'));
    await rendered(page);
    await expect(page.locator('#inlay-root h1')).toContainText('Performance fixture');
    const stats = await page.evaluate(() => window.inlayReadView?.stats);
    expect(stats.lineCount).toBeGreaterThanOrEqual(10_000);
    expect(stats.renderMs, `md-render took ${stats.renderMs.toFixed(0)} ms`).toBeLessThan(1500);
  });

  test('code blocks are highlighted lazily with dual-theme colours; unknown languages stay plain', async ({
    page,
  }) => {
    const cdnRequests: string[] = [];
    await page.route(
      /https:\/\/(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)\//,
      (route) => {
        cdnRequests.push(route.request().url());
        return route.abort();
      },
    );
    await page.goto(view('highlighting.md'));
    await rendered(page);
    await page.evaluate(() => window.inlayReadView?.ready);
    const stats = await page.evaluate(() => window.inlayReadView?.stats);
    expect(stats.highlighted).toBe(12);
    await expect(page.locator('pre.shiki')).toHaveCount(12);
    await expect(
      page.locator('pre.shiki[data-lang="golang"] span[style*="--shiki-light"]').first(),
    ).toBeAttached();
    await expect(page.locator('pre.shiki[data-source-line="3-9"]')).toHaveCount(1);
    await expect(page.locator('pre:not(.shiki) > code.language-foo-unknown')).toHaveCount(1);
    await expect(page.locator('pre:not(.shiki) > code:not([class])')).toHaveCount(1);
    const color = await page
      .locator('pre.shiki[data-lang="ts"] span.line span')
      .first()
      .evaluate((e) => getComputedStyle(e).color);
    expect(color).not.toBe('rgb(29, 29, 31)');
    expect(cdnRequests).toEqual([]);
  });

  test('math renders with KaTeX and the vendored fonts', async ({ page }) => {
    await page.goto(view('math.md'));
    await rendered(page);
    await expect(page.locator('.inlay-math-inline .katex')).toHaveCount(3);
    await expect(page.locator('.inlay-math-display .katex-display')).toHaveCount(2);
    await expect(page.locator('.katex-error')).toHaveCount(1);
    await expect(page.locator('#inlay-root')).toContainText('A price of $5 is not math');
    await expect(page.locator('pre code')).toContainText('$$ inside a code block stays literal $$');
    const stylesheet = page.locator('link[rel="stylesheet"][href$="vendor/katex/katex.min.css"]');
    await expect(stylesheet).toHaveCount(1);
    const fontLoaded = await page.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.check('16px KaTeX_Main');
    });
    expect(fontLoaded).toBe(true);
  });

  test('Mermaid diagrams render client-side from the vendored bundle and follow the theme', async ({
    page,
  }) => {
    const cdnRequests: string[] = [];
    await page.route(
      /https:\/\/(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)\//,
      (route) => {
        cdnRequests.push(route.request().url());
        return route.abort();
      },
    );
    await page.goto(view('mermaid.md'));
    await rendered(page);
    await page.evaluate(() => window.inlayReadView?.ready);
    const stats = await page.evaluate(() => window.inlayReadView?.stats);
    expect(stats.mermaid).toBe(3);
    await expect(page.locator('pre.mermaid > svg')).toHaveCount(3);
    await expect(page.locator('pre.mermaid .inlay-mermaid-error')).toHaveCount(1);
    await expect(page.locator('pre.mermaid .inlay-mermaid-error')).toContainText('Mermaid:');
    const mermaidScript = page.locator('script[src$="vendor/mermaid/mermaid.min.js"]');
    await expect(mermaidScript).toHaveCount(1);
    expect(cdnRequests).toEqual([]);
    // Re-render on theme change keeps the diagrams.
    await page.evaluate(() => window.inlayReadView?.setTheme('dark'));
    await expect.poll(() => page.locator('pre.mermaid > svg').count()).toBe(3);
  });
});
