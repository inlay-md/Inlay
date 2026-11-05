#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Renders the SVG icon masters in design/icon into the Xcode app icon set and the web favicons.
# Run after editing anything in design/icon/*.svg. Needs Xcode command line tools (swiftc).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/design/icon"
APPICON="$ROOT/apps/macos/Inlay/Resources/Assets.xcassets/AppIcon.appiconset"
WEB="$ROOT/design/icon/web"
BIN="$(mktemp -d)/svg2png"
swiftc -O -o "$BIN" "$ROOT/scripts/icons/svg2png.swift"

mkdir -p "$APPICON" "$WEB"
render() { "$BIN" "$SRC/$1" "$2" "$3"; echo "  $3 (${2##*/})"; }

echo "App icon set → ${APPICON#$ROOT/}"
# 16 and 32 pt @1x use the simplified cut; everything from 64 px up uses the full master.
render inlay-icon-small.svg "$APPICON/icon_16x16.png" 16
render inlay-icon-small.svg "$APPICON/icon_16x16@2x.png" 32
render inlay-icon-small.svg "$APPICON/icon_32x32.png" 32
render inlay-icon.svg "$APPICON/icon_32x32@2x.png" 64
render inlay-icon.svg "$APPICON/icon_128x128.png" 128
render inlay-icon.svg "$APPICON/icon_128x128@2x.png" 256
render inlay-icon.svg "$APPICON/icon_256x256.png" 256
render inlay-icon.svg "$APPICON/icon_256x256@2x.png" 512
render inlay-icon.svg "$APPICON/icon_512x512.png" 512
render inlay-icon.svg "$APPICON/icon_512x512@2x.png" 1024

echo "Web favicons → ${WEB#$ROOT/}"
cp "$SRC/inlay-mark.svg" "$WEB/favicon.svg"
render inlay-mark.svg "$WEB/favicon-16.png" 16
render inlay-mark.svg "$WEB/favicon-32.png" 32
render inlay-mark.svg "$WEB/favicon-48.png" 48
render inlay-mark.svg "$WEB/apple-touch-icon.png" 180
render inlay-mark.svg "$WEB/icon-192.png" 192
render inlay-mark.svg "$WEB/icon-512.png" 512
render inlay-icon.svg "$WEB/app-icon-1024.png" 1024
magick "$WEB/favicon-16.png" "$WEB/favicon-32.png" "$WEB/favicon-48.png" "$WEB/favicon.ico" 2>/dev/null \
  && echo "  favicon.ico (16, 32, 48)" || echo "  favicon.ico skipped: ImageMagick (magick) not installed"
