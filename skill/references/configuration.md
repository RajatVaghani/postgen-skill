# PostGen Configuration Reference

## postgen.config.json

Located at the root of the workspace path. Created by `scripts/setup.mjs`.

```json
{
  "workspace_path": "/absolute/path/to/workspace",
  "image_provider": "google-genai",
  "brand": {
    "name": "Brand Name",
    "primary_color": "#1e1b4b",
    "secondary_color": "#312e81",
    "accent_color": "#7c3aed",
    "font_family": "Inter",
    "tagline": "Optional tagline",
    "website": "https://example.com"
  },
  "cta_links": [
    { "title": "Visit Website", "url": "https://example.com" },
    { "title": "Download App", "url": "https://example.com/download" },
    { "title": "Contact Us", "url": "https://example.com/contact" }
  ],
  "defaults": {
    "slide_count": 7,
    "formats": ["instagram", "tiktok"],
    "output_type": "both",
    "template": "bold"
  },
  "video_provider": "gemini",
  "tts_provider": "openai",
  "gemini_api_key": "optional-fallback-key",
  "openai_api_key": "optional-fallback-key",
  "kling_access_key": "optional-kling-access-key",
  "kling_secret_key": "optional-kling-secret-key",
  "elevenlabs_api_key": "optional-elevenlabs-key"
}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `workspace_path` | Yes | Absolute path to the workspace root |
| `image_provider` | Yes | `"google-genai"` or `"openai"` |
| `brand.name` | Yes | Brand name displayed on slides |
| `brand.primary_color` | Yes | Hex color for primary brand color |
| `brand.secondary_color` | Yes | Hex color for secondary brand color |
| `brand.accent_color` | Yes | Hex color for accents, highlights, gradient |
| `brand.font_family` | Yes | Google Fonts family name (e.g. "Inter", "Poppins") |
| `brand.tagline` | No | Brand tagline |
| `brand.website` | No | Primary website URL shown on CTA slides |
| `cta_links` | No | Array of CTA links, each with `title` and `url`. Used on CTA slides to feature relevant links (e.g. website, app store, contact page) |
| `defaults.slide_count` | No | Default number of slides (default: 7) |
| `defaults.formats` | No | Array of output formats: `"instagram"` (4:5), `"tiktok"` (9:16). Legacy alias `"shorts"` also accepted. |
| `defaults.output_type` | No | Default output type: `"image"` (PNG only), `"video"` (PNG + MP4), or `"both"` (default). Can be overridden per post in slides.json. |
| `defaults.template` | No | Default template: `"bold"`, `"minimal"`, `"magazine"`, `"neon"`, `"stack"`, or `"clean"` |
| `video_provider` | No | Preferred video provider: `"gemini"` (Veo 3.1, 8s clips) or `"kling"` (10s clips). Auto-detected if omitted (tries Gemini first). Can also be set per-post in video.json. |
| `tts_provider` | No | Preferred TTS provider: `"openai"`, `"elevenlabs"`, or `"gemini"`. Auto-detected if omitted (tries OpenAI → ElevenLabs → Gemini). |
| `gemini_api_key` | No | Fallback API key for Google GenAI |
| `openai_api_key` | No | Fallback API key for OpenAI (also used for OpenAI TTS) |
| `kling_access_key` | No | Kling AI access key (for AI video + Kling TTS) |
| `kling_secret_key` | No | Kling AI secret key (paired with access key for JWT auth) |
| `elevenlabs_api_key` | No | ElevenLabs API key (for premium TTS voiceover) |

## API Key Resolution

### Image Generation Keys (order: OpenClaw → env → config)

1. **OpenClaw config**: `~/.openclaw/openclaw.json` → `env.GEMINI_API_KEY` / `env.OPENAI_API_KEY`
2. **Environment variables**: `GEMINI_API_KEY`, `GOOGLE_GENAI_API_KEY`, or `OPENAI_API_KEY`
3. **postgen.config.json**: `gemini_api_key` or `openai_api_key` fields

### Video Keys (order: config → env → OpenClaw)

**Gemini Veo** (uses same key as image generation — no extra credentials needed):
1. **postgen.config.json**: `gemini_api_key` or `google_genai_api_key`
2. **Environment variables**: `GEMINI_API_KEY`, `GOOGLE_GENAI_API_KEY`
3. **OpenClaw config**: same env var names

**Kling** (requires BOTH access key and secret key from the same tier):
1. **postgen.config.json**: `kling_access_key` + `kling_secret_key`
2. **Environment variables**: `KLING_ACCESS_KEY` + `KLING_SECRET_KEY`
3. **OpenClaw config**: same env var names

### TTS Keys (order: config → env → OpenClaw)

1. **postgen.config.json**: `openai_api_key`, `elevenlabs_api_key`, `gemini_api_key`
2. **Environment variables**: `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `GEMINI_API_KEY`
3. **OpenClaw config**: same env var names in `~/.openclaw/openclaw.json`

**Gemini TTS** uses the same API key as Gemini image/video generation — no extra credentials needed.

## Image Providers

### Google GenAI (Nano Banana Pro)
- Model: `gemini-3.1-flash-image-preview`
- Key names: `GEMINI_API_KEY` or `GOOGLE_GENAI_API_KEY`
- Outputs inline base64 image data

### OpenAI
- Model: `gpt-image-1.5`
- Key name: `OPENAI_API_KEY`
- Outputs URL or base64

## Supported Platforms

| Platform | Carousel (image) | Video | Format name |
|----------|-------------------|-------|-------------|
| Instagram | 1080x1350 (4:5) | 1080x1920 (9:16, Reels) | `instagram` / `tiktok` |
| TikTok | 1080x1920 (9:16) | 1080x1920 (9:16) | `tiktok` |
| YouTube | Not supported | 1080x1920 (9:16, Shorts) | `tiktok` |

## Output Formats

| Format | Viewport | Aspect Ratio | Use Cases |
|--------|----------|--------------|-----------|
| `instagram` | 1080x1350 | 4:5 | Instagram carousel (image) |
| `tiktok` | 1080x1920 | 9:16 | TikTok carousel (image), TikTok video, Instagram Reels (video), YouTube Shorts (video) |

Legacy alias: `shorts` is accepted and maps to the same 1080x1920 dimensions as `tiktok`.

## Output Types

| Type | What it produces | Typical use |
|------|-----------------|-------------|
| `image` | Individual PNG slide files | Swipeable carousels on Instagram, TikTok |
| `video` | PNG slides + MP4 slideshow | TikTok videos, Instagram Reels, YouTube Shorts |
| `both` | Same as `video` (default) | When user wants both formats |

Set `output_type` in `slides.json` per post, or set `defaults.output_type` in config for a global default.

## Templates

| Template | Style | Text Color | Background |
|----------|-------|------------|------------|
| `bold` | Dark, dramatic, cinematic | White on dark | Dark/saturated backgrounds |
| `minimal` | Clean, warm, modern | Dark on light | Mid-tone warm backgrounds with frosted overlay |
| `magazine` | Editorial left-aligned | White on dark | Dark editorial backgrounds |
| `neon` | Cyberpunk, glowing borders | White/neon on dark | Dark tech/abstract backgrounds |
| `stack` | Full-bleed, bottom-anchored | White on gradient | Vivid full-bleed backgrounds |
| `clean` | Duotone, minimal chrome | Dark on wash | Mid-tone backgrounds with color wash |

## Workspace Directory Structure

```
{workspace_path}/
├── postgen.config.json
├── assets/                        # Brand assets (logos, images)
│   └── logo.png
├── output/
│   └── {YYYY-MM-DD}/             # Date folder
│       └── {NNN}/                # Post number (zero-padded)
│           ├── slides.json                    # Carousel flow (image posts)
│           ├── video.json                     # Text-to-video flow (AI video posts)
│           ├── caption.txt              # Caption + hashtags for the post
│           ├── backgrounds/                  # AI-generated background images (carousel flow)
│           ├── backgrounds-compressed/
│           ├── voiceover/              # TTS audio files (when voiceover enabled)
│           │   └── slide-{N}.mp3 (or scene-{N}.mp3 for video.json)
│           ├── voiceover.json          # TTS manifest with timing
│           ├── ai-video/               # AI video clips (Gemini Veo or Kling, from video.json scenes)
│           │   └── scene-{N}.mp4
│           ├── ai-video.json           # AI video manifest with scene metadata
│           └── {format}/               # Only used for carousel flow (slides.json)
│               ├── slides/*.html
│               ├── final/*.png
│               ├── final/carousel-video.mp4    # Basic slideshow (when no AI video)
│               └── final/postgen-video.mp4     # Composited AI video + voiceover + subtitles
└── node_modules/                  # Installed dependencies
```

## System Dependencies

- **Node.js >= 18**: Required runtime
- **ffmpeg**: Background compression and video generation
- **Playwright Chromium**: HTML-to-PNG rendering (installed via `npx playwright install chromium`)
