---
name: Vox mobile app upgrades (July 2026)
description: Six feature upgrades to the Expo + Express voice assistant — tool calling, summarization, branching, camera, observability, proactive AI, UI polish.
---

## Rules

**1. LLM tool calling (backend → client)**
- Backend emits `{ tool_call: { name, params } }` as an SSE event alongside streaming content.
- Client has `silentExecuteDeviceAction(name, params)` — executes device actions, no messages added.
- `parseSseChunk` returns `{ content, toolCall? }` — callers must use `.content`, not the return value directly.
- `detectDeviceIntent` regex kept only for **offline** guard in `handleSend`; online path always hits `/api/chat`.

**2. Summarization**
- Threshold: > 30 messages triggers `summarizeOldMessages()` → `POST /api/summarize`.
- Keeps last 20 messages; older ones compressed into a user→assistant context pair.
- Falls back to hard-trim if API call fails.

**3. Conversation branching**
- State: `branchEditMsgId` + `branchEditText` in index.tsx.
- Pencil icon on user bubbles → pre-fills input + sets branch state.
- On send: slices messages at branch point, regenerates from there.
- Branch banner above input bar with cancel button clears state.

**4. Camera shortcut**
- Camera icon button between textWrap and micBtn in the input bar.
- On tap: requests permission, calls `captureAndDescribe()`.

**5. Observability**
- Already in the backend (chat.ts) as `logMetrics()`.

**6. Proactive AI (messages.tsx)**
- `handleAiSuggestReply(n)` → `POST /api/suggest-reply` → populates `replyText`.
- Loading state per notification key: `aiSuggestLoading`.
- "Suggest reply" button appears in expanded reply area above the text input.

**UI changes**
- MessageBubble: sparkles icon avatar (26px with violet shadow), 16px text, lineHeight 24, padding 16×11.
- Pencil edit button on user bubbles triggers branching.
- Branch banner above input bar when in edit mode.

**Why:** Regex intent detection misses paraphrasing; LLM tool calling handles edge cases naturally.
Rolling summary prevents context loss from hard-truncation at 40 messages.

**How to apply:**
- parseSseChunk callers always use `.content`; tool calls arrive as `.toolCall`.
- silentExecuteDeviceAction ≠ respond() — no messages, no TTS, just native action.
- detectDeviceIntent is offline-only guard; never use it as the primary online classifier.
- pnpm install needs `"pnpm": { "overrides": { "tar": "^7.4.3" } }` in root package.json (tar@6.2.1 blocked by Replit firewall).

## Voice mode + Kokoro improvements (July 2026)

**Full-screen voice overlay (VoiceCallOverlay component — index.tsx ~L272)**
- When `isCallMode` is true, an absolutely-positioned dark overlay (#08080f) covers the entire chat screen.
- Shows SiriOrb at 1.8× scale, WaveformBars while recording, state label (Listening/Thinking/Speaking), last assistant message text, and a red End button fixed at bottom.
- Replaces the old small top banner (removed). Rendered after `</KeyboardAvoidingView>` inside root container so it sits above all content.

**Kokoro TTS — always works**
- `KOKORO_TIMEOUT_MS` reduced from 12 000 ms → 5 000 ms (tts.ts) so failures recover quickly.
- `speakText()` fallback changed: removed `Alert.alert()` dialog that blocked call mode — now silently falls straight to `speakWithPhone()` (expo-speech, always available) when cloud TTS fails.
- `playSentenceNow()` already had the same silent fallback — left intact.
- Settings description updated: Kokoro labelled "⭐ Recommended" with note that it always falls back to phone voice.

**Why:** Alert dialog during call mode killed the seamless loop — user had to tap a button before voice resumed. Phone TTS is the guaranteed always-works floor; Kokoro/ElevenLabs are progressive enhancements.
