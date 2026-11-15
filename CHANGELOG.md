# Changelog

What changed for people who use Inlay, newest first. Versions follow semantic versioning from 1.0; betas are 0.9.x. Engineering detail is in the commit history and `docs/DECISIONS.md`.

## Unreleased

Nothing has been released yet. On `main`:

### Added
- Read view that renders Markdown with embedded HTML, SVG, CSS and JavaScript at page level, isolated from native code, with `fetch`, XHR and WebSocket blocked unless the network is allowed for the document.
- Bundled copies of Chart.js, ECharts, D3, Mermaid and KaTeX, used in place of their CDN URLs so documents render offline.
- GitHub Flavored Markdown, front matter, KaTeX math, Mermaid diagrams, syntax highlighting, local images, light and dark appearance.
- Source mode (CodeMirror 6) and Split mode with source-to-read scroll sync.
- WYSIWYG editing with raw islands that keep HTML, front matter and comments byte for byte and can be edited in place.
- Saving that leaves untouched bytes untouched, line endings and BOM included; autosave, Versions, Duplicate, Rename, Move To and Revert.
- A banner instead of an overwrite when the file changes on disk during editing.
- Downloaded (quarantined) files open with scripts off until trusted.

### Known problems
- Edits made after the first autosave may not reach the disk; press ⌘S.
- Deleting a block can merge the blocks around it on save.
- A script in a trusted document can send data out through image URLs and can open the browser without a click.
- Quick Look, export, print, preferences and find outside Source mode are not built.

See `docs/ARCHITECTURE.md` section 6 for the full list and `docs/PLAN.md` for the order of fixes.
