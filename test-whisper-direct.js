// Direct Whisper test - bypasses server to isolate issue
import { pipeline } from '@xenova/transformers';
import { readFile, writeFile, unlink } from 'fs/promises';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { WaveFile } from 'wavefile';
import { tmpdir } from 'os';
import { join } from 'path';

async function decodeAudio(audioPath) {
  const inputBuffer = await readFile(audioPath);
  const inputFile = join(tmpdir(), `whisper-test-input-${Date.now()}.audio`);
  const outputFile = join(tmpdir(), `whisper-test-output-${Date.now()}.wav`);

  try {
    await writeFile(inputFile, inputBuffer);

    // Convert to 16kHz mono WAV
    await new Promise((resolve, reject) => {
      const ffmpeg = spawn(ffmpegPath, [
        '-i', inputFile,
        '-ar', '16000',
        '-ac', '1',
        '-f', 'wav',
        '-y',
        outputFile
      ]);

      ffmpeg.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}`));
      });

      ffmpeg.on('error', reject);
    });

    // Read WAV
    const wavBuffer = await readFile(outputFile);
    const wav = new WaveFile(wavBuffer);
    const samples = wav.getSamples(false, Float32Array);

    // Normalize int16 to float32 range (-1.0 to 1.0)
    // wavefile returns int16 values, need to normalize
    const normalized = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      normalized[i] = samples[i] / 32768.0;
    }

    await unlink(inputFile).catch(() => {});
    await unlink(outputFile).catch(() => {});
    return normalized;
  } catch (error) {
    await unlink(inputFile).catch(() => {});
    await unlink(outputFile).catch(() => {});
    throw error;
  }
}

async function testWhisper() {
  const audioFile = process.argv[2] || 'samples/hello.wav';
  
  console.log('=== Direct Whisper Test ===');
  console.log('Audio file:', audioFile);
  console.log('');
  
  try {
    // Initialize Whisper
    console.log('1. Loading Whisper model (whisper-base.en)...');
    const transcriber = await pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-base.en'
    );
    console.log('✅ Model loaded');
    console.log('');
    
    // Decode audio
    console.log('2. Decoding audio...');
    const audioSamples = await decodeAudio(audioFile);
    console.log(`✅ Decoded ${audioSamples.length} samples (${(audioSamples.length / 16000).toFixed(2)}s)`);
    
    // Analyze audio content
    const min = Math.min(...audioSamples);
    const max = Math.max(...audioSamples);
    const mean = audioSamples.reduce((sum, v) => sum + Math.abs(v), 0) / audioSamples.length;
    console.log(`   Raw audio stats: min=${min.toFixed(4)}, max=${max.toFixed(4)}, mean(abs)=${mean.toFixed(4)}`);
    console.log('');
    
    // Test with different configurations
    console.log('3. Testing transcription...');
    
    // Test 1: Basic transcription
    console.log('\n  Test A: Basic (no language specified)');
    const result1 = await transcriber(audioSamples, {
      return_timestamps: false,
    });
    console.log('  Result:', JSON.stringify(result1, null, 2));
    
    // Test 2: With English language
    console.log('\n  Test B: With language="en"');
    const result2 = await transcriber(audioSamples, {
      language: 'en',
      task: 'transcribe',
      return_timestamps: false,
    });
    console.log('  Result:', JSON.stringify(result2, null, 2));
    
    // Test 3: With timestamps
    console.log('\n  Test C: With timestamps');
    const result3 = await transcriber(audioSamples, {
      language: 'en',
      task: 'transcribe',
      return_timestamps: true,
    });
    console.log('  Result:', JSON.stringify(result3, null, 2));
    
    console.log('\n=== Test Complete ===');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testWhisper();
