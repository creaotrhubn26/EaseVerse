# EaseVerse - Replit Agent Guide

## Overview

EaseVerse is a mobile-first app for vocalists that captures singing, reveals lyrics in real time, and provides non-interruptive pronunciation coaching. It's built as an Expo (React Native) application with an Express backend server. The app follows a "CreatorHub" design system with a cinematic, dark-themed UI featuring glassmorphism and warm orange accent gradients.

The primary user flow is: **Sing → Review → Practice Loop**, with four bottom navigation tabs: Sing, Lyrics, Sessions, and Profile.

The app uses real microphone recording via expo-av with live audio metering. Word states (confirmed/unclear/mismatch) are determined by actual audio levels captured during singing. Session insights (accuracy, pronunciation clarity, timing) are derived from real recorded audio data. A pronunciation coach powered by OpenAI provides phonetic breakdowns and spoken demonstrations of correct word pronunciation.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Expo / React Native)

- **Framework**: Expo SDK 54 with React Native 0.81, targeting iOS, Android, and Web
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
- **Current State**: Minimal — has CORS setup for Replit domains and localhost, serves a landing page HTML template, and has a basic in-memory user storage. API routes are mostly empty.
- **Build**: Uses `esbuild` to bundle server for production, `tsx` for development

### Database

- **ORM**: Drizzle ORM configured for PostgreSQL (`drizzle.config.ts`)
- **Schema**: `shared/schema.ts` defines a `users` table (id, username, password) with Zod validation via `drizzle-zod`
- **Current Storage**: Server uses `MemStorage` (in-memory Map) — not yet connected to Postgres.

### Key Architectural Decisions

1. **Local-first data**: Songs, sessions, and settings are stored in AsyncStorage on the client. The server is not yet the source of truth.
2. **Shared schema directory**: `shared/` contains types and schemas used by both frontend and backend.
3. **Demo data simulation**: `lib/demo-data.ts` provides mock songs and sessions. The Sing screen simulates word-by-word progression using `setInterval` timers.
4. **Path aliases**: `@/*` maps to project root, `@shared/*` maps to `./shared/*`.

### Recent Changes

- Added VU meter with animated bars for audio level visualization on Sing screen
- Added song picker bottom sheet modal for selecting songs
- Added swipe-to-delete and swipe-to-favorite on session cards using react-native-gesture-handler Swipeable
- Animated word underlines in LiveLyricsCanvas with smooth fade-in transitions
- Interactive waveform scrubber with drag-to-seek on Session Review screen
- Pull-to-refresh on Sessions list
- Filter badges with icons on Sessions screen
- Best score stat in Sessions header
- Fixed stale closure bug in handleStop: duration now tracked via useRef (durationRef) alongside state, so session creation works correctly after recording stops
- Migrated all shadow* style props to boxShadow syntax (RecordButton, Lyrics, Session Review, Practice Loop, ErrorFallback)
- Migrated pointerEvents from props to style to avoid deprecation warnings
- Added pointerEvents:'none' to RecordButton pulse ring to prevent click interception
- Added pointerEvents:'box-none' to lyrics area and zIndex to topBar/controls for proper click targeting on web
- Added genre system: 8 genres (Pop, Jazz, R&B, Rock, Classical, Hip-Hop, Country, Soul) with genre-specific vocal coaching
- Each genre has unique color, icon, vocal style, techniques, word-level pronunciation rules, timing style, and breathing tips
- Genre picker on Lyrics screen lets users tag each song with a genre
- Sing screen shows genre badge and vocal style tip, coach hints now genre-aware
- Session Review shows genre coaching section with techniques, timing advice, and breathing tips
- Session cards show genre badge in the chips row
- Song picker modal shows genre icon and label per song
- Added mindfulness feature for pre-performance mental preparation:
  - 6 mood states (anxious, scattered, low, neutral, energized, confident) with personalized plans
  - 4 breathing patterns (Box, 4-7-8, Power Breath, Singer Breath) with animated breath circle
  - 5 energy channeling techniques (Grounding 5-4-3-2-1, Power Stance, Shake It Out, Focus Word, Channel the Fire)
  - 3 guided visualizations (Golden Light, Perfect Take, Safe Space) with narration flow
  - Mood-specific affirmations for vocalists
  - Multi-phase flow: mood check-in → personalized plan → breathing → technique → visualization → affirmation → ready
  - Heart icon button on Sing screen navigates to mindfulness (app/mindfulness.tsx)
  - Data in constants/mindfulness.ts
- Eliminated all `as any` type assertions — icon types use `ComponentProps<typeof Ionicons>['name']` pattern
- Wired all previously unused variables with real functionality (Alert validation, Feather icons, animations, progress displays)
- Fixed unescaped entities in warmup.tsx
- Added real microphone recording using expo-av with audio metering (lib/useRecording.ts)
- VU meter now shows real audio levels from microphone, not random animation
- Signal quality indicator (Good/OK/Poor) now based on real audio levels (>0.4=good, >0.15=ok, else poor)
- Word states (confirmed/unclear/mismatch) in LiveLyricsCanvas now derived from actual audio levels per word
- Session insights (textAccuracy, pronunciationClarity, timingConsistency) computed from real recorded audio levels
- Top-to-fix words in sessions derived from actual low-level words in the recording
- Added pronunciation coach API endpoint (`/api/pronounce`) using OpenAI GPT-4o-mini for phonetic breakdowns and TTS for spoken pronunciation
- Built `usePronunciationCoach` hook (lib/usePronunciationCoach.ts) for frontend to fetch and play pronunciation demonstrations
- Session Review "Top to Fix" items now have tap-to-hear: tap any word to hear AI-generated pronunciation with phonetic spelling and singing tip
- Practice Loop screen has "Hear pronunciation" button that picks the hardest word in selected phrase and plays pronunciation
- Coach panel shows phonetic spelling (e.g., "ee-KWUHL"), singing tip, speaking indicator, and replay button

### Development Workflow

- **Dev mode**: Run `expo:dev` and `server:dev` concurrently. The Expo dev server proxies through the Replit domain.
- **Production build**: `expo:static:build` creates a static web bundle, `server:build` + `server:prod` serves it.

## External Dependencies

- **OpenAI via Replit AI Integrations**: Used for pronunciation coach (GPT-4o-mini for phonetic analysis, TTS for spoken pronunciation). API key managed via `AI_INTEGRATIONS_OPENAI_API_KEY`.
- **No authentication service**: User auth schema exists in Drizzle but no auth flow is implemented.
- **Fonts**: Inter font loaded from `@expo-google-fonts/inter` (bundled, not external CDN).
