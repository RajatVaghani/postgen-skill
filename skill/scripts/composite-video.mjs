#!/usr/bin/env node
/**
 * PostGen – Composite final video from AI clips + voiceover + subtitles.
 *
 * Usage:
 *   node composite-video.mjs <post-dir> [--format tiktok|instagram]
 *                                        [--no-subtitles]
 *                                        [--subtitle-style bold|minimal|karaoke]
 *
 * Reads:
 *   - ai-video/manifest.json  — AI-generated video clips manifest
 *   - voiceover/manifest.json — TTS audio segments manifest
 *   - video.json              — Scene descriptions + voiceover text (video flow)
 *   - slides.json             — Slide text for subtitles (carousel→video flow)
 *
 * Produces:
 *   - Video flow:    final/postgen-video.mp4 (one video for all platforms)
 *   - Carousel flow: <format>/final/postgen-video.mp4
 *
 * Pipeline:
 *   1. Concatenate AI video clips into one continuous video
 *   1b. Render branded CTA end-card (5s) and append to video track
 *   2. Concatenate voiceover audio segments with timing
 *   2b. Time-stretch audio to match video duration exactly
 *   3. Generate SRT subtitle file from slide text + audio timing
 *   4. Composite: video + audio + burned-in subtitles → final MP4
 *
 * Falls back gracefully:
 *   - No AI clips? Uses static slide PNGs with Ken Burns effect
 *   - No voiceover? Produces silent video
 *   - No subtitles flag? Skips subtitle burn-in
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { loadAndNormalizeSlides } from './normalize-slides.mjs';
import { findWorkspaceRoot, loadConfig } from './workspace.mjs';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let postDir = '.';
let format = 'tiktok';
let enableSubtitles = true;
let subtitleStyle = 'bold';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--format' && args[i + 1]) format = args[++i];
  else if (args[i] === '--no-subtitles') enableSubtitles = false;
  else if (args[i] === '--subtitle-style' && args[i + 1]) subtitleStyle = args[++i];
  else if (!args[i].startsWith('--')) postDir = args[i];
}

postDir = path.resolve(postDir);
const wsRoot = findWorkspaceRoot(postDir);
const config = wsRoot ? loadConfig(postDir) : {};

const VIEWPORTS = {
  instagram: { width: 1080, height: 1350 },
  tiktok: { width: 1080, height: 1920 },
};
const vp = VIEWPORTS[format] || VIEWPORTS.tiktok;

const FFMPEG_TIMEOUT = 300_000; // 5 minutes

// ---------------------------------------------------------------------------
// Load manifests
// ---------------------------------------------------------------------------

// Manifest locations: new paths (inside subdirs) with fallback to legacy paths
const aiVideoManifestPath = (() => {
  const newPath = path.join(postDir, 'ai-video', 'manifest.json');
  const legacyPath = path.join(postDir, 'ai-video.json');
  if (fs.existsSync(newPath)) return newPath;
  if (fs.existsSync(legacyPath)) return legacyPath;
  return newPath; // prefer new path even if neither exists
})();

const voiceoverManifestPath = (() => {
  const newPath = path.join(postDir, 'voiceover', 'manifest.json');
  const legacyPath = path.join(postDir, 'voiceover.json');
  if (fs.existsSync(newPath)) return newPath;
  if (fs.existsSync(legacyPath)) return legacyPath;
  return newPath;
})();

const hasAiVideo = fs.existsSync(aiVideoManifestPath);
const hasVoiceover = fs.existsSync(voiceoverManifestPath);

const aiVideo = hasAiVideo ? JSON.parse(fs.readFileSync(aiVideoManifestPath, 'utf-8')) : null;
const voiceover = hasVoiceover ? JSON.parse(fs.readFileSync(voiceoverManifestPath, 'utf-8')) : null;

// Voiceover segments: support both new key ("segments") and legacy key ("slides")
const voiceoverSegments = voiceover ? (voiceover.segments || voiceover.slides || []) : [];

// Load scene/slide text for subtitles — prefer video.json (video flow), fall back to slides.json
const videoJsonPath = path.join(postDir, 'video.json');
const hasVideoJson = fs.existsSync(videoJsonPath);
let slides;
let videoSpec = null;
if (hasVideoJson) {
  // Video flow: use video.json scenes as subtitle source
  videoSpec = JSON.parse(fs.readFileSync(videoJsonPath, 'utf-8'));
  slides = (videoSpec.scenes || []).map((s) => ({
    title: s.voiceover_text || s.prompt || '',
    body: '',
  }));
} else {
  // Carousel→video flow: use slides.json
  const result = loadAndNormalizeSlides(postDir);
  slides = result.slides;
}

// CTA end-card: auto-generate from brand config if video.json doesn't have a cta field
const CTA_DURATION = 5;
let hasCta = false;

if (videoSpec) {
  // If video.json exists but has no cta field, auto-generate one from brand config
  if (!videoSpec.cta) {
    const brand = config.brand || {};
    const handle = brand.handle || brand.name || '';
    videoSpec.cta = {
      title: handle ? `Follow @${handle}` : 'Follow for More',
      body: brand.tagline || 'Follow for more content like this!',
    };
    console.log(`  [cta] Auto-generated CTA from brand config: "${videoSpec.cta.title}"`);
  }
  hasCta = true;
}

console.log(`\nPostGen Composite Video`);
console.log(`  Format: ${format} (${vp.width}x${vp.height})`);
console.log(`  AI video clips: ${hasAiVideo ? aiVideo.clips.length : 'none (will use static PNGs)'}`);
console.log(`  Voiceover: ${hasVoiceover ? `${voiceoverSegments.length} segments` : 'none (silent video)'}`);
console.log(`  CTA end-card: ${hasCta ? `${CTA_DURATION}s branded frame` : 'none'}`);
console.log(`  Subtitles: ${enableSubtitles ? subtitleStyle : 'disabled'}`);
console.log();

// Video flow outputs to {postDir}/final/ (no format subdir — one video for all platforms)
// Carousel flow still uses {postDir}/{format}/final/
const isVideoFlow = fs.existsSync(path.join(postDir, 'video.json'));
const finalDir = isVideoFlow ? path.join(postDir, 'final') : path.join(postDir, format, 'final');
if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });

const tmpDir = path.join(postDir, '.composite-tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

// ---------------------------------------------------------------------------
// Step 1: Build video track
// ---------------------------------------------------------------------------

console.log('Step 1: Building video track...');

const videoTrackPath = path.join(tmpDir, 'video-track.mp4');

if (hasAiVideo && aiVideo.clips.length > 0) {
  // Concatenate AI video clips
  const clipListPath = path.join(tmpDir, 'clips.txt');
  const clipList = aiVideo.clips
    .sort((a, b) => (a.clip || a.slide || 0) - (b.clip || b.slide || 0))
    .map((clip) => `file '${path.join(postDir, 'ai-video', clip.file)}'`)
    .join('\n');
  fs.writeFileSync(clipListPath, clipList);

  execSync(
    [
      'ffmpeg -y',
      '-f concat -safe 0',
      `-i "${clipListPath}"`,
      `-vf "scale=${vp.width}:${vp.height}:force_original_aspect_ratio=decrease,pad=${vp.width}:${vp.height}:(ow-iw)/2:(oh-ih)/2,setsar=1"`,
      '-c:v libx264 -crf 18 -preset medium',
      '-an',  // strip any existing audio
      '-r 30 -pix_fmt yuv420p',
      `"${videoTrackPath}"`,
    ].join(' '),
    { stdio: 'pipe', timeout: FFMPEG_TIMEOUT }
  );
  console.log('  Concatenated AI clips into video track.');
} else {
  // Fallback: Ken Burns effect from static PNGs
  console.log('  No AI clips — creating Ken Burns slideshow from PNGs...');

  const pngDir = path.join(postDir, format, 'final');
  const pngs = fs.readdirSync(pngDir).filter((f) => f.endsWith('.png')).sort();

  if (pngs.length === 0) {
    console.error('No PNGs found for fallback video. Run render-slides.mjs first.');
    process.exit(1);
  }

  // Calculate per-slide duration to target ~30s total, min 4s per slide
  const targetTotal = 30;
  const perSlide = Math.max(4, Math.floor(targetTotal / pngs.length));

  // Build concat list with Ken Burns zoom effect
  const listPath = path.join(tmpDir, 'png-list.txt');
  const listContent = pngs
    .map((f) => `file '${path.join(pngDir, f)}'\nduration ${perSlide}`)
    .join('\n') + `\nfile '${path.join(pngDir, pngs[pngs.length - 1])}'`;
  fs.writeFileSync(listPath, listContent);

  // Subtle zoom: 1.0 → 1.05 over duration (Ken Burns)
  execSync(
    [
      'ffmpeg -y',
      '-f concat -safe 0',
      `-i "${listPath}"`,
      `-vf "scale=${vp.width * 1.05}:${vp.height * 1.05},zoompan=z='min(zoom+0.0005,1.05)':d=${perSlide * 30}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${vp.width}x${vp.height}:fps=30,format=yuv420p"`,
      '-c:v libx264 -crf 18 -preset medium',
      '-r 30 -pix_fmt yuv420p',
      `"${videoTrackPath}"`,
    ].join(' '),
    { stdio: 'pipe', timeout: FFMPEG_TIMEOUT }
  );
  console.log(`  Created Ken Burns slideshow: ${pngs.length} slides × ${perSlide}s`);
}

// ---------------------------------------------------------------------------
// Step 1b: Render CTA end-card and append to video track
// ---------------------------------------------------------------------------

if (hasCta) {
  console.log('Step 1b: Appending CTA end-card...');

  const ctaClipPath = path.join(tmpDir, 'cta-clip.mp4');
  let ctaReady = false;

  // --- Priority 1: Custom CTA video from postgen.config.json → cta_video ---
  const customCtaPath = config.cta_video || '';
  const resolvedCustomCta = customCtaPath ? path.resolve(wsRoot || postDir, customCtaPath) : '';

  if (resolvedCustomCta && fs.existsSync(resolvedCustomCta)) {
    console.log(`  Using custom CTA video: ${resolvedCustomCta}`);
    // Re-encode to match main video track (resolution, codec, framerate)
    try {
      execSync(
        [
          'ffmpeg -y',
          `-i "${resolvedCustomCta}"`,
          `-vf "scale=${vp.width}:${vp.height}:force_original_aspect_ratio=decrease,pad=${vp.width}:${vp.height}:(ow-iw)/2:(oh-ih)/2,setsar=1"`,
          '-c:v libx264 -crf 18 -preset medium',
          '-an', // strip audio from CTA — voiceover track handles audio
          '-r 30 -pix_fmt yuv420p',
          `"${ctaClipPath}"`,
        ].join(' '),
        { stdio: 'pipe', timeout: FFMPEG_TIMEOUT }
      );
      const ctaDur = probeDuration(ctaClipPath);
      console.log(`  Custom CTA video: ${ctaDur.toFixed(1)}s`);
      ctaReady = true;
    } catch (err) {
      console.warn(`  Custom CTA re-encode failed: ${err.message}`);
      console.warn(`  Falling back to auto-generated CTA...`);
    }
  } else if (customCtaPath) {
    console.warn(`  Custom CTA video not found at "${resolvedCustomCta}" — falling back to auto-generated CTA.`);
  }

  // --- Priority 2: Auto-generated CTA from PNG (existing behavior) ---
  if (!ctaReady) {
    const ctaFrameNewPath = path.join(postDir, 'cta', 'frame.png');
    const ctaFrameLegacy = path.join(postDir, 'cta-frame.png');
    const ctaFramePath = fs.existsSync(ctaFrameNewPath) ? ctaFrameNewPath :
                          fs.existsSync(ctaFrameLegacy) ? ctaFrameLegacy : ctaFrameNewPath;

    // Render the CTA PNG using render-cta-frame.mjs (skip if already exists)
    if (!fs.existsSync(ctaFramePath)) {
      const renderScript = path.join(path.dirname(new URL(import.meta.url).pathname), 'render-cta-frame.mjs');
      const templateFlag = videoSpec.template ? `--template ${videoSpec.template}` : '';
      try {
        execSync(
          `node "${renderScript}" "${postDir}" --format ${format} ${templateFlag}`,
          { stdio: 'inherit', timeout: 60_000 }
        );
      } catch (err) {
        console.warn(`  CTA rendering error: ${err.message}`);
      }
    } else {
      console.log(`  CTA frame already exists: ${ctaFramePath}`);
    }

    if (!fs.existsSync(ctaFramePath)) {
      console.warn('  CTA frame not found — skipping end-card.');
    } else {
      // Convert CTA PNG to a 5s video clip with a subtle Ken Burns zoom
      execSync(
        [
          'ffmpeg -y',
          '-loop 1',
          `-i "${ctaFramePath}"`,
          `-vf "scale=${Math.round(vp.width * 1.05)}:${Math.round(vp.height * 1.05)},zoompan=z='min(zoom+0.0003,1.05)':d=${CTA_DURATION * 30}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${vp.width}x${vp.height}:fps=30,format=yuv420p"`,
          `-t ${CTA_DURATION}`,
          '-c:v libx264 -crf 18 -preset medium',
          '-r 30 -pix_fmt yuv420p',
          `"${ctaClipPath}"`,
        ].join(' '),
        { stdio: 'pipe', timeout: FFMPEG_TIMEOUT }
      );
      ctaReady = true;
    }
  }

  // --- Append CTA clip to the main video track ---
  if (ctaReady) {
    const mergedPath = path.join(tmpDir, 'video-track-with-cta.mp4');
    const mergeListPath = path.join(tmpDir, 'merge-cta.txt');
    fs.writeFileSync(mergeListPath, `file '${videoTrackPath}'\nfile '${ctaClipPath}'`);

    execSync(
      [
        'ffmpeg -y',
        '-f concat -safe 0',
        `-i "${mergeListPath}"`,
        '-c copy',
        `"${mergedPath}"`,
      ].join(' '),
      { stdio: 'pipe', timeout: FFMPEG_TIMEOUT }
    );

    // Replace the video track with the merged version
    fs.renameSync(mergedPath, videoTrackPath);
    const ctaDur = probeDuration(ctaClipPath);
    console.log(`  CTA end-card appended (${ctaDur.toFixed(1)}s). Video track now includes branded outro.`);
  }
}

// ---------------------------------------------------------------------------
// Step 2: Build audio track
// ---------------------------------------------------------------------------

console.log('Step 2: Building audio track...');

const audioTrackPath = path.join(tmpDir, 'audio-track.mp3');
let hasAudioTrack = false;

if (hasVoiceover && voiceoverSegments.length > 0) {
  // Concatenate voiceover segments with small gaps between segments
  const audioListPath = path.join(tmpDir, 'audio-segments.txt');
  const gapPath = path.join(tmpDir, 'silence-gap.mp3');

  // Generate a 0.3s silence gap between segments
  execSync(
    `ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=mono -t 0.3 -q:a 9 "${gapPath}"`,
    { stdio: 'pipe', timeout: 10_000 }
  );

  const audioSegments = voiceoverSegments
    .sort((a, b) => (a.segment || a.slide || 0) - (b.segment || b.slide || 0))
    .flatMap((seg, idx) => {
      const segPath = path.join(postDir, 'voiceover', seg.file);
      const entries = [`file '${segPath}'`];
      // Add gap between segments (not after the last one)
      if (idx < voiceoverSegments.length - 1) {
        entries.push(`file '${gapPath}'`);
      }
      return entries;
    })
    .join('\n');

  fs.writeFileSync(audioListPath, audioSegments);

  execSync(
    [
      'ffmpeg -y',
      '-f concat -safe 0',
      `-i "${audioListPath}"`,
      '-c:a libmp3lame -q:a 2',
      `"${audioTrackPath}"`,
    ].join(' '),
    { stdio: 'pipe', timeout: FFMPEG_TIMEOUT }
  );

  hasAudioTrack = true;
  console.log('  Concatenated voiceover segments into audio track.');
} else {
  console.log('  No voiceover — video will be silent.');
}

// ---------------------------------------------------------------------------
// Step 2b: Measure durations & time-stretch audio to match video
// ---------------------------------------------------------------------------

/**
 * Get the exact duration of a media file in seconds via ffprobe.
 */
function probeDuration(filePath) {
  const raw = execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`,
    { encoding: 'utf-8', timeout: 10_000 }
  ).trim();
  return parseFloat(raw);
}

const videoDuration = probeDuration(videoTrackPath);
let audioDuration = hasAudioTrack ? probeDuration(audioTrackPath) : 0;

// The ratio by which we speed/slow the audio to fit the video exactly.
// atempo accepts 0.5–100.0 (values <0.5 or >2.0 need chaining, but our
// range is always close to 1.0 so a single filter is fine).
let tempoRatio = 1.0;

if (hasAudioTrack && Math.abs(audioDuration - videoDuration) > 0.2) {
  tempoRatio = audioDuration / videoDuration;

  if (tempoRatio > 1.15) {
    console.warn(`  ⚠ Audio is ${((tempoRatio - 1) * 100).toFixed(0)}% longer than video — speech will sound noticeably fast.`);
    console.warn(`    Tip: reduce word count in video.json voiceover_text (~15 words per 5s scene).`);
  }

  console.log(`  Video: ${videoDuration.toFixed(2)}s | Audio: ${audioDuration.toFixed(2)}s → tempo ×${tempoRatio.toFixed(3)}`);

  // ffmpeg atempo accepts 0.5–2.0 per filter. For ratios outside that range,
  // chain multiple atempo filters (e.g., 2.5 → atempo=2.0,atempo=1.25).
  function buildAtempoFilter(ratio) {
    const filters = [];
    let remaining = ratio;
    while (remaining > 2.0) {
      filters.push('atempo=2.0');
      remaining /= 2.0;
    }
    while (remaining < 0.5) {
      filters.push('atempo=0.5');
      remaining /= 0.5;
    }
    filters.push(`atempo=${remaining.toFixed(6)}`);
    return filters.join(',');
  }

  const stretchedPath = path.join(tmpDir, 'audio-stretched.mp3');
  const atempoFilter = buildAtempoFilter(tempoRatio);
  execSync(
    [
      'ffmpeg -y',
      `-i "${audioTrackPath}"`,
      `-af "${atempoFilter}"`,
      '-c:a libmp3lame -q:a 2',
      `"${stretchedPath}"`,
    ].join(' '),
    { stdio: 'pipe', timeout: FFMPEG_TIMEOUT }
  );

  // Replace the audio track with the stretched version
  fs.renameSync(stretchedPath, audioTrackPath);
  audioDuration = probeDuration(audioTrackPath);
  console.log(`  Stretched audio: ${audioDuration.toFixed(2)}s (target: ${videoDuration.toFixed(2)}s)`);
} else if (hasAudioTrack) {
  console.log(`  Video: ${videoDuration.toFixed(2)}s | Audio: ${audioDuration.toFixed(2)}s — already in sync.`);
}

// ---------------------------------------------------------------------------
// Step 3: Generate SRT subtitles (timed to stretched audio)
// ---------------------------------------------------------------------------

let srtPath = null;

if (enableSubtitles && hasVoiceover && voiceoverSegments.length > 0) {
  console.log('Step 3: Generating subtitles...');
  console.log(`  Voiceover segments: ${voiceoverSegments.length}`);
  console.log(`  Subtitle text sources: ${slides.length}`);

  srtPath = path.join(tmpDir, 'subtitles.srt');
  let currentTime = 0;
  const srtEntries = [];

  voiceoverSegments.sort((a, b) => (a.segment || a.slide || 0) - (b.segment || b.slide || 0)).forEach((seg) => {
    const segIndex = (seg.segment || seg.slide || 1) - 1;
    const slide = slides[segIndex];
    if (!slide) {
      console.warn(`  [sub] No text found for voiceover segment ${seg.segment || seg.slide} — skipping`);
      return;
    }

    // Apply tempo ratio to subtitle timing so captions match stretched audio
    const segDuration = seg.duration / tempoRatio;
    const segStart = currentTime;
    const gapDuration = 0.3 / tempoRatio;
    const text = slide.title || slide.body || '';
    if (!text) { currentTime += segDuration + gapDuration; return; }

    // Split into short caption chunks (~5-7 words each) for TikTok-style display
    const chunks = splitIntoChunks(text, 7);
    const chunkDuration = segDuration / chunks.length;

    for (let c = 0; c < chunks.length; c++) {
      srtEntries.push({
        index: srtEntries.length + 1,
        start: formatSrtTime(segStart + c * chunkDuration),
        end: formatSrtTime(segStart + (c + 1) * chunkDuration),
        text: chunks[c],
      });
    }

    currentTime = segStart + segDuration + gapDuration;
  });

  if (srtEntries.length === 0) {
    console.warn('  No subtitle entries generated — subtitle text may be empty.');
    srtPath = null;
  } else {
    const srtContent = srtEntries
      .map((e) => `${e.index}\n${e.start} --> ${e.end}\n${e.text}\n`)
      .join('\n');

    fs.writeFileSync(srtPath, srtContent);
    console.log(`  Generated ${srtEntries.length} subtitle entries (tempo-adjusted).`);
    console.log(`  SRT file: ${srtPath}`);
  }
} else if (enableSubtitles && !hasVoiceover) {
  console.log('Step 3: Skipping subtitles (no voiceover.json found — run generate-tts.mjs first).');
} else if (enableSubtitles && hasVoiceover) {
  console.log('Step 3: Skipping subtitles (voiceover.json has no segments).');
} else {
  console.log('Step 3: Subtitles disabled.');
}

// ---------------------------------------------------------------------------
// Step 4: Final composite
// ---------------------------------------------------------------------------

console.log('Step 4: Compositing final video...');

const outputPath = path.join(finalDir, 'postgen-video.mp4');

// Build subtitle filter based on style
function getSubtitleFilter() {
  if (!srtPath || !enableSubtitles) return '';

  const escapedSrt = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');

  // FontSize in ASS scales with video height. For 1920px tall video:
  //   FontSize=8  ≈ small, readable caption at bottom
  //   FontSize=10 ≈ medium, TikTok-style captions
  //   FontSize=12 ≈ large emphasis text
  const styles = {
    bold: `FontName=Inter,FontSize=10,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=1,Shadow=1,BackColour=&H80000000,MarginV=40,Alignment=2,Bold=1`,
    minimal: `FontName=Inter,FontSize=9,PrimaryColour=&H00FFFFFF,OutlineColour=&H40000000,BorderStyle=1,Outline=1,Shadow=0,MarginV=30,Alignment=2`,
    karaoke: `FontName=Inter,FontSize=11,PrimaryColour=&H0000FFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=1,Shadow=1,BackColour=&H80000000,MarginV=40,Alignment=2,Bold=1`,
  };

  const style = styles[subtitleStyle] || styles.bold;
  return `,subtitles='${escapedSrt}':force_style='${style}'`;
}

const subtitleFilter = getSubtitleFilter();

// Log what's being composited
console.log(`  Video track: ${videoTrackPath}`);
if (hasAudioTrack) console.log(`  Audio track: ${audioTrackPath}`);
if (subtitleFilter) console.log(`  Subtitles: enabled (${subtitleStyle})`);
else console.log(`  Subtitles: none`);

try {
  if (hasAudioTrack) {
    // Both tracks are now duration-matched; use -shortest as a safety net
    execSync(
      [
        'ffmpeg -y',
        `-i "${videoTrackPath}"`,
        `-i "${audioTrackPath}"`,
        `-filter_complex "[0:v]scale=${vp.width}:${vp.height},setsar=1${subtitleFilter}[vout]"`,
        '-map "[vout]" -map 1:a',
        '-c:v libx264 -crf 18 -preset medium',
        '-c:a aac -b:a 192k',
        '-r 30 -pix_fmt yuv420p',
        '-shortest',
        '-movflags +faststart',
        `"${outputPath}"`,
      ].join(' '),
      { stdio: 'pipe', timeout: FFMPEG_TIMEOUT }
    );
  } else {
    // Video only, no audio
    execSync(
      [
        'ffmpeg -y',
        `-i "${videoTrackPath}"`,
        `-vf "scale=${vp.width}:${vp.height},setsar=1${subtitleFilter}"`,
        '-c:v libx264 -crf 18 -preset medium',
        '-r 30 -pix_fmt yuv420p',
        '-movflags +faststart',
        `"${outputPath}"`,
      ].join(' '),
      { stdio: 'pipe', timeout: FFMPEG_TIMEOUT }
    );
  }
} catch (err) {
  // If subtitle filter caused the failure, retry without subtitles
  if (subtitleFilter && err.message) {
    console.warn(`  Composite failed with subtitles — retrying without subtitles...`);
    console.warn(`  Error: ${err.stderr?.toString().slice(-200) || err.message}`);
    if (hasAudioTrack) {
      execSync(
        [
          'ffmpeg -y',
          `-i "${videoTrackPath}"`,
          `-i "${audioTrackPath}"`,
          `-filter_complex "[0:v]scale=${vp.width}:${vp.height},setsar=1[vout]"`,
          '-map "[vout]" -map 1:a',
          '-c:v libx264 -crf 18 -preset medium',
          '-c:a aac -b:a 192k',
          '-r 30 -pix_fmt yuv420p',
          '-shortest',
          '-movflags +faststart',
          `"${outputPath}"`,
        ].join(' '),
        { stdio: 'pipe', timeout: FFMPEG_TIMEOUT }
      );
    } else {
      execSync(
        [
          'ffmpeg -y',
          `-i "${videoTrackPath}"`,
          `-vf "scale=${vp.width}:${vp.height},setsar=1"`,
          '-c:v libx264 -crf 18 -preset medium',
          '-r 30 -pix_fmt yuv420p',
          '-movflags +faststart',
          `"${outputPath}"`,
        ].join(' '),
        { stdio: 'pipe', timeout: FFMPEG_TIMEOUT }
      );
    }
    console.warn(`  Video composited WITHOUT subtitles. The subtitle filter may require libass.`);
  } else {
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Cleanup temp files
// ---------------------------------------------------------------------------

try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch { /* ignore cleanup errors */ }

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Output Validation
// ---------------------------------------------------------------------------

if (!fs.existsSync(outputPath)) {
  console.error(`\nFATAL: Output file was not created: ${outputPath}`);
  process.exit(1);
}

const outputSize = fs.statSync(outputPath).size;

if (outputSize === 0) {
  console.error(`\nFATAL: Output file is 0 bytes: ${outputPath}`);
  fs.unlinkSync(outputPath); // remove broken file
  process.exit(1);
}

if (outputSize < 10_000) { // <10KB is suspiciously small
  console.error(`\nFATAL: Output file is suspiciously small (${outputSize} bytes): ${outputPath}`);
  process.exit(1);
}

// Verify video has expected tracks using ffprobe
try {
  const probeStreams = execSync(
    `ffprobe -v error -show_entries stream=codec_type -of csv=p=0 "${outputPath}"`,
    { encoding: 'utf-8', timeout: 10_000 }
  ).trim();

  const streams = probeStreams.split('\n').map(s => s.trim());
  const hasVideoStream = streams.includes('video');
  const hasAudioStream = streams.includes('audio');

  if (!hasVideoStream) {
    console.error(`\nFATAL: Output video has no video stream — compositing may have failed.`);
    process.exit(1);
  }

  if (hasAudioTrack && !hasAudioStream) {
    console.warn(`\n  ⚠ Output video has no audio stream despite voiceover being enabled.`);
  }

  // Verify duration is reasonable (at least 5s, no more than 5 minutes)
  const outputDuration = probeDuration(outputPath);
  if (outputDuration < 5) {
    console.error(`\nFATAL: Output video is only ${outputDuration.toFixed(1)}s — expected at least 5s.`);
    process.exit(1);
  }
  if (outputDuration > 300) {
    console.warn(`\n  ⚠ Output video is ${outputDuration.toFixed(0)}s — unusually long for a short-form video.`);
  }

  console.log('\n  ✓ Output validation passed');
  console.log(`    Streams: ${streams.join(', ')}`);
  console.log(`    Duration: ${outputDuration.toFixed(1)}s`);
} catch (err) {
  console.warn(`\n  ⚠ Could not validate output with ffprobe: ${err.message}`);
}

console.log(`\nComposite video complete!`);
console.log(`  Output: ${outputPath}`);
console.log(`  Size: ${(outputSize / 1024 / 1024).toFixed(1)}MB`);
console.log(`  Resolution: ${vp.width}x${vp.height}`);
console.log(`  Audio: ${hasAudioTrack ? 'voiceover' : 'silent'}`);
console.log(`  Subtitles: ${srtPath ? subtitleStyle : 'none'}`);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSrtTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${String(ms).padStart(3, '0')}`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Split text into short caption chunks of ~maxWords words each.
 * Produces TikTok-style bite-sized captions that don't cover the video.
 */
function splitIntoChunks(text, maxWords = 7) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(' '));
  }
  return chunks.length > 0 ? chunks : [text];
}

function wrapText(text, maxLen) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';

  for (const word of words) {
    if (current.length + word.length + 1 > maxLen && current) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);

  // Limit to 2 lines for readability on mobile
  if (lines.length > 2) {
    return [lines.slice(0, 2).join(' ')];
  }
  return lines;
}
