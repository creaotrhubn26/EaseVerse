function dcRemove(samples: Float32Array): Float32Array {
  if (samples.length === 0) return samples;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    sum += samples[i];
  }
  const mean = sum / samples.length;
  if (!Number.isFinite(mean) || Math.abs(mean) < 1e-8) {
    return samples;
  }
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    out[i] = samples[i] - mean;
  }
  return out;
}

function highPassOnePole(samples: Float32Array, sampleRate: number, cutoffHz: number): Float32Array {
  if (samples.length === 0) return samples;
  const dt = 1 / sampleRate;
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const alpha = rc / (rc + dt);

  const out = new Float32Array(samples.length);
  out[0] = samples[0];
  for (let i = 1; i < samples.length; i += 1) {
    out[i] = alpha * (out[i - 1] + samples[i] - samples[i - 1]);
  }
  return out;
}

function preEmphasis(samples: Float32Array, coeff = 0.97): Float32Array {
  if (samples.length === 0) return samples;
  const out = new Float32Array(samples.length);
  out[0] = samples[0];
  for (let i = 1; i < samples.length; i += 1) {
    out[i] = samples[i] - coeff * samples[i - 1];
  }
  return out;
}

export function preprocessForOnsetDetection(
  samples: Float32Array,
  sampleRate: number
): Float32Array {
  // Keep it lightweight: DC removal + HPF to reduce rumble + pre-emphasis to
  // highlight consonant transients (high-frequency energy).
  const dc = dcRemove(samples);
  const hp = highPassOnePole(dc, sampleRate, 80);
  return preEmphasis(hp, 0.97);
}

