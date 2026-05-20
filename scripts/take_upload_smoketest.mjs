#!/usr/bin/env node
import { upload } from "@vercel/blob/client";

const TOKEN = process.env.EASEVERSE_PAIR_TOKEN;
const API_BASE = process.env.EASEVERSE_API_BASE_URL || "https://easeverse.vercel.app";

if (!TOKEN) {
  console.error("EASEVERSE_PAIR_TOKEN missing — generate one in /admin and re-run with EASEVERSE_PAIR_TOKEN=pair_xxx");
  process.exit(1);
}

function generateWavBuffer({ durationSec = 1.2, sampleRate = 16000, freqHz = 440 } = {}) {
  const numSamples = Math.floor(durationSec * sampleRate);
  const byteSize = numSamples * 2;
  const buf = Buffer.alloc(44 + byteSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + byteSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(byteSize, 40);
  for (let i = 0; i < numSamples; i++) {
    const v = Math.round(Math.sin((2 * Math.PI * freqHz * i) / sampleRate) * 20000);
    buf.writeInt16LE(v, 44 + i * 2);
  }
  return buf;
}

const trackId = `smoketest-${Date.now()}`;
const filename = `${trackId}.wav`;
const wav = generateWavBuffer();
console.log(`[smoke] generated WAV: ${wav.length} bytes for trackId=${trackId}`);

const result = await upload(filename, new Blob([new Uint8Array(wav)]), {
  access: "public",
  handleUploadUrl: `${API_BASE}/api/takes/upload`,
  clientPayload: JSON.stringify({
    externalTrackId: trackId,
    sourcePath: "/smoketest",
    filename,
  }),
  headers: { Authorization: `Bearer ${TOKEN}` },
});

console.log("[smoke] upload OK");
console.log("  url:     ", result.url);
console.log("  pathname:", result.pathname);

// Poll booth endpoint for the take row + analysis.
const boothUrl = `${API_BASE}/api/booth?trackId=${encodeURIComponent(trackId)}`;
console.log(`[smoke] polling ${boothUrl} for take row + analysis…`);
const start = Date.now();
let lastStatus = "(none)";
while (Date.now() - start < 90_000) {
  const r = await fetch(boothUrl);
  if (r.ok) {
    const json = await r.json();
    const t = json.takes?.[0];
    if (t) {
      if (t.status !== lastStatus) {
        console.log(`  status=${t.status} ${t.aiNotes ? "(notes ready)" : ""}`);
        lastStatus = t.status;
      }
      if (t.status === "done") {
        console.log("[smoke] DONE");
        console.log("  duration:", t.durationSec, "s");
        console.log("  pitch:   ", t.pitchMeanHz, "Hz");
        console.log("  energy:  ", t.energyAvgDb, "dB");
        console.log("  notes:   ", (t.aiNotes || "").slice(0, 200));
        process.exit(0);
      }
      if (t.status === "error") {
        console.error("[smoke] FAILED:", t);
        process.exit(2);
      }
    }
  }
  await new Promise((r) => setTimeout(r, 3000));
}

console.error("[smoke] timed out after 90s — take never reached 'done'");
process.exit(3);
