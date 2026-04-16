import { NativeModules, Platform } from "react-native";

const { AccessibilityModule } = NativeModules;

export const NativeAccessibility = {
  /** True only when the optional native AccessibilityModule is linked (Android only). */
  isAvailable: Platform.OS === "android" && !!AccessibilityModule,

  /**
   * Returns true if ZenoAccessibilityService is currently enabled in system settings.
   */
  async isEnabled(): Promise<boolean> {
    if (!AccessibilityModule) return false;
    return AccessibilityModule.isEnabled();
  },

  /**
   * Opens the system Accessibility settings screen so the user can enable the service.
   */
  async requestEnable(): Promise<void> {
    if (!AccessibilityModule) return;
    return AccessibilityModule.requestEnable();
  },

  /**
   * Returns up to [limit] recent accessibility events captured by ZenoAccessibilityService.
   * Each event has: packageName, className, eventType, text, contentDescription.
   */
  async getRecentEvents(limit = 20): Promise<Array<{
    packageName: string;
    className: string;
    eventType: number;
    text: string;
    contentDescription: string;
  }>> {
    if (!AccessibilityModule) return [];
    return AccessibilityModule.getRecentEvents(limit);
  },
};
