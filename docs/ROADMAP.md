# Inlay: roadmap ideas after v1 (draft)

**Status:** draft for the product owner, 2026-11-06. This is not part of the brief; nothing here is scheduled until the product owner picks it. `docs/BRIEF.md` still defines v1 and `docs/PLAN.md` tracks M4–M5.

Ideas come from studying other Markdown apps (list below). Each one has been checked against Inlay's rules, and where an idea pushes against one, the note says how. Every item has to keep these rules:

- **The file on disk is sacred.** View features (folding, focus mode, outline) never touch bytes. Features that write (image paste, smart punctuation) change only the bytes the user asked for, through the block splice.
- **One parser.** New syntax goes into md-render and the editor's pinned remark together, with fixtures, and must round-trip or become an island.
- **Host boundary and Read view isolation.** Anything that needs native help goes through `Host`. The Read view keeps zero message handlers, so features that need a file save (for example "export this diagram") run from the editor webview or native code, never from document-page script.
- **Licences.** MIT/BSD/Apache-2.0/ISC only for shipped code. GPL tools such as Pandoc may only be *called* if the user installed them, and that needs a product-owner decision first.

Size: **S** ≈ a slice or two, **M** ≈ a few days of slices, **L** ≈ a milestone of its own.

## Apps studied

| App | What it is | What stood out |
|---|---|---|
| [MarkText](https://marktext.me/) (MIT) | Electron WYSIWYG editor | Render in place, `/` quick insert, 33 CSS themes, focus/typewriter, image copy-to-folder with `${filename}` templates, image/diagram viewer with PNG/SVG export, heading folding, folder search, CLI export |
| [CrabPad](https://dev.to/ukash/i-built-a-markdown-editor-with-tauri-heres-what-i-learned-4f5l) | Tauri + React editor | Command palette, Zen mode, outline panel, workspace search, admonitions and `:::` containers, recordable keybindings; lessons on `e.code` vs `e.key` and an Escape priority chain |
| [FlyMD](https://www.flymd.app/) ([README](https://github.com/flyhunterl/flymd); non-commercial licence, ideas only) | Tauri + Milkdown "knowledge work platform" | Library search with full-text and semantic modes, WebDAV sync, S3/R2 image upload, blog publishing, AI assistant, plugin marketplace, backlinks and graph view, Git panel, templates, published perf budgets (≤ 300 ms cold start, ≤ 50 MB RAM) |
| [MDX Editor](https://dev.to/maqi1520/created-a-markdown-desktop-app-with-tauri-h8d) | Tauri editor with React components in Markdown | Folder document tree, format-on-save, 10+ document and code themes, WeChat-style formatted copy |
| [Moraya](https://users.rust-lang.org/t/an-extremely-elegant-open-source-ai-markdown-editor-tauri-svelte/138163) ([summary](https://www.sourcepulse.org/projects/28106930)) | Tauri + Svelte + Milkdown, AI-first | Visual / Source / Split with block-level scroll anchoring, AI chat panel, MCP, API keys in the Keychain, local models, plugin API |
| [MDHero](https://mdhero.app/blogs/building-native-viewer-8mb/) (MIT) | Tauri viewer with Quick Look | Viewer-first (opens rendered on double-click), find, print to PDF, LLM paste cleanup (escaped `\n`), lazy Shiki/Mermaid, 400 ms first paint, 45 MB idle |
| Typora | Commercial WYSIWYG editor | Seamless live preview, outline + file tree, focus/typewriter, table drag/resize, image copy and upload (PicGo), Pandoc export, PDF bookmarks, `[TOC]`, heading numbering via CSS, word count and reading time, smart punctuation, snippets, RTL |
| [QLMarkdown](https://github.com/sbarex/QLMarkdown) (GPL-3, read only) | Quick Look extension + settings app + CLI | GitHub alerts, wikilinks, hashtags, heading anchors, emoji, TOC sidebar in wide previews, front matter as a table, extra file types (`.qmd`, `.rmd`, `.mdx`, TextBundle), Shortcuts actions, a CLI converter |

## Already planned, so not repeated below

Quick Look tiers (M4); HTML/PDF export, themes and custom CSS, preferences window, Sparkle (M5); the outline sidebar, native status bar with word count, and "Block n of m changed" (design track); table row/column handles and the Mermaid preview in WYSIWYG code blocks (M3 follow-ups). Several items below extend these.

## Near term (v1.x): fits the brief as written

### Navigation and reading

| Feature | Seen in | Notes for Inlay | Size |
|---|---|---|---|
| Outline sidebar with click-to-jump and current-heading tracking | Typora, MarkText, CrabPad, FlyMD, Moraya | Already a tentative M5 item. Build it natively from md-render's heading list plus `data-source-line`, so one outline serves Read, Source and WYSIWYG. Dock left or right; hover preview when collapsed (MarkText). | M |
| Find in every mode | MDHero, MarkText | Source has CodeMirror search. Add a find bar in WYSIWYG (a ProseMirror search plugin) and a native find bar for the Read view over WKWebView's find API. Replace stays editor-only. | M |
| Heading folding (view only) | MarkText | Folding changes the view, never the saved text. ProseMirror decorations in WYSIWYG, CodeMirror `foldService` in Source. | S |
| Heading anchors and in-document links | Typora, QLMarkdown | GitHub-style slugs (`rehype-slug`, MIT) in md-render; `[link](#heading)` jumps in Read and WYSIWYG. Also lets the outline and export bookmarks share IDs. | S |
| `[TOC]` placeholder | Typora | Render-only: the source line stays `[TOC]`. Decide whether to support it at all, since GitHub doesn't. | S |
| Word count, reading time, selection count | Typora | Part of the planned status bar; computed in the web core from the live document. | S |
| Open in Read mode by default for viewer use | MDHero | `editor.defaultMode` already accepts `read`; expose it in Preferences and offer "remember mode per document". | S |
| Zoom and writing-column width | Typora, FlyMD | ⌘+ / ⌘− / ⌘0 and a measure setting (the design uses a 680 px column). | S |

### Writing comfort

| Feature | Seen in | Notes for Inlay | Size |
|---|---|---|---|
| Focus mode (dim all but the current block or sentence) | Typora, MarkText, FlyMD | Decorations only. Works in WYSIWYG and Source. | S |
| Typewriter mode (caret line stays centred) | Typora, MarkText | Scroll-margin logic in both editors; must not fight IME candidate windows. | S |
| Zen / full-screen writing | CrabPad | Native full-screen plus hidden toolbar and outline, persisted. Define the Escape priority chain first (island editor → find bar → Zen), as CrabPad learned. | S |
| Auto-pair brackets, quotes and Markdown symbols | Typora, MarkText | CodeMirror `closeBrackets`; a ProseMirror input rule in WYSIWYG. Must stay off during composition (ADR-0034). Off by default for `*` and `_`. | S |
| Smart punctuation (curly quotes, dashes) | Typora, QLMarkdown | Only on newly typed text, never on existing bytes. Off by default; Vietnamese and CJK users need to opt in knowingly. | S |
| Table editing: drag to reorder rows/columns, resize, insert dialog | Typora, MarkText | Extends the open M3 table-handles task. Reordering rewrites only the table block. | M |
| Image block in WYSIWYG (resize handles, alignment, alt text) | MarkText, Typora | Crepe's ImageBlock is off because it rewrites alt text (ADR-0032). Ours writes only the image node's bytes, keeping `<img width>` when the user resizes. | M |
| Spellcheck and grammar controls | Typora, MarkText | WebKit gives macOS spellcheck in contenteditable for free; skip it in code, math and islands, and add a menu toggle. | S |
| Vim keybindings in Source mode | CrabPad (planned) | `@replit/codemirror-vim` (MIT), opt-in. | S |

### Images and paste

| Feature | Seen in | Notes for Inlay | Size |
|---|---|---|---|
| Paste or drop an image → copy into an assets folder next to the document | MarkText, Typora, FlyMD | New `Host.writeAsset(name, bytes)`; Swift writes under the document folder through `PathGuard`; path template such as `assets/${filename}/`; inserts a relative link. Untitled documents hold the image until the first save. Only the new block's bytes change. | M |
| Paste rich text or HTML as Markdown | MarkText, Typora | `rehype-remark` (MIT) on the pasted HTML, then the editor's own serializer. Plain-text paste with ⇧⌘V. | M |
| LLM paste cleanup | MDHero | Detect literal `\n`, escaped Markdown and stray code fences in pasted AI output; offer a one-click fix. A small, timely differentiator. | S |
| Copy as rich text / HTML | MDX Editor (WeChat formatting), FlyMD | Copy the rendered selection with inline styles for Mail, Notes, Slack or a blog editor. Runs from the editor, not the Read view. | S |
| Image and diagram viewer (zoom, pan, fit) | MarkText | Cmd-click an image or Mermaid diagram. Export as PNG/SVG goes through a native save panel, never from the Read page itself. | M |

### Markdown syntax extensions (opt-in, one parser)

Each extension needs fixtures, md-render + JSC parity, and the editor's round-trip check. Syntax the editor can't edit losslessly becomes an island, as today.

| Feature | Seen in | Notes for Inlay | Size |
|---|---|---|---|
| GitHub alerts (`> [!NOTE]`, TIP, IMPORTANT, WARNING, CAUTION) | QLMarkdown, CrabPad | Highest value: GitHub renders them and AI tools write them. They are still blockquotes, so WYSIWYG keeps editing them; md-render adds the styling. | S |
| Highlight `==text==`, sub `~x~`, sup `^x^` | Typora, QLMarkdown, CrabPad | Conflicts with GFM single-tilde strikethrough; pick one rule and document it. | S |
| Emoji shortcodes (`:tada:`) | Typora, QLMarkdown, CrabPad | Render-only (`remark-gemoji`, MIT); the source keeps the shortcode. Autocomplete is optional; macOS already has ⌃⌘Space. | S |
| Admonitions via directives (`:::note`) | CrabPad, QLMarkdown (MkDocs) | Directives are islands today; `remark-directive` (MIT) could render a known set. | M |
| Definition lists, abbreviations | CrabPad, QLMarkdown | Low demand; render-only. | S |
| Front matter shown as a table in Read view and Quick Look | QLMarkdown | Currently a card in WYSIWYG; a tidy property table helps viewer use. | S |
| Chemistry (`\ce{}`) and equation numbering | Typora | KaTeX's mhchem extension (MIT) is already in the KaTeX package. | S |

### Export, sharing and automation

| Feature | Seen in | Notes for Inlay | Size |
|---|---|---|---|
| PDF bookmarks from headings, page breaks, print CSS | Typora, FlyMD | Extends M5 PDF export: add a PDFKit outline after WKWebView renders, and support a page-break marker. | S |
| Command-line tool (`inlay file.md`, `inlay export --pdf/--html`) | MarkText, QLMarkdown, Typora | A small Swift CLI in the app bundle that runs the same md-render bundle in JSC. Fits automation and CI docs pipelines. | M |
| Shortcuts / App Intents ("Render Markdown to HTML", "Export as PDF") | QLMarkdown | Native, Mac-only polish on the same render path as the CLI. | S |
| Templates for new documents | FlyMD | A templates folder; File → New from Template. | S |
| Homebrew cask | MarkText, QLMarkdown, CrabPad | One-line install once notarized builds exist (M5). | S |

### Quick Look extras (after M4)

| Feature | Seen in | Notes for Inlay | Size |
|---|---|---|---|
| TOC sidebar when the preview window is wide | QLMarkdown | Static HTML/CSS, so it works in Tier 1. | S |
| "Show source" toggle | QLMarkdown | Highlighted raw Markdown in the preview. | S |
| More file types: `.markdown`, `.mdown`, `.qmd`, `.rmd`, `.mdx` (JSX shown as code), TextBundle / `.textpack` | QLMarkdown | TextBundle is the Mac interchange format (Bear, Ulysses, iA Writer) and keeps images in the bundle. Claim UTIs carefully; add a troubleshooting note on `mdls` and conflicting Quick Look extensions. | M |

### macOS integration

| Feature | Seen in | Notes for Inlay | Size |
|---|---|---|---|
| Apple Writing Tools in WYSIWYG | (macOS 15+) | Set the WKWebView's Writing Tools behaviour and check that rewrites arrive as ordinary ProseMirror transactions, so the block splice still confines changes. A system feature that needs no AI work of ours. | S |
| Services menu ("New Inlay note with selection") and Share | Typora (context menu) | Small native additions. | S |
| Custom keyboard shortcuts | CrabPad | macOS already lets users rebind menu items (System Settings → Keyboard); only web-only commands would need our own UI. Low priority. | S |

## Later (v2): larger features that fit the brief but need design

| Feature | Seen in | Notes for Inlay | Size |
|---|---|---|---|
| Folder workspace: file tree sidebar, Quick Open (⌘P), search in folder with regex | Typora, MarkText, CrabPad, FlyMD, MDX Editor | The most requested capability in this set. A new window type beside NSDocument windows; the app isn't sandboxed (ADR-0012), so folder access is simple. Respect `.gitignore` and size limits as MarkText does. | L |
| Wikilinks `[[Page]]`, backlinks, hashtags, graph view | QLMarkdown, FlyMD | Needs the workspace first. Wikilinks are not CommonMark or GFM, so make it a per-workspace opt-in. | L |
| "Changes since last save" view | MDX Editor (diff highlighting), FlyMD (Git) | **Inlay-specific advantage:** the block model already knows which blocks changed (`stats.wysiwyg`, the splice's `changed` count). Show changed blocks in a gutter and as a diff against the saved bytes, which other editors can't show exactly. | M |
| Git awareness (status, diff, commit) | FlyMD | Builds on the changes view; Inlay's minimal byte changes make Git diffs clean. Keep it read-only first. | M |
| Command palette (⇧⌘P) | CrabPad, FlyMD, MarkText | macOS Help-menu search already covers menu commands; a palette pays off once the workspace adds many commands. | M |
| More diagram and notation engines: Vega / Vega-Lite (BSD-3), flowchart.js (MIT), abcjs music (MIT), Graphviz | MarkText, Typora | Vendored and lazy-loaded like Mermaid. Graphviz WASM bundles carry EPL code, which needs a per-package decision like ADR-0027. **Not** PlantUML through a public server: it sends document content over the network. | M each |
| Export to DOCX, EPUB, LaTeX | Typora (Pandoc), FlyMD (DOCX) | Option A: call a user-installed `pandoc` (GPL, never bundled); product owner to decide. Option B: a permissive DOCX writer such as `docx` (MIT) from the mdast. | M–L |
| Image upload to S3/R2 or a user command | Typora (PicGo), FlyMD, MarkText | Needs credentials in the Keychain and network access, so product-owner input. The custom-command variant (run the user's own script) is simplest. | M |
| Legacy encodings (Shift-JIS, GB18030, Windows-1258) and explicit EOL conversion | MarkText | Inlay keeps BOM and EOL today. Opening non-UTF-8 files means re-encoding only changed blocks, which the byte model has to allow for. "Convert line endings" is an explicit whole-file action. | M |
| Right-to-left text | Typora | `dir="auto"` per block in Read and WYSIWYG; caret behaviour needs testing. | M |

## Needs a brief change (v1 non-goals today)

| Area | Seen in | What an Inlay version could look like |
|---|---|---|
| AI assistant | Moraya, FlyMD | Selection-scoped rewrites shown as proposals and applied through the block splice, so untouched bytes stay; Apple's on-device Foundation Models (macOS 26) as the private default, user-supplied API keys in the Keychain as an option, network off unless allowed. An "explain this embedded script" action fits Inlay's live-HTML focus. |
| Plugin system | FlyMD, Moraya, CrabPad (planned) | Start with custom renderers for fenced code languages, sandboxed like document scripts. MDHero left plugins out on purpose to stay small. |
| Sync and collaboration | FlyMD (WebDAV, live collaboration) | iCloud Drive and Dropbox already work through NSDocument and the conflict banner. Anything further is a product decision. |
| Windows/Linux (Tauri) | MarkText, CrabPad, FlyMD, MDHero, Moraya | Already "later" in the brief; the Host boundary is ready for it. |
| iPhone/iPad viewer with Quick Look | FlyMD (Android beta) | The web core and JSC bundle would carry over; it would need its own brief. |
| Blog publishing (WordPress, Ghost, Hugo front matter) | FlyMD | Needs network and credentials. |

## Not recommended

- **Desktop sticky notes, TODO push reminders, AI novel engine, social-media copywriting** (FlyMD): outside a Markdown editor's job.
- **Portable mode** (FlyMD, MarkText): not a macOS convention.
- **React components inside Markdown** (MDX Editor): Inlay already runs real HTML/JS; JSX would add a compiler and a second syntax.
- **Regex preprocessing instead of the AST** (CrabPad's lesson): breaks the one-parser rule and source mapping.
- **Format-on-save** (MDX Editor, Prettier): rewrites bytes the user didn't touch. At most an explicit "Reformat document" command.

## Engineering lessons worth adopting

- **Publish performance budgets.** MDHero (400 ms first paint, 45 MB idle) and FlyMD (≤ 300 ms cold start) use numbers as marketing. Inlay checks the 10k-line open; add a cold-start-to-rendered check and an idle-memory check to the macOS CI job.
- **Shortcuts by `e.code`, not `e.key`, where Option is involved** (CrabPad). Option changes `e.key` on macOS, and Vietnamese/Telex keyboard layouts make this worse.
- **One Escape priority chain** (CrabPad), defined before focus mode, find bars and a palette arrive.
- **Settings in files, not webview storage** (CrabPad). Inlay already does this through `Host` and `SettingsStore`.
- **Lazy-load heavy libraries** (MDHero). Inlay already lazy-loads Shiki, Mermaid and KaTeX; keep that rule for any new diagram engine.
- **Quick Look onboarding** (QLMarkdown, MDHero). First launch registers the extension; ship a short troubleshooting page (System Settings → Login Items & Extensions → Quick Look, `mdls` for UTI conflicts).

## Suggested first picks

If the product owner wants a short v1.1 list, these give the most for the least risk, and most extend work already planned:

1. Outline sidebar + find in every mode + status bar word count
2. Image paste/drop into an assets folder
3. GitHub alerts and heading anchors
4. Focus and typewriter modes
5. LLM paste cleanup and Copy as rich text
6. Apple Writing Tools check, and a Homebrew cask after M5
