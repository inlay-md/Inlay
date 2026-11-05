// SPDX-License-Identifier: Apache-2.0
import { expect, type Page, test } from '@playwright/test';
import { editorPort } from '../playwright.config.ts';

const origin = `http://localhost:${editorPort}`;
const edit = (file: string, query = '') =>
  `${origin}/__inlay/editor/?fixture=${encodeURIComponent(file)}&mode=wysiwyg${query}`;

interface Stats {
  blocks: number;
  exact: number;
  restyled: number;
  islands: number;
  inlineIslands: number;
  pending: number;
  loadMs: number;
}

declare global {
  interface Window {
    inlayEditor?: {
      mode: 'source' | 'wysiwyg';
      setMode(mode: 'source' | 'wysiwyg'): void;
      getContent(): string;
      getPosition(): { line: number; cursorLine: number; cursorColumn: number };
      scrollToSourceLine(line: number): boolean;
      setCursorSourceLine(line: number): void;
      isDirty(): boolean;
      stats: { openMs: number; lineCount: number; wysiwyg: Stats | null };
      view: { state: { doc: { lines: number; length: number }; lineBreak: string } };
      wysiwygView: { state: { doc: { childCount: number } } } | null;
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

/** Puts the caret at the end of the text inside a WYSIWYG element (End is not a caret key on macOS). */
async function caretToEnd(page: Page, selector: string, text: string): Promise<void> {
  await page
    .locator(selector, { hasText: text })
    .first()
    .evaluate((el) => {
      const view = window.inlayEditor?.wysiwygView as unknown as {
        posAtDOM(node: Node, offset: number): number;
        state: {
          doc: { resolve(pos: number): unknown };
          selection: { constructor: { near(pos: unknown): unknown } };
          tr: { setSelection(sel: unknown): unknown };
        };
        dispatch(tr: unknown): void;
        focus(): void;
      };
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let last: Node | null = null;
      while (walker.nextNode()) last = walker.currentNode;
      const target = last ?? el;
      const pos = view.posAtDOM(target, target.textContent?.length ?? 0);
      const near = view.state.selection.constructor.near(view.state.doc.resolve(pos));
      view.dispatch(view.state.tr.setSelection(near));
      view.focus();
    });
}

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(
    () => window.inlayEditor?.mode === 'wysiwyg' && !!window.inlayEditor.wysiwygView,
  );
  await expect(page.locator('.inlay-wysiwyg .ProseMirror')).toBeVisible();
}

async function verified(page: Page): Promise<Stats> {
  await page.waitForFunction(() => (window.inlayEditor?.stats.wysiwyg?.pending ?? 1) === 0);
  return (await page.evaluate(() => window.inlayEditor?.stats.wysiwyg)) as Stats;
}

const content = (page: Page) => page.evaluate(() => window.inlayEditor?.getContent() ?? null);
const dirtyCalls = (page: Page) =>
  page.evaluate(() =>
    (window.inlayMockHost?.calls ?? [])
      .filter((c) => c.method === 'setDirty')
      .map((c) => c.args[0]),
  );

test.describe('WYSIWYG mode', () => {
  test('every fixture opens with its exact text and islands only where expected', async ({
    page,
    request,
  }) => {
    const manifest = (await (await request.get(`${origin}/__fixtures/manifest.json`)).json()) as {
      fixtures: Array<{ file: string; utf8?: boolean; islands?: boolean }>;
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
      const stats = await verified(page);
      if (f.islands) expect(stats.islands + stats.inlineIslands, f.file).toBeGreaterThan(0);
      else expect(stats.islands + stats.inlineIslands, f.file).toBe(0);
      expect(await content(page), `${f.file} after verification`).toBe(expected);
      expect(await dirtyCalls(page), f.file).toEqual([]);
    }
  });

  test('typing into a paragraph changes only its block and save pulls the live text', async ({
    page,
  }) => {
    await page.goto(edit('gfm-basics.md'));
    await ready(page);
    const before = (await content(page)) ?? '';
    await caretToEnd(page, '.ProseMirror p', 'Final paragraph.');
    await page.keyboard.type(' Edited in WYSIWYG.');
    const after = (await content(page)) ?? '';
    const start = before.indexOf('Final paragraph.');
    const end = start + 'Final paragraph.'.length;
    expect(after).toBe(
      `${before.slice(0, start)}Final paragraph. Edited in WYSIWYG.${before.slice(end)}`,
    );
    await expect.poll(() => dirtyCalls(page)).toEqual([true]);
    await page.evaluate(() => window.inlayMockHost?.saveDocument());
    expect(await page.evaluate(() => window.inlayMockHost?.lastSavedText)).toBe(after);
    await expect.poll(() => dirtyCalls(page)).toEqual([true, false]);
    // Undo back to the saved text is clean again.
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => dirtyCalls(page)).toEqual([true, false, true]);
  });

  test('a restyled block keeps its bytes until it is edited', async ({ page }) => {
    await page.goto(edit('gfm-basics.md'));
    await ready(page);
    const before = (await content(page)) ?? '';
    expect(before).toContain('| a    |   b    |     c |');
    // Edit the heading above the table: the hand-padded table stays as it was.
    await caretToEnd(page, '.ProseMirror h2', 'Table with alignment');
    await page.keyboard.type('!');
    const after = (await content(page)) ?? '';
    expect(after).toContain('## Table with alignment!');
    expect(after).toContain('| a    |   b    |     c |');
    // Editing the table itself re-pads it, but only the table changes.
    await caretToEnd(page, '.ProseMirror td', 'long cell');
    await page.keyboard.type('s');
    const edited = (await content(page)) ?? '';
    expect(edited).toContain('long cells');
    expect(edited.split('## Code')[1]).toBe(after.split('## Code')[1]);
  });

  test('switching modes keeps the text, the caret line and the dirty state', async ({ page }) => {
    await page.goto(edit('gfm-basics.md'));
    await ready(page);
    await caretToEnd(page, '.ProseMirror h2', 'Task list');
    const wysiwygPos = await page.evaluate(() => window.inlayEditor?.getPosition());
    await page.evaluate(() => window.inlayEditor?.setMode('source'));
    await page.waitForFunction(() => window.inlayEditor?.mode === 'source');
    await expect(page.locator('.cm-content')).toBeVisible();
    const sourcePos = await page.evaluate(() => window.inlayEditor?.getPosition());
    expect(sourcePos?.cursorLine).toBe(wysiwygPos?.cursorLine);
    expect(await page.evaluate(() => window.inlayEditor?.isDirty())).toBe(false);
    // Edit in Source, switch back: WYSIWYG shows the edit and is dirty.
    await page.keyboard.press('End');
    await page.keyboard.type(' (edited in source)');
    await page.evaluate(() => window.inlayEditor?.setMode('wysiwyg'));
    await page.waitForFunction(() => window.inlayEditor?.mode === 'wysiwyg');
    await expect(page.locator('.ProseMirror h2', { hasText: '(edited in source)' })).toBeVisible();
    expect(await page.evaluate(() => window.inlayEditor?.isDirty())).toBe(true);
    const back = await page.evaluate(() => window.inlayEditor?.getPosition());
    expect(back?.cursorLine).toBe(sourcePos?.cursorLine);
    await expect.poll(() => dirtyCalls(page)).toEqual([true]);
  });

  test('a change on disk accepted by the host replaces the document', async ({ page }) => {
    await page.goto(edit('empty.md'));
    await ready(page);
    await page.evaluate(() => window.inlayMockHost?.simulateFileChanged('# From disk\n\ntext\n'));
    await expect.poll(() => content(page)).toBe('# From disk\n\ntext\n');
    await expect(page.locator('.ProseMirror h1')).toHaveText('From disk');
    expect(await page.evaluate(() => window.inlayEditor?.isDirty())).toBe(false);
  });

  test('10k lines open in under a second and positions map to source lines', async ({ page }) => {
    await page.goto(edit('perf-10k-lines.md'));
    await ready(page);
    const stats = await page.evaluate(() => window.inlayEditor?.stats);
    expect(stats?.lineCount).toBeGreaterThanOrEqual(10_000);
    expect(stats?.openMs, `open ${stats?.openMs} ms`).toBeLessThan(1000);
    await page.evaluate(() => window.inlayEditor?.scrollToSourceLine(5000));
    await expect
      .poll(() => page.evaluate(() => window.inlayEditor?.getPosition().line ?? 0))
      .toBeGreaterThanOrEqual(4990);
    await page.evaluate(() => window.inlayEditor?.setCursorSourceLine(7000));
    const pos = await page.evaluate(() => window.inlayEditor?.getPosition());
    expect(pos?.cursorLine).toBe(7000);
    const after = await verified(page);
    expect(after.islands).toBe(0);
  });
});
