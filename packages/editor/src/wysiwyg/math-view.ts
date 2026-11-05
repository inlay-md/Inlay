// SPDX-License-Identifier: Apache-2.0
/**
 * KaTeX views for `math_block` and `math_inline`: the formula is rendered in place
 * and the node keeps the TeX source as an attribute. Editing goes through the
 * in-place source editor shared with islands (`island-view.ts`): clicking a block
 * or pressing Enter on a selected one opens it.
 */
import { renderMath } from '@inlay-md/md-render';
import 'katex/dist/katex.min.css';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import type { EditorView, NodeView } from '@milkdown/kit/prose/view';
import { $view } from '@milkdown/kit/utils';
import { InPlaceEditor, registerEditable } from './in-place.ts';
import { cancelVisible, whenVisible } from './lazy.ts';
import { mathBlockSchema, mathInlineSchema } from './schema.ts';

class MathBlockView implements NodeView {
  readonly dom: HTMLElement;
  private readonly preview: HTMLElement;
  private readonly editor: InPlaceEditor;
  private node: ProseNode;
  private rendered = false;

  constructor(node: ProseNode, view: EditorView, getPos: () => number | undefined) {
    this.node = node;
    this.dom = document.createElement('div');
    this.dom.className = 'inlay-math-block';
    this.dom.dataset.type = 'math-block';
    this.preview = document.createElement('div');
    this.preview.className = 'inlay-math-preview';
    this.dom.append(this.preview);
    this.editor = new InPlaceEditor({
      host: this.dom,
      view,
      getPos,
      attr: 'value',
      language: 'latex',
      onToggle: (editing) => {
        this.preview.hidden = editing;
        this.dom.classList.toggle('inlay-editing', editing);
      },
    });
    this.preview.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      this.editor.open(String(this.node.attrs.value ?? ''));
    });
    registerEditable(this.dom, () => this.editor.open(String(this.node.attrs.value ?? '')));
    this.render();
  }

  /** The TeX source stands in until the block nears the viewport; then KaTeX renders it. */
  private render(): void {
    const value = String(this.node.attrs.value ?? '');
    cancelVisible(this.dom);
    if (this.rendered) {
      this.preview.innerHTML = renderMath(value, true);
      return;
    }
    const pre = document.createElement('pre');
    pre.className = 'inlay-math-source';
    pre.textContent = value;
    this.preview.replaceChildren(pre);
    whenVisible(this.dom, () => {
      this.rendered = true;
      this.preview.innerHTML = renderMath(String(this.node.attrs.value ?? ''), true);
    });
  }

  update(node: ProseNode): boolean {
    if (node.type !== this.node.type) return false;
    const changed = node.attrs.value !== this.node.attrs.value;
    this.node = node;
    if (changed) {
      this.render();
      this.editor.sync(String(node.attrs.value ?? ''));
    }
    return true;
  }

  selectNode(): void {
    this.dom.classList.add('ProseMirror-selectednode');
  }

  deselectNode(): void {
    this.dom.classList.remove('ProseMirror-selectednode');
  }

  stopEvent(event: Event): boolean {
    return this.editor.owns(event.target);
  }

  ignoreMutation(): boolean {
    return true;
  }

  destroy(): void {
    cancelVisible(this.dom);
    this.editor.destroy();
  }
}

class MathInlineView implements NodeView {
  readonly dom: HTMLElement;
  private node: ProseNode;
  private rendered = false;

  constructor(node: ProseNode) {
    this.node = node;
    this.dom = document.createElement('span');
    this.dom.className = 'inlay-math-inline';
    this.dom.dataset.type = 'math-inline';
    this.render();
  }

  private render(): void {
    const value = String(this.node.attrs.value ?? '');
    this.dom.title = value;
    cancelVisible(this.dom);
    if (this.rendered) {
      this.dom.innerHTML = renderMath(value, false);
      return;
    }
    this.dom.textContent = `$${value}$`;
    whenVisible(this.dom, () => {
      this.rendered = true;
      this.dom.innerHTML = renderMath(String(this.node.attrs.value ?? ''), false);
    });
  }

  update(node: ProseNode): boolean {
    if (node.type !== this.node.type) return false;
    if (node.attrs.value !== this.node.attrs.value) {
      this.node = node;
      this.render();
    } else {
      this.node = node;
    }
    return true;
  }

  ignoreMutation(): boolean {
    return true;
  }

  destroy(): void {
    cancelVisible(this.dom);
  }
}

export const mathBlockView = $view(
  mathBlockSchema.node,
  () => (node, view, getPos) => new MathBlockView(node, view, getPos),
);

export const mathInlineView = $view(
  mathInlineSchema.node,
  () => (node) => new MathInlineView(node),
);
