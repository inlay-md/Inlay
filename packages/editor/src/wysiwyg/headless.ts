// SPDX-License-Identifier: Apache-2.0
/**
 * A Milkdown editor with Inlay's schema but none of Crepe's UI features: the same
 * node set the page uses, for tests and for round-trip checks that need no view.
 */
import { Editor, rootCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { applyInlayPlugins } from './schema.ts';

export async function createHeadlessEditor(root: HTMLElement): Promise<Editor> {
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
    })
    .use(commonmark)
    .use(gfm);
  applyInlayPlugins(editor);
  await editor.create();
  return editor;
}
