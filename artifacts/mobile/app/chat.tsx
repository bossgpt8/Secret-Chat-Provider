import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { fetch } from "expo/fetch";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAssistant, generateMsgId, type Message } from "@/context/AssistantContext";
import { useColors } from "@/hooks/useColors";

const VOICE_ENABLED = Platform.OS !== "web";

function TypingIndicator({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.bubbleRow, styles.assistantRow]}>
      <View style={[styles.bubble, styles.assistantBubble, {
        backgroundColor: colors.assistantBubble,
        borderColor: colors.assistantBubbleBorder,
      }]}>
        <View style={styles.typingDots}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.dot, { backgroundColor: colors.mutedForeground }]} />
          ))}
        </View>
      </View>
    </View>
  );
}

function MessageBubble({ message, colors }: { message: Message; colors: ReturnType<typeof useColors> }) {
  const isUser = message.role === "user";
  return (
    <View style={[styles.bubbleRow, isUser ? styles.userRow : styles.assistantRow]}>
      <View
        style={[
          styles.bubble,
          isUser
            ? [styles.userBubble, { backgroundColor: colors.userBubble }]
            : [styles.assistantBubble, { backgroundColor: colors.assistantBubble, borderColor: colors.assistantBubbleBorder }],
        ]}
      >
        <Text style={[styles.bubbleText, { color: isUser ? colors.userBubbleText : colors.assistantBubbleText }]}>
          {message.content}
        </Text>
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { assistantName, currentConversationId, setCurrentConversationId, createConversation, saveMessages, conversations } = useAssistant();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const initializedRef = useRef(false);

  const activeConvId = useRef<string | null>(null);

  // Load messages when conversation changes
  useEffect(() => {
    if (!initializedRef.current && currentConversationId) {
      const conv = conversations.find((c) => c.id === currentConversationId);
      if (conv?.messages?.length) {
        setMessages(conv.messages);
      }
      initializedRef.current = true;
    }
  }, [currentConversationId, conversations]);

  // Reset when no conversation
  useEffect(() => {
    if (!currentConversationId) {
      setMessages([]);
      initializedRef.current = false;
      activeConvId.current = null;
    }
  }, [currentConversationId]);

  function getOrCreateConvId(): string {
    if (activeConvId.current) return activeConvId.current;
    if (currentConversationId) {
      activeConvId.current = currentConversationId;
      return currentConversationId;
    }
    const newId = createConversation();
    activeConvId.current = newId;
    setCurrentConversationId(newId);
    return newId;
  }

  async function getApiBase(): Promise<string> {
    if (Platform.OS === "web") return "/api/";
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    return domain ? `https://${domain}/api/` : "/api/";
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || isStreaming) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInput("");
    inputRef.current?.focus();

    const convId = getOrCreateConvId();
    const currentMessages = [...messages];

    const userMsg: Message = {
      id: generateMsgId(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    const newMessages = [...currentMessages, userMsg];
    setMessages(newMessages);
    setIsStreaming(true);
    setShowTyping(true);

    try {
      const baseUrl = await getApiBase();

      if (isSearchMode) {
        // Web search mode — non-streaming
        const resp = await fetch(`${baseUrl}search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: text, assistantName }),
        });
        const data = await resp.json() as { result?: string; error?: string };
        setShowTyping(false);
        const assistantMsg: Message = {
          id: generateMsgId(),
          role: "assistant",
          content: data.result ?? data.error ?? "No results found.",
          timestamp: Date.now(),
        };
        const finalMessages = [...newMessages, assistantMsg];
        setMessages(finalMessages);
        await saveMessages(convId, finalMessages);
        return;
      }

      // Streaming chat
      const chatHistory = newMessages.map((m) => ({ role: m.role, content: m.content }));
      const systemPrompt = `You are ${assistantName}, a helpful and friendly voice assistant. Keep responses natural and conversational. Be concise when appropriate.`;

      const response = await fetch(`${baseUrl}chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ messages: chatHistory, systemPrompt }),
      });

      if (!response.ok) throw new Error("Chat request failed");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";
      let assistantAdded = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data) as { content?: string; error?: string };
            if (parsed.error) {
              setShowTyping(false);
              const errMsg: Message = {
                id: generateMsgId(),
                role: "assistant",
                content: `Error: ${parsed.error}`,
                timestamp: Date.now(),
              };
              setMessages((prev) => [...prev, errMsg]);
              return;
            }
            if (parsed.content) {
              fullContent += parsed.content;
              if (!assistantAdded) {
                setShowTyping(false);
                setMessages((prev) => [
                  ...prev,
                  { id: generateMsgId(), role: "assistant", content: fullContent, timestamp: Date.now() },
                ]);
                assistantAdded = true;
              } else {
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    content: fullContent,
                  };
                  return updated;
                });
              }
            }
          } catch {
            // skip malformed
          }
        }
      }

      // Save after streaming
      setMessages((finalMsgs) => {
        saveMessages(convId, finalMsgs);
        return finalMsgs;
      });
    } catch {
      setShowTyping(false);
      const errMsg: Message = {
        id: generateMsgId(),
        role: "assistant",
        content: "Sorry, something went wrong. Please try again.",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsStreaming(false);
      setShowTyping(false);
    }
  }

  function handleNewChat() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCurrentConversationId(null);
    initializedRef.current = false;
    activeConvId.current = null;
  }

  const reversedMessages = [...messages].reverse();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Pressable style={styles.headerBtn} onPress={() => router.push("/history")}>
          <Ionicons name="menu" size={24} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={[styles.activeDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{assistantName}</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            style={[styles.headerBtn, isSearchMode && { backgroundColor: colors.primary + "20", borderRadius: 8 }]}
            onPress={() => { setIsSearchMode((v) => !v); Haptics.selectionAsync(); }}
          >
            <Ionicons name="search" size={22} color={isSearchMode ? colors.primary : colors.mutedForeground} />
          </Pressable>
          <Pressable style={styles.headerBtn} onPress={handleNewChat}>
            <Ionicons name="create-outline" size={22} color={colors.mutedForeground} />
          </Pressable>
          <Pressable style={styles.headerBtn} onPress={() => router.push("/settings")}>
            <Ionicons name="settings-outline" size={22} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>

      {isSearchMode && (
        <View style={[styles.searchBanner, { backgroundColor: colors.primary + "15", borderBottomColor: colors.primary + "30" }]}>
          <MaterialIcons name="travel-explore" size={14} color={colors.primary} />
          <Text style={[styles.searchBannerText, { color: colors.primary }]}>
            Web search mode — powered by LLaMA 3.3
          </Text>
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
        {/* Messages */}
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.primary + "15" }]}>
              <Ionicons name="mic" size={40} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              Hi, I&apos;m {assistantName}
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
              Ask me anything or tap the mic to speak
            </Text>
            <View style={styles.quickActions}>
              {["What's the weather like?", "Tell me a fun fact", "Help me write an email"].map((q) => (
                <Pressable
                  key={q}
                  style={[styles.quickChip, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => { setInput(q); inputRef.current?.focus(); }}
                >
                  <Text style={[styles.quickChipText, { color: colors.foreground }]}>{q}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            data={reversedMessages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <MessageBubble message={item} colors={colors} />}
            inverted={messages.length > 0}
            ListHeaderComponent={showTyping ? <TypingIndicator colors={colors} /> : null}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Input bar */}
        <View
          style={[
            styles.inputBar,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
              paddingBottom: bottomPad + 8,
            },
          ]}
        >
          <View style={[styles.inputContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput
              ref={inputRef}
              style={[styles.textInput, { color: colors.foreground }]}
              placeholder={isSearchMode ? "Search the web..." : `Message ${assistantName}...`}
              placeholderTextColor={colors.mutedForeground}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={2000}
              blurOnSubmit={false}
              returnKeyType="send"
              onSubmitEditing={handleSend}
            />
            {input.trim().length > 0 ? (
              <Pressable
                style={[styles.sendBtn, { backgroundColor: isStreaming ? colors.muted : colors.primary }]}
                onPress={handleSend}
                disabled={isStreaming}
              >
                {isStreaming ? (
                  <ActivityIndicator size="small" color={colors.mutedForeground} />
                ) : (
                  <Ionicons name="arrow-up" size={18} color={colors.primaryForeground} />
                )}
              </Pressable>
            ) : VOICE_ENABLED ? (
              <Pressable style={[styles.sendBtn, { backgroundColor: colors.primary + "15" }]}>
                <Ionicons name="mic" size={18} color={colors.primary} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingBottom: 12,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { padding: 8, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  activeDot: { width: 7, height: 7, borderRadius: 4 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  headerRight: { flexDirection: "row", alignItems: "center" },
  searchBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchBannerText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  emptySubtitle: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  quickActions: { flexDirection: "column", gap: 8, marginTop: 12, width: "100%" },
  quickChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  quickChipText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  listContent: { paddingHorizontal: 12, paddingVertical: 12 },
  bubbleRow: { flexDirection: "row", marginVertical: 3 },
  userRow: { justifyContent: "flex-end" },
  assistantRow: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "82%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  userBubble: { borderBottomRightRadius: 4 },
  assistantBubble: { borderBottomLeftRadius: 4, borderWidth: 1 },
  bubbleText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  typingDots: { flexDirection: "row", gap: 4, paddingVertical: 4, paddingHorizontal: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, opacity: 0.6 },
  inputBar: {
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderRadius: 24,
    borderWidth: 1,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    gap: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    maxHeight: 120,
    paddingVertical: 4,
    lineHeight: 21,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-end",
  },
});
