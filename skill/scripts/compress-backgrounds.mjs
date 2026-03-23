#!/usr/bin/env node
/**
 * PostGen – Compress background images with ffmpeg.
 *
 * Usage:
 *   node compress-backgrounds.mjs <post-dir>
 *
 * Reads PNGs from <post-dir>/backgrounds/, converts to high-quality JPG
 * in <post-dir>/backgrounds-compressed/. Does NOT resize — the build step
 * handles sizing via CSS background-size: cover, so we preserve full
 * resolution to support all format dimensions (instagram 1350px, tiktok 1920px).
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const postDir = path.resolve(process.argv[2] || '.');
const bgDir = path.join(postDir, 'backgrounds');
const compDir = path.join(postDir, 'backgrounds-compressed');

if (!fs.existsSync(bgDir)) {
  console.log('No backgrounds/ directory found – skipping compression.');
  process.exit(0);
}

fs.mkdirSync(compDir, { recursive: true });

const files = fs.readdirSync(bgDir).filter((f) => f.endsWith('.png'));

if (files.length === 0) {
  console.log('No PNG files to compress.');
  process.exit(0);
}

console.log(`Compressing ${files.length} background(s)...`);

let successCount = 0;
let failCount = 0;

for (const file of files) {
  const input = path.join(bgDir, file);
  const output = path.join(compDir, file.replace('.png', '.jpg'));
  if (fs.statSync(input).size === 0) {
    console.log(`  Skipping ${file} (empty file)`);
    continue;
  }
  try {
    // Convert to JPG at high quality (q:v 2) without resizing.
    // The CSS background-size: cover in the HTML slides handles all scaling.
    execSync(`ffmpeg -i "${input}" -q:v 2 "${output}" -y`, {
      stdio: 'pipe',
      timeout: 30_000, // 30 seconds per image
    });
    const inSize = (fs.statSync(input).size / 1024).toFixed(0);
    const outSize = (fs.statSync(output).size / 1024).toFixed(0);
    console.log(`  ${file} (${inSize}KB) -> ${path.basename(output)} (${outSize}KB)`);
    successCount++;
  } catch (err) {
    console.error(`  Failed to compress ${file}: ${err.message}`);
    failCount++;
  }
}

console.log(`Compression complete: ${successCount} compressed, ${failCount} failed.`);
