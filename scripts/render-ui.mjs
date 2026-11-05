#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Screenshots the design artboards in design/ui/*.html into design/ui/png with the Playwright
// Chromium that the e2e tests already install. Run `pnpm design:render` after editing an artboard.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { repoRoot } from './lib/deps.mjs';

const dir = join(repoRoot, 'design', 'ui');
const out = join(dir, 'png');
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.html'))
  .sort();

const browser = await chromium.launch();
for (const file of files) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  await page.goto(`file://${join(dir, file)}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const root = page.locator('x-dc > div').first();
  const box = await root.boundingBox();
  const name = file.replace(/\.html$/, '.png');
  if (box && box.width < 1440) {
    await page.setViewportSize({ width: Math.ceil(box.width), height: Math.ceil(box.height) });
    await page.screenshot({ path: join(out, name), clip: box });
  } else {
    await page.screenshot({ path: join(out, name), fullPage: true });
  }
  await page.close();
  console.log(`  ${name}`);
}
await browser.close();
