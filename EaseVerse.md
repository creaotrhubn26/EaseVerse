# EaseVerse - Replit Agent Guide

## Overview

EaseVerse is a mobile-first app for vocalists that captures singing, reveals lyrics in real time, and provides non-interruptive pronunciation coaching. It's built as an Expo (React Native) application with an Express backend server. The app follows a "CreatorHub" design system with a cinematic, dark-themed UI featuring glassmorphism and warm orange accent gradients.

The primary user flow is: **Sing → Review → Practice Loop**, with four bottom navigation tabs: Sing, Lyrics, Sessions, and Profile.

The app records audio via `expo-audio` with live metering for signal quality. Live lyric highlighting is driven by transcript-to-lyrics alignment (`lib/live-lyrics.ts`) and runs in real time on web via the Web Speech API; on native platforms, lyrics are displayed without live word tracking and are scored after the take. Session insights (accuracy, clarity, timing) come from STT + alignment on the server (`/api/v1/session-score`) when OpenAI credentials are configured.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Expo / React Native)

- **Framework**: Expo SDK 55 (preview) with React Native 0.83 + React 19, targeting iOS, Android, and Web
- **Routing**: Expo Router v6 with file-based routing (`app/` directory). Uses typed routes and the React Compiler experiment.
- **State Management**: React Context (`lib/AppContext.tsx`) provides global state for songs, sessions, settings, and the active song. No Redux or Zustand.
- **Local Storage**: AsyncStorage (`@react-native-async-storage/async-storage`) persists songs, sessions, and user settings on-device via `lib/storage.ts`.
- **Data Fetching**: TanStack React Query is set up (`lib/query-client.ts`) with a configured `apiRequest` helper that points to the Express backend via `EXPO_PUBLIC_DOMAIN`. Currently not heavily used since most data is local.
- **UI Libraries**: 
  - `react-native-reanimated` for animations (pulse effects, word underline transitions, VU meter)
  - `react-native-gesture-handler` for touch handling and swipe gestures (swipeable session cards)
  - `expo-haptics` for tactile feedback
  - `expo-linear-gradient` for gradient backgrounds
  - `expo-blur` and `expo-glass-effect` for glassmorphism
  - `@expo-google-fonts/inter` for typography (Inter font family in 4 weights)
  - `@expo/vector-icons` (Ionicons, Feather, MaterialCommunityIcons)
- **Design System**: Dark theme with colors defined in `constants/colors.ts`. Background `#0E0F14`, orange accent gradient (`#FF7A18` → `#FF914D` → `#FFC371`), semantic colors for success/warning/danger states.

### Screen Architecture

| Route | Purpose |
|-------|---------|
| `(tabs)/index` | Sing screen - main recording interface with live lyrics, VU meter, record button, coach pills, song picker modal |
| `(tabs)/lyrics` | Lyrics management - write, structure sections, import lyrics |
| `(tabs)/sessions` | Session history list with swipeable cards, filtering (latest/best/flagged), pull-to-refresh |
| `(tabs)/profile` | User settings (language, accent goal, feedback intensity, live mode) |
| `session/[id]` | Session review detail - interactive waveform scrubber, insights, pronunciation fixes |
| `practice/[id]` | Practice loop - isolated phrase repetition with speed control, animated progress |

### Components

| Component | File | Purpose |
|-----------|------|---------|
| RecordButton | `components/RecordButton.tsx` | Animated gradient record button with pulse ring |
| LiveLyricsCanvas | `components/LiveLyricsCanvas.tsx` | Multi-line lyrics with animated word-level state styling |
| CoachPill | `components/CoachPill.tsx` | Animated pronunciation hint pill |
| QualityPill | `components/QualityPill.tsx` | Signal quality indicator (Good/OK/Poor) |
| VUMeter | `components/VUMeter.tsx` | Animated audio level visualization bars |
| WaveformTimeline | `components/WaveformTimeline.tsx` | Interactive waveform with scrubber for session review |
| SessionCard | `components/SessionCard.tsx` | Session list item with score, tags, favorite |
| SwipeableSessionCard | `components/SwipeableSessionCard.tsx` | Wraps SessionCard with swipe-to-delete/favorite |
| SectionCard | `components/SectionCard.tsx` | Song structure section card with reorder arrows |
| SongPickerModal | `components/SongPickerModal.tsx` | Bottom sheet modal for song selection |

### Backend (Express)

- **Framework**: Express 5 running on Node.js
- **Location**: `server/` directory with `index.ts` (entry), `routes.ts` (API routes), `storage.ts` (data layer)
- **Current State**: Serves the app, exposes integration endpoints under `/api/v1` (optional API key auth), and provides chat/audio/image integrations under `/api/*`. Uses Postgres-backed storage when `DATABASE_URL` is set (with an in-memory fallback for local/dev).
- **Build**: Uses `esbuild` to bundle server for production, `tsx` for development

### Database

- **ORM**: Drizzle ORM configured for PostgreSQL (`drizzle.config.ts`)
- **Schema**: `shared/schema.ts` defines a `users` table (id, username, password) with Zod validation via `drizzle-zod`
- **Current Storage**: Server uses Postgres when `DATABASE_URL` is set (users, chat, collab lyrics), with in-memory fallback when it is missing.

### Key Architectural Decisions

1. **Local-first data**: Songs, sessions, and settings are stored in AsyncStorage on the client. The server is not yet the source of truth.
2. **Shared schema directory**: `shared/` contains types and schemas used by both frontend and backend.
3. **Live lyrics via transcript alignment**: `lib/live-lyrics.ts` aligns transcript to lyrics to drive active/confirmed word states (real time on web via Web Speech API).
4. **STT-based scoring**: `/api/v1/session-score` uses OpenAI STT + alignment for credible coaching, with graceful degradation when AI keys are missing.
5. **External integrations**: `/api/v1/collab/lyrics` supports third-party lyric draft syncing (optional API key auth via `EXTERNAL_API_KEY`).
6. **Path aliases**: `@/*` maps to project root, `@shared/*` maps to `./shared/*`.

### Recent Changes

- Removed demo auto-seeding; real empty-state behavior.
- Sing screen now uses transcript-to-lyrics alignment for live word states (real time on web via Web Speech API), and settings like `countIn`, `liveMode`, and `feedbackIntensity` affect behavior.
- Practice loop now plays real phrase audio via `/api/tts`, and practice speed controls playback rate.
- Fixed duplicate-line lyrics parsing bug by switching to index-based sectioning (`lib/lyrics-sections.ts`).
- Session scoring upgraded to STT + alignment (server `/api/v1/session-score`), with explicit graceful degradation when AI services are unavailable.
- Added `/api/v1` integration API (catalog + OpenAPI spec) and `/api/v1/collab/lyrics` for external lyric draft syncing.
- Hardened server: auto-load `.env`, CORS improvements, optional API keys + rate limiting.
- Persisted users/chat to Postgres when `DATABASE_URL` is set (memory fallback otherwise).
- CI now runs lint, typecheck, and tests.
- Repo hygiene: removed accidental nested submodule clone entry.

### Development Workflow

- **Dev mode**: Run `expo:dev` and `server:dev` concurrently. The Expo dev server proxies through the Replit domain.
- **Production build**: `expo:static:build` creates a static web bundle, `server:build` + `server:prod` serves it.

## External Dependencies

- **OpenAI via Replit AI Integrations**: Used for pronunciation coach (GPT-4o-mini for phonetic analysis, TTS for spoken pronunciation). API key managed via `AI_INTEGRATIONS_OPENAI_API_KEY`.
- **No authentication service**: User auth schema exists in Drizzle but no auth flow is implemented.
- **Fonts**: Inter font loaded from `@expo-google-fonts/inter` (bundled, not external CDN).
