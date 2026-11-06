// SPDX-License-Identifier: Apache-2.0
/**
 * Scroll ↔ source-line mapping over `data-source-line="start-end"` attributes,
 * plus save/restore of the position across refreshes (sessionStorage, which
 * lives in the webview's non-persistent store).
 */
import type { ReadViewPosition } from './types.ts';

interface Block {
  el: HTMLElement;
  start: number;
  end: number;
}

export function parseRange(value: string | null | undefined): [number, number] | null {
  if (!value) return null;
  const m = /^(\d+)(?:-(\d+))?$/.exec(value.trim());
  if (!m?.[1]) return null;
  const start = Number(m[1]);
  const end = m[2] ? Number(m[2]) : start;
  return start > 0 && end >= start ? [start, end] : null;
}

function blocks(root: ParentNode): Block[] {
  const out: Block[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('[data-source-line]')) {
    const range = parseRange(el.dataset.sourceLine);
    if (range) out.push({ el, start: range[0], end: range[1] });
  }
  return out;
}

/** Height of fixed/sticky chrome at the top of the viewport (the dev bar). */
function topChrome(): number {
  const bar = document.getElementById('inlay-dev-bar');
  return bar ? bar.getBoundingClientRect().height : 0;
}

export function getPosition(root: ParentNode = document): ReadViewPosition {
  const top = topChrome();
  let line = 1;
  let best: Block | null = null;
  let bestBottom = Number.POSITIVE_INFINITY;
  for (const b of blocks(root)) {
    const rect = b.el.getBoundingClientRect();
    if (rect.height === 0) continue;
    // First block whose bottom edge is below the top of the viewport.
    if (rect.bottom > top && rect.bottom < bestBottom) {
      best = b;
      bestBottom = rect.bottom;
    }
  }
  if (best) {
    const rect = best.el.getBoundingClientRect();
    const fraction = rect.height > 0 ? Math.min(1, Math.max(0, (top - rect.top) / rect.height)) : 0;
    line = best.start + Math.floor(fraction * (best.end - best.start + 1));
  }
  return {
    line,
    scrollY: window.scrollY,
    scrollHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
  };
}

/** Scrolls so that `line` sits at the top of the viewport; false when no block covers or precedes it. */
export function scrollToSourceLine(line: number, root: ParentNode = document): boolean {
  const all = blocks(root);
  if (all.length === 0) return false;
  // Prefer the innermost block covering the line (smallest range), else the closest preceding block.
  let target: Block | null = null;
  for (const b of all) {
    if (b.start <= line && line <= b.end) {
      if (!target || b.end - b.start < target.end - target.start) target = b;
    }
  }
  if (!target) {
    for (const b of all) if (b.start <= line && (!target || b.start > target.start)) target = b;
  }
  if (!target) target = all[0] ?? null;
  if (!target) return false;
  const rect = target.el.getBoundingClientRect();
  const span = target.end - target.start + 1;
  const fraction = span > 1 ? Math.min(1, Math.max(0, (line - target.start) / span)) : 0;
  const y = window.scrollY + rect.top - topChrome() + fraction * rect.height;
  window.scrollTo({ top: Math.max(0, y) });
  return true;
}

const KEY_PREFIX = 'inlay:scroll:';

export interface SavedPosition {
  line: number;
  scrollY: number;
}

export function savePosition(docId: string, pos: SavedPosition): void {
  try {
    sessionStorage.setItem(KEY_PREFIX + docId, JSON.stringify(pos));
  } catch {
    /* storage unavailable */
  }
}

export function loadPosition(docId: string): SavedPosition | null {
  try {
    const raw = sessionStorage.getItem(KEY_PREFIX + docId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedPosition>;
    if (typeof parsed.line !== 'number' || typeof parsed.scrollY !== 'number') return null;
    return { line: parsed.line, scrollY: parsed.scrollY };
  } catch {
    return null;
  }
}

/** Restores a saved position: by source line when it still exists, else by pixel offset. */
export function restorePosition(saved: SavedPosition): void {
  if (saved.scrollY <= 0 && saved.line <= 1) return;
  const maxY = document.documentElement.scrollHeight - window.innerHeight;
  if (saved.line > 1 && scrollToSourceLine(saved.line)) return;
  window.scrollTo({ top: Math.min(saved.scrollY, Math.max(0, maxY)) });
}
