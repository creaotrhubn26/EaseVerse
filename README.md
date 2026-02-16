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

## Setup (Don’t Commit Keys)

Create a local `.env` (it is gitignored) and add:

```bash
ELEVENLABS_API_KEY=...

# Optional (recommended for deterministic voices):
ELEVENLABS_VOICE_ID_FEMALE=...
ELEVENLABS_VOICE_ID_MALE=...

# Optional:
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
ELEVENLABS_TTS_CACHE_DIR=server_cache/elevenlabs_tts

# For AI icon generation (one of these):
OPENAI_API_KEY=...
# AI_INTEGRATIONS_OPENAI_API_KEY=...
```

## AI Icon Generation

Generate the full icon pack with an image model (instead of manual drawing):

```bash
npm run icons:ai
```

This updates the icon files already used in the interface under:

- `assets/images/icon-set/*.png`
- `assets/images/*.png` (record, stop, metronome, bpm, etc.)

## PWA (Web Installable App)

EaseVerse supports a Progressive Web App deployment under `/app`.

### Build the PWA bundle

```bash
npm run web:build
```

### Serve it

Start the server as usual. If `web-build/index.html` exists, the app is available at:

- `GET /app` (SPA entry)

The service worker, offline fallback, and manifest are served from the same `/app` scope.

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
- `WS /api/v1/ws` (realtime lyric updates)

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
