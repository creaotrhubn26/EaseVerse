# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

EaseVerse is a mobile-first vocalist/songwriter app: record singing, see lyrics highlight in real time, and get non-interruptive pronunciation coaching. The primary flow is **Sing → Review → Practice Loop**, exposed through four tabs (Sing, Lyrics, Sessions, Profile). It ships as a single Expo codebase targeting iOS, Android, and Web (PWA), backed by an Express API in the same repo.

A separate `companion/` package is a desktop bridge that pushes Pro Tools session exports into the EaseVerse `/api/v1/collab/protools` endpoint.

## Commands

Frontend / Expo:
- `npm start` — Expo dev server (local)
- `npm run expo:dev` — Expo dev server configured for Replit proxy (uses `REPLIT_DEV_DOMAIN`)
- `npm run web:build` — Export web bundle to `web-build/` and run the web budget check
- `npm run assets:optimize:web` — Optimize web-critical images before shipping (called implicitly by budget)

Server:
- `npm run server:dev` — Express in dev mode via `tsx`
- `npm run server:build` — Bundle server with esbuild to `server_dist/`
- `npm run server:prod` — Run the bundled server (`NODE_ENV=production`)

Quality gates (run by CI in `.github/workflows/ci.yml`):
- `npm run lint` / `npm run lint:fix`
- `npm run typecheck` — `tsc --noEmit` across the Expo app
- `npm run test` — `tsx --test tests/**/*.test.ts` (Node's built-in test runner)
- Single test file: `npx tsx --test tests/<file>.test.ts`

End-to-end (Playwright, see `playwright.config.ts`):
- `npm run e2e:smoke` — workflow + PWA smoke (builds server + web first)
- `npm run e2e:ux-audit` — UX audit suite (uses its own web build with `EXPO_PUBLIC_DISABLE_LEARNING=1`)
- `npm run e2e:full` — full `e2e/` suite
- Single spec: `npx playwright test e2e/workflow.spec.ts`
- Playwright spins up its own `npm run server:prod` on port `5051` and disables API key enforcement for the run.

Database:
- `npm run db:push` — apply Drizzle schema to Postgres (requires `DATABASE_URL`)
- Schema lives in `shared/schema.ts`; SQL migrations in `migrations/`

Pro Tools companion (separate process, same repo):
- `npm run companion:dev` — start the bridge (`companion/src/index.ts`)
- `npm run companion:typecheck` — uses `companion/tsconfig.json`
- `npm run companion:demo` — parse the bundled sample and push to the API
- `npm run companion:healthcheck` / `:ci` — deterministic end-to-end verification

## Architecture

### Two TypeScript projects in one repo

- The Expo app uses the root `tsconfig.json` (extends `expo/tsconfig.base`, paths `@/*` → repo root, `@shared/*` → `./shared/*`). `EaseVerse/**` is excluded — do not create files under that path.
- The companion is a separate project under `companion/` with its own `tsconfig.json`. The root typecheck does not cover it; run `npm run companion:typecheck` separately.
- `shared/` is intentionally shared by frontend, backend, and companion (types, Zod schemas, scoring helpers). Treat it as a contract surface.

### Frontend (Expo Router, file-based)

Routes live in `app/`:
- `app/(tabs)/` → `index` (Sing), `lyrics`, `sessions`, `profile`
- `app/session/[id].tsx`, `app/practice/[id].tsx` → review + practice-loop screens
- `app/easepocket.tsx`, `app/mindfulness.tsx`, `app/warmup.tsx` → standalone features
- `app/_layout.tsx` owns global providers; `app/+native-intent.tsx` and `app/+not-found.tsx` are Expo Router conventions

State + persistence:
- `lib/AppContext.tsx` is the single global store (songs, sessions, settings, active song) — no Redux/Zustand.
- `lib/storage.ts` persists to AsyncStorage on device. The server is **not** the source of truth for user content; data is local-first.
- TanStack React Query is wired (`lib/query-client.ts`) for server calls but is lightly used today.

Live lyrics + scoring:
- `lib/live-lyrics.ts` aligns STT transcript words to the lyric line to drive active/confirmed word states. On **web** this runs in real time via the Web Speech API; on **native** lyrics display without word-level tracking and scoring happens after the take.
- After-the-fact scoring goes through `lib/session-scoring-client.ts` → server `/api/v1/session-score` (OpenAI STT + alignment). Server degrades gracefully when AI keys are missing.
- `lib/lyrics-sections.ts` parses song structure using **index-based** sectioning (a duplicate-line bug was the reason for this; do not regress to text-keyed parsing).

iPad/Apple Pencil:
- `components/LyricsWriterStudio.tsx` + `components/PencilInkLayer.tsx` implement Paper Mode, iOS Scribble integration, and pressure-sensitive ink. iPad-only features auto-detect device — preserve that gating.

### Backend (Express 5)

- Entry `server/index.ts` auto-loads `.env` and `.env.local` (no `dotenv` dep), configures CORS, trust-proxy, body parsing (25 MB cap), and request logging, then dynamically imports `server/routes.ts`.
- `server/routes.ts` (~2,100 lines) is the single route registry. All third-party-callable endpoints live under `/api/v1` and share an API-key middleware (env: `EXTERNAL_API_KEY`, plus per-route `PRONOUNCE_API_KEY` / `SESSION_SCORING_API_KEY`). Internal `/api/*` aliases exist for the app itself.
- Storage layer: `server/storage.ts` uses Postgres when `DATABASE_URL` is set; otherwise an in-memory fallback for local/dev. Do not assume durability without `DATABASE_URL`.
- WebSocket: `server/collab-ws.ts` exposes `/api/v1/ws` and emits `collab_lyrics_updated` whenever lyrics drafts are upserted.
- AI integrations are isolated per file: `server/gemini-coach.ts`, `server/elevenlabs.ts`, `server/whisper-stt.ts`, `server/replit_integrations/` (OpenAI), `server/easepocket/` (consonant onset analysis), `server/learning/` (per-user model + global model). Prefer adding new AI vendors as sibling modules rather than expanding existing ones.
- The server also serves the exported PWA at `/` when `web-build/index.html` exists, with `/app` → `/` redirects for legacy paths.

### Integration surface (treat as stable)

`/api/v1` is consumed by external systems including the Pro Tools companion and `creatorhub`. Key endpoints to avoid breaking:
- `POST /api/v1/tts`, `/pronounce`, `/session-score`
- `POST|GET /api/v1/collab/lyrics`, `/collab/protools` (+ `GET /collab/protools/:externalTrackId`)
- `WS /api/v1/ws?apiKey=…&source=…&projectId=…`
- Discovery: `GET /api/v1`, `GET /api/v1/openapi.json`, `GET /api/v1/health`

When changing these, update `EaseVerse.md`/`README.md` API sections and consider companion compatibility.

### Design system

Colors and theming in `constants/colors.ts` — dark background `#0E0F14` with the orange accent gradient (`#FF7A18` → `#FF914D` → `#FFC371`). Inter (4 weights) is the type family. UI leans on glassmorphism (`expo-blur`, `expo-glass-effect`) and Reanimated for motion. The React Compiler experiment is **on** (`app.json` → `experiments.reactCompiler: true`); avoid patterns that defeat auto-memoization (e.g. inline object identities passed to memoized children where it matters).

## Conventions worth knowing

- Path aliases: import from `@/lib/...` and `@shared/...`. Don't reach into `companion/` from the Expo app or vice versa — go through `shared/`.
- `tests/` uses `node:test` via `tsx` (no Jest). Tests are pure TS without a DOM; UI is covered by Playwright in `e2e/`.
- `patches/` is applied by `patch-package` on `postinstall` — when bumping a patched dep, refresh the patch rather than deleting it.
- The repo has been used on Replit; `expo:dev` and CORS logic key off `REPLIT_DEV_DOMAIN`/`REPLIT_DOMAINS`. Local dev works without those, but expect those code paths.
- `npm run web:build` enforces `web-budget` (`scripts/check_web_budget.mjs`) — if it fails, optimize assets (`assets:optimize:web`) rather than raising the limit.
- Avoid recreating the legacy `/app` route as a real page; it exists only as a redirect to `/`.
