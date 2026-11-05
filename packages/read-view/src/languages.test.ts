// SPDX-License-Identifier: Apache-2.0
import { BUNDLED_LANGUAGE_IDS } from '@inlay-md/md-render/bundled';
import { describe, expect, it } from 'vitest';
import { loaderIdFor } from './highlight-lazy.ts';
import { LAZY_LANGUAGE_IDS } from './languages.ts';

describe('lazy languages', () => {
  it('match the grammar set bundled into the JavaScriptCore build', () => {
    expect([...LAZY_LANGUAGE_IDS].sort()).toEqual([...BUNDLED_LANGUAGE_IDS].sort());
  });
  it('map fence names and aliases to a loadable chunk', () => {
    expect(loaderIdFor('TS', [])).toBe('typescript');
    expect(loaderIdFor('golang', [])).toBe('go');
    expect(loaderIdFor('objective-c', [])).toBe('objective-c');
    expect(loaderIdFor('sh', [])).toBe('shellscript');
    expect(loaderIdFor('nope', [])).toBeNull();
    expect(loaderIdFor('custom', ['custom'])).toBe('custom');
  });
});
