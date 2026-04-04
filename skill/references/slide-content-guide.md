# Slide Content Guide

How to compose `slides.json` for the PostGen pipeline.

## Platform Specifications

### Instagram Carousel (Image)

| Spec | Value |
|------|-------|
| Resolution | 1080 x 1350 px |
| Aspect ratio | 4:5 (portrait) |
| Format name | `instagram` |
| Max slides | 20 per carousel |
| Max file size | 30 MB per image |
| File types | PNG (text-heavy), JPG (photos) |
| Safe zone | Keep text inside 1080 x 1220 px (bottom 130px is overlapped by Instagram UI) |
| Best slide count | 5-7 slides for saves/shares, 8-12 for detailed guides |

### TikTok Carousel (Image)

| Spec | Value |
|------|-------|
| Resolution | 1080 x 1920 px |
| Aspect ratio | 9:16 (portrait) |
| Format name | `tiktok` |
| Max slides | 35 per carousel (optimal: 5-10) |
| Max file size | 20 MB per image, 500 MB total |
| File types | JPG, PNG, WebP |
| Safe zone | Avoid bottom 15% (TikTok UI overlay for captions/buttons) |
| Algorithm priority | Swipe-through rate, dwell time (3-5s/slide), reverse swipes, completion rate |

### TikTok / Instagram Reels / YouTube Shorts (Video)

| Spec | Value |
|------|-------|
| Resolution | 1080 x 1920 px |
| Aspect ratio | 9:16 (portrait) |
| Format name | `tiktok` |
| File format | MP4 (H.264 video, AAC audio) |
| Frame rate | 30 fps |
| Max file size | 500 MB (TikTok), 4 GB (Reels), 2 GB (Shorts) |
| Max duration | 10 min (TikTok), 3 min (Reels), 3 min (Shorts) |
| Optimal duration | 15-60 seconds for best engagement |
| Safe zone | Avoid top 10% and bottom 15% for text/logos |

## slides.json Schema

```json
{
  "topic": "string",
  "hook": "The hook text for slide 1",
  "template": "bold",
  "output_type": "image",
  "formats": ["instagram", "tiktok"],
  "ai_video": false,
  "voiceover": false,
  "tts_provider": "openai",
  "slides": [
    {
      "slide_number": 1,
      "slide_type": "hook",
      "title": "HOOK TITLE HERE",
      "body": "",
      "background_prompt": "detailed image generation prompt",
      "voiceover_text": "Optional custom narration text for TTS (overrides auto-generated)"
    },
    {
      "slide_number": 2,
      "slide_type": "content",
      "title": "STEP TITLE",
      "body": "Body text under 30 words",
      "background_prompt": "detailed image generation prompt"
    },
    {
      "slide_number": 7,
      "slide_type": "cta",
      "title": "CTA TITLE",
      "body": "CTA body text",
      "background_prompt": "detailed image generation prompt"
    }
  ],
  "cta_text": "Main CTA text",
  "asset_placements": {
    "logo.png": { "slides": [1, 2, 3, 4, 5, 6, 7], "usage": "watermark" },
    "screenshot.png": { "slides": [3], "usage": "featured_image" }
  }
}
```

### Top-level fields

| Field | Required | Description |
|-------|----------|-------------|
| `output_type` | Yes | `"image"` (PNG carousel only), `"video"` (PNG + MP4), or `"both"` (default). Set based on user's answer to the format question. |
| `formats` | Yes | Array of format names: `"instagram"` (1080x1350, 4:5) and/or `"tiktok"` (1080x1920, 9:16). Set based on user's answer to the platform question. |
| `template` | **Yes** | `"bold"`, `"minimal"`, `"magazine"`, `"neon"`, `"stack"`, `"clean"`, or `"auto"`. **Always set this field.** Use the user's choice from Question 5, or `"auto"` if they said "Surprise me". When set to `"auto"`, the pipeline scans previous posts and picks a template that avoids the last 2 used. |
| `ai_video` | No | `true` to enable Kling AI video generation (image-to-video per slide). Requires Kling credentials. |
| `voiceover` | No | `true` to enable TTS voiceover narration. Auto-enabled for video when TTS credentials exist. |
| `tts_provider` | No | Override TTS provider: `"openai"` or `"elevenlabs"`. Auto-detected if omitted (tries OpenAI first). |

## Slide Types

- **hook** (slide 1): The scroll-stopper. Keep to 6-10 words. Use power words, numbers, or provocative statements. This slide determines whether viewers swipe — it must answer "Is this for me?" and "What will I get if I swipe?" For carousel (image) posts, the pipeline automatically adds a "SWIPE ›" hint at the bottom of this slide. For video posts, the swipe hint is omitted since the video auto-plays.
- **content** (slides 2 to N-1): One clear idea per slide. Short title (3-5 words), body under 30 words. Be specific and actionable. Target 3-5 seconds of dwell time per slide. Title casing varies by template (uppercase for bold/neon, sentence case for minimal/clean, etc.).
- **cta** (last slide): Call to action. Brand name, compelling text, and the website/CTA link (pulled from config). Include "follow for more", "save this", or a specific action.

### Slide count recommendations

| Platform | Optimal | Maximum |
|----------|---------|---------|
| Instagram | 5-7 slides (saves/shares), 8-12 (guides) | 20 |
| TikTok | 5-10 slides | 35 |
| Video (all) | 5-7 slides (15-30 sec video at 4s/slide) | 15 |

## Template Guidelines

**IMPORTANT: The agent MUST ask the user which template they want (Question 5 in SKILL.md).** The descriptions below help you explain the options and match the user's preference. If the user says "Surprise me", set `"template": "auto"` and the pipeline handles rotation automatically, avoiding the last 2 templates used. The 6 templates produce genuinely different visual layouts — different text positions, numbering styles, card shapes, and overall moods.

### Bold Template (`"bold"`)
- Dark, dramatic, cinematic mood
- White text over dark backgrounds — backgrounds MUST be dark enough for white text legibility
- Titles are uppercase, large, heavy weight
- Gradient accent lines in brand colors
- Large step numbers (01, 02, 03) on content slides beside the title
- Counter and logo in top-right corner
- Best for: Tech, cybersecurity, finance, fitness, authority-building content

### Minimal Template (`"minimal"`)
- Clean, warm, light aesthetic
- Dark text on frosted/light overlays — backgrounds should be warm mid-tones (dusty rose, sage green, warm taupe), never pure white or very light
- Titles are sentence case, refined
- Content slides use frosted glass cards with backdrop blur
- Small numbered circles for step indicators
- Subtle accent lines
- Best for: Lifestyle, wellness, food, beauty, self-improvement, coaching

### Magazine Template (`"magazine"`)
- Editorial/asymmetric layout — text is LEFT-ALIGNED, not centered
- Vertical accent bar on the hook slide, vertical "rail" line alongside content
- Step labels read "Step 01", "Step 02" in small uppercase tracking (not giant numbers)
- Divider lines between title and body
- Darker, moodier backgrounds with heavier blur and gradient
- Italic subtitle on hook, counter reads "1 of 7" style
- Best for: Thought leadership, educational deep-dives, brand storytelling, news

### Neon Template (`"neon"`)
- Cyberpunk aesthetic with glowing neon borders and text effects
- Decorative corner accents and neon frame border around entire slide
- Content slides use semi-transparent dark cards with neon border glow
- Step numbers glow in accent color, accompanied by a glowing dot
- All glow effects use brand accent color for consistency
- CTA has a neon-bordered button instead of solid color
- Best for: Gaming, tech startups, crypto, night-life, music, edgy brands

### Stack Template (`"stack"`)
- Full-bleed background with MINIMAL filtering (shows more of the AI image)
- Content anchored to the BOTTOM of the slide with a heavy gradient fade
- Hook has a colored tag label ("Featured") above the title
- Content slides use filled accent-color circles + "Step 01" label
- Counter shown in a frosted pill-shaped badge
- CTA uses a solid accent-color action button
- Best for: Travel, photography, real estate, food, visual-first content, product showcases

### Clean Template (`"clean"`)
- Ultra-minimal, centered typography with maximum breathing room
- Duotone color wash — brand accent color overlaid at low opacity on backgrounds
- NO step numbers on content slides — just a small colored dot above the title
- Thin 1px separator lines instead of thick gradient bars
- Light font weights (300) for titles on hook, creating an elegant look
- CTA uses an underlined text link instead of a button or box
- Best for: Luxury brands, minimalist aesthetics, art, architecture, fashion, premium services

## Background Prompt Patterns

All backgrounds are generated in **portrait orientation** automatically by the pipeline (the API enforces the correct aspect ratio based on the target format). You do NOT need to specify aspect ratio or orientation in the prompt — just focus on the scene description.

### Key principles

1. **Text goes on TOP of these images.** The background's job is to set a mood, not to be the focal point. Compose for readability — the text overlay must be legible.
2. **Visual coherence across slides.** Pick ONE visual theme for the entire post and vary it per slide — don't use completely different styles slide to slide. For example: if slide 1 is "neon-lit city at night", slides 2-6 should be variations of the same world (different angles, rooms, streets) not suddenly switching to "botanical garden."
3. **Match the template.** Each template applies its own CSS filters to backgrounds, but the raw image needs to cooperate:
   - **Bold / Neon**: Dark, dramatic, high-contrast scenes
   - **Minimal**: Warm, soft, mid-tone scenes (never pure white or dark)
   - **Magazine**: Dark/moody scenes — the heavy blur and overlay mean almost any dark image works
   - **Stack**: Vibrant, detailed scenes — this template shows MORE of the background with less filtering
   - **Clean**: Any scene works — the duotone color wash unifies the look — but avoid cluttered compositions
4. **Be specific and concrete.** "A beautiful background" produces garbage. "Close-up of raindrops on a dark glass window, reflecting violet and indigo neon signs" produces something usable.

### Prompt structure

Build every prompt with these 5 parts in order:

```
[1. Concrete subject/scene], [2. Color palette matching brand], [3. Visual style], [4. Mood/atmosphere], [5. Technical directives]
```

Part 5 (technical directives) should ALWAYS include: `no text, no letters, no words, no watermark, no logos, high quality, soft focus on details`

The "no text" directives are critical — image generation models love adding random text/lettering to images, which looks terrible behind our text overlay.

### Creating a visual thread

Before writing individual prompts, decide on a **visual world** for the post. This should relate to the post topic:

| Post topic | Visual world | Variations per slide |
|------------|-------------|---------------------|
| Productivity tips | Dark modern workspace | Different desk angles, monitors, coffee cups, notebooks |
| Morning routines | Golden hour indoor scenes | Bedroom, kitchen, window light, yoga mat, coffee steam |
| Fitness | Dark gym / athletic environment | Weights, running track, gym floor, water bottle, towel |
| Cooking / food | Kitchen surfaces and ingredients | Cutting board, spices, steam, plated food, kitchen tools |
| Tech / SaaS | Abstract digital / circuit | Data streams, glowing nodes, dark interfaces, glass surfaces |
| Finance | Dark luxury / corporate | Marble surfaces, gold accents, skyline through glass, leather |
| Travel | Destination-appropriate landscapes | Different angles of same environment, landmarks, local textures |
| Self-improvement | Calm contemplative spaces | Libraries, journals, sunrise views, meditation spaces, paths |

### Bold template prompts

Bold uses dark backgrounds with white text. The CSS adds a dark gradient overlay, but the raw image should already be **dark or deep-toned** so the overlay doesn't have to fight a bright image.

**DO:** Dark scenes, deep shadows, dramatic lighting, neon accents, moody atmosphere, cinematic color grading
**DON'T:** Bright scenes, white backgrounds, pastel colors, flat/even lighting

Examples for a "productivity tips" post:

- Hook slide: "Close-up of a dark modern desk with a single glowing monitor screen reflecting purple light onto the surface, deep indigo and black tones, cinematic photography style, focused moody atmosphere, no text, no letters, no words, no watermark, high quality, soft focus on details"
- Content slide 1: "Overhead view of a black notebook and gold pen on a dark walnut desk, single desk lamp casting warm focused light, deep purple ambient shadows, editorial photography style, intentional productive mood, no text, no letters, no words, no watermark, high quality, soft focus"
- Content slide 2: "Dark home office corner with floor-to-ceiling window showing city lights at night, violet and indigo reflections on glass, one warm desk lamp, cinematic photography, contemplative focused atmosphere, no text, no letters, no words, no watermark, high quality, soft focus"
- Content slide 3: "Close-up of hands typing on a mechanical keyboard, dark background, subtle purple LED underglow, shallow depth of field, cinematic photography, tech-focused mood, no text, no letters, no words, no watermark, high quality"
- Content slide 4: "Minimalist dark desk with a steaming cup of black coffee, morning light filtering through blinds creating shadow lines, deep indigo tones, still life photography, calm productive atmosphere, no text, no letters, no words, no watermark, high quality, soft focus"
- CTA slide: "Abstract dark gradient with subtle geometric shapes, glowing violet and indigo edges fading into deep black, 3D render style, premium sophisticated mood, no text, no letters, no words, no watermark, high quality"

### Minimal template prompts

Minimal uses frosted glass cards with dark text. The CSS adds a white semi-transparent overlay, but the raw image should be **warm mid-tones** — not too dark (card becomes invisible) and not too bright (washed out).

**DO:** Warm mid-tones (dusty rose, sage green, warm taupe, terracotta, soft gold), natural textures, soft natural light, flat lay style, editorial aesthetic
**DON'T:** Pure white, very light pastels, dark/dramatic scenes, high-contrast, neon colors

Examples for a "morning routines" post:

- Hook slide: "Soft morning light filtering through sheer linen curtains onto a warm wooden bedside table with a ceramic mug, dusty rose and warm cream tones, lifestyle photography style, serene peaceful morning mood, no text, no letters, no words, no watermark, high quality, soft focus on details"
- Content slide 1: "Flat lay of a white linen bed with a folded cream throw blanket and a small succulent on the nightstand, warm golden morning light, muted sage and cream palette, editorial lifestyle photography, calm restful mood, no text, no letters, no words, no watermark, high quality, soft focus"
- Content slide 2: "Close-up of water being poured into a clear glass on a light oak kitchen counter, warm morning sunlight, soft taupe and golden tones, still life photography, fresh healthy mood, no text, no letters, no words, no watermark, high quality, soft focus"
- Content slide 3: "A yoga mat rolled out on a light wooden floor next to a window with warm morning light, soft sage green and warm cream tones, lifestyle photography, mindful peaceful atmosphere, no text, no letters, no words, no watermark, high quality, soft focus"
- Content slide 4: "Close-up of an open journal with a wooden pen on a warm linen tablecloth, soft golden side lighting, warm taupe and cream palette, editorial still life photography, intentional reflective mood, no text, no letters, no words, no watermark, high quality, soft focus"
- CTA slide: "Soft abstract watercolor wash in warm terracotta and dusty rose tones blending into cream, smooth gradient texture, artistic illustration style, warm inviting mood, no text, no letters, no words, no watermark, high quality"

### Magazine template prompts

Magazine uses heavy blur and dark overlays, so backgrounds are mood-setters rather than detailed scenes. Dark, atmospheric images work best.

**DO:** Dark atmospheric scenes, moody lighting, editorial-style compositions, desaturated palettes
**DON'T:** Bright scenes, busy compositions, highly saturated colors

Examples for a "leadership lessons" post:

- Hook slide: "Dark wood-paneled library with leather chairs and a single reading lamp, warm amber and deep brown tones, editorial photography style, quiet authority mood, no text, no letters, no words, no watermark, high quality, soft focus on details"
- Content slide: "Close-up of a fountain pen resting on aged paper, dark mahogany desk surface, warm amber spotlight from above, desaturated editorial photography, contemplative thoughtful atmosphere, no text, no letters, no words, no watermark, high quality, soft focus"
- CTA slide: "Abstract dark charcoal texture with subtle warm amber light streaks, painterly style, sophisticated premium mood, no text, no letters, no words, no watermark, high quality"

### Neon template prompts

Neon applies a radial dark vignette and moderate blur. The glow effects are CSS-driven, so the background should be **dark with some color interest** — neon signs, city lights, or tech-inspired scenes work perfectly.

**DO:** Dark scenes with pops of vibrant color, neon signs, city night scenes, tech/circuit visuals, LED lighting
**DON'T:** Daytime scenes, warm/natural tones, minimal/flat images

Examples for a "tech tips" post:

- Hook slide: "Dark server room with rows of blinking blue and purple LED lights, deep black shadows, cyberpunk photography style, futuristic tech atmosphere, no text, no letters, no words, no watermark, high quality, soft focus on details"
- Content slide: "Close-up of a circuit board with glowing purple and cyan traces on dark substrate, macro photography, shallow depth of field, electric tech mood, no text, no letters, no words, no watermark, high quality, soft focus"
- CTA slide: "Abstract dark digital mesh with subtle glowing nodes in violet and electric blue, 3D render style, futuristic premium mood, no text, no letters, no words, no watermark, high quality"

### Stack template prompts

Stack is the most background-forward template — it shows more of the image with less filtering. **Image quality matters most here.** Compose for visual impact with the understanding that text will be at the bottom.

**DO:** Vibrant scenes, strong compositions, clear subjects, good contrast, the TOP of the image will be most visible
**DON'T:** Images where all detail is at the bottom (that's where text goes), flat/boring compositions

Examples for a "travel guide" post:

- Hook slide: "Aerial view of turquoise ocean water meeting white sand beach, palm tree shadows, vivid tropical colors, drone photography style, wanderlust adventure mood, no text, no letters, no words, no watermark, high quality"
- Content slide: "Colorful Mediterranean village cliffside with terracotta rooftops and bright blue sea in the distance, golden hour light, travel photography, warm adventurous atmosphere, no text, no letters, no words, no watermark, high quality"
- CTA slide: "Sun setting over calm ocean horizon with warm orange and pink gradient sky, silhouette of distant sailboat, landscape photography, peaceful aspirational mood, no text, no letters, no words, no watermark, high quality"

### Clean template prompts

Clean applies a brand-colored duotone wash that unifies any image. Focus on clean compositions with simple subjects — the duotone effect makes even busy images look cohesive, but simpler is better.

**DO:** Simple compositions, single subjects, clean lines, architectural, abstract textures, any color palette (the wash unifies it)
**DON'T:** Extremely cluttered scenes, very dark or very bright images

Examples for a "design principles" post:

- Hook slide: "Minimal architectural detail of a white concrete staircase with clean geometric shadows, neutral tones, architectural photography style, calm contemplative mood, no text, no letters, no words, no watermark, high quality, soft focus on details"
- Content slide: "Close-up of smooth marble surface with subtle veining, single green plant leaf resting on it, clean neutral palette, still life photography, refined sophisticated atmosphere, no text, no letters, no words, no watermark, high quality, soft focus"
- CTA slide: "Abstract smooth gradient in soft neutral tones with subtle paper texture, minimalist illustration style, elegant calm mood, no text, no letters, no words, no watermark, high quality"

### Common mistakes to avoid

- **Generic prompts**: "A beautiful background image" → produces random unusable results
- **Too busy/detailed**: "A desk with 15 items including a laptop, phone, coffee, notebook, pens, sticky notes, plant, headphones..." → cluttered mess that fights the text overlay
- **Forgetting "no text"**: Models will add random letters, words, or UI elements. ALWAYS include `no text, no letters, no words` in every prompt
- **Style inconsistency**: Mixing photographic and illustration styles within the same post → looks unprofessional
- **Ignoring brand colors**: The prompt should reference colors that complement the brand palette, not random colors
- **Too literal**: If the slide says "Wake up at 5am", don't prompt "a person waking up at 5am" — prompt an atmospheric scene (morning light, alarm clock, coffee) that evokes the feeling

## Asset Placements

**MANDATORY: You MUST check the workspace `assets/` folder before creating slides.json.** If ANY brand images exist there (logos, product shots, screenshots, etc.), you MUST include them in `asset_placements`. Users put files in that folder specifically so they appear in their content — never ignore them.

Run `ls <workspace-path>/assets/` and include every relevant file. Common patterns:

| Usage | Description | When to use |
|-------|-------------|-------------|
| `watermark` | Small logo overlay in top-right, place on ALL slides | Logo file exists (`logo.png`, `logo.svg`, etc.) |
| `featured_image` | Prominent image on a content slide | Product shots, screenshots, hero images |
| `background` | Full slide background replacement | Brand backgrounds, patterns, textures |
| `cta_logo` | Large logo on the CTA slide | Logo file exists — ALWAYS pair with watermark |

**Rules:**
- Logo → place as `watermark` on ALL slides AND as `cta_logo` on the last slide. Every single post should have the logo.
- Product/screenshot images → pick the most relevant content slide as `featured_image`.
- If multiple product images exist, spread them across different content slides.
- If the assets folder is empty, omit `asset_placements` entirely — do not include an empty object.

## CTA Links

Check `postgen.config.json` for a `cta_links` array. Each entry has `title` and `url`. When composing the CTA slide, pick the most relevant link(s) for the post topic and include them in the slide body or title. If no `cta_links` are configured, fall back to `brand.website`.
