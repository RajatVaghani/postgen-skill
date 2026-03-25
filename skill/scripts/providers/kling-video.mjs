/**
 * PostGen – Kling video provider.
 *
 * Generates one AI video clip per scene using Kling's text-to-video API.
 * Each clip is 10 seconds. Supports retry with exponential backoff and
 * controlled concurrency.
 *
 * Exports a single function: generateClips()
 */
import fs from 'fs';
import path from 'path';
import {
  createTextToVideo,
  waitForTextToVideo,
  downloadFile,
} from '../kling-client.mjs';

const CLIP_DURATION = '10';

/**
 * Generate video clips via Kling text-to-video, one per scene.
 *
 * @param {object} params
 * @param {string} params.postDir        Absolute path to the post directory
 * @param {object} params.videoSpec      Parsed video.json
 * @param {object} params.credentials    { accessKey, secretKey }
 * @param {object} params.options        { modelName, mode, aspectRatio, concurrency, maxRetries }
 * @returns {{ clips: Array, errors: Array }}
 */
export async function generateClips({ postDir, videoSpec, credentials, options = {} }) {
  const {
    modelName = 'kling-v3',
    mode = 'std',
    aspectRatio = '9:16',
    concurrency = 2,
    maxRetries = 2,
  } = options;

  const scenes = videoSpec.scenes || [];
  const negativePrompt = videoSpec.negative_prompt || '';
  const visualStyle = videoSpec.visual_style || '';
  const outputDir = path.join(postDir, 'ai-video');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  console.log(`  Provider: Kling (${modelName}, ${mode})`);
  console.log(`  Clip duration: ${CLIP_DURATION}s per scene`);
  console.log(`  Scenes: ${scenes.length}`);
  console.log(`  Concurrency: ${concurrency}`);
  console.log();

  const results = new Array(scenes.length);
  const errors = [];
  let skippedCount = 0;

  for (let bStart = 0; bStart < scenes.length; bStart += concurrency) {
    const bEnd = Math.min(bStart + concurrency, scenes.length);
    const slice = scenes.slice(bStart, bEnd);

    const promises = slice.map((scene, sliceIdx) => {
      const idx = bStart + sliceIdx;
      const clipNum = idx + 1;

      // Idempotency: skip clips that already exist on disk
      const existingClip = path.join(outputDir, `clip-${clipNum}.mp4`);
      if (fs.existsSync(existingClip)) {
        const fileSize = fs.statSync(existingClip).size;
        if (fileSize > 1024) { // >1KB = likely valid
          console.log(`  [clip ${clipNum}/${scenes.length}] Already exists (${(fileSize / 1024 / 1024).toFixed(1)}MB) — skipping`);
          skippedCount++;
          results[idx] = {
            clip: clipNum,
            file: `clip-${clipNum}.mp4`,
            duration: parseFloat(CLIP_DURATION),
            scenes: [scene.scene_number],
          };
          return Promise.resolve();
        }
      }

      return generateSingleClip({
        scene,
        clipIndex: idx,
        totalClips: scenes.length,
        outputDir,
        credentials,
        modelName,
        mode,
        aspectRatio,
        negativePrompt,
        visualStyle,
        maxRetries,
      })
        .then((result) => { results[idx] = result; })
        .catch((err) => {
          errors.push({ clip: idx + 1, error: err.message });
          results[idx] = null;
        });
    });

    await Promise.all(promises);
  }

  if (skippedCount > 0) {
    console.log(`\n  Idempotency: ${skippedCount}/${scenes.length} clips already existed — skipped API calls.`);
  }

  return {
    clips: results.filter(Boolean),
    errors,
  };
}

async function generateSingleClip({
  scene, clipIndex, totalClips, outputDir, credentials,
  modelName, mode, aspectRatio, negativePrompt, visualStyle, maxRetries,
}) {
  const clipNum = clipIndex + 1;
  // Build prompt: visual_style prefix + scene prompt
  const fullPrompt = visualStyle ? `${visualStyle}. ${scene.prompt}` : scene.prompt;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      console.log(`  [clip ${clipNum}/${totalClips}] Scene ${scene.scene_number} (attempt ${attempt}, ${CLIP_DURATION}s)...`);
      console.log(`    Prompt: "${scene.prompt.slice(0, 70)}..."`);

      const taskResult = await createTextToVideo({
        accessKey: credentials.accessKey,
        secretKey: credentials.secretKey,
        prompt: fullPrompt,
        modelName,
        mode,
        duration: CLIP_DURATION,
        aspectRatio,
        negativePrompt,
      });

      console.log(`    Task ID: ${taskResult.taskId} — polling...`);

      const video = await waitForTextToVideo(taskResult.taskId, taskResult.token, {
        intervalMs: 8_000,
        maxWaitMs: 600_000,
        onProgress: ({ taskStatus, elapsedS }) => {
          process.stdout.write(`    [${elapsedS}s] ${taskStatus}      \r`);
        },
      });

      const clipPath = path.join(outputDir, `clip-${clipNum}.mp4`);
      const dl = await downloadFile(video.url, clipPath);
      console.log(`    Downloaded: clip-${clipNum}.mp4 (${(dl.size / 1024 / 1024).toFixed(1)}MB, ${video.duration}s)`);

      return {
        clip: clipNum,
        file: `clip-${clipNum}.mp4`,
        duration: parseFloat(video.duration),
        scenes: [scene.scene_number],
        klingVideoId: video.id,
      };
    } catch (err) {
      console.error(`    Attempt ${attempt} failed: ${err.message}`);
      if (attempt > maxRetries) {
        throw new Error(`Clip ${clipNum} (scene ${scene.scene_number}) failed after ${maxRetries + 1} attempts: ${err.message}`);
      }
      const backoff = 10_000 * Math.pow(2, attempt - 1);
      console.log(`    Retrying in ${backoff / 1000}s...`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
}
