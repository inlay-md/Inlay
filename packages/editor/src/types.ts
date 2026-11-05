// SPDX-License-Identifier: Apache-2.0
import type { EditorView } from '@codemirror/view';
import type { EditorPosition } from '@inlay-md/host-api';

/**
 * Native drives the editor through `window.inlayEditor` with `evaluateJavaScript`
 * / `callAsyncJavaScript`; the editor talks back only through `Host`.
 */
export interface EditorApi {
  version: string;
  docId: string;
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
  stats: { openMs: number; lineCount: number };
  /** Resolves once the document is open and the view is mounted. */
  ready: Promise<void>;
  /** The CodeMirror view (tests and native probes; our page runs no document code). */
  view: EditorView;
}

declare global {
  interface Window {
    inlayEditor?: EditorApi;
  }
}
