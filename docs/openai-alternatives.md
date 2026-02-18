# OpenAI Alternatives for EaseVerse

## Current Status

**✅ FREE & WORKING (No API costs):**

- **Whisper STT** (@xenova/transformers) - Local speech-to-text, runs in Node.js, ~140MB model
- **Gemini 2.5 Flash** (Google) - FREE tier pronunciation coaching, 15 req/min
- **ElevenLabs TTS** (paid) - Production ready for pronunciation audio playback

**⚠️ Needs OpenAI API Key (fallback only):**

- OpenAI TTS (gpt-audio model) - fallback if ElevenLabs unavailable
- OpenAI STT (gpt-4o-mini-transcribe) - fallback if Whisper fails
- OpenAI Chat (gpt-4o-mini) - fallback if Gemini unavailable

---

## 🔊 Text-to-Speech (TTS) Alternatives

### ✅ Already Integrated: ElevenLabs

**Status:** Production ready, API key configured

- **Endpoint:** `/api/tts/elevenlabs`
- **Quality:** Excellent, natural-sounding voices
- **Cost:** ~$0.30 per 1000 characters (Creator plan: $22/month for 100k chars)
- **Latency:** ~1-2 seconds
- **Use in app:** Already used for pronunciation coaching audio

**Implementation:** Already complete in `server/elevenlabs.ts`

### Alternative #1: Google Cloud Text-to-Speech

- **Quality:** Good, neural voices available
- **Cost:** $4 per 1M characters (Neural), $16 per 1M (WaveNet)
- **Latency:** ~1-2 seconds
- **Language support:** 100+ languages, 400+ voices
- **Pros:** Very reliable, good pricing for high volume
- **Cons:** Slightly less natural than ElevenLabs

### Alternative #2: Azure Speech Services

- **Quality:** Excellent, neural voices
- **Cost:** Free tier: 500k chars/month, then $15 per 1M chars
- **Latency:** ~1-2 seconds
- **Language support:** 120+ languages
- **Pros:** Free tier, good for testing
- **Cons:** Microsoft ecosystem dependency

### Alternative #3: Mozilla TTS (Local/Self-hosted)

- **Quality:** Good
- **Cost:** Free (compute costs only)
- **Latency:** Depends on hardware (~2-5 seconds on CPU)
- **Pros:** No API costs, full control
- **Cons:** Setup complexity, requires hosting

**💡 Recommendation:** Continue using ElevenLabs for pronunciation audio (already working). Add Google TTS as fallback for cost-effective narration.

---

## 🎤 Speech-to-Text (STT) Alternatives

### Alternative #1: Deepgram

#### Best for: Real-time transcription

- **Accuracy:** Excellent (95%+)
- **Cost:** $0.43 per audio hour (pay-as-you-go)
- **Latency:** Real-time (<300ms)
- **Language support:** 30+ languages
- **Pros:**
  - Fastest STT on market
  - Built for music/singing (handles background audio well)
  - WebSocket support for live transcription
- **Cons:** Slightly more expensive than Google

**Implementation example:**

```typescript
import { createClient } from "@deepgram/sdk";

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

async function transcribeAudio(audioBuffer: Buffer) {
  const { result } = await deepgram.listen.prerecorded.transcribeFile(
    audioBuffer,
    {
      model: "nova-2",
      smart_format: true,
      language: "en-US",
    }
  );
  return result.results.channels[0].alternatives[0].transcript;
}
```

### Alternative #2: AssemblyAI

#### Best for: Accuracy and music handling

- **Accuracy:** Excellent (speaker labels, music detection)
- **Cost:** $0.65 per audio hour (core), $1.20 (best)
- **Latency:** ~5-10 seconds for processing
- **Language support:** 100+ languages
- **Pros:**
  - Excellent music/singing detection
  - Word-level timestamps
  - Speaker diarization
- **Cons:** Higher cost, slower than Deepgram

### Alternative #3: Google Cloud Speech-to-Text

#### Best for: Cost and reliability

- **Accuracy:** Very good
- **Cost:** $0.024 per minute ($1.44/hour) for standard
- **Latency:** ~3-5 seconds
- **Language support:** 125+ languages
- **Pros:**
  - Cheapest option
  - Very reliable
  - Free tier: 60 min/month
- **Cons:** Not optimized for singing/music

### ✅ Alternative #4: Whisper (Local/Self-hosted) - **NOW WORKING**

#### Best for: Zero API costs

- **Status:** ✅ **IMPLEMENTED AND WORKING**
- **Accuracy:** Excellent (OpenAI's open-source model)
- **Cost:** Free (compute only)
- **Latency:** ~1-2 seconds for typical clips (CPU only, no GPU needed)
- **Language support:** English (whisper-base.en)
- **Model size:** ~140MB download on first run
- **Pros:**
  - ✅ No API costs
  - ✅ Runs locally in Node.js
  - ✅ No Python dependencies
  - ✅ Works on CPU (no GPU required)
- **Cons:**
  - First run downloads model
  - English only (current config)

**✅ Production Implementation:**
See `server/whisper-stt.ts` for complete working code.

**Critical:** Audio must be normalized to float32 (-1.0 to 1.0) or Whisper returns empty transcripts.

**Test results:**

- "Hello" → "Hello." (100% accuracy)
- "one two three" → "1, 2, 3" (intelligent conversion)
- Full sentences → Perfect transcription

**💡 Recommendation:**

- **For live/real-time:** Deepgram (best for singing, low latency)
- **For batch/session analysis:** Google Cloud STT (most cost-effective)
- **For self-hosted:** Whisper with GPU

---

## 🧠 Pronunciation Coaching (LLM) Alternatives

### Alternative #1: Anthropic Claude

#### Best for: Quality and context understanding

- **Model:** Claude 3 Haiku (fast), Claude 3.5 Sonnet (best)
- **Cost:**
  - Haiku: $0.25/1M input, $1.25/1M output tokens
  - Sonnet: $3/1M input, $15/1M output tokens
- **Latency:** ~1-2 seconds (Haiku), ~2-4 seconds (Sonnet)
- **Quality:** Excellent, often better than GPT-4
- **Pros:**
  - Better at following JSON format instructions
  - More consistent output
  - Longer context window (200k tokens)
- **Cons:** Slightly more expensive than GPT-4o-mini

**Implementation example:**

```typescript
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function getPronunciationTip(word: string, context: string) {
  const message = await anthropic.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 150,
    messages: [
      {
        role: "user",
        content: `As a vocal coach, provide pronunciation guidance for "${word}" in context: "${context}". Return JSON with: phonetic, tip, slow`,
      },
    ],
  });
  return JSON.parse(message.content[0].text);
}
```

### ✅ Alternative #2: Google Gemini - **NOW WORKING**

#### Best for: Free tier and Google ecosystem

- **Status:** ✅ **IMPLEMENTED AND WORKING**
- **Model:** Gemini 2.5 Flash (latest, Feb 2026)
- **Cost:**
  - ✅ Free tier: 15 requests/min, 1M requests/day
  - Flash: $0.075/1M input, $0.30/1M output
- **Latency:** ~1-2 seconds
- **Quality:** Excellent, consistent JSON output
- **Pros:**
  - ✅ FREE for moderate usage
  - ✅ Very reliable
  - ✅ Great phonetic notation
  - Multimodal capable
- **Cons:** Rate limits on free tier (15/min sufficient for most apps)

**✅ Production Implementation:**
See `server/gemini-coach.ts` for complete working code.

**Test results:**

- "beautiful" → BYOO-tuh-ful (perfect phonetics)
- "rhythm" → RIH-thuhm (accurate coaching)
- "technique" → /tɛkˈniːk/ (IPA notation)

**Environment variable:** `GEMINI_API_KEY`

### Alternative #3: Ollama (Local LLMs)

#### Best for: Zero API costs, privacy

- **Models:** Llama 3.1, Mistral, Phi-3, etc.
- **Cost:** Free (compute only)
- **Latency:** 2-10 seconds depending on hardware
- **Quality:** Good (comparable to GPT-3.5)
- **Pros:**
  - No API costs
  - Complete privacy
  - No rate limits
- **Cons:**
  - Requires decent hardware (8GB+ RAM)
  - Need to manage server

### Alternative #4: Rule-based System (No LLM)

#### Best for: Zero costs, deterministic

Create a simple rule-based pronunciation guide:

```typescript
const pronunciationRules = {
  // Vowel sounds
  beautiful: {
    phonetic: "BYOO-tuh-ful",
    tip: 'Emphasize the "U" sound, relaxed jaw',
    slow: "beau - ti - ful",
  },
  love: {
    phonetic: "LUV",
    tip: "Open vowel, avoid closing too soon",
    slow: "l - uh - v",
  },
  // ... more words
};

function getPronunciationTip(word: string) {
  const normalized = word.toLowerCase().replace(/[^a-z]/g, "");

  // Check exact match
  if (pronunciationRules[normalized]) {
    return pronunciationRules[normalized];
  }

  // Generate basic phonetic based on rules
  return {
    phonetic: word.toUpperCase(),
    tip: "Enunciate clearly, maintain vowel shape",
    slow: word.split("").join(" - "),
  };
}
```

**💡 Recommendation:**

1. **For production:** Anthropic Claude Haiku (best quality/cost ratio)
2. **For free tier testing:** Google Gemini Flash
3. **For privacy/cost:** Rule-based system with curated word list

---

## 📊 Cost Comparison (Monthly Estimates)

Assuming 1,000 users with moderate usage:

- 500 pronunciation requests/day
- 200 session transcriptions/day (avg 1 min each)
- 500 TTS generations/day (avg 10 words each)

### Current Setup (All OpenAI)

| Service                     | Usage       | Cost              |
| --------------------------- | ----------- | ----------------- |
| GPT-4o-mini (pronunciation) | 7.5M tokens | ~$1.50            |
| GPT-4o-mini-transcribe      | 200 hours   | ~$12              |
| GPT-audio TTS               | 150k words  | ~$30              |
| **Total**                   |             | **~$43.50/month** |

### Recommended Setup

| Service                      | Usage       | Cost                 |
| ---------------------------- | ----------- | -------------------- |
| Claude Haiku (pronunciation) | 7.5M tokens | ~$3                  |
| Deepgram STT                 | 200 hours   | ~$86                 |
| ElevenLabs TTS               | 150k chars  | Included in $22 plan |
| **Total**                    |             | **~$111/month**      |

### Budget Setup

| Service                      | Usage       | Cost                 |
| ---------------------------- | ----------- | -------------------- |
| Gemini Flash (pronunciation) | 7.5M tokens | FREE tier            |
| Google STT                   | 200 hours   | ~$17.28              |
| ElevenLabs TTS               | 150k chars  | Included in $22 plan |
| **Total**                    |             | **~$39.28/month**    |

### ✅ Current FREE Setup (NOW WORKING!)

| Service                              | Usage       | Cost                      |
| ------------------------------------ | ----------- | ------------------------- |
| **Gemini 2.5 Flash** (pronunciation) | 1M/day FREE | **$0**                    |
| **Whisper** (STT)                    | Unlimited   | **$0**                    |
| ElevenLabs TTS                       | 150k chars  | $22                       |
| **Total**                            |             | **$22/month** (TTS only!) |

**✅ Status:** Fully implemented and tested in production!

---

## 🚀 Implementation Status

### ✅ Phase 1: COMPLETE - Free AI Stack

- ✅ ElevenLabs TTS - Production ready
- ✅ Whisper STT - Working locally, no API costs
- ✅ Gemini 2.5 Flash - FREE tier pronunciation coaching

**Result:** App runs with $22/month TTS cost, everything else FREE!

### Phase 2: Optional Upgrades (If Needed)

#### Option A: Premium STT (if Whisper latency is issue)

1. Add Deepgram for real-time transcription (~$86/month)
   - Best for live singing analysis
   - npm: `@deepgram/sdk`

#### Option B: Premium LLM (if Gemini rate limits hit)

1. Add Anthropic Claude Haiku (~$3/month)
   - npm: `@anthropic-ai/sdk`
   - Better than Gemini for high-volume usage

---

## 🔧 Quick Start Guide

### ✅ Using FREE Services (Current Setup)

**1. Get Gemini API key (FREE):**

```bash
# Visit: https://makersuite.google.com/app/apikey
# Add to .env:
GEMINI_API_KEY=your_key_here
```

**2. Whisper setup (automatic):**

- No API key needed!
- Model downloads automatically on first use (~140MB)
- Runs locally in Node.js

**3. Start the server:**

```bash
npm run server:dev
```

**That's it!** You now have:

- ✅ FREE pronunciation coaching (Gemini)
- ✅ FREE speech-to-text (Whisper)
- ✅ Paid TTS (ElevenLabs, $22/month)

### 🔧 Optional: Premium Upgrades

#### Add Deepgram STT (if Whisper latency is too high)

```bash
npm install @deepgram/sdk
```

```typescript
// server/deepgram-stt.ts
import { createClient } from "@deepgram/sdk";

const deepgram = createClient(process.env.DEEPGRAM_API_KEY || "");

export async function transcribeWithDeepgram(
  audioBuffer: Buffer,
  language: string = "en-US"
): Promise<string> {
  const { result } = await deepgram.listen.prerecorded.transcribeFile(
    audioBuffer,
    {
      model: "nova-2",
      smart_format: true,
      language,
      punctuate: true,
    }
  );

  return result.results.channels[0].alternatives[0].transcript;
}
```

Update `server/routes.ts`:

```typescript
// Add at top
import { transcribeWithDeepgram } from "./deepgram-stt";

// In handleSessionScore, replace speechToText call:
const transcript = process.env.DEEPGRAM_API_KEY
  ? await transcribeWithDeepgram(compatibleAudio, normalizedLanguage)
  : await speechToText(compatibleAudio, format, {
      language: normalizedLanguage,
    });
```

#### Add Claude for Pronunciation (if Gemini rate limits are hit)

```bash
npm install @anthropic-ai/sdk
```

```typescript
// server/claude-coach.ts
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function getPronunciationCoaching(params: {
  word: string;
  context?: string;
  language?: string;
  accentGoal?: string;
}): Promise<{ phonetic: string; tip: string; slow: string }> {
  const prompt = params.context
    ? `Word: "${params.word}" in lyric line: "${params.context}".${
        params.accentGoal ? ` Accent goal: ${params.accentGoal}.` : ""
      }`
    : `Word: "${params.word}".${
        params.accentGoal ? ` Accent goal: ${params.accentGoal}.` : ""
      }`;

  const message = await anthropic.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 150,
    messages: [
      {
        role: "user",
        content: `You are a vocal pronunciation coach for singers. For this word, return ONLY a JSON object with these exact keys: phonetic (IPA or simplified), tip (coaching tip in ${
          params.language || "English"
        }, under 15 words), slow (syllable breakdown). ${prompt}`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type === "text") {
    try {
      return JSON.parse(content.text);
    } catch {
      return {
        phonetic: params.word,
        tip: "Enunciate clearly",
        slow: params.word,
      };
    }
  }

  throw new Error("No text response from Claude");
}
```

---

## 📝 Environment Variables

**✅ Currently Working Setup:**

```bash
# Required for TTS
ELEVENLABS_API_KEY=your_key_here

# ✅ FREE AI Services (recommended, already working)
GEMINI_API_KEY=your_key_here  # Free tier: 15 req/min, 1M/day
# Whisper runs locally, no API key needed

# Optional: Whisper configuration
# WHISPER_MODEL=Xenova/whisper-base.en  # Default
# WHISPER_CACHE_DIR=~/.cache/whisper  # Model cache location

# Optional: OpenAI as fallback only
OPENAI_API_KEY=your_key_here  # Only needed if Gemini/Whisper unavailable
```

**Alternative/Upgrade Options:**

```bash
# Premium STT alternatives (if Whisper latency is an issue)
DEEPGRAM_API_KEY=your_key_here  # ~$86/month, best for real-time
ASSEMBLYAI_API_KEY=your_key_here  # ~$78/month, best for music
GOOGLE_API_KEY=your_key_here  # ~$17/month, budget option

# Premium LLM alternatives (if Gemini rate limits are hit)
ANTHROPIC_API_KEY=your_key_here  # ~$3/month for Haiku
AZURE_OPENAI_KEY=your_key_here  # Enterprise option
```

**Getting API Keys:**

- **Gemini (FREE):** [makersuite.google.com/app/apikey](https://makersuite.google.com/app/apikey)
- **ElevenLabs:** [elevenlabs.io](https://elevenlabs.io/) (Creator plan: $22/month)
- **Whisper:** No API key needed (runs locally)

---

## ✅ Summary

**✅ Currently Working (Production Ready):**

- ✅ **Whisper STT** - Local transcription, zero API costs (see `server/whisper-stt.ts`)
- ✅ **Gemini 2.5 Flash** - FREE pronunciation coaching, 1M requests/day (see `server/gemini-coach.ts`)
- ✅ **ElevenLabs TTS** - Pronunciation audio ($22/month)

**📚 Documentation:**

- Whisper integration: `docs/whisper-stt-integration.md`
- Implementation details: `server/whisper-stt.ts`, `server/gemini-coach.ts`

**💰 Current monthly cost: $22** (TTS only, everything else FREE!)

**🎯 Next Steps (Optional Upgrades):**

1. If Whisper latency becomes an issue: Add Deepgram STT (~$86/month)
2. If Gemini rate limits are hit: Add Claude Haiku (~$3/month)
3. Keep OpenAI as emergency fallback (already integrated)

**Result:** Full-featured vocal coaching app with minimal costs!
