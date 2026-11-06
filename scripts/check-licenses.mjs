#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// License policy check (ADR-0015):
//  - GPL/AGPL/LGPL-family licenses fail anywhere in the npm tree (dev tools included).
//  - Shipped code (prod npm deps, Swift packages, bundled fonts) must be on the allowlist
//    or covered by an approved exception in scripts/license-policy.json.
import { npmPackages, readJson, swiftPins } from './lib/deps.mjs';
import { deniedIds, isAllowed, isDenied } from './lib/spdx.mjs';

const policy = readJson('scripts/license-policy.json');
const swift = readJson('scripts/swift-packages.json').packages;
const fonts = readJson('scripts/bundled-fonts.json').fonts;

const errors = [];
const notes = [];
const pending = [];

function exceptionFor(name, license, scope) {
  return policy.exceptions.find(
    (e) =>
      (e.scope === scope || e.scope === 'any') &&
      e.license.toLowerCase() === String(license).toLowerCase() &&
      (!e.name || e.name === name),
  );
}

function noteException(name, license, exception) {
  if (exception.status === 'pending') {
    pending.push(`PENDING ${name}: ${license} — awaiting the product owner (${exception.reason})`);
  } else {
    notes.push(`except  ${name}: ${license} (approved exception)`);
  }
}

// 1. Deny-list over the whole tree.
for (const p of npmPackages({ prod: false })) {
  if (isDenied(p.license)) errors.push(`DENIED  ${p.name}@${p.versions.join(',')}: ${p.license}`);
  else if (deniedIds(p.license).length)
    notes.push(`dual    ${p.name}: ${p.license} (taken under the non-GPL alternative)`);
}

// 2. Allowlist over shipped npm deps.
for (const p of npmPackages({ prod: true })) {
  if (isAllowed(p.license, policy.allowlist)) continue;
  const exception = exceptionFor(p.name, p.license, 'shipped');
  if (exception) {
    noteException(p.name, p.license, exception);
    continue;
  }
  errors.push(
    `SHIPPED ${p.name}@${p.versions.join(',')}: ${p.license} is not on the allowlist; ask the product owner`,
  );
}

// 3. Swift packages: every pin must be inventoried and allowed.
const inventory = new Map(swift.map((s) => [s.identity.toLowerCase(), s]));
for (const pin of swiftPins()) {
  const entry = inventory.get(pin.identity.toLowerCase());
  if (!entry) {
    errors.push(
      `SWIFT   ${pin.identity} (${pin.url}) is not listed in scripts/swift-packages.json`,
    );
    continue;
  }
  if (
    !isAllowed(entry.license, policy.allowlist) &&
    !exceptionFor(pin.identity, entry.license, 'shipped')
  ) {
    errors.push(`SWIFT   ${pin.identity}: ${entry.license} is not on the allowlist`);
  }
}

// 4. Fonts.
for (const f of fonts) {
  if (isAllowed(f.license, policy.allowlist) || exceptionFor(f.name, f.license, 'fonts')) continue;
  errors.push(`FONT    ${f.name}: ${f.license} is not allowed for bundled fonts`);
}

for (const n of notes) console.log(`note    ${n}`);
if (pending.length) {
  console.log(
    `\n${pending.length} license exception(s) are PENDING the product owner's decision (scripts/license-policy.json):`,
  );
  for (const p of pending) console.log(`  ${p}`);
  console.log('');
}
if (errors.length) {
  console.error(`\nLicense check failed (${errors.length}):`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(
  `License check passed: ${npmPackages({ prod: false }).length} npm packages scanned, ${npmPackages({ prod: true }).length} shipped, ${swiftPins().length} Swift packages, ${fonts.length} fonts.`,
);
