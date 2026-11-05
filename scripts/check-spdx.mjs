#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Every tracked source file must carry `SPDX-License-Identifier: Apache-2.0` in its first lines.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './lib/deps.mjs';

const SOURCE = /\.(ts|mts|cts|tsx|js|mjs|cjs|swift|css|sh|py)$/;
const SKIP = [/^fixtures\/md\//, /\/dist\//, /\/generated\//, /\.d\.ts$/, /^docs\//];

const files = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
  .split('\n')
  .filter((f) => f && SOURCE.test(f) && !SKIP.some((re) => re.test(f)));

const missing = files.filter((f) => {
  const head = readFileSync(join(repoRoot, f), 'utf8').split('\n').slice(0, 5).join('\n');
  return !head.includes('SPDX-License-Identifier: Apache-2.0');
});

if (missing.length) {
  console.error(`Missing SPDX header in ${missing.length} file(s):`);
  for (const f of missing) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`SPDX headers present in ${files.length} source files.`);
