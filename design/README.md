# Inlay design

Brand and UI sources for the app and the website. The app does not look like this yet; `docs/PLAN.md` lists, per milestone, what gets built from these.

- `icon/` — SVG masters for the app icon, mark and glyphs, plus the rendered web favicons. See `icon/README.md`.
- `ui/` — the nine artboards from the "Inlay Brand & UI" canvas, exported as standalone HTML (open any file in a browser). Mockups, not app code.
- `ui/png/` — screenshots of the artboards at 2× for the README and reviews. `pnpm design:render` regenerates them with the Playwright Chromium the e2e tests use.

The canvas these were designed on is at https://claude.ai/artifact/M3xpg5PiXRRJY4Fv54qF6L (private to the product owner; ask for access).

## The idea

An inlay is a piece set flush into a surface. Every board carries the same image: a page of grey prose with a dark tile set into it, sealed by a thin brass seam. The tile is the HTML, SVG and script that other editors strip out.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| Ink | `#141A22` | | Text, window on dark boards, the tile |
| Ink 2 | `#2C3847` | | Secondary dark surfaces |
| Paper | `#FFFFFF` / `#F4F5F7` | | Page and chrome |
| Line | `#DDE1E7` | | Borders, table rules |
| Muted | `#5B6673` | `#A9B3BF` | Secondary text (5.4:1 on white) |
| Brass | `#9A6E1A` | `#E0A83A` | The seam: links, focus, island edge, Markdown syntax |
| Verdigris | `#1F7A7A` | `#5FC9C0` | Anything live: scripts on, rendered figures, checked tasks |

Type: the Mac app uses the system font (SF Pro) and SF Mono. The website and the About window use Sora (display), Inter (body) and JetBrains Mono (code), all under the SIL Open Font License, which the brief allows for font files. Shapes: 6 px controls, 10 px cards and islands, pills for status. Icons: 1.8 px stroke on a 24 grid, round joins.
