/**
 * PostGen – Gemini Veo 3.1 video provider.
 *
 * Generates one AI video clip per scene using Google's Veo 3.1 text-to-video
 * model via the @google/genai SDK. Each clip is 8 seconds (fixed by Veo).
 *
 * Supports three image-guided modes for improved visual consistency:
 *   1. First-frame image: Sets the starting frame for each clip (image → video)
 *   2. Reference images: Up to 3 asset reference images shared across clips
 *      for character/subject consistency
 *   3. Text-only: Falls back to pure text-to-video when no images are provided
 *
 * Supports retry with exponential backoff and controlled concurrency.
 *
 * Exports a single function: generateClips()
 */
import fs from 'fs';
import path from 'path';
import { workspaceRequire } from '../workspace.mjs';
import { downloadFile } from '../kling-client.mjs';

const VEO_MODEL = 'veo-3.1-generate-preview';
const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_MS = 600_000; // 10 minutes per clip

/**
 * Generate video clips via Gemini Veo 3.1, one per scene.
 *
 * @param {object} params
 * @param {string} params.postDir        Absolute path to the post directory
 * @param {object} params.videoSpec      Parsed video.json
 * @param {object} params.credentials    { key } — the Gemini API key
 * @param {object} params.options        { aspectRatio, concurrency, maxRetries }
 * @param {object} params.referenceData  Optional. { firstFrames, characterRefs }
 *   - firstFrames: Map<sceneNumber, { imageBytes: Buffer, mimeType: string }>
 *   - characterRefs: Array<{ imageBytes: Buffer, mimeType: string }> (max 3)
 * @returns {{ clips: Array, errors: Array }}
 */
export async function generateClips({ postDir, videoSpec, credentials, options = {}, referenceData = {} }) {
  const {
    aspectRatio = '9:16',
    concurrency = 2,
    maxRetries = 2,
  } = options;

  const scenes = videoSpec.scenes || [];
  const negativePrompt = videoSpec.negative_prompt || '';
  const visualStyle = videoSpec.visual_style || '';
  const outputDir = path.join(postDir, 'ai-video');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const wsRequire = workspaceRequire(postDir);
  const { GoogleGenAI } = wsRequire('@google/genai');
  const ai = new GoogleGenAI({ apiKey: credentials.key });

  // Determine image-guided mode
  const { firstFrames = new Map(), characterRefs = [] } = referenceData;
  const hasFirstFrames = firstFrames.size > 0;
  const hasCharRefs = characterRefs.length > 0;

  const modeLabel = hasFirstFrames && hasCharRefs
    ? 'image-guided (first-frame + character references)'
    : hasFirstFrames
      ? 'image-guided (first-frame only)'
      : hasCharRefs
        ? 'image-guided (character references only)'
        : 'text-to-video';

  console.log(`  Provider: Gemini Veo 3.1 (${VEO_MODEL})`);
  console.log(`  Mode: ${modeLabel}`);
  console.log(`  Clip duration: 8s per scene (fixed by Veo)`);
  console.log(`  Scenes: ${scenes.length}`);
  if (hasFirstFrames) console.log(`  First-frame images: ${firstFrames.size}`);
  if (hasCharRefs) console.log(`  Character references: ${characterRefs.length}`);
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
            duration: 8,
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
        ai,
        aspectRatio,
        negativePrompt,
        visualStyle,
        maxRetries,
        firstFrameImage: firstFrames.get(scene.scene_number) || null,
        characterRefs,
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
  scene, clipIndex, totalClips, outputDir, ai,
  aspectRatio, negativePrompt, visualStyle, maxRetries,
  firstFrameImage, characterRefs,
}) {
  const clipNum = clipIndex + 1;
  // Build prompt: visual_style prefix + scene prompt + negative prompt suffix
  let prompt = scene.prompt;
  if (visualStyle) prompt = `${visualStyle}. ${prompt}`;
  if (negativePrompt) prompt = `${prompt}. Avoid: ${negativePrompt}`;

  // Determine generation mode for logging
  const hasFirstFrame = !!firstFrameImage;
  const hasRefs = characterRefs && characterRefs.length > 0;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const modeStr = hasFirstFrame ? '(first-frame + text)' : '(text-only)';
      console.log(`  [clip ${clipNum}/${totalClips}] Scene ${scene.scene_number} ${modeStr} (attempt ${attempt})...`);
      console.log(`    Prompt: "${scene.prompt.slice(0, 70)}..."`);

      // Build the generateVideos request
      // Note: 'allow_all' for personGeneration is not supported in some regions
      // and when using reference images. Use 'allow_adult' instead.
      const request = {
        model: VEO_MODEL,
        prompt,
        config: {
          aspectRatio,
          personGeneration: 'allow_adult',
        },
      };

      // Add first-frame image if available (image → video)
      if (hasFirstFrame) {
        request.image = {
          imageBytes: firstFrameImage.imageBytes.toString('base64'),
          mimeType: firstFrameImage.mimeType,
        };
        console.log(`    First-frame: yes (${firstFrameImage.mimeType})`);
      }

      // Add character/subject reference images if available
      if (hasRefs) {
        request.config.referenceImages = characterRefs.map((ref) => ({
          image: {
            imageBytes: ref.imageBytes.toString('base64'),
            mimeType: ref.mimeType,
          },
          referenceType: 'asset',
        }));
        console.log(`    Character refs: ${characterRefs.length}`);
      }

      let operation = await ai.models.generateVideos(request);

      const startMs = Date.now();
      while (!operation.done) {
        const elapsedS = ((Date.now() - startMs) / 1000).toFixed(0);
        if (Date.now() - startMs > MAX_POLL_MS) {
          throw new Error(`Veo polling timed out after ${MAX_POLL_MS / 1000}s`);
        }
        process.stdout.write(`    [${elapsedS}s] processing...      \r`);
        await sleep(POLL_INTERVAL_MS);
        operation = await ai.operations.getVideosOperation({ operation });
      }

      const generatedVideo = operation.response?.generatedVideos?.[0];
      if (!generatedVideo?.video) {
        throw new Error('Veo operation succeeded but no video in response');
      }

      const clipPath = path.join(outputDir, `clip-${clipNum}.mp4`);

      // Try SDK download first, fall back to URL download
      try {
        await ai.files.download({
          file: generatedVideo.video,
          downloadPath: clipPath,
        });
      } catch {
        if (generatedVideo.video.uri) {
          await downloadFile(generatedVideo.video.uri, clipPath);
        } else {
          throw new Error('Cannot download video — no URI available');
        }
      }

      const fileSize = fs.statSync(clipPath).size;
      console.log(`    Downloaded: clip-${clipNum}.mp4 (${(fileSize / 1024 / 1024).toFixed(1)}MB, 8s)`);

      return {
        clip: clipNum,
        file: `clip-${clipNum}.mp4`,
        duration: 8,
        scenes: [scene.scene_number],
        imageGuided: hasFirstFrame || hasRefs,
      };
    } catch (err) {
      console.error(`    Attempt ${attempt} failed: ${err.message}`);
      if (attempt > maxRetries) {
        throw new Error(`Clip ${clipNum} (scene ${scene.scene_number}) failed after ${maxRetries + 1} attempts: ${err.message}`);
      }
      const backoff = 10_000 * Math.pow(2, attempt - 1);
      console.log(`    Retrying in ${backoff / 1000}s...`);
      await sleep(backoff);
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
