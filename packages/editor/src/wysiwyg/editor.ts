// SPDX-License-Identifier: Apache-2.0
/**
 * WYSIWYG mode: Milkdown Crepe over Inlay's block model (ADR-0004, ADR-0032). The
 * document is loaded block by block (`loader.ts`), the live text is produced by
 * the block splice (`splice.ts`), and positions map to source lines through the
 * splice's segments so mode switches and Split sync work in source numbering.
 */
import { languages } from '@codemirror/language-data';
import type { EditorPosition, Eol, Host } from '@inlay-md/host-api';
import { Crepe } from '@milkdown/crepe';
import { listener } from '@milkdown/kit/plugin/listener';
import { Plugin } from '@milkdown/kit/prose/state';
import { $prose } from '@milkdown/kit/utils';
import '@milkdown/crepe/theme/common/style.css';
import { editorStateOptionsCtx, editorViewCtx } from '@milkdown/kit/core';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { EditorState, NodeSelection, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { CONTENT_DEBOUNCE_MS, POSITION_DEBOUNCE_MS } from '../editor.ts';
import { inlayTheme } from '../theme.ts';
import type { LoadInfo, ModeEditor } from '../types.ts';
import { inlayListItemView } from './list-item-view.ts';
import { type IslandSwap, type LoadedDocument, type LoadStats, loadDocument } from './loader.ts';
import { applyInlayPlugins } from './schema.ts';
import { lineAt, offsetOfLine, type Segment, type SpliceResult, spliceDocument } from './splice.ts';
import './theme.css';
import { BlockTransformer } from './transformer.ts';

/** Time slice for verifying blocks after the view is up. */
const VERIFY_BUDGET_MS = 12;

export interface WysiwygEditorOptions {
  parent: HTMLElement;
  host: Host;
  doc: LoadInfo;
  onDirty?: (dirty: boolean) => void;
}

export interface WysiwygEditor extends ModeEditor {
  readonly kind: 'wysiwyg';
  readonly view: EditorView;
  readonly stats: LoadStats;
  /** Source line count of the current text. */
  lineCount(): number;
  /** Resolves when every block has been verified (tests). */
  verified(): Promise<void>;
}

interface Layout {
  doc: ProseNode;
  splice: SpliceResult;
  /** ProseMirror position of each top-level child (index = child index). */
  positions: number[];
}

export async function createWysiwygEditor(o: WysiwygEditorOptions): Promise<WysiwygEditor> {
  const { host } = o;
  const container = document.createElement('div');
  container.className = 'inlay-wysiwyg';
  o.parent.append(container);

  let transformer: BlockTransformer | null = null;
  let loaded: LoadedDocument | null = null;
  let eol: Eol = o.doc.eol;
  let savedDoc: ProseNode | null = null;
  let lastProvided: ProseNode | null = null;
  let dirty = false;
  let layout: Layout | null = null;
  let contentTimer: ReturnType<typeof setTimeout> | null = null;
  let positionTimer: ReturnType<typeof setTimeout> | null = null;
  let verifyTimer: ReturnType<typeof setTimeout> | null = null;
  let visible = true;
  let swapping = false;
  const verifyWaiters: (() => void)[] = [];
  // Hoisted: the tracking plugin is registered before the closures below exist.
  function onDocChanged() {
    updateDirty();
    if (swapping) return;
    scheduleContent();
  }

  const crepe = new Crepe({
    root: container,
    defaultValue: '',
    features: {
      // Rewrites alt text into an aspect ratio; the plain image node round-trips (ADR-0032).
      [Crepe.Feature.ImageBlock]: false,
      // Turns `$$` blocks into LaTeX code fences; Inlay has its own math nodes (ADR-0032).
      [Crepe.Feature.Latex]: false,
      // A Vue app per list item is too slow for 10k lines; `list-item-view.ts` renders plain DOM.
      [Crepe.Feature.ListItem]: false,
    },
    featureConfigs: {
      // The virtual cursor hides the native caret; Home/End and IME behave better with the real one.
      [Crepe.Feature.Cursor]: { virtual: false },
      [Crepe.Feature.CodeMirror]: { languages, theme: inlayTheme },
      [Crepe.Feature.Placeholder]: { text: 'Start writing…', mode: 'doc' },
    },
  });
  applyInlayPlugins(crepe.editor);
  // Milkdown's listener serializes the whole document on init (200 ms for 10k lines) and
  // debounces updates by 200 ms; a plain view plugin reports changes directly.
  void crepe.editor.remove(listener);
  crepe.editor.use(inlayListItemView);
  crepe.editor.use(
    $prose(
      () =>
        new Plugin({
          view: () => ({
            update: (v, prev) => {
              if (v.state.doc !== prev.doc) onDocChanged();
              if (v.state.doc !== prev.doc || !v.state.selection.eq(prev.selection))
                schedulePosition();
            },
          }),
        }),
    ),
  );

  crepe.editor.config((ctx) => {
    ctx.set(editorStateOptionsCtx, (options) => {
      performance.mark('inlay-wysiwyg-load-start');
      transformer = new BlockTransformer(ctx);
      loaded = loadDocument(transformer, o.doc.text, o.doc.eol, { verify: 'deferred' });
      performance.mark('inlay-wysiwyg-load-end');
      return { ...options, doc: loaded.doc };
    });
  });
  crepe.setReadonly(o.doc.readOnly);
  performance.mark('inlay-wysiwyg-create-start');
  await crepe.create();
  performance.mark('inlay-wysiwyg-create-end');
  const view = crepe.editor.ctx.get(editorViewCtx);
  if (!transformer || !loaded) throw new Error('WYSIWYG document did not load');
  const tf: BlockTransformer = transformer;
  let current: LoadedDocument = loaded;
  savedDoc = view.state.doc;

  const serialize = (node: ProseNode, style: Parameters<BlockTransformer['serialize']>[1]) =>
    tf.serialize(node, style);

  const layoutFor = (doc: ProseNode): Layout => {
    if (layout && layout.doc === doc) return layout;
    const positions: number[] = [];
    doc.forEach((_child, offset) => {
      positions.push(offset);
    });
    layout = { doc, splice: spliceDocument(doc, current, serialize, eol), positions };
    return layout;
  };

  const text = () => layoutFor(view.state.doc).splice.text;

  function updateDirty() {
    const next = savedDoc ? !view.state.doc.eq(savedDoc) : true;
    if (next !== dirty) {
      dirty = next;
      o.onDirty?.(dirty);
    }
  }

  function scheduleContent() {
    if (contentTimer) clearTimeout(contentTimer);
    contentTimer = setTimeout(() => {
      contentTimer = null;
      host.notifyContentChanged();
    }, CONTENT_DEBOUNCE_MS);
  }

  function schedulePosition() {
    if (!visible) return;
    if (positionTimer) clearTimeout(positionTimer);
    positionTimer = setTimeout(() => {
      positionTimer = null;
      host.reportPosition(api.getPosition());
    }, POSITION_DEBOUNCE_MS);
  }

  /** Swaps a block the verifier rejected for its island, in the live doc and in the saved baseline. */
  const applySwaps = (swaps: IslandSwap[]) => {
    if (swaps.length === 0) return;
    let tr = view.state.tr;
    let touched = false;
    for (const swap of swaps) {
      view.state.doc.forEach((child, offset) => {
        if (child === swap.from) {
          tr = tr.replaceWith(
            tr.mapping.map(offset),
            tr.mapping.map(offset + child.nodeSize),
            swap.to,
          );
          touched = true;
        }
      });
      if (savedDoc) {
        let index = -1;
        savedDoc.forEach((child, _offset, i) => {
          if (child === swap.from) index = i;
        });
        if (index >= 0) savedDoc = savedDoc.copy(savedDoc.content.replaceChild(index, swap.to));
      }
    }
    if (touched) {
      swapping = true;
      try {
        view.dispatch(tr.setMeta('addToHistory', false));
      } finally {
        swapping = false;
      }
    }
  };

  const verifyChunk = () => {
    verifyTimer = null;
    const swaps = current.verify(VERIFY_BUDGET_MS);
    applySwaps(swaps);
    if (current.stats.pending > 0) {
      verifyTimer = setTimeout(verifyChunk, 0);
    } else {
      for (const resolve of verifyWaiters.splice(0)) resolve();
    }
  };
  const scheduleVerify = () => {
    if (verifyTimer) clearTimeout(verifyTimer);
    verifyTimer = setTimeout(verifyChunk, 0);
  };

  container.addEventListener('scroll', () => schedulePosition(), { passive: true });
  view.dom.addEventListener('scroll', () => schedulePosition(), { passive: true });

  /** Text offset of a ProseMirror position within its top-level block. */
  const textOffsetInBlock = (pos: number): { index: number; offset: number } => {
    const $pos = view.state.doc.resolve(pos);
    const index =
      $pos.depth === 0 ? Math.min($pos.index(0), view.state.doc.childCount - 1) : $pos.index(0);
    const lay = layoutFor(view.state.doc);
    const blockPos = lay.positions[index] ?? 0;
    const block = view.state.doc.maybeChild(index);
    if (!block) return { index: 0, offset: 0 };
    const from = blockPos + 1;
    const to = Math.max(from, Math.min(pos, blockPos + block.nodeSize - 1));
    const offset =
      block.isAtom || block.isLeaf ? 0 : view.state.doc.textBetween(from, to, '\n', '\n').length;
    return { index, offset };
  };

  const segmentFor = (index: number): Segment | undefined =>
    layoutFor(view.state.doc).splice.segments.find((s) => s.index === index);

  /** Caret as a UTF-16 index into the live text. */
  const caretIndex = (): number => {
    const { index, offset } = textOffsetInBlock(view.state.selection.head);
    const segment = segmentFor(index);
    if (!segment) return 0;
    return Math.min(segment.from + offset, segment.to);
  };

  /** The segment holding a text index (or the nearest one after it). */
  const segmentAtIndex = (index: number): Segment | undefined => {
    const segments = layoutFor(view.state.doc).splice.segments;
    let found: Segment | undefined;
    for (const s of segments) {
      if (index <= s.to) {
        found = s;
        break;
      }
    }
    return found ?? segments[segments.length - 1];
  };

  /** ProseMirror position inside a block for a text offset from the block's start. */
  const posForTextOffset = (blockPos: number, block: ProseNode, offset: number): number => {
    if (block.isAtom || block.isLeaf) return blockPos;
    let remaining = offset;
    let result: number | null = null;
    block.descendants((node, pos) => {
      if (result !== null) return false;
      if (node.isText) {
        const len = node.text?.length ?? 0;
        if (remaining <= len) {
          result = blockPos + 1 + pos + remaining;
          return false;
        }
        remaining -= len;
      } else if (node.isLeaf) {
        remaining -= 1;
      } else if (node.isTextblock && pos > 0) {
        remaining -= 1; // block separator
      }
      return true;
    });
    if (result !== null) return result;
    return blockPos + block.nodeSize - 1;
  };

  const selectIndex = (index: number) => {
    const segment = segmentAtIndex(index);
    if (!segment) return;
    const lay = layoutFor(view.state.doc);
    const blockPos = lay.positions[segment.index] ?? 0;
    const block = view.state.doc.maybeChild(segment.index);
    if (!block) return;
    const offset = Math.max(0, Math.min(index - segment.from, segment.to - segment.from));
    const pos = posForTextOffset(blockPos, block, offset);
    const selection = block.isAtom
      ? NodeSelection.create(view.state.doc, blockPos)
      : TextSelection.create(view.state.doc, Math.min(pos, view.state.doc.content.size));
    view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
  };

  const scroller = (): HTMLElement => {
    // The nearest scrolling ancestor of the editor DOM (the pane fills the viewport).
    let el: HTMLElement | null = view.dom;
    while (el && el !== document.body) {
      const style = getComputedStyle(el);
      if (/(auto|scroll)/.test(style.overflowY)) return el;
      el = el.parentElement;
    }
    return document.scrollingElement as HTMLElement;
  };

  /** Index of the first top-level block whose box reaches below the viewport top. */
  const topBlockIndex = (): number => {
    const top = scroller().getBoundingClientRect().top;
    const lay = layoutFor(view.state.doc);
    for (let i = 0; i < lay.positions.length; i++) {
      const dom = view.nodeDOM(lay.positions[i] ?? 0) as HTMLElement | null;
      if (dom && dom.getBoundingClientRect().bottom > top + 1) return i;
    }
    return Math.max(0, lay.positions.length - 1);
  };

  const api: WysiwygEditor = {
    kind: 'wysiwyg',
    view,
    get stats() {
      return current.stats;
    },
    getContent: () => text(),
    provideContent() {
      lastProvided = view.state.doc;
      return text();
    },
    load(info, clean) {
      eol = info.eol;
      if (verifyTimer) clearTimeout(verifyTimer);
      current = loadDocument(tf, info.text, info.eol, { verify: 'deferred' });
      layout = null;
      view.updateState(
        EditorState.create({
          schema: view.state.schema,
          doc: current.doc,
          plugins: view.state.plugins,
        }),
      );
      crepe.setReadonly(info.readOnly);
      savedDoc = clean ? view.state.doc : null;
      lastProvided = null;
      updateDirty();
      scheduleVerify();
    },
    markSaved() {
      savedDoc = lastProvided ?? view.state.doc;
      updateDirty();
    },
    setClean(clean) {
      savedDoc = clean ? view.state.doc : null;
      updateDirty();
    },
    isDirty: () => dirty,
    lineCount: () => lineAt(text(), text().length),
    verified: () =>
      current.stats.pending === 0
        ? Promise.resolve()
        : new Promise((resolve) => {
            verifyWaiters.push(resolve);
          }),
    focus: () => view.focus(),
    getPosition(): EditorPosition {
      const t = text();
      const topSegment = segmentFor(topBlockIndex());
      const index = caretIndex();
      const cursorLine = lineAt(t, index);
      return {
        line: topSegment ? lineAt(t, topSegment.from) : 1,
        cursorLine,
        cursorColumn: index - offsetOfLine(t, cursorLine) + 1,
      };
    },
    getCaretIndex: caretIndex,
    setCaretIndex: selectIndex,
    scrollToSourceLine(line) {
      const segment = segmentAtIndex(offsetOfLine(text(), line));
      if (!segment) return false;
      const dom = view.nodeDOM(
        layoutFor(view.state.doc).positions[segment.index] ?? 0,
      ) as HTMLElement | null;
      dom?.scrollIntoView({ block: 'start' });
      return true;
    },
    setCursorSourceLine(line) {
      selectIndex(offsetOfLine(text(), line));
    },
    show(next) {
      visible = next;
      container.style.display = next ? '' : 'none';
    },
    destroy() {
      if (verifyTimer) clearTimeout(verifyTimer);
      void crepe.destroy();
      container.remove();
    },
  };

  scheduleVerify();
  return api;
}
