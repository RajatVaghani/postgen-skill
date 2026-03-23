/**
 * Normalize slides.json data to handle variations in field naming.
 * Agents may write slide_number, slideNumber, number, or omit it entirely.
 * This ensures a consistent shape before any script uses the data.
 */
import fs from 'fs';
import path from 'path';

export function loadAndNormalizeSlides(postDir) {
  const slidesPath = path.join(postDir, 'slides.json');
  if (!fs.existsSync(slidesPath)) {
    throw new Error(`slides.json not found at ${slidesPath}`);
  }

  const raw = JSON.parse(fs.readFileSync(slidesPath, 'utf-8'));

  // Handle both { slides: [...] } and bare array
  let slides = Array.isArray(raw) ? raw : raw.slides;
  if (!slides || !Array.isArray(slides)) {
    throw new Error('slides.json must contain a "slides" array or be an array itself');
  }

  // Normalize each slide
  slides = slides.map((s, idx) => {
    const num =
      s.slide_number ?? s.slideNumber ?? s.number ?? s.num ?? idx + 1;

    const slideType =
      s.slide_type ?? s.slideType ?? s.type ??
      (idx === 0 ? 'hook' : idx === slides.length - 1 ? 'cta' : 'content');

    const bgPrompt =
      s.background_prompt ?? s.backgroundPrompt ?? s.bg_prompt ?? s.prompt ?? '';

    const voiceoverText =
      s.voiceover_text ?? s.voiceoverText ?? s.narration ?? null;

    return {
      slide_number: Number(num),
      slide_type: String(slideType),
      title: String(s.title ?? ''),
      body: String(s.body ?? s.text ?? s.content ?? ''),
      background_prompt: String(bgPrompt),
      ...(voiceoverText ? { voiceover_text: String(voiceoverText) } : {}),
    };
  });

  // Validate
  for (const s of slides) {
    if (!s.title) {
      console.warn(`  Warning: slide ${s.slide_number} has no title`);
    }
  }

  const template = raw.template || null;
  const assetPlacements = raw.asset_placements ?? raw.assetPlacements ?? null;

  // Output configuration embedded in slides.json
  const fmtRaw = raw.formats ?? raw.format ?? null;
  const formats = fmtRaw
    ? (Array.isArray(fmtRaw) ? fmtRaw : [fmtRaw])
    : null;
  const outputType = raw.output_type ?? raw.outputType ?? null;

  return { slides, template, assetPlacements, formats, outputType, raw };
}
