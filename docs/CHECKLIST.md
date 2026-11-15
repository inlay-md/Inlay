# Inlay — checklists

What a person or an agent ticks before a commit, a push, a milestone hand-off and a release. Automated tests are described in `docs/TESTING.md`; this file covers the gates around them and the checks that only a human at a Mac can do. Copy a list into the PR or the release issue and tick it there; record manual runs in the [run log](#run-log) at the bottom.

Rows marked **(planned)** depend on work that does not exist yet (the milestone is named). Do not tick them by assumption.

## 1. Every slice, before `git commit`

- [ ] The change is one vertical slice with its tests in the same commit.
- [ ] `pnpm check` passes (Biome, typecheck, SPDX headers, licence policy, notices freshness).
- [ ] `pnpm test:unit` passes; `pnpm test:e2e` passes if any web page, runtime or fixture changed.
- [ ] `pnpm mac:test` passes if anything under `apps/macos/`, `packages/host-api` or a bundled web page changed. Never run it while another web build is running (both write `packages/*/dist`).
- [ ] New fixture? It is in `fixtures/manifest.json` with its traits, so the round-trip and rendering suites pick it up.
- [ ] New dependency? Licence is MIT/BSD/Apache-2.0/ISC/Unlicense (or an approved exception in `scripts/license-policy.json`), `pnpm notices` re-run, and the product owner asked first for anything else.
- [ ] New Swift file? `pnpm mac:generate` re-run; `project.yml` edited, never the `.pbxproj`.
- [ ] New source file carries `SPDX-License-Identifier: Apache-2.0`.
- [ ] `docs/PLAN.md` box ticked; a non-obvious choice has an ADR in `docs/DECISIONS.md`.
- [ ] Commit message is a Conventional Commit, signed off (`git commit -s`), body lines not hard-wrapped.

## 2. Before every `git push`

- [ ] `caveman-review` skill run on the pending changes; every applicable finding fixed.
- [ ] `security-review` skill run on the pending changes; every applicable finding fixed.
- [ ] Findings deliberately left are named in the commit or PR description with the reason.
- [ ] `pnpm check` and `pnpm test` re-run after the fixes.
- [ ] The diff touches none of: `docs/BRIEF.md`, a generated `.pbxproj`, files under `apps/macos/Inlay/Resources/generated/`.

## 3. Invariant review (any change to saving, the block model, md-render, the scheme handler or a webview)

These are the rules a reviewer checks by reading the diff, because a passing suite does not prove them for new code paths.

- [ ] **Bytes.** No code path writes text that came from a cache when the live editor is reachable. No new "normalize", "trim" or "format" step touches bytes the user did not edit.
- [ ] **Offsets.** Every offset in web code is a UTF-16 index into the decoded string; CodeMirror offsets pass through `offsetToStringIndex` / `stringIndexToOffset` before meeting a remark position.
- [ ] **One parser.** No second Markdown parser, no regular-expression preprocessing of Markdown, and Milkdown's remark versions still match md-render's (`pnpm-workspace.yaml` overrides).
- [ ] **Host boundary.** `window.webkit` appears only in `packages/host-api/src/webkit.ts`; no hardcoded `mdview:` URL in web code.
- [ ] **Read view isolation.** The Read webview still has zero script message handlers and a non-persistent data store; no new route in the scheme handler returns anything outside the document folder or the reserved `__inlay/` prefix.
- [ ] **CSP parity.** A CSP change is made in both `packages/read-view/src/csp.ts` and the Swift builder, with the unit tests on both sides updated.
- [ ] **Origins.** A new `message` listener uses `isTrustedOrigin`.
- [ ] **Quick Look.** No `WKWebView` in the extension; rendering goes through the JavaScriptCore bundle.

## 4. End of a milestone

- [ ] Every box of the milestone in `docs/PLAN.md` is ticked or moved, with a reason, to a later milestone.
- [ ] The "Done when" line of the milestone is demonstrated by a named test or a recorded manual run.
- [ ] `docs/HANDOVER.md` state section rewritten (what is on `main`, what is next, what is open for the product owner, new gotchas).
- [ ] README feature list and roadmap table agree with PLAN.
- [ ] Test counts in `docs/TESTING.md` refreshed.
- [ ] The website's progress section (`inlay-md/inlay.live`) is in step.
- [ ] Summary posted: what was built, what is left, exact manual verification steps. Then wait for "go".

## 5. Manual verification by area

Run on a build made with `pnpm mac:build` (debug) for milestone checks, and on the signed release candidate for a release. Use files from `fixtures/md/` unless a row says otherwise.

### 5.1 Read view and security

- [ ] Open `chart-chartjs.md`, `chart-echarts.md` and `chart-d3.md` with Wi-Fi off: each chart draws from the bundled copy.
- [ ] Open `security-probe.md`: the page reports no native bridge (`window.webkit` undefined), `fetch` blocked, form submission blocked, `window.open` refused.
- [ ] Click an `https://` link: it opens in the default browser, the Inlay window does not navigate.
- [ ] Click a relative link to another `.md` in the same folder: it opens as its own Inlay document.
- [ ] View → Allow Network for This Document: `fetch-toggle.md` now loads its data; reopen the file and the choice is remembered; turn it off again.
- [ ] Download a `.md` with a browser (so it carries `com.apple.quarantine`) and open it: scripts are off, the native banner offers **Trust This Document**; trusting reloads with scripts on; `xattr -l` and `shasum` show the file itself unchanged.
- [ ] Switch macOS between light and dark: the Read view, Mermaid diagrams and code blocks follow.
- [ ] Edit the open file from Terminal (`echo >> file.md`) and with an editor that saves atomically: the Read view refreshes within a second and keeps its scroll position.

### 5.2 Saving and the file on disk

- [ ] `shasum` a fixture, open it, press ⌘S in each of WYSIWYG, Source and Split, `shasum` again: identical every time. Repeat with `crlf.md`, `mixed-line-endings.md`, `utf8-bom.md` and `trailing-whitespace.md`.
- [ ] Change one word in one paragraph in WYSIWYG, save, `git diff --stat`: one line changed.
- [ ] Edit an island in place (click a raw HTML card), save: only that island's lines differ.
- [ ] With unsaved edits, change the file from Terminal: the conflict banner appears; **Keep Editing** keeps the edits and an explicit save asks before overwriting; **Reload from Disk** drops them.
- [ ] File → Revert To → Browse All Versions opens the Versions browser and restoring a version updates both panes.
- [ ] File → Duplicate, Rename and Move To work from the menu and from the title bar.
- [ ] Open `undecodable.md`: it is read-only with a banner, and saving leaves its bytes untouched.
- [ ] Force-quit the WebContent process (Activity Monitor → "Inlay Web Content") with unsaved edits, then save: the save succeeds from the mirror and the window warns once.

### 5.3 Editor

- [ ] ⌘1 / ⌘2 / ⌘3 / ⌘4 switch WYSIWYG, Source, Split and Read; the caret line and the viewport carry over each way.
- [ ] In Split, scrolling and typing in the source keeps the Read pane on the same block; the divider marker tracks the position.
- [ ] Open `perf-10k-lines.md` in WYSIWYG and in Source: usable in under a second, typing stays smooth.
- [ ] Open a file above 50k lines or 5 MB: it opens in Source with the "Open in WYSIWYG anyway" banner.
- [ ] Undo and redo across a mode switch behave as described in ADR-0033.
- [ ] Tab moves between table cells; a pasted CRLF text into an LF file takes the file's line endings.

### 5.4 Input methods

- [ ] Every row of `docs/IME-CHECKLIST.md` (Source rows 1–18, WYSIWYG rows W1–W7) on the build under test.

### 5.5 Quick Look (planned, M4)

- [ ] Pause other Markdown Quick Look extensions first (`pluginkit -e ignore -i <bundle id>`); re-enable them afterwards with `-e use`.
- [ ] Select a fixture in Finder, press Space: Tier 1 renders (inline SVG, local images, KaTeX, theme) in light and in dark.
- [ ] Settings → "Run scripts in Quick Look" on: charts and Mermaid render (Tier 2). Off: the script placeholder appears (Tier 3).
- [ ] A large file previews within Space-bar latency and shows the truncation note.
- [ ] **Open with Inlay** opens the document in the app.

### 5.6 Accessibility and appearance

- [ ] With VoiceOver on, the toolbar's mode control, the trust banner and the conflict banner are announced with their names and are reachable by keyboard.
- [ ] Full Keyboard Access: every banner button and toolbar item is reachable with Tab.
- [ ] Increase Contrast and Reduce Motion on: text stays legible and nothing animates.
- [ ] Text at the largest system size does not clip the banners.

## 6. Release checklist (planned, M5)

The release workflow, Sparkle integration and signing configuration do not exist yet; the commands below are the Apple tools the workflow will call, written out so a release can also be cut by hand.

### 6.1 Pre-flight

- [ ] `main` is green in CI; no open PR that should be in the release.
- [ ] Version bumped in one place (`MARKETING_VERSION` in `apps/macos/project.yml`; `CURRENT_PROJECT_VERSION` incremented) and `package.json` agrees.
- [ ] `CHANGELOG.md` has a dated section for the version, written for users.
- [ ] `pnpm notices:check` passes; About → Acknowledgements shows the current notices.
- [ ] `pnpm check`, `pnpm test`, `pnpm mac:test` pass on the release commit.
- [ ] Sections 5.1–5.6 run on a release-configuration build; results in the run log.
- [ ] Dependencies reviewed for security advisories (`pnpm audit --prod`).

### 6.2 Build, sign, notarize

- [ ] Release archive built with the Developer ID Application certificate and hardened runtime (`xcodebuild archive`, then export).
- [ ] `codesign --verify --deep --strict --verbose=2 Inlay.app` passes; the Quick Look extension is signed with its own entitlements.
- [ ] `xcrun notarytool submit … --wait` returns **Accepted**; the log has no warnings.
- [ ] `xcrun stapler staple` on the app and on the disk image; `spctl -a -vv -t install` accepts the disk image.
- [ ] Sparkle update archive signed with the EdDSA key; the appcast entry has the right version, minimum system version and signature.

### 6.3 Verify on a clean Mac

Use a clean user account or a virtual machine on the oldest supported macOS (14) and on the current one.

- [ ] Download through a browser, open the disk image, drag to Applications, launch: Gatekeeper shows the normal first-launch dialog and nothing else.
- [ ] Open a `.md` from Finder by double-click; Quick Look works after the first launch.
- [ ] The previous release updates to this one through Sparkle and relaunches with documents intact.
- [ ] No network connection is made at launch except the update check (verify with Little Snitch or `nettop`).

### 6.4 Publish

- [ ] Tag `vX.Y.Z` (signed) on the release commit; GitHub Release created with the disk image, checksums and the changelog section.
- [ ] Appcast published; the website's download link and progress section updated.
- [ ] Homebrew cask updated.
- [ ] Licence server or payment provider product version updated, if the release changes what Pro includes (see `docs/MONETIZATION.md`).

### 6.5 After

- [ ] Download the published disk image and compare its checksum with the build.
- [ ] Watch issues and crash reports for 48 hours; a regression in saving or isolation is a same-day patch release.
- [ ] `docs/HANDOVER.md` and `docs/PLAN.md` updated; next milestone opened.

## 7. Security fix or incident

- [ ] Report acknowledged through GitHub private vulnerability reporting within three working days (`SECURITY.md`).
- [ ] Reproduced with a fixture; the fixture joins the corpus once the fix ships.
- [ ] Fix developed on a private branch or security advisory fork; no public issue until a fixed build exists.
- [ ] Patch release cut with section 6; advisory published with credit to the reporter.
- [ ] `docs/DECISIONS.md` records what the policy now is, if it changed.

## 8. Dependency update

- [ ] One ecosystem at a time (remark family, Milkdown, CodeMirror, vendored libraries, Swift packages).
- [ ] remark family: the pnpm overrides and md-render move together; the mdast-equality and round-trip suites pass.
- [ ] Vendored library major bump: the URL rewriting table (ADR-0008) and its tests updated, because documents pinned to the old major now fall back to the CDN.
- [ ] CodeMirror or WebKit behaviour change: `docs/IME-CHECKLIST.md` re-run.
- [ ] `pnpm notices` re-run and committed.

## Run log

Record every manual run here: one row per run, newest first.

| Date | Build | macOS | Sections run | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | No manual run has been recorded yet. The IME checklist (5.4) has never been run by hand; it is a v1.0 release blocker. |
