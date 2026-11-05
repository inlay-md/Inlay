// SPDX-License-Identifier: Apache-2.0
/**
 * rehype plugin (runs before rehype-raw): writes `data-source-line="start-end"`
 * on block elements from their remark positions, and injects the same attribute
 * into the first start tag of each top-level raw HTML block (ADR-0011), because
 * rehype-raw re-parses raw HTML and drops positions. Also drops whitespace-only
 * text between table rows so the HTML parser does not foster-parent it.
 */
import type { Element, Root } from 'hast';
import type { Node } from 'unist';

const BLOCK_TAGS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'table',
  'hr',
  'section',
  'details',
  'dl',
  'figure',
]);

interface RawNode extends Node {
  type: 'raw';
  value: string;
}

export function sourceRange(node: Node): string | null {
  const pos = node.position;
  if (!pos) return null;
  return `${pos.start.line}-${pos.end.line}`;
}

const FIRST_START_TAG = /^(\s*<([a-zA-Z][a-zA-Z0-9-]*))([\s/>])/;
const SKIP_TAGS = new Set(['script', 'style', 'html', 'head', 'body']);

/** Adds the attribute to the first start tag of a raw block; returns the input unchanged when it does not start with a plain start tag. */
export function injectSourceLine(raw: string, range: string): string {
  const m = FIRST_START_TAG.exec(raw);
  if (!m?.[1] || !m[2] || m[3] === undefined) return raw;
  if (SKIP_TAGS.has(m[2].toLowerCase())) return raw;
  if (/\sdata-source-line=/i.test(raw.slice(0, raw.indexOf('>') + 1))) return raw;
  return `${m[1]} data-source-line="${range}"${m[3]}${raw.slice(m[0].length)}`;
}

const TABLE_PARTS = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr']);

function walk(node: Root | Element, isRoot: boolean): void {
  if (node.type === 'element' && TABLE_PARTS.has(node.tagName)) {
    // Whitespace text between table rows would be foster-parented out of the table by rehype-raw.
    node.children = node.children.filter((c) => !(c.type === 'text' && c.value.trim() === ''));
  }
  for (const child of node.children) {
    if (child.type === 'element') {
      const el = child as Element;
      if (BLOCK_TAGS.has(el.tagName) && el.properties['dataSourceLine'] === undefined) {
        const range = sourceRange(el);
        if (range) el.properties['dataSourceLine'] = range;
      }
      walk(el, false);
    } else if (child.type === 'raw' && isRoot) {
      const raw = child as unknown as RawNode;
      const range = sourceRange(raw);
      if (range) raw.value = injectSourceLine(raw.value, range);
    }
  }
}

export function rehypeSourceLines() {
  return (tree: Root) => {
    walk(tree, true);
  };
}
