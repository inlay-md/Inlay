// SPDX-License-Identifier: Apache-2.0
/**
 * IME composition through the Chrome DevTools Protocol (`Input.imeSetComposition`,
 * `Input.insertText`): Vietnamese-style replacement of a base letter by a marked
 * one, CJK candidates, and Markdown syntax arriving through a composition, in both
 * editing modes. WebKit has no composition API in Playwright; the manual checklist
 * in docs/IME-CHECKLIST.md covers WKWebView.
 */
import { expect, type Page, test } from '@playwright/test';
import { editorPort } from '../playwright.config.ts';

const origin = `http://localhost:${editorPort}`;

test.describe('IME composition (Chromium)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'CDP only');

  async function compose(page: Page, steps: string[], commit: string) {
    const cdp = await page.context().newCDPSession(page);
    for (const text of steps) {
      await cdp.send('Input.imeSetComposition', {
        text,
        selectionStart: text.length,
        selectionEnd: text.length,
      });
    }
    await cdp.send('Input.insertText', { text: commit });
    await cdp.detach();
  }

  test('WYSIWYG: composed text lands once, input rules stay quiet, undo is one step', async ({
    page,
  }) => {
    await page.goto(`${origin}/__inlay/editor/?fixture=empty.md&mode=wysiwyg`);
    await page.waitForFunction(() => window.inlayEditor?.mode === 'wysiwyg');
    await page.locator('.ProseMirror').click();
    await page.keyboard.type('Xin ');
    // Telex: "chao" → "chào" through marked text, then committed.
    await compose(page, ['c', 'ch', 'cha', 'chao', 'chào'], 'chào');
    expect(await page.evaluate(() => window.inlayEditor?.getContent())).toBe('Xin chào');
    await page.keyboard.type(' ');
    // Markdown syntax arriving through a composition must not trigger input rules.
    await compose(page, ['*', '**', '**b', '**bold**'], '**bold**');
    expect(await page.evaluate(() => window.inlayEditor?.getContent())).toBe(
      'Xin chào \\*\\*bold\\*\\*',
    );
    expect(await page.locator('.ProseMirror strong').count()).toBe(0);
    // Typed (not composed) syntax still works.
    await page.keyboard.type(' **real**');
    await expect(page.locator('.ProseMirror strong')).toHaveText('real');
    // CJK candidates: hiragana marked text replaced by the chosen kanji.
    await page.keyboard.type(' ');
    await compose(page, ['に', 'にほ', 'にほん', 'にほんご'], '日本語');
    expect(await page.evaluate(() => window.inlayEditor?.getContent())).toContain(
      '**real** 日本語',
    );
    // Undo removes the last committed composition in one step.
    await page.keyboard.press('ControlOrMeta+z');
    expect(await page.evaluate(() => window.inlayEditor?.getContent())).not.toContain('日本語');
  });

  test('Source: composed text lands once and the document keeps its EOL', async ({ page }) => {
    await page.goto(`${origin}/__inlay/editor/?fixture=crlf.md`);
    await page.waitForFunction(() => typeof window.inlayEditor?.stats?.openMs === 'number');
    const before = (await page.evaluate(() => window.inlayEditor?.getContent())) ?? '';
    await page.evaluate(() => window.inlayEditor?.setCursorSourceLine(1));
    await page.keyboard.press('End');
    await page.keyboard.type(' ');
    await compose(page, ['t', 'ti', 'tie', 'tieng', 'tiếng'], 'tiếng');
    const after = (await page.evaluate(() => window.inlayEditor?.getContent())) ?? '';
    const firstBreak = before.indexOf('\r\n');
    expect(after).toBe(`${before.slice(0, firstBreak)} tiếng${before.slice(firstBreak)}`);
  });
});
