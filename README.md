# Inlay

**A Markdown editor for macOS that renders the HTML, SVG, CSS and JavaScript inside your documents the way a browser would.**

[![CI](https://github.com/inlay-md/Inlay/actions/workflows/ci.yml/badge.svg)](https://github.com/inlay-md/Inlay/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
![Platform: macOS 14+](https://img.shields.io/badge/platform-macOS%2014%2B-lightgrey.svg)

> [!WARNING]
> Inlay is in early development and there are no releases yet. The scaffold (M0) is done and the Read view (M1) is in progress. See the [roadmap](#roadmap) and [`docs/PLAN.md`](docs/PLAN.md).

Most Markdown apps strip or sanitize embedded HTML. Inlay does the opposite: a `<script>` that draws a Chart.js chart, an inline `<svg>` diagram, a `<style>` block or a slider widget runs as it would on a web page, in an isolated view that cannot reach your Mac or the network. Inlay also never rewrites your file behind your back. Opening and saving without edits leaves the file byte-for-byte identical.

````markdown
# Quarterly report

Revenue grew in every region.

<canvas id="revenue"></canvas>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script>
  new Chart(document.getElementById('revenue'), {
    type: 'bar',
    data: { labels: ['EU', 'US', 'APAC'], datasets: [{ label: 'Q3', data: [12, 19, 7] }] },
  });
</script>
````

Inlay serves known libraries such as Chart.js from copies bundled with the app, so a document like this one renders offline.

## Features

Planned for v1. Boxes are ticked as each feature ships.

- [ ] **Full rendering of embedded content.** Raw HTML, inline and linked SVG, and document-level `<style>` and `<script>` run at page level in the Read view, with no iframes.
- [ ] **Offline charts.** Chart.js, ECharts, D3, Mermaid and KaTeX URLs on cdnjs, jsDelivr and unpkg are swapped for bundled copies.
- [ ] **WYSIWYG editing**, built on Milkdown Crepe. Anything that can't be edited losslessly, such as raw HTML, front matter or HTML comments, becomes a *raw island* with its own in-place source editor.
- [ ] **Source and Split modes** with CodeMirror 6. Split shows the source next to the live Read view with scroll sync.
- [ ] **Quick Look for `.md` files** in Finder. SVG always renders, scripts are opt-in, and a static fallback is used otherwise.
- [ ] **The file on disk is sacred.** Open→save is byte-identical. Editing one block changes only that block's bytes, line endings and BOM included.
- [ ] GitHub Flavored Markdown (tables, task lists, footnotes), front matter, KaTeX math, Mermaid diagrams and syntax highlighting.
- [ ] Local images relative to the document, light and dark themes, HTML and PDF export.
- [ ] Correct IME input in WYSIWYG and Source, including Vietnamese Telex/VNI and CJK.
- [ ] Opening a 10,000-line file feels instant.

Out of scope for v1: sync or cloud storage, plugins, AI features, collaboration, the Mac App Store, and Windows/Linux builds. Windows and Linux support through a Tauri shell is planned later, and the architecture is designed for it.

## Security model

Running a document's JavaScript is the point of Inlay, so the Read view is locked down:

- Each document gets its own WKWebView with a non-persistent data store and **no script message handlers**. Document scripts have no channel to native code.
- A Content Security Policy is sent as a response header. Inline scripts and the three CDN hosts are allowed, and `connect-src 'none'` blocks `fetch`, XHR and WebSockets. A per-document **Allow network** toggle relaxes this for documents you trust.
- The `mdview://` scheme handler serves only files in the document's folder and resolves every path to block traversal.
- Files downloaded from the internet (with the `com.apple.quarantine` attribute) open with scripts disabled until you choose **Trust this document**. Inlay never modifies the file to record that choice.
- Links open in your default browser, and pop-ups and `file:` navigation are refused.

The full policy is in [ADR-0007](docs/DECISIONS.md).

## Architecture

Inlay is a thin native shell (Swift, AppKit, `NSDocument`) around a TypeScript web core running in WKWebViews. One Markdown parser, unified/remark, serves every surface, so the Read view, the editor, Quick Look and export all agree.

```
packages/md-render     unified/remark → rehype → HTML; browser ESM build + JavaScriptCore IIFE
packages/editor        document model, CodeMirror Source mode, Milkdown Crepe + raw islands   (M2–M3)
packages/read-view     the Read view page and runtime
packages/host-api      the Host interface between web and native, plus a MockHost for the browser
packages/settings-ui   settings page                                                         (M5)
apps/macos             XcodeGen project: Inlay app, InlayQuickLook extension, InlayCore Swift package
fixtures/              golden Markdown corpus used by the round-trip and rendering tests
docs/                  product brief, plan, decision log
```

Every web↔native call goes through the `Host` interface, so the web core also runs in a plain browser against `MockHost`. That lets it be tested in Chromium and WebKit with Playwright, and it keeps a later port to other platforms straightforward. The Quick Look extension renders through the same md-render code, bundled for JavaScriptCore.

## Building from source

Requirements:

- macOS 14 or later, with Xcode 26 or later
- Node.js 22 or later, and pnpm 10 or later
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`)

Install dependencies and the Playwright browsers once:

```bash
pnpm install
```

```bash
pnpm exec playwright install chromium webkit
```

Common commands:

| Command | What it does |
| --- | --- |
| `pnpm dev` | Runs the Read view in your browser against `MockHost`, with a fixture picker at `http://localhost:5173/__inlay/` |
| `pnpm build` | Builds all web bundles and the JavaScriptCore bundle |
| `pnpm test` | Runs unit tests (Vitest) and end-to-end tests (Playwright, Chromium + WebKit) |
| `pnpm check` | Runs lint and format (Biome), typecheck, SPDX headers, license policy and notices freshness |
| `pnpm mac:build` | Builds the web bundles, generates the Xcode project, and builds the app |
| `pnpm mac:test` | Same as `mac:build`, then runs the XCTest suites |

The Xcode project is generated from [`apps/macos/project.yml`](apps/macos/project.yml) and is not checked in. Edit `project.yml` and run `pnpm mac:generate`; never edit the `.pbxproj` by hand.

## Roadmap

| Milestone | Scope | Status |
| --- | --- | --- |
| **M0** Scaffold | Workspace, Host interface, fixtures, XcodeGen app, CI, licensing | ✅ Done |
| **M1** Read view | Full rendering, offline libraries, KaTeX, Mermaid, highlighting, isolation, quarantine, file watching | 🚧 In progress |
| **M2** Source + Split | CodeMirror Source mode, Split with scroll sync, byte-identical saving through `NSDocument` | Planned |
| **M3** WYSIWYG | Crepe, raw islands, block-splice saving, mode switching, IME | Planned |
| **M4** Quick Look | Rendering tiers 1–3 and shared settings | Planned |
| **M5** Polish and release | HTML/PDF export, themes, preferences, Sparkle updates, signed and notarized builds | Planned |

Detailed task lists are in [`docs/PLAN.md`](docs/PLAN.md), and the reasoning behind design choices is in [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Contributing

Contributions are welcome. Read [`CONTRIBUTING.md`](CONTRIBUTING.md) first. In short:

- Sign off every commit (`git commit -s`) to certify the [Developer Certificate of Origin](https://developercertificate.org/). CI rejects commits without a sign-off.
- Use [Conventional Commits](https://www.conventionalcommits.org/) and keep changes small. Never commit with failing tests.
- Every source file carries `SPDX-License-Identifier: Apache-2.0`.
- Dependencies in shipped code must be MIT, BSD, Apache-2.0 or ISC. CI rejects GPL, AGPL and LGPL dependencies anywhere in the tree.

## License

Inlay is licensed under the [Apache License, Version 2.0](LICENSE). Copyright © 2026 Tran Minh Cuong and the Inlay contributors. Third-party licenses are listed in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

The name "Inlay", its logo and the `live.inlay.*` identifiers are not covered by the license. If you distribute a modified build, give it a different name. See [`TRADEMARKS.md`](TRADEMARKS.md).
