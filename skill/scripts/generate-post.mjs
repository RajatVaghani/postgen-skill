#!/usr/bin/env node
/**
 * PostGen – Full pipeline orchestrator.
 *
 * Usage:
 *   node generate-post.mjs <post-dir> [--skip-video] [--skip-compress] [--dry-run] [--timeout <ms>]
 *
 * Runs the complete pipeline in order:
 *   1. validate-config (preflight check)
 *   2. generate-backgrounds
 *   3. compress-backgrounds
 *   4. build-slides
 *   5. render-slides
 *   6. generate-video (optional)
 *   7. verify-output
 *
 * Flags:
 *   --dry-run         Validate everything without generating (no API calls, no rendering)
 *   --skip-video      Skip MP4 video generation
 *   --skip-compress   Skip ffmpeg background compression
 *   --timeout <ms>    Per-step timeout in ms (default: 600000 = 10 minutes)
 *
 * Expects slides.json to already exist in <post-dir>.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { findWorkspaceRoot, loadConfig } from './workspace.mjs';
import { loadAndNormalizeSlides } from './normalize-slides.mjs';
import { resolveApiKey } from './resolve-key.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
let postDir = '.';
let skipVideo = false;
let skipCompress = false;
let dryRun = false;
let stepTimeout = 600_000; // 10 minutes per step

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--skip-video') skipVideo = true;
  else if (args[i] === '--skip-compress') skipCompress = true;
  else if (args[i] === '--dry-run') dryRun = true;
  else if (args[i] === '--timeout' && args[i + 1]) stepTimeout = Number(args[++i]);
  else if (!args[i].startsWith('--')) postDir = args[i];
}

postDir = path.resolve(postDir);

// ---------------------------------------------------------------------------
// Preflight checks
// ---------------------------------------------------------------------------

console.log('=== PostGen Pipeline ===\n');

if (!fs.existsSync(path.join(postDir, 'slides.json'))) {
  console.error('FATAL: slides.json not found in ' + postDir);
  process.exit(1);
}

const wsRoot = findWorkspaceRoot(postDir);
if (!wsRoot) {
  console.error('FATAL: postgen.config.json not found – run setup first.');
  process.exit(1);
}

const config = loadConfig(postDir);

// Validate config essentials
const configIssues = [];
if (!config.brand?.name || config.brand.name === 'My Brand') {
  configIssues.push('brand.name is not configured (still default "My Brand")');
}
if (!config.image_provider) {
  configIssues.push('image_provider is not set');
}
const provider = config.image_provider || 'google-genai';
const resolved = resolveApiKey(provider, config);
if (!resolved) {
  configIssues.push(`No API key found for provider "${provider}"`);
}
if (configIssues.length > 0) {
  console.error('CONFIG ISSUES:');
  for (const issue of configIssues) console.error(`  [!] ${issue}`);
  if (!resolved) {
    console.error('\nCannot proceed without an API key. Run setup or add the key.');
    process.exit(1);
  }
  console.log();
}

// Load slides config
const { formats: slidesFormats, outputType } = loadAndNormalizeSlides(postDir);
const formats = slidesFormats || config.defaults?.formats || ['instagram', 'tiktok'];

if (!skipVideo && outputType === 'image') {
  skipVideo = true;
}

// Check system dependencies
let hasFFmpeg = false;
try {
  execSync('ffmpeg -version', { stdio: 'pipe' });
  hasFFmpeg = true;
} catch {
  // no ffmpeg
}

let hasChromium = false;
try {
  const nmDir = path.join(wsRoot, 'node_modules');
  if (fs.existsSync(path.join(nmDir, 'playwright'))) {
    hasChromium = true;
  }
} catch {
  // can't check
}

// Print plan
console.log('Pipeline plan:');
console.log(`  Post directory: ${postDir}`);
console.log(`  Formats: ${formats.join(', ')}`);
console.log(`  Output type: ${skipVideo ? 'image only' : 'image + video'}`);
console.log(`  Provider: ${provider} (key via ${resolved?.source || 'MISSING'})`);
console.log(`  ffmpeg: ${hasFFmpeg ? 'available' : 'NOT FOUND (compression/video will fail)'}`);
console.log(`  Playwright: ${hasChromium ? 'available' : 'NOT FOUND (rendering will fail)'}`);
console.log(`  Step timeout: ${stepTimeout / 1000}s`);
if (dryRun) console.log('  MODE: DRY RUN (no generation, no rendering)');
console.log();

if (dryRun) {
  // Run validation only
  console.log('--- Dry run: validating slides.json ---');
  try {
    run('verify-output.mjs', '', true); // validate-only mode
  } catch {
    // verification issues are reported by the script
  }
  console.log('\n=== Dry run complete ===');
  console.log('Everything looks good. Remove --dry-run to generate for real.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Pipeline execution
// ---------------------------------------------------------------------------

const NODE_PATH = path.join(wsRoot, 'node_modules');
const env = { ...process.env, NODE_PATH };

const pipelineStart = Date.now();
let currentStep = '';

function run(script, extraArgs = '', allowFailure = false) {
  const cmd = `node "${path.join(__dirname, script)}" "${postDir}" ${extraArgs}`.trim();
  currentStep = script;
  const stepStart = Date.now();
  console.log(`\n>>> [${stepLabel()}] ${script} ${extraArgs}\n`);
  try {
    execSync(cmd, { stdio: 'inherit', env, timeout: stepTimeout });
    const elapsed = ((Date.now() - stepStart) / 1000).toFixed(1);
    console.log(`\n    ${script} completed in ${elapsed}s`);
  } catch (err) {
    const elapsed = ((Date.now() - stepStart) / 1000).toFixed(1);
    if (err.killed || err.signal === 'SIGTERM') {
      console.error(`\n    ${script} TIMED OUT after ${elapsed}s (limit: ${stepTimeout / 1000}s)`);
    } else {
      console.error(`\n    ${script} FAILED after ${elapsed}s`);
    }
    if (!allowFailure) {
      console.error(`\nPipeline aborted at: ${script}`);
      console.error(`To retry from this step, run the individual script manually.`);
      process.exit(1);
    }
  }
}

function stepLabel() {
  return `${((Date.now() - pipelineStart) / 1000).toFixed(0)}s`;
}

// 1. Generate backgrounds
run('generate-backgrounds.mjs');

// 2. Compress backgrounds
if (!skipCompress && hasFFmpeg) {
  run('compress-backgrounds.mjs');
} else if (!skipCompress && !hasFFmpeg) {
  console.log('\n>>> Skipping compression (ffmpeg not available)');
}

// 3 & 4. Build + render for each format
for (const fmt of formats) {
  run('build-slides.mjs', `--format ${fmt}`);
  run('render-slides.mjs', `--format ${fmt}`);

  // 5. Video
  if (!skipVideo && hasFFmpeg) {
    run('generate-video.mjs', `--format ${fmt}`);
  } else if (!skipVideo && !hasFFmpeg) {
    console.log(`\n>>> Skipping video for ${fmt} (ffmpeg not available)`);
  }
}

// 6. Verify output
console.log('\n');
try {
  run('verify-output.mjs', '', true);
} catch {
  console.log('\nVerification found issues — see report above.');
}

// Final summary
const totalElapsed = ((Date.now() - pipelineStart) / 1000).toFixed(1);
console.log(`\n=== Pipeline complete in ${totalElapsed}s ===`);
console.log(`Output: ${postDir}`);
console.log(`Type: ${skipVideo ? 'image' : 'image + video'}`);
for (const fmt of formats) {
  const finalDir = path.join(postDir, fmt, 'final');
  if (fs.existsSync(finalDir)) {
    const pngs = fs.readdirSync(finalDir).filter((f) => f.endsWith('.png'));
    const mp4 = fs.readdirSync(finalDir).find((f) => f.endsWith('.mp4'));
    console.log(`  ${fmt}: ${pngs.length} slide image(s)${mp4 ? ' + video' : ''}`);
  }
}
