// SPDX-License-Identifier: Apache-2.0
/**
 * Origin checks that work for custom-scheme origins (`mdview://docid`), the
 * Tauri mapping (`http://mdview.localhost`) and plain http(s) dev servers.
 * WebKit reports the origin of some custom-scheme documents as the string "null";
 * such an origin is only trusted when the base URL itself is opaque the same way.
 */

/** Returns the serialized origin of a URL, or "null" when it has no tuple origin. */
export function originOf(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'null';
  }
  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase();
  if (scheme === 'http' || scheme === 'https') {
    return parsed.origin;
  }
  // Non-http(s) schemes: URL.origin is "null" in browsers, so build scheme://host[:port].
  if (!parsed.host) return 'null';
  return `${scheme}://${parsed.host.toLowerCase()}`;
}

/**
 * True when `origin` (as reported by a `message` event or `location.origin`)
 * denotes the same origin as `baseURL` (from `DocumentInfo.baseURL`).
 */
export function isTrustedOrigin(origin: string | null | undefined, baseURL: string): boolean {
  if (origin === null || origin === undefined || origin === '') return false;
  const expected = originOf(baseURL);
  if (expected === 'null') {
    // Opaque base: only accept an equally opaque reporter when the scheme matches.
    return origin === 'null' && !/^https?:/i.test(baseURL);
  }
  if (origin === 'null') return false;
  const normalized =
    origin.endsWith('/') && !/^[a-z][a-z0-9+.-]*:\/\/[^/]+$/i.test(origin)
      ? originOf(origin)
      : origin;
  return normalized.toLowerCase() === expected.toLowerCase();
}
