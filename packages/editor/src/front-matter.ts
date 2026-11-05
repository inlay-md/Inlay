// SPDX-License-Identifier: Apache-2.0
/**
 * Lezer Markdown block parser for YAML front matter (`---` fences at the very
 * start of the document), which @lezer/markdown does not ship. remark-frontmatter
 * (md-render) treats the same block as front matter, so highlighting agrees with
 * the Read view, which hides it (ADR-0016).
 */

import { tags as t } from '@lezer/highlight';
import type { BlockContext, Line, MarkdownExtension } from '@lezer/markdown';

const FENCE = /^---\s*$/;

export const frontMatter: MarkdownExtension = {
  defineNodes: [
    { name: 'FrontMatter', block: true, style: t.meta },
    { name: 'FrontMatterMark', style: t.contentSeparator },
  ],
  parseBlock: [
    {
      name: 'FrontMatter',
      before: 'HorizontalRule',
      parse(cx: BlockContext, line: Line): boolean {
        if (cx.lineStart !== 0 || !FENCE.test(line.text)) return false;
        const start = cx.lineStart;
        const marks = [cx.elt('FrontMatterMark', start, start + line.text.length)];
        let end = start + line.text.length;
        while (cx.nextLine()) {
          const lineStart = cx.lineStart;
          if (FENCE.test(line.text)) {
            marks.push(cx.elt('FrontMatterMark', lineStart, lineStart + line.text.length));
            end = lineStart + line.text.length;
            cx.nextLine();
            cx.addElement(cx.elt('FrontMatter', start, end, marks));
            return true;
          }
          end = lineStart + line.text.length;
        }
        // Unterminated: not front matter (remark treats it as a thematic break + text).
        return false;
      },
    },
  ],
};
