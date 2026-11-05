// SPDX-License-Identifier: Apache-2.0
/**
 * WebKit adapter: the only web code that touches `window.webkit`. The editor
 * webview's `WKScriptMessageHandlerWithReply` named `inlay` receives
 * `{ method, args }` and replies with the method's result (or an error string);
 * native calls back through `window.inlayWebKitHost` (`requestContent` for saves
 * and the crash mirror, `emit` for Host events). The Read webview has no handler
 * (ADR-0007/0010), so `createWebKitHost` returns null there and in browsers.
 */
import { Emitter } from './events.ts';
import type {
  ContentProvider,
  DocumentInfo,
  EditorPosition,
  Host,
  HostEvents,
  Mode,
} from './host.ts';
import { resolveSettings, type Settings } from './settings.ts';

export interface WebKitMessageHandler {
  postMessage(message: unknown): Promise<unknown>;
}

interface WebKitWindow {
  webkit?: { messageHandlers?: Record<string, WebKitMessageHandler | undefined> };
  inlayWebKitHost?: NativeCallbacks;
}

/** What native may call with evaluateJavaScript / callAsyncJavaScript. */
export interface NativeCallbacks {
  /** The live editor content, for saves and the mirror (ADR-0005). Rejects when no editor is up. */
  requestContent(): Promise<string>;
  emit<K extends keyof HostEvents>(event: K, payload: HostEvents[K]): void;
}

export const WEBKIT_HANDLER_NAME = 'inlay';

export function createWebKitHost(win: unknown = globalThis): Host | null {
  const w = win as WebKitWindow;
  const handler = w.webkit?.messageHandlers?.[WEBKIT_HANDLER_NAME];
  if (!handler || typeof handler.postMessage !== 'function') return null;
  return new WebKitHost(handler, w);
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export class WebKitHost implements Host {
  private readonly events = new Emitter<HostEvents>();
  private provider: ContentProvider | null = null;
  private info: DocumentInfo | null = null;

  constructor(
    private readonly handler: WebKitMessageHandler,
    target: WebKitWindow,
  ) {
    target.inlayWebKitHost = {
      requestContent: async () => {
        if (!this.provider) throw new Error('no content provider registered');
        return this.provider();
      },
      emit: (event, payload) => this.events.emit(event, payload),
    };
  }

  private call<T>(method: string, ...args: unknown[]): Promise<T> {
    return this.handler.postMessage({ method, args }) as Promise<T>;
  }

  /** Fire-and-forget: the reply is awaited only to surface native errors in the console. */
  private send(method: string, ...args: unknown[]): void {
    this.call(method, ...args).catch((error: unknown) => {
      console.error(`inlay host: ${method} failed`, error);
    });
  }

  async openDocument(): Promise<DocumentInfo> {
    const raw = await this.call<Partial<DocumentInfo>>('openDocument');
    const info: DocumentInfo = {
      docId: String(raw.docId ?? ''),
      path: raw.path ?? null,
      text: String(raw.text ?? ''),
      bom: raw.bom === true,
      eol: raw.eol === '\r\n' || raw.eol === '\r' ? raw.eol : '\n',
      quarantined: raw.quarantined === true,
      baseURL: String(raw.baseURL ?? ''),
      readOnly: raw.readOnly === true,
    };
    this.info = info;
    return { ...info };
  }

  async readFile(relPath: string): Promise<Uint8Array> {
    return decodeBase64(await this.call<string>('readFile', relPath));
  }

  resolveAssetURL(relPath: string): string {
    if (!this.info) throw new Error('resolveAssetURL before openDocument');
    const clean = relPath.replace(/^\.\//, '');
    if (clean.split('/').includes('..'))
      throw new Error(`resolveAssetURL: path escapes the document folder: ${relPath}`);
    return new URL(
      clean.split('/').map(encodeURIComponent).join('/'),
      this.info.baseURL,
    ).toString();
  }

  saveDocument(): Promise<void> {
    return this.call<void>('saveDocument');
  }

  openExternal(url: string): Promise<void> {
    return this.call<void>('openExternal', url);
  }

  async getSettings(): Promise<Settings> {
    return resolveSettings(await this.call<unknown>('getSettings'));
  }

  async setSettings(patch: Partial<Settings>): Promise<Settings> {
    return resolveSettings(await this.call<unknown>('setSettings', patch));
  }

  setDirty(dirty: boolean): void {
    this.send('setDirty', dirty);
  }

  requestMode(mode: Mode): void {
    this.send('requestMode', mode);
  }

  notifyContentChanged(): void {
    this.send('notifyContentChanged');
  }

  reportPosition(position: EditorPosition): void {
    this.send('reportPosition', position);
  }

  provideContent(provider: ContentProvider): void {
    this.provider = provider;
  }

  on<K extends keyof HostEvents>(event: K, handler: (payload: HostEvents[K]) => void): () => void {
    return this.events.on(event, handler);
  }
}
