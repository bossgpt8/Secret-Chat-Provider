import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chat = readFileSync(
  new URL("../artifacts/mobile/app/(tabs)/index.tsx", import.meta.url),
  "utf8",
);
const controls = readFileSync(
  new URL("../artifacts/mobile/app/(tabs)/controls.tsx", import.meta.url),
  "utf8",
);
const torchModule = readFileSync(
  new URL("../artifacts/mobile/plugins/kotlin/SystemPermissionsModule.kt", import.meta.url),
  "utf8",
);

test("Controls flashlight uses system torch without mounting CameraView", () => {
  assert.match(controls, /NativeSystemPermissions\.setTorch\(next\)/);
  assert.doesNotMatch(controls, /CameraView|useCameraPermissions|enableTorch/);
});

test("Android chat flashlight uses torch mode without a camera-preview fallback", () => {
  const start = chat.indexOf("async function applyFlashlight");
  const end = chat.indexOf("\n  async function getApiBase", start);
  const flashlight = chat.slice(start, end);
  const androidStart = flashlight.indexOf('if (Platform.OS === "android")');
  const iosFallback = flashlight.indexOf("// Retain the Expo Camera path");
  const androidFlashlight = flashlight.slice(androidStart, iosFallback);
  assert.match(androidFlashlight, /NativeSystemPermissions\.setTorch\(on\)/);
  assert.doesNotMatch(androidFlashlight, /cameraRef\.current|setCameraReady/);
  assert.match(torchModule, /manager\.setTorchMode\(id, enabled\)/);
});

test("Hands-free schedules another listen after each assistant reply", () => {
  const start = chat.indexOf("function onTtsDone()");
  const end = chat.indexOf("\n  function scheduleCallModeListening", start);
  const ttsDone = chat.slice(start, end);
  assert.match(ttsDone, /isCallModeRef\.current[\s\S]*scheduleCallModeListening\(\)/);
  assert.match(chat, /function scheduleCallModeListening\(/);
  assert.match(chat, /recordingStartingRef\.current[\s\S]*scheduleCallModeListening\(350\)/);
});

test("Hands-free recovers a lost Android recognizer and can fall back online", () => {
  assert.match(chat, /NativeSpeechRecognizer\.isListening\(\)/);
  assert.match(chat, /enableNetworkSpeechFallback\(\)/);
  assert.match(chat, /!nativeSpeechFallbackRef\.current/);
  assert.match(chat, /Hands-free is staying on and switching to online audio transcription/);
});
