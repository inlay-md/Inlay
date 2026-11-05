// SPDX-License-Identifier: Apache-2.0
/**
 * Payload the host embeds in the shell page as `<script type="application/json" id="inlay-source">`.
 * Produced by the native scheme handler (apps/macos) and by the dev-server view route
 * (fixtures-plugin.ts); both must stay in sync with this shape.
 */
export interface EmbeddedSource {
  docId: string;
  /** Decoded document text without BOM. */
  text: string;
  /** Document base URL, ending in '/'. Never hardcoded in web code. */
  baseURL: string;
  path?: string;
  bom?: boolean;
  /** Quarantined and not yet trusted: render statically, scripts off. */
  quarantined?: boolean;
  allowNetwork?: boolean;
  theme?: 'light' | 'dark' | 'system';
  /** Browser development only: the fixture picker. */
  dev?: { fixtures: string[]; current: string };
}

export interface ReadViewPosition {
  /** 1-based source line at the top of the viewport (best effort). */
  line: number;
  scrollY: number;
  scrollHeight: number;
  viewportHeight: number;
}

/** Native calls these with `evaluateJavaScript`; there is no web → native channel (ADR-0010). */
export interface ReadViewApi {
  version: string;
  docId: string;
  /** Re-renders from the host's live source (reload; scroll position is preserved). */
  refresh(): void;
  getPosition(): ReadViewPosition;
  scrollToSourceLine(line: number): boolean;
  setTheme(theme: 'light' | 'dark' | 'system'): void;
  /** Rendering statistics for tests and the dev bar. */
  stats: { renderMs: number; lineCount: number; highlighted: number; mermaid: number };
}

declare global {
  interface Window {
    inlayReadView?: ReadViewApi;
  }
}
