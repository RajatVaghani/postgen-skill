#!/usr/bin/env node
/**
 * PostGen Skill – Onboarding / Setup
 *
 * Usage:
 *   node setup.mjs <workspace-path> [--provider google-genai|openai]
 *
 * Creates the workspace directory structure, writes a default
 * postgen.config.json, installs Node dependencies (pinned versions),
 * installs Playwright Chromium, and verifies/installs ffmpeg.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { resolveApiKey } from './resolve-key.mjs';

const args = process.argv.slice(2);
let workspacePath = null;
let provider = 'google-genai';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--provider' && args[i + 1]) {
    provider = args[++i];
  } else if (!args[i].startsWith('--')) {
    workspacePath = args[i];
  }
}

if (!workspacePath) {
  console.error('Usage: node setup.mjs <workspace-path> [--provider google-genai|openai]');
  process.exit(1);
}

if (!['google-genai', 'openai'].includes(provider)) {
  console.error('Provider must be "google-genai" or "openai"');
  process.exit(1);
}

workspacePath = path.resolve(workspacePath);
const platform = os.platform(); // 'linux', 'darwin', 'win32'

// 1. Create directory structure
console.log(`\n[1/6] Creating workspace at ${workspacePath}`);
for (const dir of ['assets', 'output']) {
  const dirPath = path.join(workspacePath, dir);
  fs.mkdirSync(dirPath, { recursive: true });
  console.log(`  + ${dir}/`);
}

// 2. Resolve API key
console.log(`\n[2/6] Checking API key for provider: ${provider}`);
const resolved = resolveApiKey(provider, null);
if (resolved) {
  console.log(`  Found key via ${resolved.source}`);
} else {
  console.warn(
    `  WARNING: No API key found for ${provider}.\n` +
      `  Add it to ~/.openclaw/openclaw.json env, set it as an environment variable,\n` +
      `  or add it to postgen.config.json later.`
  );
}

// 3. Write config (preserve existing if present)
console.log('\n[3/6] Writing postgen.config.json');
const configPath = path.join(workspacePath, 'postgen.config.json');

const defaultConfig = {
  workspace_path: workspacePath,
  image_provider: provider,
  brand: {
    name: 'My Brand',
    primary_color: '#1e1b4b',
    secondary_color: '#312e81',
    accent_color: '#7c3aed',
    font_family: 'Inter',
    tagline: '',
    website: '',
  },
  cta_links: [],
  defaults: {
    slide_count: 7,
    formats: ['instagram', 'tiktok'],
    template: 'bold',
  },
};

let config;
if (fs.existsSync(configPath)) {
  // Merge: keep existing user values, only fill in missing fields from defaults
  console.log('  Existing config found — preserving your brand details');
  try {
    const existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config = {
      ...defaultConfig,
      ...existing,
      // Always update workspace_path and provider to match current args
      workspace_path: workspacePath,
      image_provider: provider,
      // Deep-merge brand: keep user values, fill gaps with defaults
      brand: { ...defaultConfig.brand, ...(existing.brand || {}) },
      // Deep-merge defaults: keep user values, fill gaps with defaults
      defaults: { ...defaultConfig.defaults, ...(existing.defaults || {}) },
      // Keep existing cta_links if present, otherwise use default
      cta_links: existing.cta_links?.length > 0 ? existing.cta_links : defaultConfig.cta_links,
    };
    // Preserve any API keys already in config
    if (existing.gemini_api_key) config.gemini_api_key = existing.gemini_api_key;
    if (existing.openai_api_key) config.openai_api_key = existing.openai_api_key;
  } catch {
    console.warn('  Existing config is corrupted — writing fresh defaults');
    config = defaultConfig;
  }
} else {
  config = defaultConfig;
}

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log(`  Written to ${configPath}`);

// Write .gitignore to prevent committing API keys or large files
const gitignorePath = path.join(workspacePath, '.gitignore');
if (!fs.existsSync(gitignorePath)) {
  fs.writeFileSync(
    gitignorePath,
    [
      'node_modules/',
      'output/',
      '# postgen.config.json may contain API keys — be careful',
      '# postgen.config.json',
      '',
    ].join('\n')
  );
  console.log('  Written .gitignore');
}

// 4. Install Node.js dependencies (pinned versions)
console.log('\n[4/6] Installing Node.js dependencies');
const pkgPath = path.join(workspacePath, 'package.json');
const deps = {
  playwright: '^1.52.0',
  '@google/genai': '^0.14.0',
  openai: '^4.85.0',
};

const pkg = { name: 'postgen-workspace', private: true, dependencies: deps };
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
try {
  execSync('npm install --production', {
    cwd: workspacePath,
    stdio: 'inherit',
    timeout: 180_000, // 3 minutes
  });
} catch {
  console.error('  npm install failed – please run it manually in the workspace.');
}

// 5. Install Playwright Chromium + system dependencies
console.log('\n[5/6] Installing Playwright Chromium');
try {
  if (platform === 'darwin') {
    // macOS doesn't need --with-deps
    execSync('npx playwright install chromium', {
      cwd: workspacePath,
      stdio: 'inherit',
      timeout: 180_000,
    });
  } else {
    // Linux: try with system deps first
    execSync('npx playwright install --with-deps chromium', {
      cwd: workspacePath,
      stdio: 'inherit',
      timeout: 180_000,
    });
  }
} catch {
  // Fallback: try without --with-deps
  console.warn('  install --with-deps failed, trying browser-only install...');
  try {
    execSync('npx playwright install chromium', {
      cwd: workspacePath,
      stdio: 'inherit',
      timeout: 180_000,
    });
    if (platform === 'linux') {
      console.warn(
        '  Browser installed but system dependencies may be missing.\n' +
          '  If rendering fails, run: sudo npx playwright install-deps chromium'
      );
    }
  } catch {
    console.error(
      '  Playwright install failed.\n' +
        '  Run manually: npx playwright install chromium\n' +
        (platform === 'linux' ? '  Then: sudo npx playwright install-deps chromium\n' : '')
    );
  }
}

// 6. Install ffmpeg if missing
console.log('\n[6/6] Checking / installing ffmpeg');
let hasFFmpeg = false;
try {
  execSync('ffmpeg -version', { stdio: 'pipe' });
  console.log('  ffmpeg is already installed');
  hasFFmpeg = true;
} catch {
  console.log('  ffmpeg not found — attempting to install...');

  // Try npm-based ffmpeg first (no root needed, most portable)
  // Then fall back to system package managers
  const installCmds =
    platform === 'darwin'
      ? [
          { name: 'brew', cmd: 'brew install ffmpeg' },
          { name: 'npm (ffmpeg-static)', cmd: `npm install --prefix "${workspacePath}" ffmpeg-static` },
        ]
      : [
          { name: 'npm (ffmpeg-static)', cmd: `npm install --prefix "${workspacePath}" ffmpeg-static` },
          { name: 'apt-get', cmd: 'sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg' },
          { name: 'apk', cmd: 'apk add --no-cache ffmpeg' },
          { name: 'yum', cmd: 'sudo yum install -y ffmpeg' },
        ];

  for (const { name, cmd } of installCmds) {
    try {
      execSync(cmd, { stdio: 'pipe', timeout: 120000 });
      console.log(`  Installed ffmpeg via ${name}`);
      hasFFmpeg = true;
      break;
    } catch {
      // try next method
    }
  }
  if (!hasFFmpeg) {
    console.warn(
      '  WARNING: Could not install ffmpeg automatically.\n' +
        '  Install it manually:\n' +
        (platform === 'darwin'
          ? '    brew install ffmpeg\n'
          : '    sudo apt-get install ffmpeg\n') +
        '  ffmpeg is needed for background compression and video generation.'
    );
  }
}

// Summary
console.log('\n--- Setup complete ---');
console.log(`Workspace: ${workspacePath}`);
console.log(`Provider:  ${provider}`);
console.log(`ffmpeg:    ${hasFFmpeg ? 'available' : 'NOT INSTALLED'}`);
console.log(`API key:   ${resolved ? `found (${resolved.source})` : 'NOT FOUND — add before generating'}`);
console.log('\nNext steps:');
console.log('  1. Edit postgen.config.json to set your brand details');
console.log('  2. Add your logo to the assets/ folder');
console.log('  3. Start generating posts!');
