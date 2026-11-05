// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { detectEol, MockHost } from './mock.ts';

describe('detectEol', () => {
  it('picks the dominant ending', () => {
    expect(detectEol('a\nb\nc')).toBe('\n');
    expect(detectEol('a\r\nb\r\nc\n')).toBe('\r\n');
    expect(detectEol('a\rb\rc')).toBe('\r');
    expect(detectEol('no newline')).toBe('\n');
  });
});

describe('MockHost', () => {
  it('opens a document with base URL and detected eol', async () => {
    const host = new MockHost({ docId: 'd1', text: 'x\r\ny\r\n', path: '/tmp/d1.md' });
    const doc = await host.openDocument();
    expect(doc.docId).toBe('d1');
    expect(doc.eol).toBe('\r\n');
    expect(doc.baseURL.endsWith('/')).toBe(true);
    expect(doc.quarantined).toBe(false);
  });

  it('resolves and reads assets inside the document folder only', async () => {
    const host = new MockHost({ files: { 'img/a b.png': 'PNG', './lib/chart.js': 'JS' } });
    expect(host.resolveAssetURL('img/a b.png')).toBe(
      'http://localhost/docs/mock-doc/img/a%20b.png',
    );
    expect(new TextDecoder().decode(await host.readFile('./lib/chart.js'))).toBe('JS');
    expect(new TextDecoder().decode(await host.readFile('img/../img/a b.png'))).toBe('PNG');
    await expect(host.readFile('../secret.txt')).rejects.toThrow(/escapes/);
    expect(() => host.resolveAssetURL('../../etc/passwd')).toThrow(/escapes/);
    await expect(host.readFile('missing.png')).rejects.toThrow(/not found/);
  });

  it('saves through the live content provider, never a cache', async () => {
    const host = new MockHost({ text: 'old' });
    let live = 'old';
    host.provideContent(() => live);
    live = 'new content';
    host.setDirty(true);
    await host.saveDocument();
    expect(host.lastSavedText).toBe('new content');
    expect(host.dirty).toBe(false);
    expect((await host.openDocument()).text).toBe('new content');
  });

  it('rejects save without a provider', async () => {
    await expect(new MockHost().saveDocument()).rejects.toThrow(/no content provider/);
  });

  it('emits events and supports unsubscribe', async () => {
    const host = new MockHost({ path: '/tmp/x.md' });
    const seen: string[] = [];
    const off = host.on('fileChanged', (e) => seen.push(e.path));
    host.simulateFileChanged();
    off();
    host.simulateFileChanged();
    expect(seen).toEqual(['/tmp/x.md']);

    const settings: string[] = [];
    host.on('settingsChanged', (s) => settings.push(s.theme));
    await host.setSettings({ theme: 'dark' } as never);
    expect(settings).toEqual(['dark']);
    expect((await host.getSettings()).theme).toBe('dark');
  });

  it('records calls for assertions', () => {
    const host = new MockHost();
    host.requestMode('read');
    host.notifyContentChanged();
    expect(host.calls.map((c) => c.method)).toEqual(['requestMode', 'notifyContentChanged']);
  });
});
