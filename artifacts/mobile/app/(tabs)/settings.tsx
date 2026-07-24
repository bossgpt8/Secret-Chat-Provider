import { Feather, Ionicons, MaterialIcons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import { useCameraPermissions } from "expo-camera";
import * as Contacts from "expo-contacts";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import { fetch } from "expo/fetch";
import React, { useEffect, useState } from "react";
import {
  Alert,
  AppState,
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
  { id: "device_admin", label: "Device Administrator", description: "Lock phone via voice", icon: "shield-outline" },
  { id: "write_settings", label: "Modify System Settings", description: "Control screen brightness & audio", icon: "settings-outline" },
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

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    assistantName, setAssistantName,
    conversations, clearAllConversations,
    phoneVoiceId, setPhoneVoiceId,
    elVoiceId, setElVoiceId,
    kokoroVoiceId, setKokoroVoiceId,
    speechRate, setSpeechRate,
    ttsProvider, setTtsProvider,
    themeOverride, setThemeOverride,
    customApiUrl, setCustomApiUrl,
    readIncomingEnabled, setReadIncomingEnabled,
    wakeWordEnabled, setWakeWordEnabled,
    floatingBubbleEnabled, setFloatingBubbleEnabled,
    customQuickChips, setCustomQuickChips,
    speechLanguage, setSpeechLanguage,
  } = useAssistant();

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(assistantName);

  const [phoneVoices, setPhoneVoices] = useState<Speech.Voice[]>([]);
  const [loadingPhoneVoices, setLoadingPhoneVoices] = useState(true);

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

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    loadPhoneVoices();
    refreshPermissions();
  }, []);

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
    try {
      const all = await Speech.getAvailableVoicesAsync();
      const english = all
        .filter((v) => v.language?.startsWith("en"))
        .sort((a, b) => {
          const qA = a.quality === Speech.VoiceQuality.Enhanced ? 1 : 0;
          const qB = b.quality === Speech.VoiceQuality.Enhanced ? 1 : 0;
          return (qB - qA) || (a.name ?? "").localeCompare(b.name ?? "");
        });
      if (english.length === 0 && attempt < 3) {
        // Android TTS engine sometimes needs a moment to initialize — retry
        setTimeout(() => loadPhoneVoices(attempt + 1), 1500);
        return;
      }
      setPhoneVoices(english);
    } catch {
      if (attempt < 3) {
        setTimeout(() => loadPhoneVoices(attempt + 1), 1500);
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
    return "https://secret-chat-provider--b-oss.replit.app/api/";
  }

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
    if (previewingKokoroId === v.id) { setPreviewingKokoroId(null); return; }
    setPreviewingKokoroId(v.id);
    Haptics.selectionAsync();
    try {
      const base = resolveBase();
      const resp = await fetch(`${base}tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `Hi, I'm ${assistantName}. This is the ${v.name} voice.`, provider: "kokoro", voiceId: v.id }),
      });
      if (resp.ok) {
        const { Audio } = await import("expo-av");
        const arrayBuffer = await resp.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(...Array.from(bytes.slice(i, i + chunkSize)));
        }
        const base64 = btoa(binary);
        const { sound } = await Audio.Sound.createAsync(
          { uri: `data:audio/mpeg;base64,${base64}` },
          { shouldPlay: true }
        );
        sound.setOnPlaybackStatusUpdate((s) => {
          if (s.isLoaded && s.didJustFinish) { setPreviewingKokoroId(null); sound.unloadAsync().catch(() => {}); }
        });
      } else { setPreviewingKokoroId(null); }
    } catch { setPreviewingKokoroId(null); }
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
        await NativeScreenLock.requestAdmin();
      } else if (permId === "write_settings") {
        await NativeSystemPermissions.requestWriteSettingsPermission();
      } else if (permId === "overlay") {
        await NativeSystemPermissions.requestOverlayPermission();
      } else if (permId === "battery_optimization") {
        await NativeAccessibility.requestIgnoreBatteryOptimization();
      }
    } catch { /* ignore */ }
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
    if (previewingElId === v.id) {
      setPreviewingElId(null); return;
    }
    setPreviewingElId(v.id);
    Haptics.selectionAsync();
    try {
      const envUrl = process.env.EXPO_PUBLIC_API_URL;
      const resolvedBase = customApiUrl?.trim()
        ? (customApiUrl.trim().endsWith("/") ? customApiUrl.trim() : `${customApiUrl.trim()}/`)
        : envUrl
          ? (envUrl.endsWith("/") ? envUrl : `${envUrl}/`)
          : Platform.OS === "web"
            ? "/api/"
            : "https://secret-chat-provider--b-oss.replit.app/api/";
      const resp = await fetch(`${resolvedBase}tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `Hi, I'm ${assistantName}. This is the ${v.name} voice from ElevenLabs.`, voiceId: v.id }),
      });
      if (resp.ok) {
        const { Audio } = await import("expo-av");
        const arrayBuffer = await resp.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(...Array.from(bytes.slice(i, i + chunkSize)));
        }
        const base64 = btoa(binary);
        const { sound } = await Audio.Sound.createAsync(
          { uri: `data:audio/mpeg;base64,${base64}` },
          { shouldPlay: true }
        );
        sound.setOnPlaybackStatusUpdate((s) => {
          if (s.isLoaded && s.didJustFinish) { setPreviewingElId(null); sound.unloadAsync().catch(() => {}); }
        });
      } else { setPreviewingElId(null); }
    } catch { setPreviewingElId(null); }
  }

  function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{title}</Text>
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {children}
        </View>
      </View>
    );
  }

  function Row({ icon, label, value, onPress, destructive, children }: {
    icon?: string; label: string; value?: string; onPress?: () => void; destructive?: boolean; children?: React.ReactNode;
  }) {
    return (
      <Pressable style={[styles.row, { borderBottomColor: colors.border }]} onPress={onPress} disabled={!onPress}>
        {icon && (
          <View style={[styles.rowIconBg, { backgroundColor: destructive ? colors.destructive + "18" : colors.primary + "15" }]}>
            <Ionicons name={icon as "mic"} size={16} color={destructive ? colors.destructive : colors.primary} />
          </View>
        )}
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
    const active = ttsProvider === p;
    return (
      <Pressable
        style={[styles.provTab, { backgroundColor: active ? colors.primary : colors.muted, borderColor: active ? colors.primary : colors.border }]}
        onPress={async () => { await setTtsProvider(p); Haptics.selectionAsync(); }}
      >
        <Ionicons name={icon as "mic"} size={14} color={active ? "#fff" : colors.mutedForeground} />
        <Text style={[styles.provTabText, { color: active ? "#fff" : colors.foreground }]}>{label}</Text>
      </Pressable>
    );
  }

  function ThemeTab({ t, label, icon }: { t: ThemeOverride; label: string; icon: string }) {
    const active = themeOverride === t;
    return (
      <Pressable
        style={[styles.provTab, { backgroundColor: active ? colors.primary : colors.muted, borderColor: active ? colors.primary : colors.border }]}
        onPress={async () => { await setThemeOverride(t); Haptics.selectionAsync(); }}
      >
        <Ionicons name={icon as "mic"} size={14} color={active ? "#fff" : colors.mutedForeground} />
        <Text style={[styles.provTabText, { color: active ? "#fff" : colors.foreground }]}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: bottomPad + 80 }} showsVerticalScrollIndicator={false}>

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

        {/* ── Voice ── */}
        <Section title="Voice">
          {/* Provider selector */}
          <View style={[styles.row, { borderBottomColor: colors.border, flexDirection: "column", alignItems: "flex-start", gap: 10 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="mic-circle-outline" size={18} color={colors.primary} />
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>Voice Engine</Text>
            </View>
            <View style={styles.provRow}>
              <ProviderTab p="kokoro" label="Kokoro" icon="server-outline" />
              <ProviderTab p="elevenlabs" label="ElevenLabs" icon="sparkles" />
              <ProviderTab p="phone" label="Phone" icon="phone-portrait-outline" />
            </View>
            <Text style={[styles.rowValue, { color: colors.mutedForeground, paddingLeft: 0 }]}>
              {ttsProvider === "kokoro"
                ? "Self-hosted Kokoro AI voices — unlimited & free. Runs on your own server."
                : ttsProvider === "elevenlabs"
                ? "High-quality AI voices via ElevenLabs. Phone TTS used as fallback."
                : "Uses your device's built-in text-to-speech engine."}
            </Text>
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
                phoneVoices.map((v) => {
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
            </>
          )}
        </Section>

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

        {/* ── Hands-Free ── */}
        <Section title="Hands-Free">
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <Ionicons name="ear-outline" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>
                {`"Hey ${assistantName}" Wake Word`}
              </Text>
              <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>
                Listens continuously and activates when it hears your name. Works while the app is open. Requires microphone.
              </Text>
            </View>
            <Switch
              value={wakeWordEnabled}
              onValueChange={async (v) => {
                await setWakeWordEnabled(v);
                Haptics.selectionAsync();
              }}
              trackColor={{ false: colors.muted, true: colors.primary + "80" }}
              thumbColor={wakeWordEnabled ? colors.primary : colors.mutedForeground}
            />
          </View>
          {wakeWordEnabled && (
            <View style={[styles.row, { borderBottomColor: "transparent" }]}>
              <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
              <Text style={[styles.rowValue, { color: colors.accent, flex: 1 }]}>
                Active while app is open or minimized. For fully background listening (screen off), grant Battery Optimization exemption in Permissions below.
              </Text>
            </View>
          )}
        </Section>

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

        {/* ── Permissions ── */}
        <Section title="Permissions">
          {PERMISSIONS.map((perm) => {
            const status = permStatuses[perm.id] ?? "unavailable";
            const canRequest = Platform.OS === "android" && perm.id !== "internet";
            return (
              <Pressable
                key={perm.id}
                style={[styles.row, { borderBottomColor: colors.border }]}
                onPress={canRequest ? () => handlePermissionPress(perm.id) : undefined}
                disabled={!canRequest || status === "granted"}
              >
                <Ionicons name={perm.icon as "mic"} size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: colors.foreground }]}>{perm.label}</Text>
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

        {/* ── Data ── */}
        <Section title="Data">
          <Row icon="share-outline" label="Export chat history" onPress={handleExportHistory} />
          <Row icon="trash-outline" label="Clear all chat history" destructive onPress={handleClearHistory} />
        </Section>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingBottom: 12, paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth },
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
