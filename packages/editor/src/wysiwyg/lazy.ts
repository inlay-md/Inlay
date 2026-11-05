// SPDX-License-Identifier: Apache-2.0
/**
 * Deferred rendering for node views whose preview is expensive (KaTeX, sanitized
 * HTML): the callback runs once the element comes within reach of the viewport.
 * One shared IntersectionObserver serves every view; the 10k-line fixture has over
 * three hundred math blocks, which would otherwise cost a third of the open budget.
 */
const callbacks = new WeakMap<Element, () => void>();
let observer: IntersectionObserver | null = null;

function shared(): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') return null;
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const cb = callbacks.get(entry.target);
          if (cb) {
            callbacks.delete(entry.target);
            observer?.unobserve(entry.target);
            cb();
          }
        }
      },
      { rootMargin: '600px 0px' },
    );
  }
  return observer;
}

/** Runs `render` when `el` nears the viewport (at once when observers are unavailable). */
export function whenVisible(el: Element, render: () => void): void {
  const io = shared();
  if (!io) {
    render();
    return;
  }
  callbacks.set(el, render);
  io.observe(el);
}

/** Cancels a pending `whenVisible` (the view was destroyed or rendered another way). */
export function cancelVisible(el: Element): void {
  if (callbacks.delete(el)) observer?.unobserve(el);
}
