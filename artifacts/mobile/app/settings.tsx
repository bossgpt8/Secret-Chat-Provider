import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
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

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { assistantName, setAssistantName, conversations, deleteConversation } = useAssistant();
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

  function clearAllHistory() {
    const doDelete = async () => {
      for (const conv of conversations) {
        await deleteConversation(conv.id);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };
    if (Platform.OS === "web") {
      doDelete();
    } else {
      Alert.alert(
        "Clear all history",
        `This will delete all ${conversations.length} conversation(s). This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Clear all", style: "destructive", onPress: doDelete },
        ]
      );
    }
  }

  function SettingRow({
    icon,
    label,
    value,
    onPress,
    destructive,
  }: {
    icon: React.ComponentProps<typeof Ionicons>["name"];
    label: string;
    value?: string;
    onPress?: () => void;
    destructive?: boolean;
  }) {
    return (
      <Pressable
        style={[styles.settingRow, { borderBottomColor: colors.border }]}
        onPress={onPress}
        disabled={!onPress}
      >
        <Ionicons name={icon} size={20} color={destructive ? colors.destructive : colors.primary} />
        <Text style={[styles.settingLabel, { color: destructive ? colors.destructive : colors.foreground }]}>
          {label}
        </Text>
        {value && <Text style={[styles.settingValue, { color: colors.mutedForeground }]}>{value}</Text>}
        {onPress && (
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        )}
      </Pressable>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: bottomPad + 16 }}>
        {/* Assistant name */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Assistant</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {editingName ? (
            <View style={styles.nameEditRow}>
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
                <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>Save</Text>
              </Pressable>
              <Pressable
                style={[styles.cancelBtn, { borderColor: colors.border }]}
                onPress={() => { setEditingName(false); setNameInput(assistantName); }}
              >
                <Ionicons name="close" size={18} color={colors.foreground} />
              </Pressable>
            </View>
          ) : (
            <SettingRow
              icon="person-circle-outline"
              label="Assistant name"
              value={assistantName}
              onPress={() => { setEditingName(true); setNameInput(assistantName); }}
            />
          )}
          <SettingRow
            icon="chatbubbles-outline"
            label="Conversations"
            value={`${conversations.length}`}
          />
        </View>

        {/* About */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>About</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow icon="cube-outline" label="AI Model" value="LLaMA 3.3 70B" />
          <SettingRow icon="globe-outline" label="Powered by" value="OpenRouter" />
          <SettingRow icon="search-outline" label="Web search" value="LLaMA 3.3 Online" />
        </View>

        {/* Danger zone */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Data</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow
            icon="trash-outline"
            label="Clear all history"
            onPress={clearAllHistory}
            destructive
          />
        </View>
      </ScrollView>
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
  backBtn: { padding: 8 },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontFamily: "Inter_600SemiBold" },
  sectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 24,
    marginBottom: 8,
    marginHorizontal: 20,
  },
  section: {
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  settingLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  settingValue: { fontSize: 14, fontFamily: "Inter_400Regular" },
  nameEditRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 8,
  },
  nameInput: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  saveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  saveBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  cancelBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
