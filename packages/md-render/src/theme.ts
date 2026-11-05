// SPDX-License-Identifier: Apache-2.0
/**
 * Document theme shared by the Read view, Quick Look and export. Light/dark
 * follow `prefers-color-scheme` unless the page sets `data-theme="light|dark"`
 * on `<html>`. Code colours come from Shiki's dual-theme CSS variables.
 */
export const THEME_CSS = String.raw`
:root {
  color-scheme: light dark;
  --inlay-fg: #1d1d1f;
  --inlay-bg: #ffffff;
  --inlay-muted: #6e6e73;
  --inlay-border: #d2d2d7;
  --inlay-link: #0066cc;
  --inlay-code-bg: #f5f5f7;
  --inlay-quote: #8a8a8e;
  --inlay-mark: #fff3a3;
  --inlay-accent: #0a84ff;
  --inlay-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  --inlay-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  --inlay-measure: 52rem;
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --inlay-fg: #f5f5f7;
  --inlay-bg: #1d1d1f;
  --inlay-muted: #98989d;
  --inlay-border: #424245;
  --inlay-link: #409cff;
  --inlay-code-bg: #2c2c2e;
  --inlay-quote: #8e8e93;
  --inlay-mark: #6b5c00;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --inlay-fg: #f5f5f7;
    --inlay-bg: #1d1d1f;
    --inlay-muted: #98989d;
    --inlay-border: #424245;
    --inlay-link: #409cff;
    --inlay-code-bg: #2c2c2e;
    --inlay-quote: #8e8e93;
    --inlay-mark: #6b5c00;
  }
}
:root[data-theme="light"] { color-scheme: light; }
html, body { margin: 0; background: var(--inlay-bg); color: var(--inlay-fg); }
body {
  font-family: var(--inlay-font);
  font-size: 16px;
  line-height: 1.55;
  -webkit-text-size-adjust: 100%;
  word-wrap: break-word;
}
.inlay-doc { max-width: var(--inlay-measure); margin: 0 auto; padding: 1.5rem 1.25rem 4rem; }
.inlay-doc > :first-child { margin-top: 0; }
h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.6em 0 0.6em; font-weight: 600; }
h1 { font-size: 2em; border-bottom: 1px solid var(--inlay-border); padding-bottom: 0.3em; }
h2 { font-size: 1.5em; border-bottom: 1px solid var(--inlay-border); padding-bottom: 0.3em; }
h3 { font-size: 1.25em; }
h4 { font-size: 1.05em; }
h5, h6 { font-size: 1em; }
h6 { color: var(--inlay-muted); }
p, ul, ol, dl, table, pre, blockquote, figure, .inlay-math-display { margin: 0 0 1em; }
a { color: var(--inlay-link); text-decoration: none; }
a:hover { text-decoration: underline; }
img, svg, video, canvas { max-width: 100%; }
img { height: auto; }
hr { border: 0; border-top: 1px solid var(--inlay-border); margin: 2em 0; }
blockquote { margin-left: 0; padding: 0 1em; color: var(--inlay-quote); border-left: 0.25em solid var(--inlay-border); }
blockquote > :last-child { margin-bottom: 0; }
ul, ol { padding-left: 2em; }
li + li { margin-top: 0.25em; }
li > p { margin-bottom: 0.5em; }
ul.contains-task-list, .task-list-item { list-style: none; }
.contains-task-list { padding-left: 1.2em; }
.task-list-item input[type="checkbox"] { margin: 0 0.5em 0.2em -1.2em; vertical-align: middle; }
code, kbd, pre, samp { font-family: var(--inlay-mono); font-size: 0.9em; }
:not(pre) > code { background: var(--inlay-code-bg); padding: 0.15em 0.35em; border-radius: 4px; }
pre { background: var(--inlay-code-bg); padding: 0.9em 1em; border-radius: 8px; overflow: auto; line-height: 1.45; }
pre code { background: none; padding: 0; font-size: inherit; }
pre.shiki { background-color: var(--shiki-light-bg); color: var(--shiki-light); }
pre.shiki span { color: var(--shiki-light); font-style: var(--shiki-light-font-style); font-weight: var(--shiki-light-font-weight); text-decoration: var(--shiki-light-text-decoration); }
:root[data-theme="dark"] pre.shiki { background-color: var(--shiki-dark-bg); color: var(--shiki-dark); }
:root[data-theme="dark"] pre.shiki span { color: var(--shiki-dark); font-style: var(--shiki-dark-font-style); font-weight: var(--shiki-dark-font-weight); text-decoration: var(--shiki-dark-text-decoration); }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) pre.shiki { background-color: var(--shiki-dark-bg); color: var(--shiki-dark); }
  :root:not([data-theme="light"]) pre.shiki span { color: var(--shiki-dark); font-style: var(--shiki-dark-font-style); font-weight: var(--shiki-dark-font-weight); text-decoration: var(--shiki-dark-text-decoration); }
}
kbd { background: var(--inlay-code-bg); border: 1px solid var(--inlay-border); border-bottom-width: 2px; border-radius: 4px; padding: 0.1em 0.4em; font-size: 0.85em; }
mark { background: var(--inlay-mark); color: inherit; }
table { border-collapse: collapse; border-spacing: 0; display: block; max-width: 100%; overflow: auto; }
th, td { border: 1px solid var(--inlay-border); padding: 0.4em 0.8em; }
th { font-weight: 600; background: var(--inlay-code-bg); }
tr:nth-child(2n) td { background: color-mix(in srgb, var(--inlay-code-bg) 50%, transparent); }
details { border: 1px solid var(--inlay-border); border-radius: 8px; padding: 0.5em 1em; margin-bottom: 1em; }
summary { cursor: pointer; font-weight: 600; }
.footnotes { margin-top: 3em; padding-top: 1em; border-top: 1px solid var(--inlay-border); font-size: 0.9em; color: var(--inlay-muted); }
.footnotes ol { padding-left: 1.5em; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
[data-footnote-ref] { text-decoration: none; }
.data-footnote-backref { font-family: var(--inlay-font); }
.inlay-math-display { overflow-x: auto; overflow-y: hidden; }
.inlay-math .katex-error { color: #cc0000; }
pre.mermaid { background: none; padding: 0; text-align: center; overflow: visible; }
pre.mermaid svg { max-width: 100%; height: auto; }
pre.mermaid[data-processed] { font-family: var(--inlay-font); }
.inlay-script-placeholder {
  border: 1px dashed var(--inlay-border);
  border-radius: 8px;
  padding: 0.6em 1em;
  margin: 0 0 1em;
  color: var(--inlay-muted);
  font-size: 0.9em;
  font-style: italic;
}
.inlay-mermaid-error { color: var(--inlay-muted); font-family: var(--inlay-mono); font-size: 0.85em; white-space: pre-wrap; }
`;
