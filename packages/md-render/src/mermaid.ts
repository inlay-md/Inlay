// SPDX-License-Identifier: Apache-2.0
/**
 * rehype plugin: in `full` mode, fenced ```mermaid blocks become
 * `<pre class="mermaid">source</pre>` for the client-side Mermaid runtime
 * (read-view lazy-loads it). Other modes keep the code block as is.
 */
import type { Root } from 'hast';
import { toString as hastText } from 'hast-util-to-string';
import { visit } from 'unist-util-visit';

export function rehypeMermaid() {
  return (tree: Root) => {
    visit(tree, 'element', (node) => {
      if (node.tagName !== 'pre' || node.children.length !== 1) return;
      const code = node.children[0];
      if (code?.type !== 'element' || code.tagName !== 'code') return;
      const cls = code.properties['className'];
      const classes = Array.isArray(cls) ? cls.map(String) : [];
      if (!classes.includes('language-mermaid')) return;
      node.properties['className'] = ['mermaid'];
      node.properties['dataLang'] = 'mermaid';
      node.children = [{ type: 'text', value: hastText(code).replace(/\n$/, '') }];
    });
  };
}
