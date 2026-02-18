# Audio Test Samples for Whisper STT

This directory contains test audio samples for validating the Whisper speech-to-text integration.

## Files

- `hello.wav` - Simple "Hello" speech sample
- `count-123.wav` - "One, two, three" counting sample
- `test-sentence.wav` - "The quick brown fox jumps over the lazy dog"

## Expected Transcriptions

| File | Expected Text | Duration |
|------|--------------|----------|
| hello.wav | "Hello" | ~1s |
| count-123.wav | "One, two, three" | ~2s |
| test-sentence.wav | "The quick brown fox jumps over the lazy dog" | ~5s |

## Usage

```bash
# Test a sample
./test-audio-sample.sh samples/hello.wav "Hello"
```
