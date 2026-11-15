# Handover: Inlay after the November 2026 review, before MH

Read in this order: `CLAUDE.md` (rules and commands), this file, `docs/PLAN.md` (task lists), then as needed `docs/ARCHITECTURE.md` (how it is built and what the review found), `docs/DECISIONS.md` (ADR-0001 to 0034 in force, 0035 to 0054 proposed) and `docs/BRIEF.md` (the source of truth for v1). The product owner reviews at milestone checkpoints and says "go".

## State on 2026-11-12

- `main` holds M0 to M3 (M3 in #8, 2026-11-06) plus docs and one test fix (#13). CI is green. Local runs: `pnpm check`, `pnpm test` (about 472 unit cases, 80 Playwright runs in Chromium and WebKit with 2 Chromium-only composition tests skipped in WebKit), `pnpm mac:test` (41 XCTest cases).
- A review was done on 2026-11-12: three code audits (Swift shell, web core, tooling and CI) and a market check. **No app code was changed.** It produced or rewrote the documents listed below and a new milestone, **MH — Hardening**, that comes before anything else.
- The architecture stands. Six bounded parts should be re-implemented and three are thinner than the old plan suggested (`docs/ARCHITECTURE.md` section 6.1).
- Nothing has been released. There is no signing, no Sparkle, no release workflow. The Quick Look extension is still the M0 spike stub.

## What to do next

After "go", start **MH-A** in `docs/PLAN.md`. Each task starts with the failing test. The first two matter most:

1. **MH-1, dirty state (C1).** The editor tells native about dirty state only when it flips, and its baseline moves only on `documentSaved`, which autosave does not emit. After the first autosave, later edits may never be announced to `NSDocument`. Write the XCTest in `InlayTests/EditorDocumentTests.swift` first: edit, wait for autosave, edit again, close, reopen. Code: `packages/editor/src/page.ts` (`onDirty`, the `documentSaved` handler, `provideContent`), `packages/host-api/src/webkit.ts`, `MarkdownDocument.swift` (`editorSetDirty`, `editorContentChanged`, the save completion), `DocumentWindowController.wire`. Design: ADR-0045.
2. **MH-2, splice gaps (C9).** A kept block is written with its original leading gap even when its predecessor changed. Write the Vitest cases in `packages/editor/src/wysiwyg/loader.test.ts` first: delete a heading between two paragraphs where the heading is followed by a single newline; expect two paragraphs after the splice. Code: `packages/editor/src/wysiwyg/splice.ts` (pass 2, the `gap` expression). Design: ADR-0052.

Then the rest of MH-A, then MH-B (security). MH-11 changes the remote-images default and needs the product owner's answer to A1 first; MH-12 to MH-18 do not. M4 can start in parallel once the Team ID arrives, beginning with the precedence spike on macOS 27.3 (ADR-0050).

## Open for the product owner

- Amendments A1 to A8 in `docs/BRIEF-AMENDMENTS.md`. A1 (remote images) blocks a security fix; A5 (the "restyled" tier) has been open since M3.
- Business decisions D1 to D11 in `docs/MONETIZATION.md`.
- The Apple Team ID; a Developer ID certificate from the **G2** authority (the original one expires on 2027-02-01); later the Sparkle signing key.
- Enable GitHub private vulnerability reporting on the repository, which `SECURITY.md` points reporters to.
- Run `docs/IME-CHECKLIST.md` by hand once a signed build exists. It has never been run.

## The documents

| File | What it holds |
| --- | --- |
| `docs/BRIEF.md` | The product owner's brief. Never edited; changes are proposed in `docs/BRIEF-AMENDMENTS.md` |
| `docs/PRODUCT.md` | What Inlay is, for whom, how it behaves, editions, budgets |
| `docs/ARCHITECTURE.md` | The build, the flows, the trust boundaries, the November 2026 review and the proposed changes |
| `docs/ROADMAP.md` | Releases 0.9 to 3.0 with scope, sizes and exit criteria |
| `docs/MONETIZATION.md` | Business model, prices, licence mechanics, go to market, scenarios, risks |
| `docs/PLAN.md` | Task lists and state |
| `docs/TESTING.md` | What the tests protect, the inventory, how to run and extend, known gaps |
| `docs/CHECKLIST.md` | Gates before commit, push, milestone and release; manual checks; the run log |
| `docs/IME-CHECKLIST.md` | The input-method rows |
| `docs/DECISIONS.md` | The ADR log |
| `SECURITY.md` | How to report a vulnerability and what counts |

## How the code fits together

**md-render** (`packages/md-render/src`). `index.ts` is `render(markdown, options)`: remark to rehype with `data-source-line`, modes `full`, `static` and `sanitized`, KaTeX, the Mermaid hand-off, pluggable Shiki (`highlight.ts`; `highlight-bundled.ts` is the 40-grammar set bundled into the JavaScriptCore build), CDN rewriting (`vendor.ts`, ADR-0008), asset inlining, `THEME_CSS`. `sanitize.ts` is the schema. `packages/md-render/scripts/build-jsc.ts` builds the IIFE (`InlayRender` global); `jsc-bundle.test.ts` proves parity in a bare `vm` context.

**read-view** (`packages/read-view/src`). `runtime.ts` reads the embedded `#inlay-source` JSON, renders, replaces the page with `document.open/write/close`, exposes `window.inlayReadView` (`refresh`, `getPosition`, `scrollToSourceLine`, `setTheme`, `stats`, `ready`), then highlights lazily (`highlight-lazy.ts`, `languages.ts`) and runs Mermaid (`mermaid-lazy.ts`). `page.ts` composes the page, `scroll.ts` maps scroll to source lines, `csp.ts` mirrors the Swift CSP builder. `fixtures-plugin.ts` gives the dev and preview servers `/__fixtures/view/<file>.md` under the app's CSP (`?quarantined=1`, `?allowNetwork=1`, `?theme=dark`). `packages/read-view/scripts/copy-vendor.ts` fills `public/vendor/` before dev and build.

**host-api** (`packages/host-api/src`). `host.ts` is the contract; `mock.ts` the browser and test host; `webkit.ts` the only file that touches `window.webkit` (`{method, args}` to the `inlay` reply handler; `window.inlayWebKitHost.requestContent()` and `emit()` for native to web); `origin.ts` is `isTrustedOrigin`; `settings.ts` the schema.

**editor** (`packages/editor/src`). `document.ts` (decode and encode), `line-map.ts`, `source-state.ts` (`lineSeparator`, `getText` is `sliceDoc`, offset helpers), `setup.ts`, `theme.ts`, `front-matter.ts`, `editor.ts` (`createSourceEditor`). `page.ts` hosts both editors in one page, owns `savedText`, hands the live text across on a mode switch and applies the safety net. Under `wysiwyg/`: `schema.ts` (Inlay nodes and the removal of Milkdown's rewriting plugins), `transformer.ts` (mdast to and from ProseMirror per block), `style.ts` (sniffing and variants), `loader.ts` (exact, restyled, island; deferred `verify`), `splice.ts` (the live document back to text), `island-view.ts`, `in-place.ts`, `math-view.ts`, `list-item-view.ts`, `lazy.ts`, `composition.ts` (the IME guard), `editor.ts` (`createWysiwygEditor`).

**Swift** (`apps/macos/Inlay/Sources`). `MarkdownDocument` (bytes, BOM, quarantine, trust and network state, the live pull at the save entry points, the mirror, conflict state, `FileWatcher`), `DocumentWindowController` (`ViewMode`, the split-view panes, Split sync, banners, toolbar), `PaneChrome`, `ReadWebView` (isolation, navigation policy, popup refusal), `EditorWebView` and `EditorBridge` (the one reply handler, a unit-testable `handle`), `MDViewSchemeHandler` (routes, CSP, nonce, traversal through `InlayCore.PathGuard`), `MDViewRegistry`, `TrustStore`, `SettingsStore`, `MainMenu`. `apps/macos/InlayCore` has `RenderEngine` (a warm `JSContext`) and `PathGuard`. `apps/macos/InlayQuickLook/Sources/PreviewProvider.swift` is the spike.

**Tests.** The inventory is in `docs/TESTING.md` section 3.

## Gotchas

### Tooling
- pnpm 12 rejects packages published in roughly the last day and needs `allowBuilds` in `pnpm-workspace.yaml` for packages with install scripts (esbuild is listed). Pin a slightly older version when a fresh release is rejected; do not add `minimumReleaseAgeExclude`.
- `pnpm licenses list` needs `-r` to see workspace packages.
- Biome 2.6 uses `linter.rules.preset`. Markdown, YAML and fixtures are excluded. `pnpm exec biome check --write .` before committing; `--unsafe` applies the info-level fixes.
- TypeScript 7 (native) has no compiler API. `allowImportingTsExtensions` is on, packages are consumed as source through `exports`, and every package must export `./package.json`.
- CI's macOS runner is `macos-26` with Xcode 26.3; do not use Xcode-27-only APIs. CI uses Node 22; the local toolchain has been Node 26.
- Never run two web builds at once: Playwright's web servers and `scripts/build-web.sh` both write `packages/*/dist`. Do not run `pnpm mac:test` in the background while running Playwright.
- XcodeGen must be re-run after adding a Swift file (`pnpm mac:generate`).
- In zsh, `=====` in an `echo` is a `=command` expansion; use `---`.
- Commits: `git commit -s`, Conventional Commits, never red, bodies not hard-wrapped. GPG signing is configured for this git user.

### Web core
- JavaScriptCore has no `URL`, `document`, `TextEncoder` or timers. The parity test's bare context catches a dependency on them.
- `String.prototype.replace` with a replacement string interprets `$$`, `` $` `` and `$'`. Use a replacer function for anything that comes from a document, in code and in test expectations.
- A `\n` to EOL replace must leave existing `\r\n` alone (`/\r\n|\n/g`), or CRLF code blocks gain `\r\r\n`.
- CodeMirror: `state.doc.toString()` joins with `\n`; use `state.sliceDoc()`. Editor offsets count each line break as one position whatever its length (`offsetToStringIndex`).
- Milkdown's `text` stringify handler returns text ending in whitespace unescaped; `style.ts` supplies its own. Its listener plugin serializes the whole document on state init; Crepe's list item and table block are a Vue app per node. All removed or replaced (ADR-0033, ADR-0034).
- `remark-inline-links` drops reference definitions; Crepe's LaTeX feature turns `$$` math into a fence; its image block rewrites alt text. All removed (ADR-0032).
- The IME guard finds Milkdown's input-rule plugin by a private key string (C15). After a Milkdown update, check that it still matches.

### Swift and WebKit
- Foundation's `URL.path` drops a trailing slash. Route on `MDViewSchemeHandler.routePath(of:)`, never `url.path`.
- Never `await` inside `NSDocument.save(to:ofType:for:completionHandler:)` and call `super` later; it deadlocks in NSDocument's file-access queue. Pull the live text in the action methods before calling `super` (ADR-0030).
- `withThrowingTaskGroup` waits for every child, so a timeout built on it hangs when the loser never finishes. `MarkdownDocument.withTimeout` races with a continuation.
- Swift 6 with main-actor default isolation: NSDocument's `read(from:)`, `data(ofType:)` and class properties are nonisolated in the SDK, so overrides are `nonisolated` and use `MainActor.assumeIsolated`.
- `NSFilePresenter` never reports uncoordinated writes; the vnode watcher is required (ADR-0024).
- WKWebView refuses script-initiated `window.open` by itself when `javaScriptCanOpenWindowsAutomatically` is false; the UI delegate only sees user-initiated popups.
- Do not put an `NSSplitView` into the window's vertical `NSStackView`; it gets its fitting width. The window pins `NSSplitViewController.view` with constraints.
- A hidden `WKWebView` throttles timers to once a second. Chunked work that must finish while hidden runs in one go when `document.hidden`.
- Split sync race, fixed in M3: a line sent before `window.inlayReadView` exists is parked in `window.inlayPendingSourceLine`, and an explicit request beats the saved position.

### Tests
- XCTest windows whose webviews do timed work belong on screen (`orderFrontRegardless`); otherwise both pages are "hidden" and throttled, and Split tests fail at random.
- `xcodebuild test` output through a pipe is buffered; a hung test shows nothing. `sample <pid>` on the test host shows where it waits; `CGWindowListCopyWindowInfo` lists its windows.
- Playwright locators wait for pending navigations; a form submission blocked by CSP leaves Chromium "navigating" forever. The probe test polls with `page.evaluate`.
- In headless Playwright on macOS the End key does not move the caret in a contenteditable; place the caret through the ProseMirror view.
- Performance readings double under parallel workers or a concurrent `xcodebuild`; the 10k test takes the best of three.

### Quick Look
- On this Mac QLMarkdown (`org.sbarex.QLMarkdown.QLExtension`) owns Markdown previews. Pause it with `pluginkit -e ignore -i …` to test Inlay's, re-enable with `-e use`.
- `qlmanage -p` does not show a window from a non-interactive shell and `qlmanage -p -o` crashes; verify in Finder with Space.
- macOS 27.3 (beta in November 2026) renders basic Markdown in Quick Look itself. Whether a third-party extension still takes precedence is unknown; task 4.0 finds out.

## Running and verifying

```bash
pnpm install
```

```bash
pnpm check
```

```bash
pnpm test
```

```bash
pnpm mac:test
```

`pnpm dev` serves the Read view with a fixture picker at `http://localhost:5173/__inlay/`; `pnpm dev:editor` serves the editor page. The macOS build needs the web bundles first; `pnpm mac:build` and `pnpm mac:test` build them. The generated `apps/macos/Inlay.xcodeproj` is not in Git; edit `apps/macos/project.yml`.

To look at the real app: `pnpm mac:build`, then `open apps/macos/DerivedData/Build/Products/Debug/Inlay.app <file>`. `screencapture -l <windowId>` captures one window; never capture the whole screen.

Workflow that has worked: one branch per milestone, small vertical slices each committed green with the PLAN box ticked and an ADR for anything non-obvious, a pull request to `main` at the end, merged after "go". Before every push: the `caveman-review` and `security-review` skills, then `pnpm check` and `pnpm test` again.

## History

| Date | What |
| --- | --- |
| 2026-11-05 | M0 scaffold on `main`; brand and design artboards (#2); licensing decisions (#5) |
| 2026-11-05 to 06 | M1 Read view (#3); M2 Source and Split (#6); M3 WYSIWYG (#8) |
| 2026-11-06 | Pre-push review rule (#9); handover and progress docs (#10, #11); roadmap draft (#12) |
| 2026-11-10 | Split test fix: the test window is shown so WebKit does not throttle it (#13) |
| 2026-11-12 | Review: product, architecture, roadmap, monetization, testing and checklist documents; ADR-0035 to 0054 proposed; MH added to the plan |
