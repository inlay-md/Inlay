// SPDX-License-Identifier: Apache-2.0
/**
 * Source mode: CodeMirror on the decoded document. It keeps the Host informed of
 * content changes and the viewport position (debounced) and of its dirty state;
 * loading, saving baselines and mode switching are driven by the page. The
 * document text is data inside CodeMirror and never executed; this page runs only
 * our own bundle.
 */
import { EditorSelection, type EditorState, type Text } from '@codemirror/state';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import type { EditorPosition, Eol, Host } from '@inlay-md/host-api';
import { buildLineMap, type LineMap } from './line-map.ts';
import { sourceSetup } from './setup.ts';
import {
  createSourceState,
  getText,
  offsetToStringIndex,
  stringIndexToOffset,
} from './source-state.ts';
import type { LoadInfo, ModeEditor } from './types.ts';

/** Idle time before the host hears about edits (Read view re-render, crash mirror). */
export const CONTENT_DEBOUNCE_MS = 300;
/** Idle time before the host hears about scrolling or cursor moves (scroll sync). */
export const POSITION_DEBOUNCE_MS = 60;

export interface SourceEditorOptions {
  parent: HTMLElement;
  host: Host;
  doc: LoadInfo;
  /** Called with the new dirty state whenever it flips. */
  onDirty?: (dirty: boolean) => void;
}

export interface SourceEditor extends ModeEditor {
  readonly kind: 'source';
  readonly view: EditorView;
  /** Source line count of the current text. */
  lineCount(): number;
}

export function createSourceEditor(o: SourceEditorOptions): SourceEditor {
  const { host } = o;
  let eol: Eol = o.doc.eol;
  let savedDoc: Text | null = null;
  let dirty = false;
  let lastProvided: Text | null = null;
  let lineMap: { text: Text; map: LineMap } | null = null;
  let contentTimer: ReturnType<typeof setTimeout> | null = null;
  let positionTimer: ReturnType<typeof setTimeout> | null = null;
  let visible = true;

  const mapFor = (state: EditorState): LineMap => {
    if (!lineMap || lineMap.text !== state.doc) {
      lineMap = { text: state.doc, map: buildLineMap(getText(state), eol) };
    }
    return lineMap.map;
  };

  const updateDirty = (state: EditorState) => {
    const next = savedDoc ? !state.doc.eq(savedDoc) : true;
    if (next !== dirty) {
      dirty = next;
      o.onDirty?.(dirty);
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
    if (!visible) return;
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

  const makeState = (info: LoadInfo) =>
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

  const view = new EditorView({ state: makeState(o.doc), parent: o.parent });
  savedDoc = view.state.doc;

  /** Source line of the first line block that is (at least partly) visible at the top of the viewport. */
  const topSourceLine = (): number => {
    const top = view.scrollDOM.getBoundingClientRect().top - view.documentTop;
    const block = view.lineBlockAtHeight(top);
    const editorLine = view.state.doc.lineAt(Math.min(block.from, view.state.doc.length)).number;
    return mapFor(view.state).toSourceLine(editorLine);
  };

  const api: SourceEditor = {
    kind: 'source',
    view,
    getContent: () => getText(view.state),
    provideContent() {
      lastProvided = view.state.doc;
      return getText(view.state);
    },
    load(info, clean) {
      eol = info.eol;
      view.setState(makeState(info));
      lineMap = null;
      savedDoc = clean ? view.state.doc : null;
      lastProvided = null;
      updateDirty(view.state);
    },
    markSaved() {
      savedDoc = lastProvided ?? view.state.doc;
      updateDirty(view.state);
    },
    setClean(clean) {
      savedDoc = clean ? view.state.doc : null;
      updateDirty(view.state);
    },
    isDirty: () => dirty,
    lineCount: () => mapFor(view.state).sourceLines,
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
    getCaretIndex: () => offsetToStringIndex(view.state, view.state.selection.main.head),
    setCaretIndex(index) {
      const pos = Math.max(
        0,
        Math.min(stringIndexToOffset(view.state, index), view.state.doc.length),
      );
      view.dispatch({
        selection: EditorSelection.cursor(pos),
        effects: EditorView.scrollIntoView(pos, { y: 'nearest' }),
      });
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
    show(next) {
      visible = next;
      view.dom.style.display = next ? '' : 'none';
      if (next) view.requestMeasure();
    },
    destroy: () => view.destroy(),
  };
  return api;
}
