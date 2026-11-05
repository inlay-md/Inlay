// SPDX-License-Identifier: Apache-2.0
/**
 * Source mode: mounts CodeMirror on the decoded document, keeps the Host informed
 * (dirty state, content changes, viewport position) and exposes `window.inlayEditor`.
 * The document text is data inside CodeMirror and never executed; this page runs
 * only our own bundle.
 */
import { EditorSelection, type EditorState, type Text } from '@codemirror/state';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import type { DocumentInfo, EditorPosition, Host } from '@inlay-md/host-api';
import { buildLineMap, type LineMap } from './line-map.ts';
import { sourceSetup } from './setup.ts';
import { createSourceState, getText } from './source-state.ts';
import { applyTheme } from './theme.ts';
import type { EditorApi } from './types.ts';

export const EDITOR_VERSION = '0.1.0-m2';
/** Idle time before the host hears about edits (Read view re-render, crash mirror). */
export const CONTENT_DEBOUNCE_MS = 300;
/** Idle time before the host hears about scrolling or cursor moves (scroll sync). */
export const POSITION_DEBOUNCE_MS = 60;

export interface SourceEditorOptions {
  parent: HTMLElement;
  host: Host;
  doc: DocumentInfo;
  theme?: 'light' | 'dark' | 'system';
}

export function createSourceEditor(o: SourceEditorOptions): EditorApi {
  const started = performance.now();
  const { host } = o;
  let doc = o.doc;
  let savedDoc: Text | null = null;
  let dirty = false;
  /** The text handed to the host's last content pull; becomes the clean baseline when the host reports a save. */
  let lastProvided: Text | null = null;
  let lineMap: { text: Text; map: LineMap } | null = null;
  let contentTimer: ReturnType<typeof setTimeout> | null = null;
  let positionTimer: ReturnType<typeof setTimeout> | null = null;

  const mapFor = (state: EditorState): LineMap => {
    if (!lineMap || lineMap.text !== state.doc) {
      lineMap = { text: state.doc, map: buildLineMap(getText(state), doc.eol) };
    }
    return lineMap.map;
  };

  const updateDirty = (state: EditorState) => {
    const next = savedDoc ? !state.doc.eq(savedDoc) : false;
    if (next !== dirty) {
      dirty = next;
      host.setDirty(dirty);
    }
  };

  const scheduleContent = () => {
    if (contentTimer) clearTimeout(contentTimer);
    contentTimer = setTimeout(() => {
      contentTimer = null;
      host.notifyContentChanged();
    }, CONTENT_DEBOUNCE_MS);
  };

  const schedulePosition = () => {
    if (positionTimer) clearTimeout(positionTimer);
    positionTimer = setTimeout(() => {
      positionTimer = null;
      host.reportPosition(api.getPosition());
    }, POSITION_DEBOUNCE_MS);
  };

  const tracker = ViewPlugin.define(() => ({
    update(u: ViewUpdate) {
      if (u.docChanged) {
        updateDirty(u.state);
        scheduleContent();
      }
      if (u.docChanged || u.selectionSet || u.viewportChanged || u.geometryChanged)
        schedulePosition();
    },
  }));

  const makeState = (info: DocumentInfo) =>
    createSourceState({
      text: info.text,
      eol: info.eol,
      readOnly: info.readOnly,
      extensions: [
        ...sourceSetup(),
        tracker,
        EditorView.domEventHandlers({ scroll: () => schedulePosition() }),
      ],
    });

  const view = new EditorView({ state: makeState(doc), parent: o.parent });
  savedDoc = view.state.doc;
  applyTheme(o.theme ?? 'system');

  /** Source line of the first line block that is (at least partly) visible at the top of the viewport. */
  const topSourceLine = (): number => {
    // lineBlockAtHeight takes a height relative to the document top; the scroller's top edge in
    // screen coordinates minus documentTop is exactly that.
    const top = view.scrollDOM.getBoundingClientRect().top - view.documentTop;
    const block = view.lineBlockAtHeight(top);
    const editorLine = view.state.doc.lineAt(Math.min(block.from, view.state.doc.length)).number;
    return mapFor(view.state).toSourceLine(editorLine);
  };

  const api: EditorApi = {
    version: EDITOR_VERSION,
    docId: doc.docId,
    view,
    stats: { openMs: 0, lineCount: mapFor(view.state).sourceLines },
    ready: Promise.resolve(),
    getContent: () => getText(view.state),
    isDirty: () => dirty,
    focus: () => view.focus(),
    getPosition(): EditorPosition {
      const head = view.state.selection.main.head;
      const line = view.state.doc.lineAt(head);
      const map = mapFor(view.state);
      // A stray line ending inside the editor line still advances the source line of the cursor.
      const before = line.text.slice(0, head - line.from);
      const strays = (before.match(/\r\n|\n|\r/g) ?? []).length;
      const lastBreak = Math.max(before.lastIndexOf('\n'), before.lastIndexOf('\r'));
      return {
        line: topSourceLine(),
        cursorLine: map.toSourceLine(line.number) + strays,
        cursorColumn: (lastBreak >= 0 ? before.length - lastBreak - 1 : before.length) + 1,
      };
    },
    scrollToSourceLine(sourceLine) {
      const map = mapFor(view.state);
      const n = Math.min(Math.max(1, map.toEditorLine(sourceLine)), view.state.doc.lines);
      const pos = view.state.doc.line(n).from;
      view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'start' }) });
      return true;
    },
    setCursorSourceLine(sourceLine) {
      const map = mapFor(view.state);
      const n = Math.min(Math.max(1, map.toEditorLine(sourceLine)), view.state.doc.lines);
      const pos = view.state.doc.line(n).from;
      view.dispatch({
        selection: EditorSelection.cursor(pos),
        effects: EditorView.scrollIntoView(pos, { y: 'center' }),
      });
    },
    setTheme: (theme) => applyTheme(theme),
  };

  host.provideContent(() => {
    lastProvided = view.state.doc;
    return api.getContent();
  });

  // The file changed on disk (or was reverted) and the host accepted it: reload the text, keep the viewport.
  host.on('fileChanged', () => {
    void host.openDocument().then((info) => {
      doc = info;
      const line = api.getPosition().line;
      view.setState(makeState(info));
      savedDoc = view.state.doc;
      lineMap = null;
      updateDirty(view.state);
      api.stats.lineCount = mapFor(view.state).sourceLines;
      api.scrollToSourceLine(line);
    });
  });
  host.on('themeChanged', (theme) => applyTheme(theme));
  host.on('documentSaved', () => {
    savedDoc = lastProvided ?? view.state.doc;
    updateDirty(view.state);
  });

  api.stats.openMs = performance.now() - started;
  window.inlayEditor = api;
  return api;
}
