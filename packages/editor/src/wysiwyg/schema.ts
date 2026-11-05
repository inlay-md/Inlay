// SPDX-License-Identifier: Apache-2.0
/**
 * Inlay's additions to Milkdown's commonmark + GFM schema (ADR-0004):
 *
 * - `raw_island`: a top-level block kept as its exact source slice (raw HTML,
 *   front matter, comments, directives, anything that fails the round trip).
 * - `raw_inline_island`: inline HTML inside a paragraph, kept verbatim.
 * - `math_block` / `math_inline`: remark-math nodes (Crepe's LaTeX feature turns
 *   display math into a `LaTeX` code fence, which would not round-trip).
 * - `definition`, `link_reference`, `image_reference`: reference-style links
 *   (Milkdown resolves them with remark-inline-links, which drops definitions).
 *
 * The plugins Milkdown ships that would alter the document on load or save are
 * removed in `applyInlayPlugins`.
 */
import type { Editor } from '@milkdown/kit/core';
import { trailing } from '@milkdown/kit/plugin/trailing';
import {
  hardbreakSchema,
  htmlAttr,
  htmlSchema,
  linkAttr,
  linkSchema,
  remarkInlineLinkPlugin,
  syncHeadingIdPlugin,
} from '@milkdown/kit/preset/commonmark';
import { $markSchema, $nodeSchema, $remark } from '@milkdown/kit/utils';
import remarkFrontmatter from 'remark-frontmatter';
import remarkMath from 'remark-math';

export type IslandKind =
  | 'frontmatter'
  | 'comment'
  | 'script'
  | 'style'
  | 'svg'
  | 'html'
  | 'directive'
  | 'unsupported'
  | 'mismatch';

export const RAW_ISLAND = 'raw_island';
export const RAW_INLINE_ISLAND = 'raw_inline_island';
export const MATH_BLOCK = 'math_block';
export const MATH_INLINE = 'math_inline';
export const DEFINITION = 'definition';
export const LINK_REFERENCE = 'link_reference';
export const IMAGE_REFERENCE = 'image_reference';

/** Synthetic mdast type the loader hands to the parser for forced islands. */
export const ISLAND_MDAST_TYPE = 'inlayRawIsland';

export const remarkFrontmatterPlugin = $remark('remarkFrontmatter', () => remarkFrontmatter, [
  'yaml',
]);
export const remarkMathPlugin = $remark('remarkMath', () => remarkMath);

/**
 * Records how constructs were written, the way Milkdown's `remarkMarker` records
 * emphasis markers: a hard break's marker (two spaces or a backslash) and whether a
 * link was a bare GFM autolink literal. Serialization reproduces them, so a
 * paragraph mixing both break styles or holding a bare URL still round-trips.
 */
export const remarkInlayMarkers = $remark('remarkInlayMarkers', () => () => (tree, file) => {
  const source = String(file.value ?? '');
  const visit = (node: { type: string; children?: unknown[]; position?: unknown }) => {
    const start = (node.position as { start: { offset?: number } } | undefined)?.start.offset;
    if (start != null) {
      if (node.type === 'break') {
        (node as { marker?: string }).marker = source.charAt(start) === '\\' ? '\\' : '  ';
      } else if (node.type === 'link') {
        const c = source.charAt(start);
        (node as { literal?: boolean }).literal = c !== '[' && c !== '<';
      }
    }
    for (const child of node.children ?? []) visit(child as typeof node);
  };
  visit(tree as { type: string; children?: unknown[] });
});

const SAFE_HREF = /^(?:https?:|mailto:|tel:|[#./?]|[^:]*$)/i;
function sanitizeHref(href: unknown): string {
  const value = String(href ?? '');
  return SAFE_HREF.test(value.trim()) ? value : '#';
}

/** Milkdown's link mark plus `literal` (a bare autolink) recorded by `remarkInlayMarkers`. */
export const inlayLinkSchema = $markSchema('link', (ctx) => ({
  attrs: {
    href: { validate: 'string' },
    title: { default: null, validate: 'string|null' },
    literal: { default: false, validate: 'boolean' },
  },
  parseDOM: [
    {
      tag: 'a[href]',
      getAttrs: (dom) => ({
        href: (dom as HTMLElement).getAttribute('href'),
        title: (dom as HTMLElement).getAttribute('title'),
      }),
    },
  ],
  toDOM: (mark) => [
    'a',
    {
      ...ctx.get(linkAttr.key)(mark),
      href: sanitizeHref(mark.attrs.href),
      ...(mark.attrs.title ? { title: mark.attrs.title } : {}),
    },
  ],
  parseMarkdown: {
    match: (node) => node.type === 'link',
    runner: (state, node, markType) => {
      state.openMark(markType, {
        href: String(node.url ?? ''),
        title: node.title == null ? null : String(node.title),
        literal: node.literal === true,
      });
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'link',
    runner: (state, mark) => {
      state.withMark(mark, 'link', undefined, {
        title: mark.attrs.title,
        url: mark.attrs.href,
        literal: mark.attrs.literal === true,
      });
    },
  },
}));

/** Milkdown's hardbreak plus the `marker` attribute recorded by `remarkInlayMarkers`. */
export const inlayHardbreakSchema = $nodeSchema('hardbreak', () => ({
  inline: true,
  group: 'inline',
  attrs: {
    isInline: { default: false, validate: 'boolean' },
    marker: { default: '', validate: 'string' },
  },
  selectable: false,
  parseDOM: [
    { tag: 'br' },
    { tag: 'span[data-type="hardbreak"]', getAttrs: () => ({ isInline: true }) },
  ],
  toDOM: (node) => (node.attrs.isInline ? ['span', { 'data-type': 'hardbreak' }, ' '] : ['br', {}]),
  parseMarkdown: {
    match: ({ type }) => type === 'break',
    runner: (state, node, type) => {
      const data = node.data as { isInline?: boolean } | undefined;
      state.addNode(type, {
        isInline: Boolean(data?.isInline),
        marker: typeof node.marker === 'string' ? node.marker : '',
      });
    },
  },
  leafText: () => '\n',
  toMarkdown: {
    match: (node) => node.type.name === 'hardbreak',
    runner: (state, node) => {
      if (node.attrs.isInline) state.addNode('text', undefined, '\n');
      else state.addNode('break', undefined, undefined, { marker: node.attrs.marker || undefined });
    },
  },
}));

export const rawIslandSchema = $nodeSchema(RAW_ISLAND, () => ({
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  defining: true,
  isolating: true,
  attrs: {
    source: { default: '', validate: 'string' },
    kind: { default: 'html', validate: 'string' },
  },
  parseDOM: [
    {
      tag: 'div[data-type="raw-island"]',
      getAttrs: (dom) => ({
        source: (dom as HTMLElement).dataset.source ?? '',
        kind: (dom as HTMLElement).dataset.kind ?? 'html',
      }),
    },
  ],
  toDOM: (node) => [
    'div',
    {
      'data-type': 'raw-island',
      'data-kind': node.attrs.kind,
      'data-source': node.attrs.source,
      class: `inlay-island inlay-island-${node.attrs.kind}`,
    },
    ['pre', { class: 'inlay-island-source' }, node.attrs.source],
  ],
  parseMarkdown: {
    match: ({ type }) => type === ISLAND_MDAST_TYPE || type === 'yaml',
    runner: (state, node, type) => {
      state.addNode(type, {
        source: String(node.source ?? node.value ?? ''),
        kind: String(node.kind ?? (node.type === 'yaml' ? 'frontmatter' : 'html')),
      });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === RAW_ISLAND,
    // mdast-util-to-markdown emits `html` values verbatim: the exact source survives.
    runner: (state, node) => {
      state.addNode('html', undefined, node.attrs.source);
    },
  },
}));

export const rawInlineIslandSchema = $nodeSchema(RAW_INLINE_ISLAND, () => ({
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  attrs: { source: { default: '', validate: 'string' } },
  parseDOM: [
    {
      tag: 'span[data-type="raw-inline-island"]',
      getAttrs: (dom) => ({ source: (dom as HTMLElement).dataset.source ?? '' }),
    },
  ],
  toDOM: (node) => [
    'span',
    {
      'data-type': 'raw-inline-island',
      'data-source': node.attrs.source,
      class: 'inlay-inline-island',
    },
    node.attrs.source,
  ],
  parseMarkdown: {
    match: ({ type }) => type === 'html',
    runner: (state, node, type) => {
      state.addNode(type, { source: String(node.value ?? '') });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === RAW_INLINE_ISLAND,
    runner: (state, node) => {
      state.addNode('html', undefined, node.attrs.source);
    },
  },
}));

export const mathBlockSchema = $nodeSchema(MATH_BLOCK, () => ({
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  attrs: {
    value: { default: '', validate: 'string' },
    meta: { default: '', validate: 'string' },
  },
  parseDOM: [
    {
      tag: 'div[data-type="math-block"]',
      getAttrs: (dom) => ({ value: (dom as HTMLElement).dataset.value ?? '' }),
    },
  ],
  toDOM: (node) => [
    'div',
    { 'data-type': 'math-block', 'data-value': node.attrs.value, class: 'inlay-math-block' },
    ['pre', {}, node.attrs.value],
  ],
  parseMarkdown: {
    match: ({ type }) => type === 'math',
    runner: (state, node, type) => {
      state.addNode(type, { value: String(node.value ?? ''), meta: String(node.meta ?? '') });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === MATH_BLOCK,
    runner: (state, node) => {
      state.addNode('math', undefined, node.attrs.value, {
        meta: node.attrs.meta || null,
      });
    },
  },
}));

export const mathInlineSchema = $nodeSchema(MATH_INLINE, () => ({
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  attrs: { value: { default: '', validate: 'string' } },
  parseDOM: [
    {
      tag: 'span[data-type="math-inline"]',
      getAttrs: (dom) => ({ value: (dom as HTMLElement).dataset.value ?? '' }),
    },
  ],
  toDOM: (node) => [
    'span',
    { 'data-type': 'math-inline', 'data-value': node.attrs.value, class: 'inlay-math-inline' },
    node.attrs.value,
  ],
  parseMarkdown: {
    match: ({ type }) => type === 'inlineMath',
    runner: (state, node, type) => {
      state.addNode(type, { value: String(node.value ?? '') });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === MATH_INLINE,
    runner: (state, node) => {
      state.addNode('inlineMath', undefined, node.attrs.value);
    },
  },
}));

export const definitionSchema = $nodeSchema(DEFINITION, () => ({
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  attrs: {
    identifier: { default: '', validate: 'string' },
    label: { default: '', validate: 'string' },
    url: { default: '', validate: 'string' },
    title: { default: '', validate: 'string' },
  },
  parseDOM: [
    {
      tag: 'div[data-type="definition"]',
      getAttrs: (dom) => {
        const d = (dom as HTMLElement).dataset;
        return {
          identifier: d.identifier ?? '',
          label: d.label ?? '',
          url: d.url ?? '',
          title: d.title ?? '',
        };
      },
    },
  ],
  toDOM: (node) => [
    'div',
    {
      'data-type': 'definition',
      'data-identifier': node.attrs.identifier,
      'data-label': node.attrs.label,
      'data-url': node.attrs.url,
      'data-title': node.attrs.title,
      class: 'inlay-definition',
    },
    ['span', { class: 'inlay-definition-label' }, `[${node.attrs.label}]`],
    ': ',
    ['span', { class: 'inlay-definition-url' }, node.attrs.url],
  ],
  parseMarkdown: {
    match: ({ type }) => type === 'definition',
    runner: (state, node, type) => {
      state.addNode(type, {
        identifier: String(node.identifier ?? ''),
        label: String(node.label ?? node.identifier ?? ''),
        url: String(node.url ?? ''),
        title: node.title == null ? '' : String(node.title),
      });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === DEFINITION,
    runner: (state, node) => {
      state.addNode('definition', undefined, undefined, {
        identifier: node.attrs.identifier,
        label: node.attrs.label,
        url: node.attrs.url,
        title: node.attrs.title || null,
      });
    },
  },
}));

export const linkReferenceSchema = $markSchema(LINK_REFERENCE, () => ({
  attrs: {
    identifier: { default: '', validate: 'string' },
    label: { default: '', validate: 'string' },
    referenceType: { default: 'full', validate: 'string' },
  },
  parseDOM: [
    {
      tag: 'a[data-type="link-reference"]',
      getAttrs: (dom) => {
        const d = (dom as HTMLElement).dataset;
        return {
          identifier: d.identifier ?? '',
          label: d.label ?? '',
          referenceType: d.referenceType ?? 'full',
        };
      },
    },
  ],
  toDOM: (mark) => [
    'a',
    {
      'data-type': 'link-reference',
      'data-identifier': mark.attrs.identifier,
      'data-label': mark.attrs.label,
      'data-reference-type': mark.attrs.referenceType,
      class: 'inlay-link-reference',
      title: `[${mark.attrs.label}]`,
    },
  ],
  parseMarkdown: {
    match: ({ type }) => type === 'linkReference',
    runner: (state, node, markType) => {
      state.openMark(markType, {
        identifier: String(node.identifier ?? ''),
        label: String(node.label ?? node.identifier ?? ''),
        referenceType: String(node.referenceType ?? 'full'),
      });
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === LINK_REFERENCE,
    runner: (state, mark) => {
      state.withMark(mark, 'linkReference', undefined, {
        identifier: mark.attrs.identifier,
        label: mark.attrs.label,
        referenceType: mark.attrs.referenceType,
      });
    },
  },
}));

export const imageReferenceSchema = $nodeSchema(IMAGE_REFERENCE, () => ({
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  attrs: {
    alt: { default: '', validate: 'string' },
    identifier: { default: '', validate: 'string' },
    label: { default: '', validate: 'string' },
    referenceType: { default: 'full', validate: 'string' },
  },
  parseDOM: [
    {
      tag: 'span[data-type="image-reference"]',
      getAttrs: (dom) => {
        const d = (dom as HTMLElement).dataset;
        return {
          alt: d.alt ?? '',
          identifier: d.identifier ?? '',
          label: d.label ?? '',
          referenceType: d.referenceType ?? 'full',
        };
      },
    },
  ],
  toDOM: (node) => [
    'span',
    {
      'data-type': 'image-reference',
      'data-alt': node.attrs.alt,
      'data-identifier': node.attrs.identifier,
      'data-label': node.attrs.label,
      'data-reference-type': node.attrs.referenceType,
      class: 'inlay-image-reference',
    },
    `![${node.attrs.alt}][${node.attrs.label}]`,
  ],
  parseMarkdown: {
    match: ({ type }) => type === 'imageReference',
    runner: (state, node, type) => {
      state.addNode(type, {
        alt: node.alt == null ? '' : String(node.alt),
        identifier: String(node.identifier ?? ''),
        label: String(node.label ?? node.identifier ?? ''),
        referenceType: String(node.referenceType ?? 'full'),
      });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === IMAGE_REFERENCE,
    runner: (state, node) => {
      state.addNode('imageReference', undefined, undefined, {
        alt: node.attrs.alt || null,
        identifier: node.attrs.identifier,
        label: node.attrs.label,
        referenceType: node.attrs.referenceType,
      });
    },
  },
}));

export const inlayPlugins = [
  remarkFrontmatterPlugin,
  remarkMathPlugin,
  remarkInlayMarkers,
  inlayHardbreakSchema,
  inlayLinkSchema,
  rawIslandSchema,
  rawInlineIslandSchema,
  mathBlockSchema,
  mathInlineSchema,
  definitionSchema,
  linkReferenceSchema,
  imageReferenceSchema,
].flat();

/**
 * Removes the Milkdown plugins that rewrite the document (reference resolution, the
 * trailing paragraph, heading-id sync, the inline `html` node) and adds Inlay's
 * schema. Call before `editor.create()`.
 */
export function applyInlayPlugins(editor: Editor): Editor {
  void editor.remove(
    [
      remarkInlineLinkPlugin,
      trailing,
      syncHeadingIdPlugin,
      htmlSchema,
      htmlAttr,
      hardbreakSchema,
      linkSchema,
    ].flat(),
  );
  return editor.use(inlayPlugins);
}

/** Classifies a raw block for its island card. */
export function islandKind(slice: string): IslandKind {
  const head = slice.trimStart().slice(0, 64).toLowerCase();
  if (head.startsWith('<!--')) return 'comment';
  if (head.startsWith('<script')) return 'script';
  if (head.startsWith('<style')) return 'style';
  if (head.startsWith('<svg')) return 'svg';
  if (head.startsWith(':::') || head.startsWith('::')) return 'directive';
  if (/<script[\s>]/.test(slice.toLowerCase())) return 'script';
  return 'html';
}
