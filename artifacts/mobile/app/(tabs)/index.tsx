import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import { fetch } from "expo/fetch";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
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

function TypingIndicator({ colors }: { colors: ReturnType<typeof useColors> }) {
  const anim1 = useRef(new Animated.Value(0.4)).current;
  const anim2 = useRef(new Animated.Value(0.4)).current;
  const anim3 = useRef(new Animated.Value(0.4)).current;

  React.useEffect(() => {
    const animate = (a: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(a, { toValue: 1, duration: 300, useNativeDriver: Platform.OS !== "web" }),
          Animated.timing(a, { toValue: 0.4, duration: 300, useNativeDriver: Platform.OS !== "web" }),
          Animated.delay(600),
        ])
      ).start();
    animate(anim1, 0);
    animate(anim2, 200);
    animate(anim3, 400);
  }, []);

  return (
    <View style={[styles.bubbleRow, styles.assistantRow]}>
      <View style={[styles.bubble, styles.assistantBubble, { backgroundColor: colors.assistantBubble, borderColor: colors.assistantBubbleBorder }]}>
        <View style={styles.dots}>
          {[anim1, anim2, anim3].map((a, i) => (
            <Animated.View key={i} style={[styles.dot, { backgroundColor: colors.mutedForeground, opacity: a }]} />
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
      {!isUser && (
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Ionicons name="mic" size={12} color="#fff" />
        </View>
      )}
      <View style={[
        styles.bubble,
        isUser
          ? [styles.userBubble, { backgroundColor: colors.userBubble }]
          : [styles.assistantBubble, { backgroundColor: colors.assistantBubble, borderColor: colors.assistantBubbleBorder }],
        message.isSearch && { borderLeftWidth: 3, borderLeftColor: colors.accent },
      ]}>
        {message.isSearch && (
          <View style={styles.searchLabel}>
            <MaterialIcons name="travel-explore" size={11} color={colors.accent} />
            <Text style={[styles.searchLabelText, { color: colors.accent }]}>Web search</Text>
          </View>
        )}
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
  const { assistantName, currentConversationId, setCurrentConversationId, createConversation, saveMessages } = useAssistant();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [isTtsEnabled, setIsTtsEnabled] = useState(true);
  const inputRef = useRef<TextInput>(null);
  const activeConvId = useRef<string | null>(null);

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

  async function speakText(text: string) {
    if (!isTtsEnabled) return;
    try {
      await Speech.stop();
      Speech.speak(text, {
        language: "en-US",
        pitch: 1.0,
        rate: Platform.OS === "ios" ? 0.52 : 1.0,
      });
    } catch {
      // ignore TTS errors
    }
  }

  async function handleSend(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || isStreaming) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInput("");
    inputRef.current?.focus();

    const convId = getOrCreateConvId();
    const currentMessages = [...messages];

    const userMsg: Message = { id: generateMsgId(), role: "user", content: text, timestamp: Date.now() };
    const newMessages = [...currentMessages, userMsg];
    setMessages(newMessages);
    setIsStreaming(true);
    setShowTyping(true);

    try {
      const baseUrl = await getApiBase();

      if (isSearchMode) {
        const resp = await fetch(`${baseUrl}search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: text, assistantName }),
        });
        const data = await resp.json() as { result?: string; error?: string };
        setShowTyping(false);
        const reply = data.result ?? data.error ?? "No results found.";
        const assistantMsg: Message = { id: generateMsgId(), role: "assistant", content: reply, timestamp: Date.now(), isSearch: true };
        const finalMsgs = [...newMessages, assistantMsg];
        setMessages(finalMsgs);
        await saveMessages(convId, finalMsgs);
        speakText(reply.slice(0, 500));
        return;
      }

      const chatHistory = newMessages.map((m) => ({ role: m.role, content: m.content }));
      const systemPrompt = `You are ${assistantName}, a helpful voice assistant. Be conversational and concise. Keep responses under 3 sentences when possible.`;

      const response = await fetch(`${baseUrl}chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ messages: chatHistory, systemPrompt }),
      });

      if (!response.ok) throw new Error("Chat failed");

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
            if (parsed.content) {
              fullContent += parsed.content;
              if (!assistantAdded) {
                setShowTyping(false);
                setMessages((prev) => [...prev, { id: generateMsgId(), role: "assistant", content: fullContent, timestamp: Date.now() }]);
                assistantAdded = true;
              } else {
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { ...updated[updated.length - 1], content: fullContent };
                  return updated;
                });
              }
            }
          } catch { /* skip */ }
        }
      }

      setMessages((finalMsgs) => {
        saveMessages(convId, finalMsgs);
        return finalMsgs;
      });
      speakText(fullContent.slice(0, 500));
    } catch {
      setShowTyping(false);
      setMessages((prev) => [...prev, { id: generateMsgId(), role: "assistant", content: "Sorry, something went wrong. Please try again.", timestamp: Date.now() }]);
    } finally {
      setIsStreaming(false);
      setShowTyping(false);
    }
  }

  function handleNewChat() {
    Speech.stop();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMessages([]);
    setCurrentConversationId(null);
    activeConvId.current = null;
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const reversed = [...messages].reverse();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <View style={[styles.activeDot, { backgroundColor: colors.success }]} />
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{assistantName}</Text>
          {isSearchMode && (
            <View style={[styles.badge, { backgroundColor: colors.accent + "20" }]}>
              <Text style={[styles.badgeText, { color: colors.accent }]}>Search</Text>
            </View>
          )}
        </View>
        <View style={styles.headerActions}>
          <Pressable style={[styles.iconBtn, isSearchMode && { backgroundColor: colors.primary + "15", borderRadius: 8 }]}
            onPress={() => { setIsSearchMode((v) => !v); Haptics.selectionAsync(); }}>
            <MaterialIcons name="travel-explore" size={20} color={isSearchMode ? colors.primary : colors.mutedForeground} />
          </Pressable>
          <Pressable style={[styles.iconBtn, isTtsEnabled && { backgroundColor: colors.primary + "15", borderRadius: 8 }]}
            onPress={() => { setIsTtsEnabled((v) => !v); if (isTtsEnabled) Speech.stop(); Haptics.selectionAsync(); }}>
            <Ionicons name={isTtsEnabled ? "volume-high" : "volume-mute"} size={20} color={isTtsEnabled ? colors.primary : colors.mutedForeground} />
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={handleNewChat}>
            <Ionicons name="create-outline" size={20} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
        {messages.length === 0 ? (
          <View style={styles.empty}>
            <View style={[styles.emptyOrb, { backgroundColor: colors.primary + "15" }]}>
              <Ionicons name="mic" size={44} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Hi, I&apos;m {assistantName}</Text>
            <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
              Ask me anything. I can chat, search the web, and control your phone.
            </Text>
            <View style={styles.quickActions}>
              {["What can you do?", "Tell me a fun fact", "Search: latest AI news"].map((q) => (
                <Pressable key={q} style={[styles.quickChip, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => { if (q.startsWith("Search:")) { setIsSearchMode(true); setInput(q.replace("Search: ", "")); } else handleSend(q); }}>
                  <Text style={[styles.quickText, { color: colors.foreground }]}>{q}</Text>
                  <Ionicons name="arrow-forward" size={14} color={colors.mutedForeground} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            data={reversed}
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

        {/* Input */}
        <View style={[styles.inputBar, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 8 }]}>
          <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
              onSubmitEditing={() => handleSend()}
            />
            <Pressable
              style={[styles.sendBtn, { backgroundColor: (isStreaming || !input.trim()) ? colors.muted : colors.primary }]}
              onPress={() => handleSend()}
              disabled={isStreaming || !input.trim()}
            >
              {isStreaming
                ? <ActivityIndicator size="small" color={colors.mutedForeground} />
                : <Ionicons name="arrow-up" size={18} color={input.trim() ? colors.primaryForeground : colors.mutedForeground} />}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", paddingBottom: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, justifyContent: "space-between" },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  activeDot: { width: 8, height: 8, borderRadius: 4 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  iconBtn: { padding: 8 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, gap: 10 },
  emptyOrb: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  emptyTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  emptySubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
  quickActions: { width: "100%", gap: 8, marginTop: 12 },
  quickChip: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  quickText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  listContent: { paddingHorizontal: 12, paddingVertical: 10 },
  bubbleRow: { flexDirection: "row", marginVertical: 3, alignItems: "flex-end", gap: 8 },
  userRow: { justifyContent: "flex-end" },
  assistantRow: { justifyContent: "flex-start" },
  avatar: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  bubble: { maxWidth: "78%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  userBubble: { borderBottomRightRadius: 4 },
  assistantBubble: { borderBottomLeftRadius: 4, borderWidth: 1 },
  bubbleText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  searchLabel: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 },
  searchLabelText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  dots: { flexDirection: "row", gap: 4, paddingVertical: 2 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  inputBar: { paddingHorizontal: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  inputRow: { flexDirection: "row", alignItems: "flex-end", borderRadius: 24, borderWidth: 1, paddingLeft: 16, paddingRight: 6, paddingVertical: 6, gap: 6 },
  textInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", maxHeight: 120, paddingVertical: 4, lineHeight: 21 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", alignSelf: "flex-end" },
});
