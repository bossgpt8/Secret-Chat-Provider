import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const chat = read("artifacts/mobile/app/(tabs)/index.tsx");
const start = chat.indexOf("async function applyFlashlight");
const end = chat.indexOf("\n  async function handleDeviceCommand", start);
const torchHandler = chat.slice(start, end);

test("Android flashlight control uses CameraManager before camera-view fallbacks", () => {
  const native = torchHandler.indexOf('if (Platform.OS === "android")');
  const systemTorch = torchHandler.indexOf("NativeSystemPermissions.setTorch(on)");
  const cameraView = torchHandler.indexOf("if (cameraRef.current)");
  assert.ok(native >= 0 && systemTorch > native && cameraView > systemTorch);
  assert.match(torchHandler, /Android build lacks direct flashlight control/);
  assert.doesNotMatch(torchHandler.slice(native, cameraView), /setCameraReady|cameraRef\.current/);
});

test("the vision camera is released after Android capture and torch restored separately", () => {
  assert.match(chat, /if \(Platform\.OS === "android"\) \{\s*\/\/ Release the vision camera/);
  assert.match(chat, /setCameraReady\(false\);[\s\S]*?setTimeout\(\(\) => \{[\s\S]*?NativeSystemPermissions\.setTorch\(true\)/);
  assert.match(chat, /enableTorch=\{Platform\.OS !== "android" && torchOn\}/);
});

test("native torch implementation uses Android CameraManager rather than camera preview", () => {
  const native = read("artifacts/mobile/plugins/kotlin/SystemPermissionsModule.kt");
  assert.match(native, /getSystemService\(Context\.CAMERA_SERVICE\) as CameraManager/);
  assert.match(native, /manager\.setTorchMode\(id, enabled\)/);
  assert.doesNotMatch(native, /CameraDevice|CameraCaptureSession|openCamera/);
});
