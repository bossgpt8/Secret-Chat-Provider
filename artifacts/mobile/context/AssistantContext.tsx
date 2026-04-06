import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";

const ASSISTANT_NAME_KEY = "@zeno_assistant_name";
const CONVERSATIONS_KEY = "@zeno_conversations";
const PHONE_VOICE_ID_KEY = "@zeno_phone_voice_id";
const EL_VOICE_ID_KEY = "@zeno_el_voice_id";
const SPEECH_RATE_KEY = "@zeno_speech_rate";
const TTS_PROVIDER_KEY = "@zeno_tts_provider";
const THEME_KEY = "@zeno_theme";
const CUSTOM_API_URL_KEY = "@zeno_custom_api_url";

export type TtsProvider = "elevenlabs" | "phone";
export type ThemeOverride = "system" | "dark" | "light";

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
  speechRate: number;
  setSpeechRate: (rate: number) => Promise<void>;
  ttsProvider: TtsProvider;
  setTtsProvider: (p: TtsProvider) => Promise<void>;
  themeOverride: ThemeOverride;
  setThemeOverride: (t: ThemeOverride) => Promise<void>;
  customApiUrl: string | null;
  setCustomApiUrl: (url: string | null) => Promise<void>;
}

const AssistantContext = createContext<AssistantContextType | null>(null);

let msgCounter = 0;
export function generateMsgId(): string {
  msgCounter++;
  return `msg-${Date.now()}-${msgCounter}-${Math.random().toString(36).substr(2, 9)}`;
}

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [assistantName, setAssistantNameState] = useState("Zeno");
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [phoneVoiceId, setPhoneVoiceIdState] = useState<string | null>(null);
  const [elVoiceId, setElVoiceIdState] = useState<string | null>("21m00Tcm4TlvDq8ikWAM");
  const [speechRate, setSpeechRateState] = useState(0.9);
  const [ttsProvider, setTtsProviderState] = useState<TtsProvider>("elevenlabs");
  const [themeOverride, setThemeOverrideState] = useState<ThemeOverride>("system");
  const [customApiUrl, setCustomApiUrlState] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [name, convsRaw, pvid, evid, rate, prov, theme, apiUrl] = await Promise.all([
        AsyncStorage.getItem(ASSISTANT_NAME_KEY),
        AsyncStorage.getItem(CONVERSATIONS_KEY),
        AsyncStorage.getItem(PHONE_VOICE_ID_KEY),
        AsyncStorage.getItem(EL_VOICE_ID_KEY),
        AsyncStorage.getItem(SPEECH_RATE_KEY),
        AsyncStorage.getItem(TTS_PROVIDER_KEY),
        AsyncStorage.getItem(THEME_KEY),
        AsyncStorage.getItem(CUSTOM_API_URL_KEY),
      ]);
      if (name) { setAssistantNameState(name); setIsOnboarded(true); }
      if (convsRaw) setConversations(JSON.parse(convsRaw));
      if (pvid) setPhoneVoiceIdState(pvid);
      if (evid) setElVoiceIdState(evid);
      if (rate) setSpeechRateState(parseFloat(rate));
      if (prov === "phone" || prov === "elevenlabs") setTtsProviderState(prov);
      if (theme === "dark" || theme === "light" || theme === "system") setThemeOverrideState(theme);
      if (apiUrl) setCustomApiUrlState(apiUrl);
    } catch {
      // ignore
    } finally {
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
        speechRate, setSpeechRate,
        ttsProvider, setTtsProvider,
        themeOverride, setThemeOverride,
        customApiUrl, setCustomApiUrl,
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

