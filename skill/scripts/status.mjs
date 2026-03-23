#!/usr/bin/env node
/**
 * PostGen – Check pipeline progress for a post directory.
 *
 * Usage:
 *   node status.mjs <post-dir>
 *
 * Reports which pipeline steps have completed:
 *   - slides.json exists and is valid
 *   - Backgrounds generated (count, any fallbacks)
 *   - Backgrounds compressed
 *   - HTML slides built (per format)
 *   - PNGs rendered (per format)
 *   - Video generated (per format)
 *
 * Useful for agents to check progress without re-running the pipeline.
 */
import fs from 'fs';
import path from 'path';

const postDir = path.resolve(process.argv[2] || '.');

if (!fs.existsSync(postDir)) {
  console.error(`Directory not found: ${postDir}`);
  process.exit(1);
}

console.log(`\n=== PostGen Status: ${postDir} ===\n`);

// ---------------------------------------------------------------------------
// 1. slides.json
// ---------------------------------------------------------------------------

const slidesPath = path.join(postDir, 'slides.json');
let slideCount = 0;
let formats = [];
let outputType = 'both';

if (fs.existsSync(slidesPath)) {
  try {
    const raw = JSON.parse(fs.readFileSync(slidesPath, 'utf-8'));
    const slides = Array.isArray(raw) ? raw : raw.slides || [];
    slideCount = slides.length;
    formats = raw.formats || [];
    outputType = raw.output_type || raw.outputType || 'both';
    console.log(`[✓] slides.json: ${slideCount} slides, formats: ${formats.join(', ') || 'default'}, output: ${outputType}`);
  } catch (err) {
    console.log(`[✗] slides.json: exists but invalid — ${err.message}`);
  }
} else {
  console.log('[✗] slides.json: NOT FOUND');
  console.log('\nNo slides.json — pipeline cannot run.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. Backgrounds
// ---------------------------------------------------------------------------

const bgDir = path.join(postDir, 'backgrounds');
if (fs.existsSync(bgDir)) {
  const pngs = fs.readdirSync(bgDir).filter((f) => f.endsWith('.png'));
  const svgs = fs.readdirSync(bgDir).filter((f) => f.endsWith('.svg'));
  const status = pngs.length === slideCount ? '✓' : pngs.length > 0 ? '~' : '✗';
  console.log(`[${status}] Backgrounds: ${pngs.length} PNG(s)${svgs.length > 0 ? `, ${svgs.length} SVG fallback(s)` : ''} (${slideCount} expected)`);
} else {
  console.log('[✗] Backgrounds: NOT STARTED');
}

// ---------------------------------------------------------------------------
// 3. Compressed backgrounds
// ---------------------------------------------------------------------------

const compDir = path.join(postDir, 'backgrounds-compressed');
if (fs.existsSync(compDir)) {
  const jpgs = fs.readdirSync(compDir).filter((f) => f.endsWith('.jpg'));
  console.log(`[✓] Compressed: ${jpgs.length} JPG(s)`);
} else {
  console.log('[–] Compressed: not done (optional)');
}

// ---------------------------------------------------------------------------
// 4-6. Per-format status
// ---------------------------------------------------------------------------

const checkFormats = formats.length > 0 ? formats : ['instagram', 'tiktok'];

for (const fmt of checkFormats) {
  const fmtDir = path.join(postDir, fmt);
  if (!fs.existsSync(fmtDir)) {
    console.log(`[✗] ${fmt}: NOT STARTED`);
    continue;
  }

  // HTML slides
  const slidesDir = path.join(fmtDir, 'slides');
  const htmlCount = fs.existsSync(slidesDir)
    ? fs.readdirSync(slidesDir).filter((f) => f.endsWith('.html')).length
    : 0;

  // Rendered PNGs
  const finalDir = path.join(fmtDir, 'final');
  const pngCount = fs.existsSync(finalDir)
    ? fs.readdirSync(finalDir).filter((f) => f.endsWith('.png')).length
    : 0;

  // Video
  const hasVideo = fs.existsSync(finalDir) &&
    fs.readdirSync(finalDir).some((f) => f.endsWith('.mp4'));

  const parts = [];
  if (htmlCount > 0) parts.push(`${htmlCount} HTML`);
  if (pngCount > 0) parts.push(`${pngCount} PNG`);
  if (hasVideo) parts.push('video');

  const allDone = htmlCount >= slideCount && pngCount >= slideCount;
  const status = allDone ? '✓' : parts.length > 0 ? '~' : '✗';

  console.log(`[${status}] ${fmt}: ${parts.length > 0 ? parts.join(', ') : 'NOT STARTED'}`);
}

// ---------------------------------------------------------------------------
// 7. Caption
// ---------------------------------------------------------------------------

const captionPath = path.join(postDir, 'caption.txt');
if (fs.existsSync(captionPath)) {
  console.log('[✓] Caption: caption.txt exists');
} else {
  console.log('[–] Caption: not created yet');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log();

// Determine next step
if (!fs.existsSync(bgDir) || fs.readdirSync(bgDir).length === 0) {
  console.log('Next step: Run generate-backgrounds.mjs (or the full pipeline)');
} else if (!fs.existsSync(compDir)) {
  console.log('Next step: Run compress-backgrounds.mjs');
} else {
  let needsBuild = false;
  let needsRender = false;
  for (const fmt of checkFormats) {
    const slidesDir = path.join(postDir, fmt, 'slides');
    const finalDir = path.join(postDir, fmt, 'final');
    if (!fs.existsSync(slidesDir) || fs.readdirSync(slidesDir).filter((f) => f.endsWith('.html')).length === 0) {
      needsBuild = true;
    }
    if (!fs.existsSync(finalDir) || fs.readdirSync(finalDir).filter((f) => f.endsWith('.png')).length === 0) {
      needsRender = true;
    }
  }
  if (needsBuild) console.log('Next step: Run build-slides.mjs');
  else if (needsRender) console.log('Next step: Run render-slides.mjs');
  else console.log('Pipeline appears complete. Run verify-output.mjs to check quality.');
}
