#!/bin/bash

# Generate test audio samples for Whisper STT testing
# Uses macOS 'say' command to generate speech

set -e

SAMPLES_DIR="samples"
mkdir -p "$SAMPLES_DIR"

echo "=== Generating Test Audio Samples ==="
echo ""

# Check if 'say' command is available (macOS)
if ! command -v say &> /dev/null; then
    echo "❌ 'say' command not found. Using server TTS instead..."
    exit 1
fi

# Sample 1: Simple hello
echo "1. Generating 'hello.wav'..."
say -o "$SAMPLES_DIR/hello.aiff" "Hello"
ffmpeg -i "$SAMPLES_DIR/hello.aiff" -ar 16000 -ac 1 "$SAMPLES_DIR/hello.wav" -y 2>/dev/null
rm "$SAMPLES_DIR/hello.aiff"
echo "✅ Created hello.wav"

# Sample 2: Count to three
echo "2. Generating 'count-123.wav'..."
say -o "$SAMPLES_DIR/count-123.aiff" "One, two, three"
ffmpeg -i "$SAMPLES_DIR/count-123.aiff" -ar 16000 -ac 1 "$SAMPLES_DIR/count-123.wav" -y 2>/dev/null
rm "$SAMPLES_DIR/count-123.aiff"
echo "✅ Created count-123.wav"

# Sample 3: Test sentence
echo "3. Generating 'test-sentence.wav'..."
say -o "$SAMPLES_DIR/test-sentence.aiff" "The quick brown fox jumps over the lazy dog"
ffmpeg -i "$SAMPLES_DIR/test-sentence.aiff" -ar 16000 -ac 1 "$SAMPLES_DIR/test-sentence.wav" -y 2>/dev/null
rm "$SAMPLES_DIR/test-sentence.aiff"
echo "✅ Created test-sentence.wav"

# Sample 4: Longer narration
echo "4. Generating 'narration.wav'..."
say -o "$SAMPLES_DIR/narration.aiff" "This is a test of the Whisper speech to text system. It should transcribe this sentence accurately."
ffmpeg -i "$SAMPLES_DIR/narration.aiff" -ar 16000 -ac 1 "$SAMPLES_DIR/narration.wav" -y 2>/dev/null
rm "$SAMPLES_DIR/narration.aiff"
echo "✅ Created narration.wav"

echo ""
echo "=== Sample Generation Complete ==="
echo "Files created in: $SAMPLES_DIR/"
ls -lh "$SAMPLES_DIR"/*.wav
