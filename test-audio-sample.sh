#!/bin/bash

# Test Whisper STT with a specific audio file

if [ $# -lt 2 ]; then
  echo "Usage: $0 <audio-file> <expected-text>"
  echo "Example: $0 samples/hello.wav 'Hello'"
  exit 1
fi

AUDIO_FILE="$1"
EXPECTED_TEXT="$2"
SERVER_URL="http://localhost:5059"
API_KEY="ev_scr_bdb8e017d661815c008c2f62d04b4b0cfefaca7b8d4b67330ed6d62160acf767"

if [ ! -f "$AUDIO_FILE" ]; then
  echo "❌ File not found: $AUDIO_FILE"
  exit 1
fi

echo "=== Testing Whisper STT ==="
echo "Audio file: $AUDIO_FILE"
echo "Expected: \"$EXPECTED_TEXT\""
echo ""

# Get file size
FILE_SIZE=$(wc -c < "$AUDIO_FILE")
echo "Audio file size: $FILE_SIZE bytes"

# Convert to base64
AUDIO_BASE64=$(base64 -i "$AUDIO_FILE" | tr -d '\n')
echo "Base64 length: ${#AUDIO_BASE64} characters"
echo ""

# Send to API
echo "Sending to Whisper STT API..."
RESULT=$(curl -s -X POST "${SERVER_URL}/api/session-score" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d "{
    \"lyrics\": \"${EXPECTED_TEXT}\",
    \"durationSeconds\": 5,
    \"audioBase64\": \"${AUDIO_BASE64}\"
  }")

# Extract transcript
TRANSCRIPT=$(echo "$RESULT" | jq -r '.transcript // empty')

echo "Result:"
echo "$RESULT" | jq '.'
echo ""

if [ -n "$TRANSCRIPT" ]; then
  echo "✅ Transcript: \"$TRANSCRIPT\""
  echo ""
  
  # Basic similarity check
  if echo "$TRANSCRIPT" | grep -qi "$(echo "$EXPECTED_TEXT" | head -c 5)"; then
    echo "✅ Transcription appears correct!"
  else
    echo "⚠️  Transcription may differ from expected"
    echo "   Expected: $EXPECTED_TEXT"
    echo "   Got:      $TRANSCRIPT"
  fi
else
  echo "❌ No transcript received"
fi

echo ""
echo "=== Test Complete ==="
