// SPDX-License-Identifier: Apache-2.0
/**
 * The Host boundary: every web ↔ native call goes through this interface.
 * Web code never touches `window.webkit` or hardcodes custom-scheme URLs;
 * the platform adapter (`WebKitHost`, later a Tauri adapter) implements it,
 * and `MockHost` implements it for the browser and tests.
 */
import type { Settings } from './settings.ts';

export type Mode = 'wysiwyg' | 'source' | 'split' | 'read';

/** Line ending styles a document may use. `eol` is the dominant one. */
export type Eol = '\n' | '\r\n' | '\r';

export interface DocumentInfo {
  /** Opaque id assigned by the host; also the host part of the document base URL. */
  docId: string;
  /** Absolute path on disk, or null for an unsaved document. */
  path: string | null;
  /** Losslessly decoded UTF-8 text without BOM. Offsets into it are UTF-16 code units. */
  text: string;
  /** Whether the file started with a UTF-8 BOM (re-added by the host on save). */
  bom: boolean;
  /** Dominant line ending. */
  eol: Eol;
  /** The file carried `com.apple.quarantine` and is not yet trusted: scripts stay off. */
  quarantined: boolean;
  /** Base URL for resolving relative assets; ends with '/'. Never hardcode its scheme. */
  baseURL: string;
  /** True when the host cannot write the document back losslessly (e.g. non-UTF-8). */
  readOnly: boolean;
}

export interface HostEvents {
  /** The file changed on disk. The web core decides whether to reload or show a conflict. */
  fileChanged: { path: string };
  settingsChanged: Settings;
  /** Native asks the web core to switch mode (menu, shortcut). */
  modeRequested: Mode;
  /** Appearance changed (system or user override). */
  themeChanged: 'light' | 'dark';
}

/** Supplies the live document text when the host saves. Never a cached copy. */
export type ContentProvider = () => string | Promise<string>;

export interface Host {
  openDocument(): Promise<DocumentInfo>;
  /** Reads a file relative to the document folder. Rejects on traversal outside it. */
  readFile(relPath: string): Promise<Uint8Array>;
  /** Resolves a document-relative path against the document base URL. */
  resolveAssetURL(relPath: string): string;
  /** Asks the host to save; the host calls the registered ContentProvider for the text. */
  saveDocument(): Promise<void>;
  openExternal(url: string): Promise<void>;
  getSettings(): Promise<Settings>;
  setSettings(patch: Partial<Settings>): Promise<Settings>;
  setDirty(dirty: boolean): void;
  requestMode(mode: Mode): void;
  /** Debounced upstream; tells the host the live content changed (Read view refresh). */
  notifyContentChanged(): void;
  provideContent(provider: ContentProvider): void;
  on<K extends keyof HostEvents>(event: K, handler: (payload: HostEvents[K]) => void): () => void;
}
