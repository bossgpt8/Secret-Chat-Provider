import { NativeModules, Platform } from "react-native";

const { ScreenLockModule } = NativeModules;

export const NativeScreenLock = {
  isAvailable: Platform.OS === "android" && !!ScreenLockModule,

  async isAdminEnabled(): Promise<boolean> {
    if (!ScreenLockModule) return false;
    return ScreenLockModule.isAdminEnabled();
  },

  async requestAdmin(): Promise<"activation" | "security-settings" | "already-enabled"> {
    if (Platform.OS !== "android" || !ScreenLockModule?.requestAdmin) {
      throw new Error("Device Administrator requires a Vox Android build with screen-lock support. It is not available in Expo Go or the browser.");
    }
    // Older installed builds resolve null after launching the activation screen.
    return (await ScreenLockModule.requestAdmin()) ?? "activation";
  },

  async lock(): Promise<boolean> {
    if (!ScreenLockModule) return false;
    return ScreenLockModule.lockScreen();
  },
};
