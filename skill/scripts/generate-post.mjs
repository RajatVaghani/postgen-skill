#!/usr/bin/env node
/**
 * PostGen – Full pipeline orchestrator.
 *
 * Supports TWO distinct flows based on which content file exists:
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  FLOW A: Carousel (slides.json)                                │
 * │  → backgrounds → compress → build HTML → render PNG → video    │
 * │  Per-format: instagram (4:5), tiktok (9:16)                    │
 * ├─────────────────────────────────────────────────────────────────┤
 * │  FLOW B: AI Video (video.json)                                 │
 * │  → AI text-to-video (Gemini Veo or Kling) → TTS → composite   │
 * │  ONE video output (9:16). Repost to TikTok/Reels/Shorts.      │
 * │  No slides.json needed. No backgrounds. No carousel.           │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Usage:
 *   node generate-post.mjs <post-dir> [--skip-video] [--skip-compress] [--dry-run]
 *                                      [--timeout <ms>] [--ai-video] [--voiceover]
 *                                      [--tts-provider openai|elevenlabs|gemini]
 *
 * Flags:
 *   --dry-run            Validate without generating (no API calls)
 *   --skip-video         Skip ALL video generation (carousel flow only)
 *   --skip-compress      Skip ffmpeg background compression (carousel flow only)
 *   --ai-video           Enable Kling AI video (carousel flow: image-to-video per slide)
 *   --voiceover          Enable TTS voiceover
 *   --tts-provider <p>   TTS provider: openai, elevenlabs, or gemini (auto-detects if omitted)
 *   --timeout <ms>       Per-step timeout in ms (default: 600000 = 10 minutes)
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { findWorkspaceRoot, loadConfig } from './workspace.mjs';
import { loadAndNormalizeSlides } from './normalize-slides.mjs';
import { resolveApiKey, resolveVideoKey } from './resolve-key.mjs';
import { validateVideoSpec } from './validate-video-json.mjs';
import { validateAiVideoManifest, validateVoiceoverManifest } from './validate-manifests.mjs';
import { acquireLock, releaseLock } from './pipeline-lock.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
let postDir = '.';
let skipVideo = false;
let skipCompress = false;
let dryRun = false;
let enableAiVideo = false;
let enableVoiceover = false;
let ttsProvider = '';
let stepTimeout = 600_000; // 10 minutes per step

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--skip-video') skipVideo = true;
  else if (args[i] === '--skip-compress') skipCompress = true;
  else if (args[i] === '--dry-run') dryRun = true;
  else if (args[i] === '--ai-video') enableAiVideo = true;
  else if (args[i] === '--voiceover') enableVoiceover = true;
  else if (args[i] === '--tts-provider' && args[i + 1]) ttsProvider = args[++i];
  else if (args[i] === '--timeout' && args[i + 1]) stepTimeout = Number(args[++i]);
  else if (!args[i].startsWith('--')) postDir = args[i];
}

postDir = path.resolve(postDir);

// ---------------------------------------------------------------------------
// Detect flow: video.json → Flow B (AI Video), slides.json → Flow A (Carousel)
// ---------------------------------------------------------------------------

const hasVideoJson = fs.existsSync(path.join(postDir, 'video.json'));
const hasSlidesJson = fs.existsSync(path.join(postDir, 'slides.json'));

if (!hasVideoJson && !hasSlidesJson) {
  console.error('FATAL: Neither video.json nor slides.json found in ' + postDir);
  console.error('  Create video.json for AI video posts, or slides.json for carousel posts.');
  process.exit(1);
}

// video.json takes priority — it's a completely separate flow
const flowType = hasVideoJson ? 'video' : 'carousel';

console.log('=== PostGen Pipeline ===\n');

const wsRoot = findWorkspaceRoot(postDir);
if (!wsRoot) {
  console.error('FATAL: postgen.config.json not found – run setup first.');
  process.exit(1);
}

const config = loadConfig(postDir);

// ---------------------------------------------------------------------------
// Shared: system dependency checks
// ---------------------------------------------------------------------------

let hasFFmpeg = false;
try {
  execSync('ffmpeg -version', { stdio: 'pipe' });
  hasFFmpeg = true;
} catch { /* no ffmpeg */ }

let hasChromium = false;
try {
  const nmDir = path.join(wsRoot, 'node_modules');
  if (fs.existsSync(path.join(nmDir, 'playwright'))) hasChromium = true;
} catch { /* can't check */ }

// Validate brand config
const configIssues = [];
if (!config.brand?.name || config.brand.name === 'My Brand') {
  configIssues.push('brand.name is not configured (still default "My Brand")');
}
if (configIssues.length > 0) {
  console.error('CONFIG ISSUES:');
  for (const issue of configIssues) console.error(`  [!] ${issue}`);
  console.log();
}

// ---------------------------------------------------------------------------
// Lock file: prevent concurrent pipeline runs
// ---------------------------------------------------------------------------

let lockPath;
try {
  lockPath = acquireLock(postDir);
} catch (err) {
  console.error(`FATAL: ${err.message}`);
  process.exit(1);
}

// Ensure lock is released on exit (normal or crash)
process.on('exit', () => releaseLock(lockPath));
process.on('SIGINT', () => { releaseLock(lockPath); process.exit(130); });
process.on('SIGTERM', () => { releaseLock(lockPath); process.exit(143); });
process.on('uncaughtException', (err) => {
  releaseLock(lockPath);
  console.error('Uncaught exception:', err);
  process.exit(1);
});

// ---------------------------------------------------------------------------
// Pipeline runner
// ---------------------------------------------------------------------------

const NODE_PATH = path.join(wsRoot, 'node_modules');
const env = { ...process.env, NODE_PATH };
const pipelineStart = Date.now();

function run(script, extraArgs = '', allowFailure = false) {
  const cmd = `node "${path.join(__dirname, script)}" "${postDir}" ${extraArgs}`.trim();
  const stepStart = Date.now();
  const elapsed = () => ((Date.now() - pipelineStart) / 1000).toFixed(0);
  console.log(`\n>>> [${elapsed()}s] ${script} ${extraArgs}\n`);
  try {
    execSync(cmd, { stdio: 'inherit', env, timeout: stepTimeout });
    console.log(`\n    ${script} completed in ${((Date.now() - stepStart) / 1000).toFixed(1)}s`);
  } catch (err) {
    const dur = ((Date.now() - stepStart) / 1000).toFixed(1);
    if (err.killed || err.signal === 'SIGTERM') {
      console.error(`\n    ${script} TIMED OUT after ${dur}s (limit: ${stepTimeout / 1000}s)`);
    } else {
      console.error(`\n    ${script} FAILED after ${dur}s`);
    }
    if (!allowFailure) {
      console.error(`\nPipeline aborted at: ${script}`);
      console.error(`To retry from this step, run the individual script manually.`);
      process.exit(1);
    }
  }
}

// ============================================================================
// FLOW B: AI Video Pipeline (video.json)
// ============================================================================

if (flowType === 'video') {
  const videoSpec = JSON.parse(fs.readFileSync(path.join(postDir, 'video.json'), 'utf-8'));

  // --- Schema validation (before any API calls) ---
  const { valid: schemaValid, errors: schemaErrors, warnings: schemaWarnings } = validateVideoSpec(videoSpec);
  if (schemaWarnings.length > 0) {
    console.log('  VIDEO.JSON WARNINGS:');
    for (const w of schemaWarnings) console.log(`    ⚠ ${w}`);
    console.log();
  }
  if (!schemaValid) {
    console.error('  VIDEO.JSON VALIDATION FAILED:');
    for (const e of schemaErrors) console.error(`    ✗ ${e}`);
    console.error('\n  Fix the errors above in video.json before running the pipeline.');
    releaseLock(lockPath);
    process.exit(1);
  }

  // Resolve video provider: video.json → config → auto-detect (Gemini first, then Kling)
  const explicitProvider = videoSpec.video_provider || config.video_provider || '';
  const geminiCreds = resolveVideoKey('gemini-video', config);
  const klingCreds = resolveVideoKey('kling', config);

  let videoProvider;
  if (explicitProvider === 'gemini' && geminiCreds) videoProvider = 'gemini';
  else if (explicitProvider === 'kling' && klingCreds) videoProvider = 'kling';
  else if (!explicitProvider && geminiCreds) videoProvider = 'gemini';
  else if (!explicitProvider && klingCreds) videoProvider = 'kling';

  if (!videoProvider) {
    console.error('FATAL: No video provider credentials found.');
    console.error('  Set GEMINI_API_KEY (for Gemini Veo) or KLING_ACCESS_KEY + KLING_SECRET_KEY (for Kling).');
    process.exit(1);
  }

  // Resolve TTS: CLI flag → video.json → config → auto-detect
  const vTtsProvider = ttsProvider || videoSpec.tts_provider || config.tts_provider || '';
  const hasVoiceoverEnabled = videoSpec.voiceover !== false;
  const hasTTS = resolveVideoKey('openai-tts', config) || resolveVideoKey('elevenlabs', config) || resolveVideoKey('gemini-tts', config);

  // Print plan
  const sceneCount = videoSpec.scenes?.length || 0;
  const clipDur = videoProvider === 'gemini' ? 8 : 10;
  const estDuration = sceneCount * clipDur;
  const hasCta = !!videoSpec.cta;

  console.log('Flow: AI VIDEO (video.json)');
  console.log(`  Scenes: ${sceneCount} (~${estDuration}s AI video${hasCta ? ' + 5s CTA' : ''})`);
  console.log(`  Video provider: ${videoProvider}${videoProvider === 'gemini' ? ' (Veo 3.1)' : ' (Kling)'}`);
  console.log(`  Aspect ratio: ${videoSpec.aspect_ratio || '9:16'}`);
  console.log(`  Voiceover: ${hasVoiceoverEnabled && hasTTS ? (vTtsProvider || 'auto-detect') : 'off'}`);
  console.log(`  CTA end-card: ${hasCta ? `"${videoSpec.cta.title}"` : 'none'}`);
  console.log(`  ffmpeg: ${hasFFmpeg ? 'available' : 'NOT FOUND (compositing will fail)'}`);
  console.log(`  Playwright: ${hasChromium ? 'available' : 'NOT FOUND (CTA rendering will fail)'}`);
  console.log(`  Step timeout: ${stepTimeout / 1000}s`);
  console.log(`  Output: ONE video file (repost to TikTok, Reels, Shorts)`);
  if (dryRun) console.log('  MODE: DRY RUN');
  console.log();

  // Check if reference images are enabled
  const refConfig = videoSpec.reference_images || {};
  const refsEnabled = refConfig.enabled !== false && videoProvider === 'gemini';
  if (refsEnabled) {
    console.log(`  Reference images: enabled (first-frames + character refs)`);
  } else if (videoProvider === 'gemini') {
    console.log(`  Reference images: disabled (set reference_images.enabled: true in video.json)`);
  }

  if (dryRun) {
    console.log('--- Dry run: video.json schema validation passed ---');
    console.log(`  ${sceneCount} scenes, ~${estDuration}s total${hasCta ? ' + 5s CTA' : ''}`);
    if (refsEnabled) console.log(`  Reference images: will generate before video clips`);
    console.log('\n=== Dry run complete ===');
    releaseLock(lockPath);
    process.exit(0);
  }

  // Step 0 (Gemini only): Generate reference images for visual consistency
  if (refsEnabled) {
    run('generate-video-references.mjs');
  }

  // Step 1: Generate AI video clips (auto-loads reference images if available)
  run('generate-ai-video.mjs', `--provider ${videoProvider}`);

  // Validate: ai-video manifest must exist and have clips
  const aiResult = validateAiVideoManifest(postDir);
  if (aiResult.warnings.length > 0) {
    for (const w of aiResult.warnings) console.log(`  ⚠ ${w}`);
  }
  if (!aiResult.valid) {
    console.error('\n  AI VIDEO MANIFEST VALIDATION FAILED:');
    for (const e of aiResult.errors) console.error(`    ✗ ${e}`);
    console.error('  Cannot proceed to compositing without valid clips.');
    releaseLock(lockPath);
    process.exit(1);
  }

  // Step 2: Generate TTS voiceover
  if (hasVoiceoverEnabled && hasTTS) {
    const ttsArgs = vTtsProvider ? `--provider ${vTtsProvider}` : '';
    run('generate-tts.mjs', ttsArgs);

    // Validate: voiceover manifest must exist and have segments
    const voResult = validateVoiceoverManifest(postDir);
    if (voResult.warnings.length > 0) {
      for (const w of voResult.warnings) console.log(`  ⚠ ${w}`);
    }
    if (!voResult.valid) {
      console.error('\n  VOICEOVER MANIFEST VALIDATION FAILED:');
      for (const e of voResult.errors) console.error(`    ✗ ${e}`);
      console.error('  Continuing without voiceover...');
      // Don't exit — video without voiceover is still usable
    }
  }

  // Step 3: Composite — stitches AI clips + CTA end-card + voiceover + subtitles
  if (hasFFmpeg) {
    run('composite-video.mjs');
  } else {
    console.error('\nFATAL: ffmpeg is required for video compositing.');
    process.exit(1);
  }

  // Final summary
  const totalElapsed = ((Date.now() - pipelineStart) / 1000).toFixed(1);
  console.log(`\n=== Pipeline complete in ${totalElapsed}s ===`);
  console.log(`Output: ${postDir}`);
  console.log(`Type: AI video (${videoProvider})`);

  const videoPath = path.join(postDir, 'final', 'postgen-video.mp4');
  if (fs.existsSync(videoPath)) {
    const sizeMB = (fs.statSync(videoPath).size / 1024 / 1024).toFixed(1);
    console.log(`  Video: ${videoPath} (${sizeMB}MB)`);
    console.log(`  Repost to: TikTok, Instagram Reels, YouTube Shorts`);
  }
  if (fs.existsSync(path.join(postDir, 'voiceover', 'manifest.json'))) {
    console.log(`  Voiceover: generated`);
  }
  if (fs.existsSync(path.join(postDir, 'ai-video', 'manifest.json'))) {
    console.log(`  AI clips: generated`);
  }

  releaseLock(lockPath);
  process.exit(0);
}

// ============================================================================
// FLOW A: Carousel Pipeline (slides.json)
// ============================================================================

// Validate image provider
if (!config.image_provider) {
  configIssues.push('image_provider is not set');
}
const provider = config.image_provider || 'google-genai';
const resolved = resolveApiKey(provider, config);
if (!resolved) {
  console.error(`FATAL: No API key found for image provider "${provider}". Run setup or add the key.`);
  process.exit(1);
}

// Load slides config
const { formats: slidesFormats, outputType, raw: slidesRaw } = loadAndNormalizeSlides(postDir);
const formats = slidesFormats || config.defaults?.formats || ['instagram', 'tiktok'];

if (!skipVideo && outputType === 'image') {
  skipVideo = true;
}

// Auto-enable enhanced video features from slides.json flags
if (slidesRaw.ai_video === true && !skipVideo) enableAiVideo = true;
if (slidesRaw.voiceover === true && !skipVideo) enableVoiceover = true;
if (slidesRaw.tts_provider && !ttsProvider) ttsProvider = slidesRaw.tts_provider;
if (!ttsProvider && config.tts_provider) ttsProvider = config.tts_provider;

// If output_type is 'video' and no explicit flags, enable voiceover by default
if ((outputType === 'video' || outputType === 'both') && !skipVideo && !enableVoiceover) {
  const hasTTS = resolveVideoKey('openai-tts', config) || resolveVideoKey('elevenlabs', config) || resolveVideoKey('gemini-tts', config);
  if (hasTTS) enableVoiceover = true;
}

// Check video provider credentials for AI video
if (enableAiVideo) {
  const geminiCreds = resolveVideoKey('gemini-video', config);
  const klingCreds = resolveVideoKey('kling', config);
  if (!geminiCreds && !klingCreds) {
    console.warn('  [!] AI video requested but no video provider credentials found — skipping AI video');
    enableAiVideo = false;
  }
}

// Print plan
console.log('Flow: CAROUSEL (slides.json)');
console.log(`  Post directory: ${postDir}`);
console.log(`  Formats: ${formats.join(', ')}`);
console.log(`  Output type: ${skipVideo ? 'image only' : 'image + video'}`);
console.log(`  Image provider: ${provider} (key via ${resolved?.source || 'MISSING'})`);
console.log(`  AI video: ${enableAiVideo ? 'enabled' : 'off'}`);
console.log(`  Voiceover (TTS): ${enableVoiceover ? (ttsProvider || 'auto-detect') : 'off'}`);
console.log(`  ffmpeg: ${hasFFmpeg ? 'available' : 'NOT FOUND (compression/video will fail)'}`);
console.log(`  Playwright: ${hasChromium ? 'available' : 'NOT FOUND (rendering will fail)'}`);
console.log(`  Step timeout: ${stepTimeout / 1000}s`);
if (dryRun) console.log('  MODE: DRY RUN (no generation, no rendering)');
console.log();

if (dryRun) {
  console.log('--- Dry run: validating slides.json ---');
  try {
    run('verify-output.mjs', '', true);
  } catch { /* reported by script */ }
  console.log('\n=== Dry run complete ===');
  console.log('Everything looks good. Remove --dry-run to generate for real.');
  process.exit(0);
}

// 1. Generate backgrounds
run('generate-backgrounds.mjs');

// 2. Compress backgrounds
if (!skipCompress && hasFFmpeg) {
  run('compress-backgrounds.mjs');
} else if (!skipCompress && !hasFFmpeg) {
  console.log('\n>>> Skipping compression (ffmpeg not available)');
}

// 3 & 4. Build + render for each format
for (const fmt of formats) {
  run('build-slides.mjs', `--format ${fmt}`);
  run('render-slides.mjs', `--format ${fmt}`);

  // 5. Basic slideshow video (only if NOT using AI video)
  if (!skipVideo && hasFFmpeg && !enableAiVideo) {
    run('generate-video.mjs', `--format ${fmt}`);
  }
}

// 6. Voiceover (TTS) — runs once, not per-format
if (enableVoiceover && !skipVideo) {
  const ttsArgs = ttsProvider ? `--provider ${ttsProvider}` : '';
  run('generate-tts.mjs', ttsArgs);
}

// 7. AI Video (Kling) — runs once (output is format-independent)
if (enableAiVideo && !skipVideo) {
  run('generate-ai-video.mjs');
}

// 8. Composite video (stitch AI clips + voiceover + subtitles) — runs once
if (!skipVideo && hasFFmpeg && (enableAiVideo || enableVoiceover)) {
  run('composite-video.mjs');
}

// 9. Verify output
console.log('\n');
try {
  run('verify-output.mjs', '', true);
} catch {
  console.log('\nVerification found issues — see report above.');
}

// Final summary
const totalElapsed = ((Date.now() - pipelineStart) / 1000).toFixed(1);
console.log(`\n=== Pipeline complete in ${totalElapsed}s ===`);
console.log(`Output: ${postDir}`);
const typeLabel = skipVideo ? 'image' : enableAiVideo ? 'image + AI video' : 'image + video';
console.log(`Type: ${typeLabel}`);
for (const fmt of formats) {
  const fmtFinalDir = path.join(postDir, fmt, 'final');
  if (fs.existsSync(fmtFinalDir)) {
    const pngs = fs.readdirSync(fmtFinalDir).filter((f) => f.endsWith('.png'));
    const mp4s = fs.readdirSync(fmtFinalDir).filter((f) => f.endsWith('.mp4'));
    const videoLabel = mp4s.length > 0 ? ` + ${mp4s.length} video(s)` : '';
    console.log(`  ${fmt}: ${pngs.length} slide image(s)${videoLabel}`);
  }
}
if (enableVoiceover && fs.existsSync(path.join(postDir, 'voiceover', 'manifest.json'))) {
  console.log(`  voiceover: generated`);
}
if (enableAiVideo && fs.existsSync(path.join(postDir, 'ai-video', 'manifest.json'))) {
  console.log(`  ai-video: generated`);
}
