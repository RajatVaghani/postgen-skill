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
  "gemini_api_key": "optional-fallback-key",
  "openai_api_key": "optional-fallback-key"
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
| `defaults.template` | No | Default template: `"bold"` or `"minimal"` |
| `gemini_api_key` | No | Tier 3 fallback API key for Google GenAI |
| `openai_api_key` | No | Tier 3 fallback API key for OpenAI |

## API Key Resolution

Keys are resolved in this order (first found wins):

1. **OpenClaw config**: `~/.openclaw/openclaw.json` (or `$OPENCLAW_HOME/openclaw.json`) -> `env.GEMINI_API_KEY` / `env.OPENAI_API_KEY`
2. **Environment variables**: `GEMINI_API_KEY`, `GOOGLE_GENAI_API_KEY`, or `OPENAI_API_KEY`
3. **postgen.config.json**: `gemini_api_key` or `openai_api_key` fields

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

## Workspace Directory Structure

```
{workspace_path}/
├── postgen.config.json
├── assets/                        # Brand assets (logos, images)
│   └── logo.png
├── output/
│   └── {YYYY-MM-DD}/             # Date folder
│       └── {NNN}/                # Post number (zero-padded)
│           ├── slides.json
│           ├── caption.txt              # Caption + hashtags for the post
│           ├── backgrounds/
│           ├── backgrounds-compressed/
│           └── {format}/
│               ├── slides/*.html
│               └── final/*.png
└── node_modules/                  # Installed dependencies
```

## System Dependencies

- **Node.js >= 18**: Required runtime
- **ffmpeg**: Background compression and video generation
- **Playwright Chromium**: HTML-to-PNG rendering (installed via `npx playwright install chromium`)
