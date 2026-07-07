import { Linking, NativeModules, Platform } from "react-native";

const { SystemPermissionsModule } = NativeModules;

const PACKAGE = "com.boss.assistant";

async function openSystemIntent(action: string): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (Linking as any).sendIntent(action, [{ key: "package", value: PACKAGE }]);
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (Linking as any).sendIntent(action);
    } catch {
      await Linking.openSettings();
    }
  }
}

export interface VolumeState {
  current: number;
  max: number;
  muted: boolean;
}

export const NativeSystemPermissions = {
  isAvailable: Platform.OS === "android" && !!SystemPermissionsModule,

  // ── Overlay ────────────────────────────────────────────────────────────────

  async hasOverlayPermission(): Promise<boolean> {
    if (SystemPermissionsModule?.hasOverlayPermission) {
      return SystemPermissionsModule.hasOverlayPermission();
    }
    return false;
  },

  async requestOverlayPermission(): Promise<void> {
    if (SystemPermissionsModule?.requestOverlayPermission) {
      return SystemPermissionsModule.requestOverlayPermission();
    }
    await openSystemIntent("android.settings.action.MANAGE_OVERLAY_PERMISSION");
  },

  // ── Write Settings ─────────────────────────────────────────────────────────

  async hasWriteSettingsPermission(): Promise<boolean> {
    if (SystemPermissionsModule?.hasWriteSettingsPermission) {
      return SystemPermissionsModule.hasWriteSettingsPermission();
    }
    return false;
  },

  async requestWriteSettingsPermission(): Promise<void> {
    if (SystemPermissionsModule?.requestWriteSettingsPermission) {
      return SystemPermissionsModule.requestWriteSettingsPermission();
    }
    await openSystemIntent("android.settings.action.MANAGE_WRITE_SETTINGS");
  },

  // ── Volume (AudioManager — no special permission needed) ───────────────────

  async adjustVolume(direction: "up" | "down" | "mute" | "unmute"): Promise<VolumeState | null> {
    if (!SystemPermissionsModule?.adjustVolume) return null;
    return SystemPermissionsModule.adjustVolume(direction);
  },

  async getVolume(): Promise<VolumeState | null> {
    if (!SystemPermissionsModule?.getVolume) return null;
    return SystemPermissionsModule.getVolume();
  },

  // ── System Brightness (requires WRITE_SETTINGS — persists after leaving app) ─

  async getSystemBrightness(): Promise<number | null> {
    if (!SystemPermissionsModule?.getSystemBrightness) return null;
    return SystemPermissionsModule.getSystemBrightness();
  },

  async setSystemBrightness(value: number): Promise<number | null> {
    if (!SystemPermissionsModule?.setSystemBrightness) return null;
    return SystemPermissionsModule.setSystemBrightness(value);
  },
};
