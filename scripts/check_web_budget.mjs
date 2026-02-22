#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const WEB_BUILD_DIR = path.join(ROOT, "web-build");
const WEB_JS_DIR = path.join(WEB_BUILD_DIR, "_expo", "static", "js", "web");
const WEB_IMAGE_DIR = path.join(ROOT, "assets", "images", "web");

const MAX_ENTRY_JS_BYTES = 3_400_000;
const MAX_WEB_IMAGE_TOTAL_BYTES = 3_300_000;
const PER_FILE_LIMITS = {
  "easeverse_logo_App.web.png": 700_000,
  "warmup-icon.web.png": 1_350_000,
  "mindfulness-icon.web.png": 1_350_000,
};

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

function fail(message) {
  console.error(`Web budget check failed: ${message}`);
  process.exit(1);
}

function ensureDir(dirPath, label) {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    fail(`${label} directory is missing at ${path.relative(ROOT, dirPath)}.`);
  }
}

function checkEntryBundleBudget() {
  ensureDir(WEB_JS_DIR, "web bundle");
  const candidates = fs
    .readdirSync(WEB_JS_DIR)
    .filter((name) => name.startsWith("entry-") && name.endsWith(".js"));

  if (candidates.length === 0) {
    fail(`could not find entry bundle in ${path.relative(ROOT, WEB_JS_DIR)}.`);
  }

  const entryPath = path.join(WEB_JS_DIR, candidates[0]);
  const size = fs.statSync(entryPath).size;
  if (size > MAX_ENTRY_JS_BYTES) {
    fail(
      `entry bundle ${candidates[0]} is ${humanSize(size)}; limit is ${humanSize(
        MAX_ENTRY_JS_BYTES
      )}.`
    );
  }

  return { file: candidates[0], size };
}

function checkWebImageBudgets() {
  ensureDir(WEB_IMAGE_DIR, "optimized web images");
  let total = 0;
  for (const [name, maxBytes] of Object.entries(PER_FILE_LIMITS)) {
    const imagePath = path.join(WEB_IMAGE_DIR, name);
    if (!fs.existsSync(imagePath)) {
      fail(`missing optimized image ${path.relative(ROOT, imagePath)}.`);
    }
    const size = fs.statSync(imagePath).size;
    total += size;
    if (size > maxBytes) {
      fail(`${name} is ${humanSize(size)}; limit is ${humanSize(maxBytes)}.`);
    }
  }

  if (total > MAX_WEB_IMAGE_TOTAL_BYTES) {
    fail(
      `optimized web image total is ${humanSize(total)}; limit is ${humanSize(
        MAX_WEB_IMAGE_TOTAL_BYTES
      )}.`
    );
  }

  return total;
}

const entry = checkEntryBundleBudget();
const imageTotal = checkWebImageBudgets();

console.log(
  `Web budget OK: ${entry.file}=${humanSize(entry.size)}, web-images=${humanSize(
    imageTotal
  )}`
);
