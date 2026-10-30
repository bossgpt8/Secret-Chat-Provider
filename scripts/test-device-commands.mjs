// Run with Node 24: node --test scripts/test-device-commands.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { detectImmediateDeviceIntent as detect } from "../artifacts/mobile/modules/immediateCommands.ts";

test("torch on/off commands, including common spoken word orders, are local", () => {
  for (const text of ["on torch", "turn on the torch", "switch my flashlight on", "enable the flash light", "Hey Vox, can you please turn on my torch for me please."]) {
    assert.deepEqual(detect(text), { type: "flashlight_on" }, text);
  }
  for (const text of ["off torch", "turn off the flashlight", "switch torch off", "disable the torch"]) {
    assert.deepEqual(detect(text), { type: "flashlight_off" }, text);
  }
  assert.deepEqual(detect("toggle the torch"), { type: "flashlight_toggle" });
});

test("app commands resolve common aliases without needing an AI request", () => {
  for (const text of ["open WhatsApp", "launch the Whats App app", "please take me to WhatsApp now", "Vox, open WhatsApp!"]) {
    assert.deepEqual(detect(text), { type: "open_app", app: "WhatsApp" }, text);
  }
  assert.deepEqual(detect("open You Tube"), { type: "open_app", app: "YouTube" });
  assert.deepEqual(detect("open Chrome"), { type: "open_app", app: "Chrome" });
  assert.deepEqual(detect("open Settings"), { type: "open_app", app: "Settings" });
  assert.deepEqual(detect("open my banking app"), { type: "open_app", app: "banking" });
  assert.deepEqual(detect("open Notion"), { type: "open_app", app: "notion" });
});

test("a customized assistant name works without becoming a regex", () => {
  assert.deepEqual(detect("Hey Ava, open WhatsApp", "Ava"), { type: "open_app", app: "WhatsApp" });
  assert.deepEqual(detect("Hey V.x, open WhatsApp", "V.x"), { type: "open_app", app: "WhatsApp" });
});

test("simple brightness and volume commands stay on the device", () => {
  assert.deepEqual(detect("set brightness to 40 percent"), { type: "brightness_set", value: 40 });
  assert.deepEqual(detect("brightness 0%"), { type: "brightness_set", value: 0 });
  assert.deepEqual(detect("raise the brightness"), { type: "brightness_up" });
  assert.deepEqual(detect("lower screen brightness"), { type: "brightness_down" });
  assert.deepEqual(detect("brightness maximum"), { type: "brightness_max" });
  assert.deepEqual(detect("volume up"), { type: "volume_up" });
  assert.deepEqual(detect("turn down the volume"), { type: "volume_down" });
  assert.deepEqual(detect("mute my phone"), { type: "volume_mute" });
  assert.deepEqual(detect("mute the volume"), { type: "volume_mute" });
  assert.deepEqual(detect("unmute"), { type: "volume_unmute" });
  assert.equal(detect("brightness 500%"), null);
});

test("battery, lock and playback controls are deterministic local commands", () => {
  assert.deepEqual(detect("check my battery level"), { type: "battery_check" });
  assert.deepEqual(detect("lock my screen"), { type: "lock_screen" });
  assert.deepEqual(detect("vibrate my phone"), { type: "vibrate" });
  assert.deepEqual(detect("pause music"), { type: "media_pause" });
  assert.deepEqual(detect("next song"), { type: "media_next" });
});

test("questions, negation and compound instructions never accidentally trigger a local action", () => {
  for (const text of [
    "don't turn on the torch", "do not open WhatsApp", "never open WhatsApp",
    "how do I turn on the torch", "explain the torch", "what is WhatsApp",
    "open WhatsApp and send a message", "open WhatsApp after I finish",
    "if it is dark turn on the torch", "turn on the torch then turn it off",
    "send a message to Mum on WhatsApp", "/imagine open WhatsApp", "search for WhatsApp",
  ]) assert.equal(detect(text), null, text);
});
