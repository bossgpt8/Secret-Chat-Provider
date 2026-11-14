import { z } from "zod";
const message = z.object({
  id: z.string().min(1).max(200),
  role: z.enum(["user", "assistant"]),
  content: z.string().max(500000),
  timestamp: z.number().finite(),
}).passthrough();
const conversations = z.array(z.object({
  id: z.string().min(1).max(200), title: z.string().max(1000),
  createdAt: z.number().finite(), updatedAt: z.number().finite(),
  messages: z.array(message).max(10000),
}).passthrough()).max(2000);
const preferences: Record<string, z.ZodTypeAny> = {
  "@vox_assistant_name": z.string().min(1).max(80),
  "@vox_phone_voice_id": z.string().max(500),
  "@vox_el_voice_id": z.string().max(500),
  "@vox_kokoro_voice_id": z.string().max(100),
  "@vox_speech_rate": z.coerce.number().min(0.1).max(3),
  "@vox_tts_provider": z.enum(["phone", "piper", "elevenlabs", "kokoro"]),
  "@vox_theme": z.enum(["system", "dark", "light"]),
  "@vox_personality": z.enum(["friendly", "casual", "professional", "witty", "caring"]),
  "@vox_speech_language": z.string().max(80),
};
/** Reject corrupt snapshots before they can replace a working phone's local data. */
export function validCloudEntries(entries: Record<string, string>): boolean {
  try {
    return Object.entries(entries).every(([key, value]) => {
      if (key === "@vox_conversations") return conversations.safeParse(JSON.parse(value)).success;
      if (key === "@vox_quick_chips") return z.array(z.string().max(500)).max(100).safeParse(JSON.parse(value)).success;
      return Boolean(preferences[key]?.safeParse(value).success);
    });
  } catch { return false; }
}
