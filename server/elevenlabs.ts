import { createHash, randomUUID } from "crypto";
import * as fs from "fs/promises";
import * as path from "path";

export type ElevenLabsVoice = "female" | "male";

type ElevenLabsVoiceSettings = {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
};

type ElevenLabsTtsParams = {
  apiKey: string;
  text: string;
  voice: ElevenLabsVoice;
  modelId: string;
  voiceSettings?: ElevenLabsVoiceSettings;
};

type ElevenLabsVoiceListResponse = {
  voices?: { voice_id?: string; name?: string }[];
};

const resolvedVoiceIdByGender: Partial<Record<ElevenLabsVoice, string>> = {};
let lastVoiceFetchAtMs = 0;

const inFlightByCacheKey = new Map<string, Promise<Buffer>>();

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeEnvString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function getCacheDir(): string {
  const configured = normalizeEnvString(process.env.ELEVENLABS_TTS_CACHE_DIR);
  return configured ?? path.join(process.cwd(), "server_cache", "elevenlabs_tts");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeFileAtomic(filePath: string, data: Buffer): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.${randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, data);
  await fs.rename(tmpPath, filePath);
}

function resolveVoiceIdFromEnv(voice: ElevenLabsVoice): string | undefined {
  const fallback = normalizeEnvString(process.env.ELEVENLABS_VOICE_ID);
  if (fallback) {
    return fallback;
  }

  if (voice === "female") {
    return normalizeEnvString(process.env.ELEVENLABS_VOICE_ID_FEMALE);
  }
  return normalizeEnvString(process.env.ELEVENLABS_VOICE_ID_MALE);
}

function resolveVoiceNameFromEnv(voice: ElevenLabsVoice): string {
  if (voice === "female") {
    return normalizeEnvString(process.env.ELEVENLABS_VOICE_NAME_FEMALE) ?? "Rachel";
  }
  return normalizeEnvString(process.env.ELEVENLABS_VOICE_NAME_MALE) ?? "Adam";
}

async function fetchVoices(apiKey: string): Promise<ElevenLabsVoiceListResponse> {
  const baseUrl = normalizeEnvString(process.env.ELEVENLABS_BASE_URL) ?? "https://api.elevenlabs.io/v1";
  const url = new URL("/voices", baseUrl);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = (await res.text().catch(() => "")) || res.statusText;
    throw new Error(`ElevenLabs voices failed: ${res.status}: ${text}`);
  }

  return (await res.json()) as ElevenLabsVoiceListResponse;
}

async function resolveElevenLabsVoiceId(apiKey: string, voice: ElevenLabsVoice): Promise<string> {
  const envVoiceId = resolveVoiceIdFromEnv(voice);
  if (envVoiceId) {
    return envVoiceId;
  }

  const cached = resolvedVoiceIdByGender[voice];
  if (cached) {
    return cached;
  }

  // Fetch voice ids by name (cached for a short period).
  const now = Date.now();
  const shouldRefetch = now - lastVoiceFetchAtMs > 10 * 60_000;
  if (!shouldRefetch && Object.keys(resolvedVoiceIdByGender).length > 0) {
    const alreadyResolved = resolvedVoiceIdByGender[voice];
    if (alreadyResolved) {
      return alreadyResolved;
    }
  }

  const desiredName = resolveVoiceNameFromEnv(voice).toLowerCase();
  const voices = await fetchVoices(apiKey);
  lastVoiceFetchAtMs = now;

  const candidate = voices.voices?.find(
    (v) => typeof v?.name === "string" && v.name.toLowerCase() === desiredName
  );

  const voiceId = normalizeEnvString(candidate?.voice_id);
  if (!voiceId) {
    throw new Error(
      `ElevenLabs voice id missing. Set ELEVENLABS_VOICE_ID_${voice.toUpperCase()} or provide a valid ELEVENLABS_VOICE_NAME_${voice.toUpperCase()}.`
    );
  }

  resolvedVoiceIdByGender[voice] = voiceId;
  return voiceId;
}

async function elevenLabsRequestTts(params: {
  apiKey: string;
  voiceId: string;
  text: string;
  modelId: string;
  voiceSettings: ElevenLabsVoiceSettings;
}): Promise<Buffer> {
  const baseUrl = normalizeEnvString(process.env.ELEVENLABS_BASE_URL) ?? "https://api.elevenlabs.io/v1";
  const url = new URL(`/text-to-speech/${params.voiceId}`, baseUrl);

  const body: Record<string, unknown> = {
    text: params.text,
    model_id: params.modelId,
    voice_settings: params.voiceSettings,
  };

  const outputFormat = normalizeEnvString(process.env.ELEVENLABS_OUTPUT_FORMAT);
  if (outputFormat) {
    body.output_format = outputFormat;
  }

  const controller = new AbortController();
  const timeoutMs = Number.parseInt(process.env.ELEVENLABS_TIMEOUT_MS || "20000", 10);
  const timeoutId = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 20000);

  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "xi-api-key": params.apiKey,
        Accept: "audio/mpeg",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = (await res.text().catch(() => "")) || res.statusText;
      throw new Error(`ElevenLabs TTS failed: ${res.status}: ${text}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function elevenLabsTextToSpeech(params: ElevenLabsTtsParams): Promise<{
  audio: Buffer;
  cache: "hit" | "miss";
  cacheKey: string;
}> {
  const voiceId = await resolveElevenLabsVoiceId(params.apiKey, params.voice);
  const voiceSettings: ElevenLabsVoiceSettings = params.voiceSettings ?? {
    stability: 0.55,
    similarity_boost: 0.75,
    style: 0.0,
    use_speaker_boost: true,
  };

  const cacheKey = sha256Hex(
    JSON.stringify({
      provider: "elevenlabs",
      voiceId,
      modelId: params.modelId,
      voiceSettings,
      text: params.text,
    })
  );

  const cachePath = path.join(getCacheDir(), `${cacheKey}.mp3`);
  if (await fileExists(cachePath)) {
    const audio = await fs.readFile(cachePath);
    return { audio, cache: "hit", cacheKey };
  }

  const inFlight = inFlightByCacheKey.get(cacheKey);
  if (inFlight) {
    const audio = await inFlight;
    return { audio, cache: "hit", cacheKey };
  }

  const task = (async () => {
    const audio = await elevenLabsRequestTts({
      apiKey: params.apiKey,
      voiceId,
      text: params.text,
      modelId: params.modelId,
      voiceSettings,
    });

    try {
      await writeFileAtomic(cachePath, audio);
    } catch (error) {
      // If the runtime FS is read-only, still return the audio response.
      console.warn("ElevenLabs cache write failed:", error);
    }

    return audio;
  })();

  inFlightByCacheKey.set(cacheKey, task);
  try {
    const audio = await task;
    return { audio, cache: "miss", cacheKey };
  } finally {
    inFlightByCacheKey.delete(cacheKey);
  }
}

