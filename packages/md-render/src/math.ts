// SPDX-License-Identifier: Apache-2.0
/** rehype plugin: renders remark-math output (`code.language-math`) with KaTeX. */
import type { Element, Root } from 'hast';
import { toString as hastText } from 'hast-util-to-string';
import katex from 'katex';
import { visit } from 'unist-util-visit';

function classes(node: Element): string[] {
  const c = node.properties['className'];
  return Array.isArray(c) ? c.map(String) : typeof c === 'string' ? [c] : [];
}

export function renderMath(tex: string, display: boolean): string {
  return katex.renderToString(tex, {
    displayMode: display,
    throwOnError: false,
    errorColor: '#cc0000',
    strict: 'ignore',
    output: 'htmlAndMathml',
    trust: false,
  });
}

/** Produces `<span class="inlay-math inlay-math-{inline|display}">` wrapping KaTeX's own markup (as a raw node, serialized verbatim). */
export function rehypeKatex() {
  return (tree: Root) => {
    visit(tree, 'element', (node, index, parent) => {
      if (!parent || index === undefined) return;
      const cls = classes(node);
      if (node.tagName !== 'code' || !cls.includes('language-math')) return;
      const display = cls.includes('math-display');
      const tex = hastText(node).replace(/\n$/, '');
      const html = renderMath(tex, display);
      const wrapper: Element = {
        type: 'element',
        tagName: display ? 'div' : 'span',
        properties: {
          className: ['inlay-math', display ? 'inlay-math-display' : 'inlay-math-inline'],
        },
        children: [{ type: 'raw', value: html } as unknown as Element],
      };
      if (display && parent.type === 'element' && parent.tagName === 'pre') {
        // Replace the whole <pre> with the display block, keeping its source range.
        const range = parent.properties['dataSourceLine'];
        if (range !== undefined) wrapper.properties['dataSourceLine'] = range;
        Object.assign(parent, wrapper);
        return;
      }
      parent.children.splice(index, 1, wrapper);
    });
  };
}
