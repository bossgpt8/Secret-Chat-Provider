import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { NativeNotifications, ZenoNotification } from "@/modules/NativeNotifications";

const APP_META: Record<string, { name: string; color: string; icon: string }> = {
  "com.whatsapp":                        { name: "WhatsApp",  color: "#25D366", icon: "logo-whatsapp" },
  "com.whatsapp.w4b":                    { name: "WhatsApp Business", color: "#25D366", icon: "logo-whatsapp" },
  "com.google.android.apps.messaging":   { name: "Messages",  color: "#4285F4", icon: "chatbubble-ellipses" },
  "com.android.mms":                     { name: "SMS",       color: "#4285F4", icon: "chatbubble-ellipses" },
  "com.samsung.android.messaging":       { name: "Messages",  color: "#1428A0", icon: "chatbubble-ellipses" },
  "org.telegram.messenger":             { name: "Telegram",  color: "#2AABEE", icon: "paper-plane" },
  "com.instagram.android":              { name: "Instagram", color: "#E1306C", icon: "logo-instagram" },
  "com.facebook.orca":                  { name: "Messenger", color: "#0084FF", icon: "chatbubbles" },
  "com.google.android.gm":              { name: "Gmail",     color: "#EA4335", icon: "mail" },
  "com.snapchat.android":               { name: "Snapchat",  color: "#FFFC00", icon: "camera" },
  "com.twitter.android":                { name: "Twitter",   color: "#1DA1F2", icon: "logo-twitter" },
  "com.discord":                        { name: "Discord",   color: "#5865F2", icon: "chatbubbles" },
};

function getAppMeta(pkg: string, defaultName: string) {
  return APP_META[pkg] ?? { name: defaultName || pkg, color: "#6366f1", icon: "notifications-outline" };
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function AppIcon({ pkg, appName, colors }: { pkg: string; appName: string; colors: ReturnType<typeof useColors> }) {
  const meta = getAppMeta(pkg, appName);
  const iconColor = meta.color === "#FFFC00" ? "#000" : "#fff";
  return (
    <View style={[styles.appIcon, { backgroundColor: meta.color }]}>
      <Ionicons name={meta.icon as "mic"} size={16} color={iconColor} />
    </View>
  );
}

export default function MessagesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [notifications, setNotifications] = useState<ZenoNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function checkPermissionAndLoad() {
    if (!NativeNotifications.isAvailable) {
      setHasPermission(false);
      return;
    }
    const granted = await NativeNotifications.hasPermission();
    setHasPermission(granted);
    if (granted) {
      await loadNotifications();
    }
  }

  async function loadNotifications() {
    setLoading(true);
    try {
      const items = await NativeNotifications.getRecent();
      const filtered = items.filter((n) => n.sender?.trim() || n.text?.trim());
      setNotifications(filtered);
    } catch (e) {
      console.warn("getRecent error", e);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      checkPermissionAndLoad();

      if (NativeNotifications.isAvailable) {
        pollRef.current = setInterval(() => {
          if (hasPermission) loadNotifications();
        }, 5000);
      }

      const unsub = NativeNotifications.onNotification((n) => {
        setNotifications((prev) => {
          const filtered = prev.filter((p) => p.key !== n.key);
          return [n, ...filtered].slice(0, 50);
        });
      });

      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
        unsub();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasPermission])
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Messages</Text>
        {hasPermission && notifications.length > 0 && (
          <View style={[styles.badge, { backgroundColor: colors.primary }]}>
            <Text style={[styles.badgeText, { color: colors.primaryForeground }]}>{notifications.length}</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad + 80 }]} showsVerticalScrollIndicator={false}>

        {/* ── Not on Android ─────────────────────────────────────────── */}
        {Platform.OS !== "android" && (
          <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: colors.primary }]}>
            <Ionicons name="phone-portrait-outline" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.noticeTitle, { color: colors.foreground }]}>Android only</Text>
              <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
                Notification interception is only available in the Android APK. Install the APK on your device and grant Notification Access.
              </Text>
            </View>
          </View>
        )}

        {/* ── Permission not granted ─────────────────────────────────── */}
        {Platform.OS === "android" && hasPermission === false && (
          <>
            <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: "#f59e0b" }]}>
              <Ionicons name="notifications-off-outline" size={18} color="#f59e0b" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.noticeTitle, { color: colors.foreground }]}>Notification Access needed</Text>
                <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
                  Grant Notification Access so Zeno can read your incoming messages from WhatsApp, SMS, and other apps.
                </Text>
              </View>
            </View>
            <Pressable
              style={[styles.grantBtn, { backgroundColor: colors.primary }]}
              onPress={async () => {
                await NativeNotifications.requestPermission();
                setTimeout(checkPermissionAndLoad, 1500);
              }}
            >
              <Ionicons name="settings-outline" size={16} color={colors.primaryForeground} />
              <Text style={[styles.grantBtnText, { color: colors.primaryForeground }]}>Grant Notification Access</Text>
            </Pressable>
            <View style={[styles.stepsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {[
                { step: "1", text: "Tap Grant above" },
                { step: "2", text: "Find \"Zeno\" in the list and toggle it ON" },
                { step: "3", text: "Come back — messages appear here automatically" },
              ].map(({ step, text }) => (
                <View key={step} style={styles.stepRow}>
                  <View style={[styles.stepBadge, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.stepNum, { color: colors.primaryForeground }]}>{step}</Text>
                  </View>
                  <Text style={[styles.stepText, { color: colors.foreground }]}>{text}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Loading ────────────────────────────────────────────────── */}
        {hasPermission === true && loading && notifications.length === 0 && (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Loading notifications…</Text>
          </View>
        )}

        {/* ── Empty state ────────────────────────────────────────────── */}
        {hasPermission === true && !loading && notifications.length === 0 && (
          <View style={styles.centered}>
            <Ionicons name="notifications-outline" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No notifications yet</Text>
            <Text style={[styles.emptySubText, { color: colors.mutedForeground }]}>
              New messages from WhatsApp, SMS, and other apps will appear here.
            </Text>
          </View>
        )}

        {/* ── Real notifications ─────────────────────────────────────── */}
        {hasPermission === true && notifications.length > 0 && (
          <>
            <View style={[styles.liveRow, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "30" }]}>
              <View style={[styles.liveDot, { backgroundColor: "#22c55e" }]} />
              <Text style={[styles.liveText, { color: colors.primary }]}>Live — refreshes automatically</Text>
              <Pressable onPress={loadNotifications}>
                <Ionicons name="refresh" size={15} color={colors.primary} />
              </Pressable>
            </View>
            {notifications.map((n) => {
              const meta = getAppMeta(n.packageName, n.app);
              return (
                <View key={n.key} style={[styles.msgCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <AppIcon pkg={n.packageName} appName={n.app} colors={colors} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.msgTop}>
                      <Text style={[styles.sender, { color: colors.foreground }]} numberOfLines={1}>
                        {n.sender || meta.name}
                      </Text>
                      <Text style={[styles.time, { color: colors.mutedForeground }]}>{timeAgo(n.timestamp)}</Text>
                    </View>
                    <Text style={[styles.appLabel, { color: colors.mutedForeground }]}>{meta.name}</Text>
                    <Text style={[styles.preview, { color: colors.mutedForeground }]} numberOfLines={2}>
                      {n.text || "(no text)"}
                    </Text>
                  </View>
                  {n.hasReply && (
                    <View style={[styles.replyDot, { backgroundColor: colors.primary }]}>
                      <Ionicons name="return-down-back" size={10} color={colors.primaryForeground} />
                    </View>
                  )}
                </View>
              );
            })}
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
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  scroll: { padding: 16 },
  notice: { flexDirection: "row", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderLeftWidth: 3, marginBottom: 16 },
  noticeTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  noticeText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  grantBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 14, marginBottom: 16 },
  grantBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  stepsCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 12, marginBottom: 16 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  stepBadge: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  stepNum: { fontSize: 12, fontFamily: "Inter_700Bold" },
  stepText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  centered: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  emptySubText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19, paddingHorizontal: 20 },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, marginBottom: 14 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium" },
  msgCard: { flexDirection: "row", alignItems: "flex-start", padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 8, gap: 12 },
  appIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  msgTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  sender: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1, marginRight: 8 },
  appLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 2 },
  time: { fontSize: 12, fontFamily: "Inter_400Regular", flexShrink: 0 },
  preview: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  replyDot: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
});
