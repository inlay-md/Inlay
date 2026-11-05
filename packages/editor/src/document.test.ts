// SPDX-License-Identifier: Apache-2.0
import { listFixtureFiles, manifest, readFixtureBytes } from '@inlay-md/fixtures';
import { render } from '@inlay-md/md-render';
import { describe, expect, it } from 'vitest';
import { countSourceLines, decodeDocument, encodeDocument } from './document.ts';
import { buildLineMap } from './line-map.ts';

const eolOf = { lf: '\n', crlf: '\r\n', cr: '\r', mixed: null } as const;

describe('document model', () => {
  for (const file of listFixtureFiles()) {
    const entry = manifest.find((f) => f.file === file);
    it(`${file}: encode(decode(bytes)) is byte-identical`, () => {
      const bytes = readFixtureBytes(file);
      const doc = decodeDocument(bytes);
      expect(doc.bom).toBe(entry?.bom ?? false);
      expect(doc.decodable).toBe(entry?.utf8 ?? true);
      if (doc.decodable) expect(encodeDocument(doc.text, doc.bom)).toEqual(bytes);
      const expected = entry ? eolOf[entry.eol] : null;
      if (expected) expect(doc.eol).toBe(expected);
    });
  }

  it('detects the dominant EOL of the mixed fixture as CRLF', () => {
    expect(decodeDocument(readFixtureBytes('mixed-line-endings.md')).eol).toBe('\r\n');
  });

  it('counts source lines like remark for every renderable fixture', () => {
    for (const entry of manifest) {
      if (entry.render === false || entry.utf8 === false) continue;
      const { text } = decodeDocument(readFixtureBytes(entry.file));
      const { meta } = render(text, { mode: 'static' });
      expect(countSourceLines(text), entry.file).toBe(meta.lineCount);
    }
  }, 60_000);
});

describe('line map', () => {
  it('is the identity for single-EOL text', () => {
    const map = buildLineMap('a\r\nb\r\nc', '\r\n');
    expect(map.identity).toBe(true);
    expect(map.editorLines).toBe(3);
    expect(map.toSourceLine(3)).toBe(3);
    expect(map.toEditorLine(2)).toBe(2);
  });

  it('maps across stray line endings in both directions', () => {
    // Editor lines (CRLF): "a" | "b\nc" | "d\re" | "f"
    const text = 'a\r\nb\nc\r\nd\re\r\nf';
    const map = buildLineMap(text, '\r\n');
    expect(map.identity).toBe(false);
    expect(map.editorLines).toBe(4);
    expect(map.sourceLines).toBe(6);
    expect([1, 2, 3, 4].map((n) => map.toSourceLine(n))).toEqual([1, 2, 4, 6]);
    expect([1, 2, 3, 4, 5, 6].map((n) => map.toEditorLine(n))).toEqual([1, 2, 2, 3, 3, 4]);
    expect(map.toSourceLine(99)).toBe(6);
    expect(map.toEditorLine(0)).toBe(1);
  });

  it('agrees with remark on the mixed fixture', () => {
    const { text, eol } = decodeDocument(readFixtureBytes('mixed-line-endings.md'));
    const map = buildLineMap(text, eol);
    expect(map.sourceLines).toBe(render(text, { mode: 'static' }).meta.lineCount);
    expect(map.identity).toBe(false);
  });
});
