// SPDX-License-Identifier: Apache-2.0
/**
 * The in-place source editor islands and math blocks share: a CodeMirror instance
 * mounted inside the node view, writing every change back to the node's attribute
 * so the block splice sees the new source (the atom's bytes are its attribute).
 * Escape closes it and re-selects the node; the line separator is the island's own
 * so CRLF islands stay CRLF (ADR-0028).
 */
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { html } from '@codemirror/lang-html';
import { markdown } from '@codemirror/lang-markdown';
import { type LanguageDescription, StreamLanguage } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { Compartment, type Extension } from '@codemirror/state';
import {
  EditorView as CodeMirror,
  drawSelection,
  highlightSpecialChars,
  keymap,
} from '@codemirror/view';
import { NodeSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { createSourceState, getText } from '../source-state.ts';
import { inlayTheme } from '../theme.ts';
import { sliceEol } from './style.ts';

export type InPlaceLanguage = 'html' | 'markdown' | 'yaml' | 'latex' | 'text';

export interface InPlaceOptions {
  /** Element the editor is appended to. */
  host: HTMLElement;
  view: EditorView;
  getPos: () => number | undefined;
  /** Node attribute holding the source. */
  attr: string;
  language: InPlaceLanguage;
  onToggle?: (editing: boolean) => void;
}

/** Node views that can be opened for editing register here so a keymap can find them. */
const editables = new WeakMap<Element, () => void>();

export function registerEditable(dom: Element, open: () => void): void {
  editables.set(dom, open);
}

/** Opens the in-place editor of the selected atom (Enter on a node selection). */
export function openSelectedEditable(view: EditorView): boolean {
  const { selection } = view.state;
  if (!(selection instanceof NodeSelection)) return false;
  const dom = view.nodeDOM(selection.from);
  const open = dom instanceof Element ? editables.get(dom) : undefined;
  if (!open) return false;
  open();
  return true;
}

export class InPlaceEditor {
  private cm: CodeMirror | null = null;
  private readonly container: HTMLDivElement;
  private readonly language = new Compartment();
  private current = '';
  private writing = false;

  constructor(private readonly o: InPlaceOptions) {
    this.container = document.createElement('div');
    this.container.className = 'inlay-in-place';
    this.container.hidden = true;
    o.host.append(this.container);
  }

  get editing(): boolean {
    return this.cm !== null;
  }

  owns(target: EventTarget | null): boolean {
    return target instanceof Node && this.container.contains(target);
  }

  open(source: string): void {
    if (this.cm) {
      this.cm.focus();
      return;
    }
    this.current = source;
    const eol = sliceEol(source, '\n');
    const state = createSourceState({
      text: source,
      eol,
      extensions: [
        highlightSpecialChars(),
        history(),
        drawSelection(),
        CodeMirror.lineWrapping,
        keymap.of([
          {
            key: 'Escape',
            run: () => {
              this.close(true);
              return true;
            },
          },
          {
            key: 'Mod-Enter',
            run: () => {
              this.close(true);
              return true;
            },
          },
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        this.language.of(languageFor(this.o.language)),
        inlayTheme,
        CodeMirror.updateListener.of((u) => {
          if (u.docChanged) this.write(getText(u.state));
        }),
      ],
    });
    this.container.hidden = false;
    this.cm = new CodeMirror({ state, parent: this.container });
    void loadLazyLanguage(this.o.language).then((ext) => {
      if (ext && this.cm) this.cm.dispatch({ effects: this.language.reconfigure(ext) });
    });
    this.o.onToggle?.(true);
    this.cm.focus();
  }

  /** The node's source changed from outside (undo, another view): keep the editor in step. */
  sync(source: string): void {
    if (this.writing || !this.cm || source === this.current) return;
    this.current = source;
    this.cm.dispatch({ changes: { from: 0, to: this.cm.state.doc.length, insert: source } });
  }

  private write(source: string): void {
    if (source === this.current) return;
    this.current = source;
    const pos = this.o.getPos();
    if (pos == null) return;
    this.writing = true;
    try {
      this.o.view.dispatch(this.o.view.state.tr.setNodeAttribute(pos, this.o.attr, source));
    } finally {
      this.writing = false;
    }
  }

  close(reselect: boolean): void {
    if (!this.cm) return;
    this.cm.destroy();
    this.cm = null;
    this.container.hidden = true;
    this.o.onToggle?.(false);
    const pos = this.o.getPos();
    if (reselect && pos != null) {
      const { view } = this.o;
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
      view.focus();
    }
  }

  destroy(): void {
    this.cm?.destroy();
    this.cm = null;
    this.container.remove();
  }
}

function languageFor(language: InPlaceLanguage): Extension {
  switch (language) {
    case 'html':
      return html();
    case 'markdown':
      return markdown();
    default:
      return [];
  }
}

/** YAML and LaTeX come from language-data (lazy chunks). */
async function loadLazyLanguage(language: InPlaceLanguage): Promise<Extension | null> {
  const name = language === 'yaml' ? 'YAML' : language === 'latex' ? 'LaTeX' : null;
  if (!name) return null;
  const description: LanguageDescription | null =
    languages.find((l) => l.name === name || l.alias.includes(name.toLowerCase())) ?? null;
  if (!description) return null;
  const support = await description.load();
  return support instanceof StreamLanguage ? support : support;
}
