import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Contacts from "expo-contacts";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as Speech from "expo-speech";
import { fetch } from "expo/fetch";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
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
import { KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAssistant, generateMsgId, type Message, type Conversation } from "@/context/AssistantContext";
import { useColors } from "@/hooks/useColors";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { NativeAccessibility, type VoxAccessibilityNotification } from "@/modules/NativeAccessibility";
import { NativeCallScreening, type CallStateEvent } from "@/modules/NativeCallScreening";
import { NativeMediaControl } from "@/modules/NativeMediaControl";
import { NativeNotifications, type VoxNotification } from "@/modules/NativeNotifications";
import { NativeOverlay } from "@/modules/NativeOverlay";
import { NativeScreenCapture } from "@/modules/NativeScreenCapture";
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

// ─── Waveform bars — react to live audio amplitude ────────────────────────────

function WaveformBars({ audioLevel, colors }: {
  audioLevel: Animated.Value;
  colors: ReturnType<typeof useColors>;
}) {
  const NUM_BARS = 5;
  const BASE_H = 4;
  const MAX_HEIGHTS = [16, 28, 36, 26, 18];

  const bars = useRef(
    Array.from({ length: NUM_BARS }, () => new Animated.Value(BASE_H))
  ).current;

  useEffect(() => {
    const id = audioLevel.addListener(({ value }) => {
      bars.forEach((b, i) => {
        const target = BASE_H + value * (MAX_HEIGHTS[i] - BASE_H);
        Animated.timing(b, { toValue: target, duration: 80, useNativeDriver: false }).start();
      });
    });
    return () => audioLevel.removeListener(id);
  }, []);

  return (
    <View style={waveStyles.container}>
      {bars.map((h, i) => (
        <Animated.View key={i} style={[waveStyles.bar, { height: h, backgroundColor: colors.primary }]} />
      ))}
    </View>
  );
}

const waveStyles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", gap: 5, height: 40, marginTop: 10 },
  bar: { width: 4, borderRadius: 2, opacity: 0.85 },
});

// ─── Siri-style orb — scale driven by voice amplitude when recording ──────────

function SiriOrb({ isRecording, isSpeaking, audioLevel, colors }: {
  isRecording: boolean;
  isSpeaking: boolean;
  audioLevel?: Animated.Value;
  colors: ReturnType<typeof useColors>;
}) {
  const pulse = useRef(new Animated.Value(1)).current;
  const ring1 = useRef(new Animated.Value(1)).current;
  const ring2 = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isSpeaking) {
      // Speaking: smooth fixed-speed pulse
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.12, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== "web" }),
          Animated.timing(pulse, { toValue: 0.95, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== "web" }),
        ])
      ).start();
    } else if (isRecording) {
      // Recording: pulse stays at 1 — orb scale is driven by audioLevel prop instead
      pulse.stopAnimation();
      Animated.timing(pulse, { toValue: 1, duration: 100, useNativeDriver: Platform.OS !== "web" }).start();
    } else {
      pulse.stopAnimation();
      Animated.timing(pulse, { toValue: 1, duration: 200, useNativeDriver: Platform.OS !== "web" }).start();
    }

    if (isRecording || isSpeaking) {
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
      ring1.stopAnimation();
      ring2.stopAnimation();
      Animated.timing(ring1, { toValue: 1, duration: 200, useNativeDriver: Platform.OS !== "web" }).start();
      Animated.timing(ring2, { toValue: 1, duration: 200, useNativeDriver: Platform.OS !== "web" }).start();
      Animated.timing(glow, { toValue: 0, duration: 300, useNativeDriver: Platform.OS !== "web" }).start();
    }
  }, [isRecording, isSpeaking]);

  const activeColor = isSpeaking ? colors.accent : colors.primary;

  // When recording, scale is driven by voice amplitude; otherwise use the pulse loop
  const orbScaleTransform = isRecording && audioLevel
    ? audioLevel.interpolate({ inputRange: [0, 1], outputRange: [1.0, 1.4] })
    : pulse;

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
      {/* Core orb — amplitude-reactive when recording */}
      <Animated.View style={[orbStyles.orb, {
        backgroundColor: activeColor,
        transform: [{ scale: orbScaleTransform as Animated.AnimatedInterpolation<number> }],
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

// ─── Conversation Sidebar ─────────────────────────────────────────────────────

function formatRelativeDate(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const day = 86400000;
  if (diff < day) return "Today";
  if (diff < 2 * day) return "Yesterday";
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface ConversationSidebarProps {
  open: boolean;
  onClose: () => void;
  conversations: Conversation[];
  currentId: string | null;
  onSelect: (conv: Conversation) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  colors: ReturnType<typeof useColors>;
}

function ConversationSidebar({ open, onClose, conversations, currentId, onSelect, onNew, onDelete, colors }: ConversationSidebarProps) {
  const translateX = useRef(new Animated.Value(-300)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      Animated.parallel([
        Animated.spring(translateX, { toValue: 0, useNativeDriver: Platform.OS !== "web", damping: 22, stiffness: 200 }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: Platform.OS !== "web" }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, { toValue: -300, duration: 200, useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: Platform.OS !== "web" }),
      ]).start();
    }
  }, [open]);

  if (!open && (translateX as any)._value <= -299) return null;

  function confirmDelete(id: string, title: string) {
    Alert.alert("Delete conversation", `Delete "${title}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => onDelete(id) },
    ]);
  }

  return (
    <View style={sidebarStyles.overlay} pointerEvents={open ? "auto" : "none"}>
      {/* Backdrop */}
      <Animated.View style={[sidebarStyles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>

      {/* Drawer */}
      <Animated.View style={[sidebarStyles.drawer, { backgroundColor: colors.card, borderRightColor: colors.border, transform: [{ translateX }] }]}>
        {/* Header */}
        <View style={[sidebarStyles.drawerHeader, { borderBottomColor: colors.border }]}>
          <Text style={[sidebarStyles.drawerTitle, { color: colors.foreground }]}>History</Text>
          <Pressable style={[sidebarStyles.newBtn, { backgroundColor: colors.primary }]} onPress={() => { onNew(); onClose(); }}>
            <Ionicons name="create-outline" size={15} color="#fff" />
            <Text style={sidebarStyles.newBtnText}>New</Text>
          </Pressable>
        </View>

        {/* Conversation list */}
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.id}
          contentContainerStyle={sidebarStyles.listContent}
          ListEmptyComponent={
            <Text style={[sidebarStyles.emptyText, { color: colors.mutedForeground }]}>No conversations yet</Text>
          }
          renderItem={({ item }) => {
            const isActive = item.id === currentId;
            return (
              <Pressable
                style={[sidebarStyles.convItem, isActive && { backgroundColor: colors.primary + "18", borderColor: colors.primary + "40", borderWidth: 1 }]}
                onPress={() => { onSelect(item); onClose(); }}
                onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); confirmDelete(item.id, item.title); }}
                delayLongPress={500}
              >
                <View style={sidebarStyles.convIcon}>
                  <Ionicons name="chatbubble-outline" size={14} color={isActive ? colors.primary : colors.mutedForeground} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[sidebarStyles.convTitle, { color: isActive ? colors.primary : colors.foreground }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={[sidebarStyles.convDate, { color: colors.mutedForeground }]}>
                    {formatRelativeDate(item.updatedAt)} · {item.messages.length} msg{item.messages.length !== 1 ? "s" : ""}
                  </Text>
                </View>
                <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); confirmDelete(item.id, item.title); }} hitSlop={8}>
                  <Ionicons name="trash-outline" size={15} color={colors.mutedForeground} />
                </Pressable>
              </Pressable>
            );
          }}
        />
      </Animated.View>
    </View>
  );
}

const sidebarStyles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 100, flexDirection: "row" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  drawer: {
    width: 280, height: "100%",
    borderRightWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000", shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 16,
  },
  drawerHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 60, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  drawerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  newBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  newBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  listContent: { paddingVertical: 8, paddingHorizontal: 10 },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 24 },
  convItem: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 10, paddingVertical: 11, borderRadius: 12, marginBottom: 2,
  },
  convIcon: { width: 26, alignItems: "center" },
  convTitle: { fontSize: 14, fontFamily: "Inter_500Medium" },
  convDate: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
});

// ─── Main chat screen ─────────────────────────────────────────────────────────

const CALL_MODE_RETRY_DELAY_MS = 400;

// ─── In-app timer types ───────────────────────────────────────────────────────

interface ActiveTimer {
  id: string;
  label: string;
  totalSeconds: number;
  remainingSeconds: number;
  done: boolean;
}

// ─── Notification helper ──────────────────────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    priority: Notifications.AndroidNotificationPriority.HIGH,
  }),
});

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { bubbleCmd, bubbleCmdTs } = useLocalSearchParams<{ bubbleCmd?: string; bubbleCmdTs?: string }>();
  const { assistantName, conversations, currentConversationId, setCurrentConversationId, createConversation, saveMessages, deleteConversation, phoneVoiceId, elVoiceId, kokoroVoiceId, speechRate, ttsProvider, customApiUrl, userProfile, assistantPersonality, wakeWordEnabled, readIncomingEnabled, notes, saveNote, todos, addTodo, completeTodo, contactFavorites, setContactFavorite, getContactFavorite, customQuickChips, speechLanguage, setSpeechLanguage } = useAssistant();

  const network = useNetworkStatus();
  const isOnline = network.isConnected && network.isInternetReachable;
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
  const [visionMode, setVisionMode] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [notifPermGranted, setNotifPermGranted] = useState(false);
  const [lastNotification, setLastNotification] = useState<VoxNotification | null>(null);
  const lastNotifRef = useRef<VoxNotification | null>(null);

  // Timers
  const [activeTimers, setActiveTimers] = useState<ActiveTimer[]>([]);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Battery monitoring
  const batteryAlertedLowRef = useRef(false);
  const batteryAlertedFullRef = useRef(false);

  // Call screening
  const [incomingCallNumber, setIncomingCallNumber] = useState<string | null>(null);
  // Command received from native overlay while app is backgrounded
  const [pendingOverlayCmd, setPendingOverlayCmd] = useState<string | null>(null);
  // Screen share / game assist
  const [screenShareActive, setScreenShareActive] = useState(false);
  const screenShareActiveRef = useRef(false);

  const inputRef = useRef<TextInput>(null);
  const activeConvId = useRef<string | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elSoundRef = useRef<Audio.Sound | null>(null);
  const isCallModeRef = useRef(false);
  const isStreamingRef = useRef(false);
  const isTranscribingRef = useRef(false);
  // TTS sentence queue — lets us start speaking the first sentence while the
  // LLM is still generating the rest of the response
  const ttsQueueRef = useRef<string[]>([]);
  const ttsPlayingRef = useRef(false);
  // Incremented every time stopSpeaking() is called — used to cancel stale in-flight TTS fetches
  const ttsGenerationRef = useRef(0);
  // Notification announcements queued while TTS is already playing (played after current speech ends)
  const pendingNotifSpeechRef = useRef<string[]>([]);
  // VAD polling interval (replaces fixed silence timer)
  const vadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Live audio amplitude (0–1) driven by VAD metering — feeds WaveformBars + SiriOrb
  const audioLevelAnim = useRef(new Animated.Value(0)).current;

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

  // ── Native overlay event listeners (Android only) ─────────────────────────
  // These fire even when the app is backgrounded because the JS thread keeps
  // running. The service handles wake-word detection and hands us the command.
  useEffect(() => {
    if (!NativeOverlay.isAvailable) return;

    const unsubWake = NativeOverlay.onWakeWord(() => {
      // Service already transitioned bubble to "wake" state — nothing extra needed
    });

    const unsubCmd = NativeOverlay.onCommand((text) => {
      if (text.trim()) {
        // Set the overlay to processing so the bubble pulses orange
        NativeOverlay.setState("processing").catch(() => {});
        setPendingOverlayCmd(text.trim());
      }
    });

    const unsubTap = NativeOverlay.onTap(() => {
      // User tapped the bubble — navigate to chat tab and start listening
      router.navigate("/(tabs)/");
    });

    return () => {
      unsubWake();
      unsubCmd();
      unsubTap();
    };
  }, []);

  // Process a command that arrived from the native overlay while backgrounded.
  // We capture `cmd` in a local variable before clearing the state so the
  // setTimeout closure always gets the non-null value.
  useEffect(() => {
    if (!pendingOverlayCmd) return;
    const cmd = pendingOverlayCmd;
    setPendingOverlayCmd(null);
    const timer = setTimeout(() => { handleSend(cmd); }, 50);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOverlayCmd]);

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

  // Show a persistent notification while wake word is active.
  // On Android this keeps the app process alive when minimized.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const WAKE_NOTIF_ID = "wake-word-active";
    if (wakeWordEnabled) {
      Notifications.setNotificationChannelAsync("wake_word", {
        name: "Wake Word Listener",
        importance: Notifications.AndroidImportance.LOW,
        sound: null,
      }).then(() => {
        Notifications.scheduleNotificationAsync({
          identifier: WAKE_NOTIF_ID,
          content: {
            title: `Listening for "${assistantName}"…`,
            body: `Say "Hey ${assistantName}" to start a conversation.`,
            sticky: true,
            autoDismiss: false,
            data: { type: "wake_word" },
          },
          trigger: null,
        }).catch(() => {});
      }).catch(() => {});
    } else {
      Notifications.dismissNotificationAsync(WAKE_NOTIF_ID).catch(() => {});
    }
    return () => {
      Notifications.dismissNotificationAsync(WAKE_NOTIF_ID).catch(() => {});
    };
  }, [wakeWordEnabled, assistantName]);

  function toNotificationFromAccessibility(n: VoxAccessibilityNotification): VoxNotification {
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

  function buildIncomingSpeechText(n: Pick<VoxNotification, "sender" | "text">): string {
    const sender = n.sender?.trim() || "Unknown sender";
    const msg = n.text?.trim();
    return msg
      ? `Boss, you have a new message from ${sender}: ${msg}`
      : `Boss, you have a new message from ${sender}`;
  }

  function handleIncomingNotification(n: VoxNotification) {
    setLastNotification(n);
    lastNotifRef.current = n;
    setNotifPermGranted(true);
    const spoken = buildIncomingSpeechText(n);
    if (isCallModeRef.current && !isStreamingRef.current) {
      // Call mode: interrupt immediately (stop → speak notification)
      stopSpeaking().then(() => {
        stopRecordingCleanup();
        setIsRecording(false);
        speakText(spoken);
      });
    } else if (readIncomingEnabledRef.current && !isStreamingRef.current) {
      if (ttsPlayingRef.current) {
        // Assistant is currently speaking — queue the notification so it plays right after
        pendingNotifSpeechRef.current.push(spoken);
      } else {
        speakText(spoken);
      }
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

  // ── Battery monitor ────────────────────────────────────────────────────────

  useEffect(() => {
    if (Platform.OS === "web") return;
    let unsubLevel: { remove(): void } | undefined;
    let unsubState: { remove(): void } | undefined;
    (async () => {
      try {
        const Battery = await import("expo-battery");
        unsubLevel = Battery.addBatteryLevelListener(async ({ batteryLevel }) => {
          const pct = Math.round(batteryLevel * 100);
          if (pct <= 20 && !batteryAlertedLowRef.current) {
            batteryAlertedLowRef.current = true;
            const msg = `Warning: your battery is at ${pct}%. Please charge your device soon.`;
            speakText(msg);
            await schedulePushNotification("Low battery", msg);
          }
          if (pct > 25) batteryAlertedLowRef.current = false;
        });
        unsubState = Battery.addBatteryStateListener(async ({ batteryState }) => {
          if (batteryState === Battery.BatteryState.FULL && !batteryAlertedFullRef.current) {
            batteryAlertedFullRef.current = true;
            const msg = "Your battery is fully charged. You can unplug your charger.";
            speakText(msg);
            await schedulePushNotification("Battery full", msg);
          }
          if (batteryState !== Battery.BatteryState.FULL) batteryAlertedFullRef.current = false;
        });
      } catch { /* battery API unavailable */ }
    })();
    return () => {
      unsubLevel?.remove?.();
      unsubState?.remove?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Call screening listener ────────────────────────────────────────────────

  useEffect(() => {
    if (!NativeCallScreening.isAvailable) return;
    let started = false;
    NativeCallScreening.startListening().then((ok) => { started = !!ok; }).catch(() => {});
    const unsub = NativeCallScreening.onCallState((event: CallStateEvent) => {
      if (event.state === "ringing") {
        const num = event.number || "unknown number";
        setIncomingCallNumber(num);
        // Stop ongoing recording; speak announcement then listen for answer/decline
        stopRecordingCleanup();
        setIsRecording(false);
        const announcement = `Incoming call from ${num}. Say answer to accept or decline to reject.`;
        speakText(announcement);
      } else {
        setIncomingCallNumber(null);
      }
    });
    return () => {
      unsub();
      if (started) NativeCallScreening.stopListening().catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── In-app timer tick ──────────────────────────────────────────────────────

  useEffect(() => {
    if (activeTimers.length === 0) {
      if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
      return;
    }
    if (timerIntervalRef.current) return; // already running
    timerIntervalRef.current = setInterval(() => {
      setActiveTimers((prev) => {
        const updated = prev.map((t) => {
          if (t.done) return t;
          const next = t.remainingSeconds - 1;
          if (next <= 0) {
            // Fire the timer
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Vibration.vibrate([0, 400, 200, 400]);
            speakText(`Timer done: ${t.label}`);
            return { ...t, remainingSeconds: 0, done: true };
          }
          return { ...t, remainingSeconds: next };
        });
        // Clean up done timers after a short delay (keep them for 8 s so user sees them)
        return updated;
      });
    }, 1000);
    return () => {
      if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTimers.length > 0]);

  // ── Push notification helper ───────────────────────────────────────────────

  async function schedulePushNotification(title: string, body: string, triggerMs?: number) {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== "granted") return;
      await Notifications.scheduleNotificationAsync({
        content: { title, body, sound: true },
        trigger: triggerMs ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.max(1, Math.round(triggerMs / 1000)) } : null,
      });
    } catch { /* ignore */ }
  }

  function getOrCreateConvId(): string {
    if (activeConvId.current) return activeConvId.current;
    if (currentConversationId) { activeConvId.current = currentConversationId; return currentConversationId; }
    const id = createConversation();
    activeConvId.current = id;
    setCurrentConversationId(id);
    return id;
  }

  // ── Floating bubble command handler ─────────────────────────────────────────
  const lastBubbleCmdTs = useRef<string | null>(null);
  useEffect(() => {
    if (!bubbleCmd || !bubbleCmdTs) return;
    if (bubbleCmdTs === lastBubbleCmdTs.current) return;
    lastBubbleCmdTs.current = bubbleCmdTs;
    // Small delay so the screen has focused
    setTimeout(() => {
      sendMessage(bubbleCmd);
    }, 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubbleCmd, bubbleCmdTs]);

  // ── Vision AI — capture a photo and describe it ──────────────────────────────
  async function captureAndDescribe(userQuestion?: string) {
    if (!cameraRef.current) {
      await respond("I need the camera to be active. Please open the camera first.");
      return;
    }
    try {
      setMessages((prev) => [
        ...prev,
        { id: generateMsgId(), role: "user", content: userQuestion ?? "What do you see?", timestamp: Date.now() },
      ]);
      setShowTyping(true);
      const photo = await cameraRef.current.takePictureAsync({ base64: false, quality: 0.6, skipProcessing: true });
      if (!photo?.uri) throw new Error("no photo uri");
      const base = await getApiBase();
      const fd = new FormData();
      fd.append("image", { uri: photo.uri, type: "image/jpeg", name: "photo.jpg" } as unknown as Blob);
      if (userQuestion) fd.append("prompt", userQuestion);
      const r = await globalThis.fetch(`${base}vision`, { method: "POST", body: fd });
      const { description = "I couldn't describe the image." } = await r.json() as { description?: string };
      setShowTyping(false);
      setMessages((prev) => [
        ...prev,
        { id: generateMsgId(), role: "assistant", content: description, timestamp: Date.now() },
      ]);
      await speakText(description);
    } catch {
      setShowTyping(false);
      await respond("I couldn't capture or describe the image. Make sure the camera is active.");
    }
  }

  async function getApiBase(): Promise<string> {
    if (customApiUrl && customApiUrl.trim()) {
      const u = customApiUrl.trim();
      return u.endsWith("/") ? u : `${u}/`;
    }
    const envUrl = process.env.EXPO_PUBLIC_API_URL;
    if (envUrl) return envUrl.endsWith("/") ? envUrl : `${envUrl}/`;
    if (Platform.OS === "web") return "/api/";
    return "https://secret-chat-provider--b-oss.replit.app/api/";
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
      // Listen for 1.5 seconds — faster wake word detection
      await new Promise<void>((resolve) => setTimeout(resolve, 1500));
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
      const resp = await globalThis.fetch(`${base}transcribe`, { method: "POST", body: fd });
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
    ttsGenerationRef.current++;          // invalidate any in-flight TTS fetches
    pendingNotifSpeechRef.current = [];  // also clear queued notification announcements
    ttsQueueRef.current = [];
    ttsPlayingRef.current = false;
    if (Platform.OS !== "web") Speech.stop().catch(() => {});
    if (elSoundRef.current) {
      await elSoundRef.current.stopAsync().catch(() => {});
      await elSoundRef.current.unloadAsync().catch(() => {});
      elSoundRef.current = null;
    }
    setIsSpeaking(false);
  }

  function onTtsDone() {
    // Drain the sentence queue — play next sentence if one is waiting
    const next = ttsQueueRef.current.shift();
    if (next) {
      playSentenceNow(next).catch(() => onTtsDone());
      return;
    }
    // Nothing left in sentence queue — check for queued notification announcements
    const pendingNotif = pendingNotifSpeechRef.current.shift();
    if (pendingNotif) {
      speakText(pendingNotif);
      return;
    }
    // Fully done
    ttsPlayingRef.current = false;
    setIsSpeaking(false);
    // Reset native overlay bubble back to idle state
    if (Platform.OS === "android") NativeOverlay.setState("idle").catch(() => {});
    if (pendingCallModeAfterTtsRef.current && !isStreamingRef.current) {
      pendingCallModeAfterTtsRef.current = false;
      startCallMode();
    } else if (isCallModeRef.current && !isStreamingRef.current) {
      setTimeout(() => { if (isCallModeRef.current) startRecording(); }, CALL_MODE_RETRY_DELAY_MS);
    }
  }

  // ── Sentence helpers ──────────────────────────────────────────────────────

  // Split a text buffer on sentence-ending punctuation followed by whitespace.
  // Returns completed sentences + whatever remains in the buffer.
  function extractSentences(buf: string): { sentences: string[]; remainder: string } {
    const sentences: string[] = [];
    let last = 0;
    for (let i = 0; i < buf.length - 1; i++) {
      if ('.!?'.includes(buf[i]) && (buf[i + 1] === ' ' || buf[i + 1] === '\n')) {
        const s = buf.slice(last, i + 1).trim();
        if (s) sentences.push(s);
        last = i + 2;
        i++; // skip the space
      }
    }
    return { sentences, remainder: buf.slice(last) };
  }

  // Build a streaming GET URL for the TTS endpoint.
  // expo-av passes this directly to Android's ExoPlayer which starts buffering
  // and playing immediately — no JS-side download or base64 conversion needed.
  async function buildTtsUrl(text: string): Promise<string> {
    const base = await getApiBase();
    const params = new URLSearchParams({
      text: text.slice(0, 800),
      provider: ttsProvider,
      voiceId: ttsProvider === "kokoro" ? kokoroVoiceId : elVoiceId,
    });
    return `${base}tts?${params.toString()}`;
  }

  // Attach playback listeners to a sound object and track it in elSoundRef.
  function attachSoundListeners(sound: Audio.Sound, gen: number) {
    elSoundRef.current = sound;
    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded) return;
      if ((status as any).error) {
        console.warn("[tts] playback error:", (status as any).error);
        sound.unloadAsync().catch(() => {});
        if (elSoundRef.current === sound) elSoundRef.current = null;
        onTtsDone();
        return;
      }
      if (status.didJustFinish) {
        sound.unloadAsync().catch(() => {});
        if (elSoundRef.current === sound) elSoundRef.current = null;
        onTtsDone();
      }
    });
  }

  // Play one sentence immediately via cloud or phone TTS, then call onTtsDone.
  // Used for queue draining — no Alert fallback dialog (would be jarring mid-response).
  async function playSentenceNow(text: string): Promise<void> {
    if (!text.trim()) { onTtsDone(); return; }
    const gen = ttsGenerationRef.current;
    if ((ttsProvider === "kokoro" || ttsProvider === "elevenlabs") && Platform.OS !== "web") {
      try {
        const uri = await buildTtsUrl(text);
        if (gen !== ttsGenerationRef.current) return;
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true, volume: 1.0 }
        );
        if (gen !== ttsGenerationRef.current) {
          sound.unloadAsync().catch(() => {});
          return;
        }
        attachSoundListeners(sound, gen);
        return;
      } catch { /* fall through to phone TTS */ }
      if (gen !== ttsGenerationRef.current) return;
      speakWithPhone(text);
      return;
    }
    try { await speakWithPhone(text); } catch { onTtsDone(); }
  }

  // Enqueue a sentence from the streaming loop. Starts playback immediately
  // if nothing is playing; queues otherwise.
  async function enqueueSentence(text: string) {
    if (!isTtsEnabled || !text.trim()) return;
    if (!ttsPlayingRef.current) {
      ttsPlayingRef.current = true; // set synchronously before any await
      setIsSpeaking(true);
      if (Platform.OS === "android") NativeOverlay.setState("speaking").catch(() => {});
      await playSentenceNow(text);
    } else {
      ttsQueueRef.current.push(text);
    }
  }

  async function speakWithPhone(text: string) {
    if (Platform.OS === "web") { onTtsDone(); return; }
    const opts: Speech.SpeechOptions = {
      language: speechLanguage || "en-US",
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
    const gen = ttsGenerationRef.current;
    ttsPlayingRef.current = true;
    setIsSpeaking(true);
    // Update native overlay bubble to "speaking" state while TTS plays
    if (Platform.OS === "android") NativeOverlay.setState("speaking").catch(() => {});

    // Cloud/self-hosted TTS — stream directly via GET URL so expo-av (ExoPlayer)
    // starts playback immediately without waiting for the full audio download.
    if ((ttsProvider === "kokoro" || ttsProvider === "elevenlabs") && Platform.OS !== "web") {
      try {
        const uri = await buildTtsUrl(text);
        if (gen !== ttsGenerationRef.current) return;
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true, volume: 1.0 }
        );
        if (gen !== ttsGenerationRef.current) {
          sound.unloadAsync().catch(() => {});
          return;
        }
        attachSoundListeners(sound, gen);
        return;
      } catch {
        // cloud TTS failed — ask user about phone TTS below
      }
      if (gen !== ttsGenerationRef.current) return;

      // Cloud TTS failed — ask the user if they want to fall back to phone TTS
      setIsSpeaking(false);
      if (Platform.OS === "android") NativeOverlay.setState("idle").catch(() => {});
      Alert.alert(
        "Voice Unavailable",
        "Cloud voice (Kokoro & ElevenLabs) couldn't be reached. Would you like to use your phone's built-in voice instead?",
        [
          {
            text: "No",
            style: "cancel",
            onPress: () => { if (isCallModeRef.current) onTtsDone(); },
          },
          {
            text: "Use Phone Voice",
            onPress: async () => {
              setIsSpeaking(true);
              if (Platform.OS === "android") NativeOverlay.setState("speaking").catch(() => {});
              try { await speakWithPhone(text); } catch { onTtsDone(); }
            },
          },
        ]
      );
      return;
    }

    // Phone TTS (user-selected provider)
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
    if (!isOnline) { showOfflineAlert("Voice transcription"); return; }
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

      // Enable metering so we can read audio levels for VAD
      const { recording } = await Audio.Recording.createAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Duration timer — display only (no auto-stop here)
      durationTimerRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);

      // ── VAD: auto-stop on silence ─────────────────────────────────────────
      // Poll audio level every 100ms. Once the user has spoken and then gone
      // silent for 700ms we stop — same feel as ChatGPT Voice. Hard cutoff at
      // 30 s so the recording doesn't run forever if VAD misses something.
      let vadHasVoice = false;
      let vadSilenceStart = 0;
      const VAD_SILENCE_THRESHOLD_DB = -35; // below this = silence
      const VAD_SILENCE_MS = 700;           // silence duration before cut-off
      const VAD_MAX_MS = 30_000;            // hard limit
      const vadStartedAt = Date.now();

      vadTimerRef.current = setInterval(async () => {
        const rec = recordingRef.current;
        if (!rec) { clearInterval(vadTimerRef.current!); vadTimerRef.current = null; return; }
        // Hard cutoff
        if (Date.now() - vadStartedAt >= VAD_MAX_MS) {
          clearInterval(vadTimerRef.current!); vadTimerRef.current = null;
          stopRecording();
          return;
        }
        try {
          const status = await rec.getStatusAsync();
          if (!status.isRecording) return;
          const db = (status as { metering?: number }).metering ?? -160;
          // Drive live waveform: map -60 dB → 0, 0 dB → 1
          audioLevelAnim.setValue(Math.max(0, Math.min(1, (db + 60) / 60)));
          if (db > VAD_SILENCE_THRESHOLD_DB) {
            // Heard voice
            vadHasVoice = true;
            vadSilenceStart = 0;
          } else if (vadHasVoice) {
            // Silence after speech
            if (vadSilenceStart === 0) vadSilenceStart = Date.now();
            else if (Date.now() - vadSilenceStart >= VAD_SILENCE_MS) {
              clearInterval(vadTimerRef.current!); vadTimerRef.current = null;
              stopRecording();
            }
          }
        } catch { /* ignore status errors */ }
      }, 100);
    } catch {
      setIsRecording(false);
    }
  }

  function stopRecordingCleanup() {
    if (durationTimerRef.current) { clearInterval(durationTimerRef.current); durationTimerRef.current = null; }
    if (vadTimerRef.current) { clearInterval(vadTimerRef.current); vadTimerRef.current = null; }
    audioLevelAnim.setValue(0);
    if (recordingRef.current) {
      recordingRef.current.stopAndUnloadAsync().catch(() => {});
      recordingRef.current = null;
    }
  }

  async function stopRecording() {
    if (!recordingRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (durationTimerRef.current) { clearInterval(durationTimerRef.current); durationTimerRef.current = null; }
    if (vadTimerRef.current) { clearInterval(vadTimerRef.current); vadTimerRef.current = null; }

    const rec = recordingRef.current;
    recordingRef.current = null;
    setIsRecording(false);
    setRecordingDuration(0);
    audioLevelAnim.setValue(0);

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

      const response = await globalThis.fetch(`${base}transcribe`, {
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
      | "setup_notifications"
      | "set_timer" | "cancel_timer"
      | "set_alarm" | "set_reminder"
      | "weather_check"
      | "voice_note" | "list_notes"
      | "media_play" | "media_pause" | "media_next" | "media_previous" | "media_stop"
      | "call_answer" | "call_decline"
      | "email_send"
      | "share_location"
      | "nearby_search"
      | "eta_navigate"
      | "daily_briefing"
      | "news_briefing"
      | "language_switch"
      | "photo_capture"
      | "todo_add" | "todo_list" | "todo_complete"
      | "contact_favorite_set" | "contact_favorite_call";
    value?: number;
    phone?: string;
    name?: string;
    message?: string;
    app?: string;
    // For timer/alarm/reminder
    durationSeconds?: number;
    targetTime?: Date;
    label?: string;
    // For email
    emailSubject?: string;
    emailBody?: string;
    // For nearby search
    searchQuery?: string;
    // For language switch
    language?: string;
    // For contact favorite
    alias?: string;
    // For vision AI — the full user question to pass as prompt
    extra?: string;
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

    // ── Timer ──────────────────────────────────────────────────────────────────
    // "set a 10 minute timer", "5 minute timer", "timer for 30 seconds", "1 hour timer"
    const timerMatch = t.match(/\b(?:set\s+(?:a\s+)?)?(\d+(?:\.\d+)?)\s*(second|sec|minute|min|hour|hr)s?\s+timer\b|\btimer\s+for\s+(\d+(?:\.\d+)?)\s*(second|sec|minute|min|hour|hr)s?\b/i);
    if (timerMatch) {
      const num = parseFloat(timerMatch[1] ?? timerMatch[3]);
      const unit = (timerMatch[2] ?? timerMatch[4] ?? "minute").toLowerCase();
      const secs = unit.startsWith("h") ? num * 3600 : unit.startsWith("s") ? num : num * 60;
      const lbl = `${num} ${unit}${num !== 1 ? "s" : ""}`;
      return { type: "set_timer", durationSeconds: Math.round(secs), label: lbl };
    }
    if (/\bcancel\s+timer\b/.test(t)) return { type: "cancel_timer" };

    // ── Alarm ──────────────────────────────────────────────────────────────────
    // "set an alarm for 7am", "wake me up at 6:30", "alarm at 14:00"
    const alarmMatch = t.match(/\b(?:set\s+(?:a(?:n)?\s+)?alarm|wake\s+(?:me\s+)?up)\s+(?:at\s+|for\s+)?(\d{1,2}(?::\d{2})?)\s*(am|pm)?\b/i);
    if (alarmMatch && !/remind/.test(t)) {
      let hour = parseInt(alarmMatch[1]);
      const minutes = alarmMatch[1].includes(":") ? parseInt(alarmMatch[1].split(":")[1]) : 0;
      const meridiem = (alarmMatch[2] ?? "").toLowerCase();
      if (meridiem === "pm" && hour < 12) hour += 12;
      if (meridiem === "am" && hour === 12) hour = 0;
      const target = new Date();
      target.setHours(hour, minutes, 0, 0);
      if (target.getTime() <= Date.now()) target.setDate(target.getDate() + 1);
      return { type: "set_alarm", targetTime: target, label: alarmMatch[0].trim() };
    }

    // ── Reminder ───────────────────────────────────────────────────────────────
    // "remind me at 3pm to call mom", "remind me in 30 minutes to take pills"
    const remindAtMatch = t.match(/\bremind\s+me\s+at\s+(\d{1,2}(?::\d{2})?)\s*(am|pm)?\s+to\s+(.+)/i);
    if (remindAtMatch) {
      let hour = parseInt(remindAtMatch[1]);
      const minutes = remindAtMatch[1].includes(":") ? parseInt(remindAtMatch[1].split(":")[1]) : 0;
      const meridiem = (remindAtMatch[2] ?? "").toLowerCase();
      if (meridiem === "pm" && hour < 12) hour += 12;
      if (meridiem === "am" && hour === 12) hour = 0;
      const target = new Date();
      target.setHours(hour, minutes, 0, 0);
      if (target.getTime() <= Date.now()) target.setDate(target.getDate() + 1);
      return { type: "set_reminder", targetTime: target, label: remindAtMatch[3].trim() };
    }
    const remindInMatch = t.match(/\bremind\s+me\s+in\s+(\d+)\s*(second|sec|minute|min|hour|hr)s?\s+to\s+(.+)/i);
    if (remindInMatch) {
      const num = parseInt(remindInMatch[1]);
      const unit = remindInMatch[2].toLowerCase();
      const ms = unit.startsWith("h") ? num * 3600000 : unit.startsWith("s") ? num * 1000 : num * 60000;
      const target = new Date(Date.now() + ms);
      return { type: "set_reminder", targetTime: target, label: remindInMatch[3].trim() };
    }

    // ── Weather ────────────────────────────────────────────────────────────────
    if (/\b(weather|temperature|forecast|how (hot|cold|warm)|what('?s| is) it like outside)\b/.test(t)) {
      return { type: "weather_check" };
    }

    // ── Voice note ─────────────────────────────────────────────────────────────
    const noteMatch = t.match(/\b(?:save\s+(?:this\s+)?note|note\s+(?:that|this)|remember(?:\s+that)?|add\s+(?:a\s+)?note)\s*[:\-–]?\s*(.+)/i);
    if (noteMatch && noteMatch[1]) {
      return { type: "voice_note", message: noteMatch[1].trim() };
    }
    if (/\b(what('?s| are) my notes|list (my )?notes|show (my )?notes|read (my )?notes)\b/.test(t)) {
      return { type: "list_notes" };
    }

    // ── Media controls ─────────────────────────────────────────────────────────
    if (/\b(next\s*(track|song)|skip\s*(track|song|ahead)?)\b/.test(t)) return { type: "media_next" };
    if (/\b(previous\s*(track|song)|go\s+back\s*(track|song)?|last\s+song)\b/.test(t)) return { type: "media_previous" };
    if (/\b(pause\s*(music|song|track|playback|spotify|youtube)?|stop\s*(music|song|track|playing))\b/.test(t) && !/\bstop\s+timer\b/.test(t)) return { type: "media_pause" };
    if (/\b(play\s*(music|song|track|spotify|youtube|something)?|resume\s*(music|playback)?|unpause)\b/.test(t)) return { type: "media_play" };

    // ── Call answer / decline ──────────────────────────────────────────────────
    if (/\b(answer\s*(the\s*)?(call|phone)|pick\s+up)\b/.test(t)) return { type: "call_answer" };
    if (/\b(decline\s*(the\s*)?(call|phone)?|reject\s*(the\s*)?call|hang\s*up|ignore\s*(the\s*)?call)\b/.test(t)) return { type: "call_decline" };

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

    // ── Email by voice ──────────────────────────────────────────────────────────
    // "send an email to John subject meeting body I'll be late"
    // "email John about meeting saying I'll be late"
    if (/\b(email|send an email|send email)\b/.test(t)) {
      const nameM = t.match(new RegExp(`\\b(?:email|send\\s+(?:an?\\s+)?email)\\s+(?:to\\s+)?(${NAME_PAT})`, "i"));
      const subjectM = t.match(/\b(?:about|subject|re:?)\s+([^,]+)/i);
      const bodyM = t.match(/\b(?:saying|body|message)\s+(.+)/i);
      return {
        type: "email_send",
        name: nameM?.[1]?.trim(),
        emailSubject: subjectM?.[1]?.trim(),
        emailBody: bodyM?.[1]?.trim(),
      };
    }

    // ── Share location ──────────────────────────────────────────────────────────
    // "send my location to Mom" / "share my location with John"
    if (/\b(send|share)\s+(my\s+)?location\b/.test(t)) {
      const nameM = t.match(new RegExp(`\\b(?:to|with)\\s+(${NAME_PAT})`, "i"));
      const appM = t.match(/\b(whatsapp|telegram|sms|text)\b/i);
      return { type: "share_location", name: nameM?.[1]?.trim(), app: appM?.[1] };
    }

    // ── Nearby search ───────────────────────────────────────────────────────────
    // "find a coffee shop near me" / "what's near me" / "restaurants nearby"
    if (/\b(find|search|look for|where('?s| is)|what('?s| is) near)\b.*(near(by| me)|around here|close by)\b/.test(t) ||
        /\b(near(by| me)|around here)\b/.test(t) && /\b(find|show|get)\b/.test(t)) {
      const queryM = t.match(/\b(?:find|search\s+for|look\s+for)\s+(?:a\s+|an?\s+|some\s+)?(.+?)\s+(?:near|around|close)/i);
      return { type: "nearby_search", searchQuery: queryM?.[1]?.trim() ?? "place" };
    }

    // ── ETA / navigate ─────────────────────────────────────────────────────────
    // "how long to get home" / "navigate to Walmart" / "directions to the airport"
    if (/\b(navigate|directions?|how long to|take me to|get me to|drive to)\b/.test(t)) {
      const destM = t.match(/\b(?:navigate\s+to|directions?\s+to|how\s+long\s+to\s+(?:get\s+to)?|take\s+me\s+to|get\s+me\s+to|drive\s+to)\s+(.+)/i);
      return { type: "eta_navigate", label: destM?.[1]?.trim() ?? "home" };
    }

    // ── Daily briefing ──────────────────────────────────────────────────────────
    // "good morning" / "morning briefing" / "start my day"
    if (/\b(good morning|morning briefing|start my day|daily briefing|what('?s| is) on today|today('?s| is) summary)\b/.test(t)) {
      return { type: "daily_briefing" };
    }

    // ── News briefing ───────────────────────────────────────────────────────────
    // "read me the news" / "what's in the news" / "top headlines"
    if (/\b(read(ing)? (the |me the |me )?news|what('?s| is) (in |happening in )?the news|top (headlines?|stories|news)|latest news|news briefing)\b/.test(t)) {
      return { type: "news_briefing" };
    }

    // ── Language switch ─────────────────────────────────────────────────────────
    // "switch to Spanish" / "speak in French" / "change language to German"
    const langMatch = t.match(/\b(?:switch\s+to|speak\s+in|change\s+(?:language\s+)?to|use)\s+(spanish|french|german|portuguese|arabic|hindi|italian|dutch|japanese|korean|chinese|russian|turkish|polish|swedish|norwegian|danish|finnish|greek|hebrew|thai|vietnamese|malay|indonesian|english)\b/i);
    if (langMatch) {
      return { type: "language_switch", language: langMatch[1].toLowerCase() };
    }

    // ── Vision AI / Photo capture ────────────────────────────────────────────────
    // "what do you see?" / "describe what's in front of you" / "take a picture and tell me"
    const visionMatch = t.match(
      /\b(?:what(?:'s|\s+is|\s+can\s+you)?\s+(?:do\s+you\s+see|you\s+see|around|in\s+front)|describe\s+(?:what(?:'s|\s+around|(?:\s+in)?\s+front)|(?:the\s+)?(?:image|photo|picture|scene|room|surroundings?))|look\s+(?:at|around)|what\s+am\s+i\s+(?:looking\s+at|holding|pointing\s+at)|read\s+(?:this|what(?:'s|\s+in\s+front)|the\s+(?:text|sign|label|screen|page|book))|scan\s+(?:this|the\s+(?:barcode|qr|code|label)))\b/i
    );
    if (visionMatch) {
      return { type: "photo_capture", extra: t };
    }
    // "take a photo" / "take a picture" / "capture a photo"
    if (/\b(take\s+(?:a\s+)?(?:photo|picture|selfie|screenshot?|snap)|capture\s+(?:a\s+)?(?:photo|image|picture))\b/.test(t)) {
      if (/\bscreenshot?\b/.test(t)) return { type: "open_app", app: "Screenshot" };
      return { type: "photo_capture" };
    }

    // ── To-do list ──────────────────────────────────────────────────────────────
    // "add 'call dentist' to my to-do list" / "add task buy groceries"
    const todoAddMatch = t.match(/\b(?:add\s+(?:(?:a\s+)?task|to(?:\-|\s)?do|(?:to\s+)?my\s+(?:task|to(?:\-|\s)?do)\s+list)[:\s]+|add\s+['""]?(.+?)['""]?\s+to\s+(?:my\s+)?(?:task|to(?:\-|\s)?do)\s+list|(?:to(?:\-|\s)?do|task)[:\s]+)(.+)/i);
    if (todoAddMatch) {
      const taskText = (todoAddMatch[1] ?? todoAddMatch[2] ?? "").trim();
      if (taskText) return { type: "todo_add", message: taskText };
    }
    // Simpler pattern: "add to my list: buy milk"
    if (/\badd\s+(?:to\s+(?:my\s+)?(?:list|tasks?|to.?dos?)|(?:to.?do|task)[:\s])/.test(t)) {
      const taskM = t.match(/\b(?:add\s+to\s+(?:my\s+)?(?:list|tasks?|to.?dos?)|add\s+(?:to.?do|task)[:\s])\s*[:\-–]?\s*(.+)/i);
      if (taskM?.[1]) return { type: "todo_add", message: taskM[1].trim() };
    }
    if (/\b(what('?s| is|are)(\s+on)?\s+(my\s+)?(to.?do|task)\s*(list)?|list\s+(my\s+)?(to.?do|tasks?)|show\s+(my\s+)?tasks?|read\s+(my\s+)?(to.?do|tasks?))\b/.test(t)) {
      return { type: "todo_list" };
    }
    const todoCompleteMatch = t.match(/\b(?:mark|complete|finish|done|check\s+off)\s+(?:task\s+)?(\d+|.+?)\s+(?:as\s+)?(?:done|complete|finished)\b/i);
    if (todoCompleteMatch) return { type: "todo_complete", label: todoCompleteMatch[1].trim() };

    // ── Contact favorites ───────────────────────────────────────────────────────
    // "my wife is Sarah" / "set my wife as Sarah" / "call my wife"
    const ALIASES = "wife|husband|mom|dad|mother|father|brother|sister|girlfriend|boyfriend|best friend|boss|partner|son|daughter";
    const favSetMatch = t.match(new RegExp(`\\b(?:(?:set\\s+)?my\\s+(${ALIASES})\\s+(?:is|as|to)\\s+(${NAME_PAT}))`, "i"));
    if (favSetMatch) {
      return { type: "contact_favorite_set", alias: favSetMatch[1].trim(), name: favSetMatch[2].trim() };
    }
    const favCallMatch = t.match(new RegExp(`\\b(?:call|dial|phone|ring)\\s+my\\s+(${ALIASES})\\b`, "i"));
    if (favCallMatch) {
      return { type: "contact_favorite_call", alias: favCallMatch[1].trim() };
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
          const recent = await NativeNotifications.getRecent().catch((): VoxNotification[] => []);
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
          const recent = await NativeNotifications.getRecent().catch((): VoxNotification[] => []);
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
            const recent = await NativeNotifications.getRecent().catch((): VoxNotification[] => []);
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

      // ── Timer ──────────────────────────────────────────────────────────────

      case "set_timer": {
        const secs = intent.durationSeconds ?? 60;
        const lbl = intent.label ?? `${secs}s`;
        const timerId = `timer-${Date.now()}`;
        setActiveTimers((prev) => [
          { id: timerId, label: lbl, totalSeconds: secs, remainingSeconds: secs, done: false },
          ...prev,
        ]);
        await respond(`Timer set for ${lbl}. I'll let you know when it's done.`);
        break;
      }

      case "cancel_timer": {
        setActiveTimers((prev) => {
          const active = prev.filter((t) => !t.done);
          if (active.length === 0) return prev;
          // Cancel the most-recently added active timer
          const toCancel = active[0];
          return prev.filter((t) => t.id !== toCancel.id);
        });
        await respond("Timer cancelled.");
        break;
      }

      // ── Alarm ──────────────────────────────────────────────────────────────

      case "set_alarm": {
        const target = intent.targetTime;
        if (!target) { await respond("I couldn't understand the alarm time. Try: 'Set an alarm for 7am'."); break; }
        const msFromNow = target.getTime() - Date.now();
        const timeStr = target.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        try {
          await schedulePushNotification("⏰ Alarm", `Wake up! Your alarm for ${timeStr} is going off.`, msFromNow);
          await respond(`Alarm set for ${timeStr}.`);
        } catch {
          await respond(`I couldn't schedule the alarm. Please check notification permissions.`);
        }
        break;
      }

      // ── Reminder ───────────────────────────────────────────────────────────

      case "set_reminder": {
        const target = intent.targetTime;
        const lbl = intent.label ?? "your reminder";
        if (!target) { await respond("I couldn't understand the reminder time. Try: 'Remind me in 30 minutes to take pills'."); break; }
        const msFromNow = target.getTime() - Date.now();
        const timeStr = target.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        try {
          await schedulePushNotification("🔔 Reminder", lbl, msFromNow);
          await respond(`Reminder set for ${timeStr}: ${lbl}.`);
        } catch {
          await respond("I couldn't schedule the reminder. Please check notification permissions.");
        }
        break;
      }

      // ── Weather ────────────────────────────────────────────────────────────

      case "weather_check": {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== "granted") {
            await respond("I need location permission to get the weather. Please grant it in Settings, then try again.");
            break;
          }
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const { latitude, longitude } = loc.coords;
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&hourly=relativehumidity_2m&timezone=auto`;
          const resp = await globalThis.fetch(url);
          if (!resp.ok) throw new Error("Weather API error");
          const data = await resp.json() as {
            current_weather?: { temperature: number; windspeed: number; weathercode: number };
          };
          const cw = data.current_weather;
          if (!cw) throw new Error("No weather data");
          const tempC = Math.round(cw.temperature);
          const tempF = Math.round(tempC * 9 / 5 + 32);
          const wind = Math.round(cw.windspeed);
          const wcode = cw.weathercode;
          // Simple WMO weather code mapping
          const weatherDesc =
            wcode === 0 ? "clear sky" :
            wcode <= 3 ? "partly cloudy" :
            wcode <= 49 ? "foggy" :
            wcode <= 69 ? "rainy" :
            wcode <= 79 ? "snowy" :
            wcode <= 99 ? "thunderstorm" : "mixed conditions";
          await respond(`Currently ${tempC}°C (${tempF}°F) with ${weatherDesc} and wind at ${wind} km/h.`);
        } catch {
          await respond("I couldn't fetch the weather right now. Please check your internet connection.");
        }
        break;
      }

      // ── Voice note ─────────────────────────────────────────────────────────

      case "voice_note": {
        const noteText = intent.message ?? "";
        if (!noteText) { await respond("What would you like to note down?"); break; }
        await saveNote(noteText);
        await respond(`Got it, I saved your note: "${noteText}".`);
        break;
      }

      case "list_notes": {
        if (notes.length === 0) {
          await respond("You don't have any saved notes yet. Say 'Save this note' to add one.");
          break;
        }
        const recent = notes.slice(0, 5);
        const summary = recent.map((n, i) => `${i + 1}. ${n.text}`).join(". ");
        await respond(`Your ${notes.length === 1 ? "note" : `${notes.length} notes`}: ${summary}.`);
        break;
      }

      // ── Media controls ─────────────────────────────────────────────────────

      case "media_play": {
        if (!NativeMediaControl.isAvailable) { await respond("Media controls are only available on Android."); break; }
        await NativeMediaControl.play().catch(() => {});
        await respond("Playing.");
        break;
      }

      case "media_pause": {
        if (!NativeMediaControl.isAvailable) { await respond("Media controls are only available on Android."); break; }
        await NativeMediaControl.pause().catch(() => {});
        await respond("Paused.");
        break;
      }

      case "media_next": {
        if (!NativeMediaControl.isAvailable) { await respond("Media controls are only available on Android."); break; }
        await NativeMediaControl.next().catch(() => {});
        await respond("Skipping to next track.");
        break;
      }

      case "media_previous": {
        if (!NativeMediaControl.isAvailable) { await respond("Media controls are only available on Android."); break; }
        await NativeMediaControl.previous().catch(() => {});
        await respond("Going back to previous track.");
        break;
      }

      case "media_stop": {
        if (!NativeMediaControl.isAvailable) { await respond("Media controls are only available on Android."); break; }
        await NativeMediaControl.stop().catch(() => {});
        await respond("Music stopped.");
        break;
      }

      // ── Call answer / decline ──────────────────────────────────────────────

      case "call_answer": {
        if (!NativeCallScreening.isAvailable) { await respond("Call answering is only available on Android."); break; }
        const answered = await NativeCallScreening.answerCall().catch(() => false);
        await respond(answered ? "Answering the call." : "I couldn't answer the call — please grant ANSWER_PHONE_CALLS permission.");
        break;
      }

      case "call_decline": {
        if (!NativeCallScreening.isAvailable) { await respond("Call declining is only available on Android."); break; }
        const declined = await NativeCallScreening.declineCall().catch(() => false);
        await respond(declined ? "Call declined." : "I couldn't decline the call.");
        break;
      }

      // ── Email by voice ─────────────────────────────────────────────────────

      case "email_send": {
        try {
          let email = "";
          if (intent.name) {
            const { status } = await Contacts.requestPermissionsAsync();
            if (status === "granted") {
              const { data } = await Contacts.getContactsAsync({
                fields: [Contacts.Fields.Emails, Contacts.Fields.Name],
                name: intent.name,
              });
              const emailAddr = data[0]?.emails?.[0]?.email;
              if (emailAddr) email = emailAddr;
            }
          }
          const subject = intent.emailSubject ? encodeURIComponent(intent.emailSubject) : "";
          const body = intent.emailBody ? encodeURIComponent(intent.emailBody) : "";
          const to = email ? encodeURIComponent(email) : "";
          const url = `mailto:${to}?subject=${subject}&body=${body}`;
          await Linking.openURL(url);
          const target = intent.name ? ` to ${intent.name}` : "";
          await respond(`Opening email app${target} with your message pre-filled — tap Send to deliver it.`);
        } catch {
          await respond("I couldn't open the email app. Please check your email client is installed.");
        }
        break;
      }

      // ── Share location ──────────────────────────────────────────────────────

      case "share_location": {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== "granted") {
            await respond("I need location permission to share your location. Please grant it in Settings.");
            break;
          }
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const { latitude, longitude } = loc.coords;
          const mapsUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
          const shareMsg = `My current location: ${mapsUrl}`;
          const targetName = intent.name;
          const appTarget = intent.app?.toLowerCase();
          if (targetName || appTarget) {
            let phone: string | undefined;
            if (targetName) phone = await lookupContactPhone(targetName);
            const encoded = encodeURIComponent(shareMsg);
            let deepUrl = "";
            if (appTarget === "whatsapp" || (!appTarget && phone)) {
              deepUrl = phone ? `whatsapp://send?phone=${phone}&text=${encoded}` : `whatsapp://send?text=${encoded}`;
            } else if (appTarget === "telegram") {
              deepUrl = phone ? `tg://msg?to=${phone}&text=${encoded}` : `tg://msg?text=${encoded}`;
            } else if (appTarget === "sms" || appTarget === "text") {
              const sep = Platform.OS === "ios" ? "&" : "?";
              deepUrl = phone ? `sms:${phone}${sep}body=${encoded}` : `sms:${sep}body=${encoded}`;
            } else {
              deepUrl = phone ? `whatsapp://send?phone=${phone}&text=${encoded}` : `whatsapp://send?text=${encoded}`;
            }
            await Linking.openURL(deepUrl).catch(() => {});
            await respond(targetName ? `Opening to send your location to ${targetName}.` : "Opening app to send your location.");
          } else {
            await Share.share({ message: shareMsg });
            await respond("Sharing your location.");
          }
        } catch {
          await respond("I couldn't get your location right now. Please check location permissions.");
        }
        break;
      }

      // ── Nearby search ───────────────────────────────────────────────────────

      case "nearby_search": {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== "granted") {
            await respond("I need location permission to search nearby places. Please grant it in Settings.");
            break;
          }
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const { latitude, longitude } = loc.coords;
          const query = intent.searchQuery ?? "place";
          const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&lat=${latitude}&lon=${longitude}&limit=3&addressdetails=1`;
          const resp = await globalThis.fetch(url, { headers: { "Accept-Language": "en" } });
          if (!resp.ok) throw new Error("Nominatim error");
          const places = await resp.json() as Array<{ display_name: string; addresstype?: string }>;
          if (!places || places.length === 0) {
            await respond(`I couldn't find any ${query} nearby. Try a different search.`);
            break;
          }
          const names = places.slice(0, 3).map((p, i) => {
            const parts = p.display_name.split(",");
            return `${i + 1}. ${parts[0].trim()}${parts[1] ? `, ${parts[1].trim()}` : ""}`;
          });
          await respond(`I found ${names.length} ${query} nearby: ${names.join(". ")}.`);
        } catch {
          await respond("I couldn't search for nearby places right now. Please check your internet connection.");
        }
        break;
      }

      // ── ETA / navigate ──────────────────────────────────────────────────────

      case "eta_navigate": {
        const destination = intent.label ?? "home";
        const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
        try {
          const nativeUrl = `geo:0,0?q=${encodeURIComponent(destination)}`;
          const canNative = await Linking.canOpenURL(nativeUrl).catch(() => false);
          await Linking.openURL(canNative ? nativeUrl : mapsUrl).catch(() => {});
          await respond(`Opening navigation to ${destination}.`);
        } catch {
          await respond(`I couldn't open maps for navigation to ${destination}.`);
        }
        break;
      }

      // ── Daily briefing ──────────────────────────────────────────────────────

      case "daily_briefing": {
        const parts: string[] = [];
        const hour = new Date().getHours();
        const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
        parts.push(greeting + (userProfile.userName ? `, ${userProfile.userName}` : "") + ".");
        try {
          const Battery2 = await import("expo-battery");
          const level = await Battery2.getBatteryLevelAsync();
          const pct = Math.round(level * 100);
          const state = await Battery2.getBatteryStateAsync();
          const charging = state === Battery2.BatteryState.CHARGING ? " and charging" : "";
          parts.push(`Battery is at ${pct}%${charging}.`);
        } catch { /* ignore */ }
        try {
          const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
          if (locStatus === "granted") {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const { latitude, longitude } = loc.coords;
            const wUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&timezone=auto`;
            const wResp = await globalThis.fetch(wUrl);
            if (wResp.ok) {
              const wData = await wResp.json() as { current_weather?: { temperature: number; weathercode: number } };
              const cw = wData.current_weather;
              if (cw) {
                const tempC = Math.round(cw.temperature);
                const tempF = Math.round(tempC * 9 / 5 + 32);
                const wcode = cw.weathercode;
                const desc = wcode === 0 ? "clear skies" : wcode <= 3 ? "partly cloudy" : wcode <= 49 ? "foggy" : wcode <= 69 ? "rainy" : wcode <= 79 ? "snowy" : "stormy";
                parts.push(`Outside it is ${tempC}°C (${tempF}°F) with ${desc}.`);
              }
            }
          }
        } catch { /* ignore */ }
        if (notes.length > 0) {
          parts.push(`You have ${notes.length} saved note${notes.length > 1 ? "s" : ""}.`);
        }
        const activeTodos = todos.filter((t) => !t.done);
        if (activeTodos.length > 0) {
          parts.push(`You have ${activeTodos.length} pending task${activeTodos.length > 1 ? "s" : ""} on your to-do list.`);
        }
        parts.push("Have a great day!");
        await respond(parts.join(" "));
        break;
      }

      // ── News briefing ───────────────────────────────────────────────────────

      case "news_briefing": {
        try {
          const base = await getApiBase();
          const resp = await fetch(`${base}search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: "top news headlines today", assistantName }),
          });
          const data = await resp.json() as { result?: string; error?: string };
          const reply = data.result ?? data.error ?? "I couldn't fetch the news right now.";
          const newsMsg: Message = { id: generateMsgId(), role: "assistant", content: reply, timestamp: Date.now(), isSearch: true };
          const finalMsgs = [...withUser, newsMsg];
          setMessages(finalMsgs);
          await saveMessages(convId, finalMsgs);
          speakText(reply);
          return;
        } catch {
          await respond("I couldn't fetch the news right now. Please check your internet connection.");
        }
        break;
      }

      // ── Language switch ─────────────────────────────────────────────────────

      case "language_switch": {
        const langMap: Record<string, string> = {
          spanish: "es-ES", french: "fr-FR", german: "de-DE", portuguese: "pt-BR",
          arabic: "ar-SA", hindi: "hi-IN", italian: "it-IT", dutch: "nl-NL",
          japanese: "ja-JP", korean: "ko-KR", chinese: "zh-CN", russian: "ru-RU",
          turkish: "tr-TR", polish: "pl-PL", swedish: "sv-SE", norwegian: "nb-NO",
          danish: "da-DK", finnish: "fi-FI", greek: "el-GR", hebrew: "he-IL",
          thai: "th-TH", vietnamese: "vi-VN", malay: "ms-MY", indonesian: "id-ID",
          english: "en-US",
        };
        const requested = (intent.language ?? "english").toLowerCase();
        const langCode = langMap[requested] ?? "en-US";
        await setSpeechLanguage(langCode);
        const langName = requested.charAt(0).toUpperCase() + requested.slice(1);
        await respond(`Switched to ${langName}. I'll speak in ${langName} from now on.`);
        break;
      }

      // ── Photo capture ───────────────────────────────────────────────────────

      case "photo_capture": {
        const question = intent.extra ?? undefined;
        if (!cameraPermission?.granted) {
          const { granted } = await requestCameraPermission();
          if (!granted) {
            await respond("I need camera permission to see what's around you. Please grant it in Settings.");
            break;
          }
        }
        setCameraReady(true);
        setVisionMode(true);
        // Small delay so camera warms up before capture
        await new Promise<void>((r) => setTimeout(r, 800));
        await captureAndDescribe(question);
        setVisionMode(false);
        break;
      }

      // ── To-do list ──────────────────────────────────────────────────────────

      case "todo_add": {
        const taskText = intent.message ?? "";
        if (!taskText) { await respond("What would you like to add to your to-do list?"); break; }
        await addTodo(taskText);
        await respond(`Added to your to-do list: "${taskText}".`);
        break;
      }

      case "todo_list": {
        const activeTodos = todos.filter((t) => !t.done);
        if (activeTodos.length === 0) {
          await respond("Your to-do list is empty. Say 'add task' followed by what you need to do.");
          break;
        }
        const items = activeTodos.slice(0, 6).map((t, i) => `${i + 1}. ${t.text}`).join(". ");
        await respond(`You have ${activeTodos.length} task${activeTodos.length > 1 ? "s" : ""}: ${items}.`);
        break;
      }

      case "todo_complete": {
        const label = intent.label ?? "";
        const activeTodos = todos.filter((t) => !t.done);
        let matched = activeTodos.find((t) => t.text.toLowerCase().includes(label.toLowerCase()));
        if (!matched && /^\d+$/.test(label)) {
          const idx = parseInt(label) - 1;
          matched = activeTodos[idx];
        }
        if (!matched) {
          await respond(label ? `I couldn't find a task matching "${label}" on your list.` : "Which task would you like to mark as done? Say the task number or name.");
          break;
        }
        await completeTodo(matched.id);
        await respond(`Marked "${matched.text}" as done. Great work!`);
        break;
      }

      // ── Contact favorites ───────────────────────────────────────────────────

      case "contact_favorite_set": {
        const alias = intent.alias ?? "";
        const name = intent.name ?? "";
        if (!alias || !name) { await respond("Please say for example: 'My wife is Sarah'."); break; }
        await setContactFavorite(alias, name);
        await respond(`Got it! I'll remember that your ${alias} is ${name}.`);
        break;
      }

      case "contact_favorite_call": {
        const alias = intent.alias ?? "";
        const fav = getContactFavorite(alias);
        if (!fav) {
          await respond(`I don't know who your ${alias} is yet. Say 'my ${alias} is [name]' to set it.`);
          break;
        }
        const phone = await lookupContactPhone(fav.contactName);
        if (!phone) {
          await respond(`I couldn't find a phone number for ${fav.contactName} in your contacts.`);
          break;
        }
        const url = `tel:${phone}`;
        await Linking.openURL(url).catch(() => {});
        await respond(`Calling your ${alias}, ${fav.contactName}.`);
        break;
      }
    }
  }

  // ── Send message ───────────────────────────────────────────────────────────

  const handleSend = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || isStreaming) return;

    // Block if offline (device commands still work without internet)
    if (!isOnline && !detectDeviceIntent(text)) {
      showOfflineAlert("AI chat");
      return;
    }

    // If screen share is active route to AI game assist instead of chat
    if (screenShareActiveRef.current && !isSearchMode) {
      setInput("");
      handleGameAssist(text);
      return;
    }

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
        // No streaming — get full text then speak it all at once
        fullContent = parseSseChunk(await response.text());
        speakText(fullContent);
      } else {
        const decoder = new TextDecoder();
        let buf = "";       // SSE line buffer
        let ttsBuf = "";    // sentence accumulation buffer for TTS
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          const delta = parseSseChunk(lines.join("\n"));
          if (!delta) continue;
          fullContent += delta;
          ttsBuf += delta;
          // Update chat UI as tokens arrive
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
          // Fire complete sentences to TTS immediately as they arrive —
          // user hears the first sentence while the rest is still generating
          const { sentences, remainder } = extractSentences(ttsBuf);
          ttsBuf = remainder;
          for (const s of sentences) {
            enqueueSentence(s); // fire-and-forget: TTS plays while streaming continues
          }
        }
        if (buf) fullContent += parseSseChunk(buf);
        // Speak any trailing text that didn't end with sentence punctuation
        if (ttsBuf.trim()) enqueueSentence(ttsBuf.trim());
      }

      if (!fullContent.trim()) throw new Error("No response received from chat service.");
      if (!added) {
        setShowTyping(false);
        setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: fullContent, timestamp: Date.now() }]);
      }

      setMessages((finalMsgs) => { saveMessages(convId, finalMsgs); return finalMsgs; });
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

  // ── Screen share / game assist ────────────────────────────────────────────

  const toggleScreenShare = async () => {
    if (!NativeScreenCapture.isAvailable) return;
    if (screenShareActive) {
      setScreenShareActive(false);
      screenShareActiveRef.current = false;
      await NativeScreenCapture.stopCapture().catch(() => {});
    } else {
      try {
        const ok = await NativeScreenCapture.startCapture();
        setScreenShareActive(ok);
        screenShareActiveRef.current = ok;
      } catch {
        setScreenShareActive(false);
        screenShareActiveRef.current = false;
      }
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleGameAssist = useCallback(async (text: string) => {
    if (isStreaming) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const convId = getOrCreateConvId();
    const snapshot = [...messages];
    const userMsg: Message = { id: generateMsgId(), role: "user", content: text, timestamp: Date.now() };
    const withUser = [...snapshot, userMsg];
    setMessages(withUser);
    setIsStreaming(true);
    setShowTyping(true);

    try {
      const baseUrl = await getApiBase();
      const { width: screenW, height: screenH } = Dimensions.get("screen");

      const screenshot = await NativeScreenCapture.captureFrame();
      if (!screenshot) throw new Error("No screen frame available — try toggling Screen Share off and on.");

      const resp = await fetch(`${baseUrl}game-assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          screenshot,
          query: text,
          screenWidth: Math.round(screenW),
          screenHeight: Math.round(screenH),
        }),
      });
      if (!resp.ok) throw new Error("Game assist request failed");

      const data = await resp.json() as {
        gameType: string;
        description: string;
        solutions: Array<{ word: string; taps: Array<{ x: number; y: number }> }>;
        message: string;
      };

      setShowTyping(false);
      const reply = data.message || data.description || "Done!";
      const assistantMsg: Message = { id: generateMsgId(), role: "assistant", content: reply, timestamp: Date.now() };
      const final = [...withUser, assistantMsg];
      setMessages(final);
      await saveMessages(convId, final);
      speakText(reply);

      // Execute swipe gestures for each word solution
      if (data.solutions?.length && NativeScreenCapture.isAvailable) {
        const sw = Math.round(screenW);
        const sh = Math.round(screenH);
        for (const sol of data.solutions) {
          if (!sol.taps || sol.taps.length < 2) continue;
          // Duration: ~60 ms per letter, minimum 250 ms
          const dur = Math.max(250, sol.taps.length * 60);
          try {
            await NativeScreenCapture.performGesture(sol.taps, dur, sw, sh);
            await new Promise<void>((r) => setTimeout(r, 650)); // gap between words
          } catch {
            break; // Accessibility not enabled — stop silently
          }
        }
      }
    } catch (error) {
      console.warn("Game assist failed", error);
      const errMsg = error instanceof Error ? error.message : "Sorry, something went wrong with game assist.";
      setShowTyping(false);
      setMessages((prev) => [...prev, { id: generateMsgId(), role: "assistant", content: errMsg, timestamp: Date.now() }]);
      speakText(errMsg);
    } finally {
      setIsStreaming(false);
      setShowTyping(false);
    }
  }, [isStreaming, messages, isOnline]);

  function handleNewChat() {
    endCallMode();
    stopSpeaking();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMessages([]);
    setCurrentConversationId(null);
    activeConvId.current = null;
  }

  function showOfflineAlert(feature: string) {
    Alert.alert(
      "No internet connection",
      `${feature} requires an internet connection.\n\n✅  Available offline:\n• Browse & read conversation history\n• Device controls (torch, volume, brightness)\n• Phone TTS (device voice)\n• Settings & preferences\n\n🌐  Requires internet:\n• AI chat & voice assistant\n• Voice transcription (Whisper)\n• Web search\n• Cloud TTS (ElevenLabs / Kokoro)`,
      [{ text: "OK" }]
    );
  }

  function handleSwitchConversation(conv: Conversation) {
    endCallMode();
    stopSpeaking();
    Haptics.selectionAsync();
    setMessages(conv.messages);
    setCurrentConversationId(conv.id);
    activeConvId.current = conv.id;
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const reversed = [...messages].reverse();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Camera view — used for torch control AND vision AI capture */}
      {cameraReady && Platform.OS !== "web" && (
        <CameraView
          ref={cameraRef}
          style={
            visionMode
              ? { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.01 }
              : { position: "absolute", width: 1, height: 1, opacity: 0 }
          }
          facing="back"
          enableTorch={torchOn}
        />
      )}

      {/* Conversation sidebar */}
      <ConversationSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        conversations={conversations}
        currentId={currentConversationId}
        onSelect={handleSwitchConversation}
        onNew={handleNewChat}
        onDelete={deleteConversation}
        colors={colors}
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <Pressable style={styles.iconBtn} onPress={() => { Haptics.selectionAsync(); setSidebarOpen(true); }}>
            <Ionicons name="menu-outline" size={22} color={colors.mutedForeground} />
          </Pressable>
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
          <Pressable style={styles.iconBtn} onPress={handleNewChat}>
            <Ionicons name="create-outline" size={20} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>

      {/* ── Offline banner ── */}
      {!isOnline && (
        <View style={[styles.offlineBanner, { backgroundColor: "#92400e" }]}>
          <Ionicons name="cloud-offline-outline" size={14} color="#fef3c7" />
          <Text style={styles.offlineBannerText}>No internet — chat &amp; voice unavailable</Text>
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {/* ── Call mode banner ── */}
        {isCallMode && (
          <View style={[styles.callBanner, { backgroundColor: colors.destructive + "12", borderBottomColor: colors.destructive + "30" }]}>
            <View style={[styles.callDot, { backgroundColor: colors.destructive }]} />
            <Text style={[styles.callBannerText, { color: colors.destructive }]}>
              {isSpeaking ? `${assistantName} is speaking…` : isRecording ? "Listening…" : isTranscribing ? "Processing…" : isStreaming ? `${assistantName} is thinking…` : "Waiting…"}
            </Text>
            <Pressable onPress={endCallMode} style={styles.callEndBtn}>
              <Ionicons name="call" size={14} color={colors.destructive} />
              <Text style={[styles.callEndText, { color: colors.destructive }]}>End</Text>
            </Pressable>
          </View>
        )}

        {/* ── Incoming call banner ── */}
        {incomingCallNumber && (
          <View style={[styles.callBanner, { backgroundColor: "#16a34a20", borderBottomColor: "#16a34a40" }]}>
            <Ionicons name="call" size={14} color="#16a34a" />
            <Text style={[styles.callBannerText, { color: "#16a34a" }]}>
              Incoming call from {incomingCallNumber} — say &quot;answer&quot; or &quot;decline&quot;
            </Text>
          </View>
        )}

        {/* ── Active timers strip ── */}
        {activeTimers.filter((t) => !t.done).length > 0 && (
          <View style={[styles.timerStrip, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            {activeTimers.filter((t) => !t.done).map((t) => {
              const m = Math.floor(t.remainingSeconds / 60);
              const s = t.remainingSeconds % 60;
              return (
                <View key={t.id} style={[styles.timerChip, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "30" }]}>
                  <Ionicons name="timer-outline" size={12} color={colors.primary} />
                  <Text style={[styles.timerText, { color: colors.primary }]}>
                    {t.label} — {m}:{String(s).padStart(2, "0")}
                  </Text>
                  <Pressable onPress={() => setActiveTimers((prev) => prev.filter((x) => x.id !== t.id))}>
                    <Ionicons name="close-circle" size={14} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}

        {messages.length === 0 && !isTranscribing ? (
          /* ── Empty / Voice-first state ── */
          <View style={styles.voiceHome}>
            <Pressable onPress={isRecording ? stopRecording : startRecording} disabled={isStreaming || isCallMode || isWakeListening}>
              <SiriOrb isRecording={isRecording} isSpeaking={isSpeaking} audioLevel={audioLevelAnim} colors={colors} />
            </Pressable>

            {/* Live waveform — visible while mic is open */}
            {isRecording && <WaveformBars audioLevel={audioLevelAnim} colors={colors} />}

            {isCallMode ? (
              <>
                <Text style={[styles.voiceHint, { color: colors.destructive }]}>
                  {isSpeaking ? "Speaking…" : isRecording ? "Listening…" : isTranscribing ? "Processing…" : isStreaming ? "Thinking…" : "Waiting…"}
                </Text>
                <Pressable style={[styles.endCallChip, { backgroundColor: colors.destructive + "15", borderColor: colors.destructive + "40" }]} onPress={endCallMode}>
                  <Ionicons name="call" size={14} color={colors.destructive} />
                  <Text style={[styles.chipText, { color: colors.destructive }]}>End call</Text>
                </Pressable>
              </>
            ) : isRecording ? (
              <Text style={[styles.voiceHint, { color: colors.primary }]}>Listening… tap to stop</Text>
            ) : isSpeaking ? (
              <Text style={[styles.voiceHint, { color: colors.accent }]}>Speaking… tap to interrupt</Text>
            ) : isTranscribing ? (
              <Text style={[styles.voiceHint, { color: colors.mutedForeground }]}>Processing…</Text>
            ) : (
              <>
                <Text style={[styles.voiceTitle, { color: colors.foreground }]}>Hi, I&apos;m {assistantName}</Text>
                <Text style={[styles.voiceSubtitle, { color: colors.mutedForeground }]}>
                  Tap the mic to speak, or go hands-free
                </Text>
                {/* Hands-free call button */}
                <Pressable
                  style={[styles.voiceCallBtn, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
                  onPress={startCallMode}
                  disabled={isStreaming}
                >
                  <Ionicons name="mic-outline" size={20} color="#fff" />
                  <Text style={styles.voiceCallBtnText}>Hands-Free Mode</Text>
                </Pressable>

                {/* Screen Share / Game Assist toggle — Android only */}
                {Platform.OS === "android" && NativeScreenCapture.isAvailable && (
                  <Pressable
                    style={[
                      styles.screenShareBtn,
                      {
                        backgroundColor: screenShareActive ? "#16a34a" : colors.card,
                        borderColor: screenShareActive ? "#16a34a" : colors.border,
                        shadowColor: screenShareActive ? "#16a34a" : "transparent",
                      },
                    ]}
                    onPress={toggleScreenShare}
                    disabled={isStreaming}
                  >
                    <Ionicons
                      name={screenShareActive ? "tv" : "tv-outline"}
                      size={18}
                      color={screenShareActive ? "#fff" : colors.mutedForeground}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.screenShareTitle, { color: screenShareActive ? "#fff" : colors.foreground }]}>
                        {screenShareActive ? "Screen Share On" : "Start Screen Share"}
                      </Text>
                      <Text style={[styles.screenShareSub, { color: screenShareActive ? "#d1fae5" : colors.mutedForeground }]}>
                        {screenShareActive ? `Say anything — ${assistantName} sees your screen` : "Let Vox see & play games"}
                      </Text>
                    </View>
                    <View style={[styles.screenShareDot, { backgroundColor: screenShareActive ? "#86efac" : colors.muted }]} />
                  </Pressable>
                )}
                <View style={styles.quickChips}>
                  {customQuickChips.map((q) => (
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
  voiceCallBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingHorizontal: 28, paddingVertical: 14,
    borderRadius: 28, width: "100%",
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 8,
  },
  voiceCallBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  quickChips: { width: "100%", gap: 8, marginTop: 4 },
  chip: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, borderWidth: 1, alignItems: "center" },
  chipText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  endCallChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 14, borderWidth: 1 },

  callBanner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  callDot: { width: 8, height: 8, borderRadius: 4 },
  callBannerText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  callEndBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  callEndText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  timerStrip: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  timerChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  timerText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

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

  offlineBanner: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  offlineBannerText: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#fef3c7", flex: 1 },

  screenShareBtn: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingVertical: 13,
    borderRadius: 16, borderWidth: 1, width: "100%",
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  screenShareTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  screenShareSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  screenShareDot: { width: 8, height: 8, borderRadius: 4 },
});
