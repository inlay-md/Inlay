// SPDX-License-Identifier: Apache-2.0
/**
 * Script handling and the sanitize schema for the `static` and `sanitized` modes.
 * `full` keeps the document as authored (optionally without scripts).
 */
import type { Element, ElementContent, Root } from 'hast';
import { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize';
import { visit } from 'unist-util-visit';

const SVG_TAGS = [
  'svg',
  'g',
  'path',
  'circle',
  'ellipse',
  'rect',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'textPath',
  'defs',
  'use',
  'symbol',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'mask',
  'pattern',
  'marker',
  'image',
  'filter',
  'feGaussianBlur',
  'feOffset',
  'feBlend',
  'feColorMatrix',
  'feMerge',
  'feMergeNode',
  'feFlood',
  'feComposite',
  'feDropShadow',
  'feTurbulence',
  'feDisplacementMap',
  'feMorphology',
  'title',
  'desc',
  'switch',
  'animate',
  'animateTransform',
  'animateMotion',
  'set',
  'mpath',
];

const SVG_ATTRIBUTES = [
  'viewBox',
  'xmlns',
  'xmlnsXLink',
  'preserveAspectRatio',
  'fill',
  'fillRule',
  'fillOpacity',
  'stroke',
  'strokeWidth',
  'strokeOpacity',
  'strokeLinecap',
  'strokeLinejoin',
  'strokeDasharray',
  'strokeDashoffset',
  'strokeMiterlimit',
  'd',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'dx',
  'dy',
  'points',
  'transform',
  'opacity',
  'fontSize',
  'fontFamily',
  'fontWeight',
  'fontStyle',
  'textAnchor',
  'dominantBaseline',
  'alignmentBaseline',
  'letterSpacing',
  'offset',
  'stopColor',
  'stopOpacity',
  'gradientUnits',
  'gradientTransform',
  'spreadMethod',
  'patternUnits',
  'patternTransform',
  'clipPathUnits',
  'clipPath',
  'clipRule',
  'mask',
  'maskUnits',
  'markerWidth',
  'markerHeight',
  'markerUnits',
  'markerStart',
  'markerMid',
  'markerEnd',
  'refX',
  'refY',
  'orient',
  'in',
  'in2',
  'stdDeviation',
  'result',
  'mode',
  'values',
  'floodColor',
  'floodOpacity',
  'operator',
  'k1',
  'k2',
  'k3',
  'k4',
  'scale',
  'baseFrequency',
  'numOctaves',
  'seed',
  'radius',
  'filter',
  'filterUnits',
  'vectorEffect',
  'paintOrder',
  'shapeRendering',
  'visibility',
  'display',
  'overflow',
  'attributeName',
  'attributeType',
  'from',
  'to',
  'by',
  'dur',
  'begin',
  'end',
  'repeatCount',
  'repeatDur',
  'calcMode',
  'keyTimes',
  'keySplines',
  'additive',
  'accumulate',
  'restart',
  'path',
  'rotate',
  'role',
  'focusable',
];

const EXTRA_HTML_TAGS = [
  'figure',
  'figcaption',
  'details',
  'summary',
  'mark',
  'abbr',
  'u',
  's',
  'small',
  'cite',
  'dfn',
  'time',
  'bdi',
  'bdo',
  'wbr',
  'section',
  'article',
  'header',
  'footer',
  'nav',
  'aside',
  'main',
  'address',
  'picture',
  'source',
  'video',
  'audio',
  'track',
  'canvas',
  'button',
  'label',
  'output',
  'progress',
  'meter',
  'select',
  'option',
  'optgroup',
  'textarea',
  'fieldset',
  'legend',
  'caption',
  'colgroup',
  'col',
  'ruby',
  'rt',
  'rp',
  'data',
  'math',
  'semantics',
  'annotation',
  'mrow',
  'mi',
  'mo',
  'mn',
  'ms',
  'mtext',
  'mspace',
  'msup',
  'msub',
  'msubsup',
  'mfrac',
  'msqrt',
  'mroot',
  'mtable',
  'mtr',
  'mtd',
  'mover',
  'munder',
  'munderover',
  'mstyle',
  'mpadded',
  'mphantom',
  'menclose',
  'merror',
  'mlabeledtr',
  'maction',
];

function buildSchema(allowStyleElement: boolean): SanitizeSchema {
  const base = defaultSchema;
  const tagNames = new Set<string>([...(base.tagNames ?? []), ...EXTRA_HTML_TAGS, ...SVG_TAGS]);
  if (allowStyleElement) tagNames.add('style');
  const attributes: NonNullable<SanitizeSchema['attributes']> = { ...(base.attributes ?? {}) };
  attributes['*'] = [
    ...(attributes['*'] ?? []),
    'className',
    'style',
    'data*',
    'ariaLabel',
    'ariaHidden',
    'ariaDescribedBy',
    'ariaLabelledBy',
    'ariaLive',
    'ariaRole',
    'role',
    'controls',
    'autoplay',
    'loop',
    'muted',
    'playsInline',
    'poster',
    'preload',
    'srcSet',
    'sizes',
    'loading',
    'decoding',
    'for',
    'min',
    'max',
    'step',
    'placeholder',
    'wrap',
    'kind',
    'srcLang',
    'default',
    'reversed',
    'datetime',
    ...SVG_ATTRIBUTES,
  ];
  // `code` keeps language-* classes by default; the math/mermaid markers need their own classes.
  attributes.code = ['className'];
  attributes.pre = ['className'];
  attributes.use = ['href', 'xLinkHref'];
  attributes.image = ['href', 'xLinkHref', 'width', 'height', 'x', 'y'];
  attributes.input = ['type', 'checked', 'disabled', 'value', 'min', 'max', 'step', 'placeholder'];
  attributes.a = [...(attributes.a ?? []), 'target', 'rel', 'download'];
  attributes.img = [...(attributes.img ?? []), 'srcSet', 'sizes', 'loading', 'decoding'];
  const protocols = { ...(base.protocols ?? {}) };
  protocols.href = [...(protocols.href ?? []), 'tel', 'sms'];
  protocols.src = [...(protocols.src ?? []), 'data'];
  protocols.poster = ['http', 'https'];
  protocols.xLinkHref = [];
  return {
    ...base,
    tagNames: [...tagNames],
    attributes,
    protocols,
    // Our pages are dedicated documents; no need to prefix ids (keeps footnote links intact).
    clobberPrefix: '',
    clobber: [],
    // Removed with their content; other disallowed elements are unwrapped.
    strip: allowStyleElement
      ? ['script', 'iframe', 'object', 'embed', 'noscript', 'template']
      : ['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template'],
    required: {},
  };
}

/** Schema for `static` output: keeps `<style>`, inline styles, SVG and MathML; no scripts or handlers. */
export const STATIC_SCHEMA: SanitizeSchema = buildSchema(true);
/** Schema for `sanitized` output (editor islands): like static, but `<style>` elements are dropped too. */
export const SANITIZED_SCHEMA: SanitizeSchema = buildSchema(false);

export function makePlaceholder(text: string): Element {
  return {
    type: 'element',
    tagName: 'div',
    properties: { className: ['inlay-script-placeholder'], role: 'note' },
    children: [{ type: 'text', value: text }],
  };
}

/**
 * Replaces `<script>` elements with a placeholder (or removes them when
 * `placeholder` is empty) and strips inline event handlers and `javascript:` URLs.
 * Used for `full` + `allowScripts: false`; the other modes sanitize afterwards.
 */
export function rehypeStripScripts(placeholder: string) {
  return (tree: Root) => {
    visit(tree, 'element', (node, index, parent) => {
      if (!parent || index === undefined) return;
      if (node.tagName === 'script') {
        const replacement: ElementContent[] = placeholder ? [makePlaceholder(placeholder)] : [];
        parent.children.splice(index, 1, ...replacement);
        return index + replacement.length;
      }
      for (const key of Object.keys(node.properties)) {
        if (/^on[a-z]/i.test(key)) delete node.properties[key];
        const value = node.properties[key];
        if (typeof value === 'string' && /^\s*javascript:/i.test(value))
          delete node.properties[key];
      }
      return undefined;
    });
  };
}
