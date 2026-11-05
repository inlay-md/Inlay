# Bootstrap brief: Inlay, a macOS-first Markdown editor that fully renders embedded SVG/HTML/CSS/JS

Project identity (ask me for any still unfilled before Phase B):
- App name: Inlay
- Website: inlay.live
- GitHub repo: inlay-md/inlay (if there is no remote, ask before creating one)
- Bundle IDs:
  - App: live.inlay.Inlay
  - Quick Look extension: live.inlay.Inlay.QuickLook
  - App Group: group.live.inlay
- npm scope (if publishing packages): @inlay-md
- License: Apache-2.0, copyright holder: Tran Minh Cuong and the Inlay contributors
- Apple Team ID: not needed until M4 (App Group) / M5 (signing); ask me then

Licensing setup (do in M0): Apache-2.0 LICENSE + NOTICE; SPDX headers
(`SPDX-License-Identifier: Apache-2.0`) in source files; DCO sign-off
required on commits; TRADEMARKS.md stating forks must rename; generated
THIRD_PARTY_NOTICES (npm + Swift packages + bundled fonts) shown in the
app's About → Acknowledgements; a CI license check that fails on any
GPL/AGPL/LGPL dependency.

## How we work
I'm the product owner; you're the lead engineer. I prefer vibe coding: you plan, choose implementation details, build, test and keep going. I review at milestone checkpoints.

**Phase A: plan (read-only, no file writes).** Read this brief and reply with:
- Milestones (refine the ones below), each with tasks and acceptance criteria
- Risks and how you'll de-risk them early
- Assumptions you've made
Ask questions only if they truly block planning; otherwise pick a sensible default and list it under Assumptions.

**Phase B: after I approve.**
1. Save this brief verbatim as `docs/BRIEF.md`. It's the source of truth; propose changes to me instead of editing it.
2. Create `CLAUDE.md` (under ~80 lines): repo map, build/test commands, and the non-negotiable rules from this brief.
3. Create `docs/PLAN.md` (milestones and tasks as checkboxes) and `docs/DECISIONS.md` (short ADR-style entries).
4. Execute milestone by milestone.

**Rules while executing**
- Work in small vertical slices. Commit after each green step (Conventional Commits). Never commit with a failing build or tests.
- Verify your own work: build with `xcodebuild`, run the tests, add tests for what you build. Don't report something done without running it.
- Keep `docs/PLAN.md` current so a fresh session can resume from it. Log non-obvious choices in `docs/DECISIONS.md` (2–5 lines each).
- Decide routine things yourself. Stop and ask only for:
  - credentials or signing
  - product decisions not covered here
  - anything that contradicts this brief
  - a dependency that isn't MIT/BSD/Apache-2.0/ISC
  - destructive git operations
- You may install dev tools (Homebrew, npm: xcodegen, pnpm, etc.); tell me what you installed.
- If the same approach fails twice, step back and re-plan instead of pushing through.
- At the end of each milestone: a short summary, what's left, and exact steps for me to verify by hand. Then wait for my "go".

## Product requirements (priority order)
1. **macOS first.** Native Mac app, targeting macOS 14+.
2. **Full rendering of embedded content.** SVG and raw HTML, including CSS and JavaScript (charts, interactive widgets), render fully in the Read view. Document-level `<style>` and `<script>` behave as on a web page.
3. **WYSIWYG as the primary editing mode.** Content that can't be edited losslessly in WYSIWYG becomes a "raw island" with its own in-place source editor. Full Source mode and Split mode (Source beside the live Read view) also exist.
4. **Quick Look extension for .md files,** in tiers:
   - (a) SVG renders
   - (b) HTML/CSS/JS renders, with scripts opt-in
   - (c) static fallback
5. **Later, not v1:** Windows/Linux via a Tauri shell reusing the web core. Design for this now; don't build it.

Also required:
- GFM (tables, task lists, footnotes), front matter, KaTeX math, Mermaid, syntax highlighting
- Local images relative to the file, light/dark themes, HTML/PDF export
- Correct IME input in both WYSIWYG and Source (Vietnamese Telex/VNI, CJK)
- Opening a 10k-line file feels instant

**The file on disk is sacred.** Opening and saving without edits must produce a byte-identical file; editing one block changes only that block's bytes.

Non-goals for v1: sync/cloud, plugin system, AI features, collaboration, Mac App Store, Windows/Linux builds.

## Architecture (decided; log any proposed deviation in DECISIONS.md and ask me first)
A native macOS shell (Swift, AppKit, NSDocument-based) hosting a TypeScript web core in WKWebViews. One Markdown parser (unified/remark) for every surface.

```
packages/md-render     unified/remark → rehype → HTML; used by Read view, Quick Look, export
packages/editor        Milkdown Crepe (WYSIWYG) + raw islands + CodeMirror 6 (Source mode)
packages/read-view     standalone Read view page, loaded by document ID
packages/host-api      TS Host interface + mock implementation (browser dev + tests)
packages/settings-ui   settings UI (web, so it ports)
apps/macos             XcodeGen project.yml → App + Quick Look extension + shared Swift package
fixtures/              golden Markdown corpus (round-trip + rendering)
docs/                  BRIEF.md, PLAN.md, DECISIONS.md
```

**Tooling:** pnpm workspace, TypeScript strict, Vite (app bundles), esbuild (JavaScriptCore bundle), Vitest, Playwright (Chromium + WebKit), XcodeGen (never hand-edit `.pbxproj`), XCTest, GitHub Actions (macOS runner: Xcode build + tests; Linux runner: web tests).

**Libraries:** unified, remark-parse, remark-gfm, remark-math, remark-frontmatter, remark-rehype (`allowDangerousHtml`), rehype-raw, rehype-sanitize, KaTeX, Mermaid (lazy-loaded), Shiki (lazy grammars), Milkdown + `@milkdown/crepe`, CodeMirror 6; Sparkle for updates (M5).

**Licenses:** dependencies must be MIT/BSD/Apache-2.0/ISC. GPL/AGPL projects are reference only; never copy their code.

**Reference projects (study, don't fork):**
- MarkEdit (MIT): Swift shell wrapping a TypeScript/CodeMirror core
- QLMarkdown (GPL-3): Quick Look for Markdown; read only
- MDHero (MIT): Tauri app whose Quick Look extension shares its renderer
- Glim: Quick Look rendering via JavaScriptCore

### Host boundary (portability)
- All web↔native calls go through the TypeScript `Host` interface in `packages/host-api`: `readFile`, `saveDocument`, `resolveAssetURL`, `openExternal`, `getSettings`/`setSettings`, `onFileChanged`, `setDirty`, and similar. The macOS adapter uses `WKScriptMessageHandlerWithReply`; no web code outside the adapter touches `window.webkit`.
- Never hardcode custom-scheme URLs in web code; get base URLs from Host. Tauri on Windows maps custom schemes to `http(s)://<scheme>.localhost`.
- Keep the Swift shell thin: document lifecycle, file I/O, file watching, URL scheme handlers, menus, webview configuration, Quick Look. Everything else lives in the web core.
- The web core runs in a plain browser against the mock Host (`pnpm dev`) and passes Playwright in Chromium and WebKit. No WebKit-only APIs.

### md-render
- **Pipeline:** remark-parse + gfm + math + frontmatter → remark-rehype `{allowDangerousHtml}` → rehype-raw → highlighting/math → HTML.
- **Source mapping:** emit `data-source-line` (start/end) on block elements, for scroll sync and cursor mapping.
- **Two builds:**
  - browser ESM
  - JavaScriptCore: one IIFE with no DOM APIs, exposing `render(markdown, options) → { html, meta }`
- **Options:** `mode` (`"full" | "sanitized" | "static"`), `allowScripts`, `theme`, `inlineAssets` (for Quick Look).
- **Mermaid** renders client-side (needs a DOM). In static mode, output the source as a code block or a placeholder.

### Read view (live rendering of everything)
- **Loading:** a separate WKWebView per document window, loading the read-view page through a custom URL scheme handler (e.g. `mdview://`). It serves only the rendered page and files under the document's folder, with a path-traversal guard.
- **Page-level execution:** the document renders as a real page; its `<style>` and `<script>` run at page level, with no iframes.
- **Isolation:**
  - non-persistent `WKWebsiteDataStore`
  - NO script message handlers on this webview, so document JS cannot reach native code
  - Content Security Policy (response header or meta tag): inline scripts allowed, `connect-src 'none'` by default, plus a per-document "Allow network" toggle
  - external links open in the default browser
- **Quarantined files:** files with the `com.apple.quarantine` attribute open with scripts disabled and a "Trust this document" banner.
- **Refresh:** re-render on edits (debounced) and on external file changes, preserving scroll position.
- Script loading: CSP allows inline scripts plus an allowlist of CDNs
  (cdnjs.cloudflare.com, cdn.jsdelivr.net, unpkg.com); connect-src 'none'
  by default. md-render rewrites known library URLs (Chart.js, ECharts,
  D3, Mermaid, KaTeX) to bundled local copies so documents render offline.
- Any postMessage origin checks must handle custom-scheme origins
  (e.g. mdview://), not just https.

### WYSIWYG editor and raw islands
- **Engine:** Milkdown Crepe in its own WKWebView, with the Host bridge. Our schema and plugins live in `packages/editor` so Milkdown can later be replaced by raw ProseMirror.
- **Island detection:** on load, check each top-level block. If parse→serialize through the editor does not reproduce the original bytes, the block becomes a raw island: an atom node storing the exact source slice (via remark position offsets).
- **Typical islands:**
  - raw HTML, including `<svg>`, `<style>` and `<script>`
  - HTML comments and front matter
  - custom directives/containers
  - tables with HTML in cells
  - anything else that fails the round-trip check

  Inline HTML inside a paragraph becomes an inline island, not a whole-paragraph island.
- **Island display in the editor:**
  - SVG and script-free HTML render statically after sanitizing (rehype-sanitize)
  - script-bearing islands show a compact card with a button/shortcut to open the Read view
  - `<style>` islands show a card and are not applied in the editor in v1
- **Island editing:** click or Enter opens an inline CodeMirror editor in place; edits replace only that island's source.
- **Modes:** WYSIWYG (default), Source (whole-document CodeMirror), Split (Source + live Read view), Read. Switching modes preserves cursor and scroll position via source-line mapping.
- **Saving:** re-serialize only changed blocks and splice them into the original text by source offsets; untouched blocks and all islands keep their exact bytes. Always read content from the live editor at save time, never from a cached copy.

### Document handling (Swift)
- **NSDocument subclass:** open, save, autosave-in-place, Versions, revert, window tabs, Open Recent, unsaved-changes prompts.
- **External changes:** watch the file; if there are unsaved edits, show a conflict banner instead of overwriting.
- **File types:** UTIs `net.daringfireball.markdown` and `public.markdown` where defined; extensions `.md` and `.markdown`.

### Quick Look extension
- **Mechanics:** `QLPreviewingController` with `QLIsDataBasedPreview = YES`, returning HTML via `QLPreviewReply`. Do not use WKWebView inside the extension; the Quick Look sandbox won't run its web process.
- **Rendering:** run the md-render JavaScriptCore bundle in JavaScriptCore.
- **Tier 1 (always on):**
  - sanitized inline SVG
  - local images/SVGs inlined as data URIs (the extension can't load local files at display time)
  - KaTeX pre-rendered to HTML
  - CSS theme
- **Tier 2 (setting "Run scripts in Quick Look", default off):** raw HTML and document scripts included; Mermaid runs; CSP with `connect-src 'none'`.
- **Tier 3 (scripts off):** static HTML/CSS; script blocks replaced by an "Interactive content: open in Inlay" placeholder.
- **Settings:** shared with the app via an App Group (needs my Team ID; use a local fallback until then).

## Milestones (refine in your plan)
- **M0 Scaffold:** repo layout, pnpm workspace, XcodeGen project building an empty document-based app, Host interface + mock, CI, CLAUDE.md and docs.
  - Done when `pnpm test` and the Xcode tests pass locally and in CI.
- **M1 Read view:** open a .md file and render it in the isolated Read view: SVG, HTML/CSS/JS (fixtures with Chart.js, ECharts and D3 examples plus an interactive widget), KaTeX, Mermaid, code highlighting, local images, light/dark, file watching.
  - Done when fixtures render correctly in Playwright (Chromium + WebKit) and in the app.
  - Tests prove document JS cannot reach native code or the network.
- **M2 Source + Split:** CodeMirror Source mode, Split with scroll sync, saving through NSDocument.
  - Done when open→save is byte-identical for every fixture.
- **M3 WYSIWYG:** Crepe, raw islands, block-splice saving, mode switching with position mapping, IME correctness.
  - Done when the byte-identical invariant holds for every fixture.
  - Editing one block changes only that block's bytes (tested).
  - Islands are editable in place.
- **M4 Quick Look:** tiers 1–3 plus settings.
  - Done when HTML snapshot tests of the JavaScriptCore bundle pass across the fixture corpus.
  - Previews work in Finder.
- **M5 Polish & distribution:** HTML/PDF export, themes, preferences, Sparkle updates, Developer ID signing + notarization (I'll provide credentials).

## Fixtures (create in M0, keep growing)
- **Markdown structure:** GFM features, nested lists, tables (alignment, HTML in cells), front matter, footnotes, reference links, HTML comments.
- **Rendered content:** math, Mermaid, inline `<svg>`, SVG via `<img>`, HTML blocks with `<style>`, HTML with `<script>` drawing a chart, an interactive widget (buttons/sliders).
- **Text edge cases:** mixed line endings, trailing whitespace, Vietnamese and CJK text.
- **Performance:** one very large file.

Every fixture is part of the byte-identical round-trip test and the rendering tests.
