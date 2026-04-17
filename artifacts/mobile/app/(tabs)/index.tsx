import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Contacts from "expo-contacts";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import { fetch } from "expo/fetch";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Linking,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAssistant, generateMsgId, type Message } from "@/context/AssistantContext";
import { useColors } from "@/hooks/useColors";
import { NativeAccessibility, type ZenoAccessibilityNotification } from "@/modules/NativeAccessibility";
import { NativeNotifications, type ZenoNotification } from "@/modules/NativeNotifications";
import { NativeScreenLock } from "@/modules/NativeScreenLock";

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

  function handleLongPress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Share.share({ message: message.content });
  }

  return (
    <Pressable onLongPress={handleLongPress} delayLongPress={400}>
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
    </Pressable>
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

const CALL_MODE_RETRY_DELAY_MS = 400;

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { assistantName, currentConversationId, setCurrentConversationId, createConversation, saveMessages, phoneVoiceId, elVoiceId, speechRate, ttsProvider, customApiUrl, userProfile, assistantPersonality, wakeWordEnabled, readIncomingEnabled } = useAssistant();

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
  const [isCallMode, setIsCallMode] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [notifPermGranted, setNotifPermGranted] = useState(false);
  const [lastNotification, setLastNotification] = useState<ZenoNotification | null>(null);
  const lastNotifRef = useRef<ZenoNotification | null>(null);

  const inputRef = useRef<TextInput>(null);
  const activeConvId = useRef<string | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elSoundRef = useRef<Audio.Sound | null>(null);
  const isCallModeRef = useRef(false);
  const isStreamingRef = useRef(false);
  const isTranscribingRef = useRef(false);

  // Wake word refs
  const wakeWordLoopRef = useRef(false);
  const wakeWordEnabledRef = useRef(wakeWordEnabled);
  const readIncomingEnabledRef = useRef(readIncomingEnabled);
  const assistantNameRef = useRef(assistantName);
  const pendingCallModeAfterTtsRef = useRef(false);
  const wakeWordRegexRef = useRef<RegExp | null>(null);
  const isWakeListeningRef = useRef(false);
  const [isWakeListening, setIsWakeListening] = useState(false);

  useEffect(() => {
    return () => {
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
      stopRecordingCleanup();
      elSoundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  useEffect(() => { isStreamingRef.current = isStreaming; }, [isStreaming]);
  useEffect(() => { isTranscribingRef.current = isTranscribing; }, [isTranscribing]);
  useEffect(() => { isCallModeRef.current = isCallMode; }, [isCallMode]);
  useEffect(() => { lastNotifRef.current = lastNotification; }, [lastNotification]);
  useEffect(() => { wakeWordEnabledRef.current = wakeWordEnabled; }, [wakeWordEnabled]);
  useEffect(() => { readIncomingEnabledRef.current = readIncomingEnabled; }, [readIncomingEnabled]);
  useEffect(() => {
    assistantNameRef.current = assistantName;
    const escaped = assistantName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    wakeWordRegexRef.current = new RegExp(`(?:hey[\\s,!]+)?${escaped}`, "i");
  }, [assistantName]);

  // Start / stop wake word loop whenever enabled state or call mode changes
  useEffect(() => {
    if (wakeWordEnabled && !isCallMode) {
      if (!wakeWordLoopRef.current) {
        wakeWordLoopRef.current = true;
        setTimeout(() => wakeWordLoopTick(), 300);
      }
    } else {
      wakeWordLoopRef.current = false;
      setIsWakeListening(false);
    }
    return () => {
      wakeWordLoopRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wakeWordEnabled, isCallMode]);

  function toNotificationFromAccessibility(n: ZenoAccessibilityNotification): ZenoNotification {
    const sender = n.sender?.trim() || n.app || "Unknown sender";
    const text = n.text?.trim() || "New notification";
    return {
      key: `acc-${n.timestamp}-${n.packageName}`,
      app: n.app || n.packageName,
      packageName: n.packageName,
      sender,
      text,
      timestamp: n.timestamp,
      hasReply: false,
    };
  }

  function buildIncomingSpeechText(n: Pick<ZenoNotification, "sender" | "text">): string {
    const sender = n.sender?.trim() || "Unknown sender";
    const msg = n.text?.trim();
    return msg
      ? `Boss, you have a new message from ${sender}: ${msg}`
      : `Boss, you have a new message from ${sender}`;
  }

  function handleIncomingNotification(n: ZenoNotification) {
    setLastNotification(n);
    lastNotifRef.current = n;
    setNotifPermGranted(true);
    const spoken = buildIncomingSpeechText(n);
    if (isCallModeRef.current && !isStreamingRef.current) {
      stopSpeaking().then(() => {
        stopRecordingCleanup();
        setIsRecording(false);
        speakText(spoken);
      });
    } else if (readIncomingEnabledRef.current && !isStreamingRef.current) {
      speakText(spoken);
    }
  }

  useEffect(() => {
    if (Platform.OS === "web") return;

    let disposed = false;
    let unsubNotification: () => void = () => {};
    let unsubAccessibility: () => void = () => {};

    const setupListeners = async () => {
      const hasNotificationAccess = NativeNotifications.isAvailable
        ? await NativeNotifications.hasPermission().catch(() => false)
        : false;
      if (disposed) return;
      setNotifPermGranted(hasNotificationAccess);

      if (hasNotificationAccess && NativeNotifications.isAvailable) {
        unsubNotification = NativeNotifications.onNotification((n) => {
          handleIncomingNotification(n);
        });
        return;
      }

      if (!NativeAccessibility.isAvailable) return;
      const isAccessibilityEnabled = await NativeAccessibility.isEnabled().catch(() => false);
      if (!isAccessibilityEnabled || disposed) return;

      unsubAccessibility = NativeAccessibility.onNotification((event) => {
        handleIncomingNotification(toNotificationFromAccessibility(event));
      });
    };

    setupListeners().catch(() => {});
    return () => {
      disposed = true;
      unsubNotification();
      unsubAccessibility();
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
    if (customApiUrl && customApiUrl.trim()) {
      const u = customApiUrl.trim();
      return u.endsWith("/") ? u : `${u}/`;
    }
    const envUrl = process.env.EXPO_PUBLIC_API_URL;
    if (envUrl) return envUrl.endsWith("/") ? envUrl : `${envUrl}/`;
    if (Platform.OS === "web") return "/api/";
    return "https://secret-chat-provider--adellamarie.replit.app/api/";
  }

  // ── Wake word ──────────────────────────────────────────────────────────────

  function getWakeWordGreeting(): string {
    const { gender, userName } = userProfile;
    const greetName = userName ? `, ${userName}` : "";
    switch (assistantPersonality) {
      case "casual":
        if (gender === "male") return `Yo bro${greetName}! What's up?`;
        if (gender === "female") return `Hey sis${greetName}! What do you need?`;
        return `Hey${greetName}! What's up?`;
      case "professional":
        return `Hello${greetName}. How can I assist you?`;
      case "witty":
        return `${assistantName} is listening${greetName}! What can I do for you?`;
      case "caring":
        return `Hey${greetName}! So glad you called. How can I help?`;
      default: // friendly
        if (gender === "male") return `Hey bro${greetName}! I'm here. What do you need?`;
        if (gender === "female") return `Hey sis${greetName}! I'm here. What do you need?`;
        return `Hey${greetName}! I'm here. What can I do for you?`;
    }
  }

  async function wakeWordLoopTick() {
    if (!wakeWordLoopRef.current) return;
    // Pause if something else is using audio
    if (isCallModeRef.current || isStreamingRef.current || recordingRef.current) {
      setTimeout(() => wakeWordLoopTick(), 800);
      return;
    }
    let rec: Audio.Recording | null = null;
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") { wakeWordLoopRef.current = false; setIsWakeListening(false); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      rec = recording;
      isWakeListeningRef.current = true;
      setIsWakeListening(true);
      // Listen for 3 seconds
      await new Promise<void>((resolve) => setTimeout(resolve, 3000));
      isWakeListeningRef.current = false;
      setIsWakeListening(false);
      if (!wakeWordLoopRef.current) { rec.stopAndUnloadAsync().catch(() => {}); return; }
      await rec.stopAndUnloadAsync();
      rec = null;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      if (!wakeWordLoopRef.current) return;
      const uri = recording.getURI();
      if (!uri) { setTimeout(() => wakeWordLoopTick(), 300); return; }
      // Transcribe silently
      const base = await getApiBase();
      const fd = new FormData();
      fd.append("audio", { uri, type: "audio/m4a", name: "audio.m4a" } as unknown as Blob);
      const resp = await fetch(`${base}transcribe`, { method: "POST", body: fd });
      const { text = "" } = await resp.json() as { text?: string };
      if (!wakeWordLoopRef.current) return;
      // Check for wake word: "hey [name]" or just "[name]"
      const wakeRe = wakeWordRegexRef.current;
      if (wakeRe && wakeRe.test(text.trim())) {
        // Wake word triggered
        wakeWordLoopRef.current = false;
        setIsWakeListening(false);
        pendingCallModeAfterTtsRef.current = true;
        speakText(getWakeWordGreeting());
      } else {
        if (wakeWordLoopRef.current) setTimeout(() => wakeWordLoopTick(), 300);
      }
    } catch {
      isWakeListeningRef.current = false;
      setIsWakeListening(false);
      if (rec) rec.stopAndUnloadAsync().catch(() => {});
      try { await Audio.setAudioModeAsync({ allowsRecordingIOS: false }); } catch { /* ignore */ }
      if (wakeWordLoopRef.current) setTimeout(() => wakeWordLoopTick(), 2000);
    }
  }

  // ── TTS ────────────────────────────────────────────────────────────────────

  async function stopSpeaking() {
    if (Platform.OS !== "web") Speech.stop().catch(() => {});
    if (elSoundRef.current) {
      await elSoundRef.current.stopAsync().catch(() => {});
      await elSoundRef.current.unloadAsync().catch(() => {});
      elSoundRef.current = null;
    }
    setIsSpeaking(false);
  }

  function onTtsDone() {
    setIsSpeaking(false);
    if (pendingCallModeAfterTtsRef.current && !isStreamingRef.current) {
      pendingCallModeAfterTtsRef.current = false;
      startCallMode();
    } else if (isCallModeRef.current && !isStreamingRef.current) {
      setTimeout(() => { if (isCallModeRef.current) startRecording(); }, CALL_MODE_RETRY_DELAY_MS);
    }
  }

  async function speakWithPhone(text: string) {
    if (Platform.OS === "web") { onTtsDone(); return; }
    const opts: Speech.SpeechOptions = {
      language: "en-US",
      pitch: 1.05,
      rate: speechRate,
      onDone: onTtsDone,
      onError: onTtsDone,
      onStopped: () => setIsSpeaking(false),
    };
    if (phoneVoiceId) opts.voice = phoneVoiceId;
    Speech.speak(text.slice(0, 800), opts);
  }

  async function speakText(text: string) {
    if (!isTtsEnabled || !text.trim()) {
      if (isCallModeRef.current) onTtsDone();
      return;
    }
    await stopSpeaking();
    setIsSpeaking(true);

    if (ttsProvider === "elevenlabs" && Platform.OS !== "web") {
      try {
        const base = await getApiBase();
        const resp = await fetch(`${base}tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text.slice(0, 800), voiceId: elVoiceId }),
        });

        if (resp.ok) {
          await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
          const blob = await resp.blob();
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve, reject) => {
            reader.onloadend = () => {
              const result = reader.result as string;
              resolve(result.split(",")[1] ?? "");
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          const { sound } = await Audio.Sound.createAsync(
            { uri: `data:audio/mpeg;base64,${base64}` },
            { shouldPlay: true, volume: 1.0 }
          );
          elSoundRef.current = sound;
          sound.setOnPlaybackStatusUpdate((status) => {
            if (!status.isLoaded) return;
            if (status.didJustFinish) {
              sound.unloadAsync().catch(() => {});
              elSoundRef.current = null;
              onTtsDone();
            }
          });
          return;
        }
      } catch {
        // fall through to phone TTS
      }
    }

    // Phone TTS (default or fallback)
    try {
      await speakWithPhone(text);
    } catch {
      onTtsDone();
    }
  }

  // ── Call mode ──────────────────────────────────────────────────────────────

  async function startCallMode() {
    isCallModeRef.current = true;
    setIsCallMode(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await startRecording();
  }

  async function endCallMode() {
    isCallModeRef.current = false;
    setIsCallMode(false);
    stopRecordingCleanup();
    setIsRecording(false);
    setRecordingDuration(0);
    await stopSpeaking();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    // Resume wake word listener if the user has it enabled
    if (wakeWordEnabledRef.current) {
      setTimeout(() => {
        if (wakeWordEnabledRef.current && !isCallModeRef.current) {
          wakeWordLoopRef.current = true;
          wakeWordLoopTick();
        }
      }, 600);
    }
  }

  // ── Voice recording ────────────────────────────────────────────────────────

  async function startRecording() {
    if (isStreamingRef.current || isTranscribingRef.current) return;
    // If wake word loop is mid-recording, stop it first
    if (isWakeListeningRef.current) {
      wakeWordLoopRef.current = false;
      isWakeListeningRef.current = false;
      setIsWakeListening(false);
      await new Promise<void>((r) => setTimeout(r, 300));
    }
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        alert("Microphone permission is required for voice input.");
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      await stopSpeaking();

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      durationTimerRef.current = setInterval(() => {
        setRecordingDuration((d) => {
          const limit = isCallModeRef.current ? 7 : 59;
          if (d >= limit) { stopRecording(); return d; }
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
      if (!uri) {
        if (isCallModeRef.current) setTimeout(() => { if (isCallModeRef.current) startRecording(); }, CALL_MODE_RETRY_DELAY_MS);
        return;
      }
      await transcribeAndSend(uri);
    } catch {
      setIsTranscribing(false);
      if (isCallModeRef.current) setTimeout(() => { if (isCallModeRef.current) startRecording(); }, CALL_MODE_RETRY_DELAY_MS);
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
        if (isCallModeRef.current) {
          setTimeout(() => { if (isCallModeRef.current) startRecording(); }, CALL_MODE_RETRY_DELAY_MS);
        }
      }
    } catch {
      setIsTranscribing(false);
      if (isCallModeRef.current) {
        setTimeout(() => { if (isCallModeRef.current) startRecording(); }, CALL_MODE_RETRY_DELAY_MS);
      } else {
        setMessages((prev) => [
          ...prev,
          { id: generateMsgId(), role: "assistant", content: "Sorry, I couldn't transcribe that. Please try again.", timestamp: Date.now() },
        ]);
      }
    }
  }

  // ── Device intent detection ─────────────────────────────────────────────────

  interface DeviceIntent {
    type:
      | "flashlight_on" | "flashlight_off" | "flashlight_toggle"
      | "brightness_up" | "brightness_down" | "brightness_max" | "brightness_min" | "brightness_set"
      | "battery_check"
      | "call" | "sms"
      | "send_app_message"
      | "open_app"
      | "vibrate"
      | "lock_screen"
      | "read_last_message"
      | "reply_message"
      | "setup_notifications";
    value?: number;
    phone?: string;
    name?: string;
    message?: string;
    app?: string;
  }

  function extractPhoneNumber(text: string): string | undefined {
    const m = text.match(/(\+?[\d][\d\s\-()]{5,}[\d])/);
    return m ? m[1].replace(/[\s\-()]/g, "") : undefined;
  }

  function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // A name is 1–30 chars: letter, then letters/spaces/apostrophes/hyphens (ASCII subset for intent matching).
  const NAME_PAT = "[A-Za-z][A-Za-z\\s'\\-]{1,29}";

  // Returns true when the notification sender name contains the target name as a whole word.
  function matchesSenderName(sender: string, targetName: string): boolean {
    const pattern = new RegExp(`\\b${escapeRegex(targetName)}\\b`, "i");
    return pattern.test(sender);
  }

  // verbPattern is a regex alternation string (e.g. "call|dial|phone|ring"), not a plain string.
  function extractContactName(text: string, verbPattern: string): string | undefined {
    const m = text.match(new RegExp(`\\b(?:${verbPattern})\\s+(${NAME_PAT})`, "i"));
    if (!m) return undefined;
    // Strip trailing filler words ("saying", "to say", etc.) so they don't bleed into the name
    return m[1].replace(/\s+(?:and say|saying|to say|that)\s+.*$/i, "").trim();
  }

  async function lookupContactPhone(name: string): Promise<string | undefined> {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") return undefined;
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
        name,
      });
      const contact = data[0];
      return contact?.phoneNumbers?.[0]?.number?.replace(/[\s\-()]/g, "") ?? undefined;
    } catch {
      return undefined;
    }
  }

  function resolveMessagingApp(appName: string, packageName: string): "telegram" | "whatsapp" | null {
    const pkg = packageName.toLowerCase();
    if (pkg.startsWith("org.telegram")) return "telegram";
    if (pkg.startsWith("com.whatsapp")) return "whatsapp";
    const app = appName.toLowerCase().trim();
    if (app === "telegram" || app === "telegram messenger") return "telegram";
    if (app === "whatsapp" || app === "whatsapp messenger") return "whatsapp";
    return null;
  }

  async function openMessagingReplyDraft(appName: string, packageName: string, sender: string, message: string): Promise<boolean> {
    const appTarget = resolveMessagingApp(appName, packageName);
    if (!appTarget) return false;
    const phone = await lookupContactPhone(sender);
    const encoded = encodeURIComponent(message);
    const deepUrl = appTarget === "telegram"
      ? (phone ? `tg://msg?to=${phone}&text=${encoded}` : `tg://msg?text=${encoded}`)
      : (phone ? `whatsapp://send?phone=${phone}&text=${encoded}` : `whatsapp://send?text=${encoded}`);
    try {
      await Linking.openURL(deepUrl);
      return true;
    } catch {
      return false;
    }
  }

  function detectDeviceIntent(text: string): DeviceIntent | null {
    const t = text.toLowerCase().trim();

    // Flashlight
    if (/\b(flashlight|torch|flash)\b/.test(t)) {
      if (/\b(on|turn on|switch on|enable|activate)\b/.test(t)) return { type: "flashlight_on" };
      if (/\b(off|turn off|switch off|disable|deactivate)\b/.test(t)) return { type: "flashlight_off" };
      return { type: "flashlight_toggle" };
    }

    // Brightness
    if (/\b(brightness|screen bright|dim|bright)\b/.test(t)) {
      const pct = t.match(/(\d+)\s*(%|percent)/);
      if (pct) return { type: "brightness_set", value: parseInt(pct[1]) };
      if (/\b(max|full|100|highest|all the way)\b/.test(t)) return { type: "brightness_max" };
      if (/\b(min|lowest|0|off)\b/.test(t)) return { type: "brightness_min" };
      if (/\b(up|increase|raise|more|brighter|higher)\b/.test(t)) return { type: "brightness_up" };
      if (/\b(down|decrease|lower|less|dimmer|darker|dim|reduce)\b/.test(t)) return { type: "brightness_down" };
      return null;
    }

    // Battery
    if (/\b(battery|charge)\b/.test(t) && /\b(level|percent|status|check|much|left|remaining|low|life)\b/.test(t)) {
      return { type: "battery_check" };
    }

    // Call (skip "call mode" phrase)
    if (/\b(call|dial|phone|ring)\b/.test(t) && !/call mode/.test(t)) {
      const phone = extractPhoneNumber(t);
      const name = phone ? undefined : extractContactName(t, "call|dial|phone|ring");
      return { type: "call", phone, name };
    }

    // SMS / Text
    if (/\b(text|sms|send (a )?(text|message|sms)|message)\b/.test(t)) {
      const phone = extractPhoneNumber(t);
      let msgBody = "";
      let contactName: string | undefined;
      if (phone) {
        const afterNum = text.split(phone.slice(-5))[1]?.trim();
        msgBody = afterNum ?? "";
      } else {
        contactName = extractContactName(t, "text|sms|message");
        // Extract the message body that follows the contact name
        if (contactName) {
          const afterName = text.replace(/\b(?:text|sms|message)\s+/i, "").replace(new RegExp(`^${escapeRegex(contactName)}\\s*`, "i"), "").trim();
          msgBody = afterName;
        }
      }
      return { type: "sms", phone, name: contactName, message: msgBody || undefined };
    }

    // WhatsApp / Telegram direct message — "tell Precious on WhatsApp I'm hungry"
    // Pattern 1: tell/send/message [name] on/via WhatsApp/Telegram [text]
    const appMsgVerb = t.match(
      new RegExp(`\\b(?:tell|send|message)\\s+(${NAME_PAT}?)\\s+(?:on|via)\\s+(whatsapp|telegram)\\b(?:\\s+(?:that\\s+|saying\\s+)?(.+))?`, "i")
    );
    if (appMsgVerb) {
      const [, rawName, rawApp, rawMsg] = appMsgVerb;
      return {
        type: "send_app_message",
        name: rawName?.trim(),
        app: rawApp.charAt(0).toUpperCase() + rawApp.slice(1).toLowerCase(),
        message: rawMsg?.trim() || undefined,
      };
    }
    // Pattern 2: WhatsApp/Telegram [name] [text]
    const appMsgPrefix = t.match(
      new RegExp(`^(whatsapp|telegram)\\s+(${NAME_PAT}?)\\s+(?:(?:that|saying)\\s+)?(.+)`, "i")
    );
    if (appMsgPrefix && !/\b(open|launch|start)\b/.test(t)) {
      const [, rawApp, rawName, rawMsg] = appMsgPrefix;
      return {
        type: "send_app_message",
        name: rawName?.trim(),
        app: rawApp.charAt(0).toUpperCase() + rawApp.slice(1).toLowerCase(),
        message: rawMsg?.trim() || undefined,
      };
    }

    // Open app
    if (/\b(open|launch|start|go to|take me to)\b/.test(t)) {
      if (/\byoutube\b/.test(t))                              return { type: "open_app", app: "YouTube" };
      if (/\bwhatsapp\b/.test(t))                            return { type: "open_app", app: "WhatsApp" };
      if (/\b(maps?|navigation|directions|google maps)\b/.test(t)) return { type: "open_app", app: "Maps" };
      if (/\bspotify\b/.test(t))                             return { type: "open_app", app: "Spotify" };
      if (/\binstagram\b/.test(t))                           return { type: "open_app", app: "Instagram" };
      if (/\b(twitter|x\.com|\bx\b app)\b/.test(t))         return { type: "open_app", app: "Twitter" };
      if (/\bfacebook\b/.test(t))                            return { type: "open_app", app: "Facebook" };
      if (/\bnetflix\b/.test(t))                             return { type: "open_app", app: "Netflix" };
      if (/\btiktok\b/.test(t))                              return { type: "open_app", app: "TikTok" };
      if (/\bgmail\b/.test(t))                               return { type: "open_app", app: "Gmail" };
      if (/\btelegram\b/.test(t))                            return { type: "open_app", app: "Telegram" };
      if (/\b(settings?)\b/.test(t))                        return { type: "open_app", app: "Settings" };
      if (/\bcamera\b/.test(t))                              return { type: "open_app", app: "Camera" };
      if (/\b(gallery|photos|pictures)\b/.test(t))          return { type: "open_app", app: "Gallery" };
      if (/\b(browser|chrome|firefox|internet|safari)\b/.test(t)) return { type: "open_app", app: "Browser" };
      if (/\b(clock|alarm|timer)\b/.test(t))                return { type: "open_app", app: "Clock" };
      if (/\b(calculator|calc)\b/.test(t))                  return { type: "open_app", app: "Calculator" };
      if (/\bplay store\b/.test(t))                         return { type: "open_app", app: "Play Store" };
    }

    // Vibrate
    if (/\bvibrat(e|ion|ing)\b/.test(t)) return { type: "vibrate" };

    // Timer / alarm shorthand (without "open" keyword)
    if (/\b(set (an? )?(alarm|timer)|timer for|alarm (at|for))\b/.test(t)) {
      return { type: "open_app", app: "Clock" };
    }

    // Lock screen
    if (/\b(lock (my )?(phone|screen|device)|lock it|lock now)\b/.test(t)) {
      return { type: "lock_screen" };
    }

    // Read last notification
    if (/\b(what did (she|he|they) say|read (the )?(message|notification)|what('?s| is) the message|read it|what did it say)\b/.test(t)) {
      return { type: "read_last_message" };
    }

    // Reply to last notification — pronouns: "tell her / tell them back [message]"
    const replyMatch = t.match(/^(?:tell|reply|respond|say back|text back|message back|send|write|respond)(?:\s+(?:her|him|them|back))+\s+(.+)/);
    if (replyMatch && replyMatch[1]) {
      return { type: "reply_message", message: replyMatch[1].trim() };
    }
    // Reply by person name: "tell Precious I'm on my way"
    const replyByName = t.match(new RegExp(`^(?:tell|reply to|respond to)\\s+(${NAME_PAT}?)\\s+(?:(?:that|saying|to say)\\s+)?([^]+)`, "i"));
    if (replyByName && replyByName[2] && !/\b(on|via)\s+(whatsapp|telegram)\b/i.test(t)) {
      return { type: "reply_message", name: replyByName[1].trim(), message: replyByName[2].trim() };
    }

    // Setup notification permission
    if (/\b(set(up)? (notification|message) (access|permission|listener)|allow (reading|access to) notifications)\b/.test(t)) {
      return { type: "setup_notifications" };
    }

    return null;
  }

  async function handleDeviceCommand(intent: DeviceIntent, text: string): Promise<void> {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInput("");

    const convId = getOrCreateConvId();
    const userMsg: Message = { id: generateMsgId(), role: "user", content: text, timestamp: Date.now() };
    const withUser = [...messages, userMsg];
    setMessages(withUser);

    async function respond(reply: string) {
      const aMsg: Message = { id: generateMsgId(), role: "assistant", content: reply, timestamp: Date.now() };
      const final = [...withUser, aMsg];
      setMessages(final);
      await saveMessages(convId, final);
      speakText(reply);
    }

    if (Platform.OS === "web") {
      await respond("Device controls are only available on a real Android device.");
      return;
    }

    const Brightness = await import("expo-brightness");
    const Battery = await import("expo-battery");

    switch (intent.type) {

      case "flashlight_on":
      case "flashlight_off":
      case "flashlight_toggle": {
        if (!cameraPermission?.granted) {
          const { granted } = await requestCameraPermission();
          if (!granted) {
            await respond("I need camera permission to control the flashlight. Please grant it in your settings.");
            return;
          }
        }
        const next = intent.type === "flashlight_on" ? true : intent.type === "flashlight_off" ? false : !torchOn;
        setTorchOn(next);
        if (next) setCameraReady(true); else setTimeout(() => setCameraReady(false), 500);
        await respond(next ? "Flashlight is on." : "Flashlight is off.");
        break;
      }

      case "brightness_set":
      case "brightness_up":
      case "brightness_down":
      case "brightness_max":
      case "brightness_min": {
        try {
          const current = await Brightness.getBrightnessAsync();
          let next = current;
          if (intent.type === "brightness_set") next = Math.max(0.05, Math.min(1, (intent.value ?? 50) / 100));
          else if (intent.type === "brightness_up") next = Math.min(1, current + 0.25);
          else if (intent.type === "brightness_down") next = Math.max(0.05, current - 0.25);
          else if (intent.type === "brightness_max") next = 1;
          else next = 0.05;
          await Brightness.setBrightnessAsync(next);
          await respond(`Screen brightness set to ${Math.round(next * 100)}%.`);
        } catch {
          await respond("I couldn't change the screen brightness on this device.");
        }
        break;
      }

      case "battery_check": {
        try {
          const level = await Battery.getBatteryLevelAsync();
          const state = await Battery.getBatteryStateAsync();
          const pct = Math.round(level * 100);
          const stateStr =
            state === Battery.BatteryState.CHARGING ? " and currently charging" :
            state === Battery.BatteryState.FULL ? " and fully charged" : "";
          await respond(`Your battery is at ${pct}%${stateStr}.`);
        } catch {
          await respond("I couldn't read the battery level right now.");
        }
        break;
      }

      case "call": {
        let phone = intent.phone;
        if (!phone && intent.name) {
          phone = await lookupContactPhone(intent.name);
          if (!phone) {
            await respond(`I couldn't find a phone number for ${intent.name} in your contacts.`);
            break;
          }
        }
        const url = phone ? `tel:${phone}` : "tel:";
        const canOpen = await Linking.canOpenURL(url).catch(() => false);
        if (canOpen || !phone) {
          await Linking.openURL(url).catch(() => {});
          await respond(phone ? `Calling ${intent.name ?? phone}.` : "Opening the phone dialer.");
        } else {
          await respond("I couldn't open the phone dialer on this device.");
        }
        break;
      }

      case "sms": {
        let phone = intent.phone;
        if (!phone && intent.name) {
          phone = await lookupContactPhone(intent.name);
          if (!phone) {
            await respond(`I couldn't find a phone number for ${intent.name} in your contacts.`);
            break;
          }
        }
        const base = phone ? `sms:${phone}` : "sms:";
        const sep = Platform.OS === "ios" ? "&" : "?";
        const url = intent.message ? `${base}${sep}body=${encodeURIComponent(intent.message)}` : base;
        await Linking.openURL(url).catch(() => {});
        await respond(phone ? `Opening messages for ${intent.name ?? phone}.` : "Opening the messages app.");
        break;
      }

      case "open_app": {
        const app = intent.app ?? "";
        const appUrls: Record<string, string[]> = {
          YouTube:    ["youtube://", "https://youtube.com"],
          WhatsApp:   ["whatsapp://send", "https://wa.me"],
          Maps:       ["geo:0,0", "https://maps.google.com"],
          Spotify:    ["spotify://", "https://open.spotify.com"],
          Instagram:  ["instagram://", "https://instagram.com"],
          Twitter:    ["twitter://", "https://x.com"],
          Facebook:   ["fb://", "https://facebook.com"],
          Netflix:    ["nflx://", "https://netflix.com"],
          TikTok:     ["tiktok://", "https://tiktok.com"],
          Gmail:      ["googlegmail://", "https://mail.google.com"],
          Telegram:   ["tg://", "https://t.me"],
          Calculator: ["android-app://com.android.calculator2", ""],
          Clock:      ["android-app://com.google.android.deskclock", ""],
          Gallery:    ["content://media/external/images/media", "https://photos.google.com"],
          Browser:    ["https://google.com"],
          Camera:     ["android.media.action.IMAGE_CAPTURE", ""],
          "Play Store": ["market://", "https://play.google.com"],
        };
        try {
          if (app === "Settings") {
            await Linking.openSettings();
            await respond("Opening settings.");
          } else {
            const urls = appUrls[app] ?? [`https://${app.toLowerCase().replace(/\s/g, "")}.com`];
            let opened = false;
            for (const u of urls) {
              if (!u) continue;
              const ok = await Linking.canOpenURL(u).catch(() => false);
              if (ok) { await Linking.openURL(u); opened = true; break; }
            }
            if (!opened) {
              const fallback = urls.find(u => u.startsWith("http"));
              if (fallback) { await Linking.openURL(fallback).catch(() => {}); opened = true; }
            }
            await respond(opened ? `Opening ${app}.` : `I couldn't find ${app} on this device.`);
          }
        } catch {
          await respond(`I couldn't open ${app}.`);
        }
        break;
      }

      case "vibrate": {
        Vibration.vibrate([0, 300, 100, 300]);
        await respond("Vibrating.");
        break;
      }

      case "lock_screen": {
        if (!NativeScreenLock.isAvailable) {
          await respond("Screen lock control is only available on Android devices.");
          break;
        }
        const isAdmin = await NativeScreenLock.isAdminEnabled().catch(() => false);
        if (!isAdmin) {
          await NativeScreenLock.requestAdmin();
          await respond("I need device admin permission to lock your screen. Please grant it.");
        } else {
          const locked = await NativeScreenLock.lock().catch(() => false);
          if (locked) {
            await respond("Locking your screen now.");
          } else {
            await respond("I couldn't lock the screen. Please check device admin permissions in Settings.");
          }
        }
        break;
      }

      case "read_last_message": {
        if (!NativeNotifications.isAvailable && !NativeAccessibility.isAvailable) {
          await respond("Notification reading is only available on Android devices.");
          break;
        }
        const hasPermN = NativeNotifications.isAvailable
          ? await NativeNotifications.hasPermission().catch(() => false)
          : false;
        // Prefer the most recently received notification; fall back to fetching from the system
        const cachedNotif = lastNotifRef.current;
        if (cachedNotif) {
          await respond(`${cachedNotif.sender} on ${cachedNotif.app} said: "${cachedNotif.text}"`);
        } else if (hasPermN) {
          const recent = await NativeNotifications.getRecent().catch((): ZenoNotification[] => []);
          const latest = recent[0];
          if (latest) {
            await respond(`Latest message from ${latest.sender} on ${latest.app}: "${latest.text}"`);
          } else {
            await respond("You have no recent notifications.");
          }
        } else {
          await respond("I don't have a recent message yet. Enable Notification Access or Accessibility Service first.");
        }
        break;
      }

      case "reply_message": {
        if (!NativeNotifications.isAvailable && !NativeAccessibility.isAvailable) {
          await respond("Replying to messages is only available on Android devices.");
          break;
        }
        const hasPermR = NativeNotifications.isAvailable
          ? await NativeNotifications.hasPermission().catch(() => false)
          : false;
        const replyText = intent.message ?? "";
        if (!replyText) {
          await respond("What would you like to say in your reply?");
          break;
        }
        // When a person name is given, search recent notifications for that sender
        let target = lastNotifRef.current;
        if (intent.name && hasPermR) {
          const recent = await NativeNotifications.getRecent().catch((): ZenoNotification[] => []);
          const named = recent.find((n) => matchesSenderName(n.sender, intent.name!));
          if (named) {
            target = named;
          } else {
            await respond(`I don't have a recent notification from ${intent.name} to reply to.`);
            break;
          }
        }
        if (!target) {
          await respond("There's no recent message to reply to.");
          break;
        }
        if (!target.hasReply || !hasPermR) {
          const opened = await openMessagingReplyDraft(
            target.app,
            target.packageName,
            target.sender,
            replyText
          );
          if (opened) {
            const permissionNote = target.hasReply && !hasPermR
              ? " I still need Notification Access for direct inline replies."
              : "";
            await respond(`I prepared your reply to ${target.sender} in ${target.app}. Tap Send to deliver it.${permissionNote}`);
          } else {
            await respond(`I can't send an inline reply to ${target.sender} from ${target.app}.`);
          }
          break;
        }
        const sent = await NativeNotifications.replyTo(target.key, replyText).catch(() => false);
        if (sent) {
          await respond(`Replied to ${target.sender}: "${replyText}"`);
        } else {
          await respond(`I couldn't send the reply to ${target.sender}.`);
        }
        break;
      }

      case "send_app_message": {
        if (!intent.message) {
          await respond(`What would you like to say to ${intent.name ?? "them"} on ${intent.app ?? "WhatsApp"}?`);
          break;
        }
        // 1. Try auto-reply via notification system if a recent message from this person exists
        if (NativeNotifications.isAvailable && intent.name) {
          const hasPerm = await NativeNotifications.hasPermission().catch(() => false);
          if (hasPerm) {
            const recent = await NativeNotifications.getRecent().catch((): ZenoNotification[] => []);
            const appFilter = intent.app?.toLowerCase();
            const match = recent.find((n) => {
              const nameOk = matchesSenderName(n.sender, intent.name!);
              const appOk = !appFilter || n.app.toLowerCase().includes(appFilter);
              return nameOk && appOk;
            });
            if (match?.hasReply) {
              const autoSent = await NativeNotifications.replyTo(match.key, intent.message).catch(() => false);
              if (autoSent) {
                await respond(`Sent to ${intent.name} on ${intent.app ?? match.app}: "${intent.message}"`);
                break;
              }
            }
          }
        }
        // 2. Fall back to deep link — pre-fills message but user must tap Send
        const encodedMsg = encodeURIComponent(intent.message);
        let phone: string | undefined;
        if (intent.name) {
          phone = await lookupContactPhone(intent.name);
        }
        let deepUrl: string;
        const targetApp = (intent.app ?? "WhatsApp").toLowerCase();
        if (targetApp === "telegram") {
          deepUrl = phone
            ? `tg://msg?to=${phone}&text=${encodedMsg}`
            : `tg://msg?text=${encodedMsg}`;
        } else {
          // WhatsApp
          deepUrl = phone
            ? `whatsapp://send?phone=${phone}&text=${encodedMsg}`
            : `whatsapp://send?text=${encodedMsg}`;
        }
        try {
          await Linking.openURL(deepUrl);
          const label = intent.name ? ` for ${intent.name}` : "";
          await respond(
            `Opening ${intent.app ?? "WhatsApp"} with your message${label} pre-filled — tap Send to deliver it.`
          );
        } catch {
          await respond(`I couldn't open ${intent.app ?? "WhatsApp"} on this device.`);
        }
        break;
      }

      case "setup_notifications": {
        if (!NativeNotifications.isAvailable) {
          await respond("Notification access is only available on Android devices.");
          break;
        }
        try {
          await NativeNotifications.requestPermission();
          await respond("Opening notification access settings. Please enable it for me, then come back.");
        } catch {
          await respond("I couldn't open notification settings. Please enable it manually in Settings > Apps > Special app access > Notification access.");
        }
        break;
      }
    }
  }

  // ── Send message ───────────────────────────────────────────────────────────

  const handleSend = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || isStreaming) return;

    // Check for device commands first
    const deviceIntent = detectDeviceIntent(text);
    if (deviceIntent) { handleDeviceCommand(deviceIntent, text); return; }

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

      // Build personality-aware, profile-aware system prompt
      const personalityText: Record<string, string> = {
        friendly: "Be warm, supportive, and upbeat.",
        casual: "Be relaxed and casual. Use informal, everyday language.",
        professional: "Be formal, precise, and to the point.",
        witty: "Be clever and add light humor when appropriate.",
        caring: "Be empathetic, gentle, and attentive to the user's feelings.",
      };
      const promptParts: string[] = [
        `You are ${assistantName}, a voice assistant.`,
        personalityText[assistantPersonality] ?? personalityText.friendly,
      ];
      if (userProfile.userName) promptParts.push(`The user's name is ${userProfile.userName}.`);
      if (userProfile.age) promptParts.push(`They are ${userProfile.age} years old.`);
      if (assistantPersonality === "casual" || assistantPersonality === "friendly") {
        if (userProfile.gender === "male") promptParts.push("Occasionally address them as 'bro'.");
        else if (userProfile.gender === "female") promptParts.push("Occasionally address them as 'sis'.");
      }
      promptParts.push("Keep responses to 1-3 sentences. No markdown.");
      const systemPrompt = promptParts.join(" ");

      const response = await fetch(`${baseUrl}chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ messages: chatHistory, systemPrompt }),
      });

      if (!response.ok) throw new Error("Chat failed");

      const parseSseChunk = (chunk: string): string => {
        let out = "";
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data) as { content?: string; error?: string };
            if (parsed.content) out += parsed.content;
            else if (parsed.error) out += parsed.error;
          } catch { /* skip malformed lines */ }
        }
        return out;
      };

      const reader = response.body?.getReader();
      let fullContent = "";
      const assistantId = generateMsgId();
      let added = false;

      if (!reader) {
        fullContent = parseSseChunk(await response.text());
      } else {
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          const delta = parseSseChunk(lines.join("\n"));
          if (!delta) continue;
          fullContent += delta;
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
        if (buf) fullContent += parseSseChunk(buf);
      }

      if (!fullContent.trim()) throw new Error("No response received from chat service.");
      if (!added) {
        setShowTyping(false);
        setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: fullContent, timestamp: Date.now() }]);
      }

      setMessages((finalMsgs) => { saveMessages(convId, finalMsgs); return finalMsgs; });
      speakText(fullContent);
    } catch (error) {
      console.warn("Chat send failed", error);
      const errMsg = "Sorry, something went wrong. Please try again.";
      setShowTyping(false);
      setMessages((prev) => [...prev, { id: generateMsgId(), role: "assistant", content: errMsg, timestamp: Date.now() }]);
      speakText(errMsg);
    } finally {
      setIsStreaming(false);
      setShowTyping(false);
    }
  }, [input, isStreaming, isSearchMode, messages, assistantName, userProfile, assistantPersonality]);

  function handleNewChat() {
    endCallMode();
    stopSpeaking();
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
      {/* Hidden camera view used purely for torch/flashlight control */}
      {cameraReady && Platform.OS !== "web" && (
        <CameraView
          style={{ position: "absolute", width: 0, height: 0, opacity: 0 }}
          facing="back"
          enableTorch={torchOn}
        />
      )}

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <View style={[styles.dot, { backgroundColor: isRecording ? colors.destructive : isSpeaking ? colors.accent : colors.success }]} />
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{assistantName}</Text>
          {isRecording && <Text style={[styles.recLabel, { color: colors.destructive }]}>● {recordingDuration}s</Text>}
          {isWakeListening && !isRecording && (
            <View style={[styles.badge, { backgroundColor: colors.primary + "20" }]}>
              <Ionicons name="ear-outline" size={11} color={colors.primary} />
              <Text style={[styles.badgeText, { color: colors.primary }]}>Listening</Text>
            </View>
          )}
          {isSearchMode && !isRecording && !isWakeListening && (
            <View style={[styles.badge, { backgroundColor: colors.accent + "20" }]}>
              <Text style={[styles.badgeText, { color: colors.accent }]}>Web</Text>
            </View>
          )}
          {torchOn && !isRecording && !isWakeListening && (
            <View style={[styles.badge, { backgroundColor: "#f59e0b20" }]}>
              <Ionicons name="flashlight" size={11} color="#f59e0b" />
              <Text style={[styles.badgeText, { color: "#f59e0b" }]}>Torch</Text>
            </View>
          )}
        </View>
        <View style={styles.headerActions}>
          <Pressable style={[styles.iconBtn, isSearchMode && { backgroundColor: colors.primary + "18", borderRadius: 8 }]}
            onPress={() => { setIsSearchMode((v) => !v); Haptics.selectionAsync(); }}>
            <MaterialIcons name="travel-explore" size={20} color={isSearchMode ? colors.primary : colors.mutedForeground} />
          </Pressable>
          <Pressable style={[styles.iconBtn, isTtsEnabled && { backgroundColor: colors.primary + "18", borderRadius: 8 }]}
            onPress={() => { setIsTtsEnabled((v) => { if (v) { stopSpeaking(); } return !v; }); Haptics.selectionAsync(); }}>
            <Ionicons name={isTtsEnabled ? "volume-high" : "volume-mute"} size={20} color={isTtsEnabled ? colors.primary : colors.mutedForeground} />
          </Pressable>
          <Pressable
            style={[styles.iconBtn, isCallMode && { backgroundColor: colors.destructive + "18", borderRadius: 8 }]}
            onPress={isCallMode ? endCallMode : startCallMode}
            disabled={isStreaming}
          >
            <Ionicons name={isCallMode ? "call" : "call-outline"} size={20} color={isCallMode ? colors.destructive : colors.mutedForeground} />
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={handleNewChat}>
            <Ionicons name="create-outline" size={20} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {/* ── Call mode banner ── */}
        {isCallMode && (
          <View style={[styles.callBanner, { backgroundColor: colors.destructive + "12", borderBottomColor: colors.destructive + "30" }]}>
            <View style={[styles.callDot, { backgroundColor: colors.destructive }]} />
            <Text style={[styles.callBannerText, { color: colors.destructive }]}>
              {isSpeaking ? `${assistantName} is speaking…` : isRecording ? `Listening… speak now (${7 - recordingDuration}s)` : isTranscribing ? "Processing…" : isStreaming ? `${assistantName} is thinking…` : "Call mode — waiting…"}
            </Text>
            <Pressable onPress={endCallMode} style={styles.callEndBtn}>
              <Ionicons name="call" size={14} color={colors.destructive} />
              <Text style={[styles.callEndText, { color: colors.destructive }]}>End</Text>
            </Pressable>
          </View>
        )}

        {messages.length === 0 && !isTranscribing ? (
          /* ── Empty / Voice-first state ── */
          <View style={styles.voiceHome}>
            <Pressable onPress={isRecording ? stopRecording : startRecording} disabled={isStreaming || isCallMode || isWakeListening}>
              <SiriOrb isRecording={isRecording} isSpeaking={isSpeaking} colors={colors} />
            </Pressable>

            {isCallMode ? (
              <>
                <Text style={[styles.voiceHint, { color: colors.destructive }]}>
                  {isSpeaking ? "Speaking…" : isRecording ? `Listening (${7 - recordingDuration}s left)` : "Getting ready…"}
                </Text>
                <Pressable style={[styles.endCallChip, { backgroundColor: colors.destructive + "15", borderColor: colors.destructive + "40" }]} onPress={endCallMode}>
                  <Ionicons name="call" size={14} color={colors.destructive} />
                  <Text style={[styles.chipText, { color: colors.destructive }]}>End call</Text>
                </Pressable>
              </>
            ) : isRecording ? (
              <Text style={[styles.voiceHint, { color: colors.destructive }]}>Listening… tap to send</Text>
            ) : (
              <>
                <Text style={[styles.voiceTitle, { color: colors.foreground }]}>Hi, I&apos;m {assistantName}</Text>
                <Text style={[styles.voiceSubtitle, { color: colors.mutedForeground }]}>
                  Tap the mic to speak, or tap the phone icon for hands-free call mode
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
              disabled={isStreaming || isWakeListening}
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
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
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
  endCallChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 14, borderWidth: 1 },

  callBanner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  callDot: { width: 8, height: 8, borderRadius: 4 },
  callBannerText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  callEndBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  callEndText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

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
