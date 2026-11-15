/**
 * NativeScreenCapture — JS bridge for Android screen sharing and screen questions.
 *
 * On Android this uses MediaProjection (requires user consent dialog) to
 * capture screen frames for questions about visible content.
 *
 * Usage:
 *   const ok = await NativeScreenCapture.startCapture()   // shows system dialog
 *   const jpeg = await NativeScreenCapture.captureFrame() // base64 JPEG
 *   await NativeScreenCapture.stopCapture()
 */

import { NativeModules, Platform } from "react-native";

const { VoxScreenCaptureModule } = NativeModules;

export const NativeScreenCapture = {
  isAvailable: Platform.OS === "android" && !!VoxScreenCaptureModule,

  /**
   * Shows Android's "Vox will start capturing your screen" consent dialog.
   * Resolves true once the capture service is running, rejects on denial.
   */
  async startCapture(): Promise<boolean> {
    if (!VoxScreenCaptureModule) return false;
    return VoxScreenCaptureModule.startCapture();
  },

  /** Stop capturing and dismiss the foreground service notification. */
  async stopCapture(): Promise<void> {
    if (!VoxScreenCaptureModule) return;
    return VoxScreenCaptureModule.stopCapture();
  },

  /** Returns true if a capture session is currently active. */
  async isCapturing(): Promise<boolean> {
    if (!VoxScreenCaptureModule) return false;
    return VoxScreenCaptureModule.isCapturing();
  },

  /**
   * Capture the current screen as a base64-encoded JPEG.
   * Returns null if capture has not been started yet.
   */
  async captureFrame(): Promise<string | null> {
    if (!VoxScreenCaptureModule) return null;
    return VoxScreenCaptureModule.captureFrame();
  },

};
