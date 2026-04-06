import { Linking, NativeModules, Platform } from "react-native";

const { SystemPermissionsModule } = NativeModules;

// Package name must match app.json android.package
const PACKAGE = "com.boss.assistant";

async function openSystemIntent(action: string): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    // sendIntent is Android-only and not typed in the community typings
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (Linking as any).sendIntent(action, [{ key: "package", value: PACKAGE }]);
  } catch {
    // sendIntent may not accept extras for these system intents on some ROMs;
    // fall back to the no-extras form, then to generic app settings.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (Linking as any).sendIntent(action);
    } catch {
      await Linking.openSettings();
    }
  }
}

export const NativeSystemPermissions = {
  /** True only when the optional native SystemPermissionsModule is linked. */
  isAvailable: Platform.OS === "android" && !!SystemPermissionsModule,

  // ── Overlay (display over other apps) ─────────────────────────────────────

  async hasOverlayPermission(): Promise<boolean> {
    if (SystemPermissionsModule?.hasOverlayPermission) {
      return SystemPermissionsModule.hasOverlayPermission();
    }
    return false;
  },

  /**
   * Opens "Display over other apps" in Android system settings.
   * Uses the optional native module when available, otherwise falls back to
   * Linking.sendIntent / Linking.openSettings.
   */
  async requestOverlayPermission(): Promise<void> {
    if (SystemPermissionsModule?.requestOverlayPermission) {
      return SystemPermissionsModule.requestOverlayPermission();
    }
    await openSystemIntent("android.settings.action.MANAGE_OVERLAY_PERMISSION");
  },

  // ── Write Settings (modify system settings) ────────────────────────────────

  async hasWriteSettingsPermission(): Promise<boolean> {
    if (SystemPermissionsModule?.hasWriteSettingsPermission) {
      return SystemPermissionsModule.hasWriteSettingsPermission();
    }
    return false;
  },

  /**
   * Opens "Modify system settings" in Android system settings.
   * Uses the optional native module when available, otherwise falls back to
   * Linking.sendIntent / Linking.openSettings.
   */
  async requestWriteSettingsPermission(): Promise<void> {
    if (SystemPermissionsModule?.requestWriteSettingsPermission) {
      return SystemPermissionsModule.requestWriteSettingsPermission();
    }
    await openSystemIntent("android.settings.action.MANAGE_WRITE_SETTINGS");
  },
};
