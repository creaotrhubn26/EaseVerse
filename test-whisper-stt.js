// Test Whisper STT with audio file
import { readFileSync } from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

const SERVER_URL = 'http://localhost:5059';
const API_KEY = 'ev_scr_bdb8e017d661815c008c2f62d04b4b0cfefaca7b8d4b67330ed6d62160acf767';

async function testWhisperSTT() {
  console.log('=== Testing Whisper STT Integration ===\n');

  try {
    readFileSync('.env', 'utf8');
  } catch {
    console.warn('⚠️ .env file not found; ensure API keys are available in environment variables');
  }
  
  // Test 1: Generate a simple WAV file using text-to-speech first
  console.log('Step 1: Generating test audio using ElevenLabs TTS...');
  
  try {
    const ttsResponse = await fetch(`${SERVER_URL}/api/tts/elevenlabs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'ev_ext_eba1a3d307fa488e57d2a35d5878a18b74e2b4e0f75f6a8f04df8a8b19887ec1'
      },
      body: JSON.stringify({
        text: 'Hello world, this is a test of speech to text',
        voiceId: 'EXAVITQu4vr4xnSDxMaL',
        modelId: 'eleven_multilingual_v2'
      })
    });
    
    if (!ttsResponse.ok) {
      throw new Error(`TTS failed: ${ttsResponse.status} ${await ttsResponse.text()}`);
    }
    
    const audioBuffer = await ttsResponse.buffer();
    console.log(`✅ Generated ${audioBuffer.length} bytes of audio\n`);
    
    // Test 2: Transcribe the audio using session-score endpoint
    console.log('Step 2: Transcribing audio with Whisper STT...');
    
    const form = new FormData();
    form.append('audioBlob', audioBuffer, {
      filename: 'test.mp3',
      contentType: 'audio/mpeg'
    });
    form.append('lyrics', 'Hello world, this is a test of speech to text');
    form.append('durationSeconds', '5');
    
    const scoreResponse = await fetch(`${SERVER_URL}/api/session-score`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        ...form.getHeaders()
      },
      body: form
    });
    
    if (!scoreResponse.ok) {
      const errorText = await scoreResponse.text();
      throw new Error(`Session score failed: ${scoreResponse.status} ${errorText}`);
    }
    
    const result = await scoreResponse.json();
    console.log('✅ Transcription result:');
    console.log(JSON.stringify(result, null, 2));
    
    console.log('\n=== Whisper STT Test Complete ===');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testWhisperSTT();
