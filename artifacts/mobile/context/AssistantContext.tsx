import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";

const ASSISTANT_NAME_KEY = "@assistant_name";
const CONVERSATIONS_KEY = "@conversations";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
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
  isLoading: boolean;
}

const AssistantContext = createContext<AssistantContextType | null>(null);

let msgCounter = 0;
export function generateMsgId(): string {
  msgCounter++;
  return `msg-${Date.now()}-${msgCounter}-${Math.random().toString(36).substr(2, 9)}`;
}

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [assistantName, setAssistantNameState] = useState("Nova");
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [name, convsRaw] = await Promise.all([
        AsyncStorage.getItem(ASSISTANT_NAME_KEY),
        AsyncStorage.getItem(CONVERSATIONS_KEY),
      ]);
      if (name) {
        setAssistantNameState(name);
        setIsOnboarded(true);
      }
      if (convsRaw) {
        setConversations(JSON.parse(convsRaw));
      }
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

  function createConversation(): string {
    const id = `conv-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const now = Date.now();
    const conv: Conversation = {
      id,
      title: "New Chat",
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    setConversations((prev) => [conv, ...prev]);
    return id;
  }

  async function saveMessages(convId: string, messages: Message[], title?: string) {
    setConversations((prev) => {
      const updated = prev.map((c) => {
        if (c.id !== convId) return c;
        const newTitle =
          title ??
          (messages.find((m) => m.role === "user")?.content.slice(0, 40) || c.title);
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
    if (currentConversationId === id) {
      setCurrentConversationId(null);
    }
  }

  return (
    <AssistantContext.Provider
      value={{
        assistantName,
        setAssistantName,
        isOnboarded,
        conversations,
        currentConversationId,
        setCurrentConversationId,
        createConversation,
        saveMessages,
        deleteConversation,
        isLoading,
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
