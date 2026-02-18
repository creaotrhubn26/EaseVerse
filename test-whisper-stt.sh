#!/bin/bash

# Test Whisper STT Integration
# This script generates audio with TTS, then transcribes it with Whisper

set -e

SERVER_URL="http://localhost:5059"
API_KEY="ev_ext_eba1a3d307fa488e57d2a35d5878a18b74e2b4e0f75f6a8f04df8a8b19887ec1"
SESSION_KEY="ev_scr_bdb8e017d661815c008c2f62d04b4b0cfefaca7b8d4b67330ed6d62160acf767"
TEST_TEXT="Hello world, this is a test of speech to text transcription"

echo "=== Whisper STT Integration Test ==="
echo ""

# Step 1: Generate test audio using ElevenLabs TTS
echo "Step 1: Generating test audio with ElevenLabs TTS..."
AUDIO_FILE=$(mktemp /tmp/whisper-test-XXXXXX.mp3)

curl -s -X POST "${SERVER_URL}/api/tts/elevenlabs" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d "{\"text\": \"${TEST_TEXT}\", \"voiceId\": \"EXAVITQu4vr4xnSDxMaL\", \"modelId\": \"eleven_multilingual_v2\"}" \
  --output "$AUDIO_FILE"

if [ ! -s "$AUDIO_FILE" ]; then
  echo "❌ Failed to generate audio"
  exit 1
fi

AUDIO_SIZE=$(wc -c < "$AUDIO_FILE")
echo "✅ Generated $AUDIO_SIZE bytes of audio at: $AUDIO_FILE"
echo ""

# Step 2: Test Whisper transcription via session-score endpoint
echo "Step 2: Transcribing audio with Whisper STT..."
echo "Expected text: \"$TEST_TEXT\""
echo ""

# Convert audio to base64
AUDIO_BASE64=$(base64 -i "$AUDIO_FILE" | tr -d '\n')
echo "Audio encoded to base64: ${#AUDIO_BASE64} characters"

RESULT=$(curl -s -X POST "${SERVER_URL}/api/session-score" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${SESSION_KEY}" \
  -d "{
    \"lyrics\": \"${TEST_TEXT}\",
    \"durationSeconds\": 5,
    \"audioBase64\": \"${AUDIO_BASE64}\"
  }")

echo "Response:"
echo "$RESULT" | jq .

# Extract transcript if available
TRANSCRIPT=$(echo "$RESULT" | jq -r '.transcript // empty')

if [ -n "$TRANSCRIPT" ]; then
  echo ""
  echo "✅ Whisper transcription: \"$TRANSCRIPT\""
  echo ""
  
  # Basic similarity check
  if echo "$TRANSCRIPT" | grep -qi "hello"; then
    echo "✅ Transcription contains expected words!"
  else
    echo "⚠️  Transcription may not be accurate"
  fi
else
  echo "❌ No transcript in response"
  echo "Full response: $RESULT"
fi

# Cleanup
rm -f "$AUDIO_FILE"

echo ""
echo "=== Test Complete ==="
