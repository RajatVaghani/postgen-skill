#!/usr/bin/env node
/**
 * PostGen – Generate carousel video from rendered slide PNGs.
 *
 * Usage:
 *   node generate-video.mjs <post-dir> [--format instagram|tiktok] [--duration 4]
 *
 * Creates an MP4 from the PNG sequence in <post-dir>/<format>/final/.
 * Uses explicit quality settings for consistent social media output.
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const VIEWPORTS = {
  instagram: { width: 1080, height: 1350 },
  tiktok: { width: 1080, height: 1920 },
  shorts: { width: 1080, height: 1920 },
};

const VIDEO_TIMEOUT_MS = 120_000; // 2 minutes for video generation

const args = process.argv.slice(2);
let postDir = '.';
let format = 'instagram';
let duration = 4;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--format' && args[i + 1]) format = args[++i];
  else if (args[i] === '--duration' && args[i + 1]) duration = Number(args[++i]);
  else if (!args[i].startsWith('--')) postDir = args[i];
}

postDir = path.resolve(postDir);
const finalDir = path.join(postDir, format, 'final');
if (!fs.existsSync(finalDir)) {
  console.error(`No final/ directory at ${finalDir}`);
  process.exit(1);
}

const slides = fs
  .readdirSync(finalDir)
  .filter((f) => f.endsWith('.png'))
  .sort();

if (slides.length === 0) {
  console.error('No rendered PNGs found.');
  process.exit(1);
}

const vp = VIEWPORTS[format] || VIEWPORTS.instagram;
const videoPath = path.join(finalDir, 'carousel-video.mp4');
const listPath = path.join(finalDir, 'filelist.txt');

const listContent =
  slides.map((f) => `file '${path.join(finalDir, f)}'\nduration ${duration}`).join('\n') +
  `\nfile '${path.join(finalDir, slides[slides.length - 1])}'`;

fs.writeFileSync(listPath, listContent);

const totalDuration = slides.length * duration;
console.log(`Generating ${format} video: ${slides.length} slides × ${duration}s = ${totalDuration}s`);
console.log(`  Resolution: ${vp.width}x${vp.height}`);
console.log(`  Output: ${videoPath}`);

try {
  execSync(
    [
      'ffmpeg -y',
      '-f concat -safe 0',
      `-i "${listPath}"`,
      `-vf "scale=${vp.width}:${vp.height},format=yuv420p"`,
      '-c:v libx264',
      '-crf 18',           // High quality (lower = better, 18 is visually lossless)
      '-preset medium',    // Good balance of speed and compression
      '-r 30',             // 30 fps
      '-pix_fmt yuv420p',  // Maximum compatibility
      '-movflags +faststart', // Web-optimized: metadata at start of file
      `"${videoPath}"`,
    ].join(' '),
    { stdio: 'pipe', timeout: VIDEO_TIMEOUT_MS }
  );

  // Clean up temp file
  try { fs.unlinkSync(listPath); } catch { /* ignore */ }

  const size = fs.statSync(videoPath).size;
  console.log(`Video generated: ${(size / 1024 / 1024).toFixed(1)}MB`);
} catch (err) {
  // Clean up temp file on failure too
  try { fs.unlinkSync(listPath); } catch { /* ignore */ }

  if (err.killed || err.signal === 'SIGTERM') {
    console.error(`Video generation timed out after ${VIDEO_TIMEOUT_MS / 1000}s`);
  } else {
    // Print stderr for debugging
    const stderr = err.stderr?.toString() || '';
    console.error(`Video generation failed: ${err.message}`);
    if (stderr) console.error(`  ffmpeg output: ${stderr.split('\n').slice(-3).join(' | ')}`);
  }
  process.exit(1);
}
