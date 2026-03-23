#!/usr/bin/env node
/**
 * PostGen – Generate AI background images for slides.
 *
 * Usage:
 *   node generate-backgrounds.mjs <post-dir>
 *
 * Features:
 *   - Retry with exponential backoff (3 attempts per slide)
 *   - Per-request timeout (90 seconds)
 *   - Dynamic rate-limit detection (429 responses)
 *   - Progress reporting before each API call (so agents see activity)
 *   - Total script timeout (10 minutes)
 */
import fs from 'fs';
import path from 'path';
import { resolveApiKey } from './resolve-key.mjs';
import { loadConfig, workspaceRequire } from './workspace.mjs';
import { loadAndNormalizeSlides } from './normalize-slides.mjs';

const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 90_000;   // 90 seconds per API call
const TOTAL_TIMEOUT_MS = 600_000;    // 10 minutes for the whole script
const BASE_DELAY_MS = 2_000;         // 2 seconds initial delay between slides
const RATE_LIMIT_DELAY_MS = 15_000;  // 15 seconds if rate-limited

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

/** Wrap a promise with a timeout */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms / 1000}s: ${label}`)), ms)
    ),
  ]);
}

/** Sleep for ms milliseconds */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Check if error is a rate limit (429) */
function isRateLimitError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    err?.status === 429 ||
    err?.statusCode === 429 ||
    msg.includes('429') ||
    msg.includes('rate limit') ||
    msg.includes('quota') ||
    msg.includes('too many requests') ||
    msg.includes('resource_exhausted')
  );
}

// ---------------------------------------------------------------------------
// Google GenAI
// ---------------------------------------------------------------------------

async function generateWithGoogle(prompt, outputPath, apiKey, wsRequire, aspectRatio) {
  const { GoogleGenAI, Modality } = wsRequire('@google/genai');
  const genai = new GoogleGenAI({ apiKey });
  const response = await genai.models.generateContent({
    model: 'gemini-3.1-flash-image-preview',
    contents: `${prompt}, portrait orientation`,
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
      aspectRatio: aspectRatio || '3:4',
    },
  });

  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData?.data) {
        ensureDir(path.dirname(outputPath));
        const buffer = Buffer.from(part.inlineData.data, 'base64');
        fs.writeFileSync(outputPath, buffer);
        return outputPath;
      }
    }
  }
  throw new Error('No image generated from Google GenAI response');
}

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

async function generateWithOpenAI(prompt, outputPath, apiKey, wsRequire) {
  const OpenAI = wsRequire('openai');
  const OpenAIClient = OpenAI.default || OpenAI;
  const client = new OpenAIClient({ apiKey });
  const response = await client.images.generate({
    model: 'gpt-image-1.5',
    prompt: `${prompt}, portrait orientation`,
    n: 1,
    size: '1024x1536',
    quality: 'high',
  });

  const b64 = response.data?.[0]?.b64_json;
  if (b64) {
    ensureDir(path.dirname(outputPath));
    fs.writeFileSync(outputPath, Buffer.from(b64, 'base64'));
    return outputPath;
  }

  const imageUrl = response.data?.[0]?.url;
  if (imageUrl) {
    const res = await fetch(imageUrl);
    const buf = Buffer.from(await res.arrayBuffer());
    ensureDir(path.dirname(outputPath));
    fs.writeFileSync(outputPath, buf);
    return outputPath;
  }

  throw new Error('No image generated from OpenAI response');
}

// ---------------------------------------------------------------------------
// Fallback gradient
// ---------------------------------------------------------------------------

function createFallback(bgDir, slideNumber) {
  const n = slideNumber;
  const svg = `<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" style="stop-color:#1e1b4b"/>
    <stop offset="50%" style="stop-color:#312e81"/>
    <stop offset="100%" style="stop-color:#4c1d95"/>
  </linearGradient></defs>
  <rect width="1080" height="1920" fill="url(#g)"/>
  <circle cx="${200 + n * 100}" cy="${400 + n * 50}" r="300" fill="rgba(124,58,237,0.15)"/>
  <circle cx="${700 - n * 80}" cy="${900 - n * 30}" r="250" fill="rgba(192,132,252,0.1)"/>
</svg>`;
  ensureDir(bgDir);
  const svgPath = path.join(bgDir, `slide-${String(n).padStart(2, '0')}-bg.svg`);
  fs.writeFileSync(svgPath, svg);
  return svgPath;
}

// ---------------------------------------------------------------------------
// Generate a single background with retries
// ---------------------------------------------------------------------------

async function generateWithRetry(slide, outputPath, provider, apiKey, wsRequire, aspectRatio) {
  const num = slide.slide_number;
  let lastErr;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const label = `slide ${num} (attempt ${attempt}/${MAX_RETRIES})`;
    try {
      if (attempt > 1) {
        console.log(`  Retrying ${label}...`);
      }

      const genPromise =
        provider === 'openai'
          ? generateWithOpenAI(slide.background_prompt, outputPath, apiKey, wsRequire)
          : generateWithGoogle(slide.background_prompt, outputPath, apiKey, wsRequire, aspectRatio);

      await withTimeout(genPromise, REQUEST_TIMEOUT_MS, label);
      return true; // success
    } catch (err) {
      lastErr = err;
      const isRateLimit = isRateLimitError(err);

      if (attempt < MAX_RETRIES) {
        const delay = isRateLimit
          ? RATE_LIMIT_DELAY_MS * attempt
          : BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(
          `  ${label} failed: ${err.message}${isRateLimit ? ' (rate limited)' : ''}` +
            ` — waiting ${(delay / 1000).toFixed(0)}s before retry`
        );
        await sleep(delay);
      }
    }
  }

  throw lastErr;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const startTime = Date.now();

// Set a hard total timeout to prevent the script from hanging indefinitely
const totalTimer = setTimeout(() => {
  console.error(`\nFATAL: Total timeout exceeded (${TOTAL_TIMEOUT_MS / 1000}s). Exiting.`);
  process.exit(2);
}, TOTAL_TIMEOUT_MS);

// Ensure the timer doesn't keep Node alive if we finish normally
totalTimer.unref?.();

const postDir = path.resolve(process.argv[2] || '.');
const { slides, formats: slidesFormats } = loadAndNormalizeSlides(postDir);
const config = loadConfig(postDir);
const provider = config.image_provider || 'google-genai';
const resolved = resolveApiKey(provider, config);

const formats = slidesFormats || config.defaults?.formats || ['instagram', 'tiktok'];
const primaryFormat = formats[0] || 'instagram';
const aspectRatio = primaryFormat === 'tiktok' || primaryFormat === 'shorts' ? '9:16' : '3:4';

if (!resolved) {
  console.error(`No API key found for provider "${provider}". Run setup or add the key.`);
  process.exit(1);
}

const wsRequire = workspaceRequire(postDir);
const bgDir = path.join(postDir, 'backgrounds');
ensureDir(bgDir);

console.log(`Generating ${slides.length} portrait backgrounds with ${provider} (${aspectRatio})...`);
console.log(`  Timeout: ${REQUEST_TIMEOUT_MS / 1000}s per image, ${TOTAL_TIMEOUT_MS / 1000}s total`);
console.log(`  Retries: up to ${MAX_RETRIES} attempts per slide\n`);

let successCount = 0;
let fallbackCount = 0;

for (const slide of slides) {
  const num = slide.slide_number;
  const filename = `slide-${String(num).padStart(2, '0')}-bg.png`;
  const outputPath = path.join(bgDir, filename);

  // Progress line BEFORE the API call so the agent sees activity
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`[${elapsed}s] Generating slide ${num} of ${slides.length}...`);

  try {
    await generateWithRetry(slide, outputPath, provider, resolved.key, wsRequire, aspectRatio);
    const size = fs.statSync(outputPath).size;
    console.log(`  ✓ Slide ${num}: ${filename} (${(size / 1024).toFixed(0)}KB)`);
    successCount++;
  } catch (err) {
    console.error(`  ✗ Slide ${num} failed after ${MAX_RETRIES} attempts: ${err.message}`);
    console.error(`    Using SVG gradient fallback`);
    createFallback(bgDir, num);
    fallbackCount++;
  }

  // Delay between slides to respect rate limits
  if (slide !== slides[slides.length - 1]) {
    await sleep(BASE_DELAY_MS);
  }
}

clearTimeout(totalTimer);

const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\nBackground generation complete in ${totalElapsed}s.`);
console.log(`  ${successCount} generated, ${fallbackCount} fallback(s)`);

if (fallbackCount > 0) {
  console.log('  WARNING: Some slides are using gradient fallbacks. Consider re-running for those slides.');
}
