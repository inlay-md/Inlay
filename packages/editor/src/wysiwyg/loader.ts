// SPDX-License-Identifier: Apache-2.0
/**
 * Loads a document into WYSIWYG blocks (ADR-0004, ADR-0032). Every top-level block
 * becomes a ProseMirror node right away; its round trip mdast → ProseMirror →
 * Markdown is then verified with its sniffed style, eagerly or in idle chunks:
 *
 * - `exact`: the serialization reproduces the slice byte for byte;
 * - `restyled`: the bytes differ (padding, escapes, autolink brackets) but the
 *   plain parser produces the same mdast, so the block is lossless in structure
 *   and is edited in place; saving an *unchanged* block still writes its original
 *   slice, only an edited one takes the canonical form;
 * - `island`: raw HTML, front matter, directives, or anything that fails both
 *   checks — a `raw_island` atom holding the exact slice.
 *
 * Byte identity never depends on verification (an unchanged block always saves
 * as its slice), which is what lets a 10k-line document open before its blocks
 * are verified; only a `mismatch` island arrives late, as a node swap.
 */
import type { Eol } from '@inlay-md/host-api';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { type IslandKind, islandKind, RAW_ISLAND } from './schema.ts';
import { type BlockStyle, documentStyle, sniffBlockStyle, styleVariants } from './style.ts';
import { type BlockTransformer, mdastEqual, type RawBlock } from './transformer.ts';

export type BlockStatus = 'pending' | 'exact' | 'restyled' | 'island';

export interface LoadedBlock {
  node: ProseNode;
  slice: string;
  start: number;
  end: number;
  line: number;
  /** Text between the previous block (or the document start) and this one. */
  gapBefore: string;
  style: BlockStyle;
  status: BlockStatus;
  kind: IslandKind | null;
}

export interface LoadStats {
  blocks: number;
  exact: number;
  restyled: number;
  islands: number;
  inlineIslands: number;
  /** Blocks whose round trip has not been verified yet. */
  pending: number;
  /** islands / blocks, 0 for an empty document. */
  islandRatio: number;
  loadMs: number;
  verifyMs: number;
}

/** A block whose verification failed after load: the page swaps `from` for `to` in the live document. */
export interface IslandSwap {
  index: number;
  from: ProseNode;
  to: ProseNode;
}

export interface LoadedDocument {
  text: string;
  eol: Eol;
  doc: ProseNode;
  blocks: LoadedBlock[];
  /** Text before the first block (usually empty) and after the last (usually one line ending). */
  leading: string;
  trailing: string;
  docStyle: BlockStyle;
  stats: LoadStats;
  /**
   * Verifies pending blocks in order until `budgetMs` is spent (all of them when omitted).
   * Returns the swaps the caller must apply to the live document.
   */
  verify(budgetMs?: number): IslandSwap[];
}

export interface LoadOptions {
  /** `eager` verifies every block before returning; `deferred` leaves it to `verify()`. */
  verify?: 'eager' | 'deferred';
}

const DIRECTIVE = /^[ \t]{0,3}::/;

function forcedIsland(block: RawBlock, slice: string): IslandKind | null {
  if (block.type === 'yaml') return 'frontmatter';
  if (block.type === 'html') return islandKind(slice);
  if (block.type === 'paragraph' && DIRECTIVE.test(slice)) return 'directive';
  return null;
}

function countInlineIslands(node: ProseNode): number {
  let n = 0;
  node.descendants((child) => {
    if (child.type.name === 'raw_inline_island') n++;
    return true;
  });
  return n;
}

export function loadDocument(
  transformer: BlockTransformer,
  text: string,
  eol: Eol,
  options: LoadOptions = {},
): LoadedDocument {
  const started = performance.now();
  const schema = transformer.schema;
  const islandType = schema.nodes[RAW_ISLAND];
  if (!islandType) throw new Error('raw_island missing from the schema');
  const docStyle = documentStyle(text, eol);
  const raw = transformer.parse(text);
  const blocks: LoadedBlock[] = [];
  const stats: LoadStats = {
    blocks: raw.length,
    exact: 0,
    restyled: 0,
    islands: 0,
    inlineIslands: 0,
    pending: 0,
    islandRatio: 0,
    loadMs: 0,
    verifyMs: 0,
  };
  let cursor = 0;

  for (const block of raw) {
    const slice = text.slice(block.start, block.end);
    const gapBefore = text.slice(cursor, block.start);
    cursor = block.end;
    const style = sniffBlockStyle(slice, docStyle, eol);
    const base = { slice, start: block.start, end: block.end, line: block.line, gapBefore, style };
    const island = (kind: IslandKind): LoadedBlock => {
      stats.islands++;
      return { ...base, node: islandType.create({ source: slice, kind }), status: 'island', kind };
    };
    const forced = forcedIsland(block, slice);
    if (forced) {
      blocks.push(island(forced));
      continue;
    }
    try {
      const node = transformer.toNode(block.node);
      stats.inlineIslands += countInlineIslands(node);
      stats.pending++;
      blocks.push({ ...base, node, status: 'pending', kind: null });
    } catch {
      blocks.push(island('unsupported'));
    }
  }

  const nodes = blocks.map((b) => b.node);
  const doc =
    nodes.length > 0
      ? schema.topNodeType.create(null, nodes)
      : (schema.topNodeType.createAndFill() as ProseNode);
  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  stats.islandRatio = blocks.length === 0 ? 0 : stats.islands / blocks.length;

  let next = 0;
  const verify = (budgetMs?: number): IslandSwap[] => {
    const begin = performance.now();
    const swaps: IslandSwap[] = [];
    while (next < blocks.length) {
      if (budgetMs !== undefined && performance.now() - begin > budgetMs) break;
      const index = next++;
      const block = blocks[index];
      if (block?.status !== 'pending') continue;
      stats.pending--;
      let matched: BlockStyle | null = null;
      for (const style of styleVariants(block.style, block.slice)) {
        if (transformer.serialize(block.node, style) === block.slice) {
          matched = style;
          break;
        }
      }
      if (matched) {
        block.style = matched;
        block.status = 'exact';
        stats.exact++;
        continue;
      }
      const canonical = transformer.serialize(block.node, block.style);
      if (mdastEqual(transformer.parsePlain(block.slice), transformer.parsePlain(canonical))) {
        block.status = 'restyled';
        stats.restyled++;
        continue;
      }
      const from = block.node;
      stats.inlineIslands -= countInlineIslands(from);
      block.node = islandType.create({ source: block.slice, kind: 'mismatch' });
      block.status = 'island';
      block.kind = 'mismatch';
      stats.islands++;
      stats.islandRatio = stats.islands / blocks.length;
      swaps.push({ index, from, to: block.node });
    }
    stats.verifyMs += performance.now() - begin;
    return swaps;
  };

  const loaded: LoadedDocument = {
    text,
    eol,
    doc,
    blocks,
    leading: first ? text.slice(0, first.start) : text,
    trailing: last ? text.slice(last.end) : '',
    docStyle,
    stats,
    verify,
  };
  if ((options.verify ?? 'eager') === 'eager') {
    const swaps = verify();
    if (swaps.length > 0) {
      loaded.doc = schema.topNodeType.create(
        null,
        blocks.map((b) => b.node),
      );
    }
  }
  stats.loadMs = performance.now() - started;
  return loaded;
}
