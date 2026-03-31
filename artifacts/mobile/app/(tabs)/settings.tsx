import { Feather, Ionicons, MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAssistant } from "@/context/AssistantContext";
import { useColors } from "@/hooks/useColors";

interface Permission {
  id: string;
  label: string;
  description: string;
  icon: string;
  status: "granted" | "denied" | "unavailable";
  requiresDevBuild?: boolean;
}

const PERMISSIONS: Permission[] = [
  { id: "microphone", label: "Microphone", description: "Voice input and recording", icon: "mic", status: "granted" },
  { id: "internet", label: "Internet", description: "API calls to LLaMA / OpenRouter", icon: "globe-outline", status: "granted" },
  { id: "camera", label: "Camera / Flashlight", description: "Flashlight control", icon: "flashlight-outline", status: "unavailable", requiresDevBuild: true },
  { id: "accessibility", label: "Accessibility Service", description: "Read WhatsApp & SMS messages", icon: "eye-outline", status: "unavailable", requiresDevBuild: true },
  { id: "device_admin", label: "Device Administrator", description: "Lock phone via voice", icon: "shield-outline", status: "unavailable", requiresDevBuild: true },
  { id: "write_settings", label: "Write Settings", description: "Control screen brightness", icon: "sunny-outline", status: "unavailable", requiresDevBuild: true },
  { id: "bluetooth", label: "Bluetooth", description: "Toggle Bluetooth via voice", icon: "bluetooth", status: "unavailable", requiresDevBuild: true },
];

function StatusBadge({ status, colors }: { status: Permission["status"]; colors: ReturnType<typeof useColors> }) {
  const map = {
    granted: { bg: colors.success + "20", text: colors.success, label: "Granted" },
    denied: { bg: colors.destructive + "20", text: colors.destructive, label: "Denied" },
    unavailable: { bg: colors.warning + "20", text: colors.warning, label: "Dev build" },
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
  const { assistantName, setAssistantName, conversations, clearAllConversations } = useAssistant();
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(assistantName);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: bottomPad + 80 }} showsVerticalScrollIndicator={false}>
        {/* Assistant */}
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
          <Row icon="cube-outline" label="AI Model" value="LLaMA 3.3 70B Versatile" />
          <Row icon="globe-outline" label="Search Engine" value="LLaMA 3.3 Online" />
        </Section>

        {/* Permissions */}
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

        {/* Build info */}
        <Section title="Build">
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <MaterialIcons name="build" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>Current Build</Text>
              <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>Expo Go (limited features)</Text>
            </View>
          </View>
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <Ionicons name="construct-outline" size={18} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>Development Build Command</Text>
              <View style={[styles.codeBlock, { backgroundColor: colors.muted }]}>
                <Text style={[styles.codeText, { color: colors.foreground }]}>
                  eas build --platform android --profile preview
                </Text>
              </View>
            </View>
          </View>
        </Section>

        {/* Danger */}
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
  codeBlock: { marginTop: 6, padding: 8, borderRadius: 8 },
  codeText: { fontSize: 12, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },
});
