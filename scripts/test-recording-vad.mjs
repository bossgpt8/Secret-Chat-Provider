import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { SpeechSilenceDetector } from "../artifacts/mobile/modules/recordingVad.ts";

test("silence before the user starts speaking never auto-stops the recorder", () => {
  const detector = new SpeechSilenceDetector();
  for (const time of [0, 1000, 30000]) assert.equal(detector.update(0.001, time), false);
});

test("speech followed by a full quiet second ends the hands-free turn", () => {
  const detector = new SpeechSilenceDetector();
  assert.equal(detector.update(0.02, 100), false);
  assert.equal(detector.update(0.001, 200), false);
  assert.equal(detector.update(0.001, 1199), false);
  assert.equal(detector.update(0.001, 1200), true);
});

test("a pause during speech resets the trailing-silence timer", () => {
  const detector = new SpeechSilenceDetector();
  detector.update(0.02, 100);
  detector.update(0.001, 200);
  assert.equal(detector.update(0.015, 800), false);
  assert.equal(detector.update(0.001, 900), false);
  assert.equal(detector.update(0.001, 1899), false);
  assert.equal(detector.update(0.001, 1900), true);
});

test("near-silence without voice cannot trigger a false end of speech", () => {
  const detector = new SpeechSilenceDetector();
  assert.equal(detector.update(0, 0), false);
  assert.equal(detector.update(Number.NaN, 100), false);
  assert.equal(detector.update(-1, 200), false);
  assert.equal(detector.update(0, 10000), false);
});

test("offscreen callers still stop using the existing manual max-duration guard", () => {
  const chat = readFileSync(new URL("../artifacts/mobile/app/(tabs)/index.tsx", import.meta.url), "utf8");
  assert.match(chat, /if \(isCallModeRef\.current && silenceDetector\.update\(rms, Date\.now\(\)\)\) \{\s*void stopRecording\(\);/);
  assert.match(chat, /if \(elapsedSeconds >= 30\) stopRecording\(\)/);
});
