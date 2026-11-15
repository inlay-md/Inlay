# Inlay — plan and progress

Task lists and their state. Scope comes from `docs/BRIEF.md` (v1.0, decided) and `docs/ROADMAP.md` (after v1.0, proposed). A fresh session reads `docs/HANDOVER.md` first, then this file and `CLAUDE.md`. Why things are the way they are: `docs/DECISIONS.md` and `docs/ARCHITECTURE.md`. Gates and manual checks: `docs/CHECKLIST.md`. Tests: `docs/TESTING.md`.

Tick a box when the work is merged to `main` with its tests. Finding ids (C1, S3, T4 …) refer to `docs/ARCHITECTURE.md` section 6.

## Status on 2026-11-12

- **Built and merged:** M0 to M3 (M3 in #8, 2026-11-06). Read view, Source, Split and WYSIWYG with raw islands work; byte identity holds for every fixture through the real `NSDocument`.
- **Reviewed:** the November 2026 review (three code audits and a market check) found the architecture sound and found defects that must be fixed before anyone outside uses the app: two paths to lost or altered content (C1, C9), ways for a document script to send data out (S1 to S3), and an untested release path. They are the new milestone **MH**.
- **Next:** MH group A, after the product owner's "go". It needs no credentials.
- **Waiting on the product owner:** the Apple Team ID (M4 App Group, signing), a Developer ID certificate issued from the **G2** authority (the old one expires 2027-02-01), and the decisions listed below.
- **Never run by hand:** `docs/IME-CHECKLIST.md`, in either mode. It is a release blocker.

## Order of work

1. **MH-A** data safety, then **MH-B** security. No credentials needed.
2. **M4** Quick Look, starting with the precedence spike on macOS 27.3. Needs the Team ID from task 4.4 on.
3. **MH-C** tooling and CI, alongside M4.
4. **M5a** app completeness, **M5b** distribution, then the **0.9 beta**.
5. **1.0**, then the proposed milestones M6 onward, each on its own "go".

## Decisions waiting for the product owner

Details and exact wording are in `docs/BRIEF-AMENDMENTS.md` (A-numbers) and `docs/MONETIZATION.md` section 11 (D-numbers).

| # | Decision | Blocks |
| --- | --- | --- |
| A1 | Remote images load only when the document runs no scripts, unless the user allows network (ADR-0044) | MH-11 |
| A2 | Add to 1.0: find in Read and WYSIWYG, table handles, an "Open documents in" setting | M5a |
| A3 | After 1.0: lift the Mac App Store non-goal for a sandboxed edition | M8 |
| A4 | After 1.0: lift the AI non-goal for an on-device or own-key assistant in Pro | M10 |
| A5 | Accept the "restyled" reading of the round-trip rule (ADR-0032) | Open since M3 |
| A6 | Accept the post-1.0 roadmap and the proposed ADRs 0035 to 0054 | M6 onward |
| A9 | Add to 1.0: GitHub alerts, emoji shortcodes, an outline in Quick Look, and Mermaid in Quick Look through Inlay's own renderer with document scripts still off | M4 tasks 4.8 to 4.11 |
| D1–D6 | Business model, free line, Pro price, founding-supporter licence, merchant of record, sponsorship | M7; the launch |
| — | Team ID; G2 Developer ID certificate; Sparkle signing key | M4, M5b |
| — | Enable GitHub private vulnerability reporting for the repository | `SECURITY.md` |

## Done: M0 to M3

**M0 — Scaffold.** Workspace, `Host` and `MockHost`, fixtures and manifest, md-render stub with both builds, XcodeGen app with the scheme handler, Quick Look spike, policy scripts, CI on Linux and macOS, licensing files (`LICENSE`, `NOTICE`, `TRADEMARKS.md`, `CONTRIBUTING.md`). Evidence: CI green; spike verdict in ADR-0018.

**M1 — Read view.** The full md-render pipeline with source lines, three modes, KaTeX, Shiki, Mermaid, CDN rewriting; the runtime with in-place page replacement and reload-based refresh; the scheme handler with CSP, traversal guard and nonce; isolation, external links, quarantine and trust, "Allow network", file watching. Evidence: snapshots per fixture per mode, JavaScriptCore parity, the security probe in Playwright and in a real `WKWebView`.

**M2 — Source and Split.** Document model with BOM and line endings, CodeMirror with `lineSeparator`, the `WebKitHost` adapter and `EditorBridge`, saving through `NSDocument` with the live pull and the mirror, conflict banner, Split with source-to-read sync, menus. Evidence: `EditorDocumentTests` (every fixture byte-identical through the live editor), `WindowModesTests`.

**M3 — WYSIWYG.** Crepe over the lossless block model (exact, restyled, island), deferred verification, block-splice saving, island cards with in-place editing, mode switching with caret and viewport mapping, the IME guard, the large-document safety net. Evidence: every fixture byte-identical through WYSIWYG in Vitest, Playwright and XCTest; composition tests in Chromium.

Carried over from M0 to M3:

- [ ] Run `docs/IME-CHECKLIST.md` by hand in Source and in WYSIWYG and record it in `docs/CHECKLIST.md` → beta gate (M5b)
- [ ] Table row and column handles (Crepe's table block is off, ADR-0034) → M5a, if A2 is accepted
- [ ] Mermaid preview toggle in WYSIWYG code blocks → M6
- [ ] Product owner: accept or reject the "restyled" tier (A5)

## MH — Hardening (new; before the beta)

Every task that fixes a defect starts with the test that fails without the fix.

### MH-A — Data safety

- [ ] MH-1 · Dirty state (C1, C2; ADR-0045). XCTest: edit, wait for autosave, edit, close, reopen: the second edit is on disk. Then: every content change marks the document edited; `provideContent` returns a token; every successful write, autosave included, emits `documentSaved` with it; the editor moves its baseline only for its own token
- [ ] MH-2 · Splice gaps (C9; ADR-0052). Vitest: delete a heading between two paragraphs; turn a heading into a paragraph before a single-newline gap; `# H` directly above `---`. Then the neighbour-pair rule and the parse-after-splice check
- [ ] MH-3 · A block pending verification is verified before its first edit (C10)
- [ ] MH-4 · Mode switches are queued, read the text after every await, and `ensureWysiwyg` has an in-flight guard (C11). Playwright: type in Source during the first WYSIWYG load
- [ ] MH-5 · The source embedding escapes every `<` in both embedders; a fixture with `<!--` followed by `<script` (C3)
- [ ] MH-6 · Property-based round-trip tests with `fast-check` (MIT): generated and mutated Markdown through decode, load, splice and edit-one-block
- [ ] MH-7 · New and untitled documents open in Edit; native honours `editor.defaultMode` (C4)
- [ ] MH-8 · `FileWatcher` backs off and watches the parent folder after a delete; the window's closures stop retaining the document; `receivedMethods` is bounded; `setMode` has a timeout; one percent-decoding (C5 to C8)
- [ ] MH-9 · The IME guard asserts that it found the input-rule plugin (C15); the safety net also applies to a mode request and a reload, counts bytes correctly and reads the setting (C14)
- [ ] MH-10 · A fixture for block HTML inside a blockquote and a list item, and a decision on how it is shown (C13); table padding and alignment applied from the sniffed style (C12)

### MH-B — Security

- [ ] MH-11 · Egress (S1, S12; ADR-0044 point 1). `img-src`, `media-src` and `font-src` lose `https:` when scripts run and network is not allowed, and always for untrusted documents. **Needs A1**
- [ ] MH-12 · External opens need a real user event recorded natively; script dialogs become a rate-limited sheet (S2, S6)
- [ ] MH-13 · The handler refuses hidden paths, serves an allowlist of types, and serves no sibling files when the folder is the home folder or a volume root; probe lines for JSON import and canvas reads (S3)
- [ ] MH-14 · Quarantine is re-read on every reload from disk and carried to duplicates and untitled copies (S4)
- [ ] MH-15 · App assets on their own origin; a handler instance per webview bound to document and role; the editor's CSP names only the app host (S5; ADR-0046)
- [ ] MH-16 · Island previews in a shadow root; the sanitizer schema tightened; a hostile-markup corpus in the fixtures (S11; ADR-0053)
- [ ] MH-17 · `setSettings` validated natively against the schema (S8); "Allow network" keyed by path and file id until ADR-0041 (S7); test-only quarantine helpers out of the release binary (S10)
- [ ] MH-18 · One golden file for the CSP and one for the source embedding, asserted by the TypeScript and the Swift tests (S9)

### MH-C — Tooling and CI

- [ ] MH-19 · The licence check fails on an error or an empty list, and runs in the macOS job so Swift packages are covered (T4)
- [ ] MH-20 · One version in the root `package.json`, written into `project.yml` and md-render and checked in CI; `CHANGELOG.md` kept from now on (T2; ADR-0047)
- [ ] MH-21 · CI artefacts that exist: Playwright HTML report and `test-results/`, an `xcresult` bundle; `.node-version`; a root `tsconfig.json` covering `e2e/` and the configs; `engines.node` raised to what the scripts need (T6)
- [ ] MH-22 · `InlayCoreTests` on `macos-14` and `macos-15` runners (T3)
- [ ] MH-23 · Dependabot for npm and Actions, CodeQL for JavaScript and Swift, `pnpm audit --prod`, Actions pinned by commit (T5)
- [ ] MH-24 · A separate, serial performance job with stored baselines; wall-clock assertions out of functional tests; fixed sleeps in XCTest replaced by polling
- [ ] MH-25 · Coverage reported (Vitest v8, Xcode), not gated
- [ ] MH-26 · Preview builds get their own output folder or a lock; the Xcode pre-build step checks freshness, not only existence
- [ ] MH-27 · `CODE_OF_CONDUCT.md`, issue and pull-request templates; `FUNDING.yml` after D6
- [x] `SECURITY.md`, `docs/TESTING.md`, `docs/CHECKLIST.md` (this review)

### MH-D — Performance (may trail into 1.1)

- [ ] MH-28 · WYSIWYG work per typing pause: a serialization cache per node, the top block from `posAtCoords`, no quadratic scan (P5)
- [ ] MH-29 · The scheme handler reads off the main thread and answers Range requests; the line count is cached (P3, P4)
- [ ] MH-30 · Read scroll restore re-applies after late layout; the scroll listener is throttled (P6)

**Done when:** every *to prove* in `docs/ARCHITECTURE.md` section 6 has a test; groups A and B are merged; the CI changes of group C are live.

## M4 — Quick Look (branch `m4-quicklook`; Team ID from 4.4)

- [ ] 4.0 · Precedence spike: on the macOS 27.3 beta, does the stub extension still win over the system's Markdown preview? Record the verdict in ADR-0050 before building the tiers
- [ ] 4.1 · JavaScriptCore bundle finalized (polyfills, sync Shiki with a conservative target, KaTeX, inlined theme, size caps, truncation); `RenderEngine.RenderOptions` gains the asset loader
- [ ] 4.2 · Extension: warm `JSContext`; strict decoding like the app; KaTeX fonts and vendored libraries as `cid:` attachments; Tier 1, Tier 2 (scripts setting, Mermaid) and Tier 3 (placeholder); a CSP `<meta>` in every tier
- [ ] 4.3 · Sibling images: try the scoped read-only exception; fall back to a placeholder (ADR-0018)
- [ ] 4.4 · App Group settings (`group.live.inlay`) with the local fallback; the settings toggle
- [ ] 4.5 · Tests: fixture × tier snapshots through `RenderEngine`, a test target for the provider, asset-loader traversal and size caps, the Tier 2 CSP; run on macOS 14 and 15
- [ ] 4.6 · Design: header pills ("SVG rendered", "3 diagrams", "Scripts off"), **Open with Inlay**, the Tier 3 placeholder card (`design/ui/quick-look.html`); the system's share button is left in place
- [ ] 4.7 · First-launch registration and a troubleshooting page (conflicting extensions, `pluginkit`, `mdls`)

If A9 is accepted (parity with paid Quick Look previewers; each needs fixtures, snapshots in all three modes and JavaScriptCore parity):

- [ ] 4.8 · GitHub alerts in md-render: five types, icon and title, light and dark theme CSS; still a blockquote in the syntax tree, so the round-trip suites are unchanged and no fixture gains an island; unknown types render as plain blockquotes. Fixture `github-alerts.md` (all five, nested content, an alert inside a list, CRLF)
- [ ] 4.9 · Emoji shortcodes, render only (`remark-gemoji`, MIT; licence check and notices); not inside code spans, code blocks or raw HTML. Fixture `emoji-shortcodes.md`
- [ ] 4.10 · `RenderMeta.headings` (text, depth, source line, id) and GitHub-style heading ids; Quick Look outline as static HTML and CSS: a column in wide previews, a `<details>` menu in narrow ones, hidden for documents with fewer than three headings. Duplicate and non-Latin headings (Vietnamese, CJK) get stable ids
- [ ] 4.11 · Mermaid in Tier 1: the bundled renderer as a `cid:` attachment admitted by a per-preview CSP nonce; document scripts, inline handlers and network stay blocked; source block on failure; a cap on diagram count and size. Test: a document script beside a Mermaid block does not run in Tier 1

**Done when (brief):** snapshots pass for all tiers; Finder previews work in light and dark within Space-bar latency.

## M5 — Polish and distribution

### M5a — App completeness (branch `m5-app`)

- [ ] `packages/settings-ui` and the Preferences window (General, Appearance, Editing, Security); **Settings…** wired
- [ ] Themes, custom CSS, editor font settings; theme wired from native to both webviews; the Read view theme from the design tokens (680 px measure, 34/22/16 scale, table and figure styles, the `live` pill)
- [ ] HTML export, single file
- [ ] PDF export, paginated; **Print…** and **Page Setup…** on the same path
- [ ] Window chrome: Scripts and Network pills in the toolbar, status bar (words, characters, encoding, line ending, "n of m blocks changed", "Unchanged on disk"), empty state, the quarantine banner as designed
- [ ] About window with the wordmark (bundle Sora under OFL, add it to the licence check and notices); template glyph for toolbar items
- [ ] Help menu: a user guide written in Markdown and opened in Inlay; a welcome document on first launch
- [ ] Accessibility: names and states on the mode control, banners, island cards and task checkboxes; a VoiceOver pass (`docs/CHECKLIST.md` 5.6)
- [ ] `os.Logger` in the shell; a crash handler for the Read pane; window restoration; drag a file onto the window or the Dock icon
- [ ] If A2 is accepted: find (⌘F) in Read and WYSIWYG; table row and column handles; "Open documents in"

### M5b — Distribution (branch `m5-release`; needs signing credentials)

- [ ] A Release configuration in `project.yml`; `release.yml` triggered by a tag (ADR-0047)
- [ ] Developer ID (G2) signing with hardened runtime, notarization, stapling, a signed disk image
- [ ] Sparkle 2 with a beta and a stable appcast; Sparkle covered by the licence check and the notices
- [ ] Download on inlay.live; Homebrew cask
- [ ] The release checklist run on macOS 14 and the current macOS; the IME checklist run and recorded
- [x] App icon set and favicons rendered from `design/icon` (ADR-0019)

**Done when (brief):** exported HTML works standalone; PDF paginates; the notarized disk image installs; a Sparkle update succeeds. **Then:** 0.9 beta to outside testers, and 1.0 when the beta exit in `docs/ROADMAP.md` is met.

## After 1.0 (proposed; scope in `docs/ROADMAP.md`; each needs its own "go")

### M6 — 1.1 Navigate

- [ ] md-render metadata: word and character counts (`headings` and heading ids arrive in 4.10 if A9 is accepted, otherwise here)
- [ ] Outline sidebar with current-heading tracking and a filter; in-document links; status bar counts
- [ ] Incremental refresh of the Read view (ADR-0036); follow mode; jump from Read to Source (ADR-0037)
- [ ] Zoom and column width; front matter as a property table
- [ ] Focus, typewriter and Zen modes; one Escape chain; shortcuts matched by key code
- [ ] Auto-pair, smart punctuation (off by default), spellcheck controls, Vim keys in Source, Writing Tools check
- [ ] Image block in WYSIWYG; Mermaid preview toggle; Peek for script islands
- [ ] `Host.writeAsset`; image paste and drop; HTML paste as Markdown; clean-up for pasted AI output; copy as rich text
- [ ] Alert-type picker in WYSIWYG and emoji autocomplete (rendering arrives in 4.8 and 4.9 if A9 is accepted, otherwise here); highlight and sub/superscript, `\ce{}`; fixtures and parity for each
- [ ] Localization: English and Vietnamese (ADR-0043); opt-in diagnostics (ADR-0042)
- [ ] Editor chrome off Crepe, first pieces (ADR-0035)

**Done when:** typing in Split never redraws an unchanged chart; the outline works in all four modes; every new syntax is in the round-trip and rendering suites.

### M7 — 1.2 Produce, and Inlay Pro (needs D1 to D5)

- [ ] Extension points (ADR-0039); `Host` requests in both directions (ADR-0054)
- [ ] Free: `inlay` command, starter snippets, templates, image and diagram viewer
- [ ] Pro: Present; export suite (PDF with outline and page furniture, frozen HTML, DOCX, chart and diagram images); snippet gallery; batch export and Shortcuts
- [ ] Private Pro repository and build; offline licence (ADR-0040); checkout and licence signing; trial

### M8 — 1.3 Trust (needs A3)

- [ ] Permissions popover; trust by file identity and by folder; managed preferences (ADR-0041)
- [ ] One file-access layer; the sandboxed configuration passes every suite (ADR-0038)
- [ ] Mac App Store and Setapp builds; team licences
- [ ] Quick Look extras; legacy encodings and line-ending conversion

### M9 — 2.0 Workspace

- [ ] Folder window, quick open, Changes view, command palette, heading folding, right-to-left text
- [ ] Pro: cross-file search and replace, wikilinks and backlinks (opt-in per folder), Git awareness, more diagram engines

### M10 — 2.x Share and assist (needs A4; Publish behind its gate)

- [ ] Assistant on device or on the user's key; MCP server; Publish only if the gate in `docs/MONETIZATION.md` section 7 is met

### M11 — 3.0 Everywhere

- [ ] Tauri shell for Windows and Linux; iPhone and iPad viewer (own brief)

## Design track

Sources are in `design/`: the artboards in `design/ui/*.html` with screenshots in `design/ui/png/`, the icon masters in `design/icon/`. Tokens: Ink `#141A22`, Paper `#F7F8FA` / `#F4F5F7`, Line `#DDE1E7`, Muted `#5B6673`, Brass `#9A6E1A` (`#E0A83A` on dark), Verdigris `#1F7A7A` (`#5FC9C0` on dark). Brass marks the seam between prose and embedded code; verdigris marks anything live. The Mac app uses the system fonts; Sora, Inter and JetBrains Mono (all OFL) are for the website and the About window.

Done: the canvas and artboards; the app icon and favicons (`pnpm icons`, `pnpm design:render`, ADR-0019); the CodeMirror theme, the Split divider with the sync marker and the pane header (M2); the raw island card and the inline formatting toolbar (M3); the inlay.live landing page (separate repository `inlay-md/inlay.live`, which carries a progress section to keep in step with this file).

Open, now filed under their milestones: the Read view theme, window chrome, quarantine banner, empty state and "n of m blocks changed" (M5a); Quick Look pills and **Open with Inlay** (M4); the About window and template glyph (M5a); the outline sidebar (M6).
