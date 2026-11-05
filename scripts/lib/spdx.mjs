// SPDX-License-Identifier: Apache-2.0
// Minimal SPDX license-expression evaluation: supports AND, OR, WITH and parentheses.
// An expression is normalized to a list of alternatives (OR branches); each alternative
// is the set of license identifiers that all apply (AND terms). `X WITH exception` is X.

/** @param {string} expr @returns {string[][]} alternatives, each a list of license ids */
export function alternatives(expr) {
  const tokens = tokenize(String(expr ?? '').trim());
  if (tokens.length === 0) return [[]];
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseOr() {
    let left = parseAnd();
    while (peek()?.toUpperCase() === 'OR') {
      next();
      left = left.concat(parseAnd());
    }
    return left;
  }
  function parseAnd() {
    let left = parsePrimary();
    while (peek()?.toUpperCase() === 'AND') {
      next();
      const right = parsePrimary();
      const combined = [];
      for (const a of left) for (const b of right) combined.push([...new Set([...a, ...b])]);
      left = combined;
    }
    return left;
  }
  function parsePrimary() {
    const t = next();
    if (t === '(') {
      const inner = parseOr();
      if (peek() === ')') next();
      return inner;
    }
    let id = t ?? '';
    if (peek()?.toUpperCase() === 'WITH') {
      next();
      next(); // exception id
    }
    id = id.replace(/\+$/, '');
    return [[id]];
  }
  return parseOr();
}

function tokenize(expr) {
  return [...expr.matchAll(/\(|\)|[^\s()]+/g)].map((m) => m[0]);
}

/** Normalizes legacy package.json license shapes to an SPDX-ish string. */
export function licenseString(pkg) {
  const lic = pkg?.license ?? pkg?.licenses;
  if (!lic) return 'UNKNOWN';
  if (typeof lic === 'string') return lic.replace(/^\(|\)$/g, '') || 'UNKNOWN';
  if (Array.isArray(lic))
    return (
      lic
        .map((l) => (typeof l === 'string' ? l : l?.type))
        .filter(Boolean)
        .join(' OR ') || 'UNKNOWN'
    );
  if (typeof lic === 'object' && lic.type) return lic.type;
  return 'UNKNOWN';
}

/** True when some OR-alternative consists only of allowed identifiers (case-insensitive). */
export function isAllowed(expr, allowed) {
  const set = new Set(allowed.map((a) => a.toLowerCase()));
  return alternatives(expr).some(
    (alt) => alt.length > 0 && alt.every((id) => set.has(id.toLowerCase())),
  );
}

const DENIED = /^(A|L)?GPL(-|$)|^GPL|^AGPL|^LGPL|^SSPL|^EUPL/i;

/** True when every OR-alternative contains a copyleft (GPL-family) identifier: no way to take it without GPL. */
export function isDenied(expr) {
  const alts = alternatives(expr);
  return alts.length > 0 && alts.every((alt) => alt.some((id) => DENIED.test(id)));
}

/** Identifiers in the expression that match the deny pattern (for reporting dual-licensed cases). */
export function deniedIds(expr) {
  return [
    ...new Set(
      alternatives(expr)
        .flat()
        .filter((id) => DENIED.test(id)),
    ),
  ];
}
