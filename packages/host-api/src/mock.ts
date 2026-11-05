// SPDX-License-Identifier: Apache-2.0
import { Emitter } from './events.ts';
import type { ContentProvider, DocumentInfo, Eol, Host, HostEvents, Mode } from './host.ts';
import {
  DEFAULT_SETTINGS,
  resolveSettings,
  type Settings,
  type SettingsPatch,
} from './settings.ts';

export interface MockHostOptions {
  docId?: string;
  path?: string | null;
  text?: string;
  bom?: boolean;
  eol?: Eol;
  quarantined?: boolean;
  baseURL?: string;
  readOnly?: boolean;
  /** Files reachable via readFile, keyed by document-relative path. */
  files?: Record<string, Uint8Array | string>;
  settings?: SettingsPatch;
}

/** Detects the dominant line ending of a text; defaults to '\n'. */
export function detectEol(text: string): Eol {
  let crlf = 0;
  let lf = 0;
  let cr = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 13) {
      if (text.charCodeAt(i + 1) === 10) {
        crlf++;
        i++;
      } else cr++;
    } else if (c === 10) lf++;
  }
  if (crlf >= lf && crlf >= cr && crlf > 0) return '\r\n';
  if (cr > lf && cr > crlf) return '\r';
  return '\n';
}

function normalizeRelPath(relPath: string): string | null {
  const parts = relPath.replace(/\\/g, '/').split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (out.length === 0) return null; // escapes the document folder
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join('/');
}

/** In-memory Host for the browser dev server and tests. */
export class MockHost implements Host {
  readonly events = new Emitter<HostEvents>();
  readonly calls: Array<{ method: string; args: unknown[] }> = [];
  private info: DocumentInfo;
  private settings: Settings;
  private readonly files = new Map<string, Uint8Array>();
  private provider: ContentProvider | null = null;
  dirty = false;
  /** Text captured by the last saveDocument(). */
  lastSavedText: string | null = null;

  constructor(options: MockHostOptions = {}) {
    const text = options.text ?? '';
    const docId = options.docId ?? 'mock-doc';
    this.info = {
      docId,
      path: options.path ?? null,
      text,
      bom: options.bom ?? false,
      eol: options.eol ?? detectEol(text),
      quarantined: options.quarantined ?? false,
      baseURL: options.baseURL ?? `http://localhost/docs/${docId}/`,
      readOnly: options.readOnly ?? false,
    };
    this.settings = resolveSettings(options.settings ?? DEFAULT_SETTINGS);
    for (const [path, data] of Object.entries(options.files ?? {})) {
      this.files.set(
        normalizeRelPath(path) ?? path,
        typeof data === 'string' ? new TextEncoder().encode(data) : data,
      );
    }
  }

  private record(method: string, ...args: unknown[]): void {
    this.calls.push({ method, args });
  }

  async openDocument(): Promise<DocumentInfo> {
    this.record('openDocument');
    return { ...this.info };
  }

  async readFile(relPath: string): Promise<Uint8Array> {
    this.record('readFile', relPath);
    const key = normalizeRelPath(relPath);
    if (key === null) throw new Error(`readFile: path escapes the document folder: ${relPath}`);
    const data = this.files.get(key);
    if (!data) throw new Error(`readFile: not found: ${relPath}`);
    return data;
  }

  resolveAssetURL(relPath: string): string {
    const key = normalizeRelPath(relPath);
    if (key === null)
      throw new Error(`resolveAssetURL: path escapes the document folder: ${relPath}`);
    return new URL(key.split('/').map(encodeURIComponent).join('/'), this.info.baseURL).toString();
  }

  async saveDocument(): Promise<void> {
    this.record('saveDocument');
    if (!this.provider) throw new Error('saveDocument: no content provider registered');
    this.lastSavedText = await this.provider();
    this.info = { ...this.info, text: this.lastSavedText };
    this.dirty = false;
  }

  async openExternal(url: string): Promise<void> {
    this.record('openExternal', url);
  }

  async getSettings(): Promise<Settings> {
    return structuredClone(this.settings);
  }

  async setSettings(patch: Partial<Settings>): Promise<Settings> {
    this.settings = resolveSettings({ ...this.settings, ...patch });
    this.events.emit('settingsChanged', structuredClone(this.settings));
    return structuredClone(this.settings);
  }

  setDirty(dirty: boolean): void {
    this.record('setDirty', dirty);
    this.dirty = dirty;
  }

  requestMode(mode: Mode): void {
    this.record('requestMode', mode);
  }

  notifyContentChanged(): void {
    this.record('notifyContentChanged');
  }

  provideContent(provider: ContentProvider): void {
    this.provider = provider;
  }

  on<K extends keyof HostEvents>(event: K, handler: (payload: HostEvents[K]) => void): () => void {
    return this.events.on(event, handler);
  }

  // --- test helpers (native side simulation) ---

  /** Simulates the file changing on disk. */
  simulateFileChanged(newText?: string): void {
    if (newText !== undefined) this.info = { ...this.info, text: newText };
    this.events.emit('fileChanged', { path: this.info.path ?? '' });
  }

  /** What native would do at save time: ask the live editor for its content. */
  async requestContent(): Promise<string> {
    if (!this.provider) throw new Error('no content provider registered');
    return this.provider();
  }
}
