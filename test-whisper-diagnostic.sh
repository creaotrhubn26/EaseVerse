#!/bin/bash

# Comprehensive Whisper diagnostic test
# Downloads a known-good sample audio file and tests transcription

set -e

SAMPLES_DIR="samples"
mkdir -p "$SAMPLES_DIR"

echo "=== Whisper STT Diagnostic Test ==="
echo ""

# Download a known-good sample from Mozilla Common Voice or similar
# Using a simple test file
SAMPLE_URL="https://github.com/mozilla/DeepSpeech/raw/master/audio/2830-3980-0043.wav"
SAMPLE_FILE="$SAMPLES_DIR/mozilla-sample.wav"
EXPECTED_TEXT="experience proves this"

echo "Step 1: Downloading known-good audio sample..."
if [ ! -f "$SAMPLE_FILE" ]; then
  curl -L -s "$SAMPLE_URL" -o "$SAMPLE_FILE" || {
    echo "⚠️  Failed to download sample, creating synthetic..."
    
    # Create a simple sine wave as fallback
    ffmpeg -f lavfi -i "sine=frequency=440:duration=2" -ar 16000 -ac 1 "$SAMPLE_FILE" -y 2>/dev/null || {
      echo "❌ Cannot create test audio"
      exit 1
    }
    EXPECTED_TEXT="sine wave test"
  }
fi

FILE_SIZE=$(wc -c < "$SAMPLE_FILE")
echo "✅ Sample ready: $FILE_SIZE bytes"
echo ""

# Test with Whisper
echo "Step 2: Testing Whisper transcription..."
./test-audio-sample.sh "$SAMPLE_FILE" "$EXPECTED_TEXT"

echo ""
echo "Step 3: Analyzing audio properties..."
ffprobe -v quiet -print_format json -show_format -show_streams "$SAMPLE_FILE" | jq -r '.streams[0] | "\(.codec_name) \(.sample_rate)Hz \(.channels)ch"' || echo "Could not analyze audio"

echo ""
echo "=== Diagnostic Complete ==="
