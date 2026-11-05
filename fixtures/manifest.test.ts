// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  classifyEol,
  decodeFixture,
  isValidUtf8,
  listFixtureFiles,
  manifest,
  readFixtureBytes,
} from './src/index.ts';

describe('fixture manifest', () => {
  it('lists every fixture file exactly once and nothing else', () => {
    const listed = manifest.map((f) => f.file).sort();
    expect(new Set(listed).size).toBe(listed.length);
    expect(listed).toEqual(listFixtureFiles());
  });

  for (const entry of manifest) {
    describe(entry.file, () => {
      const bytes = readFixtureBytes(entry.file);

      it('matches its UTF-8 and BOM traits', () => {
        expect(isValidUtf8(bytes)).toBe(entry.utf8 ?? true);
        const hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
        expect(hasBom).toBe(entry.bom ?? false);
      });

      it('matches its line-ending trait', () => {
        expect(classifyEol(bytes)).toBe(entry.eol);
      });

      it('matches its trailing-newline trait', () => {
        const last = bytes[bytes.length - 1];
        const endsWithEol = bytes.length > 0 && (last === 10 || last === 13);
        expect(endsWithEol).toBe(entry.trailingNewline ?? true);
      });

      if (entry.minLines) {
        it(`has at least ${entry.minLines} lines`, () => {
          const { text } = decodeFixture(bytes);
          expect(text.split('\n').length).toBeGreaterThanOrEqual(entry.minLines ?? 0);
        });
      }

      if (entry.utf8 !== false) {
        it('decodes and re-encodes to identical bytes', () => {
          const { text, bom } = decodeFixture(bytes);
          const re = new TextEncoder().encode(text);
          const expected = bom ? bytes.subarray(3) : bytes;
          expect(Buffer.from(re).equals(Buffer.from(expected))).toBe(true);
        });
      }
    });
  }

  it('covers the brief’s required fixture categories', () => {
    const features = new Set(manifest.flatMap((f) => f.features));
    for (const required of [
      'table',
      'table-alignment',
      'html-in-cells',
      'task-list',
      'footnotes',
      'front-matter',
      'reference-links',
      'html-comment',
      'nested-list',
      'crlf',
      'cr',
      'trailing-spaces',
      'vietnamese',
      'cjk',
      'bom',
      'invalid-utf8',
      'directives',
    ]) {
      expect(features.has(required), `missing feature ${required}`).toBe(true);
    }
    expect(manifest.some((f) => f.category === 'performance')).toBe(true);
    expect(manifest.some((f) => f.eol === 'mixed')).toBe(true);
  });
});
