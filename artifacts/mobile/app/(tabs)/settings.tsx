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
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAssistant, type TtsProvider, type ThemeOverride } from "@/context/AssistantContext";
import { useColors } from "@/hooks/useColors";
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
  { id: "accessibility", label: "Accessibility Service", description: "Read WhatsApp & SMS messages", icon: "eye-outline" },
  { id: "device_admin", label: "Device Administrator", description: "Lock phone via voice", icon: "shield-outline" },
  { id: "write_settings", label: "Modify System Settings", description: "Control screen brightness & audio", icon: "settings-outline" },
  { id: "overlay", label: "Display Over Other Apps", description: "Show assistant overlay on top of apps", icon: "layers-outline" },
];

const DEFAULT_PERM_STATUSES: Record<string, PermStatus> = {
  microphone: "unavailable",
  internet: "granted",
  camera: "unavailable",
  contacts: "unavailable",
  accessibility: "unavailable",
  device_admin: "unavailable",
  write_settings: "unavailable",
  overlay: "unavailable",
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
    speechRate, setSpeechRate,
    ttsProvider, setTtsProvider,
    themeOverride, setThemeOverride,
    customApiUrl, setCustomApiUrl,
  } = useAssistant();

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(assistantName);

  const [phoneVoices, setPhoneVoices] = useState<Speech.Voice[]>([]);
  const [loadingPhoneVoices, setLoadingPhoneVoices] = useState(true);

  const [editingApiUrl, setEditingApiUrl] = useState(false);
  const [apiUrlInput, setApiUrlInput] = useState(customApiUrl ?? "");
  const [previewingPhoneId, setPreviewingPhoneId] = useState<string | null>(null);

  const [elVoices, setElVoices] = useState<ElVoice[]>([]);

  const [permStatuses, setPermStatuses] = useState<Record<string, PermStatus>>(DEFAULT_PERM_STATUSES);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [loadingElVoices, setLoadingElVoices] = useState(true);
  const [previewingElId, setPreviewingElId] = useState<string | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    loadPhoneVoices();
    loadElVoices();
    refreshPermissions();
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

    // Notification listener / Accessibility
    try {
      if (NativeNotifications.isAvailable) {
        const granted = await NativeNotifications.hasPermission();
        updates.accessibility = granted ? "granted" : "unavailable";
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

    setPermStatuses((prev) => ({ ...prev, ...updates }));
  }

  async function loadPhoneVoices() {
    try {
      const all = await Speech.getAvailableVoicesAsync();
      const english = all
        .filter((v) => v.language?.startsWith("en"))
        .sort((a, b) => {
          const qA = a.quality === Speech.VoiceQuality.Enhanced ? 1 : 0;
          const qB = b.quality === Speech.VoiceQuality.Enhanced ? 1 : 0;
          return (qB - qA) || (a.name ?? "").localeCompare(b.name ?? "");
        });
      setPhoneVoices(english);
    } catch { setPhoneVoices([]); }
    finally { setLoadingPhoneVoices(false); }
  }

  async function loadElVoices() {
    try {
      const envUrl = process.env.EXPO_PUBLIC_API_URL;
      const base = envUrl ? (envUrl.endsWith("/") ? envUrl : `${envUrl}/`) : "/api/";
      const r = await fetch(`${base}tts/voices`);
      if (r.ok) {
        const data = await r.json() as { voices: ElVoice[] };
        setElVoices(data.voices ?? []);
      }
    } catch { setElVoices([]); }
    finally { setLoadingElVoices(false); }
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
        await requestCameraPermission?.();
      } else if (permId === "contacts") {
        await Contacts.requestPermissionsAsync();
      } else if (permId === "accessibility") {
        await NativeNotifications.requestPermission();
      } else if (permId === "device_admin") {
        await NativeScreenLock.requestAdmin();
      } else if (permId === "write_settings") {
        await NativeSystemPermissions.requestWriteSettingsPermission();
      } else if (permId === "overlay") {
        await NativeSystemPermissions.requestOverlayPermission();
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
      const base = envUrl ? (envUrl.endsWith("/") ? envUrl : `${envUrl}/`) : "/api/";
      const resp = await fetch(`${base}tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `Hi, I'm ${assistantName}. This is the ${v.name} voice from ElevenLabs.`, voiceId: v.id }),
      });
      if (resp.ok) {
        const { Audio } = await import("expo-av");
        const blob = await resp.blob();
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onloadend = () => { const r = reader.result as string; resolve(r.split(",")[1] ?? ""); };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
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
        {icon && <Ionicons name={icon as "mic"} size={18} color={destructive ? colors.destructive : colors.primary} />}
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
              <ProviderTab p="elevenlabs" label="ElevenLabs" icon="sparkles" />
              <ProviderTab p="phone" label="Phone TTS" icon="phone-portrait-outline" />
            </View>
            <Text style={[styles.rowValue, { color: colors.mutedForeground, paddingLeft: 0 }]}>
              {ttsProvider === "elevenlabs"
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

          {/* ElevenLabs voices */}
          {ttsProvider === "elevenlabs" && (
            <>
              {loadingElVoices ? (
                <View style={[styles.row, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>Loading ElevenLabs voices…</Text>
                </View>
              ) : elVoices.length === 0 ? (
                <View style={[styles.row, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>Could not load voices. Check your API key.</Text>
                </View>
              ) : (
                elVoices.map((v) => {
                  const isSelected = elVoiceId === v.id;
                  const isPreviewing = previewingElId === v.id;
                  return (
                    <Pressable key={v.id}
                      style={[styles.voiceRow, { borderBottomColor: colors.border, backgroundColor: isSelected ? colors.primary + "08" : "transparent" }]}
                      onPress={() => { setElVoiceId(v.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
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
            </>
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
                <View style={[styles.row, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>No English voices found on this device.</Text>
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
  rowLabel: { fontSize: 14, fontFamily: "Inter_500Medium", marginBottom: 1 },
  rowValue: { fontSize: 12, fontFamily: "Inter_400Regular" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  nameInput: { flex: 1, height: 38, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, fontSize: 15, fontFamily: "Inter_500Medium" },
  saveBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cancelBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  provRow: { flexDirection: "row", gap: 10, paddingLeft: 26 },
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
});
