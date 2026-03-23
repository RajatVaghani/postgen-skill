#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import os from 'os';

const OPENCLAW_KEY_NAMES = {
  'google-genai': ['GEMINI_API_KEY', 'GOOGLE_GENAI_API_KEY'],
  openai: ['OPENAI_API_KEY'],
};

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

export function resolveApiKey(provider, postgenConfig) {
  const keyNames = OPENCLAW_KEY_NAMES[provider];
  if (!keyNames) throw new Error(`Unknown provider: ${provider}`);

  // Tier 1: OpenClaw config
  const openclawHome = findOpenClawHome();
  const openclawEnv = readOpenClawEnv(openclawHome);
  for (const name of keyNames) {
    if (openclawEnv[name]) return { key: openclawEnv[name], source: `openclaw.json (${name})` };
  }

  // Tier 2: Environment variables
  for (const name of keyNames) {
    if (process.env[name]) return { key: process.env[name], source: `env var (${name})` };
  }

  // Tier 3: postgen.config.json
  if (postgenConfig) {
    const cfgKeys =
      provider === 'google-genai'
        ? ['gemini_api_key', 'google_genai_api_key']
        : ['openai_api_key'];
    for (const k of cfgKeys) {
      if (postgenConfig[k]) return { key: postgenConfig[k], source: `postgen.config.json (${k})` };
    }
  }

  return null;
}
