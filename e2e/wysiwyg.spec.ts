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
    // Opening is measured up to three times: parallel workers (and a concurrent Xcode build on a
    // developer machine) can double a single reading, and "feels instant" is about the steady state.
    // The one-second budget is the Mac target; GitHub's Linux WebKit runs the same open in 1.1–1.6 s,
    // so CI only guards against a gross regression.
    const budget = process.env.CI ? 2000 : 1000;
    const opens: number[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.goto(edit('perf-10k-lines.md'));
      await ready(page);
      const stats = await page.evaluate(() => window.inlayEditor?.stats);
      expect(stats?.lineCount).toBeGreaterThanOrEqual(10_000);
      opens.push(Math.round(stats?.openMs ?? Number.POSITIVE_INFINITY));
      if ((opens[opens.length - 1] ?? Number.POSITIVE_INFINITY) < budget) break;
    }
    expect(Math.min(...opens), `open times ${opens.join(', ')} ms`).toBeLessThan(budget);
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

test.describe('Islands', () => {
  test('HTML and SVG islands render a sanitized preview; scripts stay inert', async ({ page }) => {
    await page.goto(edit('inline-svg.md'));
    await ready(page);
    const island = page.locator('.inlay-island[data-kind="svg"]').first();
    await expect(island).toBeVisible();
    await expect(island.locator('.inlay-island-kind')).toHaveText('SVG');
    await expect(island.locator('.inlay-island-body svg').first()).toBeVisible();
    await expect(island.locator('.inlay-island-meta')).toContainText('kept byte for byte');

    await page.goto(edit('chart-chartjs.md'));
    await ready(page);
    const script = page.locator('.inlay-island[data-kind="script"]').first();
    await expect(script).toBeVisible();
    await expect(script.locator('.inlay-island-kind')).toHaveText('Script');
    await expect(script.locator('.inlay-island-meta')).toContainText(
      'chart.js from the bundled copy',
    );
    await expect(script.locator('.inlay-island-read')).toBeVisible();
    expect(await page.locator('.inlay-wysiwyg script').count()).toBe(0);
    await script.locator('.inlay-island-read').click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window.inlayMockHost?.calls ?? [])
            .filter((c) => c.method === 'requestMode')
            .map((c) => c.args[0]),
        ),
      )
      .toEqual(['read']);
  });

  test('front matter, comments and directives are cards showing their source', async ({ page }) => {
    await page.goto(edit('front-matter.md'));
    await ready(page);
    const fm = page.locator('.inlay-island[data-kind="frontmatter"]');
    await expect(fm.locator('.inlay-island-kind')).toHaveText('Front matter');
    await expect(fm.locator('.inlay-island-source')).toContainText('title: Front matter fixture');
    await page.goto(edit('directives.md'));
    await ready(page);
    await expect(
      page.locator('.inlay-island[data-kind="directive"]').first().locator('.inlay-island-source'),
    ).toContainText(':::note');
    await page.goto(edit('html-comments.md'));
    await ready(page);
    await expect(page.locator('.inlay-island[data-kind="comment"]').first()).toBeVisible();
    await expect(page.locator('.inlay-inline-island-chip').first()).toHaveText(
      '<!-- inline comment -->',
    );
  });

  test('editing an island in place changes only its bytes', async ({ page }) => {
    await page.goto(edit('front-matter.md'));
    await ready(page);
    const before = (await content(page)) ?? '';
    const fm = page.locator('.inlay-island[data-kind="frontmatter"]');
    await fm.locator('.inlay-island-body').click();
    await expect(fm.locator('.inlay-in-place .cm-content')).toBeVisible();
    // The in-place editor holds the exact source; append a key to the last YAML line.
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('End');
    await page.keyboard.type('\nedited: true');
    const after = (await content(page)) ?? '';
    expect(after).toBe(
      before.replace('date: 2026-11-05\n---', 'date: 2026-11-05\nedited: true\n---'),
    );
    await expect.poll(() => dirtyCalls(page)).toEqual([true]);
    // Escape leaves the editor and keeps the island selected; the card shows the new source.
    await page.keyboard.press('Escape');
    await expect(fm.locator('.inlay-in-place .cm-content')).toBeHidden();
    await expect(fm.locator('.inlay-island-source')).toContainText('edited: true');
    await expect(fm).toHaveClass(/ProseMirror-selectednode/);
    // Enter re-opens it.
    await page.keyboard.press('Enter');
    await expect(fm.locator('.inlay-in-place .cm-content')).toBeVisible();
  });

  test('an inline island edits in place and math renders with KaTeX', async ({ page }) => {
    await page.goto(edit('html-comments.md'));
    await ready(page);
    const before = (await content(page)) ?? '';
    const chip = page.locator('.inlay-inline-island-chip', { hasText: 'inline comment' });
    await chip.click();
    const cm = page.locator('.inlay-inline-island .inlay-in-place .cm-content');
    await expect(cm).toBeVisible();
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.type(' edited');
    const after = (await content(page)) ?? '';
    expect(after).toBe(before.replace('<!-- inline comment -->', '<!-- inline comment edited -->'));
    await page.keyboard.press('Escape');
    await expect(cm).toBeHidden();

    await page.goto(edit('math.md'));
    await ready(page);
    await expect(page.locator('.inlay-math-inline .katex').first()).toBeVisible();
    await expect(page.locator('.inlay-math-block .katex-display').first()).toBeVisible();
    const mathBefore = (await content(page)) ?? '';
    await page.locator('.inlay-math-block').first().click();
    await expect(
      page.locator('.inlay-math-block .inlay-in-place .cm-content').first(),
    ).toBeVisible();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type(' + 1');
    const mathAfter = (await content(page)) ?? '';
    const formula = '\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}';
    // `$$` in a replacement string means one `$`: use a replacer function.
    expect(mathAfter).toBe(mathBefore.replace(`${formula}\n$$`, () => `${formula} + 1\n$$`));
  });
});

test.describe('Large documents', () => {
  test('above the safety net the page opens in Source with a one-click way into WYSIWYG', async ({
    page,
  }) => {
    await page.goto(edit('perf-10k-lines.md', '&safetyLines=5000'));
    await page.waitForFunction(() => window.inlayEditor?.mode === 'source');
    await expect(page.locator('.cm-content')).toBeVisible();
    const banner = page.locator('.inlay-safety-banner');
    await expect(banner).toContainText('Large document');
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window.inlayMockHost?.calls ?? [])
            .filter((c) => c.method === 'requestMode')
            .map((c) => c.args[0]),
        ),
      )
      .toEqual(['source']);
    await banner.getByRole('button', { name: 'Open in WYSIWYG anyway' }).click();
    await page.waitForFunction(
      () => window.inlayEditor?.mode === 'wysiwyg' && !!window.inlayEditor.wysiwygView,
    );
    await expect(banner).toHaveCount(0);
    expect(await page.evaluate(() => window.inlayEditor?.stats.lineCount)).toBeGreaterThanOrEqual(
      10_000,
    );
  });
});
