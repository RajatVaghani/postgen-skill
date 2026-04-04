/**
 * PostGen – video.json schema validation.
 *
 * Validates the structure and content of video.json before any API calls are made.
 * Catches common mistakes that would waste API credits (missing fields, wrong types,
 * empty scenes, missing voiceover_text, etc.).
 *
 * Can be used standalone:
 *   node validate-video-json.mjs <post-dir>
 *
 * Or imported:
 *   import { validateVideoSpec } from './validate-video-json.mjs';
 *   const { valid, errors, warnings } = validateVideoSpec(videoSpec);
 */
import fs from 'fs';
import path from 'path';

const VALID_PROVIDERS = ['gemini', 'kling', 'grok'];
const VALID_ASPECT_RATIOS = ['9:16', '16:9', '1:1'];
const VALID_TTS_PROVIDERS = ['openai', 'elevenlabs', 'gemini'];
const VALID_MODES = ['std', 'pro'];

const WORDS_PER_SEC = 3;

/**
 * Validate a parsed video.json spec object.
 *
 * @param {object} spec  Parsed video.json content
 * @param {object} opts  Optional: { provider } to enable provider-specific checks
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateVideoSpec(spec, opts = {}) {
  const errors = [];
  const warnings = [];

  if (!spec || typeof spec !== 'object') {
    return { valid: false, errors: ['video.json is not a valid JSON object'], warnings };
  }

  // --- Required: scenes array ---
  if (!Array.isArray(spec.scenes)) {
    errors.push('Missing or invalid "scenes" array');
  } else if (spec.scenes.length === 0) {
    errors.push('"scenes" array is empty — at least 1 scene is required');
  } else {
    // Validate each scene
    spec.scenes.forEach((scene, i) => {
      const label = `scenes[${i}]`;

      if (!scene || typeof scene !== 'object') {
        errors.push(`${label}: not a valid object`);
        return;
      }

      // scene_number
      if (scene.scene_number == null) {
        warnings.push(`${label}: missing "scene_number" — will default to index`);
      } else if (typeof scene.scene_number !== 'number') {
        errors.push(`${label}: "scene_number" must be a number, got ${typeof scene.scene_number}`);
      }

      // prompt (required)
      if (!scene.prompt || typeof scene.prompt !== 'string') {
        errors.push(`${label}: missing or empty "prompt" — the AI video generator needs visual descriptions`);
      } else if (scene.prompt.length < 20) {
        warnings.push(`${label}: prompt is very short (${scene.prompt.length} chars) — may produce poor visuals`);
      }

      // voiceover_text (required if voiceover is enabled)
      if (spec.voiceover !== false) {
        if (!scene.voiceover_text || typeof scene.voiceover_text !== 'string') {
          errors.push(`${label}: missing "voiceover_text" — required when voiceover is enabled`);
        } else {
          // Word count checks
          const wordCount = scene.voiceover_text.split(/\s+/).filter(Boolean).length;
          const provider = opts.provider || spec.video_provider || '';
          const clipDuration = provider === 'gemini' ? 8 : provider === 'kling' ? 10 : 8;
          const idealWords = Math.round(clipDuration * WORDS_PER_SEC);
          const maxWords = Math.round(idealWords * 1.3);
          const minWords = Math.round(idealWords * 0.5);

          if (wordCount > maxWords) {
            warnings.push(`${label}: voiceover_text has ${wordCount} words (ideal: ${idealWords} for ${clipDuration}s clip) — speech may be fast`);
          } else if (wordCount < minWords) {
            warnings.push(`${label}: voiceover_text has only ${wordCount} words (ideal: ${idealWords} for ${clipDuration}s clip) — speech may sound draggy`);
          }
        }
      }

      // Check for text/logos/brand names in scene prompts (common mistake)
      const promptLower = (scene.prompt || '').toLowerCase();
      const textPatterns = [
        /text (on|saying|reading|that says)/i,
        /logo/i,
        /brand name/i,
        /url|website|\.com/i,
        /\btext\b.*\bdisplay/i,
      ];
      for (const pat of textPatterns) {
        if (pat.test(scene.prompt)) {
          warnings.push(`${label}: prompt may contain text/logo references — AI video can't render readable text`);
          break;
        }
      }
    });

    // Check for 5 scenes (recommended)
    if (spec.scenes.length !== 5) {
      warnings.push(`${spec.scenes.length} scenes found (recommended: 5 for optimal pacing)`);
    }
  }

  // --- Optional field type checks ---
  if (spec.topic != null && typeof spec.topic !== 'string') {
    errors.push('"topic" must be a string');
  }

  if (spec.video_provider != null) {
    if (typeof spec.video_provider !== 'string') {
      errors.push('"video_provider" must be a string');
    } else if (!VALID_PROVIDERS.includes(spec.video_provider)) {
      errors.push(`"video_provider" must be one of: ${VALID_PROVIDERS.join(', ')} — got "${spec.video_provider}"`);
    }
  }

  if (spec.aspect_ratio != null) {
    if (typeof spec.aspect_ratio !== 'string') {
      errors.push('"aspect_ratio" must be a string');
    } else if (!VALID_ASPECT_RATIOS.includes(spec.aspect_ratio)) {
      errors.push(`"aspect_ratio" must be one of: ${VALID_ASPECT_RATIOS.join(', ')} — got "${spec.aspect_ratio}"`);
    }
  }

  if (spec.mode != null) {
    if (typeof spec.mode !== 'string') {
      errors.push('"mode" must be a string');
    } else if (!VALID_MODES.includes(spec.mode)) {
      warnings.push(`"mode" is "${spec.mode}" — expected one of: ${VALID_MODES.join(', ')}`);
    }
  }

  if (spec.tts_provider != null) {
    if (typeof spec.tts_provider !== 'string') {
      errors.push('"tts_provider" must be a string');
    } else if (!VALID_TTS_PROVIDERS.includes(spec.tts_provider)) {
      errors.push(`"tts_provider" must be one of: ${VALID_TTS_PROVIDERS.join(', ')} — got "${spec.tts_provider}"`);
    }
  }

  if (spec.voiceover != null && typeof spec.voiceover !== 'boolean') {
    errors.push('"voiceover" must be a boolean');
  }

  // visual_style check
  if (!spec.visual_style) {
    warnings.push('Missing "visual_style" — clips may look inconsistent (different actors, lighting, colors)');
  } else if (typeof spec.visual_style !== 'string') {
    errors.push('"visual_style" must be a string');
  } else if (spec.visual_style.length < 30) {
    warnings.push('"visual_style" is very short — include color grade, camera style, subject description, and lighting');
  }

  // negative_prompt
  if (spec.negative_prompt != null && typeof spec.negative_prompt !== 'string') {
    errors.push('"negative_prompt" must be a string');
  }

  // CTA validation
  if (spec.cta != null) {
    if (typeof spec.cta !== 'object') {
      errors.push('"cta" must be an object with "title" and optional "body"');
    } else {
      if (!spec.cta.title || typeof spec.cta.title !== 'string') {
        errors.push('"cta.title" is required and must be a string');
      }
      if (spec.cta.body != null && typeof spec.cta.body !== 'string') {
        errors.push('"cta.body" must be a string');
      }
    }
  }

  // Total word count check
  if (Array.isArray(spec.scenes) && spec.voiceover !== false) {
    const totalWords = spec.scenes.reduce((sum, s) => {
      return sum + (s.voiceover_text || '').split(/\s+/).filter(Boolean).length;
    }, 0);
    const provider = opts.provider || spec.video_provider || '';
    const clipDuration = provider === 'gemini' ? 8 : provider === 'kling' ? 10 : 8;
    const totalTarget = spec.scenes.length * clipDuration * WORDS_PER_SEC;
    const maxTotal = Math.round(totalTarget * 1.3);
    const minTotal = Math.round(totalTarget * 0.5);

    if (totalWords > maxTotal) {
      warnings.push(`Total voiceover: ${totalWords} words (target: ~${totalTarget} for ${spec.scenes.length}×${clipDuration}s) — speech may be fast`);
    } else if (totalWords < minTotal) {
      warnings.push(`Total voiceover: ${totalWords} words (target: ~${totalTarget} for ${spec.scenes.length}×${clipDuration}s) — speech may sound slow`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// CLI mode
// ---------------------------------------------------------------------------

const isCLI = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isCLI) {
  const postDir = path.resolve(process.argv[2] || '.');
  const videoJsonPath = path.join(postDir, 'video.json');

  if (!fs.existsSync(videoJsonPath)) {
    console.error(`FATAL: video.json not found at ${videoJsonPath}`);
    process.exit(1);
  }

  let spec;
  try {
    spec = JSON.parse(fs.readFileSync(videoJsonPath, 'utf-8'));
  } catch (err) {
    console.error(`FATAL: video.json is not valid JSON: ${err.message}`);
    process.exit(1);
  }

  const { valid, errors, warnings } = validateVideoSpec(spec);

  if (warnings.length > 0) {
    console.log(`\n  WARNINGS (${warnings.length}):`);
    for (const w of warnings) console.log(`    ⚠ ${w}`);
  }

  if (errors.length > 0) {
    console.error(`\n  ERRORS (${errors.length}):`);
    for (const e of errors) console.error(`    ✗ ${e}`);
    console.error(`\nvideo.json validation FAILED — fix the errors above before generating.`);
    process.exit(1);
  }

  console.log(`\n  ✓ video.json is valid (${spec.scenes?.length || 0} scenes)`);
  if (warnings.length > 0) console.log(`    ${warnings.length} warning(s) — review above.`);
  process.exit(0);
}
