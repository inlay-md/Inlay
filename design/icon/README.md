# Inlay icon assets

Vector masters for the app icon, mark and glyphs. Rendered PNGs are generated; edit the SVGs here and run `scripts/render-icons.sh`.

| File | Use |
| --- | --- |
| `inlay-icon.svg` | App icon master, 1024 canvas, 824 squircle on Apple's macOS icon grid. Used for 64 px and up. |
| `inlay-icon-small.svg` | Simplified cut for 16 and 32 px: thicker seam, one body line, bolder bars. |
| `inlay-mark.svg` | The mark alone on an ink rounded square. Favicon, social avatar, touch icon. |
| `inlay-template.svg` | Single-colour glyph in `currentColor` for the menu bar and toolbars. |
| `inlay-document.svg` | Document icon for `.md` on the website and in docs. Finder derives its own from the app icon. |
| `web/` | Rendered favicons and touch icons for inlay.live. |

Outputs:

- `apps/macos/Inlay/Resources/Assets.xcassets/AppIcon.appiconset/` is the Xcode app icon set (16 to 1024 px). The `Inlay` target in `apps/macos/project.yml` compiles it with `ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon`.
- `design/icon/web/` has `favicon.svg`, `favicon.ico` (16, 32, 48), PNG favicons, `apple-touch-icon.png` (180) and `icon-192.png` / `icon-512.png` for a web manifest.

Rendering goes through `scripts/icons/svg2png.swift`, a small AppKit program that draws the SVG with CoreSVG on a transparent bitmap. CoreSVG handles gradients and `feGaussianBlur` but not `feMerge`, so the icon's shadow is a separate blurred rectangle. `favicon.ico` needs ImageMagick (`brew install imagemagick`); the script skips it when `magick` is missing.

Colours: Ink `#141A22`, Paper `#F7F8FA`, Line `#C5CCD6`, Brass `#E0A83A`, Verdigris `#5FC9C0`. The brass seam is never recoloured.
