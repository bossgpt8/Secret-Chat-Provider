# Zeno - Voice-Controlled AI Assistant

🎤 A comprehensive voice-controlled personal assistant for Android built with React Native/Expo, combining AI conversation with deep Android system integration.

## 📱 Overview

**Zeno** is an intelligent voice assistant that brings hands-free control to your Android phone. It leverages cutting-edge AI (LLaMA 3.3 via OpenRouter) to understand natural language commands and perform complex phone operations—from controlling flashlight and brightness to reading messages and making calls.

## 🎯 Key Features

### 1. **AI Conversation**
- **LLaMA 3.3 70B** powered via OpenRouter API
- Natural language understanding with context retention
- Voice input with real-time audio recording
- Text-to-speech responses for hands-free operation
- Streaming chat for responsive interactions

### 2. **Phone Controls** (Voice-Activated)
- 🔦 **Flashlight** - Toggle on/off via voice command
- 🔆 **Screen Brightness** - Set, raise, or lower brightness
- 📊 **Battery Status** - Check device battery level
- 📞 **Phone Calls** - Initiate calls to contacts
- 💬 **SMS** - Send text messages
- 🔒 **Device Lock** - Lock phone instantly
- 📲 **App Launch** - Open 30+ popular apps (YouTube, Spotify, WhatsApp, Maps, etc.)
- 📳 **Vibration** - Trigger haptic feedback
- 📬 **Notifications** - Read and reply to messages

### 3. **Message Management**
- Auto-capture WhatsApp and SMS via AccessibilityService
- Real-time message reading
- Dedicated Messages tab with timestamps
- Message source identification

### 4. **Persistent Background Service**
- Android Foreground Service for continuous operation
- Keeps assistant responsive even when app minimized
- Persistent notification for service status

### 5. **User Profile & Customization**
- Personalized assistant name
- Multiple personality modes (friendly, casual, professional, witty, caring)
- Voice selection from ElevenLabs (40+ voices)
- Custom speech rate
- Theme customization (light/dark/system)
- Custom API endpoint support

### 6. **Data Organization**
- Conversation history with automatic persistence
- Notes and todos management
- Favorites & quick-action chips
- Cloud sync via device identifier

## 🛠️ Technology Stack

### Frontend
- **React Native 0.81.5** - Cross-platform mobile framework
- **Expo SDK 54** - Managed development environment
- **TypeScript** - Type-safe JavaScript
- **Expo Router 6.0** - Tab-based navigation (React Router for React Native)
- **React Query (@tanstack/react-query)** - Data fetching & caching
- **Expo Modules**:
  - `expo-av` - Audio recording & playback
  - `expo-speech` - Text-to-speech
  - `expo-camera` - Camera access (flashlight)
  - `expo-brightness` - Screen brightness control
  - `expo-battery` - Battery status
  - `expo-contacts` - Contact access
  - `expo-location` - Location services
  - `expo-notifications` - Push notifications

### Backend/API
- **Express 5.x** - HTTP server
- **Pino** - Fast JSON logger
- **OpenRouter API** - LLaMA 3.3 chat & Whisper speech-to-text
- **Groq API** - Alternative LLM & Whisper provider
- **ElevenLabs API** - Premium text-to-speech voices
- **Multer** - File upload handling

### Database
- **PostgreSQL** - Data persistence
- **Drizzle ORM** - Type-safe query builder
- **Drizzle-Zod** - Schema validation with Zod

### Native Android Modules (Kotlin)
- **AccessibilityModule** - Read WhatsApp/SMS messages
- **CallScreeningModule** - Handle incoming calls
- **MediaControlModule** - Audio volume management
- **NotificationsModule** - Notification management
- **ScreenLockModule** - Device lock functionality
- **SystemPermissionsModule** - Runtime permission handling

### Build & DevOps
- **EAS Build** - Cloud-based Expo app builds
- **Gradle 8.1.1** - Android build system
- **Kotlin 2.1.0** - Android native development
- **esbuild** - JavaScript bundler
- **pnpm** - Monorepo package management

## 📂 Project Structure

```
Secret-Chat-Provider/
├── artifacts/
│   ├── api-server/           # Express backend
│   │   ├── src/
│   │   │   ├── app.ts        # Express app setup
│   │   │   ├── routes/
│   │   │   │   ├── chat.ts   # AI chat streaming endpoint
│   │   │   │   ├── conversations.ts  # Conversation CRUD
│   │   │   │   ├── tts.ts    # Text-to-speech
│   │   │   │   └── health.ts # Health check
│   │   │   └── lib/logger.ts
│   │   └── build.mjs         # esbuild config
│   ├── mobile/               # React Native app
│   │   ├── app/
│   │   │   ├── index.tsx     # Root (routing logic)
│   │   │   ├── onboarding.tsx # First-run setup
│   │   │   └── (tabs)/       # Tab navigation
│   │   │       ├── index.tsx # Chat interface
│   │   │       ├── messages.tsx # Message history
│   │   │       ├── controls.tsx # Quick actions
│   │   │       ├── profile.tsx # User profile
│   │   │       └── settings.tsx # Settings & permissions
│   │   ├── components/
│   │   │   ├── ErrorBoundary.tsx
│   │   │   └── KeyboardAwareScrollViewCompat.tsx
│   │   ├── context/
│   │   │   └── AssistantContext.tsx # Global app state
│   │   ├── hooks/
│   │   │   ├── useColors.ts  # Theme colors
│   │   │   └── useAppColorScheme.ts
│   │   ├── modules/          # Native Android bridges
│   │   │   ├── NativeAccessibility.ts
│   │   │   ├── NativeAudioControl.ts
│   │   │   ├── NativeCallScreening.ts
│   │   │   ├── NativeMediaControl.ts
│   │   │   ├── NativeNotifications.ts
│   │   │   ├── NativeScreenLock.ts
│   │   │   └── NativeSystemPermissions.ts
│   │   ├── plugins/          # Native Kotlin modules
│   │   │   └── kotlin/
│   │   │       ├── AccessibilityModule.kt
│   │   │       ├── CallScreeningModule.kt
│   │   │       └── ...
│   │   ├── scripts/
│   │   │   └── build.js      # Custom build script
│   │   └── server/           # Development server
│   │       └── serve.js
│   └── mockup-sandbox/       # UI component preview
├── lib/
│   ├── api-client-react/     # Auto-generated API client (React hooks)
│   ├── api-spec/             # OpenAPI specification
│   ├── api-zod/              # Auto-generated Zod schemas
│   └── db/                   # Database schema & migrations
│       └── src/schema/
│           ├── conversations.ts
│           └── messages.ts
└── scripts/                  # Workspace scripts
```

## 🚀 Quick Start

### Prerequisites
- **Node.js** 18+ and **pnpm** 10+
- **Android SDK** (for native builds)
- **Expo Account** (for EAS builds)
- **API Keys**: OpenRouter, ElevenLabs (optional), Groq (optional)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/bossgpt8/Secret-Chat-Provider.git
cd Secret-Chat-Provider
```

2. **Install dependencies**
```bash
pnpm install
```

3. **Set up environment variables**

Create `.env.local` in the root and `artifacts/api-server/.env.local`:

```bash
# API Keys
OPENROUTER_API_KEY=your_openrouter_api_key
ELEVENLABS_API_KEY=your_elevenlabs_api_key  # Optional
GROQ_API_KEY=your_groq_api_key              # Optional

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/zeno

# Server
PORT=3000
NODE_ENV=development
```

4. **Database setup**
```bash
cd lib/db
pnpm run db:push  # Apply migrations
```

### Development

**Start the API server**
```bash
cd artifacts/api-server
pnpm run dev
```

**Launch the mobile app** (in another terminal)
```bash
cd artifacts/mobile
pnpm run dev
```

**Scan the QR code** with Expo Go app on your Android device, or use a development build:
```bash
pnpm run android
```

### Building

**TypeScript validation**
```bash
pnpm typecheck
```

**Build entire workspace**
```bash
pnpm build
```

**Build mobile app with EAS**
```bash
cd artifacts/mobile
eas build --platform android
```

**Serve built APK locally**
```bash
cd artifacts/mobile
pnpm run serve
```

## 📡 API Endpoints

### Health Check
```
GET /api/healthz
Response: { status: "ok" }
```

### Chat (Streaming)
```
POST /api/chat
Content-Type: application/json
X-Device-Id: <device-id>

Request:
{
  "messages": [
    { "role": "user", "content": "Turn on the flashlight" }
  ],
  "systemPrompt": "You are Zeno..."  // Optional
}

Response: Server-Sent Events (text/event-stream)
```

### Conversations
```
GET /api/conversations
POST /api/conversations
PATCH /api/conversations/{id}
DELETE /api/conversations/{id}
```

### Messages
```
GET /api/conversations/{id}/messages
POST /api/conversations/{id}/messages
```

### Text-to-Speech
```
GET /api/tts/voices
POST /api/tts/stream
```

See [lib/api-spec/openapi.yaml](lib/api-spec/openapi.yaml) for complete OpenAPI documentation.

## 🔐 Permissions Required

The app requests the following Android permissions:

| Permission | Purpose |
|-----------|---------|
| `RECORD_AUDIO` | Voice recording for chat input |
| `INTERNET` | API communication |
| `READ_PHONE_STATE` | Monitor call state |
| `ANSWER_PHONE_CALLS` | Accept calls via voice command |
| `CALL_PHONE` | Make phone calls |
| `SEND_SMS` | Send SMS messages |
| `READ_SMS`, `READ_CONTACTS` | Access message/contact data |
| `CAMERA` | Flashlight control |
| `WRITE_SETTINGS` | Screen brightness control |
| `DEVICE_ADMIN` | Device lock functionality |
| `ACCESSIBILITY_SERVICE` | Read WhatsApp/SMS messages |

## 🎨 UI Architecture

### Tab Navigation
- **Chat** - Main conversation interface with voice recording
- **Messages** - Auto-captured SMS/WhatsApp messages
- **Controls** - Quick action buttons for phone controls
- **Profile** - User profile customization (name, gender, age)
- **Settings** - Permission management & app configuration

### Global State Management
- `AssistantContext.tsx` manages:
  - Conversation history
  - User preferences (voice, theme, personality)
  - Current conversation tracking
  - Async storage persistence

## 🔧 Configuration

### Customizable Settings
Located in `AssistantContext.tsx`:

```typescript
- Assistant name (default: "Zeno")
- TTS Provider: "elevenlabs" | "phone"
- Voice ID (ElevenLabs)
- Speech rate (0.5 - 2.0)
- Theme: "system" | "dark" | "light"
- Personality: "friendly" | "casual" | "professional" | "witty" | "caring"
- Custom API endpoint
- Wake word configuration
- Auto-read incoming messages
```

## 📊 Data Models

### Conversation
```typescript
{
  id: string
  deviceId: string
  title: string
  createdAt: number
  updatedAt: number
  messages: Message[]
}
```

### Message
```typescript
{
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: number
  isSearch?: boolean
}
```

### User Profile
```typescript
{
  userName: string
  gender: "male" | "female" | "nonbinary" | "other" | ""
  age: string
}
```

## 🛠️ Troubleshooting

### App stuck on splash screen
**Cause**: Missing permissions or API key issues
**Solution**: Check Android logcat and ensure all required permissions are granted in Settings

### Voice recording not working
**Cause**: Microphone permission not granted
**Solution**: Go to Settings tab and enable Microphone permission

### Chat API errors
**Cause**: Missing API keys or rate limiting
**Solution**: Verify `OPENROUTER_API_KEY` and `ELEVENLABS_API_KEY` in environment

### Database connection failed
**Cause**: PostgreSQL not running or incorrect `DATABASE_URL`
**Solution**: Start PostgreSQL and verify connection string

## 🚧 Development Notes

### Native Module Development
Native modules are in `artifacts/mobile/plugins/kotlin/`. After modifications:

```bash
cd artifacts/mobile
npm run build
```

### Adding New Features
1. Update OpenAPI spec in `lib/api-spec/openapi.yaml`
2. Regenerate API client: `pnpm -r --filter "./lib/api-*" run build`
3. Implement frontend in `artifacts/mobile`
4. Implement backend in `artifacts/api-server`

### Testing Components
Use the mockup-sandbox for UI component previews:
```bash
cd artifacts/mockup-sandbox
pnpm run dev
```

## 📦 Dependencies Overview

### Core Libraries
- `react` / `react-native` - UI framework
- `expo` - Managed React Native platform
- `react-query` - Server state management
- `zod` - Runtime type validation
- `drizzle-orm` - Database ORM

### Backend
- `express` - HTTP server
- `pino` - Logging
- `multer` - File uploads

### Native
- `kotlin` 2.1.0 - Kotlin for Android modules
- `gradle` 8.1.1 - Build automation

## 📄 License

MIT - See LICENSE file

## 🤝 Contributing

1. Create a feature branch (`git checkout -b feature/amazing-feature`)
2. Commit changes (`git commit -m 'Add amazing feature'`)
3. Push to branch (`git push origin feature/amazing-feature`)
4. Open a Pull Request

## 📞 Support

For issues, questions, or suggestions:
- Open a GitHub issue
- Check existing documentation in [lib/api-spec/openapi.yaml](lib/api-spec/openapi.yaml)

## 🎓 Learning Resources

- [Expo Documentation](https://docs.expo.dev)
- [React Native](https://reactnative.dev)
- [Express.js](https://expressjs.com)
- [Drizzle ORM](https://orm.drizzle.team)
- [OpenRouter API](https://openrouter.ai)
- [ElevenLabs](https://elevenlabs.io)

---

**Built with ❤️ using React Native, Expo, and cutting-edge AI**
