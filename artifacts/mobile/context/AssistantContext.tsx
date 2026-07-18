import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";

const ASSISTANT_NAME_KEY = "@vox_assistant_name";
const CONVERSATIONS_KEY = "@vox_conversations";
const PHONE_VOICE_ID_KEY = "@vox_phone_voice_id";
const EL_VOICE_ID_KEY = "@vox_el_voice_id";
const KOKORO_VOICE_ID_KEY = "@vox_kokoro_voice_id";
const SPEECH_RATE_KEY = "@vox_speech_rate";
const TTS_PROVIDER_KEY = "@vox_tts_provider";
const THEME_KEY = "@vox_theme";
const CUSTOM_API_URL_KEY = "@vox_custom_api_url";
const USER_PROFILE_KEY = "@vox_user_profile";
const PERSONALITY_KEY = "@vox_personality";
const WAKE_WORD_KEY = "@vox_wake_word";
const READ_INCOMING_KEY = "@vox_read_incoming";
const NOTES_KEY = "@vox_notes";
const TODOS_KEY = "@vox_todos";
const FAVORITES_KEY = "@vox_favorites";
const QUICK_CHIPS_KEY = "@vox_quick_chips";
const SPEECH_LANGUAGE_KEY = "@vox_speech_language";
const FLOATING_BUBBLE_KEY = "@vox_floating_bubble";

// Migration map: old @zeno_* key → new @vox_* key
const LEGACY_KEY_MAP: Record<string, string> = {
  "@zeno_assistant_name": ASSISTANT_NAME_KEY,
  "@zeno_conversations": CONVERSATIONS_KEY,
  "@zeno_phone_voice_id": PHONE_VOICE_ID_KEY,
  "@zeno_el_voice_id": EL_VOICE_ID_KEY,
  "@zeno_speech_rate": SPEECH_RATE_KEY,
  "@zeno_tts_provider": TTS_PROVIDER_KEY,
  "@zeno_theme": THEME_KEY,
  "@zeno_custom_api_url": CUSTOM_API_URL_KEY,
  "@zeno_user_profile": USER_PROFILE_KEY,
  "@zeno_personality": PERSONALITY_KEY,
  "@zeno_wake_word": WAKE_WORD_KEY,
  "@zeno_read_incoming": READ_INCOMING_KEY,
  "@zeno_notes": NOTES_KEY,
  "@zeno_todos": TODOS_KEY,
  "@zeno_favorites": FAVORITES_KEY,
  "@zeno_quick_chips": QUICK_CHIPS_KEY,
  "@zeno_speech_language": SPEECH_LANGUAGE_KEY,
};

/**
 * One-time migration: copies any @zeno_* values that have no @vox_* counterpart
 * yet, writes them under the new key, then removes the old key.
 */
async function migrateZenoToVox(): Promise<void> {
  try {
    const legacyKeys = Object.keys(LEGACY_KEY_MAP);
    const legacyValues = await AsyncStorage.multiGet(legacyKeys);
    const writes: [string, string][] = [];
    const deletes: string[] = [];

    for (const [oldKey, oldValue] of legacyValues) {
      if (!oldValue) continue;
      const newKey = LEGACY_KEY_MAP[oldKey];
      const existing = await AsyncStorage.getItem(newKey);
      if (!existing) {
        writes.push([newKey, oldValue]);
      }
      deletes.push(oldKey);
    }

    if (writes.length > 0) await AsyncStorage.multiSet(writes);
    if (deletes.length > 0) await AsyncStorage.multiRemove(deletes);

    if (writes.length > 0 || deletes.length > 0) {
      console.log(`[AssistantContext] Migrated ${writes.length} keys from @zeno_* to @vox_*`);
    }
  } catch (e) {
    console.warn("[AssistantContext] Storage migration failed (non-fatal):", e);
  }
}

export type TtsProvider = "elevenlabs" | "kokoro" | "phone";
export type ThemeOverride = "system" | "dark" | "light";
export type AssistantPersonality = "friendly" | "casual" | "professional" | "witty" | "caring";

export interface UserProfile {
  userName: string;
  gender: "" | "male" | "female" | "nonbinary" | "other";
  age: string;
}

const DEFAULT_USER_PROFILE: UserProfile = { userName: "", gender: "", age: "" };

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  isSearch?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface VoiceNote {
  id: string;
  text: string;
  timestamp: number;
}

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  timestamp: number;
}

export interface ContactFavorite {
  alias: string;   // e.g. "wife", "husband", "mom"
  contactName: string; // actual name to look up in contacts
}

export const DEFAULT_QUICK_CHIPS = ["What can you do?", "Tell me a fun fact", "What's today's date?"];

interface AssistantContextType {
  assistantName: string;
  setAssistantName: (name: string) => Promise<void>;
  isOnboarded: boolean;
  conversations: Conversation[];
  currentConversationId: string | null;
  setCurrentConversationId: (id: string | null) => void;
  createConversation: () => string;
  saveMessages: (conversationId: string, messages: Message[], title?: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  clearAllConversations: () => Promise<void>;
  isLoading: boolean;
  phoneVoiceId: string | null;
  setPhoneVoiceId: (id: string | null) => Promise<void>;
  elVoiceId: string | null;
  setElVoiceId: (id: string | null) => Promise<void>;
  kokoroVoiceId: string;
  setKokoroVoiceId: (id: string) => Promise<void>;
  speechRate: number;
  setSpeechRate: (rate: number) => Promise<void>;
  ttsProvider: TtsProvider;
  setTtsProvider: (p: TtsProvider) => Promise<void>;
  themeOverride: ThemeOverride;
  setThemeOverride: (t: ThemeOverride) => Promise<void>;
  customApiUrl: string | null;
  setCustomApiUrl: (url: string | null) => Promise<void>;
  userProfile: UserProfile;
  setUserProfile: (p: UserProfile) => Promise<void>;
  assistantPersonality: AssistantPersonality;
  setAssistantPersonality: (p: AssistantPersonality) => Promise<void>;
  wakeWordEnabled: boolean;
  setWakeWordEnabled: (v: boolean) => Promise<void>;
  readIncomingEnabled: boolean;
  setReadIncomingEnabled: (v: boolean) => Promise<void>;
  notes: VoiceNote[];
  saveNote: (text: string) => Promise<VoiceNote>;
  deleteNote: (id: string) => Promise<void>;
  todos: TodoItem[];
  addTodo: (text: string) => Promise<TodoItem>;
  completeTodo: (id: string) => Promise<void>;
  deleteTodo: (id: string) => Promise<void>;
  contactFavorites: ContactFavorite[];
  setContactFavorite: (alias: string, contactName: string) => Promise<void>;
  getContactFavorite: (alias: string) => ContactFavorite | undefined;
  customQuickChips: string[];
  setCustomQuickChips: (chips: string[]) => Promise<void>;
  speechLanguage: string;
  setSpeechLanguage: (lang: string) => Promise<void>;
  floatingBubbleEnabled: boolean;
  setFloatingBubbleEnabled: (v: boolean) => Promise<void>;
}

const AssistantContext = createContext<AssistantContextType | null>(null);

let msgCounter = 0;
export function generateMsgId(): string {
  msgCounter++;
  return `msg-${Date.now()}-${msgCounter}-${Math.random().toString(36).substr(2, 9)}`;
}

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [assistantName, setAssistantNameState] = useState("Vox");
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [phoneVoiceId, setPhoneVoiceIdState] = useState<string | null>(null);
  const [elVoiceId, setElVoiceIdState] = useState<string | null>("21m00Tcm4TlvDq8ikWAM");
  const [kokoroVoiceId, setKokoroVoiceIdState] = useState<string>("af_bella");
  const [speechRate, setSpeechRateState] = useState(0.9);
  const [ttsProvider, setTtsProviderState] = useState<TtsProvider>("kokoro");
  const [themeOverride, setThemeOverrideState] = useState<ThemeOverride>("system");
  const [customApiUrl, setCustomApiUrlState] = useState<string | null>(null);
  const [userProfile, setUserProfileState] = useState<UserProfile>(DEFAULT_USER_PROFILE);
  const [assistantPersonality, setAssistantPersonalityState] = useState<AssistantPersonality>("friendly");
  const [wakeWordEnabled, setWakeWordEnabledState] = useState(false);
  const [readIncomingEnabled, setReadIncomingEnabledState] = useState(false);
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [contactFavorites, setContactFavoritesState] = useState<ContactFavorite[]>([]);
  const [customQuickChips, setCustomQuickChipsState] = useState<string[]>(DEFAULT_QUICK_CHIPS);
  const [speechLanguage, setSpeechLanguageState] = useState("en-US");
  const [floatingBubbleEnabled, setFloatingBubbleEnabledState] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    console.log("[AssistantContext] Starting to load data from AsyncStorage");
    // Safety valve: always unblock the UI within 5 seconds even if AsyncStorage hangs.
    // Must be set BEFORE any async work so it covers the migration too.
    const timeoutId = setTimeout(() => {
      console.log("[AssistantContext] Loading timeout reached, forcing UI unblock");
      setIsLoading(false);
    }, 5000);
    await migrateZenoToVox();
    try {
      const startTime = Date.now();
      const [name, convsRaw, pvid, evid, kvid, rate, prov, theme, apiUrl, profileRaw, personality, wakeWord, readIncoming, notesRaw, todosRaw, favoritesRaw, quickChipsRaw, speechLang, floatingBubble] = await Promise.all([
        AsyncStorage.getItem(ASSISTANT_NAME_KEY),
        AsyncStorage.getItem(CONVERSATIONS_KEY),
        AsyncStorage.getItem(PHONE_VOICE_ID_KEY),
        AsyncStorage.getItem(EL_VOICE_ID_KEY),
        AsyncStorage.getItem(KOKORO_VOICE_ID_KEY),
        AsyncStorage.getItem(SPEECH_RATE_KEY),
        AsyncStorage.getItem(TTS_PROVIDER_KEY),
        AsyncStorage.getItem(THEME_KEY),
        AsyncStorage.getItem(CUSTOM_API_URL_KEY),
        AsyncStorage.getItem(USER_PROFILE_KEY),
        AsyncStorage.getItem(PERSONALITY_KEY),
        AsyncStorage.getItem(WAKE_WORD_KEY),
        AsyncStorage.getItem(READ_INCOMING_KEY),
        AsyncStorage.getItem(NOTES_KEY),
        AsyncStorage.getItem(TODOS_KEY),
        AsyncStorage.getItem(FAVORITES_KEY),
        AsyncStorage.getItem(QUICK_CHIPS_KEY),
        AsyncStorage.getItem(SPEECH_LANGUAGE_KEY),
        AsyncStorage.getItem(FLOATING_BUBBLE_KEY),
      ]);
      console.log(`[AssistantContext] Loaded from AsyncStorage in ${Date.now() - startTime}ms, onboarded=${!!name}`);
      if (name) { setAssistantNameState(name); setIsOnboarded(true); }
      if (convsRaw) setConversations(JSON.parse(convsRaw));
      if (pvid) setPhoneVoiceIdState(pvid);
      if (evid) setElVoiceIdState(evid);
      if (kvid) setKokoroVoiceIdState(kvid);
      if (rate) setSpeechRateState(parseFloat(rate));
      if (prov === "phone" || prov === "elevenlabs" || prov === "kokoro") setTtsProviderState(prov);
      if (theme === "dark" || theme === "light" || theme === "system") setThemeOverrideState(theme);
      if (apiUrl) setCustomApiUrlState(apiUrl);
      if (profileRaw) { try { setUserProfileState(JSON.parse(profileRaw)); } catch { /* ignore */ } }
      if (personality === "friendly" || personality === "casual" || personality === "professional" || personality === "witty" || personality === "caring") setAssistantPersonalityState(personality);
      if (wakeWord === "true") setWakeWordEnabledState(true);
      if (readIncoming === "true") setReadIncomingEnabledState(true);
      if (notesRaw) { try { setNotes(JSON.parse(notesRaw)); } catch { /* ignore */ } }
      if (todosRaw) { try { setTodos(JSON.parse(todosRaw)); } catch { /* ignore */ } }
      if (favoritesRaw) { try { setContactFavoritesState(JSON.parse(favoritesRaw)); } catch { /* ignore */ } }
      if (quickChipsRaw) { try { const chips = JSON.parse(quickChipsRaw); if (Array.isArray(chips) && chips.length > 0) setCustomQuickChipsState(chips); } catch { /* ignore */ } }
      if (speechLang) setSpeechLanguageState(speechLang);
      if (floatingBubble === "true") setFloatingBubbleEnabledState(true);
    } catch (e) {
      console.error("[AssistantContext] Error loading data:", e);
    } finally {
      clearTimeout(timeoutId);
      console.log("[AssistantContext] Loading complete, setting isLoading=false");
      setIsLoading(false);
    }
  }

  async function setAssistantName(name: string) {
    await AsyncStorage.setItem(ASSISTANT_NAME_KEY, name);
    setAssistantNameState(name);
    setIsOnboarded(true);
  }

  async function setPhoneVoiceId(id: string | null) {
    if (id) await AsyncStorage.setItem(PHONE_VOICE_ID_KEY, id);
    else await AsyncStorage.removeItem(PHONE_VOICE_ID_KEY);
    setPhoneVoiceIdState(id);
  }

  async function setElVoiceId(id: string | null) {
    if (id) await AsyncStorage.setItem(EL_VOICE_ID_KEY, id);
    else await AsyncStorage.removeItem(EL_VOICE_ID_KEY);
    setElVoiceIdState(id);
  }

  async function setKokoroVoiceId(id: string) {
    await AsyncStorage.setItem(KOKORO_VOICE_ID_KEY, id);
    setKokoroVoiceIdState(id);
  }

  async function setSpeechRate(rate: number) {
    await AsyncStorage.setItem(SPEECH_RATE_KEY, String(rate));
    setSpeechRateState(rate);
  }

  async function setTtsProvider(p: TtsProvider) {
    await AsyncStorage.setItem(TTS_PROVIDER_KEY, p);
    setTtsProviderState(p);
  }

  async function setThemeOverride(t: ThemeOverride) {
    await AsyncStorage.setItem(THEME_KEY, t);
    setThemeOverrideState(t);
  }

  async function setCustomApiUrl(url: string | null) {
    if (url && url.trim()) {
      await AsyncStorage.setItem(CUSTOM_API_URL_KEY, url.trim());
      setCustomApiUrlState(url.trim());
    } else {
      await AsyncStorage.removeItem(CUSTOM_API_URL_KEY);
      setCustomApiUrlState(null);
    }
  }

  async function setUserProfile(p: UserProfile) {
    await AsyncStorage.setItem(USER_PROFILE_KEY, JSON.stringify(p));
    setUserProfileState(p);
  }

  async function setAssistantPersonality(p: AssistantPersonality) {
    await AsyncStorage.setItem(PERSONALITY_KEY, p);
    setAssistantPersonalityState(p);
  }

  async function setWakeWordEnabled(v: boolean) {
    await AsyncStorage.setItem(WAKE_WORD_KEY, String(v));
    setWakeWordEnabledState(v);
  }

  async function setReadIncomingEnabled(v: boolean) {
    await AsyncStorage.setItem(READ_INCOMING_KEY, String(v));
    setReadIncomingEnabledState(v);
  }

  async function setFloatingBubbleEnabled(v: boolean) {
    await AsyncStorage.setItem(FLOATING_BUBBLE_KEY, String(v));
    setFloatingBubbleEnabledState(v);
  }

  async function saveNote(text: string): Promise<VoiceNote> {
    const note: VoiceNote = { id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`, text, timestamp: Date.now() };
    setNotes((prev) => {
      const updated = [note, ...prev];
      AsyncStorage.setItem(NOTES_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
    return note;
  }

  async function deleteNote(id: string) {
    setNotes((prev) => {
      const updated = prev.filter((n) => n.id !== id);
      AsyncStorage.setItem(NOTES_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }

  async function addTodo(text: string): Promise<TodoItem> {
    const todo: TodoItem = { id: `todo-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`, text, done: false, timestamp: Date.now() };
    setTodos((prev) => {
      const updated = [todo, ...prev];
      AsyncStorage.setItem(TODOS_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
    return todo;
  }

  async function completeTodo(id: string) {
    setTodos((prev) => {
      const updated = prev.map((t) => t.id === id ? { ...t, done: true } : t);
      AsyncStorage.setItem(TODOS_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }

  async function deleteTodo(id: string) {
    setTodos((prev) => {
      const updated = prev.filter((t) => t.id !== id);
      AsyncStorage.setItem(TODOS_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }

  async function setContactFavorite(alias: string, contactName: string) {
    const normalizedAlias = alias.toLowerCase().trim();
    setContactFavoritesState((prev) => {
      const filtered = prev.filter((f) => f.alias !== normalizedAlias);
      const updated = [{ alias: normalizedAlias, contactName: contactName.trim() }, ...filtered];
      AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }

  function getContactFavorite(alias: string): ContactFavorite | undefined {
    return contactFavorites.find((f) => f.alias === alias.toLowerCase().trim());
  }

  async function setCustomQuickChips(chips: string[]) {
    const valid = chips.filter((c) => c.trim()).slice(0, 6);
    await AsyncStorage.setItem(QUICK_CHIPS_KEY, JSON.stringify(valid));
    setCustomQuickChipsState(valid.length > 0 ? valid : DEFAULT_QUICK_CHIPS);
  }

  async function setSpeechLanguage(lang: string) {
    await AsyncStorage.setItem(SPEECH_LANGUAGE_KEY, lang);
    setSpeechLanguageState(lang);
  }

  function createConversation(): string {
    const id = `conv-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const now = Date.now();
    const conv: Conversation = { id, title: "New Chat", messages: [], createdAt: now, updatedAt: now };
    setConversations((prev) => [conv, ...prev]);
    return id;
  }

  async function saveMessages(convId: string, messages: Message[], title?: string) {
    setConversations((prev) => {
      const updated = prev.map((c) => {
        if (c.id !== convId) return c;
        const newTitle = title ?? (messages.find((m) => m.role === "user")?.content.slice(0, 40) || c.title);
        return { ...c, messages, title: newTitle, updatedAt: Date.now() };
      });
      AsyncStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }

  async function deleteConversation(id: string) {
    setConversations((prev) => {
      const updated = prev.filter((c) => c.id !== id);
      AsyncStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
    if (currentConversationId === id) setCurrentConversationId(null);
  }

  async function clearAllConversations() {
    setConversations([]);
    setCurrentConversationId(null);
    await AsyncStorage.removeItem(CONVERSATIONS_KEY);
  }

  return (
    <AssistantContext.Provider
      value={{
        assistantName, setAssistantName,
        isOnboarded,
        conversations,
        currentConversationId, setCurrentConversationId,
        createConversation, saveMessages, deleteConversation, clearAllConversations,
        isLoading,
        phoneVoiceId, setPhoneVoiceId,
        elVoiceId, setElVoiceId,
        kokoroVoiceId, setKokoroVoiceId,
        speechRate, setSpeechRate,
        ttsProvider, setTtsProvider,
        themeOverride, setThemeOverride,
        customApiUrl, setCustomApiUrl,
        userProfile, setUserProfile,
        assistantPersonality, setAssistantPersonality,
        wakeWordEnabled, setWakeWordEnabled,
        readIncomingEnabled, setReadIncomingEnabled,
        notes, saveNote, deleteNote,
        todos, addTodo, completeTodo, deleteTodo,
        contactFavorites, setContactFavorite, getContactFavorite,
        customQuickChips, setCustomQuickChips,
        speechLanguage, setSpeechLanguage,
        floatingBubbleEnabled, setFloatingBubbleEnabled,
      }}
    >
      {children}
    </AssistantContext.Provider>
  );
}

export function useAssistant() {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error("useAssistant must be used within AssistantProvider");
  return ctx;
}

