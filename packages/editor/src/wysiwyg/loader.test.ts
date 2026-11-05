// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom
import { decodeFixture, listFixtureFiles, manifest, readFixtureBytes } from '@inlay-md/fixtures';
import { detectEol } from '@inlay-md/host-api';
import type { Editor } from '@milkdown/kit/core';
import { editorViewCtx } from '@milkdown/kit/core';
import { TextSelection } from '@milkdown/kit/prose/state';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHeadlessEditor } from './headless.ts';
import { type LoadedDocument, loadDocument } from './loader.ts';
import { spliceDocument } from './splice.ts';
import { installDomShims } from './test-dom.ts';
import { BlockTransformer } from './transformer.ts';

installDomShims();

let editor: Editor;
let transformer: BlockTransformer;

beforeAll(async () => {
  const root = document.createElement('div');
  document.body.append(root);
  editor = await createHeadlessEditor(root);
  transformer = editor.action((ctx) => new BlockTransformer(ctx));
}, 30_000);

afterAll(async () => {
  await editor.destroy();
});

const fixtures = listFixtureFiles().filter(
  (file) => manifest.find((m) => m.file === file)?.utf8 !== false,
);

function load(file: string): LoadedDocument {
  const { text } = decodeFixture(readFixtureBytes(file));
  return loadDocument(transformer, text, detectEol(text));
}

const serialize = (
  node: Parameters<BlockTransformer['serialize']>[0],
  style: Parameters<BlockTransformer['serialize']>[1],
) => transformer.serialize(node, style);

describe('WYSIWYG loader', () => {
  for (const file of fixtures) {
    const entry = manifest.find((m) => m.file === file);
    it(`${file}: the unchanged document splices back byte for byte`, () => {
      const loaded = load(file);
      const out = spliceDocument(loaded.doc, loaded, serialize);
      expect(out.text).toBe(loaded.text);
      expect(out.changed + out.added + out.removed).toBe(0);
    });

    it(`${file}: islands only where the manifest expects them`, () => {
      const loaded = load(file);
      const summary = loaded.blocks
        .filter((b) => b.status === 'island')
        .map((b) => `${b.kind}: ${b.slice.split(/\r?\n|\r/)[0]}`);
      if (entry?.islands) {
        expect(
          loaded.stats.islands + loaded.stats.inlineIslands,
          summary.join('\n'),
        ).toBeGreaterThan(0);
      } else {
        expect(summary).toEqual([]);
        expect(loaded.stats.inlineIslands).toBe(0);
      }
    });
  }

  it('reports how many blocks round-trip byte for byte', () => {
    const rows = fixtures.map((file) => {
      const { stats } = load(file);
      return `${file}: ${stats.exact} exact, ${stats.restyled} restyled, ${stats.islands} islands`;
    });
    expect(rows.length).toBe(fixtures.length);
    // Pure-GFM fixtures should mostly be exact; this guards against sniffing regressions.
    const basics = load('gfm-basics.md');
    const exact = (prefix: string) => basics.blocks.find((b) => b.slice.startsWith(prefix))?.status;
    expect(exact('A paragraph with **strong**'), 'bare autolink stays bare').toBe('exact');
    expect(exact('> A blockquote'), 'tight list after a paragraph').toBe('exact');
    expect(exact('    indented code'), 'indented code stays indented').toBe('exact');
    expect(exact('Hard break with two'), 'mixed hard-break markers').toBe('exact');
    expect(exact('| Left'), 'hand-padded table is restyled, not an island').toBe('restyled');
    expect(basics.stats.islands).toBe(0);
    const styles = load('setext-and-styles.md');
    const restyled = styles.blocks.filter((b) => b.status !== 'exact').map((b) => b.slice);
    expect(restyled).toEqual(['Escaped \\*stars\\* and snake_case_words plus a literal \\# hash.']);
  });
});

describe('block splice', () => {
  it('editing one paragraph changes only its bytes', () => {
    const loaded = load('gfm-basics.md');
    const view = editor.action((ctx) => ctx.get(editorViewCtx));
    view.updateState(view.state.reconfigure({}));
    const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, loaded.doc.content);
    view.dispatch(tr);
    // Find "Final paragraph." and type into it.
    let pos = -1;
    view.state.doc.descendants((node, p) => {
      if (pos < 0 && node.isText && node.text?.includes('Final paragraph')) pos = p;
      return pos < 0;
    });
    expect(pos).toBeGreaterThan(0);
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 'Final'.length)),
    );
    view.dispatch(view.state.tr.insertText(' edited'));
    const out = spliceDocument(view.state.doc, loaded, serialize);
    expect(out.changed).toBe(1);
    expect(out.added + out.removed).toBe(0);
    const block = loaded.blocks.find((b) => b.slice.startsWith('Final paragraph'));
    expect(block).toBeDefined();
    const before = loaded.text.slice(0, block?.start);
    const after = loaded.text.slice(block?.end);
    expect(out.text).toBe(`${before}Final edited paragraph.${after}`);
  });

  it('a deleted block takes its gap with it and a new block gets a blank line', () => {
    const loaded = load('gfm-basics.md');
    const view = editor.action((ctx) => ctx.get(editorViewCtx));
    view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, loaded.doc.content));
    const second = loaded.blocks[1];
    expect(second).toBeDefined();
    // Delete the second top-level block.
    const start = view.state.doc.child(0).nodeSize;
    view.dispatch(view.state.tr.delete(start, start + view.state.doc.child(1).nodeSize));
    let out = spliceDocument(view.state.doc, loaded, serialize);
    const first = loaded.blocks[0];
    const third = loaded.blocks[2];
    expect(out.removed).toBe(1);
    expect(out.text.startsWith(`${first?.slice}${third?.gapBefore}${third?.slice}`)).toBe(true);
    // Append a paragraph at the end.
    const para = view.state.schema.nodes.paragraph?.create(
      null,
      view.state.schema.text('Appended.'),
    );
    expect(para).toBeDefined();
    view.dispatch(view.state.tr.insert(view.state.doc.content.size, para as never));
    out = spliceDocument(view.state.doc, loaded, serialize);
    expect(out.added).toBe(1);
    expect(out.text.endsWith('Final paragraph.\n\nAppended.\n')).toBe(true);
  });

  it('CRLF documents serialize edited blocks with CRLF', () => {
    const loaded = load('crlf.md');
    expect(loaded.eol).toBe('\r\n');
    const view = editor.action((ctx) => ctx.get(editorViewCtx));
    view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, loaded.doc.content));
    view.dispatch(view.state.tr.insertText('X', 1));
    const out = spliceDocument(view.state.doc, loaded, serialize);
    expect(out.text).toBe(`# X${loaded.text.slice(2)}`);
    expect(out.text.split('\r\n').length).toBe(loaded.text.split('\r\n').length);
  });
});

describe('performance', () => {
  it('loads the 10k-line fixture into blocks quickly', () => {
    const { text } = decodeFixture(readFixtureBytes('perf-10k-lines.md'));
    const deferred = loadDocument(transformer, text, '\n', { verify: 'deferred' });
    expect(deferred.stats.pending).toBe(deferred.stats.blocks);
    process.stdout.write(
      `\n[perf] 10k-line deferred load: ${deferred.stats.loadMs.toFixed(0)} ms\n`,
    );
    // Verification in chunks never changes the text and finishes.
    let swaps = 0;
    for (let i = 0; i < 1000 && deferred.stats.pending > 0; i++)
      swaps += deferred.verify(20).length;
    expect(deferred.stats.pending).toBe(0);
    expect(swaps).toBe(0);
    expect(spliceDocument(deferred.doc, deferred, serialize).text).toBe(text);

    const loaded = load('perf-10k-lines.md');
    expect(loaded.stats.blocks).toBeGreaterThan(1000);
    expect(loaded.stats.islands).toBe(0);
    // jsdom is slower than WebKit; the page budget (1 s incl. rendering) is checked in Playwright.
    process.stdout.write(
      `\n[perf] 10k-line loader: ${loaded.stats.loadMs.toFixed(0)} ms for ${loaded.stats.blocks} blocks (${loaded.stats.exact} exact, ${loaded.stats.restyled} restyled)\n`,
    );
    expect(loaded.stats.loadMs).toBeLessThan(3000);
    const started = performance.now();
    const out = spliceDocument(loaded.doc, loaded, serialize);
    expect(out.text).toBe(loaded.text);
    expect(performance.now() - started).toBeLessThan(200);
  });
});
