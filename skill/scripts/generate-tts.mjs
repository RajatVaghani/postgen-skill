#!/usr/bin/env node
/**
 * PostGen – Generate voiceover audio from slide/scene text.
 *
 * Usage:
 *   node generate-tts.mjs <post-dir> [--provider openai|elevenlabs|gemini]
 *                                     [--voice <voice-id>]
 *                                     [--language en|zh|...]
 *                                     [--speed 1.0]
 *
 * Two flows:
 *   - Video flow (video.json exists): reads scenes → voiceover_text,
 *     outputs scene-N.mp3 files, manifest at voiceover/manifest.json
 *   - Carousel flow (slides.json): reads slides → narration text,
 *     outputs slide-N.mp3 files, manifest at voiceover/manifest.json
 *
 * Supports three TTS providers:
 *   - openai     — OpenAI TTS (gpt-4o-mini-tts) — default
 *   - elevenlabs — ElevenLabs TTS (premium voice quality)
 *   - gemini     — Gemini Live API (gemini-3.1-flash-live-preview, high-quality voices)
 */
import fs from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { findWorkspaceRoot, loadConfig, workspaceRequire } from './workspace.mjs';
import { loadAndNormalizeSlides } from './normalize-slides.mjs';
import { resolveVideoKey } from './resolve-key.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let postDir = '.';
let provider = '';  // auto-detect from config
let voiceId = '';
let language = 'en';
let speed = 1.0;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--provider' && args[i + 1]) provider = args[++i];
  else if (args[i] === '--voice' && args[i + 1]) voiceId = args[++i];
  else if (args[i] === '--language' && args[i + 1]) language = args[++i];
  else if (args[i] === '--speed' && args[i + 1]) speed = parseFloat(args[++i]);
  else if (!args[i].startsWith('--')) postDir = args[i];
}

postDir = path.resolve(postDir);
const wsRoot = findWorkspaceRoot(postDir);
if (!wsRoot) {
  console.error('FATAL: postgen.config.json not found – run setup first.');
  process.exit(1);
}

const config = loadConfig(postDir);
const NODE_PATH = path.join(wsRoot, 'node_modules');

// ---------------------------------------------------------------------------
// Provider detection
// ---------------------------------------------------------------------------

function detectProvider() {
  if (provider) return provider;

  // Check config for tts_provider preference
  if (config.tts_provider) return config.tts_provider;

  // Try each provider in order: openai → elevenlabs → gemini
  if (resolveVideoKey('openai-tts', config)) return 'openai';
  if (resolveVideoKey('elevenlabs', config)) return 'elevenlabs';
  if (resolveVideoKey('gemini-tts', config)) return 'gemini';

  console.error('FATAL: No TTS provider credentials found.');
  console.error('  Configure one of: openai_api_key, elevenlabs_api_key, or gemini_api_key');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Default voices per provider
// ---------------------------------------------------------------------------

const DEFAULT_VOICES = {
  openai: 'nova',                    // OpenAI natural female voice
  elevenlabs: 'EXAVITQu4vr4xnSDxMaL', // ElevenLabs "Bella" voice
  gemini: 'Zephyr',                  // Gemini Live "Zephyr" voice
};

// ---------------------------------------------------------------------------
// Narration text extraction from slides
// ---------------------------------------------------------------------------

function extractNarration(slides) {
  return slides.map((slide) => {
    // Use voiceover_text if agent provided it explicitly
    if (slide.voiceover_text) return slide.voiceover_text;

    // Otherwise build narration from title + body
    const parts = [];
    if (slide.title) parts.push(slide.title);
    if (slide.body) parts.push(slide.body);
    return parts.join('. ').replace(/\.+/g, '.').trim();
  });
}

// ---------------------------------------------------------------------------
// OpenAI TTS
// ---------------------------------------------------------------------------

async function generateOpenAITTS(texts, outputDir, prefix) {
  const creds = resolveVideoKey('openai-tts', config);
  if (!creds) throw new Error('OpenAI API key not found');

  const voice = voiceId || DEFAULT_VOICES.openai;
  const results = [];

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    if (!text) {
      results.push(null);
      continue;
    }

    console.log(`  [${i + 1}/${texts.length}] Generating TTS for ${prefix} ${i + 1} (${text.length} chars)...`);

    const body = JSON.stringify({
      model: 'gpt-4o-mini-tts',
      input: text,
      voice,
      speed,
      response_format: 'mp3',
    });

    const audioBuffer = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.openai.com',
        path: '/v1/audio/speech',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${creds.key}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        if (res.statusCode !== 200) {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            reject(new Error(`OpenAI TTS failed (${res.statusCode}): ${Buffer.concat(chunks).toString()}`));
          });
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      });
      req.on('error', reject);
      req.setTimeout(60_000, () => req.destroy(new Error('OpenAI TTS timeout (60s)')));
      req.write(body);
      req.end();
    });

    const fileName = `${prefix}-${i + 1}.mp3`;
    const outPath = path.join(outputDir, fileName);
    fs.writeFileSync(outPath, audioBuffer);

    // Estimate duration from file size (MP3 ~16kB/s at 128kbps)
    const estimatedDuration = (audioBuffer.length / 16_000).toFixed(1);
    console.log(`    Saved: ${outPath} (~${estimatedDuration}s)`);

    results.push({
      segment: i + 1,
      file: fileName,
      duration: parseFloat(estimatedDuration),
      provider: 'openai',
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// ElevenLabs TTS
// ---------------------------------------------------------------------------

async function generateElevenLabsTTS(texts, outputDir, prefix) {
  const creds = resolveVideoKey('elevenlabs', config);
  if (!creds) throw new Error('ElevenLabs API key not found');

  const voice = voiceId || DEFAULT_VOICES.elevenlabs;
  const results = [];

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    if (!text) {
      results.push(null);
      continue;
    }

    console.log(`  [${i + 1}/${texts.length}] Generating TTS for ${prefix} ${i + 1} (${text.length} chars)...`);

    const body = JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        speed: speed,
      },
    });

    const audioBuffer = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.elevenlabs.io',
        path: `/v1/text-to-speech/${voice}`,
        method: 'POST',
        headers: {
          'xi-api-key': creds.key,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        if (res.statusCode !== 200) {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            reject(new Error(`ElevenLabs TTS failed (${res.statusCode}): ${Buffer.concat(chunks).toString()}`));
          });
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      });
      req.on('error', reject);
      req.setTimeout(60_000, () => req.destroy(new Error('ElevenLabs TTS timeout (60s)')));
      req.write(body);
      req.end();
    });

    const fileName = `${prefix}-${i + 1}.mp3`;
    const outPath = path.join(outputDir, fileName);
    fs.writeFileSync(outPath, audioBuffer);

    const estimatedDuration = (audioBuffer.length / 16_000).toFixed(1);
    console.log(`    Saved: ${outPath} (~${estimatedDuration}s)`);

    results.push({
      segment: i + 1,
      file: fileName,
      duration: parseFloat(estimatedDuration),
      provider: 'elevenlabs',
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Gemini Live API TTS (gemini-3.1-flash-live-preview)
// ---------------------------------------------------------------------------

const GEMINI_LIVE_MODEL = 'gemini-3.1-flash-live-preview';
const GEMINI_PCM_SAMPLE_RATE = 24000;

async function generateGeminiTTS(texts, outputDir, prefix) {
  const creds = resolveVideoKey('gemini-tts', config);
  if (!creds) throw new Error('Gemini API key not found');

  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
  } catch {
    throw new Error('ffmpeg is required for Gemini TTS (converts PCM audio to MP3)');
  }

  const wsRequire = workspaceRequire(postDir);
  const { GoogleGenAI, Modality } = wsRequire('@google/genai');

  const ai = new GoogleGenAI({ apiKey: creds.key });
  const voice = voiceId || DEFAULT_VOICES.gemini;
  const results = [];

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    if (!text) {
      results.push(null);
      continue;
    }

    console.log(`  [${i + 1}/${texts.length}] Generating TTS for ${prefix} ${i + 1} (${text.length} chars)...`);

    const pcmBuffer = await geminiLiveTTS(ai, text, voice);

    const pcmPath = path.join(outputDir, `_${prefix}-${i + 1}.pcm`);
    const mp3Path = path.join(outputDir, `${prefix}-${i + 1}.mp3`);
    fs.writeFileSync(pcmPath, pcmBuffer);

    try {
      execSync(
        `ffmpeg -y -f s16le -ar ${GEMINI_PCM_SAMPLE_RATE} -ac 1 -i "${pcmPath}" -b:a 128k "${mp3Path}"`,
        { stdio: 'pipe' },
      );
    } finally {
      try { fs.unlinkSync(pcmPath); } catch {}
    }

    const mp3Size = fs.statSync(mp3Path).size;
    const estimatedDuration = (mp3Size / 16_000).toFixed(1);
    console.log(`    Saved: ${mp3Path} (~${estimatedDuration}s)`);

    results.push({
      segment: i + 1,
      file: `${prefix}-${i + 1}.mp3`,
      duration: parseFloat(estimatedDuration),
      provider: 'gemini',
    });
  }

  return results;
}

async function geminiLiveTTS(ai, text, voice) {
  const pcmChunks = [];
  let resolveDone, rejectDone;
  const donePromise = new Promise((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  const session = await ai.live.connect({
    model: GEMINI_LIVE_MODEL,
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction:
        'You are a professional voiceover narrator. Read the user\'s text aloud exactly as written, word for word. ' +
        'Use a natural, engaging narration tone appropriate for social media video content. ' +
        'Do not add any commentary, greetings, or extra words.',
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice },
        },
      },
    },
    callbacks: {
      onmessage(message) {
        const content = message.serverContent;
        if (content?.modelTurn?.parts) {
          for (const part of content.modelTurn.parts) {
            if (part.inlineData) {
              pcmChunks.push(Buffer.from(part.inlineData.data, 'base64'));
            }
          }
        }
        if (content?.turnComplete) {
          resolveDone();
        }
      },
      onerror(e) {
        rejectDone(new Error(`Gemini Live API error: ${e.message}`));
      },
      onclose(e) {
        if (pcmChunks.length === 0) {
          rejectDone(new Error(`Gemini Live session closed before audio received: ${e?.reason || 'unknown'}`));
        }
      },
    },
  });

  session.sendRealtimeInput({ text });

  const timeout = setTimeout(() => {
    try { session.close(); } catch {}
    rejectDone(new Error('Gemini TTS timeout (90s)'));
  }, 90_000);

  try {
    await donePromise;
  } finally {
    clearTimeout(timeout);
    try { session.close(); } catch {}
  }

  if (pcmChunks.length === 0) {
    throw new Error('Gemini Live API returned no audio data');
  }

  return Buffer.concat(pcmChunks);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const activeProvider = detectProvider();
const voice = voiceId || DEFAULT_VOICES[activeProvider] || '';

console.log(`\nPostGen TTS — Generating voiceover`);
console.log(`  Provider: ${activeProvider}`);
console.log(`  Voice: ${voice}`);
console.log(`  Language: ${language}`);
console.log(`  Speed: ${speed}`);

// Load narration source: prefer video.json (video flow), fall back to slides.json
const videoJsonPath = path.join(postDir, 'video.json');
let narrations;
let sourceLabel;
let isVideoFlow = false;

if (fs.existsSync(videoJsonPath)) {
  // Video flow: extract voiceover_text from scenes
  isVideoFlow = true;
  const videoSpec = JSON.parse(fs.readFileSync(videoJsonPath, 'utf-8'));
  const scenes = videoSpec.scenes || [];
  narrations = scenes.map((s) => s.voiceover_text || s.prompt || '');
  sourceLabel = `video.json (${scenes.length} scenes)`;
} else {
  // Carousel→video flow: extract from slides
  const { slides } = loadAndNormalizeSlides(postDir);
  narrations = extractNarration(slides);
  sourceLabel = `slides.json (${slides.length} slides)`;
}

// File naming: "scene-N" for video flow, "slide-N" for carousel flow
const segmentPrefix = isVideoFlow ? 'scene' : 'slide';

console.log(`  Source: ${sourceLabel}`);
console.log(`  Total text: ${narrations.reduce((sum, t) => sum + t.length, 0)} chars`);

// Word count check: advisory warnings for pacing (voiceover is always fully preserved, never cut off)
if (isVideoFlow) {
  const WORDS_PER_SEC = 3;

  // Determine clip duration from ai-video manifest or video.json provider
  let clipDuration = 5; // fallback
  const aiManifestPath = path.join(postDir, 'ai-video', 'manifest.json');
  if (fs.existsSync(aiManifestPath)) {
    const aiManifest = JSON.parse(fs.readFileSync(aiManifestPath, 'utf-8'));
    if (aiManifest.provider === 'gemini') clipDuration = 8;
    else if (aiManifest.provider === 'kling') clipDuration = 10;
  } else {
    // Estimate from video.json provider hint
    const vp = videoSpec?.video_provider || '';
    if (vp === 'gemini') clipDuration = 8;
    else if (vp === 'kling') clipDuration = 10;
  }

  const idealWordsPerScene = Math.round(clipDuration * WORDS_PER_SEC);
  let totalWords = 0;
  narrations.forEach((text, i) => {
    if (!text) return;
    const words = text.split(/\s+/).filter(Boolean).length;
    totalWords += words;
    if (words > idealWordsPerScene * 1.3) {
      console.warn(`  ⚠ Scene ${i + 1}: ${words} words (ideal ~${idealWordsPerScene} for ${clipDuration}s clip). May sound fast.`);
    } else if (words < idealWordsPerScene * 0.5) {
      console.warn(`  ⚠ Scene ${i + 1}: ${words} words (ideal ~${idealWordsPerScene} for ${clipDuration}s clip). May sound slow/draggy.`);
    }
  });
  const targetDuration = narrations.length * clipDuration;
  const estimatedSpeechDuration = totalWords / WORDS_PER_SEC;
  console.log(`  Clip duration: ${clipDuration}s | Ideal: ~${idealWordsPerScene} words/scene, ~${narrations.length * idealWordsPerScene} total`);
  console.log(`  Word count: ${totalWords} words across ${narrations.filter(Boolean).length} scenes (~${estimatedSpeechDuration.toFixed(0)}s of speech for ${targetDuration}s of video)`);
  if (estimatedSpeechDuration > targetDuration * 1.15) {
    console.warn(`  ⚠ Voiceover may sound rushed — aim for ~${targetDuration * WORDS_PER_SEC} words total.`);
  } else if (estimatedSpeechDuration < targetDuration * 0.7) {
    console.warn(`  ⚠ Voiceover may sound slow/draggy — only ${totalWords} words for ${targetDuration}s of video. Aim for ~${targetDuration * WORDS_PER_SEC} words total.`);
  }
}
console.log();

// Create output directory
const voiceoverDir = path.join(postDir, 'voiceover');
if (!fs.existsSync(voiceoverDir)) fs.mkdirSync(voiceoverDir, { recursive: true });

// Generate
let results;
const startTime = Date.now();

try {
  if (activeProvider === 'openai') {
    results = await generateOpenAITTS(narrations, voiceoverDir, segmentPrefix);
  } else if (activeProvider === 'elevenlabs') {
    results = await generateElevenLabsTTS(narrations, voiceoverDir, segmentPrefix);
  } else if (activeProvider === 'gemini') {
    results = await generateGeminiTTS(narrations, voiceoverDir, segmentPrefix);
  } else {
    console.error(`Unknown TTS provider: ${activeProvider}. Supported: openai, elevenlabs, gemini`);
    process.exit(1);
  }
} catch (err) {
  console.error(`\nTTS generation failed: ${err.message}`);
  process.exit(1);
}

// Write manifest — always at voiceover/manifest.json
const filteredResults = results.filter(Boolean);
const manifest = {
  provider: activeProvider,
  voice,
  language,
  speed,
  generated_at: new Date().toISOString(),
  segments: filteredResults,
  total_duration: filteredResults.reduce((sum, r) => sum + r.duration, 0),
};

const manifestPath = path.join(voiceoverDir, 'manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\nTTS complete in ${elapsed}s`);
console.log(`  Audio files: ${voiceoverDir}/`);
console.log(`  Manifest: ${manifestPath}`);
console.log(`  Total duration: ~${manifest.total_duration.toFixed(1)}s`);
