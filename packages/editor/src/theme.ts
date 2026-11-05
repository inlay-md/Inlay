// SPDX-License-Identifier: Apache-2.0
/**
 * Source mode theme from the brand palette (design/ui/app-split-mode.html):
 * brass for Markdown syntax, verdigris for tags, #B4532A for strings, Ink on Paper,
 * SF Mono 12.5 px / 1.7. Colours are CSS variables so one CodeMirror theme follows
 * `prefers-color-scheme` and the `data-theme` override on <html>.
 */
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

const LIGHT = `
  color-scheme: light;
  --inlay-ed-bg: #FFFFFF;
  --inlay-ed-fg: #141A22;
  --inlay-ed-gutter: #A9B3BF;
  --inlay-ed-gutter-active: #5B6673;
  --inlay-ed-line: #F4F5F7;
  --inlay-ed-border: #DDE1E7;
  --inlay-ed-selection: rgba(31, 122, 122, 0.18);
  --inlay-ed-match: rgba(154, 110, 26, 0.22);
  --inlay-ed-cursor: #141A22;
  --inlay-ed-muted: #5B6673;
  --inlay-ed-brass: #9A6E1A;
  --inlay-ed-verdigris: #1F7A7A;
  --inlay-ed-string: #B4532A;
  --inlay-ed-code-bg: #F4F5F7;
  --inlay-ed-special: #B4532A;
`;
const DARK = `
  color-scheme: dark;
  --inlay-ed-bg: #141A22;
  --inlay-ed-fg: #E6EAF0;
  --inlay-ed-gutter: #566270;
  --inlay-ed-gutter-active: #A9B3BF;
  --inlay-ed-line: #1B222C;
  --inlay-ed-border: #263040;
  --inlay-ed-selection: rgba(95, 201, 192, 0.22);
  --inlay-ed-match: rgba(224, 168, 58, 0.25);
  --inlay-ed-cursor: #E6EAF0;
  --inlay-ed-muted: #8A96A3;
  --inlay-ed-brass: #E0A83A;
  --inlay-ed-verdigris: #5FC9C0;
  --inlay-ed-string: #E39A6E;
  --inlay-ed-code-bg: #1B222C;
  --inlay-ed-special: #E39A6E;
`;

/** Page-level CSS: variables, the fill-the-viewport layout. */
export const PAGE_CSS = `
:root { ${LIGHT} }
:root[data-theme="dark"] { ${DARK} }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${DARK} } }
:root[data-theme="light"] { ${LIGHT} }
html, body { margin: 0; height: 100%; background: var(--inlay-ed-bg); color: var(--inlay-ed-fg); }
#inlay-editor { height: 100%; display: flex; flex-direction: column; }
#inlay-editor .cm-editor { height: auto; flex: 1 1 auto; min-height: 0; }
#inlay-editor .inlay-wysiwyg { flex: 1 1 auto; min-height: 0; height: auto; }
.inlay-safety-banner { flex: 0 0 auto; display: flex; align-items: center; gap: 12px; padding: 8px 14px; background: var(--inlay-ed-line); border-bottom: 1px solid var(--inlay-ed-border); color: var(--inlay-ed-fg); font: 13px -apple-system, BlinkMacSystemFont, sans-serif; }
.inlay-safety-banner span { flex: 1 1 auto; }
.inlay-safety-banner button { border: 1px solid var(--inlay-ed-border); border-radius: 4px; background: var(--inlay-ed-bg); color: var(--inlay-ed-verdigris); font: inherit; padding: 2px 10px; cursor: pointer; }
.inlay-safety-banner .inlay-safety-dismiss { color: var(--inlay-ed-muted); border: none; background: none; font-size: 16px; padding: 0 4px; }
`;

export const editorTheme: Extension = EditorView.theme({
  '&': {
    backgroundColor: 'var(--inlay-ed-bg)',
    color: 'var(--inlay-ed-fg)',
    fontSize: '12.5px',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
    lineHeight: '1.7',
    paddingTop: '14px',
    paddingBottom: '40vh',
  },
  '.cm-content': { caretColor: 'var(--inlay-ed-cursor)', padding: '0' },
  '.cm-line': { padding: '0 14px 0 12px' },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--inlay-ed-cursor)',
    borderLeftWidth: '1.5px',
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection':
    { backgroundColor: 'var(--inlay-ed-selection) !important' },
  '.cm-activeLine': { backgroundColor: 'var(--inlay-ed-line)' },
  '.cm-gutters': {
    backgroundColor: 'var(--inlay-ed-bg)',
    color: 'var(--inlay-ed-gutter)',
    border: 'none',
    minWidth: '44px',
  },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 4px 0 14px' },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--inlay-ed-line)',
    color: 'var(--inlay-ed-gutter-active)',
  },
  '.cm-specialChar': { color: 'var(--inlay-ed-special)' },
  '.cm-selectionMatch': { backgroundColor: 'var(--inlay-ed-match)' },
  '.cm-searchMatch': {
    backgroundColor: 'var(--inlay-ed-match)',
    outline: '1px solid var(--inlay-ed-brass)',
  },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--inlay-ed-selection)' },
  '.cm-panels': {
    backgroundColor: 'var(--inlay-ed-line)',
    color: 'var(--inlay-ed-fg)',
    borderBottom: '1px solid var(--inlay-ed-border)',
    fontFamily: '-apple-system, system-ui, sans-serif',
  },
  '.cm-panels.cm-panels-bottom': {
    borderTop: '1px solid var(--inlay-ed-border)',
    borderBottom: 'none',
  },
  '.cm-panel input, .cm-panel button': { fontFamily: 'inherit' },
  '.cm-tooltip': {
    backgroundColor: 'var(--inlay-ed-bg)',
    border: '1px solid var(--inlay-ed-border)',
  },
});

export const highlightStyle = HighlightStyle.define([
  { tag: t.heading, fontWeight: '700' },
  { tag: t.processingInstruction, color: 'var(--inlay-ed-brass)' },
  { tag: t.contentSeparator, color: 'var(--inlay-ed-muted)' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.monospace, backgroundColor: 'var(--inlay-ed-code-bg)' },
  { tag: t.link, color: 'var(--inlay-ed-fg)' },
  { tag: t.url, color: 'var(--inlay-ed-verdigris)', textDecoration: 'underline' },
  { tag: t.quote, color: 'var(--inlay-ed-muted)' },
  { tag: t.atom, color: 'var(--inlay-ed-brass)' },
  { tag: t.escape, color: 'var(--inlay-ed-brass)' },
  { tag: t.meta, color: 'var(--inlay-ed-muted)' },
  { tag: t.comment, color: 'var(--inlay-ed-muted)', fontStyle: 'italic' },
  { tag: [t.tagName, t.angleBracket], color: 'var(--inlay-ed-verdigris)' },
  { tag: t.attributeName, color: 'var(--inlay-ed-brass)' },
  { tag: [t.attributeValue, t.string], color: 'var(--inlay-ed-string)' },
  { tag: t.keyword, color: 'var(--inlay-ed-verdigris)' },
  { tag: [t.number, t.bool], color: 'var(--inlay-ed-string)' },
  { tag: t.labelName, color: 'var(--inlay-ed-brass)' },
]);

export const inlayTheme: Extension = [editorTheme, syntaxHighlighting(highlightStyle)];

export function applyTheme(
  theme: 'light' | 'dark' | 'system',
  root = document.documentElement,
): void {
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
}
