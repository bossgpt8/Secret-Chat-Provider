import { NativeModules, Platform } from "react-native";

const { ScreenLockModule } = NativeModules;

export const NativeScreenLock = {
  isAvailable: Platform.OS === "android" && !!ScreenLockModule,

  async isAdminEnabled(): Promise<boolean> {
    if (!ScreenLockModule) return false;
    return ScreenLockModule.isAdminEnabled();
  },

  async requestAdmin(): Promise<void> {
    if (!ScreenLockModule) return;
    return ScreenLockModule.requestAdmin();
  },

  async lock(): Promise<boolean> {
    if (!ScreenLockModule) return false;
    return ScreenLockModule.lockScreen();
  },
};
