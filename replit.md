# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies. This is **Zeno**, an AI voice assistant app for Android.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Mobile**: Expo (React Native) — `artifacts/mobile`

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server (port 3000)
│   └── mobile/             # Expo mobile app (Voice Assistant)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers
  - `src/routes/health.ts` — `GET /api/healthz`
  - `src/routes/chat.ts` — `POST /api/chat` (SSE streaming), `POST /api/search` (Tavily + LLM summary), `POST /api/transcribe` (Whisper STT)
  - `src/routes/tts.ts` — `GET /api/tts/voices`, `POST /api/tts` (ElevenLabs streaming audio)

**AI provider priority (chat & transcribe):**
1. **Groq** (`GROQ_API_KEY`) — primary, uses `llama-3.3-70b-versatile` (chat) and `whisper-large-v3` (STT)
2. **OpenRouter** (`OPENROUTER_API_KEY`) — fallback, uses `meta-llama/llama-3.3-70b-instruct` (chat) and `openai/whisper-large-v3` (STT)

**Search (`/api/search`):**
1. Tavily (`TAVILY_API_KEY`) fetches search results
2. Groq (or OpenRouter fallback) summarizes results for voice output

**TTS (`/api/tts`):**
- ElevenLabs (`ELEVENLABS_API_KEY`) — streams MP3 audio, defaults to Rachel voice (`21m00Tcm4TlvDq8ikWAM`)
- Falls back to static voice list if API key not set

### `artifacts/mobile` (`@workspace/mobile`)

Expo mobile app — AI voice assistant powered by LLaMA 3.3 via Groq.

**Navigation structure (Expo Router):**
- `app/index.tsx` — redirects to onboarding or `(tabs)`
- `app/onboarding.tsx` — first-launch screen to name the assistant (suggestions: Zeno, Nova, Aria, Echo, Sage, Orion)
- `app/(tabs)/index.tsx` — **main chat screen**: streaming AI responses, voice recording (Whisper STT), TTS playback, call mode, web search mode, torch control, notification intercept
- `app/(tabs)/messages.tsx` — messages tab (shows WhatsApp/SMS captured via Accessibility Service; currently shows sample data)
- `app/(tabs)/controls.tsx` — device controls UI: flashlight, WiFi, Bluetooth, lock, volume, brightness (all require native Android permissions)
- `app/(tabs)/settings.tsx` — rename assistant, choose TTS provider (ElevenLabs or phone), select voice, set speech rate, view permissions, clear history

**State management (`context/AssistantContext.tsx`):**
- Persisted via AsyncStorage
- Tracks: `assistantName`, `conversations[]`, `currentConversationId`, `phoneVoiceId`, `elVoiceId`, `speechRate`, `ttsProvider`

**TTS providers:**
- `elevenlabs` (default) — calls `/api/tts`, streams MP3 via `expo-av`
- `phone` — uses `expo-speech` (device TTS engine)

**Native modules (`modules/`):**
- `NativeNotifications.ts` — captures WhatsApp & SMS notifications via Android Accessibility Service
- `NativeScreenLock.ts` — locks phone via Device Administrator permission

**Key features:**
- Streaming LLaMA 3.3 chat via Groq (OpenRouter fallback)
- Voice input via Whisper (Groq) with `expo-av` recording
- Web search mode (Tavily + LLM summary)
- Call mode — continuous voice conversation loop
- ElevenLabs or phone TTS for responses
- Conversation history with AsyncStorage persistence
- Dark/light mode (indigo/slate palette)
- Camera/torch control via `expo-camera`
- Notification interception in call mode

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Currently only `/healthz` is specced; chat/search/tts/transcribe routes are implemented directly without spec coverage.

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

## Environment Variables / Secrets

| Variable | Required | Purpose |
|---|---|---|
| `GROQ_API_KEY` | **Primary AI** | LLaMA 3.3 chat + Whisper STT (primary provider) |
| `OPENROUTER_API_KEY` | Fallback AI | LLaMA 3.3 chat + Whisper STT (fallback if Groq fails) |
| `TAVILY_API_KEY` | Web search | Fetches search results for `/api/search` |
| `ELEVENLABS_API_KEY` | TTS | Streams voice audio via ElevenLabs |
| `SESSION_SECRET` | Session security | Express session |
| `DATABASE_URL` | Database | PostgreSQL connection (Replit-managed) |
| `EXPO_PUBLIC_API_URL` | Mobile API URL | Base URL for mobile app to reach API server |
