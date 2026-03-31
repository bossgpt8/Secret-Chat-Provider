import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import { fetch } from "expo/fetch";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
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

// ─── Typing indicator ────────────────────────────────────────────────────────

function TypingIndicator({ colors }: { colors: ReturnType<typeof useColors> }) {
  const anims = [
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current,
  ];
  useEffect(() => {
    anims.forEach((a, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(a, { toValue: 1, duration: 280, useNativeDriver: Platform.OS !== "web" }),
          Animated.timing(a, { toValue: 0.3, duration: 280, useNativeDriver: Platform.OS !== "web" }),
          Animated.delay(480),
        ])
      ).start();
    });
  }, []);

  return (
    <View style={[bubbleStyles.row, bubbleStyles.aRow]}>
      <View style={[bubbleStyles.avatar, { backgroundColor: colors.primary }]}>
        <Ionicons name="mic" size={11} color="#fff" />
      </View>
      <View style={[bubbleStyles.bubble, bubbleStyles.aBubble, { backgroundColor: colors.assistantBubble, borderColor: colors.assistantBubbleBorder }]}>
        <View style={bubbleStyles.dots}>
          {anims.map((a, i) => (
            <Animated.View key={i} style={[bubbleStyles.dot, { backgroundColor: colors.primary, opacity: a }]} />
          ))}
        </View>
      </View>
    </View>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message, colors }: { message: Message; colors: ReturnType<typeof useColors> }) {
  const isUser = message.role === "user";
  return (
    <View style={[bubbleStyles.row, isUser ? bubbleStyles.uRow : bubbleStyles.aRow]}>
      {!isUser && (
        <View style={[bubbleStyles.avatar, { backgroundColor: colors.primary }]}>
          <Ionicons name="mic" size={11} color="#fff" />
        </View>
      )}
      <View style={[
        bubbleStyles.bubble,
        isUser
          ? [bubbleStyles.uBubble, { backgroundColor: colors.userBubble }]
          : [bubbleStyles.aBubble, { backgroundColor: colors.assistantBubble, borderColor: colors.assistantBubbleBorder }],
        message.isSearch && { borderLeftWidth: 3, borderLeftColor: colors.accent },
      ]}>
        {message.isSearch && (
          <View style={bubbleStyles.searchLabel}>
            <MaterialIcons name="travel-explore" size={11} color={colors.accent} />
            <Text style={[bubbleStyles.searchLabelText, { color: colors.accent }]}>Web search</Text>
          </View>
        )}
        <Text style={[bubbleStyles.text, { color: isUser ? colors.userBubbleText : colors.assistantBubbleText }]}>
          {message.content}
        </Text>
      </View>
    </View>
  );
}

const bubbleStyles = StyleSheet.create({
  row: { flexDirection: "row", marginVertical: 3, alignItems: "flex-end", gap: 7 },
  uRow: { justifyContent: "flex-end" },
  aRow: { justifyContent: "flex-start" },
  avatar: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  bubble: { maxWidth: "78%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  uBubble: { borderBottomRightRadius: 5 },
  aBubble: { borderBottomLeftRadius: 5, borderWidth: 1 },
  text: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  searchLabel: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 5 },
  searchLabelText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  dots: { flexDirection: "row", gap: 5, paddingVertical: 3 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
});

// ─── Siri orb ─────────────────────────────────────────────────────────────────

function SiriOrb({ isRecording, isSpeaking, colors }: {
  isRecording: boolean;
  isSpeaking: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  const pulse = useRef(new Animated.Value(1)).current;
  const ring1 = useRef(new Animated.Value(1)).current;
  const ring2 = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isRecording || isSpeaking) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.12, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== "web" }),
          Animated.timing(pulse, { toValue: 0.95, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== "web" }),
        ])
      ).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(ring1, { toValue: 1.5, duration: 900, useNativeDriver: Platform.OS !== "web" }),
          Animated.timing(ring1, { toValue: 1, duration: 0, useNativeDriver: Platform.OS !== "web" }),
        ])
      ).start();
      Animated.loop(
        Animated.sequence([
          Animated.delay(300),
          Animated.timing(ring2, { toValue: 1.8, duration: 900, useNativeDriver: Platform.OS !== "web" }),
          Animated.timing(ring2, { toValue: 1, duration: 0, useNativeDriver: Platform.OS !== "web" }),
        ])
      ).start();
      Animated.timing(glow, { toValue: 1, duration: 300, useNativeDriver: Platform.OS !== "web" }).start();
    } else {
      pulse.stopAnimation();
      ring1.stopAnimation();
      ring2.stopAnimation();
      Animated.timing(pulse, { toValue: 1, duration: 200, useNativeDriver: Platform.OS !== "web" }).start();
      Animated.timing(ring1, { toValue: 1, duration: 200, useNativeDriver: Platform.OS !== "web" }).start();
      Animated.timing(ring2, { toValue: 1, duration: 200, useNativeDriver: Platform.OS !== "web" }).start();
      Animated.timing(glow, { toValue: 0, duration: 300, useNativeDriver: Platform.OS !== "web" }).start();
    }
  }, [isRecording, isSpeaking]);

  const activeColor = isSpeaking ? colors.accent : colors.primary;

  return (
    <View style={orbStyles.container}>
      {/* Expanding rings */}
      <Animated.View style={[orbStyles.ring, {
        width: 80, height: 80, borderRadius: 40,
        borderColor: activeColor,
        opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.25] }),
        transform: [{ scale: ring2 }],
      }]} />
      <Animated.View style={[orbStyles.ring, {
        width: 72, height: 72, borderRadius: 36,
        borderColor: activeColor,
        opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.4] }),
        transform: [{ scale: ring1 }],
      }]} />
      {/* Core orb */}
      <Animated.View style={[orbStyles.orb, {
        backgroundColor: activeColor,
        transform: [{ scale: pulse }],
        shadowColor: activeColor,
        shadowOpacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] }) as unknown as number,
        shadowRadius: 20,
        elevation: 12,
      }]}>
        <Ionicons
          name={isRecording ? "mic" : isSpeaking ? "volume-high" : "mic-outline"}
          size={26}
          color="#fff"
        />
      </Animated.View>
    </View>
  );
}

const orbStyles = StyleSheet.create({
  container: { width: 88, height: 88, alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", borderWidth: 1.5 },
  orb: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
});

// ─── Main chat screen ─────────────────────────────────────────────────────────

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { assistantName, currentConversationId, setCurrentConversationId, createConversation, saveMessages, voiceId, speechRate } = useAssistant();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [isTtsEnabled, setIsTtsEnabled] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const inputRef = useRef<TextInput>(null);
  const activeConvId = useRef<string | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
      stopRecordingCleanup();
    };
  }, []);

  function getOrCreateConvId(): string {
    if (activeConvId.current) return activeConvId.current;
    if (currentConversationId) { activeConvId.current = currentConversationId; return currentConversationId; }
    const id = createConversation();
    activeConvId.current = id;
    setCurrentConversationId(id);
    return id;
  }

  async function getApiBase(): Promise<string> {
    const envUrl = process.env.EXPO_PUBLIC_API_URL;
    if (envUrl) return envUrl.endsWith("/") ? envUrl : `${envUrl}/`;
    if (Platform.OS === "web") return "/api/";
    return "/api/";
  }

  // ── TTS ────────────────────────────────────────────────────────────────────

  async function speakText(text: string) {
    if (!isTtsEnabled || !text.trim()) return;
    try {
      await Speech.stop();
      setIsSpeaking(true);
      const opts: Speech.SpeechOptions = {
        language: "en-US",
        pitch: 1.05,
        rate: speechRate,
        onDone: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
        onStopped: () => setIsSpeaking(false),
      };
      if (voiceId) opts.voice = voiceId;
      Speech.speak(text.slice(0, 800), opts);
    } catch {
      setIsSpeaking(false);
    }
  }

  // ── Voice recording ────────────────────────────────────────────────────────

  async function startRecording() {
    if (isStreaming || isTranscribing) return;
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        alert("Microphone permission is required for voice input.");
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      await Speech.stop();
      setIsSpeaking(false);

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      durationTimerRef.current = setInterval(() => {
        setRecordingDuration((d) => {
          if (d >= 59) { stopRecording(); return d; }
          return d + 1;
        });
      }, 1000);
    } catch {
      setIsRecording(false);
    }
  }

  function stopRecordingCleanup() {
    if (durationTimerRef.current) { clearInterval(durationTimerRef.current); durationTimerRef.current = null; }
    if (recordingRef.current) {
      recordingRef.current.stopAndUnloadAsync().catch(() => {});
      recordingRef.current = null;
    }
  }

  async function stopRecording() {
    if (!recordingRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (durationTimerRef.current) { clearInterval(durationTimerRef.current); durationTimerRef.current = null; }

    const rec = recordingRef.current;
    recordingRef.current = null;
    setIsRecording(false);
    setRecordingDuration(0);

    try {
      await rec.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = rec.getURI();
      if (!uri) return;
      await transcribeAndSend(uri);
    } catch {
      setIsTranscribing(false);
    }
  }

  async function transcribeAndSend(uri: string) {
    setIsTranscribing(true);
    try {
      const base = await getApiBase();
      const formData = new FormData();

      if (Platform.OS === "web") {
        const resp = await globalThis.fetch(uri);
        const blob = await resp.blob();
        formData.append("audio", blob, "audio.webm");
      } else {
        formData.append("audio", { uri, type: "audio/m4a", name: "audio.m4a" } as unknown as Blob);
      }

      const response = await fetch(`${base}transcribe`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json() as { text?: string; error?: string };
      const transcript = data.text?.trim();
      if (transcript && transcript.length > 1) {
        setIsTranscribing(false);
        await handleSend(transcript);
      } else {
        setIsTranscribing(false);
      }
    } catch {
      setIsTranscribing(false);
    }
  }

  // ── Send message ───────────────────────────────────────────────────────────

  const handleSend = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || isStreaming) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInput("");

    const convId = getOrCreateConvId();
    const snapshot = [...messages];
    const userMsg: Message = { id: generateMsgId(), role: "user", content: text, timestamp: Date.now() };
    const withUser = [...snapshot, userMsg];
    setMessages(withUser);
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
        const final = [...withUser, assistantMsg];
        setMessages(final);
        await saveMessages(convId, final);
        speakText(reply);
        return;
      }

      const chatHistory = withUser.map((m) => ({ role: m.role, content: m.content }));
      const systemPrompt = `You are ${assistantName}, a voice assistant like Siri. Be conversational, warm, and concise. 1-3 sentences max. No markdown.`;

      const response = await fetch(`${baseUrl}chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ messages: chatHistory, systemPrompt }),
      });

      if (!response.ok) throw new Error("Chat failed");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let buf = "";
      let fullContent = "";
      let assistantId = generateMsgId();
      let added = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data) as { content?: string };
            if (parsed.content) {
              fullContent += parsed.content;
              if (!added) {
                setShowTyping(false);
                setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: fullContent, timestamp: Date.now() }]);
                added = true;
              } else {
                setMessages((prev) => {
                  const u = [...prev];
                  u[u.length - 1] = { ...u[u.length - 1], content: fullContent };
                  return u;
                });
              }
            }
          } catch { /* skip */ }
        }
      }

      setMessages((finalMsgs) => { saveMessages(convId, finalMsgs); return finalMsgs; });
      speakText(fullContent);
    } catch {
      setShowTyping(false);
      setMessages((prev) => [...prev, { id: generateMsgId(), role: "assistant", content: "Sorry, something went wrong. Please try again.", timestamp: Date.now() }]);
    } finally {
      setIsStreaming(false);
      setShowTyping(false);
    }
  }, [input, isStreaming, isSearchMode, messages, assistantName]);

  function handleNewChat() {
    Speech.stop();
    setIsSpeaking(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMessages([]);
    setCurrentConversationId(null);
    activeConvId.current = null;
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const reversed = [...messages].reverse();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <View style={[styles.dot, { backgroundColor: isRecording ? colors.destructive : isSpeaking ? colors.accent : colors.success }]} />
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{assistantName}</Text>
          {isRecording && <Text style={[styles.recLabel, { color: colors.destructive }]}>● {recordingDuration}s</Text>}
          {isSearchMode && !isRecording && (
            <View style={[styles.badge, { backgroundColor: colors.accent + "20" }]}>
              <Text style={[styles.badgeText, { color: colors.accent }]}>Web</Text>
            </View>
          )}
        </View>
        <View style={styles.headerActions}>
          <Pressable style={[styles.iconBtn, isSearchMode && { backgroundColor: colors.primary + "18", borderRadius: 8 }]}
            onPress={() => { setIsSearchMode((v) => !v); Haptics.selectionAsync(); }}>
            <MaterialIcons name="travel-explore" size={20} color={isSearchMode ? colors.primary : colors.mutedForeground} />
          </Pressable>
          <Pressable style={[styles.iconBtn, isTtsEnabled && { backgroundColor: colors.primary + "18", borderRadius: 8 }]}
            onPress={() => { setIsTtsEnabled((v) => { if (v) { Speech.stop(); setIsSpeaking(false); } return !v; }); Haptics.selectionAsync(); }}>
            <Ionicons name={isTtsEnabled ? "volume-high" : "volume-mute"} size={20} color={isTtsEnabled ? colors.primary : colors.mutedForeground} />
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={handleNewChat}>
            <Ionicons name="create-outline" size={20} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {messages.length === 0 && !isTranscribing ? (
          /* ── Empty / Voice-first state ── */
          <View style={styles.voiceHome}>
            <Pressable onPress={isRecording ? stopRecording : startRecording} disabled={isStreaming}>
              <SiriOrb isRecording={isRecording} isSpeaking={isSpeaking} colors={colors} />
            </Pressable>

            {isRecording ? (
              <Text style={[styles.voiceHint, { color: colors.destructive }]}>Listening… tap to send</Text>
            ) : (
              <>
                <Text style={[styles.voiceTitle, { color: colors.foreground }]}>Hi, I&apos;m {assistantName}</Text>
                <Text style={[styles.voiceSubtitle, { color: colors.mutedForeground }]}>
                  Tap the mic and speak, or type below
                </Text>
                <View style={styles.quickChips}>
                  {["What can you do?", "Tell me a fun fact", "What's today's date?"].map((q) => (
                    <Pressable key={q} style={[styles.chip, { backgroundColor: colors.card, borderColor: colors.border }]}
                      onPress={() => handleSend(q)}>
                      <Text style={[styles.chipText, { color: colors.foreground }]}>{q}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
          </View>
        ) : (
          /* ── Message list ── */
          <FlatList
            data={reversed}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <MessageBubble message={item} colors={colors} />}
            inverted={messages.length > 0}
            ListHeaderComponent={
              showTyping || isTranscribing ? (
                <View>
                  {isTranscribing && (
                    <View style={[styles.transcribingBanner, { backgroundColor: colors.primary + "12" }]}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text style={[styles.transcribingText, { color: colors.primary }]}>Transcribing…</Text>
                    </View>
                  )}
                  {showTyping && <TypingIndicator colors={colors} />}
                </View>
              ) : null
            }
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* ── Input bar ── */}
        <View style={[styles.inputBar, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: bottomPad + 57 }]}>
          <View style={styles.inputRow}>
            <View style={[styles.textWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TextInput
                ref={inputRef}
                style={[styles.textInput, { color: colors.foreground }]}
                placeholder={isSearchMode ? "Search the web…" : `Ask ${assistantName}…`}
                placeholderTextColor={colors.mutedForeground}
                value={input}
                onChangeText={setInput}
                multiline
                maxLength={2000}
                returnKeyType="send"
                onSubmitEditing={() => handleSend()}
                blurOnSubmit={false}
                editable={!isRecording && !isTranscribing}
              />
              <Pressable
                style={[styles.sendBtn, { backgroundColor: input.trim() ? colors.primary : "transparent" }]}
                onPress={() => handleSend()}
                disabled={!input.trim() || isStreaming}
              >
                {isStreaming
                  ? <ActivityIndicator size="small" color={colors.mutedForeground} />
                  : <Ionicons name="arrow-up" size={17} color={input.trim() ? "#fff" : colors.mutedForeground} />}
              </Pressable>
            </View>

            {/* Mic button */}
            <Pressable
              style={[
                styles.micBtn,
                {
                  backgroundColor: isRecording ? colors.destructive : isTranscribing ? colors.muted : colors.primary,
                  shadowColor: isRecording ? colors.destructive : colors.primary,
                  shadowOpacity: isRecording ? 0.5 : 0.3,
                  shadowRadius: 8,
                  elevation: 6,
                },
              ]}
              onPress={isRecording ? stopRecording : startRecording}
              disabled={isStreaming}
            >
              {isTranscribing
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Ionicons name={isRecording ? "stop" : "mic"} size={22} color={isRecording ? "#fff" : "#fff"} />}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "flex-end",
    paddingBottom: 12, paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    justifyContent: "space-between",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  recLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  iconBtn: { padding: 8 },

  voiceHome: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 28 },
  voiceTitle: { fontSize: 22, fontFamily: "Inter_700Bold", marginTop: 8 },
  voiceSubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  voiceHint: { fontSize: 14, fontFamily: "Inter_600SemiBold", letterSpacing: 0.3 },
  quickChips: { width: "100%", gap: 8, marginTop: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, borderWidth: 1, alignItems: "center" },
  chipText: { fontSize: 14, fontFamily: "Inter_400Regular" },

  transcribingBanner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 10, marginHorizontal: 12, marginBottom: 4 },
  transcribingText: { fontSize: 13, fontFamily: "Inter_500Medium" },

  listContent: { paddingHorizontal: 12, paddingVertical: 10 },

  inputBar: { paddingHorizontal: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  textWrap: {
    flex: 1, flexDirection: "row", alignItems: "flex-end",
    borderRadius: 24, borderWidth: 1, paddingLeft: 14, paddingRight: 5, paddingVertical: 5,
  },
  textInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", maxHeight: 100, paddingVertical: 4, lineHeight: 21 },
  sendBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", alignSelf: "flex-end" },
  micBtn: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: "center", justifyContent: "center",
    shadowOffset: { width: 0, height: 2 },
  },
});
