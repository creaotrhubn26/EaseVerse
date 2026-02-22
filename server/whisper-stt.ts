/**
 * Whisper Speech-to-Text Integration (Free, Open Source)
 * Uses @xenova/transformers to run Whisper locally in Node.js
 */

import { pipeline, AutomaticSpeechRecognitionPipeline } from '@xenova/transformers';
import { readFile, writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import * as wavefilePkg from 'wavefile';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';

const { WaveFile } = wavefilePkg as unknown as {
  WaveFile: new (wavBuffer?: Uint8Array) => {
    getSamples: (interleaved?: boolean, OutputObject?: Function) => Float64Array;
  };
};

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;
let isInitializing = false;
let initPromise: Promise<void> | null = null;
const AI_DEBUG_LOGS = process.env.AI_DEBUG_LOGS === 'true';
let whisperStatus: {
  state: 'idle' | 'loading' | 'ready' | 'error';
  lastError: string | null;
  startedAt: string | null;
  readyAt: string | null;
} = {
  state: 'idle',
  lastError: null,
  startedAt: null,
  readyAt: null,
};

function debugLog(...args: unknown[]) {
  if (AI_DEBUG_LOGS) {
    console.log(...args);
  }
}

/**
 * Initialize the Whisper model (lazy loading)
 * Uses tiny.en model for fast processing (~150MB download on first run)
 */
async function initializeWhisper(): Promise<void> {
  if (transcriber) return;
  
  if (isInitializing && initPromise) {
    await initPromise;
    return;
  }

  isInitializing = true;
  whisperStatus = {
    state: 'loading',
    lastError: null,
    startedAt: new Date().toISOString(),
    readyAt: null,
  };
  initPromise = (async () => {
    try {
      debugLog('Initializing Whisper model (this may take a moment on first run)...');
      
      // Use base.en for better accuracy (tiny.en may silently fail on some audio)
      const modelName = process.env.WHISPER_MODEL || 'Xenova/whisper-base.en';
      
      debugLog(`Loading Whisper model: ${modelName}`);
      
      transcriber = await pipeline(
        'automatic-speech-recognition',
        modelName,
        {
          // Cache models to avoid re-downloading
          cache_dir: process.env.WHISPER_CACHE_DIR,
        }
      ) as AutomaticSpeechRecognitionPipeline;
      
      debugLog('Whisper model initialized successfully');
      whisperStatus = {
        state: 'ready',
        lastError: null,
        startedAt: whisperStatus.startedAt,
        readyAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Failed to initialize Whisper:', error);
      transcriber = null;
      whisperStatus = {
        state: 'error',
        lastError: error instanceof Error ? error.message : 'Failed to initialize Whisper',
        startedAt: whisperStatus.startedAt,
        readyAt: null,
      };
      throw error;
    } finally {
      isInitializing = false;
    }
  })();

  await initPromise;
}

/**
 * Decode audio buffer to Float32Array for Whisper
 * Converts any audio format to 16kHz mono PCM using ffmpeg
 */
async function decodeAudio(audioBuffer: Buffer): Promise<Float32Array> {
  const inputFile = join(tmpdir(), `whisper-input-${Date.now()}.audio`);
  const outputFile = join(tmpdir(), `whisper-output-${Date.now()}.wav`);

  try {
    // Write input audio to temp file
    await writeFile(inputFile, audioBuffer);

    // Convert to 16kHz mono WAV using ffmpeg
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn(ffmpegPath!, [
        '-i', inputFile,
        '-ar', '16000', // 16kHz sample rate
        '-ac', '1', // Mono
        '-f', 'wav', // WAV format
        '-y', // Overwrite output file
        outputFile
      ]);

      ffmpeg.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}`));
      });

      ffmpeg.on('error', reject);
    });

    // Read the WAV file
    const wavBuffer = await readFile(outputFile);
    const wav = new WaveFile(wavBuffer);

    // CRITICAL: wavefile's getSamples() returns int16 values (range: -32768 to 32767)
    // even when requesting Float32Array. Whisper expects normalized float32 (-1.0 to 1.0).
    // Without normalization, Whisper returns [BLANK_AUDIO] or empty transcripts.
    const samples = wav.getSamples(false) as unknown as Float32Array;
    
    // Normalize int16 to float32 range by dividing by max int16 value
    const normalized = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      normalized[i] = samples[i] / 32768.0;
    }

    // Cleanup temp files
    await unlink(inputFile).catch(() => {});
    await unlink(outputFile).catch(() => {});

    return normalized;
  } catch (error) {
    // Cleanup on error
    await unlink(inputFile).catch(() => {});
    await unlink(outputFile).catch(() => {});
    throw error;
  }
}


/**
 * Transcribe audio using Whisper
 * @param audioBuffer Audio data (WAV, MP3, etc.)
 * @param options Transcription options
 * @returns Transcribed text
 */
export async function transcribeWithWhisper(
  audioBuffer: Buffer,
  options?: {
    language?: string; // e.g., 'en', 'es', 'fr'
    task?: 'transcribe' | 'translate'; // translate converts to English
  }
): Promise<string> {
  try {
    await initializeWhisper();
    
    if (!transcriber) {
      throw new Error('Whisper model not initialized');
    }

    debugLog('Whisper: Processing audio buffer of', audioBuffer.length, 'bytes');

    // Decode audio to Float32Array (16kHz mono PCM)
    debugLog('Whisper: Decoding audio with ffmpeg...');
    const audioSamples = await decodeAudio(audioBuffer);
    debugLog('Whisper: Decoded', audioSamples.length, 'samples');

    // Pass raw audio samples to Whisper
    const result: any = await transcriber(audioSamples, {
      language: options?.language,
      task: options?.task || 'transcribe',
      return_timestamps: false,
      chunk_length_s: 30, // Process in 30-second chunks
    });

    if (AI_DEBUG_LOGS) {
      console.log('Whisper: Full result:', JSON.stringify(result, null, 2));
    }
    
    let transcription = '';
    if (typeof result === 'string') {
      transcription = result.trim();
    } else if (result && typeof result === 'object' && !Array.isArray(result) && 'text' in result) {
      transcription = (result as { text: string }).text.trim();
    } else if (Array.isArray(result) && result.length > 0) {
      transcription = result.map((r: any) => r.text || '').join(' ').trim();
    }
    
    debugLog('Whisper: Transcription:', transcription || '(empty)');
    return transcription;
  } catch (error) {
    console.error('Whisper transcription error:', error);
    throw new Error('Failed to transcribe audio with Whisper');
  }
}

/**
 * Check if Whisper is available (can be used as fallback check)
 */
export function isWhisperAvailable(): boolean {
  // Whisper is always available (no API key needed)
  // But might fail on first run if model download fails
  return true;
}

export function getWhisperStatus() {
  return { ...whisperStatus };
}

/**
 * Preload the Whisper model to avoid delays on first request
 * Call this during server startup
 */
export async function preloadWhisper(): Promise<void> {
  try {
    await initializeWhisper();
    debugLog('Whisper model preloaded and ready');
  } catch (error) {
    console.warn('Failed to preload Whisper model:', error);
  }
}
