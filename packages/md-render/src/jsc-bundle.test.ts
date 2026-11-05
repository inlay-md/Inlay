// SPDX-License-Identifier: Apache-2.0
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { buildJsc } from '../scripts/build-jsc.ts';

describe('JavaScriptCore bundle', () => {
  it('is a self-contained IIFE that runs without any DOM or browser globals', async () => {
    const result = await buildJsc({ write: false });
    const file = result.outputFiles?.[0];
    expect(file).toBeDefined();
    const code = file?.text ?? '';
    expect(code).toMatch(/^var InlayRender = \(\(\) => \{/m);
    expect(code).not.toMatch(/\b(document|window|navigator|localStorage)\b\./);

    // Bare context: no console, no setTimeout, no TextEncoder — like a fresh JSContext.
    const context = vm.createContext(Object.create(null));
    vm.runInContext(code, context, { filename: 'md-render.jsc.js' });
    const out = vm.runInContext(
      'JSON.stringify(InlayRender.render("# Hi\\n\\nTiếng Việt <b>x</b>", { mode: "static" }))',
      context,
    ) as string;
    const parsed = JSON.parse(out) as { html: string; meta: { title: string; lineCount: number } };
    expect(parsed.meta.title).toBe('Hi');
    expect(parsed.meta.lineCount).toBe(3);
    expect(parsed.html).toContain('Tiếng Việt &lt;b&gt;x&lt;/b&gt;');
    expect(vm.runInContext('typeof InlayRender.version', context)).toBe('string');
  });
});
