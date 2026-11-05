# Inlay — decisions (ADR log)

Short entries, newest at the bottom. Each: context, decision, consequence. Deviations from `docs/BRIEF.md` are proposed to the product owner before being logged as accepted.

## ADR-0001 — Read view renders client-side and replaces the page in place (2026-11-05)
The shell page at `mdview://<docId>/` embeds the document source as JSON; the read-view runtime renders it with md-render (browser build) and calls `document.open()/write()/close()` so document `<script>`/`<style>` run in page order like a navigated page and relative URLs resolve against the document folder. No fetch endpoint for the source exists, so `connect-src 'none'` stays literal. Refresh pushes new source via `evaluateJavaScript` (fallback `reload()`), scroll restored via `sessionStorage`. Fallback if `document.write` misbehaves in WKWebView: native renders through the JSC bundle and the webview navigates to the result.

## ADR-0002 — Both webviews load through the `mdview://` scheme handler (2026-11-05)
The editor webview also loads its page and document assets through the handler and traversal guard; only it gets the `WKScriptMessageHandlerWithReply` bridge. Web code receives the document base URL from `Host.openDocument`, never a hardcoded scheme, so Tauri can later map it to `http://mdview.localhost/…`. The `__inlay/` path prefix is reserved for runtime assets and shadows a same-named folder in the document directory.

## ADR-0003 — Byte preservation model (2026-11-05)
Swift keeps the original `Data`; the web core works on the losslessly decoded UTF-8 string plus `{bom, eol}`. All web offsets are UTF-16 string indices (remark positions), never bytes; bytes are produced only by re-encoding. Source mode first tries CodeMirror `lineSeparator` = dominant EOL so stray `\r`/`\n` survive as highlighted characters; if the mixed-EOL prototype shows glitches, fall back to normalized `\n` plus a per-line EOL table maintained through change sets. Non-UTF-8 files open read-only with a banner.

## ADR-0004 — WYSIWYG block model with per-block style sniffing (2026-11-05)
md-render's parse gives top-level blocks with offsets and inter-block gaps. Each block is round-tripped through Milkdown's parser + serializer with sniffed style options (bullet, emphasis/strong char, fence style, list indent, heading style, EOL) applied via a per-block remark instance, because `remarkStringifyOptionsCtx` is read once at editor creation. Mismatch ⇒ raw island atom holding the exact slice. Save: unchanged node ⇒ original slice; changed/new ⇒ serialized; islands ⇒ source attr; gaps and trailing newline preserved. remark versions are pinned shared between md-render and Milkdown and an mdast-equality test guards against phantom islands.

## ADR-0005 — Save pulls live editor content; native mirror only for crashes (2026-11-05)
`NSDocument.save(to:ofType:for:completionHandler:)` first requests content from the live editor (`callAsyncJavaScript`), then calls super; `data(ofType:)` returns that content. Autosave, Duplicate, Save As and Versions go through the same override. A debounced native last-known-good mirror is used only when the web content process has terminated or times out, and the user is warned. This keeps the brief's "never from a cached copy" while avoiding data loss on a WebContent crash.

## ADR-0006 — JavaScriptCore bundle constraints (2026-11-05)
esbuild IIFE, `platform: neutral`, no DOM. Shiki runs with `createHighlighterCoreSync` and the JavaScript regex engine (no WebAssembly dependence) over a curated grammar set, with a conservative regex target because the extension runs on the user's OS JavaScriptCore (macOS 14+). KaTeX via `renderToString`. Small polyfills (`TextEncoder`, `queueMicrotask`, `console`). `assetLoader` option lets Swift supply bytes for `inlineAssets`. The extension keeps one warm `JSContext`. A parity test requires identical `static` HTML from the browser and JSC builds for every fixture.

## ADR-0007 — Read view CSP, trust and network policy (2026-11-05)
Isolation: non-persistent store, no script message handlers, `WKUIDelegate` refuses `window.open`, navigation policy sends `http(s)` to the default browser and refuses `file:`, scheme handler `realpath`s every path and serves only the document folder. CSP is a response header (persists across `document.open`). With CDN = cdnjs.cloudflare.com, cdn.jsdelivr.net, unpkg.com (brief amendment): `default-src 'none'; script-src 'unsafe-inline' mdview: CDN; style-src 'unsafe-inline' mdview: CDN; font-src mdview: data: CDN; img-src mdview: data: blob: https:; media-src mdview: data: blob:; connect-src 'none'; frame-src 'none'; child-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`. Remote images are allowed by default (product owner decision 2026-11-05). Untrusted (quarantined, not yet trusted) documents get nonce-only `script-src` and static rendering. "Allow network" (per document, remembered per path) widens `connect-src`, `script-src`, `style-src`, `font-src` to `https:`. Trust is stored in app preferences keyed by path + quarantine xattr value; the file is never modified.

## ADR-0008 — Known-library URL rewriting (2026-11-05, brief amendment)
A rehype step rewrites Chart.js, ECharts, D3, Mermaid and KaTeX URLs on the three allowlisted CDNs (`<script src>` and `<link href>`, versioned or not) to bundled copies under a `vendorBaseURL` option (app: `mdview://<docId>/__inlay/vendor/…`; Quick Look Tier 2: `cid:` attachments). Rewrite only when the requested major version matches the bundled major or is unspecified; otherwise the CDN URL is left intact (still allowed by CSP). Vendored copies are shipped dependencies: license-checked and listed in THIRD_PARTY_NOTICES. The mapping table is data with per-URL-form unit tests.

## ADR-0009 — Custom-scheme origins (2026-11-05, brief amendment)
No web code assumes `https:`. `isTrustedOrigin(origin, baseURL)` in `host-api` handles `mdview://<docId>`, `http://mdview.localhost`, and WebKit's `"null"` origin; every `message` listener uses it. Unit-tested.

## ADR-0010 — No web→native channel from the Read view (2026-11-05)
Position for mode switching is pulled by native with `evaluateJavaScript`. Split-mode scroll sync is source→read only in v1; read→source would need a web→native path and can be added later through a bounded URL endpoint if wanted.

## ADR-0011 — `data-source-line` on raw HTML blocks (2026-11-05)
`rehype-raw` reparses raw HTML and drops positions. md-render injects `data-source-line` into the first start tag of each top-level raw HTML block before `rehype-raw` (skipping `<script>`, `<style>`, comments) so Split sync and mode switching stay accurate around embedded HTML.

## ADR-0012 — App is not App-Sandboxed (2026-11-05)
Distribution is Developer ID only (Mac App Store is a non-goal). Prompt-free access to sibling assets in the document folder is the blocker for sandboxing; hardened runtime stays on, which is all notarization needs. The Quick Look extension is sandboxed by the system; the M0 spike decides whether a scoped read-only exception is needed for sibling images.

## ADR-0013 — File change detection via NSFilePresenter first (2026-11-05)
NSDocument already conforms to `NSFilePresenter`; use `presentedItemDidChange` first, add a `DispatchSource` vnode watcher only if uncoordinated writes are missed, and deduplicate notifications by content hash.

## ADR-0014 — Tooling and workflow (2026-11-05)
pnpm workspace; Vite per page package; esbuild for the JSC IIFE; Vitest (node + jsdom); Playwright Chromium + WebKit on the Linux CI job only (Playwright WebKit is a trunk build, not WKWebView; in-process XCTest app tests are the real-WKWebView evidence); Biome for lint/format; XcodeGen; XCTest without XCUITest. Swift 6 language mode with main-actor default isolation on app/extension targets, deployment target macOS 14, no Xcode-27-only features. CI macOS job runs on `macos-26` with Xcode 26.3. Git: branch renamed `master`→`main` before the first commit; M0 lands on `main`; later milestones use branches + PRs merged on the product owner's "go"; DCO sign-off (`-s`), Conventional Commits.

## ADR-0015 — License policy scope (2026-11-05, product owner)
The MIT/BSD/Apache-2.0/ISC allowlist applies to shipped code (app and extension bundles incl. vendored libraries, Swift packages, fonts). The GPL/AGPL/LGPL deny-list applies to the entire dependency tree including dev tools and fails CI. SIL OFL 1.1 is accepted for font files only (KaTeX fonts) and listed in THIRD_PARTY_NOTICES. `dompurify` (Apache-2.0 OR MPL-2.0) is taken under Apache-2.0.

## ADR-0016 — Product defaults chosen where the brief is silent (2026-11-05)
Front matter hidden in Read view (its `title` feeds the window title), island card in WYSIWYG. Scripts run by default for non-quarantined documents. Assets outside the document folder are not served. Large-document safety net: above ~50k lines / 5 MB open in Source mode with a one-click switch (the 10k-line fixture stays in WYSIWYG). Quick Look caps inlined image sizes and truncates very large documents with a note. System fonts for UI/body; only KaTeX fonts are bundled.
