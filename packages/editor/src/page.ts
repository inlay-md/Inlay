// SPDX-License-Identifier: Apache-2.0
/**
 * The editor page hosts both editing modes in one webview (ADR-0033): Source mode
 * (CodeMirror) and WYSIWYG (Crepe). Native switches them with `modeRequested`;
 * the page hands the live text from one editor to the other and maps the caret by
 * UTF-16 index and the viewport by source line. The page owns the save baseline:
 * `savedText` is what the host last opened or wrote, each editor only compares
 * its own document against the baseline it was given.
 */
import type { DocumentInfo, Host, Mode } from '@inlay-md/host-api';
import { createSourceEditor, type SourceEditor } from './editor.ts';
import { applyTheme } from './theme.ts';
import type { EditorApi, EditorMode, LoadInfo, ModeEditor } from './types.ts';
import type { WysiwygEditor } from './wysiwyg/editor.ts';

export const EDITOR_VERSION = '0.2.0-m3';

export interface EditorPageOptions {
  parent: HTMLElement;
  host: Host;
  doc: DocumentInfo;
  theme?: 'light' | 'dark' | 'system';
  /** Overrides the mode the document info asks for (browser `?mode=`). */
  mode?: EditorMode;
  /** Large-document safety net (ADR-0016): above either limit the page opens in Source. */
  safetyNet?: SafetyNet;
}

export interface SafetyNet {
  lines: number;
  bytes: number;
}

/** ~50k lines / 5 MB (ADR-0016); the 10k-line fixture stays well below. */
export const DEFAULT_SAFETY_NET: SafetyNet = { lines: 50_000, bytes: 5 * 1024 * 1024 };

export function exceedsSafetyNet(text: string, net: SafetyNet): boolean {
  if (text.length > net.bytes) return true;
  let lines = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 10 || (c === 13 && text.charCodeAt(i + 1) !== 10)) lines++;
    if (lines > net.lines) return true;
  }
  return false;
}

export function editorModeFor(mode: Mode | undefined): EditorMode {
  return mode === 'wysiwyg' ? 'wysiwyg' : 'source';
}

function showSafetyBanner(parent: HTMLElement, onSwitch: () => void): void {
  const banner = document.createElement('div');
  banner.className = 'inlay-safety-banner';
  banner.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = 'Large document: opened in Source mode to stay responsive.';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Open in WYSIWYG anyway';
  button.addEventListener('click', () => {
    banner.remove();
    onSwitch();
  });
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'inlay-safety-dismiss';
  dismiss.setAttribute('aria-label', 'Dismiss');
  dismiss.textContent = '×';
  dismiss.addEventListener('click', () => banner.remove());
  banner.append(text, button, dismiss);
  parent.prepend(banner);
}

export async function createEditorPage(o: EditorPageOptions): Promise<EditorApi> {
  const started = performance.now();
  const { host } = o;
  let doc = o.doc;
  let savedText = doc.text;
  let lastProvidedText: string | null = null;
  let mode: EditorMode = o.mode ?? editorModeFor(doc.mode);
  let dirty = false;
  const net = o.safetyNet ?? DEFAULT_SAFETY_NET;
  // Safety net: a very large document opens in Source with a one-click way into WYSIWYG.
  const netted = mode === 'wysiwyg' && exceedsSafetyNet(doc.text, net);
  if (netted) mode = 'source';

  const info = (): LoadInfo => ({ text: doc.text, eol: doc.eol, readOnly: doc.readOnly });

  const onDirty = (editor: () => ModeEditor | null) => (next: boolean) => {
    if (editor() !== active()) return;
    if (next !== dirty) {
      dirty = next;
      host.setDirty(dirty);
    }
  };

  let wysiwyg: WysiwygEditor | null = null;
  let wysiwygLoadedText: string | null = null;
  const source: SourceEditor = createSourceEditor({
    parent: o.parent,
    host,
    doc: mode === 'source' ? info() : { text: '', eol: doc.eol, readOnly: doc.readOnly },
    onDirty: onDirty(() => source),
  });
  let sourceLoadedText: string | null = mode === 'source' ? doc.text : null;
  const active = (): ModeEditor => (mode === 'wysiwyg' && wysiwyg ? wysiwyg : source);

  applyTheme(o.theme ?? 'system');

  const ensureWysiwyg = async (): Promise<WysiwygEditor> => {
    if (wysiwyg) return wysiwyg;
    // Milkdown, Vue and the block model load only when WYSIWYG is shown; Source stays light.
    const { createWysiwygEditor } = await import('./wysiwyg/editor.ts');
    wysiwyg = await createWysiwygEditor({
      parent: o.parent,
      host,
      doc: info(),
      onDirty: onDirty(() => wysiwyg),
    });
    wysiwygLoadedText = doc.text;
    wysiwyg.setClean(doc.text === savedText);
    return wysiwyg;
  };

  /** Puts `text` into an editor unless it already holds it, and fixes its clean baseline. */
  const handOver = (to: ModeEditor, text: string) => {
    const loadedText = to.kind === 'source' ? sourceLoadedText : wysiwygLoadedText;
    if (loadedText !== text) {
      to.load({ text, eol: doc.eol, readOnly: doc.readOnly }, text === savedText);
      if (to.kind === 'source') sourceLoadedText = text;
      else wysiwygLoadedText = text;
    } else {
      to.setClean(text === savedText);
    }
  };

  const switchTo = async (next: EditorMode) => {
    if (next === mode) return;
    const from = active();
    const text = from.getContent();
    const caret = from.getCaretIndex();
    const topLine = from.getPosition().line;
    const to: ModeEditor = next === 'wysiwyg' ? await ensureWysiwyg() : source;
    handOver(to, text);
    from.show(false);
    to.show(true);
    mode = next;
    if (to.kind === 'source') sourceLoadedText = text;
    else wysiwygLoadedText = text;
    to.scrollToSourceLine(topLine);
    to.setCaretIndex(caret);
    to.focus();
    const nextDirty = to.isDirty();
    if (nextDirty !== dirty) {
      dirty = nextDirty;
      host.setDirty(dirty);
    }
    host.reportPosition(to.getPosition());
  };

  if (mode === 'wysiwyg') {
    source.show(false);
    await ensureWysiwyg();
  }
  if (netted) {
    host.requestMode('source');
    showSafetyBanner(o.parent, () => {
      host.requestMode('wysiwyg');
      void switchTo('wysiwyg');
    });
  }

  host.provideContent(() => {
    lastProvidedText = active().provideContent();
    return lastProvidedText;
  });

  host.on('documentSaved', () => {
    if (lastProvidedText !== null) savedText = lastProvidedText;
    active().markSaved();
    const nextDirty = active().isDirty();
    if (nextDirty !== dirty) {
      dirty = nextDirty;
      host.setDirty(dirty);
    }
  });

  // The file changed on disk (or was reverted) and the host accepted it: reload the text, keep the viewport.
  host.on('fileChanged', () => {
    void host.openDocument().then((next) => {
      doc = next;
      savedText = next.text;
      const line = active().getPosition().line;
      active().load(info(), true);
      if (active().kind === 'source') {
        sourceLoadedText = next.text;
        wysiwygLoadedText = null;
      } else {
        wysiwygLoadedText = next.text;
        sourceLoadedText = null;
      }
      api.stats.lineCount = lineCount();
      active().scrollToSourceLine(line);
      if (dirty) {
        dirty = false;
        host.setDirty(false);
      }
    });
  });
  host.on('themeChanged', (theme) => applyTheme(theme));
  host.on('modeRequested', (requested) => {
    if (requested === 'read') return;
    void switchTo(editorModeFor(requested));
  });

  const lineCount = () =>
    active().kind === 'wysiwyg' && wysiwyg ? wysiwyg.lineCount() : source.lineCount();

  const api: EditorApi = {
    version: EDITOR_VERSION,
    docId: doc.docId,
    get mode() {
      return mode;
    },
    setMode: (next) => void switchTo(next),
    view: source.view,
    get wysiwygView() {
      return wysiwyg?.view ?? null;
    },
    stats: {
      openMs: 0,
      lineCount: 0,
      get wysiwyg() {
        return wysiwyg?.stats ?? null;
      },
    },
    ready: Promise.resolve(),
    getContent: () => active().getContent(),
    isDirty: () => dirty,
    focus: () => active().focus(),
    getPosition: () => active().getPosition(),
    scrollToSourceLine: (line) => active().scrollToSourceLine(line),
    setCursorSourceLine: (line) => active().setCursorSourceLine(line),
    setTheme: (theme) => applyTheme(theme),
  };
  api.stats.lineCount = lineCount();
  api.stats.openMs = performance.now() - started;
  window.inlayEditor = api;
  return api;
}
