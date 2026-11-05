// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';

test.describe('Read view shell (M0)', () => {
  test('lists renderable fixtures and renders the first one', async ({ page }) => {
    await page.goto('/__inlay/');
    const options = page.locator('#inlay-fixture-picker option');
    await expect(options).not.toHaveCount(0);
    const files = await options.allTextContents();
    expect(files).toContain('gfm-basics.md');
    expect(files).not.toContain('undecodable.md');
    await expect(page.locator('#inlay-root .inlay-stub')).toBeVisible();
  });

  test('switching fixtures re-renders through md-render with the Host base URL', async ({
    page,
  }) => {
    await page.goto('/__inlay/?fixture=unicode-text.md');
    const root = page.locator('#inlay-root');
    await expect(root.locator('.inlay-stub')).toContainText('Tiếng Việt có dấu');
    await expect(root).toHaveAttribute('data-base-url', /\/__fixtures\/md\/$/);
    await expect(page).toHaveTitle(/Unicode text/);

    await page.selectOption('#inlay-fixture-picker', 'gfm-basics.md');
    await expect(root.locator('.inlay-stub')).toContainText('# GFM basics');
    await expect(page).toHaveURL(/fixture=gfm-basics\.md/);
  });

  test('the fixtures route refuses path traversal', async ({ request }) => {
    const ok = await request.get('/__fixtures/md/empty.md');
    expect(ok.status()).toBe(200);
    const bad = await request.get('/__fixtures/..%2F..%2Fpackage.json');
    expect([403, 404]).toContain(bad.status());
    const missing = await request.get('/__fixtures/md/nope.md');
    expect(missing.status()).toBe(404);
  });

  test('the 10k-line fixture renders quickly', async ({ page }) => {
    await page.goto('/__inlay/?fixture=perf-10k-lines.md');
    await expect(page.locator('#inlay-root .inlay-stub')).toContainText('Performance fixture');
    const status = await page.locator('#inlay-dev-status').textContent();
    expect(status).toMatch(/\d+ lines · rendered in/);
  });
});
