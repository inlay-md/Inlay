// SPDX-License-Identifier: Apache-2.0
/**
 * Source mode document state (ADR-0003, approach A): the text is kept verbatim
 * and CodeMirror's line separator is the document's dominant EOL, so stray
 * `\r`/`\n` survive as (highlighted) characters and `getText()` reproduces the
 * input byte for byte. Everything that reads the whole text goes through
 * `getText`, which joins lines with the state's line break; `Text.toString()`
 * would join with "\n" and must not be used.
 */

import { EditorState, type Extension, Text } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { Eol } from '@inlay-md/host-api';

export interface SourceStateOptions {
  text: string;
  eol: Eol;
  readOnly?: boolean;
  extensions?: Extension[];
}

/** Splits exactly like `EditorState.create` will with the separator facet set. */
export function textOf(text: string, eol: Eol): Text {
  return Text.of(text.split(eol));
}

export function createSourceState(o: SourceStateOptions): EditorState {
  return EditorState.create({
    doc: o.text,
    extensions: [
      EditorState.lineSeparator.of(o.eol),
      EditorState.readOnly.of(o.readOnly ?? false),
      // Text pasted or dropped in carries the clipboard's line endings; make it use the document's,
      // otherwise a "\n" paste into a CRLF document leaves stray ␊ characters behind.
      EditorView.clipboardInputFilter.of((text, state) =>
        text.replace(/\r\n?|\n/g, state.lineBreak),
      ),
      // The macOS pasteboard convention is "\n"; other apps need not see our CRLF.
      EditorView.clipboardOutputFilter.of((text, state) =>
        state.lineBreak === '\n' ? text : text.split(state.lineBreak).join('\n'),
      ),
      ...(o.extensions ?? []),
    ],
  });
}

/** The live document text, joined with the document's line separator. */
export function getText(state: EditorState): string {
  return state.sliceDoc();
}

/**
 * CodeMirror counts every line break as one position regardless of the separator's
 * length; these convert between editor offsets and UTF-16 indices into `getText()`.
 */
export function offsetToStringIndex(state: EditorState, offset: number): number {
  const extra = state.lineBreak.length - 1;
  if (extra === 0) return offset;
  const line = state.doc.lineAt(Math.min(offset, state.doc.length));
  return offset + (line.number - 1) * extra;
}

export function stringIndexToOffset(state: EditorState, index: number): number {
  const extra = state.lineBreak.length - 1;
  if (extra === 0) return index;
  // Walk lines: each earlier line contributes its length plus the full separator.
  let consumed = 0;
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n);
    const end = consumed + line.length;
    if (index <= end || n === state.doc.lines)
      return line.from + Math.max(0, Math.min(index - consumed, line.length));
    consumed = end + state.lineBreak.length;
  }
  return state.doc.length;
}
