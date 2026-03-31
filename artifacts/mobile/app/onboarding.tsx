import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAssistant } from "@/context/AssistantContext";
import { useColors } from "@/hooks/useColors";

const SUGGESTIONS = ["Zeno", "Nova", "Aria", "Echo", "Sage", "Orion"];

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { setAssistantName } = useAssistant();
  const [name, setName] = useState("Zeno");
  const [error, setError] = useState("");
  const pulseAnim = useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== "web" }),
      ])
    ).start();
  }, []);

  async function handleContinue() {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length < 2) {
      setError("Name must be at least 2 characters");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await setAssistantName(trimmed);
    router.replace("/(tabs)");
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.content, { paddingTop: topPad + 48, paddingBottom: insets.bottom + 24 }]}>
        <Animated.View style={[styles.iconWrap, { backgroundColor: colors.primary + "20", transform: [{ scale: pulseAnim }] }]}>
          <Ionicons name="mic" size={52} color={colors.primary} />
        </Animated.View>

        <Text style={[styles.title, { color: colors.foreground }]}>Meet your AI assistant</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Give your assistant a name. It will respond to voice commands, control your phone, read messages, and search the web.
        </Text>

        <View style={styles.inputWrap}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: error ? colors.destructive : colors.primary }]}
            placeholder="Assistant name..."
            placeholderTextColor={colors.mutedForeground}
            value={name}
            onChangeText={(t) => { setName(t); setError(""); }}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleContinue}
            maxLength={24}
          />
          {!!error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
        </View>

        <Text style={[styles.suggestLabel, { color: colors.mutedForeground }]}>Suggestions</Text>
        <View style={styles.chips}>
          {SUGGESTIONS.map((s) => (
            <Pressable
              key={s}
              style={[styles.chip, { backgroundColor: name === s ? colors.primary : colors.secondary, borderColor: name === s ? colors.primary : colors.border }]}
              onPress={() => { setName(s); setError(""); Haptics.selectionAsync(); }}
            >
              <Text style={[styles.chipText, { color: name === s ? colors.primaryForeground : colors.secondaryForeground }]}>{s}</Text>
            </Pressable>
          ))}
        </View>

        <View style={[styles.featureList, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {[
            { icon: "chatbubble-ellipses", label: "AI conversation with LLaMA 3.3" },
            { icon: "mic", label: "Voice input & TTS responses" },
            { icon: "search", label: "Web search integration" },
            { icon: "phone-portrait", label: "Phone controls (dev build)" },
          ].map(({ icon, label }) => (
            <View key={label} style={styles.featureRow}>
              <Ionicons name={icon as "chatbubble-ellipses"} size={16} color={colors.primary} />
              <Text style={[styles.featureText, { color: colors.foreground }]}>{label}</Text>
            </View>
          ))}
        </View>

        <Pressable style={[styles.btn, { backgroundColor: colors.primary }]} onPress={handleContinue}>
          <Text style={[styles.btnText, { color: colors.primaryForeground }]}>Get started</Text>
          <Ionicons name="arrow-forward" size={20} color={colors.primaryForeground} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 24, alignItems: "center" },
  iconWrap: { width: 104, height: 104, borderRadius: 52, alignItems: "center", justifyContent: "center", marginBottom: 24 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 10 },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21, marginBottom: 28 },
  inputWrap: { width: "100%", marginBottom: 16 },
  input: { width: "100%", height: 52, borderRadius: 14, borderWidth: 2, paddingHorizontal: 16, fontSize: 17, fontFamily: "Inter_600SemiBold" },
  error: { fontSize: 13, marginTop: 6, fontFamily: "Inter_400Regular" },
  suggestLabel: { fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, alignSelf: "flex-start" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, width: "100%", marginBottom: 20 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  featureList: { width: "100%", borderRadius: 14, borderWidth: 1, padding: 14, gap: 10, marginBottom: 24 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  featureText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  btn: { width: "100%", height: 54, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  btnText: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
});
