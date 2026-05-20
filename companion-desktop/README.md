# EaseVerse Studio Companion (Desktop)

Cross-platform Tauri 2.x app for Mac, Windows, and Linux. Watches the Pro
Tools `Audio Files/` folder, debounces unstable writes, and uploads each
new WAV/AIFF to EaseVerse via direct-blob-upload using a short-lived
pairing token from `/admin`.

## What this replaces

The CLI in `companion/` did the same thing but required `git clone &&
npm install`. This Tauri app ships as a native installer (~10 MB) so
non-technical studio users can double-click and go.

## Local dev (requires Rust toolchain)

```bash
# Install Rust if you don't have it: https://rustup.rs
cd companion-desktop
npm install
npm run dev
```

## Build production installers

CI builds for all three platforms automatically on tag push — see
`.github/workflows/companion-desktop.yml`. To build locally:

```bash
npm run build
# Output lands in src-tauri/target/release/bundle/
```

## How a studio uses the app

1. Producer opens `https://easeverse.vercel.app/admin`, clicks
   **Generate pairing code**, copies the `pair_…` token.
2. Producer launches **EaseVerse Companion**, pastes the token, picks
   the Pro Tools `Audio Files/` folder, clicks **Start watching**.
3. Every new stable WAV is uploaded to EaseVerse and shows up in the
   booth view at `https://easeverse.vercel.app/booth/<trackId>` for the
   vocalist.

Pairing tokens expire after 15 minutes. Generate a new one any time —
the companion just needs a fresh token; folder/track settings are
remembered between launches.
