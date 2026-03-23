#!/usr/bin/env node
/**
 * Kling AI API client for PostGen.
 *
 * Handles:
 *   - JWT token generation (HS256, AccessKey + SecretKey)
 *   - Text-to-video task creation + polling (single + multi-shot)
 *   - Image-to-video task creation + polling
 *   - TTS task creation + polling
 *   - File download helper
 *
 * All methods are async. No external dependencies beyond Node built-ins.
 */
import crypto from 'crypto';
import fs from 'fs';
import https from 'https';
import path from 'path';

const API_BASE = 'https://api-singapore.klingai.com';
const TOKEN_LIFETIME_S = 1800; // 30 minutes

// ---------------------------------------------------------------------------
// JWT generation (HS256, per Kling docs)
// ---------------------------------------------------------------------------

function base64url(buf) {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function generateJWT(accessKey, secretKey) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: accessKey,
    exp: now + TOKEN_LIFETIME_S,
    nbf: now - 5,
    iat: now,
  };

  const segments = [
    base64url(Buffer.from(JSON.stringify(header))),
    base64url(Buffer.from(JSON.stringify(payload))),
  ];

  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(segments.join('.'))
    .digest();

  segments.push(base64url(signature));
  return segments.join('.');
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function request(method, urlPath, token, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, API_BASE);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try {
          const json = JSON.parse(raw);
          resolve({ status: res.statusCode, data: json });
        } catch {
          resolve({ status: res.statusCode, data: raw });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(90_000, () => {
      req.destroy(new Error('Request timed out (90s)'));
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Polling helper
// ---------------------------------------------------------------------------

/**
 * Poll a Kling task until it reaches a terminal state.
 * @param {string} endpoint  e.g. '/v1/videos/image2video/{id}'
 * @param {string} token     JWT bearer token
 * @param {object} opts      { intervalMs, maxWaitMs, onProgress }
 * @returns {object}         Final task response data
 */
export async function pollTask(endpoint, token, opts = {}) {
  const {
    intervalMs = 5_000,
    maxWaitMs = 600_000, // 10 minutes default
    onProgress = null,
  } = opts;

  const start = Date.now();
  let attempt = 0;

  while (Date.now() - start < maxWaitMs) {
    attempt++;
    const { status, data } = await request('GET', endpoint, token);

    if (status === 429) {
      // Rate limited — back off
      const wait = Math.min(intervalMs * 2, 30_000);
      if (onProgress) onProgress({ type: 'rate_limited', attempt, waitMs: wait });
      await sleep(wait);
      continue;
    }

    if (status !== 200 || data.code !== 0) {
      throw new Error(`Poll error (HTTP ${status}): ${JSON.stringify(data)}`);
    }

    const taskStatus = data.data?.task_status;
    const elapsed = ((Date.now() - start) / 1000).toFixed(0);

    if (onProgress) {
      onProgress({ type: 'poll', attempt, taskStatus, elapsedS: elapsed });
    }

    if (taskStatus === 'succeed') return data.data;
    if (taskStatus === 'failed') {
      const msg = data.data?.task_status_msg || 'Unknown failure';
      throw new Error(`Task failed: ${msg}`);
    }

    // Still processing — wait and retry
    await sleep(intervalMs);
  }

  throw new Error(`Task timed out after ${maxWaitMs / 1000}s`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Text-to-Video
// ---------------------------------------------------------------------------

/**
 * Submit a text-to-video generation task.
 *
 * Two modes:
 *   1. Single prompt — one scene, one clip
 *   2. Multi-shot    — up to 6 storyboard scenes in one cohesive video
 *
 * @param {object} params
 * @param {string} params.accessKey        Kling access key
 * @param {string} params.secretKey        Kling secret key
 * @param {string} [params.prompt]         Text prompt (required unless multi-shot)
 * @param {Array}  [params.scenes]         Multi-shot scenes: [{ prompt, duration }]
 * @param {string} [params.shotType]       'customize' | 'intelligence' (default: customize)
 * @param {string} [params.modelName]      Model (default: kling-v3)
 * @param {string} [params.mode]           'std' | 'pro' (default: std)
 * @param {string} [params.duration]       '5' | '10' (default: 5, for single-prompt mode)
 * @param {string} [params.aspectRatio]    '16:9' | '9:16' | '1:1' (default: 9:16)
 * @param {string} [params.negativePrompt] Things to avoid
 * @param {object} [params.cameraControl]  Camera movement config
 * @returns {object} { taskId, token } — use token for polling
 */
export async function createTextToVideo({
  accessKey,
  secretKey,
  prompt = '',
  scenes = null,
  shotType = 'customize',
  modelName = 'kling-v3',
  mode = 'std',
  duration = '5',
  aspectRatio = '9:16',
  negativePrompt = '',
  cameraControl = null,
}) {
  const token = generateJWT(accessKey, secretKey);

  const body = {
    model_name: modelName,
    mode,
    aspect_ratio: aspectRatio,
  };

  // Multi-shot: array of scenes with per-scene prompts + durations
  if (scenes && scenes.length > 0) {
    body.multi_shot = true;
    body.shot_type = shotType;
    body.multi_prompt = scenes.map((s, i) => ({
      index: i + 1,
      prompt: s.prompt,
      duration: String(s.duration),
    }));
    // Total duration = sum of scene durations
    body.duration = String(scenes.reduce((sum, s) => sum + Number(s.duration), 0));
  } else {
    // Single prompt mode
    body.prompt = prompt;
    body.duration = String(duration);
  }

  if (negativePrompt) body.negative_prompt = negativePrompt;
  if (cameraControl) body.camera_control = cameraControl;

  const { status, data } = await request('POST', '/v1/videos/text2video', token, body);

  if (status !== 200 || data.code !== 0) {
    throw new Error(`Text-to-video creation failed (HTTP ${status}): ${JSON.stringify(data)}`);
  }

  return {
    taskId: data.data.task_id,
    taskStatus: data.data.task_status,
    token,
  };
}

/**
 * Wait for a text-to-video task to complete and return the video URL.
 */
export async function waitForTextToVideo(taskId, token, opts = {}) {
  const result = await pollTask(`/v1/videos/text2video/${taskId}`, token, opts);
  const video = result.task_result?.videos?.[0];
  if (!video?.url) {
    throw new Error('Task succeeded but no video URL in result');
  }
  return {
    url: video.url,
    duration: video.duration,
    id: video.id,
  };
}

// ---------------------------------------------------------------------------
// Image-to-Video
// ---------------------------------------------------------------------------

/**
 * Submit an image-to-video generation task.
 * @param {object} params
 * @param {string} params.accessKey   Kling access key
 * @param {string} params.secretKey   Kling secret key
 * @param {string} params.image       Image URL or base64 (no data: prefix)
 * @param {string} [params.prompt]    Motion prompt
 * @param {string} [params.modelName] Model (default: kling-v3)
 * @param {string} [params.mode]      'std' | 'pro' (default: std)
 * @param {string} [params.duration]  '5' | '10' (default: 5)
 * @param {object} [params.cameraControl] Camera movement config
 * @returns {object} { taskId, token } — use token for polling
 */
export async function createImageToVideo({
  accessKey,
  secretKey,
  image,
  prompt = '',
  modelName = 'kling-v3',
  mode = 'std',
  duration = '5',
  cameraControl = null,
  negativePrompt = '',
  cfgScale = 0.5,
}) {
  const token = generateJWT(accessKey, secretKey);

  const body = {
    model_name: modelName,
    image,
    prompt,
    mode,
    duration: String(duration),
  };

  if (negativePrompt) body.negative_prompt = negativePrompt;
  if (cameraControl) body.camera_control = cameraControl;
  const { status, data } = await request('POST', '/v1/videos/image2video', token, body);

  if (status !== 200 || data.code !== 0) {
    throw new Error(`Image-to-video creation failed (HTTP ${status}): ${JSON.stringify(data)}`);
  }

  return {
    taskId: data.data.task_id,
    taskStatus: data.data.task_status,
    token,
  };
}

/**
 * Wait for an image-to-video task to complete and return the video URL.
 */
export async function waitForVideo(taskId, token, opts = {}) {
  const result = await pollTask(`/v1/videos/image2video/${taskId}`, token, opts);
  const video = result.task_result?.videos?.[0];
  if (!video?.url) {
    throw new Error('Task succeeded but no video URL in result');
  }
  return {
    url: video.url,
    duration: video.duration,
    id: video.id,
  };
}

// ---------------------------------------------------------------------------
// TTS (Text-to-Speech)
// ---------------------------------------------------------------------------

/**
 * Submit a Kling TTS task.
 * @param {object} params
 * @param {string} params.accessKey
 * @param {string} params.secretKey
 * @param {string} params.text        Text to synthesize (max 1000 chars)
 * @param {string} params.voiceId     Voice ID (see Kling voice guide)
 * @param {string} [params.voiceLanguage]  'en' | 'zh' | etc (default: en)
 * @param {number} [params.voiceSpeed]     0.8-2.0 (default: 1.0)
 * @returns {object} { taskId, token }
 */
export async function createTTS({
  accessKey,
  secretKey,
  text,
  voiceId,
  voiceLanguage = 'en',
  voiceSpeed = 1.0,
}) {
  const token = generateJWT(accessKey, secretKey);

  // Kling TTS has a 1000-char limit per request
  if (text.length > 1000) {
    throw new Error(`TTS text exceeds 1000-char limit (got ${text.length})`);
  }

  const body = {
    text,
    voice_id: voiceId,
    voice_language: voiceLanguage,
    voice_speed: voiceSpeed,
  };

  const { status, data } = await request('POST', '/v1/audio/tts', token, body);

  if (status !== 200 || data.code !== 0) {
    throw new Error(`TTS creation failed (HTTP ${status}): ${JSON.stringify(data)}`);
  }

  return {
    taskId: data.data.task_id,
    taskStatus: data.data.task_status,
    token,
  };
}

/**
 * Wait for a TTS task to complete and return the audio URL.
 */
export async function waitForTTS(taskId, token, opts = {}) {
  const result = await pollTask(`/v1/audio/tts/${taskId}`, token, {
    intervalMs: 3_000,
    maxWaitMs: 120_000,
    ...opts,
  });
  const audio = result.task_result?.audios?.[0];
  if (!audio?.url) {
    throw new Error('TTS task succeeded but no audio URL in result');
  }
  return {
    url: audio.url,
    duration: audio.duration,
    id: audio.id,
  };
}

// ---------------------------------------------------------------------------
// File download helper
// ---------------------------------------------------------------------------

/**
 * Download a file from a URL to a local path.
 * Follows redirects (up to 5 hops). Works with both http and https.
 */
export function downloadFile(url, destPath, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const get = (currentUrl, redirectsLeft) => {
      https.get(currentUrl, (res) => {
        // Handle redirects
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));
          return get(res.headers.location, redirectsLeft - 1);
        }

        if (res.statusCode !== 200) {
          return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        }

        const file = fs.createWriteStream(destPath);
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve({ path: destPath, size: fs.statSync(destPath).size });
        });
        file.on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
      }).on('error', reject);
    };

    get(url, maxRedirects);
  });
}
