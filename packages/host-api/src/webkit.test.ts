// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import type { HostEvents } from './host.ts';
import { createWebKitHost, type NativeCallbacks, WEBKIT_HANDLER_NAME } from './webkit.ts';

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('expected a value');
  return value;
}

function fakeWindow(reply: (method: string, args: unknown[]) => unknown) {
  const posted: Array<{ method: string; args: unknown[] }> = [];
  const win = {
    webkit: {
      messageHandlers: {
        [WEBKIT_HANDLER_NAME]: {
          async postMessage(message: unknown) {
            const m = message as { method: string; args: unknown[] };
            posted.push(m);
            return reply(m.method, m.args);
          },
        },
      },
    },
  } as { webkit: unknown; inlayWebKitHost?: NativeCallbacks };
  return { win, posted };
}

describe('WebKitHost', () => {
  it('is absent without the bridge (Read view, browsers)', () => {
    expect(createWebKitHost({})).toBeNull();
    expect(createWebKitHost({ webkit: { messageHandlers: {} } })).toBeNull();
  });

  it('opens the document through the reply handler and resolves assets against its base URL', async () => {
    const { win, posted } = fakeWindow((method) =>
      method === 'openDocument'
        ? {
            docId: 'abc',
            path: '/x/a.md',
            text: 'hi\r\n',
            bom: true,
            eol: '\r\n',
            baseURL: 'mdview://abc/',
            quarantined: false,
          }
        : undefined,
    );
    const host = must(createWebKitHost(win));
    const doc = await host.openDocument();
    expect(doc).toEqual({
      docId: 'abc',
      path: '/x/a.md',
      text: 'hi\r\n',
      bom: true,
      eol: '\r\n',
      quarantined: false,
      baseURL: 'mdview://abc/',
      readOnly: false,
    });
    expect(posted[0]).toEqual({ method: 'openDocument', args: [] });
    expect(host.resolveAssetURL('img/a b.png')).toBe('mdview://abc/img/a%20b.png');
    expect(() => host.resolveAssetURL('../x.png')).toThrow(/escapes/);
  });

  it('decodes readFile replies from base64 and forwards fire-and-forget calls', async () => {
    const { win, posted } = fakeWindow((method) =>
      method === 'readFile' ? btoa('PNG') : undefined,
    );
    const host = must(createWebKitHost(win));
    expect(new TextDecoder().decode(await host.readFile('a.png'))).toBe('PNG');
    host.setDirty(true);
    host.requestMode('split');
    host.notifyContentChanged();
    host.reportPosition({ line: 3, cursorLine: 4, cursorColumn: 2 });
    await Promise.resolve();
    expect(posted.map((p) => p.method)).toEqual([
      'readFile',
      'setDirty',
      'requestMode',
      'notifyContentChanged',
      'reportPosition',
    ]);
    expect(posted[1]?.args).toEqual([true]);
  });

  it('serves native the live content and delivers native events', async () => {
    const { win } = fakeWindow(() => undefined);
    const host = must(createWebKitHost(win));
    const native = must(win.inlayWebKitHost);
    await expect(native.requestContent()).rejects.toThrow(/no content provider/);
    let live = 'v1';
    host.provideContent(() => live);
    live = 'v2';
    expect(await native.requestContent()).toBe('v2');
    const seen: HostEvents['fileChanged'][] = [];
    host.on('fileChanged', (p) => seen.push(p));
    native.emit('fileChanged', { path: '/x/a.md' });
    expect(seen).toEqual([{ path: '/x/a.md' }]);
  });

  it('normalises settings replies through resolveSettings', async () => {
    const { win } = fakeWindow((method) =>
      method === 'getSettings' ? { theme: 'dark', bogus: 1 } : undefined,
    );
    const host = must(createWebKitHost(win));
    const settings = await host.getSettings();
    expect(settings.theme).toBe('dark');
    expect('bogus' in settings).toBe(false);
  });
});
