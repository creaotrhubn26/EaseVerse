# Whisper STT Integration

## Overview

EaseVerse uses Xenova's Whisper.js (@xenova/transformers) for local, free speech-to-text transcription as an alternative to OpenAI's Whisper API.

## Model

- **Model**: `Xenova/whisper-base.en`
- **Size**: ~140MB download on first run
- **Language**: English only (optimized for accuracy)
- **Performance**: Runs locally in Node.js, no API costs

## Technical Implementation

### Audio Processing Pipeline

1. **Input**: Any audio format (MP3, WAV, etc.)
2. **ffmpeg Conversion**: Convert to 16kHz mono WAV
3. **WAV Parsing**: Use `wavefile` library to extract PCM samples
4. **Normalization**: **CRITICAL** - Convert int16 to float32 (-1.0 to 1.0)
5. **Transcription**: Pass normalized Float32Array to Whisper

### Critical Fix: Audio Normalization

The `wavefile` library's `getSamples()` method returns int16 values (-32768 to 32767) even when requesting Float32Array. Whisper expects normalized float32 values in the range -1.0 to 1.0.

**Without normalization**: Whisper returns `[BLANK_AUDIO]` or empty transcripts
**With normalization**: Transcription works perfectly

```typescript
// Normalize int16 to float32
const samples = wav.getSamples(false, Float32Array);
const normalized = new Float32Array(samples.length);
for (let i = 0; i < samples.length; i++) {
  normalized[i] = samples[i] / 32768.0; // Divide by max int16 value
}
```

## Testing

Test samples are available in the `samples/` directory. Use the test script:

```bash
./test-audio-sample.sh samples/hello.wav "Hello"
```

### Test Results

- ✅ "Hello" → "Hello." (100% accuracy)
- ✅ "one two three" → "1, 2, 3" (intelligent transcription)
- ✅ "The quick brown fox..." → Perfect transcription

## Dependencies

- `@xenova/transformers`: ^2.17.2 - Whisper model
- `ffmpeg-static`: For audio format conversion
- `wavefile`: For WAV file parsing

## Environment Variables

- `WHISPER_MODEL`: Model to use (default: `Xenova/whisper-base.en`)
- `WHISPER_CACHE_DIR`: Cache directory for models (optional)

## Integration Points

- **server/whisper-stt.ts**: Core Whisper functionality
- **server/routes.ts**: Uses Whisper in `handleSessionScore` with OpenAI fallback
- **server/gemini-coach.ts**: Gemini provides pronunciation coaching for transcripts

## Performance

- First run: ~5-10s model download
- Subsequent runs: ~1-2s transcription for typical audio clips
- No API costs, runs completely locally

## Known Limitations

1. English only (using whisper-base.en)
2. Requires ~500MB RAM for model during inference
3. First run downloads ~140MB model
4. Timestamps feature may need additional configuration

## Future Improvements

- [ ] Add multilingual support (use whisper-base instead of whisper-base.en)
- [ ] Implement timestamp-based word alignment
- [ ] Add confidence scores
- [ ] Optimize model size (try whisper-tiny for faster inference)
