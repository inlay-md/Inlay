// SPDX-License-Identifier: Apache-2.0
/**
 * Document model shared by Source mode (M2) and WYSIWYG (M3).
 *
 * The web core works on the losslessly decoded UTF-8 string plus `{bom, eol}`
 * (ADR-0003). Bytes exist only here, at decode and re-encode time: in the app
 * Swift decodes and the text arrives through `Host.openDocument`; this module
 * does the same job for the browser dev server and the tests, and proves the
 * invariant `encode(decode(bytes)) === bytes` on every fixture.
 */
import { detectEol, type Eol } from '@inlay-md/host-api';

export interface DecodedDocument {
  /** Text without the BOM. Offsets into it are UTF-16 code units. */
  text: string;
  bom: boolean;
  /** Dominant line ending (ties resolve to CRLF, then LF). */
  eol: Eol;
  /** False when the bytes are not valid UTF-8: the text is lossy and the document is read-only. */
  decodable: boolean;
}

const BOM = [0xef, 0xbb, 0xbf] as const;

export function hasBom(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === BOM[0] && bytes[1] === BOM[1] && bytes[2] === BOM[2];
}

/** Decodes strictly; invalid UTF-8 yields a lossy text flagged `decodable: false`. */
export function decodeDocument(bytes: Uint8Array): DecodedDocument {
  const bom = hasBom(bytes);
  const body = bom ? bytes.subarray(3) : bytes;
  let text: string;
  let decodable = true;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    text = new TextDecoder('utf-8').decode(body);
    decodable = false;
  }
  return { text, bom, eol: detectEol(text), decodable };
}

/** Re-encodes: the text as UTF-8 with the BOM put back when the file had one. */
export function encodeDocument(text: string, bom: boolean): Uint8Array {
  const body = new TextEncoder().encode(text);
  if (!bom) return body;
  const out = new Uint8Array(body.length + 3);
  out.set(BOM, 0);
  out.set(body, 3);
  return out;
}

/** Number of lines as md-render counts them (`\r\n`, `\n` and `\r` each end a line; empty text has 0). */
export function countSourceLines(text: string): number {
  if (text.length === 0) return 0;
  let lines = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 10) lines++;
    else if (c === 13) {
      lines++;
      if (text.charCodeAt(i + 1) === 10) i++;
    }
  }
  return lines;
}
