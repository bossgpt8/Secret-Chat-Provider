/**
 * NativeOverlay — JS bridge for VoxOverlayService.
 *
 * The overlay is a native Android WindowManager bubble that persists even when
 * the app is backgrounded. Wake-word audio is owned separately by NativeWakeWord.
 *
 * Usage:
 *   await NativeOverlay.start()
 *   await NativeOverlay.stop()
 *   await NativeOverlay.setState("listening")
 *
 *   const unsub = NativeOverlay.onWakeWord(() => { ... })
 *   const unsub = NativeOverlay.onCommand((text) => { handle(text) })
 *   const unsub = NativeOverlay.onTap(() => { router.navigate('/') })
 */

import { NativeEventEmitter, NativeModules, Platform } from "react-native";

const { VoxOverlayModule } = NativeModules;

const emitter =
  Platform.OS === "android" && VoxOverlayModule
    ? new NativeEventEmitter(VoxOverlayModule)
    : null;

export type OverlayState = "idle" | "wake" | "listening" | "processing" | "speaking";

export const NativeOverlay = {
  isAvailable: Platform.OS === "android" && !!VoxOverlayModule,
  async startConversation(): Promise<boolean> {
    if (!VoxOverlayModule?.startConversation) return false;
    return VoxOverlayModule.startConversation();
  },
  async stopConversation(): Promise<void> { await VoxOverlayModule?.stopConversation?.(); },
  async setContent(caption: string, callActive: boolean): Promise<void> {
    await VoxOverlayModule?.setContent?.(caption, callActive);
  },
  onAction(callback: (action: string) => void): () => void {
    const sub = emitter?.addListener("onVoxOverlayAction", (e: { text?: string }) => callback(e.text || ""));
    return () => sub?.remove();
  },

  /** Start the foreground overlay service. Requires SYSTEM_ALERT_WINDOW permission. */
  async start(): Promise<void> {
    if (!VoxOverlayModule) return;
    return VoxOverlayModule.startService();
  },

  /** Stop the foreground overlay service (removes the bubble). */
  async stop(): Promise<void> {
    if (!VoxOverlayModule) return;
    return VoxOverlayModule.stopService();
  },

  /** Update bubble appearance without restarting the service. */
  async setState(state: OverlayState): Promise<void> {
    if (!VoxOverlayModule) return;
    return VoxOverlayModule.setState(state);
  },

  /** Returns true if the Android overlay (SYSTEM_ALERT_WINDOW) permission is granted. */
  async hasPermission(): Promise<boolean> {
    if (!VoxOverlayModule) return false;
    return VoxOverlayModule.hasOverlayPermission();
  },

  /** Opens the system screen to grant SYSTEM_ALERT_WINDOW permission. */
  async requestPermission(): Promise<void> {
    if (!VoxOverlayModule) return;
    return VoxOverlayModule.requestOverlayPermission();
  },

  async isRunning(): Promise<boolean> {
    if (!VoxOverlayModule) return false;
    return VoxOverlayModule.isServiceRunning();
  },

  // ── Event subscriptions ──────────────────────────────────────────────────

  /** Fires when the wake word is detected. Prepare to receive onCommand next. */
  onWakeWord(callback: () => void): () => void {
    if (!emitter) return () => {};
    const sub = emitter.addListener("onVoxWakeWord", callback);
    return () => sub.remove();
  },

  /**
   * Fires when the user has spoken a full command after the wake word.
   * `text` is already stripped of the wake-word prefix.
   */
  onCommand(callback: (text: string) => void): () => void {
    if (!emitter) return () => {};
    const sub = emitter.addListener("onVoxCommand", (e: { text?: string }) =>
      callback(e?.text ?? "")
    );
    return () => sub.remove();
  },

  /** Fires when the user taps the floating bubble. */
  onTap(callback: () => void): () => void {
    if (!emitter) return () => {};
    const sub = emitter.addListener("onVoxOverlayTap", callback);
    return () => sub.remove();
  },
};
