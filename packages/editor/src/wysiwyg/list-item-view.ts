// SPDX-License-Identifier: Apache-2.0
/**
 * A plain-DOM list item view. Crepe's list item mounts a Vue app per item, which
 * costs about 0.3 ms each: the 10k-line fixture has two thousand items, so it
 * alone would spend most of the one-second open budget. This view renders the
 * marker (bullet, number or task checkbox) with DOM nodes and lets the browser do
 * the rest; clicking the checkbox toggles `checked` on the node.
 */
import { listItemSchema } from '@milkdown/kit/preset/commonmark';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import type { EditorView, NodeView } from '@milkdown/kit/prose/view';
import { $view } from '@milkdown/kit/utils';

class ListItemView implements NodeView {
  readonly dom: HTMLLIElement;
  readonly contentDOM: HTMLDivElement;
  private readonly label: HTMLSpanElement;
  private readonly checkbox: HTMLInputElement;
  private node: ProseNode;

  constructor(
    node: ProseNode,
    private readonly view: EditorView,
    readonly getPos: () => number | undefined,
  ) {
    this.node = node;
    this.dom = document.createElement('li');
    this.dom.className = 'inlay-li';
    this.label = document.createElement('span');
    this.label.className = 'inlay-li-label';
    this.label.contentEditable = 'false';
    this.checkbox = document.createElement('input');
    this.checkbox.type = 'checkbox';
    this.checkbox.className = 'inlay-li-checkbox';
    this.checkbox.contentEditable = 'false';
    this.checkbox.addEventListener('mousedown', (e) => e.preventDefault());
    this.checkbox.addEventListener('click', (e) => {
      e.preventDefault();
      const pos = getPos();
      if (pos == null || !view.editable) return;
      view.dispatch(view.state.tr.setNodeAttribute(pos, 'checked', !this.node.attrs.checked));
    });
    this.contentDOM = document.createElement('div');
    this.contentDOM.className = 'inlay-li-content';
    this.dom.append(this.label, this.checkbox, this.contentDOM);
    this.render();
  }

  private render(): void {
    const { listType, label, checked } = this.node.attrs as {
      listType: string;
      label: string;
      checked: boolean | null;
    };
    this.dom.dataset.listType = listType;
    const task = checked !== null && checked !== undefined;
    this.dom.dataset.itemType = task ? 'task' : 'item';
    this.checkbox.hidden = !task;
    this.checkbox.checked = task && Boolean(checked);
    this.checkbox.disabled = !this.view.editable;
    this.label.hidden = task;
    this.label.textContent = listType === 'ordered' ? label : '•';
  }

  update(node: ProseNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  ignoreMutation(mutation: MutationRecord | { type: 'selection'; target: Node }): boolean {
    if (mutation.type === 'selection') return false;
    return !this.contentDOM.contains(mutation.target);
  }

  stopEvent(event: Event): boolean {
    return event.target === this.checkbox;
  }
}

export const inlayListItemView = $view(
  listItemSchema.node,
  () => (node, view, getPos) => new ListItemView(node, view, getPos),
);
