// SPDX-License-Identifier: Apache-2.0
/**
 * Bridges mdast and ProseMirror per block (ADR-0004). Parsing uses the editor's own
 * remark processor (remark-parse + GFM + math + front matter, the same packages and
 * versions md-render uses, plus Milkdown's tree transforms), so the editor and the
 * Read view agree on where every block starts and ends. Serialization goes through
 * Milkdown's `SerializerState` to mdast and then through a remark-stringify processor
 * built for the block's sniffed style; processors are cached per distinct option set
 * because `remarkStringifyOptionsCtx` is read once per editor.
 */

import { remarkCtx, remarkStringifyOptionsCtx, schemaCtx } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/kit/ctx';
import type { Node as ProseNode, Schema } from '@milkdown/kit/prose/model';
import { ParserState, SerializerState } from '@milkdown/kit/transformer';
import type { Root as MdastRoot, RootContent } from 'mdast';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkStringify, { type Options as StringifyOptions } from 'remark-stringify';
import { type Processor, unified } from 'unified';
import { type BlockStyle, stringifyOptions, styleKey } from './style.ts';

/** A top-level block as parsed, before Milkdown's transforms touched it. */
export interface RawBlock {
  node: RootContent;
  /** mdast type at parse time (`html`, `yaml`, `paragraph`, …). */
  type: string;
  /** UTF-16 offsets into the document text. */
  start: number;
  end: number;
  /** 1-based source line of the block's first character. */
  line: number;
}

type MdProcessor = Processor<MdastRoot, undefined, undefined, undefined, undefined>;
type Handlers = NonNullable<StringifyOptions['handlers']>;

/** The parser md-render uses, without Milkdown's transforms: the yardstick for mdast equality. */
export function plainParser(): MdProcessor {
  return unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)
    .use(remarkMath) as unknown as MdProcessor;
}

export class BlockTransformer {
  readonly schema: Schema;
  private readonly remark: ReturnType<Ctx['get']> & {
    parse(text: string): MdastRoot;
    runSync(tree: MdastRoot, file?: string): MdastRoot;
  };
  private readonly handlers: Handlers;
  private readonly plain = plainParser();
  private readonly processors = new Map<string, MdProcessor>();

  constructor(ctx: Ctx) {
    this.schema = ctx.get(schemaCtx);
    this.remark = ctx.get(remarkCtx) as unknown as typeof this.remark;
    this.handlers = (ctx.get(remarkStringifyOptionsCtx).handlers ?? {}) as Handlers;
  }

  /** Parses the whole document; records each top-level block before Milkdown's transforms run. */
  parse(text: string): RawBlock[] {
    const tree = this.remark.parse(text);
    const blocks: RawBlock[] = tree.children.map((node) => ({
      node,
      type: node.type,
      start: node.position?.start.offset ?? 0,
      end: node.position?.end.offset ?? 0,
      line: node.position?.start.line ?? 1,
    }));
    this.remark.runSync(tree, text);
    return blocks;
  }

  /** mdast with the plain parser, positions stripped, for structural comparison. */
  parsePlain(text: string): unknown {
    return strip(this.plain.parse(text));
  }

  /** Converts one (transformed) mdast block into a ProseMirror block node. Throws on unknown nodes. */
  toNode(block: RootContent): ProseNode {
    const state = new ParserState(this.schema);
    state.openNode(this.schema.topNodeType);
    state.next(block as never);
    const doc = state.build();
    const node = doc.firstChild;
    if (!node || doc.childCount !== 1) throw new Error(`block produced ${doc.childCount} nodes`);
    return node;
  }

  /** Serializes one block node with the given style; no trailing line ending. */
  serialize(node: ProseNode, style: BlockStyle): string {
    const state = new SerializerState(this.schema);
    state.run(this.schema.topNodeType.create(null, [node]));
    const tree = state.build() as MdastRoot;
    let out = String(this.processor(style).stringify(tree));
    if (out.endsWith('\n')) out = out.slice(0, -1);
    // Only the line endings remark-stringify produced change; a CRLF already inside a value stays.
    return style.eol === '\n' ? out : out.replace(/\r\n|\n/g, (m) => (m === '\n' ? style.eol : m));
  }

  private processor(style: BlockStyle): MdProcessor {
    const key = styleKey(style);
    let p = this.processors.get(key);
    if (!p) {
      p = unified()
        .use(remarkParse)
        .use(remarkFrontmatter, ['yaml'])
        .use(remarkGfm)
        .use(remarkMath)
        .use(remarkStringify, stringifyOptions(style, this.handlers)) as unknown as MdProcessor;
      p.freeze();
      this.processors.set(key, p);
    }
    return p;
  }
}

/** Deep copy without `position`, with line endings in values normalized to `\n`. */
export function strip(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(/\r\n?/g, '\n');
  if (Array.isArray(value)) return value.map(strip);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'position') continue;
      out[k] = strip(v);
    }
    return out;
  }
  return value;
}

export function mdastEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
