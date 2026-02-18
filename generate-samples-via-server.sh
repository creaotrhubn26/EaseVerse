#!/bin/bash

# Generate test samples using the server's ElevenLabs TTS
# Then test Whisper transcription with each sample

set -e

SERVER_URL="http://localhost:5059"
API_KEY="ev_ext_eba1a3d307fa488e57d2a35d5878a18b74e2b4e0f75f6a8f04df8a8b19887ec1"
SAMPLES_DIR="samples"

mkdir -p "$SAMPLES_DIR"

echo "=== Generating Samples via ElevenLabs TTS ==="
echo ""

# Test phrases
declare -a PHRASES=(
  "Hello world"
  "Testing one two three"
  "The quick brown fox"
  "Singing is an art"
)

for i in "${!PHRASES[@]}"; do
  PHRASE="${PHRASES[$i]}"
  FILENAME="$SAMPLES_DIR/sample-$i.mp3"
  
  echo "[$((i+1))/${#PHRASES[@]}] Generating: \"$PHRASE\""
  
  curl -s -X POST "${SERVER_URL}/api/tts/elevenlabs" \
    -H "Content-Type: application/json" \
    -H "x-api-key: ${API_KEY}" \
    -d "{\"text\": \"${PHRASE}\", \"voiceId\": \"EXAVITQu4vr4xnSDxMaL\", \"modelId\": \"eleven_multilingual_v2\"}" \
    --output "$FILENAME"
  
  if [ -s "$FILENAME" ]; then
    SIZE=$(wc -c < "$FILENAME")
    echo "   ✅ Generated $SIZE bytes"
  else
    echo "   ❌ Failed to generate"
  fi
done

echo ""
echo "=== Samples Generated ==="
ls -lh "$SAMPLES_DIR"/*.mp3

echo ""
echo "=== Testing Samples with Whisper ==="
echo ""

for i in "${!PHRASES[@]}"; do
  PHRASE="${PHRASES[$i]}"
  FILENAME="$SAMPLES_DIR/sample-$i.mp3"
  
  if [ ! -f "$FILENAME" ]; then
    continue
  fi
  
  echo "Testing: \"$PHRASE\""
  ./test-audio-sample.sh "$FILENAME" "$PHRASE" 2>&1 | grep -E "(Transcript:|✅|❌|⚠️)" || true
  echo ""
done

echo "=== All Tests Complete ==="
