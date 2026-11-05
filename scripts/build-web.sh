#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Builds the web bundles and copies them where the Xcode targets expect them:
#   apps/macos/Inlay/Resources/generated/web/read-view/      (Read view shell + runtime)
#   apps/macos/Inlay/Resources/generated/web/editor/         (editor page: CodeMirror Source mode)
#   apps/macos/Inlay/Resources/generated/THIRD_PARTY_NOTICES.md
#   apps/macos/InlayCore/Sources/InlayCore/Resources/md-render.jsc.js (JavaScriptCore bundle)
# Set SKIP_WEB_BUILD=1 to only copy already-built output.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin:$HOME/Library/pnpm:$HOME/.local/share/pnpm"

if [[ "${SKIP_WEB_BUILD:-0}" != "1" ]]; then
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "build-web: pnpm not found on PATH; run 'pnpm build' first or set SKIP_WEB_BUILD=1" >&2
    exit 1
  fi
  pnpm -s build
fi

gen="apps/macos/Inlay/Resources/generated"
rm -rf "$gen/web"
mkdir -p "$gen/web/read-view"
cp -R packages/read-view/dist/. "$gen/web/read-view/"
mkdir -p "$gen/web/editor"
cp -R packages/editor/dist/. "$gen/web/editor/"
if [[ -f THIRD_PARTY_NOTICES.md ]]; then
  cp THIRD_PARTY_NOTICES.md "$gen/THIRD_PARTY_NOTICES.md"
else
  printf '# Third-party notices\n\nNot generated yet. Run `pnpm notices`.\n' > "$gen/THIRD_PARTY_NOTICES.md"
fi
mkdir -p apps/macos/InlayCore/Sources/InlayCore/Resources
cp packages/md-render/dist/md-render.jsc.js apps/macos/InlayCore/Sources/InlayCore/Resources/md-render.jsc.js
echo "build-web: copied web bundles into apps/macos"
