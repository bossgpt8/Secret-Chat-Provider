import { NativeModules, Platform } from "react-native";

const { AudioControlModule } = NativeModules;

export const NativeAudioSession = {
  isAvailable: Platform.OS === "android" && !!AudioControlModule,

  async beginVoiceSession(): Promise<boolean> {
    if (!AudioControlModule?.beginVoiceSession) return false;
    return AudioControlModule.beginVoiceSession();
  },

  async endVoiceSession(): Promise<void> {
    if (!AudioControlModule?.endVoiceSession) return;
    return AudioControlModule.endVoiceSession();
  },
};