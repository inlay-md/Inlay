# Security policy

Inlay runs the JavaScript inside your Markdown documents. That is the product, so a way for a document to escape the Read view is the most serious bug Inlay can have. Reports are welcome and taken seriously.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting: open the repository's **Security** tab and choose **Report a vulnerability**. Please do not open a public issue for a security problem.

Include the Inlay version or commit, the macOS version, a Markdown file that reproduces the problem, and what you observed. A minimal document is the most useful thing you can send.

What to expect:

- An acknowledgement within three working days.
- An assessment and a plan within ten working days.
- A fixed build before any public write-up, and credit in the advisory unless you prefer otherwise.

There is no bug bounty.

## Supported versions

No release has been published yet. Once releases exist, the latest release receives security fixes; older releases do not.

## What counts

In scope, in rough order of severity:

1. **Document content reaching native code.** A document (Markdown, HTML, SVG, CSS or JavaScript) that calls a native handler, reads or writes a file outside what the page is served, or runs code in the app process.
2. **Reading outside the document folder.** A path served by the `mdview://` scheme handler that resolves outside the document's folder or the app's own runtime assets (traversal, symlinks, encoding tricks).
3. **Network access without consent.** A document that reaches the network through `fetch`, XHR, WebSocket, a form, a beacon, navigation or any other channel while **Allow Network for This Document** is off. Loading scripts, styles and fonts from the three allowlisted CDNs is documented behaviour, not a bypass. Remote images are a known limitation, listed below.
4. **Scripts running in an untrusted document.** A quarantined file that has not been trusted, or a Quick Look preview with scripts off, executing script.
5. **Spoofing the trust UI.** Document content that imitates, covers or triggers the native trust banner, the conflict banner or the toolbar.
6. **Sanitizer bypass.** Markup that survives md-render's `sanitized` or `static` mode and executes script. These modes feed the editor's island previews and Quick Look.
7. **Silent data loss or corruption.** A file whose bytes change on save outside the block the user edited.

Out of scope: a document's own script changing that document's own rendered page; denial of service by a document that loops forever or allocates until WebKit kills the page; anything that needs the user to turn off a protection first and then behaves as documented.

## Known limitations

These are known, tracked in `docs/PLAN.md` (MH-B) and being fixed before the first release. A report that restates one is welcome but not new.

- Remote images load by default, so a script can pass data out in an image URL.
- A script can navigate to an `http(s)` or `mailto` URL, which opens the default browser without a click.
- A document is served its whole parent folder, hidden files included.
- A copy made with File → Duplicate from an untrusted document runs its scripts.
- Island previews in the editor are kept script-free by that page's Content Security Policy as well as by the sanitizer; the sanitizer alone has gaps.

## The model in brief

- The Read view is a separate `WKWebView` per document with a non-persistent data store and no script message handlers.
- A Content Security Policy is sent as a response header by the scheme handler: `connect-src 'none'` by default, inline scripts and three CDN hosts allowed, no frames, no objects, no form submission.
- The scheme handler serves the rendered page, the app's runtime assets and files under the document's folder, after resolving every path.
- Files carrying `com.apple.quarantine` render statically until the user trusts them; the file is never modified to record that.
- The editor webview has the only native bridge and never executes document scripts; island previews are sanitized.
- The Quick Look extension is sandboxed by the system and renders through JavaScriptCore, not a web view.

The full policy is ADR-0007 in `docs/DECISIONS.md`; the tests that enforce it are listed in `docs/TESTING.md`.
