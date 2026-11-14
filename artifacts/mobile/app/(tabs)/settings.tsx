import { Feather, Ionicons, MaterialIcons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import { useCameraPermissions } from "expo-camera";
import * as Contacts from "expo-contacts";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import { fetch } from "expo/fetch";
import { router, type Href } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppState,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAssistant, type TtsProvider, type ThemeOverride, DEFAULT_QUICK_CHIPS } from "@/context/AssistantContext";
import { useColors } from "@/hooks/useColors";
import { NativeAccessibility } from "@/modules/NativeAccessibility";
import { NativeNotifications } from "@/modules/NativeNotifications";
import { NativeScreenLock } from "@/modules/NativeScreenLock";
import { NativeSystemPermissions } from "@/modules/NativeSystemPermissions";
import { OfflineModelsSection } from "@/components/OfflineModelsSection";
import { WakeWordSettings } from "@/components/WakeWordSettings";
import { AssistantQualitySettings } from "@/components/AssistantQualitySettings";

interface Permission {
  id: string;
  label: string;
  description: string;
  icon: string;
}

type PermStatus = "granted" | "denied" | "unavailable";

interface ElVoice {
  id: string;
  name: string;
  description: string;
}

const PERMISSIONS: Permission[] = [
  { id: "microphone", label: "Microphone", description: "Voice input and recording", icon: "mic" },
  { id: "internet", label: "Internet", description: "API calls to Groq / Tavily / ElevenLabs", icon: "globe-outline" },
  { id: "camera", label: "Camera / Flashlight", description: "Flashlight control", icon: "flashlight-outline" },
  { id: "contacts", label: "Contacts", description: "Look up contacts by name for calls & SMS", icon: "people-outline" },
  { id: "notification_listener", label: "Notification Access", description: "Read incoming messages from app notifications", icon: "notifications-outline" },
  { id: "accessibility", label: "Accessibility Service", description: "Read app screen text for assistant automation", icon: "eye-outline" },
  { id: "device_admin", label: "Device Administrator", description: "Optional. Only needed if you want to say \"lock my phone\". Everything else works without it.", icon: "shield-outline" },
  { id: "write_settings", label: "Modify System Settings", description: "Optional. Only needed for voice brightness and system audio control.", icon: "settings-outline" },
  { id: "overlay", label: "Display Over Other Apps", description: "Show assistant overlay on top of apps", icon: "layers-outline" },
  { id: "battery_optimization", label: "Battery Optimization", description: "Keep assistant services alive in background", icon: "battery-charging-outline" },
];

const DEFAULT_PERM_STATUSES: Record<string, PermStatus> = {
  microphone: "unavailable",
  internet: "granted",
  camera: "unavailable",
  contacts: "unavailable",
  notification_listener: "unavailable",
  accessibility: "unavailable",
  device_admin: "unavailable",
  write_settings: "unavailable",
  overlay: "unavailable",
  battery_optimization: "unavailable",
};

const OPTIONAL_PERMS = ["device_admin", "write_settings"];

type DestId = "assistant" | "voice" | "wake" | "floating" | "messages" | "offline" | "advanced" | "account" | "permissions";

const DESTINATIONS: { id: DestId; label: string; icon: string; keywords: string[] }[] = [
  { id: "assistant", label: "Assistant", icon: "person-circle-outline", keywords: ["name", "conversations", "ai model", "search engine", "assistant quality", "speech language", "quick chips", "theme", "appearance", "dark mode"] },
  { id: "voice", label: "Voice & Calls", icon: "mic-circle-outline", keywords: ["voice engine", "piper", "kokoro", "elevenlabs", "phone voice", "speaking speed", "call mode", "preview voice"] },
  { id: "wake", label: "Wake Word", icon: "ear-outline", keywords: ["wake word", "hands-free", "hotword", "calibration", "listening"] },
  { id: "floating", label: "Floating Assistant", icon: "radio-button-on-outline", keywords: ["floating bubble", "floating mic button", "overlay", "quick commands"] },
  { id: "messages", label: "Messages & Notifications", icon: "notifications-outline", keywords: ["read incoming messages", "notifications", "privacy", "context", "battery", "media", "screen text", "location"] },
  { id: "offline", label: "Offline & Downloads", icon: "cloud-download-outline", keywords: ["offline models", "downloads", "speech recognition", "piper voice", "whisper"] },
  { id: "advanced", label: "Advanced", icon: "construct-outline", keywords: ["api server url", "export chat history", "clear all chat history", "build", "data"] },
  { id: "account", label: "Account & Cloud", icon: "cloud-outline", keywords: ["account", "sign in", "sync", "cloud", "backup", "guest"] },
  { id: "permissions", label: "Permissions & Device Setup", icon: "shield-checkmark-outline", keywords: ["permissions", "microphone", "contacts", "accessibility", "notification access", "device administrator", "overlay", "battery optimization", "camera", "flashlight"] },
];

const SPEED_OPTIONS = [
  { label: "Slow", value: 0.7 },
  { label: "Normal", value: 0.9 },
  { label: "Fast", value: 1.15 },
];

function StatusBadge({ status, colors }: { status: PermStatus; colors: ReturnType<typeof useColors> }) {
  const map = {
    granted: { bg: colors.success + "20", text: colors.success, label: "Granted" },
    denied: { bg: colors.destructive + "20", text: colors.destructive, label: "Denied" },
    unavailable: { bg: colors.muted, text: colors.mutedForeground, label: "Needs permission" },
  };
  const s = map[status];
  return (
    <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
      <Text style={[styles.statusText, { color: s.text }]}>{s.label}</Text>
    </View>
  );
}

// Stable component identities: defining these inside SettingsScreen remounts
// the whole section (including native model listeners) on every state change.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{title}</Text>
      <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>{children}</View>
    </View>
  );
}

function Row({ icon, label, value, onPress, destructive, children }: {
  icon?: string; label: string; value?: string; onPress?: () => void; destructive?: boolean; children?: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <Pressable style={[styles.row, { borderBottomColor: colors.border }]} onPress={onPress} disabled={!onPress}>
      {icon && <View style={[styles.rowIconBg, { backgroundColor: destructive ? colors.destructive + "18" : colors.primary + "15" }]}>
        <Ionicons name={icon as "mic"} size={16} color={destructive ? colors.destructive : colors.primary} />
      </View>}
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: destructive ? colors.destructive : colors.foreground }]}>{label}</Text>
        {value && <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>{value}</Text>}
        {children}
      </View>
      {onPress && !destructive && <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} />}
    </Pressable>
  );
}

function ProviderTab({ p, label, icon }: { p: TtsProvider; label: string; icon: string }) {
  const colors = useColors();
  const { ttsProvider, setTtsProvider } = useAssistant();
  const active = ttsProvider === p;
  return (
    <Pressable style={[styles.provTab, { backgroundColor: active ? colors.primary : colors.muted, borderColor: active ? colors.primary : colors.border }]}
      onPress={() => { void setTtsProvider(p); Haptics.selectionAsync(); }}>
      <Ionicons name={icon as "mic"} size={14} color={active ? "#fff" : colors.mutedForeground} />
      <Text style={[styles.provTabText, { color: active ? "#fff" : colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

function ThemeTab({ t, label, icon }: { t: ThemeOverride; label: string; icon: string }) {
  const colors = useColors();
  const { themeOverride, setThemeOverride } = useAssistant();
  const active = themeOverride === t;
  return (
    <Pressable style={[styles.provTab, { backgroundColor: active ? colors.primary : colors.muted, borderColor: active ? colors.primary : colors.border }]}
      onPress={() => { void setThemeOverride(t); Haptics.selectionAsync(); }}>
      <Ionicons name={icon as "mic"} size={14} color={active ? "#fff" : colors.mutedForeground} />
      <Text style={[styles.provTabText, { color: active ? "#fff" : colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    assistantName, setAssistantName, deviceId,
    conversations, clearAllConversations,
    phoneVoiceId, setPhoneVoiceId,
    elVoiceId, setElVoiceId,
    kokoroVoiceId, setKokoroVoiceId,
    speechRate, setSpeechRate,
    ttsProvider, setTtsProvider,
    themeOverride, setThemeOverride,
    customApiUrl, setCustomApiUrl,
    readIncomingEnabled, setReadIncomingEnabled,
    floatingBubbleEnabled, setFloatingBubbleEnabled,
    customQuickChips, setCustomQuickChips,
    speechLanguage, setSpeechLanguage,
    contextEnabled, setContextEnabled,
    contextBattery, setContextBattery,
    contextNotifications, setContextNotifications,
    contextScreen, setContextScreen,
    contextLocation, setContextLocation,
    contextMedia, setContextMedia,
  } = useAssistant();

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(assistantName);

  const [phoneVoices, setPhoneVoices] = useState<Speech.Voice[]>([]);
  const [loadingPhoneVoices, setLoadingPhoneVoices] = useState(false);
  const [visiblePhoneVoiceCount, setVisiblePhoneVoiceCount] = useState(12);
  const voiceRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsAliveRef = useRef(true);
  const previewSoundRef = useRef<Audio.Sound | null>(null);
  const previewGenerationRef = useRef(0);

  const [editingApiUrl, setEditingApiUrl] = useState(false);
  const [apiUrlInput, setApiUrlInput] = useState(customApiUrl ?? "");
  const [previewingPhoneId, setPreviewingPhoneId] = useState<string | null>(null);

  const [elVoices, setElVoices] = useState<ElVoice[]>([]);
  const [voiceDropdownOpen, setVoiceDropdownOpen] = useState(false);

  const [kokoroVoices, setKokoroVoices] = useState<ElVoice[]>([]);
  const [kokoroDropdownOpen, setKokoroDropdownOpen] = useState(false);
  const [loadingKokoroVoices, setLoadingKokoroVoices] = useState(false);
  const [previewingKokoroId, setPreviewingKokoroId] = useState<string | null>(null);

  const [permStatuses, setPermStatuses] = useState<Record<string, PermStatus>>(DEFAULT_PERM_STATUSES);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [loadingElVoices, setLoadingElVoices] = useState(false);
  const [previewingElId, setPreviewingElId] = useState<string | null>(null);

  // Quick chips editing state
  const [editingChips, setEditingChips] = useState(false);
  const [chipsInput, setChipsInput] = useState(customQuickChips.join("\n"));

  const [active, setActive] = useState<DestId | null>(null);
  const [query, setQuery] = useState("");
  const scrollRef = useRef<ScrollView>(null);
  const activeDest = DESTINATIONS.find((d) => d.id === active) ?? null;
  const filteredDests = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DESTINATIONS;
    return DESTINATIONS.filter((d) => d.label.toLowerCase().includes(q) || d.keywords.some((k) => k.includes(q)));
  }, [query]);
  const permRequired = PERMISSIONS.filter((p) => p.id !== "internet" && !OPTIONAL_PERMS.includes(p.id));
  const permIncomplete = Platform.OS === "android" ? permRequired.filter((p) => permStatuses[p.id] !== "granted") : [];
  const permRequiredGranted = permRequired.length - permIncomplete.length;

  function openDest(id: DestId) {
    Haptics.selectionAsync();
    setActive(id);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }
  function goHome() {
    setActive(null);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }
  useEffect(() => {
    if (active === null) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { setActive(null); return true; });
    return () => sub.remove();
  }, [active]);

  function destSummary(id: DestId): string {
    switch (id) {
      case "assistant": return `${assistantName} · ${speechLanguage} · ${themeOverride} theme`;
      case "voice": return ({ phone: "Phone voice", kokoro: "Kokoro", elevenlabs: "ElevenLabs", piper: "Piper (offline)" } as Record<TtsProvider, string>)[ttsProvider];
      case "wake": return "Hands-free listening and calibration";
      case "floating": return floatingBubbleEnabled ? "On" : "Off";
      case "messages": return `${readIncomingEnabled ? "Reads messages aloud" : "Silent"} · context ${contextEnabled ? "on" : "off"}`;
      case "offline": return "Speech and voice models on this device";
      case "advanced": return customApiUrl ? "Custom API server" : "Default server · data & export";
      case "account": return "Sign in, sync, guest mode";
      case "permissions": return Platform.OS !== "android" ? "Android only" : permIncomplete.length ? `${permRequiredGranted} of ${permRequired.length} ready` : "All feature permissions set up";
    }
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    settingsAliveRef.current = true;
    refreshPermissions();
    return () => {
      settingsAliveRef.current = false;
      if (voiceRetryRef.current) clearTimeout(voiceRetryRef.current);
      stopPreviewAudio();
    };
  }, []);

  useEffect(() => {
    // Avoid initializing Android's TTS engine for an unrelated provider.
    if (ttsProvider === "phone" && phoneVoices.length === 0) void loadPhoneVoices();
    stopPreviewAudio();
    setPreviewingElId(null);
    setPreviewingKokoroId(null);
    setPreviewingPhoneId(null);
    return () => {
      if (voiceRetryRef.current) clearTimeout(voiceRetryRef.current);
    };
  }, [ttsProvider]);

  // Re-check permissions whenever the app returns to the foreground (e.g. after
  // the user grants write-settings / overlay in system settings and comes back).
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshPermissions();
    });
    return () => sub.remove();
  }, []);

  // Sync camera permission state from the hook whenever it changes
  useEffect(() => {
    if (!cameraPermission) return;
    let camStatus: PermStatus;
    if (cameraPermission.granted) {
      camStatus = "granted";
    } else if (cameraPermission.status === "denied") {
      camStatus = "denied";
    } else {
      return;
    }
    setPermStatuses((prev) => ({ ...prev, camera: camStatus }));
  }, [cameraPermission]);

  async function refreshPermissions() {
    if (Platform.OS === "web") return;
    const updates: Record<string, PermStatus> = {};

    function toPermStatus(status: string): PermStatus {
      if (status === "granted") return "granted";
      if (status === "denied") return "denied";
      return "unavailable";
    }

    // Microphone
    try {
      const { status } = await Audio.getPermissionsAsync();
      updates.microphone = toPermStatus(status);
    } catch { /* leave default */ }

    // Contacts
    try {
      const { status } = await Contacts.getPermissionsAsync();
      updates.contacts = toPermStatus(status);
    } catch { /* leave default */ }

    // Accessibility Service
    try {
      if (NativeAccessibility.isAvailable) {
        const enabled = await NativeAccessibility.isEnabled();
        updates.accessibility = enabled ? "granted" : "unavailable";
      }
    } catch { /* leave default */ }

    // Notification listener access
    try {
      if (NativeNotifications.isAvailable) {
        const enabled = await NativeNotifications.hasPermission();
        updates.notification_listener = enabled ? "granted" : "unavailable";
      }
    } catch { /* leave default */ }

    // Device admin
    try {
      if (NativeScreenLock.isAvailable) {
        const isAdmin = await NativeScreenLock.isAdminEnabled();
        updates.device_admin = isAdmin ? "granted" : "unavailable";
      }
    } catch { /* leave default */ }

    // Write system settings
    try {
      const hasWrite = await NativeSystemPermissions.hasWriteSettingsPermission();
      updates.write_settings = hasWrite ? "granted" : "unavailable";
    } catch { /* leave default */ }

    // Overlay (display over other apps)
    try {
      const hasOverlay = await NativeSystemPermissions.hasOverlayPermission();
      updates.overlay = hasOverlay ? "granted" : "unavailable";
    } catch { /* leave default */ }

    // Battery optimization exemption (helps keep accessibility service active)
    try {
      if (NativeAccessibility.isAvailable) {
        const ignored = await NativeAccessibility.isBatteryOptimizationIgnored();
        updates.battery_optimization = ignored ? "granted" : "unavailable";
      }
    } catch { /* leave default */ }

    setPermStatuses((prev) => ({ ...prev, ...updates }));
  }

  async function loadPhoneVoices(attempt = 0) {
    if (!settingsAliveRef.current) return;
    setLoadingPhoneVoices(true);
    try {
      const all = await Speech.getAvailableVoicesAsync();
      if (!settingsAliveRef.current) return;
      const english = all
        .filter((v) => v.language?.startsWith("en"))
        .sort((a, b) => {
          const qA = a.quality === Speech.VoiceQuality.Enhanced ? 1 : 0;
          const qB = b.quality === Speech.VoiceQuality.Enhanced ? 1 : 0;
          return (qB - qA) || (a.name ?? "").localeCompare(b.name ?? "");
        });
      if (english.length === 0 && attempt < 3) {
        // Android TTS engine sometimes needs a moment to initialize — retry
        voiceRetryRef.current = setTimeout(() => loadPhoneVoices(attempt + 1), 1500);
        return;
      }
      setPhoneVoices(english);
    } catch {
      if (attempt < 3) {
        voiceRetryRef.current = setTimeout(() => loadPhoneVoices(attempt + 1), 1500);
        return;
      }
      setPhoneVoices([]);
    }
    setLoadingPhoneVoices(false);
  }

  function resolveBase() {
    if (customApiUrl && customApiUrl.trim()) {
      const u = customApiUrl.trim();
      return u.endsWith("/") ? u : `${u}/`;
    }
    const envUrl = process.env.EXPO_PUBLIC_API_URL;
    if (envUrl) return envUrl.endsWith("/") ? envUrl : `${envUrl}/`;
    if (Platform.OS === "web") return "/api/";
    return "https://vox.bossbot.me/api/";
  }
  const qualityApiBase = React.useCallback(async () => resolveBase(), [customApiUrl]);

  async function loadElVoices() {
    if (elVoices.length > 0) return; // already loaded
    setLoadingElVoices(true);
    try {
      const base = resolveBase();
      const r = await fetch(`${base}tts/voices?provider=elevenlabs`);
      if (r.ok) {
        const data = await r.json() as { voices: ElVoice[] };
        setElVoices((data.voices ?? []).slice(0, 5));
      }
    } catch { setElVoices([]); }
    finally { setLoadingElVoices(false); }
  }

  async function loadKokoroVoices() {
    if (kokoroVoices.length > 0) return; // already loaded
    setLoadingKokoroVoices(true);
    try {
      const base = resolveBase();
      const r = await fetch(`${base}tts/voices?provider=kokoro`);
      if (r.ok) {
        const data = await r.json() as { voices: ElVoice[] };
        setKokoroVoices(data.voices ?? []);
      }
    } catch { setKokoroVoices([]); }
    finally { setLoadingKokoroVoices(false); }
  }

  async function previewKokoroVoice(v: ElVoice) {
    await previewCloudVoice(v, "kokoro", previewingKokoroId === v.id);
  }

  function stopPreviewAudio(): number {
    const generation = ++previewGenerationRef.current;
    const sound = previewSoundRef.current;
    previewSoundRef.current = null;
    if (sound) {
      sound.setOnPlaybackStatusUpdate(null);
      sound.unloadAsync().catch(() => {});
    }
    return generation;
  }

  async function previewCloudVoice(v: ElVoice, provider: "kokoro" | "elevenlabs", stop: boolean) {
    const generation = stopPreviewAudio();
    setPreviewingKokoroId(null);
    setPreviewingElId(null);
    if (stop) return;
    const setPreviewId = provider === "kokoro" ? setPreviewingKokoroId : setPreviewingElId;
    setPreviewId(v.id);
    Haptics.selectionAsync();
    try {
      // Native streaming avoids copying MP3 bytes/base64 on the UI's JS thread.
      const params = new URLSearchParams({
        text: `Hi, I'm ${assistantName}. This is the ${v.name} voice.`,
        provider,
        voiceId: v.id,
      });
      const { sound } = await Audio.Sound.createAsync(
        { uri: `${resolveBase()}tts?${params}` },
        { shouldPlay: false },
      );
      if (generation !== previewGenerationRef.current) {
        await sound.unloadAsync();
        return;
      }
      previewSoundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (generation !== previewGenerationRef.current) return;
        if ((status.isLoaded && status.didJustFinish) || (!status.isLoaded && status.error)) {
          setPreviewId(null);
          stopPreviewAudio();
        }
      });
      await sound.playAsync();
    } catch {
      if (generation !== previewGenerationRef.current) return;
      setPreviewId(null);
      stopPreviewAudio();
      Alert.alert("Voice preview failed", "The server could not play this voice. Check the voice provider and API connection.");
    }
  }

  async function saveName() {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed.length < 2) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await setAssistantName(trimmed);
    setEditingName(false);
  }

  async function saveApiUrl() {
    const trimmed = apiUrlInput.trim();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await setCustomApiUrl(trimmed || null);
    setEditingApiUrl(false);
    // Reload ElevenLabs voices using the new API base
    loadElVoices();
  }

  function handleClearHistory() {
    const doIt = () => { clearAllConversations(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); };
    if (Platform.OS === "web") { doIt(); }
    else {
      Alert.alert("Clear all history", `Delete all ${conversations.length} conversation(s)?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Clear", style: "destructive", onPress: doIt },
      ]);
    }
  }

  function handleExportHistory() {
    if (conversations.length === 0) {
      Alert.alert("No history", "You have no saved conversations to export.");
      return;
    }
    const text = conversations
      .map((conv) => {
        const header = `=== ${conv.title} ===\n${new Date(conv.createdAt).toLocaleDateString()}\n`;
        const msgs = conv.messages
          .map((m) => `${m.role === "user" ? "You" : assistantName}: ${m.content}`)
          .join("\n");
        return header + msgs;
      })
      .join("\n\n");
    Share.share({ message: text, title: "Chat history" });
  }

  async function handlePermissionPress(permId: string) {
    if (Platform.OS !== "android") return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (permId === "microphone") {
        await Audio.requestPermissionsAsync();
      } else if (permId === "camera") {
        if (requestCameraPermission) await requestCameraPermission();
      } else if (permId === "contacts") {
        await Contacts.requestPermissionsAsync();
      } else if (permId === "accessibility") {
        await NativeAccessibility.requestEnable();
      } else if (permId === "notification_listener") {
        await NativeNotifications.requestPermission();
      } else if (permId === "device_admin") {
        const destination = await NativeScreenLock.requestAdmin();
        if (destination === "security-settings") {
          Alert.alert(
            "Enable Vox in Device admin apps",
            "Android opened Security settings instead of the direct permission screen. Find Device admin apps (sometimes under More security settings), choose Vox, and enable screen locking.",
          );
        }
      } else if (permId === "write_settings") {
        await NativeSystemPermissions.requestWriteSettingsPermission();
      } else if (permId === "overlay") {
        await NativeSystemPermissions.requestOverlayPermission();
      } else if (permId === "battery_optimization") {
        await NativeAccessibility.requestIgnoreBatteryOptimization();
      }
    } catch (error) {
      Alert.alert(
        permId === "device_admin" ? "Couldn't open Device Administrator" : "Couldn't open permission settings",
        error instanceof Error ? error.message : "Android could not open this permission screen. Open your phone's Settings and try there.",
      );
    }
    // Re-check status after returning from system settings
    setTimeout(() => refreshPermissions(), 800);
  }

  async function previewPhoneVoice(v: Speech.Voice) {
    if (previewingPhoneId === v.identifier) {
      Speech.stop(); setPreviewingPhoneId(null); return;
    }
    setPreviewingPhoneId(v.identifier);
    Haptics.selectionAsync();
    Speech.speak(`Hi, I'm ${assistantName}. This is the phone voice.`, {
      voice: v.identifier, language: v.language, rate: speechRate, pitch: 1.05,
      onDone: () => setPreviewingPhoneId(null),
      onError: () => setPreviewingPhoneId(null),
      onStopped: () => setPreviewingPhoneId(null),
    });
  }

  async function selectPhoneVoice(v: Speech.Voice | null) {
    Speech.stop(); setPreviewingPhoneId(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await setPhoneVoiceId(v?.identifier ?? null);
  }

  async function previewElVoice(v: ElVoice) {
    await previewCloudVoice(v, "elevenlabs", previewingElId === v.id);
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        {activeDest ? (
          <View style={styles.subHeader}>
            <Pressable testID="settings-back" accessibilityRole="button" accessibilityLabel="Back to all settings"
              hitSlop={10} onPress={goHome} style={[styles.backBtn, { backgroundColor: colors.primary + "18" }]}>
              <Ionicons name="chevron-back" size={20} color={colors.primary} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={[styles.crumb, { color: colors.mutedForeground }]}>Settings</Text>
              <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>{activeDest.label}</Text>
            </View>
          </View>
        ) : (
          <>
            <Text style={[styles.title, { color: colors.foreground }]}>Settings</Text>
            <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="search" size={16} color={colors.mutedForeground} />
              <TextInput testID="settings-search" accessibilityLabel="Search settings"
                value={query} onChangeText={setQuery} placeholder="Search voice, wake word, permissions..."
                placeholderTextColor={colors.mutedForeground} autoCorrect={false} autoCapitalize="none"
                returnKeyType="search" style={[styles.searchInput, { color: colors.foreground }]} />
              {query.length > 0 && (
                <Pressable testID="settings-search-clear" accessibilityLabel="Clear search" hitSlop={8} onPress={() => setQuery("")}>
                  <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
                </Pressable>
              )}
            </View>
          </>
        )}
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: bottomPad + 80 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {active === null && (
          <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 10 }}>
            {permIncomplete.length > 0 && !query && (
              <Pressable testID="settings-permission-summary" accessibilityRole="button"
                accessibilityLabel={`${permIncomplete.length} feature permissions not set up. Open Permissions and Device Setup`}
                onPress={() => openDest("permissions")}
                style={[styles.alertCard, { backgroundColor: colors.warning + "18", borderColor: colors.warning + "55" }]}>
                <Ionicons name="alert-circle" size={20} color={colors.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: colors.foreground }]}>Hands-free features: {permRequiredGranted} of {permRequired.length} set up</Text>
                  <Text style={[styles.rowValue, { color: colors.mutedForeground }]} numberOfLines={2}>
                    Not set up yet (chat still works): {permIncomplete.map((p) => p.label).join(", ")}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
              </Pressable>
            )}
            {filteredDests.length === 0 ? (
              <View style={[styles.emptyCard, { borderColor: colors.border }]}>
                <Ionicons name="search-outline" size={22} color={colors.mutedForeground} />
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>Nothing matches "{query}"</Text>
                <Text style={[styles.rowValue, { color: colors.mutedForeground, textAlign: "center" }]}>Try words like voice, wake, bubble, offline, sync or permissions.</Text>
              </View>
            ) : (
              <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {filteredDests.map((d, i) => {
                  const hit = query ? d.keywords.find((k) => k.includes(query.trim().toLowerCase())) : undefined;
                  return (
                    <Pressable key={d.id} testID={`settings-dest-${d.id}`} accessibilityRole="button"
                      accessibilityLabel={`${d.label}. ${destSummary(d.id)}`}
                      onPress={() => openDest(d.id)}
                      style={({ pressed }) => [styles.destRow, { borderBottomColor: i < filteredDests.length - 1 ? colors.border : "transparent", backgroundColor: pressed ? colors.primary + "0d" : "transparent" }]}>
                      <View style={[styles.destIcon, { backgroundColor: colors.primary + "1c" }]}>
                        <Ionicons name={d.icon as "mic"} size={18} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.destLabel, { color: colors.foreground }]}>{d.label}</Text>
                        <Text style={[styles.rowValue, { color: colors.mutedForeground }]} numberOfLines={1}>
                          {hit ? `Includes: ${hit}` : destSummary(d.id)}
                        </Text>
                      </View>
                      {d.id === "permissions" && permIncomplete.length > 0 && (
                        <View style={[styles.statusBadge, { backgroundColor: colors.warning + "22" }]}>
                          <Text style={[styles.statusText, { color: colors.warning }]}>{permIncomplete.length} to do</Text>
                        </View>
                      )}
                      <Ionicons name="chevron-forward" size={15} color={colors.mutedForeground} />
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {active === "assistant" && (<>
        {/* ── Assistant ── */}
        <Section title="Assistant">
          {editingName ? (
            <View style={[styles.row, { borderBottomColor: colors.border }]}>
              <TextInput
                style={[styles.nameInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                value={nameInput} onChangeText={setNameInput} autoFocus maxLength={24}
                returnKeyType="done" onSubmitEditing={saveName}
              />
              <Pressable style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={saveName}>
                <Feather name="check" size={16} color="#fff" />
              </Pressable>
              <Pressable style={[styles.cancelBtn, { borderColor: colors.border }]}
                onPress={() => { setEditingName(false); setNameInput(assistantName); }}>
                <Feather name="x" size={16} color={colors.foreground} />
              </Pressable>
            </View>
          ) : (
            <Row icon="person-circle-outline" label="Name" value={assistantName}
              onPress={() => { setEditingName(true); setNameInput(assistantName); }} />
          )}
          <Row icon="chatbubbles-outline" label="Conversations" value={`${conversations.length} saved`} />
          <Row icon="cube-outline" label="AI Model" value="Groq — LLaMA 3.3 70B Versatile" />
          <Row icon="globe-outline" label="Search Engine" value="Tavily Web Search" />
        </Section>

        </>)}
        {active === "voice" && (<>
        {/* ── Voice ── */}
        <Section title="Voice">
          {/* Provider selector */}
          <View style={[styles.row, { borderBottomColor: colors.border, flexDirection: "column", alignItems: "flex-start", gap: 10 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="mic-circle-outline" size={18} color={colors.primary} />
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>Voice Engine</Text>
            </View>
            <View style={styles.provRow}>
              <ProviderTab p="piper" label="Piper" icon="cloud-offline-outline" />
              <ProviderTab p="kokoro" label="Kokoro" icon="server-outline" />
              <ProviderTab p="elevenlabs" label="ElevenLabs" icon="sparkles" />
              <ProviderTab p="phone" label="Phone" icon="phone-portrait-outline" />
            </View>
            <Text style={[styles.rowValue, { color: colors.mutedForeground, paddingLeft: 0 }]}>
              {ttsProvider === "kokoro"
                ? "Kokoro server voice. Requires a configured Kokoro endpoint; regular replies fall back to phone voice if unavailable."
                : ttsProvider === "elevenlabs"
                ? "High-quality ElevenLabs cloud voices. Falls back to phone TTS if unavailable."
                : ttsProvider === "piper"
                ? "Piper uses a pronunciation dictionary and prepares the next phrase during playback. Unknown pronunciations use Phone voice for that phrase. Still experimental and session-only: requires 64-bit Android and sufficient memory; restarts use Phone voice."
                : "Your device's built-in voice — works offline, always available."}
            </Text>
            {(ttsProvider === "kokoro" || ttsProvider === "elevenlabs") && (
              <Text style={[styles.rowValue, { color: colors.mutedForeground, paddingLeft: 0 }]}>
                Continuous Call mode uses your phone voice. Select Piper explicitly to use the downloaded neural voice.
              </Text>
            )}
          </View>

          {/* Speed (phone TTS only) */}
          {ttsProvider === "phone" && (
            <View style={[styles.row, { borderBottomColor: colors.border, flexDirection: "column", alignItems: "flex-start", gap: 10 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="speedometer-outline" size={18} color={colors.primary} />
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>Speaking Speed</Text>
              </View>
              <View style={styles.speedRow}>
                {SPEED_OPTIONS.map((opt) => {
                  const active = Math.abs(speechRate - opt.value) < 0.05;
                  return (
                    <Pressable key={opt.label}
                      style={[styles.speedBtn, { backgroundColor: active ? colors.primary : colors.muted, borderColor: active ? colors.primary : colors.border }]}
                      onPress={async () => { await setSpeechRate(opt.value); Haptics.selectionAsync(); }}>
                      <Text style={[styles.speedBtnText, { color: active ? "#fff" : colors.foreground }]}>{opt.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* Kokoro voices — compact dropdown */}
          {ttsProvider === "kokoro" && (
            <View style={[styles.row, { borderBottomColor: colors.border, flexDirection: "column", alignItems: "stretch", gap: 0, paddingBottom: 0 }]}>
              <Pressable
                style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 16 }}
                onPress={() => {
                  const next = !kokoroDropdownOpen;
                  setKokoroDropdownOpen(next);
                  if (next && kokoroVoices.length === 0) loadKokoroVoices();
                  Haptics.selectionAsync();
                }}
              >
                <Ionicons name="server-outline" size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: colors.foreground }]}>Kokoro Voice</Text>
                  <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>
                    {(kokoroVoices.find((v) => v.id === kokoroVoiceId) ?? kokoroVoices[0])?.name ?? kokoroVoiceId}
                  </Text>
                </View>
                <Ionicons name={kokoroDropdownOpen ? "chevron-up" : "chevron-down"} size={14} color={colors.mutedForeground} />
              </Pressable>

              {kokoroDropdownOpen && (
                <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                  {loadingKokoroVoices ? (
                    <View style={{ padding: 16, alignItems: "center" }}>
                      <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>Loading voices…</Text>
                    </View>
                  ) : kokoroVoices.length === 0 ? (
                    <View style={{ padding: 16 }}>
                      <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>Could not load voices from Kokoro server.</Text>
                    </View>
                  ) : (
                    kokoroVoices.map((v, i) => {
                      const isSelected = kokoroVoiceId === v.id;
                      const isPreviewing = previewingKokoroId === v.id;
                      return (
                        <Pressable key={v.id}
                          style={[styles.voiceRow, {
                            borderBottomColor: i < kokoroVoices.length - 1 ? colors.border : "transparent",
                            backgroundColor: isSelected ? colors.primary + "10" : "transparent",
                            paddingLeft: 20,
                          }]}
                          onPress={() => { setKokoroVoiceId(v.id); setKokoroDropdownOpen(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
                          <View style={[styles.voiceRadio, { borderColor: isSelected ? colors.primary : colors.border, backgroundColor: isSelected ? colors.primary : "transparent" }]}>
                            {isSelected && <View style={styles.voiceRadioDot} />}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.rowLabel, { color: colors.foreground }]}>{v.name}</Text>
                            {v.description ? <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>{v.description}</Text> : null}
                          </View>
                          <Pressable style={[styles.previewBtn, { backgroundColor: isPreviewing ? colors.accent + "20" : colors.muted }]}
                            onPress={() => previewKokoroVoice(v)} hitSlop={8}>
                            <Ionicons name={isPreviewing ? "stop-circle-outline" : "play-outline"} size={16} color={isPreviewing ? colors.accent : colors.mutedForeground} />
                            <Text style={[styles.previewText, { color: isPreviewing ? colors.accent : colors.mutedForeground }]}>{isPreviewing ? "Stop" : "Try"}</Text>
                          </Pressable>
                        </Pressable>
                      );
                    })
                  )}
                </View>
              )}
            </View>
          )}

          {/* ElevenLabs voices — compact dropdown */}
          {ttsProvider === "elevenlabs" && (
            <View style={[styles.row, { borderBottomColor: colors.border, flexDirection: "column", alignItems: "stretch", gap: 0, paddingBottom: 0 }]}>
              <Pressable
                style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 16 }}
                onPress={() => {
                  const next = !voiceDropdownOpen;
                  setVoiceDropdownOpen(next);
                  if (next && elVoices.length === 0) loadElVoices();
                  Haptics.selectionAsync();
                }}
              >
                <Ionicons name="mic-circle-outline" size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: colors.foreground }]}>ElevenLabs Voice</Text>
                  <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>
                    {elVoices.find((v) => v.id === elVoiceId)?.name ?? "Select a voice"}
                  </Text>
                </View>
                <Ionicons name={voiceDropdownOpen ? "chevron-up" : "chevron-down"} size={14} color={colors.mutedForeground} />
              </Pressable>

              {voiceDropdownOpen && (
                <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                  {loadingElVoices ? (
                    <View style={{ padding: 16, alignItems: "center" }}>
                      <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>Loading voices…</Text>
                    </View>
                  ) : elVoices.length === 0 ? (
                    <View style={{ padding: 16 }}>
                      <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>Could not load voices. Check API key.</Text>
                    </View>
                  ) : (
                    elVoices.map((v, i) => {
                      const isSelected = elVoiceId === v.id;
                      const isPreviewing = previewingElId === v.id;
                      return (
                        <Pressable key={v.id}
                          style={[styles.voiceRow, {
                            borderBottomColor: i < elVoices.length - 1 ? colors.border : "transparent",
                            backgroundColor: isSelected ? colors.primary + "10" : "transparent",
                            paddingLeft: 20,
                          }]}
                          onPress={() => { setElVoiceId(v.id); setVoiceDropdownOpen(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
                          <View style={[styles.voiceRadio, { borderColor: isSelected ? colors.primary : colors.border, backgroundColor: isSelected ? colors.primary : "transparent" }]}>
                            {isSelected && <View style={styles.voiceRadioDot} />}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.rowLabel, { color: colors.foreground }]}>{v.name}</Text>
                            {v.description ? <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>{v.description}</Text> : null}
                          </View>
                          <Pressable style={[styles.previewBtn, { backgroundColor: isPreviewing ? colors.accent + "20" : colors.muted }]}
                            onPress={() => previewElVoice(v)} hitSlop={8}>
                            <Ionicons name={isPreviewing ? "stop-circle-outline" : "play-outline"} size={16} color={isPreviewing ? colors.accent : colors.mutedForeground} />
                            <Text style={[styles.previewText, { color: isPreviewing ? colors.accent : colors.mutedForeground }]}>{isPreviewing ? "Stop" : "Try"}</Text>
                          </Pressable>
                        </Pressable>
                      );
                    })
                  )}
                </View>
              )}
            </View>
          )}

          {/* Phone TTS voices */}
          {ttsProvider === "phone" && (
            <>
              <Pressable style={[styles.voiceRow, { borderBottomColor: colors.border }]} onPress={() => selectPhoneVoice(null)}>
                <View style={[styles.voiceRadio, { borderColor: !phoneVoiceId ? colors.primary : colors.border, backgroundColor: !phoneVoiceId ? colors.primary : "transparent" }]}>
                  {!phoneVoiceId && <View style={styles.voiceRadioDot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: colors.foreground }]}>System Default</Text>
                  <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>Device default TTS voice</Text>
                </View>
              </Pressable>

              {loadingPhoneVoices ? (
                <View style={[styles.row, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>Loading device voices…</Text>
                </View>
              ) : phoneVoices.length === 0 ? (
                <View style={[styles.row, { borderBottomColor: colors.border, flexDirection: "column", alignItems: "flex-start", gap: 4 }]}>
                  <Text style={[styles.rowLabel, { color: colors.foreground }]}>No specific voices detected</Text>
                  <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>
                    Phone TTS will still speak using your device's default voice — this is normal and does not require internet. To install more voices, go to Android Settings → General Management → Language &amp; Input → Text-to-speech.
                  </Text>
                </View>
              ) : (
                phoneVoices.slice(0, visiblePhoneVoiceCount).map((v) => {
                  const isSelected = phoneVoiceId === v.identifier;
                  const isPreviewing = previewingPhoneId === v.identifier;
                  const qualityLabel = v.quality === Speech.VoiceQuality.Enhanced ? "Enhanced" : "";
                  return (
                    <Pressable key={v.identifier}
                      style={[styles.voiceRow, { borderBottomColor: colors.border, backgroundColor: isSelected ? colors.primary + "08" : "transparent" }]}
                      onPress={() => selectPhoneVoice(v)}>
                      <View style={[styles.voiceRadio, { borderColor: isSelected ? colors.primary : colors.border, backgroundColor: isSelected ? colors.primary : "transparent" }]}>
                        {isSelected && <View style={styles.voiceRadioDot} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text style={[styles.rowLabel, { color: colors.foreground }]}>{v.name ?? v.identifier}</Text>
                          {qualityLabel ? (
                            <View style={[styles.qualityBadge, { backgroundColor: colors.accent + "20" }]}>
                              <Text style={[styles.qualityText, { color: colors.accent }]}>{qualityLabel}</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>{v.language}</Text>
                      </View>
                      <Pressable style={[styles.previewBtn, { backgroundColor: isPreviewing ? colors.accent + "20" : colors.muted }]}
                        onPress={() => previewPhoneVoice(v)} hitSlop={8}>
                        <Ionicons name={isPreviewing ? "stop-circle-outline" : "play-outline"} size={16} color={isPreviewing ? colors.accent : colors.mutedForeground} />
                        <Text style={[styles.previewText, { color: isPreviewing ? colors.accent : colors.mutedForeground }]}>{isPreviewing ? "Stop" : "Try"}</Text>
                      </Pressable>
                    </Pressable>
                  );
                })
              )}
              {!loadingPhoneVoices && phoneVoices.length > visiblePhoneVoiceCount && (
                <Pressable style={[styles.row, { borderBottomColor: colors.border }]}
                  onPress={() => setVisiblePhoneVoiceCount((count) => count + 12)}>
                  <Text style={[styles.rowLabel, { color: colors.primary }]}>Show more voices ({phoneVoices.length - visiblePhoneVoiceCount} remaining)</Text>
                </Pressable>
              )}
            </>
          )}
        </Section>

        </>)}
        {active === "floating" && (<>
        {/* ── Floating Bubble ── */}
        <Section title="Floating Bubble">
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <Ionicons name="radio-button-on-outline" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>Floating Mic Button</Text>
              <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>
                Shows a draggable mic button that floats over every screen. Tap it for quick commands — no need to open the app.
              </Text>
            </View>
            <Switch
              value={floatingBubbleEnabled}
              onValueChange={async (v) => {
                await setFloatingBubbleEnabled(v);
                Haptics.selectionAsync();
              }}
              trackColor={{ false: colors.muted, true: colors.primary + "80" }}
              thumbColor={floatingBubbleEnabled ? colors.primary : colors.mutedForeground}
            />
          </View>
          {floatingBubbleEnabled && (
            <View style={[styles.row, { borderBottomColor: "transparent" }]}>
              <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
              <Text style={[styles.rowValue, { color: colors.accent, flex: 1 }]}>
                Drag it anywhere on screen. Long-press to see quick commands: search, flashlight, music, and more.
              </Text>
            </View>
          )}
        </Section>

        </>)}
        {active === "wake" && (<>
        {/* ── Hands-Free ── */}
        <Section title="Hands-Free">
          <WakeWordSettings />
        </Section>
        </>)}
        {active === "assistant" && (<>
        <Section title="Assistant quality">
          <AssistantQualitySettings getApiBase={qualityApiBase} deviceId={deviceId} />
        </Section>

        </>)}
        {active === "messages" && (<>
        {/* ── Privacy & Context ── */}
        <Section title="Privacy & Context">
          {/* Master toggle */}
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>Send Context to AI</Text>
              <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>
                Lets {assistantName} see your device state (battery, recent notification, media) when answering. Nothing leaves the device without your control.
              </Text>
            </View>
            <Switch
              value={contextEnabled}
              onValueChange={async (v) => { await setContextEnabled(v); Haptics.selectionAsync(); }}
              trackColor={{ false: colors.muted, true: colors.primary + "80" }}
              thumbColor={contextEnabled ? colors.primary : colors.mutedForeground}
            />
          </View>

          {/* Per-source toggles — only shown when master is on */}
          {contextEnabled && (
            <>
              {[
                { label: "Battery level", desc: "Share battery % and charging state.", value: contextBattery, set: setContextBattery, icon: "battery-half-outline" },
                { label: "Recent notification", desc: "Share the latest notification summary.", value: contextNotifications, set: setContextNotifications, icon: "notifications-outline" },
                { label: "Media playback", desc: "Share currently playing track.", value: contextMedia, set: setContextMedia, icon: "musical-notes-outline" },
                { label: "Screen text (Accessibility)", desc: "Share visible screen text from the active app. Requires Accessibility Service.", value: contextScreen, set: setContextScreen, icon: "eye-outline" },
                { label: "Location (city)", desc: "Share approximate city/region for weather context. Requires location permission.", value: contextLocation, set: setContextLocation, icon: "location-outline" },
              ].map(({ label, desc, value, set, icon }) => (
                <View key={label} style={[styles.row, { borderBottomColor: colors.border }]}>
                  <Ionicons name={icon as "mic"} size={16} color={colors.mutedForeground} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
                    <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>{desc}</Text>
                  </View>
                  <Switch
                    value={value}
                    onValueChange={async (v) => { await set(v); Haptics.selectionAsync(); }}
                    trackColor={{ false: colors.muted, true: colors.primary + "80" }}
                    thumbColor={value ? colors.primary : colors.mutedForeground}
                  />
                </View>
              ))}
              <View style={[styles.row, { borderBottomColor: "transparent" }]}>
                <Ionicons name="information-circle-outline" size={14} color={colors.accent} />
                <Text style={[styles.rowValue, { color: colors.accent, flex: 1 }]}>
                  Context is sent only with your messages — never in the background. You can disable any source at any time.
                </Text>
              </View>
            </>
          )}
        </Section>

        </>)}
        {active === "offline" && (<>
        {/* ── Offline models ── */}
        <Section title="Offline Models">
          <OfflineModelsSection colors={colors} />
        </Section>

        </>)}
        {active === "messages" && (<>
        {/* ── Notifications ── */}
        <Section title="Notifications">
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <Ionicons name="volume-medium-outline" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>Read Incoming Messages</Text>
              <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>
                Speak incoming messages aloud using notification access, or Accessibility Service fallback on devices where Notification Access is unavailable.
              </Text>
            </View>
            <Switch
              value={readIncomingEnabled}
              onValueChange={async (v) => {
                await setReadIncomingEnabled(v);
                Haptics.selectionAsync();
              }}
              trackColor={{ false: colors.muted, true: colors.primary + "80" }}
              thumbColor={readIncomingEnabled ? colors.primary : colors.mutedForeground}
            />
          </View>
        </Section>

        </>)}
        {active === "assistant" && (<>
        {/* ── Home Screen ── */}
        <Section title="Home Screen">
          {/* Language selector */}
          <View style={[styles.row, { borderBottomColor: colors.border, flexDirection: "column", alignItems: "flex-start", gap: 10 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="language-outline" size={18} color={colors.primary} />
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>Speech Language</Text>
            </View>
            <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>
              Current: {speechLanguage}. Say &quot;switch to Spanish&quot; (or any language) to change.
            </Text>
            <View style={styles.provRow}>
              {[
                { label: "English", code: "en-US" },
                { label: "Spanish", code: "es-ES" },
                { label: "French", code: "fr-FR" },
                { label: "German", code: "de-DE" },
                { label: "Portuguese", code: "pt-BR" },
                { label: "Arabic", code: "ar-SA" },
              ].map(({ label, code }) => {
                const active = speechLanguage === code;
                return (
                  <Pressable key={code}
                    style={[styles.provTab, { backgroundColor: active ? colors.primary : colors.muted, borderColor: active ? colors.primary : colors.border }]}
                    onPress={async () => { await setSpeechLanguage(code); Haptics.selectionAsync(); }}>
                    <Text style={[styles.provTabText, { color: active ? "#fff" : colors.foreground }]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Quick chips editor */}
          <View style={[styles.row, { borderBottomColor: "transparent", flexDirection: "column", alignItems: "flex-start", gap: 10 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.primary} />
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>Quick Chips</Text>
              </View>
              {!editingChips ? (
                <Pressable onPress={() => { setEditingChips(true); setChipsInput(customQuickChips.join("\n")); }}>
                  <Text style={[styles.rowValue, { color: colors.primary }]}>Edit</Text>
                </Pressable>
              ) : (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable onPress={async () => {
                    const chips = chipsInput.split("\n").map((c) => c.trim()).filter(Boolean).slice(0, 6);
                    await setCustomQuickChips(chips.length > 0 ? chips : DEFAULT_QUICK_CHIPS);
                    setEditingChips(false);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  }}>
                    <Text style={[styles.rowValue, { color: colors.primary }]}>Save</Text>
                  </Pressable>
                  <Pressable onPress={() => { setEditingChips(false); setChipsInput(customQuickChips.join("\n")); }}>
                    <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>Cancel</Text>
                  </Pressable>
                </View>
              )}
            </View>
            {editingChips ? (
              <>
                <TextInput
                  style={[styles.nameInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background, height: 120, textAlignVertical: "top", paddingTop: 8 }]}
                  value={chipsInput}
                  onChangeText={setChipsInput}
                  multiline
                  placeholder={"One chip per line (max 6)\nWhat can you do?\nTell me a fun fact"}
                  placeholderTextColor={colors.mutedForeground}
                  autoFocus
                />
                <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>Enter one suggestion per line. Up to 6 chips.</Text>
              </>
            ) : (
              <View style={{ gap: 6 }}>
                {customQuickChips.map((chip, i) => (
                  <View key={i} style={[styles.chipPreview, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                    <Text style={[styles.rowValue, { color: colors.foreground, marginLeft: 0 }]}>{chip}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </Section>

        </>)}
        {active === "account" && (
          <Section title="Account & Cloud">
            <Row icon="cloud-outline" label="Account & cloud sync" value="Sign in to back up and sync across devices. Guest mode keeps everything on this phone." onPress={() => router.push("/account" as Href)} />
          </Section>
        )}
        {active === "permissions" && (<>
        {/* ── Permissions ── */}
        <View style={[styles.alertCard, { marginHorizontal: 16, marginTop: 18, backgroundColor: (permIncomplete.length ? colors.warning : colors.success) + "16", borderColor: (permIncomplete.length ? colors.warning : colors.success) + "50" }]}>
          <Ionicons name={permIncomplete.length ? "list-circle-outline" : "checkmark-circle"} size={20} color={permIncomplete.length ? colors.warning : colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: colors.foreground }]}>
              {Platform.OS !== "android" ? "Device setup is available on Android" : permIncomplete.length ? `${permRequiredGranted} of ${permRequired.length} feature permissions set up` : "All hands-free features set up"}
            </Text>
            <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>
              Basic chat only needs Internet and Microphone. Everything else unlocks a specific feature (calls, reading messages, screen help, floating bubble). Items marked Optional are used by one command only: Device Administrator for "lock my phone", Modify System Settings for brightness control. Tap any item to open its Android screen.
            </Text>
          </View>
        </View>
        <Section title="Permissions & Device Setup">
          {PERMISSIONS.map((perm) => {
            const status = permStatuses[perm.id] ?? "unavailable";
            const canRequest = Platform.OS === "android" && perm.id !== "internet";
            return (
              <Pressable
                key={perm.id}
                testID={`permission-${perm.id}`}
                accessibilityRole="button"
                accessibilityLabel={`${perm.label}, ${status === "granted" ? "granted" : "not granted"}${OPTIONAL_PERMS.includes(perm.id) ? ", optional" : ""}`}
                style={[styles.row, { borderBottomColor: colors.border }]}
                onPress={canRequest ? () => handlePermissionPress(perm.id) : undefined}
                disabled={!canRequest || status === "granted"}
              >
                <Ionicons name={perm.icon as "mic"} size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={[styles.rowLabel, { color: colors.foreground }]}>{perm.label}</Text>
                    {OPTIONAL_PERMS.includes(perm.id) && (
                      <View style={[styles.qualityBadge, { backgroundColor: colors.muted }]}>
                        <Text style={[styles.qualityText, { color: colors.mutedForeground }]}>Optional</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>{perm.description}</Text>
                </View>
                <StatusBadge status={status} colors={colors} />
                {canRequest && status !== "granted" && (
                  <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} />
                )}
              </Pressable>
            );
          })}
        </Section>

        </>)}
        {active === "advanced" && (<>
        {/* ── Build info ── */}
        <Section title="Build">
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <MaterialIcons name="build" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>Current Build</Text>
              <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>Preview APK — Groq + Tavily + ElevenLabs</Text>
            </View>
          </View>
        </Section>

        </>)}
        {active === "assistant" && (<>
        {/* ── Appearance ── */}
        <Section title="Appearance">
          <View style={[styles.row, { borderBottomColor: colors.border, flexDirection: "column", alignItems: "flex-start", gap: 10 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="color-palette-outline" size={18} color={colors.primary} />
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>Theme</Text>
            </View>
            <View style={styles.provRow}>
              <ThemeTab t="system" label="System" icon="phone-portrait-outline" />
              <ThemeTab t="light" label="Light" icon="sunny-outline" />
              <ThemeTab t="dark" label="Dark" icon="moon-outline" />
            </View>
            <Text style={[styles.rowValue, { color: colors.mutedForeground, paddingLeft: 0 }]}>
              {themeOverride === "system" ? "Follows your device's appearance setting." : themeOverride === "dark" ? "Always use dark mode." : "Always use light mode."}
            </Text>
          </View>
        </Section>

        </>)}
        {active === "advanced" && (<>
        {/* ── Advanced ── */}
        <Section title="Advanced">
          {editingApiUrl ? (
            <View style={[styles.row, { borderBottomColor: colors.border, flexDirection: "column", alignItems: "stretch", gap: 8 }]}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>API Server URL</Text>
              <TextInput
                style={[styles.nameInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                value={apiUrlInput}
                onChangeText={setApiUrlInput}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder="https://your-server.example.com/api"
                placeholderTextColor={colors.mutedForeground}
                returnKeyType="done"
                onSubmitEditing={saveApiUrl}
              />
              <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>Leave blank to use the default server.</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable style={[styles.saveBtn, { backgroundColor: colors.primary, flex: 1, borderRadius: 10, alignItems: "center", height: 38, justifyContent: "center" }]} onPress={saveApiUrl}>
                  <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Save</Text>
                </Pressable>
                <Pressable style={[styles.cancelBtn, { borderColor: colors.border, width: 38 }]}
                  onPress={() => { setEditingApiUrl(false); setApiUrlInput(customApiUrl ?? ""); }}>
                  <Feather name="x" size={16} color={colors.foreground} />
                </Pressable>
              </View>
            </View>
          ) : (
            <Row
              icon="globe-outline"
              label="API Server URL"
              value={customApiUrl ? customApiUrl : "Default (built-in)"}
              onPress={() => { setEditingApiUrl(true); setApiUrlInput(customApiUrl ?? ""); }}
            />
          )}
        </Section>

        </>)}
        {active === "advanced" && (<>
        {/* ── Data ── */}
        <Section title="Data">
          <Row icon="share-outline" label="Export chat history" onPress={handleExportHistory} />
          <Row icon="trash-outline" label="Clear all chat history" destructive onPress={handleClearHistory} />
        </Section>
        </>)}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingBottom: 12, paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  subHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  crumb: { fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 1 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 42 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  alertCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  emptyCard: { alignItems: "center", gap: 6, padding: 28, borderRadius: 14, borderWidth: 1, borderStyle: "dashed" },
  destRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  destIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  destLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  section: { paddingHorizontal: 16, marginTop: 22 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 },
  sectionCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rowIconBg: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 14, fontFamily: "Inter_500Medium", marginBottom: 1 },
  rowValue: { fontSize: 12, fontFamily: "Inter_400Regular" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  nameInput: { flex: 1, height: 38, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, fontSize: 15, fontFamily: "Inter_500Medium" },
  saveBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cancelBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  provRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingLeft: 26 },
  provTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  provTabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  speedRow: { flexDirection: "row", gap: 10, paddingLeft: 26 },
  speedBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, alignItems: "center" },
  speedBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  voiceRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 11, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  voiceRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  voiceRadioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" },
  qualityBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  qualityText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  previewBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  previewText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  chipPreview: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
});
