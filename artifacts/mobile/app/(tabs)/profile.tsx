import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useAssistant,
  type AssistantPersonality,
  type UserProfile,
} from "@/context/AssistantContext";
import { useColors } from "@/hooks/useColors";

const GENDER_OPTIONS: { label: string; value: UserProfile["gender"] }[] = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
  { label: "Non-binary", value: "nonbinary" },
  { label: "Other", value: "other" },
  { label: "Prefer not to say", value: "" },
];

const PERSONALITY_OPTIONS: {
  value: AssistantPersonality;
  label: string;
  description: string;
  icon: string;
}[] = [
  { value: "friendly", label: "Friendly", description: "Warm and supportive", icon: "heart-outline" },
  { value: "casual",   label: "Casual",   description: "Relaxed and informal", icon: "happy-outline" },
  { value: "professional", label: "Professional", description: "Formal and precise", icon: "briefcase-outline" },
  { value: "witty",    label: "Witty",    description: "Clever and humorous", icon: "sparkles-outline" },
  { value: "caring",   label: "Caring",   description: "Empathetic and gentle", icon: "hand-left-outline" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{title}</Text>
      <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {children}
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    assistantName,
    userProfile, setUserProfile,
    assistantPersonality, setAssistantPersonality,
    wakeWordEnabled, setWakeWordEnabled,
  } = useAssistant();

  const [nameInput, setNameInput] = useState(userProfile.userName);
  const [ageInput, setAgeInput] = useState(userProfile.age);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  async function saveField(field: keyof UserProfile, value: string) {
    await setUserProfile({ ...userProfile, [field]: value });
  }

  async function saveGender(gender: UserProfile["gender"]) {
    Haptics.selectionAsync();
    await setUserProfile({ ...userProfile, gender });
  }

  async function savePersonality(p: AssistantPersonality) {
    Haptics.selectionAsync();
    await setAssistantPersonality(p);
  }

  async function toggleWakeWord(val: boolean) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await setWakeWordEnabled(val);
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Profile</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Personalise your experience</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: bottomPad + 90 }} showsVerticalScrollIndicator={false}>

        {/* ── About You ── */}
        <Section title="About You">
          {/* Name */}
          <View style={[styles.fieldRow, { borderBottomColor: colors.border }]}>
            <Ionicons name="person-outline" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Your Name</Text>
              <TextInput
                style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                value={nameInput}
                onChangeText={setNameInput}
                onBlur={() => saveField("userName", nameInput.trim())}
                onSubmitEditing={() => saveField("userName", nameInput.trim())}
                placeholder="e.g. Alex"
                placeholderTextColor={colors.mutedForeground}
                maxLength={32}
                returnKeyType="done"
              />
            </View>
          </View>

          {/* Age */}
          <View style={[styles.fieldRow, { borderBottomColor: colors.border }]}>
            <Ionicons name="calendar-outline" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Age</Text>
              <TextInput
                style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                value={ageInput}
                onChangeText={setAgeInput}
                onBlur={() => saveField("age", ageInput.trim())}
                onSubmitEditing={() => saveField("age", ageInput.trim())}
                placeholder="e.g. 25"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="number-pad"
                maxLength={3}
                returnKeyType="done"
              />
            </View>
          </View>

          {/* Gender */}
          <View style={[styles.fieldRow, { borderBottomColor: "transparent", flexDirection: "column", alignItems: "flex-start", gap: 10 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="transgender-outline" size={18} color={colors.primary} />
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Gender</Text>
            </View>
            <View style={styles.pillRow}>
              {GENDER_OPTIONS.map((opt) => {
                const active = userProfile.gender === opt.value;
                return (
                  <Pressable
                    key={String(opt.value)}
                    style={[
                      styles.pill,
                      { backgroundColor: active ? colors.primary : colors.muted, borderColor: active ? colors.primary : colors.border },
                    ]}
                    onPress={() => saveGender(opt.value)}
                  >
                    <Text style={[styles.pillText, { color: active ? "#fff" : colors.foreground }]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Section>

        {/* ── Assistant Style ── */}
        <Section title="Assistant Style">
          <View style={[styles.fieldRow, { borderBottomColor: "transparent", flexDirection: "column", alignItems: "flex-start", gap: 2 }]}>
            <Text style={[styles.sectionHint, { color: colors.mutedForeground }]}>
              Choose how {assistantName} talks to you
            </Text>
          </View>
          {PERSONALITY_OPTIONS.map((opt, i) => {
            const active = assistantPersonality === opt.value;
            const isLast = i === PERSONALITY_OPTIONS.length - 1;
            return (
              <Pressable
                key={opt.value}
                style={[
                  styles.personalityRow,
                  { borderBottomColor: colors.border, backgroundColor: active ? colors.primary + "08" : "transparent" },
                  isLast && { borderBottomWidth: 0 },
                ]}
                onPress={() => savePersonality(opt.value)}
              >
                <View style={[styles.radioCircle, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : "transparent" }]}>
                  {active && <View style={styles.radioDot} />}
                </View>
                <Ionicons name={opt.icon as "heart-outline"} size={18} color={active ? colors.primary : colors.mutedForeground} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{opt.label}</Text>
                  <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>{opt.description}</Text>
                </View>
                {active && <Ionicons name="checkmark-circle" size={18} color={colors.primary} />}
              </Pressable>
            );
          })}
        </Section>

        {/* ── Wake Word ── */}
        <Section title="Wake Word">
          <View style={[styles.fieldRow, { borderBottomColor: "transparent" }]}>
            <Ionicons name="ear-outline" size={18} color={colors.primary} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                &ldquo;Hey {assistantName}&rdquo; Listener
              </Text>
              <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
                When enabled, the app listens in the foreground for your wake word. Say &ldquo;Hey {assistantName}&rdquo; to start a conversation hands-free. Requires the app to be open.
              </Text>
            </View>
            <Switch
              value={wakeWordEnabled}
              onValueChange={toggleWakeWord}
              trackColor={{ false: colors.muted, true: colors.primary + "80" }}
              thumbColor={wakeWordEnabled ? colors.primary : colors.mutedForeground}
            />
          </View>
          {wakeWordEnabled && (
            <View style={[styles.wakeNote, { backgroundColor: colors.accent + "12", borderColor: colors.accent + "30" }]}>
              <Ionicons name="information-circle-outline" size={15} color={colors.accent} />
              <Text style={[styles.wakeNoteText, { color: colors.accent }]}>
                Wake word mode uses the microphone and transcription API continuously. This increases battery and data usage.
              </Text>
            </View>
          )}
        </Section>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingBottom: 10, paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  section: { paddingHorizontal: 16, marginTop: 22 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 },
  sectionHint: { fontSize: 12, fontFamily: "Inter_400Regular", paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4 },
  sectionCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  fieldRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 12, gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fieldLabel: { fontSize: 14, fontFamily: "Inter_500Medium", marginBottom: 1 },
  fieldHint: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  fieldInput: {
    marginTop: 6, height: 36, borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 10, fontSize: 14, fontFamily: "Inter_400Regular",
  },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 14, paddingBottom: 12 },
  pill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  pillText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  personalityRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 12, gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  radioCircle: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#fff" },
  wakeNote: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    marginHorizontal: 14, marginBottom: 12, padding: 10,
    borderRadius: 10, borderWidth: 1,
  },
  wakeNoteText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
});
