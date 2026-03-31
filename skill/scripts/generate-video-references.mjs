#!/usr/bin/env node
/**
 * PostGen – Generate reference images for AI video scenes.
 *
 * Generates consistent reference images that are passed to Veo 3.1 as
 * first-frame images and asset reference images, dramatically improving
 * visual consistency across clips (same characters, lighting, palette).
 *
 * Reads video.json for scene prompts and visual_style, then generates:
 *   1. One "first-frame" image per scene (used as the starting frame for that clip)
 *   2. Up to 3 "character reference" images (shared across ALL clips for subject consistency)
 *
 * Output:
 *   {post-dir}/video-references/
 *     scene-1.png, scene-2.png, ...   ← first-frame images (one per scene)
 *     ref-1.png, ref-2.png, ref-3.png ← character/subject reference images
 *     manifest.json                   ← metadata for the pipeline
 *
 * Usage:
 *   node generate-video-references.mjs <post-dir>
 *
 * Features:
 *   - Retry with exponential backoff (3 attempts per image)
 *   - Per-request timeout (90 seconds)
 *   - Dynamic rate-limit detection (429 responses)
 *   - Idempotency: skips images that already exist on disk
 *   - Total script timeout (10 minutes)
 */
import fs from 'fs';
import path from 'path';
import { resolveApiKey } from './resolve-key.mjs';
import { loadConfig, workspaceRequire } from './workspace.mjs';

const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 90_000;   // 90s per API call
const TOTAL_TIMEOUT_MS = 600_000;    // 10 minutes total
const BASE_DELAY_MS = 2_000;         // 2s between images
const RATE_LIMIT_DELAY_MS = 15_000;  // 15s if rate-limited

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms / 1000}s: ${label}`)), ms)
    ),
  ]);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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
// Google GenAI image generation
// ---------------------------------------------------------------------------

async function generateWithGoogle(prompt, outputPath, apiKey, wsRequire, aspectRatio) {
  const { GoogleGenAI, Modality } = wsRequire('@google/genai');
  const genai = new GoogleGenAI({ apiKey });
  const response = await genai.models.generateContent({
    model: 'gemini-3.1-flash-image-preview',
    contents: prompt,
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
      aspectRatio: aspectRatio || '9:16',
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
// OpenAI image generation
// ---------------------------------------------------------------------------

async function generateWithOpenAI(prompt, outputPath, apiKey, wsRequire) {
  const OpenAI = wsRequire('openai');
  const OpenAIClient = OpenAI.default || OpenAI;
  const client = new OpenAIClient({ apiKey });
  const response = await client.images.generate({
    model: 'gpt-image-1.5',
    prompt,
    n: 1,
    size: '1024x1792', // 9:16 portrait for video
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
// Generate a single image with retries
// ---------------------------------------------------------------------------

async function generateWithRetry(prompt, outputPath, provider, apiKey, wsRequire, aspectRatio, label) {
  let lastErr;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const attemptLabel = `${label} (attempt ${attempt}/${MAX_RETRIES})`;
    try {
      if (attempt > 1) console.log(`  Retrying ${attemptLabel}...`);

      const genPromise =
        provider === 'openai'
          ? generateWithOpenAI(prompt, outputPath, apiKey, wsRequire)
          : generateWithGoogle(prompt, outputPath, apiKey, wsRequire, aspectRatio);

      await withTimeout(genPromise, REQUEST_TIMEOUT_MS, attemptLabel);
      return true;
    } catch (err) {
      lastErr = err;
      const isRateLimit = isRateLimitError(err);

      if (attempt < MAX_RETRIES) {
        const delay = isRateLimit
          ? RATE_LIMIT_DELAY_MS * attempt
          : BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(
          `  ${attemptLabel} failed: ${err.message}${isRateLimit ? ' (rate limited)' : ''}` +
            ` — waiting ${(delay / 1000).toFixed(0)}s before retry`
        );
        await sleep(delay);
      }
    }
  }

  throw lastErr;
}

// ---------------------------------------------------------------------------
// Build prompts for reference images
// ---------------------------------------------------------------------------

/**
 * Build character/subject reference prompts from visual_style.
 * These capture the character's appearance in neutral poses and settings
 * so Veo can maintain subject consistency across clips.
 */
function buildCharacterReferencePrompts(videoSpec) {
  const visualStyle = videoSpec.visual_style || '';
  const refConfig = videoSpec.reference_images || {};
  const subjectDesc = refConfig.subject_description || visualStyle;

  if (!subjectDesc) return [];

  // Generate up to 3 reference images with varying angles/poses
  const refAngles = [
    {
      suffix: 'Medium shot, facing slightly to the right, natural relaxed expression, neutral background',
      label: 'medium shot',
    },
    {
      suffix: 'Close-up portrait, looking directly at camera, warm natural lighting, clean background',
      label: 'close-up portrait',
    },
    {
      suffix: 'Three-quarter body shot, slight turn to left, standing naturally, simple backdrop',
      label: 'three-quarter shot',
    },
  ];

  const count = Math.min(refConfig.reference_count || 3, 3);
  return refAngles.slice(0, count).map((angle, i) => ({
    prompt: `${subjectDesc}. ${angle.suffix}. Photorealistic, high detail, 4K quality.`,
    filename: `ref-${i + 1}.png`,
    label: `character reference ${i + 1} (${angle.label})`,
  }));
}

/**
 * Build first-frame prompts for each scene.
 * Combines visual_style + scene prompt into a still-image prompt
 * that represents the opening frame of that video clip.
 */
function buildFirstFramePrompts(videoSpec) {
  const visualStyle = videoSpec.visual_style || '';
  const scenes = videoSpec.scenes || [];

  return scenes.map((scene, i) => {
    // Combine visual style + scene-specific prompt for a still image
    let prompt = scene.prompt;
    if (visualStyle) prompt = `${visualStyle}. ${prompt}`;
    // Add still-image directives (Veo will animate FROM this frame)
    prompt += '. Photorealistic still photograph, cinematic composition, high detail, 4K quality.';

    return {
      prompt,
      filename: `scene-${scene.scene_number}.png`,
      label: `scene ${scene.scene_number} first-frame`,
    };
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const startTime = Date.now();

const totalTimer = setTimeout(() => {
  console.error(`\nFATAL: Total timeout exceeded (${TOTAL_TIMEOUT_MS / 1000}s). Exiting.`);
  process.exit(2);
}, TOTAL_TIMEOUT_MS);
totalTimer.unref?.();

const postDir = path.resolve(process.argv[2] || '.');

// Load video.json
const videoJsonPath = path.join(postDir, 'video.json');
if (!fs.existsSync(videoJsonPath)) {
  console.error(`FATAL: video.json not found at ${videoJsonPath}`);
  console.error('  The agent must create video.json with scene descriptions first.');
  process.exit(1);
}

const videoSpec = JSON.parse(fs.readFileSync(videoJsonPath, 'utf-8'));
const scenes = videoSpec.scenes || [];

if (scenes.length === 0) {
  console.error('FATAL: video.json has no scenes defined.');
  process.exit(1);
}

// Check if reference images are enabled (default: true for gemini provider)
const provider = videoSpec.video_provider || 'gemini';
const refConfig = videoSpec.reference_images || {};
const enableRefs = refConfig.enabled !== false && provider === 'gemini';

if (!enableRefs) {
  console.log('Reference image generation is disabled or provider is not Gemini. Skipping.');
  process.exit(0);
}

// Resolve image provider & credentials
const config = loadConfig(postDir);
const imageProvider = config.image_provider || 'google-genai';
const resolved = resolveApiKey(imageProvider, config);

if (!resolved) {
  console.error(`No API key found for image provider "${imageProvider}". Run setup or add the key.`);
  process.exit(1);
}

const wsRequire = workspaceRequire(postDir);
const refDir = path.join(postDir, 'video-references');
ensureDir(refDir);

// Determine aspect ratio from video spec
const aspectRatio = videoSpec.aspect_ratio || '9:16';

// Build all image generation tasks
const charRefPrompts = buildCharacterReferencePrompts(videoSpec);
const firstFramePrompts = buildFirstFramePrompts(videoSpec);
const allTasks = [...charRefPrompts, ...firstFramePrompts];

console.log(`\nPostGen Video Reference Image Generation`);
console.log(`  Image provider: ${imageProvider}`);
console.log(`  Aspect ratio: ${aspectRatio}`);
console.log(`  Character references: ${charRefPrompts.length}`);
console.log(`  First-frame images: ${firstFramePrompts.length}`);
console.log(`  Total images: ${allTasks.length}`);
console.log(`  Timeout: ${REQUEST_TIMEOUT_MS / 1000}s per image, ${TOTAL_TIMEOUT_MS / 1000}s total`);
console.log(`  Retries: up to ${MAX_RETRIES} attempts per image\n`);

let successCount = 0;
let skipCount = 0;
let failCount = 0;

for (const task of allTasks) {
  const outputPath = path.join(refDir, task.filename);

  // Idempotency: skip images that already exist
  if (fs.existsSync(outputPath)) {
    const fileSize = fs.statSync(outputPath).size;
    if (fileSize > 1024) {
      console.log(`  [skip] ${task.label} — already exists (${(fileSize / 1024).toFixed(0)}KB)`);
      skipCount++;
      continue;
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`[${elapsed}s] Generating ${task.label}...`);

  try {
    await generateWithRetry(
      task.prompt,
      outputPath,
      imageProvider === 'google-genai' ? 'google' : 'openai',
      resolved.key,
      wsRequire,
      aspectRatio,
      task.label
    );
    const size = fs.statSync(outputPath).size;
    console.log(`  ✓ ${task.label}: ${task.filename} (${(size / 1024).toFixed(0)}KB)`);
    successCount++;
  } catch (err) {
    console.error(`  ✗ ${task.label} failed after ${MAX_RETRIES} attempts: ${err.message}`);
    failCount++;
  }

  // Delay between images to respect rate limits
  if (task !== allTasks[allTasks.length - 1]) {
    await sleep(BASE_DELAY_MS);
  }
}

// ---------------------------------------------------------------------------
// Write manifest
// ---------------------------------------------------------------------------

const manifest = {
  type: 'video-references',
  image_provider: imageProvider,
  aspect_ratio: aspectRatio,
  generated_at: new Date().toISOString(),
  character_references: charRefPrompts.map((t) => ({
    file: t.filename,
    exists: fs.existsSync(path.join(refDir, t.filename)),
  })),
  first_frames: firstFramePrompts.map((t) => ({
    file: t.filename,
    scene_number: parseInt(t.filename.match(/scene-(\d+)/)?.[1] || '0'),
    exists: fs.existsSync(path.join(refDir, t.filename)),
  })),
  total_generated: successCount,
  total_skipped: skipCount,
  total_failed: failCount,
};

const manifestPath = path.join(refDir, 'manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

clearTimeout(totalTimer);

const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\nVideo reference image generation complete in ${totalElapsed}s.`);
console.log(`  ${successCount} generated, ${skipCount} skipped, ${failCount} failed`);
console.log(`  Output: ${refDir}/`);
console.log(`  Manifest: ${manifestPath}`);

if (failCount > 0) {
  console.log('  WARNING: Some reference images failed. Video generation will proceed without them.');
}
