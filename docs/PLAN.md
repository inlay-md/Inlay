# Inlay — plan and progress

Source of truth for scope: `docs/BRIEF.md`. Decisions: `docs/DECISIONS.md`. The approved Phase A plan (milestone acceptance criteria, risks, assumptions) is summarized here; tick boxes as work lands. A fresh session should read `docs/HANDOVER.md` first, then this file and `CLAUDE.md`.

**Status:** M0–M3 merged to `main` (M3 in #8, 2026-11-06). Next: M4 after "go" (needs the Team ID); the IME checklists (Source and WYSIWYG) are still to be run by hand.

## M0 — Scaffold (lands on `main`)
- [x] Rename branch to `main`; install XcodeGen (Homebrew)
- [x] `docs/BRIEF.md` verbatim (with the 2026-11-05 Read view amendment), `CLAUDE.md`, `docs/PLAN.md`, `docs/DECISIONS.md`
- [ ] Licensing: `LICENSE` (Apache-2.0), `NOTICE`, `TRADEMARKS.md`, `CONTRIBUTING.md` (DCO), `.gitignore`, `.editorconfig`; first commit
- [x] pnpm workspace: root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` (strict), Biome, Vitest workspace, Playwright config
- [x] `packages/host-api`: `Host` interface, settings schema, `MockHost`, event channel, `isTrustedOrigin`, unit tests
- [x] Fixtures v1 (Markdown only) + `manifest.json` + manifest/trait tests: GFM, nested lists, tables (alignment, HTML in cells), front matter, footnotes, reference links, HTML comments, directives, mixed EOL, trailing whitespace, Vietnamese/CJK/emoji, BOM, undecodable bytes, 10k-line perf file
- [x] `packages/md-render` stub with both builds (Vite ESM + esbuild IIFE exposing `render`)
- [x] `packages/read-view` hello shell; `pnpm dev` with fixture picker; Playwright smoke (Chromium + WebKit)
- [x] `apps/macos/project.yml`: `Inlay` app (NSDocument, `live.inlay.Inlay`, UTIs, window with WKWebView loading hello page via `mdview://` handler), `InlayQuickLook` stub (`live.inlay.Inlay.QuickLook`), `InlayCore` package (`RenderEngine` over JSC, `PathGuard`), `InlayTests`, `InlayCoreTests`; build phase bundles web output
- [x] JSC toolchain smoke: IIFE stub → resource → `JSContext` in XCTest
- [x] Scripts: `check-licenses`, `gen-third-party-notices` (+ freshness check), `check-dco`, `check-spdx`, `build-web`; `THIRD_PARTY_NOTICES.md` bundled and shown in About → Acknowledgements
- [x] CI: Linux job (lint, typecheck, Vitest, Playwright, licenses, notices, DCO, SPDX); macOS job (`macos-26`, Xcode 26.3, web build, xcodegen, `xcodebuild test`)
- [x] Quick Look spike: JS runs, sibling files not readable under files.user-selected.read-only, cid attachments work (ADR-0018)
- [x] Push `main`; CI green (run 41993673157)
- [x] M0 summary + manual verification steps; wait for "go"

Done when: `pnpm test` and `xcodebuild test` pass locally and in CI; app opens a `.md` into a window; license/notices/DCO checks run in CI; spike verdict recorded.

## M1 — Read view (branch `m1-read-view`)
- [x] md-render complete: pipeline, `data-source-line` (incl. raw HTML injection), Shiki (lazy browser / sync JSC), KaTeX, Mermaid hand-off, known-library URL rewriting (`vendorBaseURL`, major-version policy), modes full/sanitized/static, `allowScripts`, `inlineAssets` + `assetLoader`, theme CSS, sanitize schema keeping SVG; snapshots per fixture per mode; JSC parity test (ADR-0020, ADR-0021)
- [x] Vendor bundle (Chart.js, ECharts, D3, Mermaid, KaTeX + woff2 fonts) copied at build time with version manifest (`packages/read-view/scripts/copy-vendor.ts`); license check + notices (Unlicense allowed, ADR-0026; elkjs/EPL-2.0 approved per package, ADR-0027)
- [x] read-view runtime: embedded source → render → `document.open/write/close`; ordered scripts; scroll save/restore; `scrollToSourceLine`; `getPosition`; theme; dev view route with the app CSP (ADR-0022)
- [x] read-view: lazy Shiki grammars (40 ids, one chunk each), Mermaid lazy-load with theme re-render (ADR-0023), KaTeX CSS + woff2 fonts from the vendor bundle
- [x] Swift: `mdview://` handler (routes, MIME, traversal guard, CSP header with CDN allowlist, per-response nonce), read WKWebView isolation, external links, `.md` links open as documents, quarantine → static + native trust banner (trust store keyed by path + xattr), "Allow network" toggle (per file, remembered), file change → debounced refresh via NSFilePresenter + vnode watcher (ADR-0024, ADR-0025)
- [x] `isTrustedOrigin` used by all message listeners (none exist yet; a Vitest audit enforces it); runtime audited for `https:`/scheme assumptions by the same test
- [x] Fixtures: Chart.js/ECharts/D3 via real CDN URLs (+ older-major pin), widget, inline svg, svg img, style block, math, Mermaid, highlighting, local images, web-page-semantics, non-rewritable CDN script, fetch toggle, `../assets` (blocked), security probe, KaTeX auto-render from CDN
- [x] Tests: Vitest snapshots + rewriter table + JSC parity; Playwright (route-intercepted CDNs, probe, dark mode, perf budget, scroll restore); XCTest app tests (probe via real scheme handler, traversal 403, navigation policy, uncoordinated/atomic refresh, quarantine → trust, network toggle, vendored chart, lazy grammars)
- Done when: fixtures render in Playwright (Chromium + WebKit) and in the app; probe proves no native/network reach per ADR-0007; charts render offline; quarantine flow works without modifying the file.

## M2 — Source + Split (branch `m2-source-split`)
- [x] Document model in `packages/editor`: decode (`bom`, dominant `eol`), `getText()` byte identity for every fixture; mixed-EOL prototype decided first (`lineSeparator` = dominant EOL, ADR-0028); editor↔source line map
- [x] CodeMirror Source mode page: explicit setup (special chars, search, history, Markdown + nested HTML/code languages, front-matter parser), brand theme, `window.inlayEditor` API (content, positions, dirty), dev server with fixtures, Playwright in Chromium + WebKit (ADR-0029)
- [x] `WebKitHost` adapter (`{method,args}` reply protocol, `inlayWebKitHost` callbacks, `documentSaved`/`reportPosition`; audited as the only `window.webkit` user)
- [x] Swift bridge (`EditorBridge`, the one `WKScriptMessageHandlerWithReply`, on `EditorWebView` only; the Read webview still has none, asserted); `/__inlay/editor/` route with a strict CSP in the scheme handler; `SettingsStore`
- [x] NSDocument: save override pulling live content with the 3 s mirror fallback and warning, `autosavesInPlace`, revert and Versions through `fileChanged`, dirty tracking from the editor, own writes recognised, conflict state with reload / keep (ADR-0030); XCTest: every fixture byte-identical through the live editor, an edit changes only its bytes, autosave / Save As / revert, conflict
- [x] Window: native conflict banner (Reload from Disk / Keep Editing), mirror-save and editor-crash alerts; File menu with Duplicate / Save As (alternate) / Rename / Move To / Revert To → Browse All Versions; window tabs (`tabbingMode .preferred`) and Open Recent (NSDocumentController)
- [x] Split mode: editor + Read panes in an `NSSplitView`, debounced re-render through the mirror pull + `refreshDocument()`, source→read scroll sync from `reportPosition`, mode switching carrying the source line both ways (ADR-0031); XCTest for panes, carry-over, Split re-render + follow, conflict banner
- [x] Menus and shortcuts: View → Source ⌘2 / Split ⌘3 / Read ⌘4 (WYSIWYG ⌘1 disabled until M3), toolbar segmented control, Refresh ⌘R
- Done when: open→save byte-identical for every fixture via real NSDocument (XCTest); edits confined; all save paths covered; conflict banner; 10k lines < 1 s; manual IME checklist in Source.
- Status 2026-11-06: byte identity for every fixture through the live editor (`EditorDocumentTests`), edits confined to their bytes, Save / Save As / Save To / autosave / Duplicate / revert covered, conflict banner tested end to end (`WindowModesTests`), 10k lines open in < 1 s (Playwright `editor.spec.ts`) and switch modes in XCTest, `docs/IME-CHECKLIST.md` written (to be run by hand on the release build; not yet recorded as passed).

## M3 — WYSIWYG (branch `m3-wysiwyg`)
- [x] 3a · Crepe and kit added with remark pinned to md-render's versions (pnpm overrides); Inlay schema: `raw_island`/`raw_inline_island`, `math_block`/`math_inline`, `definition`/`link_reference`/`image_reference`, hardbreak and link markers; Milkdown's rewriting plugins removed (ADR-0032)
- [x] 3a · Loader with per-block round-trip + style sniffing (`exact` / `restyled` / `island`, deferred verification) and block-splice save over the live document; Vitest: every fixture splices back byte for byte, zero islands on pure-GFM fixtures, one edit changes one block's bytes, CRLF edits keep CRLF (ADR-0032)
- [x] 3a · Editor page hosts Source and WYSIWYG in one webview; `DocumentInfo.mode` start hint + `modeRequested` switches with caret/viewport carried over; `provideContent` from the splice; island ratio in `stats.wysiwyg`; plain-DOM list items, no listener plugin (ADR-0033); Playwright: every fixture byte-identical in WYSIWYG, zero islands on pure GFM, one-block edits, restyled blocks keep bytes until edited, mode switch keeps caret line and dirty state, 10k lines < 1 s in Chromium and WebKit
- [x] 3a · Island cards: brass seam, kind + line count + "kept byte for byte" header, sanitized static preview for SVG/HTML (md-render `sanitized`, never scripts), Source/Preview toggle, script/style cards with "Open in Read view", bundled-library notice, front matter / comment / directive cards; inline island chips; KaTeX math blocks and inline math; previews render lazily near the viewport
- [x] 3b · In-place island editing: click or Enter opens a CodeMirror editor inside the card (HTML / YAML / Markdown / LaTeX), every change replaces only the island's source, Escape re-selects the block; Playwright: island and inline-island edits change only their bytes, math edits too
- [ ] 3b: table row/column handles (Crepe's table feature is off: a Vue app per table cost 1.4 ms each; plain prosemirror-tables editing stays)
- [x] 3b · Mode switching mapping: caret by UTF-16 index, viewport by source line, between WYSIWYG, Source and Read (ADR-0033); Swift `ViewMode.wysiwyg`, View → WYSIWYG ⌘1, toolbar segment, `editorStartMode` → `DocumentInfo.mode`; XCTest: every fixture byte-identical through WYSIWYG via the real NSDocument, a WYSIWYG edit changes only its block, window mode switches the page
- [x] 3b · IME: input rules never run during or at the end of a composition (ADR-0034); Playwright CDP composition tests in Chromium (Telex-style, CJK, composed Markdown syntax, undo) in both modes; `docs/IME-CHECKLIST.md` WYSIWYG section for the release build (to be run by hand)
- [x] 3b · 10k-line performance: deferred block verification, plain-DOM list items, no listener plugin, lazy KaTeX and island previews, Crepe table block off; Source safety net above 50k lines / 5 MB with a one-click switch (ADR-0034)
- [ ] 3b: optional Mermaid preview toggle in code blocks (Crepe's `renderPreview` hook; vendored Mermaid bundle)
- Done when: byte-identical for every fixture via WYSIWYG; editing one block changes only its range (automated); islands editable in place; zero islands on pure-GFM fixtures; mode switches keep caret/viewport; composition tests pass; 10k lines < 1 s.
- Status 2026-11-06: every fixture byte-identical through WYSIWYG via the real NSDocument (`EditorDocumentTests`) and in Playwright; one-block edits confined (Vitest, Playwright, XCTest); islands and inline islands editable in place with edits confined to their bytes; zero islands on every fixture the manifest marks pure GFM; mode switches keep caret line and viewport (Playwright, XCTest); CDP composition tests pass in Chromium (WebKit: manual checklist); 10k lines open in well under 1 s in Chromium and WebKit (best of three readings).

## M4 — Quick Look (branch `m4-quicklook`; needs Team ID)
- [ ] JSC bundle finalization (polyfills, sync Shiki with conservative target, KaTeX, inlined theme, `assetLoader`, size caps, truncation)
- [ ] Extension: warm `JSContext`; KaTeX fonts and vendored libs as `cid:` attachments; Tier 1 / Tier 2 (scripts setting, Mermaid, CSP) / Tier 3 placeholder
- [ ] App Group settings (`group.live.inlay`) with local fallback; settings-ui toggle
- [ ] Tests: fixture × tier snapshots, parity, asset-loader traversal/size caps, Tier 2 CSP
- Done when: snapshots pass for all tiers; Finder previews work in light/dark within Space-bar latency.

## M5 — Polish & distribution (branch `m5-release`; needs signing credentials)
- [ ] HTML export (single file) and paginated PDF export
- [ ] Themes + custom CSS; editor font settings
- [ ] Preferences window (settings-ui)
- [ ] Sparkle 2 + appcast; release workflow (sign, notarize, staple, DMG, GitHub Release)
- [x] App icon set and favicons rendered from `design/icon` (ADR-0020)
- [ ] About → Acknowledgements polish, first-run defaults
- Done when: exported HTML works standalone; PDF paginates; notarized DMG installs; Sparkle update succeeds.

## Design — applying the brand and UI (cross-cutting; sources in `design/`)
The brand and UI were designed on the "Inlay Brand & UI" canvas (private link in `design/README.md`); the artboards are exported to `design/ui/*.html` with screenshots in `design/ui/png/`. Tokens: Ink `#141A22`, Paper `#F7F8FA`/`#F4F5F7`, Line `#DDE1E7`, Muted `#5B6673`, Brass `#9A6E1A` (`#E0A83A` on dark), Verdigris `#1F7A7A` (`#5FC9C0` on dark). Brass marks the seam between prose and embedded code; verdigris marks anything live. The Mac app uses the system font (SF Pro, SF Mono); Sora, Inter and JetBrains Mono (all OFL) are for the website and the About window only.
- [x] Canvas: app icon, logo and wordmark, colour and type, illustration set, app windows (Read, WYSIWYG with raw island, Split on a quarantined file), Quick Look panel, inlay.live landing page
- [x] App icon in the Xcode asset catalog; web favicons; `pnpm icons` and `pnpm design:render` (ADR-0020)
- [ ] M1 · Read view theme CSS from the tokens: 680 px measure, type scale (34/22/16), table and figure styles, `live` pill on script-rendered figures; light and dark variants (`design/ui/app-read-view.html`)
- [ ] M1 · Window chrome: unified toolbar with the Read / Edit / Source / Split segmented control (done in M2; Edit disabled until M3), "Scripts on/off" pill, "Network off/on" toggle, Share; status bar with word and character count, encoding and EOL, sandbox note and "Unchanged on disk"
- [ ] M1 · Quarantine banner ("This file was downloaded…", **Trust this document**) styled as in `design/ui/app-split-mode.html`; "Scripts off · quarantined" pill state
- [ ] M1 · Empty state ("Drop a Markdown file, or ⌘O") with the illustration from `design/ui/illustrations.html`
- [x] M2 · CodeMirror theme from the palette (brass for Markdown syntax, verdigris for tags, `#B4532A` for strings) in `packages/editor/src/theme.ts`; Split divider with the verdigris scroll-sync marker (`SyncSplitView`); cursor position in the native pane header (`PaneHeaderView`)
- [x] M3 · Raw island card: 3 px brass left seam, header with kind, line count and "kept byte for byte", Source / Preview toggle, bundled-library notice (`wysiwyg/theme.css`, `island-view.ts`); inline formatting toolbar (Crepe Toolbar feature)
- [ ] M3 · "Block n of m changed · bytes" status item (needs the native status bar from the M1 chrome task; `stats.wysiwyg` and the splice's `changed` count are ready)
- [ ] M4 · Quick Look header pills ("SVG rendered", "Scripts off") and **Open with Inlay** button; script placeholder card for Tier 3 (`design/ui/quick-look.html`)
- [ ] M5 · About window with the wordmark in Sora (bundle the OFL font, add it to the license check and notices); template glyph (`design/icon/inlay-template.svg`) for menu bar and toolbar items; outline sidebar if it survives M1 usage
- [x] Website · inlay.live landing page built from `design/ui/website.html` as a static Astro site with self-hosted fonts and the brand favicons, in the separate `inlay-md/inlay.live` repository (deployed on Vercel from its `main`); it carries a progress section to keep in step with this file

