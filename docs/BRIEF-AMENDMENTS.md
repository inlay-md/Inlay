# Inlay — proposed amendments to the brief

`docs/BRIEF.md` is the product owner's document and is never edited by anyone else. This file is where changes to it are proposed. Each entry says what the brief says today, what is proposed, why, and what it unblocks. The product owner answers each with accepted, rejected or changed; an accepted amendment is then written into the brief by the product owner (or on their instruction) and logged in `docs/DECISIONS.md` with the date.

Raised by the November 2026 review. None is in force.

| # | Amendment | Kind | Needed by | Status |
| --- | --- | --- | --- | --- |
| A1 | Remote images only when the document runs no scripts | Changes a v1 behaviour | MH-11, before the beta | Proposed |
| A2 | Three small additions to v1.0 | Adds v1 scope | M5a | Proposed |
| A3 | A Mac App Store edition after v1 | Lifts a non-goal after v1 | M8 (1.3) | Proposed |
| A4 | An assistant after v1 | Lifts a non-goal after v1 | M10 (2.x) | Proposed |
| A5 | The "restyled" reading of the round-trip rule | Clarifies v1 | Open since M3 | Proposed |
| A6 | The roadmap after v1 and ADR-0035 to ADR-0054 | Adds post-v1 scope | M6 onward | Proposed |
| A7 | A business section | Adds to the brief | The launch; M7 | Proposed |
| A8 | Corrections of fact | Housekeeping | — | Proposed |
| A9 | Quick Look parity: alerts, emoji, outline, Mermaid without document scripts | Adds v1 scope; changes a tier rule | M4 (4.8 to 4.11) | Proposed |

## A1 — Remote images only when the document runs no scripts

**The brief today:** "Content Security Policy …: inline scripts allowed, `connect-src 'none'` by default, plus a per-document 'Allow network' toggle", and M1 is done when "tests prove document JS cannot reach native code or the network". On 2026-11-05 the product owner decided that remote images load by default (ADR-0007).

**The problem:** with remote images on, a script can put any value it can read into an image URL and so reach the network. The M1 acceptance line is not met in spirit, and the README's promise is stronger than the code (`docs/ARCHITECTURE.md` S1, S12).

**Proposed text, added to "Read view → Isolation":** "Remote images, media and fonts load by default only in documents that run no scripts. When a document's scripts run, they load only if the user has turned on 'Allow network' for that document. Untrusted (quarantined) documents never load remote resources."

**Effect:** ordinary Markdown with badges and remote pictures is unchanged. A document with a chart script and a remote logo shows a placeholder for the logo until the user allows network. "Nothing escapes" becomes true by default.

## A2 — Three small additions to v1.0

**The brief today:** M5 lists export, themes, preferences, Sparkle and signing.

**Proposed additions to M5:**
1. Find (⌘F) in the Read view and in WYSIWYG. Source already has it.
2. Table row and column handles in WYSIWYG (planned in M3, deferred for performance).
3. A visible "Open documents in" setting (last used, Read, Edit), honoured by the app; new documents always open in Edit.

**Why:** a document app without find, and a table that can only be edited cell by cell, are the first things a reviewer notices. The third fixes a defect: a new document can open in Read as a blank window that cannot be typed into (C4).

## A3 — A Mac App Store edition after v1

**The brief today:** "Non-goals for v1: … Mac App Store …". ADR-0012 keeps the app unsandboxed.

**Proposed:** v1.0 ships outside the store, as the brief says. After v1, build a sandboxed configuration from the same code (ADR-0038) and publish it on the Mac App Store and Setapp. The direct build stays unsandboxed and stays the primary one.

**Why:** the store is where people look for small Mac utilities and pay with one click, and the sandbox is defence in depth for an app that runs document scripts. See `docs/MONETIZATION.md`, D7.

## A4 — An assistant after v1

**The brief today:** "Non-goals for v1: … AI features …".

**Proposed:** after v1, a Pro feature: rewrites scoped to the selection, shown as a proposal and applied through the block splice; Apple's on-device models by default, the user's own API key in the Keychain as an option; nothing sent anywhere unless the user set that up. No assistant in the free edition's way, and none before 2.x.

## A5 — The "restyled" reading of the round-trip rule

**The brief today:** "If parse→serialize through the editor does not reproduce the original bytes, the block becomes a raw island."

**What was built (ADR-0032):** a block whose serialization differs from its bytes only in formatting, and whose syntax tree is identical, is not an island. It is editable; it is saved verbatim while untouched; it takes the canonical form only when the user edits it. Without this, every hand-aligned table would be an island.

**Proposed text:** "… the block becomes a raw island, unless the difference is formatting only (the parsed tree is identical). Such a block stays editable, is saved byte for byte while unchanged, and is re-serialized only when the user edits it."

**Open since M3.** If rejected, tables and padded lists become islands and the "zero islands on pure-GFM fixtures" criterion cannot hold.

## A6 — The roadmap after v1 and the proposed decisions

**Proposed:** accept `docs/ROADMAP.md` as the direction after 1.0 (each release still starts on its own "go"), and accept or reject ADR-0035 to ADR-0054 in `docs/DECISIONS.md`. The ones that change accepted decisions are: ADR-0036 (amends 0022), ADR-0037 (extends 0010), ADR-0038 (amends 0012), ADR-0041 (amends 0007, 0025), ADR-0044 (amends 0007, 0016), ADR-0045 (amends 0029, 0030), ADR-0046 (amends 0002), ADR-0052 (amends 0004, 0032), ADR-0053 (amends 0021), ADR-0054 (amends 0029).

ADR-0045, ADR-0052 and the non-policy parts of ADR-0044 fix defects and need no product decision; they are listed here so that nothing changes an accepted ADR silently.

## A7 — A business section

**The brief today:** silent on revenue. License: Apache-2.0.

**Proposed:** once decisions D1 to D5 in `docs/MONETIZATION.md` are made, add a short "Business" section to the brief: the model (open core), the free line as a rule, and the two pledges (a free feature is never moved to paid; safety and fidelity are never sold). Until then nothing paid is built.

## A8 — Corrections of fact

- **Repository name.** The brief says `inlay-md/inlay`; the remote, the README badge and `TRADEMARKS.md` use `inlay-md/Inlay`.
- **Licence rule.** The brief says MIT/BSD/Apache-2.0/ISC. Since then the product owner accepted the Unlicense (ADR-0026), EPL-2.0 for the vendored Mermaid bundle only (ADR-0027) and OFL for font files (ADR-0015). The brief could say so.
- **Milestones.** The brief invites refinement of the milestones. The plan now inserts a hardening milestone (MH) before the beta, starts M4 with a precedence spike on macOS 27.3 (ADR-0050) and runs M5 as two tracks. No brief change is needed; noted for the record.
- **Developer ID.** "Developer ID signing + notarization (I'll provide credentials)": the certificate should be issued from the G2 authority; the original one expires on 2027-02-01.

## A9 — Quick Look parity with paid previewers

**The brief today:** "GFM (tables, task lists, footnotes), front matter, KaTeX math, Mermaid, syntax highlighting". Quick Look Tier 1 is sanitized SVG, inlined images, pre-rendered KaTeX and the theme; "Tier 2 (setting 'Run scripts in Quick Look', default off): raw HTML and document scripts included; Mermaid runs".

**What prompted it:** paid Quick Look previewers (Looq Markdown, compared in November 2026) show GitHub alerts, emoji shortcodes, Mermaid diagrams and a contents sidebar out of the box. With the brief as written, a default Inlay preview would show an alert as a blockquote starting with `[!NOTE]`, a shortcode as text and a Mermaid diagram as a code block.

**Proposed:**
1. Add **GitHub alerts** and **emoji shortcodes** to the required syntax, rendered on every surface. Both are render-only: the file keeps `> [!NOTE]` and `:tada:`.
2. Add an **outline** to Quick Look: static HTML and CSS, shown beside the document in wide previews.
3. Change the tier rule for Mermaid: "Tier 1 may run Inlay's own bundled renderers (Mermaid), admitted by a nonce; scripts from the document run only in Tier 2." The setting keeps its meaning: it governs the document's code, not Inlay's.

**Why 3 is safe enough to propose:** the code that runs is the same vendored, licence-checked bundle the app ships; Mermaid runs with `securityLevel: 'strict'`; the CSP still blocks every inline and document script, handlers and the network. The cost is a larger attack surface than a script-free Tier 1 (a bug in Mermaid's parser would be reachable from a preview), which is why it is a product decision. If rejected, Tier 1 keeps showing the diagram source and 1 and 2 still stand.

**Already planned, now earlier:** alerts, shortcodes and heading ids were roadmap items for 1.1; the Quick Look outline was 1.3. The app's outline sidebar, the alert picker and emoji autocomplete stay in 1.1 and build on this.
