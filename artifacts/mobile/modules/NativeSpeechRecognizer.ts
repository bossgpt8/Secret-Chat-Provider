import { NativeEventEmitter, NativeModules, Platform } from "react-native";

const { VoxSpeechRecognizerModule } = NativeModules;
const emitter =
  Platform.OS === "android" && VoxSpeechRecognizerModule
    ? new NativeEventEmitter(VoxSpeechRecognizerModule)
    : null;

export interface SpeechPartialEvent {
  text: string;
  level?: number;
}

export interface SpeechResultEvent {
  text: string;
}

export const NativeSpeechRecognizer = {
  isAvailable:
    Platform.OS === "android" &&
    !!VoxSpeechRecognizerModule,

  async start(language = "en-US", silenceMs = 900): Promise<boolean> {
    if (!VoxSpeechRecognizerModule) return false;
    return VoxSpeechRecognizerModule.startListening(language, silenceMs);
  },

  async stop(): Promise<void> {
    if (!VoxSpeechRecognizerModule) return;
    return VoxSpeechRecognizerModule.stopListening();
  },

  async cancel(): Promise<void> {
    if (!VoxSpeechRecognizerModule) return;
    return VoxSpeechRecognizerModule.cancelListening();
  },

  async isListening(): Promise<boolean> {
    if (!VoxSpeechRecognizerModule) return false;
    return VoxSpeechRecognizerModule.isListening();
  },

  onPartial(callback: (event: SpeechPartialEvent) => void): () => void {
    if (!emitter) return () => {};
    const sub = emitter.addListener("onVoxSpeechPartial", callback);
    return () => sub.remove();
  },

  onResult(callback: (event: SpeechResultEvent) => void): () => void {
    if (!emitter) return () => {};
    const sub = emitter.addListener("onVoxSpeechResult", callback);
    return () => sub.remove();
  },

  onError(callback: (event: { code?: number }) => void): () => void {
    if (!emitter) return () => {};
    const sub = emitter.addListener("onVoxSpeechError", callback);
    return () => sub.remove();
  },
};