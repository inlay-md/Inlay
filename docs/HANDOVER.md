# Handover: resuming Inlay at the start of M1

Read in this order: `CLAUDE.md` (rules and commands), `docs/PLAN.md` (progress and M1 task list), `docs/DECISIONS.md` (ADR-0001…0018), then `docs/BRIEF.md` when a requirement needs checking. The Phase A plan details (acceptance criteria, risks) are summarized in PLAN.md; the product owner reviews at milestone checkpoints and says "go".

## State on 2026-11-05

- `main` is at the end of M0, pushed, CI green (Linux web job + macOS Xcode job). No branches besides `main`.
- Local toolchain: Node 26, pnpm 12.16, Xcode 27.2, XcodeGen 2.46, Playwright Chromium + WebKit installed.
- M1 starts on branch `m1-read-view` and ends in a PR to `main` after the product owner's "go".

## How to run everything

```
pnpm install
pnpm check            # Biome, typecheck, SPDX headers, license policy, notices freshness
pnpm test             # Vitest (94 tests) + Playwright (Chromium + WebKit, 8 tests)
pnpm dev              # Read view with fixture picker at http://localhost:5173/__inlay/
pnpm mac:test         # build web bundles, xcodegen, xcodebuild test (18 XCTest cases)
```

The macOS build needs `scripts/build-web.sh` first (it copies `packages/read-view/dist` and `md-render.jsc.js` into the targets); `pnpm mac:build` / `pnpm mac:test` do that. The generated `apps/macos/Inlay.xcodeproj` is gitignored; always edit `apps/macos/project.yml`.

## Where things are

- `packages/host-api/src/host.ts` — the `Host` contract (`openDocument`, `readFile`, `resolveAssetURL`, `provideContent`, events). `MockHost` in `mock.ts`, `isTrustedOrigin` in `origin.ts`.
- `packages/md-render/src/index.ts` — **M0 stub**; M1 replaces `render()` with the unified pipeline. `scripts/build-jsc.ts` builds the JSC IIFE (`InlayRender` global); `src/jsc-bundle.test.ts` proves it needs no DOM.
- `packages/read-view/src/main.ts` — shell: embedded `#inlay-source` JSON in the app, fixture picker + MockHost in the browser. Vite `base` is `/__inlay/`. `fixtures-plugin.ts` serves `/__fixtures/` for dev and preview.
- `apps/macos/Inlay/Sources/MDViewSchemeHandler.swift` — `mdview://<docId>/` routes, CSP (ADR-0007), traversal guard via `InlayCore.PathGuard`. `ReadWebView.swift` — the isolated webview. `MarkdownDocument.swift` — NSDocument keeping the on-disk bytes.
- `apps/macos/InlayCore` — `RenderEngine` (warm `JSContext`) and `PathGuard`, with tests.
- `apps/macos/InlayQuickLook/Sources/PreviewProvider.swift` — M0 spike stub; real tiers in M4.
- `fixtures/md/*.md` + `fixtures/manifest.json` — corpus; rendered-content fixtures are added in M1 (`fixtures/md/assets/` holds images).
- `e2e/` — Playwright specs; `scripts/` — policy checks and notices generator.

## M1 slices in the order that de-risks most

1. md-render pipeline (remark-parse + gfm + math + frontmatter → remark-rehype allowDangerousHtml → rehype-raw → rehype-stringify) with `data-source-line`, snapshots per fixture, both builds and the JSC parity test. Add `rehype-raw` position injection (ADR-0011).
2. Read view runtime: embedded source → render → `document.open/write/close` (ADR-0001); verify in WKWebView early (XCTest `ReadWebViewTests` is the harness). Scroll save/restore, theme.
3. Shiki (lazy in browser, `createHighlighterCoreSync` + JavaScript regex engine in the JSC build), KaTeX, Mermaid lazy-load.
4. Known-library URL rewriting with `vendorBaseURL` (ADR-0008) and the vendor copy step in `scripts/build-web.sh`; fixtures with real CDN URLs; Playwright `page.route` to assert no CDN traffic.
5. Swift: quarantine → static + native trust banner (trust store keyed by path + xattr value), "Allow network" toggle, file-change refresh (ADR-0013), `WKUIDelegate` already refuses popups.
6. Security probe fixture + tests in Playwright and XCTest; performance budget on `perf-10k-lines.md`.

Acceptance for M1 is in `docs/PLAN.md`; keep its checkboxes current and add ADRs for non-obvious choices.

## Gotchas learned in M0

- pnpm 12 enforces a minimum release age (packages published < ~24 h are rejected) and requires `allowBuilds` in `pnpm-workspace.yaml` for packages with install scripts (esbuild is listed). Pin a slightly older version when a fresh release is rejected; do not add `minimumReleaseAgeExclude`.
- Biome 2.6: use `linter.rules.preset`, not `recommended`; Markdown, YAML and fixtures are excluded from Biome. Run `pnpm exec biome check --write .` before committing.
- TypeScript 7 (native) has no compiler API; `allowImportingTsExtensions` is on, workspace packages are consumed as source via `exports` → `./src/index.ts`, and every package must export `./package.json`.
- Swift 6 with `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` on the app target: NSDocument's `read(from:)`, `data(ofType:)` and the class vars are nonisolated in the SDK, so overrides are `nonisolated` and use `MainActor.assumeIsolated`. The test target is `nonisolated` with `@MainActor` test methods; avoid `setUp` touching main-actor state.
- Quick Look on this Mac: QLMarkdown (`org.sbarex.QLMarkdown.QLExtension`) owns Markdown previews; pause it with `pluginkit -e ignore -i …` to test ours, re-enable with `-e use`. `qlmanage -p` does not show a window from a non-interactive shell and `qlmanage -p -o` crashes; verify in Finder with Space.
- `screencapture` works for reading on-screen results; sending keystrokes via `osascript` needs Accessibility permission the Claude session may not have.
- CI macOS runner is `macos-26` with Xcode 26.3; do not use Xcode-27-only APIs.
- Commits: `git commit -s`, Conventional Commits, never red. GPG signing is configured for this git user.
