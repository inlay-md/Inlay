# Inlay — guide for Claude Code

Inlay is a macOS-first Markdown editor: a thin Swift/AppKit NSDocument shell hosting a TypeScript web core in WKWebViews. The Read view renders embedded SVG/HTML/CSS/JS fully; WYSIWYG (Milkdown Crepe + raw islands) is the primary editor; CodeMirror 6 provides Source mode; a Quick Look extension renders through a JavaScriptCore bundle.

`docs/BRIEF.md` is the source of truth (never edit it; propose changes to the product owner). `docs/PLAN.md` tracks milestone progress with checkboxes; keep it current. `docs/DECISIONS.md` holds short ADR entries for every non-obvious choice.

## Repo map
- `packages/md-render` — unified/remark → rehype → HTML. Browser ESM build + JavaScriptCore IIFE (`render(markdown, options) → {html, meta}`). Used by Read view, Quick Look, export.
- `packages/editor` — document model (block offsets, splice save), CodeMirror Source mode, Crepe + raw islands, editor page.
- `packages/read-view` — Read view shell page + runtime (render, page replacement, scroll restore, theme, Mermaid lazy-load).
- `packages/host-api` — `Host` interface, settings schema, `MockHost` (browser/tests), `WebKitHost` adapter (the only code touching `window.webkit`), `isTrustedOrigin`.
- `packages/settings-ui` — settings page (web, so it ports).
- `fixtures/` — golden Markdown corpus + `manifest.json`; every fixture is in the round-trip and rendering tests.
- `apps/macos/` — `project.yml` (XcodeGen) → `Inlay` app, `InlayQuickLook` extension, `InlayCore` Swift package, XCTest targets.
- `scripts/` — license check, third-party notices, DCO check, web build, vendor copy, icon rendering.
- `design/` — brand assets: SVG icon masters and rendered web favicons (`design/icon/README.md`).
- `docs/` — BRIEF.md, PLAN.md, DECISIONS.md.

## Commands
- `pnpm install` then `pnpm exec playwright install chromium webkit` (once).
- `pnpm build` — all web bundles into `packages/*/dist` (Vite) and the JSC IIFE (esbuild).
- `pnpm dev` — Read view against `MockHost` with a fixture picker.
- `pnpm test` — `pnpm test:unit` (Vitest) + `pnpm test:e2e` (Playwright, Chromium + WebKit).
- `pnpm check` — Biome lint/format, typecheck, SPDX headers, license check, notices freshness.
- `pnpm notices` — regenerate `THIRD_PARTY_NOTICES.md` after dependency changes.
- `pnpm icons` — re-render the app icon set and web favicons from the SVG masters in `design/icon/` (run after editing them).
- `pnpm mac:generate` — `xcodegen generate` in `apps/macos` (run after editing `project.yml`).
- `pnpm mac:build` / `pnpm mac:test` — `xcodebuild` build / test of scheme `Inlay` (runs `pnpm build` first).
- CI: `.github/workflows/ci.yml` (Linux: web checks + tests; macOS: Xcode build + tests). CI must be green on `main`.

## Non-negotiable rules (from the brief)
- The file on disk is sacred: open→save without edits is byte-identical; editing one block changes only that block's bytes. Islands keep exact source slices. Content is read from the live editor at save time, never a cache (crash fallback mirror only).
- Offsets in web code are UTF-16 string indices (remark positions), never bytes; bytes exist only in Swift and at re-encode.
- One Markdown parser (unified/remark) for every surface; Milkdown's remark is pinned to the same versions.
- Host boundary: all web↔native calls go through `Host` in `packages/host-api`. No `window.webkit` outside the WebKit adapter. Never hardcode custom-scheme URLs; base URLs come from `Host`. No WebKit-only APIs; the web core runs in a plain browser and passes Playwright in Chromium and WebKit.
- Read view webview: non-persistent data store, NO script message handlers, CSP from the scheme handler (inline scripts + CDN allowlist cdnjs/jsdelivr/unpkg, `connect-src 'none'` by default, per-document "Allow network"). Document scripts must never reach native code. Quarantined files open with scripts off.
- postMessage/origin checks must accept custom-scheme origins (`mdview://…`, `http://mdview.localhost`), not just https.
- Known-library CDN URLs (Chart.js, ECharts, D3, Mermaid, KaTeX) are rewritten to bundled copies by md-render so documents render offline.
- Quick Look: data-based `QLPreviewReply` HTML rendered via the JSC bundle; no WKWebView in the extension.
- Dependencies: MIT/BSD/Apache-2.0/ISC only for shipped code; GPL/AGPL/LGPL fail CI anywhere; GPL projects are reference only, never copy code. Ask before adding anything else (OFL is accepted for font files only).
- Swift shell stays thin: document lifecycle, file I/O, watching, scheme handlers, menus, webview config, Quick Look. Everything else lives in the web core.
- XcodeGen owns the project: never hand-edit `.pbxproj`; edit `apps/macos/project.yml`.
- Every source file carries `SPDX-License-Identifier: Apache-2.0`. Commits: Conventional Commits, DCO sign-off (`git commit -s`), never commit with a failing build or tests, small vertical slices.
- Before every `git push`: run the `caveman-review` skill and the `security-review` skill on the pending changes, fix every finding that applies (note in the PR or commit the ones deliberately left), re-run `pnpm check` and `pnpm test`, then push.
- Stop and ask the product owner for: credentials/signing, product decisions not in the brief, contradictions with the brief, non-allowlisted licenses, destructive git operations. If the same approach fails twice, re-plan instead of pushing through.
- End each milestone with a summary, what's left, and manual verification steps; then wait for "go".
