import { NativeModules, Platform } from "react-native";

const { MediaControlModule } = NativeModules;

export const NativeMediaControl = {
  isAvailable: Platform.OS === "android" && !!MediaControlModule,

  async play(): Promise<boolean> {
    if (!MediaControlModule) return false;
    return MediaControlModule.play();
  },

  async pause(): Promise<boolean> {
    if (!MediaControlModule) return false;
    return MediaControlModule.pause();
  },

  async playPause(): Promise<boolean> {
    if (!MediaControlModule) return false;
    return MediaControlModule.playPause();
  },

  async next(): Promise<boolean> {
    if (!MediaControlModule) return false;
    return MediaControlModule.next();
  },

  async previous(): Promise<boolean> {
    if (!MediaControlModule) return false;
    return MediaControlModule.previous();
  },

  async stop(): Promise<boolean> {
    if (!MediaControlModule) return false;
    return MediaControlModule.stop();
  },
};
