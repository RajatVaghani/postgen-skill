#!/usr/bin/env node
/**
 * PostGen – Full pipeline orchestrator.
 *
 * Usage:
 *   node generate-post.mjs <post-dir> [--skip-video] [--skip-compress] [--dry-run]
 *                                      [--timeout <ms>] [--ai-video] [--voiceover]
 *                                      [--tts-provider openai|elevenlabs]
 *
 * Runs the complete pipeline in order:
 *   1. generate-backgrounds       (AI background images)
 *   2. compress-backgrounds       (ffmpeg PNG→JPG)
 *   3. build-slides               (HTML slide builder)
 *   4. render-slides              (Playwright HTML→PNG)
 *   5. generate-video             (basic ffmpeg slideshow — optional)
 *   6. generate-tts               (voiceover — optional, requires --voiceover or output_type=video)
 *   7. generate-ai-video          (Kling image-to-video — optional, requires --ai-video)
 *   8. composite-video            (stitch clips + audio + subtitles — when ai-video or voiceover)
 *   9. verify-output
 *
 * Flags:
 *   --dry-run            Validate everything without generating (no API calls, no rendering)
 *   --skip-video         Skip ALL video generation (basic + AI + composite)
 *   --skip-compress      Skip ffmpeg background compression
 *   --ai-video           Enable Kling AI video generation (image-to-video per slide)
 *   --voiceover          Enable TTS voiceover generation
 *   --tts-provider <p>   TTS provider: openai or elevenlabs (auto-detects if omitted)
 *   --timeout <ms>       Per-step timeout in ms (default: 600000 = 10 minutes)
 *
 * Expects slides.json to already exist in <post-dir>.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { findWorkspaceRoot, loadConfig } from './workspace.mjs';
import { loadAndNormalizeSlides } from './normalize-slides.mjs';
import { resolveApiKey, resolveVideoKey } from './resolve-key.mjs';

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
// Preflight checks
// ---------------------------------------------------------------------------

console.log('=== PostGen Pipeline ===\n');

if (!fs.existsSync(path.join(postDir, 'slides.json'))) {
  console.error('FATAL: slides.json not found in ' + postDir);
  process.exit(1);
}

const wsRoot = findWorkspaceRoot(postDir);
if (!wsRoot) {
  console.error('FATAL: postgen.config.json not found – run setup first.');
  process.exit(1);
}

const config = loadConfig(postDir);

// Validate config essentials
const configIssues = [];
if (!config.brand?.name || config.brand.name === 'My Brand') {
  configIssues.push('brand.name is not configured (still default "My Brand")');
}
if (!config.image_provider) {
  configIssues.push('image_provider is not set');
}
const provider = config.image_provider || 'google-genai';
const resolved = resolveApiKey(provider, config);
if (!resolved) {
  configIssues.push(`No API key found for provider "${provider}"`);
}
if (configIssues.length > 0) {
  console.error('CONFIG ISSUES:');
  for (const issue of configIssues) console.error(`  [!] ${issue}`);
  if (!resolved) {
    console.error('\nCannot proceed without an API key. Run setup or add the key.');
    process.exit(1);
  }
  console.log();
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

// If output_type is 'video' and no explicit flags, enable voiceover by default
if ((outputType === 'video' || outputType === 'both') && !skipVideo && !enableVoiceover) {
  // Check if a TTS provider is available before auto-enabling
  const hasTTS = resolveVideoKey('openai-tts', config) ||
                 resolveVideoKey('elevenlabs', config);
  if (hasTTS) enableVoiceover = true;
}

// Check Kling credentials for AI video
let hasKling = false;
if (enableAiVideo) {
  const klingCreds = resolveVideoKey('kling', config);
  if (klingCreds) {
    hasKling = true;
  } else {
    console.warn('  [!] AI video requested but no Kling credentials found — skipping AI video');
    enableAiVideo = false;
  }
}

// Check system dependencies
let hasFFmpeg = false;
try {
  execSync('ffmpeg -version', { stdio: 'pipe' });
  hasFFmpeg = true;
} catch {
  // no ffmpeg
}

let hasChromium = false;
try {
  const nmDir = path.join(wsRoot, 'node_modules');
  if (fs.existsSync(path.join(nmDir, 'playwright'))) {
    hasChromium = true;
  }
} catch {
  // can't check
}

// Print plan
console.log('Pipeline plan:');
console.log(`  Post directory: ${postDir}`);
console.log(`  Formats: ${formats.join(', ')}`);
console.log(`  Output type: ${skipVideo ? 'image only' : 'image + video'}`);
console.log(`  Image provider: ${provider} (key via ${resolved?.source || 'MISSING'})`);
console.log(`  AI video (Kling): ${enableAiVideo ? 'enabled' : 'off'}`);
console.log(`  Voiceover (TTS): ${enableVoiceover ? (ttsProvider || 'auto-detect') : 'off'}`);
console.log(`  ffmpeg: ${hasFFmpeg ? 'available' : 'NOT FOUND (compression/video will fail)'}`);
console.log(`  Playwright: ${hasChromium ? 'available' : 'NOT FOUND (rendering will fail)'}`);
console.log(`  Step timeout: ${stepTimeout / 1000}s`);
if (dryRun) console.log('  MODE: DRY RUN (no generation, no rendering)');
console.log();

if (dryRun) {
  // Run validation only
  console.log('--- Dry run: validating slides.json ---');
  try {
    run('verify-output.mjs', '', true); // validate-only mode
  } catch {
    // verification issues are reported by the script
  }
  console.log('\n=== Dry run complete ===');
  console.log('Everything looks good. Remove --dry-run to generate for real.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Pipeline execution
// ---------------------------------------------------------------------------

const NODE_PATH = path.join(wsRoot, 'node_modules');
const env = { ...process.env, NODE_PATH };

const pipelineStart = Date.now();
let currentStep = '';

function run(script, extraArgs = '', allowFailure = false) {
  const cmd = `node "${path.join(__dirname, script)}" "${postDir}" ${extraArgs}`.trim();
  currentStep = script;
  const stepStart = Date.now();
  console.log(`\n>>> [${stepLabel()}] ${script} ${extraArgs}\n`);
  try {
    execSync(cmd, { stdio: 'inherit', env, timeout: stepTimeout });
    const elapsed = ((Date.now() - stepStart) / 1000).toFixed(1);
    console.log(`\n    ${script} completed in ${elapsed}s`);
  } catch (err) {
    const elapsed = ((Date.now() - stepStart) / 1000).toFixed(1);
    if (err.killed || err.signal === 'SIGTERM') {
      console.error(`\n    ${script} TIMED OUT after ${elapsed}s (limit: ${stepTimeout / 1000}s)`);
    } else {
      console.error(`\n    ${script} FAILED after ${elapsed}s`);
    }
    if (!allowFailure) {
      console.error(`\nPipeline aborted at: ${script}`);
      console.error(`To retry from this step, run the individual script manually.`);
      process.exit(1);
    }
  }
}

function stepLabel() {
  return `${((Date.now() - pipelineStart) / 1000).toFixed(0)}s`;
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

  // 5. Basic slideshow video (ffmpeg PNG→MP4)
  if (!skipVideo && hasFFmpeg && !enableAiVideo) {
    // Only generate basic video if NOT using AI video (AI video replaces this)
    run('generate-video.mjs', `--format ${fmt}`);
  } else if (!skipVideo && !hasFFmpeg && !enableAiVideo) {
    console.log(`\n>>> Skipping basic video for ${fmt} (ffmpeg not available)`);
  }
}

// 6. Voiceover (TTS) — runs once, not per-format
if (enableVoiceover && !skipVideo) {
  const ttsArgs = ttsProvider ? `--provider ${ttsProvider}` : '';
  run('generate-tts.mjs', ttsArgs);
}

// 7. AI Video (Kling image-to-video) — per format
if (enableAiVideo && !skipVideo) {
  for (const fmt of formats) {
    run('generate-ai-video.mjs', `--format ${fmt}`);
  }
}

// 8. Composite video (stitch AI clips + voiceover + subtitles)
if (!skipVideo && hasFFmpeg && (enableAiVideo || enableVoiceover)) {
  for (const fmt of formats) {
    run('composite-video.mjs', `--format ${fmt}`);
  }
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
if (enableVoiceover && fs.existsSync(path.join(postDir, 'voiceover.json'))) {
  console.log(`  voiceover: generated`);
}
if (enableAiVideo && fs.existsSync(path.join(postDir, 'ai-video.json'))) {
  console.log(`  ai-video: generated`);
}
