# Inlay — plan and progress

Source of truth for scope: `docs/BRIEF.md`. Decisions: `docs/DECISIONS.md`. The approved Phase A plan (milestone acceptance criteria, risks, assumptions) is summarized here; tick boxes as work lands. A fresh session should read this file first, then `CLAUDE.md`.

**Status:** M0 in progress (started 2026-11-05). Branch `main`.

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
- [ ] CI: Linux job (lint, typecheck, Vitest, Playwright, licenses, notices, DCO, SPDX); macOS job (`macos-26`, Xcode 26.3, web build, xcodegen, `xcodebuild test`)
- [ ] Quick Look spike: script execution, sibling-file read, `cid:` attachment; verdict in DECISIONS.md
- [ ] Push `main`; CI green
- [ ] M0 summary + manual verification steps; wait for "go"

Done when: `pnpm test` and `xcodebuild test` pass locally and in CI; app opens a `.md` into a window; license/notices/DCO checks run in CI; spike verdict recorded.

## M1 — Read view (branch `m1-read-view`)
- [ ] md-render complete: pipeline, `data-source-line` (incl. raw HTML injection), Shiki (lazy browser / sync JSC), KaTeX, Mermaid hand-off, known-library URL rewriting (`vendorBaseURL`, major-version policy), modes full/sanitized/static, `allowScripts`, `inlineAssets` + `assetLoader`, theme CSS, sanitize schema keeping SVG; snapshots per fixture per mode; JSC parity test
- [ ] Vendor bundle (Chart.js, ECharts, D3, Mermaid, KaTeX) copied at build time with version manifest; license check + notices
- [ ] read-view runtime: embedded source → render → `document.open/write/close`; ordered scripts; Mermaid lazy-load; scroll save/restore; `scrollToSourceLine`; `getPosition`; theme
- [ ] Swift: `mdview://` handler (routes, MIME, traversal guard, CSP header with CDN allowlist, nonce), read WKWebView isolation, external links, quarantine → static + native trust banner (trust store), "Allow network" toggle (per file), file change → debounced refresh
- [ ] `isTrustedOrigin` used by all message listeners; runtime audited for `https:` assumptions
- [ ] Fixtures: Chart.js/ECharts/D3 via real CDN URLs (+ older-major pin), widget, inline svg, svg img, style block, math, Mermaid, highlighting, local images, web-page-semantics, non-rewritable CDN script, fetch toggle, `../assets` (blocked), security probe
- [ ] Tests: Vitest snapshots + rewriter table; Playwright (route-intercepted CDNs, probe, dark mode, perf budget); XCTest app tests (probe via real scheme handler, traversal 403, external link, refresh, quarantine)
- Done when: fixtures render in Playwright (Chromium + WebKit) and in the app; probe proves no native/network reach per ADR-0007; charts render offline; quarantine flow works without modifying the file.

## M2 — Source + Split (branch `m2-source-split`)
- [ ] Document model: decode (`bom`, dominant `eol`), `getText()` byte identity; CodeMirror Source mode; mixed-EOL prototype (`lineSeparator` vs per-line EOL table) decided first
- [ ] `WebKitHost` adapter + Swift bridge (`WKScriptMessageHandlerWithReply`)
- [ ] NSDocument: read `Data`, save override pulling live content (+ crash mirror), autosave in place, revert, Versions, Duplicate, tabs, Open Recent, dirty tracking, change detection (NSFilePresenter) → auto-reload / conflict banner
- [ ] Split mode: editor + read webviews, debounced re-render, source→read scroll sync, mode switching with position
- [ ] Menus and shortcuts
- Done when: open→save byte-identical for every fixture via real NSDocument (XCTest); edits confined; all save paths covered; conflict banner; 10k lines < 1 s; manual IME checklist in Source.

## M3 — WYSIWYG (branch `m3-wysiwyg`)
- [ ] 3a: Crepe integration; `rawIsland`/`rawInlineIsland`; loader with per-block round-trip + style sniffing; inline islands; island node views (sanitized static, script card, style card, front matter/comments/directives cards); block-splice save; `onContentRequested`; island ratio metric
- [ ] 3b: in-place island editing; mode switching mapping; IME (input rules paused during composition, CDP tests, manual checklist); 10k-line performance (lazy islands, deferred highlighting, Source safety net above threshold); optional Mermaid preview toggle
- Done when: byte-identical for every fixture via WYSIWYG; editing one block changes only its range (automated); islands editable in place; zero islands on pure-GFM fixtures; mode switches keep caret/viewport; composition tests pass; 10k lines < 1 s.

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
- [ ] About → Acknowledgements polish, app icon, first-run defaults
- Done when: exported HTML works standalone; PDF paginates; notarized DMG installs; Sparkle update succeeds.
