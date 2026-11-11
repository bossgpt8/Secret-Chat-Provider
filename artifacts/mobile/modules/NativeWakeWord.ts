import { NativeEventEmitter, NativeModules, Platform } from "react-native";
import { wakePhraseForName } from "./wakePhrase";

const native = Platform.OS === "android" ? NativeModules.VoxWakeModule : null;
const events = native ? new NativeEventEmitter(native) : null;
export interface WakeStatus {
  enabled: boolean;
  running: boolean;
  state: "starting" | "listening" | "paused" | "error" | "stopped";
  message: string;
}
const unavailable: WakeStatus = {
  enabled: false, running: false, state: "stopped",
  message: "Hey Vox requires the updated Android APK. It is not available in Expo Go, browsers, or iOS.",
};

export const NativeWakeWord = {
  isAvailable: !!native,
  async status(): Promise<WakeStatus> { return native ? native.getStatus() : unavailable; },
  async start(): Promise<void> {
    if (!native) throw new Error(unavailable.message);
    await native.start();
  },
  async stop(): Promise<void> { if (native) await native.stop(); },
  async setName(name: string): Promise<void> { if (native) await native.setName(name); },
  async startForName(name: string): Promise<void> {
    wakePhraseForName(name);
    await this.setName(name);
    await this.start();
  },
  async setPaused(paused: boolean, reason = "voice"): Promise<void> {
    if (native) await native.setPaused(reason, paused);
  },
  onWake(callback: () => void): () => void {
    const sub = events?.addListener("onVoxLocalWake", (event: { detectedAtMs?: number }) => {
      // Android can suspend JS. Do not start a stale conversation after waking.
      if (typeof event.detectedAtMs === "number" && Date.now() - event.detectedAtMs < 10000) callback();
    });
    return () => sub?.remove();
  },
  onStatus(callback: (status: WakeStatus) => void): () => void {
    const sub = events?.addListener("onVoxWakeStatus", callback);
    return () => sub?.remove();
  },
};
