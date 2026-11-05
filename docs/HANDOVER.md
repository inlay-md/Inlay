# Handover: Inlay after M2 (Source + Split), before M3

Read in this order: `CLAUDE.md` (rules and commands), `docs/PLAN.md` (progress and the M3 task list), `docs/DECISIONS.md` (ADR-0001…0031), then `docs/BRIEF.md` when a requirement needs checking. The Phase A plan details (acceptance criteria, risks) are summarized in PLAN.md; the product owner reviews at milestone checkpoints and says "go".

## State on 2026-11-06 (M2 on branch `m2-source-split`, PR open)

- M2 adds `packages/editor` (document model, CodeMirror Source mode page), the `WebKitHost` adapter, the Swift `EditorBridge`/`EditorWebView`, saving through the real NSDocument, the conflict banner and Split mode. Architecture: ADR-0028 (mixed EOL), ADR-0029 (editor page + bridge protocol), ADR-0030 (save entry points, mirror, conflicts), ADR-0031 (modes, Split sync).
- Tests: `pnpm test:unit` (405), `pnpm test:e2e` (56 across Chromium + WebKit; `e2e/editor.spec.ts` runs against a second preview server on port 4174), `pnpm mac:test` (38 XCTest cases incl. `EditorDocumentTests`, `WindowModesTests`).
- Manual: `docs/IME-CHECKLIST.md` has not been run yet on a release build.

## Gotchas learned in M2

- Foundation's `URL.path` drops a trailing slash: `mdview://x/__inlay/editor/` became `/__inlay/editor` and fell through to the asset route. Route on `MDViewSchemeHandler.routePath(of:)` (URLComponents), never `url.path`.
- Never `await` inside `NSDocument.save(to:ofType:for:completionHandler:)` and call `super` later: NSDocument runs it inside its file-access queue and the deferred `super` deadlocks (autosave, Duplicate). Pull the live text in the action methods (`save(_:)`, `duplicate(_:)`, `canClose…`) before calling super; `save(to:)` stays synchronous.
- `withThrowingTaskGroup` waits for every child on exit, so a "timeout" built on it hangs when the losing child never finishes (a bridge call to a dead web process). `MarkdownDocument.withTimeout` races with a continuation + `ResumeOnce`.
- CodeMirror: `state.doc.toString()` joins with "\n"; use `state.sliceDoc()` to get the document's own line separator. Editor offsets count each line break as 1 regardless of separator length (`offsetToStringIndex`).
- XCTest + WKWebView: hidden webviews load fine; `xcodebuild test` output through a pipe is buffered, so a hung test shows nothing until it finishes — `sample <pid>` on the test host shows where it waits, `CGWindowListCopyWindowInfo` lists its windows (screencapture of test-host windows is refused).
- XcodeGen must be re-run after adding a Swift file (`pnpm mac:generate`), or the build fails with "cannot find X in scope".

## State on 2026-11-05 (M1 merged)

- `main` holds M0 and M1 (#3, squash-merged; five slices: md-render pipeline, Read view runtime, lazy Shiki/KaTeX/Mermaid, rendered-content fixtures with offline CDN rewriting, Swift trust/network/file watching).
- No license decisions are pending: Unlicense is on the allowlist (ADR-0026) and `elkjs`/EPL-2.0 is an approved per-package exception for the vendored Mermaid bundle (ADR-0027). `pnpm licenses:check` prints both as notes.
- Local toolchain: Node 26, pnpm 12.16, Xcode 27.2, XcodeGen 2.46, Playwright Chromium + WebKit installed.
- Open PRs: none expected once #5 (licensing + this handover) is merged. CI on `main` is green (#4 fixed the 10k-line Vitest timeout).
- M2 (Source + Split) starts on branch `m2-source-split` after the product owner's "go"; the task list is in `docs/PLAN.md`, the architecture in ADR-0003 (byte preservation), ADR-0005 (save pulls live content) and ADR-0010 (source→read sync only).

## How M1 fits together

- `packages/md-render/src/index.ts` — `render(markdown, options)`: remark → rehype pipeline with `data-source-line`, modes `full | static | sanitized`, KaTeX, Mermaid hand-off, pluggable Shiki (`highlight.ts`; `highlight-bundled.ts` is the 40-grammar set statically bundled into the JSC build), CDN rewriting (`vendor.ts`, ADR-0008), asset inlining, `THEME_CSS`. Snapshots per fixture per mode in `src/__snapshots__/`; `jsc-bundle.test.ts` proves browser/JSC parity in a bare VM context (no DOM, no `URL`).
- `packages/read-view/src/runtime.ts` — reads the embedded `#inlay-source` JSON, renders, replaces the page with `document.open/write/close` (ADR-0001/0022), exposes `window.inlayReadView` (`refresh`, `getPosition`, `scrollToSourceLine`, `setTheme`, `stats`, `ready`), then lazily highlights (`highlight-lazy.ts`, `languages.ts`) and runs Mermaid (`mermaid-lazy.ts`). `page.ts` composes the page; `scroll.ts` maps scroll ↔ source lines; `csp.ts` mirrors the Swift CSP builder.
- `packages/read-view/fixtures-plugin.ts` — dev/preview routes: `/__fixtures/view/<file>.md` is the shell with the fixture embedded under the app's CSP (`?quarantined=1`, `?allowNetwork=1`, `?theme=dark`); other paths serve document-folder files behind a traversal guard. `scripts/copy-vendor.ts` fills `public/vendor/` (gitignored) before dev/build.
- `apps/macos/Inlay/Sources`: `MarkdownDocument` (quarantine value, trust/network state, `FileWatcher` + `presentedItemDidChange` → `reloadIfChangedOnDisk`), `DocumentWindowController` (native trust banner, View-menu actions), `ReadWebView` (navigation `policy(for:)`, refresh/theme/position helpers, popup refusal), `TrustStore`, `FileWatcher`, `MDViewSchemeHandler` (per-response nonce).
- Tests: `pnpm test:unit` (326), `pnpm test:e2e` (44 across Chromium + WebKit: `e2e/read-view.spec.ts`, `e2e/rendered-content.spec.ts`), `pnpm mac:test` (XCTest: scheme handler, documents, Read view in a real WKWebView incl. the security probe, trust/network/watching, InlayCore).

## Gotchas learned in M1

- `pnpm licenses list` needs `-r` to see workspace packages' dependencies; M0's check scanned only the root.
- JavaScriptCore has no `URL`, `document`, `TextEncoder` or timers: the JSC parity test runs the IIFE in a bare `vm` context and caught the vendor rewriter depending on `URL`.
- `String.prototype.replace` with a replacement *string* interprets `$$`, `` $` `` and `$'`: embed JSON (or anything from a document) with a replacer function.
- Playwright locators wait for pending navigations; a form submission that CSP blocks leaves Chromium's frame "navigating" forever, so the security probe test polls with `page.evaluate` instead.
- WKWebView refuses script-initiated `window.open` by itself when `javaScriptCanOpenWindowsAutomatically` is false; the UI delegate only sees user-initiated popups.
- `NSFilePresenter` never reports uncoordinated writes; the vnode `DispatchSource` watcher is required (ADR-0024).
- Biome treats `useLiteralKeys`/`noUselessStringRaw` as infos; run `pnpm exec biome check --write --unsafe .` to apply them.

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

## M2 entry points

- The brand PR (#2) added a design section to `docs/PLAN.md` with per-milestone UI tasks (window chrome, CodeMirror theme, Split divider); pick up the M1/M2-tagged ones while building M2 rather than as a separate pass.
- Workflow that worked in M1: one branch per milestone, small vertical slices each committed green (`pnpm check`, `pnpm test`, `pnpm mac:test`), PLAN checkboxes ticked and an ADR per non-obvious choice in the same commit, PR to `main` at the end, product owner merges (squash) after "go". Run `pnpm mac:test` in the background while continuing web work; never run two web builds at once (Playwright's web server and `scripts/build-web.sh` both write `packages/read-view/dist`).
- Verify in the real app with `pnpm mac:build` and `open apps/macos/DerivedData/Build/Products/Debug/Inlay.app <file>` (or the default DerivedData path when built from Xcode); `screencapture -l <windowId>` captures a single Inlay window (list ids with a few lines of Swift over `CGWindowListCopyWindowInfo`), never the whole screen.

- Document model and CodeMirror live in a new `packages/editor`; `MockHost.provideContent`/`saveDocument` already model the save path (ADR-0005). The Read view's `inlayReadView.scrollToSourceLine` / `getPosition` are the Split-mode sync hooks (source → read only, ADR-0010).
- The editor webview gets the `WKScriptMessageHandlerWithReply` bridge (`WebKitHost` adapter in `packages/host-api`); the Read webview must keep having none.
- `MarkdownDocument.reloadIfChangedOnDisk` is where the unsaved-edits conflict banner goes; `data(ofType:)` must start pulling live content from the editor (ADR-0005).
- Refresh on edits: `ReadWebView.refreshDocument()` reloads via the runtime; if reload latency is too high for Split mode, revisit ADR-0022 (in-place re-render).

## Gotchas learned in M0

- pnpm 12 enforces a minimum release age (packages published < ~24 h are rejected) and requires `allowBuilds` in `pnpm-workspace.yaml` for packages with install scripts (esbuild is listed). Pin a slightly older version when a fresh release is rejected; do not add `minimumReleaseAgeExclude`.
- Biome 2.6: use `linter.rules.preset`, not `recommended`; Markdown, YAML and fixtures are excluded from Biome. Run `pnpm exec biome check --write .` before committing.
- TypeScript 7 (native) has no compiler API; `allowImportingTsExtensions` is on, workspace packages are consumed as source via `exports` → `./src/index.ts`, and every package must export `./package.json`.
- Swift 6 with `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` on the app target: NSDocument's `read(from:)`, `data(ofType:)` and the class vars are nonisolated in the SDK, so overrides are `nonisolated` and use `MainActor.assumeIsolated`. The test target is `nonisolated` with `@MainActor` test methods; avoid `setUp` touching main-actor state.
- Quick Look on this Mac: QLMarkdown (`org.sbarex.QLMarkdown.QLExtension`) owns Markdown previews; pause it with `pluginkit -e ignore -i …` to test ours, re-enable with `-e use`. `qlmanage -p` does not show a window from a non-interactive shell and `qlmanage -p -o` crashes; verify in Finder with Space.
- `screencapture` works for reading on-screen results; sending keystrokes via `osascript` needs Accessibility permission the Claude session may not have.
- CI macOS runner is `macos-26` with Xcode 26.3; do not use Xcode-27-only APIs.
- Commits: `git commit -s`, Conventional Commits, never red. GPG signing is configured for this git user.
