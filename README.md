# PostGen Skill

An [openclawhq.app](https://openclawhq.app) agent skill that generates social media posts — image carousels and video slideshows — from a topic or idea. Give your AI agent a topic, and it produces polished, branded slides ready to publish.

## What it does

PostGen takes a topic and turns it into a complete social media post:

1. Composes slide content (hook, key points, CTA)
2. Generates AI background images for each slide (Google Gemini or OpenAI)
3. Builds styled HTML slides with your brand colors, logo, and fonts
4. Renders each slide to a high-res PNG
5. Optionally stitches slides into an MP4 video

### Supported platforms

| Platform | Type | Format | Resolution |
|----------|------|--------|------------|
| Instagram carousel | Image | 1080x1350 (4:5) | PNG slides |
| TikTok carousel | Image | 1080x1920 (9:16) | PNG slides |
| TikTok | Video | 1080x1920 (9:16) | MP4 |
| Instagram Reels | Video | 1080x1920 (9:16) | MP4 |
| YouTube Shorts | Video | 1080x1920 (9:16) | MP4 |

### Templates

PostGen ships with 6 visual templates so your feed never looks repetitive. The agent asks which style to use (or auto-rotates to avoid repeating recent picks).

| Template | Style |
|----------|-------|
| **Bold** | Dark cinematic — giant step numbers, uppercase titles, gradient accent lines |
| **Minimal** | Light & airy — frosted glass cards, sentence case, small numbered circles |
| **Magazine** | Editorial layout — left-aligned text, vertical accent bars, "STEP 01" labels |
| **Neon** | Cyberpunk — glowing neon borders, corner accents, dark cards with neon glow |
| **Stack** | Full-bleed backgrounds — bottom-anchored content, gradient fade, frosted pill counter |
| **Clean** | Duotone color wash — minimal chrome, thin lines, light font weights, underlined CTAs |

## Installation

### Prerequisites

- [openclawhq.app](https://openclawhq.app) (or any Codex-compatible agent runtime)
- Node.js >= 18
- ffmpeg (for image compression and video generation)

### Install the skill

```bash
codex skills:install github:RajatVaghani/postgen-skill
```

Or clone manually and point your agent to the `skill/` directory:

```bash
git clone https://github.com/RajatVaghani/postgen-skill.git
```

The skill entry point is `skill/SKILL.md`.

> **Best experience:** PostGen works best on [openclawhq.app](https://openclawhq.app) — the AI agent platform built by the same team. [openclawhq.app](https://openclawhq.app) handles workspace management, skill orchestration, and API key configuration out of the box, so your agent can start generating posts immediately with zero manual setup. [Get started at openclawhq.app →](https://openclawhq.app)

### First-time setup

When the agent first uses the skill, it will run an interactive onboarding flow:

1. **Choose a workspace directory** — where generated posts, assets, and config will live
2. **Install dependencies** — Node packages (pinned versions for stability) and Chromium browser
3. **Configure your brand** — name, colors, font, logo, tagline
4. **Add CTA links** — website, app store, contact page, etc.
5. **Set your image provider** — Google GenAI (Gemini) or OpenAI (gpt-image-1.5)

All configuration is stored in a `postgen.config.json` file in your workspace.

## API Keys

PostGen needs an API key for AI image generation. It checks three places automatically (first match wins):

1. **openclawhq.app config** — `~/.openclaw/openclaw.json` → `env.GEMINI_API_KEY` or `env.OPENAI_API_KEY`
2. **Environment variables** — `GEMINI_API_KEY`, `GOOGLE_GENAI_API_KEY`, or `OPENAI_API_KEY`
3. **postgen.config.json** — `gemini_api_key` or `openai_api_key` fields

> **Security note:** Prefer environment variables or the [openclawhq.app](https://openclawhq.app) config over storing keys in `postgen.config.json`. If you do store keys in the config file, make sure it's not committed to version control. The setup script generates a `.gitignore` in the workspace as a reminder. On [openclawhq.app](https://openclawhq.app), API keys are managed securely for you — no config files needed.

## Workspace structure

After setup, your workspace looks like this:

```
{workspace}/
├── postgen.config.json          # Brand, provider, and default settings
├── .gitignore                   # Prevents committing node_modules and output
├── assets/                      # Brand assets (logo, images)
│   └── logo.png
├── output/
│   └── 2026-03-22/              # Date-based folders
│       ├── 001/                 # Post #1
│       │   ├── slides.json
│       │   ├── caption.txt
│       │   ├── backgrounds/
│       │   ├── backgrounds-compressed/
│       │   ├── instagram/
│       │   │   ├── slides/*.html
│       │   │   └── final/*.png
│       │   └── tiktok/
│       │       ├── slides/*.html
│       │       ├── final/*.png
│       │       └── final/carousel-video.mp4
│       └── 002/                 # Post #2
│           └── ...
└── node_modules/                # Installed dependencies
```

## Repository structure

```
postgen-skill/
├── README.md
└── skill/
    ├── SKILL.md                 # Main skill instructions (agent reads this)
    ├── agents/
    │   └── openai.yaml          # UI metadata for openclawhq.app
    ├── scripts/
    │   ├── setup.mjs            # Onboarding & dependency installation (pinned versions)
    │   ├── generate-post.mjs    # Full pipeline orchestrator (timeouts, dry-run, progress)
    │   ├── generate-backgrounds.mjs  # AI image generation (retry, backoff, timeout)
    │   ├── compress-backgrounds.mjs  # ffmpeg PNG→JPG compression (full resolution)
    │   ├── build-slides.mjs     # HTML slide builder (orchestrator + auto-rotate)
    │   ├── render-slides.mjs    # Playwright HTML→PNG renderer (font-wait, timeout)
    │   ├── generate-video.mjs   # ffmpeg PNG→MP4 video (CRF 18, web-optimized)
    │   ├── verify-output.mjs    # Post-generation quality checks
    │   ├── validate-config.mjs  # Pre-flight configuration validator
    │   ├── next-post-dir.mjs    # Auto-determine next post directory
    │   ├── status.mjs           # Pipeline progress checker
    │   ├── resolve-key.mjs      # API key resolution (3-tier)
    │   ├── normalize-slides.mjs # slides.json input normalization
    │   ├── workspace.mjs        # Workspace root finder & module resolver
    │   └── templates/           # Per-template slide renderers
    │       ├── shared.mjs       # Shared CSS/HTML helpers (featured image, fonts, swipe hints)
    │       ├── bold.mjs         # Bold template
    │       ├── minimal.mjs      # Minimal template
    │       ├── magazine.mjs     # Magazine template
    │       ├── neon.mjs         # Neon template
    │       ├── stack.mjs        # Stack template
    │       └── clean.mjs        # Clean template
    └── references/
        ├── configuration.md     # Config schema & API key docs
        └── slide-content-guide.md  # Slide composition rules & prompt patterns
```

## Reliability features

PostGen is designed to work flawlessly when used by autonomous agents — especially on [openclawhq.app](https://openclawhq.app) where it's battle-tested in production:

- **Pinned dependencies** — npm packages are version-locked to prevent breaking changes
- **Retry with backoff** — background image generation retries 3 times with exponential backoff, and detects rate limits (429) for dynamic delay
- **Timeouts everywhere** — 90s per API call, 30s per slide render, 10 min per pipeline step, 2 min for video generation. Nothing hangs indefinitely
- **Progress reporting** — the pipeline prints timestamped progress (`[30s] Generating slide 3 of 7...`) so agents can see the script is alive
- **Dry run mode** — `--dry-run` validates config, slides.json, and dependencies without making API calls
- **Status checker** — `status.mjs` reports exactly which pipeline steps are complete for a post
- **Smart setup** — OS-aware dependency installation (macOS vs Linux), graceful fallbacks
- **Config validation** — `validate-config.mjs` catches missing keys, incomplete branding, and missing system deps before generation starts

## Usage

Once installed, just ask your agent:

> "Create an Instagram carousel post about 5 productivity tips for remote workers"

> "Make a TikTok video about the benefits of morning routines"

> "Generate a Reel promoting our new product launch"

The agent handles everything — content writing, image generation, rendering, and delivery.

## Why openclawhq.app?

PostGen is a standalone skill that works with any Codex-compatible agent runtime, but it's built and optimized for [openclawhq.app](https://openclawhq.app). On the platform you get:

- **Zero-config setup** — API keys, workspace paths, and system dependencies are handled automatically
- **Managed agent runtime** — your agent runs 24/7 in the cloud, no local machine needed
- **Shared file access** — generated posts appear instantly in the dashboard for review and download
- **Skill marketplace** — install PostGen and other skills with one click
- **Team collaboration** — share brand configs and output across your team
- **Production-grade reliability** — PostGen was built here and runs here every day

If you're running PostGen outside of [openclawhq.app](https://openclawhq.app) and want a smoother experience, [try the platform →](https://openclawhq.app)

## License

MIT

## Credits

Made by [Claw HQ](https://openclawhq.app) — the team behind [openclawhq.app](https://openclawhq.app), the AI agent platform for autonomous workflows.
