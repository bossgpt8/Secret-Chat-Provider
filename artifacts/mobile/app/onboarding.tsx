import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Animated,
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

const SUGGESTIONS = ["Nova", "Aria", "Echo", "Sage", "Luna", "Orion"];

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { setAssistantName } = useAssistant();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const scaleAnim = useRef(new Animated.Value(1)).current;

  async function handleContinue() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please give your assistant a name");
      return;
    }
    if (trimmed.length < 2) {
      setError("Name must be at least 2 characters");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.95, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();
    await setAssistantName(trimmed);
    router.replace("/chat");
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.content, { paddingTop: topPad + 40, paddingBottom: insets.bottom + 24 }]}>
        <View style={[styles.iconWrap, { backgroundColor: colors.primary + "20" }]}>
          <Ionicons name="mic" size={48} color={colors.primary} />
        </View>

        <Text style={[styles.title, { color: colors.foreground }]}>
          Meet your assistant
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Give it a name to get started. You can change this later in settings.
        </Text>

        <View style={styles.inputWrap}>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.card,
                color: colors.foreground,
                borderColor: error ? colors.destructive : colors.border,
              },
            ]}
            placeholder="e.g. Nova, Aria, Echo..."
            placeholderTextColor={colors.mutedForeground}
            value={name}
            onChangeText={(t) => { setName(t); setError(""); }}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleContinue}
            maxLength={24}
          />
          {error ? (
            <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
          ) : null}
        </View>

        <Text style={[styles.suggestLabel, { color: colors.mutedForeground }]}>
          Suggestions
        </Text>
        <View style={styles.suggestions}>
          {SUGGESTIONS.map((s) => (
            <Pressable
              key={s}
              style={[
                styles.chip,
                {
                  backgroundColor: name === s ? colors.primary : colors.secondary,
                  borderColor: name === s ? colors.primary : colors.border,
                },
              ]}
              onPress={() => { setName(s); setError(""); Haptics.selectionAsync(); }}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: name === s ? colors.primaryForeground : colors.secondaryForeground },
                ]}
              >
                {s}
              </Text>
            </Pressable>
          ))}
        </View>

        <Animated.View style={{ transform: [{ scale: scaleAnim }], width: "100%" }}>
          <Pressable
            style={[styles.btn, { backgroundColor: colors.primary }]}
            onPress={handleContinue}
          >
            <Text style={[styles.btnText, { color: colors.primaryForeground }]}>
              Let&apos;s go
            </Text>
            <Ionicons name="arrow-forward" size={20} color={colors.primaryForeground} />
          </Pressable>
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 24, alignItems: "center" },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 10 },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
  inputWrap: { width: "100%", marginBottom: 20 },
  input: {
    width: "100%",
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    fontSize: 17,
    fontFamily: "Inter_500Medium",
  },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 6, marginLeft: 4 },
  suggestLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
    alignSelf: "flex-start",
  },
  suggestions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    width: "100%",
    marginBottom: 40,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  chipText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  btn: {
    width: "100%",
    height: 54,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  btnText: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
});
