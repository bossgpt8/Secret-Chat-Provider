import { NativeEventEmitter, NativeModules, Platform } from "react-native";

const { AccessibilityModule } = NativeModules;
const emitter =
  Platform.OS === "android" && AccessibilityModule
    ? new NativeEventEmitter(AccessibilityModule)
    : null;

export interface ZenoAccessibilityNotification {
  app: string;
  packageName: string;
  sender: string;
  text: string;
  timestamp: number;
  hasReply: boolean;
  source: "accessibility";
}

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

  async getRecentNotifications(limit = 20): Promise<ZenoAccessibilityNotification[]> {
    if (!AccessibilityModule?.getRecentNotificationEvents) return [];
    return AccessibilityModule.getRecentNotificationEvents(limit);
  },

  onNotification(callback: (n: ZenoAccessibilityNotification) => void): () => void {
    if (!emitter) return () => {};
    const sub = emitter.addListener("onZenoAccessibilityNotification", callback);
    return () => sub.remove();
  },

  async isBatteryOptimizationIgnored(): Promise<boolean> {
    if (!AccessibilityModule?.isBatteryOptimizationIgnored) return false;
    return AccessibilityModule.isBatteryOptimizationIgnored();
  },

  async requestIgnoreBatteryOptimization(): Promise<void> {
    if (!AccessibilityModule?.requestIgnoreBatteryOptimization) return;
    return AccessibilityModule.requestIgnoreBatteryOptimization();
  },
};
