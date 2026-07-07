import { NativeModules, Platform } from "react-native";

const { AudioControlModule } = NativeModules;

type AudioStatus = {
  level: number;
  percent: number;
  max: number;
  muted: boolean;
};

export const NativeAudioControl = {
  isAvailable: Platform.OS === "android" && !!AudioControlModule,

  async getStatus(): Promise<AudioStatus | null> {
    if (!AudioControlModule) return null;
    return AudioControlModule.getStatus();
  },

  async adjust(direction: "up" | "down"): Promise<AudioStatus | null> {
    if (!AudioControlModule) return null;
    return AudioControlModule.adjust(direction);
  },

  async setMuted(muted: boolean): Promise<AudioStatus | null> {
    if (!AudioControlModule) return null;
    return AudioControlModule.setMuted(muted);
  },
};
