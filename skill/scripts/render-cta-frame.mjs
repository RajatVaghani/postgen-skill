#!/usr/bin/env node
/**
 * PostGen – Render a single CTA frame (PNG) for use as a video end-card.
 *
 * Usage:
 *   node render-cta-frame.mjs <post-dir> [--format tiktok|instagram] [--template bold|minimal|...]
 *
 * Reads:
 *   - video.json   — cta field (title, body, background_prompt)
 *   - postgen.config.json — brand info (name, colors, logo, website, cta_links)
 *
 * Produces:
 *   - <post-dir>/cta-frame.png — A single branded CTA slide rendered at video resolution.
 *
 * Uses the same template system as carousel slides (bold, neon, clean, etc.)
 * so the CTA end-card matches the brand's visual identity.
 */
import fs from 'fs';
import path from 'path';
import { loadConfig, findWorkspaceRoot, workspaceRequire } from './workspace.mjs';

// Template imports — same as build-slides.mjs
import * as boldTmpl from './templates/bold.mjs';
import * as minimalTmpl from './templates/minimal.mjs';
import * as magazineTmpl from './templates/magazine.mjs';
import * as neonTmpl from './templates/neon.mjs';
import * as stackTmpl from './templates/stack.mjs';
import * as cleanTmpl from './templates/clean.mjs';

const TEMPLATES = {
  bold: boldTmpl,
  minimal: minimalTmpl,
  magazine: magazineTmpl,
  neon: neonTmpl,
  stack: stackTmpl,
  clean: cleanTmpl,
};

const VIEWPORTS = {
  instagram: { width: 1080, height: 1350 },
  tiktok: { width: 1080, height: 1920 },
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let postDir = '.';
let format = 'tiktok';
let templateArg = '';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--format' && args[i + 1]) format = args[++i];
  else if (args[i] === '--template' && args[i + 1]) templateArg = args[++i];
  else if (!args[i].startsWith('--')) postDir = args[i];
}

postDir = path.resolve(postDir);

// ---------------------------------------------------------------------------
// Load data
// ---------------------------------------------------------------------------

const config = loadConfig(postDir);
const brand = config.brand;

if (!brand) {
  console.error('FATAL: No brand config found. Run setup first.');
  process.exit(1);
}

const videoJsonPath = path.join(postDir, 'video.json');
if (!fs.existsSync(videoJsonPath)) {
  console.error('FATAL: video.json not found.');
  process.exit(1);
}

const videoSpec = JSON.parse(fs.readFileSync(videoJsonPath, 'utf-8'));
const cta = videoSpec.cta;

if (!cta) {
  console.error('FATAL: video.json has no "cta" field.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Resolve template
// ---------------------------------------------------------------------------

const templateName = templateArg || videoSpec.template || 'bold';
const tmpl = TEMPLATES[templateName] || TEMPLATES.bold;

console.log(`Rendering CTA frame (${format}, ${templateName})...`);

// ---------------------------------------------------------------------------
// Asset utilities (mirrored from build-slides.mjs)
// ---------------------------------------------------------------------------

function fileToBase64(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  if (fs.statSync(filePath).size === 0) return null;
  const data = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === '.svg' ? 'image/svg+xml' : ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${data.toString('base64')}`;
}

function findLogo() {
  const wsRoot = findWorkspaceRoot(postDir) || postDir;
  const assetsDir = path.join(wsRoot, 'assets');
  if (!fs.existsSync(assetsDir)) return null;
  const files = fs.readdirSync(assetsDir);
  const logoFile = files.find((f) => /logo/i.test(f) && /\.(png|jpg|jpeg|svg|webp)$/i.test(f));
  if (logoFile) return path.join(assetsDir, logoFile);
  const anyImage = files.find((f) => /\.(png|jpg|jpeg|svg|webp)$/i.test(f));
  return anyImage ? path.join(assetsDir, anyImage) : null;
}

function findCtaBackground() {
  // Check for a dedicated CTA background in the post dir
  const candidates = [
    path.join(postDir, 'backgrounds-compressed', 'cta-bg.jpg'),
    path.join(postDir, 'backgrounds', 'cta-bg.png'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p) && fs.statSync(p).size > 0) return p;
  }
  // Fall back to last slide background (common pattern)
  const bgDir = path.join(postDir, 'backgrounds-compressed');
  if (fs.existsSync(bgDir)) {
    const files = fs.readdirSync(bgDir).filter(f => f.endsWith('.jpg')).sort();
    if (files.length > 0) return path.join(bgDir, files[files.length - 1]);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Build CTA HTML using the template
// ---------------------------------------------------------------------------

const dim = VIEWPORTS[format] || VIEWPORTS.tiktok;
const logoPath = findLogo();
const logoBase64 = logoPath ? fileToBase64(logoPath) : null;
const bgPath = findCtaBackground();
const bgBase64 = bgPath ? fileToBase64(bgPath) : null;

const isLight = tmpl.bgStyle === 'light';
const bgCss = bgBase64
  ? `background-image:url('${bgBase64}');background-size:cover;background-position:center;`
  : isLight
    ? `background:linear-gradient(145deg,#f8f6f3,#eae6df);`
    : `background:linear-gradient(135deg,${brand.secondary_color},${brand.primary_color});`;

// Build a synthetic slide object matching what templates expect
const ctaSlide = {
  slide_number: 99,
  slide_type: 'cta',
  title: cta.title || `Follow @${brand.handle || brand.name}`,
  body: cta.body || 'Follow for more content like this!',
};

// CTA links: pick the first one if available
const ctaLinks = config.cta_links || [];
if (ctaLinks.length > 0 && !brand.website) {
  brand.website = ctaLinks[0].url;
}

const html = tmpl.cta(ctaSlide, brand, 1, dim, bgCss, logoBase64, null);

// ---------------------------------------------------------------------------
// Render HTML → PNG with Playwright
// ---------------------------------------------------------------------------

const tmpHtmlPath = path.join(postDir, '.cta-tmp.html');
const outputPath = path.join(postDir, 'cta-frame.png');

fs.writeFileSync(tmpHtmlPath, html);

const wsRequire = workspaceRequire(postDir);
const { chromium } = wsRequire('playwright');

let browser;
try {
  browser = await chromium.launch({ headless: true, timeout: 60_000 });
  const context = await browser.newContext({ viewport: dim });
  const page = await context.newPage();

  await page.goto(`file://${tmpHtmlPath}`, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);

  const slideEl = await page.$('.slide');
  if (slideEl) {
    await slideEl.screenshot({ path: outputPath });
  } else {
    await page.screenshot({ path: outputPath });
  }

  console.log(`  CTA frame rendered: ${outputPath} (${(fs.statSync(outputPath).size / 1024).toFixed(0)}KB)`);
} catch (err) {
  console.error(`Failed to render CTA frame: ${err.message}`);
  process.exit(1);
} finally {
  if (browser) await browser.close();
  try { fs.unlinkSync(tmpHtmlPath); } catch {}
}
