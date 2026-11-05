// SPDX-License-Identifier: Apache-2.0
import { expect, type Page, test } from '@playwright/test';
import { editorPort } from '../playwright.config.ts';

const origin = `http://localhost:${editorPort}`;
const edit = (file: string, query = '') =>
  `${origin}/__inlay/editor/?fixture=${encodeURIComponent(file)}${query}`;

declare global {
  interface Window {
    inlayEditor?: {
      getContent(): string;
      getPosition(): { line: number; cursorLine: number; cursorColumn: number };
      scrollToSourceLine(line: number): boolean;
      setCursorSourceLine(line: number): void;
      isDirty(): boolean;
      stats: { openMs: number; lineCount: number };
      view: { state: { doc: { lines: number; length: number }; lineBreak: string } };
    };
    inlayMockHost?: {
      calls: Array<{ method: string; args: unknown[] }>;
      lastPosition: { line: number } | null;
      lastSavedText: string | null;
      saveDocument(): Promise<void>;
      simulateFileChanged(text?: string): void;
    };
  }
}

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => typeof window.inlayEditor?.stats?.openMs === 'number');
  await expect(page.locator('.cm-content')).toBeVisible();
}

const content = (page: Page) => page.evaluate(() => window.inlayEditor?.getContent() ?? null);
const dirtyCalls = (page: Page) =>
  page.evaluate(() =>
    (window.inlayMockHost?.calls ?? [])
      .filter((c) => c.method === 'setDirty')
      .map((c) => c.args[0]),
  );

test.describe('Source mode', () => {
  test('every fixture opens with its exact text', async ({ page, request }) => {
    const manifest = (await (await request.get(`${origin}/__fixtures/manifest.json`)).json()) as {
      fixtures: Array<{ file: string; utf8?: boolean }>;
    };
    for (const f of manifest.fixtures) {
      if (f.utf8 === false) continue;
      const bytes = await (await request.get(`${origin}/__fixtures/md/${f.file}`)).body();
      const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
      const expected = new TextDecoder('utf-8', { fatal: true }).decode(
        bom ? bytes.subarray(3) : bytes,
      );
      await page.goto(edit(f.file));
      await ready(page);
      expect(await content(page), f.file).toBe(expected);
      expect(await dirtyCalls(page), f.file).toEqual([]);
    }
  });

  test('mixed line endings: stray endings are visible, Enter inserts the dominant EOL, undo cleans', async ({
    page,
  }) => {
    await page.goto(edit('mixed-line-endings.md'));
    await ready(page);
    const before = (await content(page)) ?? '';
    expect(await page.evaluate(() => window.inlayEditor?.view.state.lineBreak)).toBe('\r\n');
    const special = page.locator('.cm-specialChar');
    // Two stray LFs and one stray CR in the fixture.
    await expect(special).toHaveCount(3);
    await expect(special.first()).toHaveAttribute('title', /newline/i);
    await expect(special.nth(2)).toHaveAttribute('title', /carriage return/i);

    // Cursor at the end of "Most lines end with CRLF." (source line 3), then Enter.
    await page.evaluate(() => window.inlayEditor?.setCursorSourceLine(4));
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');
    const after = (await content(page)) ?? '';
    expect(after.length).toBe(before.length + 2);
    expect(after).toContain('CRLF.\r\n\r\nThis one ends with a bare LF.\nBack');
    await expect.poll(() => dirtyCalls(page)).toEqual([true]);

    await page.keyboard.press('ControlOrMeta+z');
    expect(await content(page)).toBe(before);
    await expect.poll(() => dirtyCalls(page)).toEqual([true, false]);
  });

  test('an edit changes only its bytes and save pulls the live text', async ({ page }) => {
    await page.goto(edit('gfm-basics.md'));
    await ready(page);
    const before = (await content(page)) ?? '';
    await page.evaluate(() => window.inlayEditor?.setCursorSourceLine(1));
    await page.keyboard.press('End');
    await page.keyboard.type(' edited');
    const after = (await content(page)) ?? '';
    const firstBreak = before.indexOf('\n');
    expect(after).toBe(`${before.slice(0, firstBreak)} edited${before.slice(firstBreak)}`);
    await page.evaluate(() => window.inlayMockHost?.saveDocument());
    expect(await page.evaluate(() => window.inlayMockHost?.lastSavedText)).toBe(after);
    await expect.poll(() => dirtyCalls(page)).toEqual([true, false]);
    expect(await page.evaluate(() => window.inlayEditor?.isDirty())).toBe(false);
  });

  test('a change on disk accepted by the host replaces the text', async ({ page }) => {
    await page.goto(edit('empty.md'));
    await ready(page);
    await page.evaluate(() => window.inlayMockHost?.simulateFileChanged('# From disk\n\ntext\n'));
    await expect.poll(() => content(page)).toBe('# From disk\n\ntext\n');
    expect(await page.evaluate(() => window.inlayEditor?.isDirty())).toBe(false);
    await expect(page.locator('.cm-line').first()).toContainText('# From disk');
  });

  test('10k lines open in under a second and positions map to source lines', async ({ page }) => {
    await page.goto(edit('perf-10k-lines.md'));
    await ready(page);
    const stats = await page.evaluate(() => window.inlayEditor?.stats);
    expect(stats?.lineCount).toBeGreaterThanOrEqual(10_000);
    expect(stats?.openMs).toBeLessThan(1000);
    await page.evaluate(() => window.inlayEditor?.scrollToSourceLine(5000));
    await expect
      .poll(() => page.evaluate(() => window.inlayEditor?.getPosition().line ?? 0))
      .toBeGreaterThanOrEqual(4999);
    await expect
      .poll(() => page.evaluate(() => window.inlayMockHost?.lastPosition?.line ?? 0))
      .toBeGreaterThanOrEqual(4999);
    await page.evaluate(() => window.inlayEditor?.setCursorSourceLine(7000));
    const pos = await page.evaluate(() => window.inlayEditor?.getPosition());
    expect(pos?.cursorLine).toBe(7000);
    expect(pos?.cursorColumn).toBe(1);
  });

  test('theme: brass syntax marks, dark override', async ({ page }) => {
    await page.goto(edit('gfm-basics.md'));
    await ready(page);
    const mark = page.locator('.cm-line').first().locator('span').first();
    await expect(mark).toHaveText('#');
    await expect(mark).toHaveCSS('color', 'rgb(154, 110, 26)');
    await page.goto(edit('gfm-basics.md', '&theme=dark'));
    await ready(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('.cm-editor')).toHaveCSS('background-color', 'rgb(20, 26, 34)');
    await expect(page.locator('.cm-line').first().locator('span').first()).toHaveCSS(
      'color',
      'rgb(224, 168, 58)',
    );
  });
});
