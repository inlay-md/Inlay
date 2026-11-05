// SPDX-License-Identifier: Apache-2.0
import type { EditorView } from '@codemirror/view';
import type { EditorPosition, Eol } from '@inlay-md/host-api';
import type { EditorView as ProseMirrorView } from '@milkdown/kit/prose/view';
import type { LoadStats } from './wysiwyg/loader.ts';

/** The two editing modes the editor page hosts; Split shows Source beside the Read view. */
export type EditorMode = 'source' | 'wysiwyg';

export interface LoadInfo {
  text: string;
  eol: Eol;
  readOnly: boolean;
}

/**
 * What the page needs from each mode's editor. Text is the common currency: a mode
 * switch hands the live text over and maps the caret by UTF-16 index into it.
 */
export interface ModeEditor {
  readonly kind: EditorMode;
  /** The live text (what the host saves). */
  getContent(): string;
  /** Like `getContent`, and remembers the document handed out so `markSaved` can take it as baseline. */
  provideContent(): string;
  /** Replaces the content; `clean` says the text equals the saved text. */
  load(info: LoadInfo, clean: boolean): void;
  /** The text last handed out by `provideContent` is the saved baseline now. */
  markSaved(): void;
  /** `true`: the current content is the saved baseline; `false`: dirty until the next save. */
  setClean(clean: boolean): void;
  isDirty(): boolean;
  getPosition(): EditorPosition;
  /** Caret as a UTF-16 index into `getContent()`. */
  getCaretIndex(): number;
  setCaretIndex(index: number): void;
  /** Scrolls the source line (remark numbering) to the top of the viewport. */
  scrollToSourceLine(line: number): boolean;
  /** Moves the cursor to a source line and scrolls it into view (mode switching). */
  setCursorSourceLine(line: number): void;
  show(visible: boolean): void;
  focus(): void;
  destroy(): void;
}

/**
 * Native drives the editor through `window.inlayEditor` with `evaluateJavaScript`
 * / `callAsyncJavaScript`; the editor talks back only through `Host`.
 */
export interface EditorApi {
  version: string;
  docId: string;
  /** The editing mode currently shown. */
  mode: EditorMode;
  /** Switches the editing mode inside the page, carrying caret and viewport over. */
  setMode(mode: EditorMode): void;
  /** The live text, joined with the document's line separator (what the host saves). */
  getContent(): string;
  getPosition(): EditorPosition;
  /** Scrolls the source line (remark numbering) to the top of the viewport. */
  scrollToSourceLine(line: number): boolean;
  /** Moves the cursor to a source line and scrolls it into view (mode switching). */
  setCursorSourceLine(line: number): void;
  setTheme(theme: 'light' | 'dark' | 'system'): void;
  focus(): void;
  /** True when the text differs from the last opened or saved text. */
  isDirty(): boolean;
  stats: {
    openMs: number;
    lineCount: number;
    /** WYSIWYG block statistics once that mode has loaded the document. */
    wysiwyg: LoadStats | null;
  };
  /** Resolves once the document is open and the view is mounted. */
  ready: Promise<void>;
  /** The CodeMirror view of Source mode (tests and native probes; our page runs no document code). */
  view: EditorView;
  /** The ProseMirror view of WYSIWYG mode, once created. */
  wysiwygView: ProseMirrorView | null;
}

declare global {
  interface Window {
    inlayEditor?: EditorApi;
  }
}
