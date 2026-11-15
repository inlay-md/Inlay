# Inlay — testing

How Inlay is tested, what each layer proves, how to run and extend it, and what is not covered yet. The gates around the tests (before a commit, a push, a release) and the checks only a person can do are in `docs/CHECKLIST.md`.

Counts are as of 2026-11-12 (`main` at `50e83ec`); refresh them at the end of each milestone.

## 1. What the tests exist to protect

Every rule in `CLAUDE.md` has at least one test that fails when the rule is broken. A change that weakens one of these tests needs an ADR.

| Rule | Proven by |
| --- | --- |
| Open then save is byte-identical, for every fixture | `packages/editor/src/document.test.ts` (decode and encode), `wysiwyg/loader.test.ts` (splice), `e2e/editor.spec.ts` and `e2e/wysiwyg.spec.ts` (both editors in Chromium and WebKit), `InlayTests/EditorDocumentTests.swift` and `MarkdownDocumentTests.swift` (through the real `NSDocument` and `WKWebView`) |
| Editing one block changes only that block's bytes | `wysiwyg/loader.test.ts`, `e2e/wysiwyg.spec.ts`, `EditorDocumentTests.swift` |
| Line endings and BOM survive edits | `eol-prototype.test.ts`, `document.test.ts`, the CRLF cases in `loader.test.ts` |
| One parser, same output on every surface | `packages/md-render/src/snapshots.test.ts` (fixture × mode), `jsc-bundle.test.ts` (browser build against the JavaScriptCore bundle in a bare `vm` context) |
| Document scripts cannot reach native code or the network | `fixtures/md/security-probe.md` driven by `e2e/rendered-content.spec.ts` (under the app's CSP in both browsers) and by `InlayTests/ReadWebViewTests.swift` (real scheme handler, real `WKWebView`) |
| The scheme handler serves nothing outside the document folder | `InlayTests/MDViewSchemeHandlerTests.swift`, `InlayCoreTests/PathGuardTests.swift`, the dev-server guard in `packages/read-view/src/embed.test.ts` |
| The CSP is the same in the app and in the dev server | `packages/read-view/src/csp.test.ts` and `MDViewSchemeHandlerTests.swift` each assert the policy for the trusted, untrusted and network-allowed states |
| `window.webkit` only in the WebKit adapter; no hardcoded scheme; listeners check origins | `packages/read-view/src/audit.test.ts`, `packages/host-api/src/origin.test.ts`, `webkit.test.ts`. There is no `message` listener in the web core today, so the origin part of the audit passes vacuously until one is added |
| Quarantined files render statically until trusted, and the file is not modified | `InlayTests/TrustAndWatchingTests.swift` |
| Known-library URLs are rewritten to bundled copies | `packages/md-render/src/vendor.test.ts` (one case per URL form), `e2e/rendered-content.spec.ts` (charts draw with the CDNs blocked) |
| Input rules never fire on composed text | `e2e/composition.spec.ts` (Chromium, through CDP); WebKit by hand with `docs/IME-CHECKLIST.md` |
| A 10,000-line file opens in under a second | `e2e/editor.spec.ts`, `e2e/wysiwyg.spec.ts`, `e2e/read-view.spec.ts`, `loader.test.ts` |
| Shipped dependencies are permissively licensed; notices are current; commits are signed off | `pnpm licenses:check`, `pnpm notices:check`, `pnpm dco:check` in CI |

## 2. Layers

| Layer | Tool | Runs where | What it is for | What it cannot prove |
| --- | --- | --- | --- | --- |
| Unit | Vitest (node; jsdom where a DOM is needed) | Local, Linux CI | Pure logic: the render pipeline, the block model, the splice, settings, origins, policy scripts | Anything about a real browser engine |
| End to end, web | Playwright against Vite preview servers with `MockHost` (ports 4173 and 4174) | Local, Linux CI, Chromium and WebKit | The pages as a user drives them, under the app's CSP | WKWebView behaviour. Playwright's WebKit is a trunk build on Linux, not the WebKit a Mac ships |
| App | XCTest in-process, real `NSDocument`, real `WKWebView`, real scheme handler | Local, macOS CI | The native shell and its contract with the web core. This is the evidence for WKWebView | Anything needing clicks in real windows (no XCUITest, ADR-0014), Finder, Gatekeeper |
| Parity | Vitest running the JavaScriptCore bundle in a bare `vm` context | Local, Linux CI | The bundle needs no DOM and matches the browser build | The real JavaScriptCore of macOS 14 or 15 (see gaps) |
| Policy | Node scripts | Local, Linux CI | Licences, notices, SPDX headers, DCO | — |
| Manual | `docs/CHECKLIST.md`, `docs/IME-CHECKLIST.md` | A person at a Mac | Input methods, Quick Look in Finder, Gatekeeper, VoiceOver, the feel | — |

## 3. Inventory

| File | Declared cases | At run time | Covers |
| --- | --- | --- | --- |
| **Vitest, 19 files** | **95** | **about 472** | per-fixture loops expand over 32 fixtures |
| `fixtures/manifest.test.ts` | 7 | about 130 | manifest traits per fixture |
| `packages/editor/src/document.test.ts` | 6 | 37 | decode and encode identity, line map |
| `packages/editor/src/eol-prototype.test.ts` | 5 | 36 | CodeMirror line-ending fidelity |
| `packages/editor/src/wysiwyg/loader.test.ts` | 7 | about 67 | splice round trip, islands, 10k load |
| `packages/host-api/src/{mock,origin,settings,webkit}.test.ts` | 24 | 24 | MockHost, trusted origins, settings schema, WebKit bridge |
| `packages/md-render/src/render.test.ts` | 17 | 17 | metadata, source lines, modes, assets |
| `packages/md-render/src/snapshots.test.ts` | 1 | 93 | fixture × three modes |
| `packages/md-render/src/vendor.test.ts` | 5 | 43 | CDN rewriting table |
| `packages/md-render/src/{highlight,jsc-bundle}.test.ts` | 5 | 5 | Shiki aliases, JavaScriptCore parity |
| `packages/read-view/src/{audit,csp,embed,languages,page}.test.ts` | 16 | 16 | boundary audit, CSP, dev route, grammars, page |
| `scripts/lib/spdx.test.mjs` | 4 | 4 | SPDX expression evaluator |
| **Playwright, 5 files** | **41** | **80 run, 2 skipped** | each spec in Chromium and WebKit |
| `e2e/read-view.spec.ts` | 10 | | runtime, CSP, scroll restore, theme, performance |
| `e2e/rendered-content.spec.ts` | 12 | | offline charts, widgets, security probe |
| `e2e/editor.spec.ts` | 6 | | Source fidelity, 10k open |
| `e2e/wysiwyg.spec.ts` | 11 | | WYSIWYG fidelity, islands, safety net |
| `e2e/composition.spec.ts` | 2 | | input methods through CDP, Chromium only |
| **XCTest, 8 files** | **41** | **41** | 33 in InlayTests, 8 in InlayCoreTests |
| `InlayTests/EditorDocumentTests.swift` | 10 | | saves through the live editor |
| `InlayTests/WindowModesTests.swift` | 5 | | modes, Split sync, conflict banner |
| `InlayTests/TrustAndWatchingTests.swift` | 5 | | quarantine, network toggle, file watching |
| `InlayTests/MDViewSchemeHandlerTests.swift` | 5 | | routes, CSP, traversal |
| `InlayTests/MarkdownDocumentTests.swift` | 4 | | byte-identical round trip |
| `InlayTests/ReadWebViewTests.swift` | 4 | | render and probe in a real `WKWebView` |
| `InlayCoreTests/{RenderEngine,PathGuard}Tests.swift` | 8 | | JavaScriptCore engine, path guard |

Not tested at all today: the Quick Look extension (no test target; it is the M0 spike stub), `SettingsStore`, the menus, printing.

## 4. Running

```bash
pnpm test:unit
```

```bash
pnpm test:e2e
```

```bash
pnpm mac:test
```

- One Vitest file: `pnpm exec vitest run packages/md-render/src/vendor.test.ts`. Update snapshots with `-u` only after reading the diff; a snapshot change is a rendering change on every surface.
- One Playwright spec or browser: `pnpm exec playwright test e2e/wysiwyg.spec.ts --project=webkit`. `--ui` and `--debug` work as usual. Traces are kept on failure under `test-results/`.
- One XCTest class: add `-only-testing:InlayTests/WindowModesTests` to the `xcodebuild` line in `package.json`'s `mac:test`.
- `pnpm mac:test` builds the web bundles first. **Never run it while Playwright or another web build is running:** both write `packages/*/dist`, and the vendor copy step deletes `public/vendor` while it works.
- The Xcode pre-build step only checks that the bundles exist, not that they are fresh. After changing web code, run `scripts/build-web.sh` (or `pnpm mac:build`) before trusting an Xcode run.

## 5. Fixtures

`fixtures/md/*.md` is the golden corpus (32 files) and `fixtures/manifest.json` describes each one: category, dominant line ending (`eol`), features, and traits such as `islands`, `bom`, `utf8`, `trailingNewline` and `render`. Every fixture is automatically part of the byte-identity suites, the render snapshots in all three modes and the JavaScriptCore parity test.

To add one:

1. Add the file under `fixtures/md/` (assets under `fixtures/md/assets/`). Keep it small and about one thing.
2. Add its entry to `fixtures/manifest.json`. `manifest.test.ts` checks the declared traits against the bytes (line endings, BOM, features).
3. Run `pnpm test:unit` and read the three new snapshots before committing them.
4. If it exercises a browser behaviour, add a case to the matching `e2e` spec.

Fixtures are data, not source: they are exempt from Biome and SPDX, and `.gitattributes` keeps Git from touching their line endings. Never "fix" whitespace in a fixture.

A bug in saving or rendering gets a fixture first, then the fix.

## 6. Rules for writing tests

- **Compare bytes, not strings that have been through a normalizer.** Read the fixture as bytes and compare what would be written.
- **Poll, do not sleep.** Wait on a condition with a deadline. Fixed sleeps are the main source of the flakiness in the history (seven of the first 48 commits were timing fixes).
- **Performance readings are not functional assertions.** Take the best of three, and keep budgets out of tests that also assert behaviour (see section 7).
- **XCTest windows that do timed work must be on screen** (`orderFrontRegardless`). A hidden `WKWebView` throttles timers to once a second. Work that must finish while hidden runs in one go when `document.hidden`.
- **Build expected strings with a replacer function**, not a replacement string: `$$`, `` $` `` and `$'` are special in `String.prototype.replace`, and Markdown math is full of them.
- **In headless Playwright on macOS, set the caret through the editor's API**, not with Home and End.
- **A CSP-blocked form submission leaves Chromium "navigating" forever.** Poll with `page.evaluate` instead of a locator.
- **Never add a test-only code path to the product** to make a test pass. Query parameters on the dev pages (`?fixture=`, `?mode=`, `?safetyLines=`) are the allowed seams.
- A new `message` listener, a new scheme-handler route, or a new `Host` method comes with a test in the matching audit or contract file.

## 7. Performance

| Budget | Where it is asserted | Caveat |
| --- | --- | --- |
| 10k-line open under 1 s, Source and WYSIWYG | `e2e/editor.spec.ts`, `e2e/wysiwyg.spec.ts` | Relaxed to 2 s on CI's Linux WebKit; not enforced on Mac hardware |
| 10k-line render | `e2e/read-view.spec.ts`, `snapshots.test.ts` (60 s timeout for CI headroom) | Wall-clock inside a functional test |
| Split edit to re-render | `WindowModesTests.swift` | Asserts completion within a window, not a budget |

The budgets in `docs/PRODUCT.md` section 9 (cold start, idle memory, Quick Look latency, edit-to-render) have no test yet. The plan is a separate, serial performance job on the macOS runner that records numbers per commit and fails on a regression against a stored baseline, so that functional tests stop carrying wall-clock assertions.

## 8. Security testing

- **The probe.** `fixtures/md/security-probe.md` tries the exits a document might use (the native bridge, `fetch` to a remote host and past the document folder, XHR, WebSocket, beacon, a frame, `window.open`, a form post to another origin) and reports what it reached. It runs in both browsers under the app's CSP and in a real `WKWebView` behind the real scheme handler. A new capability in the Read view adds a probe line.
- **Traversal.** `PathGuardTests` covers `..`, percent-encoded dots and separators, absolute paths, NUL bytes and a symlink inside the folder that points outside it; `MDViewSchemeHandlerTests` repeats the traversal cases through the handler; `fixtures/md/local-images.md` references `../` and must be refused.
- **Policy parity.** The CSP is built twice (TypeScript for the dev server, Swift for the app); the tests on both sides assert the same strings.
- **Review.** The `security-review` skill runs before every push (`docs/CHECKLIST.md` section 2).

Not yet covered: a hostile-markup corpus for md-render's `sanitized` and `static` modes (mutation XSS, SVG `<use>` and `<animate>`, `javascript:` and `data:` URLs, `<foreignObject>`, MathML links), and any automated dependency or code scanning. See section 10.

## 9. Continuous integration

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`.

| Job | Runner | Steps |
| --- | --- | --- |
| Web | `ubuntu-latest`, Node 22 | frozen install, DCO, `pnpm check`, `pnpm test:unit`, Playwright browsers, `pnpm test:e2e` (one retry) |
| macOS | `macos-26`, Xcode 26.3 | frozen install, XcodeGen, web bundles, `xcodebuild test` (Debug, ad-hoc signed) |

CI must be green on `main`. A flaky test is fixed or quarantined with an issue the same day; it is never retried into passing and left.

## 10. Known gaps, in the order they should be closed

Tracked as tasks in `docs/PLAN.md` under **MH — Hardening**. Sources: the tooling audit of 2026-11-12 and the gaps named above.

| # | Gap | Why it matters | Fix |
| --- | --- | --- | --- |
| 1 | The IME checklist has never been run | A brief requirement with no evidence | Run it on the first signed build; record it in `docs/CHECKLIST.md` |
| 2 | Nothing runs on macOS 14 or 15 | The deployment target is 14; the Quick Look extension uses the system's JavaScriptCore, which the parity test replaces with Node's `vm` | Run `InlayCoreTests` on `macos-14` and `macos-15` runners; test-without-building for the app if the runners allow it |
| 3 | The licence check fails open | `scripts/lib/deps.mjs` turns a `pnpm licenses` error into an empty list, so the check passes with zero packages | Fail on an exec error or an empty production list |
| 4 | Swift packages are not licence-checked where they are resolved | The check runs on Linux only; Sparkle arrives in M5 | Run the licence and notices checks in the macOS job, reading `project.yml` |
| 5 | No property-based test of the round-trip rule | The corpus is 32 files; the rule is universal | Generate Markdown from a grammar and from mutated fixtures (`fast-check`, MIT); assert identity through decode, load and splice |
| 6 | No hostile-markup corpus for the sanitizer | `sanitized` output is shown in the editor webview, which has the native bridge | A fixture set of known XSS vectors; assert no script, handler or dangerous URL survives |
| 7 | Failure artefacts are empty | CI uses the `github` and `list` reporters, so the uploaded `playwright-report` does not exist; no `xcresult` | Add the HTML reporter, upload `test-results/` and an `-resultBundlePath` bundle |
| 8 | Wall-clock budgets inside functional tests | Relaxed on CI, so not enforced anywhere real | The separate performance job of section 7 |
| 9 | The Quick Look extension has no tests | M4 builds it | Fixture × tier snapshots through `InlayCore.RenderEngine`; a test target for the provider |
| 10 | `e2e/`, the Playwright and Vitest configs and `copy-vendor.ts` are not type-checked | No root `tsconfig.json` covers them | Add one and include it in `pnpm typecheck` |
| 11 | No coverage numbers | Blind spots are found by audit, not by measurement | Vitest v8 coverage and `gatherCoverageData` in the scheme; report, do not gate, at first |
| 12 | No dependency or code scanning | The app executes document scripts with third-party libraries around them | Dependabot (npm, Actions), CodeQL (JavaScript and Swift), `pnpm audit --prod` |
| 13 | No visual regression | Theme and layout changes are checked by eye | Playwright screenshots of a few fixtures in light and dark, Chromium only |
| 14 | No accessibility check | Not tested at all | An automated pass on the pages (axe-core is MPL-2.0: a dev-only tool, product owner to confirm) plus section 5.6 of the checklist |
| 15 | Fixed sleeps remain in XCTest | `EditorDocumentTests.swift` and `WindowModesTests.swift` | Replace with polling; add `-retry-tests-on-failure` only as a signal, not a cure |
| 16 | Concurrent builds race on `dist` | Playwright's web server and `build-web.sh` both build | A separate output directory for previews, or a lock |

### Behaviours with no test, from the code audits

Each is a task in MH and starts as a failing test.

- **Saving:** edit, autosave, edit, close (C1); a mirror pull between the save pull and `documentSaved` (C2); undo back past a save, then save.
- **The splice:** deleting a block between two others; changing a block's type; reordering blocks; `# H` directly above `---` (C9).
- **The editor:** editing a block before verification reaches it (C10); typing in Source while WYSIWYG loads for the first time (C11); paste; edits inside tables and nested lists; block HTML inside a blockquote or a list item (C13); the IME guard still finding its plugin after a Milkdown update (C15).
- **The Read view:** refresh while typing in Split; the source embedding with `<!--` followed by `<script` (C3); a navigation to an external URL with no click (S2); media with Range requests (P3).
- **The shell:** a new, untitled document (C4); trust after File → Duplicate and after a quarantined file replaces an open one (S4); the watcher after an uncoordinated delete (C5); a hung editor during a mode switch (C7); `setSettings` and `openExternal` with hostile arguments (S8); print; the menus; window restoration; a file over 5 MB.
- **Quick Look:** everything.

## 11. Debugging notes

- **A hung XCTest prints nothing** because `xcodebuild` output through a pipe is buffered. `sample <pid>` on the test host shows where it waits; `CGWindowListCopyWindowInfo` lists its windows.
- **Quick Look:** another Markdown extension (QLMarkdown, for one) takes over previews; pause it with `pluginkit -e ignore -i <bundle id>` and re-enable with `-e use`. `qlmanage -p` does not launch the extension from a non-interactive shell; verify in Finder.
- **Readings double** under parallel Playwright workers or a concurrent `xcodebuild`.
- **CodeMirror:** `state.doc.toString()` joins with `\n`; use `state.sliceDoc()`. Editor offsets count a line break as one position whatever its length.
- **JavaScriptCore has no `URL`, `document`, `TextEncoder` or timers.** The parity test's bare context is what catches a dependency on them.
