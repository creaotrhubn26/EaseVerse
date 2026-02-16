export type DecodedWav = {
  sampleRate: number;
  channels: number;
  samples: Float32Array; // mono samples normalized to [-1, 1]
};

function readFourCC(buffer: Buffer, offset: number): string {
  return buffer.toString("ascii", offset, offset + 4);
}

function clampSample(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value > 1) return 1;
  if (value < -1) return -1;
  return value;
}

function getInt24LE(buffer: Buffer, offset: number): number {
  // Read 24-bit signed little-endian integer.
  const b0 = buffer[offset];
  const b1 = buffer[offset + 1];
  const b2 = buffer[offset + 2];
  const raw = b0 | (b1 << 8) | (b2 << 16);
  // Sign extend from 24 bits to 32.
  return raw & 0x800000 ? raw | 0xff000000 : raw;
}

export function decodeWav(buffer: Buffer): DecodedWav {
  if (buffer.length < 44) {
    throw new Error("WAV buffer too small");
  }
  if (readFourCC(buffer, 0) !== "RIFF" || readFourCC(buffer, 8) !== "WAVE") {
    throw new Error("Invalid WAV header");
  }

  let fmt: {
    audioFormat: number;
    channels: number;
    sampleRate: number;
    bitsPerSample: number;
  } | null = null;

  let dataOffset = -1;
  let dataSize = 0;

  // Chunks start after RIFF header (12 bytes).
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = readFourCC(buffer, offset);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkDataOffset = offset + 8;
    const next = chunkDataOffset + chunkSize + (chunkSize % 2);

    if (chunkDataOffset + chunkSize > buffer.length) {
      break;
    }

    if (chunkId === "fmt ") {
      if (chunkSize < 16) {
        throw new Error("Invalid WAV fmt chunk");
      }
      const audioFormat = buffer.readUInt16LE(chunkDataOffset);
      const channels = buffer.readUInt16LE(chunkDataOffset + 2);
      const sampleRate = buffer.readUInt32LE(chunkDataOffset + 4);
      const bitsPerSample = buffer.readUInt16LE(chunkDataOffset + 14);
      fmt = { audioFormat, channels, sampleRate, bitsPerSample };
    } else if (chunkId === "data") {
      dataOffset = chunkDataOffset;
      dataSize = chunkSize;
      break;
    }

    offset = next;
  }

  if (!fmt) {
    throw new Error("Missing WAV fmt chunk");
  }
  if (dataOffset < 0 || dataSize <= 0) {
    throw new Error("Missing WAV data chunk");
  }

  const { audioFormat, channels, sampleRate, bitsPerSample } = fmt;
  if (channels <= 0 || channels > 8) {
    throw new Error(`Unsupported WAV channels: ${channels}`);
  }
  if (sampleRate <= 0) {
    throw new Error("Invalid WAV sample rate");
  }

  const bytesPerSample = bitsPerSample / 8;
  if (![1, 2, 3, 4].includes(bytesPerSample)) {
    throw new Error(`Unsupported WAV bit depth: ${bitsPerSample}`);
  }

  const bytesPerFrame = bytesPerSample * channels;
  if (bytesPerFrame <= 0) {
    throw new Error("Invalid WAV frame size");
  }

  const frameCount = Math.floor(dataSize / bytesPerFrame);
  const mono = new Float32Array(frameCount);

  const isPcmInt = audioFormat === 1;
  const isIeeeFloat = audioFormat === 3;
  if (!isPcmInt && !isIeeeFloat) {
    throw new Error(`Unsupported WAV format: ${audioFormat}`);
  }

  let cursor = dataOffset;
  for (let i = 0; i < frameCount; i += 1) {
    let sum = 0;
    for (let ch = 0; ch < channels; ch += 1) {
      let sample: number;
      if (isIeeeFloat) {
        sample = buffer.readFloatLE(cursor);
      } else {
        if (bytesPerSample === 1) {
          sample = (buffer.readUInt8(cursor) - 128) / 128;
        } else if (bytesPerSample === 2) {
          sample = buffer.readInt16LE(cursor) / 32768;
        } else if (bytesPerSample === 3) {
          sample = getInt24LE(buffer, cursor) / 8388608;
        } else {
          sample = buffer.readInt32LE(cursor) / 2147483648;
        }
      }

      sum += clampSample(sample);
      cursor += bytesPerSample;
    }

    mono[i] = sum / channels;
  }

  return { sampleRate, channels, samples: mono };
}

