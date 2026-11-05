// SPDX-License-Identifier: Apache-2.0
/**
 * Block-splice save (ADR-0004): the live ProseMirror document is turned back into
 * text by aligning its top-level nodes with the blocks loaded from disk. An
 * unchanged node (same object, or structurally equal) contributes its original
 * slice and the original gap before it; a changed node is serialized with the
 * style of the block it replaces; a new node gets the document style and a
 * blank-line gap; deleted blocks vanish with their gap. Leading and trailing text
 * (usually nothing and one line ending) are kept as they were.
 */
import type { Eol } from '@inlay-md/host-api';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import type { LoadedBlock, LoadedDocument } from './loader.ts';
import { RAW_ISLAND } from './schema.ts';
import type { BlockStyle } from './style.ts';

export interface Segment {
  /** Index of the node among the document's top-level children. */
  index: number;
  node: ProseNode;
  /** UTF-16 range of the block's text in the spliced output (gap excluded). */
  from: number;
  to: number;
  /** The loaded block this node continues, if any. */
  original: LoadedBlock | null;
  source: 'original' | 'serialized';
}

export interface SpliceResult {
  text: string;
  segments: Segment[];
  changed: number;
  added: number;
  removed: number;
}

export type Serializer = (node: ProseNode, style: BlockStyle) => string;

/** Window of originals searched for a structurally equal node after identity fails. */
const EQ_WINDOW = 4;

export function spliceDocument(
  doc: ProseNode,
  loaded: LoadedDocument,
  serialize: Serializer,
  eol: Eol = loaded.eol,
): SpliceResult {
  const originals = loaded.blocks;
  const identity = new Map<ProseNode, number>();
  originals.forEach((b, i) => {
    identity.set(b.node, i);
  });
  const currents: ProseNode[] = [];
  doc.forEach((child) => {
    currents.push(child);
  });

  // Pass 1: claim unchanged originals (identity, then structural equality), monotonically.
  const claimed: (number | null)[] = new Array(currents.length).fill(null);
  const claimedSet = new Set<number>();
  let last = -1;
  const claim = (i: number, k: number) => {
    claimed[i] = k;
    claimedSet.add(k);
    last = k;
  };
  for (const [i, node] of currents.entries()) {
    const byIdentity = identity.get(node);
    if (byIdentity !== undefined && byIdentity > last) {
      claim(i, byIdentity);
      continue;
    }
    for (let k = last + 1; k < Math.min(originals.length, last + 1 + EQ_WINDOW); k++) {
      const candidate = originals[k];
      if (candidate && !claimedSet.has(k) && node.eq(candidate.node)) {
        claim(i, k);
        break;
      }
    }
  }

  // Pass 2: assemble.
  const defaultGap = eol + eol;
  const parts: string[] = [];
  const segments: Segment[] = [];
  let length = 0;
  let nextOriginal = 0;
  let previous: 'none' | 'original' | 'new' = 'none';
  let changed = 0;
  let added = 0;

  const push = (s: string) => {
    parts.push(s);
    length += s.length;
  };

  for (const [i, node] of currents.entries()) {
    const j = claimed[i] ?? null;
    let original: LoadedBlock | null = null;
    let text: string;
    if (j !== null) {
      original = originals[j] ?? null;
      nextOriginal = j + 1;
      text = original?.slice ?? '';
    } else {
      // Replace the next unclaimed original (if one is left before the next claimed one).
      let r = nextOriginal;
      while (r < originals.length && claimedSet.has(r)) r++;
      const nextClaimed = claimed.slice(i + 1).find((c) => c !== null) ?? originals.length;
      if (r < originals.length && r < nextClaimed) {
        original = originals[r] ?? null;
        nextOriginal = r + 1;
      }
      text = serializeNode(node, original?.style ?? loaded.docStyle, serialize);
      if (text.length === 0) continue; // an empty paragraph leaves no trace
      if (original) changed++;
      else added++;
    }
    const gap =
      previous === 'none'
        ? loaded.leading
        : previous === 'new' || !original
          ? defaultGap
          : original.gapBefore;
    push(gap);
    const from = length;
    push(text);
    segments.push({
      index: i,
      node,
      from,
      to: length,
      original,
      source: j !== null ? 'original' : 'serialized',
    });
    previous = original ? 'original' : 'new';
  }

  if (segments.length === 0) {
    return {
      text: originals.length === 0 ? loaded.text : '',
      segments,
      changed,
      added,
      removed: originals.length,
    };
  }
  push(loaded.trailing);
  const removed = originals.length - segments.filter((s) => s.original).length;
  return { text: parts.join(''), segments, changed, added, removed };
}

function serializeNode(node: ProseNode, style: BlockStyle, serialize: Serializer): string {
  if (node.type.name === RAW_ISLAND) return String(node.attrs.source ?? '');
  return serialize(node, style);
}

/** 1-based line (remark numbering) of a UTF-16 offset in `text`. */
export function lineAt(text: string, offset: number): number {
  let line = 1;
  const end = Math.min(offset, text.length);
  for (let i = 0; i < end; i++) {
    const c = text.charCodeAt(i);
    if (c === 10) line++;
    else if (c === 13) {
      line++;
      if (text.charCodeAt(i + 1) === 10) i++;
    }
  }
  return line;
}

/** UTF-16 offset of the start of a 1-based source line (clamped to the text). */
export function offsetOfLine(text: string, line: number): number {
  if (line <= 1) return 0;
  let current = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 10 || c === 13) {
      if (c === 13 && text.charCodeAt(i + 1) === 10) i++;
      current++;
      if (current === line) return i + 1;
    }
  }
  return text.length;
}
