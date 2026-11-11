import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { voiceAudioMode, synthesizePiperOrThrow, shouldDisablePiper } from "../artifacts/mobile/modules/voiceAudioPolicy.ts";

test("Android playback and recording retain background audio eligibility", () => {
  for (const recording of [true, false]) {
    const mode = voiceAudioMode("android", recording);
    assert.equal(mode.staysActiveInBackground, true);
    assert.equal(mode.allowsRecordingIOS, recording);
  }
});

test("iOS and web do not opt into unsupported background audio", () => {
  for (const platform of ["ios", "web"]) {
    assert.equal(voiceAudioMode(platform).staysActiveInBackground, false);
    assert.equal(voiceAudioMode(platform).allowsRecordingIOS, false);
  }
});

test("successful Piper synthesis keeps its WAV path", async () => {
  assert.equal(await synthesizePiperOrThrow(async () => "file:///speech.wav"), "file:///speech.wav");
});

test("native inference failures still disable Piper to protect the session", async () => {
  const native = Object.assign(new Error("Model could not load"), { code: "ERR_PIPER_MODEL" });
  await assert.rejects(synthesizePiperOrThrow(async () => { throw native; }), error => {
    assert.equal(error.message, native.message);
    assert.equal(error.code, native.code);
    return shouldDisablePiper(error);
  });
});

test("pronunciation failures retain Piper for the next phrase", async () => {
  const native = Object.assign(new Error("Unsupported phoneme"), { code: "ERR_PIPER_PRONUNCIATION" });
  await assert.rejects(synthesizePiperOrThrow(async () => { throw native; }), error => !shouldDisablePiper(error));
});

test("playback/focus errors never permanently change the selected voice", () => {
  const focus = new Error("AudioFocusNotAcquiredException: This experience is currently in the background");
  assert.equal(shouldDisablePiper(focus), false);
  assert.equal(shouldDisablePiper(new Error("Audio.Sound playback failed")), false);
  assert.equal(shouldDisablePiper(null), false);
});

test("all chat Expo audio paths use the shared policy", () => {
  const chat = readFileSync(new URL("../artifacts/mobile/app/(tabs)/index.tsx", import.meta.url), "utf8");
  assert.equal((chat.match(/Audio\.setAudioModeAsync\(/g) || []).length, 5);
  assert.equal((chat.match(/Audio\.setAudioModeAsync\(voiceAudioMode\(Platform\.OS/g) || []).length, 5);
  assert.match(chat, /if \(shouldDisablePiper\(error\)/);
});
