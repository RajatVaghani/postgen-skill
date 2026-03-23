#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import os from 'os';

// ---------------------------------------------------------------------------
// Key name mappings per provider
// ---------------------------------------------------------------------------

/** Image generation providers – legacy resolution order: openclaw → env → config */
const IMAGE_PROVIDERS = {
  'google-genai': {
    openclawKeys: ['GEMINI_API_KEY', 'GOOGLE_GENAI_API_KEY'],
    envKeys: ['GEMINI_API_KEY', 'GOOGLE_GENAI_API_KEY'],
    configKeys: ['gemini_api_key', 'google_genai_api_key'],
  },
  openai: {
    openclawKeys: ['OPENAI_API_KEY'],
    envKeys: ['OPENAI_API_KEY'],
    configKeys: ['openai_api_key'],
  },
};

/** Video / TTS providers – resolution order: config → env → openclaw */
const VIDEO_PROVIDERS = {
  kling: {
    configKeys: ['kling_access_key', 'kling_secret_key'],
    envKeys: ['KLING_ACCESS_KEY', 'KLING_SECRET_KEY'],
    openclawKeys: ['KLING_ACCESS_KEY', 'KLING_SECRET_KEY'],
    isPair: true, // returns { accessKey, secretKey } instead of { key }
  },
  'openai-tts': {
    configKeys: ['openai_api_key'],
    envKeys: ['OPENAI_API_KEY'],
    openclawKeys: ['OPENAI_API_KEY'],
  },
  elevenlabs: {
    configKeys: ['elevenlabs_api_key'],
    envKeys: ['ELEVENLABS_API_KEY'],
    openclawKeys: ['ELEVENLABS_API_KEY'],
  },
};

// ---------------------------------------------------------------------------
// OpenClaw config reader
// ---------------------------------------------------------------------------

function findOpenClawHome() {
  if (process.env.OPENCLAW_HOME) return process.env.OPENCLAW_HOME;
  const defaultPath = path.join(os.homedir(), '.openclaw');
  if (fs.existsSync(defaultPath)) return defaultPath;
  return null;
}

function readOpenClawEnv(openclawHome) {
  if (!openclawHome) return {};
  const configPath = path.join(openclawHome, 'openclaw.json');
  if (!fs.existsSync(configPath)) return {};
  try {
    const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return data.env || {};
  } catch {
    return {};
  }
}

// Cached so we only read the file once per process
let _openclawEnv = null;
function getOpenClawEnv() {
  if (_openclawEnv === null) {
    _openclawEnv = readOpenClawEnv(findOpenClawHome());
  }
  return _openclawEnv;
}

// ---------------------------------------------------------------------------
// Image provider key resolution (legacy order: openclaw → env → config)
// ---------------------------------------------------------------------------

export function resolveApiKey(provider, postgenConfig) {
  const def = IMAGE_PROVIDERS[provider];
  if (!def) throw new Error(`Unknown image provider: ${provider}`);

  const openclawEnv = getOpenClawEnv();

  // Tier 1: OpenClaw config
  for (const name of def.openclawKeys) {
    if (openclawEnv[name]) return { key: openclawEnv[name], source: `openclaw.json (${name})` };
  }

  // Tier 2: Environment variables
  for (const name of def.envKeys) {
    if (process.env[name]) return { key: process.env[name], source: `env var (${name})` };
  }

  // Tier 3: postgen.config.json
  if (postgenConfig) {
    for (const k of def.configKeys) {
      if (postgenConfig[k]) return { key: postgenConfig[k], source: `postgen.config.json (${k})` };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Video / TTS provider key resolution (order: config → env → openclaw)
// ---------------------------------------------------------------------------

export function resolveVideoKey(provider, postgenConfig) {
  const def = VIDEO_PROVIDERS[provider];
  if (!def) throw new Error(`Unknown video/TTS provider: ${provider}`);

  const openclawEnv = getOpenClawEnv();

  // For key pairs (Kling: access_key + secret_key)
  if (def.isPair) {
    return resolveKeyPair(def, postgenConfig, openclawEnv);
  }

  // Single key resolution: config → env → openclaw
  // Tier 1: postgen.config.json
  if (postgenConfig) {
    for (const k of def.configKeys) {
      if (postgenConfig[k]) return { key: postgenConfig[k], source: `postgen.config.json (${k})` };
    }
  }

  // Tier 2: Environment variables
  for (const name of def.envKeys) {
    if (process.env[name]) return { key: process.env[name], source: `env var (${name})` };
  }

  // Tier 3: OpenClaw config
  for (const name of def.openclawKeys) {
    if (openclawEnv[name]) return { key: openclawEnv[name], source: `openclaw.json (${name})` };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Key-pair resolution (Kling needs both access_key AND secret_key)
// ---------------------------------------------------------------------------

function resolveKeyPair(def, postgenConfig, openclawEnv) {
  const [akConfig, skConfig] = def.configKeys;   // e.g. kling_access_key, kling_secret_key
  const [akEnv, skEnv] = def.envKeys;             // e.g. KLING_ACCESS_KEY, KLING_SECRET_KEY
  const [akOc, skOc] = def.openclawKeys;           // same env names in openclaw

  // Tier 1: postgen.config.json
  if (postgenConfig && postgenConfig[akConfig] && postgenConfig[skConfig]) {
    return {
      accessKey: postgenConfig[akConfig],
      secretKey: postgenConfig[skConfig],
      source: `postgen.config.json (${akConfig} + ${skConfig})`,
    };
  }

  // Tier 2: Environment variables
  if (process.env[akEnv] && process.env[skEnv]) {
    return {
      accessKey: process.env[akEnv],
      secretKey: process.env[skEnv],
      source: `env var (${akEnv} + ${skEnv})`,
    };
  }

  // Tier 3: OpenClaw config
  if (openclawEnv[akOc] && openclawEnv[skOc]) {
    return {
      accessKey: openclawEnv[akOc],
      secretKey: openclawEnv[skOc],
      source: `openclaw.json (${akOc} + ${skOc})`,
    };
  }

  return null;
}
