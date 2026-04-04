/**
 * PostGen – Grok Imagine Video provider.
 *
 * Generates one AI video clip per scene using xAI's Grok Imagine Video
 * text-to-video model via the REST API. Each clip defaults to 8 seconds
 * (configurable 1–15s). Supports retry with exponential backoff and
 * controlled concurrency.
 *
 * Image-guided modes (mutually exclusive per clip — Grok API constraint):
 *   1. First-frame image: Sets the starting frame for a clip (image → video)
 *      via the `image` field. Takes priority when available for a scene.
 *   2. Reference images: Up to 3 character/subject reference images shared
 *      across clips via the `reference_images` field. Used when no
 *      first-frame is available for a given scene.
 *   3. Text-only: Falls back to pure text-to-video when no images exist.
 *
 * NOTE: The Grok API returns 400 if you send both `image` AND
 * `reference_images` in the same request — only one can be used per clip.
 *
 * API reference: https://docs.x.ai/developers/model-capabilities/video/generation
 *
 * Exports a single function: generateClips()
 */
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const GROK_MODEL = 'grok-imagine-video';
const GROK_API_BASE = 'https://api.x.ai/v1';
const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_MS = 600_000; // 10 minutes per clip
const DEFAULT_CLIP_DURATION = 8;

/**
 * Generate video clips via Grok Imagine Video, one per scene.
 *
 * @param {object} params
 * @param {string} params.postDir        Absolute path to the post directory
 * @param {object} params.videoSpec      Parsed video.json
 * @param {object} params.credentials    { key } — the xAI API key
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

  // Determine image-guided mode
  const { firstFrames = new Map(), characterRefs = [] } = referenceData;
  const hasFirstFrames = firstFrames.size > 0;
  const hasCharRefs = characterRefs.length > 0;

  // Pre-convert character reference images to base64 data URIs (shared across clips)
  const charRefDataUris = hasCharRefs
    ? characterRefs.slice(0, 3).map((ref) => bufferToDataUri(ref.imageBytes, ref.mimeType))
    : [];

  const modeLabel = hasFirstFrames && hasCharRefs
    ? 'image-guided (first-frame preferred, character refs fallback)'
    : hasFirstFrames
      ? 'image-guided (first-frame only)'
      : hasCharRefs
        ? 'image-guided (character references only)'
        : 'text-to-video';

  console.log(`  Provider: Grok Imagine Video (${GROK_MODEL})`);
  console.log(`  Mode: ${modeLabel}`);
  console.log(`  Clip duration: ${DEFAULT_CLIP_DURATION}s per scene`);
  console.log(`  Scenes: ${scenes.length}`);
  if (hasFirstFrames) console.log(`  First-frame images: ${firstFrames.size}`);
  if (hasCharRefs) console.log(`  Character references: ${charRefDataUris.length}`);
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
            duration: DEFAULT_CLIP_DURATION,
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
        apiKey: credentials.key,
        aspectRatio,
        negativePrompt,
        visualStyle,
        maxRetries,
        firstFrameImage: firstFrames.get(scene.scene_number) || null,
        charRefDataUris,
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

// ---------------------------------------------------------------------------
// Single clip generation
// ---------------------------------------------------------------------------

async function generateSingleClip({
  scene, clipIndex, totalClips, outputDir, apiKey,
  aspectRatio, negativePrompt, visualStyle, maxRetries,
  firstFrameImage, charRefDataUris,
}) {
  const clipNum = clipIndex + 1;
  // Build prompt: visual_style prefix + scene prompt + negative prompt suffix
  let prompt = scene.prompt;
  if (visualStyle) prompt = `${visualStyle}. ${prompt}`;
  if (negativePrompt) prompt = `${prompt}. Avoid: ${negativePrompt}`;

  // Determine which image mode to use for this clip.
  // Grok API constraint: cannot send both `image` and `reference_images`
  // in the same request — 400 error. Priority: first-frame > char refs.
  const hasFirstFrame = !!firstFrameImage;
  const hasRefs = charRefDataUris && charRefDataUris.length > 0;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const modeStr = hasFirstFrame
        ? '(first-frame)'
        : hasRefs
          ? `(${charRefDataUris.length} ref images)`
          : '(text-only)';
      console.log(`  [clip ${clipNum}/${totalClips}] Scene ${scene.scene_number} ${modeStr} (attempt ${attempt})...`);
      console.log(`    Prompt: "${scene.prompt.slice(0, 70)}..."`);

      // Build the request body
      const requestBody = {
        model: GROK_MODEL,
        prompt,
        duration: DEFAULT_CLIP_DURATION,
        aspect_ratio: aspectRatio,
        resolution: '720p',
      };

      if (hasFirstFrame) {
        // Image-to-video: first-frame takes priority
        const dataUri = bufferToDataUri(firstFrameImage.imageBytes, firstFrameImage.mimeType);
        requestBody.image = { url: dataUri };
        console.log(`    First-frame: yes (${firstFrameImage.mimeType})`);
      } else if (hasRefs) {
        // Character/subject references (when no first-frame for this scene)
        requestBody.reference_images = charRefDataUris.map((uri) => ({ url: uri }));
        console.log(`    Reference images: ${charRefDataUris.length}`);
      }

      const submitResult = await grokApiPost('/videos/generations', requestBody, apiKey);
      const requestId = submitResult.request_id;

      if (!requestId) {
        throw new Error('Grok API did not return a request_id');
      }

      console.log(`    Request ID: ${requestId} — polling...`);

      // Poll for completion
      const video = await pollForCompletion(requestId, apiKey, clipNum, totalClips);

      // Download the video
      const clipPath = path.join(outputDir, `clip-${clipNum}.mp4`);
      await downloadFile(video.url, clipPath);

      const fileSize = fs.statSync(clipPath).size;
      const duration = video.duration || DEFAULT_CLIP_DURATION;
      console.log(`    Downloaded: clip-${clipNum}.mp4 (${(fileSize / 1024 / 1024).toFixed(1)}MB, ${duration}s)`);

      return {
        clip: clipNum,
        file: `clip-${clipNum}.mp4`,
        duration,
        scenes: [scene.scene_number],
        grokRequestId: requestId,
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

// ---------------------------------------------------------------------------
// Poll until video is ready
// ---------------------------------------------------------------------------

async function pollForCompletion(requestId, apiKey, clipNum, totalClips) {
  const startMs = Date.now();

  while (true) {
    const elapsedS = ((Date.now() - startMs) / 1000).toFixed(0);

    if (Date.now() - startMs > MAX_POLL_MS) {
      throw new Error(`Grok polling timed out after ${MAX_POLL_MS / 1000}s`);
    }

    const status = await grokApiGet(`/videos/${requestId}`, apiKey);

    if (status.status === 'done') {
      if (!status.video?.url) {
        throw new Error('Grok video completed but no video URL in response');
      }
      return {
        url: status.video.url,
        duration: status.video.duration || DEFAULT_CLIP_DURATION,
      };
    }

    if (status.status === 'failed') {
      throw new Error(`Grok video generation failed: ${status.error || 'unknown error'}`);
    }

    if (status.status === 'expired') {
      throw new Error('Grok video generation request expired');
    }

    // Still pending
    process.stdout.write(`    [${elapsedS}s] ${status.status || 'pending'}...      \r`);
    await sleep(POLL_INTERVAL_MS);
  }
}

// ---------------------------------------------------------------------------
// HTTP helpers (xAI REST API)
// ---------------------------------------------------------------------------

function grokApiPost(endpoint, body, apiKey) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${GROK_API_BASE}${endpoint}`);
    const payload = JSON.stringify(body);

    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`Grok API POST ${endpoint} returned ${res.statusCode}: ${data}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Grok API POST ${endpoint}: invalid JSON response`));
          }
        });
      },
    );

    req.on('error', (err) => reject(new Error(`Grok API POST ${endpoint}: ${err.message}`)));
    req.setTimeout(90_000, () => {
      req.destroy();
      reject(new Error(`Grok API POST ${endpoint}: request timed out (90s)`));
    });

    req.write(payload);
    req.end();
  });
}

function grokApiGet(endpoint, apiKey) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${GROK_API_BASE}${endpoint}`);

    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`Grok API GET ${endpoint} returned ${res.statusCode}: ${data}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Grok API GET ${endpoint}: invalid JSON response`));
          }
        });
      },
    );

    req.on('error', (err) => reject(new Error(`Grok API GET ${endpoint}: ${err.message}`)));
    req.setTimeout(30_000, () => {
      req.destroy();
      reject(new Error(`Grok API GET ${endpoint}: request timed out (30s)`));
    });

    req.end();
  });
}

// ---------------------------------------------------------------------------
// File download
// ---------------------------------------------------------------------------

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const req = client.get(url, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        return;
      }

      const ws = fs.createWriteStream(destPath);
      res.pipe(ws);
      ws.on('finish', () => {
        ws.close();
        const size = fs.statSync(destPath).size;
        resolve({ size });
      });
      ws.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(120_000, () => {
      req.destroy();
      reject(new Error('Download timed out (120s)'));
    });
  });
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Convert a Buffer + mimeType to a base64 data URI.
 * Grok API accepts data URIs like `data:image/png;base64,...` for both
 * the `image` field and `reference_images[].url` field.
 */
function bufferToDataUri(buffer, mimeType) {
  const base64 = buffer.toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
