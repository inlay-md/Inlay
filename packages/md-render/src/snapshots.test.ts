// SPDX-License-Identifier: Apache-2.0
// Golden HTML per fixture per mode. Review diffs deliberately: `pnpm vitest run -u` after a confirmed change.
import { createHash } from 'node:crypto';
import { decodeFixture, manifest, readFixtureBytes } from '@inlay-md/fixtures';
import { describe, expect, it } from 'vitest';
import { createBundledHighlighter } from './highlight-bundled.ts';
import { type RenderMode, render } from './index.ts';

const MODES: RenderMode[] = ['full', 'static', 'sanitized'];
const VENDOR = 'mdview://doc/__inlay/vendor/';

describe('fixture snapshots', () => {
  const highlighter = createBundledHighlighter();
  for (const entry of manifest) {
    if (entry.render === false || entry.utf8 === false) continue;
    const { text } = decodeFixture(readFixtureBytes(entry.file));
    for (const mode of MODES) {
      // The 10k-line fixture takes several seconds on CI runners (synchronous highlighting under
      // Vitest); give it room beyond the default 5 s per-test timeout.
      const timeout = entry.category === 'performance' ? 60_000 : 5_000;
      it(
        `${entry.file} [${mode}]`,
        () => {
          const started = performance.now();
          const { html, meta } = render(text, { mode, highlighter, vendorBaseURL: VENDOR });
          const ms = performance.now() - started;
          if (entry.category === 'performance') {
            // Too large to snapshot literally; hash it instead. This run includes synchronous
            // highlighting of every code block under Vitest, so it is only a sanity cap; the
            // product budget (first paint without highlighting) is asserted in Playwright.
            expect(createHash('sha256').update(html).digest('hex')).toMatchSnapshot();
            expect(ms, `${entry.file} took ${ms.toFixed(0)} ms`).toBeLessThan(15_000);
          } else {
            expect(html).toMatchSnapshot();
          }
          expect(meta).toMatchSnapshot();
        },
        timeout,
      );
    }
  }
});
