import React, { useEffect, useState } from "react";
import { Alert, AppState, Linking, Pressable, Switch, Text, View } from "react-native";
import { Audio } from "expo-av";
import * as Notifications from "expo-notifications";
import { useAssistant } from "@/context/AssistantContext";
import { useColors } from "@/hooks/useColors";
import { NativeWakeWord, type WakeStatus } from "@/modules/NativeWakeWord";
import { WakeCalibrationSettings } from "./WakeCalibrationSettings";
import { NativeAccessibility } from "@/modules/NativeAccessibility";
import { wakePhraseForName } from "@/modules/wakePhrase";

export function WakeWordSettings() {
  const colors = useColors();
  const { assistantName, wakeWordEnabled, setWakeWordEnabled } = useAssistant();
  let nameError = "";
  try { wakePhraseForName(assistantName); } catch (error) { nameError = (error as Error).message; }
  const [status, setStatus] = useState<WakeStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => { void NativeWakeWord.status().then(setStatus); };
  useEffect(() => {
    refresh();
    const unsubscribe = NativeWakeWord.onStatus(setStatus);
    const sub = AppState.addEventListener("change", state => { if (state === "active") refresh(); });
    return () => { unsubscribe(); sub.remove(); };
  }, []);
  async function toggle(enabled: boolean) {
    setBusy(true);
    try {
      if (!enabled) {
        await NativeWakeWord.stop();
        await setWakeWordEnabled(false);
      } else {
        const microphone = await Audio.requestPermissionsAsync();
        if (!microphone.granted) {
          Alert.alert("Microphone access needed", "Allow microphone access to listen for Hey Vox.", [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => { void Linking.openSettings(); } },
          ]);
          return;
        }
        const notification = await Notifications.requestPermissionsAsync();
        if (!notification.granted) {
          Alert.alert("Notification access needed", "Enable notifications so the listener has visible Resume and Stop controls.", [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => { void Linking.openSettings(); } },
          ]);
          return;
        }
        await NativeWakeWord.startForName(assistantName);
        await setWakeWordEnabled(true);
      }
      refresh();
    } catch (error) {
      Alert.alert("Hey Vox could not start", error instanceof Error ? error.message : "Open Vox and try again.");
      refresh();
    } finally { setBusy(false); }
  }
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "600" }}>{`“Hey ${assistantName}” wake word`}</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
            Detects the phrase on your phone, including with the screen off. No wake-listening audio is uploaded.
          </Text>
        </View>
        <Switch testID="wake-word-toggle" accessibilityLabel={`Enable Hey ${assistantName} wake word`}
          value={wakeWordEnabled} disabled={busy || !NativeWakeWord.isAvailable || (!!nameError && !wakeWordEnabled)}
          onValueChange={value => { void toggle(value); }}
          trackColor={{ false: colors.muted, true: colors.primary + "80" }}
          thumbColor={wakeWordEnabled ? colors.primary : colors.mutedForeground} />
      </View>
      <Text testID="wake-word-status" accessibilityLiveRegion="polite"
        style={{ color: status?.state === "error" ? colors.destructive : colors.accent, fontSize: 13 }}>
        {nameError || (status ? `${status.state}: ${status.message}` : "Checking listener…")}
      </Text>
      {status?.state === "listening" && <View style={{ gap: 6 }}>
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
          Microphone signal · {Math.round(Math.min(1, (status.audioLevel || 0) * 8) * 100)}%
        </Text>
        <View style={{ height: 5, backgroundColor: colors.muted, borderRadius: 3 }}>
          <View style={{ height: 5, borderRadius: 3, width: `${Math.max(2, Math.min(100, (status.audioLevel || 0) * 800))}%`, backgroundColor: colors.primary }} />
        </View>
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
          If this stays at zero while you speak, check microphone privacy and other recording apps. A moving meter does not guarantee phrase detection.
        </Text>
      </View>}
      {NativeWakeWord.isAvailable && wakeWordEnabled && status?.state !== "listening" && (
        <Pressable testID="wake-word-resume" accessibilityRole="button" disabled={busy}
          onPress={() => { void toggle(true); }} style={{ paddingVertical: 10 }}>
          <Text style={{ color: colors.primary, fontWeight: "600" }}>Resume listener</Text>
        </Pressable>
      )}
      <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19 }}>
        {`Say “Hey ${assistantName}”, wait for the vibration, then speak. This starts Current voice; Gemini Live remains a separate choice.`}
        {"\n"}Renaming your assistant updates its wake phrase. The current detector supports English names. Listening uses battery and pauses during Vox audio.
        Android may stop it after a force-stop, reboot, another recording app, or battery restrictions.
      </Text>
      {NativeWakeWord.isAvailable && (
        <Pressable testID="wake-word-battery-settings" accessibilityRole="button"
          onPress={() => {
            Alert.alert("Allow background listening",
              "In your phone’s app battery settings, allow unrestricted/background use for Vox. Some phones also require Auto-start. This can increase battery use. A battery exemption does not guarantee Android will keep Vox running.",
              [{ text: "Cancel", style: "cancel" }, { text: "Open battery settings", onPress: () => {
                void (NativeAccessibility.isAvailable ? NativeAccessibility.requestIgnoreBatteryOptimization() : Linking.openSettings())
                  .catch(() => Linking.openSettings());
              } }]);
          }}>
          <Text style={{ color: colors.primary, paddingVertical: 8 }}>Background / battery setup</Text>
        </Pressable>
      )}
      <WakeCalibrationSettings assistantName={assistantName} />
    </View>
  );
}
