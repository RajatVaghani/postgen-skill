#!/usr/bin/env node
/**
 * PostGen – Validate configuration before running the pipeline.
 *
 * Usage:
 *   node validate-config.mjs <workspace-or-post-dir>
 *
 * Checks:
 *   - postgen.config.json exists and is valid JSON
 *   - Required fields are present and not defaults
 *   - API key is resolvable for the configured provider
 *   - System dependencies (ffmpeg, Playwright) are available
 *   - Workspace directory structure is intact
 *
 * Exit codes:
 *   0 = all checks pass
 *   1 = issues found (printed to stdout)
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { findWorkspaceRoot, loadConfig } from './workspace.mjs';
import { resolveApiKey, resolveVideoKey } from './resolve-key.mjs';

const startDir = path.resolve(process.argv[2] || '.');
const issues = [];
const warnings = [];

function issue(msg) { issues.push(msg); }
function warn(msg) { warnings.push(msg); }

// ---------------------------------------------------------------------------
// 1. Config file
// ---------------------------------------------------------------------------

const wsRoot = findWorkspaceRoot(startDir);
if (!wsRoot) {
  issue('postgen.config.json not found. Run setup first.');
  report();
  process.exit(1);
}

let config;
try {
  config = loadConfig(startDir);
} catch (err) {
  issue(`Failed to parse postgen.config.json: ${err.message}`);
  report();
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. Brand configuration
// ---------------------------------------------------------------------------

if (!config.brand) {
  issue('brand section is missing from config');
} else {
  if (!config.brand.name || config.brand.name === 'My Brand') {
    warn('brand.name is still the default "My Brand" — update it with your brand name');
  }
  if (!config.brand.primary_color) issue('brand.primary_color is missing');
  if (!config.brand.secondary_color) issue('brand.secondary_color is missing');
  if (!config.brand.accent_color) issue('brand.accent_color is missing');
  if (!config.brand.font_family) warn('brand.font_family is not set (will default to system font)');
  if (!config.brand.website) warn('brand.website is not set (CTA slides will have no URL)');
}

// ---------------------------------------------------------------------------
// 3. Image provider & API key
// ---------------------------------------------------------------------------

const provider = config.image_provider;
if (!provider) {
  issue('image_provider is not set');
} else if (!['google-genai', 'openai'].includes(provider)) {
  issue(`image_provider "${provider}" is not valid. Must be "google-genai" or "openai"`);
} else {
  const resolved = resolveApiKey(provider, config);
  if (!resolved) {
    issue(`No API key found for provider "${provider}". Add it via environment variable, openclaw.json, or postgen.config.json`);
  }
}

// ---------------------------------------------------------------------------
// 3b. Video provider credentials
// ---------------------------------------------------------------------------

const geminiVideoCreds = resolveVideoKey('gemini-video', config);
const klingCreds = resolveVideoKey('kling', config);
const configVideoProvider = config.video_provider || '';

if (configVideoProvider === 'gemini' && !geminiVideoCreds) {
  issue('video_provider is "gemini" but no Gemini API key found');
} else if (configVideoProvider === 'kling' && !klingCreds) {
  issue('video_provider is "kling" but no Kling credentials found');
} else if (!geminiVideoCreds && !klingCreds) {
  warn('No video provider credentials found — AI video generation will not work. Add GEMINI_API_KEY or KLING_ACCESS_KEY + KLING_SECRET_KEY');
}

// ---------------------------------------------------------------------------
// 3c. TTS provider credentials
// ---------------------------------------------------------------------------

const openaiTtsCreds = resolveVideoKey('openai-tts', config);
const elevenlabsCreds = resolveVideoKey('elevenlabs', config);
const geminiTtsCreds = resolveVideoKey('gemini-tts', config);

if (!openaiTtsCreds && !elevenlabsCreds && !geminiTtsCreds) {
  warn('No TTS credentials found — voiceover will not work. Add OPENAI_API_KEY, ELEVENLABS_API_KEY, or GEMINI_API_KEY');
}

// ---------------------------------------------------------------------------
// 4. Workspace structure
// ---------------------------------------------------------------------------

const assetsDir = path.join(wsRoot, 'assets');
const outputDir = path.join(wsRoot, 'output');
const nmDir = path.join(wsRoot, 'node_modules');

if (!fs.existsSync(assetsDir)) warn('assets/ directory does not exist');
if (!fs.existsSync(outputDir)) warn('output/ directory does not exist');
if (!fs.existsSync(nmDir)) issue('node_modules/ not found — run setup to install dependencies');

// Check for logo
if (fs.existsSync(assetsDir)) {
  const files = fs.readdirSync(assetsDir);
  const hasLogo = files.some((f) => /logo/i.test(f) && /\.(png|jpg|jpeg|svg|webp)$/i.test(f));
  if (!hasLogo) warn('No logo file found in assets/ — slides will use text-based branding');
}

// ---------------------------------------------------------------------------
// 5. System dependencies
// ---------------------------------------------------------------------------

try {
  execSync('ffmpeg -version', { stdio: 'pipe' });
} catch {
  warn('ffmpeg is not installed — background compression and video generation will not work');
}

if (fs.existsSync(nmDir)) {
  if (!fs.existsSync(path.join(nmDir, 'playwright'))) {
    issue('playwright is not installed in node_modules — rendering will fail');
  }
}

// ---------------------------------------------------------------------------
// 6. Defaults
// ---------------------------------------------------------------------------

if (config.defaults) {
  if (config.defaults.formats) {
    const validFormats = ['instagram', 'tiktok', 'shorts'];
    for (const f of config.defaults.formats) {
      if (!validFormats.includes(f)) warn(`Unknown format "${f}" in defaults.formats`);
    }
  }
  if (config.defaults.template && !['bold', 'minimal'].includes(config.defaults.template)) {
    warn(`Unknown template "${config.defaults.template}" — must be "bold" or "minimal"`);
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function report() {
  console.log('\n=== PostGen Config Validation ===\n');
  console.log(`Workspace: ${wsRoot || 'NOT FOUND'}`);
  console.log(`Image provider: ${config?.image_provider || 'NOT SET'}`);

  const videoProv = [];
  if (geminiVideoCreds) videoProv.push(`gemini (via ${geminiVideoCreds.source})`);
  if (klingCreds) videoProv.push(`kling (via ${klingCreds.source})`);
  console.log(`Video providers: ${videoProv.length > 0 ? videoProv.join(', ') : 'NONE'}`);

  const ttsProv = [];
  if (openaiTtsCreds) ttsProv.push(`openai (via ${openaiTtsCreds.source})`);
  if (elevenlabsCreds) ttsProv.push(`elevenlabs (via ${elevenlabsCreds.source})`);
  if (geminiTtsCreds) ttsProv.push(`gemini (via ${geminiTtsCreds.source})`);
  console.log(`TTS providers: ${ttsProv.length > 0 ? ttsProv.join(', ') : 'NONE'}`);
  console.log();

  if (issues.length === 0 && warnings.length === 0) {
    console.log('All checks passed. Ready to generate!\n');
    return;
  }

  if (issues.length > 0) {
    console.log(`ISSUES (${issues.length}):`);
    for (const i of issues) console.log(`  [FAIL] ${i}`);
    console.log();
  }

  if (warnings.length > 0) {
    console.log(`WARNINGS (${warnings.length}):`);
    for (const w of warnings) console.log(`  [WARN] ${w}`);
    console.log();
  }
}

report();
process.exit(issues.length > 0 ? 1 : 0);
