// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, resolveSettings } from './settings.ts';

describe('resolveSettings', () => {
  it('returns defaults for empty or garbage input', () => {
    expect(resolveSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(resolveSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(resolveSettings('nope')).toEqual(DEFAULT_SETTINGS);
  });
  it('merges nested patches and keeps the version', () => {
    const s = resolveSettings({ version: 99, theme: 'dark', quickLook: { runScripts: true } });
    expect(s.theme).toBe('dark');
    expect(s.quickLook.runScripts).toBe(true);
    expect(s.editor.fontSize).toBe(DEFAULT_SETTINGS.editor.fontSize);
    expect(s.version).toBe(1);
  });
  it('drops unknown keys and wrongly typed values', () => {
    const s = resolveSettings({ bogus: 1, editor: { fontSize: 'big', defaultMode: 'source' } });
    expect('bogus' in s).toBe(false);
    expect(s.editor.fontSize).toBe(DEFAULT_SETTINGS.editor.fontSize);
    expect(s.editor.defaultMode).toBe('source');
  });
  it('does not mutate the defaults', () => {
    const before = structuredClone(DEFAULT_SETTINGS);
    resolveSettings({ theme: 'light', editor: { fontSize: 1 } });
    expect(DEFAULT_SETTINGS).toEqual(before);
  });
});
