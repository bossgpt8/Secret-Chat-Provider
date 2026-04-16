import { Ionicons, MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Brightness from "expo-brightness";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { NativeScreenLock } from "@/modules/NativeScreenLock";

interface Control {
  id: string;
  label: string;
  icon: string;
  iconSet: "ionicons" | "material" | "materialCommunity";
  category: string;
  toggle?: boolean;
  requiresNative?: boolean;
}

const CONTROLS: Control[] = [
  { id: "flashlight", label: "Flashlight", icon: "flashlight", iconSet: "materialCommunity", category: "Quick", toggle: true, requiresNative: true },
  { id: "wifi", label: "WiFi", icon: "wifi", iconSet: "ionicons", category: "Quick", toggle: true, requiresNative: true },
  { id: "bluetooth", label: "Bluetooth", icon: "bluetooth", iconSet: "ionicons", category: "Quick", toggle: true, requiresNative: true },
  { id: "lock", label: "Lock Phone", icon: "lock-closed", iconSet: "ionicons", category: "Quick", requiresNative: true },
  { id: "vol_up", label: "Volume Up", icon: "volume-high", iconSet: "ionicons", category: "Audio", requiresNative: true },
  { id: "vol_down", label: "Volume Down", icon: "volume-low", iconSet: "ionicons", category: "Audio", requiresNative: true },
  { id: "vol_mute", label: "Mute", icon: "volume-mute", iconSet: "ionicons", category: "Audio", toggle: true, requiresNative: true },
  { id: "bright_up", label: "Brighter", icon: "brightness-high", iconSet: "material", category: "Display", requiresNative: true },
  { id: "bright_down", label: "Dimmer", icon: "brightness-low", iconSet: "material", category: "Display", requiresNative: true },
];

const CATEGORIES = ["Quick", "Audio", "Display"];
// Delay unmount slightly so camera/torch state settles cleanly across devices.
const CAMERA_CLEANUP_DELAY_MS = 500;
const BRIGHTNESS_STEP = 0.25;
const MIN_BRIGHTNESS = 0.05;

function ControlIcon({ control, color, size }: { control: Control; color: string; size: number }) {
  if (control.iconSet === "ionicons") return <Ionicons name={control.icon as "mic"} size={size} color={color} />;
  if (control.iconSet === "material") return <MaterialIcons name={control.icon as "tune"} size={size} color={color} />;
  return <MaterialCommunityIcons name={control.icon as "flashlight"} size={size} color={color} />;
}

export default function ControlsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [torchOn, setTorchOn] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [busyControlId, setBusyControlId] = useState<string | null>(null);
  const cameraCleanupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    return () => {
      if (cameraCleanupTimeoutRef.current) {
        clearTimeout(cameraCleanupTimeoutRef.current);
      }
    };
  }, []);

  function scheduleCameraCleanup() {
    if (cameraCleanupTimeoutRef.current) {
      clearTimeout(cameraCleanupTimeoutRef.current);
    }
    cameraCleanupTimeoutRef.current = setTimeout(() => {
      setCameraReady(false);
      cameraCleanupTimeoutRef.current = null;
    }, CAMERA_CLEANUP_DELAY_MS);
  }

  function isSupportedControl(controlId: string): boolean {
    return controlId === "flashlight" || controlId === "bright_up" || controlId === "bright_down" || controlId === "lock";
  }

  async function handleControl(ctrl: Control) {
    if (busyControlId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusyControlId(ctrl.id);
    try {
      switch (ctrl.id) {
        case "flashlight": {
          if (!cameraPermission?.granted) {
            const { granted } = await requestCameraPermission();
            if (!granted) {
              setLastAction("Camera permission is required to control the flashlight.");
              return;
            }
          }
          const next = !torchOn;
          setTorchOn(next);
          if (next) setCameraReady(true);
          else scheduleCameraCleanup();
          setLastAction(`Flashlight turned ${next ? "ON" : "OFF"}.`);
          return;
        }
        case "bright_up":
        case "bright_down": {
          const current = await Brightness.getBrightnessAsync();
          const next = ctrl.id === "bright_up"
            ? Math.min(1, current + BRIGHTNESS_STEP)
            : Math.max(MIN_BRIGHTNESS, current - BRIGHTNESS_STEP);
          await Brightness.setBrightnessAsync(next);
          setLastAction(`Screen brightness set to ${Math.round(next * 100)}%.`);
          return;
        }
        case "lock": {
          if (!NativeScreenLock.isAvailable) {
            setLastAction("Screen lock control is only available on Android.");
            return;
          }
          const isAdmin = await NativeScreenLock.isAdminEnabled();
          if (!isAdmin) {
            await NativeScreenLock.requestAdmin();
            setLastAction("Please grant Device Administrator permission, then try again.");
            return;
          }
          const locked = await NativeScreenLock.lock().catch(() => false);
          setLastAction(locked ? "Locking your phone now." : "Could not lock phone. Check Device Administrator permission.");
          return;
        }
        default:
          setLastAction(`${ctrl.label} is not supported on standard Android app permissions.`);
      }
    } catch {
      setLastAction(`Failed to run ${ctrl.label.toLowerCase()}.`);
    } finally {
      setBusyControlId(null);
    }
  }

  function ControlButton({ ctrl }: { ctrl: Control }) {
    const isOn = ctrl.id === "flashlight" && torchOn;
    const isBusy = busyControlId === ctrl.id;
    const isSupported = isSupportedControl(ctrl.id);
    return (
      <Pressable
        style={[
          styles.ctrlBtn,
          { backgroundColor: isOn ? colors.primary : colors.card, borderColor: isOn ? colors.primary : colors.border },
        ]}
        disabled={isBusy}
        onPress={() => handleControl(ctrl)}
      >
        <View style={[styles.ctrlIconWrap, { backgroundColor: isOn ? "rgba(255,255,255,0.2)" : colors.secondary }]}>
          <ControlIcon control={ctrl} color={isOn ? "#fff" : colors.primary} size={22} />
        </View>
        <Text style={[styles.ctrlLabel, { color: isOn ? "#fff" : colors.foreground }]}>{ctrl.label}</Text>
        {ctrl.toggle && isSupported && (
          <View style={[styles.togglePill, { backgroundColor: isOn ? "rgba(255,255,255,0.25)" : colors.muted }]}>
            <Text style={[styles.toggleText, { color: isOn ? "#fff" : colors.mutedForeground }]}>
              {isOn ? "ON" : "OFF"}
            </Text>
          </View>
        )}
        {!isSupported && (
          <View style={[styles.togglePill, { backgroundColor: colors.muted }]}>
            <Text style={[styles.toggleText, { color: colors.mutedForeground }]}>Unsupported</Text>
          </View>
        )}
      </Pressable>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {cameraReady && Platform.OS !== "web" && (
        <CameraView
          style={{ position: "absolute", width: 0, height: 0, opacity: 0 }}
          facing="back"
          enableTorch={torchOn}
        />
      )}
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Controls</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad + 80 }]} showsVerticalScrollIndicator={false}>
        {/* Notice */}
        <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: colors.primary }]}>
          <Ionicons name="phone-portrait-outline" size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.noticeTitle, { color: colors.foreground }]}>Real actions + Android limits</Text>
            <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
              Flashlight, brightness, and lock are functional. WiFi, Bluetooth, and hardware volume toggles are restricted by Android for regular apps.
            </Text>
          </View>
        </View>

        {/* Status */}
        {lastAction && (
          <View style={[styles.actionFeedback, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
            <Text style={[styles.actionText, { color: colors.primary }]}>{lastAction}</Text>
          </View>
        )}

        {/* Voice commands tip */}
        <View style={[styles.voiceTip, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
          <Ionicons name="mic" size={14} color={colors.primary} />
          <Text style={[styles.voiceTipText, { color: colors.primary }]}>
            Say: &quot;Turn on flashlight&quot;, &quot;Set volume to 50%&quot;, &quot;Lock phone&quot;
          </Text>
        </View>

        {CATEGORIES.map((cat) => {
          const catControls = CONTROLS.filter((c) => c.category === cat);
          return (
            <View key={cat}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{cat}</Text>
              <View style={styles.grid}>
                {catControls.map((ctrl) => (
                  <ControlButton key={ctrl.id} ctrl={ctrl} />
                ))}
              </View>
            </View>
          );
        })}

        {/* Voice commands reference */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Voice Commands</Text>
        <View style={[styles.cmdCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {[
            { voice: "Turn on/off flashlight", action: "Toggle torch" },
            { voice: "Set volume to 50%", action: "Set media volume" },
            { voice: "Turn up/down volume", action: "Adjust by 10%" },
            { voice: "Make it brighter/dimmer", action: "Adjust brightness" },
            { voice: "Lock the phone", action: "Lock screen" },
            { voice: "Turn on/off WiFi", action: "Toggle WiFi" },
            { voice: "Turn on/off Bluetooth", action: "Toggle Bluetooth" },
          ].map(({ voice, action }) => (
            <View key={voice} style={[styles.cmdRow, { borderBottomColor: colors.border }]}>
              <Ionicons name="mic-outline" size={13} color={colors.primary} />
              <Text style={[styles.cmdVoice, { color: colors.foreground }]}>&quot;{voice}&quot;</Text>
              <Text style={[styles.cmdAction, { color: colors.mutedForeground }]}>→ {action}</Text>
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
  scroll: { padding: 16 },
  notice: { flexDirection: "row", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderLeftWidth: 3, marginBottom: 14 },
  noticeTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  noticeText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  actionFeedback: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 14 },
  actionText: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  voiceTip: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, marginBottom: 20 },
  voiceTipText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, marginTop: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  ctrlBtn: { width: "47%", padding: 14, borderRadius: 14, borderWidth: 1, alignItems: "center", gap: 8 },
  ctrlIconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  ctrlLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  togglePill: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: 8 },
  toggleText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  cmdCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  cmdRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  cmdVoice: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  cmdAction: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
