# EaseVerse
EaseVerse - Compose Your Thoughts
🟡 WHY

(Hvorfor eksisterer EaseVerse?)

Creative ideas die in friction.

Songwriters don’t struggle because they lack talent.
They struggle because of:

Overthinking

Internal criticism

Blank page resistance

Mental noise

EaseVerse exists to remove the cognitive resistance between thought and expression.

We believe writing lyrics should feel like continuation — not confrontation.

🟠 HOW

(Hvordan gjør vi det annerledes?)

EaseVerse is built as a cognitive writing system, not just a text editor.

It:

Reduces decision fatigue

Guides structure without forcing it

Maintains creative momentum

Encourages progress over perfection

Supports flow state instead of interrupting it

We design for mental clarity, not feature overload.

🔵 WHAT

(Hva er det konkret?)

EaseVerse is a mobile app that helps songwriters:

Capture thoughts instantly

Structure ideas into verse

Maintain lyrical rhythm

Overcome writer’s block

Move from thought to lyric seamlessly

It is not an AI that writes for you.
It is a system that helps you write better — with less resistance.
## 📝 iPad Apple Pencil Lyrics Writing

**Transform your iPad into a professional lyrics notebook with Apple Pencil support.**

EaseVerse on iPad provides a natural handwriting experience for songwriters who prefer pen-on-paper creativity with digital convenience.

### ✨ Features

#### **1. Paper Mode (iPad Only)**
- **36 lined guides** (34px spacing) mimicking a physical notebook
- Toggle on/off for clean or guided writing
- Optimized for Apple Pencil handwriting alignment
- Automatic iPad detection (feature hidden on phones)

#### **2. iOS Scribble Integration**
- **Write naturally with Apple Pencil → Text appears automatically**
- Built-in iPadOS handwriting recognition (no setup required)
- Write "Verse 1", "Chorus", etc. and watch it convert to typed text
- Full sentence support with line breaks
- Auto-save after 700ms (no manual saving needed)

#### **3. Ink On - Visual Annotations**
- **Pen Tool**: 6 colors, 4 widths (2.2-6px), pressure-sensitive
- **Highlighter Tool**: Semi-transparent yellow for marking key phrases
- **Eraser Tool**: 4 sizes (16-46px) for precise or quick cleanup
- **Undo/Redo**: 60-state history for complete creative freedom
- **Stylus Priority**: Prevents accidental finger marks while writing
- **Pressure Sensitivity**: Stroke width adapts to pencil pressure (0.75x-1.55x)

### 🎯 How to Use

#### **Basic Workflow: Write Lyrics**
1. Open **EaseVerse** app on iPad
2. Navigate to **Lyrics** tab
3. See "Apple Pencil" badge → Tap **"Paper Mode On"**
4. Start writing with Apple Pencil
5. Watch handwriting convert to text automatically ✨

#### **Add Visual Annotations**
1. After writing text, tap **"Ink On"** toggle
2. Select tool:
   - **Pen**: Circle important words, draw breath marks
   - **Highlighter**: Mark hook lines, repeated phrases
   - **Eraser**: Remove unwanted annotations
3. Use toolbar to change colors, widths, toggle pressure sensitivity
4. Tap **Undo** (↶) / **Redo** (↷) to manage changes

#### **Section Headers (Auto-Detected)**
Write these headers and they'll be recognized in **Structure** tab:
- `Verse 1`, `Verse 2`, etc. (auto-numbered)
- `Pre-Chorus`
- `Chorus`
- `Bridge`
- `Final Chorus`
- `Intro`, `Outro`

#### **Pro Tips**
- **Stylus Priority ON** (default): Only Apple Pencil draws, finger scrolls
- **Pressure Sensitivity ON** (default): Natural handwriting feel
- **Paper Mode**: Use lined guides for neat handwriting
- **Scribble First, Ink Later**: Write all text first, then annotate

### 📱 Availability
- **Required**: iPad with Apple Pencil (any generation)
- **OS**: iPadOS with Scribble support (iOS 14+)
- **Hidden on**: iPhone (feature auto-detects device)

### 📋 Testing
See [docs/ipad-apple-pencil-test-guide.md](docs/ipad-apple-pencil-test-guide.md) for comprehensive testing instructions.

### 🎨 Real-World Example

**Write a song naturally:**
```
1. Paper Mode ON → See lined guides
2. Write with Apple Pencil: "Verse 1"
3. Write lyrics: "The melody starts to fade away..."
4. Text appears automatically (no typing!)
5. Ink On → Circle "fade away" with blue pen
6. Highlight "melody" with yellow highlighter
7. Switch to Structure tab → See Verse 1 recognized
8. Back to Lyrics → Write "Chorus"
9. Continue writing naturally...
```

**Result**: Professional lyrics with visual annotations, all saved automatically.

---
## Setup (Don’t Commit Keys)

Create a local `.env` (it is gitignored) and add:

```bash
# Required for TTS (pronunciation audio)
ELEVENLABS_API_KEY=...

# Optional (recommended for deterministic voices):
ELEVENLABS_VOICE_ID_FEMALE=...
ELEVENLABS_VOICE_ID_MALE=...

# Optional:
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
ELEVENLABS_TTS_CACHE_DIR=server_cache/elevenlabs_tts

# FREE AI Services (recommended):
GEMINI_API_KEY=...  # Free tier: 15 req/min, 1M/day - pronunciation coaching
# WHISPER_MODEL=Xenova/whisper-base.en  # Optional: defaults to whisper-base.en
# WHISPER_CACHE_DIR=~/.cache/whisper  # Optional: model cache location

# OpenAI (optional fallback when free services unavailable):
OPENAI_API_KEY=...  # Only needed as fallback

# For AI icon generation:
# AI_INTEGRATIONS_OPENAI_API_KEY=...
```

**Cost Breakdown:**
- ElevenLabs: $22/month (required for TTS)
- Gemini: FREE (1M requests/day)
- Whisper: FREE (runs locally)
- **Total: $22/month** (TTS only!)

## AI Icon Generation

Generate the full icon pack with an image model (instead of manual drawing):

```bash
npm run icons:ai
```

This updates the icon files already used in the interface under:

- `assets/images/icon-set/*.png`
- `assets/images/*.png` (record, stop, metronome, bpm, etc.)

## PWA (Web Installable App)

EaseVerse supports a Progressive Web App deployment from the root path (`/`).

### Build the PWA bundle

```bash
npm run web:build
```

### Serve it

Start the server as usual. If `web-build/index.html` exists, the app is available at:

- `GET /` (canonical SPA entry)
- `GET /app` and `GET /app/*` remain compatibility redirects to root routes

The service worker, offline fallback, and manifest are served from the root scope.

### Web Asset Optimization + Budget

Optimize large web-critical images before shipping:

```bash
npm run assets:optimize:web
```

`npm run web:build` now enforces a web budget check (`npm run web:budget`) that fails the build if:

- entry web bundle exceeds the configured limit
- optimized web icon assets are missing or exceed per-file limits

## External API (For Other Systems)

EaseVerse now exposes a versioned integration API at ` /api/v1 `.

### Recommended Environment Variables

- `EXTERNAL_API_KEY`: Optional global key for all `/api/v1/*` routes.
- `CORS_ALLOW_ORIGINS`: Comma-separated list of allowed origins for browser clients.
  - Example: `https://app.example.com,https://admin.example.com`
- `CORS_ALLOW_ALL`: Set `true` only for trusted private environments.

### Discovery and Health

- `GET /api/v1` returns the API catalog.
- `GET /api/v1/openapi.json` returns an OpenAPI-compatible spec.
- `GET /api/v1/health` returns API health.

### Main Integration Endpoints

- `POST /api/v1/tts`
- `POST /api/v1/pronounce`
- `POST /api/v1/session-score`
- `POST /api/v1/collab/lyrics`
- `GET /api/v1/collab/lyrics`
- `POST /api/v1/collab/protools`
- `GET /api/v1/collab/protools`
- `GET /api/v1/collab/protools/:externalTrackId`
- `WS /api/v1/ws` (realtime lyric updates)

### Pro Tools Companion Sync (Phase 1)

Use these endpoints for a desktop Pro Tools companion bridge.

- `POST /api/v1/collab/protools` upserts DAW sync payloads for one `externalTrackId`.
- `GET /api/v1/collab/protools` lists sync payloads (optional filters: `projectId`, `source`, `externalTrackId`).
- `GET /api/v1/collab/protools/:externalTrackId` gets latest payload for one track (optional `projectId`).

Payload shape (high level):

- `externalTrackId` (required)
- `projectId` (optional)
- `source` (optional; defaults to `protools-companion`)
- `bpm` (optional)
- `markers[]` (`id`, `label`, `positionMs`, optional `sectionType`, `color`)
- `takeScores[]` (`id`, optional score fields + timing consistency)
- `pronunciationFeedback[]` (`id`, `word`, optional `tip`, `phonetic`, severity)

Example upsert:

```bash
curl -X POST "https://YOUR_DOMAIN/api/v1/collab/protools" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_EXTERNAL_API_KEY" \
  -d '{
    "externalTrackId": "pt-track-001",
    "projectId": "album-a",
    "source": "protools-companion",
    "bpm": 120,
    "markers": [
      { "id": "m1", "label": "Verse 1", "positionMs": 12000, "sectionType": "verse" }
    ],
    "takeScores": [
      {
        "id": "take-01",
        "takeName": "Lead Vox Comp",
        "textAccuracy": 88,
        "pronunciationClarity": 84,
        "timingConsistency": "medium",
        "overallScore": 86
      }
    ],
    "pronunciationFeedback": [
      {
        "id": "pf-1",
        "word": "beautiful",
        "tip": "Keep the t crisp, then lighten the l",
        "severity": "medium",
        "positionMs": 17500,
        "takeId": "take-01"
      }
    ]
  }'
```

### Realtime Lyrics WebSocket

Connect to:

`wss://YOUR_DOMAIN/api/v1/ws?apiKey=YOUR_EXTERNAL_API_KEY&source=creatorhub&projectId=YOUR_PROJECT_ID`

Server emits `collab_lyrics_updated` events whenever `POST /api/v1/collab/lyrics` upserts a draft.

### Example

```bash
curl -X GET "https://YOUR_DOMAIN/api/v1/health" \
  -H "x-api-key: YOUR_EXTERNAL_API_KEY"
```

```bash
curl -X POST "https://YOUR_DOMAIN/api/v1/pronounce" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_EXTERNAL_API_KEY" \
  -d '{"word":"melody","context":"A melody that sets me free"}'
```
