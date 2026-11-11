import React, { useState, useSyncExternalStore } from "react";
import { Alert, Platform, Pressable, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import {
  beginWakeTrial, clearWakeTrials, finishWakeTrial, getWakeCalibration, markFalseWake, subscribeWakeCalibration,
} from "@/modules/wakeCalibration";

type Env = "quiet" | "noise" | "screen-off";
const ENVS: { id: Env; label: string; seconds: number }[] = [
  { id: "quiet", label: "Quiet", seconds: 10 },
  { id: "noise", label: "Noisy", seconds: 10 },
  { id: "screen-off", label: "Screen off", seconds: 30 },
];
const isWeb = Platform.OS === "web";

export function WakeCalibrationSettings({ assistantName }: { assistantName: string }) {
  const colors = useColors();
  const cal = useSyncExternalStore(subscribeWakeCalibration, getWakeCalibration, getWakeCalibration);
  const [env, setEnv] = useState<Env>(cal.active ? cal.environment : "quiet");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = cal.active ? cal.environment : env;
  const disabled = isWeb || busy;

  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); }
    catch (e) { setError(e instanceof Error && e.message ? e.message : "The wake detector reported an error."); }
    finally { setBusy(false); }
  }
  const clear = () => Alert.alert("Clear wake measurements?", "All recorded hits, misses and false wakes will be deleted.", [
    { text: "Cancel", style: "cancel" },
    { text: "Clear", style: "destructive", onPress: () => void run(clearWakeTrials) },
  ]);

  const muted = { color: colors.mutedForeground, fontSize: 13, lineHeight: 19 };
  const link = { color: colors.primary, fontWeight: "600" as const, paddingVertical: 8 };
  const off = { opacity: 0.5 };
  const seconds = ENVS.find(e => e.id === selected)?.seconds ?? 10;
  const remaining = cal.active ? Math.max(0, Math.ceil((cal.deadlineMs - Date.now()) / 1000)) : null;

  return (
    <View testID="wake-calibration" style={{ gap: 10 }}>
      <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "600" }}>Wake word check</Text>
      <Text style={muted}>
        {`Start a trial, then say only “Hey ${assistantName}” with no command. Vox will not start a conversation for calibration detections. Quiet and noisy trials last 10 seconds, screen-off trials 30 seconds. You choose the environment; Vox does not verify it.`}
      </Text>
      {isWeb && <Text testID="wake-calibration-web" style={muted}>Wake checks need the Android app and are unavailable on web.</Text>}

      <View accessibilityRole="radiogroup" style={{ flexDirection: "row", gap: 8 }}>
        {ENVS.map(e => {
          const on = selected === e.id;
          return (
            <Pressable key={e.id} testID={`wake-env-${e.id}`} accessibilityRole="radio" accessibilityState={{ selected: on, disabled: disabled || cal.active }}
              accessibilityLabel={`${e.label} environment`} disabled={disabled || cal.active} onPress={() => setEnv(e.id)}
              style={{ flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: colors.radius, borderWidth: 1,
                borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary + "1A" : "transparent" }}>
              <Text style={{ color: on ? colors.primary : colors.foreground, fontSize: 13, fontWeight: "600" }}>{e.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text testID="wake-calibration-status" accessibilityLiveRegion="polite" style={{ color: colors.accent, fontSize: 13 }}>
        {cal.active ? `Trial running (${selected}) · about ${remaining}s left. Say “Hey ${assistantName}” now.` : cal.detail || `Ready · ${seconds}s trial`}
      </Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 18 }}>
        {cal.active ? (
          <Pressable testID="wake-trial-finish" accessibilityRole="button" accessibilityLabel="Finish and check wake trial" disabled={disabled} onPress={() => void run(finishWakeTrial)}>
            <Text style={[link, disabled && off]}>Finish / check now</Text>
          </Pressable>
        ) : (
          <Pressable testID="wake-trial-start" accessibilityRole="button" accessibilityLabel={`Start ${selected} wake trial`} disabled={disabled} onPress={() => void run(() => beginWakeTrial(selected))}>
            <Text style={[link, disabled && off]}>Start trial</Text>
          </Pressable>
        )}
        <Pressable testID="wake-false-wake" accessibilityRole="button" accessibilityLabel={`Record unwanted activation in ${selected} environment`} disabled={disabled} onPress={() => void run(() => markFalseWake(selected))}>
          <Text style={[link, disabled && off]}>It woke when I didn’t ask</Text>
        </Pressable>
      </View>
      {cal.active && selected === "screen-off" && <Text style={muted}>Lock the phone, speak, then unlock and tap Finish (or wait for the timer).</Text>}
      {!!error && <Text testID="wake-calibration-error" style={{ color: colors.destructive, fontSize: 13 }}>{error}</Text>}

      <View testID="wake-trial-results" style={{ gap: 4 }}>
        {ENVS.map(e => {
          const t = cal.trials.find(x => x.environment === e.id && x.assistantName === assistantName);
          return (
            <View key={e.id} testID={`wake-result-${e.id}`} style={{ flexDirection: "row" }}>
              <Text style={{ color: colors.foreground, fontSize: 13, flex: 1 }}>{e.label}</Text>
              <Text style={{ color: t ? colors.foreground : colors.mutedForeground, fontSize: 13, fontVariant: ["tabular-nums"] }}>
                {t ? `${t.hits} heard · ${t.misses} missed · ${t.falseWakes} false` : "No measurements"}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={muted}>
        Screen-off detection and reliability for your accent remain unverified until you record measurements here. False wakes are only those you mark.
      </Text>
      {cal.trials.length > 0 && (
        <Pressable testID="wake-trials-clear" accessibilityRole="button" accessibilityLabel="Clear wake measurements" disabled={disabled || cal.active} onPress={clear}>
          <Text style={{ color: colors.destructive, fontWeight: "600", paddingVertical: 8 }}>Clear measurements</Text>
        </Pressable>
      )}
    </View>
  );
}

export default WakeCalibrationSettings;
