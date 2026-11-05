#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Developer Certificate of Origin: every commit in the range needs a Signed-off-by trailer.
// Usage: node scripts/check-dco.mjs [<range>]   (default HEAD~1..HEAD; CI passes base..HEAD)
import { execFileSync } from 'node:child_process';
import { repoRoot } from './lib/deps.mjs';

const range = process.argv[2] ?? 'HEAD~1..HEAD';
let raw;
try {
  raw = execFileSync('git', ['log', '--no-merges', '--format=%H%x1f%an%x1f%s%x1f%b%x1e', range], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
} catch (error) {
  console.error(`check-dco: cannot read range ${range}: ${error.message}`);
  process.exit(2);
}
const commits = raw
  .split('\x1e')
  .map((c) => c.trim())
  .filter(Boolean)
  .map((c) => {
    const [hash, author, subject, body] = c.split('\x1f');
    return { hash, author, subject, body: body ?? '' };
  });

const bad = commits.filter((c) => !/^Signed-off-by: .+ <.+@.+>$/m.test(c.body));
if (bad.length) {
  console.error(
    `DCO check failed: ${bad.length} commit(s) without Signed-off-by (use git commit -s):`,
  );
  for (const c of bad) console.error(`  ${c.hash.slice(0, 10)} ${c.subject} (${c.author})`);
  process.exit(1);
}
console.log(`DCO check passed for ${commits.length} commit(s) in ${range}.`);
