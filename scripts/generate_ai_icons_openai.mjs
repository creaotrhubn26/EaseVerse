#!/usr/bin/env node

/**
 * AI icon generation for EaseVerse using OpenAI Images API.
 *
 * Usage:
 *   OPENAI_API_KEY=... node scripts/generate_ai_icons_openai.mjs
 *   npm run icons:ai
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import OpenAI from "openai";

const ROOT = process.cwd();
const ICON_SET_DIR = path.join(ROOT, "assets", "images", "icon-set");
const IMAGES_DIR = path.join(ROOT, "assets", "images");

function loadDotEnvIfPresent() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }
  const text = fs.readFileSync(envPath, "utf8");
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function extractBase64Image(dataItem) {
  if (!dataItem || typeof dataItem !== "object") return null;
  if (typeof dataItem.b64_json === "string") return dataItem.b64_json;
  if (typeof dataItem.image_base64 === "string") return dataItem.image_base64;
  if (typeof dataItem.base64 === "string") return dataItem.base64;
  return null;
}

function ensureDirFor(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function buildPrompt({ concept, withBadge }) {
  const globalStyle = [
    "Create a premium iOS-style app icon asset for EaseVerse.",
    "Visual language: Apple Human Interface inspired, clean, modern, polished.",
    "Color accents: deep navy, white, sky blue, warm orange.",
    "No text, no letters, no watermark, no logo marks.",
    "Centered composition, high contrast, crisp edges, professional product quality.",
  ].join(" ");

  const badgeStyle = withBadge
    ? "Include a rounded-square glossy dark-navy icon tile background with soft depth and subtle lighting."
    : "Transparent background only; do not include any tile or panel background.";

  return `${globalStyle} ${badgeStyle} Main symbol: ${concept}.`;
}

const ICON_SPECS = [
  {
    path: path.join(ICON_SET_DIR, "Singing.png"),
    concept: "minimal microphone with a small voice waveform accent",
    withBadge: true,
  },
  {
    path: path.join(ICON_SET_DIR, "Lyrics.png"),
    concept: "document page and music note merged into one clear symbol",
    withBadge: true,
  },
  {
    path: path.join(ICON_SET_DIR, "sessions.png"),
    concept: "stack of session pages representing history",
    withBadge: true,
  },
  {
    path: path.join(ICON_SET_DIR, "Profile.png"),
    concept: "person avatar bust outline symbol",
    withBadge: true,
  },
  {
    path: path.join(ICON_SET_DIR, "Live_mode.png"),
    concept: "live indicator frame with a subtle status dot",
    withBadge: true,
  },
  {
    path: path.join(ICON_SET_DIR, "Lyrics_sync.png"),
    concept: "circular sync arrows around a lyric sheet symbol",
    withBadge: true,
  },
  {
    path: path.join(ICON_SET_DIR, "Feedback_intensity_high.png"),
    concept: "bar chart icon showing high feedback intensity",
    withBadge: true,
  },
  {
    path: path.join(ICON_SET_DIR, "Feedback_intensity_low.png"),
    concept: "bar chart icon showing low feedback intensity",
    withBadge: true,
  },
  {
    path: path.join(ICON_SET_DIR, "Mindfullness_voice.png"),
    concept: "mindfulness voice icon with microphone and calm waveform",
    withBadge: true,
  },
  {
    path: path.join(ICON_SET_DIR, "Language_accent.png"),
    concept: "language and accent symbol combining globe and speech bubble",
    withBadge: true,
  },
  {
    path: path.join(ICON_SET_DIR, "howto-icon.png"),
    concept: "how-to guide icon with clipboard and play button hint",
    withBadge: true,
  },
  {
    path: path.join(IMAGES_DIR, "record_icon.png"),
    concept: "record button symbol, strong circular recording motif",
    withBadge: false,
  },
  {
    path: path.join(IMAGES_DIR, "Stop_icon.png"),
    concept: "stop symbol, rounded square with clear stop semantics",
    withBadge: false,
  },
  {
    path: path.join(IMAGES_DIR, "metronome_icon.png"),
    concept: "metronome symbol for tempo",
    withBadge: false,
  },
  {
    path: path.join(IMAGES_DIR, "flag_icon.png"),
    concept: "marker flag icon for checkpoints",
    withBadge: false,
  },
  {
    path: path.join(IMAGES_DIR, "bpm_icon.png"),
    concept: "tempo BPM icon with metronome and pulse line",
    withBadge: false,
  },
  {
    path: path.join(IMAGES_DIR, "count_in_icon.png"),
    concept: "count-in icon with beat progression dots and timing cue",
    withBadge: false,
  },
  {
    path: path.join(IMAGES_DIR, "lyrics_flow_speed_icon.png"),
    concept: "lyrics flow speed icon with directional progression lines",
    withBadge: false,
  },
  {
    path: path.join(IMAGES_DIR, "about_icon.png"),
    concept: "about information symbol clean circular i-mark style",
    withBadge: false,
  },
  {
    path: path.join(IMAGES_DIR, "nosong_state.png"),
    concept: "no song state icon, muted document-note state",
    withBadge: false,
  },
  {
    path: path.join(IMAGES_DIR, "Female.png"),
    concept: "female profile avatar icon",
    withBadge: false,
  },
  {
    path: path.join(IMAGES_DIR, "Male.png"),
    concept: "male profile avatar icon",
    withBadge: false,
  },
  {
    path: path.join(IMAGES_DIR, "two_beats.png"),
    concept: "two-beat timing icon with exactly two beat marks",
    withBadge: false,
  },
  {
    path: path.join(IMAGES_DIR, "four_beats.png"),
    concept: "four-beat timing icon with exactly four beat marks",
    withBadge: false,
  },
  {
    path: path.join(IMAGES_DIR, "EasePocket.png"),
    concept: "EasePocket symbol with pulse wave inside circular timing motif",
    withBadge: true,
  },
];

async function generateOne(client, spec, index, total) {
  const prompt = buildPrompt(spec);
  process.stdout.write(`[${index + 1}/${total}] ${path.relative(ROOT, spec.path)} ... `);

  const response = await client.images.generate({
    model: "gpt-image-1",
    prompt,
    size: "1024x1024",
    background: spec.withBadge ? "opaque" : "transparent",
  });

  if (!response?.data?.length) {
    throw new Error("No image data returned");
  }

  const b64 = extractBase64Image(response.data[0]);
  if (!b64) {
    throw new Error("Image payload missing base64 field");
  }

  const buffer = Buffer.from(b64, "base64");
  ensureDirFor(spec.path);
  fs.writeFileSync(spec.path, buffer);
  process.stdout.write("ok\n");
}

async function main() {
  loadDotEnvIfPresent();
  const apiKey =
    process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!apiKey) {
    console.error(
      "Missing OPENAI_API_KEY (or AI_INTEGRATIONS_OPENAI_API_KEY). Add one to .env or export it in shell."
    );
    process.exit(1);
  }

  const client = new OpenAI({ apiKey });

  for (let index = 0; index < ICON_SPECS.length; index += 1) {
    const spec = ICON_SPECS[index];
    try {
      await generateOne(client, spec, index, ICON_SPECS.length);
    } catch (error) {
      console.error(`failed: ${path.relative(ROOT, spec.path)}`);
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  console.log("AI icon generation complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
