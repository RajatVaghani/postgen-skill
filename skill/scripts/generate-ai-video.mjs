#!/usr/bin/env node
/**
 * PostGen – Generate AI video clips from scene descriptions.
 *
 * Thin dispatcher that resolves the video provider (Gemini Veo or Kling)
 * and delegates clip generation to the appropriate provider module.
 *
 * Usage:
 *   node generate-ai-video.mjs <post-dir> [--provider gemini|kling]
 *                                          [--model kling-v3]
 *                                          [--mode std|pro]
 *                                          [--aspect-ratio 9:16|16:9|1:1]
 *                                          [--concurrency N]
 *                                          [--retries N]
 *
 * Provider resolution order:
 *   1. --provider CLI flag
 *   2. video.json → video_provider field
 *   3. postgen.config.json → video_provider field
 *   4. Auto-detect: Gemini first, then Kling (based on available credentials)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { findWorkspaceRoot, loadConfig } from './workspace.mjs';
import { resolveVideoKey } from './resolve-key.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let postDir = '.';
let providerFlag = '';
let modelName = '';
let mode = '';
let aspectRatio = '';
let maxRetries = 2;
let concurrency = 2;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--provider' && args[i + 1]) providerFlag = args[++i];
  else if (args[i] === '--model' && args[i + 1]) modelName = args[++i];
  else if (args[i] === '--mode' && args[i + 1]) mode = args[++i];
  else if (args[i] === '--aspect-ratio' && args[i + 1]) aspectRatio = args[++i];
  else if (args[i] === '--concurrency' && args[i + 1]) concurrency = parseInt(args[++i]);
  else if (args[i] === '--retries' && args[i + 1]) maxRetries = parseInt(args[++i]);
  else if (!args[i].startsWith('--')) postDir = args[i];
}

postDir = path.resolve(postDir);
const wsRoot = findWorkspaceRoot(postDir);
if (!wsRoot) {
  console.error('FATAL: postgen.config.json not found – run setup first.');
  process.exit(1);
}

const config = loadConfig(postDir);

// ---------------------------------------------------------------------------
// Load video.json
// ---------------------------------------------------------------------------

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

aspectRatio = aspectRatio || videoSpec.aspect_ratio || '9:16';

// ---------------------------------------------------------------------------
// Resolve provider & credentials
// ---------------------------------------------------------------------------

function resolveProvider() {
  // 1. CLI flag
  if (providerFlag) return providerFlag;
  // 2. video.json field
  if (videoSpec.video_provider) return videoSpec.video_provider;
  // 3. Config field
  if (config.video_provider) return config.video_provider;
  // 4. Auto-detect: Gemini first, then Kling
  if (resolveVideoKey('gemini-video', config)) return 'gemini';
  if (resolveVideoKey('kling', config)) return 'kling';
  return null;
}

const provider = resolveProvider();
if (!provider) {
  console.error('FATAL: No video provider credentials found.');
  console.error('  Set GEMINI_API_KEY (for Gemini Veo) or KLING_ACCESS_KEY + KLING_SECRET_KEY (for Kling).');
  console.error('  Or set video_provider in postgen.config.json or video.json.');
  process.exit(1);
}

let credentials;
if (provider === 'gemini') {
  credentials = resolveVideoKey('gemini-video', config);
  if (!credentials) {
    console.error('FATAL: Gemini API key not found for video generation.');
    console.error('  Set GEMINI_API_KEY env var or gemini_api_key in postgen.config.json.');
    process.exit(1);
  }
} else if (provider === 'kling') {
  credentials = resolveVideoKey('kling', config);
  if (!credentials) {
    console.error('FATAL: Kling credentials not found.');
    console.error('  Set kling_access_key + kling_secret_key in postgen.config.json,');
    console.error('  or KLING_ACCESS_KEY + KLING_SECRET_KEY env vars.');
    process.exit(1);
  }
} else {
  console.error(`FATAL: Unknown video provider "${provider}". Must be "gemini" or "kling".`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Log plan
// ---------------------------------------------------------------------------

const clipDuration = provider === 'gemini' ? 8 : 10;
const totalDuration = scenes.length * clipDuration;

console.log(`\nPostGen AI Video Generation`);
console.log(`  Provider: ${provider}`);
console.log(`  Aspect ratio: ${aspectRatio}`);
console.log(`  Scenes: ${scenes.length}`);
console.log(`  Estimated duration: ${totalDuration}s (${clipDuration}s per clip)`);
console.log(`  Concurrency: ${concurrency}`);
console.log();

// ---------------------------------------------------------------------------
// Delegate to provider
// ---------------------------------------------------------------------------

const startTime = Date.now();

const providerModule = provider === 'gemini'
  ? await import(path.join(__dirname, 'providers', 'gemini-video.mjs'))
  : await import(path.join(__dirname, 'providers', 'kling-video.mjs'));

const { clips, errors } = await providerModule.generateClips({
  postDir,
  videoSpec,
  credentials,
  options: {
    modelName: modelName || videoSpec.model || (provider === 'kling' ? 'kling-v3' : undefined),
    mode: mode || videoSpec.mode || 'std',
    aspectRatio,
    concurrency,
    maxRetries,
  },
});

// ---------------------------------------------------------------------------
// Write manifest
// ---------------------------------------------------------------------------

const videoDir = path.join(postDir, 'ai-video');
if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });

const manifest = {
  provider,
  type: 'text-to-video',
  model: provider === 'gemini' ? 'veo-3.1-generate-preview' : (modelName || videoSpec.model || 'kling-v3'),
  mode: mode || videoSpec.mode || 'std',
  aspect_ratio: aspectRatio,
  generated_at: new Date().toISOString(),
  scenes_total: scenes.length,
  clips,
  failed: errors,
  total_clips: clips.length,
  total_duration: clips.reduce((sum, r) => sum + r.duration, 0),
};

const manifestPath = path.join(videoDir, 'manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

console.log(`\nAI Video generation complete in ${elapsed}s`);
console.log(`  Provider: ${provider}`);
console.log(`  Clips: ${manifest.total_clips}/${scenes.length}`);
console.log(`  Total duration: ${manifest.total_duration}s`);
console.log(`  Output: ${videoDir}/`);
console.log(`  Manifest: ${manifestPath}`);

if (errors.length > 0) {
  console.error(`\n  WARNINGS: ${errors.length} clip(s) failed:`);
  for (const e of errors) {
    console.error(`    Clip ${e.clip}: ${e.error}`);
  }
  process.exit(1);
}
