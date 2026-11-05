// SPDX-License-Identifier: Apache-2.0
/**
 * Raw island cards (brief: "Island display in the editor"). A block island shows a
 * header (kind, line count, "kept byte for byte") above either a sanitized static
 * rendering (SVG and script-free HTML, through md-render's `sanitized` mode, so no
 * document script can run in the editor) or its source. Script and style islands
 * show their source with a note; front matter, comments and directives show their
 * source. Clicking the body or pressing Enter on the selected island opens the
 * in-place CodeMirror editor (`in-place.ts`); its edits replace only the island's
 * source. Inline islands are chips showing the raw tag; clicking one edits it in a
 * small in-place editor too.
 */
import type { Host } from '@inlay-md/host-api';
import { parseCdnUrl, render, VENDOR_LIBRARIES } from '@inlay-md/md-render';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import type { EditorView, NodeView } from '@milkdown/kit/prose/view';
import { $view } from '@milkdown/kit/utils';
import { InPlaceEditor, type InPlaceLanguage, registerEditable } from './in-place.ts';
import { cancelVisible, whenVisible } from './lazy.ts';
import { type IslandKind, rawInlineIslandSchema, rawIslandSchema } from './schema.ts';
import { sourceLines } from './style.ts';

export const KIND_LABELS: Record<IslandKind, string> = {
  frontmatter: 'Front matter',
  comment: 'Comment',
  script: 'Script',
  style: 'Style',
  svg: 'SVG',
  html: 'HTML',
  directive: 'Directive',
  unsupported: 'Unsupported block',
  mismatch: 'Raw Markdown',
};

/** Kinds whose preview is a sanitized rendering; the others show their source. */
const PREVIEWABLE = new Set<IslandKind>(['svg', 'html']);

const KIND_NOTES: Partial<Record<IslandKind, string>> = {
  script: 'Scripts run in the Read view only.',
  style: 'Styles are not applied in the editor.',
  comment: 'Hidden in the Read view.',
  frontmatter: 'Hidden in the Read view; its title names the window.',
  directive: 'Rendered as written; Inlay has no directive renderer.',
  unsupported: 'This block has no editable form; edit its source.',
  mismatch: 'This block did not round-trip; edit its source.',
};

function languageForKind(kind: IslandKind): InPlaceLanguage {
  switch (kind) {
    case 'frontmatter':
      return 'yaml';
    case 'directive':
    case 'mismatch':
    case 'unsupported':
      return 'markdown';
    default:
      return 'html';
  }
}

/** Known libraries referenced from CDN URLs in the island (rendered from the bundled copies offline). */
export function bundledLibraries(source: string): string[] {
  const found = new Set<string>();
  for (const m of source.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const parsed = parseCdnUrl(m[1] ?? '');
    if (!parsed) continue;
    const library = parsed.library.toLowerCase();
    const known = VENDOR_LIBRARIES.find(
      (v) => v.npm.toLowerCase() === library || v.cdnjs.toLowerCase() === library,
    );
    if (known) found.add(known.npm);
  }
  return [...found];
}

/** Sanitized static HTML for an island (never scripts; `sanitized` mode strips them). */
export function previewHtml(source: string): string {
  return render(source, { mode: 'sanitized' }).html;
}

type View = 'preview' | 'source';

class IslandView implements NodeView {
  readonly dom: HTMLElement;
  private readonly header: HTMLElement;
  private readonly title: HTMLElement;
  private readonly meta: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly readButton: HTMLButtonElement;
  private readonly body: HTMLElement;
  private readonly editor: InPlaceEditor;
  private node: ProseNode;
  private shown: View;
  private previewed = '';
  private rendered = false;

  constructor(
    node: ProseNode,
    view: EditorView,
    getPos: () => number | undefined,
    private readonly host: Host,
  ) {
    this.node = node;
    const kind = this.kind;
    this.shown = PREVIEWABLE.has(kind) ? 'preview' : 'source';
    this.dom = document.createElement('div');
    this.dom.className = 'inlay-island';
    this.dom.dataset.type = 'raw-island';
    this.header = document.createElement('div');
    this.header.className = 'inlay-island-header';
    this.header.contentEditable = 'false';
    this.title = document.createElement('span');
    this.title.className = 'inlay-island-kind';
    this.meta = document.createElement('span');
    this.meta.className = 'inlay-island-meta';
    this.toggle = document.createElement('button');
    this.toggle.type = 'button';
    this.toggle.className = 'inlay-island-toggle';
    this.toggle.addEventListener('mousedown', (e) => e.preventDefault());
    this.toggle.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.editor.editing) this.editor.close(false);
      this.shown = this.shown === 'preview' ? 'source' : 'preview';
      this.render();
    });
    this.readButton = document.createElement('button');
    this.readButton.type = 'button';
    this.readButton.className = 'inlay-island-read';
    this.readButton.textContent = 'Open in Read view';
    this.readButton.title = 'Scripts and styles run in the Read view (⌘4)';
    this.readButton.addEventListener('mousedown', (e) => e.preventDefault());
    this.readButton.addEventListener('click', (e) => {
      e.preventDefault();
      this.host.requestMode('read');
    });
    this.header.append(this.title, this.meta, this.toggle, this.readButton);
    this.body = document.createElement('div');
    this.body.className = 'inlay-island-body';
    this.body.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || this.editor.editing) return;
      e.preventDefault();
      this.edit();
    });
    this.dom.append(this.header, this.body);
    this.editor = new InPlaceEditor({
      host: this.dom,
      view,
      getPos,
      attr: 'source',
      language: languageForKind(kind),
      onToggle: (editing) => {
        this.body.hidden = editing;
        this.dom.classList.toggle('inlay-editing', editing);
        if (!editing) this.render();
      },
    });
    registerEditable(this.dom, () => this.edit());
    this.render();
  }

  private get kind(): IslandKind {
    return String(this.node.attrs.kind ?? 'html') as IslandKind;
  }

  private get source(): string {
    return String(this.node.attrs.source ?? '');
  }

  edit(): void {
    this.editor.open(this.source);
  }

  private render(): void {
    const kind = this.kind;
    const source = this.source;
    this.dom.dataset.kind = kind;
    this.dom.dataset.view = this.shown;
    this.title.textContent = KIND_LABELS[kind];
    const lines = sourceLines(source).length;
    const libraries = bundledLibraries(source);
    const parts = [`${lines} ${lines === 1 ? 'line' : 'lines'}`, 'kept byte for byte'];
    if (libraries.length) parts.push(`${libraries.join(', ')} from the bundled copy`);
    const note = KIND_NOTES[kind];
    if (note) parts.push(note);
    this.meta.textContent = parts.join(' · ');
    this.toggle.hidden = !PREVIEWABLE.has(kind);
    this.toggle.textContent = this.shown === 'preview' ? 'Source' : 'Preview';
    this.readButton.hidden = kind !== 'script' && kind !== 'style';
    if (this.shown === 'preview') {
      if (this.previewed !== source || !this.body.firstChild) {
        // The preview renders once the card nears the viewport; the source stands in until then.
        this.previewed = source;
        cancelVisible(this.dom);
        if (this.rendered) {
          this.body.innerHTML = previewHtml(source);
        } else {
          this.showSource(source);
          whenVisible(this.dom, () => {
            this.rendered = true;
            if (this.shown === 'preview') this.body.innerHTML = previewHtml(this.source);
          });
        }
      }
    } else {
      this.previewed = '';
      cancelVisible(this.dom);
      this.showSource(source);
    }
  }

  private showSource(source: string): void {
    const pre = document.createElement('pre');
    pre.className = 'inlay-island-source';
    pre.textContent = source;
    this.body.replaceChildren(pre);
  }

  update(node: ProseNode): boolean {
    if (node.type !== this.node.type) return false;
    const changed =
      node.attrs.source !== this.node.attrs.source || node.attrs.kind !== this.node.attrs.kind;
    this.node = node;
    if (changed) {
      this.editor.sync(this.source);
      if (!this.editor.editing) this.render();
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
    return this.editor.owns(event.target) || this.header.contains(event.target as Node);
  }

  ignoreMutation(): boolean {
    return true;
  }

  destroy(): void {
    cancelVisible(this.dom);
    this.editor.destroy();
  }
}

class InlineIslandView implements NodeView {
  readonly dom: HTMLElement;
  private readonly chip: HTMLElement;
  private readonly editor: InPlaceEditor;
  private node: ProseNode;

  constructor(node: ProseNode, view: EditorView, getPos: () => number | undefined) {
    this.node = node;
    this.dom = document.createElement('span');
    this.dom.className = 'inlay-inline-island';
    this.dom.dataset.type = 'raw-inline-island';
    this.chip = document.createElement('code');
    this.chip.className = 'inlay-inline-island-chip';
    this.chip.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || this.editor.editing) return;
      e.preventDefault();
      this.editor.open(this.source);
    });
    this.dom.append(this.chip);
    this.editor = new InPlaceEditor({
      host: this.dom,
      view,
      getPos,
      attr: 'source',
      language: 'html',
      onToggle: (editing) => {
        this.chip.hidden = editing;
        this.dom.classList.toggle('inlay-editing', editing);
      },
    });
    registerEditable(this.dom, () => this.editor.open(this.source));
    this.render();
  }

  private get source(): string {
    return String(this.node.attrs.source ?? '');
  }

  private render(): void {
    this.chip.textContent = this.source;
    this.chip.title = 'Inline HTML, kept byte for byte. Click to edit.';
  }

  update(node: ProseNode): boolean {
    if (node.type !== this.node.type) return false;
    const changed = node.attrs.source !== this.node.attrs.source;
    this.node = node;
    if (changed) {
      this.editor.sync(this.source);
      this.render();
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
    this.editor.destroy();
  }
}

export function createIslandViews(host: Host) {
  return [
    $view(
      rawIslandSchema.node,
      () => (node, view, getPos) => new IslandView(node, view, getPos, host),
    ),
    $view(
      rawInlineIslandSchema.node,
      () => (node, view, getPos) => new InlineIslandView(node, view, getPos),
    ),
  ];
}
