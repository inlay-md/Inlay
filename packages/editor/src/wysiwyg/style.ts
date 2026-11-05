// SPDX-License-Identifier: Apache-2.0
/**
 * Per-block Markdown style sniffing (ADR-0004). remark-stringify has one set of
 * options per processor, but authors mix styles within a document (`*` bullets
 * here, `-` there, a setext heading, closing hashes). Each top-level block is
 * therefore serialized with options sniffed from its own source slice, so an
 * edited block keeps the look of the text around it and an unchanged block
 * reproduces its bytes. When the sniffed style does not reproduce the slice the
 * loader tries a few variants (`styleVariants`) before falling back.
 */
import type { Eol } from '@inlay-md/host-api';
import type { Link, Nodes, Parents } from 'mdast';
import { defaultHandlers } from 'mdast-util-to-markdown';
import type { Options as StringifyOptions } from 'remark-stringify';

export type Bullet = '-' | '*' | '+';
export type EmphasisMarker = '*' | '_';
export type ListItemIndent = 'one' | 'tab' | 'mixed';

export interface BlockStyle {
  bullet: Bullet;
  bulletOther: Bullet;
  bulletOrdered: '.' | ')';
  incrementListMarker: boolean;
  listItemIndent: ListItemIndent;
  emphasis: EmphasisMarker;
  strong: EmphasisMarker;
  fence: '`' | '~';
  /** Fenced code; false reproduces an indented code block. */
  fences: boolean;
  /** A list directly after a paragraph without a blank line (bullet lists may interrupt a paragraph). */
  tightListAfterParagraph: boolean;
  closeAtx: boolean;
  setext: boolean;
  rule: '*' | '-' | '_';
  ruleRepetition: number;
  ruleSpaces: boolean;
  /** Hard line breaks: two trailing spaces or a backslash. */
  hardBreak: 'spaces' | 'backslash';
  quote: '"' | "'";
  tableCellPadding: boolean;
  tablePipeAlign: boolean;
  /** Line ending used inside the block; the dominant one when the block mixes endings. */
  eol: Eol;
}

export const DEFAULT_STYLE: BlockStyle = {
  bullet: '-',
  bulletOther: '*',
  bulletOrdered: '.',
  incrementListMarker: true,
  listItemIndent: 'one',
  emphasis: '*',
  strong: '*',
  fence: '`',
  fences: true,
  tightListAfterParagraph: false,
  closeAtx: false,
  setext: false,
  rule: '-',
  ruleRepetition: 3,
  ruleSpaces: false,
  hardBreak: 'spaces',
  quote: '"',
  tableCellPadding: true,
  tablePipeAlign: true,
  eol: '\n',
};

const LIST_MARKER = /^[ \t]{0,3}([-*+]|\d{1,9}[.)])([ \t]+)(?=\S)/;
const ORDERED_MARKER = /^[ \t]*(\d{1,9})([.)])[ \t]+/;
const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;
const ATX_CLOSED = /^[ \t]{0,3}#{1,6}[ \t]+.*?[ \t]+#+[ \t]*$/;
const SETEXT_UNDERLINE = /^[ \t]{0,3}(=+|-+)[ \t]*$/;
const THEMATIC = /^[ \t]{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const INDENTED_CODE = /^(?: {4}|\t)/;

function otherBullet(bullet: Bullet): Bullet {
  return bullet === '*' ? '-' : '*';
}

/** Dominant line ending inside a slice; `fallback` when it has none. */
export function sliceEol(slice: string, fallback: Eol): Eol {
  let crlf = 0;
  let lf = 0;
  let cr = 0;
  for (let i = 0; i < slice.length; i++) {
    const c = slice.charCodeAt(i);
    if (c === 13) {
      if (slice.charCodeAt(i + 1) === 10) {
        crlf++;
        i++;
      } else cr++;
    } else if (c === 10) lf++;
  }
  if (crlf === 0 && lf === 0 && cr === 0) return fallback;
  if (crlf >= lf && crlf >= cr) return '\r\n';
  if (cr > lf) return '\r';
  return '\n';
}

/** Splits on any line ending (remark's notion of a line). */
export function sourceLines(slice: string): string[] {
  return slice.split(/\r\n|\n|\r/);
}

/**
 * Sniffs the style of one block from its source slice. Anything the slice does not
 * exhibit keeps the value from `base` (the document-wide style).
 */
export function sniffBlockStyle(slice: string, base: BlockStyle, docEol: Eol): BlockStyle {
  const style: BlockStyle = { ...base, eol: sliceEol(slice, docEol) };
  const lines = sourceLines(slice);
  const first = lines[0] ?? '';

  // Lists: the first marker decides bullet / ordered marker / indent width.
  let seenBullet: Bullet | null = null;
  let seenOrdered: { n: number; indent: number } | null = null;
  let incrementDecided = false;
  for (const line of lines) {
    const m = LIST_MARKER.exec(line);
    if (!m) continue;
    const marker = m[1] ?? '';
    const gap = m[2] ?? ' ';
    const indent = line.length - line.trimStart().length;
    if (marker === '-' || marker === '*' || marker === '+') {
      if (!seenBullet) {
        seenBullet = marker;
        style.bullet = marker;
        style.bulletOther = otherBullet(marker);
        style.listItemIndent = indentStyle(marker.length, gap.length);
      }
    } else {
      const o = ORDERED_MARKER.exec(line);
      if (o) {
        const n = Number(o[1]);
        if (!seenOrdered) {
          seenOrdered = { n, indent };
          style.bulletOrdered = o[2] === ')' ? ')' : '.';
          if (!seenBullet) style.listItemIndent = indentStyle(marker.length, gap.length);
        } else if (!incrementDecided && indent === seenOrdered.indent) {
          style.incrementListMarker = n !== seenOrdered.n;
          incrementDecided = true;
        }
      }
    }
  }

  const fence = FENCE.exec(first);
  if (fence) {
    style.fence = fence[1]?.startsWith('~') ? '~' : '`';
    style.fences = true;
  } else if (INDENTED_CODE.test(first)) {
    style.fences = false;
  }

  for (let i = 1; i < lines.length; i++) {
    const line = unquote(lines[i] ?? '');
    const prev = unquote(lines[i - 1] ?? '');
    if (LIST_MARKER.test(line) && prev.trim() !== '' && !LIST_MARKER.test(prev)) {
      style.tightListAfterParagraph = true;
      break;
    }
  }

  if (lines.length >= 2 && SETEXT_UNDERLINE.test(lines[1] ?? '') && !THEMATIC.test(first)) {
    style.setext = true;
  } else if (ATX_CLOSED.test(first)) {
    style.closeAtx = true;
  }

  const rule = THEMATIC.exec(first);
  if (rule && lines.length === 1) {
    const ch = rule[1] as '*' | '-' | '_';
    style.rule = ch;
    style.ruleRepetition = Math.max(3, first.split(ch).length - 1);
    style.ruleSpaces = /[-*_][ \t]+[-*_]/.test(first);
  }

  if (/\\(?:\r\n|\n|\r)/.test(slice)) style.hardBreak = 'backslash';
  else if (/ {2,}(?:\r\n|\n|\r)/.test(slice)) style.hardBreak = 'spaces';

  if (/\]\([^)\s]+ '[^']*'\)/.test(slice)) style.quote = "'";

  if (/^[ \t]{0,3}\|/.test(first)) {
    style.tableCellPadding = /^\s*\|\s/.test(first);
  }

  const emphasis = sniffEmphasis(slice);
  if (emphasis.emphasis) style.emphasis = emphasis.emphasis;
  if (emphasis.strong) style.strong = emphasis.strong;
  return style;
}

/** Strips blockquote markers so list detection also works inside quotes. */
function unquote(line: string): string {
  return line.replace(/^(?:[ \t]{0,3}>[ \t]?)+/, '');
}

function indentStyle(markerWidth: number, gap: number): ListItemIndent {
  if (gap === 1) return 'one';
  if ((markerWidth + gap) % 4 === 0) return 'tab';
  return 'mixed';
}

function sniffEmphasis(text: string): { emphasis?: EmphasisMarker; strong?: EmphasisMarker } {
  const out: { emphasis?: EmphasisMarker; strong?: EmphasisMarker } = {};
  const strong = /(\*\*|__)(?=\S)[^*_]+?\1/.exec(text);
  if (strong) out.strong = strong[1] === '__' ? '_' : '*';
  const em = /(^|[^*_])([*_])(?=\S)[^*_]+?\2(?![*_])/.exec(text);
  if (em) out.emphasis = em[2] === '_' ? '_' : '*';
  return out;
}

/** Document-wide style: majority vote over the whole text, used for new blocks. */
export function documentStyle(text: string, eol: Eol): BlockStyle {
  const lines = sourceLines(text);
  const bullets: Record<Bullet, number> = { '-': 0, '*': 0, '+': 0 };
  let ordered: { '.': number; ')': number } = { '.': 0, ')': 0 };
  let backslash = 0;
  let spaces = 0;
  for (const line of lines) {
    const m = LIST_MARKER.exec(line);
    if (m) {
      const marker = m[1] ?? '';
      if (marker === '-' || marker === '*' || marker === '+') bullets[marker]++;
      else if (marker.endsWith(')')) ordered[')']++;
      else ordered['.']++;
    }
    if (line.endsWith('\\')) backslash++;
    else if (/ {2,}$/.test(line)) spaces++;
  }
  const bullet = (Object.entries(bullets) as [Bullet, number][]).sort((a, b) => b[1] - a[1])[0];
  const style: BlockStyle = { ...DEFAULT_STYLE, eol };
  if (bullet && bullet[1] > 0) {
    style.bullet = bullet[0];
    style.bulletOther = otherBullet(bullet[0]);
  }
  if (ordered[')'] > ordered['.']) style.bulletOrdered = ')';
  ordered = { '.': 0, ')': 0 };
  if (backslash > spaces) style.hardBreak = 'backslash';
  const emphasis = sniffEmphasis(text);
  if (emphasis.emphasis) style.emphasis = emphasis.emphasis;
  if (emphasis.strong) style.strong = emphasis.strong;
  return style;
}

/**
 * The sniffed style first, then variants for what cannot be sniffed reliably
 * (list indentation, table pipe alignment, title quotes), limited to the
 * constructs the slice actually contains so the search stays short.
 */
export function styleVariants(style: BlockStyle, slice: string): BlockStyle[] {
  const variants: BlockStyle[] = [style];
  const lines = sourceLines(slice);
  const hasList = lines.some((l) => LIST_MARKER.test(unquote(l)));
  const hasOrdered = hasList && lines.some((l) => ORDERED_MARKER.test(unquote(l)));
  const hasTable = lines.length >= 2 && /\|/.test(lines[1] ?? '') && /-/.test(lines[1] ?? '');
  const hasTitle = /\]\([^)]*["']/.test(slice);
  if (hasList) {
    for (const listItemIndent of ['one', 'tab', 'mixed'] as const) {
      if (listItemIndent !== style.listItemIndent) variants.push({ ...style, listItemIndent });
    }
  }
  if (hasOrdered) variants.push({ ...style, incrementListMarker: !style.incrementListMarker });
  if (hasTable) {
    variants.push({ ...style, tablePipeAlign: !style.tablePipeAlign });
    variants.push({ ...style, tableCellPadding: !style.tableCellPadding });
  }
  if (hasTitle) variants.push({ ...style, quote: style.quote === '"' ? "'" : '"' });
  return variants;
}

/** Stable key for caching one stringify processor per distinct option set. */
export function styleKey(style: BlockStyle): string {
  const { eol: _eol, ...rest } = style;
  return JSON.stringify(rest);
}

type Handlers = NonNullable<StringifyOptions['handlers']>;

/** remark-stringify options for a style, with Milkdown's handlers plus the hard-break style. */
export function stringifyOptions(style: BlockStyle, base: Handlers): StringifyOptions {
  const hardBreak = style.hardBreak === 'backslash' ? '\\\n' : '  \n';
  return {
    bullet: style.bullet,
    bulletOther: style.bulletOther,
    bulletOrdered: style.bulletOrdered,
    incrementListMarker: style.incrementListMarker,
    listItemIndent: style.listItemIndent,
    emphasis: style.emphasis,
    strong: style.strong,
    fence: style.fence,
    fences: style.fences,
    closeAtx: style.closeAtx,
    setext: style.setext,
    rule: style.rule,
    ruleRepetition: style.ruleRepetition,
    ruleSpaces: style.ruleSpaces,
    quote: style.quote,
    resourceLink: false,
    tightDefinitions: true,
    join: style.tightListAfterParagraph ? [tightListJoin] : undefined,
    handlers: {
      ...base,
      // Milkdown's text handler returns any text ending in whitespace unescaped (meant for
      // whitespace-only runs); only whitespace-only text may skip escaping.
      text: (node, _parent, state, info) =>
        node.value.trim() === '' ? node.value : state.safe(node.value, { ...info, encode: [] }),
      // A GFM autolink literal (`https://…` without brackets) keeps its bare form.
      link: (node, parent, state, info) => {
        const literal = (node as Link & { literal?: boolean }).literal === true;
        const only = node.children.length === 1 ? node.children[0] : null;
        if (literal && only?.type === 'text') {
          const text = only.value;
          if (text === node.url || `mailto:${text}` === node.url || `http://${text}` === node.url)
            return text;
        }
        return defaultHandlers.link(node, parent, state, info);
      },
      break: (node, _parent, state, info) => {
        const marker = (node as { marker?: string }).marker;
        const chosen = marker === '\\' ? '\\\n' : marker === '  ' ? '  \n' : hardBreak;
        // Inside constructs that cannot hold a line ending (table cells, setext text) a
        // hard break degrades to a space, as mdast-util-to-markdown does.
        for (const pattern of state.unsafe) {
          if (
            pattern.character === '\n' &&
            !pattern.before &&
            !pattern.after &&
            inScope(state.stack, pattern)
          ) {
            return /[\t ]/.test(info.before) ? '' : ' ';
          }
        }
        return chosen;
      },
    },
  };
}

/** No blank line between a paragraph and a list that may interrupt it (bullet, or ordered from 1). */
function tightListJoin(left: Nodes, right: Nodes, parent: Parents): number | undefined {
  if (left.type !== 'paragraph' || right.type !== 'list' || parent.type === 'list')
    return undefined;
  const first = right.children[0];
  if (!first || first.children.length === 0) return undefined;
  if (right.ordered && (right.start ?? 1) !== 1) return undefined;
  return 0;
}

interface UnsafePattern {
  inConstruct?: string | readonly string[] | null | undefined;
  notInConstruct?: string | readonly string[] | null | undefined;
}

function inScope(stack: readonly string[], pattern: UnsafePattern): boolean {
  const listed = (list: string | readonly string[] | null | undefined): readonly string[] =>
    list == null ? [] : Array.isArray(list) ? list : [list as string];
  const inConstruct = listed(pattern.inConstruct);
  const notInConstruct = listed(pattern.notInConstruct);
  if (inConstruct.length > 0 && !inConstruct.some((c) => stack.includes(c))) return false;
  if (notInConstruct.some((c) => stack.includes(c))) return false;
  return true;
}
