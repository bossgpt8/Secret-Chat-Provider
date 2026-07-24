import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
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

const SUGGESTIONS = ["Vox", "Nova", "Aria", "Echo", "Sage", "Orion"];

const FEATURES = [
  { icon: "mic" as const,               label: "Speaks and listens hands-free" },
  { icon: "phone-portrait" as const,    label: "Controls your phone by voice" },
  { icon: "chatbubble-ellipses" as const, label: "Holds real conversations" },
  { icon: "search" as const,            label: "Searches the web for you" },
];

// ── Animated orb ──────────────────────────────────────────────────────────────
function VoxOrb({ primary }: { primary: string }) {
  const pulse1 = useRef(new Animated.Value(1)).current;
  const pulse2 = useRef(new Animated.Value(1)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse1, { toValue: 1.12, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(pulse1, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== "web" }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse2, { toValue: 1.22, duration: 2400, delay: 300, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(pulse2, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== "web" }),
      ])
    ).start();

    Animated.loop(
      Animated.timing(rotate, { toValue: 1, duration: 8000, easing: Easing.linear, useNativeDriver: Platform.OS !== "web" })
    ).start();
  }, []);

  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <View style={orbStyles.container}>
      {/* Outermost halo */}
      <Animated.View style={[orbStyles.halo2, { borderColor: primary + "18", transform: [{ scale: pulse2 }] }]} />
      {/* Mid ring */}
      <Animated.View style={[orbStyles.halo1, { borderColor: primary + "30", transform: [{ scale: pulse1 }] }]} />
      {/* Core orb */}
      <Animated.View style={[orbStyles.core, { backgroundColor: primary + "22", transform: [{ rotate: spin }] }]}>
        <View style={[orbStyles.innerCore, { backgroundColor: primary + "35" }]}>
          <Ionicons name="sparkles" size={32} color={primary} />
        </View>
      </Animated.View>
    </View>
  );
}

const orbStyles = StyleSheet.create({
  container: { width: 140, height: 140, alignItems: "center", justifyContent: "center", marginBottom: 32 },
  halo2: { position: "absolute", width: 140, height: 140, borderRadius: 70, borderWidth: 1 },
  halo1: { position: "absolute", width: 110, height: 110, borderRadius: 55, borderWidth: 1.5 },
  core: { width: 84, height: 84, borderRadius: 42, alignItems: "center", justifyContent: "center" },
  innerCore: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
});

// ── Feature row ───────────────────────────────────────────────────────────────
function FeatureRow({ icon, label, delay }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; delay: number }) {
  const colors = useColors();
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 400, delay, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== "web" }).start();
  }, []);
  return (
    <Animated.View style={[featureStyles.row, { opacity: anim, transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }] }]}>
      <View style={[featureStyles.icon, { backgroundColor: colors.primary + "15" }]}>
        <Ionicons name={icon} size={15} color={colors.primary} />
      </View>
      <Text style={[featureStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
    </Animated.View>
  );
}

const featureStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 4 },
  icon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 20 },
});

// ── Screen ────────────────────────────────────────────────────────────────────
export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { setAssistantName } = useAssistant();
  const [name, setName] = useState("Vox");
  const [error, setError] = useState("");
  const inputRef = useRef<TextInput>(null);

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

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Subtle gradient backdrop — violet glow from top */}
      <LinearGradient
        colors={[colors.primary + "22", "transparent"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.55 }}
        pointerEvents="none"
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        {/* ── ScrollView fixes the "stuck" screen on smaller phones ── */}
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: (Platform.OS === "web" ? 67 : insets.top) + 40, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <VoxOrb primary={colors.primary} />

          {/* Headline */}
          <Text style={[styles.eyebrow, { color: colors.primary }]}>YOUR AI VOICE ASSISTANT</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>What should I{"\n"}call myself?</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Pick a name. I'll remember it and respond when you call.
          </Text>

          {/* Name input */}
          <Pressable style={styles.inputWrap} onPress={() => inputRef.current?.focus()}>
            <View style={[styles.inputBox, { backgroundColor: colors.card, borderColor: error ? colors.destructive : colors.primary }]}>
              <TextInput
                ref={inputRef}
                style={[styles.input, { color: colors.foreground }]}
                placeholder="Type a name…"
                placeholderTextColor={colors.mutedForeground}
                value={name}
                onChangeText={(t) => { setName(t); setError(""); }}
                returnKeyType="done"
                onSubmitEditing={handleContinue}
                maxLength={24}
              />
            </View>
            {!!error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
          </Pressable>

          {/* Suggestion chips */}
          <Text style={[styles.chipLabel, { color: colors.mutedForeground }]}>SUGGESTIONS</Text>
          <View style={styles.chips}>
            {SUGGESTIONS.map((s) => {
              const active = name === s;
              return (
                <Pressable
                  key={s}
                  style={[
                    styles.chip,
                    active
                      ? { backgroundColor: colors.primary, borderColor: colors.primary }
                      : { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                  onPress={() => { setName(s); setError(""); Haptics.selectionAsync(); }}
                >
                  <Text style={[styles.chipText, { color: active ? "#fff" : colors.mutedForeground }]}>{s}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Feature list */}
          <View style={[styles.featureCard, { backgroundColor: colors.card + "cc", borderColor: colors.border }]}>
            {FEATURES.map((f, i) => (
              <FeatureRow key={f.label} icon={f.icon} label={f.label} delay={i * 100} />
            ))}
          </View>

          {/* CTA */}
          <Pressable
            style={[styles.btn, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
            onPress={handleContinue}
          >
            <Text style={styles.btnText}>Let's go</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { alignItems: "center", paddingHorizontal: 24 },

  eyebrow: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 2, marginBottom: 10 },
  title: { fontSize: 30, fontFamily: "Inter_700Bold", textAlign: "center", lineHeight: 38, marginBottom: 10 },
  subtitle: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22, marginBottom: 28 },

  inputWrap: { width: "100%", marginBottom: 20 },
  inputBox: { borderRadius: 16, borderWidth: 1.5, paddingHorizontal: 18, paddingVertical: 0, height: 56, justifyContent: "center" },
  input: { fontSize: 18, fontFamily: "Inter_600SemiBold", height: 56 },
  error: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 6 },

  chipLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5, alignSelf: "flex-start", marginBottom: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, width: "100%", marginBottom: 24 },
  chip: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 24, borderWidth: 1 },
  chipText: { fontSize: 14, fontFamily: "Inter_500Medium" },

  featureCard: {
    width: "100%", borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
    padding: 16, gap: 4, marginBottom: 28,
  },

  btn: {
    width: "100%", height: 56, borderRadius: 18,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 16, elevation: 8,
  },
  btnText: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#fff" },
});
