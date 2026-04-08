#!/usr/bin/env node
/**
 * PostGen – Build HTML slide files from slides.json + backgrounds.
 *
 * Templates live in ./templates/{name}.mjs — each exports { hook, content, cta, bgStyle }.
 * This file is a thin orchestrator: it loads data, resolves assets, picks the
 * right template module, and writes the HTML files.
 *
 * Usage:
 *   node build-slides.mjs <post-dir> [--format instagram|tiktok] [--template bold|minimal|magazine|neon|stack|clean|caption]
 */
import fs from 'fs';
import path from 'path';
import { loadConfig, findWorkspaceRoot } from './workspace.mjs';
import { loadAndNormalizeSlides } from './normalize-slides.mjs';

// Template imports — each is a small self-contained module
import * as boldTmpl from './templates/bold.mjs';
import * as minimalTmpl from './templates/minimal.mjs';
import * as magazineTmpl from './templates/magazine.mjs';
import * as neonTmpl from './templates/neon.mjs';
import * as stackTmpl from './templates/stack.mjs';
import * as cleanTmpl from './templates/clean.mjs';
import * as captionTmpl from './templates/caption.mjs';

// ---------------------------------------------------------------------------
// Template registry
// ---------------------------------------------------------------------------

const TEMPLATES = {
  bold:     boldTmpl,
  minimal:  minimalTmpl,
  magazine: magazineTmpl,
  neon:     neonTmpl,
  stack:    stackTmpl,
  clean:    cleanTmpl,
  caption:  captionTmpl,
};

const VALID_TEMPLATES = Object.keys(TEMPLATES);

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let postDir = '.';
let formatArg = null;
let templateArg = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--format' && args[i + 1]) formatArg = args[++i];
  else if (args[i] === '--template' && args[i + 1]) templateArg = args[++i];
  else if (!args[i].startsWith('--')) postDir = args[i];
}

postDir = path.resolve(postDir);

// ---------------------------------------------------------------------------
// Load data
// ---------------------------------------------------------------------------

const config = loadConfig(postDir);
const brand = config.brand;
const { slides, assetPlacements, template: slidesTemplate, outputType } = loadAndNormalizeSlides(postDir);
const formats = formatArg ? [formatArg] : config.defaults?.formats || ['instagram', 'tiktok'];
const showSwipeHint = outputType !== 'video';

// ---------------------------------------------------------------------------
// Template resolution — explicit choice > auto-rotate > random
// ---------------------------------------------------------------------------

/**
 * Scan the workspace output/ folder for the most recently used templates.
 * Returns an array of template names (most recent first), or [] if none found.
 */
function getRecentTemplates() {
  try {
    const wsRoot = findWorkspaceRoot(postDir);
    if (!wsRoot) return [];
    const outputDir = path.join(wsRoot, 'output');
    if (!fs.existsSync(outputDir)) return [];

    // Collect all slides.json files with their directory mtime
    const results = [];
    const dateDirs = fs.readdirSync(outputDir).filter(d => {
      const p = path.join(outputDir, d);
      return fs.statSync(p).isDirectory();
    });

    for (const dateDir of dateDirs) {
      const datePath = path.join(outputDir, dateDir);
      const postDirs = fs.readdirSync(datePath).filter(d => {
        const p = path.join(datePath, d);
        return fs.statSync(p).isDirectory();
      });
      for (const pd of postDirs) {
        const slidesPath = path.join(datePath, pd, 'slides.json');
        if (!fs.existsSync(slidesPath)) continue;
        // Skip the current post directory
        if (path.join(datePath, pd) === postDir) continue;
        try {
          const raw = JSON.parse(fs.readFileSync(slidesPath, 'utf-8'));
          const tmpl = raw.template;
          if (tmpl && VALID_TEMPLATES.includes(tmpl)) {
            const mtime = fs.statSync(slidesPath).mtimeMs;
            results.push({ template: tmpl, mtime });
          }
        } catch { /* skip corrupt files */ }
      }
    }

    // Sort by most recent first
    results.sort((a, b) => b.mtime - a.mtime);
    return results.map(r => r.template);
  } catch {
    return [];
  }
}

/**
 * Pick the best template that hasn't been used recently.
 * Avoids the last 2 templates used (so feeds never get back-to-back repeats).
 */
function autoSelectTemplate() {
  const recent = getRecentTemplates();
  const avoid = new Set(recent.slice(0, 2)); // avoid last 2

  // Prefer templates not recently used
  const candidates = VALID_TEMPLATES.filter(t => !avoid.has(t));
  if (candidates.length > 0) {
    // Deterministic-ish: pick based on current date+post-dir hash so same post
    // gets same template on re-runs, but different posts get different ones
    const seed = postDir.split('').reduce((s, c) => s + c.charCodeAt(0), 0) + Date.now() % 10000;
    const pick = candidates[seed % candidates.length];
    console.log(`  [template] Auto-selected "${pick}" (avoided recent: ${[...avoid].join(', ') || 'none'})`);
    return pick;
  }

  // All templates used recently — just pick randomly from the full set
  const seed = Date.now() % VALID_TEMPLATES.length;
  const pick = VALID_TEMPLATES[seed];
  console.log(`  [template] Auto-selected "${pick}" (all templates used recently, random pick)`);
  return pick;
}

// Resolution order: --template CLI flag > slides.json "template" > auto-rotate
let template;
const explicitTemplate = templateArg || slidesTemplate;

if (explicitTemplate === 'auto') {
  // User explicitly requested auto-rotation
  template = autoSelectTemplate();
} else if (explicitTemplate && VALID_TEMPLATES.includes(explicitTemplate)) {
  template = explicitTemplate;
  console.log(`  [template] Using explicitly set template: "${template}"`);
} else if (explicitTemplate) {
  console.warn(`  [template] Unknown template "${explicitTemplate}" — auto-selecting instead. Available: ${VALID_TEMPLATES.join(', ')}`);
  template = autoSelectTemplate();
} else {
  // No template specified at all — auto-rotate as safety net
  console.log(`  [template] No template specified — auto-rotating based on post history`);
  template = autoSelectTemplate();
}

const DIMENSIONS = {
  instagram: { width: 1080, height: 1350 },
  tiktok: { width: 1080, height: 1920 },
  shorts: { width: 1080, height: 1920 },
};

// ---------------------------------------------------------------------------
// File / asset utilities
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

/**
 * Find the best available background file for a slide number.
 * Checks: compressed JPG -> original PNG -> SVG fallback.
 */
function findBackground(slideNum) {
  const pad = String(slideNum).padStart(2, '0');
  const candidates = [
    path.join(postDir, 'backgrounds-compressed', `slide-${pad}-bg.jpg`),
    path.join(postDir, 'backgrounds', `slide-${pad}-bg.png`),
    path.join(postDir, 'backgrounds', `slide-${pad}-bg.svg`),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p) && fs.statSync(p).size > 0) return p;
  }
  return null;
}

function resolveAssetPath(filename) {
  const wsRoot = findWorkspaceRoot(postDir) || postDir;
  const p = path.join(wsRoot, 'assets', filename);
  return fs.existsSync(p) ? p : null;
}

function findLogo() {
  const wsRoot = findWorkspaceRoot(postDir) || postDir;
  const assetsDir = path.join(wsRoot, 'assets');
  if (!fs.existsSync(assetsDir)) {
    console.warn('  [logo] assets/ directory not found');
    return null;
  }
  const files = fs.readdirSync(assetsDir);
  const logoFile = files.find((f) => /logo/i.test(f) && /\.(png|jpg|jpeg|svg|webp)$/i.test(f));
  if (logoFile) {
    console.log(`  [logo] Found: ${logoFile}`);
    return path.join(assetsDir, logoFile);
  }
  const anyImage = files.find((f) => /\.(png|jpg|jpeg|svg|webp)$/i.test(f));
  if (anyImage) {
    console.warn(`  [logo] No file with "logo" in name. Using first image: ${anyImage}`);
    return path.join(assetsDir, anyImage);
  }
  console.warn('  [logo] No image files found in assets/');
  return null;
}

function resolveSlideAssets(slideNumber) {
  const result = {};
  if (!assetPlacements) return result;

  for (const [filename, placement] of Object.entries(assetPlacements)) {
    if (!placement.slides) continue;
    const slideNums = placement.slides.map(Number);
    if (!slideNums.includes(Number(slideNumber))) continue;

    const assetPath = resolveAssetPath(filename);
    if (!assetPath) {
      console.warn(`  [assets] ${filename} not found in assets/ folder`);
      continue;
    }
    const b64 = fileToBase64(assetPath);
    if (!b64) {
      console.warn(`  [assets] ${filename} exists but could not be read (empty or corrupt)`);
      continue;
    }

    const usage = String(placement.usage || '').toLowerCase();
    switch (usage) {
      case 'watermark':       result.watermarkBase64 = b64; break;
      case 'featured_image':  result.featuredImageBase64 = b64; break;
      case 'background':      result.backgroundBase64Override = b64; break;
      case 'cta_logo':        result.ctaLogoBase64 = b64; break;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main builder — dispatches to the correct template module
// ---------------------------------------------------------------------------

function buildSlideHtml(slide, total, format, bgBase64, logoBase64, slideAssets) {
  const dim = DIMENSIONS[format];
  const effectiveBg = slideAssets.backgroundBase64Override || bgBase64;
  const effectiveLogo = slideAssets.watermarkBase64 || logoBase64;
  const ctaLogo = slideAssets.ctaLogoBase64 || logoBase64;
  const featured = slideAssets.featuredImageBase64 || null;

  const tmpl = TEMPLATES[template] || TEMPLATES.bold;
  const isLight = tmpl.bgStyle === 'light';

  // CSS for the background image/fallback
  const bgCss = effectiveBg
    ? `background-image:url('${effectiveBg}');background-size:cover;background-position:center;`
    : isLight
      ? `background:linear-gradient(145deg,#f8f6f3,#eae6df);`
      : `background:linear-gradient(135deg,${brand.secondary_color},${brand.primary_color});`;

  // Logo element — light templates use different classes
  const logoHtml = isLight
    ? (effectiveLogo
        ? `<img src="${effectiveLogo}" alt="${brand.name}" class="logo" />`
        : `<span class="logo-text">${brand.name}</span>`)
    : (effectiveLogo
        ? `<div class="watermark"><img src="${effectiveLogo}" alt="${brand.name}" /></div>`
        : `<div class="brand-text">${brand.name}</div>`);

  // Options bag passed to hook functions (content/cta don't need swipe hints)
  const opts = { showSwipeHint };

  if (slide.slide_type === 'hook') return tmpl.hook(slide, brand, total, dim, bgCss, logoHtml, featured, opts);
  if (slide.slide_type === 'cta')  return tmpl.cta(slide, brand, total, dim, bgCss, ctaLogo, featured);
  return tmpl.content(slide, brand, total, dim, bgCss, logoHtml, featured);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const logoPath = findLogo();
const logoBase64 = logoPath ? fileToBase64(logoPath) : null;
if (logoBase64) {
  console.log(`  [logo] Loaded (${(Buffer.byteLength(logoBase64) / 1024).toFixed(0)}KB base64)`);
} else {
  console.warn('  [logo] No logo will be embedded — brand name text will be used instead');
}
console.log(`  [assets] asset_placements: ${assetPlacements ? Object.keys(assetPlacements).join(', ') : 'none'}`);

for (const format of formats) {
  const outputDir = path.join(postDir, format, 'slides');
  fs.mkdirSync(outputDir, { recursive: true });

  console.log(`Building ${slides.length} slides (${format}, ${template})...`);
  for (const slide of slides) {
    const bgPath = findBackground(slide.slide_number);
    const bgBase64 = bgPath ? fileToBase64(bgPath) : null;

    const slideAssets = resolveSlideAssets(slide.slide_number);
    const html = buildSlideHtml(slide, slides.length, format, bgBase64, logoBase64, slideAssets);
    const filename = `slide-${String(slide.slide_number).padStart(2, '0')}.html`;
    fs.writeFileSync(path.join(outputDir, filename), html);
    console.log(`  ${filename}${bgBase64 ? ' (with background)' : ' (gradient fallback)'}`);
  }
}

console.log('Slide building complete.');
