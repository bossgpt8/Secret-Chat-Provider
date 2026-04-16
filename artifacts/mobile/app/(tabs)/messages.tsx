import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { NativeNotifications, type ZenoNotification } from "@/modules/NativeNotifications";

const MAX_RECENT_MESSAGES = 50;

function formatAge(ts: number): string {
  const diffMs = Date.now() - ts;
  const mins = Math.max(1, Math.floor(diffMs / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function appLabel(n: ZenoNotification): string {
  if (n.app && !n.app.includes(".")) return n.app;
  const pkg = n.packageName || n.app;
  if (pkg.includes("whatsapp")) return "WhatsApp";
  if (pkg.includes("messaging") || pkg.includes("sms")) return "SMS";
  if (pkg.includes("telegram")) return "Telegram";
  if (pkg.includes("messenger")) return "Messenger";
  return pkg || "Unknown app";
}

function AppIcon({ label, colors }: { label: string; colors: ReturnType<typeof useColors> }) {
  const normalized = label.toLowerCase();
  const isWA = normalized.includes("whatsapp");
  return (
    <View style={[styles.appIcon, { backgroundColor: isWA ? "#25D366" : colors.secondary }]}>
      <Ionicons
        name={isWA ? "logo-whatsapp" : "chatbubble-ellipses"}
        size={16}
        color={isWA ? "#fff" : colors.primary}
      />
    </View>
  );
}

export default function MessagesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ZenoNotification[]>([]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const mergeNotification = useCallback((incoming: ZenoNotification) => {
    setMessages((prev) => {
      const next = [incoming, ...prev.filter((n) => n.key !== incoming.key)];
      return next.slice(0, MAX_RECENT_MESSAGES);
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!NativeNotifications.isAvailable) {
      setLoading(false);
      return;
    }
    const hasPermission = await NativeNotifications.hasPermission().catch(() => false);
    setPermissionGranted(hasPermission);
    if (!hasPermission) {
      setMessages([]);
      setLoading(false);
      return;
    }
    const recent = await NativeNotifications.getRecent().catch((): ZenoNotification[] => []);
    recent.sort((a, b) => b.timestamp - a.timestamp);
    setMessages(recent);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    if (!NativeNotifications.isAvailable) return;
    const unsub = NativeNotifications.onNotification(mergeNotification);
    return () => unsub();
  }, [mergeNotification, refresh]);

  const groupedCountLabel = useMemo(() => `${messages.length} recent`, [messages.length]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Messages</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad + 80 }]} showsVerticalScrollIndicator={false}>
        {!NativeNotifications.isAvailable ? (
          <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: colors.primary }]}>
            <Ionicons name="information-circle" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.noticeTitle, { color: colors.foreground }]}>Android Only</Text>
              <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
                Real incoming app messages require the Android notification listener service.
              </Text>
            </View>
          </View>
        ) : !permissionGranted ? (
          <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: colors.primary }]}>
            <Ionicons name="notifications-outline" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.noticeTitle, { color: colors.foreground }]}>Enable Notification Access</Text>
              <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
                Turn on notification access to see real incoming messages from apps here.
              </Text>
              <View style={styles.noticeButtons}>
                <Pressable
                  style={[styles.noticeBtn, { backgroundColor: colors.primary }]}
                  onPress={async () => {
                    await NativeNotifications.requestPermission();
                    setTimeout(() => void refresh(), 800);
                  }}
                >
                  <Text style={styles.noticeBtnText}>Open Settings</Text>
                </Pressable>
                <Pressable style={[styles.noticeBtnSecondary, { borderColor: colors.border }]} onPress={() => void refresh()}>
                  <Text style={[styles.noticeBtnSecondaryText, { color: colors.foreground }]}>Refresh</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Incoming</Text>
              <Text style={[styles.countText, { color: colors.mutedForeground }]}>{groupedCountLabel}</Text>
            </View>
            {loading ? (
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Loading…</Text>
            ) : messages.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No recent messages yet.</Text>
            ) : (
              messages.map((msg) => {
                const label = appLabel(msg);
                const sender = msg.sender?.trim() || label;
                const preview = msg.text?.trim() || "(No preview text)";
                return (
                  <View key={msg.key} style={[styles.msgCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <AppIcon label={label} colors={colors} />
                    <View style={{ flex: 1 }}>
                      <View style={styles.msgTop}>
                        <Text style={[styles.sender, { color: colors.foreground }]} numberOfLines={1}>{sender}</Text>
                        <Text style={[styles.time, { color: colors.mutedForeground }]}>{formatAge(msg.timestamp)}</Text>
                      </View>
                      <Text style={[styles.preview, { color: colors.mutedForeground }]} numberOfLines={2}>
                        {preview}
                      </Text>
                      <Text style={[styles.appName, { color: colors.primary }]} numberOfLines={1}>{label}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingBottom: 12,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  scroll: { padding: 16, gap: 0 },
  notice: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderLeftWidth: 3,
    marginBottom: 20,
  },
  noticeTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  noticeText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  noticeButtons: { flexDirection: "row", gap: 8, marginTop: 10 },
  noticeBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  noticeBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 12 },
  noticeBtnSecondary: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  noticeBtnSecondaryText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 4,
  },
  countText: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  msgCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  appIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  msgTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2, gap: 8 },
  sender: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  time: { fontSize: 12, fontFamily: "Inter_400Regular" },
  preview: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 4 },
  appName: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 8 },
});
