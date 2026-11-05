// SPDX-License-Identifier: Apache-2.0
/**
 * Maps CodeMirror line numbers to source line numbers and back.
 *
 * Source mode keeps the text verbatim with `EditorState.lineSeparator` set to
 * the dominant EOL (ADR-0003), so CodeMirror breaks lines only on that
 * separator while remark (and therefore `data-source-line` in the Read view)
 * breaks on `\r\n`, `\n` and `\r` alike. The two numberings diverge only after
 * a stray line ending; for the common single-EOL file the map is the identity.
 * Both numberings are 1-based.
 */
import type { Eol } from '@inlay-md/host-api';
import { countSourceLines } from './document.ts';

export interface LineMap {
  /** Identity map: no stray line endings in the text. */
  readonly identity: boolean;
  readonly editorLines: number;
  readonly sourceLines: number;
  toSourceLine(editorLine: number): number;
  toEditorLine(sourceLine: number): number;
}

const IDENTITY_BASE = {
  identity: true,
  toSourceLine: (n: number) => n,
  toEditorLine: (n: number) => n,
};

/** Source line number at which each editor line starts (index 0 = editor line 1). */
export function editorLineStarts(text: string, eol: Eol): number[] {
  const starts = [1];
  let source = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 13) {
      const crlf = text.charCodeAt(i + 1) === 10;
      source++;
      if (crlf) i++;
      if ((crlf && eol === '\r\n') || (!crlf && eol === '\r')) starts.push(source);
    } else if (c === 10) {
      source++;
      if (eol === '\n') starts.push(source);
    }
  }
  return starts;
}

export function buildLineMap(text: string, eol: Eol): LineMap {
  const starts = editorLineStarts(text, eol);
  const editorLines = starts.length;
  const sourceLines = Math.max(1, countSourceLines(text));
  if (editorLines === sourceLines) {
    return { ...IDENTITY_BASE, editorLines, sourceLines };
  }
  return {
    identity: false,
    editorLines,
    sourceLines,
    toSourceLine(editorLine) {
      const idx = Math.min(Math.max(editorLine, 1), editorLines) - 1;
      return starts[idx] ?? 1;
    },
    toEditorLine(sourceLine) {
      // Last editor line whose start is <= sourceLine (binary search).
      let lo = 0;
      let hi = editorLines - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if ((starts[mid] ?? Number.POSITIVE_INFINITY) <= sourceLine) lo = mid;
        else hi = mid - 1;
      }
      return lo + 1;
    },
  };
}
