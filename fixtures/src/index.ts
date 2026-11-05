// SPDX-License-Identifier: Apache-2.0
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import manifestJson from '../manifest.json' with { type: 'json' };

export type FixtureCategory = 'structure' | 'text' | 'performance' | 'rendered';
export type FixtureEol = 'lf' | 'crlf' | 'cr' | 'mixed';

export interface FixtureEntry {
  file: string;
  category: FixtureCategory;
  eol: FixtureEol;
  features: string[];
  /** Starts with a UTF-8 BOM. Default false. */
  bom?: boolean;
  /** Valid UTF-8. Default true. */
  utf8?: boolean;
  /** Ends with a line ending. Default true. */
  trailingNewline?: boolean;
  /** Participates in rendering tests. Default true. */
  render?: boolean;
  /** Expected to produce raw islands in WYSIWYG. Default false. */
  islands?: boolean;
  /** Produced by fixtures/scripts/generate.mjs. */
  generated?: boolean;
  minLines?: number;
}

export const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'md');
export const assetsDir = join(fixturesDir, 'assets');

export const manifest: FixtureEntry[] = (manifestJson as { fixtures: FixtureEntry[] }).fixtures;

export function listFixtureFiles(): string[] {
  return readdirSync(fixturesDir)
    .filter((f) => f.endsWith('.md'))
    .sort();
}

export function readFixtureBytes(file: string): Uint8Array {
  return new Uint8Array(readFileSync(join(fixturesDir, file)));
}

/** Decodes strictly; throws for invalid UTF-8. Strips a leading BOM and reports it. */
export function decodeFixture(bytes: Uint8Array): { text: string; bom: boolean } {
  const bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const body = bom ? bytes.subarray(3) : bytes;
  const text = new TextDecoder('utf-8', { fatal: true }).decode(body);
  return { text, bom };
}

export function isValidUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/** Counts line endings of each kind in raw bytes. */
export function countEols(bytes: Uint8Array): { crlf: number; lf: number; cr: number } {
  let crlf = 0;
  let lf = 0;
  let cr = 0;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 13) {
      if (bytes[i + 1] === 10) {
        crlf++;
        i++;
      } else cr++;
    } else if (b === 10) lf++;
  }
  return { crlf, lf, cr };
}

export function classifyEol(bytes: Uint8Array): FixtureEol {
  const { crlf, lf, cr } = countEols(bytes);
  const kinds = [crlf > 0, lf > 0, cr > 0].filter(Boolean).length;
  if (kinds > 1) return 'mixed';
  if (crlf > 0) return 'crlf';
  if (cr > 0) return 'cr';
  return 'lf';
}
