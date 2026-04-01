import { NativeEventEmitter, NativeModules, Platform } from "react-native";

export interface ZenoNotification {
  key: string;
  app: string;
  packageName: string;
  sender: string;
  text: string;
  timestamp: number;
  hasReply: boolean;
}

const { NotificationListenerModule } = NativeModules;

const emitter =
  Platform.OS === "android" && NotificationListenerModule
    ? new NativeEventEmitter(NotificationListenerModule)
    : null;

export const NativeNotifications = {
  isAvailable: Platform.OS === "android" && !!NotificationListenerModule,

  async hasPermission(): Promise<boolean> {
    if (!NotificationListenerModule) return false;
    return NotificationListenerModule.hasPermission();
  },

  async requestPermission(): Promise<void> {
    if (!NotificationListenerModule) return;
    return NotificationListenerModule.requestPermission();
  },

  async getRecent(): Promise<ZenoNotification[]> {
    if (!NotificationListenerModule) return [];
    return NotificationListenerModule.getRecentNotifications();
  },

  async replyTo(key: string, text: string): Promise<boolean> {
    if (!NotificationListenerModule) return false;
    return NotificationListenerModule.replyToNotification(key, text);
  },

  async dismiss(key: string): Promise<void> {
    if (!NotificationListenerModule) return;
    return NotificationListenerModule.dismissNotification(key);
  },

  onNotification(callback: (n: ZenoNotification) => void): () => void {
    if (!emitter) return () => {};
    const sub = emitter.addListener("onZenoNotification", callback);
    return () => sub.remove();
  },
};
