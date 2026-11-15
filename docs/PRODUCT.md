# Inlay — product definition

What Inlay is, who it is for and how it should behave. `docs/BRIEF.md` stays the source of truth for v1; this file restates it as a product, fills in behaviour the brief leaves open, and describes where the product goes after v1. Anything beyond the brief is a **proposal** until the product owner approves it (`docs/BRIEF-AMENDMENTS.md` lists each one). Release timing is in `docs/ROADMAP.md`, the business model in `docs/MONETIZATION.md`, the build plan in `docs/PLAN.md`.

Status tags used below: **Built** (on `main`, tested), **v1.0** (in the brief, not built yet), **Proposed vX** (needs approval).

## 1. One sentence

Inlay is the Mac app that opens a Markdown file and shows what it really contains, including the HTML, SVG, CSS and JavaScript other editors strip out, safely, and lets you edit it without changing a byte you did not touch.

Tagline: **Markdown that runs.**

## 2. Why now

Markdown stopped being only prose. AI assistants and coding agents write reports, plans and dashboards as `.md` files with Mermaid diagrams, inline SVG, tables of numbers and, more and more, HTML with a chart script. People receive these files and have two bad options: a Markdown app that shows the raw tags, or a browser that runs whatever is inside with no limits. At the same time, people who keep documents in Git want an editor that does not reflow their file every time they fix a typo.

Inlay answers both with two guarantees no comparable app makes together:

1. **Everything renders, nothing escapes.** Document scripts run as on a web page, in a view with no route to the Mac and, by default, none to the network.
2. **The file on disk is sacred.** Open and save is byte-identical; an edit changes only the bytes of the block that was edited.

These two are the standard the product is held to. The November 2026 review found places where the code falls short of each (`docs/ARCHITECTURE.md` section 6: C1 and C9 for the file, S1 to S3 for the way out). Closing them comes before the first beta, and the public wording stays modest until they are closed.

## 3. Who it is for

| Person | What they do | What they need from Inlay |
| --- | --- | --- |
| **The reader of generated documents** | Receives Markdown from AI tools, colleagues or a CI job; mostly reads | Double-click or Space in Finder and see the rendered document, charts included; certainty that an unknown file cannot do harm |
| **The technical writer and analyst** | Writes reports and docs with charts, diagrams, math and small interactive pieces | WYSIWYG that keeps raw HTML intact, a quick way to insert and tune live blocks, export to HTML and PDF |
| **The docs-in-Git maintainer** | Edits READMEs, changelogs and documentation sites | Minimal diffs, front matter and GitHub syntax handled, line endings and BOM preserved |
| **The Vietnamese, Chinese, Japanese or Korean writer** | Types with an input method all day | Composition that never drops, doubles or reorders characters, in every mode |

The first row is the entry point: it is the largest group, it needs the least from the editor, and Quick Look puts Inlay in front of it without a decision to "switch editors". The second row is who pays (see `docs/MONETIZATION.md`).

## 4. Principles, in priority order

1. **The file on disk is sacred.** No feature may change bytes the user did not ask to change. A feature that cannot keep this rule is redesigned or dropped.
2. **A document is an untrusted program.** Rendering is full, authority is zero. Trust is granted by the user, per document or per folder, in native UI the document cannot draw over.
3. **Documents stay portable.** Inlay never invents syntax that only Inlay renders. What it inserts is plain Markdown or plain HTML that GitHub, a browser or another editor can read.
4. **Local and private.** No account, no telemetry, no network request except the update check and what the user explicitly allows.
5. **Reading comes first.** The shortest path from a file to its rendered form (Quick Look, then the Read view) is always the most polished one. WYSIWYG is the primary editing mode.
6. **A Mac app, on a portable core.** Native documents, windows, menus and shortcuts; everything else in the web core behind the `Host` interface so the same core can run in a browser, in Quick Look and later on other platforms.
7. **Fast enough to forget.** Budgets are published and tested (section 9).

## 5. How the app works

### 5.1 Surfaces

| Surface | What it is | Status |
| --- | --- | --- |
| **Quick Look** | Space in Finder. Tier 1 always: text, inline SVG, local images, math, theme; proposed (A9) also GitHub alerts, emoji shortcodes, a contents column in wide previews, and Mermaid drawn by Inlay's own renderer while the document's scripts stay off. Tier 2 when "Run scripts in Quick Look" is on: charts, Mermaid, document scripts, no network. Tier 3 otherwise: static page with an "Interactive content: open in Inlay" placeholder. | v1.0 (M4) |
| **Read** (⌘4) | The document as a real page. Scripts and styles run at page level, isolated. | Built |
| **Edit**, WYSIWYG (⌘1) | The primary editor. Blocks are edited in place; anything that cannot round-trip is a raw island with its own source editor. | Built |
| **Source** (⌘2) | The whole file in CodeMirror, line endings shown as they are. | Built |
| **Split** (⌘3) | Source beside the live Read view, scroll-synced. | Built |
| **Present** | The document as slides, split at `---` or at headings, charts live. | Proposed v1.2 |
| **Workspace** | A folder window: file tree, quick open, search. | Proposed v2.0 |

### 5.2 Opening a file

1. Finder double-click, File → Open, drag onto the Dock icon, `inlay file.md` from a terminal (Proposed v1.2), or **Open with Inlay** from Quick Look.
2. Inlay reads the bytes and keeps them. It decodes UTF-8, records the BOM and the dominant line ending, and never normalizes.
3. If the file carries the quarantine attribute and has not been trusted, it opens in Read with scripts off and a native banner: **Trust This Document**.
4. Otherwise it opens in the mode set in Settings → General → "Open documents in": *the mode last used* (default), *Read*, or *Edit*. A new document opens in Edit. Above 50k lines or 5 MB a document opens in Source with a one-click switch.
5. Not UTF-8: opens read-only with a banner; saving writes the original bytes.

"Open documents in" exists as a setting key today (`editor.defaultMode`), but native does not read it: every window opens in the mode last used, Read the first time, and that includes a new, empty document (a defect, C4). Honouring the setting and giving it UI is proposed for 1.0 (amendment A2).

### 5.3 The window

One window per document, tabbable, with:

- **Toolbar:** the mode control (Read, Edit, Source, Split), the **permissions control**, Share. Built: mode control. v1.0: the rest.
- **Permissions control** (v1.0 as two pills, Proposed v1.3 as one popover): shows at a glance whether scripts run and whether the network is reachable. Today these are View-menu items; they belong where the user looks. The v1.3 popover lists, per document: Scripts (on, off), Network (off, on), Remote images (on, off), and where the trust came from (this file, its folder).
- **Banners** above the content, always native: trust, conflict with a change on disk, mirror save warning, read-only, large-document notice.
- **Outline sidebar** (Proposed v1.1): headings from md-render, click to jump, current heading tracked in every mode.
- **Status bar** (v1.0): words and characters, encoding, line ending, "Unchanged on disk" or "2 of 148 blocks changed", cursor position in Source.
- **Empty state** (v1.0): "Drop a Markdown file, or ⌘O" when no document is open.

### 5.4 Trust and permissions

A document is in exactly one state, and the toolbar always shows which.

| State | When | Scripts | Network | How to leave |
| --- | --- | --- | --- | --- |
| **Untrusted** | Quarantined file, not yet trusted | Off (static render) | Off | **Trust This Document** in the native banner |
| **Trusted, offline** | Every other file; the default | On | `fetch`, XHR, WebSocket, forms and frames blocked. Known libraries come from bundled copies; other scripts, styles and fonts may load from the three allowlisted CDNs. Remote images: today they always load, which gives a script a way out; proposed (A1) they load only when the document runs no scripts | View → Allow Network for This Document |
| **Trusted, network allowed** | The user allowed it for this file | On | On for `https:` | Turn the toggle off |

Rules that hold in every state: no native bridge in the Read view; files outside the document folder are not served; links open in the default browser; pop-ups are refused.

Proposed before the beta (ADR-0044): a link opens the browser only after a real click; hidden files and files of unexpected types are not served, and nothing beside the document is served when its folder is the home folder; an untrusted document loads nothing remote; a duplicate of an untrusted document stays untrusted.

Proposed v1.3 (ADR-0041): trust follows the file when it is renamed or moved, a folder can be trusted once, remote images get their own switch, and an administrator can lock the defaults through managed preferences.

### 5.5 Editing

- WYSIWYG edits blocks. Each top-level block is **exact** (serializes back to its own bytes), **restyled** (same meaning, different formatting, kept verbatim until edited) or an **island** (kept verbatim, edited as source in place).
- Islands show what they are: a sanitized static preview for SVG and script-free HTML; a card for scripts and styles with **Open in Read view**; a card for front matter, comments and directives. Proposed v1.1: **Peek**, a popover that runs one script island in an isolated mini Read view without leaving the editor.
- Input rules (`# `, `**`, lists) apply to typed text only, never to text committed by an input method.
- Proposed v1.2: **Insert** menu with a snippet gallery (chart, diagram, table, callout, slider widget). A snippet is ordinary HTML or Markdown written into the document, so the file renders anywhere.
- Proposed v1.1: paste an image and it is copied into an assets folder beside the document and linked relatively; paste HTML and it becomes Markdown; pasted AI output with literal `\n` or stray fences gets a one-click clean-up.

### 5.6 Saving

- Documents autosave in place and keep Versions, as Mac documents do. Save, Duplicate, Save As, Rename, Move To and Revert To behave as in TextEdit.
- At save time the content comes from the live editor. Unchanged blocks are written from the original text; changed blocks are serialized; gaps between blocks are preserved.
- If the file changes on disk while there are unsaved edits, nothing is overwritten: a banner offers **Reload from Disk** or **Keep Editing**.
- Proposed v2.0: **Changes** view, the changed blocks against the saved bytes, shown in a gutter and as a diff. Inlay can show this exactly because the block model already knows it.

### 5.7 Export and sharing

| Output | Behaviour | Status and edition |
| --- | --- | --- |
| HTML, single file | Theme, images and bundled libraries inlined; opens in any browser | v1.0, free |
| PDF | Paginated from the Read view with print CSS | v1.0, free |
| Print | File → Print prints the rendered document | v1.0, free |
| Copy as rich text | Rendered selection with inline styles for Mail, Notes, Slack | Proposed v1.1, free |
| PDF with outline, page breaks, headers and footers | Bookmarks from headings; page-break marker | Proposed v1.2, Pro |
| Frozen HTML | Scripts run once, results captured as SVG or image, scripts removed; safe to email | Proposed v1.2, Pro |
| DOCX | From the syntax tree with a permissive writer | Proposed v1.2, Pro |
| Diagram or chart as PNG or SVG | From the image viewer, through a native save panel | Proposed v1.2, Pro |
| Batch export | `inlay export --pdf docs/*.md`, Shortcuts actions | Proposed v1.2, Pro |
| Published link | A hosted, sandboxed copy with a share link | Proposed v2.x, subscription, only if validated |

### 5.8 Settings

One Settings window (the web `settings-ui` package, so it ports), shared with Quick Look through the App Group:

- **General:** open documents in; default folder for images; check for updates.
- **Appearance:** theme (light, dark, follow system), custom CSS file, writing column width, editor font and size.
- **Editing:** auto-pair, smart punctuation (off by default), spellcheck, Vim keys in Source.
- **Security:** run scripts for trusted documents (on), allow remote images (on), run scripts in Quick Look (off), trusted folders, reset trust decisions.
- **Licence** (Proposed v1.2): licence status and activation, offline.

### 5.9 Keyboard

⌘1 Edit, ⌘2 Source, ⌘3 Split, ⌘4 Read, ⌘R refresh the Read view. Proposed: ⌘F find in every mode (v1.1), ⌃⌘O outline (v1.1), ⇧⌘P command palette (v2.0), ⌘P stays Print. Shortcuts are matched by key code, not by produced character, so Telex and Option layouts do not break them. One Escape chain, innermost first: island editor, find bar, popover, Present, full screen.

## 6. Editions

The split below is the proposal in `docs/MONETIZATION.md`; nothing is charged for before v1.2.

**Free and open source, for good:** everything in the brief (reading, all four modes, raw islands, byte-exact saving, Quick Look in all tiers, themes and custom CSS, HTML and PDF export, updates), every security feature, navigation and writing comfort (outline, find, focus mode, status bar), image paste, localization, the workspace basics (file tree, quick open) and the Changes view.

**Pro, a paid licence for the official build:** Present, the export suite, the snippet gallery beyond the starter set, automation (CLI export, Shortcuts), cross-file search and replace, backlinks, and later an assistant that runs on the device or on the user's own API key.

The rule for where a feature goes: if it is needed to read, edit or keep a file safely, it is free. If it turns a document into a deliverable or saves a professional repeated work, it can be Pro.

## 7. What Inlay will not do

- Rewrite a file to tidy it. No format-on-save. At most an explicit "Reformat document" command.
- Add Inlay-only syntax or store anything about a document inside the document.
- Require an account for the app, collect usage data, or show advertising.
- Run document code with more authority than a web page in a locked-down browser tab.
- Become a note database. Files stay ordinary files in ordinary folders.
- Ship JSX or a second document language. HTML and JavaScript already run.

## 8. Non-goals for v1, and what is proposed to change after it

The brief excludes sync, plugins, AI features, collaboration, the Mac App Store and Windows/Linux builds from v1. That stands. After v1 this document proposes: a Mac App Store edition (v1.3), an on-device or bring-your-own-key assistant (v2.x), Windows and Linux through Tauri (v3) and an optional publishing service (v2.x). Sync and real-time collaboration stay out: iCloud Drive, Dropbox and Git already move files, and the conflict banner handles the result. A public plugin system stays out until the internal extension points have carried Pro for a year.

## 9. Budgets

| Measure | Budget | Checked by |
| --- | --- | --- |
| Open a 10,000-line file to an editable view | under 1 s | Playwright (Chromium and WebKit), XCTest |
| Edit to re-rendered Read pane in Split | under 300 ms for a prose edit | Proposed v1.1 with incremental refresh; today a full reload, under 1 s on the 10k fixture |
| Cold start to a rendered document | under 500 ms | Proposed: macOS CI check |
| Idle memory, one document | under 150 MB across processes | Proposed: macOS CI check |
| Quick Look preview | under 300 ms for a typical file | M4 |
| App download size | under 40 MB | M5 release workflow |
| Bytes changed by an edit | only the edited block's | Vitest, Playwright, XCTest |

The proposed numbers are targets to measure first and then hold; they are not yet verified.
