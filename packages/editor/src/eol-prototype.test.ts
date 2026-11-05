// SPDX-License-Identifier: Apache-2.0
/**
 * The mixed-EOL prototype (ADR-0003): CodeMirror with `lineSeparator` = dominant
 * EOL must reproduce every fixture byte for byte and keep doing so through edits.
 */
import { EditorSelection } from '@codemirror/state';
import { listFixtureFiles, readFixtureBytes } from '@inlay-md/fixtures';
import { describe, expect, it } from 'vitest';
import { decodeDocument, encodeDocument } from './document.ts';
import {
  createSourceState,
  getText,
  offsetToStringIndex,
  stringIndexToOffset,
} from './source-state.ts';

describe('Source mode state (lineSeparator = dominant EOL)', () => {
  for (const file of listFixtureFiles()) {
    it(`${file}: getText() reproduces the file`, () => {
      const bytes = readFixtureBytes(file);
      const doc = decodeDocument(bytes);
      if (!doc.decodable) return;
      const state = createSourceState({ text: doc.text, eol: doc.eol });
      expect(getText(state)).toBe(doc.text);
      expect(encodeDocument(getText(state), doc.bom)).toEqual(bytes);
      expect(state.lineBreak).toBe(doc.eol);
    });
  }

  it('keeps stray line endings as characters inside a line', () => {
    const { text, eol } = decodeDocument(readFixtureBytes('mixed-line-endings.md'));
    const state = createSourceState({ text, eol });
    expect(eol).toBe('\r\n');
    const strayLf = state.doc.line(4); // "This one ends with a bare LF.\nBack to CRLF."
    expect(strayLf.text).toContain('\n');
    const strayCr = state.doc.line(8);
    expect(strayCr.text).toContain('\r');
    expect(state.doc.lines).toBeLessThan(text.split(/\r\n|\n|\r/).length);
  });

  it('edits change only their bytes and Enter inserts the dominant EOL', () => {
    const { text, eol } = decodeDocument(readFixtureBytes('mixed-line-endings.md'));
    let state = createSourceState({ text, eol });
    const line2 = state.doc.line(3); // "Most lines end with CRLF."
    const insertAt = line2.from + 4;
    state = state.update({ changes: { from: insertAt, insert: 'X' } }).state;
    const idx = offsetToStringIndex(state, insertAt);
    expect(getText(state)).toBe(`${text.slice(0, idx)}X${text.slice(idx)}`);

    // Enter at the end of that line: a CRLF goes in, nothing else moves.
    const before = getText(state);
    const eolAt = state.doc.line(3).to;
    state = state.update({
      changes: { from: eolAt, insert: state.lineBreak },
      selection: EditorSelection.cursor(eolAt + 1),
    }).state;
    const idx2 = offsetToStringIndex(state, eolAt);
    expect(getText(state)).toBe(`${before.slice(0, idx2)}\r\n${before.slice(idx2)}`);

    // Deleting the stray LF joins the two source lines but leaves the editor line count alone.
    const stray = state.doc.line(5);
    const lf = stray.from + stray.text.indexOf('\n');
    const lines = state.doc.lines;
    state = state.update({ changes: { from: lf, to: lf + 1 } }).state;
    expect(state.doc.lines).toBe(lines);
    expect(getText(state)).not.toContain('LF.\nBack');
    expect(getText(state)).toContain('LF.Back');
  });

  it('converts between editor offsets and UTF-16 indices in CRLF documents', () => {
    const text = 'ab\r\ncd\r\nef';
    const state = createSourceState({ text, eol: '\r\n' });
    expect(state.doc.length).toBe(8);
    expect(text.length).toBe(10);
    for (const offset of [0, 2, 3, 5, 6, 8]) {
      const index = offsetToStringIndex(state, offset);
      expect(stringIndexToOffset(state, index)).toBe(offset);
      expect(state.sliceDoc(0, offset)).toBe(text.slice(0, index));
    }
    expect(offsetToStringIndex(state, 3)).toBe(4);
    // An index pointing into the middle of a separator snaps to the line start after it.
    expect(stringIndexToOffset(state, 3)).toBe(3);
    const lf = createSourceState({ text: 'a\nb', eol: '\n' });
    expect(offsetToStringIndex(lf, 2)).toBe(2);
    expect(stringIndexToOffset(lf, 2)).toBe(2);
  });

  it('is read-only for undecodable documents', () => {
    const doc = decodeDocument(readFixtureBytes('undecodable.md'));
    const state = createSourceState({ text: doc.text, eol: doc.eol, readOnly: !doc.decodable });
    expect(state.readOnly).toBe(true);
  });
});
