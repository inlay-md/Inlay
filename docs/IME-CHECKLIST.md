# Manual IME checklist — Source mode (M2) and WYSIWYG (M3)

Run before each release and whenever CodeMirror or WebKit is updated. Open `fixtures/md/unicode-text.md` in Source mode (View → Source, ⌘2) and check each row in both a plain paragraph and inside a fenced code block. Automated coverage of composition does not exist for WKWebView (Playwright's WebKit is not WKWebView, ADR-0014), so this list is the evidence.

Setup: System Settings → Keyboard → Input Sources: add **Vietnamese (Telex)**, **Vietnamese (VNI)**, **Japanese – Romaji**, **Pinyin – Simplified**, **2-Set Korean**. Switch sources with ⌃Space.

| # | Input source | Steps | Expected |
|---|---|---|---|
| 1 | Vietnamese Telex | Type `Tieesng Vieejt` then Space | `Tiếng Việt ` — marks placed on the right vowel, no stray base letters, nothing duplicated |
| 2 | Vietnamese Telex | Type `ddoongf`, then press ⌫ three times | `đồng` then `đ` — deletion removes composed characters one at a time, never splits a mark from its base |
| 3 | Vietnamese Telex | Type `as`, then `s` again (`ass`) | `as` → `ás` → `as` (tone toggles off, the letter `s` is not inserted twice) |
| 4 | Vietnamese Telex | Type a word, press ⌘Z | Whole word removed in one undo step; redo (⇧⌘Z) restores it; the document text equals what was visible |
| 5 | Vietnamese VNI | Type `Tie61ng Vie65t` | `Tiếng Việt` |
| 6 | Vietnamese Telex, selection | Select `test`, type `thuwr` | Selection replaced by `thử`, no leftover characters |
| 7 | Vietnamese Telex, line start | At the start of a line type `- ddaanf` | `- đần`; the list marker is not swallowed by composition |
| 8 | Vietnamese Telex, Enter | Type `xong` and press Return while the underline (marked text) is still showing | Composition commits, a new line starts with the dominant EOL (`crlf.md`: the file stays all-CRLF after save) |
| 9 | Japanese Romaji | Type `nihongo`, Space, Return | Candidate window appears over the caret, `日本語` committed, caret after it |
| 10 | Japanese Romaji | Type `kyou`, Space, Esc | Candidates dismissed, the hiragana stays as marked text; ⌫ removes it |
| 11 | Pinyin | Type `zhongwen`, choose candidate 1 | `中文`; the candidate list follows the caret when the line wraps |
| 12 | 2-Set Korean | Type `gksrmf` | `한글`, jamo combine into syllables while typing |
| 13 | Any CJK | Compose inside `**bold**` between the asterisks | Highlighting updates only after commit; marked text is not styled as Markdown syntax |
| 14 | Any IME, Split mode | Compose a word, wait 300 ms | Read pane does not re-render until the composition commits (no flicker of partial text), then shows the final word |
| 15 | Any IME | Compose, then click into the Read pane without committing | Composition commits (or is discarded) exactly as in TextEdit; nothing is left in an inconsistent marked state |
| 16 | Emoji picker (⌃⌘Space) | Insert `🇻🇳` and `👩‍💻` | Inserted as single units; ⌫ removes the whole flag / ZWJ sequence; `getContent()` round-trips the bytes |
| 17 | Dead keys (ABC – Extended) | Type `⌥e` then `a` | `á` |
| 18 | Dictation / Autocorrect | With Autocorrect on in System Settings, type `teh ` | WebKit's autocorrect replacement is reflected in the saved text and undoable |

Record the macOS version, Xcode version and the date in `docs/PLAN.md` (M2 section) when the list passes. Any failure: capture the exact keystrokes and the resulting `window.inlayEditor.getContent()` (Develop menu → Inspect Element → Console) in an issue.

## WYSIWYG (M3)

Open `fixtures/md/unicode-text.md` in WYSIWYG (View → WYSIWYG, ⌘1). Rows 1–12 and 16–18 above apply unchanged in a paragraph; in addition:

| # | Input source | Steps | Expected |
|---|---|---|---|
| W1 | Vietnamese Telex | In an empty paragraph type `# ` then `Tieesng Vieejt` | The `# ` input rule makes a heading (typed text); the composed word lands once inside it |
| W2 | Vietnamese Telex | Type `**` then compose `ddaamj` then type `**` | `**đậm**` becomes strong only after the second typed `**`; nothing changes while the underline is showing |
| W3 | Japanese Romaji | Compose `#` through the IME (full-width `＃` then convert to `#`) at a paragraph start, commit | Stays a literal `#` paragraph: rules never run on committed compositions (ADR-0034) |
| W4 | Pinyin | Compose inside a list item and inside a table cell | Candidates follow the caret; the list marker and the table stay intact; Tab still moves between cells |
| W5 | Any IME | Compose inside an island's in-place editor (click a raw HTML card) | CodeMirror behaviour as in Source mode; Escape after commit closes the editor and keeps the text |
| W6 | Any IME, Split | Not applicable (Split shows Source) | — |
| W7 | Any IME | Compose a word, press ⌘S while the underline shows | The saved file holds the committed text (the editor commits before `provideContent` runs); `git diff` shows one changed block |

Record the result in `docs/PLAN.md` (M3 section) when the list passes.
