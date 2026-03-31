import { Feather, Ionicons, MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAssistant } from "@/context/AssistantContext";
import { useColors } from "@/hooks/useColors";

interface Permission {
  id: string;
  label: string;
  description: string;
  icon: string;
  status: "granted" | "denied" | "unavailable";
}

const PERMISSIONS: Permission[] = [
  { id: "microphone", label: "Microphone", description: "Voice input and recording", icon: "mic", status: "granted" },
  { id: "internet", label: "Internet", description: "API calls to Groq / Tavily", icon: "globe-outline", status: "granted" },
  { id: "camera", label: "Camera / Flashlight", description: "Flashlight control", icon: "flashlight-outline", status: "unavailable" },
  { id: "accessibility", label: "Accessibility Service", description: "Read WhatsApp & SMS messages", icon: "eye-outline", status: "unavailable" },
  { id: "device_admin", label: "Device Administrator", description: "Lock phone via voice", icon: "shield-outline", status: "unavailable" },
  { id: "write_settings", label: "Write Settings", description: "Control screen brightness", icon: "sunny-outline", status: "unavailable" },
  { id: "bluetooth", label: "Bluetooth", description: "Toggle Bluetooth via voice", icon: "bluetooth", status: "unavailable" },
];

const SPEED_OPTIONS = [
  { label: "Slow", value: 0.7 },
  { label: "Normal", value: 0.9 },
  { label: "Fast", value: 1.15 },
];

function StatusBadge({ status, colors }: { status: Permission["status"]; colors: ReturnType<typeof useColors> }) {
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
    voiceId, setVoiceId,
    speechRate, setSpeechRate,
  } = useAssistant();

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(assistantName);
  const [voices, setVoices] = useState<Speech.Voice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    loadVoices();
  }, []);

  async function loadVoices() {
    try {
      const all = await Speech.getAvailableVoicesAsync();
      const english = all
        .filter((v) => v.language?.startsWith("en"))
        .sort((a, b) => {
          const qa = (a.quality ?? 0);
          const qb = (b.quality ?? 0);
          if (qb !== qa) return qb - qa;
          return (a.name ?? "").localeCompare(b.name ?? "");
        });
      setVoices(english);
    } catch {
      setVoices([]);
    } finally {
      setLoadingVoices(false);
    }
  }

  async function saveName() {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed.length < 2) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await setAssistantName(trimmed);
    setEditingName(false);
  }

  function handleClearHistory() {
    const doIt = () => { clearAllConversations(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); };
    if (Platform.OS === "web") {
      doIt();
    } else {
      Alert.alert("Clear all history", `Delete all ${conversations.length} conversation(s)?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Clear", style: "destructive", onPress: doIt },
      ]);
    }
  }

  async function previewVoice(v: Speech.Voice) {
    if (previewingId === v.identifier) {
      Speech.stop();
      setPreviewingId(null);
      return;
    }
    setPreviewingId(v.identifier);
    Haptics.selectionAsync();
    Speech.speak(`Hi, I'm ${assistantName}. This is how I sound with this voice.`, {
      voice: v.identifier,
      language: v.language,
      rate: speechRate,
      pitch: 1.05,
      onDone: () => setPreviewingId(null),
      onError: () => setPreviewingId(null),
      onStopped: () => setPreviewingId(null),
    });
  }

  async function selectVoice(v: Speech.Voice | null) {
    Speech.stop();
    setPreviewingId(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await setVoiceId(v?.identifier ?? null);
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

  const selectedVoice = voices.find((v) => v.identifier === voiceId);

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
                value={nameInput}
                onChangeText={setNameInput}
                autoFocus
                maxLength={24}
                returnKeyType="done"
                onSubmitEditing={saveName}
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
            <Row icon="person-circle-outline" label="Name" value={assistantName} onPress={() => { setEditingName(true); setNameInput(assistantName); }} />
          )}
          <Row icon="chatbubbles-outline" label="Conversations" value={`${conversations.length} saved`} />
          <Row icon="cube-outline" label="AI Model" value="Groq — LLaMA 3.3 70B Versatile" />
          <Row icon="globe-outline" label="Search Engine" value="Tavily Web Search" />
        </Section>

        {/* ── Voice ── */}
        <Section title="Voice">

          {/* Speed */}
          <View style={[styles.row, { borderBottomColor: colors.border, flexDirection: "column", alignItems: "flex-start", gap: 10 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="speedometer-outline" size={18} color={colors.primary} />
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>Speaking Speed</Text>
            </View>
            <View style={styles.speedRow}>
              {SPEED_OPTIONS.map((opt) => {
                const active = Math.abs(speechRate - opt.value) < 0.05;
                return (
                  <Pressable
                    key={opt.label}
                    style={[styles.speedBtn, { backgroundColor: active ? colors.primary : colors.muted, borderColor: active ? colors.primary : colors.border }]}
                    onPress={async () => { await setSpeechRate(opt.value); Haptics.selectionAsync(); }}
                  >
                    <Text style={[styles.speedBtnText, { color: active ? "#fff" : colors.foreground }]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Voice default */}
          <Pressable
            style={[styles.row, { borderBottomColor: colors.border }]}
            onPress={() => selectVoice(null)}
          >
            <View style={[styles.voiceRadio, {
              borderColor: !voiceId ? colors.primary : colors.border,
              backgroundColor: !voiceId ? colors.primary : "transparent",
            }]}>
              {!voiceId && <View style={styles.voiceRadioDot} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>System Default</Text>
              <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>Device default TTS voice</Text>
            </View>
          </Pressable>

          {/* Voice list */}
          {loadingVoices ? (
            <View style={[styles.row, { borderBottomColor: colors.border }]}>
              <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>Loading available voices…</Text>
            </View>
          ) : voices.length === 0 ? (
            <View style={[styles.row, { borderBottomColor: colors.border }]}>
              <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>No English voices found on this device.</Text>
            </View>
          ) : (
            voices.map((v) => {
              const isSelected = voiceId === v.identifier;
              const isPreviewing = previewingId === v.identifier;
              const qualityLabel = v.quality === Speech.VoiceQuality.Enhanced ? "Enhanced" : v.quality === Speech.VoiceQuality.Default ? "" : "";
              return (
                <Pressable
                  key={v.identifier}
                  style={[styles.voiceRow, { borderBottomColor: colors.border, backgroundColor: isSelected ? colors.primary + "08" : "transparent" }]}
                  onPress={() => selectVoice(v)}
                >
                  <View style={[styles.voiceRadio, {
                    borderColor: isSelected ? colors.primary : colors.border,
                    backgroundColor: isSelected ? colors.primary : "transparent",
                  }]}>
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
                  <Pressable
                    style={[styles.previewBtn, { backgroundColor: isPreviewing ? colors.accent + "20" : colors.muted }]}
                    onPress={() => previewVoice(v)}
                    hitSlop={8}
                  >
                    <Ionicons
                      name={isPreviewing ? "stop-circle-outline" : "play-outline"}
                      size={16}
                      color={isPreviewing ? colors.accent : colors.mutedForeground}
                    />
                    <Text style={[styles.previewText, { color: isPreviewing ? colors.accent : colors.mutedForeground }]}>
                      {isPreviewing ? "Stop" : "Try"}
                    </Text>
                  </Pressable>
                </Pressable>
              );
            })
          )}

          {voices.length > 0 && (
            <View style={[styles.row, { borderBottomColor: colors.border }]}>
              <Ionicons name="information-circle-outline" size={15} color={colors.mutedForeground} />
              <Text style={[styles.rowValue, { color: colors.mutedForeground, flex: 1 }]}>
                Tap a voice to select it. Tap Try to hear a preview. More voices can be installed in your device's Text-to-Speech settings.
              </Text>
            </View>
          )}
        </Section>

        {/* ── Permissions ── */}
        <Section title="Permissions">
          {PERMISSIONS.map((perm) => (
            <View key={perm.id} style={[styles.row, { borderBottomColor: colors.border }]}>
              <Ionicons name={perm.icon as "mic"} size={18} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>{perm.label}</Text>
                <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>{perm.description}</Text>
              </View>
              <StatusBadge status={perm.status} colors={colors} />
            </View>
          ))}
        </Section>

        {/* ── Build info ── */}
        <Section title="Build">
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <MaterialIcons name="build" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>Current Build</Text>
              <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>Preview APK — Groq + Tavily enabled</Text>
            </View>
          </View>
        </Section>

        {/* ── Data ── */}
        <Section title="Data">
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
