import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAssistant, type Conversation } from "@/context/AssistantContext";
import { useColors } from "@/hooks/useColors";

function formatTime(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString();
}

function ConversationItem({
  conv,
  onPress,
  onDelete,
  colors,
}: {
  conv: Conversation;
  onPress: () => void;
  onDelete: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const preview = conv.messages[conv.messages.length - 1]?.content ?? "No messages yet";
  return (
    <Pressable
      style={[styles.convItem, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (Platform.OS === "web") {
          onDelete();
        } else {
          Alert.alert("Delete conversation", "This cannot be undone.", [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: onDelete },
          ]);
        }
      }}
    >
      <View style={styles.convInfo}>
        <Text style={[styles.convTitle, { color: colors.foreground }]} numberOfLines={1}>
          {conv.title}
        </Text>
        <Text style={[styles.convPreview, { color: colors.mutedForeground }]} numberOfLines={2}>
          {preview}
        </Text>
      </View>
      <View style={styles.convMeta}>
        <Text style={[styles.convTime, { color: colors.mutedForeground }]}>
          {formatTime(conv.updatedAt)}
        </Text>
        <Text style={[styles.convCount, { color: colors.mutedForeground }]}>
          {conv.messages.length} msg{conv.messages.length !== 1 ? "s" : ""}
        </Text>
      </View>
    </Pressable>
  );
}

export default function HistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { conversations, setCurrentConversationId, deleteConversation, assistantName } = useAssistant();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  function openConversation(id: string) {
    setCurrentConversationId(id);
    router.replace("/chat");
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>History</Text>
        <View style={{ width: 40 }} />
      </View>

      {conversations.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="chatbubble-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No conversations yet</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Start chatting with {assistantName} and your history will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ConversationItem
              conv={item}
              colors={colors}
              onPress={() => openConversation(item.id)}
              onDelete={() => deleteConversation(item.id)}
            />
          )}
          contentContainerStyle={[styles.list, { paddingBottom: bottomPad + 16 }]}
          showsVerticalScrollIndicator={false}
        />
      )}
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
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  list: { paddingHorizontal: 16, paddingTop: 12 },
  convItem: {
    flexDirection: "row",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    gap: 10,
  },
  convInfo: { flex: 1 },
  convTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  convPreview: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  convMeta: { alignItems: "flex-end", gap: 4 },
  convTime: { fontSize: 12, fontFamily: "Inter_400Regular" },
  convCount: { fontSize: 11, fontFamily: "Inter_400Regular" },
});
