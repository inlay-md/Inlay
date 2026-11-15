# Inlay — architecture

How Inlay is built, why, what the November 2026 review found, and what should change. The decided architecture is in `docs/BRIEF.md` and ADR-0001 to ADR-0034. Section 6 is the review; section 7 lists the proposed changes, each with a proposed ADR (0035 onward) that waits for the product owner.

## 1. Shape

```
┌──────────────────────────────── Inlay.app (Swift, AppKit, not sandboxed) ────────────────────────────────┐
│                                                                                                           │
│  MarkdownDocument (NSDocument)        DocumentWindowController         MDViewSchemeHandler                │
│  bytes, BOM, text mirror, trust,      modes, panes, native banners,    mdview://<docId>/…                 │
│  file watching, save entry points     toolbar, Split sync              page, runtime assets, folder files │
│        │                                     │                                  │                         │
│        │ EditorBridge ("inlay" reply handler)│                                  │ CSP as a response header│
│  ┌─────▼────────────────────────┐      ┌─────▼────────────────────────┐         │                         │
│  │ Editor WKWebView             │      │ Read WKWebView               │◄────────┘                         │
│  │ packages/editor              │      │ packages/read-view           │                                   │
│  │ CodeMirror 6 · Milkdown Crepe│      │ md-render (browser build)    │                                   │
│  │ block model · raw islands    │      │ document scripts run here    │                                   │
│  │ has the native bridge        │      │ NO native bridge             │                                   │
│  └──────────────────────────────┘      └──────────────────────────────┘                                   │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────── InlayQuickLook.appex (sandboxed by the system) ────────────────┐
│ PreviewProvider → InlayCore.RenderEngine → JavaScriptCore → md-render (IIFE)   │
│ returns HTML through QLPreviewReply; no WKWebView                               │
└─────────────────────────────────────────────────────────────────────────────────┘
```

Two ideas hold it together:

- **One parser.** `packages/md-render` (unified/remark) produces the HTML for the Read view, the island previews, Quick Look and export, and its positions drive the editor's block model. Milkdown's remark is pinned to the same versions.
- **One boundary.** Web code talks to the platform only through the `Host` interface in `packages/host-api`. On the Mac the adapter is `WebKitHost`; in a browser and in tests it is `MockHost`. The Swift shell is deliberately thin.

## 2. Parts

| Part | Responsibility | Size (lines, without tests and snapshots) |
| --- | --- | --- |
| `packages/md-render` | Markdown to HTML with `data-source-line`; modes `full`, `sanitized`, `static`; KaTeX; Shiki; Mermaid hand-off; CDN rewriting; asset inlining; theme CSS. Browser ESM build and a JavaScriptCore IIFE | about 2,200 |
| `packages/editor` | Document model (decode, encode, line map); Source mode on CodeMirror; WYSIWYG on Crepe with the lossless block loader, style sniffing, raw islands and the block splice; the editor page | about 4,600 |
| `packages/read-view` | The Read shell page and runtime: render, replace the page, scroll restore, theme, lazy Shiki and Mermaid; the CSP builder mirrored in Swift | about 1,300 |
| `packages/host-api` | `Host`, settings schema, events, `MockHost`, `WebKitHost`, `isTrustedOrigin` | about 860 |
| `packages/settings-ui` | Settings page. **Does not exist yet** (M5) | 0 |
| `apps/macos/Inlay` | Document lifecycle, saving, watching, trust store, scheme handler, the two webviews, window, menus | about 2,400 |
| `apps/macos/InlayCore` | `RenderEngine` (warm `JSContext`), `PathGuard` | about 190 |
| `apps/macos/InlayQuickLook` | **Still the M0 spike stub** (74 lines) | 74 |
| `fixtures/` | 32 Markdown files and a manifest of their traits | — |

## 3. Flows

**Open.** `NSDocument` reads the bytes and keeps them (`fileData`). Swift decodes strictly as UTF-8, remembers the BOM, reads the quarantine attribute, and registers a context under a document id. The Read webview loads `mdview://<docId>/`; the handler returns the shell with the source embedded as JSON and the CSP as a header; the runtime renders and replaces the page with `document.open/write/close` so scripts and styles run at page level. The editor webview loads `/__inlay/editor/` and receives the text through `Host.openDocument()`.

**Edit and save.** The editor owns the live text. Saving pulls it at the entry points (`save(_:)`, `saveAs`, `saveTo`, `duplicate`, `canClose`), with a three-second race against a dead web process; a debounced mirror keeps a recent copy for Split and for crash saves. In WYSIWYG, unchanged blocks are written from the original text, changed blocks are serialized, gaps are kept. Swift re-encodes with the BOM and writes.

**Split.** The editor reports its position; native scrolls the Read view to the same source line. An edit updates the mirror; native asks the Read view to refresh; the runtime **reloads the page** and restores the position.

**External change.** `NSFilePresenter` plus a vnode watcher detect it. Without unsaved edits, the text is replaced and both views reload. With unsaved edits nothing is overwritten and a native banner asks.

**Mode switch.** Native collapses or shows split-view items; both webviews stay loaded. Position carries over by source line; the caret by UTF-16 index.

**Quick Look (as designed, M4).** The extension reads the file, renders through the JavaScriptCore bundle with inlined assets, and returns HTML with attachments.

## 4. Trust boundaries

| Boundary | What crosses it | What must never cross it |
| --- | --- | --- |
| Document content → Read webview | Everything; the document is the page | — |
| Read webview → native | Nothing by message. Navigations are judged by a native policy; position is pulled by `evaluateJavaScript` | Any call a document script can make |
| Read webview → network | Scripts, styles and fonts from three CDNs; remote images; everything else blocked unless the user allows it | `fetch`, XHR, WebSocket, forms, frames |
| Read webview → file system | Files under the document's folder, through the scheme handler and `PathGuard` | Anything outside the folder |
| Editor webview → native | The `Host` methods, through one reply handler | Document scripts: the editor never executes them; island previews are sanitized |
| Quick Look extension → system | Reads the previewed file; returns HTML | Sibling files (the sandbox refuses), the network |

## 5. What holds the rules

| Rule | Mechanism |
| --- | --- |
| Bytes are sacred | Swift keeps `fileData`; unchanged blocks are spliced from the original string; undecodable files are read-only and write their original bytes |
| Offsets are UTF-16 indices | remark positions; CodeMirror offsets converted by `offsetToStringIndex`; bytes exist only in Swift |
| One parser | pnpm overrides pin remark across md-render and Milkdown; an mdast-equality test |
| Host boundary | An audit test fails if `window.webkit` appears outside `webkit.ts` |
| Read view isolation | Non-persistent store, no handlers, CSP header, navigation policy, popups refused |
| Thin shell | Review; there is no automated check |

## 6. Review, November 2026

Three audits were run on `main` at `50e83ec` (Swift shell, tooling and CI, web core), by reading the code; nothing was executed. The Swift, security and tooling findings, and the critical and high web-core findings, were re-read in the source before they were written here; the medium and low web-core findings (C12 to C15, P5, P6) rest on the audit. *To prove* means the code path is as described but the consequence needs a test, which is the first task of the fix.

### 6.1 Verdict

**Keep the architecture.** A native document shell around a portable web core, one parser, a strict host boundary and a bridge-free Read view are the right decisions, and they are the product's moat. A rewrite in Tauri or Electron would give up `NSDocument`, Versions, the Quick Look path and the isolation model for nothing. The byte model, the block splice, `PathGuard`, the pure and unit-tested scheme-handler routing, the save design of ADR-0030 and the native banners are solid and should not be touched.

**Re-implement six parts.** They are bounded, they are listed in section 7, and none changes the shape in section 1:

1. How dirty state travels between the editor and `NSDocument` (a correctness bug with a data-loss path).
2. How the block splice chooses the gap between blocks, and when a block may first be edited (two paths to a document that changes in ways the user did not ask for).
3. What a script in a trusted document can read and send (the security promise is currently stronger in the documentation than in the code).
4. Where app assets are served from and how island previews enter the editor page, so the page that holds the native bridge does not depend on the sanitizer alone.
5. How the Read view refreshes in Split (a full reload per edit).
6. How native drives the web core (by evaluating JavaScript outside `Host`), before a second shell exists.

**Finish three parts that are thinner than the plan suggests:** Quick Look (still the spike), the release path (nothing exists) and the window chrome (settings, find, print, theme wiring are absent or dead menu items).

### 6.2 Correctness

| # | Finding | Evidence | Severity |
| --- | --- | --- | --- |
| C1 | **Edits made after the first autosave may never reach the disk.** The editor reports dirty state only when it flips (`page.ts` `onDirty`), and its clean baseline moves only on `documentSaved`, which the window emits for Save and Save As but not for autosave (`DocumentWindowController.wire`). Autosave-in-place clears `NSDocument`'s change count on its own. From then on the editor is "still dirty", sends nothing, and `NSDocument` believes the file is current: no further autosave, no save on close. *To prove:* edit, wait for autosave, edit again, close, reopen. | `packages/editor/src/page.ts:91-96`, `:179-187`; `apps/macos/Inlay/Sources/DocumentWindowController.swift:136-139`; `MarkdownDocument.swift:339-341` | **Critical** |
| C2 | The same split baseline has two smaller holes: typing between the save pull and `documentSaved` is blessed as saved; edit, autosave, undo reports clean while the disk holds the undone text. Mirror pulls also overwrite `lastProvidedText`, so a slow save can mark text as saved that was never written. | `page.ts:174-181` | High |
| C3 | The JSON embedding of the source escapes only `</`. A document containing `<!--` followed by `<script` with no later `-->` puts the HTML tokenizer in the double-escaped script state and swallows the closing tag; the Read view fails to parse its payload. Not an injection, a broken render. | `MDViewSchemeHandler.swift:101-103`; `packages/read-view/fixtures-plugin.ts:67` | Medium |
| C4 | New and untitled documents open in the last-used mode, which defaults to Read: a blank window that cannot be typed into. The `editor.defaultMode` setting (`wysiwyg`) is not consulted by native. | `DocumentWindowController.swift:116`; `packages/host-api/src/settings.ts` | Medium |
| C5 | `FileWatcher` retries `open()` every 150 ms forever after an uncoordinated delete or rename. | `FileWatcher.swift:38-41`, `:67-75` | Medium |
| C6 | Each window's closures capture its document strongly, so a closed document's text and bytes are never released; `EditorBridge.receivedMethods` grows without bound. | `DocumentWindowController.swift:131-139`; `EditorBridge.swift:62` | Medium |
| C7 | `setMode` awaits JavaScript with no timeout; a hung editor blocks mode switching. `withTimeout` never cancels the losing task. | `DocumentWindowController.swift:187-192`; `MarkdownDocument.swift:244-257` | Low |
| C8 | Paths are percent-decoded twice, so a file with a literal `%` in its name cannot be reached. | `ReadWebView.swift:115`; `MarkdownDocument.swift:325` | Low |
| C9 | **The splice can merge two blocks.** A block that kept its bytes is written with the gap that preceded it in the original text, even when the block now before it is a different one. `A`, blank line, `# H`, newline, `B`: delete the heading and the file is saved as `A` newline `B`, one paragraph. A heading turned into a paragraph before a single-newline gap merges with what follows. Nothing re-parses the result. *To prove* with a unit test, then fix. | `packages/editor/src/wysiwyg/splice.ts:119-124` | **Critical** |
| C10 | **A block edited before deferred verification reaches it skips the island safety net.** Verification runs in idle slices after the view is up; a block whose editor form is lossy and that the user edits first is serialized as if it were faithful. The window is short (about a second on a large file) but a mode switch can put the caret anywhere. | `wysiwyg/loader.ts:162-198`; `wysiwyg/editor.ts:196-240` | High |
| C11 | **Switching modes is not re-entrancy safe.** `switchTo` reads the text, then awaits the first WYSIWYG load; keys typed in Source during that load are missing from the editor that becomes active. `ensureWysiwyg` has no in-flight guard and can mount twice. | `packages/editor/src/page.ts:111-124`, `:138-160` | High |
| C12 | Table style is sniffed but never applied: the per-style processor uses `remark-gfm` with default options, so editing one cell reformats a compact table (confined to the table, but a noisy diff). Reordering blocks re-serializes untouched ones with the document style. | `wysiwyg/transformer.ts:110-115`; `wysiwyg/style.ts`; `wysiwyg/splice.ts:67-72` | Medium |
| C13 | Block HTML inside a blockquote or list item is not a block island: Milkdown's transformer rewrites it in place and it becomes an inline chip in an editable container. No fixture covers it. | `wysiwyg/schema.ts:238-243`; `wysiwyg/transformer.ts:66-77` | Medium |
| C14 | The large-document safety net applies only to the first open in WYSIWYG, not to a later mode request or a reload from disk; it compares a UTF-16 length with a byte limit and ignores the `largeDocumentSourceFallbackLines` setting. | `packages/editor/src/page.ts:38`, `:85` | Medium |
| C15 | The IME guard finds Milkdown's input-rule plugin by a private key string and does not assert that it found it; a rename upstream would switch the guard off silently. | `wysiwyg/composition.ts:13-23` | Medium |

### 6.3 Security

The Read view's core isolation holds: no handlers, a non-persistent store, the probe passes in a real `WKWebView`. What follows is the distance between "isolated" and the promise "nothing escapes".

| # | Finding | Evidence | Severity |
| --- | --- | --- | --- |
| S1 | **A script can send data out through image requests.** `img-src` allows `https:` by default (a product-owner decision of 2026-11-05 for badges and remote pictures). A script in a trusted document can put anything it can read into an image URL. `connect-src 'none'` does not cover this. | `MDViewSchemeHandler.swift:212` | **High** |
| S2 | **A script can open the default browser at any URL without a click.** The navigation policy hands every `http`, `https` and `mailto` navigation to `NSWorkspace`, with no check that a person clicked. That is a second way out, and a way to launch arbitrary sites. | `ReadWebView.swift:99`, `:110-112` | **High** |
| S3 | **The served root is the document's whole parent folder,** with no limit on depth, hidden files or file type. A document saved in the home folder can load any image, media file, script or style beneath it; JSON may be readable through import attributes (*to prove* with a probe line). Combined with S1 this is a read-and-send path for a file that was never quarantined: a cloned repository, an archive unpacked on the command line, a file an agent wrote. | `MarkdownDocument.swift:296`; `MDViewSchemeHandler.swift:140-144` | **High** |
| S4 | **Quarantine is the only trigger for "untrusted",** and it has gaps: File → Duplicate of a quarantined document yields an untitled copy whose scripts run (`isUntrusted` is false without a file URL); the attribute is read once at open, so a quarantined file that replaces an open trusted one keeps running. | `MarkdownDocument.swift:71-74`, `:107-115`, `:397-420` | High |
| S5 | **A file in the document folder is a valid script source for the editor page.** The editor's CSP is `script-src mdview:`, the handler serves folder files on the same origin, and the handler does not know which webview is asking. Exploiting it needs a sanitizer miss in an island preview, but the editor page holds the native bridge, so the layers should not depend on one another. The untrusted Read CSP also allows `mdview:` beside its nonce. | `MDViewSchemeHandler.swift:186`, `:204-206`, `:55-61`; `ReadWebView.swift:93` | High |
| S6 | `alert()` from a document runs an app-modal dialog; a loop locks every window. | `ReadWebView.swift:137-143` | Medium |
| S7 | "Allow network" is remembered by path only; a different file later saved at that path inherits it. Quarantine flags are not parsed, so files written by sandboxed apps may show the "downloaded" banner (*to prove*). | `TrustStore.swift:40-48`, `:63-73` | Medium |
| S8 | `setSettings` from the editor page goes into `UserDefaults` unvalidated on the native side. | `EditorBridge.swift:79-81`; `SettingsStore.swift:22-25` | Medium |
| S9 | The CSP is built twice. TypeScript asserts one exact string; Swift asserts with `contains`. Parity is a convention. | `InlayTests/MDViewSchemeHandlerTests.swift:40-58` | Medium |
| S10 | Quarantine set and remove helpers written for tests ship in the release binary. | `TrustStore.swift:75-89` | Low |
| S11 | **Sanitized island previews are inserted with `innerHTML` into the editor page,** the one with the native bridge. Scripts are stopped by that page's CSP, not by the schema, which has holes: id and name clobbering is switched off while `id` and `name` are allowed; `xlink:href` has an empty protocol list, which the sanitizer reads as unrestricted; `style` is unrestricted, so a preview can paint over the editor with `position: fixed`; SMIL `animate` and `set` are allowed. The same output feeds Quick Look. | `packages/editor/src/wysiwyg/island-view.ts:195`, `:200`; `packages/md-render/src/sanitize.ts:300-308` | High |
| S12 | Remote images load for quarantined, untrusted documents too (`img-src … https:` is unconditional), so opening an untrusted file tells a remote server it was opened. | `MDViewSchemeHandler.swift:212`; `packages/read-view/src/csp.ts:39` | Medium |

### 6.4 Performance and scale

| # | Finding | Evidence |
| --- | --- | --- |
| P1 | In Split every edit burst reloads the Read page: all document scripts re-run, charts redraw, widgets lose their state, Mermaid and Shiki run again. | `DocumentWindowController.swift:248-262`; ADR-0022 |
| P2 | The whole document text crosses the bridge 150 ms after each edit burst (the mirror pull). Fine at 10k lines; a cost at 5 MB. | `MarkdownDocument.swift:348-355` |
| P3 | The scheme handler reads whole files on the main thread and does not support Range requests, so large media stalls the app and cannot seek. | `MDViewSchemeHandler.swift:38-49`, `:146-150` |
| P4 | Source lines are counted on every scroll report. | `DocumentWindowController.swift:244` |
| P5 | In WYSIWYG, 60 ms after each change the position report runs the whole splice: every block changed since load is serialized again (no cache, and the baseline is not rebased after a save), the full text is joined, and finding the top block walks every block above the viewport with a layout read. One step is quadratic in the number of unclaimed blocks. | `packages/editor/src/wysiwyg/editor.ts:158-168`, `:341-349`, `:397-407`; `wysiwyg/splice.ts:109` |
| P6 | The Read view restores its scroll position once, before images and diagrams change heights, and on every scroll frame rescans all `[data-source-line]` elements and writes `sessionStorage`. | `packages/read-view/src/runtime.ts:146-166`; `scroll.ts` |

### 6.5 Tooling and release

| # | Finding | Evidence |
| --- | --- | --- |
| T1 | There is no release path: one workflow, Debug only, ad-hoc signing, a fixed build number, no artefact. | `.github/workflows/ci.yml`; `apps/macos/project.yml:15-26` |
| T2 | Three unrelated version numbers (`0.0.0`, `0.1.0`, `0.1.0-m1`), no tags, no changelog. | `package.json:4`; `project.yml:15`; `packages/md-render/src/index.ts:62` |
| T3 | Nothing is tested on macOS 14 or 15, the deployment target and the system JavaScriptCore the Quick Look bundle will run on. | `ci.yml:57` |
| T4 | The licence check passes when `pnpm licenses` fails, and never sees Swift packages where they resolve. | `scripts/lib/deps.mjs:31-34`, `:76-79` |
| T5 | No dependency or code scanning. | `.github/` |
| T6 | CI failure artefacts are empty; timing flakiness recurs (seven of 48 commits). | `playwright.config.ts:13`; `ci.yml:52` |

The full tooling list and the test gaps are in `docs/TESTING.md` section 10.

### 6.6 Product completeness against the plan

Present in the menus but not working: **Settings…** (no action), **Print…** and **Page Setup…** (no print operation). Absent: find outside Source mode, export, drag-to-open, theme wiring (`setTheme` is never called from native), logging in the app, localization, accessibility labels on the banners and the mode control, window restoration, a crash handler for the Read pane. The Quick Look extension shows the spike's diagnostics box for every file.

### 6.7 Host boundary and portability

`window.webkit` appears only in the adapter, as the rule says. The boundary is still one-way in practice: native controls the pages by evaluating JavaScript against `window.inlayEditor`, `window.inlayReadView` and `inlayWebKitHost.requestContent()` and reading the return values. That is outside `Host`, it is untyped on the Swift side, and a Tauri shell cannot do it the same way (its script evaluation returns nothing). The planned mapping for other shells also puts the document id in the path, so every document would share one origin.

`Host` has thirteen methods and five events. Seven are never called by the web core (`readFile`, `resolveAssetURL`, `saveDocument`, `openExternal`, `getSettings`, `setSettings`, and the `settingsChanged` event), and what the roadmap needs is missing: writing an asset, export and print, find, reporting an outline and statistics, a menu-command event. `RenderMeta` carries no headings, no word count and no heading ids, so an outline and `#anchor` links have nothing to target yet.

Every user-facing string in the web core is an English literal, `<html lang="en">` is forced on every rendered document, and island cards and task checkboxes have no accessible name or state.

### 6.8 Thin shell

Small duplications between Swift and the web core, each a place where the two can drift: line-ending detection (`MarkdownDocument.detectEol` and `host-api`), line counting, the CSP builder, the source embedding. The CSP and the embedding should share a golden file asserted by both sides.

## 7. Proposed changes

Each is a proposed ADR in `docs/DECISIONS.md` and a task in `docs/PLAN.md`. "When" is the release in `docs/ROADMAP.md`.

| Change | What | Why | When | ADR |
| --- | --- | --- | --- | --- |
| **Native owns dirty state** | Every content change marks the document edited; `documentSaved` carries a token for the text that was written; autosave moves the editor's baseline too | C1, C2 | Before the beta, first | 0045 |
| **Splice safety** | A kept block keeps its original gap only when the block before it is its original neighbour, also kept; otherwise a blank line. After every splice the result is parsed and its top-level block sequence compared with the editor's document; a mismatch refuses the fast path and serializes conservatively. A block still pending verification is verified synchronously before its first edit. Mode switches are serialized and read the text after any await | C9, C10, C11 | Before the beta, first | 0052 |
| **Close the ways out** | With scripts running, `img-src`, `media-src` and `font-src` lose `https:` unless the user allows network; external opens need a real click (a native record of the last mouse or key event in the webview); hidden files, a type allowlist and a refusal to serve from the home folder or the disk root; quarantine re-read on reload and carried to duplicates; alerts as a rate-limited sheet | S1 to S4, S6 | Before the beta | 0044 |
| **App assets on their own origin** | Runtime and editor assets from a host of their own (`mdview://app/…`); the editor's CSP names only that host; the handler knows which webview asks and refuses the editor route to the Read view | S5 | Before the beta | 0046 |
| **Isolated island previews** | Previews render inside a shadow root with containment; the schema restores clobber prefixing, drops `name` and SMIL, and allows only same-document fragment references on `use` and `image`; a hostile-markup corpus joins the fixtures. Quick Look pages carry a CSP of their own in every tier | S11 | Before the beta | 0053 |
| **Incremental refresh** | The runtime keeps a hash per rendered top-level block and patches changed blocks; a reload only when a script or style block, or the set of libraries, changes | P1; the Split experience | 1.1 | 0036 |
| **Jump from Read to Source** | A navigation to a reserved URL carrying one integer (a source line), intercepted by the navigation policy. Bounded, so it does not weaken the no-bridge rule | Two-way Split | 1.1 | 0037 |
| **Own the editor chrome** | Replace Crepe's Vue-based pieces (toolbar, menus, table and list views already replaced) with plain ProseMirror plugins on the Milkdown kit, keeping the schema, loader and splice, which are already ours | A Vue app per node costs the 10k budget; upstream risk; bundle size | 1.1 to 2.0, piece by piece | 0035 |
| **One file-access layer** | All file reads and writes in Swift go through one type that can hold security-scoped bookmarks, so the same code runs inside the App Sandbox | Mac App Store, Setapp, defence in depth | 1.3 | 0038 |
| **Host goes both ways** | Native requests to the pages (content, position, scroll, theme, mode) become typed `Host` requests with replies, one protocol for both directions; on other shells each document gets its own origin (`<docId>.mdview.localhost`) | Section 6.7; the 3.0 port; fewer stringly-typed `evaluateJavaScript` calls | 1.2 | 0054 |
| **Extension points** | Internal registries for commands, exporters, panes and snippet providers, in the web core and mirrored in `Host` | Pro modules; later plugins | 1.2 | 0039 |
| **Offline licence** | Ed25519-signed licence file verified with CryptoKit; no account | Pro | 1.2 | 0040 |
| **Trust that follows the file** | Trust keyed by file identity (bookmark or file id) and by folder; a permissions popover; managed preferences | S7; teams | 1.3 | 0041 |
| **Opt-in diagnostics** | MetricKit reports kept on the Mac and sent only on a click; `os.Logger` throughout | No visibility into crashes today | 1.1 | 0042 |
| **Localization** | A String Catalog in Swift; web strings delivered through `Host`; English and Vietnamese first | Audience | 1.1 | 0043 |
| **One version, one release path** | The root `package.json` version feeds `project.yml` and md-render; tags `vX.Y.Z`; a tag-triggered workflow that archives, signs, notarizes, staples, packages and publishes | T1, T2 | Before the beta | 0047 |
| **Quick Look, re-scoped** | Test extension precedence on macOS 27.3 first; `RenderOptions` gains an asset loader; size caps; the tiers | Section 6.6; the system's own Markdown preview | M4 | 0050 |

## 8. Portability

The web core has no WebKit-only API and passes Playwright in Chromium and WebKit. A Tauri shell needs: a Rust adapter for `Host`; the scheme mapped to `http://mdview.localhost` (web code already takes base URLs from `Host`); the same CSP as a response header; a second webview without IPC for the Read view (Tauri's isolation and capability system must be shown to give the same zero-bridge guarantee on WebView2 and WebKitGTK); and re-proving the security probe on each engine. Document lifecycle (autosave in place, Versions, conflict handling) has no equivalent there and becomes web-core or Rust work. That is why this is release 3.0 and not a side project.
