// SPDX-License-Identifier: Apache-2.0
import vm from 'node:vm';
import { decodeFixture, manifest, readFixtureBytes } from '@inlay-md/fixtures';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildJsc } from '../scripts/build-jsc.ts';
import { createBundledHighlighter } from './highlight-bundled.ts';
import { render } from './index.ts';

interface JscRender {
  render(
    markdown: string,
    options?: Record<string, unknown>,
  ): { html: string; meta: Record<string, unknown> };
  version: string;
  themeCSS: string;
  languages: string[];
}

describe('JavaScriptCore bundle', () => {
  let code = '';
  let api: JscRender;

  beforeAll(async () => {
    const result = await buildJsc({ write: false });
    const file = result.outputFiles?.[0];
    expect(file).toBeDefined();
    code = file?.text ?? '';
    // Bare context: no console, no setTimeout, no TextEncoder, no DOM — like a fresh JSContext.
    const context = vm.createContext(Object.create(null));
    vm.runInContext(code, context, { filename: 'md-render.jsc.js' });
    api = vm.runInContext('InlayRender', context) as JscRender;
  }, 120_000);

  it('is a self-contained IIFE exposing render, version, themeCSS and languages', () => {
    expect(code).toMatch(/^var InlayRender = \(\(\) => \{/m);
    expect(code).not.toMatch(/\b(navigator|localStorage|sessionStorage)\./);
    expect(typeof api.version).toBe('string');
    expect(api.themeCSS).toContain('--inlay-bg');
    expect(api.languages).toContain('swift');
    const out = api.render('# Hi\n\nTiếng Việt <b>x</b>\n\n```js\nlet a = 1\n```\n', {
      mode: 'static',
    });
    expect(out.meta['title']).toBe('Hi');
    expect(out.meta['lineCount']).toBe(8);
    expect(out.html).toContain('Tiếng Việt <b>x</b>');
    expect(out.html).toContain('class="shiki');
  });

  it('renders every fixture identically to the browser build in every mode (parity, ADR-0006)', () => {
    const highlighter = createBundledHighlighter();
    for (const entry of manifest) {
      if (entry.render === false || entry.utf8 === false) continue;
      const { text } = decodeFixture(readFixtureBytes(entry.file));
      for (const mode of ['full', 'static', 'sanitized'] as const) {
        const expected = render(text, { mode, highlighter, vendorBaseURL: 'cid:vendor/' });
        const actual = api.render(text, { mode, vendorBaseURL: 'cid:vendor/' });
        expect(actual.html, `${entry.file} [${mode}]`).toBe(expected.html);
        expect(actual.meta, `${entry.file} [${mode}] meta`).toEqual(expected.meta);
      }
    }
  }, 60_000);
});
