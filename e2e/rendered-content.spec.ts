// SPDX-License-Identifier: Apache-2.0
// Rendered-content fixtures: charts from CDN URLs served offline, widgets, SVG, styles,
// local images, page semantics and the network toggle. Every CDN host is intercepted so a
// test can only pass when the bundled copies are used.
import { expect, type Page, test } from '@playwright/test';

const view = (file: string, query = '') => `/__fixtures/view/${encodeURIComponent(file)}${query}`;
const CDN = /https:\/\/(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)\//;

async function rendered(page: Page): Promise<void> {
  await expect(page.locator('#inlay-root')).toBeAttached();
  await page.waitForFunction(() => typeof window.inlayReadView?.stats?.renderMs === 'number');
}

async function interceptCdn(page: Page): Promise<string[]> {
  const hits: string[] = [];
  await page.route(CDN, (route) => {
    hits.push(route.request().url());
    return route.abort();
  });
  return hits;
}

test.describe('charts render offline from bundled copies', () => {
  test('Chart.js (jsDelivr URL, integrity attribute dropped)', async ({ page }) => {
    const hits = await interceptCdn(page);
    await page.goto(view('chart-chartjs.md'));
    await rendered(page);
    const canvas = page.locator('canvas#sales');
    await expect(canvas).toHaveAttribute('data-chartjs', 'loaded');
    await expect(canvas).toHaveAttribute('data-rendered', 'true');
    const script = page.locator('script[data-inlay-vendor]');
    await expect(script).toHaveAttribute('src', /\/__inlay\/vendor\/chart\.js\/chart\.umd\.js$/);
    expect(await script.getAttribute('integrity')).toBeNull();
    // Something was actually painted.
    const painted = await canvas.evaluate((c) => {
      const ctx = (c as HTMLCanvasElement).getContext('2d');
      const data =
        ctx?.getImageData(0, 0, (c as HTMLCanvasElement).width, (c as HTMLCanvasElement).height)
          .data ?? new Uint8ClampedArray();
      let nonTransparent = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) nonTransparent++;
      return nonTransparent;
    });
    expect(painted).toBeGreaterThan(1000);
    expect(hits).toEqual([]);
  });

  test('ECharts (cdnjs URL) renders an SVG chart', async ({ page }) => {
    const hits = await interceptCdn(page);
    await page.goto(view('chart-echarts.md'));
    await rendered(page);
    await expect(page.locator('#echart')).toHaveAttribute('data-echarts', 'loaded');
    await expect(page.locator('#echart svg path')).not.toHaveCount(0);
    expect(hits).toEqual([]);
  });

  test('D3 (unpkg URL) draws bars', async ({ page }) => {
    const hits = await interceptCdn(page);
    await page.goto(view('chart-d3.md'));
    await rendered(page);
    await expect(page.locator('svg#bars')).toHaveAttribute('data-d3', 'loaded');
    await expect(page.locator('svg#bars rect')).toHaveCount(5);
    expect(hits).toEqual([]);
  });

  test('KaTeX auto-render from CDN URLs uses the bundled copy', async ({ page }) => {
    const hits = await interceptCdn(page);
    await page.goto(view('katex-autorender.md'));
    await rendered(page);
    await expect(page.locator('#autorender')).toHaveAttribute('data-rendered', 'true');
    await expect(page.locator('#autorender .katex')).toHaveCount(2);
    await expect(page.locator('link[rel="stylesheet"][data-inlay-vendor]')).toHaveAttribute(
      'href',
      /vendor\/katex\/katex\.min\.css$/,
    );
    expect(hits).toEqual([]);
  });

  test('older majors and unknown libraries keep their CDN URLs', async ({ page }) => {
    const hits = await interceptCdn(page);
    await page.goto(view('cdn-passthrough.md'));
    await rendered(page);
    await expect(
      page.locator('script[src="https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('script[src="https://cdn.jsdelivr.net/npm/lodash@4/lodash.min.js"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('link[href="https://cdn.jsdelivr.net/npm/water.css@2/out/water.css"]'),
    ).toHaveCount(1);
    await expect(page.locator('#passthrough')).toHaveAttribute('data-lodash', 'missing');
    expect(hits.length).toBe(3);
    expect(await page.locator('script[data-inlay-vendor]').count()).toBe(0);
  });
});

test.describe('HTML, CSS and JS behave like a web page', () => {
  test('an interactive widget responds to clicks and input', async ({ page }) => {
    await page.goto(view('widget-interactive.md'));
    await rendered(page);
    await expect(page.locator('#widget')).toHaveAttribute('data-ready', 'true');
    await page.click('#inc');
    await page.click('#inc');
    await page.click('#dec');
    await expect(page.locator('#count')).toHaveText('1');
    await page.locator('#scale').fill('7');
    await expect(page.locator('#scaled')).toHaveText('7');
    const border = await page
      .locator('#widget')
      .evaluate((e) => getComputedStyle(e).borderTopWidth);
    expect(border).toBe('1px');
    await expect(page.locator('#inlay-root strong')).toHaveText('emphasis');
  });

  test('inline SVG renders with gradients, nested style and animation', async ({ page }) => {
    await page.goto(view('inline-svg.md'));
    await rendered(page);
    const logo = page.locator('svg#logo');
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute('data-source-line', /^\d+-\d+$/);
    await expect(logo.locator('linearGradient#g stop')).toHaveCount(2);
    await expect(logo.locator('animate')).toHaveCount(1);
    const fill = await logo.locator('text.label').evaluate((e) => getComputedStyle(e).fill);
    expect(fill).toBe('rgb(255, 255, 255)');
    await expect(page.locator('#inlay-root p svg circle')).toHaveCount(1);
  });

  test('a document-level <style> applies to Markdown and HTML blocks', async ({ page }) => {
    await page.goto(view('style-block.md'));
    await rendered(page);
    const h2Color = await page.locator('h2').evaluate((e) => getComputedStyle(e).color);
    expect(h2Color).toBe('rgb(255, 99, 71)');
    const note = page.locator('.note');
    expect(await note.evaluate((e) => getComputedStyle(e).borderLeftWidth)).toBe('4px');
    await expect(note.locator('strong')).toHaveText('note');
    expect(await note.locator('strong').evaluate((e) => getComputedStyle(e).textTransform)).toBe(
      'uppercase',
    );
  });

  test('scripts run in order, see the whole page and get load events', async ({ page }) => {
    await page.goto(view('web-page-semantics.md'));
    await rendered(page);
    await expect(page.locator('#order')).toHaveText('a,b');
    await expect(page.locator('#current-script')).toHaveText('yes');
    await expect(page.locator('#dom-ready')).toHaveText('yes');
    await expect(page.locator('#loaded')).toHaveText('yes');
    await expect(page.locator('#style-applied')).toHaveText('700');
    await expect(page.locator('a[href="https://inlay.live"]')).toHaveCount(1);
  });
});

test.describe('local images', () => {
  test('load from the document folder, including encoded names and PNG; escapes are refused', async ({
    page,
  }) => {
    await page.goto(view('local-images.md'));
    await rendered(page);
    const widths = async (selector: string) =>
      page
        .locator(selector)
        .evaluateAll((els) => els.map((e) => (e as HTMLImageElement).naturalWidth));
    await expect
      .poll(() =>
        widths('img[alt="In a subfolder"], img[alt="With ./ prefix"], img[alt="Encoded space"]'),
      )
      .toEqual([120, 16, 120]);
    await expect.poll(() => widths('#outside, #absolute')).toEqual([0, 0]);
    await page.goto(view('svg-image.md'));
    await rendered(page);
    await expect.poll(() => widths('img')).toEqual([120, 120, 16, 120]);
  });
});

test.describe('network toggle', () => {
  test('fetch is blocked by default and allowed with ?allowNetwork=1', async ({ page }) => {
    await page.route('https://example.com/**', (route) =>
      route.fulfill({ status: 200, body: 'ok' }),
    );
    await page.goto(view('fetch-toggle.md'));
    await rendered(page);
    await expect(page.locator('#fetch-remote')).toHaveText(/^blocked:/);
    await expect(page.locator('#fetch-local')).toHaveText(/^blocked:/);
    await page.goto(view('fetch-toggle.md', '?allowNetwork=1'));
    await rendered(page);
    await expect(page.locator('#fetch-remote')).toHaveText('allowed:200');
    // connect-src https: still excludes the document's own origin.
    await expect(page.locator('#fetch-local')).toHaveText(/^blocked:/);
  });
});

test.describe('security probe', () => {
  test('document JS cannot reach native code, the network, frames, forms or files outside the folder', async ({
    page,
  }) => {
    await page.route('https://example.com/**', (route) =>
      route.fulfill({ status: 200, body: 'ok' }),
    );
    // The probe opens a popup and submits a form whose navigation Chromium leaves "pending" after
    // CSP blocks it, so locators (which wait for navigations) would hang: poll with evaluate instead.
    await page.goto(view('security-probe.md'), { waitUntil: 'commit' });
    await page.waitForFunction(
      () => document.getElementById('probe-results')?.dataset.complete === 'true',
      undefined,
      { timeout: 15_000 },
    );
    const report = JSON.parse(
      await page.evaluate(() => document.getElementById('probe-results')?.textContent ?? '{}'),
    ) as { results: Record<string, string>; violations: string[] };
    // window.open is refused by the app's WKUIDelegate (asserted in XCTest); browsers may allow popups.
    const allowed = Object.entries(report.results).filter(
      ([k, v]) => k !== 'window-open' && !v.startsWith('blocked:'),
    );
    expect(allowed, JSON.stringify(report, null, 2)).toEqual([]);
    for (const key of [
      'native-bridge',
      'eval',
      'function-ctor',
      'fetch-remote',
      'fetch-same-origin',
      'fetch-traversal',
      'xhr-remote',
      'websocket',
      'beacon',
      'iframe',
      'form-submit',
      'img-traversal',
    ]) {
      expect(report.results[key], key).toMatch(/^blocked:/);
    }
    expect(report.violations.some((v) => v.startsWith('connect-src'))).toBe(true);
    expect(
      report.violations.some((v) => v.startsWith('frame-src') || v.startsWith('child-src')),
    ).toBe(true);
    expect(report.violations.some((v) => v.startsWith('script-src'))).toBe(true);
    // The page itself is still there.
    expect(page.url()).toMatch(/security-probe\.md$/);
  });
});
