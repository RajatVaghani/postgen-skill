#!/usr/bin/env node
/**
 * PostGen – Render HTML slides to PNG using Playwright.
 *
 * Usage:
 *   node render-slides.mjs <post-dir> [--format instagram|tiktok]
 *
 * Opens each HTML file in <post-dir>/<format>/slides/ with headless
 * Chromium and screenshots the .slide element to <post-dir>/<format>/final/.
 *
 * Robustness features:
 *   - Waits for document.fonts.ready (Google Fonts)
 *   - Per-page timeout (30 seconds)
 *   - Browser launch timeout (60 seconds)
 *   - Graceful cleanup on failure
 */
import fs from 'fs';
import path from 'path';
import { workspaceRequire } from './workspace.mjs';

const VIEWPORTS = {
  instagram: { width: 1080, height: 1350 },
  tiktok: { width: 1080, height: 1920 },
  shorts: { width: 1080, height: 1920 },
};

const PAGE_TIMEOUT_MS = 30_000;  // 30 seconds per slide
const BROWSER_TIMEOUT_MS = 60_000; // 60 seconds to launch browser

const args = process.argv.slice(2);
let postDir = '.';
let format = 'instagram';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--format' && args[i + 1]) format = args[++i];
  else if (!args[i].startsWith('--')) postDir = args[i];
}

postDir = path.resolve(postDir);
const slidesDir = path.join(postDir, format, 'slides');
const finalDir = path.join(postDir, format, 'final');

if (!fs.existsSync(slidesDir)) {
  console.error(`Slides directory not found: ${slidesDir}`);
  process.exit(1);
}

fs.mkdirSync(finalDir, { recursive: true });

const htmlFiles = fs
  .readdirSync(slidesDir)
  .filter((f) => f.endsWith('.html'))
  .sort();

if (htmlFiles.length === 0) {
  console.error('No HTML slide files found.');
  process.exit(1);
}

const viewport = VIEWPORTS[format] || VIEWPORTS.instagram;

// Load playwright from workspace node_modules
const wsRequire = workspaceRequire(postDir);
const { chromium } = wsRequire('playwright');

console.log(`Rendering ${htmlFiles.length} slides (${format}, ${viewport.width}x${viewport.height})...`);

let browser;
try {
  browser = await chromium.launch({
    headless: true,
    timeout: BROWSER_TIMEOUT_MS,
  });
} catch (err) {
  console.error(`Failed to launch browser: ${err.message}`);
  console.error('Try running: npx playwright install --with-deps chromium');
  process.exit(1);
}

const context = await browser.newContext({ viewport });
let successCount = 0;
let failCount = 0;

try {
  for (const file of htmlFiles) {
    const htmlPath = path.join(slidesDir, file);
    const pngFile = file.replace('.html', '.png');
    const outputPath = path.join(finalDir, pngFile);

    const page = await context.newPage();
    try {
      // Navigate — use domcontentloaded, NOT networkidle.
      // networkidle hangs when Google Fonts can't be reached (firewalled,
      // sandboxed, or slow DNS). Font loading is handled separately below.
      await page.goto(`file://${htmlPath}`, {
        waitUntil: 'domcontentloaded',
        timeout: PAGE_TIMEOUT_MS,
      });

      // Wait for Google Fonts to finish loading (or give up after 8s).
      // If fonts can't load (no internet), this gracefully times out and
      // the slide renders with the fallback system font — still looks fine.
      try {
        await page.waitForFunction(() => document.fonts.ready.then(() => true), {
          timeout: 8000,
        });
      } catch {
        // Font loading timed out — render anyway with fallback fonts
        console.log(`  [warn] ${file}: fonts did not load in time, rendering with fallback`);
      }

      // Brief pause for any CSS animations to settle
      await page.waitForTimeout(300);

      const slideEl = await page.$('.slide');
      if (slideEl) {
        await slideEl.screenshot({ path: outputPath, type: 'png' });
      } else {
        await page.screenshot({ path: outputPath, type: 'png' });
      }

      const size = fs.statSync(outputPath).size;
      console.log(`  ${file} -> ${pngFile} (${(size / 1024).toFixed(0)}KB)`);
      successCount++;
    } catch (err) {
      console.error(`  ${file} FAILED: ${err.message}`);
      failCount++;
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

console.log(`Rendering complete: ${successCount} rendered, ${failCount} failed.`);

if (failCount > 0) {
  process.exit(1);
}
