import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const read = (file) => readFileSync(new URL(`../artifacts/mobile/plugins/${file}`, import.meta.url), "utf8");
const service = read("kotlin/VoxAccessibilityService.kt");
const callback = service.split("override fun onAccessibilityEvent")[1].split("override fun onInterrupt")[0];

// Source-contract checks, not device scrolling/voice-quality tests.
test("accessibility callback does not walk screen nodes on the UI thread", () => {
  assert.doesNotMatch(callback, /rootInActiveWindow|collectNodeText|getChild\(/);
  assert.match(service, /HandlerThread\("VoxScreenContext"\)/);
  assert.match(callback, /postDelayed\(captureScreen, 350L\)/);
  assert.match(service, /captureBusy\.compareAndSet\(false, true\)/);
});
test("own app events are ignored and notifications bypass screen snapshots", () => {
  assert.ok(callback.indexOf("if (pkg == packageName) return") < callback.indexOf("pendingCapture ="));
  assert.match(callback, /cb\.invoke\(n\)[\s\S]*return[\s\S]*pendingCapture =/);
});
test("screen snapshots have bounded work, password exclusion and node cleanup", () => {
  for (const contract of [
    /visited >= 128/, /sb\.length >= 6000/, /uptimeMillis\(\) >= deadline/,
    /depth > 12/, /current\.isPassword/, /root\.recycle\(\)/, /child\.recycle\(\)/,
    /removeCallbacks\(captureScreen\)/, /quitSafely\(\)/,
  ]) assert.match(service, contract);
});
test("both prebuild entrypoints ship the PCM converter and native writer uses it", () => {
  for (const entry of ["withNativeModules.js", "withNativeModules.ts"]) {
    assert.match(read(entry), /"VoxPiperAudio\.kt"/);
  }
  assert.match(read("kotlin/VoxPiperModule.kt"), /VoxPiperAudio\.toPcm16\(samples, sampleRate\)/);
});
