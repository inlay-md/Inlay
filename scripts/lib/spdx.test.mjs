// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { alternatives, deniedIds, isAllowed, isDenied, licenseString } from './spdx.mjs';

const ALLOW = ['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD'];

describe('spdx', () => {
  it('parses OR / AND / WITH / parentheses', () => {
    expect(alternatives('MIT')).toEqual([['MIT']]);
    expect(alternatives('(MIT OR Apache-2.0)')).toEqual([['MIT'], ['Apache-2.0']]);
    expect(alternatives('MIT AND BSD-3-Clause')).toEqual([['MIT', 'BSD-3-Clause']]);
    expect(alternatives('(MIT OR GPL-3.0) AND ISC')).toEqual([
      ['MIT', 'ISC'],
      ['GPL-3.0', 'ISC'],
    ]);
    expect(alternatives('Apache-2.0 WITH LLVM-exception')).toEqual([['Apache-2.0']]);
    expect(alternatives('GPL-2.0+')).toEqual([['GPL-2.0']]);
  });
  it('allows when some alternative is fully allowed', () => {
    expect(isAllowed('MIT', ALLOW)).toBe(true);
    expect(isAllowed('Apache-2.0 OR MPL-2.0', ALLOW)).toBe(true);
    expect(isAllowed('MPL-2.0', ALLOW)).toBe(false);
    expect(isAllowed('MIT AND CC-BY-4.0', ALLOW)).toBe(false);
    expect(isAllowed('UNKNOWN', ALLOW)).toBe(false);
    expect(isAllowed('', ALLOW)).toBe(false);
    expect(isAllowed('mit', ALLOW)).toBe(true);
  });
  it('denies GPL-family unless an alternative avoids it', () => {
    expect(isDenied('GPL-3.0-only')).toBe(true);
    expect(isDenied('LGPL-2.1')).toBe(true);
    expect(isDenied('AGPL-3.0')).toBe(true);
    expect(isDenied('MIT AND GPL-2.0')).toBe(true);
    expect(isDenied('MIT OR GPL-2.0')).toBe(false);
    expect(isDenied('MIT')).toBe(false);
    expect(deniedIds('MIT OR LGPL-3.0')).toEqual(['LGPL-3.0']);
  });
  it('normalizes legacy license fields', () => {
    expect(licenseString({ license: 'MIT' })).toBe('MIT');
    expect(licenseString({ license: { type: 'BSD-3-Clause' } })).toBe('BSD-3-Clause');
    expect(licenseString({ licenses: [{ type: 'MIT' }, { type: 'Apache-2.0' }] })).toBe(
      'MIT OR Apache-2.0',
    );
    expect(licenseString({})).toBe('UNKNOWN');
  });
});
