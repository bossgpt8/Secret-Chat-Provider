import { Ionicons } from "@expo/vector-icons";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const SAMPLE_MESSAGES = [
  {
    id: "1",
    app: "WhatsApp",
    sender: "Mom",
    preview: "Are you coming home for dinner tonight?",
    time: "2m ago",
    unread: true,
  },
  {
    id: "2",
    app: "SMS",
    sender: "+1 (555) 234-5678",
    preview: "Your verification code is 847291",
    time: "14m ago",
    unread: true,
  },
  {
    id: "3",
    app: "WhatsApp",
    sender: "Work Team",
    preview: "Meeting moved to 3pm tomorrow",
    time: "1h ago",
    unread: false,
  },
];

function AppIcon({ app, colors }: { app: string; colors: ReturnType<typeof useColors> }) {
  const isWA = app === "WhatsApp";
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
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Messages</Text>
        <View style={[styles.badge, { backgroundColor: colors.warning + "20" }]}>
          <Text style={[styles.badgeText, { color: colors.warning }]}>Dev build required</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad + 80 }]} showsVerticalScrollIndicator={false}>
        {/* Notice */}
        <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: colors.primary }]}>
          <Ionicons name="information-circle" size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.noticeTitle, { color: colors.foreground }]}>Accessibility Service Required</Text>
            <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
              Reading WhatsApp and SMS messages requires a development build with Android AccessibilityService permission. Below is a preview of how messages will appear.
            </Text>
          </View>
        </View>

        {/* Preview messages */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Preview</Text>
        {SAMPLE_MESSAGES.map((msg) => (
          <View key={msg.id} style={[styles.msgCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <AppIcon app={msg.app} colors={colors} />
            <View style={{ flex: 1 }}>
              <View style={styles.msgTop}>
                <Text style={[styles.sender, { color: colors.foreground }]}>{msg.sender}</Text>
                <Text style={[styles.time, { color: colors.mutedForeground }]}>{msg.time}</Text>
              </View>
              <Text style={[styles.preview, { color: colors.mutedForeground }]} numberOfLines={1}>
                {msg.preview}
              </Text>
            </View>
            {msg.unread && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
          </View>
        ))}

        {/* How it works */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>How it works</Text>
        <View style={[styles.stepsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {[
            { step: "1", text: "Build with EAS: eas build --platform android --profile preview" },
            { step: "2", text: "Install APK and open Settings tab" },
            { step: "3", text: "Enable Accessibility Service permission" },
            { step: "4", text: "Incoming WhatsApp & SMS appear here automatically" },
          ].map(({ step, text }) => (
            <View key={step} style={styles.stepRow}>
              <View style={[styles.stepBadge, { backgroundColor: colors.primary }]}>
                <Text style={[styles.stepNum, { color: colors.primaryForeground }]}>{step}</Text>
              </View>
              <Text style={[styles.stepText, { color: colors.foreground }]}>{text}</Text>
            </View>
          ))}
        </View>
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
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
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
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 4,
  },
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
  msgTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  sender: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  time: { fontSize: 12, fontFamily: "Inter_400Regular" },
  preview: { fontSize: 13, fontFamily: "Inter_400Regular" },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  stepsCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 12,
    marginTop: 4,
  },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  stepBadge: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  stepNum: { fontSize: 12, fontFamily: "Inter_700Bold" },
  stepText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
});
