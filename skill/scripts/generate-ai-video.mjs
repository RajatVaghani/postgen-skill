#!/usr/bin/env node
/**
 * PostGen – Generate AI video from scene descriptions using Kling text-to-video.
 *
 * Usage:
 *   node generate-ai-video.mjs <post-dir> [--model kling-v3]
 *                                          [--mode std|pro]
 *                                          [--aspect-ratio 9:16|16:9|1:1]
 *
 * Reads video.json from the post directory, which contains scene descriptions
 * written by the agent. Generates video clips via Kling text-to-video API,
 * then writes an ai-video manifest (ai-video.json) with clip metadata.
 *
 * Strategy for reaching target duration (default 30s):
 *   - Scenes are batched into multi-shot calls (up to 6 scenes per call)
 *   - Each call produces one cohesive clip with smooth scene transitions
 *   - Multiple clips are stitched by composite-video.mjs
 *
 * Kling text-to-video supports:
 *   - Single prompt mode: one scene → one clip
 *   - Multi-shot mode: up to 6 storyboard scenes → one cohesive clip
 *   - Max duration per call varies by model (5s or 10s per scene)
 */
import fs from 'fs';
import path from 'path';
import { findWorkspaceRoot, loadConfig } from './workspace.mjs';
import { resolveVideoKey } from './resolve-key.mjs';
import {
  createTextToVideo,
  waitForTextToVideo,
  downloadFile,
} from './kling-client.mjs';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let postDir = '.';
let modelName = '';
let mode = '';
let aspectRatio = '';
let maxRetries = 2;
let concurrency = 2;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--model' && args[i + 1]) modelName = args[++i];
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
// Resolve Kling credentials
// ---------------------------------------------------------------------------

const klingCreds = resolveVideoKey('kling', config);
if (!klingCreds) {
  console.error('FATAL: Kling credentials not found.');
  console.error('  Set kling_access_key + kling_secret_key in postgen.config.json,');
  console.error('  or KLING_ACCESS_KEY + KLING_SECRET_KEY env vars.');
  process.exit(1);
}

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

// Apply CLI overrides, then fall back to video.json, then defaults
modelName = modelName || videoSpec.model || 'kling-v3';
mode = mode || videoSpec.mode || 'std';
aspectRatio = aspectRatio || videoSpec.aspect_ratio || '9:16';
const scenes = videoSpec.scenes || [];
const negativePrompt = videoSpec.negative_prompt || '';

if (scenes.length === 0) {
  console.error('FATAL: video.json has no scenes defined.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Batch scenes into multi-shot calls
// ---------------------------------------------------------------------------

const totalDuration = scenes.reduce((sum, s) => sum + Number(s.duration || 5), 0);

/**
 * Build scene batches for multi-shot calls.
 * kling-v3 supports multi-shot: up to 6 scenes per call, up to 10s total per batch.
 */
function buildBatches() {
  const batches = [];
  let current = [];
  let currentDur = 0;
  for (const scene of scenes) {
    const dur = Number(scene.duration || 5);
    if (current.length > 0 && (current.length >= 6 || currentDur + dur > 10)) {
      batches.push(current);
      current = [];
      currentDur = 0;
    }
    current.push(scene);
    currentDur += dur;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

const sceneBatches = buildBatches();

console.log(`\nPostGen AI Video — Kling Text-to-Video`);
console.log(`  Model: ${modelName}`);
console.log(`  Mode: ${mode}`);
console.log(`  Aspect ratio: ${aspectRatio}`);
console.log(`  Scenes: ${scenes.length}`);
console.log(`  Strategy: multi-shot (${sceneBatches.length} batches)`);
console.log(`  Target duration: ${totalDuration}s`);
console.log(`  Concurrency: ${concurrency}`);
console.log();

// ---------------------------------------------------------------------------
// Generate a clip for a batch of scenes (with retry)
// ---------------------------------------------------------------------------

async function generateClip(batch, batchIndex, totalBatches, outputDir) {
  const batchNum = batchIndex + 1;
  const batchDuration = batch.reduce((sum, s) => sum + Number(s.duration || 5), 0);
  const sceneRange = batch.map(s => s.scene_number).join(',');

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      console.log(`  [clip ${batchNum}/${totalBatches}] Submitting scenes [${sceneRange}] (attempt ${attempt}, ${batchDuration}s)...`);

      let taskResult;

      if (batch.length === 1) {
        // Single scene — use simple prompt mode
        const scene = batch[0];
        console.log(`    Prompt: "${scene.prompt.slice(0, 70)}..."`);

        taskResult = await createTextToVideo({
          accessKey: klingCreds.accessKey,
          secretKey: klingCreds.secretKey,
          prompt: scene.prompt,
          modelName,
          mode,
          duration: String(scene.duration || 5),
          aspectRatio,
          negativePrompt,
        });
      } else {
        // Multi-shot — send all scenes in one call
        for (const s of batch) {
          console.log(`    Scene ${s.scene_number}: "${s.prompt.slice(0, 60)}..." (${s.duration || 5}s)`);
        }

        taskResult = await createTextToVideo({
          accessKey: klingCreds.accessKey,
          secretKey: klingCreds.secretKey,
          scenes: batch.map((s) => ({
            prompt: s.prompt,
            duration: Number(s.duration || 5),
          })),
          shotType: 'customize',
          modelName,
          mode,
          aspectRatio,
          negativePrompt,
        });
      }

      console.log(`    Task ID: ${taskResult.taskId} — polling...`);

      const video = await waitForTextToVideo(taskResult.taskId, taskResult.token, {
        intervalMs: 8_000,
        maxWaitMs: 600_000, // 10 min max per clip
        onProgress: ({ taskStatus, elapsedS }) => {
          process.stdout.write(`    [${elapsedS}s] ${taskStatus}      \r`);
        },
      });

      // Download the clip
      const clipPath = path.join(outputDir, `clip-${batchNum}.mp4`);
      const dl = await downloadFile(video.url, clipPath);
      console.log(`    Downloaded: clip-${batchNum}.mp4 (${(dl.size / 1024 / 1024).toFixed(1)}MB, ${video.duration}s)`);

      return {
        clip: batchNum,
        file: `clip-${batchNum}.mp4`,
        duration: parseFloat(video.duration),
        scenes: batch.map(s => s.scene_number),
        klingVideoId: video.id,
      };
    } catch (err) {
      console.error(`    Attempt ${attempt} failed: ${err.message}`);
      if (attempt > maxRetries) {
        throw new Error(`Clip ${batchNum} (scenes [${sceneRange}]) failed after ${maxRetries + 1} attempts: ${err.message}`);
      }
      const backoff = 10_000 * Math.pow(2, attempt - 1);
      console.log(`    Retrying in ${backoff / 1000}s...`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
}

// ---------------------------------------------------------------------------
// Main — generate clips with controlled concurrency
// ---------------------------------------------------------------------------

const videoDir = path.join(postDir, 'ai-video');
if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });

const startTime = Date.now();
const results = new Array(sceneBatches.length);
const errors = [];

// Process batches with concurrency control
for (let bStart = 0; bStart < sceneBatches.length; bStart += concurrency) {
  const bEnd = Math.min(bStart + concurrency, sceneBatches.length);
  const slice = sceneBatches.slice(bStart, bEnd);

  const promises = slice.map((batch, sliceIdx) => {
    const globalIdx = bStart + sliceIdx;
    return generateClip(batch, globalIdx, sceneBatches.length, videoDir)
      .then((result) => { results[globalIdx] = result; })
      .catch((err) => {
        errors.push({ clip: globalIdx + 1, error: err.message });
        results[globalIdx] = null;
      });
  });

  await Promise.all(promises);
}

// ---------------------------------------------------------------------------
// Write manifest
// ---------------------------------------------------------------------------

const successClips = results.filter(Boolean);

const manifest = {
  provider: 'kling',
  type: 'text-to-video',
  model: modelName,
  mode,
  aspect_ratio: aspectRatio,
  generated_at: new Date().toISOString(),
  scenes_total: scenes.length,
  clips: successClips,
  failed: errors,
  total_clips: successClips.length,
  total_duration: successClips.reduce((sum, r) => sum + r.duration, 0),
};

const manifestPath = path.join(postDir, 'ai-video.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

console.log(`\nAI Video generation complete in ${elapsed}s`);
console.log(`  Clips: ${manifest.total_clips}/${sceneBatches.length}`);
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
