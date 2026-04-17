import { NativeEventEmitter, NativeModules, Platform } from "react-native";

const { CallScreeningModule } = NativeModules;

const emitter =
  Platform.OS === "android" && CallScreeningModule
    ? new NativeEventEmitter(CallScreeningModule)
    : null;

export interface CallStateEvent {
  state: "ringing" | "offhook" | "idle" | "unknown";
  number: string;
}

export const NativeCallScreening = {
  isAvailable: Platform.OS === "android" && !!CallScreeningModule,

  async startListening(): Promise<boolean> {
    if (!CallScreeningModule) return false;
    return CallScreeningModule.startListening();
  },

  async stopListening(): Promise<boolean> {
    if (!CallScreeningModule) return false;
    return CallScreeningModule.stopListening();
  },

  async answerCall(): Promise<boolean> {
    if (!CallScreeningModule) return false;
    return CallScreeningModule.answerCall();
  },

  async declineCall(): Promise<boolean> {
    if (!CallScreeningModule) return false;
    return CallScreeningModule.declineCall();
  },

  onCallState(callback: (event: CallStateEvent) => void): () => void {
    if (!emitter) return () => {};
    const sub = emitter.addListener("onCallStateChanged", callback);
    return () => sub.remove();
  },
};
