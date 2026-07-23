# Zeno — Voice-Controlled AI Assistant

🎤 A comprehensive voice-controlled personal assistant for Android built with React Native/Expo, combining multimodal AI with deep Android system integration.

## 📱 Overview

**Zeno** is an intelligent voice assistant that brings hands-free control to your Android phone. It combines fast AI conversation (Groq / LLaMA 3.3), vision analysis (Gemini 2.0 Flash), web search (Tavily), and premium text-to-speech (ElevenLabs / Kokoro) with native Android capabilities — controlling flashlight, brightness, volume, screen lock, notifications, and even automating word games.

## 🎯 Key Features

### 1. AI Conversation
- **LLaMA 3.3 70B** via Groq (primary), OpenRouter, or local Ollama
- Natural language understanding with conversation history
- Voice input with real-time audio recording and Whisper transcription
- Text-to-speech responses (ElevenLabs, Kokoro self-hosted, or system TTS)
- Streaming responses for low-latency interaction
- "Hey Zeno" wake-word support

### 2. Multimodal AI
- 📷 **Vision** — describe any image or screenshot using Gemini 2.0 Flash
- 🔍 **Web Search** — live search via Tavily, summarized by AI
- 🎮 **Game Assist** — analyze word-puzzle screenshots, return tap coordinates for automation

### 3. Phone Controls (Voice-Activated)
- 🔦 **Flashlight** — toggle on/off
- 🔆 **Screen Brightness** — set, raise, or lower
- 🔊 **Volume** — control media and ringer volume
- 📊 **Battery Status** — check device battery level
- 📞 **Phone Calls** — initiate calls to contacts
- 💬 **SMS** — send text messages
- 🔒 **Device Lock** — lock phone instantly
- 📲 **App Launch** — open 30+ popular apps (YouTube, Spotify, WhatsApp, Maps, etc.)
- 📳 **Vibration** — trigger haptic feedback

### 4. Message & Notification Hub
- Intercept and read notifications from WhatsApp, SMS, Telegram, and more
- Smart Reply — compose and send replies via the Messages tab
- Auto-capture via Android AccessibilityService
- Real-time message feed with timestamps and source identification

### 5. Persistent Background Service
- Android Foreground Service for continuous operation
- Keeps assistant responsive even when app is minimized
- Persistent notification for service status

### 6. Personalization
- Set a custom assistant name
- Multiple personality modes (Friendly, Casual, Professional, Witty, Caring)
- Choose TTS engine: ElevenLabs cloud voices, self-hosted Kokoro, or system TTS
- Adjustable speech rate
- Light / dark / system theme

## 📱 App Screens

| Screen | Description |
|--------|-------------|
| **Onboarding** | Initial setup — name your assistant and grant permissions |
| **Chat** | Main voice/text interface with streaming AI responses |
| **Messages** | Notification hub with Smart Reply for external apps |
| **Controls** | Quick-action dashboard — flashlight, brightness, volume, lock |
| **Profile** | Name, age, gender, and assistant personality settings |
| **Settings** | Permissions, TTS engine, API endpoint configuration |

## 🛠️ Technology Stack

### Mobile (artifacts/mobile)
- **React Native 0.81.5** + **Expo SDK 54**
- **Expo Router 6** — file-based tab navigation
- **TypeScript**
- **TanStack React Query** — data fetching & caching
- **Expo Modules**: `expo-av`, `expo-camera`, `expo-brightness`, `expo-battery`, `expo-contacts`, `expo-location`, `expo-notifications`, `expo-speech`

### Backend API (artifacts/api-server)
- **Express 5** — HTTP server
- **Pino** — structured JSON logging
- **Multer** — audio/image file uploads
- **Drizzle ORM** + **PostgreSQL** — conversation & message persistence
- **Zod** — runtime schema validation

### AI Providers
| Provider | Used For |
|----------|----------|
| **Groq** | LLaMA 3.3 70B chat (primary) + Whisper transcription |
| **Google Gemini 2.0 Flash** | Vision analysis, game assist |
| **ElevenLabs** | Premium cloud TTS voices |
| **Kokoro** | Self-hosted TTS |
| **Tavily** | Web search |
| **OpenRouter** | Fallback LLM |
| **Ollama** | Local LLM option |

### Native Android Modules (Kotlin)
- **AccessibilityModule** — read WhatsApp / SMS messages, game automation
- **CallScreeningModule** — handle incoming calls
- **MediaControlModule** — audio volume management
- **NotificationsModule** — notification interception & reply
- **ScreenLockModule** — device lock
- **SystemPermissionsModule** — runtime permission handling

### Build & Tooling
- **pnpm workspaces** — monorepo package management
- **esbuild** — backend bundler
- **EAS Build** — cloud Expo/Android builds
- **Gradle 8.1.1** + **Kotlin 2.1.0** — Android native
- **Orval** — OpenAPI → React Query codegen

## 🏗️ Project Structure

```
├── artifacts/
│   ├── api-server/          # Express 5 API server
│   └── mobile/              # Expo React Native app
├── lib/
│   ├── api-spec/            # OpenAPI spec + Orval config
│   ├── api-client-react/    # Generated React Query hooks
│   ├── api-zod/             # Generated Zod schemas
│   └── db/                  # Drizzle ORM schema + DB connection
├── scripts/                 # Utility scripts
├── stubs/                   # Local package stubs (firewall workarounds)
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## 🚀 Getting Started

### Prerequisites
- Node.js 20+, pnpm 10+
- Android device or emulator
- [Expo Go](https://expo.dev/client) app (for development)
- PostgreSQL database

### Environment Variables

Create a `.env` file in `artifacts/api-server/` (or set via your host):

```env
# Required
DATABASE_URL=postgresql://user:pass@host/db
GROQ_API_KEY=your_groq_key

# Optional AI providers
OPENROUTER_API_KEY=your_openrouter_key
GEMINI_API_KEY=your_gemini_key
ELEVENLABS_API_KEY=your_elevenlabs_key
TAVILY_API_KEY=your_tavily_key

# Self-hosted (optional)
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:1b
KOKORO_URL=http://localhost:8880
KOKORO_API_KEY=your_kokoro_key
```

Mobile client URL (set in Expo environment):
```env
EXPO_PUBLIC_API_URL=https://your-api-host/api
```

### Running the Backend

```bash
pnpm install --filter @workspace/api-server --filter @workspace/db --filter @workspace/api-zod
pnpm --filter @workspace/api-server run dev
```

### Running the Mobile App

```bash
# Install mobile dependencies
pnpm install --filter @workspace/mobile

# Start Expo dev server
pnpm --filter @workspace/mobile run dev
```

Scan the QR code with Expo Go on your Android device.

### Building for Android (Production)

```bash
eas build --platform android
```

## 📡 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/chat` | Streaming AI chat (Groq / OpenRouter / Ollama) |
| `POST` | `/api/transcribe` | Audio transcription (Groq Whisper) |
| `POST` | `/api/search` | Web search via Tavily + AI summary |
| `POST` | `/api/vision` | Image description (Gemini 2.0 Flash) |
| `POST` | `/api/game-assist` | Word-puzzle screenshot → tap coordinates |
| `GET/POST` | `/api/tts` | Text-to-speech (ElevenLabs / Kokoro) |
| `GET` | `/api/tts/voices` | List available TTS voices |
| `GET/POST` | `/api/conversations` | List / create conversations |
| `PATCH/DELETE` | `/api/conversations/:id` | Update / delete a conversation |
| `GET/POST` | `/api/conversations/:id/messages` | Get / add messages |

## 📄 License

MIT — see [LICENSE](LICENSE)

## 🤝 Contributing

1. Create a feature branch (`git checkout -b feature/amazing-feature`)
2. Commit your changes (`git commit -m 'Add amazing feature'`)
3. Push to the branch (`git push origin feature/amazing-feature`)
4. Open a Pull Request

## 📞 Support

- Open a [GitHub issue](https://github.com/bossgpt8/Secret-Chat-Provider/issues)
- API reference: [lib/api-spec/openapi.yaml](lib/api-spec/openapi.yaml)

---

**Built with ❤️ using React Native, Expo, Groq, and Gemini**
