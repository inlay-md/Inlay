# Inlay — roadmap

Where the product goes, release by release, with the business track beside it. `docs/BRIEF.md` defines v1.0 and is decided. Everything after v1.0 is a **proposal** for the product owner: it is ordered and sized so that a "go" on a release is enough to start, and `docs/BRIEF-AMENDMENTS.md` lists the brief changes each release would need. The product itself is described in `docs/PRODUCT.md`, the business model in `docs/MONETIZATION.md`, and the task lists in `docs/PLAN.md`.

Dates are targets, not commitments. Code has moved fast (M0 to M3 in days); the pace is set by what only the product owner can do: the Apple Team ID and signing credentials, manual checks on real hardware, and product decisions.

Size: **S** is a slice or two, **M** a few days of slices, **L** a milestone of its own.

## At a glance

| Release | Theme | Target | What a user gets | Business track |
| --- | --- | --- | --- | --- |
| **0.9 beta** | Prove it on other Macs | December 2026 | Signed, notarized build of everything on `main` plus Quick Look | Website download, feedback channel, sponsorship opened |
| **1.0** | Faithful | Q1 2027 | The brief: full rendering, WYSIWYG with raw islands, byte-exact saving, Quick Look, export, themes, updates | Free. Public launch. "Free for good" pledge published |
| **1.1** | Navigate | Q2 2027 | Outline, find everywhere, live preview that does not flicker, image paste, GitHub syntax, focus modes, Vietnamese localization | Free. Grow the audience; measure what people use it for |
| **1.2** | Produce | Q3 2027 | Present, export suite, snippet gallery, command line and Shortcuts | **Inlay Pro** launches: paid licence for the official build |
| **1.3** | Trust | Q4 2027 | Permissions popover, folder trust, managed policies, sandboxed build | Mac App Store edition, Setapp, team licences |
| **2.0** | Workspace | H1 2028 | Folder window, quick open, search, Changes view, Git awareness, command palette | Pro grows (cross-file tools); price reviewed |
| **2.x** | Share and assist | 2028 | Optional publishing service; on-device or bring-your-own-key assistant | Subscription for the hosted service, only if validated |
| **3.0** | Everywhere | later | Windows and Linux through Tauri; iPhone and iPad viewer | Cross-platform licence |

## 0.9 beta: prove it on other Macs

**Goal:** real users on real Macs before the public launch, because the two promises (isolation, byte identity) and input methods can only be proven broadly in the field.

- M4 Quick Look, tiers 1 to 3, with the App Group settings, starting with a test of whether a third-party extension still takes precedence over the system's own Markdown preview on macOS 27.3 (ADR-0050). **L**, in the brief.
- Hardening pass from the November 2026 audit (`docs/ARCHITECTURE.md` section 6, `docs/PLAN.md` MH). **M**
- Signing, notarization and a disk image; Sparkle wired to a beta appcast. **M**, in the brief (M5).
- The manual checklists run and recorded for the first time (`docs/CHECKLIST.md`), the IME checklist above all.
- A welcome document that opens on first launch and shows a live chart, an island and the trust banner. **S**

**Exit:** ten outside testers have opened their own files; no report of a changed byte or an escaped script; the IME checklist passes on macOS 14 and the current macOS.

## 1.0: Faithful

**Goal:** everything the brief promises, finished to the standard of a Mac app someone would make their default for `.md`.

In the brief (M5):
- HTML export (single file) and paginated PDF export. **M**
- Themes, custom CSS, editor font settings. **M**
- Preferences window on the web `settings-ui` package. **M**
- Sparkle updates on the stable appcast; release workflow. **M**

Needed to finish what is already there (the design track in PLAN):
- Window chrome: permission pills (Scripts, Network), status bar (words, encoding, line ending, "n of m blocks changed"), empty state. **M**
- Read view theme from the design tokens, light and dark. **S**
- Print from the rendered document. The menu item exists and does nothing useful today. **S**
- About window, Help menu with a user guide written in Markdown and opened in Inlay. **S**
- Quick Look onboarding: first launch registers the extension; a troubleshooting page for conflicting extensions. **S**

Proposed additions to 1.0 (small, and their absence would be the first thing a reviewer notices):
- Find (⌘F) in Read and WYSIWYG; Source already has it. **M**
- "Open documents in" setting honoured by the app. **S**
- Table row and column handles in WYSIWYG (open since M3). **M**

**Exit:** the brief's acceptance criteria for M4 and M5; the release checklist passes on macOS 14 and the current macOS; a Homebrew cask exists.

## 1.1: Navigate

**Goal:** make long and live documents comfortable. This release is free and is what turns a viewer people try into the one they keep.

Reading and navigating
- Outline sidebar with click-to-jump and current-heading tracking, built from a `headings` list in md-render's metadata so one outline serves every mode. **M**
- Heading anchors and in-document links (`rehype-slug`, MIT). **S**
- **Incremental refresh of the Read view** (ADR-0036): a prose edit patches the changed blocks instead of reloading the page, so charts stop redrawing and widgets keep their state while typing in Split. A reload still happens when a script or style block changes. **M**
- **Follow mode:** keep the view at the end of a file that another program is appending to, for reports an agent is still writing. **S**
- Jump from Read to Source: double-click a block in Read to edit it (ADR-0037). **S**
- Zoom (⌘+, ⌘−, ⌘0) and writing-column width. **S**
- Word count, reading time and selection count in the status bar. **S**
- Front matter shown as a property table in Read and Quick Look. **S**

Writing comfort
- Focus mode, typewriter mode, Zen (full screen with chrome hidden). **S** each
- Auto-pair brackets and quotes; smart punctuation, off by default. Never during composition. **S**
- Spellcheck controls; skip code, math and islands. **S**
- Image block in WYSIWYG: resize, alignment, alt text, writing only the image's bytes. **M**
- Mermaid preview toggle in code blocks (open since M3). **S**
- **Peek:** run one script island in a small isolated popover without leaving the editor. **M**
- Vim keys in Source (`@replit/codemirror-vim`, MIT), opt-in. **S**
- Apple Writing Tools in WYSIWYG, checked to arrive as ordinary transactions. **S**

Paste and images
- Paste or drop an image: copied into an assets folder beside the document through a new `Host.writeAsset`, linked relatively. **M**
- Paste rich text or HTML as Markdown (`rehype-remark`, MIT); plain paste with ⇧⌘V. **M**
- Clean-up for pasted AI output: literal `\n`, escaped Markdown, stray fences. **S**
- Copy as rich text or HTML. **S**

Syntax (opt-in where it is not GitHub's; one parser, fixtures, JavaScriptCore parity)
- GitHub alerts (`> [!NOTE]` and friends). **S**
- Emoji shortcodes, render only. **S**
- Highlight, subscript, superscript; one documented rule for the single-tilde conflict. **S**
- Chemistry (`\ce{}`) through KaTeX's mhchem. **S**

Platform
- Localization: English and Vietnamese (ADR-0043). **M**
- Opt-in diagnostics through MetricKit; nothing sent without a click (ADR-0042). **S**
- Performance budgets for cold start and idle memory checked in the macOS CI job. **S**

**Exit:** typing in Split never redraws an unchanged chart; the outline works in all four modes; every new syntax has fixtures in the round-trip and rendering suites.

## 1.2: Produce

**Goal:** turn documents into deliverables. This is where Inlay Pro starts (see `docs/MONETIZATION.md`); everything shipped before stays free.

Free in this release
- Internal extension points: commands, exporters, panes, snippet providers (ADR-0039). Pro is built on them, and they are the future plugin interface. **M**
- `inlay` command: `inlay file.md` opens a window; `inlay -` reads standard input. **S**
- Starter snippets in an Insert menu: chart, Mermaid diagram, table, callout. **S**
- Templates for new documents. **S**
- Image and diagram viewer: zoom, pan, fit. **M**

Pro
- **Present:** the document as slides, split at `---` or headings, with live charts, speaker notes from HTML comments, and export to PDF. **L**
- **Export suite:** PDF with outline, page breaks, headers and footers; frozen HTML (scripts run once, output captured, scripts removed); DOCX from the syntax tree (`docx`, MIT); diagram or chart to PNG or SVG. **L**
- **Snippet gallery:** a library of tuned charts, widgets and layouts with a live preview and a small form for the data. Each inserts plain HTML. **M**
- **Automation:** `inlay export --pdf|--html|--docx`, Shortcuts and App Intents ("Render Markdown", "Export as PDF"). **M**
- Offline licence activation (ADR-0040): a signed licence file, checked on the Mac, no account and no call home. **M**

**Exit:** a deck presented from a Markdown file with a live chart; a 50-page PDF with a working outline; a licence activates with the network off.

## 1.3: Trust

**Goal:** make Inlay's safety visible and manageable, and open the store channels that need the sandbox.

- Permissions popover in the toolbar: scripts, network, remote images, and where the trust came from (ADR-0041). **M**
- Trust that follows a file when it is renamed or moved; trust a folder once. **M**
- Managed preferences for organizations: force scripts off, pin the CDN list, disable "Allow network". **S**
- One file-access layer in Swift with security-scoped bookmarks, so the app can run inside the App Sandbox (ADR-0038, amends ADR-0012). **L**
- Mac App Store edition from the same code; Setapp build. **M**, needs a brief change.
- More Quick Look: outline in wide previews, "Show source", more file types (`.mdown`, `.qmd`, `.rmd`, TextBundle). **M**
- Legacy encodings (Shift-JIS, GB18030, Windows-1258) and explicit line-ending conversion. **M**

**Exit:** the sandboxed build passes the same test suites as the direct build; an administrator can lock scripts off with a configuration profile.

## 2.0: Workspace

**Goal:** from one file to a folder of them, without becoming a note database.

Free
- Folder window: file tree, Quick Open (⇧⌘O; ⌘P stays Print), recent folders; respects `.gitignore` and size limits. **L**
- **Changes view:** changed blocks against the saved bytes, in a gutter and as a diff. Only Inlay can show this exactly, because the block model already tracks it. **M**
- Command palette (⇧⌘P). **M**
- Heading folding, view only. **S**
- Right-to-left text. **M**

Pro
- Search and replace across a folder, with regular expressions. **M**
- Wikilinks, backlinks and hashtags as a per-folder opt-in. **L**
- Git awareness: status, diff against HEAD, read-only first. **M**
- More diagram engines, vendored and lazy like Mermaid: Vega-Lite (BSD-3), abcjs (MIT). Graphviz needs a per-package licence decision. **M** each

**Exit:** a 5,000-file folder opens and searches without blocking the window; the Changes view matches `git diff` on the saved file.

## 2.x: Share and assist

Both need a brief change, and the first needs proof of demand before any server is built.

- **Assistant:** rewrites scoped to the selection, shown as a proposal and applied through the block splice so untouched bytes stay; Apple's on-device models as the private default, the user's own API key in the Keychain as an option; "explain this embedded script" for the cautious reader. Pro. **L**
- **Publish:** a hosted, sandboxed copy of a document behind a share link, on a separate domain. A subscription. Hosting other people's scripts invites abuse, so this is built only if the waiting list and the export numbers justify it (`docs/MONETIZATION.md` section 7). **L**
- An MCP server so an agent can ask Inlay to open, render or export a document. **M**

## 3.0: Everywhere

- Windows and Linux through a Tauri shell on the same web core. The `Host` boundary exists for this; the cost is a second shell, a second scheme mapping (`http://mdview.localhost`) and re-proving isolation on WebView2 and WebKitGTK. **L**
- iPhone and iPad viewer with Quick Look, on the web core and the JavaScriptCore bundle. Needs its own brief. **L**

## Backlog, not scheduled

Kept from the comparison with other apps; each still has to pass the four rules (bytes, one parser, isolation, licences).

| Idea | Note | Size |
| --- | --- | --- |
| `[TOC]` placeholder | Render only; GitHub does not support it, so decide whether to at all | S |
| Admonitions through directives (`:::note`) | Directives are islands today; `remark-directive` (MIT) could render a known set | M |
| Definition lists, abbreviations | Low demand, render only | S |
| Equation numbering | KaTeX numbers only `\tag{}`; needs our own counter | S |
| Export to EPUB or LaTeX | A user-installed Pandoc (GPL, never bundled) needs a product-owner decision | M |
| Image upload to S3, R2 or a user command | Credentials and network; the user-command variant is simplest | M |
| Services menu and Share extension | Small native additions | S |
| Custom keyboard shortcuts | macOS already rebinds menu items; only web-only commands need UI | S |
| Blog publishing (WordPress, Ghost, Hugo) | Network and credentials | M |

## Not recommended

- **Format on save.** It rewrites bytes the user did not touch. At most an explicit "Reformat document".
- **React components or JSX in Markdown.** Inlay already runs real HTML and JavaScript; JSX adds a compiler and a second syntax.
- **PlantUML through a public server.** It sends document content over the network.
- **Regular-expression preprocessing of Markdown.** It breaks the one-parser rule and source mapping.
- **Sticky notes, reminders, a note database, social features.** Outside a Markdown editor's job.
- **Portable mode.** Not a macOS convention.
- **Real-time collaboration and our own sync.** iCloud Drive, Dropbox and Git already move files; the conflict banner handles the result.

## Appendix: apps studied (November 2026)

| App | What it is | What stood out |
| --- | --- | --- |
| [MarkText](https://marktext.me/) (MIT) | Electron WYSIWYG editor | Render in place, `/` quick insert, themes, focus and typewriter modes, image copy-to-folder templates, image and diagram viewer with export, heading folding, folder search |
| [CrabPad](https://dev.to/ukash/i-built-a-markdown-editor-with-tauri-heres-what-i-learned-4f5l) | Tauri + React editor | Command palette, Zen mode, outline, workspace search, admonitions; lessons on `e.code` against `e.key` and one Escape priority chain |
| [FlyMD](https://www.flymd.app/) (non-commercial licence, ideas only) | Tauri + Milkdown platform | Library search, WebDAV sync, image upload, publishing, assistant, plugins, backlinks and graph, Git panel, published performance budgets |
| [MDX Editor](https://dev.to/maqi1520/created-a-markdown-desktop-app-with-tauri-h8d) | Tauri editor with React components | Folder tree, format-on-save, themes, formatted copy |
| [Moraya](https://users.rust-lang.org/t/an-extremely-elegant-open-source-ai-markdown-editor-tauri-svelte/138163) | Tauri + Svelte + Milkdown, AI-first | Visual, Source and Split with block-level scroll anchoring, assistant panel, MCP, keys in the Keychain |
| [MDHero](https://mdhero.app/blogs/building-native-viewer-8mb/) (MIT) | Tauri viewer with Quick Look | Viewer first, find, print to PDF, paste clean-up for AI output, 400 ms first paint |
| [Typora](https://typora.io/) | Commercial WYSIWYG editor | Seamless live preview, outline and file tree, focus and typewriter, table editing, image handling, Pandoc export, PDF bookmarks |
| [QLMarkdown](https://github.com/sbarex/QLMarkdown) (GPL-3, read only) | Quick Look extension, settings app and CLI | GitHub alerts, heading anchors, outline in wide previews, front matter as a table, extra file types, Shortcuts actions |
