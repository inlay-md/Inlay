# Handover: Inlay after M3 (WYSIWYG), before M4

Read in this order: `CLAUDE.md` (rules and commands), `docs/PLAN.md` (progress and the M4 task list), `docs/DECISIONS.md` (ADR-0001…0034), then `docs/BRIEF.md` when a requirement needs checking. The Phase A plan details (acceptance criteria, risks) are summarized in PLAN.md; the product owner reviews at milestone checkpoints and says "go".

## State on 2026-11-06 (M3 merged, M4 next)

- `main` holds M0–M3 (#8, squash-merged, CI green after three CI-only fixes: 60 s timeouts for the 10k-line Vitest cases, a 2 s WYSIWYG open budget on GitHub's Linux WebKit, and a real Split-sync race fixed in the Read view runtime). Local runs: `pnpm check`, `pnpm test` (472 unit, 80 Playwright in Chromium + WebKit, 2 Chromium-only composition tests skipped in WebKit), `pnpm mac:test` (41 XCTest cases) all green.
- M4 (Quick Look) starts on branch `m4-quicklook` after the product owner's "go"; it needs the Team ID for the App Group (`group.live.inlay`) and the extension's signing. Architecture: ADR-0006 (JavaScriptCore bundle constraints), ADR-0016 (Quick Look caps and truncation), ADR-0017/0018 (spike verdict: JS runs, sibling files unreadable, `cid:` attachments work), ADR-0020/0021 (vendored bundles, md-render output contract). `packages/md-render/scripts/build-jsc.ts` builds the IIFE; `apps/macos/InlayQuickLook/Sources/PreviewProvider.swift` is still the M0 stub; `InlayCore.RenderEngine` holds the warm `JSContext`.
- Open for the product owner: the "restyled" tier (ADR-0032) reads the brief's round-trip rule as mdast equality for blocks whose bytes differ only in formatting (hand-padded tables, trimmed trailing whitespace, escapes); unchanged blocks still save verbatim, an edited restyled block takes remark's canonical form. Crepe's table block feature is off for performance (ADR-0034); table row/column handles are a follow-up. The Source-mode IME checklist and the new WYSIWYG section of `docs/IME-CHECKLIST.md` have not been run by hand.
- M4 (Quick Look) needs the Team ID; its task list is in `docs/PLAN.md`.

## How M3 fits together

- `packages/editor/src/page.ts` — one page, two editors (`ModeEditor` in `types.ts`): `createSourceEditor` (`editor.ts`, CodeMirror) and `createWysiwygEditor` (`wysiwyg/editor.ts`, Crepe, loaded on demand). The page owns `savedText`, hands the live text across on `modeRequested`/`setMode`, maps the caret by UTF-16 index (`getCaretIndex`/`setCaretIndex`; CodeMirror through `offsetToStringIndex`) and the viewport by source line, and applies the safety net (ADR-0033, ADR-0034).
- `wysiwyg/schema.ts` — Inlay nodes (`raw_island`, `raw_inline_island`, `math_block`, `math_inline`, `definition`, `link_reference`, `image_reference`), the hardbreak/link marker plugin, and `applyInlayPlugins` which removes Milkdown's rewriting plugins. `wysiwyg/transformer.ts` — mdast ↔ ProseMirror per block with cached remark-stringify processors per style. `wysiwyg/style.ts` — style sniffing and variants. `wysiwyg/loader.ts` — exact / restyled / island with deferred verification (`verify(budgetMs)`, swaps for late mismatches). `wysiwyg/splice.ts` — the live document back to text (identity, then structural equality, then positional replacement), segments for position mapping.
- Node views: `island-view.ts` (cards, previews through md-render `sanitized`, in-place editor), `in-place.ts` (shared CodeMirror editor writing the node attribute; Enter on a selected atom opens it), `math-view.ts` (KaTeX), `list-item-view.ts` (plain DOM), `lazy.ts` (viewport-gated rendering). `composition.ts` guards Milkdown's input rules.
- Swift: `ViewMode.wysiwyg` in `DocumentWindowController` (segment 1, ⌘1), `EditorWebView.requestEditorMode`, `MarkdownDocument.editorStartMode` → `DocumentInfo.mode`.
- Tests: `packages/editor/src/wysiwyg/loader.test.ts` (jsdom, headless Milkdown: byte identity, islands per manifest, edits, 10k load), `e2e/wysiwyg.spec.ts`, `e2e/composition.spec.ts`, XCTest `EditorDocumentTests` (WYSIWYG byte identity and edit) and `WindowModesTests`.

## Gotchas learned in M3

- Milkdown's `text` stringify handler returns any text ending in whitespace unescaped (meant for whitespace-only runs); it lost `\$5`. `style.ts` supplies its own handler.
- Milkdown's listener plugin serializes the whole document on state init (200 ms for 10k lines) and debounces by 200 ms; Crepe's list item and table block are a Vue app per node. Removed / replaced for the 10k budget (ADR-0033, ADR-0034).
- `remark-inline-links` (in Milkdown's commonmark) resolves and drops reference definitions; Crepe's LaTeX feature turns `$$` math into a `LaTeX` fence; its image block rewrites alt text. All removed (ADR-0032).
- A `\n` → EOL replace must leave existing `\r\n` alone (`/\r\n|\n/g`), or CRLF code blocks gain `\r\r\n`.
- JavaScript `replace` with a replacement *string* turns `$$` into `$`; Playwright expectations built with `.replace` need a replacer function (the same gotcha as M1, now in e2e).
- In headless Playwright on macOS the End key does not move the caret in a contenteditable (macOS semantics); tests place the caret through the ProseMirror view.
- A hidden WKWebView (XCTest host) throttles timers to once a second; chunked work that must finish while hidden (block verification) runs in one go when `document.hidden`.
- XCTest windows whose webviews must keep up with timing-sensitive work (Split re-render and sync) belong on screen (`orderFrontRegardless`). A never-shown window leaves both pages `document.visibilityState` "hidden" and WebKit throttles them; on a busy Mac the old `testSplitReRendersEditsAndFollowsTheEditor` failed 2 of 10 runs (the 10k-line re-render missed its 10 s window), and CI failed it at random at different steps, docs-only pushes included; raising timeouts did not help. With the window shown, 10 of 10 passed under the same load with both pages "visible". `WindowModesTests` reports both pages' visibility when the re-render or the follow fails.
- Perf readings under parallel Playwright workers or a concurrent `xcodebuild` can double; the 10k test takes the best of three opens.
- Split sync race (found by CI, fixed in M3): after an edit the Read view reloads and restores the position it saved before the refresh; native's `scrollToSourceLine` from `onPageLoaded` could land before `window.inlayReadView` existed (dropped) or before that restore (overridden). The runtime now parks a line sent early in `window.inlayPendingSourceLine` and lets an explicit request beat the saved position.
- The Biome/zsh trap of the session: `=====` in an `echo` is a zsh `=command` expansion; use `---`.

## State on 2026-11-06 (M2 merged, M3 next)

- `main` holds M0, M1 and M2 (#6, squash-merged; six slices: document model + mixed-EOL prototype, Source mode page + WebKit adapter, editor webview + bridge + NSDocument saving, window modes + Split sync + conflict banner, split-view layout fix, window-test polling fix). CI on `main` is green.
- Open PRs: none expected once this handover PR is merged. No product decisions or license exceptions are pending.
- M3 (WYSIWYG) starts on branch `m3-wysiwyg` after the product owner's "go"; the task list is in `docs/PLAN.md`, the architecture in ADR-0004 (block model, per-block style sniffing, raw islands) and ADR-0028 (CodeMirror offsets ≠ UTF-16 indices in CRLF files: use `offsetToStringIndex` for block splicing). Milkdown's remark must be pinned to md-render's versions.
- `docs/IME-CHECKLIST.md` has not been run by hand yet; record the result in the M2 section of PLAN when it passes.

## How M2 fits together

- `packages/editor/src/document.ts` (decode/encode, source line count), `line-map.ts` (editor ↔ source lines), `source-state.ts` (`createSourceState` with `lineSeparator`, `getText` = `sliceDoc`, offset helpers), `setup.ts` + `theme.ts` + `front-matter.ts` (CodeMirror extensions), `editor.ts` (`createSourceEditor`: dirty tracking vs `savedDoc`, debounced `notifyContentChanged`/`reportPosition`, `fileChanged`/`documentSaved` handling, `window.inlayEditor`), `main.ts` (WebKit host or MockHost with `?fixture=`), `fixtures-plugin.ts` (dev routes). Architecture: ADR-0028 (mixed EOL), ADR-0029 (editor page + bridge protocol).
- `packages/host-api/src/webkit.ts` — `WebKitHost`: `{method, args}` to the `inlay` reply handler; `window.inlayWebKitHost.requestContent()/emit()` for native → web. `Host.reportPosition` and the `documentSaved` event are new.
- `apps/macos/Inlay/Sources`: `EditorWebView` (bridge, navigation policy, `requestContent`, `emit`, `position`), `EditorBridge` (dispatch, unit-testable `handle`), `SettingsStore`, `MarkdownDocument` (live pulls in `save(_:)`/`saveAs`/`saveTo`/`duplicate(_:)`/`canClose`, synchronous `save(to:)`, mirror, `hasConflict`, ADR-0030), `DocumentWindowController` (`ViewMode`, `NSSplitViewController` panes, Split sync, banners, toolbar, menu validation, ADR-0031), `PaneChrome` (`PaneView`, `PaneHeaderView`, `SyncSplitView`, `ConflictBannerView`), `MainMenu` (Duplicate / Rename / Move To / Revert To, View ⌘2/⌘3/⌘4). The scheme handler serves `/__inlay/editor/` with the strict editor CSP and routes on `routePath(of:)`.
- Tests: `pnpm test:unit` (405), `pnpm test:e2e` (56 across Chromium + WebKit; `e2e/editor.spec.ts` runs against a second preview server on port 4174), `pnpm mac:test` (38 XCTest cases incl. `EditorDocumentTests`, `WindowModesTests`).
- Manual: `docs/IME-CHECKLIST.md` has not been run yet on a release build.

## Gotchas learned in M2

- Foundation's `URL.path` drops a trailing slash: `mdview://x/__inlay/editor/` became `/__inlay/editor` and fell through to the asset route. Route on `MDViewSchemeHandler.routePath(of:)` (URLComponents), never `url.path`.
- Never `await` inside `NSDocument.save(to:ofType:for:completionHandler:)` and call `super` later: NSDocument runs it inside its file-access queue and the deferred `super` deadlocks (autosave, Duplicate). Pull the live text in the action methods (`save(_:)`, `duplicate(_:)`, `canClose…`) before calling super; `save(to:)` stays synchronous.
- `withThrowingTaskGroup` waits for every child on exit, so a "timeout" built on it hangs when the losing child never finishes (a bridge call to a dead web process). `MarkdownDocument.withTimeout` races with a continuation + `ResumeOnce`.
- CodeMirror: `state.doc.toString()` joins with "\n"; use `state.sliceDoc()` to get the document's own line separator. Editor offsets count each line break as 1 regardless of separator length (`offsetToStringIndex`).
- XCTest + WKWebView: hidden webviews load fine; `xcodebuild test` output through a pipe is buffered, so a hung test shows nothing until it finishes — `sample <pid>` on the test host shows where it waits, `CGWindowListCopyWindowInfo` lists its windows (screencapture of test-host windows is refused).
- Don't put an `NSSplitView` (or a view with a fitting size) into the window's vertical `NSStackView` and expect `alignment = .width` to stretch it: it got its fitting width and sat at the trailing edge. The document window pins `NSSplitViewController.view` with explicit constraints; only the banners live in a stack view.
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
