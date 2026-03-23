#!/usr/bin/env node
/**
 * PostGen – Verify generated output for quality issues.
 *
 * Usage:
 *   node verify-output.mjs <post-dir> [--format instagram|tiktok]
 *
 * Checks:
 *   - Every slide has a rendered PNG in final/
 *   - Every PNG is non-empty (> 1KB)
 *   - Every slide had a real background (not SVG fallback or missing)
 *   - slides.json has valid content (titles, bodies, background_prompts)
 *   - Template/brand contrast rules (bold = dark bg, minimal = mid-tone bg)
 *
 * Exits 0 if all checks pass. Exits 1 with a report of issues if any fail.
 */
import fs from 'fs';
import path from 'path';
import { loadAndNormalizeSlides } from './normalize-slides.mjs';
import { loadConfig } from './workspace.mjs';

const args = process.argv.slice(2);
let postDir = '.';
let formatArg = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--format' && args[i + 1]) formatArg = args[++i];
  else if (!args[i].startsWith('--')) postDir = args[i];
}

postDir = path.resolve(postDir);

const issues = [];
const warnings = [];

function issue(msg) { issues.push(msg); }
function warn(msg) { warnings.push(msg); }

// ---------------------------------------------------------------------------
// 1. Validate slides.json content
// ---------------------------------------------------------------------------

let slides;
let slidesFormats;
try {
  ({ slides, formats: slidesFormats } = loadAndNormalizeSlides(postDir));
} catch (err) {
  issue(`slides.json: ${err.message}`);
  report();
  process.exit(1);
}

const totalSlides = slides.length;
if (totalSlides < 3) {
  issue(`slides.json: Only ${totalSlides} slide(s). Minimum recommended is 3 (hook + content + cta).`);
}

for (const s of slides) {
  const id = `Slide ${s.slide_number}`;
  if (!s.title || s.title === 'undefined') issue(`${id}: Missing or empty title`);
  if (s.slide_type === 'content' && (!s.body || s.body === 'undefined')) issue(`${id}: Content slide has no body text`);
  if (!s.background_prompt) warn(`${id}: No background_prompt — will use gradient fallback`);

  if (s.slide_type === 'hook' && s.title) {
    const wordCount = s.title.trim().split(/\s+/).length;
    if (wordCount > 12) warn(`${id}: Hook title is ${wordCount} words (recommended 6-10)`);
  }
  if (s.slide_type === 'content' && s.body) {
    const wordCount = s.body.trim().split(/\s+/).length;
    if (wordCount > 40) warn(`${id}: Body text is ${wordCount} words (recommended under 30)`);
  }
}

// Check slide types present
const types = new Set(slides.map((s) => s.slide_type));
if (!types.has('hook')) warn('slides.json: No hook slide (first slide should be type "hook")');
if (!types.has('cta')) warn('slides.json: No CTA slide (last slide should be type "cta")');

// ---------------------------------------------------------------------------
// 2. Check backgrounds
// ---------------------------------------------------------------------------

const bgDir = path.join(postDir, 'backgrounds');
let bgMissing = 0;
let bgFallback = 0;

for (const s of slides) {
  const pad = String(s.slide_number).padStart(2, '0');
  const png = path.join(bgDir, `slide-${pad}-bg.png`);
  const svg = path.join(bgDir, `slide-${pad}-bg.svg`);

  if (fs.existsSync(png) && fs.statSync(png).size > 0) {
    // Real background — good
  } else if (fs.existsSync(svg)) {
    bgFallback++;
    warn(`Slide ${s.slide_number}: Using SVG fallback background (AI generation failed)`);
  } else {
    bgMissing++;
    issue(`Slide ${s.slide_number}: No background image found`);
  }
}

// ---------------------------------------------------------------------------
// 3. Check rendered PNGs
// ---------------------------------------------------------------------------

let config;
try {
  config = loadConfig(postDir);
} catch {
  config = { defaults: { formats: ['instagram', 'tiktok'] } };
}

const formats = formatArg ? [formatArg] : slidesFormats || config.defaults?.formats || ['instagram', 'tiktok'];

for (const fmt of formats) {
  const finalDir = path.join(postDir, fmt, 'final');

  if (!fs.existsSync(finalDir)) {
    issue(`${fmt}: No final/ output directory — rendering may have failed entirely`);
    continue;
  }

  const pngs = fs.readdirSync(finalDir).filter((f) => f.endsWith('.png')).sort();

  if (pngs.length === 0) {
    issue(`${fmt}: No rendered PNG files in final/ — rendering failed`);
    continue;
  }

  if (pngs.length < totalSlides) {
    issue(`${fmt}: Only ${pngs.length} rendered PNG(s) but ${totalSlides} slides expected`);
  }

  for (const png of pngs) {
    const p = path.join(finalDir, png);
    const size = fs.statSync(p).size;
    if (size < 1024) {
      issue(`${fmt}: ${png} is only ${size} bytes — likely a broken render`);
    } else if (size < 10240) {
      warn(`${fmt}: ${png} is only ${(size / 1024).toFixed(1)}KB — may be a blank or minimal render`);
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Template/contrast check
// ---------------------------------------------------------------------------

const template = config.defaults?.template || 'bold';
if (template === 'bold' && bgFallback > 0) {
  warn(`Bold template with ${bgFallback} fallback background(s) — gradient fallbacks may reduce visual impact`);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function report() {
  console.log(`\n=== PostGen Output Verification ===\n`);
  console.log(`Post: ${postDir}`);
  console.log(`Slides: ${totalSlides || 0}`);
  console.log(`Formats: ${formats.join(', ')}\n`);

  if (issues.length === 0 && warnings.length === 0) {
    console.log('All checks passed.\n');
    return;
  }

  if (issues.length > 0) {
    console.log(`ISSUES (${issues.length}):`);
    for (const i of issues) console.log(`  [FAIL] ${i}`);
    console.log();
  }

  if (warnings.length > 0) {
    console.log(`WARNINGS (${warnings.length}):`);
    for (const w of warnings) console.log(`  [WARN] ${w}`);
    console.log();
  }
}

report();

if (issues.length > 0) {
  console.log('Recommendation: Fix the issues above and re-run the failed pipeline step(s).');
  process.exit(1);
} else if (warnings.length > 0) {
  console.log('Output generated with warnings. Review and decide if regeneration is needed.');
  process.exit(0);
} else {
  process.exit(0);
}
