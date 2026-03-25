/**
 * PostGen – Manifest validation between pipeline steps.
 *
 * Validates that intermediate manifests (ai-video/manifest.json, voiceover/manifest.json)
 * were produced correctly before the next pipeline step consumes them.
 *
 * Usage:
 *   import { validateAiVideoManifest, validateVoiceoverManifest } from './validate-manifests.mjs';
 *   const result = validateAiVideoManifest(postDir);
 *   if (!result.valid) { console.error(result.errors); process.exit(1); }
 */
import fs from 'fs';
import path from 'path';

/**
 * Validate the ai-video manifest after clip generation.
 *
 * @param {string} postDir
 * @returns {{ valid: boolean, errors: string[], warnings: string[], manifest: object|null }}
 */
export function validateAiVideoManifest(postDir) {
  const errors = [];
  const warnings = [];

  const manifestPath = path.join(postDir, 'ai-video', 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return { valid: false, errors: ['ai-video/manifest.json not found — clip generation may have failed'], warnings, manifest: null };
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch (err) {
    return { valid: false, errors: [`ai-video/manifest.json is not valid JSON: ${err.message}`], warnings, manifest: null };
  }

  // Check required fields
  if (!manifest.provider) errors.push('manifest missing "provider" field');
  if (!Array.isArray(manifest.clips)) errors.push('manifest missing "clips" array');
  else if (manifest.clips.length === 0) errors.push('manifest has 0 clips — all scenes failed');

  // Verify each clip file exists on disk
  if (Array.isArray(manifest.clips)) {
    for (const clip of manifest.clips) {
      if (!clip.file) {
        errors.push(`clip ${clip.clip}: missing "file" field`);
        continue;
      }
      const clipPath = path.join(postDir, 'ai-video', clip.file);
      if (!fs.existsSync(clipPath)) {
        errors.push(`clip ${clip.clip}: file "${clip.file}" not found on disk`);
      } else {
        const size = fs.statSync(clipPath).size;
        if (size < 1024) {
          errors.push(`clip ${clip.clip}: file "${clip.file}" is only ${size} bytes (likely corrupt)`);
        }
      }
    }
  }

  // Check for failures
  if (Array.isArray(manifest.failed) && manifest.failed.length > 0) {
    warnings.push(`${manifest.failed.length} clip(s) failed during generation: ${manifest.failed.map(f => `clip ${f.clip}`).join(', ')}`);
  }

  // Check scene count matches
  if (manifest.scenes_total && manifest.total_clips < manifest.scenes_total) {
    warnings.push(`Only ${manifest.total_clips}/${manifest.scenes_total} clips generated — some scenes may be missing`);
  }

  return { valid: errors.length === 0, errors, warnings, manifest };
}

/**
 * Validate the voiceover manifest after TTS generation.
 *
 * @param {string} postDir
 * @returns {{ valid: boolean, errors: string[], warnings: string[], manifest: object|null }}
 */
export function validateVoiceoverManifest(postDir) {
  const errors = [];
  const warnings = [];

  const manifestPath = path.join(postDir, 'voiceover', 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return { valid: false, errors: ['voiceover/manifest.json not found — TTS generation may have failed'], warnings, manifest: null };
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch (err) {
    return { valid: false, errors: [`voiceover/manifest.json is not valid JSON: ${err.message}`], warnings, manifest: null };
  }

  // Check for segments (new key) or slides (legacy key)
  const segments = manifest.segments || manifest.slides || [];
  if (segments.length === 0) {
    errors.push('voiceover manifest has 0 segments — TTS may have failed');
  }

  // Verify each audio file exists on disk
  for (const seg of segments) {
    if (!seg.file) {
      errors.push(`segment ${seg.segment || seg.slide}: missing "file" field`);
      continue;
    }
    const audioPath = path.join(postDir, 'voiceover', seg.file);
    if (!fs.existsSync(audioPath)) {
      errors.push(`segment ${seg.segment || seg.slide}: file "${seg.file}" not found on disk`);
    } else {
      const size = fs.statSync(audioPath).size;
      if (size < 100) {
        errors.push(`segment ${seg.segment || seg.slide}: file "${seg.file}" is only ${size} bytes (likely corrupt)`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings, manifest };
}
