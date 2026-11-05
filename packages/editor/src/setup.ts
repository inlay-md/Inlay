// SPDX-License-Identifier: Apache-2.0
/** CodeMirror extensions for Source mode (an explicit basicSetup tailored to Markdown). */
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { EditorState, type Extension } from '@codemirror/state';
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import { frontMatter } from './front-matter.ts';
import { inlayTheme } from './theme.ts';

export function markdownSource(): Extension {
  return markdown({
    base: markdownLanguage,
    codeLanguages: languages,
    extensions: [frontMatter],
    addKeymap: true,
  });
}

export function sourceSetup(): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    // Stray `\r`/`\n` inside a line (ADR-0028) and other control characters show as ␍/␊.
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    EditorView.lineWrapping,
    keymap.of([...defaultKeymap, ...searchKeymap, ...historyKeymap, indentWithTab]),
    markdownSource(),
    inlayTheme,
  ];
}
