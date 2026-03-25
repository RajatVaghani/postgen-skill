# PostGen Video Content Guide

Read this guide BEFORE creating `video.json`. It contains content strategy, formats, hook patterns, tone guidance, and quality checks that produce scroll-stopping short-form video.

This guide is brand-agnostic. Adapt all examples to the brand, product, and audience defined in `postgen.config.json`.

---

## Content Formats

Every video should follow ONE of these proven formats. **Rotate between them** — never produce the same format twice in a row if generating multiple posts.

### 1. Myth vs Reality
Debunk a common misconception related to your brand's domain. Open with the myth stated as fact, then flip it.
- Hook: "You've been told X your whole life. Here's why that's wrong."
- Structure: Scene 1 = myth stated confidently → Scene 2-3 = the reality with evidence → Scene 4 = what to do instead → Scene 5 = takeaway
- Example topics: "You need 8 glasses of water a day" (health brand), "More RAM = faster computer" (tech brand), "Cold weather gives you a cold" (wellness brand)

### 2. Did You Know?
Lead with a surprising or shocking fact that makes the viewer feel like they've been missing something.
- Hook: "90% of people don't know this about [topic]." / "This one stat will change how you think about [topic]."
- Structure: Scene 1 = the shocking fact → Scene 2-3 = why it matters, what's really happening → Scene 4 = what this means for the viewer → Scene 5 = call to awareness
- Example topics: "Your phone screen is dirtier than a toilet seat" (hygiene brand), "The average person wastes 2 hours a day on context switching" (productivity brand)

### 3. 3 Signs That...
Warning signs or red flags the viewer can check immediately. Creates urgency and self-assessment.
- Hook: "If this is happening to you, your [thing] is compromised." / "3 signs you're making this mistake right now."
- Structure: Scene 1 = hook + context → Scene 2-4 = one sign per scene with visual metaphor → Scene 5 = what to do about it
- Example topics: "3 signs your morning routine is sabotaging your day" (lifestyle brand), "3 signs your code is about to break in production" (dev tools brand)

### 4. What Happens When...
Visual storytelling that walks through a process or consequence the viewer can't normally see.
- Hook: "This is what actually happens when you [common action]." / "Watch what happens the moment you [do X]."
- Structure: Scene 1 = setup the scenario → Scene 2-4 = step-by-step walkthrough with dramatic visuals → Scene 5 = the consequence or solution
- Example topics: "What happens when you skip sunscreen for a week" (skincare brand), "What happens to your order after you click 'buy'" (ecommerce brand)

### 5. This Is Why...
Explain a relatable frustration and reveal the hidden cause. Viewer feels understood.
- Hook: "This is why your [thing] is so slow." / "Ever wonder why [annoying thing] keeps happening? Here's the real reason."
- Structure: Scene 1 = the frustration everyone relates to → Scene 2-3 = the hidden cause revealed → Scene 4 = how to fix it → Scene 5 = result after fixing
- Example topics: "This is why your wifi dies in the bedroom" (tech brand), "This is why your budget never works" (finance brand)

### 6. POV:
First-person scenario the viewer immediately relates to. Creates emotional connection.
- Hook: "POV: You just found out [shocking thing]." / "POV: You realize [relatable moment]."
- Structure: Scene 1 = the POV moment → Scene 2-3 = the realization unfolds → Scene 4 = the consequence or action → Scene 5 = resolution
- Example topics: "POV: You realize you've been pronouncing this wrong your entire career" (education brand), "POV: Your side project just got its first paying customer" (startup brand)

### 7. Stop Doing This
Call out a common mistake directly. Feels like personal advice from a friend.
- Hook: "Stop doing this with your [thing]. Seriously." / "If you're still doing X in 2026, we need to talk."
- Structure: Scene 1 = the mistake stated directly → Scene 2-3 = why it's bad, what it's costing you → Scene 4 = what to do instead → Scene 5 = the difference it makes
- Example topics: "Stop charging your phone overnight" (tech brand), "Stop stretching before your workout" (fitness brand)

---

## Hook Rules (First 2 Seconds)

The hook is the single most important part of the video. If the first line of voiceover doesn't stop the scroll, nothing else matters.

**Strong hook patterns:**
- Start with a bold claim: "Your morning coffee is sabotaging your productivity."
- Start with a statistic: "90% of people get this completely wrong."
- Start with a personal result: "I changed one thing and doubled my output in a week."
- Start with a challenge: "I bet you can't watch this without checking your phone."
- Start with a contradiction: "Everything you've been told about [topic] is backwards."
- Start with urgency: "If you're doing [common thing] right now, stop."

**NEVER open with:**
- "In today's video..."
- "Hey guys, welcome back..."
- "So today we're going to talk about..."
- "What's up everyone..."
- Any generic greeting or preamble

The first word of voiceover should be the start of the hook — no warm-up.

---

## Tone & Voice

**Target tone:** Conversational, slightly urgent, like you're telling a friend something important over coffee. Not corporate. Not salesy. Not robotic.

**Do:**
- Use "you" and "your" — speak directly to the viewer
- Use contractions (you're, don't, can't, it's)
- Include mild emotional triggers (curiosity, surprise, concern)
- Keep sentences short and punchy for voiceover
- End scenes on cliffhangers to keep viewers watching ("But here's the part nobody talks about...")

**Don't:**
- Use jargon unless you immediately explain it
- Sound like a press release or corporate blog
- Use passive voice ("mistakes were made" → "you're making this mistake")
- Pad with filler words or hedging language
- Be preachy or condescending

---

## Visual Style Consistency

AI video generators create each clip independently. Without explicit style direction, clips will have different actors, color grades, lighting, and camera styles — making the final video feel disjointed.

**Use the `visual_style` field in video.json** to define a consistent look across all scenes. This style description gets automatically prepended to every scene prompt, ensuring coherent visuals throughout the video.

A good `visual_style` should define:
- **Color grading/palette**: "warm amber tones", "cool blue-teal color grade", "high contrast cinematic"
- **Camera style**: "handheld documentary feel", "smooth gimbal tracking", "static locked-off shots"
- **Lighting mood**: "soft diffused natural light", "moody dramatic side-lighting", "golden hour warmth"
- **Subject consistency**: If a person appears across scenes, describe them once here: "young South Asian man in his late 20s with short dark hair and trimmed beard, wearing a fitted navy henley"
- **Overall aesthetic**: "clean modern minimalist", "gritty urban documentary", "polished commercial look"

**Example:**
```json
"visual_style": "Cinematic commercial look. Warm golden color grade with soft shadows. A confident South Asian man in his late 20s with short styled hair, wearing a casual fitted grey t-shirt. Smooth slow camera movements, shallow depth of field, natural daylight."
```

This ensures the same person, same lighting, and same color palette across all 5 scenes.

## Scene Prompt Rules (AI Video Generation)

Scene prompts in `video.json` describe what the AI video generator renders visually. These are NOT voiceover scripts — they're visual directions. The `visual_style` is automatically prepended to each prompt, so scene prompts should focus on what's UNIQUE to that scene (the action, location, camera angle) — not repeat the overall style.

**CRITICAL: AI video generators CANNOT render text accurately.** Never include brand names, logos, URLs, readable text, or specific words in scene prompts. The AI will mangle them into gibberish.

**Good scene prompts — describe VISUALS ONLY:**
- "Dramatic close-up of a smartphone screen glowing in a dark room, abstract colorful light reflections on the user's face, moody blue and purple lighting, cinematic shallow depth of field"
- "Wide aerial shot of a sprawling city at night, glowing network connections linking buildings like a web, neon light trails, cyberpunk atmosphere"
- "Person sitting at a minimalist desk, morning sunlight streaming through large windows, camera slowly pushing in on their focused expression, warm golden tones, shallow depth of field"
- "Abstract particle animation — thousands of tiny glowing orbs converging into a geometric shape, dark background, satisfying magnetic movement, electric blue and white palette"
- "Time-lapse of a workspace transforming from cluttered chaos to clean organization, top-down camera angle, soft natural lighting, calming color grading"

**Bad scene prompts — these will fail:**
- "Text on screen saying 'You Need This'" ← AI can't render readable text
- "Show the brand logo spinning in 3D" ← AI mangles logos and brand marks
- "Website URL displayed prominently" ← will be garbled nonsense
- "Person holding phone" ← too vague, no mood/lighting/style direction

**Tips for cinematic prompts:**
- Include camera direction: "tracking shot", "slow push-in", "close-up", "wide establishing shot", "bird's eye view", "dolly zoom"
- Include lighting: "moody blue lighting", "golden hour warmth", "neon glow", "high contrast shadows", "soft diffused light"
- Include mood/atmosphere: "tense", "mysterious", "empowering", "urgent", "calming", "energetic"
- Include color palette: "deep blues and purples", "warm amber tones", "stark black and white with accent color", "pastel and airy"
- Include movement: "particles flowing", "camera orbiting around", "slow zoom into", "smooth dolly forward", "liquid morphing"

---

## Voiceover Text Rules

Voiceover text is what the narrator says during each scene. This IS where brand mentions, specific claims, and persuasive language belong.

- **Brand mentions are welcome here** — voiceover is text-to-speech audio, not AI-generated video, so names and words will be pronounced correctly
- Write in natural speech patterns, not bullet points
- **WORD COUNT MATTERS:** Natural speech pace is ~3 words/second. Match your word count to the clip duration of your chosen provider:
  - **Kling** (10s clips): aim for **25-30 words per scene** (3-4 sentences)
  - **Gemini Veo** (8s clips): aim for **20-24 words per scene** (2-3 sentences)
  - If you write too few words, the voiceover gets slowed down and sounds unnaturally draggy. Too many words = rushed speech.
- Vary sentence length — mix short punchy lines with slightly longer ones
- End scene voiceover on transitions: "But here's the thing..." / "And that's where it gets interesting..." / "So what can you do about it?"
- The final content scene (before CTA) should have a clear conclusion or call to awareness
- **Total voiceover word targets by provider:**
  - **Kling** (5 × 10s = 50s video): aim for **125-150 words total**
  - **Gemini Veo** (5 × 8s = 40s video): aim for **100-120 words total**
  - Too few words = speech gets slowed down and sounds draggy. Too many = rushed. Match the provider's duration.

---

## Quality Checklist

Before finalizing `video.json`, verify:

1. **Hook test:** Read the first scene's voiceover_text out loud. Would YOU stop scrolling?
2. **Emotional trigger:** Is there a clear emotion driving the video? (curiosity, fear, surprise, anger, relief)
3. **Value delivery:** Does the viewer learn something, realize something, or feel something by the end?
4. **Visual style set?** Does video.json have a `visual_style` field defining color grade, lighting, subject appearance, and camera style? Without this, clips will look disjointed.
5. **Scene variety:** Are the scene prompts varied in LOCATION and ACTION? (not all "person at desk" — mix close-ups, wide shots, different settings). The `visual_style` handles consistency; scene prompts handle variety.
6. **Flow:** Do the scenes progress logically? Hook → develop → evidence/story → conclusion → CTA
7. **Brand safety:** Zero text/logos/brand names in scene prompts. Brand mentions only in voiceover_text and CTA.
7. **Scene count:** 5 scenes + CTA end-card. Clip duration is fixed per provider (8s Gemini, 10s Kling).
8. **Voiceover pacing:** Match word count to clip duration (~3 words/sec). Kling (10s): ~25-30 words/scene, ~125-150 total. Gemini Veo (8s): ~20-24 words/scene, ~100-120 total. Too few = draggy slow speech. Too many = rushed.
