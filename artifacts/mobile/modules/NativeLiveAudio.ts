import { NativeEventEmitter, NativeModules, Platform } from "react-native";

const native = NativeModules.VoxLiveAudioModule;
const emitter = Platform.OS === "android" && native ? new NativeEventEmitter(native) : null;
export const NativeLiveAudio = {
  isAvailable: Platform.OS === "android" && Boolean(native),
  async start(): Promise<void> {
    if (!native) throw new Error("Gemini Live requires the updated installed Android APK, not Expo Go.");
    await native.start();
  },
  async stop(): Promise<void> { await native?.stop(); },
  async interrupt(): Promise<void> { await native?.interrupt(); },
  async playChunk(data: string): Promise<void> { await native.playChunk(data); },
  async setMuted(value: boolean): Promise<void> { await native?.setMuted(value); },
  onInput(callback: (value: { data: string; level: number }) => void) {
    const subscription = emitter?.addListener("onVoxLiveInput", callback);
    return () => subscription?.remove();
  },
  onPlayback(callback: (value: { playing: boolean }) => void) {
    const subscription = emitter?.addListener("onVoxLivePlayback", callback);
    return () => subscription?.remove();
  },
  onError(callback: (value: { message: string }) => void) {
    const subscription = emitter?.addListener("onVoxLiveError", callback);
    return () => subscription?.remove();
  },
};
