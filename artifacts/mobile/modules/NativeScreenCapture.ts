/**
 * NativeScreenCapture — JS bridge for screen capture + AI game assist.
 *
 * On Android this uses MediaProjection (requires user consent dialog) to
 * capture frames, and the Accessibility Service to inject tap/swipe gestures.
 *
 * Usage:
 *   const ok = await NativeScreenCapture.startCapture()   // shows system dialog
 *   const jpeg = await NativeScreenCapture.captureFrame() // base64 JPEG
 *   await NativeScreenCapture.performGesture(points, 300, sw, sh)
 *   await NativeScreenCapture.stopCapture()
 */

import { NativeModules, Platform } from "react-native";

const { VoxScreenCaptureModule } = NativeModules;

export type GesturePoint = { x: number; y: number }; // normalized 0–1

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

  /**
   * Inject a swipe/drag gesture via Android Accessibility Service.
   *
   * @param points      Array of {x, y} with normalized 0–1 coordinates.
   *                    x=0 → left edge, x=1 → right edge.
   *                    y=0 → top edge,  y=1 → bottom edge.
   * @param durationMs  How long the stroke lasts — 200ms for a fast tap-drag,
   *                    up to 600ms for a slow deliberate swipe.
   * @param screenW     Screen pixel width  (Dimensions.get('screen').width).
   * @param screenH     Screen pixel height (Dimensions.get('screen').height).
   */
  async performGesture(
    points: GesturePoint[],
    durationMs: number,
    screenW: number,
    screenH: number
  ): Promise<boolean> {
    if (!VoxScreenCaptureModule) return false;
    return VoxScreenCaptureModule.performGesture(points, durationMs, screenW, screenH);
  },
};
